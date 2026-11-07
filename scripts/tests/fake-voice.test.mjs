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

function setup({ soundError = false, soundDisabled = false } = {}) {
    const messages = [], packets = [], effects = [], sounds = [], muteActions = [];
    const media = { mute: false, deaf: false };
    let actual = {};
    let socket;
    const update = next => {
        actual = { ...next };
        media.mute = next.selfMute ?? false;
        media.deaf = next.selfDeaf ?? false;
        socket.voiceStateUpdate(actual);
    };
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
        "@utils/Logger": { Logger: class { warn() {} } },
        "@webpack": { findByCodeLazy: () => sound => {
            if (soundError) throw new Error("Audio unavailable");
            sounds.push(sound);
        } },
        "@webpack/common": {
            React: { Fragment: "fragment", createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useReducer: () => [0, () => { updates++; }], useEffect: effect => effects.push(effect()) },
            ReactDOM: { createPortal: (element, target) => ({ element, target }) },
            UserStore: { getCurrentUser: () => ({ id: "self" }) },
            MediaEngineStore: { isSelfMute: () => media.mute || media.deaf, isSelfDeaf: () => media.deaf },
            NotificationSettingsStore: { isSoundDisabled: () => soundDisabled },
            VoiceActions: {
                setSelfMute: (context, mute, playSoundEffect) => {
                    muteActions.push({ context, mute, playSoundEffect });
                    media.mute = mute;
                    actual = { ...actual, selfMute: mute };
                    socket.voiceStateUpdate(actual);
                },
                toggleSelfDeaf: () => {
                    media.deaf = !media.deaf;
                    actual = { ...actual, selfDeaf: media.deaf };
                    socket.voiceStateUpdate(actual);
                }
            },
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
    socket = new Socket();
    const render = () => plugin.userAreaButton.render({});
    const button = () => render().props.children.find(child => child.type === "button");
    const notification = () => {
        const element = render().props.children.find(child => typeof child.type === "function");
        return element.type(element.props);
    };
    const command = name => plugin.commands.find(command => command.name === name).execute([], { channel: { id: "test" } });
    const item = (element, id) => element.props.id === id ? element : element.props.children.flat().map(child => child && typeof child === "object" ? item(child, id) : undefined).find(Boolean);
    return { plugin, packets, messages, socket, button, command, effects, notification, body, timers, media, sounds, muteActions, update,
        toggleDeaf: imports["@webpack/common"].VoiceActions.toggleSelfDeaf,
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

test("the default button really mutes, fakes deafen and keeps the microphone muted when disabled", () => {
    const state = setup();
    state.update({ channelId: "voice", selfMute: false, selfDeaf: false, selfVideo: true, flags: 4 });
    state.button().props.onClick();
    assert.equal(state.button().props["aria-checked"], true);
    const active = state.packets.at(-1);
    assert.equal(active.self_deaf, true);
    assert.equal(active.self_mute, true);
    assert.equal(state.media.mute, true);
    assert.equal(state.media.deaf, false);
    assert.equal(active.self_video, true);
    assert.equal(active.flags, 4);
    state.button().props.onClick();
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.media.mute, true);
    assert.equal(state.button().props["aria-checked"], false);
});

test("voice icons show fake status only for this user and call without mutating real voice state", async () => {
    const state = setup();
    const actual = { channelId: "voice", selfMute: false, selfDeaf: false };
    state.update(actual);
    const own = { user: { id: "self" }, channelId: "voice", mute: false, deaf: false, serverMute: false, video: true };
    const peer = { ...own, user: { id: "peer" } };
    assert.equal(state.plugin.useDisplayedVoiceStatus(own), own);
    await state.command("fakedeafen");
    const displayed = state.plugin.useDisplayedVoiceStatus(own);
    assert.equal(displayed.deaf, true);
    assert.equal(displayed.mute, true);
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
        let source = `function ${name}(props){let{className:c,mute:m,localMute:l,localVideoDisabled:v,deaf:d,user:u}=props;return{c,m,l,v,d,u,soundboardKey:"soundboard-mute"}}`;
        assert(source.includes(patch.find));
        const replacement = patch.replacement;
        const match = canonicalizeMatch(replacement.match);
        assert.equal([...source.matchAll(new RegExp(match.source, "g"))].length, 1);
        source = source.replace(match, canonicalizeReplace(replacement.replace, "plugin"));
        const render = vm.runInNewContext(`(${source})`, { plugin: state.plugin });
        state.update({ channelId: "voice" });
        if (!state.button().props["aria-checked"]) state.button().props.onClick();
        const props = { user: { id: "self" }, className: "native-class", mute: false, deaf: false, localMute: false, localVideoDisabled: true };
        const result = render(props);
        assert.equal(result.d, true);
        assert.equal(result.m, true);
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
    state.update({ channelId: "voice" });
    state.button().props.onClick();
    assert.match(state.button().props["aria-label"], /Fake Deafen active/);
    assert.equal(state.button().props.className, "mc-fake-voice-button");
    const icon = state.button().props.icon;
    assert(icon.type(icon.props).props.children.some(child => child?.props?.className === "mc-fake-voice-icon-slash"));
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
    state.update({ channelId: "voice" });
    state.menuItem("opt-mute").props.action();
    assert(state.notification());
    state.update({ channelId: null });
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
    state.update({ channelId: "voice" });
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_deaf, true);
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.match(state.messages.at(-1).content, /enabled/);
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.match(state.messages.at(-1).content, /disabled/);
});

test("switching modes never carries an unrelated fake flag into the next mode", async () => {
    const state = setup();
    state.update({ channelId: "voice" });
    await state.command("fakedeafen_mute");
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.packets.at(-1).self_deaf, true);
    await state.command("fakemute");
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.packets.at(-1).self_deaf, false);
    await state.command("fakedeafen");
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.packets.at(-1).self_deaf, true);
});

