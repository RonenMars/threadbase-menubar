# Fix: xcrun stapler CDN race in CI notarization

> **Date:** 2026-06-30
> **Status:** Planned. Brief captured from `fix-menubar-stapler-race.md` in the repo root.
> **Scope:** `scripts/notarize.cjs`, CI "Build, sign, notarize" job.

---

## Symptom

The "Build, sign, notarize" CI job fails consistently on PRs with:

```
CloudKit query for Threadbase Menubar.app failed due to "Record not found".
The staple and validate action failed! Error 65.
⨯ xcrun stapler exited 65
```

## Root cause

`xcrun stapler staple` runs immediately after notarization completes. Apple's
notarization API returns success once the ticket is *processed*, but ticket
propagation to their CloudKit CDN takes 30–120 seconds. The build is fast (deps
cached), so stapling races the CDN and loses every time.

## Fix

In `scripts/notarize.cjs`, replace the single `xcrun stapler staple` call with a
retry loop that waits for the ticket to appear on the CDN before giving up:

- Retry up to 10 times with a 30-second delay between attempts.
- On each attempt, catch the exit-65 error and log which attempt is running.
- After all retries are exhausted, re-throw the original error so the build
  fails loudly.
- Keep it minimal — no new dependencies, no restructuring the rest of the file.
- Mark the ceiling with a `ponytail:` comment: max 5-minute retry window;
  upgrade path is to reduce the delay if Apple's CDN gets faster.

Land via a `chore(ci): retry xcrun stapler to survive Apple CDN propagation delay`
PR.
