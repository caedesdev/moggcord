/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { app } from "electron";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { clientSettingsDirectory, initializeClientSettings } from "../../../scripts/lib/client-settings.mjs";

const suffix = IS_DEV ? "dev" : "";

export const DATA_DIR = process.env.MOGGCORD_USER_DATA_DIR ?? (
    process.env.DISCORD_USER_DATA_DIR
        ? join(process.env.DISCORD_USER_DATA_DIR, "..", "MoggcordData", suffix)
        : join(app.getPath("userData"), "..", "Moggcord", suffix)
);

export const CLIENT_IDENTITY = {
    executable: process.execPath,
    userDataDir: process.env.DISCORD_USER_DATA_DIR || app.commandLine.getSwitchValue("user-data-dir")
};

export const SETTINGS_DIR = clientSettingsDirectory(DATA_DIR, CLIENT_IDENTITY);
export const THEMES_DIR = join(DATA_DIR, "themes");
export const QUICK_CSS_PATH = join(SETTINGS_DIR, "quickCss.css");
export const SETTINGS_FILE = join(SETTINGS_DIR, "settings.json");
export const NATIVE_SETTINGS_FILE = join(SETTINGS_DIR, "native-settings.json");
export const DEV_MIGRATED = join(SETTINGS_DIR, "migration");
export const ALLOWED_PROTOCOLS = [
    "https:",
    "http:",
    "steam:",
    "spotify:",
    "tidal:",
    "itunes:",
    "vrcx:",
];

export const IS_VANILLA = /* @__PURE__ */ process.argv.includes("--vanilla");

if (IS_DEV) {
    const prodDir = join(DATA_DIR, "..");
    const prodSettings = initializeClientSettings(prodDir, CLIENT_IDENTITY);
    const settings = join(prodSettings, "settings.json");
    const quickCss = join(prodSettings, "quickCss.css");

    let migrated = false;
    if (existsSync(DEV_MIGRATED)) {
        const content = readFileSync(DEV_MIGRATED, "utf-8");
        migrated = content.includes("migrated");
    }

    if (!migrated) {
        setTimeout(() => {
            try {
                if (existsSync(settings)) copyFileSync(settings, SETTINGS_FILE);
                if (existsSync(quickCss)) copyFileSync(quickCss, QUICK_CSS_PATH);
                writeFileSync(DEV_MIGRATED, "migrated");
                app.relaunch();
                app.exit(0);
            } catch (err) {
                console.error("[Moggcord] Failed to copy prod data:", err);
            }
        }, 5000);
    }
}
