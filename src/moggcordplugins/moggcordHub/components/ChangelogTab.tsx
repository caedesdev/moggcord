/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { React, useEffect, useState } from "@webpack/common";

import { getCachedReleases, getReleases, refreshReleases, type Release } from "../releases";
import { getCurrentVersionTag } from "../whatsNew";
import { ReleaseCard } from "./ReleaseCard";

export function ChangelogTab({ highlightTag }: { highlightTag?: string; }) {
    const [releases, setReleases] = useState<Release[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const currentTag = getCurrentVersionTag();

    async function load(force = false) {
        setError(null);
        if (force) setLoading(true);

        try {
            const data = force ? await refreshReleases(10) : await getReleases(10, false);
            setReleases(data);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load releases");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        getCachedReleases(10).then(cached => {
            if (!cancelled && cached.length) {
                setReleases(cached);
                setLoading(false);
            }
        });

        refreshReleases(10)
            .then(fresh => {
                if (!cancelled) setReleases(fresh);
            })
            .catch((e: any) => {
                if (!cancelled) setError(e?.message ?? "Failed to load releases");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    if (loading && !releases) {
        return <div className="mhub-state">Loading changelog…</div>;
    }

    if (error && !releases?.length) {
        return (
            <div className="mhub-state mhub-state-error">
                <p>{error}</p>
                <Button size="small" onClick={() => load(true)}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="mhub-changelog">
            <div className="mhub-changelog-toolbar">
                <span className="mhub-muted">Recent releases from GitHub</span>
                <Button size="small" variant="secondary" disabled={loading} onClick={() => load(true)}>
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
            </div>
            {error && <p className="mhub-inline-error">Using cached data ({error})</p>}
            <div className="mhub-release-list">
                {(releases ?? []).map(release => (
                    <ReleaseCard
                        key={release.tag}
                        release={release}
                        highlighted={highlightTag ? release.tag === highlightTag : release.tag === currentTag}
                        isCurrent={release.tag === currentTag}
                    />
                ))}
            </div>
        </div>
    );
}
