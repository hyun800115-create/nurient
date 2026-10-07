"""
town_pack.py - turn the raw town renders (town_render.py cache) into assets/town/: trimmed Phaser atlases (each sheet
<= 2048 px) + manifest.json, plus the previews docs/previews/town_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/town_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
                                       [--out DIR] [--prev DIR]        (dry runs: write somewhere else)

Guard + merge (modelled on bld_pack): the packer MERGES into the existing assets/town/manifest.json - unknown
top-level fields and extra fields inside entries are kept, generated fields win - and it REFUSES (exit 1, nothing
written) when a key of the current manifest (sprites or characters) or of town_check.REQUIRED has no render in the
cache, because rebuilding the atlases would drop it.  --allow-partial packs what is cached and drops the missing
keys on purpose.  An empty manifest is never written.

Steps
  1. read every <build>.json sidecar + frames (buildings, street props, rail tiles) and the train cars'
     <cache>/<car>/meta.json + frames
  2. shadow-caught frames get the SAME post as the village buildings (pack_utils.clean_alpha + prop_pack.tint_shadow
     + prop_pack.border_fade); rail tiles additionally get the seamless partition-of-unity cut (town_rails doc);
     train frames get the characters' 1 px ink outline (char_pack.ink_outline); train shadow frames the shadow post
  3. atlases: town_civic, town_shops, town_homes, town_park, town_street, town_rails (split _2, _3 .. at 2048, a
     build's frames always stay on one sheet) + one atlas per train car; palettised with libimagequant (256 colours,
     dither 0.6, like the characters / buildings) by default - --quantize off keeps RGBA (~2.5x bigger), --quantize
     auto only palettises above 90 % of the 8 MB budget
  4. assets/town/manifest.json: sprites (buildings, props, rail tiles) + characters (train cars, kind "train")
  5. previews: docs/previews/town_all.png, town_scene.png, town_anims.gif, town_train.gif
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
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, shelf_preview, font)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'town')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 8.0
ATLAS_ORDER = ['town_civic', 'town_shops', 'town_homes', 'town_park', 'town_street', 'town_rails']
TRAIN = ['train_engine', 'train_car_a', 'train_car_b']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
POINT_SINGLE = {'in': 'inPoint', 'door': 'doorPoint', 'track': 'trackPoint', 'stop': 'stopPoint', 'cash': 'cashPoint'}
POINT_LIST = {'staff': 'staffPoints', 'customer': 'customerPoints', 'gather': 'gatherPoints', 'seat': 'seatPoints',
              'wait': 'waitPoints', 'play': 'playPoints', 'board': 'boardPoints', 'work': 'workPoints'}
DIR_LIST = {'staff': 'staffDirs', 'customer': 'customerDirs', 'gather': 'gatherDirs', 'seat': 'seatDirs',
            'wait': 'waitDirs', 'play': 'playDirs', 'board': 'boardDirs', 'work': 'workDirs', 'door': 'doorDir',
            'stop': 'stopDir'}
SQ2 = math.sqrt(2.0)


# --------------------------------------------------------------------------- post

def rail_cut(img, anchor, axis, seg, ramp, open_neg, open_pos):
    """Seamless tile: partition-of-unity weight along the axis (see town_rails), alpha' = 1 - (1 - alpha)^w."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    H, W = a.shape[:2]
    ax, ay = anchor
    px, py = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H) + 0.5 - ay)
    gx = (px / 45.2548 + py / 22.6274) / 2.0
    gy = (px / 45.2548 - py / 22.6274) / 2.0
    u = gx if axis == 'x' else gy
    half = seg / 2.0
    w_pos = np.clip(0.5 + (half - u) / (2 * ramp), 0.0, 1.0) if open_pos else np.ones_like(u)
    w_neg = np.clip(0.5 + (half + u) / (2 * ramp), 0.0, 1.0) if open_neg else np.ones_like(u)
    w = np.minimum(w_pos, w_neg)
    alpha = a[..., 3] / 255.0
    new = 1.0 - np.power(np.clip(1.0 - alpha, 1e-6, 1.0), w)
    a[..., 3] = np.clip(new * 255.0, 0, 255)
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


