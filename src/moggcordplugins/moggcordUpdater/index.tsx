/*
 * Moggcord — Auto-updater plugin
 * Au lancement : vérifie GitHub, affiche une bannière verte si version distante > locale.
 * Clic "Mettre à jour" : télécharge le Setup.exe via IPC main → le lance automatiquement.
 */

import definePlugin from "@utils/types";
import { React, useState, useEffect } from "@webpack/common";
import { findByPropsLazy } from "@webpack";

// ── Config ────────────────────────────────────────────────────────────────────
const REMOTE_VERSION_URL =
    "https://api.github.com/repos/caedesdev/moggcord/releases/latest";

// ── Version locale (injectée au build via define) ─────────────────────────────
declare const VERSION: string;

function getLocalVersion(): string {
    try { return VERSION; } catch { return "0.0.0"; }
}

// ── Comparaison semver : true seulement si remote > local ─────────────────────
function isStrictlyNewer(remote: string, local: string): boolean {
    const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
    const r = parse(remote);
    const l = parse(local);
    for (let i = 0; i < Math.max(r.length, l.length); i++) {
        const rv = r[i] ?? 0;
        const lv = l[i] ?? 0;
        if (rv > lv) return true;
        if (rv < lv) return false;
    }
    return false;
}

// ── État global ───────────────────────────────────────────────────────────────
interface UpdateInfo {
    remoteVersion: string;
    localVersion: string;
    downloadUrl: string;
}

let pendingUpdate: UpdateInfo | null = null;
let listeners: Array<() => void> = [];
// Anti-boucle : si l'user a déjà cliqué "Mettre à jour" dans cette session, on cache la bannière
let updateAttempted = false;

function notify() { listeners.forEach(f => f()); }

// ── Vérification au lancement ─────────────────────────────────────────────────
async function checkForUpdates() {
    try {
        const localVersion = getLocalVersion();
        const res = await fetch(REMOTE_VERSION_URL);
        if (!res.ok) return;

        const data = await res.json();
        if (!data?.tag_name) return;

        const remoteVersion: string = data.tag_name;
        console.log(`[MoggcordUpdater] local=${localVersion} remote=${remoteVersion}`);

        if (isStrictlyNewer(remoteVersion, localVersion)) {
            pendingUpdate = {
                remoteVersion,
                localVersion,
                downloadUrl: "auto",
            };
            notify();
        }
        // Sinon : rien, pas de bannière
    } catch (e) {
        console.error("[MoggcordUpdater] Check error:", e);
    }
}

