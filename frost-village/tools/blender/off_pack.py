"""
off_pack.py - turn the raw 촌장 사무실 renders (off_render.py cache) into assets/office/: two trimmed Phaser atlases
(office_bld: the cutaway layers + overlays + glow + the mailbox; office_items: the six items) + manifest.json
(docs/CONTRACT_V42.md section AI).  Then off_preview.py makes the docs/previews/off_* previews.

No Blender needed: python3 with numpy + Pillow (+ `imagequant`).
    python3 tools/blender/off_pack.py [--cache DIR] [--out DIR] [--no-previews] [--rgba]

Steps
  1. chief_office: the open-building ground shadow is merged UNDER _floor, the closed-building ground shadow UNDER
     _shell (which also carries the outdoor props: _shell alone is the closed look, and the `chief_office` sprite
     points at it); _glow is built from the glow mask (lit glass -> bright warm panes + two soft halos, NORMAL
     blend artwork); patch overlays are cut to the union of their solo silhouettes.
  2. every building frame is cropped to the union of all layers / overlays / states (one shared frame + anchor);
     the mailbox frames likewise among themselves.
  3. atlases: shelf-packed at the sheet width that gives the smallest page (<= 2048 px), palettised with
     libimagequant (--rgba keeps 8-bit RGBA); budget office_bld <= 5.5 MiB RGBA source-sum.
  4. manifest: sprites{} (building + layers + overlays + glow + props, office_mailbox, items) + conventions.
Guard: refuses (exit 1, nothing written) when a required render is missing from the cache.
"""
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, carry_scale)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'office')
PREV = os.path.join(GAME, 'docs', 'previews')
KEY = 'chief_office'
PX_X, PX_Y, PX_Z = 45.2548, 22.6274, 55.4256
MAX_FRAME = (640, 576)
BUDGET_BLD_MIB = 5.5
BLD_ATLAS, ITEM_ATLAS = 'office_bld', 'office_items'

LAYERS = ['floor', 'back', 'interior', 'interior_front', 'shell_cut', 'shell', 'glow', 'props']
DEPTH = {'floor': -0.45, 'back': -0.40, 'interior': -0.30, 'interior_front': -0.10, 'shell_cut': -0.02,
         'shell': 0.0, 'glow': 0.005, 'props': 0.01}
PLAIN_OVL = ['stove', 'safe']
DESK_OVL = ['typewriter_a', 'lamp_a', 'lamp_b', 'typewriter_b', 'phone']        # far -> near
OVL_DEPTH = {'stove': -0.25, 'safe': -0.25, 'typewriter_a': -0.08, 'lamp_a': -0.08, 'lamp_b': -0.08,
             'typewriter_b': -0.08, 'phone': -0.08}
OVL_ANIMS = {
    'typewriter_a': {'type': {'fps': 10, 'repeat': -1}},
    'typewriter_b': {'type': {'fps': 10, 'repeat': -1}},
    'phone': {'ring': {'fps': 8, 'repeat': -1}},
    'stove': {'fire': {'fps': 6, 'repeat': -1}},
}
OVL_STATES = {'lamp_a': ['warm', 'alert'], 'lamp_b': ['warm', 'alert'], 'safe': ['shut', 'open']}
OVL_NOTES = {
    'typewriter_a': '셈이\'s typewriter (desk 1): keys hop, the carriage nudges; frame 0 = still. Play anims.type while '
                    'she types (officefolk desk_type).',
    'typewriter_b': '소복이\'s typewriter (desk 2), same anim.',
    'phone': 'The telephone on desk 2: frame 1 = the receiver jumps on its cradle (ringing); anims.ring alternates.',
    'lamp_a': '셈이\'s desk lamp: frame 0 warm (normal), frame 1 red shade = shortage alert (states.alert).',
    'lamp_b': '소복이\'s desk lamp: frame 0 warm, frame 1 red (spare alert, e.g. an unanswered letter).',
    'stove': 'Fire flicker in the pot-belly stove window (loop). The kettle steam / chimney smoke are game FX '
             '(fxPoints.kettle / .chimney).',
    'safe': 'The courier\'s safe door: frame 0 shut, frame 1 open (coins + a gold bar inside). anims.open / close.',
}
NAME = {'ko': '촌장 사무실', 'en': "Chief's office"}
REQUIRED_ITEMS = ['item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l', 'item_letter_bundle',
                  'item_newspaper_bundle', 'item_ledger']
