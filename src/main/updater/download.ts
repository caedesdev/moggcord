/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { checkedFetch } from "@main/utils/http";
import { createWriteStream } from "original-fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

const STALL_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60_000;
const MAX_UPDATE_BYTES = 512 * 1024 * 1024;

export async function downloadUpdateFile(url: string, destination: string, signal: AbortSignal, expectedBytes: number | null, onProgress: (received: number, total: number | null) => void) {
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();

    const stalled = () => controller.abort(new Error("The download stopped responding for 30 seconds. Check your connection and try again."));
    let stallTimer = setTimeout(stalled, STALL_TIMEOUT_MS);
    const totalTimer = setTimeout(() => controller.abort(new Error("The download took longer than 10 minutes. Please try again.")), DOWNLOAD_TIMEOUT_MS);

    try {
        const response = await checkedFetch(url, { signal: controller.signal });
        if (!response.body) throw new Error("The update download was empty. Please try again.");
        const contentLength = Number(response.headers.get("content-length"));
        const total = expectedBytes ?? (contentLength > 0 ? contentLength : null);
        if (total && total > MAX_UPDATE_BYTES) throw new Error("The update exceeds the allowed download size.");
        let received = 0;
        onProgress(received, total);
        clearTimeout(stallTimer);
        stallTimer = setTimeout(stalled, STALL_TIMEOUT_MS);
        const progress = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                received += chunk.length;
                if (received > (total ?? MAX_UPDATE_BYTES)) return callback(new Error("The update size does not match the release. Please try again."));
                clearTimeout(stallTimer);
                stallTimer = setTimeout(stalled, STALL_TIMEOUT_MS);
                onProgress(received, total);
                callback(null, chunk);
            }
        });
        const body = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
        await pipeline(body, progress, createWriteStream(destination, { flags: "wx" }), { signal: controller.signal });
        if (!received || (total && received !== total)) throw new Error("The update download was incomplete. Please try again.");
    } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        controller.abort(error);
        throw error;
    } finally {
        clearTimeout(stallTimer);
        clearTimeout(totalTimer);
        signal.removeEventListener("abort", cancel);
    }
}
