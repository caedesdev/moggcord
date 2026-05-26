const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("worldBombAPI", {
    sequence: (word, lps, humanChance) =>
        ipcRenderer.invoke("WorldBombSequence", word, lps, humanChance)
});
