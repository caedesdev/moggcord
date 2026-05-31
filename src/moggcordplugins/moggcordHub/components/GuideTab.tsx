/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotice } from "@api/Notices";
import {
    isPluginEnabled,
    pluginRequiresRestart,
    startDependenciesRecursive,
    startPlugin,
    stopPlugin,
} from "@api/PluginManager";
import { useSettings } from "@api/Settings";
import { openPluginModal } from "@components/settings/tabs";
import { Switch } from "@components/Switch";
import { classes } from "@utils/misc";
import { Plugin } from "@utils/types";
import { React, showToast, Toasts, useMemo, useState } from "@webpack/common";
import { Settings } from "Vencord";
import Plugins from "~plugins";

import { GUIDE_CATEGORIES } from "../guideData";
import { collectGuideEntries, filterGuideEntries, groupGuideEntries } from "../pluginGuide";

const CATEGORY_ICON: Record<string, string> = {
    core: "⚡",
    chat: "💬",
    voice: "🎙️",
    ui: "🎨",
    privacy: "🛡️",
    tools: "🧰",
    advanced: "⚠️",
    other: "📦",
};

function togglePluginEnabled(plugin: Plugin) {
    const settings = Settings.plugins[plugin.name];
    const wasEnabled = isPluginEnabled(plugin.name);

    if (plugin.required || plugin.isDependency) return;

    if (!wasEnabled) {
        const { restartNeeded, failures } = startDependenciesRecursive(plugin);

        if (failures.length) {
            showNotice("Dependencies failed: " + failures.join(", "), "Close", () => null);
            return;
        }

        if (restartNeeded) {
            settings.enabled = true;
            showToast(`${plugin.name} enabled — restart Discord to apply`, Toasts.Type.MESSAGE);
            return;
        }
    }

    if (pluginRequiresRestart(plugin)) {
        settings.enabled = !wasEnabled;
        showToast(`${plugin.name} ${settings.enabled ? "enabled" : "disabled"} — restart Discord to apply`, Toasts.Type.MESSAGE);
        return;
    }

    if (wasEnabled && !plugin.started) {
        settings.enabled = !wasEnabled;
        return;
    }

    const result = wasEnabled ? stopPlugin(plugin) : startPlugin(plugin);

    if (!result) {
        settings.enabled = false;
        showToast(`Error while ${wasEnabled ? "stopping" : "starting"} ${plugin.name}`, Toasts.Type.FAILURE);
        return;
    }

    settings.enabled = !wasEnabled;
}

function PluginRow({ entry }: { entry: ReturnType<typeof collectGuideEntries>[number]; }) {
    const plugin = Plugins[entry.name];
    const enabled = isPluginEnabled(entry.name);
    const locked = Boolean(plugin?.required || plugin?.isDependency);

    return (
        <div className={classes("mhub-plugin-row", !enabled && "mhub-plugin-row-off")}>
            <button
                type="button"
                className="mhub-plugin-row-open"
                disabled={!plugin}
                onClick={() => plugin && openPluginModal(plugin)}
            >
                <div className="mhub-plugin-row-main">
                    <div className="mhub-plugin-row-top">
                        <span className="mhub-plugin-row-name">{entry.name}</span>
                        <div className="mhub-plugin-row-badges">
                            {entry.isMoggcord && <span className="mhub-tag mhub-tag-brand">Moggcord</span>}
                            {entry.hasSettings && <span className="mhub-tag mhub-tag-muted">⚙</span>}
                        </div>
                    </div>
                    <p className="mhub-plugin-row-desc">{entry.description}</p>
                </div>
                {plugin && <span className="mhub-plugin-row-arrow" aria-hidden>›</span>}
            </button>
            <div
                className="mhub-plugin-row-toggle"
                onClick={e => e.stopPropagation()}
            >
                <Switch
                    checked={enabled}
                    disabled={!plugin || locked}
                    onChange={() => plugin && togglePluginEnabled(plugin)}
                />
            </div>
        </div>
    );
}

