"""
ship_pack.py - turn the raw ship renders (ship_render.py cache) into assets/ships/: one trimmed Phaser atlas per
ship (<= 2048 px, MaxRects packed) + manifest.json, plus the previews docs/previews/ships_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/ship_pack.py [--cache DIR] [--quantize auto|on|off] [--no-previews] [--allow-partial]
                                       [--out DIR] [--prev DIR]      (dry runs: write somewhere else)

Guard + merge (same contract as bld_pack / town_pack): the packer MERGES into the existing assets/ships/manifest.json
(unknown top-level fields and extra fields inside entries are kept, generated fields win) and REFUSES (exit 1,
nothing written) when a ship of the current manifest or of ship_check.REQUIRED has no complete render in the cache.
--allow-partial packs what is complete and drops the rest on purpose.  An empty manifest is never written.

Post
  * every picture gets the characters' 1 px ink outline (char_pack.ink_outline, read-only reuse);
  * layered ships: base_<dir> = ink(base).  An overlay (anim frame / cargo slot) is cut so that drawing it over the
    outlined base gives exactly ink(base + overlay): it keeps the overlay's own pixels plus every pixel where the
    outlined composite differs from the outlined base (its outline), nothing else;
  * atlases palettised with libimagequant (256 colours, dither 0.6) when the payload would pass 90 % of the budget.
"""
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'ships')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 5.0
ORDER = ['ferry', 'cargo_ship', 'trawler_big', 'tugboat', 'sailboat', 'yacht', 'seagull']
NAMES = {'ferry': ['여객선', 'passenger ferry'], 'cargo_ship': ['화물선', 'cargo ship'],
         'trawler_big': ['원양어선', 'deep-sea trawler'], 'tugboat': ['예인선', 'tugboat'],
         'sailboat': ['돛단배', 'sailboat'], 'yacht': ['요트', 'yacht'], 'seagull': ['갈매기', 'seagull']}
NEAREST = {'E': 'SE', 'W': 'SW', 'N': 'NE'}          # headings that are not rendered -> use this one
SPEED = {'ferry': 70, 'cargo_ship': 55, 'trawler_big': 65, 'tugboat': 80, 'sailboat': 60, 'yacht': 95,
         'seagull': 120}
BOB = {'ferry': [2, 3.6], 'cargo_ship': [2, 4.2], 'trawler_big': [2, 3.0]}


# --------------------------------------------------------------------------- load + post

def ink():
    import char_pack as cp
    return cp.ink_outline


def load_ship(cache, key):
    d = os.path.join(cache, key)
    mp = os.path.join(d, 'meta.json')
    if not os.path.exists(mp):
        return None
    m = json.load(open(mp))
    names = m['frames']
    if not all(os.path.exists(os.path.join(d, n + '.png')) for n in names):
        print('note: %s has missing frames - not packed' % key)
        return None
    m['dir'] = d
    return m


def cut_overlay(base_raw, ov_raw, base_ink, outline):
    """Overlay that, drawn over base_ink, reproduces ink(base_raw + ov_raw)."""
    comp = base_raw.copy()
    comp.alpha_composite(ov_raw)
    O = np.asarray(outline(comp)).astype(np.int16)
    Bk = np.asarray(base_ink).astype(np.int16)
    ova = np.asarray(ov_raw)[..., 3] > 0
    diff = np.abs(O - Bk).max(-1) > 3
    keep = ova | diff
    out = np.where(keep[..., None], O, 0).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def process(m):
    """{frame name: processed RGBA image (full frame size)}"""
    outline = ink()
    d = m['dir']
    raw = {n: Image.open(os.path.join(d, n + '.png')).convert('RGBA') for n in m['frames']}
    out = {}
    if m['mode'] != 'layered':
        for n, im in raw.items():
            out[n] = outline(im)
        return out
    bases = {}
    for dn in m['dirs']:
        b = 'base_%s' % dn
        out[b] = outline(raw[b])
        bases[dn] = (raw[b], out[b])
    for n, im in raw.items():
        if n.startswith('base_'):
            continue
        dn = n.split('_')[1] if not n.startswith('slot') else n.split('_')[1]
        br, bi = bases[dn]
        out[n] = cut_overlay(br, im, bi, outline)
    return out


# --------------------------------------------------------------------------- MaxRects packing

