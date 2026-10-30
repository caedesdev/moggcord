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

const utils = await readFile("src/webpack/common/utils.ts", "utf8");
const toastCode = utils.slice(utils.indexOf("const ToastType ="), utils.indexOf("export const UserUtils ="));

async function loadToast() {
    const { code } = await transform(toastCode, { loader: "ts", format: "cjs" });
    const shown = [], popped = [];
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, mapMangledModuleLazy: () => ({ showToast: value => shown.push(value), popToast: () => popped.push(true) }), filters: { byCode() {} } });
    return { ...module.exports, shown, popped };
}

test("legacy toast calls deliver visible text, native variants, position and duration to current Discord", async () => {
    const { Toasts, showToast, shown } = await loadToast();
    showToast("Settings imported. Restart Discord.", Toasts.Type.SUCCESS, { position: Toasts.Position.BOTTOM, duration: 8000 });
    const toast = shown.at(-1);
    assert.equal(toast.text, "Settings imported. Restart Discord.");
    assert.equal(toast.variant, "success");
    assert.equal(toast.position, "bottom");
    assert.equal(toast.duration, 8000);
    assert.equal(toast.message, undefined);
    assert.equal(toast.options, undefined);
    Toasts.show({ message: "Update failed. Try again.", type: Toasts.Type.FAILURE, id: "error" });
    assert.equal(shown.at(-1).text, "Update failed. Try again.");
    assert.equal(shown.at(-1).variant, "critical");
    assert.equal(shown.at(-1).position, "top");
    assert.equal(shown.at(-1).duration, 6000);
    showToast("Update downloaded.");
    assert.equal(shown.at(-1).variant, "default");
});

test("blank messages get readable fallbacks and custom content and pop remain compatible", async () => {
    const { Toasts, shown, popped } = await loadToast();
    for (const type of Object.values(Toasts.Type)) {
        Toasts.show({ message: "  ", id: "empty", type });
        assert(shown.at(-1).text.trim().length > 0);
    }
    const component = { type: "custom", props: {} };
    Toasts.show({ message: "Custom notice", id: "custom", type: Toasts.Type.CUSTOM, options: { component, duration: 2500 } });
    assert.equal(shown.at(-1).__dangerouslyRenderContent(), component);
    assert.equal(shown.at(-1).duration, 2500);
    assert.equal(Toasts.create("Kept", Toasts.Type.SUCCESS).message, "Kept");
    Toasts.pop();
    assert.equal(popped.length, 1);
});

async function loadImport({ file, type = "all", notify = true, rejectWrite = false, cancelReview = false } = {}) {
    const toastApi = await loadToast();
    const plain = { plugins: { Existing: { enabled: true } } };
    const writes = [], css = [], data = [], errors = [], reviews = [];
    const inspection = await transform(await readFile("src/api/SettingsSync/pluginImport.ts", "utf8"), { loader: "ts", format: "cjs" });
    const inspectionModule = { exports: {} };
    vm.runInNewContext(inspection.code, { module: inspectionModule, exports: inspectionModule.exports });
    const imports = {
        "@api/Settings": { PlainSettings: plain },
        "./pluginImport": inspectionModule.exports,
        "~plugins": { __esModule: true, default: { Example: {} }, ExcludedPlugins: {} },
        "@components/settings/tabs/sync/ImportPreview": { reviewPluginImport: async (report, apply) => {
            assert.equal(writes.length, 0);
            reviews.push(report);
            if (cancelReview) return false;
            await apply();
            return true;
        } },
        "@utils/Logger": { Logger: class { error(...values) { errors.push(values); } } },
        "@utils/web": {},
        "@webpack/common": { Toasts: toastApi.Toasts },
        "..": { DataStore: { setMany: async values => data.push(values) } }
    };
    const { code } = await transform(await readFile("src/api/SettingsSync/offline.ts", "utf8"), { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, IS_DISCORD_DESKTOP: true, TextDecoder,
        DiscordNative: { fileManager: { openFiles: async () => file == null ? [] : [{ data: new TextEncoder().encode(file) }] } },
        VencordNative: { settings: { set: async value => { if (rejectWrite) throw new Error("Fixture write failed"); writes.push(value); } }, quickCss: { set: async value => css.push(value) } },
        require: name => { assert(Object.hasOwn(imports, name), name); return imports[name]; }
    });
    await module.exports.uploadSettingsBackup(type, notify);
    return { ...toastApi, plain, writes, css, data, errors, reviews };
}

test("Vencord settings import reports completion and restart instructions after the write", async () => {
    const state = await loadImport({ file: JSON.stringify({ settings: { plugins: { Example: { enabled: true } } } }) });
    assert.equal(state.writes.length, 1);
    assert.equal(state.reviews.length, 1);
    assert.equal(state.reviews[0].ready[0], "Example");
    assert.equal(state.plain.plugins.Example.enabled, true);
    assert.equal(state.shown.at(-1).variant, "success");
    assert.match(state.shown.at(-1).text, /Settings imported.*close Discord.*reopen/);
    assert.equal(state.shown.at(-1).duration, 8000);
    const plugins = await loadImport({ file: JSON.stringify({ settings: { plugins: {} } }), type: "plugins" });
    assert.match(plugins.shown.at(-1).text, /Plugin settings imported/);
    const css = await loadImport({ file: JSON.stringify({ quickCss: "body {}" }), type: "css" });
    assert.equal(css.css[0], "body {}");
    assert.equal(css.reviews.length, 0);
    assert.match(css.shown.at(-1).text, /QuickCSS imported/);
});

