/*
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { App, WebContents } from "electron";
import { appendFileSync, mkdirSync } from "original-fs";
import { join } from "path";

const LOG_DIR = join(process.env.LOCALAPPDATA || "", "Moggcord");
const LOG_PATH = join(LOG_DIR, "crash-log.txt");

export function crashLogPath() {
    return LOG_PATH;
}

export function crashLog(message: string) {
    try {
        mkdirSync(LOG_DIR, { recursive: true });
        appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
    } catch { /* noop */ }
}

function webContentsUrl(wc: WebContents) {
    try {
        return wc.getURL();
    } catch {
        return "";
    }
}

export function installCrashLogHandlers(app: App) {
    crashLog(`=== session start pid=${process.pid} ===`);

    app.on("before-quit", () => crashLog("before-quit"));
    app.on("will-quit", () => crashLog("will-quit"));

    app.on("render-process-gone", (_event, webContents, details) => {
        const line = `render-process-gone url=${webContentsUrl(webContents)} reason=${details.reason} exitCode=${details.exitCode}`;
        console.error("[Moggcord]", line);
        crashLog(line);
    });

    app.on("child-process-gone", (_event, details) => {
        const line = `child-process-gone type=${details.type} reason=${details.reason} exitCode=${details.exitCode} serviceName=${details.serviceName ?? ""} name=${details.name ?? ""}`;
        console.error("[Moggcord]", line);
        crashLog(line);
    });

    process.on("uncaughtException", err => {
        crashLog(`uncaughtException ${err?.stack ?? err}`);
    });

    process.on("unhandledRejection", reason => {
        crashLog(`unhandledRejection ${String(reason)}`);
    });

    // If Discord dies without renderer logs, the last heartbeat shows when it was still alive.
    setInterval(() => crashLog("heartbeat"), 30_000);
}
