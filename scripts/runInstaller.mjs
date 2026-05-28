/*
 * Moggcord — Installer via EquilotlCli
 * Downloads EquilotlCli.exe from Equicord releases and runs it
 * with environment variables pointing at Moggcord files.
 *
 * The executable shows a GUI to pick the target Discord install.
 *
 * Usage:
 *   pnpm inject    → install Moggcord into the chosen Discord
 *   pnpm uninject  → uninstall Moggcord from Discord
 *   pnpm repair    → repair the installation
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { execFileSync, execSync } from "child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, renameSync, rmSync, statSync } from "fs";
import { chmodSync } from "fs";
import { dirname, join } from "path";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

// EquilotlCli is Equicord's graphical installer — reused for Moggcord
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

    // If the binary already exists, use it without checking for updates
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

    // Ensure the binary is executable (Linux/macOS)
    if (process.platform !== "win32") {
        try { chmodSync(outputFile, 0o755); } catch { }
    }

    console.log("[Moggcord] Installer downloaded successfully!");
    return outputFile;
}

// ── Discord process control (Windows) ───────────────────────────────────────
function stopDiscord() {
    if (process.platform !== "win32") return;
    for (const img of ["Discord.exe", "DiscordSystemHelper.exe"]) {
        try {
            execSync(`taskkill /F /IM ${img} /T`, { stdio: "ignore" });
        } catch { }
    }
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

function warnIfCorruptAppAsar(resourcesDir) {
    const appAsar = join(resourcesDir, "app.asar");
    const backup = join(resourcesDir, "_app.asar");
    try {
        if (existsSync(appAsar) && statSync(appAsar).size < 10_000) {
            console.warn(`\x1b[33m[Moggcord] Warning: app.asar in ${resourcesDir} looks too small (${statSync(appAsar).size} bytes).\x1b[0m`);
            console.warn("\x1b[33m           Reinstall Discord if the client does not start.\x1b[0m");
        }
        if (existsSync(backup) && statSync(backup).size < 10_000) {
            console.warn(`\x1b[33m[Moggcord] Warning: _app.asar backup is also tiny — original Discord app may be lost.\x1b[0m`);
        }
    } catch { }
}

// ── Verify build exists ────────────────────────────────────────────────────
function checkBuild() {
    const patcherPath = join(BASE_DIR, "dist", "desktop", "patcher.js");
    if (!existsSync(patcherPath)) {
        console.error("\x1b[31m[Moggcord] dist/desktop/patcher.js not found!\x1b[0m");
        console.error("\x1b[33m           Run 'pnpm build' first, then try again.\x1b[0m");
        process.exit(1);
    }
}

// ── Clean up old installations automatically ─────────────────────────────────
function cleanOldMoggcord() {
    console.log("[Moggcord] Scanning and cleaning up old installations...");
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";
        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d));
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { }
        }
    } else if (platform === "darwin") {
        candidates.push(
            "/Applications/Discord.app/Contents/Resources",
            "/Applications/Discord PTB.app/Contents/Resources",
            "/Applications/Discord Canary.app/Contents/Resources"
        );
    } else if (platform === "linux") {
        candidates.push(
            "/usr/share/discord/resources",
            "/usr/lib/discord/resources",
            "/opt/discord/resources",
            "/opt/Discord/resources",
            join(process.env.HOME || "", ".local/share/flatpak/app/com.discordapp.Discord/current/active/files/discord/resources"),
            "/snap/discord/current/usr/share/discord/resources"
        );
    }

    let cleanedAny = false;

    for (const resourcesDir of candidates) {
        if (!existsSync(resourcesDir)) continue;

        const appDirPath = join(resourcesDir, "app");
        const backupPath = join(resourcesDir, "_app.asar");
        const appAsarPath = join(resourcesDir, "app.asar");

        try {
            // 1. Remove app/ folder if it was created by old Moggcord
            if (existsSync(appDirPath)) {
                let shouldDelete = false;
                try {
                    const pkgFile = join(appDirPath, "package.json");
                    if (existsSync(pkgFile)) {
                        const pkg = JSON.parse(readFileSync(pkgFile, "utf-8"));
                        if (pkg.name === "moggcord") {
                            shouldDelete = true;
                        }
                    } else {
                        // app/ without package.json but _app.asar exists — likely leftover from old injector
                        if (existsSync(backupPath)) shouldDelete = true;
                    }
                } catch {
                    shouldDelete = true;
                }

                if (shouldDelete) {
                    console.log(`[Moggcord] Removing old app/ folder in: ${resourcesDir}`);
                    rmSync(appDirPath, { recursive: true, force: true });
                    cleanedAny = true;
                }
            }

            // 2. If _app.asar exists, restore the original backup to app.asar
            if (existsSync(backupPath)) {
                let isAsarDir = false;
                if (existsSync(appAsarPath)) {
                    try {
                        isAsarDir = statSync(appAsarPath).isDirectory();
                    } catch {}
                }

                if (isAsarDir) {
                    console.log(`[Moggcord] Removing temporary app.asar folder in: ${resourcesDir}`);
                    rmSync(appAsarPath, { recursive: true, force: true });
                }

                if (!existsSync(appAsarPath) || isAsarDir) {
                    console.log(`[Moggcord] Restoring _app.asar -> app.asar in: ${resourcesDir}`);
                    renameSync(backupPath, appAsarPath);
                    cleanedAny = true;
                } else {
                    // Original app.asar already present as a file — remove obsolete backup
                    console.log(`[Moggcord] Removing obsolete _app.asar backup in: ${resourcesDir}`);
                    rmSync(backupPath, { force: true });
                    cleanedAny = true;
                }
            }
        } catch (e) {
            console.error(`[Moggcord] Error while cleaning ${resourcesDir}:`, e.message);
        }
    }

    if (cleanedAny) {
        console.log("[Moggcord] Old installations cleaned up successfully!");
    } else {
        console.log("[Moggcord] No old installations to clean up.");
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────
// Clean old Moggcord traces first to avoid conflicts or file locks
cleanOldMoggcord();

// Only verify build for install/repair (not uninject)
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

        // Try silent uninstall
        // Note: EquilotlCli may prompt for selection if multiple Discords are found,
        // but this is still the safest way to restore the original index.js.
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
    const localAppData = process.env.LOCALAPPDATA || "";
    for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
        const base = join(localAppData, channel);
        if (!existsSync(base)) continue;
        try {
            for (const ver of readdirSync(base).filter(d => /^app-\d+\.\d+\.\d+$/.test(d))) {
                warnIfCorruptAppAsar(join(base, ver, "resources"));
            }
        } catch { }
    }

    console.log("[Moggcord] Restarting Discord...");
    if (startDiscord()) {
        console.log("\x1b[32m[Moggcord] Discord restarted with Moggcord loaded.\x1b[0m");
    } else {
        console.log("\x1b[33m[Moggcord] Could not auto-start Discord — open it manually once.\x1b[0m");
    }
}
