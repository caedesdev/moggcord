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
import { emitKeypressEvents } from "readline";
import { Readable } from "stream";
import { finished } from "stream/promises";
import { fileURLToPath } from "url";

import {
    findAllDiscordResources,
    isMoggcordDevInjection,
    isModInjection,
    isValidAsarFile,
    prepareForReinject,
    warnIfCorruptAppAsar,
} from "./discordResources.mjs";

const BASE_URL = "https://github.com/Equicord/Equilotl/releases/latest/download/";
const INSTALLER_PATH_DARWIN = "Equilotl.app/Contents/MacOS/Equilotl";
const INSTALLER_APP_DARWIN = "Equilotl.app";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE_DIR = join(BASE_DIR, "dist", "Installer");
const ETAG_FILE = join(FILE_DIR, "etag.txt");
const ANSI = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    yellow: "\x1b[33m"
};
const DISCORD_TARGETS = [
    { branch: "stable", directory: "Discord", label: "Discord Stable", process: "Discord.exe", color: ANSI.blue },
    { branch: "ptb", directory: "DiscordPTB", label: "Discord PTB", process: "DiscordPTB.exe", color: ANSI.magenta },
    { branch: "canary", directory: "DiscordCanary", label: "Discord Canary", process: "DiscordCanary.exe", color: ANSI.yellow }
];

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

function getArgValue(args, names) {
    const idx = args.findIndex(arg => names.includes(arg));
    if (idx === -1 || idx + 1 >= args.length) return null;
    return args[idx + 1];
}

function pushArgValue(args, name, value) {
    const shortName = `-${name.replace(/^--/, "")}`;
    if (value == null || getArgValue(args, [name, shortName]) != null) return;
    args.push(name, value);
}

function colorText(text, color) {
    return process.stdout.isTTY ? `${color}${text}${ANSI.reset}` : text;
}

function formatTargetLabel(target) {
    return colorText(target.label, target.color);
}

function formatPatchStatus(target) {
    return colorText(`[${target.patchStatus.label}]`, target.patchStatus.color);
}

function printPatchSummary(targets) {
    console.log(`${colorText("[Moggcord]", ANSI.cyan)} Discord patch status:`);
    for (const target of targets) {
        console.log(`  ${formatTargetLabel(target)} ${formatPatchStatus(target)} ${colorText(target.version, ANSI.dim)}`);
    }
}

function normalizeBranch(branch) {
    const normalized = branch?.toLowerCase();
    if (normalized === "discord" || normalized === "stable") return "stable";
    if (normalized === "discordptb" || normalized === "ptb") return "ptb";
    if (normalized === "discordcanary" || normalized === "canary") return "canary";
    return normalized;
}

function findLatestResources(directory) {
    const root = join(process.env.LOCALAPPDATA || "", directory);
    if (!existsSync(root)) return null;

    try {
        const latest = readdirSync(root)
            .filter(d => /^app-\d+\.\d+\.\d+$/.test(d))
            .sort()
            .reverse()
            .find(d => existsSync(join(root, d, "resources")));

        if (!latest) return null;

        return {
            root,
            version: latest.slice("app-".length),
            resourcesDir: join(root, latest, "resources")
        };
    } catch {
        return null;
    }
}

function getInstalledTargets() {
    if (process.platform !== "win32") return [];

    return DISCORD_TARGETS
        .map(target => {
            const install = findLatestResources(target.directory);
            return install && { ...target, ...install, patchStatus: getPatchStatus(install.resourcesDir) };
        })
        .filter(Boolean);
}

