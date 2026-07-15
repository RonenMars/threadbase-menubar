import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	sendStatus: (status: { ok: boolean }) =>
		ipcRenderer.send("status-update", status),
	getLoginSetting: (): Promise<boolean> =>
		ipcRenderer.invoke("get-login-setting"),
	setLoginSetting: (enable: boolean) =>
		ipcRenderer.send("set-login-setting", enable),
	quit: () => ipcRenderer.send("quit"),
	close: () => ipcRenderer.send("close-window"),
	openLogs: () => ipcRenderer.send("open-logs"),
	closeLogs: () => ipcRenderer.send("close-logs"),
	platform: process.platform,
});
