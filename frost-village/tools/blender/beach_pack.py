"""
beach_pack.py - turn the raw Sunny Beach renders (beach_render.py cache) into assets/beach/: trimmed Phaser atlases
(every sheet <= 2048 px) + manifest.json, and the previews docs/previews/beach_* (beach_preview.py).

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/beach_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
    python3 tools/blender/beach_pack.py --previews-only        (refresh docs/previews/beach_* only; assets untouched)
                                        [--out DIR] [--prev DIR]          (dry runs: write somewhere else)

Guard + merge (as harbor_pack / ship_pack): the packer MERGES into the existing assets/beach/manifest.json.
  * It owns every sprite / character / atlas it generates; the ground keys written by tools/fx/gen_beach_ground.py
    (generator "gen_beach_ground": ground textures, transition kit, decals, atlas beach_ground_decals, sandKit) and
    any unknown top-level fields are kept untouched.
  * It REFUSES (exit 1, nothing written) when a key it owns in the current manifest or in beach_check.REQUIRED has
    no complete render in the cache (packing now would drop it).  --allow-partial packs what is cached on purpose.
    An empty manifest is never written.

Steps
  1. props (<build>.json sidecars + frames): pack_utils.clean_alpha + prop_pack.tint_shadow (the village's cool
     shadow, lighter on the water plane) + prop_pack.border_fade; seamless tiles get harbor_pack.tile_cut instead;
     the lifeguard tower's occluder overlay = base frame x the render-time mask.
  2. characters-style atlases (<key>/meta.json: boats, crab): char_pack.ink_outline; seated-rider overlay frames
     over_<anim>_<dir>_<i> = outlined frame x (proxy-alone mask - proxy-behind-boat mask), like assets/vehicles.
  3. atlases beach_shade, beach_play, beach_service, beach_nature, beach_water, beach_tiles (split _2 .. at 2048) +
     one atlas beach_<key> per character, palettised with libimagequant (256 colours, dither 0.6) by default.
  4. manifest: sprites{} + characters{} + conventions (+ the ground generator's entries kept).
"""
import json
import math
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
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, font, shelf_preview)
import harbor_pack as hp  # noqa: E402  (read-only reuse: tile_cut, pack_groups, quantize, _gif, kfont)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'beach')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 6.0
GEN_GROUND = 'gen_beach_ground'
GENERATOR = 'tools/blender/beach_render.py + beach_pack.py (docs/CONTRACT_V7.md section W)'
ATLAS_ORDER = ['beach_shade', 'beach_play', 'beach_service', 'beach_nature', 'beach_water', 'beach_tiles']
KX, KY = 45.2548, 22.6274
NEAREST = {'E': 'SE', 'W': 'SW', 'N': 'NE'}
ALIASES = {'boardwalk_end': 'boardwalk_end_yn', 'sandcastle_build': 'sandcastle_build_0'}
SPEED = {'swan_pedal_boat': 30, 'kayak': 40, 'kayak_crew': 40, 'banana_boat': 90, 'banana_boat_crew': 90,
         'crab': 26}
CHAR_NAMES = {'swan_pedal_boat': ['오리배 (백조 페달보트)', 'Swan pedal boat'], 'kayak': ['카약', 'Kayak'],
              'kayak_crew': ['카약 (노 젓는 사람)', 'Kayak with paddler'], 'banana_boat': ['바나나보트', 'Banana boat'],
              'banana_boat_crew': ['바나나보트 (탑승객)', 'Banana boat with riders'], 'crab': ['꽃게', 'Crab']}
POINT_SINGLE = {'door': 'doorPoint', 'ladder': 'ladderPoint', 'look': 'lookPoint'}
POINT_LIST = {'staff': 'staffPoints', 'customer': 'customerPoints', 'seat': 'seatPoints', 'lie': 'lyingPoints',
              'work': 'workPoints', 'play': 'playPoints', 'stand': 'standPoints', 'liehead': 'lyingHeadPoints',
              'liefeet': 'lyingFeetPoints'}
DIR_LIST = {'staff': 'staffDirs', 'customer': 'customerDirs', 'seat': 'seatDirs', 'lie': 'lyingDirs',
            'work': 'workDirs', 'play': 'playDirs', 'stand': 'standDirs', 'door': 'doorDir'}
