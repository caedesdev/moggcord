/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { execFile } from "child_process";
import { app,ipcMain } from "electron";
import { cpSync, existsSync, mkdtempSync,readdirSync, rmSync, writeFileSync } from "original-fs";
import { dirname,join, resolve } from "path";

import { verifyBuild } from "../../../scripts/lib/build-info.mjs";
import { getMoggcordLocalDistDir,getPatcherInstallDir } from "../moggcordLoader";
import { markPendingRelaunch } from "../postInstallRelaunch";
import { serializeErrors } from "./common";

const RELEASES_REPO = "caedesdev/moggcord";
const API_BASE = `https://api.github.com/repos/${RELEASES_REPO}`;
const REPO_URL = `https://github.com/${RELEASES_REPO}`;
declare const VERSION: string;
let currentVersion = `v${VERSION}`;
const ZIP_FILE = "moggcord-dist.zip";

let pendingDownloadUrl: string | null = null;
let pendingVersion: string | null = null;
let pendingZipPath: string | null = null;
let isApplying = false;

async function githubGet<T = any>(endpoint: string): Promise<T> {
    return fetchJson<T>(API_BASE + endpoint, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": VENCORD_USER_AGENT
        }
    });
}

function isNewer(a: string, b: string): boolean {
    const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const av = parse(a), bv = parse(b);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        if ((bv[i] ?? 0) > (av[i] ?? 0)) return true;
        if ((bv[i] ?? 0) < (av[i] ?? 0)) return false;
    }
    return false;
}

