"""
gen_ui3.py - CONTRACT_V5 §O mission & fame UI for Frost Village, procedurally in the house "soft toy" style of
assets/ui (fxlib.toy: dark tinted outline, top->bottom gradient lit by a rounded bevel from the shared upper-left sun,
gloss band, ONE soft navy drop shadow per icon).  No text is baked - the game renders all text.

Re-run (from anywhere; ~1-2 min):
    python3 frost-village/tools/fx/gen_ui3.py                     # atlas + 9-slices + manifest + preview
    python3 frost-village/tools/fx/gen_ui3.py --only ui_icon_ring,ui_badge_rank_5   # scratch -> tools/fx/_cache/ui3/
Check:  python3 frost-village/tools/fx/check_ui3.py
Outputs:
    assets/ui3/ui3_icons.png/.json   trimmed Phaser JSON-hash atlas: 17 icons (96x96) + 5 rank badges (128x128)
    assets/ui3/<9-slice>.png         ui_mission_card, ui_mission_card_done, ui_mission_board, ui_progress_bg,
                                     ui_progress_fill (plain images, margins in manifest.nineSlice)
    assets/ui3/manifest.json
    docs/previews/ui3_sheet.png
Imports fxlib.py, gen_ui.py, ui2_art.py, emote_art.py and pack_utils READ-ONLY; nothing else is touched.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import fxlib as F                                       # noqa: E402
from fxlib import hexc, toy, stroke                     # noqa: E402
import emote_art as EA                                  # noqa: E402
import pack_utils                                       # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'ui3')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.path.join(HERE, '_cache', 'ui3')
ATLAS = 'ui3_icons'
WHITE = hexc('#FFFFFF')
U = F.union

# soft-toy palettes (top, bottom, outline) - same families as gen_ui / ui2_art / emote_art
GOLD = ('#FFF0A0', '#F5A623', '#8E520A')
RED = ('#FF8E7E', '#DE3B2F', '#7E1A16')
BLUE = ('#94D2FF', '#2F78D6', '#143B74')
GREEN = ('#9BEA8E', '#3FAE4C', '#1F5E2A')
PINK = ('#FFA0BC', '#E8336A', '#8E1238')
PURPLE = ('#D9BBFF', '#7C4FE0', '#35206E')
SILVER = ('#FFFFFF', '#C8D3E3', '#34425C')
STEEL = ('#F4F7FB', '#8E96A3', '#3E4756')
WOOD = ('#E0A867', '#A8703E', '#4E2E16')
WOOD_D = ('#C98F55', '#8A5A33', '#3C2414')
PAPER = ('#FFFFFF', '#F4E9D2', '#8A6A44')
CREAM = ('#FFFDF6', '#F6EBD5', '#8A6A44')
NAVY = ('#5C6B8A', '#2E3A54', '#141B2C')
SKIN = ('#FFE6CF', '#F2B48C', '#8E4A2A')
MINT = ('#D8F7E6', '#7FD3A6', '#2E7A54')
LAV = ('#EADDFF', '#A68AE0', '#4A2E7E')
TINT = {'gold': '#D0701A', 'red': '#A0201A', 'blue': '#2A55B0', 'green': '#2E7A3A', 'pink': '#B0204E',
        'purple': '#5A30B0', 'silver': '#7F93B5', 'wood': '#7A4420', 'paper': '#B8986A', 'navy': '#1E2840'}


def shadow(c, d, opacity=0.32, dy=3.0, sigma=2.2, ow=3.0):
    c.shadow(c.cov(d - ow), dy=dy, sigma=sigma, opacity=opacity)


def part(c, d, pal, ow=3.0, bevel=6.0, gloss=0.3, hi=0.5, lo=0.45, tint=None, **kw):
    top, bot, line = pal
    return toy(c, d, top, bot, line if ow else None, ow=ow, bevel=bevel, gloss=gloss, shadow=0, hi=hi, lo=lo,
               tint_lo=None if tint is None else hexc(TINT.get(tint, tint)), **kw)


def rot(c, x, y, deg):
    return F.rot(c.X, c.Y, x, y, math.radians(deg))


def star(c, x, y, ro, ri, n=5, rot_deg=-90, round_=1.5):
    return F.sd_star(c.X, c.Y, x, y, ro, ri, n, rot=math.radians(rot_deg), round_=round_)


# =========================================================================== icons (96 x 96)
def icon_mission():
    """Mission: wooden clipboard with a silver clip and a checklist (two rows ticked, one open)."""
    c = F.Canvas(96, 96)
    board = F.sd_box(c.X, c.Y, 48, 53, 30, 38, 8)
    paper = F.sd_box(c.X, c.Y, 48, 57, 23, 29, 3)
    clip = F.sd_box(c.X, c.Y, 48, 19, 15, 7, 3.5)
    loop = np.abs(F.sd_circle(c.X, c.Y, 48, 11, 6.0)) - 2.4
    clipall = U(clip, F.intersect(loop, c.Y - 13))
    shadow(c, U(board, clipall))
    part(c, board, WOOD, bevel=6, gloss=0.2, tint='wood')
    c.shadow(c.cov(paper), dy=1.5, sigma=1.0, opacity=0.25)
    part(c, paper, PAPER, ow=1.6, bevel=3, gloss=0.0, hi=0.4, lo=0.25, tint='paper')
    for k, y in enumerate((42, 58, 74)):
        box = F.sd_box(c.X, c.Y, 35, y, 5.2, 5.2, 1.6)
        c.fill(box - 1.4, hexc('#8A6A44'))
        c.fill(box, hexc('#FFFDF6'))
        line = F.sd_box(c.X, c.Y, 55, y, 12, 2.0, 2.0)
        c.fill(line, hexc('#C9B48E'))
        if k < 2:
            tick = F.sd_polyline(c.X, c.Y, [(30.5, y - 1), (34.5, y + 3.5), (42, y - 6)], 2.6)
            part(c, tick, GREEN, ow=1.6, bevel=1.6, gloss=0.2)
    part(c, clipall, STEEL, ow=2.6, bevel=3.5, gloss=0.35, spec=0.3, tint='silver')
    c.fill(F.sd_box(c.X, c.Y, 48, 21, 9, 1.4, 0.7), hexc('#7C889C'), 0.8)
    return c.image()


def icon_fame():
    """Fame point: gold star medal on a red/gold neck ribbon."""
    c = F.Canvas(96, 96)
    sl = F.sd_polygon(c.X, c.Y, [(19, 7), (34, 7), (54, 46), (40, 50)]) - 1.4
    sr = F.sd_polygon(c.X, c.Y, [(62, 7), (77, 7), (56, 50), (42, 46)]) - 1.4
    medal = F.sd_circle(c.X, c.Y, 48, 61, 27)
    shadow(c, U(sl, sr, medal))
    for s, x0 in ((sl, 26), (sr, 70)):
        part(c, s, ('#FF7A6A', '#C9362C', '#5A1410'), ow=2.4, bevel=3, gloss=0.15, tint='red')
    # gold centre stripe on each strap
    c.fill(F.intersect(F.sd_segment(c.X, c.Y, 26.5, 4, 47, 48, 2.2), sl + 1.0), hexc('#FFD45A'), 0.95)
    c.fill(F.intersect(F.sd_segment(c.X, c.Y, 69.5, 4, 49, 48, 2.2), sr + 1.0), hexc('#FFD45A'), 0.95)
    part(c, medal, GOLD, ow=3.2, bevel=7, gloss=0.0, hi=0.6, lo=0.5, tint='gold')
    inner = F.sd_circle(c.X, c.Y, 48, 61, 20)
    n = F.bevel_normals(-inner, 3, c.px)
    n[..., 0] *= -1
    n[..., 1] *= -1
    t = np.clip((c.Y - 41) / 40, 0, 1)
    c.paint(c.cov(inner), F.shade(F.mix(hexc('#FFD86A'), hexc('#F2B53A'), t), F.lambert(n) * 0.8, 0.5, 0.5))
    st = star(c, 48, 62, 16.5, 7.4, round_=2.0)
    c.shadow(c.cov(st), dx=1.0, dy=1.4, sigma=1.0, color='#8A5A12', opacity=0.45)
    part(c, st, ('#FFF6C8', '#F5B83A', '#9A5A0E'), ow=1.4, bevel=3.5, gloss=0.0, hi=0.75, lo=0.55)
    EA.twinkle(c, 24, 44, 7.5, edge='#8E520A')
    EA.glossy_spot(c, 34, 46, 5.5, 2.6, -40, 0.7, 0.8)
    return c.image()


def icon_title():
    """Title: gold crown with pearls and gems above a red ribbon banner."""
    c = F.Canvas(96, 96)
    body = F.sd_polygon(c.X, c.Y, [(19, 58), (16, 26), (34, 40), (48, 20), (62, 40), (80, 26), (77, 58)]) - 2.5
    band = F.sd_box(c.X, c.Y, 48, 58, 30, 7.5, 3.5)
    balls = [(16.5, 23.5, 5.2), (48, 16.5, 5.8), (79.5, 23.5, 5.2)]
    crown = F.smin(body, band, 2.0)
    tails = U(F.sd_polygon(c.X, c.Y, [(7, 72), (22, 70), (22, 87), (7, 89), (12.5, 80.5)]) - 1.2,
              F.sd_polygon(c.X, c.Y, [(89, 72), (74, 70), (74, 87), (89, 89), (83.5, 80.5)]) - 1.2)
    banner = F.sd_polygon(c.X, c.Y, [(16, 69), (48, 73), (80, 69), (80, 85), (48, 89), (16, 85)]) - 1.6
    shadow(c, U(crown, banner, tails, *[F.sd_circle(c.X, c.Y, x, y, r) for x, y, r in balls]))
    part(c, tails, ('#D9483B', '#A12A20', '#5A1410'), ow=2.4, bevel=3, gloss=0.0, tint='red')
    part(c, crown, GOLD, ow=3.2, bevel=6, gloss=0.3, hi=0.6, lo=0.5, tint='gold')
    for x, y, r in balls:
        part(c, F.sd_circle(c.X, c.Y, x, y, r), ('#FFFFFF', '#E9DCC8', '#6B5A44'), ow=2.2, bevel=r * 0.7, gloss=0.0,
             hi=0.6, lo=0.4, spec=0.3)
    for x, pal, r in ((48, RED, 5.6), (31, BLUE, 4.2), (65, BLUE, 4.2)):
        g = F.sd_circle(c.X, c.Y, x, 58, r)
        part(c, g, pal, ow=1.6, bevel=r * 0.7, gloss=0.0, hi=0.7, lo=0.4, spec=0.5)
    gem = F.sd_polygon(c.X, c.Y, [(48, 30), (54, 38), (48, 46), (42, 38)]) - 0.6
    part(c, gem, ('#FFC0D6', '#F05C93', '#8A1E4E'), ow=1.4, bevel=2.5, gloss=0.0, hi=0.7, lo=0.4, spec=0.5)
    part(c, banner, RED, ow=2.6, bevel=3.5, gloss=0.25, tint='red')
    EA.twinkle(c, 84, 44, 6.5, edge='#8E520A')
    return c.image()


def icon_delivery():
    """Delivery: round toy-like retro truck (red cab, wooden cargo bed with crates) with speed lines."""
    c = F.Canvas(96, 96)
    cab = F.smin(F.sd_box(c.X, c.Y, 71, 52, 15, 17, 8), F.sd_box(c.X, c.Y, 76, 62, 14, 9, 7), 3)
    bed = F.sd_box(c.X, c.Y, 37, 61, 25, 7, 2.5)
    chassis = F.sd_box(c.X, c.Y, 54, 68, 38, 4.5, 3)
    crates = [(26, 45, 10, 9.5), (47, 46, 9, 8.5), (33, 28, 8.5, 8)]
    wheels = [(30, 72), (72, 72)]

    def taper(x0, x1, y, r):
        tt = np.clip((c.X - x0) / (x1 - x0), 0, 1)
        return F.sd_segment(c.X, c.Y, x0, y, x1, y, 0) - (1.3 + (r - 1.3) * tt)
    lines = U(taper(5, 13, 40, 2.6), taper(4, 12, 52, 2.8))
    allsh = U(cab, bed, chassis, *[F.sd_box(c.X, c.Y, x, y, w, h, 2.5) for x, y, w, h in crates],
              *[F.sd_circle(c.X, c.Y, x, y, 10.5) for x, y in wheels])
    shadow(c, U(allsh, lines))
    part(c, lines, SILVER, ow=2.2, bevel=2, gloss=0.0)
    part(c, chassis, NAVY, ow=2.2, bevel=2.5, gloss=0.1, tint='navy')
    for x, y, w, h in crates:
        d = F.sd_box(c.X, c.Y, x, y, w, h, 2.5)
        part(c, d, WOOD, ow=2.2, bevel=3, gloss=0.2, tint='wood')
        inner = F.sd_box(c.X, c.Y, x, y, w - 3.6, h - 3.6, 1)
        stroke(c, inner, 1.2, '#7A4A28', 0.7)
        c.fill(np.maximum(F.sd_segment(c.X, c.Y, x - w + 4, y + h - 4, x + w - 4, y - h + 4, 1.3), inner), hexc('#8A5A33'),
               0.7)
    part(c, bed, ('#5FA8E6', '#2F78D6', '#143B74'), ow=2.4, bevel=3, gloss=0.2, tint='blue')
    part(c, cab, RED, ow=3.0, bevel=7, gloss=0.35, tint='red', spec=0.15)
    win = F.sd_box(c.X, c.Y, 74, 44, 8, 7, 3.5)
    part(c, win, ('#E6F6FF', '#8CC4F0', '#245592'), ow=1.8, bevel=2.5, gloss=0.4, hi=0.6)
    c.fill(F.sd_segment(c.X, c.Y, 70, 47, 75, 41, 1.0), WHITE, 0.8)
    part(c, F.sd_circle(c.X, c.Y, 88, 60, 3.6), ('#FFF6C8', '#FFC83D', '#7A4A0E'), ow=1.4, bevel=2, gloss=0.3, hi=0.8)
    c.fill(F.sd_box(c.X, c.Y, 61, 58, 1.2, 9, 0.6), hexc('#7E1A16'), 0.5)
    for x, y in wheels:
        tire = F.sd_circle(c.X, c.Y, x, y, 10.5)
        part(c, tire, ('#5A6478', '#262C38', '#10141C'), ow=2.2, bevel=4, gloss=0.15)
        part(c, F.sd_circle(c.X, c.Y, x, y, 5.0), STEEL, ow=1.4, bevel=2.5, gloss=0.2, spec=0.3)
        c.fill(F.sd_circle(c.X, c.Y, x, y, 1.6), hexc('#5A6478'))
    return c.image()


def icon_request():
    """Resident's request: white speech bubble (tail bottom-left) with a pink heart."""
    c = F.Canvas(96, 96)
    body = F.sd_box(c.X, c.Y, 49, 42, 38, 30, 17)
    tail = F.sd_polygon(c.X, c.Y, [(22, 62), (40, 66), (16, 86)]) - 2.5
    d = F.smin(body, tail, 4)
    shadow(c, d)
    c.fill(d - 2.6, hexc('#7F90AE'))
    t = np.clip((c.Y - 12) / 70, 0, 1)
    base = F.mix(hexc('#FFFFFF'), hexc('#E9EFF8'), t)
    n = F.bevel_normals(d, 7, c.px)
    c.paint(c.cov(d), F.shade(base, F.lambert(n), 0.5, 0.25, tint_lo=hexc('#B8C6DC')))
    gl = F.sd_box(c.X, c.Y, 45, 19, 24, 4, 4)
    c.paint(c.cov(gl, 1.0) * np.clip(1 - (c.Y - 15) / 9, 0, 1), WHITE, 0.6)
    EA.heart(c, 49, 43, 37, rot_deg=-6, ow=2.4)
    EA.twinkle(c, 77, 24, 5.5, edge='#B0204E', tip='#FFA0BC')
    return c.image()


