/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Logger } from "@utils/Logger";
import { findComponentByCodeLazy } from "@webpack";
import { useEffect, useState } from "@webpack/common";
import type { ComponentType, MouseEventHandler, ReactNode } from "react";
import { addStealthListener, isStealthModeEnabled, removeStealthListener } from "./HeaderBar";

const PanelButton = findComponentByCodeLazy("tooltipPositionKey", "positionKeyStemOverride") as ComponentType<UserAreaButtonProps>;

export interface UserAreaButtonProps {
    icon: ReactNode;
    tooltipText?: ReactNode;
    onClick?: MouseEventHandler<HTMLDivElement>;
    onContextMenu?: MouseEventHandler<HTMLDivElement>;
    className?: string;
    role?: string;
    "aria-label"?: string;
    "aria-checked"?: boolean;
    disabled?: boolean;
    plated?: boolean;
    redGlow?: boolean;
    orangeGlow?: boolean;
}

export interface UserAreaRenderProps {
    nameplate?: any;
    iconForeground?: string;
    hideTooltips?: boolean;
}

export type UserAreaButtonFactory = (props: UserAreaRenderProps) => ReactNode;

export interface UserAreaButtonData {
    render: UserAreaButtonFactory;
    icon: ComponentType<{ className?: string; }>;
    priority?: number;
}

interface ButtonEntry {
    render: UserAreaButtonFactory;
    priority: number;
}

// Fallback used when Discord's native panel button cannot be resolved on the
// current client version. Without this, rendering an unresolved PanelButton
// throws React error #130 inside the sidebar module and breaks interactivity.
function FallbackUserAreaButton(props: UserAreaButtonProps) {
    const { icon, tooltipText, onClick, onContextMenu, className, role, disabled } = props;
    return (
        <div
            className={className}
            role={role ?? "button"}
            tabIndex={0}
            aria-label={props["aria-label"] ?? (typeof tooltipText === "string" ? tooltipText : undefined)}
            aria-checked={props["aria-checked"]}
            title={typeof tooltipText === "string" ? tooltipText : undefined}
            onClick={disabled ? undefined : onClick}
            onContextMenu={onContextMenu}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1 }}
        >
            {icon}
        </div>
    );
}

// Wrap the native button so a resolution failure renders the fallback instead
// of throwing and taking down the surrounding sidebar subtree.
export const UserAreaButton = ErrorBoundary.wrap((props: UserAreaButtonProps) => <PanelButton {...props} />, {
    fallback: ({ wrappedProps }) => <FallbackUserAreaButton {...(wrappedProps as UserAreaButtonProps)} />
}) as ComponentType<UserAreaButtonProps>;

const logger = new Logger("UserArea");

export const buttons = new Map<string, ButtonEntry>();

export function addUserAreaButton(id: string, render: UserAreaButtonFactory, priority = 0) {
    buttons.set(id, { render, priority });
}

export function removeUserAreaButton(id: string) {
    buttons.delete(id);
}

function UserAreaButtons({ props }: { props: UserAreaRenderProps; }) {
    const [, forceUpdate] = useState(0);

    useEffect(() => {
        const listener = () => forceUpdate(n => n + 1);
        addStealthListener(listener);
        window.addEventListener("moggcord-stealth-change", listener);
        return () => {
            removeStealthListener(listener);
            window.removeEventListener("moggcord-stealth-change", listener);
        };
    }, []);

    if (isStealthModeEnabled()) return null;

    return (
        <div className="vc-user-area-btns" style={{ display: "contents" }}>
            {Array.from(buttons)
                .sort(([, a], [, b]) => a.priority - b.priority)
                .map(([id, { render: Button }]) => (
                    <ErrorBoundary noop key={id} onError={e => logger.error(`Failed to render ${id}`, e.error)}>
                        <Button {...props} />
                    </ErrorBoundary>
                ))}
        </div>
    );
}

export function _renderButtons(props: UserAreaRenderProps) {
    return [<UserAreaButtons key="vc-user-area-buttons" props={props} />];
}
