/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFileSync } from "node:fs";
import { verifyBuild } from "../lib/build-info.mjs";

const version = process.argv[2] ?? JSON.parse(readFileSync("package.json", "utf8")).version;
verifyBuild("dist/desktop", version);
process.stdout.write(`Verified Moggcord ${version} and all desktop file fingerprints.\n`);
