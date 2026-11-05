/*
 * Equicord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addContextMenuPatch, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import { ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, Guild, Role } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";
import { GuildMemberStore, GuildStore, IconUtils, Menu, React, RestAPI, SearchableSelect, Toasts, useMemo, useRef, UserStore, useState, useStateFromStores } from "@webpack/common";

const PermissionStore = findStoreLazy("PermissionStore");
const cl = classNameFactory("sc-");

const ADMIN_BIT = 0x8n;
const DELETE_DELAY_MS = 300;

const CLEANUP_MODES = [
    { id: "none", label: "Keep existing" },
    { id: "channels", label: "Delete channels" },
    { id: "roles", label: "Delete roles" },
    { id: "both", label: "Delete both" }
] as const;

type CleanupMode = (typeof CLEANUP_MODES)[number]["id"];
type CleanupRole = Pick<Role, "id" | "name" | "position" | "managed">;
type CleanupChannel = Pick<Channel, "id" | "name" | "type" | "guild_id">;

interface CleanupPlan {
    sourceId: string;
    targetId: string;
    targetName: string;
    mode: CleanupMode;
    roles: CleanupRole[];
    channels: CleanupChannel[];
    protectedRoles: number;
}

function getToken(): string {
    try {
        const mod = (window as any).Vencord?.Webpack?.findByProps?.("getToken");
        return mod?.getToken?.() ?? "";
    } catch { return ""; }
}

function hasAdmin(guildId: string): boolean {
    try {
        const guild = GuildStore.getGuild(guildId);
        if (!guild) return false;
        const me = UserStore.getCurrentUser();
        if (!me) return false;
        if (guild.ownerId === me.id) return true;
        const perms = PermissionStore.getGuildPermissions(guild);
        if (typeof perms === "bigint") return (perms & ADMIN_BIT) === ADMIN_BIT;
        return false;
    } catch {
        return false;
    }
}

async function apiCall(method: "get" | "post" | "patch" | "put" | "del", url: string, body?: any): Promise<any> {
    const opts: any = { url };
    if (body) opts.body = body;
    const res = await (RestAPI as any)[method](opts);
    if (!res.ok) {
        const msg = res.body?.message || res.text || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    return res?.body;
}

async function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface CloneOptions {
    roles: boolean;
    clearRoles: boolean;
    channels: boolean;
    noDeleteChannels: boolean;
    permissions: boolean;
    icon: boolean;
    emojis: boolean;
    embeds: boolean;
    guildSettings: boolean;
}

interface LogEntry { text: string; type: "ok" | "err" | "warn" | "info"; }

function cleanupMode(options: CloneOptions): CleanupMode {
    if (options.clearRoles) return options.noDeleteChannels ? "roles" : "both";
    return options.noDeleteChannels ? "none" : "channels";
}

function validateTarget(sourceId: string, targetId: string) {
    const guild = GuildStore.getGuild(targetId);
    if (!guild) throw new Error("Choose an available target server.");
    if (sourceId && sourceId === targetId) throw new Error("Source and target must be different servers.");
    if (!hasAdmin(targetId)) throw new Error("Administrator permission is required on the target server.");
    return guild;
}

async function prepareCleanup(sourceId: string, targetId: string, mode: CleanupMode): Promise<CleanupPlan> {
    const guild = validateTarget(sourceId, targetId);
    const plan: CleanupPlan = { sourceId, targetId, targetName: guild.name, mode, roles: [], channels: [], protectedRoles: 0 };
    if (mode === "channels" || mode === "both") {
        const channels: CleanupChannel[] = await apiCall("get", `/guilds/${targetId}/channels`);
        if (!Array.isArray(channels)) throw new Error("Could not load the target channels.");
        plan.channels = channels.filter(channel => !channel.guild_id || channel.guild_id === targetId);
    }
    if (mode === "roles" || mode === "both") {
        const roles: CleanupRole[] = await apiCall("get", `/guilds/${targetId}/roles`);
        if (!Array.isArray(roles)) throw new Error("Could not load the target roles.");
        const me = UserStore.getCurrentUser();
        const owner = me?.id === guild.ownerId;
        const member = me && GuildMemberStore.getMember(targetId, me.id);
        if (!owner && !member) throw new Error("Your target-server role information is not available. Reopen the server and try again.");
        const highestPosition = Math.max(0, ...roles.filter(role => member?.roles.includes(role.id)).map(role => role.position));
        plan.roles = roles.filter(role => role.id !== targetId && role.name !== "@everyone" && !role.managed && (owner || role.position < highestPosition));
        plan.protectedRoles = roles.length - plan.roles.length;
    }
    return plan;
}

async function executeCleanup(plan: CleanupPlan, log: (entry: LogEntry) => void, progress: (value: number) => void) {
    validateTarget(plan.sourceId, plan.targetId);
    const total = plan.channels.length + plan.roles.length;
    let completed = 0, channels = 0, roles = 0, failed = 0;
    for (const channel of plan.channels) {
        if (_cancelled) break;
        validateTarget(plan.sourceId, plan.targetId);
        try {
            await apiCall("del", `/channels/${channel.id}`);
            channels++;
            log({ text: `Deleted channel: ${channel.name}`, type: "ok" });
        } catch (error) {
            failed++;
            log({ text: `Could not delete channel ${channel.name}: ${error instanceof Error ? error.message : String(error)}`, type: "err" });
        }
        progress(Math.round(++completed / total * 100));
        await wait(DELETE_DELAY_MS);
    }
    for (const role of plan.roles) {
        if (_cancelled) break;
        validateTarget(plan.sourceId, plan.targetId);
        try {
            await apiCall("del", `/guilds/${plan.targetId}/roles/${role.id}`);
            roles++;
            log({ text: `Deleted role: ${role.name}`, type: "ok" });
        } catch (error) {
            failed++;
            log({ text: `Could not delete role ${role.name}: ${error instanceof Error ? error.message : String(error)}`, type: "err" });
        }
        progress(Math.round(++completed / total * 100));
        await wait(DELETE_DELAY_MS);
    }
    if (total === 0) progress(100);
    log({ text: `Target cleanup: ${channels} channels and ${roles} roles deleted; ${failed} failed; ${plan.protectedRoles} protected roles kept.`, type: failed || _cancelled ? "warn" : "info" });
    return { channels, roles, failed, cancelled: _cancelled };
}

function GuildIcon({ guild }: { guild: Guild; }) {
    const url = IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, size: 64, canAnimate: false });
    return url
        ? <img className={cl("server-icon")} src={url} alt="" loading="lazy" />
        : <span className={cl("server-icon", "server-initials")} aria-hidden="true">{Array.from(guild.name).slice(0, 2).join("").toUpperCase()}</span>;
}

function GuildSummary({ guildId, target = false }: { guildId: string; target?: boolean; }) {
    const guild = GuildStore.getGuild(guildId);
    if (!guild) return null;
    return <div className={cl("server-summary")}>
        <GuildIcon guild={guild} />
        <div className={cl("server-details")}><strong>{guild.name}</strong><span>{guild.id}</span></div>
        {target && <span className={cl("admin-tag")}>Admin</span>}
    </div>;
}

function CleanupConfirmation({ rootProps, plan, cloning, confirm }: { rootProps: ModalProps; plan: CleanupPlan; cloning: boolean; confirm: () => void; }) {
    const [name, setName] = useState("");
    return <ModalRoot {...rootProps} size={ModalSize.MEDIUM} aria-label="Confirm target cleanup">
        <ModalHeader separator={false}><Heading tag="h4">Clean up target server</Heading><ModalCloseButton onClick={rootProps.onClose} /></ModalHeader>
        <ModalContent className={cl("confirmation")}>
            <GuildSummary guildId={plan.targetId} target />
            <p>This permanently deletes {plan.channels.length} channels, including their messages, and {plan.roles.length} roles from the target server.</p>
            <p>{plan.protectedRoles} protected roles are kept. The source server is unchanged.</p>
            <label className={cl("confirmation-label")}>Type the target server name to confirm
                <input className={cl("confirmation-input")} value={name} onChange={event => setName(event.target.value)} placeholder={plan.targetName} autoComplete="off" autoFocus />
            </label>
        </ModalContent>
        <ModalFooter className={cl("confirmation-footer")}>
            <Button variant="dangerPrimary" disabled={name.trim() !== plan.targetName.trim()} onClick={confirm}>{cloning ? "Delete and start cloning" : "Delete selected content"}</Button>
            <Button variant="secondary" onClick={rootProps.onClose}>Cancel</Button>
        </ModalFooter>
    </ModalRoot>;
}

function confirmCleanup(plan: CleanupPlan, cloning: boolean): Promise<boolean> {
    return new Promise(resolve => openModal(props => <CleanupConfirmation rootProps={props} plan={plan} cloning={cloning} confirm={() => { resolve(true); props.onClose(); }} />, { onCloseCallback: () => resolve(false) }));
}

// ── Persistent state (survives component unmount/remount) ────────────────
let _running = false;
let _operation: "clone" | "cleanup" = "clone";
let _cancelled = false;
let _progress = 0;
let _logs: LogEntry[] = [];
const _listeners = new Set<() => void>();

function notifyListeners() { _listeners.forEach(fn => fn()); }

function persistLog(entry: LogEntry) {
    _logs = [..._logs, entry];
    notifyListeners();
}
function persistProgress(p: number) {
    _progress = p;
    notifyListeners();
}
function persistRunning(v: boolean) {
    _running = v;
    notifyListeners();
}
function cancelClone() {
    _cancelled = true;
}

// ── Clone Engine ─────────────────────────────────────────────────────────

async function cloneServer(
    sourceId: string,
    targetId: string,
    options: CloneOptions,
    log: (entry: LogEntry) => void,
    setProgress: (p: number) => void,
    preparedCleanup?: CleanupPlan,
) {
    _cancelled = false;
    const token = getToken();
    if (!token) { log({ text: "Token not found!", type: "err" }); return; }

    const mode = cleanupMode(options);
    validateTarget(sourceId, targetId);
    if (mode !== "none" && (!preparedCleanup || preparedCleanup.sourceId !== sourceId || preparedCleanup.targetId !== targetId || preparedCleanup.mode !== mode)) {
        throw new Error("Confirm the selected target cleanup before cloning.");
    }
    const steps: string[] = [];
    if (mode !== "none") steps.push("cleanup");
    if (options.guildSettings) steps.push("settings");
    if (options.icon) steps.push("icon");
    if (options.roles) steps.push("roles");
    if (options.channels) steps.push("channels");
    if (options.emojis) steps.push("emojis");
    if (options.embeds) steps.push("embeds");
    const totalSteps = steps.length;
    let currentStep = 0;

    function advance(stepName: string) {
        currentStep++;
        setProgress(Math.round((currentStep / totalSteps) * 100));
        log({ text: `── ${stepName} finished (${currentStep}/${totalSteps})`, type: "info" });
    }

    function isCancelled() {
        if (_cancelled) {
            log({ text: "═══ Cloning cancelled! ═══", type: "warn" });
            return true;
        }
        return false;
    }

    const sourceGuild = GuildStore.getGuild(sourceId);
    if (!sourceGuild) { log({ text: "Source server not found", type: "err" }); return; }

    if (mode !== "none" && preparedCleanup) {
        const result = await executeCleanup(preparedCleanup, log, value => setProgress(Math.round(value / totalSteps)));
        if (result.cancelled || result.failed) {
            log({ text: "Cloning stopped because target cleanup did not finish successfully.", type: "warn" });
            return;
        }
        advance("Target cleanup");
    }

    log({ text: `Cloning of "${sourceGuild.name}" → target server...`, type: "info" });

    // ── Guild Settings ──────────────────────────────────────────────
    if (options.guildSettings && !isCancelled()) {
        try {
            log({ text: "Copying server settings...", type: "info" });
            const patch: any = {};
            if (sourceGuild.name) patch.name = sourceGuild.name;
            if (sourceGuild.description) patch.description = sourceGuild.description;
            if (sourceGuild.verificationLevel != null) patch.verification_level = sourceGuild.verificationLevel;
            if (sourceGuild.defaultMessageNotifications != null) patch.default_message_notifications = sourceGuild.defaultMessageNotifications;
            if (sourceGuild.explicitContentFilter != null) patch.explicit_content_filter = sourceGuild.explicitContentFilter;
            if (sourceGuild.afkTimeout != null) patch.afk_timeout = sourceGuild.afkTimeout;

            if (Object.keys(patch).length) {
                await apiCall("patch", `/guilds/${targetId}`, patch);
                log({ text: "Settings copied (name, description, etc.)", type: "ok" });
            }
        } catch (e: any) {
            log({ text: `Settings error: ${e?.message || e}`, type: "err" });
        }
        await wait(500);
        advance("Settings");
    }

    // ── Icon ────────────────────────────────────────────────────────
    if (options.icon && sourceGuild.icon && !isCancelled()) {
        try {
            log({ text: "Copying server icon...", type: "info" });
            const iconUrl = `https://cdn.discordapp.com/icons/${sourceId}/${sourceGuild.icon}.png?size=512`;
            const resp = await fetch(iconUrl);
            const blob = await resp.blob();
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
            await apiCall("patch", `/guilds/${targetId}`, { icon: base64 });
            log({ text: "Icon copied", type: "ok" });
        } catch (e: any) {
            log({ text: `Icon error: ${e?.message || e}`, type: "err" });
        }
        await wait(500);
        advance("Icon");
    } else if (options.icon) {
        advance("Icon");
    }

    // ── Roles ───────────────────────────────────────────────────────
    const roleMapping = new Map<string, string>();
    if (options.roles && !isCancelled()) {
        try {
            log({ text: "Copying roles...", type: "info" });
            const sourceRoles: any[] = await apiCall("get", `/guilds/${sourceId}/roles`);

            const sorted = sourceRoles.filter(r => r.name !== "@everyone").sort((a, b) => b.position - a.position);

            const everyoneSource = sourceRoles.find(r => r.name === "@everyone");
            const updatedTargetRoles: any[] = await apiCall("get", `/guilds/${targetId}/roles`);
            const everyoneTarget = updatedTargetRoles.find(r => r.name === "@everyone");
            if (everyoneSource && everyoneTarget) {
                roleMapping.set(everyoneSource.id, everyoneTarget.id);
                if (options.permissions) {
                    try {
                        await apiCall("patch", `/guilds/${targetId}/roles/${everyoneTarget.id}`, {
                            permissions: String(everyoneSource.permissions),
                        });
                    } catch { /* ignore */ }
                }
            }

            const positions: Array<{ id: string; position: number; }> = [];
            for (const role of sorted) {
                try {
                    const body: any = {
                        name: role.name, color: role.color,
                        hoist: role.hoist, mentionable: role.mentionable,
                    };
                    if (options.permissions && role.permissions != null) body.permissions = String(role.permissions);
                    const created = await apiCall("post", `/guilds/${targetId}/roles`, body);
                    roleMapping.set(role.id, created.id);
                    positions.push({ id: created.id, position: role.position });
                    log({ text: `  Role created: ${role.name}`, type: "ok" });
                    await wait(300);
                } catch (e: any) {
                    log({ text: `  Role error "${role.name}": ${e?.message || e}`, type: "err" });
                }
            }
            if (positions.length) {
                try {
                    await apiCall("patch", `/guilds/${targetId}/roles`, positions);
                    log({ text: `  Role positions reordered automatically`, type: "info" });
                } catch (e: any) {
                    log({ text: `  Failed to patch positions: ${e?.message || e}`, type: "warn" });
                }
            }
            log({ text: `${sorted.length} roles processed`, type: "ok" });
        } catch (e: any) {
            log({ text: `Roles error: ${e?.message || e}`, type: "err" });
        }
        await wait(500);
        advance("Roles");
    }

    // ── Channels ────────────────────────────────────────────────────
    const channelMapping = new Map<string, string>();
    if (options.channels && !isCancelled()) {
        try {
            log({ text: "Copying channels...", type: "info" });
            const sourceChannels: any[] = await apiCall("get", `/guilds/${sourceId}/channels`);
            const categories = sourceChannels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
            const nonCategories = sourceChannels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);

            for (const cat of categories) {
                if (_cancelled) break;
                try {
                    const body: any = { name: cat.name, type: 4, position: cat.position };
                    if (options.permissions && cat.permission_overwrites?.length)
                        body.permission_overwrites = mapPermOverwrites(cat.permission_overwrites, roleMapping);
                    const created = await apiCall("post", `/guilds/${targetId}/channels`, body);
                    channelMapping.set(cat.id, created.id);
                    log({ text: `  Category created: ${cat.name}`, type: "ok" });
                    await wait(500);
                } catch (e: any) {
                    log({ text: `  Category error "${cat.name}": ${e?.message || JSON.stringify(e)}`, type: "err" });
                }
            }

            for (const ch of nonCategories) {
                if (_cancelled) break;
                try {
                    const body: any = {
                        name: ch.name, type: ch.type, position: ch.position,
                        topic: ch.topic ?? undefined, nsfw: ch.nsfw ?? false,
                        bitrate: ch.bitrate ?? undefined, user_limit: ch.user_limit ?? undefined,
                        rate_limit_per_user: ch.rate_limit_per_user ?? undefined,
                    };
                    if (ch.parent_id && channelMapping.has(ch.parent_id))
                        body.parent_id = channelMapping.get(ch.parent_id);
                    if (options.permissions && ch.permission_overwrites?.length)
                        body.permission_overwrites = mapPermOverwrites(ch.permission_overwrites, roleMapping);
                    const created = await apiCall("post", `/guilds/${targetId}/channels`, body);
                    channelMapping.set(ch.id, created.id);
                    log({ text: `  Channel created: #${ch.name} (type ${ch.type})`, type: "ok" });
                    await wait(500);
                } catch (e: any) {
                    log({ text: `  Channel error "${ch.name}": ${e?.message || JSON.stringify(e)}`, type: "err" });
                }
            }
            log({ text: `${categories.length + nonCategories.length} channels processed`, type: "ok" });
        } catch (e: any) {
            log({ text: `Channels error: ${e?.message || e}`, type: "err" });
        }
        await wait(500);
        advance("Channels");
    }

    // ── Emojis ──────────────────────────────────────────────────────
    if (options.emojis && !isCancelled()) {
        try {
            log({ text: "Copying emojis...", type: "info" });
            const sourceEmojis: any[] = await apiCall("get", `/guilds/${sourceId}/emojis`);
            let count = 0;
            for (const emoji of sourceEmojis) {
                if (_cancelled) break;
                try {
                    const ext = emoji.animated ? "gif" : "png";
                    const emojiUrl = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}?size=128`;
                    const resp = await fetch(emojiUrl);
                    const blob = await resp.blob();
                    const base64 = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                    });
                    await apiCall("post", `/guilds/${targetId}/emojis`, { name: emoji.name, image: base64, roles: [] });
                    count++;
                    log({ text: `  Emoji copied: ${emoji.name} (${count}/${sourceEmojis.length})`, type: "ok" });
                    await wait(3000);
                } catch (e: any) {
                    log({ text: `  Emoji error "${emoji.name}": ${e?.message || e}`, type: "err" });
                }
            }
            log({ text: `${count}/${sourceEmojis.length} emojis copied`, type: "ok" });
        } catch (e: any) {
            log({ text: `Emojis error: ${e?.message || e}`, type: "err" });
        }
        await wait(500);
        advance("Emojis");
    }

    // ── Embeds ──────────────────────────────────────────────────────
    if (options.embeds && options.channels && !isCancelled()) {
        try {
            log({ text: "Copying bot embeds...", type: "info" });
            let embedCount = 0;
            for (const [sourceChId, targetChId] of channelMapping.entries()) {
                if (_cancelled) break;
                
                // Skip categories (they don't have messages)
                const sourceCh = sourceChannels.find(c => c.id === sourceChId);
                if (sourceCh?.type === 4) continue;

                try {
                    const messages: any[] = await apiCall("get", `/channels/${sourceChId}/messages?limit=100`);
                    if (!messages?.length) continue;
                    const botEmbedMsgs = messages.filter(m => m.author?.bot && m.embeds?.length > 0);
                    if (!botEmbedMsgs.length) continue;

                    log({ text: `  Channel ${sourceChId}: ${botEmbedMsgs.length} messages with embeds`, type: "info" });

                    let webhook: any;
                    try {
                        webhook = await apiCall("post", `/channels/${targetChId}/webhooks`, {
                            name: "ServerCloner",
                            enabledByDefault: true
                        });
                    } catch (e: any) {
                        log({ text: `  Webhook creation error for channel ${targetChId}: ${e?.message || e}`, type: "err" });
                        continue;
                    }

                    for (const msg of botEmbedMsgs) {
                        if (_cancelled) break;
                        try {
                            const cleanEmbeds = msg.embeds
                                .filter((e: any) => e.type === "rich" || e.title || e.description || e.fields?.length)
                                .map((e: any) => {
                                    const embed: any = {};
                                    if (e.title) embed.title = e.title;
                                    if (e.description) embed.description = e.description;
                                    if (e.url) embed.url = e.url;
                                    if (e.color != null) embed.color = e.color;
                                    if (e.timestamp) embed.timestamp = e.timestamp;
                                    if (e.footer?.text) embed.footer = { text: e.footer.text, icon_url: e.footer.icon_url };
                                    if (e.author?.name) embed.author = { name: e.author.name, url: e.author.url, icon_url: e.author.icon_url };
                                    if (e.thumbnail?.url) embed.thumbnail = { url: e.thumbnail.url };
                                    if (e.image?.url) embed.image = { url: e.image.url };
                                    if (e.fields?.length) embed.fields = e.fields.map((f: any) => ({
                                        name: f.name || "\u200b", value: f.value || "\u200b", inline: f.inline ?? false,
                                    }));
                                    return embed;
                                });

                            if (!cleanEmbeds.length) continue;

                            const webhookBody: any = {
                                username: msg.author.username,
                                embeds: cleanEmbeds,
                            };
                            if (msg.author.avatar) {
                                webhookBody.avatar_url = `https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`;
                            }
                            if (msg.content) webhookBody.content = msg.content;

                            const resp = await fetch(`https://discord.com/api/v9/webhooks/${webhook.id}/${webhook.token}?wait=true`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(webhookBody),
                            });
                            if (resp.ok) {
                                embedCount++;
                            } else {
                                const errText = await resp.text().catch(() => "?");
                                log({ text: `  Webhook error (${resp.status}): ${errText.slice(0, 200)}`, type: "err" });
                            }
                            await wait(800);
                        } catch (e: any) {
                            log({ text: `  Embed send error: ${e?.message || e}`, type: "err" });
                        }
                    }
                    try { await apiCall("del", `/webhooks/${webhook.id}`); } catch { /* ignore */ }
                    await wait(300);
                } catch (e: any) {
                    log({ text: `  Channel read error ${sourceChId}: ${e?.message || JSON.stringify(e)}`, type: "err" });
                }
            }
            log({ text: `${embedCount} embed messages copied`, type: "ok" });
        } catch (e: any) {
            log({ text: `Embeds error: ${e?.message || e}`, type: "err" });
        }
        advance("Embeds");
    } else if (options.embeds) {
        log({ text: "Embeds skipped (requires channel copy)", type: "warn" });
        advance("Embeds");
    }

    setProgress(100);
    if (_cancelled) {
        log({ text: "═══ Cloning cancelled! ═══", type: "warn" });
        Toasts.show({ message: "Cloning cancelled.", type: Toasts.Type.FAILURE, id: Toasts.genId() });
    } else {
        log({ text: "═══ Cloning finished! ═══", type: "info" });
        Toasts.show({ message: "Server cloning finished!", type: Toasts.Type.SUCCESS, id: Toasts.genId() });
    }
}

