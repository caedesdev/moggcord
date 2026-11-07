/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 mushzi
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ApplicationCommandInputType, sendBotMessage } from "@api/Commands";
import { migratePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { ContextMenuApi, MediaEngineStore, Menu, NotificationSettingsStore, React, ReactDOM, UserStore, VoiceActions } from "@webpack/common";

import Settings from "./settings";

migratePluginSettings("FakeDeafen", "FakeVoice");

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
const logger = new Logger("FakeDeafen");
const playSound = findByCodeLazy("Unable to find sound for pack name:");
const NOTICE_DURATION_MS = 3000;
const VOICE_SOUND_VOLUME = 0.4;
let notice: { id: number; active: boolean; title: string; body: string; } | undefined;
let noticeId = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let isGhostActive = false;
let lastSyncedActive = false;
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
    return Settings.store.fakeMute && Settings.store.fakeDeafen ? "Fake Fullmute" : Settings.store.fakeMute ? "Fake Mute" : "Fake Deafen";
}

function showStatus() {
    clearTimeout(noticeTimer);
    let body = "Your real voice status is restored. Your audio controls stay unchanged.";
    if (isGhostActive) {
        const realMute = MediaEngineStore.isSelfMute();
        const realDeaf = MediaEngineStore.isSelfDeaf();
        const mute = Settings.store.fakeMute || realMute;
        const deaf = Settings.store.fakeDeafen || realDeaf;
        const appearance = mute && deaf ? "muted and deafened" : mute ? "muted" : deaf ? "deafened" : "with your actual voice status";
        body = voiceState?.channelId
            ? `Others see you ${appearance}.`
            : "Ready for your next call.";
        body += realDeaf ? " Your microphone and headphones are muted."
            : realMute ? " Your microphone is muted. Your headphones are on."
                : " Your microphone and headphones are on.";
    }
    notice = {
        id: ++noticeId,
        active: isGhostActive,
        title: isGhostActive ? `${modeName()} enabled` : "Fake Deafen disabled",
        body
    };
    noticeTimer = setTimeout(dismissNotice, NOTICE_DURATION_MS);
}

function syncState(announce = true) {
    const changed = lastSyncedActive !== isGhostActive;
    lastSyncedActive = isGhostActive;
    if (announce && changed && isGhostActive && Settings.store.fakeDeafen && MediaEngineStore.isSelfDeaf()) {
        VoiceActions.setSelfMute("default", true, false);
        VoiceActions.toggleSelfDeaf({ syncRemote: false });
    }
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
    Settings.use();
    const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, []);
}

function toggleMode(mute: boolean, deafen: boolean) {
    isGhostActive = !(isGhostActive && Settings.store.fakeMute === mute && Settings.store.fakeDeafen === deafen);
    Settings.store.fakeMute = mute;
    Settings.store.fakeDeafen = deafen;
    syncState();
}

function toggleEnabled() {
    isGhostActive = !isGhostActive;
    syncState();
}

function handleKeyDown(event: KeyboardEvent) {
    if (!Settings.store.enableKeybind || event.repeat || event.defaultPrevented || event.altKey || event.metaKey
        || !event.ctrlKey || !event.shiftKey || event.code !== "KeyQ") return;
    event.preventDefault();
    event.stopPropagation();
    toggleEnabled();
}

