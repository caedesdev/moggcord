/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { openModal } from "@utils/modal";
import { React } from "@webpack/common";

import { HubModal, type HubTab } from "./components/HubModal";

export type { HubTab };

export function openMoggcordHub(initialTab: HubTab = "home", highlightTag?: string) {
    openModal(props => (
        <HubModal
            modalProps={props}
            initialTab={initialTab}
            highlightTag={highlightTag}
        />
    ));
}
