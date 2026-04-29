# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electron system tray app (`threadbase-menubar`) that monitors a running Threadbase Streamer. Shows a color-coded tray icon (green/gray/red) and a popup with status details and a "Launch at login" toggle.

Consumed as a git submodule at `vendor/menubar` inside [threadbase-streamer](https://github.com/RonenMars/threadbase-streamer).

## Commands

- `npm start` — build then launch (`npm run build && electron .`)
- `npm run build` — TypeScript compile (tsc), output to `dist/`
- `npx biome check .` — lint + format check
- `npx biome format --write .` — auto-format all files

No test runner is configured yet.

## Architecture

- `src/main.ts` — Electron main process: menubar window, IPC handlers, login-item management, first-launch detection
- `src/preload.ts` — Context bridge, exposes `window.electronAPI` to the renderer
- `src/icons.ts` — Generates 16×16 PNG icons at runtime using pure Node.js (CRC32 + zlib deflate) — no image asset files
- `src/renderer/` — Vanilla HTML/CSS/JS popup UI — renderer files are **not** TypeScript

## Configuration

| Env var | Default | Description |
|---|---|---|
| `THREADBASE_PORT` | `3456` | Port the streamer server is listening on |

Server config is read from `~/.threadbase/server.yaml` by the streamer itself; the menubar only needs the port.

## Key behaviors

**First launch:** on the very first run, `config.json` does not exist so `configured: false`. The main process calls `mb.showWindow()` automatically so the user sees the popup and can set the "Launch at login" preference before doing anything else. Once they toggle it, `configured: true` is written and the auto-show never fires again.

**Polling:** the renderer fetches `http://localhost:<port>/healthz` every 5 seconds (`AbortSignal.timeout(3000)`). On success it sends `status-update` IPC to the main process which swaps the tray icon. On failure the icon goes gray.

**Login item — per platform:**
- macOS / Windows: `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`
- Linux: writes or removes `~/.config/autostart/threadbase-menubar.desktop`

**Config file:** `app.getPath('userData')/config.json` — currently stores `{ configured: boolean }`. Extend this (not a separate file) when persisting new preferences such as port or API key.

## IPC pattern

Follow the existing conventions when adding new channels:

- `ipcMain.handle` + `ipcRenderer.invoke` — for queries that return a value (e.g. `get-login-setting`)
- `ipcMain.on` + `ipcRenderer.send` — for fire-and-forget actions (e.g. `set-login-setting`, `quit`, `status-update`)
- All Node.js access from the renderer must go through `preload.ts` — **never** enable `nodeIntegration` or disable `contextIsolation`

## Gotchas

- `main.ts` references the renderer as `../src/renderer/index.html` (relative from `dist/`) — intentional dev shortcut, not valid in a packaged build. Do not "fix" this path until packaging with electron-builder is implemented.
- Renderer files (`renderer.js`, `styles.css`) are plain JS/CSS — do not convert them to TypeScript without also setting up a renderer build step.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, etc. (same as parent repo)
- Roadmap and planned milestones: [`.claude/plans/roadmap.md`](.claude/plans/roadmap.md)

## Contributing to docs

If you hit an undocumented issue during setup or development, ask the user: "This doesn't seem to be documented. Would you like me to add it to the README or roadmap?" Then add it and commit it alongside any code fix.
