/*
 * Moggcord — Local injector for Discord Desktop (dev / safe re-inject)
 *
 * Usage:
 *   pnpm inject:dev              → same patch method as `pnpm inject` (Equilotl, recommended)
 *   pnpm inject:dev --manual     → legacy resources/app loader (can break newUpdater Discord)
 *   pnpm inject:dev --all        → inject every installed Discord channel (manual only)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, renameSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

import {
    clearPendingRelaunchMarker,
    findAllDiscordResources,
    findLatestStableResources,
    hasNewUpdaterLayout,
    isMoggcordDevInjection,
    isModInjection,
    isNewUpdaterStubAsar,
    isValidAsarFile,
    prepareForReinject,
    startDiscordStable,
    stopDiscordProcesses,
    syncMoggcordDistToLocal,
    warnIfCorruptAppAsar,
    writeMoggcordLoader,
} from "./discordResources.mjs";

const BASE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(BASE_DIR, "dist", "desktop");
const INJECT_ALL = process.argv.includes("--all");
const USE_MANUAL = process.argv.includes("--manual");

function checkBuild() {
    const patcherPath = join(DIST_DIR, "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Moggcord] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

function injectViaEquilotl(appRootDir) {
    console.log("\x1b[36m[Moggcord] inject:dev uses Equilotl (same as pnpm inject) — stable only.\x1b[0m");
    console.log("\x1b[2m           Use --manual only if you know you need the legacy app/ loader.\x1b[0m\n");

    syncMoggcordDistToLocal(join(DIST_DIR, "patcher.js"));

    const result = spawnSync(
        process.execPath,
        [
            join(BASE_DIR, "scripts/runInstaller.mjs"),
            "--",
            "--install",
            "-branch",
            "stable",
            "-location",
            appRootDir,
        ],
        {
            cwd: BASE_DIR,
            stdio: "inherit",
            env: {
                ...process.env,
                EQUICORD_USER_DATA_DIR: BASE_DIR,
                EQUICORD_DIRECTORY: DIST_DIR,
                EQUICORD_DEV_INSTALL: "1",
                MOGGCORD_DIRECTORY: DIST_DIR,
            },
        }
    );

    return result.status === 0;
}

function refreshInjection(resourcesDir) {
    return writeMoggcordLoader(resourcesDir, join(DIST_DIR, "patcher.js")).then(() => {
        console.log(`\x1b[32m[Moggcord] Refreshed dev injection (loader only): ${resourcesDir}\x1b[0m`);
        return true;
    });
}

async function injectNewUpdater(resourcesDir) {
    const backupPath = join(resourcesDir, "_app.asar");
    if (!isValidAsarFile(backupPath)) {
        console.error("\x1b[31m[Moggcord] _app.asar missing or invalid — cannot inject newUpdater Discord.\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm inject' once, or reinstall Discord Stable.\x1b[0m");
        return false;
    }

    await writeMoggcordLoader(resourcesDir, join(DIST_DIR, "patcher.js"));

    console.log(`\x1b[32m[Moggcord] Successfully injected (newUpdater, manual loader): ${resourcesDir}\x1b[0m`);
    console.log(`\x1b[33m[Moggcord] If Discord fails to start, run: pnpm inject:dev  (without --manual)\x1b[0m`);
    return true;
}

async function injectManual(resourcesDir) {
    const appAsarPath = join(resourcesDir, "app.asar");
    const backupPath = join(resourcesDir, "_app.asar");
    const appDirPath = join(resourcesDir, "app");

    if (isMoggcordDevInjection(resourcesDir)) {
        return await refreshInjection(resourcesDir);
    }

    if (existsSync(appDirPath) && isModInjection(resourcesDir)) {
        console.log("[Moggcord] Replacing existing mod loader with Moggcord dev loader...");
        prepareForReinject(resourcesDir);
    }

    if (hasNewUpdaterLayout(resourcesDir) || (isNewUpdaterStubAsar(appAsarPath) && isValidAsarFile(backupPath))) {
        return await injectNewUpdater(resourcesDir);
    }

    if (isNewUpdaterStubAsar(appAsarPath) && !isValidAsarFile(backupPath)) {
        console.error("\x1b[31m[Moggcord] Discord newUpdater layout detected but _app.asar is missing.\x1b[0m");
        console.error("\x1b[33m           Use 'pnpm inject' (full installer) or reinstall Discord Stable.\x1b[0m");
        return false;
    }

    if (existsSync(appDirPath)) {
        console.log("[Moggcord] Cleaning previous injection before reinstall...");
        prepareForReinject(resourcesDir);
    }

    if (!existsSync(appAsarPath)) {
        console.error("\x1b[31m[Moggcord] No app.asar found — cannot inject.\x1b[0m");
        warnIfCorruptAppAsar(resourcesDir);
        return false;
    }

    let isDir = false;
    try { isDir = statSync(appAsarPath).isDirectory(); } catch { }
    if (isDir) {
        console.error("\x1b[31m[Moggcord] app.asar is a folder — another mod may be installed.\x1b[0m");
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
    }

    await writeMoggcordLoader(resourcesDir, join(DIST_DIR, "patcher.js"));

    console.log(`\x1b[32m[Moggcord] Successfully injected (manual loader): ${resourcesDir}\x1b[0m`);
    return true;
}

function resolveManualTargets() {
    if (INJECT_ALL) return findAllDiscordResources();
    const stable = findLatestStableResources();
    return stable ? [stable] : findAllDiscordResources();
}

checkBuild();
clearPendingRelaunchMarker();

if (!USE_MANUAL && !INJECT_ALL && process.platform === "win32") {
    const stableResources = findLatestStableResources();
    if (stableResources) {
        const appRoot = dirname(stableResources);
        console.log("\x1b[36m[Moggcord] Closing Discord before injection...\x1b[0m");
        stopDiscordProcesses();

        if (injectViaEquilotl(appRoot)) {
            console.log("\n\x1b[32m[Moggcord] inject:dev succeeded (Equilotl).\x1b[0m");
            console.log("\x1b[36m[Moggcord] Restarting Discord Stable...\x1b[0m");
            if (startDiscordStable()) {
                console.log("\x1b[32m[Moggcord] Discord started.\x1b[0m");
            }
            process.exit(0);
        }

        console.warn("\x1b[33m[Moggcord] Equilotl inject failed — try: pnpm inject\x1b[0m");
        process.exit(1);
    }
}

if (!USE_MANUAL && INJECT_ALL) {
    console.warn("\x1b[33m[Moggcord] --all requires --manual (Equilotl path is stable-only).\x1b[0m");
}

console.log("\x1b[33m[Moggcord] Using legacy manual loader (--manual).\x1b[0m");

const targets = resolveManualTargets();
if (targets.length === 0) {
    console.error("\x1b[31m[Moggcord] No Discord installation found!\x1b[0m");
    process.exit(1);
}

console.log("\x1b[36m[Moggcord] Closing Discord before injection...\x1b[0m");
stopDiscordProcesses({ allChannels: INJECT_ALL });

let injectedCount = 0;
for (const res of targets) {
    console.log(`\n[Moggcord] Discord resources: ${res}`);
    if (await injectManual(res)) injectedCount++;
}

if (injectedCount === 0) {
    console.error("\x1b[31m[Moggcord] Injection failed for all targets.\x1b[0m");
    process.exit(1);
}

console.log(`\n\x1b[32m[Moggcord] ${injectedCount}/${targets.length} injection(s) succeeded.\x1b[0m`);

if (!INJECT_ALL) {
    console.log("\x1b[36m[Moggcord] Restarting Discord Stable...\x1b[0m");
    if (startDiscordStable()) {
        console.log("\x1b[32m[Moggcord] Discord started.\x1b[0m");
    }
}
