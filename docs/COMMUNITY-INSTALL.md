# Install community uploads in Moggcord

The detailed guide is split into user instructions, upload preparation and a protocol reference. In 1.18.46, Moggcord starts its included local service automatically. A website server cannot install into visitors' Discord applications directly.

For normal moggcord.cc downloads, start the updated Moggcord, choose **Download** and allow local-app access when the browser asks. The local service detects the Moggcord installation and installs there. No separate setup page or terminal commands are required.

## One-time setup

Only advanced manual connections to another website origin or a development site need [manual setup](community/setup.md). That guide covers requirements, exact website origins, automatic channel detection and per-platform registration.

## Download and share

[Downloads, Installed detection and sharing](community/installing-and-sharing.md) explains automatic installation, manual file downloads and links. [Prepare an upload](community/upload-format.md) covers complete plugin folders and one-file themes.

## Website integration

[Browser/backend integration](community/website-integration.md) · [HTTP protocol, manifests and fingerprints](reference/community-protocol.md) · [Installation architecture](architecture/community-installation.md)

## Repeated update banner

[Update troubleshooting](troubleshooting/updates.md#the-update-banner-keeps-returning) covers full restarts, stale builds, wrong channels and connector checkouts. A display-only version edit does not fix an inconsistent compiled build.

## Remove the connector

[Remove its startup and protocol registration](community/setup.md#remove-the-connector) without deleting settings or installed content.

[Connector troubleshooting](troubleshooting/community.md) · [Documentation home](README.md)
