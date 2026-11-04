# Trust and privacy

[Documentation](../README.md) / Guides / Trust and privacy

Moggcord runs code inside a Discord desktop application. Community plugins run in that client when enabled. File-type checks, compilation and checksums do not prove that plugin code is harmless.

## Know which component you are trusting

| Component | Access and role |
| --- | --- |
| Desktop installer | Modifies the selected Discord installation and deploys the client build |
| Moggcord client and plugins | Run in Discord's main/renderer environment with the capabilities their integration exposes |
| Community website | Publishes uploads and manifests; handles its own accounts and stored content |
| Local community connector | Trusts one website origin and compiles/installs uploads into the selected local client |

The optional connector's configuration determines its trusted website and Discord channel. It runs locally on loopback, not as a public server. Do not expose its port to the internet or configure an untrusted website merely to suppress a connection error.

## Verify a release download

The main release links to its version-matched technical files, tagged `updates-v<version>`. That technical release contains `SHA256SUMS.txt`, including checksums for the four installer packages. Compare the entry for the exact package and version you downloaded. Older releases may have this file attached directly.

Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath .\Moggcord-Installer.exe
```

macOS:

```sh
shasum -a 256 Moggcord-Installer-macOS.dmg
```

Linux:

```sh
sha256sum Moggcord-Installer-Linux.AppImage
```

A matching checksum confirms that your bytes match the published asset. It does not establish publisher reputation, code safety or Apple notarization. The macOS preview is not Apple notarized. Windows may still show a reputation prompt.

## Keep account data out of public reports

Do not publish account tokens, imported-account files, authentication cookies, API keys, authorization headers, full profile databases or unreviewed settings exports. Plugin DataStore contents and screenshots can contain private information even when known sensitive settings keys are removed during export.

Use a minimal reproduction and a short, redacted error excerpt instead. See [Reporting a bug](../troubleshooting/reporting-bugs.md).

## Client modifications and platform support

Moggcord is independent of Discord and is not endorsed by it. A working installation or passing test suite is not a guarantee about account treatment, compatibility with future Discord versions or every community plugin. Keep a backup and use the documented uninstall path if you want to return the selected client to its original loader.

## Source of truth

[Original Equicord privacy policy](../reference/upstream-privacy-policy.md) · [Connector origin checks](../../scripts/community/bridge.mjs) · [Manifest validation](../../scripts/community/core.mjs) · [Export filtering](../../src/api/SettingsSync/offline.ts) · [Release checksums](../../.github/workflows/release.yml)
