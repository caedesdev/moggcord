/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { execFile, spawn } from "child_process";
import { createHash, randomBytes, randomUUID } from "crypto";
import { app } from "electron";
import { unzipSync } from "fflate";
import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { request } from "http";
import { existsSync } from "original-fs";
import { basename, dirname, join, resolve } from "path";
import { promisify } from "util";

import { fileHash } from "../../scripts/lib/build-info.mjs";
import { DATA_DIR } from "./utils/constants";
import { checkedFetch } from "./utils/http";

declare const VERSION: string;

const logger = new Logger("CommunityDownloads");
const execute = promisify(execFile);
const origin = "https://moggcord.cc";
const nodeVersion = "24.19.0";
const nodeHashes: Record<string, string> = {
    "win32-x64": "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
    "win32-arm64": "8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f",
    "darwin-x64": "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316",
    "darwin-arm64": "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
    "linux-x64": "f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4",
    "linux-arm64": "d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f"
};

interface ServiceConfig {
    origin: string;
    channel: string;
    version: string;
    controlToken: string;
    nodePath: string;
    serviceFile: string;
    sourceRoot: string;
    previousSourceRoot?: string;
    dataDir: string;
    mirrorDir: string;
    pidFile: string;
}

export function nativeControl<T = Record<string, unknown>>(controlToken: string, action: string, link?: string): Promise<T> {
    return new Promise((done, reject) => {
        const body = JSON.stringify({ action, ...(link ? { link } : {}) });
        const req = request({ host: "127.0.0.1", port: 6469, path: "/v1/service-control", method: "POST",
            headers: { Authorization: `Bearer ${controlToken}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, res => {
            let data = "";
            res.on("data", chunk => { data += chunk; if (data.length > 16384) req.destroy(new Error("The community service response is too large.")); });
            res.on("end", () => {
                try {
                    const result = JSON.parse(data);
                    if (!res.statusCode || res.statusCode >= 400) throw new Error(result.error ?? "The community service is unavailable.");
                    done(result);
                } catch (error) { reject(error); }
            });
        });
        req.setTimeout(2000, () => req.destroy(new Error("The community service did not respond.")));
        req.on("error", reject);
        req.end(body);
    });
}

export async function extractCommunityRuntime(bytes: Uint8Array, destination: string, platform: NodeJS.Platform, arch: string, expectedHash: string) {
    if (createHash("sha256").update(bytes).digest("hex") !== expectedHash) throw new Error("The downloaded Node runtime does not match its official fingerprint.");
    const packageName = `node-v${nodeVersion}-${platform === "win32" ? "win" : platform}-${arch}`;
    await mkdir(destination, { recursive: true, mode: 0o700 });
    if (platform === "win32") {
        const filename = `${packageName}/node.exe`;
        const license = `${packageName}/LICENSE`;
        const files = unzipSync(bytes, { filter: file => file.name === filename || file.name === license });
        if (!files[filename]?.length) throw new Error("The Node runtime archive contains no executable.");
        if (!files[license]?.length) throw new Error("The Node runtime archive contains no license.");
        await writeFile(join(destination, "node.exe"), files[filename], { mode: 0o700 });
        await writeFile(join(destination, "LICENSE"), files[license], { mode: 0o600 });
    } else {
        const archive = join(destination, "runtime.tar.gz");
        await writeFile(archive, bytes, { mode: 0o600 });
        await execute("/usr/bin/tar", ["-xzf", archive, "-C", destination, "--strip-components=1", `${packageName}/bin/node`, `${packageName}/LICENSE`], { timeout: 60_000 });
        await rm(archive);
        await chmod(join(destination, "bin", "node"), 0o700);
    }
}

async function provisionRuntime(directory: string) {
    const expected = nodeHashes[`${process.platform}-${process.arch}`];
    if (!expected) throw new Error("Community downloads are not available for this operating system and architecture.");
    const name = `node-v${nodeVersion}-${process.platform === "win32" ? "win" : process.platform}-${process.arch}`;
    const runtime = join(directory, "runtime", name);
    const executable = join(runtime, process.platform === "win32" ? "node.exe" : "bin/node");
    if (existsSync(executable)) return executable;
    const response = await checkedFetch(`https://nodejs.org/dist/v${nodeVersion}/${name}.${process.platform === "win32" ? "zip" : "tar.gz"}`, { signal: AbortSignal.timeout(180_000), redirect: "error" });
    if (!response.body) throw new Error("The Node runtime download was empty.");
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > 128 * 1024 * 1024) throw new Error("The Node runtime download is too large.");
        chunks.push(chunk);
    }
    const temporary = join(directory, `runtime-${randomUUID()}`);
    try {
        await extractCommunityRuntime(Buffer.concat(chunks), temporary, process.platform, process.arch, expected);
        await mkdir(dirname(runtime), { recursive: true, mode: 0o700 });
        await rename(temporary, runtime);
    } finally {
        if (dirname(resolve(temporary)) !== resolve(directory)) throw new Error("Invalid runtime staging directory.");
        await rm(temporary, { recursive: true, force: true });
    }
    return executable;
}

async function readConfig(file: string): Promise<ServiceConfig | null> {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
        return null;
    }
}

async function migrateLegacy(): Promise<string | undefined> {
    const file = process.platform === "win32" ? join(process.env.APPDATA ?? "", "MoggcordCommunity", "config.json") : join(DATA_DIR, "community", "config.json");
    const previous = await readConfig(file);
    if (!previous || previous.origin !== origin || !previous.sourceRoot) return;
    const bridge = join(previous.sourceRoot, "scripts", "community", "bridge.mjs");
    if (!existsSync(bridge)) return;
    const pkg = JSON.parse(await readFile(join(previous.sourceRoot, "package.json"), "utf8"));
    if (pkg.name !== "moggcord") return;
    if (process.platform !== "win32") {
        const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const bridgeArgument = new RegExp(`(?:^|\\s)(?:"${escape(bridge)}"|'${escape(bridge)}'|${escape(bridge)})(?=\\s|$)`);
        const configArgument = new RegExp(`(?:^|\\s)--config\\s+(?:"${escape(file)}"|'${escape(file)}'|${escape(file)})(?=\\s|$)`);
        const { stdout } = await execute("/bin/ps", ["-axo", "uid=,pid=,args="], { timeout: 5000 });
        for (const line of stdout.split("\n")) {
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
            if (!match || Number(match[1]) !== process.getuid?.() || !bridgeArgument.test(match[3]) || !configArgument.test(match[3])) continue;
            const pid = Number(match[2]);
            const executable = (await execute("/bin/ps", ["-p", String(pid), "-o", "comm="], { timeout: 5000 })).stdout.trim();
            if (basename(executable) !== "node") continue;
            try { process.kill(pid, "SIGTERM"); }
            catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        }
        const startup = process.platform === "linux"
            ? join(process.env.XDG_CONFIG_HOME ?? join(app.getPath("home"), ".config"), "autostart", "moggcord-community.desktop")
            : join(app.getPath("home"), "Library", "LaunchAgents", "dev.moggcord.community.plist");
        if (existsSync(startup)) {
            const content = await readFile(startup, "utf8");
            if (content.includes(bridge) && content.includes(file)) {
                if (process.platform === "darwin") await execute("/bin/launchctl", ["bootout", `gui/${process.getuid?.()}`, startup], { timeout: 10_000 }).catch(error => logger.debug("Legacy login agent was not loaded", error));
                await rm(startup);
            }
        }
        return previous.sourceRoot;
    }
    const script = "$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $bridge=[regex]::Escape($env:MOGGCORD_OLD_BRIDGE.Replace('\\','/')); $config=[regex]::Escape($env:MOGGCORD_OLD_CONFIG.Replace('\\','/')); foreach($item in @(Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\")){ if(!$item.CommandLine){continue}; $line=$item.CommandLine.Replace('\\','/'); if($line -notmatch ('(?:^|\\s)(?:\"'+$bridge+'\"|'+$bridge+')(?=\\s|$)') -or $line -notmatch ('(?:^|\\s)--config\\s+(?:\"'+$config+'\"|'+$config+')(?=\\s|$)')){continue}; $owner=Invoke-CimMethod -InputObject $item -MethodName GetOwnerSid; if($owner.Sid -eq $sid){Stop-Process -Id $item.ProcessId -Force -ErrorAction Stop} }; $key='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; $value=(Get-ItemProperty -LiteralPath $key -Name MoggcordCommunity -ErrorAction SilentlyContinue).MoggcordCommunity; $runner=[regex]::Escape((Join-Path (Split-Path $env:MOGGCORD_OLD_CONFIG) 'start.ps1').Replace('\\','/')); if($value -and $value.Replace('\\','/') -match ('(?:^|\\s)(?:\"'+$runner+'\"|'+$runner+')(?=\\s|$)')){Remove-ItemProperty -LiteralPath $key -Name MoggcordCommunity -ErrorAction Stop}";
    await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 15_000, env: { ...process.env, MOGGCORD_OLD_BRIDGE: bridge, MOGGCORD_OLD_CONFIG: file } });
    return previous.sourceRoot;
}

