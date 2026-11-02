/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, readdir, stat, open, unlink, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, join, relative, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const sources = ["github", "stripe", "kosten"];
const maxFileBytes = 10 * 1024 * 1024;
const digest = value => createHash("sha256").update(value).digest("hex");
const canon = value => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const aliases = {
    id: ["transaction_id", "balance_transaction_id", "id", "reference"],
    date: ["date", "transaction_date", "created_at", "created (UTC)", "created_utc"],
    type: ["type", "transaction_type", "reporting_category"],
    currency: ["currency"],
    gross: ["gross", "gross_amount", "amount", "amount_in_cents"],
    fee: ["fee", "fees"],
    net: ["net", "net_amount"],
    receipt: ["receipt", "beleg"],
    status: ["status"]
};

export function parseCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/, 1)[0];
    let inHeaderQuote = false, semicolons = 0, commas = 0;
    for (const char of first) {
        if (char === '"') inHeaderQuote = !inHeaderQuote;
        else if (!inHeaderQuote) { if (char === ";") semicolons++; if (char === ",") commas++; }
    }
    const delimiter = semicolons > commas ? ";" : ",";
    const rows = []; let row = [], cell = "", quoted = false, closed = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quoted) {
            if (char === '"' && text[index + 1] === '"') { cell += '"'; index++; }
            else if (char === '"') { quoted = false; closed = true; }
            else cell += char;
        } else if (char === delimiter) { row.push(cell); cell = ""; closed = false; }
        else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[index + 1] === "\n") index++;
            row.push(cell); if (row.some(value => value.trim())) rows.push(row);
            row = []; cell = ""; closed = false;
        } else if (char === '"' && !cell && !closed) quoted = true;
        else {
            if (closed || char === '"') throw new Error("Ungültige CSV-Anführungszeichen.");
            cell += char;
        }
    }
    if (quoted) throw new Error("CSV-Datei ist noch unvollständig oder beschädigt.");
    if (row.length || cell || closed) { row.push(cell); if (row.some(value => value.trim())) rows.push(row); }
    return rows;
}

export function money(value, minor = false) {
    const text = String(value).trim();
    if (!(minor ? /^-?\d+$/ : /^-?\d+(?:[.,]\d{1,2})?$/).test(text))
        throw new Error("Betrag ist mehrdeutig oder ungültig. Keine Tausendertrennzeichen verwenden.");
    if (text.length > 20) throw new Error("Betrag ist zu groß.");
    if (minor) return BigInt(text);
    const [whole, fraction = ""] = text.replace(",", ".").replace(/^-/, "").split(".");
    const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    return text.startsWith("-") ? -amount : amount;
}

