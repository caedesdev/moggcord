/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { proxyLazy } from "@utils/lazy";
import { Flux, FluxDispatcher } from "@webpack/common";

export const OnlineMemberCountStore = proxyLazy(() => {
    const onlineMemberMap = new Map<string, number>();

    class OnlineMemberCountStore extends Flux.Store {
        getCount(guildId?: string) {
            return onlineMemberMap.get(guildId!);
        }

        /** No-op — ChannelActionCreators.preload caused gateway load and ~20s freezes. */
        ensureCount(_guildId?: string) { }
    }

    return new OnlineMemberCountStore(FluxDispatcher, {
        GUILD_MEMBER_LIST_UPDATE({ guildId, groups }: { guildId: string, groups: { count: number; id: string; }[]; }) {
            onlineMemberMap.set(
                guildId,
                groups.reduce((total, curr) => total + (curr.id === "offline" ? 0 : curr.count), 0)
            );
        },
        ONLINE_GUILD_MEMBER_COUNT_UPDATE({ guildId, count }) {
            onlineMemberMap.set(guildId, count);
        }
    });
});
