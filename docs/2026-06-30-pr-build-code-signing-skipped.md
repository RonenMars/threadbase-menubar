# Fix: PR builds skip code signing → notarization rejected

> **Date:** 2026-06-30
> **Status:** Fixed in `.github/workflows/build-dmg.yml` + `electron-builder.config.js`.
> **Scope:** macOS "Build, sign, notarize" CI job on pull requests.

---

## Symptom

The macOS CI job failed on every PR. Notarization returned `status: Invalid`
and stapling then failed with `xcrun stapler exited 65`. `notarytool log`
reported **74** "not signed / no secure timestamp / no hardened runtime"
errors — every binary in the bundle (Electron Framework, all dylibs, ShipIt,
the main executable, all four helper apps), not just one.

## How it was diagnosed

A local universal build on a Mac with the Developer ID identity in its keychain
signed the whole bundle correctly and notarized **Accepted** — so the
electron-builder config, entitlements, and universal-merge were all fine. The
failure was CI-specific.

The CI log made it explicit:

```
• Current build is a part of pull request, code signing will be skipped.
  solution=set env PUBLISH_FOR_PULL_REQUEST to true to force code signing
```

## Root cause

electron-builder **skips code signing on pull-request builds by default**. It
detects the PR from CI env vars and leaves the app ad-hoc-signed. The
`afterSign` notarize hook still ran, submitted the unsigned app, Apple marked it
`Invalid`, and stapling a rejected build failed forever.

This had nothing to do with the universal merge, the keychain setup (the cert
imported fine — `1 valid identities found`), or entitlements.

## Fix

1. `.github/workflows/build-dmg.yml` — set `CSC_FOR_PULL_REQUEST: "true"` on the
   build step so PR builds sign like main builds.
2. `electron-builder.config.js` — add `forceCodeSigning: true` to the signing
   branch, so any future silent signing skip fails the build loudly at package
   time instead of surfacing as a confusing notarization rejection.

## Relationship to the stapler fix

See [`2026-06-30-stapler-cdn-race.md`](./2026-06-30-stapler-cdn-race.md). That PR
made the notarize hook fail loudly on `status: Invalid` (it was masking this
very rejection). This PR removes the underlying cause so the build is genuinely
signed and notarizes.
