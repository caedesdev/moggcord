/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zipSync } from "fflate";
import { buildFiles, verifyBuild } from "../lib/build-info.mjs";

const directory = "dist/desktop";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
verifyBuild(directory, version);
const entries = Object.fromEntries([...buildFiles, "build-info.json"].map(name => [name, readFileSync(join(directory, name))]));
const archive = zipSync(entries, { level: 9 });
mkdirSync("release/release-assets", { recursive: true });
writeFileSync("release/release-assets/moggcord-update.zip", archive);
process.stdout.write(`Verified update archive: ${archive.length} bytes for ${version}\n`);
