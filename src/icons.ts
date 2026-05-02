import { nativeImage } from "electron";
import { deflateSync } from "zlib";

export type IconState = "running" | "stopped" | "error";

const COLORS: Record<IconState, [number, number, number]> = {
	running: [48, 209, 88],
	stopped: [99, 99, 102],
	error: [255, 69, 58],
};

// CRC32 table for PNG chunk integrity
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[i] = c;
	}
	return t;
})();

function crc32(data: Buffer): number {
	let c = 0xffffffff;
	for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
	const typeBytes = Buffer.from(type, "ascii");
	const len = Buffer.allocUnsafe(4);
	len.writeUInt32BE(data.length);
	const crcBuf = Buffer.allocUnsafe(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
	return Buffer.concat([len, typeBytes, data, crcBuf]);
}

function makePng(size: number, r: number, g: number, b: number): Buffer {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // RGB color type

	const rowBytes = 1 + size * 3;
	const raw = Buffer.allocUnsafe(size * rowBytes);
	for (let y = 0; y < size; y++) {
		raw[y * rowBytes] = 0; // filter = None
		for (let x = 0; x < size; x++) {
			const base = y * rowBytes + 1 + x * 3;
			raw[base] = r;
			raw[base + 1] = g;
			raw[base + 2] = b;
		}
	}

	return Buffer.concat([
		sig,
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw)),
		pngChunk("IEND", Buffer.alloc(0)),
	]);
}

export function createIcon(state: IconState): Electron.NativeImage {
	const [r, g, b] = COLORS[state];
	return nativeImage.createFromBuffer(makePng(16, r, g, b));
}
