/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { RelationshipType } from "@vencord/discord-types/enums";
import { FluxDispatcher, FriendsStore, GuildMemberStore, GuildStore, RelationshipStore, Toasts, UserStore, UserUtils } from "@webpack/common";

const DS_KEY = "FakeFriends_state";

export type FakeFriendMode = "pending" | "accepted";
export type FakeFriendState = FakeFriendMode;
export type ImportProgress = (message: string) => void;

export const fakeState = new Map<string, FakeFriendState>();

let origGetRelType: ((userId: string) => number) | null = null;
let getRawRelationshipsMap: (() => Map<string, number>) | null = null;

export function bindGetRawRelationshipsMap(fn: () => Map<string, number>) {
    getRawRelationshipsMap = fn;
}

const QUERY_DELAY_MS = 400;
const MAX_LIGHT_QUERIES = 6;
const CANDIDATE_BUFFER = 1.35;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function bindOrigGetRelType(fn: (userId: string) => number) {
    if (!origGetRelType) origGetRelType = fn;
}

export async function persistState() {
    await DataStore.set(DS_KEY, Object.fromEntries(fakeState));
}

export async function loadState() {
    const saved = await DataStore.get<Record<string, FakeFriendState>>(DS_KEY);
    fakeState.clear();
    if (!saved) return;

    for (const [id, state] of Object.entries(saved)) {
        if (state === "accepted" || state === "pending") {
            fakeState.set(id, state);
        }
    }
}

function makeUserPayload(user: any) {
    return {
        id: user.id,
        username: user.username,
        global_name: user.globalName ?? user.username,
        avatar: user.avatar ?? null,
        discriminator: user.discriminator ?? "0",
        public_flags: user.publicFlags ?? 0,
        flags: user.flags ?? 0,
        bot: false,
    };
}

function isBot(user: any): boolean {
    if (!user) return true;
    if (user.bot === true) return true;
    if ((user.publicFlags ?? 0) & (1 << 19)) return true;
    return false;
}

function dispatchRelationship(user: any, type: RelationshipType) {
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_UPDATE",
        relationship: { id: user.id, type, nickname: null, since: new Date().toISOString(), user: makeUserPayload(user) },
    });
}

function dispatchPendingRequest(user: any) {
    // RELATIONSHIP_UPDATE (not ADD) — ADD was treated as friend in newer Discord builds
    FluxDispatcher.dispatch({
        type: "RELATIONSHIP_UPDATE",
        relationship: {
            id: user.id,
            type: RelationshipType.INCOMING_REQUEST,
            nickname: null,
            since: new Date().toISOString(),
            user: makeUserPayload(user),
        },
    });
}

/** Ensure Friends tab can resolve avatar/username for fake entries. */
export function cacheUserForFriends(user: any) {
    if (!user?.id || UserStore.getUser(user.id)) return;

    FluxDispatcher.dispatch({
        type: "USER_UPDATE",
        user: {
            id: user.id,
            username: user.username,
            global_name: user.globalName ?? user.global_name ?? user.username,
            avatar: user.avatar ?? null,
            discriminator: user.discriminator ?? "0",
            public_flags: user.publicFlags ?? user.public_flags ?? 0,
            bot: false,
        },
    });
}

/** Write fake entries into the live RelationshipStore map. */
export function applyFakeRelationshipsToStore() {
    const store = RelationshipStore as { getMutableRelationships?: () => Map<string, number>; };
    const map = getRawRelationshipsMap?.() ?? store.getMutableRelationships?.();
    if (!map) return;

    for (const [id, state] of fakeState) {
        if (state === "pending") {
            map.set(id, RelationshipType.INCOMING_REQUEST);
        } else if (state === "accepted") {
            map.set(id, RelationshipType.FRIEND);
        }
    }
}

/** Push fake entries into RelationshipStore and refresh Friends UI. */
export function syncFakeRelationships() {
    try {
        applyFakeRelationshipsToStore();
        (RelationshipStore as { emitChange?: () => void; }).emitChange?.();
        (FriendsStore as { emitChange?: () => void; })?.emitChange?.();
    } catch { /* noop */ }
}

export async function addDirectFriend(user: any, opts?: { persist?: boolean; sync?: boolean; }) {
    fakeState.set(user.id, "accepted");
    if (opts?.persist !== false) await persistState();
    cacheUserForFriends(user);
    dispatchRelationship(user, RelationshipType.FRIEND);
    if (opts?.sync !== false) syncFakeRelationships();
}

export async function addPendingRequest(user: any, opts?: { persist?: boolean; sync?: boolean; }) {
    fakeState.set(user.id, "pending");
    if (opts?.persist !== false) await persistState();
    cacheUserForFriends(user);
    dispatchPendingRequest(user);
    if (opts?.sync !== false) syncFakeRelationships();
}

async function loadUser(userId: string): Promise<any | null> {
    const cached = UserStore.getUser(userId);
    if (cached) return cached;
    try { await UserUtils.getUser(userId); } catch { }
    return UserStore.getUser(userId) ?? null;
}

function shuffle<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function collectCandidates(guildIds: string[], into: Set<string>) {
    for (const guildId of guildIds) {
        for (const id of getGuildCandidates(guildId)) {
            into.add(id);
        }
    }
}