def icon_event():
    """Event: party popper (striped cone) bursting confetti, curly streamers and stars."""
    c = F.Canvas(96, 96)
    Xc, Yc = rot(c, 34, 62, 45)
    cone = F.sd_polygon(Xc, Yc, [(34, 98), (20, 44), (48, 44)]) - 2.0
    mouth = F.sd_ellipse(Xc, Yc, 34, 44, 15.5, 5.5)
    pop = F.smin(cone, mouth, 1.0)
    conf = []
    r = np.random.default_rng(7)
    cols = ['#5FA8E6', '#5CC86A', '#FF7AA2', '#FFC83D', '#B07CF0', '#FF8A5A']
    pts = [(58, 22), (72, 32), (78, 15), (63, 11), (85, 41), (50, 15), (74, 51)]
    for k, (x, y) in enumerate(pts):
        X2, Y2 = rot(c, x, y, r.uniform(-60, 60))
        conf.append((F.sd_box(X2, Y2, x, y, 4.2, 2.4, 1.0), cols[k % len(cols)]))
    s1 = F.sd_arc(c.X, c.Y, 60, 34, 10, math.radians(200), math.radians(330), 2.2)
    s2 = F.sd_arc(c.X, c.Y, 70, 22, 8, math.radians(20), math.radians(160), 2.2)
    s3 = F.sd_arc(c.X, c.Y, 46, 22, 7, math.radians(150), math.radians(300), 2.0)
    stars = [(83, 25, 6.5), (40, 11, 5.0), (86, 56, 4.5)]
    allsh = U(pop, s1, s2, s3, *[d for d, _ in conf], *[star(c, x, y, s, s * 0.45) for x, y, s in stars])
    shadow(c, allsh)
    # cone with diagonal stripes (perpendicular to its axis)
    part(c, pop, ('#FFE98C', '#F5A623', '#7A3A0E'), ow=3.0, bevel=5, gloss=0.25, tint='gold')
    stripes = (np.mod(Yc - 44, 14) < 6.5).astype(np.float32) * (Yc > 47)
    c.paint(c.cov(cone + 1.2) * stripes, hexc('#E8473B'), 0.95)
    c.fill(F.sd_ellipse(Xc, Yc, 34, 44, 11.5, 3.2), hexc('#5A2A10'))
    for d, col in conf:
        top = '#' + ''.join('%02X' % min(255, int(int(col[i:i + 2], 16) * 1.25 + 30)) for i in (1, 3, 5))
        part(c, d, (top, col, '#3A2A3A'), ow=1.4, bevel=1.6, gloss=0.0, hi=0.5, lo=0.4)
    for s, col in ((s1, PINK), (s2, BLUE), (s3, GREEN)):
        part(c, s, col, ow=1.4, bevel=1.4, gloss=0.0)
    for x, y, s in stars:
        part(c, star(c, x, y, s, s * 0.45, round_=0.8), GOLD, ow=1.4, bevel=1.6, gloss=0.0, hi=0.7)
    return c.image()


