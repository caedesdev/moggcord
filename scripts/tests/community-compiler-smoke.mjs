/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compilerArchiveName, prepareCompiler } from "../community/compiler.mjs";
import { buildFiles, verifyBuild } from "../lib/build-info.mjs";

const archiveOption = process.argv.indexOf("--archive");
assert(archiveOption > 0 && process.argv[archiveOption + 1], "Pass the Windows compiler artifact with --archive.");
const archive = resolve(process.argv[archiveOption + 1]);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { version } = JSON.parse(await readFile(join(repository, "package.json"), "utf8"));
const base = `https://github.com/caedesdev/moggcord/releases/download/updates-v${version}/`;
const hash = createHash("sha256");
for await (const chunk of createReadStream(archive)) hash.update(chunk);
const fingerprint = hash.digest("hex"), requests = [];
const directory = await mkdtemp(join(tmpdir(), "moggcord-compiler-smoke-"));
const sourceRoot = join(directory, "compiler", version);
let server;
try {
    await prepareCompiler(sourceRoot, { version }, { fetch: async url => {
        requests.push(url);
        if (url === base + "SHA256SUMS.txt") return new Response(`${fingerprint}  ${compilerArchiveName}\n`);
        assert.equal(url, base + compilerArchiveName, "The compiler must use the exact running version's release artifact.");
        return new Response(Readable.toWeb(createReadStream(archive)));
    } });
    assert.deepEqual(requests, [base + "SHA256SUMS.txt", base + compilerArchiveName]);
    const pluginDirectory = join(sourceRoot, "src", "userplugins", "community-ci-smoke");
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(join(pluginDirectory, "index.ts"), 'import definePlugin from "@utils/types"; export default definePlugin({ name: "CommunityCompilerSmoke", description: "Verifies the packaged compiler.", authors: [] });\n');
    const { defaultBuild } = await import(pathToFileURL(join(sourceRoot, "scripts", "community", "core.mjs")).href);
    await defaultBuild(sourceRoot);
    const dist = join(sourceRoot, "dist", "desktop"), info = verifyBuild(dist, version);
    assert.equal(buildFiles.length, 5);
    for (const name of buildFiles) assert.match(info.files[name], /^[a-f0-9]{64}$/);
    const { createManagedService } = createRequire(import.meta.url)(join(dist, "community-service.cjs"));
    const service = createManagedService({
        origin: "https://moggcord.cc", version, channel: "auto", sourceRoot,
        dataDir: join(directory, "data"), mirrorDir: dist, controlToken: randomBytes(32).toString("hex")
    }, { findClient: async channel => {
        assert.equal(channel, "auto");
        return { channel: "canary", installDir: dist };
    } });
    server = service.server;
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const response = await fetch(`http://127.0.0.1:${server.address().port}/v1/status`, {
        headers: { Origin: "https://moggcord.cc" }, signal: AbortSignal.timeout(10_000)
    });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.name, "moggcord-community");
    assert.equal(status.protocol, 1);
    assert.equal(status.channel, "canary");
    process.stdout.write(`Windows compiler artifact built and served successfully on ${process.platform}-${process.arch} for Moggcord ${version}.\n`);
} finally {
    if (server?.listening) {
        server.closeAllConnections();
        await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
    }
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith("moggcord-compiler-smoke-"));
    await rm(directory, { recursive: true, force: true });
}
