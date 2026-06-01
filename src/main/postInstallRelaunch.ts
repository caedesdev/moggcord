/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "original-fs";
import { dirname, join } from "path";

export const POST_INSTALL_RELAUNCH_MARKER = join(
    process.env.LOCALAPPDATA || "",
    "Moggcord",
    ".pending-relaunch"
);

const MAX_MARKER_AGE_MS = 300_000;

/** @deprecated Auto-relaunch was removed — it looked like a silent crash ~60s after inject. */
export function markPendingRelaunch() {
    // Kept for API compatibility with the installer; no longer schedules a kill/relaunch.
}

/** Remove a leftover marker from older builds that still scheduled app.exit(). */
export function clearPendingRelaunchMarker() {
    try {
        if (existsSync(POST_INSTALL_RELAUNCH_MARKER)) {
            unlinkSync(POST_INSTALL_RELAUNCH_MARKER);
            console.log("[Moggcord] Cleared post-install relaunch marker.");
        }
    } catch { /* noop */ }
}

export function schedulePostInstallRelaunchIfNeeded() {
    if (!existsSync(POST_INSTALL_RELAUNCH_MARKER)) return;

    let markerAge = Number.MAX_SAFE_INTEGER;
    try {
        markerAge = Date.now() - Number.parseInt(readFileSync(POST_INSTALL_RELAUNCH_MARKER, "utf8"), 10);
    } catch { /* stale / invalid marker */ }

    clearPendingRelaunchMarker();

    if (Number.isFinite(markerAge) && markerAge >= 0 && markerAge <= MAX_MARKER_AGE_MS) {
        console.log("[Moggcord] Skipped legacy post-install relaunch (removed — use Ctrl+R if UI feels stuck).");
    }
}