def load(cache):
    builds, cars = {}, {}
    for fn in sorted(os.listdir(cache)):
        p = os.path.join(cache, fn)
        if fn.endswith('.json'):
            try:
                m = json.load(open(p))
            except Exception:
                continue
            if 'build' in m and 'frames' in m and all(os.path.exists(os.path.join(cache, n + '.png'))
                                                      for n in m['frames']):
                builds[m['build']] = m
        elif fn in TRAIN and os.path.exists(os.path.join(p, 'meta.json')):
            m = json.load(open(os.path.join(p, 'meta.json')))
            names = ['%s_%s_%d' % (a, d, i) for a, info in m['anims'].items() for d in DIRS
                     for i in range(info['frames'])]
            shadows = ['shadow_%s' % d for d in ALL8]
            if all(os.path.exists(os.path.join(p, n + '.png')) for n in names + shadows):
                m['names'] = names
                m['shadowNames'] = shadows
                cars[fn] = m
            else:
                print('note: %s has missing frames - not packed' % fn)
    frames = {}
    for k, m in builds.items():
        for n in m['frames']:
            im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
            im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
            if m.get('tileAxis'):
                im = rail_cut(im, m['anchorPx'], m['tileAxis'], m['segM'], m['rampM'], m['openEnds']['neg'],
                              m['openEnds']['pos'])
            frames[n] = im
    import char_pack as cp      # read-only reuse of the characters' ink outline
    cframes = {}
    for c, m in cars.items():
        for n in m['names']:
            cframes[(c, n)] = cp.ink_outline(Image.open(os.path.join(cache, c, n + '.png')))
        for n in m['shadowNames']:
            im = Image.open(os.path.join(cache, c, n + '.png')).convert('RGBA')
            cframes[(c, n)] = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=6)), width=6)
    return builds, cars, frames, cframes


# --------------------------------------------------------------------------- manifest

def footprint_poly(m):
    """Ground corners of a rectangular footprint as px offsets (W, S, E, N corners on screen), else None."""
    fm = m.get('footprintM')
    if not isinstance(fm, list) or len(fm) != 2:
        return None
    a, b = fm
    yaw = math.radians(m.get('yaw', 0.0))
    pts = []
    for lx, ly in ((-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)):
        x = lx * math.cos(yaw) - ly * math.sin(yaw)
        y = lx * math.sin(yaw) + ly * math.cos(yaw)
        pts.append([int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274))])
    return pts


def sprite_entry(k, m, frame_atlas):
    fr = m['frames'][0]
    s = {'atlas': frame_atlas[fr], 'frame': fr, 'anchor': m['anchor'], 'kind': m['kind'], 'frameSize': m['frameSize']}
    if 'footprint' in m:
        s['footprint'] = m['footprint']
        s['footprintM'] = m['footprintM']
    poly = footprint_poly(m)
    if poly and not m.get('tileAxis'):
        s['footprintPoly'] = poly
    s['topPx'] = m['topPx'].get(fr) if isinstance(m['topPx'], dict) else m['topPx']
    if m.get('front'):
        s['front'] = m['front']
    for f in ('name', 'zone'):
        if f in m:
            s[f] = m[f]
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
            if dirs.get(kind):
                s[DIR_LIST[kind]] = dirs[kind]
    stops = {kind[5:]: v[0] for kind, v in pts.items() if kind.startswith('stop_')}
    if stops:
        s['trainStops'] = stops
    if 'staffPoints' in s:
        s['staffDepth'] = 'front'
    for f in ('tileAxis', 'segM', 'stepPx', 'rampM', 'openEnds', 'railTopM', 'gaugeM', 'variant', 'trackAxis',
              'trainStopsNote'):
        if f in m:
            s[f] = m[f]
    if m.get('notes'):
        s['notes'] = m['notes']
    return s


