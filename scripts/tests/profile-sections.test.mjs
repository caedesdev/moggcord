/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { transform } from "esbuild";
import { hash } from "@intrnl/xxhash64";

async function load(file, imports) {
    const { code } = await transform(await readFile(file, "utf8"), { loader: file.endsWith(".tsx") ? "tsx" : "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    return module.exports;
}

test("profile sections update live, retain user context, sort by priority and clean up subscriptions", async () => {
    let updates = 0;
    const cleanups = [];
    const api = await load("src/api/ProfileSections.tsx", {
        "@components/ErrorBoundary": "boundary",
        "@webpack/common": { React: {
            createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
            useReducer: () => [0, () => { updates++; }],
            useEffect: effect => cleanups.push(effect())
        } }
    });
    const render = props => { const root = api.renderProfileSections(props); return root.type(root.props); };
    const props = { userId: "self", isSideBar: true };
    assert.equal(render(props).length, 0);
    const first = () => null, second = () => null;
    api.addProfileSection("friends", first, 0);
    api.addProfileSection("voice", second, 10);
    assert.equal(updates, 2);
    const visible = render(props);
    assert.equal(visible[0].props.key, "voice");
    assert.equal(visible[1].props.key, "friends");
    assert.equal(visible[0].props.children[0].type, second);
    assert.equal(visible[0].props.children[0].props.userId, "self");
    assert.equal(visible[0].props.children[0].props.isSideBar, true);
    api.addProfileSection("voice", first, 10);
    assert.equal(render(props).length, 2);
    api.removeProfileSection("voice");
    assert.equal(render(props).length, 1);
    assert.equal(render({ userId: "other", isSideBar: false })[0].props.children[0].props.isSideBar, false);
    for (const cleanup of cleanups) cleanup();
    const previous = updates;
    api.removeProfileSection("friends");
    assert.equal(updates, previous);
    assert.equal(render(props).length, 0);
});

test("all profile panel variants inject sections with the correct account and sidebar flag", async () => {
    const intl = await load("src/utils/intlHash.ts", { "@intrnl/xxhash64": { hash } });
    const { canonicalizeMatch, canonicalizeReplace } = await load("src/utils/patches.ts", { "./intlHash": intl });
    const plugin = (await load("src/plugins/_api/profileSections.ts", { "@utils/constants": { Devs: {} }, "@utils/types": definition => definition })).default;
    const memberSince = canonicalizeMatch("#{intl::USER_PROFILE_MEMBER_SINCE}");
    for (const [index, patch] of plugin.patches.entries()) {
        const sideBar = index === 0;
        const anchor = sideBar ? "type:Constants.SIDEBAR,disableToolbar:false" : index === 1 ? "type:0,applicationRoleConnection:null" : "type:Constants.MODAL_V2,onClose:null";
        const original = `function profile(user){return jsx(Profile,{${anchor},children:[jsx(Section,{heading:intl.string(t${memberSince}),children:jsx(MemberSince,{userId:user.id${sideBar ? "" : ",guildId:0"}})}),jsx(Wishlist,{unownedWishlistItems:items,wishlistId:id})]})}`;
        assert(original.includes(patch.find));
        const match = canonicalizeMatch(patch.replacement.match);
        assert.equal([...original.matchAll(new RegExp(match.source, "g"))].length, 1);
        const patched = original.replace(match, canonicalizeReplace(patch.replacement.replace, "plugin"));
        const { code } = await transform(`(${patched})`, { loader: "js" });
        const calls = [];
        const profile = vm.runInNewContext(code, {
            Vencord: { Api: { ProfileSections: { renderProfileSections: props => { calls.push(props); return "custom-section"; } } } },
            jsx: (type, props) => ({ type, props }), Profile: "profile", Section: "section", MemberSince: "member-since", Wishlist: "wishlist",
            Constants: {}, intl: { string: () => "Member Since" }, t: {}, items: [], id: "wishlist"
        });
        const rendered = profile({ id: "account" });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].userId, "account");
        assert.equal(calls[0].isSideBar, sideBar);
        assert.equal(rendered.props.children.length, 3);
    }
});
