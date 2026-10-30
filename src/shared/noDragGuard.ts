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
:is([class^="bar_"], [class*=" bar_"]):has(:is([class^="winButtons_"], [class*=" winButtons_"])),
:is([class^="bar_"], [class*=" bar_"]):has(> :is([class^="title_"], [class*=" title_"])),
:is([class^="bar_"], [class*=" bar_"]) > :is([class^="title_"], [class*=" title_"]),
:is([class^="titleBar_"], [class*=" titleBar_"]) {
    -webkit-app-region: drag !important;
    user-select: none;
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
