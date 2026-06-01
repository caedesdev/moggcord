/*
 * Equicord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addHeaderBarButton, HeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { showToast, Toasts } from "@webpack/common";
import { PluginNative } from "@utils/types";
import definePlugin from "@utils/types";
import { t } from "../autoTranslateMoggcord";
import { openModal, ModalRoot, ModalHeader, ModalContent, ModalCloseButton } from "@utils/modal";
import { React, useState, useRef, useEffect, useCallback, useMemo } from "@webpack/common";
import { Forms } from "@webpack/common";
import { DataStore } from "@api/index";
import { find, filters } from "@webpack";
import "./styles.css";

const Native = VencordNative.pluginHelpers.TokenImporter as PluginNative<typeof import("./native")> | undefined;

function toast(msg: string, type = Toasts.Type.MESSAGE) {
    try {
        showToast(msg, type);
        return;
    } catch { /* webpack toast module may be missing on this Discord build */ }
    try {
        Toasts.show(Toasts.create(msg, type));
        return;
    } catch { /* noop */ }
    console.warn("[TokenImporter]", msg);
}

function assertNative(): Native is PluginNative<typeof import("./native")> {
    if (Native?.checkToken) return true;
    toast("Token Importer native module missing — run pnpm build && pnpm inject:dev, then restart Discord.", Toasts.Type.FAILURE);
    return false;
}
const STORE_KEY = "TokenImporter_accounts";

interface SavedAccount { id: string; token: string; username: string; discriminator: string; avatar: string; }

let accountsCache: SavedAccount[] | null = null;
let loadPromise: Promise<SavedAccount[]> | null = null;

function getAccounts(): Promise<SavedAccount[]> {
    if (accountsCache !== null) return Promise.resolve(accountsCache);
    if (!loadPromise) {
        loadPromise = DataStore.get<SavedAccount[]>(STORE_KEY).then(v => {
            accountsCache = v ?? [];
            loadPromise = null;
            return accountsCache;
        });
    }
    return loadPromise;
}

async function saveAccounts(accounts: SavedAccount[]): Promise<void> {
    const unique = new Map<string, SavedAccount>();
    for (const a of accounts) {
        if (!unique.has(a.id)) unique.set(a.id, a);
    }
    const deduplicated = Array.from(unique.values());
    accountsCache = deduplicated;
    await DataStore.set(STORE_KEY, deduplicated);
}

function switchToAccount(token: string, userId?: string) {
    try {
        const isMultiInstance = window.location.href.includes("multi-instance=true") || (window as any).IS_MULTI_INSTANCE;
        if (isMultiInstance && userId) {
            if (typeof VencordNative?.pluginHelpers?.MultiInstance?.openInstanceWindow === "function") {
                VencordNative.pluginHelpers.MultiInstance.openInstanceWindow(token, userId, true);
                window.close();
                return;
            }
        }

        // Do not dispatch fake CONNECTION_OPEN / LOGIN_SUCCESS — that leaves Discord in a
        // half-connected state where stores request guild members on a closing WebSocket.
        window.localStorage.setItem("token", `"${token}"`);
        const iframe = document.createElement("iframe");
        iframe.style.display = "none";
        document.body.appendChild(iframe);
        try {
            (iframe as any).contentWindow.localStorage.token = `"${token}"`;
        } catch { }
        document.body.removeChild(iframe);

        location.reload();
    } catch (err) {
        console.error("[TokenImporter] Switch failed:", err);
        location.reload();
    }
}

function copyMyToken() {
    try {
        const tokenModule = find(filters.byProps("getToken"), { isIndirect: true }) as { getToken?: () => string; } | null;
        const token = tokenModule?.getToken?.();
        if (token) {
            if (typeof window.DiscordNative?.clipboard?.copy === "function") {
                window.DiscordNative.clipboard.copy(token);
            } else {
                navigator.clipboard.writeText(token);
            }
            toast("Token copied!", Toasts.Type.SUCCESS);
        }
    } catch { /* noop */ }
}

