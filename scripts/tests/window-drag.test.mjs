/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

async function load(file, globals = {}, imports = {}) {
    const { code } = await transform(await readFile(file, "utf8"), { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    return module.exports;
}
const shared = await load("src/shared/noDragGuard.ts");

test("window drag protection never excludes the whole document or application from dragging", async () => {
    const { code } = await transform(shared.NO_DRAG_GUARD_CSS, { loader: "css", minify: true });
    assert(!/(?:html|body|#app-mount)\b/.test(code));
    assert(code.includes("-webkit-app-region:drag"));
    assert(code.includes("-webkit-app-region:no-drag"));
    assert(code.includes("user-select:none"));
    for (const selector of ["button", "input", '[role="checkbox"]', '[role="dialog"]']) assert(shared.NO_DRAG_GUARD_CSS.includes(selector));
});

test("main-process protection injects scoped styles across navigations without root-wide inline scripts", async () => {
    const listeners = new Map(), styles = [], timers = new Map();
    let destroyed = false;
    const webContents = {
        isDestroyed: () => destroyed,
        isLoadingMainFrame: () => false,
        insertCSS: async css => { styles.push(css); },
        executeJavaScript() { assert.fail("Global inline drag overrides must not be injected"); },
        on: (event, handler) => { assert(!listeners.has(event)); listeners.set(event, handler); }
    };
    const { injectNoDragGuard } = await load("src/main/noDragGuard.ts", {
        setInterval: callback => { timers.set(1, callback); return 1; },
        clearInterval: id => timers.delete(id)
    }, { "@shared/noDragGuard": shared });
    injectNoDragGuard(webContents);
    injectNoDragGuard(webContents);
    assert.equal(styles.length, 1);
    assert.equal(listeners.size, 3);
    for (const handler of listeners.values()) handler();
    assert.equal(styles.length, 4);
    assert(styles.every(css => css === shared.NO_DRAG_GUARD_CSS));
    destroyed = true;
    for (const handler of listeners.values()) handler();
    timers.get(1)();
    assert.equal(styles.length, 4);
    assert.equal(timers.size, 0);
});
