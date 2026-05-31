/*
 * Moggcord — Local un-injector for Discord Desktop
 *
 * Usage: pnpm uninject:dev   (or: node scripts/uninject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync } from "fs";
import { join } from "path";

import {
    findAllDiscordResources,
    isModInjection,
    prepareForReinject,
} from "./discordResources.mjs";

function uninject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");

    if (!existsSync(appDirPath) && !existsSync(backupPath)) {
        console.log("\x1b[33m[Moggcord] Nothing to uninject here.\x1b[0m");
        return false;
    }

    if (existsSync(appDirPath) && !isModInjection(resourcesDir)) {
        console.warn(`\x1b[33m[Moggcord] app/ exists but does not look like Moggcord/Equicord — skipped.\x1b[0m`);
        return false;
    }

    prepareForReinject(resourcesDir);

    if (existsSync(appAsarPath)) {
        console.log(`\x1b[32m[Moggcord] Successfully uninjected: ${resourcesDir}\x1b[0m`);
        console.log("\x1b[36m[Moggcord] Restart Discord to apply changes.\x1b[0m");
        return true;
    }

    console.error(`\x1b[31m[Moggcord] Uninject incomplete — app.asar missing in ${resourcesDir}\x1b[0m`);
    console.error("\x1b[33m           Reinstall Discord if the client no longer starts.\x1b[0m");
    return false;
}

const allResources = findAllDiscordResources({ injectedOnly: true });

if (allResources.length === 0) {
    console.error("\x1b[31m[Moggcord] No injected Discord installation found.\x1b[0m");
    process.exit(1);
}

let uninjectCount = 0;
for (const res of allResources) {
    console.log(`\n[Moggcord] Found: ${res}`);
    if (uninject(res)) uninjectCount++;
}

if (uninjectCount === 0) {
    console.error("\x1b[31m[Moggcord] No uninstall succeeded.\x1b[0m");
    process.exit(1);
}

console.log(`\n\x1b[32m[Moggcord] ${uninjectCount}/${allResources.length} uninstall(s) succeeded.\x1b[0m`);
