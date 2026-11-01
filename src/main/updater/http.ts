/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import type { UpdateProgress } from "@shared/updater";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { execFile } from "child_process";
import { app,ipcMain } from "electron";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "original-fs";
import { basename, dirname,join, resolve } from "path";

import { verifyBuild } from "../../../scripts/lib/build-info.mjs";
import { extractUpdate } from "../../../scripts/lib/extract-update.mjs";
import { getMoggcordLocalDistDir,getPatcherInstallDir } from "../moggcordLoader";
import { markPendingRelaunch } from "../postInstallRelaunch";
import { serializeErrors } from "./common";
import { downloadUpdateFile } from "./download";

const RELEASES_REPO = "caedesdev/moggcord";
const API_BASE = `https://api.github.com/repos/${RELEASES_REPO}`;
const REPO_URL = `https://github.com/${RELEASES_REPO}`;
declare const VERSION: string;
let currentVersion = `v${VERSION}`;
const ZIP_FILE = "moggcord-dist.zip";
const UPDATE_FILE = "moggcord-update.zip";

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
    size?: number;
}

interface ReleaseInfo {
    tag_name: string;
    draft?: boolean;
    assets: ReleaseAsset[];
}

let pendingDownloadUrl: string | null = null;
let pendingVersion: string | null = null;
let pendingZipPath: string | null = null;
let pendingDownloadDir: string | null = null;
let pendingDownloadBytes: number | null = null;
let isApplying = false;
let downloadInFlight: Promise<boolean> | null = null;
let downloadController: AbortController | null = null;
let progress: UpdateProgress = { phase: "idle", receivedBytes: 0, totalBytes: null };