def car_entry(c, m):
    W, H = m['frameSize']
    anims = {a: {'frames': info['frames'], 'fps': info['fps'], 'repeat': info.get('repeat', -1)}
             for a, info in m['anims'].items()}
    e = {'atlas': c, 'frameSize': [W, H], 'anchor': m['anchor'], 'dirs': DIRS, 'mirror': MIRROR,
         'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'train', 'lengthM': m['lengthM'],
         'couplerM': m['couplerM'], 'headTop': m['headTop'], 'shadow': None,
         'shadowFrames': {'atlas': c, 'frames': m['shadowFrames']['frames'], 'frameSize': m['shadowFrames']['frameSize'],
                          'anchor': m['shadowFrames']['anchor'],
                          'notes': 'Soft ground shadow for each of the 8 headings (NOT mirrored: the light does not '
                                   'flip). Draw it under the car at the same position (ground layer), then the car.'},
         'notes': m.get('notes', '')}
    for f in ('smokePoint', 'lampPoint', 'cargoPoint', 'boardPoint'):
        if f in m:
            e[f] = m[f]
    return e


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre (rail tiles: track '
              'centre line, tile middle; train cars: ground point under the car centre on the track centre line).',
    'front': '-Y = the building faces screen down-left (SW); its other visible side is screen down-right (SE). '
             'yaw-45 props (fountain) face the camera (S).',
    'footprint': 'screen-px bounding size [w, h] of the ground diamond centred on the anchor; footprintM = metres; '
                 'footprintPoly = the 4 ground corners in px (left, bottom, right, top) for depth / collision tests.',
    'topPx': 'visual height above the anchor in px (bubbles / progress rings).',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled). *Dirs = the '
              'facing of a character standing there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX). All standing '
              'points are in front of the building geometry: draw characters there above the building sprite '
              '(staffDepth "front").',
    'doorPoint': 'where a visitor walks to before "entering" (fade out / hide) - in front of the door.',
    'customerPoints': 'queue spots in front of a shop (first = nearest the door).',
    'staffPoints': 'shopkeeper / official standing outside (greeting, florist at the stand, firefighter...).',
    'inPoint': 'delivery pad where porters drop goods bought from the village (cans, bread, fish, planks, ingots).',
    'gatherPoints': 'crowd spots (school line-up, town-hall meeting, fountain).',
    'seatPoints': 'anchor of a sitting character (benches, terrace chairs, fountain rim).',
    'waitPoints/boardPoints': 'station platform / sled stop: waiting spots and where passengers step on / off a car.',
    'playPoints': 'kids playing (school yard, playground).',
    'work': 'idle frame = resting state; anims.work (+ a named alias: ring / spin / water) = seamless 4-frame loop '
            'with the motion baked in; all frames share frameSize + anchor (swap frames in place, like the village '
            'stations: spr:<key>:work).',
    'fxPoints': 'px offsets for game FX: smoke (chimney tops), steam, bell, clock, siren, sign, light ...',
    'shadows': 'buildings / props / rail tiles have a baked soft cool shadow falling screen down-right; train cars have '
               'none (use their shadowFrames).',
    'rails': 'rail tiles: one tile = sqrt(2) m (one 128x64 grid cell) along world X (rail_x*, step (+64, +32) px) or Y '
             '(rail_y*, step (+64, -32) px); consecutive tiles join seamlessly incl. the shadow (partition-of-unity '
             'cut). Ground layer (kind decal). *_end_p / *_end_n: buffer stop at the +axis / -axis end; *_crossing: '
             'level crossing for a road. railTopM = rail head height (train wheels), gaugeM.',
    'train': 'characters{} entries kind "train": 5 rendered dirs + flipX mirrors, frame names {anim}_{dir}_{i}, '
             'idle + move. Rails run along the iso axes, so on straight track the train heads SE / NW (world +-X) or '
             'NE / SW (world +-Y); S, E, N are the in-between headings for curves / turning. Chain the cars along the '
             'track: anchor distance = couplerM.back of the car in front - couplerM.front of the car behind (metres '
             'along the heading; engine->car_a 2.34 m, car_a->car_b 2.24 m). move loop = one wheel turn (~1.7 m of '
             'track): at 12 fps move the train ~2.6 m/s (166 px/s) for no wheel slip.',
}


