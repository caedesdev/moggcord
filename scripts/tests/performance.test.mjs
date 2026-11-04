/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { transform } from "esbuild";

async function load(source, imports = {}, globals = {}) {
    const { code } = await transform(source, { loader: "tsx", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: name => {
        assert(Object.hasOwn(imports, name), "Unexpected import: " + name);
        return imports[name];
    } });
    return module.exports;
}

const directory = "src/moggcordplugins/messageLoggerEnhanced/";
const { memoize } = await load(await readFile(directory + "utils/memoize.ts", "utf8"));

test("bounded memoization evicts old results and keeps recent hits, including falsy values", () => {
    let calls = 0;
    const cached = memoize(value => { calls++; return value; }, 2);
    assert.equal(cached(0), 0);
    assert.equal(cached(0), 0);
    assert.equal(calls, 1);
    cached(1);
    cached(2);
    cached(2);
    assert.equal(calls, 3);
    cached(0);
    assert.equal(calls, 4);
    cached.clear();
    cached(0);
    assert.equal(calls, 5);
});

test("converted log messages release old results during a long session and after clearing", async () => {
    const source = await readFile(directory + "utils/misc.ts", "utf8");
    const file = ts.createSourceFile("misc.ts", source, ts.ScriptTarget.Latest, true);
    const declaration = file.statements.find(node => ts.isVariableStatement(node)
        && node.declarationList.declarations.some(item => item.name.getText(file) === "messageJsonToMessageClass"));
    assert(declaration);
    let constructions = 0;
    const { messageJsonToMessageClass: convert } = await load(declaration.getText(file), {}, {
        memoize,
        MessageClass: class { constructor(message) { Object.assign(this, message); constructions++; } },
        AuthorClass: class { constructor(author) { Object.assign(this, author); } },
        getTimestamp: value => new Date(value),
        UserStore: { getUser() {} },
        sanitizeEmbed: (channel, message, embed) => embed,
        mapTimestamp: value => value,
        moment: value => value
    });
    const entry = id => ({ message: { id, timestamp: "2026-11-04T00:00:00Z", author: { id: "user", username: "user" }, embeds: [] } });
    const first = convert(entry("0"));
    assert.equal(convert(entry("0")), first);
    for (let i = 1; i <= 2500; i++) convert(entry(String(i)));
    assert.equal(constructions, 2501);
    assert.notEqual(convert(entry("0")), first);
    const current = convert(entry("0"));
    convert.clear();
    assert.notEqual(convert(entry("0")), current);
});

test("deleted messages obey the render cache bound and stopping restores the native store", async () => {
    const source = await readFile(directory + "index.tsx", "utf8");
    const file = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let definition;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === "definePlugin") definition = node.arguments[0];
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert(definition && ts.isObjectLiteralExpression(definition));
    const methods = definition.properties.filter(node => ts.isMethodDeclaration(node) && ["start", "stop"].includes(node.name.getText(file)));
    const nativeMessage = { id: "native", content: "unchanged" };
    const original = () => nativeMessage;
    const MessageStore = { getMessage: original };
    const cachedMessages = new Map(Array.from({ length: 2501 }, (_, i) => [String(i), { id: String(i), deleted: true }]));
    let conversions = 0;
    let clears = 0;
    const convert = ({ message }) => ({ ...message, conversion: ++conversions });
    convert.clear = () => { clears++; };
    const { default: plugin } = await load("export default {" + methods.map(node => node.getText(file)).join(",") + "}", {}, {
        MessageStore, idb: { cachedMessages }, messageJsonToMessageClass: convert,
        Native: { init() {}, async getSettings() { return {}; } },
        settings: { store: { clearLogsOnRestart: false } },
        setupContextMenuPatches() {}, removeContextMenuBindings() {},
        cacheSentMessages: { clear() { clears++; } }
    });
    await plugin.start();
    assert.equal(MessageStore.getMessage("channel", "unknown"), nativeMessage);
    const first = MessageStore.getMessage("channel", "0");
    assert.equal(MessageStore.getMessage("channel", "0"), first);
    for (let i = 1; i <= 2500; i++) MessageStore.getMessage("channel", String(i));
    assert.notEqual(MessageStore.getMessage("channel", "0"), first);
    plugin.stop();
    assert.equal(MessageStore.getMessage, original);
    assert.equal(clears, 2);
});

async function headerBar(initialStealth = false) {
    const classes = new Set();
    const stored = new Map(initialStealth ? [["Moggcord_stealthMode", "1"]] : []);
    const effects = [];
    const cleanups = [];
    const keys = new Map();
    let renders = 0;
    let scans = 0;
    let observers = 0;
    const React = { createElement: (type, props) => ({ type, props }) };
    const api = await load(await readFile("src/api/HeaderBar.tsx", "utf8"), {
        "@components/ErrorBoundary": { __esModule: true, default: { wrap: render => render } },
        "@utils/Logger": { Logger: class {} },
        "@utils/misc": { classes: (...names) => names.join(" ") },
        "@webpack": { onceReady: Promise.resolve(), filters: { byClassNames() {} }, find() {}, findComponentByCodeLazy() {} },
        "@webpack/common": { useEffect: effect => effects.push(effect), useState: () => [0, () => { renders++; }] }
    }, {
        React, Event, window: new EventTarget(),
        document: {
            body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
            addEventListener: (name, handler) => keys.set(name, handler),
            querySelectorAll() { scans++; return []; }
        },
        localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
        MutationObserver: class { constructor() { observers++; } observe() {} disconnect() {} }
    });
    return { api, classes, stored, keys, scans: () => scans, observers: () => observers, renders: () => renders,
        mount() {
            api._addHeaderBarButtons()[0].type();
            const buttons = [];
            api._addChannelToolbarButtons(buttons);
            buttons[0].type();
            for (const effect of effects) cleanups.push(effect());
        },
        unmount() { for (const cleanup of cleanups) cleanup(); }
    };
}

test("stealth restores saved state and toggles without observing or scanning the Discord tree", async () => {
    const state = await headerBar(true);
    assert(state.classes.has("moggcord-stealth"));
    assert.equal(state.api.toggleStealthMode(), false);
    assert(!state.classes.has("moggcord-stealth"));
    assert.equal(state.stored.has("Moggcord_stealthMode"), false);
    state.keys.get("keydown")({ ctrlKey: true, shiftKey: true, code: "KeyH", preventDefault() {}, stopPropagation() {} });
    assert.equal(state.api.isStealthModeEnabled(), true);
    assert(state.classes.has("moggcord-stealth"));
    assert.equal(state.scans(), 0);
    assert.equal(state.observers(), 0);
});

test("mounted toolbars update once per toggle and release their listeners on unmount", async () => {
    const state = await headerBar();
    state.mount();
    state.api.toggleStealthMode();
    assert.equal(state.renders(), 2);
    state.unmount();
    state.api.toggleStealthMode();
    assert.equal(state.renders(), 2);
});
