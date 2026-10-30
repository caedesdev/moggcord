# Included plugins

Moggcord includes the built-in Moggcord and Vencord plugin collections. Four plugins are enabled by default:

| Plugin | Purpose |
| --- | --- |
| FakeVoice | Fake Deafen and Fake Mute controls |
| ExportDM | Export direct-message conversations and attachments |
| CustomProfile | Local profile appearance |
| TokenImporter | Manage and switch imported accounts |

Plugins from both `src/moggcordplugins` and `src/plugins`, including their native helpers, are included and can be enabled individually in settings. Platform-specific plugins retain their existing platform restrictions. Optional plugins start disabled even if their source originally declared them required or enabled by default. Internal APIs, core settings, the required UI fix and TokenImporter's account bridge remain available and do not appear as selectable plugins.

Version 1.18.35 restores the Vencord collection and opens the plugin page with Show All selected. Use Show Vencord Plugins or Show Moggcord Plugins to filter either collection. Plugins with the same name appear once, with the Moggcord implementation taking precedence. Installed community plugins with matching names retain their existing implementation and settings unless a built-in Moggcord plugin overrides that name.

These four plugins are enabled for fresh installations. The first start with version 1.18.32 or later disables the other built-in plugins once, preserving their configuration values and community plugin activation. After that transition, manually enabled plugins remain enabled across restarts and updates. The four default plugins retain any previously saved individual on/off preferences.

On the first start with version 1.18.35, stale activations for the restored Vencord plugins are disabled once. Existing Moggcord and community-plugin choices are preserved. Vencord plugins that you enable after this transition remain enabled across subsequent starts. FriendsSince and VoiceStats include the required profile-section API, based on the [upstream integration](https://github.com/Equicord/Equicord/blob/main/src/equicordplugins/_api/profileSections.ts).

Community plugins installed from the website remain supported. The source build still accepts TypeScript, JavaScript, CSS and native helpers from src/userplugins. See [Community installation](COMMUNITY-INSTALL.md).

## Fake Deafen and Fake Mute

The ghost button appears beside Discord's microphone and headphones controls. Click it to turn Fake Deafen on or off. Right-click to choose Fake Mute, Fake Deafen or both. The default is Fake Deafen alone. The button and menu stay in sync when switching modes.

FakeVoice changes the outgoing voice-status flags. From version 1.18.36, enabling Fake Deafen also uses Discord's normal microphone control to really mute your microphone. It leaves the real headphone setting unchanged, so you can keep listening if your headphones are enabled. This applies to the ghost button, Fake Deafen commands and enabling Fake Deafen through the context menu while active. A microphone that is already muted is left muted. Fake Mute alone keeps the real microphone setting unchanged.

Turning FakeVoice off, switching modes, disconnecting or disabling the plugin never automatically unmutes the microphone. Use Discord's normal microphone button when you want to speak again. Clearing the fake status sends the current real microphone and headphone flags; it does not reuse the microphone state from before activation. Leaving voice clears the active fake status. These controls do not override server mute, server deafen or channel permissions.

Version 1.18.34 also displays the active fake mute/deafen icons beside your own voice participant, using Discord's native voice-status icons. The display patch applies only to you in your current call and preserves other participants and server restrictions. The ghost button highlights the selected active mode. Enabling, disabling or changing modes shows a dark, animated notification at the top right that disappears after three seconds. From 1.18.36, the notification also reports the microphone mute state. A new notification replaces the previous one; closing it, disconnecting or disabling FakeVoice clears it. Reduced-motion preferences are respected.

The local commands `/fakedeafen`, `/fakemute` and `/fakedeafen_mute` select their respective modes. Repeating the same command turns that mode off. Commands registered before Discord finishes loading are retained until its built-in command list is available.

Version 1.18.31 updates the account-panel integration for current Discord Canary and includes it in the downloadable installer. Reinstall or repair with this version, then fully restart Discord. A window reload alone can keep the previous Moggcord code cached in Discord's main process.

The inclusion policy is defined in scripts/lib/plugin-bundle.mjs and shared by the renderer and native helper generators. Run `pnpm test:plugins` to check the distributed registry, dependency completeness, installer defaults and community plugin compatibility.
