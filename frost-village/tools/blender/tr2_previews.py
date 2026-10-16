"""
tr2_previews.py - labelled previews of assets/train2 (docs/CONTRACT_V42.md section AK) from the shipped atlases.

    python3 tools/blender/tr2_previews.py            (no Blender; the phone captures come from tools/test/train2_phaser.mjs)

Writes docs/previews/:
  tr2_cars_8dir.png       engine (assets/town, for scale) + coach + box car + flat car in all 8 headings with their
                          shadows, anchors dotted, 1:1 (= zoom 0.6 on a 390 px DPR 3 phone, 0.975 device px / px)
  tr2_anims.png           move (8 f) of each car in SE, door_open SE / NE (4 f), 2x
  tr2_consist.png         the 마을 and 읍 consists side by side (heading E and SE) with the measured body gaps
  tr2_silhouette.png      the four units at 0.3 scale: real + flat colour blobs (contract silhouette test)
  tr2_loops.png           both loop decals baked over the rail_x tiles on snow (exact RoadPaint order) + zoomed
                          turnout / joint-at-A crops
  tr2_props.png           fence run (4 tiles + end post), switch stand green / yellow, water tower idle + pour
  tr2_wheels.gif          the three cars' move loops (SE + E), 2x
  tr2_door.gif            box car door open -> hold -> close (played reversed) in SE and NE, 2x
  tr2_water_tower.gif     the water tower pour loop, 2x
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
PREV = os.path.join(GAME, 'docs', 'previews')
FONT = os.path.join(GAME, 'tools', 'fonts', 'Pretendard-ExtraBold.ttf')
SNOW = (238, 243, 249, 255)
INK = (52, 62, 80, 255)
MIR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
D8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
NAMES = {'train_engine': '기관차 train_engine (assets/town)', 'train_coach': '객차 train_coach "솔방울호"',
         'train_boxcar': '화물칸 train_boxcar', 'train_flatcar': '무개화차 train_flatcar'}
PHONE06 = 0.6 * 1170 / 720.0          # device px per world px at zoom 0.6 on a 390 x 844 DPR 3 phone

_atl = {}


def font(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()


def man(folder):
    return json.load(open(os.path.join(ASSETS, folder, 'manifest.json'), encoding='utf-8'))


def frame(folder, atlas, name):
    k = (folder, atlas)
    if k not in _atl:
        _atl[k] = (Image.open(os.path.join(ASSETS, folder, atlas + '.png')).convert('RGBA'),
                   json.load(open(os.path.join(ASSETS, folder, atlas + '.json')))['frames'])
    im, fr = _atl[k]
    f = fr[name]
    r, ss = f['frame'], f['spriteSourceSize']
    out = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']))
    out.paste(im.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
    return out


M2, MT = man('train2'), man('town')


def cdef(key):
    return (('train2', M2['characters'][key]) if key in M2['characters'] else ('town', MT['characters'][key]))


def car(key, anim, d, i=0):
    folder, m = cdef(key)
    rd = MIR.get(d, d)
    im = frame(folder, m['atlas'], '%s_%s_%d' % (anim, rd, i))
    ax, ay = m['anchor'][0] * im.width, m['anchor'][1] * im.height
    if d in MIR:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        ax = im.width - ax
    return im, (ax, ay)


def shadow(key, d):
    folder, m = cdef(key)
    sf = m['shadowFrames']
    im = frame(folder, sf['atlas'], sf['frames'][d])
    return im, (sf['anchor'][0] * im.width, sf['anchor'][1] * im.height)


def paste(bg, im, anc, x, y):
    bg.alpha_composite(im, (int(round(x - anc[0])), int(round(y - anc[1]))))


def label(bg, xy, text, sz=15, col=INK):
    ImageDraw.Draw(bg).text(xy, text, font=font(sz), fill=col)


def snow_bg(w, h):
    bg = Image.new('RGBA', (w, h), SNOW)
    p = os.path.join(ASSETS, 'ground', 'ground_snow.png')
    if os.path.exists(p):
        t = Image.open(p).convert('RGBA')
        for y in range(0, h, t.height):
            for x in range(0, w, t.width):
                bg.alpha_composite(t, (x, y))
    return bg


def save(im, name):
    p = os.path.join(PREV, name)
    im.convert('RGB').save(p, optimize=True) if name.endswith('.png') else None
    print(name, im.size)
    return p


def gif(frames, name, ms):
    p = os.path.join(PREV, name)
    pal = [f.convert('RGB').quantize(colors=200, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(p, save_all=True, append_images=pal[1:], duration=ms, loop=0, optimize=True, disposal=1)
    print(name, len(frames), 'frames', os.path.getsize(p) // 1024, 'KB')


# --------------------------------------------------------------------------------------------- sheets

def cars_8dir():
    rows = ['train_engine', 'train_coach', 'train_boxcar', 'train_flatcar']
    cw, ch = 236, 236
    W, H = cw * 8 + 20, 60 + ch * 4 + 40
    bg = Image.new('RGBA', (W, H), SNOW)
    label(bg, (14, 12), 'v4.2 train cars - 8 headings (S SE E NE N rendered, NW W SW = flipX; shadows per heading, '
                        'not mirrored). red dot = anchor (track centre line). 1:1 world px', 17)
    for r, k in enumerate(rows):
        y0 = 60 + r * ch
        label(bg, (14, y0), NAMES[k], 15)
        for c, d in enumerate(D8):
            x, y = 10 + c * cw + cw // 2, y0 + ch - 48
            s, sa = shadow(k, d)
            paste(bg, s, sa, x, y)
            im, a = car(k, 'idle', d)
            paste(bg, im, a, x, y)
            ImageDraw.Draw(bg).ellipse((x - 2, y - 2, x + 2, y + 2), fill=(230, 40, 90, 255))
            label(bg, (x - 8, y0 + ch - 26), d, 13, (90, 100, 120, 255))
    label(bg, (14, 60 + 4 * ch + 8), 'On a 390 x 844 phone (DPR 3) zoom 0.6 is %.2f device px per world px, i.e. '
          'this sheet at ~1:1 - see tr2_phone_*.png for the in-engine captures.' % PHONE06, 14)
    return save(bg, 'tr2_cars_8dir.png')


def anims_sheet():
    cars = ['train_coach', 'train_boxcar', 'train_flatcar']
    W, H = 1640, 50 + 3 * 190 + 2 * 290 + 20
    bg = Image.new('RGBA', (W, H), SNOW)
    label(bg, (14, 12), 'move: 8 frames = one wheel turn (45 deg per frame) + a gentle body sway (SE, 1:1); door_open: '
                        '4 frames once, box car SE / NE only (1.5x; the game plays it reversed to close)', 16)
    y = 50
    for k in cars:
        label(bg, (14, y), NAMES[k] + ' - move SE 0..7', 14)
        for i in range(8):
            im, a = car(k, 'move', 'SE', i)
            paste(bg, im, a, 20 + 100 + i * 200, y + 150)
        y += 190
    f = 1.5
    for d in ('SE', 'NE'):
        label(bg, (14, y), NAMES['train_boxcar'] + ' - idle (closed), door_open %s 0..3' % d, 14)
        seq = [('idle', 0)] + [('door_open', i) for i in range(4)]
        for n, (an, i) in enumerate(seq):
            im, a = car('train_boxcar', an, d, i)
            sm = im.resize((int(im.width * f), int(im.height * f)), Image.LANCZOS)
            paste(bg, sm, (a[0] * f, a[1] * f), 20 + 150 + n * 310, y + 250)
        y += 290
    return save(bg, 'tr2_anims.png')


def consist_sheet():
    tc = M2['trainConsist']
    cm = {k: dict(cdef(k)[1]['couplerM']) for k in ('train_engine', 'train_coach', 'train_boxcar', 'train_flatcar')}
    cm['train_engine'].update(tc.get('couplerOverride', {}).get('train_engine', {}))
    W, H = 1500, 1200
    bg = snow_bg(W, H)
    label(bg, (14, 10), 'consists at 1:1 (anchor spacing = back coupler of the car in front - front coupler of the car '
                        'behind; engine rear hook %.3f m, see trainConsist.couplerOverride)' % cm['train_engine']['back'],
          15)
    rows = [('마을 village (engine + coach + box car + flat car), heading E', tc['village']['order'], 'E', (64.0, 0.0),
             1380, 270, 60),
            ('읍 eup (engine + 2 coaches + box car + flat car), heading E', tc['eup']['order'], 'E', (64.0, 0.0),
             1380, 560, 350),
            ('읍 eup, heading SE (the straight main line)', tc['eup']['order'], 'SE', (45.2548, 22.6274), 1280, 1110,
             640)]
    for title, order, d, v, x0, y0, ly in rows:
        label(bg, (14, ly), title, 15)
        s = 0.0
        pos = []
        for n, k in enumerate(order):
            if n:
                s += cm[order[n - 1]]['back'] - cm[k]['front']
            pos.append((x0 - v[0] * s, y0 - v[1] * s, k))
        for x, y, k in pos:
            sh, sa = shadow(k, d)
            paste(bg, sh, sa, x, y)
        for x, y, k in sorted(pos, key=lambda p: p[1]):
            im, a = car(k, 'idle', d)
            paste(bg, im, a, x, y)
    # gaps measured by tr2_check (if it ran)
    gp = '/tmp/fv_cache/train2/check.json'
    if os.path.exists(gp):
        g = json.load(open(gp))['info'].get('couplerGapM', {})
        label(bg, (14, H - 40), 'measured body gaps (m): ' + ', '.join('%s %.2f' % kv for kv in g.items()) +
              '  (contract >= 0.3 between the new cars)', 15)
    return save(bg, 'tr2_consist.png')


def silhouette():
    units = ['train_engine', 'train_coach', 'train_boxcar', 'train_flatcar']
    W, H = 1100, 330
    bg = Image.new('RGBA', (W, H), SNOW)
    label(bg, (14, 10), 'silhouette test at 0.3 scale (contract AK): top = the sprites, bottom = flat colour blobs '
                        '(blurred, one tone per unit area); each unit must read as its own thing', 15)
    for n, k in enumerate(units):
        im, a = car(k, 'idle', 'SE')
        sm = im.resize((round(im.width * 0.3), round(im.height * 0.3)), Image.LANCZOS)
        x = 80 + n * 130
        paste(bg, sm, (a[0] * 0.3, a[1] * 0.3), x, 110)
        tile = Image.new('RGBA', sm.size, SNOW)
        tile.alpha_composite(sm)
        tile = tile.convert('RGB').filter(ImageFilter.GaussianBlur(1.5)).convert('RGBA')
        tile.putalpha(sm.getchannel('A').point(lambda v: 255 if v > 100 else 0))
        paste(bg, tile, (a[0] * 0.3, a[1] * 0.3), x, 220)
        label(bg, (x - 40, 250), k.replace('train_', ''), 13)
    # the consist at 0.3 (heading SE) - as one strip
    tc = M2['trainConsist']['eup']['order']
    strip = Image.new('RGBA', (900, 300))
    s = 0.0
    pos = []
    cm = {k: dict(cdef(k)[1]['couplerM']) for k in set(tc)}
    cm['train_engine'].update(M2['trainConsist'].get('couplerOverride', {}).get('train_engine', {}))
    for i, k in enumerate(tc):
        if i:
            s += cm[tc[i - 1]]['back'] - cm[k]['front']
        pos.append((800 - 45.2548 * s, 250 - 22.6274 * s, k))
    for x, y, k in sorted(pos, key=lambda p: p[1]):
        im, a = car(k, 'idle', 'SE')
        paste(strip, im, a, x, y)
    strip = strip.resize((270, 90), Image.LANCZOS)
    bg.alpha_composite(strip, (620, 70))
    blob = Image.new('RGBA', strip.size, SNOW)
    blob.alpha_composite(strip)
    blob = blob.convert('RGB').filter(ImageFilter.GaussianBlur(1.5)).convert('RGBA')
    blob.putalpha(strip.getchannel('A').point(lambda v: 255 if v > 100 else 0))
    bg.alpha_composite(blob, (620, 180))
    label(bg, (640, 290), '읍 consist at 0.3 (SE)', 13)
    return save(bg, 'tr2_silhouette.png')


def loops():
    rx = MT['sprites']['rail_x']
    rxi = frame('town', rx['atlas'], rx['frame'])
    rxa = (rx['anchor'][0] * rxi.width, rx['anchor'][1] * rxi.height)
    panels = []
    for key, ks, rect in (('rail_loop_ours', range(-6, 9), (2560, 720, 3460, 1460)),
                          ('rail_loop_town', range(28, 42), (5160, 2200, 6180, 2760))):
        s = M2['sprites'][key]
        x0, y0, x1, y1 = rect
        bg = snow_bg(x1 - x0, y1 - y0)
        for k in ks:
            wx, wy = 3120 + 64 * (k + 0.5), 1315 + 32 * (k + 0.5)
            paste(bg, rxi, rxa, wx - x0, wy - y0)
        plain = bg.copy()
        im = frame('train2', s['atlas'], s['frame'])
        bg.alpha_composite(im, (int(s['anchorWorldPx'][0] - s['anchorPx'][0] - x0),
                                int(s['anchorWorldPx'][1] - s['anchorPx'][1] - y0)))
        # props at their place hints
        ph = s['placeHint']
        for pk in ('rail_switch_stand', 'rail_water_tower'):
            p = M2['sprites'][pk]
            pim = frame('train2', p['atlas'], p['frame'])
            paste(bg, pim, p['anchorPx'], ph[pk]['worldPx'][0] - x0, ph[pk]['worldPx'][1] - y0)
        if key == 'rail_loop_ours':
            f, fe = M2['sprites']['rail_fence_x'], M2['sprites']['rail_fence_x_end']
            run = f['run']['ours']
            for wx, wy in run['worldPx']:
                paste(bg, frame('train2', f['atlas'], f['frame']), f['anchorPx'], wx - x0, wy - y0)
            paste(bg, frame('train2', fe['atlas'], fe['frame']), fe['anchorPx'], run['endWorldPx'][0] - x0,
                  run['endWorldPx'][1] - y0)
        panels.append((key, bg, plain, s, rect))
    W = max(p[1].width for p in panels) * 2 + 30
    H = sum(p[1].height for p in panels) + 640
    out = Image.new('RGBA', (W, H), (226, 232, 240, 255))
    label(out, (14, 10), 'loop decals baked over the plain rail_x tiles on snow (RoadPaint order: tiles, then the decal); '
                         'left = with the decal + props, right = the straight tiles alone. 1:1', 16)
    y = 40
    for key, bg, plain, s, rect in panels:
        label(out, (14, y), '%s  anchor = %s = L%s  (frame %s)' % (key, s['anchorWorldPx'], tuple(s['anchorLattice']),
                                                                   s['frameSize']), 14)
        out.alpha_composite(bg, (10, y + 22))
        out.alpha_composite(plain, (bg.width + 20, y + 22))
        y += bg.height + 34
    # zoomed crops (3x): ours turnout, ours joint at A, town turnout, town joint at A'
    label(out, (14, y), 'zoom 3x: turnout at T1 / joint at A (ours), turnout at T2 / joint at A′ (town)', 14)
    y += 22
    x = 10
    for key, bg, plain, s, rect in panels:
        for nm in ('T', 'A'):
            px, py = s['pointsPx'][nm]
            cx, cy = s['anchorWorldPx'][0] + px - rect[0], s['anchorWorldPx'][1] + py - rect[1]
            crop = bg.crop((int(cx - 85), int(cy - 60), int(cx + 85), int(cy + 60))).resize((510, 360), Image.LANCZOS)
            out.alpha_composite(crop, (x, y))
            label(out, (x + 6, y + 4), '%s %s' % (key.replace('rail_loop_', ''), nm), 14)
            x += 520
    return save(out, 'tr2_loops.png')


def props():
    sp = M2['sprites']
    W, H = 1500, 420
    bg = snow_bg(W, H)
    label(bg, (14, 10), 'rail_fence_x run (4 tiles at stepPx (64, 32) + rail_fence_x_end), rail_switch_stand idle_0 '
                        '(green) / idle_1 (yellow), rail_water_tower idle + pour 0..5. 1:1, then 2x', 15)
    f, fe = sp['rail_fence_x'], sp['rail_fence_x_end']
    fi, ei = frame('train2', f['atlas'], f['frame']), frame('train2', fe['atlas'], fe['frame'])
    for t in range(4):
        paste(bg, fi, f['anchorPx'], 70 + 64 * t, 120 + 32 * t)
    paste(bg, ei, fe['anchorPx'], 70 + 64 * 4 - 32, 120 + 32 * 4 - 16)
    ss = sp['rail_switch_stand']
    for n, fr in enumerate(ss['frames']):
        paste(bg, frame('train2', ss['atlas'], fr), ss['anchorPx'], 420 + n * 70, 160)
    wt = sp['rail_water_tower']
    for n, fr in enumerate([None] + wt['anims']['pour']['frames'][::2]):
        paste(bg, tower_img(wt, fr), wt['anchorPx'], 850 + n * 165, 250)
    big = bg.crop((380, 80, 560, 190)).resize((360, 220), Image.LANCZOS)
    bg.alpha_composite(big, (420, 196))
    return save(bg, 'tr2_props.png')


# --------------------------------------------------------------------------------------------- gifs

def wheels_gif():
    """rows: SE and E with all 8 move frames, then E with the 4 frames the packer keeps on the curves (0, 2, 4, 6,
    each held 2 ticks): (polish M1) every frame differs, so the curve set still rolls one way."""
    frames = []
    cars = ['train_coach', 'train_boxcar', 'train_flatcar']
    for i in range(16):
        bg = Image.new('RGBA', (1180, 620), SNOW)
        for r, t_ in enumerate(('SE: move 0-7', 'E: move 0-7', 'E on a curve: the 4 kept frames 0, 2, 4, 6')):
            label(bg, (8, 96 + r * 200), t_, 14)
        for n, k in enumerate(cars):
            for r, d in enumerate(('SE', 'E', 'E4')):
                fi = (i % 8) if d != 'E4' else ((i // 2) % 4) * 2
                im, a = car(k, 'move', d[:2] if d != 'E4' else 'E', fi)
                sh, sa = shadow(k, d if d != 'E4' else 'E')
                x, y = 200 + n * 390, 190 + r * 200
                big = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
                sbig = sh.resize((sh.width * 2, sh.height * 2), Image.LANCZOS)
                t = Image.new('RGBA', bg.size)
                paste(t, sbig, (sa[0] * 2, sa[1] * 2), x, y)
                paste(t, big, (a[0] * 2, a[1] * 2), x, y)
                bg.alpha_composite(t.crop((0, 0) + bg.size))
        frames.append(bg)
    gif(frames, 'tr2_wheels.gif', 83)


def door_gif():
    seq = [('idle', 0)] * 4 + [('door_open', i) for i in range(4)] + [('door_open', 3)] * 8 + \
          [('door_open', i) for i in (3, 2, 1, 0)] + [('idle', 0)] * 4
    frames = []
    for an, i in seq:
        bg = Image.new('RGBA', (800, 420), SNOW)
        for n, d in enumerate(('SE', 'NE')):
            im, a = car('train_boxcar', an, d, i)
            sh, sa = shadow('train_boxcar', d)
            t = Image.new('RGBA', (400, 420))
            paste(t, sh.resize((sh.width * 2, sh.height * 2), Image.LANCZOS), (sa[0] * 2, sa[1] * 2), 200, 330)
            paste(t, im.resize((im.width * 2, im.height * 2), Image.LANCZOS), (a[0] * 2, a[1] * 2), 200, 330)
            bg.alpha_composite(t, (n * 400, 0))
        frames.append(bg)
    gif(frames, 'tr2_door.gif', 100)


def tower_img(wt, overlay=None):
    """(polish H1) idle frame, or pourBase + one pour overlay frame (same origin) as the game draws it."""
    if overlay is None:
        return frame('train2', wt['atlas'], wt['frame'])
    im = frame('train2', wt['atlas'], wt['pourBase']).copy()
    im.alpha_composite(frame('train2', wt['atlas'], overlay))
    return im


def tower_gif():
    wt = M2['sprites']['rail_water_tower']
    frames = []
    for fr in [None] * 4 + wt['anims']['pour']['frames'] * 3:
        bg = snow_bg(600, 620)
        im = tower_img(wt, fr)
        big = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        paste(bg, big, (wt['anchorPx'][0] * 2, wt['anchorPx'][1] * 2), 260, 470)
        frames.append(bg)
    gif(frames, 'tr2_water_tower.gif', 100)


def main():
    os.makedirs(PREV, exist_ok=True)
    cars_8dir()
    anims_sheet()
    consist_sheet()
    silhouette()
    loops()
    props()
    wheels_gif()
    door_gif()
    tower_gif()


if __name__ == '__main__':
    main()
