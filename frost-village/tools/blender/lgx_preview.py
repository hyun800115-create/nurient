"""
lgx_preview.py - previews of assets/logistics (reads the PACKED atlases + manifest, i.e. exactly what the game gets):

  docs/previews/lgx_all.png       every sprite / vehicle, labelled (centre closed + open, items, producers, vehicles)
  docs/previews/lgx_cutaway.png   the centre closed / half (shell 45 %) / cut (walls 1.6 m) / open, side by side
  docs/previews/lgx_reveal.gif    the shell fading out and back in while the inside works
  docs/previews/lgx_scene.png     1x mock-up: centre open, stocked racks, staff (townsfolk), forklift on its path,
                                  truck + van at the docks, shop owners queuing at the settlement counter
  docs/previews/lgx_conveyor.gif, lgx_docks.gif, lgx_forklift.gif, lgx_trucks.gif, lgx_producers.gif

    python3 tools/blender/lgx_preview.py [--only name,name] [--prev DIR]
Composition follows the manifest conventions (layerOrder, bands, rackSlots, dockVehiclePoints) - it doubles as a
reference implementation of the cutaway drawing order for the game.
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
import bld_pack as bp    # noqa: E402  (read-only reuse: atlas_lib)

ASSETS = os.path.join(GAME, 'assets')
PREV = os.path.join(GAME, 'docs', 'previews')
KX, KY, KZ = 45.2548, 22.6274, 55.4256
BG = (236, 241, 248)
CENTER = 'logistics_center'
ITEM_SCALE = 0.8
STOCK_SCALE = 0.85
_SC = {}


def _scaled(key, im, sc):
    if (key, sc) not in _SC:
        _SC[(key, sc)] = im.resize((max(1, int(round(im.width * sc))), max(1, int(round(im.height * sc)))),
                                   Image.LANCZOS)
    return _SC[(key, sc)]


def kfont(size):
    from PIL import ImageFont
    for p in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                pass
    return pp.font(size)


class Lib:
    def __init__(self):
        self.man, self.get = bp.atlas_lib('logistics/manifest.json')
        self.S = self.man['sprites']
        self.V = self.man['characters']
        self.C = self.S[CENTER]
        W, H = self.C['frameSize']
        self.W, self.H = W, H
        self.A = (int(round(self.C['anchor'][0] * W)), int(round(self.C['anchor'][1] * H)))
        self._vehx = bp.atlas_lib('vehicles/manifest.json')
        self.tf = None
        try:
            import townfolk2_compose as t2
            self.tf = t2.Townfolk2.from_assets()
            hp = os.path.join(ASSETS, 'harbor', 'townfolk_presets.json')
            if os.path.exists(hp):
                self.tf.T['generator']['presets'].update(json.load(open(hp, encoding='utf-8'))['presets'])
        except Exception as e:                       # noqa: BLE001
            print('note: townfolk disabled (%s)' % e)
        self.vil2 = bp.atlas_lib('villagers2/manifest.json')

    def spr(self, key, frame=None):
        s = self.S[key]
        return self.get(s['atlas'], frame or s['frame'])

    def layer(self, name):
        return self.spr(self.C['layers'][name])

    def patch(self, name, f):
        s = self.S[self.C['patches'][name]]
        fr = list(s['anims'].values())[0]['frames'][f]
        return self.get(s['atlas'], fr)

    def item(self, key):
        s = self.S[key]
        return self.get(s['atlas'], s['frame']), s

    def vehicle(self, key, anim, d, i, over=False):
        if key in self.V:
            v = self.V[key]
            man, get = self.man, self.get
        else:
            man, get = self._vehx
            v = man['characters'][key]
        dd = {'SW': 'SE', 'NW': 'NE'}.get(d, d)
        fr = '%s_%s_%d' % (anim, dd, i)
        if over:
            if not v.get('overlay'):
                return None, v
            im = get(v['overlay']['atlas'], 'over_' + fr)
        else:
            im = get(v['atlas'], fr)
        if im is not None and d in ('SW', 'NW'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        return im, v

    def person(self, preset, anim, d, i=0, seed=0):
        if not self.tf:
            return None
        p = self.tf.preset(preset, seed) if preset else self.tf.random_person(seed)
        try:
            return self.tf.compose(p, anim, d, i)
        except Exception:                             # noqa: BLE001
            return self.tf.compose(p, 'idle', d, 0)

    def villager(self, key, anim, d, i=0):
        man, get = self.vil2
        c = man['characters'][key]
        dd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d)
        im = get(c['atlas'], '%s_%s_%d' % (anim, dd, i))
        if im is not None and d in ('SW', 'W', 'NW'):
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        return im


def with_alpha(im, a):
    if a >= 0.999:
        return im
    arr = np.asarray(im).astype(np.float32)
    arr[..., 3] *= a
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def shadow_ellipse(w, h, ang=0.0, alpha=70):
    big = Image.new('L', (int(w * 1.6) + 8, int(w * 1.6) + 8), 0)
    d = ImageDraw.Draw(big)
    cx, cy = big.width / 2, big.height / 2
    d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=alpha)
    big = big.rotate(-ang, resample=Image.BICUBIC).filter(ImageFilter.GaussianBlur(3))
    im = Image.new('RGBA', big.size, (38, 46, 82, 0))
    im.putalpha(big)
    return im, (big.width // 2, big.height // 2)


# =================================================================================================== centre composer

class Centre:
    """Draws the logistics centre with its layers + stock + actors in the documented order (reference)."""

    def __init__(self, lib, rng_seed=3, fill=0.85):
        self.L = lib
        self.C = lib.C
        self.rnd = random.Random(rng_seed)
        self.stock = self.make_stock(fill, rng_seed)

    def make_stock(self, fill=0.85, seed=3):
        """Reference stock layout: every slot holds lanes x rows of item stacks (spanPx / depthPx), filled to
        `fill` (0 = empty shelves, 1 = every stack at maxStackPx).  Small items (content <= 44 px wide at 1x) get
        2 lanes x 2 rows, big ones (sofa, bed, fridge ...) 1 x 1.  -> list of (slot, key, img, scale, pos list)."""
        rnd = random.Random(seed)
        out = []
        cats = self.C['rackCategories']
        for s in sorted(self.C['rackSlots'], key=lambda s: s['drawOrder']):
            key = cats[s['category']][(s['level'] * 2 + s['slot'] + seed) % len(cats[s['category']])]
            im, sd = self.L.item(key)
            bb = im.getbbox() or (0, 0, 72, 72)
            small = (bb[2] - bb[0]) <= 44
            sc = STOCK_SCALE
            lanes, rows = (2, 2) if small else (1, 1)
            if s['rack'] == 'floor_bays':
                lanes, rows = (1, 1) if not small else (2, 1)
            h1 = (sd.get('topPx') or 40) * sc         # topPx = height of one item above its anchor (px)
            step = max(4.0, (sd.get('stackStep') or 12) * sc)
            if h1 > s['maxStackPx'] + 6:
                continue                               # (never happens with the shipped items)
            nmax = 1 + max(0, int((s['maxStackPx'] - h1) // step))
            stacks = []
            for r in range(rows):
                u = (r + 0.5) / rows - 0.5 if rows > 1 else 0.0
                for ln in range(lanes):
                    t = (ln + 0.5) / lanes - 0.5 if lanes > 1 else 0.0
                    x = s['point'][0] + s['spanPx'][0] * t + s['depthPx'][0] * u
                    y = s['point'][1] + s['spanPx'][1] * t + s['depthPx'][1] * u
                    stacks.append((r, y, x))
            stacks.sort(key=lambda q: (q[0], q[1]))
            total = len(stacks) * nmax
            want = int(round(total * fill * rnd.uniform(0.85, 1.15))) if fill < 1 else total
            want = max(0, min(total, want))
            if want == 0:
                continue
            per = [0] * len(stacks)
            for k in range(want):                      # fill front rows first, evenly
                idx = sorted(range(len(stacks)), key=lambda q: (per[q], -stacks[q][0], rnd.random()))[0]
                per[idx] += 1
            pos = []
            for (r, y, x), n in zip(stacks, per):
                for k in range(n):
                    pos.append((x, y, k * step))
            out.append((s, key, im, sc, pos))
        return out

    def stock_ops(self, ox, oy, band='stock'):
        """Draw ops of the stock stacks in one band ('stock' = inside the racks, 'front' = floor bays); each op
        (img, x, y, sort_y) - sort_y = the stack's ground y on the canvas (front band is y-sorted with actors)."""
        ops = []
        for s, key, im, sc, pos in self.stock:
            if s.get('band', 'stock') != band:
                continue
            ims = _scaled(key, im, sc)
            ax, ay = 36 * sc, 54 * sc
            for x, y, lift in pos:
                ops.append((ims, int(round(ox + x - ax)), int(round(oy + y - ay - lift)), oy + y + lift * 0.0001))
        return ops

    def draw(self, canvas, ox, oy, shell=1.0, cut=0.0, belt=0, doors=(0, 0), lamp=0, actors=None, stock=True):
        """ox, oy = where the building anchor lands on the canvas.  actors = {'mid': [...], 'front': [...],
        'outside': [...]} each (img, x, y, depth) with x, y = top-left on the canvas."""
        actors = actors or {}
        L = self.L
        ax, ay = L.A

        def put(im, a=1.0):
            canvas.alpha_composite(with_alpha(im, a), (ox - ax, oy - ay))
        inside = shell < 0.999 or doors[0] > 0 or doors[1] > 0
        if inside:
            put(L.layer('back'))
            put(L.layer('floor'))
            put(L.layer('interior'))
            put(L.patch('lamp', lamp))
            if stock:
                for im, x, y, _ in self.stock_ops(ox, oy, 'stock'):
                    canvas.alpha_composite(im, (x, y))
            put(L.layer('interior_racks'))
            for im, x, y, _ in sorted(actors.get('mid', []), key=lambda t: t[3]):
                canvas.alpha_composite(im, (x, y))
            put(L.layer('interior_front'))
            put(L.patch('conveyor', belt))
            front = list(actors.get('front', [])) + (self.stock_ops(ox, oy, 'front') if stock else [])
            for im, x, y, _ in sorted(front, key=lambda t: t[3]):
                canvas.alpha_composite(im, (x, y))
            put(L.layer('stub'))
        else:
            put(L.layer('floor'))           # the apron outside the walls is in the floor layer
        if cut > 0.001:
            put(L.layer('shell_cut'), cut)
        if shell > 0.001:
            put(L.layer('shell'), shell)
            nb = name_board(L)
            if nb:
                canvas.alpha_composite(with_alpha(nb[0], shell), (ox + nb[1], oy + nb[2]))
            put(L.patch('dock1', doors[0]), shell)
            put(L.patch('dock2', doors[1]), shell)
        put(L.layer('props'))
        for im, x, y, _ in sorted(actors.get('outside', []), key=lambda t: t[3]):
            canvas.alpha_composite(im, (x, y))


