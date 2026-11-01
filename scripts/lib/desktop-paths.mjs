/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { homedir } from "node:os";
import { join } from "node:path";

export function desktopPaths(platform = process.platform, env = process.env, home = homedir()) {
    const config = platform === "darwin" ? join(home, "Library", "Application Support")
        : platform === "win32" ? env.APPDATA || join(home, "AppData", "Roaming") : env.XDG_CONFIG_HOME || join(home, ".config");
    const local = platform === "win32" ? env.LOCALAPPDATA || join(home, "AppData", "Local")
        : platform === "darwin" ? config : env.XDG_DATA_HOME || join(home, ".local", "share");
    const dataDir = join(config, "Moggcord");
    const localDir = join(local, "Moggcord");
    return { dataDir, localDir, distDir: join(localDir, "dist", "desktop"), communityDir: join(dataDir, "community") };
}
