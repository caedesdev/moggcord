/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import vm from "node:vm";
import { transform } from "esbuild";
import ts from "typescript";
import { globPlugins } from "../build/common.mjs";

export async function catalogCounts(source, sourceRoot = resolve("src")) {
    const file = ts.createSourceFile("registry.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const imports = new Map();
    for (const statement of file.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier.text;
        const base = resolve(sourceRoot, specifier);
        const filename = [base + ".ts", base + ".tsx", join(base, "index.ts"), join(base, "index.tsx")].find(existsSync);
        if (!filename) throw new Error("Missing plugin source: " + specifier);
        const plugin = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        let definition;
        const visit = node => {
            if (ts.isCallExpression(node) && node.expression.getText(plugin) === "definePlugin") {
                const argument = ts.isAsExpression(node.arguments[0]) ? node.arguments[0].expression : node.arguments[0];
                if (ts.isObjectLiteralExpression(argument)) definition = argument;
            }
            ts.forEachChild(node, visit);
        };
        visit(plugin);
        if (!definition) throw new Error("Missing plugin definition: " + specifier);
        const metadata = {};
        for (const property of definition.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const key = property.name.getText(plugin);
            if (key === "name" && ts.isStringLiteralLike(property.initializer)) metadata.name = property.initializer.text;
            if (key === "hidden") metadata.hidden = property.initializer.kind === ts.SyntaxKind.TrueKeyword;
        }
        if (!metadata.name) throw new Error("Missing plugin name: " + specifier);
        imports.set(specifier, metadata);
    }
    const { code } = await transform(source, { format: "cjs", target: "es2022" });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => {
        if (!imports.has(name)) throw new Error("Unexpected plugin import: " + name);
        return imports.get(name);
    } }, { timeout: 1000 });
    const { default: plugins, PluginMeta } = module.exports;
    const counts = { total: 0, vencord: 0, moggcord: 0 };
    for (const plugin of Object.values(plugins)) {
        const metadata = PluginMeta[plugin.name];
        if (plugin.hidden || metadata.userPlugin) continue;
        const collection = metadata.folderName.startsWith("src/moggcordplugins/") ? "moggcord" : "vencord";
        counts[collection]++;
        counts.total++;
    }
    return counts;
}

export async function generateCatalogStats() {
    let load;
    globPlugins("discordDesktop", { includeUserPlugins: false }).setup({ onResolve() {}, onLoad(options, callback) { load = callback; } });
    return catalogCounts((await load()).contents);
}
