/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Devs } from "@utils/constants";
import definePlugin from "@utils/types";

export const ProfileCollections = {
    renderProfileCollections(_props: unknown) {
        return null;
    }
};

export default definePlugin({
    name: "ProfileCollectionsAPI",
    description: "API to add collections to the user profile panel like discords game collection.",
    authors: [Devs.thororen],
    enabledByDefault: true,
    start() {
        (Vencord.Api as any).ProfileCollections = ProfileCollections;
    },
});
