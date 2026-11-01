/*
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface UpdateProgress {
    phase: "idle" | "downloading" | "downloaded" | "installing" | "installed" | "error" | "cancelled";
    receivedBytes: number;
    totalBytes: number | null;
    error?: string;
}
