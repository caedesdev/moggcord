/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2025 Vendicated and Vesktop contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { app, BrowserWindow, ipcMain } from "electron";
import { autoUpdater, UpdateInfo } from "electron-updater";
import { join } from "path";
import { IpcEvents, UpdaterIpcEvents } from "shared/IpcEvents";
import { STATIC_DIR } from "shared/paths";
import { Millis } from "shared/utils/millis";

import { State } from "./settings";
import { handle } from "./utils/ipcWrappers";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { loadView } from "./vesktopStatic";

let updaterWindow: BrowserWindow | null = null;

autoUpdater.on("update-available", update => {
    if (State.store.updater?.ignoredVersion === update.version) return;
    if ((State.store.updater?.snoozeUntil ?? 0) > Date.now()) return;
    // Anti-boucle : si on vient de télécharger et installer cette version, ne pas ré-ouvrir
    if (update.version === app.getVersion()) return;
    // Si la fenêtre updater est déjà ouverte pour cette version, ne pas en ouvrir une autre
    if (updaterWindow && !updaterWindow.isDestroyed()) return;

    openUpdater(update);
});

let updateDownloaded = false;
autoUpdater.on("update-downloaded", () => {
    updateDownloaded = true;
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 100);
});
autoUpdater.on("download-progress", p =>
    updaterWindow?.webContents.send(UpdaterIpcEvents.DOWNLOAD_PROGRESS, p.percent)
);
autoUpdater.on("error", err => updaterWindow?.webContents.send(UpdaterIpcEvents.ERROR, err.message));

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
autoUpdater.fullChangelog = true;

// Anti-boucle : on vérifie si l'app vient juste de se mettre à jour
// en comparant la version installée avec la dernière version vérifiée
let lastCheckedVersion: string | null = null;

const isOutdated = autoUpdater.checkForUpdates().then(res => {
    if (!res?.isUpdateAvailable) return false;
    // Si l'update est déjà téléchargée (on vient de redémarrer après install), ignorer
    if (res.updateInfo?.version === app.getVersion()) return false;
    lastCheckedVersion = res.updateInfo?.version ?? null;
    return true;
});

handle(IpcEvents.UPDATER_IS_OUTDATED, () => isOutdated);
handle(IpcEvents.UPDATER_OPEN, async () => {
    const res = await autoUpdater.checkForUpdates();
    if (res?.isUpdateAvailable && res.updateInfo) openUpdater(res.updateInfo);
});

function openUpdater(update: UpdateInfo) {
    updaterWindow = new BrowserWindow({
        title: "Moggcord Updater",
        autoHideMenuBar: true,
        ...(process.platform === "win32"
            ? { icon: join(STATIC_DIR, "icon.ico") }
            : process.platform === "linux"
              ? { icon: join(STATIC_DIR, "icon.png") }
              : {}),
        webPreferences: {
            preload: join(__dirname, "updaterPreload.js")
        },
        minHeight: 400,
        minWidth: 750
    });
    makeLinksOpenExternally(updaterWindow);

    handle(UpdaterIpcEvents.GET_DATA, () => ({ update, version: app.getVersion() }));
    handle(UpdaterIpcEvents.INSTALL, async () => {
        await autoUpdater.downloadUpdate();
    });
    handle(UpdaterIpcEvents.SNOOZE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.snoozeUntil = Date.now() + 1 * Millis.DAY;
        updaterWindow?.close();
    });
    handle(UpdaterIpcEvents.IGNORE_UPDATE, () => {
        State.store.updater ??= {};
        State.store.updater.ignoredVersion = update.version;
        updaterWindow?.close();
    });

    updaterWindow.on("closed", () => {
        ipcMain.removeHandler(UpdaterIpcEvents.GET_DATA);
        ipcMain.removeHandler(UpdaterIpcEvents.INSTALL);
        ipcMain.removeHandler(UpdaterIpcEvents.SNOOZE_UPDATE);
        ipcMain.removeHandler(UpdaterIpcEvents.IGNORE_UPDATE);
        updaterWindow = null;
    });

    loadView(updaterWindow, "updater/index.html");
}