INTERNAL = {'build', 'kind', 'atlas', 'frameSize', 'anchorPx', 'anchor', 'frames', 'shadow', 'notes', 'yaw', 'topPx',
            'framePoints', 'frameDirs', 'sprites', 'ground', 'frameWorldPoints', 'anims', 'animAlias', 'footprint',
            'footprintM', 'front', 'fxPoints', 'points', 'overlay', 'thicknessM'}


# --------------------------------------------------------------------------- props: load + post

def water_shadow(im, k=0.6):
    """Lighten pure-shadow pixels of a water-plane prop (its baked shadow lies on the sea, which is darker)."""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    lum = a[..., :3].mean(-1)
    semi = a[..., 3] < 252
    w = np.clip(1.0 - lum / 70.0, 0.0, 1.0) * semi
    a[..., 3] = np.where(semi & (w > 0.5), a[..., 3] * k, a[..., 3])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def post(im, m):
    if not m.get('shadow'):
        return pu.clean_alpha(im, floor=3)
    im = pu.clean_alpha(im, floor=10)
    if m.get('ground') == 'water':
        im = water_shadow(im)
    im = pp.tint_shadow(im)
    if m.get('cuts') is not None and m.get('tileAxis'):
        return hp.tile_cut(im, m['anchorPx'], m['cuts'], m['rampM'])
    return pp.border_fade(im)