test("failed or malformed imports show a useful error while cancel and silent imports stay quiet", async () => {
    for (const options of [{ file: "not-json" }, { file: "{}" }, { file: '{"settings":{}}', rejectWrite: true }]) {
        const state = await loadImport(options);
        assert.equal(state.shown.at(-1).variant, "critical");
        assert.match(state.shown.at(-1).text, /Import failed.*JSON backup.*try again/);
        assert.equal(state.shown.at(-1).duration, 10000);
        assert.equal(state.writes.length, 0);
    }
    assert.equal((await loadImport()).shown.length, 0);
    assert.equal((await loadImport({ file: '{"settings":{}}', notify: false })).shown.length, 0);
    const cancelled = await loadImport({ file: '{"settings":{"plugins":{"Example":{"enabled":true}}}}', cancelReview: true });
    assert.equal(cancelled.reviews.length, 1);
    assert.equal(cancelled.writes.length, 0);
    assert.equal(cancelled.plain.plugins.Example, undefined);
    assert.equal(cancelled.shown.length, 0);
});

const updaterText = await readFile("src/components/settings/tabs/updater/index.tsx", "utf8");
const updaterFile = ts.createSourceFile("updater.tsx", updaterText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const updaterFunction = updaterFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "UpdaterTab");

async function loadUpdater({ download = true, installed = true, failure, available = true } = {}) {
    const toastApi = await loadToast();
    const states = new Map(), timers = [], calls = [];
    let index = 0;
    const setters = ["checking", "downloading", "status", "checked", "outdated", "list", "error"];
    const source = updaterFunction.getText(updaterFile);
    const { code } = await transform(`(${source.replace(/return \([\s\S]*$/, "return {handleCheck, handleUpdate};}")})`, { loader: "tsx" });
    const updater = vm.runInNewContext(code, {
        useState: initial => { const name = setters[index++]; states.set(name, initial); return [initial, value => states.set(name, value)]; },
        changes: [], checkForUpdates: async () => { if (failure === "check") throw new Error("Fixture check failed"); return available; },
        update: async () => { calls.push("download"); if (failure === "download") throw new Error("Fixture download failed"); return download; },
        rebuild: async () => { calls.push("install"); if (failure === "install") throw new Error("Fixture install failed"); return installed; },
        relaunch: () => calls.push("restart"), setTimeout: (fn, delay) => timers.push({ fn, delay }),
        Toasts: toastApi.Toasts, UpdateLogger: { error() {} }
    })();
    return { ...toastApi, updater, states, timers, calls };
}

test("successful update gives visible progress, confirms installation and explains the pending restart", async () => {
    const state = await loadUpdater();
    await state.updater.handleUpdate();
    assert.deepEqual(state.calls, ["download", "install"]);
    assert.match(state.states.get("status"), /installed successfully.*restart/);
    assert.equal(state.shown.at(-1).variant, "success");
    assert.match(state.shown.at(-1).text, /Update successful/);
    assert.equal(state.timers[0].delay, 3000);
    assert.equal(state.states.get("outdated"), false);
    state.timers[0].fn();
    assert.equal(state.calls.at(-1), "restart");
});

test("download failure never installs or restarts; deferred installation and errors explain recovery", async () => {
    for (const options of [{ download: false }, { failure: "download" }, { failure: "install" }]) {
        const state = await loadUpdater(options);
        await state.updater.handleUpdate();
        if (options.download === false || options.failure === "download") assert.deepEqual(state.calls, ["download"]);
        assert.equal(state.shown.at(-1).variant, "critical");
        assert.match(state.states.get("error"), /try again.*Repair/);
        assert.equal(state.timers.length, 0);
        assert.equal(state.states.get("downloading"), false);
    }
    const deferred = await loadUpdater({ installed: false });
    await deferred.updater.handleUpdate();
    assert.match(deferred.states.get("status"), /not installed yet.*close Discord.*Repair/);
    assert.equal(deferred.timers.length, 0);
    assert.equal(deferred.shown.at(-1).duration, 10000);
});

test("update checks explain available, current and failed results and always clear the busy state", async () => {
    for (const options of [{ available: true }, { available: false }, { failure: "check" }]) {
        const state = await loadUpdater(options);
        await state.updater.handleCheck();
        assert.equal(state.states.get("checking"), false);
        if (options.failure) {
            assert.equal(state.shown.at(-1).variant, "critical");
            assert.match(state.shown.at(-1).text, /connection.*try again/);
        } else assert.match(state.states.get("status"), options.available ? /Update Now/ : /No action is needed/);
    }
});
