# threadbase-menubar — Roadmap

## Completed

- [x] Electron + `menubar` popup with dark macOS-style UI
- [x] Tray icon with green/gray color states (generated at runtime, no asset files)
- [x] Polls `/healthz` every 5s — shows Running / Stopped, version, port, last-checked
- [x] **Launch at login** toggle (macOS/Windows via Electron API; Linux via autostart desktop entry)
- [x] First-launch UX — popup auto-opens so user configures login preference immediately
- [x] `vendor/menubar` submodule wired into `threadbase-streamer`

---

## Next steps

### 1. Server actions — Start / Stop / Restart

Spawn and kill the streamer as a child process from the main process.

- Read server config from `~/.threadbase/server.yaml` (port, browse_root)
- Spawn `node ~/.threadbase/cli.js serve` as a detached child, track its PID
- Add **Start**, **Stop**, **Restart** buttons to the popup (visible/disabled based on current state)
- IPC: renderer → `server-action` (start | stop | restart) → main process
- Tray icon transitions: gray → green on start, green → gray on stop, yellow pulse on restart
- Store PID in `<userData>/server.pid` so the app can re-attach across restarts

### 2. Active sessions count

- Requires the API key to call `/api/info` (returns `activeSessions`)
- Read API key from `~/.threadbase/server.yaml` or prompt the user to paste it once
- Store it in `<userData>/config.json` (already exists)
- Display "X active sessions" in the popup card when the server is running

### 3. Proper tray icons (macOS dark/light mode)

- Replace runtime-generated solid squares with proper template images
- macOS: `@1x` and `@2x` black/white `trayTemplate.png` — system handles dark/light inversion
- Linux/Windows: separate colored `tray-active.png` / `tray-idle.png`
- Add `assets/` directory to the repo, document icon spec in README

### 4. `electron-builder` packaging

Configure `electron-builder` for one-command distribution builds:

| Platform | Output |
|---|---|
| macOS | `.dmg` → user drags `.app` to `/Applications` → shows in Spotlight |
| Windows | NSIS installer → installs to Program Files + Start Menu shortcut |
| Linux | `.AppImage` (portable) + `.deb` (installs `.desktop` for app grid) |

- Add `build` config block to `package.json`
- Add `dist` and `pack` npm scripts
- Code-sign on macOS (requires Apple Developer certificate) — document the signing step

### 5. Auto-update

- Use `electron-updater` (part of `electron-builder`) to check for new releases on startup
- Publish releases to GitHub Releases — `electron-builder` can upload automatically
- Show an "Update available" badge in the popup with a one-click install

### 6. Notifications

- System notification on state changes: "Streamer started", "Streamer stopped unexpectedly"
- Use Electron's `Notification` API (supported on all three platforms)
- Make notifications opt-in via a toggle in the popup

### 7. Multi-instance / remote server support

- Currently hardcoded to `localhost:<port>`
- Allow adding remote server URLs (for monitoring a server on another machine)
- Store a list of server entries in `config.json`; switch between them from the tray menu

---

## Architecture notes for future work

- All server process management (start/stop) should live in `main.ts`, never in the renderer
- New IPC channels should follow the existing pattern: `ipcMain.handle` for queries that return data, `ipcMain.on` for fire-and-forget actions
- The renderer must not import Node.js modules directly — use the `preload.ts` context bridge
- Config lives in `app.getPath('userData')/config.json`; keep it flat and JSON-serialisable
