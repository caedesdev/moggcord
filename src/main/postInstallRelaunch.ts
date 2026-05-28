/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app } from "electron";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "original-fs";
import { dirname, join } from "path";

export const POST_INSTALL_RELAUNCH_MARKER = join(
    process.env.LOCALAPPDATA || "",
    "Moggcord",
    ".pending-relaunch"
);

export function markPendingRelaunch() {
    try {
        const dir = dirname(POST_INSTALL_RELAUNCH_MARKER);
        mkdirSync(dir, { recursive: true });
        writeFileSync(POST_INSTALL_RELAUNCH_MARKER, String(Date.now()));
    } catch { }
}

export function schedulePostInstallRelaunchIfNeeded() {
    if (process.platform !== "win32") return;
    if (!existsSync(POST_INSTALL_RELAUNCH_MARKER)) return;

    try {
        unlinkSync(POST_INSTALL_RELAUNCH_MARKER);
    } catch { }

    console.log("[Moggcord] Finishing setup — restarting Discord once for a fully working UI...");

    setTimeout(() => {
        app.relaunch();
        app.exit(0);
    }, 2500);
}
