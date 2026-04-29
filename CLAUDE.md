# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electron system tray app (`threadbase-menubar`) that monitors a running Threadbase Streamer. Shows a color-coded tray icon (green/gray/red) and a popup with status details and a login-at-startup toggle.

## Commands

- `npm run build` — TypeScript compile (tsc), output to `dist/`
- `npm run dev` — build then launch Electron
- `npx biome check .` — lint + format check
- `npx biome format --write .` — auto-format all files

No test runner is configured yet.

## Architecture

- `src/main.ts` — Electron main process: menubar window, IPC handlers, login-item management
- `src/preload.ts` — Context bridge, exposes `window.electronAPI` to renderer
- `src/icons.ts` — Generates 16×16 PNG icons at runtime (no image assets)
- `src/renderer/` — Vanilla HTML/CSS/JS popup UI — renderer files are **not** TypeScript

## Gotchas

- `main.ts` references the renderer as `../src/renderer/index.html` (relative from `dist/`) — intentional dev shortcut, not valid in a packaged build. Do not "fix" this path until packaging with electron-builder is implemented.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, etc. (same as parent repo)
