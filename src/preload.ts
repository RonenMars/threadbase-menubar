import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  sendStatus: (status: { ok: boolean }) =>
    ipcRenderer.send("status-update", status),
  quit: () => ipcRenderer.send("quit"),
});
