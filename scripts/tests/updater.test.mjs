/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { zipSync } from "fflate";
import { buildFiles, writeBuildInfo } from "../lib/build-info.mjs";

const require = createRequire(import.meta.url);
const compiled = await build({
    entryPoints: ["src/main/updater/http.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    define: { VERSION: '"1.18.23"', IS_VESKTOP: "false", IS_EQUIBOP: "false" },
    plugins: [{ name: "test-boundaries", setup(builder) {
        builder.onResolve({ filter: /^(@main\/utils\/http|@shared\/vencordUserAgent|@shared\/IpcEvents|\.\.\/moggcordLoader|\.\.\/postInstallRelaunch)$/ }, args => ({ path: args.path, external: true }));
    } }], external: ["electron", "original-fs"]
});

function loadUpdater(t, { platform = "linux", broken = false, lean = false, separated = false, updateTag = "updates-v1.18.24", missing = false } = {}) {
    const directory = fs.mkdtempSync(join(tmpdir(), "moggcord-updater-test-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert(directory.includes("moggcord-updater-test-")); fs.rmSync(directory, { recursive: true, force: true }); });
    const source = join(directory, "release"), destination = join(directory, "active"), mirror = join(directory, "mirror");
    for (const folder of [source, destination, mirror]) {
        fs.mkdirSync(folder);
        for (const file of buildFiles) fs.writeFileSync(join(folder, file), `${folder === source ? "new" : "old"} ${file}`);
        writeBuildInfo(folder, folder === source && !broken ? "1.18.24" : "1.18.23");
    }
    const handlers = new Map();
    const archive = zipSync(Object.fromEntries([...buildFiles, "build-info.json"].map(file => [file, fs.readFileSync(join(source, file))])));
    const requests = [];
    const metadataRequests = [];
    const network = { respond: async () => new Response(archive, { headers: { "content-length": String(archive.length) } }) };
    const assets = ["moggcord-dist.zip", ...(lean ? ["moggcord-update.zip"] : [])].map(name => ({ name, browser_download_url: `https://github.com/caedesdev/moggcord/releases/download/1.18.24/${name}`, size: archive.length }));
    const replacements = {
        "@main/utils/http": { fetchJson: async (url, options) => {
            assert(options.signal); metadataRequests.push(url);
            if (url.endsWith("/releases/latest")) return { tag_name: "1.18.24", assets: separated ? [{ name: "Moggcord-Installer.exe" }] : assets };
            assert(url.endsWith("/releases/tags/updates-v1.18.24"));
            return { tag_name: updateTag, prerelease: true, assets: missing ? [] : assets.map(asset => ({ ...asset, browser_download_url: asset.browser_download_url.replace("/1.18.24/", "/updates-v1.18.24/") })) };
        }, checkedFetch: async (url, options) => { requests.push(url); return network.respond(url, options); } },
        "@shared/vencordUserAgent": { VENCORD_USER_AGENT: "test" },
        "@shared/IpcEvents": { IpcEvents: { GET_REPO: "repo", GET_UPDATES: "check", UPDATE: "download", BUILD: "apply", UPDATE_STATUS: "status", CANCEL_UPDATE: "cancel" } },
        "../moggcordLoader": { getPatcherInstallDir: () => destination, getMoggcordLocalDistDir: () => mirror },
        "../postInstallRelaunch": { markPendingRelaunch() {} },
        electron: { ipcMain: { handle: (key, callback) => handlers.set(key, callback) }, app: { on() {}, getPath: () => directory } },
        "original-fs": fs,
        child_process: { execFile: (program, args, options, callback) => {
            assert.equal(program, "powershell.exe"); assert(options.windowsHide); assert.equal(options.timeout, 120_000);
            const extracted = args.at(-1).match(/-DestinationPath '([^']+)'/)[1];
            fs.cpSync(source, extracted, { recursive: true }); callback(null);
        } }
    };
    const testProcess = new Proxy(process, { get: (target, property) => property === "platform" ? platform : Reflect.get(target, property) });
    const context = { require: name => replacements[name] ?? require(name), exports: {}, module: { exports: {} }, __dirname: join(directory, "wrong-bundle-directory"), console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Buffer, AbortController, AbortSignal, process: testProcess };
    vm.runInNewContext(compiled.outputFiles[0].text, context);
    return { handlers, directory, destination, mirror, network, requests, metadataRequests, archive };
}

for (const platform of ["win32", "darwin", "linux"]) for (const broken of [false, true]) test(`${platform} updater ${broken ? "rejects the stale release without reporting success" : "replaces the active patcher directory and clears the repeated update"}`, async t => {
    const { handlers, destination, mirror, directory, requests } = loadUpdater(t, { platform, broken });
    assert.equal((await handlers.get("check")()).value.length, 1);
    assert.equal((await handlers.get("download")()).value, true);
    assert.equal((await handlers.get("status")()).value.phase, "downloaded");
    assert((await handlers.get("status")()).value.receivedBytes > 0);
    assert.match(requests[0], /moggcord-dist.zip$/);
    const applied = await handlers.get("apply")();
    assert.equal(applied.ok, true); assert.equal(applied.value, !broken);
    assert.equal((await handlers.get("status")()).value.phase, broken ? "error" : "installed");
    for (const folder of [destination, mirror]) assert.equal(fs.readFileSync(join(folder, "renderer.js"), "utf8"), `${broken ? "old" : "new"} renderer.js`);
    assert.equal((await handlers.get("check")()).value.length, broken ? 1 : 0);
    if (!broken) assert.equal(fs.readdirSync(directory).some(name => name.startsWith("moggcord-download-")), false);
});

test("installer-only releases resolve their matching technical release and keep the small update path", async t => {
    const state = loadUpdater(t, { separated: true, lean: true });
    assert.equal((await state.handlers.get("check")()).value.length, 1);
    assert.equal(state.metadataRequests.length, 2);
    assert.equal((await state.handlers.get("download")()).value, true);
    assert.match(state.requests[0], /\/updates-v1\.18\.24\/moggcord-update\.zip$/);
    assert.equal((await state.handlers.get("apply")()).value, true);
    assert.equal((await state.handlers.get("check")()).value.length, 0);
});

test("missing or mismatched technical releases report a failure without claiming the client is up to date", async t => {
    for (const options of [{ updateTag: "updates-v1.18.23" }, { missing: true }]) {
        const state = loadUpdater(t, { separated: true, ...options });
        const result = await state.handlers.get("check")();
        assert.equal(result.ok, false);
        assert.match(result.error.message, /do not match|unavailable/);
        assert.equal(state.requests.length, 0);
        assert.equal(fs.readFileSync(join(state.destination, "renderer.js"), "utf8"), "old renderer.js");
    }
});

test("concurrent requests share one small update download and cancellation cleans up before a retry", async t => {
    const state = loadUpdater(t, { lean: true });
    await state.handlers.get("check")();
    state.network.respond = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1, 2])); } }));
    const first = state.handlers.get("download")();
    const second = state.handlers.get("download")();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await state.handlers.get("status")()).value.phase, "downloading");
    assert.equal((await state.handlers.get("check")()).value.length, 1);
    assert.equal(state.requests.length, 1);
    assert.match(state.requests[0], /moggcord-update.zip$/);
    assert.equal((await state.handlers.get("cancel")()).value, true);
    for (const result of await Promise.all([first, second])) {
        assert.equal(result.ok, false);
        assert.equal(result.error.name, "AbortError");
    }
    assert.equal((await state.handlers.get("status")()).value.phase, "cancelled");
    assert.equal(fs.readdirSync(state.directory).some(name => name.startsWith("moggcord-download-")), false);
    assert.equal(fs.readFileSync(join(state.destination, "renderer.js"), "utf8"), "old renderer.js");
    state.network.respond = async () => new Response(state.archive);
    assert.equal((await state.handlers.get("download")()).value, true);
    assert.equal((await state.handlers.get("apply")()).value, true);
    assert.equal(state.requests.length, 2);
});

test("an incomplete update clears its partial file, preserves the installed files and can be retried", async t => {
    const state = loadUpdater(t);
    state.network.respond = async () => new Response(state.archive.subarray(0, 20));
    const result = await state.handlers.get("download")();
    assert.equal(result.ok, false);
    assert.match(result.error.message, /incomplete/);
    assert.equal((await state.handlers.get("status")()).value.phase, "error");
    assert.equal(fs.readdirSync(state.directory).some(name => name.startsWith("moggcord-download-")), false);
    assert.equal(fs.readFileSync(join(state.destination, "renderer.js"), "utf8"), "old renderer.js");
    state.network.respond = async () => new Response(state.archive);
    assert.equal((await state.handlers.get("download")()).value, true);
    assert.equal((await state.handlers.get("status")()).value.phase, "downloaded");
});
