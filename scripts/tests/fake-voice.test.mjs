/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const compiled = await transform(await readFile("src/moggcordplugins/FakeVoice/index.tsx", "utf8"), { loader: "tsx", format: "cjs" });
const patchUtils = await transform(await readFile("src/utils/patches.ts", "utf8"), { loader: "ts", format: "cjs" });
const patchModule = { exports: {} };
vm.runInNewContext(patchUtils.code, { module: patchModule, exports: patchModule.exports, require: () => ({}) });
const { canonicalizeMatch, canonicalizeReplace } = patchModule.exports;

function setup() {
    const messages = [], packets = [], effects = [];
    let menu;
    const module = { exports: {} };
    const imports = {
        "@api/Commands": { ApplicationCommandInputType: { BUILT_IN: 0 }, sendBotMessage: (_, message) => messages.push(message) },
        "@api/UserArea": { UserAreaButton: "button" },
        "@utils/types": definition => definition,
        "@webpack/common": {
            React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useReducer: () => [0, () => {}], useEffect: effect => effects.push(effect()) },
            ContextMenuApi: { openContextMenu: (_, render) => { menu = render(); }, closeContextMenu() {} },
            Menu: { Menu: "menu", MenuGroup: "group", MenuCheckboxItem: "checkbox", MenuSeparator: "separator" }
        }
    };
    vm.runInNewContext(compiled.code, { module, exports: module.exports, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    const plugin = module.exports.default;
    let source = 'class Socket{constructor(){}voiceStateUpdate(state){let{guildId:g=null,channelId:c=null,selfMute:m=false,selfDeaf:d=false,selfVideo:v=false,flags:f=0}=state;this.send({guild_id:g,channel_id:c,self_mute:m,self_deaf:d,self_video:v,flags:f})}send(packet){packets.push(packet)}}';
    assert(source.includes(plugin.patches[0].find));
    for (const replacement of plugin.patches[0].replacement) {
        const before = source;
        source = source.replace(canonicalizeMatch(replacement.match), canonicalizeReplace(replacement.replace, "plugin"));
        assert.notEqual(source, before);
    }
    const Socket = vm.runInNewContext(`(${source})`, { plugin, packets });
    const socket = new Socket();
    const button = () => plugin.userAreaButton.render({});
    const command = name => plugin.commands.find(command => command.name === name).execute([], { channel: { id: "test" } });
    const item = (element, id) => element.props.id === id ? element : element.props.children.flat().map(child => child && typeof child === "object" ? item(child, id) : undefined).find(Boolean);
    return { plugin, packets, messages, socket, button, command, effects, menuItem(id) {
        button().props.onContextMenu({});
        return item(menu.type(menu.props), id);
    } };
}

test("the default button fakes only deafen, keeps video and restores the actual voice state", () => {
    const state = setup();
    state.socket.voiceStateUpdate({ channelId: "voice", selfMute: false, selfDeaf: false, selfVideo: true, flags: 4 });
    state.button().props.onClick();
    assert.equal(state.button().props["aria-checked"], true);
    const active = state.packets.at(-1);
    assert.equal(active.self_deaf, true);
    assert.equal(active.self_mute, false);
    assert.equal(active.self_video, true);
    assert.equal(active.flags, 4);
    state.button().props.onClick();
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.button().props["aria-checked"], false);
});

test("the first deafen command enables the requested mode and the second disables it", async () => {
    const state = setup();
    state.socket.voiceStateUpdate({ channelId: "voice" });
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_deaf, true);
    assert.equal(state.packets.at(-1).self_mute, false);
    assert.match(state.messages.at(-1).content, /enabled/);
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.match(state.messages.at(-1).content, /disabled/);
});

test("switching modes never carries an unrelated fake flag into the next mode", async () => {
    const state = setup();
    state.socket.voiceStateUpdate({ channelId: "voice" });
    await state.command("fakedeafen_mute");
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.packets.at(-1).self_deaf, true);
    await state.command("fakemute");
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.packets.at(-1).self_deaf, false);
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_mute, false);
    assert.equal(state.packets.at(-1).self_deaf, true);
});

test("context menu changes apply immediately while active and clear the switch when no modes remain", () => {
    const state = setup();
    state.socket.voiceStateUpdate({ channelId: "voice" });
    state.button().props.onClick();
    state.menuItem("opt-mute").props.action();
    assert.equal(state.packets.at(-1).self_mute, true);
    state.menuItem("opt-deafen").props.action();
    assert.equal(state.packets.at(-1).self_deaf, false);
    state.menuItem("opt-mute").props.action();
    assert.equal(state.packets.at(-1).self_mute, false);
    assert.equal(state.button().props["aria-checked"], false);
});

test("disconnecting clears fake status and disabling the plugin restores real mute/deafen flags", async () => {
    const state = setup();
    state.socket.voiceStateUpdate({ channelId: "voice", selfMute: true, selfDeaf: false });
    await state.command("fakedeafen");
    state.plugin.stop();
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.packets.at(-1).self_mute, true);
    await state.command("fakedeafen");
    state.socket.voiceStateUpdate({ channelId: null, selfMute: true });
    assert.equal(state.button().props["aria-checked"], false);
    assert.equal(state.packets.at(-1).channel_id, null);
    assert.equal(state.packets.at(-1).self_deaf, false);
});

test("preselecting deafen outside a call sends nothing until joining and subscribers clean up", () => {
    const state = setup();
    state.button().props.onClick();
    assert.equal(state.packets.length, 0);
    state.socket.voiceStateUpdate({ channelId: "voice" });
    assert.equal(state.packets.at(-1).self_deaf, true);
    for (const cleanup of state.effects) assert.equal(typeof cleanup, "function");
    for (const cleanup of state.effects) cleanup();
});
