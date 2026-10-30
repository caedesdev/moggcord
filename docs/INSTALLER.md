# Moggcord Installer

Download the current [Windows installer](https://github.com/caedesdev/moggcord/releases/latest/download/Moggcord-Installer.exe). Opening it shows three actions before any Discord files are changed:

- **Install Moggcord** adds Moggcord to the Discord installation you choose. If Moggcord is already installed there, Install leaves it untouched and offers Repair.
- **Repair Moggcord** restores Moggcord files on the selected installation and preserves your settings, plugins and themes.
- **Uninstall Moggcord** removes Moggcord from the selected installation and keeps its saved settings.

After choosing an action, select Discord, PTB, Canary or Development and press the action button to continue. The selected Discord closes and restarts during the operation. A detected third-party mod needs explicit replacement confirmation before Install can proceed.

Installer notifications appear at the top right on dark surfaces with green success, red error, yellow warning and blue information accents. They animate in and out and automatically disappear after five seconds. Hovering or keyboard focus pauses the timer. Each notification includes an icon, heading, details and a dismiss button. The result screen's **View details** button can show the result notification again. Dismissing a notification never starts an operation or bypasses a required replacement confirmation.

For a custom location, use **Custom path** below the installation list. Press **Browse…** to select a folder, or paste a Discord installation folder, an app folder, its resources folder or the full path to Discord.exe, then press **Use path**. A versioned installation root resolves to the newest valid numeric app version. The selected target shows the original icon extracted from its Discord executable.

Install, Repair and Uninstall close only matching Discord processes inside the selected installation directory. Protected DiscordSystemHelper processes are not shutdown targets. If Windows still refuses to close the selected Discord, the error includes the process ID and Windows error details.

The version in the footer is the actual installer version, including when offline. The Inter variable font is embedded for consistent typography; its [SIL Open Font License](../installer-src/fonts/Inter.LICENSE.txt) is included with the font and embedded in the executable.

## Development checks

Use Node 24, pnpm and the .NET 8 SDK on Windows:

```powershell
pnpm test:installer
dotnet run --project scripts/tests/installer-native --configuration Release
pnpm buildStandalone
.\build-installer.ps1
```

The native tests use temporary resources fixtures and an isolated file cache. They check existing-install skips, third-party mod protection, path resolution and invalid targets. Shutdown checks start temporary test processes, close only the selected fixture and verify that an unrelated installation and helper remain running. They do not install into or stop a real Discord installation. The packaging script also checks the embedded desktop version and file fingerprints using the installer's read-only `--verify-bundle` command.

## Window dragging

Version 1.18.33 restores dragging from Discord's title bar while keeping buttons, inputs, dialogs and the rest of the application outside the window drag region. Fully restart Discord after installing or repairing so the main-process stylesheet is refreshed.

Version 1.18.34 adds local FakeVoice mute/deafen indicators in your own voice participant row and a highlighted account-panel switch. Mode changes show an animated dark notification at the top right for three seconds. The real audio controls and other participants' indicators are unchanged. Fully restart Discord after updating to load the new display patch.

Version 1.18.35 restores the Vencord plugins alongside the Moggcord collection, including their native helpers and required profile-section API. The plugin page initially shows both collections and offers a Vencord filter. The four default plugins remain enabled; other plugins are available to enable individually. Fully restart Discord after updating or repairing to load the expanded catalog.
