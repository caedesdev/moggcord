/*
 * Moggcord — Installer via EquilotlCli
 * Downloads EquilotlCli.exe from Equicord releases and runs it
 * with environment variables pointing at Moggcord files.
 *
 * Usage:
 *   pnpm inject    → install Moggcord into the chosen Discord (Equilotl GUI)
 *   pnpm inject:dev → safe local inject for development (scripts/inject.mjs)
 *   pnpm uninject  → uninstall Moggcord from Discord
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import {
    createWriteStream,
    chmodSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    writeFileSync,
} from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

import {
    findAllDiscordResources,
    prepareForReinject,
    warnIfCorruptAppAsar,
} from "./discordResources.mjs";

const BASE_URL = "https://github.com/Equicord/Equilotl/releases/latest/download/";
const INSTALLER_PATH_DARWIN = "Equilotl.app/Contents/MacOS/Equilotl";
const INSTALLER_APP_DARWIN = "Equilotl.app";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");
const ETAG_FILE = join(FILE_DIR, "etag.txt");

function getFilename() {
    switch (process.platform) {
        case "win32":
            return "EquilotlCli.exe";
        case "darwin":
            return "Equilotl.MacOS.zip";
        case "linux":
            return "EquilotlCli-linux";
        default:
            throw new Error("Unsupported platform: " + process.platform);
    }
}

async function ensureBinary() {
    const filename = getFilename();

    mkdirSync(FILE_DIR, { recursive: true });

    const downloadName = join(FILE_DIR, filename);
    const outputFile = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_PATH_DARWIN)
        : downloadName;
    const outputApp = process.platform === "darwin"
        ? join(FILE_DIR, INSTALLER_APP_DARWIN)
        : null;

    if (existsSync(outputFile)) {
        console.log("[Moggcord] Installer already present, using local copy.");
        return outputFile;
    }

    console.log("[Moggcord] Downloading installer (" + filename + ")...");

    const res = await fetch(BASE_URL + filename, {
        headers: {
            "User-Agent": "Moggcord (https://github.com/caedesdev/moggcord)"
        }
    });

    if (!res.ok)
        throw new Error(`Failed to download installer: ${res.status} ${res.statusText}`);

    writeFileSync(ETAG_FILE, res.headers.get("etag") ?? "");

    if (process.platform === "darwin") {
        console.log("[Moggcord] Saving zip...");
        const zip = new Uint8Array(await res.arrayBuffer());
        writeFileSync(downloadName, zip);

        console.log("[Moggcord] Extracting bundle...");
        execSync(`ditto -x -k '${downloadName}' '${FILE_DIR}'`);

        console.log("[Moggcord] Removing macOS quarantine...");
        const logAndRun = cmd => {
            console.log("  Running:", cmd);
            try { execSync(cmd); } catch { }
        };
        logAndRun(`sudo xattr -dr com.apple.quarantine '${outputApp}'`);
    } else {
        const body = Readable.fromWeb(res.body);
        await finished(body.pipe(createWriteStream(outputFile, {
            mode: 0o755,
            autoClose: true
        })));
    }

    if (process.platform !== "win32") {
        try { chmodSync(outputFile, 0o755); } catch { }
    }

    console.log("[Moggcord] Installer downloaded successfully!");
    return outputFile;
}

function markPostInstallRelaunch() {
    const dir = join(process.env.LOCALAPPDATA || "", "Moggcord");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, ".pending-relaunch"), String(Date.now()));
}

function stopDiscord() {
    if (process.platform !== "win32") return;
    for (const img of ["Discord.exe", "DiscordSystemHelper.exe"]) {
        try {
            execSync(`taskkill /F /IM ${img} /T`, { stdio: "ignore" });
        } catch { }
    }
    try { execSync("timeout /t 2 /nobreak >nul", { stdio: "ignore", shell: true }); } catch { }
}

function startDiscord() {
    if (process.platform !== "win32") return false;

    const discordRoot = join(process.env.LOCALAPPDATA || "", "Discord");
    const updateExe = join(discordRoot, "Update.exe");

    if (existsSync(updateExe)) {
        try {
            execFileSync(updateExe, ["--processStart", "Discord.exe"], {
                stdio: "ignore",
                windowsHide: true
            });
            return true;
        } catch { }
    }

    try {
        const versions = readdirSync(discordRoot)
            .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
            .sort()
            .reverse();
        for (const ver of versions) {
            const discordExe = join(discordRoot, ver, "Discord.exe");
            if (!existsSync(discordExe)) continue;
            execFileSync(discordExe, [], { stdio: "ignore", detached: true, windowsHide: true });
            return true;
        }
    } catch { }

    return false;
}

function checkBuild() {
    const patcherPath = join(BASE_DIR, "dist", "desktop", "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Moggcord] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

function cleanOldMoggcord() {
    console.log("[Moggcord] Preparing Discord for safe re-inject...");
    const candidates = findAllDiscordResources();

    let cleanedAny = false;
    for (const resourcesDir of candidates) {
        try {
            if (prepareForReinject(resourcesDir)) {
                console.log(`[Moggcord] Restored clean state: ${resourcesDir}`);
                cleanedAny = true;
            }
        } catch (e) {
            console.error(`[Moggcord] Error while preparing ${resourcesDir}:`, e.message);
        }
    }

    if (cleanedAny) {
        console.log("[Moggcord] Discord prepared for injection.");
    } else {
        console.log("[Moggcord] No previous injection to clean up.");
    }
}

cleanOldMoggcord();

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);

const isUninstall = args.includes("--uninstall");
if (!isUninstall) {
    checkBuild();
}

const installerBin = await ensureBinary();

const isInstall = args.includes("--install");

if (isInstall) {
    console.log("[Moggcord] Closing Discord before injection...");
    stopDiscord();

    console.log("[Moggcord] Cleaning up previous installations (Vencord/Equicord/Moggcord)...");
    try {
        const uninstallArgs = ["--uninstall"];
        const branchIdx = args.findIndex(a => a === "-branch" || a === "--branch");
        if (branchIdx !== -1 && branchIdx + 1 < args.length) {
            uninstallArgs.push("-branch", args[branchIdx + 1]);
        }
        const locationIdx = args.findIndex(a => a === "-location" || a === "--location");
        if (locationIdx !== -1 && locationIdx + 1 < args.length) {
            uninstallArgs.push("-location", args[locationIdx + 1]);
        }

        execFileSync(installerBin, uninstallArgs, {
            stdio: "inherit",
            env: {
                ...process.env,
                EQUICORD_USER_DATA_DIR: BASE_DIR,
                EQUICORD_DIRECTORY: join(BASE_DIR, "dist", "desktop"),
                EQUICORD_DEV_INSTALL: "1"
            }
        });
        console.log("[Moggcord] Cleanup finished.");
    } catch {
        console.log("[Moggcord] No previous mod to remove or cleanup failed.");
    }
}

console.log("[Moggcord] Starting injection...");

try {
    execFileSync(installerBin, args, {
        stdio: "inherit",
        env: {
            ...process.env,
            EQUICORD_USER_DATA_DIR: BASE_DIR,
            EQUICORD_DIRECTORY: join(BASE_DIR, "dist", "desktop"),
            EQUICORD_DEV_INSTALL: "1",
            MOGGCORD_DIRECTORY: join(BASE_DIR, "dist", "desktop")
        }
    });
} catch {
    console.error("[Moggcord] Injection failed.");
    process.exit(1);
}

if (isInstall) {
    for (const resourcesDir of findAllDiscordResources()) {
        warnIfCorruptAppAsar(resourcesDir);
    }

    markPostInstallRelaunch();
    console.log("[Moggcord] Restarting Discord...");
    console.log("\x1b[33m[Moggcord] Discord will restart once more automatically so the UI works correctly.\x1b[0m");
    if (startDiscord()) {
        console.log("\x1b[32m[Moggcord] Discord started — finishing setup on first launch.\x1b[0m");
    } else {
        console.log("\x1b[33m[Moggcord] Could not auto-start Discord — open it manually once.\x1b[0m");
    }
}
