/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";

export const compilerArchiveName = "moggcord-community-compiler.tar.gz";
export const compilerManifestName = "community-compiler.json";
const readyName = ".community-compiler-ready.json";
const run = promisify(execFile);
const preparations = new Map();
const exists = file => lstat(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
const tar = process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";

export function compilerPath(value) {
    if (typeof value !== "string" || !value || value.includes("\\") || /[:\x00-\x1f\x7f]/.test(value)
        || posix.isAbsolute(value) || posix.normalize(value) !== value
        || value.split("/").some(part => !part || part === ".." || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
        throw new Error("The compiler package contains an unsafe path.");
    return value;
}

export function compilerChecksum(contents) {
    const matches = contents.split(/\r?\n/).map(line => /^([a-f0-9]{64})\s+\*?(.+?)\s*$/i.exec(line))
        .filter(match => match?.[2] === compilerArchiveName);
    if (matches.length !== 1) throw new Error("The release has no unique fingerprint for its compiler package.");
    return matches[0][1].toLowerCase();
}

async function download(url, file, expected, fetcher) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(600_000) });
    if (!response.ok || !response.body) throw new Error("The compiler for this Moggcord version is unavailable. Your installed version was kept.");
    const output = await open(file, "wx");
    const hash = createHash("sha256"); let size = 0;
    try {
        for await (const chunk of response.body) {
            if ((size += chunk.length) > 2 * 1024 * 1024 * 1024) throw new Error("The compiler download is too large.");
            hash.update(chunk); await output.writeFile(chunk);
        }
    } finally { await output.close(); }
    if (hash.digest("hex") !== expected) throw new Error("The compiler download did not match the release fingerprint. Your installed version was kept.");
}

