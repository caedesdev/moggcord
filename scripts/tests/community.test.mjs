/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import http from "node:http";
import { createBridge } from "../community/bridge.mjs";
import { channelNames, fetchManifest, findClient, installedEntries, installEntry, parseLink, repairClient, sourceLimit, trustedOrigin, validateManifest } from "../community/core.mjs";
import { buildFiles, writeBuildInfo } from "../lib/build-info.mjs";
import pluginPackage from "../../web/plugin-package.js";
import { resolvePluginName } from "../build/common.mjs";

const source = 'import definePlugin from "@utils/types"; export default definePlugin({ name: "CommunityExample", description: "An example.", authors: [], start() {} });';
const compiled = 'let example;example=definePlugin({name:"CommunityExample",description:"Installed."});const plugins={[example.name]:example};const excluded=definePlugin({name:"NotRegistered"});';
const entry = (kind = "plugin", code = source, filename = "example.ts") => ({ protocol: 1, id: randomUUID(), kind, name: "Example", file_name: filename, source_code: code, sha256: createHash("sha256").update(code).digest("hex") });
const folderEntry = (main = "index.tsx") => {
    const files = [
        { path: main, content: 'import "./styles.css"; import { value } from "./utils/data"; ' + source },
        { path: "styles.css", content: ".example {color:purple}" },
        { path: "utils/data.ts", content: 'export { value } from "../components/value";' },
        { path: "components/value.ts", content: 'import type Plugin from ".."; export const value = 42;' }
    ];
    return { ...entry("plugin", files[0].content, main), protocol: 2, files, sha256: createHash("sha256").update(pluginPackage.canonical(files, main)).digest("hex") };
};
const cleanup = async directory => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basenameSafe(directory));
    await rm(directory, { recursive: true, force: true });
};
const basenameSafe = value => value.split(/[\\/]/).pop().startsWith("moggcord-community-test-");

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-community-test-"));
    t.after(() => cleanup(directory));
    const config = { sourceRoot: join(directory, "source"), dataDir: join(directory, "data"), mirrorDir: join(directory, "mirror"), channel: "canary" };
    const client = { base: join(directory, "DiscordCanary"), executable: join(directory, "DiscordCanary", "DiscordCanary.exe"), installDir: join(directory, "installed") };
    await mkdir(config.sourceRoot, { recursive: true });
    await mkdir(join(config.dataDir, "settings"), { recursive: true });
    await mkdir(client.installDir, { recursive: true });
    await writeFile(join(config.sourceRoot, "package.json"), JSON.stringify({ version: "1.18.24" }));
    const original = { plugins: { Existing: { enabled: true, custom: 42 } }, enabledThemes: ["existing.css"], themeNames: { "existing.css": "Existing" }, unrelated: { preference: "keep" } };
    const settings = join(config.dataDir, "settings", "settings.json");
    await writeFile(settings, JSON.stringify(original));
    await writeFile(join(client.installDir, "renderer.js"), "old renderer");
    const events = [];
    const dependencies = {
        findClient: async channel => { assert.equal(channel, "canary"); return client; },
        stop: async value => { assert.equal(value.executable, client.executable); events.push("stop canary"); },
        start: async value => { assert.equal(value.executable, client.executable); events.push("start canary"); },
        build: async root => {
            events.push("build");
            const dist = join(root, "dist", "desktop"); await mkdir(dist, { recursive: true });
            for (const file of buildFiles) await writeFile(join(dist, file), `new ${file}`);
            writeBuildInfo(dist, "1.18.24");
        }
    };
    return { directory, config, client, dependencies, events, settings, original };
}

async function windowsInstallation(directory, channel, version = "app-1.0.0", marker = "Moggcord Injector") {
    const base = join(directory, channelNames[channel]), folder = join(base, version), patcher = join(base, "dist", "patcher.js");
    await mkdir(join(folder, "resources", "app"), { recursive: true });
    await mkdir(dirname(patcher), { recursive: true });
    await writeFile(patcher, "// Moggcord test");
    await writeFile(join(folder, "resources", "app", "index.js"), `// ${marker}\n[${JSON.stringify(patcher.replaceAll("\\", "/"))}]`);
    await writeFile(join(folder, `${channelNames[channel]}.exe`), "fixture");
    return { folder, patcher };
}

