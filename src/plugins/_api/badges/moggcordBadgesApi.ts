/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { UserProfileStore } from "@webpack/common";

const logger = new Logger("MoggcordBadges", "#a855f7");

const API_BASES = [
    "https://api.ninifxe.de",
    "https://bot.ninifxe.de",
];

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

interface BulkData {
    badges: Record<string, BadgeDefinition>;
    users: Record<string, string[]>;
}

const userCache = new Map<string, { badges: MoggcordApiBadge[]; fetchedAt: number; }>();
const inFlight = new Map<string, Promise<void>>();

let bulkData: BulkData | null = null;

async function fetchJson<T>(path: string, noCache = false): Promise<T | null> {
    const init: RequestInit = {};
    if (noCache) init.cache = "no-cache";

    for (const base of API_BASES) {
        try {
            const res = await fetch(`${base}${path}`, init);
            if (!res.ok) continue;
            return await res.json() as T;
        } catch (e) {
            logger.debug(`Failed to fetch ${base}${path}`, e);
        }
    }

    return null;
}

function resolveBadges(userId: string, badgeIds: string[]): MoggcordApiBadge[] {
    if (!bulkData?.badges) return [];

    return badgeIds.flatMap(id => {
        const def = bulkData!.badges[id];
        if (!def?.badge) return [];
        return [{ id, badge: def.badge, tooltip: def.tooltip ?? id }];
    });
}

function cacheUserBadges(userId: string, badges: MoggcordApiBadge[]) {
    userCache.set(userId, { badges, fetchedAt: Date.now() });
    UserProfileStore.emitChange();
}

export async function loadMoggcordBadgeData(noCache = false) {
    const data = await fetchJson<BulkData>("/api/data", noCache);
    if (data?.badges) {
        bulkData = data;
        userCache.clear();
        UserProfileStore.emitChange();
    }
}

async function fetchUserBadges(userId: string, noCache = false) {
    const cached = userCache.get(userId);
    if (!noCache && cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) return;

    const response = await fetchJson<{ badges?: string[]; } | string[]>(`/api/users/${userId}`, noCache);

    let badgeIds: string[] = [];
    if (Array.isArray(response)) {
        badgeIds = response;
    } else if (response && Array.isArray(response.badges)) {
        badgeIds = response.badges;
    } else if (bulkData?.users?.[userId]) {
        badgeIds = bulkData.users[userId];
    }

    cacheUserBadges(userId, resolveBadges(userId, badgeIds));
}

export function getMoggcordApiBadges(userId: string): MoggcordApiBadge[] {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.fetchedAt < USER_CACHE_TTL_MS) {
        return cached.badges;
    }

    if (bulkData?.users?.[userId]) {
        const badges = resolveBadges(userId, bulkData.users[userId]);
        userCache.set(userId, { badges, fetchedAt: Date.now() });
        return badges;
    }

    if (!inFlight.has(userId)) {
        inFlight.set(userId, fetchUserBadges(userId).finally(() => inFlight.delete(userId)));
    }

    return cached?.badges ?? [];
}
