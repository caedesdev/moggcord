# Plugins and defaults

[Documentation](../README.md) / Guides / Plugins

## Available, enabled and running

These are different states:

| State | Meaning |
| --- | --- |
| **Available** | The plugin's code is included in your build and supports its target platform |
| **Enabled** | Your settings request that the plugin be active |
| **Running** | The plugin has started in the current Discord process |

An available plugin does not need another download just to enable it. A saved setting for a missing plugin does not install its code. A plugin with startup patches can need a complete restart before the running state matches your saved choice.

## Included collections

The desktop bundle includes the built-in **Moggcord** and **Vencord** collections, along with their native helpers. Use **Show All**, **Show Vencord Plugins** or **Show Moggcord Plugins** on the Plugins page.

Platform-specific plugins keep their target restrictions. Internal API and core plugins support other features and are not listed as ordinary selectable plugins. Duplicate names are resolved by the bundle generator; the Moggcord implementation takes precedence over a matching Vencord implementation.

The release's `version.json.pluginCatalog` contains generated desktop catalog counts. Since 1.18.44 this metadata is stored in the version-matched technical release, `updates-v<version>`. Counts can change between versions and should not be inferred from the number of folders in one source directory.

## Four default-enabled plugins

| Plugin | General purpose |
| --- | --- |
| FakeVoice | Local controls for advertised mute/deafen status |
| ExportDM | Export direct-message conversations and attachments |
| CustomProfile | Local profile customization |
| TokenImporter | Imported-account management |

These are defaults for fresh installations. Existing on/off choices are respected. Earlier catalog migrations disabled stale optional activations once; that history is recorded in the [legacy release notes](../releases/legacy-notes.md).

Enable optional plugins deliberately and follow restart prompts. If an issue appears after enabling several plugins, turn off the recent additions one at a time to isolate it.

## Community plugins

Community source belongs in `src/userplugins/` in a source checkout. The optional connector compiles it into that computer's desktop build and activates the installed plugin. Merely copying a TypeScript file into a folder beside the Discord executable does not compile it.

An official update replaces the compiled desktop code. Community source remains in its checkout; rebuild and reconnect from that checkout when necessary. See [Downloads and sharing](../community/installing-and-sharing.md#after-an-official-update).

## Fake Deafen and Fake Mute

The existing FakeVoice integration places its control beside Discord's microphone and headphones controls. Its default mode is Fake Deafen. The selected fake state and the real microphone/headphones controls are separate; Fake Deafen does not automatically mute the real microphone. Existing real mute state is retained.

The current implementation provides local status indicators and a short notification on mode changes. Server mute, server deafen and channel permissions still apply. If the control is missing, use [Client and plugin troubleshooting](../troubleshooting/client-and-plugins.md#an-expected-control-is-missing).

## Source of truth

[Bundle policy](../../scripts/lib/plugin-bundle.mjs) · [Registry generator](../../scripts/build/common.mjs) · [Plugin manager](../../src/api/PluginManager.ts) · [Catalog statistics](../../scripts/build/catalog-stats.mjs) · [Bundle checks](../../scripts/tests/plugin-bundle.test.mjs)
