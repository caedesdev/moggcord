# Privacy Policy

[Documentation](../README.md) / Privacy · [Deutsch](datenschutzerklaerung.md)

Updated: 5 November 2026.

**Draft.** Controller identification and complete, verified information about the hosted service have not been supplied. This document describes the software and is not a complete privacy notice under Article 13 GDPR.

Project privacy contact: [owner@moggcord.cc](mailto:owner@moggcord.cc).

## What this covers

These notes cover the Moggcord installer, desktop client and local community connector in this repository. Optional plugins, configured cloud services, Discord, GitHub and the hosted community website can involve additional processing. Their operators' notices also matter. This document does not claim that all data stays on your device or that every plugin has the same privacy behavior.

## Data on your device

The client stores settings, enabled-plugin choices, themes and QuickCSS locally. Plugins can keep additional information in their own settings, files or browser databases. Depending on enabled features, this can include account credentials, exported conversations, cached or logged messages and attachments. Diagnostic files can contain paths, errors and other private information.

The installer changes the selected Discord installation and deploys Moggcord files. The local connector stores configuration, community source and build output. It listens on loopback and checks the configured website origin; it is not intended to be exposed as a public server.

See [file locations](../reference/file-locations.md) and [backup and restore](../guides/backup-and-restore.md). Treat settings exports and plugin data as private. Export filtering is not a guarantee that every sensitive value has been removed.

## Network connections

| Feature | What is sent or requested |
| --- | --- |
| Discord | The client continues to use Discord's services for account, messaging, voice and other Discord features. See [Discord's privacy policy](https://discord.com/privacy). |
| Updates and downloads | Release checks and downloads contact GitHub and its delivery infrastructure. The recipient receives connection information, including the requesting IP address and request headers. |
| Online themes and media | The configured servers receive requests for stylesheets, images and other resources, along with connection information. |
| Cloud sync | When connected and enabled, the configured cloud service receives synchronized settings and QuickCSS. Settings can contain sensitive plugin values. The default cloud URL in this source is `https://cloud.equicord.org/`; settings synchronization is off by default. |
| Community features | The configured website supplies manifests, source and media. The trusted website can ask the local connector to inspect installation state and install selected community content. |
| Optional plugins | Depending on their code and settings, plugins can contact other services and transmit feature-specific data. Review them before enabling them. |

Compression, Base64 encoding and checksums are not end-to-end encryption. Do not enable cloud sync on the assumption that its operator cannot read synchronized data.

Opening this repository, reporting an issue or using GitHub Sponsors also uses GitHub services. See [GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Hosted website and public uploads

Website accounts, login providers, public profiles, uploads, download statistics and support requests are separate server-side processing. A public plugin or theme upload can expose its source, files and author information to other visitors. Do not upload credentials or personal information you do not intend to publish.

The website account backend and its live hosting configuration are outside this repository. This draft does not establish the actual host, processing locations, legal bases, recipients, international-transfer safeguards or server retention periods. Those details and controller identification must be verified before these notes can serve as the hosted website's complete privacy notice.

## Retention and removal

There is no single retention period for all plugin data. Local information can remain until removed through the relevant feature or from its storage location. Disabling a plugin, repairing Moggcord or uninstalling the client does not necessarily erase its settings, saved logs, exports or backups. A memory-cache limit does not delete records saved in a plugin database.

Cloud data must be removed through the connected service. Removing a local installation does not automatically erase data held by the website, GitHub, Discord or other providers. Public copies and previously downloaded uploads may remain with their recipients.

## Questions and requests

Contact [owner@moggcord.cc](mailto:owner@moggcord.cc) with privacy questions or requests concerning Moggcord-operated services. Depending on the processing and applicable law, rights can include access, correction, erasure, restriction, portability, objection, withdrawal of consent for future processing and a complaint to a supervisory authority. See the [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj).

Do not send passwords, account tokens or complete private databases with a request. Requests concerning another provider should be directed to that provider.

## Implementation references

[Client settings and cloud defaults](../../src/api/Settings.ts) · [Cloud synchronization](../../src/api/SettingsSync/cloudSync.ts) · [Export filtering](../../src/api/SettingsSync/offline.ts) · [Updater](../../src/main/updater/http.ts) · [Local connector](../../scripts/community/bridge.mjs)
