/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { build } from "esbuild";
import { createHash } from "node:crypto";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFiles, verifyBuild } from "../lib/build-info.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const platform = process.argv.includes("--platform") ? process.argv[process.argv.indexOf("--platform") + 1] : process.platform;
if (!["darwin", "linux"].includes(platform)) throw new Error("Choose --platform darwin or --platform linux.");
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const upstream = JSON.parse(await readFile(join(root, "installer-desktop", "upstream.json"), "utf8"));
const destination = join(root, ".codex-temp", "platform-installer", platform);
const resources = join(destination, "resources");
const desktop = join(resources, "desktop");
verifyBuild(join(root, "dist", "desktop"), pkg.version);
await mkdir(desktop, { recursive: true });
for (const file of [...buildFiles, "build-info.json"]) await copyFile(join(root, "dist", "desktop", file), join(desktop, file));
const response = await fetch(`https://github.com/${upstream.repository}/releases/download/${upstream.version}/${upstream[platform].asset}`);
if (!response.ok) throw new Error(`The upstream installer could not be downloaded (${response.status}).`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash("sha256").update(bytes).digest("hex") !== upstream[platform].sha256) throw new Error("The upstream installer fingerprint has changed. Packaging was stopped.");
await writeFile(join(resources, "equilotl"), bytes);
await chmod(join(resources, "equilotl"), 0o755);
await writeFile(join(resources, "metadata.json"), JSON.stringify({ version: pkg.version, platform, installerSha256: upstream[platform].sha256 }));
await copyFile(join(root, "installer-src", "default-settings.json"), join(resources, "default-settings.json"));
await writeFile(join(destination, "package.json"), JSON.stringify({ name: "moggcord-platform-installer", productName: "Moggcord Installer", version: pkg.version, description: "Install, repair and uninstall Moggcord in Discord Desktop.", main: "main.cjs", homepage: pkg.homepage, repository: pkg.repository, author: "Moggcord contributors", license: "GPL-3.0-or-later" }, null, 2));
await build({ entryPoints: [join(root, "installer-desktop", "main.cjs")], outfile: join(destination, "main.cjs"), bundle: true, platform: "node", format: "cjs", target: "node22", external: ["electron", "original-fs"] });
await copyFile(join(root, "installer-desktop", "preload.cjs"), join(destination, "preload.cjs"));
const ico = await readFile(join(root, "installer-src", "icon.ico"));
const frames = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
    const at = 6 + index * 16, offset = ico.readUInt32LE(at + 12), size = ico.readUInt32LE(at + 8);
    return { width: ico[at] || 256, bytes: ico.subarray(offset, offset + size) };
}).filter(frame => frame.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))).sort((a, b) => b.width - a.width);
if (!frames[0] || frames[0].width < 256) throw new Error("The existing installer icon has no suitable PNG frame.");
await writeFile(join(destination, "icon.png"), frames[0].bytes);
const icns = Buffer.alloc(16 + frames[0].bytes.length);
icns.write("icns", 0); icns.writeUInt32BE(icns.length, 4); icns.write("ic08", 8); icns.writeUInt32BE(icns.length - 8, 12); frames[0].bytes.copy(icns, 16);
await writeFile(join(destination, "icon.icns"), icns);
await copyFile(join(root, "LICENSE"), join(destination, "LICENSE"));
await copyFile(join(root, "installer-src", "fonts", "Inter.LICENSE.txt"), join(destination, "Inter.LICENSE.txt"));
await writeFile(join(destination, "THIRD-PARTY.txt"), `Includes Equilotl ${upstream.version}, GPL-3.0: https://github.com/${upstream.repository}/tree/${upstream.version}\nElectron: https://github.com/electron/electron\n`);
const font = (await readFile(join(root, "installer-src", "fonts", "InterVariable.woff2"))).toString("base64");
const icon = "data:image/png;base64," + (await readFile(join(root, "installer-src", "moggcord-pfp.png"))).toString("base64");
const title = platform === "darwin" ? "macOS · Intel & Apple Silicon" : "Linux x64";
let html = (await readFile(join(root, "installer-src", "index.html"), "utf8")).replaceAll("{{FONT_BASE64}}", font).replaceAll("{{ICON_BASE64}}", icon)
    .replace("Windows x64", title).replace("Choose a Discord folder, app folder, resources folder or Discord.exe.", platform === "darwin" ? "Choose Discord.app, Discord PTB.app or Discord Canary.app." : "Choose the Discord folder from its official DEB or tar.gz installation.")
    .replace('placeholder="C:\\…\\Discord"', `placeholder="${platform === "darwin" ? "/Applications/Discord.app" : "/usr/share/discord"}"`)
    .replace("</head>", '<style>.titlebar{-webkit-app-region:drag}.titlebar button,.titlebar a{-webkit-app-region:no-drag}</style></head>');
html = html.replace("<head>", '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src data:; font-src data:;">');
await writeFile(join(destination, "index.html"), html);
process.stdout.write(`Prepared ${platform} installer at ${destination}\n`);
