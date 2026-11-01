# Build and publish a release

[Documentation](../README.md) / Developers / Releasing

This guide is for repository maintainers. Publishing exposes installers to users and can update the release selected by clients. Build and verify the intended commit before choosing the publish option.

## Prepare the version

1. Work from the intended clean commit and preserve unrelated/local plugin work.
2. Update `package.json` and the Windows `.csproj` version together.
3. Add `docs/releases/<version>.md` and link it in the release index.
4. Run the relevant [tests](testing.md), `pnpm buildStandalone` and `node scripts/build/verify-release.mjs`.
5. Review defaults, release notes and package names before publication.

The release workflow reads the package version. Tag-triggered releases require the tag's version to match it. Embedded `build-info.json` must also agree; editing a version label alone does not rebuild stale code.

## Preferred workflow

Use **Actions → Build & Release Moggcord → Run workflow** on the intended branch.

| Publish input | Result |
| --- | --- |
| `false` | Build and verify platform artifacts without publishing a release |
| `true` | Publish after the Windows, macOS and Linux jobs all pass |

Pushing a `v*` tag also triggers the release workflow. Do not both dispatch and push a tag for the same release unless you deliberately need a separate run. Inspect any workflow artifact before assuming that a successful build published it.

## Platform jobs

**Windows** uses Node 24, pnpm 10.30.3 and .NET 8. It builds the desktop bundle, runs plugin/installer checks, collects the Windows support assets, validates the embedded installer build and produces release metadata.

**macOS and Linux** build on their own runner OS. They prepare the shared interface and verified desktop files with a pinned Equilotl helper, run native fixture checks, package the installer and launch its verification mode. macOS also checks the app signature and DMG. Linux emits AppImage and DEB packages.

The publish job depends on all platform jobs. It merges their artifacts, creates checksums and validates the asset layout. It first publishes technical files as the prerelease `updates-v<version>` with `make_latest: false`, then publishes only the four installer packages as `v<version>` and marks that release latest. Existing inherited workflows have other purposes; the workflow named **Build & Release Moggcord** is the current installer publication path.

## Release assets

| Asset | Location | Intended use |
| --- | --- | --- |
| `Moggcord-Installer.exe` | Main release | Windows x64 setup |
| `Moggcord-Installer-macOS.dmg` | Main release | Universal macOS preview setup |
| `Moggcord-Installer-Linux.AppImage`, `.deb` | Main release | Linux x64 preview setup |
| `moggcord-update.zip` | Technical release | Small verified desktop-only update |
| `moggcord-dist.zip` | Technical release | Full installation/repair bundle |
| `desktop.asar`, `moggcord.asar` | Technical release | Additional bundled application artifacts |
| `version.json` | Technical release | Version, pinned update URLs and generated plugin catalog statistics |
| `installer-verification*.json` | Technical release | Embedded/package verification reports |
| `SHA256SUMS.txt` | Technical release | Checksums covering technical assets and installer packages |

The staging script rejects missing, empty or unrecognized files before creating the upload groups. Do not replace the installer's asset list with a wildcard for the entire staging root. GitHub's own source-code archive links are separate from the uploaded assets.

When migrating from an installer-plus-update main release, retain verified backups and publish the technical copies before removing the old attachments. Clients older than 1.18.44 need one Repair installation because their updater does not know the new technical release path.

## Local packaging

On Windows, after `pnpm buildStandalone`, the release workflow runs asset collection and verification before `build-installer.ps1`. That script embeds the freshest full bundle and verifies the installer with `--verify-bundle`.

For macOS/Linux, run `pnpm build:platform-installer` on the target platform. Package the generated project under `.codex-temp/platform-installer/<platform>` using `installer-desktop/electron-builder.cjs`, then run `node scripts/build/verify-platform-package.mjs`. Use the workflow as the exact command reference; do not substitute the legacy root electron-builder configuration.

The pinned helper's version and hash are in `installer-desktop/upstream.json`. Changing them requires reviewing the source release and updating the expected fingerprint deliberately. A fingerprint mismatch should stop packaging.

## After publication

Check the public asset URLs, the version metadata, checksum entries and verification reports. Exercise an update from an older build in an isolated target. Confirm that the small update archive is selected by compatible clients and that no failed download is reported as installed.

Do not treat artifact verification as an account-login or voice-session test. Keep preview/signing limitations visible in release notes. If a published release is wrong, diagnose it and publish a corrected version rather than silently changing a tag's history.

## Source of truth

[Release workflow](../../.github/workflows/release.yml) · [Asset layout](../../scripts/build/release-layout.mjs) · [Windows packaging](../../build-installer.ps1) · [Native preparation](../../scripts/build/platform-installer.mjs) · [Pinned helper](../../installer-desktop/upstream.json) · [Small archive](../../scripts/build/update-archive.mjs) · [Version verification](../../scripts/build/verify-release.mjs)
