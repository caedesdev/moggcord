/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { shell, type WebContents } from "electron";

import { createOrFocusPopup, setupPopout, stablePopoutKey } from "./discordPopout";

const guardedWebContents = new WeakSet<WebContents>();

const DISCORD_HOSTNAMES = ["discord.com", "canary.discord.com", "ptb.discord.com"];

const OVERLAY_FRAME_NAMES = new Set([
    "DISCORD_OutOfProcessOverlay",
    "DISCORD_Overlay",
    "DISCORD_GAME_OVERLAY",
]);

const POPOUT_RATE_LIMIT_WINDOW_MS = 5000;
const POPOUT_RATE_LIMIT_MAX = 3;
const popoutTimestamps: number[] = [];

export function isDiscordPopoutUrl(url: string): boolean {
    try {
        const { pathname, hostname } = new URL(url);
        return pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname);
    } catch {
        return false;
    }
}

export function isOverlayFrame(frameName: string | undefined): boolean {
    return !!frameName && OVERLAY_FRAME_NAMES.has(frameName);
}

function recordPopoutRequest(): boolean {
    const now = Date.now();
    while (popoutTimestamps.length > 0 && now - popoutTimestamps[0] > POPOUT_RATE_LIMIT_WINDOW_MS) {
        popoutTimestamps.shift();
    }
    if (popoutTimestamps.length >= POPOUT_RATE_LIMIT_MAX) {
        console.warn("[Moggcord] Popout rate-limited (overlay retry loop?)");
        return false;
    }
    popoutTimestamps.push(now);
    return true;
}

export function shouldBlockWindowOpen(details: { url: string; frameName?: string }): boolean {
    const { frameName = "" } = details;

    if (isOverlayFrame(frameName)) {
        console.log("[Moggcord] Blocked overlay popout:", frameName);
        return true;
    }

    return false;
}

export function shouldBlockExternalOpen(url: string): boolean {
    return isDiscordPopoutUrl(url);
}

function openExternalUrl(url: string) {
    try {
        const { protocol } = new URL(url);
        switch (protocol) {
            case "http:":
            case "https:":
            case "mailto:":
            case "steam:":
            case "spotify:":
                shell.openExternal(url);
        }
    } catch { }
}

type WindowOpenHandler = Parameters<WebContents["setWindowOpenHandler"]>[0];

const defaultWindowOpenHandler: WindowOpenHandler = ({ url, frameName = "", features }) => {
    if (shouldBlockWindowOpen({ url, frameName })) {
        return { action: "deny" };
    }

    try {
        var { protocol, hostname, pathname, searchParams } = new URL(url);
    } catch {
        if (url === "about:blank") return { action: "allow" };
        return { action: "deny" };
    }

    const isDiscordPopout = pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname);
    if (isDiscordPopout || (frameName.startsWith("DISCORD_") && isDiscordPopout)) {
        if (!recordPopoutRequest()) {
            return { action: "deny" };
        }

        const key = stablePopoutKey(frameName);
        const result = createOrFocusPopup(key, features);
        if (result.action === "allow") {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    ...result.overrideBrowserWindowOptions,
                    isDiscordPopout: true
                } as any
            };
        }
        return result;
    }

    if (url === "about:blank") {
        if (frameName === "authorize" || frameName.startsWith("DISCORD_")) {
            return {
                action: "allow",
                overrideBrowserWindowOptions: {
                    isDiscordPopout: true
                } as any
            };
        }
        return { action: "allow" };
    }

    // Static placeholder Discord loads before the OAuth / bot verification popout navigates.
    if (frameName === "authorize" && searchParams.get("loading") === "true") {
        return { action: "deny" };
    }

    openExternalUrl(url);
    return { action: "deny" };
};

export function installPopoutGuard(webContents: WebContents) {
    if (guardedWebContents.has(webContents)) return;
    guardedWebContents.add(webContents);

    const originalSet = webContents.setWindowOpenHandler.bind(webContents);

    webContents.setWindowOpenHandler = handler => {
        return originalSet(details => {
            if (shouldBlockWindowOpen(details)) {
                return { action: "deny" };
            }
            return handler(details);
        });
    };

    webContents.setWindowOpenHandler(defaultWindowOpenHandler);

    webContents.on("did-create-window", (childWin, { frameName, options, url }: any) => {
        if (isOverlayFrame(frameName)) {
            childWin.close();
            return;
        }

        let isPopout = frameName.startsWith("DISCORD_") || frameName === "authorize";

        if (!isPopout) {
            if (options && options.isDiscordPopout) {
                isPopout = true;
            } else if (url) {
                try {
                    const { pathname, hostname } = new URL(url);
                    if (pathname === "/popout" && DISCORD_HOSTNAMES.includes(hostname)) {
                        isPopout = true;
                    }
                } catch { }
            }
        }

        if (isPopout) {
            setupPopout(childWin, stablePopoutKey(frameName), openExternalUrl);
        }
    });
}
