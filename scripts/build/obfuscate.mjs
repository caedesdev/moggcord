// @ts-check
/*
 * Moggcord — Post-build obfuscation
 * Appliqué sur les .js générés AVANT le packaging .asar et electron-builder.
 * Désactivé automatiquement en mode --dev / --watch.
 */

import { execSync } from "child_process";
import { statSync } from "fs";
import { join } from "path";

// ─── Fichiers ciblés ────────────────────────────────────────────────────────
// dist/js/   → buildDesktop (app Moggcord elle-même)
const DESKTOP_JS_FILES = [
    "dist/js/main.js",
    "dist/js/preload.js",
    "dist/js/splashPreload.js",
    "dist/js/updaterPreload.js",
    "dist/js/renderer.js",
];

// dist/desktop/ et dist/moggcord/ → build.mjs (asar vencord)
const ASAR_JS_FILES = [
    "patcher.js",
    "preload.js",
    "renderer.js",
];

// ─── Args javascript-obfuscator ──────────────────────────────────────────────
// NOTE: self-defending, rc4 encoding, split-strings et numbers-to-expressions
//       causaient des freezes à l'activation de plugins / ouverture settings.
//       → base64 au lieu de rc4, threshold réduit, pas de split-strings.
const OBF_ARGS = [
    "--compact", "true",
    "--self-defending", "false",
    "--simplify", "true",
    "--identifier-names-generator", "hexadecimal",
    "--string-array", "true",
    "--string-array-encoding", "base64",
    "--string-array-threshold", "0.5",
    "--string-array-rotate", "true",
    "--string-array-shuffle", "true",
    "--string-array-index-shift", "true",
    "--string-array-wrappers-count", "1",
    "--string-array-wrappers-type", "variable",
    "--split-strings", "false",
    "--numbers-to-expressions", "false",
    "--unicode-escape-sequence", "false",
].join(" ");

// ─── Helper ──────────────────────────────────────────────────────────────────

function obfuscateFile(filePath) {
    try {
        statSync(filePath);
    } catch {
        console.warn(`[obfuscate] Skipped (not found): ${filePath}`);
        return;
    }

    console.log(`[obfuscate] ${filePath}`);
    try {
        execSync(
            `npx javascript-obfuscator "${filePath}" --output "${filePath}" ${OBF_ARGS}`,
            { stdio: "inherit" }
        );
    } catch (e) {
        console.error(`[obfuscate] FAILED: ${filePath}\n${e.message}`);
        process.exit(1);
    }
}

// ─── Export: pour buildDesktop.mts ───────────────────────────────────────────
/**
 * Obfusque les fichiers de dist/js/ (générés par buildDesktop).
 */
export async function obfuscateDistJs() {
    console.log("\n[obfuscate] === Obfuscation dist/js/ ===");
    for (const file of DESKTOP_JS_FILES) {
        obfuscateFile(file);
    }
    console.log("[obfuscate] === Done dist/js/ ===\n");
}

// ─── Export: pour build.mjs ──────────────────────────────────────────────────
/**
 * Obfusque les .js d'un dossier dist/ avant createPackage() en .asar.
 * @param {string} dir  ex: "dist/desktop" ou "dist/moggcord"
 */
export async function obfuscateDir(dir) {
    console.log(`\n[obfuscate] === Obfuscation ${dir}/ ===`);
    for (const filename of ASAR_JS_FILES) {
        obfuscateFile(join(dir, filename));
    }
    console.log(`[obfuscate] === Done ${dir}/ ===\n`);
}