MAILBOX_FRAMES = ['office_mailbox', 'office_mailbox_flag_1', 'office_mailbox_pop_0', 'office_mailbox_pop_1']


def iso(x, y, z=0.0):
    return [(x + y) * PX_X, (x - y) * PX_Y - z * PX_Z]


def ipt(p):
    return [int(round(p[0])), int(round(p[1]))]


# =================================================================================================== image post

def shadow_post(im):
    return pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))


def clean(im):
    return pu.clean_alpha(im, floor=3)


def under(top, bottom):
    out = bottom.copy()
    out.alpha_composite(top)
    return out


def glow_from(mask):
    """Night glow artwork from the white glow mask: bright warm panes (where the lit glass shows) + a 5 px and a
    14 px warm halo (NORMAL blend; the curtains / mullions stay readable because they are holdouts in the mask)."""
    m = np.asarray(mask.convert('RGBA')).astype(np.float32)
    a = (m[..., :3].mean(-1) / 255.0) * (m[..., 3] / 255.0)
    A = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))
    h1 = np.asarray(A.filter(ImageFilter.GaussianBlur(4))).astype(np.float32) / 255.0
    h2 = np.asarray(A.filter(ImageFilter.GaussianBlur(13))).astype(np.float32) / 255.0

    def lay(col, al):
        o = np.zeros(a.shape + (4,), np.float32)
        o[..., 0], o[..., 1], o[..., 2] = col
        o[..., 3] = np.clip(al, 0.0, 1.0) * 255.0
        return Image.fromarray(o.astype(np.uint8), 'RGBA')
    out = lay((255, 168, 76), h2 * 1.5 * 0.62)
    out.alpha_composite(lay((255, 196, 104), h1 * 2.0 * 0.78))
    out.alpha_composite(lay((255, 232, 160), a * 1.0))
    arr = np.asarray(out).copy()
    arr[arr[..., 3] < 3] = 0
    return Image.fromarray(arr, 'RGBA')


def union_alpha(imgs):
    return np.max(np.stack([np.asarray(i)[..., 3] for i in imgs]), 0).astype(np.float32) / 255.0


def masked(im, U):
    a = np.asarray(im).astype(np.float32)
    a[..., 3] *= U
    a = np.clip(a + 0.5, 0, 255).astype(np.uint8)
    a[a[..., 3] < 3] = 0
    return Image.fromarray(a, 'RGBA')


def bbox_union(imgs, thr=2):
    box = None
    for im in imgs:
        a = np.asarray(im)[..., 3] > thr
        if not a.any():
            continue
        ys, xs = np.nonzero(a)
        b = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def crop_all(frames, anchor_px, pad=2):
    """Crop every frame to the union content box (+pad); returns (frames, (W, H), anchorPx)."""
    any_im = next(iter(frames.values()))
    x0, y0, x1, y1 = bbox_union(frames.values())
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(any_im.width, x1 + pad), min(any_im.height, y1 + pad)
    out = {k: im.crop((x0, y0, x1, y1)) for k, im in frames.items()}
    return out, (x1 - x0, y1 - y0), (anchor_px[0] - x0, anchor_px[1] - y0)


# =================================================================================================== building

def hull(points):
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def simplify(poly, n=12):
    poly = list(poly)
    while len(poly) > n:
        best, bi = None, 0
        for i in range(len(poly)):
            a, b, c = poly[i - 1], poly[i], poly[(i + 1) % len(poly)]
            area = abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))
            if best is None or area < best:
                best, bi = area, i
        poly.pop(bi)
    return poly


def silhouette_poly(img, anchor, n=12, thr=140):
    """Convex outline of the opaque building (no shadow: the raw shell render is used)."""
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a > thr)
    pts = []
    for y in np.unique(ys)[::2]:
        row = xs[ys == y]
        pts += [(int(row.min()), int(y)), (int(row.max()) + 1, int(y))]
    pts += [(int(xs[ys == ys.max()].min()), int(ys.max()) + 1), (int(xs[ys == ys.max()].max()) + 1, int(ys.max()) + 1)]
    poly = simplify(hull(pts), n)
    return [[int(round(x - anchor[0])), int(round(y - anchor[1]))] for x, y in poly]


