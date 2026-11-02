# Connect the community website to your computer

[Documentation](../README.md) / Community / Setup

The local service lets a website install an upload into **your own** Moggcord client. Each visitor's service runs on that visitor's computer.

## Use moggcord.cc

In Moggcord 1.18.46, the normal client update includes this service. Start the updated Moggcord, choose **Download** on moggcord.cc and allow access to local apps and services if the browser asks. The service detects the Discord installation with Moggcord and installs the upload there. No separate setup page, checkout or terminal commands are needed for this flow.

Moggcord starts an independent local worker that can finish an installation while the selected Discord restarts. A private runtime is prepared automatically. A compiler package matching the running Moggcord version is downloaded only when a code plugin needs to be built. Enabling an unchanged installed plugin or installing a stylesheet does not require that compiler download.

Only a valid Moggcord installation is accepted. Unmodified Discord and other loaders are excluded. If no unique target is available, the service reports the problem instead of choosing an arbitrary installation.

The remaining sections describe advanced manual setup for another website origin or development. Running a connector on a website server does not connect visitors' PCs.

## Before you start

- Install Moggcord in the Discord channel you want to use.
- Use Node.js 24, Git and pnpm 10.30.3, matching the project's current build setup.
- Keep a separate source checkout for the connector. It supplies the compiler and stores community source.
- Know the exact website origin you intend to trust.

The target must have the Moggcord loader. A channel using Vencord or unmodified Discord is rejected. On macOS/Linux, use the matching [desktop installer](../getting-started/installation.md) first.

## Run setup

From a terminal:

```sh
git clone https://github.com/caedesdev/moggcord.git moggcord-community
cd moggcord-community
pnpm install --frozen-lockfile
pnpm community:setup --site https://community.example.com
```

Replace `https://community.example.com` with the real website origin. This example domain is not a Moggcord service. For development on this same computer, use `--site http://127.0.0.1:4173`.

Setup automatically detects the Discord installation that already has Moggcord. Stable, PTB, Canary and Development are checked. Unmodified Discord and other loaders are excluded. If Moggcord is installed in more than one channel, setup lists the matches and asks you to choose one with `--channel`. It does not choose an arbitrary installation.

**Setup rebuilds Moggcord and restarts the selected channel once.** Leave active calls and save work first. Keep this checkout after setup; moving or deleting it breaks the recorded compiler path.

## Options

| Option | Accepted value | Purpose |
| --- | --- | --- |
| `--channel` | `auto` (default), `stable`, `canary`, `ptb`, `development` | Detect Moggcord automatically or choose one Discord installation |
| `--site` | An HTTPS origin, or HTTP loopback for development | Choose the website allowed to install uploads |
| `--data-dir` | An absolute directory path | Use a custom Moggcord settings/themes directory |

When using a custom data directory, make sure it is the same one used by your running client. The connector's data directory and Discord installation path are different things.

`https://example.com`, `https://www.example.com`, `http://localhost:4173` and `http://127.0.0.1:4173` are different origins. Match the scheme, host and port exactly. An origin has no `/user-plugins.html` or other page path.

## What setup registers

| Platform | Manual configuration and startup integration |
| --- | --- |
| Windows | `%APPDATA%\MoggcordCommunity\config.json`, a per-user startup entry and `moggcord://` handler |
| macOS | `~/Library/Application Support/Moggcord/community/config.json`, a per-user LaunchAgent and generated link-handler application |
| Linux | The XDG Moggcord community directory, per-user application/autostart desktop entries and the `moggcord` scheme handler |

The connector listens on `127.0.0.1:6469`. It can start at sign-in or through the registered install link.

Automatic mode is retained in the configuration. The connector checks the installed Moggcord target again when reporting its status or installing an upload, so it is not permanently tied to the channel found during setup.

To run it from the retained checkout manually:

```sh
pnpm community:start
```

If the browser asks for local-network access, allow it for the website you chose. Opening the local status URL directly in the address bar is not a valid connection test: the endpoint expects the configured browser Origin header.

## Update or reconnect

Stop this connector's Node process before changing its checkout or configuration. Preserve personal changes, update the separate checkout, run `pnpm install --frozen-lockfile`, then start the connector again. Do not reset or overwrite a checkout containing work you want to keep.

To change the website or channel, run setup again with the new options. It rebuilds/repairs and restarts the newly selected target. One configuration serves one origin/channel at a time.

## Remove the connector

First stop only the Node process running this checkout's `scripts/community/bridge.mjs`. Do not stop every Node process on the PC.

On Windows, remove these connector-specific registrations:

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v MoggcordCommunity /f
reg delete "HKCU\Software\Classes\moggcord" /f
```

On Linux, remove `moggcord-community.desktop` from your user `applications` and `autostart` directories. On macOS, unload `dev.moggcord.community` with `launchctl bootout gui/$(id -u)/dev.moggcord.community`, remove its plist from `~/Library/LaunchAgents`, and remove the generated `Moggcord Community.app` from the community configuration directory.

Removing registration does not remove installed plugins, themes or saved settings. Keep your checkout and data if you intend to reconnect later.

[Downloads and sharing](installing-and-sharing.md) · [Connector troubleshooting](../troubleshooting/community.md)

## Source of truth

[Automatic client startup](../../src/main/community.ts) · [Managed service](../../scripts/community/service.mjs) · [Compiler preparation](../../scripts/community/compiler.mjs) · [Manual setup](../../scripts/community/setup.mjs) · [Platform paths](../../scripts/lib/desktop-paths.mjs)
