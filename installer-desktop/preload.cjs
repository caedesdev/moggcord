/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const { contextBridge, ipcRenderer } = require("electron");
const resolve = async path => {
    const result = await ipcRenderer.invoke("resolve", path);
    if (!result.success) throw new Error(result.error);
    return result.target;
};
contextBridge.exposeInMainWorld("moggcord", {
    detectDiscord: () => ipcRenderer.invoke("detect"),
    isInjected: async path => (await resolve(path)).installed,
    hasThirdPartyMod: async path => (await resolve(path)).otherMod,
    resolveDiscord: path => ipcRenderer.invoke("resolve", path),
    browseDiscord: () => ipcRenderer.invoke("browse"),
    startOperation: (...args) => ipcRenderer.sendSync("start", ...args),
    getInjectStatus: () => ipcRenderer.sendSync("status"),
    getInstallerVersion: () => ipcRenderer.sendSync("version"),
    minimizeApp: () => ipcRenderer.invoke("minimize"),
    closeApp: () => ipcRenderer.invoke("close"),
    openUrl: url => ipcRenderer.invoke("url", url)
});
