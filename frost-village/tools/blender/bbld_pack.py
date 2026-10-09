"""
bbld_pack.py - turn the raw beachfront renders (bbld_render.py cache) into assets/beach_bld/: trimmed Phaser atlases
(each sheet <= 2048 px) + manifest.json, plus the previews docs/previews/bbld_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/bbld_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
                                       [--out DIR] [--prev DIR]        (dry runs: write somewhere else)

Guard + merge (as harbor_pack / town_pack): MERGES into the existing assets/beach_bld/manifest.json (unknown top-level
fields and extra fields inside entries are kept, generated fields win) and REFUSES (exit 1, nothing written) when a
key of the current manifest or of bbld_check.REQUIRED has no render in the cache.  --allow-partial packs what is cached
and drops the missing keys on purpose.  An empty manifest is never written.

Derived sprites (made here from the render passes, same frame size + anchor as their building):
  <key>_front   occluder overlay = base frame x the front mask (railings / desk / counter): draw ABOVE characters
                standing behind them (building d, staff / balcony guests d + 0.5, overlay d + 1)
  <key>_glow    additive night light (windows, lamps, neon, bulbs, live tanks) with a soft bloom; blend ADD
  <key>_night   resort_hotel(_x): the whole night picture (day x NIGHT_TINT + glow) - draw it UNTINTED at night
  hotel_pool_water  the baked fallback pool water (6-frame ripple loop) cut to waterPoly
"""
import json
import math
import os
import random
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, shelf_preview, font)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'beach_bld')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 7.0
ATLAS_ORDER = ['bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street', 'bbld_glow']
KX, KY, KZ = 45.2548, 22.6274, 55.4256
NIGHT_TINT = (0.42, 0.48, 0.72)
NIGHT_HEX = '#6B7AB8'
NIGHT_FRAMES = ('resort_hotel', 'resort_hotel_x')
POINT_SINGLE = {'in': 'inPoint', 'door': 'doorPoint'}
POINT_LIST = {'staff': 'staffPoints', 'customer': 'customerPoints', 'seat': 'seatPoints', 'balcony': 'balconyPoints',
              'lie': 'lyingPoints', 'swim': 'swimPoints', 'work': 'workPoints', 'view': 'viewPoints',
              'shower': 'showerPoints', 'light': 'lightPoints'}
DIR_LIST = {'staff': 'staffDirs', 'customer': 'customerDirs', 'seat': 'seatDirs', 'balcony': 'balconyDirs',
            'lie': 'lyingDirs', 'work': 'workDirs', 'view': 'viewDirs', 'shower': 'showerDirs', 'door': 'doorDir'}
EXTRA_FIELDS = ('name', 'zone', 'variantOf', 'floors', 'staffRoles', 'balconyDepth', 'waterZ', 'waterPalette',
                'waterShore', 'lookoutDepth', 'passage')
STAFF_ROLES = {
    'resort_hotel': ['doorman', 'bellhop', 'receptionist'], 'hotel_pool': ['lifeguard'], 'pension': ['owner'],
    'beach_cafe': ['barista'], 'beach_bar': ['beach_bar_staff'], 'seafood_bbq': ['chef'],
    'icecream_shop': ['icecream_vendor'], 'souvenir_shop': ['clerk'], 'swimwear_shop': ['clerk'],
    'surf_shop': ['surfer'], 'convenience_store': ['clerk'], 'lifeguard_station': ['lifeguard', 'lifeguard'],
    'tourist_info': ['guide'], 'restroom_shower': ['housekeeper'], 'mini_aquarium': ['ticket_seller'],
    'beach_arcade': ['attendant'],
}
# staffRoles -> an existing townsfolk preset ("<fragment>:<preset>": assets/beachfolk bf_presets, assets/townfolk
# generator.presets) so the game can dress every role without new art
STAFF_PRESETS = {
    'doorman': 'beachfolk:doorman', 'bellhop': 'beachfolk:bellhop', 'receptionist': 'beachfolk:receptionist',
    'housekeeper': 'beachfolk:housekeeper', 'lifeguard': 'beachfolk:lifeguard',
    'icecream_vendor': 'beachfolk:icecream_vendor', 'beach_bar_staff': 'beachfolk:beach_bar_staff',
    'surfer': 'beachfolk:surfer', 'barista': 'townfolk:barista', 'chef': 'townfolk:barista',
    'clerk': 'beachfolk:beach_bar_staff', 'attendant': 'beachfolk:beach_bar_staff',
    'guide': 'beachfolk:receptionist', 'ticket_seller': 'beachfolk:receptionist', 'owner': 'beachfolk:beach_tourist',
}
# which staff stand BEHIND an occluder of the `_front` overlay (index list) - documentation for the game
STAFF_BEHIND = {'resort_hotel': [2], 'beach_cafe': [0], 'icecream_shop': [0], 'beach_bar': [0], 'seafood_bbq': [0],
                'tourist_info': [0], 'lifeguard_station': [0]}
