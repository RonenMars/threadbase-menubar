import { nativeImage } from "electron";
import * as fs from "fs";
import * as path from "path";

export type IconState = "running" | "stopped" | "error";

const STATE_TO_FILE: Record<IconState, string> = {
	running: "tray-icon-online",
	stopped: "tray-icon-offline",
	error: "tray-icon-error",
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");

export function createIcon(state: IconState): Electron.NativeImage {
	const base = STATE_TO_FILE[state];
	const img = nativeImage.createFromPath(path.join(ASSETS_DIR, `${base}.png`));
	img.addRepresentation({
		scaleFactor: 2,
		buffer: fs.readFileSync(path.join(ASSETS_DIR, `${base}@2x.png`)),
	});
	return img;
}
