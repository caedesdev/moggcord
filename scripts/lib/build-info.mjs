/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const buildFiles = ["patcher.js", "preload.js", "renderer.js", "renderer.css"];
export const fileHash = file => createHash("sha256").update(readFileSync(file)).digest("hex");

export function writeBuildInfo(directory, version) {
    const files = Object.fromEntries(buildFiles.map(name => [name, fileHash(join(directory, name))]));
    writeFileSync(join(directory, "build-info.json"), JSON.stringify({ version, files }, null, 2));
}

export function verifyBuild(directory, version) {
    const info = JSON.parse(readFileSync(join(directory, "build-info.json"), "utf8"));
    if (typeof info.version !== "string" || !/^\d+\.\d+\.\d+$/.test(info.version)
        || (version && info.version !== version.replace(/^v/, "")))
        throw new Error("The release archive contains a different version. Please report this release on GitHub.");
    for (const file of buildFiles) {
        if (info.files?.[file] !== fileHash(join(directory, file)))
            throw new Error(`The release archive contains an incomplete or changed ${file}.`);
    }
    return info;
}
