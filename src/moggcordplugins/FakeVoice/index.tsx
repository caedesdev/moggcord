/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mushzi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import definePlugin from "@utils/types";
import { ContextMenuApi, Menu, React } from "@webpack/common";

interface VoiceStateUpdate {
    channelId?: string | null;
    selfMute?: boolean;
    selfDeaf?: boolean;
    selfVideo?: boolean;
}

interface VoiceSocket {
    voiceStateUpdate(state: VoiceStateUpdate): void;
}

let isGhostActive = false;
let configFakeMute = false;
let configFakeDeafen = true;
let voiceSocket: VoiceSocket | undefined;
let voiceState: VoiceStateUpdate | undefined;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

function syncState() {
    if (voiceState?.channelId) voiceSocket?.voiceStateUpdate(voiceState);
    notify();
}

function useVoiceState() {
    const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, []);
}

function toggleMode(mute: boolean, deafen: boolean) {
    isGhostActive = !(isGhostActive && configFakeMute === mute && configFakeDeafen === deafen);
    configFakeMute = mute;
    configFakeDeafen = deafen;
    syncState();
}

function FakeDeafenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C7.58 2 4 5.58 4 10V19C4 20.66 5.34 22 7 22C8.66 22 10 20.66 10 19C10 20.66 11.34 22 13 22C14.66 22 16 20.66 16 19C16 20.66 17.34 22 19 22C20.66 22 22 20.66 22 19V10C22 5.58 18.42 2 14 2H10H12Z" fill="currentColor" />
            <circle cx="8.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            <circle cx="15.5" cy="10" r="1.5" fill={isGhostActive ? "#121212" : "black"} fillOpacity="0.6" />
            {isGhostActive && (
                <path d="M2 2L22 22" stroke="#ed4245" strokeWidth="2.5" strokeLinecap="round" />
            )}
        </svg>
    );
}

function GhostContextMenu() {
    useVoiceState();
    return (
        <Menu.Menu navId="fake-voice-menu" aria-label="Fake Voice Configuration" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuGroup label="Ghost Options">
                <Menu.MenuCheckboxItem
                    id="opt-both"
                    label="Fake Mute & Deafen"
                    checked={configFakeMute && configFakeDeafen}
                    action={() => {
                        const nextState = !(configFakeMute && configFakeDeafen);
                        configFakeMute = nextState;
                        configFakeDeafen = nextState;
                        if (!nextState) isGhostActive = false;
                        syncState();
                    }}
                />
                <Menu.MenuSeparator />
                <Menu.MenuCheckboxItem
                    id="opt-mute"
                    label="Fake Mute"
                    checked={configFakeMute}
                    action={() => {
                        configFakeMute = !configFakeMute;
                        if (!configFakeMute && !configFakeDeafen) isGhostActive = false;
                        syncState();
                    }}
                />
                <Menu.MenuCheckboxItem
                    id="opt-deafen"
                    label="Fake Deafen"
                    checked={configFakeDeafen}
                    action={() => {
                        configFakeDeafen = !configFakeDeafen;
                        if (!configFakeMute && !configFakeDeafen) isGhostActive = false;
                        syncState();
                    }}
                />
            </Menu.MenuGroup>
        </Menu.Menu>
    );
}

function FakeDeafenUserButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    useVoiceState();
    return (
        <UserAreaButton
            onClick={() => {
                isGhostActive = !isGhostActive;
                if (isGhostActive && !configFakeMute && !configFakeDeafen) configFakeDeafen = true;
                syncState();
            }}
            onContextMenu={(e: React.MouseEvent) => ContextMenuApi.openContextMenu(e, () => <GhostContextMenu />)}
            tooltipText={hideTooltips ? undefined : isGhostActive ? "Disable Fake Voice" : "Enable Fake Deafen (right click: config)"}
            icon={<FakeDeafenIcon className={iconForeground} />}
            role="switch"
            aria-checked={isGhostActive}
            redGlow={false}
            plated={nameplate != null}
        />
    );
}

export default definePlugin({
    name: "FakeVoice",
    description: "Appear muted or deaf while listening. By mushzi.",
    authors: [{ name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI", "UserAreaAPI"],
    enabledByDefault: true,

    patches: [
        {
            find: "}voiceStateUpdate(",
            group: true,
            replacement: [
                {
                    match: /voiceStateUpdate\(\i\)\{/,
                    replace: "$&$self.rememberVoiceState(this,arguments[0]);"
                },
                {
                    match: /self_mute:(\i),self_deaf:(\i)/,
                    replace: "self_mute:$self.toggle($1,'mute'),self_deaf:$self.toggle($2,'deaf')"
                }
            ]
        }
    ],

    rememberVoiceState(socket: VoiceSocket, state: VoiceStateUpdate) {
        voiceSocket = socket;
        voiceState = { ...state };
        if (state.channelId == null && isGhostActive) {
            isGhostActive = false;
            notify();
        }
    },

    toggle(val: boolean, what: "mute" | "deaf") {
        if (!isGhostActive) return val;
        switch (what) {
            case "mute": return configFakeMute ? true : val;
            case "deaf": return configFakeDeafen ? true : val;
        }
    },

    stop() {
        isGhostActive = false;
        syncState();
    },

    userAreaButton: {
        icon: FakeDeafenIcon,
        render: FakeDeafenUserButton
    },

    commands: [
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakemute",
            description: "Toggle Fake Mute.",
            execute: async (_, ctx) => {
                toggleMode(true, false);
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Mute** is ${isGhostActive ? "enabled" : "disabled"}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen",
            description: "Toggle Fake Deafen.",
            execute: async (_, ctx) => {
                toggleMode(false, true);
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen** is ${isGhostActive ? "enabled" : "disabled"}.` });
            },
        },
        {
            inputType: ApplicationCommandInputType.BUILT_IN,
            name: "fakedeafen_mute",
            description: "Toggle Fake Deafen and Mute together.",
            execute: async (_, ctx) => {
                toggleMode(true, true);
                sendBotMessage(ctx.channel.id, { content: `👻 **Fake Deafen & Mute** are ${isGhostActive ? "enabled" : "disabled"}.` });
            },
        },
    ],
});
