/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isPluginEnabled } from "@api/PluginManager";
import Plugins, { PluginMeta } from "~plugins";

import {
    getGermanDescription,
    GUIDE_CATEGORIES,
    resolveCategory,
    type GuideCategory,
} from "./guideData";

export interface GuideEntry {
    name: string;
    description: string;
    categoryId: string;
    enabled: boolean;
    isMoggcord: boolean;
    hasSettings: boolean;
}

function isHiddenFromGuide(name: string): boolean {
    const plugin = Plugins[name];
    if (!plugin) return true;
    if (plugin.hidden) return true;
    if (name.endsWith("API")) return true;

    const folder = PluginMeta[name]?.folderName ?? "";
    if (folder.includes("/_api/") || folder.includes("/_core/")) return true;

    return false;
}

export function collectGuideEntries(onlyDefaultOn = true): GuideEntry[] {
    const entries: GuideEntry[] = [];

    for (const name of Object.keys(Plugins)) {
        const plugin = Plugins[name];
        if (!plugin || isHiddenFromGuide(name)) continue;
        if (onlyDefaultOn && !plugin.enabledByDefault && !plugin.required && !isPluginEnabled(name)) continue;

        const folder = PluginMeta[name]?.folderName ?? "";
        const isMoggcord = folder.startsWith("src/moggcordplugins/");

        entries.push({
            name: plugin.name,
            description: getGermanDescription(plugin.name, plugin.description),
            categoryId: resolveCategory(plugin.name, plugin.description),
            enabled: isPluginEnabled(name),
            isMoggcord,
            hasSettings: Boolean(plugin.settings || plugin.options),
        });
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function groupGuideEntries(entries: GuideEntry[]): Array<GuideCategory & { plugins: GuideEntry[]; }> {
    const byCategory = new Map<string, GuideEntry[]>();

    for (const entry of entries) {
        const list = byCategory.get(entry.categoryId) ?? [];
        list.push(entry);
        byCategory.set(entry.categoryId, list);
    }

    return GUIDE_CATEGORIES
        .map(cat => ({
            ...cat,
            plugins: byCategory.get(cat.id) ?? [],
        }))
        .filter(cat => cat.plugins.length > 0);
}

export function filterGuideEntries(entries: GuideEntry[], query: string): GuideEntry[] {
    const q = query.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter(e =>
        e.name.toLowerCase().includes(q)
        || e.description.toLowerCase().includes(q)
    );
}
