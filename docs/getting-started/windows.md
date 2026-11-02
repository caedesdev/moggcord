# Install on Windows

[Documentation](../README.md) / Getting started / Windows

Use `Moggcord-Installer.exe` from the [latest release](https://github.com/caedesdev/moggcord/releases/latest). This package is for Windows x64. You do not need Node.js, pnpm or a source checkout for the normal graphical installer.

Starting with version 1.18.50, the Windows installer includes the required .NET runtime. No separate .NET Desktop Runtime installation is needed for these installer files.

## Install or repair

1. Open the installer.
2. Choose **Install Moggcord**, or **Repair Moggcord** if it is already installed.
3. Select the Discord channel you use: Stable, PTB, Canary or a detected Development installation.
4. Review any replacement confirmation and press the action button.
5. Wait for the result and reopen user settings in that same Discord channel.

The selected application closes and restarts. Opening the installer, switching actions or dismissing a notification does not install anything.

## Use a custom path

Under the installation list, choose **Custom path**. Use **Browse…**, or paste a path and choose **Use path**.

The Windows resolver accepts a Discord installation root, an `app-<version>` directory, its `resources` directory or the Discord executable. For an installation root, the newest valid numeric app version is selected. Select the installed application, not its installer download or a shortcut.

The icon shown beside a detected Windows target comes from its executable. That icon identifies the channel; it does not indicate that Moggcord is already installed.

## First-launch prompts

Windows may show an unknown-app or publisher prompt for a downloaded installer. Check that the file came from the Moggcord release and compare it with `SHA256SUMS.txt` in that release's linked technical files. A checksum confirms a match to that release; it does not make Windows trust the publisher.

Do not disable Windows protection to troubleshoot an installer. If you cannot verify the file, stop and report its release URL. See [Trust and privacy](../guides/trust-and-privacy.md).

## Remove Moggcord

Choose **Uninstall Moggcord** and the same Discord target. This removes the modification from that target and keeps saved settings. Removing the optional community connector is a separate [procedure](../community/setup.md#remove-the-connector).

## If setup fails

The result screen shows an explanation. Notifications appear at the top right and can be reopened with **View details**. If Discord could not be closed, fully quit the selected application, including its tray process, then retry. Avoid repeatedly launching multiple installers.

See [Installer troubleshooting](../troubleshooting/installation.md) for missing targets and access errors.

## Source of truth

[Windows backend](../../installer-src/Program.cs) · [Installer interface](../../installer-src/index.html) · [Native installer checks](../../scripts/tests/installer-native)
