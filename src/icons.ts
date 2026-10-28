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

const warnedMissing = new Set<string>();

// Never throws: this runs inside the `status-update` IPC handler every 5 s,
// where an exception is uncaught and Electron shows a modal error dialog per
// call. A stale `dist/` against moved `assets/` (e.g. after the streamer bumps
// `vendor/menubar` without a rebuild) used to stack those dialogs endlessly.
// createFromPath already returns an empty image for a missing file; only the
// @2x read can throw, so a missing @2x degrades to the 1x image.
export function createIcon(state: IconState): Electron.NativeImage {
	const base = STATE_TO_FILE[state];
	const img = nativeImage.createFromPath(path.join(ASSETS_DIR, `${base}.png`));
	const hiDpi = path.join(ASSETS_DIR, `${base}@2x.png`);
	try {
		img.addRepresentation({ scaleFactor: 2, buffer: fs.readFileSync(hiDpi) });
	} catch (err) {
		if (!warnedMissing.has(hiDpi)) {
			warnedMissing.add(hiDpi);
			console.warn("[tray] icon asset unreadable, using 1x only", {
				path: hiDpi,
				err,
			});
		}
	}
	img.setTemplateImage(MAC);
	return img;
}
