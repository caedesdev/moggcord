/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Link } from "@components/Link";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab, wrapTab } from "@components/settings";
import { Span } from "@components/Span";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { changes, checkForUpdates, rebuild, update, UpdateLogger } from "@utils/updater";
import { React, Toasts, useState } from "@webpack/common";

declare const VERSION: string;

function UpdaterTab() {
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const [outdated, setOutdated] = useState(false);
    const [updateList, setUpdateList] = useState(changes ?? []);
    const [error, setError] = useState<string | null>(null);

    async function handleCheck() {
        setChecking(true);
        setError(null);
        setStatus("Checking for updates...");
        try {
            const hasUpdate = await checkForUpdates(true);
            setOutdated(hasUpdate);
            setUpdateList(changes ?? []);
            setChecked(true);
            setStatus(hasUpdate ? "A new update is available. Choose Update Now to download and install it." : "Moggcord is up to date. No action is needed.");

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
            setStatus(null);
            Toasts.show({ message: "Could not check for updates. Check your connection and try again.", id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { duration: 10000 } });
        } finally {
            setChecking(false);
        }
    }

    async function handleUpdate() {
        setDownloading(true);
        setError(null);
        setStatus("Downloading the update. Keep Discord open until this finishes.");
        try {
            const downloaded = await update();
            if (!downloaded) throw new Error("The update could not be downloaded. Check for updates and try again.");
            setStatus("Download complete. Installing the update...");
            const installed = await rebuild();

            if (installed) {
                setStatus("Update installed successfully. Discord will restart in a few seconds.");
                setOutdated(false);
                Toasts.show({
                    message: "Update successful! Restarting...",
                    id: Toasts.genId(),
                    type: Toasts.Type.SUCCESS,
                    options: { position: Toasts.Position.BOTTOM }
                });
                setTimeout(() => relaunch(), 3000);
            } else {
                setStatus("The update is downloaded but not installed yet. Fully close Discord and reopen it. If that does not help, run the latest installer and choose Repair.");
                Toasts.show({
                    message: "Update not installed yet. Fully close Discord and reopen it. If this repeats, use the latest installer and choose Repair.",
                    id: Toasts.genId(),
                    type: Toasts.Type.MESSAGE,
                    options: { position: Toasts.Position.BOTTOM, duration: 10000 }
                });
                setDownloading(false);
            }
        } catch (e: any) {
            UpdateLogger.error(e);
            setError("Update failed. Check your connection and try again. If this repeats, run the latest installer and choose Repair.");
            setStatus(null);
            Toasts.show({ message: "Update failed. Try again or use the latest installer and choose Repair.", id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { duration: 10000 } });
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

            {status && !error && (
                <Card role="status" aria-live="polite" style={{ padding: "10px 16px", marginBottom: 12 }}>
                    <Span size="sm" color="text-strong">{status}</Span>
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