test("installation manifests enforce size, type, origin, identity and file fingerprints", () => {
    const data = entry(); const url = `https://moggcord.example/api/install/${data.id}`;
    assert.equal(validateManifest(data, url, data.sha256), data);
    for (const replacement of [{ file_name: "photo.exe" }, { file_name: "../example.ts" }, { source_code: "changed" }, { kind: "other" }, { id: randomUUID() }, { source_code: "\0" }, { protocol: 2 }])
        assert.throws(() => validateManifest({ ...data, ...replacement }, url, data.sha256));
    for (const kind of ["plugin", "theme"]) {
        const full = entry(kind, "x".repeat(sourceLimit), "large.css");
        assert.equal(validateManifest(full, `https://moggcord.example/api/install/${full.id}`, full.sha256), full);
        assert.throws(() => validateManifest({ ...full, source_code: full.source_code + "x" }, `https://moggcord.example/api/install/${full.id}`, full.sha256));
    }
    assert.throws(() => trustedOrigin("http://remote.example"));
    assert.throws(() => trustedOrigin("https://moggcord.example/path"));
    const link = new URL("moggcord://install"); link.searchParams.set("manifest", url); link.searchParams.set("sha256", data.sha256);
    assert.equal(parseLink(link.href, "https://moggcord.example").manifest, url);
    assert.throws(() => parseLink(link.href, "https://another.example"));
    link.searchParams.set("manifest", url.replace("/api/install/", "/api/other/"));
    assert.throws(() => parseLink(link.href, "https://moggcord.example"));
});

test("read-only checks distinguish compiled plugins, disabled modules, missing files and installed themes", async t => {
    const f = await fixture(t), plugin = entry(), missing = entry(), theme = entry("theme", "body{}", "example.css");
    await writeFile(join(f.client.installDir, "renderer.js"), compiled);
    const settings = { ...f.original, plugins: { ...f.original.plugins, CommunityExample: { enabled: false } } };
    await writeFile(f.settings, JSON.stringify(settings));
    await mkdir(join(f.config.dataDir, "themes"));await writeFile(join(f.config.dataDir, "themes", `community-${theme.id}.theme.css`), theme.source_code);
    const before = await readFile(f.settings);
    const result = await installedEntries([
        { id: plugin.id, kind: "plugin", file_name: "example.ts", plugin_name: "CommunityExample" },
        { id: missing.id, kind: "plugin", file_name: "example.ts", plugin_name: "MissingPlugin" },
        { id: theme.id, kind: "theme", file_name: "example.css" }
    ], f.config, f.dependencies);
    assert.deepEqual(result, [{ id: plugin.id, installed: true, enabled: false }, { id: missing.id, installed: false, enabled: false }, { id: theme.id, installed: true, enabled: false }]);
    assert.equal((await installedEntries([{id:missing.id,kind:"plugin",file_name:"example.ts",plugin_name:"NotRegistered"}],f.config,f.dependencies))[0].installed,false);
    assert.deepEqual(await readFile(f.settings), before);assert.deepEqual(f.events, []);
    await writeFile(join(f.client.installDir, "renderer.js"), "official build without the community plugin");
    assert.equal((await installedEntries([{ id: plugin.id, kind: "plugin", file_name: "index.ts", plugin_name: "CommunityExample" }], f.config, f.dependencies))[0].installed, false);
    for (const change of [{ id: "../escape" }, { file_name: "../outside.ts" }, { plugin_name: "__proto__" }])
        await assert.rejects(installedEntries([{ id: plugin.id, kind: "plugin", file_name: "index.ts", plugin_name: "CommunityExample", ...change }], f.config, f.dependencies));
});

