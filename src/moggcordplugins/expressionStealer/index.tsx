/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { Button } from "@components/Button";
import { getGuildAcronym } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import { Guild, GuildSticker, Message } from "@vencord/discord-types";
import { StickerFormatType } from "@vencord/discord-types/enums";
import { findByCodeLazy } from "@webpack";
import { Constants, EmojiStore, FluxDispatcher, Forms, GuildStore, IconUtils, Menu, PermissionsBits, PermissionStore, React, RestAPI, showToast, StickersStore, Toasts, UserStore } from "@webpack/common";

const uploadEmoji = findByCodeLazy(".GUILD_EMOJIS(", "EMOJI_UPLOAD_START") as (data: {
    guildId: string;
    image: string;
    name: string;
}) => Promise<unknown>;

const getGuildMaxEmojiSlots = findByCodeLazy(".additionalEmojiSlots") as (guild: Guild) => number;

const logger = new Logger("ExpressionStealer");

const MAX_EMOJI_SIZE_BYTES = 256 * 1024;
const MAX_STICKER_SIZE_BYTES = 512 * 1024;
const CUSTOM_EMOJI_RE = /<a?:(\w+)(?:~\d+)?:([0-9]+)>/g;

const StickerExt = {
    [StickerFormatType.PNG]: "png",
    [StickerFormatType.APNG]: "png",
    [StickerFormatType.LOTTIE]: "json",
    [StickerFormatType.GIF]: "gif",
} as const;

const PremiumTierStickerLimit = {
    0: 5,
    1: 15,
    2: 30,
    3: 60,
} as const;

interface StealableEmoji {
    kind: "emoji";
    animated: boolean;
    id: string;
    name: string;
}

interface StealableSticker {
    kind: "sticker";
    sticker: StickerLike;
}

type StealableExpression = StealableEmoji | StealableSticker;

interface StickerLike {
    description?: string | null;
    format_type: StickerFormatType;
    id: string;
    name: string;
    tags?: string;
}

interface MessageContextProps {
    favoriteableId?: string;
    favoriteableType?: string;
    itemHref?: string;
    itemSrc?: string;
    message?: Message;
}

function StealIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a5 5 0 0 0-5 5v1H5a2 2 0 0 0-2 2v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-9a2 2 0 0 0-2-2h-2V7a5 5 0 0 0-5-5Zm-3 6V7a3 3 0 1 1 6 0v1H9Zm3 4a2 2 0 0 1 1 3.73V18h-2v-2.27A2 2 0 0 1 12 12Z" />
        </svg>
    );
}

function SpinnerIcon() {
    return (
        <svg className="mse-spin" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 4V2A10 10 0 0 0 2 12h2a8 8 0 0 1 8-8Z" />
        </svg>
    );
}

function getStickerSlots(guild: Guild) {
    if (guild.features.has("MORE_STICKERS") && guild.premiumTier === 3) return 120;
    return PremiumTierStickerLimit[guild.premiumTier] ?? PremiumTierStickerLimit[0];
}

function getEmojiSlots(guild: Guild) {
    try {
        return getGuildMaxEmojiSlots(guild) ?? 50;
    } catch {
        return 50;
    }
}

function canCreateExpressions(guild: Guild) {
    const me = UserStore.getCurrentUser();
    if (guild.ownerId === me?.id) return true;

    return (PermissionStore.getGuildPermissions({ id: guild.id }) & PermissionsBits.CREATE_GUILD_EXPRESSIONS) === PermissionsBits.CREATE_GUILD_EXPRESSIONS;
}

