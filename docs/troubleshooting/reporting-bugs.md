# Report a reproducible bug

[Documentation](../README.md) / Troubleshooting / Reporting a bug

Use the repository's [GitHub issues](https://github.com/caedesdev/moggcord/issues) for a Moggcord problem. Include enough information to distinguish an installer failure, a running-client issue and a community connector problem.

## Collect the basics

| Information | Example |
| --- | --- |
| Operating system and architecture | Windows x64; macOS Apple Silicon; Linux distribution/x64 |
| Discord channel and build | Stable, PTB or Canary and the shown build/version |
| Moggcord version | Version from Updater, not just the installer filename |
| Installation method | Published installer, local build or community connector |
| Affected area | Server settings, updater download, one plugin, theme or website installation |
| Reproduction | Exact steps from a known starting state |
| Expected and actual result | What should happen and what you can observe instead |
| Error and recovery tried | Exact message and whether a full restart/Repair changes the result |

For a connector problem, also include the selected channel, whether the public/development origin matches and whether the failure happens during validation, build, deployment or restart. Include the upload's public URL if it can be shared; do not attach private source without permission.

## Use this outline

```text
Title: [Area] Short description of the failing action

Environment:
- OS / architecture:
- Discord channel / build:
- Moggcord version:
- Installation method:

Steps:
1.
2.
3.

Expected result:
Actual result:
Exact error:
Does a full quit/reopen change it?
Relevant plugin/theme and result with it disabled:
```

Do not invent answers for fields you cannot check; mark them unknown.

## Share a small, redacted excerpt

On Windows, the current main-process log is documented in [File locations](../reference/file-locations.md#diagnostics). Include the relevant time range instead of an entire multi-session log. Crop screenshots so they do not expose unrelated messages, account tokens or personal server information.

Do not attach unreviewed settings exports, account files, cookies, authorization headers, API keys or complete user-data directories. Known-key export filtering does not guarantee that arbitrary plugin data is public.

## If it looks security-sensitive

Do not publish a working secret or private exploit details in a normal bug attachment. Check whether the repository's **Security** tab offers private vulnerability reporting and use it if available. If no private route is configured, ask maintainers for a private reporting channel without posting sensitive details publicly.

[Troubleshooting home](README.md) · [Trust and privacy](../guides/trust-and-privacy.md)
