#!/usr/bin/env node
//
// Copies src/renderer/** → dist/renderer/ as a postbuild step.
//
// Required so that main.ts can resolve renderer files via a path that works
// in both dev and packaged (asar) builds: __dirname/renderer/index.html.

import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(repoRoot, "src", "renderer");
const dest = join(repoRoot, "dist", "renderer");

await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`copied ${src} → ${dest}`);
