/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("installer-src/index.html", "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

class Element {
    constructor() { this.children = []; this.events = new Map(); this.attrs = new Map(); this.style = {}; this.dataset = {}; this.hidden = false; this.disabled = false; this.checked = false; this.value = ""; this._text = ""; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    set textContent(value) { this._text = String(value); this.children = []; }
    setAttribute(name, value) { this.attrs.set(name, value); }
    addEventListener(name, handler) { this.events.set(name, handler); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this._text = ""; this.children = children; }
    focus() { this.focused = true; }
    contains(element) { return this === element || this.children.some(child => child.contains(element)); }
    click() { if (!this.disabled) this.events.get("click")?.({ preventDefault() {} }); }
}

async function mount({ targets = [{ name: "Discord", path: "fresh" }, { name: "Discord Canary", path: "installed" }, { name: "Discord PTB", path: "other" }], detectError = false, resolve, browse = "", reducedMotion = false } = {}) {
    const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))
        if (/\shidden(?=[\s=>])/.test(match[0])) elements.get(match[1]).hidden = true;
    const buttons = ["install", "repair", "uninstall"].map(action => { const el = new Element(); el.dataset.action = action; return el; });
    const intervals = new Map(), timers = new Map(), calls = [], main = new Element();
    let status = { state: "running" }, intervalId = 0, timerId = 0, now = 0;
    const advance = milliseconds => {
        const end = now + milliseconds;
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            now = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        now = end;
    };
    const document = { getElementById: id => elements.get(id), createElement: () => new Element(), querySelector: () => main, querySelectorAll: () => buttons, addEventListener() {} };
    const bridge = {
        detectDiscord: async () => { if (detectError) throw new Error("Offline"); return targets; },
        isInjected: async path => path === "installed",
        hasThirdPartyMod: async path => path === "other",
        resolveDiscord: resolve ?? (async path => ({ success: true, target: { name: "Custom Discord", path: path.replace(/[\\/]+$/, "") } })),
        browseDiscord: async () => browse,
        getInstallerVersion: () => "1.18.29",
        startOperation: (...args) => { calls.push(args); return { started: true }; },
        getInjectStatus: () => status,
        closeApp: () => calls.push(["close"]), minimizeApp() {}, openUrl() {}
    };
    const context = vm.createContext({
        document, window: { moggcord: bridge, matchMedia: () => ({ matches: reducedMotion }) }, performance: { now: () => now },
        setInterval: fn => { intervals.set(++intervalId, fn); return intervalId; }, clearInterval: id => intervals.delete(id),
        setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: now + delay }); return timerId; }, clearTimeout: id => timers.delete(id)
    });
    vm.runInContext(script, context);
    await flush();
    return { get: id => elements.get(id), buttons, calls, context, status: value => { status = value; }, tick: () => { for (const fn of intervals.values()) fn(); }, intervals, timers, advance };
}

test("launch and action selection never install anything; existing Moggcord redirects to Repair", async () => {
    const s = await mount();
    assert.equal(s.get("home-page").hidden, false);
    assert.equal(s.get("target-page").hidden, true);
    assert.equal(s.calls.length, 0);
    s.buttons[0].click();
    assert.equal(s.get("run-operation").disabled, false);
    s.get("discord-list").children[1].click();
    assert.equal(s.get("run-operation").disabled, true);
    assert.equal(s.get("repair-shortcut").hidden, false);
    s.get("run-operation").click();
    assert.equal(s.calls.length, 0);
    s.get("repair-shortcut").click();
    assert.equal(s.get("run-label").textContent, "Repair Moggcord");
    assert.equal(s.get("run-operation").disabled, false);
});

test("Repair and Uninstall only enable for Moggcord; replacing another mod needs an explicit checkbox", async () => {
    const s = await mount();
    for (const button of s.buttons.slice(1)) {
        button.click();
        s.get("discord-list").children[0].click();
        assert.equal(s.get("run-operation").disabled, true);
        s.get("discord-list").children[1].click();
        assert.equal(s.get("run-operation").disabled, false);
    }
    s.buttons[0].click();
    s.get("discord-list").children[2].click();
    assert.equal(s.get("run-operation").disabled, true);
    s.get("replace-other").checked = true;
    s.get("replace-other").events.get("change")();
    s.get("run-operation").click();
    assert.deepEqual(s.calls, [["install", "other", true]]);
});

test("explicit operation click starts exactly once and handles progress, completion and stale updates", async () => {
    const s = await mount();
    s.buttons[1].click();
    s.get("run-operation").click();
    s.get("run-operation").click();
    assert.deepEqual(s.calls, [["repair", "installed", false]]);
    assert.equal(s.get("close").disabled, true);
    vm.runInContext("setLoading(true, 'Downloading', 42, 3, 7)", s.context);
    assert.equal(s.get("progress-track").attrs.get("aria-valuenow"), "42");
    s.status({ state: "done", result: "repaired" }); s.tick();
    assert.equal(s.get("progress-title").textContent, "Good as new.");
    assert.equal(s.get("close").disabled, false);
    assert.equal(s.intervals.size, 0);
    vm.runInContext("setLoading(true, 'Late callback', 2)", s.context);
    assert.equal(s.get("progress-track").attrs.get("aria-valuenow"), "42");
});