function getGuildCandidates(expression: StealableExpression) {
    return Object.values(GuildStore.getGuilds())
        .filter(guild => {
            if (!canCreateExpressions(guild)) return false;

            if (expression.kind === "sticker") {
                const stickers = StickersStore.getStickersByGuildId(guild.id);
                return !stickers || stickers.length < getStickerSlots(guild);
            }

            const emojis = EmojiStore.getGuildEmoji(guild.id);
            let matchingSlotsUsed = 0;
            for (const emoji of emojis) {
                if (!emoji.managed && emoji.animated === expression.animated) matchingSlotsUsed++;
            }

            return matchingSlotsUsed < getEmojiSlots(guild);
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeProxyUrl(url: string) {
    if (url.startsWith("//")) return location.protocol + url;
    if (url.startsWith("http")) return url;
    return location.protocol + "//" + url;
}

function getStickerUrl(sticker: StickerLike, size: number) {
    return `${normalizeProxyUrl(window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT)}/stickers/${sticker.id}.${StickerExt[sticker.format_type]}?size=${size}&lossless=true&animated=true`;
}

function getEmojiUrl(emoji: StealableEmoji, size: number) {
    return `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/emojis/${emoji.id}.webp?size=${size}&lossless=true&animated=true`;
}

function getPreviewUrl(expression: StealableExpression) {
    if (expression.kind === "sticker") return getStickerUrl(expression.sticker, 160);
    return IconUtils.getEmojiURL({ id: expression.id, animated: expression.animated, size: 160 });
}

function getExpressionName(expression: StealableExpression) {
    return expression.kind === "sticker" ? expression.sticker.name : expression.name;
}

function getExpressionKindLabel(expression: StealableExpression) {
    return expression.kind === "sticker" ? "Sticker" : "Emoji";
}

function sanitizeEmojiName(name: string) {
    const cleaned = name
        .split("~")[0]
        .replace(/\W+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32);

    return cleaned.length >= 2 ? cleaned : "stolen_emoji";
}

function getDefaultName(expression: StealableExpression) {
    if (expression.kind === "emoji") return sanitizeEmojiName(expression.name);

    const trimmed = expression.sticker.name.trim().slice(0, 30);
    return trimmed.length >= 2 ? trimmed : "stolen_sticker";
}

function getNameError(expression: StealableExpression, name: string) {
    const trimmed = name.trim();
    if (expression.kind === "emoji") {
        if (!/^\w{2,32}$/i.test(trimmed)) return "Emoji names must be 2 to 32 characters and only use letters, numbers, or underscores.";
        return null;
    }

    if (trimmed.length < 2 || trimmed.length > 30) return "Sticker names must be 2 to 30 characters.";
    return null;
}

function isGifUrl(url?: string) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.pathname.endsWith(".gif") || parsed.searchParams.get("animated") === "true";
    } catch {
        return url.includes(".gif") || url.includes("animated=true");
    }
}

async function fetchSticker(id: string) {
    const cached = StickersStore.getStickerById(id) as GuildSticker | undefined;
    if (cached) return cached;

    const { body } = await RestAPI.get({
        url: Constants.Endpoints.STICKER(id),
    }) as { body: GuildSticker; };

    FluxDispatcher.dispatch({
        type: "STICKER_FETCH_SUCCESS",
        sticker: body,
    });

    return body;
}

async function fetchBlob(expression: StealableExpression) {
    const maxSize = expression.kind === "sticker" ? MAX_STICKER_SIZE_BYTES : MAX_EMOJI_SIZE_BYTES;

    for (let size = 4096; size >= 16; size /= 2) {
        const url = expression.kind === "sticker"
            ? getStickerUrl(expression.sticker, size)
            : getEmojiUrl(expression, size);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch asset: ${res.status}`);

        const blob = await res.blob();
        if (blob.size <= maxSize) return blob;
    }

    throw new Error(`Asset is larger than ${Math.round(maxSize / 1024)} KB.`);
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
    });
}

async function stealEmoji(guildId: string, emoji: StealableEmoji, name: string) {
    const blob = await fetchBlob(emoji);
    await uploadEmoji({
        guildId,
        name: name.trim(),
        image: await blobToDataUrl(blob),
    });
}

async function stealSticker(guildId: string, sticker: StickerLike, name: string) {
    const fullSticker = await fetchSticker(sticker.id);
    const data = new FormData();
    data.append("name", name.trim());
    data.append("tags", fullSticker.tags || sticker.tags || "🙂");
    data.append("description", fullSticker.description || sticker.description || "");
    data.append("file", await fetchBlob({ kind: "sticker", sticker: fullSticker }));

    const { body } = await RestAPI.post({
        url: Constants.Endpoints.GUILD_STICKER_PACKS(guildId),
        body: data,
    }) as { body: GuildSticker; };

    FluxDispatcher.dispatch({
        type: "GUILD_STICKERS_CREATE_SUCCESS",
        guildId,
        sticker: {
            ...body,
            user: UserStore.getCurrentUser(),
        },
    });
}

async function stealExpression(guildId: string, expression: StealableExpression, name: string) {
    if (expression.kind === "emoji") {
        await stealEmoji(guildId, expression, name);
        return;
    }

    await stealSticker(guildId, expression.sticker, name);
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === "object" && error && "text" in error) {
        try {
            const parsed = JSON.parse(String(error.text)) as { message?: string; };
            if (parsed.message) return parsed.message;
        } catch { }
    }
    return "Upload failed.";
}

function GuildIcon({ guild }: { guild: Guild; }) {
    if (guild.icon) {
        return (
            <img
                className="mse-guild-icon"
                src={IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, canAnimate: true, size: 80 })}
                alt=""
            />
        );
    }

    return <div className="mse-guild-fallback">{getGuildAcronym(guild)}</div>;
}

function ExpressionStealModal({ rootProps, expression }: { rootProps: ModalProps; expression: StealableExpression; }) {
    const [name, setName] = React.useState(getDefaultName(expression));
    const [query, setQuery] = React.useState("");
    const [selectedGuildId, setSelectedGuildId] = React.useState("");
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const guilds = React.useMemo(() => getGuildCandidates(expression), [expression]);
    const filteredGuilds = React.useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return guilds;
        return guilds.filter(guild => guild.name.toLowerCase().includes(q));
    }, [guilds, query]);

    const selectedGuild = guilds.find(guild => guild.id === selectedGuildId) ?? guilds[0];
    const nameError = getNameError(expression, name);
    const canSubmit = !saving && !nameError && selectedGuild;

    React.useEffect(() => {
        setSelectedGuildId(guilds[0]?.id ?? "");
    }, [guilds]);

    async function submit() {
        if (!canSubmit) return;

        setSaving(true);
        setError(null);
        try {
            await stealExpression(selectedGuild.id, expression, name);
            showToast(`Stole ${getExpressionKindLabel(expression).toLowerCase()} to ${selectedGuild.name}.`, Toasts.Type.SUCCESS);
            rootProps.onClose();
        } catch (e) {
            const message = getErrorMessage(e);
            logger.error("Failed to steal expression", e);
            setError(message);
            showToast("Failed to steal expression: " + message, Toasts.Type.FAILURE);
        } finally {
            setSaving(false);
        }
    }

    return (
        <ModalRoot {...rootProps} size={ModalSize.MEDIUM} className="mse-modal">
            <ModalHeader separator={false} className="mse-header">
                <div className="mse-title-row">
                    <img className="mse-preview" src={getPreviewUrl(expression)} alt="" />
                    <div>
                        <Forms.FormTitle tag="h4" className="mse-title">
                            Steal {getExpressionKindLabel(expression)}
                        </Forms.FormTitle>
                        <div className="mse-subtitle">{getExpressionName(expression)}</div>
                    </div>
                </div>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>

            <ModalContent className="mse-content">
                <label className="mse-field">
                    <span>Name</span>
                    <input
                        className="mse-input"
                        value={name}
                        maxLength={expression.kind === "emoji" ? 32 : 30}
                        autoFocus
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter") submit();
                        }}
                    />
                    {nameError && <div className="mse-error">{nameError}</div>}
                </label>

                <div className="mse-field">
                    <div className="mse-section-head">
                        <span>Server</span>
                        <span>{guilds.length} available</span>
                    </div>
                    <input
                        className="mse-input"
                        value={query}
                        placeholder="Search servers..."
                        onChange={e => setQuery(e.target.value)}
                    />
                </div>

                <div className="mse-guild-list">
                    {filteredGuilds.map(guild => (
                        <button
                            key={guild.id}
                            type="button"
                            className={classes("mse-guild-row", selectedGuild?.id === guild.id && "mse-guild-row-selected")}
                            onClick={() => setSelectedGuildId(guild.id)}
                        >
                            <GuildIcon guild={guild} />
                            <span className="mse-guild-name">{guild.name}</span>
                        </button>
                    ))}
                    {filteredGuilds.length === 0 && (
                        <div className="mse-empty">
                            No matching server with expression permission and free slots.
                        </div>
                    )}
                </div>

                {error && <div className="mse-error mse-error-box">{error}</div>}
            </ModalContent>

            <ModalFooter className="mse-footer">
                <Button variant="secondary" onClick={rootProps.onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={!canSubmit}>
                    {saving ? <><SpinnerIcon /> Stealing...</> : "Steal"}
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

function openStealModal(expression: StealableExpression) {
    openModal(props => <ExpressionStealModal rootProps={props} expression={expression} />);
}

function getMessageEmojis(message: Message) {
    const seen = new Set<string>();
    const emojis: StealableEmoji[] = [];

    for (const match of message.content.matchAll(CUSTOM_EMOJI_RE)) {
        const [, name, id] = match;
        if (seen.has(id)) continue;
        seen.add(id);
        emojis.push({
            kind: "emoji",
            animated: match[0].startsWith("<a:"),
            id,
            name,
        });
    }

    return emojis;
}

function getMessageStickers(message: Message): StealableSticker[] {
    return message.stickerItems
        .filter(sticker => sticker.format_type !== StickerFormatType.LOTTIE)
        .map(sticker => ({ kind: "sticker", sticker }) as StealableSticker);
}

function getExpressions(props: MessageContextProps): StealableExpression[] {
    const { message } = props;
    if (!message) return [];

    if (props.favoriteableId && props.favoriteableType === "emoji") {
        const emoji = getMessageEmojis(message).find(e => e.id === props.favoriteableId);
        return [{
            kind: "emoji",
            animated: emoji?.animated ?? isGifUrl(props.itemHref ?? props.itemSrc),
            id: props.favoriteableId,
            name: emoji?.name ?? "stolen_emoji",
        } satisfies StealableEmoji];
    }

    if (props.favoriteableId && props.favoriteableType === "sticker") {
        const sticker = message.stickerItems.find(s => s.id === props.favoriteableId);
        if (!sticker || sticker.format_type === StickerFormatType.LOTTIE) return [];
        return [{ kind: "sticker", sticker } satisfies StealableSticker];
    }

    return [...getMessageEmojis(message), ...getMessageStickers(message)];
}

function buildMenuLabel(expression: StealableExpression) {
    const name = getExpressionName(expression);
    return `Steal ${getExpressionKindLabel(expression).toLowerCase()}${name ? `: ${name}` : ""}`;
}

function buildMenuItem(expression: StealableExpression) {
    return (
        <Menu.MenuItem
            id={`moggcord-steal-expression-${expression.kind}-${expression.kind === "emoji" ? expression.id : expression.sticker.id}`}
            key={`moggcord-steal-expression-${expression.kind}-${expression.kind === "emoji" ? expression.id : expression.sticker.id}`}
            label={buildMenuLabel(expression)}
            icon={StealIcon}
            action={() => openStealModal(expression)}
        />
    );
}

const messageContextMenuPatch: NavContextMenuPatchCallback = (children, props: MessageContextProps) => {
    const expressions = getExpressions(props);
    if (!expressions.length) return;

    const item = expressions.length === 1
        ? buildMenuItem(expressions[0])
        : (
            <Menu.MenuItem
                id="moggcord-steal-expression"
                key="moggcord-steal-expression"
                label="Steal expression"
                icon={StealIcon}
            >
                {expressions.map(buildMenuItem)}
            </Menu.MenuItem>
        );

    const group = findGroupChildrenByChildId(["copy-link", "copy-message-link", "mark-unread"], children, true);
    if (group) {
        group.push(item);
        return;
    }

    children.push(<Menu.MenuGroup>{item}</Menu.MenuGroup>);
};

export default definePlugin({
    name: "ExpressionStealer",
    enabledByDefault: true,
    description: "Adds a right-click action to steal custom emojis and stickers into a server you can manage.",
    authors: [{ name: "Moggcord", id: 0n }],
    contextMenus: {
        "message": messageContextMenuPatch,
    },
});
