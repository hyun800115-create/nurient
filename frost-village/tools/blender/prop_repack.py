"""
prop_repack.py - (v4.3 bakery split, spec §6.3) repack assets/props/props_buildings WITHOUT the frames the game no
longer draws, to pay for the new bakery43 page (texture budget: full-v4 GL total <= 455 MiB with ~2 MiB headroom).

No Blender, no re-render: every kept frame is cut out of the current props_buildings.png exactly as packed (trimmed
rect + spriteSourceSize, pixels untouched) and placed again with a skyline packer on the fine widths; the frame names,
their trim offsets and source sizes stay the same, so every sprite def in assets/props/manifest.json stays valid.

Dropped frames (and their sprite defs in assets/props/manifest.json):
    station_bakery + station_bakery_work_0..3   the old open-air oven (the bakery is the bakery43 cottage now)
    market_counter                              the old awning stall (market_s1..3 replaced it; world.js spriteOld)
    trade_post                                  merged into the shop's 자재 창구 (v4.3 step A)
    upgrade_bench                               the bench is workshop43 now (world.js spriteOld)
    fish_net                                    the net is the fishing deck now (deck43)

    python3 tools/blender/prop_repack.py            repack in place (refuses if a dropped frame is already gone and
                                                    nothing else changes: running twice is a no-op)
    python3 tools/blender/prop_repack.py --check    print what would happen, write nothing
    python3 tools/blender/prop_repack.py --out DIR  write props_buildings.{png,json} + manifest.json to DIR instead

prop_pack.py (a full re-render + pack) leaves these keys out too (prop_pack.DROPPED), so the savings survive a rebuild.

(v4.3 step B, TX-a: docs/redesign_v43/stepB/build_plan.md §3.6, map_tx.md T-3a / T-3b) two more steps, same rules (no
re-render, every frame cut out exactly as packed, names / trims / source sizes unchanged, a pixel check before writing,
running again is a no-op):
  T-3b  mine_entrance, boat_small and campfire move from props_buildings to props_decor: they also stand outside the
        core district (the se mine, the east and west boats, the east / se / south / west campfires), so the core area
        (src/core/Residency.js) may take props_buildings out of memory without blanking them. Both pages are packed
        again; the three sprite defs name props_decor.
  T-3a  bld_buildings (warehouse, toolsmith, cannery, store: 1776x1584, 10.7 MiB) is split by district into
        bld_work (warehouse + toolsmith, the d_wh / d_tool work strip) and bld_east (cannery + store + the store's front
        overlay, d_cannery / d_store); each is a Residency area of its own. The palette PNG stays a palette PNG (the
        same palette and transparency: pixels exact). bld_buildings.{png,json} and its manifest entry go.
  After a full bld_pack.py / prop_pack.py rebuild (which packs by the old atlas names) run this script again.

    python3 tools/blender/prop_repack.py --only bakery|move|split   one step (default: all three, in that order)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
PROPS = os.path.join(GAME, 'assets', 'props')
ATLAS = 'props_buildings'
DROP_SPRITES = ['station_bakery', 'market_counter', 'trade_post', 'upgrade_bench', 'fish_net']
DROP_FRAMES = set(DROP_SPRITES) | {'station_bakery_work_%d' % i for i in range(4)}
PAD = 2
WIDTHS = tuple(range(1024, 2049, 32))
BUILDINGS = os.path.join(GAME, 'assets', 'buildings')
# (T-3b) frames of props_buildings that are drawn outside the core district too -> props_decor (a boot page no area manages)
MOVE43 = ['mine_entrance', 'boat_small', 'campfire']
DECOR = 'props_decor'
# (T-3a) bld_buildings split by district: page -> the sprite defs whose frames (+ anim frames) it holds
SPLIT_SRC = 'bld_buildings'
SPLIT43 = {'bld_work': ['warehouse', 'station_toolsmith'], 'bld_east': ['station_cannery', 'shop_general', 'shop_general_front']}
MAX_SIDE = 2048


def skyline(sizes, widths=WIDTHS, orders=None):
    """sizes [(w, h)] -> (W, H, [(x, y)]) with the smallest W*H over the candidate widths (pack_pages.pack's rule:
    tallest first, lowest spot, leftmost on ties). ((v4.3 step B) `orders`: more placing orders to try)"""
    orders = orders or [sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))]
    maxw = max(w for w, _ in sizes)
    best = None
    for W, order in ((W, o) for W in widths for o in orders):
        if W < maxw:
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
        if H > MAX_SIDE:       # ((v4.3 step B) no page taller than bld_pack's MAX_SHEET: one column of 10 frames was 4064 px)
            continue
        if best is None or W * H < best[0]:
            best = (W * H, W, H, pos)
    return best[1], best[2], best[3]


def bakery_step(check, out):
    js = json.load(open(os.path.join(PROPS, ATLAS + '.json'), encoding='utf-8'))
    sheet = Image.open(os.path.join(PROPS, ATLAS + '.png')).convert('RGBA')
    man = json.load(open(os.path.join(PROPS, 'manifest.json'), encoding='utf-8'))
    frames = js['frames']
    keep = [n for n in frames if n not in DROP_FRAMES]
    gone = [n for n in frames if n in DROP_FRAMES]
    old_mib = sheet.width * sheet.height * 4 / 1048576.0
    print('%s: %dx%d (%.2f MiB GPU), %d frames; dropping %d: %s' % (ATLAS, sheet.width, sheet.height, old_mib,
                                                                  len(frames), len(gone), ', '.join(sorted(gone))))
    still = [k for k in DROP_SPRITES if k in man.get('sprites', {})]
    if not gone and not still:
        print('nothing to do (already repacked)')
        return
    for n in keep:
        if frames[n].get('rotated'):
            raise SystemExit('prop_repack: ABORT - rotated frame %s' % n)
    # every kept sprite def must only name kept frames
    for k, s in man.get('sprites', {}).items():
        if s.get('atlas') != ATLAS or k in DROP_SPRITES:
            continue
        need = [s.get('frame')] + [f for a in (s.get('anims') or {}).values() for f in a.get('frames', [])]
        miss = [f for f in need if f and f not in keep]
        if miss:
            raise SystemExit('prop_repack: ABORT - sprite %s needs dropped frames %s' % (k, miss))
    sizes = [(frames[n]['frame']['w'], frames[n]['frame']['h']) for n in keep]
    W, H, pos = skyline(sizes)
    new_mib = W * H * 4 / 1048576.0
    used = sum(w * h for w, h in sizes) * 4 / 1048576.0
    print('repacked: %dx%d (%.2f MiB GPU, frames %.2f MiB = %.0f %% full), saves %.2f MiB' % (
        W, H, new_mib, used, 100.0 * used / new_mib, old_mib - new_mib))
    if check:
        return
    page = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    nf = {}
    for n, (x, y) in zip(keep, pos):
        f = frames[n]
        r = f['frame']
        page.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (x, y))
        e = dict(f)
        e['frame'] = {'x': x, 'y': y, 'w': r['w'], 'h': r['h']}
        nf[n] = e
    nj = dict(js)
    nj['frames'] = {n: nf[n] for n in sorted(nf)}
    meta = dict(js.get('meta', {}))
    meta['size'] = {'w': W, 'h': H}
    meta['repack'] = 'tools/blender/prop_repack.py (v4.3 bakery split): dropped ' + ', '.join(sorted(DROP_FRAMES))
    nj['meta'] = meta
    # the pixels must survive exactly
    for n in keep:
        a, b = frames[n]['frame'], nf[n]['frame']
        if not np.array_equal(np.asarray(sheet.crop((a['x'], a['y'], a['x'] + a['w'], a['y'] + a['h']))),
                              np.asarray(page.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])))):
            raise SystemExit('prop_repack: ABORT - frame %s changed while repacking' % n)
    os.makedirs(out, exist_ok=True)
    page.save(os.path.join(out, ATLAS + '.png'), optimize=True)
    with open(os.path.join(out, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(nj, f, indent=1)
        f.write('\n')
    sprites = {k: v for k, v in man['sprites'].items() if k not in DROP_SPRITES}
    man['sprites'] = sprites
    note = ('(v4.3 bakery split) props_buildings repacked by tools/blender/prop_repack.py without station_bakery (+ its '
            '4 work frames), market_counter, trade_post, upgrade_bench and fish_net (no longer drawn: the bakery43 '
            'cottage, the market stalls, the 자재 창구, workshop43 and the fishing deck replaced them).')
    gen = man.get('generator', '')
    if 'prop_repack' not in gen:
        man['generator'] = (gen + ' + ' if gen else '') + 'tools/blender/prop_repack.py'
    conv = man.get('conventions')
    if isinstance(conv, dict):
        conv['repack43'] = note
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('wrote %s (%d frames) and the manifest (%d sprite defs removed)' % (
        os.path.join(out, ATLAS + '.png'), len(keep), len(still)))


# --------------------------------------------------------------------------- (v4.3 step B, TX-a) T-3b / T-3a

def search_pack(sizes):
    """(W, H, pos) for a few big frames of nearly one size (the split building pages): the skyline over every width that
    is a sum of one to three frame widths (column layouts: 5 + 5 work frames in two columns fill 97 %) and the fine
    widths, with the usual tallest-first order, widest-first, largest-first and 200 fixed-seed shuffles"""
    import itertools
    import random
    n = len(sizes)
    ws = sorted({w for w, _ in sizes})
    cols = set(range(256, MAX_SIDE + 1, 32))
    for k in (1, 2, 3):
        for c in itertools.combinations_with_replacement(ws, k):
            W = sum(c) + PAD * (k - 1)
            if W <= MAX_SIDE:
                cols.add(W)
                cols.add(W + PAD)
    orders = [sorted(range(n), key=lambda i: (-sizes[i][1], -sizes[i][0])),
              sorted(range(n), key=lambda i: (-sizes[i][0], -sizes[i][1])),
              sorted(range(n), key=lambda i: -(sizes[i][0] * sizes[i][1]))]
    rnd = random.Random(43)
    for _ in range(200):
        o = list(range(n))
        rnd.shuffle(o)
        orders.append(o)
    return skyline(sizes, sorted(cols), orders)


def sprite_frames(s):
    """the frame names a sprite def draws (its frame + every anim frame)"""
    return [f for f in [s.get('frame')] + [x for a in (s.get('anims') or {}).values() for x in a.get('frames', [])] if f]


def put_frames(sheet, frames, names, widths, mode='RGBA'):
    """(page image, {name: entry}) with `names` cut from `sheet` (exact pixels) and packed again (`widths` None: search_pack)"""
    sizes = [(frames[n]['frame']['w'], frames[n]['frame']['h']) for n in names]
    W, H, pos = search_pack(sizes) if widths is None else skyline(sizes, widths)
    if mode == 'P':
        page = Image.new('P', (W, H), 0)
        page.putpalette(sheet.getpalette())
        if 'transparency' in sheet.info:
            page.info['transparency'] = sheet.info['transparency']
    else:
        page = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    nf = {}
    for n, (x, y) in zip(names, pos):
        f = frames[n]
        if f.get('rotated'):
            raise SystemExit('prop_repack: ABORT - rotated frame %s' % n)
        r = f['frame']
        page.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (x, y))
        e = dict(f)
        e['frame'] = {'x': x, 'y': y, 'w': r['w'], 'h': r['h']}
        nf[n] = e
    return page, nf


def same_pixels(src_sheets, page, nf):
    """every frame of `nf` on `page` equals its rect in the sheet it came from ({name: (sheet, frame entry)})"""
    for n, e in nf.items():
        sh, f = src_sheets[n]
        a, b = f['frame'], e['frame']
        if not np.array_equal(np.asarray(sh.crop((a['x'], a['y'], a['x'] + a['w'], a['y'] + a['h']))),
                              np.asarray(page.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])))):
            raise SystemExit('prop_repack: ABORT - frame %s changed while repacking' % n)


def write_page(out, key, page, js_meta, nf, note):
    os.makedirs(out, exist_ok=True)
    meta = dict(js_meta)
    meta['image'] = key + '.png'
    meta['size'] = {'w': page.width, 'h': page.height}
    meta['repack43b'] = note
    if page.mode == 'P':
        page.save(os.path.join(out, key + '.png'), optimize=True, transparency=page.info.get('transparency'))
    else:
        page.save(os.path.join(out, key + '.png'), optimize=True)
    with open(os.path.join(out, key + '.json'), 'w', encoding='utf-8') as f:
        json.dump({'frames': {n: nf[n] for n in sorted(nf)}, 'meta': meta}, f, indent=1)
        f.write('\n')


def mib(im):
    return im.width * im.height * 4 / 1048576.0


def move_step(check, out):
    """T-3b: MOVE43 frames props_buildings -> props_decor (both pages packed again)"""
    man = json.load(open(os.path.join(PROPS, 'manifest.json'), encoding='utf-8'))
    jb = json.load(open(os.path.join(PROPS, ATLAS + '.json'), encoding='utf-8'))
    jd = json.load(open(os.path.join(PROPS, DECOR + '.json'), encoding='utf-8'))
    fb, fd = jb['frames'], jd['frames']
    todo = [n for n in MOVE43 if n in fb]
    defs = [k for k in MOVE43 if man['sprites'].get(k, {}).get('atlas') != DECOR]
    if not todo and not defs:
        print('T-3b: nothing to do (%s already on %s)' % (', '.join(MOVE43), DECOR))
        return
    if defs and todo != MOVE43:
        raise SystemExit('prop_repack: ABORT - T-3b half done (frames on %s: %s; defs not on %s: %s)' % (ATLAS, todo, DECOR, defs))
    clash = [n for n in todo if n in fd]
    if clash:
        raise SystemExit('prop_repack: ABORT - %s already has %s' % (DECOR, clash))
    # no other sprite def may draw a moved frame from props_buildings (anims included)
    for k, sd in man['sprites'].items():
        if sd.get('atlas') == ATLAS and k not in MOVE43 and any(f in todo for f in sprite_frames(sd)):
            raise SystemExit('prop_repack: ABORT - sprite %s draws a moved frame' % k)
    for k in MOVE43:
        extra = [f for f in sprite_frames(man['sprites'][k]) if f != k]
        if extra:
            raise SystemExit('prop_repack: ABORT - %s has anim frames %s (move them too)' % (k, extra))
    sb = Image.open(os.path.join(PROPS, ATLAS + '.png')).convert('RGBA')
    sd_ = Image.open(os.path.join(PROPS, DECOR + '.png')).convert('RGBA')
    keep_b = sorted(n for n in fb if n not in todo)
    nb_page, nb = put_frames(sb, fb, keep_b, WIDTHS)
    frames_d = dict(fd)
    frames_d.update({n: fb[n] for n in todo})
    src_d = {n: (sd_, fd[n]) for n in fd}
    src_d.update({n: (sb, fb[n]) for n in todo})
    # (the moved frames come from the other sheet: cut them into one RGBA staging sheet first)
    names_d = sorted(frames_d)
    sizes = [(frames_d[n]['frame']['w'], frames_d[n]['frame']['h']) for n in names_d]
    W, H, pos = skyline(sizes, WIDTHS)
    nd_page = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    nd = {}
    for n, (x, y) in zip(names_d, pos):
        sh, f = src_d[n]
        r = f['frame']
        nd_page.paste(sh.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (x, y))
        e = dict(f)
        e['frame'] = {'x': x, 'y': y, 'w': r['w'], 'h': r['h']}
        nd[n] = e
    print('T-3b %s: %dx%d (%.2f MiB) -> %dx%d (%.2f MiB) without %s' % (ATLAS, sb.width, sb.height, mib(sb), nb_page.width,
                                                                     nb_page.height, mib(nb_page), ', '.join(todo)))
    print('T-3b %s: %dx%d (%.2f MiB) -> %dx%d (%.2f MiB) with them' % (DECOR, sd_.width, sd_.height, mib(sd_), nd_page.width,
                                                                    nd_page.height, mib(nd_page)))
    if check:
        return
    same_pixels({n: (sb, fb[n]) for n in keep_b}, nb_page, nb)
    same_pixels(src_d, nd_page, nd)
    note = 'tools/blender/prop_repack.py (v4.3 step B T-3b): ' + ', '.join(todo) + ' moved props_buildings -> props_decor'
    write_page(out, ATLAS, nb_page, jb.get('meta', {}), nb, note)
    write_page(out, DECOR, nd_page, jd.get('meta', {}), nd, note)
    for k in MOVE43:
        man['sprites'][k]['atlas'] = DECOR
    conv = man.get('conventions')
    if isinstance(conv, dict):
        conv['repack43b'] = ('(v4.3 step B, TX-a T-3b) mine_entrance, boat_small and campfire live on props_decor (they stand '
                             'outside the core district too); props_buildings holds only core-district pictures, so the '
                             'core texture area may let it go (src/core/Residency.js).')
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('T-3b: wrote %s, %s and the props manifest' % (ATLAS, DECOR))


def split_step(check, out):
    """T-3a: bld_buildings -> bld_work + bld_east (palette kept, pixels exact)"""
    man = json.load(open(os.path.join(BUILDINGS, 'manifest.json'), encoding='utf-8'))
    keys = [a['key'] for a in man.get('atlases', [])]
    if SPLIT_SRC not in keys:
        if all(k in keys for k in SPLIT43):
            print('T-3a: nothing to do (%s already split into %s)' % (SPLIT_SRC, ', '.join(SPLIT43)))
            return
        raise SystemExit('prop_repack: ABORT - neither %s nor %s in the buildings manifest' % (SPLIT_SRC, list(SPLIT43)))
    js = json.load(open(os.path.join(BUILDINGS, SPLIT_SRC + '.json'), encoding='utf-8'))
    frames = js['frames']
    sheet = Image.open(os.path.join(BUILDINGS, SPLIT_SRC + '.png'))
    mode = 'P' if sheet.mode == 'P' else 'RGBA'
    if mode == 'RGBA':
        sheet = sheet.convert('RGBA')
    owner = {}
    for page, sprites in SPLIT43.items():
        for k in sprites:
            sd = man['sprites'].get(k)
            if not sd or sd.get('atlas') != SPLIT_SRC:
                raise SystemExit('prop_repack: ABORT - sprite %s is not on %s' % (k, SPLIT_SRC))
            for f in sprite_frames(sd):
                if owner.get(f, page) != page:
                    raise SystemExit('prop_repack: ABORT - frame %s on two pages' % f)
                owner[f] = page
    other = [k for k, sd in man['sprites'].items() if sd.get('atlas') == SPLIT_SRC and not any(k in v for v in SPLIT43.values())]
    if other:
        raise SystemExit('prop_repack: ABORT - sprites on %s with no page: %s' % (SPLIT_SRC, other))
    lost = [n for n in frames if n not in owner]
    miss = [n for n in owner if n not in frames]
    if lost or miss:
        raise SystemExit('prop_repack: ABORT - frames with no page %s / named but not packed %s' % (lost, miss))
    pages = {}
    for page in SPLIT43:
        names = sorted(n for n in frames if owner[n] == page)
        im, nf = put_frames(sheet, frames, names, None, mode)
        pages[page] = (im, nf)
        print('T-3a %s: %d frames, %dx%d (%.2f MiB)' % (page, len(names), im.width, im.height, mib(im)))
    print('T-3a %s: %dx%d (%.2f MiB) -> %s' % (SPLIT_SRC, sheet.width, sheet.height, mib(sheet),
                                             ' + '.join('%.2f' % mib(p[0]) for p in pages.values())))
    if check:
        return
    for page, (im, nf) in pages.items():
        same_pixels({n: (sheet, frames[n]) for n in nf}, im, nf)
    note = 'tools/blender/prop_repack.py (v4.3 step B T-3a): split of bld_buildings by district'
    for page, (im, nf) in pages.items():
        write_page(out, page, im, js.get('meta', {}), nf, note)
    i = keys.index(SPLIT_SRC)
    man['atlases'][i:i + 1] = [{'key': p, 'png': 'buildings/%s.png' % p, 'json': 'buildings/%s.json' % p} for p in SPLIT43]
    for page, sprites in SPLIT43.items():
        for k in sprites:
            man['sprites'][k]['atlas'] = page
    conv = man.get('conventions')
    if isinstance(conv, dict):
        conv['split43'] = ('(v4.3 step B, TX-a T-3a) bld_buildings is split by district: bld_work = warehouse + toolsmith '
                           '(the d_wh / d_tool work strip), bld_east = cannery + store (d_cannery / d_store). Each page is a '
                           'texture area of its own (src/core/Residency.js). tools/blender/prop_repack.py does the split; run it '
                           'again after a full bld_pack.py rebuild.')
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    if os.path.abspath(out) == os.path.abspath(BUILDINGS):
        for ext in ('.png', '.json'):
            os.remove(os.path.join(BUILDINGS, SPLIT_SRC + ext))
    print('T-3a: wrote %s and the buildings manifest; %s removed' % (', '.join(SPLIT43), SPLIT_SRC))


def main():
    args = sys.argv[1:]
    check = '--check' in args
    only = args[args.index('--only') + 1] if '--only' in args else None
    outd = args[args.index('--out') + 1] if '--out' in args else None
    if only in (None, 'bakery'):
        bakery_step(check, outd or PROPS)
    if only in (None, 'move'):
        move_step(check, outd or PROPS)
    if only in (None, 'split'):
        split_step(check, outd or BUILDINGS)


if __name__ == '__main__':
    main()
