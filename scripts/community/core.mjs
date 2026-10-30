/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { isBuiltin } from "node:module";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";
import { buildFiles, verifyBuild } from "../lib/build-info.mjs";
import pluginPackage from "../../web/plugin-package.js";
import { pluginBundleKind } from "../lib/plugin-bundle.mjs";

export const bridgePort = 6469;
export const bridgeName = "moggcord-community";
export const sourceLimit = 10 * 1024 * 1024;
export const channelNames = { stable: "Discord", canary: "DiscordCanary", ptb: "DiscordPTB", development: "DiscordDevelopment" };
const run = promisify(execFile);
const identifier = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const bundleFiles = [...buildFiles, "build-info.json"];
const hash = value => createHash("sha256").update(value).digest("hex");

export function trustedOrigin(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
        || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))))
        throw new Error("Use an HTTPS website address, or localhost for development.");
    return url.origin;
}

export function manifestAddress(value, origin) {
    const url = new URL(value);
    if (url.origin !== trustedOrigin(origin) || url.username || url.password || url.search || url.hash
        || !/^\/api\/install\/[a-f0-9-]{36}$/.test(url.pathname) || !identifier.test(url.pathname.split("/").pop()))
        throw new Error("This installation link does not belong to your connected website.");
    return url;
}

export function parseLink(value, origin) {
    const url = new URL(value);
    if (url.protocol !== "moggcord:" || url.hostname !== "install" || !["", "/"].includes(url.pathname) || url.hash || url.username || url.password)
        throw new Error("This Moggcord installation link is invalid.");
    const manifest = manifestAddress(url.searchParams.get("manifest"), origin).href;
    const sha256 = url.searchParams.get("sha256");
    if (!/^[a-f0-9]{64}$/.test(sha256 ?? "")) throw new Error("This installation link has no valid file fingerprint.");
    return { manifest, sha256 };
}

export function validateManifest(data, address, expectedHash) {
    const bundled = data?.protocol === 2;
    const extension = data?.kind === "theme" ? /\.(css|style)$/i : /\.(js|jsx|ts|tsx|css)$/i;
    if (![1, 2].includes(data?.protocol) || !identifier.test(data?.id ?? "") || !["plugin", "theme"].includes(data.kind)
        || new URL(address).pathname !== `/api/install/${data.id}` || typeof data.name !== "string" || data.name.length > 100
        || typeof data.file_name !== "string" || (!bundled && !/^[A-Za-z0-9_. -]+$/.test(data.file_name)) || !extension.test(data.file_name)
        || typeof data.source_code !== "string" || !data.source_code.trim() || data.source_code.includes("\0")
        || Buffer.byteLength(data.source_code) > sourceLimit)
        throw new Error("This upload is not a supported plugin or stylesheet, or exceeds 10 MB.");
    let content = data.source_code;
    if (bundled) {
        if (data.kind !== "plugin") throw new Error("Themes must contain one stylesheet.");
        const checked = pluginPackage.validate(data.files, data.file_name);
        if (checked.source_code !== data.source_code) throw new Error("The plugin entry point does not match its files.");
        content = pluginPackage.canonical(checked.files, data.file_name);
    } else if (data.files !== undefined) throw new Error("Update the manifest format before sending a plugin folder.");
    if (!/^[a-f0-9]{64}$/.test(expectedHash) || hash(content) !== expectedHash || data.sha256 !== expectedHash)
        throw new Error("The uploaded file changed. Download it again from the website.");
    return data;
}

export async function fetchManifest(input, origin, fetcher = fetch) {
    const address = manifestAddress(input.manifest, origin);
    const response = await fetcher(address, { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json"))
        throw new Error("This upload is no longer available on the website.");
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > sourceLimit * 6 + 8192) {
            await response.body.cancel().catch(() => {});
            throw new Error("The installation response is too large.");
        }
        chunks.push(chunk);
    }
    return validateManifest(JSON.parse(Buffer.concat(chunks).toString("utf8")), address, input.sha256);
}

