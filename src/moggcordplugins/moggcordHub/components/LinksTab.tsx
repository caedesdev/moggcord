/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { LinkButton } from "@components/Button";
import { Link } from "@components/Link";
import { React } from "@webpack/common";

import { DISCORD_INVITE, REPO_URL, WEBSITE_URL } from "../releases";

const LINKS = [
    {
        title: "Discord Community",
        description: "Support, updates, and feedback.",
        href: DISCORD_INVITE,
    },
    {
        title: "Website",
        description: "Downloads and documentation.",
        href: WEBSITE_URL,
    },
    {
        title: "GitHub Repository",
        description: "Source code and releases.",
        href: REPO_URL,
    },
    {
        title: "Report an Issue",
        description: "Bug reports and feature requests.",
        href: `${REPO_URL}/issues`,
    },
    {
        title: "Latest Release",
        description: "Download the newest build.",
        href: `${REPO_URL}/releases/latest`,
    },
];

export function LinksTab() {
    return (
        <div className="mhub-links">
            <p className="mhub-muted mhub-links-intro">
                Official Moggcord links and resources.
            </p>
            <div className="mhub-links-list">
                {LINKS.map(link => (
                    <div key={link.href} className="mhub-link-card">
                        <div>
                            <h3 className="mhub-link-card-title">{link.title}</h3>
                            <p className="mhub-muted">{link.description}</p>
                            <Link href={link.href} className="mhub-link-card-url">{link.href}</Link>
                        </div>
                        <LinkButton size="small" href={link.href}>Open</LinkButton>
                    </div>
                ))}
            </div>
        </div>
    );
}