test("reinstalling the same plugin or stylesheet skips the compiler, file writes and client restart", async t => {
    for (const kind of ["plugin", "theme"]) {
        const f = await fixture(t), data = kind === "plugin" ? entry() : entry("theme", "body{}", "example.css");
        if (kind === "plugin") {
            await writeFile(join(f.client.installDir, "renderer.js"), compiled);
            await writeFile(f.settings, JSON.stringify({ ...f.original, plugins: { ...f.original.plugins, CommunityExample: { enabled: true, communityInstallHash: data.sha256 } } }));
        } else {
            await mkdir(join(f.config.dataDir, "themes"));await writeFile(join(f.config.dataDir, "themes", `community-${data.id}.theme.css`), data.source_code);
            await writeFile(f.settings, JSON.stringify({ ...f.original, enabledThemes: [...f.original.enabledThemes, `community-${data.id}.theme.css`] }));
        }
        const before = await readFile(f.settings);
        const result = await installEntry(data, f.config, f.dependencies);
        assert.equal(result.alreadyInstalled, true);assert.deepEqual(f.events, []);assert.deepEqual(await readFile(f.settings), before);
    }
});

test("disabled plugins and themes are enabled without rebuilding or replacing their installed code", async t => {
    for (const kind of ["plugin", "theme"]) {
        const f = await fixture(t), data = kind === "plugin" ? entry() : entry("theme", "body{}", "example.css");
        const disabled = { ...f.original, plugins: { ...f.original.plugins, CommunityExample: { enabled: false, communityInstallHash: data.sha256, preference: "keep" } } };
        await writeFile(f.settings, JSON.stringify(disabled));
        await writeFile(join(f.client.installDir, "renderer.js"), compiled);
        if (kind === "theme") {
            await mkdir(join(f.config.dataDir, "themes"));
            await writeFile(join(f.config.dataDir, "themes", `community-${data.id}.theme.css`), data.source_code);
        }
        const result = await installEntry(data, f.config, f.dependencies);
        assert.notEqual(result.alreadyInstalled, true);
        assert.deepEqual(f.events, ["stop canary", "start canary"]);
        assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), compiled);
        const settings = JSON.parse(await readFile(f.settings, "utf8"));
        if (kind === "plugin") {
            assert.equal(settings.plugins.CommunityExample.enabled, true);
            assert.equal(settings.plugins.CommunityExample.preference, "keep");
        } else assert.deepEqual(settings.enabledThemes, [...f.original.enabledThemes, `community-${data.id}.theme.css`]);
        assert.deepEqual(settings.plugins.Existing, f.original.plugins.Existing);
        assert.deepEqual(settings.unrelated, f.original.unrelated);
        assert.equal((await installEntry(data, f.config, f.dependencies)).alreadyInstalled, true);
        assert.deepEqual(f.events, ["stop canary", "start canary"]);
    }
});

test("failed activation restores the disabled settings and reopens the previous client", async t => {
    const f = await fixture(t), data = entry();
    const disabled = { ...f.original, plugins: { ...f.original.plugins, CommunityExample: { enabled: false, communityInstallHash: data.sha256 } } };
    await writeFile(f.settings, JSON.stringify(disabled));
    await writeFile(join(f.client.installDir, "renderer.js"), compiled);
    let attempts = 0;
    f.dependencies.start = async () => { if (!attempts++) throw new Error("Start failed"); f.events.push("recovered"); };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Start failed/);
    assert.deepEqual(f.events, ["stop canary", "recovered"]);
    assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), disabled);
    assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), compiled);
});

test("installed-state HTTP queries keep the configured origin and custom-header restrictions", async t => {
    const f = await fixture(t), id = randomUUID(), origin = "https://moggcord.example";
    await writeFile(join(f.client.installDir, "renderer.js"), compiled);
    const bridge = createBridge({ ...f.config, origin }, f.dependencies);
    await new Promise(resolvePromise => bridge.server.listen(0, "127.0.0.1", resolvePromise));
    t.after(() => new Promise(resolvePromise => bridge.server.close(resolvePromise)));
    const base = `http://127.0.0.1:${bridge.server.address().port}`;
    const status = await fetch(base + "/v1/status", { headers: { Origin: origin } });
    assert.equal(status.status, 200);
    assert.equal((await status.json()).channel, "canary");
    const send = headers => fetch(base + "/v1/installed", { method: "POST", headers, body: JSON.stringify({ entries: [{ id, kind: "plugin", file_name: "index.ts", plugin_name: "CommunityExample" }] }) });
    assert.equal((await send({ Origin: "https://other.example" })).status, 403);
    assert.equal((await send({ Origin: origin, "Content-Type": "application/json" })).status, 415);
    const response = await send({ Origin: origin, "Content-Type": "application/json", "X-Moggcord-Install": "1" });
    assert.equal(response.status, 200);assert.deepEqual(await response.json(), { entries: [{ id, installed: true, enabled: true }] });assert.deepEqual(f.events, []);
});