const formatMoney = value => value == null ? "" : `${BigInt(value) < 0n ? "-" : ""}${(BigInt(value) < 0n ? -BigInt(value) : BigInt(value)) / 100n}.${String((BigInt(value) < 0n ? -BigInt(value) : BigInt(value)) % 100n).padStart(2, "0")}`;
const html = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export const csvCell = value => {
    let text = String(value ?? "");
    if (/^[\s\u0000-\u0020]*[=+@-]/.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
};

function normalize(row, headers, source, config, warnings) {
    const mapping = config.columns ?? {};
    const column = key => {
        const names = mapping[key] ? [mapping[key]] : aliases[key];
        const matches = names.map(name => headers.indexOf(canon(name))).filter(index => index >= 0);
        if (new Set(matches).size > 1) throw new Error(`Spalte ${key} ist mehrdeutig. In einstellungen.json zuordnen.`);
        return matches[0] ?? -1;
    };
    const get = key => row[column(key)]?.trim() ?? "";
    const id = get("id"), dateText = get("date");
    if (!id || id.length > 200 || /[\u0000-\u001f]/.test(id)) throw new Error("Eindeutige Transaktions-ID fehlt oder ist ungültig.");
    if (!/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(dateText)) throw new Error("Datum muss im ISO-Format YYYY-MM-DD vorliegen.");
    const day = dateText.slice(0, 10);
    if (Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)
        throw new Error("Datum ist ungültig.");
    let date = day;
    if (dateText.length > 10) {
        let timestamp = dateText;
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp)) {
            if (!headers[column("date")]?.includes("utc")) throw new Error("Zeitzone des Zeitstempels fehlt.");
            timestamp = timestamp.replace(" ", "T") + "Z";
        }
        if (Number.isNaN(Date.parse(timestamp))) throw new Error("Zeitstempel ist ungültig.");
        date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
    }
    const currency = (get("currency") || config.currency || "").toUpperCase();
    if (!["EUR", "USD", "GBP", "CHF"].includes(currency)) throw new Error("Währung fehlt oder wird nicht unterstützt. EUR, USD, GBP und CHF sind möglich.");
    const typeNames = { income: "income", sponsorship: "income", payment: "income", charge: "income", refund: "refund", payment_refund: "refund", expense: "expense", payout: "transfer", transfer: "transfer" };
    const rawType = get("type").toLowerCase();
    const type = Object.hasOwn(typeNames, rawType) ? typeNames[rawType] : null;
    if (!type || (source === "kosten" && type !== "expense") || (source !== "kosten" && type === "expense")) throw new Error("Buchungsart fehlt oder ist unbekannt. Keine automatische Einordnung.");
    const status = get("status").toLowerCase();
    if (status && !["paid", "succeeded", "completed", "settled"].includes(status)) throw new Error("Zahlung ist nicht als abgeschlossen bestätigt.");
    const centsHeader = headers[column("gross")]?.includes("incents");
    if (centsHeader && config.units !== "minor" && (get("fee") || get("net"))) throw new Error("Cent-Beträge und weitere Geldspalten: Betragseinheit in einstellungen.json ausdrücklich auf minor setzen.");
    const minor = config.units === "minor" || centsHeader;
    if (!get("gross")) throw new Error("Bruttobetrag fehlt. Auszahlungsbeträge nicht als Einnahme ersetzen.");
    const gross = money(get("gross"), minor);
    const fee = get("fee") ? money(get("fee"), config.units === "minor") : null;
    const net = get("net") ? money(get("net"), config.units === "minor") : null;
    if (fee != null && net != null && gross - fee !== net) throw new Error("Brutto minus Gebühren stimmt nicht mit Netto überein.");
    if ((type === "income" && gross < 0n) || (type === "refund" && gross > 0n) || (type === "expense" && gross < 0n))
        throw new Error("Vorzeichen passt nicht zur Buchungsart. Erstattungen negativ, Einnahmen und Kosten positiv angeben.");
    if (fee == null && net == null && type !== "expense" && type !== "transfer") warnings.push("Gebühren und Netto fehlen; es wurde keine gebührenfreie Zahlung unterstellt.");
    if (currency !== "EUR") warnings.push("Fremdwährung: Euro-Bewertung für die steuerliche Prüfung fehlt; keine automatische Umrechnung.");
    if (type === "expense" && !get("receipt")) warnings.push("Kostenbeleg fehlt. Eine steuerliche Abziehbarkeit wurde nicht geprüft.");
    return { source, id, date, dateOriginal: dateText, type, currency, gross: String(gross), fee: fee != null ? String(fee) : net != null ? String(gross - net) : null, net: net != null ? String(net) : fee != null ? String(gross - fee) : null, receipt: get("receipt") };
}

