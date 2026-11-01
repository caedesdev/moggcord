# Glossary

[Documentation](../README.md) / Reference / Glossary

| Term | Meaning in this project |
| --- | --- |
| **Discord channel** | A release track/application such as Stable, PTB or Canary; not a chat channel |
| **Injected client** | Moggcord code loaded into an existing Discord desktop application |
| **Loader / injection** | The application startup entry that loads Moggcord's patcher before continuing Discord |
| **ASAR** | Electron's application archive format; unrelated to a website upload ZIP |
| **Patcher** | Main-process entry for Moggcord's integration with the selected Discord application |
| **Preload** | Code that exposes the supported native bridge to a renderer window |
| **Renderer** | The Discord UI process where settings, plugin UI and renderer patches run |
| **IPC** | Named messages between renderer/preload and main-process operations |
| **Plugin registry** | The compiled set of plugin definitions available to this build |
| **Enabled plugin** | A plugin requested by settings; startup/restart requirements can still affect the running process |
| **Internal plugin** | An API/core dependency supporting other features; not a normal selectable plugin |
| **Community connector** | Optional loopback service that installs a website's upload on the visitor's computer |
| **Origin** | URL scheme, host and port; page paths are not part of it |
| **Manifest** | JSON identifying an upload and containing its exact accepted source package |
| **Fingerprint / SHA-256** | A hash used to compare exact bytes/content; not proof of safe code |
| **Source checkout** | A retained copy of the repository used to compile local/community plugins |
| **Build output** | Compiled client files under `dist/` or a deployed per-user build directory |
| **DataStore** | Plugin key/value data, separate from the plain settings JSON |
| **QuickCSS** | Personal CSS loaded alongside enabled themes |
| **Repair** | Restore the selected Moggcord installation while retaining saved user data |
| **Preview platform** | Packaged and tested within the documented scope, with remaining real-client compatibility work |

[Architecture](../architecture/README.md) · [File locations](file-locations.md) · [Installation](../getting-started/installation.md)
