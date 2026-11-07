/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Moggcord contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export default definePluginSettings({
    fakeMute: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Appear muted to others while Fake Deafen is enabled."
    },
    fakeDeafen: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Appear deafened to others while Fake Deafen is enabled."
    },
    showButton: {
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true,
        description: "Show the Fake Deafen button beside your audio controls."
    },
    enableKeybind: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Toggle Fake Deafen with Ctrl+Shift+Q."
    }
});