class MaxRects:
    def __init__(self, W, H):
        self.W, self.H = W, H
        self.free = [(0, 0, W, H)]
        self.used = []

    def insert(self, w, h):
        best = None
        for (x, y, fw, fh) in self.free:
            if w <= fw and h <= fh:
                short = min(fw - w, fh - h)
                long_ = max(fw - w, fh - h)
                score = (short, long_, y, x)
                if best is None or score < best[0]:
                    best = (score, x, y)
        if best is None:
            return None
        _, x, y = best
        self._split((x, y, w, h))
        self.used.append((x, y, w, h))
        return x, y

    def _split(self, r):
        rx, ry, rw, rh = r
        new = []
        for (x, y, w, h) in self.free:
            if rx >= x + w or rx + rw <= x or ry >= y + h or ry + rh <= y:
                new.append((x, y, w, h))
                continue
            if rx > x:
                new.append((x, y, rx - x, h))
            if rx + rw < x + w:
                new.append((rx + rw, y, x + w - rx - rw, h))
            if ry > y:
                new.append((x, y, w, ry - y))
            if ry + rh < y + h:
                new.append((x, ry + rh, w, y + h - ry - rh))
        pruned = []
        for i, a in enumerate(new):
            if a[2] <= 0 or a[3] <= 0:
                continue
            contained = False
            for j, b in enumerate(new):
                if i != j and b[0] <= a[0] and b[1] <= a[1] and a[0] + a[2] <= b[0] + b[2] and \
                        a[1] + a[3] <= b[1] + b[3] and (a != b or j < i):
                    contained = True
                    break
            if not contained:
                pruned.append(a)
        self.free = pruned