CLIP = (60, 128, 18)        # plane-overlay clip around a staff point: +-x, up, down (px)
WATER_SEE = 0.72            # hotel_pool_water body opacity (the rest shows the pool floor of the base frame)


# --------------------------------------------------------------------------- post

def post(im, m):
    if m.get('shadow'):
        return pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
    return pu.clean_alpha(im, floor=3)


def rect_mask(W, H, cx, cy, clip=CLIP, feather=5):
    X, Y = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    dx = clip[0] - np.abs(X - cx)
    dy = np.minimum(Y - (cy - clip[1]), (cy + clip[2]) - Y)
    return np.clip(np.minimum(dx, dy) / feather, 0.0, 1.0)


def make_overlay(m, base, cache):
    W, H = m['frameSize']
    ax, ay = m['anchorPx']
    acc = np.zeros((H, W), np.float32)
    fr0 = m['frames'][0]
    for mk in m['overlay']['masks']:
        a = np.asarray(Image.open(os.path.join(cache, mk['mask'] + '.png')).convert('RGBA')).astype(np.float32)
        val = (a[..., 0] / 255.0) * (a[..., 3] / 255.0)
        if mk['kind'] == 'plane':
            st = m['framePoints'][fr0].get('staff', [])
            p = st[mk.get('staff', 0)]
            val = val * rect_mask(W, H, ax + p[0], ay + p[1])
        acc = np.maximum(acc, val)
    arr = np.asarray(base).astype(np.float32).copy()
    arr[..., 3] *= acc
    return pu.clean_alpha(Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)


def glow_rgb(cache, name):
    g = np.asarray(Image.open(os.path.join(cache, name + '.png')).convert('RGB')).astype(np.float32)
    blur = np.asarray(Image.fromarray(g.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))).astype(
        np.float32)
    wide = np.asarray(Image.fromarray(g.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(18))).astype(
        np.float32)
    return np.clip(g * 0.78 + blur * 0.45 + wide * 0.3, 0, 255)


