import { find, filters } from "@webpack";
import definePlugin from "@utils/types";

function getMediaSettingsStore(): Record<string, unknown> | null {
    return find(filters.byProps("setNoiseSuppressionLevel", "getNoiseSuppression"), { isIndirect: true }) as Record<string, unknown> | null
        ?? find(filters.byProps("setNoiseSuppression"), { isIndirect: true }) as Record<string, unknown> | null;
}

function getFluxDispatcher(): { subscribe?: (t: string, h: (e: unknown) => void) => void; unsubscribe?: (t: string, h: (e: unknown) => void) => void; } | null {
    return find(filters.byProps("dispatch", "subscribe"), { isIndirect: true }) as ReturnType<typeof getFluxDispatcher>;
}

/**
 * Simulate the Studio → Voice Isolation cycle that users discovered as a
 * workaround. This resets the WebRTC audio pipeline and makes Krisp process
 * only background noise instead of muting the whole microphone signal.
 */
function resetKrispPipeline() {
    try {
        const MediaSettingsStore = getMediaSettingsStore();
        if (!MediaSettingsStore) return;

        const setLevel = MediaSettingsStore.setNoiseSuppressionLevel as ((level: string) => void) | undefined;
        if (typeof setLevel !== "function") return;

        setLevel("studio");

        setTimeout(() => {
            try {
                setLevel("krisp");
                console.log("[FixKrisp] Pipeline reset complete — Krisp correctly initialised.");
            } catch { /* ignore */ }
        }, 400);
    } catch { /* ignore */ }
}

export default definePlugin({
    name: "FixKrisp",
    description: "Forces Krisp (Noise Suppression) to be available and auto-resets the audio pipeline so only background noise is suppressed (not the whole voice).",
    authors: [{ name: "Moggcord", id: 0n }],
    enabledByDefault: true,

    _callCleanup: null as (() => void) | null,

    start() {
        console.log("[FixKrisp] Forcing Krisp eligibility...");
        // Inline <script> is blocked by Discord CSP — native hook runs via webpack patches only.

        const handler = (event: { type?: string; channelId?: string; }) => {
            if (event?.type === "VOICE_CHANNEL_SELECT" && event.channelId) {
                setTimeout(() => resetKrispPipeline(), 1200);
            }
        };

        const FD = getFluxDispatcher();
        FD?.subscribe?.("VOICE_CHANNEL_SELECT", handler);
        this._callCleanup = () => FD?.unsubscribe?.("VOICE_CHANNEL_SELECT", handler);

        setTimeout(() => resetKrispPipeline(), 2000);

        const style = document.createElement("style");
        style.textContent = `
            [aria-label*="Krisp"], [aria-label*="Noise"], [aria-label*="Bruit"], [aria-label*="Réduction"],
            button[class*="noiseCancellation"], div[class*="noiseCancellation"] {
                display: flex !important;
                visibility: visible !important;
                opacity: 1 !important;
                width: auto !important;
                height: auto !important;
            }
        `;
        document.head.appendChild(style);
    },

    patches: [
        {
            find: "MediaEngineStore",
            replacement: [
                {
                    match: /isKrispAvailable\(\){return !?1}/,
                    replace: "isKrispAvailable(){return true}"
                },
                {
                    match: /isKrispSupported\(\){return !?1}/,
                    replace: "isKrispSupported(){return true}"
                },
                {
                    match: /getIsEligible\(\){return !?1}/,
                    replace: "getIsEligible(){return true}"
                },
                {
                    match: /setKrispEnabled\(\i\){/,
                    replace: "$&return Promise.resolve({ok:true});"
                }
            ]
        },
        {
            find: "getKrispExperiment",
            replacement: {
                match: /eligible:!?1/g,
                replace: "eligible:true"
            }
        },
        {
            find: "NoiseCancellationLocations",
            replacement: [
                {
                    match: /isEligible:!?1/g,
                    replace: "isEligible:true"
                },
                {
                    match: /isKrispAvailable:!?1/g,
                    replace: "isKrispAvailable:true"
                }
            ]
        }
    ],

    stop() {
        this._callCleanup?.();
        this._callCleanup = null;
    }
});
