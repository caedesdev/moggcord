/*
 * Equicord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { Modals, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { RelationshipType } from "@vencord/discord-types/enums";
import { findByProps } from "@webpack";
import { ChannelStore, GuildMemberStore, Menu, React, RelationshipStore, FluxDispatcher, Toasts, UserStore, UserUtils } from "@webpack/common";

import { FakeFriendsSettings } from "./settingsPanel";
import {
    addDirectFriend,
    addPendingRequest,
    bindOrigGetRelType,
    bindGetRawRelationshipsMap,
    fakeState,
    fetchAllGuildMembers,
    getGuildCandidates,
    loadState,
    persistState,
    reapplyFakeStates,
    removeFakeFriendById,
    syncFakeRelationships,
} from "./state";

import "./style.css";

const FAKE_DM_PHRASES = [
    "hey don't you have discord?", "hello!", "hi :)", "yo", "good morning!",
    "hey, do we know each other?", "what are you playing right now?", "are you active?",
    "hey what's your server?", "hi, can we talk?", "hello",
    "wsh", "hey you!", "did you see the last thing on the server?",
    "i hadn't seen you there!", "good evening!", "want to play together?",
    "hey are you free?", "gg on the server!", "hi i have a question",
    "yo are you there?", "hello, new here", "hey :)", "wsh bro",
    "yes it's me", "where are you from?", "how old are you?",
    "hey, cool nickname", "hi, do you stream?", "yo, we follow each other?",
];

// ── Patch RelationshipStore ────────────────────────────────────────────────────
let origGetRelType: Function | null = null;
let origIsFriend: Function | null = null;
let origGetFriendIDs: Function | null = null;
let origGetMutable: Function | null = null;
let origGetSince: Function | null = null;
let origGetRelationships: Function | null = null;

function patchStore() {
    const store = RelationshipStore as any;
    if (typeof store.getRelationshipType === "function") {
        if (!origGetRelType) {
            origGetRelType = store.getRelationshipType;
            bindOrigGetRelType(store.getRelationshipType);
        }
        store.getRelationshipType = function (userId: string) {
            const s = fakeState.get(userId);
            if (s === "pending") return RelationshipType.INCOMING_REQUEST;
            if (s === "accepted") return RelationshipType.FRIEND;
            return origGetRelType!.call(this, userId);
        };
    }
    if (!origIsFriend && typeof store.isFriend === "function") {
        origIsFriend = store.isFriend;
        store.isFriend = function (userId: string) {
            if (fakeState.get(userId) === "pending") return false;
            if (fakeState.get(userId) === "accepted") return true;
            return origIsFriend!.call(this, userId);
        };
    }
    if (!origGetFriendIDs && typeof store.getFriendIDs === "function") {
        origGetFriendIDs = store.getFriendIDs;
        store.getFriendIDs = function () {
            const real: string[] = origGetFriendIDs!.call(this);
            const extra = [...fakeState.entries()].filter(([, s]) => s === "accepted").map(([id]) => id);
            return [...new Set([...real, ...extra])];
        };
    }
    if (!origGetMutable && typeof store.getMutableRelationships === "function") {
        origGetMutable = store.getMutableRelationships;
        bindGetRawRelationshipsMap(() => origGetMutable!.call(RelationshipStore));
        store.getMutableRelationships = function () {
            const real = origGetMutable!.call(this);
            for (const [id, s] of fakeState) {
                if (s === "accepted") real.set(id, RelationshipType.FRIEND);
                else if (s === "pending") real.set(id, RelationshipType.INCOMING_REQUEST);
            }
            return real;
        };
    }
    if (!origGetRelationships && typeof store.getRelationships === "function") {
        origGetRelationships = store.getRelationships;
        store.getRelationships = function () {
            const rels = { ...origGetRelationships!.call(this) };
            for (const [id, s] of fakeState) {
                if (s === "pending") rels[id] = RelationshipType.INCOMING_REQUEST;
                else if (s === "accepted") rels[id] = RelationshipType.FRIEND;
            }
            return rels;
        };
    }
    if (!origGetSince && typeof store.getSince === "function") {
        origGetSince = store.getSince;
        store.getSince = function (userId: string) {
            if (fakeState.has(userId)) {
                return origGetSince!.call(this, userId) ?? new Date().toISOString();
            }
            return origGetSince!.call(this, userId);
        };
    }
}

function unpatchStore() {
    const store = RelationshipStore as any;
    if (origGetRelType) { store.getRelationshipType = origGetRelType; origGetRelType = null; }
    if (origIsFriend) { store.isFriend = origIsFriend; origIsFriend = null; }
    if (origGetFriendIDs) { store.getFriendIDs = origGetFriendIDs; origGetFriendIDs = null; }
    if (origGetMutable) { store.getMutableRelationships = origGetMutable; origGetMutable = null; }
    if (origGetRelationships) { store.getRelationships = origGetRelationships; origGetRelationships = null; }
    if (origGetSince) { store.getSince = origGetSince; origGetSince = null; }
}

// ── Patch acceptFriend ─────────────────────────────────────────────────────────
let origAccept: Function | null = null;

function patchAcceptFriend() {
    try {
        const RA = findByProps("acceptFriend", "addFriend") as any;
        if (!RA || origAccept) return;
        origAccept = RA.acceptFriend;
        RA.acceptFriend = async function (userId: string, ...args: any[]) {
            if (fakeState.get(userId) === "pending") {
                fakeState.set(userId, "accepted");
                await persistState();
                FluxDispatcher.dispatch({
                    type: "RELATIONSHIP_UPDATE",
                    relationship: { id: userId, type: RelationshipType.FRIEND, nickname: null, since: new Date().toISOString() }
                });
                syncFakeRelationships();
                return;
            }
            return origAccept!.call(this, userId, ...args);
        };
    } catch (e) { console.warn("[FF] patchAcceptFriend:", e); }
}

function unpatchAcceptFriend() {
    try {
        if (!origAccept) return;
        const RA = findByProps("acceptFriend", "addFriend") as any;
        if (RA) RA.acceptFriend = origAccept;
        origAccept = null;
    } catch { }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
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

function makeSnowflake(): string {
    const ts = BigInt(Date.now() - 1420070400000);
    return String((ts << 22n) | BigInt(Math.floor(Math.random() * 0xFFFFF)));
}

// ── Fake DM ────────────────────────────────────────────────────────────────────

function getChannelClass(): any {
    try {
        const allChannels = (ChannelStore as any).getSortedPrivateChannels?.() ?? [];
        const real = allChannels.find((c: any) => c.type === 1);
        if (real) return real.constructor;
    } catch { }
    return null;
}

function buildRealDMChannel(user: any): any {
    const ChannelClass = getChannelClass();
    const msgId = makeSnowflake();
    const channelId = makeSnowflake();

    const raw = {
        id: channelId,
        type: 1,
        flags: 0,
        last_message_id: msgId,
        last_pin_timestamp: null,
        recipients: [makeUserPayload(user)],
        recipient_ids: [user.id],
        is_spam: false,
        is_message_request: false,
        is_message_request_timestamp: null,
    };

    if (ChannelClass) {
        try {
            return { instance: new ChannelClass(raw), msgId, channelId };
        } catch { }
    }

    const fallback = Object.assign(Object.create({
        getGuildId() { return null; },
        isPrivate() { return true; },
        isDM() { return true; },
        isGroupDM() { return false; },
        isMultiUserDM() { return false; },
        isSystemDM() { return false; },
        isGuildVoice() { return false; },
        isGuildStageVoice() { return false; },
        isGuildPublicThread() { return false; },
        isGuildPrivateThread() { return false; },
        isGuildNewsThread() { return false; },
        isThread() { return false; },
        isArchivedLockedThread() { return false; },
        isManaged() { return false; },
        isCategory() { return false; },
        isDirectory() { return false; },
        isAnnouncement() { return false; },
        isListenModeCapable() { return false; },
        isForumChannel() { return false; },
        isMediaPostChannel() { return false; },
        isBroadcastChannel() { return false; },
        hasActiveThreads() { return false; },
        canHaveInvite() { return false; },
        canHaveWebhooks() { return false; },
        isEmojiPickerDisabled() { return false; },
        computeLurkerPermissionsAllowList() { return null; },
        toString() { return `<#${(this as any).id}>`; },
    }), {
        id: channelId,
        type: 1,
        flags: 0,
        guild_id: null,
        guildId: null,
        lastMessageId: msgId,
        lastPinTimestamp: null,
        name: "",
        icon: null,
        ownerId: null,
        applicationId: null,
        recipients: [user.id],
        recipientIDs: [user.id],
        rawRecipients: [makeUserPayload(user)],
        nicks: {},
        isSpam: false,
        isMessageRequest: false,
        isMessageRequestTimestamp: null,
        blockedUserWarningDismissed: false,
        safetyWarnings: null,
        permissionOverwrites: {},
        bitrate: 0,
        userLimit: 0,
        rateLimitPerUser: 0,
        rtcRegion: null,
        videoQualityMode: 1,
        defaultThreadRateLimitPerUser: 0,
        nsfw: false,
        topic: null,
        position: 0,
        parentId: null,
        defaultAutoArchiveDuration: null,
        member: null,
        memberCount: null,
        messageCount: null,
        totalMessageSent: null,
        threadMetadata: null,
        defaultReactionEmoji: null,
        availableTags: null,
        appliedTags: null,
        flags_: 0,
    });

    return { instance: fallback, msgId, channelId };
}

const fakeDMChannelObjects = new Map<string, any>();
let origGetChannel: Function | null = null;
let origGetDMFromUserId: Function | null = null;
let origGetSorted: Function | null = null;

function patchChannelStore() {
    const store = ChannelStore as any;

    if (!origGetChannel && typeof store.getChannel === "function") {
        origGetChannel = store.getChannel;
        store.getChannel = function (id: string) {
            if (fakeDMChannelObjects.has(id)) return fakeDMChannelObjects.get(id);
            return origGetChannel!.call(this, id);
        };
    }

    if (!origGetDMFromUserId && typeof store.getDMFromUserId === "function") {
        origGetDMFromUserId = store.getDMFromUserId;
        store.getDMFromUserId = function (userId: string) {
            for (const [cid, ch] of fakeDMChannelObjects) {
                if ((ch.recipientIDs ?? []).includes(userId)) return cid;
            }
            return origGetDMFromUserId!.call(this, userId);
        };
    }

    if (!origGetSorted && typeof store.getSortedPrivateChannels === "function") {
        origGetSorted = store.getSortedPrivateChannels;
        store.getSortedPrivateChannels = function () {
            const real = origGetSorted!.call(this) ?? [];
            return [...real, ...fakeDMChannelObjects.values()];
        };
    }
}

function unpatchChannelStore() {
    const store = ChannelStore as any;
    if (origGetChannel) { store.getChannel = origGetChannel; origGetChannel = null; }
    if (origGetDMFromUserId) { store.getDMFromUserId = origGetDMFromUserId; origGetDMFromUserId = null; }
    if (origGetSorted) { store.getSortedPrivateChannels = origGetSorted; origGetSorted = null; }
    fakeDMChannelObjects.clear();
}

async function sendFakeDM(user: any) {
    const me = UserStore.getCurrentUser() as any;
    if (!me) return;

    const phrase = FAKE_DM_PHRASES[Math.floor(Math.random() * FAKE_DM_PHRASES.length)];

    let channelId: string | null = (ChannelStore as any).getDMFromUserId?.(user.id) ?? null;

    if (!channelId) {
        const { instance, msgId: _m, channelId: cid } = buildRealDMChannel(user);
        channelId = cid;
        fakeDMChannelObjects.set(cid, instance);

        FluxDispatcher.dispatch({ type: "CHANNEL_OPEN", channelId: cid });
        await new Promise(r => setTimeout(r, 30));
    }

    const msgId = makeSnowflake();

    FluxDispatcher.dispatch({
        type: "MESSAGE_CREATE",
        channelId: channelId!,
        message: {
            id: msgId,
            type: 0,
            content: phrase,
            channel_id: channelId!,
            author: makeUserPayload(user),
            attachments: [],
            embeds: [],
            mentions: [],
            mention_roles: [],
            mention_channels: [],
            pinned: false,
            mention_everyone: false,
            tts: false,
            timestamp: new Date().toISOString(),
            edited_timestamp: null,
            flags: 0,
            components: [],
            nonce: msgId,
        },
        optimistic: false,
        isPushNotification: false,
    });
}

async function loadUser(userId: string): Promise<any | null> {
    try { await UserUtils.getUser(userId); } catch { }
    return UserStore.getUser(userId) ?? null;
}

async function doFakeFriend(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addDirectFriend(user);
}

async function doFakeFriendRequest(userId: string) {
    const user = await loadUser(userId);
    if (!user || isBot(user)) return;
    await addPendingRequest(user);
}

// ── Modal React pour saisir un nombre ─────────────────────────────────────────────
function askCount(title: string, max: number): Promise<number | null> {
    return new Promise(resolve => {
        const resolveRef = { current: resolve, done: false };

        function CountModal({ modalProps }: { modalProps: any; }) {
            const [value, setValue] = React.useState(String(Math.min(10, max)));
            const parsed = parseInt(value, 10);
            const valid = !isNaN(parsed) && parsed > 0 && parsed <= max;

            function confirm() {
                if (!valid || resolveRef.done) return;
                resolveRef.done = true;
                modalProps.onClose();
                resolveRef.current(parsed);
            }

            function cancel() {
                if (!resolveRef.done) {
                    resolveRef.done = true;
                    resolveRef.current(null);
                }
                modalProps.onClose();
            }

            return (
                <Modals.ModalRoot {...modalProps} size="small">
                    <Modals.ModalHeader>
                        <Modals.ModalCloseButton onClick={cancel} />
                        <h2 style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--white-500)" }}>
                            {title}
                        </h2>
                    </Modals.ModalHeader>
                    <Modals.ModalContent style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: ".04em" }}>
                                Nombre (max {max})
                            </label>
                            <input
                                autoFocus
                                type="number"
                                min={1}
                                max={max}
                                value={value}
                                onChange={e => setValue(e.currentTarget.value)}
                                onKeyDown={e => { if (e.key === "Enter") confirm(); }}
                                style={{
                                    background: "var(--background-secondary)",
                                    border: "1px solid var(--background-modifier-accent)",
                                    borderRadius: 4,
                                    color: "#fff",
                                    fontSize: 16,
                                    padding: "8px 12px",
                                    width: "100%",
                                    outline: "none",
                                }}
                            />
                        </div>
                    </Modals.ModalContent>
                    <Modals.ModalFooter>
                        <button
                            onClick={confirm}
                            disabled={!valid}
                            style={{
                                background: valid ? "var(--brand-experiment)" : "var(--button-secondary-background)",
                                border: "none", borderRadius: 4,
                                color: "var(--white-500)",
                                cursor: valid ? "pointer" : "not-allowed",
                                fontSize: 14, fontWeight: 500,
                                padding: "8px 20px",
                            }}
                        >
                            Confirm
                        </button>
                        <button
                            onClick={cancel}
                            style={{
                                background: "transparent", border: "none",
                                color: "var(--text-muted)",
                                cursor: "pointer", fontSize: 14,
                                padding: "8px 16px",
                            }}
                        >
                            Cancel
                        </button>
                    </Modals.ModalFooter>
                </Modals.ModalRoot>
            );
        }

        openModal(modalProps => <CountModal modalProps={modalProps} />);
    });
}

// ── Fake Friend Request avec saisie du nombre ─────────────────────────────────
async function floodGuild(guildId: string) {
    Toasts.show({ message: "Loading members...", type: Toasts.Type.MESSAGE, id: "ff-loading" });
    await fetchAllGuildMembers(guildId);

    const candidates = getGuildCandidates(guildId);
    if (!candidates.length) {
        Toasts.show({ message: "No candidates available", type: Toasts.Type.FAILURE, id: Toasts.genId() });
        return;
    }

    const count = await askCount("How many fake friend requests to send?", 99999);
    if (!count) return;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const pool: string[] = [];
    while (pool.length < count) pool.push(...shuffled);
    const selected = pool.slice(0, count);
    const BATCH = 10;
    let sent = 0;
    const defer = { persist: false as const, sync: false as const };
    for (let i = 0; i < selected.length; i += BATCH) {
        const batch = selected.slice(i, i + BATCH);
        const users = await Promise.all(batch.map(id => loadUser(id)));
        for (const user of users) {
            if (!user || isBot(user)) continue;
            await addPendingRequest(user, defer);
            sent++;
        }
        await new Promise(r => setTimeout(r, 120));
    }
    await persistState();
    syncFakeRelationships();
    Toasts.show({ message: `${sent} fake friend request${sent > 1 ? "s" : ""} sent!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
}

// ── Remove fake requests pour un serveur ──────────────────────────────────────
async function removeFakeFriendsForGuild(guildId: string) {
    const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId) as string[]);
    const toRemove = [...fakeState.keys()].filter(id => memberIds.has(id));

    if (!toRemove.length) {
        Toasts.show({ message: "No fake requests to remove for this server", type: Toasts.Type.MESSAGE, id: Toasts.genId() });
        return;
    }

    for (const id of toRemove) {
        await removeFakeFriendById(id);
    }

    Toasts.show({ message: `${toRemove.length} fake request${toRemove.length > 1 ? "s" : ""} removed!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
}

// ── Fake Message Request ─────────────────────────────────────────────────────
async function fakeMessageRequestGuild(guildId: string) {
    const candidates = getGuildCandidates(guildId);
    if (!candidates.length) {
        Toasts.show({ message: "No candidates available", type: Toasts.Type.FAILURE, id: Toasts.genId() });
        return;
    }

    const count = await askCount("How many message requests to simulate?", candidates.length);
    if (!count) return;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
    let sent = 0;

    const BATCH = 10;
    for (let i = 0; i < shuffled.length; i += BATCH) {
        const batch = shuffled.slice(i, i + BATCH);
        const users = await Promise.all(batch.map(id => loadUser(id)));
        for (const user of users) {
            if (!user || isBot(user)) continue;
            await sendIncomingMessageRequest(user);
            sent++;
        }
        await new Promise(r => setTimeout(r, 60));
    }

    Toasts.show({
        message: `${sent} message request${sent > 1 ? "s" : ""} received!`,
        type: sent > 0 ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE,
        id: Toasts.genId()
    });
}

let MessageRequestStore: any = null;
let origGetRequests: Function | null = null;
let origHasRequest: Function | null = null;

const fakeMessageRequests = new Map<string, { user: any; channelId: string; msgId: string; timestamp: string; }>();

function patchMessageRequestStore() {
    if (MessageRequestStore) return;
    try {
        const store = findByProps("getRequests", "hasRequest") as any;

        if (!store) return;
        MessageRequestStore = store;

        if (typeof store.getRequests === "function" && !origGetRequests) {
            origGetRequests = store.getRequests;
            store.getRequests = function () {
                const real = origGetRequests!.call(this) ?? {};
                for (const [channelId, data] of fakeMessageRequests) {
                    real[channelId] = { channelId, requesterId: data.user.id };
                }
                return real;
            };
        }

        if (typeof store.hasRequest === "function" && !origHasRequest) {
            origHasRequest = store.hasRequest;
            store.hasRequest = function (channelId: string) {
                if (fakeMessageRequests.has(channelId)) return true;
                return origHasRequest!.call(this, channelId);
            };
        }
    } catch (e) {
        console.warn("[FF] patchMessageRequestStore:", e);
    }
}

async function sendIncomingMessageRequest(user: any) {
    const ChannelClass = getChannelClass();
    const msgId = makeSnowflake();
    const channelId = makeSnowflake();
    const now = new Date().toISOString();

    const raw = {
        id: channelId,
        type: 1,
        flags: 0,
        last_message_id: msgId,
        last_pin_timestamp: null,
        recipients: [makeUserPayload(user)],
        recipient_ids: [user.id],
        is_spam: false,
        is_message_request: true,
        is_message_request_timestamp: now,
    };

    let instance: any = null;
    if (ChannelClass) {
        try { instance = new ChannelClass(raw); } catch { }
    }
    if (!instance) {
        instance = Object.assign(Object.create({
            getGuildId() { return null; },
            isPrivate() { return true; },
            isDM() { return true; },
            isGroupDM() { return false; },
            isMultiUserDM() { return false; },
            isSystemDM() { return false; },
            isGuildVoice() { return false; },
            isGuildStageVoice() { return false; },
            isGuildPublicThread() { return false; },
            isGuildPrivateThread() { return false; },
            isGuildNewsThread() { return false; },
            isThread() { return false; },
            isArchivedLockedThread() { return false; },
            isManaged() { return false; },
            isCategory() { return false; },
            isDirectory() { return false; },
            isAnnouncement() { return false; },
            isListenModeCapable() { return false; },
            isForumChannel() { return false; },
            isMediaPostChannel() { return false; },
            isBroadcastChannel() { return false; },
            hasActiveThreads() { return false; },
            canHaveInvite() { return false; },
            canHaveWebhooks() { return false; },
            isEmojiPickerDisabled() { return false; },
            computeLurkerPermissionsAllowList() { return null; },
            toString() { return `<#${(this as any).id}>`; },
        }), {
            id: channelId, type: 1, flags: 0,
            guild_id: null, guildId: null,
            lastMessageId: msgId, lastPinTimestamp: null,
            name: "", icon: null, ownerId: null, applicationId: null,
            recipients: [user.id], recipientIDs: [user.id],
            rawRecipients: [makeUserPayload(user)],
            nicks: {},
            isSpam: false,
            isMessageRequest: true,
            isMessageRequestTimestamp: now,
            blockedUserWarningDismissed: false, safetyWarnings: null,
            permissionOverwrites: {}, bitrate: 0, userLimit: 0,
            rateLimitPerUser: 0, rtcRegion: null, videoQualityMode: 1,
            defaultThreadRateLimitPerUser: 0, nsfw: false, topic: null,
            position: 0, parentId: null, defaultAutoArchiveDuration: null,
            member: null, memberCount: null, messageCount: null,
            totalMessageSent: null, threadMetadata: null,
            defaultReactionEmoji: null, availableTags: null,
            appliedTags: null, flags_: 0,
        });
    }

    fakeDMChannelObjects.set(channelId, instance);
    FluxDispatcher.dispatch({ type: "CHANNEL_OPEN", channelId });
    await new Promise(r => setTimeout(r, 30));

    const realMsgId = makeSnowflake();
    FluxDispatcher.dispatch({
        type: "MESSAGE_CREATE",
        channelId,
        message: {
            id: realMsgId,
            type: 0,
            content: "hi",
            channel_id: channelId,
            author: makeUserPayload(user),
            attachments: [], embeds: [], mentions: [],
            mention_roles: [], mention_channels: [],
            pinned: false, mention_everyone: false, tts: false,
            timestamp: now,
            edited_timestamp: null, flags: 0, components: [],
            nonce: realMsgId,
        },
        optimistic: false,
        isPushNotification: false,
    });
}

// ── Context menus ──────────────────────────────────────────────────────────────
const userContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const userId = props?.user?.id ?? props?.userId;
        if (!userId || userId === UserStore.getCurrentUser()?.id) return;

        const state = fakeState.get(userId);
        const realRel = origGetRelType
            ? origGetRelType.call(RelationshipStore, userId)
            : (RelationshipStore as any).getRelationshipType(userId);

        if (!state && realRel !== RelationshipType.NONE) return;

        const followIndex = children.findIndex((c: any) =>
            c?.props?.id === "follow-user" || c?.key === "follow-user"
        );

        let items: React.ReactElement[] = [];
        if (!state) {
            items = [
                <Menu.MenuItem key="ff-friend" id="ff-friend" label="Fake Friend" action={() => doFakeFriend(userId)} />,
                <Menu.MenuItem key="ff-request" id="ff-request" label="Fake Friend Request" action={() => doFakeFriendRequest(userId)} />,
            ];
        } else if (state === "pending") {
            items = [
                <Menu.MenuItem key="ff-cancel" id="ff-cancel" label="Cancel la fake demande" color="danger"
                    action={async () => {
                        await removeFakeFriendById(userId);
                    }} />
            ];
        } else {
            items = [
                <Menu.MenuItem key="ff-remove" id="ff-remove" label="Retirer des fake friends" color="danger"
                    action={async () => {
                        await removeFakeFriendById(userId);
                    }} />
            ];
        }

        const group = <Menu.MenuGroup key="ff-group" label="Fake Friends">{items}</Menu.MenuGroup>;

        if (followIndex !== -1) children.splice(followIndex + 1, 0, group);
        else children.push(<Menu.MenuSeparator key="ff-sep" />, group);
    } catch (e) {
        console.error("[FakeFriends] Context menu patch error:", e);
    }
};

const guildContextPatch: NavContextMenuPatchCallback = (children, props) => {
    if (!children || !Array.isArray(children)) return;
    try {
        const guildId = props?.guild?.id ?? props?.guildId;
        if (!guildId) return;

        // Compter combien de fake states concernent ce serveur
        const memberIds = new Set<string>(GuildMemberStore.getMemberIds(guildId) as string[]);
        const fakeCount = [...fakeState.keys()].filter(id => memberIds.has(id)).length;

        const items = [
            <Menu.MenuItem key="ff-g-flood" id="ff-g-flood" label="Fake Friend Request"
                action={() => floodGuild(guildId)} />
        ];

        // Bouton "Remove fake friend requests" — visible seulement si des fakes existent pour ce serveur
        if (fakeCount > 0) {
            items.push(
                <Menu.MenuItem
                    key="ff-g-remove"
                    id="ff-g-remove"
                    label={`Remove fake friend requests (${fakeCount})`}
                    color="danger"
                    action={() => removeFakeFriendsForGuild(guildId)}
                />
            );
        }

        children.push(
            <Menu.MenuSeparator key="ff-g-sep" />,
            <Menu.MenuGroup key="ff-g-group" label="Fake Friends">{items}</Menu.MenuGroup>
        );
    } catch (e) {
        console.error("[FakeFriends] Guild context menu patch error:", e);
    }
};

// ── Plugin ─────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "FakeFriends",
    enabledByDefault: true,
    description: "Simuliert Fake-Freunde und Anfragen lokal. Bleibt nach Neustart erhalten — verwaltbar in den Plugin-Einstellungen.",
    authors: [{ name: "Moggcord", id: 0n }],
    dependencies: ["ContextMenuAPI"],
    settingsAboutComponent: FakeFriendsSettings,

    isFakePending(userId?: string | null) {
        return !!userId && fakeState.get(userId) === "pending";
    },

    patches: [
        {
            find: '"FriendsStore"',
            replacement: [
                {
                    match: /case (\i\.\i)\.PENDING:return (\i)\.type===(\i\.\i\.INCOMING_REQUEST)/,
                    replace: "case $1.PENDING:return $2.type===$3||$self.isFakePending($2.userId)",
                },
                {
                    match: /case (\i\.\i)\.ALL:return (\i)\.type===1/,
                    replace: "case $1.ALL:return $2.type===1&&!$self.isFakePending($2.userId)",
                },
                {
                    match: /case (\i\.\i)\.ONLINE:return (\i)\.type===1&&(\i)\.status/,
                    replace: "case $1.ONLINE:return $2.type===1&&!$self.isFakePending($2.userId)&&$3.status",
                },
                {
                    match: /(?<=case (\i\.\i)\.SUGGESTIONS:return \d+===(\i)\.type)/,
                    replace: ";case $1.PENDING:return $2.type===3||$self.isFakePending($2.userId)",
                },
            ],
        },
    ],

    async start() {
        patchStore();
        patchChannelStore();
        patchAcceptFriend();
        patchMessageRequestStore();
        addContextMenuPatch("user-context", userContextPatch);
        addContextMenuPatch("guild-context", guildContextPatch);

        // Charger l'état persistant puis réappliquer les dispatches
        await loadState();
        if (fakeState.size > 0) {
            setTimeout(async () => {
                await reapplyFakeStates();
            }, 3000);
        }
    },

    stop() {
        removeContextMenuPatch("user-context", userContextPatch);
        removeContextMenuPatch("guild-context", guildContextPatch);
        unpatchAcceptFriend();
        // On ne clear pas fakeState au stop — persistant intentionnellement
        // Pour reset : clic Reset dans le plugin ou "Remove fake friend requests"
        unpatchStore();
        unpatchChannelStore();
    },
});
