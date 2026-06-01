/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { BrowserWindow } from "electron";

import { bindWindowInject, isLiveWindow } from "./safeWebContents";
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
    pointer-events: none;
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
    if (window.__mgLoadingDone || window.__mgLoadingBootstrapped) return;
    window.__mgLoadingBootstrapped = true;
    window.__mgLoadingBootAt = Date.now();

    var ID = ${JSON.stringify(OVERLAY_ID)};
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
        el.style.pointerEvents = "none";
        el.innerHTML =
            '<div class="mg-ring"><div class="mg-avatar"></div></div>' +
            '<div class="mg-title">Loading <b>Moggcord</b><span class="mg-dots"></span></div>' +
            '<div class="mg-tip"></div>';
        (document.body || document.documentElement).appendChild(el);
        tipEl = el.querySelector(".mg-tip");
        if (tipEl) tipEl.textContent = TIPS[i];
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
    var MIN_MS = 400;
    var FORCE_MS = 6000;
    var MAX_MS = 9000;

    function isAppReady() {
        var elapsed = Date.now() - START;
        // Mod loads before Discord paints UI — do not hide overlay on Vencord alone.
        if (elapsed < 1200) return false;

        var mount = document.querySelector("#app-mount");
        if (!mount || !mount.children.length) return false;

        var selectors = [
            '[data-list-item-id="guildsnav___home"]',
            '[class*="guilds_"]',
            '[class*="privateChannels"]',
            '[class*="authBox"]',
            '[class*="qrCode"]',
            'input[type="password"]',
            'input[name="email"]',
            '[role="dialog"]',
            '[class*="sidebar"]',
            '[class*="chatContent"]',
            'nav[aria-label]'
        ];
        for (var s = 0; s < selectors.length; s++) {
            if (document.querySelector(selectors[s])) return true;
        }

        return elapsed >= FORCE_MS && mount.children.length > 0;
    }

    function done() {
        if (finished) return;
        finished = true;
        window.__mgLoadingDone = true;
        clearInterval(tipTimer);
        var el = document.getElementById(ID);
        if (!el) return;
        el.style.pointerEvents = "none";
        el.style.opacity = "0";
        setTimeout(function () { el.remove(); }, 500);
    }

    function tick() {
        var elapsed = Date.now() - START;
        if (elapsed < MIN_MS) return setTimeout(tick, 120);
        if (isAppReady() || elapsed > MAX_MS) return done();
        setTimeout(tick, 160);
    }
    tick();
})();`;

const installed = new WeakSet<BrowserWindow>();

function inject(win: BrowserWindow) {
    if (!isLiveWindow(win)) return;
    const wc = win.webContents;
    wc.insertCSS(CSS).catch(() => { });
    wc.executeJavaScript(BOOTSTRAP, true).catch(() => { });
}

/**
 * Overlays Moggcord branding on top of Discord's in-app loading screen.
 * The overlay is cosmetic only (pointer-events: none) and removes itself
 * once the app is ready or after a short timeout.
 */
export function installMoggcordLoadingScreen(win: BrowserWindow) {
    if (installed.has(win)) return;
    installed.add(win);
    bindWindowInject(win, () => inject(win));
}