def build_manifest(builds, cars, frame_atlas, atlas_keys, old):
    sprites, chars = {}, {}
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, k))
    for k in order:
        sprites[k] = sprite_entry(k, builds[k], frame_atlas)
    for c in TRAIN:
        if c in cars:
            chars[c] = car_entry(c, cars[c])
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/town_render.py + town_pack.py (docs/CONTRACT_V4.md section K)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'town/%s.png' % a, 'json': 'town/%s.json' % a} for a in atlas_keys]
    oldsp, oldch = (old or {}).get('sprites', {}), (old or {}).get('characters', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    if 'train_engine' in chars:
        man['trainConsist'] = {'order': [c for c in TRAIN if c in chars],
                               'spacingM': [round(chars['train_engine']['couplerM']['back'] -
                                                  chars.get('train_car_a', chars['train_engine'])['couplerM']['front'],
                                                  3),
                                            round(chars.get('train_car_a', chars['train_engine'])['couplerM']['back'] -
                                                  chars.get('train_car_b', chars['train_engine'])['couplerM']['front'],
                                                  3)],
                               'notes': 'engine first; each car follows the one in front at spacingM metres (anchor to '
                                        'anchor) along the track.'}
    return man


# --------------------------------------------------------------------------- pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def pack_groups(groups):
    """groups: {atlas_name: [[(frame, img), ...] per build]} -> [(atlas_key, sheet, atlas)].  A build's frames always
    land on the same sheet; a new sheet (_2, _3 ..) starts when the next build would push past 2048 px."""
    out = []
    for g in ATLAS_ORDER + sorted(set(groups) - set(ATLAS_ORDER)):
        if g not in groups:
            continue
        builds = sorted(groups[g], key=lambda fr: -sum(im.width * im.height for _, im in fr))
        sheets = []                      # list of frame lists
        for fr in builds:
            placed = False
            for sh in sheets:
                sheet, _ = pu.pack_atlas(sh + fr, max_width=MAX_SHEET, trim=True, padding=2)
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


def pack_all(builds, cars, frames, cframes, mode):
    groups = {}
    for k, m in builds.items():
        groups.setdefault(m['atlas'], []).append([(n, frames[n]) for n in m['frames']])
    sheets = pack_groups(groups)
    for c in TRAIN:
        if c in cars:
            items = [(n, cframes[(c, n)]) for n in cars[c]['names'] + cars[c]['shadowNames']]
            sheet, atlas = pu.pack_atlas(items, max_width=MAX_SHEET, trim=True, padding=2)
            sheets.append((c, sheet, atlas))
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('town_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if (fn.startswith('town_') or fn.startswith('train_')) and fn.endswith(('.png', '.json')):
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
        print('%-18s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return sheets, frame_atlas, total


# --------------------------------------------------------------------------- previews

def preview_all(builds, cars, frames, cframes, out):
    ents = []
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, k))
    for k in order:
        m = builds[k]
        ents.append((k, frames[m['frames'][0]]))
        if 'anims' in m:
            n = m['anims']['work']['frames'][1]
            ents.append((k + ' (%s)' % (m.get('animAlias') or 'work'), frames[n]))
    for c in TRAIN:
        if c in cars:
            for d in ('SE', 'E', 'NE'):
                ents.append(('%s move_%s' % (c, d), cframes[(c, 'move_%s_1' % d)]))
    pp.shelf_preview(ents, out, max_w=2400, title='Solbangul town (neighbour town) - assets/town at 1x, PPU 64: buildings, '
                                                  'street props, rail tiles, snow train (idle + one anim frame)')


def iso_px(x, y, ox, oy):
    return ox + (x + y) * 45.2548, oy + (x - y) * 22.6274


class Scene:
    def __init__(self, W, H, ox, oy, bg=(244, 247, 251)):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.img = Image.new('RGBA', (W, H), bg + (255,))
        self.ground = []
        self.placed = []
        self.labels = []

    def p(self, x, y):
        return iso_px(x, y, self.ox, self.oy)

    def put(self, im, anchor_px, x, y, bias=0.0, ground=False, label=None, depth=None):
        sx, sy = self.p(x, y)
        item = (sy + bias if depth is None else depth, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])))
        (self.ground if ground else self.placed).append(item)
        if label:
            self.labels.append((label, sx, sy + 18))

    def road(self, tex, x0, x1, y0, y1):
        """Fill the ground rectangle [x0,x1] x [y0,y1] (metres) with the tiled road texture."""
        poly = [self.p(x0, y0), self.p(x1, y0), self.p(x1, y1), self.p(x0, y1)]
        mask = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        tiled = Image.new('RGBA', (self.W, self.H))
        for ty in range(0, self.H, tex.height):
            for tx in range(0, self.W, tex.width):
                tiled.paste(tex, (tx, ty))
        self.img.paste(tiled, (0, 0), mask)
        d = ImageDraw.Draw(self.img)
        d.line(poly + [poly[0]], fill=(196, 205, 220, 255), width=2)

    def finish(self, out, caption):
        for _, im, px, py in sorted(self.ground, key=lambda t: t[0]):
            self.img.alpha_composite(im, (px, py))
        for _, im, px, py in sorted(self.placed, key=lambda t: t[0]):
            self.img.alpha_composite(im, (px, py))
        d = ImageDraw.Draw(self.img)
        f = pp.font(13)
        for text, sx, sy in self.labels:
            tw = f.getlength(text)
            d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7, fill=(255, 255, 255, 215))
            d.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
        d.rectangle([0, self.H - 40, self.W, self.H], fill=(31, 95, 168, 255))
        d.text((16, self.H - 33), caption, fill=(255, 255, 255), font=pp.font(18))
        self.img.convert('RGB').save(out, optimize=True)


