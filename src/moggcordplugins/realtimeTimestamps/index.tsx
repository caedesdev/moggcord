/*
 * Nightcord, a Discord client mod
 * Copyright (c) 2025 Nightcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment } from "@webpack/common";

const settings = definePluginSettings({
    format: {
        type: OptionType.SELECT,
        description: "Seconds format displayed on every message timestamp",
        default: "HH:mm:ss",
        options: [
            { label: "15:34:21  (24h)", value: "HH:mm:ss", default: true },
            { label: "3:34:21 PM  (12h)", value: "h:mm:ss A" },
        ],
    },
    showInTooltip: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in the hover tooltip",
        default: true,
    },
    showInCompact: {
        type: OptionType.BOOLEAN,
        description: "Show seconds in compact mode",
        default: true,
    },
});

type TimestampType = "cozy" | "compact" | "tooltip";

function formatTimestamp(date: Date, type: TimestampType): string {
    const fmt = settings.store.format ?? "HH:mm:ss";

    switch (type) {
        case "cozy":
            return moment(date).format(fmt);
        case "compact":
            return settings.store.showInCompact
                ? moment(date).format(fmt)
                : moment(date).format("LT");
        case "tooltip":
            return settings.store.showInTooltip
                ? moment(date).format(`dddd, MMMM D, YYYY [at] ${fmt}`)
                : moment(date).format("LLLL");
    }
}

export default definePlugin({
    name: "RealtimeTimestamps",
    description: "Shows seconds on message timestamps (e.g. 15:34:21). Updates when messages re-render; live ticking is disabled to avoid renderer freezes in busy channels.",
    tags: ["Appearance", "Chat", "Utility"],
    authors: [{ name: "Moggcord", id: 253979869n }],
    enabledByDefault: true,
    settings,

    /** Must return a string — Discord calls .match() on the useMemo result. */
    renderTimestamp(date: Date, type: TimestampType): string {
        return formatTimestamp(date, type);
    },

    patches: [
        {
            find: "#{intl::MESSAGE_EDITED_TIMESTAMP_A11Y_LABEL}",
            replacement: [
                {
                    match: /(\i\.useMemo\(.{0,50}"LT".{0,30}\]\))/,
                    replace: "$self.renderTimestamp(arguments[0].timestamp,'compact')",
                },
                {
                    match: /(\i\.useMemo\(.{0,10}\i\.\i\)\(.{0,10}\]\))/,
                    replace: "$self.renderTimestamp(arguments[0].timestamp,'cozy')",
                },
                {
                    match: /(__unsupportedReactNodeAsText:).{0,25}"LLLL"\)/,
                    replace: "$1$self.renderTimestamp(arguments[0].timestamp,'tooltip')",
                },
            ],
        },
        {
            find: /.full,.{0,15}children:/,
            replacement: {
                match: /(__unsupportedReactNodeAsText:)\i\.full/,
                replace: "$1$self.renderTimestamp(new Date(arguments[0].node.timestamp * 1000),'tooltip')",
            },
        },
    ],
});