/** Escape single quotes for PowerShell single-quoted strings */
function psQuote(p: string): string {
    return p.replace(/'/g, "''");
}

function runPowerShell(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true }, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

const UPDATE_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedUpdateCheck: { at: number; hasUpdate: boolean } | null = null;
let fetchInFlight: Promise<boolean> | null = null;

async function fetchUpdates(force = false): Promise<boolean> {
    const now = Date.now();
    if (!force && cachedUpdateCheck && now - cachedUpdateCheck.at < UPDATE_CACHE_TTL_MS) {
        return cachedUpdateCheck.hasUpdate;
    }
    if (fetchInFlight && !force) return fetchInFlight;

    fetchInFlight = (async () => {
        try {
            const data = await githubGet("/releases/latest");
            const latestTag: string = data.tag_name ?? "";

            if (!latestTag || !isNewer(currentVersion, latestTag)) {
                pendingDownloadUrl = null;
                pendingVersion = null;
                cachedUpdateCheck = { at: Date.now(), hasUpdate: false };
                return false;
            }

            const asset = (data.assets as any[])?.find(
                (a: any) => a.name === ZIP_FILE
            );
            if (!asset) {
                cachedUpdateCheck = { at: Date.now(), hasUpdate: false };
                return false;
            }

            pendingDownloadUrl = asset.browser_download_url;
            pendingVersion = latestTag;
            cachedUpdateCheck = { at: Date.now(), hasUpdate: true };
            return true;
        } finally {
            fetchInFlight = null;
        }
    })();

    return fetchInFlight;
}

async function downloadUpdate(): Promise<boolean> {
    if (!pendingDownloadUrl) {
        const hasUpdate = await fetchUpdates();
        if (!hasUpdate) return false;
    }

    const data = await fetchBuffer(pendingDownloadUrl!);
    pendingZipPath = join(app.getPath("temp"), `moggcord-update-${pendingVersion ?? Date.now()}.zip`);
    writeFileSync(pendingZipPath, data, { flush: true });
    return true;
}

async function getUpdates() {
    const outdated = await fetchUpdates();
    if (!outdated) return [];
    return [{
        hash:    pendingVersion ?? "new",
        author:  "Moggcord",
        message: `New version available: ${pendingVersion}`
    }];
}

function resolveExtractRoot(extractDir: string): string {
    const patcherAtRoot = join(extractDir, "patcher.js");
    if (existsSync(patcherAtRoot)) return extractDir;

    const entries = readdirSync(extractDir, { withFileTypes: true });
    const dirs = entries.filter(e => e.isDirectory()).map(e => join(extractDir, e.name));
    for (const dir of dirs) {
        if (existsSync(join(dir, "patcher.js"))) return dir;
    }

    throw new Error("No Moggcord desktop build was found in the update archive.");
}

async function applyUpdates(): Promise<boolean> {
    if (isApplying) return false;

    if (!pendingZipPath) {
        if (!pendingDownloadUrl) return false;
        await downloadUpdate();
    }

    if (!pendingZipPath || !existsSync(pendingZipPath)) return false;

    isApplying = true;

    const zipPath = pendingZipPath;
    const destPath = getPatcherInstallDir();
    const tempRoot = resolve(app.getPath("temp"));
    const workspace = mkdtempSync(join(tempRoot, "moggcord-update-"));
    const tmpExtract = join(workspace, "extracted");
    const destinations = [...new Set([resolve(destPath), resolve(getMoggcordLocalDistDir())])];
    const copied: Array<{ destination: string; backup: string; }> = [];

    try {
        const psExtract = `Expand-Archive -LiteralPath '${psQuote(zipPath)}' -DestinationPath '${psQuote(tmpExtract)}' -Force`;
        await runPowerShell(psExtract);

        const sourceDir = resolveExtractRoot(tmpExtract);
        verifyBuild(sourceDir, pendingVersion);
        for (const [index, destination] of destinations.entries()) {
            const backup = join(workspace, `backup-${index}`);
            if (existsSync(destination)) cpSync(destination, backup, { recursive: true });
            copied.push({ destination, backup });
            cpSync(sourceDir, destination, { recursive: true, force: true });
            verifyBuild(destination, pendingVersion);
        }

        currentVersion = pendingVersion!;
        cachedUpdateCheck = { at: Date.now(), hasUpdate: false };

        pendingDownloadUrl = null;
        pendingVersion = null;
        pendingZipPath = null;
        try { rmSync(zipPath, { force: true }); } catch {}
        markPendingRelaunch();
        return true;
    } catch (err) {
        for (const { destination, backup } of copied.reverse()) {
            if (existsSync(backup)) cpSync(backup, destination, { recursive: true, force: true });
        }
        console.warn("[Moggcord] Live apply failed (will retry on quit):", err);
        return false;
    } finally {
        if (dirname(resolve(workspace)) === tempRoot) rmSync(workspace, { recursive: true, force: true });
        isApplying = false;
    }
}

async function prepareUpdate(): Promise<boolean> {
    const hasUpdate = await fetchUpdates();
    if (!hasUpdate) return false;
    return downloadUpdate();
}

async function buildOrDefer(): Promise<boolean> {
    if (!pendingZipPath) {
        const ok = await downloadUpdate();
        if (!ok) return false;
    }

    const applied = await applyUpdates();
    if (applied) return true;

    return false;
}

app.on("before-quit", event => {
    // Only defer quit when a zip was actually downloaded — not when fetchUpdates()
    // merely stored a GitHub URL after a background update check.
    const hasPending = pendingZipPath && existsSync(pendingZipPath);
    if (!hasPending) return;
    if (isApplying) return;

    event.preventDefault();
    console.log("[Moggcord] Applying pending update before quit...");

    const safetyTimeout = setTimeout(() => {
        console.error("[Moggcord] Update on quit timed out — forcing exit.");
        pendingDownloadUrl = null;
        pendingVersion = null;
        pendingZipPath = null;
        app.exit(0);
    }, 45_000);

    (async () => {
        try {
            if (!pendingZipPath && pendingDownloadUrl) {
                await downloadUpdate();
            }
            const ok = await applyUpdates();
            if (ok) {
                markPendingRelaunch();
                console.log("[Moggcord] Update applied successfully on quit.");
            } else console.warn("[Moggcord] Update on quit returned false.");
        } catch (err) {
            console.error("[Moggcord] Update on quit failed:", err);
            pendingDownloadUrl = null;
            pendingVersion = null;
            pendingZipPath = null;
        } finally {
            clearTimeout(safetyTimeout);
            app.exit(0);
        }
    })();
});

ipcMain.handle(IpcEvents.GET_REPO, serializeErrors(() => REPO_URL));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(getUpdates));
ipcMain.handle(IpcEvents.UPDATE, serializeErrors(prepareUpdate));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(buildOrDefer));
