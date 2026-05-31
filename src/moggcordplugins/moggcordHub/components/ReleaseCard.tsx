/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Link } from "@components/Link";
import { React } from "@webpack/common";

import { formatReleaseDate, type Release } from "../releases";

function linkify(text: string) {
    const parts = text.split(/(https?:\/\/[^\s<]+)/g);
    return parts.map((part, i) =>
        /^https?:\/\//.test(part)
            ? <Link key={i} href={part}>{part}</Link>
            : part
    );
}

function renderBody(body: string) {
    if (!body) {
        return <p className="mhub-release-empty">No release notes provided.</p>;
    }

    const sections = body.split(/\n(?=##\s)/);
    return sections.map((section, i) => {
        const lines = section.split("\n");
        const first = lines[0]?.trim() ?? "";
        const isHeading = first.startsWith("##");
        const title = isHeading ? first.replace(/^#+\s*/, "") : null;
        const content = (isHeading ? lines.slice(1) : lines).join("\n").trim();

        return (
            <div key={i} className="mhub-release-section">
                {title && <h4 className="mhub-release-section-title">{title}</h4>}
                {content && (
                    <div className="mhub-release-body">
                        {content.split("\n").map((line, j) => (
                            <p key={j}>{linkify(line)}</p>
                        ))}
                    </div>
                )}
            </div>
        );
    });
}

export function ReleaseCard({
    release,
    highlighted,
    isCurrent,
}: {
    release: Release;
    highlighted?: boolean;
    isCurrent?: boolean;
}) {
    return (
        <article className={`mhub-release-card${highlighted ? " mhub-release-card-highlight" : ""}`}>
            <header className="mhub-release-header">
                <div className="mhub-release-title-row">
                    <h3 className="mhub-release-title">{release.name}</h3>
                    {isCurrent && <span className="mhub-pill mhub-pill-current">Current</span>}
                    {highlighted && !isCurrent && <span className="mhub-pill mhub-pill-new">New</span>}
                </div>
                <div className="mhub-release-meta">
                    <span className="mhub-release-tag">{release.tag}</span>
                    {release.publishedAt && (
                        <span className="mhub-release-date">{formatReleaseDate(release.publishedAt)}</span>
                    )}
                    <Link href={release.url} className="mhub-release-link">View on GitHub</Link>
                </div>
            </header>
            {renderBody(release.body)}
        </article>
    );
}
