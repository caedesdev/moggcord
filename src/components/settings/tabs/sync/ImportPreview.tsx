/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./ImportPreview.css";

import type { PluginImportReport } from "@api/SettingsSync/pluginImport";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { classNameFactory } from "@utils/css";
import { Logger } from "@utils/Logger";
import { closeModal, ModalCloseButton, ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { relaunch } from "@utils/native";
import { React } from "@webpack/common";

const cl = classNameFactory("mc-import-review-");
const logger = new Logger("SettingsImport");

interface Props extends ModalProps {
    report: PluginImportReport;
    apply(): Promise<void>;
}

function PluginList({ names, tone = "ready" }: { names: string[]; tone?: "ready" | "missing" | "muted"; }) {
    return <ul className={cl("list", tone)}>{names.map(name => <li key={name} title={name}><span className={cl("plugin-name")}>{name}</span></li>)}</ul>;
}

function ImportIcon({ kind }: { kind: "file" | "check" | "alert"; }) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {kind === "file" ? <>
            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M14 3v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </> : <>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            {kind === "check"
                ? <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                : <path d="M12 7v6m0 4v.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
        </>}
    </svg>;
}

export function ImportPreview({ report, apply, ...props }: Props) {
    const [phase, setPhase] = React.useState<"review" | "importing" | "done" | "error">("review");
    const busy = phase === "importing";
    const done = phase === "done";
    const missing = report.missing.length + report.incompatible.length;

    async function confirm() {
        if (busy) return;
        setPhase("importing");
        try {
            await apply();
            setPhase("done");
        } catch (error) {
            logger.error("Import failed", error);
            setPhase("error");
        }
    }

    return (
        <ModalRoot {...props} size={ModalSize.LARGE} className={cl("root")} aria-label="Review settings import">
            <ModalHeader className={cl("header")}>
                <div className={cl("heading")}>
                    <div className={cl("header-icon")}><ImportIcon kind={done ? "check" : "file"} /></div>
                    <div>
                        <span className={cl("eyebrow")}>SETTINGS BACKUP</span>
                        <Heading tag="h2">{done ? "Import complete" : "Review your import"}</Heading>
                        <p>{done ? "Your settings are saved. Choose when to restart." : "See what carries over before you import."}</p>
                    </div>
                </div>
                {!busy && <ModalCloseButton onClick={props.onClose} />}
            </ModalHeader>
            <ModalContent className={cl("content")}>
                <div className={cl("stats")}>
                    <div><span>In this backup</span><strong>{report.configured}</strong><small>saved entries</small></div>
                    <div><span>Switched on</span><strong>{report.enabledInBackup}</strong><small>enabled in backup</small></div>
                    <div className={cl("stat-highlight")}><span>After restart</span><strong>{report.projectedEnabled.length}</strong><small>enabled after import</small></div>
                </div>
                <div className={cl("status", done ? "success" : "info")} role="status" aria-live="polite">
                    <ImportIcon kind={done ? "check" : "file"} />
                    <div><strong>{done ? "Settings saved" : busy ? "Importing your settings" : "Ready to import"}</strong>
                        <p>{done ? "Fully restart Discord to load the available plugins."
                            : busy ? "Keep Discord open while your settings are saved."
                                : "The backup's on/off choices are preserved. Your other plugins stay as they are."}</p>
                    </div>
                </div>
                {phase === "error" && <p className={cl("error")} role="alert">The import could not finish. Try again, or close this window and choose another backup. Discord has not been restarted.</p>}
                {missing > 0 && (
                    <section className={cl("section", "missing-section")}>
                        <div className={cl("section-heading")}><ImportIcon kind="alert" /><h3>Not included in this build</h3><span className={cl("count")}>{missing}</span></div>
                        <p>Their settings are kept. You can add compatible plugin files later. Restarting does not install them.</p>
                        <PluginList names={report.missing} tone="missing" />
                        {report.incompatible.map(({ name, target }) => <p key={name}><strong>{name}</strong> is unavailable on this client ({target}).</p>)}
                    </section>
                )}
                <details className={cl("section", "accordion")}>
                    <summary><span>Included and ready</span><span className={cl("count", "ready-count")}>{report.ready.length}</span></summary>
                    <p>Already included in Moggcord. No separate download is needed.</p>
                    <PluginList names={report.ready} />
                </details>
                <details className={cl("section", "accordion")}>
                    <summary><span>Internal helpers</span><span className={cl("count")}>{report.internal.length}</span></summary>
                    <p>These APIs and helpers do not count as ordinary enabled plugins. Moggcord manages them and their dependencies.</p>
                    <PluginList names={report.internal} tone="muted" />
                </details>
                <details className={cl("section", "accordion")}>
                    <summary><span>Disabled in this backup</span><span className={cl("count")}>{report.disabled.length}</span></summary>
                    <p>They remain disabled. {report.missingDisabled.length > 0 && `${report.missingDisabled.length} are also not included in this build.`}</p>
                    <PluginList names={report.disabled} tone="muted" />
                </details>
                {report.unchanged.length > 0 && <details className={cl("section", "accordion")}>
                    <summary><span>Keep current on/off choice</span><span className={cl("count")}>{report.unchanged.length}</span></summary>
                    <p>Their current enabled state is preserved.</p>
                    <PluginList names={report.unchanged} tone="muted" />
                </details>}
                <details className={cl("section", "accordion")}>
                    <summary><span>Your plugins after restart</span><span className={cl("count", "active-count")}>{report.projectedEnabled.length}</span></summary>
                    <PluginList names={report.projectedEnabled} />
                </details>
                <p className={cl("footnote")}>Backups contain settings, not plugin files. Only available user plugins count toward the active total.</p>
            </ModalContent>
            <ModalFooter className={cl("footer")}>
                <span className={cl("footer-note")}>{done ? "You can restart whenever you're ready." : "Nothing changes until you confirm."}</span>
                {done ? <>
                    <Button className={cl("primary-button")} onClick={() => { props.onClose(); relaunch(); }}>Restart Discord</Button>
                    <Button className={cl("secondary-button")} variant="secondary" onClick={props.onClose}>Restart later</Button>
                </> : <>
                    <Button className={cl("primary-button")} onClick={confirm} disabled={busy}>{busy ? "Importing..." : "Import settings"}</Button>
                    <Button className={cl("secondary-button")} variant="secondary" onClick={props.onClose} disabled={busy}>Cancel</Button>
                </>}
            </ModalFooter>
        </ModalRoot>
    );
}

const SafeImportPreview = ErrorBoundary.wrap(ImportPreview);

export function reviewPluginImport(report: PluginImportReport, onImport: () => Promise<void>): Promise<boolean> {
    return new Promise(resolve => {
        let applied = false;
        let pending: Promise<void> | undefined;
        const apply = () => pending ??= Promise.resolve().then(onImport).then(() => { applied = true; }).finally(() => { pending = undefined; });
        const key = openModal(props => <SafeImportPreview {...props} report={report} apply={apply} />, {
            onCloseRequest: () => { if (!pending) closeModal(key); },
            onCloseCallback: () => resolve(applied)
        });
    });
}
