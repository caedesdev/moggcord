/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCsv, money, csvCell, run } from "../sponsor-records.mjs";

async function setup(t) {
    const directory = await mkdtemp(join(tmpdir(), "moggcord-records-"));
    t.after(async () => {
        assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
        assert.match(basename(directory), /^moggcord-records-/);
        await rm(directory, { recursive: true, force: true });
    });
    await run(directory);
    return { directory, input: (source, name, content) => writeFile(join(directory, "eingang", source, name), content), read: name => readFile(join(directory, name), "utf8") };
}
const header = "id,date,type,currency,gross,fee,net,receipt\n";

test("CSV preserves quoted delimiters, escaped quotes, CRLF and multiline values", () => {
    assert.deepEqual(parseCsv('\uFEFF"id;ref",date\r\n"a,b",2026-01-01\r\n'), [["id;ref", "date"], ["a,b", "2026-01-01"]]);
    assert.deepEqual(parseCsv('id;note\r\na;"line 1\nline ""2"""\r\n'), [["id", "note"], ["a", 'line 1\nline "2"']]);
    assert.throws(() => parseCsv('id,note\na,"unfinished'), /unvollständig/);
});

test("money is exact and refuses ambiguous or excessive precision", () => {
    assert.equal(money("0.10") + money("0.20"), 30n);
    assert.equal(money("-1,05"), -105n);
    assert.equal(money("1234", true), 1234n);
    for (const value of ["1,234", "1.234,56", "1e3", "Infinity", "0.005", "", "=1+2"]) assert.throws(() => money(value));
});

test("imports once across repeated and overlapping statements, retains originals and exact totals", async t => {
    const data = await setup(t);
    await data.input("github", "november.csv", header + "one,2026-11-02,income,EUR,0.10,0.00,0.10,\ntwo,2026-11-02,income,EUR,0.20,0.00,0.20,\n");
    assert.equal((await run(data.directory)).imported, 2);
    const journal = await data.read("buchungen.jsonl");
    await data.input("github", "overlap.csv", header + "one,2026-11-02,income,EUR,0.10,0.00,0.10,\n");
    const again = await run(data.directory);
    assert.equal(again.imported, 0); assert.equal(again.records, 2); assert.equal(again.duplicates, 3);
    assert.equal(await data.read("buchungen.jsonl"), journal);
    assert.match(await data.read("übersicht.html"), /0\.30/);
    const saved = JSON.parse(journal.split("\n")[0]);
    assert.equal(await readFile(join(data.directory, "originale", saved.record.original + ".csv"), "utf8"), await readFile(join(data.directory, "eingang/github/november.csv"), "utf8"));
});

test("conflicting IDs and inconsistent money are flagged without overwriting", async t => {
    const data = await setup(t);
    await data.input("github", "a.csv", header + "one,2026-11-02,income,EUR,10.00,1.00,9.00,\n");
    await run(data.directory); const original = await data.read("buchungen.jsonl");
    await data.input("github", "b.csv", header + "one,2026-11-02,income,EUR,20.00,1.00,19.00,\nbad,2026-11-02,income,EUR,10.00,1.00,8.00,\n");
    const result = await run(data.directory);
    assert.equal(result.records, 1); assert.equal(result.imported, 0); assert.equal(await data.read("buchungen.jsonl"), original);
    assert.match(await data.read("prüfbedarf.txt"), /Widerspruch/); assert.match(await data.read("prüfbedarf.txt"), /Brutto minus/);
});

