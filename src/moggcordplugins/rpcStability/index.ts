/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";

/** Stops Discord's RPC IPC server — prevents connection-limit crash loops with multi-account. */
export default definePlugin({
    name: "RpcStability",
    enabledByDefault: true,
    description: "Disables Discord's RPC IPC server to prevent connection-limit crashes and console spam.",
    authors: [{ name: "Moggcord", id: 0n }],
    tags: ["Fix", "Privacy"],

    patches: [
        {
            find: '.ensureModule("discord_rpc")',
            replacement: {
                match: /\.ensureModule\("discord_rpc"\)\.then\(\(.+?\)}\)}/,
                replace: '.ensureModule("discord_rpc")}',
            },
        },
    ],
});
