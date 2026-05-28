/*
 * Moggcord — Updater utilities (renderer-side)
 * Wraps IPC calls vers le main process (http.ts)
 */

import { Logger } from "./Logger";
import { IpcRes } from "./types";

export const UpdateLogger = /* #__PURE__ */ new Logger("Updater", "white");
export let isOutdated  = false;
export let isNewer     = false;
export let updateError: any;
export let changes: Record<"hash" | "author" | "message", string>[] = [];

async function Unwrap<T>(p: Promise<IpcRes<T>>): Promise<T> {
    const res = await p;
    if (res.ok) return res.value as T;
    updateError = res.error;
    throw res.error;
}

/**
 * Demande au main process s'il y a une version plus récente.
 * Met à jour isOutdated et changes.
 */
export async function checkForUpdates(): Promise<boolean> {
    changes = await Unwrap(VencordNative.updater.getUpdates());
    return (isOutdated = changes.length > 0);
}

/**
 * Downloads the update package from GitHub (step 1).
 */
export async function update(): Promise<boolean> {
    if (!isOutdated) return true;
    const ok = await Unwrap(VencordNative.updater.update());
    return ok;
}

/**
 * Tries to install the downloaded package, or defers to install on Discord quit (step 2).
 */
export async function rebuild(): Promise<boolean> {
    const ok = await Unwrap(VencordNative.updater.rebuild());
    if (ok) isOutdated = false;
    return ok;
}

export const getRepo = () => Unwrap(VencordNative.updater.getRepo());

/**
 * Vérifie les mises à jour au démarrage et propose à l'utilisateur de mettre à jour.
 */
export async function maybePromptToUpdate(confirmMessage: string, checkForDev = false) {
    if (IS_WEB || IS_UPDATER_DISABLED) return;
    if (checkForDev && IS_DEV) return;

    try {
        const outdated = await checkForUpdates();
        if (outdated) {
            // Mise à jour automatique sans confirmation
            const downloaded = await update();
            if (downloaded) await rebuild();
        }
    } catch (err) {
        UpdateLogger.error(err);
        alert("The update check failed. Check your connection or reinstall Moggcord.");
    }
}
