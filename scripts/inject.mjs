/*
 * Moggcord — Local injector for Discord Desktop (dev / safe re-inject)
 *
 * Usage: pnpm inject:dev   (or: node scripts/inject.mjs)
 *
 * Re-running is safe: refreshes the loader without touching _app.asar again.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, renameSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import {
    findAllDiscordResources,
    isMoggcordDevInjection,
    isValidAsarFile,
    prepareForReinject,
    warnIfCorruptAppAsar,
    writeMoggcordLoader,
} from "./discordResources.mjs";

const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(BASE_DIR, "dist", "desktop");

function checkBuild() {
    const patcherPath = join(DIST_DIR, "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Moggcord] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

function refreshInjection(resourcesDir) {
    writeMoggcordLoader(resourcesDir, join(DIST_DIR, "patcher.js"));
    console.log(`\x1b[32m[Moggcord] Refreshed injection (no backup touched): ${resourcesDir}\x1b[0m`);
    return true;
}

function inject(resourcesDir) {
    const appAsarPath = join(resourcesDir, "app.asar");
    const backupPath = join(resourcesDir, "_app.asar");

    if (isMoggcordDevInjection(resourcesDir) && existsSync(backupPath) && isValidAsarFile(backupPath)) {
        return refreshInjection(resourcesDir);
    }

    if (isMoggcordDevInjection(resourcesDir) || existsSync(join(resourcesDir, "app"))) {
        console.log("[Moggcord] Cleaning previous injection before reinstall...");
        prepareForReinject(resourcesDir);
    }

    if (!existsSync(appAsarPath)) {
        console.error("\x1b[31m[Moggcord] No app.asar found — cannot inject.\x1b[0m");
        console.error("\x1b[33m           If Discord is broken, reinstall Discord Stable, then inject once.\x1b[0m");
        warnIfCorruptAppAsar(resourcesDir);
        return false;
    }

    let isDir = false;
    try { isDir = statSync(appAsarPath).isDirectory(); } catch { }
    if (isDir) {
        console.error("\x1b[31m[Moggcord] app.asar is a folder — another mod may be installed.\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm uninject:dev' or reinstall Discord.\x1b[0m");
        return false;
    }

    if (!isValidAsarFile(appAsarPath)) {
        console.error("\x1b[31m[Moggcord] app.asar looks corrupt or too small.\x1b[0m");
        warnIfCorruptAppAsar(resourcesDir);
        return false;
    }

    if (!existsSync(backupPath)) {
        console.log("[Moggcord] Backing up app.asar → _app.asar...");
        renameSync(appAsarPath, backupPath);
    } else if (existsSync(appAsarPath)) {
        console.log("\x1b[33m[Moggcord] app.asar + _app.asar both present — keeping existing backup.\x1b[0m");
    }

    writeMoggcordLoader(resourcesDir, join(DIST_DIR, "patcher.js"));

    console.log(`\x1b[32m[Moggcord] Successfully injected into: ${resourcesDir}\x1b[0m`);
    console.log(`\x1b[32m[Moggcord] Moggcord dist directory: ${DIST_DIR}\x1b[0m`);
    console.log("\x1b[36m[Moggcord] Restart Discord to apply changes.\x1b[0m");
    return true;
}

checkBuild();

const allResources = findAllDiscordResources();
if (allResources.length === 0) {
    console.error("\x1b[31m[Moggcord] No Discord installation found!\x1b[0m");
    console.error("\x1b[33m           Make sure Discord (Stable, PTB, or Canary) is installed.\x1b[0m");
    process.exit(1);
}

let injectedCount = 0;
for (const res of allResources) {
    console.log(`\n[Moggcord] Discord resources: ${res}`);
    if (inject(res)) injectedCount++;
}

if (injectedCount === 0) {
    console.error("\x1b[31m[Moggcord] Injection failed for all targets.\x1b[0m");
    process.exit(1);
}

console.log(`\n\x1b[32m[Moggcord] ${injectedCount}/${allResources.length} injection(s) succeeded.\x1b[0m`);
