/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

async function load(filename, imports, globals = {}) {
    const source = await readFile(new URL(filename, import.meta.url), "utf8");
    const compiled = await transform(source, { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(compiled.code, { module, exports: module.exports, ...globals, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    return module.exports;
}

let renderedProps;
const plugin = (await load("../../src/moggcordplugins/_api/userArea.ts", {
    "@utils/constants": { Devs: { prism: {} } },
    "@utils/types": definition => definition
}, { Vencord: { Api: { UserArea: { _renderButtons: props => { renderedProps = props; return []; } } } } })).default;
const { canonicalizeMatch, canonicalizeReplace } = await load("../../src/utils/patches.ts", {
    "./intlHash": { runtimeHashMessageKey: () => { throw new Error("Unexpected translation lookup"); } }
});

const panelSource = `function panel(props){let{nameplate:plate}=props;return React.jsxs("div",{className:css.controls,style:panelStyle,children:[React.jsx("mute",{selfMute:props.selfMute,iconForeground:null!=plate?css.iconTint:void 0}),React.jsx("deafen",{}),React.jsx("settings",{onContextMenu:props.handleOpenSettingsContextMenu})]})}`;

for (const nameplate of [null, { id: "plate" }]) {
    test(`the current account panel renders the extra button and preserves native controls ${nameplate ? "with" : "without"} a nameplate`, () => {
        const { find, replacement } = plugin.patches[0];
        assert(panelSource.includes(find));
        const match = canonicalizeMatch(replacement.match);
        assert.equal([...panelSource.matchAll(new RegExp(match.source, "g"))].length, 1);
        const patched = panelSource.replace(match, canonicalizeReplace(replacement.replace, "plugin"));
        let received;
        const panel = vm.runInNewContext(`(${patched})`, {
            React: { jsx: (kind, props) => ({ kind, props }), jsxs: (kind, props) => ({ kind, props }) },
            css: { controls: "controls", iconTint: "nameplate-icon" },
            panelStyle: { color: "red", minWidth: 180 },
            plugin: { renderButtons: (props, iconForeground) => { received = { props, iconForeground }; return [{ kind: "FakeVoice" }]; } }
        });
        const props = { nameplate, selfMute: true, handleOpenSettingsContextMenu() {} };
        const result = panel(props);
        assert.equal(result.props.children.map(child => child.kind).join(","), "FakeVoice,mute,deafen,settings");
        assert.equal(result.props.children[1].props.selfMute, true);
        assert.equal(result.props.children[3].props.onContextMenu, props.handleOpenSettingsContextMenu);
        assert.equal(result.props.style.minWidth, 0);
        assert.equal(result.props.style.color, "red");
        assert.equal(received.props, props);
        assert.equal(received.iconForeground, nameplate ? "nameplate-icon" : undefined);
    });
}

test("the account panel patch tolerates renamed Discord symbols", () => {
    const renamed = panelSource.replaceAll("css", "_styles$").replaceAll("panelStyle", "style$2").replaceAll("plate", "namePlate");
    const replacement = plugin.patches[0].replacement;
    assert.notEqual(renamed.replace(canonicalizeMatch(replacement.match), canonicalizeReplace(replacement.replace, "plugin")), renamed);
});

test("account buttons use the actual native icon class instead of a removed CSS export", () => {
    const nameplate = { id: "plate" };
    plugin.renderButtons({ nameplate }, "native-icon-class");
    assert.equal(renderedProps.nameplate, nameplate);
    assert.equal(renderedProps.iconForeground, "native-icon-class");
    assert.equal(renderedProps.hideTooltips, false);
});

test("unrelated rows are left unchanged", () => {
    const source = 'function other(){return React.jsxs("div",{className:css.row,style:rowStyle,children:[React.jsx("label",{})]})}';
    const replacement = plugin.patches[0].replacement;
    assert.equal(source.replace(canonicalizeMatch(replacement.match), replacement.replace), source);
});
