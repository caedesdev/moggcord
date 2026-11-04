# Test a change

[Documentation](../README.md) / Developers / Testing

Run checks that exercise the changed behavior. A fixture test can verify file handling or rollback without modifying a real Discord installation. Real client compatibility still needs a deliberately chosen target and a manual reproduction.

## Focused checks

| Area | Command | Coverage |
| --- | --- | --- |
| Documentation | `pnpm docs:check` | Local files, heading anchors, page titles and navigation |
| Plugin catalog and client regressions | `pnpm test:plugins` | Defaults, both collections, imports, notifications, compatibility patches and related regressions |
| Renderer cache and lifecycle | `pnpm test:performance` | Bounded message conversion/render caches, stealth toggles and listener cleanup |
| Connector and updater | `pnpm test:community` | Package validation, local HTTP behavior, compile/install rollback, download limits, cancellation and release fingerprints |
| Installer interface | `pnpm test:installer` | Action selection, custom paths, replacement guards, progress and notification behavior |
| macOS/Linux backend | `pnpm test:platform-installer` | Platform paths, install/repair/restore, permission staging and archive extraction |
| Windows native backend | `dotnet run --project scripts/tests/installer-native --configuration Release` | Temporary installation fixtures, target resolution and selected-process shutdown |
| Desktop compilation | `pnpm buildStandalone` | Current renderer/main/preload and local-service bundles with build information |
| Built desktop files | `node scripts/build/verify-release.mjs` | Build version and the five desktop file fingerprints |

The Windows native tests need the .NET 8 SDK and Windows. Target-platform native tests can skip on another OS or without the pinned helper. A skip is not evidence that native installation succeeded.

## Native macOS and Linux checks

The release workflow prepares the pinned installer helper on its host platform, then passes its path through `MOGGCORD_NATIVE_INSTALLER` when running platform tests. This enables actual ASAR patch/restore and isolated selected-process shutdown checks in addition to backend fixtures.

After packaging, `verify-platform-package.mjs` launches the packaged installer in its verification mode and checks the report. Linux CI uses Xvfb and a verification-only sandbox option for that isolated executable; this is not an end-user launch instruction.

## Lint and type checking

The repository exposes `pnpm lint`, `pnpm lint-styles` and `pnpm testTsc`. Run the relevant checks and inspect failures; do not rewrite existing license headers to satisfy a formatting rule. Some inherited project areas can have existing type/lint failures, so report what actually ran and whether a failure belongs to the changed code.

`pnpm test` includes a lint autofix step. Do not use it as a read-only check in a checkout with unrelated personal changes. Prefer focused commands while reviewing a small patch.

## Manual verification

Record the OS, Discord channel/build and Moggcord version. Reproduce the concrete trigger before and after the change. For process/main-code changes, fully quit and reopen the application; a window reload is insufficient.

Packaging success does not prove that Discord login, every plugin, every theme or a real voice session works. The macOS/Linux preview label reflects this distinction.

## Source of truth

[Test scripts](../../package.json) · [Test sources](../../scripts/tests) · [Release verification](../../.github/workflows/release.yml) · [Packaged executable check](../../scripts/build/verify-platform-package.mjs)