test("refunds reduce source income while payouts are excluded, currencies and sources stay separate", async t => {
    const data = await setup(t);
    await data.input("github", "a.csv", header + "income,2026-11-02,charge,USD,10.00,0.00,10.00,\nrefund,2026-11-03,refund,USD,-2.00,0.00,-2.00,\npayout,2026-11-04,payout,USD,-8.00,0.00,-8.00,\n");
    await data.input("stripe", "b.csv", header + "txn_a,2026-11-02,payment,EUR,9.00,1.00,8.00,\n");
    assert.equal((await run(data.directory)).records, 4);
    const report = await data.read("übersicht.html");
    assert.match(report, /github \/ 2026-11 \/ USD \/ income/); assert.match(report, /stripe \/ 2026-11 \/ EUR \/ income/);
    assert(!report.includes("USD / transfer")); assert.match(await data.read("prüfbedarf.txt"), /dieselben Zahlungen/); assert.match(await data.read("prüfbedarf.txt"), /Euro-Bewertung/);
});

test("unknown and pending transaction types, impossible dates and missing currencies are rejected", async t => {
    const data = await setup(t);
    await data.input("github", "bad.csv", header + "a,2026-11-02,monthly,EUR,1,0,1,\nb,2026-02-30,income,EUR,1,0,1,\nc,2026-11-02,income,,1,0,1,\nd,2026-11-02,income,JPY,1,0,1,\ne,2026-11-02,constructor,EUR,1,0,1,\n");
    await data.input("stripe", "pending.csv", header.trim() + ",status\na,2026-11-02,income,EUR,1,0,1,,pending\n");
    assert.equal((await run(data.directory)).records, 0);
    const issues = await data.read("prüfbedarf.txt");
    for (const pattern of [/Buchungsart/, /Datum ist ungültig/, /Währung fehlt/, /nicht als abgeschlossen/]) assert.match(issues, pattern);
});

test("missing fees remain unknown and dated UTC statements group in Berlin time", async t => {
    const data = await setup(t);
    await data.input("stripe", "utc.csv", "id,Created (UTC),type,currency,gross\na,2026-12-31 23:30:00,charge,EUR,10.00\n");
    await run(data.directory);
    const row = JSON.parse((await data.read("buchungen.jsonl")).trim()).record.data;
    assert.equal(row.date, "2027-01-01"); assert.equal(row.fee, null); assert.equal(row.net, null);
    assert.match(await data.read("übersicht.html"), /unvollständig/);
    await data.input("github", "unknown-zone.csv", "id,date,type,currency,gross\nb,2026-11-02 12:00:00,income,EUR,1.00\n");
    await run(data.directory); assert.match(await data.read("prüfbedarf.txt"), /Zeitzone/);
});

test("explicit mapping and cent units are required for ambiguous headers", async t => {
    const data = await setup(t);
    await data.input("github", "a.csv", "transaction_id,date,type,currency,amount_in_cents,fee,net\na,2026-11-02,income,USD,1000,30,970\n");
    assert.equal((await run(data.directory)).records, 0);
    const config = JSON.parse(await data.read("einstellungen.json")); config.github.units = "minor";
    await writeFile(join(data.directory, "einstellungen.json"), JSON.stringify(config));
    assert.equal((await run(data.directory)).records, 1);
    assert.match(await data.read("buchungen.csv"), /"10\.00";"0\.30";"9\.70"/);
    await data.input("stripe", "ambiguous.csv", "id,date,type,currency,gross,amount\nb,2026-11-02,charge,EUR,1,2\n");
    await run(data.directory); assert.match(await data.read("prüfbedarf.txt"), /mehrdeutig/);
});

test("expense receipts are checked without accepting paths outside the private folder", async t => {
    const data = await setup(t);
    await data.input("kosten", "a.csv", header + "missing,2026-11-02,expense,EUR,5,,,\noutside,2026-11-02,expense,EUR,5,,,../../secret.pdf\n");
    assert.equal((await run(data.directory)).records, 1);
    assert.match(await data.read("prüfbedarf.txt"), /Kostenbeleg fehlt/); assert.match(await data.read("prüfbedarf.txt"), /außerhalb/);
});

