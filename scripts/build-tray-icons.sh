#!/usr/bin/env bash
#
# Generates tray-icon-{online,offline,error}.{svg,png,@2x.png} from the
# canonical assets/threadbase-icon.svg. Each state is the full source SVG with
# the two background rects + the radial-glow stops swapped to a state colour.
#
# Usage:
#   ./scripts/build-tray-icons.sh
#
# Requires `rsvg-convert` (Homebrew: `brew install librsvg`).
# Re-run whenever assets/threadbase-icon.svg or the state palette changes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="$REPO_ROOT/assets"
SRC="$ASSETS_DIR/threadbase-icon.svg"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found." >&2
  echo "install: brew install librsvg" >&2
  exit 1
fi

[[ -f "$SRC" ]] || { echo "error: $SRC missing" >&2; exit 1; }

# Each state: <name>:<solid base hex>:<radial centre hex>
# Solid base = the bottom rect (line 61 of source).
# Radial centre = bgGlow stop at offset 0% (line 5 of source).
# Radial outer always equals the solid base for seamless edge.
STATES=(
  "online:#1a3d1a:#2d6e2d"     # running — dark green w/ lighter centre
  "offline:#1a1a1c:#3a3a3c"    # stopped — near-black w/ graphite centre
  "error:#3d0d0d:#7a1f1f"      # error   — dark red w/ lighter centre
)

# Read source once. Use awk to do the substitutions per state — sed in macOS is
# touchy with hex colours and we want a deterministic pipeline.
SRC_CONTENT="$(cat "$SRC")"

for entry in "${STATES[@]}"; do
  IFS=':' read -r name base centre <<< "$entry"
  out_svg="$ASSETS_DIR/tray-icon-$name.svg"

  # Pipe through a single awk that:
  #   1. Rewrites the bgGlow radial stops (lines 5–6 in source)
  #   2. Rewrites the solid background rect (line 61)
  #   3. Rewrites the bgGlow overlay rect — uses the gradient, no hex change needed
  #
  # The first solid rect with fill="#070b11" is the bottom background. The same
  # colour appears later as node fills (cx="138" cy="163" etc.) — those stay
  # dark to keep node depth, so we only swap the FIRST occurrence inside the
  # outermost background area.
  printf '%s' "$SRC_CONTENT" | awk \
    -v base="$base" -v centre="$centre" '
    {
      # bgGlow centre stop (offset 0%) — keep #0f1e35 → state centre
      gsub(/stop-color="#0f1e35"/, "stop-color=\"" centre "\"")
      # bgGlow outer stop (offset 100%) — keep #070b11 → state base
      # (will also match the bottom background rect, which is what we want)
      gsub(/stop-color="#070b11"/, "stop-color=\"" base "\"")
      # The solid background rect at line 61 uses fill="#070b11" — swap the
      # FIRST such occurrence only, to keep the dark node centres untouched.
      if (!swapped_bg && /<rect width="512" height="512" rx="96" fill="#070b11"\/>/) {
        sub(/fill="#070b11"/, "fill=\"" base "\"")
        swapped_bg = 1
      }
      print
    }
  ' > "$out_svg"

  echo "wrote $out_svg"
done

# Rasterise each state to 16×16 (@1x) and 32×32 (@2x) PNGs.
SIZES=(16 32)
for entry in "${STATES[@]}"; do
  IFS=':' read -r name _ _ <<< "$entry"
  src="$ASSETS_DIR/tray-icon-$name.svg"
  for size in "${SIZES[@]}"; do
    if [[ "$size" == "32" ]]; then
      out="$ASSETS_DIR/tray-icon-$name@2x.png"
    else
      out="$ASSETS_DIR/tray-icon-$name.png"
    fi
    rsvg-convert -w "$size" -h "$size" -a "$src" -o "$out"
    echo "wrote $out"
  done
done
