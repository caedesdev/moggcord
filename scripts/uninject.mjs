/*
 * Moggcord — Local un-injector for Discord Desktop
 * Reverts injection by:
 * 1. Removing the app/ folder created by inject.mjs
 * 2. Restoring _app.asar → app.asar
 *
 * Usage: pnpm uninject   (or: node scripts/uninject.mjs)
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./checkNodeVersion.js";

import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from "fs";
import { join } from "path";

// ── Locate Discord installations (same logic as inject.mjs) ─────────────────
function findAllDiscordResources() {
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
            "/opt/Discord/resources"
        );
    }

    // Only paths with a Moggcord injection present
    return candidates.filter(p => {
        if (!existsSync(p)) return false;
        return existsSync(join(p, "app")) || existsSync(join(p, "_app.asar"));
    });
}

// ── Uninject ─────────────────────────────────────────────────────────────────
function uninject(resourcesDir) {
    const appDirPath = join(resourcesDir, "app");
    const backupPath = join(resourcesDir, "_app.asar");
    const appAsarPath = join(resourcesDir, "app.asar");

    // Verify app/ was created by Moggcord
    if (existsSync(appDirPath)) {
        try {
            const pkg = JSON.parse(readFileSync(join(appDirPath, "package.json"), "utf-8"));
            if (pkg.name !== "moggcord") {
                console.warn(`\x1b[33m[Moggcord] app/ exists but was not created by Moggcord (name: "${pkg.name}").\x1b[0m`);
                console.warn("\x1b[33m            Aborting to avoid breaking another mod.\x1b[0m");
                return false;
            }
        } catch { }

        console.log("[Moggcord] Removing injected app/ folder...");
        rmSync(appDirPath, { recursive: true, force: true });
    } else {
        console.log("\x1b[33m[Moggcord] No injected app/ folder found.\x1b[0m");
    }

    // Restore backup
    if (existsSync(backupPath) && !existsSync(appAsarPath)) {
        console.log("[Moggcord] Restoring _app.asar → app.asar...");
        renameSync(backupPath, appAsarPath);
    } else if (existsSync(backupPath) && existsSync(appAsarPath)) {
        console.log("[Moggcord] app.asar already present, removing backup...");
        rmSync(backupPath, { force: true });
    }

    console.log(`\x1b[32m[Moggcord] Successfully uninjected from: ${resourcesDir}\x1b[0m`);
    console.log("\x1b[36m[Moggcord] Restart Discord to apply changes.\x1b[0m");
    return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const allResources = findAllDiscordResources();

if (allResources.length === 0) {
    console.error("\x1b[31m[Moggcord] No Discord installation with Moggcord injected was found.\x1b[0m");
    console.error("\x1b[33m           Make sure Moggcord was injected via 'pnpm inject'.\x1b[0m");
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
