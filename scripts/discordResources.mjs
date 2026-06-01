/*
 * Shared helpers for Discord desktop injection / cleanup.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { tmpdir } from "os";
import { execFileSync, execSync } from "child_process";
import { createPackage, extractFile } from "@electron/asar";

/** Discord newUpdater ships a tiny app.asar stub; real bootstrap is _app.asar. */
const DISCORD_NEW_UPDATER_STUB_INDEX = 'require(process.resourcesPath+"/_app.asar")';
const DISCORD_NEW_UPDATER_STUB_PKG = JSON.stringify({ name: "discord", main: "index.js" });

export const POST_INSTALL_RELAUNCH_MARKER = join(
    process.env.LOCALAPPDATA || "",
    "Moggcord",
    ".pending-relaunch"
);

export function clearPendingRelaunchMarker() {
    try {
        if (existsSync(POST_INSTALL_RELAUNCH_MARKER)) {
            unlinkSync(POST_INSTALL_RELAUNCH_MARKER);
            console.log("[Moggcord] Cleared post-install relaunch marker.");
        }
    } catch { /* noop */ }
}

/** Real Discord app.asar is usually tens of MB — anything tiny is a broken inject artifact. */
export const MIN_VALID_ASAR_BYTES = 1_000_000;

export function findAllDiscordResources({ injectedOnly = false } = {}) {
    const platform = process.platform;
    const candidates = [];

    if (platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA || "";
        for (const channel of ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]) {
            const base = join(localAppData, channel);
            if (!existsSync(base)) continue;
            try {
                const versions = readdirSync(base)
                    .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
                    .sort()
                    .reverse();
                for (const ver of versions) {
                    candidates.push(join(base, ver, "resources"));
                }
            } catch { /* noop */ }
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

    return candidates.filter(p => {
        if (!existsSync(p)) return false;
        const hasApp = existsSync(join(p, "app"));
        const hasAsar = existsSync(join(p, "app.asar"));
        const hasBackup = existsSync(join(p, "_app.asar"));
        if (injectedOnly) return hasApp || hasBackup;
        return hasAsar || hasApp || hasBackup;
    });
}

export function asarSize(path) {
    try {
        if (!existsSync(path)) return 0;
        if (statSync(path).isDirectory()) return 0;
        return statSync(path).size;
    } catch {
        return 0;
    }
}

/** Discord Stable newUpdater ships a tiny app.asar stub; the real app is _app.asar. */
export function isNewUpdaterDiscord(resourcesDir) {
    try {
        const info = JSON.parse(readFileSync(join(resourcesDir, "build_info.json"), "utf8"));
        return info.newUpdater === true;
    } catch {
        return false;
    }
}

export function isNewUpdaterStubAsar(appAsarPath) {
    if (!existsSync(appAsarPath)) return false;
    try {
        if (statSync(appAsarPath).isDirectory()) return false;
        return asarSize(appAsarPath) < MIN_VALID_ASAR_BYTES;
    } catch {
        return false;
    }
}

export function isValidAsarFile(path) {
    return asarSize(path) >= MIN_VALID_ASAR_BYTES;
}

export function findLatestStableResources() {
    if (process.platform !== "win32") {
        const all = findAllDiscordResources();
        return all[0] ?? null;
    }

    const base = join(process.env.LOCALAPPDATA || "", "Discord");
    if (!existsSync(base)) return null;

    try {
        const latest = readdirSync(base)
            .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
            .sort()
            .reverse()
            .find(d => existsSync(join(base, d, "resources")));

        return latest ? join(base, latest, "resources") : null;
    } catch {
        return null;
    }
}

/** Stop Discord processes so resource files are not locked during inject. */
export function stopDiscordProcesses({ allChannels = false } = {}) {
    if (process.platform !== "win32") return;

    const processes = allChannels
        ? ["Discord.exe", "DiscordPTB.exe", "DiscordCanary.exe", "DiscordSystemHelper.exe"]
        : ["Discord.exe", "DiscordSystemHelper.exe"];

    for (const img of processes) {
        try {
            execSync(`taskkill /F /IM ${img} /T`, { stdio: "ignore" });
        } catch { /* not running */ }
    }

    try {
        execSync("timeout /t 2 /nobreak >nul", { stdio: "ignore", shell: true });
    } catch { /* noop */ }
}

/** Start Discord Stable after inject. */
export function startDiscordStable() {
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
        } catch { /* fall through */ }
    }

    try {
        const latest = readdirSync(discordRoot)
            .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
            .sort()
            .reverse()
            .find(d => existsSync(join(discordRoot, d, "Discord.exe")));

        if (latest) {
            execFileSync(join(discordRoot, latest, "Discord.exe"), [], {
                stdio: "ignore",
                detached: true,
                windowsHide: true
            });
            return true;
        }
    } catch { /* noop */ }

    return false;
}

