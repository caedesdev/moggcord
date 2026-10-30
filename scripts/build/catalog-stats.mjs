/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile, writeFile } from "node:fs/promises";
import { generateCatalogStats } from "../lib/plugin-catalog.mjs";

const { version } = JSON.parse(await readFile("package.json", "utf8"));
const stats = { version, platform: "discordDesktop", plugins: await generateCatalogStats() };
await writeFile(process.argv[2] ?? "dist/plugin-catalog.json", JSON.stringify(stats, null, 2) + "\n");
console.log(`Catalog verified: ${stats.plugins.total} plugins (${stats.plugins.vencord} Vencord, ${stats.plugins.moggcord} Moggcord).`);
