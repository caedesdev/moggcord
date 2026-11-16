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

import "./themesStyles.css";

import { isPluginEnabled } from "@api/PluginManager";
import { Settings, useSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading, HeadingTertiary } from "@components/Heading";
import { CogWheel, DeleteIcon, FolderIcon, PaintbrushIcon, PencilIcon, PlusIcon, RestartIcon } from "@components/Icons";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { AddonCard, openPluginModal, QuickAction, QuickActionCard, SettingsTab, wrapTab } from "@components/settings";
import { OnlineThemeCard } from "@components/settings/OnlineThemeCard";
import { ManagementStatsCard } from "@components/settings/tabs/plugins/PluginStatCards";
import { CspBlockedUrls, useCspErrors } from "@utils/cspViolations";
import { classNameFactory } from "@utils/css";
import { copyWithToast, openInviteModal } from "@utils/discord";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { openModal } from "@utils/modal";
import { relaunch, showItemInFolder } from "@utils/native";
import { useAwaiter, useForceUpdater } from "@utils/react";
import type { ThemeHeader } from "@utils/themes";
import { getThemeInfo, stripBOM, type UserThemeHeader } from "@utils/themes/bd";
import { usercssParse } from "@utils/themes/usercss";
import { getStylusWebStoreUrl } from "@utils/web";
import { findComponentByCodeLazy, findLazy } from "@webpack";
import { Alerts, Menu, React, Select, showToast, TextInput, Toasts, Tooltip, useEffect, useMemo, useState } from "@webpack/common";
import { ContextMenuApi } from "@webpack/common/menu";
import type { ComponentType, Ref, SyntheticEvent } from "react";
import type { UserstyleHeader } from "usercss-meta";

import Plugins from "~plugins";

import { UserCSSSettingsModal } from "./UserCSSModal";

const PinIcon = findComponentByCodeLazy("1-.06-.63L6.16");
const HomeIcon = findComponentByCodeLazy("m2.4 8.4 8.38-6.46a2");
const RefreshIcon = findComponentByCodeLazy("M21 2a1 1 0 0 1 1 1v6");
const LinkIcon = findComponentByCodeLazy("M16.32 14.72a1 1 0 0 1 0-1.41l2.51-2.51");
const DiscordIcon = findComponentByCodeLazy("1.6 5.64-2.87");
const DownloadIcon = findComponentByCodeLazy("1.42l3.3 3.3V3a1");

type FileInput = ComponentType<{
    ref: Ref<HTMLInputElement>;
    onChange: (e: SyntheticEvent<HTMLInputElement>) => void;
    multiple?: boolean;
    filters?: { name?: string; extensions: string[]; }[];
}>;
const FileInput: FileInput = findLazy(m => m.prototype?.activateUploadDialogue && m.prototype.setRef);

const cl = classNameFactory("vc-settings-theme-");

enum ThemeFilter {
    All = "all",
    Online = "online",
    Local = "local",
    Enabled = "enabled",
    Disabled = "disabled"
}

const filterOptions = [
    { label: "Show All", value: ThemeFilter.All },
    { label: "Online Themes", value: ThemeFilter.Online },
    { label: "Local Themes", value: ThemeFilter.Local },
    { label: "Enabled", value: ThemeFilter.Enabled },
    { label: "Disabled", value: ThemeFilter.Disabled }
];

function Validator({ link, onValidate }: { link: string; onValidate: (valid: boolean) => void; }) {
    const [, err, pending] = useAwaiter(() => fetch(link).then(res => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const contentType = res.headers.get("Content-Type");
        if (!contentType?.startsWith("text/css") && !contentType?.startsWith("text/plain")) {
            throw new Error("Use a direct link to a CSS file.");
        }
    }), { fallbackValue: undefined, deps: [link], onSuccess: () => onValidate(true) });

    const text = pending
        ? "Checking..."
        : err
            ? `Error: ${err instanceof Error ? err.message : String(err)}`
            : "Valid!";

    return <Paragraph style={{
        color: pending ? "var(--text-muted)" : err ? "var(--text-feedback-critical)" : "var(--status-positive)"
    }}>{text}</Paragraph>;
}

