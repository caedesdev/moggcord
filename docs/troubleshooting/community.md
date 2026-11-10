# Fix community connection and upload problems

[Documentation](../README.md) / Troubleshooting / Community

## The website cannot connect

Check all of these against the [setup guide](../community/setup.md):

1. The connector is installed and running on the same computer as the browser.
2. Its selected Discord channel has Moggcord, not a different loader.
3. The configured website origin exactly matches the page's scheme, host and port.
4. The browser permits this website's local-network access and opening its registered Moggcord link.
5. The retained checkout and recorded Node executable still exist.

An origin configured as `http://127.0.0.1:4173` does not authorize a public domain or `http://localhost:4173`. Re-run setup deliberately for the new origin. Opening `/v1/status` directly in the address bar omits the expected Origin header and can correctly return an error.

If port 6469 is occupied, identify which connector is running before starting another. One configuration serves one selected channel/origin; a server-side connector cannot install into all visitors' PCs.

## A plugin folder fails validation or compilation

Read the first missing import, unsupported module or syntax error. Upload the complete folder, including nested components, utilities and `styles.css`. `index.ts`/`index.tsx` takes entry priority. The plugin definition must declare its unique `name` first.

Do not upload `node_modules`, executable files or a repository ZIP instead of the actual source selection. Arbitrary npm dependencies are not installed by the connector. See [Upload format](../community/upload-format.md).

Compilation happens before Discord is stopped. If a build fails, the current client should remain running; keep that distinction in your report.

## The upload changed or the link stopped working

An install link identifies an exact fingerprint. Changing any nested file invalidates it. Get a fresh link from the current upload; do not remove hash validation to make an old link work. Deleted/unavailable manifests can also invalidate old links.

## Installed state does not match what I expect

Check which channel the connector inspects and whether it advertises `installed-status`. A disabled plugin can be installed. A source file or settings entry can exist without the compiled plugin being registered. An unavailable connector leaves the result unknown.

After an official update, rebuild community code from the correct retained checkout if necessary. See [Downloads and sharing](../community/installing-and-sharing.md).

## The browser saved a file but nothing appeared in Discord

**Download ZIP** is a manual browser download. The website also offers it if automatic installation fails. It does not install or activate code. Use the connector-backed **Download** action for automatic installation after setup. A source ZIP needs to be extracted and compiled before it can be used as a plugin.

## The site reports failure after restarting

Keep the exact connector job message. A file-write or restart failure triggers restoration of replaced files/settings. Do not assume a success merely because Discord opened. Report the upload type, entry filename, channel, connector checkout version and the stage that failed.

[Protocol reference](../reference/community-protocol.md) · [Report a bug](reporting-bugs.md)
