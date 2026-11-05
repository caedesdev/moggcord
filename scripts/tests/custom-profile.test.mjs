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

async function editor() {
    const source = await readFile("src/moggcordplugins/customProfile/index.tsx", "utf8");
    const file = ts.createSourceFile("customProfile.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const statements = file.statements.filter(node => ts.isFunctionDeclaration(node)
        ? node.name?.text === "CustomProfileModal"
        : ts.isVariableStatement(node) && node.declarationList.declarations.some(d => d.name.getText(file) === "PROFILE_TABS"));
    const { code } = await transform(statements.map(node => node.getText(file)).join("\n")
        + "\nexport { CustomProfileModal }; export const saved = () => ({ allAccountsData, allAccountsEnabled });", { loader: "tsx", format: "cjs" });
    const hooks = [], writes = [];
    let cursor = 0, pending = [], dirty = false, closes = 0;
    const React = {
        Fragment: "Fragment",
        createElement(type, props, ...children) {
            return { type, props: { ...props, children: children.flat(Infinity).filter(value => value != null && value !== false) } };
        },
        useState(initial) {
            const slot = cursor++;
            if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
            return [hooks[slot], value => { hooks[slot] = typeof value === "function" ? value(hooks[slot]) : value; dirty = true; }];
        },
        useMemo(factory, deps) {
            const slot = cursor++;
            if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot].deps[i])) hooks[slot] = { value: factory(), deps };
            return hooks[slot].value;
        },
        useEffect(effect, deps) {
            const slot = cursor++;
            if (!hooks[slot] || deps.some((value, i) => value !== hooks[slot][i])) { hooks[slot] = deps; pending.push(effect); }
        },
        useId() { return `profile-panel-${cursor++}`; }
    };
    const TabBar = Object.assign(() => null, { Item: "TabItem" });
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, React, TabBar, t: value => value, cl: name => `cp-${name}`,
        AuthenticationStore: { getId: () => "self" },
        UserStore: { getCurrentUser: () => ({ id: "self", username: "Self" }) },
        window: { Vencord: { Webpack: { findByProps: () => ({ getUsers: () => [{ id: "self" }, { id: "other" }] }) } } },
        allAccountsData: { self: { bio: "Original" }, other: { bio: "Other original" } },
        allAccountsEnabled: { self: true, other: true }, storedData: {}, isEnabled: true,
        cachedFakeUser: null, cachedOriginalUser: null, _trueOriginalUser: null, _dataVersion: 0,
        saveDataSync() {}, saveAllDataSync() {}, updateCachedRealData() {}, forceAccountPanelRerender() {},
        DataStore: { set: async (...args) => { writes.push(args); } },
        DS_ALL_DATA: "profiles", DS_ALL_ENABLED: "enabled", DS_KEY: "profile", DS_ENABLED: "profile-enabled",
        ModalSize: { MEDIUM: "medium" },
        ModalRoot: "ModalRoot", ModalHeader: "ModalHeader", ModalContent: "ModalContent", ModalFooter: "ModalFooter", ModalCloseButton: "ModalCloseButton",
        Select: "Select", Field: "Field", ImageUpload: "ImageUpload", Toggle: "Toggle", BadgePicker: "BadgePicker", SectionLabel: "SectionLabel",
        EditIcon: "EditIcon", CloseIcon: "CloseIcon", TrashIcon: "TrashIcon", SaveIcon: "SaveIcon",
        AVATAR_DECORATIONS: [{ id: "decoration", label: "Fixture decoration" }], getDecorationUrl: id => `fixture:${id}`
    });
    const nodes = (tree, predicate) => {
        if (!tree || typeof tree !== "object") return [];
        return [...(predicate(tree) ? [tree] : []), ...(tree.props?.children ?? []).flatMap(child => nodes(child, predicate))];
    };
    const state = {
        tree: null, writes,
        render() {
            for (let pass = 0; pass < 5; pass++) {
                cursor = 0; pending = []; dirty = false;
                state.tree = module.exports.CustomProfileModal({ rootProps: { onClose: () => { closes++; } } });
                for (const effect of pending) effect();
                if (!dirty) return state;
            }
            assert.fail("Editor did not settle after rendering");
        },
        find: predicate => nodes(state.tree, predicate),
        type: type => state.find(node => node.type === type)[0],
        field: label => state.find(node => node.type === "Field" && node.props.label === label)[0],
        tab(id) { state.find(node => node.type === TabBar)[0].props.onItemSelect(id); return state.render(); },
        button: suffix => state.find(node => node.type === "button" && node.props.className?.includes(`cp-btn-${suffix}`))[0],
        saved: () => JSON.parse(JSON.stringify(module.exports.saved())),
        closes: () => closes
    };
    return state.render();
}

test("profile tabs show one category while keeping account selection and actions available", async () => {
    const state = await editor();
    assert.deepEqual(state.find(node => node.type === "TabItem").map(node => node.props.id), ["info", "badges", "appearance", "decorations"]);
    assert(state.field("Username"));
    assert.equal(state.type("BadgePicker"), undefined);
    for (const tab of ["badges", "appearance", "decorations"]) {
        state.tab(tab);
        assert.equal(state.field("Username"), undefined);
        assert(state.type("Select"));
        assert(state.type("ModalFooter"));
        for (const action of ["primary", "danger", "ghost"]) assert(state.button(action));
        assert.equal(Boolean(state.type("BadgePicker")), tab === "badges");
        assert.equal(Boolean(state.type("Toggle")), tab === "appearance");
    }
});

test("profile drafts survive tab changes and Save retains changes from different categories", async () => {
    const state = await editor();
    state.field("Bio").props.onChange("Unpublished draft");
    state.tab("badges");
    state.type("BadgePicker").props.onChange(512);
    state.type("BadgePicker").props.onNitroType(1);
    state.tab("appearance");
    assert.equal(state.type("Toggle").props.checked, true);
    state.find(node => node.type === "ImageUpload" && node.props.label === "Banner")[0].props.onChange("fixture:banner");
    state.tab("decorations");
    state.find(node => node.type === "button" && node.props.title === "Fixture decoration")[0].props.onClick();
    state.tab("info");
    assert.equal(state.field("Bio").props.value, "Unpublished draft");
    assert.equal(state.writes.length, 0);
    await state.button("primary").props.onClick();
    const saved = state.saved().allAccountsData.self;
    assert.equal(saved.bio, "Unpublished draft");
    assert.equal(saved.badgeFlags, 512);
    assert.equal(saved.nitroLevel, 1);
    assert.equal(saved.nitro, true);
    assert.equal(saved.banner, "fixture:banner");
    assert.equal(saved.decorationAsset, "decoration");
    assert.equal(state.closes(), 1);
});

test("saving another account from a different tab does not replace the active account profile", async () => {
    const state = await editor();
    state.type("Select").props.select("other");
    state.render();
    assert.equal(state.field("Bio").props.value, "Other original");
    state.field("Bio").props.onChange("Other edited");
    state.tab("badges");
    await state.button("primary").props.onClick();
    assert.equal(state.saved().allAccountsData.other.bio, "Other edited");
    assert.equal(state.saved().allAccountsData.self.bio, "Original");
});

test("Cancel from another tab leaves the saved profile untouched", async () => {
    const state = await editor();
    state.field("Bio").props.onChange("Discard this");
    state.tab("decorations");
    state.button("ghost").props.onClick();
    assert.equal(state.writes.length, 0);
    assert.equal(state.saved().allAccountsData.self.bio, "Original");
    assert.equal(state.closes(), 1);
});
