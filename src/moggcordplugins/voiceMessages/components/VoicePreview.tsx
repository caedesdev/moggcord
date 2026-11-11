/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { Paragraph } from "@components/Paragraph";
import { useTimer } from "@utils/react";
import { useEffect, useState } from "@webpack/common";

import { cl } from "..";

const PREVIEW_IDLE_LABEL = "Record or upload audio";
const PREVIEW_RECORDING_LABEL = "RECORDING";

function AudioPreview({ blob }: { blob: Blob; }) {
    const [source, setSource] = useState<{ blob: Blob; url: string; }>();
    const [failedUrl, setFailedUrl] = useState<string>();

    useEffect(() => {
        const url = URL.createObjectURL(blob);
        setSource({ blob, url });
        return () => URL.revokeObjectURL(url);
    }, [blob]);

    if (source?.blob !== blob) return null;
    const { url } = source;

    return (
        <>
            <audio
                key={url}
                aria-label="Voice message preview"
                className={cl("preview-audio")}
                src={url}
                controls
                preload="metadata"
                onError={() => setFailedUrl(url)}
            />
            {failedUrl === url && (
                <Paragraph className={cl("error")} role="alert">This audio could not be played.</Paragraph>
            )}
        </>
    );
}

function PreviewStatus({ recording }: { recording: boolean; }) {
    const durationMs = useTimer({
        deps: [recording]
    });

    const durationSeconds = recording ? Math.floor(durationMs / 1000) : 0;
    const durationDisplay = Math.floor(durationSeconds / 60) + ":" + (durationSeconds % 60).toString().padStart(2, "0");

    return (
        <div className={cl("preview", recording ? "preview-recording" : [])}>
            <div className={cl("preview-indicator")} />
            <div className={cl("preview-time")}>{durationDisplay}</div>
            <div className={cl("preview-label")}>{recording ? PREVIEW_RECORDING_LABEL : PREVIEW_IDLE_LABEL}</div>
        </div>
    );
}

export function VoicePreview({ blob, recording }: { blob?: Blob; recording: boolean; }) {
    return blob && !recording ? <AudioPreview blob={blob} /> : <PreviewStatus recording={recording} />;
}
