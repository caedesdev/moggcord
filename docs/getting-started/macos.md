# Install on macOS

[Documentation](../README.md) / Getting started / macOS

The macOS preview is a universal application for Intel and Apple Silicon. Download `Moggcord-Installer-macOS.dmg` from the [latest release](https://github.com/caedesdev/moggcord/releases/latest).

## Install

1. Open the DMG and copy **Moggcord Installer** into Applications.
2. Open Moggcord Installer as your normal user.
3. Choose **Install Moggcord**, then select your Discord application.
4. If necessary, use **Custom path** to choose a Discord `.app` outside `/Applications`.
5. Continue and wait for the selected Discord application to restart.

Use **Repair Moggcord** for an existing installation and **Uninstall Moggcord** to restore the original loader. Saved Moggcord data is retained.

## Signing and permissions

The preview is ad hoc signed and is **not Apple notarized**. macOS may require approval in **System Settings → Privacy & Security** before first launch. Verify the release source and checksum before approving it. The installer does not change Gatekeeper or quarantine settings automatically.

An application in a protected location can require an administrator's permission to modify its files. The installer uses the normal macOS permission dialog for that operation. It should otherwise run under your regular user account.

## What the preview verifies

Release checks run on macOS. They verify the packaged application's embedded build, helper fingerprint, code-signature consistency and DMG, and exercise install, repair and restoration on an ASAR fixture.

These checks do not certify every plugin, account-login flow or voice setup. If you find a macOS-specific problem, include your CPU architecture, Discord channel, Moggcord version and steps to reproduce it in a [bug report](../troubleshooting/reporting-bugs.md).

## Next steps

[First steps](first-steps.md) · [Community connector setup](../community/setup.md) · [Installer troubleshooting](../troubleshooting/installation.md)

## Source of truth

[Desktop installer backend](../../installer-desktop/backend.mjs) · [Native discovery](../../scripts/lib/discord-desktop.mjs) · [Packaging configuration](../../installer-desktop/electron-builder.cjs)
