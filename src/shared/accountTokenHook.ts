/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DataStore } from "@api/index";
import { findByProps } from "@webpack";

const MI_TOKEN_CACHE_KEY = "moggcord-mi-token-cache";

let miCacheMemory: Record<string, string> = {};
let miCacheLoaded = false;
let miCacheLoadPromise: Promise<void> | null = null;
let miFlushTimer: ReturnType<typeof setTimeout> | null = null;
let mergeInProgress = false;
let hookInstalled = false;

async function ensureMiCacheLoaded(): Promise<void> {
    if (miCacheLoaded) return;
    if (!miCacheLoadPromise) {
        miCacheLoadPromise = DataStore.get<Record<string, string>>(MI_TOKEN_CACHE_KEY).then(v => {
            miCacheMemory = v ?? {};
            miCacheLoaded = true;
            miCacheLoadPromise = null;
        });
    }
    await miCacheLoadPromise;
}

function scheduleMiCacheFlush(): void {
    if (miFlushTimer) return;
    miFlushTimer = setTimeout(() => {
        miFlushTimer = null;
        void DataStore.set(MI_TOKEN_CACHE_KEY, { ...miCacheMemory }).catch(() => { });
    }, 2500);
}

/** Passive MultiInstance capture only — no TokenImporter injection (caused hangs / RPC storms). */
export async function mergeTokensBeforeEncrypt(tokens: Record<string, string>): Promise<void> {
    if (mergeInProgress) return;
    mergeInProgress = true;
    try {
        await ensureMiCacheLoaded();
        for (const [id, token] of Object.entries(tokens)) {
            if (id && token) miCacheMemory[id] = token;
        }
        scheduleMiCacheFlush();
    } finally {
        mergeInProgress = false;
    }
}

export function installAccountTokenHook(): boolean {
    if (hookInstalled) return true;

    const mod = findByProps("getToken", "encryptAndStoreTokens") as Record<string, unknown> | null;
    if (!mod || typeof mod.encryptAndStoreTokens !== "function") return false;

    const original = (mod.encryptAndStoreTokens as (tokens: Record<string, string>) => Promise<unknown>).bind(mod);
    const wrapped = async (tokens: Record<string, string>) => {
        void mergeTokensBeforeEncrypt(tokens);
        return original(tokens);
    };

    for (const target of [mod, Object.getPrototypeOf(mod)]) {
        if (!target) continue;
        const desc = Object.getOwnPropertyDescriptor(target, "encryptAndStoreTokens");
        if (desc?.configurable === false) continue;
        try {
            Object.defineProperty(target, "encryptAndStoreTokens", {
                value: wrapped,
                writable: true,
                configurable: true,
                enumerable: desc?.enumerable ?? true,
            });
            hookInstalled = true;
            return true;
        } catch { /* try next target */ }
    }

    return false;
}

export async function primeMiTokenCache(): Promise<void> {
    await ensureMiCacheLoaded();
}
