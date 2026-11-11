"""
prop_item_swap.py - put ONE re-rendered item back into assets/props/props_items IN PLACE, without touching any
other frame (v4.3: item_fish_cooked, the salmon steak became a whole grilled fish).  No Blender needed: python3 with
numpy + Pillow.

    /tmp/bvenv/bin/python tools/blender/prop_render.py -- item_fish_cooked --force [--cache DIR]
    python3 tools/blender/prop_item_swap.py item_fish_cooked [--cache DIR] [--dir DIR] [--dry-run]
    python3 tools/blender/prop_item_swap.py --verify OLD.png OLD.json [--dir DIR]

Why not prop_pack.py: a full pack rebuilds every props_* atlas from the render cache (all 53 sprites must be rendered
again in this container) and re-lays the item row, so every frame would move and change.  This tool keeps them.

Swap (default)
  1. reads <cache>/<key>.png + the sidecar <key>.json written by `prop_render.py -- <key>` (default cache
     <tmp>/fv_cache/props, like prop_render / prop_pack); the sidecar must say kind "item" + atlas "props_items"
  2. the SAME post + trim as prop_pack: pack_utils.clean_alpha(floor=3) (items have no baked shadow), then the 1 px
     padded trim of pack_atlas
  3. guard BEFORE: decodes the page to RGBA and hashes (sha256) every other frame's pixels and atlas entry
  4. the frame goes back into its OLD place when it fits there: its old rect is cleared and the new crop is pasted at
     the same (x, y) when it is no wider than the old rect plus the free columns up to the next frame (keeping the
     2 px gap of pack_atlas) and no taller than the page.  The page keeps its size (texture budget unchanged).
     Otherwise it is appended right of the right-most frame (2 px gap) and the page grows (printed as a warning).
  5. writes the page as RGBA PNG (the page already is RGBA, not palette): every other pixel decodes the same
  6. atlas JSON: the same entries in the same order, only <key>'s frame / trim changed; meta.size as written
  7. manifest.json: only <key>'s topPx / stackStep / thicknessM / notes follow the new render (anchor, frameSize,
     kind, icon and carryScale are kept); every other byte of the file stays the same
  8. guard AFTER: re-reads what was written; every other frame's hash + atlas entry is unchanged, the new frame
     decodes byte-identical to the post-processed render, nothing outside the frames is drawn.  On any mismatch the
     three files are restored and it exits 1.
--verify OLD.png OLD.json: checks the current page against an older copy (e.g. `git show <rev>:<path>`): every old
frame but the swapped one keeps its rect, trim, sourceSize and decoded pixels.  Exit 1 on any difference.
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
import pack_utils as pu  # noqa: E402

ATLAS = 'props_items'
PAD = 2
MAX_SHEET = 2048
MAN_KEYS = ('topPx', 'stackStep', 'thicknessM', 'notes')


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
    """prop_pack.load_frames's item post (no shadow) + pack_atlas's trim (pad 1): returns (full, crop, box)."""
    im = pu.clean_alpha(img.convert('RGBA'), floor=3)
    box = pu._trim_box(im)
    return im, im.crop(box), box


def verify(old_png, old_json, base, skip=()):
    new_png, new_json = os.path.join(base, ATLAS + '.png'), os.path.join(base, ATLAS + '.json')
    A, B = rgba(old_png), rgba(new_png)
    fa, fb = json.load(open(old_json))['frames'], json.load(open(new_json))['frames']
    ha, hb = frame_hashes(A, fa), frame_hashes(B, fb)
    bad = 0
    for n in fa:
        if n in skip:
            print('%-18s swapped (%s -> %s)' % (n, json.dumps(fa[n]['frame']), json.dumps(fb.get(n, {}).get('frame'))))
            continue
        ok = n in hb and ha[n] == hb[n]
        bad += not ok
        print('%-18s %s  %s' % (n, ha[n][0][:16], 'identical' if ok else 'CHANGED'))
    print('page %dx%d -> %dx%d' % (A.shape[1], A.shape[0], B.shape[1], B.shape[0]))
    return 1 if bad else 0


def patch_manifest_text(raw, key, upd):
    """Change only `key`'s fields in the manifest text (indent=1 JSON) - every other byte stays the same."""
    man = json.loads(raw)
    sp = man['sprites'][key]
    for k, v in upd.items():
        sp[k] = v
    out = json.dumps(man, indent=1, ensure_ascii=False)
    if raw.endswith('\n') and not out.endswith('\n'):
        out += '\n'
    return out