test("context menu changes apply immediately while active and clear the switch when no modes remain", () => {
    const state = setup();
    state.update({ channelId: "voice" });
    state.button().props.onClick();
    state.menuItem("opt-mute").props.action();
    assert.equal(state.packets.at(-1).self_mute, true);
    state.menuItem("opt-deafen").props.action();
    assert.equal(state.packets.at(-1).self_deaf, false);
    state.menuItem("opt-mute").props.action();
    assert.equal(state.packets.at(-1).self_mute, true);
    assert.equal(state.button().props["aria-checked"], false);
});

test("disconnecting clears fake status and disabling the plugin restores real mute/deafen flags", async () => {
    const state = setup();
    state.update({ channelId: "voice", selfMute: true, selfDeaf: false });
    await state.command("fakedeafen");
    state.plugin.stop();
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.packets.at(-1).self_mute, true);
    await state.command("fakedeafen");
    state.update({ channelId: null, selfMute: true });
    assert.equal(state.button().props["aria-checked"], false);
    assert.equal(state.packets.at(-1).channel_id, null);
    assert.equal(state.packets.at(-1).self_deaf, false);
});

test("preselecting deafen outside a call mutes the microphone and keeps the mode ready for joining", () => {
    const state = setup();
    state.button().props.onClick();
    assert.equal(state.media.mute, true);
    assert(state.packets.every(packet => packet.channel_id == null));
    assert.equal(state.button().props["aria-checked"], true);
    state.update({ channelId: "voice", selfMute: state.media.mute });
    assert.equal(state.packets.at(-1).self_deaf, true);
    assert.equal(state.packets.at(-1).self_mute, true);
    for (const cleanup of state.effects) assert.equal(typeof cleanup, "function");
    for (const cleanup of state.effects) cleanup();
});

test("enabling during full mute preserves deafen and keeps the microphone muted after listening is restored", () => {
    const state = setup();
    state.update({ channelId: "voice", selfMute: false, selfDeaf: true });
    state.button().props.onClick();
    assert.equal(state.media.deaf, true);
    assert.equal(state.media.mute, true);
    assert.match(state.notification().element.props.children[1].props.children[1].props.children[0], /Full mute stays on/);
    state.toggleDeaf();
    assert.equal(state.media.deaf, false);
    assert.equal(state.media.mute, true);
    assert.equal(state.packets.at(-1).self_deaf, true);
    assert.equal(state.packets.at(-1).self_mute, true);
    state.button().props.onClick();
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.media.mute, true);
});

