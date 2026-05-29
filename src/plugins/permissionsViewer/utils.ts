/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { classNameFactory } from "@utils/css";
import { Guild, GuildMember, Role } from "@vencord/discord-types";
import { PermissionOverwriteType } from "@vencord/discord-types/enums";
import { extractAndLoadChunksLazy, findByPropsLazy } from "@webpack";
import { GuildRoleStore, PermissionsBits } from "@webpack/common";

import { PermissionsSortOrder, settings } from ".";

export const loadGetGuildPermissionSpecMap = extractAndLoadChunksLazy([".PRIMARY,badgeTooltipDelay:"]);
export const { getGuildPermissionSpecMap } = findByPropsLazy("getGuildPermissionSpecMap");

export const cl = classNameFactory("vc-permviewer-");

interface PermissionSpec { title: string; description: string; }

// Standard Discord permission flags with their stable bit values. Used as a
// last-resort source so the viewer keeps working even if Discord's webpack
// exports (PermissionsBits / getGuildPermissionSpecMap) can't be resolved.
const FALLBACK_PERMISSIONS: Record<string, bigint> = {
    CREATE_INSTANT_INVITE: 1n << 0n,
    KICK_MEMBERS: 1n << 1n,
    BAN_MEMBERS: 1n << 2n,
    ADMINISTRATOR: 1n << 3n,
    MANAGE_CHANNELS: 1n << 4n,
    MANAGE_GUILD: 1n << 5n,
    ADD_REACTIONS: 1n << 6n,
    VIEW_AUDIT_LOG: 1n << 7n,
    PRIORITY_SPEAKER: 1n << 8n,
    STREAM: 1n << 9n,
    VIEW_CHANNEL: 1n << 10n,
    SEND_MESSAGES: 1n << 11n,
    SEND_TTS_MESSAGES: 1n << 12n,
    MANAGE_MESSAGES: 1n << 13n,
    EMBED_LINKS: 1n << 14n,
    ATTACH_FILES: 1n << 15n,
    READ_MESSAGE_HISTORY: 1n << 16n,
    MENTION_EVERYONE: 1n << 17n,
    USE_EXTERNAL_EMOJIS: 1n << 18n,
    VIEW_GUILD_INSIGHTS: 1n << 19n,
    CONNECT: 1n << 20n,
    SPEAK: 1n << 21n,
    MUTE_MEMBERS: 1n << 22n,
    DEAFEN_MEMBERS: 1n << 23n,
    MOVE_MEMBERS: 1n << 24n,
    USE_VAD: 1n << 25n,
    CHANGE_NICKNAME: 1n << 26n,
    MANAGE_NICKNAMES: 1n << 27n,
    MANAGE_ROLES: 1n << 28n,
    MANAGE_WEBHOOKS: 1n << 29n,
    MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
    USE_APPLICATION_COMMANDS: 1n << 31n,
    REQUEST_TO_SPEAK: 1n << 32n,
    MANAGE_EVENTS: 1n << 33n,
    MANAGE_THREADS: 1n << 34n,
    CREATE_PUBLIC_THREADS: 1n << 35n,
    CREATE_PRIVATE_THREADS: 1n << 36n,
    USE_EXTERNAL_STICKERS: 1n << 37n,
    SEND_MESSAGES_IN_THREADS: 1n << 38n,
    USE_EMBEDDED_ACTIVITIES: 1n << 39n,
    MODERATE_MEMBERS: 1n << 40n,
    VIEW_CREATOR_MONETIZATION_ANALYTICS: 1n << 41n,
    USE_SOUNDBOARD: 1n << 42n,
    CREATE_GUILD_EXPRESSIONS: 1n << 43n,
    CREATE_EVENTS: 1n << 44n,
    USE_EXTERNAL_SOUNDS: 1n << 45n,
    SEND_VOICE_MESSAGES: 1n << 46n,
    SET_VOICE_CHANNEL_STATUS: 1n << 48n,
    SEND_POLLS: 1n << 49n,
    USE_EXTERNAL_APPS: 1n << 50n,
};

function titleCasePermissionName(name: string) {
    return name
        .toLowerCase()
        .split("_")
        .filter(Boolean)
        .map(word => word[0].toUpperCase() + word.slice(1))
        .join(" ");
}

// Returns [name, bit] entries from Discord's PermissionsBits, or the hardcoded
// fallback list if that export resolves to nothing.
function getPermissionEntries(): [string, bigint][] {
    try {
        const entries = Object.entries(PermissionsBits)
            .filter((entry): entry is [string, bigint] => typeof entry[1] === "bigint");
        if (entries.length) return entries;
    } catch {
        // fall through to fallback list
    }
    return Object.entries(FALLBACK_PERMISSIONS);
}

// Resilient list of permission bits for components to iterate over.
export function getPermissionBits(): bigint[] {
    return getPermissionEntries().map(([, bit]) => bit);
}

let fallbackSpecMap: Record<string, PermissionSpec> | null = null;

function buildFallbackPermissionSpecMap() {
    if (fallbackSpecMap) return fallbackSpecMap;

    const map: Record<string, PermissionSpec> = {};
    for (const [name, bit] of getPermissionEntries()) {
        const title = titleCasePermissionName(name);
        map[String(bit)] = { title, description: title };
    }

    fallbackSpecMap = map;
    return map;
}

// Always layer Discord's spec map (nicer titles/descriptions) over our complete
// fallback, so every permission bit is guaranteed to have an entry regardless of
// how/whether Discord's map resolves.
export function resolveGuildPermissionSpecMap(guild: Guild): Record<string, PermissionSpec> {
    const fallback = buildFallbackPermissionSpecMap();

    try {
        const map = getGuildPermissionSpecMap?.(guild);
        if (map && Object.keys(map).length) return { ...fallback, ...map };
    } catch {
        // use fallback only
    }

    return fallback;
}

export function getSortedRolesForMember({ id: guildId }: Guild, member: GuildMember) {
    const memberRoles = new Set(member.roles ?? []);

    // The guild id is the @everyone role
    return GuildRoleStore
        .getSortedRoles(guildId)
        .filter(role => role.id === guildId || memberRoles.has(role.id));
}

export function sortUserRoles(roles: Role[]) {
    switch (settings.store.permissionsSortOrder) {
        case PermissionsSortOrder.HighestRole:
            return roles.sort((a, b) => b.position - a.position);
        case PermissionsSortOrder.LowestRole:
            return roles.sort((a, b) => a.position - b.position);
        default:
            return roles;
    }
}

export function sortPermissionOverwrites<T extends { id: string; type: number; }>(overwrites: T[], guildId: string) {
    const roles = GuildRoleStore.getRolesSnapshot(guildId) ?? {};

    return overwrites.sort((a, b) => {
        if (a.type !== PermissionOverwriteType.ROLE || b.type !== PermissionOverwriteType.ROLE) return 0;

        const roleA = roles[a.id];
        const roleB = roles[b.id];

        return (roleB?.position ?? 0) - (roleA?.position ?? 0);
    });
}
