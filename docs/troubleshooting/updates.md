# Fix update problems

[Documentation](../README.md) / Troubleshooting / Updates

## The updater stays busy

Check the version shown in **Updater** and whether transferred bytes are changing.

| Observation | Action |
| --- | --- |
| Bytes/percentage keep increasing | Let the download finish and keep Discord open |
| 1.18.43 or newer reports a stalled transfer | Check the connection and retry; Cancel download is available during transfer |
| An older version stays on Installing without useful progress | Fully quit that Discord and use the latest installer's Repair action once |
| Download completes but applying files fails | Read the error, fully restart the selected Discord, then use Repair if it repeats |

The 1.18.43 updater has an idle-download limit, an overall transfer limit and bounded metadata/extraction requests. An older updater already waiting in memory cannot gain those protections from a published release without loading the new code.

## The update banner keeps returning

Compare the running client version with the published release. Fully quit the selected Discord, including its tray process, before reopening. A window reload can leave an older main process running.

Other causes include a stale or damaged release bundle, applying files to a different build directory, reopening the wrong channel or rebuilding an older source checkout through the connector. Do not fix these by editing only the displayed version string. The build version and file fingerprints must agree.

Use the latest installer's Repair action for the affected target. If the new version still does not appear, report both displayed versions and the exact channel.

## The download is larger than expected

Compatible new clients prefer `moggcord-update.zip`; old clients request the full `moggcord-dist.zip`. The small archive contains desktop code/style files. The full bundle includes extra Windows support files. macOS/Linux installers are separate release assets and are not downloaded as part of that Windows bundle.

The small 1.18.43 archive is about 1.3 MB; release sizes can change. See [Updates and repair](../guides/updates-and-repair.md#why-there-are-two-zip-files).

## GitHub or the connection is unavailable

Read the displayed response/error, then retry after checking connectivity. A failed metadata request does not mean the installed version is necessarily current. Avoid repeated parallel requests or downloading from an unverified mirror.

## A community plugin disappeared after updating

An official update replaces compiled code, while community source is kept in its retained checkout. Rebuild/reconnect from the intended current checkout. Copying a settings backup alone cannot restore missing code. See [Community updates](../community/installing-and-sharing.md#after-an-official-update).

## Report what failed

Include the current and available versions, OS, Discord channel, last stage, transferred bytes if shown and exact error. Note whether the problem survives a full quit/reopen and latest Repair. Do not publish account tokens or entire settings folders.

[Report a bug](reporting-bugs.md) · [Update implementation](../../src/main/updater/http.ts) · [Download limits](../../src/main/updater/download.ts)
