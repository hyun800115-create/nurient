"""
tf2_preview.py - human previews of townfolk v5 (assets/townfolk + assets/townfolk2) via the reference
compositor tools/townfolk2_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/tf2_preview.py            # -> docs/previews/townfolk2_*.png / .gif

  townfolk2_wedding.png    town-hall wedding: bride & groom under the arch, seated guests (sit), standing
                           guests clapping (clap), flower girl                  (uses assets/life2 if present)
  townfolk2_farewell.png   gentle farewell in the memorial garden: mourners with white flowers (sad, bowed
                           heads), family in black hats, a seated grandma (sit + face 'sad')
  townfolk2_anims.png      sheet: sad / clap / sit / push frames for children, adults, elders (slim + round)
  townfolk2_parts.png      the new wardrobe on several bases (idle S / walk SE / idle N)
  townfolk2_push.gif       parents pushing strollers in 8 directions (life2 baby_stroller at pushPoint)
  townfolk2_clap.gif       a row of guests clapping (S / SE / E / SW / W) around the happy couple
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from townfolk2_compose import Townfolk2           # noqa: E402
import tf_preview as tpv                           # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
ASSETS = os.path.join(GAME, 'assets')
SNOW = (238, 243, 249, 255)
INK = (43, 47, 58, 255)
WX, WY = 45.25, 22.63          # 1 m along world X / Y -> screen px (iso 2:1, PPU 64)
font = tpv.font


def iso(x, y, ox, oy):
    return ox + WX * (x + y), oy + WY * (x - y)


# --------------------------------------------------------------------------- optional props (read-only)

class Props:
    """Static sprites + character-style anims from other fragments (Phaser JSON-hash atlases), read-only."""

    def __init__(self, folders):
        self.frames, self.sheets, self.sprites, self.chars = {}, {}, {}, {}
        for fo in folders:
            mp = os.path.join(ASSETS, fo, 'manifest.json')
            if not os.path.exists(mp):
                continue
            m = json.load(open(mp, encoding='utf-8'))
            for at in m.get('atlases', []):
                try:
                    js = json.load(open(os.path.join(ASSETS, at['json'])))
                except (OSError, ValueError):
                    continue
                if 'frames' not in js or js.get('tfatlas'):
                    continue
                fr = js['frames']
                if isinstance(fr, list):
                    fr = {f['filename']: f for f in fr}
                for n, f in fr.items():
                    self.frames[(at['key'], n)] = f
                self.sheets[at['key']] = os.path.join(ASSETS, at['png'])
            for k, s in m.get('sprites', {}).items():
                self.sprites.setdefault(k, s)
            for k, c in m.get('characters', {}).items():
                self.chars.setdefault(k, c)
        self._img = {}

    def _sheet(self, key):
        if key not in self._img:
            self._img[key] = Image.open(self.sheets[key]).convert('RGBA')
        return self._img[key]

    def frame(self, atlas, name):
        f = self.frames.get((atlas, name))
        if f is None:
            return None
        r, s, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
        crop = self._sheet(atlas).crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        out = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        out.paste(crop, (s['x'], s['y']))
        return out

    def sprite(self, key):
        s = self.sprites.get(key)
        if not s or 'atlas' not in s:
            return None, None, s
        im = self.frame(s['atlas'], s['frame'])
        if im is None:
            return None, None, s
        return im, (s['anchor'][0] * im.size[0], s['anchor'][1] * im.size[1]), s

    def draw(self, canvas, key, x, y):
        im, anc, s = self.sprite(key)
        if im is None:
            return None
        canvas.alpha_composite(im, (int(round(x - anc[0])), int(round(y - anc[1]))))
        return s

    def char_frame(self, key, anim, d, i):
        c = self.chars.get(key)
        if not c:
            return None, None, None
        mirror = c.get('mirror', {'SW': 'SE', 'W': 'E', 'NW': 'NE'})
        rd = mirror.get(d, d)
        name = c.get('frameName', '{anim}_{dir}_{i}').format(anim=anim, dir=rd, i=i)
        im = self.frame(c['atlas'], name)
        if im is None:
            return None, None, c
        if d in mirror:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        ax, ay = c.get('anchor', [0.5, 0.8125])
        ax = 1 - ax if d in mirror else ax
        return im, (ax * im.size[0], ay * im.size[1]), c


# --------------------------------------------------------------------------- drawing helpers

def shadow(img, x, y, w, h, a=64):
    sh = Image.new('RGBA', (w * 2 + 4, h * 2 + 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(80, 100, 130, a))
    img.alpha_composite(sh, (int(x - w - 2), int(y - h - 2)))


def person_at(canvas, tf, p, anim, d, i, x, y, face=None, seat_shadow=False, no_shadow=False):
    fr = tf.compose(p, anim, d, i, face=face)
    sw, sh = tf.T['bases'][p['base']]['shadow']
    if not no_shadow:
        gy = y + (tf.T['sit']['groundOffsetPx'] if (anim == 'sit' and seat_shadow) else 0)
        shadow(canvas, x, gy, int(sw * 0.55), int(sh * 0.6))
    canvas.alpha_composite(fr, (int(round(x - 64)), int(round(y - 104))))


def diamond(d, cx, cy, hw, hh, fill, outline=None):
    d.polygon([(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)], fill=fill, outline=outline)


def iso_quad(d, pts, ox, oy, fill, outline=None, width=1):
    d.polygon([iso(x, y, ox, oy) for x, y in pts], fill=fill, outline=outline)


def chair(canvas, x, y, col=(250, 246, 238, 255), bow=(242, 184, 200, 255)):
    """Fallback little white wedding chair (seat front-centre at (x, y), seat 0.45 m = 25 px up)."""
    d = ImageDraw.Draw(canvas)
    sy = y
    d.rectangle([x - 11, sy - 4, x + 11, sy + 1], fill=col, outline=(170, 160, 150, 255))
    for lx in (x - 9, x + 8):
        d.line([(lx, sy + 1), (lx, sy + 25)], fill=(200, 190, 180, 255), width=2)
    d.rectangle([x - 11, sy - 30, x + 11, sy - 4], outline=(170, 160, 150, 255), fill=col)
    d.ellipse([x - 5, sy - 34, x + 5, sy - 27], fill=bow)


def caption(img, text, sub=None):
    W, H = img.size
    d = ImageDraw.Draw(img)
    hh = 52 if sub else 34
    d.rectangle([0, H - hh, W, H], fill=(33, 94, 168, 255))
    d.text((12, H - hh + 6), text, fill=(255, 255, 255, 255), font=font(15))
    if sub:
        d.text((12, H - 24), sub, fill=(220, 232, 248, 255), font=font(13))


# --------------------------------------------------------------------------- scenes

def wedding(tf, props, path, seed=520):
    rng = random.Random(seed)
    W, H = 1600, 1000
    img = Image.new('RGBA', (W, H), SNOW)
    d = ImageDraw.Draw(img)
    ox, oy = 800, 360
    # town-hall plaza floor + aisle carpet (along world -X: from the arch toward the camera-left)
    iso_quad(d, [(-7, -6), (5, -6), (5, 6), (-7, 6)], ox, oy, (217, 160, 138, 255))
    iso_quad(d, [(-6.6, -5.6), (4.6, -5.6), (4.6, 5.6), (-6.6, 5.6)], ox, oy, (226, 174, 152, 255))
    used_carpet = props.draw(img, 'wedding_carpet', *iso(-0.5, 0, ox, oy)) if props.sprites.get('wedding_carpet') else None
    if not used_carpet:
        iso_quad(d, [(-6.2, -0.75), (2.6, -0.75), (2.6, 0.75), (-6.2, 0.75)], ox, oy, (196, 70, 82, 255))
        iso_quad(d, [(-6.2, -0.62), (2.6, -0.62), (2.6, 0.62), (-6.2, 0.62)], ox, oy, (214, 92, 104, 255))
    items = []           # (depth y, kind, payload)
    # arch at the far end of the aisle (+X / screen right-down? no: far = screen up -> world +Y-ish)
    ax_, ay_ = 3.2, 0.0
    arch_xy = iso(ax_, ay_, ox, oy)
    if props.sprites.get('wedding_arch'):
        items.append((arch_xy[1] + 1, 'prop', ('wedding_arch', arch_xy)))
    # couple under the arch, facing the guests (SW = down-left, toward the aisle)
    bride = tf.preset('bride', rng=rng)
    groom = tf.preset('groom', rng=rng)
    bx, by = iso(2.4, 0.55, ox, oy)
    gx, gy = iso(2.4, -0.55, ox, oy)
    items.append((by, 'person', (bride, 'idle', 'SW', 1, bx, by, None)))
    items.append((gy, 'person', (groom, 'happy', 'W', 2, gx, gy, None)))
    # seated guests: rows of chairs both sides of the aisle, sitters face the couple (E = screen right)
    seat_pts = []
    chairs = props.sprites.get('wedding_chairs')
    for row in range(4):
        for side in (-1, 1):
            for k in range(3):
                x = -1.2 - row * 1.25
                y = side * (1.25 + k * 0.85)
                seat_pts.append((x, y))
    pres = ['wedding_guest'] * 6 + [None] * 3
    for n, (x, y) in enumerate(seat_pts):
        sx, sy = iso(x, y, ox, oy)
        p = tf.preset(pres[n % len(pres)], rng=rng) if pres[n % len(pres)] else tf.random_person(rng=rng)
        dd = 'E' if y < 0 else 'SE'
        items.append((sy, 'chair', (sx, sy)))
        items.append((sy + 0.5, 'person', (p, 'sit', dd, rng.randrange(4), sx, sy, None, 'seat')))
    # standing guests clapping along the sides + flower girl walking the aisle
    for n, (x, y, dd) in enumerate([(-6.0, -4.2, 'E'), (-5.0, -4.6, 'E'), (-3.6, -4.8, 'E'), (-2.2, -4.6, 'SE'),
                                    (-6.0, 4.2, 'SE'), (-4.8, 4.6, 'SE'), (-3.4, 4.7, 'S'), (-2.0, 4.6, 'S'),
                                    (1.0, 4.0, 'SW'), (1.0, -3.8, 'W'), (0.2, 4.4, 'SW')]):
        sx, sy = iso(x, y, ox, oy)
        p = tf.preset('wedding_guest', rng=rng) if n % 3 else tf.random_person(rng=rng)
        items.append((sy, 'person', (p, 'clap', dd, (n * 2) % 6, sx, sy, None)))
    fg = tf.preset('flower_girl', rng=rng)
    fx_, fy_ = iso(-0.2, 0.15, ox, oy)
    items.append((fy_, 'person', (fg, 'walk', 'E', 3, fx_, fy_, None)))
    items.sort(key=lambda t: t[0])
    for _, kind, pl in items:
        if kind == 'prop':
            props.draw(img, pl[0], *pl[1])
        elif kind == 'chair':
            chair(img, pl[0], pl[1])
        else:
            p, anim, dd, i, x, y, face = pl[:7]
            person_at(img, tf, p, anim, dd, i, x, y, face=face, seat_shadow=(len(pl) > 7))
    if not props.sprites.get('wedding_arch'):
        # fallback arch: two flower posts + a garland
        ax0, ay0 = iso(3.2, 1.3, ox, oy)
        ax1, ay1 = iso(3.2, -1.3, ox, oy)
        d = ImageDraw.Draw(img)
        for (px, py) in ((ax0, ay0), (ax1, ay1)):
            d.rectangle([px - 4, py - 120, px + 4, py], fill=(250, 246, 238, 255), outline=(190, 180, 170, 255))
        d.arc([min(ax0, ax1) - 4, min(ay0, ay1) - 175, max(ax0, ax1) + 4, max(ay0, ay1) - 60], 180, 360,
              fill=(245, 154, 184, 255), width=7)
    caption(img, 'townfolk2: a town-hall wedding - bride (wedding_dress + veil + flower_crown + held_bouquet), groom '
                 '(groom_suit), seated guests (sit), clapping guests (clap), flower girl',
            'composed from paper-doll layers by tools/townfolk2_compose.py (assets/townfolk + assets/townfolk2); '
            'props: assets/life2 when present')
    img.convert('RGB').save(path, optimize=True)
    crop = img.crop((380, 150, 1180, 650)).resize((1600, 1000), Image.NEAREST)
    crop.convert('RGB').save(path.replace('.png', '_2x.png'), optimize=True)


def farewell(tf, props, path, seed=77):
    rng = random.Random(seed)
    W, H = 1600, 1000
    img = Image.new('RGBA', (W, H), SNOW)
    d = ImageDraw.Draw(img)
    ox, oy = 800, 470
    items = []
    stone_xy = iso(0.0, 0.0, ox, oy)
    if props.sprites.get('memorial_garden'):
        props.draw(img, 'memorial_garden', *iso(0.4, 0.0, ox, oy))
    else:
        iso_quad(d, [(-4, -5), (4, -5), (4, 5), (-4, 5)], ox, oy, (226, 236, 228, 255))
        iso_quad(d, [(-0.6, -4), (0.6, -4), (0.6, 4), (-0.6, 4)], ox, oy, (206, 200, 190, 255))
    if props.sprites.get('memorial_stone'):
        items.append((stone_xy[1], 'prop', ('memorial_stone', stone_xy)))
    else:
        items.append((stone_xy[1], 'stone', stone_xy))
    if props.sprites.get('flower_wreath'):
        items.append((stone_xy[1] + 6, 'prop', ('flower_wreath', (stone_xy[0] + 40, stone_xy[1] + 8))))
    # mourners behind the stone (farther from the camera) facing S toward it - faces readable
    rows = [(1.6, -2.4, 'S'), (1.6, -1.2, 'S'), (1.7, 0.0, 'S'), (1.6, 1.2, 'S'), (1.6, 2.4, 'SW'),
            (2.8, -1.8, 'SE'), (2.8, -0.6, 'S'), (2.9, 0.6, 'S'), (2.8, 1.8, 'SW'),
            (0.9, -3.2, 'SE'), (0.9, 3.2, 'SW')]
    fam = {(1.7, 0.0), (1.6, -1.2), (1.6, 1.2)}
    for n, (x, y, dd) in enumerate(rows):
        sx, sy = iso(-x, y, ox, oy)
        pr = 'mourner_family' if (x, y) in fam else 'mourner'
        p = tf.preset(pr, rng=rng)
        anim = 'sad'
        items.append((sy, 'person', (p, anim, dd, (n + rng.randrange(4)) % 4, sx, sy, None)))
    # a child placing flowers + grandma resting on a bench with a sad face
    kid = tf.preset('mourner', rng=random.Random(5))
    for _ in range(40):
        if kid['base'].startswith('child'):
            break
        kid = tf.preset('mourner', rng=rng)
    kx, ky = iso(-0.75, -0.5, ox, oy)
    items.append((ky, 'person', (kid, 'sad', 'SE', 2, kx, ky, None)))
    gm = tf.preset('mourner_family', rng=rng)
    for _ in range(40):
        if gm['base'].startswith('elder'):
            break
        gm = tf.preset('mourner_family', rng=rng)
    bx, by = iso(-1.0, 4.4, ox, oy)
    if props.sprites.get('bench_seats') or props.sprites.get('bench'):
        pass
    items.append((by - 2, 'bench', (bx, by)))
    items.append((by, 'person', (gm, 'sit', 'SW', 1, bx, by, 'sad', 'seat')))
    items.sort(key=lambda t: t[0])
    for _, kind, pl in items:
        if kind == 'prop':
            props.draw(img, pl[0], *pl[1])
        elif kind == 'stone':
            x, y = pl
            dd = ImageDraw.Draw(img)
            dd.rounded_rectangle([x - 18, y - 40, x + 18, y + 2], radius=9, fill=(170, 178, 190, 255),
                                 outline=(120, 128, 140, 255))
            for k in range(7):
                a = k * 0.9
                fx_, fy_ = x - 22 + k * 7, y + 4 + 3 * math.sin(a)
                dd.ellipse([fx_ - 4, fy_ - 4, fx_ + 4, fy_ + 4], fill=(250, 246, 238, 255), outline=(200, 196, 180, 255))
        elif kind == 'bench':
            x, y = pl
            dd = ImageDraw.Draw(img)
            dd.polygon([(x - 34, y - 8), (x + 10, y - 30), (x + 34, y - 20), (x - 10, y + 2)], fill=(201, 143, 85, 255),
                       outline=(138, 90, 51, 255))
            for lx, ly in ((x - 26, y - 4), (x + 26, y - 18)):
                dd.line([(lx, ly), (lx, ly + 22)], fill=(138, 90, 51, 255), width=3)
        else:
            p, anim, dd, i, x, y, face = pl[:7]
            person_at(img, tf, p, anim, dd, i, x, y, face=face, seat_shadow=(len(pl) > 7))
    # soft falling snow / petals for a gentle mood
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dl = ImageDraw.Draw(lay)
    r2 = random.Random(3)
    for _ in range(160):
        x, y = r2.uniform(0, W), r2.uniform(0, H - 60)
        s = r2.uniform(1.0, 2.6)
        dl.ellipse([x - s, y - s, x + s, y + s], fill=(255, 255, 255, 170))
    img.alpha_composite(lay)
    caption(img, 'townfolk2: a gentle farewell in the memorial garden - mourners (mourning_coat, black_hat) with white '
                 'bouquets, heads bowed (sad, head pose "down"), grandma resting on a bench (sit + face "sad")',
            'composed by tools/townfolk2_compose.py; garden props from assets/life2 when present')
    img.convert('RGB').save(path, optimize=True)
    crop = img.crop((420, 200, 1180, 675)).resize((1520, 950), Image.NEAREST)
    crop.convert('RGB').save(path.replace('.png', '_2x.png'), optimize=True)


def anim_sheet(tf, path, seed=11):
    rng = random.Random(seed)
    people = []
    for base in ('child_slim', 'child_round', 'adult_slim', 'adult_round', 'elder_slim', 'elder_round'):
        for _ in range(60):
            p = tf.random_person(rng=rng)
            if p['base'] == base:
                break
        people.append(p)
    frames = [('sad', 'S', 0), ('sad', 'SE', 2), ('sad', 'E', 1), ('clap', 'S', 2), ('clap', 'SE', 0),
              ('clap', 'E', 3), ('sit', 'S', 0), ('sit', 'SE', 1), ('sit', 'E', 2), ('push', 'S', 1),
              ('push', 'SE', 3), ('push', 'E', 5), ('push', 'NE', 0), ('push', 'N', 2)]
    sc = 2
    cw, ch = 80 * sc, 116 * sc
    W, H = 150 + len(frames) * cw, 46 + len(people) * (ch + 6)
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'townfolk2 new anims for every base: sad (head down) / clap / sit (anchor = seat front, '
                     'line = seat) / push (dot = pushPoint grip)', fill=INK, font=font(18))
    for c, (a, dd, i) in enumerate(frames):
        d.text((150 + c * cw + 4, 30), f'{a} {dd} {i}', fill=tpv.SUB, font=font(12))
    for r, p in enumerate(people):
        y0 = 46 + r * (ch + 6)
        d.text((8, y0 + ch // 2 - 10), p['base'].replace('_', ' '), fill=INK, font=font(14))
        for c, (a, dd, i) in enumerate(frames):
            fr = tf.compose(p, a, dd, i).crop((24, 4, 104, 120)).resize((cw, ch), Image.NEAREST)
            x0 = 150 + c * cw
            img.alpha_composite(fr, (x0, y0))
            if a == 'sit':
                d.line([(x0, y0 + 100 * sc), (x0 + cw, y0 + 100 * sc)], fill=(150, 120, 100, 255))
            if a == 'push':
                pp = tf.push_point(p, dd)
                px, py = x0 + (64 + pp[0] - 24) * sc, y0 + (104 + pp[1] - 4) * sc
                d.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(214, 60, 60, 255), width=2)
    img.convert('RGB').save(path, optimize=True)


def parts_sheet(tf, path, seed=3):
    rng = random.Random(seed)
    rows = []
    for pr, n in (('bride', 3), ('groom', 3), ('flower_girl', 2), ('wedding_guest', 4), ('mourner', 4),
                  ('mourner_family', 2)):
        for _ in range(n):
            p = tf.preset(pr, rng=rng)
            rows.append((tf.T['generator']['presets'][pr]['label']['en'], p['base'].replace('_', ' '), p))
    tpv.sheet(tf, rows, path, 'townfolk2 wardrobe: wedding_dress, veil, groom_suit, flower_crown, mourning_coat, '
                              'black_hat, held_bouquet (life-event presets)',
              frames=(('idle', 'S', 0), ('walk', 'SE', 2), ('happy', 'S', 2), ('idle', 'N', 1)))


def clap_gif(tf, path, seed=8):
    rng = random.Random(seed)
    W, H = 760, 300
    bride, groom = tf.preset('bride', rng=rng), tf.preset('groom', rng=rng)
    guests = [(tf.preset('wedding_guest', rng=rng) if k % 2 else tf.random_person(rng=rng)) for k in range(6)]
    dirs = ['E', 'SE', 'S', 'S', 'SW', 'W']
    frames = []
    for t in range(12):
        img = Image.new('RGBA', (W, H), SNOW)
        d = ImageDraw.Draw(img)
        diamond(d, W // 2, 190, 340, 80, (226, 174, 152, 255))
        spots = [(90, 205), (175, 225), (260, 240), (500, 240), (585, 225), (670, 205)]
        for k, (x, y) in enumerate(spots):
            person_at(img, tf, guests[k], 'clap', dirs[k], (t + k) % 6, x, y)
        person_at(img, tf, groom, 'happy', 'S', t % 6, 345, 180)
        person_at(img, tf, bride, 'wave', 'S', t % 6, 415, 180)
        caption(img, 'townfolk2 clap (6 f, 10 fps) around the happy couple')
        frames.append(img.convert('RGB'))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, optimize=True)


def stroller_frame(props, d, i, key='baby_stroller'):
    """(image, anchor px, handlePoint px for dir d (mirrored dirs negate x), entry) of the life2 stroller."""
    im, anc, c = props.char_frame(key, 'move', d, i % 8)
    if im is None:
        return None, None, None, None
    mirror = c.get('mirror', {'SW': 'SE', 'W': 'E', 'NW': 'NE'})
    hp = (c.get('handlePoint') or {}).get(mirror.get(d, d))
    if hp is not None and d in mirror:
        hp = [-hp[0], hp[1]] + list(hp[2:])
    return im, anc, hp, c


def push_gif(tf, props, path, seed=12):
    rng = random.Random(seed)
    W, H = 900, 520
    ppl = []
    for want in ('adult', 'adult', 'elder', 'adult', 'adult', 'elder', 'adult', 'child'):
        for _ in range(80):
            p = tf.random_person(rng=rng)
            if tf.T['bases'][p['base']]['age'] == want:
                break
        ppl.append(p)
    dirs = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
    spd = 1.6                        # m/s, 8 frames @ 10 fps
    frames = []
    for t in range(16):
        img = Image.new('RGBA', (W, H), SNOW)
        d = ImageDraw.Draw(img)
        diamond(d, W // 2, 270, 420, 210, (226, 174, 152, 255))
        draws = []
        for k, (p, dd) in enumerate(zip(ppl, dirs)):
            col, row = k % 4, k // 4
            cx, cy = 140 + col * 205, 210 + row * 210
            pp = tf.push_point(p, dd)
            im, anc, hp, c = stroller_frame(props, dd, t, 'baby_stroller' if k % 2 == 0 else 'baby_stroller_pink')
            if im is None:
                im, anc, hp, c = stroller_frame(props, dd, t)
            draws.append((p, dd, cx, cy, pp, im, anc, hp))
        for p, dd, cx, cy, pp, im, anc, hp in draws:
            behind = pp[2]
            gx, gy = cx + pp[0], cy + pp[1]

            def stroller():
                if im is None:
                    dd_ = ImageDraw.Draw(img)
                    dd_.ellipse([gx - 3, gy - 3, gx + 3, gy + 3], fill=(214, 60, 60, 255))
                    return
                hx, hy = (hp[0], hp[1]) if hp else (0, -48)
                img.alpha_composite(im, (int(round(gx - hx - anc[0])), int(round(gy - hy - anc[1]))))
            if behind:
                stroller()
            person_at(img, tf, p, 'push', dd, t % 8, cx, cy)
            if not behind:
                stroller()
            ImageDraw.Draw(img).text((cx - 30, cy + 14), f'push {dd}', fill=INK, font=font(12))
        caption(img, 'townfolk2 push (8 f, 10 fps): the handle grip = bases[b].pushPoint; stroller drawn behind in '
                     'NE/N/NW, in front otherwise' + ('' if props.chars.get('baby_stroller') else ' (red dot: grip; '
                                                     'life2 stroller not packed yet)'))
        frames.append(img.convert('RGB'))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=100, loop=0, optimize=True)


def main():
    tf = Townfolk2.from_assets()
    props = Props(['life2', 'life_props', 'props', 'town'])
    os.makedirs(PREV, exist_ok=True)
    only = sys.argv[1:] or ['wedding', 'farewell', 'anims', 'parts', 'clap', 'push']
    if 'wedding' in only:
        wedding(tf, props, os.path.join(PREV, 'townfolk2_wedding.png'))
        print('wedding done', flush=True)
    if 'farewell' in only:
        farewell(tf, props, os.path.join(PREV, 'townfolk2_farewell.png'))
        print('farewell done', flush=True)
    if 'anims' in only:
        anim_sheet(tf, os.path.join(PREV, 'townfolk2_anims.png'))
        print('anims done', flush=True)
    if 'parts' in only:
        parts_sheet(tf, os.path.join(PREV, 'townfolk2_parts.png'))
        print('parts done', flush=True)
    if 'clap' in only:
        clap_gif(tf, os.path.join(PREV, 'townfolk2_clap.gif'))
        print('clap gif done', flush=True)
    if 'push' in only:
        push_gif(tf, props, os.path.join(PREV, 'townfolk2_push.gif'))
        print('push gif done', flush=True)


if __name__ == '__main__':
    main()
