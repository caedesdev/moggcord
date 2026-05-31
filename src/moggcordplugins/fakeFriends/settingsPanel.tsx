/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { classes } from "@utils/misc";
import { React, useReducer, useState } from "@webpack/common";

import {
    getFakeFriendEntries,
    importFromAllServers,
    removeAllFakeFriends,
    removeFakeFriendById,
    type FakeFriendMode,
} from "./state";

export function FakeFriendsSettings() {
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    const [count, setCount] = useState("25");
    const [mode, setMode] = useState<FakeFriendMode>("pending");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    const entries = getFakeFriendEntries();

    async function runImport() {
        const n = parseInt(count, 10);
        if (!n || n < 1) {
            setStatus("Bitte eine gültige Anzahl eingeben.");
            return;
        }

        setBusy(true);
        setStatus("Starte Import…");
        try {
            const added = await importFromAllServers(n, mode, setStatus);
            setStatus(`${added} Fake-${mode === "accepted" ? "Freunde" : "Anfragen"} hinzugefügt.`);
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
        setBusy(true);
        const n = await removeAllFakeFriends();
        setStatus(n ? `${n} Fake-Einträge entfernt.` : "Keine Fake-Einträge vorhanden.");
        refresh();
        setBusy(false);
    }

    return (
        <div className="ff-settings">
            <p className="ff-settings-desc">
                Fake-Freunde bleiben nach einem Neustart erhalten. Importiere Mitglieder von allen Servern
                oder verwalte deine Liste hier.
            </p>

            <div className="ff-settings-card">
                <h3>Von allen Servern importieren</h3>
                <div className="ff-settings-row">
                    <label className="ff-settings-field">
                        <span>Anzahl</span>
                        <input
                            type="number"
                            min={1}
                            max={99999}
                            value={count}
                            disabled={busy}
                            onChange={e => setCount(e.currentTarget.value)}
                        />
                    </label>
                    <label className="ff-settings-field">
                        <span>Typ</span>
                        <select
                            value={mode}
                            disabled={busy}
                            onChange={e => setMode(e.currentTarget.value as FakeFriendMode)}
                        >
                            <option value="accepted">Fake-Freunde</option>
                            <option value="pending">Fake-Anfragen</option>
                        </select>
                    </label>
                </div>
                <Button size="small" disabled={busy} onClick={runImport}>
                    {busy ? "Import läuft…" : "Importieren"}
                </Button>
            </div>

            <div className="ff-settings-card">
                <div className="ff-settings-list-head">
                    <h3>Gespeicherte Einträge ({entries.length})</h3>
                    <Button size="small" variant="dangerPrimary" disabled={busy || !entries.length} onClick={removeAll}>
                        Alle entfernen
                    </Button>
                </div>

                {entries.length === 0 ? (
                    <p className="ff-settings-empty">Noch keine Fake-Freunde gespeichert.</p>
                ) : (
                    <ul className="ff-settings-list">
                        {entries.map(entry => (
                            <li key={entry.id} className="ff-settings-list-item">
                                <div className="ff-settings-list-main">
                                    <span className="ff-settings-name">{entry.name}</span>
                                    <span className={classes("ff-settings-badge", entry.state === "accepted" && "ff-settings-badge-friend")}>
                                        {entry.state === "accepted" ? "Freund" : "Anfrage"}
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