def icon_goal():
    """Goal: red/white target with a dart in the bull's-eye."""
    c = F.Canvas(96, 96)
    cx, cy = 44, 52
    disc = F.sd_circle(c.X, c.Y, cx, cy, 36)
    Xs, Ys = rot(c, cx, cy, 45)
    shaft = F.sd_box(Xs, Ys, cx, cy - 22, 2.3, 19, 1.2)
    fl = U(F.sd_polygon(Xs, Ys, [(cx - 2, cy - 37), (cx - 9, cy - 45), (cx - 9, cy - 34), (cx - 2, cy - 28)]) - 0.8,
           F.sd_polygon(Xs, Ys, [(cx + 2, cy - 37), (cx + 9, cy - 45), (cx + 9, cy - 34), (cx + 2, cy - 28)]) - 0.8)
    shadow(c, U(disc, shaft, fl))
    part(c, disc, RED, ow=3.2, bevel=7, gloss=0.0, hi=0.55, lo=0.45, tint='red')
    for r, col in ((28.5, ('#FFFFFF', '#E6E1DA')), (20.5, ('#FF8E7E', '#DE3B2F')), (12.5, ('#FFFFFF', '#E6E1DA')),
                   (5.5, ('#FF8E7E', '#DE3B2F'))):
        ring = F.sd_circle(c.X, c.Y, cx, cy, r)
        t = np.clip((c.Y - (cy - r)) / (2 * r), 0, 1)
        c.paint(c.cov(ring), F.mix(hexc(col[0]), hexc(col[1]), t))
    n = F.bevel_normals(disc, 8, c.px)
    c.paint(c.cov(disc) * np.clip(F.lambert(n), 0, 1), WHITE, 0.5)
    c.paint(c.cov(disc) * np.clip(-F.lambert(n), 0, 1), hexc('#7E1A16'), 0.35)
    EA.glossy_spot(c, cx - 15, cy - 20, 9, 4, -38, 0.55, 1.0)
    c.fill(F.sd_circle(c.X, c.Y, cx + 1.5, cy + 1.5, 3.5), hexc('#3A2414'), 0.35, feather=1.0)
    part(c, shaft, WOOD_D, ow=1.6, bevel=1.6, gloss=0.2)
    part(c, fl, BLUE, ow=1.6, bevel=2, gloss=0.2, tint='blue')
    EA.twinkle(c, 14, 20, 6.5, edge='#8E520A')
    return c.image()


def icon_explore():
    """Explore: brass compass with a red/white needle pointing north-east."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 52
    case = F.sd_circle(c.X, c.Y, cx, cy, 36)
    bail = np.abs(F.sd_circle(c.X, c.Y, cx, 12, 7.5)) - 2.6
    bail = F.intersect(bail, c.Y - 13.5)
    knob = F.sd_box(c.X, c.Y, cx, 16.5, 6.5, 3.5, 1.5)
    shadow(c, U(case, bail, knob))
    part(c, bail, GOLD, ow=2.2, bevel=2.5, gloss=0.2, tint='gold')
    part(c, knob, GOLD, ow=2.0, bevel=2.0, gloss=0.2, tint='gold')
    part(c, case, ('#FFE07A', '#D99A22', '#7A4A0E'), ow=3.2, bevel=6, gloss=0.25, hi=0.55, tint='gold', spec=0.2)
    face = F.sd_circle(c.X, c.Y, cx, cy, 27)
    n = F.bevel_normals(-face, 3, c.px)
    n[..., 0] *= -1
    n[..., 1] *= -1
    t = np.clip((c.Y - (cy - 27)) / 54, 0, 1)
    c.paint(c.cov(face), F.shade(F.mix(hexc('#FFFDF4'), hexc('#F0E3C6'), t), F.lambert(n) * 0.8, 0.4, 0.4))
    for k in range(8):
        a = k * math.pi / 4
        L = 4.5 if k % 2 == 0 else 2.8
        x0, y0 = cx + math.cos(a) * 23, cy + math.sin(a) * 23
        x1, y1 = cx + math.cos(a) * (23 - L), cy + math.sin(a) * (23 - L)
        c.fill(F.sd_segment(c.X, c.Y, x0, y0, x1, y1, 1.3 if k % 2 == 0 else 0.9), hexc('#8A6A44'))
    ang = math.radians(-50)
    tip = (cx + math.cos(ang) * 21, cy + math.sin(ang) * 21)
    tail = (cx - math.cos(ang) * 21, cy - math.sin(ang) * 21)
    px_, py_ = -math.sin(ang) * 6.5, math.cos(ang) * 6.5
    north = F.sd_polygon(c.X, c.Y, [tip, (cx + px_, cy + py_), (cx - px_, cy - py_)]) - 0.8
    south = F.sd_polygon(c.X, c.Y, [tail, (cx + px_, cy + py_), (cx - px_, cy - py_)]) - 0.8
    c.shadow(c.cov(U(north, south)), dx=1.2, dy=1.6, sigma=1.0, opacity=0.35)
    part(c, south, ('#FFFFFF', '#C8D3E3', '#3A4352'), ow=1.6, bevel=2.5, gloss=0.0)
    part(c, north, RED, ow=1.6, bevel=2.5, gloss=0.0, hi=0.6)
    part(c, F.sd_circle(c.X, c.Y, cx, cy, 3.6), GOLD, ow=1.4, bevel=1.8, gloss=0.0, spec=0.4)
    EA.glossy_spot(c, cx - 14, cy - 17, 8, 3.5, -38, 0.5, 1.0)
    return c.image()


def icon_calendar():
    """Calendar: page with a red header and binder rings, a grid of days and one starred day."""
    c = F.Canvas(96, 96)
    page = F.sd_box(c.X, c.Y, 48, 54, 34, 33, 8)
    head = F.intersect(F.sd_box(c.X, c.Y, 48, 54, 34, 33, 8), c.Y - 40)
    rings = U(*[np.abs(F.sd_box(c.X, c.Y, x, 19, 3.0, 7, 3.0)) - 1.7 for x in (32, 48, 64)])
    shadow(c, U(page, rings))
    part(c, page, PAPER, ow=3.0, bevel=5, gloss=0.0, hi=0.4, lo=0.3, tint='paper')
    part(c, head, RED, ow=0, bevel=4, gloss=0.3, tint='red')
    for x in (32, 48, 64):
        c.fill(F.sd_circle(c.X, c.Y, x, 29, 2.8), hexc('#7E1A16'))
    part(c, rings, STEEL, ow=1.6, bevel=1.8, gloss=0.3, spec=0.3)
    xs = [27, 41, 55, 69]
    ys = [51, 62, 73]
    for yi, y in enumerate(ys):
        for xi, x in enumerate(xs):
            d = F.sd_box(c.X, c.Y, x, y, 5.0, 3.8, 1.8)
            if (xi, yi) == (2, 1):
                continue
            c.fill(d, hexc('#E3D3B4') if (xi + yi) % 3 else hexc('#D9C6A2'))
    hl = F.sd_box(c.X, c.Y, 55, 62, 6.8, 5.6, 2.4)
    part(c, hl, GOLD, ow=1.6, bevel=2.5, gloss=0.3, hi=0.6)
    part(c, star(c, 55, 62.5, 5.4, 2.4, round_=0.6), ('#FFFFFF', '#FFE07A', '#B8650E'), ow=0.0, bevel=1.5,
         gloss=0.0, hi=0.6)
    return c.image()


def icon_day():
    """Day: glossy round sun with rounded rays."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 48
    rays = None
    for k in range(10):
        a = k * 2 * math.pi / 10 - math.pi / 2
        X2, Y2 = rot(c, cx, cy, math.degrees(a) + 90)
        tri = F.sd_polygon(X2, Y2, [(cx - 7.5, cy - 24), (cx + 7.5, cy - 24), (cx, cy - 42)]) - 2.4
        rays = tri if rays is None else U(rays, tri)
    core = F.sd_circle(c.X, c.Y, cx, cy, 25)
    shadow(c, U(rays, core))
    part(c, rays, ('#FFD86A', '#F7922E', '#8E3A0A'), ow=2.6, bevel=3, gloss=0.0, hi=0.6, tint='gold')
    part(c, core, ('#FFF6B8', '#FFB833', '#8E520A'), ow=3.0, bevel=11, gloss=0.0, hi=0.7, lo=0.45, tint='gold',
         pillow=8.0)
    EA.glossy_spot(c, cx - 9, cy - 11, 8.5, 4.5, -38, 0.75, 1.0)
    c.fill(F.sd_circle(c.X, c.Y, cx - 16, cy - 2, 2.0), WHITE, 0.6)
    return c.image()


def icon_night():
    """Night: pale gold crescent moon with two twinkling stars."""
    c = F.Canvas(96, 96)
    moon = F.subtract(F.sd_circle(c.X, c.Y, 44, 52, 32), F.sd_circle(c.X, c.Y, 62, 40, 26))
    moon = F.smin(moon, moon, 0.1)
    s1 = star(c, 72, 66, 11, 5, round_=1.2)
    s2 = star(c, 78, 26, 7, 3.2, round_=0.8)
    shadow(c, U(moon, s1, s2))
    part(c, moon, ('#FFF8D0', '#F2C14E', '#7A5A10'), ow=3.0, bevel=7, gloss=0.0, hi=0.65, lo=0.45, tint='gold',
         pillow=6.0)
    for (x, y, r) in ((28, 58, 4.2), (36, 72, 2.8), (24, 44, 2.4)):
        cr = F.sd_circle(c.X, c.Y, x, y, r)
        n = F.bevel_normals(-cr, 1.5, c.px)
        c.paint(c.cov(cr) * c.cov(moon), F.shade(hexc('#EBC55A'), -F.lambert(n), 0.4, 0.6), 0.8)
    EA.glossy_spot(c, 22, 50, 3.0, 9.0, 18, 0.6, 1.0)
    for s in (s1, s2):
        part(c, s, ('#FFFFFF', '#FFD45A', '#8E520A'), ow=2.0, bevel=2.5, gloss=0.0, hi=0.7)
    EA.twinkle(c, 56, 16, 5.0, edge='#8E520A')
    return c.image()