function FakeDeafenIcon({ className }: { className?: string }) {
    return (
        <svg className={className} width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
            <g className={isGhostActive ? cl("icon-active") : undefined}>
                <rect x="6" y="8" width="20" height="4" rx="2" fill="currentColor" />
                <rect x="11" y="3" width="10" height="8" rx="3" fill="currentColor" />
                {isGhostActive ? (
                    <>
                        <path d="m7 18 6 6m0-6-6 6m12-6 6 6m0-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        <path d="M14 23c1-1 3-1 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </>
                ) : (
                    <>
                        <circle cx="10" cy="21" r="4" stroke="currentColor" strokeWidth="2" />
                        <circle cx="22" cy="21" r="4" stroke="currentColor" strokeWidth="2" />
                        <path d="M14 21c1 1 3 1 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </>
                )}
            </g>
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
        <Menu.Menu navId="fake-voice-menu" aria-label="Fake Deafen options" onClose={ContextMenuApi.closeContextMenu}>
            <Menu.MenuGroup label="Fake Deafen">
                <Menu.MenuCheckboxItem
                    id="opt-both"
                    label="Fake Mute & Deafen"
                    checked={Settings.store.fakeMute && Settings.store.fakeDeafen}
                    action={() => {
                        const nextState = !(Settings.store.fakeMute && Settings.store.fakeDeafen);
                        Settings.store.fakeMute = nextState;
                        Settings.store.fakeDeafen = nextState;
                        if (!nextState) isGhostActive = false;
                        syncState();
                    }}
                />
                <Menu.MenuSeparator />
                <Menu.MenuCheckboxItem
                    id="opt-mute"
                    label="Fake Mute"
                    checked={Settings.store.fakeMute}
                    action={() => {
                        Settings.store.fakeMute = !Settings.store.fakeMute;
                        if (!Settings.store.fakeMute && !Settings.store.fakeDeafen) isGhostActive = false;
                        syncState();
                    }}
                />
                <Menu.MenuCheckboxItem
                    id="opt-deafen"
                    label="Fake Deafen"
                    checked={Settings.store.fakeDeafen}
                    action={() => {
                        Settings.store.fakeDeafen = !Settings.store.fakeDeafen;
                        if (!Settings.store.fakeMute && !Settings.store.fakeDeafen) isGhostActive = false;
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
            {Settings.store.showButton && <UserAreaButton
                className={cl("button")}
                onClick={toggleEnabled}
                onContextMenu={(e: React.MouseEvent) => ContextMenuApi.openContextMenu(e, () => <GhostContextMenu />)}
                tooltipText={hideTooltips ? undefined : `${isGhostActive ? "Disable" : "Enable"} Fake Deafen${Settings.store.enableKeybind ? " (Ctrl+Shift+Q)" : ""}`}
                icon={<FakeDeafenIcon className={iconForeground} />}
                role="switch"
                aria-label={isGhostActive ? `${modeName()} active` : "Enable Fake Deafen"}
                aria-checked={isGhostActive}
                redGlow={false}
                plated={nameplate != null}
            />}
            <FakeVoiceNotice key={notice?.id} />
        </>
    );
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Fake mute and deafen status. Enabling from real full mute lets you listen while keeping your microphone muted.",
    authors: [{ name: "mushzi", id: 449282863582412850n }],
    dependencies: ["CommandsAPI", "UserAreaAPI"],
    enabledByDefault: true,
    settings: Settings,

    start() {
        window.addEventListener("keydown", handleKeyDown, true);
    },

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
        return { ...props, mute: props.mute || Settings.store.fakeMute || MediaEngineStore.isSelfMute(), deaf: props.deaf || Settings.store.fakeDeafen };
    },

    rememberVoiceState(socket: VoiceSocket, state: VoiceStateUpdate) {
        const wasInCall = voiceState?.channelId != null;
        voiceSocket = socket;
        voiceState = { ...state };
        if (wasInCall && state.channelId == null) dismissNotice();
    },

    toggle(val: boolean, what: "mute" | "deaf") {
        if (!isGhostActive) return val;
        switch (what) {
            case "mute": return Settings.store.fakeMute ? true : val;
            case "deaf": return Settings.store.fakeDeafen ? true : val;
        }
    },

    stop() {
        window.removeEventListener("keydown", handleKeyDown, true);
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
            description: "Toggle Fake Deafen with your configured mute and deafen options.",
            execute: async (_, ctx) => {
                toggleEnabled();
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
