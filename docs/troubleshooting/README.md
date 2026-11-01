# Troubleshooting

[Documentation](../README.md) / Troubleshooting

Choose the symptom that matches what you can observe. Record the Moggcord version, Discord channel and operating system before changing settings.

| Symptom | Start here |
| --- | --- |
| The installer cannot find Discord | [Installer: missing target](installation.md#discord-is-not-listed) |
| Install, Repair or Uninstall cannot close Discord | [Installer: shutdown failure](installation.md#discord-could-not-be-closed) |
| Installer access/permission error | [Installer: permissions](installation.md#permission-or-write-error) |
| Update stays on Installing or Downloading | [Update: stuck operation](updates.md#the-updater-stays-busy) |
| Update Available returns after restarting | [Update: repeated banner](updates.md#the-update-banner-keeps-returning) |
| Moggcord settings are absent | [Client: wrong channel or loader](client-and-plugins.md#moggcord-settings-are-missing) |
| Server settings are gray/blank | [Client: blank settings](client-and-plugins.md#server-settings-are-gray-or-blank) |
| A settings import does not enable every saved entry | [Client: imported plugin count](client-and-plugins.md#a-backup-has-more-entries-than-visible-enabled-plugins) |
| A plugin button is absent | [Client: missing control](client-and-plugins.md#an-expected-control-is-missing) |
| A theme makes the UI unreadable | [Client: styling conflict](client-and-plugins.md#the-interface-looks-broken-after-a-theme-change) |
| Website says Moggcord is not connected | [Connector: connection](community.md#the-website-cannot-connect) |
| Folder upload cannot compile | [Connector: package/build failure](community.md#a-plugin-folder-fails-validation-or-compilation) |
| Installed state looks wrong | [Connector: detection](community.md#installed-state-does-not-match-what-i-expect) |

## Use the smallest recovery step

Fully restarting the affected Discord is different from reinstalling it, and Repair is different from deleting saved data. Start with the relevant guide instead of removing settings directories or resetting a personal source checkout.

If the issue remains, follow [Reporting a bug](reporting-bugs.md). Include the concrete action and message, not an entire private settings or account directory.
