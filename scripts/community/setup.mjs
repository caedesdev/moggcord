/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { channelNames, findClient, repairClient, trustedOrigin } from "./core.mjs";
import { desktopPaths } from "../lib/desktop-paths.mjs";

const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const channel = option("--channel");
if (!channelNames[channel]) throw new Error("Choose a Discord channel, for example --channel canary.");
if (!option("--site")) throw new Error("Add --site with the address of the website you want to connect.");
const origin = trustedOrigin(option("--site"));
await findClient(channel);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (!existsSync(join(sourceRoot, "node_modules", "typescript"))) throw new Error("Run pnpm install --frozen-lockfile first.");
const paths = desktopPaths();
const directory = process.platform === "win32" ? join(process.env.APPDATA, "MoggcordCommunity") : paths.communityDir;
mkdirSync(directory, { recursive: true });
const config = { origin, channel, sourceRoot, dataDir: option("--data-dir") ? resolve(option("--data-dir")) : paths.dataDir, mirrorDir: paths.distDir };
process.stdout.write(`Building the current source and updating Moggcord in ${channelNames[channel]}…\n`);
await repairClient(config);
const configFile = join(directory, "config.json");
writeFileSync(configFile, JSON.stringify(config, null, 2));
const quote = value => `'${value.replaceAll("'", "''")}'`;
const bridge = join(sourceRoot, "scripts", "community", "bridge.mjs");
if (process.platform === "win32") {
const runner = join(directory, "start.ps1");
writeFileSync(runner, `param([string]$Link)\n$arguments = @(${quote(`"${bridge}"`)}, '--config', ${quote(`"${configFile}"`)})\nif ($Link) { $arguments += @('--link', ('"' + $Link.Replace('"', '') + '"')) }\nStart-Process -FilePath ${quote(process.execPath)} -ArgumentList $arguments -WindowStyle Hidden\n`);
const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${runner}"`;
const registry = (key, name, data) => execFileSync("reg.exe", ["add", key, ...(name ? ["/v", name] : ["/ve"]), "/t", "REG_SZ", "/d", data, "/f"], { windowsHide: true, stdio: "ignore" });
const scheme = "HKCU\\Software\\Classes\\moggcord";
registry(scheme, "", "URL:Moggcord community installer");
registry(scheme, "URL Protocol", "");
registry(`${scheme}\\shell\\open\\command`, "", `${command} "%1"`);
registry("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "MoggcordCommunity", command);
} else if (process.platform === "linux") {
    const desktopQuote = value => '"' + value.replaceAll("%", "%%").replace(/[\\`"$]/g, "\\$&") + '"';
    const command = [process.execPath, bridge, "--config", configFile].map(desktopQuote).join(" ");
    const applications = join(process.env.XDG_DATA_HOME || join(process.env.HOME, ".local", "share"), "applications");
    const autostart = join(process.env.XDG_CONFIG_HOME || join(process.env.HOME, ".config"), "autostart");
    mkdirSync(applications, { recursive: true }); mkdirSync(autostart, { recursive: true });
    const entry = `[Desktop Entry]\nType=Application\nName=Moggcord Community\nNoDisplay=true\nTerminal=false\n`;
    writeFileSync(join(applications, "moggcord-community.desktop"), entry + `Exec=${command} --link %u\nMimeType=x-scheme-handler/moggcord;\n`);
    writeFileSync(join(autostart, "moggcord-community.desktop"), entry + `Exec=${command}\n`);
    execFileSync("xdg-mime", ["default", "moggcord-community.desktop", "x-scheme-handler/moggcord"], { stdio: "ignore" });
} else if (process.platform === "darwin") {
    const xml = value => value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
    const shellQuote = value => `'${value.replaceAll("'", "'\\''")}'`;
    const command = [process.execPath, bridge, "--config", configFile].map(shellQuote).join(" ");
    const appleString = value => '"' + value.replaceAll("\\", "\\\\").replaceAll('"', '\\"') + '"';
    const script = join(directory, "open-link.applescript");
    writeFileSync(script, `on open location installURL\n do shell script (${appleString(command + " --link ")} & quoted form of installURL & " >/dev/null 2>&1 &")\nend open location\non run\n do shell script ${appleString(command + " >/dev/null 2>&1 &")}\nend run\n`);
    const application = join(directory, "Moggcord Community.app");
    execFileSync("/usr/bin/osacompile", ["-o", application, script], { stdio: "pipe" });
    writeFileSync(join(application, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>applet</string><key>CFBundleIdentifier</key><string>dev.moggcord.community</string><key>CFBundleName</key><string>Moggcord Community</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1.0</string><key>LSUIElement</key><true/><key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>Moggcord community install link</string><key>CFBundleURLSchemes</key><array><string>moggcord</string></array></dict></array></dict></plist>`);
    execFileSync("/usr/bin/open", ["-gj", application], { stdio: "ignore" });
    const launchAgents = join(process.env.HOME, "Library", "LaunchAgents"); mkdirSync(launchAgents, { recursive: true });
    const plist = join(launchAgents, "dev.moggcord.community.plist");
    writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>dev.moggcord.community</string><key>ProgramArguments</key><array>${[process.execPath, bridge, "--config", configFile].map(value => `<string>${xml(value)}</string>`).join("")}</array><key>RunAtLoad</key><true/></dict></plist>`);
    try { execFileSync("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, plist], { stdio: "pipe" }); }
    catch (error) { process.stderr.write(`The login service could not be reloaded (${error.status}). The connection will still be started now.\n`); }
} else throw new Error("Community installation is supported on Windows, macOS and Linux.");
const child = spawn(process.execPath, [bridge, "--config", configFile], { detached: true, stdio: "ignore", windowsHide: true });
await new Promise((resolvePromise, reject) => { child.once("spawn", resolvePromise); child.once("error", reject); }); child.unref();
process.stdout.write(`Connected ${origin} to Moggcord in ${channelNames[channel]}.\nDownload buttons can now install uploads and restart this channel.\nConfiguration: ${configFile}\n`);
