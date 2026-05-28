/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { checkForUpdates, update, rebuild, UpdateLogger } from "@utils/updater";
import { relaunch } from "@utils/native";
import { React, useState, useEffect, ReactDOM, createRoot } from "@webpack/common";

declare const VERSION: string;

let bannerRoot: ReturnType<typeof createRoot> | null = null;
let bannerContainer: HTMLDivElement | null = null;
let showBanner = false;
let listeners: Array<() => void> = [];

function notify() {
    listeners.forEach(f => f());
}

function setBannerVisible(visible: boolean) {
    showBanner = visible;
    notify();
}

const bannerStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2147483647,
    pointerEvents: "auto",
    background: "linear-gradient(90deg, #1e5c2a 0%, #3ba55c 100%)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "9px 16px",
    fontSize: 13,
    fontFamily: "var(--font-primary, sans-serif)",
    boxShadow: "0 2px 16px rgba(0,0,0,0.5)",
    gap: 12,
};

function UpdateBanner() {
    const [visible, setVisible] = useState(showBanner);
    const [dismissed, setDismissed] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        const fn = () => setVisible(showBanner);
        listeners.push(fn);
        return () => { listeners = listeners.filter(f => f !== fn); };
    }, []);

    if (!visible || dismissed) return null;

    async function doUpdate() {
        if (loading) return;
        setLoading(true);
        setFailed(false);
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
            setLoading(false);
        } catch (e: any) {
            UpdateLogger.error("Banner update failed", e);
            const detail = e?.message ?? "Unknown error";
            setStatus(`Update failed: ${detail}. Close Discord to finish installing, or try again.`);
            setFailed(true);
            setLoading(false);
        }
    }

    function dismiss() {
        if (loading) return;
        setDismissed(true);
    }

    return (
        <div style={bannerStyle} role="region" aria-label="Moggcord update">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>
                    🔔 Moggcord Update Available!
                </span>
                <span style={{
                    opacity: 0.9,
                    fontSize: 12,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                }}>
                    {status ?? `Current version: v${VERSION}`}
                </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); doUpdate(); }}
                    disabled={loading}
                    style={{
                        background: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.35)",
                        borderRadius: 6,
                        color: "#fff",
                        padding: "4px 14px",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: "inherit",
                        pointerEvents: "auto",
                    }}
                >
                    {loading ? "…" : failed ? "Retry" : "Update now"}
                </button>
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); dismiss(); }}
                    disabled={loading}
                    title="Dismiss (update installs when you close Discord)"
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "rgba(255,255,255,0.75)",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontSize: 18,
                        padding: "0 6px",
                        fontFamily: "inherit",
                        lineHeight: 1,
                        pointerEvents: "auto",
                    }}
                >
                    ✕
                </button>
            </div>
        </div>
    );
}

function mountBanner() {
    if (bannerContainer || document.getElementById("moggcord-updater-root")) return;

    bannerContainer = document.createElement("div");
    bannerContainer.id = "moggcord-updater-root";
    bannerContainer.style.pointerEvents = "none";
    document.body.appendChild(bannerContainer);

    try {
        if (createRoot) {
            bannerRoot = createRoot(bannerContainer);
            bannerRoot.render(<UpdateBanner />);
        } else {
            ReactDOM.render(<UpdateBanner />, bannerContainer);
        }
    } catch (e) {
        UpdateLogger.error("Failed to mount update banner", e);
    }
}

function unmountBanner() {
    try {
        bannerRoot?.unmount();
    } catch { }
    bannerContainer?.remove();
    bannerContainer = null;
    bannerRoot = null;
    showBanner = false;
}

async function checkAndShowBanner() {
    if (IS_UPDATER_DISABLED) return;

    try {
        const outdated = await checkForUpdates();
        if (outdated) {
            mountBanner();
            setBannerVisible(true);
        }
    } catch (e) {
        UpdateLogger.error("Update check failed", e);
    }
}

export default definePlugin({
    name: "MoggcordUpdater",
    enabledByDefault: true,
    description: "Checks for updates on startup. Shows a green banner when a newer version is available on GitHub.",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        setTimeout(() => checkAndShowBanner(), 5000);
    },

    stop() {
        unmountBanner();
        listeners = [];
    },
});