export async function findClient(channel, localAppData = process.env.LOCALAPPDATA) {
    if (!channelNames[channel] || !localAppData) throw new Error("Choose stable, canary, ptb, or development.");
    const base = join(localAppData, channelNames[channel]);
    const versions = (await readdir(base)).filter(name => /^app-\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => b.localeCompare(a, "en", { numeric: true }));
    for (const version of versions) {
        const folder = join(base, version);
        const loaderFile = join(folder, "resources", "app", "index.js");
        if (!existsSync(loaderFile)) continue;
        const loader = await readFile(loaderFile, "utf8");
        if (!loader.includes("Moggcord Injector")) continue;
        const candidates = [...loader.matchAll(/"([^"\r\n]+\/patcher\.js)"/g)].map(match => match[1]);
        candidates.push(join(localAppData, "Moggcord", "dist", "desktop", "patcher.js"), join(localAppData, "Moggcord", "dist", "patcher.js"));
        const patcher = candidates.find(file => existsSync(file));
        if (!patcher || !(await readFile(patcher, "utf8")).startsWith("// Moggcord ")) continue;
        const executable = (await readdir(folder)).find(name => /^Discord(?:Canary|PTB|Development)?\.exe$/i.test(name));
        if (executable) return { base, executable: join(folder, executable), installDir: realpathSync(dirname(patcher)) };
    }
    throw new Error(`No Moggcord installation was found in ${channelNames[channel]}. Install Moggcord in this channel first.`);
}