export async function extractCompiler(archive, destination, execute = run) {
    const options = { windowsHide: true, timeout: 180_000, maxBuffer: 64 * 1024 * 1024 };
    const names = (await execute(tar, ["-tzf", archive], options)).stdout.split(/\r?\n/).filter(Boolean);
    const entries = (await execute(tar, ["-tvzf", archive], options)).stdout.split(/\r?\n/).filter(Boolean);
    if (!names.length || names.length > 200_000 || entries.length !== names.length || entries.some(line => !["-", "d"].includes(line[0])))
        throw new Error("The compiler archive must contain only regular files and directories.");
    const found = new Set();
    for (const entry of names) {
        const name = entry.replace(/^\.\//, "").replace(/\/$/, "");
        if (!name || name === ".") continue;
        compilerPath(name);
        const key = name.toLowerCase();
        if (found.has(key) || key === "src/userplugins" || key.startsWith("src/userplugins/") || key === readyName)
            throw new Error("The compiler archive contains conflicting files or user plugin source.");
        found.add(key);
    }
    await mkdir(destination);
    await execute(tar, ["-xzf", archive, "-C", destination], options);
}

async function restoreLinks(root, manifest) {
    if (!Array.isArray(manifest.links) || manifest.links.length > 50_000) throw new Error("The compiler dependency links are invalid.");
    const paths = new Set();
    for (const link of manifest.links) {
        compilerPath(link.path); compilerPath(link.target);
        if (!link.path.startsWith("node_modules/") || !["directory", "file"].includes(link.kind) || paths.has(link.path.toLowerCase())
            || link.target.toLowerCase() === "src/userplugins" || link.target.toLowerCase().startsWith("src/userplugins/"))
            throw new Error("The compiler dependency links are invalid.");
        paths.add(link.path.toLowerCase());
    }
    for (const link of manifest.links) {
        for (const name of [link.path, link.target]) {
            for (let parent = posix.dirname(name); parent !== "."; parent = posix.dirname(parent))
                if (paths.has(parent.toLowerCase())) throw new Error("The compiler dependency links cannot traverse other links.");
        }
        if (paths.has(link.target.toLowerCase())) throw new Error("The compiler dependency links cannot point to other links.");
        const target = join(root, link.target), path = join(root, link.path);
        const info = await exists(target);
        if (!info || info.isSymbolicLink() || (link.kind === "directory" ? !info.isDirectory() : !info.isFile()) || await exists(path))
            throw new Error("The compiler package has an incomplete dependency link.");
    }
    for (const link of manifest.links) {
        const target = join(root, link.target), path = join(root, link.path);
        await mkdir(dirname(path), { recursive: true });
        if (process.platform === "win32" && link.kind === "file") await copyFile(target, path);
        else await symlink(process.platform === "win32" ? target : relative(dirname(path), target), path, link.kind === "directory" ? process.platform === "win32" ? "junction" : "dir" : "file");
    }
}

async function copyPlugins(sourceRoot, destination) {
    if (!sourceRoot) return;
    const source = join(resolve(sourceRoot), "src", "userplugins");
    const info = await exists(source);
    if (!info) return;
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Community plugin source must be stored in regular folders.");
    const visit = async (from, to) => {
        await mkdir(to, { recursive: true });
        for (const item of await readdir(from, { withFileTypes: true })) {
            if (item.isSymbolicLink()) throw new Error("Community plugin source cannot contain links to other folders.");
            const input = join(from, item.name), output = join(to, item.name);
            if (item.isDirectory()) await visit(input, output);
            else if (item.isFile()) await copyFile(input, output);
            else throw new Error("Community plugin source contains an unsupported file.");
        }
    };
    await visit(source, join(destination, "src", "userplugins"));
}

async function verifyPackages(root, version) {
    const manifest = JSON.parse(await readFile(join(root, compilerManifestName), "utf8"));
    const source = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (manifest.format !== 1 || manifest.version !== version || source.version !== version)
        throw new Error("The compiler package does not match your running Moggcord version.");
    for (const [name, expected] of [["esbuild", manifest.esbuildVersion], ["typescript", manifest.typescriptVersion]]) {
        const dependency = JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8"));
        if (typeof expected !== "string" || dependency.version !== expected) throw new Error(`The compiler package has an inconsistent ${name} dependency.`);
    }
    if (!(await exists(join(root, "scripts", "build", "build.mjs")))?.isFile()) throw new Error("The compiler package is missing its build script.");
    return manifest;
}

async function ensureEsbuild(root, execute = run) {
    const env = { ...process.env }; delete env.ESBUILD_BINARY_PATH;
    const options = { cwd: root, env, windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 };
    const check = () => execute(process.execPath, ["-e", "require('./node_modules/esbuild').transformSync('let value = 1', {loader:'js'})"], options);
    try { await check(); }
    catch {
        await execute(process.execPath, [join(root, "node_modules", "esbuild", "install.js")], options);
        await check();
    }
}

async function prepare(root, { version, progress = () => {}, previousSourceRoot }, dependencies) {
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Use the current Moggcord version when preparing its compiler.");
    if (root === dirname(root) || await exists(join(root, ".git"))) throw new Error("Use Moggcord's managed compiler folder instead of a development checkout.");
    const checkEsbuild = dependencies.ensureEsbuild ?? (path => ensureEsbuild(path, dependencies.run ?? run));
    const marker = await readFile(join(root, readyName), "utf8").then(JSON.parse).catch(error => {
        if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
        throw error;
    });
    if (marker?.version === version) {
        await verifyPackages(root, version); await checkEsbuild(root);
        return root;
    }
    await mkdir(dirname(root), { recursive: true });
    const operation = await mkdtemp(join(dirname(root), ".moggcord-compiler-"));
    const extracted = join(operation, "source"), backup = join(operation, "previous");
    let moved = false, published = false, cleanup = true;
    try {
        const base = `https://github.com/caedesdev/moggcord/releases/download/updates-v${version}/`;
        const fetcher = dependencies.fetch ?? fetch;
        progress("Preparing the compiler for your Moggcord version…");
        const sums = await fetcher(base + "SHA256SUMS.txt", { signal: AbortSignal.timeout(30_000) });
        if (!sums.ok) throw new Error("This Moggcord release has no compiler fingerprints. Your installed version was kept.");
        const text = await sums.text();
        if (text.length > 2 * 1024 * 1024) throw new Error("The compiler fingerprint list is too large.");
        const expected = compilerChecksum(text), archive = join(operation, compilerArchiveName);
        await download(base + compilerArchiveName, archive, expected, fetcher);
        await extractCompiler(archive, extracted, dependencies.run ?? run);
        const manifest = JSON.parse(await readFile(join(extracted, compilerManifestName), "utf8"));
        const source = JSON.parse(await readFile(join(extracted, "package.json"), "utf8"));
        if (manifest.format !== 1 || manifest.version !== version || source.version !== version)
            throw new Error("The compiler package does not match your running Moggcord version.");
        await copyPlugins(previousSourceRoot, extracted);
        await copyPlugins(root, extracted);
        if (await exists(root)) {
            if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error("The managed compiler folder is not a regular directory.");
            await rename(root, backup); moved = true;
        }
        await rename(extracted, root); published = true;
        await restoreLinks(root, manifest);
        await verifyPackages(root, version);
        progress("Checking the compiler for this computer…");
        await checkEsbuild(root);
        await writeFile(join(root, readyName), JSON.stringify({ version, platform: process.platform, arch: process.arch }), { flag: "wx" });
        return root;
    } catch (error) {
        try {
            if (published) await rename(root, join(operation, "failed"));
            if (moved) await rename(backup, root);
        } catch (restoreError) {
            cleanup = false;
            throw new Error(`The compiler could not be restored. Previous files were kept in ${operation}.`, { cause: restoreError });
        }
        throw error;
    } finally {
        if (cleanup) {
            if (dirname(operation) !== dirname(root) || !operation.startsWith(join(dirname(root), ".moggcord-compiler-")))
                throw new Error("Refusing to remove an unexpected compiler folder.");
            await rm(operation, { recursive: true, force: true });
        }
    }
}

export function prepareCompiler(sourceRoot, options, dependencies = {}) {
    const root = resolve(sourceRoot), pending = preparations.get(root);
    if (pending) return pending.version === options.version ? pending.task : Promise.reject(new Error("Another Moggcord version is preparing this compiler folder."));
    const task = prepare(root, options, dependencies).finally(() => preparations.delete(root));
    preparations.set(root, { version: options.version, task });
    return task;
}