def icon_ring():
    """Wedding: gold ring with a big sparkling diamond."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 62
    band = F.subtract(F.sd_ellipse(c.X, c.Y, cx, cy, 28, 25), F.sd_ellipse(c.X, c.Y, cx, cy + 2.5, 20, 16.5))
    seat = F.sd_box(c.X, c.Y, cx, 37, 8.5, 4.5, 2)
    gem = F.sd_polygon(c.X, c.Y, [(33, 22), (63, 22), (71, 30), (48, 52), (25, 30)]) - 1.0
    shadow(c, U(band, seat, gem))
    part(c, band, GOLD, ow=3.2, bevel=6, gloss=0.3, hi=0.65, lo=0.5, tint='gold', spec=0.3)
    part(c, seat, GOLD, ow=2.2, bevel=2.5, gloss=0.2, tint='gold')
    part(c, gem, ('#FFFFFF', '#A9DDF7', '#2F6EA8'), ow=2.6, bevel=3.0, gloss=0.0, hi=0.6, lo=0.4, tint='#3E7EC8',
         spec=0.35)
    # facets
    for seg in (((33, 22), (40, 30)), ((63, 22), (56, 30)), ((25, 30), (71, 30)), ((40, 30), (48, 52)),
                ((56, 30), (48, 52)), ((48, 22), (40, 30)), ((48, 22), (56, 30))):
        (x0, y0), (x1, y1) = seg
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, x0, y0, x1, y1, 0.7), gem + 0.5), hexc('#5B9BD0'), 0.75)
    tri = F.sd_polygon(c.X, c.Y, [(34, 23.5), (47, 23.5), (40, 29)])
    c.fill(tri, WHITE, 0.85)
    c.fill(F.sd_polygon(c.X, c.Y, [(28, 31), (40, 31), (46, 46)]) - 0.2, WHITE, 0.35)
    EA.twinkle(c, 74, 18, 9.0, edge='#2F6EA8', tip='#BDE6FF')
    EA.twinkle(c, 20, 44, 5.0, edge='#2F6EA8', tip='#BDE6FF')
    return c.image()


def icon_baby():
    """Baby: chubby sleeping baby face in a mint bonnet with a frill and a pink pacifier."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 50
    bonnet = F.sd_circle(c.X, c.Y, cx, cy - 2, 35)
    frill = None
    for k in range(16):
        a = k * 2 * math.pi / 16
        b = F.sd_circle(c.X, c.Y, cx + math.cos(a) * 25.5, cy + 3 + math.sin(a) * 24, 5.6)
        frill = b if frill is None else U(frill, b)
    frill = F.smin(frill, F.sd_circle(c.X, c.Y, cx, cy + 3, 25), 2)
    bow = U(F.sd_polygon(c.X, c.Y, [(48, 82), (36, 75), (36, 89)]) - 2.2,
            F.sd_polygon(c.X, c.Y, [(48, 82), (60, 75), (60, 89)]) - 2.2)
    shadow(c, U(bonnet, frill, bow))
    part(c, bonnet, MINT, ow=3.0, bevel=8, gloss=0.3, hi=0.55, lo=0.45, tint='#3E9A6E')
    part(c, frill, ('#FFFFFF', '#E9EEF5', '#7A86A6'), ow=1.8, bevel=3, gloss=0.0, hi=0.4, lo=0.3)
    face = F.sd_circle(c.X, c.Y, cx, cy + 4, 21)
    part(c, face, SKIN, ow=1.8, bevel=8, gloss=0.0, hi=0.45, lo=0.35, tint='#C86A50')
    curl = F.sd_arc(c.X, c.Y, cx + 2, cy - 14, 4.5, math.radians(120), math.radians(380), 1.7)
    c.fill(curl, hexc('#8A5A33'))
    for s in (-1, 1):
        c.fill(F.sd_arc(c.X, c.Y, cx + s * 8, cy + 1, 4.0, math.radians(20), math.radians(160), 1.25), hexc(EA.INK))
    EA.cheeks(c, cx, cy + 9, 12.5, 0, rx=4.6, ry=2.9, a=0.6)
    shield = F.sd_ellipse(c.X, c.Y, cx, cy + 14, 7.5, 4.6)
    ring = np.abs(F.sd_circle(c.X, c.Y, cx, cy + 20, 4.2)) - 1.5
    part(c, U(shield, ring), PINK, ow=1.6, bevel=2.5, gloss=0.3, hi=0.6)
    part(c, bow, PINK, ow=2.2, bevel=3, gloss=0.25)
    part(c, F.sd_circle(c.X, c.Y, 48, 82, 4.2), PINK, ow=1.8, bevel=2, gloss=0.2)
    EA.glossy_spot(c, cx - 20, cy - 22, 7, 3.5, -40, 0.6, 1.0)
    return c.image()


def icon_flower():
    """Farewell: a gentle white chrysanthemum (국화) - three layers of narrow petals - with leaves and a lavender
    ribbon tied around the stem."""
    c = F.Canvas(96, 96)
    cx, cy = 50, 33
    stem = F.sd_polyline(c.X, c.Y, [(cx, cy + 8), (48, 62), (44, 90)], 2.8)
    Xl, Yl = rot(c, 35, 60, -38)
    leaf = F.sd_ellipse(Xl, Yl, 35, 60, 11, 4.8)
    Xr, Yr = rot(c, 60, 66, 32)
    leaf2 = F.sd_ellipse(Xr, Yr, 60, 66, 8.5, 4.0)
    layers = []
    for (n, rad, ln, wd, off) in ((20, 17.5, 10.5, 3.6, 0.0), (14, 11.0, 8.0, 3.4, 0.22), (9, 5.5, 5.5, 3.0, 0.1)):
        d = None
        for k in range(n):
            a_ = k * 2 * math.pi / n + off
            X2, Y2 = rot(c, cx, cy, math.degrees(a_))
            p_ = F.sd_ellipse(X2, Y2, cx + rad, cy, ln, wd)
            d = p_ if d is None else U(d, p_)
        layers.append(d)
    bow = U(F.sd_polygon(c.X, c.Y, [(46, 78), (34, 72), (35, 85)]) - 1.8,
            F.sd_polygon(c.X, c.Y, [(46, 78), (58, 72), (57, 85)]) - 1.8,
            F.sd_polygon(c.X, c.Y, [(45, 80), (39, 91), (43, 92), (46.5, 82)]) - 0.9,
            F.sd_polygon(c.X, c.Y, [(47, 80), (54, 90), (50, 92), (46, 82)]) - 0.9)
    shadow(c, U(stem, leaf, leaf2, layers[0], bow))
    part(c, stem, GREEN, ow=2.0, bevel=2, gloss=0.1, tint='green')
    for lf, Xa, Ya, x0, x1, y in ((leaf, Xl, Yl, 26, 44, 60), (leaf2, Xr, Yr, 53, 67, 66)):
        part(c, lf, GREEN, ow=2.0, bevel=3, gloss=0.2, tint='green')
        c.fill(F.intersect(F.sd_segment(Xa, Ya, x0, y, x1, y, 0.6), lf + 1.0), hexc('#2E7A3A'), 0.8)
    petal = ('#FFFFFF', '#E1E6F0', '#6E7A99')
    part(c, layers[0], petal, ow=1.8, bevel=3, gloss=0.0, hi=0.45, lo=0.35, tint='#8A96B8')
    part(c, layers[1], ('#FFFFFF', '#E9EDF5', '#6E7A99'), ow=1.4, bevel=2.5, gloss=0.0, hi=0.45, lo=0.3,
         tint='#8A96B8')
    part(c, layers[2], ('#FFFFFF', '#EEF0E2', '#7A7A5A'), ow=1.2, bevel=2.0, gloss=0.0, hi=0.45, lo=0.3)
    ctr = F.sd_circle(c.X, c.Y, cx, cy, 3.6)
    part(c, ctr, ('#FBF6C8', '#D9D27A', '#7A7A2A'), ow=1.0, bevel=2, gloss=0.0, hi=0.5)
    part(c, bow, LAV, ow=1.8, bevel=2.5, gloss=0.25, tint='#6A4AB0')
    part(c, F.sd_circle(c.X, c.Y, 46, 78, 3.2), LAV, ow=1.4, bevel=1.6, gloss=0.2)
    return c.image()


def icon_heart_pair():
    """Relationship: two overlapping hearts (rose behind, pink in front)."""
    c = F.Canvas(96, 96)
    X1, Y1 = rot(c, 37, 42, -14)
    X2, Y2 = rot(c, 59, 55, 12)
    h1 = EA.heart_sdf(X1, Y1, 37, 42, 50) - 1.0
    h2 = EA.heart_sdf(X2, Y2, 59, 55, 50) - 1.0
    shadow(c, U(h1, h2))
    part(c, h1, ('#FF8E9E', '#D62848', '#7A0E24'), ow=3.0, bevel=8, gloss=0.0, hi=0.55, lo=0.45, pillow=7.0,
         tint='#A01836')
    EA.glossy_spot(c, 26, 32, 6.5, 3.5, -50, 0.75, 0.8)
    c.shadow(c.cov(h2), dx=-1.0, dy=1.5, sigma=1.4, opacity=0.25)
    part(c, h2, PINK, ow=3.0, bevel=8, gloss=0.0, hi=0.6, lo=0.45, pillow=7.0, tint='pink')
    EA.glossy_spot(c, 49, 45, 7.0, 3.8, -25, 0.8, 0.8)
    c.fill(F.sd_circle(c.X, c.Y, 45, 56, 1.8), WHITE, 0.7)
    EA.twinkle(c, 82, 24, 7.0, edge='#B0204E', tip='#FFA0BC')
    return c.image()


