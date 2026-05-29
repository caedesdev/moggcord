/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

// Discord renders the "Moggcord Settings" heading from a plain string, so we
// can't style it directly. Instead we tag the rendered text node and let CSS
// run a black-and-white shimmer with a glint sweeping left-to-right.

const STYLE_ID = "moggcord-settings-glint";
const CLASS = "moggcord-glint-title";
const TARGET_TEXT = "Moggcord Settings";

const CSS = `
@keyframes moggcord-glint-sweep {
    0%   { background-position: -50% center; }
    100% { background-position: 150% center; }
}
.${CLASS} {
    background-image: linear-gradient(
        100deg,
        #6e6e6e 0%,
        #6e6e6e 35%,
        #ffffff 50%,
        #6e6e6e 65%,
        #6e6e6e 100%
    );
    background-size: 250% auto;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent !important;
    animation: moggcord-glint-sweep 3.5s linear infinite;
}
`;

const CANDIDATE_SELECTOR = 'h1,h2,h3,[class*="title"],[class*="header"],[class*="eyebrow"]';

function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head ?? document.documentElement).appendChild(style);
}

function scan() {
    const candidates = document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR);
    for (const el of candidates) {
        if (el.classList.contains(CLASS)) continue;
        // Only the leaf element that directly holds the heading text.
        if (el.childElementCount !== 0) continue;
        if (el.textContent?.trim() === TARGET_TEXT) {
            el.classList.add(CLASS);
        }
    }
}

let observer: MutationObserver | null = null;
let scheduled = false;

function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        scheduled = false;
        scan();
    }, 400);
}

export default definePlugin({
    name: "SettingsGlint",
    enabledByDefault: true,
    required: true,
    description: "Animates the 'Moggcord Settings' heading with a black-and-white left-to-right glint.",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        if (typeof window === "undefined") return;

        injectStyle();
        scan();

        observer = new MutationObserver(scheduleScan);
        const root = document.body ?? document.documentElement;
        if (root) observer.observe(root, { childList: true, subtree: true });
    },

    stop() {
        observer?.disconnect();
        observer = null;
        document.getElementById(STYLE_ID)?.remove();
        document.querySelectorAll("." + CLASS).forEach(el => el.classList.remove(CLASS));
    }
});
