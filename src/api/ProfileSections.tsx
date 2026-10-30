/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { React } from "@webpack/common";
import type { ComponentType } from "react";

export interface ProfileSectionProps {
    userId: string;
    isSideBar: boolean;
}

export interface ProfileSectionData {
    render: ComponentType<ProfileSectionProps>;
    priority?: number;
}

const sections = new Map<string, ProfileSectionData>();
const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

export function addProfileSection(id: string, render: ProfileSectionData["render"], priority = 0) {
    sections.set(id, { render, priority });
    notify();
}

export function removeProfileSection(id: string) {
    if (sections.delete(id)) notify();
}

function ProfileSections(props: ProfileSectionProps) {
    const [, update] = React.useReducer((value: number) => value + 1, 0);
    React.useEffect(() => {
        listeners.add(update);
        return () => { listeners.delete(update); };
    }, []);
    return Array.from(sections)
        .sort(([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0))
        .map(([id, { render: Section }]) => (
            <ErrorBoundary noop key={id}>
                <Section {...props} />
            </ErrorBoundary>
        ));
}

export function renderProfileSections(props: ProfileSectionProps) {
    return <ProfileSections {...props} />;
}
