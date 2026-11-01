/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const verification = process.argv.includes("--verify-package") || process.env.MOGGCORD_VERIFY_PACKAGE === "1";
if (verification) {
    const fail = error => { process.stderr.write((error.stack || error.message || String(error)) + "\n"); app.exit(1); };
    process.on("uncaughtException", fail); process.on("unhandledRejection", fail);
}
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const { createDesktopInstaller } = require("./backend.mjs");
const { verifyBuild } = require("../scripts/lib/build-info.mjs");

const resources = app.isPackaged ? join(process.resourcesPath, "moggcord-installer") : join(__dirname, "resources");
const metadata = JSON.parse(readFileSync(join(resources, "metadata.json"), "utf8"));
verifyBuild(join(resources, "desktop"), metadata.version);
const hash = createHash("sha256").update(readFileSync(join(resources, "equilotl"))).digest("hex");
if (hash !== metadata.installerSha256) throw new Error("The native installer fingerprint does not match its package metadata. Download a fresh copy from GitHub.");
if (metadata.platform !== process.platform || metadata.version !== app.getVersion()) throw new Error(`The installer metadata (${metadata.platform}, ${metadata.version}) does not match this app (${process.platform}, ${app.getVersion()}).`);
if (verification) {
    app.whenReady().then(() => {
        process.stdout.write(JSON.stringify({ version: metadata.version, platform: process.platform, arch: process.arch, verified: true }) + "\n");
        app.exit(0);
    });
} else if (!app.requestSingleInstanceLock()) app.quit();
else {
    let window;
    const backend = createDesktopInstaller({ platform: process.platform, resources, version: metadata.version });
    const ui = join(__dirname, "index.html");
    const trusted = event => event.sender === window?.webContents && event.senderFrame?.url === pathToFileURL(ui).href;
    const sync = (channel, callback) => ipcMain.on(channel, (event, ...args) => { event.returnValue = trusted(event) ? callback(...args) : null; });
    const handle = (channel, callback) => ipcMain.handle(channel, (event, ...args) => {
        if (!trusted(event)) throw new Error("This window cannot use the installer.");
        return callback(...args);
    });
    handle("detect", () => backend.detect());
    handle("resolve", input => { try { return { success: true, target: backend.resolve(input) }; } catch (error) { return { success: false, error: error.message }; } });
    handle("browse", async () => {
        const result = await dialog.showOpenDialog(window, { title: "Choose your Discord installation", properties: ["openDirectory", "treatPackageAsDirectory"] });
        return result.canceled ? "" : result.filePaths[0];
    });
    sync("start", (...args) => backend.start(...args));
    sync("status", () => backend.getStatus());
    sync("version", () => metadata.version);
    handle("close", () => { if (backend.getStatus().state !== "running") app.quit(); });
    handle("minimize", () => window.minimize());
    handle("url", url => { if (url === "https://github.com/caedesdev/moggcord") return shell.openExternal(url); });
    app.on("second-instance", () => { if (window) { window.restore(); window.focus(); } });
    app.whenReady().then(() => {
        window = new BrowserWindow({ width: 960, height: 720, minWidth: 800, minHeight: 640, frame: false, backgroundColor: "#090a10", title: "Moggcord Installer", icon: join(__dirname, "icon.png"),
            webPreferences: { preload: join(__dirname, "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true } });
        window.removeMenu();
        window.on("close", event => { if (backend.getStatus().state === "running") event.preventDefault(); });
        window.webContents.on("will-navigate", event => event.preventDefault());
        window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
        window.loadFile(ui);
    }).catch(error => { process.stderr.write(error.message + "\n"); app.exit(1); });
    app.on("window-all-closed", () => app.quit());
}
