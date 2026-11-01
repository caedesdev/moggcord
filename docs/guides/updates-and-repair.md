# Updates and repair

[Documentation](../README.md) / Guides / Updates

## Update from the client

Open **Moggcord Settings → Updater**. **Check for Updates** compares the running Moggcord version with the latest GitHub release. Choose **Update Now** when an update is available.

Keep Discord open during download and verification. After a successful installation the updater reports success and schedules a restart. Reloading the window alone does not replace the already-running main process.

## Read the progress

Since version 1.18.43, the updater shows transferred megabytes, a percentage when the total is known, and a progress bar. **Cancel download** stops an active transfer so you can retry. Opening the Updater page again reads the existing download state rather than starting another transfer.

| Stage | What is happening |
| --- | --- |
| Downloading | The archive is being streamed to a temporary file |
| Verifying and installing | The desktop build and file fingerprints are checked, then files are replaced |
| Installed | The new files are on disk; Discord needs the scheduled restart |
| Failed or cancelled | The result explains the problem; an incomplete transfer is not installed |

A transfer with no response/data for 30 seconds fails with an explanation. The download also has a 10-minute overall limit. The release request has a time limit, and Windows archive extraction is bounded. These limits prevent an unresponsive operation from leaving the button busy indefinitely.

## Where the update files live

Since 1.18.44, the main release contains only the four platform installer packages. Technical files are attached to a separate prerelease tagged `updates-v<version>`. The updater resolves that exact version rather than treating the technical prerelease as the latest user download.

**Clients on 1.18.43 or older need the latest installer and Repair once to migrate.** Those older updaters only inspect the main release and cannot discover the new technical-file location. After migrating, future compatible updates use the version-matched technical release.

## Why there are two ZIP files

| Asset | Purpose |
| --- | --- |
| `moggcord-update.zip` | The four desktop code/style files and `build-info.json`; preferred by the new updater |
| `moggcord-dist.zip` | The full installation bundle, including additional Windows support files |

The 1.18.43 small update archive is about 1.3 MB; the full bundle is about 75 MB. These are release-specific sizes, not permanent limits. Both ZIPs now belong in the technical release. The macOS and Linux installer packages are separate assets and are not bundled inside the Windows update archive.

Older clients can use the full bundle from legacy release layouts. Once a main release contains only installers, use Repair to receive the new updater rather than expecting that older discovery path to migrate itself.

## Recover an already-stuck older updater

1. Fully quit the selected Discord, including its tray process.
2. Download the latest installer for your operating system.
3. Choose **Repair Moggcord** and the affected Discord installation.
4. Reopen Discord and check the version in **Updater**.

An old updater already waiting on a download cannot replace its own running code merely because a new release has been published. For other causes, see [Update troubleshooting](../troubleshooting/updates.md).

## What Repair keeps

Repair restores the loader/build. Saved settings, themes and community source are retained, but retained source is not the same as compiled code in the new release. Community code may need to be [rebuilt from its checkout](../community/installing-and-sharing.md#after-an-official-update).

## Source of truth

[Updater backend](../../src/main/updater/http.ts) · [Download limits](../../src/main/updater/download.ts) · [Updater interface](../../src/components/settings/tabs/updater/index.tsx) · [Small archive creation](../../scripts/build/update-archive.mjs) · [Build verification](../../scripts/lib/build-info.mjs)
