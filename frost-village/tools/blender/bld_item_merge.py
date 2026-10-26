"""
bld_item_merge.py - add ONE rendered item to the resident bld_items page WITHOUT touching any other frame
(v4.2.1 B1-M: item_can_meat).  No Blender needed: python3 with numpy + Pillow.

    python3 tools/blender/bld_item_merge.py item_can_meat [--cache DIR] [--dir DIR] [--dry-run]
    python3 tools/blender/bld_item_merge.py --verify OLD.png OLD.json [--dir DIR]

Why not bld_pack.py: a full repack rebuilds every atlas from the render cache (all 29 sprites + both boats must be
rendered again) and re-palettises the pages, so every old frame would change.  This tool keeps the old frames.

Merge (default)
  1. reads <cache>/<key>.png + the sidecar <key>.json written by `bld_render.py -- <key>` (default cache
     <tmp>/fv_cache/buildings, like bld_render / bld_pack); the sidecar must say kind "item" + atlas "bld_items"
  2. the SAME post + trim as bld_pack: pack_utils.clean_alpha(floor=3), then the 1 px padded trim of pack_atlas
  3. guard BEFORE: decodes the current page to RGBA and hashes (sha256) every frame's pixels and atlas entry
  4. the new sheet = the old page's decoded RGBA pasted at (0, 0) unchanged + the new frame appended to the right
     of the right-most frame (2 px gap, y = 0); size rounded up to a multiple of 4 like pack_atlas.  If the key is
     already on the page (a re-run after a re-render) its old rect is cleared and the frame is placed again, so the
     tool is idempotent.
  5. writes the page as RGBA PNG.  The old page was a 255-colour palette PNG and its palette is full, so a palette
     PNG cannot hold the new colours without re-quantising (= changing) the old frames; an RGBA PNG decodes every
     old pixel to exactly the same RGBA.  The manifest's bld_items atlas entry gets `lossless: true` so the artifact
     build (tools/build/webp_assets.py) keeps the page as this PNG instead of a lossy WebP.
  6. atlas JSON: the old entries unchanged (same order) + the new one; meta.size updated
  7. manifest.json: the sprite entry made by bld_pack.sprite_entries (anchor, frameSize, topPx, stackStep, icon,
     carryScale, thicknessM, notes), inserted after the last item; every other byte of the file stays the same
  8. guard AFTER: re-reads what was written and checks: the old page's region decodes byte-identical, every old
     frame's hash + atlas entry is unchanged, the new frame decodes byte-identical to the post-processed render, and
     everything else on the page is fully transparent.  On any mismatch the three files are restored and it exits 1.
--verify OLD.png OLD.json: checks the current page against an older copy (e.g. `git show <rev>:<path>`): every old
frame keeps its rect, trim, sourceSize and decoded pixels.  Prints one line per frame; exit 1 on any difference.
"""
import hashlib
import json
import os
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import bld_pack as bp    # noqa: E402  (read-only reuse: sprite_entries = the manifest entry a full pack would write)

ATLAS = 'bld_items'
PAD = 2
MAX_SHEET = 2048


def rgba(path):
    with Image.open(path) as im:
        return np.asarray(im.convert('RGBA')).copy()


