import { nativeImage } from "electron";
import * as fs from "fs";
import * as path from "path";

export type IconState = "running" | "stopped";

// Monochrome mark: state is opacity (full vs dimmed), not color.
// macOS uses black *Template images so the menu bar tints them; other
// platforms get a white glyph for dark tray backgrounds.
const MAC = process.platform === "darwin";
const SUFFIX = MAC ? "Template" : "-light";

const STATE_TO_FILE: Record<IconState, string> = {
	running: `tray-icon-online${SUFFIX}`,
	stopped: `tray-icon-offline${SUFFIX}`,
};

const ASSETS_DIR = path.join(__dirname, "..", "assets");

export function createIcon(state: IconState): Electron.NativeImage {
	const base = STATE_TO_FILE[state];
	const img = nativeImage.createFromPath(path.join(ASSETS_DIR, `${base}.png`));
	img.addRepresentation({
		scaleFactor: 2,
		buffer: fs.readFileSync(path.join(ASSETS_DIR, `${base}@2x.png`)),
	});
	img.setTemplateImage(MAC);
	return img;
}
