/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot } from "@utils/modal";
import { React } from "@webpack/common";

import { HubContent, type HubTab } from "./HubContent";

export type { HubTab };

export function HubModal({
    modalProps,
    initialTab = "home",
    highlightTag,
}: {
    modalProps: ModalProps;
    initialTab?: HubTab;
    highlightTag?: string;
}) {
    return (
        <ModalRoot {...modalProps} className="mhub-modal-root">
            <ModalHeader className="mhub-modal-header mhub-modal-header-compact">
                <div className="mhub-modal-header-top">
                    <span className="mhub-modal-title">Moggcord Hub</span>
                    <ModalCloseButton onClick={modalProps.onClose} />
                </div>
            </ModalHeader>
            <ModalContent className="mhub-modal-content mhub-modal-content-embedded">
                <HubContent initialTab={initialTab} highlightTag={highlightTag} />
            </ModalContent>
        </ModalRoot>
    );
}

export function HubPanel({
    initialTab = "home",
    highlightTag,
}: {
    initialTab?: HubTab;
    highlightTag?: string;
}) {
    return <HubContent initialTab={initialTab} highlightTag={highlightTag} panelMode />;
}
