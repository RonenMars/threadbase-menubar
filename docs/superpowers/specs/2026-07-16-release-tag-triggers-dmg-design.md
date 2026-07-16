# Release tag triggers Build DMG + streamer bump

## Problem

Merges to `main` auto-release via semantic-release, which cuts a `v*` tag.
That tag is supposed to trigger `build-dmg.yml`, which builds the DMG/AppImage/exe assets and then dispatches `menubar-released` to `threadbase-streamer` so it bumps `vendor/menubar`.

The chain never fires.
`@semantic-release/git` commits the release with message `chore(release): <v> [skip ci]` and pushes the tag on that commit.
GitHub honors `[skip ci]` in the head commit and suppresses the entire push event — including the tag ref — so no workflow runs for the tag.
Confirmed: no `v*`-ref workflow run has ever existed, and the streamer has never received a `menubar-released` dispatch (v0.2.1 and v0.2.2 both released without notifying the streamer).

## Root cause

`[skip ci]` is doing double duty and blocking the tag trigger:

1. Suppresses the release commit's re-entry into the Release workflow (loop guard) — desired.
2. Suppresses the rolling `main`-branch DMG build on the release commit — desired.
3. Suppresses the `v*` tag push, so Build DMG never runs on the tag — NOT desired, this is the bug.

## Fix

Drop `[skip ci]` from the release commit message and re-key the two guards that relied on it onto the still-distinctive `chore(release):` message substring.
Tag-ref pushes are not gated by the `main`-only conditions, so removing `[skip ci]` lets the tag trigger Build DMG while the release commit's own push to `main` continues to no-op.

### Changes

1. `.releaserc.json` — `@semantic-release/git` message: `chore(release): ${nextRelease.version}` (remove ` [skip ci]`).
2. `.github/workflows/release.yml` — gate job: match `chore(release):` instead of `[skip ci]` (preserves the release-loop guard).
3. `.github/workflows/build-dmg.yml` — three job `if` conditions: `contains(github.event.head_commit.message, 'chore(release):')` instead of `'[skip ci]'` (preserves the rolling-main-build skip).

### Net effect per release

- Release commit lands on `main` → Release gate no-ops → rolling DMG jobs no-op (unchanged).
- The `v*` tag now triggers Build DMG → assets built → `menubar-released` dispatched → streamer bumps `vendor/menubar`.
- Exactly one build per release, no loop.

## Verification

- Static: no remaining `[skip ci]` reference in the three files; confirm each re-keyed guard matches `chore(release):` and that tag-ref pushes bypass every `main`-only guard.
- Live (next release after merge): a `v*`-ref Build DMG run appears, and a `menubar-released` dispatch appears on `threadbase-streamer` — the two signals absent for v0.2.1/v0.2.2.

## Out of scope

- Backfilling v0.2.2's missed streamer bump (can be done separately via `gh workflow run build-dmg.yml --ref v0.2.2` once this merges).
- The electron 43 bump (PR #5), blocked on menubar's electron peer cap.
