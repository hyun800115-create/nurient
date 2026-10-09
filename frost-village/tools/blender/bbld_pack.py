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
  <key>_glow    additive night light (windows, lamps, neon, bulbs, backlit signs, lit interiors, live tanks) with a
                soft bloom; blend ADD, drawn in the LIGHT layer above the game's DayClock night overlay
  hotel_pool    is the DECK: the visible water surface (waterPoly) is cut out, the water is drawn UNDER it (Water.js or
  hotel_pool_water, the baked fallback: opaque pool water + floor, 6-frame caustic loop) - land over water, like the sea
Atlases: the `_x` builds (+ their overlays) live in the lazy atlas bbld_x, their glows in bbld_x_glow; every glow in
bbld_glow (lazy).  The old resort_hotel(_x)_night frames are retired (the DayClock overlay + glow make the night).
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
ATLAS_ORDER = ['bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street', 'bbld_x', 'bbld_glow', 'bbld_x_glow']
LAZY_ATLASES = ['bbld_glow', 'bbld_x', 'bbld_x_glow']
KX, KY, KZ = 45.2548, 22.6274, 55.4256
# the game's night (src/systems/DayClock.js): ONE camera-sized MULTIPLY image at DEPTH.FX - 30 tinted
# (1 - a) * white + a * 0x5a6aa8 with a = BALANCE.v4.day.darkness (0.45), pooled ADD fv_glow lights at FX - 29
DAYCLOCK_NIGHT = 0x5A6AA8
DAYCLOCK_DARK = 0.45
NIGHT_MUL = tuple((1 - DAYCLOCK_DARK) + DAYCLOCK_DARK * (((DAYCLOCK_NIGHT >> s_) & 255) / 255.0) for s_ in (16, 8, 0))
GLOW_GAIN = 0.85            # glow sprites sit ABOVE the night overlay (x0.71..0.85), so they are a little softer
RETIRED = {'resort_hotel_night', 'resort_hotel_x_night'}   # night frames dropped on purpose (DayClock night model)
POINT_SINGLE = {'in': 'inPoint', 'door': 'doorPoint'}
POINT_LIST = {'staff': 'staffPoints', 'customer': 'customerPoints', 'seat': 'seatPoints', 'balcony': 'balconyPoints',
              'lie': 'lyingPoints', 'swim': 'swimPoints', 'work': 'workPoints', 'view': 'viewPoints',
              'shower': 'showerPoints', 'light': 'lightPoints', 'liehead': 'lyingHeadPoints',
              'liefeet': 'lyingFeetPoints'}
DIR_LIST = {'staff': 'staffDirs', 'customer': 'customerDirs', 'seat': 'seatDirs', 'balcony': 'balconyDirs',
            'lie': 'lyingDirs', 'work': 'workDirs', 'view': 'viewDirs', 'shower': 'showerDirs', 'door': 'doorDir'}
EXTRA_FIELDS = ('name', 'zone', 'variantOf', 'floors', 'staffRoles', 'balconyDepth', 'waterZ', 'waterPalette',
                'waterShore', 'lookoutDepth', 'passage', 'balconyFloors', 'balconyHeadroomPx', 'lyingAxis',
                'lyingHeightM')
OPP = {'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E', 'SE': 'NW', 'NW': 'SE', 'NE': 'SW', 'SW': 'NE'}
# staff that stand ON a flat part of the sprite (pool deck) must be drawn above it like the counter staff
STAFF_ON_SPRITE = {'hotel_pool'}
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
WATER_SEE = 0.72            # water body opacity over the pool floor inside the baked fallback hotel_pool_water
WATER_PAD = 3               # the fallback water reaches this many px past waterPoly (tucks under the deck edge)


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