def make_glow(cache, name):
    """Additive light overlay: straight RGB + alpha = brightness (premultiplied by Phaser -> adds the glow)."""
    out = glow_rgb(cache, name)
    a = out.max(-1)
    rgb = out * (255.0 / np.maximum(a, 1.0))[..., None]
    a = np.where(a < 5, 0, a)
    im = np.dstack([rgb, a]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(im, 'RGBA')


def make_night(day, cache, name):
    d = np.asarray(day).astype(np.float32)
    g = glow_rgb(cache, name)
    rgb = d[..., :3] * np.array(NIGHT_TINT)
    alpha = d[..., 3:4] / 255.0
    lit = rgb * alpha + g                       # premultiplied composite of day*tint + additive glow
    a = np.maximum(d[..., 3], np.clip(g.max(-1), 0, 255))
    aa = np.maximum(a, 1.0)[..., None] / 255.0
    out = np.dstack([np.clip(lit / aa, 0, 255), a])
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA')


def poly_mask(W, H, pts, ss=4):
    m = Image.new('L', (W * ss, H * ss), 0)
    ImageDraw.Draw(m).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.asarray(m.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0


def load(cache):
    builds = {}
    for fn in sorted(os.listdir(cache)):
        if not fn.endswith('.json'):
            continue
        try:
            m = json.load(open(os.path.join(cache, fn)))
        except Exception:
            continue
        names = list(m.get('frames', []))
        if m.get('overlay'):
            names += [x['mask'] for x in m['overlay']['masks']]
        if m.get('glow'):
            names.append(m['glow'])
        if m.get('water'):
            names += m['water']['frames']
        if 'build' in m and names and all(os.path.exists(os.path.join(cache, n + '.png')) for n in names):
            builds[m['build']] = m
    frames, derived = {}, {}
    for k, m in builds.items():
        for n in m['frames']:
            frames[n] = post(Image.open(os.path.join(cache, n + '.png')).convert('RGBA'), m)
        base = frames[m['frames'][0]]
        if m.get('overlay'):
            n = m['overlay']['key']
            frames[n] = make_overlay(m, base, cache)
            derived[n] = ('overlay', k)
        if m.get('glow'):
            n = k + '_glow'
            frames[n] = make_glow(cache, m['glow'])
            derived[n] = ('glow', k)
            if k in NIGHT_FRAMES:
                n2 = k + '_night'
                frames[n2] = make_night(base, cache, m['glow'])
                derived[n2] = ('night', k)
        if m.get('water'):
            W, H = m['frameSize']
            ax, ay = m['anchorPx']
            pm = poly_mask(W, H, [(ax + x, ay + y) for x, y in m['water']['poly']])
            for i, n in enumerate(m['water']['frames']):
                a = np.asarray(Image.open(os.path.join(cache, n + '.png')).convert('RGBA')).astype(np.float32)
                # clear water: the turquoise body lets WATER_SEE of the base frame's pool floor (sun mosaic, tiles)
                # through, the bright ripple glints stay opaque
                lum = a[..., :3].mean(-1)
                med = float(np.median(lum[pm > 0.5])) if (pm > 0.5).any() else 128.0
                hi = np.clip((lum - med - 12.0) / 50.0, 0.0, 1.0)
                a[..., 3] = a[..., 3] * pm * (WATER_SEE + (1.0 - WATER_SEE) * hi)
                frames[n] = pu.clean_alpha(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
            derived[k + '_water'] = ('water', k)
    return builds, frames, derived


# --------------------------------------------------------------------------- manifest

def footprint_poly(m):
    fm = m.get('footprintM')
    if not isinstance(fm, list) or len(fm) != 2:
        return None
    a, b = fm
    yaw = math.radians(m.get('yaw', 0.0))
    pts = []
    for lx, ly in ((-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)):
        x = lx * math.cos(yaw) - ly * math.sin(yaw)
        y = lx * math.sin(yaw) + ly * math.cos(yaw)
        pts.append([int(round((x + y) * KX)), int(round((x - y) * KY))])
    return pts


def sprite_entry(k, m, frame_atlas):
    fr = m['frames'][0]
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
    if 'anims' in m:
        w = dict(m['anims']['work'])
        s['anims'] = {'work': w}
        if m.get('animAlias'):
            s['anims'][m['animAlias']] = dict(w)
    if 'fxPoints' in m:
        s['fxPoints'] = {n: v for n, v in m['fxPoints'].items() if v is not None}
    pts = m.get('framePoints', {}).get(fr, {})
    dirs = m.get('frameDirs', {}).get(fr, {})
    for kind, field in POINT_SINGLE.items():
        if pts.get(kind):
            s[field] = pts[kind][0]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind][0]
            if kind == 'door' and len(pts[kind]) > 1:
                s['doorPoints'] = pts[kind]
                s['doorDirs'] = dirs.get(kind, [])
    for kind, field in POINT_LIST.items():
        if pts.get(kind):
            s[field] = pts[kind]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind]
    if 'lightPoints' in s:
        meta = m.get('lightMeta') or []
        s['lightKinds'] = [x[0] for x in meta][:len(s['lightPoints'])]
        s['lightRadiusPx'] = [int(round(x[1] * 48)) for x in meta][:len(s['lightPoints'])]
    if 'staffPoints' in s:
        s['staffDepth'] = 'front'
        base = k[:-2] if k.endswith('_x') and k[:-2] in STAFF_ROLES else k
        if base in STAFF_ROLES:
            s['staffRoles'] = STAFF_ROLES[base][:len(s['staffPoints'])]
        if base in STAFF_BEHIND:
            s['staffBehindOverlay'] = STAFF_BEHIND[base]
        if base == 'lifeguard_station':
            s['lookoutPoint'] = s['staffPoints'][0]
    for f in EXTRA_FIELDS:
        if f in m:
            s[f] = m[f]
    if m.get('notes'):
        s['notes'] = m['notes']
    return s


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre at ground level (z 0).',
    'front': '-Y = faces screen down-left (SW) = the SEA side (like the harbour waterfront). `<key>_x` variants are '
             'the same model rotated yaw 90: front = +X (screen down-right) for a coastline along the other iso axis; '
             'all their points / polys are already rotated. Baked shadows cannot be flipped, so never mirror a sprite.',
    'footprint': 'footprint = screen-px bounding size [w, h] of the ground diamond; footprintM = metres; footprintPoly = 4 '
                 'ground corners in px (depth sorting / collision).',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled). *Dirs = facing of '
              'a character standing there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX). Ground spots (door, customer, '
              'seat, in, work, view, shower) are in front of the geometry: draw characters there with normal y-sorting '
              '(their dy > 0) or just above the building.',
    'staff': 'staffPoints + staffRoles (role names; top-level staffPresets maps each role to an existing townsfolk preset) + staffDepth "front": draw staff at building depth '
             'd + 0.5. staffBehindOverlay lists the staff indices that stand BEHIND a counter / desk / deck railing: '
             'draw the sprite\'s `overlay` (<key>_front, same frame + anchor) at d + 1 so the occluder hides their '
             'legs (exactly like assets/buildings shop_general + shop_general_front; src/entities/Register.js already '
             'does this for sprites with `overlay`).',
    'balconyPoints': 'resort_hotel / pension: guests standing on balconies (elevated - dy already includes the floor '
                     'height). Draw them at d + 0.5 and the `_front` overlay (railings + towels) at d + 1.',
    'night': 'night: {glow, blend: ADD, tint}. At night tint every sprite with `tint` (multiply) and add the '
             '`<key>_glow` sprite (same frame + anchor, blendMode ADD, untinted) at the same position: lit windows, '
             'lamps, neon, bulbs, tiki torches, live tanks with a soft bloom. resort_hotel(_x) also has '
             '`night.frame` = <key>_night, the finished night picture (draw it UNTINTED instead of tint + glow). '
             'lightPoints (+ lightKinds, lightRadiusPx) = where to put extra fx_glow sprites or light the ground.',
    'anims': 'idle frame = rest; anims.work (+ alias grill / fish / lights / twinkle / ripple) loop with every frame '
             'sharing frameSize + anchor: spr:<key>:work like the village stations.',
    'pool': 'hotel_pool: the base sprite has NO water. waterPoly = px polygon (from the anchor) of the VISIBLE pool water '
            'surface (near coping already clipped) at waterZ (m, below the deck); give it to src/systems/Water.js '
            '(palette "pool", shore "quay") at depth d + 0.25. Without the shader draw `hotel_pool_water` (same frame + '
            'anchor, anims.work / ripple 6 f) at d + 0.25. swimPoints are ON the water plane (a swimmer anchor goes '
            'there, add fx_swim_ripple); lyingPoints / lyingDirs = loungers (seat surface, head direction).',
    'atlases': 'bbld_hotel (hotel, pool, night frames, water loop), bbld_shops, bbld_civic, bbld_street, bbld_glow '
               '(all night glow overlays - load it lazily, only needed at night).',
}