def load_props(cache):
    builds = {}
    for fn in sorted(os.listdir(cache)):
        if not fn.endswith('.json'):
            continue
        try:
            m = json.load(open(os.path.join(cache, fn)))
        except Exception:
            continue
        if 'build' not in m or 'frames' not in m:
            continue
        names = list(m['frames']) + ([m['overlay']['mask']] if m.get('overlay') else [])
        if all(os.path.exists(os.path.join(cache, n + '.png')) for n in names):
            builds[m['build']] = m
    frames = {}
    for k, m in builds.items():
        for n in m['frames']:
            frames[n] = post(Image.open(os.path.join(cache, n + '.png')).convert('RGBA'), m)
        ov = m.get('overlay')
        if ov:
            mask = np.asarray(Image.open(os.path.join(cache, ov['mask'] + '.png')).convert('RGBA')).astype(np.float32)
            mval = (mask[..., 0] / 255.0) * (mask[..., 3] / 255.0)
            a = np.asarray(frames[ov['of']]).astype(np.float32).copy()
            # keep only the object (not its baked shadow) in the overlay
            raw = np.asarray(Image.open(os.path.join(cache, ov['of'] + '.png')).convert('RGBA')).astype(np.float32)
            solid = (raw[..., 3] > 200).astype(np.float32)
            a[..., 3] *= mval * solid
            frames[ov['key']] = pu.clean_alpha(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
    return builds, frames


# --------------------------------------------------------------------------- characters: load + post

def load_chars(cache):
    import char_pack as cp      # read-only reuse of the characters' ink outline
    chars, cframes = {}, {}
    for key in sorted(os.listdir(cache)):
        mp = os.path.join(cache, key, 'meta.json')
        if not os.path.exists(mp):
            continue
        m = json.load(open(mp))
        if not m.get('complete'):
            print('note: %s is incomplete in the cache - not packed' % key)
            continue
        d = os.path.join(cache, key)
        imgs = {}
        for n in m['frames']:
            im = cp.ink_outline(Image.open(os.path.join(d, n + '.png')).convert('RGBA'))
            imgs[n] = im
            if m.get('masks'):
                pa = np.asarray(Image.open(os.path.join(d, 'pall_%s.png' % n)).convert('RGBA'))[..., 3]
                pv = np.asarray(Image.open(os.path.join(d, 'pvis_%s.png' % n)).convert('RGBA'))[..., 3]
                mask = np.clip((pa.astype(np.float32) - pv.astype(np.float32)) / 255.0, 0, 1)
                mask[mask < 0.04] = 0.0
                a = np.asarray(im).astype(np.float32)
                a[..., 3] *= mask
                a[a[..., 3] < 2] = 0
                imgs['over_' + n] = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')
        chars[key] = m
        cframes[key] = imgs
    return chars, cframes


# --------------------------------------------------------------------------- manifest entries

def footprint_poly(m):
    fm = m.get('footprintM')
    if not isinstance(fm, list) or len(fm) != 2:
        return None
    a, b = fm
    yaw = math.radians(m.get('yaw', 0.0)) if not m.get('tileAxis') else 0.0
    pts = []
    for lx, ly in ((-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)):
        x = lx * math.cos(yaw) - ly * math.sin(yaw)
        y = lx * math.sin(yaw) + ly * math.cos(yaw)
        pts.append([int(round((x + y) * KX)), int(round((x - y) * KY))])
    return pts


def sprite_entry(k, m, fr, frame_atlas):
    s = {'atlas': frame_atlas[fr], 'frame': fr, 'anchor': m['anchor'], 'kind': m['kind'], 'frameSize': m['frameSize']}
    if 'footprint' in m:
        s['footprint'] = m['footprint']
        s['footprintM'] = m['footprintM']
    poly = footprint_poly(m)
    if poly:
        s['footprintPoly'] = poly
    s['topPx'] = m['topPx'].get(fr) if isinstance(m['topPx'], dict) else m['topPx']
    if m.get('front'):
        s['front'] = m['front']
    if m.get('anims'):
        s['anims'] = {a: dict(v) for a, v in m['anims'].items()}
    if m.get('fxPoints'):
        s['fxPoints'] = {n: v for n, v in m['fxPoints'].items() if v is not None}
    for n, v in (m.get('points') or {}).items():
        s[n + 'Point' if not isinstance(v[0], list) else n + 'Points'] = v
    pts = m.get('framePoints', {}).get(fr, {})
    dirs = m.get('frameDirs', {}).get(fr, {})
    for kind, field in POINT_SINGLE.items():
        if pts.get(kind):
            s[field] = pts[kind][0]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind][0]
    for kind, field in POINT_LIST.items():
        if pts.get(kind):
            s[field] = pts[kind]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind]
    if 'lookPoint' in s and 'lookDir' not in m and dirs.get('look'):
        s['lookDir'] = dirs['look'][0]
    if 'staffPoints' in s:
        s.setdefault('staffDepth', m.get('staffDepth', 'front'))
        # the contract names a single vendor / guard spot (`staffPoint`): the first of the list
        s.setdefault('staffPoint', s['staffPoints'][0])
        if s.get('staffDirs'):
            s.setdefault('staffDir', s['staffDirs'][0])
    for f, v in m.items():
        if f not in INTERNAL and f not in s:
            s[f] = v
    if m.get('overlay'):
        s['overlay'] = m['overlay']['key']
    if m.get('notes'):
        s['notes'] = m['notes']
    return s


def sprite_entries(builds, frame_atlas):
    out = {}
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, list(builds).index(k)))
    for k in order:
        m = builds[k]
        sprites = m.get('sprites') or {k: {'frame': m['frames'][0]}}
        for sk, sd in sprites.items():
            e = sprite_entry(sk, m, sd['frame'], frame_atlas)
            for f, v in sd.items():
                if f != 'frame':
                    e[f] = v
            if len(sprites) > 1:
                e['build'] = k
            out[sk] = e
        ov = m.get('overlay')
        if ov:
            out[ov['key']] = {'atlas': frame_atlas[ov['key']], 'frame': ov['key'], 'anchor': m['anchor'],
                              'kind': 'overlay', 'of': k, 'frameSize': m['frameSize'],
                              'notes': 'Occluder overlay for %s (same frame + anchor): draw it ABOVE the guard standing '
                                       'at %s.staffPoints[0] (tower depth d, guard d + 0.5, overlay d + 1) so the front '
                                       'railing and the sign board pass in front of the guard\'s legs.' % (k, k)}
    return out


def head_top(img, anchor):
    a = np.asarray(img)[..., 3] > 60
    rows = np.nonzero(a.any(1))[0]
    return int(rows[0] - anchor[1]) if len(rows) else 0


