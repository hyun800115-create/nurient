"""
tr2_pack.py - turn the raw train2 renders (tr2_render.py cache) into assets/train2/ (docs/CONTRACT_V42.md section AK):

  train_coach.png/.json, train_boxcar.png/.json, train_flatcar.png/.json   one atlas per car (frames + 8 shadow
        frames), palettised with libimagequant like the town train atlases; car frames get the characters' 1 px ink
        outline (char_pack.ink_outline), shadow frames the building shadow post
  train2_rails.png/.json   the loop decals (RGBA: exact difference matte), fence tiles, switch stand, water tower
  manifest.json            sprites{} (decals / tiles / props) + characters{} (kind "train") + trainConsist{}

The loop decals: the render R (loop + turnout + the straight main line built from town_rails.segment()) is turned into
the decal F that, drawn OVER the real rail_x tiles of assets/town (k = tiles listed in the sidecar, exactly where
RoadPaint puts them), gives  M * R + (1 - M) * tiles  (premultiplied), M = 1 on the loop / turnout / the joint at A,
0 on the plain straight (the tiles show through untouched).  Exact Porter-Duff inversion per pixel (8-bit rounding
and a few clamped pixels aside - the residual is printed and checked by tr2_check.py).

No Blender needed:  python3 tools/blender/tr2_pack.py [--cache DIR] [--out DIR]
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade)
import char_pack as cp   # noqa: E402  (read-only reuse: ink_outline)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'train2')
TOWN = os.path.join(ASSETS, 'town')
CACHE = '/tmp/fv_cache/train2'
MAX_SHEET = 2048
CARS = ['train_coach', 'train_boxcar', 'train_flatcar']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
LOOPS = ['rail_loop_ours', 'rail_loop_town']
PROPS = ['rail_fence_x', 'rail_fence_x_end', 'rail_switch_stand', 'rail_water_tower']
PX_X, PX_Y = 45.2548, 22.6274
SEG = math.sqrt(2.0)
LATTICE = (3120, 1315)              # L(i, j) = (3120 + 64 (i + j), 1315 + 32 (i - j))
PLACEHOLDER = {'train_coach': 'train_car_a x 1.33, light sky tint', 'train_boxcar': 'train_car_b x 1.15 + code crate '
               'stack', 'train_flatcar': 'train_car_b x 1.07'}
BUDGET_MIB = {'train_coach': 5.0, 'train_boxcar': 5.5, 'train_flatcar': 3.5}
STACK_STEP = 14
CARGO_SCALE = round(STACK_STEP / 19.0, 3)          # lgx crate icons: stackStep 19 at scale 1


def L(i, j):
    x, y = LATTICE[0] + 64 * (i + j), LATTICE[1] + 32 * (i - j)
    return (int(x) if float(x).is_integer() else round(x, 2), int(y) if float(y).is_integer() else round(y, 2))


def mib(w, h):
    return w * h * 4 / 1048576.0


# --------------------------------------------------------------------------- generic post

def shadow_post(im, width=10, floor=10):
    return pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=floor)), width=width)


def tile_shadow_seg(img, anchor, axis, seg, h=0.14):
    """Partition-of-unity cut of the SHADOW pixels of a tile rendered with shadow-only neighbours (same rule as
    civ_pack.tile_shadow_seg): w(u) + w(u - seg) = 1, a' = 1 - (1 - a)^w."""
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    H, W = a.shape[:2]
    ax, ay = anchor
    px, py = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H) + 0.5 - ay)
    gx = (px / PX_X + py / PX_Y) / 2.0
    gy = (px / PX_X - py / PX_Y) / 2.0
    u = np.abs(gx if axis == 'x' else gy)
    w = np.clip(0.5 + (seg / 2.0 - u) / (2 * h), 0.0, 1.0)
    alpha = a[..., 3] / 255.0
    lum = a[..., :3].mean(-1)
    m = np.clip(1.0 - lum / 70.0, 0.0, 1.0) * (a[..., 3] < 252)
    new = 1.0 - np.power(np.clip(1.0 - alpha, 1e-6, 1.0), w)
    alpha = alpha * (1 - m) + new * m
    a[..., 3] = np.clip(alpha * 255.0, 0, 255)
    a[a[..., 3] < 1] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


