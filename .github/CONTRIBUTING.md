# Contributing to Moggcord

Start with the [documentation](../docs/README.md), then read the repository's [development rules](../AGENTS.md). Existing license headers and upstream attribution must be preserved.

## Choose a starting point

| Contribution | Read first |
| --- | --- |
| A client or plugin fix | [Development setup](../docs/developers/setup.md) and [Project layout](../docs/developers/project-layout.md) |
| A community plugin | [Plugin development](../docs/developers/plugin-development.md) and [Upload format](../docs/community/upload-format.md) |
| A clearer guide | [Documentation conventions](../docs/developers/documentation.md) |
| A reproducible problem | [Reporting a bug](../docs/troubleshooting/reporting-bugs.md) |
| Installer/release maintenance | [Release process](../docs/developers/releasing.md) |

## Work in a separate checkout

Preserve personal changes and community plugin source. Use Node 24 and the pinned pnpm version, install with the lockfile, and build before installing into a selected development client. A standard development build should not close someone's everyday Discord.

## Keep a change focused

Describe the concrete problem, the resulting behavior and the checks you ran. Add a regression test when the behavior warrants one. Include the target OS and Discord channel when compatibility matters. Do not claim native support from a test that skipped on another OS.

Use existing APIs/utilities and proper Discord types. Clean up listeners and timers. Do not add selfbot behavior, account-action automation, client-state spoofing or unrelated dependencies. Keep the project's existing license and credit information intact.

Do not include account tokens, private settings exports, local account databases, binaries, generated `dist/` output or personal plugin files in a source contribution.

## Review and checks

Follow [Testing](../docs/developers/testing.md) for focused commands. For docs-only changes, `pnpm docs:check` is sufficient unless a source/configuration change needs another check. Review the diff for unrelated changes before pushing.

The upstream projects are credited in the [README](../README.md#license-and-privacy). When adapting an upstream fix, retain applicable license notices and identify the upstream source in the contribution description. Contributions remain under the project's existing license; contributing does not transfer copyright to the maintainer.
