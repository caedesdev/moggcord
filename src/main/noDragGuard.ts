/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NO_DRAG_GUARD_CSS } from "@shared/noDragGuard";
import type { WebContents } from "electron";

const injected = new WeakSet<WebContents>();

export function injectNoDragGuard(webContents: WebContents) {
    if (injected.has(webContents)) return;
    injected.add(webContents);

    const run = () => {
        if (webContents.isDestroyed()) return;
        webContents.insertCSS(NO_DRAG_GUARD_CSS).catch(() => { });
    };

    webContents.on("dom-ready", run);
    if (!webContents.isLoadingMainFrame()) run();
}
