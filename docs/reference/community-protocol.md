# Community connector protocol

[Documentation](../README.md) / Reference / Community protocol

The local HTTP service binds to **`127.0.0.1:6469`**. Its service protocol is `1`; upload manifests independently use format `1` for a single file or `2` for a code-plugin folder.

## Request boundary

Every local request must come from loopback, use the exact local Host and carry the configured website Origin. Browser clients perform the necessary preflight for cross-origin POST requests. Required POST headers are:

```http
Content-Type: application/json
X-Moggcord-Install: 1
```

The service returns `Access-Control-Allow-Origin` only for the configured origin and permits GET/POST preflight. These are browser/local-service restrictions, not a replacement for the website's own account authentication.

## Endpoints

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| GET | `/v1/status` | No body | Connector identity, service protocol, channel and capabilities |
| POST | `/v1/install` | `{ "manifest": "https://…/api/install/<uuid>", "sha256": "<hash>" }` | HTTP 202 with an installation job |
| GET | `/v1/jobs/<job-id>` | No body | Current job state/message, or 404 for an unknown/expired job |
| POST | `/v1/installed` | `{ "entries": [...] }` | Read-only installation state for up to 24 entries |

Status currently advertises `name: "moggcord-community"`, `protocol: 1` and capabilities `plugin-folders`, `installed-status` and `enable-installed`. Check capabilities rather than treating every protocol-1 connector as folder-aware or able to reactivate existing uploads.

In automatic mode, `channel` reports the detected Moggcord channel, rather than `auto`. If no unique Moggcord target is available, status returns HTTP 409 with `code: "target_unavailable"` and an explanation. The connector identity remains in that response. Browser clients should display the explanation instead of launching another connector or reporting an unrelated connection failure.

Only one installation is active at a time. A repeated request for its same manifest/hash returns that active job; another package receives an error. Jobs move through `downloading`, `building` where applicable, `installing`, `restarting`, then `complete` or `failed`. A completed no-op can return `alreadyInstalled: true`.

Job history is in memory and retains up to 20 jobs. It is not a durable installation database.

## Single-file manifest

The configured website serves `/api/install/<uuid>` with `application/json`:

```json
{
  "protocol": 1,
  "id": "17677319-0fd4-4c42-a3cc-b71413be0bf5",
  "kind": "plugin",
  "name": "HelloMoggcord",
  "file_name": "hello.ts",
  "source_code": "the exact uploaded source",
  "sha256": "the SHA-256 of source_code encoded as UTF-8"
}
```

Fingerprint strings in these examples describe the field; real requests require 64 lowercase hexadecimal characters. The URL UUID and manifest ID must match. `kind` is `plugin` or `theme`; themes accept a single `.css`/`.style` file. The source limit is 10 × 1024 × 1024 bytes.

## Folder manifest

A code-plugin folder uses `protocol: 2` and adds a `files` array:

```json
{
  "protocol": 2,
  "id": "17677319-0fd4-4c42-a3cc-b71413be0bf5",
  "kind": "plugin",
  "name": "HelloMoggcord",
  "file_name": "index.tsx",
  "source_code": "the contents of index.tsx",
  "files": [
    { "path": "index.tsx", "content": "the contents of index.tsx" },
    { "path": "styles.css", "content": "the stylesheet" }
  ],
  "sha256": "the package fingerprint described below"
}
```

`source_code` must exactly match the named entry in `files`. Themes cannot use format 2. The shared validator enforces entry priority, safe relative paths, accepted text formats, case-insensitive uniqueness, file count and total UTF-8 size. See [Upload format](../community/upload-format.md).

## Package fingerprint

For format 1, hash UTF-8 `source_code`. For format 2, use the shared canonicalizer instead of reproducing its ordering rules:

```js
const { createHash } = require("node:crypto");
const MoggcordPackage = require("./web/plugin-package.js");

function folderFingerprint(files, entrypoint) {
    const canonical = MoggcordPackage.canonical(files, entrypoint);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
}
```

Run this example from the repository root. Changing any nested file changes the fingerprint. The expected install-link hash, manifest hash and computed content hash must agree.

## Installed-state payload

Each requested entry has `id`, `kind` and `file_name`, with optional `plugin_name` and `sha256`. Results include `id`, `installed` and `enabled`. When a fingerprint is requested, `current` can also be returned.

For plugins, installed means the plugin name is found in the selected compiled renderer's registry. For themes, it means the community stylesheet exists. The optional current flag is an installation comparison, not a security attestation; legacy plugin state without a stored community hash has special compatibility behavior.

The reference browser batches at most 24 entries and treats unavailable or malformed inspection as unknown. Inspection must not install content or increment website counters.

## Install links and failures

Links use `moggcord://install?manifest=<encoded-url>&sha256=<hash>`. The manifest must be on the configured origin, with no credentials/query/fragment and the exact expected path. Manifest fetching rejects redirects and has a 30-second limit.

| HTTP result | Meaning |
| --- | --- |
| 202 | Installation job accepted; poll for its actual result |
| 400 | Invalid payload, conflicting job or validation failure |
| 403 | Origin, Host or loopback boundary mismatch |
| 404 | Unknown route or job |
| 405 | Unsupported preflight method |
| 413 | Local request body exceeds its route limit |
| 415 | Missing required JSON content type or install header |

Local install requests are limited to 8 KiB; installed-state requests to 32 KiB. The manifest response has a separate transport-size allowance for JSON encoding, followed by source/package validation.

## Source of truth

[HTTP routes and jobs](../../scripts/community/bridge.mjs) · [Manifest/hash validation and detection](../../scripts/community/core.mjs) · [Canonical package format](../../web/plugin-package.js) · [Reference browser client](../../web/community-install.js)