function mapPermOverwrites(overwrites: any[], roleMapping: Map<string, string>): any[] {
    return overwrites
        .filter(ow => roleMapping.has(ow.id))
        .map(ow => ({
            id: roleMapping.get(ow.id)!,
            type: ow.type,
            allow: String(ow.allow),
            deny: String(ow.deny),
        }));
}

// ── Settings Component (inline, no modal) ───────────────────────────────

function ServerClonerUI({ initialSourceId = "" }: { initialSourceId?: string; }) {
    const [sourceId, setSourceId] = useState(initialSourceId);
    const [targetId, setTargetId] = useState("");
    const [opts, setOpts] = useState<CloneOptions>({
        roles: true, clearRoles: false, channels: true, noDeleteChannels: true, permissions: true,
        icon: true, emojis: true, embeds: true, guildSettings: true,
    });
    const [preparing, setPreparing] = useState(false);
    const cleanupGroupId = React.useId();
    const preparingRef = useRef(false);
    const [, forceUpdate] = useState(0);
    const logRef = useRef<HTMLDivElement>(null);

    // Subscribe to persistent state changes
    React.useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        _listeners.add(listener);
        return () => { _listeners.delete(listener); };
    }, []);

    // Auto-scroll logs
    React.useEffect(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, [_logs.length]);

    const guilds = useStateFromStores([GuildStore, PermissionStore, UserStore], () =>
        Object.values(GuildStore.getGuilds()).sort((a, b) => a.name.localeCompare(b.name)));
    const allGuilds = useMemo(() => guilds.map(guild => ({ label: guild.name, value: guild.id })), [guilds]);
    const adminGuilds = allGuilds.filter(guild => guild.value !== sourceId && hasAdmin(guild.value));
    const busy = preparing || _running;
    const mode = cleanupMode(opts);
    const validTarget = Boolean(targetId && targetId !== sourceId && hasAdmin(targetId));
    const hasCloneWork = opts.guildSettings || opts.icon || opts.roles || opts.channels || opts.emojis;

    async function runOperation(onlyCleanup: boolean) {
        if (_running || preparingRef.current || (!onlyCleanup && !sourceId) || (onlyCleanup && mode === "none")) return;
        preparingRef.current = true;
        setPreparing(true);
        let started = false;
        try {
            validateTarget(sourceId, targetId);
            const plan = mode === "none" ? undefined : await prepareCleanup(sourceId, targetId, mode);
            if (plan && plan.channels.length + plan.roles.length > 0 && !await confirmCleanup(plan, !onlyCleanup)) return;
            if (_running) throw new Error("Another server operation is already running.");
            validateTarget(sourceId, targetId);
            _cancelled = false;
            _progress = 0;
            _logs = [];
            _operation = onlyCleanup ? "cleanup" : "clone";
            started = true;
            persistRunning(true);
            if (onlyCleanup && plan) {
                const result = await executeCleanup(plan, persistLog, persistProgress);
                const success = !result.cancelled && result.failed === 0;
                persistLog({ text: result.cancelled ? "Target cleanup cancelled." : success ? "Target cleanup finished." : "Target cleanup finished with errors.", type: success ? "ok" : "warn" });
            } else {
                await cloneServer(sourceId, targetId, opts, persistLog, persistProgress, plan);
            }
        } catch (error) {
            persistLog({ text: error instanceof Error ? error.message : String(error), type: "err" });
        } finally {
            if (started) persistRunning(false);
            preparingRef.current = false;
            setPreparing(false);
        }
    }

    function stopClone() {
        cancelClone();
        persistLog({ text: "Cancellation requested...", type: "warn" });
    }

    const switchOptions: Array<{ key: keyof CloneOptions; label: string; }> = [
        { key: "guildSettings", label: "Server settings" },
        { key: "icon", label: "Icon" },
        { key: "roles", label: "Roles" },
        { key: "channels", label: "Channels" },
        { key: "permissions", label: "Permissions" },
        { key: "emojis", label: "Emojis" },
        { key: "embeds", label: "Bot embeds" },
    ];

    return <div className={cl("editor")}>
        <div className={cl("server-grid")}>
            <section className={cl("server-card")}>
                <Heading className={cl("section-title")}>Source server</Heading>
                <SearchableSelect options={allGuilds} value={sourceId || undefined} placeholder="Search server name or ID..."
                    maxVisibleItems={6} closeOnSelect clearable isDisabled={busy}
                    onChange={value => {
                        const id = typeof value === "string" ? value : "";
                        setSourceId(id);
                        if (id === targetId) setTargetId("");
                    }}
                    filter={(options, query) => options.filter(option => String(option.label).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || String(option.value).includes(query.trim()))}
                    renderOptionPrefix={option => {
                        const guild = GuildStore.getGuild(String(option.value));
                        return guild ? <GuildIcon guild={guild} /> : null;
                    }}
                />
                <GuildSummary guildId={sourceId} />
            </section>
            <section className={cl("server-card")}>
                <Heading className={cl("section-title")}>Target server <span className={cl("admin-tag")}>Admin required</span></Heading>
                <SearchableSelect options={adminGuilds} value={validTarget ? targetId : undefined} placeholder="Search your admin servers..."
                    maxVisibleItems={6} closeOnSelect clearable isDisabled={busy || adminGuilds.length === 0}
                    onChange={value => setTargetId(typeof value === "string" ? value : "")}
                    filter={(options, query) => options.filter(option => String(option.label).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) || String(option.value).includes(query.trim()))}
                    renderOptionPrefix={option => {
                        const guild = GuildStore.getGuild(String(option.value));
                        return guild ? <GuildIcon guild={guild} /> : null;
                    }}
                />
                {validTarget ? <GuildSummary guildId={targetId} target /> : <p className={cl("hint")}>{adminGuilds.length ? "Choose a different server where you have Administrator permission." : "No other server with Administrator permission found."}</p>}
            </section>
        </div>
        <Divider />
        <section>
            <Heading className={cl("section-title")}>Target cleanup</Heading>
            <div className={cl("cleanup-modes")}>
                {CLEANUP_MODES.map(item => <label key={item.id} className={cl("cleanup-mode")}>
                    <input type="radio" name={cleanupGroupId} value={item.id} checked={mode === item.id} disabled={busy}
                        onChange={() => setOpts(previous => ({ ...previous, clearRoles: item.id === "roles" || item.id === "both", noDeleteChannels: item.id === "none" || item.id === "roles" }))} />
                    <span>{item.label}</span>
                </label>)}
            </div>
            <p className={cl("hint")}>{mode === "none" ? "Existing channels and roles are kept." : "Runs before cloning. Use Clean up only to prepare the target without copying. Protected roles are kept."}</p>
        </section>
        <section>
            <Heading className={cl("section-title")}>Cloning options</Heading>
            <div className={cl("options")}>
                {switchOptions.map(option => <FormSwitch key={option.key} title={option.label} value={opts[option.key]}
                    onChange={value => setOpts(previous => ({ ...previous, [option.key]: value }))} disabled={busy} hideBorder />)}
            </div>
        </section>
        <Divider />
        <div className={cl("actions")}>
            <Button variant="primary" disabled={!sourceId || !validTarget || busy || !hasCloneWork} onClick={() => runOperation(false)} className={cl("start")}>
                {_running ? (_operation === "cleanup" ? "Cleaning target..." : "Cloning in progress...") : preparing ? "Preparing..." : "Start cloning"}
            </Button>
            {!_running && <Button variant="dangerSecondary" disabled={!validTarget || mode === "none" || busy} onClick={() => runOperation(true)}>Clean up only</Button>}
            {_running && <Button variant="dangerPrimary" onClick={stopClone}>Stop</Button>}
        </div>
        {_running && <div className={cl("progress-bar")}><div className={cl("progress-fill")} style={{ width: `${_progress}%` }} /></div>}
        {_logs.length > 0 && <div className={cl("log-area")} ref={logRef}>
            {_logs.map((entry, index) => <div key={index} className={cl(`log-${entry.type}`)}>{entry.text}</div>)}
        </div>}
    </div>;
}