def preview_scene(builds, cars, frames, cframes, out):
    """Mock town block at 1x: shop street + homes behind, civic row, park, station + track with the train, roads from
    assets/ui2/ground_road, villagers from assets/villagers(2) for scale.  Placement in world metres; depth = anchor y."""
    import bld_pack as bp       # read-only reuse: atlas_lib (reads existing manifests)
    sc = Scene(3000, 2060, 1420, 1190)
    road_p = os.path.join(ASSETS, 'ui2', 'ground_road.png')
    tex = Image.open(road_p).convert('RGBA') if os.path.exists(road_p) else Image.new('RGBA', (64, 64),
                                                                                       (200, 205, 214, 255))
    # roads: main street along X (y in [-1.6, 1.6]), cross street along Y (x in [-1.6, 1.6]), lane to the station
    sc.road(tex, -17.0, 18.0, -1.6, 1.6)
    sc.road(tex, -1.6, 1.6, -13.5, 14.0)
    sc.road(tex, -17.0, -1.6, -8.4, -6.8)

    def B(key, x, y, label=True, frame=None):
        m = builds.get(key)
        if not m:
            return None
        sc.put(frames[frame or m['frames'][0]], m['anchorPx'], x, y, label=key if label else None)
        return m

    def pts(m, kind):
        return m['framePoints'][m['frames'][0]].get(kind, [])

    vill = bp.atlas_lib('villagers/manifest.json')
    vill2 = bp.atlas_lib('villagers2/manifest.json')

    def person(key, anim, x=None, y=None, sx=None, sy=None, flip=False, bias=0.5):
        im = None
        for lib in (vill, vill2):
            if lib and key in lib[0].get('characters', {}):
                im = lib[1](lib[0]['characters'][key]['atlas'], anim)
                break
        if im is None:
            return
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if sx is None:
            sx, sy = sc.p(x, y)
        sc.placed.append((sy + bias, im, int(round(sx - 64)), int(round(sy - 104))))

    def at_point(m, bx, by, kind, k=0):
        p = pts(m, kind)
        if len(p) <= k:
            return None
        sx, sy = sc.p(bx, by)
        return sx + p[k][0], sy + p[k][1]

    # --- shop street (north side of the main street, fronts face the road)
    shops = [('cafe', -14.5), ('clothing_store', -11.3), ('hair_salon', -8.1), ('flower_shop', -4.9),
             ('bookstore', 5.7), ('toy_shop', 8.9), ('restaurant', 12.2)]
    for k, x in shops:
        m = B(k, x, 3.4)
        if m:
            c = at_point(m, x, 3.4, 'customer')
            if c:
                person(['npc_kid_girl', 'npc_aunt', 'npc_teen_girl', 'npc_young_man', 'npc_grandma', 'npc_uncle',
                        'npc_kid_boy'][hash(k) % 7], 'idle_NE_0', sx=c[0], sy=c[1])
    # --- homes behind the shops
    for k, x in (('townhouse_a', -14.5), ('townhouse_b', -11.6), ('townhouse_c', -8.7), ('townhouse_d', -5.8),
                 ('apartment_b', 3.6), ('apartment_a', 8.4)):
        B(k, x, 7.6)
    # --- civic + market row south of the main street (fronts face screen down-left: the lane / station side)
    for k, x, y in (('supermarket', -13.8, -3.8), ('post_office', -9.6, -3.9), ('town_hall', 4.6, -3.6),
                    ('clinic', 9.4, -3.8), ('hardware_store', -5.6, -3.9), ('school', 6.4, 13.0)):
        B(k, x, y, label=True)
    B('police_box', 2.9, 2.4)
    B('fire_station', 16.0, 3.7)
    B('carpenter_workshop', 16.0, 8.2)
    # --- park on the east of the cross street, south side
    m = B('park_fountain', 4.0, -9.6, frame=(builds['park_fountain']['anims']['work']['frames'][1]
                                             if 'park_fountain' in builds else None))
    if m:
        for k in range(3):
            c = at_point(m, 4.0, -9.6, 'seat', k)
            if c:
                person(['npc_grandpa', 'npc_kid_boy', 'npc_herbalist'][k], 'idle_S_0', sx=c[0], sy=c[1])
    m = B('playground', 9.0, -9.2)
    if m:
        for k in range(2):
            c = at_point(m, 9.0, -9.2, 'play', k)
            if c:
                person(['npc_kid_girl', 'npc_kid_prankster'][k], 'idle_SE_0', sx=c[0], sy=c[1])
    # --- street furniture
    for k, x, y in (('streetlight', -2.3, 2.3), ('streetlight', 2.4, -2.4), ('streetlight_double', -9.6, -1.9),
                    ('streetlight', 10.5, 2.2), ('bench_x', 0.7, -9.6), ('bench_y', -2.6, -9.5), ('sled_stop', -2.9, -2.6),
                    ('town_gate', 0.0, 13.2)):
        B(k, x, y, label=k in ('sled_stop', 'town_gate', 'streetlight_double'))
    # --- station + track + train (track along X at the station's trackPoint)
    st = builds.get('train_station')
    sxw, syw = -10.0, -10.6
    if st:
        B('train_station', sxw, syw)
        tp = pts(st, 'track')
        ty_px = tp[0] if tp else [0, 0]
        # track point px -> world offset (track runs along X at world y = syw + dy)
        gx = (ty_px[0] / 45.2548 + ty_px[1] / 22.6274) / 2.0
        gy = (ty_px[0] / 45.2548 - ty_px[1] / 22.6274) / 2.0
        tx0, ty0 = sxw + gx, syw + gy
        for k in range(-9, 10):
            key = 'rail_x'
            if k == -9:
                key = 'rail_x_end_n'
            elif k == 7:
                key = 'rail_x_crossing'
            rm = builds.get(key) or builds.get('rail_x')
            if rm:
                sc.put(frames[rm['frames'][0]], rm['anchorPx'], tx0 + k * SQ2, ty0, ground=True)
        if 'train_engine' in cars:
            for c, dx in (('train_engine', 2.34), ('train_car_a', 0.0), ('train_car_b', -2.24)):
                if c in cars:
                    m = cars[c]
                    sh = cframes[(c, 'shadow_SE')]
                    sc.put(sh, m['shadowFrames']['anchorPx'], tx0 + dx, ty0, ground=True, bias=1.0)
                    sc.put(cframes[(c, 'move_SE_2')], m['anchorPx'], tx0 + dx, ty0)
            sc.labels.append(('snow train (engine + 2 cars) on rail_x tiles', *sc.p(tx0 + 0.5, ty0 - 2.2)))
        for k, key in enumerate(('npc_grandma', 'npc_kid_boy', 'npc_merchant')):
            w = st['framePoints'][st['frames'][0]].get('wait', [])
            if len(w) > k:
                s0 = sc.p(sxw, syw)
                person(key, 'idle_S_0', sx=s0[0] + w[k][0], sy=s0[1] + w[k][1])
    # a few walkers on the streets
    for k, (key, x, y, anim, flip) in enumerate((('npc_young_man', -3.0, 0.4, 'walk_SE_2', False),
                                                 ('npc_kid_girl', 0.3, -4.0, 'walk_NE_3', True),
                                                 ('npc_aunt', 6.0, -0.6, 'walk_SE_5', True),
                                                 ('npc_postman', -10.0, 0.6, 'walk_SE_1', False),
                                                 ('npc_skater', 0.6, 6.0, 'walk_NE_2', False),
                                                 ('npc_blue', -12.5, -7.6, 'walk_SE_0', False))):
        person(key, anim, x, y, flip=flip)
    sc.finish(out, 'Solbangul town mock block at 1x (PPU 64): assets/town buildings + rails + train, roads = '
                   'assets/ui2/ground_road, people = assets/villagers + villagers2 for scale')


