/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { extractUpdate } from "../lib/extract-update.mjs";

test("updates extract without system commands and reject escaping paths", t => {
    const directory = mkdtempSync(join(tmpdir(), "moggcord-unix-update-"));
    t.after(() => { assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert(directory.includes("moggcord-unix-update-")); rmSync(directory, { recursive: true, force: true }); });
    const target = join(directory, "valid");
    extractUpdate(zipSync({ "desktop/renderer.js": strToU8("verified renderer") }), target);
    assert.equal(readFileSync(join(target, "desktop", "renderer.js"), "utf8"), "verified renderer");
    for (const name of ["../escaped.js", "/escaped.js", "C:/escaped.js", "desktop/../../escaped.js", "desktop\\escaped.js"]) {
        assert.throws(() => extractUpdate(zipSync({ [name]: strToU8("bad") }), join(directory, "bad")), /unsafe path/);
    }
    assert.equal(existsSync(join(directory, "escaped.js")), false);
});
