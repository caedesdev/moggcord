/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { createCompilerArchive } from "../build/community-compiler.mjs";
import { compilerArchiveName, compilerChecksum, compilerManifestName, compilerPath, extractCompiler, prepareCompiler } from "../community/compiler.mjs";

const run = promisify(execFile);
const version = "1.2.3";
const put = async (path, contents) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, contents); };

async function fixture(t) {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-compiler-test-"));
    t.after(async () => {
        assert.equal(dirname(directory), resolve(tmpdir()));
        assert(directory.startsWith(join(resolve(tmpdir()), "moggcord-compiler-test-")));
        await rm(directory, { recursive: true, force: true });
    });
    const source = join(directory, "source"), output = join(directory, compilerArchiveName), target = join(directory, "managed", version);
    const sourceFiles = ["package.json", "scripts/build/build.mjs", "src/main.ts", "LICENSE", "src/userplugins/private.ts"];
    await put(join(source, "package.json"), JSON.stringify({ version }));
    await put(join(source, "scripts", "build", "build.mjs"), "export const compiler = true;");
    await put(join(source, "src", "main.ts"), "export const source = true;");
    await put(join(source, "LICENSE"), "Compiler fixture license");
    await put(join(source, "src", "userplugins", "private.ts"), "private source that must not be published");
    for (const [name, dependencyVersion] of [["esbuild", "0.27.0"], ["typescript", "5.9.3"]]) {
        const packageDirectory = join(source, "node_modules", ".pnpm", `${name}@${dependencyVersion}`, "node_modules", name);
        await put(join(packageDirectory, "package.json"), JSON.stringify({ name, version: dependencyVersion }));
        await put(join(packageDirectory, "install.js"), "throw new Error('The fixture installer must not run');");
        await symlink(packageDirectory, join(source, "node_modules", name), process.platform === "win32" ? "junction" : "dir");
    }
    const packageArchive = () => createCompilerArchive({ sourceRoot: source, outputFile: output, sourceFiles });
    const fetchArchive = async (url, wrongHash = false) => {
        const bytes = await readFile(output), hash = createHash("sha256").update(bytes).digest("hex");
        if (url.endsWith("/SHA256SUMS.txt")) return new Response(`${wrongHash === true ? "0".repeat(64) : hash}  ${compilerArchiveName}\n`);
        assert(url.endsWith("/" + compilerArchiveName));
        return new Response(bytes);
    };
    return { directory, source, output, target, packageArchive, fetchArchive };
}

test("compiler fingerprints require exactly the fixed artifact filename and paths reject traversal or Windows aliases", () => {
    const hash = "a".repeat(64);
    assert.equal(compilerChecksum(`${hash}  another-file\n${hash} *${compilerArchiveName}\n`), hash);
    for (const contents of [`${hash}  other.tar.gz`, `${hash}  ./${compilerArchiveName}`, `${hash}  ${compilerArchiveName}\n${hash}  ${compilerArchiveName}`])
        assert.throws(() => compilerChecksum(contents), /unique fingerprint/);
    for (const path of ["../outside", "/outside", "C:/outside", "a\\b", "a/../b", "a//b", "aux.txt", "a/name.", "a/name ", "a\nname"])
        assert.throws(() => compilerPath(path), /unsafe path/);
    assert.equal(compilerPath("node_modules/.pnpm/esbuild@0.27.0/node_modules/esbuild/package.json"), "node_modules/.pnpm/esbuild@0.27.0/node_modules/esbuild/package.json");
});

test("a real compiler archive roundtrip preserves staged and previous visitor plugins and restores portable dependency links", async t => {
    const f = await fixture(t), previous = join(f.directory, "previous");
    await put(join(previous, "src", "userplugins", "community-old", "index.ts"), "retained plugin");
    await put(join(previous, "src", "userplugins", "community-new", "index.ts"), "older upload");
    await put(join(f.target, "src", "userplugins", "community-new", "index.ts"), "current upload");
    const packaged = await f.packageArchive();
    assert.equal(packaged.version, version); assert.equal(packaged.links, 2); assert(packaged.size > 0);
    const requests = []; let verified = 0;
    const dependencies = { fetch: async url => { requests.push(url); return f.fetchArchive(url); }, ensureEsbuild: async root => {
        assert.equal(JSON.parse(await readFile(join(root, "node_modules", "esbuild", "package.json"), "utf8")).version, "0.27.0");
        verified++;
    } };
    await prepareCompiler(f.target, { version, previousSourceRoot: previous }, dependencies);
    assert(requests.every(url => url.startsWith(`https://github.com/caedesdev/moggcord/releases/download/updates-v${version}/`)));
    assert.equal(await readFile(join(f.target, "src", "userplugins", "community-old", "index.ts"), "utf8"), "retained plugin");
    assert.equal(await readFile(join(f.target, "src", "userplugins", "community-new", "index.ts"), "utf8"), "current upload");
    await assert.rejects(readFile(join(f.target, "src", "userplugins", "private.ts")), { code: "ENOENT" });
    assert((await lstat(join(f.target, "node_modules", "esbuild"))).isSymbolicLink());
    const manifest = JSON.parse(await readFile(join(f.target, compilerManifestName), "utf8"));
    assert(manifest.links.every(link => !link.target.includes("\\") && !link.target.startsWith("../")));
    await prepareCompiler(f.target, { version }, dependencies);
    assert.equal(requests.length, 2); assert.equal(verified, 2);
    assert.deepEqual((await readdir(dirname(f.target))).sort(), [version]);
});

