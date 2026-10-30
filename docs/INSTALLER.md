# Moggcord Installer

Download the current [Windows installer](https://github.com/caedesdev/moggcord/releases/latest/download/Moggcord-Installer.exe). Opening it shows three actions before any Discord files are changed:

- **Install Moggcord** adds Moggcord to the Discord installation you choose. If Moggcord is already installed there, Install leaves it untouched and offers Repair.
- **Repair Moggcord** restores Moggcord files on the selected installation and preserves your settings, plugins and themes.
- **Uninstall Moggcord** removes Moggcord from the selected installation and keeps its saved settings.

After choosing an action, select Discord, PTB, Canary or Development and press the action button to continue. The selected Discord closes and restarts during the operation. A detected third-party mod needs explicit replacement confirmation before Install can proceed.

For a custom location, enter its full resources path, such as `C:\Users\you\AppData\Local\DiscordCanary\app-1.0.x\resources`.

The version in the footer is the actual installer version, including when offline. The Inter variable font is embedded for consistent typography; its [SIL Open Font License](../installer-src/fonts/Inter.LICENSE.txt) is included with the font and embedded in the executable.

## Development checks

Use Node 24, pnpm and the .NET 8 SDK on Windows:

```powershell
pnpm test:installer
dotnet run --project scripts/tests/installer-native --configuration Release
pnpm buildStandalone
.\build-installer.ps1
```

The native guard tests use temporary resources fixtures and an isolated file cache. They check existing-install skips, third-party mod protection and invalid targets without performing a real installation. The packaging script also checks the embedded desktop version and file fingerprints using the installer's read-only `--verify-bundle` command.