function FolderIcon({ width = 20, height = 20, style }: { width?: number; height?: number; style?: React.CSSProperties; }) {
    return <svg width={width} height={height} viewBox="0 0 24 24" fill="currentColor" style={style}><path d="M2 5a3 3 0 0 1 3-3h3.93a2 2 0 0 1 1.66.9L12 5h7a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5Z" /></svg>;
}

function TrashIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2h4a1 1 0 1 1 0 2h-1.1l-.9 12.1A3 3 0 0 1 17 23H7a3 3 0 0 1-3-2.9L3.1 8H2a1 1 0 0 1 0-2h4V4Zm2 0v2h6V4H9ZM5.1 8l.9 11.9a1 1 0 0 0 1 .1h6a1 1 0 0 0 1-.1L14.9 8H5.1Z" /></svg>;
}

function CopyIcon() {
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z" /></svg>;
}

function CheckIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>;
}

function CrossIcon() {
    return <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>;
}

const TOKEN_REGEX = /(?:mfa\.[\w-]{84}|[\w-]{24,26}\.[\w-]{4,7}\.[\w-]{27,40})/g;

function extractTokens(raw: string): string[] {
    const found = new Set<string>();
    TOKEN_REGEX.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_REGEX.exec(raw)) !== null) found.add(m[0]);
    return Array.from(found);
}

interface TokenResult { token: string; status: "pending" | "checking" | "valid" | "invalid" | "error" | "rate_limited"; username?: string; avatar?: string; id?: string; errorHint?: string; }

const TOKEN_CHECK_DELAY_MS = 2200;
const TOKEN_CHECK_MAX_ATTEMPTS = 5;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let verifyQueue: Promise<void> = Promise.resolve();

function enqueueTokenCheck<T>(fn: () => Promise<T>): Promise<T> {
    const run = verifyQueue.then(fn, fn);
    verifyQueue = run.then(() => { }, () => { });
    return run;
}

function decodeUserIdInRenderer(token: string): string | null {
    if (token.startsWith("mfa.")) return null;
    const part = token.split(".")[0];
    if (!part) return null;

    try {
        const fromNative = Native?.decodeTokenUserId?.(token);
        if (fromNative && /^\d{17,20}$/.test(fromNative)) return fromNative;
    } catch { /* noop */ }

    try {
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const decoded = atob(padded);
        if (/^\d{17,20}$/.test(decoded)) return decoded;
    } catch { /* noop */ }

    return null;
}

function storageKeyForToken(token: string): string {
    const userId = decodeUserIdInRenderer(token);
    if (userId) return userId;
    let h = 0;
    for (let i = 0; i < token.length; i++) h = ((h << 5) - h + token.charCodeAt(i)) | 0;
    return token.startsWith("mfa.") ? `mfa_${Math.abs(h)}` : `tok_${Math.abs(h)}`;
}

function defaultAvatarForStorageId(id: string): string {
    try {
        const idx = Number(BigInt(id) >> 22n) % 6n;
        return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
        return `https://cdn.discordapp.com/embed/avatars/${Math.abs(h) % 6}.png`;
    }
}

type SaveWithoutVerifyResult = "added" | "duplicate" | "invalid";

async function addTokenWithoutVerify(token: string): Promise<SaveWithoutVerifyResult> {
    const trimmed = token.trim();
    if (!trimmed || extractTokens(trimmed).length !== 1) return "invalid";

    const id = storageKeyForToken(trimmed);
    const existing = await getAccounts();
    if (existing.some(a => a.token === trimmed || a.id === id)) return "duplicate";

    const userId = decodeUserIdInRenderer(trimmed);
    existing.push({
        id,
        token: trimmed,
        username: userId ? `User ${userId.slice(-4)}` : (trimmed.startsWith("mfa.") ? "MFA account" : "Imported token"),
        discriminator: "0",
        avatar: defaultAvatarForStorageId(userId ?? id),
    });
    await saveAccounts(existing);
    return "added";
}