def char_entry(key, m, imgs, atlas_key):
    W, H = m['frameSize']
    ax, ay = m['anchorPx']
    anims = {}
    for a, v in m['anims'].items():
        e = {'frames': v['frames'], 'fps': v['fps'], 'repeat': v.get('repeat', -1)}
        if v.get('dirs'):
            e['dirs'] = v['dirs']
        anims[a] = e
    first = list(m['anims'])[0]
    ht = min(head_top(imgs['%s_%s_0' % (first, d)], (ax, ay)) for d in m['dirs'])
    e = {'atlas': atlas_key, 'kind': m['kind'], 'name': CHAR_NAMES.get(key, [key, key]), 'frameSize': [W, H],
         'anchor': m['anchor'], 'dirs': m['dirs'], 'mirror': m['mirror'], 'frameName': '{anim}_{dir}_{i}',
         'anims': anims, 'headTop': ht}
    if m['kind'] == 'ship':
        e.update({'shadow': None, 'nearest': NEAREST, 'lengthM': m['lengthM'], 'beamM': m['beamM'],
                  'speedPx': SPEED.get(key), 'waterPlane': True, 'waterline': 'anchor'})
    else:
        e['shadow'] = (m.get('extra') or {}).get('shadow') or [34, 14]
        e['speedPx'] = SPEED.get(key)
    rename = {'stern': 'wakePoint', 'bow': 'bowPoint', 'tow': 'towPoint', 'head': 'headPoint'}
    for k, v in (m.get('points') or {}).items():
        e[rename.get(k, k + 'Point')] = v
    if m.get('seats'):
        e.update({'seats': m['seats'], 'seatDirs': m['seatDirs'], 'seatsStand': m['seatsStand'],
                  'seatDrawOrder': m['seatDrawOrder'], 'seatNames': m['seatNames'],
                  'overlay': {'atlas': atlas_key, 'frameName': 'over_{anim}_{dir}_{i}'}})
    for k, v in (m.get('extra') or {}).items():
        if k not in ('shadow',):
            e[k] = v
    if m.get('notes'):
        e['notes'] = m['notes']
    return e


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre ON THE SAND (z 0); '
              'water-plane props (swim_buoy_line_*, float_raft, boats) = their WATERLINE (sea surface), like '
              'assets/ships and harbor/buoy: put them on a sea point that is already on the water plane (the sea is '
              '0.55 m = waterPx 30 screen px below the land).',
    'front': '-Y = faces screen down-left (SW) = the sea side of the beach (like the harbour waterfront). _x variants '
             'are the same prop turned 90 deg (front +X = screen down-right).',
    'shadows': 'baked soft cool shadows falling screen down-right (lighter on the water for water-plane props). Do '
               'not flipX baked-shadow sprites. Characters-style atlases (boats, crab) have NO baked shadow and a 1 px '
               'ink outline like the characters.',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled, height '
              'included). *Dirs = facing of a character there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX). '
              'staffDepth "front": draw the character above the sprite; "behind": normal anchor-y sorting (the counter '
              'hides the legs). lyingPoints = hip point of a sunbather on their back (beachfolk `sunbathe`), '
              'lyingHeadPoints / lyingFeetPoints = head / feet ends, lyingDirs = screen direction hips -> head, '
              'lyingAxis = the world axis of the body. seatPoints = seat-surface front-centre (`sit` anchor, '
              'villagers / townsfolk2 convention). workPoints = kneeling diggers (beachfolk `dig`). playPoints = '
              'players. standPoints = people under the beach shower.',
    'anims': 'idle frame = resting state; named loops (flutter, sway, water, bob, bounce, bell, grill, fly) are also '
             'listed as anims.work; every frame shares frameSize + anchor (swap frames in place; Assets.js registers '
             'spr:<key>:<anim>). Water-plane bob loops of the swim-buoy line tiles must play IN SYNC (same frame index '
             'on every tile).',
    'tiles': 'boardwalk_* and swim_buoy_line_x/_y: one tile = sqrt(2) m along world X (step (+64, +32) px) or Y '
             '(step (+64, -32) px); chained tiles composite seamlessly incl. the baked shadow (partition-of-unity cuts '
             '+-rampM at the open ends). boardwalk_* are kind decal (ground layer, walk on them with no lift); '
             'boardwalk_end_* close a run; swim_buoy_line_end caps / turns a buoy line.',
    'stages': 'sandcastle_build_0..3 share one frame + anchor: swap the frame as the kids dig (stage / stages).',
    'characters': 'boats (kind "ship"): render dirs S (arriving), SE (world +X), NE (world +Y), mirror SW <- SE and '
                  'NW <- NE with flipX (negate dx); E/W/N -> `nearest`. Empty boats have seats[dir] (sit anchors), '
                  'seatsStand[dir] (idle-frame anchors for back views), seatDrawOrder and overlay frames '
                  'over_{anim}_{dir}_{i}: draw boat -> riders -> overlay. *_crew variants have riders baked in. '
                  'crab (kind "animal"): 5 dirs = MOVEMENT direction, it scuttles sideways with its face toward the '
                  'camera; draw a soft ellipse `shadow`.',
}


