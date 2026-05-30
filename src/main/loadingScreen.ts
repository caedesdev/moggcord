/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";

import { MOGGCORD_AVATAR_DATA_URL as DATA_URL } from "./splashAssets";

const OVERLAY_ID = "moggcord-loading-screen";

const CSS = `
#${OVERLAY_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26px;
    background: radial-gradient(circle at 50% 40%, #1d1b2e 0%, #0c0b14 75%);
    font-family: "gg sans", "Segoe UI", system-ui, sans-serif;
    user-select: none;
    opacity: 1;
    transition: opacity .45s ease;
    animation: mgLoadFade .4s ease both;
}
#${OVERLAY_ID} .mg-ring {
    position: relative;
    width: 136px;
    height: 136px;
    display: flex;
    align-items: center;
    justify-content: center;
}
#${OVERLAY_ID} .mg-ring::before {
    content: "";
    position: absolute;
    inset: -8px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, #a855f7, #6366f1, #ec4899, #a855f7);
    animation: mgLoadSpin 1.6s linear infinite;
    filter: blur(3px);
}
#${OVERLAY_ID} .mg-avatar {
    position: relative;
    width: 120px;
    height: 120px;
    border-radius: 50%;
    background-image: url(${DATA_URL});
    background-size: cover;
    background-position: center;
    box-shadow: 0 0 0 5px #0c0b14, 0 10px 30px rgba(0, 0, 0, .55);
    animation: mgLoadPulse 2s ease-in-out infinite;
}
#${OVERLAY_ID} .mg-title {
    color: #fff;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: .3px;
}
#${OVERLAY_ID} .mg-title b { color: #c4b5fd; }
#${OVERLAY_ID} .mg-title .mg-dots::after {
    content: "";
    animation: mgLoadDots 1.4s steps(1, end) infinite;
}
#${OVERLAY_ID} .mg-tip {
    max-width: 420px;
    min-height: 18px;
    padding: 0 24px;
    text-align: center;
    color: #9aa0b3;
    font-size: 13px;
    line-height: 1.4;
    transition: opacity .35s ease;
}
@keyframes mgLoadSpin { to { transform: rotate(360deg); } }
@keyframes mgLoadPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes mgLoadFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes mgLoadDots {
    0% { content: ""; }
    25% { content: "."; }
    50% { content: ".."; }
    75% { content: "..."; }
}
`;

const BOOTSTRAP = `(function () {
    var ID = ${JSON.stringify(OVERLAY_ID)};
    if (window.__mgLoadingDone) return;
    if (document.getElementById(ID)) return;

    var TIPS = [
        "Booting Moggcord\\u2026",
        "Polishing the UI",
        "Loading your servers and DMs",
        "Tip: themes & plugins live in Settings",
        "Tip: Ctrl+R reloads if something looks off",
        "Almost there\\u2026"
    ];
    var i = 0;
    var tipEl = null;

    function build() {
        var el = document.getElementById(ID);
        if (el) return el;
        el = document.createElement("div");
        el.id = ID;
        el.innerHTML =
            '<div class="mg-ring"><div class="mg-avatar"></div></div>' +
            '<div class="mg-title">Loading <b>Moggcord</b><span class="mg-dots"></span></div>' +
            '<div class="mg-tip"></div>';
        (document.body || document.documentElement).appendChild(el);
        tipEl = el.querySelector(".mg-tip");
        tipEl.textContent = TIPS[i];
        return el;
    }

    build();

    var tipTimer = setInterval(function () {
        i = (i + 1) % TIPS.length;
        if (!tipEl) return;
        tipEl.style.opacity = "0";
        setTimeout(function () {
            if (tipEl) { tipEl.textContent = TIPS[i]; tipEl.style.opacity = "1"; }
        }, 350);
    }, 3000);

    var finished = false;
    var START = Date.now();
    var MIN_MS = 600;
    var MAX_MS = 40000;
    // Signals that only exist once the real app (or login) has mounted, never
    // during Discord's tips/Wumpus loading screen.
    var READY = [
        '[class*="guilds_"]',
        '[class*="privateChannels"]',
        '[class*="authBox"]',
        '[class*="qrCode"]',
        'input[type="password"]',
        'input[name="email"]',
        '[role="dialog"]'
    ].join(",");

    // Discord may wipe our node while it swaps the loading screen; rebuild it
    // until we decide we're actually done.
    var keepAlive = new MutationObserver(function () {
        if (finished) return;
        if (!document.getElementById(ID)) build();
    });
    if (document.body) keepAlive.observe(document.body, { childList: true });

    function done() {
        if (finished) return;
        finished = true;
        window.__mgLoadingDone = true;
        clearInterval(tipTimer);
        keepAlive.disconnect();
        var el = document.getElementById(ID);
        if (!el) return;
        el.style.pointerEvents = "none";
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); }, 500);
    }

    function tick() {
        var elapsed = Date.now() - START;
        if (elapsed < MIN_MS) return setTimeout(tick, 120);
        if (document.querySelector(READY) || elapsed > MAX_MS) return done();
        setTimeout(tick, 160);
    }
    tick();
})();`;

function inject(win: BrowserWindow) {
    if (win.isDestroyed()) return;
    const wc = win.webContents;
    wc.insertCSS(CSS).catch(() => { });
    wc.executeJavaScript(BOOTSTRAP, true).catch(() => { });
}

/**
 * Overlays Moggcord branding on top of Discord's in-app loading screen
 * (the tips + Wumpus screen shown while the client boots). The overlay paints
 * full-screen and removes itself once the app (or login) is ready.
 */
export function installMoggcordLoadingScreen(win: BrowserWindow) {
    const wc = win.webContents;
    wc.on("dom-ready", () => inject(win));
    wc.on("did-finish-load", () => inject(win));
    if (!wc.isLoadingMainFrame()) inject(win);
}
