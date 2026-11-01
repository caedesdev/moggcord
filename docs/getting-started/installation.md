# Install Moggcord

[Documentation](../README.md) / Getting started / Installation

Moggcord modifies an existing Discord desktop installation. Install Discord first, then choose the matching Moggcord installer from the [latest release](https://github.com/caedesdev/moggcord/releases/latest).

## Choose a package

| Your system | Package | Guide |
| --- | --- | --- |
| Windows x64 | `Moggcord-Installer.exe` | [Windows](windows.md) |
| macOS Intel or Apple Silicon | `Moggcord-Installer-macOS.dmg` | [macOS](macos.md) |
| Linux x64 | `Moggcord-Installer-Linux.AppImage` or `.deb` | [Linux](linux.md) |

macOS and Linux are preview platforms. Linux supports official Discord DEB and TAR installations; Flatpak and Snap are not supported by this installer. There is no Android package in this release line.

## Choose a Discord channel

**Stable**, **PTB** and **Canary** are separate Discord applications. Moggcord must be installed in the one you actually open. Development is also selectable where a matching installation is available.

Choosing Canary does not make Moggcord appear in Stable. If the installer cannot find your application, use **Custom path** and select the real installation. The platform guides explain accepted locations.

## Choose an action

Opening the installer does not start installation.

| Action | Use it when | Expected result |
| --- | --- | --- |
| **Install Moggcord** | The selected Discord does not have Moggcord | Adds the Moggcord loader; an existing Moggcord installation is skipped |
| **Repair Moggcord** | Moggcord is already installed, damaged or no longer loading | Restores the Moggcord installation while retaining saved user data |
| **Uninstall Moggcord** | You want the selected application to run without Moggcord | Restores Discord's loader and retains Moggcord's saved user data |

If another modification is detected, review the replacement confirmation. Installing two loaders into the same Discord application is different from using separate modifications in Stable and Canary.

Save anything you are working on and leave active calls before continuing. The selected Discord closes and restarts during the operation. Other installations are not shutdown targets.

## Confirm the result

Open the same Discord channel and look for **Moggcord Settings** in user settings. Open **Updater** to see the client version. The installer's version and the client version refer to different running programs; an already-open Discord can still have the previous client code in memory.

Continue with [First steps](first-steps.md). If Moggcord is missing, use [Installer troubleshooting](../troubleshooting/installation.md).

## Source of truth

- [Windows installer backend](../../installer-src/Program.cs)
- [macOS and Linux backend](../../installer-desktop/backend.mjs)
- [Native desktop discovery](../../scripts/lib/discord-desktop.mjs)
