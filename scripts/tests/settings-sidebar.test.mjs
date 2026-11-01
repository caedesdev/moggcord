/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const { code } = await transform(await readFile("src/plugins/_core/settings.tsx", "utf8"), { loader: "tsx", format: "cjs", jsx: "transform" });

function loadSidebar({ stealth = false } = {}) {
    const module = { exports: {} };
    const Component = () => null;
    const imports = {
        "./settings.css": {},
        "@api/Settings": { definePluginSettings: () => ({ store: { settingsLocation: "aboveNitro" } }) },
        "@components/Icons": Object.fromEntries(["BackupRestoreIcon", "MainSettingsIcon", "PaintbrushIcon", "PatchHelperIcon", "PluginsIcon", "UpdaterIcon"].map(name => [name, Component])),
        "@components/settings": Object.fromEntries(["BackupAndRestoreTab", "PatchHelperTab", "PluginsTab", "ThemesTab", "UpdaterTab", "VencordTab"].map(name => [name, Component])),
        "@shared/vencordUserAgent": { gitHashShort: "fixture" },
        "@utils/constants": { Devs: { Ven: {}, Megu: {} } },
        "@utils/css": { classNameFactory: prefix => name => prefix + name },
        "@utils/guards": { isTruthy: Boolean },
        "@utils/types": { __esModule: true, default: plugin => plugin, OptionType: { SELECT: 0 } },
        "~plugins": { default: {} },
        "@webpack": { findByPropsLazy: () => ({}), waitFor() {} },
        "@webpack/common": { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.length === 1 ? children[0] : children } }) } }
    };
    vm.runInNewContext(code, {
        module, exports: module.exports, IS_DEV: false, IS_UPDATER_DISABLED: false,
        localStorage: { getItem: key => key === "Moggcord_stealthMode" && stealth ? "1" : null },
        require(name) { assert(Object.hasOwn(imports, name), "Unexpected import: " + name); return imports[name]; }
    });
    return module.exports.default;
}

test("Moggcord branding belongs to the core sidebar while navigation and panel search titles remain plain", () => {
    const plugin = loadSidebar();
    const billing = { key: "billing_section", useTitle: () => "Billing" };
    const layout = [{ key: "user_section" }, billing, { key: "logout_section" }];
    const output = plugin.buildLayout({ key: "$Root", buildLayout: () => layout });
    const section = output.find(node => node.key === "equicord_section");
    assert.equal(output.indexOf(section), output.indexOf(billing) - 1);
    const heading = section.useTitle();
    assert.equal(heading.type, "span");
    assert.equal(heading.props.children, "Moggcord Settings");
    assert.equal(heading.props.className, "vc-moggcord-settings-brand");
    assert.equal(billing.useTitle(), "Billing");
    const entries = section.buildLayout();
    assert.deepEqual(Array.from(entries, node => node.useTitle()), ["Moggcord", "Plugins", "Themes", "Updater", "Backup & Restore"]);
    assert.equal(entries[0].buildLayout()[0].useTitle(), "Moggcord Settings");
    assert.equal(plugin.buildLayout({ key: "$Root", buildLayout: () => output }).filter(node => node.key === "equicord_section").length, 1);
});

test("stealth mode hides the branded heading and unrelated settings layouts remain untouched", () => {
    const plugin = loadSidebar({ stealth: true });
    const original = [{ key: "server_section", useTitle: () => "Server settings" }];
    assert.equal(plugin.buildLayout({ key: "$Server", buildLayout: () => original }), original);
    const section = plugin.buildLayout({ key: "$Root", buildLayout: () => [{ key: "billing_section" }] }).find(node => node.key === "equicord_section");
    assert.equal(section.useTitle(), "");
    assert.equal(section.buildLayout().length, 1);
    assert.equal(section.buildLayout()[0].useTitle(), "Moggcord");
});

test("the legacy glint plugin no longer starts polling or scans the document", async () => {
    const transformed = await transform(await readFile("src/moggcordplugins/settingsGlint/index.tsx", "utf8"), { loader: "tsx", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(transformed.code, { module, exports: module.exports, require: () => ({ __esModule: true, default: value => value }) });
    const plugin = module.exports.default;
    assert.equal(plugin.name, "SettingsGlint");
    assert.equal(plugin.hidden, true);
    assert.equal(plugin.start, undefined);
    assert.equal(plugin.stop, undefined);
});