/** Lightweight member fetch — avoids gateway rate limits from full alphabet scans. */
export async function fetchGuildMembersLight(guildId: string, maxQueries = MAX_LIGHT_QUERIES): Promise<void> {
    const queries = ["", ...shuffle("abcdefghijklmnopqrstuvwxyz0123456789".split("")).slice(0, maxQueries - 1)];

    for (const q of queries) {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildIds: [guildId],
            query: q,
            limit: 100,
        });
        await sleep(QUERY_DELAY_MS);
    }

    await sleep(500);
}

/** @deprecated Prefer fetchGuildMembersLight — kept for single-guild context menu flows. */
export async function fetchAllGuildMembers(guildId: string): Promise<void> {
    await fetchGuildMembersLight(guildId, 10);
}

export function getGuildCandidates(guildId: string): string[] {
    const me = UserStore.getCurrentUser()?.id;
    const memberIds: string[] = (GuildMemberStore.getMemberIds(guildId) as string[]) ?? [];
    const realRelNone = (id: string) => {
        const fn = origGetRelType ?? ((uid: string) => (RelationshipStore as any).getRelationshipType(uid));
        return fn.call(RelationshipStore, id) === RelationshipType.NONE;
    };

    return memberIds.filter(id => {
        if (id === me || fakeState.has(id) || !realRelNone(id)) return false;
        const cached = UserStore.getUser(id) as any;
        if (cached && isBot(cached)) return false;
        return true;
    });
}

async function gatherCandidates(
    count: number,
    onProgress?: ImportProgress,
): Promise<string[]> {
    const guilds = shuffle(Object.values(GuildStore.getGuilds?.() ?? {}) as { id: string; }[]);
    if (!guilds.length) throw new Error("Keine Server gefunden.");

    const needed = Math.ceil(count * CANDIDATE_BUFFER);
    const candidateSet = new Set<string>();

    onProgress?.("Suche in gecachten Mitgliederlisten…");
    collectCandidates(guilds.map(g => g.id), candidateSet);

    if (candidateSet.size < needed) {
        onProgress?.(`Lade Mitglieder nach (${candidateSet.size}/${needed})…`);

        for (let i = 0; i < guilds.length && candidateSet.size < needed; i++) {
            const guild = guilds[i];
            onProgress?.(`Server ${i + 1}/${guilds.length} — ${candidateSet.size} Kandidaten…`);
            await fetchGuildMembersLight(guild.id);
            collectCandidates([guild.id], candidateSet);
        }
    }

    const candidates = [...candidateSet];
    if (!candidates.length) throw new Error("Keine passenden Mitglieder gefunden.");
    return candidates;
}

export async function importFromAllServers(
    count: number,
    mode: FakeFriendMode,
    onProgress?: ImportProgress,
): Promise<number> {
    const candidates = await gatherCandidates(count, onProgress);
    const shuffled = shuffle(candidates);
    const selected = shuffled.slice(0, Math.min(count, shuffled.length));

    onProgress?.(`Importiere ${selected.length} ${mode === "accepted" ? "Fake-Freunde" : "Fake-Anfragen"}…`);

    let added = 0;
    const USER_BATCH = 5;
    const defer = { persist: false as const, sync: false as const };

    for (let i = 0; i < selected.length; i += USER_BATCH) {
        const batch = selected.slice(i, i + USER_BATCH);

        for (const id of batch) {
            const user = await loadUser(id);
            if (!user || isBot(user)) continue;

            if (mode === "accepted") await addDirectFriend(user, defer);
            else await addPendingRequest(user, defer);
            added++;

            if (added % 20 === 0) {
                onProgress?.(`${added}/${selected.length} hinzugefügt…`);
                await sleep(32);
            }
        }

        await sleep(120);
    }

    await persistState();
    syncFakeRelationships();

    Toasts.show({
        message: `${added} Fake-${mode === "accepted" ? "Freunde" : "Anfragen"} importiert`,
        type: Toasts.Type.SUCCESS,
        id: Toasts.genId(),
    });

    return added;
}

export function getFakeFriendEntries() {
    return [...fakeState.entries()].map(([id, state]) => {
        const user = UserStore.getUser(id) as any;
        const name = user?.globalName ?? user?.username ?? id;
        return { id, state, name };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function removeFakeFriendById(userId: string) {
    if (!fakeState.has(userId)) return;
    fakeState.delete(userId);
    await persistState();
    try {
        FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id: userId } });
    } catch { /* noop */ }
    syncFakeRelationships();
}

export async function removeAllFakeFriends(): Promise<number> {
    const ids = [...fakeState.keys()];
    if (!ids.length) return 0;

    for (const id of ids) {
        fakeState.delete(id);
        try {
            FluxDispatcher.dispatch({ type: "RELATIONSHIP_REMOVE", relationship: { id } });
        } catch { /* noop */ }
    }

    await persistState();
    syncFakeRelationships();
    return ids.length;
}

export async function reapplyFakeStates() {
    for (const [userId, state] of fakeState) {
        try {
            const user = await loadUser(userId);
            if (!user) continue;

            cacheUserForFriends(user);

            if (state === "accepted") {
                dispatchRelationship(user, RelationshipType.FRIEND);
            } else if (state === "pending") {
                dispatchPendingRequest(user);
            }

            await sleep(30);
        } catch { /* noop */ }
    }

    syncFakeRelationships();
}
