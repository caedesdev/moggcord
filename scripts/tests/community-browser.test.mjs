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
const entry = { id: "17677319-0fd4-4c42-a3cc-b71413be0bf5", kind: "plugin", file_name: "example.ts", name: "Example" };
const response = body => ({ ok: true, json: async () => body });
const connectedStatus = { name: "moggcord-community", protocol: 1, capabilities: ["installed-status"] };

function installerWithPermissions(query, fetch, globals = {}) {
    const window = globals.window ?? { dispatchEvent() {} };
    runInNewContext(source, { window, location: { origin: "https://moggcord.cc" }, URL, AbortSignal,
        CustomEvent: class {}, navigator: { permissions: { query } }, setTimeout: callback => { callback(); }, fetch, ...globals });
    return window.moggcordInstaller;
}

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

test("automatic inspection and button refresh only contact Moggcord when local access is granted", async () => {
    for (const permission of ["prompt", "denied", "granted"]) {
        const intervals = [], listeners = new Map(), queries = [];
        let requests = 0;
        const window = { dispatchEvent() {}, setInterval: callback => { intervals.push(callback); return 1; }, clearInterval() {},
            addEventListener: (type, callback) => listeners.set(type, callback), removeEventListener: type => listeners.delete(type) };
        const installer = installerWithPermissions(async ({ name }) => { queries.push(name); return { state: permission }; }, async url => {
            requests++;
            return response(url.endsWith("/status") ? connectedStatus : { entries: [{ id: entry.id, installed: true, enabled: true }] });
        }, { window, document: { hidden: false, addEventListener() {}, removeEventListener() {} } });
        const result = await installer.inspect([entry]);
        if (permission === "granted") assert.equal(result[0].installed, true);
        else assert.equal(result, null);
        const button = { dataset: {}, title: "", querySelector: () => null, getAttribute: () => null, setAttribute() {}, classList: { toggle() {} } };
        const stop = installer.watchButtons([{ entry, button }]);
        await new Promise(resolve => setImmediate(resolve));
        intervals[0](); listeners.get("focus")();
        await new Promise(resolve => setImmediate(resolve));
        stop();
        assert(queries.length > 0);
        assert(queries.every(name => name === "loopback-network"));
        if (permission === "granted") assert(requests > 0);
        else assert.equal(requests, 0);
    }
});

test("a blocked local permission explains site settings without fetching or launching Moggcord", async () => {
    let requests = 0, launches = 0;
    const installer = installerWithPermissions(async () => ({ state: "denied" }), async () => { requests++; throw new Error("Must not fetch"); });
    await assert.rejects(installer.install(data, () => {}, { open: () => { launches++; } }), error => {
        assert.equal(error.code, "local_access_denied");
        assert.match(error.message, /site permissions.*allow access to apps and services on this device/);
        return true;
    });
    assert.equal(requests, 0);
    assert.equal(launches, 0);
});

test("an explicit download gives the permission prompt time to finish and installs after access is granted", async () => {
    let permission = "prompt", requests = 0, launches = 0;
    const timeouts = [], progress = [];
    const installer = installerWithPermissions(async () => ({ state: permission }), async url => {
        requests++;
        if (url.endsWith("/status")) { permission = "granted"; return response(connectedStatus); }
        return response(url.endsWith("/install") ? { id: "108a4d20-ff34-48cb-ac50-9d864afdbab1" } : { state: "complete" });
    }, { AbortSignal: { timeout: duration => { timeouts.push(duration); return {}; } } });
    assert.equal(await installer.install(data, text => progress.push(text), { open: () => { launches++; } }), true);
    assert.match(progress[0], /Choose Allow/);
    assert(timeouts[0] > 3000 && timeouts[0] <= 120000);
    assert.equal(requests, 3);
    assert.equal(launches, 0);
});

