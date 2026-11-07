/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const { code } = await transform(await readFile("src/plugins/_api/badges/moggcordBadgesApi.ts", "utf8"), { loader: "ts", format: "cjs" });

function setup(response = () => []) {
    const state = { calls: [], refreshes: [], profiles: 0, users: 0, now: 0 };
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports,
        Date: { now: () => state.now },
        AbortSignal: { timeout: timeout => ({ timeout }) },
        queueMicrotask: callback => state.refreshes.push(callback),
        fetch: async (url, options) => {
            state.calls.push({ url, options });
            return { ok: true, json: async () => response(url) };
        },
        require: name => {
            if (name === "@utils/Logger") return { Logger: class { warn() {} } };
            assert.equal(name, "@webpack/common");
            return { UserProfileStore: { emitChange: () => { state.profiles++; } }, UserStore: { emitChange: () => { state.users++; } } };
        }
    });
    return { ...module.exports, state, async settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); } };
}

test("repeated profile renders share badge requests and empty results do not refresh all users", async () => {
    const api = setup();
    for (let i = 0; i < 30; i++) api.getMoggcordApiBadges("user");
    assert.equal(api.state.calls.length, 1);
    await api.settle();
    assert.equal(api.getMoggcordApiBadges("user").length, 0);
    assert.equal(api.state.calls.length, 1);
    assert.equal(api.state.refreshes.length, 0);
    assert.equal(api.state.calls[0].options.signal.timeout, 10_000);
});

test("several profile results refresh stores once and keep cached badges available", async () => {
    const api = setup(url => [{ id: "owner", badge: "badge.png", tooltip: url.split("/").at(-1) }]);
    for (const user of ["one", "two", "three"]) api.getMoggcordApiBadges(user);
    await api.settle();
    assert.equal(api.state.refreshes.length, 1);
    api.state.refreshes.shift()();
    assert.equal(api.state.profiles, 1);
    assert.equal(api.state.users, 1);
    assert.equal(api.getMoggcordApiBadges("two")[0].tooltip, "two");
    assert.equal(api.state.calls.length, 3);
});

test("malformed badge entries do not break profile loading or leak invalid tooltips", async () => {
    const api = setup(url => url.endsWith("/api/data")
        ? { badges: { owner: { badge: "owner.png", tooltip: { invalid: true } } }, users: { user: [null, false, 3, { badgeId: "owner" }] } }
        : [null, false, { id: "valid", badge: "valid.png", tooltip: { invalid: true } }, { id: 1, badge: "bad.png" }]);
    await api.loadMoggcordBadgeData();
    assert.equal(api.getMoggcordApiBadges("user")[0].tooltip, "owner");
    api.getMoggcordApiBadges("other");
    await api.settle();
    assert.equal(api.getMoggcordApiBadges("other").length, 1);
    assert.equal(api.getMoggcordApiBadges("other")[0].tooltip, "valid");
});

test("long sessions release old profile results while frequently viewed users remain cached", async () => {
    const api = setup();
    api.getMoggcordApiBadges("recent");
    await api.settle();
    for (let i = 0; i < 1002; i++) {
        api.getMoggcordApiBadges("user-" + i);
        await api.settle();
        api.getMoggcordApiBadges("recent");
    }
    const calls = api.state.calls.length;
    api.getMoggcordApiBadges("recent");
    assert.equal(api.state.calls.length, calls);
    api.getMoggcordApiBadges("user-0");
    assert.equal(api.state.calls.length, calls + 1);
});
