/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NO_DRAG_GUARD_CSS, NO_DRAG_GUARD_STYLE_ID } from "@shared/noDragGuard";
import definePlugin from "@utils/types";

// On a slow cold start Discord can leave `-webkit-app-region: drag` on <body>,
// turning the entire window into a title-bar drag zone. The sidebar (servers/DMs)
// then stops reacting to clicks and double-clicking maximizes/restores the window,
// while the Friends list above it still works. A renderer reload clears it.
//
// The same drag region also breaks checkboxes in OAuth / bot verification modals.
// We enforce `no-drag` on structural roots and all interactive controls.
// Discord's real title bar keeps its own (deeper) drag region, so window dragging
// still works. This is non-destructive: it matches the healthy post-reload DOM.

const GUARD_CSS = NO_DRAG_GUARD_CSS;

function injectStyle() {
    if (document.getElementById(NO_DRAG_GUARD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = NO_DRAG_GUARD_STYLE_ID;
    style.textContent = GUARD_CSS;
    (document.head ?? document.documentElement).appendChild(style);
}

function bodyIsDraggable(): boolean {
    const b = document.body;
    if (!b) return false;
    const style = getComputedStyle(b) as CSSStyleDeclaration & { appRegion?: string; };
    const region = style.webkitAppRegion || style.appRegion;
    return region === "drag";
}

function enforceNoDrag() {
    const b = document.body;
    if (!b) return;
    if (bodyIsDraggable()) {
        b.style.setProperty("-webkit-app-region", "no-drag", "important");
    }
}

let observer: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export default definePlugin({
    name: "UiRelaunchFix",
    enabledByDefault: true,
    required: true,
    description: "Keeps the UI clickable after launch by clearing stuck title-bar drag regions (sidebar, modals, bot verification checkboxes).",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        if (typeof window === "undefined") return;

        injectStyle();
        enforceNoDrag();

        observer = new MutationObserver(() => enforceNoDrag());
        const observeTarget = document.body ?? document.documentElement;
        if (observeTarget) {
            observer.observe(observeTarget, {
                attributes: true,
                attributeFilter: ["style", "class"]
            });
        } else {
            window.addEventListener("DOMContentLoaded", () => {
                injectStyle();
                enforceNoDrag();
                if (document.body) observer?.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
            }, { once: true });
        }

        // The drag region can appear late during a slow first load; poll briefly to catch it.
        let ticks = 0;
        pollTimer = setInterval(() => {
            enforceNoDrag();
            if (++ticks >= 30) {
                if (pollTimer) clearInterval(pollTimer);
                pollTimer = null;
            }
        }, 1_000);
    },

    stop() {
        observer?.disconnect();
        observer = null;
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        document.getElementById(NO_DRAG_GUARD_STYLE_ID)?.remove();
    }
});
