/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import { build } from "esbuild";
import { zipSync, strToU8 } from "fflate";

const bundled = await build({ entryPoints: ["src/main/community.ts"], bundle: true, write: false, format: "cjs", platform: "node",
    external: ["electron", "original-fs"], define: { VERSION: '"1.18.46"', IS_DEV: "false", IS_REPORTER: "false", IS_WEB: "false", IS_VESKTOP: "false", IS_EQUIBOP: "false" } });
const nativeRequire = createRequire(import.meta.url);

async function fixture(t, { http, childProcess } = {}) {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-runtime-test-"));
    t.after(async () => {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert(directory.split(/[\\/]/).pop().startsWith("moggcord-runtime-test-"));
        await rm(directory, { recursive: true, force: true });
    });
    const module = { exports: {} };
    const app = new EventEmitter();
    app.getPath = () => join(directory, "Discord");
    app.whenReady = () => Promise.resolve();
    const fixtureProcess = Object.create(process);
    fixtureProcess.env = { ...process.env, APPDATA: join(directory, "legacy") };
    vm.runInNewContext(bundled.outputFiles[0].text, { module, exports: module.exports, process: fixtureProcess, Buffer, URL, AbortSignal, setTimeout, clearTimeout,
        require: name => name === "electron" ? { app, net: { fetch: () => { throw new Error("Tests must not download software"); } } }
            : name === "http" && http ? http
            : name === "child_process" && childProcess ? childProcess
            : nativeRequire(name === "original-fs" ? "node:fs" : name) });
    return { directory, ...module.exports };
}

test("private Windows runtime extraction checks the pinned fingerprint and extracts only the Node executable", async t => {
    const f = await fixture(t), destination = join(f.directory, "runtime");
    const bytes = zipSync({ "node-v24.19.0-win-x64/node.exe": strToU8("isolated runtime fixture"), "node-v24.19.0-win-x64/LICENSE": strToU8("Node runtime license"), "node-v24.19.0-win-x64/npm.cmd": strToU8("not needed"), "../outside.txt": strToU8("not extracted") });
    const hash = createHash("sha256").update(bytes).digest("hex");
    await f.extractCommunityRuntime(bytes, destination, "win32", "x64", hash);
    assert.deepEqual((await readdir(destination)).sort(), ["LICENSE", "node.exe"]);
    assert.equal(await readFile(join(destination, "LICENSE"), "utf8"), "Node runtime license");
    assert.equal(await readFile(join(destination, "node.exe"), "utf8"), "isolated runtime fixture");
    await assert.rejects(f.extractCommunityRuntime(bytes, join(f.directory, "changed"), "win32", "x64", "0".repeat(64)), /fingerprint/);
    assert.deepEqual((await readdir(f.directory)).sort(), ["runtime"]);
});

for (const version of ["1.18.46", "1.18.100"]) test(`client startup reuses resident ${version} without a download, shutdown or downgrade`, { skip: process.platform !== "win32" }, async t => {
    const actions = [], commands = [];
    const f = await fixture(t, {
        http: { request(_options, receive) {
            const req = new EventEmitter();
            req.setTimeout = () => req;
            req.end = body => {
                actions.push(JSON.parse(body).action);
                const res = new EventEmitter(); res.statusCode = 200;
                receive(res);
                queueMicrotask(() => { res.emit("data", JSON.stringify({ version, busy: false })); res.emit("end"); });
            };
            return req;
        } },
        childProcess: {
            execFile(file, args, _options, done) { commands.push([file, args]); done(null, "", ""); },
            spawn() { throw new Error("A compatible resident worker must not be replaced"); }
        }
    });
    const directory = join(f.directory, "Moggcord", "community");
    await mkdir(directory, { recursive: true });
    const config = { version, controlToken: "a".repeat(64), nodePath: join(directory, "node.exe"), serviceFile: join(directory, "community-service.cjs") };
    await writeFile(join(directory, "service.json"), JSON.stringify(config));
    f.startCommunityDownloads(join(f.directory, "installed"));
    for (let attempt = 0; commands.length < 3 && attempt < 100; attempt++) await new Promise(done => setTimeout(done, 10));
    assert.deepEqual(actions, ["status"]);
    assert.equal(commands.length, 3);
    assert(commands.every(([file]) => file === "reg.exe"));
    assert.deepEqual(JSON.parse(await readFile(join(directory, "service.json"), "utf8")), config);
});

