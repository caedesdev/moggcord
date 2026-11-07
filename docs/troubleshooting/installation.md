# Fix installer problems

[Documentation](../README.md) / Troubleshooting / Installer

## Discord is not listed

Check that Discord is installed and that you selected the right platform package. Stable, PTB and Canary are different applications.

Use **Custom path** for an installation outside the detected locations. On Windows, select the actual application/executable or installation folder. On macOS, select the Discord `.app`. On Linux, select a supported official DEB/TAR application directory; Flatpak/Snap are not supported by this installer.

If a folder is rejected, keep the exact error for a report. Renaming an unrelated folder to Discord does not make it a valid application target.

## Discord could not be closed

1. Save work and leave active calls in the selected channel.
2. Fully quit that Discord application, including its tray/background process.
3. Return to setup and retry the selected action.

The installer targets Discord processes inside the chosen installation, not every application named Discord on the PC. A protected helper is not a normal shutdown target. If shutdown still fails, report the selected channel, installation type and displayed process/Windows error details. Redact personal path segments if needed.

Avoid opening several installers or repeatedly clicking actions while one operation is active.

## Install does nothing because Moggcord is already present

This is expected. **Install** skips an existing Moggcord installation and offers **Repair**. Use Repair to restore/update files; reopening Install should not repeatedly replace an already installed client.

## Another modification is detected

Review the replacement confirmation. The installer protects a detected third-party loader from silent replacement. Choose another Discord channel if you intend to keep a different modification there, or explicitly confirm replacement for the intended target.

## Permission or write error

Check whether the selected installation is in a protected directory or files are still in use. macOS/Linux installers request permission for protected application files through their native mechanism. Keep the main installer running as your normal account so its per-user files go to the correct home directory.

Do not solve an unknown path/write error by recursively changing permissions on the whole application or user-data tree. Capture the exact error and chosen installation first.

An older Windows installer may report that `discord_voice.node` is in use after the Moggcord loader has already been installed. This comes from copying bundled native Discord modules over the selected client's files. Installer builds from the current source preserve Discord's voice modules, codec DLL and native module configuration. The native checks cover this case with a locked voice module and codec file.

## The installer opens but Moggcord is absent afterward

Confirm that you opened the same Discord channel you installed into. Fully close and reopen it so the main process loads the changed loader. If a Discord host update replaced the injection, use the latest package's **Repair** action.

An installer success report is not proof that a different channel has Moggcord. Look for **Moggcord Settings** in the actual target application.

## First-launch and package problems

See the platform guides for [Windows publisher prompts](../getting-started/windows.md#first-launch-prompts), [macOS approval](../getting-started/macos.md#signing-and-permissions) and [Linux AppImage/DEB support](../getting-started/linux.md). Verify the release source and checksum rather than disabling operating-system protections.

[Report a bug](reporting-bugs.md) · [Installation overview](../getting-started/installation.md)
