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

The desktop bundle includes Moggcord's own plugins and the upstream collection, along with their native helpers. Use **Show All** or the collection filters on the Plugins page.

Platform-specific plugins keep their target restrictions. Internal API and core plugins support other features and are not listed as ordinary selectable plugins. Duplicate names are resolved by the bundle generator; the Moggcord implementation takes precedence over a matching upstream implementation.

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

The FakeVoice control sits beside Discord's microphone and headphones controls. Its default mode is Fake Deafen. Enabling Fake Deafen explicitly mutes your real microphone while advertising a deafened status. Disabling the fake mode leaves your microphone muted; unmute it yourself when you want to speak.

If you enable it while already deafened, your headphones stay deafened. Turn off Discord's normal deafen control to listen while still appearing deafened. Your microphone stays muted. Fake Mute by itself changes the advertised mute flag without changing your real audio controls.

Your participant row in the call shows the advertised muted/deafened state. The microphone/headphones controls at the bottom keep showing the real audio state: the microphone is muted and the headphones stay on unless you deafen them yourself. The FakeVoice icon uses only a strike-through when active.

Mode changes play Discord's deafen/undeafen sound and show a theme-aware notification at the top right for three seconds. Server mute, server deafen and channel permissions still apply. If the control is missing, use [Client and plugin troubleshooting](../troubleshooting/client-and-plugins.md#an-expected-control-is-missing).

## Source of truth

[Bundle policy](../../scripts/lib/plugin-bundle.mjs) · [Registry generator](../../scripts/build/common.mjs) · [Plugin manager](../../src/api/PluginManager.ts) · [Catalog statistics](../../scripts/build/catalog-stats.mjs) · [Bundle checks](../../scripts/tests/plugin-bundle.test.mjs)