for (const prepared of [false, true]) test(`normal updates ${prepared ? "prefer valid current sources" : "preserve the retained source chain across an unprepared version"}`, { skip: process.platform !== "win32" }, async t => {
    const commands = [];
    const f = await fixture(t, {
        http: { request(options, receive) {
            const req = new EventEmitter();
            req.setTimeout = () => req;
            req.end = () => {
                const res = new EventEmitter(); res.statusCode = options.headers.Authorization === `Bearer ${"a".repeat(64)}` ? 503 : 200;
                receive(res);
                queueMicrotask(() => { res.emit("data", JSON.stringify(res.statusCode === 200 ? { version: "1.18.46", busy: false } : { error: "Fixture service stopped" })); res.emit("end"); });
            };
            return req;
        } },
        childProcess: {
            execFile(file, _args, _options, done) { commands.push(file); done(null, "", ""); },
            spawn() { const child = new EventEmitter(); child.unref = () => {}; queueMicrotask(() => child.emit("spawn")); return child; }
        }
    });
    const directory = join(f.directory, "Moggcord", "community"), previousSourceRoot = join(directory, "compiler", "1.18.44"), sourceRoot = join(directory, "compiler", "1.18.45");
    const runtime = join(directory, "runtime", `node-v24.19.0-win-${process.arch}`), patcher = join(f.directory, "installed");
    await Promise.all([mkdir(runtime, { recursive: true }), mkdir(previousSourceRoot, { recursive: true }), mkdir(sourceRoot, { recursive: true }), mkdir(patcher)]);
    await writeFile(join(runtime, "node.exe"), "Not executed by this isolated test");
    await writeFile(join(patcher, "community-service.cjs"), "Not executed by this isolated test");
    await writeFile(join(previousSourceRoot, "package.json"), JSON.stringify({ name: "moggcord", version: "1.18.44" }));
    if (prepared) await writeFile(join(sourceRoot, "package.json"), JSON.stringify({ name: "moggcord", version: "1.18.45" }));
    await writeFile(join(directory, "service.json"), JSON.stringify({ version: "1.18.45", controlToken: "a".repeat(64), sourceRoot, previousSourceRoot }));
    f.startCommunityDownloads(patcher);
    for (let attempt = 0; commands.length < 3 && attempt < 100; attempt++) await new Promise(done => setTimeout(done, 10));
    assert.equal(commands.length, 3);
    assert(commands.every(file => file === "reg.exe"));
    const config = JSON.parse(await readFile(join(directory, "service.json"), "utf8"));
    assert.equal(config.version, "1.18.46");
    assert.equal(config.previousSourceRoot, prepared ? sourceRoot : previousSourceRoot);
});

test("a validly fingerprinted archive without Node is rejected rather than starting another executable", async t => {
    const f = await fixture(t);
    const bytes = zipSync({ "node-v24.19.0-win-arm64/unrelated.exe": strToU8("not node") });
    await assert.rejects(f.extractCommunityRuntime(bytes, join(f.directory, "runtime"), "win32", "arm64", createHash("sha256").update(bytes).digest("hex")), /no executable/);
});

test("Windows install links register a hidden runner instead of launching a visible Node console", { skip: process.platform !== "win32" }, async t => {
    const f = await fixture(t), calls = [];
    const configFile = join(f.directory, "service.json");
    await f.registerWorkerProtocol({ nodePath: join(f.directory, "runtime with spaces", "node.exe"), serviceFile: join(f.directory, "community-service.cjs") }, configFile,
        async (file, args, options) => { calls.push({ file, args, options }); return { stdout: "", stderr: "" }; });
    assert.equal(calls.length, 3);
    assert(calls.every(call => call.file === "reg.exe" && call.options.windowsHide));
    const command = calls.at(-1).args[calls.at(-1).args.indexOf("/d") + 1];
    assert.match(command, /powershell\.exe" -NoProfile -NonInteractive -WindowStyle Hidden/);
    assert(command.includes('open-link.ps1" "%1"'));
    const runner = await readFile(join(f.directory, "open-link.ps1"), "utf8");
    assert(runner.includes("Start-Process -FilePath"));
    assert(runner.includes("-ArgumentList $arguments -WindowStyle Hidden"));
    assert(runner.includes("--config") && runner.includes("--link"));
});
