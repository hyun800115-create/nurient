"""
bbld_preview.py - previews for assets/beach_bld (called by bbld_pack.py, or on its own after a pack):
    docs/previews/bbld_all.png      every sprite at 1x (idle + one anim frame + the hotel night frame + pool water)
    docs/previews/bbld_scene.png    a beachfront street at 1x: hotel + pool + shops along a promenade, a boardwalk
                                    with lamps and string lights, a sand strip with the bar / lifeguard station, the sea
                                    in front; people = existing assets/townfolk (+ townfolk2 sit) at the sprite points
    docs/previews/bbld_night.png    the same street at night (tint + <key>_glow ADD + hotel night frame + lamp halos)
    docs/previews/bbld_anims.gif    seafood_bbq grill, mini_aquarium fish, beach_arcade lights, string lights
    docs/previews/bbld_pool.gif     hotel pool with the baked fallback water loop
    docs/previews/bbld_hotel_daynight.gif   resort hotel fading day -> night -> day
Standalone:  python3 tools/blender/bbld_preview.py [--cache DIR]   (re-reads the render cache like bbld_pack)
The ground (promenade paving, boardwalk, sand, wet sand, foam, sea) is drawn here, per pixel, from the inverse iso
projection - a stand-in for the real ground: the sand uses assets/beach ground_sand(_wet) and the sea is a static
look-alike of src/systems/Water.js built from assets/water (tropical palette LUT, ripple normals, caustics, foam lace)
when those fragments exist, else a procedural fallback.  Beach props (parasols, loungers, palms, towels, dune grass,
sandcastle) come from assets/beach when present.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import prop_pack as pp   # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
KX, KY, KZ = 45.2548, 22.6274, 55.4256
NIGHT_TINT = np.array([0.42, 0.48, 0.72])


def font(size):
    from PIL import ImageFont
    for p in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
              '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return pp.font(size)


def _gif(frames_rgb, durs, out):
    pal = frames_rgb[min(2, len(frames_rgb) - 1)].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames_rgb]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)


# --------------------------------------------------------------------------- labelled sheet

def preview_all(builds, frames, derived, out):
    ents = []
    order = sorted(builds, key=lambda k: (['bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street'].index(
        builds[k]['atlas']) if builds[k]['atlas'] in ('bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street') else 9,
        k.endswith('_x'), k))
    for k in order:
        m = builds[k]
        im = frames[m['frames'][0]]
        if m.get('water'):
            comp = im.copy()
            comp.alpha_composite(frames[m['water']['frames'][0]])
            ents.append((k, im))
            ents.append((k + ' + hotel_pool_water', comp))
            continue
        ents.append((k, im))
        if 'anims' in m:
            nfr = m['anims']['work']['frames']
            ents.append((k + ' (%s)' % (m.get('animAlias') or 'work'), frames[nfr[1]]))
        if k + '_night' in frames:
            bg = Image.new('RGBA', im.size, (24, 30, 58, 255))
            bg.alpha_composite(frames[k + '_night'])
            ents.append((k + '_night', bg))
    pp.shelf_preview(ents, out, max_w=3000, bg=(236, 222, 190),
                     title='Sunny Beach (햇살 해변) - assets/beach_bld at 1x, PPU 64: hotel + pool, shops, civic, street; '
                           'idle + one anim frame, resort_hotel_night, pool with the fallback water')


# --------------------------------------------------------------------------- procedural beach ground

def shore_y(x):
    return -10.6 + 0.45 * math.sin(x * 0.31) + 0.25 * math.sin(x * 0.83 + 1.3)


def value_noise(H, W, scale, seed):
    rnd = np.random.RandomState(seed)
    gh, gw = int(H / scale) + 3, int(W / scale) + 3
    g = rnd.rand(gh, gw).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((int(gw * scale), int(gh * scale)), Image.BICUBIC)
    return np.asarray(im).astype(np.float32)[:H, :W] / 255.0


def tiled(rel, W, H):
    p = os.path.join(ASSETS, rel)
    if not os.path.exists(p):
        return None
    t = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    ry, rx = -(-H // t.shape[0]), -(-W // t.shape[1])
    return np.tile(t, (ry, rx, 1))[:H, :W]


def _hex(c):
    c = c.lstrip('#')
    return np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], np.float32)


def water_sea(W, H, ox, oy, d, wx, t=0.0):
    """Static look-alike of src/systems/Water.js (palette "tropical") from the assets/water fragment: depth LUT colour
    over the sand bed, ripple normals (water_waves_a) shading + sky reflection + sun glints, caustics in the shallows,
    rolling swell crests parallel to the shore and lacy foam (water_foam) at the swash line.  d = metres out to sea.
    Returns (rgb, foam) or None when the fragment is not there (then ground() uses its procedural sea)."""
    try:
        man = json.load(open(os.path.join(ASSETS, 'water', 'manifest.json'), encoding='utf-8'))
        pal = man['palettes']['tropical']
        wv = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_waves_a.png')).convert('RGB')).astype(
            np.float32) / 255.0
        fo = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_foam.png')).convert('RGB')).astype(
            np.float32) / 255.0
    except Exception:                          # noqa: BLE001
        return None
    X, Y = np.meshgrid(np.arange(W) + ox * 0, np.arange(H))
    gx, gy = X.astype(np.int64), (2 * Y).astype(np.int64)            # G space: (screen x, 2 * screen y)
    sh = int(t * 512 * 0.25)
    n = wv[(gy + sh) % wv.shape[0], (gx + sh // 2) % wv.shape[1]]
    n2 = wv[(gy // 2 + 97 - sh) % wv.shape[0], (gx // 2 + 211) % wv.shape[1]]
    nx = (n[..., 0] * 2 - 1) * 0.65 + (n2[..., 0] * 2 - 1) * 0.35
    ny = (n[..., 1] * 2 - 1) * 0.65 + (n2[..., 1] * 2 - 1) * 0.35
    caus = n[..., 2]
    depth = np.clip(d, 0, None) * 0.42
    u = 1.0 - np.exp(-depth / pal['depthScale'])
    stops = pal['lut']
    us = np.array([s[0] for s in stops], np.float32)
    cols = np.stack([_hex(s[1]) for s in stops])
    ops = np.array([s[2] for s in stops], np.float32)
    col = np.stack([np.interp(u, us, cols[:, c]) for c in range(3)], -1)
    op = np.interp(u, us, ops)[..., None]
    bed = _hex(pal['bottom']) * (0.92 + 0.08 * caus[..., None])
    sea = bed * (1 - op) + col * op
    # rolling swell: soft crests parallel to the shore moving in with t (brighter faces, darker troughs)
    ph = d * 1.25 + t * math.tau + 0.6 * np.sin(wx * 0.21)
    sw = np.sin(ph)
    sea = sea * (1.0 + 0.10 * sw[..., None] * np.clip(u * 3, 0, 1)[..., None])
    # broken white caps only on the first two crests in front of the beach (fade out to sea), lace-textured
    win = np.clip((d - 1.0) / 1.0, 0, 1) * np.clip((8.5 - d) / 3.0, 0, 1)
    var = fo[(gy // 4 + 31) % 256, (gx // 4 + 77) % 256, 2]
    crest = np.clip((sw - 0.9) / 0.1, 0, 1) * win * (fo[(gy // 2) % 256, gx % 256, 0] > 0.5) * np.clip(
        (var - 0.35) / 0.2, 0, 1)
    # ripple shading + sky reflection (Fresnel-ish on slope) + sun glints
    lit = nx * -0.55 + ny * -0.8
    sea = sea * (1.0 + 0.22 * lit[..., None])
    sky = _hex(pal['skyLo']) * 0.6 + _hex(pal['skyHi']) * 0.4
    refl = np.clip(0.08 + 0.5 * np.abs(ny), 0, 0.4)[..., None] * np.clip(u * 2.5, 0, 1)[..., None]
    sea = sea * (1 - refl) + sky * refl
    glint = np.clip((lit - 0.62) / 0.2, 0, 1) * np.clip(u * 3, 0, 1)
    sea = sea * (1 - glint[..., None] * 0.7) + _hex(pal['sun']) * glint[..., None] * 0.7
    # caustics in the shallows
    sea = sea + (caus[..., None] ** 2) * pal['caustic'] * 60.0 * np.clip(1 - u * 2.2, 0, 1)[..., None]
    # foam: swash lace at the waterline + the swell crests
    lace = fo[(gy + sh) % 256, (gx - sh) % 256, 0]
    swash = 0.25 + 0.2 * math.sin(t * math.tau)
    band = np.exp(-((d + swash * 0.3 - 0.15) / 0.32) ** 2)
    foam = np.clip((lace - (1.0 - band * 0.9)) / 0.12, 0, 1) * band + np.exp(-((d + swash * 0.3) / 0.09) ** 2) * 0.8
    foam = np.clip(foam + crest * 0.75, 0, 1)
    return np.clip(sea, 0, 255), foam


def ground(W, H, ox, oy, t=0.0):
    """RGB float image of the beach ground: promenade paving (y > -1.9), boardwalk (-3.3 .. -1.9), sand, wet sand,
    swash foam, sea (shallow turquoise -> deep) with wave bands and glints.  t = wave phase (0..1) for GIFs."""
    X, Y = np.meshgrid(np.arange(W) + 0.5 - ox, np.arange(H) + 0.5 - oy)
    wx = (X / KX + Y / KY) / 2.0
    wy = (X / KX - Y / KY) / 2.0
    n1 = value_noise(H, W, 9, 1)
    n2 = value_noise(H, W, 3, 2)
    img = np.zeros((H, W, 3), np.float32)
    # sea
    sy = -10.6 + 0.45 * np.sin(wx * 0.31) + 0.25 * np.sin(wx * 0.83 + 1.3)
    d = sy - wy                                              # metres out to sea
    deep = np.clip(d / 9.0, 0, 1)[..., None]
    shallow = np.array([96, 214, 214], np.float32)
    mid = np.array([38, 170, 196], np.float32)
    far = np.array([30, 104, 170], np.float32)
    sea = shallow * (1 - np.clip(deep * 2, 0, 1)) + mid * np.clip(deep * 2, 0, 1)
    sea = sea * (1 - np.clip(deep * 2 - 1, 0, 1)) + far * np.clip(deep * 2 - 1, 0, 1)
    band = 0.5 + 0.5 * np.sin((wy * 2.1 + wx * 0.35) + t * math.tau + n1 * 3.0)
    sea = sea + (band[..., None] ** 6) * 26.0 * (1 - deep * 0.5)
    glint = (n2 > 0.86) & (value_noise(H, W, 1.6, 3 + int(t * 7)) > 0.72)
    sea = np.where(glint[..., None], sea * 0.4 + 255 * 0.6, sea)
    # sand: assets/beach ground_sand / ground_sand_wet (screen-space tiled like the game's ground) if present
    ts, tw = tiled('beach/ground_sand.png', W, H), tiled('beach/ground_sand_wet.png', W, H)
    if ts is not None:
        sand = ts
    else:
        sand = np.array([241, 222, 178], np.float32) * (0.95 + 0.07 * n1[..., None]) - 10 * (n2[..., None] > 0.8)
        ripples = 0.5 + 0.5 * np.sin(wy * 9.0 + n1 * 4.0)
        sand = sand - (ripples[..., None] ** 8) * 9.0
    wet = tw if tw is not None else np.array([214, 190, 140], np.float32) * (0.96 + 0.05 * n1[..., None])
    wet_w = np.clip(1.0 - (wy - sy) / 1.1, 0, 1)[..., None]
    sand = sand * (1 - wet_w) + wet * wet_w
    ws = water_sea(W, H, ox, oy, d, wx, t)
    if ws is not None:
        # assets/water look (tropical palette); wet-sand edge blends softly into the shallow water
        sea, foam = ws
        edge = np.clip(d / 0.25, 0, 1)[..., None]
        img = sand * (1 - edge) + sea * edge
        img = np.where((d > -0.02)[..., None], img, sand)
        img = img * (1 - foam[..., None]) + 252 * foam[..., None]
    else:
        img = np.where((d > 0)[..., None], sea, sand)
        # swash foam: a lacy band at the waterline + a second line offshore (moves with t)
        swash = 0.25 + 0.2 * math.sin(t * math.tau)
        f1 = np.exp(-((d + swash * 0.3) / 0.16) ** 2) * (0.6 + 0.4 * n2)
        f2 = np.exp(-((d - 1.4 - 0.4 * math.sin(t * math.tau + 1.0)) / 0.12) ** 2) * (n1 > 0.45) * 0.55
        foam = np.clip(f1 + f2, 0, 1)[..., None]
        img = img * (1 - foam) + 252 * foam
    # boardwalk planks along X
    bw = (wy > -3.3) & (wy <= -1.9)
    pk = np.floor(wy / 0.24).astype(int)
    tones = np.array([[201, 160, 112], [190, 148, 102], [210, 171, 124], [196, 154, 106]], np.float32)
    wood = tones[pk % 4] * (0.94 + 0.08 * n2[..., None])
    joint = (np.abs(wy / 0.24 - np.round(wy / 0.24)) < 0.07)
    seam = (np.abs(((wx + (pk % 3) * 0.7) / 2.4) - np.round((wx + (pk % 3) * 0.7) / 2.4)) < 0.012)
    wood = np.where((joint | seam)[..., None], wood * 0.72, wood)
    img = np.where(bw[..., None], wood, img)
    edge = (wy > -3.42) & (wy <= -3.3)
    img = np.where(edge[..., None], np.array([150, 112, 74], np.float32), img)
    # promenade paving (warm stone tiles)
    pv = wy > -1.9
    ti = ((np.floor(wx / 0.7) + np.floor(wy / 0.7)) % 2)[..., None]
    pave = np.array([238, 228, 210], np.float32) * (1 - ti) + np.array([228, 216, 196], np.float32) * ti
    pave = pave * (0.97 + 0.04 * n1[..., None])
    grout = (np.abs(wx / 0.7 - np.round(wx / 0.7)) < 0.03) | (np.abs(wy / 0.7 - np.round(wy / 0.7)) < 0.03)
    pave = np.where(grout[..., None], pave * 0.9, pave)
    img = np.where(pv[..., None], pave, img)
    return img


# --------------------------------------------------------------------------- scene

class Scene:
    def __init__(self, W, H, ox, oy):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.items = []              # (depth, image, x, y, kind)  kind: 'n' normal, 'glow' additive (night only)
        self.labels = []
        self.pools = []              # night: warm light pools on the ground (screen px)

    def content_box(self, pad=(70, 70, 70, 260)):
        xs0 = [x for _, im, x, y, k in self.items if k != 'glow']
        ys0 = [y for _, im, x, y, k in self.items if k != 'glow']
        xs1 = [x + im.width for _, im, x, y, k in self.items if k != 'glow']
        ys1 = [y + im.height for _, im, x, y, k in self.items if k != 'glow']
        return (max(0, min(xs0) - pad[0]), max(0, min(ys0) - pad[1]), min(self.W, max(xs1) + pad[2]),
                min(self.H, max(ys1) + pad[3]))

    def p(self, x, y, z=0.0):
        return self.ox + (x + y) * KX, self.oy + (x - y) * KY - z * KZ

    def put(self, im, anchor_px, x, y, depth=None, bias=0.0, kind='n', px=None):
        if px is None:
            sx, sy = self.p(x, y)
        else:
            sx, sy = px
        d = (sy if depth is None else depth) + bias
        self.items.append((d, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])), kind))

    def render(self, ground_rgb, night=False, labels=True, caption=''):
        base = ground_rgb.copy()
        if night:
            base = base * NIGHT_TINT * 0.82
            X, Y = np.meshgrid(np.arange(self.W), np.arange(self.H))
            for (px, py) in self.pools:
                r2 = ((X - px) / 95.0) ** 2 + ((Y - py) / 48.0) ** 2
                base += np.exp(-r2 * 2.2)[..., None] * np.array([120, 84, 38], np.float32)
        img = Image.fromarray(base.clip(0, 255).astype(np.uint8)).convert('RGBA')
        glow = np.zeros((self.H, self.W, 3), np.float32)
        for d, im, x, y, kind in sorted(self.items, key=lambda t: t[0]):
            if kind == 'glow':
                if not night:
                    continue
                a = np.asarray(im).astype(np.float32)
                g = a[..., :3] * (a[..., 3:4] / 255.0)
                x0, y0 = max(0, x), max(0, y)
                x1, y1 = min(self.W, x + im.width), min(self.H, y + im.height)
                if x1 > x0 and y1 > y0:
                    glow[y0:y1, x0:x1] += g[y0 - y:y1 - y, x0 - x:x1 - x]
                continue
            if kind == 'dayonly' and night:
                continue
            if kind == 'nightonly' and not night:
                continue
            if night and kind != 'nightonly':
                a = np.asarray(im).astype(np.float32)
                a[..., :3] *= NIGHT_TINT
                im = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')
            img.alpha_composite(im, (x, y)) if (x >= 0 and y >= 0) else img.paste(im, (x, y), im)
        if night:
            arr = np.asarray(img).astype(np.float32)
            arr[..., :3] = np.clip(arr[..., :3] + glow, 0, 255)
            img = Image.fromarray(arr.astype(np.uint8), 'RGBA')
        d_ = ImageDraw.Draw(img)
        if labels:
            f = pp.font(13)
            for text, sx, sy in self.labels:
                tw = f.getlength(text)
                d_.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7,
                                     fill=(255, 255, 255, 215))
                d_.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
        if caption:
            d_.rectangle([0, self.H - 40, self.W, self.H], fill=(23, 132, 160, 255))
            d_.text((16, self.H - 33), caption, fill=(255, 255, 255), font=font(18))
        return img


def townfolk():
    try:
        import townfolk_compose as tc
        tf = tc.Townfolk.from_assets()
        try:
            pres = json.load(open(os.path.join(ASSETS, 'harbor', 'townfolk_presets.json'), encoding='utf-8'))['presets']
            tf.T['generator']['presets'].update(pres)
        except Exception:                      # noqa: BLE001
            pass
        tf2 = None
        try:
            import townfolk2_compose as tc2
            tf2 = tc2.Townfolk2.from_assets()
            try:
                tf2.T['generator']['presets'].update(pres)
            except Exception:                  # noqa: BLE001
                pass
        except Exception as e:                 # noqa: BLE001
            print('note: townfolk2 (sit) unavailable: %s' % e)
        return tf, tf2
    except Exception as e:                     # noqa: BLE001
        print('note: townsfolk disabled (%s)' % e)
        return None, None


LAYOUT = [
    # key, x, y = anchor in world metres; the front row's front edges sit on y = 0 (anchor y = fpD / 2), the back row
    # behind the pool on y = 5.6, the sand row in front of the boardwalk (y < -3.3)
    ('pension', 10.2, 7.3), ('convenience_store', 14.5, 7.4),
    ('mini_aquarium', -2.6, 1.9), ('resort_hotel', 4.0, 2.9), ('hotel_pool', 11.5, 2.3), ('beach_cafe', 17.0, 1.8),
    ('icecream_shop', 21.1, 1.6), ('souvenir_shop', 24.7, 1.6), ('swimwear_shop', 28.3, 1.6),
    ('seafood_bbq', 32.3, 1.8), ('beach_arcade', 36.6, 1.8),
    ('beach_gate', 19.0, -3.85), ('tourist_info', 15.4, -4.8), ('surf_shop', 7.6, -5.6), ('beach_bar', 26.0, -5.6),
    ('lifeguard_station', 32.6, -6.3), ('restroom_shower', 38.4, -5.0),
]
FACE_FALLBACK = {'NE': 'E', 'N': 'SE', 'NW': 'W'}


def beach_props(sc, night):
    try:
        import bld_pack as bp
        lib = bp.atlas_lib('beach/manifest.json')
    except Exception:                          # noqa: BLE001
        lib = None
    if not lib:
        return
    man, get = lib
    sp = man.get('sprites', {})

    def B(key, x, y, ground=False):
        s = sp.get(key)
        if not s or 'atlas' not in s:
            return
        im = get(s['atlas'], s['frame'])
        if im is None:
            return
        fw, fh = s.get('frameSize', im.size)
        anc = s.get('anchorPx') or (s['anchor'][0] * fw, s['anchor'][1] * fh)
        sx, sy = sc.p(x, y)
        sc.put(im, anc, x, y, depth=(sy - 5000) if ground else None)
    for k, (x, y, key) in enumerate(((1.0, -6.4, 'decal_towel_red'), (3.6, -7.6, 'decal_towel_blue_x'),
                                     (12.0, -7.2, 'decal_towel_yellow'), (22.5, -7.8, 'decal_towel_green_x'),
                                     (35.0, -8.4, 'decal_towel_red_x'), (29.5, -9.0, 'decal_towel_blue'))):
        B(key, x, y, ground=True)
    B('decal_shells', 5.0, -9.3, ground=True)
    B('decal_seaweed', 24.0, -10.3, ground=True)
    B('decal_footprints_sand', 17.0, -6.2, ground=True)
    B('decal_volleyball_court', 41.0, -7.2, ground=True)
    for k, (x, y) in enumerate(((1.6, -5.6), (12.6, -6.3), (23.2, -7.0), (35.6, -7.6))):
        B(('parasol_red', 'parasol_blue', 'parasol_yellow', 'parasol_green')[k % 4], x, y)
        B('sun_lounger', x + 0.9, y - 0.4)
    for x, y in ((-6.0, 6.5), (20.5, 9.0), (34.0, 7.0), (40.5, 4.5)):
        B('palm_tree_a', x, y)
    for x, y in ((-5.2, -4.6), (43.8, -4.4)):
        B('palm_tree_b', x, y)
    for k, (x, y) in enumerate(((2.2, -3.95), (11.4, -3.95), (29.6, -3.95), (41.6, -3.95), (-2.0, -4.2))):
        B(('dune_grass_a', 'dune_grass_b', 'dune_grass_c')[k % 3], x, y)
    B('sandcastle_m', 9.6, -9.0)
    B('bucket_spade', 10.4, -9.3)
    B('beach_ball', 14.2, -8.7)


def build_scene(builds, frames, derived, night=False, seed=7):
    W, H = 3600, 2400
    sc = Scene(W, H, 900, 1100)
    tf, tf2 = townfolk()
    rnd = random.Random(seed)

    def S(key, x, y, frame=None, label=True):
        m = builds.get(key)
        if not m:
            return None
        sx, sy = sc.p(x, y)
        fr = frame or m['frames'][0]
        img = frames[fr]
        if night and key + '_night' in frames:
            sc.put(frames[key + '_night'], m['anchorPx'], x, y, kind='nightonly')
            sc.put(img, m['anchorPx'], x, y, kind='dayonly')
        else:
            sc.put(img, m['anchorPx'], x, y)
            if key + '_glow' in frames:
                sc.put(frames[key + '_glow'], m['anchorPx'], x, y, kind='glow', bias=0.2)
        if m.get('overlay'):
            sc.put(frames[m['overlay']['key']], m['anchorPx'], x, y, depth=sy + 1.0)
        if m.get('water'):
            sc.put(frames[m['water']['frames'][0]], m['anchorPx'], x, y, depth=sy + 0.25)
        if label:
            fh = m.get('footprint', [0, 40])[1]
            sc.labels.append((key, sx, sy + fh / 2 + 4))
        return m

    def pts(key, kind):
        m = builds.get(key)
        return m['framePoints'][m['frames'][0]].get(kind, []) if m else []

    def dirs(key, kind):
        m = builds.get(key)
        return m['frameDirs'][m['frames'][0]].get(kind, []) if m else []

    def person(preset, sx, sy, d='S', anim='idle', i=0, depth=None, lib=None):
        L_ = lib or tf
        if not L_:
            return
        if anim in ('sit', 'talk', 'wave', 'happy', 'clap', 'sad'):
            d = FACE_FALLBACK.get(d, d)
        try:
            p = L_.preset(preset, rnd.randrange(10 ** 6)) if preset else L_.random_person(rnd.randrange(10 ** 6))
            im = L_.compose(p, anim, d, i)
        except Exception as e:                 # noqa: BLE001
            print('note: person %s %s %s: %s' % (preset, anim, d, e))
            return
        sc.items.append(((sy if depth is None else depth) + 0.5, im, int(round(sx - 64)), int(round(sy - 104)), 'n'))

    placed = {}
    for key, x, y in LAYOUT:
        if S(key, x, y):
            placed[key] = (x, y)
    # lamps + string lights along the boardwalk (sea-side edge y = -3.2, posts every 4 m)
    for k in range(11):
        x = -4.0 + 4.0 * k
        if 'string_lights_x' in builds and k % 3 != 2:
            m = builds['string_lights_x']
            fr = m['anims']['work']['frames'][k % 4] if not night else m['frames'][0]
            sc.put(frames[fr], m['anchorPx'], x + 2.0, -3.15)
            if night and 'string_lights_x_glow' in frames:
                sc.put(frames['string_lights_x_glow'], m['anchorPx'], x + 2.0, -3.15, kind='glow')
        if 'beach_lamp' in builds and k % 3 == 2:
            m = builds['beach_lamp']
            sc.put(frames[m['frames'][0]], m['anchorPx'], x, -1.95)
            if night and 'beach_lamp_glow' in frames:
                sc.put(frames['beach_lamp_glow'], m['anchorPx'], x, -1.95, kind='glow')
            sc.pools.append(sc.p(x, -1.95))
        if 'string_lights_x' in builds and k % 3 != 2:
            sc.pools.append(sc.p(x + 2.0, -3.15))
    # optional: the parallel beach fragment (assets/beach) - towels, parasols, loungers, palms if they exist
    beach_props(sc, night)
    # people at the sprite points
    if tf:
        def at(key, kind, k, preset, d=None, anim='idle', i=0, lib=None, depth_off=None):
            if key not in placed:
                return
            P = pts(key, kind)
            if len(P) <= k:
                return
            bx, by = placed[key]
            ax, ay = sc.p(bx, by)
            dd = d or (dirs(key, kind)[k] if len(dirs(key, kind)) > k else 'S')
            depth = (ay + depth_off) if depth_off is not None else None
            person(preset, ax + P[k][0], ay + P[k][1], d=dd, anim=anim, i=i, depth=depth, lib=lib)
        # hotel staff + guests
        at('resort_hotel', 'staff', 0, 'sailor', 'SW', 'idle', 1, depth_off=0.5)
        at('resort_hotel', 'staff', 1, 'dock_worker', 'SW', 'wave', 2, depth_off=0.5)
        at('resort_hotel', 'staff', 2, 'station', 'SW', 'talk', 3, depth_off=0.5)
        for k in range(2):
            at('resort_hotel', 'customer', k, 'tourist', 'NE', 'idle', k)
        for k in (0, 3, 5, 7):
            at('resort_hotel', 'balcony', k, 'tourist' if k % 2 else None, None, 'wave' if k == 3 else 'idle', k % 4,
               depth_off=0.5)
        for k in (1, 3):
            at('pension', 'balcony', k - 1, None, None, 'idle', 1, depth_off=0.5)
        at('pension', 'staff', 0, None, 'SW', 'wave', 1)
        at('pension', 'customer', 0, 'tourist', 'NE', 'idle', 0)
        at('beach_cafe', 'staff', 0, 'barista', 'SW', 'talk', 2, depth_off=0.5)
        for k in range(2):
            at('beach_cafe', 'customer', k, 'tourist', 'NE', 'idle', k)
        for k in (0, 2):
            at('beach_cafe', 'seat', k, None, None, 'sit', 0, lib=tf2)
        at('icecream_shop', 'staff', 0, 'barista', 'SW', 'talk', 1, depth_off=0.5)
        for k in range(3):
            at('icecream_shop', 'customer', k, 'student', 'NE', 'idle', k)
        at('seafood_bbq', 'staff', 0, 'barista', 'SW', 'idle', 0, depth_off=0.5)
        at('seafood_bbq', 'seat', 0, 'sailor', None, 'sit', 0, lib=tf2)
        at('seafood_bbq', 'customer', 0, 'tourist', 'NE', 'idle', 2)
        at('souvenir_shop', 'customer', 0, 'tourist', 'NE', 'idle', 1)
        at('swimwear_shop', 'customer', 0, None, 'NE', 'idle', 3)
        at('convenience_store', 'seat', 0, None, None, 'sit', 0, lib=tf2)
        at('convenience_store', 'seat', 4, None, None, 'sit', 0, lib=tf2)
        at('convenience_store', 'staff', 0, 'factory', 'S', 'idle', 0)
        for k in range(2):
            at('beach_arcade', 'customer', k, 'student', 'NE', 'idle', k)
        at('surf_shop', 'staff', 0, 'sailor', 'SW', 'talk', 2)
        at('beach_bar', 'staff', 0, 'barista', 'SW', 'talk', 1, depth_off=0.5)
        for k in (0, 2, 3):
            at('beach_bar', 'seat', k, 'tourist' if k else None, None, 'sit', 0, lib=tf2)
        at('lifeguard_station', 'staff', 0, 'police', 'SW', 'idle', 0, depth_off=0.5)
        at('tourist_info', 'staff', 0, 'station', 'SW', 'talk', 0, depth_off=0.5)
        at('tourist_info', 'customer', 0, 'tourist', 'NE', 'idle', 0)
        at('mini_aquarium', 'view', 0, 'student', 'NE', 'idle', 0)
        at('mini_aquarium', 'view', 2, None, 'NE', 'happy', 2)
        at('hotel_pool', 'staff', 0, 'police', 'SE', 'idle', 0)
        at('restroom_shower', 'customer', 0, None, 'NE', 'idle', 2)
        # walkers on the boardwalk and the sand
        for k in range(13):
            x = -3.0 + k * 3.3 + rnd.uniform(-0.8, 0.8)
            y = rnd.uniform(-3.1, -2.1) if k % 2 else rnd.uniform(-1.6, -0.9)
            sx, sy = sc.p(x, y)
            person(rnd.choice(['tourist', 'tourist', None, 'student', 'sailor']), sx, sy,
                   d=rnd.choice(['SE', 'NW', 'SE', 'E', 'W']), anim='walk', i=k % 8)
        for k in range(9):
            x = -1.0 + k * 4.6 + rnd.uniform(-1, 1)
            y = rnd.uniform(-9.2, -4.5)
            if any(abs(x - px) < 2.5 and abs(y - py) < 2.5 for kk, (px, py) in placed.items() if py < 0):
                continue
            sx, sy = sc.p(x, y)
            person(rnd.choice(['tourist', None, 'student']), sx, sy, d=rnd.choice(['S', 'SE', 'SW']),
                   anim=rnd.choice(['idle', 'wave', 'happy']), i=k % 4)
    return sc


def caption(img, text):
    d = ImageDraw.Draw(img)
    d.rectangle([0, img.height - 40, img.width, img.height], fill=(23, 132, 160, 255))
    d.text((16, img.height - 33), text, fill=(255, 255, 255), font=font(18))
    return img


def preview_scene(builds, frames, derived, out_day, out_night):
    sc = build_scene(builds, frames, derived)
    gr = ground(sc.W, sc.H, sc.ox, sc.oy, 0.0)
    box = sc.content_box()
    img = caption(sc.render(gr, night=False).crop(box),
                  'Sunny Beach (햇살 해변) beachfront at 1x (PPU 64): assets/beach_bld on a stand-in promenade / boardwalk; '
                  'sand + props = assets/beach, sea = static assets/water look; people = assets/townfolk (+ townfolk2 sit)')
    img.convert('RGB').save(out_day, optimize=True)
    sc2 = build_scene(builds, frames, derived, night=True)
    img2 = caption(sc2.render(gr, night=True, labels=False).crop(box),
                   'Night: sprites tinted #6B7AB8 + their <key>_glow (blend ADD); resort_hotel draws resort_hotel_night; '
                   'warm pools under the lamps / string lights (lightPoints)')
    img2.convert('RGB').save(out_night, optimize=True)
    return img, img2


# --------------------------------------------------------------------------- GIFs

def anims_gif(builds, frames, out):
    keys = [k for k in ('seafood_bbq', 'mini_aquarium', 'beach_arcade', 'string_lights_x') if k in builds and
            'anims' in builds[k]]
    if not keys:
        return
    crops = []
    for k in keys:
        m = builds[k]
        names = m['anims']['work']['frames']
        bb = [frames[n].getbbox() for n in names]
        x0 = min(b[0] for b in bb) - 6
        y0 = min(b[1] for b in bb) - 6
        x1 = max(b[2] for b in bb) + 6
        y1 = max(b[3] for b in bb) + 6
        crops.append((k, names, (x0, y0, x1, y1)))
    Wt = sum(c[2][2] - c[2][0] for c in crops) + 10 * (len(crops) + 1)
    Ht = max(c[2][3] - c[2][1] for c in crops) + 34
    seq = []
    for i in range(4):
        im = Image.new('RGBA', (Wt, Ht), (236, 222, 190, 255))
        x = 10
        d = ImageDraw.Draw(im)
        for k, names, (x0, y0, x1, y1) in crops:
            im.alpha_composite(frames[names[i % len(names)]].crop((x0, y0, x1, y1)), (x, 4))
            d.text((x, Ht - 22), '%s (%s)' % (k, builds[k].get('animAlias') or 'work'), fill=(20, 24, 32),
                   font=pp.font(13))
            x += (x1 - x0) + 10
        seq.append(im.convert('RGB'))
    _gif(seq, [180] * 4, out)


def pool_gif(builds, frames, out):
    m = builds.get('hotel_pool')
    if not m or not m.get('water'):
        return
    base = frames[m['frames'][0]]
    bb = base.getbbox()
    seq = []
    for n in m['water']['frames']:
        im = Image.new('RGBA', base.size, (241, 222, 178, 255))
        im.alpha_composite(base)
        im.alpha_composite(frames[n])
        im = im.crop(bb)
        im = im.resize((int(im.width * 1.5), int(im.height * 1.5)), Image.LANCZOS)
        seq.append(im.convert('RGB'))
    _gif(seq, [1000 // m['water']['fps']] * len(seq), out)


def hotel_daynight_gif(builds, frames, out):
    if 'resort_hotel' not in builds or 'resort_hotel_night' not in frames:
        return
    day = frames[builds['resort_hotel']['frames'][0]]
    night = frames['resort_hotel_night']
    bb = day.getbbox()
    W, H = day.size
    gr = np.zeros((H, W, 3), np.float32) + np.array([241, 222, 178], np.float32)
    seq = []
    steps = [0, 0, 0.25, 0.5, 0.75, 1, 1, 1, 0.75, 0.5, 0.25]
    for t in steps:
        bgd = Image.fromarray(gr.astype(np.uint8)).convert('RGBA')
        bgd.alpha_composite(day)
        bgn = Image.fromarray((gr * NIGHT_TINT * 0.9).astype(np.uint8)).convert('RGBA')
        bgn.alpha_composite(night)
        im = Image.blend(bgd, bgn, t).crop(bb)
        seq.append(im.convert('RGB'))
    _gif(seq, [700 if t in (0, 1) else 160 for t in steps], out)


def all_previews(builds, frames, derived, prev):
    os.makedirs(prev, exist_ok=True)
    preview_all(builds, frames, derived, os.path.join(prev, 'bbld_all.png'))
    preview_scene(builds, frames, derived, os.path.join(prev, 'bbld_scene.png'), os.path.join(prev, 'bbld_night.png'))
    anims_gif(builds, frames, os.path.join(prev, 'bbld_anims.gif'))
    pool_gif(builds, frames, os.path.join(prev, 'bbld_pool.gif'))
    hotel_daynight_gif(builds, frames, os.path.join(prev, 'bbld_hotel_daynight.gif'))
    print('previews: docs/previews/bbld_all.png, bbld_scene.png, bbld_night.png, bbld_anims.gif, bbld_pool.gif, '
          'bbld_hotel_daynight.gif')


if __name__ == '__main__':
    import tempfile
    import bbld_pack as bp
    args = sys.argv[1:]
    cache = args[args.index('--cache') + 1] if '--cache' in args else os.path.join(tempfile.gettempdir(), 'fv_cache',
                                                                                   'beach_bld')
    prev = args[args.index('--prev') + 1] if '--prev' in args else os.path.join(GAME, 'docs', 'previews')
    b, f, d = bp.load(cache)
    all_previews(b, f, d, prev)
