/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { compilerArchiveName, compilerManifestName, compilerPath } from "../community/compiler.mjs";

const run = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const included = name => /^(?:scripts|src|static|web|packages)\//.test(name) || /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig(?:\.[^/]+)?\.json|LICENSE(?:\.[^/]+)?)$/.test(name);

export async function createCompilerArchive({ sourceRoot = repository, outputFile = join(repository, "release", "installer", compilerArchiveName), sourceFiles } = {}) {
    const root = await realpath(resolve(sourceRoot)), output = resolve(outputFile);
    const source = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    if (!/^\d+\.\d+\.\d+$/.test(source.version)) throw new Error("The compiler package needs a normal Moggcord version.");
    const stage = await mkdtemp(join(tmpdir(), "moggcord-compiler-package-"));
    const links = [];
    try {
        const files = sourceFiles ?? (await run("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 16 * 1024 * 1024 })).stdout.split("\0").filter(Boolean);
        for (const name of files) {
            compilerPath(name);
            if (!included(name) || name === "src/userplugins" || name.startsWith("src/userplugins/")) continue;
            const input = join(root, name), info = await lstat(input);
            if (!info.isFile() || info.isSymbolicLink()) throw new Error(`The compiler source ${name} is not a regular file.`);
            const output = join(stage, name);
            await mkdir(dirname(output), { recursive: true }); await copyFile(input, output);
        }
        const visit = async (directory, name) => {
            for (const item of await readdir(directory, { withFileTypes: true })) {
                if ([".bin", ".cache", ".git", ".modules.yaml", ".npmrc"].includes(item.name) || /^\.env(?:\.|$)/.test(item.name)) continue;
                const input = join(directory, item.name), child = `${name}/${item.name}`;
                compilerPath(child);
                const info = await lstat(input);
                if (info.isSymbolicLink()) {
                    const target = await realpath(input), targetName = relative(root, target).split(sep).join("/");
                    compilerPath(targetName);
                    const targetInfo = await stat(target);
                    if (!targetInfo.isDirectory() && !targetInfo.isFile()) throw new Error("A compiler dependency link has an unsupported target.");
                    links.push({ path: child, target: targetName, kind: targetInfo.isDirectory() ? "directory" : "file" });
                } else if (info.isDirectory()) {
                    await mkdir(join(stage, child), { recursive: true }); await visit(input, child);
                } else if (info.isFile()) {
                    await mkdir(dirname(join(stage, child)), { recursive: true }); await copyFile(input, join(stage, child));
                } else throw new Error(`The compiler dependency ${child} is not a regular file.`);
            }
        };
        await visit(join(root, "node_modules"), "node_modules");
        for (const link of links) {
            const target = await lstat(join(stage, link.target)).catch(() => null);
            if (!target || target.isSymbolicLink()) throw new Error(`The compiler dependency ${link.path} points outside its packaged files.`);
        }
        const esbuild = JSON.parse(await readFile(join(root, "node_modules", "esbuild", "package.json"), "utf8"));
        const typescript = JSON.parse(await readFile(join(root, "node_modules", "typescript", "package.json"), "utf8"));
        await writeFile(join(stage, compilerManifestName), JSON.stringify({ format: 1, version: source.version, esbuildVersion: esbuild.version, typescriptVersion: typescript.version, links }));
        await mkdir(dirname(output), { recursive: true });
        const tar = process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
        await run(tar, ["-czf", output, "--format=pax", "-C", stage, "."], { windowsHide: true, timeout: 600_000, maxBuffer: 1024 * 1024 });
        return { file: output, version: source.version, links: links.length, size: (await stat(output)).size };
    } finally {
        if (dirname(stage) !== resolve(tmpdir()) || !stage.startsWith(join(resolve(tmpdir()), "moggcord-compiler-package-")))
            throw new Error("Refusing to remove an unexpected compiler packaging folder.");
        await rm(stage, { recursive: true, force: true });
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
    process.stdout.write(JSON.stringify(await createCompilerArchive()) + "\n");
