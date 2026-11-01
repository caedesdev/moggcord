# Back up and restore settings

[Documentation](../README.md) / Guides / Backup and restore

Open **Moggcord Settings → Backup & Restore** to export JSON or import a compatible Moggcord/Vencord backup.

## Choose what to export

| Button | Contents |
| --- | --- |
| **Export All Settings** | Saved settings, QuickCSS and DataStore entries when they can be exported |
| **Export Plugins** | The saved settings object used by the plugin-settings import path |
| **Export QuickCSS** | Your QuickCSS text |
| **Export DataStore** | Plugin data stored through DataStore |

The plugin-settings option is not a plugin-code archive. Its implementation exports the settings object; do not assume every key in the JSON belongs to one plugin.

If DataStore is too large during an all-settings export, the exporter can omit it and display a notice. Inspect that result and use the separate DataStore export if required.

## What a backup does not install

A settings backup does not contain:

- Community plugin source files or a compiled plugin bundle.
- Local theme files from the themes directory.
- Discord itself or the Moggcord installer.
- The connector's website/channel configuration and startup registration.

It can preserve a theme's enabled filename or URL without including the local stylesheet. When moving PCs, copy local themes and community source separately and [set up the connector](../community/setup.md) on the new computer.

## Review an import

1. Export your current settings before replacing or merging values.
2. Select **Import All Settings** or the relevant import type.
3. Review the available plugins, unavailable entries, internal helpers and expected enabled count.
4. Choose **Import settings** to apply it, or cancel to leave settings unchanged.
5. Fully restart Discord when requested.

The import merges saved values into current settings; imported values can override existing choices. A backup containing 181 saved plugin entries can still result in far fewer enabled visible plugins. Some entries are disabled, internal, platform-specific or unavailable. The preview explains these groups.

Restarting loads code already present in your build. It does not fetch missing plugins. Install compatible missing code separately, then import or enable its settings as appropriate.

## Keep backups private

The exporter removes a list of known sensitive plugin keys. That list is not a guarantee that all third-party plugin data is safe to share, especially arbitrary DataStore entries. Review a backup before sending it to another person or attaching it to a public issue. Never share account tokens or credentials.

## Source of truth

[Backup interface](../../src/components/settings/tabs/sync/BackupAndRestoreTab.tsx) · [Export/import implementation](../../src/api/SettingsSync/offline.ts) · [Plugin import analysis](../../src/api/SettingsSync/pluginImport.ts) · [Import review](../../src/components/settings/tabs/sync/ImportPreview.tsx)
