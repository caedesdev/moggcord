# Download, install and share community uploads

[Documentation](../README.md) / Community / Downloads and sharing

## Automatic installation

With Moggcord 1.18.46, start the updated client and choose **Download** on a plugin or theme. Allow access to local apps and services when the browser asks. Moggcord includes and starts the local service, so normal moggcord.cc downloads require no separate setup page or terminal commands. The same flow can be used from an author's profile. Other website origins use [advanced manual setup](setup.md).

1. The website connects to the connector on the visitor's computer.
   If several Discord installations contain Moggcord, choose **Discord**, **Discord Canary**, **Discord PTB** or **Discord Development** in the website dialog. Only detected targets appear. Confirm **Install**, choose **Download ZIP instead**, or close the dialog to cancel.
2. The connector downloads the upload manifest and checks its identity and file fingerprint.
3. A code plugin is validated and compiled when necessary. The version-matched compiler is prepared only if a build is needed. A stylesheet uses the theme installation path.
4. The selected Discord channel closes; the compiled files or stylesheet are installed and enabled.
5. That channel restarts, and the website receives the installation result.

The website should show success only after the connector confirms completion. An upload is installed on the computer running that browser/connector, not on the uploader's PC or the web server.

If the connector is not running, the browser integration tries the registered `moggcord://` link. The browser can ask permission to open it. If automatic installation fails, the website downloads a ZIP for manual use and reports why. Cancelling the Discord selection does not download anything. Older connectors without channel selection need a Moggcord update; they can still use the ZIP fallback.

## Automatic installation versus ZIP download

| Action | Result |
| --- | --- |
| **Download** | Request automatic installation through the local connector |
| **Download ZIP** | Save the upload with every file and relative subfolder for manual use |
| **Open in Moggcord** | Open the registered connector link |
| **Copy install link** | Copy a link tied to that upload's manifest and fingerprint |

A ZIP download does not compile or enable the upload and does not restart Discord. Extract the archive before following the plugin's build instructions. Single-file plugins and themes are also packaged as ZIPs.

## Installed detection

When supported by the connector, the site checks the selected local client when a library/profile opens, when the window regains focus or becomes visible, and every five seconds while the page is visible. It reads registered plugin names in the compiled renderer or the connector's theme directory. A leftover settings key or previous download is not sufficient.

A disabled plugin can still be installed. An unavailable connection means **unknown**, not proof that the plugin is absent. The inspection does not modify files, increment download totals or restart Discord.

An installed and enabled upload shows **Installed**. An installed but disabled upload shows **Enable**; a missing upload shows **Download**. Enabling an unchanged plugin updates its settings and restarts the selected client without rebuilding or replacing its compiled code. A failed activation restores the previous settings. Unchanged enabled uploads do not cause another restart.

When several clients are detected, this state belongs to the last client chosen on the page. The **Installed** button remains clickable so you can choose a different client. Before any choice, the site leaves installation state unknown instead of assuming it applies to every Discord installation.

Reinstalling identical content already present in the selected installation skips compilation, file writes and restart. A changed package can still require installation even when its plugin name exists.

## Share a link

Use **Copy install link**. The recipient needs the updated Moggcord and permission for the same website to contact its local service. The managed service connects to moggcord.cc; another origin requires advanced manual configuration. Installation happens on the recipient's own machine.

Install links contain the manifest URL and a SHA-256 fingerprint. They identify the exact package version. Editing a nested plugin file changes the package fingerprint; an old link must not silently install the changed upload. Deleted uploads can make old links unavailable.

## After an official update

Community source is retained under `src/userplugins/community-<upload-id>` in the managed compiler source or advanced manual checkout. Official client releases replace compiled desktop code and do not bundle every user's private community source.

If a community plugin disappears after updating, choose **Download** again. The managed service uses the compiler matching the running Moggcord version and preserves retained community source. Advanced manual users should follow [Update or reconnect](setup.md#update-or-reconnect), keeping the checkout in sync with the intended client version.

## When installation fails

A compilation failure occurs before Discord is stopped. Installation/start failures trigger restoration of the files and settings that the connector replaced. Read the reported error before retrying; do not assume that a failed website message means the upload was enabled.

[Connector troubleshooting](../troubleshooting/community.md) · [Prepare an upload](upload-format.md)

## Source of truth

[Browser integration](../../web/community-install.js) · [Installation and detection](../../scripts/community/core.mjs) · [Job status](../../scripts/community/bridge.mjs)
