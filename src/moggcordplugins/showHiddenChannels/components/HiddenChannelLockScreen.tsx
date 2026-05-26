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

import { BaseText } from "@components/BaseText";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import { formatDuration } from "@utils/text";
import type { Channel } from "@vencord/discord-types";
import { PermissionOverwriteType } from "@vencord/discord-types/enums";
import { findByPropsLazy, findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { EmojiStore, FluxDispatcher, GuildMemberStore, GuildRoleStore, GuildStore, Parser, PermissionsBits, PermissionStore, SnowflakeUtils, Timestamp, Tooltip, UserStore, useEffect } from "@webpack/common";

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

interface DefaultReaction {
    emojiId: string | null;
    emojiName: string | null;
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

// Icon from the modal when clicking a message link you don't have access to view
const HiddenChannelLogo = "/assets/433e3ec4319a9d11b0cbe39342614982.svg";

type AccessEntry = {
    key: string;
    name: string;
    type: "Owner" | "Role" | "User";
    color?: string;
};

const hasViewChannel = (allow: bigint) => (allow & PermissionsBits.VIEW_CHANNEL) === PermissionsBits.VIEW_CHANNEL;

function getAccessEntries(channel: Channel): AccessEntry[] {
    const entries: AccessEntry[] = [];
    const guild = GuildStore.getGuild(channel.guild_id);

    if (guild?.ownerId) {
        const owner = UserStore.getUser(guild.ownerId);
        entries.push({
            key: `owner-${guild.ownerId}`,
            name: owner?.globalName ?? owner?.username ?? "Server Owner",
            type: "Owner"
        });
    }

    const overwrites = Object.values(channel.permissionOverwrites)
        .filter(overwrite => hasViewChannel(overwrite.allow));

    const roleOverwrites = overwrites
        .filter(overwrite => overwrite.type === PermissionOverwriteType.ROLE)
        .sort((a, b) => (GuildRoleStore.getRole(channel.guild_id, b.id)?.position ?? 0) - (GuildRoleStore.getRole(channel.guild_id, a.id)?.position ?? 0));

    for (const overwrite of roleOverwrites) {
        const role = GuildRoleStore.getRole(channel.guild_id, overwrite.id);
        entries.push({
            key: `role-${overwrite.id}`,
            name: role?.name ?? (overwrite.id === channel.guild_id ? "@everyone" : "Unknown role"),
            type: "Role",
            color: role?.colorString
        });
    }

    for (const overwrite of overwrites) {
        if (overwrite.type !== PermissionOverwriteType.MEMBER) continue;

        const member = GuildMemberStore.getMember(channel.guild_id, overwrite.id);
        const user = UserStore.getUser(overwrite.id);
        entries.push({
            key: `user-${overwrite.id}`,
            name: member?.nick ?? user?.globalName ?? user?.username ?? "Unknown user",
            type: "User"
        });
    }

    return entries;
}

function HiddenChannelLockScreen({ channel }: { channel: Channel; }) {
    const { defaultAllowedUsersAndRolesDropdownState } = settings.use();
    const accessEntries = getAccessEntries(channel);

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
        const membersToFetch = new Set<string>();

        const guildOwnerId = GuildStore.getGuild(guild_id)?.ownerId;
        if (guildOwnerId && !GuildMemberStore.getMember(guild_id, guildOwnerId)) membersToFetch.add(guildOwnerId);

        Object.values(permissionOverwrites).forEach(({ type, id: userId }) => {
            if (type === PermissionOverwriteType.MEMBER && !GuildMemberStore.getMember(guild_id, userId)) {
                membersToFetch.add(userId);
            }
        });

        if (membersToFetch.size > 0) {
            FluxDispatcher.dispatch({
                type: "GUILD_MEMBERS_REQUEST",
                guildIds: [guild_id],
                userIds: Array.from(membersToFetch)
            });
        }
    }, [channelId, guild_id, permissionOverwrites]);

    return (
        <div className={classes(ChatScrollClasses.auto, ChatScrollClasses.customTheme, ChatScrollClasses.managedReactiveScroller)}>
            <div className={cl("container")}>
                <img className={cl("logo")} src={HiddenChannelLogo} />

                <div className={cl("heading-container")}>
                    <BaseText size="xxl" weight="bold">This {ChannelTypesToChannelNames[type]} channel is {!PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel) ? "hidden" : "locked"}</BaseText>
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

                {(!channel.isGuildVoice() && !channel.isGuildStageVoice()) && (
                    <BaseText size="lg">
                        You can not see the {channel.isForumChannel() ? "posts" : "messages"} of this channel.
                        {channel.isForumChannel() && topic && topic.length > 0 && " However you may see its guidelines:"}
                    </BaseText>
                )}

                {channel.isForumChannel() && topic && topic.length > 0 && (
                    <div className={cl("topic-container")}>
                        {Parser.parseTopic(topic, false, { channelId })}
                    </div>
                )}

                {lastMessageId &&
                    <BaseText size="md">
                        Last {channel.isForumChannel() ? "post" : "message"} created:
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
                <div className={cl("allowed-users-and-roles-container")}>
                    <div className={cl("allowed-users-and-roles-container-title")}>
                        <BaseText size="lg" weight="bold">Who can open this channel:</BaseText>
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
                        <div className={cl("access-list")}>
                            {accessEntries.length > 0
                                ? accessEntries.map(entry => (
                                    <div className={cl("access-entry")} key={entry.key}>
                                        <span className={cl("access-entry-type")}>{entry.type}</span>
                                        <span className={cl("access-entry-name")} style={{ color: entry.color }}>{entry.name}</span>
                                    </div>
                                ))
                                : <BaseText size="md">No explicit VIEW_CHANNEL overwrites found.</BaseText>
                            }
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ErrorBoundary.wrap(HiddenChannelLockScreen);
