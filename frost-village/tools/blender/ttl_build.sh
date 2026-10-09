#!/bin/sh
# ttl_build.sh - rebuild ALL title art (logos, backdrop strips, app icon) + assets/title + previews.
#
#   sh tools/blender/ttl_build.sh [cache_dir] [--resume]
#
# Rename the game: edit TITLE_NAME in src/title/config.js (tools/blender/ttl_config.py reads it),
# then run this script. Only the logos (and their previews) depend on the name.
#
# Needs: Blender as a python module (bpy 5.x) at $BLENDER_PY (default /tmp/bvenv/bin/python), or run
#        the three Blender scripts with `blender -b -P <script> -- <args>` yourself;
#        plain python3 with Pillow + numpy (+ scipy and imagequant recommended) at $PY3.
# Time on 4 shared cores: logos ~12 min, backdrop ~6 min, icon ~12 min, pack + previews + checks ~1 min.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
CACHE=${TTL_CACHE:-/tmp/fv_cache/title}
RESUME=""
for a in "$@"; do
  case "$a" in
    --resume) RESUME="--skip-existing" ;;
    *) CACHE="$a" ;;
  esac
done
PY=${BLENDER_PY:-/tmp/bvenv/bin/python}
PY3=${PY3:-python3}
export TTL_CACHE="$CACHE"
mkdir -p "$CACHE/logo" "$CACHE/bd" "$CACHE/icon"

# 0) the name: rows + glyph coverage, BEFORE any Blender time (stops with a clear message)
$PY3 "$HERE/ttl_check_name.py"

# 1) logos (3D toy letters) - main is rendered piece by piece for the drop-in animation
$PY "$HERE/ttl_logo.py" -- --layout main  --out "$CACHE/logo" --ppu 600 --samples 32 --parts-only --no-label $RESUME
$PY "$HERE/ttl_logo.py" -- --layout short --out "$CACHE/logo" --ppu 600 --samples 32 --no-label $RESUME
$PY "$HERE/ttl_logo.py" -- --layout en    --out "$CACHE/logo" --ppu 360 --samples 32 --no-label $RESUME

# 2) backdrop strips (one process per strip: the pine builder caches materials per process)
for L in mtn_far mtn_mid forest clouds city; do
  $PY "$HERE/ttl_backdrop3d.py" -- --out "$CACHE/bd" --layers $L --samples 24 $RESUME
done

# 3) app icon (full 1024 + its subject mask for the navy rim + Android adaptive foreground / background 432)
$PY "$HERE/ttl_icon.py" -- --out "$CACHE/icon" --size 1024 --ad-size 432 --samples 48 --passes full,mask,fg,bg $RESUME

# 4) 2D finishing, skies / stars / aurora / clouds / city, FX, manifest, previews
$PY3 "$HERE/ttl_pack.py" --cache "$CACHE"
$PY3 "$HERE/ttl_preview.py"

# 5) acceptance checks: jamo stay apart at phone size, emblem off the letters, English counters open,
#    every strip tiles without a seam, payload <= 1.5 MB (exit 1 on a failure)
$PY3 "$HERE/ttl_check.py" --cache "$CACHE" --out "$CACHE/ttl_check.json"
echo "title art rebuilt -> assets/title (cache $CACHE)"
