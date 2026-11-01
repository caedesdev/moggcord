/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { extractFile, uncache } from "@electron/asar";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { desktopPaths } from "./desktop-paths.mjs";

const run = promisify(execFile);
const channels = ["Discord", "Discord PTB", "Discord Canary", "Discord Development"];

export function loaderSource(resources) {
    for (const file of [join(resources, "app", "index.js"), join(resources, "app.asar")]) {
        if (!existsSync(file)) continue;
        try {
            if (file.endsWith(".asar")) { uncache(file); return extractFile(file, "index.js").toString("utf8"); }
            return readFileSync(file, "utf8");
        }
        catch { continue; }
    }
    return "";
}

export function installedPatcher(resources) {
    const source = loaderSource(resources);
    for (const match of source.matchAll(/"(?:[^"\\]|\\.)*patcher\.js"/g)) {
        try {
            const file = JSON.parse(match[0]);
            if (existsSync(file) && readFileSync(file, "utf8").startsWith("// Moggcord ")) return realpathSync(file);
            if (/[\\/]Moggcord[\\/]dist[\\/]desktop[\\/]patcher\.js$/i.test(file)) return resolve(file);
        } catch { continue; }
    }
    return null;
}

export function resolveDesktop(input, platform = process.platform) {
    if (!["darwin", "linux"].includes(platform)) throw new Error("Choose the Windows installer on Windows.");
    if (typeof input !== "string" || !input || /[\x00-\x1f\x7f]/.test(input)) throw new Error("Choose a valid Discord path.");
    let root = realpathSync(resolve(input));
    if (!statSync(root).isDirectory()) root = dirname(root);
    if (platform === "darwin") {
        while (!root.endsWith(".app") && dirname(root) !== root) root = dirname(root);
        if (!root.endsWith(".app")) throw new Error("Choose Discord.app, Discord PTB.app or Discord Canary.app.");
    } else {
        if (basename(root) === "resources") root = dirname(root);
        if (/(?:^|[\/])(?:snap|flatpak|\.var)(?:[\/]|$)/.test(root)) throw new Error("Use Discord's official DEB or tar.gz installation. Flatpak and Snap are not supported by this installer.");
    }
    const resources = join(root, platform === "darwin" ? "Contents/Resources" : "resources");
    const binaryDir = platform === "darwin" ? join(root, "Contents", "MacOS") : root;
    const executable = existsSync(binaryDir) && readdirSync(binaryDir).map(name => join(binaryDir, name))
        .find(file => /^discord(?:[ -]?(?:canary|ptb|development))?$/i.test(basename(file)) && statSync(file).isFile());
    if (!executable || !existsSync(join(resources, "app.asar"))) throw new Error("This folder does not contain a Discord desktop installation.");
    try {
        uncache(join(resources, "app.asar"));
        const pkg = JSON.parse(extractFile(join(resources, "app.asar"), "package.json").toString("utf8"));
        if (!/^(?:discord(?:[- ]?(?:canary|ptb|development))?|vencord|equicord|moggcord|betterdiscord|openasar)$/i.test(pkg.name)) throw new Error("Not Discord");
    }
    catch { throw new Error("Discord's app.asar could not be read. Repair Discord before installing Moggcord."); }
    const channel = /canary/i.test(root) ? "canary" : /ptb/i.test(root) ? "ptb" : /development/i.test(root) ? "development" : "stable";
    const name = channels[{ stable: 0, ptb: 1, canary: 2, development: 3 }[channel]];
    const patcher = installedPatcher(resources);
    const otherMod = !patcher && (existsSync(join(resources, "_app.asar")) || /vencord|equicord|betterdiscord|openasar/i.test(loaderSource(resources)));
    return { name, path: root, base: root, resources, executable, channel, platform, installed: Boolean(patcher), otherMod, installDir: patcher ? dirname(patcher) : null };
}

export function discoverDesktops(platform = process.platform, home = homedir(), env = process.env) {
    const roots = platform === "darwin" ? ["/Applications", join(home, "Applications")].flatMap(base => channels.map(name => join(base, name + ".app")))
        : ["/usr/share/discord", "/usr/share/discord-canary", "/usr/share/discord-ptb", "/opt/discord", "/opt/discord-canary", "/opt/Discord", "/usr/lib/discord", join(home, "Discord"), join(home, ".local/share/discord")];
    const registry = join(desktopPaths(platform, env, home).dataDir, "installations.json");
    if (existsSync(registry)) {
        try { roots.push(...Object.values(JSON.parse(readFileSync(registry, "utf8"))).filter(value => typeof value === "string")); }
        catch (error) { process.emitWarning(`Saved Discord paths could not be read: ${error.message}`); }
    }
    const found = new Map();
    for (const root of roots) {
        try { const client = resolveDesktop(root, platform); found.set(client.path, client); }
        catch { continue; }
    }
    return [...found.values()];
}

async function matchingProcesses(client) {
    const { stdout } = await run("/bin/ps", ["-axo", "pid=,uid=,comm="], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
    const matches = [];
    for (const line of stdout.split("\n")) {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (!match || Number(match[2]) !== process.getuid()) continue;
        const pid = Number(match[1]);
        if (pid === process.pid) continue;
        let command = match[3];
        if (client.platform === "linux") {
            try { command = realpathSync(`/proc/${pid}/exe`); } catch { continue; }
        }
        if (command.startsWith(client.base + sep) || command === client.executable) matches.push(pid);
    }
    return matches;
}

export async function stopDesktop(client) {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
        for (const pid of await matchingProcesses(client)) {
            try { process.kill(pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; }
        }
        for (let attempt = 0; attempt < 20; attempt++) {
            if (!(await matchingProcesses(client)).length) return;
            await new Promise(resolvePromise => setTimeout(resolvePromise, 150));
        }
    }
    throw new Error("Discord could not be closed. Close the selected Discord and try again.");
}

export async function startDesktop(client) {
    const child = client.platform === "darwin" ? spawn("/usr/bin/open", ["-a", client.base], { stdio: "ignore" })
        : spawn(client.executable, [], { detached: true, stdio: "ignore" });
    await new Promise((resolvePromise, reject) => { child.once("spawn", resolvePromise); child.once("error", reject); });
    child.unref();
}
