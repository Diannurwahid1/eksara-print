const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("printBridge", { load: () => ipcRenderer.invoke("station-print:source") });