def icon_steer():
    """Drive: retro ivory steering wheel with chrome spokes and a red horn button."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 50
    rim = np.abs(F.sd_circle(c.X, c.Y, cx, cy, 33)) - 6.0
    spokes = None
    for a in (-90, 30, 150):
        ar = math.radians(a + 180)
        s = F.sd_segment(c.X, c.Y, cx, cy, cx + math.cos(ar) * 30, cy + math.sin(ar) * 30, 3.6)
        spokes = s if spokes is None else U(spokes, s)
    hub = F.sd_circle(c.X, c.Y, cx, cy, 12)
    shadow(c, U(rim, spokes, hub))
    part(c, spokes, STEEL, ow=2.4, bevel=2.5, gloss=0.3, spec=0.35, tint='silver')
    part(c, rim, ('#FFF8E6', '#E2CBA0', '#5E4A30'), ow=3.0, bevel=5, gloss=0.3, hi=0.55, lo=0.45, tint='#A8875A',
         spec=0.25)
    for k in range(10):
        a = math.radians(200 + k * 7)
        x, y = cx + math.cos(a) * 33, cy + math.sin(a) * 33
        c.fill(F.sd_circle(c.X, c.Y, x, y, 1.0), hexc('#B89A6A'), 0.5)
    part(c, hub, STEEL, ow=2.4, bevel=4, gloss=0.3, spec=0.35)
    horn = F.sd_circle(c.X, c.Y, cx, cy, 7.5)
    part(c, horn, RED, ow=1.6, bevel=3, gloss=0.0, hi=0.6, spec=0.4)
    part(c, star(c, cx, cy + 0.4, 4.2, 1.9, round_=0.5), ('#FFFFFF', '#FFE07A', '#B8650E'), ow=0, bevel=1, gloss=0)
    EA.glossy_spot(c, cx - 22, cy - 22, 7, 3, -45, 0.7, 1.0)
    return c.image()


def icon_timer():
    """Timer: silver stopwatch with a red countdown wedge and hand."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 56
    case = F.sd_circle(c.X, c.Y, cx, cy, 33)
    crown = U(F.sd_box(c.X, c.Y, cx, 17, 5.5, 5, 1.5), F.sd_box(c.X, c.Y, cx, 11, 9, 3.5, 2))
    Xb, Yb = rot(c, cx, cy, 45)
    side = F.sd_box(Xb, Yb, cx, cy - 36, 4.5, 4.5, 1.5)
    shadow(c, U(case, crown, side))
    part(c, crown, STEEL, ow=2.2, bevel=2, gloss=0.3, spec=0.3)
    part(c, side, RED, ow=2.0, bevel=2, gloss=0.3)
    part(c, case, SILVER, ow=3.2, bevel=6, gloss=0.25, hi=0.4, lo=0.5, tint='silver', spec=0.3)
    face = F.sd_circle(c.X, c.Y, cx, cy, 25)
    c.fill(face, hexc('#FFFFFF'))
    c.paint(c.cov(face) * np.clip((c.Y - cy + 10) / 40, 0, 1), hexc('#E6EBF3'), 0.8)
    ang = np.arctan2(c.Y - cy, c.X - cx)
    a0 = -math.pi / 2
    rel = np.mod(ang - a0, 2 * math.pi)
    wedge = (rel < math.radians(130)).astype(np.float32) * c.cov(F.sd_circle(c.X, c.Y, cx, cy, 20))
    c.paint(wedge, hexc('#FF9A8A'), 0.75)
    for k in range(12):
        a = k * math.pi / 6
        L = 4.0 if k % 3 == 0 else 2.2
        x0, y0 = cx + math.cos(a) * 23, cy + math.sin(a) * 23
        x1, y1 = cx + math.cos(a) * (23 - L), cy + math.sin(a) * (23 - L)
        c.fill(F.sd_segment(c.X, c.Y, x0, y0, x1, y1, 1.2 if k % 3 == 0 else 0.8), hexc('#5A6478'))
    a = a0 + math.radians(130)
    hand = F.sd_segment(c.X, c.Y, cx, cy, cx + math.cos(a) * 19, cy + math.sin(a) * 19, 2.0)
    c.fill(hand - 0.8, hexc('#7E1A16'))
    c.fill(hand, hexc('#E3302A'))
    part(c, F.sd_circle(c.X, c.Y, cx, cy, 3.4), RED, ow=1.2, bevel=1.5, gloss=0.0, spec=0.4)
    EA.glossy_spot(c, cx - 14, cy - 15, 7, 3, -40, 0.55, 1.0)
    return c.image()


ICONS = [
    ('ui_icon_mission', icon_mission, 'Mission: wooden clipboard with a checklist (mission board / list button).'),
    ('ui_icon_fame', icon_fame, 'Fame point: gold star medal on a red neck ribbon (명성).'),
    ('ui_icon_title', icon_title, 'Chief title: gold crown above a blank red ribbon banner (칭호).'),
    ('ui_icon_delivery', icon_delivery, 'Delivery mission: round retro truck with crates on the bed (배달).'),
    ('ui_icon_request', icon_request, 'Resident request: white speech bubble with a pink heart (부탁).'),
    ('ui_icon_event', icon_event, 'Event: party popper with confetti and streamers (행사).'),
    ('ui_icon_goal', icon_goal, 'Production goal: target with a dart in the bull\'s-eye (생산 목표).'),
    ('ui_icon_explore', icon_explore, 'Exploration: brass compass, needle to the north-east (탐험).'),
    ('ui_icon_calendar', icon_calendar, 'Daily / weekly missions: calendar page with a starred day (일일·주간).'),
    ('ui_icon_day', icon_day, 'Daytime: glossy sun (낮).'),
    ('ui_icon_night', icon_night, 'Night: crescent moon with stars (밤).'),
    ('ui_icon_ring', icon_ring, 'Wedding: gold ring with a sparkling diamond (결혼).'),
    ('ui_icon_baby', icon_baby, 'Baby: sleeping baby in a mint bonnet with a pacifier (아기 탄생).'),
    ('ui_icon_flower', icon_flower, 'Farewell: a gentle white chrysanthemum with a lavender ribbon (배웅).'),
    ('ui_icon_heart_pair', icon_heart_pair, 'Relationship: two overlapping hearts (관계 / 연인).'),
    ('ui_icon_steer', icon_steer, 'Drive: retro ivory steering wheel with a red horn button (운전).'),
    ('ui_icon_timer', icon_timer, 'Time limit: silver stopwatch with a red countdown wedge (제한 시간).'),
]


# =========================================================================== rank badges (128 x 128)
RANKS = {
    # n: (shield pal, field pal, banner pal, symbol, laurel, extras)
    1: (WOOD, ('#F7E2C2', '#E2C08E', '#8A6A44'), GREEN, 'sprout', None, ()),
    2: (('#F6C08A', '#C0702E', '#5E2E0E'), ('#FFE3C4', '#F0B27A', '#7A3A0E'), BLUE, 1, None, ()),
    3: (('#FFFFFF', '#AEB9C9', '#34425C'), ('#EAF2FB', '#B8C8DE', '#34425C'), RED, 2, GREEN, ()),
    4: (GOLD, ('#FFF8D6', '#FFD86A', '#8E520A'), RED, 3, GOLD, ('gems',)),
    5: (GOLD, ('#E6D4FF', '#8A5CE8', '#35206E'), ('#FF8E7E', '#DE3B2F', '#5A1410'), 'crown', GOLD,
        ('gems', 'wings', 'glow')),
}
RANK_NAMES = {1: '새내기 촌장 (newcomer chief)', 2: '믿음직한 촌장 (trusted chief)', 3: '존경받는 촌장 (respected chief)',
              4: '명예로운 촌장 (honoured chief)', 5: '전설의 촌장 (legendary chief)'}


def shield_sd(X, Y, cx, top, w, h, r=6.0):
    """Heater shield: flat-ish top, straight sides, curved sides to a point at the bottom."""
    pts = [(cx - w, top), (cx + w, top), (cx + w, top + h * 0.48), (cx + w * 0.62, top + h * 0.82), (cx, top + h),
           (cx - w * 0.62, top + h * 0.82), (cx - w, top + h * 0.48)]
    return F.sd_polygon(X, Y, pts) - r


def laurel(c, cx, cy, side, pal, n=5):
    """Leaves of a laurel branch curving up one side of the badge (side -1 left, +1 right); returns a list of SDFs
    from the bottom leaf up."""
    out = []
    for k in range(n):
        a = math.radians(122 + k * 21) if side < 0 else math.radians(58 - k * 21)
        x = cx + math.cos(a) * 45
        y = cy + math.sin(a) * 41
        ang = math.degrees(a) + 90 + side * 28
        X2, Y2 = rot(c, x, y, ang)
        out.append(F.sd_ellipse(X2, Y2, x, y, 8.5, 3.8))
    return out


def wing(c, cx, cy, side):
    """Small angel wing behind the badge: 4 rounded feathers fanning out (returns a list, back -> front)."""
    out = []
    for k in range(4):
        x = cx + side * (16 + k * 6.5)
        y = cy - 6 + k * 7.5
        X2, Y2 = rot(c, x, y, -side * (20 + k * 14))
        out.append(F.sd_ellipse(X2, Y2, x + side * (6 - k), y, 8 + (3 - k) * 2.6, 5.2))
    return out[::-1]


