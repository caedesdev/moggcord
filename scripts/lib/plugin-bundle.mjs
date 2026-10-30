/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const bundledPlugins = Object.freeze({
    FakeVoice: "FakeVoice",
    exportDM: "ExportDM",
    customProfile: "CustomProfile",
    tokenImporter: "TokenImporter"
});

export const internalPlugins = Object.freeze({
    accountTokenBridge: "AccountTokenBridge",
    uiRelaunchFix: "UiRelaunchFix"
});

const internalDirectories = new Set(["plugins/_api", "plugins/_core", "moggcordplugins/_api"]);

export function pluginBundleKind(directory, filename) {
    if (directory === "userplugins") return "user";
    if (filename.endsWith(".css")) return null;
    if (internalDirectories.has(directory)) return "internal";
    if (directory !== "moggcordplugins") return null;
    if (Object.hasOwn(bundledPlugins, filename)) return "standard";
    if (Object.hasOwn(internalPlugins, filename)) return "internal";
    return "optional";
}
