/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";

import { RendererSettings } from "../settings";

const ALLOWED_FEATURES = new Set([
    "width",
    "height",
    "left",
    "top",
    "resizable",
    "movable",
    "alwaysOnTop",
    "frame",
    "transparent",
    "hasShadow",
    "closable",
    "skipTaskbar",
    "backgroundColor",
    "menubar",
    "toolbar",
    "location",
    "directories",
    "titleBarStyle"
]);

const MIN_POPOUT_WIDTH = 320;
const MIN_POPOUT_HEIGHT = 180;

const settings = RendererSettings.store;

const DEFAULT_POPOUT_OPTIONS: BrowserWindowConstructorOptions = {
    title: "Discord Popout",
    backgroundColor: "#2f3136",
    minWidth: MIN_POPOUT_WIDTH,
    minHeight: MIN_POPOUT_HEIGHT,
    frame: !settings.frameless && !settings.mainWindowFrameless,
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
    trafficLightPosition:
        process.platform === "darwin"
            ? {
                  x: 10,
                  y: 3
              }
            : undefined,
    autoHideMenuBar: true
};

export const PopoutWindows = new Map<string, BrowserWindow>();

let popoutCounter = 0;

export function stablePopoutKey(frameName: string): string {
    if (frameName.startsWith("DISCORD_")) return frameName;
    if (frameName) return `DISCORD_${frameName}`;
    return `DISCORD_POPOUT_${++popoutCounter}`;
}

function focusWindow(window: BrowserWindow) {
    window.setAlwaysOnTop(true);
    window.focus();
    window.setAlwaysOnTop(false);
}

function parseFeatureValue(feature: string) {
    if (feature === "yes") return true;
    if (feature === "no") return false;

    const n = Number(feature);
    if (!isNaN(n)) return n;

    return feature;
}

function parseWindowFeatures(features: string) {
    const keyValuesParsed = features.split(",");

    return keyValuesParsed.reduce<Record<string, unknown>>((features, feature) => {
        const [key, value] = feature.split("=");
        if (ALLOWED_FEATURES.has(key)) features[key] = parseFeatureValue(value);

        return features;
    }, {});
}

export function createOrFocusPopup(key: string, features: string) {
    const existingWindow = PopoutWindows.get(key);
    if (existingWindow) {
        focusWindow(existingWindow);
        return { action: "deny" } as const;
    }

    return {
        action: "allow",
        overrideBrowserWindowOptions: {
            ...DEFAULT_POPOUT_OPTIONS,
            ...parseWindowFeatures(features)
        }
    } as const;
}

export function setupPopout(win: BrowserWindow, key: string, openExternal: (url: string) => void) {
    win.setMenuBarVisibility(false);

    PopoutWindows.set(key, win);

    win.on("enter-html-full-screen", () => {
        win.setFullScreen(true);
    });
    win.on("leave-html-full-screen", () => {
        win.setFullScreen(false);
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url);
        return { action: "deny" };
    });

    win.once("closed", () => {
        win.removeAllListeners();
        PopoutWindows.delete(key);
    });
}
