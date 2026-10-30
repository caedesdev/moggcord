/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import vm from "node:vm";
import ts from "typescript";
import { transform } from "esbuild";
import { exists, globPlugins, resolvePluginName } from "../build/common.mjs";
import { bundledPlugins, internalPlugins, pluginBundleKind } from "../lib/plugin-bundle.mjs";

const root = process.cwd();
const wanted = ["CustomProfile", "ExportDM", "FakeVoice", "TokenImporter"];

function pluginDefinition(filename) {
    const file = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let definition;
    const visit = node => {
        if (ts.isCallExpression(node) && node.expression.getText(file) === "definePlugin") {
            const argument = ts.isAsExpression(node.arguments[0]) ? node.arguments[0].expression : node.arguments[0];
            if (ts.isObjectLiteralExpression(argument)) definition = argument;
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert(definition, "A plugin definition must be present: " + filename);
    const result = {};
    for (const property of definition.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const key = property.name.getText(file);
        if (key === "name") result.name = property.initializer.text;
        if (key === "dependencies" && ts.isArrayLiteralExpression(property.initializer)) result.dependencies = property.initializer.elements.map(value => value.text);
        if (["required", "enabledByDefault", "hidden"].includes(key))
            result[key] = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
    }
    return result;
}

async function loadGenerated(plugin) {
    let load;
    plugin.setup({ onResolve() {}, onLoad(options, callback) { load = callback; } });
    return (await load()).contents;
}

async function registry(source, native = false) {
    const file = ts.createSourceFile("registry.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const imports = new Map();
    for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier.text;
        if (native) { imports.set(specifier, {}); continue; }
        const base = resolve("src", specifier);
        if (base.endsWith(".css")) imports.set(specifier, await readFile(base, "utf8"));
        else {
            const filename = [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")].find(existsSync);
            assert(filename, "Missing source for " + specifier);
            imports.set(specifier, pluginDefinition(filename));
        }
    }
    const compiled = await transform(source, { format: "cjs", target: "es2022" });
    const module = { exports: {} };
    vm.runInNewContext(compiled.code, { module, exports: module.exports, require: name => {
        assert(imports.has(name), "Unexpected plugin import " + name);
        return imports.get(name);
    } });
    return module.exports;
}

function nativeGenerator() {
    const text = readFileSync(join(root, "scripts/build/build.mjs"), "utf8");
    const file = ts.createSourceFile("build.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const declaration = file.statements.filter(ts.isVariableStatement)
        .flatMap(statement => [...statement.declarationList.declarations])
        .find(node => node.name.getText(file) === "globNativesPlugin");
    assert(declaration);
    return vm.runInNewContext("(" + declaration.initializer.getText(file) + ")", {
        join, resolve, exists, readdir, resolvePluginName, pluginBundleKind
    });
}

test("the bundle policy includes the full catalog with four default plugins and preserves community sources", () => {
    assert.deepEqual(Object.values(bundledPlugins).sort(), wanted);
    for (const folder of Object.keys(bundledPlugins)) assert.equal(pluginBundleKind("moggcordplugins", folder), "standard");
    for (const folder of Object.keys(internalPlugins)) assert.equal(pluginBundleKind("moggcordplugins", folder), "internal");
    for (const folder of ["ghostClient", "massDM", "messageLogger", "themeLibrary", "moggcordUpdater", "unrecognized"])
        assert.equal(pluginBundleKind("moggcordplugins", folder), "optional");
    assert.equal(pluginBundleKind("plugins", "alwaysAnimate"), "optional");
    assert.equal(pluginBundleKind("plugins", "consoleShortcuts"), "optional");
    assert.equal(pluginBundleKind("plugins/_api", "sharedModal.css"), null);
    assert.equal(pluginBundleKind("plugins/_api", "commands.ts"), "internal");
    assert.equal(pluginBundleKind("plugins/_core", "settings.tsx"), "internal");
    for (const name of ["example.ts", "styles.css", "customNativePlugin"])
        assert.equal(pluginBundleKind("userplugins", name), "user");
});

test("the full renderer catalog exposes both desktop plugin collections with only four enabled defaults", async t => {
    const result = await registry(await loadGenerated(globPlugins("discordDesktop")));
    const plugins = result.default;
    const visible = Object.values(plugins).filter(plugin => !plugin.hidden && !result.PluginMeta[plugin.name].userPlugin);
    const vencord = visible.filter(plugin => result.PluginMeta[plugin.name].folderName.startsWith("src/plugins/"));
    t.diagnostic(`Selectable built-ins: ${visible.length}; Vencord: ${vencord.length}; Moggcord: ${visible.length - vencord.length}.`);
    assert(visible.length > 350);
    assert.deepEqual(visible.filter(plugin => plugin.enabledByDefault).map(plugin => plugin.name).sort(), wanted);
    for (const plugin of visible) assert.equal(Boolean(plugin.required), false, plugin.name + " must be optional");
    for (const name of ["AlwaysAnimate", "ConsoleShortcuts", "OpenInApp", "ZipPreview", "GhostClient", "MassDM", "VoiceDownload", "ThemeLibrary", "MoggcordUpdater", "MessageLoggerEnhanced"])
        assert(plugins[name], name + " must be present in the catalog");
    for (const directory of ["plugins", "moggcordplugins"]) for (const entry of await readdir(join(root, "src", directory), { withFileTypes: true })) {
        if (entry.name.startsWith("_") || entry.name.startsWith(".") || entry.name.endsWith(".ini")) continue;
        if (!entry.isDirectory() && !/\.[jt]sx?$/.test(entry.name)) continue;
        const base = join(root, "src", directory, entry.name);
        const filename = entry.isDirectory() ? ["index.ts", "index.tsx"].map(name => join(base, name)).find(existsSync) : base;
        const { name } = pluginDefinition(filename);
        if (result.ExcludedPlugins[name]) continue;
        assert(plugins[name], name + " is missing from src/" + directory);
    }
    const missingDependencies = [];
    for (const plugin of Object.values(plugins))
        for (const dependency of plugin.dependencies ?? []) if (!plugins[dependency]) missingDependencies.push(plugin.name + " is missing " + dependency);
    assert.deepEqual(missingDependencies, []);
    for (const name of ["Settings", "NoTrack", "CommandsAPI", "HeaderBarAPI", "ContextMenuAPI", "UserAreaAPI", ...Object.values(internalPlugins)])
        assert.equal(plugins[name].hidden, true, name + " must stay internal");
    const settings = JSON.parse(readFileSync(join(root, "installer-src/default-settings.json"), "utf8"));
    for (const [name, value] of Object.entries(settings.plugins)) {
        assert(plugins[name], "Installer defaults include a missing plugin: " + name);
        if (!plugins[name].hidden && !wanted.includes(name)) assert.equal(value.enabled, false, name + " is unexpectedly enabled in installer defaults");
    }
    for (const name of wanted) assert.equal(settings.plugins[name].enabled, true);
});

test("the full native registry includes the optional plugin helpers and all four default plugin requirements", async () => {
    const result = await registry(await loadGenerated(nativeGenerator()), true);
    const names = Object.keys(result.default).filter(name => Object.values(bundledPlugins).includes(name));
    assert.deepEqual(names.sort(), ["ExportDM", "TokenImporter"]);
    for (const name of ["ConsoleShortcuts", "OpenInApp", "ZipPreview", "GhostClient", "VoiceMessages", "ThemeLibrary"])
        assert(result.default[name], name + " native helpers must be included");
});

test("the plugin page initially shows both collections and can filter Vencord plugins separately", async () => {
    const text = await readFile(join(root, "src/components/settings/tabs/plugins/index.tsx"), "utf8");
    const file = ts.createSourceFile("plugins.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initialStatus, filter;
    const visit = node => {
        if (ts.isVariableDeclaration(node) && ts.isArrayBindingPattern(node.name) && node.name.elements[0]?.name?.getText(file) === "searchValue") {
            const initial = node.initializer.arguments[0];
            initialStatus = initial.properties.find(property => property.name?.getText(file) === "status")?.initializer.getText(file);
        }
        if (ts.isVariableDeclaration(node) && node.name.getText(file) === "pluginFilter") filter = node.initializer.arguments[0].getText(file);
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert.equal(initialStatus, "SearchStatus.ALL");
    assert(filter);
    const SearchStatus = Object.fromEntries(["ALL", "ENABLED", "DISABLED", "MOGGCORD", "OTHERS", "VENCORD", "NEW", "USER_PLUGINS", "API_PLUGINS", "TUTORIAL"].map((value, index) => [value, index]));
    const searchValue = { status: SearchStatus.ALL };
    const PluginMeta = {
        Moggcord: { folderName: "src/moggcordplugins/example" },
        Vencord: { folderName: "src/plugins/example" },
        Community: { folderName: "src/userplugins/example", userPlugin: true }
    };
    const compiled = await transform(`(${filter})`, { loader: "ts" });
    const predicate = vm.runInNewContext(compiled.code, { SearchStatus, searchValue, PluginMeta, premiumOnly: false, search: "", isPluginEnabled: () => false });
    for (const name of Object.keys(PluginMeta)) assert.equal(predicate({ name }), true);
    searchValue.status = SearchStatus.VENCORD;
    assert.equal(predicate({ name: "Vencord" }), true);
    assert.equal(predicate({ name: "Moggcord" }), false);
    assert.equal(predicate({ name: "Community" }), false);
});

test("community sources and optional built-in plugins build together without enabling optional defaults", async t => {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-bundle-test-"));
    t.after(async () => {
        process.chdir(root);
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert(directory.includes("moggcord-bundle-test-"));
        await rm(directory, { recursive: true, force: true });
    });
    const files = {
        "moggcordplugins/FakeVoice/index.ts": 'definePlugin({name:"FakeVoice",enabledByDefault:true})',
        "moggcordplugins/FakeVoice/native.ts": "export function helper() {}",
        "moggcordplugins/massDM/index.ts": 'definePlugin({name:"MassDM"})',
        "moggcordplugins/massDM/native.ts": "export function unwanted() {}",
        "plugins/extra/index.ts": 'definePlugin({name:"Extra"})',
        "plugins/extra/native.ts": "export function unwanted() {}",
        "userplugins/community.ts": 'definePlugin({name:"CommunityExample"})',
        "userplugins/styles.css": ".example {color:red}",
        "userplugins/nativeExample/index.ts": 'definePlugin({name:"CommunityNative"})',
        "userplugins/nativeExample/native.ts": "export function helper() {}"
    };
    for (const [name, contents] of Object.entries(files)) {
        const filename = join(directory, "src", name);
        await mkdir(dirname(filename), { recursive: true });
        await writeFile(filename, contents);
    }
    process.chdir(directory);
    const renderer = await registry(await loadGenerated(globPlugins("discordDesktop")));
    assert.deepEqual(Object.keys(renderer.default).sort(), ["CommunityExample", "CommunityNative", "Extra", "FakeVoice", "MassDM", "styles"]);
    for (const name of ["Extra", "MassDM"]) {
        assert.equal(renderer.default[name].enabledByDefault, false);
        assert.equal(renderer.default[name].required, false);
    }
    for (const name of ["CommunityExample", "CommunityNative", "styles"]) assert.equal(renderer.PluginMeta[name].userPlugin, true);
    const native = await registry(await loadGenerated(nativeGenerator()), true);
    assert.deepEqual(Object.keys(native.default).sort(), ["CommunityNative", "Extra", "FakeVoice", "MassDM"]);
});

test("restoring the Vencord catalog disables only its stale activations once and preserves later choices", async () => {
    const text = await readFile(join(root, "src/api/PluginManager.ts"), "utf8");
    const file = ts.createSourceFile("PluginManager.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let apply, transition;
    const visit = node => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === "applyDefaultOffPlugins") apply = node.getText(file);
        if (ts.isIfStatement(node) && node.expression.getText(file) === "!plain[VENCORD_CATALOG_FLAG]") transition = node.getText(file);
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert(apply && transition);
    const Plugins = {
        FakeVoice: { name: "FakeVoice", enabledByDefault: true },
        VencordOptional: { name: "VencordOptional", enabledByDefault: false },
        MoggcordOptional: { name: "MoggcordOptional", enabledByDefault: false },
        Settings: { name: "Settings", required: true },
        Community: { name: "Community" }
    };
    const PluginMeta = {
        FakeVoice: { folderName: "src/moggcordplugins/FakeVoice" },
        VencordOptional: { folderName: "src/plugins/optional" },
        MoggcordOptional: { folderName: "src/moggcordplugins/optional" },
        Settings: { folderName: "src/plugins/_core/settings.tsx" },
        Community: { folderName: "src/userplugins/example", userPlugin: true }
    };
    const plain = { plugins: Object.fromEntries(Object.keys(Plugins).map(name => [name, { enabled: true, preference: "keep" }])) };
    let changes = 0;
    const context = vm.createContext({ Plugins, PluginMeta, plain, VENCORD_CATALOG_FLAG: "vencord_catalog", SettingsStore: { plain, markAsChanged: () => changes++ } });
    const { code } = await transform(apply + "\n" + transition, { loader: "ts" });
    vm.runInContext(code, context);
    assert.equal(plain.plugins.VencordOptional.enabled, false);
    assert.equal(plain.plugins.VencordOptional.preference, "keep");
    for (const name of ["FakeVoice", "MoggcordOptional", "Settings", "Community"]) assert.equal(plain.plugins[name].enabled, true);
    plain.plugins.VencordOptional.enabled = true;
    vm.runInContext(code, context);
    assert.equal(plain.plugins.VencordOptional.enabled, true);
    assert.equal(changes, 1);
});

test("catalog activation migration disables other built-ins once while preserving community settings and later user choices", async () => {
    const text = await readFile(join(root, "src/api/PluginManager.ts"), "utf8");
    const file = ts.createSourceFile("PluginManager.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let apply, transition;
    const visit = node => {
        if (ts.isFunctionDeclaration(node) && node.name?.text === "applyDefaultOffPlugins") apply = node.getText(file);
        if (ts.isIfStatement(node) && node.expression.getText(file) === "!plain[FULL_CATALOG_FLAG]") transition = node.getText(file);
        ts.forEachChild(node, visit);
    };
    visit(file);
    assert(apply && transition);
    const Plugins = {
        FakeVoice: { name: "FakeVoice", enabledByDefault: true },
        Optional: { name: "Optional", enabledByDefault: false, required: false },
        Settings: { name: "Settings", required: true },
        Community: { name: "Community" }
    };
    const plain = { plugins: { FakeVoice: { enabled: true }, Optional: { enabled: true, preference: "keep" }, Settings: { enabled: true }, Community: { enabled: true } } };
    let changes = 0;
    const context = vm.createContext({ Plugins, PluginMeta: { Community: { userPlugin: true } }, plain, FULL_CATALOG_FLAG: "full_catalog", SettingsStore: { plain, markAsChanged: () => changes++ } });
    const { code } = await transform(apply + "\n" + transition, { loader: "ts" });
    vm.runInContext(code, context);
    assert.equal(plain.plugins.Optional.enabled, false);
    assert.equal(plain.plugins.Optional.preference, "keep");
    assert.equal(plain.plugins.FakeVoice.enabled, true);
    assert.equal(plain.plugins.Settings.enabled, true);
    assert.equal(plain.plugins.Community.enabled, true);
    plain.plugins.Optional.enabled = true;
    vm.runInContext(code, context);
    assert.equal(plain.plugins.Optional.enabled, true);
    assert.equal(changes, 1);
});

test("saved plugin choices override disabled defaults and missing optional plugins start disabled", async () => {
    const text = await readFile(join(root, "src/api/Settings.ts"), "utf8");
    const file = ts.createSourceFile("Settings.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const initialization = file.statements.find(node => ts.isIfStatement(node) && node.expression.getText(file) === "!IS_REPORTER && settings.plugins && plugins");
    assert(initialization);
    const settings = { plugins: { FakePerm: { enabled: true }, FakeVoice: { enabled: false } } };
    const plugins = { FakePerm: { enabledByDefault: false }, MacOsButtons: { enabledByDefault: false }, FakeVoice: { enabledByDefault: true }, TokenImporter: { enabledByDefault: true } };
    const { code } = await transform(initialization.getText(file), { loader: "ts" });
    vm.runInNewContext(code, { settings, plugins, IS_REPORTER: false });
    assert.equal(settings.plugins.FakePerm.enabled, true);
    assert.equal(settings.plugins.MacOsButtons.enabled, false);
    assert.equal(settings.plugins.FakeVoice.enabled, false);
    assert.equal(settings.plugins.TokenImporter.enabled, true);
    assert(!text.includes("FORCE_DISABLED_DEFAULT_PLUGIN_KEYS"));
});
