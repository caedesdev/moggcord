# Download, install and share community uploads

[Documentation](../README.md) / Community / Downloads and sharing

## Automatic installation

After [one-time setup](setup.md), choose **Download** on a plugin or theme. The same flow can be used from an author's profile.

1. The website connects to the connector on the visitor's computer.
2. The connector downloads the upload manifest and checks its identity and file fingerprint.
3. A code plugin is validated and compiled. A stylesheet uses the theme installation path.
4. The selected Discord channel closes; the compiled files or stylesheet are installed and enabled.
5. That channel restarts, and the website receives the installation result.

The website should show success only after the connector confirms completion. An upload is installed on the computer running that browser/connector, not on the uploader's PC or the web server.

If the connector is not running, the browser integration tries the registered `moggcord://` link. The browser can ask permission to open it. If connection fails, the site shows setup help rather than silently downloading a source file.

## Automatic installation versus Download file

| Action | Result |
| --- | --- |
| **Download** | Request automatic installation through the local connector |
| **Download file** | Save a source file or folder ZIP through the browser for manual use |
| **Open in Moggcord** | Open the registered connector link |
| **Copy install link** | Copy a link tied to that upload's manifest and fingerprint |

Saving a file alone does not compile it, enable it or restart Discord. The separate manual action makes this distinction visible.

## Installed detection

When supported by the connector, the site checks the selected local client when a library/profile opens and when the window regains focus. It reads registered plugin names in the compiled renderer or the connector's theme directory. A leftover settings key or previous download is not sufficient.

A disabled plugin can still be installed. An unavailable connection means **unknown**, not proof that the plugin is absent. The inspection does not modify files, increment download totals or restart Discord.

Reinstalling identical content already present in the selected installation skips compilation, file writes and restart. A changed package can still require installation even when its plugin name exists.

## Share a link

Use **Copy install link**. The recipient needs Moggcord, a connector configured for the same website origin and an available target channel on their own machine.

Install links contain the manifest URL and a SHA-256 fingerprint. They identify the exact package version. Editing a nested plugin file changes the package fingerprint; an old link must not silently install the changed upload. Deleted uploads can make old links unavailable.

## After an official update

Community source is retained in the connector checkout under `src/userplugins/community-<upload-id>`. Official client releases replace compiled desktop code and do not bundle every user's private community source.

If a community plugin disappears after updating, use the retained checkout to rebuild/reconnect as described in [Setup](setup.md#update-or-reconnect). Keep that checkout in sync with the Moggcord version you intend to run; rebuilding an old checkout can deploy an older client build.

## When installation fails

A compilation failure occurs before Discord is stopped. Installation/start failures trigger restoration of the files and settings that the connector replaced. Read the reported error before retrying; do not assume that a failed website message means the upload was enabled.

[Connector troubleshooting](../troubleshooting/community.md) · [Prepare an upload](upload-format.md)

## Source of truth

[Browser integration](../../web/community-install.js) · [Installation and detection](../../scripts/community/core.mjs) · [Job status](../../scripts/community/bridge.mjs)