def build_manifest(builds, frame_atlas, prop_atlases, chars, cimgs, char_atlas, old):
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = GENERATOR + '; ground: tools/fx/gen_beach_ground.py'
    conv = dict((old or {}).get('conventions') or {})
    conv.update(CONVENTIONS)
    man['conventions'] = conv
    keep_atl = [a for a in (old or {}).get('atlases', []) if a['key'] == 'beach_ground_decals']
    man['atlases'] = keep_atl + [{'key': a, 'png': 'beach/%s.png' % a, 'json': 'beach/%s.json' % a}
                                 for a in prop_atlases + [char_atlas[k] for k in chars]]
    oldsp = (old or {}).get('sprites', {})
    ground = {k: v for k, v in oldsp.items() if v.get('generator') == GEN_GROUND}
    new = sprite_entries(builds, frame_atlas)
    sprites = dict(ground)
    for k, v in new.items():
        sprites[k] = dict({f: x for f, x in oldsp.get(k, {}).items() if f not in v}, **v)
    for a, t in ALIASES.items():
        if t in sprites:
            e = dict(sprites[t])
            e['aliasOf'] = t
            sprites[a] = e
    man['sprites'] = sprites
    oldch = (old or {}).get('characters', {})
    man['characters'] = {k: dict({f: x for f, x in oldch.get(k, {}).items()}, **char_entry(k, chars[k], cimgs[k],
                                                                                          char_atlas[k]))
                         for k in chars}
    man['waterPx'] = 30
    return man


# --------------------------------------------------------------------------- pack

def pack_props(builds, frames):
    groups = {}
    for k, m in builds.items():
        fr = [(n, frames[n]) for n in m['frames']]
        if m.get('overlay'):
            fr.append((m['overlay']['key'], frames[m['overlay']['key']]))
        groups.setdefault(m['atlas'], []).append(fr)
    return hp.pack_groups(groups)


