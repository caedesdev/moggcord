/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";

import { MOGGCORD_AVATAR_DATA_URL as DATA_URL } from "./splashAssets";

const OVERLAY_ID = "moggcord-splash-overlay";

const CSS = `
#${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    background: radial-gradient(circle at 50% 38%, #1d1b2e 0%, #0c0b14 72%);
    font-family: "gg sans", "Segoe UI", system-ui, sans-serif;
    -webkit-app-region: drag;
    user-select: none;
    animation: mgSplashFade .35s ease both;
}
#${OVERLAY_ID} .mg-ring {
    position: relative;
    width: 108px;
    height: 108px;
    display: flex;
    align-items: center;
    justify-content: center;
}
#${OVERLAY_ID} .mg-ring::before {
    content: "";
    position: absolute;
    inset: -7px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, #a855f7, #6366f1, #ec4899, #a855f7);
    animation: mgSpin 1.6s linear infinite;
    filter: blur(3px);
}
#${OVERLAY_ID} .mg-avatar {
    position: relative;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background-image: url(${DATA_URL});
    background-size: cover;
    background-position: center;
    box-shadow: 0 0 0 4px #0c0b14, 0 8px 26px rgba(0, 0, 0, .55);
    animation: mgPulse 2s ease-in-out infinite;
}
#${OVERLAY_ID} .mg-title {
    color: #fff;
    font-size: 17px;
    font-weight: 600;
    letter-spacing: .3px;
}
#${OVERLAY_ID} .mg-title b {
    color: #c4b5fd;
}
#${OVERLAY_ID} .mg-title .mg-dots::after {
    content: "";
    animation: mgDots 1.4s steps(1, end) infinite;
}
@keyframes mgSpin { to { transform: rotate(360deg); } }
@keyframes mgPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes mgSplashFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mgDots {
    0% { content: ""; }
    25% { content: "."; }
    50% { content: ".."; }
    75% { content: "..."; }
}
`;

const BUILD_DOM = `(function () {
    if (document.getElementById(${JSON.stringify(OVERLAY_ID)})) return;
    var o = document.createElement("div");
    o.id = ${JSON.stringify(OVERLAY_ID)};
    o.innerHTML = '<div class="mg-ring"><div class="mg-avatar"></div></div>'
        + '<div class="mg-title">Loading <b>Moggcord</b><span class="mg-dots"></span></div>';
    (document.body || document.documentElement).appendChild(o);
})();`;

function inject(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    const wc = win.webContents;
    wc.insertCSS(CSS).catch(() => { });
    wc.executeJavaScript(BUILD_DOM, true).catch(() => { });
}

/**
 * Visually overlays Discord's own splash window with Moggcord branding.
 * Only paints on top of the existing splash; the underlying window keeps
 * Discord's startup IPC intact so the main window still opens normally.
 */
export function installMoggcordSplashOverlay(win: BrowserWindow) {
    const wc = win.webContents;
    wc.on("dom-ready", () => inject(win));
    wc.on("did-finish-load", () => inject(win));
    if (!wc.isLoadingMainFrame()) inject(win);
}