// ── Banner React ────────────────────────────────────────────────────────────
function UpdateBanner() {
    const [info, setInfo] = useState<UpdateInfo | null>(pendingUpdate);
    const [dismissed, setDismissed] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fn = () => setInfo(pendingUpdate);
        listeners.push(fn);
        return () => { listeners = listeners.filter(f => f !== fn); };
    }, []);

    if (!info || dismissed || updateAttempted) return null;

    async function doUpdate() {
        if (loading || !info) return;
        setLoading(true);
        updateAttempted = true; // Marquer immédiatement pour éviter les double-clics
        setStatus("Downloading...");

        try {
            const VencordNative = (window as any).VencordNative;
            const ipc = VencordNative?.updater;
            if (!ipc) throw new Error("VencordNative.updater is not available");

            // Étape 1 : fetch GitHub metadata → stocke l'URL du zip dans le main process
            const updateRes: { ok: boolean; value?: boolean; error?: any; } = await ipc.update();
            if (!updateRes?.ok) {
                throw new Error(updateRes?.error?.message ?? "Failed to check for updates");
            }

            // Étape 2 : télécharge le zip + extrait dans dist/ (PowerShell)
            setStatus("✓ Downloaded. Extracting...");
            const buildRes: { ok: boolean; value?: boolean; error?: any; } = await ipc.rebuild();
            if (!buildRes?.ok) {
                // IpcRes ok=false → l'erreur est dans buildRes.error
                const errMsg = buildRes?.error?.message ?? JSON.stringify(buildRes?.error) ?? "Installation failed";
                throw new Error(errMsg);
            }

            setStatus("✓ Update applied. Restarting in 2s...");

            // Redémarrage propre via le handler RELAUNCH_APP du main process
            setTimeout(() => {
                try {
                    VencordNative.moggcord?.relaunch?.();
                } catch {
                    // Fallback Discord Desktop
                    (window as any).DiscordNative?.app?.relaunch?.();
                    window.location.reload();
                }
            }, 2000);
        } catch (e: any) {
            console.error("[MoggcordUpdater] Update error:", e);
            const msg = e?.message ? e.message.substring(0, 120) : "Unknown error";
            setStatus(`❌ ${msg}. Check your connection or restart manually.`);
            setLoading(false);
            updateAttempted = false; // Permet un retry
        }
    }

    return React.createElement("div", {
        style: {
            position: "fixed",
            top: 0, left: 0, right: 0,
            zIndex: 999999,
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
        }
    },
        // Texte gauche
        React.createElement("div", {
            style: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }
        },
            React.createElement("span", { style: { fontWeight: 700, flexShrink: 0 } },
                `🔔 Moggcord ${info.remoteVersion} available!`
            ),
            React.createElement("span", {
                style: { opacity: 0.85, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }
            },
                status ?? `Current version: ${info.localVersion}`
            )
        ),
        // Boutons droite
        React.createElement("div", { style: { display: "flex", gap: 8, flexShrink: 0 } },
            React.createElement("button", {
                onClick: doUpdate,
                disabled: loading,
                style: {
                    background: "rgba(255,255,255,0.2)",
                    border: "1px solid rgba(255,255,255,0.35)",
                    borderRadius: 6,
                    color: "#fff",
                    padding: "4px 14px",
                    cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "inherit",
                }
            }, loading ? "..." : "⬇ Mettre à jour"),
            React.createElement("button", {
                onClick: () => setDismissed(true),
                style: {
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.6)",
                    cursor: "pointer",
                    fontSize: 18,
                    padding: "0 4px",
                    fontFamily: "inherit",
                    lineHeight: 1,
                },
                title: "Dismiss"
            }, "✕")
        )
    );
}

// ── Monte la bannière dans le DOM ─────────────────────────────────────────────
let bannerRoot: any = null;
let bannerContainer: HTMLDivElement | null = null;

function mountBanner() {
    if (bannerContainer || document.getElementById("moggcord-updater-root")) return;
    bannerContainer = document.createElement("div");
    bannerContainer.id = "moggcord-updater-root";
    document.body.appendChild(bannerContainer);

    const ReactDOM = findByPropsLazy("createRoot", "render");
    try {
        if (ReactDOM?.createRoot) {
            bannerRoot = ReactDOM.createRoot(bannerContainer);
            bannerRoot.render(React.createElement(UpdateBanner));
        } else if (ReactDOM?.render) {
            ReactDOM.render(React.createElement(UpdateBanner), bannerContainer);
        }
    } catch (e) {
        console.error("[MoggcordUpdater] Error montage bannière:", e);
    }
}

function unmountBanner() {
    try { bannerRoot?.unmount(); } catch { }
    bannerContainer?.remove();
    bannerContainer = null;
    bannerRoot = null;
}

// ── Plugin ────────────────────────────────────────────────────────────────────
export default definePlugin({
    name: "MoggcordUpdater",
    enabledByDefault: true,
    description: "Checks for updates on startup. Green banner only if a newer version exists on GitHub.",
    authors: [{ name: "Moggcord", id: 0n }],

    start() {
        // Monte la bannière dès que le DOM est prêt
        const mountWhenReady = () => setTimeout(mountBanner, 1500);
        if (document.readyState === "complete") mountWhenReady();
        else window.addEventListener("load", mountWhenReady, { once: true });

        // Vérifie les mises à jour 5s après le lancement
        setTimeout(() => checkForUpdates(), 5000);
    },

    stop() {
        unmountBanner();
        pendingUpdate = null;
        updateAttempted = false;
        listeners = [];
    },
});