test("HTTP status reports the detected channel for automatic target selection", async t => {
    const origin = "https://moggcord.example", selections = [];
    let detected = "stable";
    const bridge = createBridge({ origin, channel: "auto" }, { findClient: async channel => { selections.push(channel); return { channel: detected }; } });
    await new Promise(resolvePromise => bridge.server.listen(0, "127.0.0.1", resolvePromise));
    t.after(() => new Promise(resolvePromise => bridge.server.close(resolvePromise)));
    const url = `http://127.0.0.1:${bridge.server.address().port}/v1/status`;
    for (const channel of ["stable", "canary", "ptb"]) {
        detected = channel;
        const response = await fetch(url, { headers: { Origin: origin } });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("access-control-allow-private-network"), "true");
        const status = await response.json();
        assert.equal(status.name, "moggcord-community");
        assert.equal(status.protocol, 1);
        assert.equal(status.channel, channel);
        assert(status.capabilities.includes("installed-status"));
    }
    assert.deepEqual(selections, ["auto", "auto", "auto"]);
});

test("HTTP status safely reports missing or ambiguous targets and recovers when a target becomes available", async t => {
    const origin = "https://moggcord.example";
    let failure = null;
    const bridge = createBridge({ origin, channel: "auto" }, { findClient: async channel => {
        assert.equal(channel, "auto");
        if (failure) throw new Error(failure);
        return { channel: "ptb" };
    } });
    await new Promise(resolvePromise => bridge.server.listen(0, "127.0.0.1", resolvePromise));
    t.after(() => new Promise(resolvePromise => bridge.server.close(resolvePromise)));
    const url = `http://127.0.0.1:${bridge.server.address().port}/v1/status`;
    for (const message of ["No Moggcord installation was found.", "Moggcord was found in multiple Discord installations (stable, canary). Choose one with --channel."]) {
        failure = message;
        const response = await fetch(url, { headers: { Origin: origin } });
        assert.equal(response.status, 409);
        assert.equal(response.headers.get("access-control-allow-origin"), origin);
        assert.equal(response.headers.get("access-control-allow-private-network"), "true");
        assert.deepEqual(await response.json(), { name: "moggcord-community", protocol: 1, error: message, code: "target_unavailable" });
        assert.equal((await fetch(url, { headers: { Origin: "https://another.example" } })).status, 403);
        const preflight = await fetch(url, { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "GET" } });
        assert.equal(preflight.status, 204);
        failure = null;
        const recovered = await fetch(url, { headers: { Origin: origin } });
        assert.equal(recovered.status, 200);
        assert.equal((await recovered.json()).channel, "ptb");
    }
});

test("folder manifests fingerprint every nested file, reject traversal and keep protocol one backwards compatible", () => {
    const data = folderEntry(), address = `https://moggcord.example/api/install/${data.id}`;
    assert.equal(validateManifest(data, address, data.sha256), data);
    for (const replacement of [
        { files: data.files.map(file => file.path === "utils/data.ts" ? { ...file, content: "changed" } : file) },
        { files: [...data.files, { path: "../outside.ts", content: "bad" }] },
        { files: [...data.files, { path: "INDEX.tsx", content: "duplicate" }] },
        { protocol: 1 }, { kind: "theme" }
    ]) assert.throws(() => validateManifest({ ...data, ...replacement }, address, data.sha256));
});

for (const main of ["index.tsx", "main.tsx"]) test(`plugin folders retain all relative files and support ${main} as the entry point`, async t => {
    const f = await fixture(t), data = folderEntry(main);
    const build = f.dependencies.build;
    f.dependencies.build = async root => {
        const folder = join(root, "src", "userplugins", `community-${data.id}`);
        for (const file of data.files) assert.equal(await readFile(join(folder, file.path), "utf8"), file.content);
        const parent = dirname(folder), dirent = (await readdir(parent, { withFileTypes: true })).find(item => item.name === `community-${data.id}`);
        assert.equal(await resolvePluginName(parent, dirent), "CommunityExample");
        await build(root);
    };
    await installEntry(data, f.config, f.dependencies);
    assert.deepEqual(f.events, ["build", "stop canary", "start canary"]);
    assert.equal(JSON.parse(await readFile(f.settings, "utf8")).plugins.CommunityExample.communityInstallHash, data.sha256);
});

