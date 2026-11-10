/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { build } from "esbuild";
import { createManagedService, runManagedService } from "../community/service.mjs";

const origin = "https://moggcord.cc";
async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-service-test-"));
    t.after(async () => {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert(directory.split(/[\\/]/).pop().startsWith("moggcord-service-test-"));
        await rm(directory, { recursive: true, force: true });
    });
    const config = { origin, channel: "auto", version: "1.18.46", controlToken: randomBytes(32).toString("hex"), sourceRoot: join(directory, "source"), dataDir: directory, mirrorDir: join(directory, "installed") };
    return { directory, config };
}

async function listen(t, service) {
    await new Promise(done => service.server.listen(0, "127.0.0.1", done));
    t.after(() => service.server.listening ? new Promise(done => service.server.close(done)) : undefined);
    return `http://127.0.0.1:${service.server.address().port}`;
}
const control = (base, config, action, extra = {}, headers = {}) => fetch(base + "/v1/service-control", {
    method: "POST", headers: { Authorization: `Bearer ${config.controlToken}`, "Content-Type": "application/json", ...headers }, body: JSON.stringify({ action, ...extra })
});

test("the actual standalone CommonJS bundle loads its dependencies and serves status without starting the legacy CLI", async t => {
    const f = await fixture(t), output = join(f.directory, "community-service.cjs");
    await build({ entryPoints: ["scripts/community/service.mjs"], outfile: output, bundle: true, platform: "node", format: "cjs", target: "node24",
        banner: { js: 'const __moggcord_service_url = require("node:url").pathToFileURL(__filename).href;' },
        define: { "import.meta.url": "__moggcord_service_url", MOGGCORD_BUNDLED_SERVICE: "true", MOGGCORD_SERVICE_VERSION: JSON.stringify(f.config.version) } });
    const bundled = createRequire(import.meta.url)(output);
    for (const version of ["1.18.45", "1.18.47"])
        assert.throws(() => bundled.createManagedService({ ...f.config, version }), /does not match this Moggcord version/);
    const service = bundled.createManagedService(f.config, { findClient: async () => ({ channel: "canary" }) });
    const base = await listen(t, service);
    const response = await fetch(base + "/v1/status", { headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).channel, "canary");
    const child = await promisify(execFile)(process.execPath, ["-e", `process.argv[1] = ${JSON.stringify(output)}; require(${JSON.stringify(output)}); process.stdout.write('bundle loaded');`], {
        env: { ...process.env, APPDATA: f.directory, XDG_CONFIG_HOME: f.directory, HOME: f.directory }, timeout: 10_000
    });
    assert.equal(child.stdout, "bundle loaded");
    assert.equal(child.stderr, "");
});

test("the detached service keeps public CORS separate from authenticated native control", async t => {
    const f = await fixture(t), service = createManagedService(f.config, { findClient: async () => ({ channel: "ptb" }) });
    const base = await listen(t, service);
    const publicStatus = await fetch(base + "/v1/status", { headers: { Origin: origin } });
    assert.equal(publicStatus.status, 200);
    assert.equal((await publicStatus.json()).channel, "ptb");
    assert.equal((await control(base, f.config, "status", {}, { Authorization: "Bearer wrong" })).status, 403);
    assert.equal((await control(base, f.config, "status", {}, { Origin: origin })).status, 403);
    const authenticated = await control(base, f.config, "status");
    assert.equal(authenticated.status, 200);
    assert.deepEqual(await authenticated.json(), { version: f.config.version, pid: process.pid, busy: false });
    assert.equal(authenticated.headers.get("access-control-allow-origin"), null);
    assert.equal((await control(base, f.config, "link", { link: "moggcord://install?manifest=https://wrong.example/api/install/x&sha256=" + "a".repeat(64) })).status, 400);
    assert.equal((await control(base, f.config, "status")).status, 200);
});

test("service upgrades cannot interrupt an active installation and links use the validated manifest flow", async t => {
    const f = await fixture(t);
    let release;
    const pending = new Promise(done => { release = done; });
    const service = createManagedService(f.config, { findClient: async () => ({ channel: "stable" }), fetchManifest: async input => input, install: async () => { await pending; return {}; } });
    const base = await listen(t, service), manifest = `${origin}/api/install/${randomUUID()}`, link = new URL("moggcord://install");
    link.searchParams.set("manifest", manifest); link.searchParams.set("sha256", "a".repeat(64));
    const response = await control(base, f.config, "link", { link: link.href });
    assert.equal(response.status, 202);
    assert.equal((await control(base, f.config, "shutdown")).status, 409);
    release();
    await new Promise(done => setImmediate(done));
    assert.equal((await control(base, f.config, "shutdown")).status, 202);
});

test("a second protocol-handler process forwards to the authenticated existing worker", async t => {
    const f = await fixture(t), file = join(f.directory, "service.json");
    await writeFile(file, JSON.stringify(f.config));
    let installs = 0;
    const service = await runManagedService(file, null, { port: 0, findClient: async () => ({ channel: "stable" }), fetchManifest: async input => input, install: async () => { installs++; return {}; } });
    t.after(() => service.server.listening ? new Promise(done => service.server.close(done)) : undefined);
    const link = new URL("moggcord://install");
    link.searchParams.set("manifest", `${origin}/api/install/${randomUUID()}`); link.searchParams.set("sha256", "b".repeat(64));
    const forwarded = await runManagedService(file, link.href, { port: service.server.address().port });
    assert.equal(forwarded, null);
    await new Promise(done => setImmediate(done));
    assert.equal(installs, 1);
    assert(service.server.listening);
});
