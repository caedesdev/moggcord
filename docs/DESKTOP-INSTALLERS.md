# Desktop installers

Download installers only from [Moggcord releases](https://github.com/caedesdev/moggcord/releases/latest). Choose the package for your operating system. Opening an installer only shows the setup screen; no Discord files change until you select an action, choose your installation and continue.

## Windows

Open `Moggcord-Installer.exe`. Choose Install Moggcord, Repair Moggcord or Uninstall Moggcord. Select Stable, PTB, Canary or a custom installation. Existing settings and community plugins are kept.

## macOS

Download `Moggcord-Installer-macOS.dmg`, open it, and copy Moggcord Installer into Applications. Open the installer and choose your Discord application. Both Intel and Apple Silicon are included. The file picker can also select an application outside `/Applications`.

The app is ad hoc signed and not Apple-notarized. macOS can require approval in System Settings, Privacy & Security before its first launch. Check the download source and published checksum before approving a download. No Gatekeeper or quarantine settings are changed automatically. If your Discord application requires an administrator to modify it, macOS shows its normal permission dialog.

## Linux

Download `Moggcord-Installer-Linux.AppImage`, make that downloaded file executable in its file properties, then open it. Debian and Ubuntu users can alternatively install `Moggcord-Installer-Linux.deb` through their package manager and open Moggcord Installer from the application launcher.

The first Linux release is x64 and supports official Discord DEB or tar.gz installations, including Stable, PTB and Canary where available. Flatpak, Snap and system Electron repackagings are not supported. Choose the installation directory with Custom path if it is not detected. AppImage may need FUSE 2; the DEB avoids that requirement. System directories use polkit to request the required write permission. Keep the installer itself running as your normal user.

## Updates and repair

The client updater downloads the shared desktop bundle, checks its build information and applies it to the active per-user installation. Completely restart the selected Discord when requested. Use Repair in the latest installer if Discord's own host update has replaced the injection. Repair and Uninstall retain Moggcord settings, themes and downloaded source files.

## Community plugins and themes

Community installation connects each visitor's own computer to the website. It does not install files on the website owner's PC. The optional [community setup](COMMUNITY-INSTALL.md) needs Node.js and a source checkout, selects one Discord channel and trusts only the exact website address you provide. The desktop installer does not silently connect an arbitrary website.

## Verification scope

Both new platforms have native CI tests that patch a real ASAR fixture, detect the installed loader, repair it and restore its original contents. Packaged installer verification checks the embedded client version and pinned native helper. This does not replace testing Discord account login, voice calls and individual plugins on real machines. The macOS and Linux downloads are initially marked as previews.