function inspectSources(files) {
    const paths = new Set(files.map(file => file.path));
    const localImport = (file, specifier) => {
        const path = posix.normalize(posix.join(posix.dirname(file.path), specifier.split(/[?#]/)[0]));
        if (path === ".." || path.startsWith("../") || posix.isAbsolute(path)
            || ![path, ...[".ts", ".tsx", ".js", ".jsx", ".css", ".json", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"].map(extension => path + extension)].some(value => paths.has(posix.normalize(value))))
            throw new Error(`Missing or unsafe import ${specifier} in ${file.path}. Include the complete plugin folder.`);
    };
    for (const file of files) {
        if (/\.css$/i.test(file.path)) {
            for (const match of file.content.matchAll(/(?:@import\s+(?:url\()?|url\()\s*["']?([^"')\s;]+)/gi)) {
                const specifier = match[1];
                if (/^(?:https?:|data:|#)/i.test(specifier)) continue;
                if (specifier.startsWith("/") || specifier.includes("\\")) throw new Error("Styles must reference files inside this plugin folder.");
                localImport(file, specifier);
            }
            continue;
        }
        if (!pluginPackage.codeExtension.test(file.path)) continue;
        const ast = ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true,
            /x$/i.test(file.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        if (ast.parseDiagnostics.length) throw new Error(`This plugin has a syntax error in ${file.path}.`);
        const inspect = node => {
            const module = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
                : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require") ? node.arguments[0] : null;
            if (module) {
                if (!ts.isStringLiteral(module)) throw new Error("Plugin imports must use a fixed module name.");
                if (module.text.startsWith(".")) localImport(file, module.text);
                else if (!/^@(api|utils|components|webpack|shared)(?:\/|$)/.test(module.text)
                    && module.text !== "@vencord/discord-types"
                    && !((/^native(?:\/|\.[jt]sx?$)/i.test(file.path)) && isBuiltin(module.text)))
                    throw new Error(`Unsupported import ${module.text} in ${file.path}. Use Moggcord modules or files from this plugin folder.`);
            }
            ts.forEachChild(node, inspect);
        };
        inspect(ast);
    }
}

async function pluginName(source, ownDirectory, sourceRoot, files) {
    inspectSources(files);
    const name = source.match(/definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/)?.[3];
    if (!name || !/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,79}$/.test(name) || ["constructor", "prototype", "__proto__"].includes(name))
        throw new Error("Plugins must export definePlugin({ name: \"PluginName\", ... }) with the name first.");
    const visit = async directory => {
        if (!existsSync(directory) || resolve(directory) === ownDirectory) return;
        for (const item of await readdir(directory, { withFileTypes: true })) {
            const file = join(directory, item.name);
            if (item.isDirectory()) await visit(file);
            else if (/\.[jt]sx?$/.test(item.name)) {
                if ((await readFile(file, "utf8")).match(/definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/)?.[3] === name)
                    throw new Error("Another installed plugin already uses this name.");
            }
        }
    };
    for (const directory of ["plugins/_api", "plugins/_core", "plugins", "moggcordplugins/_api", "moggcordplugins", "userplugins"]) {
        const base = join(sourceRoot, "src", directory);
        if (!existsSync(base)) continue;
        for (const file of await readdir(base, { withFileTypes: true })) {
            if (!pluginBundleKind(directory, file.name)) continue;
            const path = join(base, file.name);
            if (file.isDirectory()) await visit(path);
            else if (/\.[jt]sx?$/.test(file.name) && (await readFile(path, "utf8")).match(/definePlugin\(\{\s*(["'])?name\1:\s*(["'`])(.+?)\2/)?.[3] === name)
                throw new Error("Another installed plugin already uses this name.");
        }
    }
    return name;
}

export const defaultBuild = sourceRoot => run(process.execPath, ["scripts/build/build.mjs", "--standalone"], {
    cwd: sourceRoot, windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024
}).catch(() => { throw new Error("Moggcord could not build this plugin. Your installed version was kept. Check the plugin source."); });

export async function stopClient(client) {
    const command = "$base=$env:MOGGCORD_COMMUNITY_CLIENT_BASE+'\\'; $items=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -and $_.Name -like 'Discord*.exe'}); foreach($item in $items){ $p=Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue; if($p){[void]$p.CloseMainWindow()} }; Start-Sleep -Milliseconds 1000; foreach($item in $items){Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue}; Start-Sleep -Milliseconds 100; $remaining=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -and $_.Name -like 'Discord*.exe'}); if($remaining.Count){throw 'Discord could not be closed. Please close the selected channel and try again.'}; exit 0";
    await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
        windowsHide: true, timeout: 20_000, env: { ...process.env, MOGGCORD_COMMUNITY_CLIENT_BASE: client.base }
    });
}

export async function startClient(client) {
    const child = spawn(client.executable, [], { detached: true, stdio: "ignore", windowsHide: true });
    await new Promise((resolvePromise, reject) => { child.once("spawn", resolvePromise); child.once("error", reject); });
    child.unref();
}

async function snapshot(file, backups) {
    if (!backups.has(file)) backups.set(file, existsSync(file) ? await readFile(file) : null);
}

async function atomicWrite(file, bytes) {
    await mkdir(dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, file);
}

async function deployBuild(client, config, backups) {
    const destinations = [...new Set([client.installDir, config.mirrorDir].filter(Boolean).map(value => resolve(value)))];
    for (const destination of destinations) for (const filename of bundleFiles) {
        const target = join(destination, filename);
        await snapshot(target, backups);
        await atomicWrite(target, await readFile(join(config.sourceRoot, "dist", "desktop", filename)));
    }
}

export async function repairClient(config, dependencies = {}) {
    const client = await (dependencies.findClient ?? findClient)(config.channel);
    await (dependencies.build ?? defaultBuild)(config.sourceRoot);
    verifyBuild(join(config.sourceRoot, "dist", "desktop"), JSON.parse(await readFile(join(config.sourceRoot, "package.json"), "utf8")).version);
    const backups = new Map(); let stopped = false;
    const start = dependencies.start ?? startClient;
    try {
        stopped = true;
        await (dependencies.stop ?? stopClient)(client);
        await deployBuild(client, config, backups);
        await start(client);
    } catch (error) {
        for (const [file, bytes] of [...backups].reverse()) {
            if (bytes === null) await rm(file, { force: true });
            else await atomicWrite(file, bytes);
        }
        if (stopped) await start(client).catch(() => {});
        throw error;
    }
}

export async function installEntry(entry, config, dependencies = {}, progress = () => {}) {
    validateManifest(entry, `https://moggcord.invalid/api/install/${entry?.id}`, entry?.sha256);
    const sourceRoot = resolve(config.sourceRoot);
    const client = await (dependencies.findClient ?? findClient)(config.channel);
    const stylesheet = entry.protocol === 1 && /\.(css|style)$/i.test(entry.file_name);
    const pluginDirectory = join(sourceRoot, "src", "userplugins", `community-${entry.id}`);
    const pluginFiles = entry.files ?? [{ path: /\.[jt]sx$/i.test(entry.file_name) ? "index.tsx" : "index.ts", content: entry.source_code }];
    const createdDirectories = new Set();
    const backups = new Map(); let stopped = false;
    const stop = dependencies.stop ?? stopClient;
    const start = dependencies.start ?? startClient;
    try {
        let name;
        if (!stylesheet) {
            const files = [...pluginFiles];
            if (!files.some(file => ["index.ts", "index.tsx"].includes(file.path)))
                files.push({ path: "index.ts", content: `export { default } from ${JSON.stringify("./" + entry.file_name)};\nexport * from ${JSON.stringify("./" + entry.file_name)};\n` });
            name = await pluginName(entry.source_code, resolve(pluginDirectory), sourceRoot, files);
            const requested = new Set(files.map(file => resolve(pluginDirectory, file.path)));
            const checkPath = path => {
                for (let current = path; ; current = dirname(current)) {
                    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error("Plugin folders cannot contain links to other folders.");
                    if (current === sourceRoot) break;
                    if (dirname(current) === current) throw new Error("Invalid plugin destination.");
                }
            };
            checkPath(pluginDirectory);
            const oldFiles = async directory => {
                if (!existsSync(directory)) return;
                for (const item of await readdir(directory, { withFileTypes: true })) {
                    const path = join(directory, item.name); checkPath(path);
                    if (item.isDirectory()) await oldFiles(path);
                    else if (!requested.has(path)) { await snapshot(path, backups); await rm(path); }
                }
            };
            await oldFiles(pluginDirectory);
            for (const file of files) {
                const path = resolve(pluginDirectory, file.path); checkPath(path);
                for (let current = dirname(path); current !== dirname(pluginDirectory) && !existsSync(current); current = dirname(current)) createdDirectories.add(current);
                await snapshot(path, backups); await atomicWrite(path, file.content);
            }
            progress("building", "Building your plugin…");
            await (dependencies.build ?? defaultBuild)(sourceRoot);
            const version = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8")).version;
            verifyBuild(join(sourceRoot, "dist", "desktop"), version);
        }
        progress("installing", "Installing in Moggcord…");
        stopped = true;
        await stop(client);
        const settingsFile = join(config.dataDir, "settings", "settings.json");
        await snapshot(settingsFile, backups);
        const settings = existsSync(settingsFile) ? JSON.parse(await readFile(settingsFile, "utf8")) : {};
        if (stylesheet) {
            const filename = `community-${entry.id}.theme.css`;
            const target = join(config.dataDir, "themes", filename);
            await snapshot(target, backups);
            await atomicWrite(target, entry.source_code);
            settings.enabledThemes = [...new Set([...(settings.enabledThemes ?? []), filename])];
            settings.themeNames = { ...settings.themeNames, [filename]: entry.name };
        } else {
            await deployBuild(client, config, backups);
            settings.plugins ??= {};
            settings.plugins[name] = { ...settings.plugins[name], enabled: true, communityInstallHash: entry.sha256 };
        }
        await atomicWrite(settingsFile, JSON.stringify(settings, null, 4));
        progress("restarting", "Restarting Moggcord…");
        await start(client);
        return { name: entry.name, channel: config.channel, sha256: entry.sha256 };
    } catch (error) {
        for (const [file, bytes] of [...backups].reverse())
            if (bytes === null) await rm(file, { force: true });
        for (const directory of [...createdDirectories].sort((a, b) => b.length - a.length))
            if (existsSync(directory) && lstatSync(directory).isDirectory() && !(await readdir(directory)).length) await rmdir(directory);
        for (const [file, bytes] of [...backups].reverse())
            if (bytes !== null) await atomicWrite(file, bytes);
        if (stopped) await start(client).catch(() => {});
        throw error;
    } finally {
        for (const directory of [...createdDirectories].sort((a, b) => b.length - a.length))
            if (existsSync(directory) && lstatSync(directory).isDirectory() && !(await readdir(directory)).length) await rmdir(directory);
    }
}
