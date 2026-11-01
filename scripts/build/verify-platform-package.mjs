/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const platform = process.platform;
const root = resolve("release/platform-installers");
const binary = platform === "darwin" ? join(root, "mac-universal", "Moggcord Installer.app", "Contents", "MacOS", "Moggcord Installer") : join(root, "linux-unpacked", "moggcord-installer");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
let stdout;
try {
    stdout = execFileSync(binary, [...(platform === "linux" ? ["--no-sandbox"] : []), "--verify-package"], {
        env: { ...process.env, MOGGCORD_VERIFY_PACKAGE: "1" }, encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024
    });
} catch (error) {
    process.stderr.write(error.stdout?.toString() || ""); process.stderr.write(error.stderr?.toString() || ""); throw error;
}
const line = stdout.trim().split("\n").findLast(value => value.startsWith('{"version"'));
const report = line && JSON.parse(line);
if (!report?.verified || report.platform !== platform || report.version !== version) throw new Error("The packaged installer did not report a verified build.");
writeFileSync(join(root, `installer-verification-${platform === "darwin" ? "macos" : "linux"}.json`), JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + "\n");
