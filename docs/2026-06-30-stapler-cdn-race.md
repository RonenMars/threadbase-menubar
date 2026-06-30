# CI notarization: fail loudly on rejected builds (was: stapler CDN race)

> **Date:** 2026-06-30
> **Status:** Hook fix implemented in `scripts/notarize.cjs`. Underlying signing rejection is an open follow-up (see below). Brief originated from `fix-menubar-stapler-race.md` in the repo root.
> **Scope:** `scripts/notarize.cjs`, CI "Build, sign, notarize" job.

---

## Symptom

The "Build, sign, notarize" CI job fails consistently on PRs with:

```
CloudKit query for Threadbase Menubar.app failed due to "Record not found".
The staple and validate action failed! Error 65.
⨯ xcrun stapler exited 65
```

## Initial (wrong) hypothesis

The brief assumed a CDN race: `xcrun stapler staple` runs immediately after
notarization, and Apple's ticket takes 30–120s to propagate to their CloudKit
CDN, so stapling loses the race. A retry loop was added to wait it out.

CI disproved this. The retry ran all 10 attempts (~5 min) against the *same*
submission UUID and got `Record not found` every time — not slow propagation, a
ticket that never existed.

## Actual root cause

Two layers:

1. **The hook masked a rejected notarization.** `xcrun notarytool submit --wait`
   exits 0 for any *processed* submission, including rejected ones
   (`status: Invalid`). The hook never checked the status, so it stapled a build
   Apple had refused — hence exit 65 forever, with or without retries.

2. **Why the build was rejected:** `notarytool log <id>` reported the nested
   `Threadbase Menubar Helper (Renderer).app` binary is not signed (no secure
   timestamp, no hardened runtime, invalid signature) on both arches. The
   universal-merge step leaves the Renderer helper unsigned.

## Fix (this PR)

In `scripts/notarize.cjs`, parse `notarytool submit`'s JSON and fail loudly when
`status !== "Accepted"`, surfacing the submission id so the rejection log is one
`notarytool log <id>` away. The stapler retry loop is kept (real propagation
delay does occur) but now only runs for genuinely-accepted builds.

## Follow-up (separate)

The unsigned universal Renderer helper still needs fixing in the
electron-builder signing config before macOS notarization can pass. Tracked
separately from this hook fix.
