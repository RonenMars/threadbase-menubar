import { app, ipcMain } from "electron";
import { menubar } from "menubar";
import * as path from "path";
import { createIcon } from "./icons";

const port = process.env.THREADBASE_PORT
  ? parseInt(process.env.THREADBASE_PORT, 10)
  : 3456;

const mb = menubar({
  index: `file://${path.join(__dirname, "../src/renderer/index.html")}?port=${port}`,
  icon: createIcon("stopped"),
  browserWindow: {
    width: 280,
    height: 300,
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
});

ipcMain.on("status-update", (_event, status: { ok: boolean }) => {
  mb.tray.setImage(createIcon(status.ok ? "running" : "stopped"));
});

ipcMain.on("quit", () => app.quit());
