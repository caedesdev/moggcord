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

import { markPendingRelaunch } from "./postInstallRelaunch";
import { app } from "electron";
import { existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from "original-fs";
import { basename, dirname, join } from "path";

function isNewer($new: string, old: string) {
    const newParts = $new.slice(4).split(".").map(Number);
    const oldParts = old.slice(4).split(".").map(Number);

    for (let i = 0; i < oldParts.length; i++) {
        if (newParts[i] > oldParts[i]) return true;
        if (newParts[i] < oldParts[i]) return false;
    }
    return false;
}

function patchLatest() {
    try {
        const currentAppPath = dirname(process.execPath);
        const currentVersion = basename(currentAppPath);
        const discordPath = join(currentAppPath, "..");

        const latestVersion = readdirSync(discordPath)
            .filter(name => name.startsWith("app-") && statSync(join(discordPath, name)).isDirectory())
            .reduce((prev, curr) => isNewer(curr, prev) ? curr : prev, currentVersion as string);

        if (latestVersion === currentVersion) return;

        const resources = join(discordPath, latestVersion, "resources");
        const app = join(resources, "app.asar");
        const _app = join(resources, "_app.asar");

        if (!existsSync(app) || statSync(app).isDirectory()) return;

        console.info("[Moggcord] Detected Host Update. Repatching...");

        renameSync(app, _app);
        mkdirSync(app);
        writeFileSync(join(app, "package.json"), JSON.stringify({
            name: "moggcord",
            main: "index.js"
        }));
        writeFileSync(join(app, "index.js"), `// Moggcord repatch
"use strict";
const fs = require("fs");
const path = require("path");
const localAppData = process.env.LOCALAPPDATA || "";
const exeDir = path.dirname(process.execPath);
const candidates = [
    path.join(localAppData, "Moggcord", "dist", "patcher.js"),
    path.join(process.resourcesPath, "dist", "patcher.js"),
    path.join(process.resourcesPath, "app", "dist", "desktop", "patcher.js"),
    path.join(exeDir, "resources", "dist", "patcher.js"),
    path.join(exeDir, "dist", "patcher.js")
];
const patcherPath = candidates.find(fs.existsSync);
if (!patcherPath) throw new Error("[Moggcord] patcher.js not found. Checked: " + candidates.join(", "));
require(patcherPath);
`);
        markPendingRelaunch();
    } catch (err) {
        console.error("[Moggcord] Failed to repatch latest host update", err);
    }
}

app.on("before-quit", patchLatest);