test("missing relative imports, escaping stylesheets and dynamic module paths are rejected before writing or stopping Discord", async t => {
    const f = await fixture(t);
    for (const replacement of [
        { path: "utils/data.ts", content: 'export {value} from "../../outside";' },
        { path: "styles.css", content: '@import "../../private.css";' },
        { path: "components/value.ts", content: 'const name="./value"; import(name);' }
    ]) {
        const data = folderEntry(); data.files = data.files.map(file => file.path === replacement.path ? replacement : file);
        data.sha256 = createHash("sha256").update(pluginPackage.canonical(data.files, data.file_name)).digest("hex");
        await assert.rejects(installEntry(data, f.config, f.dependencies));
        assert(!existsSync(join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`)));
    }
    assert.deepEqual(f.events, []);
});

test("a failed folder rebuild restores prior nested files, removes new files and never stops the client", async t => {
    const f = await fixture(t), data = folderEntry();
    const directory = join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`);
    await mkdir(join(directory, "old"), { recursive: true });
    await writeFile(join(directory, "index.tsx"), source); await writeFile(join(directory, "old", "saved.ts"), "old source");
    f.dependencies.build = async () => { throw new Error("Build failed"); };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Build failed/);
    assert.equal(await readFile(join(directory, "index.tsx"), "utf8"), source);
    assert.equal(await readFile(join(directory, "old", "saved.ts"), "utf8"), "old source");
    assert(!existsSync(join(directory, "utils"))); assert(!existsSync(join(directory, "components")));
    assert.deepEqual(f.events, []); assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
});

test("folder rollback restores an old file replaced by a new directory", async t => {
    const f = await fixture(t), data = folderEntry();
    const directory = join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.tsx"), source);
    await writeFile(join(directory, "utils"), "previous file");
    f.dependencies.build = async () => { throw new Error("Build failed"); };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Build failed/);
    assert.equal(await readFile(join(directory, "utils"), "utf8"), "previous file");
    assert.equal(await readFile(join(directory, "index.tsx"), "utf8"), source);
    assert.deepEqual(f.events, []);
});

for (const kind of ["plugin", "theme"]) for (const extension of kind === "theme" ? ["css", "style"] : ["css"]) {
    test(`${kind} ${extension} installs as one stylesheet, enables it and restarts only Canary`, async t => {
        const f = await fixture(t), data = entry(kind, ":root { --accent: purple; }", `styles.${extension}`);
        await installEntry(data, f.config, f.dependencies);
        const filename = `community-${data.id}.theme.css`;
        assert.equal(await readFile(join(f.config.dataDir, "themes", filename), "utf8"), data.source_code);
        const settings = JSON.parse(await readFile(f.settings, "utf8"));
        assert.deepEqual(settings.enabledThemes, ["existing.css", filename]); assert.equal(settings.themeNames[filename], "Example");
        assert.deepEqual(settings.plugins, f.original.plugins); assert.deepEqual(settings.unrelated, f.original.unrelated);
        assert.deepEqual(f.events, ["stop canary", "start canary"]);
    });
}

