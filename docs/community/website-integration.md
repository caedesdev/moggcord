# Integrate a community website

[Documentation](../README.md) / Community / Website integration

This repository provides reference browser scripts and the local desktop connector. It does not contain a complete hosted community database, account system or production website deployment.

## Browser assets

Serve copies of these files with your website, preserving their order:

1. [`web/plugin-package.js`](../../web/plugin-package.js), which exposes `MoggcordPackage`.
2. [`web/community-install.js`](../../web/community-install.js), which exposes `moggcordInstaller`.

Your Content Security Policy must permit the connector at `http://127.0.0.1:6469` in `connect-src`. Keep other policy restrictions appropriate to your website. The visitor must have connected this exact website origin and may need to allow the browser's local-network permission.

## Backend contract

Your upload/download response supplies at least:

```json
{
  "install_manifest": "/api/install/17677319-0fd4-4c42-a3cc-b71413be0bf5",
  "sha256": "64 lowercase hexadecimal characters for the package fingerprint"
}
```

The string above describes the fingerprint field; replace it with a real hash. The public manifest endpoint must return the exact accepted source package, identity and fingerprint. The [protocol reference](../reference/community-protocol.md) documents both manifest formats.

Fetching a manifest or checking Installed state must not increment a download counter. Keep counter policy in your backend; distinguish a completed installation, a manual file download and a read-only status request.

## Start installation from a user action

Call the reference integration from the clicked Download action, using your own progress/error UI:

```js
async function installUpload(upload, onProgress) {
    const result = await window.moggcordInstaller.install(upload, onProgress);
    return result === "already-installed" ? "Already installed" : "Installed and restarted";
}
```

`true` means the connector reported installation and restart. `"already-installed"` means no compilation, write or restart was needed. Handle a rejected promise in your error UI; it must not be displayed as successful installation.

Use `moggcordInstaller.connectionHelp(...)` for setup help. Keep `moggcordInstaller.download(upload)` behind a separate **Download file** action. Do not automatically save source files when connection or installation fails.

## Display Installed state

The reference integration's `inspect`/`watchButtons` functions use the connector's `installed-status` capability. Unavailable inspection returns unknown rather than a false success. Folder installation requires the `plugin-folders` capability; an older connector should produce an update instruction.

Use both `installed` and `enabled`: an installed but disabled upload needs an **Enable** action, not a disabled **Installed** button. `watchButtons` refreshes every five seconds while visible and when the page regains focus or visibility. Call its cleanup function before replacing cards. After an installation attempt, only keep a button disabled when `button.dataset.installationState === "installed"`; a failed activation must remain retryable.

Keep upload IDs, kinds, filenames and plugin names consistent between public entries, manifests and status requests. Do not send private filesystem paths to the website or assume every upload present on the server is installed on a visitor's machine.

## Deployment boundary

A public website needs its own reachable backend, database and storage. A localhost website works only on the computer hosting it. Public deployment also changes the origin: visitors must connect the public origin, not the development address.

The connector is a per-user local service. It should remain bound to loopback; exposing port 6469 on a VPS does not provide automatic installation on visitors' PCs.

## Source of truth

[Browser integration and exported helpers](../../web/community-install.js) · [Local HTTP service](../../scripts/community/bridge.mjs) · [Manifest and source validation](../../scripts/community/core.mjs)