function statusLabel(status: TokenResult["status"], errorHint?: string) {
    switch (status) {
        case "valid": return "OK";
        case "checking": return "...";
        case "rate_limited": return "Rate limit";
        case "error": return errorHint === "timeout" ? "Timeout" : errorHint === "network_error" ? "Network error" : errorHint ?? "Error";
        case "invalid": return "Invalid token";
        default: return "Unknown";
    }
}

function statusBadgeText(status: TokenResult["status"], errorHint?: string) {
    switch (status) {
        case "checking": return "...";
        case "rate_limited": return "Limit";
        case "error":
            if (errorHint === "timeout") return "Time";
            if (errorHint === "network_error") return "Net";
            return "!";
        case "invalid": return "X";
        default: return "?";
    }
}

async function verifyTokenWithRetry(token: string, maxAttempts = TOKEN_CHECK_MAX_ATTEMPTS): Promise<{ valid: boolean; user?: any; error?: string; }> {
    return enqueueTokenCheck(async () => {
        if (!Native?.checkToken) return { valid: false, error: "native_missing" };
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result = await Native.checkToken(token);
            if (result.valid || result.error !== "rate_limited") return result;
            const waitMs = ((result as { retryAfter?: number; }).retryAfter ?? 8) * 1000 + attempt * 1000;
            await sleep(waitMs);
        }
        return { valid: false, error: "rate_limited" };
    });
}

