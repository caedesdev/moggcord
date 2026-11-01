# Set up a development checkout

[Documentation](../README.md) / Developers / Setup

Use a separate checkout for development so a build, connector setup or branch change does not overwrite personal modifications in another working copy.

## Toolchain

| Tool | Project baseline |
| --- | --- |
| Node.js | 24, as used by the release workflow |
| pnpm | The `packageManager` version in `package.json`, currently 10.30.3 |
| Git | Required for the checkout and version context |
| .NET SDK | 8.x, only for the Windows installer and its native tests |
| Native packaging tools | Target-platform tools used by the release workflow; see [Releasing](releasing.md) |

The generic Node version guard accepts older versions than the release workflow uses. That does not make those versions the tested baseline for the current installer/connector toolchain.

## Build without changing Discord

```sh
git clone https://github.com/caedesdev/moggcord.git moggcord-dev
cd moggcord-dev
pnpm install --frozen-lockfile
pnpm buildStandalone
node scripts/build/verify-release.mjs
```

This produces desktop files under `dist/desktop` and verifies their version/fingerprints. It does not inject the build into Discord. A development watch build is also available with `pnpm watch`; it does not mean the files are connected to a running installation.

## Before injecting a local build

Export settings, choose the Discord channel deliberately, and check what a command will launch. The source installer commands `pnpm inject`, `pnpm repair` and `pnpm uninject` invoke the source installer runner; they are installation actions, not build checks.

For ordinary use, install the published graphical package. For website-driven local plugins, use [Community setup](../community/setup.md), which compiles this checkout and restarts the selected channel. Do not run that setup against your everyday client merely to test whether TypeScript compiles.

## Work on a plugin

Place local source in `src/userplugins/<your-plugin>/`. Those files participate in local builds; they are not automatically part of a public release. Keep personal code out of commits unless it is intended for the repository.

Use the [plugin starter](plugin-development.md), then run the [focused checks](testing.md) for the affected area.

## Desktop shell versus injected client

This repository contains both desktop-shell code and code injected into Discord. `pnpm buildStandalone` builds the injected desktop bundle. `pnpm start` builds and opens the separate desktop application path. Do not use one as proof that the other works.

The legacy root `pnpm package` configuration can copy files from a locally installed Windows Discord during packaging. For release installers, follow the dedicated Windows/macOS/Linux procedures in [Releasing](releasing.md) instead of treating the root packaging command as a read-only build check.

## Source of truth

[Project scripts](../../package.json) · [Build entry points](../../scripts/build/build.mjs) · [Source installer runner](../../scripts/runInstaller.mjs) · [Release workflow](../../.github/workflows/release.yml) · [Repository rules](../../.rules)
