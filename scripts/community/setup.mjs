/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { channelNames, findClient, repairClient, trustedOrigin } from "./core.mjs";

if (process.platform !== "win32") throw new Error("The community installer currently supports Moggcord on Windows.");
const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const channel = option("--channel");
if (!channelNames[channel]) throw new Error("Choose a Discord channel, for example --channel canary.");
if (!option("--site")) throw new Error("Add --site with the address of the website you want to connect.");
const origin = trustedOrigin(option("--site"));
await findClient(channel);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
if (!existsSync(join(sourceRoot, "node_modules", "typescript"))) throw new Error("Run pnpm install --frozen-lockfile first.");
const directory = join(process.env.APPDATA, "MoggcordCommunity");
mkdirSync(directory, { recursive: true });
const config = { origin, channel, sourceRoot, dataDir: option("--data-dir") ? resolve(option("--data-dir")) : join(process.env.APPDATA, "Moggcord"), mirrorDir: join(process.env.LOCALAPPDATA, "Moggcord", "dist", "desktop") };
process.stdout.write(`Building the current source and updating Moggcord in ${channelNames[channel]}…\n`);
await repairClient(config);
const configFile = join(directory, "config.json");
writeFileSync(configFile, JSON.stringify(config, null, 2));
const quote = value => `'${value.replaceAll("'", "''")}'`;
const runner = join(directory, "start.ps1");
const bridge = join(sourceRoot, "scripts", "community", "bridge.mjs");
writeFileSync(runner, `param([string]$Link)\n$arguments = @(${quote(`"${bridge}"`)}, '--config', ${quote(`"${configFile}"`)})\nif ($Link) { $arguments += @('--link', ('"' + $Link.Replace('"', '') + '"')) }\nStart-Process -FilePath ${quote(process.execPath)} -ArgumentList $arguments -WindowStyle Hidden\n`);
const command = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${runner}"`;
const registry = (key, name, data) => execFileSync("reg.exe", ["add", key, ...(name ? ["/v", name] : ["/ve"]), "/t", "REG_SZ", "/d", data, "/f"], { windowsHide: true, stdio: "ignore" });
const scheme = "HKCU\\Software\\Classes\\moggcord";
registry(scheme, "", "URL:Moggcord community installer");
registry(scheme, "URL Protocol", "");
registry(`${scheme}\\shell\\open\\command`, "", `${command} "%1"`);
registry("HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "MoggcordCommunity", command);
const child = spawn(process.execPath, [bridge, "--config", configFile], { detached: true, stdio: "ignore", windowsHide: true });
await new Promise((resolvePromise, reject) => { child.once("spawn", resolvePromise); child.once("error", reject); }); child.unref();
process.stdout.write(`Connected ${origin} to Moggcord in ${channelNames[channel]}.\nDownload buttons can now install uploads and restart this channel.\nConfiguration: ${configFile}\n`);