export function GuideTab() {
    useSettings(["plugins.*"]);

    const [query, setQuery] = useState("");
    const [onlyActive, setOnlyActive] = useState(false);
    const [onlyMoggcord, setOnlyMoggcord] = useState(false);
    const [category, setCategory] = useState<string>("all");

    const allEntries = collectGuideEntries(false);

    const filtered = useMemo(() => {
        let list = filterGuideEntries(allEntries, query);
        if (onlyActive) list = list.filter(e => e.enabled);
        if (onlyMoggcord) list = list.filter(e => e.isMoggcord);
        if (category !== "all") list = list.filter(e => e.categoryId === category);
        return list;
    }, [allEntries, query, onlyActive, onlyMoggcord, category]);

    const grouped = useMemo(() => groupGuideEntries(filtered), [filtered]);

    const stats = useMemo(() => ({
        total: allEntries.length,
        active: allEntries.filter(e => e.enabled).length,
        moggcord: allEntries.filter(e => e.isMoggcord).length,
    }), [allEntries]);

    const categoryCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const e of allEntries) {
            counts.set(e.categoryId, (counts.get(e.categoryId) ?? 0) + 1);
        }
        return counts;
    }, [allEntries]);

    const isSearching = query.trim().length > 0 || onlyActive || onlyMoggcord;

    return (
        <div className="mhub-guide">
            <div className="mhub-guide-hero">
                <div className="mhub-guide-hero-text">
                    <h2>Plugin-Guide</h2>
                    <p>
                        Alle Plugins auf einen Blick — ein- und ausschalten oder Details öffnen.
                    </p>
                </div>
                <div className="mhub-stat-row">
                    <div className="mhub-stat-box">
                        <span className="mhub-stat-num">{stats.total}</span>
                        <span className="mhub-stat-label">Plugins</span>
                    </div>
                    <div className="mhub-stat-box mhub-stat-box-green">
                        <span className="mhub-stat-num">{stats.active}</span>
                        <span className="mhub-stat-label">Aktiv</span>
                    </div>
                    <div className="mhub-stat-box mhub-stat-box-blue">
                        <span className="mhub-stat-num">{stats.moggcord}</span>
                        <span className="mhub-stat-label">Moggcord</span>
                    </div>
                </div>
            </div>

            <div className="mhub-guide-controls">
                <label className="mhub-search">
                    <svg className="mhub-search-icon" aria-hidden viewBox="0 0 24 24" width="16" height="16">
                        <path
                            fill="currentColor"
                            d="M21 20.29L18.73 18a8.9 8.9 0 1 0-1.44 1.44L20.29 21a1 1 0 0 0 1.42-1.42ZM4 11a7 7 0 1 1 7 7 7 7 0 0 1-7-7Z"
                        />
                    </svg>
                    <input
                        type="search"
                        className="mhub-search-input"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Plugin suchen…"
                        spellCheck={false}
                    />
                    {query && (
                        <button
                            type="button"
                            className="mhub-search-clear"
                            aria-label="Suche löschen"
                            onClick={() => setQuery("")}
                        >
                            ×
                        </button>
                    )}
                </label>
                <div className="mhub-guide-filters">
                    <button
                        type="button"
                        className={classes("mhub-filter-chip", onlyActive && "active")}
                        onClick={() => setOnlyActive(v => !v)}
                    >
                        Nur aktive
                    </button>
                    <button
                        type="button"
                        className={classes("mhub-filter-chip", onlyMoggcord && "active")}
                        onClick={() => setOnlyMoggcord(v => !v)}
                    >
                        Nur Moggcord
                    </button>
                </div>
            </div>

            <div className="mhub-guide-body">
                {!isSearching && (
                    <aside className="mhub-guide-sidebar">
                        <div className="mhub-guide-sidebar-scroll">
                            <button
                                type="button"
                                className={classes("mhub-cat-btn", category === "all" && "active")}
                                onClick={() => setCategory("all")}
                            >
                                <span className="mhub-cat-icon">✦</span>
                                <span className="mhub-cat-label">Alle</span>
                                <span className="mhub-cat-count">{allEntries.length}</span>
                            </button>
                            {GUIDE_CATEGORIES.map(cat => {
                                const count = categoryCounts.get(cat.id) ?? 0;
                                if (!count) return null;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        className={classes("mhub-cat-btn", `mhub-cat-${cat.id}`, category === cat.id && "active")}
                                        onClick={() => setCategory(cat.id)}
                                    >
                                        <span className="mhub-cat-icon">{CATEGORY_ICON[cat.id] ?? "•"}</span>
                                        <span className="mhub-cat-label">{cat.label}</span>
                                        <span className="mhub-cat-count">{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </aside>
                )}

                <div className="mhub-guide-main">
                    <div className="mhub-guide-main-scroll">
                        {filtered.length === 0 ? (
                            <div className="mhub-state">Keine Plugins gefunden.</div>
                        ) : isSearching || category !== "all" ? (
                            <div className="mhub-plugin-list">
                                {filtered.map(entry => (
                                    <PluginRow key={entry.name} entry={entry} />
                                ))}
                            </div>
                        ) : (
                            grouped.map(section => (
                                <div key={section.id} className="mhub-guide-block">
                                    <header className={`mhub-guide-block-head mhub-cat-head-${section.id}`}>
                                        <span className="mhub-guide-block-icon">{CATEGORY_ICON[section.id] ?? "•"}</span>
                                        <div>
                                            <h3>{section.label}</h3>
                                            <p>{section.description}</p>
                                        </div>
                                        <span className="mhub-guide-block-count">{section.plugins.length}</span>
                                    </header>
                                    <div className="mhub-plugin-list">
                                        {section.plugins.map(entry => (
                                            <PluginRow key={entry.name} entry={entry} />
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

}
