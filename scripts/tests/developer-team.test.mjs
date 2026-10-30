/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

const ids = ["95630197306433536", "124942147727261696", "726084725441036310"];
const compiled = await build({ entryPoints: ["src/components/settings/tabs/vencord/DeveloperTeam.tsx"], bundle: true, platform: "node", format: "cjs", write: false, external: ["@components/*", "@utils/*", "@webpack/common"], loader: { ".css": "empty" } });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

function mount(fetcher) {
    const users = new Map(), calls = [], warnings = [], states = [], effects = [], intervals = new Map(), listeners = new Map();
    const document = { hidden: false }; let cursor = 0, mounted = false, writes = 0;
    const React = {
        createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity).filter(child => child != null && child !== false) }),
        useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; writes++; }]; },
        useEffect: callback => { if (!mounted) effects.push(callback); }
    };
    const UserStore = { getUser: id => users.get(id) };
    const dependencies = {
        "@components/Card": { Card: "Card" }, "@components/Heading": { Heading: "Heading" }, "@components/Paragraph": { Paragraph: "Paragraph" }, "@components/Icons": { OwnerCrownIcon: "Crown" },
        "@components/ErrorBoundary": { __esModule: true, default: { wrap: callback => callback } },
        "@utils/css": { classNameFactory: prefix => name => prefix + name },
        "@utils/Logger": { Logger: class { warn(...args) { warnings.push(args); } } },
        "@utils/discord": { fetchUserProfile: async (...args) => { calls.push(args); return fetcher?.(args[0], users); } },
        "@webpack/common": { React, Avatar: "Avatar", UserStore, useStateFromStores: (stores, callback) => { assert.equal(stores[0], UserStore); return callback(); } }
    };
    const context = {
        exports: {}, module: { exports: {} }, require: name => { assert(name in dependencies, name); return dependencies[name]; }, document,
        window: { addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name); } },
        setInterval: (callback, delay) => { assert.equal(delay, 60_000); intervals.set(1, callback); return 1; }, clearInterval: id => intervals.delete(id)
    };
    vm.runInNewContext(compiled.outputFiles[0].text, context);
    const render = () => { cursor = 0; return context.module.exports.default(); };
    const first = render(); mounted = true; const cleanup = effects.map(callback => callback());
    return { first, render, users, calls, warnings, intervals, listeners, document, writes: () => writes, unmount: () => cleanup.forEach(callback => callback()) };
}

function nodes(tree, type) {
    if (typeof tree !== "object" || !tree) return [];
    return [...(tree.type === type ? [tree] : []), ...tree.children.flatMap(child => nodes(child, type))];
}
const text = tree => typeof tree === "string" ? tree : tree?.children?.map(text).join("") ?? "";
function user(id, name, avatar) {
    return { id, globalName: name, username: `account-${id}`, getAvatarURL: (guild, size, animated) => { assert.equal(guild, undefined); assert.equal(size, 128); assert.equal(animated, true); return `fixture://${id}/${avatar}`; } };
}

test("team uses the exact Discord IDs, refreshes cached profiles and displays current names and animated avatars with Owner only", async () => {
    const s = mount(async (id, users) => users.set(id, user(id, `Current ${id}`, "new.gif")));
    await flush();
    assert.deepEqual(s.calls.map(args => Array.from(args)), ids.map(id => [id, undefined, false]));
    let tree = s.render(); assert.equal(nodes(tree, "Card").length, 3);
    assert.deepEqual(nodes(tree, "Heading").filter(node => node.props.tag === "h4").map(text), ["Owner", "Owner", "Owner"]);
    assert.deepEqual(nodes(tree, "Avatar").map(node => node.props.src), ids.map(id => `fixture://${id}/new.gif`));
    assert(text(tree).includes(`Current ${ids[0]}`)); assert(!text(tree).includes("Main Developer")); assert(!text(tree).includes("Co-Owner"));
    s.users.set(ids[0], user(ids[0], "Changed display name", "changed.gif")); tree = s.render();
    assert(text(tree).includes("Changed display name")); assert.equal(nodes(tree, "Avatar")[0].props.src, `fixture://${ids[0]}/changed.gif`);
    s.unmount();
});

test("one unavailable Discord profile keeps the other owners visible and shows the missing account ID", async () => {
    const s = mount(async (id, users) => { if (id === ids[1]) throw new Error("Unavailable"); users.set(id, user(id, id, "avatar.png")); });
    await flush(); const tree = s.render();
    assert.equal(nodes(tree, "Card").length, 3); assert.equal(nodes(tree, "Avatar").filter(node => node.props.src).length, 2);
    assert(text(tree).includes("Discord profile unavailable")); assert(text(tree).includes(ids[1])); assert.equal(s.warnings.length, 1);
    s.unmount();
});

test("visible teams refresh every minute and on focus; hidden windows and unmounted teams stop polling", async () => {
    const s = mount(); await flush(); assert.equal(s.calls.length, 3);
    s.document.hidden = true; s.intervals.get(1)(); await flush(); assert.equal(s.calls.length, 3);
    s.document.hidden = false; s.intervals.get(1)(); await flush(); assert.equal(s.calls.length, 6);
    s.listeners.get("focus")(); await flush(); assert.equal(s.calls.length, 9);
    s.unmount(); assert.equal(s.intervals.size, 0); assert.equal(s.listeners.size, 0);
});

test("overlapping refreshes are skipped and late responses cannot update an unmounted team", async () => {
    let finish; const pending = new Promise(resolve => { finish = resolve; }); const s = mount(() => pending);
    s.intervals.get(1)(); s.listeners.get("focus")(); assert.equal(s.calls.length, 3);
    s.unmount(); const writes = s.writes(); finish(); await flush(); assert.equal(s.writes(), writes);
});
