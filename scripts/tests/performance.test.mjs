/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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
    assert.equal(cachedMessages.size, 0);
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

test("message caches retain existing keys on updates and enforce a reduced limit", async () => {
    const settings = { store: { cacheLimit: 3 } };
    const { LimitedMap } = await load(await readFile(directory + "utils/LimitedMap.ts", "utf8"), { "../index": { settings } });
    const cache = new LimitedMap(() => settings.store.cacheLimit);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("b", 20);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.get("b"), 20);
    cache.set("d", 4);
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.size, 3);
    settings.store.cacheLimit = 0;
    for (let i = 0; i < 2000; i++) cache.set(String(i), i);
    assert.equal(cache.size, 2003);
    settings.store.cacheLimit = 2;
    cache.set("1999", 3000);
    assert.equal(cache.size, 2);
    assert.equal(cache.get("1999"), 3000);
});

test("stored log messages obey the memory limit while evicted records remain readable from the database", async () => {
    const settings = { store: { cacheLimit: 3 } };
    const { LimitedMap } = await load(await readFile(directory + "utils/LimitedMap.ts", "utf8"), { "../index": { settings } });
    const records = new Map();
    const store = { async add(record) { records.set(record.message_id, structuredClone(record)); } };
    const database = {
        async put(name, record) { records.set(record.message_id, structuredClone(record)); },
        async get(name, id) { return structuredClone(records.get(id)); },
        async getAll() { return [...records.values()].map(record => structuredClone(record)); },
        async count(name, id) { return id === undefined ? records.size : Number(records.has(id)); },
        transaction() { return { store, done: Promise.resolve() }; }
    };
    const api = await load(await readFile(directory + "db.ts", "utf8"), {
        "@webpack/common": { ChannelStore: {}, Toasts: {} },
        "idb": { openDB: async () => database },
        "./settings": { settings },
        "./utils": { getMessageStatus: () => "DELETED" },
        "./utils/cleanUp": { stripTransientRenderState() {} },
        "./utils/constants": { DB_NAME: "fixture", DB_VERSION: 1 },
        "./utils/LimitedMap": { LimitedMap },
        "./utils/saveImage": { getAttachmentBlobUrl: async () => null }
    });
    await api.initIDB();
    const message = id => ({ id: String(id), channel_id: "channel", attachments: [], timestamp: "2026-11-04T00:00:00Z" });
    for (let i = 0; i < 2000; i++) await api.addMessageIDB(message(i), "DELETED");
    assert.equal(api.cachedMessages.size, 3);
    assert.equal(api.cachedMessages.has("0"), false);
    assert.equal(await api.countMessagesIDB(), 2000);
    assert.equal(await api.hasMessageIDB("0"), true);
    assert.equal((await api.getMessageIDB("0")).message.id, "0");
    assert.equal(api.cachedMessages.size, 3);
    await api.addMessagesBulkIDB(Array.from({ length: 100 }, (_, i) => message(i + 2000)), "DELETED");
    assert.equal(api.cachedMessages.size, 3);
    assert.equal((await api.getAllMessagesIDB()).length, 2100);
    assert.equal(api.cachedMessages.size, 3);
    assert.equal(await api.countMessagesIDB(), 2100);
});

async function eventLogs(saved = []) {
    const source = await readFile("src/moggcordplugins/eventLogs/index.tsx", "utf8");
    const file = ts.createSourceFile("eventLogs.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const variables = new Set(["MAX_LOGS", "logs", "logCount", "NOTIF_TYPES", "unreadLogEntries"]);
    const functions = new Set(["loadPersistLogs", "fmtNow", "pushLog"]);
    const statements = file.statements.filter(node => ts.isVariableStatement(node)
        ? node.declarationList.declarations.some(item => variables.has(item.name.getText(file)))
        : ts.isFunctionDeclaration(node) && functions.has(node.name?.text));
    let definition;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === "definePlugin") definition = node.arguments[0];
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert(definition && ts.isObjectLiteralExpression(definition));
    const stop = definition.properties.find(node => ts.isMethodDeclaration(node) && node.name.getText(file) === "stop");
    assert(stop);
    return load(statements.map(node => node.getText(file)).join("\n")
        + "\nexport { pushLog, loadPersistLogs, MAX_LOGS }; export const snapshot = () => ({ logs, unreadLogEntries }); export const plugin = {" + stop.getText(file) + "};", {}, {
        scheduleFlush() {}, localStorage: { getItem: () => JSON.stringify(saved) },
        removeHeaderBarButton() {}, unsubs: [], flushTimer: null,
        msgCache: new Map(), prevVS: new Map(), updateListeners: new Set(),
        isLoadingMessages: false, myVoiceChannelId: null
    });
}

test("event-log unread entries expire with the visible log and stop releases them", async () => {
    const api = await eventLogs();
    for (let i = 0; i < api.MAX_LOGS + 5000; i++) api.pushLog({ type: "ping", content: "fixture " + i });
    assert.equal(api.snapshot().logs.length, api.MAX_LOGS);
    assert.equal(api.snapshot().unreadLogEntries.size, api.MAX_LOGS);
    assert(api.snapshot().unreadLogEntries.has(api.snapshot().logs[0]));
    api.plugin.stop();
    assert.equal(api.snapshot().logs.length, 0);
    assert.equal(api.snapshot().unreadLogEntries.size, 0);
});

