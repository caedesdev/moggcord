/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import ErrorBoundary from "@components/ErrorBoundary";
import type { Channel } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { ChannelStore, createRoot, FluxDispatcher, SelectedChannelStore } from "@webpack/common";
import type { Root } from "react-dom/client";

import HiddenChannelLockScreen from "./components/HiddenChannelLockScreen";

const MessagesClasses = findCssClassesLazy("messagesWrapper", "scrollerInner", "navigationDescription");

type PluginApi = {
    isHiddenTextChannel(channel: Channel): boolean;
};

function findMessagesWrapper(): HTMLElement | null {
    const { messagesWrapper } = MessagesClasses;

    const candidates: Array<HTMLElement | null | undefined> = [
        messagesWrapper ? document.querySelector(`div.${messagesWrapper}`) as HTMLElement : null,
        document.querySelector('[class*="messagesWrapper"]') as HTMLElement,
        document.querySelector('ol[data-list-id="chat-messages"]')?.closest('[class*="messagesWrapper"]') as HTMLElement,
        document.querySelector('ol[data-list-id^="chat-messages"]')?.closest('[class*="messagesWrapper"]') as HTMLElement
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.closest('[class*="popout"]') || candidate.closest('[class*="modal"]')) continue;
        return candidate;
    }

    return null;
}

function patchAlreadyRendered(wrapper: HTMLElement) {
    return Array.from(wrapper.querySelectorAll(".vc-shc-container")).some(
        el => !el.closest(".vc-shc-text-overlay")
    );
}

export class TextChannelLockOverlay {
    private root: Root | null = null;
    private container: HTMLDivElement | null = null;
    private observer: MutationObserver | null = null;
    private rafId = 0;
    private mountedChannelId: string | null = null;

    constructor(private plugin: PluginApi) { }

    start() {
        SelectedChannelStore.addChangeListener(this.scheduleUpdate);
        FluxDispatcher.subscribe("CHANNEL_SELECT", this.scheduleUpdate);
        FluxDispatcher.subscribe("SELECT_CHANNEL", this.scheduleUpdate);
        FluxDispatcher.subscribe("LAYOUT_RESIZED", this.scheduleUpdate);
        this.scheduleUpdate();
    }

    stop() {
        SelectedChannelStore.removeChangeListener(this.scheduleUpdate);
        FluxDispatcher.unsubscribe("CHANNEL_SELECT", this.scheduleUpdate);
        FluxDispatcher.unsubscribe("SELECT_CHANNEL", this.scheduleUpdate);
        FluxDispatcher.unsubscribe("LAYOUT_RESIZED", this.scheduleUpdate);
        this.observer?.disconnect();
        cancelAnimationFrame(this.rafId);
        this.unmount();
    }

    private scheduleUpdate = () => {
        cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(() => this.update());
    };

    private update() {
        const channelId = SelectedChannelStore.getChannelId();
        const channel = channelId ? ChannelStore.getChannel(channelId) : null;

        if (!channelId || !channel || !this.plugin.isHiddenTextChannel(channel)) {
            this.unmount();
            this.observer?.disconnect();
            this.observer = null;
            return;
        }

        const wrapper = findMessagesWrapper();
        if (!wrapper) {
            if (!this.observer) {
                this.observer = new MutationObserver(this.scheduleUpdate);
                this.observer.observe(document.body, { childList: true, subtree: true });
            }
            return;
        }

        if (patchAlreadyRendered(wrapper)) {
            this.unmount();
            this.observer?.disconnect();
            this.observer = null;
            return;
        }

        if (this.mountedChannelId !== channelId) {
            this.unmount();
            this.mountedChannelId = channelId;
        }

        this.mount(wrapper, channel);
        this.observer?.disconnect();
        this.observer = null;
    }

    private mount(wrapper: HTMLElement, channel: Channel) {
        if (!this.container) {
            this.container = document.createElement("div");
            this.container.className = "vc-shc-text-overlay";
            this.root = createRoot(this.container);
        }

        if (this.container.parentElement !== wrapper) {
            this.container.remove();
            if (getComputedStyle(wrapper).position === "static") {
                wrapper.style.position = "relative";
            }
            wrapper.appendChild(this.container);
        }

        this.root!.render(
            <ErrorBoundary noop>
                <HiddenChannelLockScreen channel={channel} />
            </ErrorBoundary>
        );
    }

    private unmount() {
        this.root?.render(null);
        this.root?.unmount();
        this.container?.remove();
        this.root = null;
        this.container = null;
        this.mountedChannelId = null;
    }
}
