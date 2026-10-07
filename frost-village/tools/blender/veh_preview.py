"""
veh_preview.py - previews of assets/vehicles/ built FROM THE PACKED ATLASES + manifest (so they also prove the
manifest / atlas / anchor / seat / overlay data):

  docs/previews/veh_all.png         every vehicle (SE + NE, idle 0) and every vehicle building, labelled
  docs/previews/veh_scene.png       a street mock-up at 1x (PPU 64): roads from assets/ui2/ground_road, a bus stop
                                    with townsfolk + villagers waiting, the retro bus at the stop with passengers
                                    (seats + overlay), a parking lot with cars, the depots, traffic, signs
  docs/previews/veh_passengers.png  seat / overlay demo in all four headings (SE, NE + mirrored SW, NW)
  docs/previews/veh_move_era2.gif, veh_move_era3.gif, veh_siren.gif, veh_chief.gif

    python3 tools/blender/veh_preview.py [--out-dir assets/vehicles] [--prev docs/previews]
(veh_pack.py calls make_all() at the end.)
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
sys.path.insert(0, os.path.join(GAME, 'tools'))
BG = (236, 241, 248, 255)
SNOW = (244, 247, 251, 255)
INK = (40, 44, 56)
MIRRORED = {'SW': 'SE', 'NW': 'NE'}
FLIPDIR = {'SE': 'SW', 'SW': 'SE', 'NE': 'NW', 'NW': 'NE', 'E': 'W', 'W': 'E', 'S': 'S', 'N': 'N'}


def font(size=13):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


class Lib:
    """Frame lookup across atlases of any manifest fragment (untrimmed full frames)."""

    def __init__(self):
        self.sheets, self.frames, self.cache = {}, {}, {}

    def load_manifest(self, rel):
        p = os.path.normpath(os.path.join(ASSETS, rel))
        if not os.path.exists(p):
            return None
        m = json.load(open(p))
        here = os.path.dirname(p)
        for a in m.get('atlases', []):
            if a['key'] in self.frames:
                continue
            js = os.path.join(ASSETS, a['json'])
            png = os.path.join(ASSETS, a['png'])
            if os.path.dirname(os.path.abspath(js)) != here:       # a dry-run pack written somewhere else
                js = os.path.join(here, os.path.basename(a['json']))
                png = os.path.join(here, os.path.basename(a['png']))
            if os.path.exists(js) and os.path.exists(png):
                self.frames[a['key']] = (json.load(open(js))['frames'], png)
        for im in m.get('images', []):
            self.frames.setdefault('img:' + im['key'], (None, os.path.join(ASSETS, im['png'])))
        return m

    def frame(self, atlas, name, flip=False):
        key = (atlas, name, flip)
        if key in self.cache:
            return self.cache[key]
        frs, png = self.frames[atlas]
        if png not in self.sheets:
            self.sheets[png] = Image.open(png).convert('RGBA')
        fr = frs[name]
        f, s = fr['frame'], fr['spriteSourceSize']
        img = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
        img.paste(self.sheets[png].crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
        if flip:
            img = img.transpose(Image.FLIP_LEFT_RIGHT)
        self.cache[key] = img
        return img


# --------------------------------------------------------------------------- drawing helpers

def anchor_px(e, img):
    return int(round(e['anchor'][0] * img.width)), int(round(e['anchor'][1] * img.height))


def paste_at(canvas, img, x, y, ax, ay):
    canvas.alpha_composite(img, (int(round(x - ax)), int(round(y - ay))))


def soft_ellipse(canvas, cx, cy, w, h, angle=0.0, alpha=60):
    """Soft rotated ground shadow (what the game draws under a vehicle)."""
    S = 2
    W, H = int(w * 1.4) + 8, int(w * 1.4) + 8
    m = Image.new('L', (W * S, H * S), 0)
    d = ImageDraw.Draw(m)
    d.ellipse(((W - w) / 2 * S, (H - h) / 2 * S, (W + w) / 2 * S, (H + h) / 2 * S), fill=alpha)
    m = m.rotate(-angle, resample=Image.BICUBIC).resize((W, H), Image.LANCZOS)
    from PIL import ImageFilter
    m = m.filter(ImageFilter.GaussianBlur(max(2, h * 0.12)))
    sh = Image.new('RGBA', (W, H), (38, 46, 82, 0))
    sh.putalpha(m)
    canvas.alpha_composite(sh, (int(cx - W / 2), int(cy - H / 2)))


def vehicle_layers(lib, man, key, anim, d, i, passengers=None, shadow=True):
    """[(img, ax, ay, kind)] for a vehicle (with optional passengers [(seat index, img, sit)])."""
    e = man['characters'][key]
    rd = MIRRORED.get(d, d)
    flip = d in MIRRORED
    name = e['frameName'].format(anim=anim, dir=rd, i=i)
    base = lib.frame(e['atlas'], name, flip)
    ax, ay = anchor_px(e, base)
    out = [(base, ax, ay)]
    if passengers and e.get('overlay'):
        bob = e['anims'][anim].get('bobPx', [0] * 99)[i]
        order = e['seatDrawOrder'][rd]
        pmap = {k: (img, sit) for k, img, sit in passengers}
        for k in order:
            if k not in pmap:
                continue
            img, sit = pmap[k]
            pts = e['seats'][rd] if sit else e['seatsStand'][rd]
            dx, dy = pts[k]
            if flip:
                dx = -dx
            out.append(('p', img, dx, dy + bob))
        on = e['overlay']['frameName'].format(anim=anim, dir=rd, i=i)
        out.append((lib.frame(e['overlay']['atlas'], on, flip), ax, ay))
    return out


def draw_vehicle(canvas, lib, man, key, anim, d, i, x, y, passengers=None, shadow=True):
    e = man['characters'][key]
    if shadow:
        rd = MIRRORED.get(d, d)
        w, h, ang = e['shadow'][rd]
        soft_ellipse(canvas, x, y, w, h, -ang if d in MIRRORED else ang)
    for layer in vehicle_layers(lib, man, key, anim, d, i, passengers):
        if layer[0] == 'p':
            _, img, dx, dy = layer
            paste_at(canvas, img, x + dx, y + dy, 64, 104)
        else:
            img, ax, ay = layer
            paste_at(canvas, img, x, y, ax, ay)


def sprite_img(lib, man, key):
    s = man['sprites'][key]
    img = lib.frame(s['atlas'], s['frame'])
    return img, anchor_px(s, img)


# --------------------------------------------------------------------------- passengers (villagers sit frames)

class People:
    def __init__(self, lib):
        self.lib = lib
        self.vm = lib.load_manifest('villagers/manifest.json')
        self.cm = lib.load_manifest('characters/manifest.json')
        self.tf = None
        try:
            from townfolk_compose import Townfolk
            self.tf = Townfolk.from_assets()
        except Exception as ex:          # townsfolk are optional for the previews
            print('note: townsfolk compositor unavailable (%r)' % (ex,))

    def vil(self, key, anim, d, i=0):
        e = self.vm['characters'][key]
        rd = MIRRORED.get(d, d)
        name = '%s_%s_%d' % (anim, rd, i)
        return self.lib.frame(e['atlas'], name, d in MIRRORED)

    def passenger(self, key, seat_dir):
        """(img, sit) for a seat facing seat_dir: sit frame where it exists, else the idle back view."""
        e = self.vm['characters'][key]
        if 'sit' in e['anims'] and seat_dir in ('S', 'SE', 'E', 'SW', 'W'):
            return self.vil(key, 'sit', seat_dir), True
        return self.vil(key, 'idle', seat_dir), False

    def townsfolk(self, seed, anim='idle', d='SW', i=0):
        if self.tf is None:
            return None
        p = self.tf.random_person(seed=seed)
        return self.tf.compose(p, anim, d, i)


SITTERS = ['npc_grandpa', 'npc_aunt', 'npc_grandma', 'npc_herbalist', 'npc_bard']


def fill_passengers(people, e, d, n=None, skip_driver=False, seed=0):
    rd = MIRRORED.get(d, d)
    seats = e['seats'][rd]
    out = []
    rng = random.Random(seed)
    for k in range(len(seats)):
        if n is not None and len(out) >= n:
            break
        sd = e['seatDirs'][rd][k]
        if d in MIRRORED:
            sd = FLIPDIR[sd]
        key = SITTERS[(k + seed) % len(SITTERS)] if k else 'npc_grandpa'
        if rng.random() < 0.15 and k:
            continue
        img, sit = people.passenger(key, sd)
        out.append((k, img, sit))
    return out


# --------------------------------------------------------------------------- veh_all

def preview_all(lib, man, out):
    f = font(13)
    tiles = []
    keys = sorted(man['characters'], key=lambda k: (man['characters'][k]['era'], k))
    for k in keys:
        e = man['characters'][k]
        for d in ('SE', 'NE'):
            c = Image.new('RGBA', tuple(e['frameSize']), (0, 0, 0, 0))
            draw_vehicle(c, lib, man, k, 'idle', d, 0, *anchor_px(e, c), shadow=True)
            tiles.append(('%s %s (era %d)' % (k, d, e['era']), c))
    for k in man['sprites']:
        img, _ = sprite_img(lib, man, k)
        tiles.append((k, img))
    tiles = [(lab, im.crop(im.getchannel('A').getbbox() or (0, 0, 1, 1))) for lab, im in tiles]
    W = 2400
    x = y = 0
    rowh = 0
    pos = []
    for lab, im in tiles:
        w = max(im.width, 150) + 24
        h = im.height + 30
        if x + w > W:
            x = 0
            y += rowh
            rowh = 0
        pos.append((x, y, w, h))
        x += w
        rowh = max(rowh, h)
    H = y + rowh + 40
    sheet = Image.new('RGBA', (W, H), BG)
    d_ = ImageDraw.Draw(sheet)
    for (lab, im), (x, y, w, h) in zip(tiles, pos):
        sheet.alpha_composite(im, (x + (w - im.width) // 2, y + 4))
        tw = d_.textlength(lab, font=f)
        d_.rounded_rectangle((x + (w - tw) / 2 - 4, y + h - 24, x + (w + tw) / 2 + 4, y + h - 8), 5,
                            fill=(255, 255, 255, 230))
        d_.text((x + (w - tw) / 2, y + h - 24), lab, font=f, fill=INK)
    d_.rectangle((0, H - 28, W, H), fill=(32, 86, 160, 255))
    d_.text((12, H - 24), 'Frost Village v5 vehicles (assets/vehicles, 1x, PPU 64): era 2 + era 3 vehicles in the two '
                          'rendered headings with the game shadow ellipse, then the vehicle buildings', font=font(14),
            fill=(255, 255, 255))
    sheet.convert('RGB').save(out)
    print('wrote', out, sheet.size)


# --------------------------------------------------------------------------- scene

def iso(x, y, ox, oy):
    return ox + (x + y) * 45.2548, oy + (x - y) * 22.6274


def road_layer(size, polys, tex_path):
    W, H = size
    tex = Image.open(tex_path).convert('RGBA')
    tiled = Image.new('RGBA', (W, H))
    for ty in range(0, H, tex.height):
        for tx in range(0, W, tex.width):
            tiled.paste(tex, (tx, ty))
    m = Image.new('L', (W * 2, H * 2), 0)
    d = ImageDraw.Draw(m)
    for poly in polys:
        d.polygon([(px * 2, py * 2) for px, py in poly], fill=255)
    m = m.resize((W, H), Image.LANCZOS)
    tiled.putalpha(m)
    return tiled


def preview_scene(lib, man, people, out):
    W, H = 2600, 1500
    ox, oy = 1290, 640
    canvas = Image.new('RGBA', (W, H), SNOW)
    gm = lib.load_manifest('ground/manifest.json')
    snow = os.path.join(ASSETS, 'ground', 'ground_snow.png')
    if os.path.exists(snow):
        t = Image.open(snow).convert('RGBA')
        for ty in range(0, H, t.height):
            for tx in range(0, W, t.width):
                canvas.paste(t, (tx, ty))
    del gm
    # roads: a main road along world X (y in [-2.6, 2.6]) and a cross road along world Y (x in [9.4, 14.6])
    def rect(x0, x1, y0, y1):
        return [iso(x0, y0, ox, oy), iso(x1, y0, ox, oy), iso(x1, y1, ox, oy), iso(x0, y1, ox, oy)]
    rp = os.path.join(ASSETS, 'ui2', 'ground_road.png')
    if os.path.exists(rp):
        canvas.alpha_composite(road_layer((W, H), [rect(-22, 26, -2.6, 2.6), rect(9.4, 14.6, -16, 16)], rp))
    items = []        # (sort_y, draw fn)
    ground = []

    def put_sprite(k, x, y):
        img, (ax, ay) = sprite_img(lib, man, k)
        sx, sy = iso(x, y, ox, oy)
        s = man['sprites'][k]
        if s.get('kind') == 'decal':
            ground.append(lambda: paste_at(canvas, img, sx, sy, ax, ay))
        else:
            items.append((sy, lambda: paste_at(canvas, img, sx, sy, ax, ay)))
        return sx, sy, s

    def put_vehicle(k, anim, d, i, x, y, passengers=None):
        sx, sy = iso(x, y, ox, oy)
        items.append((sy, lambda: draw_vehicle(canvas, lib, man, k, anim, d, i, sx, sy, passengers)))
        return sx, sy

    def put_person(img, sx, sy):
        if img is not None:
            items.append((sy, lambda: paste_at(canvas, img, sx, sy, 64, 104)))

    # bus stop on the far side of the main road; the retro bus halts at its stopPoint (heading NW)
    bx, by = -3.0, 4.3
    sx, sy, s = put_sprite('bus_stop', bx, by)
    # the bus is ARRIVING (5.5 m before its stopPoint, heading NW) so the shelter + queue stay visible
    stx, sty = sx + s['stopPoint'][0] + 5.5 * 45.2548, sy + s['stopPoint'][1] + 5.5 * 22.6274
    bus = man['characters']['retro_bus']
    pas = fill_passengers(people, bus, 'NW', seed=3)
    items.append((sty, lambda: draw_vehicle(canvas, lib, man, 'retro_bus', 'move', 'NW', 1, stx, sty, pas)))
    for k, (wx, wy) in enumerate(s.get('waitPoints', [])):
        img = people.townsfolk(11 + k, 'idle', 'SE') if k != 1 else people.vil('npc_kid_girl', 'idle', 'SE')
        put_person(img, sx + wx, sy + wy)
    for k, (wx, wy) in enumerate(s.get('seatPoints', [])[:1]):
        put_person(people.vil('npc_grandma', 'sit', 'SW'), sx + wx, sy + wy)
    # parking lot M (near side) with cars in some stalls
    lx, ly = -12.5, -9.0
    sx, sy, s = put_sprite('parking_lot_m', lx, ly)
    cars = ['car_a_red', 'car_b_blue', None, 'car_d_cream', 'car_c_orange', None, 'car_a_yellow', 'car_b_mint']
    for (px_, py_), dd, ck in zip(s['stallPoints'], s['stallDirs'], cars):
        if ck:
            put_vehicle(ck, 'idle', dd, 0, *_inv(sx + px_, sy + py_, ox, oy))
    # depots + fuel + garage along the far side
    put_sprite('bus_depot', 8.0, 11.0)
    put_sprite('fuel_depot', 19.0, 6.5)
    put_sprite('garage_small', 2.5, -7.5)
    put_sprite('stable_depot', -9.0, 10.5)
    put_sprite('traffic_light', 8.6, -3.3)
    put_sprite('traffic_light_b', 15.4, 3.3)
    put_sprite('road_sign_round', -6.5, -3.4)
    put_sprite('road_sign_arrow', 16.0, -3.6)
    put_sprite('road_sign_tri', 7.5, 3.5)
    # traffic (right-hand traffic: heading SE in the near lane, NW in the far lane)
    put_vehicle('truck_cargo_chief', 'idle', 'SE', 1, 7.4, -1.3)
    put_vehicle('police_car', 'move', 'SE', 0, -15.0, -1.3)
    put_vehicle('horse_sleigh_bus', 'move', 'NW', 2, 20.0, 1.3)
    put_vehicle('fire_truck', 'move', 'NE', 1, 13.3, -9.0)
    put_vehicle('ambulance', 'move', 'SW', 2, 10.7, 6.5)
    put_vehicle('car_d_red', 'move', 'NW', 3, -9.5, 1.3)
    # villagers for scale on the near sidewalk
    vk = ['npc_young_man', 'npc_teen_girl', 'npc_uncle']
    for k, (x, y) in enumerate(((-6.6, -3.5), (-5.9, -3.9), (6.2, -3.6))):
        try:
            put_person(people.vil(vk[k], 'idle', 'S'), *iso(x, y, ox, oy))
        except Exception:
            pass
    for g in ground:
        g()
    for _, fn in sorted(items, key=lambda t: t[0]):
        fn()
    d_ = ImageDraw.Draw(canvas)
    d_.rectangle((0, H - 30, W, H), fill=(32, 86, 160, 255))
    d_.text((12, H - 25), 'Vehicles v5 street mock-up at 1x (PPU 64): retro bus at a bus stop with passengers (seats + '
                          'overlay), parking_lot_m with cars at stallPoints, depots, fuel depot, garage, traffic light, '
                          'signs; roads = assets/ui2/ground_road; people = villagers + townsfolk for scale',
            font=font(15), fill=(255, 255, 255))
    canvas.convert('RGB').save(out)
    print('wrote', out, canvas.size)


def _inv(sx, sy, ox, oy):
    """screen px -> world (x, y) on the ground."""
    a = (sx - ox) / 45.2548
    b = (sy - oy) / 22.6274
    return (a + b) / 2.0, (a - b) / 2.0


# --------------------------------------------------------------------------- passengers demo

def preview_passengers(lib, man, people, out):
    keys = [k for k in ('retro_bus', 'horse_sleigh_bus', 'car_b_red', 'truck_cargo_chief') if k in man['characters']]
    dirs = ['SE', 'NE', 'SW', 'NW']
    cells = []
    for k in keys:
        e = man['characters'][k]
        for d in dirs:
            W, H = e['frameSize']
            c = Image.new('RGBA', (W, H), BG)
            pas = fill_passengers(people, e, d, seed=1) if e['seats'].get('SE') else None
            ax, ay = anchor_px(e, c)
            draw_vehicle(c, lib, man, k, 'idle', d, 0, ax, ay, pas)
            cells.append(('%s %s' % (k, d), c))
    f = font(13)
    S = 1
    cw = max(c.width for _, c in cells)
    ch = max(c.height for _, c in cells) + 22
    sheet = Image.new('RGBA', (cw * 4, ch * len(keys) + 30), BG)
    dr = ImageDraw.Draw(sheet)
    for n, (lab, c) in enumerate(cells):
        x, y = (n % 4) * cw, (n // 4) * ch
        sheet.alpha_composite(c, (x + (cw - c.width) // 2, y))
        dr.text((x + 8, y + ch - 20), lab, font=f, fill=INK)
    dr.rectangle((0, sheet.height - 28, sheet.width, sheet.height), fill=(32, 86, 160, 255))
    dr.text((10, sheet.height - 24), 'Passengers: villagers drawn at seats (sit frames) / seatsStand (back views), then '
                                     'the over_* overlay; SW / NW = flipX of SE / NE with dx negated', font=font(14),
            fill=(255, 255, 255))
    del S
    sheet.convert('RGB').save(out)
    print('wrote', out, sheet.size)


# --------------------------------------------------------------------------- GIFs

def gif(frames, durs, out):
    pal = [f.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
           for f in frames]
    pal[0].save(out, save_all=True, append_images=pal[1:], duration=durs, loop=0, optimize=False, disposal=2)
    print('wrote', out, len(frames), 'frames')


def anim_grid(lib, man, keys, anim, out, cols=4, dirs=('SE',), n=8, fps=10, people=None):
    cells = [(k, d) for k in keys if k in man['characters'] for d in dirs]
    if not cells:
        return
    sizes = [man['characters'][k]['frameSize'] for k, _ in cells]
    cw = max(w for w, h in sizes)
    ch = max(h for w, h in sizes) + 20
    rows = (len(cells) + cols - 1) // cols
    f = font(12)
    frames = []
    for t in range(n):
        sheet = Image.new('RGBA', (cw * cols, ch * rows), BG)
        dr = ImageDraw.Draw(sheet)
        for idx, (k, d) in enumerate(cells):
            e = man['characters'][k]
            a = anim if anim in e['anims'] else 'move'
            nf = e['anims'][a]['frames']
            x, y = (idx % cols) * cw, (idx // cols) * ch
            W, H = e['frameSize']
            ax, ay = int(e['anchor'][0] * W), int(e['anchor'][1] * H)
            cx = x + cw // 2
            cy = y + (ch - 20 - H) + ay
            draw_vehicle(sheet, lib, man, k, a, d, t % nf, cx - (W // 2 - ax), cy)
            dr.text((x + 6, y + ch - 18), '%s %s %s' % (k, a, d), font=f, fill=INK)
        frames.append(sheet)
    gif(frames, [int(1000 / fps)] * n, out)


def make_all(out_dir=None, prev_dir=None):
    out_dir = out_dir or os.path.join(ASSETS, 'vehicles')
    prev_dir = prev_dir or os.path.join(GAME, 'docs', 'previews')
    os.makedirs(prev_dir, exist_ok=True)
    lib = Lib()
    rel = os.path.relpath(os.path.join(out_dir, 'manifest.json'), ASSETS)
    man = lib.load_manifest(rel)
    lib.load_manifest('ui2/manifest.json')
    people = People(lib)
    preview_all(lib, man, os.path.join(prev_dir, 'veh_all.png'))
    try:
        preview_scene(lib, man, people, os.path.join(prev_dir, 'veh_scene.png'))
    except KeyError as ex:
        print('note: scene preview skipped, missing %r' % (ex,))
    preview_passengers(lib, man, people, os.path.join(prev_dir, 'veh_passengers.png'))
    anim_grid(lib, man, ['horse_sleigh_bus', 'steam_wagon', 'dog_sled', 'cargo_sleigh'], 'move',
              os.path.join(prev_dir, 'veh_move_era2.gif'), cols=2, dirs=('SE', 'NE'), n=8, fps=10)
    anim_grid(lib, man, ['retro_bus', 'truck_cargo', 'car_a_red', 'car_b_blue', 'car_c_orange', 'car_d_cream',
                         'police_car', 'fire_truck', 'ambulance'], 'move', os.path.join(prev_dir, 'veh_move_era3.gif'),
              cols=3, dirs=('SE',), n=8, fps=10)
    anim_grid(lib, man, ['police_car', 'fire_truck', 'ambulance'], 'siren', os.path.join(prev_dir, 'veh_siren.gif'),
              cols=3, dirs=('SE', 'NE'), n=8, fps=8)
    for a, nm in (('idle', 'veh_chief.gif'),):
        anim_grid(lib, man, ['truck_cargo_chief'], a, os.path.join(prev_dir, nm), cols=2, dirs=('SE', 'NE'), n=8,
                  fps=6)


if __name__ == '__main__':
    args = sys.argv[1:]
    od = args[args.index('--out-dir') + 1] if '--out-dir' in args else None
    pd = args[args.index('--prev') + 1] if '--prev' in args else None
    make_all(od, pd)
