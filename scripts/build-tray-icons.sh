#!/usr/bin/env bash
#
# Rasterizes the tray-icon SVG variants in assets/ to PNG at @1x (16x16) and
# @2x (32x32). Output PNGs sit alongside the SVGs in assets/.
#
# Usage:
#   ./scripts/build-tray-icons.sh
#
# Requires `rsvg-convert` (Homebrew: `brew install librsvg`).
# Re-run whenever any tray-icon-*.svg changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/assets"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found." >&2
  echo "install: brew install librsvg" >&2
  exit 1
fi

STATES=(online offline error)
SIZES=(16 32)

for state in "${STATES[@]}"; do
  src="$ASSETS_DIR/tray-icon-$state.svg"
  if [[ ! -f "$src" ]]; then
    echo "error: $src missing" >&2
    exit 1
  fi
  for size in "${SIZES[@]}"; do
    if [[ "$size" == "32" ]]; then
      out="$ASSETS_DIR/tray-icon-$state@2x.png"
    else
      out="$ASSETS_DIR/tray-icon-$state.png"
    fi
    rsvg-convert -w "$size" -h "$size" -a "$src" -o "$out"
    echo "wrote $out"
  done
done
