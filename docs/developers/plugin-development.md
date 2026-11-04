# Write a community plugin

[Documentation](../README.md) / Developers / Plugin development

Start in a separate [development checkout](setup.md). A plugin is compiled with Moggcord; dropping a TypeScript file into Discord's resources does not make it executable.

## Minimal starter

Create `src/userplugins/helloMoggcord/index.ts`:

```ts
import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { OptionType } from "@utils/types";

const logger = new Logger("HelloMoggcord");
const settings = definePluginSettings({
    greetOnStart: {
        type: OptionType.BOOLEAN,
        description: "Write a greeting to the local log.",
        default: true
    }
});

export default definePlugin({
    name: "HelloMoggcord",
    description: "Demonstrates a small plugin with one setting.",
    authors: [{ name: "Your name", id: 0n }],
    settings,
    start() {
        if (settings.store.greetOnStart) logger.info("Hello from Moggcord.");
    },
    stop() {
        logger.info("HelloMoggcord stopped.");
    }
});
```

Replace the author placeholder with your name and public Discord user ID. The starter logs locally and does not send a message, make an account request or automate a Discord action. Use a unique plugin name; keep `name` first if the source will be uploaded through the current community parser.

## Build and test locally

```sh
pnpm buildStandalone
node scripts/build/verify-release.mjs
```

These commands compile and verify the build without injecting it. To inspect behavior in a client, use a deliberately selected development installation. Test startup, disable/re-enable, a complete restart and cleanup. A successful build proves syntax/import compatibility, not correct behavior in every Discord build.

## Settings and lifecycle

Use `definePluginSettings` for settings and `Logger` for diagnostics. Register listeners/resources in the appropriate lifecycle and remove them in `stop()`. Clear timers and subscriptions so disabling/reloading the plugin does not leave duplicate behavior.

Use existing API extension points before adding webpack patches. Import Discord types from `@vencord/discord-types`, obtain supported stores/components from `@webpack/common`, and use the repository's utilities rather than hardcoding transient Discord symbols or CDN/API paths.

For React UI, use existing components and hooks. Use `classNameFactory` from `@utils/css` and `classes` for combined class names. Do not introduce raw DOM manipulation as a shortcut for a client UI extension.

## Multiple files and styles

```text
helloMoggcord/
├── index.tsx
├── styles.css
├── components/
│   └── Panel.tsx
└── utils/
    └── format.ts
```

Import local files relatively, for example `./styles.css` or `./components/Panel`. Native helpers are supported by the build system but have different privileges and portability requirements; inspect existing helpers and IPC before adding one.

The community connector accepts a narrower import surface than an arbitrary local checkout. Do not rely on installed npm packages or private plugin aliases that the [upload validator](../community/upload-format.md#imports) rejects.

## Publish a complete package

Choose the complete plugin folder so every relative import is included. Keep documentation and license notices, omit dependencies/build output, and test the selected files as a standalone package. Code packages have a 10 MB total source limit and 256-file limit.

Do not mark an optional community plugin as required to force activation. The [bundle policy](../../scripts/lib/plugin-bundle.mjs) controls defaults for the standard distribution; the connector enables a deliberately installed community plugin by its declared name.

Before contributing built-in code, read [CONTRIBUTING](../../.github/CONTRIBUTING.md) and the [repository rules](../../AGENTS.md).

## Source of truth

[Plugin definition types](../../src/utils/types.ts) · [Settings API](../../src/api/Settings.ts) · [Plugin manager](../../src/api/PluginManager.ts) · [UI APIs](../../src/api/index.ts) · [Upload validation](../../scripts/community/core.mjs)