function getPatchStatus(resourcesDir) {
    const appDir = join(resourcesDir, "app");
    const appAsar = join(resourcesDir, "app.asar");
    const backupAsar = join(resourcesDir, "_app.asar");

    if (isMoggcordDevInjection(resourcesDir)) {
        return { label: "patched: Moggcord dev", color: ANSI.green, patched: true };
    }

    if (isModInjection(resourcesDir)) {
        return { label: "patched: mod loader", color: ANSI.green, patched: true };
    }

    if (existsSync(appDir)) {
        return { label: "patched: unknown app folder", color: ANSI.yellow, patched: true };
    }

    if (existsSync(backupAsar)) {
        const validBackup = isValidAsarFile(backupAsar);
        return {
            label: validBackup ? "patched before: backup present" : "warning: broken backup",
            color: validBackup ? ANSI.yellow : ANSI.red,
            patched: true
        };
    }

    if (isValidAsarFile(appAsar)) {
        return { label: "clean", color: ANSI.dim, patched: false };
    }

    return { label: "warning: app.asar missing or corrupt", color: ANSI.red, patched: false };
}

function getTargetFromBranch(targets, branch) {
    const normalized = normalizeBranch(branch);
    return targets.find(target => target.branch === normalized) ?? null;
}

function getTargetFromLocation(targets, location) {
    if (!location) return null;

    const normalized = location.toLowerCase();
    return [...targets]
        .sort((a, b) => b.directory.length - a.directory.length)
        .find(target => normalized.includes(target.directory.toLowerCase())) ?? null;
}

