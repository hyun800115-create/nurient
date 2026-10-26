"""
bld_meatcan_preview.py - designer previews of the v4.2.1 meat can (item_can_meat) beside the fish can and the other
items it must not be mistaken for.  Reads the SHIPPED atlases (assets/*/manifest.json), so it shows exactly what the
game draws.  python3 with Pillow + numpy; no Blender.

    python3 tools/blender/bld_meatcan_preview.py [--out docs/previews/meatcan]

  meatcan_compare.png  fish can | meat can at 100 % and x4 (pixels), then both on the snow at the phone zoom levels
                       (camera 0.6 / 1.0 / 1.2 / 1.7 x render scale 1.5 of a ~400 px wide phone), day and night
  meatcan_icons.png    icon sizes 28 / 48 / 72 px (UI rule: the longest side = the size) with the fish can, raw meat,
                       smoked meat, ingot and coin: on snow, on the cream panel, in the customer's want bubble, at night
  meatcan_stack.png    stacks 1..6 of each, the cannery output's twin towers with both cans, a porter carrying 4
  meatcan_scene.png    in-game-like: the cannery with its output pad (both cans), a porter carrying meat cans, the
                       잡화점 with a customer whose want bubble shows the meat can; day | night
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(GAME, 'docs', 'previews', 'meatcan')
SNOW = (236, 241, 247, 255)
CREAM = (255, 248, 236, 255)
NIGHT = ((0x5a, 0x6a, 0xa8), 0.45)          # DayClock night tint (MULTIPLY) at balance.dayNight.darkness 0.45
RENDER_K = 1.5                              # device px per logical px on a ~400 CSS px phone (main.js View.k)
REFS = [('buildings', 'item_can', 'fish can'), ('buildings', 'item_can_meat', 'MEAT CAN'),
        ('props', 'item_meat_raw', 'raw meat'), ('props', 'item_meat_cooked', 'smoked meat'),
        ('props', 'item_ingot', 'ingot'), ('props', 'item_coin', 'coin')]

_man, _sheets = {}, {}


def font(size, ko=False):
    for p in ([os.path.join(GAME, 'tools', 'fonts', 'Jua-Regular.ttf')] if ko else []) + [
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def man(frag):
    if frag not in _man:
        _man[frag] = json.load(open(os.path.join(ASSETS, frag, 'manifest.json'), encoding='utf-8'))
    return _man[frag]


def _sheet(frag, akey):
    k = (frag, akey)
    if k not in _sheets:
        a = next(x for x in man(frag)['atlases'] if x['key'] == akey)
        _sheets[k] = (Image.open(os.path.join(ASSETS, a['png'])).convert('RGBA'),
                      json.load(open(os.path.join(ASSETS, a['json'])))['frames'])
    return _sheets[k]


def frame(frag, atlas, name):
    sh, fr = _sheet(frag, atlas)
    f = fr[name]
    r = f['frame']
    im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
    im.paste(sh.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (f['spriteSourceSize']['x'],
                                                                             f['spriteSourceSize']['y']))
    return im


def sprite(frag, key):
    """(untrimmed image, anchor px, manifest entry)"""
    s = man(frag)['sprites'][key]
    im = frame(frag, s['atlas'], s['frame'])
    return im, (s['anchor'][0] * im.width, s['anchor'][1] * im.height), s


def trim(im):
    x0, y0, x1, y1 = im.getchannel('A').getbbox()
    return im.crop((max(0, x0 - 1), max(0, y0 - 1), min(im.width, x1 + 1), min(im.height, y1 + 1)))


def icon(im, size):
    t = trim(im)
    s = size / float(max(t.width, t.height))
    return t.resize((max(1, round(t.width * s)), max(1, round(t.height * s))), Image.LANCZOS)


def scaled(im, k):
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))),
                     Image.BILINEAR if k > 1 else Image.LANCZOS)


def ground(w, h):
    g = Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGBA')
    out = Image.new('RGBA', (w, h))
    for y in range(0, h, g.height):
        for x in range(0, w, g.width):
            out.paste(g, (x, y))
    return out


def night(im):
    (r, g, b), a = NIGHT
    arr = np.asarray(im.convert('RGBA')).astype(np.float32)
    mul = np.array([1 - a + a * r / 255.0, 1 - a + a * g / 255.0, 1 - a + a * b / 255.0], np.float32)
    arr[..., :3] *= mul
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')


def label(d, xy, text, size=13, fill=(30, 34, 44), ko=False, center=False, box=True):
    f = font(size, ko)
    x, y = xy
    tw = f.getlength(text)
    if center:
        x -= tw / 2
    if box:
        d.rounded_rectangle([x - 4, y - 2, x + tw + 4, y + size + 4], radius=6, fill=(255, 255, 255, 220))
    d.text((x, y), text, fill=fill, font=f)


def put(canvas, im, anchor, x, y, k=1.0):
    if k != 1.0:
        im = scaled(im, k)
        anchor = (anchor[0] * k, anchor[1] * k)
    canvas.alpha_composite(im, (int(round(x - anchor[0])), int(round(y - anchor[1]))))


def can(key):
    im, an, s = sprite('buildings' if key in ('item_can', 'item_can_meat') else 'props', key)
    return im, an, s


def want_bubble(canvas, item, x, y, k):
    """Seller.Customer.showBubble at container scale k: ui_bubble (origin 0.5, 1) fitted to 96 x 84, the item (origin
    0.5, 0.6) at (-14, -0.56 x bubble height) with its longest side 46 x 1.25."""
    bubble = sprite('ui', 'ui_bubble')[0]
    bb = scaled(bubble, min(96.0 / bubble.width, 84.0 / bubble.height) * k)
    canvas.alpha_composite(bb, (int(round(x - bb.width / 2)), int(round(y - bb.height))))
    ic = trim(item)
    ic = scaled(ic, 46.0 * 1.25 * k / max(ic.width, ic.height))
    canvas.alpha_composite(ic, (int(round(x - 14 * k - ic.width * 0.5)),
                                int(round(y - bb.height * 0.56 - ic.height * 0.6))))


# --------------------------------------------------------------------------- 1. compare

def compare(out):
    fish, an, sf = can('item_can')
    meat, _, sm = can('item_can_meat')
    W, H = 1500, 900
    img = Image.new('RGBA', (W, H), (150, 168, 190, 255))
    d = ImageDraw.Draw(img)
    label(d, (16, 12), 'item_can (fish can, 통조림)  vs  item_can_meat (meat can, 고기 통조림) - shipped atlas frames',
          18, ko=True)
    # 100 % and x4 on snow
    g = ground(340, 170)
    put(g, fish, an, 110, 110)
    put(g, meat, an, 230, 110)
    img.alpha_composite(g, (16, 50))
    label(d, (22, 54), '100 % (1 px = 1 px)', 12)
    pair = Image.new('RGBA', (144, 72), (0, 0, 0, 0))
    pair.alpha_composite(fish, (0, 0))
    pair.alpha_composite(meat, (72, 0))
    big = ground(576, 288)
    big.alpha_composite(pair.resize((576, 288), Image.NEAREST))
    img.alpha_composite(big, (370, 50))
    label(d, (376, 54), 'x4 (pixels)', 12)
    label(d, (970, 60), 'stackStep  fish 14 / meat %d' % sm['stackStep'], 13, box=False)
    label(d, (970, 80), 'topPx      fish %d / meat %d' % (sf['topPx'], sm['topPx']), 13, box=False)
    label(d, (970, 100), 'trimmed    fish 33x33 / meat %dx%d' % trim(meat).size, 13, box=False)
    label(d, (970, 120), 'carryScale %s / %s' % (sf['carryScale'], sm['carryScale']), 13, box=False)
    label(d, (970, 150), 'Same pipeline as item_can: bld_assets + bld_render', 12, box=False)
    label(d, (970, 168), '(camera, lights, PPU 64, 72x72 frame, anchor 36,54,', 12, box=False)
    label(d, (970, 186), '64 samples, clean_alpha(3), no outline).', 12, box=False)
    # phone zooms: camera zoom x render scale 1.5, day row + night row
    y = 370
    label(d, (16, y - 26), 'on the phone: camera zoom x render scale %.1f (device pixels), day / night' % RENDER_K, 15)
    x = 16
    for z in (0.6, 1.0, 1.2, 1.7):
        k = z * RENDER_K
        cw, ch = int(170 * k) + 20, int(84 * k) + 20
        for row, fn in enumerate((lambda im: im, night)):
            g = ground(cw, ch)
            put(g, fish, an, cw / 2 - 30 * k, ch - 22 * k / 1.2 - 6, k)
            put(g, meat, an, cw / 2 + 32 * k, ch - 22 * k / 1.2 - 6, k)
            g = fn(g)
            img.alpha_composite(g, (x, y + row * (ch + 8)))
        label(d, (x + 4, y + 4), 'zoom %.1f' % z, 12)
        x += cw + 12
    img.convert('RGB').save(os.path.join(out, 'meatcan_compare.png'), optimize=True)


# --------------------------------------------------------------------------- 2. icons

def icons(out):
    refs = [(can(k)[0], name) for _, k, name in REFS]
    bubble = sprite('ui', 'ui_bubble')[0] if 'ui_bubble' in man('ui')['sprites'] else None
    cell = {28: 46, 48: 70, 72: 96}
    W = 16 + 4 * (6 * 96 + 24)
    H = 120 + sum(cell[s] + 34 for s in (28, 48, 72)) + 190
    img = Image.new('RGBA', (W + 70, H), (150, 168, 190, 255))
    d = ImageDraw.Draw(img)
    label(d, (16, 12), 'icons (UI rule: the longest side = the size, as UIv4 icon() / order chips / pads) - '
                       'fish can, MEAT CAN, raw meat, smoked meat, ingot, coin', 16)
    bgs = [('snow', SNOW, False), ('cream panel', CREAM, False), ('night', SNOW, True), ('dark UI', (40, 52, 80, 255),
                                                                                         False)]
    y = 50
    for j, (nm, _, _) in enumerate(bgs):
        label(d, (16 + j * (6 * 96 + 24) + 4, y), nm, 13)
    y += 26
    for size in (28, 48, 72):
        cw = cell[size]
        for j, (nm, col, nt) in enumerate(bgs):
            strip = Image.new('RGBA', (6 * cw + 10, cw + 10), col)
            for i, (im, name) in enumerate(refs):
                ic = icon(im, size)
                strip.alpha_composite(ic, (5 + i * cw + (cw - ic.width) // 2, 5 + (cw - ic.height) // 2))
            if nt:
                strip = night(strip)
            img.alpha_composite(strip, (16 + j * (6 * 96 + 24), y))
        label(d, (16 + 3 * (6 * 96 + 24) + 6 * cw + 22, y + 4), '%d px' % size, 13, box=False)
        y += cw + 34
    # the customer's want bubble (Seller.Customer.showBubble): ui_bubble fitted to 96 x 84, the wanted item's longest
    # side 46 x 1.25, both inside a container shown at 0.9 for the customer at the counter
    label(d, (16, y), "the customer's want bubble at 100 % and at the phone's x1.8 (zoom 1.2 x render scale 1.5)", 13)
    y += 24
    x = 16
    for k in (1.0, 1.8):
        for key in ('item_can', 'item_can_meat'):
            g = ground(int(130 * k), int(110 * k))
            if bubble is not None:
                want_bubble(g, can(key)[0], g.width / 2, g.height - 4, 0.9 * k)
            img.alpha_composite(g, (x, y))
            x += g.width + 10
        x += 20
    img.convert('RGB').save(os.path.join(out, 'meatcan_icons.png'), optimize=True)


# --------------------------------------------------------------------------- 3. stacks

def stacks(out):
    fish, an, sf = can('item_can')
    meat, _, sm = can('item_can_meat')
    W, H = 1300, 560
    img = ground(W, H)
    d = ImageDraw.Draw(img)
    label(d, (16, 12), 'stacks (stackStep: fish %d px, meat %d px) - 1..6 high, the cannery output twin towers with '
                       'both cans, a porter carrying 4 meat cans (carry scale 0.62)' % (sf['stackStep'],
                                                                                        sm['stackStep']), 15)
    for row, (im, s, nm) in enumerate(((fish, sf, 'fish'), (meat, sm, 'meat'))):
        for n in range(1, 7):
            x, y = 80 + (n - 1) * 80, 200 + row * 150
            for i in range(n):
                put(img, im, an, x, y - i * s['stackStep'])
            label(d, (x, y + 18), '%s x%d' % (nm, n), 11, center=True)
    # cannery output pad, twin towers [[-15,-4],[15,5]] (Station outStack, alternate), mixed fish / meat
    pad, pan, _ = sprite('ui', 'ui_pad_output')
    px_, py_ = 760, 330
    put(img, pad, pan, px_, py_)
    seq = ['item_can', 'item_can_meat', 'item_can_meat', 'item_can', 'item_can_meat', 'item_can', 'item_can',
           'item_can_meat', 'item_can_meat', 'item_can_meat']
    hs = [0.0, 0.0]
    cols = [(-15, -4), (15, 5)]
    placed = []
    for i, k in enumerate(seq):
        c = i % 2
        im, a, s = can(k)
        placed.append((cols[c][1], hs[c], im, a, px_ + cols[c][0], py_ + cols[c][1] - hs[c]))
        hs[c] += s['stackStep']
    for _, _, im, a, x, y in sorted(placed, key=lambda t: (t[0], t[1])):
        put(img, im, a, x, y)
    label(d, (px_, py_ + 52), 'cannery output: both cans in the twin towers', 11, center=True)
    # a porter carrying 4 meat cans (carry_walk S + SE), carryPoint, scale 0.62
    cm = man('characters')['characters']['villager_a']
    for j, dr in enumerate(('S', 'SE')):
        fr = frame('characters', cm['atlas'], 'carry_walk_%s_1' % dr)
        cx, cy = 1000 + j * 130, 380
        ax, ay = cm['anchor'][0] * fr.width, cm['anchor'][1] * fr.height
        cp = cm['carryPoint'][dr]
        put(img, fr, (ax, ay), cx, cy)
        for i in range(4):
            put(img, meat, an, cx + cp[0], cy + cp[1] - i * sm['stackStep'] * 0.62, 0.62)
    label(d, (1065, 400), 'porter carrying meat cans', 11, center=True)
    img.convert('RGB').save(os.path.join(out, 'meatcan_stack.png'), optimize=True)


# --------------------------------------------------------------------------- 4. scene

def scene_half(W, H):
    img = ground(W, H)
    placed = []

    def add(im, anchor, x, y, depth=None, k=1.0):
        placed.append((y if depth is None else depth, im, anchor, x, y, k))
    can_im, an, _ = can('item_can')
    meat, _, sm = can('item_can_meat')
    sf = can('item_can')[2]
    # the cannery + its output pad with both cans
    cim, can_an, cs = sprite('buildings', 'station_cannery')
    bx, by = 300, 420
    add(cim, can_an, bx, by)
    pad, pan, _ = sprite('ui', 'ui_pad_output')
    ox, oy = bx + cs['outPoint'][0], by + cs['outPoint'][1]
    add(pad, pan, ox, oy, depth=oy - 100)
    seq = ['item_can', 'item_can_meat', 'item_can_meat', 'item_can', 'item_can_meat', 'item_can_meat', 'item_can',
           'item_can_meat']
    hs = [0.0, 0.0]
    for i, k in enumerate(seq):
        c = i % 2
        dx, dy = ((-15, -4), (15, 5))[c]
        im = meat if k == 'item_can_meat' else can_im
        add(im, an, ox + dx, oy + dy - hs[c], depth=oy + dy + i * 0.01)
        hs[c] += (sm if k == 'item_can_meat' else sf)['stackStep']
    # a porter walking off with meat cans
    cm = man('characters')['characters']['villager_b']
    fr = frame('characters', cm['atlas'], 'carry_walk_SE_2')
    px_, py_ = bx + 230, by + 150
    add(fr, (cm['anchor'][0] * fr.width, cm['anchor'][1] * fr.height), px_, py_)
    cp = cm['carryPoint']['SE']
    for i in range(5):
        add(meat, an, px_ + cp[0], py_ + cp[1] - i * sm['stackStep'] * 0.62, depth=py_ + 0.5 + i * 0.01, k=0.62)
    # the general store with a customer who wants a meat can
    sim, s_an, ss = sprite('buildings', 'shop_general')
    sx, sy = 880, 380
    add(sim, s_an, sx, sy)
    cust = man('characters')['characters']['villager_c']
    cfr = frame('characters', cust['atlas'], 'idle_NE_0')
    cx, cy = sx + ss['customerPoints'][0][0], sy + ss['customerPoints'][0][1]
    add(cfr, (cust['anchor'][0] * cfr.width, cust['anchor'][1] * cfr.height), cx, cy, depth=sy + 1)
    for _, im, a, x, y, k in sorted(placed, key=lambda t: t[0]):
        put(img, im, a, x, y, k)
    # want bubble above the customer (screen space, not depth-sorted)
    if 'ui_bubble' in man('ui')['sprites']:
        want_bubble(img, meat, cx, cy + cust['headTop'] - 8, 0.9)
    return img


def scene(out):
    W, H = 1100, 640
    day = scene_half(W, H)
    nt = night(day)
    img = Image.new('RGBA', (W * 2 + 12, H + 40), (150, 168, 190, 255))
    img.alpha_composite(day, (0, 40))
    img.alpha_composite(nt, (W + 12, 40))
    d = ImageDraw.Draw(img)
    label(d, (12, 10), 'in-game-like at 100 %: cannery output (fish + meat cans), a porter carrying meat cans, a '
                       '잡화점 customer wanting a meat can - day | night', 15, ko=True)
    img.convert('RGB').save(os.path.join(out, 'meatcan_scene.png'), optimize=True)
    # phone crop: the cannery corner at zoom 1.2 x render scale 1.5
    crop = day.crop((290, 330, 290 + 400, 330 + 260))
    ph = scaled(crop, 1.2 * RENDER_K)
    cn = night(crop)
    ph2 = scaled(cn, 1.2 * RENDER_K)
    img2 = Image.new('RGBA', (ph.width * 2 + 12, ph.height + 40), (150, 168, 190, 255))
    img2.alpha_composite(ph, (0, 40))
    img2.alpha_composite(ph2, (ph.width + 12, 40))
    d2 = ImageDraw.Draw(img2)
    label(d2, (12, 10), 'phone view (camera zoom 1.2 x render scale 1.5 = device pixels): the cannery output pad and '
                        'the porter - day | night', 15)
    img2.convert('RGB').save(os.path.join(out, 'meatcan_scene_phone.png'), optimize=True)


def main(argv):
    out = OUT
    if '--out' in argv:
        out = os.path.abspath(argv[argv.index('--out') + 1])
    os.makedirs(out, exist_ok=True)
    compare(out)
    icons(out)
    stacks(out)
    scene(out)
    print('previews:', ', '.join(sorted(f for f in os.listdir(out) if f.endswith('.png'))), '->', out)


if __name__ == '__main__':
    main(sys.argv[1:])