function TokenModal({ rootProps }: { rootProps: any; }) {
    const [accounts, setAccounts] = useState<SavedAccount[]>(() => accountsCache ?? []);
    const [loaded, setLoaded] = useState(() => accountsCache !== null);
    const [verifying, setVerifying] = useState(false);
    const [statuses, setStatuses] = useState<Record<string, string>>({});
    const [tab, setTab] = useState<"saved" | "add">("saved");
    const [pasteValue, setPaste] = useState("");
    const [detectedCount, setDetectedCount] = useState(0);
    const [results, setResults] = useState<TokenResult[]>([]);
    const [checking, setChecking] = useState(false);
    const [done, setDone] = useState(false);
    const [copied, setCopied] = useState(false);
    const [accountSearch, setAccountSearch] = useState("");
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const filteredAccounts = useMemo(() => {
        if (!accountSearch.trim()) return accounts;
        const lowSearch = accountSearch.toLowerCase();
        return accounts.filter(a => a.username.toLowerCase().includes(lowSearch) || a.id.includes(lowSearch));
    }, [accounts, accountSearch]);

    const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const verifyGenRef = useRef(0);

    useEffect(() => {
        return () => {
            verifyGenRef.current += 1;
            if (detectTimer.current) clearTimeout(detectTimer.current);
        };
    }, []);

    useEffect(() => {
        if (accountsCache !== null) {
            setAccounts(accountsCache);
            setLoaded(true);
            return;
        }
        let cancelled = false;
        getAccounts().then(v => {
            if (!cancelled) { setAccounts(v); setLoaded(true); }
        });
        return () => { cancelled = true; };
    }, []);

    const handleTabChange = useCallback((newTab: "saved" | "add") => {
        setTab(newTab);
        if (newTab === "saved" && accountsCache !== null) {
            setAccounts(accountsCache);
        }
    }, []);

    async function removeAccount(id: string) {
        const updated = accounts.filter(a => a.id !== id);
        setAccounts(updated);
        await saveAccounts(updated);
    }

    async function verifyAll() {
        if (verifying) return; setVerifying(true);
        const ns: Record<string, string> = {};
        for (const acc of accounts) {
            ns[acc.id] = "checking"; setStatuses({ ...ns });
            try { const r = await verifyTokenWithRetry(acc.token); ns[acc.id] = r.valid ? "valid" : "invalid"; } catch { ns[acc.id] = "error"; }
            setStatuses({ ...ns });
            await sleep(TOKEN_CHECK_DELAY_MS);
        }
        const toKeep = accounts.filter(a => ns[a.id] !== "invalid");
        if (toKeep.length !== accounts.length) { setAccounts(toKeep); await saveAccounts(toKeep); }
        setVerifying(false);
    }

    async function processTokens(raw: string) {
        if (checking) return;
        if (!assertNative()) return;

        const tokens = extractTokens(raw);
        if (!tokens.length) {
            setResults([{ token: "No tokens found", status: "invalid" }]);
            toast("No valid token format detected. Paste a full Discord token.", Toasts.Type.FAILURE);
            return;
        }

        const runId = ++verifyGenRef.current;
        const initial: TokenResult[] = tokens.map(t => ({ token: t, status: "pending" as const }));
        const updated = [...initial];

        setResults(initial);
        setChecking(true);
        setDone(false);
        setStatusMessage(null);

        try {
            const existing = [...(await getAccounts())];
            let accountsChanged = false;
            let addedCount = 0;

            for (let i = 0; i < tokens.length; i++) {
                if (runId !== verifyGenRef.current) return;

                updated[i] = { ...updated[i], status: "checking" };
                setResults([...updated]);

                try {
                    const result = await verifyTokenWithRetry(tokens[i]);
                    if (runId !== verifyGenRef.current) return;

                    if (result.valid && result.user) {
                        const u = result.user;
                        const av = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=64`
                            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;
                        if (!existing.find(a => a.id === u.id)) {
                            existing.push({
                                id: u.id,
                                token: tokens[i],
                                username: u.global_name || u.username,
                                discriminator: u.discriminator ?? "0",
                                avatar: av,
                            });
                            accountsChanged = true;
                            addedCount++;
                        }
                        updated[i] = { ...updated[i], status: "valid", username: u.global_name || u.username, id: u.id, avatar: av };
                    } else {
                        updated[i] = {
                            ...updated[i],
                            status: result.error === "rate_limited" ? "rate_limited" : result.error ? "error" : "invalid",
                            errorHint: result.error,
                        };
                    }
                } catch {
                    updated[i] = { ...updated[i], status: "error" };
                }

                setResults([...updated]);
                await sleep(TOKEN_CHECK_DELAY_MS);
            }

            if (runId !== verifyGenRef.current) return;

            if (accountsChanged) {
                await saveAccounts(existing);
                setAccounts([...existing]);
                toast(`Added ${addedCount} account(s).`, Toasts.Type.SUCCESS);
            }

            const validCount = updated.filter(r => r.status === "valid").length;
            const invalidCount = updated.filter(r => r.status === "invalid").length;
            const errorCount = updated.filter(r => r.status === "error" || r.status === "rate_limited").length;

            if (validCount === 0 && invalidCount === 0 && errorCount > 0) {
                const rateLimited = updated.filter(r => r.status === "rate_limited").length;
                const msg = rateLimited > 0
                    ? "Discord Rate-Limit (HTTP 429) — 1–3 Min. warten oder „Ohne Prüfung hinzufügen“. FakeFriends belasten das nicht direkt."
                    : "Verifikation fehlgeschlagen (Timeout/Netzwerk). Erneut versuchen oder ohne Prüfung hinzufügen.";
                setStatusMessage(msg);
                toast(msg, Toasts.Type.FAILURE);
            } else if (validCount === 0 && invalidCount > 0) {
                const msg = `${invalidCount} invalid token${invalidCount !== 1 ? "s" : ""}.`;
                setStatusMessage(msg);
                toast(msg, Toasts.Type.FAILURE);
            } else if (validCount > 0) {
                setStatusMessage(`${validCount} account${validCount !== 1 ? "s" : ""} added.`);
            }

            const rateLimited = updated.filter(r => r.status === "rate_limited").length;
            if (rateLimited > 0 && validCount > 0) {
                toast(`Discord rate limit — ${rateLimited} token(s) not checked. Wait 1–2 min and retry.`, Toasts.Type.MESSAGE);
            }
        } catch (err) {
            console.error("[TokenImporter] processTokens failed:", err);
            toast("Token verification failed — see console (Ctrl+Shift+I).", Toasts.Type.FAILURE);
        } finally {
            if (runId === verifyGenRef.current) {
                setChecking(false);
                setDone(true);
            }
        }
    }

    function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => processTokens(ev.target?.result as string ?? "");
        reader.readAsText(file); e.target.value = "";
    }

    function handlePasteChange(val: string) {
        setPaste(val);
        if (detectTimer.current) clearTimeout(detectTimer.current);
        detectTimer.current = setTimeout(() => {
            setDetectedCount(extractTokens(val.slice(0, 4096)).length);
        }, 200);
    }

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader separator={false}>
                <Forms.FormTitle tag="h4" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, color: "#ffffff" }}>
                    <FolderIcon width={16} height={16} /> Token Importer
                </Forms.FormTitle>
                <ModalCloseButton onClick={rootProps.onClose} />
            </ModalHeader>
            <ModalContent className="ti-content">
                <p className="ti-hint">
                    „Verify &amp; Add“ fragt Discords API ab (Rate-Limit möglich). „Ohne Prüfung“ speichert lokal.
                    Meldungen wie <code>sentry-ipc://…</code> in der Konsole sind normaler Discord-/Sentry-Lärm, kein Token-Fehler.
                </p>
                <div className="ti-tabs">
                    <button className={`ti-tab ${tab === "saved" ? "ti-tab--active" : ""}`} onClick={() => handleTabChange("saved")}>
                        Saved accounts
                        {accounts.length > 0 && <span className="ti-tab-count">{accounts.length}</span>}
                    </button>
                    <button className={`ti-tab ${tab === "add" ? "ti-tab--active" : ""}`} onClick={() => handleTabChange("add")}>
                        Paste tokens
                    </button>
                </div>

                {tab === "saved" && (
                    <>
                        <div className="ti-bar">
                            <div className="ti-search-wrap">
                                <input className="ti-search-input" placeholder={t("Search accounts...")} value={accountSearch} onChange={e => setAccountSearch(e.target.value)} />
                                {accountSearch && <button className="ti-search-clear" onClick={() => setAccountSearch("")}>✕</button>}
                            </div>
                            <button className="ti-verify-btn" style={{ marginRight: 6 }} onClick={async () => {
                                if (verifying || !assertNative()) return;
                                setVerifying(true);
                                try {
                                    const tokens = await Native.findLocalTokens();
                                    const existing = await getAccounts();
                                    let addedCount = 0;
                                    for (const tok of tokens) {
                                        if (!existing.find(a => a.token === tok)) {
                                            const verified = await verifyTokenWithRetry(tok);
                                            if (verified.valid && verified.user) {
                                                const u = verified.user;
                                                const av = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.webp?size=64`
                                                    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id) >> 22n) % 6n}.png`;
                                                if (!existing.find(a => a.id === u.id)) {
                                                    existing.push({ id: u.id, token: tok, username: u.global_name || u.username, discriminator: u.discriminator ?? "0", avatar: av });
                                                    addedCount++;
                                                }
                                            }
                                            await sleep(TOKEN_CHECK_DELAY_MS);
                                        }
                                    }
                                    if (addedCount > 0) {
                                        await saveAccounts(existing);
                                        setAccounts([...existing]);
                                        toast(`${addedCount} new account${addedCount !== 1 ? "s" : ""} imported!`, Toasts.Type.SUCCESS);
                                    } else {
                                        toast("No new accounts found.", Toasts.Type.MESSAGE);
                                    }
                                } catch (err) {
                                    console.error("[TokenImporter] Scan failed:", err);
                                } finally {
                                    setVerifying(false);
                                }
                            }}>
                                <FolderIcon width={12} height={12} style={{ marginRight: 4 }} /> Scan local Discords
                            </button>
                            <button className="ti-verify-btn" style={{ marginRight: 6, opacity: copied ? 0.7 : 1 }} onClick={() => { copyMyToken(); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                                {copied ? "Copied ✓" : "My Token"}
                            </button>
                            <button className="ti-verify-btn" onClick={verifyAll} disabled={verifying || !loaded}>
                                {verifying ? "Stopping..." : "Verify all"}
                            </button>
                        </div>
                        {!loaded ? <div className="ti-empty" style={{ opacity: 0.5 }}>Loading accounts...</div>
                            : accounts.length === 0 ? <div className="ti-empty">No accounts — add tokens via the tab above.</div>
                                : filteredAccounts.length === 0 ? <div className="ti-empty">No accounts match your search.</div>
                                    : <div className="ti-list">
                                        {filteredAccounts.map(a => {
                                            const st = statuses[a.id] ?? "idle";
                                            return (
                                                <div key={a.id} className={`ti-row ti-row--${st === "invalid" ? "invalid" : st === "error" ? "warn" : st === "valid" ? "valid" : "idle"}`}>
                                                    {a.avatar ? <img src={a.avatar} className="ti-avatar" alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                                        : <div className="ti-avatar ti-avatar--ph">{a.username?.[0]?.toUpperCase() ?? "?"}</div>}
                                                    <div className="ti-row-info">
                                                        <span className="ti-username">
                                                            {a.username}{a.discriminator && a.discriminator !== "0" ? `#${a.discriminator}` : ""}
                                                            {st === "valid" && <span className="ti-st ti-st--ok"><CheckIcon /></span>}
                                                            {st === "invalid" && <span className="ti-st ti-st--bad"><CrossIcon /></span>}
                                                            {st === "checking" && <span className="ti-st ti-st--loading">...</span>}
                                                        </span>
                                                        <span className="ti-token-hidden" onClick={() => navigator.clipboard.writeText(a.token)} title="Copy token" style={{ cursor: "pointer" }}>••••••••••••••••••••••••</span>
                                                    </div>
                                                    <div className="ti-row-actions">
                                                        <button className="ti-switch-btn" onClick={() => switchToAccount(a.token, a.id)}>Switch</button>
                                                        <button className="ti-del-btn" style={{ color: "#b9bbbe" }} title="Copy Token" onClick={() => {
                                                            const native = (window as any).DiscordNative?.clipboard?.copy;
                                                            if (typeof native === "function") native(a.token);
                                                            else navigator.clipboard.writeText(a.token);
                                                            toast("Token copied!", Toasts.Type.SUCCESS);
                                                        }}><CopyIcon /></button>
                                                        <button className="ti-del-btn" title="Delete" onClick={() => removeAccount(a.id)}><TrashIcon /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                        }
                    </>
                )}

                {tab === "add" && (
                    <div className="ti-add-body">
                        <textarea className="ti-textarea" placeholder="Paste your Discord tokens here... (1 per line, or pasted together)" value={pasteValue} onChange={e => handlePasteChange(e.target.value)} />
                        <div className="ti-add-footer">
                            <span className="ti-detected">{detectedCount} token{detectedCount !== 1 ? "s" : ""} detected</span>
                            <button className="ti-file-btn" onClick={() => fileRef.current?.click()}>File .txt</button>
                            <button className="ti-submit-btn" disabled={checking || !pasteValue.trim()} onClick={() => {
                                const count = extractTokens(pasteValue).length;
                                setDetectedCount(count);
                                void processTokens(pasteValue);
                            }}>
                                {checking ? "Checking..." : "Verify & Add"}
                            </button>
                            <button
                                className="ti-file-btn"
                                disabled={checking || !pasteValue.trim()}
                                title="Speichert ohne Discord-API — bei Rate-Limit nutzen"
                                onClick={async () => {
                                    const tokens = extractTokens(pasteValue);
                                    if (!tokens.length) {
                                        toast("Kein Token erkannt.", Toasts.Type.FAILURE);
                                        return;
                                    }
                                    setChecking(true);
                                    setStatusMessage(null);
                                    try {
                                        let added = 0;
                                        let duplicate = 0;
                                        let invalid = 0;
                                        for (const tok of tokens) {
                                            const r = await addTokenWithoutVerify(tok);
                                            if (r === "added") added++;
                                            else if (r === "duplicate") duplicate++;
                                            else invalid++;
                                            await sleep(50);
                                        }
                                        const existing = await getAccounts();
                                        setAccounts([...existing]);
                                        const parts = [
                                            added ? `${added} gespeichert` : null,
                                            duplicate ? `${duplicate} schon in der Liste` : null,
                                            invalid ? `${invalid} ungültig (Format prüfen)` : null,
                                        ].filter(Boolean);
                                        const msg = parts.length
                                            ? `${parts.join(", ")}. „Switch“ testet den Login.`
                                            : "Nichts gespeichert — Token-Format prüfen (ein Token pro Zeile).";
                                        setStatusMessage(msg);
                                        toast(msg, added ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
                                        if (added) {
                                            setPaste("");
                                            setDetectedCount(0);
                                        }
                                    } finally {
                                        setChecking(false);
                                    }
                                }}
                            >
                                Ohne Prüfung
                            </button>
                        </div>
                        <input ref={fileRef} type="file" accept=".txt,text/plain" style={{ display: "none" }} onChange={handleFile} />
                        {statusMessage && <div className="ti-status-msg">{statusMessage}</div>}
                        {results.length > 0 && (
                            <div className="ti-results">
                                {done && (
                                    <div className="ti-results-summary">
                                        <span className="ti-summary-stat ti-summary-stat--ok">
                                            <CheckIcon /> {results.filter(r => r.status === "valid").length} valid
                                        </span>
                                        <span className="ti-summary-stat ti-summary-stat--bad">
                                            <CrossIcon /> {results.filter(r => r.status === "invalid").length} invalid
                                        </span>
                                        {results.some(r => r.status === "error" || r.status === "rate_limited") && (
                                            <span className="ti-summary-stat ti-summary-stat--warn">
                                                {results.filter(r => r.status === "error" || r.status === "rate_limited").length} failed
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="ti-list">
                                    {results.map((r, i) => (
                                        <div key={i} className={`ti-row ti-row--${r.status === "valid" ? "valid" : r.status === "checking" ? "idle" : r.status === "invalid" ? "invalid" : "warn"}`}>
                                            {r.status === "valid" && r.avatar ? <img src={r.avatar} className="ti-avatar" alt="" />
                                                : <div className="ti-avatar ti-avatar--ph">{r.status === "checking" ? "..." : "?"}</div>}
                                            <div className="ti-row-info">
                                                {r.status === "valid" ? <span className="ti-username">{r.username}</span>
                                                    : <span className="ti-token-hidden" onClick={() => navigator.clipboard.writeText(r.token)} title="Copy token" style={{ cursor: "pointer" }}>{r.status === "checking" ? "Checking..." : "••••••••••••••••••••••••"}</span>}
                                            </div>
                                            <span className={`ti-badge ti-badge--${r.status === "rate_limited" || r.status === "error" ? "warn" : r.status === "valid" ? "valid" : "invalid"}`} title={statusLabel(r.status, r.errorHint)}>
                                                {r.status === "valid" ? <CheckIcon /> : r.status === "checking" ? "..." : r.status === "invalid" ? <CrossIcon /> : statusBadgeText(r.status, r.errorHint)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function TokenImporterButton() {
    return <HeaderBarButton icon={FolderIcon} tooltip="Token Importer" onClick={() => openModal(props => <TokenModal rootProps={props} />)} />;
}

export default definePlugin({
    name: "TokenImporter",
    enabledByDefault: true,
    description: "Import and verify Discord tokens.",
    authors: [{ name: "Moggcord", id: 0n }],
    dependencies: ["HeaderBarAPI", "AccountTokenBridge"],
    start() {
        addHeaderBarButton("moggcord-token-importer", () => <TokenImporterButton />, 10);
    },
    stop() {
        removeHeaderBarButton("moggcord-token-importer");
        accountsCache = null;
    },
});
