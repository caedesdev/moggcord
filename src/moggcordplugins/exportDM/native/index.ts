/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { dialog, IpcMainInvokeEvent } from "electron";

interface NativePreparedFile {
    path: string;
    content: string | Uint8Array | ArrayBuffer | number[];
}

interface NativePreparedChannelExport {
    name: string;
    files: NativePreparedFile[];
}

interface NativeSaveResult {
    ok: boolean;
    canceled?: boolean;
    path?: string;
    error?: string;
}

async function pathExists(filePath: string) {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function safeSegment(name: string, fallback = "DM") {
    const cleaned = name
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);

    return cleaned || fallback;
}

async function getUniquePath(parent: string, baseName: string) {
    const safeName = safeSegment(baseName, "Moggcord DM Folder");

    for (let i = 0; i < 100; i++) {
        const candidate = path.join(parent, i === 0 ? safeName : `${safeName}_${i}`);
        if (!await pathExists(candidate)) return candidate;
    }

    return path.join(parent, `${safeName}_${Date.now()}`);
}

function getSafeRelativePath(relativePath: string) {
    const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    if (path.isAbsolute(normalized) || normalized.startsWith("..")) throw new Error("Invalid export file path");
    return normalized;
}

function toWriteContent(content: NativePreparedFile["content"]) {
    if (typeof content === "string") return content;
    if (content instanceof ArrayBuffer) return Buffer.from(content);
    return Buffer.from(content);
}

async function writePreparedFiles(root: string, files: NativePreparedFile[]) {
    for (const file of files) {
        const relativePath = getSafeRelativePath(file.path);
        const targetPath = path.resolve(root, relativePath);
        const rootPath = path.resolve(root);

        if (targetPath !== rootPath && !targetPath.startsWith(`${rootPath}${path.sep}`))
            throw new Error("Invalid export file path");

        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, toWriteContent(file.content));
    }
}

export async function saveExportFolder(_event: IpcMainInvokeEvent, rootName: string, exports: NativePreparedChannelExport[]): Promise<NativeSaveResult> {
    try {
        const result = await dialog.showOpenDialog({
            title: "Save Moggcord DM export",
            properties: ["openDirectory", "createDirectory"]
        });

        if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };

        const root = await getUniquePath(result.filePaths[0], rootName);
        await mkdir(root, { recursive: true });

        for (const channelExport of exports) {
            const target = exports.length === 1
                ? root
                : await getUniquePath(root, channelExport.name);

            await mkdir(target, { recursive: true });
            await writePreparedFiles(target, channelExport.files);
        }

        return { ok: true, path: root };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
