/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../web/community-install.js", import.meta.url), "utf8");
const data = { install_manifest: "/api/install/17677319-0fd4-4c42-a3cc-b71413be0bf5", sha256: "a".repeat(64) };
const unavailable = { ok: false, json: async () => ({ code: "target_unavailable", error: "Moggcord was found in multiple Discord installations (stable, ptb). Choose one with --channel." }) };

test("target detection errors reach the website without launching or retrying the connector", async () => {
    let requests = 0, launches = 0;
    const window = {};
    runInNewContext(source, { window, location: { origin: "https://moggcord.cc" }, URL, AbortSignal, setTimeout,
        fetch: async () => { requests++; return unavailable; } });
    await assert.rejects(window.moggcordInstaller.install(data, () => {}, { open: () => { launches++; } }), error => {
        assert.equal(error.code, "target_unavailable");
        assert.match(error.message, /multiple Discord installations \(stable, ptb\)/);
        return true;
    });
    assert.equal(requests, 1);
    assert.equal(launches, 0);
});

test("a target error after launching the connector stops polling and retains its message", async () => {
    let requests = 0, launches = 0;
    const window = {};
    runInNewContext(source, { window, location: { origin: "https://moggcord.cc" }, URL, AbortSignal,
        setTimeout: callback => { callback(); },
        fetch: async () => { if (++requests === 1) throw new Error("Connection refused"); return unavailable; } });
    await assert.rejects(window.moggcordInstaller.install(data, () => {}, { open: () => { launches++; } }), error => {
        assert.equal(error.code, "target_unavailable");
        assert.match(error.message, /Choose one with --channel/);
        return true;
    });
    assert.equal(requests, 2);
    assert.equal(launches, 1);
});

test("a first compiler preparation can finish after the old polling limit without reporting a failed installation", async () => {
    let polls = 0, changes = 0;
    const window = { dispatchEvent: () => { changes++; } };
    runInNewContext(source, { window, location: { origin: "https://moggcord.cc" }, URL, AbortSignal,
        CustomEvent: class {}, setTimeout: callback => { callback(); },
        fetch: async url => ({ ok: true, json: async () => url.endsWith('/status') ? { name:'moggcord-community',protocol:1 }
            : url.endsWith('/install') ? { id:'108a4d20-ff34-48cb-ac50-9d864afdbab1' }
                : ++polls > 500 ? { state:'complete' } : { state:'building',message:'Preparing the compiler for your Moggcord version…' } }) });
    assert.equal(await window.moggcordInstaller.install(data), true);
    assert.equal(polls, 501);
    assert.equal(changes, 1);
});

test("first startup can prepare the private runtime before the local service becomes available", async () => {
    let connections = 0, launches = 0;
    const window = { dispatchEvent: () => {} };
    runInNewContext(source, { window, location: { origin: "https://moggcord.cc" }, URL, AbortSignal,
        CustomEvent: class {}, setTimeout: callback => { callback(); },
        fetch: async url => {
            if (url.endsWith('/status') && ++connections <= 50) throw new Error("Connection refused");
            return { ok: true, json: async () => url.endsWith('/status') ? { name:'moggcord-community',protocol:1 }
                : url.endsWith('/install') ? { id:'108a4d20-ff34-48cb-ac50-9d864afdbab1' } : { state:'complete' } };
        } });
    assert.equal(await window.moggcordInstaller.install(data, () => {}, { open: () => { launches++; } }), true);
    assert.equal(connections, 51);
    assert.equal(launches, 1);
});