test("CSV formula injection and HTML output do not execute source text", async t => {
    assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
    assert.equal(csvCell("-2.00"), '"-2.00"');
    const data = await setup(t);
    await data.input("github", "a.csv", header + "=1+1,2026-11-02,income,EUR,1,0,1,\n");
    await data.input("github", "A&B'.csv", "broken\nrow\n");
    await run(data.directory);
    assert.match(await data.read("buchungen.csv"), /'=1\+1/);
    assert(!(await data.read("übersicht.html")).includes("<script>"));
    assert.match(await data.read("übersicht.html"), /A&amp;B&#39;\.csv/);
});

test("journal corruption, concurrent imports and unrelated data folders fail safely", async t => {
    const data = await setup(t);
    await writeFile(join(data.directory, "prozess.lock"), "busy");
    await assert.rejects(run(data.directory), /bereits ein Import/);
    await rm(join(data.directory, "prozess.lock"));
    await data.input("github", "a.csv", header + "a,2026-11-02,income,EUR,1,0,1,\n");
    await run(data.directory);
    const valid = await data.read("buchungen.jsonl");
    await writeFile(join(data.directory, "buchungen.jsonl"), valid.trimEnd());
    await assert.rejects(run(data.directory), /journal ist unvollständig/i);
    const corrupted = valid.replace('"gross":"100"', '"gross":"999"');
    await writeFile(join(data.directory, "buchungen.jsonl"), corrupted);
    await assert.rejects(run(data.directory), /journal wurde verändert/i);
    assert.equal(await data.read("buchungen.jsonl"), corrupted);
    const unrelated = join(data.directory, "unrelated"); await mkdir(unrelated); await writeFile(join(unrelated, "precious.txt"), "keep");
    await assert.rejects(run(unrelated), /nicht leer/); assert.equal(await readFile(join(unrelated, "precious.txt"), "utf8"), "keep");
});

test("empty input is not treated as proof of zero income and invalid CLI arguments fail", async t => {
    const data = await setup(t);
    assert.match(await data.read("prüfbedarf.txt"), /kein Nachweis/);
    assert.match(await data.read("übersicht.html"), /keine Steuererklärung ein/);
    const script = fileURLToPath(new URL("../sponsor-records.mjs", import.meta.url));
    for (const args of [["--unknown"], ["--data"], ["--data", data.directory, "--data", data.directory]]) {
        assert.equal(spawnSync(process.execPath, [script, ...args], { encoding: "utf8" }).status, 1);
    }
});

test("retained originals are verified even after input statements have been moved away", async t => {
    const data = await setup(t);
    await data.input("github", "a.csv", header + "a,2026-11-02,income,EUR,1,0,1,\n");
    await run(data.directory);
    const saved = JSON.parse((await data.read("buchungen.jsonl")).trim()).record;
    await rm(join(data.directory, "eingang/github/a.csv"));
    await writeFile(join(data.directory, "originale", saved.original + ".csv"), "changed");
    await assert.rejects(run(data.directory), /Original zum Buchungsjournal fehlt oder wurde verändert/);
});

test("watch mode automatically imports a later statement from the folder", { timeout: 25000 }, async t => {
    const data = await setup(t);
    const script = fileURLToPath(new URL("../sponsor-records.mjs", import.meta.url));
    const child = spawn(process.execPath, [script, "--data", data.directory, "--watch"], { stdio: ["ignore", "pipe", "pipe"] });
    t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(resolveExit => child.once("exit", resolveExit)); } });
    let output = "";
    const firstRun = new Promise(resolveRun => child.stdout.once("data", resolveRun));
    child.stdout.on("data", chunk => { output += chunk; });
    await firstRun;
    await data.input("github", "later.csv", header + "later,2026-11-02,income,EUR,5.00,0.00,5.00,\n");
    await new Promise((resolveRun, reject) => {
        const timer = setTimeout(() => reject(new Error("Watcher did not import the new file")), 20000);
        const onData = () => { if (output.includes("1 neu")) { clearTimeout(timer); child.stdout.off("data", onData); resolveRun(); } };
        child.stdout.on("data", onData); onData();
    });
    assert.equal(JSON.parse((await data.read("buchungen.jsonl")).trim()).record.data.id, "later");
});
