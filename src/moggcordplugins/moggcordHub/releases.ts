/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";

export const REPO_SLUG = "caedesdev/moggcord";
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const DISCORD_INVITE = "https://discord.gg/moggcord";
export const WEBSITE_URL = "https://moggcord.online";

const CACHE_KEY = "moggcord-hub-releases-cache";
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface Release {
    tag: string;
    name: string;
    body: string;
    publishedAt: string;
    url: string;
}

interface ReleaseCache {
    at: number;
    releases: Release[];
}

interface GitHubRelease {
    tag_name?: string;
    name?: string;
    body?: string;
    published_at?: string;
    html_url?: string;
}

function mapRelease(raw: GitHubRelease): Release | null {
    if (!raw.tag_name) return null;
    return {
        tag: raw.tag_name,
        name: raw.name?.trim() || raw.tag_name,
        body: raw.body?.trim() ?? "",
        publishedAt: raw.published_at ?? "",
        url: raw.html_url ?? `${REPO_URL}/releases/tag/${encodeURIComponent(raw.tag_name)}`,
    };
}

async function fetchFromGitHub(limit: number): Promise<Release[]> {
    const res = await fetch(
        `https://api.github.com/repos/${REPO_SLUG}/releases?per_page=${limit}`,
        {
            headers: {
                Accept: "application/vnd.github+json",
            },
        },
    );

    if (!res.ok) {
        throw new Error(`GitHub API ${res.status}`);
    }

    const data = (await res.json()) as GitHubRelease[];
    return data.map(mapRelease).filter((r): r is Release => r != null);
}

async function readCache(): Promise<ReleaseCache | null> {
    const cached = await DataStore.get<ReleaseCache>(CACHE_KEY);
    if (!cached?.releases?.length) return null;
    return cached;
}

async function writeCache(releases: Release[]): Promise<void> {
    await DataStore.set(CACHE_KEY, { at: Date.now(), releases });
}

/** Instant display while a network fetch is in flight. */
export async function getCachedReleases(limit = 10): Promise<Release[]> {
    const cached = await readCache();
    return cached ? cached.releases.slice(0, limit) : [];
}

/** Always fetches from GitHub and updates the cache. */
export async function refreshReleases(limit = 10): Promise<Release[]> {
    const releases = await fetchFromGitHub(limit);
    await writeCache(releases);
    return releases.slice(0, limit);
}

export async function getReleases(limit = 10, force = false): Promise<Release[]> {
    if (!force) {
        const cached = await readCache();
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return cached.releases.slice(0, limit);
        }
    }

    try {
        return await refreshReleases(limit);
    } catch (e) {
        const cached = await readCache();
        if (cached?.releases.length) return cached.releases.slice(0, limit);
        throw e;
    }
}

export function formatReleaseDate(iso: string): string {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return iso;
    }
}
