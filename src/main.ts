import { app, ipcMain, screen, BrowserWindow } from "electron";
import { menubar } from "menubar";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createIcon } from "./icons";

const TRACK_LOG = path.join(os.homedir(), ".threadbase", "menubar-track.log");
function trackLog(msg: string, data?: unknown): void {
	const line = `${new Date().toISOString()} ${msg}${data !== undefined ? " " + JSON.stringify(data) : ""}\n`;
	try {
		fs.mkdirSync(path.dirname(TRACK_LOG), { recursive: true });
		fs.appendFileSync(TRACK_LOG, line);
	} catch {}
	console.log(msg, data ?? "");
}


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

function displayForLogsWindow(): Electron.Display {
	// Prefer the display that currently hosts the menubar popup (where View Logs was clicked).
	if (mb.window && !mb.window.isDestroyed()) {
		return screen.getDisplayMatching(mb.window.getBounds());
	}
	// Fallback: display under the cursor.
	return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function centerWindowOnDisplay(
	win: BrowserWindow,
	display: Electron.Display,
): void {
	const { workArea } = display;
	const [w, h] = win.getSize();
	win.setPosition(
		workArea.x + Math.round((workArea.width - w) / 2),
		workArea.y + Math.round((workArea.height - h) / 2),
	);
}

function createLogsWindow(): void {
	trackLog("[logs] open-logs requested");
	const display = displayForLogsWindow();
	trackLog("[logs] target display", {
		id: display.id,
		bounds: display.bounds,
		workArea: display.workArea,
	});

	if (logsWindow && !logsWindow.isDestroyed()) {
		trackLog("[logs] focusing existing logs window");
		centerWindowOnDisplay(logsWindow, display);
		logsWindow.show();
		logsWindow.focus();
		return;
	}

	trackLog("[logs] creating new logs window");
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
		trackLog("[logs] logs window ready-to-show");
		if (logsWindow && !logsWindow.isDestroyed()) {
			centerWindowOnDisplay(logsWindow, display);
			logsWindow.show();
			logsWindow.focus();
		}
	});

	logsWindow.on("closed", () => {
		console.log("[logs] logs window closed");
		logsWindow = null;
	});

	logsWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
		console.error("[logs] failed to load", { code, desc, url });
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
	trackLog("[app] menubar ready");
	mb.tray.setToolTip("Threadbase Streamer");
	mb.window?.on("blur", () => mb.hideWindow());
	mb.window?.on("show", () => console.log("[tray] popup shown"));
	mb.window?.on("hide", () => console.log("[tray] popup hidden"));
	if (!readConfig().configured) {
		console.log("[app] first run — showing centered window");
		centerWindow();
		mb.showWindow();
	}

	if (process.platform === "darwin") {
		mb.tray.removeAllListeners("click");
		mb.tray.removeAllListeners("double-click");
		let lastClick = 0;
		mb.tray.on("click", (_event, bounds) => {
			const now = Date.now();
			if (now - lastClick < 300) {
				trackLog("[tray] click ignored (debounce)");
				return;
			}
			lastClick = now;
			const win = mb.window;
			trackLog("[tray] click", {
				visible: win?.isVisible() ?? false,
				focused: win?.isFocused() ?? false,
				bounds,
			});
			if (!win) {
				console.warn("[tray] no window yet");
				return;
			}
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

ipcMain.on("close-window", (event) => {
	const sender = BrowserWindow.fromWebContents(event.sender);
	if (sender && logsWindow && sender.id === logsWindow.id) {
		logsWindow.close();
		return;
	}
	mb.window?.hide();
});

ipcMain.on("quit", () => app.quit());

ipcMain.handle(
	"fetch-logs",
	async (
		_event,
		opts: {
			since?: number;
			before?: number;
			limit?: number;
			source?: string;
		} = {},
	) => {
		const since = Math.max(0, opts.since ?? 0);
		const before =
			typeof opts.before === "number" && Number.isFinite(opts.before)
				? Math.max(0, opts.before)
				: null;
		const limit = Math.min(Math.max(1, opts.limit ?? 500), 2000);
		const logsDir = path.join(os.homedir(), ".threadbase", "logs");
		const preferred =
			opts.source === "stdout" ||
			opts.source === "stderr" ||
			opts.source === "dev"
				? opts.source
				: null;

		const pickSource = (): string => {
			if (preferred) return preferred;
			for (const candidate of ["stdout", "stderr", "dev"] as const) {
				const p = path.join(logsDir, `${candidate}.log`);
				try {
					if (fs.existsSync(p) && fs.statSync(p).size > 0) return candidate;
				} catch {}
			}
			return "stdout";
		};

		const source = pickSource();
		const filePath = path.join(logsDir, `${source}.log`);
		try {
			if (!fs.existsSync(filePath)) {
				return {
					ok: true,
					logs: [],
					offset: 0,
					oldestIndex: 0,
					total: 0,
					source,
					message: `No log file found for source=${source}`,
				};
			}

			const stats = fs.statSync(filePath);
			// Keep a larger recent window so "Load older" / search have room to work.
			const maxBytes = Math.min(stats.size, 8 * 1024 * 1024);
			const start = Math.max(0, stats.size - maxBytes);
			const fd = fs.openSync(filePath, "r");
			let textContent = "";
			try {
				const buf = Buffer.alloc(maxBytes);
				fs.readSync(fd, buf, 0, maxBytes, start);
				textContent = buf.toString("utf8");
			} finally {
				fs.closeSync(fd);
			}
			if (start > 0) {
				const firstNl = textContent.indexOf("\n");
				if (firstNl >= 0) textContent = textContent.slice(firstNl + 1);
			}

			const allLines = textContent
				.split("\n")
				.filter((line) => line.trim() && !line.startsWith("==="));

			let lines: string[];
			let offset: number;
			let oldestIndex: number;

			if (before !== null) {
				// Load older history ending just before `before`.
				const end = Math.min(before, allLines.length);
				const startIdx = Math.max(0, end - limit);
				lines = allLines.slice(startIdx, end);
				oldestIndex = startIdx;
				offset = allLines.length;
			} else if (since > 0 && since < allLines.length) {
				lines = allLines.slice(since, since + limit);
				oldestIndex = since;
				offset = since + lines.length;
			} else if (since >= allLines.length && since > 0) {
				lines = [];
				oldestIndex = allLines.length;
				offset = allLines.length;
			} else {
				// Initial: newest `limit` lines.
				lines = allLines.slice(-limit);
				oldestIndex = Math.max(0, allLines.length - lines.length);
				offset = allLines.length;
			}

			return {
				ok: true,
				logs: lines,
				offset,
				oldestIndex,
				total: allLines.length,
				hasMore: offset < allLines.length,
				hasOlder: oldestIndex > 0 || start > 0,
				truncated: start > 0,
				source,
				fileSize: stats.size,
				fileModified: stats.mtime.toISOString(),
			};
		} catch (error) {
			trackLog("[logs] read error", { error: String(error), source });
			return {
				ok: false,
				error: String(error),
				logs: [],
				offset: since,
				oldestIndex: 0,
				total: 0,
				source,
			};
		}
	},
);


ipcMain.on("open-logs", () => {
	trackLog("[ipc] open-logs received");
	createLogsWindow();
	// Close the floating menubar popup once logs are opened.
	mb.window?.hide();
});

ipcMain.on("close-logs", () => {
	if (logsWindow && !logsWindow.isDestroyed()) {
		logsWindow.close();
	}
});
