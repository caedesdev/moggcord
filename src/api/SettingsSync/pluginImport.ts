/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

interface CatalogPlugin {
    hidden?: boolean;
    required?: boolean;
    enabledByDefault?: boolean;
}

export interface PluginImportReport {
    configured: number;
    enabledInBackup: number;
    ready: string[];
    internal: string[];
    missing: string[];
    incompatible: { name: string; target: string; }[];
    disabled: string[];
    unchanged: string[];
    missingDisabled: string[];
    projectedEnabled: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function inspectPluginImport(
    imported: unknown,
    catalog: Record<string, CatalogPlugin>,
    excluded: Record<string, string>,
    current: Record<string, unknown>
): PluginImportReport {
    if (!isRecord(imported)) throw new Error("The backup does not contain a valid plugin settings object.");
    const report: PluginImportReport = {
        configured: 0, enabledInBackup: 0, ready: [], internal: [], missing: [], incompatible: [], disabled: [], unchanged: [], missingDisabled: [], projectedEnabled: []
    };
    for (const [name, settings] of Object.entries(imported)) {
        if (!isRecord(settings) || (settings.enabled !== undefined && typeof settings.enabled !== "boolean"))
            throw new Error("The backup contains invalid plugin settings.");
        report.configured++;
        const available = Object.hasOwn(catalog, name);
        if (settings.enabled === undefined) {
            report.unchanged.push(name);
            continue;
        }
        if (!settings.enabled) {
            report.disabled.push(name);
            if (!available) report.missingDisabled.push(name);
            continue;
        }
        report.enabledInBackup++;
        if (!available) {
            if (Object.hasOwn(excluded, name)) report.incompatible.push({ name, target: excluded[name] });
            else report.missing.push(name);
        } else if (catalog[name].hidden || catalog[name].required) report.internal.push(name);
        else report.ready.push(name);
    }
    for (const [name, plugin] of Object.entries(catalog)) {
        if (plugin.hidden || plugin.required) continue;
        const saved = current[name];
        const selected = Object.hasOwn(imported, name) ? imported[name] : undefined;
        const enabled = isRecord(selected) && typeof selected.enabled === "boolean" ? selected.enabled
            : isRecord(saved) && typeof saved.enabled === "boolean" ? saved.enabled : plugin.enabledByDefault === true;
        if (enabled) report.projectedEnabled.push(name);
    }
    for (const names of [report.ready, report.internal, report.missing, report.disabled, report.unchanged, report.missingDisabled, report.projectedEnabled]) names.sort((a, b) => a.localeCompare(b));
    report.incompatible.sort((a, b) => a.name.localeCompare(b.name));
    return report;
}
