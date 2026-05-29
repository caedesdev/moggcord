/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Resolved to a base64 string at build time by fileUrlPlugin, so the binary
// never lives in the source tree. Imported in a single place and reused by
// both the splash window overlay and the in-app loading screen overlay.
import splashImageBase64 from "file://moggcordSplash.png?base64";

export const MOGGCORD_AVATAR_DATA_URL = `data:image/png;base64,${splashImageBase64}`;
