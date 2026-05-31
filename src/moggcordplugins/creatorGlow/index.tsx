/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Settings } from "@api/Settings";
import IrcColorsPlugin from "@plugins/ircColors";
import RoleColorEverywhere from "@plugins/roleColorEverywhere";
import definePlugin from "@utils/types";

import {
    CREATOR_GOLD,
    getCreatorColorString,
    getCreatorGlowStyle,
    isMoggcordCreator,
} from "./colors";

import style from "./style.css?managed";

export { getCreatorColorInt, getCreatorColorString, getCreatorGlowStyle, isMoggcordCreator } from "./colors";

export default definePlugin({
    name: "CreatorGlow",
    description: "Golden glowing names for Moggcord Creator badge holders — overrides role colors for creators only.",
    authors: [{ name: "Moggcord", id: 0n }],
    tags: ["Appearance", "Badges"],
    enabledByDefault: true,
    managedStyle: style,

    patches: [
        {
            find: "#{intl::GUILD_OWNER}),children:",
            replacement: [
                {
                    match: /(?<=roleName:\i,)colorString:[^,]+/,
                    replace: "colorString:$self.getMemberListColor(arguments[0]),",
                },
                {
                    match: /lostPermissionTooltipText:(\i)/,
                    replace: "lostPermissionTooltipText:$1,\"data-moggcord-creator\":$self.isCreator(arguments[0]?.user?.id),",
                },
            ],
        },
        {
            find: "#{intl::GUEST_NAME_SUFFIX})]",
            replacement: {
                match: /#{intl::GUEST_NAME_SUFFIX}.{0,50}?"".{0,100}\](?=\}\))(?<=guildId:(\i),.+?user:(\i).+?)/,
                replace: "$&,\"data-moggcord-creator\":$self.isCreator($2.id),",
            },
        },
        {
            find: ",connectUserDragSource:",
            replacement: {
                match: /(?<=user:(\i),channel:(\i).{0,200}?)(?=nick:)/,
                replace: "\"data-moggcord-creator\":$self.isCreator($1.id),",
            },
        },
    ],

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
