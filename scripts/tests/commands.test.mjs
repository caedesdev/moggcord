/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const types = { ApplicationCommandInputType: { BUILT_IN: 0, BUILT_IN_TEXT: 1 }, ApplicationCommandType: { CHAT_INPUT: 1 }, ApplicationCommandOptionType: { SUB_COMMAND: 1 } };
async function load(file, imports) {
    const { code } = await transform(await readFile(file, "utf8"), { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    return module.exports;
}
const newApi = () => load("src/api/Commands/index.ts", {
    "@utils/Logger": { Logger: class { error(_, error) { throw error; } } },
    "@utils/text": {}, "./commandHelpers": {}, "./types": types
});
const builtins = () => [
    { id: "-1", name: "shrug", untranslatedName: "shrug", options: [{ name: "message" }] },
    { id: "-2", name: "me", untranslatedName: "me", options: [{ name: "message" }] }
];

test("commands registered before Discord loads remain available after initialization", async () => {
    const api = await newApi();
    const command = { name: "fakedeafen", description: "Toggle Fake Deafen.", execute() {} };
    api.registerCommand(command, "FakeVoice");
    const list = builtins();
    assert.equal(api._init(list), list);
    assert.equal(list.filter(command => command.name === "fakedeafen").length, 1);
    assert.equal(api.commands.fakedeafen, command);
    assert.equal(command.plugin, "FakeVoice");
    assert.equal(command.isVencordCommand, true);
    assert.equal(api.unregisterCommand("fakedeafen"), true);
    assert.equal(list.length, 2);
});

test("disabling a plugin before initialization removes its pending command", async () => {
    const api = await newApi();
    api.registerCommand({ name: "fakedeafen", execute() {} }, "FakeVoice");
    assert.equal(api.unregisterCommand("fakedeafen"), true);
    const list = builtins();
    api._init(list);
    assert.equal(list.length, 2);
    assert.equal(api.commands.fakedeafen, undefined);
    assert.equal(api.unregisterCommand("missing"), false);
});

test("initializing again does not register pending commands twice", async () => {
    const api = await newApi();
    api.registerCommand({ name: "fakedeafen", execute() {} }, "FakeVoice");
    const list = builtins();
    api._init(list);
    api._init(list);
    assert.equal(list.filter(command => command.name === "fakedeafen").length, 1);
});

test("the current built-in command filter initializes the actual command list", async () => {
    const plugin = (await load("src/plugins/_api/commands.ts", {
        "@utils/constants": { Devs: { Arjix: {} } }, "@utils/types": definition => definition
    })).default;
    const { canonicalizeMatch, canonicalizeReplace } = await load("src/utils/patches.ts", { "./intlHash": {} });
    const list = [{ untranslatedName: "shrug" }, { untranslatedName: "tts" }];
    const source = 'const all=[{untranslatedName:"shrug"},{untranslatedName:"tts"}],text=all.filter(command=>["gif","tts","me","tableflip","unflip","shrug","spoiler","nick"].includes(command.untranslatedName));text';
    const patch = plugin.patches[0];
    assert(source.includes(patch.find));
    const replacement = patch.replacement[0];
    let received;
    const patched = source.replace(canonicalizeMatch(replacement.match), canonicalizeReplace(replacement.replace, "unused"));
    assert.notEqual(patched, source);
    const result = vm.runInNewContext(patched, { Vencord: { Api: { Commands: { _init: commands => { received = commands; return commands; } } } } });
    assert.equal(received.length, list.length);
    assert.equal(result.length, list.length);
    assert.equal(received[0].untranslatedName, "shrug");
});