def _gif(frames_rgb, durs, out):
    import bld_pack as bp
    bp._gif(frames_rgb, durs, out)


def preview_anims_gif(builds, frames, out, bg=(236, 241, 248)):
    st = [k for k in builds if 'anims' in builds[k]]
    if not st:
        return
    gap = 10
    scale = 0.6
    crops = {}
    for k in st:
        m = builds[k]
        names = [m['frames'][0]] + m['anims']['work']['frames']
        bb = None
        for n in names:
            b = frames[n].getbbox()
            bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
        crops[k] = bb
    sz = {k: (int((crops[k][2] - crops[k][0]) * scale), int((crops[k][3] - crops[k][1]) * scale)) for k in st}
    Wd = sum(sz[k][0] for k in st) + gap * (len(st) + 1)
    Hd = max(sz[k][1] for k in st) + 30

    def compose(idx):
        im = Image.new('RGBA', (Wd, Hd), bg + (255,))
        dr = ImageDraw.Draw(im)
        x = gap
        for k in st:
            m = builds[k]
            n = m['anims']['work']['frames'][idx % 4]
            f = frames[n].crop(crops[k]).resize(sz[k], Image.LANCZOS)
            im.alpha_composite(f, (x, Hd - 26 - sz[k][1]))
            dr.text((x + 6, Hd - 22), '%s (%s)' % (k, m.get('animAlias') or 'work'), fill=(20, 24, 32), font=pp.font(13))
            x += sz[k][0] + gap
        return im.convert('RGB')
    fr = [compose(i) for _ in range(6) for i in range(4)]
    _gif(fr, [125] * len(fr), out)


