/*
 * Moggcord — Auto-updater (HTTP / GitHub Releases via ASAR)
 * Vérifie les releases sur GitHub, télécharge le desktop.asar et remplace l'ancien.
 */

import { fetchBuffer, fetchJson } from "@main/utils/http";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { ipcMain, app } from "electron";
import { writeFileSync, rmSync, existsSync } from "original-fs";
import { join } from "path";
import { exec } from "child_process";

import { serializeErrors } from "./common";

const RELEASES_REPO = "caedesdev/moggcord";
const API_BASE      = `https://api.github.com/repos/${RELEASES_REPO}`;
const REPO_URL      = `https://github.com/${RELEASES_REPO}`;
declare const VERSION: string;
const CURRENT_VERSION = `v${VERSION}`;
const ZIP_FILE = "moggcord-dist.zip";

let pendingDownloadUrl: string | null  = null;
let pendingVersion:     string | null  = null;
let pendingZipPath:     string | null  = null;
let isApplying                         = false;

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
        exec(`powershell -NoProfile -NonInteractive -Command "${command}"`, err => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function fetchUpdates(): Promise<boolean> {
    const data = await githubGet("/releases/latest");
    const latestTag: string = data.tag_name ?? "";

    if (!latestTag || !isNewer(CURRENT_VERSION, latestTag)) return false;

    const asset = (data.assets as any[])?.find(
        (a: any) => a.name === ZIP_FILE
    );
    if (!asset) return false;

    pendingDownloadUrl = asset.browser_download_url;
    pendingVersion     = latestTag;
    return true;
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

async function applyUpdates(): Promise<boolean> {
    if (isApplying) return false;

    if (!pendingZipPath) {
        if (!pendingDownloadUrl) return false;
        await downloadUpdate();
    }

    if (!pendingZipPath || !existsSync(pendingZipPath)) return false;

    isApplying = true;

    const zipPath = pendingZipPath;
    const destPath = __dirname;
    const tmpExtract = join(app.getPath("temp"), `moggcord-extract-${Date.now()}`);

    try {
        const psExtract = `Expand-Archive -LiteralPath '${psQuote(zipPath)}' -DestinationPath '${psQuote(tmpExtract)}' -Force`;
        await runPowerShell(psExtract);

        const psMove = `Copy-Item -Path '${psQuote(join(tmpExtract, "*"))}' -Destination '${psQuote(destPath)}' -Recurse -Force`;
        await runPowerShell(psMove);

        pendingDownloadUrl = null;
        pendingVersion = null;
        pendingZipPath = null;
        try { rmSync(zipPath, { force: true }); } catch {}
        return true;
    } catch (err) {
        // Files are often locked while Discord is running — keep the zip for apply on quit
        console.warn("[Moggcord] Live apply failed (will retry on quit):", err);
        return false;
    } finally {
        try { rmSync(tmpExtract, { recursive: true, force: true }); } catch {}
        isApplying = false;
    }
}

/** Download the update package (used by UPDATE IPC). */
async function prepareUpdate(): Promise<boolean> {
    const hasUpdate = await fetchUpdates();
    if (!hasUpdate) return false;
    return downloadUpdate();
}

/**
 * Try to apply now; if files are locked, return true anyway when the package is downloaded
 * so the before-quit handler can finish the install.
 */
async function buildOrDefer(): Promise<boolean> {
    if (!pendingZipPath) {
        const ok = await downloadUpdate();
        if (!ok) return false;
    }

    const applied = await applyUpdates();
    if (applied) return true;

    // Package is on disk — install will run when Discord closes
    return pendingZipPath !== null && existsSync(pendingZipPath);
}

// ─── Auto-update on quit ─────────────────────────────────────────────────────
app.on("before-quit", (event) => {
    const hasPending = pendingZipPath && existsSync(pendingZipPath);
    if (!hasPending && !pendingDownloadUrl) return;
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
            if (ok) console.log("[Moggcord] Update applied successfully on quit.");
            else console.warn("[Moggcord] Update on quit returned false.");
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

ipcMain.handle(IpcEvents.GET_REPO,    serializeErrors(() => REPO_URL));
ipcMain.handle(IpcEvents.GET_UPDATES, serializeErrors(getUpdates));
ipcMain.handle(IpcEvents.UPDATE,      serializeErrors(prepareUpdate));
ipcMain.handle(IpcEvents.BUILD,       serializeErrors(buildOrDefer));
