# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Electron system tray app (`threadbase-menubar`) that monitors a running Threadbase Streamer. Shows a color-coded tray icon (green/gray/red) and a popup with status details and a "Launch at login" toggle.

Consumed as a git submodule at `vendor/menubar` inside [threadbase-streamer](https://github.com/RonenMars/threadbase-streamer).

Merges to `main` auto-release via semantic-release (`.github/workflows/release.yml`) for conventional commits except `docs:` and `ci:`. A new `v*` tag triggers Build DMG, which notifies streamer (`menubar-released`) to bump `vendor/menubar`.

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
| `THREADBASE_PORT` | (see below) | Port the streamer server is listening on. Override only — leave unset to auto-detect. |

**Port resolution order** (main.ts):
1. `THREADBASE_PORT` env var, if set
2. `port:` field in `~/.threadbase/server.yaml`, if readable
3. Fallback constant `8766` (matches the streamer's deployed default)

The menubar parses only the `port:` line from `server.yaml` with a regex — it does not depend on a YAML library.

## Key behaviors

**First launch:** on the very first run, `config.json` does not exist so `configured: false`. The main process calls `mb.showWindow()` automatically so the user sees the popup and can set the "Launch at login" preference before doing anything else. Once they toggle it, `configured: true` is written and the auto-show never fires again.

**Polling:** the renderer fetches `http://localhost:<port>/healthz` every 5 seconds (`AbortSignal.timeout(3000)`). On success it sends `status-update` IPC to the main process which swaps the tray icon. On failure the icon goes gray.

**Login item — per platform:**
- macOS / Windows: `app.setLoginItemSettings({ openAtLogin, openAsHidden: true })`
- Linux: writes or removes `~/.config/autostart/threadbase-menubar.desktop`

**Config file:** `app.getPath('userData')/config.json` — currently stores `{ configured: boolean }`. Extend this (not a separate file) when persisting new preferences such as port or API key.

**Close button:** a ✕ button is shown in the popup header on every platform. It sends `close-window` IPC which calls `mb.window?.hide()` directly — *not* `mb.hideWindow()`. The library's `hideWindow()` short-circuits when its internal visibility flag is out of sync with the actual window state, which happens on macOS because the custom tray-click handler calls `win.show()` directly instead of `mb.showWindow()`. Going through `BrowserWindow.hide()` bypasses the stale-flag check.

**Multi-display positioning (macOS):** the tray-click handler receives `bounds` (the clicked tray icon's screen rect) and calls `positionUnderTray(bounds)`, which uses `screen.getDisplayMatching(bounds)` to anchor the popup on the same display as the clicked icon — *not* the primary display. If the popup is already open on a different display when the tray is clicked, it's repositioned under the new tray and re-shown. The same-display check uses `screen.getDisplayMatching(...).id` on both the window's current bounds and the tray bounds.

**CSP and inline styles:** `index.html` sets `style-src 'self'` in its CSP meta tag, which blocks **all** inline `style="…"` attributes and JS-set `element.style.foo = …` assignments. Drive visibility and other style toggles via CSS classes (`classList.add/remove`), not inline styles. A previous version hid the close button with `style="display:none"`; CSP silently stripped the attribute and the button rendered everywhere.

## IPC pattern

Follow the existing conventions when adding new channels:

- `ipcMain.handle` + `ipcRenderer.invoke` — for queries that return a value (e.g. `get-login-setting`)
- `ipcMain.on` + `ipcRenderer.send` — for fire-and-forget actions (e.g. `set-login-setting`, `quit`, `status-update`, `close-window`)
- All Node.js access from the renderer must go through `preload.ts` — **never** enable `nodeIntegration` or disable `contextIsolation`
- `platform` is exposed as a plain value (not IPC) via `contextBridge` so the renderer can branch on OS without a round-trip

## Windows-specific behavior

**Popup positioning:** on Windows the tray icon often lives in the overflow ("hidden icons") area. Positioning the popup near the tray icon overlaps with the overflow menu, so the window is instead centered on screen. This is done via the `after-create-window` event: opacity is set to 0 on creation, then on every `show` event the window is repositioned to center before opacity is restored to 1. This prevents any visible jump from the tray position to the center.

**Launching from scripts:** always use `electron.exe` directly from `node_modules\electron\dist\electron.exe`. Do NOT use `node_modules\.bin\electron.cmd` — the `.cmd` wrapper spawns a cmd.exe parent that exits and takes the Electron process with it. Pass required env vars explicitly via `Start-Process -Environment` since they are not inherited from the calling shell.

## Packaging (macOS)

The app is packaged with electron-builder. Config lives in `electron-builder.config.js` (JS form, not the `package.json` `build` block — needed for conditional signing).

Scripts:
- `npm run package:mac` — full build, produces a universal `.dmg` in `release/`
- `npm run package:mac:dir` — fast, unpacked `.app` in `release/mac-arm64/` for verification (skips DMG step + universal merge)
- `npm run build:icon` — regenerates `build/icon.icns` from `assets/source-icon.svg`

**Signing is conditional on `APPLE_TEAM_ID` env var:**
- When set (sourced from `~/.threadbase/menubar-signing.env`) → Developer ID signing + hardened runtime + notarisation via `scripts/notarize.cjs` (uses App Store Connect API key)
- When unset → ad-hoc signing, no notarisation; `.app` runs locally on the build machine but is quarantined when transported to other Macs

The split exists because the dev keychain often contains expired/revoked certs that auto-discovery would pick up incorrectly. Setting `identity` explicitly avoids the trap.

## Gotchas

- Renderer files (`renderer.js`, `styles.css`) are plain JS/CSS — do not convert them to TypeScript without also setting up a renderer build step. They are copied verbatim from `src/renderer/` to `dist/renderer/` by `scripts/copy-renderer.mjs` (postbuild).
- Electron spawns ~10 child processes per instance. Killing stale instances requires `Get-Process electron | Stop-Process -Force` (kills all of them), not targeting a single PID.
- electron-builder does not auto-discover `electron-builder.config.js` — must be passed explicitly via `-c`. The npm scripts do this; one-off `npx electron-builder` invocations need the flag too.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, etc. (same as parent repo)
- Release: only `docs:`, `ci:`, and `chore(release):` do not bump; every other type (including plain `chore:`) cuts a patch. Release commits use `chore(release): <v>` (no `[skip ci]` — the gate + build guards key on the `chore(release):` message so the `v*` tag can trigger Build DMG).
- Roadmap and planned milestones: [`.claude/plans/roadmap.md`](.claude/plans/roadmap.md)

## Contributing to docs

If you hit an undocumented issue during setup or development, ask the user: "This doesn't seem to be documented. Would you like me to add it to the README or roadmap?" Then add it and commit it alongside any code fix.

## Merging PRs — Rebase + Squash, Linear History

Keep `main` a straight line — one commit per PR, no merge commits. Every PR follows the same two operations, in this order:

1. **Rebase onto latest `main`** to sync before merging. `git fetch origin && git rebase origin/main`, resolve conflicts preserving the PR's intent, then `git push --force-with-lease` (never plain `--force`, never force-push `main`). This guarantees no merge commit sneaks in.
2. **Squash-merge** the rebased PR: `gh pr merge <N> --squash --delete-branch`. The squash title must be conventional-commit compliant and carry no AI attribution.

Rules:

- **One PR at a time.** Never sync/merge PRs in parallel — rebase one, wait for its CI to go green, squash-merge it, then move to the next. A just-merged PR advances `main`, so the next PR is usually behind and must be rebased again.
- **Dependency order first.** If PR B is stacked on PR A (GitHub shows A's branch as B's base), merge A before B and rebase B onto the updated `main` afterward.
- **CI gate.** Only squash-merge when required checks are green. If CI is red on a flaky/infra failure, re-run it **once**; if the re-run still fails, stop and report — do not merge red.
- **Stuck cap.** If any single step hangs for more than ~3–4 minutes (CI not progressing, a rebase that won't resolve cleanly), stop and report rather than waiting indefinitely.
