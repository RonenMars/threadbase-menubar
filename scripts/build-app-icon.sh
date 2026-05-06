#!/usr/bin/env bash
#
# Rasterizes assets/source-icon.svg → build/icon.icns (macOS app bundle icon).
#
# Usage:
#   ./scripts/build-app-icon.sh
#
# Requires `rsvg-convert` (Homebrew: `brew install librsvg`) plus `sips` and
# `iconutil` from Xcode Command Line Tools (preinstalled on macOS).
# Re-run whenever assets/source-icon.svg changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$REPO_ROOT/assets/source-icon.svg"
BUILD_DIR="$REPO_ROOT/build"
ICONSET="$BUILD_DIR/icon.iconset"
OUT="$BUILD_DIR/icon.icns"

for tool in rsvg-convert sips iconutil; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: $tool not found." >&2
    case "$tool" in
      rsvg-convert) echo "install: brew install librsvg" >&2 ;;
      *)            echo "install: xcode-select --install" >&2 ;;
    esac
    exit 1
  fi
done

[[ -f "$SRC" ]] || { echo "error: $SRC missing" >&2; exit 1; }

mkdir -p "$BUILD_DIR"
rm -rf "$ICONSET"
mkdir "$ICONSET"

# macOS .icns expects these specific filenames per Apple's Human Interface
# Guidelines: https://developer.apple.com/design/human-interface-guidelines/app-icons
# Pairs of (size, filename) — both 1x and 2x variants.
declare -a SPEC=(
  "16    icon_16x16.png"
  "32    icon_16x16@2x.png"
  "32    icon_32x32.png"
  "64    icon_32x32@2x.png"
  "128   icon_128x128.png"
  "256   icon_128x128@2x.png"
  "256   icon_256x256.png"
  "512   icon_256x256@2x.png"
  "512   icon_512x512.png"
  "1024  icon_512x512@2x.png"
)

for entry in "${SPEC[@]}"; do
  size="$(echo "$entry" | awk '{print $1}')"
  fname="$(echo "$entry" | awk '{print $2}')"
  rsvg-convert -w "$size" -h "$size" -a "$SRC" -o "$ICONSET/$fname"
done

iconutil -c icns "$ICONSET" -o "$OUT"
rm -rf "$ICONSET"

echo "wrote $OUT"
file "$OUT"