def frame_hashes(arr, frames):
    """{name: (sha256 of the frame rect's decoded RGBA bytes, canonical JSON of its atlas entry)}"""
    out = {}
    for n, f in frames.items():
        r = f['frame']
        px = np.ascontiguousarray(arr[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']])
        out[n] = (hashlib.sha256(px.tobytes()).hexdigest(), json.dumps(f, sort_keys=True))
    return out


def post(img):
    """bld_pack.load's item post + pack_atlas's trim (pad 1): returns (crop, box)."""
    im = pu.clean_alpha(img.convert('RGBA'), floor=3)
    box = pu._trim_box(im)
    return im, im.crop(box), box


def verify(old_png, old_json, base):
    new_png, new_json = os.path.join(base, ATLAS + '.png'), os.path.join(base, ATLAS + '.json')
    A, B = rgba(old_png), rgba(new_png)
    fa, fb = json.load(open(old_json))['frames'], json.load(open(new_json))['frames']
    ha, hb = frame_hashes(A, fa), frame_hashes(B, fb)
    bad = 0
    for n in fa:
        ok = n in hb and ha[n] == hb[n]
        bad += not ok
        print('%-16s %s  %s' % (n, ha[n][0][:16], 'identical' if ok else 'CHANGED'))
    h, w = A.shape[:2]
    whole = B.shape[0] >= h and B.shape[1] >= w and np.array_equal(A, B[:h, :w])
    print('old page region %dx%d: %s' % (w, h, 'identical' if whole else 'CHANGED'))
    extra = [n for n in fb if n not in fa]
    print('new frames: %s' % (', '.join(extra) or '-'))
    return 1 if bad or not whole else 0


def main(argv):
    base = os.path.join(GAME, 'assets', 'buildings')
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'buildings')
    dry = '--dry-run' in argv
    if '--dir' in argv:
        base = os.path.abspath(argv[argv.index('--dir') + 1])
    if '--cache' in argv:
        cache = os.path.abspath(argv[argv.index('--cache') + 1])
    if '--verify' in argv:
        i = argv.index('--verify')
        return verify(argv[i + 1], argv[i + 2], base)
    keys = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] not in
                                                                          ('--dir', '--cache'))]
    if len(keys) != 1:
        sys.exit(__doc__)
    key = keys[0]
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side) or not os.path.exists(os.path.join(cache, key + '.png')):
        sys.exit('bld_item_merge: no render of %s in %s - run `/tmp/bvenv/bin/python tools/blender/bld_render.py -- '
                 '%s` first (nothing was written)' % (key, cache, key))
    meta = json.load(open(side))
    if meta.get('kind') != 'item' or meta.get('atlas') != ATLAS or meta.get('frames') != [key]:
        sys.exit('bld_item_merge: %s is not a one-frame %s item (kind %r atlas %r)' % (key, ATLAS, meta.get('kind'),
                                                                                       meta.get('atlas')))
    png, js, man_path = (os.path.join(base, ATLAS + '.png'), os.path.join(base, ATLAS + '.json'),
                         os.path.join(base, 'manifest.json'))
    backup = {p: open(p, 'rb').read() for p in (png, js, man_path)}
    old = json.load(open(js))
    A = rgba(png)
    before = frame_hashes(A, old['frames'])
    keep = {n: f for n, f in old['frames'].items() if n != key}

    full, crop, box = post(Image.open(os.path.join(cache, key + '.png')))
    sheet_arr = A.copy()
    if key in old['frames']:                           # re-run: clear the previous copy of this frame
        r = old['frames'][key]['frame']
        sheet_arr[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']] = 0
    right = max(f['frame']['x'] + f['frame']['w'] for f in keep.values())
    x, y = right + PAD, 0
    W = pu._pow2ish(max(x + crop.width, A.shape[1] if key not in old['frames'] else right))
    H = pu._pow2ish(max(A.shape[0] if key not in old['frames'] else
                        max(f['frame']['y'] + f['frame']['h'] for f in keep.values()), crop.height))
    if W > MAX_SHEET or H > MAX_SHEET:
        sys.exit('bld_item_merge: %s would be %dx%d (> %d)' % (ATLAS, W, H, MAX_SHEET))
    out = np.zeros((H, W, 4), np.uint8)
    hh, ww = min(H, sheet_arr.shape[0]), min(W, sheet_arr.shape[1])
    out[:hh, :ww] = sheet_arr[:hh, :ww]
    c = np.asarray(crop)
    out[y:y + crop.height, x:x + crop.width] = c
    frames = dict(keep)
    frames[key] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                   'trimmed': crop.size != full.size,
                   'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                   'sourceSize': {'w': full.width, 'h': full.height}}
    atlas = {'frames': frames, 'meta': dict(old['meta'], format='RGBA8888', size={'w': W, 'h': H})}

    man = json.load(open(man_path, encoding='utf-8'))
    entry = bp.sprite_entries(key, meta, {key: ATLAS}, {key: full})[key]
    sprites = man['sprites']
    order = [k for k in sprites if k != key]
    last_item = max((i for i, k in enumerate(order) if sprites[k].get('kind') == 'item'), default=len(order) - 1)
    order.insert(last_item + 1, key)
    man['sprites'] = {k: (dict(sprites.get(k, {}), **entry) if k == key else sprites[k]) for k in order}
    for a in man['atlases']:
        if a['key'] == ATLAS:
            a['lossless'] = True
            a['notes'] = ('always loaded (Assets EAGER_KEYS). v4.2.1: item_can_meat merged in by '
                          'tools/blender/bld_item_merge.py; the older frames are byte-identical to v4.2. Kept '
                          'lossless (RGBA PNG, no WebP / palette) so they stay so in the build.')

    print('%s: %s %dx%d at (%d, %d) on a %dx%d page (was %dx%d); stackStep %s topPx %s carryScale %s' % (
        ATLAS, key, crop.width, crop.height, x, y, W, H, A.shape[1], A.shape[0], entry.get('stackStep'),
        entry.get('topPx'), entry.get('carryScale')))
    if dry:
        print('dry run: nothing written')
        return 0
    Image.fromarray(out, 'RGBA').save(png, optimize=True)
    with open(js, 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)

    # ---- guard AFTER: what is on disk now
    B = rgba(png)
    after = frame_hashes(B, json.load(open(js))['frames'])
    errs = []
    if key in old['frames']:
        region = np.ones(A.shape[:2], bool)
        r = old['frames'][key]['frame']
        region[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']] = False
        h0, w0 = min(A.shape[0], B.shape[0]), min(A.shape[1], B.shape[1])
        if not np.array_equal(A[:h0, :w0][region[:h0, :w0]], B[:h0, :w0][region[:h0, :w0]]):
            errs.append('the old page region changed')
    elif not np.array_equal(A, B[:A.shape[0], :A.shape[1]]):
        errs.append('the old page region changed')
    for n in keep:
        if before[n] != after.get(n):
            errs.append('frame %s changed' % n)
    r = frames[key]['frame']
    if not np.array_equal(B[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']], c):
        errs.append('the new frame does not decode to the render')
    mask = np.zeros(B.shape[:2], bool)
    for f in frames.values():
        q = f['frame']
        mask[q['y']:q['y'] + q['h'], q['x']:q['x'] + q['w']] = True
    mask[:min(A.shape[0], H), :min(A.shape[1], W)] = True   # the old page region is checked pixel-for-pixel above
    if B[~mask].any():
        errs.append('stray pixels outside the frames')
    if errs:
        for p, b in backup.items():
            with open(p, 'wb') as f:
                f.write(b)
        sys.exit('bld_item_merge: GUARD FAILED (%s) - the old files were restored' % '; '.join(errs))
    for n in keep:
        print('  %-16s %s  unchanged' % (n, after[n][0][:16]))
    print('  %-16s %s  new' % (key, after[key][0][:16]))
    print('guard: the old %dx%d page region and all %d old frames are byte-identical; files: %s (%.1f KB), %s, '
          'manifest.json' % (A.shape[1], A.shape[0], len(keep), os.path.basename(png), os.path.getsize(png) / 1024.0,
                             os.path.basename(js)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