interface OtherThemeCardProps {
    theme: UserThemeHeader;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    onDelete: () => void;
    showDeleteButton?: boolean;
    onEditName?: (newName: string) => void;
    disabled?: boolean;
    onPin?: () => void;
    isPinned?: boolean;
    onRefresh?: () => void;
    onOpenFolder?: () => void;
    onCopyUrl?: () => void;
    onDownload?: () => void;
    themeLink?: string;
    isLocal?: boolean;
}

interface UserCSSCardProps {
    theme: UserstyleHeader;
    enabled: boolean;
    onChange: (enabled: boolean) => void;
    onDelete: () => void;
    onSettingsReset: () => void;
}

function UserCSSThemeCard({ theme, enabled, onChange, onDelete, onSettingsReset }: UserCSSCardProps) {
    const missingPlugins = useMemo(() =>
        theme.requiredPlugins?.filter(p => !isPluginEnabled(p)), [theme]);

    return (
        <AddonCard
            name={theme.name ?? "Unknown"}
            description={theme.description}
            author={theme.author ?? "Unknown"}
            enabled={enabled}
            setEnabled={onChange}
            disabled={missingPlugins && missingPlugins.length > 0}
            sourceBadge={<span className={cl("source")}>Local</span>}
            tooltip="Local CSS file"
            infoButton={
                <>
                    {missingPlugins && missingPlugins.length > 0 && (
                        <Tooltip text={"Enable these plugins to use this theme: " + missingPlugins.join(", ")}>
                            {tooltipProps => (
                                <span className={classes(cl("source"), cl("warning"))} {...tooltipProps}>Needs plugins</span>
                            )}
                        </Tooltip>
                    )}
                    {theme.vars && (
                        <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => openModal(modalProps => (
                                <UserCSSSettingsModal modalProps={modalProps} theme={theme} onSettingsReset={onSettingsReset} />
                            ))}
                        >
                            Settings
                        </Button>
                    )}
                    {IS_WEB && (
                        <Button variant="dangerSecondary" size="xs" onClick={onDelete}>Delete</Button>
                    )}
                </>
            }
            footer={
                <Flex flexDirection="row" gap="0.4em" style={{ alignItems: "center" }}>
                    {!!theme.homepageURL && <Link href={theme.homepageURL}>Homepage</Link>}
                    {!!(theme.homepageURL && theme.supportURL) && (
                        <span style={{ color: "var(--text-muted)" }}>•</span>
                    )}
                    {!!theme.supportURL && <Link href={theme.supportURL}>Support</Link>}
                </Flex>
            }
        />
    );
}

function OtherThemeCard({ theme, enabled, onChange, onDelete, showDeleteButton, onEditName, disabled, onPin, isPinned, onRefresh, onOpenFolder, onCopyUrl, onDownload, themeLink, isLocal }: OtherThemeCardProps) {
    const openThemeMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="theme-card-menu" onClose={ContextMenuApi.closeContextMenu}>
                {onPin && (
                    <Menu.MenuItem
                        id="pin-theme"
                        label={isPinned ? "Unpin" : "Pin"}
                        icon={PinIcon}
                        action={onPin}
                    />
                )}
                {theme.website && (
                    <Menu.MenuItem
                        id="open-website"
                        label="Open Website"
                        icon={HomeIcon}
                        action={() => window.open(theme.website, "_blank")}
                    />
                )}
                {theme.invite && (
                    <Menu.MenuItem
                        id="join-discord"
                        label="Join Discord"
                        icon={DiscordIcon}
                        action={() => {
                            openInviteModal(theme.invite!).catch(() =>
                                showToast("Invalid or expired invite")
                            );
                        }}
                    />
                )}
                {onCopyUrl && themeLink && (
                    <Menu.MenuItem
                        id="copy-url"
                        label="Copy URL"
                        icon={LinkIcon}
                        action={onCopyUrl}
                    />
                )}
                {onDownload && (
                    <Menu.MenuItem
                        id="download-theme"
                        label="Download"
                        icon={DownloadIcon}
                        action={onDownload}
                    />
                )}
                {onOpenFolder && (
                    <Menu.MenuItem
                        id="open-folder"
                        label="Open in Folder"
                        icon={FolderIcon}
                        action={onOpenFolder}
                    />
                )}
                {onRefresh && (
                    <Menu.MenuItem
                        id="refresh-theme"
                        label="Refresh"
                        icon={RefreshIcon}
                        action={onRefresh}
                    />
                )}
                {(IS_WEB || showDeleteButton) && onDelete && (
                    <>
                        <Menu.MenuSeparator />
                        <Menu.MenuItem
                            id="delete-theme"
                            label="Delete"
                            color="danger"
                            icon={DeleteIcon}
                            action={() => onDelete()}
                        />
                    </>
                )}
            </Menu.Menu>
        ));
    };

    return (
        <OnlineThemeCard
            customName={theme.customName}
            name={theme.name}
            description={theme.description}
            author={theme.author}
            enabled={enabled}
            setEnabled={onChange}
            disabled={disabled}
            sourceBadge={<span className={cl("source")}>{isLocal ? "Local" : "Online"}</span>}
            infoButton={
                (IS_WEB || showDeleteButton || onPin) && (
                    <Button variant="secondary" size="xs" aria-haspopup="menu" onClick={openThemeMenu}>
                        Manage
                    </Button>
                )
            }
            footer={(isPinned || theme.website || theme.invite) && (
                <Flex flexDirection="row" gap="0.4em" alignItems="center">
                    {isPinned && <span className={cl("source")}>Pinned</span>}
                    {!!theme.website && <Link href={theme.website}>Website</Link>}
                    {!!(theme.website && theme.invite) && (
                        <span style={{ color: "var(--text-muted)" }}>•</span>
                    )}
                    {!!theme.invite && (
                        <Link
                            href={`https://discord.gg/${theme.invite}`}
                            onClick={async e => {
                                e.preventDefault();
                                theme.invite != null &&
                                    openInviteModal(theme.invite).catch(() =>
                                        showToast("Invalid or expired invite")
                                    );
                            }}
                        >
                            Discord Server
                        </Link>
                    )}
                </Flex>
            )}
            onEditName={onEditName}
        />
    );
}

