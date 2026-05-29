/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";

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

function inject(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    win.webContents.insertCSS(CSS).catch(() => { });
}

/**
 * Replaces the Discord logo on the server-list home button with the Moggcord
 * avatar. Injected as a user stylesheet so it applies whenever the button
 * (re)mounts during the session.
 */
export function installMoggcordHomeIcon(win: BrowserWindow) {
    const wc = win.webContents;
    wc.on("dom-ready", () => inject(win));
    if (!wc.isLoadingMainFrame()) inject(win);
}