_BOARD = {}


def name_board(lib, lang='ko'):
    """The game-side name label on the blank board (manifest nameBoard): text fitted into the board, sheared onto
    the -Y facade.  Returns (img, dx, dy) with dx, dy = top-left relative to the building anchor."""
    nb = lib.C.get('nameBoard')
    if not nb:
        return None
    if lang in _BOARD:
        return _BOARD[lang]
    w, h = nb['widthPx'], nb['heightPx']
    txt = nb['text'][lang]
    big = Image.new('RGBA', (w * 4, h * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    size = h * 4
    f = kfont(size)
    while size > 8 and (f.getlength(txt) > w * 4 * 0.9 or size > h * 4 * 0.62):
        size -= 2
        f = kfont(size)
    tw = f.getlength(txt)
    col = tuple(int(nb['color'][i:i + 2], 16) for i in (1, 3, 5))
    d.text(((w * 4 - tw) / 2, (h * 4 - size) / 2 - size * 0.12), txt, fill=col + (255,), font=f)
    flat_ = big.resize((w, h), Image.LANCZOS)
    k = nb['shearY']
    H2 = int(h + w * k + 2)
    sheared = flat_.transform((w, H2), Image.AFFINE, (1, 0, 0, -k, 1, 0), resample=Image.BICUBIC)
    cx, cy = nb['point']
    _BOARD[lang] = (sheared, int(round(cx - w / 2)), int(round(cy - h / 2 - w * k / 2)))
    return _BOARD[lang]


def person_op(lib, preset, pt, d, ox, oy, anim='idle', i=0, seed=0, vil=None):
    im = lib.villager(vil, anim, d, i) if vil else lib.person(preset, anim, d, i, seed)
    if im is None:
        return None
    return (im, int(round(ox + pt[0] - 64)), int(round(oy + pt[1] - 104)), oy + pt[1])


def vehicle_ops(lib, key, anim, d, i, pt, ox, oy, driver=None, seed=0):
    """Vehicle + (optional) driver + overlay as draw ops at anchor point pt (px from the building anchor)."""
    im, v = lib.vehicle(key, anim, d, i)
    if im is None:
        return []
    W, H = v['frameSize']
    ax, ay = v['anchor'][0] * W, v['anchor'][1] * H
    x0, y0 = ox + pt[0], oy + pt[1]
    ops = []
    dd = {'SW': 'SE', 'NW': 'NE'}.get(d, d)
    sh = v.get('shadow', {}).get(dd)
    if sh:
        ang = sh[2] if d == dd else -sh[2]
        s_im, (sx, sy) = shadow_ellipse(sh[0], sh[1], ang)
        ops.append((s_im, int(x0 - sx), int(y0 - sy), y0 - 0.5))
    bob = 0
    a = v['anims'].get(anim, {})
    if a.get('bobPx'):
        bob = a['bobPx'][i % len(a['bobPx'])]
    ops.append((im, int(round(x0 - ax)), int(round(y0 - ay)), y0))
    if driver and v.get('seats', {}).get(dd):
        seat = v['seats'][dd][v.get('driverSeat') or 0]
        sdir = v['seatDirs'][dd][v.get('driverSeat') or 0]
        sx = seat[0] if d == dd else -seat[0]
        if sdir in ('S', 'SE', 'E', 'SW', 'W'):
            pim = lib.person(driver, 'sit', d if d in ('SE', 'SW') else sdir, 0, seed)
            pt2 = (x0 + sx, y0 + seat[1] + bob)
        else:
            st = v['seatsStand'][dd][v.get('driverSeat') or 0]
            pim = lib.person(driver, 'idle', d, 0, seed)
            pt2 = (x0 + (st[0] if d == dd else -st[0]), y0 + st[1] + bob)
        if pim is not None:
            ops.append((pim, int(round(pt2[0] - 64)), int(round(pt2[1] - 104)), y0 + 0.01))
        oim, _ = lib.vehicle(key, anim, d, i, over=True)
        if oim is not None:
            ops.append((oim, int(round(x0 - ax)), int(round(y0 - ay)), y0 + 0.02))
    return ops


def ground(canvas, ox, oy, roads=True):
    """Snow everywhere + a cobble road to the docks and to the entrance (world metres from the building anchor)."""
    def tex(rel, fill):
        p = os.path.join(ASSETS, rel)
        return Image.open(p).convert('RGBA') if os.path.exists(p) else Image.new('RGBA', (64, 64), fill)
    snow = tex('ground/ground_snow.png', (244, 247, 251, 255))
    road = tex('ui2/ground_road.png', (200, 205, 214, 255))
    W, H = canvas.size
    tiled = Image.new('RGBA', (W, H))
    for ty in range(0, H, snow.height):
        for tx in range(0, W, snow.width):
            tiled.paste(snow, (tx, ty))
    canvas.alpha_composite(tiled)
    if not roads:
        return

    def P(x, y):
        return ox + (x + y) * KX, oy + (x - y) * KY

    def poly(pts):
        m = Image.new('L', (W, H), 0)
        ImageDraw.Draw(m).polygon([P(*p) for p in pts], fill=255)
        t = Image.new('RGBA', (W, H))
        for ty in range(0, H, road.height):
            for tx in range(0, W, road.width):
                t.paste(road, (tx, ty))
        canvas.paste(t, (0, 0), m)
    poly([(7.1, -9.0), (13.5, -9.0), (13.5, 4.2), (7.1, 4.2)])
    poly([(-12.0, -9.0), (13.5, -9.0), (13.5, -6.2), (-12.0, -6.2)])
    poly([(-2.4, -6.2), (-0.8, -6.2), (-0.8, -5.0), (-2.4, -5.0)])


# =================================================================================================== previews

def scene_actors(lib, ox, oy, rich=True, t=0):
    C = lib.C
    act = {'mid': [], 'front': [], 'outside': []}
    pres = {'clerk': (None, 'npc_clerk_b'), 'packer': ('factory', None), 'picker': ('dock_worker', None),
            'dockhand': ('dock_worker', None)}
    for k, (pt, d, role, band) in enumerate(zip(C['staffPoints'], C['staffDirs'], C['staffRoles'], C['staffBands'])):
        preset, vil = pres.get(role, ('factory', None))
        anim = {'clerk': 'serve', 'packer': 'idle', 'picker': 'idle', 'dockhand': 'wave'}[role]
        i = (t + k) % 4
        if vil:
            op = person_op(lib, None, pt, d, ox, oy, anim=anim, i=(t // 2) % 6, vil=vil)
        else:
            op = person_op(lib, preset, pt, d, ox, oy, anim=anim if anim != 'wave' else 'wave', i=i if anim != 'wave'
                           else (t // 2) % 6, seed=20 + k)
        if op:
            act['mid' if band in ('mid', 'any') else band].append(op)
    owners = ['barista', 'hairdresser', None, 'postal', 'station', None, 'barista']
    for k, (pt, d, band) in enumerate(zip(C['customerPoints'], C['customerDirs'], C['customerBands'])):
        if not rich and k > 3:
            break
        op = person_op(lib, owners[k % len(owners)], pt, d, ox, oy, anim='idle', i=(t + k) % 4, seed=40 + k)
        if op:
            act['mid' if band in ('mid', 'any') else band].append(op)
    return act


def compose_scene(lib, rich=True, shell=0.0, cut=0.0, t=0, size=(2200, 1400), origin=(980, 760), roads=True,
                  forklift_at=None, doors=(5, 5), with_vehicles=True):
    canvas = Image.new('RGBA', size, BG + (255,))
    ox, oy = origin
    ground(canvas, ox, oy, roads)
    C = lib.C
    cen = Centre(lib)
    act = scene_actors(lib, ox, oy, rich, t)
    # forklift (loaded) on the lane heading SE + driver; a second empty one heading SW in the dock corridor
    fp = C['forkliftPath']
    if forklift_at is None:
        p0, p1 = fp[0]['point'], fp[1]['point']
        u = 0.35
        pt = (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)
    else:
        pt = forklift_at
    band = fp[0]['legBand']
    for op in vehicle_ops(lib, 'forklift_loaded', 'move', 'SE', t % 4, pt, ox, oy, driver='factory', seed=7):
        act['mid' if band in ('mid', 'any', 'mixed') else band].append(op)
    if rich:
        q0, q1 = fp[3]['point'], fp[4]['point']
        pt2 = (q0[0] + (q1[0] - q0[0]) * 0.55, q0[1] + (q1[1] - q0[1]) * 0.55)
        for op in vehicle_ops(lib, 'forklift', 'idle', 'SW', t % 2, pt2, ox, oy, driver='dock_worker', seed=9):
            act['front'].append(op)
        # pallet jack pushed by a worker toward the materials bays
        jp = (C['rackSlots'][0]['point'][0], C['rackSlots'][0]['point'][1])
        jx = [s for s in C['rackSlots'] if s['rack'] == 'floor_bays'][0]['point']
        jpt = (jx[0] - 70, jx[1] - 6)
        del jp
        vj = lib.V['pallet_jack']
        hp = vj['handlePoint']['SE']
        for op in vehicle_ops(lib, 'pallet_jack', 'move', 'SE', t % 4, jpt, ox, oy):
            act['front'].append(op)
        if lib.tf:
            p = lib.tf.preset('factory', 77)
            pim = lib.tf.compose(p, 'push', 'SE', t % 8)
            pp_ = lib.tf.push_point(p, 'SE')
            px_ = (jpt[0] + hp[0] - pp_[0], jpt[1] + hp[1] - pp_[1])
            act['front'].append((pim, int(round(ox + px_[0] - 64)), int(round(oy + px_[1] - 104)), oy + px_[1]))
    # vehicles at the docks (outside)
    if with_vehicles:
        dv = C['dockVehiclePoints']
        for op in vehicle_ops(lib, 'truck_cargo', 'idle', 'SE', 0, dv['truck_cargo'][1], ox, oy, driver='postal', seed=3):
            act['outside'].append(op)
        for op in vehicle_ops(lib, 'delivery_van_red', 'idle', 'SE', 0, dv['delivery_van'][0], ox, oy,
                              driver='station', seed=5):
            act['outside'].append(op)
    cen.draw(canvas, ox, oy, shell=shell, cut=cut, belt=t % 8, doors=doors, lamp=t % 4, actors=act)
    return canvas


def crop_to(canvas, box):
    return canvas.crop(box)


def caption(img, text, h=40):
    W, H = img.size
    out = Image.new('RGB', (W, H + h), (31, 95, 168))
    out.paste(img.convert('RGB'), (0, 0))
    d = ImageDraw.Draw(out)
    d.text((14, H + 10), text, fill=(255, 255, 255), font=pp.font(17))
    return out


def label(img, items, size=14):
    d = ImageDraw.Draw(img)
    f = kfont(size)
    for text, sx, sy in items:
        tw = f.getlength(text)
        d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + size + 3], radius=7,
                            fill=(255, 255, 255, 220))
        d.text((sx - tw / 2, sy - 1), text, fill=(30, 34, 44), font=f)


def preview_scene(lib, out):
    cv = compose_scene(lib, rich=True, shell=0.0, t=2)
    ox, oy = 980, 760
    C = lib.C
    labs = []

    def L_(text, pt, dy=0):
        labs.append((text, ox + pt[0], oy + pt[1] + dy))
    roles = {'clerk': 'clerk (settlement)', 'packer': 'packer', 'picker': 'picker', 'dockhand': 'dock hand'}
    seen = set()
    for pt, r in zip(C['staffPoints'], C['staffRoles']):
        if r in seen and r != 'packer':
            continue
        seen.add(r)
        L_(roles[r], pt, 8)
    L_('shop owners queue', C['customerPoints'][2], 8)
    L_('truck at dock 2', C['dockVehiclePoints']['truck_cargo'][1], 40)
    L_('van at dock 1', C['dockVehiclePoints']['delivery_van'][0], 40)
    L_('forklift on its path', C['forkliftPath'][1]['point'], -150)
    label(cv, labs)
    cv = cv.crop((140, 150, 2140, 1330))
    caption(cv, 'Logistics centre at 1x (PPU 64), revealed: stocked racks (assets/logistics items at 0.8x on rackSlots), '
                'staff at staffPoints (townsfolk + villagers2 clerk), forklift on forkliftPath, truck_cargo + '
                'delivery_van at dockVehiclePoints, shop owners at customerPoints').save(out, optimize=True)


def preview_cutaway(lib, out):
    states = [('closed', 1.0, 0.0), ('half (shell 45%)', 0.45, 0.0), ('cut (walls 1.6 m)', 0.0, 1.0),
              ('open', 0.0, 0.0)]
    panels = []
    for name, sh, cu in states:
        cv = compose_scene(lib, rich=False, shell=sh, cut=cu, t=1, size=(1500, 1000), origin=(640, 560),
                           roads=False, doors=(0, 0), with_vehicles=False)
        cv = cv.crop((60, 40, 1340, 940))
        d = ImageDraw.Draw(cv)
        d.rounded_rectangle([14, 12, 22 + pp.font(22).getlength(name), 46], radius=9, fill=(255, 255, 255, 230))
        d.text((20, 15), name, fill=(25, 30, 40), font=pp.font(22))
        panels.append(cv.resize((cv.width * 3 // 4, cv.height * 3 // 4), Image.LANCZOS))
    W = sum(p.width for p in panels)
    sheet = Image.new('RGBA', (W, panels[0].height), BG + (255,))
    x = 0
    for p in panels:
        sheet.alpha_composite(p, (x, 0))
        x += p.width
    caption(sheet, 'logistics_center cutaway layers (0.75x): _shell on / 45% / _shell_cut / off - the inside keeps '
                   'working underneath (stock, staff, conveyor)').save(out, optimize=True)


def gif(frames, out, dur=100):
    pal = frames[min(2, len(frames) - 1)].convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.convert('RGB').quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    q[0].save(out, save_all=True, append_images=q[1:], duration=dur, loop=0, optimize=False, disposal=1)


def preview_reveal(lib, out):
    seq = [1.0] * 5 + [1.0 - k / 8.0 for k in range(1, 9)] + [0.0] * 10 + [k / 8.0 for k in range(1, 9)] + [1.0] * 3
    fp = lib.C['forkliftPath']
    p0, p1 = fp[0]['point'], fp[1]['point']
    frames = []
    for t, a in enumerate(seq):
        u = (t % 34) / 34.0
        pt = (p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u)
        cv = compose_scene(lib, rich=True, shell=a, t=t, size=(1500, 1000), origin=(640, 560), roads=False,
                           forklift_at=pt, doors=(0, 0), with_vehicles=False)
        cv = cv.crop((60, 40, 1340, 940)).resize((768, 540), Image.LANCZOS)
        frames.append(cv)
    gif(frames, out, 110)


def crop_anim(lib, out, box, frames_fn, n, scale=2, dur=120):
    fr = []
    for i in range(n):
        cv = frames_fn(i)
        c = cv.crop(box)
        fr.append(c.resize((c.width * scale, c.height * scale), Image.NEAREST))
    gif(fr, out, dur)


def preview_conveyor(lib, out):
    ox, oy = 640, 560
    C = lib.C
    s, e = C['conveyor']['start'], C['conveyor']['end']
    box = (ox + s[0] - 90, oy + min(s[1], e[1]) - 120, ox + e[0] + 130, oy + max(s[1], e[1]) + 90)

    def fn(i):
        cv = Image.new('RGBA', (1500, 1000), BG + (255,))
        cen = Centre(lib)
        act = scene_actors(lib, ox, oy, rich=False, t=i)
        cen.draw(cv, ox, oy, shell=0.0, belt=i, lamp=i % 4, actors=act)
        return cv
    crop_anim(lib, out, box, fn, 8, 2, 120)


def preview_docks(lib, out):
    ox, oy = 640, 560
    C = lib.C
    d1, d2 = C['dockPoints']
    box = (ox + min(d1[0], d2[0]) - 160, oy + min(d1[1], d2[1]) - 260, ox + max(d1[0], d2[0]) + 260,
           oy + max(d1[1], d2[1]) + 140)
    seq = [0, 0, 1, 2, 3, 4, 5, 5, 5, 5, 4, 3, 2, 1, 0, 0]

    def fn(i):
        cv = Image.new('RGBA', (1500, 1000), BG + (255,))
        ground(cv, ox, oy, roads=False)
        Centre(lib).draw(cv, ox, oy, shell=1.0, doors=(seq[i], seq[(i + 3) % len(seq)]))
        return cv
    crop_anim(lib, out, box, fn, len(seq), 1, 110)


def vehicle_frame(lib, key, anim, d, i, size=(420, 360), driver=None):
    cv = Image.new('RGBA', size, BG + (255,))
    for im, x, y, _ in sorted(vehicle_ops(lib, key, anim, d, i, (0, 0), size[0] // 2, int(size[1] * 0.68),
                                          driver=driver, seed=11), key=lambda t: t[3]):
        cv.alpha_composite(im, (x, y))
    return cv


def preview_forklift(lib, out):
    fr = []
    seq = list(range(6)) + [5, 5] + list(range(5, -1, -1)) + [0, 0]
    for k, i in enumerate(seq):
        a = vehicle_frame(lib, 'forklift_loaded', 'lift', 'SE', i, driver='factory')
        b = vehicle_frame(lib, 'forklift', 'lift', 'NE', i, driver='factory')
        c = vehicle_frame(lib, 'forklift', 'move', 'SW', k % 4, driver='dock_worker')
        row = Image.new('RGBA', (a.width * 3, a.height), BG + (255,))
        row.alpha_composite(a, (0, 0))
        row.alpha_composite(b, (a.width, 0))
        row.alpha_composite(c, (a.width * 2, 0))
        fr.append(row)
    gif(fr, out, 120)


def preview_trucks(lib, out):
    fr = []
    seq = list(range(6)) + [5] * 4 + list(range(5, -1, -1)) + [0] * 2
    for k, i in enumerate(seq):
        a = vehicle_frame(lib, 'moving_truck', 'unload', 'NE', i, size=(560, 420), driver='postal')
        b = vehicle_frame(lib, 'moving_truck', 'unload', 'SE', i, size=(560, 420), driver='postal')
        vans = Image.new('RGBA', (560, 420), BG + (255,))
        for j, c in enumerate(('red', 'blue', 'mint')):
            v = vehicle_frame(lib, 'delivery_van_' + c, 'move', ['SE', 'NE', 'SW'][j], k % 4, size=(380, 300),
                              driver='station')
            v = v.resize((250, 197), Image.LANCZOS)
            vans.alpha_composite(v, (10 + 180 * j, 40 + 110 * (j % 2)))
        row = Image.new('RGBA', (560 * 3, 420), BG + (255,))
        row.alpha_composite(a, (0, 0))
        row.alpha_composite(b, (560, 0))
        row.alpha_composite(vans, (1120, 0))
        fr.append(row)
    gif(fr, out, 130)


def preview_producers(lib, out):
    fr = []
    for i in range(8):
        row = Image.new('RGBA', (1000, 520), BG + (255,))
        x = 0
        for key in ('furniture_workshop', 'appliance_factory'):
            s = lib.S[key]
            frs = s['anims']['work']['frames']
            im = lib.get(s['atlas'], frs[i % 4])
            W, H = s['frameSize']
            row.alpha_composite(im, (x + (500 - W) // 2, (520 - H) // 2))
            x += 500
        fr.append(row)
    gif(fr, out, 125)


def preview_all(lib, out):
    ents = []
    cl = Image.new('RGBA', (lib.W, lib.H), (0, 0, 0, 0))
    Centre(lib).draw(cl, lib.A[0], lib.A[1], shell=1.0)
    ents.append(('logistics_center (shell)', cl))
    op = Image.new('RGBA', (lib.W, lib.H), (0, 0, 0, 0))
    Centre(lib).draw(op, lib.A[0], lib.A[1], shell=0.0, stock=False)
    ents.append(('logistics_center (open, empty racks)', op))
    for name in ('back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub', 'shell_cut', 'props'):
        ents.append(('_' + name, lib.layer(name).resize((lib.W // 2, lib.H // 2), Image.LANCZOS)))
    for key in ('furniture_workshop', 'appliance_factory'):
        s = lib.S[key]
        ents.append((key, lib.spr(key)))
        ents.append((key + ' (work)', lib.get(s['atlas'], s['anims']['work']['frames'][2])))
    for key in [k for k, s in lib.S.items() if s.get('kind') == 'item']:
        im, _ = lib.item(key)
        ents.append((key, im.resize((144, 144), Image.LANCZOS)))
    for key in lib.V:
        for d, an, i in (('SE', 'idle', 0), ('NE', 'idle', 0)):
            ents.append(('%s %s' % (key, d), vehicle_frame(lib, key, an, d, i, size=(460, 380))))
        if key.startswith('forklift'):
            ents.append((key + ' lift 5', vehicle_frame(lib, key, 'lift', 'SE', 5, size=(460, 380))))
        if key == 'moving_truck':
            ents.append(('moving_truck unload 5', vehicle_frame(lib, key, 'unload', 'NE', 5, size=(560, 420))))
    pp.shelf_preview(ents, out, max_w=2600, title='assets/logistics at 1x (PPU 64; layer thumbnails at 0.5x, items '
                                                  'at 2x): logistics centre, producers, items, vehicles')


def preview_stock(lib, out):
    """Stock levels: the open centre (no actors) with the racks going empty -> full -> empty."""
    ox, oy = 640, 560
    levels = [0.0, 0.0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1.0, 1.0, 1.0, 0.75, 0.5, 0.25, 0.0]
    frames = []
    base = Image.new('RGBA', (1500, 1000), BG + (255,))
    ground(base, ox, oy, roads=False)
    for k, f in enumerate(levels):
        cv = base.copy()
        Centre(lib, rng_seed=5, fill=f).draw(cv, ox, oy, shell=0.0, belt=k % 8, lamp=k % 4)
        c = cv.crop((140, 60, 1260, 860))
        d = ImageDraw.Draw(c)
        txt = 'stock %d%%' % int(round(f * 100))
        d.rounded_rectangle([14, 12, 30 + pp.font(24).getlength(txt), 50], radius=9, fill=(255, 255, 255, 235))
        d.text((22, 16), txt, fill=(25, 30, 40), font=pp.font(24))
        frames.append(c.resize((c.width * 3 // 4, c.height * 3 // 4), Image.LANCZOS))
    gif(frames, out, 260)


ALL = {'all': preview_all, 'cutaway': preview_cutaway, 'reveal': preview_reveal, 'scene': preview_scene,
       'conveyor': preview_conveyor, 'docks': preview_docks, 'forklift': preview_forklift, 'trucks': preview_trucks,
       'producers': preview_producers, 'stock': preview_stock}
EXT = {'stock': 'gif', 'reveal': 'gif', 'conveyor': 'gif', 'docks': 'gif', 'forklift': 'gif', 'trucks': 'gif', 'producers': 'gif'}


def main():
    argv = sys.argv[1:]
    only = None
    prev = PREV
    if '--only' in argv:
        only = argv[argv.index('--only') + 1].split(',')
    if '--prev' in argv:
        prev = argv[argv.index('--prev') + 1]
    os.makedirs(prev, exist_ok=True)
    lib = Lib()
    for name, fn in ALL.items():
        if only and name not in only:
            continue
        out = os.path.join(prev, 'lgx_%s.%s' % (name, EXT.get(name, 'png')))
        fn(lib, out)
        print('wrote', out)


if __name__ == '__main__':
    main()