def badge_rank(n):
    S = 128
    c = F.Canvas(S, S)
    shp, fld, ban, sym, lau, extra = RANKS[n]
    cx = 64
    top = 18 if n < 5 else 33
    hgt = 84 if n < 5 else 74
    w = 34 if n < 5 else 30
    shield = shield_sd(c.X, c.Y, cx, top, w, hgt, 6)
    field = shield_sd(c.X, c.Y, cx, top + 7, w - 7, hgt - 15, 4)
    by = top + hgt * 0.66
    banner = F.sd_polygon(c.X, c.Y, [(cx - 44, by - 8), (cx, by - 5), (cx + 44, by - 8), (cx + 44, by + 9),
                                     (cx, by + 12), (cx - 44, by + 9)]) - 1.6
    tails = U(F.sd_polygon(c.X, c.Y, [(cx - 58, by - 2), (cx - 40, by - 5), (cx - 40, by + 13), (cx - 58, by + 16),
                                      (cx - 52, by + 7)]) - 1.2,
              F.sd_polygon(c.X, c.Y, [(cx + 58, by - 2), (cx + 40, by - 5), (cx + 40, by + 13), (cx + 58, by + 16),
                                      (cx + 52, by + 7)]) - 1.2)
    parts = [shield, banner, tails]
    lauL = lauR = None
    if lau is not None:
        lauL = laurel(c, cx, top + hgt * 0.42, -1, lau)
        lauR = laurel(c, cx, top + hgt * 0.42, 1, lau)
        parts += lauL + lauR
    wl = wr = None
    if 'wings' in extra:
        wl, wr = wing(c, cx - 20, top + 16, -1), wing(c, cx + 20, top + 16, 1)
        parts += wl + wr
    crown = None
    if sym == 'crown':
        crown = F.smin(F.sd_polygon(c.X, c.Y, [(cx - 20, 33), (cx - 22, 14), (cx - 10, 23), (cx, 9), (cx + 10, 23),
                                                (cx + 22, 14), (cx + 20, 33)]) - 2.0,
                       F.sd_box(c.X, c.Y, cx, 33, 21, 5, 2.5), 1.5)
        parts.append(crown)
    allsh = U(*parts)
    if 'glow' in extra:
        c.glow(c.cov(allsh), 6.0, '#FFE07A', 0.9)
    shadow(c, allsh, opacity=0.34, dy=3.5, sigma=2.6)
    if wl is not None:
        for wd in wl + wr:
            part(c, wd, ('#FFFFFF', '#DCE6F4', '#56739F'), ow=1.8, bevel=3, gloss=0.0, hi=0.5, lo=0.35, tint='#7E9CCC')
    if lauL is not None:
        for ld in lauL + lauR:
            part(c, ld, lau, ow=1.8, bevel=2.5, gloss=0.1, tint='gold' if lau is GOLD else 'green')
    tint_t = {1: 'wood', 2: '#8A3A10', 3: 'silver', 4: 'gold', 5: 'gold'}[n]
    part(c, shield, shp, ow=3.2, bevel=7, gloss=0.3, hi=0.55, lo=0.5, tint=tint_t, spec=0.2 if n >= 3 else 0.0)
    if n == 1:                                           # wood grain
        for k in range(5):
            yy = top + 14 + k * 13
            c.fill(F.intersect(F.sd_segment(c.X, c.Y, cx - 30, yy, cx + 30, yy + 2, 0.7), shield + 4), hexc('#8A5A33'),
                   0.35)
    # recessed field
    nf = F.bevel_normals(-field, 3, c.px)
    nf[..., 0] *= -1
    nf[..., 1] *= -1
    t = np.clip((c.Y - top) / hgt, 0, 1)
    c.fill(field + 1.0, hexc(fld[2]), 0.55)
    c.paint(c.cov(field), F.shade(F.mix(hexc(fld[0]), hexc(fld[1]), t), F.lambert(nf) * 0.9, 0.5, 0.45))
    fy = top + hgt * 0.36
    if sym == 'sprout':
        stem_ = F.sd_segment(c.X, c.Y, cx, fy + 12, cx, fy - 2, 2.4)
        Xa, Ya = rot(c, cx - 9, fy - 6, -30)
        la = F.sd_ellipse(Xa, Ya, cx - 9, fy - 6, 10, 6)
        Xb, Yb = rot(c, cx + 9, fy - 9, 30)
        lb = F.sd_ellipse(Xb, Yb, cx + 9, fy - 9, 11, 6.5)
        soil = F.sd_ellipse(c.X, c.Y, cx, fy + 13, 13, 4.5)
        c.shadow(c.cov(U(stem_, la, lb, soil)), dx=1, dy=1.5, sigma=1.2, opacity=0.3)
        part(c, soil, WOOD_D, ow=1.6, bevel=2, gloss=0.0)
        part(c, U(stem_, la, lb), GREEN, ow=1.8, bevel=3, gloss=0.3, tint='green')
    elif isinstance(sym, int):
        pos = {1: [(cx, fy, 15)], 2: [(cx - 11, fy + 1, 11), (cx + 11, fy + 1, 11)],
               3: [(cx - 15, fy + 4, 9.5), (cx, fy - 4, 12.5), (cx + 15, fy + 4, 9.5)]}[sym]
        stc = ('#FFFFFF', '#D6DEEA', '#34425C') if n == 2 else ('#FFF6C8', '#F5A623', '#8E520A')
        for x, y, r in pos:
            st = star(c, x, y, r, r * 0.46, round_=1.2)
            c.shadow(c.cov(st), dx=1, dy=1.5, sigma=1.0, opacity=0.35)
            part(c, st, stc, ow=1.8, bevel=3, gloss=0.0, hi=0.7, lo=0.5)
    else:                                                # rank 5: big gold star on the purple field
        st = star(c, cx, fy + 2, 17, 7.8, round_=1.6)
        c.shadow(c.cov(st), dx=1, dy=1.5, sigma=1.2, opacity=0.4)
        part(c, st, ('#FFF6C8', '#F5A623', '#8E520A'), ow=2.0, bevel=3.5, gloss=0.0, hi=0.75, lo=0.5)
    part(c, tails, (ban[0], ban[1], ban[2]), ow=2.4, bevel=3, gloss=0.0, lo=0.6)
    c.paint(c.cov(tails) * 0.35, hexc(ban[2]), 0.35)
    part(c, banner, ban, ow=2.6, bevel=3.5, gloss=0.3)
    if 'gems' in extra:
        for x, pal_ in ((cx - 24, BLUE), (cx + 24, BLUE), (cx, RED)):
            g = F.sd_circle(c.X, c.Y, x, top + 3, 4.2 if x != cx else 5.0)
            part(c, g, pal_, ow=1.6, bevel=2.5, gloss=0.0, hi=0.7, spec=0.5)
    if crown is not None:
        part(c, crown, GOLD, ow=2.6, bevel=4, gloss=0.3, hi=0.6, tint='gold')
        for x, y in ((cx - 22, 13), (cx, 8.5), (cx + 22, 13)):
            part(c, F.sd_circle(c.X, c.Y, x, y, 3.6), ('#FFFFFF', '#E9DCC8', '#6B5A44'), ow=1.6, bevel=2, gloss=0)
        part(c, F.sd_circle(c.X, c.Y, cx, 32, 4.0), RED, ow=1.4, bevel=2, gloss=0.0, spec=0.5)
    if n >= 4:
        EA.twinkle(c, cx + 40, top + 6, 8.0, edge='#8E520A')
        EA.twinkle(c, cx - 44, top + hgt - 10, 5.5, edge='#8E520A')
    if n == 5:
        EA.twinkle(c, cx - 46, 24, 7.0, edge='#8E520A')
        EA.twinkle(c, cx + 44, top + hgt - 4, 6.0, edge='#8E520A')
    EA.glossy_spot(c, cx - w * 0.55, top + 12, 6, 3, -35, 0.5, 1.0)
    return c.image()


BADGES = [('ui_badge_rank_%d' % n, (lambda n=n: badge_rank(n)),
           'Chief title badge rank %d: %s. Blank banner (no text baked).' % (n, RANK_NAMES[n])) for n in range(1, 6)]


# =========================================================================== 9-slices
CARD_W, CARD_H = 176, 112
CARD_MARGINS = dict(left=46, right=34, top=30, bottom=36)


def mission_card(done=False):
    """Mission note card (list row on the mission board).  Warm paper face with a rim and a thick bottom lip like
    ui_panel / ui_card, a coloured tab down the left edge (stretches vertically), a push-pin in the top-left corner.
    done = mint face, green rim + tab, gold pin and a green check seal in the top-right corner.  Same size, body
    geometry and margins, so the game can swap the two in place."""
    W, H = CARD_W, CARD_H
    c = F.Canvas(W, H)
    x0, x1, y0 = 9, W - 9, 9
    fy1 = H - 17
    body = F.sd_box(c.X, c.Y, W / 2, (y0 + fy1) / 2 + 3, (x1 - x0) / 2, (fy1 - y0) / 2 + 3, 18)
    face = F.sd_box(c.X, c.Y, W / 2, (y0 + fy1) / 2, (x1 - x0) / 2, (fy1 - y0) / 2, 18)
    if done:
        rim, lip, lipd = '#2F7A3E', '#9ED69A', '#4E9E58'
        tops = [(0, '#FBFFF8'), (0.35, '#F0FBEA'), (1, '#DDF3D2')]
        tab = ('#B5F2A8', '#3FAE4C')
        inner_col = '#BFE3B6'
    else:
        rim, lip, lipd = '#9A7A4E', '#E9D5B0', '#B89868'
        tops = [(0, '#FFFFFF'), (0.35, '#FFFCF4'), (1, '#F8EEDB')]
        tab = ('#FFD86A', '#F08A3D')
        inner_col = '#EADBC0'
    c.shadow(c.cov(body), dy=3.5, sigma=2.8, opacity=0.30)
    c.fill(body - 1.6, hexc(rim))
    c.fill(body, hexc(lip))
    lip_t = np.clip((c.Y - (fy1 - 4)) / 10, 0, 1)
    c.paint(c.cov(body) * c.cov(-face), F.mix(hexc(lip), hexc(lipd), lip_t * 0.6))
    t = np.clip((c.Y - y0) / (fy1 - y0), 0, 1)
    base = F.ramp([(p, hexc(col)) for p, col in tops], t)
    n = F.bevel_normals(face, 6, c.px)
    c.paint(c.cov(face), F.shade(base, F.lambert(n), 0.55, 0.2))
    # left tab (inside the left margin; uniform along y in the stretchable rows)
    tabd = F.intersect(face + 2.5, c.X - (x0 + 17))
    tg = F.mix(hexc(tab[0]), hexc(tab[1]), np.clip((c.X - x0) / 17, 0, 1))
    nt = F.bevel_normals(tabd, 3, c.px)
    c.paint(c.cov(tabd), F.shade(tg, F.lambert(nt), 0.5, 0.35))
    c.paint(c.cov(np.abs(c.X - (x0 + 17.5)) - 0.8) * c.cov(face + 2.5), hexc(rim), 0.35)
    inner = F.sd_box(c.X, c.Y, W / 2 + 9, (y0 + fy1) / 2, (x1 - x0) / 2 - 16, (fy1 - y0) / 2 - 6.5, 12)
    stroke(c, inner, 1.5, inner_col, 0.9)
    gl = F.sd_box(c.X, c.Y, W / 2 + 9, y0 + 8.5, (x1 - x0) / 2 - 24, 3.6, 3.6)
    c.paint(c.cov(gl, 0.8) * np.clip(1 - (c.Y - y0 - 4) / 10, 0, 1), WHITE, 0.55)
    # push-pin in the top-left corner
    px_, py_ = x0 + 9.5, y0 + 7.5
    head = F.sd_circle(c.X, c.Y, px_, py_, 7.2)
    c.shadow(c.cov(head), dx=2.0, dy=3.0, sigma=1.6, opacity=0.35)
    part(c, head, GOLD if done else RED, ow=1.8, bevel=3.5, gloss=0.0, hi=0.6, spec=0.5)
    EA.glossy_spot(c, px_ - 2.4, py_ - 2.6, 2.4, 1.4, -35, 0.85, 0.4)
    if done:
        sx, sy = W - 20, 17
        seal = F.sd_circle(c.X, c.Y, sx, sy, 11.5)
        c.shadow(c.cov(seal), dy=2, sigma=1.6, opacity=0.3)
        part(c, seal, GREEN, ow=2.0, bevel=4, gloss=0.3, hi=0.55)
        tick = F.sd_polyline(c.X, c.Y, [(sx - 5.5, sy + 0.5), (sx - 1.5, sy + 4.5), (sx + 5.5, sy - 4)], 2.2)
        c.fill(tick, WHITE)
    return c.image()


