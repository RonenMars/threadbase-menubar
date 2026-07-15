import { app, ipcMain, screen, BrowserWindow } from "electron";
import { menubar } from "menubar";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createIcon } from "./icons";

function readPortFromServerYaml(): number | null {
	try {
		const yamlPath = path.join(os.homedir(), ".threadbase", "server.yaml");
		const contents = fs.readFileSync(yamlPath, "utf8");
		const match = contents.match(/^\s*port\s*:\s*(\d+)\s*$/m);
		if (!match) return null;
		const parsed = parseInt(match[1], 10);
		return Number.isFinite(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

const port = process.env.THREADBASE_PORT
	? parseInt(process.env.THREADBASE_PORT, 10)
	: (readPortFromServerYaml() ?? 8766);

// ── Config ──────────────────────────────────────────────────────────────────

interface Config {
	configured: boolean;
}

function configPath(): string {
	return path.join(app.getPath("userData"), "config.json");
}

function readConfig(): Config {
	try {
		return JSON.parse(fs.readFileSync(configPath(), "utf8"));
	} catch {
		return { configured: false };
	}
}

function writeConfig(config: Config): void {
	fs.mkdirSync(path.dirname(configPath()), { recursive: true });
	fs.writeFileSync(configPath(), JSON.stringify(config));
}

// ── Login item (Linux needs manual autostart file) ───────────────────────────

const LINUX_AUTOSTART = path.join(
	os.homedir(),
	".config",
	"autostart",
	"threadbase-menubar.desktop",
);

function loginItemOptions(): { path?: string; args?: string[] } {
	if (app.isPackaged) return {};
	return { path: process.execPath, args: [app.getAppPath()] };
}

function getLoginSetting(): boolean {
	if (process.platform === "linux") return fs.existsSync(LINUX_AUTOSTART);
	return app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

function setLoginSetting(enable: boolean): void {
	if (process.platform === "linux") {
		if (enable) {
			const exec = app.isPackaged
				? process.execPath
				: `${process.execPath} ${app.getAppPath()}`;
			fs.mkdirSync(path.dirname(LINUX_AUTOSTART), { recursive: true });
			fs.writeFileSync(
				LINUX_AUTOSTART,
				`[Desktop Entry]\nType=Application\nName=Threadbase Menubar\nExec=${exec}\nHidden=false\nX-GNOME-Autostart-enabled=true\n`,
			);
		} else {
			try {
				fs.unlinkSync(LINUX_AUTOSTART);
			} catch {}
		}
		return;
	}
	app.setLoginItemSettings({
		openAtLogin: enable,
		openAsHidden: true,
		...loginItemOptions(),
	});
}

// ── Logs Window ──────────────────────────────────────────────────────────────

let logsWindow: BrowserWindow | null = null;

function createLogsWindow(): void {
	if (logsWindow && !logsWindow.isDestroyed()) {
		logsWindow.focus();
		return;
	}

	logsWindow = new BrowserWindow({
		width: 900,
		height: 600,
		minWidth: 600,
		minHeight: 400,
		title: "Threadbase Logs",
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	logsWindow.loadFile(path.join(__dirname, "logs-viewer/index.html"), {
		query: { port: port.toString() },
	});

	logsWindow.once("ready-to-show", () => {
		logsWindow?.show();
	});

	logsWindow.on("closed", () => {
		logsWindow = null;
	});
}

// ── App ──────────────────────────────────────────────────────────────────────

const mb = menubar({
	index: `file://${path.join(__dirname, "renderer/index.html")}?port=${port}`,
	icon: createIcon("stopped"),
	windowPosition: "bottomRight",
	browserWindow: {
		width: 360,
		height: 420,
		resizable: false,
		movable: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	},
	preloadWindow: true,
});

function centerWindow(): void {
	if (!mb.window) return;
	const { workArea } = screen.getPrimaryDisplay();
	const [w, h] = mb.window.getSize();
	mb.window.setPosition(
		workArea.x + Math.round((workArea.width - w) / 2),
		workArea.y + Math.round((workArea.height - h) / 2),
	);
}

function positionUnderTray(trayBounds: Electron.Rectangle): void {
	if (!mb.window) return;
	const display = screen.getDisplayMatching(trayBounds);
	const { workArea } = display;
	const [w, h] = mb.window.getSize();
	const trayCenterX = trayBounds.x + Math.round(trayBounds.width / 2);
	const x = Math.min(
		Math.max(trayCenterX - Math.round(w / 2), workArea.x),
		workArea.x + workArea.width - w,
	);
	const y = Math.min(
		trayBounds.y + trayBounds.height,
		workArea.y + workArea.height - h,
	);
	mb.window.setPosition(x, y);
}

function displayIdContaining(rect: Electron.Rectangle): number {
	return screen.getDisplayMatching(rect).id;
}

mb.on("ready", () => {
	mb.tray.setToolTip("Threadbase Streamer");
	mb.window?.on("blur", () => mb.hideWindow());
	if (!readConfig().configured) {
		centerWindow();
		mb.showWindow();
	}

	if (process.platform === "darwin") {
		mb.tray.removeAllListeners("click");
		mb.tray.removeAllListeners("double-click");
		let lastClick = 0;
		mb.tray.on("click", (_event, bounds) => {
			const now = Date.now();
			if (now - lastClick < 300) return;
			lastClick = now;
			const win = mb.window;
			if (!win) return;
			if (win.isVisible()) {
				const sameDisplay =
					displayIdContaining(win.getBounds()) === displayIdContaining(bounds);
				if (sameDisplay && win.isFocused()) {
					win.hide();
				} else {
					positionUnderTray(bounds);
					win.show();
					win.focus();
				}
			} else {
				positionUnderTray(bounds);
				win.show();
			}
		});
	}
});

if (process.platform === "win32") {
	mb.on("after-create-window", () => {
		mb.window?.setOpacity(0);
		mb.window?.on("show", () => {
			centerWindow();
			mb.window?.setOpacity(1);
		});
	});
}

ipcMain.on("status-update", (_event, status: { ok: boolean }) => {
	mb.tray.setImage(createIcon(status.ok ? "running" : "stopped"));
});

ipcMain.handle("get-login-setting", () => getLoginSetting());

ipcMain.on("set-login-setting", (_event, enable: boolean) => {
	setLoginSetting(enable);
	writeConfig({ configured: true });
});

ipcMain.on("close-window", () => {
	mb.window?.hide();
});

ipcMain.on("quit", () => app.quit());

ipcMain.on("open-logs", () => {
	createLogsWindow();
});

ipcMain.on("close-logs", () => {
	if (logsWindow && !logsWindow.isDestroyed()) {
		logsWindow.close();
	}
});
