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
    return <ul className={cl("list", tone)}>{names.map(name => <li key={name}>{name}</li>)}</ul>;
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
                <div>
                    <span className={cl("eyebrow")}>SETTINGS BACKUP</span>
                    <Heading tag="h2">{done ? "Import complete" : "Review your import"}</Heading>
                </div>
                {!busy && <ModalCloseButton onClick={props.onClose} />}
            </ModalHeader>
            <ModalContent className={cl("content")}>
                <p className={cl("intro")}>A backup contains settings, not plugin files. Included plugins are already installed and only need a restart.</p>
                <div className={cl("stats")}>
                    <div><strong>{report.configured}</strong><span>saved entries</span></div>
                    <div><strong>{report.enabledInBackup}</strong><span>enabled in backup</span></div>
                    <div><strong>{report.projectedEnabled.length}</strong><span>enabled after import</span></div>
                </div>
                <div className={cl("status", done ? "success" : "info")} role="status" aria-live="polite">
                    {done ? "Settings saved. Fully restart Discord to load the available plugins."
                        : busy ? "Saving your settings. Keep Discord open..."
                            : "Available plugins use the backup's on/off choices. Your other plugin choices stay as they are."}
                </div>
                {phase === "error" && <p className={cl("error")} role="alert">The import could not finish. Try again, or close this window and choose another backup. Discord has not been restarted.</p>}
                {missing > 0 && (
                    <section className={cl("section", "missing-section")}>
                        <h3>{missing} enabled {missing === 1 ? "entry needs" : "entries need"} attention</h3>
                        <p>These plugins cannot be activated from this backup alone. Their settings are kept, but their plugin code must be installed separately. You can import now and add compatible missing plugins later. Restarting does not install them.</p>
                        <PluginList names={report.missing} tone="missing" />
                        {report.incompatible.map(({ name, target }) => <p key={name}><strong>{name}</strong> is unavailable on this client ({target}).</p>)}
                    </section>
                )}
                <details className={cl("section")} open>
                    <summary>{report.ready.length} available plugins enabled by this backup</summary>
                    <p>Already included in Moggcord. No separate download is needed.</p>
                    <PluginList names={report.ready} />
                </details>
                <details className={cl("section")}>
                    <summary>{report.internal.length} internal entries managed by Moggcord</summary>
                    <p>These APIs and helpers do not count as ordinary enabled plugins. Moggcord manages them and their dependencies.</p>
                    <PluginList names={report.internal} tone="muted" />
                </details>
                <details className={cl("section")}>
                    <summary>{report.disabled.length} entries disabled in the backup</summary>
                    <p>They remain disabled. {report.missingDisabled.length > 0 && `${report.missingDisabled.length} are also not included in this build.`}</p>
                    <PluginList names={report.disabled} tone="muted" />
                </details>
                {report.unchanged.length > 0 && <details className={cl("section")}>
                    <summary>{report.unchanged.length} entries without an on/off choice</summary>
                    <p>Their current enabled state is preserved.</p>
                    <PluginList names={report.unchanged} tone="muted" />
                </details>}
                <details className={cl("section")}>
                    <summary>Expected enabled plugin list after restart ({report.projectedEnabled.length})</summary>
                    <PluginList names={report.projectedEnabled} />
                </details>
            </ModalContent>
            <ModalFooter className={cl("footer")}>
                {done ? <>
                    <Button onClick={() => { props.onClose(); relaunch(); }}>Restart Discord</Button>
                    <Button variant="secondary" onClick={props.onClose}>Restart later</Button>
                </> : <>
                    <Button onClick={confirm} disabled={busy}>{busy ? "Importing..." : "Import settings"}</Button>
                    <Button variant="secondary" onClick={props.onClose} disabled={busy}>Cancel</Button>
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
