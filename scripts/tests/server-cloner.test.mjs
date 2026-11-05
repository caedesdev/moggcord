/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { transform } from "esbuild";

async function cloner({ owner = true, confirmed = true, failDelete = false, cancelAfterFirst = false } = {}) {
    const source = await readFile("src/moggcordplugins/serverCloner/index.tsx", "utf8");
    const file = ts.createSourceFile("serverCloner.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const functions = new Set(["hasAdmin", "cleanupMode", "validateTarget", "prepareCleanup", "executeCleanup", "notifyListeners", "persistLog", "persistProgress", "persistRunning", "cancelClone", "cloneServer", "ServerClonerUI", "CleanupConfirmation"]);
    const variables = new Set(["ADMIN_BIT", "DELETE_DELAY_MS", "CLEANUP_MODES", "_running", "_operation", "_cancelled", "_progress", "_logs", "_listeners"]);
    const statements = file.statements.filter(node => ts.isFunctionDeclaration(node)
        ? functions.has(node.name?.text)
        : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => variables.has(d.name.getText(file))));
    const { code } = await transform(statements.map(node => node.getText(file)).join("\n")
        + "\nexport { cleanupMode, prepareCleanup, executeCleanup, cloneServer, ServerClonerUI, CleanupConfirmation, cancelClone }; export const status = () => ({ running: _running, progress: _progress, logs: _logs });", { loader: "tsx", format: "cjs" });
    const calls = [], logs = [], progress = [], confirmations = [];
    const guilds = {
        source: { id: "source", name: "Alpha source", ownerId: "someone" },
        target: { id: "target", name: "Target server", ownerId: owner ? "actor" : "someone" },
        viewer: { id: "viewer", name: "Read only", ownerId: "someone" }
    };
    const permissions = { target: 8n, source: 0n, viewer: 0n };
    const roles = [
        { id: "target", name: "@everyone", managed: false, position: 0 },
        { id: "low", name: "Low role", managed: false, position: 1 },
        { id: "managed", name: "Integration", managed: true, position: 2 },
        { id: "admin", name: "Own admin role", managed: false, position: 10 },
        { id: "higher", name: "Higher role", managed: false, position: 20 }
    ];
    const channels = [
        { id: "target-channel", guild_id: "target", name: "general", type: 0 },
        { id: "target-category", guild_id: "target", name: "Category", type: 4 },
        { id: "source-channel", guild_id: "source", name: "Source channel", type: 0 }
    ];
    const hooks = [];
    let cursor = 0, pending = [], dirty = false, tokenReads = 0, memberAvailable = true, api;
    const React = {
        createElement(type, props, ...children) { return { type, props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) } }; },
        useState(initial) {
            const slot = cursor++;
            if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
            return [hooks[slot], value => { hooks[slot] = typeof value === "function" ? value(hooks[slot]) : value; dirty = true; }];
        },
        useRef(initial) { const slot = cursor++; return hooks[slot] ??= { current: initial }; },
        useId() { const slot = cursor++; return hooks[slot] ??= `cloner-${slot}`; },
        useMemo(factory, deps) {
            const slot = cursor++;
            if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot].deps[i])) hooks[slot] = { value: factory(), deps };
            return hooks[slot].value;
        },
        useEffect(effect, deps) {
            const slot = cursor++;
            if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot][i])) { hooks[slot] = deps; pending.push(effect); }
        }
    };
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, Error, React, useState: React.useState, useRef: React.useRef, useMemo: React.useMemo,
        useStateFromStores: (_stores, factory) => factory(), cl: (...names) => names.map(name => `sc-${name}`).join(" "),
        GuildStore: { getGuild: id => guilds[id], getGuilds: () => guilds },
        UserStore: { getCurrentUser: () => ({ id: "actor" }) },
        PermissionStore: { getGuildPermissions: guild => permissions[guild.id] ?? 0n },
        GuildMemberStore: { getMember: () => memberAvailable ? { roles: ["admin"] } : null },
        apiCall: async (method, url, body) => {
            calls.push({ method, url, body });
            if (method === "get" && url === "/guilds/target/channels") return channels;
            if (method === "get" && url === "/guilds/target/roles") return roles;
            if (method === "del") {
                if (failDelete) throw new Error("Fixture permission failure");
                if (cancelAfterFirst) api.cancelClone();
                return {};
            }
            assert.fail(`Unexpected API operation: ${method} ${url}`);
        },
        wait: async () => {}, getToken: () => { tokenReads++; return "fixture"; },
        confirmCleanup: async plan => { confirmations.push(plan); return confirmed; },
        Toasts: { show() {}, Type: { SUCCESS: "success", FAILURE: "failure" }, genId: () => "fixture" },
        SearchableSelect: "SearchableSelect", GuildSummary: "GuildSummary", GuildIcon: "GuildIcon",
        Heading: "Heading", Divider: "Divider", FormSwitch: "FormSwitch", Button: "Button",
        ModalRoot: "ModalRoot", ModalHeader: "ModalHeader", ModalContent: "ModalContent", ModalFooter: "ModalFooter", ModalCloseButton: "ModalCloseButton", ModalSize: { MEDIUM: "medium" }
    });
    api = module.exports;
    const nodes = (tree, predicate) => !tree || typeof tree !== "object" ? [] : [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(child => nodes(child, predicate))];
    const state = {
        api, calls, logs, progress, confirmations, guilds, permissions, roles, channels,
        memberMissing: () => { memberAvailable = false; },
        tokenReads: () => tokenReads,
        tree: null,
        render() {
            for (let pass = 0; pass < 5; pass++) {
                cursor = 0; pending = []; dirty = false;
                state.tree = api.ServerClonerUI({ initialSourceId: "source" });
                for (const effect of pending) effect();
                if (!dirty) return state;
            }
            assert.fail("Cloner UI did not settle");
        },
        renderConfirmation(plan, confirm) {
            cursor = 0;
            state.tree = api.CleanupConfirmation({ rootProps: { onClose() {} }, plan, cloning: false, confirm });
            return state;
        },
        find: predicate => nodes(state.tree, predicate),
        pickers: () => state.find(node => node.type === "SearchableSelect"),
        button: label => state.find(node => node.type === "Button" && node.props.children.includes(label))[0],
        chooseMode(mode) { state.find(node => node.type === "input" && node.props.value === mode)[0].props.onChange(); return state.render(); },
        chooseTarget(id = "target") { state.pickers()[1].props.onChange(id); return state.render(); }
    };
    return state;
}

