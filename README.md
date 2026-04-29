# threadbase-menubar

Menu bar status indicator for [Threadbase Streamer](https://github.com/RonenMars/threadbase-streamer). Lives in your system tray and shows whether the streamer server is running.

## Features

- **Tray icon** — colored 16×16 indicator generated at runtime (no image assets needed):
  - Green `#30D158` — server is running
  - Gray `#636366` — server is stopped / unreachable
  - Red `#FF453A` — error (reserved for future use)
- **Popup window** — click the tray icon to open a dark-themed card showing:
  - Running / Stopped status with a matching dot
  - Server version (when running)
  - Port
  - Last checked timestamp (updates every second)
  - **Launch at login** toggle — persisted per platform
- **First-launch UX** — popup opens automatically so the user can configure the login preference before doing anything else
- **Cross-platform** — macOS, Linux, Windows

## Requirements

- Node.js 18+
- The [Threadbase Streamer](https://github.com/RonenMars/threadbase-streamer) running on `localhost` (default port `3456`)

## Getting started

```bash
npm install
npm start        # builds TypeScript then launches the app
```

For development with watch mode:

```bash
npm run build    # one-shot compile
# in a second terminal:
electron .
```

## Configuration

| Env var | Default | Description |
|---|---|---|
| `THREADBASE_PORT` | `3456` | Port the streamer server is listening on |

Example:

```bash
THREADBASE_PORT=8766 npm start
```

## How it works

The app polls `http://localhost:<port>/healthz` every 5 seconds. That endpoint is unauthenticated and returns `{ ok: true, version: "..." }` when the server is up.

### Architecture

```
src/
  main.ts          Electron main process — menubar setup, IPC handlers,
                   login-item management, first-launch detection
  preload.ts       Context bridge exposing electronAPI to the renderer
  icons.ts         Generates 16×16 solid-color PNGs at runtime using
                   pure Node.js (CRC32 + zlib deflate, no asset files)
  renderer/
    index.html     Popup UI shell
    renderer.js    Polls /healthz, drives status display and login toggle
    styles.css     Dark macOS-style theme with iOS-style toggle switch
```

### Login at login — per platform

| Platform | Mechanism |
|---|---|
| macOS | `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })` |
| Windows | Same Electron API |
| Linux | Writes / removes `~/.config/autostart/threadbase-menubar.desktop` |

The preference is saved to `<userData>/config.json` so the first-launch prompt only appears once.

## Planned

- **Start / Stop / Restart** server actions directly from the popup (the server process is managed via the streamer's deploy scripts — the menubar will spawn/kill it as a child process)
- **Active sessions count** (requires API key; will read from `~/.threadbase/server.yaml`)
- Proper macOS template icons for dark/light mode adaptation
- `electron-builder` packaging → `.dmg` / NSIS installer / `.AppImage`

## Relationship to threadbase-streamer

This repo is consumed as a git submodule at `vendor/menubar` inside [threadbase-streamer](https://github.com/RonenMars/threadbase-streamer). It is developed and versioned independently — the parent repo pins a specific commit.

```
threadbase-streamer/
└── vendor/
    ├── scanner/    ← conversation history scanner
    └── menubar/    ← this repo
```
