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
# Time on 4 shared cores: logos ~15 min, backdrop ~5 min, icon ~10 min, pack + previews ~1 min.
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

# 1) logos (3D toy letters) - main is rendered piece by piece for the drop-in animation
$PY "$HERE/ttl_logo.py" -- --layout main  --out "$CACHE/logo" --ppu 600 --samples 32 --parts-only --no-label $RESUME
$PY "$HERE/ttl_logo.py" -- --layout short --out "$CACHE/logo" --ppu 600 --samples 32 --no-label $RESUME
$PY "$HERE/ttl_logo.py" -- --layout en    --out "$CACHE/logo" --ppu 360 --samples 32 --no-label $RESUME

# 2) backdrop strips (one process per strip: the pine builder caches materials per process)
for L in mtn_far mtn_mid forest clouds; do
  $PY "$HERE/ttl_backdrop3d.py" -- --out "$CACHE/bd" --layers $L --samples 24 $RESUME
done

# 3) app icon (full 1024 + Android adaptive foreground / background 432)
$PY "$HERE/ttl_icon.py" -- --out "$CACHE/icon" --size 1024 --ad-size 432 --samples 64 $RESUME

# 4) 2D finishing, skies / stars / aurora / clouds / city, FX, manifest, previews
$PY3 "$HERE/ttl_pack.py" --cache "$CACHE"
$PY3 "$HERE/ttl_preview.py"
echo "title art rebuilt -> assets/title (cache $CACHE)"