def load_building(cache):
    side = os.path.join(cache, KEY + '.json')
    if not os.path.exists(side):
        return None, 'no %s' % side
    m = json.load(open(side))
    if m.get('look'):
        return None, 'the cache holds a --look render (low samples)'
    names = ['%s_%s' % (KEY, n) for n in ('floor', 'gshadow_open', 'back', 'interior', 'interior_front', 'shell_cut',
                                          'shell', 'gshadow_closed', 'props', 'glowmask')]
    for ov in m['overlays'].values():
        names += ov['frames'] + ov.get('solo', [])
    miss = [n for n in names if not os.path.exists(os.path.join(cache, n + '.png'))]
    if miss:
        return None, 'missing renders: %s' % ', '.join(miss[:6])
    return m, None


def building_images(cache, m):
    def raw(n):
        return Image.open(os.path.join(cache, n + '.png')).convert('RGBA')

    def lay(n):
        return raw('%s_%s' % (KEY, n))
    out = {}
    out['%s_floor' % KEY] = under(clean(lay('floor')), shadow_post(lay('gshadow_open')))
    shell_raw = clean(lay('shell'))
    out['%s_shell' % KEY] = under(shell_raw, shadow_post(lay('gshadow_closed')))
    for n in ('back', 'interior', 'interior_front', 'shell_cut', 'props'):
        out['%s_%s' % (KEY, n)] = clean(lay(n))
    out['%s_glow' % KEY] = glow_from(lay('glowmask'))
    for name, ov in m['overlays'].items():
        frs = [clean(raw(f)) for f in ov['frames']]
        if ov.get('mode') == 'patch':
            U = union_alpha([raw(f) for f in ov['solo']])
            frs = [masked(f, U) for f in frs]
        for f, im in zip(ov['frames'], frs):
            out[f] = im
    out['__shell_raw'] = shell_raw
    return out


# =================================================================================================== mailbox + items

def load_build(cache, key):
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side):
        return None
    m = json.load(open(side))
    if not all(os.path.exists(os.path.join(cache, f + '.png')) for f in m['frames']):
        return None
    return m


# =================================================================================================== packing

def best_pack(frames, max_w=2048):
    """Shelf-pack at every width 512..max_w (step 16) and keep the smallest sheet (GPU memory = W x H x 4)."""
    best = None
    for w in range(512, max_w + 1, 16):
        try:
            sheet, atlas = pu.pack_atlas(frames, max_width=w, trim=True, padding=2)
        except ValueError:
            continue
        if sheet.height > 2048:
            continue
        area = sheet.width * sheet.height
        if best is None or area < best[0]:
            best = (area, sheet, atlas)
    return best[1], best[2]


def save_sheet(sheet, atlas, key, out, rgba=False):
    png = os.path.join(out, key + '.png')
    js = os.path.join(out, key + '.json')
    pu.save_atlas(sheet, atlas, png, js, quantize=False)
    if not rgba:
        try:
            import imagequant
            q = imagequant.quantize_pil_image(sheet, dithering_level=0.5, max_quality=100, min_quality=0,
                                              max_colors=256)
        except Exception:                       # noqa: BLE001
            q = pp.quantize_rgba(sheet)
        q.save(png, optimize=True)
    return png, js


# =================================================================================================== manifest

def dirs_of(m, kind):
    return m['markerDirs'].get(kind, [])


