/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import vm from "node:vm";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const compiled = await build({
    entryPoints: ["src/main/updater/download.ts"], bundle: true, platform: "node", format: "cjs", write: false,
    plugins: [{ name: "http-boundary", setup(builder) {
        builder.onResolve({ filter: /^@main\/utils\/http$/ }, args => ({ path: args.path, external: true }));
    } }], external: ["original-fs"]
});

async function fixture(t, { response, fastTimeouts = false } = {}) {
    const directory = fs.mkdtempSync(join(tmpdir(), "moggcord-download-test-"));
    const server = createServer(response ?? ((_request, reply) => reply.end("update")));
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const module = { exports: {} };
    vm.runInNewContext(compiled.outputFiles[0].text, {
        module, exports: module.exports, Buffer, AbortController, clearTimeout,
        setTimeout: (callback, delay) => setTimeout(callback, fastTimeouts ? (delay === 30_000 ? 50 : 500) : delay),
        require: name => name === "original-fs" ? fs : name === "@main/utils/http" ? {
            checkedFetch: async (url, options) => {
                const result = await fetch(url, options);
                if (!result.ok) throw new Error(`Update server returned ${result.status}`);
                return result;
            }
        } : require(name)
    });
    return { download: module.exports.downloadUpdateFile, file: join(directory, "update.zip"), url: `http://127.0.0.1:${server.address().port}`, controller: new AbortController() };
}

test("an HTTP update streams to disk and reports the actual transferred bytes", async t => {
    const data = Buffer.alloc(192 * 1024, 7);
    const state = await fixture(t, { response(_request, reply) {
        reply.writeHead(200, { "Content-Length": data.length });
        reply.write(data.subarray(0, 64 * 1024));
        setTimeout(() => reply.end(data.subarray(64 * 1024)), 15);
    } });
    const progress = [];
    await state.download(state.url, state.file, state.controller.signal, data.length, (bytes, total) => progress.push({ bytes, total }));
    assert.deepEqual(fs.readFileSync(state.file), data);
    assert.equal(progress[0].bytes, 0);
    assert.equal(progress.at(-1).bytes, data.length);
    assert(progress.some(value => value.bytes > 0 && value.bytes < data.length));
    assert(progress.every(value => value.total === data.length));
});

test("a stalled response fails within the idle time limit and allows a fresh retry", async t => {
    let requests = 0;
    const state = await fixture(t, { fastTimeouts: true, response(_request, reply) {
        requests++;
        if (requests === 1) { reply.writeHead(200); reply.write("partial"); }
        else reply.end("complete");
    } });
    await assert.rejects(state.download(state.url, state.file, state.controller.signal, null, () => {}), /stopped responding/);
    fs.rmSync(state.file, { force: true });
    await state.download(state.url, state.file, new AbortController().signal, 8, () => {});
    assert.equal(fs.readFileSync(state.file, "utf8"), "complete");
});

test("a server that sends no headers times out instead of leaving an update busy forever", async t => {
    const state = await fixture(t, { fastTimeouts: true, response() {} });
    await assert.rejects(state.download(state.url, state.file, state.controller.signal, null, () => {}), /stopped responding/);
    assert.equal(fs.existsSync(state.file), false);
});

test("cancelling an active update aborts the body stream and preserves the cancellation reason", async t => {
    const state = await fixture(t, { response(_request, reply) { reply.writeHead(200); reply.write("partial"); } });
    const reason = new Error("Download cancelled");
    reason.name = "AbortError";
    await assert.rejects(state.download(state.url, state.file, state.controller.signal, null, bytes => {
        if (bytes) state.controller.abort(reason);
    }), error => error === reason);
});

test("incomplete, oversized and unsuccessful update responses are never reported as complete", async t => {
    for (const [expected, status, pattern] of [[100, 200, /incomplete/], [2, 200, /size does not match/], [null, 503, /503/]]) {
        const state = await fixture(t, { response(_request, reply) { reply.writeHead(status); reply.end("update"); } });
        await assert.rejects(state.download(state.url, state.file, state.controller.signal, expected, () => {}), pattern);
    }
});

test("a write failure rejects the update instead of hanging on a broken file stream", async t => {
    const state = await fixture(t);
    await assert.rejects(state.download(state.url, join(dirname(state.file), "missing", "update.zip"), state.controller.signal, null, () => {}), /ENOENT/);
});
