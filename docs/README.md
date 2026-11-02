# Moggcord documentation

Install Moggcord, understand its settings, build community plugins, or follow the code from installation to release.

These guides describe the desktop installer and community connector in this repository. macOS and Linux installers are previews. Website deployment and account administration are outside this repository; `web/` provides the browser-side installation integration.

```text
docs/
├── getting-started/   Install and take the first steps
├── guides/            Use plugins, themes, backups and updates
├── community/         Connect, download, upload and integrate
├── developers/        Build, test, contribute and release
├── architecture/      Understand components and data flow
├── troubleshooting/   Diagnose a concrete symptom
├── reference/         Look up paths, commands and protocol fields
└── releases/          Read version-specific changes
```

## Choose your starting point

| You are… | Suggested route |
| --- | --- |
| Installing for the first time | [Installation](getting-started/installation.md) → your platform guide → [First steps](getting-started/first-steps.md) |
| Moving from another client or PC | [Backup and restore](guides/backup-and-restore.md) → [Plugins and defaults](guides/plugins.md) |
| Browsing community uploads | [Connector setup](community/setup.md) → [Downloads and sharing](community/installing-and-sharing.md) |
| Creating an upload | [Plugin development](developers/plugin-development.md) → [Upload format](community/upload-format.md) |
| Investigating a problem | [Troubleshooting](troubleshooting/README.md) → [Reporting a bug](troubleshooting/reporting-bugs.md) |
| Contributing to Moggcord | [Development setup](developers/setup.md) → [Project layout](developers/project-layout.md) → [Testing](developers/testing.md) |

## Getting started

| Guide | What it covers |
| --- | --- |
| [Installation](getting-started/installation.md) | Packages, supported platforms, Discord channels and the three installer actions |
| [Windows](getting-started/windows.md) | Setup, custom folders, repair and first-launch prompts |
| [macOS](getting-started/macos.md) | Universal DMG, application selection and preview limitations |
| [Linux](getting-started/linux.md) | AppImage, DEB, permissions and supported Discord packages |
| [First steps](getting-started/first-steps.md) | Find settings, choose plugins, add a theme and make a backup |

## Everyday use

| Guide | What it covers |
| --- | --- |
| [Plugins and defaults](guides/plugins.md) | Included collections, activation, duplicates and community plugins |
| [Themes and QuickCSS](guides/themes.md) | Local stylesheets, online themes, overrides and recovery |
| [Backup and restore](guides/backup-and-restore.md) | Import review, missing plugins and portable settings |
| [Updates and repair](guides/updates-and-repair.md) | Download progress, restarts, recovery and the small update archive |
| [Trust and privacy](guides/trust-and-privacy.md) | Client code, website permissions, private data and checksums |

## Community

| Guide | What it covers |
| --- | --- |
| [Connect your computer](community/setup.md) | One-time setup, exact website origin, channels and removing the connector |
| [Downloads and sharing](community/installing-and-sharing.md) | Automatic installation, Installed detection and shareable links |
| [Prepare an upload](community/upload-format.md) | Complete folders, entry points, accepted files, limits and themes |
| [Website integration](community/website-integration.md) | Integrate the reference browser scripts with a website backend |

## Development and architecture

| Guide | What it covers |
| --- | --- |
| [Development setup](developers/setup.md) | Tool versions, an isolated checkout and building without injecting |
| [Project layout](developers/project-layout.md) | Which source, installer, test and website directories do what |
| [Plugin development](developers/plugin-development.md) | A working starter, settings, lifecycle and a packaging checklist |
| [Testing](developers/testing.md) | Focused checks, native fixtures and the limits of automated verification |
| [Release process](developers/releasing.md) | Version metadata, platform builds, release assets and publication |
| [Writing documentation](developers/documentation.md) | Folder conventions, page structure, source evidence and link checks |
| [Sponsor records](developers/sponsor-records.md) | Local statement imports, duplicate checks and records for review |
| [System architecture](architecture/README.md) | Process boundaries and how the installer, client and connector fit together |
| [Client startup and updates](architecture/client-lifecycle.md) | Loader, preload, renderer, IPC and verified replacement |
| [Community installation flow](architecture/community-installation.md) | Manifest validation, compilation, activation and rollback |

## Troubleshooting and reference

| Guide | What it covers |
| --- | --- |
| [Find your symptom](troubleshooting/README.md) | A short route to the right recovery guide |
| [Installer problems](troubleshooting/installation.md) | Missing targets, permission errors and process shutdown failures |
| [Update problems](troubleshooting/updates.md) | Stuck downloads, repeated banners and inconsistent versions |
| [Client and plugin problems](troubleshooting/client-and-plugins.md) | Blank settings, absent plugins, missing controls and theme conflicts |
| [Connector problems](troubleshooting/community.md) | Origin mismatches, browser permission, build failures and Installed state |
| [Reporting a bug](troubleshooting/reporting-bugs.md) | A useful report without exposing account data |
| [File locations](reference/file-locations.md) | Settings, builds, community sources, logs and environment overrides |
| [Commands](reference/commands.md) | Safe build and test commands, setup options and native packaging |
| [Community protocol](reference/community-protocol.md) | Local endpoints, headers, capabilities, manifests and error codes |
| [Glossary](reference/glossary.md) | Channels, injection, ASAR, source code, manifests and origins |
| [Release notes](releases/README.md) | Version-specific changes and older implementation notes |

Use the **Source of truth** links in each guide to inspect the implementation. For a specific release, open its Git tag: the `main` branch may contain changes that have not been released yet.

Older entry points remain available: [Installer](INSTALLER.md), [Desktop installers](DESKTOP-INSTALLERS.md), [Community installation](COMMUNITY-INSTALL.md) and [Included plugins](PLUGINS.md).

[Repository](../README.md) · [Latest release](https://github.com/caedesdev/moggcord/releases/latest) · [Contributing](../CONTRIBUTING.md) · [Support Moggcord](donations.md)
