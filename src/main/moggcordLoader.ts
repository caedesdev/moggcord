/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createPackage, extractFile } from "@electron/asar";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "original-fs";
import { basename, dirname, join } from "path";
import { tmpdir } from "os";

const DISCORD_NEW_UPDATER_STUB_INDEX = 'require(process.resourcesPath+"/_app.asar")';
const DISCORD_NEW_UPDATER_STUB_PKG = JSON.stringify({ name: "discord", main: "index.js" });
const MIN_VALID_ASAR_BYTES = 1_000_000;

export function getMoggcordLocalDistDir() {
    return join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "desktop");
}

/** Paths tried by resources/app/index.js to load patcher.js (keep in sync with scripts/discordResources.mjs). */
export function getPatcherCandidates(primaryInstallDir: string): string[] {
    const localDist = getMoggcordLocalDistDir();
    return [
        join(primaryInstallDir, "patcher.js"),
        join(localDist, "patcher.js"),
        join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "patcher.js"),
    ];
}

export function resolvePatcherPath(primaryInstallDir = __dirname): string | null {
    for (const candidate of getPatcherCandidates(primaryInstallDir)) {
        try {
            if (existsSync(candidate)) return candidate;
        } catch { /* noop */ }
    }
    return null;
}

export function generateLoaderIndexJs(primaryInstallDir: string): string {
    const candidates = getPatcherCandidates(primaryInstallDir).map(p => p.replace(/\\/g, "/"));
    const lines = candidates.map(c => `    ${JSON.stringify(c)},`).join("\n");

    return `// Moggcord Injector — auto-generated, do not edit
"use strict";
const fs = require("fs");
const path = require("path");
const candidates = [
${lines}
    path.join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "desktop", "patcher.js"),
    path.join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "patcher.js"),
];
const resolved = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!resolved) {
    throw new Error("[Moggcord] patcher.js not found. Re-run Moggcord install or: pnpm inject");
}
require(resolved);
`;
}

export function syncDistToLocal(installDir = __dirname): string {
    const dest = getMoggcordLocalDistDir();
    mkdirSync(dest, { recursive: true });

    for (const name of readdirSync(installDir)) {
        if (name.endsWith(".map") || name.endsWith(".LEGAL.txt")) continue;
        const src = join(installDir, name);
        try {
            if (!statSync(src).isFile()) continue;
            cpSync(src, join(dest, name), { force: true });
        } catch { /* skip locked / missing */ }
    }

    return join(dest, "patcher.js");
}

function isNewUpdaterStubAsar(appAsarPath: string): boolean {
    if (!existsSync(appAsarPath)) return false;
    try {
        if (statSync(appAsarPath).isDirectory()) return false;
        return statSync(appAsarPath).size < MIN_VALID_ASAR_BYTES;
    } catch {
        return false;
    }
}

function isValidAsarFile(path: string): boolean {
    try {
        return existsSync(path) && !statSync(path).isDirectory() && statSync(path).size >= MIN_VALID_ASAR_BYTES;
    } catch {
        return false;
    }
}

export function restoreDiscordNewUpdaterStub(resourcesDir: string): boolean {
    const appAsar = join(resourcesDir, "app.asar");
    const backup = join(resourcesDir, "_app.asar");

    if (!isValidAsarFile(backup) || !existsSync(appAsar) || !isNewUpdaterStubAsar(appAsar)) {
        return false;
    }

    let currentIndex = "";
    let broken = statSync(appAsar).size < 100;
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
        createPackage(tmp, appAsar);
        rmSync(tmp, { recursive: true, force: true });
        console.info("[Moggcord] Restored Discord newUpdater app.asar stub.");
        return true;
    } catch (err) {
        console.warn("[Moggcord] Could not restore app.asar stub:", err);
        return false;
    }
}

export function writeMoggcordLoaderToResources(resourcesDir: string, primaryInstallDir = __dirname) {
    const appDir = join(resourcesDir, "app");
    mkdirSync(appDir, { recursive: true });
    restoreDiscordNewUpdaterStub(resourcesDir);

    writeFileSync(join(appDir, "package.json"), JSON.stringify({
        name: "moggcord",
        main: "index.js",
    }, null, 2));

    writeFileSync(join(appDir, "index.js"), generateLoaderIndexJs(primaryInstallDir), "utf8");
}

function isNewer(newVer: string, oldVer: string) {
    const newParts = newVer.slice(4).split(".").map(Number);
    const oldParts = oldVer.slice(4).split(".").map(Number);

    for (let i = 0; i < oldParts.length; i++) {
        if (newParts[i]! > oldParts[i]!) return true;
        if (newParts[i]! < oldParts[i]!) return false;
    }
    return false;
}

/** Re-inject Moggcord after Discord installed a newer app-* folder (also when Discord was closed during update). */
export function repatchLatestDiscordHost(installDir = __dirname): boolean {
    try {
        syncDistToLocal(installDir);

        const currentAppPath = dirname(process.execPath);
        const currentVersion = basename(currentAppPath);
        const discordPath = join(currentAppPath, "..");

        const versions = readdirSync(discordPath)
            .filter(name => name.startsWith("app-") && statSync(join(discordPath, name)).isDirectory());

        if (!versions.length) return false;

        const latestVersion = versions.reduce((prev, curr) => isNewer(curr, prev) ? curr : prev, currentVersion);
        const resources = join(discordPath, latestVersion, "resources");
        const backup = join(resources, "_app.asar");
        const appAsar = join(resources, "app.asar");
        const appDir = join(resources, "app");

        let newUpdater = false;
        try {
            newUpdater = JSON.parse(readFileSync(join(resources, "build_info.json"), "utf8")).newUpdater === true;
        } catch { /* noop */ }

        const patcher = resolvePatcherPath(installDir);
        if (!patcher) {
            console.error("[Moggcord] Cannot repatch Discord — patcher.js not found.");
            return false;
        }

        const installSource = dirname(patcher);
        const loaderLooksOk = existsSync(join(appDir, "index.js"))
            && readFileSync(join(appDir, "index.js"), "utf8").includes("Moggcord Injector");

        // Always refresh loader on latest host folder when newUpdater or loader missing/wrong version.
        const needsLoader = latestVersion !== currentVersion
            || !loaderLooksOk
            || (newUpdater && !existsSync(appDir));

        if (!needsLoader && latestVersion === currentVersion) return false;

        if (newUpdater) {
            if (!isValidAsarFile(backup)) {
                console.warn("[Moggcord] Host update detected but _app.asar missing — run Moggcord install.");
                return false;
            }
            console.info(`[Moggcord] Repatching Discord ${latestVersion} (newUpdater)…`);
            writeMoggcordLoaderToResources(resources, installSource);
            return true;
        }

        if (!existsSync(appAsar) || statSync(appAsar).isDirectory()) return false;

        console.info(`[Moggcord] Repatching Discord ${latestVersion} (legacy layout)…`);

        if (isValidAsarFile(appAsar) && !existsSync(backup)) {
            rmSync(appDir, { recursive: true, force: true });
            renameSync(appAsar, backup);
        }

        writeMoggcordLoaderToResources(resources, installSource);
        return true;
    } catch (err) {
        console.error("[Moggcord] Failed to repatch after Discord host update:", err);
        return false;
    }
}

export function validateMoggcordDist(installDir = __dirname): boolean {
    const required = ["patcher.js", "preload.js", "renderer.js"];
    const missing = required.filter(f => !existsSync(join(installDir, f)));
    if (missing.length) {
        console.error(`[Moggcord] Missing ${missing.join(", ")} in ${installDir} — plugins will not load.`);
        return false;
    }
    return true;
}
