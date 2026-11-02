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
import type { UpdateProgress } from "@shared/updater";
import { Margins } from "@utils/margins";
import { relaunch } from "@utils/native";
import { cancelUpdate, changes, checkForUpdates, getUpdateStatus, rebuild, update, UpdateLogger } from "@utils/updater";
import { React, Toasts, useEffect, useState } from "@webpack/common";

declare const VERSION: string;

function UpdaterTab() {
    const [checking, setChecking] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [checked, setChecked] = useState(false);
    const [outdated, setOutdated] = useState(false);
    const [updateList, setUpdateList] = useState(changes ?? []);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const busy = downloading || progress?.phase === "downloading" || progress?.phase === "installing";

    useEffect(() => {
        let mounted = true;
        let polling = false;
        async function refreshProgress() {
            if (polling) return;
            polling = true;
            try {
                const value = await getUpdateStatus();
                if (mounted) setProgress(value);
            } catch (error) {
                UpdateLogger.debug("Unable to read update progress", error);
            } finally {
                polling = false;
            }
        }
        void refreshProgress();
        const timer = setInterval(refreshProgress, 500);
        return () => { mounted = false; clearInterval(timer); };
    }, []);

    async function handleCheck() {
        setChecking(true);
        setError(null);
        setStatus("Checking for updates...");
        try {
            const hasUpdate = await checkForUpdates(true);
            setOutdated(hasUpdate);
            setUpdateList(changes ?? []);
            setChecked(true);
            setStatus(hasUpdate ? "A new update is available. Choose Update Now to download and install it." : null);

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
            if (e?.name === "AbortError") {
                setStatus("Download cancelled. You can try again at any time.");
                return;
            }
            UpdateLogger.error(e);
            const detail = typeof e?.message === "string" ? e.message.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 300) : "";
            setError(`Update failed.${detail ? ` ${detail}` : ""} Check your connection and try again. If this repeats, run the latest installer and choose Repair.`);
            setStatus(null);
            Toasts.show({ message: "Update failed. Try again or use the latest installer and choose Repair.", id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { duration: 10000 } });
            setDownloading(false);
        } finally {
            setDownloading(false);
        }
    }

    async function handleCancel() {
        try {
            await cancelUpdate();
        } catch (error) {
            UpdateLogger.error(error);
            setError("Could not cancel the download. Please try again.");
        }
    }

    const received = ((progress?.receivedBytes ?? 0) / 1024 / 1024).toFixed(1);
    const total = progress?.totalBytes ? (progress.totalBytes / 1024 / 1024).toFixed(1) : null;
    const percent = progress?.totalBytes ? Math.min(100, Math.floor(progress.receivedBytes / progress.totalBytes * 100)) : undefined;
    const visibleError = error ?? (progress?.phase === "error" ? progress.error : null);
    const message = progress?.phase === "downloading"
        ? `Downloading the update: ${percent == null ? "" : `${percent}% · `}${received}${total ? ` / ${total}` : ""} MB. Keep Discord open.`
        : progress?.phase === "installing" ? "Download complete. Verifying and installing the update..." : status;

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
                            <Link href="https://moggcord.cc" style={{ fontSize: 13 }}>
                                moggcord.cc
                            </Link>
                        </div>
                    </div>
                </Flex>
            </Card>

            {visibleError && (
                <Card style={{ padding: "10px 16px", marginBottom: 12, borderLeft: "3px solid var(--status-danger)" }}>
                    <Span size="sm" color="text-danger">{visibleError}</Span>
                </Card>
            )}

            {message && !visibleError && (
                <Card role="status" aria-live="polite" style={{ padding: "10px 16px", marginBottom: 12 }}>
                    <Span size="sm" color="text-strong">{message}</Span>
                    {progress?.phase === "downloading" && <progress aria-label="Update download" max={100} value={percent} style={{ display: "block", width: "100%", height: 6, marginTop: 10, accentColor: "var(--brand-500)" }} />}
                </Card>
            )}

            {checked && !visibleError && (
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
                    disabled={checking || busy}
                    onClick={handleCheck}
                >
                    {checking ? "Checking..." : "Check for Updates"}
                </Button>

                {outdated && (
                    <Button
                        size="small"
                        variant="primary"
                        onClick={handleUpdate}
                        disabled={busy || checking}
                    >
                        {busy ? progress?.phase === "installing" ? "Installing..." : "Downloading..." : "Update Now"}
                    </Button>
                )}
                {progress?.phase === "downloading" && <Button size="small" variant="secondary" onClick={handleCancel}>Cancel download</Button>}
            </Flex>

            <Divider className={Margins.top20} />

            <Paragraph className={Margins.top16} style={{ fontSize: 12, opacity: 0.6 }}>
                Clicking "Update Now" will automatically download the latest version and restart your client.
            </Paragraph>
        </SettingsTab>
    );
}

export default wrapTab(UpdaterTab, "Updater");
