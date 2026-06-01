/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "original-fs";
import { basename, dirname, join } from "path";

const MIN_VALID_ASAR_BYTES = 1_000_000;

export function getMoggcordLocalDistDir() {
    return join(process.env.LOCALAPPDATA || "", "Moggcord", "dist", "desktop");
}

/** Directory containing patcher.js / renderer.js (survives sourceURL-only eval contexts). */
export function getPatcherInstallDir(): string {
    const fromEnv = process.env.MOGGCORD_PATCHER_DIR;
    if (fromEnv && existsSync(join(fromEnv, "patcher.js"))) return fromEnv;

    if (typeof __dirname === "string" && __dirname.length > 1) {
        if (existsSync(join(__dirname, "patcher.js"))) return __dirname;
    }

    const resolved = resolvePatcherPath();
    if (resolved) return dirname(resolved);

    return getMoggcordLocalDistDir();
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

export function resolvePatcherPath(primaryInstallDir = getPatcherInstallDir()): string | null {
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
process.env.MOGGCORD_PATCHER_DIR = path.dirname(resolved);
require(resolved);
`;
}

export function syncDistToLocal(installDir = getPatcherInstallDir()): string {
    const dest = getMoggcordLocalDistDir();
    if (!existsSync(installDir)) return join(dest, "patcher.js");

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

function isValidAsarFile(path: string): boolean {
    try {
        return existsSync(path) && !statSync(path).isDirectory() && statSync(path).size >= MIN_VALID_ASAR_BYTES;
    } catch {
        return false;
    }
}

export function writeMoggcordLoaderToResources(resourcesDir: string, primaryInstallDir = getPatcherInstallDir()) {
    const appDir = join(resourcesDir, "app");
    mkdirSync(appDir, { recursive: true });

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
export function repatchLatestDiscordHost(installDir = getPatcherInstallDir()): boolean {
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

export function validateMoggcordDist(installDir = getPatcherInstallDir()): boolean {
    const required = ["patcher.js", "preload.js", "renderer.js"];
    const missing = required.filter(f => !existsSync(join(installDir, f)));
    if (missing.length) {
        console.error(`[Moggcord] Missing ${missing.join(", ")} in ${installDir} — plugins will not load.`);
        return false;
    }
    return true;
}
