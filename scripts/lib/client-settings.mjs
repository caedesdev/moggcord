/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { constants, copyFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const channels = { stable: "discord", canary: "discordcanary", ptb: "discordptb", development: "discorddevelopment" };

export function clientSettingsDirectory(dataDir, { channel = "", executable = "", userDataDir = "" } = {}) {
    const name = basename(executable.replaceAll("\\", "/")).replace(/\.exe$/i, "").toLowerCase();
    const normalized = executable.replace(/[ _-]/g, "");
    const detected = Object.entries(channels).reverse().find(([, name]) => new RegExp(`(?:^|[/\\\\])${name}(?:\\.(?:app|exe)|[/\\\\]|$)`, "i").test(normalized));
    const client = Object.hasOwn(channels, channel) ? channel : (detected?.[0] ?? name.replace(/[^a-z0-9_-]/g, "_")) || "desktop";
    const standardName = channels[client] ?? name;
    const custom = userDataDir && basename(userDataDir.replaceAll("\\", "/")).toLowerCase().replace(/[^a-z0-9]/g, "") !== standardName;
    const profilePath = process.platform === "win32" ? resolve(userDataDir).toLowerCase() : resolve(userDataDir);
    const suffix = custom ? "-" + createHash("sha256").update(profilePath).digest("hex").slice(0, 12) : "";
    return join(dataDir, "clients", client + suffix, "settings");
}

export function initializeClientSettings(dataDir, client = {}) {
    const directory = clientSettingsDirectory(dataDir, client);
    mkdirSync(directory, { recursive: true });
    if (directory === join(dataDir, "clients", "stable", "settings")) {
        for (const name of ["settings.json", "native-settings.json", "quickCss.css"]) {
            try { copyFileSync(join(dataDir, "settings", name), join(directory, name), constants.COPYFILE_EXCL); }
            catch (error) { if (!["ENOENT", "EEXIST"].includes(error.code)) throw error; }
        }
    }
    return directory;
}
