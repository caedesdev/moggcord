/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { unzipSync } from "fflate";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

export function extractUpdate(bytes, destination) {
    const root = resolve(destination);
    let count = 0, size = 0;
    const files = unzipSync(bytes, { filter(file) {
        const name = file.name.replaceAll("\\", "/");
        if (++count > 10000 || !Number.isSafeInteger(file.originalSize) || (size += file.originalSize) > 1024 * 1024 * 1024
            || /[:\x00]/.test(name) || name.split("/").some(part => part === "..")
            || !resolve(root, name).startsWith(root + sep)) throw new Error("The update archive contains an unsafe path or is too large.");
        return !name.endsWith("/");
    } });
    for (const [name, content] of Object.entries(files)) {
        const file = resolve(root, name.replaceAll("\\", "/"));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content, { flag: "wx" });
    }
}
