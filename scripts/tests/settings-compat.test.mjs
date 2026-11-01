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
    const { code } = await transform(source, { loader: "tsx", format: "cjs", jsx: "transform" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: name => {
        assert(Object.hasOwn(imports, name), "Unexpected import: " + name);
        return imports[name];
    } });
    return module.exports;
}

const componentsSource = await readFile("src/webpack/common/components.ts", "utf8");
const componentsFile = ts.createSourceFile("components.ts", componentsSource, ts.ScriptTarget.Latest, true);
const focusDeclaration = componentsFile.statements.filter(ts.isVariableStatement)
    .find(statement => statement.declarationList.declarations.some(declaration => declaration.name.getText(componentsFile) === "FocusLock"));
assert(focusDeclaration);
const { FocusLock: focus } = await load(focusDeclaration.getText(componentsFile), {}, {
    waitForComponent: (name, filter, fallback) => ({ name, filter, fallback }),
    filters: { componentByCode: (...patterns) => component => patterns.every(pattern => pattern.test(String(component))) }
});

test("FocusLock recognizes current Canary and older Discord components without matching unrelated refs", () => {
    const current = "function FocusLock(props){let{disableReturn:value}=props;return useFocus(props.containerRef,{disableReturn:value}),props.children}";
    const older = "function FocusLock(props){return useFocus(props.containerRef,{keyboardModeEnabled:true}),props.children}";
    assert.equal(focus.filter(current), true);
    assert.equal(focus.filter(older), true);
    assert.equal(focus.filter("function Other(props){return useFocus(props.otherRef,{disableReturn:true}),props.children}"), false);
    assert.equal(focus.filter("function Other(props){return props.containerRef}"), false);
});

test("an unavailable focus component preserves the server settings content instead of rendering an empty layer", async () => {
    const child = { type: "server-settings", props: { title: "Server overview" } };
    assert.equal(focus.fallback({ children: child }), child);
    assert.equal(focus.fallback({}), null);
    const FocusLock = props => focus.fallback(props);
    FocusLock.$$vencordGetWrappedComponent = () => focus.fallback;
    const react = {
        createElement: (type, props, ...children) => ({ type, props: { ...props, ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}) } }),
        useRef: () => ({ current: null }), useEffect() {}
    };
    const { default: plugin } = await load(await readFile("src/plugins/betterSettings/index.tsx", "utf8"), {
        "@api/Settings": { definePluginSettings: value => ({ store: Object.fromEntries(Object.entries(value).map(([key, option]) => [key, option.default])) }) },
        "@api/Styles": { enableStyle() {}, disableStyle() {} },
        "@moggcordplugins/equicordToolbox/menu": { buildPluginMenuEntries: () => [], buildThemeMenuEntries: () => [] },
        "@utils/constants": { Devs: { Kyuuhachi: {} } },
        "@utils/css": { classNameFactory: () => () => "layer" },
        "@utils/Logger": { Logger: class { error() { assert.fail("Dependencies should be available"); } } },
        "@utils/types": { __esModule: true, default: definition => definition, OptionType: { BOOLEAN: 0 } },
        "@webpack": { findCssClassesLazy: () => ({ layer: "layer", baseLayer: "baseLayer" }) },
        "@webpack/common": { ...react, FocusLock, ComponentDispatch: { dispatch() {} }, Menu: {} },
        "./fullHeightContext.css?managed": "style"
    }, { React: react });
    let rendered = plugin.Layer({ mode: "SHOWN", children: child });
    while (typeof rendered.type === "function") rendered = rendered.type(rendered.props);
    assert.equal(rendered.type, "div");
    assert.equal(rendered.props.children, child);
    assert.equal(rendered.props["aria-hidden"], false);
    assert.equal(rendered.props.style.opacity, undefined);
});

