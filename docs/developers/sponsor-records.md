# Local sponsor records

[Documentation](../README.md) / Development / Sponsor records

The local helper reads CSV statements from a folder, records transactions once, and writes a private HTML overview and CSV ledger. It does not connect to an account, calculate tax, determine deductibility or submit forms. The output is a preparation aid for review, not a declaration of legal or GoBD compliance.

## Start

Use the project's Node.js 24 runtime. No additional packages or credentials are required.

```sh
node scripts/sponsor-records.mjs
node scripts/sponsor-records.mjs --watch
```

The default data folder is `Documents/Moggcord-Abrechnungen` inside your user home. `--data /absolute/path/to/new-folder` selects a different empty folder. Existing unrelated folders are rejected. The optional `sponsor-records-private/` folder in a checkout is ignored by Git, but keep real financial records outside source checkouts.

The watcher checks every 15 seconds while it is running. Stop it with Ctrl+C. If a process was interrupted and left `prozess.lock`, first confirm no other importer is running, then remove that lock file. The helper refuses simultaneous imports.

## Input and retained records

Place statements in `eingang/github/` or `eingang/stripe/`. Project costs can be entered in CSV files under `eingang/kosten/`, with supporting documents under `belege/`. The helper retains original CSV bytes under `originale/`, appends hash-linked records to `buchungen.jsonl`, and regenerates `buchungen.csv`, `prüfbedarf.txt` and `übersicht.html`. Keep originals and the journal together and back up the private data folder.

[GitHub's export instructions](https://docs.github.com/en/sponsors/receiving-sponsorships-through-github-sponsors/viewing-your-sponsors-and-sponsorships#exporting-your-sponsorship-data) explain how to request monthly transaction exports. GitHub sends the export by email. Download it into the input folder. Sponsor lists, active tier amounts, bank payout totals and lifetime aggregates do not replace transaction statements.

The helper reads UTF-8 CSV with commas or semicolons, quoted cells, escaped quotes, multiline values and an optional UTF-8 BOM. Files are limited to 10 MB. It does not parse PDFs, images, JSON exports or arbitrary financial formats.

## Columns and amount units

The explicit input schema is:

```csv
id,date,type,currency,gross,fee,net,receipt
```

`id`, `date`, `type`, `currency` and `gross` are required. Recognized aliases include `transaction_id`, `transaction_date`, `created_at`, `Created (UTC)`, `transaction_type`, `reporting_category`, `gross_amount`, `amount`, `fees` and `net_amount`. If multiple possible columns exist, the file is flagged instead of guessed. Export formats change, so verify the actual headers and unit descriptions before the first real import.

Customize `columns` in the generated `einstellungen.json` per source if an export uses different names. For example:

```json
{
  "github": {
    "columns": {
      "id": "Transaction ID",
      "date": "Transaction date",
      "type": "Transaction type",
      "gross": "Amount in cents"
    },
    "units": "minor",
    "currency": "USD"
  },
  "stripe": { "columns": {}, "units": "major" },
  "kosten": { "columns": {}, "units": "major" }
}
```

This is a mapping example, not a promise that every GitHub export has these exact headers. `major` means currency units such as `12.34`. `minor` means whole cents such as `1234`, for all money columns in that source. The helper rejects ambiguous grouping separators and amounts with more than two decimal places. Supported currencies are EUR, USD, GBP and CHF. No currency is assumed unless the statement provides it or you explicitly configure it. An `amount_in_cents` column is recognized, but combining it with fee/net columns requires an explicit `minor` setting.

Allowed types are `income`, `sponsorship`, `payment`, `charge`, `refund`, `payment_refund`, `expense`, `payout` and `transfer`. Refund gross amounts must be negative; income and cost gross amounts must be positive or zero. A `status` column, if present, must say `paid`, `succeeded`, `completed` or `settled`. Unknown and pending rows require review. Fees and net must use the same currency as gross. Missing fees are never assumed to be zero. When gross and either fees or net are supplied, the remaining value can be derived arithmetically.

Dates must be ISO dates or timestamps. Timestamps require an explicit time zone, unless their date column explicitly says UTC. Monthly grouping uses Europe/Berlin; the original timestamp is retained. This does not determine the legal date of taxable receipt.

## Checks and limits

- Repeated transaction IDs within the same source are imported once. Changed financial values for an existing ID are flagged and do not overwrite the saved transaction.
- Gross minus fees must equal net when all values are supplied. Fractional calculations use integer cents.
- Payouts and transfers are retained but excluded from income summaries. Costs are separate and are not automatically declared deductible.
- GitHub and Stripe are separate sources because their exports may describe the same money. Their totals must not be added together without reconciliation.
- Currency totals stay separate. Foreign-currency transactions require a reviewed euro valuation; no exchange rate or tax result is invented.
- Missing cost receipts, malformed files, ambiguous columns and unknown transaction types are shown in the review list.
- Empty folders and empty exports do not prove that no income exists. Missing months, other income sources, personal tax status, business registration, VAT and filing obligations require human review.

Keep actual statements, receipts and generated reports private. CSV and HTML outputs escape untrusted text, but do not publish the private data folder. Hash-linked local records can detect accidental journal changes; they are not tamper-proof evidence or certified accounting software.

## Verification

```sh
node --test scripts/tests/sponsor-records.test.mjs
node scripts/check-docs.mjs
```