def build_manifest(m, frame_size, anchor_px, atlas_of, shell_raw, mailbox, items, item_imgs, mb_size, mb_anchor):
    W, H = frame_size
    anc = [round(anchor_px[0] / W, 5), round(anchor_px[1] / H, 5)]
    d = m['dims']
    PL = d['PL']
    mk, md = m['markers'], m['markerDirs']
    lift = m['floorLiftPx']

    def one(kind):
        return mk[kind][0]

    def onedir(kind):
        return md.get(kind, [None])[0]
    sprites = {}

    def base(key, frame):
        return {'atlas': atlas_of[frame], 'frame': frame, 'anchor': anc, 'frameSize': [W, H]}
    # ------------------------------------------------------------------ points
    door, entry = one('door'), one('entry')
    chief, pad = one('chiefdesk'), one('chiefpad')
    desks = mk['desk']
    board, cab, shelf, safe, stove = one('board'), one('cabinet'), one('shelf'), one('safe'), one('stove')
    seats = mk['seat']
    fp = [ipt(iso(x, y)) for x, y in ((d['X0'], d['Y0']), (d['X1'], d['Y0']), (d['X1'], d['Y1']), (d['X0'], d['Y1']))]
    # mailbox: right of the steps, slot facing the street (-Y); the postman stands in front of it facing NE
    mbx, mby = d['DOOR_X'] + 1.25, d['Y0'] - 0.62
    mailbox_pt = ipt(iso(mbx, mby))
    mailbox_stand = ipt(iso(mbx, mby - 0.5))
    # board / sign rects (text / bars the game draws; shear y += 0.5 * x along the wall's X run)
    bs = m['boardSlate']
    bc_ = iso((bs['x0'] + bs['x1']) / 2, bs['y'], (bs['z0'] + bs['z1']) / 2)
    board_rect = {'point': ipt(bc_), 'widthPx': int(round((bs['x1'] - bs['x0']) * PX_X)),
                  'heightPx': int(round((bs['z1'] - bs['z0']) * PX_Z)), 'shearY': 0.5,
                  'note': 'The blank slate of the 재고판 chalkboard (back wall, runs along world X): draw the 5 stock '
                          'bars inside widthPx x heightPx centred on point, sheared y += 0.5 * x (x = px right of '
                          'point).  Only while revealed (it is part of _back).'}
    sg = m['sign']
    sign_rect = {'point': sg['centre'], 'widthPx': int(round(sg['w'] * PX_X * 0.92)),
                 'heightPx': int(round(sg['h'] * PX_Z * 0.8)), 'shearY': 0.5,
                 'text': {'ko': '촌장 사무실', 'en': "Chief's Office"}, 'color': '#2E6F6B',
                 'note': 'The blank cream sign board over the door (part of _shell; nothing is baked).  Write the '
                         'name centred on point, fitted into widthPx x heightPx, sheared y += 0.5 * x, alpha = the '
                         'shell alpha (it fades with the shell).'}
    # walk polygon (inside points include the floor lift) and wall collision circles (ground level)
    ins = 0.2
    xi0, xi1 = d['X0'] + d['WT'] + ins, d['X1'] - d['WT'] - ins
    yi0, yi1 = d['Y0'] + d['WT'] + ins, d['Y1'] - d['WT'] - ins
    dx0, dx1 = d['DOOR_X'] - 0.42, d['DOOR_X'] + 0.42
    wp = [(xi0, yi0), (dx0, yi0), (dx0, d['Y0'] - 0.04), (dx1, d['Y0'] - 0.04), (dx1, yi0), (xi1, yi0), (xi1, yi1),
          (xi0, yi1)]
    walk = [ipt(iso(x, y, PL)) for x, y in wp]
    R = 0.5
    circ = []
    for x in (-2.8, -1.68, -0.56, 0.56, 1.68, 2.8):
        circ.append((x, d['Y1']))
    for y in (-1.1, 0.0, 1.1):
        circ += [(d['X0'], y), (d['X1'], y)]
    for x in (-2.8, -0.6, 0.5, 1.6, 2.8):
        circ.append((x, d['Y0']))
    wall_circles = [ipt(iso(x, y)) + [int(round(R * 64))] for x, y in circ]
    staff = [('board', board, onedir('board'), 'behind'), ('cabinet', cab, onedir('cabinet'), 'behind'),
             ('shelf', shelf, onedir('shelf'), 'behind'), ('safe', safe, onedir('safe'), 'front'),
             ('door', entry, onedir('entry'), 'front')]
    fx = dict(m['fxPoints'])
    reveal_poly = silhouette_poly(shell_raw, anchor_px)
    top_px = int(round(-min(p[1] for p in reveal_poly)))
    layer_keys = {n: '%s_%s' % (KEY, n) for n in LAYERS}
    ovl_keys = {n: '%s_%s' % (KEY, n) for n in PLAIN_OVL + DESK_OVL}
    draw = (['%s_floor' % KEY, '%s_back' % KEY, '%s_interior' % KEY] + [ovl_keys[n] for n in PLAIN_OVL] +
            ['@behind', '%s_interior_front' % KEY] + [ovl_keys[n] for n in DESK_OVL] +
            ['@front', '%s_shell_cut' % KEY, '%s_shell' % KEY, '%s_glow' % KEY, '%s_props' % KEY])
    depth_offsets = {layer_keys[n]: DEPTH[n] for n in LAYERS}
    depth_offsets.update({ovl_keys[n]: OVL_DEPTH[n] for n in ovl_keys})
    depth_offsets.update({'@behind': -0.20, '@front': -0.05})
    e = base(KEY, '%s_shell' % KEY)
    e.update({
        'kind': 'building', 'name': NAME, 'zone': 'civic', 'front': '-Y',
        'footprintM': m['footprintM'], 'footprint': [int(round((m['footprintM'][0] + m['footprintM'][1]) * PX_X)),
                                                     int(round((m['footprintM'][0] + m['footprintM'][1]) * PX_Y))],
        'footprintPoly': fp, 'topPx': top_px, 'floorLiftPx': lift,
        'closedFrame': '%s_shell' % KEY,
        'layers': {n: layer_keys[n] for n in LAYERS},
        'overlays': {n: {'sprite': ovl_keys[n], 'depthOffset': OVL_DEPTH[n], 'frames': len(m['overlays'][n]['frames']),
                         'mode': m['overlays'][n].get('mode')} for n in PLAIN_OVL + DESK_OVL},
        'layerOrder': [x if x.startswith('@') else x[len(KEY) + 1:] for x in draw],
        'drawOrder': draw, 'depthOffsets': depth_offsets,
        'alwaysDrawn': ['props', 'glow'], 'insideLayers': ['floor', 'back', 'interior'] + PLAIN_OVL +
                                                          ['interior_front'] + DESK_OVL + ['shell_cut'],
        'reveal': {
            'states': {
                'closed': {'shell': 1.0, 'shell_cut': 0.0, 'inside': False},
                'half': {'shell': 0.45, 'shell_cut': 0.0, 'inside': True},
                'cut': {'shell': 0.12, 'shell_cut': 1.0, 'inside': True},
                'open': {'shell': 0.0, 'shell_cut': 0.0, 'inside': True}},
            'default': 'cut', 'fadeMs': 260, 'revealPx': 260, 'hysteresisPx': 60,
            'notes': 'Reveal (the chief within revealPx of doorPoint, an office panel open, the 관망 camera, or a tap '
                     'inside revealPoly) tweens closed -> cut in fadeMs: _shell to openAlpha 0.12 and _shell_cut in '
                     '(alpha = 1 - shell alpha, scaled).  half = a lighter peek (shell 0.45, no stubs); open = no front '
                     'walls at all (shell 0).  Inside layers + inside staff exist only while revealed; the closed look '
                     'is _shell (which already holds the outdoor props and the closed ground shadow) + _props (+ '
                     '_glow at night).'},
        'fade': {'layer': '%s_shell' % KEY, 'closedAlpha': 1.0, 'openAlpha': 0.12, 'ms': 260},
        'cut': {'layer': '%s_shell_cut' % KEY, 'visible': 'only while revealed (fade in with the shell fade out)'},
        'bandDepth': {'behind': -0.20, 'front': -0.05},
        'doorPoint': door, 'doorDir': onedir('door'), 'entryPoint': entry, 'entryDir': onedir('entry'),
        'chiefDeskPoint': chief, 'chiefDeskDir': onedir('chiefdesk'),
        'chiefDeskPad': pad, 'chiefDeskPadDir': onedir('chiefpad'),
        'deskPoints': desks, 'deskDirs': md['desk'], 'deskRoles': ['sem', 'bok', 'chong', 'ttal'],
        'boardPoint': board, 'boardDir': onedir('board'), 'boardRect': board_rect,
        'cabinetPoint': cab, 'cabinetDir': onedir('cabinet'),
        'mailShelfPoint': shelf, 'mailShelfDir': onedir('shelf'),
        'safePoint': safe, 'safeDir': onedir('safe'),
        'stovePoint': stove,
        'seatPoints': seats, 'seatDirs': md['seat'],
        'mailboxPoint': mailbox_stand, 'mailboxDir': 'NE',
        'staffPoints': [s[1] for s in staff], 'staffDirs': [s[2] for s in staff], 'staffRoles': [s[0] for s in staff],
        'staffBands': [s[3] for s in staff],
        'signRect': sign_rect,
        'fxPoints': fx,
        'walkPoly': walk, 'wallCircles': wall_circles, 'revealPoly': reveal_poly,
        'frontTest': {'a': round((d['Y1'] - d['Y0'] + 0.12) * PX_Y, 1), 'b': round((d['X1'] - d['X0'] + 0.12) * PX_Y, 1)},
        'outdoorProps': [{'sprite': 'office_mailbox', 'name': 'mailbox', 'point': mailbox_pt}],
        'pointSlots': {'doorPoint': 'outside', 'entryPoint': 'front', 'chiefDeskPoint': 'behind',
                       'chiefDeskPad': 'front', 'deskPoints': 'behind', 'boardPoint': 'behind',
                       'cabinetPoint': 'behind', 'mailShelfPoint': 'behind', 'safePoint': 'front',
                       'stovePoint': 'behind', 'seatPoints': 'front', 'mailboxPoint': 'outside'},
        'night': {'glow': '%s_glow' % KEY, 'blend': 'NORMAL', 'depthOffset': 0.005, 'when': 'night and closed',
                  'lightPoints': fx['windows'] + [fx['lampDoor']],
                  'note': 'NORMAL-blend artwork drawn over the closed shell (bright warm panes + halos).  Also feed '
                          'lightPoints to dayClock.addLight for the warm ground halo (beach_bld convention); the glow '
                          'may instead go to the DayClock light layer (DEPTH.FX - 29) for an even stronger night look.'},
        'notes': m['notes'],
    })
    sprites[KEY] = e
    for n in LAYERS:
        k = layer_keys[n]
        s = base(k, k)
        s.update({'kind': 'layer', 'of': KEY, 'layer': n, 'depthOffset': DEPTH[n]})
        if n == 'glow':
            s.update({'blend': 'NORMAL', 'notes': 'Night: warm window light + door-lantern halo over the closed shell.'})
        if n == 'shell':
            s['notes'] = ('The closed building in one frame (walls, roof, sign board, door, windows + the outdoor '
                          'props + its own ground shadow).  `chief_office` points at this frame.')
        if n == 'floor':
            s['notes'] = 'Floorboards, rugs, the chief\'s dais, the inside door mat + the open-building ground shadow.'
        sprites[k] = s
    for n in PLAIN_OVL + DESK_OVL:
        k = ovl_keys[n]
        frs = m['overlays'][n]['frames']
        s = base(k, frs[0])
        s.update({'kind': 'overlay', 'of': KEY, 'layer': n, 'depthOffset': OVL_DEPTH[n], 'frames': frs,
                  'mode': m['overlays'][n].get('mode'), 'notes': OVL_NOTES[n]})
        if n in OVL_ANIMS:
            s['anims'] = {a: {'frames': frs, 'fps': v['fps'], 'repeat': v['repeat']} for a, v in OVL_ANIMS[n].items()}
        if n in OVL_STATES:
            s['states'] = {st: frs[i] for i, st in enumerate(OVL_STATES[n])}
        if n == 'safe':
            s['anims'] = {'open': {'frames': frs, 'fps': 6, 'repeat': 0},
                          'close': {'frames': list(reversed(frs)), 'fps': 6, 'repeat': 0}}
        if m['overlays'][n].get('mode') == 'patch':
            s['notes'] += (' PATCH: the frame holds the object AND the desk top it moves over, so it composites '
                           'exactly drawn right after _interior_front (depthOffset -0.08).')
        sprites[k] = s
    # ------------------------------------------------------------------ mailbox
    mbW, mbH = mb_size
    man = [round(mb_anchor[0] / mbW, 5), round(mb_anchor[1] / mbH, 5)]
    fxm = mailbox.get('fxPoints', {})
    sprites['office_mailbox'] = {
        'atlas': atlas_of['office_mailbox'], 'frame': 'office_mailbox', 'anchor': man, 'frameSize': [mbW, mbH],
        'kind': 'prop', 'of': KEY, 'shadow': 'baked', 'footprintM': {'radius': 0.2}, 'front': '-Y',
        'name': {'ko': '우체통', 'en': 'Mailbox'},
        'topPx': mailbox['topPx'],
        'anims': {'flag': {'frames': ['office_mailbox', 'office_mailbox_flag_1'], 'fps': 4, 'repeat': 0},
                  'pop': {'frames': ['office_mailbox_pop_0', 'office_mailbox_pop_1', 'office_mailbox_flag_1'],
                          'fps': 12, 'repeat': 0}},
        'states': {'down': 'office_mailbox', 'up': 'office_mailbox_flag_1'},
        'slotPoint': fxm.get('slot'), 'flagPoint': fxm.get('flag'),
        'notes': mailbox['notes'] + '  Placed at chief_office.outdoorProps[0].point; y-sort it like a town prop.'}
    # ------------------------------------------------------------------ items
    for k, it in items.items():
        img = item_imgs[k]
        bb = img.getbbox() or (0, 0, 72, 72)
        tp = it.get('topPx')
        tp = tp.get(k) if isinstance(tp, dict) else tp
        sprites[k] = {'atlas': atlas_of[k], 'frame': k, 'anchor': [0.5, 0.86], 'frameSize': [72, 72], 'kind': 'item',
                      'icon': True, 'stackStep': it.get('stackStep'), 'thicknessM': it.get('thicknessM'),
                      'carryScale': pp.carry_scale(img), 'topPx': tp,
                      'sizeClass': 'small' if bb[2] - bb[0] <= 40 else 'big', 'notes': it.get('notes', '')}
    return sprites


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre (items: [0.5, 0.86] '
              'of 72 x 72 = the ground contact).',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the anchor (unscaled); *Dir(s) = facing of a '
              'character standing there (SW / W / NW = flipped SE / E / NE frames).  Points inside the office include '
              'the raised floor (floorLiftPx); seat points (deskPoints, chiefDeskPoint, seatPoints) are the seat '
              'FRONT-CENTRE at 0.45 m (the sit anims anchor there; the desk top is 0.72 m).',
    'cutaway': 'chief_office_* layers share frameSize + anchor with chief_office (place them all at the building '
               'anchor; trimmed in the atlas).  Depth of a layer = building depth (anchor y) + depthOffsets[sprite]; '
               'draw in drawOrder.  Characters in pointSlots "behind" go to @behind (bandDepth.behind), "front" to '
               '@front; sort actors inside a band by their own y (band + y * 1e-6); "outside" = normal y-sort with the '
               'frontTest rule.  Closed look = _shell (the closed building incl. the outdoor props and its ground '
               'shadow; `chief_office` points at it) + _props (+ _glow at night).',
    'overlays': 'Animated parts, aligned to the building frame (trimmed).  stove + safe (on _interior furniture) at '
                'depthOffset -0.25 as the contract says.  The desk-top overlays (typewriter_a/_b, phone, lamp_a/_b) '
                'are PATCHES (object + the desk top under its whole motion) drawn right after _interior_front at '
                '-0.08: a desk-top object stands in front of everyone in @behind (a clerk at the filing cabinet, a '
                'seated clerk\'s arm), so at -0.25 those people would cover it.  _interior_front has a hole where the '
                'frame-0 object is, so the patches also look right if a renderer keeps all overlays at -0.25.',
    'outsideActors': 'An actor / prop outside the walls is IN FRONT of the building when, with (x, y) = its point '
                     'minus the building anchor, y - x / 2 > frontTest.a (in front of the -Y face) or y + x / 2 > '
                     'frontTest.b (right of the +X face): give it at least building depth + 0.02 (+ y * 1e-6).  '
                     'Everything else around the building is behind it.',
    'collision': 'wallCircles = [dx, dy, r] at ground level (r in the Collision metric dx^2 + (2 dy)^2, 64 per metre) '
                 'along the four walls with a gap at the door; an inside actor (drawn floorLiftPx higher) tests its '
                 'point + [0, floorLiftPx].  walkPoly = the inside floor the chief / staff may walk on (lifted like '
                 'the inside points), with a notch through the door.',
    'night': 'chief_office.night: _glow is NORMAL-blend artwork over the closed shell at night (DayClock lightsOn); '
             'lightPoints for dayClock.addLight.  The inside layers are not dimmed by us (the DayClock MULTIPLY '
             'overlay does that).',
    'items': '72 x 72 frames, anchor [0.5, 0.86] (36, 61.9) = bottom centre of the ground contact; stackStep px '
             'between stacked copies; carryScale for head-carried stacks; icon true (usable as UI icons).',
    'shadows': 'the building, its layers and the mailbox have baked soft cool shadows falling screen down-right; '
               'items none.',
}


