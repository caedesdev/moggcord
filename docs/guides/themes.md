# Themes and QuickCSS

[Documentation](../README.md) / Guides / Themes

Moggcord supports local theme files, online theme links and personal QuickCSS. A theme changes styling; it does not install a code plugin.

## Install a local theme

1. Open **Moggcord Settings → Themes**.
2. Choose **Open Themes Folder**.
3. Put the theme's CSS file in that directory. Use a descriptive `.theme.css` filename.
4. Return to **Local Themes**, refresh if needed, and enable it.

Use the folder opened by the client when you have a custom data directory. Default locations are listed in [File locations](../reference/file-locations.md).

## Use an online theme

The Themes page also supports online links. Use a URL that serves the actual stylesheet rather than a repository's HTML file viewer. Online themes depend on that source remaining available and can change independently of Moggcord.

If a theme imports fonts, images or other stylesheets, those are additional network requests. A content-security restriction or unavailable asset can prevent part of the theme from loading.

## Make a small change with QuickCSS

Choose **Edit QuickCSS** from Moggcord's quick actions. Keep small personal overrides here so you can enable or disable them separately from a full theme. QuickCSS is stored in the settings directory and can be exported with **Backup & Restore**.

For larger work, keep a separate stylesheet and version it. Discord's internal class names change; styling based on a temporary generated class can stop matching after a Discord update.

## Install a community theme

A connected website's **Download** button installs one stylesheet on your computer, enables it and restarts the selected channel. It needs the [community connector](../community/setup.md).

Community themes accept a single `.css` or `.style` file. The connector writes it as `community-<upload-id>.theme.css`. A CSS-only upload in User Plugins also follows the stylesheet path. A folder-based code plugin that imports `styles.css` follows the plugin compilation path instead.

## Recover from broken styling

Disable the most recently enabled theme first. If the issue remains, temporarily disable other themes and QuickCSS to identify whether styling is involved. Re-enable them individually after the normal interface is visible.

Repairing Moggcord preserves saved theme settings, so Repair alone may leave a conflicting stylesheet enabled. See [Client and plugin troubleshooting](../troubleshooting/client-and-plugins.md).

## Source of truth

[Themes interface](../../src/components/ThemeSettings/ThemesTab.tsx) · [Theme application](../../src/api/Themes.ts) · [Community stylesheet installation](../../scripts/community/core.mjs)
