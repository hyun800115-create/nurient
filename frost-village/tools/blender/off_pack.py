"""
off_pack.py - turn the raw 촌장 사무실 renders (off_render.py cache) into assets/office/: two trimmed Phaser atlases
(office_bld: the cutaway layers + overlays + glow + the mailbox; office_items: the six items) + manifest.json
(docs/CONTRACT_V42.md section AI).  Then off_preview.py makes the docs/previews/off_* previews.

No Blender needed: python3 with numpy + Pillow (+ `imagequant`).
    python3 tools/blender/off_pack.py [--cache DIR] [--out DIR] [--no-previews] [--rgba]

Steps
  1. chief_office: the open-building ground shadow is merged UNDER _shell_cut (polish, critique H1: _floor is drawn
     always by src/entities/Cutaway.js and by the v5 BankBuilding, so a shadow in _floor doubled the closed shadow;
     _shell_cut shows exactly while revealed, alpha = reveal), the closed-building ground shadow UNDER _shell (which
     also carries the outdoor props: _shell alone is the closed look, and the `chief_office` sprite points at it);
     _glow is built from the glow mask (lit glass -> bright warm panes + two soft halos, NORMAL blend artwork);
     patch overlays are cut to the union of their solo silhouettes.
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
import re
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
# (polish M3) wall collision circles [x, y, r] in building metres (see build_manifest); AGENT_PX = the player's
# collision radius (src/entities/Player.js radius 16; workers 14) that off_check uses for the clearance tests
WALL_CIRCLES_M = [(-3.20, 0.50, 0.95), (-3.10, -1.60, 0.95), (-2.30, 2.30, 0.85), (-0.40, 2.30, 0.75),
                  (-0.20, -2.20, 0.95), (0.10, 2.60, 0.95), (1.20, 2.50, 0.45), (1.80, -2.50, 0.95),
                  (2.40, 2.30, 0.85), (3.00, -1.40, 0.55), (3.20, 0.40, 0.95)]
AGENT_PX = 16
DESK_BANDS = ['behind', 'behind', 'front', 'front']      # sem, bok, chong, ttal (polish: see deskBandsNote)
# (polish M6) frame groups for a closed-look / inside page split at build time (tools/build/pack_pages.py style): the
# closed look must stay resident in the plaza, the inside only while the office is revealed (plan 13.2 officeInside)
PAGE_CLOSED = ['%s_%s' % (KEY, n) for n in ('shell', 'props', 'glow')] + MAILBOX_FRAMES


def iso(x, y, z=0.0):
    return [(x + y) * PX_X, (x - y) * PX_Y - z * PX_Z]


def ipt(p):
    return [int(round(p[0])), int(round(p[1]))]


# =================================================================================================== image post

def shadow_post(im, width=10):
    return pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)), width=width)


def clean(im, border=4):
    """Kill render haze: alpha < 3, a few black denoiser specks on the raw frame border, and any faint pixel more
    than 6 px away from solid content (so the atlas trim is tight)."""
    im = pu.clean_alpha(im, floor=3)
    a = np.asarray(im).copy()
    if border:
        a[:border], a[-border:], a[:, :border], a[:, -border:] = 0, 0, 0, 0
    al = a[..., 3]
    core = np.asarray(Image.fromarray(((al > 60) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(13))) > 0
    a[(al <= 60) & ~core] = 0
    return Image.fromarray(a, 'RGBA')


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
    x0, y0, x1, y1 = (int(v) for v in bbox_union(frames.values()))
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


def load_building(cache, allow_look=False):
    side = os.path.join(cache, KEY + '.json')
    if not os.path.exists(side):
        return None, 'no %s' % side
    m = json.load(open(side))
    if m.get('look') and not allow_look:
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
    # the frame is clamped to the contract maximum on the shadow side: a 28 px fade so the long soft ground shadow
    # never ends in a hard edge
    shell_raw = clean(lay('shell'))
    out['%s_shell' % KEY] = under(shell_raw, shadow_post(lay('gshadow_closed'), 28))
    # (polish H1) _floor keeps only what lies under the fully opaque closed shell; its 1-px anti-aliased plinth fringe
    # outside that core moves to _shell_cut (with the open-building ground shadow), so a renderer that draws _floor
    # always (src/entities/Cutaway.js) gives exactly the documented closed look
    floor = clean(lay('floor'))
    core = np.asarray(shell_raw)[..., 3] >= 255             # fully opaque only (the palette may round 250 down)
    fa = np.asarray(floor).copy()
    fringe = fa.copy()
    fa[~core] = 0
    fringe[core] = 0
    out['%s_floor' % KEY] = Image.fromarray(fa, 'RGBA')
    cut = under(Image.fromarray(fringe, 'RGBA'), shadow_post(lay('gshadow_open'), 28))
    out['%s_shell_cut' % KEY] = under(clean(lay('shell_cut')), cut)
    for n in ('back', 'interior', 'interior_front', 'props'):
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

def maxrects(sizes, W, pad=2):
    """MaxRects (best short side fit) of (w, h) boxes into a strip W wide; returns ([(x, y)], used height) or None."""
    free = [(0, 0, W + pad, 1 << 15)]
    out = [None] * len(sizes)
    order = sorted(range(len(sizes)), key=lambda i: (-max(sizes[i]), -sizes[i][0] * sizes[i][1]))
    for i in order:
        w, h = sizes[i][0] + pad, sizes[i][1] + pad
        best = None
        for fx, fy, fw, fh in free:
            if w <= fw and h <= fh:
                key = (fy + h, min(fw - w, fh - h), fx)
                if best is None or key < best[0]:
                    best = (key, fx, fy)
        if best is None:
            return None
        _, x, y = best
        out[i] = (x, y)
        nf = []
        for fx, fy, fw, fh in free:
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                nf.append((fx, fy, fw, fh))
                continue
            if x > fx:
                nf.append((fx, fy, x - fx, fh))
            if x + w < fx + fw:
                nf.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy:
                nf.append((fx, fy, fw, y - fy))
            if y + h < fy + fh:
                nf.append((fx, y + h, fw, fy + fh - y - h))
        free = [r for r in nf if not any(r is not q and q[0] <= r[0] and q[1] <= r[1] and q[0] + q[2] >= r[0] + r[2]
                                         and q[1] + q[3] >= r[1] + r[3] and q != r for q in nf)]
        # drop exact duplicates
        free = list(dict.fromkeys(free))
    hgt = max(out[i][1] + sizes[i][1] for i in range(len(sizes)))
    return out, hgt


def best_pack(frames, max_w=2048, pad=2):
    """Trim every frame, then MaxRects-pack at every width (step 8) and keep the smallest sheet (GPU memory =
    W x H x 4).  Same atlas JSON as pack_utils.pack_atlas (Phaser JSON hash, trimmed, sourceSize kept)."""
    items = []
    for name, im in frames:
        im = im.convert('RGBA')
        box = pu._trim_box(im)
        items.append((name, im.size, box, im.crop(box)))
    sizes = [it[3].size for it in items]
    wmin = max(w for w, h in sizes)
    best = None
    for W in range(wmin, max_w + 1, 8):
        r = maxrects(sizes, W, pad)
        if r is None:
            continue
        pos, hgt = r
        sw = pu._pow2ish(max(p[0] + s[0] for p, s in zip(pos, sizes)))
        sh = pu._pow2ish(hgt)
        if sh > 2048:
            continue
        if best is None or sw * sh < best[0]:
            best = (sw * sh, sw, sh, pos)
    _, sw, sh, pos = best
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    fr = {}
    for (name, (W0, H0), box, crop), (x, y) in zip(items, pos):
        sheet.paste(crop, (x, y))
        fr[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != (W0, H0),
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': W0, 'h': H0}}
    atlas = {'frames': fr, 'meta': {'app': 'frost-village/tools/blender/off_pack.py (maxrects)', 'version': '1.0',
                                    'image': '', 'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    return sheet, atlas


def keep_opaque(sheet, q):
    """(polish H1) the palette may map a fully opaque source pixel onto a slightly transparent entry (alpha 243..254):
    the closed shell would then let 2-5 % of the always-drawn _floor through.  Remap every such pixel to the nearest
    fully opaque palette entry (RGB distance), so opaque stays opaque."""
    if q.mode != 'P':
        return q
    trns = q.info.get('transparency')
    if q.palette is not None and q.palette.mode == 'RGBA':          # imagequant: alpha lives in an RGBA palette
        p4 = np.array(q.getpalette('RGBA'), dtype=np.int32).reshape(-1, 4)
        pal, pa = p4[:, :3], p4[:, 3].copy()
    else:
        pal = np.array(q.getpalette()[:768], dtype=np.int32).reshape(-1, 3)
        pa = np.full(len(pal), 255, dtype=np.int32)
        if isinstance(trns, (bytes, bytearray)):
            pa[:len(trns)] = np.frombuffer(bytes(trns), dtype=np.uint8)[:len(pal)]
        elif isinstance(trns, int):
            pa[trns] = 0
    idx = np.asarray(q).copy()
    src = np.asarray(sheet)
    bad = (src[..., 3] == 255) & (pa[idx] < 255)
    opq = np.nonzero(pa == 255)[0]
    if not bad.any() or not len(opq):
        return q
    cols = src[bad][:, :3].astype(np.int32)
    d = ((cols[:, None, :] - pal[opq][None, :, :]) ** 2).sum(-1)
    idx[bad] = opq[d.argmin(1)].astype(idx.dtype)
    out = q.copy()
    out.frombytes(idx.astype(np.uint8).tobytes())
    print('[pack] keep_opaque: %d opaque px moved off semi-transparent palette entries' % int(bad.sum()))
    return out


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
        q = keep_opaque(sheet, q)
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
    mailbox_stand = ipt(iso(mbx - 0.12, mby - 0.72))
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
                 'hideBelowShellAlpha': 0.5,
                 'note': 'The blank cream sign board over the door (part of _shell; nothing is baked).  Write the '
                         'name centred on point, fitted into widthPx x heightPx, sheared y += 0.5 * x, alpha = the '
                         'shell alpha; HIDE it while the shell alpha is below hideBelowShellAlpha (revealed: the text '
                         'would float at 12 % over the inside left wall).  The shear recipe (a canvas texture drawn '
                         'with setTransform(1, 0.5, 0, 1, ...)) is in tools/test/office_phaser.mjs shearText().'}
    # walk polygon (inside points include the floor lift) and wall collision circles (ground level)
    ins = 0.2
    xi0, xi1 = d['X0'] + d['WT'] + ins, d['X1'] - d['WT'] - ins
    yi0, yi1 = d['Y0'] + d['WT'] + ins, d['Y1'] - d['WT'] - ins
    dx0, dx1 = d['DOOR_X'] - 0.42, d['DOOR_X'] + 0.42
    wp = [(xi0, yi0), (dx0, yi0), (dx0, d['Y0'] - 0.04), (dx1, d['Y0'] - 0.04), (dx1, yi0), (xi1, yi0), (xi1, yi1),
          (xi0, yi1)]
    walk = [ipt(iso(x, y, PL)) for x, y in wp]
    # (polish, critique M3) 11 circles (contract ~10), metres [x, y, r]: centres on or just outside the four wall lines
    # so that, with an agent radius of 16 px (the player; workers 14), the walls are closed except for the doorway,
    # every standing work spot (safePoint included) and the door path stay clear by >= the agent radius, and the
    # postman / doorPoint outside are free.  Found by a greedy cover over candidate circles (see the build report);
    # off_check verifies all of it.  (Before: 12 circles centred on the wall lines; the right-wall one covered
    # safePoint and the front wall right of x 1.6 m was open.)
    circ = WALL_CIRCLES_M
    wall_circles = [ipt(iso(x, y)) + [int(round(r * 64))] for x, y, r in circ]
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
                'open': {'shell': 0.12, 'shell_cut': 1.0, 'inside': True},
                'bare': {'shell': 0.0, 'shell_cut': 0.0, 'inside': True}},
            'aliases': {'cut': 'open'},
            'default': 'open', 'fadeMs': 260, 'revealPx': 260, 'hysteresisPx': 60,
            'notes': 'Reveal (the chief within revealPx of doorPoint, an office panel open, the 관망 camera, or a tap '
                     'inside revealPoly) tweens closed -> open in fadeMs: _shell to openAlpha 0.12 and _shell_cut in '
                     '(alpha = 1 - shell alpha, scaled; it also carries the open-building ground shadow).  open is '
                     'the contract state (CONTRACT_V42 AI.1 reveal.states closed / open) - earlier builds called it '
                     '`cut` (alias kept).  bare = no front walls and no stubs (shell 0): close-ups and screenshots '
                     'only - it has no ground shadow.  (The old `half` peek, shell 0.45 over the whole inside, read '
                     'as a muddy double exposure and was dropped.)  Inside layers + inside staff exist only while '
                     'revealed; the closed look is _shell (which already holds the outdoor props and the closed '
                     'ground shadow) + _props (+ _glow at night).'},
        'fade': {'layer': '%s_shell' % KEY, 'closedAlpha': 1.0, 'openAlpha': 0.12, 'ms': 260},
        'cut': {'layer': '%s_shell_cut' % KEY, 'visible': 'only while revealed (fade in with the shell fade out)'},
        'bandDepth': {'behind': -0.20, 'front': -0.05},
        'doorPoint': door, 'doorDir': onedir('door'), 'entryPoint': entry, 'entryDir': onedir('entry'),
        'chiefDeskPoint': chief, 'chiefDeskDir': onedir('chiefdesk'),
        'chiefDeskPad': pad, 'chiefDeskPadDir': onedir('chiefpad'),
        'deskPoints': desks, 'deskDirs': md['desk'], 'deskRoles': ['sem', 'bok', 'chong', 'ttal'],
        'deskBands': DESK_BANDS,
        'deskBandsNote': 'Per desk band (overrides pointSlots.deskPoints): 총총이 (secretary desk) and 딸랑이 (counting '
                         'table) sit in band front - their desks render with _shell_cut, because another desk stands '
                         'behind their heads on screen (desk 1 behind 총총이, the chief\'s desk behind 딸랑이) and the '
                         'one-layer _interior_front would cover their heads.  셈이, 소복이 and the chief: band behind.',
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
        # (polish, critique H1) the civic-bank-style block that the GAME's renderer reads: src/entities/Cutaway.js
        # draws every name in cutaway.drawOrder at base + 0.01 * index, fades fade.layer, shows cut.layer only while
        # revealed (alpha = reveal) and hides ONLY cutaway.layers.interior / .back / .front while closed; everything
        # else it draws always.  So: `front` names the desk layer, the night glow is NOT in this drawOrder (the code
        # draws night[] itself), and nothing that is drawn always has pixels outside the opaque closed shell
        # (_floor no longer carries a ground shadow; the open-building shadow lives on _shell_cut).  The v5 module's
        # src/bank/view/BankBuilding.js (draws every drawOrder layer always, stub alpha 0 while closed) gives the
        # same closed look.  A renderer that honours `inside` hides those while closed (fill rate).
        'cutaway': {
            'layers': {'floor': layer_keys['floor'], 'back': layer_keys['back'], 'interior': layer_keys['interior'],
                       'front': layer_keys['interior_front'], 'interior_front': layer_keys['interior_front'],
                       'shell_cut': layer_keys['shell_cut'], 'shell': layer_keys['shell']},
            'drawOrder': [x for x in draw if x != '%s_glow' % KEY],
            'inside': [layer_keys['floor'], layer_keys['back'], layer_keys['interior']] +
                      [ovl_keys[n] for n in PLAIN_OVL] + [layer_keys['interior_front']] +
                      [ovl_keys[n] for n in DESK_OVL],
            'night': ['%s_glow' % KEY],
            'nightRule': 'draw night[] at building depth + 0.005 (NORMAL blend) only while closed (reveal alpha < '
                         '0.02) and dayClock.lightsOn; feed chief_office.night.lightPoints to dayClock.addLight '
                         '(lightPointsOpen while revealed)',
            'overlays': {ovl_keys[n]: {'anims': list(OVL_ANIMS.get(n, {}).keys()) or
                                       (['open', 'close'] if n == 'safe' else []),
                                       'states': OVL_STATES.get(n, []),
                                       'drawAfter': 'interior' if n in PLAIN_OVL else 'interior_front',
                                       'frames': len(m['overlays'][n]['frames']), 'depthOffset': OVL_DEPTH[n]}
                         for n in PLAIN_OVL + DESK_OVL},
            'fade': {'layer': '%s_shell' % KEY, 'closedAlpha': 1.0, 'openAlpha': 0.12, 'ms': 260},
            'cut': {'layer': '%s_shell_cut' % KEY, 'visible': 'only while revealed (fade in with the shell fade '
                                                               'out); it also carries the open-building ground shadow'},
            'revealPoly': reveal_poly, 'floorLiftPx': lift,
            'alwaysDrawn': ['%s_props' % KEY],
            'insideShadowDepthOffset': -0.449,
            'notes': 'Cutaway.js reads layers.interior / .back / .front (inside while closed), fade.layer, cut.layer '
                     'and drawOrder (depth base + 0.01 * index; slotDepth for @behind / @front).  Closed by day it '
                     'draws exactly the documented closed look (_shell + _props; off_check simulates it).  An inside '
                     "person's contact shadow belongs at building depth + insideShadowDepthOffset (just above "
                     "_floor), not at DEPTH.SHADOW (under _floor, invisible)."},
        'pointSlots': {'doorPoint': 'outside', 'entryPoint': 'front', 'chiefDeskPoint': 'behind',
                       'chiefDeskPad': 'front', 'deskPoints': 'behind', 'boardPoint': 'behind',
                       'cabinetPoint': 'behind', 'mailShelfPoint': 'behind', 'safePoint': 'front',
                       'stovePoint': 'behind', 'seatPoints': 'front', 'mailboxPoint': 'outside'},
        'night': {'glow': '%s_glow' % KEY, 'blend': 'NORMAL', 'depthOffset': 0.005, 'when': 'night and closed',
                  'lightPoints': fx['windows'] + [fx['lampDoor']],
                  'lightPointsOpen': fx['lamps'] + [fx['stove'], fx['lampDoor']],
                  'noteOpen': 'While revealed at night feed lightPointsOpen (the three desk lamps, the stove fire, the '
                              'door lantern) to dayClock.addLight instead: the inside reads warm and lamp-lit.',
                  'note': 'NORMAL-blend artwork drawn over the closed shell (bright warm panes + halos).  Also feed '
                          'lightPoints to dayClock.addLight for the warm ground halo (beach_bld convention); the glow '
                          'may instead go to the DayClock light layer (DEPTH.FX - 29) for an even stronger night look.'},
        'notes': m['notes'],
    })
    if m.get('furniture'):
        e['furnitureM'] = m['furniture']
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
            s['notes'] = ('Floorboards, rugs, the chief\'s dais, the inside door mat.  No ground shadow (polish H1): it '
                          'has no pixel outside the opaque closed shell, so a renderer that draws it always '
                          '(src/entities/Cutaway.js) keeps the closed look exact.')
        if n == 'shell_cut':
            s['notes'] = ('Dollhouse wall stubs at 1.2 m, sills, the door jambs at stub height, the two desks nearest '
                          'the camera (the secretary desk, the counting table: their sitters are in band front, see '
                          'deskBands), the plinth\'s outer fringe + the open-building ground shadow (it shows exactly '
                          'while revealed, alpha = reveal, like logistics _shadow_open).')
        if n == 'interior_front':
            s['notes'] = ('Clerk desks 1 and 2 and the chief\'s desk (they hide the legs of the people seated behind '
                          'them, band behind).  The secretary desk and the counting table are in _shell_cut.')
        sprites[k] = s
    for n in PLAIN_OVL + DESK_OVL:
        k = ovl_keys[n]
        frs = m['overlays'][n]['frames']
        s = base(k, frs[0])
        s.update({'kind': 'overlay', 'of': KEY, 'layer': n, 'depthOffset': OVL_DEPTH[n], 'frames': frs,
                  'mode': m['overlays'][n].get('mode'), 'groundPoint': m['overlays'][n].get('ground'),
                  'notes': OVL_NOTES[n]})
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
                     'frontTest.b (right of the +X face).  Its depth is then max(its world y, building depth + top) '
                     '(+ y * 1e-6), top = the depth of the building\'s top-most layer + 0.01: 0.02 with depthOffsets '
                     '(_props +0.01), 0.01 x cutaway.drawOrder.length with src/entities/Cutaway.js indices.  So the '
                     'mailbox and an actor walking along the facade behind it keep their y order.  Everything else '
                     'around the building is behind it (plain world y).',
    'collision': 'wallCircles = [dx, dy, r] at ground level (r in the Collision metric dx^2 + (2 dy)^2, 64 per metre) '
                 'along the four walls with a gap at the door; an inside actor (drawn floorLiftPx higher) tests its '
                 'point + [0, floorLiftPx].  walkPoly = the inside floor the chief / staff may walk on (lifted like '
                 'the inside points), with a notch through the door.',
    'night': 'chief_office.night: _glow is NORMAL-blend artwork over the closed shell at night (DayClock lightsOn), '
             'NEVER by day and never while revealed; lightPoints for dayClock.addLight (lightPointsOpen while '
             'revealed).  The inside layers are not dimmed by us (the DayClock MULTIPLY overlay does that).',
    'insideShadows': 'People inside the office stand on the raised floor: draw their contact shadow at building '
                     'depth + cutaway.insideShadowDepthOffset (-0.449, just above _floor) and floorLiftPx up; at '
                     'DEPTH.SHADOW it would sit under _floor and vanish.',
    'furniture': 'chief_office.furnitureM = the inside furniture footprints in building metres ([x0, y0, x1, y1], top '
                 'height) - for walk avoidance; standing work spots keep >= 0.3 m from every tall piece.',
    'items': '72 x 72 frames, anchor [0.5, 0.86] (36, 61.9) = bottom centre of the ground contact; stackStep px '
             'between stacked copies; carryScale for head-carried stacks; icon true (usable as UI icons).',
    'shadows': 'the building, its layers and the mailbox have baked soft cool shadows falling screen down-right; '
               'items none.',
}


# =================================================================================================== main

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'office')
    out, prev, previews, rgba, allow_look = OUT, PREV, True, False, False
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
        elif a == '--allow-look':
            allow_look = True
        i += 1
    m, err = load_building(cache, allow_look)
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
    # (polish M6) what a closed-look / inside page split of office_bld would weigh (the build can split by frame group)
    split = {}
    for part, frs in (('closed', [(n, im) for n, im in bld_frames if n in PAGE_CLOSED]),
                      ('inside', [(n, im) for n, im in bld_frames if n not in PAGE_CLOSED])):
        sh_, _ = best_pack(frs)
        split[part] = {'frames': len(frs), 'size': [sh_.width, sh_.height],
                       'mib': round(sh_.width * sh_.height * 4 / 1048576.0, 3)}
    print('[pack] page split estimate: closed %s, inside %s' % (split['closed'], split['inside']))
    print('[pack] %s %dx%d %d frames  %.2f MiB RGBA (budget %.1f)' % (BLD_ATLAS, sheet.width, sheet.height,
                                                                     len(bld_frames), mib[BLD_ATLAS], BUDGET_BLD_MIB))
    print('[pack] %s %dx%d %d frames  %.2f MiB RGBA' % (ITEM_ATLAS, isheet.width, isheet.height, len(item_imgs),
                                                         mib[ITEM_ATLAS]))
    # ---------------------------------------------------------------- manifest
    sprites = build_manifest(m, (W, H), anchor, atlas_of, shell_raw, mb, items, item_imgs, mb_size, mb_anchor)
    groups = sorted({re.sub(r'_\d+$', '', n) for n in PAGE_CLOSED})
    sprites[KEY]['pageSplit'] = {
        'closed': groups, 'inside': 'every other office_bld frame',
        'closedMiB': split['closed']['mib'], 'insideMiB': split['inside']['mib'], 'oneAtlasMiB': round(mib[BLD_ATLAS], 3),
        'note': 'office_bld is ONE page (CONTRACT_V42 AI.1; tools/test/chief2_phaser.mjs and of_preview.py load it '
                'alone), so the closed office keeps its inside resident.  For the plan 13.2 plaza budget (office closed '
                'look 2.5 MiB, officeInside acquired only by a reveal) split it at build time like town_civic: '
                "tools/build/pack_pages.py TOWN_SPLIT['office_bld'] = [('closed', set(closed)), ('inside', None)] -> "
                'office_bld@closed (always) + office_bld@inside (Residency region officeInside).  The two pages cost '
                '+2 shipped files.'}
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
