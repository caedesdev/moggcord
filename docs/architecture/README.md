# System architecture

[Documentation](../README.md) / Architecture

Moggcord has three related paths: a desktop installer, the client code running inside Discord, and a local service for website-driven community installation. In 1.18.46, the normal client update includes the service and Moggcord starts it automatically.

```mermaid
flowchart LR
    Release[GitHub release] --> Installer[OS-specific installer]
    Installer --> Loader[Selected Discord loader]
    Loader --> Main[Moggcord main process]
    Main --> Connector[Visitor's local service]
    Main --> Preload[Native preload bridge]
    Preload --> Renderer[Settings, APIs and plugins]
    Renderer --> Updater[Verified client updater]
    Updater --> Release
    Website[Community website] --> Connector
    Connector --> Build[Version-matched compiler and retained plugin source]
    Build --> Loader
```

The arrows show dependencies/data flow, not a shared server process. Each visitor's connector and Discord installation run on that visitor's computer.

## Components and boundaries

| Component | Runs where | Main responsibility |
| --- | --- | --- |
| Windows installer | User's Windows PC | .NET host/backend and the installer interface |
| macOS/Linux installer | User's desktop | Electron host, validated embedded build and pinned native patch helper |
| Injected main process | Selected Discord application | Host integration, settings files, native helpers, IPC and updates |
| Preload/native bridge | Discord window preload | Expose named native operations to the renderer |
| Renderer | Discord's UI process | Plugin registry/lifecycle, webpack patches, settings and styling |
| Community website | Website host and browser | Upload metadata, public manifests and download/install controls |
| Community connector | Loopback service on the user's PC | Validate, compile, activate, deploy and restart one selected channel |

## Three kinds of data

**Source** is the compiler source and community files under `src/userplugins`. **Build output** is the compiled patcher, preload, renderer, stylesheet and local service. **User data** is settings, themes and plugin data. Keeping source or settings does not guarantee that a new official build still contains a privately installed plugin.

The current [file-location reference](../reference/file-locations.md) distinguishes these directories. A settings backup is not a source backup. The local service runs separately from Discord so it can complete an installation that restarts the selected client.

## Verification boundaries

Build metadata records the desktop version and five file fingerprints. Installers/update operations verify that metadata. The community path separately checks package identity, allowed paths/imports and a content fingerprint before deployment. A version-matched compiler package is downloaded only when a code plugin needs compilation.

These checks detect mismatches and incomplete packages. They do not prove that a third-party plugin is safe or compatible with every Discord build. See [Trust and privacy](../guides/trust-and-privacy.md).

## Follow a flow

- [Client startup and updates](client-lifecycle.md): from Discord's loader to running plugin code and a verified update.
- [Community installation](community-installation.md): from a website click to local compilation, deployment and rollback.
- [Project layout](../developers/project-layout.md): source locations for each component.
