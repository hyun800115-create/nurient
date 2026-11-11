"""
bakery_pack.py - turn the v4.3 「밀밭 · 빵집」 renders (bakery_render.py cache) into assets/bakery43/ (no Blender: python3 +
numpy + Pillow (+ imagequant)).

    python3 tools/blender/bakery_pack.py [--cache DIR] [--quantize auto|on|off] [--prev DIR]

  1. the SAME post as the props / v3 buildings / the stall / the deck (bld_pack.load: clean_alpha + tint_shadow +
     border_fade; a front layer = its frame x the object mask); the stall's stock overlays = the stock frame x the
     loaves' object mask (bakery43_bread_1 / _2, same frame + anchor as the stall)
  2. ONE page `bakery43` (spec §6.1: <= 640 x 512 = 1.25 MiB GPU; refuses anything over the 1.5 MiB hard cap), packed
     with a skyline packer over trimmed frames; palettised with libimagequant when the RGBA file is over 1 MB
  3. assets/bakery43/manifest.json (the market manifest's format: sprites with anchors, footprints, overlay, staffPoints,
     staffDirs, staffDepth, stepLiftPx, customerPoints, signQuad, fxPoints, walls, door / in / out points)
  4. assets/bakery43/ghost_sigs.json: goods-free 16 x 16 alpha-weighted luma signatures of the cottage and stall frames
     (tools/test/ghostsweep.mjs format: frame name -> 256 numbers), measured on the packed page
  5. --prev DIR: DIR/bakery43_sheet.jpg (a quick look-dev sheet of every frame on the snow ground)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import bld_pack as bp    # noqa: E402  (read-only reuse: load = post + front-layer cut, quantize)

OUT = os.path.join(GAME, 'assets', 'bakery43')
DEFAULT_CACHE = os.path.join(__import__('tempfile').gettempdir(), 'fv_cache', 'bakery43')
PAGE = 'bakery43'
PAGE_MAX = (640, 512)               # spec §6.1 target
HARD_CAP = 1.5 * 1048576            # spec §6.1 hard cap (GPU bytes)
FILE_BUDGET = 1.0 * 1048576
PAD = 2
BUILDS = ['bakery43', 'bakery43_stall', 'farm43_hut', 'farm43_scarecrow', 'farm43_sledcart', 'farm43_sacks']
GHOST = ['bakery43_back', 'bakery43_front', 'bakery43_stall_back', 'bakery43_stall_front']
STALL_FULL_AT = 12                  # balance.js bakery43.fullAt (the art: bread_2 from 12 loaves on)
# collision circles of the cottage walls, bakery-local metres (spec §3.3), r 30 px; doorway open at bx 0.2 .. 1.1
WALLS_M = [(-0.9, 1.1), (0.0, 1.1), (0.9, 1.1), (-1.1, 0.4), (-1.1, -0.5), (1.1, 0.4), (1.1, -0.5), (-0.9, -1.1),
           (-0.3, -1.1)]

CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre (bakery43_back: the '
              'cottage anchor A = world.js bakery43 x, y; the stall: its footprint centre).',
    'layers': 'bakery43_back (depth A.y) -> the baker at staffPoints[0] (A.y + 0.5) -> bakery43_front (A.y + 1: the low '
              'front sill + flower box, the lower 0.9 m of the front-left corner post and the door jamb, the right '
              'ledge + corner pier). bakery43_stall_back (d) -> the clerk at staffPoints[0] lifted stepLiftPx (d + 0.5) '
              '-> bakery43_stall_front (d + 1: counter + empty bread case) -> the stock overlay (d + 1.1): none when '
              'empty, bakery43_bread_1 for 1 .. fullAt-1 loaves, bakery43_bread_2 from fullAt (stockFullAt).',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the sprite anchor (unscaled sprite).',
    'walls': 'bakery43_back walls = collision circles [dx, dy, r] px from the anchor (the doorway bx 0.2 .. 1.1 stays '
             'open; the stall, the pads and the oven have no round collider).',
    'signQuad': 'the 4 corners [top-left, top-right, bottom-right, bottom-left] of a blank board face (it faces world -Y: '
                'the top edge slopes down to the right, 1 px down per 2 px across). The game writes signText (a '
                'strings.js key) into it, sheared the same way.',
    'ghost': 'no bread, dough or wheat is painted on the cottage or the stall frames: the loaves on the stall are the '
             'stock overlays, the oven\'s loaves are item sprites flown from fxPoints.ovenMouth (ghost_sigs.json holds '
             'their goods-free signatures for tools/test/ghostsweep_art.json).',
}


def px(bx, by, z=0.0):
    """bakery-local metres -> px offset from the anchor (CONTRACT projection)."""
    return [int(round(45.2548 * (bx + by))), int(round(22.6274 * (bx - by) - 55.4256 * z))]


def skyline(sizes, widths):
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    best = None
    for W in widths:
        if W < max(w for w, _ in sizes):
            continue
        sky = np.zeros(W + PAD, dtype=np.int64)
        pos = [None] * len(sizes)
        H = 0
        for i in order:
            w, h = sizes[i]
            ww = min(w + PAD, W + PAD)
            win = np.lib.stride_tricks.sliding_window_view(sky[:W + PAD], ww).max(axis=1)[:max(1, W - w + 1)]
            x = int(np.argmin(win))
            y = int(win[x])
            pos[i] = (x, y)
            sky[x:x + ww] = y + h + PAD
            H = max(H, y + h)
        H = (H + 3) // 4 * 4
        if best is None or W * H < best[0]:
            best = (W * H, W, H, pos)
    return best[1], best[2], best[3]


def pack_page(frames):
    """frames [(name, img)] -> (sheet, atlas json) on the smallest W x H (H <= PAGE_MAX[1] when it fits)."""
    items = []
    for n, im in frames:
        box = pu._trim_box(im)
        items.append((n, im.size, box, im.crop(box)))
    sizes = [c.size for _n, _s, _b, c in items]
    W, H, pos = skyline(sizes, range(512, PAGE_MAX[0] + 1, 8))
    if W * H * 4 > PAGE_MAX[0] * PAGE_MAX[1] * 4 or H > PAGE_MAX[1]:
        # (the baked ground shadows make the frames ~1.2 MiB on their own: any shape up to the hard cap is fine)
        print('note: the frames do not fit %dx%d (best %dx%d); trying other widths' % (PAGE_MAX + (W, H)))
        W, H, pos = skyline(sizes, range(400, 1025, 8))
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out = {}
    for (n, (sw, sh), box, crop), (x, y) in zip(items, pos):
        sheet.paste(crop, (x, y))
        out[n] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                  'trimmed': (crop.width, crop.height) != (sw, sh),
                  'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                  'sourceSize': {'w': sw, 'h': sh}}
    atlas = {'frames': out, 'meta': {'app': 'frost-village/tools/blender/bakery_pack.py', 'version': '1.0',
                                     'image': PAGE + '.png', 'format': 'RGBA8888', 'size': {'w': W, 'h': H},
                                     'scale': '1'}}
    return sheet, atlas


def stock_frames(cache, m, frames):
    out = {}
    for s in m.get('stock', []):
        mask = np.asarray(Image.open(os.path.join(cache, s['mask'] + '.png')).convert('RGBA')).astype(np.float32)
        mval = (mask[..., 0] / 255.0) * (mask[..., 3] / 255.0)
        a = np.asarray(frames[s['src']]).astype(np.float32).copy()
        a[..., 3] *= mval
        out[s['key']] = pu.clean_alpha(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
    return out


def base_entry(m, n, frame_atlas, kind):
    s = {'atlas': frame_atlas[n], 'frame': n, 'anchor': m['anchor'], 'kind': kind, 'frameSize': m['frameSize'],
         'topPx': m['topPx'].get(n) if isinstance(m['topPx'], dict) else m['topPx'], 'front': m.get('front', '-Y'),
         'notes': m.get('notes', '')}
    if m.get('footprint'):
        s['footprint'] = m['footprint']
        s['footprintM'] = m['footprintM']
    if m.get('fxPoints'):
        s['fxPoints'] = m['fxPoints']
    return s


def overlay_entry(m, key, frame_atlas, notes):
    return {'atlas': frame_atlas[key], 'frame': key, 'anchor': m['anchor'], 'kind': 'overlay', 'of': m['frames'][0],
            'frameSize': m['frameSize'], 'notes': notes}


def entries(builds, frame_atlas):
    sp = {}
    # ---- the cottage
    m = builds['bakery43']
    n = m['frames'][0]
    pts, dirs = m['framePoints'][n], m['frameDirs'].get(n, {})
    s = base_entry(m, n, frame_atlas, 'building')
    s.update({'staffPoints': pts['staff'], 'staffDirs': dirs.get('staff', ['SE']), 'staffDepth': 'front',
              'ovenDir': 'W', 'doorPoint': pts['door'][0], 'inPoint': pts['in'][0], 'outPoint': pts['out'][0],
              'signQuad': pts['sign'], 'signText': 'sign_bakery43', 'signColor': '#5A3418',
              'overlay': m['overlay']['key'], 'occluder': True,
              'walls': [px(bx, by) + [30] for bx, by in WALLS_M]})
    sp[n] = s
    sp[m['overlay']['key']] = overlay_entry(
        m, m['overlay']['key'], frame_atlas,
        'Front layer of bakery43_back (same frame + anchor): the low front sill + flower box, the lower 0.9 m of the '
        'front-left corner post and of the door jamb, the right ledge (0.75 m) + its corner pier. Draw it ABOVE the '
        'baker (A.y + 1).')
    # ---- the stall
    m = builds['bakery43_stall']
    n = m['frames'][0]
    pts, dirs = m['framePoints'][n], m['frameDirs'].get(n, {})
    staff, step = pts['staff'][0], pts['step'][0]
    s = base_entry(m, n, frame_atlas, 'building')
    s.update({'staffPoints': [staff], 'staffDirs': dirs.get('staff', ['SW'])[:1], 'staffDepth': 'front',
              'stepLiftPx': int(staff[1] - step[1]), 'stepM': 0.1, 'counterM': 0.6, 'caseTopM': 0.74,
              'customerPoints': pts.get('customer', []), 'customerDirs': dirs.get('customer', ['NE']),
              'signQuad': pts['sign'], 'signText': 'sign_stall43', 'signColor': '#6E3E1E',
              'overlay': m['overlay']['key'],
              'stockOverlays': [x['key'] for x in m.get('stock', [])], 'stockFullAt': STALL_FULL_AT})
    sp[n] = s
    sp[m['overlay']['key']] = overlay_entry(
        m, m['overlay']['key'], frame_atlas,
        'Front layer of bakery43_stall_back (same frame + anchor): the 0.6 m counter and the EMPTY sloped bread case. '
        'Draw it ABOVE the clerk (d + 1).')
    for x in m.get('stock', []):
        e = overlay_entry(m, x['key'], frame_atlas,
                          ('Stock overlay of the stall (same frame + anchor), drawn over bakery43_stall_front: %s.'
                           % ('3 loaves + a baguette on the case, for 1 .. stockFullAt - 1 loaves'
                              if x['key'].endswith('_1') else
                              'a full case + a basket of rolls, from stockFullAt loaves')))
        e['role'] = 'stock'
        sp[x['key']] = e
    # ---- the field
    m = builds['farm43_hut']
    n = m['frames'][0]
    s = base_entry(m, n, frame_atlas, 'building')
    s['doorPoint'] = m['framePoints'][n]['door'][0]
    s['colliderPx'] = 62
    sp[n] = s
    for k, r in (('farm43_scarecrow', 14), ('farm43_sledcart', 34), ('farm43_sacks', None)):
        m = builds[k]
        n = m['frames'][0]
        s = base_entry(m, n, frame_atlas, 'prop')
        if r:
            s['colliderPx'] = r
        sp[n] = s
    return sp


def page_frame(sheet, f):
    r, ss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
    full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
    full.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
    return full


def ghost_sig(im, g=16):
    """tools/test/ghostsweep.mjs: a g x g grid of alpha-weighted luma over the whole untrimmed frame."""
    a = np.asarray(im.convert('RGBA')).astype(np.float64)
    W, H = im.size
    lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]) * a[..., 3] / 255.0
    out = []
    for gy in range(g):
        y0, y1 = (gy * H) // g, ((gy + 1) * H) // g
        for gx in range(g):
            x0, x1 = (gx * W) // g, ((gx + 1) * W) // g
            c = lum[y0:y1, x0:x1]
            out.append(round(float(c.mean()) if c.size else 0.0, 2))
    return out


def preview(frames, path):
    names = ['bakery43_back', 'bakery43_front', 'bakery43_stall_back', 'bakery43_stall_front', 'bakery43_bread_1',
             'bakery43_bread_2', 'farm43_hut', 'farm43_scarecrow', 'farm43_sledcart', 'farm43_sacks']
    ims = [(n, frames[n]) for n in names if n in frames]
    W = sum(i.width for _, i in ims) + 10 * len(ims) + 10
    H = max(i.height for _, i in ims) + 30
    snow = os.path.join(GAME, 'assets', 'ground', 'ground_snow.png')
    cv = Image.new('RGBA', (W, H), (226, 234, 244, 255))
    if os.path.exists(snow):
        t = Image.open(snow).convert('RGBA')
        for y in range(0, H, t.height):
            for x in range(0, W, t.width):
                cv.alpha_composite(t, (x, y))
    d = ImageDraw.Draw(cv)
    x = 10
    for n, i in ims:
        cv.alpha_composite(i, (x, 24))
        d.text((x + 2, 4), n, fill=(30, 30, 40, 255))
        x += i.width + 10
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv.convert('RGB').save(path, quality=88)
    print('preview', path)


def main():
    args = sys.argv[1:]

    def opt(k, d=None):
        return args[args.index(k) + 1] if k in args else d
    cache = opt('--cache', DEFAULT_CACHE)
    mode = opt('--quantize', 'auto')
    keys, builds, _boats, _staff, frames, _bf = bp.load(cache)
    missing = [k for k in BUILDS if k not in builds]
    if missing:
        raise SystemExit('bakery_pack: ABORT - the cache %s lacks %s; nothing was written (bakery_render.py first)'
                         % (cache, ', '.join(missing)))
    names = []
    for k in BUILDS:
        m = builds[k]
        names.append(m['frames'][0])
        if m.get('overlay'):
            names.append(m['overlay']['key'])
        st = stock_frames(cache, m, frames)
        frames.update(st)
        names += sorted(st)
    sheet, atlas = pack_page([(n, frames[n]) for n in names])
    gpu = sheet.width * sheet.height * 4
    if gpu > HARD_CAP:
        raise SystemExit('bakery_pack: ABORT - page %dx%d = %.2f MiB is over the %.2f MiB hard cap; nothing was written'
                         % (sheet.width, sheet.height, gpu / 1048576.0, HARD_CAP / 1048576.0))
    os.makedirs(OUT, exist_ok=True)
    png, js = os.path.join(OUT, PAGE + '.png'), os.path.join(OUT, PAGE + '.json')
    pu.save_atlas(sheet, atlas, png, js, quantize=False)
    size = os.path.getsize(png)
    if mode == 'on' or (mode == 'auto' and size > FILE_BUDGET):
        try:
            bp.quantize(sheet).save(png, optimize=True)
            print('  %s palettised (%d KB RGBA -> %d KB)' % (PAGE, size // 1024, os.path.getsize(png) // 1024))
        except ImportError:
            print('  imagequant not installed -> kept RGBA')
    print('%s %dx%d %d frames %.1f KB file, GPU %.2f MiB' % (PAGE, sheet.width, sheet.height, len(names),
                                                             os.path.getsize(png) / 1024.0, gpu / 1048576.0))
    frame_atlas = {n: PAGE for n in atlas['frames']}
    sprites = entries(builds, frame_atlas)
    man = {'version': 1, 'generator': 'tools/blender/bakery_render.py + bakery_pack.py (v4.3 bakery split: the bakery '
                                      'cottage + bread stall, the wheat field\'s 농막 and props)',
           'conventions': CONVENTIONS,
           'atlases': [{'key': PAGE, 'png': 'bakery43/%s.png' % PAGE, 'json': 'bakery43/%s.json' % PAGE}],
           'sprites': sprites}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    # ghost signatures measured on the page as written (palettised or not)
    page = Image.open(png).convert('RGBA')
    sigs = {n: ghost_sig(page_frame(page, atlas['frames'][n])) for n in GHOST}
    with open(os.path.join(OUT, 'ghost_sigs.json'), 'w', encoding='utf-8') as f:
        json.dump({'notes': 'goods-free 16 x 16 alpha-weighted luma signatures (tools/test/ghostsweep.mjs art section): '
                            'merge these entries into tools/test/ghostsweep_art.json', 'sigs': sigs}, f)
        f.write('\n')
    print('wrote', os.path.join(OUT, 'manifest.json'), '(%d sprites) + ghost_sigs.json' % len(sprites))
    if opt('--prev'):
        preview({n: page_frame(page, atlas['frames'][n]) for n in atlas['frames']},
                os.path.join(opt('--prev'), 'bakery43_sheet.jpg'))


if __name__ == '__main__':
    main()
