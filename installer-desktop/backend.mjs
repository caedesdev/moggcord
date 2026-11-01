/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { access, mkdir, readFile, writeFile, cp, rm } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { desktopPaths } from "../scripts/lib/desktop-paths.mjs";
import { discoverDesktops, resolveDesktop, startDesktop, stopDesktop } from "../scripts/lib/discord-desktop.mjs";
import { buildFiles, verifyBuild } from "../scripts/lib/build-info.mjs";

const execute = promisify(execFile);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;

export function createDesktopInstaller({ platform = process.platform, resources, version, paths = desktopPaths(platform), dependencies = {} }) {
    const resolveClient = dependencies.resolve ?? (input => resolveDesktop(input, platform));
    let state = { state: "idle" };
    const status = (label, percent) => { state = { state: "running", label, percent }; };
    const runInstaller = async (action, target) => {
        const binary = join(resources, "equilotl");
        const variables = {
            EQUICORD_USER_DATA_DIR: paths.dataDir,
            EQUICORD_DIRECTORY: join(paths.distDir, "patcher.js"),
            EQUICORD_DEV_INSTALL: "1"
        };
        const args = [action === "uninstall" ? "-uninstall" : "-install", "-location", target.path];
        let writable = true;
        try { await access(target.resources, constants.W_OK); } catch { writable = false; }
        if (writable) return execute(binary, args, { env: { ...process.env, ...variables }, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
        status("Waiting for permission to update this Discord installation…", 65);
        const environment = Object.entries({ ...variables, SUDO_USER: userInfo().username, SUDO_UID: String(process.getuid()), SUDO_GID: String(process.getgid()) }).map(([key, value]) => `${key}=${value}`);
        if (platform === "linux") return execute("pkexec", ["/usr/bin/env", ...environment, binary, ...args], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
        const command = ["/usr/bin/env", ...environment, binary, ...args].map(quote).join(" ");
        const appleScript = `do shell script "${command.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" with administrator privileges`;
        return execute("/usr/bin/osascript", ["-e", appleScript], { timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    };
    async function operate(action, input, replaceOtherMod) {
        const target = await resolveClient(input);
        if (action === "install" && target.installed) return "alreadyInstalled";
        if (action !== "install" && !target.installed) throw new Error("Moggcord is not installed here. Choose Install first.");
        if (target.otherMod && !replaceOtherMod) throw new Error("Confirm replacing the other client mod, or choose another Discord.");
        const bundled = join(resources, "desktop");
        if (action !== "uninstall") verifyBuild(bundled, version);
        const backup = paths.distDir + ".installer-backup";
        if (existsSync(backup)) throw new Error("An earlier setup backup needs attention. Close other installers and restore or rename the .installer-backup folder before retrying.");
        let copied = false, stopped = false;
        try {
            status("Closing the selected Discord…", 25);
            await (dependencies.stop ?? stopDesktop)(target); stopped = true;
            if (action !== "uninstall") {
                status("Saving the verified Moggcord build…", 45);
                await mkdir(dirname(paths.distDir), { recursive: true });
                if (existsSync(paths.distDir)) await cp(paths.distDir, backup, { recursive: true });
                copied = true;
                await mkdir(paths.distDir, { recursive: true });
                let current = false;
                try { verifyBuild(paths.distDir, version); current = true; } catch { current = false; }
                if (!current) for (const file of [...buildFiles, "build-info.json"]) await cp(join(bundled, file), join(paths.distDir, file));
                verifyBuild(paths.distDir, version);
            }
            status(action === "uninstall" ? "Restoring the original Discord…" : "Installing into your selected Discord…", 65);
            await (dependencies.install ?? runInstaller)(action, target);
            const checked = await resolveClient(target.path);
            if (checked.installed !== (action !== "uninstall")) throw new Error("Discord did not retain the expected installation. Reopen the installer and choose Repair.");
            if (action !== "uninstall") {
                await mkdir(join(paths.dataDir, "settings"), { recursive: true });
                const settings = join(paths.dataDir, "settings", "settings.json");
                if (!existsSync(settings)) await cp(join(resources, "default-settings.json"), settings);
            }
            let registrations = {};
            const registry = join(paths.dataDir, "installations.json");
            if (existsSync(registry)) { try { registrations = JSON.parse(await readFile(registry, "utf8")); } catch { registrations = {}; } }
            if (action === "uninstall") delete registrations[target.channel]; else registrations[target.channel] = target.path;
            await writeFile(registry, JSON.stringify(registrations, null, 2));
            status("Starting your selected Discord…", 95);
            await (dependencies.start ?? startDesktop)(target);
            return "complete";
        } catch (error) {
            if (copied && existsSync(backup)) {
                for (const file of [...buildFiles, "build-info.json"]) if (existsSync(join(backup, file))) await cp(join(backup, file), join(paths.distDir, file));
            }
            if (stopped) await (dependencies.start ?? startDesktop)(target).catch(() => {});
            if (error.code === "ENOENT" && platform === "linux") throw new Error("The system permission tool is unavailable. Install polkit, or use a writable Discord tar.gz installation in your home folder.");
            throw new Error(error.stderr?.trim().split("\n").at(-1) || error.message || "Setup could not finish. Your saved settings were kept.");
        } finally {
            if (resolve(backup) === resolve(paths.distDir + ".installer-backup")) await rm(backup, { recursive: true, force: true });
        }
    }
    return {
        detect: () => discoverDesktops(platform),
        resolve: resolveClient,
        getStatus: () => state,
        start(action, input, replaceOtherMod = false) {
            if (!["install", "repair", "uninstall"].includes(action)) return { started: false, error: "Choose Install, Repair or Uninstall." };
            if (state.state === "running") return { started: false, error: "Another operation is still running." };
            status("Preparing…", 5);
            Promise.resolve().then(() => operate(action, input, replaceOtherMod)).then(result => { state = { state: "done", result }; })
                .catch(error => { state = { state: "error", error: error.message }; });
            return { started: true };
        }
    };
}
