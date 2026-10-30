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
import { buildFiles, writeBuildInfo } from "../lib/build-info.mjs";

const require = createRequire(import.meta.url);
const compiled = await build({
    entryPoints: ["src/main/updater/http.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    define: { VERSION: '"1.18.23"', IS_VESKTOP: "false", IS_EQUIBOP: "false" },
    plugins: [{ name: "test-boundaries", setup(builder) {
        builder.onResolve({ filter: /^(@main\/utils\/http|@shared\/vencordUserAgent|@shared\/IpcEvents|\.\.\/moggcordLoader|\.\.\/postInstallRelaunch)$/ }, args => ({ path: args.path, external: true }));
    } }], external: ["electron", "original-fs"]
});

for (const broken of [false, true]) test(`updater ${broken ? "rejects the stale release without reporting success" : "replaces the active patcher directory and clears the repeated update"}`, async t => {
    const directory = fs.mkdtempSync(join(tmpdir(), "moggcord-updater-test-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert(directory.includes("moggcord-updater-test-")); fs.rmSync(directory, { recursive: true, force: true }); });
    const source = join(directory, "release"), destination = join(directory, "active"), mirror = join(directory, "mirror");
    for (const folder of [source, destination, mirror]) {
        fs.mkdirSync(folder);
        for (const file of buildFiles) fs.writeFileSync(join(folder, file), `${folder === source ? "new" : "old"} ${file}`);
        writeBuildInfo(folder, folder === source && !broken ? "1.18.24" : "1.18.23");
    }
    const handlers = new Map();
    const replacements = {
        "@main/utils/http": { fetchJson: async () => ({ tag_name: "1.18.24", assets: [{ name: "moggcord-dist.zip", browser_download_url: "https://github.com/caedesdev/moggcord/releases/download/1.18.24/moggcord-dist.zip" }] }), fetchBuffer: async () => Buffer.from("fixture zip") },
        "@shared/vencordUserAgent": { VENCORD_USER_AGENT: "test" },
        "@shared/IpcEvents": { IpcEvents: { GET_REPO: "repo", GET_UPDATES: "check", UPDATE: "download", BUILD: "apply" } },
        "../moggcordLoader": { getPatcherInstallDir: () => destination, getMoggcordLocalDistDir: () => mirror },
        "../postInstallRelaunch": { markPendingRelaunch() {} },
        electron: { ipcMain: { handle: (key, callback) => handlers.set(key, callback) }, app: { on() {}, getPath: () => directory } },
        "original-fs": fs,
        child_process: { execFile: (program, args, options, callback) => {
            assert.equal(program, "powershell.exe"); assert(options.windowsHide);
            const extracted = args.at(-1).match(/-DestinationPath '([^']+)'/)[1];
            fs.cpSync(source, extracted, { recursive: true }); callback(null);
        } }
    };
    const context = { require: name => replacements[name] ?? require(name), exports: {}, module: { exports: {} }, __dirname: join(directory, "wrong-bundle-directory"), console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Buffer, process };
    vm.runInNewContext(compiled.outputFiles[0].text, context);
    assert.equal((await handlers.get("check")()).value.length, 1);
    assert.equal((await handlers.get("download")()).value, true);
    const applied = await handlers.get("apply")();
    assert.equal(applied.ok, true); assert.equal(applied.value, !broken);
    for (const folder of [destination, mirror]) assert.equal(fs.readFileSync(join(folder, "renderer.js"), "utf8"), `${broken ? "old" : "new"} renderer.js`);
    assert.equal((await handlers.get("check")()).value.length, broken ? 1 : 0);
});
