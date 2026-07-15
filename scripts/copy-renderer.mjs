#!/usr/bin/env node
//
// Copies src/renderer/** → dist/renderer/ and src/logs-viewer/** → dist/logs-viewer/
// as a postbuild step.
//
// Required so that main.ts can resolve renderer files via a path that works
// in both dev and packaged (asar) builds: __dirname/renderer/index.html.

import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// Copy main renderer
const rendererSrc = join(repoRoot, "src", "renderer");
const rendererDest = join(repoRoot, "dist", "renderer");
await mkdir(rendererDest, { recursive: true });
await cp(rendererSrc, rendererDest, { recursive: true });
console.log(`copied ${rendererSrc} → ${rendererDest}`);

// Copy logs viewer
const logsSrc = join(repoRoot, "src", "logs-viewer");
const logsDest = join(repoRoot, "dist", "logs-viewer");
await mkdir(logsDest, { recursive: true });
await cp(logsSrc, logsDest, { recursive: true });
console.log(`copied ${logsSrc} → ${logsDest}`);
