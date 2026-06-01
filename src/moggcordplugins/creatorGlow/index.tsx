/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import IrcColorsPlugin from "@plugins/ircColors";
import RoleColorEverywhere from "@plugins/roleColorEverywhere";
import definePlugin from "@utils/types";

import {
    getCreatorColorString,
    getCreatorGlowStyle,
    isMoggcordCreator,
} from "./colors";

import style from "./style.css?managed";

export { getCreatorColorInt, getCreatorColorString, getCreatorGlowStyle, isMoggcordCreator } from "./colors";

export default definePlugin({
    name: "CreatorGlow",
    description: "Golden glowing names for Moggcord Creator badge holders. Member-list webpack patches are disabled on Discord Stable until updated.",
    authors: [{ name: "Moggcord", id: 0n }],
    tags: ["Appearance", "Badges"],
    enabledByDefault: false,
    managedStyle: style,

    isCreator(userId?: string | null) {
        return isMoggcordCreator(userId);
    },

    getMemberListColor(context: { user?: { id: string; }; guildId?: string; colorString?: string; originalColor?: string; }) {
        const userId = context?.user?.id;
        const creatorColor = getCreatorColorString(userId);
        if (creatorColor) return creatorColor;

        if (Settings.plugins.IrcColors?.enabled) {
            return IrcColorsPlugin.calculateNameColorForListContext(context);
        }

        if (Settings.plugins.RoleColorEverywhere?.enabled && userId && context?.guildId) {
            return RoleColorEverywhere.getColorString(userId, context.guildId)
                ?? context?.originalColor
                ?? context?.colorString;
        }

        return context?.originalColor ?? context?.colorString;
    },

    getVoiceStyle(userId?: string | null) {
        return getCreatorGlowStyle(userId);
    },
});