test("cleanup modes do not depend on whether role or channel copying is enabled", async () => {
    const { api } = await cloner();
    for (const [clearRoles, noDeleteChannels, expected] of [[false, true, "none"], [false, false, "channels"], [true, true, "roles"], [true, false, "both"]])
        assert.equal(api.cleanupMode({ roles: false, channels: false, clearRoles, noDeleteChannels }), expected);
});

test("cleanup planning reads only the selected target and excludes unrelated channels and managed roles", async () => {
    const state = await cloner();
    const plan = await state.api.prepareCleanup("source", "target", "both");
    assert.deepEqual(Array.from(plan.channels, channel => channel.id), ["target-channel", "target-category"]);
    assert.deepEqual(Array.from(plan.roles, role => role.id), ["low", "admin", "higher"]);
    assert.equal(plan.protectedRoles, 2);
    assert(state.calls.every(call => call.method === "get" && call.url.startsWith("/guilds/target/")));
});

test("non-owners keep their own top role, higher roles, managed roles and everyone", async () => {
    const state = await cloner({ owner: false });
    const plan = await state.api.prepareCleanup("source", "target", "roles");
    assert.deepEqual(Array.from(plan.roles, role => role.id), ["low"]);
    assert.equal(plan.protectedRoles, 4);
});

test("same-server and missing-admin cleanup requests fail before any API access", async () => {
    const state = await cloner({ owner: false });
    await assert.rejects(state.api.prepareCleanup("target", "target", "both"), /different/);
    state.permissions.target = 0n;
    await assert.rejects(state.api.prepareCleanup("source", "target", "channels"), /Administrator/);
    assert.equal(state.calls.length, 0);
});

test("role cleanup fails closed if the non-owner role hierarchy is unavailable", async () => {
    const state = await cloner({ owner: false });
    state.memberMissing();
    await assert.rejects(state.api.prepareCleanup("source", "target", "roles"), /role information/);
    assert(state.calls.every(call => call.method === "get"));
});

test("channel-only cleanup never deletes roles or anything on the source", async () => {
    const state = await cloner();
    const plan = await state.api.prepareCleanup("source", "target", "channels");
    const result = await state.api.executeCleanup(plan, entry => state.logs.push(entry), value => state.progress.push(value));
    assert.equal(result.channels, 2);
    assert.equal(result.roles, 0);
    assert.deepEqual(state.calls.filter(call => call.method === "del").map(call => call.url), ["/channels/target-channel", "/channels/target-category"]);
    assert.equal(state.progress.at(-1), 100);
});

