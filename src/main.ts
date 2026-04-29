import { app, ipcMain } from "electron";
import { menubar } from "menubar";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createIcon } from "./icons";

const port = process.env.THREADBASE_PORT
	? parseInt(process.env.THREADBASE_PORT, 10)
	: 3456;

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

function getLoginSetting(): boolean {
	if (process.platform === "linux") return fs.existsSync(LINUX_AUTOSTART);
	return app.getLoginItemSettings().openAtLogin;
}

function setLoginSetting(enable: boolean): void {
	if (process.platform === "linux") {
		if (enable) {
			fs.mkdirSync(path.dirname(LINUX_AUTOSTART), { recursive: true });
			fs.writeFileSync(
				LINUX_AUTOSTART,
				`[Desktop Entry]\nType=Application\nName=Threadbase Menubar\nExec=${process.execPath}\nHidden=false\nX-GNOME-Autostart-enabled=true\n`,
			);
		} else {
			try {
				fs.unlinkSync(LINUX_AUTOSTART);
			} catch {}
		}
		return;
	}
	app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
}

// ── App ──────────────────────────────────────────────────────────────────────

const mb = menubar({
	index: `file://${path.join(__dirname, "../src/renderer/index.html")}?port=${port}`,
	icon: createIcon("stopped"),
	browserWindow: {
		width: 280,
		height: 330,
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

mb.on("ready", () => {
	mb.tray.setToolTip("Threadbase Streamer");
	if (!readConfig().configured) {
		mb.showWindow();
	}
});

ipcMain.on("status-update", (_event, status: { ok: boolean }) => {
	mb.tray.setImage(createIcon(status.ok ? "running" : "stopped"));
});

ipcMain.handle("get-login-setting", () => getLoginSetting());

ipcMain.on("set-login-setting", (_event, enable: boolean) => {
	setLoginSetting(enable);
	writeConfig({ configured: true });
});

ipcMain.on("quit", () => app.quit());
