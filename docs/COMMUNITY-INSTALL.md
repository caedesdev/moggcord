# Install community uploads in Moggcord

The website can install a selected plugin or theme, enable it, and restart the Discord channel you chose. This connection runs on each user's own Windows PC. The website server never writes into its own filesystem to pretend a visitor's client was updated.

## One-time setup

Install Moggcord in your chosen Discord channel first. The connector checks the actual Moggcord loader and refuses a channel that uses Vencord or unmodified Discord. Stable, Canary, PTB, and Development are separate targets.

Requirements: Windows, Node.js 24, Git, and pnpm 10. Keep this checkout in place after setup; it supplies the plugin compiler. Use a separate checkout if your usual checkout has personal changes.

```powershell
git clone https://github.com/caedesdev/moggcord.git moggcord-community
cd moggcord-community
pnpm install --frozen-lockfile
pnpm community:setup --channel canary --site https://YOUR-MOGGCORD-WEBSITE.example
```

Replace the website address with the actual Moggcord community website. Only connect a website you trust to install plugins in your client. For a website you run on this PC, use `--site http://127.0.0.1:4173` instead. That localhost address is only reachable on your own computer.

Use `--channel stable`, `--channel ptb`, or `--channel development` for another channel. For a custom Moggcord settings directory, also pass `--data-dir "C:\path\to\MoggcordData"`.

Setup builds this checkout, repairs Moggcord in the chosen channel, and restarts that channel once. This installs the corrected internal version and removes the Hub. It then registers the `moggcord://` link handler and a per-user startup entry. It needs no administrator account. It records the selected website, checkout, channel, and settings directory in `%APPDATA%\MoggcordCommunity\config.json`. Your current Moggcord settings are preserved.

The connector starts immediately and on Windows sign-in. You can also start it manually from the checkout:

```powershell
pnpm community:start
```

