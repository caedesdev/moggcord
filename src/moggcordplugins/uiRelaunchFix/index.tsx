/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { relaunch } from "@utils/native";

const CHECK_DELAY_MS = 12_000;
const SESSION_KEY = "moggcord-ui-relaunch-checked";

function isSidebarBlocked(): boolean {
    const guildNav =
        document.querySelector("nav[aria-label*='Servers']") ??
        document.querySelector("[class*='guilds']") ??
        document.querySelector("[data-list-id='guildsnav']");

    if (!guildNav) return false;

    const rect = guildNav.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return false;

    const x = Math.min(rect.right - 8, rect.left + Math.max(16, rect.width / 2));
    const y = Math.min(rect.bottom - 8, rect.top + 40);
    const hit = document.elementFromPoint(x, y);

    if (!hit) return true;
    if (hit === document.body || hit === document.documentElement) return true;

    if (hit.closest("#macos-window-controls")) return true;
    if (hit.closest("#moggcord-updater-root")) return true;
    if (!guildNav.contains(hit) && !hit.closest("nav")) return true;

    return false;
}

export default definePlugin({
    name: "UiRelaunchFix",
    enabledByDefault: true,
    description: "Automatically restarts Discord once if the UI is stuck after launch (servers/DMs not clickable).",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        if (typeof window === "undefined") return;
        if (sessionStorage.getItem(SESSION_KEY)) return;

        const runCheck = () => {
            sessionStorage.setItem(SESSION_KEY, "1");

            if (!isSidebarBlocked()) return;

            console.warn("[Moggcord] UI appears stuck — restarting Discord once...");
            try {
                relaunch();
            } catch (e) {
                console.error("[Moggcord] UiRelaunchFix failed to relaunch", e);
            }
        };

        if (document.readyState === "complete") {
            setTimeout(runCheck, CHECK_DELAY_MS);
        } else {
            window.addEventListener("load", () => setTimeout(runCheck, CHECK_DELAY_MS), { once: true });
        }
    }
});