BOARD_W, BOARD_H = 192, 192
BOARD_MARGINS = dict(left=40, right=40, top=52, bottom=42)


def mission_board():
    """Mission board panel (광장 게시판): chunky wooden frame with a snow cap on the top rail, warm cork inside.
    9-slice: the snow cap and corner bolts live in the margins; the cork is uniform so it stretches cleanly."""
    W, H = BOARD_W, BOARD_H
    c = F.Canvas(W, H)
    frame = F.sd_box(c.X, c.Y, W / 2, 24 + (H - 34) / 2, W / 2 - 8, (H - 34) / 2, 16)
    cork = F.sd_box(c.X, c.Y, W / 2, 24 + (H - 34) / 2, W / 2 - 24, (H - 34) / 2 - 16, 6)
    c.shadow(c.cov(frame), dy=4, sigma=3.0, opacity=0.32)
    part(c, frame, WOOD_D, ow=3.0, bevel=8, gloss=0.25, tint='wood')
    # planks: subtle grain lines on the frame
    for k in range(4):
        yy = 34 + k * 40
        c.paint(c.cov(np.abs(c.Y - yy) - 0.6) * c.cov(frame + 3) * c.cov(-(cork - 3)), hexc('#7A4A28'), 0.25)
    nf = F.bevel_normals(-cork, 4, c.px)
    nf[..., 0] *= -1
    nf[..., 1] *= -1
    t = np.clip((c.Y - 40) / (H - 80), 0, 1)
    c.fill(cork + 1.4, hexc('#5E3A1E'))
    base = F.mix(hexc('#E3BF92'), hexc('#D6AE7C'), t)
    c.paint(c.cov(cork), F.shade(base, F.lambert(nf) * 0.9, 0.4, 0.5))
    # snow cap on the top rail (uniform along x in the stretchable columns)
    snow = F.sd_box(c.X, c.Y, W / 2, 25, W / 2 - 9, 6.0, 6.0)
    lumps = [F.sd_circle(c.X, c.Y, x, y, r) for x, y, r in ((18, 22, 7.5), (31, 20.5, 6.0), (W - 31, 20.5, 6.0),
                                                              (W - 18, 22, 7.5))]
    snow = F.smin(snow, U(*lumps), 3)
    drip = U(F.sd_ellipse(c.X, c.Y, 19, 32, 5, 6), F.sd_ellipse(c.X, c.Y, W - 21, 31, 4, 5))
    snow = F.smin(snow, drip, 2)
    c.shadow(c.cov(snow), dy=2.0, sigma=1.6, opacity=0.25)
    part(c, snow, ('#FFFFFF', '#DCE6F2', '#7E93B5'), ow=1.8, bevel=4, gloss=0.25, tint='#7E9CCC')
    for (x, y) in ((22, 50), (W - 22, 50), (22, H - 22), (W - 22, H - 22)):
        b = F.sd_circle(c.X, c.Y, x, y, 4.2)
        part(c, b, STEEL, ow=1.4, bevel=2, gloss=0.0, spec=0.4)
    return c.image()


BAR_W, BAR_H = 64, 30
BAR_MARGINS = dict(left=15, right=15, top=13, bottom=15)


def progress_bg():
    """Mission progress bar trough: dark inset pill (like ui_coin_bar)."""
    W, H = BAR_W, BAR_H
    c = F.Canvas(W, H)
    pill = F.sd_box(c.X, c.Y, W / 2, 14, W / 2 - 3, 11, 11)
    c.shadow(c.cov(pill), dy=1.5, sigma=1.4, opacity=0.25)
    c.fill(pill, hexc('#FFFFFF'), 0.85)
    inner = pill + 2.2
    t = np.clip((c.Y - 4) / 20, 0, 1)
    c.paint(c.cov(inner), F.mix(hexc('#3A4560'), hexc('#2A3248'), t), 0.85)
    c.paint(c.cov(inner) * np.clip(1 - (c.Y - 5) / 6, 0, 1), hexc('#141A28'), 0.45)
    return c.image()


def progress_fill():
    """Progress bar fill: glossy white pill - TINT it (gold / green) in the game; drawn inside ui_progress_bg with a
    2 px inset (same height minus 4)."""
    W, H = BAR_W, BAR_H
    c = F.Canvas(W, H)
    pill = F.sd_box(c.X, c.Y, W / 2, 14, W / 2 - 5.2, 8.8, 8.8)
    t = np.clip((c.Y - 5) / 18, 0, 1)
    base = F.ramp([(0, hexc('#FFFFFF')), (0.5, hexc('#F2F2F2')), (1, hexc('#C9C9C9'))], t)
    n = F.bevel_normals(pill, 3.5, c.px)
    c.paint(c.cov(pill), F.shade(base, F.lambert(n), 0.4, 0.25))
    gl = F.sd_box(c.X, c.Y, W / 2, 9.5, W / 2 - 12, 2.4, 2.4)
    c.paint(c.cov(gl, 0.6), WHITE, 0.9)
    return c.image()


NINE = {
    'ui_mission_card': (lambda: mission_card(False), CARD_MARGINS, [16, 12, 12, 20],
                        'Mission row card (9-slice, warm paper, orange tab on the left, red push-pin). Use >= 120 x 80.'),
    'ui_mission_card_done': (lambda: mission_card(True), CARD_MARGINS, [16, 12, 12, 20],
                             'Completed mission card: mint face, green tab, gold pin, check seal top-right. '
                             'Same size / margins as ui_mission_card (swap in place).'),
    'ui_mission_board': (mission_board, BOARD_MARGINS, [0, 0, 0, 0],
                         'Mission board panel (wooden frame + cork, snow on the top rail). Content area = inside the '
                         'cork: inset 26 px left/right, 46 px top, 30 px bottom. Use >= 140 x 140.'),
    'ui_progress_bg': (progress_bg, BAR_MARGINS, [0, 0, 0, 0], 'Progress bar trough (dark inset pill). Height 30 '
                                                               '(stretch width only, or keep height >= 28).'),
    'ui_progress_fill': (progress_fill, BAR_MARGINS, [0, 0, 0, 0],
                         'Progress bar fill, white -> TINT it (gold #FFC83D fame, green #5CC86A done). Same frame as '
                         'ui_progress_bg; set its width to 30 + (bgWidth - 30) * progress.'),
}