def main(argv):
    base = os.path.join(GAME, 'assets', 'props')
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'props')
    dry = '--dry-run' in argv
    if '--dir' in argv:
        base = os.path.abspath(argv[argv.index('--dir') + 1])
    if '--cache' in argv:
        cache = os.path.abspath(argv[argv.index('--cache') + 1])
    keys = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] not in
                                                                          ('--dir', '--cache', '--verify'))]
    if '--verify' in argv:
        i = argv.index('--verify')
        return verify(argv[i + 1], argv[i + 2], base, skip=[k for k in keys if k not in argv[i + 1:i + 3]])
    if len(keys) != 1:
        sys.exit(__doc__)
    key = keys[0]
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side) or not os.path.exists(os.path.join(cache, key + '.png')):
        sys.exit('prop_item_swap: no render of %s in %s - run `/tmp/bvenv/bin/python tools/blender/prop_render.py -- '
                 '%s --force` first (nothing was written)' % (key, cache, key))
    meta = json.load(open(side))
    if meta.get('kind') != 'item' or meta.get('atlas') != ATLAS or meta.get('frames') != [key]:
        sys.exit('prop_item_swap: %s is not a one-frame %s item (kind %r atlas %r)' % (key, ATLAS, meta.get('kind'),
                                                                                       meta.get('atlas')))
    png, js, man_path = (os.path.join(base, ATLAS + '.png'), os.path.join(base, ATLAS + '.json'),
                         os.path.join(base, 'manifest.json'))
    backup = {p: open(p, 'rb').read() for p in (png, js, man_path)}
    old = json.load(open(js))
    if key not in old['frames']:
        sys.exit('prop_item_swap: %s is not on %s (this tool replaces a frame; nothing was written)' % (key, ATLAS))
    A = rgba(png)
    H0, W0 = A.shape[:2]
    before = frame_hashes(A, old['frames'])
    keep = {n: f for n, f in old['frames'].items() if n != key}

    full, crop, box = post(Image.open(os.path.join(cache, key + '.png')))
    if full.size != (meta['frameSize'][0], meta['frameSize'][1]):
        sys.exit('prop_item_swap: the render is %dx%d, the sidecar says %s' % (full.width, full.height, meta['frameSize']))
    r0 = old['frames'][key]['frame']
    arr = A.copy()
    arr[r0['y']:r0['y'] + r0['h'], r0['x']:r0['x'] + r0['w']] = 0
    # room at the old place: up to the next frame on the same shelf (its left edge - PAD) and the page bottom
    nxt = min([f['frame']['x'] for f in keep.values()
               if f['frame']['x'] >= r0['x'] + r0['w'] and f['frame']['y'] < r0['y'] + max(r0['h'], crop.height)
               and f['frame']['y'] + f['frame']['h'] > r0['y']] + [W0 + PAD])
    room_w, room_h = nxt - PAD - r0['x'], H0 - r0['y']
    below = [f for f in keep.values() if f['frame']['y'] >= r0['y'] + r0['h'] and
             f['frame']['x'] < r0['x'] + crop.width and f['frame']['x'] + f['frame']['w'] > r0['x']]
    if below:
        room_h = min(room_h, min(f['frame']['y'] for f in below) - PAD - r0['y'])
    if crop.width <= room_w and crop.height <= room_h:
        x, y, W, H = r0['x'], r0['y'], W0, H0
        where = 'in place (room %dx%d)' % (room_w, room_h)
    else:
        right = max(f['frame']['x'] + f['frame']['w'] for f in keep.values())
        x, y = right + PAD, 0
        W, H = pu._pow2ish(max(W0, x + crop.width)), pu._pow2ish(max(H0, crop.height))
        where = 'APPENDED (does not fit the old %dx%d room): the page grows %dx%d -> %dx%d' % (room_w, room_h, W0, H0, W, H)
        if W > MAX_SHEET or H > MAX_SHEET:
            sys.exit('prop_item_swap: %s would be %dx%d (> %d)' % (ATLAS, W, H, MAX_SHEET))
    out = np.zeros((H, W, 4), np.uint8)
    out[:H0, :W0] = arr
    c = np.asarray(crop)
    out[y:y + crop.height, x:x + crop.width] = c
    frames = {}
    for n, f in old['frames'].items():                 # same order
        frames[n] = f if n != key else {
            'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
            'trimmed': crop.size != full.size,
            'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
            'sourceSize': {'w': full.width, 'h': full.height}}
    atlas = {'frames': frames, 'meta': dict(old['meta'], size={'w': W, 'h': H})}

    raw_man = backup[man_path].decode('utf-8')
    man = json.loads(raw_man)
    if json.dumps(man, indent=1, ensure_ascii=False) + ('\n' if raw_man.endswith('\n') else '') != raw_man:
        sys.exit('prop_item_swap: manifest.json is not in the indent=1 layout this tool rewrites (nothing was written)')
    sp = man['sprites'][key]
    upd = {k: meta[k] for k in MAN_KEYS if k in meta and sp.get(k) != meta[k]}
    if [round(v, 4) for v in sp['anchor']] != [round(v, 4) for v in meta['anchor']] or sp.get('frameSize') != meta['frameSize']:
        sys.exit('prop_item_swap: the render has another frame / anchor (%s %s) than the manifest (%s %s)' % (
            meta['frameSize'], meta['anchor'], sp.get('frameSize'), sp['anchor']))

    print('%s: %s %dx%d at (%d, %d) %s; was %dx%d at (%d, %d); manifest: %s' % (
        ATLAS, key, crop.width, crop.height, x, y, where, r0['w'], r0['h'], r0['x'], r0['y'],
        ', '.join('%s %r -> %r' % (k, sp.get(k), v) for k, v in upd.items()) or 'unchanged'))
    if dry:
        print('dry run: nothing written')
        return 0
    Image.fromarray(out, 'RGBA').save(png, optimize=True)
    with open(js, 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    with open(man_path, 'w', encoding='utf-8') as f:
        f.write(patch_manifest_text(raw_man, key, upd))

    # ---- guard AFTER: what is on disk now
    B = rgba(png)
    after = frame_hashes(B, json.load(open(js))['frames'])
    errs = []
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
    if B[~mask].any():
        errs.append('stray pixels outside the frames')
    m2 = json.load(open(man_path, encoding='utf-8'))
    m1 = json.loads(raw_man)
    for k in m1['sprites']:
        if k != key and m1['sprites'][k] != m2['sprites'].get(k):
            errs.append('manifest entry %s changed' % k)
    if {k: v for k, v in m1.items() if k != 'sprites'} != {k: v for k, v in m2.items() if k != 'sprites'}:
        errs.append('manifest atlases changed')
    if errs:
        for p, b in backup.items():
            with open(p, 'wb') as f:
                f.write(b)
        sys.exit('prop_item_swap: GUARD FAILED (%s) - the old files were restored' % '; '.join(errs))
    for n in keep:
        print('  %-18s %s  unchanged' % (n, after[n][0][:16]))
    print('  %-18s %s  new' % (key, after[key][0][:16]))
    print('guard: all %d other frames are byte-identical; page %dx%d (was %dx%d); %s %.1f KB (was %.1f KB)' % (
        len(keep), W, H, W0, H0, os.path.basename(png), os.path.getsize(png) / 1024.0, len(backup[png]) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
