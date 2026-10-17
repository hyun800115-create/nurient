"""
gbf_preview.py - human previews of the geumbangfolk fragment (assets/townfolk + assets/officefolk + assets/geumbangfolk,
the v4.3 merge) via the reference compositor tools/geumbangfolk_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/gbf_preview.py [lineup anims gifs dirs points carry v4 before phone]   # -> docs/previews/

  gbf_lineup.png          the 7 crew presets (labels ko / en): idle S, walk SE, the signature anim, idle N, + idle SE at
                          phone zoom 0.6 (0.975 device px per world px) and 1.0 (1.625)
  gbf_anims.png           contact sheet: the 6 crew anims (rows) on the 7 presets (columns), the game-drawn parcels in
                          place (hand_parcel / scan / tape_box); a fallback is labelled
  gbf_<anim>.gif          each crew anim in every dir incl. the mirrored ones (SW / W / NW), 3 presets, real fps, the
                          game-drawn parcels / bell flash / scanner beam where the manifest says
  gbf_dirs_<preset>.png   every crew anim x dir x frame on one preset (review sheet)
  gbf_points.png          every point drawn on its frames: boxPoint (centre + bottom), handPoint, bellPoint, beamPoint
                          (window -> target), tapePoint, and the static hub parcels (boxPoint.scan / .tape_box)
  gbf_carry_noitems.gif   carry_parcel {noItems} in 8 dirs with the game's own gb_parcel_m at boxPoint (depth rule:
                          over the doll in S / SE / E (+ mirrors), under it in NE / N / NW) + the walk feet
  gbf_v4.png              the jacket / vest / cap in the v4 anims (idle / walk / talk / wave / happy)
  gbf_before_after.png    BEFORE: the plan's fallback courier (townfolk code preset: gold top_puffer, navy hat_cap,
                          acc_mailbag, det_hivis) and officefolk's depot_worker; AFTER: the 금방 crew - at 1x and at
                          0.3 scale (the far zoom), with the brand metrics
  gbf_phone_details.png   crops of the Phaser phone captures (tools/test/geumbangfolk_phaser.mjs) at device pixels
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

import geumbangfolk_compose as gbc            # noqa: E402
import tf_preview as tpv                       # noqa: E402
import gbf_presets as gpr                      # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
ASSETS = os.path.join(GAME, 'assets')
SNOW = (238, 243, 249, 255)
INK = (43, 47, 58, 255)
SUB = (96, 102, 116, 255)
RED = (214, 52, 52, 255)
BLUE = (40, 110, 220, 255)
GREEN = (30, 150, 70, 255)
font = tpv.font
CREW = ['carry_parcel', 'ring_doorbell', 'hand_parcel', 'scan', 'sort_parcel', 'tape_box']
V4 = ['idle', 'walk', 'talk', 'wave', 'happy']
PRESETS = gpr.PRESET_ORDER
PRIMARY = {'carry_parcel': 'SE', 'ring_doorbell': 'NE', 'hand_parcel': 'SE', 'scan': 'SE', 'sort_parcel': 'SE',
           'tape_box': 'SE'}
MIRROR = {'SE': 'SW', 'E': 'W', 'NE': 'NW'}
CROP = (14, 0, 114, 120)          # 100 x 120 around the anchor (64, 104)
AX, AY = 64, 104
PX_PER_M = 55.43                  # px per metre of height (PPU 64, 2:1 iso)


class Cache:
    def __init__(self, tf):
        self.tf = tf
        self.c = {}

    def img(self, p, anim, d, i, key, face=None, no_items=False):
        k = (key, anim, d, i, face, no_items)
        if k not in self.c:
            self.c[k] = self.tf.compose(p, anim, d, i, face=face, no_items=no_items)
        return self.c[k]


class GbSprites:
    """gb_parcel_* / gb_parcel_doorstep from assets/geumbang (the vehicles / buildings job's atlas, read only)"""

    def __init__(self):
        mp = os.path.join(ASSETS, 'geumbang', 'manifest.json')
        self.man = json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else None
        self.sheets, self.c = {}, {}

    def get(self, key, scale=1.0):
        if self.man is None:
            return None
        k = (key, scale)
        if k in self.c:
            return self.c[k]
        sp = self.man['sprites'][key]
        at = next(a for a in self.man['atlases'] if a['key'] == sp['atlas'])
        if at['key'] not in self.sheets:
            self.sheets[at['key']] = (Image.open(os.path.join(ASSETS, at['png'])).convert('RGBA'),
                                      json.load(open(os.path.join(ASSETS, at['json']))))
        sheet, js = self.sheets[at['key']]
        f = js['frames'][sp['frame']]
        r, s, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
        im = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        im.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
        if scale != 1.0:
            im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
        self.c[k] = (im, sp)
        return self.c[k]


def text(dr, xy, s, sz=12, fill=INK, anchor='la'):
    dr.text(xy, s, font=font(sz), fill=fill, anchor=anchor)


def save_gif(frames, path, fps):
    pal = [f.convert('RGB').quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
           for f in frames]
    pal[0].save(path, save_all=True, append_images=pal[1:], duration=int(round(1000 / fps)), loop=0, disposal=1)
    print(' ', os.path.relpath(path, GAME), f'{len(frames)} frames {os.path.getsize(path) / 1024:.0f} KB')


def people(tf):
    return {pr: tf.preset(pr, seed=21 + k) for k, pr in enumerate(PRESETS)}


def parcel_scale(sp, metres):
    return metres * PX_PER_M / float(sp['topPx'])


def compose_z(tf, p, anim, d, i, zmin, zmax):
    """the frame composed from the layers with zmin <= z < zmax only (the compositor's own compose: head offsets,
    tints, scale_x), to slip a game-drawn prop between the body and the arms"""
    orig = tf.layers
    tf.layers = lambda *a, **k: [L for L in orig(*a, **k) if zmin <= L[0] < zmax]
    try:
        return tf.compose(p, anim, d, i)
    finally:
        del tf.layers


def game_items(tf, G, p, anim, d, i, frame):
    """the 128 x 128 frame (non-mirrored dir d) with the game-drawn props of the crew anims composed the way the
    manifest says: the hub parcel (boxPoint.scan / .tape_box) at the worker's depth + 0.005 (z 50: over the body,
    under the head / arms / held item), the real parcel between the palms in hand_parcel frames 0-2."""
    if anim in ('scan', 'tape_box'):
        q = tf.parcel_point(p, anim, d, i)
        key = 'gb_parcel_s' if anim == 'scan' else 'gb_parcel_m'
        g = G.get(key, 1.0)
        if not (q and g):
            return frame
        sp = g[1]
        im = G.get(key, parcel_scale(sp, 0.14 if anim == 'scan' else 0.20))[0]
        ax, ay = sp['anchor'][0] * im.width, sp['anchor'][1] * im.height
        out = compose_z(tf, p, anim, d, i, -1e9, 50)
        out.alpha_composite(im, (int(round(AX + q[2] - ax)), int(round(AY + q[3] - ay))))
        out.alpha_composite(compose_z(tf, p, anim, d, i, 50, 1e9))
        return out
    if anim == 'hand_parcel' and i <= 2:
        q = tf.hand_point_of(p, anim, d, i)
        g = G.get('gb_parcel_s', 0.55)
        out = frame.copy()
        if q and g:
            im = g[0]
            out.alpha_composite(im, (int(round(AX + q[0] - im.width / 2)), int(round(AY + q[1] - im.height / 2))))
        return out
    return frame


def put(canvas, fr, x, y, scale=1.0):
    """paste a 128 x 128 frame with its anchor (64, 104) at (x, y)"""
    if scale != 1:
        fr = fr.resize((round(128 * scale), round(128 * scale)), Image.NEAREST if scale >= 1 else Image.LANCZOS)
    canvas.alpha_composite(fr, (int(round(x - AX * scale)), int(round(y - AY * scale))))


def shadow(img, x, y, w, h, a=55):
    sh = Image.new('RGBA', (w * 2 + 4, h * 2 + 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(80, 100, 130, a))
    img.alpha_composite(sh, (int(x - w - 2), int(y - h - 2)))


def full_frame(tf, C, G, p, key, anim, d, i, no_items=False):
    """the composed frame incl. the game-drawn hub / hand parcels (mirrored dirs flipped by the compositor)"""
    fr = C.img(p, anim, d, i, key, no_items=no_items)
    if anim in ('scan', 'tape_box', 'hand_parcel') and G.man is not None:
        rd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d)
        base = C.img(p, anim, rd, i, key, no_items=no_items) if rd != d else fr
        img = game_items(tf, G, p, anim, rd, i, base)
        return img.transpose(Image.FLIP_LEFT_RIGHT) if rd != d else img
    return fr


# --------------------------------------------------------------------------- sheets

def lineup(tf, C, G, P):
    cols = len(PRESETS)
    cw, sc = 150, 1.5
    rows = [('idle', 'S', 0), ('walk', 'SE', 2), None, ('idle', 'N', 0)]
    W, H = 20 + cols * cw, 70 + 4 * 190 + 150 + 230 + 30
    can = Image.new('RGBA', (W, H), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (14, 10), '금방 crew (geumbangfolk, CONTRACT_GEUMBANG AP) - 7 presets: idle S / walk SE / signature / '
                       'idle N, then idle SE at phone zoom 0.6 and 1.0 (device px)', 15)
    for c, pr in enumerate(PRESETS):
        p = P[pr]
        lab = gpr.PRESETS5[pr]['label']
        x = 20 + c * cw + cw // 2
        text(dr, (x, 36), pr, 12, anchor='ma')
        text(dr, (x, 52), lab['ko'].split(' (')[0], 11, SUB, anchor='ma')
        for r, spec in enumerate(rows):
            if spec is None:
                a = gpr.SIGNATURE[pr][0]
                a2, _ = tf.pick_anim(p, a)
                inf = tf.T['anims'][a2]
                spec = (a2, PRIMARY.get(a2, 'SE') if PRIMARY.get(a2, 'SE') in inf['dirs'] else inf['dirs'][0],
                        inf.get('impactFrame') or 2)
            a, d, i = spec
            y = 70 + r * 190 + 170
            shadow(can, x, y, 26, 8)
            put(can, full_frame(tf, C, G, p, pr, a, d, i), x, y, sc)
            text(dr, (x, y + 6), f'{a} {d} {i}', 10, SUB, anchor='ma')
        for k, (z, dev) in enumerate(((0.6, 0.975), (1.0, 1.625))):
            y = 70 + 4 * 190 + (130 if k == 0 else 150 + 210)
            put(can, C.img(p, 'idle', 'SE', 0, pr), x, y, dev)
            if c == 0:
                text(dr, (8, y - int(108 * dev) - 4), f'phone zoom {z} ({dev} device px / world px)', 11, SUB)
    can.save(os.path.join(PREV, 'gbf_lineup.png'))
    print('  docs/previews/gbf_lineup.png')


def anims_sheet(tf, C, G, P):
    cw, rh, sc = 140, 175, 1.4
    can = Image.new('RGBA', (150 + len(PRESETS) * cw, 50 + len(CREW) * rh), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 10), 'the 6 crew anims (rows) on the 7 presets - impact / mid frame in the primary dir; game-drawn '
                       'parcels (hand_parcel / scan / tape_box) composed per the manifest', 14)
    for c, pr in enumerate(PRESETS):
        text(dr, (150 + c * cw + cw // 2, 32), pr, 11, anchor='ma')
    for r, a in enumerate(CREW):
        y0 = 50 + r * rh
        text(dr, (10, y0 + 60), a, 13)
        inf = tf.T['anims'][a]
        text(dr, (10, y0 + 78), f'{inf["frames"]} f {inf["fps"]} fps {"once" if inf["repeat"] == 0 else "loop"}', 10,
             SUB)
        for c, pr in enumerate(PRESETS):
            p = P[pr]
            pick, face = tf.pick_anim(p, a)
            pinf = tf.T['anims'][pick]
            d = PRIMARY[a] if PRIMARY[a] in pinf['dirs'] else pinf['dirs'][0]
            i = (inf.get('impactFrame') or 2) if pick == a else 1
            x, y = 150 + c * cw + cw // 2, y0 + rh - 22
            shadow(can, x, y, 24, 7)
            put(can, full_frame(tf, C, G, p, pr, pick, d, i), x, y, sc)
            if pick != a:
                text(dr, (x, y + 4), f'-> {pick}', 10, RED, anchor='ma')
    can.save(os.path.join(PREV, 'gbf_anims.png'))
    print('  docs/previews/gbf_anims.png')


GIF_PEOPLE = {'carry_parcel': ['gb_driver', 'gb_sorter', 'gb_rider'],
              'ring_doorbell': ['gb_driver', 'gb_rider', 'gb_night'],
              'hand_parcel': ['gb_driver', 'gb_dispatcher', 'gb_night'],
              'scan': ['gb_dispatcher', 'gb_sorter', 'gb_packer'],
              'sort_parcel': ['gb_picker', 'gb_sorter', 'gb_packer'],
              'tape_box': ['gb_packer', 'gb_picker', 'gb_sorter']}


def anim_gifs(tf, C, G, P, only=None):
    for a in CREW:
        if only and a not in only:
            continue
        inf = tf.T['anims'][a]
        dirs = list(inf['dirs']) + [MIRROR[d] for d in inf['dirs'] if d in MIRROR]
        prs = GIF_PEOPLE[a]
        cw, rh, sc = 120, 150, 1.25
        frames = []
        for i in range(inf['frames']):
            can = Image.new('RGBA', (90 + len(dirs) * cw, 40 + len(prs) * rh), SNOW)
            dr = ImageDraw.Draw(can)
            imp = inf.get('impactFrame')
            text(dr, (8, 8), f'{a}  frame {i}/{inf["frames"]}  {inf["fps"]} fps'
                             f'{"  IMPACT" if imp is not None and i in (imp,) else ""}', 13,
                 RED if imp is not None and i == imp else INK)
            for c, d in enumerate(dirs):
                text(dr, (90 + c * cw + cw // 2, 26), d, 11, SUB, anchor='ma')
            for r, pr in enumerate(prs):
                text(dr, (6, 40 + r * rh + 60), pr, 11)
                p = P[pr]
                for c, d in enumerate(dirs):
                    x, y = 90 + c * cw + cw // 2, 40 + r * rh + rh - 18
                    shadow(can, x, y, 22, 7)
                    put(can, full_frame(tf, C, G, p, pr, a, d, i), x, y, sc)
                    if a == 'ring_doorbell' and imp is not None and i in (imp, imp + 1):
                        q = tf.bell_point(p, d, i)
                        if q:
                            bx, by = x + q[0] * sc, y + q[1] * sc
                            dr.ellipse([bx - 5, by - 5, bx + 5, by + 5], outline=(242, 179, 61, 255), width=2)
                    if a == 'scan' and imp is not None and i == imp:
                        q = tf.beam_point(p, d, i)
                        if q:
                            dr.line([x + q[0] * sc, y + q[1] * sc, x + q[2] * sc, y + q[3] * sc], fill=(255, 80, 70, 255),
                                    width=2)
            frames.append(can)
        if inf['repeat'] == 0:
            frames += [frames[-1]] * 4                       # once anims hold the last frame
        save_gif(frames, os.path.join(PREV, f'gbf_{a}.gif'), inf['fps'])


def dirs_sheet(tf, C, G, P, pr='gb_driver'):
    p = P[pr]
    rows = [(a, d) for a in CREW for d in tf.T['anims'][a]['dirs']]
    cw, rh = 104, 124
    can = Image.new('RGBA', (130 + 8 * cw, 40 + len(rows) * rh), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (8, 8), f'{pr}: every crew anim x dir x frame (1x)', 14)
    for r, (a, d) in enumerate(rows):
        y0 = 40 + r * rh
        pick, _ = tf.pick_anim(p, a)
        text(dr, (6, y0 + 50), f'{a} {d}' + (f' -> {pick}' if pick != a else ''), 11)
        for i in range(tf.T['anims'][pick]['frames']):
            put(can, full_frame(tf, C, G, p, pr, pick, d, i).crop((0, 0, 128, 128)), 130 + i * cw + 50, y0 + 108)
    can.save(os.path.join(PREV, f'gbf_dirs_{pr}.png'))
    print(f'  docs/previews/gbf_dirs_{pr}.png')


def cross(dr, x, y, c=RED, r=4):
    dr.line([x - r, y, x + r, y], fill=c, width=1)
    dr.line([x, y - r, x, y + r], fill=c, width=1)


def points_sheet(tf, C, G, P):
    rows = [('gb_driver', 'carry_parcel', 'SE', range(0, 8), 'boxPoint: centre (red) + bottom (blue)'),
            ('gb_driver', 'carry_parcel', 'NE', range(0, 8), 'boxPoint NE (parcel behind the doll)'),
            ('gb_rider', 'ring_doorbell', 'NE', range(6), 'boxPoint (red / blue) + bellPoint (green, frames 2-3)'),
            ('gb_driver', 'hand_parcel', 'SE', range(6), 'handPoint (red): the real parcel between the palms on 0-2'),
            ('gb_dispatcher', 'scan', 'SE', range(4), 'beamPoint window -> target (red line) + the counter parcel'),
            ('gb_picker', 'sort_parcel', 'SE', range(6), 'handPoint (red), parcel in hand on frames 1-4'),
            ('gb_packer', 'tape_box', 'SE', range(6), 'tapePoint (red) on the box top; boxPoint.tape_box (blue)')]
    sc = 2
    cw, rh = 100 * sc, 120 * sc + 30
    can = Image.new('RGBA', (20 + 8 * cw, 40 + len(rows) * rh), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 8), 'points on their frames (2x; px from the anchor; mirrored dirs negate x)', 15)
    for r, (pr, a, d, idx, lab) in enumerate(rows):
        p = P[pr]
        y0 = 36 + r * rh
        text(dr, (10, y0), f'{pr} {a} {d}: {lab}', 12)
        for c, i in enumerate(idx):
            fr = full_frame(tf, C, G, p, pr, a, d, i, no_items=False).crop(CROP).resize((100 * sc, 120 * sc),
                                                                                       Image.NEAREST)
            x0, y1 = 10 + c * cw, y0 + 18
            can.alpha_composite(fr, (x0, y1))
            ox, oy = x0 + (AX - CROP[0]) * sc, y1 + (AY - CROP[1]) * sc
            cross(dr, ox, oy, (120, 120, 120, 255), 3)
            if a in ('carry_parcel', 'ring_doorbell', 'tape_box', 'scan'):
                q = tf.parcel_point(p, a, d, i)
                if q:
                    if a in ('carry_parcel', 'ring_doorbell'):
                        cross(dr, ox + q[0] * sc, oy + q[1] * sc, RED)
                    cross(dr, ox + q[2] * sc, oy + q[3] * sc, BLUE)
            if a in ('hand_parcel', 'sort_parcel'):
                q = tf.hand_point_of(p, a, d, i)
                if q:
                    cross(dr, ox + q[0] * sc, oy + q[1] * sc, RED)
            if a == 'ring_doorbell':
                q = tf.bell_point(p, d, i)
                if q and i in (2, 3):
                    cross(dr, ox + q[0] * sc, oy + q[1] * sc, GREEN, 5)
            if a == 'scan':
                q = tf.beam_point(p, d, i)
                if q:
                    dr.line([ox + q[0] * sc, oy + q[1] * sc, ox + q[2] * sc, oy + q[3] * sc], fill=RED, width=1)
            if a == 'tape_box':
                q = tf.tape_point(p, d, i)
                if q:
                    cross(dr, ox + q[0] * sc, oy + q[1] * sc, RED)
    can.save(os.path.join(PREV, 'gbf_points.png'))
    print('  docs/previews/gbf_points.png')


def carry_noitems(tf, C, G, P):
    """carry_parcel {noItems} + the game's gb_parcel_m at boxPoint in 8 dirs (depth rule) - real fps"""
    p = P['gb_driver']
    dirs = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
    g = G.get('gb_parcel_m', 1.0)
    if g is None:
        return
    sp = g[1]
    im = G.get('gb_parcel_m', sp['carryScale'])[0]
    ax, ay = sp['anchor'][0] * im.width, sp['anchor'][1] * im.height
    sc = 1.5
    frames = []
    for i in range(8):
        can = Image.new('RGBA', (20 + 8 * 130, 210), SNOW)
        dr = ImageDraw.Draw(can)
        text(dr, (8, 6), f'carry_parcel {{noItems}} + the game\'s gb_parcel_m (carryScale {sp["carryScale"]}) at '
                         f'boxPoint: depth +0.0045 (over the body, under the arms) in S / SE / E (+ mirrors), -0.0001 '
                         f'in NE / N / NW   frame {i}', 12)
        for c, d in enumerate(dirs):
            x, y = 20 + c * 130 + 60, 180
            rd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d)
            q = tf.parcel_point(p, 'carry_parcel', rd, i)
            par = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
            if q:
                par.alpha_composite(im, (int(round(AX + q[2] - ax)), int(round(AY + q[3] - ay))))
            # depth rule: + 0.0045 (z 45: over the body, under the arms / mittens) in S / SE / E, - 0.0001 (under
            # everything) in NE / N
            if rd in ('NE', 'N'):
                lay = par
                lay.alpha_composite(C.img(p, 'carry_parcel', rd, i, 'drv', no_items=True))
            else:
                orig = tf.layers
                tf.layers = lambda *a_, **k_: [L for L in orig(*a_, **k_) if L[0] < 45]
                try:
                    lay = tf.compose(p, 'carry_parcel', rd, i, no_items=True)
                    tf.layers = lambda *a_, **k_: [L for L in orig(*a_, **k_) if L[0] >= 45]
                    hi = tf.compose(p, 'carry_parcel', rd, i, no_items=True)
                finally:
                    del tf.layers
                lay.alpha_composite(par)
                lay.alpha_composite(hi)
            if rd != d:
                lay = lay.transpose(Image.FLIP_LEFT_RIGHT)
            shadow(can, x, y, 24, 7)
            put(can, lay, x, y, sc)
            text(dr, (x, y + 8), d, 11, SUB, anchor='ma')
        frames.append(can)
    save_gif(frames, os.path.join(PREV, 'gbf_carry_noitems.gif'), tf.T['anims']['carry_parcel']['fps'])


def v4_sheet(tf, C, G, P):
    prs = ['gb_driver', 'gb_picker', 'gb_packer', 'gb_rider', 'gb_night']
    specs = [(a, d) for a in V4 for d in (('SE', 'N') if a in ('idle', 'walk') else ('SE',))]
    cw, rh, sc = 110, 150, 1.25
    can = Image.new('RGBA', (110 + len(specs) * cw, 40 + len(prs) * rh), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (8, 8), 'the uniform in the townfolk v4 anims (jacket / vest frames rendered for idle, walk, talk, wave, '
                     'happy; the cap on all 20 head frames)', 13)
    for c, (a, d) in enumerate(specs):
        text(dr, (110 + c * cw + cw // 2, 26), f'{a} {d}', 10, SUB, anchor='ma')
    for r, pr in enumerate(prs):
        p = P[pr]
        text(dr, (6, 40 + r * rh + 60), pr, 11)
        for c, (a, d) in enumerate(specs):
            x, y = 110 + c * cw + cw // 2, 40 + r * rh + rh - 18
            shadow(can, x, y, 22, 7)
            put(can, C.img(p, a, d, 2 if a != 'idle' else 0, pr), x, y, sc)
    can.save(os.path.join(PREV, 'gbf_v4.png'))
    print('  docs/previews/gbf_v4.png')


def before_after(tf, C, G, P):
    """BEFORE: the plan's fallback courier (townfolk code preset) + officefolk's depot_worker; AFTER: the 금방 crew"""
    import gbf_check as ck
    drv = P['gb_driver']
    before = dict(drv)
    before['parts'] = [x for x in drv['parts'] if not x.startswith(('top_', 'hat_'))] + \
        ['top_puffer', 'hat_cap', 'acc_mailbag', 'det_hivis']
    before['colors'] = dict(drv['colors'], top='#F2B33D', hat='#2B4F7E', hat2='#2B4F7E', acc='#D8F040',
                            bag='#8A5A3A')
    before['parts'] = [x for x in before['parts'] if x in tf.T['parts']]
    dws = [tf.preset('depot_worker', seed=s) for s in (1, 2)] if 'depot_worker' in tf.T['generator']['presets'] else []
    left = [('fallback courier\n(code preset, plan)', before)] + [(f'depot_worker\n(officefolk) #{k + 1}', p)
                                                                 for k, p in enumerate(dws)]
    right = [(pr, P[pr]) for pr in PRESETS]
    cols = left + [None] + right
    cw = 110
    can = Image.new('RGBA', (20 + len(cols) * cw, 470), SNOW)
    dr = ImageDraw.Draw(can)
    text(dr, (10, 8), 'BEFORE (left): the plan\'s fallback courier and the depot workers  |  AFTER (right): the 금방 '
                      'crew - 1.3x, then 0.3 scale (the far zoom) x3 nearest', 13)
    for c, item in enumerate(cols):
        if item is None:
            dr.line([20 + c * cw + cw // 2, 40, 20 + c * cw + cw // 2, 460], fill=(150, 160, 175, 255), width=2)
            continue
        lab, p = item
        x = 20 + c * cw + cw // 2
        for k, s in enumerate(lab.split('\n')):
            text(dr, (x, 34 + 13 * k), s, 10, anchor='ma')
        fr = tf.compose(p, 'idle', 'SE', 0)
        shadow(can, x, 230, 24, 7)
        put(can, fr, x, 230, 1.3)
        a = np.asarray(fr)
        ns = ck.navy_share(fr)
        text(dr, (x, 240), f'navy {100 * ns:.0f}%', 10, SUB, anchor='ma')
        small = fr.resize((38, 38), Image.LANCZOS).resize((114, 114), Image.NEAREST)
        can.alpha_composite(small, (x - 57, 300))
        del a
    can.save(os.path.join(PREV, 'gbf_before_after.png'))
    print('  docs/previews/gbf_before_after.png')


def phone_details():
    """crops of the Phaser phone captures at device pixels (1170 x 2532 = 390 x 844 @ DPR 3)"""
    shots = [('gbf_phone_z12.png', (0, 850, 620, 1250), 'z 1.2: the clerk (scan, lifted onto the counter step)'),
             ('gbf_phone_z12.png', (560, 850, 1170, 1450), 'z 1.2: packers (tape_box) + pickers (sort_parcel)'),
             ('gbf_phone_z10.png', (0, 1500, 1170, 2150), 'z 1.0: the doorstep (ring_doorbell NE at the door, hand_parcel)'),
             ('gbf_phone_z06.png', (150, 1580, 1000, 2080), 'z 0.6: the crew row + officefolk depot_worker + townsfolk'),
             ('gbf_phone_night.png', (0, 1300, 1170, 2150), 'night (MULTIPLY tint + ADD glows): doorstep + crew'),
             ('gbf_phone_road.png', (0, 1300, 1170, 1800), 'road page only: hub anims fall back to idle, couriers work')]
    tiles = []
    for f, box, lab in shots:
        p = os.path.join(PREV, f)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA').crop(box)
        im.thumbnail((900, 700))
        tiles.append((im, lab))
    if not tiles:
        print('  (phone details skipped: run tools/test/geumbangfolk_phaser.mjs first)')
        return
    W = max(t[0].width for t in tiles) + 20
    H = sum(t[0].height + 30 for t in tiles) + 20
    can = Image.new('RGBA', (W, H), SNOW)
    dr = ImageDraw.Draw(can)
    y = 10
    for im, lab in tiles:
        text(dr, (10, y), lab, 14)
        can.alpha_composite(im, (10, y + 22))
        y += im.height + 30
    can.save(os.path.join(PREV, 'gbf_phone_details.png'))
    print('  docs/previews/gbf_phone_details.png')


def main():
    what = set(sys.argv[1:]) or {'lineup', 'anims', 'gifs', 'dirs', 'points', 'carry', 'v4', 'before', 'phone'}
    os.makedirs(PREV, exist_ok=True)
    tf = gbc.Geumbangfolk.from_assets(fragments=['officefolk', 'geumbangfolk'])
    C = Cache(tf)
    G = GbSprites()
    P = people(tf)
    for pr, p in P.items():
        print(pr, p['base'], ','.join(p['parts']))
    if 'lineup' in what:
        lineup(tf, C, G, P)
    if 'anims' in what:
        anims_sheet(tf, C, G, P)
    if 'points' in what:
        points_sheet(tf, C, G, P)
    if 'carry' in what:
        carry_noitems(tf, C, G, P)
    if 'v4' in what:
        v4_sheet(tf, C, G, P)
    if 'before' in what:
        before_after(tf, C, G, P)
    if 'dirs' in what:
        dirs_sheet(tf, C, G, P)
    if 'gifs' in what:
        anim_gifs(tf, C, G, P)
    if 'phone' in what:
        phone_details()


if __name__ == '__main__':
    main()
