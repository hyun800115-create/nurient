"""
harbor_pack.py - turn the raw harbour renders (harbor_render.py cache) into assets/harbor/: trimmed Phaser atlases
(each sheet <= 2048 px) + manifest.json, plus the previews docs/previews/harbor_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/harbor_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
                                         [--out DIR] [--prev DIR]        (dry runs: write somewhere else)

Guard + merge (as bld_pack / town_pack): the packer MERGES into the existing assets/harbor/manifest.json - unknown
top-level fields and extra fields inside entries are kept, generated fields win - and it REFUSES (exit 1, nothing
written) when a key of the current manifest or of harbor_check.REQUIRED has no render in the cache, because rebuilding
the atlases would drop it.  --allow-partial packs what is cached and drops the missing keys on purpose.  An empty
manifest is never written.  assets/harbor/townfolk_presets.json is hand-written data: never deleted / rewritten here.

Steps
  1. read every <build>.json sidecar + frames
  2. post: pack_utils.clean_alpha + prop_pack.tint_shadow (the village's cool shadow) + prop_pack.border_fade;
     seamless tiles instead get the partition-of-unity cut of their `cuts` (no border fade, see harbor_water.py)
  3. atlases harbor_landmarks, harbor_buildings, harbor_water, harbor_props (split _2, _3 .. at 2048 px, a build's
     frames always share one sheet), palettised with libimagequant (256 colours, dither 0.6) by default
  4. assets/harbor/manifest.json: sprites (+ the contract alias keys pier_end / breakwater)
  5. previews: docs/previews/harbor_all.png, harbor_scene.png, harbor_tiles.png, harbor_townfolk.png and GIFs
     harbor_lighthouse.gif, harbor_crane.gif, harbor_shipyard.gif, harbor_buoy.gif
"""
import json
import math
import os
import random
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, shelf_preview, font)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'harbor')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 6.0
ATLAS_ORDER = ['harbor_landmarks', 'harbor_buildings', 'harbor_water', 'harbor_props']
KX, KY, KZ = 45.2548, 22.6274, 55.4256
SQ2 = math.sqrt(2.0)
WATER_PX = 30
ALIASES = {'pier_end': 'pier_end_yn', 'breakwater': 'breakwater_x'}
POINT_SINGLE = {'in': 'inPoint', 'out': 'outPoint', 'door': 'doorPoint', 'cash': 'cashPoint', 'gangway': 'gangwayPoint',
                'berth': 'berthPoint', 'pick': 'pickPoint', 'drop': 'dropPoint', 'ladder': 'ladderPoint',
                'hook': 'hookPoint'}
POINT_LIST = {'staff': 'staffPoints', 'customer': 'customerPoints', 'wait': 'waitPoints', 'board': 'boardPoints',
              'seat': 'seatPoints', 'work': 'workPoints', 'moor': 'moorPoints'}
DIR_LIST = {'staff': 'staffDirs', 'customer': 'customerDirs', 'wait': 'waitDirs', 'board': 'boardDirs',
            'seat': 'seatDirs', 'work': 'workDirs', 'door': 'doorDir'}
EXTRA_FIELDS = ('name', 'zone', 'tileAxis', 'segM', 'stepPx', 'rampM', 'openEnds', 'cuts', 'tileLayer', 'pierWidthM',
                'capKind', 'deckTop', 'copingM', 'faceSide', 'crownM', 'cornerArms', 'quayEdge', 'berthAxis',
                'berthSide', 'cargoHangPx', 'pickFrame', 'dropFrame', 'jibReachM', 'craneSeq', 'onWater', 'waterline',
                'buyerPointsNote', 'ground', 'waterPx')


# --------------------------------------------------------------------------- post