export function hasNewUpdaterLayout(resourcesDir) {
    const appAsar = join(resourcesDir, "app.asar");
    const backup = join(resourcesDir, "_app.asar");
    return isNewUpdaterDiscord(resourcesDir)
        && isNewUpdaterStubAsar(appAsar)
        && isValidAsarFile(backup);
}

export function readInjectorMeta(appDirPath) {
    try {
        const pkgPath = join(appDirPath, "package.json");
        const indexPath = join(appDirPath, "index.js");
        if (!existsSync(pkgPath) || !existsSync(indexPath)) return null;

        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const index = readFileSync(indexPath, "utf-8");
        const isModLoader = /patcher\.js|Moggcord|Equicord|Vencord|vencord|equicord/i.test(index);

        return { pkg, index, isModLoader };
    } catch {
        return null;
    }
}

/** True when resources/app looks like a mod loader (Moggcord / Equilotl / Vencord). */
export function isModInjection(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    if (!existsSync(appDirPath)) return false;

    const meta = readInjectorMeta(appDirPath);
    if (!meta) return false;

    if (meta.isModLoader) return true;
    if (meta.pkg?.name === "moggcord") return true;

    // Equilotl / legacy installer loaders often use name "discord" + backup present
    return meta.pkg?.name === "discord" && existsSync(join(resourcesDir, "_app.asar"));
}

/**
 * Safely undo injection: remove app/ loader, restore app.asar from _app.asar.
 * Never deletes _app.asar unless app.asar is already valid.
 */
export function prepareForReinject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");
    const newUpdater = hasNewUpdaterLayout(resourcesDir);

    let changed = false;

    if (existsSync(appDirPath) && (isModInjection(resourcesDir) || existsSync(backupPath))) {
        rmSync(appDirPath, { recursive: true, force: true });
        changed = true;
    }

    if (existsSync(appAsarPath) && !newUpdater) {
        try {
            if (statSync(appAsarPath).isDirectory()) {
                rmSync(appAsarPath, { recursive: true, force: true });
                changed = true;
            } else if (!isValidAsarFile(appAsarPath) && existsSync(backupPath) && isValidAsarFile(backupPath)) {
                rmSync(appAsarPath, { force: true });
                changed = true;
            }
        } catch { /* noop */ }
    }

    if (!newUpdater && !existsSync(appAsarPath) && existsSync(backupPath)) {
        if (isValidAsarFile(backupPath)) {
            renameSync(backupPath, appAsarPath);
            changed = true;
        } else {
            console.warn(`\x1b[33m[Moggcord] _app.asar backup looks corrupt in ${resourcesDir} — reinstall Discord if inject fails.\x1b[0m`);
        }
    }

    return changed;
}

export function isMoggcordDevInjection(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const meta = readInjectorMeta(appDirPath);
    return meta?.pkg?.name === "moggcord" && meta.isModLoader;
}