def pack_frames(frames, max_size=MAX_SHEET, padding=2):
    """frames: [(name, RGBA)] -> (sheet, atlas dict) Phaser JSON hash, trimmed, MaxRects packed (largest first).
    Tries a few bin sizes (smallest area first) so the sheet is as small as possible."""
    items = []
    for name, im in frames:
        box = pu._trim_box(im)
        crop = im.crop(box)
        items.append((name, im.size, box, crop))
    order = sorted(range(len(items)), key=lambda i: -(items[i][3].width * items[i][3].height))
    area = sum((c.width + padding) * (c.height + padding) for _, _, _, c in items)
    maxw = max(c.width for _, _, _, c in items) + padding
    maxh = max(c.height for _, _, _, c in items) + padding
    cands = []
    for W in range(256, max_size + 1, 64):
        for H in range(256, max_size + 1, 64):
            if W >= maxw and H >= maxh and W * H >= area:
                cands.append((W * H, max(W, H), W, H))
    cands.sort()
    for _, _, W, H in cands:
        mr = MaxRects(W, H)
        place = {}
        ok = True
        for i in order:
            c = items[i][3]
            p = mr.insert(c.width + padding, c.height + padding)
            if p is None:
                ok = False
                break
            place[i] = p
        if ok:
            break
    else:
        raise SystemExit('ship_pack: frames do not fit one %d px sheet' % max_size)
    used_w = max(place[i][0] + items[i][3].width for i in place)
    used_h = max(place[i][1] + items[i][3].height for i in place)
    sw, sh = min(max_size, (used_w + 3) // 4 * 4), min(max_size, (used_h + 3) // 4 * 4)
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    fr = {}
    for i, (name, (fw, fh), box, crop) in enumerate(items):
        x, y = place[i]
        sheet.paste(crop, (x, y))
        fr[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != (fw, fh),
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': fw, 'h': fh}}
    atlas = {'frames': fr, 'meta': {'app': 'frost-village/tools/blender/ship_pack.py', 'version': '1.0', 'image': '',
                                    'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    return sheet, atlas


def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


# --------------------------------------------------------------------------- manifest

def head_top(img, anchor):
    a = np.asarray(img)[..., 3] > 60
    rows = np.nonzero(a.any(1))[0]
    return int(rows[0] - anchor[1]) if len(rows) else 0


def ship_entry(key, m, imgs):
    W, H = m['frameSize']
    ax, ay = m['anchorPx']
    P = m['points']
    anims = {}
    for a, v in m['anims'].items():
        e = {'frames': v['frames'], 'fps': v['fps'], 'repeat': v.get('repeat', -1)}
        if v.get('dirs'):
            e['dirs'] = v['dirs']
        if v.get('with'):
            e['with'] = v['with']
        if v.get('impactFrame') is not None:
            e['impactFrame'] = v['impactFrame']
        anims[a] = e
    layered = m['mode'] == 'layered'
    first = 'base_%s' if layered else '%s_%%s_0' % list(m['anims'])[0]
    ht = min(head_top(imgs[first % d], (ax, ay)) for d in m['dirs'])
    e = {'atlas': 'ship_' + key, 'kind': m['kind'], 'name': NAMES.get(key, [key, key]),
         'frameSize': [W, H], 'anchor': m['anchor'], 'dirs': m['dirs'], 'mirror': m['mirror'],
         'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'shadow': None, 'headTop': ht}
    if m['kind'] == 'ship':
        e['nearest'] = NEAREST
        e['lengthM'] = m['lengthM']
        e['beamM'] = m['beamM']
        e['speedPx'] = SPEED.get(key)
    if layered:
        e['layered'] = True
        e['base'] = 'base_{dir}'
        e['bob'] = {'px': BOB.get(key, [2, 3.5])[0], 'periodS': BOB.get(key, [2, 3.5])[1]}
        e['layerOrder'] = ['base', 'deck people / cargo', 'foam', 'anim']
    rename = {'stern': 'wakePoint', 'bow': 'bowPoint', 'smoke': 'smokePoint', 'gangway': 'gangwayPoint',
              'gangwayDeck': 'gangwayDeckPoint', 'horn': 'hornPoint', 'deck': 'deckPoints', 'cargo': 'cargoPoints',
              'perch': 'perchPoints', 'lights': 'lightPoints', 'crane': 'hookPoint', 'net': 'netPoint',
              'crew': 'crewPoints', 'tow': 'towPoint', 'slotPoints': None, 'slotOrder': None}
    for k, v in P.items():
        nk = rename.get(k, k + 'Point')
        if nk is None:
            continue
        e[nk] = v
    if m.get('slots'):
        e['cargoSlots'] = {'count': m['slots'], 'frame': 'slot{k}_{dir}', 'order': P.get('slotOrder'),
                           'points': P.get('slotPoints')}
    for k, v in (m.get('extra') or {}).items():
        e[k] = v
    if m.get('notes'):
        e['notes'] = m['notes']
    return e


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = waterline centre of the hull '
              '(seagull: the feet).',
    'dirs': 'ships render S (bow toward the camera, arriving), SE (world +X, screen down-right) and NE (world +Y, '
            'screen up-right); mirror SW <- SE and NW <- NE with flipX (negate dx of every point). E / W / N are not '
            'rendered: use `nearest` (ships sail along the two iso axes like the vehicles; S is the arrival '
            'heading). The seagull has the 5 character dirs S SE E NE N + mirrors.',
    'frames': 'Phaser JSON-hash atlas per ship (ship_<key>), trimmed; frame names {anim}_{dir}_{i} like the '
              'characters. Assets.buildCharacter() turns them into <key>:<anim>:<dir> animations as for the boats.',
    'layered': 'big ships (ferry, cargo_ship, trawler_big): draw image base_<dir> (the whole ship at rest), then '
               'the deck people / cargo slot sprites, then foam_<dir>_i while moving, then the current anim '
               '(idle / move / haul) on top - all at the same position, origin = anchor, same flipX. The anim '
               'frames hold ONLY the moving parts (funnel smoke, haul gear), already occluded by the ship. Put all '
               'layers in one container and bob it: y += bob.px * sin(2 pi t / bob.periodS).',
    'small boats': 'tugboat, sailboat, yacht: complete frames (bobbing, sails and crew baked in) like '
                   'boat_rowboat / boat_fishing.',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the anchor per rendered dir (mirrored dirs negate '
              'dx). wakePoint = stern at the waterline (fx_wake / fx_wake_ring), bowPoint = stem at the waterline, '
              'smokePoint = funnel top (extra fx_smoke_puff if wanted), hornPoint = whistle (sfx_ship_horn_big), '
              'perchPoints = mast / funnel / crane tops where a seagull may sit (idle anim), lightPoints = lamps for '
              'night glows.',
    'deckPoints': 'ferry: spots on the open decks where a townsperson (feet) can stand fully visible (ray-tested '
                  'against the ship for this dir, far -> near order); draw passengers right after base_<dir>, '
                  'sorted by dy.',
    'gangwayPoint': 'ferry: the gap in the bulwark on the camera side (local -X) at main-deck level where the '
                    'gangway from the pier / ferry_terminal meets the ship; gangwayDeckPoint = first step on deck.',
    'cargo': 'cargo_ship: cargoSlots.count container-stack sprites slot<k>_<dir> (pre-occluded by the ship, '
             'same frame size + anchor) - draw the loaded ones after base_<dir> in cargoSlots.order[dir] '
             '(far -> near) and hide them when unloaded. cargoPoints[dir][k] = [dx, dy, visible] = the same spots on '
             'the hatch covers for the game\'s own item / crate stacks (visible = fraction of a 0.9 m stack the '
             'camera sees).',
    'haul': 'trawler_big: haul = the full net bag coming up over the stern (A-frame, drum turning, crew pulling, '
            'water dripping), loop; rendered only in the dirs listed in anims.haul.dirs - turn the trawler to one '
            'of them (or its mirror) before hauling. netPoint = the bag (fish splash / sfx).',
    'seagull': 'kind "bird": fly 6f (5 dirs), glide 2f, land 4f (once), idle 4f standing (on a post / bollard / '
               'mast top). All frames share one anchor at the feet; for a flying gull put the anchor at '
               '(ground x, ground y - altitude) and draw a small soft shadow at the ground point.',
    'shadow': 'no baked shadow, 1 px ink outline like the characters.',
}


def build_manifest(ships, imgs_by_ship, atlas_keys, old):
    chars = {}
    for k in ORDER:
        if k in ships:
            chars[k] = ship_entry(k, ships[k], imgs_by_ship[k])
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/ship_render.py + ship_pack.py (docs/CONTRACT_V6.md section S)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'ships/%s.png' % a, 'json': 'ships/%s.json' % a} for a in atlas_keys]
    oldch = (old or {}).get('characters', {})
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    man.setdefault('sprites', {})
    return man


# --------------------------------------------------------------------------- guard

def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('ship_pack: 중단 - 렌더 캐시 %s 에 완성된 배가 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'ship_pack: ABORT - no complete renders in the cache %s; nothing was written (an empty '
                         'manifest is never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = '    ' + ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('ship_pack: WARNING --allow-partial: %d ship(s) not complete in the cache will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다:\n%s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'ship_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없거나 덜 렌더됐습니다.\n'
        '  이대로 포장하면 그 배들이 아틀라스와 매니페스트에서 사라집니다. 아무 파일도 바꾸지 않았습니다.\n'
        'ship_pack: ABORT - %d ship(s) of the current manifest (or ship_check.REQUIRED) are missing / incomplete in '
        'the render cache %s;\n  packing now would DELETE them. Nothing was written.\n%s\n'
        '  (* = only in ship_check.REQUIRED)\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/ship_render.py -- <keys> first, or pass --cache <full '
        'cache>;\n  to drop them on purpose re-run with --allow-partial / 일부러 빼려면 --allow-partial'
        % (len(missing), cache, len(missing), cache, listing))


# --------------------------------------------------------------------------- main

def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'ships')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = 'auto'
    if '--quantize' in args:
        mode = args[args.index('--quantize') + 1]
    if not os.path.isdir(cache):
        sys.exit('ship_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run ship_render.py first or pass --cache DIR.' % cache)
    ships = {}
    for k in ORDER:
        m = load_ship(cache, k)
        if m:
            ships[k] = m
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from ship_check import REQUIRED
    except ImportError:
        REQUIRED = []
    in_man = set((old or {}).get('characters', {}))
    need = set(REQUIRED) | in_man
    dropped = guard(cache, set(ships), need, in_man, '--allow-partial' in args)
    imgs, sheets = {}, []
    for k in ORDER:
        if k not in ships:
            continue
        imgs[k] = process(ships[k])
        sheet, atlas = pack_frames(list(imgs[k].items()))
        sheets.append(('ship_' + k, sheet, atlas))
        print('%-18s %4dx%-4d %3d frames' % ('ship_' + k, sheet.width, sheet.height, len(atlas['frames'])), flush=True)
    os.makedirs(OUT, exist_ok=True)
    total = 0
    sizes = {}
    rgba_total = 0
    for akey, sheet, atlas in sheets:
        pu.save_atlas(sheet, atlas, os.path.join(OUT, akey + '.png.tmp'), os.path.join(OUT, akey + '.json.tmp'))
        rgba_total += os.path.getsize(os.path.join(OUT, akey + '.png.tmp'))
    do_q = mode == 'on' or (mode == 'auto' and rgba_total / 1048576.0 > BUDGET_MB * 0.9)
    for fn in os.listdir(OUT):
        if fn.startswith('ship_') and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(OUT, fn))
    for akey, sheet, atlas in sheets:
        png = os.path.join(OUT, akey + '.png')
        os.replace(os.path.join(OUT, akey + '.json.tmp'), os.path.join(OUT, akey + '.json'))
        if do_q:
            os.remove(os.path.join(OUT, akey + '.png.tmp'))
            atlas['meta']['image'] = akey + '.png'
            quantize(sheet).save(png, optimize=True)
        else:
            os.replace(os.path.join(OUT, akey + '.png.tmp'), png)
        with open(os.path.join(OUT, akey + '.json'), 'w', encoding='utf-8') as f:
            atlas['meta']['image'] = akey + '.png'
            json.dump(atlas, f, separators=(',', ':'))
        sizes[akey] = os.path.getsize(png)
        total += sizes[akey] + os.path.getsize(os.path.join(OUT, akey + '.json'))
        print('  %-18s %7.1f KB%s' % (akey, sizes[akey] / 1024.0, ' (256 colours)' if do_q else ''))
    man = build_manifest(ships, imgs, [s[0] for s in sheets], old)
    if dropped:
        for k in dropped:
            man['characters'].pop(k, None)
    if not man['characters']:
        sys.exit('ship_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('ships: %d  payload %.2f MB' % (len(man['characters']), total / 1048576.0))
    if '--no-previews' not in args:
        import ship_preview as SP
        os.makedirs(PREV, exist_ok=True)
        SP.all_previews(ships, imgs, PREV)


if __name__ == '__main__':
    main()
