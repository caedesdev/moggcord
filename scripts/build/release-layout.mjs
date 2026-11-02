/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const installerNames = Object.freeze([
    "Moggcord-Installer.exe",
    "Moggcord-Installer-macOS.dmg",
    "Moggcord-Installer-Linux.AppImage",
    "Moggcord-Installer-Linux.deb"
]);

export const updateNames = Object.freeze([
    "moggcord-update.zip", "moggcord-dist.zip", "moggcord-community-compiler.tar.gz", "version.json", "SHA256SUMS.txt",
    "desktop.asar", "moggcord.asar", "installer-verification.json",
    "installer-verification-macos.json", "installer-verification-linux.json"
]);

export async function stageReleaseLayout(directory) {
    const expected = [...installerNames, ...updateNames];
    const entries = await readdir(directory);
    if (entries.length !== expected.length || entries.some(name => !expected.includes(name)))
        throw new Error("Release staging contains missing or unexpected assets.");
    for (const name of expected) {
        const file = await stat(join(directory, name));
        if (!file.isFile() || !file.size) throw new Error(`The release asset ${name} is empty or invalid.`);
    }
    for (const [folder, names] of [["installers", installerNames], ["updates", updateNames]]) {
        const target = join(directory, folder);
        await mkdir(target);
        await Promise.all(names.map(name => copyFile(join(directory, name), join(target, name))));
    }
    return { installers: installerNames.length, updates: updateNames.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    process.stdout.write(JSON.stringify(await stageReleaseLayout(resolve("release-assets"))) + "\n");
