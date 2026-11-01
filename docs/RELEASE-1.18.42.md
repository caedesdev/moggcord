# Installers for Windows, macOS and Linux

- Keep the Windows installer and add native macOS and Linux installer apps with the same Install, Repair and Uninstall screens.
- macOS: a universal DMG for Intel and Apple Silicon.
- Linux: x64 AppImage and DEB packages for the official Discord desktop installation.
- Detect Stable, PTB and Canary, allow a custom Discord path, and preserve saved settings during repair and uninstall.
- Use per-user macOS and Linux storage paths and extract updates without requiring PowerShell.
- Extend the optional community connection setup to macOS and Linux, with per-user login startup and installation links.

The new macOS and Linux installers are initial preview releases. CI checks the bundled files and performs real ASAR install, repair and restoration tests on both operating systems. A live Discord account, voice calls and every community plugin have not been manually verified on both systems. Windows retains the existing installer flow and regression checks.

macOS packages use ad hoc signing and are not notarized with an Apple Developer identity. macOS may ask the user to approve opening the downloaded app in Privacy & Security. The installer does not remove quarantine flags or disable Gatekeeper.

Linux supports the official Discord DEB and tar.gz installations. Flatpak and Snap are not supported by this installer. AppImage can require FUSE 2; use the DEB on Debian or Ubuntu if needed. System installations request permission through polkit.

See [desktop installation](https://github.com/caedesdev/moggcord/blob/main/docs/DESKTOP-INSTALLERS.md) and [community connection](https://github.com/caedesdev/moggcord/blob/main/docs/COMMUNITY-INSTALL.md). SHA256SUMS.txt covers the published installers and bundles.
