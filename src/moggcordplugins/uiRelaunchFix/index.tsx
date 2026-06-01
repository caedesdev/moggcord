/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NO_DRAG_GUARD_CSS, NO_DRAG_GUARD_STYLE_ID } from "@shared/noDragGuard";
import definePlugin, { StartAt } from "@utils/types";
import { onFluxDispatcherReady } from "@webpack/common";

const LOADING_OVERLAY_ID = "moggcord-loading-screen";
const STUCK_OVERLAY_MS = 20_000;

function injectStyle() {
    if (document.getElementById(NO_DRAG_GUARD_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = NO_DRAG_GUARD_STYLE_ID;
    style.textContent = NO_DRAG_GUARD_CSS;
    (document.head ?? document.documentElement).appendChild(style);
}

function nodeIsDraggable(el: Element | null): boolean {
    if (!el) return false;
    const style = getComputedStyle(el) as CSSStyleDeclaration & { appRegion?: string; };
    return (style.webkitAppRegion || style.appRegion) === "drag";
}

/** Only remove the splash if bootstrap finished or the overlay is stuck too long. */
function clearStuckLoadingOverlay() {
    const el = document.getElementById(LOADING_OVERLAY_ID);
    if (!el) return;

    if ((window as any).__mgLoadingDone) {
        el.remove();
        return;
    }

    const bootAt = (window as any).__mgLoadingBootAt as number | undefined;
    if (bootAt && Date.now() - bootAt > STUCK_OVERLAY_MS) {
        (window as any).__mgLoadingDone = true;
        el.remove();
    }
}

function enforceNoDrag() {
    clearStuckLoadingOverlay();

    for (const el of [document.documentElement, document.body, document.querySelector("#app-mount")]) {
        if (el && nodeIsDraggable(el)) {
            (el as HTMLElement).style.setProperty("-webkit-app-region", "no-drag", "important");
        }
    }
}

let fastPollTimer: ReturnType<typeof setInterval> | null = null;
let slowPollTimer: ReturnType<typeof setInterval> | null = null;

function burstEnforceNoDrag() {
    enforceNoDrag();
    for (let i = 1; i <= 8; i++) setTimeout(enforceNoDrag, i * 400);
}

export default definePlugin({
    name: "UiRelaunchFix",
    enabledByDefault: true,
    required: true,
    startAt: StartAt.Init,
    description: "Keeps the UI clickable after launch by clearing stuck title-bar drag regions (sidebar, modals, bot verification checkboxes).",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        if (typeof window === "undefined") return;

        injectStyle();
        burstEnforceNoDrag();

        onFluxDispatcherReady(flux => {
            flux.subscribe("CONNECTION_OPEN", () => burstEnforceNoDrag());
            if (document.querySelector("#app-mount")?.children?.length) {
                burstEnforceNoDrag();
            }
        });

        // Discord often flips body to drag ~1–3s after open — short poll only.
        fastPollTimer = setInterval(enforceNoDrag, 1000);
        setTimeout(() => {
            if (fastPollTimer) clearInterval(fastPollTimer);
            fastPollTimer = null;
        }, 12_000);

        slowPollTimer = setInterval(enforceNoDrag, 60_000);

        window.addEventListener("keydown", (e) => {
            if (!e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
            if (e.key.toLowerCase() !== "r") return;
            e.preventDefault();
            location.reload();
        }, { capture: true });
    },

    stop() {
        if (fastPollTimer) clearInterval(fastPollTimer);
        if (slowPollTimer) clearInterval(slowPollTimer);
        fastPollTimer = null;
        slowPollTimer = null;
        document.getElementById(NO_DRAG_GUARD_STYLE_ID)?.remove();
    }
});