test("cleanup stops when cancelled and does not continue into role deletion", async () => {
    const state = await cloner({ cancelAfterFirst: true });
    const plan = await state.api.prepareCleanup("source", "target", "both");
    const result = await state.api.executeCleanup(plan, entry => state.logs.push(entry), () => {});
    assert.equal(result.cancelled, true);
    assert.equal(state.calls.filter(call => call.method === "del").length, 1);
    assert.equal(result.roles, 0);
});

test("permissions are checked again after preview and before deleting", async () => {
    const state = await cloner({ owner: false });
    const plan = await state.api.prepareCleanup("source", "target", "channels");
    state.permissions.target = 0n;
    await assert.rejects(state.api.executeCleanup(plan, () => {}, () => {}), /Administrator/);
    assert.equal(state.calls.filter(call => call.method === "del").length, 0);
});

test("failed deletions are counted and stop the clone from copying afterwards", async () => {
    const state = await cloner({ failDelete: true });
    const plan = await state.api.prepareCleanup("source", "target", "roles");
    const options = { clearRoles: true, noDeleteChannels: true, roles: false, channels: false, permissions: false, icon: false, emojis: false, embeds: false, guildSettings: true };
    await state.api.cloneServer("source", "target", options, entry => state.logs.push(entry), () => {}, plan);
    assert(state.logs.some(entry => /did not finish successfully/.test(entry.text)));
    assert(state.calls.every(call => call.method === "get" || call.method === "del"));
});

test("the UI defaults to keeping content and exposes searchable server icons with an admin-only target list", async () => {
    const state = (await cloner()).render();
    const [source, target] = state.pickers();
    assert.equal(source.props.options.length, 3);
    assert.deepEqual(Array.from(target.props.options, option => option.value), ["target"]);
    assert.equal(typeof source.props.renderOptionPrefix, "function");
    assert.equal(typeof target.props.renderOptionPrefix, "function");
    assert.deepEqual(Array.from(source.props.filter(source.props.options, "ALPHA"), option => option.value), ["source"]);
    assert.deepEqual(Array.from(source.props.filter(source.props.options, "target"), option => option.value), ["target"]);
    assert(state.find(node => node.type === "input" && node.props.value === "none")[0].props.checked);
    assert.equal(state.button("Clean up only").props.disabled, true);
    assert.equal(state.calls.length, 0);
});

test("cancelling cleanup confirmation leaves all server content unchanged", async () => {
    const state = (await cloner({ confirmed: false })).render().chooseTarget().chooseMode("both");
    await state.button("Clean up only").props.onClick();
    assert.equal(state.confirmations.length, 1);
    assert.equal(state.calls.filter(call => call.method !== "get").length, 0);
    assert.equal(state.tokenReads(), 0);
});

test("Clean up only never starts cloning or copies content", async () => {
    const state = (await cloner()).render().chooseTarget().chooseMode("both");
    await state.button("Clean up only").props.onClick();
    assert.equal(state.confirmations.length, 1);
    assert.equal(state.calls.filter(call => call.method === "del").length, 5);
    assert(state.calls.every(call => call.method === "get" || call.method === "del"));
    assert.equal(state.tokenReads(), 0);
    assert.equal(state.api.status().running, false);
});

test("destructive confirmation requires the selected target server name", async () => {
    const state = await cloner();
    const plan = await state.api.prepareCleanup("source", "target", "both");
    let confirmed = 0;
    const confirm = () => { confirmed++; };
    state.renderConfirmation(plan, confirm);
    assert.equal(state.button("Delete selected content").props.disabled, true);
    state.find(node => node.type === "input")[0].props.onChange({ target: { value: "Alpha source" } });
    state.renderConfirmation(plan, confirm);
    assert.equal(state.button("Delete selected content").props.disabled, true);
    state.find(node => node.type === "input")[0].props.onChange({ target: { value: "Target server" } });
    state.renderConfirmation(plan, confirm);
    assert.equal(state.button("Delete selected content").props.disabled, false);
    state.button("Delete selected content").props.onClick();
    assert.equal(confirmed, 1);
    assert(state.calls.every(call => call.method === "get"));
});

test("cloning cannot run a cleanup plan for a different target or mode", async () => {
    const state = await cloner();
    const options = { clearRoles: true, noDeleteChannels: true, roles: false, channels: false, permissions: false, icon: false, emojis: false, embeds: false, guildSettings: true };
    await assert.rejects(state.api.cloneServer("source", "target", options, () => {}, () => {}), /Confirm/);
    const plan = await state.api.prepareCleanup("source", "target", "channels");
    await assert.rejects(state.api.cloneServer("source", "target", options, () => {}, () => {}, plan), /Confirm/);
    assert(state.calls.every(call => call.method === "get"));
});