test("loading saved event logs retains only the newest entries within the existing limit", async () => {
    const saved = Array.from({ length: 12000 }, (_, i) => ({ id: String(i), type: "ping", content: "fixture", timestamp: i }));
    const api = await eventLogs(saved);
    api.loadPersistLogs();
    assert.equal(api.snapshot().logs.length, api.MAX_LOGS);
    assert.equal(api.snapshot().logs[0].timestamp, 11999);
    assert.equal(api.snapshot().logs.at(-1).timestamp, 2000);
});

async function pluginEvents() {
    const source = await readFile("src/api/PluginManager.ts", "utf8");
    const file = ts.createSourceFile("PluginManager.ts", source, ts.ScriptTarget.Latest, true);
    const functions = new Set(["subscribePluginFluxEvents", "unsubscribePluginFluxEvents"]);
    const statements = file.statements.filter(node => ts.isVariableStatement(node)
        ? node.declarationList.declarations.some(item => item.name.getText(file) === "subscribedFluxEventsPlugins")
        : ts.isFunctionDeclaration(node) && functions.has(node.name?.text));
    const errors = [], listeners = new Map();
    const api = await load(statements.map(node => node.getText(file)).join("\n"), {}, {
        IS_REPORTER: false, Promise,
        logger: { debug() {}, error: (...args) => errors.push(args) }
    });
    const dispatcher = {
        subscribe(event, handler) {
            if (!listeners.has(event)) listeners.set(event, new Set());
            listeners.get(event).add(handler);
        },
        unsubscribe(event, handler) { listeners.get(event)?.delete(handler); }
    };
    return { api, dispatcher, listeners, errors };
}

test("restarting a plugin does not wrap its handlers again or retain event subscriptions", async () => {
    const { api, dispatcher, listeners } = await pluginEvents();
    let received = 0;
    const handler = function (event) { assert.equal(this, plugin); received += event.amount; };
    const plugin = { name: "PerformanceFixture", flux: { MESSAGE_CREATE: handler } };
    for (let i = 0; i < 200; i++) {
        api.subscribePluginFluxEvents(plugin, dispatcher);
        api.subscribePluginFluxEvents(plugin, dispatcher);
        assert.equal(plugin.flux.MESSAGE_CREATE, handler);
        assert.equal(listeners.get("MESSAGE_CREATE").size, 1);
        [...listeners.get("MESSAGE_CREATE")][0]({ amount: 1 });
        api.unsubscribePluginFluxEvents(plugin, dispatcher);
        assert.equal(listeners.get("MESSAGE_CREATE").size, 0);
    }
    assert.equal(received, 200);
});

test("stopping a plugin releases the registered handlers even if its event definitions changed", async () => {
    const { api, dispatcher, listeners } = await pluginEvents();
    const plugin = { name: "PerformanceFixture", flux: { MESSAGE_CREATE() {} } };
    api.subscribePluginFluxEvents(plugin, dispatcher);
    plugin.flux = undefined;
    api.unsubscribePluginFluxEvents(plugin, dispatcher);
    assert.equal(listeners.get("MESSAGE_CREATE").size, 0);
});

test("plugin event errors remain isolated and asynchronous failures are caught", async () => {
    const { api, dispatcher, listeners, errors } = await pluginEvents();
    const plugin = { name: "PerformanceFixture", flux: {
        SYNC() { throw new Error("Sync fixture"); },
        ASYNC() { return Promise.reject(new Error("Async fixture")); }
    } };
    api.subscribePluginFluxEvents(plugin, dispatcher);
    assert.doesNotThrow(() => [...listeners.get("SYNC")][0]({}));
    await [...listeners.get("ASYNC")][0]({});
    assert.equal(errors.length, 2);
    api.unsubscribePluginFluxEvents(plugin, dispatcher);
    assert([...listeners.values()].every(handlers => handlers.size === 0));
});

async function loaderSync(installDir, destination) {
    const source = await readFile("src/main/moggcordLoader.ts", "utf8");
    const file = ts.createSourceFile("moggcordLoader.ts", source, ts.ScriptTarget.Latest, true);
    const sync = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "syncDistToLocal");
    const copies = [], reads = [], directories = [];
    const { syncDistToLocal } = await load(sync.getText(file), {}, {
        join, resolve, getPatcherInstallDir: () => installDir, getMoggcordLocalDistDir: () => destination,
        existsSync: () => true,
        mkdirSync: path => directories.push(path),
        readdirSync: path => { reads.push(path); return ["patcher.js", "renderer.js", "renderer.js.map", "renderer.js.LEGAL.txt", "node.exe", "assets"]; },
        statSync: path => ({ isFile: () => !path.endsWith("assets") }),
        cpSync: (from, to) => copies.push([from, to])
    });
    return { result: syncDistToLocal(), copies, reads, directories };
}

test("an installed build starts without scanning or copying its own distribution directory", async () => {
    const destination = resolve(".codex-temp", "installed-dist");
    const result = await loaderSync(join(destination, "child", ".."), destination);
    assert.equal(result.result, join(destination, "patcher.js"));
    assert.equal(result.reads.length, 0);
    assert.equal(result.directories.length, 0);
    assert.equal(result.copies.length, 0);
});

test("a build in a different location still synchronizes runtime files without source maps or directories", async () => {
    const source = resolve(".codex-temp", "source-dist"), destination = resolve(".codex-temp", "installed-dist");
    const result = await loaderSync(source, destination);
    assert.equal(result.result, join(destination, "patcher.js"));
    assert.deepEqual(result.copies, ["patcher.js", "renderer.js", "node.exe"].map(name => [join(source, name), join(destination, name)]));
});