def tile_cut(img, anchor, cuts, ramp):
    """Partition-of-unity cut of a seamless tile: weight w = min over the cuts of a linear ramp of +-ramp metres around
    each cut (computed ground coordinate of the pixel), alpha' = 1 - (1 - alpha)^w (town_pack.rail_cut, generalised)."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    H_, W = a.shape[:2]
    ax, ay = anchor
    px, py = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H_) + 0.5 - ay)
    g = {'x': (px / KX + py / KY) / 2.0, 'y': (px / KX - py / KY) / 2.0}
    w = np.ones((H_, W), np.float32)
    for axis, side, at in cuts:
        u = g[axis]
        ww = 0.5 + ((at - u) if side == 'pos' else (u - at)) / (2 * ramp)
        w = np.minimum(w, np.clip(ww, 0.0, 1.0))
    alpha = a[..., 3] / 255.0
    new = 1.0 - np.power(np.clip(1.0 - alpha, 1e-6, 1.0), w)
    a[..., 3] = np.clip(new * 255.0, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def post(im, m):
    im = pp.tint_shadow(pu.clean_alpha(im, floor=10))
    if m.get('cuts') is not None and m.get('tileAxis'):
        return tile_cut(im, m['anchorPx'], m['cuts'], m['rampM'])
    return pp.border_fade(im)


def load(cache):
    builds = {}
    for fn in sorted(os.listdir(cache)):
        if not fn.endswith('.json'):
            continue
        try:
            m = json.load(open(os.path.join(cache, fn)))
        except Exception:
            continue
        if 'build' in m and 'frames' in m and all(os.path.exists(os.path.join(cache, n + '.png')) for n in m['frames']):
            builds[m['build']] = m
    frames = {}
    for k, m in builds.items():
        for n in m['frames']:
            frames[n] = post(Image.open(os.path.join(cache, n + '.png')).convert('RGBA'), m)
    return builds, frames


# --------------------------------------------------------------------------- manifest

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
    for kind, field in POINT_LIST.items():
        if pts.get(kind):
            s[field] = pts[kind]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind]
    # per-frame points of the work anim (crane hook)
    if 'anims' in m:
        for kind, field in (('hook', 'hookPoints'),):
            per = [m['framePoints'].get(n, {}).get(kind, [None])[0] for n in m['anims']['work']['frames']]
            if any(p is not None for p in per):
                for an in s['anims']:
                    s['anims'][an][field] = per
    if 'customerPoints' in s and k == 'fish_auction':
        s['buyerPoints'] = s['customerPoints']
    if 'staffPoints' in s:
        s['staffDepth'] = m.get('staffDepth', 'front')
    for f in EXTRA_FIELDS:
        if f in m:
            s[f] = m[f]
    if m.get('notes'):
        s['notes'] = m['notes']
    return s


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre at QUAY LEVEL (z 0); '
              'tiles: the tile centre on the deck / quay edge line; buoy: its waterline centre.',
    'levels': 'z 0 = land / quay / pier deck (walkable, characters need no lift on piers). The sea surface is 0.55 m '
              'lower = waterPx 30 screen px below the deck point above it. Every berthPoint / moorPoints value is '
              'already ON THE WATER PLANE: put a ship anchor (assets/ships, waterline centre) exactly there.',
    'front': '-Y = faces screen down-left (SW) - the harbour buildings face the sea on that side; their front footprint '
             'edge is the quay edge (quayEdge = two px points of that line). yaw-90 tiles (_y) run along world Y.',
    'footprint': 'screen-px bounding size [w, h] of the ground diamond centred on the anchor; footprintM = metres; '
                 'footprintPoly = 4 ground corners in px for depth / collision tests.',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled). *Dirs = facing of '
              'a character standing there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX). staffDepth "front": draw '
              'characters there above the building sprite; "behind" (harbor_market): normal y-sorting (counter hides '
              'the legs).',
    'anims': 'idle frame = resting state; anims.work (+ the named alias light / lift / bob) loops with every frame '
             'sharing frameSize + anchor (swap frames in place, spr:<key>:work like the village stations). '
             'lighthouse 8f, harbor_crane 8f at 4 fps (hookPoints per frame, pickFrame / dropFrame), shipyard 4f, '
             'buoy 4f.',
    'tiles': 'pier_*, quay_*, breakwater_*: kind decal, draw on the GROUND layer (under characters / ships / buildings). '
             'One tile = sqrt(2) m along world X (step (+64, +32) px, screen down-right) or Y (step (+64, -32) px, '
             'screen up-right); consecutive tiles join seamlessly incl. the baked shadow (partition-of-unity cuts '
             '+-rampM at the open ends). pier_end_* close a pier on the sea side, pier_root_* on the land side (end line '
             'on the quay edge); quay_corner = outer corner (see its notes for the chaining offsets).',
    'aliases': 'pier_end = pier_end_yn, breakwater = breakwater_x (the contract names; same frames, aliasOf).',
    'shadows': 'baked soft cool shadows falling screen down-right: on the land (z 0) for land parts, on the sea '
               'surface for piers / gangways / slipways / tiles (so it lands where the water is drawn).',
    'townfolk': 'harbour townsfolk presets: harbor/townfolk_presets.json (merge into townfolk.generator.presets).',
}


def build_manifest(builds, frame_atlas, atlas_keys, old):
    sprites = {}
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, k))
    for k in order:
        sprites[k] = sprite_entry(k, builds[k], frame_atlas)
    for a, target in ALIASES.items():
        if target in sprites:
            e = dict(sprites[target])
            e['aliasOf'] = target
            sprites[a] = e
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/harbor_render.py + harbor_pack.py (docs/CONTRACT_V6.md section T)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'harbor/%s.png' % a, 'json': 'harbor/%s.json' % a} for a in atlas_keys]
    oldsp = (old or {}).get('sprites', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['townfolkPresets'] = 'harbor/townfolk_presets.json'
    man['waterPx'] = WATER_PX
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


def pack_all(builds, frames, mode):
    groups = {}
    for k, m in builds.items():
        groups.setdefault(m['atlas'], []).append([(n, frames[n]) for n in m['frames']])
    sheets = pack_groups(groups)
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('harbor_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if fn.startswith('harbor_') and fn.endswith(('.png', '.json')):
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


# --------------------------------------------------------------------------- preview helpers

def _gif(frames_rgb, durs, out):
    pal = frames_rgb[min(2, len(frames_rgb) - 1)].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames_rgb]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)


def kfont(size):
    """A font with Hangul glyphs for the Korean labels (falls back to prop_pack.font)."""
    from PIL import ImageFont
    for p in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
              'C:/Windows/Fonts/malgun.ttf', '/Library/Fonts/AppleGothic.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return pp.font(size)


def tex(rel, size=(64, 64), fill=(200, 205, 214, 255)):
    p = os.path.join(ASSETS, rel)
    return Image.open(p).convert('RGBA') if os.path.exists(p) else Image.new('RGBA', size, fill)


class Scene:
    def __init__(self, W, H, ox, oy, bg=(31, 95, 168)):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.img = Image.new('RGBA', (W, H), bg + (255,))
        self.ground = []
        self.placed = []
        self.labels = []

    def p(self, x, y, z=0.0):
        return self.ox + (x + y) * KX, self.oy + (x - y) * KY - z * KZ

    def fill_poly(self, texture, pts_world, z=0.0, outline=None):
        poly = [self.p(x, y, z) for x, y in pts_world]
        mask = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        tiled = Image.new('RGBA', (self.W, self.H))
        for ty in range(0, self.H, texture.height):
            for tx in range(0, self.W, texture.width):
                tiled.paste(texture, (tx, ty))
        self.img.paste(tiled, (0, 0), mask)
        if outline:
            ImageDraw.Draw(self.img).line(poly + [poly[0]], fill=outline, width=2)

    def put(self, im, anchor_px, x, y, z=0.0, bias=0.0, ground=False, depth=None):
        sx, sy = self.p(x, y, z)
        d = (self.oy + (x - y) * KY + bias) if depth is None else depth
        item = (d, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])))
        (self.ground if ground else self.placed).append(item)

    def label(self, text, x, y, z=0.0, dy=0):
        sx, sy = self.p(x, y, z)
        self.labels.append((text, sx, sy + dy))

    def finish(self, out, caption, crop=True, bg_key=None):
        for _, im, px, py in sorted(self.ground, key=lambda t: t[0]):
            self.img.alpha_composite(im, (px, py))
        for _, im, px, py in sorted(self.placed, key=lambda t: t[0]):
            self.img.alpha_composite(im, (px, py))
        if crop:
            items = [(px, py, px + im.width, py + im.height) for _, im, px, py in self.placed + self.ground]
            if items:
                x0 = max(0, min(r[0] for r in items) - 40)
                y0 = max(0, min(r[1] for r in items) - 40)
                x1 = min(self.W, max(r[2] for r in items) + 40)
                y1 = min(self.H, max(r[3] for r in items) + 70)
                self.img = self.img.crop((x0, y0, x1, y1))
                self.labels = [(t, sx - x0, sy - y0) for t, sx, sy in self.labels]
                self.W, self.H = self.img.size
        d = ImageDraw.Draw(self.img)
        f = pp.font(13)
        for text, sx, sy in self.labels:
            tw = f.getlength(text)
            d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7, fill=(255, 255, 255, 215))
            d.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
        d.rectangle([0, self.H - 40, self.W, self.H], fill=(31, 95, 168, 255))
        d.text((16, self.H - 33), caption, fill=(255, 255, 255), font=pp.font(18))
        self.img.convert('RGB').save(out, optimize=True)


def townfolk_lib():
    """(Townfolk, presets) with the harbour presets merged in, or None if the townfolk fragment is unavailable."""
    try:
        import townfolk_compose as tc
        tf = tc.Townfolk.from_assets()
        pres = json.load(open(os.path.join(OUT, 'townfolk_presets.json'), encoding='utf-8'))['presets']
        tf.T['generator']['presets'].update(pres)
        return tf, pres
    except Exception as e:                      # noqa: BLE001
        print('note: townfolk preview disabled (%s)' % e)
        return None, {}


def char_lib(rel):
    import bld_pack as bp
    return bp.atlas_lib(rel)


# --------------------------------------------------------------------------- previews

def preview_all(builds, frames, out):
    ents = []
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, k))
    for k in order:
        m = builds[k]
        im = frames[m['frames'][0]]
        if m['atlas'] == 'harbor_water' and m.get('tileAxis'):
            im = im.crop(im.getbbox())
            bg = Image.new('RGBA', (im.width + 16, im.height + 16), (47, 134, 201, 255))
            bg.alpha_composite(im, (8, 8))
            im = bg
        ents.append((k, im))
        if 'anims' in m:
            nfr = m['anims']['work']['frames']
            n = nfr[len(nfr) // 2 - 1] if len(nfr) > 4 else nfr[1]
            ents.append((k + ' (%s)' % (m.get('animAlias') or 'work'), frames[n]))
    pp.shelf_preview(ents, out, max_w=2600, title='Seagull Harbour (Galmaegi port) - assets/harbor at 1x, PPU 64: landmarks, '
                                                  'buildings, water tiles (shown on sea blue), props; idle + one anim '
                                                  'frame')


def preview_scene(builds, frames, out):
    """Mock harbour block at 1x: land quadrant x <= 0, y >= 0 with stone quay walls along both edges, piers along
    both axes, the crane at work, containers, terminal, auction hall, lighthouse, breakwater, buoys, boats and
    townsfolk (harbour presets) for scale.  World metres; origin = the quay corner."""
    sc = Scene(3800, 2600, 1650, 1250)
    sea = tex('ground/water_sea.png', fill=(31, 95, 168, 255))
    snow = tex('ground/ground_snow.png', fill=(244, 247, 251, 255))
    road = tex('ui2/ground_road.png', fill=(200, 205, 214, 255))
    sc.fill_poly(sea, [(-60, -40), (40, -40), (40, 60), (-60, 60)])
    LX0, LY1 = -34.0, 25.0
    sc.fill_poly(snow, [(LX0, 0.0), (0.0, 0.0), (0.0, LY1), (LX0, LY1)])
    sc.fill_poly(road, [(LX0, 0.0), (0.0, 0.0), (0.0, 4.8), (LX0, 4.8)])
    sc.fill_poly(road, [(-5.2, 0.0), (0.0, 0.0), (0.0, LY1), (-5.2, LY1)])

    def B(key, x, y, frame=None, label=True, dy=-22, z=0.0):
        m = builds.get(key)
        if not m:
            return None
        sc.put(frames[frame or m['frames'][0]], m['anchorPx'], x, y, z=z)
        if label:                       # name tag just in front of the footprint (its lowest ground corner)
            sx, sy = sc.p(x, y, z)
            fh = m.get('footprint', [0, 40])[1]
            sc.labels.append((key, sx, sy + fh / 2 + 6))
        return m

    def G(key, x, y):
        m = builds.get(key)
        if m:
            sc.put(frames[m['frames'][0]], m['anchorPx'], x, y, ground=True, depth=sc.oy + (x - y) * KY)
        return m

    def pts(key, kind, frame=None):
        m = builds.get(key)
        if not m:
            return []
        return m['framePoints'][frame or m['frames'][0]].get(kind, [])

    # quay walls along both arms + the corner
    for n in range(1, int(-LX0 / SQ2) + 1):
        G('quay_x', -n * SQ2, 0.0)
    for n in range(1, int(LY1 / SQ2) + 1):
        G('quay_y', 0.0, n * SQ2)
    G('quay_corner', 0.0, 0.0)
    # pier along Y off the -Y waterfront (x = -17), pier along X off the +X waterfront (y = 10.5)
    PXY = -17.0
    G('pier_root_yp', PXY, -SQ2 / 2)
    for n in range(1, 5):
        G('pier_y', PXY, -SQ2 / 2 - n * SQ2)
    G('pier_end_yn', PXY, -SQ2 / 2 - 5 * SQ2)
    PYX = 12.5
    G('pier_root_xn', SQ2 / 2, PYX)
    for n in range(1, 4):
        G('pier_x', SQ2 / 2 + n * SQ2, PYX)
    G('pier_end_xp', SQ2 / 2 + 4 * SQ2, PYX)
    # breakwater off the +X arm at y = 18
    BWY = 21.0
    for n in range(0, 4):
        G('breakwater_x', SQ2 / 2 + n * SQ2, BWY)
    G('breakwater_end_xp', SQ2 / 2 + 4 * SQ2, BWY)
    if 'breakwater_x' in builds:
        sc.label('breakwater', 4.0, BWY, dy=34)
        sc.label('pier_x / pier_end_xp', 4.5, PYX, dy=30)
        sc.label('pier_y + pier_end_yn', PXY, -5.5, dy=30)
        sc.label('quay_x / quay_corner / quay_y', -1.0, -0.5, dy=26)
    # -Y waterfront
    B('shipyard', -29.0, 2.5, frame=(builds['shipyard']['anims']['work']['frames'][1] if 'shipyard' in builds else
                                      None))
    B('fish_auction', -21.6, 2.0)
    B('ferry_terminal', -11.8, 2.0)
    crane = builds.get('harbor_crane')
    CR = (-3.6, 1.6)
    if crane:
        B('harbor_crane', CR[0], CR[1], frame=crane['anims']['work']['frames'][3])
    B('crate_stack', -7.6, 3.75, label=False)
    B('bollard', -14.9, 0.35, label=False)
    B('bollard', -8.3, 0.35, label=False)
    B('harbor_lamp', -16.0, 0.6, label=False)
    B('harbor_lamp', -6.2, 0.55, label=False)
    # +X waterfront
    B('container_stack', -1.6, 4.7)
    B('container_stack_b', -1.55, 7.5, label=False)
    B('container_red', -30.6, 9.2, label=False)
    B('container_yellow', -29.9, 11.6, label=False)
    B('bollard', -0.35, 11.4, label=False)
    B('bollard', -0.35, 13.6, label=False)
    B('lighthouse', -2.3, 17.0)
    B('harbor_lamp', -0.5, 19.4, label=False)
    B('buoy', 5.2, 4.0, frame=(builds['buoy']['anims']['work']['frames'][1] if 'buoy' in builds else None), z=-0.55)
    B('buoy', 2.4, -4.8, label=False, z=-0.55)
    # second row
    B('harbor_market', -21.6, 9.0)
    B('seafood_restaurant', -16.4, 9.2)
    B('customs_house', -11.4, 9.4)
    B('harbor_warehouse', -5.9, 10.0)
    B('sailor_lodge', -16.6, 15.4)
    B('harbor_office', -11.9, 15.2)
    B('net_rack', -27.5, 8.6, label=False)
    B('anchor_decor', -8.4, 15.0, label=False)
    B('barrel_stack', -24.6, 14.0, label=False)
    # boats (existing assets/buildings boats) moored on the water plane
    bl = char_lib('buildings/manifest.json')

    def boat(key, anim, d, i, x, y):
        if not bl or key not in bl[0].get('characters', {}):
            return
        e = bl[0]['characters'][key]
        im = bl[1](e['atlas'], '%s_%s_%d' % (anim, d, i))
        if im is None:
            return
        fw, fh = e['frameSize']
        anc = (e['anchor'][0] * fw, e['anchor'][1] * fh)
        sx, sy = sc.p(x, y)
        sc.placed.append((sy, im, int(round(sx - anc[0])), int(round(sy + WATER_PX - anc[1]))))
    boat('boat_fishing', 'idle', 'NE', 0, PXY - 2.4, -4.2)
    boat('boat_rowboat', 'idle', 'SE', 0, 3.6, PYX - 1.9)
    boat('boat_fishing', 'sail', 'SE', 1, -24.0, -3.8)
    # ships from the parallel ships fragment, if it is there already
    sl = char_lib('ships/manifest.json')
    if sl:
        for key, (x, y) in (('ferry', (-9.6, -6.2)), ('cargo_ship', (-3.6, -6.0))):
            e = sl[0].get('characters', {}).get(key)
            if not e:
                continue
            try:
                d = next((dd for dd in ('X+', 'Xp', 'SE', 'E') if dd in e.get('dirs', [])), e['dirs'][0])
                an = 'idle' if 'idle' in e['anims'] else list(e['anims'])[0]
                fn = e.get('frameName', '{anim}_{dir}_{i}').format(anim=an, dir=d, i=0)
                im = sl[1](e['atlas'], fn)
                if im is None:
                    continue
                fw, fh = e['frameSize']
                anc = (e['anchor'][0] * fw, e['anchor'][1] * fh)
                sx, sy = sc.p(x, y)
                sc.placed.append((sy, im, int(round(sx - anc[0])), int(round(sy + WATER_PX - anc[1]))))
            except Exception as ex:          # noqa: BLE001
                print('note: ship %s not drawn (%s)' % (key, ex))
    # townsfolk (harbour presets) at the building points
    tf, pres = townfolk_lib()
    rnd = random.Random(7)

    def person(preset, x, y, d='S', anim='idle', i=0, seed=None, px=None):
        if not tf:
            return
        p = tf.preset(preset, seed if seed is not None else rnd.randrange(10 ** 6)) if preset else \
            tf.random_person(rnd.randrange(10 ** 6))
        im = tf.compose(p, anim, d, i)
        if px is not None:
            sx, sy = px
        else:
            sx, sy = sc.p(x, y)
        sc.placed.append((sy + 0.5, im, int(round(sx - 64)), int(round(sy - 104))))

    def at(key, bx, by, kind, k, preset, d, anim='idle', i=0):
        p = pts(key, kind)
        if len(p) > k:
            sx, sy = sc.p(bx, by)
            person(preset, 0, 0, d=d, anim=anim, i=i, px=(sx + p[k][0], sy + p[k][1]))

    at('harbor_crane', CR[0], CR[1], 'staff', 0, 'dock_worker', 'SE', 'wave', 2)
    at('harbor_crane', CR[0], CR[1], 'work', 0, 'dock_worker', 'S')
    at('harbor_crane', CR[0], CR[1], 'work', 1, 'dock_worker', 'SE', 'carry_walk', 3)
    at('fish_auction', -21.6, 2.0, 'staff', 0, 'auctioneer', 'SE', 'talk', 3)
    for k in range(4):
        at('fish_auction', -21.6, 2.0, 'customer', k, ['sailor', None, 'tourist', 'dock_worker'][k], 'NE')
    for k in range(4):
        at('ferry_terminal', -11.8, 2.0, 'wait', k, 'tourist', 'E', 'idle', k % 4)
    at('ferry_terminal', -11.8, 2.0, 'board', 1, 'tourist', 'SE', 'walk', 2)
    at('ferry_terminal', -11.8, 2.0, 'staff', 0, 'sailor', 'SW')
    at('lighthouse', -2.3, 17.0, 'staff', 0, 'lighthouse_keeper', 'S', 'wave', 3)
    for k in range(3):
        at('harbor_market', -21.6, 9.0, 'customer', 2 * k, ['tourist', None, 'tourist'][k], 'NE')
    at('sailor_lodge', -16.6, 15.4, 'seat', 0, 'sailor', 'S')
    at('harbor_warehouse', -5.9, 10.0, 'work', 0, 'dock_worker', 'NE', 'carry_walk', 1)
    at('customs_house', -11.4, 9.4, 'staff', 0, None, 'SW')
    at('shipyard', -29.0, 2.5, 'work', 0, 'dock_worker', 'SW')
    at('seafood_restaurant', -16.4, 9.2, 'seat', 0, 'tourist', 'SE')
    at('seafood_restaurant', -16.4, 9.2, 'customer', 0, 'sailor', 'NE')
    person('sailor', PXY, -3.0, d='SW', anim='walk', i=4)
    person('tourist', -13.5, 5.6, d='SE', anim='walk', i=1)
    person(None, -9.0, 5.2, d='NE', anim='walk', i=5)
    person('tourist', -3.4, 14.2, d='NE', anim='walk', i=2)
    person('sailor', -1.6, 10.6, d='SE', anim='idle', i=0)
    person('tourist', -14.0, 12.6, d='SW', anim='walk', i=6)
    sc.finish(out, 'Seagull Harbour mock block at 1x (PPU 64): assets/harbor buildings + quay / pier / breakwater tiles, '
                   'boats = assets/buildings, people = assets/townfolk with the harbour presets', bg_key=None)


def preview_tiles(builds, frames, out):
    """Seam check: chained tiles of every kind on the sea, at 1x and a 2x zoom of the joins."""
    sc = Scene(2100, 1250, 1050, 520)
    sea = tex('ground/water_sea.png', fill=(31, 95, 168, 255))
    snow = tex('ground/ground_snow.png', fill=(244, 247, 251, 255))
    sc.fill_poly(sea, [(-30, -30), (30, -30), (30, 30), (-30, 30)])
    sc.fill_poly(snow, [(-12.0, 0.0), (0.0, 0.0), (0.0, 10.0), (-12.0, 10.0)])

    def G(key, x, y):
        m = builds.get(key)
        if m:
            sc.put(frames[m['frames'][0]], m['anchorPx'], x, y, ground=True, depth=sc.oy + (x - y) * KY)
    for n in range(1, 9):
        G('quay_x', -n * SQ2, 0.0)
    for n in range(1, 7):
        G('quay_y', 0.0, n * SQ2)
    G('quay_corner', 0.0, 0.0)
    G('pier_root_yp', -6.0, -SQ2 / 2)
    for n in range(1, 4):
        G('pier_y', -6.0, -SQ2 / 2 - n * SQ2)
    G('pier_end_yn', -6.0, -SQ2 / 2 - 4 * SQ2)
    G('pier_root_xn', SQ2 / 2, 5.0)
    for n in range(1, 4):
        G('pier_x', SQ2 / 2 + n * SQ2, 5.0)
    G('pier_end_xp', SQ2 / 2 + 4 * SQ2, 5.0)
    for n in range(0, 4):
        G('breakwater_y', 6.0, -2.0 - n * SQ2)
    G('breakwater_end_yn', 6.0, -2.0 - 4 * SQ2)
    for n in range(0, 3):
        G('breakwater_x', 1.5 + n * SQ2, -9.5)
    G('breakwater_end_xp', 1.5 + 3 * SQ2, -9.5)
    G('pier_x', -9.0, -8.0)
    G('pier_end_xn', -9.0 - SQ2, -8.0)
    G('pier_end_xp', -9.0 + SQ2, -8.0)
    G('pier_y', -12.0, -4.0)
    G('pier_end_yp', -12.0, -4.0 + SQ2)
    G('pier_root_yn', -12.0, -4.0 - SQ2)
    G('pier_root_xp', -9.0 + 2 * SQ2, -11.0)
    G('pier_x', -9.0 + SQ2, -11.0)
    sc.finish(out, 'harbour tiles chained at their integer steps on the sea plane: quay_x / quay_y / quay_corner, piers '
                   '(roots, straights, ends) along both axes, breakwaters - joins must be invisible')


def anim_gif(builds, frames, key, out, scale=1.0, bg=(236, 241, 248), water=False, fps=None, crop_pad=10):
    m = builds.get(key)
    if not m or 'anims' not in m:
        return
    names = m['anims']['work']['frames']
    boxes = [frames[n].getbbox() for n in names + [m['frames'][0]]]
    x0 = min(b[0] for b in boxes) - crop_pad
    y0 = min(b[1] for b in boxes) - crop_pad
    x1 = max(b[2] for b in boxes) + crop_pad
    y1 = max(b[3] for b in boxes) + crop_pad
    W, H_ = int((x1 - x0) * scale), int((y1 - y0) * scale)
    seq = []
    for n in names:
        im = Image.new('RGBA', (W * 2 + 10, H_ + 28), bg + (255,))
        for k, bgc in enumerate((bg, (47, 134, 201))):
            panel = Image.new('RGBA', (x1 - x0, y1 - y0), bgc + (255,))
            if water and k == 0:
                panel = Image.new('RGBA', (x1 - x0, y1 - y0), (236, 241, 248, 255))
            panel.alpha_composite(frames[n].crop((x0, y0, x1, y1)))
            if scale != 1.0:
                panel = panel.resize((W, H_), Image.LANCZOS)
            im.alpha_composite(panel, (k * (W + 10), 0))
        d = ImageDraw.Draw(im)
        d.text((6, H_ + 6), '%s anims.%s (%s)' % (key, m.get('animAlias') or 'work', n), fill=(20, 24, 32),
               font=pp.font(13))
        seq.append(im.convert('RGB'))
    f = fps or m['anims']['work']['fps']
    _gif(seq, [int(1000 / f)] * len(seq), out)


def preview_townfolk(out):
    tf, pres = townfolk_lib()
    if not tf:
        return None
    rows = []
    issues = []
    for name in pres:
        cells = []
        for s in range(8):
            try:
                p = tf.preset(name, 100 + s)
            except Exception as e:                       # noqa: BLE001
                issues.append('%s seed %d: %s' % (name, s, e))
                continue
            want = set(k for k in ('extra',) if pres[name].get(k))
            del want
            im = tf.compose(p, 'idle', ['S', 'SE', 'S', 'E', 'S', 'SE', 'S', 'SW'][s], 0)
            cells.append(im.resize((192, 192), Image.LANCZOS))
        rows.append((name, cells))
    W = 200 + 8 * 196
    H_ = 60 + len(rows) * 200
    sheet = Image.new('RGBA', (W, H_), (236, 241, 248, 255))
    d = ImageDraw.Draw(sheet)
    d.text((12, 12), 'Harbour townsfolk presets (assets/harbor/townfolk_presets.json) composed from existing '
                     'assets/townfolk parts - 8 seeds each, 1.5x', fill=(20, 24, 32), font=pp.font(18))
    y = 50
    for name, cells in rows:
        lab = pres[name]['label']
        d.text((12, y + 70), name, fill=(20, 24, 32), font=pp.font(16))
        d.text((12, y + 94), lab['ko'], fill=(20, 24, 32), font=kfont(18))
        x = 200
        for c in cells:
            sheet.alpha_composite(c, (x, y))
            x += 196
        y += 200
    sheet.convert('RGB').save(out, optimize=True)
    return issues


# --------------------------------------------------------------------------- main

def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('harbor_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'harbor_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is '
                         'never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('harbor_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다: %s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'harbor_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다. 아무 파일도 바꾸지 '
        '않았습니다.\nharbor_pack: ABORT - %d key(s) in the current manifest (or harbor_check.REQUIRED; * = only there) '
        'are missing from the render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/harbor_render.py -- <keys> first, or pass --cache <full '
        'cache>; to drop them on purpose re-run with --allow-partial' % (len(missing), cache, len(missing), cache,
                                                                         listing))


def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'harbor')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = args[args.index('--quantize') + 1] if '--quantize' in args else 'on'
    if not os.path.isdir(cache):
        sys.exit('harbor_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run harbor_render.py first or pass --cache DIR.' % cache)
    builds, frames = load(cache)
    have = set(builds) | {a for a, t in ALIASES.items() if t in builds}
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from harbor_check import REQUIRED
    except ImportError:
        REQUIRED = []
    need = set(REQUIRED)
    in_man = set()
    if old:
        in_man = set(old.get('sprites', {}))
        need |= in_man
    guard(cache, have, need, in_man, '--allow-partial' in args)
    sheets, frame_atlas, total = pack_all(builds, frames, mode)
    man = build_manifest(builds, frame_atlas, [s[0] for s in sheets], old)
    if not man['sprites']:
        sys.exit('harbor_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    tp = os.path.join(OUT, 'townfolk_presets.json')
    if os.path.exists(tp):
        total += os.path.getsize(tp)
    print('sprites: %d  payload %.2f MB' % (len(man['sprites']), total / 1048576.0))
    if '--no-previews' not in args:
        os.makedirs(PREV, exist_ok=True)
        preview_all(builds, frames, os.path.join(PREV, 'harbor_all.png'))
        preview_tiles(builds, frames, os.path.join(PREV, 'harbor_tiles.png'))
        for key, name, kw in (('lighthouse', 'harbor_lighthouse.gif', {}), ('harbor_crane', 'harbor_crane.gif', {}),
                              ('shipyard', 'harbor_shipyard.gif', {}), ('buoy', 'harbor_buoy.gif', {'scale': 2.0})):
            anim_gif(builds, frames, key, os.path.join(PREV, name), **kw)
        issues = preview_townfolk(os.path.join(PREV, 'harbor_townfolk.png'))
        if issues:
            print('townfolk preset issues:', issues)
        preview_scene(builds, frames, os.path.join(PREV, 'harbor_scene.png'))
        print('previews: docs/previews/harbor_all.png, harbor_scene.png, harbor_tiles.png, harbor_townfolk.png, '
              'harbor_lighthouse.gif, harbor_crane.gif, harbor_shipyard.gif, harbor_buoy.gif')


if __name__ == '__main__':
    main()
