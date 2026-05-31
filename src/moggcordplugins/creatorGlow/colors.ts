/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { userHasMoggcordCreatorBadge } from "@plugins/_api/badges/moggcordBadgesApi";

export const CREATOR_GOLD = "#ffcb05";

export function isMoggcordCreator(userId?: string | null): boolean {
    return userHasMoggcordCreatorBadge(userId);
}

export function getCreatorColorString(userId?: string | null): string | null {
    return isMoggcordCreator(userId) ? CREATOR_GOLD : null;
}

export function getCreatorColorInt(userId?: string | null): number | null {
    const color = getCreatorColorString(userId);
    return color ? parseInt(color.slice(1), 16) : null;
}

export function getCreatorGlowStyle(userId?: string | null): Record<string, string | number> | undefined {
    if (!isMoggcordCreator(userId)) return undefined;

    return {
        color: CREATOR_GOLD,
        WebkitTextFillColor: CREATOR_GOLD,
        fontWeight: 600,
        textShadow: "0 0 8px rgba(255,203,5,.9), 0 0 16px rgba(255,180,0,.55)",
        animation: "moggcord-creator-glow-pulse 2.8s ease-in-out infinite",
    };
}