test("failures and already-installed responses show the correct outcome", async () => {
    for (const status of [{ state: "error", error: "Permission denied" }, { state: "done", result: "alreadyInstalled" }]) {
        const s = await mount();
        s.buttons[0].click(); s.get("run-operation").click();
        s.status(status); s.tick();
        assert.equal(s.get("progress-title").textContent, status.state === "error" ? "Setup couldn’t finish." : "Already at home.");
        assert.equal(s.get("progress-notice").hidden, false);
        assert.equal(s.get("progress-notice").dataset.tone, status.state === "error" ? "danger" : "info");
        assert.equal(s.get("result-actions").hidden, false);
    }
});

test("missing installations and failed detection keep actions disabled and allow a manual path", async () => {
    for (const settings of [{ targets: [] }, { detectError: true }]) {
        const s = await mount(settings);
        s.buttons[0].click();
        assert.equal(s.get("run-operation").disabled, true);
        s.get("manual-path").value = "C:\\Custom\\resources\\";
        await s.get("manual-form").events.get("submit")({ preventDefault() {} });
        assert.equal(s.get("run-operation").disabled, false);
        assert.equal(s.get("selection-path").textContent, "C:\\Custom\\resources");
        assert.equal(s.calls.length, 0);
    }
});

test("custom paths use the native resolver, keep the original channel icon and deduplicate canonical targets", async () => {
    const requests = [];
    const image = "data:image/png;base64,aWNvbg==";
    const s = await mount({ targets: [], resolve: async path => { requests.push(path); return { success: true, target: { name: "Discord Canary", path: "C:/Custom/app-1.0.100/resources", icon: image } }; } });
    s.buttons[0].click();
    s.get("manual-path").value = "C:/Custom/DiscordCanary.exe";
    await s.get("manual-form").events.get("submit")({ preventDefault() {} });
    assert.deepEqual(requests, ["C:/Custom/DiscordCanary.exe"]);
    assert.equal(s.get("discord-list").children.length, 1);
    assert.equal(s.get("discord-list").children[0].children[0].children[0].src, image);
    assert.equal(s.get("selection-path").textContent, "C:/Custom/app-1.0.100/resources");
    await s.get("manual-form").events.get("submit")({ preventDefault() {} });
    assert.equal(s.get("discord-list").children.length, 1);
    assert.equal(s.calls.length, 0);
});

test("invalid custom folders show the native error without adding an install target", async () => {
    const s = await mount({ targets: [], resolve: async () => ({ success: false, error: "No Discord installation was found there." }) });
    s.buttons[0].click(); s.get("manual-path").value = "C:/Wrong";
    await s.get("manual-form").events.get("submit")({ preventDefault() {} });
    assert.equal(s.get("target-error").hidden, false);
    assert.equal(s.get("target-error").children[1].children[1].textContent, "No Discord installation was found there.");
    assert.equal(s.get("run-operation").disabled, true);
    assert.equal(s.get("manual-add").disabled, false);
    assert.equal(s.calls.length, 0);
});

test("the folder picker resolves the selected folder and cancellation preserves the current selection", async () => {
    const s = await mount({ targets: [], browse: "C:/Portable/resources" });
    s.buttons[0].click();
    await s.get("manual-browse").events.get("click")();
    assert.equal(s.get("selection-path").textContent, "C:/Portable/resources");
    assert.equal(s.get("run-operation").disabled, false);
    assert.equal(s.calls.length, 0);
    const canceled = await mount();
    canceled.buttons[0].click();
    await canceled.get("manual-browse").events.get("click")();
    assert.equal(canceled.get("selection-path").textContent, "fresh");
    assert.equal(canceled.calls.length, 0);
});

test("success notifications cover all three completed actions and dismiss without another native operation", async () => {
    for (const [index, result, title] of [[0, "installed", "Installation complete"], [1, "repaired", "Repair complete"], [2, "uninstalled", "Uninstall complete"]]) {
        const s = await mount();
        s.buttons[index].click(); s.get("run-operation").click();
        s.status({ state: "done", result }); s.tick();
        const notice = s.get("progress-notice");
        assert.equal(notice.dataset.tone, "success");
        assert.equal(notice.attrs.get("role"), "status");
        assert.equal(notice.attrs.get("aria-live"), "polite");
        assert.equal(notice.children[1].children[0].textContent, title);
        assert(notice.children[0].innerHTML.includes("#icon-notice-success"));
        const calls = s.calls.length;
        notice.children.at(-1).click();
        assert.equal(notice.dataset.state, "closing");
        s.advance(180);
        assert.equal(notice.hidden, true);
        assert.equal(s.calls.length, calls);
        assert.equal(s.get("another-action").focused, true);
    }
});

