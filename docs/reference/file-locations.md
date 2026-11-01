# File locations and configuration

[Documentation](../README.md) / Reference / File locations

Use **Open Themes Folder** or the relevant settings UI when possible. An environment override or a different Discord user-data location can change the active data directory.

## Default per-user directories

These are the installer/connector defaults defined by `desktopPaths`:

| Purpose | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Moggcord data | `%APPDATA%\Moggcord` | `~/Library/Application Support/Moggcord` | `${XDG_CONFIG_HOME:-~/.config}/Moggcord` |
| Deployed desktop build | `%LOCALAPPDATA%\Moggcord\dist\desktop` | `~/Library/Application Support/Moggcord/dist/desktop` | `${XDG_DATA_HOME:-~/.local/share}/Moggcord/dist/desktop` |
| Connector configuration | `%APPDATA%\MoggcordCommunity\config.json` | `~/Library/Application Support/Moggcord/community/config.json` | `${XDG_CONFIG_HOME:-~/.config}/Moggcord/community/config.json` |

The Linux notation describes a default/fallback; it is not a command to paste literally. Existing Windows injections can point at the legacy `%LOCALAPPDATA%\Moggcord\dist` directory instead. The loader's actual selected build matters more than a guessed folder.

## Inside the data directory

| Path relative to the active data directory | Contents |
| --- | --- |
| `settings/settings.json` | Renderer settings, plugin choices and theme configuration |
| `settings/native-settings.json` | Native settings and custom CSP rules |
| `settings/quickCss.css` | Personal QuickCSS |
| `themes/` | Local stylesheets |

Plugin DataStore is separate from these plain settings files. Use **Backup & Restore** to export it rather than assuming a copy of `settings.json` contains all plugin data.

## Build and source files

The verified desktop build consists of `patcher.js`, `preload.js`, `renderer.js`, `renderer.css` and `build-info.json`. The manifest records the version and four desktop-file SHA-256 fingerprints.

Community code lives in the retained checkout at `src/userplugins/community-<upload-id>/`. Community stylesheets are written into the active data directory as `themes/community-<upload-id>.theme.css`. Source, compiled output and settings should be backed up according to their different roles.

## Environment overrides

| Variable | Meaning |
| --- | --- |
| `MOGGCORD_USER_DATA_DIR` | Highest-priority runtime Moggcord data directory override |
| `DISCORD_USER_DATA_DIR` | If set without the Moggcord override, the runtime derives a sibling `MoggcordData` directory |
| `MOGGCORD_PATCHER_DIR` | Hint for the active patcher directory, validated by loader resolution |
| `XDG_CONFIG_HOME`, `XDG_DATA_HOME` | Linux installer/connector config and data roots |
| `MOGGCORD_NATIVE_INSTALLER` | Test-only path enabling target-platform native helper tests |

Without explicit data overrides, the injected runtime derives its data location beside Electron's Discord user-data directory. A development build can add a `dev` suffix. Match the running client's directory when passing connector `--data-dir`.

## Diagnostics

The current Windows crash logger writes `%LOCALAPPDATA%\Moggcord\crash-log.txt`. It records session starts and selected main-process failures. Review and redact an excerpt before sharing it. Do not attach whole account/settings directories as a substitute for diagnostics.

The logger currently derives this path from `LOCALAPPDATA`; this reference does not promise an equivalent fixed macOS/Linux log location. Include how you launched the client when reporting a non-Windows logging problem.

## Source of truth

[Platform defaults](../../scripts/lib/desktop-paths.mjs) · [Runtime constants](../../src/main/utils/constants.ts) · [Loader resolution](../../src/main/moggcordLoader.ts) · [Connector setup](../../scripts/community/setup.mjs) · [Crash logger](../../src/main/crashLog.ts)
