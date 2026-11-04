/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const label = path => relative(root, path).split(sep).join("/");
const problems = [];

async function markdownFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const groups = await Promise.all(entries.map(entry => entry.isDirectory()
        ? markdownFiles(join(directory, entry.name))
        : extname(entry.name) === ".md" ? [join(directory, entry.name)] : []));
    return groups.flat().sort();
}

function prose(source) {
    let fence = null;
    return source.split(/\r?\n/).map(line => {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
        if (marker && !fence) { fence = marker[1]; return ""; }
        if (fence) {
            if (new RegExp(`^ {0,3}${fence[0]}{${fence.length},}\\s*$`).test(line)) fence = null;
            return "";
        }
        return line;
    }).join("\n");
}

function headingAnchors(text) {
    const anchors = new Set();
    for (const heading of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
        const slug = heading[1].replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").toLowerCase()
            .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\-\s]/gu, "").replace(/\s/g, "-");
        let anchor = slug, count = 0;
        while (anchors.has(anchor)) anchor = `${slug}-${++count}`;
        anchors.add(anchor);
    }
    return anchors;
}

const files = [join(root, "README.md"), join(root, ".github", "CONTRIBUTING.md"), ...await markdownFiles(join(root, "docs"))];
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
if (!/^\d+\.\d+\.\d+$/.test(version) || !files.includes(join(root, "docs", "releases", `${version}.md`)))
    problems.push(`package.json: documentation needs release notes at docs/releases/${version}.md`);
const pages = new Map(await Promise.all(files.map(async file => {
    const text = prose(await readFile(file, "utf8"));
    if ([...text.matchAll(/^ {0,3}#\s+\S/gm)].length !== 1) problems.push(`${label(file)}: expected exactly one page title`);
    return [file, { text, anchors: headingAnchors(text), links: new Set() }];
})));
let localLinks = 0;
for (const [file, page] of pages) {
    const targets = [...page.text.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g)].map(match => match[1].replace(/^<|>$/g, ""));
    targets.push(...[...page.text.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]));
    for (const target of targets) {
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;
        localLinks++;
        try {
            const [path, fragment] = target.split("#");
            const destination = path ? resolve(dirname(file), decodeURIComponent(path)) : file;
            const difference = relative(root, destination);
            if (difference === ".." || difference.startsWith(`..${sep}`) || isAbsolute(difference)) throw new Error("target escapes the repository");
            const details = await stat(destination);
            if (pages.has(destination)) page.links.add(destination);
            if (fragment) {
                if (!details.isFile() || extname(destination) !== ".md") throw new Error("heading target is not a Markdown page");
                const anchors = pages.get(destination)?.anchors ?? headingAnchors(prose(await readFile(destination, "utf8")));
                if (!anchors.has(decodeURIComponent(fragment))) throw new Error(`heading #${fragment} does not exist`);
            }
        } catch (error) {
            problems.push(`${label(file)}: ${target}: ${error.code === "ENOENT" ? "target does not exist" : error.message}`);
        }
    }
}
const visited = new Set();
function visit(file) {
    if (visited.has(file)) return;
    visited.add(file);
    for (const next of pages.get(file)?.links ?? []) visit(next);
}
visit(join(root, "README.md"));
for (const file of files) if (!visited.has(file)) problems.push(`${label(file)}: page is not reachable from README.md`);

if (problems.length) {
    process.stderr.write(problems.join("\n") + "\n");
    process.exitCode = 1;
} else process.stdout.write(`Documentation verified: ${files.length} pages, ${localLinks} local links, no unreachable pages.\n`);
