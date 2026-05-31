/*
 * Shared helpers for Discord desktop injection / cleanup.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { join } from "path";

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

export function isValidAsarFile(path) {
    return asarSize(path) >= MIN_VALID_ASAR_BYTES;
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

    let changed = false;

    if (existsSync(appDirPath) && (isModInjection(resourcesDir) || existsSync(backupPath))) {
        rmSync(appDirPath, { recursive: true, force: true });
        changed = true;
    }

    if (existsSync(appAsarPath)) {
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

    if (!existsSync(appAsarPath) && existsSync(backupPath)) {
        if (isValidAsarFile(backupPath)) {
            renameSync(backupPath, appAsarPath);
            changed = true;
        } else {
            console.warn(`\x1b[33m[Moggcord] _app.asar backup looks corrupt in ${resourcesDir} — reinstall Discord if inject fails.\x1b[0m`);
        }
    }

    // Keep _app.asar when both exist and are valid — Equilotl may expect this during reinstall.
    // Never rmSync(backupPath) here; that was breaking double injects.

    return changed;
}

export function isMoggcordDevInjection(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const meta = readInjectorMeta(appDirPath);
    return meta?.pkg?.name === "moggcord" && meta.isModLoader;
}

export function writeMoggcordLoader(resourcesDir, patcherPath) {
    const appDirPath = join(resourcesDir, "app");
    mkdirSync(appDirPath, { recursive: true });

    writeFileSync(join(appDirPath, "package.json"), JSON.stringify({
        name: "moggcord",
        main: "index.js"
    }, null, 2));

    const escaped = patcherPath.replace(/\\/g, "\\\\");
    writeFileSync(join(appDirPath, "index.js"),
        `// Moggcord Injector — auto-generated, do not edit\n"use strict";\nrequire("${escaped}");\n`
    );
}

export function warnIfCorruptAppAsar(resourcesDir) {
    const appAsar = join(resourcesDir, "app.asar");
    const backup = join(resourcesDir, "_app.asar");

    if (existsSync(appAsar) && !isValidAsarFile(appAsar)) {
        console.warn(`\x1b[33m[Moggcord] Warning: app.asar in ${resourcesDir} looks corrupt (${asarSize(appAsar)} bytes).\x1b[0m`);
        console.warn("\x1b[33m           Reinstall Discord if the client does not start.\x1b[0m");
    }
    if (existsSync(backup) && !isValidAsarFile(backup)) {
        console.warn(`\x1b[33m[Moggcord] Warning: _app.asar backup is also corrupt — original Discord app may be lost.\x1b[0m`);
    }
}