export async function registerWorkerProtocol(config: ServiceConfig, configFile: string, run = execute) {
    if (process.platform === "win32") {
        const key = "HKCU\\Software\\Classes\\moggcord";
        const runner = join(dirname(configFile), "open-link.ps1");
        const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
        await writeFile(runner, `param([string]$Link)\n$arguments = @(${quote(`"${config.serviceFile}"`)}, '--config', ${quote(`"${configFile}"`)}, '--link', ('"' + $Link.Replace('"', '') + '"'))\nStart-Process -FilePath ${quote(config.nodePath)} -ArgumentList $arguments -WindowStyle Hidden\n`, { mode: 0o600 });
        const powershell = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        const command = `"${powershell}" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${runner}" "%1"`;
        for (const [entry, name, value] of [[key, "", "URL:Moggcord community installation"], [key, "URL Protocol", ""], [`${key}\\shell\\open\\command`, "", command]])
            await run("reg.exe", ["add", entry, ...(name ? ["/v", name] : ["/ve"]), "/t", "REG_SZ", "/d", value, "/f"], { windowsHide: true });
    } else if (process.platform === "linux") {
        const directory = join(process.env.XDG_DATA_HOME ?? join(app.getPath("home"), ".local", "share"), "applications");
        const quote = (value: string) => '"' + value.replaceAll("%", "%%").replace(/[\\`"$]/g, "\\$&") + '"';
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, "moggcord-community.desktop"), `[Desktop Entry]\nType=Application\nName=Moggcord Community\nNoDisplay=true\nTerminal=false\nExec=${[config.nodePath, config.serviceFile, "--config", configFile].map(quote).join(" ")} --link %u\nMimeType=x-scheme-handler/moggcord;\n`, { mode: 0o600 });
        await run("xdg-mime", ["default", "moggcord-community.desktop", "x-scheme-handler/moggcord"], { timeout: 10_000 });
    } else if (process.platform === "darwin") {
        const directory = dirname(configFile), script = join(directory, "open-link.applescript"), application = join(directory, "Moggcord Community.app");
        const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
        const command = [config.nodePath, config.serviceFile, "--config", configFile].map(quote).join(" ");
        await writeFile(script, `on open location installURL\n do shell script (${JSON.stringify(command + " --link ")} & quoted form of installURL & " >/dev/null 2>&1 &")\nend open location\n`);
        await run("/usr/bin/osacompile", ["-o", application, script], { timeout: 30_000 });
        await writeFile(join(application, "Contents", "Info.plist"), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>applet</string><key>CFBundleIdentifier</key><string>dev.moggcord.community</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLSchemes</key><array><string>moggcord</string></array></dict></array></dict></plist>');
        await run("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister", ["-f", application], { timeout: 15_000 });
    }
}

let starting: Promise<ServiceConfig> | undefined;

async function ensureService(patcherDirectory: string): Promise<ServiceConfig> {
    const directory = join(DATA_DIR, "community"), configFile = join(directory, "service.json"), lockFile = join(directory, "startup.lock");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const previous = await readConfig(configFile);
    if (previous?.controlToken) {
        try {
            const status = await nativeControl<{ version: string; busy: boolean; }>(previous.controlToken, "status");
            const changedBuild = status.version === VERSION && existsSync(previous.serviceFile)
                && existsSync(join(patcherDirectory, "community-service.cjs"))
                && fileHash(previous.serviceFile) !== fileHash(join(patcherDirectory, "community-service.cjs"));
            if (/^\d+\.\d+\.\d+$/.test(status.version) && status.version.localeCompare(VERSION, "en", { numeric: true }) >= 0 && !changedBuild) {
                await registerWorkerProtocol(previous, configFile);
                return previous;
            }
            if (status.busy) throw new Error("Community installation is still running. Restart Moggcord after it finishes to update its service.");
            await nativeControl(previous.controlToken, "shutdown");
            await new Promise(done => setTimeout(done, 300));
        } catch (error) {
            if ((error as Error).message.includes("still running")) throw error;
            logger.debug("Starting the current community service", error);
        }
    }
    let lock;
    try { lock = await open(lockFile, "wx", 0o600); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const pid = Number(await readFile(lockFile, "utf8").catch(() => "0"));
        let alive = true;
        try { if (pid > 0) process.kill(pid, 0); else alive = Date.now() - (await stat(lockFile)).mtimeMs < 600_000; }
        catch (failure) { if ((failure as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
        if (alive) throw new Error("Another Moggcord instance is preparing community downloads.");
        await rm(lockFile);
        lock = await open(lockFile, "wx", 0o600);
    }
    await lock.writeFile(String(process.pid));
    try {
        const nodePath = await provisionRuntime(directory);
        const legacySourceRoot = await migrateLegacy();
        let previousSourceRoot = previous?.previousSourceRoot ?? legacySourceRoot;
        if (previous?.sourceRoot) {
            try {
                const pkg = JSON.parse(await readFile(join(previous.sourceRoot, "package.json"), "utf8"));
                if (pkg.name === "moggcord" && pkg.version === previous.version) previousSourceRoot = previous.sourceRoot;
            } catch (error) {
                if (!["ENOENT", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "") && !(error instanceof SyntaxError)) throw error;
            }
        }
        const serviceDirectory = join(directory, "services", VERSION);
        await mkdir(serviceDirectory, { recursive: true, mode: 0o700 });
        const config: ServiceConfig = { origin, channel: "auto", version: VERSION, controlToken: randomBytes(32).toString("hex"), nodePath,
            serviceFile: join(serviceDirectory, "community-service.cjs"), sourceRoot: join(directory, "compiler", VERSION), previousSourceRoot,
            dataDir: DATA_DIR, mirrorDir: patcherDirectory, pidFile: join(directory, "service.pid") };
        await copyFile(join(patcherDirectory, "community-service.cjs"), config.serviceFile);
        let ready = false;
        try {
            await writeFile(configFile, JSON.stringify(config, null, 2), { mode: 0o600 });
            const child = spawn(nodePath, [config.serviceFile, "--config", configFile], { detached: true, stdio: "ignore", windowsHide: true });
            await new Promise<void>((done, reject) => { child.once("spawn", done); child.once("error", reject); });
            child.unref();
            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    const status = await nativeControl<{ version: string; }>(config.controlToken, "status");
                    if (status.version === VERSION) {
                        ready = true;
                        await registerWorkerProtocol(config, configFile);
                        return config;
                    }
                } catch (error) { if (attempt === 29 || ready) throw error; }
                await new Promise(done => setTimeout(done, 500));
            }
            throw new Error("The community service could not start.");
        } catch (error) {
            if (!ready) {
                if (previous) await writeFile(configFile, JSON.stringify(previous, null, 2), { mode: 0o600 });
                else await rm(configFile, { force: true });
            }
            throw error;
        }
    } finally { await lock.close(); await rm(lockFile, { force: true }); }
}

export function startCommunityDownloads(patcherDirectory: string) {
    const start = () => starting ??= app.whenReady().then(() => ensureService(patcherDirectory)).finally(() => { starting = undefined; });
    const openLink = (link: string) => {
        if (!link.startsWith("moggcord://install")) return;
        void start().then(config => nativeControl(config.controlToken, "link", link)).catch(error => logger.error("Could not open the community installation", error));
    };
    app.on("open-url", (event, link) => { if (link.startsWith("moggcord://install")) { event.preventDefault(); openLink(link); } });
    app.on("second-instance", (_event, args) => args.forEach(openLink));
    void app.whenReady().then(async () => {
        await start();
        process.argv.forEach(openLink);
    }).catch(error => logger.error("Could not connect community downloads", error));
}
