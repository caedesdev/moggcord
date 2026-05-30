/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const NO_DRAG_GUARD_STYLE_ID = "moggcord-nodrag-guard";

/**
 * Electron treats `-webkit-app-region: drag` regions as window drag handles and
 * swallows mouse events — checkboxes, OAuth consent, and bot verification
 * break when a parent (often <body> or a modal layer) is stuck on `drag`.
 */
export const NO_DRAG_GUARD_CSS = `
html, body, #app-mount {
    -webkit-app-region: no-drag !important;
}

button, input, textarea, select, a, label,
[role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"],
[data-toggleable-component],
[role="dialog"], [role="dialog"] *,
[class*="modal" i] label,
[class*="modal" i] input,
[class*="modal" i] button {
    -webkit-app-region: no-drag !important;
}
`;

export const NO_DRAG_INTERACTIVE_SELECTOR = [
    "button",
    "input",
    "textarea",
    "select",
    "a",
    "label",
    '[role="button"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="radio"]',
    '[role="tab"]',
    "[data-toggleable-component]",
].join(",");
