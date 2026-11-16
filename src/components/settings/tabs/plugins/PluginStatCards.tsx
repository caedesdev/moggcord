/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { BaseText } from "@components/BaseText";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { Tooltip } from "@webpack/common";
import type { ReactNode } from "react";

const cl = classNameFactory("vc-plugin-stats-");

interface ManagementStatsCardProps {
    title: string;
    totalLabel: string;
    progressLabel: string;
    total: number;
    enabled: number;
    onDisableAll?: () => void;
    disableAllDisabled?: boolean;
    settingsButton?: ReactNode;
}

export function ManagementStatsCard({ title, totalLabel, progressLabel, total, enabled, onDisableAll, disableAllDisabled, settingsButton }: ManagementStatsCardProps) {
    const percentage = total ? Math.min(100, Math.round(enabled / total * 1000) / 10) : 0;

    return (
        <div className={classes("vc-plugin-stats", "vc-stockplugins-stats-card", cl("management"))}>
            <div className={cl("management-header")}>
                <BaseText size="lg" weight="bold">{title}</BaseText>
                <div className={cl("management-actions")}>
                    {settingsButton}
                    {onDisableAll && (
                        <button type="button" className={cl("disable-all")} disabled={disableAllDisabled} onClick={onDisableAll}>
                            Disable All
                        </button>
                    )}
                </div>
            </div>
            <div className="vc-plugin-stats-card-container">
                <div className="vc-plugin-stats-card-section">
                    <BaseText size="xl" weight="bold">{enabled}</BaseText>
                    <BaseText size="md" weight="semibold">Enabled</BaseText>
                </div>
                <div className="vc-plugin-stats-card-divider"></div>
                <div className="vc-plugin-stats-card-section">
                    <BaseText size="xl" weight="bold">{total}</BaseText>
                    <BaseText size="md" weight="semibold">{totalLabel}</BaseText>
                </div>
            </div>
            <div className={cl("progress-row")}>
                <div
                    className={cl("progress-track")}
                    role="progressbar"
                    aria-label={progressLabel}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percentage}
                >
                    <div className={cl("progress-fill")} style={{ width: `${percentage}%` }} />
                </div>
                <BaseText size="md" weight="semibold">{percentage}%</BaseText>
            </div>
        </div>
    );
}

export function UserPluginsCard({ totalUserPlugins, enabledUserPlugins }) {
    if (totalUserPlugins === 0)
        return (
            <div className="vc-plugin-stats vc-stockplugins-stats-card">
                <div className="vc-plugin-stats-card-container ">
                    <div className="vc-plugin-stats-card-section">
                        <BaseText size="md" weight="semibold">Total Userplugins</BaseText>
                        <Tooltip
                            text={
                                <img
                                    src="https://discord.com/assets/ab6835d2922224154ddf.svg"
                                    style={{ width: "40px", height: "40px" }}
                                />
                            }
                        >
                            {tooltipProps => (
                                <span style={{ display: "inline", position: "relative" }}>
                                    <BaseText size="xl" weight="bold" {...tooltipProps}>
                                        {totalUserPlugins}
                                    </BaseText>
                                </span>
                            )}
                        </Tooltip>
                    </div>
                </div>
            </div>
        );
    else
        return (
            <div className="vc-plugin-stats vc-stockplugins-stats-card">
                <div className="vc-plugin-stats-card-container">
                    <div className="vc-plugin-stats-card-section">
                        <BaseText size="md" weight="semibold">Enabled Userplugins</BaseText>
                        <BaseText size="xl" weight="bold">{enabledUserPlugins}</BaseText>
                    </div>
                    <div className="vc-plugin-stats-card-divider"></div>
                    <div className="vc-plugin-stats-card-section">
                        <BaseText size="md" weight="semibold">Total Userplugins</BaseText>
                        <BaseText size="xl" weight="bold">{totalUserPlugins}</BaseText>
                    </div>
                </div>
            </div>
        );
}