test("dismissed warning and info notifications cannot bypass installation or replacement guards", async () => {
    const s = await mount();
    assert.equal(s.get("progress-notice").hidden, true);
    s.buttons[0].click();
    for (const [index, tone] of [[2, "warning"], [1, "info"]]) {
        s.get("discord-list").children[index].click();
        const notice = s.get("selection-notice");
        assert.equal(notice.dataset.tone, tone);
        assert.equal(s.get("run-operation").disabled, true);
        notice.children.at(-1).click();
        s.advance(180);
        assert.equal(notice.hidden, true);
        assert.equal(s.get("run-operation").disabled, true);
        assert.equal(s.get("replace-other").checked, false);
    }
    s.buttons[2].click();
    assert.equal(s.get("selection-notice").dataset.tone, "warning");
    assert.equal(s.get("run-operation").disabled, false);
    assert.equal(s.calls.length, 0);
});

test("notifications update live-region semantics and keep native error text inert", async () => {
    const s = await mount();
    const message = '<img src=x onerror="window.bad=true"> C:\\Discord\\resources';
    for (const tone of ["danger", "info", "success", "warning"]) {
        vm.runInContext("showNotice('target-error', " + JSON.stringify({ tone, title: "Notice", message }) + ")", s.context);
        const notice = s.get("target-error");
        assert.equal(notice.attrs.get("role"), tone === "danger" ? "alert" : "status");
        assert.equal(notice.attrs.get("aria-live"), tone === "danger" ? "assertive" : "polite");
        const text = notice.children[1].children[1];
        assert.equal(text.textContent, message);
        assert.equal(text.children.length, 0);
        assert.equal(notice.children.at(-1).attrs.get("aria-label"), "Dismiss notification");
    }
    assert.equal(s.context.window.bad, undefined);
    vm.runInContext("showNotice('target-error')", s.context);
    assert.equal(s.get("target-error").hidden, true);
    assert.equal(s.get("target-error").children.length, 0);
});

test("all toast tones dismiss after five seconds, finish their exit animation and never steal focus", async () => {
    for (const tone of ["info", "success", "warning", "danger"]) {
        const s = await mount();
        vm.runInContext("showNotice('target-error', " + JSON.stringify({ tone, title: "Notice", message: "Details" }) + ")", s.context);
        const notice = s.get("target-error");
        s.advance(4999);
        assert.equal(notice.hidden, false);
        assert.equal(notice.dataset.state, "open");
        s.advance(1);
        assert.equal(notice.dataset.state, "closing");
        assert.equal(notice.hidden, false);
        s.advance(180);
        assert.equal(notice.hidden, true);
        assert.equal(s.get("manual-path").focused, undefined);
        assert.equal(s.calls.length, 0);
        assert.equal(s.timers.size, 0);
    }
});

test("hover and keyboard focus pause a toast until both leave, preserving the remaining time", async () => {
    const s = await mount();
    vm.runInContext("showNotice('target-error', {title: 'Notice', message: 'Read this'})", s.context);
    const notice = s.get("target-error");
    s.advance(2000); notice.events.get("pointerenter")();
    s.advance(10000); notice.events.get("focusin")();
    notice.events.get("pointerleave")();
    s.advance(10000);
    assert.equal(notice.hidden, false);
    assert.equal(notice.dataset.state, "open");
    notice.events.get("focusout")({ relatedTarget: null });
    s.advance(2999); assert.equal(notice.dataset.state, "open");
    s.advance(1); assert.equal(notice.dataset.state, "closing");
    s.advance(180); assert.equal(notice.hidden, true);
});

test("a replaced toast cancels the previous exit timer and expired selection hints stay dismissed", async () => {
    const s = await mount();
    vm.runInContext("showNotice('target-error', {title: 'First'})", s.context);
    s.advance(5000);
    vm.runInContext("showNotice('target-error', {title: 'Second'})", s.context);
    s.advance(180);
    assert.equal(s.get("target-error").hidden, false);
    assert.equal(s.get("target-error").children[1].children[0].textContent, "Second");
    s.advance(5000);
    s.buttons[0].click(); s.get("discord-list").children[2].click();
    s.advance(5180);
    vm.runInContext("updateSelection()", s.context);
    assert.equal(s.get("selection-notice").hidden, true);
    assert.equal(s.get("run-operation").disabled, true);
    assert.equal(s.timers.size, 0);
});

test("result details replay the last toast without retrying setup, and navigation clears stale notices", async () => {
    const s = await mount();
    s.buttons[0].click(); s.get("run-operation").click();
    s.status({ state: "error", error: "Permission denied" }); s.tick();
    s.advance(5180); assert.equal(s.get("progress-notice").hidden, true);
    s.get("view-notification").click();
    assert.equal(s.get("progress-notice").hidden, false);
    assert.equal(s.get("progress-notice").children[1].children[1].textContent, "Permission denied");
    assert.equal(s.calls.length, 1);
    s.buttons[1].click();
    assert.equal(s.get("progress-notice").hidden, true);
    assert.equal(s.timers.size, 0);
});

test("reduced motion removes the exit delay while keeping automatic dismissal", async () => {
    const s = await mount({ reducedMotion: true });
    vm.runInContext("showNotice('target-error', {title: 'Notice'})", s.context);
    s.advance(5000);
    assert.equal(s.get("target-error").hidden, true);
    assert.equal(s.timers.size, 0);
});
