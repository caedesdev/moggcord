/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { buildFiles, verifyBuild, writeBuildInfo } from "../lib/build-info.mjs";

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
