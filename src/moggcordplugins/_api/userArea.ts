/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { UserAreaRenderProps } from "@api/UserArea";
import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export default definePlugin({
    name: "UserAreaAPI",
    description: "API to add buttons to the user area panel.",
    authors: [Devs.prism],

    patches: [
        {
            find: "handleOpenSettingsContextMenu",
            replacement: {
                // fix discord weird shrink with extra buttons
                match: /(className:\i\.\i,style:)(\i)(,children:\[)(?=.{0,400}?iconForeground:([^,}]+))/,
                replace: "$1{...$2,minWidth:0}$3...$self.renderButtons(arguments[0],$4),"
            }
        }
    ],

    renderButtons(props: UserAreaRenderProps, iconForeground?: string) {
        return Vencord.Api?.UserArea?._renderButtons?.({
            nameplate: props.nameplate,
            iconForeground,
            hideTooltips: false
        });
    }
});
