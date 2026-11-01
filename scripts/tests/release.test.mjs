/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildFiles, verifyBuild, writeBuildInfo } from "../lib/build-info.mjs";
import { installerNames, stageReleaseLayout, updateNames } from "../build/release-layout.mjs";

test("a release cannot package a stale version, damaged bundle or incomplete build", t => {
    const directory = mkdtempSync(join(tmpdir(), "moggcord-release-test-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert(directory.includes("moggcord-release-test-")); rmSync(directory, { recursive: true, force: true }); });
    for (const file of buildFiles) writeFileSync(join(directory, file), `compiled ${file}`);
    writeBuildInfo(directory, "1.18.23");
    assert.throws(() => verifyBuild(directory, "1.18.24"), /different version/);
    writeBuildInfo(directory, "1.18.24");
    assert.equal(verifyBuild(directory, "v1.18.24").version, "1.18.24");
    const marker = readFileSync(join(directory, "build-info.json"));
    writeFileSync(join(directory, "renderer.js"), "stale or modified");
    assert.throws(() => verifyBuild(directory, "1.18.24"), /renderer.js/);
    writeFileSync(join(directory, "build-info.json"), marker);
    rmSync(join(directory, "preload.js"));
    assert.throws(() => verifyBuild(directory, "1.18.24"));
});

test("public release staging contains exactly the four installers and moves technical files into their own group", async t => {
    const directory = mkdtempSync(join(tmpdir(), "moggcord-release-layout-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
    for (const name of [...installerNames, ...updateNames]) writeFileSync(join(directory, name), name);
    assert.deepEqual(await stageReleaseLayout(directory), { installers: 4, updates: 9 });
    assert.deepEqual(readdirSync(join(directory, "installers")).sort(), [...installerNames].sort());
    assert.deepEqual(readdirSync(join(directory, "updates")).sort(), [...updateNames].sort());
    for (const name of [...installerNames, ...updateNames]) {
        const group = installerNames.includes(name) ? "installers" : "updates";
        assert.equal(readFileSync(join(directory, group, name), "utf8"), name);
    }
});

test("missing, empty or unrecognized release assets stop publication before any public group is created", async t => {
    for (const problem of ["missing", "empty", "extra"]) {
        const directory = mkdtempSync(join(tmpdir(), "moggcord-release-layout-"));
        t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); rmSync(directory, { recursive: true, force: true }); });
        for (const name of [...installerNames, ...updateNames]) writeFileSync(join(directory, name), name);
        if (problem === "missing") rmSync(join(directory, installerNames[0]));
        if (problem === "empty") writeFileSync(join(directory, installerNames[0]), "");
        if (problem === "extra") writeFileSync(join(directory, "debug.txt"), "debug output");
        await assert.rejects(stageReleaseLayout(directory));
        assert.equal(existsSync(join(directory, "installers")), false);
    }
});
