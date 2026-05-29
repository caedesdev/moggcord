/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { shell, type WebContents } from "electron";

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

function isPopoutRateLimited(): boolean {
    const now = Date.now();
    while (popoutTimestamps.length > 0 && now - popoutTimestamps[0] > POPOUT_RATE_LIMIT_WINDOW_MS) {
        popoutTimestamps.shift();
    }
    if (popoutTimestamps.length >= POPOUT_RATE_LIMIT_MAX) {
        console.warn("[Moggcord] Popout rate-limited (overlay retry loop?)");
        return true;
    }
    popoutTimestamps.push(now);
    return false;
}

export function shouldBlockWindowOpen(details: { url: string; frameName?: string }): boolean {
    const { url, frameName = "" } = details;

    if (isOverlayFrame(frameName)) {
        console.log("[Moggcord] Blocked overlay popout:", frameName);
        return true;
    }

    if (isDiscordPopoutUrl(url)) {
        if (!frameName.startsWith("DISCORD_") && isPopoutRateLimited()) {
            return true;
        }
    }

    return false;
}

export function shouldBlockExternalOpen(url: string): boolean {
    return isDiscordPopoutUrl(url);
}

type WindowOpenHandler = Parameters<WebContents["setWindowOpenHandler"]>[0];

const defaultWindowOpenHandler: WindowOpenHandler = ({ url, frameName }) => {
    if (shouldBlockWindowOpen({ url, frameName })) {
        return { action: "deny" };
    }

    if (url === "about:blank") {
        return { action: "allow" };
    }

    if (isDiscordPopoutUrl(url)) {
        return { action: "deny" };
    }

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

    webContents.on("did-create-window", (childWin, { frameName }) => {
        if (isOverlayFrame(frameName)) {
            childWin.close();
        }
    });
}
