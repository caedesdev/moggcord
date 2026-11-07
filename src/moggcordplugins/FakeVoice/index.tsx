/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mushzi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { ContextMenuApi, MediaEngineStore, Menu, NotificationSettingsStore, React, ReactDOM, UserStore, VoiceActions } from "@webpack/common";

interface VoiceStateUpdate {
    channelId?: string | null;
    selfMute?: boolean;
    selfDeaf?: boolean;
    selfVideo?: boolean;
}

interface VoiceSocket {
    voiceStateUpdate(state: VoiceStateUpdate): void;
}

interface VoiceStatusProps {
    user?: User;
    channelId?: string;
    mute: boolean;
    deaf: boolean;
}

const cl = classNameFactory("mc-fake-voice-");
const logger = new Logger("FakeVoice");
const playSound = findByCodeLazy("Unable to find sound for pack name:");
const NOTICE_DURATION_MS = 3000;
const VOICE_SOUND_VOLUME = 0.4;
let notice: { id: number; active: boolean; title: string; body: string; } | undefined;
let noticeId = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let isGhostActive = false;
let lastSyncedActive = false;
let configFakeMute = false;
let configFakeDeafen = true;
let voiceSocket: VoiceSocket | undefined;
let voiceState: VoiceStateUpdate | undefined;
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

function dismissNotice() {
    clearTimeout(noticeTimer);
    noticeTimer = undefined;
    notice = undefined;
    notify();
}

function modeName() {
    return configFakeMute && configFakeDeafen ? "Fake Mute & Deafen" : configFakeMute ? "Fake Mute" : "Fake Deafen";
}

function showStatus() {
    clearTimeout(noticeTimer);
    let body = "You appear muted. Your audio controls stay unchanged.";
    if (!isGhostActive) {
        body = MediaEngineStore.isSelfMute()
            ? "Your real voice status is restored. Your microphone stays muted."
            : "Your real voice status is restored.";
    } else if (configFakeDeafen) {
        if (!MediaEngineStore.isSelfMute()) {
            body = "Fake Deafen is active, but Discord could not mute your microphone. Mute it before speaking.";
        } else if (!voiceState?.channelId) {
            body = "Ready for your next call. Your microphone is muted.";
        } else if (MediaEngineStore.isSelfDeaf()) {
            body = "Full mute stays on. Turn off Discord's deafen to listen; your microphone stays muted.";
        } else {
            body = "Your microphone is muted. Other people see you as deafened.";
        }
    }
    notice = {
        id: ++noticeId,
        active: isGhostActive,
        title: isGhostActive ? `${modeName()} enabled` : "Fake Voice disabled",
        body
    };
    noticeTimer = setTimeout(dismissNotice, NOTICE_DURATION_MS);
}

function syncState(announce = true) {
    const changed = lastSyncedActive !== isGhostActive;
    lastSyncedActive = isGhostActive;
    if (isGhostActive && configFakeDeafen) VoiceActions.setSelfMute(undefined, true, false);
    if (voiceState?.channelId) voiceSocket?.voiceStateUpdate({
        ...voiceState,
        selfMute: MediaEngineStore.isSelfMute(),
        selfDeaf: MediaEngineStore.isSelfDeaf()
    });
    if (announce) showStatus();
    notify();
    if (announce && changed) {
        const sound = isGhostActive ? "deafen" : "undeafen";
        if (NotificationSettingsStore.isSoundDisabled(sound)) return;
        try {
            playSound(sound, VOICE_SOUND_VOLUME);
        } catch (error) {
            logger.warn("Could not play the voice status sound", error);
        }
    }
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
            <path d="M12 3a8 8 0 0 0-8 8v9l4-2 4 2 4-2 4 2v-9a8 8 0 0 0-8-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="9" cy="10" r="1.5" fill="currentColor" />
            <circle cx="15" cy="10" r="1.5" fill="currentColor" />
            {isGhostActive && (
                <path className={cl("icon-slash")} d="M3 3L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
        </svg>
    );
}

function FakeVoiceNotice() {
    if (!notice) return null;
    const { active, title, body } = notice;
    return ReactDOM.createPortal(
        <div className={cl("notice", active ? "success" : "info")} role="status" aria-live="polite" aria-atomic="true">
            <svg className={cl("notice-icon")} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                {active
                    ? <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    : <path d="M12 11v5m0-8v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
            </svg>
            <div className={cl("notice-content")}>
                <strong>{title}</strong>
                <p>{body}</p>
            </div>
            <button type="button" className={cl("notice-close")} aria-label="Dismiss notification" onClick={dismissNotice}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="m6 6 12 12M6 18 18 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            </button>
            <span className={cl("notice-progress")} aria-hidden="true" />
        </div>,
        document.body
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
        <>
            <UserAreaButton
                className={cl("button")}
                onClick={() => {
                    isGhostActive = !isGhostActive;
                    if (isGhostActive && !configFakeMute && !configFakeDeafen) configFakeDeafen = true;
                    syncState();
                }}
                onContextMenu={(e: React.MouseEvent) => ContextMenuApi.openContextMenu(e, () => <GhostContextMenu />)}
                tooltipText={hideTooltips ? undefined : isGhostActive ? `${modeName()} active (click to disable)` : "Enable Fake Deafen (right click: config)"}
                icon={<FakeDeafenIcon className={iconForeground} />}
                role="switch"
                aria-label={isGhostActive ? `${modeName()} active` : "Enable Fake Voice"}
                aria-checked={isGhostActive}
                redGlow={false}
                plated={nameplate != null}
            />
            <FakeVoiceNotice key={notice?.id} />
        </>
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
        },
        {
            find: '"soundboard-mute"',
            replacement: {
                match: /function \i\((\i)\)\{(?=let\{className:\i,mute:\i,localMute:)/,
                replace: "$&$1=$self.useDisplayedVoiceStatus($1);"
            }
        }
    ],

    useDisplayedVoiceStatus<T extends VoiceStatusProps>(props: T): T {
        useVoiceState();
        if (!isGhostActive || !voiceState?.channelId || !props.user || props.user.id !== UserStore.getCurrentUser()?.id
            || (props.channelId != null && props.channelId !== voiceState.channelId)) return props;
        return { ...props, mute: props.mute || configFakeMute || MediaEngineStore.isSelfMute(), deaf: props.deaf || configFakeDeafen };
    },

    rememberVoiceState(socket: VoiceSocket, state: VoiceStateUpdate) {
        const wasInCall = voiceState?.channelId != null;
        voiceSocket = socket;
        voiceState = { ...state };
        if (wasInCall && state.channelId == null && isGhostActive) {
            isGhostActive = false;
            lastSyncedActive = false;
            dismissNotice();
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
        dismissNotice();
        syncState(false);
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
