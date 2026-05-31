// verify-dist.mjs - Verifie dist/desktop avant de zipper
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..", "..");
const distDir = path.join(rootDir, "dist", "desktop");

const CORE_FILES = ["patcher.js", "renderer.js", "preload.js"];
const OPTIONAL_FILES = ["node.exe", "ffmpeg.exe"];
const OPTIONAL_DIRS = [
    "ghost-server",
    "ghost-server/node_modules",
    "ghost-server/node_modules/@babel",
    "ghost-server/node_modules/@babel/runtime",
    "ghost-server/node_modules/@babel/runtime/helpers",
];
const OPTIONAL_MODULE_FILES = [
    "ghost-server/node_modules/@babel/runtime/helpers/asyncToGenerator.js",
    "ghost-server/node_modules/@babel/runtime/helpers/interopRequireDefault.js",
];

let errors = 0;
let warnings = 0;

console.log("[verify] Checking dist/desktop integrity...");

for (const f of CORE_FILES) {
    if (!fs.existsSync(path.join(distDir, f))) {
        console.error("[verify] MISSING CORE FILE: " + f);
        errors++;
    }
}

for (const f of OPTIONAL_FILES) {
    if (!fs.existsSync(path.join(distDir, f))) {
        console.warn("[verify] optional missing: " + f);
        warnings++;
    }
}

for (const d of OPTIONAL_DIRS) {
    const full = path.join(distDir, d);
    if (!fs.existsSync(full) || !fs.statSync(full).isDirectory()) {
        console.warn("[verify] optional missing dir: " + d);
        warnings++;
    }
}

for (const f of OPTIONAL_MODULE_FILES) {
    if (!fs.existsSync(path.join(distDir, f))) {
        console.warn("[verify] optional missing module: " + f);
        warnings++;
    }
}

const helpersDir = path.join(distDir, "ghost-server", "node_modules", "@babel", "runtime", "helpers");
if (fs.existsSync(helpersDir)) {
    const count = fs.readdirSync(helpersDir).filter(f => f.endsWith(".js")).length;
    if (count < 50) {
        console.warn("[verify] @babel/runtime/helpers sparse: " + count + " .js files");
        warnings++;
    } else {
        console.log("[verify] @babel/runtime/helpers OK: " + count + " files");
    }
}

if (errors === 0) {
    console.log("[verify] Core checks passed. Safe to zip." + (warnings ? ` (${warnings} optional warning(s))` : ""));
    process.exit(0);
} else {
    console.error("[verify] " + errors + " core problem(s) found.");
    process.exit(1);
}
