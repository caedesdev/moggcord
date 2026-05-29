/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

// On a slow cold start Discord can leave `-webkit-app-region: drag` on <body>,
// turning the entire window into a title-bar drag zone. The sidebar (servers/DMs)
// then stops reacting to clicks and double-clicking maximizes/restores the window,
// while the Friends list above it still works. A renderer reload clears it.
//
// We enforce `no-drag` on the structural roots so the UI is always interactive.
// Discord's real title bar keeps its own (deeper) drag region, so window dragging
// still works. This is non-destructive: it matches the healthy post-reload DOM.

const STYLE_ID = "moggcord-nodrag-guard";

const GUARD_CSS = `
html, body, #app-mount {
    -webkit-app-region: no-drag !important;
}
`;

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = GUARD_CSS;
    (document.head ?? document.documentElement).appendChild(style);
}

function bodyIsDraggable(): boolean {
    const b = document.body;
    if (!b) return false;
    const region = getComputedStyle(b).webkitAppRegion || (getComputedStyle(b) as any).appRegion;
    return region === "drag";
}

// Inline !important beats any stylesheet rule that set body to drag.
function enforceNoDrag() {
    const b = document.body;
    if (!b) return;
    if (bodyIsDraggable()) {
        b.style.setProperty("-webkit-app-region", "no-drag", "important");
        console.warn("[Moggcord] Cleared stuck title-bar drag region on <body> (sidebar was unclickable).");
    }
}

let observer: MutationObserver | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export default definePlugin({
    name: "UiRelaunchFix",
    enabledByDefault: true,
    required: true,
    description: "Keeps the UI clickable after launch by clearing a stuck title-bar drag region on <body> (servers/DMs not clickable, double-click maximizes).",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        if (typeof window === "undefined") return;

        injectStyle();
        enforceNoDrag();

        // Re-assert if Discord clears our inline override (e.g. on theme/layout changes).
        observer = new MutationObserver(() => enforceNoDrag());
        if (document.body) {
            observer.observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });
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
        document.getElementById(STYLE_ID)?.remove();
    }
});