def make_glow(cache, name, extra=None):
    """Additive light overlay: straight RGB + alpha = brightness (premultiplied by Phaser -> adds the glow).
    extra = an optional RGB float array added before packing (the lit pool water)."""
    out = glow_rgb(cache, name) * GLOW_GAIN
    if extra is not None:
        out = out + extra
    a = out.max(-1)
    rgb = out * (255.0 / np.maximum(a, 1.0))[..., None]
    a = np.where(a < 5, 0, a)
    im = np.dstack([rgb, a]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(im, 'RGBA')


def pool_glow_fill(pm, glow_rgb_arr):
    """Lit pool at night: a soft turquoise body inside waterPoly, brighter where the underwater lamps shine."""
    body = pm[..., None] * np.array([18.0, 92.0, 108.0], np.float32)
    lamps = np.asarray(Image.fromarray(glow_rgb_arr.clip(0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(14))).astype(np.float32)
    return body + pm[..., None] * lamps * 0.9


def dilate(mask, px):
    im = Image.fromarray((mask * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.MaxFilter(2 * px + 1))).astype(np.float32) / 255.0


def poly_mask(W, H, pts, ss=4):
    m = Image.new('L', (W * ss, H * ss), 0)
    ImageDraw.Draw(m).polygon([(x * ss, y * ss) for x, y in pts], fill=255)
    return np.asarray(m.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0


def _caustics():
    """assets/water water_waves_b caustics channel (B), or a procedural stand-in when the fragment is missing."""
    p = os.path.join(ASSETS, 'water', 'water_waves_b.png')
    if os.path.exists(p):
        return np.asarray(Image.open(p).convert('RGB')).astype(np.float32)[..., 2] / 255.0
    rnd = np.random.RandomState(5)
    g = Image.fromarray((rnd.rand(32, 32) * 255).astype(np.uint8)).resize((256, 256), Image.BICUBIC)
    v = np.asarray(g).astype(np.float32) / 255.0
    return np.clip(1.0 - np.abs(v - 0.5) * 9.0, 0, 1)


def pool_water(a, pm, i, n):
    """One frame of the baked fallback pool water (hotel_pool_water), seamless over n frames.
    Body = the Blender water render blurred (no blotchy glints) with its deepest shadows lifted, WATER_SEE opaque so the
    pool floor of the base frame (tiles, sun mosaic) shows through; on top a moving caustic network (two layers of
    assets/water water_waves_b caustics drifting on small circles in opposite directions = a perfect loop) and a few
    sun glints where both layers peak.  Cut to the waterPoly mask pm."""
    H, W = pm.shape
    body = np.asarray(Image.fromarray(a[..., :3].clip(0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(7))).astype(np.float32)
    lum = body.mean(-1)
    med = float(np.median(lum[pm > 0.5])) if (pm > 0.5).any() else 128.0
    k = np.clip((0.82 * med - lum) / (0.82 * med), 0, 1)[..., None]
    body = body + (body * (med * 0.82 / np.maximum(lum, 1.0))[..., None] - body) * k
    cau = _caustics()
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    th = math.tau * i / n
    R = 6.0

    def samp(gx, gy):
        x0, y0 = np.floor(gx).astype(int), np.floor(gy).astype(int)
        fx, fy = gx - x0, gy - y0
        s_ = lambda yy, xx: cau[yy % cau.shape[0], xx % cau.shape[1]]   # noqa: E731
        return ((s_(y0, x0) * (1 - fx) + s_(y0, x0 + 1) * fx) * (1 - fy) +
                (s_(y0 + 1, x0) * (1 - fx) + s_(y0 + 1, x0 + 1) * fx) * fy)
    # G space (screen x, 2 * screen y) = the ground plane, like src/systems/Water.js samples its textures
    c1 = samp(X + R * math.cos(th), 2 * Y + R * math.sin(th))
    c2 = samp(X * 0.83 + 97 + R * math.cos(1.7 - th), 2 * Y * 0.83 + 41 + R * math.sin(1.7 - th))
    c = np.clip(np.sqrt(c1 * c2) * 1.6, 0, 1) ** 1.3
    col = body + c[..., None] * np.array([58, 66, 58], np.float32)
    gl = np.clip((np.minimum(c1, c2) - 0.74) / 0.2, 0, 1)
    col = col * (1 - gl[..., None] * 0.5) + 255.0 * gl[..., None] * 0.5
    alpha = pm * np.clip(WATER_SEE + (1 - WATER_SEE) * (0.45 * c + gl), 0, 1) * (a[..., 3] / 255.0)
    out = np.dstack([col.clip(0, 255), alpha * 255.0])
    return pu.clean_alpha(Image.fromarray(out.astype(np.uint8), 'RGBA'), floor=3)


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
        pm = None
        if m.get('water'):
            W, H = m['frameSize']
            ax, ay = m['anchorPx']
            pm = poly_mask(W, H, [(ax + x, ay + y) for x, y in m['water']['poly']])
        if m.get('glow'):
            n = k + '_glow'
            extra = None
            if pm is not None:
                extra = pool_glow_fill(pm, glow_rgb(cache, m['glow']))
            frames[n] = make_glow(cache, m['glow'], extra)
            derived[n] = ('glow', k)
        if pm is not None:
            # the base sprite becomes the DECK: the visible water surface is cut out (the water goes UNDER it)
            full = np.asarray(base).astype(np.float32)
            deck = full.copy()
            deck[..., 3] *= (1.0 - pm)
            frames[m['frames'][0]] = pu.clean_alpha(Image.fromarray(deck.clip(0, 255).astype(np.uint8), 'RGBA'),
                                                    floor=3)
            pad = dilate(pm, WATER_PAD)
            nfr = len(m['water']['frames'])
            for i, n in enumerate(m['water']['frames']):
                a = np.asarray(Image.open(os.path.join(cache, n + '.png')).convert('RGBA')).astype(np.float32)
                wtr = np.asarray(pool_water(a, pad, i, nfr)).astype(np.float32)
                # opaque fallback: the water over the empty basin of the render (pool floor, sun mosaic, tiles)
                wa = wtr[..., 3:4] / 255.0
                rgb = full[..., :3] * (1 - wa) + wtr[..., :3] * wa
                out = np.dstack([rgb, pad * 255.0 * (full[..., 3] > 8)])
                frames[n] = pu.clean_alpha(Image.fromarray(out.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
            derived[k + '_water'] = ('water', k)
    return builds, frames, derived


# --------------------------------------------------------------------------- manifest

def footprint_poly(m):
    fm = m.get('footprintM')
    if isinstance(fm, dict) and 'radius' in fm:          # round things (lamp post): the square around the circle
        fm = [2.0 * fm['radius'], 2.0 * fm['radius']]
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
        # DayClock.addLight(x, y, k): its fv_glow is 96 px x 1.25 k -> radius 60 k px
        s['lightK'] = [round(r / 60.0, 2) for r in s['lightRadiusPx']]
    if 'staffPoints' in s:
        base = k[:-2] if k.endswith('_x') and k[:-2] in STAFF_ROLES else k
        behind = STAFF_BEHIND.get(base, [])
        # per point: 'front' = draw at building depth d + 0.5 (behind a counter / desk / railing, under the
        # `overlay` at d + 1, or standing ON a flat part of the sprite); 'behind' = ordinary y-sorting at the
        # character's own y (staff standing in the open in front of the building) - the beach set's vocabulary
        sd = []
        for i, (dx, dy) in enumerate(s['staffPoints']):
            sd.append('front' if (i in behind or base in STAFF_ON_SPRITE or dy < 8) else 'behind')
        s['staffDepths'] = sd
        s['staffDepth'] = sd[0]                 # = staffPoints[0] (src/entities/Register.js reads this one)
        if base in STAFF_ROLES:
            s['staffRoles'] = STAFF_ROLES[base][:len(s['staffPoints'])]
        if behind:
            s['staffBehindOverlay'] = behind
        if base == 'lifeguard_station':
            s['lookoutPoint'] = s['staffPoints'][0]
    if 'lyingPoints' in s:
        # assets/beach vocabulary: lyingDirs = screen direction hips -> HEAD; the beachfolk sunbathe anim takes the
        # FEET direction (beachfolk.sunbathe.dir) -> lyingFeetDirs is what you pass to it
        s['lyingFeetDirs'] = [OPP[d] for d in s.get('lyingDirs', [])]
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
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled, height included). '
              '*Dirs = facing of a character standing there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX). Ground '
              'spots (door, customer, seat, in, work, view, shower) are in front of the geometry: draw characters '
              'there with normal y-sorting.',
    'staff': 'staffPoints + staffRoles (role names; the top-level staffPresets maps every role to an existing '
             'townsfolk / beachfolk preset "<fragment>:<preset>") + staffDepths (one per point): "front" = draw that '
             'character at the building depth d + 0.5 - it stands BEHIND a counter / desk / deck railing (listed in '
             'staffBehindOverlay: the sprite\'s `overlay` <key>_front, same frame + anchor, goes on top at d + 1 and '
             'hides its legs, exactly like assets/buildings shop_general + shop_general_front) or ON a flat part of '
             'the sprite (the pool deck); "behind" = ordinary y-sorting at the character\'s own y (staff standing in '
             'the open in front of the building: doorman, bellhop, clerks at the door) so people walking behind '
             'them are drawn behind them. staffDepth = staffDepths[0] (what src/entities/Register.js reads).',
    'balconyPoints': 'resort_hotel / pension: guests standing on balconies (elevated - dy already includes the floor '
                     'height). Draw them at d + 0.5 and the `_front` overlay (railings + towels) at d + 1. The hotel '
                     'balconies are CHECKERBOARDED: no balcony sits right above another, so a standing chibi guest '
                     '(80 - 100 px) only overlaps the wall / windows / roof above it, never the next railing. '
                     'balconyFloors = floor of each point (0 = first upper floor); balconyHeadroomPx = free height '
                     'above that balcony floor (px) up to the next balcony or the eaves.',
    'lying': 'lyingPoints = hip point of a sunbather ON the lounger cushion (beachfolk `sunbathe` anchor, '
             'lyingHeightM = cushion height); lyingHeadPoints / lyingFeetPoints = the backrest top / the foot end; '
             'lyingDirs = screen direction hips -> HEAD (like assets/beach); lyingFeetDirs = the opposite = the '
             'direction to pass to beachfolk sunbathe (its dir is where the FEET point); lyingAxis = world axis of '
             'the body.',
    'night': 'Built for the game\'s DayClock night (src/systems/DayClock.js): ONE camera-sized MULTIPLY overlay at '
             'DEPTH.FX - 30 darkens everything (x0.71 / 0.74 / 0.85 at darkness 0.45) - do NOT tint the sprites '
             'yourself. night.glow = <key>_glow (same frame + anchor, blendMode ADD) goes in the LIGHT layer above '
             'that overlay: depth DEPTH.FX - 29 like the DayClock glows, alpha = the DayClock night factor '
             '(min(1, dayClock.cur.a / darkness)), visible while dayClock.lightsOn; only for buildings in / near the '
             'camera view. Lit windows, lamps, neon, bulbs, backlit roof signs, lit shop interiors, live tanks and '
             'the lit pool. lightPoints (+ lightKinds, lightRadiusPx, lightK) = feed each one to '
             'dayClock.addLight(ax + dx, ay + dy, lightK[i]) for the warm ground / halo light. Note: a glow in the '
             'light layer is drawn over characters standing in front of a lit window (reads as light spill).',
    'anims': 'idle frame = rest; anims.work (+ alias grill / fish / lights / twinkle / ripple) loop with every frame '
             'sharing frameSize + anchor: spr:<key>:work like the village stations. seafood_bbq has no baked smoke: '
             'emit translucent FX puffs (fx_smoke_puff, alpha 0.35 - 0.6) at fxPoints.smoke.',
    'pool': 'hotel_pool is the DECK: its visible water surface is cut out (transparent), so the water is drawn UNDER '
            'it (land over water, exactly like the sea under the land; Water.js writes alpha 1 in a stair-stepped '
            'mesh around the water and relies on the land covering it). Shader path: new Water(scene, {region: '
            'waterRegion offset by the anchor (the water bbox, NO margin: the Water.js body mesh is 64 x 32 px blocks clamped to '
            'the region, and the deck is opaque over that whole box - a bigger region lets blocks poke out past the '
            'deck), mask: {water: [waterPolyFlat offset by the anchor]}, waterPx: 0, '
            'defaultShore: "quay", palette: "pool", openSea: false, depth: d - 0.5, shoreDepth: d - 0.45}). '
            'Fallback (Canvas / low quality): `hotel_pool_water` (opaque water + pool floor, same frame + anchor, '
            'spr:hotel_pool_water:ripple) at d - 0.5. One of the two must always be drawn (the deck has a hole). '
            'Swimmers stand ON the water plane at swimPoints, drawn at d + 0.5 (over the deck, add fx_swim_ripple); '
            'sunbathers on lyingPoints at d + 0.6 (sunbathe dir = lyingFeetDirs); the pool staff stand on the deck '
            '(staffDepths "front").',
    'atlases': 'bbld_hotel (hotel, pool deck + water loop), bbld_shops, bbld_civic, bbld_street: always. LAZY '
               '(lazyAtlases): bbld_x (every _x building + its overlay - load only where a coast runs along Y), '
               'bbld_glow (night glows), bbld_x_glow (night glows of the _x buildings).',
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
            s['night'] = {'glow': k + '_glow', 'blend': 'ADD', 'layer': 'light'}
        if m.get('water'):
            s['waterPoly'] = m['water']['poly']
            s['waterPolyFlat'] = [v for p_ in m['water']['poly'] for v in p_]
            wx_ = [p_[0] for p_ in m['water']['poly']]
            wy_ = [p_[1] for p_ in m['water']['poly']]
            # Water.js region = the water's bounding box with NO margin: its body mesh is made of 64 x 32 px blocks
            # clamped to the region, and the deck is opaque over that whole box (bbld_check verifies it)
            s['waterRegion'] = [min(wx_), min(wy_), max(wx_) - min(wx_), max(wy_) - min(wy_)]
            s['waterRectPx'] = m['water']['rectWater']
            s['waterRectM'] = m['water']['rectM']
            s['waterOverlay'] = k + '_water'
            s['waterDepth'] = -0.5
            s['waterPx'] = 0
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
                              notes='Night light of %s: same frame + anchor, blendMode ADD, in the light layer above '
                                    'the DayClock overlay (conventions.night).' % k)
        elif kind == 'water':
            fr = m['water']['frames']
            sprites[n] = dict(base, atlas=frame_atlas[fr[0]], frame=fr[0], kind='underlay',
                              anims={'work': {'frames': fr, 'fps': m['water']['fps'], 'repeat': -1},
                                     'ripple': {'frames': fr, 'fps': m['water']['fps'], 'repeat': -1}},
                              notes='Baked fallback pool water of %s (Canvas / low quality): opaque turquoise water over '
                                    'the pool floor with a drifting caustic net, same frame + anchor; play '
                                    'spr:%s:ripple UNDER the deck at depth d - 0.5.' % (k, n))
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/bbld_render.py + bbld_pack.py (docs/CONTRACT_V7.md section X)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'beach_bld/%s.png' % a, 'json': 'beach_bld/%s.json' % a} for a in atlas_keys]
    oldsp = (old or {}).get('sprites', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['staffPresets'] = STAFF_PRESETS
    man['night'] = {'model': 'DayClock', 'overlay': {'color': '#5A6AA8', 'darkness': DAYCLOCK_DARK, 'blend': 'MULTIPLY',
                                                     'depth': 'DEPTH.FX - 30'},
                    'glowBlend': 'ADD', 'glowDepth': 'DEPTH.FX - 29', 'glowAtlases': ['bbld_glow', 'bbld_x_glow'],
                    'glowAlpha': 'min(1, dayClock.cur.a / darkness), only while dayClock.lightsOn',
                    'lights': 'dayClock.addLight(ax + dx, ay + dy, lightK[i]) for every lightPoints entry'}
    man['lazyAtlases'] = [a for a in LAZY_ATLASES if a in atlas_keys]
    man.pop('retired', None)
    man['retired'] = {k: 'night frames replaced by the DayClock overlay + <key>_glow' for k in sorted(RETIRED)}
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
        xvar = bool(m.get('variantOf'))                        # a side-facing `_x` variant (lazy atlases)
        groups.setdefault('bbld_x' if xvar else m['atlas'], []).append(fr)
        if k + '_glow' in frames:
            groups.setdefault('bbld_x_glow' if xvar else 'bbld_glow', []).append([(k + '_glow', frames[k + '_glow'])])
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
    need -= RETIRED
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