async function githubGet<T = any>(endpoint: string): Promise<T> {
    return fetchJson<T>(API_BASE + endpoint, {
        signal: AbortSignal.timeout(30_000),
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
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 120_000 }, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

const UPDATE_CACHE_TTL_MS = 15 * 60 * 1000;

let cachedUpdateCheck: { at: number; hasUpdate: boolean } | null = null;
let fetchInFlight: Promise<boolean> | null = null;

async function fetchUpdates(force = false): Promise<boolean> {
    if (downloadInFlight || isApplying) return true;
    if (progress.phase === "error" || progress.phase === "cancelled") progress = { phase: "idle", receivedBytes: 0, totalBytes: null };
    const now = Date.now();
    if (!force && cachedUpdateCheck && now - cachedUpdateCheck.at < UPDATE_CACHE_TTL_MS) {
        return cachedUpdateCheck.hasUpdate;
    }
    if (fetchInFlight) return fetchInFlight;

    fetchInFlight = (async () => {
        try {
            const data = await githubGet<ReleaseInfo>("/releases/latest");
            const latestTag: string = data.tag_name ?? "";

            if (!latestTag || !isNewer(currentVersion, latestTag)) {
                pendingDownloadUrl = null;
                pendingVersion = null;
                cachedUpdateCheck = { at: Date.now(), hasUpdate: false };
                return false;
            }

            if (!/^v?\d+\.\d+\.\d+$/.test(latestTag)) throw new Error("The release has an invalid version. Please use the latest installer and choose Repair.");
            let assets = data.assets;
            let asset = assets?.find(a => a.name === UPDATE_FILE) ?? assets?.find(a => a.name === ZIP_FILE);
            if (!asset) {
                const tag = `updates-v${latestTag.replace(/^v/, "")}`;
                const updates = await githubGet<ReleaseInfo>(`/releases/tags/${tag}`);
                if (updates.tag_name !== tag || updates.draft) throw new Error("The update files do not match this release. Please try again later or use the latest installer.");
                assets = updates.assets;
                asset = assets?.find(a => a.name === UPDATE_FILE) ?? assets?.find(a => a.name === ZIP_FILE);
            }
            if (!asset) {
                pendingDownloadUrl = null;
                throw new Error("Update files are unavailable for the new release. Please use the latest installer and choose Repair.");
            }

            if (pendingDownloadDir && pendingVersion !== latestTag) {
                removeDownload(pendingDownloadDir);
                pendingDownloadDir = null;
                pendingZipPath = null;
            }
            pendingDownloadUrl = asset.browser_download_url;
            pendingDownloadBytes = typeof asset.size === "number" && asset.size > 0 ? asset.size : null;
            pendingVersion = latestTag;
            cachedUpdateCheck = { at: Date.now(), hasUpdate: true };
            return true;
        } finally {
            fetchInFlight = null;
        }
    })();

    return fetchInFlight;
}

function removeDownload(directory: string) {
    const path = resolve(directory);
    if (dirname(path) !== resolve(app.getPath("temp")) || !basename(path).startsWith("moggcord-download-"))
        throw new Error("The update download directory is invalid.");
    rmSync(path, { recursive: true, force: true });
}

async function downloadUpdate(): Promise<boolean> {
    if (downloadInFlight) return downloadInFlight;
    if (pendingZipPath && existsSync(pendingZipPath)) return true;
    if (!pendingDownloadUrl) {
        const hasUpdate = await fetchUpdates();
        if (!hasUpdate) return false;
    }

    const directory = mkdtempSync(join(app.getPath("temp"), "moggcord-download-"));
    const zipPath = join(directory, "update.zip");
    const controller = downloadController = new AbortController();
    progress = { phase: "downloading", receivedBytes: 0, totalBytes: pendingDownloadBytes };
    downloadInFlight = (async () => {
        try {
            await downloadUpdateFile(pendingDownloadUrl!, zipPath, controller.signal, pendingDownloadBytes, (receivedBytes, totalBytes) => {
                progress = { phase: "downloading", receivedBytes, totalBytes };
            });
            pendingDownloadDir = directory;
            pendingZipPath = zipPath;
            progress = { ...progress, phase: "downloaded" };
            return true;
        } catch (error) {
            progress = { ...progress, phase: controller.signal.aborted ? "cancelled" : "error", error: error instanceof Error ? error.message : String(error) };
            removeDownload(directory);
            throw error;
        } finally {
            downloadController = null;
            downloadInFlight = null;
        }
    })();
    return downloadInFlight;
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

    const zipPath = pendingZipPath;
    const destPath = getPatcherInstallDir();
    const tempRoot = resolve(app.getPath("temp"));
    const workspace = mkdtempSync(join(tempRoot, "moggcord-update-"));
    const tmpExtract = join(workspace, "extracted");
    const destinations = [...new Set([resolve(destPath), resolve(getMoggcordLocalDistDir())])];
    const copied: Array<{ destination: string; backup: string; }> = [];
    isApplying = true;
    progress = { ...progress, phase: "installing" };

    try {
        if (process.platform === "win32") {
            const psExtract = `Expand-Archive -LiteralPath '${psQuote(zipPath)}' -DestinationPath '${psQuote(tmpExtract)}' -Force`;
            await runPowerShell(psExtract);
        } else extractUpdate(readFileSync(zipPath), tmpExtract);

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
        if (pendingDownloadDir) removeDownload(pendingDownloadDir);
        pendingDownloadDir = null;
        progress = { ...progress, phase: "installed" };
        markPendingRelaunch();
        return true;
    } catch (err) {
        for (const { destination, backup } of copied.reverse()) {
            if (existsSync(backup)) cpSync(backup, destination, { recursive: true, force: true });
        }
        console.warn("[Moggcord] Live apply failed (will retry on quit):", err);
        progress = { ...progress, phase: "error", error: err instanceof Error ? err.message : String(err) };
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
ipcMain.handle(IpcEvents.UPDATE_STATUS, serializeErrors(() => progress));
ipcMain.handle(IpcEvents.CANCEL_UPDATE, serializeErrors(() => {
    if (!downloadController) return false;
    const error = new Error("Download cancelled. You can try again at any time.");
    error.name = "AbortError";
    downloadController.abort(error);
    return true;
}));
ipcMain.handle(IpcEvents.BUILD, serializeErrors(buildOrDefer));
