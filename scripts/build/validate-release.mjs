/*
 * Validates release metadata before GitHub upload.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const versionJsonPath = path.join(root, "release", "installer", "version.json");

const tag = process.env.GITHUB_REF_NAME?.replace(/^v/, "") ?? pkg.version;
const pkgVersion = pkg.version;

let errors = 0;

if (pkgVersion !== tag) {
    console.error(`[release] package.json version (${pkgVersion}) does not match tag (v${tag}).`);
    console.error("[release] Bump package.json before tagging, or fix the tag.");
    errors++;
}

if (!fs.existsSync(versionJsonPath)) {
    console.error("[release] Missing release/installer/version.json");
    errors++;
} else {
    const meta = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
    if (meta.version !== pkgVersion) {
        console.error(`[release] version.json (${meta.version}) does not match package.json (${pkgVersion}).`);
        errors++;
    }
}

const distZip = path.join(root, "release", "installer", "moggcord-dist.zip");
if (!fs.existsSync(distZip)) {
    console.error("[release] Missing moggcord-dist.zip");
    errors++;
}

const installer = path.join(root, "release", "installer", "Moggcord-Installer.exe");
if (!fs.existsSync(installer)) {
    console.error("[release] Missing Moggcord-Installer.exe");
    errors++;
}

if (errors) {
    process.exit(1);
}

console.log(`[release] OK — v${pkgVersion} (tag v${tag}), assets verified.`);