// ── Modal & Context Menu ────────────────────────────────────────────────

function ServerClonerModal({ rootProps, guildId }: { rootProps: any; guildId: string }) {
    return (
        <ModalRoot {...rootProps} size={ModalSize.LARGE} className={cl("modal")}>
            <ModalHeader separator={false}>
                <Heading tag="h4" style={{ margin: 0 }}>Server Cloner</Heading>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className={cl("content")}>
                <ServerClonerUI initialSourceId={guildId} />
            </ModalContent>
        </ModalRoot>
    );
}

const patchGuildContext: NavContextMenuPatchCallback = (children, { guild }) => {
    if (!children || !Array.isArray(children)) return;
    try {
        if (!guild) return;

        children.push(
            <Menu.MenuItem
                id="server-cloner"
                key="server-cloner"
                label="ServerCloner"
                action={() => openModal(props => <ServerClonerModal rootProps={props} guildId={guild.id} />)}
            />
        );
    } catch (e) {
        console.error("[ServerCloner] Context menu patch error:", e);
    }
};

// ── Plugin ───────────────────────────────────────────────────────────────

const settings = definePluginSettings({
    cloner: {
        type: OptionType.COMPONENT,
        description: "",
        component: ServerClonerUI,
    },
});

export default definePlugin({
    name: "ServerCloner",
    enabledByDefault: true,
    description: "Clone an entire server (channels, roles, permissions, icon, emojis, embeds) to a server where you have ADMIN permission. Can be opened from server context menu.",
    authors: [{ name: "Moggcord", id: 0n }],
    settings,
    start() {
        addContextMenuPatch("guild-context", patchGuildContext);
    },
    stop() {
        removeContextMenuPatch("guild-context", patchGuildContext);
    }
});
