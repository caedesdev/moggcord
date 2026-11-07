/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { clientSettingsDirectory, initializeClientSettings } from "../lib/client-settings.mjs";

test("Discord channels and other clients have separate settings, including after host updates", () => {
    const data = resolve("test-data");
    const clients = ["Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment", "Vesktop", "Equibop"];
    const paths = clients.map(client => clientSettingsDirectory(data, { executable: `C:/Apps/${client}/app-1.0.1/${client}.exe` }));
    assert.equal(new Set(paths).size, clients.length);
    for (const [index, client] of clients.entries())
        assert.equal(clientSettingsDirectory(data, { executable: `C:/Apps/${client}/app-2.0.0/${client}.exe` }), paths[index]);
    assert.equal(clientSettingsDirectory(data, { executable: "/Applications/Discord Canary.app/Contents/MacOS/Discord Canary" }), paths[1]);
    assert.equal(clientSettingsDirectory(data, { executable: "/opt/discord-canary/Discord" }), paths[1]);
    assert.equal(clientSettingsDirectory(data, { executable: "/opt/discord-ptb/Discord" }), paths[2]);
    assert.equal(clientSettingsDirectory(data, { channel: "canary" }), paths[1]);
});

test("custom user profiles remain separate and normal channel user directories keep their standard location", () => {
    const data = resolve("test-data");
    const executable = "C:/Apps/DiscordCanary/DiscordCanary.exe";
    const normal = clientSettingsDirectory(data, { executable });
    assert.equal(clientSettingsDirectory(data, { executable, userDataDir: "C:/Roaming/discordcanary" }), normal);
    const first = clientSettingsDirectory(data, { executable, userDataDir: "C:/Profiles/first" });
    const second = clientSettingsDirectory(data, { executable, userDataDir: "C:/Profiles/second" });
    assert.notEqual(first, second);
    assert.notEqual(first, normal);
    assert.equal(clientSettingsDirectory(data, { executable, userDataDir: "C:/Profiles/first" }), first);
});

test("legacy settings migrate once to normal Discord without leaking into Canary or replacing existing preferences", async t => {
    const data = await mkdtemp(join(tmpdir(), "moggcord-client-settings-"));
    t.after(async () => { assert.equal(dirname(resolve(data)), resolve(tmpdir())); await rm(data, { recursive: true, force: true }); });
    const old = join(data, "settings");
    mkdirSync(old);
    const original = JSON.stringify({ plugins: { Existing: { enabled: true } }, custom: "preserved" });
    writeFileSync(join(old, "settings.json"), original);
    writeFileSync(join(old, "native-settings.json"), '{"plugins":{"Native":{"option":true}}}');
    writeFileSync(join(old, "quickCss.css"), ".custom {color: red}");
    const canary = initializeClientSettings(data, { channel: "canary" });
    assert.equal(existsSync(join(canary, "settings.json")), false);
    assert.equal(existsSync(join(canary, "native-settings.json")), false);
    assert.equal(existsSync(join(canary, "quickCss.css")), false);
    const stable = initializeClientSettings(data, { channel: "stable" });
    assert.equal(readFileSync(join(stable, "settings.json"), "utf8"), original);
    for (const file of ["native-settings.json", "quickCss.css"])
        assert.equal(readFileSync(join(stable, file), "utf8"), readFileSync(join(old, file), "utf8"));
    writeFileSync(join(stable, "settings.json"), '{"custom":"stable only"}');
    writeFileSync(join(canary, "settings.json"), '{"custom":"canary only"}');
    initializeClientSettings(data, { channel: "stable" });
    initializeClientSettings(data, { channel: "canary" });
    assert.equal(JSON.parse(readFileSync(join(stable, "settings.json"))).custom, "stable only");
    assert.equal(JSON.parse(readFileSync(join(canary, "settings.json"))).custom, "canary only");
    assert.equal(readFileSync(join(old, "settings.json"), "utf8"), original);
});