def preview_train_gif(builds, cars, frames, cframes, out):
    """Two short lines meeting in an L: the train runs SE along rail_x (from the rail_x_end_n buffer) and NE along
    rail_y (toward the rail_y_end_p buffer) - tiled track, shadows, move anim (2 anim frames per GIF frame)."""
    if 'train_engine' not in cars or 'rail_x' not in builds:
        return
    W, H = 1500, 720
    seq = []
    n = 20
    step = 2 * 1.7 / 8.0                       # metres per GIF frame (2 anim frames of one 1.7 m wheel turn)
    consist = (('train_engine', 0.0), ('train_car_a', -2.34), ('train_car_b', -4.58))
    for t in range(n):
        sc = Scene(W, H, 700, 330, bg=(244, 247, 251))
        for k in range(11):
            key = 'rail_x_end_n' if k == 0 and 'rail_x_end_n' in builds else 'rail_x'
            rm = builds[key]
            sc.put(frames[rm['frames'][0]], rm['anchorPx'], k * SQ2, 3.0, ground=True)
            key = 'rail_y_end_p' if k == 0 and 'rail_y_end_p' in builds else 'rail_y'
            rm = builds.get(key)
            if rm:
                sc.put(frames[rm['frames'][0]], rm['anchorPx'], -1.5, 1.5 - k * SQ2, ground=True)
        hx = 5.0 + t * step
        hy = -7.5 + t * step
        for c, d in consist:
            if c not in cars:
                continue
            m = cars[c]
            fr = 'move_%s_%d'
            sc.put(cframes[(c, 'shadow_SE')], m['shadowFrames']['anchorPx'], hx + d, 3.0, ground=True, bias=1)
            sc.put(cframes[(c, fr % ('SE', (t * 2) % 8))], m['anchorPx'], hx + d, 3.0)
            sc.put(cframes[(c, 'shadow_NE')], m['shadowFrames']['anchorPx'], -1.5, hy + d, ground=True, bias=1)
            sc.put(cframes[(c, fr % ('NE', (t * 2) % 8))], m['anchorPx'], -1.5, hy + d)
        for _, im, px, py in sorted(sc.ground, key=lambda q: q[0]):
            sc.img.alpha_composite(im, (px, py))
        for _, im, px, py in sorted(sc.placed, key=lambda q: q[0]):
            sc.img.alpha_composite(im, (px, py))
        d = ImageDraw.Draw(sc.img)
        d.text((12, 10), 'snow train on tiled rail_x (heading SE) and rail_y (heading NE) with end buffers; move anim, '
                         'cars chained at couplerM spacing, shadowFrames under each car', fill=(30, 34, 44),
               font=pp.font(15))
        seq.append(sc.img.convert('RGB'))
    _gif(seq, [83] * len(seq), out)


