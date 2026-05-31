/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

declare const VERSION: string;

const LAST_SEEN_KEY = "moggcord-hub-last-seen-version";
const GUIDE_SEEN_KEY = "moggcord-hub-guide-seen";

export function getCurrentVersionTag(): string {
    return `v${VERSION}`;
}

export async function getLastSeenVersion(): Promise<string | null> {
    return (await DataStore.get<string>(LAST_SEEN_KEY)) ?? null;
}

export async function hasSeenGuide(): Promise<boolean> {
    return Boolean(await DataStore.get<boolean>(GUIDE_SEEN_KEY));
}

export async function markGuideSeen(): Promise<void> {
    await DataStore.set(GUIDE_SEEN_KEY, true);
}

export async function markVersionSeen(version = getCurrentVersionTag()): Promise<void> {
    await DataStore.set(LAST_SEEN_KEY, version);
}

export async function hasUnseenRelease(): Promise<boolean> {
    const lastSeen = await getLastSeenVersion();
    return lastSeen !== getCurrentVersionTag();
}
