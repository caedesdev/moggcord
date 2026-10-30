/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const { code } = await transform(await readFile("src/api/SettingsSync/pluginImport.ts", "utf8"), { loader: "ts", format: "cjs" });
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports });
const { inspectPluginImport } = module.exports;

test("181 saved entries can correctly result in 22 enabled visible plugins without losing imported choices", () => {
    const imported = {}, catalog = {}, current = {};
    for (let index = 0; index < 17; index++) {
        imported[`Ready${index}`] = { enabled: true };
        catalog[`Ready${index}`] = {};
    }
    for (let index = 0; index < 15; index++) {
        imported[`API${index}`] = { enabled: true };
        catalog[`API${index}`] = { hidden: true };
    }
    for (let index = 0; index < 6; index++) imported[`Missing${index}`] = { enabled: true };
    for (let index = 0; index < 143; index++) {
        imported[`Disabled${index}`] = { enabled: false };
        if (index < 124) catalog[`Disabled${index}`] = {};
    }
    for (let index = 0; index < 5; index++) {
        current[`Existing${index}`] = { enabled: true };
        catalog[`Existing${index}`] = {};
    }
    const before = JSON.stringify({ imported, current });
    const report = inspectPluginImport(imported, catalog, {}, current);
    assert.equal(report.configured, 181);
    assert.equal(report.enabledInBackup, 38);
    assert.equal(report.ready.length, 17);
    assert.equal(report.internal.length, 15);
    assert.equal(report.missing.length, 6);
    assert.equal(report.disabled.length, 143);
    assert.equal(report.missingDisabled.length, 19);
    assert.equal(report.projectedEnabled.length, 22);
    assert.equal(JSON.stringify({ imported, current }), before);
});

test("disabled entries override current activation, missing flags preserve it and unsupported targets are separate", () => {
    const report = inspectPluginImport({ Disable: { enabled: false }, Keep: { setting: 1 }, Unavailable: { enabled: true }, Required: { enabled: true }, NewDefault: {} },
        { Disable: {}, Keep: {}, Required: { required: true }, NewDefault: { enabledByDefault: true } }, { Unavailable: "web" }, { Disable: { enabled: true }, Keep: { enabled: true } });
    assert.deepEqual(Array.from(report.projectedEnabled), ["Keep", "NewDefault"]);
    assert.equal(report.incompatible[0].name, "Unavailable");
    assert.equal(report.incompatible[0].target, "web");
    assert.equal(report.missing.length, 0);
    assert.equal(report.unchanged.length, 2);
    assert.equal(report.internal[0], "Required");
});

test("invalid settings cannot be reported as importable plugins", () => {
    for (const invalid of [null, [], true, { Broken: null }, { Broken: { enabled: "true" } }, { Broken: [] }])
        assert.throws(() => inspectPluginImport(invalid, {}, {}, {}), /valid|invalid/);
    assert.equal(inspectPluginImport({}, {}, {}, {}).configured, 0);
});

async function previewHarness() {
    const imports = {}, cells = [];
    let index = 0, modal, options, onClose, restarts = 0;
    const { code } = await transform(await readFile("src/components/settings/tabs/sync/ImportPreview.tsx", "utf8"), { loader: "tsx", format: "cjs" });
    imports["./ImportPreview.css"] = {};
    imports["@components/Button"] = { Button: "button" };
    imports["@components/ErrorBoundary"] = { wrap: value => value };
    imports["@components/Heading"] = { Heading: "heading" };
    imports["@utils/css"] = { classNameFactory: prefix => (...names) => names.map(name => prefix + name).join(" ") };
    imports["@utils/Logger"] = { Logger: class { error() {} } };
    imports["@utils/native"] = { relaunch: () => restarts++ };
    imports["@utils/modal"] = {
        ModalRoot: "modal", ModalHeader: "header", ModalFooter: "footer", ModalContent: "content", ModalCloseButton: "close", ModalSize: { LARGE: "large" },
        openModal: (render, opts) => { modal = render; options = opts; onClose = () => opts.onCloseCallback(); return "preview"; },
        closeModal: () => onClose()
    };
    imports["@webpack/common"] = { React: {
        createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
        useState: initial => { const slot = index++; if (!(slot in cells)) cells[slot] = initial; return [cells[slot], value => { cells[slot] = value; }]; }
    } };
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => { assert(Object.hasOwn(imports, name), name); return imports[name]; } });
    const find = (element, predicate) => {
        if (!element || typeof element !== "object") return;
        if (predicate(element)) return element;
        return element.props?.children.flat(Infinity).map(child => find(child, predicate)).find(Boolean);
    };
    const render = () => { index = 0; const element = modal({ onClose, transitionState: 2 }); return element.type(element.props); };
    return { ...module.exports, find, render, close: () => options.onCloseRequest(), get restarts() { return restarts; } };
}

test("preview cancellation writes nothing and import is explicit, deduplicated and restart remains a separate action", async () => {
    const harness = await previewHarness();
    const report = inspectPluginImport({ Example: { enabled: true }, Missing: { enabled: true } }, { Example: {} }, {}, {});
    let imports = 0;
    const cancelled = harness.reviewPluginImport(report, async () => { imports++; });
    harness.render();
    harness.close();
    assert.equal(await cancelled, false);
    assert.equal(imports, 0);
    const completed = harness.reviewPluginImport(report, async () => { imports++; });
    const review = harness.render();
    const button = harness.find(review, element => element.type === "button" && element.props.children.includes("Import settings"));
    assert(button);
    const first = button.props.onClick();
    const second = button.props.onClick();
    await Promise.all([first, second]);
    assert.equal(imports, 1);
    assert.equal(harness.restarts, 0);
    const done = harness.render();
    const restart = harness.find(done, element => element.type === "button" && element.props.children.includes("Restart Discord"));
    assert(restart);
    restart.props.onClick();
    assert.equal(await completed, true);
    assert.equal(harness.restarts, 1);
});

test("failed import stays in the review with retry and never offers an automatic restart", async () => {
    const harness = await previewHarness();
    const report = inspectPluginImport({ Example: { enabled: true } }, { Example: {} }, {}, {});
    const pending = harness.reviewPluginImport(report, async () => { throw new Error("fixture write failure"); });
    const button = harness.find(harness.render(), element => element.type === "button" && element.props.children.includes("Import settings"));
    await button.props.onClick();
    const failed = harness.render();
    assert(harness.find(failed, element => element.props.role === "alert"));
    assert.equal(harness.restarts, 0);
    assert.equal(harness.find(failed, element => element.type === "button" && element.props.children.includes("Restart Discord")), undefined);
    harness.close();
    assert.equal(await pending, false);
});
