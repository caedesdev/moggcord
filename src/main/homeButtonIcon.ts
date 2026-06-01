/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow, WebContents } from "electron";

import { bindWindowInject, isLiveWindow } from "./safeWebContents";
import { MOGGCORD_AVATAR_DATA_URL as DATA_URL } from "./splashAssets";

// `data-list-item-id="guildsnav___home"` is Discord's stable hook for the
// home/logo button at the top of the server list; the logo itself is the
// <svg> inside the `childWrapper` element. We hide it and paint our avatar.
const CSS = `
div[data-list-item-id="guildsnav___home"] > [class*="childWrapper"] > svg {
    display: none !important;
}
div[data-list-item-id="guildsnav___home"] > [class*="childWrapper"] {
    background-image: url(${DATA_URL}) !important;
    background-size: cover !important;
    background-position: center !important;
    background-repeat: no-repeat !important;
    background-color: transparent !important;
}
`;

const installed = new WeakSet<BrowserWindow>();
const cssInjected = new WeakSet<WebContents>();

function inject(win: BrowserWindow) {
    if (!isLiveWindow(win)) return;
    const wc = win.webContents;
    if (cssInjected.has(wc)) return;
    cssInjected.add(wc);
    wc.insertCSS(CSS).catch(() => { });
}

/**
 * Replaces the Discord logo on the server-list home button with the Moggcord
 * avatar. Injected once as a user stylesheet (persists across SPA navigations).
 */
export function installMoggcordHomeIcon(win: BrowserWindow) {
    if (installed.has(win)) return;
    installed.add(win);
    bindWindowInject(win, () => inject(win));
}
