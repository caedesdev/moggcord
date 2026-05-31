/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { UserProfileStore } from "@webpack/common";

const logger = new Logger("MoggcordBadges", "#a855f7");

const API_BASE = "https://api.ninifxe.de";

const USER_CACHE_TTL_MS = 10 * 60 * 1000;

export interface MoggcordApiBadge {
    id: string;
    badge: string;
    tooltip: string;
}

interface BadgeDefinition {
    badge: string;
    tooltip: string;
    auto?: boolean;
}

type UserBadgeEntry =
    | string
    | { badgeId?: string; id?: string; badge?: string; tooltip?: string; grantedAt?: string | null; };

interface UserBadgesResponse {
    userId?: string;
    badges?: UserBadgeEntry[];
}

interface BulkData {
    badges: Record<string, BadgeDefinition>;
    users: Record<string, UserBadgeEntry[]>;
}

const userCache = new Map<string, { badges: MoggcordApiBadge[]; fetchedAt: number; }>();
const inFlight = new Map<string, Promise<void>>();

let bulkData: BulkData | null = null;

function extractBadgeIds(entries: UserBadgeEntry[] | undefined): string[] {
    if (!entries?.length) return [];

    return entries.flatMap(entry => {
        if (typeof entry === "string") return entry ? [entry] : [];
        const id = entry.badgeId ?? entry.id;
        return id ? [id] : [];
    });
}

/** /api/users/:id returns { id, badge, tooltip } objects — use directly. */
function parseDirectBadges(entries: UserBadgeEntry[] | undefined): MoggcordApiBadge[] {
    if (!entries?.length) return [];

    return entries.flatMap(entry => {
        if (typeof entry !== "object" || entry == null || typeof entry.badge !== "string") return [];

        const id = entry.id ?? entry.badgeId;
        if (!id) return [];

        return [{ id, badge: entry.badge, tooltip: entry.tooltip ?? id }];
    });
}

async function fetchJson<T>(path: string, noCache = false): Promise<T | null> {
    try {
        const res = await fetch(`${API_BASE}${path}`, noCache ? { cache: "no-cache" } : {});
        if (!res.ok) {
            logger.warn(`GET ${path} → ${res.status}`);
            return null;
        }
        return await res.json() as T;
    } catch (e) {
        logger.warn(`GET ${path} failed`, e);
        return null;
    }
}

function resolveBadges(badgeIds: string[]): MoggcordApiBadge[] {
    if (!bulkData?.badges) return [];

    return badgeIds.flatMap(id => {
        const def = bulkData!.badges[id];
        if (!def?.badge) return [];
        return [{ id, badge: def.badge, tooltip: def.tooltip ?? id }];
    });
}

function badgesFromEntries(entries: UserBadgeEntry[] | undefined): MoggcordApiBadge[] {
    const direct = parseDirectBadges(entries);
    if (direct.length) return direct;
    return resolveBadges(extractBadgeIds(entries));
}

function notifyChange() {
    UserProfileStore.emitChange();
}

function cacheUserBadges(userId: string, badges: MoggcordApiBadge[]) {
    userCache.set(userId, { badges, fetchedAt: Date.now() });
    notifyChange();
}

export async function loadMoggcordBadgeData(noCache = false) {
    const data = await fetchJson<BulkData>("/api/data", noCache);
    if (!data?.badges) return;

    bulkData = data;
    userCache.clear();
    notifyChange();
}

async function fetchUserBadges(userId: string, noCache = false) {
    const cached = userCache.get(userId);
    if (!noCache && cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) return;

    const response = await fetchJson<UserBadgesResponse | UserBadgeEntry[]>(`/api/users/${userId}`, noCache);

    if (Array.isArray(response)) {
        cacheUserBadges(userId, badgesFromEntries(response));
        return;
    }

    if (response && Array.isArray(response.badges)) {
        cacheUserBadges(userId, badgesFromEntries(response.badges));
        return;
    }

    if (bulkData?.users?.[userId]) {
        cacheUserBadges(userId, badgesFromEntries(bulkData.users[userId]));
        return;
    }

    cacheUserBadges(userId, []);
}

export function getMoggcordApiBadges(userId: string): MoggcordApiBadge[] {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) {
        return cached.badges;
    }

    if (bulkData?.users?.[userId]) {
        const badges = badgesFromEntries(bulkData.users[userId]);
        userCache.set(userId, { badges, fetchedAt: Date.now() });
        return badges;
    }

    if (!inFlight.has(userId)) {
        inFlight.set(userId, fetchUserBadges(userId).finally(() => inFlight.delete(userId)));
    }

    return cached?.badges ?? [];
}
