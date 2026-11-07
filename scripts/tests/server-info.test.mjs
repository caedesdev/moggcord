/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";

const compiled = await transform(await readFile("src/plugins/serverInfo/GuildInfoModal.tsx", "utf8"), { loader: "tsx", format: "cjs" });
const modalLookup = await transform(await readFile("src/webpack/common/modals.ts", "utf8"), { loader: "ts", format: "cjs" });

test("the shared modal resolves the standalone dialog instead of another component exported as Modal", () => {
    function unrelatedModal(props) {
        return props.rows.length;
    }
    function standaloneModal(props) {
        const { actionBarInputLayout: layout = "default", scrollerRef: ref } = props;
        return { ...props, layout, ref, actionsFullWidth: props.actionBarInput == null };
    }
    const modules = [{ Modal: unrelatedModal }, { a: standaloneModal }];
    const webpack = {
        findExportedComponentLazy: name => modules.find(module => module[name])?.[name],
        findComponentByCodeLazy: (...parts) => modules.flatMap(Object.values).find(component => parts.every(part => component.toString().includes(part))),
        findByCodeLazy: () => () => {},
        filters: { byCode: () => () => true },
        mapMangledModuleLazy: () => ({})
    };
    const module = { exports: {} };
    vm.runInNewContext(modalLookup.code, { module, exports: module.exports, require: name => {
        assert.equal(name, "@webpack");
        return webpack;
    } });
    const props = { title: "Server Info", children: "Server details", onClose() {} };
    const dialog = module.exports.Modal(props);
    assert.equal(dialog.title, "Server Info");
    assert.equal(dialog.children, "Server details");
    assert.equal(dialog.onClose, props.onClose);
});

function setup(initialRoles) {
    let roles = initialRoles;
    let renderModal;
    let fallback;
    const subscriptions = [];
    const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
    const guild = { id: "123", name: "Test server", ownerId: "owner" };
    const modalProps = { transitionState: 1, onClose() {} };
    const roleStore = { getSortedRoles: () => roles };
    const imports = {
        "./styles.css": {},
        "@components/ErrorBoundary": { wrap: (Component, options) => {
            fallback = options.fallback;
            return props => createElement(Component, props);
        } },
        "@components/Heading": { Heading: "heading" },
        "@components/Paragraph": { Paragraph: "paragraph" },
        "@utils/css": { classNameFactory: prefix => name => prefix + name },
        "@utils/discord": { getGuildAcronym: () => "TS" },
        "@utils/misc": { classes: (...values) => values.filter(Boolean).join(" ") },
        "@utils/react": { useAwaiter: () => [null] },
        "@webpack": { findComponentByCodeLazy: () => "friend-row", findCssClassesLazy: () => ({}) },
        "@webpack/common": {
            Forms: { FormTitle: "heading", FormText: "paragraph" },
            GuildChannelStore: { getChannels: () => ({ count: 4 }) },
            GuildRoleStore: roleStore,
            IconUtils: {},
            Modal: "modal",
            openModal: render => { renderModal = render; },
            SnowflakeUtils: { extractTimestamp: () => 0 },
            TabBar: Object.assign(() => null, { Item: "tab" }),
            Timestamp: "timestamp",
            useEffect() {},
            useState: initial => [initial, () => {}],
            useStateFromStores: (stores, select) => { subscriptions.push(stores); return select(); }
        },
        ".": { settings: { store: { sorting: "none" } } }
    };
    const module = { exports: {} };
    vm.runInNewContext(compiled.code, { module, exports: module.exports, React: { createElement }, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    module.exports.openGuildInfoModal(guild);

    function render(element) {
        if (Array.isArray(element)) return element.map(render);
        if (!element || typeof element !== "object") return element;
        if (typeof element.type === "function") return render(element.type(element.props));
        return { ...element, props: { ...element.props, children: render(element.props.children) } };
    }

    function field(element, label) {
        if (!element || typeof element !== "object") return undefined;
        if (Array.isArray(element)) {
            for (const child of element) {
                const value = field(child, label);
                if (value !== undefined) return value;
            }
            return undefined;
        }
        const children = element.props?.children;
        if (children?.[0]?.type === "heading" && children[0].props.children[0] === label) {
            const value = children[1];
            return value?.type === "span" ? value.props.children[0] : value;
        }
        return field(children, label);
    }

    return {
        subscriptions, roleStore, modalProps,
        setRoles(value) { roles = value; },
        render: () => render(renderModal(modalProps)),
        roleCount: tree => field(tree, "Roles"),
        renderFallback: () => render(fallback({ wrappedProps: { guild, modalProps }, error: new Error("Failed") }))
    };
}

test("opening Server Info tolerates a role list that is not cached yet", () => {
    const state = setup(undefined);
    const modal = state.render();
    assert.equal(modal.type, "modal");
    assert.equal(state.roleCount(modal), "Loading...");
    assert.equal(modal.props.onClose, state.modalProps.onClose);
});

test("role counts exclude everyone and never become negative for an empty list", () => {
    for (const [roles, count] of [[[], 0], [[{ id: "everyone" }], 0], [[{ id: "everyone" }, { id: "member" }], 1]]) {
        const state = setup(roles);
        assert.equal(state.roleCount(state.render()), count);
    }
});

test("Server Info subscribes to role changes so the loading count can recover", () => {
    const state = setup(undefined);
    assert.equal(state.roleCount(state.render()), "Loading...");
    assert(state.subscriptions.some(stores => stores.includes(state.roleStore)));
    state.setRoles([{ id: "everyone" }, { id: "member" }]);
    assert.equal(state.roleCount(state.render()), 1);
});

test("unexpected info errors have a closable modal fallback instead of escaping into Discord", () => {
    const state = setup([]);
    const fallback = state.renderFallback();
    assert.equal(fallback.type, "modal");
    assert.equal(fallback.props.title, "Server Info");
    assert.equal(fallback.props.onClose, state.modalProps.onClose);
    assert.match(fallback.props.children[0].props.children[0], /could not be loaded/);
});