def build_manifest(builds, derived, frame_atlas, atlas_keys, old):
    sprites = {}
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, k))
    for k in order:
        m = builds[k]
        s = sprite_entry(k, m, frame_atlas)
        if m.get('overlay'):
            s['overlay'] = m['overlay']['key']
        if m.get('glow'):
            s['night'] = {'glow': k + '_glow', 'blend': 'ADD', 'tint': NIGHT_HEX}
            if k in NIGHT_FRAMES:
                s['night']['frame'] = k + '_night'
        if m.get('water'):
            s['waterPoly'] = m['water']['poly']
            s['waterRectPx'] = m['water']['rectWater']
            s['waterRectM'] = m['water']['rectM']
            s['waterOverlay'] = k + '_water'
        sprites[k] = s
    for n, (kind, k) in sorted(derived.items()):
        m = builds[k]
        base = {'anchor': m['anchor'], 'frameSize': m['frameSize'], 'of': k}
        if kind == 'overlay':
            sprites[n] = dict(base, atlas=frame_atlas[n], frame=n, kind='overlay',
                              notes='Occluder overlay of %s (same frame + anchor): draw it ABOVE the characters standing '
                                    'behind its railings / counter / desk (building d, those characters d + 0.5, this '
                                    'overlay d + 1).' % k)
        elif kind == 'glow':
            sprites[n] = dict(base, atlas=frame_atlas[n], frame=n, kind='glow', blend='ADD',
                              notes='Night light of %s: same frame + anchor, blendMode ADD, not tinted.' % k)
        elif kind == 'night':
            sprites[n] = dict(base, atlas=frame_atlas[n], frame=n, kind='night',
                              notes='Finished night picture of %s (day x tint %s + glow): draw it untinted at night in '
                                    'place of %s.' % (k, NIGHT_HEX, k))
        elif kind == 'water':
            fr = m['water']['frames']
            sprites[n] = dict(base, atlas=frame_atlas[fr[0]], frame=fr[0], kind='overlay',
                              anims={'work': {'frames': fr, 'fps': m['water']['fps'], 'repeat': -1},
                                     'ripple': {'frames': fr, 'fps': m['water']['fps'], 'repeat': -1}},
                              notes='Baked fallback pool water of %s (Canvas / low quality): same frame + anchor, play '
                                    'spr:%s:ripple at depth d + 0.25.' % (k, n))
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/bbld_render.py + bbld_pack.py (docs/CONTRACT_V7.md section X)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'beach_bld/%s.png' % a, 'json': 'beach_bld/%s.json' % a} for a in atlas_keys]
    oldsp = (old or {}).get('sprites', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['staffPresets'] = STAFF_PRESETS
    man['night'] = {'tint': NIGHT_HEX, 'glowBlend': 'ADD', 'glowAtlas': 'bbld_glow'}
    man['lazyAtlases'] = ['bbld_glow']
    return man


# --------------------------------------------------------------------------- pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def pack_groups(groups):
    out = []
    for g in ATLAS_ORDER + sorted(set(groups) - set(ATLAS_ORDER)):
        if g not in groups:
            continue
        builds = sorted(groups[g], key=lambda fr: -sum(im.width * im.height for _, im in fr))
        sheets = []
        for fr in builds:
            placed = False
            for sh in sheets:
                try:
                    sheet, _ = pu.pack_atlas(sh + fr, max_width=MAX_SHEET, trim=True, padding=2)
                except ValueError:
                    continue
                if sheet.height <= MAX_SHEET:
                    sh.extend(fr)
                    placed = True
                    break
            if not placed:
                sheets.append(list(fr))
        for i, sh in enumerate(sheets):
            sheet, atlas = pu.pack_atlas(sh, max_width=MAX_SHEET, trim=True, padding=2)
            out.append((g if i == 0 else '%s_%d' % (g, i + 1), sheet, atlas))
    return out


def pack_all(builds, frames, derived, mode):
    groups = {}
    for k, m in builds.items():
        fr = [(n, frames[n]) for n in m['frames']]
        if m.get('overlay'):
            fr.append((m['overlay']['key'], frames[m['overlay']['key']]))
        if m.get('water'):
            fr += [(n, frames[n]) for n in m['water']['frames']]
        if k + '_night' in frames:
            groups.setdefault(m['atlas'], []).append([(k + '_night', frames[k + '_night'])])
        groups.setdefault(m['atlas'], []).append(fr)
        if k + '_glow' in frames:
            groups.setdefault('bbld_glow', []).append([(k + '_glow', frames[k + '_glow'])])
    sheets = pack_groups(groups)
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('bbld_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.startswith('bbld_') and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(OUT, fn))
    total = 0
    sizes = {}
    for akey, sheet, atlas in sheets:
        png = os.path.join(OUT, akey + '.png')
        pu.save_atlas(sheet, atlas, png, os.path.join(OUT, akey + '.json'), quantize=False)
        sizes[akey] = os.path.getsize(png)
        total += sizes[akey] + os.path.getsize(os.path.join(OUT, akey + '.json'))
    do_q = mode == 'on' or (mode == 'auto' and total / 1048576.0 > BUDGET_MB * 0.9)
    if do_q:
        try:
            total = 0
            for akey, sheet, atlas in sheets:
                png = os.path.join(OUT, akey + '.png')
                quantize(sheet).save(png, optimize=True)
                sizes[akey] = os.path.getsize(png)
                total += sizes[akey] + os.path.getsize(os.path.join(OUT, akey + '.json'))
            print('  palettised with libimagequant (256 colours, dither 0.6)')
        except ImportError:
            print('  imagequant not installed -> kept RGBA (pip install imagequant)')
    frame_atlas = {}
    for akey, sheet, atlas in sheets:
        for n in atlas['frames']:
            frame_atlas[n] = akey
        print('%-20s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return sheets, frame_atlas, total


# --------------------------------------------------------------------------- guard

def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('bbld_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'bbld_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is never '
                         'written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('bbld_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 %d개는 '
              '빠집니다: %s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'bbld_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다. 아무 파일도 바꾸지 '
        '않았습니다.\nbbld_pack: ABORT - %d key(s) in the current manifest (or bbld_check.REQUIRED; * = only there) are '
        'missing from the render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/bbld_render.py -- <keys> first, or pass --cache <full cache>; '
        'to drop them on purpose re-run with --allow-partial' % (len(missing), cache, len(missing), cache, listing))


def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'beach_bld')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = args[args.index('--quantize') + 1] if '--quantize' in args else 'on'
    if not os.path.isdir(cache):
        sys.exit('bbld_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run bbld_render.py first or pass --cache DIR.' % cache)
    builds, frames, derived = load(cache)
    have = set(builds) | set(derived)
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from bbld_check import REQUIRED
    except ImportError:
        REQUIRED = []
    need = set(REQUIRED)
    in_man = set()
    if old:
        in_man = set(old.get('sprites', {}))
        need |= in_man
    guard(cache, have, need, in_man, '--allow-partial' in args)
    sheets, frame_atlas, total = pack_all(builds, frames, derived, mode)
    man = build_manifest(builds, derived, frame_atlas, [s[0] for s in sheets], old)
    if not man['sprites']:
        sys.exit('bbld_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('sprites: %d  payload %.2f MB' % (len(man['sprites']), total / 1048576.0))
    if '--no-previews' not in args:
        import bbld_preview as bpv
        bpv.all_previews(builds, frames, derived, PREV)


if __name__ == '__main__':
    main()
