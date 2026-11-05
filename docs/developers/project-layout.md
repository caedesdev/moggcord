# Project layout

[Documentation](../README.md) / Developers / Project layout

## Runtime code

| Directory | Responsibility |
| --- | --- |
| `src/main/` | Injected Electron main process: loader, settings, IPC, updater and host integration |
| `src/VencordNative.ts` | Renderer-facing native bridge exposed through the preload |
| `src/api/` | Plugin APIs, plugin lifecycle, themes, settings, commands and UI extension points |
| `src/components/` | Shared UI and Moggcord settings pages |
| `src/webpack/` | Resolve Discord modules and apply renderer patches |
| `src/shared/` | Shared types, IPC event names and cross-process utilities |
| `src/plugins/` | Included upstream plugin collection and internal API/core entries |
| `src/moggcordplugins/` | Moggcord plugin collection and additional internal entries |
| `src/userplugins/` | Local/community plugin source for that checkout |
| `src/moggcord/`, `src/renderer/`, `src/preload/` | Additional desktop-shell, renderer and preload code paths; check imports before editing similarly named files |

The injected client and desktop shell are separate entry paths. A file named `updater.ts` in one path is not necessarily the updater visible inside an injected Discord session.

## Installation and tooling

| Directory or file | Responsibility |
| --- | --- |
| `installer-src/` | Windows .NET backend, shared installer interface and embedded assets |
| `installer-desktop/` | macOS/Linux Electron host, backend, preload and packaging configuration |
| `scripts/build/` | Bundle generation, packaging preparation and release verification |
| `scripts/windows/` | Windows command wrappers, development injection and manual installation helpers |
| `scripts/legacy/windows/` | Older desktop packaging and bootstrap sources, separate from the published installer workflow |
| `scripts/lib/` | Build fingerprints, bundle policy, platform paths, desktop discovery and extraction |
| `scripts/community/` | Connector setup, local HTTP service and validated installation |
| `scripts/tests/` | Node tests and Windows native installer checks |
| `web/` | Reference browser-side community installer and package validator |
| `.github/workflows/` | Release, build and documentation checks |
| `docs/` | Guides, troubleshooting, architecture, reference and release notes |

## Generated output

`dist/`, `build/` and `release/` contain build/package output. Badge merging writes its intermediate file to `build/merged_badges.json`. The badge and plugin catalogs live in `static/catalogs/`. `.codex-temp/` can contain generated native packaging projects and local investigation files. These are not the source of truth for a change and should not be committed as documentation examples or personal backups.

`static/modules_override/` is the single repository copy of the packaged voice modules. `mac/` contains the cursor plugin's assets and is used during packaging. The root icon and installer script retain their public URLs for existing clients and installation commands.

Do not infer supported platforms from the presence of old scripts alone. The current [release workflow](../../.github/workflows/release.yml) is the authoritative path for the published installer set.

## Where to make a change

| Change | Start with |
| --- | --- |
| Default-enabled plugins | [Bundle policy](../../scripts/lib/plugin-bundle.mjs) and its tests |
| Moggcord settings UI | [Settings tabs](../../src/components/settings/tabs) |
| Client download/update behavior | [Injected updater](../../src/main/updater/http.ts) and [download helper](../../src/main/updater/download.ts) |
| Website install or Installed state | [Connector core](../../scripts/community/core.mjs) and [browser integration](../../web/community-install.js) |
| macOS/Linux target discovery | [Desktop discovery](../../scripts/lib/discord-desktop.mjs) |
| Release contents or version mismatch | [Build information](../../scripts/lib/build-info.mjs) and [release workflow](../../.github/workflows/release.yml) |

[Architecture](../architecture/README.md) · [Commands](../reference/commands.md)
