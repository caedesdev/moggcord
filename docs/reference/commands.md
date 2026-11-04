# Command reference

[Documentation](../README.md) / Reference / Commands

Run these commands from the repository root using Node 24 and the pnpm version in `package.json`. Build/test commands and installation commands have different effects.

## Read, build and verify

| Command | Purpose |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install the checkout's pinned dependencies |
| `pnpm buildStandalone` | Build the injected desktop bundle and build information |
| `pnpm watch` | Watch/rebuild development source |
| `pnpm buildWeb` | Build the separate web output; does not prove desktop injection works |
| `node scripts/build/verify-release.mjs` | Check desktop version/fingerprints against `package.json` |
| `node scripts/build/catalog-stats.mjs` | Generate the public desktop plugin catalog statistics |
| `node scripts/build/update-archive.mjs` | Package the verified desktop-only update ZIP into release staging |
| `pnpm docs:check` | Check documentation structure and local links without installing dependencies |

## Focused tests

| Command | Area |
| --- | --- |
| `pnpm test:plugins` | Catalog/defaults, import review and client regression checks |
| `pnpm test:community` | Connector, protocol, updater and release checks |
| `pnpm test:installer` | Shared installer UI |
| `pnpm test:platform-installer` | macOS/Linux backend and extraction; native checks require the target helper |
| `dotnet run --project scripts/tests/installer-native --configuration Release` | Windows native installer fixtures; needs .NET 8 and Windows |
| `pnpm testTsc` | Type checking |
| `pnpm lint` | JavaScript/TypeScript linting |
| `pnpm lint-styles` | Stylesheet linting |

`pnpm test` includes `lint:fix` and can change source files. Review the [testing guide](../developers/testing.md) before running broad checks in a working checkout.

## Commands that change a client

| Command | Effect |
| --- | --- |
| `pnpm inject` | Invoke the source installer runner to install a build into Discord |
| `pnpm repair` | Invoke the source installer runner's repair operation |
| `pnpm uninject` | Invoke the source installer runner's uninstall operation |
| `pnpm community:setup --channel canary --site https://community.example.com` | Build/repair and restart the selected channel, then register the local connector |
| `pnpm community:start` | Start the connector from its saved configuration |

The community example domain is a placeholder. Use the actual trusted origin. Setup also accepts `--data-dir` for a custom settings location; channels are `stable`, `canary`, `ptb` and `development`.

For an explicit connector configuration, invoke the underlying entry point:

```sh
node scripts/community/bridge.mjs --config /absolute/path/to/config.json
```

## Installer packaging

Windows uses `scripts/build/windows-installer.ps1` after the desktop build and asset verification. macOS/Linux use `pnpm build:platform-installer` and the dedicated `installer-desktop/electron-builder.cjs` configuration. Packaging produces artifacts; publication is a separate workflow option.

On Windows, `scripts\windows\build-installer.bat` runs the same packaging script. Other Windows wrappers are in `scripts/windows/`; the public `install-moggcord.ps1` download entry point remains at the repository root. Run `pnpm test:performance` for the renderer cache and listener regression tests.

Follow [Releasing](../developers/releasing.md) for the exact platform sequence. The legacy `pnpm package` path has different behavior and is not the current multi-platform installer workflow.

## Source of truth

[package.json scripts](../../package.json) · [Release workflow](../../.github/workflows/release.yml) · [Setup options](../../scripts/community/setup.mjs) · [Source installer](../../scripts/runInstaller.mjs)