interface UnifiedTheme {
    type: "local" | "online";
    themeType: "usercss" | "other";
    name: string;
    enabled: boolean;
    header: UserThemeHeader | UserstyleHeader;
    link?: string;
}

function ThemesTab() {
    const settings = useSettings(["themeLinks", "enabledThemeLinks", "enabledThemes", "enableOnlineThemes", "pinnedThemes"]);

    const fileInputRef = useState<HTMLInputElement | null>(null)[1];
    const [currentThemeLink, setCurrentThemeLink] = useState("");
    const [themeLinkValid, setThemeLinkValid] = useState(false);
    const [userThemes, setUserThemes] = useState<ThemeHeader[] | null>(null);
    const [onlineThemes, setOnlineThemes] = useState<(UserThemeHeader & { link: string; })[] | null>(null);
    const [themeNames, setThemeNames] = useState<Record<string, string>>(() => {
        return settings.themeNames ?? {};
    });
    const [themeDir] = useAwaiter(VencordNative.themes.getThemesDir);
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState(ThemeFilter.All);
    const [showOptions, setShowOptions] = useState(false);

    useEffect(() => {
        updateThemes();
    }, []);

    async function updateThemes() {
        await changeThemeLibraryURLs();
        refreshLocalThemes();
        refreshOnlineThemes();
    }

    async function changeThemeLibraryURLs() {
        settings.themeLinks = settings.themeLinks.map(link => {
            if (link.startsWith("https://discord-themes.com/api")) {
                return link.replace("https://discord-themes.com/api", "https://themes.equicord.org/api");
            }
            return link;
        });
    }

    async function refreshLocalThemes() {
        const themes = await VencordNative.themes.getThemesList();
        const themeInfo: ThemeHeader[] = [];

        for (const { fileName, content } of themes) {
            if (!fileName.endsWith(".css")) continue;

            if ((!IS_WEB || "legcord" in window) && fileName.endsWith(".user.css")) {
                const header = await usercssParse(content, fileName);

                themeInfo.push({
                    type: "usercss",
                    header
                });

                Settings.userCssVars[header.id] ??= {};

                for (const [name, varInfo] of Object.entries(header.vars ?? {})) {
                    let normalizedValue = "";

                    switch (varInfo.type) {
                        case "text":
                        case "color":
                        case "checkbox":
                            normalizedValue = varInfo.default;
                            break;
                        case "select":
                            normalizedValue = varInfo.options.find(v => v.name === varInfo.default)!.value;
                            break;
                        case "range":
                            normalizedValue = `${varInfo.default}${varInfo.units}`;
                            break;
                        case "number":
                            normalizedValue = String(varInfo.default);
                            break;
                    }

                    Settings.userCssVars[header.id][name] ??= normalizedValue;
                }
            } else {
                themeInfo.push({
                    type: "other",
                    header: getThemeInfo(stripBOM(content), fileName)
                });
            }
        }

        setUserThemes(themeInfo);
    }

    function onLocalThemeChange(fileName: string, value: boolean) {
        if (value) {
            if (settings.enabledThemes.includes(fileName)) return;
            settings.enabledThemes = [...settings.enabledThemes, fileName];
        } else {
            settings.enabledThemes = settings.enabledThemes.filter(f => f !== fileName);
        }
    }

    async function onFileUpload(e: SyntheticEvent<HTMLInputElement>) {
        e.stopPropagation();
        e.preventDefault();
        if (!e.currentTarget?.files?.length) return;
        const { files } = e.currentTarget;

        const uploads = Array.from(files, file => {
            const { name } = file;
            if (!name.endsWith(".css")) return;

            return new Promise<void>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    VencordNative.themes.uploadTheme(name, reader.result as string)
                        .then(resolve)
                        .catch(reject);
                };
                reader.readAsText(file);
            });
        });

        await Promise.all(uploads);
        refreshLocalThemes();
    }

    function addThemeLink(link: string) {
        if (!themeLinkValid) return;
        if (settings.themeLinks.includes(link)) return;

        settings.themeLinks = [...settings.themeLinks, link];
        setCurrentThemeLink("");
        setThemeLinkValid(false);
        refreshOnlineThemes();
    }

    async function refreshOnlineThemes() {
        const themes = await Promise.all(
            settings.themeLinks.map(async link => {
                try {
                    const res = await fetch(link);
                    if (!res.ok) throw new Error(`Failed to fetch ${link}`);
                    const css = await res.text();
                    return { ...getThemeInfo(css, link), link };
                } catch (err) {
                    console.warn(`Theme fetch failed for ${link}:`, err);
                    return null;
                }
            })
        );
        setOnlineThemes(themes.filter(theme => theme !== null));
    }

    function onThemeLinkEnabledChange(link: string, enabled: boolean) {
        if (enabled) {
            if (settings.enabledThemeLinks.includes(link)) return;
            settings.enabledThemeLinks = [...settings.enabledThemeLinks, link];
        } else {
            settings.enabledThemeLinks = settings.enabledThemeLinks.filter(f => f !== link);
        }
    }

    function deleteThemeLink(link: string) {
        settings.themeLinks = settings.themeLinks.filter(f => f !== link);
        settings.pinnedThemes = settings.pinnedThemes.filter(f => f !== link);
        refreshOnlineThemes();
    }

    function togglePinTheme(themeId: string) {
        if (settings.pinnedThemes.includes(themeId)) {
            settings.pinnedThemes = settings.pinnedThemes.filter(f => f !== themeId);
        } else {
            settings.pinnedThemes = [...settings.pinnedThemes, themeId];
        }
    }

    async function refreshOnlineTheme(link: string) {
        try {
            const res = await fetch(link);
            if (!res.ok) throw new Error(`Failed to fetch ${link}`);
            const css = await res.text();
            const updatedTheme = { ...getThemeInfo(css, link), link };

            setOnlineThemes(prev =>
                prev?.map(t => t.link === link ? updatedTheme : t) ?? null
            );
            showToast("Theme refreshed!", Toasts.Type.SUCCESS);
        } catch {
            showToast("Failed to refresh theme", Toasts.Type.FAILURE);
        }
    }

    async function downloadTheme(link: string, name: string) {
        try {
            const res = await fetch(link);
            if (!res.ok) throw new Error(`Failed to fetch ${link}`);
            const css = await res.text();
            const fileName = name.replace(/[^a-z0-9]/gi, "-") + ".css";

            if (IS_DISCORD_DESKTOP) {
                DiscordNative.fileManager.saveWithDialog(new TextEncoder().encode(css), fileName);
            } else {
                const blob = new Blob([css], { type: "text/css" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch {
            showToast("Failed to download theme", Toasts.Type.FAILURE);
        }
    }

    const allThemes = useMemo((): UnifiedTheme[] => {
        const themes: UnifiedTheme[] = [];

        for (const theme of onlineThemes ?? []) {
            const customName = themeNames[theme.link] ?? null;
            themes.push({
                type: "online",
                themeType: "other",
                name: customName ?? theme.name ?? theme.fileName,
                enabled: settings.enabledThemeLinks.includes(theme.link),
                header: { ...theme, customName },
                link: theme.link
            });
        }

        for (const { type, header } of userThemes ?? []) {
            const name = type === "usercss"
                ? (header as UserstyleHeader).name ?? "Unknown"
                : (header as UserThemeHeader).name ?? (header as UserThemeHeader).fileName;

            themes.push({
                type: "local",
                themeType: type,
                name,
                enabled: settings.enabledThemes.includes(header.fileName),
                header
            });
        }

        return themes;
    }, [onlineThemes, userThemes, themeNames, settings.enabledThemeLinks, settings.enabledThemes]);

    const filteredThemes = useMemo(() => {
        let themes = allThemes;

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            themes = themes.filter(t => t.name.toLowerCase().includes(query));
        }

        switch (filter) {
            case ThemeFilter.Online:
                themes = themes.filter(t => t.type === "online");
                break;
            case ThemeFilter.Local:
                themes = themes.filter(t => t.type === "local");
                break;
            case ThemeFilter.Enabled:
                themes = themes.filter(t => t.enabled);
                break;
            case ThemeFilter.Disabled:
                themes = themes.filter(t => !t.enabled);
                break;
        }

        const getThemeId = (t: UnifiedTheme) => t.type === "online" ? t.link! : (t.header as UserThemeHeader).fileName;
        themes.sort((a, b) => {
            const aId = getThemeId(a);
            const bId = getThemeId(b);
            const aPinIndex = settings.pinnedThemes.indexOf(aId);
            const bPinIndex = settings.pinnedThemes.indexOf(bId);
            const aIsPinned = aPinIndex !== -1;
            const bIsPinned = bPinIndex !== -1;

            if (aIsPinned && !bIsPinned) return -1;
            if (!aIsPinned && bIsPinned) return 1;
            if (aIsPinned && bIsPinned) return aPinIndex - bPinIndex;
            return 0;
        });

        return themes;
    }, [allThemes, searchQuery, filter, settings.pinnedThemes]);

    const enabledCount = allThemes.filter(t => t.enabled).length;
    const hasEnabledThemes = settings.enabledThemes.length > 0 || settings.enabledThemeLinks.length > 0;

    return (
        <SettingsTab>
            <CspErrorCard />

            <ManagementStatsCard
                title="Theme Management"
                totalLabel="Installed"
                progressLabel="Enabled themes"
                total={allThemes.length}
                enabled={enabledCount}
                settingsButton={
                    <Button
                        className={cl("options-toggle")}
                        variant="secondary"
                        size="iconOnly"
                        aria-label="Theme settings"
                        aria-expanded={showOptions}
                        onClick={() => setShowOptions(value => !value)}
                        title="Theme settings"
                    >
                        <CogWheel width={20} height={20} />
                    </Button>
                }
                disableAllDisabled={!hasEnabledThemes}
                onDisableAll={() => Alerts.show({
                    title: "Disable all themes?",
                    body: "Your themes will stay in the list so you can turn them on again.",
                    confirmText: "Disable All",
                    cancelText: "Cancel",
                    onConfirm() {
                        Settings.enabledThemes = [];
                        Settings.enabledThemeLinks = [];
                    }
                })}
            />

            {showOptions && (
                <div className={cl("options")}>
                    <HeadingTertiary className={Margins.bottom8}>Quick Actions</HeadingTertiary>
                    <QuickActionCard>
                        {IS_WEB ? (
                            <QuickAction
                                text={
                                    <span style={{ position: "relative" }}>
                                        Upload Theme
                                        <FileInput
                                            ref={fileInputRef}
                                            onChange={onFileUpload}
                                            multiple={true}
                                            filters={[{ extensions: ["css"] }]}
                                        />
                                    </span>
                                }
                                Icon={PlusIcon}
                            />
                        ) : (
                            <QuickAction
                                text="Open Themes Folder"
                                action={() => VencordNative.themes.openFolder()}
                                Icon={FolderIcon}
                            />
                        )}
                        <QuickAction
                            text="Load missing Themes"
                            action={refreshLocalThemes}
                            Icon={RestartIcon}
                        />
                        <QuickAction
                            text="Edit QuickCSS"
                            action={() => VencordNative.quickCss.openEditor()}
                            Icon={PaintbrushIcon}
                        />
                        {Settings.plugins.ClientTheme?.enabled && (
                            <QuickAction
                                text="Edit ClientTheme"
                                action={() => openPluginModal(Plugins.ClientTheme)}
                                Icon={PencilIcon}
                            />
                        )}
                    </QuickActionCard>
                    <Divider className={Margins.top20} />

                    <FormSwitch
                        title="Enable Online Themes"
                        description="Allow themes to load directly from CSS links."
                        value={settings.enableOnlineThemes ?? true}
                        onChange={value => {
                            settings.enableOnlineThemes = value;
                            if (!value) settings.enabledThemeLinks = [];
                        }}
                    />

                    <div className={cl("link-row")}>
                        <TextInput
                            placeholder="https://example.com/theme.css"
                            aria-label="Theme CSS URL"
                            value={currentThemeLink}
                            onChange={value => {
                                setThemeLinkValid(false);
                                setCurrentThemeLink(value);
                            }}
                            disabled={!settings.enableOnlineThemes}
                        />
                        <Button
                            onClick={() => addThemeLink(currentThemeLink)}
                            disabled={!currentThemeLink || !themeLinkValid || !settings.enableOnlineThemes}
                        >
                            Add Theme
                        </Button>
                    </div>
                    {currentThemeLink && settings.enableOnlineThemes && (
                        <div className={Margins.top8}>
                            <Validator link={currentThemeLink} onValidate={setThemeLinkValid} />
                        </div>
                    )}
                    <Paragraph color="text-subtle" className={Margins.top8}>
                        Browse <Link href="https://moggcord.cc/themes">Moggcord Themes</Link> or use a direct link to a CSS file.
                    </Paragraph>
                </div>
            )}

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>Filters</HeadingTertiary>

            <div className={cl("filter-row")}>
                <TextInput
                    placeholder="Search for a theme..."
                    aria-label="Search themes"
                    value={searchQuery}
                    onChange={setSearchQuery}
                />
                <div>
                    <Select
                        options={filterOptions}
                        select={setFilter}
                        isSelected={v => v === filter}
                        serialize={v => v}
                    />
                </div>
            </div>

            <HeadingTertiary className={classes(Margins.top20, Margins.bottom8)}>Installed Themes</HeadingTertiary>

            {userThemes === null || onlineThemes === null ? (
                <Paragraph color="text-muted" className={Margins.top16}>Loading themes...</Paragraph>
            ) : filteredThemes.length === 0 ? (
                <Paragraph color="text-muted" className={Margins.top16}>
                    {allThemes.length === 0
                        ? "No themes installed yet. Add theme files to your themes folder or add an online theme above to get started."
                        : "No themes match your search or filter criteria."
                    }
                </Paragraph>
            ) : (
                <div className={cl("grid")}>
                    {filteredThemes.map(theme => {
                        if (theme.type === "online") {
                            const onlineTheme = theme.header as UserThemeHeader & { link: string; };
                            const onlineThemesDisabled = !(settings.enableOnlineThemes ?? true);
                            return (
                                <OtherThemeCard
                                    key={onlineTheme.link}
                                    theme={onlineTheme}
                                    enabled={theme.enabled}
                                    onChange={enabled => onThemeLinkEnabledChange(onlineTheme.link, enabled)}
                                    onDelete={() => {
                                        onThemeLinkEnabledChange(onlineTheme.link, false);
                                        deleteThemeLink(onlineTheme.link);
                                    }}
                                    showDeleteButton
                                    disabled={onlineThemesDisabled}
                                    onPin={() => togglePinTheme(onlineTheme.link)}
                                    isPinned={settings.pinnedThemes.includes(onlineTheme.link)}
                                    themeLink={onlineTheme.link}
                                    onCopyUrl={() => copyWithToast(onlineTheme.link, "Theme URL copied!")}
                                    onRefresh={() => refreshOnlineTheme(onlineTheme.link)}
                                    onDownload={() => downloadTheme(onlineTheme.link, onlineTheme.name ?? "theme")}
                                    isLocal={false}
                                    onEditName={newName => {
                                        const updatedNames = { ...themeNames, [onlineTheme.link]: newName };
                                        setThemeNames(updatedNames);
                                        settings.themeNames = {
                                            ...settings.themeNames,
                                            [onlineTheme.link]: newName,
                                        };
                                    }}
                                />
                            );
                        }

                        if (theme.themeType === "usercss") {
                            const usercssTheme = theme.header as UserstyleHeader;
                            return (
                                <UserCSSThemeCard
                                    key={usercssTheme.fileName}
                                    enabled={theme.enabled}
                                    onChange={enabled => onLocalThemeChange(usercssTheme.fileName, enabled)}
                                    onDelete={async () => {
                                        onLocalThemeChange(usercssTheme.fileName, false);
                                        await VencordNative.themes.deleteTheme(usercssTheme.fileName);
                                        refreshLocalThemes();
                                    }}
                                    onSettingsReset={refreshLocalThemes}
                                    theme={usercssTheme}
                                />
                            );
                        }

                        const localTheme = theme.header as UserThemeHeader;
                        return (
                            <OtherThemeCard
                                key={localTheme.fileName}
                                enabled={theme.enabled}
                                onChange={enabled => onLocalThemeChange(localTheme.fileName, enabled)}
                                onDelete={async () => {
                                    onLocalThemeChange(localTheme.fileName, false);
                                    await VencordNative.themes.deleteTheme(localTheme.fileName);
                                    refreshLocalThemes();
                                }}
                                showDeleteButton
                                onPin={() => togglePinTheme(localTheme.fileName)}
                                isPinned={settings.pinnedThemes.includes(localTheme.fileName)}
                                onOpenFolder={!IS_WEB ? () => showItemInFolder(themeDir + "/" + localTheme.fileName) : undefined}
                                onRefresh={refreshLocalThemes}
                                isLocal
                                theme={localTheme}
                            />
                        );
                    })}
                </div>
            )}
        </SettingsTab>
    );
}

export function CspErrorCard() {
    if (IS_WEB) return null;

    const errors = useCspErrors();
    const forceUpdate = useForceUpdater();

    if (!errors.length) return null;

    const isImgurHtmlDomain = (url: string) => url.startsWith("https://imgur.com/");

    const allowUrl = async (url: string) => {
        const { origin: baseUrl, host } = new URL(url);

        const result = await VencordNative.csp.requestAddOverride(baseUrl, ["connect-src", "img-src", "style-src", "font-src"], "Equicord Themes");
        if (result !== "ok") return;

        CspBlockedUrls.forEach(url => {
            if (new URL(url).host === host) {
                CspBlockedUrls.delete(url);
            }
        });

        forceUpdate();

        Alerts.show({
            title: "Restart Required",
            body: "A restart is required to apply this change",
            confirmText: "Restart now",
            cancelText: "Later!",
            onConfirm: relaunch
        });
    };

    const hasImgurHtmlDomain = errors.some(isImgurHtmlDomain);

    return (
        <ErrorCard className={classes(cl("error-card"), Margins.top16)}>
            <Heading className={Margins.bottom8}>Blocked Resources</Heading>
            <Paragraph className={Margins.bottom8}>
                Some resources were blocked from disallowed domains. Move them to GitHub or Imgur, or allow trusted domains below.
            </Paragraph>

            {errors.map(url => (
                <div key={url} className={cl("csp-row")}>
                    <Link href={url}>{url}</Link>
                    <Button size="small" variant="secondary" onClick={() => allowUrl(url)} disabled={isImgurHtmlDomain(url)}>
                        Allow
                    </Button>
                </div>
            ))}

            {hasImgurHtmlDomain && (
                <Paragraph color="text-subtle" className={Margins.top8}>
                    Imgur links should be direct links like <code>https://i.imgur.com/...</code>
                </Paragraph>
            )}
        </ErrorCard>
    );
}

function UserscriptThemesTab() {
    return (
        <SettingsTab>
            <Heading className={Margins.top16}>Themes Not Supported</Heading>
            <Paragraph className={Margins.bottom8}>
                Themes are not available on the Userscript version.
            </Paragraph>
            <Paragraph color="text-subtle">
                You can install themes using the <Link href={getStylusWebStoreUrl()}>Stylus extension</Link> instead.
            </Paragraph>
        </SettingsTab>
    );
}

export default IS_USERSCRIPT
    ? wrapTab(UserscriptThemesTab, "Themes")
    : wrapTab(ThemesTab, "Themes");