test("activating with an already muted microphone never toggles it or changes full mute", () => {
    const state = setup();
    state.update({ channelId: "voice", selfMute: true, selfDeaf: true });
    state.button().props.onClick();
    state.button().props.onClick();
    assert.equal(state.media.mute, true);
    assert.equal(state.media.deaf, true);
    assert(state.muteActions.every(action => action.mute === true));
    assert.equal(state.packets.at(-1).self_deaf, true);
});

test("native sounds play once per toggle without duplicate mute sounds or sounds on reconnect and stop", () => {
    const state = setup();
    state.update({ channelId: "voice" });
    state.button().props.onClick();
    assert.deepEqual(state.sounds, ["deafen"]);
    assert.equal(state.muteActions[0].playSoundEffect, false);
    state.menuItem("opt-mute").props.action();
    assert.deepEqual(state.sounds, ["deafen"]);
    state.update({ channelId: "voice", selfMute: true });
    assert.deepEqual(state.sounds, ["deafen"]);
    state.button().props.onClick();
    assert.deepEqual(state.sounds, ["deafen", "undeafen"]);
    state.button().props.onClick();
    state.plugin.stop();
    assert.deepEqual(state.sounds, ["deafen", "undeafen", "deafen"]);
});

test("an unavailable audio player does not block microphone mute, notices or the next toggle", () => {
    const state = setup({ soundError: true });
    state.update({ channelId: "voice" });
    assert.doesNotThrow(() => state.button().props.onClick());
    assert.equal(state.media.mute, true);
    assert.equal(state.button().props["aria-checked"], true);
    assert(state.notification());
    assert.doesNotThrow(() => state.button().props.onClick());
    assert.equal(state.button().props["aria-checked"], false);
    assert.equal(state.packets.at(-1).self_deaf, false);
    assert.equal(state.media.mute, true);
});

test("Discord's disabled sound preference is respected without skipping mute or notifications", () => {
    const state = setup({ soundDisabled: true });
    state.update({ channelId: "voice" });
    state.button().props.onClick();
    assert.equal(state.media.mute, true);
    assert(state.notification());
    state.button().props.onClick();
    assert.equal(state.button().props["aria-checked"], false);
    assert.deepEqual(state.sounds, []);
});

test("call icons show full mute while the unchanged account controls show real mute and working headphones", () => {
    const state = setup();
    state.update({ channelId: "voice", selfMute: false, selfDeaf: false });
    const original = 'function panel(props){let{selfDeaf:d,selfMute:m,awaitingRemote:a,handleToggleSelfDeaf:toggle,nameplate:n}=props;return{d,m,a,toggle,n,handleOpenSettingsContextMenu:props.handleOpenSettingsContextMenu}}';
    let source = original;
    for (const patch of state.plugin.patches) {
        if (!source.includes(patch.find)) continue;
        for (const replacement of [patch.replacement].flat()) {
            source = source.replace(canonicalizeMatch(replacement.match), canonicalizeReplace(replacement.replace, "plugin"));
        }
    }
    assert.equal(source, original);
    const render = vm.runInNewContext(`(${source})`, {});
    state.button().props.onClick();
    const callProps = { user: { id: "self" }, channelId: "voice", mute: true, deaf: false };
    const callIcons = state.plugin.useDisplayedVoiceStatus(callProps);
    assert.equal(callIcons.mute, true);
    assert.equal(callIcons.deaf, true);
    const controls = render({ selfMute: state.media.mute, selfDeaf: state.media.deaf, handleToggleSelfDeaf: state.toggleDeaf });
    assert.equal(controls.m, true);
    assert.equal(controls.d, false);
    assert.equal(controls.toggle, state.toggleDeaf);
    assert.equal(state.media.deaf, false);
    state.button().props.onClick();
    assert.equal(state.plugin.useDisplayedVoiceStatus(callProps).deaf, false);
    assert.equal(state.media.mute, true);
});