test("the relaunch UI guard waits for DOMContentLoaded before adding its style", async () => {
    let head = null;
    const styles = [];
    const document = {
        get head() { return head; }, documentElement: null,
        getElementById: () => null,
        createElement: () => ({}), querySelector: () => null
    };
    const { default: plugin } = await load(await readFile("src/moggcordplugins/uiRelaunchFix/index.tsx", "utf8"), {
        "@shared/noDragGuard": { NO_DRAG_GUARD_CSS: "button { app-region: no-drag; }", NO_DRAG_GUARD_STYLE_ID: "guard" },
        "@utils/types": { __esModule: true, default: definition => definition, StartAt: { Init: "Init", DOMContentLoaded: "DOMContentLoaded" } },
        "@webpack/common": { onFluxDispatcherReady: callback => callback({ subscribe() {} }) }
    }, { document, window: { addEventListener() {} }, setInterval: () => 1, setTimeout: () => 1, clearInterval() {} });
    assert.equal(plugin.startAt, "DOMContentLoaded");
    assert.equal(styles.length, 0);
    head = { appendChild: element => styles.push(element) };
    plugin.start();
    assert.equal(styles.length, 1);
    assert.equal(styles[0].id, "guard");
    plugin.stop();
});

const { canonicalizeMatch, canonicalizeReplace } = await load(await readFile("src/utils/patches.ts", "utf8"), {
    "./intlHash": { runtimeHashMessageKey() { assert.fail("Unexpected translation lookup"); } }
});
const { default: messages } = await load(await readFile("src/plugins/_api/messageEvents.ts", "utf8"), {
    "@utils/constants": { Devs: { Arjix: {}, hunt: {}, Ven: {} } },
    "@utils/types": { __esModule: true, default: definition => definition }
});

for (const asynchronous of [false, true]) {
    test(`message sending remains valid with a ${asynchronous ? "async" : "sync"} Discord callback and preserves cancellation arguments`, async () => {
        const source = `function send(channel){return (0,prepare)({content:"hello",channel:channel}).then(${asynchronous ? "async " : ""}response=>{let parsed=Parser.api.parse(channel,"hello"),reply=Options.getSendMessageOptions({allowed:true});reply.flags=1;return{shouldClear:true,parsed}})}`;
        const patch = messages.patches[1].replacement;
        const patched = source.replace(canonicalizeMatch(patch.match), canonicalizeReplace(patch.replace, "plugin"));
        assert.notEqual(patched, source);
        for (const cancel of [false, true]) {
            let received;
            const reply = {};
            const send = vm.runInNewContext("(" + patched + ")", {
                prepare: async () => ({}), Parser: { api: { parse: () => ({ content: "hello" }) } },
                Options: { getSendMessageOptions: () => reply },
                Vencord: { Api: { MessageEvents: { _handlePreSend: async (...args) => { received = args; return cancel; } } } }
            });
            const channel = { id: "channel" };
            const result = await send(channel);
            assert.equal(result.shouldClear, !cancel);
            assert.equal(result.shouldRefocus, cancel ? true : undefined);
            assert.equal(received[0], channel.id);
            assert.equal(received[1].content, "hello");
            assert.equal(received[2].channel, channel);
            assert.equal(received[3], reply);
            assert.equal(reply.flags, cancel ? undefined : 1);
        }
    });
    for (const current of [false, true]) test(`message edits support ${current ? "current" : "older"} Discord parameters with a ${asynchronous ? "async" : "sync"} callback`, async () => {
        const source = `function edit(channel,message){return (0,prepare)({content:"edited",channel:channel${current ? ",message:message" : ""}}).then(${asynchronous ? "async " : ""}response=>{response.content!==this.props.message.content&&save(channel.id,message.id,response)})}`;
        const patch = messages.patches[0].replacement;
        const patched = source.replace(canonicalizeMatch(patch.match), canonicalizeReplace(patch.replace, "plugin"));
        assert.notEqual(patched, source);
        assert.doesNotThrow(() => new vm.Script("(" + patched + ")"));
        assert.equal((patched.match(/async /g) ?? []).length, 1);
        for (const cancel of [false, true]) {
            let saves = 0;
            let received;
            const edit = vm.runInNewContext("(" + patched + ")", {
                prepare: async () => ({ content: "edited" }), save: () => { saves++; },
                Vencord: { Api: { MessageEvents: { _handlePreEdit: async (...args) => { received = args; return cancel; } } } }
            });
            const result = await edit.call({ props: { message: { content: "before" } } }, { id: "channel" }, { id: "message" });
            assert.equal(saves, cancel ? 0 : 1);
            assert.equal(received[0], "channel");
            assert.equal(received[1], "message");
            assert.equal(received[2].content, "edited");
            if (cancel) assert.equal(result.shouldClear, false);
        }
    });
}
