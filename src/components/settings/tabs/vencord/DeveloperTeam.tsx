/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./DeveloperTeam.css";

import { Card } from "@components/Card";
import ErrorBoundary from "@components/ErrorBoundary";
import { Heading } from "@components/Heading";
import { OwnerCrownIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { fetchUserProfile } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { Avatar, React, UserStore, useStateFromStores } from "@webpack/common";

const cl = classNameFactory("vc-developer-team-");
const logger = new Logger("DeveloperTeam");
const OWNER_IDS = ["95630197306433536", "124942147727261696", "726084725441036310"];
const REFRESH_INTERVAL = 60_000;

export default ErrorBoundary.wrap(function DeveloperTeam() {
    const users = useStateFromStores([UserStore], () => OWNER_IDS.map(id => UserStore.getUser(id)));
    const [loaded, setLoaded] = React.useState(false);
    const [failed, setFailed] = React.useState<string[]>([]);

    React.useEffect(() => {
        let active = true;
        let pending = false;
        const refresh = async () => {
            if (pending) return;
            pending = true;
            const results = await Promise.allSettled(OWNER_IDS.map(id => fetchUserProfile(id, undefined, false)));
            if (active) {
                setLoaded(true);
                setFailed(OWNER_IDS.filter((_, index) => results[index].status === "rejected"));
                results.forEach((result, index) => {
                    if (result.status === "rejected") logger.warn(`Could not refresh Discord profile ${OWNER_IDS[index]}`, result.reason);
                });
            }
            pending = false;
        };
        const refreshVisible = () => { if (!document.hidden) void refresh(); };
        void refresh();
        const timer = setInterval(refreshVisible, REFRESH_INTERVAL);
        window.addEventListener("focus", refreshVisible);
        return () => {
            active = false;
            clearInterval(timer);
            window.removeEventListener("focus", refreshVisible);
        };
    }, []);

    return (
        <div className={cl("grid")}>
            {OWNER_IDS.map((id, index) => {
                const user = users[index];
                const name = user?.globalName ?? user?.username ?? (loaded ? "Discord profile unavailable" : "Loading profile…");
                return (
                    <Card key={id} className={cl("member")} variant="primary" outline title={`Discord ID: ${id}`}>
                        <Avatar src={user?.getAvatarURL(undefined, 128, true)} size="SIZE_48" aria-label={name} />
                        <div className={cl("details")}>
                            <Heading tag="h3" className={cl("name")}>{name}</Heading>
                            <Heading tag="h4" className={cl("role")}><OwnerCrownIcon />Owner</Heading>
                            <Paragraph size="xs" className={cl("username")}>{user ? `@${user.username}` : id}</Paragraph>
                            {user && failed.includes(id) && <Paragraph size="xs">Couldn’t refresh profile.</Paragraph>}
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}, { noop: true });
