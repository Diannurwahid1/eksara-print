const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("station", {
  bootstrap: () => ipcRenderer.invoke("station:bootstrap"),
  refreshJobs: () => ipcRenderer.invoke("station:refresh-jobs"),
  getPrinters: () => ipcRenderer.invoke("station:printers"),
  claimTicket: (ticket) => ipcRenderer.invoke("station:claim-ticket", ticket),
  authorizeRelease: (jobId, printerName) => ipcRenderer.invoke("station:authorize-release", jobId, printerName),
  completePrint: (jobId, printerName) => ipcRenderer.invoke("station:complete-print", jobId, printerName),
  virtualSelfTest: () => ipcRenderer.invoke("station:virtual-self-test"),
  onTicket: (callback) => {
    const handler = (_event, ticket) => callback(ticket);
    ipcRenderer.on("station:ticket", handler);
    return () => ipcRenderer.removeListener("station:ticket", handler);
  },
  windowControl: (action) => {
    if (["minimize", "maximize", "close"].includes(action)) ipcRenderer.send("station:window", action);
  }
});
