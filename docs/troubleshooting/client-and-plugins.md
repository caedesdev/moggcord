# Fix client and plugin problems

[Documentation](../README.md) / Troubleshooting / Client and plugins

## Moggcord settings are missing

Check the Discord channel you opened. A Canary installation does not change Stable. Fully quit and reopen the intended application; if its loader was replaced by a host update, use the latest installer's **Repair** action on that target.

## Server settings are gray or blank

First note whether the problem affects only server settings or other dialogs too. Fully restart Discord after updating Moggcord. Temporarily disable recent themes/QuickCSS and recently enabled plugins to narrow the trigger.

Version 1.18.41 included a compatibility fix for BetterSettings and Discord's changed focus component on Canary. A later Discord change can have a different cause; do not assume every blank view is that same fixed regression. Report the Discord build/channel, Moggcord version and whether disabling BetterSettings changes the result.

## A backup has more entries than visible enabled plugins

A backup contains saved configuration, not plugin binaries. It can include disabled entries, internal helpers, unavailable plugins and plugins for another target. The import review separates these groups and estimates visible enabled plugins after restart.

Enable available bundled plugins through settings. Install missing compatible community code separately. Repeated imports/restarts do not fetch absent source. See [Backup and restore](../guides/backup-and-restore.md).

## I only see four plugins

The four defaults are an activation policy, not the intended total catalog. Use **Show All** and clear search/filter text. Confirm that you are on a release containing both collections, then fully restart after updating/repairing.

Do not compare a count of enabled visible entries with all files under `src/plugins` or `src/moggcordplugins`; those include different categories and platform restrictions. See [Plugins and defaults](../guides/plugins.md).

## An expected control is missing

Check that the plugin is available in your build, enabled and actually loaded after any required restart. For account-panel/voice controls, identify whether it fails only in a call, only on one Discord channel or everywhere.

If it is still absent on the current build, include a redacted screenshot and the trigger in a report. A missing icon can be a compatibility patch problem rather than a missing image file.

FakeDeafen changes the advertised mute/deafen status. Enabling it while already really deafened first mutes your microphone, then turns your headphones on so you can listen while still appearing fully muted. Disabling fake mode leaves the microphone muted. Otherwise your real audio controls stay unchanged. See the [current behavior](../guides/plugins.md#fake-deafen-and-fake-mute) before treating a difference between local audio and advertised status as a loading failure.

## The interface looks broken after a theme change

Disable the new theme, then other themes and QuickCSS if needed. Re-enable them individually. Repair preserves saved styling choices, so it may not remove the source of a CSS conflict.

User profile badge requests are cached and have a timeout. Empty responses do not force a refresh of all user views. If opening several profiles still crashes Discord, record which client, which profile, and the time it occurred so the error can be matched to the client logs.

If it occurs without custom styling, report the affected page and enabled plugins. See [Themes and QuickCSS](../guides/themes.md).

## Notifications are empty or a window will not drag

Fully restart after the relevant update so current native/UI code is loaded. Preserve the exact action that triggers an empty notification; settings import, download and apply are different paths. For dragging, distinguish the title bar from buttons and normal interactive content.

Older notification/drag compatibility fixes are recorded in [historical installer notes](../releases/legacy-notes.md). If a current build regresses, use the exact reproduction rather than assuming the older fix covers every Discord build.

[Report a bug](reporting-bugs.md) · [Troubleshooting home](README.md)