for (const extension of ["js", "ts", "tsx"]) test(`${extension} plugin is built before replacement, activated and copied to the active loader and mirror`, async t => {
    const f = await fixture(t), data = entry("plugin", source, `example.${extension}`);
    await installEntry(data, f.config, f.dependencies);
    assert.deepEqual(f.events, ["build", "stop canary", "start canary"]);
    const settings = JSON.parse(await readFile(f.settings, "utf8"));
    assert(settings.plugins.CommunityExample.enabled); assert.deepEqual(settings.plugins.Existing, f.original.plugins.Existing);
    assert.equal(settings.plugins.CommunityExample.communityInstallHash, data.sha256);
    assert.deepEqual(settings.enabledThemes, f.original.enabledThemes);
    for (const destination of [f.client.installDir, f.config.mirrorDir]) assert.equal(await readFile(join(destination, "renderer.js"), "utf8"), "new renderer.js");
    const file = extension === "tsx" ? "index.tsx" : "index.ts";
    assert.equal(await readFile(join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`, file), "utf8"), source);
});

test("syntax errors, unsupported imports and duplicate built-in names leave Canary untouched", async t => {
    const f = await fixture(t);
    const builtins = join(f.config.sourceRoot, "src", "moggcordplugins", "FakeVoice");
    await mkdir(builtins, { recursive: true }); await writeFile(join(builtins, "index.ts"), source);
    for (const code of [source, source + " {", source.replace("@utils/types", "./secret.txt"), source.replace("CommunityExample", "constructor")])
        await assert.rejects(installEntry(entry("plugin", code), f.config, f.dependencies));
    assert.deepEqual(f.events, []); assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
});

test("one-time setup repairs the stale client without rewriting any account settings", async t => {
    const f = await fixture(t); const before = await readFile(f.settings);
    await repairClient(f.config, f.dependencies);
    assert.deepEqual(f.events, ["build", "stop canary", "start canary"]);
    assert.deepEqual(await readFile(f.settings), before);
    assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "new renderer.js");
});

test("managed source is prepared before duplicate names can overwrite a retained community plugin", async t => {
    const f = await fixture(t), data = entry();
    f.dependencies.prepareSource = async root => {
        assert.equal(root, f.config.sourceRoot);
        const retained = join(root, "src", "userplugins", "community-retained");
        await mkdir(retained, { recursive: true });
        await writeFile(join(retained, "index.ts"), source);
        f.events.push("prepare");
    };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Another installed plugin already uses this name/);
    assert.deepEqual(f.events, ["prepare"]);
    assert(!existsSync(join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`)));
    assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "old renderer");
    assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
});

test("stylesheet installation, activation and repeated downloads do not prepare a code compiler", async t => {
    const f = await fixture(t), data = entry("theme", "body{color:purple}", "example.css");
    f.dependencies.prepareSource = async () => { throw new Error("Unexpected compiler preparation"); };
    await installEntry(data, f.config, f.dependencies);
    const repeated = await installEntry(data, f.config, f.dependencies);
    assert.equal(repeated.alreadyInstalled, true);
    const saved = JSON.parse(await readFile(f.settings, "utf8"));
    saved.enabledThemes = [];
    await writeFile(f.settings, JSON.stringify(saved));
    await installEntry(data, f.config, f.dependencies);
    assert.deepEqual(f.events, ["stop canary", "start canary", "stop canary", "start canary"]);
});

test("failed builds restore source and never stop the client or replace installed files", async t => {
    const f = await fixture(t), data = entry();
    f.dependencies.build = async () => { throw new Error("Build failed"); };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Build failed/);
    assert.deepEqual(f.events, []); assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "old renderer");
    const directory = join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`);
    assert(!existsSync(directory)); assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
});

test("a stop failure reopens the previous client and leaves settings and installed files unchanged", async t => {
    const f = await fixture(t);
    f.dependencies.stop = async () => { throw new Error("Stop failed after closing the window"); };
    await assert.rejects(installEntry(entry(), f.config, f.dependencies), /Stop failed/);
    assert.deepEqual(f.events, ["build", "start canary"]);
    assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "old renderer");
    assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
});

test("failed restarts restore settings, plugin source and installed bundles before reopening the previous client", async t => {
    const f = await fixture(t); let attempts = 0;
    f.dependencies.start = async () => { if (!attempts++) throw new Error("Start failed"); f.events.push("recovered"); };
    await assert.rejects(installEntry(entry(), f.config, f.dependencies), /Start failed/);
    assert.deepEqual(f.events, ["build", "stop canary", "recovered"]);
    assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "old renderer");
    assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
    assert.deepEqual(await readdir(join(f.config.sourceRoot, "src", "userplugins")), []);
});

test("channel discovery selects only Moggcord in the chosen channel and uses numeric version ordering", async t => {
    const f = await fixture(t);
    for (const [channel, version, marker] of [["Discord", "app-1.0.99", "Vencord"], ["DiscordCanary", "app-1.0.9", "Moggcord Injector"], ["DiscordCanary", "app-1.0.10", "Moggcord Injector"]]) {
        const folder = join(f.directory, channel, version); await mkdir(join(folder, "resources", "app"), { recursive: true });
        const patcher = join(f.client.installDir, "patcher.js"); await writeFile(patcher, "// Moggcord test");
        await writeFile(join(folder, "resources", "app", "index.js"), `// ${marker}\n[${JSON.stringify(patcher.replaceAll("\\", "/"))}]`);
        await writeFile(join(folder, "DiscordCanary.exe"), "fixture");
    }
    const client = await findClient("canary", f.directory, "win32"); assert(client.executable.includes("app-1.0.10"));
    assert.equal(client.channel, "canary");
    assert.deepEqual(await findClient("auto", f.directory, "win32"), client);
    await assert.rejects(findClient("stable", f.directory, "win32"), /No Moggcord/);
});

