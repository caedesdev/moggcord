/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, useReducer, useState } from "@webpack/common";

import {
    clearFakeFriendsPersistedOnly,
    getFakeFriendEntries,
    importFromAllServers,
    reapplyFakeStates,
    removeAllFakeFriends,
    removeFakeFriendById,
    MAX_FAKE_IMPORT,
} from "./state";

export function FakeFriendsSettings() {
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    const [count, setCount] = useState("25");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const LIST_CAP = 80;
    const entries = getFakeFriendEntries();
    const listOverflow = entries.length > LIST_CAP;
    const visibleEntries = listOverflow ? entries.slice(0, LIST_CAP) : entries;

    async function runImport() {
        const n = parseInt(count, 10);
        if (!n || n < 1) {
            setStatus("Bitte eine gültige Anzahl eingeben.");
            return;
        }
        if (n > MAX_FAKE_IMPORT) {
            setStatus(`Maximal ${MAX_FAKE_IMPORT} pro Import.`);
            return;
        }

        setBusy(true);
        setStatus("Starte Import…");
        try {
            const added = await importFromAllServers(n, "pending", setStatus);
            setStatus(`${added} Fake-Anfragen hinzugefügt.`);
            refresh();
        } catch (e: any) {
            setStatus(e?.message ?? "Import fehlgeschlagen.");
        } finally {
            setBusy(false);
        }
    }

    async function removeOne(id: string) {
        await removeFakeFriendById(id);
        refresh();
    }

    async function removeAll() {
        if (entries.length > 200 && !confirm(`${entries.length} Fake-Einträge wirklich alle entfernen? Das kann einige Sekunden dauern.`)) {
            return;
        }
        setBusy(true);
        setStatus("Entferne gespeicherte Einträge…");
        try {
            const n = await removeAllFakeFriends(setStatus);
            setStatus(n ? `${n} Fake-Einträge entfernt.` : "Keine Fake-Einträge vorhanden.");
            refresh();
        } catch (e: any) {
            setStatus(e?.message ?? "Entfernen fehlgeschlagen — Discord neu laden (Ctrl+R).");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="ff-settings">
            <p className="ff-settings-desc">
                Nur eingehende Fake-Anfragen (pending) — keine Fake-Freundesliste. Max. {MAX_FAKE_IMPORT} pro Import.
                Nach Neustart: große Listen werden nur im Store synchronisiert (kein Flux-Sturm).
            </p>

            <div className="ff-settings-card">
                <h3>Nach Neustart</h3>
                <Button
                    size="small"
                    disabled={busy || !entries.length}
                    onClick={async () => {
                        setBusy(true);
                        setStatus("Stelle Fake-Anfragen wieder her…");
                        try {
                            await reapplyFakeStates(setStatus);
                            setStatus("Anzeige aktualisiert.");
                            refresh();
                        } catch {
                            setStatus("Aktualisierung fehlgeschlagen.");
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    Anzeige aktualisieren
                </Button>
            </div>

            <div className="ff-settings-card">
                <h3>Von allen Servern importieren</h3>
                <div className="ff-settings-row">
                    <label className="ff-settings-field">
                        <span>Anzahl</span>
                        <input
                            type="number"
                            min={1}
                            max={MAX_FAKE_IMPORT}
                            value={count}
                            disabled={busy}
                            onChange={e => setCount(e.currentTarget.value)}
                        />
                    </label>
                </div>
                <Button size="small" disabled={busy} onClick={runImport}>
                    {busy ? "Import läuft…" : "Importieren"}
                </Button>
            </div>

            <div className="ff-settings-card">
                <div className="ff-settings-list-head">
                    <h3>Gespeicherte Einträge ({entries.length})</h3>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <Button size="small" variant="dangerPrimary" disabled={busy || !entries.length} onClick={removeAll}>
                            Alle entfernen
                        </Button>
                        {entries.length > 200 && (
                            <Button
                                size="small"
                                variant="dangerSecondary"
                                disabled={busy || !entries.length}
                                onClick={async () => {
                                    if (!confirm("Notfall-Löschen: nur gespeicherter Speicher, ohne 1500 Discord-Events. Fortfahren?")) return;
                                    setBusy(true);
                                    setStatus("Notfall-Löschen…");
                                    try {
                                        const n = await clearFakeFriendsPersistedOnly();
                                        setStatus(`${n} Einträge aus dem Speicher entfernt. Bei Bedarf Ctrl+R.`);
                                        refresh();
                                    } finally {
                                        setBusy(false);
                                    }
                                }}
                            >
                                Notfall (nur Speicher)
                            </Button>
                        )}
                    </div>
                </div>

                {listOverflow && (
                    <p className="ff-settings-empty">
                        Liste zeigt die ersten {LIST_CAP} von {entries.length} — „Alle entfernen“ löscht trotzdem alles.
                    </p>
                )}

                {entries.length === 0 ? (
                    <p className="ff-settings-empty">Noch keine Fake-Freunde gespeichert.</p>
                ) : (
                    <ul className="ff-settings-list">
                        {visibleEntries.map(entry => (
                            <li key={entry.id} className="ff-settings-list-item">
                                <div className="ff-settings-list-main">
                                    <span className="ff-settings-name">{entry.name}</span>
                                    <span className="ff-settings-badge">
                                        Anfrage
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="ff-settings-remove"
                                    disabled={busy}
                                    onClick={() => removeOne(entry.id)}
                                >
                                    Entfernen
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {status && <p className="ff-settings-status">{status}</p>}
        </div>
    );
}