# --------------------------------------------------------------------------- town tiles (what RoadPaint draws)

def town_frame(atlas, name):
    a = json.load(open(os.path.join(TOWN, atlas + '.json')))
    im = Image.open(os.path.join(TOWN, atlas + '.png')).convert('RGBA')
    f = a['frames'][name]
    fr, ss = f['frame'], f['spriteSourceSize']
    out = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']))
    out.paste(im.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), (ss['x'], ss['y']))
    return out


def town_sprite(key):
    m = json.load(open(os.path.join(TOWN, 'manifest.json')))['sprites'][key]
    im = town_frame(m['atlas'], m['frame'])
    ax = m['anchor'][0] * im.width
    ay = m['anchor'][1] * im.height
    return im, (int(round(ax)), int(round(ay)))


def prem(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float64) / 255.0
    a[..., :3] *= a[..., 3:4]
    return a


def unprem(p):
    out = p.copy()
    al = out[..., 3:4]
    out[..., :3] = np.where(al > 1e-6, out[..., :3] / np.maximum(al, 1e-6), 0.0)
    return Image.fromarray(np.clip(out * 255.0 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def over(top, bot):
    return top + bot * (1.0 - top[..., 3:4])


def tiles_under(meta, size):
    """Premultiplied composite of the rail_x tiles exactly as RoadPaint draws them (k ascending, anchor at
    L(k + 0.5, 0)), in the decal's frame (anchor = T)."""
    W, H = size
    ax, ay = meta['anchorPx']
    iT = meta['T'][0]
    tile, (tax, tay) = town_sprite('rail_x')
    tp = prem(tile)
    acc = np.zeros((H, W, 4))
    for k in sorted(meta['tiles']):
        x = int(round(ax + 64 * (k + 0.5 - iT) - tax))
        y = int(round(ay + 32 * (k + 0.5 - iT) - tay))
        lay = np.zeros((H, W, 4))
        x0, y0 = max(0, x), max(0, y)
        x1, y1 = min(W, x + tile.width), min(H, y + tile.height)
        if x1 <= x0 or y1 <= y0:
            continue
        lay[y0:y1, x0:x1] = tp[y0 - y:y1 - y, x0 - x:x1 - x]
        acc = over(lay, acc)
    return acc


# --------------------------------------------------------------------------- loop decal matting

def smooth01(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


def repaint_mask(meta, size):
    """M in [0, 1] per pixel: 1 = the decal shows its own render, 0 = the tiles under it stay untouched."""
    W, H = size
    ax, ay = meta['anchorPx']
    mx = meta['mirror']
    px, py = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H) + 0.5 - ay)
    u = (px / PX_X + py / PX_Y) / 2.0          # ground metres from T (z = 0)
    y = (px / PX_X - py / PX_Y) / 2.0
    d = -u * mx                                 # distance from T toward the loop along the main line
    band = smooth01((1.38 - np.abs(y)) / 0.18)  # 1 on the straight main line band (ballast + drifts)
    t0, t1 = 0.05, 2.36                         # turnout repaint zone (d), ramps 0.25 m
    turn = smooth01((d + t0 + 0.25) / 0.25) * smooth01((t1 + 0.25 - d) / 0.25)
    dA = -meta['uA'] * mx
    near_a = smooth01((d - (dA - 0.6)) / 0.25)
    # distance to the loop centre line where it has left the main line (|y| > 0.3 m)
    path = np.array([p for p in meta['pathM'] if abs(p[1]) > 0.3], np.float64)
    dist = np.full((H, W), 1e9)
    for k in range(0, len(path), 2):
        dist = np.minimum(dist, np.hypot(u - path[k, 0], y - path[k, 1]))
    loop = smooth01((1.2 - dist) / 0.18)
    M = np.maximum(1.0 - band, np.maximum(np.maximum(turn, near_a), loop))
    return M


def solve_over(T, B):
    """F with F over B == T (premultiplied).  alpha from the alpha equation where the tiles are not opaque; raised
    where a colour channel needs it (the decal must darken / recolour what is under it) but never above the target's
    own opacity (a transparent target never paints).  Infeasible pixels (target less opaque than the tiles: the tiles
    cannot be erased) keep the tiles."""
    Ba, Ta = B[..., 3], T[..., 3]
    fa_alpha = np.where(Ba < 0.999, (Ta - Ba) / np.maximum(1.0 - Ba, 1e-6), 0.0)
    need = np.zeros_like(Ta)
    for c in range(3):
        Bc, Tc = B[..., c], T[..., c]
        need1 = np.where(Bc > 1e-6, 1.0 - Tc / np.maximum(Bc, 1e-6), 0.0)           # F_c >= 0
        need2 = np.where(Bc < 0.999, (Tc - Bc) / np.maximum(1.0 - Bc, 1e-6), 0.0)    # F_c <= F_a
        need = np.maximum(need, np.maximum(need1, need2))
    fa = np.clip(np.maximum(fa_alpha, np.minimum(need, Ta)), 0.0, 1.0)
    F = np.zeros_like(T)
    F[..., 3] = fa
    for c in range(3):
        F[..., c] = np.clip(T[..., c] - (1.0 - fa) * B[..., c], 0.0, fa)
    return F


def loop_decal(cache, key):
    meta = json.load(open(os.path.join(cache, key + '.json')))
    W, H = meta['frameSize']
    R = prem(pp.border_fade(pp.tint_shadow(pu.clean_alpha(Image.open(os.path.join(cache, key + '.png')), floor=10))))
    B = tiles_under(meta, (W, H))
    M = repaint_mask(meta, (W, H))[..., None]
    T = M * R + (1.0 - M) * B
    F = solve_over(T, B)
    img = unprem(F)
    a = np.asarray(img).copy()
    a[a[..., 3] < 2] = 0
    img = Image.fromarray(a, 'RGBA')
    # residual: (decal over tiles) vs target, 8-bit
    got = over(prem(img), B)
    err = np.abs(got - T)[..., :4].max(-1) * 255
    feas = T[..., 3] >= B[..., 3] - 1.0 / 255
    stats = {'maxErr': round(float(err[feas].max()), 2), 'p999Err': round(float(np.percentile(err[feas], 99.9)), 2),
             'meanErr': round(float(err.mean()), 4), 'infeasiblePx': int((~feas).sum()),
             'infeasibleMaxErr': round(float(err[~feas].max()) if (~feas).any() else 0.0, 2),
             'repaintFrac': round(float((M > 0.5).mean()), 4)}
    return img, meta, stats, M[..., 0]


# --------------------------------------------------------------------------- load

def load_cars(cache):
    cars = {}
    for c in CARS:
        p = os.path.join(cache, c, 'meta.json')
        if not os.path.exists(p):
            raise SystemExit('tr2_pack: %s not rendered (%s)' % (c, p))
        m = json.load(open(p))
        names = ['%s_%s_%d' % (a, d, i) for a, info in m['anims'].items() for d in info['dirs']
                 for i in range(info['frames'])]
        shadows = ['shadow_%s' % d for d in ALL8]
        miss = [n for n in names + shadows if not os.path.exists(os.path.join(cache, c, n + '.png'))]
        if miss:
            raise SystemExit('tr2_pack: %s misses %d frames (%s ...)' % (c, len(miss), miss[:3]))
        # idle = the move pose of frame 0 (wheels at the loop start, no sway): idle_<dir>_0 is an ALIAS of
        # move_<dir>_0 in the atlas (same rectangle; pack_pages keeps shared rectangles shared)
        frames = [(n, cp.ink_outline(Image.open(os.path.join(cache, c, n + '.png')))) for n in names
                  if not n.startswith('idle_')]
        frames += [(n, shadow_post(Image.open(os.path.join(cache, c, n + '.png')).convert('RGBA'), width=6,
                                   floor=12)) for n in shadows]
        m['names'], m['shadowNames'] = names, shadows
        cars[c] = (m, frames)
    return cars


def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def page_estimate(m, frames):
    """RGBA MiB of the page the build keeps (pack_pages: curve dirs S / E / N at 4 move frames), packed with the
    build's own skyline packer (tools/build/pack_pages.pack, read-only import)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('fv_pack_pages', os.path.join(GAME, 'tools', 'build', 'pack_pages.py'))
    pg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pg)
    sizes = []
    for n, im in frames:
        parts = n.split('_')
        if n.startswith('move_') and parts[1] in ('S', 'E', 'N') and int(parts[2]) % 2:
            continue
        bb = im.getbbox()
        sizes.append((bb[2] - bb[0] + 2, bb[3] - bb[1] + 2) if bb else (1, 1))
    W, H, _ = pg.pack(sizes)
    return mib(W, H), (W, H)


# --------------------------------------------------------------------------- manifest

CONVENTIONS = {
    'ppu': 64,
    'source': 'docs/CONTRACT_V42.md section AK, design docs/v42_plan.md section 5 (balloon loops, consist, stops).',
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin. Train cars: the ground point under the '
              'car centre on the track centre line. Loop decals: the turnout point T1 = L(-1, 0) / T2 = L(37, 0) '
              '(anchorPx is exact; place the frame so anchorPx lands on anchorWorldPx). Fence tile: the segment '
              'middle on the fence line. Props: the ground under the post / tower centre.',
    'train': 'characters{} kind "train" (same as assets/town): rendered dirs S, SE, E, NE, N + flipX mirrors (SW <- SE, '
             'W <- E, NW <- NE); frame names {anim}_{dir}_{i}; anims idle (1 f), move (8 f, one wheel turn at 45 '
             'deg / frame + a gentle sway; the game sets the fps from the speed: fps = 12 * v / 2.6 like the engine, '
             'or per car 8 * v / trackPerLoopM for slip-free wheels), door_open (box car only, SE + NE only, 4 f '
             'once; play it reversed to close, then idle). anims[a].dirs lists the dirs an anim exists in. '
             'shadowFrames: a soft ground shadow for each of the 8 headings (NOT mirrored: the light does not '
             'flip) with its own frameSize / anchor; draw it on the ground layer under the car, then the car.',
    'coupling': 'couplerM = the coupler faces in metres along the heading (front negative). The cars touch at the '
                'couplers: anchor spacing = couplerM.back of the car in front - couplerM.front of the car behind '
                '(trainConsist.*.spacingM). The dark gap between two bodies = the two coupler stubs (0.15 m each).',
    'points': 'every *Point / *Points / cargoSlots value is a px offset [dx, dy] from the car anchor for the rendered '
              'dir; for a mirrored dir negate dx and swap L <-> R. doorPoints[dir] = {L: [front, rear], R: [front, '
              'rear]} = ground beside each door (coach: the platform steps; box car: the two door halves); L / R = '
              'left / right of the car facing its heading. windowPoints = lit window centres visible in that dir '
              '(night glow), lampPoints = lanterns / tail lamps, cargoPoint = [dx, dy, behind] inside the open box '
              'car door (where crates fly in), cargoSlots = 6 x [dx, dy, behind] bottom-centre of each crate stack on '
              'the flat car deck (sorted back to front: draw in this order), stackStep px per crate icon at '
              'cargoScale. headTop = top of the roof (min over dirs; headTopDir per dir).',
    'decals': 'rail_loop_ours / rail_loop_town are ground decals (bake them into the ground like the rail tiles, AFTER '
              'the straight rail_x tiles listed in tilesUnder, which must be drawn as plain rail_x - no buffer stop at '
              'k -6 / 41). They are a difference matte against exactly those tiles: decal over tiles = the loop, the '
              'turnout (repainted straight route) and a seamless joint at A / T. The straight main line between A and '
              'the turnout is NOT in the decal (the tiles show through).',
    'tiles': 'rail_fence_x: one tile = sqrt(2) m along world X, step (64, 32) px, owns the post at its -X end, '
             'shadows join seamlessly; close a run with rail_fence_x_end at the +X end. Depth-sort with the actors '
             '(tileLayer "objects").',
    'shadows': 'decals / fence / props have a baked soft cool shadow falling screen down-right; train cars none (use '
               'their shadowFrames).',
}


def car_entry(c, m, frames):
    W, H = m['frameSize']
    anims = {}
    for a, info in m['anims'].items():
        anims[a] = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info.get('repeat', -1),
                    'dirs': info['dirs']}
    e = {'atlas': c, 'frameSize': [W, H], 'anchor': m['anchor'], 'anchorPx': m['anchorPx'], 'dirs': DIRS,
         'mirror': MIRROR, 'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'train',
         'lengthM': m['lengthM'], 'bodyM': m['bodyM'], 'couplerM': m['couplerM'], 'wheelR': m['wheelR'],
         'trackPerLoopM': round(2 * math.pi * m['wheelR'], 3), 'headTop': m['headTop'], 'headTopDir': m['headTopDir'],
         'shadow': None,
         'shadowFrames': {'atlas': c, 'frames': m['shadowFrames']['frames'], 'frameSize': m['shadowFrames']['frameSize'],
                          'anchor': m['shadowFrames']['anchor'], 'anchorPx': m['shadowFrames']['anchorPx'],
                          'notes': 'Soft ground shadow for each of the 8 headings (NOT mirrored: the light does not '
                                   'flip). Draw it under the car at the same position (ground layer), then the car.'},
         'notes': m['notes'], 'replaces': PLACEHOLDER[c]}
    for f in ('doorPoints', 'windowPoints', 'lampPoints', 'cargoPoint', 'cargoSlots'):
        if f in m:
            e[f] = m[f]
    if 'cargoSlots' in m:
        e['stackStep'] = STACK_STEP
        e['cargoScale'] = CARGO_SCALE
        e['cargoIcons'] = 'lgx_items crate / box icons (item_crate_*, cardboard_box_*), origin [0.5, 0.75], drawn at ' \
                          'cargoScale, k-th icon of a stack at (dx, dy - k * stackStep)'
    if c == 'train_boxcar':
        e['doorAnim'] = {'open': 'door_open', 'close': 'door_open reversed', 'dirs': ['SE', 'NE'],
                         'notes': 'stopped headings only (SE / NE, mirrored NW / SW); frame 3 = fully open'}
    return e


def build_manifest(cars, rail_meta, atlas_keys, loop_stats):
    man = {'version': 1, 'generator': 'tools/blender/tr2_render.py + tr2_pack.py (docs/CONTRACT_V42.md section AK)',
           'conventions': CONVENTIONS,
           'atlases': [{'key': k, 'png': 'train2/%s.png' % k, 'json': 'train2/%s.json' % k} for k in atlas_keys],
           'sprites': {}, 'characters': {}}
    for c in CARS:
        man['characters'][c] = car_entry(c, *cars[c])
    for key in LOOPS:
        m = rail_meta[key]
        W, H = m['frameSize']
        mx = m['mirror']
        iT = m['T'][0]
        world = L(*m['T'])
        pts = {}
        for n, (x, y) in m['pointsM'].items():
            pts[n] = [int(round((x + y) * PX_X)), int(round((x - y) * PX_Y))]
        path_px = [[round((x + y) * PX_X, 1), round((x - y) * PX_Y, 1)] for x, y in m['pathM']]
        tiles = [{'key': 'rail_x', 'k': k, 'at': [int(64 * (k + 0.5 - iT)), int(32 * (k + 0.5 - iT))],
                  'worldPx': list(L(k + 0.5, 0))} for k in m['tiles']]
        lat = {n: [round(m['T'][0] + mx * c[0], 3), round(c[1], 3)] for n, c in
               {'T': (0, 0), 'D': (-1.75, 1.75), 'C': (-3.5, 3.5), 'B': (-5, 3.5), 'A': (-5, 0),
                'far': (-6.75, 1.75)}.items()}
        stand = (m['T'][0] - mx * 0.2, -0.8)
        man['sprites'][key] = {
            'atlas': 'train2_rails', 'frame': key, 'anchor': [round(m['anchorPx'][0] / W, 6), round(m['anchorPx'][1] / H, 6)],
            'anchorPx': m['anchorPx'], 'frameSize': [W, H], 'kind': 'decal', 'layer': 'ground', 'drawAfter': 'rail_x',
            'anchorLattice': m['T'], 'anchorWorldPx': list(world), 'mirrorOfOurs': mx < 0,
            'tilesUnder': tiles, 'pointsPx': pts, 'pointsLattice': lat,
            'pathPx': path_px[::2], 'pathLengthM': m['pathLengthM'], 'radiusM': m['radiusM'],
            'radiusCells': 1.75, 'railTopM': m['railTopM'], 'gaugeM': m['gaugeM'],
            'switchTiesU': m['tieU'], 'frogM': m['frogM'],
            'placeHint': {'rail_switch_stand': {'lattice': [stand[0], stand[1]], 'worldPx': list(L(*stand)),
                                                'notes': 'beside the switch toe on the land side, at the end of the '
                                                         'two tie bars'},
                          'rail_water_tower': {'lattice': [round(m['T'][0] + mx * -5.0, 2), 1.75],
                                               'worldPx': list(L(m['T'][0] + mx * -5.0, 1.75)),
                                               'notes': 'optional, centre of the semicircle infield (1.6 m footprint '
                                                        'fits inside the inner ballast edge, radius 1.6 m)'}},
            'matte': loop_stats[key],
            'notes': ('Balloon loop at %s (%s): the spring turnout at %s (long switch ties, switch blades + two tie '
                      'bars reaching to the land side, closure rails, frog and guard rails; the straight route through '
                      'the turnout is repainted), curves D -> T and C -> D (R 1.75 cells), the straight B -> C and the '
                      'semicircle A -> B joining the straight main line at A. Same ballast / sleepers / rails / snow / '
                      'shadow as rail_x. Draw on the ground layer AFTER the rail_x tiles in tilesUnder (plain rail_x, '
                      'drawn exactly as RoadPaint draws them); pathPx = the loop centre line T -> D -> C -> B -> A in px '
                      'from the anchor (for RailPath cross-checks).') %
                     ('서리역' if mx > 0 else '솔방울역', key, m['T'])}
    for key in PROPS:
        m = rail_meta[key]
        e = {'atlas': 'train2_rails', 'frame': m['frames'][0], 'anchor': m['anchor'], 'anchorPx': m['anchorPx'],
             'frameSize': m['frameSize'], 'kind': m['kind'] if m['kind'] != 'tile' else 'decor',
             'topPx': m['topPx'], 'notes': m['notes']}
        for f in ('footprint', 'footprintM', 'tileAxis', 'segM', 'stepPx', 'postEnd', 'tileLayer', 'heightM'):
            if f in m:
                e[f] = m[f]
        if m.get('fxPoints'):
            e['fxPoints'] = m['fxPoints']
        if key == 'rail_switch_stand':
            e['frames'] = m['frames']
            e['states'] = {'green': m['frames'][0], 'yellow': m['frames'][1]}
            e['lampPoint'] = m['fxPoints'].get('lamp')
        if key == 'rail_water_tower':
            e['anims'] = {'pour': {'frames': m['frames'][1:], 'fps': m.get('pourFps', 10), 'repeat': -1}}
            e['spoutPoint'] = m['fxPoints'].get('spout')
        if key == 'rail_fence_x':
            e['run'] = {'ours': {'j': -0.75, 'tileCentresI': [-5.5, -4.5, -3.5, -2.5], 'endPostI': -2.0,
                                 'worldPx': [list(L(i, -0.75)) for i in (-5.5, -4.5, -3.5, -2.5)],
                                 'endWorldPx': list(L(-2.0, -0.75)),
                                 'notes': 'plan 5.1: j -0.75, i -6 .. -1.5 (4 tiles + the closing post; a 5th tile '
                                          'at i -1.5 would reach the switch toe)'}}
        man['sprites'][key] = e
    man['trainConsist'] = {
        'village': {'name': '마을', 'order': ['train_engine', 'train_coach', 'train_boxcar', 'train_flatcar'],
                    'spacingM': [2.72, 2.8, 2.5], 'lengthM': 10.6},
        'eup': {'name': '읍', 'order': ['train_engine', 'train_coach', 'train_coach', 'train_boxcar', 'train_flatcar'],
                'spacingM': [2.72, 3.0, 2.8, 2.5], 'lengthM': 13.6},
        'notes': 'train_engine lives in assets/town (couplerM -1.38 / 1.22). spacingM = anchor-to-anchor along the '
                 'track; lengthM = nose (engine front coupler) to tail (last back coupler).'}
    return man


# --------------------------------------------------------------------------- main

def main(argv):
    cache = CACHE
    out = OUT
    i = 0
    while i < len(argv):
        if argv[i] == '--cache':
            cache = argv[i + 1]
            i += 1
        elif argv[i] == '--out':
            out = argv[i + 1]
            i += 1
        i += 1
    cars = load_cars(cache)
    sheets = []
    report = {}
    for c in CARS:
        m, frames = cars[c]
        sheet, atlas = pu.pack_atlas(frames, max_width=MAX_SHEET, trim=True, padding=2)
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('tr2_pack: %s atlas %dx%d > %d' % (c, sheet.width, sheet.height, MAX_SHEET))
        for d in DIRS:
            atlas['frames']['idle_%s_0' % d] = json.loads(json.dumps(atlas['frames']['move_%s_0' % d]))
        page, psize = page_estimate(m, frames)
        report[c] = {'sheet': list(sheet.size), 'mib': round(mib(*sheet.size), 3), 'pageMiB': round(page, 3),
                     'pageSize': list(psize), 'frames': len(frames), 'budgetMiB': BUDGET_MIB[c]}
        sheets.append((c, sheet, atlas, True))
    # rails atlas: loop decals (matte), fence tiles, props
    rail_meta = {}
    rframes = []
    loop_stats = {}
    masks = {}
    for key in LOOPS:
        img, meta, stats, M = loop_decal(cache, key)
        rail_meta[key] = meta
        loop_stats[key] = stats
        masks[key] = M
        rframes.append((key, img))
    for key in PROPS:
        m = json.load(open(os.path.join(cache, key + '.json')))
        rail_meta[key] = m
        for n in m['frames']:
            im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
            if m.get('tileAxis'):
                im = pp.tint_shadow(tile_shadow_seg(pu.clean_alpha(im, floor=10), m['anchorPx'], m['tileAxis'],
                                                    m['segM']))
            else:
                im = shadow_post(im)
            rframes.append((n, im))
    rsheet, ratlas = pu.pack_atlas(rframes, max_width=MAX_SHEET, trim=True, padding=2)
    if rsheet.width > MAX_SHEET or rsheet.height > MAX_SHEET:
        raise SystemExit('tr2_pack: train2_rails atlas %dx%d too big' % rsheet.size)
    report['train2_rails'] = {'sheet': list(rsheet.size), 'mib': round(mib(*rsheet.size), 3), 'frames': len(rframes)}
    sheets.append(('train2_rails', rsheet, ratlas, False))
    os.makedirs(out, exist_ok=True)
    for fn in os.listdir(out):
        if fn.endswith(('.png', '.json')):
            os.remove(os.path.join(out, fn))
    for key, sheet, atlas, q in sheets:
        png = os.path.join(out, key + '.png')
        pu.save_atlas(sheet, atlas, png, os.path.join(out, key + '.json'), quantize=False)
        if q:
            quantize(sheet).save(png, optimize=True)
        report[key]['fileKB'] = round(os.path.getsize(png) / 1024.0, 1)
    man = build_manifest(cars, rail_meta, [k for k, _, _, _ in sheets], loop_stats)
    man['budget'] = {k: {'atlas': v['sheet'], 'rgbaMiB': v['mib'], 'pageMiB': v.get('pageMiB'),
                         'budgetMiB': v.get('budgetMiB')} for k, v in report.items()}
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    # masks for the previews / check
    os.makedirs(os.path.join(cache, 'pack'), exist_ok=True)
    for key, M in masks.items():
        Image.fromarray((M * 255).astype(np.uint8), 'L').save(os.path.join(cache, 'pack', key + '_mask.png'))
    with open(os.path.join(cache, 'pack', 'report.json'), 'w') as f:
        json.dump({'atlases': report, 'loops': loop_stats}, f, indent=1)
    tot = 0.0
    for k, v in report.items():
        tot += v['mib']
        print('%-14s %4dx%-4d %3d frames  RGBA %5.2f MiB%s  file %6.1f KB' % (
            k, v['sheet'][0], v['sheet'][1], v['frames'], v['mib'],
            ('  page(curve dirs 4 f) %.2f MiB / budget %.1f' % (v['pageMiB'], v['budgetMiB'])) if 'pageMiB' in v
            else '', v['fileKB']))
    print('total RGBA source-sum %.2f MiB; loop mattes %s' % (tot, json.dumps(loop_stats)))


if __name__ == '__main__':
    main(sys.argv[1:])