test("denied permission or an unanswered prompt timeout stops connector launch and polling", async () => {
    for (const afterFailure of ["denied", "prompt"]) {
        let permission = afterFailure === "prompt" ? "prompt" : "granted", requests = 0, launches = 0, pauses = 0;
        const installer = installerWithPermissions(async () => ({ state: permission }), async () => {
            requests++; permission = afterFailure;
            throw Object.assign(new Error("The browser blocked the request"), { name: afterFailure === "prompt" ? "TimeoutError" : "TypeError" });
        }, { setTimeout: callback => { pauses++; callback(); } });
        await assert.rejects(installer.install(data, () => {}, { open: () => { launches++; } }), error => {
            assert.equal(error.code, afterFailure === "denied" ? "local_access_denied" : "local_access_required");
            assert.match(error.message, /apps and services on this device/);
            return true;
        });
        assert.equal(requests, 1);
        assert.equal(launches, 0);
        assert.equal(pauses, 0);
    }
});

test("an undecided permission does not prevent waking Moggcord before its first successful connection", async () => {
    let permission = "prompt", awake = false, requests = 0, launches = 0;
    const timeouts = [];
    const installer = installerWithPermissions(async () => ({ state: permission }), async url => {
        requests++;
        if (url.endsWith("/status")) {
            if (!awake) throw new TypeError("Failed to fetch before a connection exists");
            permission = "granted";
            return response(connectedStatus);
        }
        return response(url.endsWith("/install") ? { id: "108a4d20-ff34-48cb-ac50-9d864afdbab1" } : { state: "complete" });
    }, { AbortSignal: { timeout: duration => { timeouts.push(duration); return {}; } } });
    assert.equal(await installer.install(data, () => {}, { open: () => { launches++; awake = true; } }), true);
    assert.equal(launches, 1);
    assert.equal(requests, 4);
    assert.equal(permission, "granted");
    assert(timeouts.slice(0, 2).every(duration => duration > 3000 && duration <= 120000));
});

test("a permission prompt that times out after connector wake is not retried repeatedly", async () => {
    let requests = 0, launches = 0, pauses = 0;
    const installer = installerWithPermissions(async () => ({ state: "prompt" }), async () => {
        if (++requests === 1) throw new TypeError("The service is not running yet");
        throw Object.assign(new Error("The permission prompt timed out"), { name: "TimeoutError" });
    }, { setTimeout: callback => { pauses++; callback(); } });
    await assert.rejects(installer.install(data, () => {}, { open: () => { launches++; } }), error => error.code === "local_access_required");
    assert.equal(requests, 2);
    assert.equal(launches, 1);
    assert.equal(pauses, 1);
});

test("permission revoked during connector wake stops at the next failed status request", async () => {
    let permission = "granted", requests = 0, launches = 0, pauses = 0;
    const installer = installerWithPermissions(async () => ({ state: permission }), async () => {
        if (++requests === 2) permission = "denied";
        throw new Error("Connection refused");
    }, { setTimeout: callback => { pauses++; callback(); } });
    await assert.rejects(installer.install(data, () => {}, { open: () => { launches++; } }), error => error.code === "local_access_denied");
    assert.equal(requests, 2);
    assert.equal(launches, 1);
    assert.equal(pauses, 1);
});

test("unknown permission support waits for an explicit download and never queries the legacy descriptor", async () => {
    for (const supportsQuery of [false, true]) {
        const queries = [];
        let requests = 0;
        const query = supportsQuery ? async ({ name }) => { queries.push(name); throw new TypeError("Unknown permission descriptor"); } : undefined;
        const installer = installerWithPermissions(query, async url => {
            requests++;
            if (url.endsWith("/status")) return response(connectedStatus);
            if (url.endsWith("/installed")) return response({ entries: [{ id: entry.id, installed: true, enabled: true }] });
            return response(url.endsWith("/install") ? { id: "108a4d20-ff34-48cb-ac50-9d864afdbab1" } : { state: "complete" });
        });
        assert.equal(await installer.inspect([entry]), null);
        assert.equal(requests, 0);
        assert.equal(await installer.install(data), true);
        assert.equal(requests, 3);
        assert.equal((await installer.inspect([entry]))[0].installed, true);
        assert.equal(requests, 5);
        assert(queries.every(name => name === "loopback-network"));
        assert.equal(queries.length > 0, supportsQuery);
    }
});
