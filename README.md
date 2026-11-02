<div align="center">
  <img src="https://raw.githubusercontent.com/caedesdev/moggcord/main/moggcord.ico" width="96" height="96" alt="Moggcord logo">

  # Moggcord

  **A Discord desktop modification with Moggcord and Vencord plugins, themes and community uploads.**

  [![License](https://img.shields.io/github/license/caedesdev/moggcord?color=a855f7)](LICENSE)
  [![Platforms](https://img.shields.io/badge/Windows%20%7C%20macOS%20%7C%20Linux-3b82f6)](docs/getting-started/installation.md)

  [Download](https://github.com/caedesdev/moggcord/releases/latest) · [Documentation](docs/README.md) · [Website](https://moggcord.cc) · [Contribute](CONTRIBUTING.md)
</div>

## Start here

| I want to… | Read this |
| --- | --- |
| Install Moggcord | [Installation and supported platforms](docs/getting-started/installation.md) |
| Set up plugins and themes | [First steps](docs/getting-started/first-steps.md) |
| Install a community upload on my own computer | [Connect the community website](docs/community/setup.md) |
| Fix a failed update or a broken client | [Troubleshooting](docs/troubleshooting/README.md) |
| Write a plugin | [Plugin development](docs/developers/plugin-development.md) |
| Understand the project | [Architecture](docs/architecture/README.md) |

## Downloads

Choose your operating system on the [latest release](https://github.com/caedesdev/moggcord/releases/latest). Opening the installer shows **Install**, **Repair** and **Uninstall** before changing Discord files.

| Platform | Package | Support |
| --- | --- | --- |
| Windows x64 | `Moggcord-Installer.exe` | Windows installer |
| macOS Intel and Apple Silicon | `Moggcord-Installer-macOS.dmg` | Preview; not Apple notarized |
| Linux x64 | `Moggcord-Installer-Linux.AppImage` or `.deb` | Preview; official Discord DEB/TAR installations |

The selected Discord channel closes and restarts during installation. Stable, Canary and PTB are separate installations. See the [Windows](docs/getting-started/windows.md), [macOS](docs/getting-started/macos.md) and [Linux](docs/getting-started/linux.md) guides for requirements and custom locations. There is no Android installer in this release line.

## Plugins, themes and updates

Both built-in plugin collections are included. **FakeVoice, ExportDM, CustomProfile and TokenImporter** are the four default-enabled plugins on fresh installations; other available plugins can be enabled individually. Saved choices and platform restrictions affect what is active. See [Plugins and defaults](docs/guides/plugins.md).

Themes can be installed locally or through a connected community website. Community installation needs a connector on **each visitor's computer**. It installs into that visitor's selected channel, not the website owner's PC. See [Community downloads and sharing](docs/community/installing-and-sharing.md).

The client updater verifies the downloaded desktop files before applying them. Since 1.18.43 it reports download progress, supports cancellation and uses a smaller desktop-only archive when available. See [Updates and repair](docs/guides/updates-and-repair.md).

## Development

Use Node.js 24 and the pnpm version pinned in [package.json](package.json).

```sh
git clone https://github.com/caedesdev/moggcord.git
cd moggcord
pnpm install --frozen-lockfile
pnpm buildStandalone
```

Building does not inject the result into Discord. Read [Development setup](docs/developers/setup.md) before installing a local build. Installer packaging, tests and release publication have separate [maintainer instructions](docs/developers/releasing.md).

## Credits and license

Moggcord is a fork of [Equicord](https://github.com/Equicord/Equicord), which builds on [Vencord](https://github.com/Vendicated/Vencord). Their source, APIs and contributors are a substantial part of this project. Existing copyright and license notices remain in the source.

The project is licensed under [GPL-3.0](LICENSE). Moggcord is not affiliated with Discord. Read [Trust and privacy](docs/guides/trust-and-privacy.md) before installing client modifications or community code.