test("a corrupt compiler download is rejected before replacing any staged plugin source", async t => {
    const f = await fixture(t);
    await f.packageArchive();
    await put(join(f.target, "src", "userplugins", "community-current", "index.ts"), "keep source");
    let checked = false;
    await assert.rejects(prepareCompiler(f.target, { version }, { fetch: url => f.fetchArchive(url, true), ensureEsbuild: async () => { checked = true; } }), /fingerprint/);
    assert.equal(checked, false);
    assert.equal(await readFile(join(f.target, "src", "userplugins", "community-current", "index.ts"), "utf8"), "keep source");
    assert.deepEqual(await readdir(dirname(f.target)), [version]);
});

test("a compiler source version mismatch cannot replace the requested app version", async t => {
    const f = await fixture(t);
    await f.packageArchive();
    await assert.rejects(prepareCompiler(f.target, { version: "1.2.4" }, { fetch: f.fetchArchive, ensureEsbuild: async () => {} }), /does not match/);
    await assert.rejects(lstat(f.target), { code: "ENOENT" });
    assert.deepEqual(await readdir(dirname(f.target)), []);
});

test("compiler verification failure restores the complete previous compiler directory", async t => {
    const f = await fixture(t);
    await f.packageArchive();
    await put(join(f.target, "retained.txt"), "original compiler state");
    await put(join(f.target, "src", "userplugins", "community-current", "index.ts"), "keep source");
    await assert.rejects(prepareCompiler(f.target, { version }, { fetch: f.fetchArchive, ensureEsbuild: async () => { throw new Error("native compiler failed"); } }), /native compiler failed/);
    assert.equal(await readFile(join(f.target, "retained.txt"), "utf8"), "original compiler state");
    assert.equal(await readFile(join(f.target, "src", "userplugins", "community-current", "index.ts"), "utf8"), "keep source");
    assert.deepEqual(await readdir(dirname(f.target)), [version]);
});

test("cross-platform esbuild preparation invokes its bundled official installer with the current private Node", async t => {
    const f = await fixture(t), commands = [];
    await f.packageArchive();
    let installed = false;
    const execute = async (file, args, options) => {
        if (file !== process.execPath) return run(file, args, options);
        commands.push(args);
        assert.equal(options.env.ESBUILD_BINARY_PATH, undefined);
        if (args[0] === "-e") {
            if (!installed) throw new Error("binary for another platform");
        } else {
            assert.equal(args[0], join(f.target, "node_modules", "esbuild", "install.js"));
            installed = true;
        }
        return { stdout: "", stderr: "" };
    };
    await prepareCompiler(f.target, { version }, { fetch: f.fetchArchive, run: execute });
    assert.equal(commands.length, 3);
    assert.equal(commands[0][0], "-e"); assert.equal(commands[2][0], "-e");
});

test("packaging rejects dependency links outside its source root instead of copying private files", async t => {
    const f = await fixture(t), outside = join(f.directory, "outside");
    await put(join(outside, "private.txt"), "private file");
    await symlink(outside, join(f.source, "node_modules", "outside"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(f.packageArchive(), /unsafe path/);
    assert.equal(await readFile(join(outside, "private.txt"), "utf8"), "private file");
});

test("compiler extraction rejects archive symlinks before allowing tar to create them", async t => {
    const f = await fixture(t), header = Buffer.alloc(512);
    header.write("linked", 0); header.write("0000777\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write("00000000000\0", 124); header.write("00000000000\0", 136); header.fill(32, 148, 156);
    header.write("2", 156); header.write("../outside", 157); header.write("ustar\0", 257); header.write("00", 263);
    header.write([...header].reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148);
    await writeFile(f.output, gzipSync(Buffer.concat([header, Buffer.alloc(1024)])));
    const destination = join(f.directory, "extracted");
    await assert.rejects(extractCompiler(f.output, destination), /regular files and directories/);
    await assert.rejects(lstat(destination), { code: "ENOENT" });
});

test("an unsafe dependency target in a fingerprinted archive is rejected and restores visitor sources", async t => {
    const f = await fixture(t), unpacked = join(f.directory, "unpacked");
    await f.packageArchive();
    await extractCompiler(f.output, unpacked);
    const manifestFile = join(unpacked, compilerManifestName), manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.links[0].target = "../outside";
    await writeFile(manifestFile, JSON.stringify(manifest));
    const program = process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
    await run(program, ["-czf", f.output, "-C", unpacked, "."], { windowsHide: true });
    await put(join(f.target, "src", "userplugins", "community-current", "index.ts"), "keep source");
    await assert.rejects(prepareCompiler(f.target, { version }, { fetch: f.fetchArchive, ensureEsbuild: async () => {} }), /unsafe path/);
    assert.equal(await readFile(join(f.target, "src", "userplugins", "community-current", "index.ts"), "utf8"), "keep source");
    assert.deepEqual(await readdir(dirname(f.target)), [version]);
});

test("visitor plugin links are not followed while migrating an older compiler", async t => {
    const f = await fixture(t), previous = join(f.directory, "previous"), outside = join(f.directory, "outside");
    await f.packageArchive();
    await put(join(outside, "private.ts"), "private source");
    await mkdir(join(previous, "src", "userplugins"), { recursive: true });
    await symlink(outside, join(previous, "src", "userplugins", "linked"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(prepareCompiler(f.target, { version, previousSourceRoot: previous }, { fetch: f.fetchArchive, ensureEsbuild: async () => {} }), /cannot contain links/);
    assert.equal(await readFile(join(outside, "private.ts"), "utf8"), "private source");
    await assert.rejects(lstat(f.target), { code: "ENOENT" });
});
