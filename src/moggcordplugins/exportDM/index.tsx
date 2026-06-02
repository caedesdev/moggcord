/*
 * Equicord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { Logger } from "@utils/Logger";
import { classes } from "@utils/misc";
import { ModalCloseButton, ModalContent, ModalHeader, ModalRoot, openModal } from "@utils/modal";
import definePlugin, { PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { Forms, IconUtils, React, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { t } from "../autoTranslateMoggcord";

const ChannelStore = findStoreLazy("ChannelStore");
const UserStore = findStoreLazy("UserStore");
const MessageStore = findStoreLazy("MessageStore");
const logger = new Logger("ExportDM");
const WATERMARK_URL = "https://moggcord.online";
const STICKER_EXT = ["", "png", "png", "json", "gif"] as const;
const Native = VencordNative.pluginHelpers.ExportDM as PluginNative<typeof import("./native")> | undefined;

function ExportIcon({ width = 20, height = 20 }: { width?: number; height?: number; }) {
    return (
        <svg aria-hidden="true" role="img" xmlns="http://www.w3.org/2000/svg" width={width} height={height} fill="none" viewBox="0 0 24 24">
            <path fill="currentColor" d="M13 16V5.41l3.3 3.3a1 1 0 1 0 1.4-1.42l-5-5a1 1 0 0 0-1.4 0l-5 5a1 1 0 0 0 1.4 1.42L11 5.4V16a1 1 0 1 0 2 0Z" />
            <path fill="currentColor" d="M4 15a1 1 0 0 1 1-1h2a1 1 0 1 0 0-2H5a3 3 0 0 0-3 3v4a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-4a3 3 0 0 0-3-3h-2a1 1 0 1 0 0 2h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4Z" />
        </svg>
    );
}

type ExportFormat = "txt" | "json" | "html" | "csv" | "md";

interface RichAttachment {
    url: string;
    proxyUrl?: string;
    filename: string;
    size: number;
    contentType: string;
    localPath?: string;
}

interface RichEmbed {
    title?: string;
    description?: string;
    url?: string;
    image?: string;
    type: string;
    localImagePath?: string;
}

interface RichMessage {
    id: string;
    timestamp: string;
    editedAt?: string;
    authorId: string;
    authorName: string;
    authorAvatar: string | null;
    content: string;
    authorAvatarLocalPath?: string;
    attachments: RichAttachment[];
    embeds: RichEmbed[];
    stickers: Array<{ name: string; id: string; formatType?: number; localPath?: string; }>;
    reactions: Array<{ emoji: string; count: number; }>;
    referencedMessage?: { id: string; authorName: string; content: string; };
    pinned: boolean;
    type: number;
    components: unknown[];
    deleted?: boolean;
}

interface ExportChannel {
    id: string;
    type: number;
    name: string;
    icon: string | null;
    recipientId?: string;
    avatar: string | null;
}

interface PrivateChannel {
    id: string;
    type: number;
    name?: string;
    icon?: string | null;
    recipients?: string[];
}

interface PreparedFile {
    path: string;
    content: string | Uint8Array;
}

interface PreparedChannelExport {
    name: string;
    files: PreparedFile[];
}

interface AssetStats {
    downloaded: number;
    failed: number;
    files: PreparedFile[];
}

function getToken(): string {
    try {
        const mod = (window as any).Vencord?.Webpack?.findByProps?.("getToken");
        return mod?.getToken?.() ?? "";
    } catch { return ""; }
}

async function getDeletedMessagesFromIDB(channelId: string): Promise<any[]> {
    try {
        const dbReq: IDBOpenDBRequest = indexedDB.open("MessageLoggerIDB", 1);
        const idb = await new Promise<IDBDatabase>((resolve, reject) => {
            dbReq.onsuccess = () => resolve(dbReq.result);
            dbReq.onerror = () => reject(dbReq.error);
            dbReq.onupgradeneeded = () => {
                dbReq.result.close();
                reject(new Error("DB not initialized"));
            };
        });

        const tx = idb.transaction("messages", "readonly");
        const store = tx.objectStore("messages");
        const index = store.index("by_channel_id");
        const req = index.getAll(channelId);

        const records: any[] = await new Promise((resolve, reject) => {
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        idb.close();
        return records.filter(r => r.status === "DELETED" || r.status === "GHOST_PINGED");
    } catch {
        return [];
    }
}

async function fetchAllMessages(channelId: string, token: string, onProgress: (n: number) => void): Promise<RichMessage[]> {
    const messageMap = new Map<string, RichMessage>();
    let beforeId: string | null = null;
    let count = 0;

    while (true) {
        const url = `https://discord.com/api/v9/channels/${channelId}/messages?limit=100${beforeId ? `&before=${beforeId}` : ""}`;
        const res = await fetch(url, { headers: { Authorization: token } });
        if (!res.ok) break;
        const batch: any[] = await res.json();
        if (!batch.length) break;

        for (const m of batch) {
            messageMap.set(m.id, {
                id: m.id,
                timestamp: m.timestamp,
                editedAt: m.edited_timestamp ?? undefined,
                authorId: m.author.id,
                authorName: m.author.global_name ?? m.author.username,
                authorAvatar: m.author.avatar ?? null,
                content: m.content ?? "",
                attachments: (m.attachments ?? []).map((a: any) => ({
                    url: a.url, proxyUrl: a.proxy_url, filename: a.filename, size: a.size,
                    contentType: a.content_type ?? "application/octet-stream",
                })),
                embeds: (m.embeds ?? []).map((e: any) => ({
                    title: e.title, description: e.description, url: e.url,
                    image: e.image?.url ?? e.thumbnail?.url, type: e.type ?? "rich",
                })),
                stickers: (m.sticker_items ?? []).map((s: any) => ({ name: s.name, id: s.id, formatType: s.format_type ?? s.formatType })),
                reactions: (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji.name ?? r.emoji.id, count: r.count })),
                referencedMessage: m.referenced_message ? {
                    id: m.referenced_message.id,
                    authorName: m.referenced_message.author?.username ?? "Unknown",
                    content: m.referenced_message.content?.slice(0, 100) ?? "",
                } : undefined,
                pinned: m.pinned ?? false,
                type: m.type ?? 0,
                components: m.components ?? [],
                deleted: false
            });
        }

        count += batch.length;
        onProgress(count);
        if (batch.length < 100) break;
        beforeId = batch[batch.length - 1].id;
        await new Promise(r => setTimeout(r, 250));
    }
    // Source 1: MessageStore cache (basic MessageLogger in memory only)
    try {
        const cached = MessageStore.getMessages?.(channelId);
        if (cached) {
            const raw = Array.isArray(cached) ? cached : (cached._array ?? (typeof cached.toArray === "function" ? cached.toArray() : Object.values(cached)));
            for (const m of raw) {
                if (m && (m.deleted || m.state === "DELETED" || m.mlDeleted)) {
                    messageMap.set(m.id, {
                        id: m.id,
                        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : (m.timestamp || new Date().toISOString()),
                        editedAt: m.editedTimestamp instanceof Date ? m.editedTimestamp.toISOString() : (m.editedTimestamp || m.edited_timestamp),
                        authorId: m.author?.id,
                        authorName: m.author?.globalName ?? m.author?.username ?? "Unknown",
                        authorAvatar: m.author?.avatar ?? null,
                        content: m.content ?? "",
                        attachments: (m.attachments ?? []).map((a: any) => ({
                            url: a.url, proxyUrl: a.proxy_url, filename: a.filename, size: a.size,
                            contentType: a.content_type ?? "application/octet-stream",
                        })),
                        embeds: (m.embeds ?? []).map((e: any) => ({
                            title: e.title, description: e.description, url: e.url,
                            image: e.image?.url ?? e.thumbnail?.url, type: e.type ?? "rich",
                        })),
                        stickers: (m.sticker_items ?? m.stickers ?? []).map((s: any) => ({ name: s.name, id: s.id, formatType: s.format_type ?? s.formatType })),
                        reactions: (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji?.name ?? r.emoji?.id, count: r.count })),
                        referencedMessage: m.messageReference ? {
                            id: m.messageReference.message_id || m.messageReference.id || "0",
                            authorName: "Unknown",
                            content: ""
                        } : undefined,
                        pinned: m.pinned ?? false,
                        type: m.type ?? 0,
                        components: m.components ?? [],
                        deleted: true
                    });
                }
            }
        }
    } catch (e) {
        logger.error("Error fetching cached messages:", e);
    }
    // Source 2: MessageLoggerEnhanced IndexedDB (persistent, works without being in the conversation)
    try {
        const idbRecords = await getDeletedMessagesFromIDB(channelId);
        for (const record of idbRecords) {
            const m = record.message;
            if (!m || messageMap.has(record.message_id)) continue;

            messageMap.set(record.message_id, {
                id: record.message_id,
                timestamp: m.timestamp ?? new Date().toISOString(),
                editedAt: m.edited_timestamp ?? undefined,
                authorId: m.author?.id ?? "0",
                authorName: m.author?.global_name ?? m.author?.globalName ?? m.author?.username ?? "Unknown",
                authorAvatar: m.author?.avatar ?? null,
                content: m.content ?? "",
                attachments: (m.attachments ?? []).map((a: any) => ({
                    url: a.url ?? a.oldUrl ?? "", proxyUrl: a.proxy_url ?? a.proxyUrl, filename: a.filename ?? "file", size: a.size ?? 0,
                    contentType: a.content_type ?? "application/octet-stream",
                })),
                embeds: (m.embeds ?? []).map((e: any) => ({
                    title: e.title, description: e.description, url: e.url,
                    image: e.image?.url ?? e.thumbnail?.url, type: e.type ?? "rich",
                })),
                stickers: (m.sticker_items ?? m.stickerItems ?? []).map((s: any) => ({ name: s.name, id: s.id, formatType: s.format_type ?? s.formatType })),
                reactions: (m.reactions ?? []).map((r: any) => ({ emoji: r.emoji?.name ?? r.emoji?.id, count: r.count })),
                referencedMessage: m.referenced_message ? {
                    id: m.referenced_message.id ?? m.referenced_message.message_id ?? "0",
                    authorName: m.referenced_message.author?.username ?? "Unknown",
                    content: (m.referenced_message.content ?? "").slice(0, 100),
                } : undefined,
                pinned: m.pinned ?? false,
                type: m.type ?? 0,
                components: m.components ?? [],
                deleted: true
            });
        }
    } catch (e) {
        logger.error("Error fetching deleted messages from IDB:", e);
    }

    return Array.from(messageMap.values()).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function getMediaType(url: string, ct: string): "image" | "video" | "audio" | "file" {
    if (ct.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url)) return "image";
    if (ct.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(url)) return "video";
    if (ct.startsWith("audio/") || /\.(mp3|ogg|wav|flac|m4a)(\?|$)/i.test(url)) return "audio";
    return "file";
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(value: string) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttr(value: string) {
    return escapeHtml(value).replace(/"/g, "&quot;");
}

function linkifyText(value: string) {
    const urlRe = /https?:\/\/[^\s<>"']+/g;
    let html = "";
    let lastIndex = 0;

    for (const match of value.matchAll(urlRe)) {
        const rawUrl = match[0];
        const index = match.index ?? 0;
        const url = rawUrl.replace(/[)\].,!?]+$/g, "");
        const trailing = rawUrl.slice(url.length);

        html += escapeHtml(value.slice(lastIndex, index));
        html += `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
        html += escapeHtml(trailing);
        lastIndex = index + rawUrl.length;
    }

    return `${html}${escapeHtml(value.slice(lastIndex))}`.replace(/\n/g, "<br>");
}

function safeFileName(name: string, fallback = "file") {
    const cleaned = name
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    return cleaned || fallback;
}

function uniqueName(original: string, usedNames: Map<string, number>) {
    const name = safeFileName(original);
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    if (count === 0) return name;

    const dot = name.lastIndexOf(".");
    return dot === -1
        ? `${name}_${count}`
        : `${name.slice(0, dot)}_${count}${name.slice(dot)}`;
}

function extensionFromUrl(url: string, fallback = "bin") {
    try {
        const ext = new URL(url).pathname.match(/\.([a-z0-9]{1,8})$/i)?.[1];
        if (ext) return ext.toLowerCase();
    } catch { }

    return fallback;
}

function withHttpsHost(host: string) {
    if (host.startsWith("http")) return host;
    if (host.startsWith("//")) return `https:${host}`;
    return `https://${host}`;
}

function getStickerUrl(sticker: RichMessage["stickers"][number]) {
    const formatType = sticker.formatType ?? 1;
    const ext = STICKER_EXT[formatType] ?? "png";
    const host = formatType === 4
        ? withHttpsHost(window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT)
        : withHttpsHost(window.GLOBAL_ENV.CDN_HOST);

    return `${host}/stickers/${sticker.id}.${ext}?size=512&lossless=true`;
}

function getMessageAvatarUrl(message: RichMessage) {
    const user = UserStore.getUser?.(message.authorId);
    if (user) return IconUtils.getUserAvatarURL(user, true, 64);
    return IconUtils.getDefaultAvatarURL(message.authorId);
}

async function getUniqueDirectory(parent: FileSystemDirectoryHandle, baseName: string) {
    const safeName = safeFileName(baseName, "Moggcord DM Export");

    for (let i = 0; i < 100; i++) {
        const name = i === 0 ? safeName : `${safeName}_${i}`;
        try {
            await parent.getDirectoryHandle(name);
        } catch {
            return parent.getDirectoryHandle(name, { create: true });
        }
    }

    return parent.getDirectoryHandle(`${safeName}_${Date.now()}`, { create: true });
}

async function getDirectory(parent: FileSystemDirectoryHandle, name: string) {
    return parent.getDirectoryHandle(name, { create: true });
}

async function getTargetDirectory(parent: FileSystemDirectoryHandle, path: string) {
    const parts = path.split("/");
    let dir = parent;

    for (const part of parts.slice(0, -1)) {
        dir = await getDirectory(dir, part);
    }

    return dir;
}

async function writePreparedFile(dir: FileSystemDirectoryHandle, file: PreparedFile) {
    const targetDir = await getTargetDirectory(dir, file.path);
    const filename = file.path.split("/").at(-1) ?? "file";
    const handle = await targetDir.getFileHandle(filename, { create: true });
    const writable = await handle.createWritable();

    try {
        await writable.write(file.content);
        await writable.close();
    } catch (e) {
        try {
            await writable.abort();
        } catch (abortError) {
            logger.warn("Failed to abort file write:", abortError);
        }
        throw e;
    }
}

async function downloadPreparedFile(path: string, url: string, filename: string, usedNames: Map<string, number>): Promise<PreparedFile> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const localName = uniqueName(filename, usedNames);
    return { path: `${path}/${localName}`, content: new Uint8Array(await res.arrayBuffer()) };
}

async function downloadAssets(messages: RichMessage[], onProgress: (progress: string) => void): Promise<AssetStats> {
    const usedAvatars = new Map<string, number>();
    const usedAttachments = new Map<string, number>();
    const usedEmbeds = new Map<string, number>();
    const usedStickers = new Map<string, number>();
    const avatarCache = new Map<string, string>();
    const files: PreparedFile[] = [];
    let downloaded = 0;
    let failed = 0;

    const total = new Set(messages.map(m => m.authorId)).size
        + messages.reduce((count, m) => count + m.attachments.length + m.embeds.filter(e => e.image).length + m.stickers.length, 0);

    const bump = () => onProgress(`${t("Downloading assets:")} ${downloaded + failed}/${total}`);

    for (const message of messages) {
        const cachedAvatar = avatarCache.get(message.authorId);
        if (cachedAvatar) {
            message.authorAvatarLocalPath = cachedAvatar;
            continue;
        }

        try {
            const avatarUrl = getMessageAvatarUrl(message);
            const ext = extensionFromUrl(avatarUrl, "webp");
            const file = await downloadPreparedFile("assets/avatars", avatarUrl, `${message.authorId}.${ext}`, usedAvatars);
            files.push(file);
            avatarCache.set(message.authorId, file.path);
            message.authorAvatarLocalPath = file.path;
            downloaded++;
        } catch (e) {
            logger.warn("Failed to download avatar:", e);
            failed++;
        }

        bump();
    }

    for (const message of messages) {
        for (const attachment of message.attachments) {
            try {
                const file = await downloadPreparedFile("assets/attachments", attachment.proxyUrl ?? attachment.url, attachment.filename, usedAttachments);
                files.push(file);
                attachment.localPath = file.path;
                downloaded++;
            } catch (e) {
                logger.warn("Failed to download attachment:", e);
                failed++;
            }

            bump();
        }

        for (let i = 0; i < message.embeds.length; i++) {
            const embed = message.embeds[i];
            if (!embed.image) continue;

            try {
                const ext = extensionFromUrl(embed.image, "png");
                const file = await downloadPreparedFile("assets/embeds", embed.image, `embed_${message.id}_${i}.${ext}`, usedEmbeds);
                files.push(file);
                embed.localImagePath = file.path;
                downloaded++;
            } catch (e) {
                logger.warn("Failed to download embed image:", e);
                failed++;
            }

            bump();
        }

        for (const sticker of message.stickers) {
            try {
                const url = getStickerUrl(sticker);
                const ext = STICKER_EXT[sticker.formatType ?? 1] ?? "png";
                const file = await downloadPreparedFile("assets/stickers", url, `sticker_${sticker.id}.${ext}`, usedStickers);
                files.push(file);
                sticker.localPath = file.path;
                downloaded++;
            } catch (e) {
                logger.warn("Failed to download sticker:", e);
                failed++;
            }

            bump();
        }
    }

    return { downloaded, failed, files };
}

function buildTxt(messages: RichMessage[], channelName: string): string {
    const lines = [`=== ${t("Export DMs")} - ${channelName} ===`, `${t("Exported on")} ${new Date().toLocaleString()}`, `${t("Total:")} ${messages.length} ${t("messages")}`, ""];
    for (const m of messages) {
        const d = new Date(m.timestamp).toLocaleString();
        if (m.referencedMessage) lines.push(`  > [${m.referencedMessage.authorName}]: ${m.referencedMessage.content}`);
        lines.push(`[${d}]${m.editedAt ? ` ${t("(edited)")}` : ""} ${m.authorName}: ${m.content}`);
        for (const a of m.attachments) lines.push(`  [${getMediaType(a.url, a.contentType).toUpperCase()}] ${a.filename} (${formatSize(a.size)}) - ${a.localPath ?? a.url}`);
        for (const e of m.embeds) { if (e.url) lines.push(`  [LINK] ${e.title ?? "Embed"}: ${e.url}`); }
        for (const s of m.stickers) lines.push(`  [STICKER] ${s.name}${s.localPath ? ` - ${s.localPath}` : ""}`);
        if (m.reactions.length) lines.push(`  ${m.reactions.map(r => `${r.emoji} x${r.count}`).join(" ")}`);
    }
    return lines.join("\n");
}

function buildJson(messages: RichMessage[], channelName: string): string {
    return JSON.stringify({ channel: channelName, exported: new Date().toISOString(), count: messages.length, messages }, null, 2);
}

function buildCsv(messages: RichMessage[]): string {
    const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["ID", "Timestamp", "EditedAt", "AuthorID", "AuthorName", "Content", "Attachments", "Embeds", "Stickers", "Reactions", "ReplyTo", "Pinned"]];
    for (const m of messages) {
        rows.push([m.id, m.timestamp, m.editedAt ?? "", m.authorId, m.authorName, m.content,
        m.attachments.map(a => a.localPath ?? a.url).join("|"), m.embeds.map(e => e.url ?? e.title ?? "").join("|"),
        m.stickers.map(s => s.localPath ?? s.name).join("|"), m.reactions.map(r => `${r.emoji}:${r.count}`).join("|"),
        m.referencedMessage?.id ?? "", m.pinned ? "yes" : "no"]);
    }
    return rows.map(r => r.map(esc).join(",")).join("\n");
}

function buildMd(messages: RichMessage[], channelName: string): string {
    const lines = [`# ${t("Export DMs")} - ${channelName}`, `> ${t("Exported on")} ${new Date().toLocaleString()} - **${messages.length} ${t("messages")}**`, ""];
    for (const m of messages) {
        const d = new Date(m.timestamp).toLocaleString();
        if (m.referencedMessage) lines.push(`> **${m.referencedMessage.authorName}**: ${m.referencedMessage.content}`);
        lines.push(`**${m.authorName}** - *${d}*${m.editedAt ? ` ${t("(edited)")}` : ""}${m.pinned ? ` ${t("[pinned]")}` : ""}`);
        if (m.content) lines.push(m.content);
        for (const a of m.attachments) lines.push(`[${a.filename}](${a.localPath ?? a.url}) *(${formatSize(a.size)})*`);
        for (const e of m.embeds) { if (e.url) lines.push(`[${e.title ?? "Link"}](${e.url})`); }
        for (const s of m.stickers) lines.push(s.localPath ? `*Sticker:* [${s.name}](${s.localPath})` : `*Sticker: ${s.name}*`);
        if (m.reactions.length) lines.push(m.reactions.map(r => `${r.emoji} \`${r.count}\``).join(" "));
        lines.push("");
    }
    return lines.join("\n");
}
function buildHtml(messages: RichMessage[], channelName: string): string {
    const exportedAt = new Date().toLocaleString();
    const headerAvatar = messages.find(m => m.authorName === channelName && m.authorAvatarLocalPath)?.authorAvatarLocalPath
        ?? messages.find(m => m.authorAvatarLocalPath)?.authorAvatarLocalPath;
    const headerInitial = escapeHtml(channelName[0]?.toUpperCase() ?? "D");
    const headerAvatarHtml = headerAvatar
        ? `<img class="dm-header-avatar" src="${escapeAttr(headerAvatar)}" alt="">`
        : `<div class="dm-header-avatar dm-avatar-fallback">${headerInitial}</div>`;

    const rows = messages.map(m => {
        const d = new Date(m.timestamp).toLocaleString();
        const edited = m.editedAt ? `<span class="edited">${t("(edited)")}</span>` : "";
        const pinned = m.pinned ? `<span class="pin">${t("[pinned]")}</span>` : "";
        const authorInitial = escapeHtml(m.authorName[0]?.toUpperCase() ?? "?");
        const avatarHtml = m.authorAvatarLocalPath
            ? `<img class="message-avatar" src="${escapeAttr(m.authorAvatarLocalPath)}" alt="">`
            : `<div class="message-avatar dm-avatar-fallback">${authorInitial}</div>`;
        const replyHtml = m.referencedMessage
            ? `<div class="reply"><span class="reply-line"></span><div><strong>${escapeHtml(m.referencedMessage.authorName)}</strong> ${linkifyText(m.referencedMessage.content)}</div></div>`
            : "";
        const content = m.content ? `<div class="message-content">${linkifyText(m.content)}</div>` : "";
        const mediaHtml = m.attachments.map(a => {
            const href = a.localPath ?? a.url;
            const safeHref = escapeAttr(href);
            const safeName = escapeHtml(a.filename);
            const type = getMediaType(a.url, a.contentType);
            const originalLink = href !== a.url
                ? `<a class="source-link" href="${escapeAttr(a.url)}" target="_blank" rel="noreferrer">Original</a>`
                : "";
            const caption = `<div class="media-caption"><a href="${safeHref}" target="_blank" rel="noreferrer">${safeName}</a><span>${formatSize(a.size)}</span>${originalLink}</div>`;

            if (type === "image") return `<div class="media-block"><a href="${safeHref}" target="_blank" rel="noreferrer"><img class="media-image" src="${safeHref}" alt="${escapeAttr(a.filename)}" loading="lazy"></a>${caption}</div>`;
            if (type === "video") return `<div class="media-block"><video class="media-video" src="${safeHref}" controls preload="metadata"></video>${caption}</div>`;
            if (type === "audio") return `<div class="media-block"><audio class="media-audio" src="${safeHref}" controls></audio>${caption}</div>`;

            return `<div class="file-attachment"><a href="${safeHref}" target="_blank" rel="noreferrer">${safeName}</a><span>${formatSize(a.size)}</span>${originalLink}</div>`;
        }).join("");
        const embedHtml = m.embeds.map(e => {
            const image = e.localImagePath ?? e.image;
            const title = e.title ?? e.url ?? "Embed";
            const titleHtml = e.url
                ? `<a class="embed-title" href="${escapeAttr(e.url)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
                : `<div class="embed-title">${escapeHtml(title)}</div>`;
            const descHtml = e.description ? `<div class="embed-desc">${linkifyText(e.description.slice(0, 500))}</div>` : "";
            const imageHtml = image ? `<a href="${escapeAttr(image)}" target="_blank" rel="noreferrer"><img class="embed-img" src="${escapeAttr(image)}" alt="" loading="lazy"></a>` : "";
            const urlHtml = e.url ? `<a class="embed-url" href="${escapeAttr(e.url)}" target="_blank" rel="noreferrer">${escapeHtml(e.url)}</a>` : "";

            return `<div class="embed">${titleHtml}${descHtml}${imageHtml}${urlHtml}</div>`;
        }).join("");
        const stickerHtml = m.stickers.map(s => {
            if (!s.localPath) return `<span class="sticker-name">${escapeHtml(s.name)}</span>`;
            if (s.formatType === 3) return `<div class="file-attachment"><a href="${escapeAttr(s.localPath)}" target="_blank" rel="noreferrer">${escapeHtml(s.name)}</a><span>Sticker</span></div>`;

            return `<a class="sticker" href="${escapeAttr(s.localPath)}" target="_blank" rel="noreferrer"><img class="sticker-img" src="${escapeAttr(s.localPath)}" alt="${escapeAttr(s.name)}" loading="lazy"><span>${escapeHtml(s.name)}</span></a>`;
        }).join("");
        const reactHtml = m.reactions.length
            ? `<div class="reactions">${m.reactions.map(r => `<span class="reaction">${escapeHtml(r.emoji)} ${r.count}</span>`).join("")}</div>`
            : "";
        const msgClass = m.deleted ? "message deleted" : "message";

        return `<article class="${msgClass}">${avatarHtml}<div class="message-main">${replyHtml}<div class="message-meta"><span class="author">${escapeHtml(m.authorName)}</span><time>${escapeHtml(d)}</time>${edited}${pinned}</div>${content}${mediaHtml}${embedHtml}${stickerHtml}${reactHtml}</div></article>`;
    }).join("");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(channelName)} - Moggcord DM Export</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050505;color:#dbdee1;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px}a{color:#00a8fc;text-decoration:none}a:hover{text-decoration:underline}.dm-shell{min-height:100vh;background:#050505}.dm-topbar{position:sticky;top:0;z-index:10;height:48px;border-bottom:1px solid #242529;background:#0b0c0f;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 16px}.dm-header-user{display:flex;align-items:center;gap:10px;min-width:0}.dm-header-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:0 0 auto}.dm-avatar-fallback{display:flex;align-items:center;justify-content:center;background:#5865f2;color:#fff;font-weight:700}.dm-title{font-weight:700;color:#f2f3f5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dm-subtitle{font-size:12px;color:#949ba4}.dm-actions{display:flex;align-items:center;gap:12px;color:#b5bac1}.dm-icon{width:20px;height:20px;opacity:.78}.watermark{display:flex;flex-direction:column;align-items:flex-end;gap:1px;padding:3px 8px;border:1px solid #2b2d31;border-radius:6px;background:#111214;color:#f2f3f5;line-height:1}.watermark strong{font-size:12px}.watermark span{font-size:10px;color:#00a8fc}.message-list{max-width:980px;margin:0 auto;padding:18px 14px 96px}.export-meta{padding:10px 0 22px;margin-left:56px;color:#949ba4;font-size:12px}.message{display:grid;grid-template-columns:40px minmax(0,1fr);gap:16px;padding:3px 8px 3px 0;border-radius:4px}.message:hover{background:#111214}.message.deleted{background:rgba(237,66,69,.12)}.message-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;position:sticky;top:58px}.message-main{min-width:0;padding-bottom:12px}.message-meta{display:flex;align-items:baseline;gap:8px;min-height:22px}.author{color:#f2f3f5;font-weight:700}.message-meta time,.edited,.pin{font-size:12px;color:#949ba4}.message-content{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;color:#dbdee1}.reply{display:flex;align-items:center;gap:8px;color:#b5bac1;font-size:13px;margin:0 0 4px}.reply-line{width:28px;height:16px;border-left:2px solid #4e5058;border-top:2px solid #4e5058;border-radius:8px 0 0 0;flex:0 0 auto}.media-block{margin:8px 0 2px;max-width:min(560px,100%)}.media-image,.media-video{display:block;max-width:100%;max-height:420px;border-radius:8px;border:1px solid #242529;background:#111214}.media-audio{width:min(420px,100%);display:block}.media-caption{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#949ba4;font-size:12px;margin-top:4px}.source-link{font-size:12px;color:#949ba4}.file-attachment{display:flex;align-items:center;gap:10px;flex-wrap:wrap;width:max-content;max-width:100%;margin:8px 0;padding:10px 12px;border:1px solid #2b2d31;border-radius:4px;background:#111214}.file-attachment span{color:#949ba4;font-size:12px}.embed{max-width:520px;margin:8px 0;padding:10px 12px;border-left:4px solid #5865f2;border-radius:4px;background:#111214}.embed-title{display:block;font-weight:700;color:#00a8fc;margin-bottom:5px}.embed-desc{white-space:pre-wrap;overflow-wrap:anywhere;color:#dbdee1;font-size:14px;line-height:1.4}.embed-img{display:block;max-width:100%;max-height:320px;border-radius:6px;margin-top:8px}.embed-url{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;margin-top:6px}.sticker{display:inline-flex;flex-direction:column;gap:4px;align-items:flex-start;margin:8px 8px 0 0;color:#b5bac1;font-size:12px}.sticker-img{display:block;max-width:160px;max-height:160px}.sticker-name{display:inline-block;margin:8px 6px 0 0;padding:4px 8px;border-radius:4px;background:#1f2024;color:#b5bac1;font-size:12px}.reactions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.reaction{border:1px solid #2b2d31;border-radius:8px;background:#111214;padding:2px 7px;font-size:12px;color:#dbdee1}.composer{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(960px,calc(100% - 28px));height:48px;background:#111214;border:1px solid #242529;border-radius:6px;display:flex;align-items:center;gap:12px;padding:0 14px;color:#6d7480}.composer-plus{font-size:28px;line-height:1;color:#949ba4}.composer-text{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media (max-width:640px){.dm-topbar{height:auto;min-height:52px;align-items:flex-start;gap:8px;padding:8px 10px}.dm-actions{gap:8px}.dm-icon{display:none}.watermark{padding:3px 6px}.message-list{padding:14px 8px 86px}.message{grid-template-columns:34px minmax(0,1fr);gap:10px}.message-avatar{width:34px;height:34px}.export-meta{margin-left:44px}.dm-subtitle{display:none}}
</style>
</head>
<body>
<main class="dm-shell">
<header class="dm-topbar">
<div class="dm-header-user">${headerAvatarHtml}<div><div class="dm-title">${escapeHtml(channelName)}</div><div class="dm-subtitle">${messages.length} ${t("messages")} - ${t("Exported on")} ${escapeHtml(exportedAt)}</div></div></div>
<div class="dm-actions"><svg class="dm-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7.6 10.8c1.5 3 3.6 5.1 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1.3.4 2.6.6 4 .6.7 0 1.2.5 1.2 1.2v3.5c0 .7-.5 1.2-1.2 1.2C9.7 21.4.6 12.3.6 1.2.6.5 1.1 0 1.8 0h3.5c.7 0 1.2.5 1.2 1.2 0 1.4.2 2.7.6 4 .1.4 0 .9-.3 1.2l-2.2 2.2Z"></path></svg><svg class="dm-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M4 5h10a3 3 0 0 1 3 3v1.2l4-2.4A1 1 0 0 1 22.5 8v8a1 1 0 0 1-1.5.9l-4-2.4V16a3 3 0 0 1-3 3H4a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"></path></svg><svg class="dm-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2a1 1 0 0 1 1 1v4.2l4.2 4.2a1 1 0 0 1-.7 1.7H13v8a1 1 0 1 1-2 0v-8H5.5a1 1 0 0 1-.7-1.7L9 7.2V3a1 1 0 0 1 1-1h4Z"></path></svg><a class="watermark" href="${WATERMARK_URL}" target="_blank" rel="noreferrer"><strong>Moggcord</strong><span>moggcord.online</span></a></div>
</header>
<section class="message-list">
<div class="export-meta">${t("Exported on")} ${escapeHtml(exportedAt)} - ${messages.length} ${t("messages")}</div>
${rows}
</section>
<div class="composer"><span class="composer-plus">+</span><div class="composer-text">Message @${escapeHtml(channelName)}</div></div>
</main>
</body>
</html>`;
}

function getFormatFile(format: ExportFormat, messages: RichMessage[], channelName: string): { filename: string; content: string; } | null {
    switch (format) {
        case "txt": return { filename: "messages.txt", content: buildTxt(messages, channelName) };
        case "md": return { filename: "messages.md", content: buildMd(messages, channelName) };
        case "csv": return { filename: "messages.csv", content: buildCsv(messages) };
        case "json": return null;
        case "html": return null;
    }
}

function buildReadme(channelName: string, messageCount: number, assetStats: { downloaded: number; failed: number; }) {
    return [
        "Moggcord DM Export",
        `Channel: ${channelName}`,
        `Exported: ${new Date().toLocaleString()}`,
        `Messages: ${messageCount}`,
        `Downloaded assets: ${assetStats.downloaded}`,
        `Failed assets: ${assetStats.failed}`,
        "Open index.html to view the Discord style export.",
        WATERMARK_URL,
    ].join("\n");
}
function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
            <path d="M21.71 20.29l-5.01-5.01A7.94 7.94 0 0 0 18 10a8 8 0 1 0-8 8 7.94 7.94 0 0 0 5.28-1.3l5.01 5.01a1 1 0 0 0 1.42-1.42ZM4 10a6 6 0 1 1 6 6 6 6 0 0 1-6-6Z" />
        </svg>
    );
}

type ExportDMModalProps = {
    rootProps: React.ComponentProps<typeof ModalRoot>;
};

function ExportDMModal({ rootProps }: ExportDMModalProps) {
    const [channels, setChannels] = useState<ExportChannel[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [format, setFormat] = useState<ExportFormat>("html");
    const [status, setStatus] = useState<"idle" | "fetching" | "done" | "error">("idle");
    const [progress, setProgress] = useState("");
    const [includeMedia, setIncludeMedia] = useState(true);
    const [includeEmbeds, setIncludeEmbeds] = useState(true);
    const [includeReactions, setIncludeReactions] = useState(true);
    const [search, setSearch] = useState("");

    useEffect(() => {
        try {
            const raw = ChannelStore.getSortedPrivateChannels?.() ?? {};
            const rawChannels = (Array.isArray(raw) ? raw : Object.values(raw)) as PrivateChannel[];
            const list = rawChannels
                .filter(c => c.type === 1 || c.type === 3)
                .map(c => {
                    let name = c.name ?? "";
                    let avatar: string | null = null;
                    let userId: string | undefined;
                    if (!name && c.type === 1 && c.recipients?.length) {
                        const user = UserStore.getUser?.(c.recipients[0]);
                        name = user?.globalName ?? user?.username ?? c.recipients[0];
                        avatar = user?.avatar ?? null;
                        userId = c.recipients[0];
                    }

                    return { id: c.id, type: c.type, name, icon: c.icon ?? null, recipientId: userId, avatar };
                });
            setChannels(list);
        } catch (e) {
            logger.error("Failed to load private channels:", e);
        }

        return () => undefined;
    }, []);

    async function doExport() {
        if (selected.size === 0) return;

        const token = getToken();
        if (!token) {
            setStatus("error");
            setProgress(t("Token not found"));
            showToast(t("Token not found"), Toasts.Type.FAILURE);
            return;
        }

        setStatus("fetching");
        const selectedChannels = channels.filter(c => selected.has(c.id));
        if (!selectedChannels.length) return;

        const date = new Date().toISOString().slice(0, 10);
        const rootName = selectedChannels.length === 1
            ? `Moggcord DM Folder - ${selectedChannels[0].name || "DM"} - ${date}`
            : `Moggcord DM Folder - ${date}`;
        const preparedExports: PreparedChannelExport[] = [];

        try {
            for (let i = 0; i < selectedChannels.length; i++) {
                const ch = selectedChannels[i];
                const channelName = ch.name || `DM ${ch.id.slice(-4)}`;
                const channelPrefix = `[${i + 1}/${selectedChannels.length}] ${channelName}: `;

                let msgs = await fetchAllMessages(ch.id, token, n => setProgress(`${channelPrefix}${t("Fetching:")} ${n} ${t("messages")}...`));
                if (!includeMedia) msgs = msgs.map(m => ({ ...m, attachments: [] }));
                if (!includeEmbeds) msgs = msgs.map(m => ({ ...m, embeds: [] }));
                if (!includeReactions) msgs = msgs.map(m => ({ ...m, reactions: [] }));

                setProgress(`${channelPrefix}${t("Downloading assets:")} 0`);
                const assetStats = await downloadAssets(msgs, p => setProgress(`${channelPrefix}${p}`));
                const formatFile = getFormatFile(format, msgs, channelName);
                const { files } = assetStats;

                files.push(
                    { path: "index.html", content: buildHtml(msgs, channelName) },
                    { path: "messages.json", content: buildJson(msgs, channelName) },
                    { path: "README.txt", content: buildReadme(channelName, msgs.length, assetStats) },
                );
                if (formatFile) files.push({ path: formatFile.filename, content: formatFile.content });

                preparedExports.push({ name: `${channelName} - ${ch.id.slice(-4)}`, files });
            }
        } catch (e) {
            logger.error("Failed to prepare DM export:", e);
            setStatus("error");
            setProgress(t("Export failed"));
            showToast(t("Export failed"), Toasts.Type.FAILURE);
            return;
        }

        setProgress(t("Choose where to save the finished folder"));

        if (Native?.saveExportFolder) {
            try {
                const result = await Native.saveExportFolder(rootName, preparedExports);
                if (result.canceled) {
                    setStatus("idle");
                    setProgress("");
                    showToast(t("Export cancelled"), Toasts.Type.MESSAGE);
                    return;
                }

                if (!result.ok) throw new Error(result.error ?? "Could not choose export folder");

                setStatus("done");
                setProgress(`${preparedExports.length} ${t("conversations exported")} - ${t("folder created")}`);
                showToast(t("DM export folder created"), Toasts.Type.SUCCESS);
                return;
            } catch (e) {
                logger.error("Failed to save DM export with native helper:", e);
                setStatus("error");
                setProgress(t("Could not choose export folder"));
                showToast(t("Could not choose export folder"), Toasts.Type.FAILURE);
                return;
            }
        }

        let parentDir: FileSystemDirectoryHandle;
        try {
            parentDir = await window.showDirectoryPicker({ mode: "readwrite" });
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
                setStatus("idle");
                setProgress("");
                showToast(t("Export cancelled"), Toasts.Type.MESSAGE);
                return;
            }

            logger.error("Failed to choose export folder:", e);
            setStatus("error");
            setProgress(t("Could not choose export folder"));
            showToast(t("Could not choose export folder"), Toasts.Type.FAILURE);
            return;
        }

        try {
            const rootDir = await getUniqueDirectory(parentDir, rootName);
            for (let i = 0; i < preparedExports.length; i++) {
                const prepared = preparedExports[i];
                const exportDir = preparedExports.length === 1
                    ? rootDir
                    : await getUniqueDirectory(rootDir, prepared.name);

                setProgress(`[${i + 1}/${preparedExports.length}] ${prepared.name}: ${t("Writing files")}...`);
                await Promise.all(prepared.files.map(file => writePreparedFile(exportDir, file)));
            }

            setStatus("done");
            setProgress(`${preparedExports.length} ${t("conversations exported")} - ${t("folder created")}`);
            showToast(t("DM export folder created"), Toasts.Type.SUCCESS);
        } catch (e) {
            logger.error("Failed to export DMs:", e);
            setStatus("error");
            setProgress(t("Export failed"));
            showToast(t("Export failed"), Toasts.Type.FAILURE);
        }
    }

    const toggleSelected = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
    };

    const FORMATS: Array<{ key: ExportFormat; label: string; desc: string; }> = [
        { key: "html", label: t("HTML"), desc: t("Web page with images/videos") },
        { key: "txt", label: t("TXT"), desc: t("Plain text") },
        { key: "md", label: t("MD"), desc: t("Markdown") },
        { key: "json", label: t("JSON"), desc: t("Full structured") },
        { key: "csv", label: t("CSV"), desc: t("Spreadsheet") },
    ];

    function getChAvatar(c: ExportChannel) {
        if (c.type === 1 && c.recipientId) {
            const user = UserStore.getUser?.(c.recipientId);
            if (user) return IconUtils.getUserAvatarURL(user, true, 32);
            return IconUtils.getDefaultAvatarURL(c.recipientId);
        }

        if (c.type === 3 && c.icon) return IconUtils.getChannelIconURL({ id: c.id, icon: c.icon });
        return null;
    }

    const query = search.trim().toLowerCase();
    const filtered = query
        ? channels.filter(c => c.name.toLowerCase().includes(query))
        : channels;

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#fff" }}>
                    <ExportIcon width={16} height={16} /> {t("Export DMs")}
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="edm-content">
                <div className="edm-search-bar">
                    <SearchIcon />
                    <input
                        className="edm-search-input"
                        type="text"
                        placeholder={t("Search for a friend or a DM...")}
                        value={search}
                        onChange={e => setSearch(e.currentTarget.value)}
                        autoFocus
                    />
                    {search && (
                        <button className="edm-search-clear" onClick={() => setSearch("")}>x</button>
                    )}
                </div>

                <Forms.FormTitle tag="h5" className="edm-label">{t("CHOOSE A CONVERSATION")}</Forms.FormTitle>
                <div className="edm-channel-list">
                    {filtered.length === 0 && (
                        <div className="edm-empty">
                            {search ? `${t("No results for")} "${search}"` : t("No DMs found")}
                        </div>
                    )}
                    {filtered.map(c => {
                        const av = getChAvatar(c);
                        const isSel = selected.has(c.id);
                        return (
                            <div key={c.id}
                                className={classes("edm-channel-row", isSel && "edm-channel-row--selected")}
                                onClick={() => toggleSelected(c.id)}>
                                {av
                                    ? <img src={av} className="edm-avatar" alt="" />
                                    : <div className="edm-avatar-placeholder">{c.type === 3 ? "G" : (c.name?.[0] ?? "?")}</div>
                                }
                                <span className="edm-channel-name">{c.name || `DM ${c.id.slice(-4)}`}</span>
                                {isSel && <span className="edm-check">OK</span>}
                            </div>
                        );
                    })}
                </div>

                <div className="edm-options-row">
                    <label className="edm-option">
                        <input type="checkbox" checked={includeMedia} onChange={e => setIncludeMedia(e.target.checked)} />
                        <span>{t("Images / Videos / Audio")}</span>
                    </label>
                    <label className="edm-option">
                        <input type="checkbox" checked={includeEmbeds} onChange={e => setIncludeEmbeds(e.target.checked)} />
                        <span>{t("Links / Embeds")}</span>
                    </label>
                    <label className="edm-option">
                        <input type="checkbox" checked={includeReactions} onChange={e => setIncludeReactions(e.target.checked)} />
                        <span>{t("Reactions")}</span>
                    </label>
                </div>

                <Forms.FormTitle tag="h5" className="edm-label">{t("EXPORT FORMAT")}</Forms.FormTitle>
                <div className="edm-format-row">
                    {FORMATS.map(f => (
                        <button key={f.key}
                            className={classes("edm-format-btn", format === f.key && "edm-format-btn--active")}
                            onClick={() => setFormat(f.key)}
                            title={f.desc}>
                            <span className="edm-fmt-key">{f.label}</span>
                            <span className="edm-fmt-desc">{f.desc}</span>
                        </button>
                    ))}
                </div>

                {status !== "idle" && (
                    <div className={classes("edm-status", `edm-status--${status}`)}>{progress}</div>
                )}

                <button className="edm-export-btn"
                    onClick={doExport}
                    disabled={selected.size === 0 || status === "fetching"}>
                    {status === "fetching" ? t("Exporting...") : t("Export")}
                </button>
            </ModalContent>
        </ModalRoot>
    );
}
function ExportButton() {
    return (
        <HeaderBarButton
            icon={ExportIcon}
            tooltip={t("Export DMs")}
            onClick={() => openModal(props => <ExportDMModal rootProps={props} />)}
        />
    );
}

export default definePlugin({
    name: "ExportDM",
    enabledByDefault: true,
    description: "Exports your DMs with messages, images, videos, audio, links, embeds, stickers, reactions in TXT/JSON/CSV/MD/HTML.",
    authors: [{ name: "Moggcord", id: 0n }],
    dependencies: ["HeaderBarAPI"],

    start() { addHeaderBarButton("moggcord-export-dm", () => <ExportButton />, 4); },
    stop() { removeHeaderBarButton("moggcord-export-dm"); },
});