Allow the browser's local-network permission for your connected website if it asks ([Chrome's explanation](https://developer.chrome.com/blog/local-network-access)). Refreshing the website does not require signing out. `localhost` and `127.0.0.1` are different website addresses; use the exact address you connected.

## Download and share

Click **Download** on a plugin or theme, including uploads on another member's profile. The connector downloads the selected source from that website, verifies its file fingerprint, installs and enables it, then restarts only your chosen Discord channel. The website waits for confirmation before showing success.

If the connector is unavailable, the website saves the ordinary source file and shows setup help. **Open in Moggcord** can launch the registered connector. **Copy install link** produces a shareable `moggcord://install?manifest=…&sha256=…` link. Recipients need Moggcord and the one-time setup connected to the same website. Links refer to the exact file fingerprint, so changed or deleted uploads do not silently install a replacement.

Themes accept one `.css` or `.style` file. A `.style` file is installed under a `.theme.css` filename so Moggcord can load it. CSS-only uploads in User Plugins also install as stylesheets.

In **User Plugins**, choose **Choose files** for individual files or **Choose folder** for a complete plugin, including nested `components`, `utils` and stylesheet files. Folder selection preserves relative paths and removes only the outer folder name. `.git` and `node_modules` are omitted. The total limit is **10 MB and 256 files**. Supported files are JavaScript, TypeScript, CSS, JSON, SVG and text documentation; executables are rejected. Themes still accept exactly one stylesheet.

The main file must export a normal Moggcord `definePlugin({ name: "PluginName", … })` definition with the name first. `index.ts` or `index.tsx` is selected automatically. If neither exists, select the main JavaScript or TypeScript file. Its original filename and relative imports are preserved. The name must not clash with another currently bundled or community plugin; optional plugins excluded from the standard bundle can be added through the website.

Imports can use files inside the uploaded folder and Moggcord's `@api`, `@utils`, `@components`, `@webpack` and `@shared` modules, plus its Discord types. Native helpers can use Node built-ins. Missing files, imports escaping the folder and unsupported external packages are rejected before Discord is closed. Without an updated connector, a complete plugin is downloaded as a ZIP preserving its folder structure; single-file downloads keep their original format.

Code plugins are built before the current client is stopped or replaced. A build failure leaves the existing installation running. Replaced files and settings are restored if installation or restarting fails. The connector does not execute uploaded code while downloading or compiling it; installed code runs in your Discord client when enabled, like other Moggcord plugins.

Community plugins are kept in `src/userplugins/community-<upload-id>` in this checkout. After an official Moggcord update, rebuild from this checkout to include them again. To update the connector itself, stop its Node process, update this separate checkout, run `pnpm install --frozen-lockfile`, and start it again. Do not overwrite a checkout containing personal changes.

## Website integration

The reference browser integration is in [`web/community-install.js`](../web/community-install.js). Load [`web/plugin-package.js`](../web/plugin-package.js) first, then the integration before your download handlers. Allow `http://127.0.0.1:6469` in the website's `connect-src` policy. The download response adds `install_manifest: "/api/install/<uuid>"` and a SHA-256 fingerprint. Call `moggcordInstaller.install(response, onProgress)`; a `false` result means use `moggcordInstaller.download(response)` as the fallback. A rejected promise is an installation failure, not a successful install. The connector advertises the `plugin-folders` capability so an older connector cannot report a folder installation as successful.

The public `GET /api/install/<uuid>` endpoint returns:

```json
{
  "protocol": 1,
  "id": "17677319-0fd4-4c42-a3cc-b71413be0bf5",
  "kind": "plugin",
  "name": "Example",
  "file_name": "example.ts",
  "source_code": "the exact uploaded source",
  "sha256": "SHA-256 of the UTF-8 source as 64 lowercase hexadecimal characters"
}
```

Folder manifests use `protocol: 2` and add `files: [{"path":"index.tsx","content":"..."}, {"path":"components/card.tsx","content":"..."}]`. `file_name` identifies the main file and `source_code` matches its contents. Hash the UTF-8 result of `MoggcordPackage.canonical(files, file_name)` instead of the main source alone. The shared validator sorts paths, rejects duplicate Windows filenames, traversal, reserved names and executables, and enforces the total size. Changing any nested file invalidates the install link. Single-file protocol 1 remains supported.

Fetching a manifest must not increment the site's download counter. The connector accepts only the configured HTTPS origin (HTTP loopback is allowed for development), that exact endpoint shape, and a matching UUID and package fingerprint. Redirects to other servers are refused. Its local HTTP endpoint binds only to `127.0.0.1:6469`, checks Host and Origin, and requires a JSON request with a custom header. It exposes no arbitrary command, process ID, filesystem path, or download URL parameter.

## Repeated update banner

The published `1.18.24` `desktop.asar` contains code compiled as `1.18.23`. Installing it repeatedly cannot resolve the version comparison. Rebuilding the current source gives it the correct internal version.

Builds now contain `build-info.json` with their version and fingerprints for the patcher, preload, renderer, and stylesheet. The updater verifies the release tag against that information before replacing the active loader directory and its fallback copy. It resets its update cache only after a verified installation. Releases with missing or mismatched build information are rejected instead of being reported as installed.

```powershell
pnpm buildStandalone
node scripts/build/verify-release.mjs
pnpm test:community
```

The installer packaging step also regenerates its embedded archive from the verified current build, preventing reuse of an older zip. Release 1.18.25 packages the corrected desktop files in the installer and update archive. The installer can validate its embedded version and file fingerprints without installing or restarting Discord with `Moggcord-Installer.exe --verify-bundle --report verification.json`. The community website connector still uses the one-time setup above. This release also removes the Moggcord Hub and its automatic onboarding page; the updater's release link opens GitHub.

## Remove the connector

Stop the Node process whose command line ends in `scripts\community\bridge.mjs`. Remove only this connector's startup entry and URL handler:

```powershell
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v MoggcordCommunity /f
reg delete "HKCU\Software\Classes\moggcord" /f
```

This leaves installed themes, plugins, and your Moggcord account settings in place.
