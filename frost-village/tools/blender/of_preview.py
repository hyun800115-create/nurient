"""
of_preview.py - human previews of the officefolk fragment (assets/townfolk + assets/officefolk, the v4.2 merge) via
the reference compositor tools/officefolk_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/of_preview.py [lineup anims gifs dirs signature desk office courier]   # -> docs/previews/

  officefolk_lineup.png      the 8 presets (labels ko / en): idle S, walk SE, a signature anim, idle N, + the same
                             people at phone zoom 0.6 (0.975 device px per world px) and 1.0
  officefolk_anims.png       contact sheet: the 14 anims (rows) on the 8 presets (columns); a fallback is labelled
  officefolk_<anim>.gif      each anim on the 8 presets (14 GIFs, primary dir, real fps)
  officefolk_dirs.png        every anim x every dir x every frame on one preset (review sheet)
  officefolk_signature.png/.gif  each preset doing its 3 signature anims
  officefolk_desk_row.png/.gif   seated row behind a desk mock (legs hidden) + the same row without the desk with the
                             seat anchor (seat front-centre, 0.45 m) and the floor line marked: checks the seat anchor
  officefolk_office.png/.gif the real office (assets/office, revealed cut state) with the clerks at deskPoints and the
                             board / cabinet / safe / door staff, in the building's bands
  officefolk_courier_walk.gif    the coin courier walking a loop with carry_sack at groundSpeed (feet planted)
  officefolk_courier_dirs.gif    carry_sack in all 8 directions (mirrors included)
  (polish)
  officefolk_points.png      every point kind drawn on its frames (red cross): scoop sack mouth, carry_sack sack,
                             hand_over hands, stamp impact, pointer tip - the coins / stamps / chalk land where they should
  officefolk_bank.png/.gif   the civic bank cutaway (revealed): tellers lifted onto the counter step (counter.places.bank),
                             stamping / handing over; the 은행장 seated at staffPoints[3]; the courier at the counter
  officefolk_before_after.png  the critic's findings, before (pre-polish atlases) and after: eased bow and scoop, the
                             shoulder sack from the front, the tellers' bow tie, the bigger bell / stamp / receiver
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from officefolk_compose import Officefolk       # noqa: E402
import tf_preview as tpv                         # noqa: E402
import of_presets as opr                         # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
ASSETS = os.path.join(GAME, 'assets')
SNOW = (238, 243, 249, 255)
FLOOR = (226, 214, 196, 255)
INK = (43, 47, 58, 255)
RED = (196, 52, 52, 255)
font = tpv.font
ANIMS = ['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count', 'file', 'point_board',
         'stamp_stand', 'bow', 'note', 'hand_over', 'scoop', 'carry_sack']
PRIMARY = {a: 'SE' for a in ANIMS}
PRIMARY.update({'file': 'NE', 'point_board': 'NE'})
PRESETS = opr.PRESET_ORDER
CROP = (14, 0, 114, 120)          # 100 x 120 around the anchor (64, 104)


class Cache:
    def __init__(self, tf):
        self.tf = tf
        self.c = {}

    def img(self, p, anim, d, i, key, face=None, no_items=False):
        k = (key, anim, d, i, face, no_items)
        if k not in self.c:
            self.c[k] = self.tf.compose(p, anim, d, i, face=face, no_items=no_items)
        return self.c[k]


def shadow(img, x, y, w, h, a=60):
    sh = Image.new('RGBA', (w * 2 + 4, h * 2 + 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(80, 100, 130, a))
    img.alpha_composite(sh, (int(x - w - 2), int(y - h - 2)))


def put(canvas, fr, x, y, scale=1.0):
    """paste a 128 x 128 frame with its anchor (64, 104) at (x, y)"""
    if scale != 1:
        fr = fr.resize((round(128 * scale), round(128 * scale)), Image.NEAREST if scale >= 1 else Image.LANCZOS)
    canvas.alpha_composite(fr, (int(round(x - 64 * scale)), int(round(y - 104 * scale))))


def people(tf):
    out = {}
    for k, pr in enumerate(PRESETS):
        out[pr] = tf.preset(pr, seed=11 + k)
    return out


def stool(dr, x, y, floor):
    """a small wooden stool: seat top at the seat anchor y, legs down to the floor line"""
    dr.rectangle([x - 26, y - 4, x + 26, y + 3], fill=(150, 104, 64, 255))
    for lx in (-22, 18):
        dr.rectangle([x + lx, y + 3, x + lx + 4, floor], fill=(120, 80, 48, 255))


def text(dr, xy, s, sz=12, fill=INK, anchor='la'):
    dr.text(xy, s, font=font(sz), fill=fill, anchor=anchor)


def save_gif(frames, path, fps):
    pal = [f.convert('RGB').quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=int(round(1000 / fps)), loop=0, disposal=1)
    print(' ', os.path.relpath(path, GAME), f'{len(frames)} frames {os.path.getsize(path) / 1024:.0f} KB')


# --------------------------------------------------------------------------- sheets

def lineup(tf, C, P):
    cols = [('idle', 'S', 0), ('walk', 'SE', 2), None, ('idle', 'N', 1)]
    W, H = 150, 150
    can = Image.new('RGBA', (len(PRESETS) * W + 20, 120 + 4 * H + 250), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 8), 'officefolk presets (v4.2 merge: townfolk + officefolk) - idle S / walk SE / signature / idle N', 15)
    for c, pr in enumerate(PRESETS):
        p = P[pr]
        lab = tf.T['generator']['presets'][pr]['label']
        x0 = 10 + c * W
        text(dr, (x0 + W // 2, 34), pr, 13, anchor='ma')
        text(dr, (x0 + W // 2, 52), lab['ko'], 12, anchor='ma')
        text(dr, (x0 + W // 2, 70), lab['en'][:27], 10, fill=(90, 96, 110, 255), anchor='ma')
        text(dr, (x0 + W // 2, 86), p['base'], 10, fill=(90, 96, 110, 255), anchor='ma')
        sig = [a for a in opr.SIGNATURE[pr] if a not in tf.T['seat']['anims']][0]
        for r, spec in enumerate(cols):
            a, d, i = spec if spec else (sig, PRIMARY[sig], 2)
            a2, face = tf.pick_anim(p, a)
            y = 120 + r * H + 110
            shadow(can, x0 + W // 2, y, 22, 8)
            put(can, C.img(p, a2, d, i, pr, face=face), x0 + W // 2, y)
            if spec is None:
                text(dr, (x0 + W // 2, y + 22), sig, 10, fill=RED, anchor='ma')
    # phone zoom: 0.6 x 1.625 = 0.975 device px per world px; 1.0 x 1.625
    y0 = 120 + 4 * H + 10
    text(dr, (10, y0), 'phone (390 px @ DPR 3): zoom 0.6 = 0.975 device px / world px (left), zoom 1.0 = 1.625 (right)', 12)
    for c, pr in enumerate(PRESETS):
        p = P[pr]
        sig = [a for a in opr.SIGNATURE[pr] if a not in tf.T['seat']['anims']][0]
        x0 = 10 + c * W
        for sc, dx in ((0.975, 38), (1.625, 100)):
            yy = y0 + 200
            put(can, C.img(p, sig, PRIMARY[sig], 2, pr), x0 + dx, yy, sc)
    out = os.path.join(PREV, 'officefolk_lineup.png')
    can.save(out)
    print(' ', os.path.relpath(out, GAME), can.size)


def anims_sheet(tf, C, P):
    W, H = 104, 128
    can = Image.new('RGBA', (130 + len(PRESETS) * W, 40 + len(ANIMS) * H), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (8, 8), 'officefolk: 14 anims (rows) x 8 presets (cols), primary dir, frame 2; red = pickAnim fallback', 13)
    for c, pr in enumerate(PRESETS):
        text(dr, (130 + c * W + W // 2, 26), pr, 10, anchor='ma')
    for r, a in enumerate(ANIMS):
        y = 40 + r * H
        text(dr, (8, y + 50), a, 12)
        text(dr, (8, y + 66), f'{tf.T["anims"][a]["frames"]}f {tf.T["anims"][a]["fps"]}fps', 10, fill=(90, 96, 110, 255))
        for c, pr in enumerate(PRESETS):
            p = P[pr]
            a2, face = tf.pick_anim(p, a)
            d = PRIMARY[a] if a2 == a else 'SE'
            i = min(2, tf.T['anims'][a2]['frames'] - 1)
            if a in tf.T['seat']['anims'] and a2 == a:
                dr.rectangle([130 + c * W + 4, y + 98, 130 + c * W + W - 4, y + 99], fill=(200, 190, 175, 255))
            put(can, C.img(p, a2, d, i, pr, face=face), 130 + c * W + W // 2, y + 104, 0.92)
            if a2 != a:
                text(dr, (130 + c * W + W // 2, y + 110), '-> ' + a2, 10, fill=RED, anchor='ma')
    out = os.path.join(PREV, 'officefolk_anims.png')
    can.save(out)
    print(' ', os.path.relpath(out, GAME), can.size)


def anim_gifs(tf, C, P, only=None):
    for a in (only or ANIMS):
        inf = tf.T['anims'][a]
        W, H, S = 170, 190, 1.5
        frames = []
        n = inf['frames'] * (2 if inf['frames'] <= 4 else 1)
        for t in range(n):
            i = t % inf['frames']
            can = Image.new('RGBA', (4 * W, 30 + 2 * H), SNOW)
            dr = ImageDraw.Draw(can)
            text(dr, (8, 6), f'{a}  ({inf["frames"]} frames, {inf["fps"]} fps, repeat {inf["repeat"]})  frame {i}', 13)
            for k, pr in enumerate(PRESETS):
                p = P[pr]
                a2, face = tf.pick_anim(p, a)
                d = PRIMARY[a] if a2 == a else 'SE'
                j = i % tf.T['anims'][a2]['frames']
                x = (k % 4) * W + W // 2
                y = 30 + (k // 4) * H + 160
                if a not in tf.T['seat']['anims'] or a2 != a:
                    shadow(can, x, y, 30, 11)
                put(can, C.img(p, a2, d, j, pr, face=face), x, y, S)
                text(dr, (x, y + 8), pr + ('' if a2 == a else f' -> {a2}'), 11, fill=INK if a2 == a else RED, anchor='ma')
            frames.append(can)
        save_gif(frames, os.path.join(PREV, f'officefolk_{a}.gif'), inf['fps'])


def dirs_sheet(tf, C, P):
    owner = {}
    for pr in PRESETS:
        for a in opr.SIGNATURE[pr]:
            owner.setdefault(a, pr)
    rows = [(a, d) for a in ANIMS for d in tf.T['anims'][a]['dirs']]
    W, H = 100, 116
    can = Image.new('RGBA', (170 + 8 * W, 30 + len(rows) * H), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (8, 8), 'officefolk: every anim x dir x frame (rendered dirs; SW / W / NW are mirrors)', 13)
    for r, (a, d) in enumerate(rows):
        pr = owner.get(a, 'office_b')
        p = P[pr]
        y = 30 + r * H
        text(dr, (8, y + 40), f'{a} {d}', 12)
        text(dr, (8, y + 58), pr, 10, fill=(90, 96, 110, 255))
        for i in range(tf.T['anims'][a]['frames']):
            fr = C.img(p, a, d, i, pr).crop(CROP)
            can.alpha_composite(fr, (170 + i * W, y))
            dr.line([(170 + i * W + 44, y + 104), (170 + i * W + 56, y + 104)], fill=RED)
    out = os.path.join(PREV, 'officefolk_dirs.png')
    can.save(out)
    print(' ', os.path.relpath(out, GAME), can.size)


def signature(tf, C, P):
    W, H, S = 170, 176, 1.4
    fps = 10
    n = 24
    frames = []
    for t in range(n):
        can = Image.new('RGBA', (180 + 3 * W, 34 + len(PRESETS) * H), SNOW)
        dr = ImageDraw.Draw(can)
        text(dr, (8, 8), 'officefolk: each preset doing its signature anims', 14)
        for r, pr in enumerate(PRESETS):
            p = P[pr]
            lab = tf.T['generator']['presets'][pr]['label']
            y = 34 + r * H
            text(dr, (8, y + 60), pr, 13)
            text(dr, (8, y + 80), lab['ko'], 12)
            for c, a in enumerate(opr.SIGNATURE[pr]):
                inf = tf.T['anims'][a]
                i = int(t * inf['fps'] / fps) % inf['frames']
                if inf['repeat'] == 0:
                    i = min(int(t * inf['fps'] / fps) % (inf['frames'] + 4), inf['frames'] - 1)
                x = 180 + c * W + W // 2
                yy = y + 148
                if a not in tf.T['seat']['anims']:
                    shadow(can, x, yy, 28, 10)
                    put(can, C.img(p, a, PRIMARY[a], i, pr), x, yy, S)
                    text(dr, (x, yy + 10), a, 11, anchor='ma')
                else:                   # seated: the anchor is the seat -> a stool under it (floor = groundOffsetPx)
                    fl = yy + tf.T['bases'][p['base']]['deskSeat']['groundOffsetPx'] * S
                    shadow(can, x, fl, 30, 10)
                    stool(dr, x, yy, fl)
                    put(can, C.img(p, a, PRIMARY[a], i, pr), x, yy, S)
                    text(dr, (x, fl + 6), a, 11, anchor='ma')
        frames.append(can)
    frames[4].save(os.path.join(PREV, 'officefolk_signature.png'))
    save_gif(frames, os.path.join(PREV, 'officefolk_signature.gif'), fps)


def desk_row(tf, C, P):
    """6 seated staff behind a desk mock (legs hidden) + the same row without the desk, the seat anchor marked."""
    cast = [('office_a', 'desk_write'), ('office_b', 'desk_type'), ('secretary', 'desk_phone'), ('teller_b', 'desk_read'),
            ('courier', 'desk_count'), ('bank_manager', 'sit_idle')]
    S = 2
    W = 150
    fps = 8
    frames = []
    for t in range(24):
        can = Image.new('RGBA', (40 + len(cast) * W, 740), FLOOR)
        dr = ImageDraw.Draw(can)
        text(dr, (10, 8), 'seated row (2x): anchor = seat front-centre at 0.45 m; desk top 0.72 m '
                          '(deskSeat.deskTopPx); floor = deskSeat.groundOffsetPx', 13)
        for row, d in enumerate(('S', 'SE')):
            for k, (pr, a) in enumerate(cast):
                p = P[pr]
                B = tf.T['bases'][p['base']]['deskSeat']
                inf = tf.T['anims'][a]
                i = int(t * inf['fps'] / fps) % inf['frames']
                x = 40 + k * W + W // 2 - 20
                y = 230 + row * 330
                put(can, C.img(p, a, d, i, pr), x, y, S)
                # desk mock over the sitter: top surface (light) + front panel down to the floor
                top = y + B['deskTopPx'] * S
                floor = y + B['groundOffsetPx'] * S
                if row == 0:
                    # deskTopPx = the desk-top edge on the sitter's side; the top runs towards the camera (down the
                    # screen), the front panel hangs from the near edge to the floor
                    near = top + 18
                    dr.polygon([(x - 56, top), (x + 64, top), (x + 58, near), (x - 62, near)], fill=(176, 120, 72, 255))
                    dr.rectangle([x - 62, near, x + 58, floor + 22], fill=(140, 92, 54, 255))
                    dr.line([(x - 62, near), (x + 58, near)], fill=(110, 70, 40, 255), width=2)
                else:
                    dr.line([(x - 60, floor), (x + 60, floor)], fill=(150, 130, 110, 255), width=1)
                    dr.line([(x - 8, y), (x + 8, y)], fill=RED, width=2)
                    dr.line([(x, y - 8), (x, y + 8)], fill=RED, width=2)
                    dr.line([(x - 60, top), (x + 60, top)], fill=(176, 120, 72, 255), width=1)
                text(dr, (x, y + (100 if row == 0 else 64)), f'{pr} {a} {d}', 11, anchor='ma')
        text(dr, (10, 360), 'without the desk: red cross = seat anchor, brown = desk-top line, grey = floor line', 12)
        frames.append(can)
    frames[0].save(os.path.join(PREV, 'officefolk_desk_row.png'))
    save_gif(frames, os.path.join(PREV, 'officefolk_desk_row.gif'), fps)


def office(tf, C, P):
    """the real office building (assets/office, cut state) with officefolk at its points, in its bands."""
    man = json.load(open(os.path.join(ASSETS, 'office', 'manifest.json')))
    S = man['sprites']
    B = S['chief_office']
    atl = json.load(open(os.path.join(ASSETS, 'office', 'office_bld.json')))['frames']
    sheet = Image.open(os.path.join(ASSETS, 'office', 'office_bld.png')).convert('RGBA')
    fw, fh = B['frameSize']
    ax, ay = round(B['anchor'][0] * fw), round(B['anchor'][1] * fh)

    def frame(name):
        f = atl[name]
        r, ss = f['frame'], f['spriteSourceSize']
        out = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        out.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
        return out
    layers = {k: frame(S[k]['frame']) for k in B['drawOrder'] if k[0] != '@' and k in S and 'frames' not in S[k]}
    over = {k: [frame(f) for f in S[k]['frames']] for k in B['drawOrder'] if k in S and 'frames' in S[k]}
    cast = []
    desk = [('office_a', 'desk_write'), ('office_b', 'desk_type'), ('secretary', 'desk_phone'), ('courier', 'desk_count')]
    for k, q in enumerate(B['deskPoints']):
        cast.append((desk[k][0], desk[k][1], B['deskDirs'][k], q, 'behind'))
    cast.append(('teller_a', 'point_board', B['boardDir'], B['boardPoint'], 'behind'))
    cast.append(('depot_worker', 'hand_over', B['entryDir'], B['entryPoint'], 'front'))
    pad = 40
    fps = 8
    frames = []
    for t in range(24):
        can = Image.new('RGBA', (fw + 2 * pad, fh + 2 * pad + 30), SNOW)
        dr = ImageDraw.Draw(can)
        text(dr, (10, 8), 'officefolk in the real office (assets/office, revealed cut state, 1x): desks band "behind" '
                          'under _interior_front', 12)
        ox, oy = pad, pad + 30
        for key in B['drawOrder']:
            if key in ('@behind', '@front'):
                band = key[1:]
                for pr, a, d, q, b in sorted(cast, key=lambda c: c[3][1]):
                    if b != band:
                        continue
                    p = P[pr]
                    inf = tf.T['anims'][a]
                    i = int(t * inf['fps'] / fps) % inf['frames']
                    if inf['repeat'] == 0:
                        i = min(int(t * inf['fps'] / fps) % (inf['frames'] + 4), inf['frames'] - 1)
                    put(can, C.img(p, a, d, i, pr), ox + ax + q[0], oy + ay + q[1])
                continue
            if key == 'chief_office_glow':
                continue
            if key in over:
                fr = over[key][t % len(over[key])]
                can.alpha_composite(fr, (ox, oy))
                continue
            if key not in layers:
                continue
            im = layers[key]
            if key == 'chief_office_shell':
                a_ = np.asarray(im).copy()
                a_[..., 3] = (a_[..., 3] * B['fade']['openAlpha']).astype(np.uint8)
                im = Image.fromarray(a_)
            can.alpha_composite(im, (ox, oy))
        frames.append(can)
    frames[0].save(os.path.join(PREV, 'officefolk_office.png'))
    big = frames[0].resize((frames[0].width * 2, frames[0].height * 2), Image.NEAREST)
    cx, cy = pad + ax, pad + 30 + ay
    big.crop(((cx - 250) * 2, (cy - 250) * 2, (cx + 250) * 2, (cy + 100) * 2)).save(os.path.join(PREV, 'officefolk_office_2x.png'))
    save_gif(frames, os.path.join(PREV, 'officefolk_office.gif'), fps)


def courier(tf, C, P):
    p = P['courier']
    gs = tf.T['bases'][p['base']]['groundSpeed']['carry_sack']
    inf = tf.T['anims']['carry_sack']
    fps = inf['fps']
    # a diamond loop (iso legs): SE, NE, NW, SW at 1x world px, then 2x for the GIF
    L = 110
    vec = {'SE': (2, 1), 'NE': (2, -1), 'NW': (-2, -1), 'SW': (-2, 1)}
    legs = ['SE', 'NE', 'NW', 'SW']
    W0, H0 = 330, 290
    start = (64, 176)
    pos = list(start)
    frames = []
    rng = np.random.default_rng(3)
    ground = Image.new('RGBA', (W0, H0), SNOW)
    gd = ImageDraw.Draw(ground)
    for _ in range(260):        # snow speckles to read the feet planting
        x, y = rng.integers(0, W0), rng.integers(0, H0)
        gd.ellipse([x - 1, y - 0.5, x + 1, y + 0.5], fill=(205, 215, 228, 255))
    k = 0
    for leg in legs:
        dx, dy = vec[leg]
        n = np.hypot(dx, dy)
        dist = 0.0
        while dist < L:
            i = k % inf['frames']
            can = ground.copy()
            shadow(can, pos[0], pos[1], 13, 5)
            put(can, C.img(p, 'carry_sack', leg, i, 'courier'), pos[0], pos[1])
            frames.append(can.resize((W0 * 2, H0 * 2), Image.NEAREST))
            step = gs[{'SW': 'SE', 'NW': 'NE'}.get(leg, leg)] / fps
            pos[0] += dx / n * step
            pos[1] += dy / n * step
            dist += step
            k += 1
    for f in frames:
        ImageDraw.Draw(f).text((8, 6), f'courier carry_sack at groundSpeed (px/s): {gs}', font=font(12), fill=INK)
    save_gif(frames, os.path.join(PREV, 'officefolk_courier_walk.gif'), fps)
    # 8 dirs in place
    dirs = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
    frames = []
    for i in range(inf['frames']):
        can = Image.new('RGBA', (8 * 120 + 20, 260), SNOW)
        dr = ImageDraw.Draw(can)
        text(dr, (8, 6), 'courier carry_sack, 8 directions (NW / W / SW = mirrored NE / E / SE)', 13)
        for k, d in enumerate(dirs):
            x, y = 70 + k * 120, 210
            shadow(can, x, y, 26, 9)
            put(can, C.img(p, 'carry_sack', d, i, 'courier'), x, y, 1.6)
            text(dr, (x, y + 10), d, 12, anchor='ma')
        frames.append(can)
    save_gif(frames, os.path.join(PREV, 'officefolk_courier_dirs.gif'), fps)


def cross(dr, x, y, c=RED, r=4):
    dr.line([x - r, y, x + r, y], fill=c, width=2)
    dr.line([x, y - r, x, y + r], fill=c, width=2)


def points_sheet(tf, C, P):
    """every point kind on its frames (3x), for the presets that use them"""
    rows = [('courier', 'scoop', 'sackPoint', ['S', 'SE', 'E', 'SW'], [0, 2, 5]),
            ('courier', 'carry_sack', 'sackPoint', ['S', 'SE', 'E', 'NE', 'N', 'SW'], [2]),
            ('secretary', 'hand_over', 'handPoint', ['SE', 'E', 'NE', 'SW'], [3]),
            ('teller_a', 'stamp_stand', 'impactPoint', ['S', 'SE', 'E', 'SW'], [3]),
            ('office_a', 'desk_write', 'impactPoint', ['S', 'SE', 'E', 'SW'], [4]),
            ('office_a', 'point_board', 'tipPoint', ['NE', 'N', 'E', 'NW'], [1])]
    sc = 3
    cw, ch = 100 * sc, 120 * sc
    ncol = max(len(r[3]) * len(r[4]) for r in rows)
    can = Image.new('RGBA', (ncol * cw + 20, len(rows) * (ch + 26) + 40), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 8), 'officefolk points on their frames (red cross = manifest point; coins / stamp puff / chalk go there)', 16)
    for r, (pr, a, kind, dirs, idx) in enumerate(rows):
        p = P[pr]
        y0 = 40 + r * (ch + 26)
        c = 0
        for d in dirs:
            for i in idx:
                fr = C.img(p, a, d, i, pr).crop(CROP).resize((cw, ch), Image.NEAREST)
                x0 = 10 + c * cw
                can.alpha_composite(fr, (x0, y0 + 20))
                if kind == 'sackPoint':
                    pt = tf.sack_point(p, a, d, i)
                elif kind == 'handPoint':
                    pt = tf.hand_point(p, d, i)
                elif kind == 'impactPoint':
                    pt = tf.impact_point(p, a, d)
                else:
                    pt = tf.tip_point(p, d, i)
                if pt:
                    cross(dr, x0 + (64 + pt[0] - CROP[0]) * sc, y0 + 20 + (104 + pt[1] - CROP[1]) * sc, r=7)
                text(dr, (x0 + 4, y0 + 2), f'{pr} {a} {d} {i} ({kind})', 12)
                c += 1
    can.save(os.path.join(PREV, 'officefolk_points.png'))
    print('  docs/previews/officefolk_points.png')


def _civic_layers():
    man = json.load(open(os.path.join(ASSETS, 'civic', 'manifest.json'), encoding='utf-8'))
    S = man['sprites']
    at = {a['key']: a for a in man['atlases']}
    sheets = {}

    def frame(name):
        sp = S[name]
        a = at[sp['atlas']]
        if a['key'] not in sheets:
            js = json.load(open(os.path.join(ASSETS, a['json'])))
            sheets[a['key']] = (js['frames'], Image.open(os.path.join(ASSETS, a['png'])).convert('RGBA'))
        frs, sh = sheets[a['key']]
        fname = sp['frames'][0] if 'frames' in sp else sp['frame']
        f = frs[fname] if isinstance(frs, dict) else [x for x in frs if x['filename'] == fname][0]
        r, ss = f['frame'], f['spriteSourceSize']
        out = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        out.paste(sh.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
        return out
    return S, frame


def bank(tf, C, P):
    """the civic bank cutaway with the bank staff where the plan puts them (H3 / M3 recipe)"""
    S, frame = _civic_layers()
    B = S['bank']
    cw = B['cutaway']
    fw, fh = B['frameSize']
    ax, ay = round(B['anchor'][0] * fw), round(B['anchor'][1] * fh)
    layers = {k: frame(k) for k in cw['drawOrder'] if k[0] != '@' and k in S}
    CB = tf.T['counter']['places']['bank']
    SP, SD, CP, CD = B['staffPoints'], B['staffDirs'], B['counterPoints'], B['counterDirs']
    t_a, t_b, mgr, cour = P['teller_a'], P['teller_b'], P['bank_manager'], P['courier']
    cast = [  # (person, key, anim, dir, point, band, lift)
        (t_a, 'teller_a', 'stamp_stand', SD[0], SP[0], 'behind', CB['liftPx'][t_a['base']]['SE']),
        (t_b, 'teller_b', 'hand_over', SD[1], SP[1], 'behind', CB['liftPx'][t_b['base']]['SE']),
        (t_a, 'teller_a', 'stamp_stand', SD[2], SP[2], 'behind', CB['liftPx'][t_a['base']]['SE']),
        (mgr, 'bank_manager', 'desk_write', SD[3], SP[3], 'behind', tf.T['bases'][mgr['base']]['deskSeat']['groundOffsetPx']),
        (cour, 'courier', 'hand_over', CD[0], CP[0], 'front', 0),
        (P['office_b'], 'office_b', 'idle', CD[1], CP[1], 'front', 0)]
    pad, fps = 30, 8
    frames = []
    for t in range(32):
        can = Image.new('RGBA', (fw + 2 * pad, fh + 2 * pad + 40), SNOW)
        dr = ImageDraw.Draw(can)
        text(dr, (10, 6), f'civic bank: tellers on the counter step (lift {CB["liftPx"]["adult_slim"]["SE"]} px, counter '
                          f'top {CB["counterTopPx"]} px), 은행장 seated at staffPoints[3]', 12)
        ox, oy = pad, pad + 40
        for key in cw['drawOrder']:
            if key in ('@behind', '@front'):
                for p, pk, a, d, q, band, lift in sorted(cast, key=lambda c: c[4][1]):
                    if band != key[1:]:
                        continue
                    inf = tf.T['anims'][a]
                    i = int(t * inf['fps'] / fps) % inf['frames']
                    if inf['repeat'] == 0:
                        i = min(int(t * inf['fps'] / fps) % (inf['frames'] + 6), inf['frames'] - 1)
                    put(can, C.img(p, a, d, i, pk), ox + ax + q[0], oy + ay + q[1] - lift)
                continue
            if key not in layers:
                continue
            im = layers[key]
            if key == cw['fade']['layer']:
                a_ = np.asarray(im).copy()
                a_[..., 3] = (a_[..., 3] * cw['fade']['openAlpha']).astype(np.uint8)
                im = Image.fromarray(a_)
            can.alpha_composite(im, (ox, oy))
        frames.append(can)
    cx, cy = pad + ax, pad + 40 + ay
    big = [f.crop((cx - 200, cy - 200, cx + 230, cy + 60)).resize((860, 520), Image.NEAREST) for f in frames]
    for f in big:
        ImageDraw.Draw(f).text((8, 6), 'civic bank (2x): tellers on the counter step, 은행장 seated, courier at the counter',
                               font=font(13), fill=INK)
    big[3].save(os.path.join(PREV, 'officefolk_bank.png'))
    save_gif(big, os.path.join(PREV, 'officefolk_bank.gif'), fps)


def before_after(tf, C, P):
    """pre-polish atlases (scratch copy, if present) vs now: the visible fixes of the polish pass"""
    import tempfile
    from officefolk_compose import Officefolk as OF
    old = os.environ.get('OF_BEFORE')
    if not old or not os.path.isdir(old):
        print('  (before/after skipped: set OF_BEFORE to the pre-polish assets/officefolk copy)')
        return
    tmp = tempfile.mkdtemp(prefix='of_before_')
    os.symlink(os.path.join(ASSETS, 'townfolk'), os.path.join(tmp, 'townfolk'))
    os.symlink(old, os.path.join(tmp, 'officefolk'))
    tf0 = OF.from_assets(assets=tmp, fragments=['officefolk'])
    C0 = Cache(tf0)
    rows = [('bank_manager', 'bow', 'SE', range(6), 'bow (eased: stand, bend, deep, deep, bend, stand)'),
            ('courier', 'scoop', 'SE', range(6), 'scoop (dip held 2 frames, bend in between)'),
            ('courier', 'carry_sack', 'S', range(0, 8, 2), 'carry_sack S (sack out to the side, emblem toward you)'),
            ('teller_a', 'idle', 'S', [0], 'teller: bow tie (acc_bowtie, acc2)'),
            ('courier', 'idle', 'S', [0], 'bell pin 1.85x'),
            ('teller_b', 'stamp_stand', 'SE', [2, 3], 'stamp 1.4x'),
            ('secretary', 'desk_phone', 'SE', [0], 'receiver 1.45x')]
    sc = 3
    cw_, ch_ = 100 * sc // 2, 120 * sc // 2
    ncol = 2 * 6 + 1
    can = Image.new('RGBA', (ncol * cw_ + 40, len(rows) * (ch_ + 40) + 50), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 8), 'officefolk polish: BEFORE (left, pre-polish atlases) / AFTER (right)', 16)
    for r, (pr, a, d, idx, lab) in enumerate(rows):
        y0 = 44 + r * (ch_ + 40)
        text(dr, (10, y0), lab, 13)
        p = P[pr]
        p0 = dict(p, parts=[('det_bow' if x == 'acc_bowtie' else x) for x in p['parts']])
        for side, (T_, C_, pp) in enumerate(((tf0, C0, p0), (tf, C, p))):
            for c, i in enumerate(list(idx)[:6]):
                a_ = a if a in T_.T['anims'] else 'walk'
                fr = C_.img(pp, a_, d, i, pr + ('_0' if side == 0 else '')).crop(CROP).resize((cw_, ch_), Image.NEAREST)
                x0 = 10 + (side * 6 + c) * cw_ + side * 30
                can.alpha_composite(fr, (x0, y0 + 18))
        dr.line([10 + 6 * cw_ + 15, y0 + 18, 10 + 6 * cw_ + 15, y0 + 18 + ch_], fill=(150, 160, 175, 255), width=2)
    can.save(os.path.join(PREV, 'officefolk_before_after.png'))
    print('  docs/previews/officefolk_before_after.png')


def main():
    what = set(sys.argv[1:]) or {'lineup', 'anims', 'gifs', 'dirs', 'signature', 'desk', 'office', 'courier', 'points',
                                 'bank', 'before'}
    os.makedirs(PREV, exist_ok=True)
    tf = Officefolk.from_assets(fragments=['officefolk'])
    C = Cache(tf)
    P = people(tf)
    for pr, p in P.items():
        print(pr, p['base'], ','.join(p['parts']))
    if 'lineup' in what:
        lineup(tf, C, P)
    if 'anims' in what:
        anims_sheet(tf, C, P)
    if 'signature' in what:
        signature(tf, C, P)
    if 'desk' in what:
        desk_row(tf, C, P)
    if 'office' in what:
        office(tf, C, P)
    if 'courier' in what:
        courier(tf, C, P)
    if 'points' in what:
        points_sheet(tf, C, P)
    if 'bank' in what:
        bank(tf, C, P)
    if 'before' in what:
        before_after(tf, C, P)
    if 'dirs' in what:
        dirs_sheet(tf, C, P)
    if 'gifs' in what:
        anim_gifs(tf, C, P)


if __name__ == '__main__':
    main()
