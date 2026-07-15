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
	fetchLogs: (opts?: {
		since?: number;
		before?: number;
		limit?: number;
		source?: string;
	}): Promise<{
		ok: boolean;
		logs?: string[];
		offset?: number;
		oldestIndex?: number;
		total?: number;
		hasOlder?: boolean;
		truncated?: boolean;
		source?: string;
		error?: string;
		status?: number;
	}> => ipcRenderer.invoke("fetch-logs", opts ?? {}),
	platform: process.platform,
});
