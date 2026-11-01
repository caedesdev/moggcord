# Prepare a plugin or theme upload

[Documentation](../README.md) / Community / Upload format

Upload the files needed to build the plugin, not an executable or a screenshot of its source. Website accounts, publishing permissions and banner/media storage belong to the website backend; this guide describes the package accepted by the connector.

## Choose files or choose a folder

Use **Choose files** for a single-file plugin or a deliberately selected set. Use **Choose folder** when the plugin imports local components, utilities or stylesheets.

For example:

```text
HelloMoggcord/
├── index.tsx
├── styles.css
├── components/
│   └── Preview.tsx
├── utils/
│   └── format.ts
└── README.md
```

The outer `HelloMoggcord` folder name is removed; paths inside it remain relative. Uploading only `index.tsx` while omitting `components/` will fail if those files are imported.

## Entry point and identity

- Use a root `index.ts` or `index.tsx` where possible. The package validator gives these files priority.
- Otherwise identify the main JavaScript/TypeScript file; the connector preserves its filename and creates an index wrapper for compilation.
- The entry point must export `definePlugin({ name: "HelloMoggcord", ... })` with **name first** in the object, as the current upload parser expects.
- Use a unique plugin name: 1–80 ASCII characters, beginning with a letter or number, followed by letters, numbers, spaces, dots, underscores or hyphens. Reserved object names are rejected.

The website title and the plugin's `name` are different fields. Name collisions with an existing compiled or community plugin are rejected rather than replacing it silently. Start from the [plugin development example](../developers/plugin-development.md).

## Accepted contents and limits

| Item | Limit or rule |
| --- | --- |
| Total source size | 10 × 1024 × 1024 bytes, measured as UTF-8 content |
| File count | Up to 256 |
| Source | `.js`, `.jsx`, `.ts`, `.tsx` |
| Supporting text | `.css`, `.json`, `.svg`, `.md`, `.txt`, and recognized license/notice filenames |
| Paths | Relative, forward-slash-separated paths; no traversal, absolute paths, reserved device names or case-insensitive duplicates |
| Dependencies | Do not upload `node_modules` or `.git`; these are not accepted package paths |
| Executables/binary assets | Not part of the accepted plugin source package |

Banner photos/videos are separate website media, not plugin package files. A website may impose additional validation on top of this shared package contract.

## Imports

Local imports must resolve within the upload. Include imported stylesheets, JSON and text assets as needed. The connector rejects missing files, escaping paths and non-literal dynamic module names.

Supported Moggcord import prefixes are `@api`, `@utils`, `@components`, `@webpack` and `@shared`, plus `@vencord/discord-types`. Native helpers may use Node built-ins. Arbitrary npm imports are not installed by the upload process. Do not import an internal bundled plugin directly through a private alias and expect the package to compile.

## Theme uploads

A community theme contains exactly **one `.css` or `.style` file**. It is installed as a stylesheet, not compiled as a code plugin. CSS-only single-file uploads in User Plugins also follow this path.

A code plugin may include and import `styles.css` alongside its code. That is a complete plugin package, not a multi-file theme upload.

## Before publishing

Build the plugin in an isolated source checkout, check enable/disable and restart behavior, and include every relative import. Keep your license notices and attribution. Test from the uploaded files themselves so an unuploaded local dependency cannot hide a packaging problem.

[Website integration](website-integration.md) · [Protocol and fingerprints](../reference/community-protocol.md)

## Source of truth

[Shared package validator](../../web/plugin-package.js) · [Source/import validation](../../scripts/community/core.mjs) · [Folder installation checks](../../scripts/tests/community.test.mjs)