function renderTargetMenu(targets, selectedIndex, renderedLines) {
    if (renderedLines > 0) process.stdout.write(`\x1b[${renderedLines}F`);

    const lines = [
        `${colorText("[Moggcord]", ANSI.cyan)} Select Discord target`,
        colorText("Use arrow keys and Enter.", ANSI.dim),
        ...targets.map((target, index) => {
            const selected = index === selectedIndex;
            const marker = selected ? colorText(">", ANSI.cyan) : " ";
            const label = selected ? `${ANSI.bold}${formatTargetLabel(target)}` : formatTargetLabel(target);
            const reset = selected ? ANSI.reset : "";
            const details = colorText(`${target.version}  ${target.resourcesDir}`, ANSI.dim);

            return `${marker} ${label}${reset} ${formatPatchStatus(target)} ${details}`;
        })
    ];

    process.stdout.write(`${lines.map(line => `\x1b[2K${line}`).join("\n")}\n`);
    return lines.length;
}

function selectTargetFromMenu(targets) {
    return new Promise(resolve => {
        let selectedIndex = 0;
        let renderedLines = 0;
        const { stdin, stdout } = process;
        const wasRaw = stdin.isRaw;

        const showCursor = () => stdout.write("\x1b[?25h");
        const hideCursor = () => stdout.write("\x1b[?25l");
        const finish = target => {
            stdin.off("keypress", onKeypress);
            if (stdin.setRawMode) stdin.setRawMode(wasRaw);
            stdin.pause();
            showCursor();
            stdout.write("\n");
            resolve(target);
        };
        const onKeypress = (_, key) => {
            if (key?.ctrl && key.name === "c") {
                finish(null);
                process.exit(130);
            }

            if (key?.name === "up" || key?.name === "k") {
                selectedIndex = (selectedIndex - 1 + targets.length) % targets.length;
                renderedLines = renderTargetMenu(targets, selectedIndex, renderedLines);
                return;
            }

            if (key?.name === "down" || key?.name === "j") {
                selectedIndex = (selectedIndex + 1) % targets.length;
                renderedLines = renderTargetMenu(targets, selectedIndex, renderedLines);
                return;
            }

            if (key?.name === "return" || key?.name === "enter" || key?.name === "space") {
                finish(targets[selectedIndex]);
            }
        };

        hideCursor();
        emitKeypressEvents(stdin);
        stdin.on("keypress", onKeypress);
        if (stdin.setRawMode) stdin.setRawMode(true);
        stdin.resume();
        renderedLines = renderTargetMenu(targets, selectedIndex, renderedLines);
    });
}

async function selectTarget(args, shouldSelect) {
    if (!shouldSelect || process.platform !== "win32") return null;

    const targets = getInstalledTargets();
    if (targets.length === 0) return null;

    printPatchSummary(targets);

    const location = getArgValue(args, ["-location", "--location"]);
    if (location) return getTargetFromLocation(targets, location);

    const branch = getArgValue(args, ["-branch", "--branch"]);
    if (branch && normalizeBranch(branch) !== "auto") return getTargetFromBranch(targets, branch);

    if (!process.stdin.isTTY || !process.stdout.isTTY) return null;

    const selected = await selectTargetFromMenu(targets);
    if (!selected) return null;

    pushArgValue(args, "-branch", selected.branch);
    console.log(`[Moggcord] Selected ${formatTargetLabel(selected)} ${formatPatchStatus(selected)}.`);

    return selected;
}

function stopDiscord(target) {
    if (process.platform !== "win32") return;
    const processes = target
        ? [target.process, "DiscordSystemHelper.exe"]
        : [...DISCORD_TARGETS.map(t => t.process), "DiscordSystemHelper.exe"];

    for (const img of processes) {
        try {
            execSync(`taskkill /F /IM ${img} /T`, { stdio: "ignore" });
        } catch { }
    }
    try { execSync("timeout /t 2 /nobreak >nul", { stdio: "ignore", shell: true }); } catch { }
}

function startDiscord(target) {
    if (process.platform !== "win32") return false;

    const discordRoot = target?.root ?? join(process.env.LOCALAPPDATA || "", "Discord");
    const updateExe = join(discordRoot, "Update.exe");
    const processName = target?.process ?? "Discord.exe";

    if (existsSync(updateExe)) {
        try {
            execFileSync(updateExe, ["--processStart", processName], {
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
            const discordExe = join(discordRoot, ver, processName);
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

function cleanOldMoggcord(target) {
    console.log("[Moggcord] Preparing Discord for safe re-inject...");
    const candidates = target?.resourcesDir ? [target.resourcesDir] : findAllDiscordResources();

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

function getActionLabel() {
    if (isInstall) return "injection";
    if (isUninstall) return "uninstall";
    if (isRepair) return "repair";
    return "installer";
}

const argStart = process.argv.indexOf("--");
const args = (argStart === -1 ? process.argv.slice(2) : process.argv.slice(argStart + 1)).filter(arg => arg !== "--");

const isUninstall = args.includes("--uninstall");
const isInstall = args.includes("--install");
const isRepair = args.includes("--repair");
const isInfoOnly = args.includes("-help") || args.includes("--help") || args.includes("-version") || args.includes("--version");

if (!isUninstall && !isInfoOnly) {
    checkBuild();
}

const selectedTarget = await selectTarget(args, !isInfoOnly && (isInstall || isUninstall || isRepair));

if (!isInfoOnly && isRepair) {
    cleanOldMoggcord(selectedTarget);
}

const installerBin = await ensureBinary();

if (isInstall) {
    console.log("[Moggcord] Closing Discord before injection...");
    stopDiscord(selectedTarget);

    cleanOldMoggcord(selectedTarget);

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

const actionLabel = getActionLabel();
console.log(`[Moggcord] Starting ${actionLabel}...`);

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
    console.error(`[Moggcord] ${actionLabel[0].toUpperCase() + actionLabel.slice(1)} failed.`);
    process.exit(1);
}

if (isInstall) {
    for (const resourcesDir of findAllDiscordResources()) {
        warnIfCorruptAppAsar(resourcesDir);
    }

    if (selectedTarget?.resourcesDir) {
        const nextStatus = { ...selectedTarget, patchStatus: getPatchStatus(selectedTarget.resourcesDir) };
        console.log(`[Moggcord] Patch result: ${formatTargetLabel(nextStatus)} ${formatPatchStatus(nextStatus)}.`);
    }

    markPostInstallRelaunch();
    console.log(`[Moggcord] Restarting ${selectedTarget?.label ?? "Discord"}...`);
    console.log("\x1b[33m[Moggcord] Discord will restart once more automatically so the UI works correctly.\x1b[0m");
    if (startDiscord(selectedTarget)) {
        console.log("\x1b[32m[Moggcord] Discord started — finishing setup on first launch.\x1b[0m");
    } else {
        console.log("\x1b[33m[Moggcord] Could not auto-start Discord — open it manually once.\x1b[0m");
    }
}

console.log(`[Moggcord] ${actionLabel[0].toUpperCase() + actionLabel.slice(1)} complete. Exiting.`);
process.stdin.pause();
