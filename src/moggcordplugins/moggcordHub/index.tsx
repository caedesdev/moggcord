/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { NavigationRouter, React } from "@webpack/common";

import { HubPanel, type HubTab } from "./components/HubModal";
import { getCurrentVersionTag, hasSeenGuide, hasUnseenRelease, markGuideSeen, markVersionSeen } from "./whatsNew";
import "./styles.css";

const HUB_ROUTE = "/collectibles-shop";

let showBadge = false;
let pendingPanelTab: HubTab = "home";

function openHubRoute(tab: HubTab = "home") {
    pendingPanelTab = tab;
    NavigationRouter.transitionTo(HUB_ROUTE);
}

function HubNavIcon(props: React.ComponentProps<"svg">) {
    return (
        <svg width={props.width ?? 20} height={props.height ?? 20} viewBox="0 0 24 24" fill="none" {...props}>
            <path
                fill="currentColor"
                d="M12 2 2 7v10l10 5 10-5V7L12 2Zm0 2.18 7.5 3.75L12 11.68 4.5 7.93 12 4.18ZM4 9.03l7 3.5v7.19l-7-3.5V9.03Zm9 10.69v-7.19l7-3.5v7.19l-7 3.5Z"
            />
        </svg>
    );
}

function renderHubPanel() {
    const tab = pendingPanelTab;
    pendingPanelTab = "home";
    return <HubPanel initialTab={tab} highlightTag={getCurrentVersionTag()} />;
}

async function maybeShowOnboarding() {
    if (!(await hasSeenGuide())) {
        openHubRoute("guide");
        await markGuideSeen();
        showBadge = false;
        return;
    }

    if (!(await hasUnseenRelease())) return;

    openHubRoute("changelog");
    await markVersionSeen();
    showBadge = false;
}

export default definePlugin({
    name: "MoggcordHub",
    description: "News hub in the DM sidebar (Shop slot): changelog, plugin guide, and links.",
    authors: [{ name: "Moggcord", id: 0n }],
    enabledByDefault: true,
    required: true,

    patches: [
        {
            find: 'name:"CollectiblesShop"',
            replacement: {
                match: /createPromise:\(\)=>Promise\.all\(\[[^\]]*\]\)\.then\(\i\.bind\(\i,\d+\)\),webpackId:(\d+),name:"CollectiblesShop"/,
                replace: "createPromise:()=>Promise.resolve({default:$self.renderPanelComponent()}),webpackId:$1,name:\"CollectiblesShop\"",
            },
        },
        {
            find: "render:vL(),disableTrack:!0",
            replacement: {
                match: /render:vL\(\),disableTrack:!0/g,
                replace: "render:$self.createHubRouteRenderer(),disableTrack:!0",
            },
        },
        {
            // Fallback inside vL's inner render function (find uses minified `t`, not `tab`)
            find: "t===AV.G2.GAME_SHOPS&&null!=n",
            replacement: {
                match: /return Object\.values\(\i\.G2\)\.includes\(t\)\?\(0,\i\.jsx\)\(\i,\{tab:t,\.\.\.e\}\):\(0,\i\.jsx\)\(\i,\{\.\.\.e\}\)/,
                replace: "return $self.renderShopRoute(e)",
            },
        },
        {
            find: "shopButtonDisplayOptions:s,dismissShopButtonDC:a",
            replacement: {
                match: /icon:\i\?\?\i\.U,text:na\.intl\.string\(na\.t\.pWG4ze\)/,
                replace: "icon:$self.renderNavIcon(),text:\"Moggcord Hub\"",
            },
        },
    ],

    async start() {
        showBadge = await hasUnseenRelease();
        setTimeout(() => { maybeShowOnboarding(); }, 4000);
    },

    stop() {
        showBadge = false;
    },

    renderNavIcon() {
        return HubNavIcon;
    },

    createHubRouteRenderer() {
        return function MoggcordHubRoute(_props: unknown) {
            return renderHubPanel();
        };
    },

    renderShopRoute(_props: unknown) {
        return renderHubPanel();
    },

    renderPanelComponent() {
        const tab = pendingPanelTab;
        pendingPanelTab = "home";
        const highlightTag = getCurrentVersionTag();
        return function MoggcordHubPanel() {
            return <HubPanel initialTab={tab} highlightTag={highlightTag} />;
        };
    },
});

export { openMoggcordHub } from "./openHub";