for (const channel of Object.keys(channelNames)) test(`automatic channel discovery finds Moggcord in ${channel} without selecting unmodified Discord or Vencord`, async t => {
    const f = await fixture(t);
    const otherChannels = Object.keys(channelNames).filter(value => value !== channel);
    await windowsInstallation(f.directory, otherChannels[0], "app-2.0.0", "Discord");
    await windowsInstallation(f.directory, otherChannels[1], "app-2.0.0", "Vencord");
    await windowsInstallation(f.directory, channel, "app-1.0.9");
    const latest = await windowsInstallation(f.directory, channel, "app-1.0.10");
    for (const selection of ["auto", undefined, null, channel]) {
        const client = await findClient(selection, f.directory, "win32");
        assert.equal(client.channel, channel);
        assert.equal(client.executable, join(latest.folder, `${channelNames[channel]}.exe`));
    }
});

test("channel discovery does not fall back to an old patched version after the active Discord host lost its loader", async t => {
    for (const channel of Object.keys(channelNames)) {
        const f = await fixture(t);
        await windowsInstallation(f.directory, channel, "app-1.0.0");
        const current = await windowsInstallation(f.directory, channel, "app-1.0.1", "Vencord");
        await assert.rejects(findClient(channel, f.directory, "win32"), /No Moggcord/);
        await rm(join(current.folder, "resources", "app", "index.js"));
        await assert.rejects(findClient("auto", f.directory, "win32"), /No Moggcord/);
        const otherChannel = channel === "ptb" ? "stable" : "ptb";
        await windowsInstallation(f.directory, otherChannel);
        assert.equal((await findClient("auto", f.directory, "win32")).channel, otherChannel);
    }
});

test("channel discovery skips newer staging versions that lack the channel executable", async t => {
    const f = await fixture(t);
    const active = await windowsInstallation(f.directory, "stable", "app-1.0.9");
    const staging = await windowsInstallation(f.directory, "stable", "app-1.0.10", "Discord");
    await rm(join(staging.folder, "Discord.exe"));
    await writeFile(join(staging.folder, "DiscordCanary.exe"), "another channel executable");
    const client = await findClient("auto", f.directory, "win32");
    assert.equal(client.channel, "stable");
    assert.equal(client.executable, join(active.folder, "Discord.exe"));
});

test("automatic channel discovery reports missing Moggcord instead of selecting another client mod", async t => {
    const f = await fixture(t);
    await assert.rejects(findClient("auto", f.directory, "win32"), /No Moggcord installation was found/);
    await windowsInstallation(f.directory, "stable", "app-1.0.0", "Discord");
    await windowsInstallation(f.directory, "canary", "app-1.0.0", "Vencord");
    const invalid = await windowsInstallation(f.directory, "ptb");
    await writeFile(invalid.patcher, "// Vencord test");
    await assert.rejects(findClient("auto", f.directory, "win32"), /No Moggcord installation was found/);
    for (const channel of ["stable", "canary", "ptb", "development"]) await assert.rejects(findClient(channel, f.directory, "win32"), /No Moggcord/);
    await assert.rejects(findClient("unknown", f.directory, "win32"), /Choose auto, stable, canary, ptb, or development/);
});

