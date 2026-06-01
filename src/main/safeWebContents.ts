/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow, WebContents } from "electron";

export function isLiveWindow(win: BrowserWindow | null | undefined): win is BrowserWindow {
    if (!win) return false;
    try {
        return !win.isDestroyed() && !win.webContents.isDestroyed();
    } catch {
        return false;
    }
}

export function safeWebContents(win: BrowserWindow): WebContents | null {
    if (!isLiveWindow(win)) return null;
    return win.webContents;
}

/** Run once per window on dom-ready / did-finish-load; skips destroyed windows. */
export function bindWindowInject(win: BrowserWindow, inject: () => void) {
    const run = () => {
        if (!isLiveWindow(win)) return;
        inject();
    };

    const wc = win.webContents;
    wc.once("dom-ready", run);
    wc.once("did-finish-load", run);

    try {
        if (!wc.isDestroyed() && !wc.isLoadingMainFrame()) run();
    } catch { /* window torn down during startup */ }
}

/** Re-run inject when Discord navigates or repaints (home icon, no-drag CSS). */
export function bindWindowInjectRepeating(win: BrowserWindow, inject: () => void) {
    const run = () => {
        if (!isLiveWindow(win)) return;
        inject();
    };

    const wc = win.webContents;
    wc.on("dom-ready", run);
    wc.on("did-finish-load", run);
    wc.on("did-navigate-in-page", run);

    try {
        if (!wc.isDestroyed() && !wc.isLoadingMainFrame()) run();
    } catch { /* window torn down during startup */ }
}
