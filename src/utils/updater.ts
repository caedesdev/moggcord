/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "./Logger";
import { IpcRes } from "./types";

export const UpdateLogger = /* #__PURE__ */ new Logger("Updater", "white");
export let isOutdated  = false;
export let isNewer     = false;
export let updateError: any;
export let changes: Record<"hash" | "author" | "message", string>[] = [];

const CHECK_COOLDOWN_MS = 5 * 60 * 1000;
let lastCheckAt = 0;
let checkInFlight: Promise<boolean> | null = null;

async function Unwrap<T>(p: Promise<IpcRes<T>>): Promise<T> {
    const res = await p;
    if (res.ok) return res.value as T;
    updateError = res.error;
    throw res.error;
}

export async function checkForUpdates(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && !checkInFlight && now - lastCheckAt < CHECK_COOLDOWN_MS) {
        return isOutdated;
    }
    if (checkInFlight && !force) return checkInFlight;

    checkInFlight = (async () => {
        try {
            changes = await Unwrap(VencordNative.updater.getUpdates());
            isOutdated = changes.length > 0;
            lastCheckAt = Date.now();
            return isOutdated;
        } finally {
            checkInFlight = null;
        }
    })();

    return checkInFlight;
}

export async function update(): Promise<boolean> {
    if (!isOutdated) return true;
    const ok = await Unwrap(VencordNative.updater.update());
    return ok;
}

export async function rebuild(): Promise<boolean> {
    const ok = await Unwrap(VencordNative.updater.rebuild());
    if (ok) isOutdated = false;
    return ok;
}

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

export async function maybePromptToUpdate(confirmMessage: string, checkForDev = false) {
    if (IS_WEB || IS_UPDATER_DISABLED) return;
    if (checkForDev && IS_DEV) return;

    try {
        const outdated = await checkForUpdates();
        if (outdated) {
            const downloaded = await update();
            if (downloaded) await rebuild();
        }
    } catch (err) {
        UpdateLogger.error(err);
        alert("The update check failed. Check your connection or reinstall Moggcord.");
    }
}