export async function run(dataDirectory) {
    const directory = resolve(dataDirectory);
    await mkdir(directory, { recursive: true });
    const marker = join(directory, ".moggcord-records");
    try { await readFile(marker); } catch (error) {
        if (error.code !== "ENOENT") throw error;
        if ((await readdir(directory)).length) throw new Error("Datenordner ist nicht leer und gehört nicht diesem Programm. Einen neuen Ordner auswählen.");
        await writeFile(marker, "Moggcord sponsor records v1\n", { flag: "wx", mode: 0o600 });
    }
    const lockPath = join(directory, "prozess.lock");
    const lock = await open(lockPath, "wx", 0o600).catch(error => { if (error.code === "EEXIST") throw new Error("Es läuft bereits ein Import oder prozess.lock ist nach einem Abbruch geblieben. Erst den anderen Lauf beenden."); throw error; });
    try {
        const issues = [], records = new Map(), verifiedOriginals = new Set(); let previousHash = "", imported = 0, duplicates = 0, files = 0;
        await mkdir(join(directory, "originale"), { recursive: true });
        await mkdir(join(directory, "belege"), { recursive: true });
        for (const source of sources) await mkdir(join(directory, "eingang", source), { recursive: true });
        const configPath = join(directory, "einstellungen.json");
        let config;
        try { config = JSON.parse(await readFile(configPath, "utf8")); } catch (error) {
            if (error.code !== "ENOENT") throw error;
            config = { github: { columns: {}, units: "major" }, stripe: { columns: {}, units: "major" }, kosten: { columns: {}, units: "major" } };
            await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { flag: "wx", mode: 0o600 });
        }
        for (const source of sources) if (!["major", "minor"].includes(config[source]?.units)) throw new Error(`Ungültige Betragseinheit für ${source}.`);
        const journalPath = join(directory, "buchungen.jsonl");
        let journal = "";
        try { journal = await readFile(journalPath, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
        if (journal && !journal.endsWith("\n")) throw new Error("Das Buchungsjournal ist unvollständig. Originale erhalten und prüfen lassen.");
        for (const line of journal.split("\n").filter(Boolean)) {
            const event = JSON.parse(line);
            if (event.previous !== previousHash || event.hash !== digest(previousHash + "\n" + JSON.stringify(event.record))) throw new Error("Das Buchungsjournal wurde verändert oder ist beschädigt. Originale erhalten und prüfen lassen.");
            if (!/^[a-f0-9]{64}$/.test(event.record.original)) throw new Error("Originalverweis im Journal ist ungültig.");
            if (!verifiedOriginals.has(event.record.original)) {
                const original = await readFile(join(directory, "originale", `${event.record.original}.csv`)).catch(() => null);
                if (!original || digest(original) !== event.record.original) throw new Error("Ein Original zum Buchungsjournal fehlt oder wurde verändert. Unterlagen prüfen lassen.");
                verifiedOriginals.add(event.record.original);
            }
            previousHash = event.hash;
            if (records.has(`${event.record.source}:${event.record.id}`)) throw new Error("Transaktions-ID im Journal mehrfach vorhanden. Journal prüfen lassen.");
            records.set(`${event.record.source}:${event.record.id}`, event.record);
        }
        const pending = [];
        for (const source of sources) {
            const inputDirectory = join(directory, "eingang", source);
            for (const entry of (await readdir(inputDirectory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
                const location = `${source}/${entry.name}`;
                if (!entry.isFile() || !/\.csv$/i.test(entry.name)) { issues.push(`${location}: Nur CSV-Dateien werden eingelesen; andere Dateien nicht verarbeitet.`); continue; }
                files++;
                try {
                    const filePath = join(inputDirectory, entry.name);
                    if ((await stat(filePath)).size > maxFileBytes) throw new Error("Datei ist größer als 10 MB.");
                    const bytes = await readFile(filePath), fileHash = digest(bytes);
                    const originalPath = join(directory, "originale", `${fileHash}.csv`);
                    try { await writeFile(originalPath, bytes, { flag: "wx", mode: 0o600 }); } catch (error) { if (error.code !== "EEXIST") throw error; if (digest(await readFile(originalPath)) !== fileHash) throw new Error("Gesichertes Original wurde verändert."); }
                    const rows = parseCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
                    if (!rows.length) throw new Error("Leere Datei ohne Spaltenüberschriften.");
                    const headers = rows.shift().map(canon);
                    if (headers.some(value => !value) || new Set(headers).size !== headers.length) throw new Error("Leere oder doppelte Spaltenüberschriften.");
                    if (!rows.length) issues.push(`${location}: Datei enthält keine Transaktionen; der abgedeckte Zeitraum ist nicht bestätigt.`);
                    for (const [index, row] of rows.entries()) {
                        try {
                            if (row.length !== headers.length) throw new Error("Anzahl der Felder passt nicht zur Kopfzeile.");
                            const warnings = [];
                            const record = normalize(row, headers, source, config[source], warnings);
                            if (record.receipt) {
                                const receiptPath = resolve(directory, "belege", record.receipt), within = relative(join(directory, "belege"), receiptPath);
                                if (isAbsolute(within) || within === ".." || within.startsWith("../") || within.startsWith("..\\")) throw new Error("Belegpfad liegt außerhalb des Belegordners.");
                                if (!(await stat(receiptPath).catch(() => null))?.isFile()) warnings.push("Angegebener Beleg ist im Belegordner nicht vorhanden.");
                            }
                            const key = `${source}:${record.id}`, previous = records.get(key);
                            if (previous && JSON.stringify(previous.data) !== JSON.stringify(record)) throw new Error("Widerspruch zu einer vorhandenen Transaktions-ID. Keine Buchung wurde überschrieben.");
                            if (previous) duplicates++;
                            else {
                                const saved = { source, id: record.id, data: record, original: fileHash, row: index + 2, importedAt: new Date().toISOString() };
                                const event = { previous: previousHash, record: saved, hash: digest(previousHash + "\n" + JSON.stringify(saved)) };
                                previousHash = event.hash; pending.push(JSON.stringify(event) + "\n"); records.set(key, saved); imported++;
                            }
                            for (const warning of warnings) issues.push(`${location}, Datensatz ${index + 2}: ${warning}`);
                        } catch (error) { issues.push(`${location}, Datensatz ${index + 2}: ${error.message}`); }
                    }
                } catch (error) { issues.push(`${location}: ${error.message}`); }
            }
        }
        if (pending.length) {
            const handle = await open(journalPath, "a", 0o600);
            try { await handle.writeFile(pending.join("")); await handle.sync(); } finally { await handle.close(); }
        }
        const rows = [...records.values()].map(saved => saved.data).sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
        if (!files) issues.push("Noch keine Abrechnungsdateien vorhanden. Das ist kein Nachweis, dass keine Einnahmen vorliegen.");
        if (new Set(rows.filter(row => row.type !== "expense").map(row => row.source)).size > 1) issues.push("GitHub und Stripe können dieselben Zahlungen enthalten. Quellen bleiben getrennt; ihre Summen nicht zusammenzählen.");
        const groups = new Map();
        for (const row of rows.filter(row => row.type !== "transfer")) {
            const key = `${row.source} / ${row.date.slice(0, 7)} / ${row.currency} / ${row.type}`;
            const group = groups.get(key) ?? { gross: 0n, fee: 0n, net: 0n, missing: false };
            group.gross += BigInt(row.gross);
            if (row.fee == null || row.net == null) group.missing = true;
            else { group.fee += BigInt(row.fee); group.net += BigInt(row.net); }
            groups.set(key, group);
        }
        const exportRows = [["Quelle", "ID", "Datum laut Quelle (Berlin)", "Originaldatum", "Art", "Währung", "Brutto", "Gebühren", "Netto", "Beleg"], ...rows.map(row => [row.source, row.id, row.date, row.dateOriginal, row.type, row.currency, formatMoney(row.gross), formatMoney(row.fee), formatMoney(row.net), row.receipt])];
        const saveReport = async (name, text) => {
            const target = join(directory, name), temporary = target + ".tmp";
            await writeFile(temporary, text, { mode: 0o600 });
            await rename(temporary, target);
        };
        await saveReport("buchungen.csv", "\uFEFF" + exportRows.map(row => row.map(csvCell).join(";")).join("\r\n") + "\r\n");
        const checks = issues.length ? issues.map(issue => `<li>${html(issue)}</li>`).join("") : "<li>Keine Datenfehler in den eingelesenen Dateien erkannt. Vollständigkeit der Abrechnungen und steuerliche Einordnung sind nicht bestätigt.</li>";
        const totals = [...groups.entries()].map(([key, group]) => `<tr><td>${html(key)}</td><td>${formatMoney(group.gross)}</td><td>${group.missing ? "unvollständig" : formatMoney(group.fee)}</td><td>${group.missing ? "unvollständig" : formatMoney(group.net)}</td></tr>`).join("");
        const report = `<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="30"><title>Moggcord Abrechnungen</title><style>body{font:16px/1.6 system-ui;background:#0d1017;color:#ebedf7;max-width:1000px;margin:48px auto;padding:0 24px}h1{line-height:1.2}section{background:#171c28;padding:24px;border-radius:16px;margin:20px 0}h2{margin-top:0;color:#c4bbff}table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:10px;border-bottom:1px solid #343b4d}.table{overflow:auto}li{margin:8px 0}a{color:#c4bbff}</style><h1>Moggcord Abrechnungen</h1><p>Geprüft: ${html(new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }))} · ${files} Quelldateien · ${rows.length} Buchungen</p><section><h2>Unterlagen prüfen</h2><ul>${checks}</ul></section><section><h2>Monatsübersicht je Quelle und Währung</h2><p>Keine Steuerberechnung. Auszahlungen und Umbuchungen sind keine zusätzlichen Einnahmen und fehlen in dieser Summenübersicht. Projektkosten sind getrennt aufgeführt, ihre Abziehbarkeit ist nicht geprüft.</p><div class="table"><table><thead><tr><th>Quelle / Monat / Währung / Art</th><th>Brutto</th><th>Gebühren</th><th>Netto</th></tr></thead><tbody>${totals || '<tr><td colspan="4">Noch keine auswertbaren Buchungen.</td></tr>'}</tbody></table></div><p><a href="buchungen.csv">Buchungsliste öffnen</a></p></section><section><h2>Steuerliche Einordnung bleibt offen</h2><p>Mit Finanzamt oder Steuerberatung klären: Anmeldung der Tätigkeit, Einkunftsart, Umsatzsteuer und steuerlicher Zuflusszeitpunkt. Das Quelldatum ist keine Festlegung des steuerlichen Zuflusses. Das Programm reicht keine Steuererklärung ein und bestätigt keine GoBD-Konformität oder rechtliche Fehlerfreiheit. Es liest nur lokale Dateien und sendet keine Daten ins Internet.</p><p>Originale und Buchungsjournal aufbewahren. Fehlende Monate oder andere Einnahmequellen erkennt das Programm ohne vollständige Unterlagen nicht.</p></section></html>`;
        await saveReport("übersicht.html", report);
        await saveReport("prüfbedarf.txt", [...issues, "Steuerliche Einordnung und Vollständigkeit der Unterlagen sind nicht bestätigt."].join("\n") + "\n");
        return { imported, duplicates, issues: issues.length, records: rows.length, directory };
    } finally { await lock.close(); await unlink(lockPath); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const args = process.argv.slice(2);
    const dataIndex = args.indexOf("--data");
    if (args.some((arg, index) => !["--watch", "--data"].includes(arg) && !(dataIndex >= 0 && index === dataIndex + 1)) || args.filter(arg => arg === "--data").length > 1 || dataIndex >= 0 && (!args[dataIndex + 1] || args[dataIndex + 1].startsWith("--"))) {
        console.error("Aufruf: node scripts/sponsor-records.mjs [--data ORDNER] [--watch]"); process.exitCode = 1;
    } else {
        const directory = dataIndex >= 0 ? args[dataIndex + 1] : join(homedir(), "Documents", "Moggcord-Abrechnungen");
        do {
            try { const result = await run(directory); console.log(`Prüfung abgeschlossen: ${result.imported} neu, ${result.duplicates} bereits vorhanden, ${result.issues} Hinweise. Übersicht: ${join(result.directory, "übersicht.html")}`); }
            catch (error) { console.error(`Prüfung fehlgeschlagen: ${error.message}`); if (!args.includes("--watch")) process.exitCode = 1; }
            if (!args.includes("--watch")) break;
            await delay(15000);
        } while (true);
    }
}
