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

interface StockPluginsCardProps {
    totalStockPlugins: number;
    enabledStockPlugins: number;
    onDisableAll?: () => void;
    settingsButton?: ReactNode;
}

export function StockPluginsCard({ totalStockPlugins, enabledStockPlugins, onDisableAll, settingsButton }: StockPluginsCardProps) {
    const percentage = totalStockPlugins ? Math.min(100, Math.round(enabledStockPlugins / totalStockPlugins * 1000) / 10) : 0;

    return (
        <div className={classes("vc-plugin-stats", "vc-stockplugins-stats-card", cl("management"))}>
            <div className={cl("management-header")}>
                <BaseText size="lg" weight="bold">Plugin Management</BaseText>
                <div className={cl("management-actions")}>
                    {settingsButton}
                    {onDisableAll && (
                        <button type="button" className={cl("disable-all")} onClick={onDisableAll}>
                            Disable All
                        </button>
                    )}
                </div>
            </div>
            <div className="vc-plugin-stats-card-container">
                <div className="vc-plugin-stats-card-section">
                    <BaseText size="xl" weight="bold">{enabledStockPlugins}</BaseText>
                    <BaseText size="md" weight="semibold">Enabled</BaseText>
                </div>
                <div className="vc-plugin-stats-card-divider"></div>
                <div className="vc-plugin-stats-card-section">
                    <BaseText size="xl" weight="bold">{totalStockPlugins}</BaseText>
                    <BaseText size="md" weight="semibold">Total</BaseText>
                </div>
            </div>
            <div className={cl("progress-row")}>
                <div
                    className={cl("progress-track")}
                    role="progressbar"
                    aria-label="Enabled plugins"
                    aria-valuemin={0}
                    aria-valuemax={totalStockPlugins}
                    aria-valuenow={enabledStockPlugins}
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
