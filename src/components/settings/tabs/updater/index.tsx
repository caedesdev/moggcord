/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { Margins } from "@utils/margins";
import { changes, checkForUpdates, getRepo, isOutdated, rebuild, update, UpdateLogger } from "@utils/updater";
import { React, useState } from "@webpack/common";

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { Span } from "@components/Span";
import { Toasts, Alerts } from "@webpack/common";

import { relaunch } from "@utils/native";

declare const VERSION: string;

const REPO_URL = "https://github.com/caedesdev/moggcord";

function UpdaterTab() {
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [launching, setLaunching] = useState(false);
    const [checked, setChecked] = useState(false);
    const [outdated, setOutdated] = useState(false);
    const [updateList, setUpdateList] = useState(changes ?? []);
    const [error, setError] = useState<string | null>(null);

    async function handleCheck() {
        setChecking(true);
        setError(null);
        try {
            const hasUpdate = await checkForUpdates();
            setOutdated(hasUpdate);
            setUpdateList(changes ?? []);
            setChecked(true);

            if (!hasUpdate) {
                Toasts.show({
                    message: "You are already on the latest version!",
                    id: Toasts.genId(),
                    type: Toasts.Type.SUCCESS,
                    options: { position: Toasts.Position.BOTTOM }
                });
            }
        } catch (e: any) {
            UpdateLogger.error(e);
            let detail: string | null = e?.message || e?.error?.message || (typeof e === "string" ? e : null);
            // Strip any residual HTML and truncate to keep the UI clean
            if (detail) {
                detail = detail.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                if (detail.length > 300) detail = detail.substring(0, 300) + "…";
            }
            setError(`Unable to check for updates.${detail ? ` (${detail})` : " Check your connection."}`);
        } finally {
            setChecking(false);
        }
    }

    async function handleUpdate() {
        setDownloading(true);
        setError(null);
        try {
            await update();
            const installed = await rebuild();

            if (installed) {
                Toasts.show({
                    message: "Update successful! Restarting...",
                    id: Toasts.genId(),
                    type: Toasts.Type.SUCCESS,
                    options: { position: Toasts.Position.BOTTOM }
                });
                setTimeout(() => relaunch(), 1500);
            } else {
                Toasts.show({
                    message: "Update downloaded. Close Discord completely to finish installing, then reopen.",
                    id: Toasts.genId(),
                    type: Toasts.Type.MESSAGE,
                    options: { position: Toasts.Position.BOTTOM }
                });
                setDownloading(false);
            }
        } catch (e: any) {
            UpdateLogger.error(e);
            setError("Update failed: " + e.message);
            setDownloading(false);
        }
    }

    return (
        <SettingsTab>
            <Heading className={Margins.top16}>Moggcord Updater</Heading>
            <Paragraph className={Margins.bottom20}>
                Check for new versions of Moggcord. Updates can be installed automatically.
            </Paragraph>

            <Card style={{ padding: "12px 16px", marginBottom: 12 }}>
                <Flex style={{ alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <Span size="sm" color="text-subtle">Current Version</Span>
                        <div>
                            <Span size="md" weight="medium" color="text-strong">
                                v{VERSION}
                            </Span>
                        </div>
                    </div>
                    <div>
                        <Span size="sm" color="text-subtle">Website</Span>
                        <div>
                            <Link href="https://moggcord.online" style={{ fontSize: 13 }}>
                                moggcord.online
                            </Link>
                        </div>
                    </div>
                </Flex>
            </Card>

            {error && (
                <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-danger)" }}>
                    <Span size="sm" color="text-danger">{error}</Span>
                </Card>
            )}

            {checked && !error && (
                outdated ? (
                    <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-warning)" }}>
                        <Span size="sm" style={{ color: "var(--text-warning)" }}>
                            {updateList[0]?.message ?? "A new update is available!"}
                        </Span>
                    </Card>
                ) : (
                    <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-positive)" }}>
                        <Span size="sm" style={{ color: "var(--text-positive)" }}>You are running the latest version ✓</Span>
                    </Card>
                )
            )}

            <Flex gap="8px" className={Margins.top8}>
                <Button
                    size="small"
                    disabled={checking}
                    onClick={handleCheck}
                >
                    {checking ? "Checking..." : "Check for Updates"}
                </Button>

                {outdated && (
                    <Button
                        size="small"
                        variant="primary"
                        onClick={handleUpdate}
                        disabled={downloading}
                    >
                        {downloading ? "Installing..." : "🚀 Update Now (Automatic)"}
                    </Button>
                )}
            </Flex>

            <Divider className={Margins.top20} />

            <Paragraph className={Margins.top16} style={{ fontSize: 12, opacity: 0.6 }}>
                Clicking "Update Now" will automatically download the latest version and restart your client.
            </Paragraph>
        </SettingsTab>
    );
}

export default wrapTab(UpdaterTab, "Updater");
