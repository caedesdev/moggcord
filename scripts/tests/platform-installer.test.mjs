/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createPackage, extractFile } from "@electron/asar";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { desktopPaths } from "../lib/desktop-paths.mjs";
import { installedPatcher, resolveDesktop, stopDesktop } from "../lib/discord-desktop.mjs";
import { buildFiles, writeBuildInfo } from "../lib/build-info.mjs";
import { createDesktopInstaller } from "../../installer-desktop/backend.mjs";

function workspace(t) {
    const directory = mkdtempSync(join(tmpdir(), "moggcord-platform-test-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert(directory.includes("moggcord-platform-test-")); rmSync(directory, { recursive: true, force: true }); });
    return directory;
}

async function fixture(t, platform) {
    const directory = workspace(t), paths = desktopPaths(platform, {}, directory);
    const root = join(directory, platform === "darwin" ? "Discord.app" : "Discord");
    const resources = join(root, platform === "darwin" ? "Contents/Resources" : "resources");
    const binary = join(root, platform === "darwin" ? "Contents/MacOS/Discord" : "Discord");
    mkdirSync(dirname(binary), { recursive: true }); writeFileSync(binary, "fixture executable");
    mkdirSync(resources, { recursive: true });
    const original = join(directory, "original"); mkdirSync(original);
    writeFileSync(join(original, "package.json"), JSON.stringify({ name: "discord", main: "index.js" }));
    writeFileSync(join(original, "index.js"), "module.exports = {};\n");
    writeFileSync(join(original, "padding.bin"), Buffer.alloc(1100000));
    await createPackage(original, join(resources, "app.asar"));
    const installerResources = join(directory, "installer"), bundled = join(installerResources, "desktop"); mkdirSync(bundled, { recursive: true });
    for (const file of buildFiles) writeFileSync(join(bundled, file), `// Moggcord fixture\nnew ${file}`);
    writeBuildInfo(bundled, "1.18.42");
    writeFileSync(join(installerResources, "default-settings.json"), '{"plugins":{"FakeVoice":{"enabled":true}}}');
    const loaderDirectory = join(directory, "loader"); mkdirSync(loaderDirectory);
    writeFileSync(join(loaderDirectory, "package.json"), '{"name":"discord","main":"index.js"}');
    writeFileSync(join(loaderDirectory, "index.js"), `require(${JSON.stringify(join(paths.distDir, "patcher.js"))});`);
    const loader = join(directory, "loader.asar"); await createPackage(loaderDirectory, loader);
    const apply = async action => {
        if (action === "uninstall") copyFileSync(join(resources, "_app.asar"), join(resources, "app.asar"));
        else {
            if (!existsSync(join(resources, "_app.asar"))) copyFileSync(join(resources, "app.asar"), join(resources, "_app.asar"));
            copyFileSync(loader, join(resources, "app.asar"));
        }
        if (action === "uninstall") rmSync(join(resources, "_app.asar"));
    };
    return { directory, paths, root, resources, installerResources, bundled, loader, apply };
}

const finish = async backend => {
    for (let attempt = 0; attempt < 1000; attempt++) {
        const state = backend.getStatus(); if (state.state !== "running") return state;
        await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    throw new Error("Installer did not finish.");
};

test("per-user paths respect macOS Application Support and Linux XDG directories", () => {
    assert.equal(desktopPaths("darwin", {}, "/home/person").distDir.replaceAll("\\", "/"), "/home/person/Library/Application Support/Moggcord/dist/desktop");
    assert.equal(desktopPaths("linux", { XDG_CONFIG_HOME: "/config", XDG_DATA_HOME: "/data" }, "/home/person").distDir.replaceAll("\\", "/"), "/data/Moggcord/dist/desktop");
});

for (const platform of ["darwin", "linux"]) test(`${platform} supports install, duplicate detection, repair and uninstall while preserving settings`, async t => {
    const f = await fixture(t, platform), calls = [];
    const backend = createDesktopInstaller({ platform, resources: f.installerResources, version: "1.18.42", paths: f.paths,
        dependencies: { stop: async target => calls.push(["stop", target.path]), start: async target => calls.push(["start", target.path]), install: f.apply } });
    assert.equal(resolveDesktop(f.root, platform).installed, false);
    assert.equal(backend.getStatus().state, "idle"); assert.equal(calls.length, 0);
    assert.equal(backend.start("install", f.root).started, true);
    assert.equal(backend.start("install", f.root).started, false);
    const installed = await finish(backend); assert.equal(installed.state, "done", installed.error);
    assert.equal(installedPatcher(f.resources), join(f.paths.distDir, "patcher.js"));
    assert.equal(resolveDesktop(f.resources, platform).installed, true);
    const settings = join(f.paths.dataDir, "settings", "settings.json");
    writeFileSync(settings, '{"mySettings":"keep"}');
    const count = calls.length;
    backend.start("install", f.root); assert.equal((await finish(backend)).result, "alreadyInstalled"); assert.equal(calls.length, count);
    writeFileSync(join(f.paths.distDir, "renderer.js"), "// Moggcord community build\ncompiled custom plugin");
    writeBuildInfo(f.paths.distDir, "1.18.42");
    backend.start("repair", f.root); assert.equal((await finish(backend)).state, "done");
    assert.match(readFileSync(join(f.paths.distDir, "renderer.js"), "utf8"), /compiled custom plugin/);
    assert.equal(readFileSync(settings, "utf8"), '{"mySettings":"keep"}');
    rmSync(join(f.paths.distDir, "patcher.js"));
    assert.equal(resolveDesktop(f.root, platform).installed, true);
    backend.start("repair", f.root); assert.equal((await finish(backend)).state, "done");
    assert(existsSync(join(f.paths.distDir, "patcher.js")));
    backend.start("uninstall", f.root); assert.equal((await finish(backend)).state, "done");
    assert.equal(resolveDesktop(f.root, platform).installed, false);
    assert.equal(extractFile(join(f.resources, "app.asar"), "index.js").toString(), "module.exports = {};\n");
    assert.equal(readFileSync(settings, "utf8"), '{"mySettings":"keep"}');
    assert(calls.every(([, path]) => path === f.root));
});

test("damaged builds and unapproved replacement never close Discord or change its files", async t => {
    const f = await fixture(t, "linux"), before = readFileSync(join(f.resources, "app.asar"));
    let stopped = false;
    const options = { platform: "linux", resources: f.installerResources, version: "1.18.42", paths: f.paths, dependencies: { stop: async () => { stopped = true; } } };
    writeFileSync(join(f.bundled, "renderer.js"), "corrupt");
    const backend = createDesktopInstaller(options); backend.start("install", f.root);
    assert.equal((await finish(backend)).state, "error"); assert.equal(stopped, false);
    assert.deepEqual(readFileSync(join(f.resources, "app.asar")), before);
    const blocked = createDesktopInstaller({ ...options, dependencies: { ...options.dependencies, resolve: () => ({ otherMod: true, installed: false }) } });
    blocked.start("install", f.root); assert.match((await finish(blocked)).error, /Confirm replacing/); assert.equal(stopped, false);
});

test("failed patching restores the previous build and keeps the original settings", async t => {
    const f = await fixture(t, "linux");
    mkdirSync(f.paths.distDir, { recursive: true });
    for (const file of buildFiles) writeFileSync(join(f.paths.distDir, file), `// Moggcord old\nold ${file}`);
    writeBuildInfo(f.paths.distDir, "1.18.41");
    const backend = createDesktopInstaller({ platform: "linux", resources: f.installerResources, version: "1.18.42", paths: f.paths,
        dependencies: { stop: async () => {}, start: async () => {}, install: async () => { throw new Error("Permission denied"); } } });
    backend.start("install", f.root); assert.equal((await finish(backend)).state, "error");
    assert.match(readFileSync(join(f.paths.distDir, "renderer.js"), "utf8"), /old renderer/);
    assert.equal(existsSync(f.paths.distDir + ".installer-backup"), false);
});

test("the pinned native installer actually patches and restores an ASAR on its target OS", { skip: !process.env.MOGGCORD_NATIVE_INSTALLER }, async t => {
    const platform = process.platform, f = await fixture(t, platform);
    mkdirSync(f.paths.distDir, { recursive: true });
    for (const file of buildFiles) copyFileSync(join(f.bundled, file), join(f.paths.distDir, file));
    const env = { ...process.env, EQUICORD_USER_DATA_DIR: f.paths.dataDir, EQUICORD_DIRECTORY: join(f.paths.distDir, "patcher.js"), EQUICORD_DEV_INSTALL: "1" };
    const invoke = action => execFileSync(process.env.MOGGCORD_NATIVE_INSTALLER, ["-" + action, "-location", f.root], { env, stdio: "pipe", timeout: 60000 });
    invoke("install"); assert.equal(resolveDesktop(f.root, platform).installed, true);
    invoke("install"); assert.equal(resolveDesktop(f.root, platform).installed, true);
    invoke("uninstall"); assert.equal(resolveDesktop(f.root, platform).installed, false);
    assert.equal(extractFile(join(f.resources, "app.asar"), "index.js").toString(), "module.exports = {};\n");
});

test("native process closing stops only the selected installation", { skip: !process.env.MOGGCORD_NATIVE_INSTALLER }, async t => {
    const first = await fixture(t, process.platform), second = await fixture(t, process.platform);
    const source = join(first.directory, "idle.c");
    writeFileSync(source, "#include <unistd.h>\nint main(void){for(;;)pause();}\n");
    const clients = [first, second].map(item => resolveDesktop(item.root));
    for (const client of clients) execFileSync("cc", [source, "-o", client.executable]);
    const children = clients.map(client => spawn(client.executable, [], { stdio: "ignore" }));
    t.after(() => { for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); });
    await Promise.all(children.map(child => new Promise((resolvePromise, reject) => { child.once("spawn", resolvePromise); child.once("error", reject); })));
    const stopped = new Promise(resolvePromise => children[0].once("exit", resolvePromise));
    await stopDesktop(clients[0]); await stopped;
    assert.equal(children[1].exitCode, null); assert.equal(children[1].signalCode, null); process.kill(children[1].pid, 0);
    await stopDesktop(clients[1]);
});
