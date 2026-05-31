/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React, TabBar, useEffect, useState } from "@webpack/common";

import { markGuideSeen, markVersionSeen } from "../whatsNew";
import { ChangelogTab } from "./ChangelogTab";
import { GuideTab } from "./GuideTab";
import { HomeTab } from "./HomeTab";
import { LinksTab } from "./LinksTab";

export type HubTab = "home" | "guide" | "changelog" | "links";

const TAB_LABELS: Record<HubTab, string> = {
    home: "Home",
    guide: "Plugins",
    changelog: "Changelog",
    links: "Links",
};

export function HubContent({
    initialTab = "home",
    highlightTag,
    panelMode = false,
}: {
    initialTab?: HubTab;
    highlightTag?: string;
    panelMode?: boolean;
}) {
    const [tab, setTab] = useState<HubTab>(initialTab);

    useEffect(() => {
        if (tab === "guide") {
            markGuideSeen();
        } else {
            markVersionSeen();
        }
    }, [tab]);

    const bodyClass = tab === "guide"
        ? "mhub-body mhub-body-guide"
        : "mhub-body";

    return (
        <div className={panelMode ? "mhub-page" : "mhub-shell"}>
            <header className={panelMode ? "mhub-page-header" : "mhub-shell-header"}>
                <div className={panelMode ? "mhub-page-header-inner" : undefined}>
                    <div className="mhub-modal-brand">
                        <div className="mhub-modal-logo">M</div>
                        <div className="mhub-modal-brand-text">
                            <h1 className="mhub-modal-title">Moggcord Hub</h1>
                            <p className="mhub-modal-subtitle">News, Changelog & Plugin-Guide</p>
                        </div>
                    </div>
                    <TabBar
                        type="top"
                        look="brand"
                        className="mhub-tab-bar"
                        selectedItem={tab}
                        onItemSelect={item => setTab(item as HubTab)}
                    >
                        {(Object.keys(TAB_LABELS) as HubTab[]).map(id => (
                            <TabBar.Item key={id} id={id} className="mhub-tab-bar-item">
                                {TAB_LABELS[id]}
                            </TabBar.Item>
                        ))}
                    </TabBar>
                </div>
            </header>
            <div className={bodyClass}>
                <div className={panelMode ? "mhub-page-body-inner" : undefined}>
                    {tab === "home" && (
                        <HomeTab
                            compact={panelMode}
                            onOpenChangelog={() => setTab("changelog")}
                            onOpenGuide={() => setTab("guide")}
                        />
                    )}
                    {tab === "guide" && <GuideTab />}
                    {tab === "changelog" && <ChangelogTab highlightTag={highlightTag} />}
                    {tab === "links" && <LinksTab />}
                </div>
            </div>
        </div>
    );
}
