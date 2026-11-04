/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NO_DRAG_GUARD_CSS } from "@shared/noDragGuard";
import type { WebContents } from "electron";

const guarded = new WeakSet<WebContents>();

export function injectNoDragGuard(webContents: WebContents) {
    if (guarded.has(webContents)) return;
    guarded.add(webContents);

    let generation = 0;
    let appliedGeneration = -1;
    const run = () => {
        if (webContents.isDestroyed() || appliedGeneration === generation) return;
        const currentGeneration = generation;
        appliedGeneration = currentGeneration;
        // Discord re-applies drag on <body> seconds after first paint.
        webContents.insertCSS(NO_DRAG_GUARD_CSS, { cssOrigin: "user" }).catch(() => {
            if (appliedGeneration === currentGeneration) appliedGeneration = -1;
        });
    };

    webContents.on("dom-ready", () => {
        generation++;
        run();
    });
    webContents.on("did-finish-load", run);

    try {
        if (!webContents.isDestroyed() && !webContents.isLoadingMainFrame()) run();
    } catch { /* torn down during startup */ }
}
