"""
beach_preview.py - the human previews of assets/beach (called by beach_pack.py; python3 + numpy + Pillow only):

  docs/previews/beach_all.png      every sprite (idle + one anim frame), the boats / crab in their headings and the
                                   ground decals / transition kit, labelled, at 1x
  docs/previews/beach_scene.png    a Sunny Beach composite at 1x (PPU 64): dry sand + wet band + the sea (shaded with
                                   assets/water's tropical LUT + ripple normals when present, else the harbour water),
                                   parasols, loungers, towels, sandcastles, lifeguard tower, buoy line, swan boat, kayak,
                                   banana boat, raft, palms, ice-cream cart, stands, crabs, townsfolk / beachfolk and
                                   the chief (1.45 m) for scale; sand <-> snow transition at the back
  docs/previews/beach_*.gif        the animated pieces (parasol flutter, palm sway, shower water, buoy line + raft bob,
                                   beach ball, kite, carts, sandcastle build stages, boats, crab)
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import prop_pack as pp   # noqa: E402
import harbor_pack as hp  # noqa: E402

KX, KY, KZ = 45.2548, 22.6274, 55.4256
SQ2 = math.sqrt(2.0)
WATER_PX = 30
SLOPE_TOP = 2.4          # the beach slopes from the dry sand (y = SLOPE_TOP, z 0) down to the waterline (y 0, z -0.55)


def slope_dz(y):
    """Screen-y offset (px, + = down) of the slope surface at world y (0 .. SLOPE_TOP)."""
    return WATER_PX * max(0.0, min(1.0, 1.0 - y / SLOPE_TOP))
SAND_BG = (241, 227, 196)


def font(size):
    return hp.kfont(size)


def first_frame(m):
    return m['frames'][0]


# --------------------------------------------------------------------------- atlas readers

BEACH_DIR = os.path.join(ASSETS, 'beach')


def atlas_reader(rel):
    if rel == 'beach/manifest.json':
        return beach_reader()
    import bld_pack as bp
    return bp.atlas_lib(rel)


def beach_reader():
    """(manifest, get) for the beach output dir (beach_pack --out), atlases resolved there first, then assets/."""
    path = os.path.join(BEACH_DIR, 'manifest.json')
    if not os.path.exists(path):
        return None
    man = json.load(open(path, encoding='utf-8'))
    cache = {}

    def sheet(akey):
        if akey not in cache:
            a = next((x for x in man.get('atlases', []) if x['key'] == akey), None)
            if a is None:
                cache[akey] = None
            else:
                png = os.path.join(BEACH_DIR, os.path.basename(a['png']))
                js = os.path.join(BEACH_DIR, os.path.basename(a['json']))
                if not os.path.exists(png):
                    png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
                cache[akey] = (Image.open(png).convert('RGBA'), json.load(open(js))['frames'])
        return cache[akey]

    def get(akey, name):
        s = sheet(akey)
        if not s or name not in s[1]:
            return None
        f = s[1][name]
        r = f['frame']
        crop = s[0].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        im.paste(crop, (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        return im
    return man, get


class Chars:
    """Frames of existing characters (chief, villagers) for scale."""

    def __init__(self):
        self.libs = {}

    def get(self, rel, key, anim, d, i):
        if rel not in self.libs:
            self.libs[rel] = atlas_reader(rel)
        lib = self.libs[rel]
        if not lib:
            return None
        man, get = lib
        c = man.get('characters', {}).get(key)
        if not c:
            return None
        flip = d in ('SW', 'W', 'NW')
        rd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d)
        im = get(c['atlas'], c['frameName'].format(anim=anim, dir=rd, i=i))
        if im is None:
            return None
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        ax = c['anchor'][0] * c['frameSize'][0]
        if flip:
            ax = c['frameSize'][0] - ax
        return im, (ax, c['anchor'][1] * c['frameSize'][1])


class People:
    """Townsfolk / beachfolk composers with graceful fallbacks (beachfolk -> townfolk2 -> townfolk), per person: a
    fragment that is still being packed (layers missing on disk) simply hands the person to the next composer."""

    def __init__(self):
        self.tfs = []
        for mod, cls in (('beachfolk_compose', 'Beachfolk'), ('townfolk2_compose', 'Townfolk2'),
                         ('townfolk_compose', 'Townfolk')):
            try:
                self.tfs.append((cls, getattr(__import__(mod), cls).from_assets()))
            except Exception as e:      # noqa: BLE001
                print('note: %s unavailable (%s)' % (cls, str(e)[:120]))
        self.used = []

    @property
    def kind(self):
        return ' + '.join(c for c in dict.fromkeys(self.used)) or (self.tfs[0][0] if self.tfs else None)

    def person(self, preset=None, seed=0):
        for cls, tf in self.tfs:
            presets = (tf.T.get('generator') or {}).get('presets', {})
            try:
                p = tf.preset(preset, seed=seed) if preset and preset in presets else tf.random_person(seed)
                im = tf.compose(p, 'idle', 'S', 0)  # proves this person's layers are on disk ...
            except Exception:       # noqa: BLE001
                continue
            # ... and that the legs / feet are there (a half-packed fragment silently drops missing layers)
            if int((np.asarray(im.convert('RGBA'))[92:108, :, 3] > 128).sum()) < 100:
                continue
            return (cls, tf, p)
        return None

    def frame(self, pp, anim, d, i=0):
        if pp is None:
            return None
        cls, tf, p = pp
        info = (tf.T.get('anims') or {}).get(anim)
        if not info:
            return None
        rd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d)
        if rd not in info.get('dirs', ['S', 'SE', 'E', 'NE', 'N']):
            return None
        try:
            if hasattr(tf, 'can_play') and not tf.can_play(p, anim):
                return None
            im = tf.compose(p, anim, d, i % info['frames'])
        except Exception as e:      # noqa: BLE001
            print('note: %s compose %s %s failed (%s)' % (cls, anim, d, str(e)[:80]))
            return None
        self.used.append(cls)
        return im, (64, 104)


# --------------------------------------------------------------------------- beach_all

def preview_all(builds, frames, chars, cframes, man, out):
    import beach_pack as bk
    ents = []
    order = sorted(builds, key=lambda k: (bk.ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in
                                          bk.ATLAS_ORDER else 99, list(builds).index(k)))
    for k in order:
        m = builds[k]
        sprites = m.get('sprites') or {k: {'frame': m['frames'][0]}}
        def panel(im, m=m):
            if m.get('ground') == 'water' or m.get('tileAxis'):
                bb = im.getbbox() or (0, 0, 1, 1)
                im = im.crop(bb)
                bgc = (88, 196, 204, 255) if m.get('ground') == 'water' else SAND_BG + (255,)
                bg = Image.new('RGBA', (im.width + 16, im.height + 16), bgc)
                bg.alpha_composite(im, (8, 8))
                im = bg
            return im
        for sk, sd in sprites.items():
            ents.append((sk, panel(frames[sd['frame']])))
        for an, ad in (m.get('anims') or {}).items():
            if an == 'work':
                continue
            n = ad['frames'][len(ad['frames']) // 2]
            ents.append(('%s (%s)' % (k, an), panel(frames[n])))
        if m.get('overlay'):
            ents.append((m['overlay']['key'], frames[m['overlay']['key']]))
    for k, m in chars.items():
        for d in m['dirs'][:5]:
            an = list(m['anims'])[-1]
            n = '%s_%s_1' % (an, d)
            im = cframes[k].get(n)
            if im is None:
                continue
            if m['kind'] == 'ship':
                bb = im.getbbox() or (0, 0, 1, 1)
                im = im.crop(bb)
                bg = Image.new('RGBA', (im.width + 16, im.height + 16), (88, 196, 204, 255))
                bg.alpha_composite(im, (8, 8))
                im = bg
            ents.append(('%s %s %s' % (k, an, d), im))
    # ground decals + kit from the manifest (written by gen_beach_ground.py)
    lib = atlas_reader('beach/manifest.json')
    if lib:
        mm, get = lib
        for k, e in mm.get('sprites', {}).items():
            if e.get('generator') == 'gen_beach_ground' and 'atlas' in e and (not k[-2:] in ('_1', '_2')):
                im = get(e['atlas'], e['frame'])
                if im is None:
                    continue
                bb = im.getbbox() or (0, 0, 1, 1)
                im = im.crop(bb)
                bgc = (244, 247, 251, 255) if k.startswith('ground_sand_snow') else SAND_BG + (255,)
                bg = Image.new('RGBA', (im.width + 12, im.height + 12), bgc)
                bg.alpha_composite(im, (6, 6))
                ents.append((k, bg))
    pp.shelf_preview(ents, out, max_w=2600, bg=(176, 190, 206),
                     title='Sunny Beach - assets/beach at 1x, PPU 64: props (idle + one anim frame), boats '
                           '/ crab (characters-style), ground decals + sand<->snow kit. Water props on turquoise.')


# --------------------------------------------------------------------------- water shading (preview of Water.js)

class WaterTex:
    def __init__(self):
        self.ok = False
        try:
            self.lut = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_lut.png')).convert('RGBA'),
                                  np.float32) / 255.0
            self.wa = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_waves_a.png')).convert('RGB'),
                                 np.float32) / 255.0
            self.wb = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_waves_b.png')).convert('RGB'),
                                 np.float32) / 255.0
            self.foam = np.asarray(Image.open(os.path.join(ASSETS, 'water', 'water_foam.png')).convert('L'),
                                   np.float32) / 255.0
            man = json.load(open(os.path.join(ASSETS, 'water', 'manifest.json')))
            self.pal = man['palettes']['tropical']
            self.ok = True
        except Exception as e:      # noqa: BLE001
            print('note: assets/water not usable (%s) - harbour water in the preview' % str(e)[:80])


def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def sample(tex, u, v):
    H, W = tex.shape[:2]
    x = np.mod(np.floor(u).astype(np.int64), W)
    y = np.mod(np.floor(v).astype(np.int64), H)
    return tex[y, x]


def render_sea(W, H, ox, oy, depth_fn, sand_rgb, wt):
    """RGB sea at every pixel: screen -> sea-plane world (x, y), depth -> tropical LUT over the sand bottom, ripple
    normals (two scrolling layers frozen) -> sky reflection + sun glints, caustics in the shallows, foam lace at the
    swash.  Returns (rgb float HxWx3, sea mask HxW)."""
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    a = (X - ox) / KX
    b = (Y - oy - WATER_PX) / KY
    x, y = (a + b) / 2, (a - b) / 2
    depth = depth_fn(x, y)
    sea = depth > 0
    gx, gy = X, 2 * (Y - WATER_PX)
    if wt.ok:
        pal = wt.pal
        u = 1.0 - np.exp(-np.maximum(depth, 0) / pal['depthScale'])
        lut = wt.lut[pal['row']]
        idx = np.clip((u * (lut.shape[0] - 1)).astype(np.int32), 0, lut.shape[0] - 1)
        col = lut[idx, :3]
        op = lut[idx, 3]
        nA = sample(wt.wa, gx, gy)
        nB = sample(wt.wb, gx * (256 / 192.0), gy * (256 / 192.0))
        nx = (nA[..., 0] - 0.5) * 2 + (nB[..., 0] - 0.5) * 1.2
        ny = (nA[..., 1] - 0.5) * 2 + (nB[..., 1] - 0.5) * 1.2
        caust = nA[..., 2] * 0.6 + nB[..., 2] * 0.4
        bottom = sand_rgb * (1 - 0.25 * caust[..., None] * pal['caustic'] * (1 - op[..., None])) + \
            0.25 * caust[..., None] * (1 - op[..., None]) * pal['caustic']
        rgb = bottom * (1 - op[..., None]) + col * op[..., None]
        fres = np.clip(0.18 + 0.35 * (-ny * 0.6 - nx * 0.25), 0, 0.5)
        sky = hexf(pal['skyLo']) * (1 - np.clip(-ny, 0, 1))[..., None] + hexf(pal['skyHi']) * np.clip(-ny, 0, 1)[
            ..., None]
        rgb = rgb * (1 - fres[..., None] * op[..., None]) + sky * (fres[..., None] * op[..., None])
        glint = np.clip((-nx * 0.55 - ny * 0.85) * 1.6 - 1.05, 0, 1) ** 2 * op
        rgb = rgb + glint[..., None] * hexf(pal['sun']) * 0.9
        # swash foam: lace from the foam texture near the waterline + a bright broken edge
        lace = sample(wt.foam, gx * 0.9, gy * 0.9)
        swash = np.exp(-(depth / 0.12) ** 2)
        band = np.clip((lace - (1 - swash * 0.95)) * 6, 0, 1)
        edge = np.exp(-((depth - 0.03 - 0.025 * np.sin(x * 3.1) - 0.02 * np.sin(x * 7.7 + 1)) / 0.022) ** 2)
        second = np.exp(-((depth - 0.32 - 0.04 * np.sin(x * 1.7 + 2)) / 0.03) ** 2) * np.clip(lace * 1.6 - 0.4, 0, 1)
        f = np.clip(band * 0.85 + edge * 0.95 + second * 0.7, 0, 1)
        rgb = rgb * (1 - f[..., None]) + hexf(pal['foam']) * f[..., None]
    else:
        tex = np.asarray(Image.open(os.path.join(ASSETS, 'ground', 'water_sea.png')).convert('RGB'),
                         np.float32) / 255.0
        rgb = sample(tex, X, Y)
    return np.clip(rgb, 0, 1), sea


# --------------------------------------------------------------------------- scene

class Scene:
    def __init__(self, W, H, ox, oy):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.ground = []
        self.items = []
        self.labels = []

    def p(self, x, y, z=0.0):
        return self.ox + (x + y) * KX, self.oy + (x - y) * KY - z * KZ

    def put(self, im, anchor_px, x, y, water=False, bias=0.0, ground=False, depth=None, dz=0.0):
        sx, sy = self.p(x, y)
        if water:
            sy += WATER_PX
        elif y < SLOPE_TOP:
            sy += slope_dz(y)
        sy += dz
        d = (sy + bias) if depth is None else depth
        item = (d, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])))
        (self.ground if ground else self.items).append(item)
        return sx, sy

    def put_px(self, im, anchor_px, sx, sy, depth, ground=False):
        item = (depth, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])))
        (self.ground if ground else self.items).append(item)

    def label(self, text, x, y, z=0.0, dy=0, water=False):
        sx, sy = self.p(x, y, z)
        self.labels.append((text, sx, sy + dy + (WATER_PX if water else 0)))


def tile_tex(tex, W, H):
    t = Image.new('RGBA', (W, H))
    for ty in range(0, H, tex.height):
        for tx in range(0, W, tex.width):
            t.paste(tex, (tx, ty))
    return t


def preview_scene(builds, frames, chars, cframes, man, out):
    """Sunny Beach mock at 1x.  World metres: the shoreline runs along world X at y = 0, the sea at y < 0 (screen
    down-left, 0.55 m below the land), dry sand y 1.3 .. 11.3, snow beyond with the sand<->snow kit."""
    lib = atlas_reader('beach/manifest.json')
    mm, getb = lib
    sp = mm['sprites']
    W, H = 2600, 1500
    ox, oy = 1180, 760
    sc = Scene(W, H, ox, oy)
    people = People()
    chs = Chars()
    rnd = random.Random(7)

    def spr(key, frame=None):
        e = sp[key]
        im = getb(e['atlas'], frame or e['frame'])
        return im, (e['anchor'][0] * e['frameSize'][0], e['anchor'][1] * e['frameSize'][1])

    # ---------- ground: snow / sand by cells (cell grid of the kit), wet band + slope face, sea
    sand_tex = Image.open(os.path.join(ASSETS, 'beach', 'ground_sand.png')).convert('RGBA')
    wet_tex = Image.open(os.path.join(ASSETS, 'beach', 'ground_sand_wet.png')).convert('RGBA')
    snow_p = os.path.join(ASSETS, 'ground', 'ground_snow.png')
    snow_tex = Image.open(snow_p).convert('RGBA') if os.path.exists(snow_p) else Image.new('RGBA', (64, 64),
                                                                                           (244, 247, 251, 255))
    img = tile_tex(snow_tex, W, H)
    # grid cells (i along X, j along Y), cell min corner at world (i*SQ2, j*SQ2); sand for j <= 7 except a few
    I0, I1, J0, J1 = -17, 16, -8, 13

    def is_sand(i, j):
        if j < 0:
            return True                       # beach slope / under water (drawn over)
        if j <= 7:
            return not ((j == 7 and i in (-13, -12, -6, -5, 4, 11, 12)) or (j == 6 and i in (-13, 12)))
        return j == 8 and i in (-1, 0, 1, 7, 8)

    def L(i, j):
        return sc.p(i * SQ2, j * SQ2)
    mask = Image.new('L', (W, H), 0)
    dr = ImageDraw.Draw(mask)
    for j in range(J0, J1):
        for i in range(I0, I1):
            if is_sand(i, j):
                dr.polygon([L(i, j), L(i + 1, j), L(i + 1, j + 1), L(i, j + 1)], fill=255)
    img.paste(tile_tex(sand_tex, W, H), (0, 0), mask)
    # transition kit along every sand / snow cell edge (rules of sandKit)
    owned = set()
    pieces = []
    for j in range(J0, J1 + 1):
        for i in range(I0, I1 + 1):
            q = {(-1, 1): is_sand(i - 1, j), (1, 1): is_sand(i, j), (1, -1): is_sand(i, j - 1),
                 (-1, -1): is_sand(i - 1, j - 1)}
            snow_q = [k for k, v in q.items() if not v]
            name = None
            if len(snow_q) == 1:
                qx, qy = snow_q[0]
                name = 'ground_sand_snow_corner_' + {(-1, 1): 'n', (1, 1): 'e', (1, -1): 's', (-1, -1): 'w'}[(qx, qy)]
            elif len(snow_q) == 3:
                qx, qy = [k for k, v in q.items() if v][0]
                name = 'ground_sand_snow_inner_' + {(-1, 1): 'n', (1, 1): 'e', (1, -1): 's', (-1, -1): 'w'}[(qx, qy)]
            if name:
                pieces.append((name, L(i, j)))
                owned.add(('x', i if qx > 0 else i - 1, j))
                owned.add(('y', i, j if qy > 0 else j - 1))
    for j in range(J0, J1 + 1):
        for i in range(I0, I1 + 1):
            a_, b_ = is_sand(i, j - 1), is_sand(i, j)
            v = (i * 7 + j * 13) % 3
            if a_ != b_ and ('x', i, j) not in owned:
                nm = 'ground_sand_snow_edge_x' if not b_ else 'ground_sand_snow_edge_x_near'
                p = L(i, j)
                pieces.append((nm if v == 0 else '%s_%d' % (nm, v), (p[0] + 32, p[1] + 16)))
            a_, b_ = is_sand(i - 1, j), is_sand(i, j)
            if a_ != b_ and ('y', i, j) not in owned:
                nm = 'ground_sand_snow_edge_y' if not a_ else 'ground_sand_snow_edge_y_near'
                p = L(i, j)
                pieces.append((nm if v == 0 else '%s_%d' % (nm, v), (p[0] + 32, p[1] - 16)))
    for name, (px, py) in pieces:
        if name in sp:
            im, an = spr(name)
            img.alpha_composite(im, (int(round(px - an[0])), int(round(py - an[1]))))
    # the beach slope: dry sand at y = SLOPE_TOP (z 0) down to the waterline (y 0, z -0.55): per pixel find the slope
    # parameter t, blend dry -> damp -> wet sand (the Water module draws its own animated wet band in the game)
    Yp, Xp = np.mgrid[0:H, 0:W].astype(np.float32)
    A = (Xp - ox) / KX
    t = (Yp - oy - KY * (A - 2 * SLOPE_TOP)) / (2 * SLOPE_TOP * KY + WATER_PX)
    band = (t >= 0) & (t <= 1.0)
    sand_a = np.asarray(img.convert('RGB'), np.float32) / 255.0
    sand_l = np.asarray(tile_tex(sand_tex, W, H).convert('RGB'), np.float32) / 255.0
    wet_a = np.asarray(tile_tex(wet_tex, W, H).convert('RGB'), np.float32) / 255.0
    tt = np.clip(t, 0, 1)
    k = np.clip((tt - 0.1) / 0.55, 0, 1)
    k = k * k * (3 - 2 * k)
    slope = sand_l * (1 - k[..., None]) + wet_a * k[..., None]
    slope *= (1.0 - 0.1 * tt ** 2)[..., None]
    out_a = np.where(band[..., None], slope, sand_a)
    img = Image.fromarray((np.clip(out_a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').convert('RGBA')
    X0, X1 = I0 * SQ2 - 2, I1 * SQ2 + 2
    wt = WaterTex()
    sand_rgb = wet_a

    def depth_fn(x, y):
        return np.clip(-y * 0.16 - 0.02 * np.sin(x * 0.7) - 0.015 * np.sin(x * 2.3), -1, 4)
    sea_rgb, sea = render_sea(W, H, ox, oy, depth_fn, sand_rgb, wt)
    sea_im = Image.fromarray((sea_rgb * 255 + 0.5).astype(np.uint8), 'RGB').convert('RGBA')
    smask = Image.fromarray((sea * 255).astype(np.uint8), 'L')
    img.paste(sea_im, (0, 0), smask)
    # ---------- decals (ground layer)
    for key, x, y in (('decal_towel_blue', -9.0, 3.6), ('decal_towel_red_x', 5.2, 3.8), ('decal_towel_yellow', 9.2, 6.6),
                      ('decal_towel_green_x', -3.8, 7.2), ('decal_shells', 3.2, 1.6), ('decal_seaweed', -6.5, 1.75),
                      ('decal_footprints_sand', -1.0, 5.6), ('decal_sand_ripples', -12.0, 6.0),
                      ('decal_shells', -11.5, 2.6), ('decal_volleyball_court', 13.5, 5.5)):
        if key in sp:
            im, an = spr(key)
            sc.put(im, an, x, y, ground=True)
    # boardwalk along Y from the snow edge down to the beach (x = -0.7 m): end at the sea side
    if 'boardwalk_y' in sp:
        xb = -0.7
        for k in range(6):
            yb = 11.5 - k * SQ2
            im, an = spr('boardwalk_y')
            sc.put(im, an, xb, yb, ground=True, depth=-1000 + k)
        im, an = spr('boardwalk_end_yn')
        sc.put(im, an, xb, 11.5 - 6 * SQ2, ground=True, depth=-990)
    # ---------- props
    labels = []

    def prop(key, x, y, label=None, water=False, frame=None, bias=0.0):
        if key not in sp:
            return None
        im, an = spr(key, frame)
        r = sc.put(im, an, x, y, water=water, bias=bias)
        if label:
            labels.append((label, x, y, water))
        return r

    def person(img_anchor, x, y, water=False, bias=0.5, dz=0.0):
        if img_anchor:
            im, an = img_anchor
            sc.put(im, an, x, y, water=water, bias=bias, dz=dz)

    # shade row: parasols with loungers in their shade, chairs, towels
    k = 1.72
    for key, x, y in (('parasol_red', -8.5, 5.0), ('parasol_blue', -3.0, 4.6), ('parasol_rainbow', 2.6, 5.8),
                      ('parasol_yellow', 8.0, 8.0), ('parasol_green', -11.0, 8.4), ('parasol_pink', 5.6, 9.2)):
        prop(key, x, y, key)
    prop('sun_lounger', -8.5 + k, 5.0, 'sun_lounger')
    prop('sun_lounger', -8.5 + k, 3.9)
    prop('sun_lounger_x', -3.0 + k, 4.5, 'sun_lounger_x')
    prop('beach_chair_folding', 2.6 + k, 5.4, 'beach_chair_folding')
    prop('beach_chair_folding_x', 2.6 + k - 0.1, 6.6)
    prop('swim_ring_duck', 4.6, 4.4, 'swim_ring_duck')
    prop('swim_ring_donut', -6.2, 2.9, 'swim_ring_donut')
    prop('swim_ring_red', 0.6, 2.2)
    # play: sandcastles, ball, bucket, kite, net
    prop('sandcastle_l', -1.5, 2.3, 'sandcastle_l')
    prop('sandcastle_build_2', 6.3, 2.4, 'sandcastle_build')
    prop('sandcastle_s', 9.8, 2.6)
    prop('sandcastle_m', -12.0, 3.4, 'sandcastle_m')
    prop('bucket_spade', 7.5, 3.0)
    prop('beach_ball_bounce', 1.6, 7.6, 'beach_ball_bounce', frame='beach_ball_bounce_bounce_3')
    prop('volleyball_net', 13.5, 5.5, 'volleyball_net')
    prop('surfboard_rack', 9.8, 10.2, 'surfboard_rack')
    # service: lifeguard tower + rescue gear, carts, stands, shower, booth, signs
    prop('lifeguard_tower', 1.8, 3.4, 'lifeguard_tower')
    prop('rescue_board', 4.0, 3.2)
    prop('rescue_buoy_stand', -0.6, 3.6)
    prop('icecream_cart', -6.2, 8.8, 'icecream_cart')
    prop('corn_stand', 12.5, 10.0, 'corn_stand')
    prop('rental_stand', -2.6, 9.6, 'rental_stand')
    prop('beach_shower', -13.6, 8.8, 'beach_shower', frame='beach_shower_water_1')
    prop('changing_booth', -14.0, 11.2, 'changing_booth')
    prop('beach_sign_board', -1.9, 4.2)
    prop('beach_sign_arrow', 1.4, 11.6, 'beach_sign_arrow')
    prop('beach_sign_notice', -4.4, 11.6)
    prop('beach_swing', 15.2, 9.8, 'beach_swing')
    prop('picnic_table_beach', -9.6, 10.6, 'picnic_table_beach')
    # nature
    prop('palm_tree_a', -5.6, 10.6, 'palm_tree_a', frame='palm_tree_a_sway_1')
    prop('palm_tree_b', 3.6, 11.3, 'palm_tree_b')
    prop('palm_tree_a', 18.2, 8.0, frame='palm_tree_a_sway_3')
    prop('beach_pine', -12.8, 13.6, 'beach_pine')
    for key, x, y in (('dune_grass_c', -7.5, 12.4), ('dune_grass_b', 7.0, 12.2), ('dune_grass_a', 0.2, 12.6),
                      ('dune_grass_b', -2.6, 12.9), ('dune_grass_a', 11.2, 11.9), ('dune_grass_c', 13.2, 12.0)):
        prop(key, x, y)
    prop('driftwood', -4.5, 1.9, 'driftwood')
    prop('starfish', 8.6, 1.5)
    # water: buoy line, raft, boats
    yb = -6.4
    xs = [-9.0 + n * SQ2 for n in range(13)]
    for xb in xs:
        prop('swim_buoy_line_x', xb, yb, water=True, frame='swim_buoy_line_x_bob_1', bias=-5)
    prop('swim_buoy_line_end', xs[0] - SQ2 / 2, yb, water=True, frame='swim_buoy_line_end_bob_1')
    prop('swim_buoy_line_end', xs[-1] + SQ2 / 2, yb, water=True, frame='swim_buoy_line_end_bob_1')
    labels.append(('swim_buoy_line_x', 0.0, yb, True))
    prop('float_raft', -4.0, -4.0, 'float_raft', water=True, frame='float_raft_bob_1')
    # ---------- characters-style: boats, crab
    def char_img(key, anim, d, i):
        m = chars.get(key)
        if not m:
            return None
        flip = d in ('SW', 'W', 'NW')
        rd = m['mirror'].get(d, d)
        n = '%s_%s_%d' % (anim, rd, i)
        im = cframes[key].get(n)
        if im is None:
            return None
        ax, ay = m['anchorPx']
        ov = cframes[key].get('over_' + n)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            ov = ov.transpose(Image.FLIP_LEFT_RIGHT) if ov is not None else None
            ax = m['frameSize'][0] - ax
        return im, (ax, ay), ov

    def boat(key, anim, d, i, x, y, riders=None, label=None):
        r = char_img(key, anim, d, i)
        if not r:
            return
        im, an, ov = r
        sx, sy = sc.p(x, y)
        sy += WATER_PX
        depth = sy
        wake = os.path.join(ASSETS, 'water', 'fx_wake_v2.png')
        sc.put_px(im, an, sx, sy, depth)
        m = chars[key]
        if riders and m.get('seats'):
            rd = m['mirror'].get(d, d)
            flip = d in ('SW', 'W', 'NW')
            order = m['seatDrawOrder'][rd]
            for kk, si in enumerate(order):
                pe = riders[si % len(riders)]
                sd = m['seatDirs'][rd][si]
                sd = {'SE': 'SW', 'E': 'W', 'NE': 'NW', 'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(sd, sd) if flip else sd
                fr = people.frame(pe, 'sit', sd, 0)
                pt = m['seats'][rd][si]
                if fr is None:
                    fr = people.frame(pe, 'idle', sd, 0)
                    pt = m['seatsStand'][rd][si]
                if fr is None:
                    continue
                dx = -pt[0] if flip else pt[0]
                sc.put_px(fr[0], fr[1], sx + dx, sy + pt[1], depth + 0.1 + kk * 0.01)
            if ov is not None:
                sc.put_px(ov, an, sx, sy, depth + 0.5)
        if wake and os.path.exists(wake) and anim == 'move' and d in ('SE', 'SW'):
            sheet = Image.open(wake).convert('RGBA')
            fw = 256
            w = sheet.crop((fw * 2, 0, fw * 3, 176))
            if d == 'SW':
                w = w.transpose(Image.FLIP_LEFT_RIGHT)
            sc.put_px(w, (128, 88), sx, sy, depth - 50, ground=True)
        if label:
            labels.append((label, x, y, True))

    rp = [people.person('swimmer', 3), people.person('tourist', 5), people.person(None, 11), people.person(None, 12)]
    boat('swan_pedal_boat', 'move', 'SE', 1, 6.5, -3.4, riders=rp[:2], label='swan_pedal_boat (riders + overlay)')
    boat('swan_pedal_boat', 'idle', 'SW', 0, 11.5, -2.2)
    boat('kayak_crew', 'move', 'NE', 2, -9.5, -2.6, label='kayak_crew')
    boat('kayak', 'idle', 'SE', 0, -12.0, -0.9, label='kayak')
    boat('banana_boat_crew', 'move', 'SE', 1, 1.0, -11.8, label='banana_boat_crew (towed)')
    if os.path.exists(os.path.join(ASSETS, 'ships', 'manifest.json')):
        r = Chars().get('ships/manifest.json', 'yacht', 'move', 'SE', 1)
        if r:
            im, an = r
            sx, sy = sc.p(7.5, -11.8)
            sc.put_px(im, an, sx, sy + WATER_PX, sy + WATER_PX)
            m = chars.get('banana_boat_crew')
            if m:
                tp = m['towPoint']['SE']
                bx, by = sc.p(1.0, -11.8)
                by += WATER_PX
                tx, ty = sc.p(7.5 - 3.3, -11.8)
                line = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                ImageDraw.Draw(line).line([(bx + tp[0], by + tp[1]), (tx, ty + WATER_PX - 8)], fill=(250, 248, 240,
                                                                                                     230), width=2)
                sc.ground.append((9e9, line, 0, 0))
    for (x, y, d, i) in ((-2.8, 0.9, 'E', 2), (8.2, 1.2, 'SE', 0), (-10.0, 1.6, 'S', 3), (12.0, 3.2, 'NE', 1)):
        r = char_img('crab', 'walk', d, i)
        if r:
            sc.put(r[0], r[1], x, y, bias=0.3)
    labels.append(('crab', -2.8, 0.9, False))
    # ---------- people: the chief, villagers, townsfolk / beachfolk
    ch = chs.get('characters/manifest.json', 'player', 'idle', 'S', 0)
    if ch:
        sc.put(ch[0], ch[1], -0.7, 5.6, bias=0.5)
        labels.append(('chief 1.45 m', -0.7, 5.6, False))
    for key, x, y, d in (('villager_a', -5.6, 6.4, 'SE'), ('villager_b', 10.4, 6.6, 'SW'),
                         ('villager_c', -11.6, 6.0, 'E')):
        r = chs.get('characters/manifest.json', key, 'idle', d, 1)
        if r:
            sc.put(r[0], r[1], x, y, bias=0.5)
    tower = sp.get('lifeguard_tower')
    if tower:
        guard = people.person('lifeguard', 2)
        fr = people.frame(guard, 'idle', 'SW', 0)
        if fr:
            tx, ty = sc.p(1.8, 3.4)
            stp = tower['staffPoints'][0]
            sc.put_px(fr[0], fr[1], tx + stp[0], ty + stp[1], ty + 0.5)
            ov, oan = spr('lifeguard_tower_front')
            sc.put_px(ov, oan, tx, ty, ty + 1.0)
    # sunbathers on loungers / towels (beachfolk sunbathe if present, else a sitter on the side rail)
    for key, x, y in (('sun_lounger', -8.5 + k, 5.0), ('sun_lounger_x', -3.0 + k, 4.5)):
        e = sp.get(key)
        if not e:
            continue
        pe = people.person('sunbather', int(x * 10))
        d = e['lyingDirs'][0]
        fr = people.frame(pe, 'sunbathe', d, 0) or people.frame(pe, 'sunbathe', 'SE', 0)
        bx, by = sc.p(x, y)
        if fr:
            lp = e['lyingPoints'][0]
            sc.put_px(fr[0], fr[1], bx + lp[0], by + lp[1], by + 0.5)
        else:
            sd = e['seatDirs'][0]
            fr = people.frame(pe, 'sit', sd, 0)
            if fr:
                lp = e['seatPoints'][0]
                sc.put_px(fr[0], fr[1], bx + lp[0], by + lp[1], by + 0.5)
    # deck chair sitter
    e = sp.get('beach_chair_folding')
    if e:
        pe = people.person('tourist', 21)
        fr = people.frame(pe, 'sit', e['seatDirs'][0], 1)
        if fr:
            bx, by = sc.p(2.6 + k, 5.4)
            lp = e['seatPoints'][0]
            sc.put_px(fr[0], fr[1], bx + lp[0], by + lp[1], by + 0.5)
    # kids digging at the sandcastles
    for key, x, y in (('sandcastle_l', -1.5, 2.3), ('sandcastle_build_2', 6.3, 2.4)):
        e = sp.get(key)
        if not e:
            continue
        bx, by = sc.p(x, y)
        for n, (wp, wd) in enumerate(zip(e.get('workPoints', [])[:2], e.get('workDirs', [])[:2])):
            pe = people.person('family_beach', 40 + n + int(x)) or people.person(None, 40 + n)
            fr = people.frame(pe, 'dig', wd, n) or people.frame(pe, 'idle', wd, n)
            if fr:
                sc.put_px(fr[0], fr[1], bx + wp[0], by + wp[1], by + wp[1] + 0.5)
    # ice-cream vendor + queue
    e = sp.get('icecream_cart')
    if e:
        bx, by = sc.p(-6.2, 8.8)
        v = people.person('icecream_vendor', 3)
        fr = people.frame(v, 'idle', e['staffDirs'][0], 0)
        if fr:
            sp0 = e['staffPoints'][0]
            sc.put_px(fr[0], fr[1], bx + sp0[0], by + sp0[1], by + sp0[1])
        for n, (cp, cd) in enumerate(zip(e['customerPoints'], e['customerDirs'])):
            pe = people.person('tourist', 60 + n)
            fr = people.frame(pe, 'idle', cd, n)
            if fr:
                sc.put_px(fr[0], fr[1], bx + cp[0], by + cp[1], by + cp[1])
    # swimmers in the water + a few strollers
    for n, (x, y) in enumerate(((-6.5, -2.2), (-0.5, -3.6), (3.2, -5.0), (9.0, -4.6))):
        pe = people.person('swimmer', 80 + n)
        fr = people.frame(pe, 'swim', ['SE', 'S', 'SW', 'E'][n], n)
        if fr:
            rip = os.path.join(ASSETS, 'water', 'fx_swim_ripple.png')
            sx, sy = sc.p(x, y)
            sy += WATER_PX
            if os.path.exists(rip):
                sh = Image.open(rip).convert('RGBA').crop((128 * (n % 4), 0, 128 * (n % 4) + 128, 64))
                sc.put_px(sh, (64, 32), sx, sy, sy - 1)
            sc.put_px(fr[0], fr[1], sx, sy, sy)
    for n, (x, y, d) in enumerate(((-7.2, 6.6, 'E'), (4.2, 7.2, 'SW'), (11.6, 4.4, 'NE'), (14.8, 6.8, 'NW'),
                                   (12.4, 4.0, 'SE'), (-3.6, 2.8, 'S'))):
        pe = people.person(['tourist', 'swimmer', None, None, 'surfer', 'sunbather'][n], 100 + n)
        fr = people.frame(pe, 'walk' if n < 2 else 'idle', d, n)
        if fr:
            sc.put(fr[0], fr[1], x, y, bias=0.5)
    # kite above a kid
    if 'kite' in sp:
        kx, ky = 9.0, 6.0
        pe = people.person(None, 140)
        fr = people.frame(pe, 'idle', 'NE', 0)
        if fr:
            sc.put(fr[0], fr[1], kx, ky, bias=0.5)
        im, an = spr('kite', 'kite_fly_2')
        hx, hy = sc.p(kx, ky, 1.0)
        tx, ty = hx - 120, hy - 330
        line = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(line).line([(hx, hy), (tx, ty)], fill=(255, 255, 255, 200), width=1)
        sc.items.append((9e9 - 1, line, 0, 0))
        sc.put_px(im, an, tx, ty, 9e9)
        labels.append(('kite', kx, ky + 1.2, False))
    # ---------- composite
    for lst in (sc.ground, sc.items):
        for _, im, px, py in sorted(lst, key=lambda t: t[0]):
            if im.size == (W, H):
                img.alpha_composite(im)
            else:
                _paste_clip(img, im, px, py)
    d = ImageDraw.Draw(img)
    f = font(13)
    for text, x, y, water in labels:
        sx, sy = sc.p(x, y)
        sy += (WATER_PX if water else 0) + 6
        tw = f.getlength(text)
        d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7, fill=(255, 255, 255, 205))
        d.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
    img = img.crop((40, 110, W - 40, H - 30))
    d = ImageDraw.Draw(img)
    d.rectangle([0, img.height - 40, img.width, img.height], fill=(20, 140, 160, 255))
    cap = ('Sunny Beach (햇살 해변) mock at 1x (PPU 64): assets/beach props + ground (sand, wet band, sand<->snow kit, '
           'decals), sea = assets/water tropical LUT + ripples (static), people = %s + the chief' %
           (people.kind or 'none'))
    d.text((14, img.height - 32), cap, fill=(255, 255, 255), font=font(17))
    img.convert('RGB').save(out, optimize=True)
    return people.kind


def _paste_clip(dst, im, px, py):
    x0, y0 = max(0, -px), max(0, -py)
    x1 = min(im.width, dst.width - px)
    y1 = min(im.height, dst.height - py)
    if x1 <= x0 or y1 <= y0:
        return
    dst.alpha_composite(im.crop((x0, y0, x1, y1)), (max(0, px), max(0, py)))


# --------------------------------------------------------------------------- GIFs

def strip_gif(seq_list, out, fps, bg=SAND_BG, pad=10, scale=1.0, water_keys=()):
    """seq_list = [(label, [frames], water)] played side by side (same length -> loop)."""
    n = max(len(s[1]) for s in seq_list)
    boxes = []
    f12 = pp.font(12)
    for label, seq, water in seq_list:
        bb = [im.getbbox() for im in seq if im.getbbox()]
        x0 = min(b[0] for b in bb) - pad
        y0 = min(b[1] for b in bb) - pad
        x1 = max(b[2] for b in bb) + pad
        y1 = max(b[3] for b in bb) + pad
        grow = max(0, int(f12.getlength(label)) + 4 - (x1 - x0))     # the label must fit under its panel
        x0, x1 = x0 - grow // 2, x1 + grow - grow // 2
        boxes.append((x0, max(0, y0), x1, y1))
    Hm = max(b[3] - b[1] for b in boxes)
    Wt = sum(b[2] - b[0] for b in boxes) + 10 * (len(boxes) + 1)
    frames_out = []
    for i in range(n):
        canvas = Image.new('RGBA', (Wt, Hm + 26), (236, 241, 248, 255))
        x = 10
        for (label, seq, water), bx in zip(seq_list, boxes):
            im = seq[i % len(seq)]
            panel = Image.new('RGBA', (bx[2] - bx[0], bx[3] - bx[1]), ((88, 196, 204) if water else bg) + (255,))
            panel.alpha_composite(im.crop(bx))
            canvas.alpha_composite(panel, (x, Hm - panel.height))
            ImageDraw.Draw(canvas).text((x + 2, Hm + 6), label, fill=(20, 24, 32), font=pp.font(12))
            x += panel.width + 10
        if scale != 1.0:
            canvas = canvas.resize((int(canvas.width * scale), int(canvas.height * scale)), Image.LANCZOS)
        frames_out.append(canvas.convert('RGB'))
    hp._gif(frames_out, [int(1000 / fps)] * len(frames_out), out)


def anim_seq(builds, frames, key, anim):
    m = builds.get(key)
    if not m or anim not in (m.get('anims') or {}):
        return None
    return [frames[n] for n in m['anims'][anim]['frames']]


def gifs(builds, frames, chars, cframes, prev):
    out = []

    def go(name, items, fps, scale=1.0):
        seqs = [(lab, s, w) for lab, s, w in items if s]
        if seqs:
            strip_gif(seqs, os.path.join(prev, name), fps, scale=scale)
            out.append(name)
    go('beach_parasols.gif', [(k, anim_seq(builds, frames, k, 'flutter'), False) for k in
                              ('parasol_red', 'parasol_blue', 'parasol_rainbow', 'parasol_pink')], 6)
    go('beach_palms.gif', [(k, anim_seq(builds, frames, k, 'sway'), False) for k in ('palm_tree_a', 'palm_tree_b')], 4)
    go('beach_service.gif', [('beach_shower water', anim_seq(builds, frames, 'beach_shower', 'water'), False),
                             ('icecream_cart bell', anim_seq(builds, frames, 'icecream_cart', 'bell'), False),
                             ('corn_stand grill', anim_seq(builds, frames, 'corn_stand', 'grill'), False)], 8)
    go('beach_play.gif', [('beach_ball_bounce', anim_seq(builds, frames, 'beach_ball_bounce', 'bounce'), False),
                          ('kite fly', anim_seq(builds, frames, 'kite', 'fly'), False)], 10)
    m = builds.get('sandcastle_build')
    if m:
        seq = [frames[n] for n in m['frames']]
        go('beach_sandcastle.gif', [('sandcastle_build_0..3', seq, False)], 1.2, scale=2.0)
    # water: chained buoy-line tiles (in sync) + end buoys + raft
    m = builds.get('swim_buoy_line_x')
    if m:
        seq = []
        nfr = m['anims']['bob']['frames']
        e = builds.get('swim_buoy_line_end')
        r = builds.get('float_raft')
        for i, n in enumerate(nfr):
            im0 = frames[n]
            ax, ay = m['anchorPx']
            Wc, Hc = 820, 340
            c = Image.new('RGBA', (Wc, Hc), (0, 0, 0, 0))
            for t in range(6):
                c.alpha_composite(im0, (60 + t * 64 - ax + 120, 120 + t * 32 - ay))
            if e:
                ei = frames[e['anims']['bob']['frames'][i % 4]]
                c.alpha_composite(ei, (60 - 32 - e['anchorPx'][0] + 120, 120 - 16 - e['anchorPx'][1]))
                c.alpha_composite(ei, (60 + 6 * 64 - 32 - e['anchorPx'][0] + 120, 120 + 6 * 32 - 16 -
                                       e['anchorPx'][1]))
            if r:
                ri = frames[r['anims']['bob']['frames'][i % 4]]
                c.alpha_composite(ri, (620 - r['anchorPx'][0], 150 - r['anchorPx'][1]))
            seq.append(c)
        go('beach_water_props.gif', [('swim_buoy_line_x x6 + ends + float_raft (bob)', seq, True)], 4, scale=1.5)
    # characters-style
    for key, name, anim, dirs, fps, scale in (('swan_pedal_boat', 'beach_swan.gif', 'move', ('S', 'SE', 'NE'), 7, 1.0),
                                              ('kayak_crew', 'beach_kayak.gif', 'move', ('S', 'SE', 'NE'), 7, 1.0),
                                              ('banana_boat_crew', 'beach_banana.gif', 'move', ('S', 'SE', 'NE'), 7,
                                               1.0),
                                              ('crab', 'beach_crab.gif', 'walk', ('S', 'SE', 'E', 'NE', 'N'), 12,
                                               3.0)):
        m = chars.get(key)
        if not m:
            continue
        items = []
        for d in dirs:
            seq = [cframes[key]['%s_%s_%d' % (anim, d, i)] for i in range(m['anims'][anim]['frames'])]
            items.append(('%s %s' % (anim, d), seq, m['kind'] == 'ship'))
        go(name, items, fps, scale=scale)
    return out


def previews(builds, frames, chars, cframes, man, prev, out_dir=None):
    global BEACH_DIR
    if out_dir:
        BEACH_DIR = out_dir
    os.makedirs(prev, exist_ok=True)
    preview_all(builds, frames, chars, cframes, man, os.path.join(prev, 'beach_all.png'))
    kind = preview_scene(builds, frames, chars, cframes, man, os.path.join(prev, 'beach_scene.png'))
    g = gifs(builds, frames, chars, cframes, prev)
    print('previews: beach_all.png, beach_scene.png (people: %s), %s' % (kind, ', '.join(g)))
