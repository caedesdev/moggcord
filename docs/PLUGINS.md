# Included plugins

Moggcord includes four standard plugins:

| Plugin | Purpose |
| --- | --- |
| FakeVoice | Fake Deafen and Fake Mute controls |
| ExportDM | Export direct-message conversations and attachments |
| CustomProfile | Local profile appearance |
| TokenImporter | Manage and switch imported accounts |

Other optional built-in plugins and their native helpers are excluded from the distributed plugin registries. Internal APIs, core settings, the required UI fix and TokenImporter's account bridge remain available and do not appear as selectable plugins.

These four plugins are enabled for fresh installations. Updating an existing installation preserves its saved settings; an individually disabled plugin stays disabled. Settings for removed plugins are not deleted, but those plugins are no longer loaded.

Community plugins installed from the website remain supported. The source build still accepts TypeScript, JavaScript, CSS and native helpers from src/userplugins. See [Community installation](COMMUNITY-INSTALL.md).

The inclusion policy is defined in scripts/lib/plugin-bundle.mjs and shared by the renderer and native helper generators. Run `pnpm test:plugins` to check the distributed registry, dependency completeness, installer defaults and community plugin compatibility.
