# Install on Linux

[Documentation](../README.md) / Getting started / Linux

The Linux preview is for x64 systems with an official Discord DEB or TAR installation. Flatpak, Snap and system-Electron repackagings are not supported by this installer.

## Choose AppImage or DEB

Download one package from the [latest release](https://github.com/caedesdev/moggcord/releases/latest).

| Package | How to open it | Notes |
| --- | --- | --- |
| `Moggcord-Installer-Linux.AppImage` | Allow execution in the downloaded file's properties, then open it | May require FUSE 2 on your distribution |
| `Moggcord-Installer-Linux.deb` | Install with your package manager, then open Moggcord Installer | Alternative for Debian/Ubuntu systems without AppImage support |

The installer package and the Discord package are separate. Installing the Moggcord Installer DEB does not choose a Discord target or inject it automatically.

## Install or repair Discord

1. Open Moggcord Installer as your normal user.
2. Choose **Install Moggcord** or **Repair Moggcord**.
3. Select the detected Stable, PTB or Canary installation where available.
4. For a custom TAR installation, choose its actual application directory using **Custom path**.
5. Continue, approve a write-permission request if needed, and wait for Discord to restart.

System directories use polkit to request permission for the necessary operation. Keep the installer itself running as your regular user so settings and builds are written to the correct account.

## Unsupported or missing installations

A Flatpak/Snap application cannot be made compatible merely by selecting its folder. Use a supported Discord installation instead. If an official TAR application is not detected, choose the extracted application directory rather than the `.tar.gz` download.

If an AppImage cannot start, try the DEB on a supported distribution or resolve the AppImage/FUSE requirement through your distribution's package manager. Do not run the installed client with sandbox protection disabled as a workaround.

## Preview coverage

Native CI exercises installation, repair, ASAR restoration and selected-process shutdown in isolated fixtures. Real account sessions, voice setups and all plugins still require testing on the target distribution.

[First steps](first-steps.md) · [File locations and XDG directories](../reference/file-locations.md) · [Installer troubleshooting](../troubleshooting/installation.md)

## Source of truth

[Desktop discovery](../../scripts/lib/discord-desktop.mjs) · [Permission handling](../../installer-desktop/backend.mjs) · [Linux packaging](../../installer-desktop/electron-builder.cjs)
