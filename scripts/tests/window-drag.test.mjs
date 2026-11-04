/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";
import { transform } from "esbuild";

async function load(file, globals = {}, imports = {}) {
    const { code } = await transform(await readFile(file, "utf8"), { loader: "ts", format: "cjs" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: name => {
        assert(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
        return imports[name];
    } });
    return module.exports;
}
const shared = await load("src/shared/noDragGuard.ts");

test("settings and privacy dialogs keep the title bar draggable across desktop and fullscreen layouts", async t => {
    const candidates = process.platform === "win32" ? [
        join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
        join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")
    ] : process.platform === "darwin" ? [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ] : ["/usr/bin/google-chrome", "/opt/google/chrome/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
    const commands = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
    const browser = candidates.find(existsSync) ?? (process.env.PATH ?? "").split(delimiter)
        .flatMap(directory => commands.map(command => join(directory, command))).find(existsSync);
    if (!browser) return t.skip("No installed Chromium browser is available for the drag-region regression.");
    const directory = await mkdtemp(join(tmpdir(), "moggcord-window-drag-"));
    const fixture = join(directory, "settings.html"), execute = promisify(execFile);
    try {
        for (const variant of ["layer-modal", "modal"]) {
            const markup = `<!doctype html><meta charset="utf-8"><style>
html,body { margin:0; height:100%; }
#titlebar { position:fixed; top:0; left:0; width:100%; height:32px; display:flex; z-index:2; }
.title_test { flex:1; }
.winButtons_test button { width:40px; height:32px; }
#dialog,.outerContainer_test { position:fixed; inset:0; }
.outerContainer_test { display:flex; align-items:center; justify-content:center; }
.outerContainer_test:has(> [data-mana-component="modal"]) { box-sizing:border-box; padding:56px 24px; pointer-events:none; }
[data-mana-component="layer-modal"] { box-sizing:border-box; display:flex; flex-direction:column; width:1200px; height:min(700px,calc(100vh - 80px)); }
[data-mana-component="modal"] { box-sizing:border-box; display:flex; flex-direction:column; width:100%; max-width:400px; height:min(600px,100%); padding-top:8px; padding-bottom:16px; pointer-events:auto; }
.modalContent_test { flex:1; padding:20px; }
#legacy { position:fixed; right:20px; bottom:20px; width:200px; height:100px; }
@media(max-width:1080px) { [data-mana-component="layer-modal"] { width:100vw; height:100vh; padding-top:32px; } }
@media(max-width:485px) {
    .outerContainer_test:has(> [data-mana-component="modal"]) { padding:0; }
    [data-mana-component="modal"] { height:100%; padding-top:40px; }
}
${shared.NO_DRAG_GUARD_CSS}
</style><div id="titlebar" class="bar_test"><div class="title_test">Discord</div><div class="winButtons_test"><button id="windowClose">Close</button></div></div>
<div id="dialog" role="dialog"><div id="outer" class="outerContainer_test"><div id="frame" data-mana-component="${variant}"><div id="content" class="modalContent_test"><input id="input"><button id="button">Save</button><button id="close">Close</button><div id="switch" role="switch" aria-checked="false" tabindex="0">Direct messages</div><input id="checkbox" type="checkbox"></div></div></div></div>
<div id="legacy" role="dialog" class="focusLock_test"><div id="legacyFrame" class="root_test"><input><button>Legacy</button></div></div><pre id="result"></pre><script>
const describe = element => ({ id:element.id, region:getComputedStyle(element).getPropertyValue('-webkit-app-region'), rect:element.getBoundingClientRect().toJSON() });
const elements = Object.fromEntries(['titlebar','dialog','outer','frame','content','input','button','close','switch','checkbox','windowClose','legacy','legacyFrame'].map(id => [id,describe(document.getElementById(id))]));
const point = { x:innerWidth/2,y:16 };
const blockers = Array.from(document.querySelectorAll('*'),describe).filter(({region,rect}) => region==='no-drag' && rect.left<=point.x && rect.right>point.x && rect.top<=point.y && rect.bottom>point.y);
document.getElementById('result').textContent=JSON.stringify({width:innerWidth,height:innerHeight,elements,blockers});
</script>`;
            for (const width of variant === "modal" ? [1600, 1000, 430] : [1600, 1000]) {
                const page = width < 485 ? `<!doctype html><pre id="result"></pre><iframe style="width:${width}px;height:900px;border:0" srcdoc="${markup.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}" onload="document.getElementById('result').textContent=this.contentDocument.getElementById('result').textContent"></iframe>` : markup;
                await writeFile(fixture, page);
                const { stdout } = await execute(browser, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                    `--user-data-dir=${join(directory, `profile-${variant}-${width}`)}`, `--window-size=${Math.max(width, 1000)},900`, pathToFileURL(fixture).href, "--dump-dom"],
                { windowsHide: true, timeout: 20_000, maxBuffer: 1024 * 1024 });
                const result = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
                assert(result, "The browser did not report computed drag regions.");
                const geometry = JSON.parse(result[1]);
                assert.equal(geometry.width < 1080, width < 1080, "The browser must exercise both settings layouts.");
                if (variant === "modal") assert.equal(geometry.width < 485, width < 485, "The browser must exercise the fullscreen privacy layout.");
                assert.equal(geometry.elements.titlebar.region, "drag");
                for (const id of ["dialog", "outer", "frame"]) assert.equal(geometry.elements[id].region, "none", `${variant} ${id} must not disable title-bar dragging at ${width}px.`);
                for (const id of ["content", "input", "button", "close", "switch", "checkbox", "windowClose", "legacy", "legacyFrame"]) assert.equal(geometry.elements[id].region, "no-drag", `${variant} ${id} must keep receiving mouse input at ${width}px.`);
                assert(geometry.elements.content.rect.top >= geometry.elements.titlebar.rect.bottom, "Settings content must start below the title bar.");
                if (variant === "layer-modal" ? width < 1080 : width < 485) {
                    assert.equal(geometry.elements.frame.rect.top, 0);
                    assert.equal(geometry.elements.frame.rect.height, geometry.height);
                }
                assert.deepEqual(geometry.blockers, [], `A no-drag rectangle covers the title-bar midpoint at ${width}px.`);
            }
        }
    } finally {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert(basename(directory).startsWith("moggcord-window-drag-"));
        await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
});

test("window drag protection never excludes the whole document or application from dragging", async () => {
    const { code } = await transform(shared.NO_DRAG_GUARD_CSS, { loader: "css", minify: true });
    assert(!/(?:html|body|#app-mount)\b/.test(code));
    assert(code.includes("-webkit-app-region:drag"));
    assert(code.includes("-webkit-app-region:no-drag"));
    assert(code.includes("user-select:none"));
    for (const selector of ["button", "input", '[role="checkbox"]', '[role="dialog"]']) assert(shared.NO_DRAG_GUARD_CSS.includes(selector));
});

test("main-process protection inserts one scoped user stylesheet per document without polling or channel-change duplicates", async () => {
    const listeners = new Map(), styles = [];
    let destroyed = false;
    const webContents = {
        isDestroyed: () => destroyed,
        isLoadingMainFrame: () => false,
        insertCSS: async (css, options) => { styles.push({ css, options }); },
        executeJavaScript() { assert.fail("Global inline drag overrides must not be injected"); },
        on: (event, handler) => { assert(!listeners.has(event)); listeners.set(event, handler); }
    };
    const { injectNoDragGuard } = await load("src/main/noDragGuard.ts", {
        setInterval() { assert.fail("Drag protection must not poll after startup"); }
    }, { "@shared/noDragGuard": shared });
    injectNoDragGuard(webContents);
    injectNoDragGuard(webContents);
    assert.equal(styles.length, 1);
    listeners.get("did-finish-load")();
    for (let i = 0; i < 1000; i++) listeners.get("did-navigate-in-page")?.();
    assert.equal(styles.length, 1);
    listeners.get("dom-ready")();
    listeners.get("did-finish-load")();
    assert.equal(styles.length, 2);
    assert(styles.every(({ css, options }) => css === shared.NO_DRAG_GUARD_CSS && options.cssOrigin === "user"));
    destroyed = true;
    for (const handler of listeners.values()) handler();
    assert.equal(styles.length, 2);
});

test("drag protection waits for a loading document and retries a failed insertion at load completion", async () => {
    const listeners = new Map();
    let attempts = 0;
    const webContents = {
        isDestroyed: () => false,
        isLoadingMainFrame: () => true,
        insertCSS: async () => { if (++attempts === 1) throw new Error("Document replaced"); },
        on: (event, handler) => listeners.set(event, handler)
    };
    const { injectNoDragGuard } = await load("src/main/noDragGuard.ts", {
        setInterval() { assert.fail("Drag protection must not poll after startup"); }
    }, { "@shared/noDragGuard": shared });
    injectNoDragGuard(webContents);
    assert.equal(attempts, 0);
    listeners.get("dom-ready")();
    await Promise.resolve();
    await Promise.resolve();
    listeners.get("did-finish-load")();
    await Promise.resolve();
    assert.equal(attempts, 2);
    listeners.get("did-finish-load")();
    assert.equal(attempts, 2);
});
