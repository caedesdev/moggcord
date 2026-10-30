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
    const timers = new Map();
    let now = 0, timerId = 0, updates = 0;
    let menu;
    const module = { exports: {} };
    const imports = {
        "@api/Commands": { ApplicationCommandInputType: { BUILT_IN: 0 }, sendBotMessage: (_, message) => messages.push(message) },
        "@api/UserArea": { UserAreaButton: "button" },
        "./styles.css": {},
        "@utils/css": { classNameFactory: prefix => (...values) => values.flatMap(value => typeof value === "string" ? [prefix + value] : Object.keys(value).filter(key => value[key]).map(key => prefix + key)).join(" ") },
        "@utils/types": definition => definition,
        "@webpack/common": {
            React: { Fragment: "fragment", createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useReducer: () => [0, () => { updates++; }], useEffect: effect => effects.push(effect()) },
            ReactDOM: { createPortal: (element, target) => ({ element, target }) },
            UserStore: { getCurrentUser: () => ({ id: "self" }) },
            ContextMenuApi: { openContextMenu: (_, render) => { menu = render(); }, closeContextMenu() {} },
            Menu: { Menu: "menu", MenuGroup: "group", MenuCheckboxItem: "checkbox", MenuSeparator: "separator" }
        }
    };
    const body = {};
    vm.runInNewContext(compiled.code, { module, exports: module.exports, document: { body },
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, at: now + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        require: name => {
            assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
            return imports[name];
        }
    });
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
    const render = () => plugin.userAreaButton.render({});
    const button = () => render().props.children.find(child => child.type === "button");
    const notification = () => {
        const element = render().props.children.find(child => typeof child.type === "function");
        return element.type(element.props);
    };
    const command = name => plugin.commands.find(command => command.name === name).execute([], { channel: { id: "test" } });
    const item = (element, id) => element.props.id === id ? element : element.props.children.flat().map(child => child && typeof child === "object" ? item(child, id) : undefined).find(Boolean);
    return { plugin, packets, messages, socket, button, command, effects, notification, body, timers,
        get updates() { return updates; },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, timer] = next;
                now = timer.at;
                timers.delete(id);
                timer.callback();
            }
            now = end;
        },
        menuItem(id) {
            button().props.onContextMenu({});
            return item(menu.type(menu.props), id);
        }
    };
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

test("voice icons show fake status only for this user and call without mutating real voice state", async () => {
    const state = setup();
    const actual = { channelId: "voice", selfMute: false, selfDeaf: false };
    state.socket.voiceStateUpdate(actual);
    const own = { user: { id: "self" }, channelId: "voice", mute: false, deaf: false, serverMute: false, video: true };
    const peer = { ...own, user: { id: "peer" } };
    assert.equal(state.plugin.useDisplayedVoiceStatus(own), own);
    await state.command("fakedeafen");
    const displayed = state.plugin.useDisplayedVoiceStatus(own);
    assert.equal(displayed.deaf, true);
    assert.equal(displayed.mute, false);
    assert.equal(displayed.video, true);
    assert.equal(displayed.serverMute, false);
    assert.equal(own.deaf, false);
    assert.equal(actual.selfDeaf, false);
    assert.equal(state.plugin.useDisplayedVoiceStatus(peer), peer);
    const elsewhere = { ...own, channelId: "other-call" };
    assert.equal(state.plugin.useDisplayedVoiceStatus(elsewhere), elsewhere);
    const missingUser = { mute: false, deaf: false };
    assert.equal(state.plugin.useDisplayedVoiceStatus(missingUser), missingUser);
    await state.command("fakedeafen_mute");
    assert.equal(state.plugin.useDisplayedVoiceStatus(own).mute, true);
    assert.equal(state.plugin.useDisplayedVoiceStatus(own).deaf, true);
    await state.command("fakemute");
    assert.equal(state.plugin.useDisplayedVoiceStatus(own).mute, true);
    assert.equal(state.plugin.useDisplayedVoiceStatus(own).deaf, false);
    const serverDeafened = { ...own, deaf: true, serverDeaf: true };
    assert.equal(state.plugin.useDisplayedVoiceStatus(serverDeafened).serverDeaf, true);
    assert.equal(state.plugin.useDisplayedVoiceStatus(serverDeafened).deaf, true);
    state.plugin.stop();
    assert.equal(state.plugin.useDisplayedVoiceStatus(own), own);
});

test("the UI patch subscribes before rendering native voice icons and preserves other props", () => {
    const state = setup();
    const patch = state.plugin.patches[1];
    for (const name of ["icons", "xZ", "$_"]) {
        let source = `function ${name}(props){let{className:c,mute:m,localMute:l,localVideoDisabled:v,deaf:d,user:u}=props;return{c,m,l,v,d,u,location:"VoiceUserIcons"}}`;
        assert(source.includes(patch.find));
        const replacement = patch.replacement;
        const match = canonicalizeMatch(replacement.match);
        assert.equal([...source.matchAll(new RegExp(match.source, "g"))].length, 1);
        source = source.replace(match, canonicalizeReplace(replacement.replace, "plugin"));
        const render = vm.runInNewContext(`(${source})`, { plugin: state.plugin });
        state.socket.voiceStateUpdate({ channelId: "voice" });
        if (!state.button().props["aria-checked"]) state.button().props.onClick();
        const props = { user: { id: "self" }, className: "native-class", mute: false, deaf: false, localMute: false, localVideoDisabled: true };
        const result = render(props);
        assert.equal(result.d, true);
        assert.equal(result.m, false);
        assert.equal(result.c, "native-class");
        assert.equal(result.v, true);
        assert.equal(props.deaf, false);
        const updates = state.updates;
        state.button().props.onClick();
        assert(state.updates > updates);
        assert.equal(render(props).d, false);
    }
});

test("notifications use a portal, replace earlier notices and disappear after three seconds", () => {
    const state = setup();
    assert.equal(state.notification(), null);
    state.socket.voiceStateUpdate({ channelId: "voice" });
    state.button().props.onClick();
    assert.match(state.button().props["aria-label"], /Fake Deafen active/);
    assert.match(state.button().props.className, /mc-fake-voice-active/);
    const first = state.notification();
    assert.equal(first.target, state.body);
    assert.equal(first.element.props.role, "status");
    assert.match(first.element.props.className, /success/);
    state.advance(2000);
    state.button().props.onClick();
    const second = state.notification();
    assert.match(second.element.props.className, /info/);
    assert.equal(state.timers.size, 1);
    state.advance(1000);
    assert(state.notification(), "An earlier notice must not dismiss its replacement");
    state.advance(1999);
    assert(state.notification());
    state.advance(1);
    assert.equal(state.notification(), null);
    assert.equal(state.timers.size, 0);
});

test("dismiss, voice disconnect and plugin stop clear notification timers and fake indicators", () => {
    const state = setup();
    state.button().props.onClick();
    const close = state.notification().element.props.children.find(child => child.type === "button");
    close.props.onClick();
    assert.equal(state.notification(), null);
    assert.equal(state.timers.size, 0);
    state.socket.voiceStateUpdate({ channelId: "voice" });
    state.menuItem("opt-mute").props.action();
    assert(state.notification());
    state.socket.voiceStateUpdate({ channelId: null });
    assert.equal(state.notification(), null);
    assert.equal(state.button().props["aria-checked"], false);
    state.button().props.onClick();
    state.plugin.stop();
    assert.equal(state.notification(), null);
    assert.equal(state.timers.size, 0);
    for (const cleanup of state.effects) cleanup();
    const updates = state.updates;
    state.plugin.stop();
    assert.equal(state.updates, updates);
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