/** Copy built dist/desktop into %LOCALAPPDATA%\\Moggcord so inject survives repo moves. */
export function syncMoggcordDistToLocal(patcherPath) {
    const srcDir = dirname(patcherPath);
    const destDir = join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "desktop");
    mkdirSync(destDir, { recursive: true });
    cpSync(srcDir, destDir, { recursive: true, force: true });
    return join(destDir, "patcher.js");
}

/** Restore Discord's 195-byte newUpdater stub if a mod wrote into app.asar. */
export async function restoreDiscordNewUpdaterStub(resourcesDir) {
    if (!hasNewUpdaterLayout(resourcesDir)) return false;

    const appAsar = join(resourcesDir, "app.asar");
    if (!existsSync(appAsar) || !isNewUpdaterStubAsar(appAsar)) return false;

    let currentIndex = "";
    let broken = asarSize(appAsar) < 100;
    try {
        currentIndex = extractFile(appAsar, "index.js").toString("utf8");
    } catch {
        broken = true;
    }

    if (!broken && currentIndex === DISCORD_NEW_UPDATER_STUB_INDEX) return false;
    if (!broken && !/moggcord|vencord|equicord|dist\\desktop|dist\/desktop/i.test(currentIndex)) return false;

    try {
        const tmp = mkdtempSync(join(tmpdir(), "moggcord-discord-stub-"));
        writeFileSync(join(tmp, "index.js"), DISCORD_NEW_UPDATER_STUB_INDEX, "utf8");
        writeFileSync(join(tmp, "package.json"), DISCORD_NEW_UPDATER_STUB_PKG, "utf8");
        await createPackage(tmp, appAsar);
        rmSync(tmp, { recursive: true, force: true });
        console.log("\x1b[33m[Moggcord] Restored Discord newUpdater app.asar stub (was overwritten by a mod).\x1b[0m");
        return true;
    } catch (err) {
        console.warn("\x1b[33m[Moggcord] Could not restore app.asar stub:", err?.message ?? err, "\x1b[0m");
        return false;
    }
}

export async function writeMoggcordLoader(resourcesDir, patcherPath) {
    const appDirPath = join(resourcesDir, "app");
    mkdirSync(appDirPath, { recursive: true });

    const localPatcher = syncMoggcordDistToLocal(patcherPath);
    await restoreDiscordNewUpdaterStub(resourcesDir);

    writeFileSync(join(appDirPath, "package.json"), JSON.stringify({
        name: "moggcord",
        main: "index.js"
    }, null, 2));

    const primary = patcherPath.replace(/\\/g, "/");
    const local = localPatcher.replace(/\\/g, "/");
    writeFileSync(join(appDirPath, "index.js"),
        `// Moggcord Injector — auto-generated, do not edit
"use strict";
const fs = require("fs");
const path = require("path");
const candidates = [
    ${JSON.stringify(primary)},
    ${JSON.stringify(local)},
    path.join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "desktop", "patcher.js"),
    path.join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "patcher.js"),
];
const resolved = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!resolved) {
    throw new Error("[Moggcord] patcher.js not found. Run: pnpm build && pnpm inject:dev");
}
process.env.MOGGCORD_PATCHER_DIR = path.dirname(resolved);
require(resolved);
`
    );
}

export function warnIfCorruptAppAsar(resourcesDir) {
    const appAsar = join(resourcesDir, "app.asar");
    const backup = join(resourcesDir, "_app.asar");

    if (hasNewUpdaterLayout(resourcesDir)) return;

    if (existsSync(appAsar) && !isValidAsarFile(appAsar)) {
        console.warn(`\x1b[33m[Moggcord] Warning: app.asar in ${resourcesDir} looks corrupt (${asarSize(appAsar)} bytes).\x1b[0m`);
        console.warn("\x1b[33m           Reinstall Discord if the client does not start.\x1b[0m");
    }
    if (existsSync(backup) && !isValidAsarFile(backup)) {
        console.warn(`\x1b[33m[Moggcord] Warning: _app.asar backup is also corrupt — original Discord app may be lost.\x1b[0m`);
    }
}
