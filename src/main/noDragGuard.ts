/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NO_DRAG_GUARD_CSS } from "@shared/noDragGuard";
import type { WebContents } from "electron";

const guarded = new WeakSet<WebContents>();

const INLINE_NO_DRAG_JS = `(function () {
    function fix() {
        try {
            for (var sel of ["html", "body", "#app-mount"]) {
                var n = document.querySelector(sel);
                if (n) n.style.setProperty("-webkit-app-region", "no-drag", "important");
            }
        } catch (e) {}
    }
    fix();
    document.addEventListener("DOMContentLoaded", fix, { once: true });
})();`;

export function injectNoDragGuard(webContents: WebContents) {
    if (guarded.has(webContents)) return;
    guarded.add(webContents);

    const run = () => {
        if (webContents.isDestroyed()) return;
        webContents.insertCSS(NO_DRAG_GUARD_CSS).catch(() => { });
        webContents.executeJavaScript(INLINE_NO_DRAG_JS, true).catch(() => { });
    };

    webContents.on("dom-ready", run);
    webContents.on("did-finish-load", run);
    webContents.on("did-navigate-in-page", run);

    // Discord re-applies drag on <body> seconds after first paint.
    let n = 0;
    const poll = setInterval(() => {
        if (webContents.isDestroyed() || ++n > 20) {
            clearInterval(poll);
            return;
        }
        run();
    }, 1000);

    try {
        if (!webContents.isDestroyed() && !webContents.isLoadingMainFrame()) run();
    } catch { /* torn down during startup */ }
}
