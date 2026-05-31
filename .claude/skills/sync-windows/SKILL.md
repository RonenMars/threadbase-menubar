---
name: sync-windows
description: Sync a Windows PC's clone of threadbase-menubar with the latest main and build the unsigned NSIS installer locally. Use when the user wants to update their Windows machine to the latest changes, pull the newest code on Windows, or produce a fresh local .exe build. Covers pre-flip clones (private→public URL transition) and the optional path of skipping the build entirely by downloading the CI-built installer from the latest-main GitHub release.
---

# Sync a Windows PC and build the installer

Use this when a Windows machine has an older clone of `threadbase-menubar` and needs to catch up with `origin/main`, then build the unsigned NSIS installer locally.

## When to skip building entirely

If the user only needs to **run** the app, not build it, give them the prebuilt installer instead — CI produces a fresh `.exe` on every push to `main`:

```
https://github.com/RonenMars/threadbase-menubar/releases/download/latest-main/Threadbase.Menubar-0.1.0-x64.exe
```

Same binary `npm run package:win` would produce. The release auto-updates on every push.

## Sync + build sequence (PowerShell)

```powershell
cd path\to\threadbase-menubar

# 1. Inspect current state (read-only)
git status
git remote -v
git log --oneline origin/main..HEAD 2>$null  # any local commits ahead?

# 2. Fix remote URL only if needed
#    SSH (git@github.com:...) still works fine on a now-public repo.
#    HTTPS is simpler across machines. Skip this step if SSH is fine.
git remote set-url origin https://github.com/RonenMars/threadbase-menubar.git
git fetch origin

# 3. Sync main — pick ONE:

# 3a. SAFE (default): rebase local commits on top of origin/main.
#     Errors out on conflicts so they can be resolved.
git checkout main
git pull --rebase origin main

# 3b. DESTRUCTIVE: only if step 1 showed no local commits ahead AND
#     `git status` is clean. Discards anything that differs from origin.
# git checkout main
# git reset --hard origin/main

# 4. Pick up any new package.json scripts and dev dependencies
npm install

# 5. Build the Windows installer
npm run package:win
# → release\Threadbase Menubar-<version>-x64.exe
```

## Decision points

**Pre-flip clone vs fresh clone.** Detect via `git remote -v`:
- If the URL is `git@github.com:RonenMars/threadbase-menubar.git` (SSH) or `https://github.com/RonenMars/threadbase-menubar.git` (HTTPS) — the clone already points at the right place. Skip the `git remote set-url` step.
- If it's anything else (a fork, a stale mirror, a typo'd URL), fix it before fetching.

**Safe vs destructive sync.** Default to 3a (`pull --rebase`). Only use 3b (`reset --hard`) when:
- `git log origin/main..HEAD` is empty (no local commits ahead), AND
- `git status` shows a clean working tree (no uncommitted changes), AND
- The user has explicitly confirmed they want to discard local state.

If the user expresses any uncertainty, default to 3a. `reset --hard` is irreversible without reflog spelunking.

## First-build expectations

- **5-10 minutes on first run.** electron-builder downloads `electron-v28.3.3-win32-x64.zip` (~100 MB) and the NSIS toolchain. Subsequent builds are cached and finish in ~1-2 min.
- **No code signing.** The output `.exe` is unsigned. When the user runs it, Windows SmartScreen will say "Windows protected your PC" — click **More info** → **Run anyway**. Documented in the README's Install (Windows) section; surface this proactively so it isn't mistaken for malware.
- **Output path:** `release\Threadbase Menubar-<version>-x64.exe` (note the space in the filename — quote it in shell commands).

## When NOT to use this skill

- macOS or Linux sync — entirely different package scripts (`package:mac`, `package:linux`) and platform expectations.
- CI-only sync questions (e.g. "is the GitHub Actions Windows job working?") — that's not local sync; check `gh run list` instead.
- First-time clone of the repo on a brand-new Windows PC — simpler path: `git clone https://github.com/RonenMars/threadbase-menubar.git && cd threadbase-menubar && npm install && npm run package:win`. No sync logic needed.
