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

import { isPluginEnabled } from "@api/PluginManager";
import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import PermissionsViewerPlugin from "@plugins/permissionsViewer";
import openRolesAndUsersPermissionsModal from "@plugins/permissionsViewer/components/RolesAndUsersPermissions";
import { sortPermissionOverwrites } from "@plugins/permissionsViewer/utils";
import { classes } from "@utils/misc";
import { formatDuration } from "@utils/text";
import type { Channel, Role, RoleOrUserPermission } from "@vencord/discord-types";
import { PermissionOverwriteType } from "@vencord/discord-types/enums";
import { findByPropsLazy, findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { EmojiStore, FluxDispatcher, GuildMemberStore, GuildRoleStore, GuildStore, Parser, PermissionsBits, PermissionStore, SnowflakeUtils, Timestamp, Tooltip, UserStore, useEffect, useMemo, useState } from "@webpack/common";
import type { ComponentType } from "react";

import { cl, settings } from "..";

const enum SortOrderTypes {
    LATEST_ACTIVITY = 0,
    CREATION_DATE = 1
}

const enum ForumLayoutTypes {
    DEFAULT = 0,
    LIST = 1,
    GRID = 2
}

const enum ChannelTypes {
    GUILD_TEXT = 0,
    GUILD_VOICE = 2,
    GUILD_ANNOUNCEMENT = 5,
    GUILD_STAGE_VOICE = 13,
    GUILD_FORUM = 15
}

const enum VideoQualityModes {
    AUTO = 1,
    FULL = 2
}

const enum ChannelFlags {
    PINNED = 1 << 1,
    REQUIRE_TAG = 1 << 4
}

const ChatScrollClasses = findCssClassesLazy("auto", "managedReactiveScroller", "customTheme");
const TagComponent = findComponentByCodeLazy("#{intl::FORUM_TAG_A11Y_FILTER_BY_TAG}");

const noopChannelBeginHeader = () => null;
let ChannelBeginHeader: ComponentType<{ channel: Channel; }> = noopChannelBeginHeader;
let channelBeginHeaderFromPatch = false;

export const setChannelBeginHeader = (value: ComponentType<{ channel: Channel; }>) => {
    if (value && value !== noopChannelBeginHeader) {
        ChannelBeginHeader = value;
        channelBeginHeaderFromPatch = true;
    }
};

const EmojiParser = findByPropsLazy("convertSurrogateToName");
const EmojiUtils = findByPropsLazy("getURL", "getEmojiColors");

const ChannelTypesToChannelNames = {
    [ChannelTypes.GUILD_TEXT]: "text",
    [ChannelTypes.GUILD_ANNOUNCEMENT]: "announcement",
    [ChannelTypes.GUILD_FORUM]: "forum",
    [ChannelTypes.GUILD_VOICE]: "voice",
    [ChannelTypes.GUILD_STAGE_VOICE]: "stage"
};

const SortOrderTypesToNames = {
    [SortOrderTypes.LATEST_ACTIVITY]: "Latest activity",
    [SortOrderTypes.CREATION_DATE]: "Creation date"
};

const ForumLayoutTypesToNames = {
    [ForumLayoutTypes.DEFAULT]: "Not set",
    [ForumLayoutTypes.LIST]: "List view",
    [ForumLayoutTypes.GRID]: "Gallery view"
};

const VideoQualityModesToNames = {
    [VideoQualityModes.AUTO]: "Automatic",
    [VideoQualityModes.FULL]: "720p"
};

const HiddenChannelLogo = "/assets/433e3ec4319a9d11b0cbe39342614982.svg";

type AccessEntry = {
    key: string;
    name: string;
    type: "Owner" | "Role" | "User";
    color?: string;
};

function getRequiredPermission(channel: Channel): bigint {
    return channel.isGuildVoice() || channel.isGuildStageVoice()
        ? PermissionsBits.CONNECT
        : PermissionsBits.VIEW_CHANNEL;
}

function applyOverwrite(base: bigint, overwrite: { allow: bigint; deny: bigint; }): bigint {
    return (base & ~overwrite.deny) | overwrite.allow;
}

function roleHasChannelAccess(role: Role, channel: Channel, permission: bigint): boolean {
    let perms = role.permissions;

    const everyoneOverwrite = channel.permissionOverwrites[channel.guild_id];
    if (everyoneOverwrite) {
        perms = applyOverwrite(perms, everyoneOverwrite);
    }

    const roleOverwrite = channel.permissionOverwrites[role.id];
    if (roleOverwrite) {
        perms = applyOverwrite(perms, roleOverwrite);
    }

    if ((perms & PermissionsBits.ADMINISTRATOR) === PermissionsBits.ADMINISTRATOR) return true;
    return (perms & permission) === permission;
}

function hasExplicitAllow(allow: bigint, deny: bigint, permission: bigint): boolean {
    if ((deny & permission) === permission) return false;
    return (allow & permission) === permission;
}

function getAccessEntries(channel: Channel): AccessEntry[] {
    const entries: AccessEntry[] = [];
    const seen = new Set<string>();
    const guild = GuildStore.getGuild(channel.guild_id);
    const permission = getRequiredPermission(channel);

    const addEntry = (entry: AccessEntry) => {
        if (seen.has(entry.key)) return;
        seen.add(entry.key);
        entries.push(entry);
    };

    if (guild?.ownerId) {
        const owner = UserStore.getUser(guild.ownerId);
        addEntry({
            key: `owner-${guild.ownerId}`,
            name: owner?.globalName ?? owner?.username ?? "Server Owner",
            type: "Owner"
        });
    }

    const roles = GuildRoleStore.getSortedRoles(channel.guild_id) ?? [];
    for (const role of roles) {
        if (!roleHasChannelAccess(role, channel, permission)) continue;

        addEntry({
            key: `role-${role.id}`,
            name: role.name,
            type: "Role",
            color: role.colorString
        });
    }

    for (const overwrite of Object.values(channel.permissionOverwrites)) {
        if (overwrite.type !== PermissionOverwriteType.MEMBER) continue;
        if (!hasExplicitAllow(overwrite.allow, overwrite.deny, permission)) continue;

        const member = GuildMemberStore.getMember(channel.guild_id, overwrite.id);
        const user = UserStore.getUser(overwrite.id);
        addEntry({
            key: `user-${overwrite.id}`,
            name: member?.nick ?? user?.globalName ?? user?.username ?? "Unknown user",
            type: "User"
        });
    }

    return entries;
}

function AccessListFallback({ channel, entries }: { channel: Channel; entries: AccessEntry[]; }) {
    const permissionLabel = channel.isGuildVoice() || channel.isGuildStageVoice()
        ? "CONNECT"
        : "VIEW_CHANNEL";

    if (entries.length === 0) {
        return <BaseText size="md">No roles or users with {permissionLabel} access found.</BaseText>;
    }

    return (
        <div className={cl("access-list")}>
            {entries.map(entry => (
                <div className={cl("access-entry")} key={entry.key}>
                    <span className={cl("access-entry-type")}>{entry.type}</span>
                    <span className={cl("access-entry-name")} style={{ color: entry.color }}>{entry.name}</span>
                </div>
            ))}
        </div>
    );
}

function AllowedUsersAndRolesSection({ channel, permissions }: { channel: Channel; permissions: RoleOrUserPermission[]; }) {
    const { defaultAllowedUsersAndRolesDropdownState } = settings.use(["defaultAllowedUsersAndRolesDropdownState"]);
    const accessEntries = useMemo(() => getAccessEntries(channel), [channel]);
    const isTextLike = !channel.isGuildVoice() && !channel.isGuildStageVoice();

    return (
        <div className={cl("allowed-users-and-roles-container")}>
            <div className={cl("allowed-users-and-roles-container-title")}>
                {isPluginEnabled(PermissionsViewerPlugin.name) && permissions.length > 0 && (
                    <Tooltip text="Permission Details">
                        {({ onMouseLeave, onMouseEnter }) => (
                            <button
                                onMouseLeave={onMouseLeave}
                                onMouseEnter={onMouseEnter}
                                className={cl("allowed-users-and-roles-container-permdetails-btn")}
                                onClick={() => openRolesAndUsersPermissionsModal(permissions, GuildStore.getGuild(channel.guild_id)!, channel.name)}
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M7 12.001C7 10.8964 6.10457 10.001 5 10.001C3.89543 10.001 3 10.8964 3 12.001C3 13.1055 3.89543 14.001 5 14.001C6.10457 14.001 7 13.1055 7 12.001ZM14 12.001C14 10.8964 13.1046 10.001 12 10.001C10.8954 10.001 10 10.8964 10 12.001C10 13.1055 10.8954 14.001 12 14.001C13.1046 14.001 14 13.1055 14 12.001ZM19 10.001C20.1046 10.001 21 10.8964 21 12.001C21 13.1055 20.1046 14.001 19 14.001C17.8954 14.001 17 13.1055 17 12.001C17 10.8964 17.8954 10.001 19 10.001Z" />
                                </svg>
                            </button>
                        )}
                    </Tooltip>
                )}
                <BaseText size="lg" weight="bold">Allowed users and roles:</BaseText>
                <Tooltip text={defaultAllowedUsersAndRolesDropdownState ? "Hide Allowed Users and Roles" : "View Allowed Users and Roles"}>
                    {({ onMouseLeave, onMouseEnter }) => (
                        <button
                            onMouseLeave={onMouseLeave}
                            onMouseEnter={onMouseEnter}
                            className={cl("allowed-users-and-roles-container-toggle-btn")}
                            onClick={() => settings.store.defaultAllowedUsersAndRolesDropdownState = !defaultAllowedUsersAndRolesDropdownState}
                        >
                            <svg
                                width="24"
                                height="24"
                                viewBox="0 0 24 24"
                                transform={defaultAllowedUsersAndRolesDropdownState ? "scale(1 -1)" : "scale(1 1)"}
                            >
                                <path fill="currentColor" d="M16.59 8.59003L12 13.17L7.41 8.59003L6 10L12 16L18 10L16.59 8.59003Z" />
                            </svg>
                        </button>
                    )}
                </Tooltip>
            </div>
            {defaultAllowedUsersAndRolesDropdownState && (
                isTextLike ? (
                    <>
                        {channelBeginHeaderFromPatch && <ChannelBeginHeader channel={channel} />}
                        <AccessListFallback channel={channel} entries={accessEntries} />
                    </>
                ) : channelBeginHeaderFromPatch ? (
                    <ChannelBeginHeader channel={channel} />
                ) : (
                    <AccessListFallback channel={channel} entries={accessEntries} />
                )
            )}
        </div>
    );
}

function HiddenChannelLockScreen({ channel }: { channel: Channel; }) {
    const [permissions, setPermissions] = useState<RoleOrUserPermission[]>([]);

    const {
        type,
        topic,
        lastMessageId,
        defaultForumLayout,
        lastPinTimestamp,
        defaultAutoArchiveDuration,
        availableTags,
        id: channelId,
        rateLimitPerUser,
        defaultThreadRateLimitPerUser,
        defaultSortOrder,
        defaultReactionEmoji,
        bitrate,
        rtcRegion,
        videoQualityMode,
        permissionOverwrites,
        guild_id
    } = channel;

    useEffect(() => {
        const membersToFetch: string[] = [];

        const guildOwnerId = GuildStore.getGuild(guild_id)?.ownerId;
        if (guildOwnerId && !GuildMemberStore.getMember(guild_id, guildOwnerId)) membersToFetch.push(guildOwnerId);

        Object.values(permissionOverwrites).forEach(({ type: overwriteType, id: userId }) => {
            if (overwriteType === 1 && !GuildMemberStore.getMember(guild_id, userId)) {
                membersToFetch.push(userId);
            }
        });

        if (membersToFetch.length > 0) {
            FluxDispatcher.dispatch({
                type: "GUILD_MEMBERS_REQUEST",
                guildIds: [guild_id],
                userIds: membersToFetch
            });
        }

        if (isPluginEnabled(PermissionsViewerPlugin.name)) {
            setPermissions(sortPermissionOverwrites(Object.values(permissionOverwrites).map(overwrite => ({
                type: overwrite.type,
                id: overwrite.id,
                overwriteAllow: overwrite.allow,
                overwriteDeny: overwrite.deny
            })), guild_id));
        }
    }, [channelId, guild_id, permissionOverwrites]);

    const isTextLike = !channel.isGuildVoice() && !channel.isGuildStageVoice();
    const hasTopic = topic != null && topic.length > 0;

    return (
        <div className={classes(ChatScrollClasses.auto, ChatScrollClasses.customTheme, ChatScrollClasses.managedReactiveScroller)}>
            <div className={cl("container")}>
                <img className={cl("logo")} src={HiddenChannelLogo} alt="" />

                <div className={cl("heading-container")}>
                    <BaseText size="xxl" weight="bold">
                        This is a {!PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel) ? "hidden" : "locked"} {ChannelTypesToChannelNames[type]} channel
                    </BaseText>
                    {channel.isNSFW() &&
                        <Tooltip text="NSFW">
                            {({ onMouseLeave, onMouseEnter }) => (
                                <svg
                                    onMouseLeave={onMouseLeave}
                                    onMouseEnter={onMouseEnter}
                                    className={cl("heading-nsfw-icon")}
                                    width="32"
                                    height="32"
                                    viewBox="0 0 48 48"
                                    aria-hidden={true}
                                    role="img"
                                >
                                    <path fill="currentColor" d="M.7 43.05 24 2.85l23.3 40.2Zm23.55-6.25q.75 0 1.275-.525.525-.525.525-1.275 0-.75-.525-1.3t-1.275-.55q-.8 0-1.325.55-.525.55-.525 1.3t.55 1.275q.55.525 1.3.525Zm-1.85-6.1h3.65V19.4H22.4Z" />
                                </svg>
                            )}
                        </Tooltip>
                    }
                </div>

                <div className={cl("locked-summary")}>
                    <svg className={cl("locked-summary-icon")} width="28" height="28" viewBox="0 0 24 24" aria-hidden={true} role="img">
                        <path fill="currentColor" d="M17 9V7A5 5 0 0 0 7 7v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1ZM9 7a3 3 0 0 1 6 0v2H9V7Zm4 8.73V18h-2v-2.27a2 2 0 1 1 2 0Z" />
                    </svg>
                    <BaseText size="md">
                        You do not have access to this channel. It is shown by ShowHiddenChannels so you can tell it is locked instead of broken.
                    </BaseText>
                </div>

                {isTextLike && (
                    <BaseText size="lg">
                        You can not see the {channel.isForumChannel() ? "posts" : "messages"} of this channel.
                        {channel.isForumChannel() && hasTopic && " However you may see its guidelines:"}
                    </BaseText>
                )}

                {isTextLike && hasTopic && (
                    <div className={cl("topic-container")}>
                        {!channel.isForumChannel() && <BaseText size="md" weight="semibold">Channel topic:</BaseText>}
                        {Parser.parseTopic(topic, false, { channelId })}
                    </div>
                )}

                {lastMessageId &&
                    <BaseText size="md">
                        Last {channel.isForumChannel() ? "post" : "message"} created:
                        {" "}
                        <Timestamp timestamp={new Date(SnowflakeUtils.extractTimestamp(lastMessageId))} />
                    </BaseText>
                }
                {lastPinTimestamp &&
                    <BaseText size="md">
                        Last message pin: <Timestamp timestamp={new Date(lastPinTimestamp)} />
                    </BaseText>
                }
                {(rateLimitPerUser ?? 0) > 0 &&
                    <BaseText size="md">
                        Slowmode: {formatDuration(rateLimitPerUser!, "seconds")}
                    </BaseText>
                }
                {(defaultThreadRateLimitPerUser ?? 0) > 0 &&
                    <BaseText size="md">
                        Default thread slowmode: {formatDuration(defaultThreadRateLimitPerUser!, "seconds")}
                    </BaseText>
                }
                {((channel.isGuildVoice() || channel.isGuildStageVoice()) && bitrate != null) &&
                    <BaseText size="md">
                        Bitrate: {bitrate} bits
                    </BaseText>
                }
                {rtcRegion !== undefined &&
                    <BaseText size="md">
                        Region: {rtcRegion ?? "Automatic"}
                    </BaseText>
                }
                {(channel.isGuildVoice() || channel.isGuildStageVoice()) &&
                    <BaseText size="md">Video quality mode: {VideoQualityModesToNames[videoQualityMode ?? VideoQualityModes.AUTO]}</BaseText>
                }
                {(defaultAutoArchiveDuration ?? 0) > 0 &&
                    <BaseText size="md">
                        Default inactivity duration before archiving {channel.isForumChannel() ? "posts" : "threads"}:
                        {" " + formatDuration(defaultAutoArchiveDuration!, "minutes")}
                    </BaseText>
                }
                {defaultForumLayout != null &&
                    <BaseText size="md">
                        Default layout: {ForumLayoutTypesToNames[defaultForumLayout]}
                    </BaseText>
                }
                {defaultSortOrder != null &&
                    <BaseText size="md">
                        Default sort order: {SortOrderTypesToNames[defaultSortOrder]}
                    </BaseText>
                }
                {defaultReactionEmoji != null &&
                    <div className={cl("default-emoji-container")}>
                        <BaseText size="md">Default reaction emoji:</BaseText>
                        {Parser.defaultRules[defaultReactionEmoji.emojiName ? "emoji" : "customEmoji"].react({
                            name: defaultReactionEmoji.emojiName
                                ? EmojiParser.convertSurrogateToName(defaultReactionEmoji.emojiName)
                                : EmojiStore.getCustomEmojiById(defaultReactionEmoji.emojiId)?.name ?? "",
                            emojiId: defaultReactionEmoji.emojiId ?? void 0,
                            surrogate: defaultReactionEmoji.emojiName ?? void 0,
                            src: defaultReactionEmoji.emojiName
                                ? EmojiUtils.getURL(defaultReactionEmoji.emojiName)
                                : void 0
                        }, void 0, { key: 0 })}
                    </div>
                }
                {channel.hasFlag(ChannelFlags.REQUIRE_TAG) &&
                    <BaseText size="md">Posts on this forum require a tag to be set.</BaseText>
                }
                {availableTags && availableTags.length > 0 &&
                    <div className={cl("tags-container")}>
                        <BaseText size="lg" weight="bold">Available tags:</BaseText>
                        <div className={cl("tags")}>
                            {availableTags.map(tag => <TagComponent tag={tag} key={tag.id} />)}
                        </div>
                    </div>
                }
                <AllowedUsersAndRolesSection channel={channel} permissions={permissions} />
            </div>
        </div>
    );
}

export default ErrorBoundary.wrap(HiddenChannelLockScreen);