# =================================================================================================== main

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'office')
    out, prev, previews, rgba = OUT, PREV, True, False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--cache':
            cache = argv[i + 1]
            i += 1
        elif a == '--out':
            out = argv[i + 1]
            i += 1
        elif a == '--prev':
            prev = argv[i + 1]
            i += 1
        elif a == '--no-previews':
            previews = False
        elif a == '--rgba':
            rgba = True
        i += 1
    m, err = load_building(cache)
    mb = load_build(cache, 'office_mailbox')
    items = {k: load_build(cache, k) for k in REQUIRED_ITEMS}
    errs = []
    if m is None:
        errs.append('chief_office: ' + err)
    if mb is None:
        errs.append('office_mailbox: not rendered')
    errs += ['%s: not rendered' % k for k, v in items.items() if v is None]
    if errs:
        print('REFUSING to pack (nothing written):\n  ' + '\n  '.join(errs))
        return 1
    # ---------------------------------------------------------------- building
    imgs = building_images(cache, m)
    shell_raw = imgs.pop('__shell_raw')
    imgs['__shell_raw'] = shell_raw            # crop it with the rest (revealPoly)
    imgs, (W, H), anchor = crop_all(imgs, m['anchorPx'])
    shell_raw = imgs.pop('__shell_raw')
    if W > MAX_FRAME[0] or H > MAX_FRAME[1]:
        print('WARNING frame %dx%d exceeds the contract maximum %s' % (W, H, MAX_FRAME))
    # ---------------------------------------------------------------- mailbox
    mbi = {}
    for f in mb['frames']:
        mbi[f] = shadow_post(Image.open(os.path.join(cache, f + '.png')).convert('RGBA'))
    mbi, mb_size, mb_anchor = crop_all(mbi, mb['anchorPx'], pad=1)
    mb_fx = {k: [int(v[0]), int(v[1])] for k, v in (mb.get('fxPoints') or {}).items()}
    mb['fxPoints'] = mb_fx
    tp = mb.get('topPx')
    mb['topPx'] = tp.get('office_mailbox') if isinstance(tp, dict) else tp
    # ---------------------------------------------------------------- items
    item_imgs = {k: clean(Image.open(os.path.join(cache, k + '.png')).convert('RGBA')) for k in REQUIRED_ITEMS}
    # ---------------------------------------------------------------- atlases
    os.makedirs(out, exist_ok=True)
    bld_frames = sorted(imgs.items()) + sorted(mbi.items())
    sheet, atlas = best_pack(bld_frames)
    atlas_of = {n: BLD_ATLAS for n, _ in bld_frames}
    save_sheet(sheet, atlas, BLD_ATLAS, out, rgba=rgba)
    isheet, iatlas = best_pack(sorted(item_imgs.items()), max_w=512)
    atlas_of.update({k: ITEM_ATLAS for k in item_imgs})
    save_sheet(isheet, iatlas, ITEM_ATLAS, out, rgba=rgba)
    mib = {BLD_ATLAS: sheet.width * sheet.height * 4 / 1048576.0, ITEM_ATLAS: isheet.width * isheet.height * 4 / 1048576.0}
    print('[pack] %s %dx%d %d frames  %.2f MiB RGBA (budget %.1f)' % (BLD_ATLAS, sheet.width, sheet.height,
                                                                     len(bld_frames), mib[BLD_ATLAS], BUDGET_BLD_MIB))
    print('[pack] %s %dx%d %d frames  %.2f MiB RGBA' % (ITEM_ATLAS, isheet.width, isheet.height, len(item_imgs),
                                                         mib[ITEM_ATLAS]))
    # ---------------------------------------------------------------- manifest
    sprites = build_manifest(m, (W, H), anchor, atlas_of, shell_raw, mb, items, item_imgs, mb_size, mb_anchor)
    man = {
        'version': 1,
        'generator': 'tools/blender/off_render.py + off_pack.py (docs/CONTRACT_V42.md section AI)',
        'conventions': CONVENTIONS,
        'atlases': [{'key': BLD_ATLAS, 'png': 'office/%s.png' % BLD_ATLAS, 'json': 'office/%s.json' % BLD_ATLAS,
                     'size': [sheet.width, sheet.height], 'mib': round(mib[BLD_ATLAS], 3)},
                    {'key': ITEM_ATLAS, 'png': 'office/%s.png' % ITEM_ATLAS, 'json': 'office/%s.json' % ITEM_ATLAS,
                     'size': [isheet.width, isheet.height], 'mib': round(mib[ITEM_ATLAS], 3)}],
        'sprites': sprites,
    }
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    print('[pack] manifest: %d sprites, frame %dx%d anchor %s' % (len(sprites), W, H, anchor))
    if previews:
        import off_preview
        off_preview.main(['--out', out, '--prev', prev])
    return 0


if __name__ == '__main__':
    sys.exit(main())