def write_sheets(sheets, mode):
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('beach_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.startswith('beach_') and fn.endswith(('.png', '.json')) and not fn.startswith('beach_ground_decals'):
            os.remove(os.path.join(OUT, fn))
    sizes = {}
    for akey, sheet, atlas in sheets:
        png = os.path.join(OUT, akey + '.png')
        pu.save_atlas(sheet, atlas, png, os.path.join(OUT, akey + '.json'), quantize=False)
        sizes[akey] = os.path.getsize(png)
    total = sum(sizes.values())
    do_q = mode == 'on' or (mode == 'auto' and total / 1048576.0 > BUDGET_MB * 0.6)
    if do_q:
        try:
            for akey, sheet, atlas in sheets:
                png = os.path.join(OUT, akey + '.png')
                hp.quantize(sheet).save(png, optimize=True)
                sizes[akey] = os.path.getsize(png)
            print('  palettised with libimagequant (256 colours, dither 0.6)')
        except ImportError:
            print('  imagequant not installed -> kept RGBA (pip install imagequant)')
    frame_atlas = {}
    for akey, sheet, atlas in sheets:
        for n in atlas['frames']:
            frame_atlas[n] = akey
        print('%-26s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return frame_atlas


def _resolve(rel):
    """a manifest path (relative to assets/) -> the file this run wrote: beach/* lives in OUT (assets/beach, or the
    --out folder of a dry run), anything else under assets/"""
    if rel.startswith('beach/'):
        p = os.path.join(OUT, rel[len('beach/'):])
        if os.path.exists(p):
            return p
    return os.path.join(ASSETS, rel)


def payload(man):
    total = os.path.getsize(os.path.join(OUT, 'manifest.json'))
    for a in man.get('atlases', []):
        for f in (a['png'], a['json']):
            p = _resolve(f)
            if os.path.exists(p):
                total += os.path.getsize(p)
    for i in man.get('images', []):
        p = _resolve(i['png'])
        if os.path.exists(p):
            total += os.path.getsize(p)
    return total


def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('beach_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'beach_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is '
                         'never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('beach_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다: %s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'beach_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다. 아무 파일도 바꾸지 '
        '않았습니다.\nbeach_pack: ABORT - %d key(s) in the current manifest (or beach_check.REQUIRED; * = only there) are '
        'missing from the render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/beach_render.py -- <keys> first, or pass --cache <full '
        'cache>; to drop them on purpose re-run with --allow-partial' % (len(missing), cache, len(missing), cache,
                                                                         listing))


def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'beach')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = args[args.index('--quantize') + 1] if '--quantize' in args else 'on'
    if not os.path.isdir(cache):
        sys.exit('beach_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run beach_render.py first or pass --cache DIR.' % cache)
    builds, frames = load_props(cache)
    chars, cframes = load_chars(cache)
    if '--previews-only' in args:
        # refresh docs/previews only (e.g. after assets/beachfolk or assets/water changed): assets/beach untouched
        man_path = os.path.join(OUT, 'manifest.json')
        if not os.path.exists(man_path):
            sys.exit('beach_pack: --previews-only needs a packed %s' % man_path)
        import beach_preview as bp
        bp.previews(builds, frames, chars, cframes, json.load(open(man_path, encoding='utf-8')), PREV, out_dir=OUT)
        return
    have = set(chars)
    for k, m in builds.items():
        have |= set((m.get('sprites') or {k: 1}).keys())
        if m.get('overlay'):
            have.add(m['overlay']['key'])
    have |= {a for a, t in ALIASES.items() if t in have}
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from beach_check import REQUIRED, REQUIRED_CHARS
    except ImportError:
        REQUIRED, REQUIRED_CHARS = [], []
    need = set(REQUIRED) | set(REQUIRED_CHARS)
    in_man = set()
    if old:
        in_man = {k for k, v in old.get('sprites', {}).items() if v.get('generator') != GEN_GROUND}
        in_man |= set(old.get('characters', {}))
        need |= in_man
    guard(cache, have, need, in_man, '--allow-partial' in args)
    sheets = pack_props(builds, frames)
    char_atlas = {}
    for k in chars:
        fr = sorted(cframes[k].items())
        try:
            sheet, atlas = pu.pack_atlas(fr, max_width=MAX_SHEET, trim=True, padding=2)
        except ValueError as e:
            raise SystemExit('beach_pack: %s does not fit one atlas: %s' % (k, e))
        if sheet.height > MAX_SHEET:
            raise SystemExit('beach_pack: %s atlas is %dx%d (> %d)' % (k, sheet.width, sheet.height, MAX_SHEET))
        char_atlas[k] = 'beach_' + k
        sheets.append(('beach_' + k, sheet, atlas))
    frame_atlas = write_sheets(sheets, mode)
    prop_atlases = [s[0] for s in sheets if s[0] not in char_atlas.values()]
    man = build_manifest(builds, frame_atlas, prop_atlases, chars, cframes, char_atlas, old)
    if not man['sprites']:
        sys.exit('beach_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    tmp = man_path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    os.replace(tmp, man_path)
    total = payload(man)
    print('sprites: %d  characters: %d  payload %.2f MB (budget %.1f MB)' % (len(man['sprites']), len(man['characters']),
                                                                         total / 1048576.0, BUDGET_MB))
    if '--no-previews' not in args:
        import beach_preview as bp
        bp.previews(builds, frames, chars, cframes, man, PREV, out_dir=OUT)


if __name__ == '__main__':
    main()