test("automatic channel discovery requires a choice when multiple channels contain Moggcord", async t => {
    const f = await fixture(t);
    for (const channel of ["stable", "canary", "ptb"]) await windowsInstallation(f.directory, channel);
    await assert.rejects(findClient("auto", f.directory, "win32"), error => {
        assert.match(error.message, /multiple Discord installations/);
        for (const channel of ["stable", "canary", "ptb"]) assert(error.message.includes(channel));
        assert.match(error.message, /--channel/);
        return true;
    });
    for (const channel of ["stable", "canary", "ptb"]) assert.equal((await findClient(channel, f.directory, "win32")).channel, channel);
});

test("automatic installation and already-installed results report the detected channel", async t => {
    const f = await fixture(t), data = entry("theme", "body{}", "example.css");
    const target = await windowsInstallation(f.directory, "ptb");
    f.config.channel = "auto";
    f.dependencies.findClient = async channel => { assert.equal(channel, "auto"); return findClient(channel, f.directory, "win32"); };
    for (const action of ["stop", "start"]) f.dependencies[action] = async client => {
        assert.equal(client.executable, join(target.folder, "DiscordPTB.exe"));
        f.events.push(`${action} ${client.channel}`);
    };
    assert.equal((await installEntry(data, f.config, f.dependencies)).channel, "ptb");
    const repeated = await installEntry(data, f.config, f.dependencies);
    assert.equal(repeated.alreadyInstalled, true);
    assert.equal(repeated.channel, "ptb");
    assert.deepEqual(f.events, ["stop ptb", "start ptb"]);
    await repairClient(f.config, f.dependencies);
    assert.deepEqual(f.events, ["stop ptb", "start ptb", "build", "stop ptb", "start ptb"]);
    assert.equal(await readFile(join(dirname(target.patcher), "renderer.js"), "utf8"), "new renderer.js");
});

test("real HTTP bridge rejects other websites, checks downloaded manifests and runs one job at a time", async t => {
    const f = await fixture(t), data = entry("theme", "body { color: purple; }", "midnight.style");
    const website = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); });
    await new Promise(resolvePromise => website.listen(0, "127.0.0.1", resolvePromise));
    t.after(() => new Promise(resolvePromise => website.close(resolvePromise)));
    const origin = `http://127.0.0.1:${website.address().port}`;
    const input = { manifest: `${origin}/api/install/${data.id}`, sha256: data.sha256 };
    assert.equal((await fetchManifest(input, origin)).source_code, data.source_code);
    let release; const pending = new Promise(resolvePromise => { release = resolvePromise; });
    const bridge = createBridge({ ...f.config, origin }, { ...f.dependencies, install: async (...args) => { await pending; return installEntry(...args); } });
    await new Promise(resolvePromise => bridge.server.listen(0, "127.0.0.1", resolvePromise));
    t.after(() => new Promise(resolvePromise => bridge.server.close(resolvePromise)));
    const base = `http://127.0.0.1:${bridge.server.address().port}`;
    assert.equal((await fetch(base + "/v1/status")).status, 403);
    assert.equal((await fetch(base + "/v1/status", { headers: { Origin: "https://evil.example" } })).status, 403);
    const preflight = await fetch(base + "/v1/install", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Private-Network": "true" } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    assert.equal((await fetch(base + "/v1/install", { method: "POST", headers: { Origin: origin } })).status, 415);
    const send = payload => fetch(base + "/v1/install", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Moggcord-Install": "1" }, body: JSON.stringify(payload) });
    assert.equal((await send({ ...input, manifest: "https://evil.example/api/install/" + data.id })).status, 400);
    const response = await send(input); assert.equal(response.status, 202); const job = await response.json();
    assert.equal((await (await send(input)).json()).id, job.id);
    assert.equal((await send({ ...input, sha256: "a".repeat(64) })).status, 400);
    release();
    let result;
    for (let i = 0; i < 100; i++) { result = await (await fetch(`${base}/v1/jobs/${job.id}`, { headers: { Origin: origin } })).json(); if (["complete", "failed"].includes(result.state)) break; await new Promise(resolvePromise => setTimeout(resolvePromise, 10)); }
    assert.equal(result.state, "complete", result.message); assert.deepEqual(f.events, ["stop canary", "start canary"]);
    const modified = { ...input, sha256: "b".repeat(64) };
    await assert.rejects(fetchManifest(modified, origin), /changed/);
});