# =========================================================================== preview / manifest / build
def font(size=14):
    from PIL import ImageFont
    for p in ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def nine_stretch(img, m, w, h):
    """Phaser-style 9-slice stretch of a PIL image (corners fixed, edges / centre stretched)."""
    W, H = img.size
    L, R, T, B = m['left'], m['right'], m['top'], m['bottom']
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    xs = [(0, L, 0, L), (L, W - R, L, w - R), (W - R, W, w - R, w)]
    ys = [(0, T, 0, T), (T, H - B, T, h - B), (H - B, H, h - B, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 <= dx0 or dy1 <= dy0:
                continue
            piece = img.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.BILINEAR)
            out.alpha_composite(piece, (dx0, dy0))
    return out


def preview(icons, badges, nines, path):
    W = 1500
    H = 1460
    im = Image.new('RGBA', (W, H), (244, 247, 251, 255))
    d = ImageDraw.Draw(im)
    f12, f14, f18 = font(12), font(14), font(18)
    d.text((14, 8), 'ui3_sheet - CONTRACT_V5 §O mission & fame UI: icons on cream / dark / blue button, at 64-48-32 px; '
                    'rank badges; 9-slices at source size and stretched; mission board mock-up (text is drawn by the game)',
           font=f14, fill=(43, 47, 58))
    keys = list(icons)
    # row 1: icons on cream panel
    y = 34
    d.rounded_rectangle([8, y, W - 8, y + 270], 18, fill=(255, 248, 236, 255), outline=(228, 207, 171), width=3)
    for k, key in enumerate(keys):
        x = 20 + (k % 9) * 162
        yy = y + 12 + (k // 9) * 130
        im.alpha_composite(icons[key], (x, yy))
        d.text((x, yy + 98), key.replace('ui_icon_', ''), font=f12, fill=(43, 47, 58))
        sm = icons[key].resize((48, 48), Image.LANCZOS)
        im.alpha_composite(sm, (x + 100, yy + 10))
        xs = icons[key].resize((32, 32), Image.LANCZOS)
        im.alpha_composite(xs, (x + 108, yy + 62))
    # row 2: dark HUD + blue buttons
    y = 316
    d.rectangle([0, y, W, y + 200], fill=(43, 47, 58, 255))
    for k, key in enumerate(keys):
        x = 14 + k * 86
        im.alpha_composite(icons[key].resize((72, 72), Image.LANCZOS), (x, y + 10))
        btn = Image.new('RGBA', (78, 70), (0, 0, 0, 0))
        bd = ImageDraw.Draw(btn)
        bd.rounded_rectangle([2, 4, 76, 66], 18, fill=(36, 92, 166, 255))
        bd.rounded_rectangle([2, 2, 76, 60], 18, fill=(61, 139, 224, 255))
        btn.alpha_composite(icons[key].resize((52, 52), Image.LANCZOS), (13, 4))
        im.alpha_composite(btn, (x - 2, y + 100))
        im.alpha_composite(icons[key].resize((32, 32), Image.LANCZOS), (x + 20, y + 168 - 4))
    # row 3: badges on cream + dark
    y = 530
    d.rounded_rectangle([8, y, 760, y + 200], 18, fill=(255, 248, 236, 255), outline=(228, 207, 171), width=3)
    d.rectangle([768, y, W, y + 200], fill=(43, 47, 58, 255))
    for k, (key, b) in enumerate(badges.items()):
        im.alpha_composite(b, (20 + k * 146, y + 14))
        d.text((24 + k * 146, y + 150), key.replace('ui_badge_', ''), font=f12, fill=(43, 47, 58))
        d.text((24 + k * 146, y + 168), RANK_NAMES[k + 1].split(' (')[0], font=f12, fill=(110, 90, 60))
        im.alpha_composite(b.resize((96, 96), Image.LANCZOS), (780 + k * 104, y + 20))
        im.alpha_composite(b.resize((56, 56), Image.LANCZOS), (800 + k * 104, y + 130))
    # row 4: 9-slices at source size and stretched
    y = 748
    d.text((14, y), '9-slices at source size (margins shown in red) and stretched:', font=f14, fill=(43, 47, 58))
    x = 14
    for key, (img, m) in nines.items():
        im.alpha_composite(img, (x, y + 24))
        L, R, T, B = m['left'], m['right'], m['top'], m['bottom']
        w, h = img.size
        for xx in (x + L, x + w - R):
            d.line([(xx, y + 24), (xx, y + 24 + h)], fill=(255, 60, 90, 160))
        for yy in (y + 24 + T, y + 24 + h - B):
            d.line([(x, yy), (x + w, yy)], fill=(255, 60, 90, 160))
        d.text((x, y + 28 + h), key, font=f12, fill=(43, 47, 58))
        x += w + 30
    # mock-up: mission board with cards, icons, progress bars, badges
    y = 990
    board = nine_stretch(nines['ui_mission_board'][0], nines['ui_mission_board'][1], 760, 440)
    im.alpha_composite(board, (14, y))
    rows = [('ui_icon_delivery', False, 0.6, 'ui_icon_timer'), ('ui_icon_request', False, 0.3, 'ui_icon_heart_pair'),
            ('ui_icon_event', True, 1.0, 'ui_icon_ring'), ('ui_icon_goal', False, 0.8, 'ui_icon_calendar')]
    for k, (ic, done, prog, sub) in enumerate(rows):
        key = 'ui_mission_card_done' if done else 'ui_mission_card'
        card = nine_stretch(nines[key][0], nines[key][1], 680, 92)
        cy0 = y + 60 + k * 92
        im.alpha_composite(card, (54, cy0))
        im.alpha_composite(icons[ic].resize((64, 64), Image.LANCZOS), (82, cy0 + 8))
        im.alpha_composite(icons[sub].resize((30, 30), Image.LANCZOS), (160, cy0 + 14))
        d.rounded_rectangle([200, cy0 + 20, 420, cy0 + 32], 6, fill=(190, 170, 140, 255) if not done else (150, 200, 150))
        bgp = nine_stretch(nines['ui_progress_bg'][0], nines['ui_progress_bg'][1], 300, 30)
        im.alpha_composite(bgp, (160, cy0 + 44))
        fw = int(30 + (300 - 30) * prog)
        fill = nine_stretch(nines['ui_progress_fill'][0], nines['ui_progress_fill'][1], fw, 30)
        tint = (255, 200, 61) if not done else (92, 200, 106)
        fa = np.asarray(fill).astype(np.float32)
        fa[..., :3] = fa[..., :3] * np.array(tint, np.float32) / 255.0
        im.alpha_composite(Image.fromarray(fa.astype(np.uint8), 'RGBA'), (160, cy0 + 44))
        im.alpha_composite(icons['ui_icon_fame'].resize((40, 40), Image.LANCZOS), (500, cy0 + 22))
        d.text((544, cy0 + 32), '+%d' % (10 + 5 * k), font=f18, fill=(120, 70, 20))
        d.text((210, cy0 + 4), '', font=f12, fill=(0, 0, 0))
    # chief title panel mock-up
    px0 = 800
    d.rounded_rectangle([px0, y, W - 14, y + 440], 22, fill=(255, 248, 236, 255), outline=(199, 174, 136), width=4)
    im.alpha_composite(badges['ui_badge_rank_3'].resize((180, 180), Image.LANCZOS), (px0 + 30, y + 30))
    im.alpha_composite(icons['ui_icon_title'], (px0 + 240, y + 40))
    im.alpha_composite(icons['ui_icon_fame'], (px0 + 240, y + 150))
    bgp = nine_stretch(nines['ui_progress_bg'][0], nines['ui_progress_bg'][1], 300, 30)
    im.alpha_composite(bgp, (px0 + 350, y + 180))
    fill = nine_stretch(nines['ui_progress_fill'][0], nines['ui_progress_fill'][1], 210, 30)
    fa = np.asarray(fill).astype(np.float32)
    fa[..., :3] = fa[..., :3] * np.array((255, 200, 61), np.float32) / 255.0
    im.alpha_composite(Image.fromarray(fa.astype(np.uint8), 'RGBA'), (px0 + 350, y + 180))
    for k in range(1, 6):
        im.alpha_composite(badges['ui_badge_rank_%d' % k].resize((96, 96), Image.LANCZOS), (px0 + 24 + (k - 1) * 128,
                                                                                           y + 300))
    d.text((px0 + 30, y + 404), 'ranks 1 -> 5 (badges at 96 px)', font=f12, fill=(110, 90, 60))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.convert('RGB').save(path, optimize=True)


def build(only=None):
    os.makedirs(CACHE, exist_ok=True)
    icons = {k: fn() for k, fn, _ in ICONS if not only or k in only}
    badges = {k: fn() for k, fn, _ in BADGES if not only or k in only}
    nines = {k: (v[0](), v[1]) for k, v in NINE.items() if not only or k in only}
    for k, im in icons.items():
        assert im.size == (96, 96), k
    for k, im in badges.items():
        assert im.size == (128, 128), k
    if only:
        sheet = Image.new('RGBA', (20 + 200 * max(1, len(icons) + len(badges) + len(nines)), 300), (255, 248, 236, 255))
        x = 10
        for k, im in list(icons.items()) + list(badges.items()) + [(k, v[0]) for k, v in nines.items()]:
            sheet.alpha_composite(im.resize((im.width * 3 // 2, im.height * 3 // 2), Image.LANCZOS), (x, 10))
            x += 200 if im.width <= 128 else im.width * 3 // 2 + 10
        sheet.convert('RGB').save(os.path.join(CACHE, 'only.png'))
        print('scratch ->', os.path.join(CACHE, 'only.png'))
        return
    os.makedirs(OUT, exist_ok=True)
    frames = list(icons.items()) + list(badges.items())
    sheet, atlas = pack_utils.pack_atlas(frames, max_width=1024, padding=2)
    F.save_png(sheet, os.path.join(OUT, ATLAS + '.png'))
    atlas['meta']['image'] = ATLAS + '.png'
    with open(os.path.join(OUT, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    for k, (img, m) in nines.items():
        F.save_png(img, os.path.join(OUT, k + '.png'))
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_ui3.py',
        'conventions': {
            'text': 'No text is baked; the game renders all text (mission names, rewards, rank titles on the banners).',
            'iconSize': [96, 96], 'badgeSize': [128, 128],
            'style': 'House soft-toy style of assets/ui (fxlib.toy): dark tinted outline, bevel lit from the upper-left, '
                     'gloss, one navy drop shadow. Icons read at 32 px.',
            'nineSlice': '9-slice sources are plain images (not atlas frames). contentInset = [left, top, right, bottom] '
                         'px from the stretched edges where the game should lay out content.',
            'ranks': {str(n): RANK_NAMES[n] for n in RANK_NAMES},
        },
        'atlases': [{'key': ATLAS, 'png': 'ui3/%s.png' % ATLAS, 'json': 'ui3/%s.json' % ATLAS}],
        'images': [{'key': k, 'png': 'ui3/%s.png' % k} for k in nines],
        'sprites': {},
        'nineSlice': {},
    }
    for k, _, notes in ICONS:
        man['sprites'][k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon', 'frameSize': [96, 96],
                             'notes': notes}
    for k, _, notes in BADGES:
        man['sprites'][k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon', 'frameSize': [128, 128],
                             'rank': int(k[-1]), 'notes': notes}
    for k, (fn, m, inset, notes) in NINE.items():
        w, h = nines[k][0].size
        man['nineSlice'][k] = dict({'image': k}, **m)
        man['sprites'][k] = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'ui', 'frameSize': [w, h],
                             'minSize': [m['left'] + m['right'] + 4, m['top'] + m['bottom'] + 4],
                             'contentInset': inset, 'notes': notes}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    preview(icons, badges, nines, os.path.join(PREV, 'ui3_sheet.png'))
    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('%s: %dx%d, %d icons + %d badges, %d 9-slices; payload %.1f KB' % (
        ATLAS, sheet.size[0], sheet.size[1], len(icons), len(badges), len(nines), tot / 1024))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', help='comma separated keys -> scratch preview in tools/fx/_cache/ui3/only.png')
    a = ap.parse_args()
    build(set(a.only.split(',')) if a.only else None)
