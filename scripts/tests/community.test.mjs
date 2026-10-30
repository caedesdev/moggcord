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
import { fetchManifest, findClient, installEntry, parseLink, repairClient, sourceLimit, trustedOrigin, validateManifest } from "../community/core.mjs";
import { buildFiles, writeBuildInfo } from "../lib/build-info.mjs";

const source = 'import definePlugin from "@utils/types"; export default definePlugin({ name: "CommunityExample", description: "An example.", authors: [], start() {} });';
const entry = (kind = "plugin", code = source, filename = "example.ts") => ({ protocol: 1, id: randomUUID(), kind, name: "Example", file_name: filename, source_code: code, sha256: createHash("sha256").update(code).digest("hex") });
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
    const builtins = join(f.config.sourceRoot, "src", "moggcordplugins", "example");
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

test("failed builds restore source and never stop the client or replace installed files", async t => {
    const f = await fixture(t), data = entry();
    f.dependencies.build = async () => { throw new Error("Build failed"); };
    await assert.rejects(installEntry(data, f.config, f.dependencies), /Build failed/);
    assert.deepEqual(f.events, []); assert.equal(await readFile(join(f.client.installDir, "renderer.js"), "utf8"), "old renderer");
    const directory = join(f.config.sourceRoot, "src", "userplugins", `community-${data.id}`);
    assert(!existsSync(directory)); assert.deepEqual(JSON.parse(await readFile(f.settings, "utf8")), f.original);
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
    const client = await findClient("canary", f.directory); assert(client.executable.includes("app-1.0.10"));
    await assert.rejects(findClient("stable", f.directory), /No Moggcord/);
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