# --------------------------------------------------------------------------- main

def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('town_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'town_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is '
                         'never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('town_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다: %s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'town_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다. 아무 파일도 바꾸지 '
        '않았습니다.\ntown_pack: ABORT - %d key(s) in the current manifest (or town_check.REQUIRED; * = only there) are '
        'missing from the render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/town_render.py -- <keys> first, or pass --cache <full cache>;'
        ' to drop them on purpose re-run with --allow-partial' % (len(missing), cache, len(missing), cache, listing))


def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'town')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = args[args.index('--quantize') + 1] if '--quantize' in args else 'on'
    if not os.path.isdir(cache):
        sys.exit('town_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run town_render.py first or pass --cache DIR.' % cache)
    builds, cars, frames, cframes = load(cache)
    have = set(builds) | {'char:' + c for c in cars}
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from town_check import REQUIRED, REQUIRED_CHARS
    except ImportError:
        REQUIRED, REQUIRED_CHARS = [], []
    need = set(REQUIRED) | {'char:' + c for c in REQUIRED_CHARS}
    in_man = set()
    if old:
        in_man = set(old.get('sprites', {})) | {'char:' + c for c in old.get('characters', {})}
        need |= in_man
    dropped = guard(cache, have, need, in_man, '--allow-partial' in args)
    del dropped
    sheets, frame_atlas, total = pack_all(builds, cars, frames, cframes, mode)
    man = build_manifest(builds, cars, frame_atlas, [s[0] for s in sheets], old)
    if not man['sprites'] and not man['characters']:
        sys.exit('town_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('sprites: %d  characters: %d  payload %.2f MB' % (len(man['sprites']), len(man['characters']),
                                                            total / 1048576.0))
    if '--no-previews' not in args:
        os.makedirs(PREV, exist_ok=True)
        preview_all(builds, cars, frames, cframes, os.path.join(PREV, 'town_all.png'))
        preview_scene(builds, cars, frames, cframes, os.path.join(PREV, 'town_scene.png'))
        preview_anims_gif(builds, frames, os.path.join(PREV, 'town_anims.gif'))
        preview_train_gif(builds, cars, frames, cframes, os.path.join(PREV, 'town_train.gif'))
        print('previews: docs/previews/town_all.png, town_scene.png, town_anims.gif, town_train.gif')


if __name__ == '__main__':
    main()
