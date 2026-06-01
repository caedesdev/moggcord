/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { installAccountTokenHook, mergeTokensBeforeEncrypt, primeMiTokenCache } from "@shared/accountTokenHook";
import definePlugin from "@utils/types";
import { onceReady } from "@webpack";

export default definePlugin({
    name: "AccountTokenBridge",
    enabledByDefault: true,
    description: "Keeps TokenImporter and MultiInstance tokens in sync with Discord's token store.",
    authors: [{ name: "Moggcord", id: 0n }],

    mergeTokensBeforeEncrypt,

    start() {
        onceReady.then(() => {
            void primeMiTokenCache();
            if (!installAccountTokenHook()) {
                console.warn("[AccountTokenBridge] Runtime hook skipped — module not ready.");
            }
        });
    },
});
