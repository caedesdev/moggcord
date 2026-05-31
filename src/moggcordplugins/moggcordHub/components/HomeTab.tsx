/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button, LinkButton } from "@components/Button";
import { Link } from "@components/Link";
import { checkForUpdates, rebuild, update, UpdateLogger } from "@utils/updater";
import { relaunch } from "@utils/native";
import { React, useEffect, useState } from "@webpack/common";

import { DISCORD_INVITE, getCachedReleases, refreshReleases, REPO_URL, WEBSITE_URL, type Release } from "../releases";
import { getCurrentVersionTag } from "../whatsNew";

export function HomeTab({
    compact = false,
    onOpenChangelog,
    onOpenGuide,
}: {
    compact?: boolean;
    onOpenChangelog: () => void;
    onOpenGuide: () => void;
}) {
    const [latestRelease, setLatestRelease] = useState<Release | null>(null);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [outdated, setOutdated] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const currentTag = getCurrentVersionTag();

    useEffect(() => {
        let cancelled = false;

        getCachedReleases(1).then(r => {
            if (!cancelled && r[0]) setLatestRelease(r[0]);
        });

        refreshReleases(1)
            .then(r => {
                if (!cancelled) setLatestRelease(r[0] ?? null);
            })
            .catch(() => { });

        if (!IS_UPDATER_DISABLED) {
            checkForUpdates().then(v => {
                if (!cancelled) setOutdated(v);
            }).catch(() => { });
        }

        return () => { cancelled = true; };
    }, []);

    async function handleCheckUpdate() {
        if (IS_UPDATER_DISABLED) return;
        setCheckingUpdate(true);
        setError(null);
        try {
            const hasUpdate = await checkForUpdates(true);
            setOutdated(hasUpdate);
            setStatus(hasUpdate ? "Update available." : "You are on the latest version.");
        } catch (e: any) {
            UpdateLogger.error(e);
            setError(e?.message ?? "Update check failed");
        } finally {
            setCheckingUpdate(false);
        }
    }

    async function handleUpdate() {
        if (IS_UPDATER_DISABLED || updating) return;
        setUpdating(true);
        setError(null);
        setStatus("Downloading update…");
        try {
            const downloaded = await update();
            if (!downloaded) throw new Error("Download failed");

            setStatus("Installing update…");
            const installed = await rebuild();

            if (installed) {
                setStatus("Update ready! Restarting…");
                setTimeout(() => relaunch(), 2000);
                return;
            }

            setStatus("Update downloaded. It will install when you close Discord.");
            setOutdated(false);
        } catch (e: any) {
            UpdateLogger.error(e);
            setError(e?.message ?? "Update failed");
        } finally {
            setUpdating(false);
        }
    }

    return (
        <div className={compact ? "mhub-home mhub-home-compact" : "mhub-home"}>
            {!compact && (
                <section className="mhub-hero">
                    <div className="mhub-hero-icon">M</div>
                    <div>
                        <h2 className="mhub-hero-title">Moggcord Hub</h2>
                        <p className="mhub-muted">News, updates, and quick links for your client.</p>
                    </div>
                </section>
            )}

            <div className="mhub-card">
                <h3 className="mhub-card-title">Version</h3>
                <div className="mhub-version-row">
                    <span className="mhub-version-current">{currentTag}</span>
                    {latestRelease && latestRelease.tag !== currentTag && (
                        <span className="mhub-pill mhub-pill-update">Latest: {latestRelease.tag}</span>
                    )}
                    {outdated && <span className="mhub-pill mhub-pill-update">Update available</span>}
                </div>
                {!IS_UPDATER_DISABLED && (
                    <div className="mhub-actions">
                        <Button
                            size="small"
                            variant="secondary"
                            disabled={checkingUpdate || updating}
                            onClick={handleCheckUpdate}
                        >
                            {checkingUpdate ? "Checking…" : "Check for updates"}
                        </Button>
                        {outdated && (
                            <Button size="small" disabled={updating} onClick={handleUpdate}>
                                {updating ? "Updating…" : "Update now"}
                            </Button>
                        )}
                    </div>
                )}
                {status && <p className="mhub-status">{status}</p>}
                {error && <p className="mhub-inline-error">{error}</p>}
            </div>

            <div className="mhub-card">
                <h3 className="mhub-card-title">Plugin-Guide</h3>
                <p className="mhub-muted">
                    Viele Plugins sind standardmäßig aktiv. Der Guide erklärt, wofür sie da sind.
                </p>
                <div className="mhub-actions">
                    <Button size="small" onClick={onOpenGuide}>
                        Plugin-Guide öffnen
                    </Button>
                </div>
            </div>

            {latestRelease && (
                <div className="mhub-card">
                    <h3 className="mhub-card-title">Latest release</h3>
                    <p className="mhub-latest-name">{latestRelease.name}</p>
                    <p className="mhub-muted">{latestRelease.tag}</p>
                    {latestRelease.body && (
                        <p className="mhub-latest-preview">
                            {latestRelease.body.split("\n").find(l => l.trim() && !l.startsWith("#"))?.slice(0, 160) ?? ""}
                        </p>
                    )}
                    <div className="mhub-actions">
                        <Button size="small" variant="secondary" onClick={onOpenChangelog}>
                            View changelog
                        </Button>
                        <LinkButton size="small" href={latestRelease.url}>GitHub</LinkButton>
                    </div>
                </div>
            )}

            <div className="mhub-card">
                <h3 className="mhub-card-title">Quick links</h3>
                <div className="mhub-link-grid">
                    <LinkButton href={DISCORD_INVITE}>Discord Server</LinkButton>
                    <LinkButton href={WEBSITE_URL}>Website</LinkButton>
                    <LinkButton href={REPO_URL}>GitHub</LinkButton>
                    <Link href={REPO_URL + "/issues"}>Report an issue</Link>
                </div>
            </div>
        </div>
    );
}
