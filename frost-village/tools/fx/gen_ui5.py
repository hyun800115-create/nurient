"""
gen_ui5.py - CONTRACT_V42 §AL: the v4.2 UI kit `ui5_icons` (18 icons + the panel frames of the 촌장 사무실 panel and
the v4.2 HUD), procedurally in the house "soft toy" style of assets/ui, ui2, ui3 and fx_city ui4_icons (fxlib.toy:
dark tinted outline, top -> bottom gradient lit by a rounded bevel from the shared upper-left sun, gloss, ONE soft
navy drop shadow per icon).  No text is baked anywhere - the game writes every label.

    python3 tools/fx/gen_ui5.py                 # icons + panels -> assets/ui5 (atlas + manifest) + previews + check
    python3 tools/fx/gen_ui5.py --no-preview    # assets + check only
    python3 tools/fx/gen_ui5.py --check         # check the delivered set (exit 1 on any error)
    python3 tools/fx/gen_ui5.py --look a,b      # scratch sheet of some keys -> <cache>/look_ui5.png
Outputs
    assets/ui5/ui5_icons.png / .json   one atlas (<= 1024 x 1024): 18 icons 96 x 96 (trimmed, sourceSize kept),
                                       panel frames UNTRIMMED (so Phaser NineSlice can use the atlas frame directly)
    assets/ui5/manifest.json           sprites (anchor, frameSize, notes, codeFallback), nineSlice + contentInset
    docs/previews/ui5_*.png            icon sheet (96 / 48 / 32 px on cream and night), panels stretched to 720 x 1100
Imports fxlib, gen_ui3 (palettes / canvas / part helpers), gen_ui4 (coin, box, pinecone helpers), emote_art and
gen_chief_fx (the atlas packer) READ-ONLY.  Cache: /tmp/fv_cache/ui5.  Deterministic.
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
TOOLS = os.path.dirname(HERE)
for p in (HERE, TOOLS):
    if p not in sys.path:
        sys.path.insert(0, p)
import fxlib as F                                       # noqa: E402
from fxlib import hexc, stroke                          # noqa: E402
import emote_art as EA                                  # noqa: E402
import gen_ui3 as U3                                    # noqa: E402
import gen_ui4 as U4                                    # noqa: E402
import gen_chief_fx as CF                               # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'ui5')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.environ.get('FV_UI5_CACHE', '/tmp/fv_cache/ui5')
ATLAS = 'ui5_icons'
WHITE = hexc('#FFFFFF')
U = F.union
canvas, shadow, part, rot, star = U3.canvas, U3.shadow, U3.part, U3.rot, U3.star
GOLD, RED, BLUE, GREEN, PINK = U3.GOLD, U3.RED, U3.BLUE, U3.GREEN, U3.PINK
SILVER, STEEL, WOOD, WOOD_D = U3.SILVER, U3.STEEL, U3.WOOD, U3.WOOD_D
PAPER, CREAM, NAVY, SKIN = U3.PAPER, U3.CREAM, U3.NAVY, U3.SKIN
TEAL = ('#8FEADF', '#25A595', '#0E4C47')
TEAL_D = ('#4FC9BA', '#167A70', '#0A3A36')
ORANGE = ('#FFD08A', '#F28C28', '#7A3A0E')
SKYB = ('#D6F0FF', '#7FB8F0', '#1F4F8E')
CHESTNUT = ('#E09466', '#A4502C', '#4A1E0E')
MITTEN = ('#FFFFFF', '#D7E2F0', '#4E6486')
FUR = ('#FFF8EA', '#E8D6B8', '#7A6244')
KRAFT = U4.KRAFT
TINT = {'teal': '#0E5A54', 'snow': '#7E9CCC', 'orange': '#B8501A', 'chestnut': '#6A2A10', 'sky': '#2A5FA8'}
INK = '#3A2A1E'


# =========================================================================== helpers
def glint(c, x, y, s, edge='#8E520A', tip='#FFD45A', a=1.0):
    EA.twinkle(c, x, y, s, a=a, edge=edge, tip=tip)


def snowflake_sd(c, x, y, r, w=1.6, rot_deg=0.0):
    """Six-armed snowflake with two little branches on each arm."""
    d = None
    for k in range(6):
        a = math.radians(rot_deg + 60 * k - 90)
        ca, sa = math.cos(a), math.sin(a)
        arm = F.sd_segment(c.X, c.Y, x, y, x + ca * r, y + sa * r, w)
        for f, L in ((0.55, 0.38), (0.8, 0.24)):
            bx, by = x + ca * r * f, y + sa * r * f
            for s in (-1, 1):
                b = a + s * math.radians(50)
                arm = np.minimum(arm, F.sd_segment(c.X, c.Y, bx, by, bx + math.cos(b) * r * L,
                                                   by + math.sin(b) * r * L, w * 0.8))
        d = arm if d is None else np.minimum(d, arm)
    return np.minimum(d, F.sd_circle(c.X, c.Y, x, y, w * 1.6))


def music_note(c, x, y, s, pal, ang=-10):
    """Eighth note (head at (x, y), stem up, flag) - soft toy material."""
    X, Y = F.rot(c.X, c.Y, x, y, math.radians(ang))
    head = F.sd_ellipse(*F.rot(X, Y, x, y, math.radians(-24)), x, y, 6.2 * s, 4.6 * s)
    stem = F.sd_box(X, Y, x + 4.6 * s, y - 11.5 * s, 1.5 * s, 11.5 * s, 0.6)
    flag = F.sd_polygon(X, Y, [(x + 3.4 * s, y - 23 * s), (x + 12.5 * s, y - 15 * s), (x + 11 * s, y - 11.5 * s),
                               (x + 5.8 * s, y - 16 * s)]) - 0.6 * s
    d = U(head, stem, flag)
    return d


def rail(c, y, x0=6, x1=90):
    """A short iron rail on two sleepers under the train-car icons."""
    sl = U(*[F.sd_box(c.X, c.Y, x, y + 3.5, 5.5, 2.2, 1.0) for x in (20, 48, 76)])
    part(c, sl, WOOD_D, ow=1.4, bevel=1.2, gloss=0.0, tint='wood')
    r = F.sd_box(c.X, c.Y, (x0 + x1) / 2, y, (x1 - x0) / 2, 1.8, 0.9)
    part(c, r, STEEL, ow=1.4, bevel=1.2, gloss=0.2, spec=0.3)


def wheel(c, x, y, r):
    part(c, F.sd_circle(c.X, c.Y, x, y, r), ('#5A6478', '#262C38', '#10141C'), ow=1.8, bevel=r * 0.4, gloss=0.15)
    part(c, F.sd_circle(c.X, c.Y, x, y, r * 0.42), STEEL, ow=1.0, bevel=1.4, gloss=0.2, spec=0.3)


def snow_cap(c, x0, x1, y, h=4.0, lumps=()):
    cap = F.sd_box(c.X, c.Y, (x0 + x1) / 2, y, (x1 - x0) / 2, h, h)
    for lx, ly, lr in lumps:
        cap = F.smin(cap, F.sd_circle(c.X, c.Y, lx, ly, lr), 2.0)
    part(c, cap, ('#FFFFFF', '#DCE6F2', '#7E93B5'), ow=1.4, bevel=2.2, gloss=0.2, tint='#7E9CCC')
    return cap


def mitten_sd(c, cx, cy, s=1.0, ang=0.0, thumb_side=-1):
    """Chubby mitten (fingers up): palm + thumb (on thumb_side) + fur cuff below.  Returns (hand, cuff)."""
    X, Y = F.rot(c.X, c.Y, cx, cy, math.radians(ang))
    palm = F.sd_box(X, Y, cx, cy - 2 * s, 15 * s, 20 * s, 14 * s)
    thumb = F.sd_ellipse(*F.rot(X, Y, cx + thumb_side * 16 * s, cy + 2 * s, math.radians(thumb_side * 35)),
                         cx + thumb_side * 16 * s, cy + 2 * s, 6.5 * s, 10.5 * s)
    hand = F.smin(palm, thumb, 3.5 * s)
    cuff = F.sd_box(X, Y, cx, cy + 23 * s, 16 * s, 6.5 * s, 5 * s)
    return hand, cuff, (X, Y)


# =========================================================================== icons (96 x 96)
def icon_binoculars():
    """관망 모드: chunky teal binoculars (front view) with a sparkle in the left lens."""
    c = canvas(0.95)
    barrels = [(29, 58), (67, 58)]
    bodies = [F.sd_box(c.X, c.Y, x, y - 6, 17, 22, 13) for x, y in barrels]
    tops = [F.sd_box(c.X, c.Y, x, 25, 10, 7, 4) for x, _ in barrels]
    bridge = F.sd_box(c.X, c.Y, 48, 42, 9, 9, 4)
    knob = F.sd_circle(c.X, c.Y, 48, 32, 5.5)
    rims = [F.sd_circle(c.X, c.Y, x, y + 6, 17.5) for x, y in barrels]
    allsh = U(*bodies, *tops, bridge, knob, *rims)
    shadow(c, allsh)
    for t in tops:
        part(c, t, ('#5A6478', '#2E3440', '#10141C'), ow=2.0, bevel=2.5, gloss=0.25)
    part(c, bridge, TEAL_D, ow=2.2, bevel=3, gloss=0.2, tint=TINT['teal'])
    part(c, knob, GOLD, ow=1.8, bevel=2.5, gloss=0.2, tint='gold', spec=0.3)
    for b in bodies:
        part(c, b, TEAL, ow=2.8, bevel=7, gloss=0.3, tint=TINT['teal'], spec=0.15)
    for (x, y), r in zip(barrels, rims):
        part(c, r, ('#5A6478', '#2E3440', '#10141C'), ow=2.4, bevel=4, gloss=0.0, spec=0.3)
        lens = F.sd_circle(c.X, c.Y, x, y + 6, 12.5)
        t = np.clip((c.Y - (y - 7)) / 26, 0, 1)
        n = F.bevel_normals(lens, 5, c.px)
        c.paint(c.cov(lens), F.shade(F.mix(hexc('#BDEBFF'), hexc('#2F6FC2'), t), F.lambert(n), 0.6, 0.45))
        EA.glossy_spot(c, x - 4.5, y + 0.5, 5.0, 2.6, -35, 0.85, 0.5)
        c.fill(F.sd_circle(c.X, c.Y, x + 5, y + 12, 1.6), WHITE, 0.7)
    glint(c, 31, 66, 8.5, edge='#1F5FA8', tip='#FFF3C4')
    return c.image()


def icon_hand():
    """줍기 / 자동 줍기: the chief's open white mitten (palm to us) with a small gold sparkle above the palm."""
    c = canvas(0.93)
    X, Y = rot(c, 46, 54, 10)
    palm = F.sd_box(X, Y, 48, 50, 20, 25, 18)
    thumb = F.sd_ellipse(*F.rot(X, Y, 23, 58, math.radians(-38)), 23, 58, 8.5, 14)
    hand = F.smin(palm, thumb, 3.0)
    cuff = F.sd_box(X, Y, 47, 82, 21, 7.5, 6)
    shadow(c, U(hand, cuff))
    part(c, hand, MITTEN, ow=3.0, bevel=9, gloss=0.35, tint=TINT['snow'])
    # the thumb's seam, a knitted band across the fingers and a soft palm pad
    c.fill(F.intersect(np.abs(F.sd_ellipse(*F.rot(X, Y, 23, 58, math.radians(-38)), 23, 58, 8.5, 14)) - 0.7,
                       F.sd_box(X, Y, 34, 62, 6, 14, 2)), hexc('#9FB2CE'), 0.9)
    c.fill(F.intersect(F.sd_box(X, Y, 48, 40, 20, 2.0, 0.8), palm + 2.5), hexc('#C7D6EA'), 0.9)
    for k in range(6):
        c.fill(F.intersect(F.sd_segment(X, Y, 31 + k * 6.5, 37.5, 34 + k * 6.5, 42.5, 0.6), palm + 3), hexc('#9FB2CE'), 0.8)
    c.fill(F.sd_ellipse(X, Y, 50, 61, 11, 9), hexc('#E9F0F9'), 0.85, feather=1.5)
    part(c, cuff, FUR, ow=2.4, bevel=4, gloss=0.15, tint='paper')
    for k in range(6):
        c.fill(F.intersect(F.sd_circle(X, Y, 31 + k * 6.5, 82 + (k % 2) * 1.5, 2.3), cuff + 0.8), hexc('#D8C2A0'), 0.6)
    glint(c, 74, 15, 10.5)
    glint(c, 56, 10, 5.0)
    return c.image()


def icon_route():
    """길 안내: a dotted trail of little boot prints curving up to a teal map pin."""
    c = canvas(0.94)
    pin_x, pin_y = 66, 36                                         # centre of the pin's round head
    pin = F.sd_teardrop(c.X, -c.Y + 2 * pin_y, pin_x, pin_y, 18, 37, tip=2.0)    # point down
    # boot prints alternating left / right along a curve that ends at the pin's tip
    path = [(15, 86), (25, 81), (35, 77.5), (45, 76), (55, 76.5), (63, 77)]
    prints = []
    for k in range(len(path) - 1):
        x, y = path[k]
        nx_, ny_ = path[k + 1][0] - x, path[k + 1][1] - y
        a = math.atan2(ny_, nx_)
        side = 2.6 if k % 2 == 0 else -2.6
        px_, py_ = x - math.sin(a) * side, y + math.cos(a) * side
        Xr, Yr = F.rot(c.X, c.Y, px_, py_, a)
        sole = F.sd_ellipse(Xr, Yr, px_ + 1.2, py_, 3.6, 2.3)
        heel = F.sd_ellipse(Xr, Yr, px_ - 3.8, py_, 1.7, 1.9)
        prints.append(U(sole, heel))
    allp = U(*prints)
    ground = F.sd_ellipse(c.X, c.Y, pin_x, 77.5, 9, 3.2)
    shadow(c, U(pin, allp))
    c.fill(ground, hexc('#0E4C47'), 0.25, feather=1.5)
    part(c, allp, ('#6A86B8', '#33508A', '#14244A'), ow=1.3, bevel=1.4, gloss=0.0)
    part(c, pin, TEAL, ow=3.0, bevel=7, gloss=0.3, tint=TINT['teal'], spec=0.15)
    hole = F.sd_circle(c.X, c.Y, pin_x, pin_y - 1, 8)
    c.fill(hole - 1.4, hexc('#0E4C47'))
    part(c, hole, ('#FFFFFF', '#E9F4F2', '#0E4C47'), ow=0, bevel=2.5, gloss=0.0, hi=0.4)
    part(c, F.sd_star(c.X, c.Y, pin_x, pin_y - 0.6, 5.2, 2.3, 5, rot=-math.pi / 2, round_=0.5),
         ('#FFF6C8', '#F5B83A', '#8E520A'), ow=0.9, bevel=1.2, gloss=0.0, hi=0.6)
    EA.glossy_spot(c, pin_x - 8.5, pin_y - 9.5, 5.0, 2.4, -40, 0.6, 0.8)
    glint(c, 86, 14, 5.5, edge='#0E4C47', tip='#C8F5EE')
    return c.image()


def icon_office():
    """촌장 사무실 / 업무: a little cream office with a teal roof, a gable clock and a window lit by a desk lamp."""
    c = canvas(0.93)
    walls = F.sd_box(c.X, c.Y, 48, 64, 30, 20, 3)
    roof = F.sd_polygon(c.X, c.Y, [(10, 48), (48, 18), (86, 48)]) - 3.0
    chimney = F.sd_box(c.X, c.Y, 70, 28, 4.5, 9, 1.5)
    step = F.sd_box(c.X, c.Y, 34, 86, 10, 2.5, 1.2)
    shadow(c, U(walls, roof, chimney, step))
    part(c, chimney, ('#E08A6A', '#B0503A', '#5A1E14'), ow=2.0, bevel=2, gloss=0.1)
    part(c, walls, ('#FFF8EA', '#EBD8B8', '#6A4A2A'), ow=2.6, bevel=5, gloss=0.15, tint='paper')
    part(c, roof, TEAL, ow=2.8, bevel=5, gloss=0.3, tint=TINT['teal'])
    snow = F.smin(F.sd_polygon(c.X, c.Y, [(30, 32), (48, 18), (66, 32)]) - 2.8, F.sd_circle(c.X, c.Y, 38, 32, 3.4), 2)
    part(c, snow, ('#FFFFFF', '#DCE6F2', '#7E93B5'), ow=1.4, bevel=2, gloss=0.2, tint='#7E9CCC')
    clock = F.sd_circle(c.X, c.Y, 48, 37, 6.0)
    part(c, clock, ('#FFFDF6', '#EFE6D2', '#6A4A2A'), ow=1.8, bevel=2, gloss=0.0)
    c.fill(F.sd_segment(c.X, c.Y, 48, 37, 48, 33, 0.8), hexc(INK))
    c.fill(F.sd_segment(c.X, c.Y, 48, 37, 51, 38, 0.8), hexc(INK))
    # lit window with a desk lamp inside
    win = F.sd_box(c.X, c.Y, 62, 62, 10, 9, 2)
    c.fill(win - 1.6, hexc('#6A4A2A'))
    t = np.clip((c.Y - 53) / 18, 0, 1)
    c.paint(c.cov(win), F.mix(hexc('#FFF6C4'), hexc('#FFB43D'), t))
    c.paint(np.exp(-((c.X - 60) ** 2 + (c.Y - 61) ** 2) / 40) * c.cov(win), WHITE, 0.6)
    shade = F.sd_polygon(c.X, c.Y, [(56, 62), (59, 56), (64, 56), (66, 62)]) - 0.4
    c.fill(F.intersect(shade, win), hexc('#2E8F84'))
    c.fill(F.intersect(F.sd_segment(c.X, c.Y, 61, 62, 61, 69, 0.8), win), hexc('#4A3420'))
    c.fill(F.intersect(F.sd_box(c.X, c.Y, 62, 69.5, 7, 1.2, 0.4), win), hexc('#8A5A33'))
    c.fill(U(F.sd_box(c.X, c.Y, 62, 62, 0.7, 9, 0.1)), hexc('#6A4A2A'), 0.55)
    door = F.sd_box(c.X, c.Y, 34, 72, 7, 12, 2.5)
    part(c, door, TEAL_D, ow=1.8, bevel=2, gloss=0.2, tint=TINT['teal'])
    c.fill(F.sd_circle(c.X, c.Y, 38, 73, 1.1), hexc('#FFD45A'))
    part(c, step, STEEL, ow=1.4, bevel=1.2, gloss=0.1)
    return c.image()


def icon_letter():
    """편지: a cream envelope with a red heart wax seal."""
    c = canvas(0.95)
    X, Y = rot(c, 48, 52, -7)
    env = F.sd_box(X, Y, 48, 54, 36, 25, 4)
    shadow(c, env)
    part(c, env, ('#FFFCF2', '#F1E2C4', '#7A5A36'), ow=2.8, bevel=4, gloss=0.15, tint='paper')
    # back flaps (diagonal folds) + the top flap
    for a, b in (((12.5, 77), (48, 54)), ((83.5, 77), (48, 54))):
        c.fill(F.intersect(F.sd_segment(X, Y, a[0], a[1], b[0], b[1], 0.8), env + 1.5), hexc('#C9AE84'), 0.85)
    flap = F.intersect(F.sd_polygon(X, Y, [(12, 30), (84, 30), (48, 58)]) - 1.0, env + 0.5)
    c.shadow(c.cov(flap), dy=2.0, sigma=1.4, opacity=0.25)
    t = np.clip((Y - 30) / 28, 0, 1)
    c.paint(c.cov(flap), F.mix(hexc('#FFFDF8'), hexc('#EEDDBC'), t))
    c.fill(np.abs(flap) - 0.6, hexc('#B89A6E'), 0.8)
    seal = F.sd_circle(X, Y, 48, 56, 10.5)
    wobble = seal + 0.9 * np.sin(np.arctan2(Y - 56, X - 48) * 7)
    c.shadow(c.cov(wobble), dy=1.6, sigma=1.0, opacity=0.35)
    part(c, wobble, RED, ow=1.8, bevel=3, gloss=0.0, hi=0.55, spec=0.3)
    EA.heart(c, 48, 55.5, 9.5, rot_deg=-7, ow=1.2, pal='pink')
    glint(c, 80, 22, 5.5, edge='#A0201A', tip='#FFC0D6')
    return c.image()


def icon_inventory():
    """재고: a clipboard with four coloured stock bars (red, orange, blue, green)."""
    c = canvas(0.92)
    board = F.sd_box(c.X, c.Y, 48, 53, 30, 38, 8)
    paper = F.sd_box(c.X, c.Y, 48, 57, 23, 29, 3)
    clip = F.sd_box(c.X, c.Y, 48, 19, 15, 7, 3.5)
    loop = F.intersect(np.abs(F.sd_circle(c.X, c.Y, 48, 11, 6.0)) - 2.4, c.Y - 13)
    clipall = U(clip, loop)
    shadow(c, U(board, clipall))
    part(c, board, WOOD, bevel=6, gloss=0.2, tint='wood')
    c.shadow(c.cov(paper), dy=1.5, sigma=1.0, opacity=0.25)
    part(c, paper, PAPER, ow=1.6, bevel=3, gloss=0.0, hi=0.4, lo=0.25, tint='paper')
    bars = [(RED, 0.38), (ORANGE, 0.62), (BLUE, 0.92), (GREEN, 0.74)]
    for k, (pal, f) in enumerate(bars):
        y = 39 + k * 11.5
        c.fill(F.sd_box(c.X, c.Y, 48, y, 17.5, 3.6, 2.0), hexc('#E6DCC6'))
        L = 35 * f
        d = F.sd_box(c.X, c.Y, 31 + L / 2, y, L / 2, 3.6, 2.6)
        part(c, d, pal, ow=1.4, bevel=1.8, gloss=0.35, hi=0.55)
    part(c, clipall, STEEL, ow=2.6, bevel=3.5, gloss=0.35, spec=0.3, tint='silver')
    c.fill(F.sd_box(c.X, c.Y, 48, 21, 9, 1.4, 0.7), hexc('#7C889C'), 0.8)
    return c.image()


def icon_news():
    """서리 소식: the village paper folded in half, a big snowflake emblem on its blue masthead."""
    c = canvas(0.95)
    X, Y = rot(c, 48, 50, -6)
    back = F.sd_box(X, Y, 52, 54, 31, 30, 3)
    page = F.sd_box(X, Y, 46, 51, 31, 31, 3)
    shadow(c, U(back, page))
    part(c, back, ('#E9E2D2', '#CFC4AA', '#6E5E44'), ow=2.2, bevel=2, gloss=0.0, hi=0.3)
    part(c, page, ('#FFFDF6', '#EFE6D2', '#6E5E44'), ow=2.6, bevel=2.5, gloss=0.0, hi=0.35, lo=0.3, tint='paper')
    mast = F.intersect(F.sd_box(X, Y, 46, 31, 28, 9, 2), page + 1.6)
    t = np.clip((Y - 22) / 18, 0, 1)
    c.paint(c.cov(mast), F.mix(hexc('#7FB8F0'), hexc('#2F6FC2'), t))
    c.fill(F.sd_box(X, Y, 54, 28.5, 14, 2.0, 1.0), WHITE, 0.85)
    c.fill(F.sd_box(X, Y, 52, 34.5, 12, 1.4, 0.7), WHITE, 0.6)
    sf = snowflake_sd(c, 26, 30, 9.5, w=1.5, rot_deg=-6)
    c.fill(sf - 1.4, hexc('#143B74'))
    c.fill(sf, WHITE)
    # fold crease down the middle + text columns
    c.fill(F.intersect(F.sd_box(X, Y, 46, 62, 0.6, 20, 0.2), page), hexc('#BFB49A'), 0.9)
    c.paint(c.cov(F.intersect(F.sd_box(X, Y, 49, 62, 3, 20, 0.2), page)), hexc('#000000'), 0.05)
    for k in range(5):
        c.fill(F.sd_box(X, Y, 31, 46 + k * 5.5, 11, 1.1, 0.5), hexc('#8A8A96'), 0.8)
        c.fill(F.sd_box(X, Y, 61, 46 + k * 5.5, 11, 1.1, 0.5), hexc('#8A8A96'), 0.8)
    ph = F.sd_box(X, Y, 61, 74, 10, 4.5, 1)
    c.fill(ph - 0.9, hexc('#5E6A80'))
    c.fill(ph, hexc('#A9C2DE'))
    glint(c, 82, 18, 5.5, edge='#1F5FA8', tip='#D6F0FF')
    return c.image()


def icon_bank():
    """서리 은행: a small civic building - columns, steps, a pediment - under a gold coin dome."""
    c = canvas(0.95)
    base = F.sd_box(c.X, c.Y, 48, 66, 32, 16, 2)
    steps = F.sd_box(c.X, c.Y, 48, 85, 36, 3.5, 1.5)
    ped = F.sd_polygon(c.X, c.Y, [(13, 48), (48, 36), (83, 48)]) - 2.4
    coin = F.sd_circle(c.X, c.Y, 48, 26, 15)
    shadow(c, U(base, steps, ped, coin))
    part(c, base, ('#FFFDF6', '#E3D9C6', '#5A5040'), ow=2.6, bevel=4, gloss=0.1, tint='paper')
    for x in (26, 40, 56, 70):
        col = F.sd_box(c.X, c.Y, x, 67, 3.6, 12.5, 1.2)
        part(c, col, ('#FFFFFF', '#D8D2C2', '#5A5040'), ow=1.4, bevel=2, gloss=0.2, spec=0.2)
    c.fill(F.sd_box(c.X, c.Y, 48, 67, 6.5, 12, 1.0) + 0.0, hexc('#6A5A44'), 0.0)
    door = F.sd_box(c.X, c.Y, 48, 71, 5, 8.5, 2.5)
    part(c, door, ('#7AA6E0', '#2F5FA8', '#143B74'), ow=1.4, bevel=1.5, gloss=0.2)
    part(c, steps, STEEL, ow=1.8, bevel=1.5, gloss=0.1)
    c.fill(F.sd_box(c.X, c.Y, 48, 81.5, 33, 1.0, 0.4), hexc('#8E96A3'), 0.8)
    # gold coin dome sitting on the pediment
    part(c, ped, ('#FFF8EA', '#E8D8B8', '#5A5040'), ow=2.4, bevel=3, gloss=0.15, tint='paper')
    U4.coin_face(c, 48, 26, 15, ow=2.6)
    c.fill(F.sd_box(c.X, c.Y, 48, 50.5, 33, 2.4, 1.0), hexc('#C9B892'))
    EA.glossy_spot(c, 41, 18, 4.5, 2.2, -38, 0.7, 0.6)
    glint(c, 74, 16, 6.5)
    return c.image()


def head(c, x, y, r, hair_pal, style):
    face = F.sd_circle(c.X, c.Y, x, y, r)
    if style == 'boy':
        hair = F.intersect(F.sd_circle(c.X, c.Y, x, y - 2.5, r + 2.0), c.Y - (y - r * 0.15))
        hair = F.smin(hair, F.sd_ellipse(c.X, c.Y, x - r * 0.3, y - r * 0.4, r * 0.65, r * 0.42), 2)
    else:
        hair = F.smin(F.intersect(F.sd_circle(c.X, c.Y, x, y - 1.5, r + 2.4), c.Y - (y + r * 0.55)),
                      U(F.sd_ellipse(c.X, c.Y, x - r * 0.95, y + r * 0.35, r * 0.38, r * 0.6),
                        F.sd_ellipse(c.X, c.Y, x + r * 0.95, y + r * 0.35, r * 0.38, r * 0.6)), 2)
    return face, hair


def paint_head(c, x, y, r, hair_pal, style):
    face, hair = head(c, x, y, r, hair_pal, style)
    part(c, hair, hair_pal, ow=2.2, bevel=4, gloss=0.25, tint='wood')
    part(c, face, ('#FFE8D2', '#F6C29C', '#8E4A2A'), ow=2.2, bevel=5, gloss=0.0, hi=0.4)
    # fringe over the forehead
    fr = F.intersect(F.sd_circle(c.X, c.Y, x, y - r * 0.95, r * 0.85), face + 0.5)
    if style == 'boy':
        fr = F.intersect(F.sd_ellipse(c.X, c.Y, x - r * 0.2, y - r * 0.85, r * 0.95, r * 0.5), face + 0.5)
    part(c, fr, hair_pal, ow=0, bevel=2, gloss=0.2, tint='wood')
    EA.eye_dot(c, x - r * 0.36, y + r * 0.12, r * 0.13, r * 0.17)
    EA.eye_dot(c, x + r * 0.36, y + r * 0.12, r * 0.13, r * 0.17)
    EA.cheeks(c, x, y + r * 0.42, r * 0.55, 0, rx=r * 0.2, ry=r * 0.12, a=0.6)
    c.fill(F.sd_arc(c.X, c.Y, x, y + r * 0.32, r * 0.2, math.radians(30), math.radians(150), 0.7), hexc('#8E2C1E'))
    return face, hair


def icon_staff():
    """직원: two friendly heads side by side - one in a suit with a tie, one with a bow in her hair."""
    c = canvas(0.95)
    # shoulders
    sh1 = F.sd_box(c.X, c.Y, 33, 79, 18, 9.5, 9)
    sh2 = F.sd_box(c.X, c.Y, 64, 81, 17, 8.5, 8.5)
    h1 = F.sd_circle(c.X, c.Y, 33, 47, 18)
    h2 = F.sd_circle(c.X, c.Y, 64, 51, 17)
    bow = U(F.sd_ellipse(*rot(c, 70, 31, 25), 70, 31, 7, 4.6), F.sd_ellipse(*rot(c, 82, 35, -25), 82, 35, 7, 4.6))
    shadow(c, U(sh1, sh2, h1, h2, bow))
    part(c, sh2, ('#FFF0D8', '#F2C9A0', '#7A4A2A'), ow=2.4, bevel=4, gloss=0.15)       # cream sweater
    c.fill(F.intersect(F.sd_box(c.X, c.Y, 64, 75, 5, 3, 2), sh2), hexc('#E8B08A'), 0.9)
    part(c, sh1, ('#6F8FC8', '#2E4A86', '#14244A'), ow=2.4, bevel=4, gloss=0.2)        # navy suit
    collar = F.intersect(F.sd_polygon(c.X, c.Y, [(25, 70), (33, 81), (41, 70)]) - 0.5, sh1)
    c.fill(collar, WHITE)
    tie = F.sd_polygon(c.X, c.Y, [(31, 72), (35, 72), (37, 84), (33, 88), (29, 84)]) - 0.4
    part(c, F.intersect(tie, sh1 + 1), RED, ow=1.2, bevel=1.2, gloss=0.3)
    paint_head(c, 64, 51, 17, ('#FFC57A', '#C9822E', '#5A3010'), 'girl')
    paint_head(c, 33, 47, 18, ('#7A5236', '#3E2614', '#1E1008'), 'boy')
    part(c, bow, PINK, ow=1.8, bevel=2, gloss=0.3)
    part(c, F.sd_circle(c.X, c.Y, 76, 33, 3.2), PINK, ow=1.4, bevel=1.4, gloss=0.3, hi=0.6)
    return c.image()


def icon_halo():
    """촌장 후광 setting: a little chief (white parka, dark hair) standing in the middle of an aurora ring."""
    c = canvas(0.93)
    ring_y, rx, ry, t = 76, 38, 13, 3.3
    d_ring, nx, ny, u = CF.ellipse_param(c, 48, ring_y, rx, ry)
    band = np.abs(d_ring) - t
    lam, n = CF.tube_light(nx, ny, d_ring / t)
    base = CF.cyc_ramp([CF.MINT, CF.SKY, CF.LILAC], u + 0.15)
    col = np.clip(base + (1 - base) * np.clip(lam, 0, None)[..., None] * 0.55
                  - base * np.clip(-lam, 0, None)[..., None] * 0.35, 0, 1)
    glow = np.exp(-0.5 * (np.maximum(band, 0) / 3.0) ** 2)
    c.paint(glow, hexc('#BFF5EC'), 0.35)
    back = (c.Y < ring_y)
    c.fill(np.where(back, band - 1.5, 9), CF.TEAL_RIM, 0.85)
    c.paint(c.cov(np.where(back, band, 9)), col)
    # the chief (small, centred on the ring)
    s, cx, fy = 0.82, 48, 76
    body = F.smin(F.sd_box(c.X, c.Y, cx, fy - 18 * s, 12 * s, 14 * s, 8 * s),
                  F.sd_ellipse(c.X, c.Y, cx, fy - 10 * s, 13.5 * s, 6 * s), 3)
    boots = U(F.sd_ellipse(c.X, c.Y, cx - 5 * s, fy - 2.5 * s, 4.6 * s, 3.2 * s),
              F.sd_ellipse(c.X, c.Y, cx + 5 * s, fy - 2.5 * s, 4.6 * s, 3.2 * s))
    hy = fy - 43 * s
    hd = F.sd_circle(c.X, c.Y, cx, hy, 13 * s)
    hair = F.intersect(F.sd_circle(c.X, c.Y, cx, hy - 2.5 * s, 14.2 * s), c.Y - (hy + 0.5 * s))
    sil = U(body, boots, hd, hair)
    c.fill(F.sd_ellipse(c.X, c.Y, cx, fy, 15 * s, 4.5 * s), hexc('#1B2840'), 0.25, feather=2)
    c.shadow(c.cov(sil - 2.0), dy=1.5, sigma=1.4, opacity=0.25)
    part(c, boots, ('#7A5236', '#4A2E18', '#1E1008'), ow=1.6, bevel=1.5, gloss=0.2)
    part(c, body, MITTEN, ow=2.4, bevel=5, gloss=0.25, tint=TINT['snow'])
    c.fill(F.intersect(F.sd_box(c.X, c.Y, cx, fy - 15 * s, 13 * s, 1.6, 0.8), body + 0.5), hexc('#7A5236'))
    c.fill(F.intersect(F.sd_ellipse(c.X, c.Y, cx, fy - 30 * s, 10 * s, 3.6 * s), body + 0.5), hexc('#F2E6D2'))
    part(c, hd, ('#FFE8D2', '#F6C29C', '#8E4A2A'), ow=2.2, bevel=4, gloss=0.0, hi=0.4)
    part(c, hair, ('#5A4030', '#2A1A10', '#120A06'), ow=2.0, bevel=3, gloss=0.3)
    EA.eye_dot(c, cx - 4.4 * s, hy + 2.5 * s, 1.6, 2.1)
    EA.eye_dot(c, cx + 4.4 * s, hy + 2.5 * s, 1.6, 2.1)
    EA.cheeks(c, cx, hy + 6.3 * s, 7 * s, 0, rx=2.2, ry=1.3, a=0.6)
    front = ~back
    c.fill(np.where(front, band - 1.5, 9), CF.TEAL_RIM, 0.85)
    c.paint(c.cov(np.where(front, band, 9)), col)
    c.paint(c.cov(np.abs(d_ring + t + 0.5) - 0.5) * front, CF.GOLD_IN, 0.6)
    for x, y, sz in ((12, 72, 4.6), (84, 80, 4.0), (78, 64, 3.0), (30, 88, 3.2)):
        glint(c, x, y, sz, edge='#1F8F86', tip='#FFF3C4')
    glint(c, 72, 22, 7.0)
    return c.image()


def icon_cheer():
    """촌장 응원: a raised white mitten (cheering) with two music notes."""
    c = canvas(0.94)
    hand, cuff, (X, Y) = mitten_sd(c, 38, 50, 1.0, ang=-12, thumb_side=1)
    n1 = music_note(c, 72, 44, 1.0, GOLD, ang=8)
    n2 = music_note(c, 63, 74, 0.8, TEAL, ang=-6)
    lines = U(*[F.sd_segment(c.X, c.Y, 16 + 2 * k, 28 - 6 * k, 10 + 2 * k, 24 - 7 * k, 1.4) for k in range(2)])
    shadow(c, U(hand, cuff, n1, n2))
    part(c, hand, MITTEN, ow=3.0, bevel=7, gloss=0.3, tint=TINT['snow'])
    c.fill(F.sd_ellipse(X, Y, 37, 56, 8.5, 7), hexc('#E7EEF8'), 0.9)
    part(c, cuff, FUR, ow=2.4, bevel=3.5, gloss=0.15, tint='paper')
    part(c, n1, ('#FFF0A0', '#F5A623', '#8E520A'), ow=2.2, bevel=2.5, gloss=0.3, hi=0.6, tint='gold')
    part(c, n2, TEAL, ow=2.0, bevel=2.2, gloss=0.3, hi=0.6, tint=TINT['teal'])
    c.fill(lines, hexc('#7FB8F0'), 0.9)
    glint(c, 84, 18, 5.5)
    return c.image()


def icon_depot():
    """물류창고: a blue warehouse (barrel roof, ribbed walls) with an orange crate in its open door."""
    c = canvas(0.93)
    walls = F.sd_box(c.X, c.Y, 48, 64, 38, 21, 3)
    roof = F.intersect(F.sd_ellipse(c.X, c.Y, 48, 46, 42, 22), c.Y - 46)
    roof = F.smin(roof, F.sd_box(c.X, c.Y, 48, 46, 41, 3, 2), 2)
    shadow(c, U(walls, roof))
    part(c, walls, ('#9CCBFF', '#3D7FD0', '#163E78'), ow=2.6, bevel=5, gloss=0.15, tint='blue')
    for x in range(16, 84, 6):
        c.fill(F.intersect(F.sd_box(c.X, c.Y, x, 64, 0.7, 19, 0.3), walls + 2), hexc('#2E64AE'), 0.45)
    part(c, roof, ('#E6EEF8', '#A8B8CE', '#3A4A66'), ow=2.6, bevel=4, gloss=0.3, tint='#5A6E92')
    for k in range(-3, 4):
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, 48 + k * 11, 26, 48 + k * 13.5, 46, 0.7), roof + 1.5),
               hexc('#7E8EA8'), 0.6)
    snow_cap(c, 22, 74, 26.5, 3.4, lumps=((30, 25, 4), (60, 24, 4.5)))
    door = F.sd_box(c.X, c.Y, 48, 70, 15, 15, 2)
    c.fill(door - 2.2, hexc('#163E78'))
    t = np.clip((c.Y - 55) / 30, 0, 1)
    c.paint(c.cov(door), F.mix(hexc('#1C2638'), hexc('#3A4860'), t))
    for k in range(3):                                            # rolled-up shutter
        c.fill(F.sd_box(c.X, c.Y, 48, 57 + k * 2.4, 15.5, 0.9, 0.4), hexc('#9AB0CE'), 0.95)
    U4.box_iso(c, 50, 85, 13, 17, 13, pal=ORANGE)
    c.fill(F.sd_box(c.X, c.Y, 14, 44, 3, 3, 1), hexc('#FFD45A'))                       # little lamp
    glint(c, 84, 16, 5.5, edge='#163E78', tip='#D6F0FF')
    return c.image()


def icon_sleigh():
    """화물 썰매: a pony head pulling a little sleigh with a crate on it."""
    c = canvas(0.93)
    runner = F.sd_polyline(c.X, c.Y, [(38, 80), (82, 80), (88, 76), (89, 70)], 2.2)
    curl = F.intersect(np.abs(F.sd_circle(c.X, c.Y, 34, 74, 6.0)) - 2.2, -(c.X - 34))
    runners = U(runner, curl)
    struts = U(F.sd_box(c.X, c.Y, 50, 75, 1.6, 4, 0.6), F.sd_box(c.X, c.Y, 74, 75, 1.6, 4, 0.6))
    bed = F.sd_box(c.X, c.Y, 62, 69, 24, 4, 2)
    shaft = F.sd_segment(c.X, c.Y, 38, 66, 24, 60, 1.6)
    # pony head (facing left), neck down to the sleigh
    neck = F.sd_polygon(c.X, c.Y, [(22, 38), (34, 36), (36, 62), (20, 62)]) - 3
    muzzle = F.sd_ellipse(*rot(c, 14, 42, -20), 14, 42, 9.5, 7.5)
    skull = F.sd_ellipse(c.X, c.Y, 24, 31, 10.5, 9.5)
    ear = F.sd_polygon(c.X, c.Y, [(25, 19), (29, 11), (32, 22)]) - 1.5
    pony = F.smin(F.smin(skull, muzzle, 4), neck, 4)
    allsh = U(runners, struts, bed, shaft, pony, ear, F.sd_box(c.X, c.Y, 62, 54, 14, 12, 2))
    shadow(c, allsh)
    part(c, runners, ('#FF8E7E', '#C9362C', '#5A1410'), ow=1.6, bevel=1.5, gloss=0.3, tint='red')
    part(c, struts, WOOD_D, ow=1.2, bevel=1, gloss=0.0, tint='wood')
    part(c, shaft, WOOD_D, ow=1.2, bevel=1, gloss=0.0, tint='wood')
    part(c, bed, WOOD, ow=2.0, bevel=2, gloss=0.2, tint='wood')
    box = F.sd_box(c.X, c.Y, 62, 54, 14, 11, 2)
    part(c, box, WOOD, ow=2.2, bevel=3, gloss=0.2, tint='wood')
    inner = F.sd_box(c.X, c.Y, 62, 54, 10.5, 7.5, 1)
    stroke(c, inner, 1.2, '#7A4A28', 0.7)
    c.fill(np.maximum(F.sd_segment(c.X, c.Y, 52.5, 61, 71.5, 47, 1.3), inner), hexc('#8A5A33'), 0.7)
    snow_cap(c, 50, 74, 42.5, 2.6, lumps=((56, 42, 3.2),))
    part(c, ear, ('#C98F55', '#8A5A33', '#3C2414'), ow=1.6, bevel=1.5, gloss=0.0)
    part(c, pony, ('#D9A066', '#9A5E2A', '#4A2810'), ow=2.6, bevel=5, gloss=0.25, tint='wood')
    mane = U(*[F.sd_circle(c.X, c.Y, 32 + k * 0.6, 24 + k * 7, 4.2) for k in range(5)])
    part(c, F.intersect(mane, -(c.X - 39)), ('#5A3A22', '#2E1A0C', '#140A04'), ow=1.4, bevel=2, gloss=0.2)
    c.fill(F.sd_ellipse(*rot(c, 13, 33, -20), 13, 33, 2.4, 6), WHITE, 0.95)                # white blaze
    EA.eye_dot(c, 21, 29, 2.0, 2.6)
    c.fill(F.sd_ellipse(c.X, c.Y, 9, 45, 1.4, 1.0), hexc('#3C2414'))
    c.fill(F.sd_box(*rot(c, 26, 56, -10), 26, 56, 9.5, 2.2, 1), hexc('#C9362C'))           # collar
    part(c, F.sd_circle(c.X, c.Y, 26, 60, 3.0), GOLD, ow=1.2, bevel=1.4, gloss=0.2, spec=0.4)  # sleigh bell
    return c.image()


def train_body(c, body_pal, roof_pal, x0=8, x1=88, y0=38, y1=70, roof_h=7):
    cx, w = (x0 + x1) / 2, (x1 - x0) / 2
    body = F.sd_box(c.X, c.Y, cx, (y0 + y1) / 2, w, (y1 - y0) / 2, 4)
    roof = F.smin(F.sd_box(c.X, c.Y, cx, y0 - 1, w + 2, roof_h / 2, roof_h / 2),
                  F.sd_box(c.X, c.Y, cx, y0 - roof_h / 2 - 1, w - 6, roof_h / 2, roof_h / 2), 2)
    under = F.sd_box(c.X, c.Y, cx, y1 + 3, w - 8, 3, 1.5)
    return body, roof, under


def car_icon(kind):
    c = canvas(0.92)
    if kind == 'coach':
        body, roof, under = train_body(c, SKYB, TEAL)
    elif kind == 'boxcar':
        body, roof, under = train_body(c, CHESTNUT, STEEL, y0=34, roof_h=6)
    else:
        body = F.sd_box(c.X, c.Y, 48, 66, 40, 4.5, 2)
        roof, under = None, F.sd_box(c.X, c.Y, 48, 73, 32, 3, 1.5)
    wheels = [(20, 78), (31, 78), (65, 78), (76, 78)]
    crates = []
    if kind == 'flatcar':
        crates = [(24, 52, 13, 10, WOOD), (50, 50, 12, 12, ORANGE), (74, 53, 12, 9, ('#9FD0FF', '#3D8BE0', '#163E78'))]
    allsh = U(body, under, *([roof] if roof is not None else []),
              *[F.sd_circle(c.X, c.Y, x, y, 6) for x, y in wheels],
              *[F.sd_box(c.X, c.Y, x, y, w, h, 2) for x, y, w, h, _ in crates])
    shadow(c, allsh)
    rail(c, 85)
    part(c, under, ('#5A6478', '#2E3440', '#10141C'), ow=1.6, bevel=1.2, gloss=0.1)
    for x, y in wheels:
        wheel(c, x, y, 6)
    c.fill(U(F.sd_box(c.X, c.Y, 4, 66, 4, 1.6, 0.8), F.sd_box(c.X, c.Y, 92, 66, 4, 1.6, 0.8)), hexc('#3A4352'))  # couplers
    if kind == 'coach':
        part(c, body, SKYB, ow=2.6, bevel=5, gloss=0.25, tint=TINT['sky'])
        c.fill(F.intersect(F.sd_box(c.X, c.Y, 48, 63, 40, 2.2, 0.5), body + 0.5), hexc('#2CB7A8'), 0.95)
        for x in (19, 33, 47, 61, 75):
            win = F.sd_box(c.X, c.Y, x, 49, 5.2, 6.2, 2)
            c.fill(win - 1.4, hexc('#1F4F8E'))
            t = np.clip((c.Y - 43) / 12, 0, 1)
            c.paint(c.cov(win), F.mix(hexc('#FFF6C4'), hexc('#FFB43D'), t))
            c.fill(F.sd_box(c.X, c.Y, x - 1.5, 46, 1.2, 2.2, 0.6), WHITE, 0.7)
        part(c, roof, TEAL, ow=2.4, bevel=3, gloss=0.3, tint=TINT['teal'])
        snow_cap(c, 18, 78, 29.5, 2.4, lumps=((30, 29, 3.0), (62, 29, 2.8)))
    elif kind == 'boxcar':
        part(c, body, CHESTNUT, ow=2.6, bevel=5, gloss=0.2, tint=TINT['chestnut'])
        for x in range(13, 88, 6):
            c.fill(F.intersect(F.sd_box(c.X, c.Y, x, 52, 0.6, 17, 0.3), body + 2.5), hexc('#6A2A10'), 0.45)
        door = F.sd_box(c.X, c.Y, 48, 53, 14, 14, 1.5)
        part(c, door, ('#D47A4C', '#8A3E1C', '#3E160A'), ow=2.0, bevel=2, gloss=0.15)
        xb = U(F.sd_segment(c.X, c.Y, 36, 41, 60, 65, 1.6), F.sd_segment(c.X, c.Y, 60, 41, 36, 65, 1.6),
               np.abs(F.sd_box(c.X, c.Y, 48, 53, 12, 12, 1)) - 1.4)
        c.fill(F.intersect(xb, door + 0.5), hexc('#F2E6D2'), 0.95)
        c.fill(F.sd_box(c.X, c.Y, 48, 38.5, 17, 1.4, 0.6), hexc('#3A4352'))          # door rail
        part(c, roof, STEEL, ow=2.2, bevel=2.5, gloss=0.3, spec=0.2)
        snow_cap(c, 14, 82, 27.5, 2.4, lumps=((40, 27, 3.0), (70, 27, 2.6)))
    else:
        part(c, body, WOOD, ow=2.4, bevel=2.5, gloss=0.2, tint='wood')
        for x in range(14, 84, 7):
            c.fill(F.intersect(F.sd_box(c.X, c.Y, x, 66, 0.5, 4, 0.2), body + 1.2), hexc('#7A4A28'), 0.6)
        for x, y, w, h, pal in crates:
            d = F.sd_box(c.X, c.Y, x, y, w, h, 2)
            part(c, d, pal, ow=2.0, bevel=2.5, gloss=0.2, tint='wood' if pal is WOOD else None)
            inner = F.sd_box(c.X, c.Y, x, y, w - 3.2, h - 3.2, 0.8)
            stroke(c, inner, 1.0, pal[2], 0.55)
        snow_cap(c, 39, 61, 38.5, 2.2, lumps=((45, 38, 2.6),))
        # stakes at the ends
        for x in (10, 86):
            part(c, F.sd_box(c.X, c.Y, x, 56, 1.8, 9, 0.8), WOOD_D, ow=1.2, bevel=1, gloss=0.0)
    return c.image()


def icon_play():
    """settings tab 놀이: a snowflake over a small joystick knob."""
    c = canvas(0.93)
    base = F.smin(F.sd_box(c.X, c.Y, 48, 78, 26, 7, 6), F.sd_ellipse(c.X, c.Y, 48, 72, 20, 7), 3)
    stick = F.sd_box(c.X, c.Y, 48, 62, 3.2, 10, 1.5)
    ball = F.sd_circle(c.X, c.Y, 48, 50, 10)
    btn = F.sd_ellipse(c.X, c.Y, 67, 76, 4.5, 2.6)
    sf = snowflake_sd(c, 48, 22, 15, w=2.4, rot_deg=8)
    shadow(c, U(base, stick, ball, sf))
    part(c, base, ('#7A8AA8', '#3A4866', '#141C2E'), ow=2.6, bevel=4, gloss=0.25)
    part(c, btn, RED, ow=1.4, bevel=1.5, gloss=0.3, hi=0.6)
    part(c, stick, STEEL, ow=1.6, bevel=1.5, gloss=0.2, spec=0.3)
    part(c, ball, TEAL, ow=2.4, bevel=4, gloss=0.0, hi=0.6, tint=TINT['teal'], spec=0.4)
    EA.glossy_spot(c, 44, 46, 3.6, 2.0, -35, 0.85, 0.5)
    c.fill(sf - 2.0, hexc('#1F4F8E'))
    c.fill(sf, WHITE)
    c.paint(c.cov(sf) * np.clip((c.Y - 8) / 30, 0, 1), hexc('#BFE0FF'), 0.6)
    glint(c, 80, 40, 5.0, edge='#1F4F8E', tip='#D6F0FF')
    return c.image()


def icon_new():
    """'새로워진 것' card: a red gift box with a gold ribbon and bow, and a sparkle."""
    c = canvas(0.94)
    box = F.sd_box(c.X, c.Y, 46, 66, 28, 20, 3)
    lid = F.sd_box(c.X, c.Y, 46, 44, 32, 6.5, 3)
    loops = U(F.sd_ellipse(*rot(c, 37, 32, 30), 37, 32, 10, 6.5), F.sd_ellipse(*rot(c, 56, 32, -30), 56, 32, 10, 6.5))
    tails = U(F.sd_polygon(c.X, c.Y, [(44, 38), (36, 48), (40, 49)]) - 1.0,
              F.sd_polygon(c.X, c.Y, [(48, 38), (56, 48), (52, 49)]) - 1.0)
    shadow(c, U(box, lid, loops))
    part(c, box, RED, ow=2.8, bevel=6, gloss=0.2, tint='red')
    ribbon_v = F.intersect(F.sd_box(c.X, c.Y, 46, 66, 5.5, 22, 0.5), box + 0.5)
    part(c, ribbon_v, GOLD, ow=0, bevel=2, gloss=0.3, tint='gold', hi=0.6)
    c.fill(np.abs(F.sd_box(c.X, c.Y, 46, 66, 5.5, 22, 0.5)) - 0.5, hexc('#8E520A'), 0.6)
    part(c, lid, ('#FF9E8E', '#E23E32', '#7E1A16'), ow=2.6, bevel=3.5, gloss=0.35, tint='red')
    part(c, F.intersect(F.sd_box(c.X, c.Y, 46, 44, 5.5, 8, 0.5), lid + 0.5), GOLD, ow=0, bevel=1.5, gloss=0.3, hi=0.6)
    part(c, tails, GOLD, ow=1.6, bevel=1.5, gloss=0.2, tint='gold')
    part(c, loops, GOLD, ow=2.2, bevel=3, gloss=0.3, tint='gold', hi=0.6)
    for x in (37, 56):
        c.fill(F.sd_ellipse(c.X, c.Y, x, 32, 3.5, 2.0), hexc('#C8861E'), 0.7)
    part(c, F.sd_circle(c.X, c.Y, 46.5, 36, 4.5), GOLD, ow=1.8, bevel=2, gloss=0.3, hi=0.65, tint='gold')
    glint(c, 80, 20, 9.5)
    glint(c, 18, 30, 5.0)
    glint(c, 84, 58, 4.0)
    return c.image()


RENAMED = {'ui_icon_play': 'ui_icon_play_tab'}   # contract key -> shipped key (clash with an existing fragment)

ICONS = [
    ('ui_icon_binoculars', icon_binoculars, '관망 모드 (observe-mode button, 56 round): chunky teal binoculars, a sparkle in one lens.', 'fv_icon_binoculars / ui3 ui_icon_explore'),
    ('ui_icon_hand', icon_hand, '줍기 button / 자동 줍기 setting: the chief\'s open white mitten with a gold sparkle above the palm.', 'fv_icon_hand / ui_icon_backpack'),
    ('ui_icon_route', icon_route, '길 안내 setting / nav chip: dotted footprints curving to a teal map pin.', 'fv_nav_edge'),
    ('ui_icon_office', icon_office, '촌장 사무실 / 업무 chip: cream office, teal roof, gable clock, a window lit by a desk lamp.', 'fv_icon_office'),
    ('ui_icon_letter', icon_letter, '편지 (letters tab / new letter): cream envelope with a red heart wax seal.', 'ui4 ui_icon_story'),
    ('ui_icon_inventory', icon_inventory, '재고 tab / 재고판: clipboard with four coloured stock bars (red, orange, blue, green).', 'ui4 ui_icon_stock'),
    ('ui_icon_news', icon_news, '소식 tab (서리 소식): the village paper folded in half, snowflake emblem on a blue masthead (ui4 ui_icon_newspaper is the town\'s pinecone paper).', 'ui4 ui_icon_newspaper'),
    ('ui_icon_bank', icon_bank, '서리 은행: small civic building (columns, steps, pediment) under a gold coin dome.', 'ui4 ui_icon_passbook'),
    ('ui_icon_staff', icon_staff, '직원 tab: two friendly heads, one in a suit with a tie, one with a pink bow.', 'ui_icon_worker'),
    ('ui_icon_halo', icon_halo, '촌장 후광 setting / new-features card: a little chief standing on an aurora ring.', 'fv_halo'),
    ('ui_icon_cheer', icon_cheer, '촌장 응원: a raised white mitten with two music notes.', 'emotes fx_music_notes'),
    ('ui_icon_depot', icon_depot, '물류창고: blue warehouse with an orange crate in its open door.', 'ui4 ui_icon_box'),
    ('ui_icon_sleigh', icon_sleigh, '화물 썰매: a pony head pulling a little sleigh with a crate.', 'ui3 ui_icon_delivery'),
    ('ui_icon_coach', lambda: car_icon('coach'), '열차 카드 객차: sky-blue coach, teal roof, warm lit windows, on a rail.', 'none (text)'),
    ('ui_icon_boxcar', lambda: car_icon('boxcar'), '열차 카드 화물칸: chestnut box car with an X-brace sliding door, on a rail.', 'none (text)'),
    ('ui_icon_flatcar', lambda: car_icon('flatcar'), '열차 카드 무개화차: flat car carrying three crates, on a rail.', 'none (text)'),
    # CONTRACT_V42 names it ui_icon_play, but pets2 already owns that key (the dog's play-fetch ball, src/scenes/UI.js):
    # Object.assign merging would swap the dog button's art (or mergeLate would drop this one), so it ships as
    # ui_icon_play_tab with contractKey 'ui_icon_play'.
    ('ui_icon_play_tab', icon_play, 'settings tab 놀이: a snowflake over a small joystick knob. CONTRACT_V42 calls it '
     'ui_icon_play, but pets2 already owns ui_icon_play (the dog\'s play-fetch ball in src/scenes/UI.js), so use this key.',
     'ui_icon_settings'),
    ('ui_icon_new', icon_new, '"새로워진 것" card: a red gift box with a gold ribbon and a sparkle.', 'ui3 ui_icon_event'),
]


# =========================================================================== panel frames (untrimmed, 9-slice)
def letter_panel():
    """ui_letter 320 x 400: cream letter paper, faint blue ruled lines, a pinecone stamp in the top-right corner,
    the envelope flap's shadow across the top.  Everything that must not stretch lives in the margins
    (36 / 64 / 36 / 40); the centre is uniform along x and the ruling is a soft periodic pattern along y."""
    W, H = 320, 400
    c = F.Canvas(W, H)
    paper = F.sd_box(c.X, c.Y, W / 2, H / 2 - 1, W / 2 - 5, H / 2 - 6, 10)
    c.shadow(c.cov(paper), dy=3.5, sigma=2.6, opacity=0.30)
    c.fill(paper - 1.6, hexc('#B89A6E'))
    t = np.clip((c.Y - 6) / (H - 14), 0, 1)
    base = F.mix(hexc('#FFFCF3'), hexc('#F8EEDA'), t)
    n = F.bevel_normals(paper, 5, c.px)
    c.paint(c.cov(paper), F.shade(base, F.lambert(n), 0.4, 0.2))
    # warm vignette along the edges (stretches cleanly)
    v = np.clip(1 + paper / 14, 0, 1) ** 2
    c.paint(c.cov(paper) * v, hexc('#E9D6B0'), 0.45)
    # envelope flap across the top: a rose-kraft band with a straight lower edge and a soft shadow under it
    flap = F.intersect(paper + 0.5, c.Y - 40)
    c.shadow(c.cov(flap), dy=3.0, sigma=3.0, opacity=0.22)
    tf = np.clip((c.Y - 5) / 36, 0, 1)
    c.paint(c.cov(flap), F.mix(hexc('#F3DCC4'), hexc('#E9C9A8'), tf))
    c.fill(F.intersect(np.abs(c.Y - 40) - 0.7, paper), hexc('#C59C74'), 0.9)
    c.fill(F.intersect(np.abs(c.Y - 37.5) - 0.5, paper + 3), WHITE, 0.45)
    # ruled lines (centre: periodic along y) + a left margin line (in the left margin column)
    yy = c.Y - 64
    rule = np.abs(((yy + 11) % 22) - 11) - 0.3
    inside = (c.Y > 72) & (c.Y < H - 46) & (c.X > 18) & (c.X < W - 18)
    c.paint(c.cov(rule, feather=0.5) * inside, hexc('#8FB0DA'), 0.42)
    c.fill(F.intersect(np.abs(c.X - 28) - 0.6, F.intersect(c.Y - (H - 20), 46 - c.Y)), hexc('#F2A0A8'), 0.6)
    # the stamp (top-right corner region: x >= 284, y <= 64)
    sx, sy, sw, sh = 300, 25, 12.5, 16
    perf = F.sd_box(c.X, c.Y, sx, sy, sw, sh, 0.5)
    for k in range(-5, 6):
        perf = np.maximum(perf, -F.sd_circle(c.X, c.Y, sx - sw, sy + k * 3.0, 1.2))
        perf = np.maximum(perf, -F.sd_circle(c.X, c.Y, sx + sw, sy + k * 3.0, 1.2))
    for k in range(-4, 5):
        perf = np.maximum(perf, -F.sd_circle(c.X, c.Y, sx + k * 3.0, sy - sh, 1.2))
        perf = np.maximum(perf, -F.sd_circle(c.X, c.Y, sx + k * 3.0, sy + sh, 1.2))
    X2, Y2 = F.rot(c.X, c.Y, sx, sy, math.radians(6))
    c.shadow(c.cov(perf), dy=1.5, sigma=1.0, opacity=0.3)
    c.fill(perf, hexc('#FFFDF8'))
    inner = F.sd_box(c.X, c.Y, sx, sy, sw - 3, sh - 3, 1)
    ti = np.clip((c.Y - (sy - sh)) / (2 * sh), 0, 1)
    c.paint(c.cov(inner), F.mix(hexc('#BFE6F8'), hexc('#7FC4E8'), ti))
    c.fill(F.intersect(F.sd_box(c.X, c.Y, sx, sy + 9, sw - 3, 4, 0.5), inner), hexc('#FFFFFF'), 0.9)
    U4.pinecone(c, sx, sy + 1, 0.62, ow=1.0)
    # postmark wavy lines over the stamp's left edge
    for k in range(3):
        wv = np.abs(c.Y - (sy - 6 + k * 6) - 1.6 * np.sin((c.X - 270) * 0.35)) - 0.6
        c.fill(F.intersect(wv, F.intersect(c.X - 300, 270 - c.X)), hexc('#5A6E92'), 0.45)
    return c.image()


def chalk_panel():
    """ui_chalk_panel 320 x 240: a dark green chalkboard in a wooden frame with a chalk tray (재고 tab background).
    Margins 28 / 28 / 28 / 36: frame grain runs along each side (stretches cleanly), chalk + eraser sit in the
    bottom corners."""
    W, H = 320, 240
    c = F.Canvas(W, H)
    frame = F.sd_box(c.X, c.Y, W / 2, H / 2 - 3, W / 2 - 4, H / 2 - 7, 10)
    board = F.sd_box(c.X, c.Y, W / 2, 112, W / 2 - 22, 90, 3)
    c.shadow(c.cov(frame), dy=3.5, sigma=2.6, opacity=0.32)
    part(c, frame, WOOD, ow=2.6, bevel=7, gloss=0.2, tint='wood')
    # grain: horizontal on the top / bottom rails, vertical on the stiles (uniform along the stretch direction)
    for k in range(3):
        c.fill(F.intersect(np.abs(c.Y - (9 + k * 5)) - 0.5, F.intersect(frame + 2, -(board + 2))), hexc('#8A5A33'), 0.35)
        c.fill(F.intersect(np.abs(c.X - (10 + k * 5)) - 0.5, F.intersect(frame + 2, F.intersect(c.Y - 24, 200 - c.Y))),
               hexc('#8A5A33'), 0.3)
        c.fill(F.intersect(np.abs(c.X - (W - 10 - k * 5)) - 0.5, F.intersect(frame + 2, F.intersect(c.Y - 24, 200 - c.Y))),
               hexc('#8A5A33'), 0.3)
    c.fill(board - 2.0, hexc('#3E2614'))
    tb = np.clip((c.Y - 22) / 180, 0, 1)
    nb = F.bevel_normals(-board, 3, c.px)
    nb[..., 0] *= -1
    nb[..., 1] *= -1
    c.paint(c.cov(board), F.shade(F.mix(hexc('#35654F'), hexc('#264A3B'), tb), F.lambert(nb) * 0.8, 0.35, 0.5))
    # faint chalk haze (low-frequency, stretch-safe)
    hz = F.blur(np.random.default_rng(3).random(c.a.shape).astype(np.float32), 14 * c.ss)
    hz = (hz - hz.min()) / (hz.max() - hz.min() + 1e-6)
    c.paint(c.cov(board + 3) * np.clip(hz - 0.35, 0, 1), hexc('#CFE3D8'), 0.18)
    # chalk tray ledge across the bottom margin
    tray = F.sd_box(c.X, c.Y, W / 2, 217, W / 2 - 10, 5.0, 3)
    c.shadow(c.cov(tray), dy=2.0, sigma=1.4, opacity=0.35)
    part(c, tray, WOOD_D, ow=2.0, bevel=2.5, gloss=0.2, tint='wood')
    chalk = F.sd_box(*F.rot(c.X, c.Y, 17, 209.5, math.radians(-6)), 17, 209.5, 8.0, 2.1, 2.0)
    part(c, chalk, ('#FFFFFF', '#E6ECF2', '#7E8AA4'), ow=1.2, bevel=1.2, gloss=0.2)
    chalk2 = F.sd_box(c.X, c.Y, 300, 210, 5.5, 2.0, 1.8)
    part(c, chalk2, ('#FFD6E2', '#F59ABA', '#8E2450'), ow=1.2, bevel=1.2, gloss=0.2)
    eraser = F.sd_box(c.X, c.Y, 22, 222, 8, 3.6, 1.4)
    part(c, eraser, ('#9FD0FF', '#3D8BE0', '#163E78'), ow=1.3, bevel=1.4, gloss=0.2)
    c.fill(F.sd_box(c.X, c.Y, 22, 225, 8, 1.3, 0.6), hexc('#5A4A3A'))
    for (x, y) in ((14, 13), (W - 14, 13)):
        part(c, F.sd_circle(c.X, c.Y, x, y, 3.2), STEEL, ow=1.2, bevel=1.5, gloss=0.0, spec=0.4)
    return c.image()


def office_tab(on):
    """ui_office_tab / _on 160 x 72: cream tab with a teal rim, open at the bottom (it sits on the panel's top edge);
    _on is raised (4 px taller), brighter, with a teal cap stripe and a stronger shadow."""
    W, H = 160, 72
    c = F.Canvas(W, H)
    top = 6 if on else 12
    tab = F.sd_box(c.X, c.Y, W / 2, (top + H + 18) / 2, W / 2 - 6, (H + 18 - top) / 2, 16)
    tab = F.intersect(tab, c.Y - (H + 0.5))
    c.shadow(c.cov(tab), dy=2.5 if on else 1.5, sigma=2.0, opacity=0.34 if on else 0.22)
    c.fill(tab - 3.0, hexc('#0E4C47'))
    c.fill(tab - 2.4, hexc('#25A595') if on else hexc('#5FA59C'))
    inner = tab + 2.6
    t = np.clip((c.Y - top) / (H - top), 0, 1)
    base = F.mix(hexc('#FFFFFF') if on else hexc('#F6EEDC'), hexc('#FFF6E4') if on else hexc('#E6D9BE'), t)
    n = F.bevel_normals(inner, 5, c.px)
    c.paint(c.cov(inner), F.shade(base, F.lambert(n), 0.45, 0.25))
    if on:
        cap = F.intersect(inner, c.Y - (top + 9))
        cap = F.intersect(inner, -(c.Y - (top + 9)))
        c.paint(c.cov(cap), hexc('#7FE6D8'), 0.55)
        c.paint(c.cov(inner + 5, feather=2) * np.clip(1 - (c.Y - top) / 18, 0, 1), WHITE, 0.45)
    else:
        c.paint(c.cov(inner) * np.clip((c.Y - (H - 14)) / 14, 0, 1), hexc('#8A6A44'), 0.18)
    return c.image()


def chip_panel():
    """ui_chip 200 x 64: rounded pill, cream with a teal rim (nav / 업무 / 관망 chips).  Margins 32 / 16 / 32 / 16."""
    W, H = 200, 64
    c = F.Canvas(W, H)
    pill = F.sd_box(c.X, c.Y, W / 2, H / 2 - 1.5, W / 2 - 5, H / 2 - 6, H / 2 - 6)
    c.shadow(c.cov(pill), dy=2.5, sigma=2.0, opacity=0.32)
    c.fill(pill - 0.8, hexc('#0E4C47'))
    c.fill(pill, hexc('#25A595'))
    inner = pill + 3.2
    t = np.clip((c.Y - 8) / (H - 18), 0, 1)
    n = F.bevel_normals(inner, 6, c.px)
    c.paint(c.cov(inner), F.shade(F.mix(hexc('#FFFDF6'), hexc('#F3E7CF'), t), F.lambert(n), 0.45, 0.25))
    c.paint(c.cov(inner + 4, feather=2) * np.clip(1 - (c.Y - 9) / 14, 0, 1), WHITE, 0.5)
    return c.image()


def status_dot(k):
    """ui_status_k 32 x 32: glossy status dots - 0 red 부족, 1 orange 길 막힘, 2 blue 남음, 3 green 적당."""
    pal = [RED, ORANGE, BLUE, GREEN][k]
    c = F.Canvas(32, 32, ss=6)
    d = F.sd_circle(c.X, c.Y, 16, 15.2, 11.2)
    c.shadow(c.cov(d - 1.6), dy=1.6, sigma=1.0, opacity=0.35)
    c.fill(d - 1.8, WHITE)
    part(c, d, pal, ow=1.0, bevel=5, gloss=0.0, hi=0.55, lo=0.5, spec=0.5)
    EA.glossy_spot(c, 12.5, 10.5, 4.2, 2.2, -35, 0.8, 0.5)
    return c.image()


PANELS = {
    # key: (draw, nineSlice {left, top, right, bottom}, contentInset [l, t, r, b], notes, code fallback)
    'ui_letter': (letter_panel, dict(left=36, top=64, right=36, bottom=40), [36, 64, 36, 40],
                  '편지 page (OfficePanel letters, 720 x 1100 logical): cream letter paper, faint blue ruled lines '
                  '(every 22 px in the source, they stretch with the panel), a pinecone stamp in the top-right corner, '
                  'the envelope flap with its shadow across the top. Write the sender in the flap band (y 8-36), the '
                  'letter text inside contentInset.', 'ui_panel'),
    'ui_chalk_panel': (chalk_panel, dict(left=28, top=28, right=28, bottom=36), [28, 28, 28, 36],
                       '재고 tab background: dark green chalkboard in a wooden frame with a chalk tray (chalk and '
                       'eraser in the bottom corners). Light text / status dots read on it.', 'ui4 ui_newspaper'),
    'ui_office_tab': (lambda: office_tab(False), dict(left=24, top=20, right=24, bottom=12), [24, 20, 24, 12],
                      'Office panel tab (inactive): cream with a teal rim, open at the bottom - put it on the panel\'s '
                      'top edge (bottom edge of the tab = panel edge).', 'ui_button_gray'),
    'ui_office_tab_on': (lambda: office_tab(True), dict(left=24, top=20, right=24, bottom=12), [24, 20, 24, 12],
                         'Office panel tab (active): raised 6 px, brighter, teal cap and a stronger shadow; same frame '
                         'and margins as ui_office_tab so they swap in place.', 'ui_button_green'),
    'ui_chip': (chip_panel, dict(left=32, top=16, right=32, bottom=16), [32, 16, 32, 16],
                'HUD chips (navigation chip 240 x 44 CSS, 업무 chip, 관망 caption): rounded cream pill with a teal rim. '
                'Height can stay 64 (or scale the whole chip); stretch the width.', 'ui_panel'),
}
STATUS = [('부족', 'short', 'red'), ('길 막힘', 'blocked', 'orange'), ('남음', 'surplus', 'blue'), ('적당', 'ok', 'green')]


# =========================================================================== build
def render_all():
    import hashlib
    src = b''.join(open(p, 'rb').read() for p in (__file__, F.__file__, U3.__file__, U4.__file__, EA.__file__, CF.__file__))
    h = hashlib.sha1(src).hexdigest()[:12]
    d = os.path.join(CACHE, 'frames_' + h)
    names = [k for k, *_ in ICONS] + list(PANELS) + [f'ui_status_{i}' for i in range(4)]
    out = {}
    if os.path.isdir(d) and all(os.path.exists(os.path.join(d, n + '.png')) for n in names):
        for n in names:
            out[n] = Image.open(os.path.join(d, n + '.png')).convert('RGBA')
        return out
    os.makedirs(d, exist_ok=True)
    for k, fn, *_ in ICONS:
        out[k] = fn()
    for k, (fn, *_r) in PANELS.items():
        out[k] = fn()
    for i in range(4):
        out[f'ui_status_{i}'] = status_dot(i)
    for n, im in out.items():
        im.save(os.path.join(d, n + '.png'))
    return out


def write_assets(fr):
    order = [k for k, *_ in ICONS] + list(PANELS) + [f'ui_status_{i}' for i in range(4)]
    # pad 1: every trimmed frame keeps a 1 px transparent border of its own and the panels have transparent
    # margins, so 1 px gaps cannot bleed under linear filtering (no mipmaps) - and the page fits the 1.5 MiB budget
    sheet, atlas = CF.pack([(n, fr[n]) for n in order], max_side=1024, no_trim=set(PANELS), pad=1,
                           widths=range(400, 1025, 4), app='frost-village/tools/fx/gen_ui5.py', shuffles=60)
    os.makedirs(OUT, exist_ok=True)
    atlas['meta']['image'] = ATLAS + '.png'
    sheet.save(os.path.join(OUT, ATLAS + '.png'), optimize=True)
    with open(os.path.join(OUT, ATLAS + '.json'), 'w') as f:
        json.dump(atlas, f, separators=(',', ':'))
    sprites, nine = {}, {}
    for k, fn, notes, fb in ICONS:
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon', 'frameSize': [96, 96],
                      'notes': notes, 'replaces': fb}
        if k in RENAMED.values():
            sprites[k]['contractKey'] = next(c for c, v in RENAMED.items() if v == k)
    for k, (fn, m, inset, notes, fb) in PANELS.items():
        im = fr[k]
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'panel',
                      'frameSize': [im.width, im.height], 'contentInset': inset, 'notes': notes, 'replaces': fb}
        nine[k] = {'atlas': ATLAS, 'frame': k, 'left': m['left'], 'right': m['right'], 'top': m['top'],
                   'bottom': m['bottom'], 'contentInset': inset}
    sprites['ui_status'] = {'atlas': ATLAS, 'frame': 'ui_status_0', 'anchor': [0.5, 0.5], 'kind': 'icon',
                            'frameSize': [32, 32], 'frames': 4, 'frameNames': [f'ui_status_{i}' for i in range(4)],
                            'states': {en: f'ui_status_{i}' for i, (ko, en, col) in enumerate(STATUS)},
                            'notes': 'Glossy status dots for the 재고 board rows: ' + ', '.join(
                                f'ui_status_{i} {col} {ko}' for i, (ko, en, col) in enumerate(STATUS)) + '.',
                            'replaces': 'generated circles'}
    for i, (ko, en, col) in enumerate(STATUS):
        sprites[f'ui_status_{i}'] = {'atlas': ATLAS, 'frame': f'ui_status_{i}', 'anchor': [0.5, 0.5], 'kind': 'icon',
                                     'frameSize': [32, 32], 'notes': f'{col} dot: {ko} ({en})'}
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_ui5.py (procedural numpy + Pillow on fxlib; house style of ui / ui2 / ui3 / ui4)',
        'conventions': {
            'contract': 'CONTRACT_V42 §AL. Paths relative to frost-village/assets/. Fragment name: ui5 (the build packs '
                        'it with chief_fx into the v42_core page).',
            'text': 'No text is baked; the game renders every label.',
            'iconSize': [96, 96],
            'style': 'House soft-toy style (fxlib.toy): dark tinted outline, bevel lit from the upper left, gloss, one '
                     'navy drop shadow. Icons read at 32 px on cream and on dark.',
            'nineSlice': 'Panel frames live in the atlas UNTRIMMED, so Phaser NineSlice can use them directly: '
                         "this.add.nineslice(x, y, 'ui5_icons', 'ui_letter', w, h, left, right, top, bottom) with the "
                         'margins of nineSlice[key]. contentInset = [left, top, right, bottom] px from the stretched '
                         'edges where the game lays out content.',
            'pageSize': [sheet.width, sheet.height],
            'pageMiB': round(page_mib, 3),
            'renamed': {c: v for c, v in RENAMED.items()},
            'renamedWhy': 'ui_icon_play is already a pets2 sprite (the dog play-fetch ball used by src/scenes/UI.js); a '
                          'second ui_icon_play would replace it at merge (Object.assign) or be dropped (mergeLate). The '
                          'settings-tab 놀이 icon is ui_icon_play_tab.',
        },
        'atlases': [{'key': ATLAS, 'png': f'ui5/{ATLAS}.png', 'json': f'ui5/{ATLAS}.json'}],
        'sprites': sprites,
        'nineSlice': nine,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    return sheet, atlas, man


# =========================================================================== previews
def nine_stretch(img, m, w, h):
    return U3.nine_stretch(img, m, w, h)


def preview_icons(fr, path):
    """Every icon at 96 / 48 / 32 px on cream, on the dark HUD and under the night overlay; status dots."""
    keys = [k for k, *_ in ICONS]
    cols = 6
    cw, ch = 210, 150
    rows = (len(keys) + cols - 1) // cols
    W = cols * cw + 20
    top = 70
    H = top + rows * ch + 40 + 3 * 70 + 120
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    d.text((10, 10), 'ui5_icons — 18 icons at 96 / 48 / 32 px (house soft-toy style), labels by the game',
           font=CF.font(26), fill=(30, 40, 60, 255))
    d.text((10, 42), 'cream card (UI panels), dark HUD strip and the night overlay below; nothing has baked text',
           font=CF.font(16), fill=(80, 90, 110, 255))
    for i, k in enumerate(keys):
        x0 = 10 + (i % cols) * cw
        y0 = top + (i // cols) * ch
        d.rounded_rectangle((x0, y0, x0 + cw - 8, y0 + ch - 8), radius=14, fill=(255, 248, 236, 255),
                            outline=(214, 196, 166, 255))
        im = fr[k]
        out.alpha_composite(im, (x0 + 6, y0 + 8))
        out.alpha_composite(im.resize((48, 48), Image.LANCZOS), (x0 + 110, y0 + 14))
        out.alpha_composite(im.resize((32, 32), Image.LANCZOS), (x0 + 166, y0 + 22))
        d.text((x0 + 108, y0 + 80), k.replace('ui_icon_', ''), font=CF.font(16), fill=(50, 60, 80, 255))
    y = top + rows * ch + 10
    for bg, lab, night in (((43, 47, 58), 'dark HUD', False), ((61, 139, 224), 'blue button', False),
                           ((244, 247, 251), 'snow + night overlay', True)):
        strip = Image.new('RGBA', (W - 20, 64), bg + (255,))
        for i, k in enumerate(keys):
            strip.alpha_composite(fr[k].resize((48, 48), Image.LANCZOS), (8 + i * 56, 8))
        for i in range(4):
            strip.alpha_composite(fr[f'ui_status_{i}'], (8 + 18 * 56 + i * 34, 4))
        if night:
            strip = CF.apply_night(strip)
        out.paste(strip, (10, y))
        d.text((W - 16, y + 46), lab, font=CF.font(14), fill=(255, 255, 255, 255) if not night else (30, 40, 60, 255),
               anchor='rs')
        y += 70
    # status dots large + small
    d.text((10, y + 4), 'ui_status_0..3 (부족 · 길 막힘 · 남음 · 적당) at 32 and 20 px:', font=CF.font(17), fill=(30, 40, 60, 255))
    for i in range(4):
        out.alpha_composite(fr[f'ui_status_{i}'], (420 + i * 46, y))
        out.alpha_composite(fr[f'ui_status_{i}'].resize((20, 20), Image.LANCZOS), (620 + i * 30, y + 6))
    out.save(path)
    return path


def preview_panels(fr, man, path):
    """The panels stretched to 720 x 1100 logical (the OfficePanel size) with sample content in the game font."""
    fnt = CF.font
    nine = man['nineSlice']
    W, H = 720, 1100
    cells = []
    # 1) letter
    a = nine_stretch(fr['ui_letter'], nine['ui_letter'], W, H)
    d = ImageDraw.Draw(a)
    d.text((48, 18), '보낸이 · 빵집 할머니', font=fnt(26), fill=(122, 74, 44, 255))
    lines = ['촌장님께,', '', '어제 광장 판매대에 구운 생선이', '가득 차 있어서 깜짝 놀랐어요!',
             '덕분에 손님들이 줄을 서서 사 갔답니다.', '', '그런데 밀가루가 조금 모자라요.',
             '물류창고에 남는 게 있으면', '조금만 나눠 주실 수 있을까요?', '', '늘 고마워요.',
             '— 서리마을 빵집에서']
    y = 112
    for ln in lines:
        d.text((60, y), ln, font=fnt(30), fill=(58, 42, 30, 255))
        y += 76
    cells.append(('ui_letter', a))
    # 2) chalk board (재고 tab) with tabs on top
    b = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    board = nine_stretch(fr['ui_chalk_panel'], nine['ui_chalk_panel'], W, H - 64)
    b.alpha_composite(board, (0, 64))
    tabs = [('재고', True), ('소식', False), ('편지', False), ('직원', False)]
    icons = {'재고': 'ui_icon_inventory', '소식': 'ui_icon_news', '편지': 'ui_icon_letter', '직원': 'ui_icon_staff'}
    for i, (name, on) in enumerate(tabs):
        t = nine_stretch(fr['ui_office_tab_on' if on else 'ui_office_tab'], nine['ui_office_tab'], 170, 72)
        b.alpha_composite(t, (14 + i * 172, 0))
        b.alpha_composite(fr[icons[name]].resize((44, 44), Image.LANCZOS), (30 + i * 172, 16))
        ImageDraw.Draw(b).text((80 + i * 172, 24), name, font=fnt(26), fill=(30, 70, 66, 255) if on else (110, 96, 80, 255))
    d = ImageDraw.Draw(b)
    rows = [('구운 생선', 'item_fish_cooked', 3, '적당 · 판매대 3곳'), ('빵', 'item_bread', 0, '부족 · 밀가루 필요'),
            ('통조림', 'item_can', 2, '남음 · 물류창고로'), ('목재', 'item_wood', 1, '길 막힘 · 짐꾼 대기'),
            ('밀가루', 'item_flour', 0, '부족'), ('털실', 'item_wool', 3, '적당')]
    items = CF.Atlas.get('props/props_items')
    y = 140
    for name, ik, st, note in rows:
        try:
            ic = items.frame(ik)
            (fdx, fdy), fsz = CF.icon_center_offset(ic)
            s = 56 / fsz
            ic2 = ic.resize((round(72 * s), round(72 * s)), Image.LANCZOS)
            b.alpha_composite(ic2, (int(92 - ic2.width / 2 - fdx * s), int(y + 28 - ic2.height / 2 - fdy * s)))
        except KeyError:
            pass
        b.alpha_composite(fr[f'ui_status_{st}'], (40, y + 12))
        d.text((140, y + 6), name, font=fnt(32), fill=(240, 246, 240, 255))
        d.text((360, y + 12), note, font=fnt(26), fill=(200, 226, 210, 255))
        d.line((40, y + 74, W - 40, y + 74), fill=(140, 180, 160, 90), width=2)
        y += 104
    cells.append(('ui_chalk_panel + ui_office_tab(_on)', b))
    # 3) chips + HUD pieces on a game-like strip
    cimg = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    snow = Image.open(os.path.join(ASSETS, 'ground/ground_snow.png')).convert('RGBA')
    for yy in range(0, H, 512):
        for xx in range(0, W, 512):
            cimg.paste(snow, (xx, yy))
    d = ImageDraw.Draw(cimg)
    # positions follow plan §8.1 (logical 720 x 1560 HUD) squeezed into this 1100-tall card (x 0.7 in y)
    chip3 = nine_stretch(fr['ui_chip'], nine['ui_chip'], 520, 64)                 # 관망 caption
    cimg.alpha_composite(chip3, (100, 90))
    cimg.alpha_composite(fr['ui_icon_binoculars'].resize((52, 52), Image.LANCZOS), (116, 96))
    d.text((176, 104), '관망 중 · 화면을 만지면 다시 조종해요', font=fnt(24), fill=(30, 70, 66, 255))
    chip2 = nine_stretch(fr['ui_chip'], nine['ui_chip'], 222, 64)                 # 업무 chip
    cimg.alpha_composite(chip2, (20, 250))
    cimg.alpha_composite(fr['ui_icon_office'].resize((52, 52), Image.LANCZOS), (36, 256))
    d.text((96, 264), '업무', font=fnt(28), fill=(30, 70, 66, 255))
    d.ellipse((204, 242, 236, 274), fill=(222, 59, 47, 255), outline=(255, 255, 255, 255), width=3)
    d.text((220, 258), '3', font=fnt(20), fill=(255, 255, 255, 255), anchor='mm')
    card = nine_stretch(fr['ui_letter'], nine['ui_letter'], 460, 330)              # 새로워진 것 card
    cimg.alpha_composite(card, (130, 380))
    d.text((360, 398), '새로워진 것', font=fnt(26), fill=(122, 74, 44, 255), anchor='mt')
    for i, (k, t) in enumerate((('ui_icon_halo', '촌장님 발밑의 반짝이는 후광'), ('ui_icon_route', '물건을 들면 갈 곳을 알려 줘요'),
                                ('ui_icon_binoculars', '가만히 두면 알아서 지내요'))):
        cimg.alpha_composite(fr[k].resize((56, 56), Image.LANCZOS), (166, 470 + i * 70))
        d.text((232, 486 + i * 70), t, font=fnt(22), fill=(58, 42, 30, 255))
    for (x, y, k, r, lab) in ((640, 790, 'ui_icon_binoculars', 56, None), (520, 900, 'ui_icon_hand', 60, '줍기')):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 253, 246, 255), outline=(37, 165, 149, 255), width=6)
        cimg.alpha_composite(fr[k].resize((84, 84), Image.LANCZOS), (x - 42, y - 44))
        if lab:
            d.text((x, y + r + 6), lab, font=fnt(26), fill=(30, 70, 66, 255), anchor='mt', stroke_width=4,
                   stroke_fill=(255, 255, 255, 255))
    chip = nine_stretch(fr['ui_chip'], nine['ui_chip'], 444, 64)                  # navigation chip
    cimg.alpha_composite(chip, (138, 1010))
    fish = items.frame('item_fish_cooked')
    (fdx, fdy), fsz = CF.icon_center_offset(fish)
    s = 40 / fsz
    f2 = fish.resize((round(72 * s), round(72 * s)), Image.LANCZOS)
    cimg.alpha_composite(f2, (int(186 - f2.width / 2 - fdx * s), int(1040 - f2.height / 2 - fdy * s)))
    d.text((212, 1024), '구운 생선 8 → 광장 판매대 · 12m', font=fnt(26), fill=(30, 70, 66, 255))
    cells.append(('ui_chip + HUD buttons + 새로워진 것 card', cimg))
    # train cards: coach / boxcar / flatcar icons on chips
    tr = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(tr)
    panel = nine_stretch(fr['ui_letter'], nine['ui_letter'], 640, 300)
    tr.alpha_composite(panel, (40, 40))
    d.text((360, 60), '열차 카드', font=fnt(28), fill=(122, 74, 44, 255), anchor='mt')
    for i, (k, t) in enumerate((('ui_icon_coach', '객차 · 손님 6'), ('ui_icon_boxcar', '화물칸 · 통조림 12'),
                                ('ui_icon_flatcar', '무개화차 · 목재 8'))):
        tr.alpha_composite(fr[k], (90 + i * 196, 120))
        d.text((138 + i * 196, 226), t, font=fnt(22), fill=(58, 42, 30, 255), anchor='mt')
    small = [('ui_icon_depot', '물류창고'), ('ui_icon_sleigh', '화물 썰매'), ('ui_icon_bank', '서리 은행'),
             ('ui_icon_cheer', '촌장 응원'), ('ui_icon_play_tab', '놀이 탭'), ('ui_icon_new', '새로워진 것')]
    for i, (k, t) in enumerate(small):
        x, y = 40 + (i % 3) * 220, 400 + (i // 3) * 120
        ch_ = nine_stretch(fr['ui_chip'], nine['ui_chip'], 210, 64)
        tr.alpha_composite(ch_, (x, y))
        tr.alpha_composite(fr[k].resize((50, 50), Image.LANCZOS), (x + 14, y + 6))
        d.text((x + 72, y + 18), t, font=fnt(22), fill=(30, 70, 66, 255))
    big = nine_stretch(fr['ui_chalk_panel'], nine['ui_chalk_panel'], 640, 300)
    tr.alpha_composite(big, (40, 680))
    d.text((80, 720), '설정 · 놀이', font=fnt(28), fill=(240, 246, 240, 255))
    for i, (k, t, v) in enumerate((('ui_icon_hand', '자동 줍기', '켬'), ('ui_icon_route', '길 안내', '켬'),
                                   ('ui_icon_halo', '촌장 후광', '켬'))):
        tr.alpha_composite(fr[k].resize((52, 52), Image.LANCZOS), (80, 770 + i * 62))
        d.text((146, 782 + i * 62), t, font=fnt(24), fill=(240, 246, 240, 255))
        d.text((560, 782 + i * 62), v, font=fnt(24), fill=(255, 214, 90, 255))
    cells.append(('train card, chips, settings rows', tr))
    # compose 2 x 2 at half size
    half = [(t, im.resize((W // 2, H // 2), Image.LANCZOS)) for t, im in cells]
    out = Image.new('RGBA', (W + 30, H + 100), (236, 241, 247, 255))
    dd = ImageDraw.Draw(out)
    dd.text((10, 10), 'ui5 panels at 720 x 1100 logical (shown 1/2), game font Pretendard', font=CF.font(18),
            fill=(30, 40, 60, 255))
    for i, (t, im) in enumerate(half):
        x = 10 + (i % 2) * (W // 2 + 10)
        y = 44 + (i // 2) * (H // 2 + 28)
        out.alpha_composite(im, (x, y + 22))
        dd.text((x, y), t, font=CF.font(16), fill=(60, 70, 90, 255))
    out.save(path)
    full = os.path.join(PREV, 'ui5_panels_full.png')
    strip = Image.new('RGBA', (W * 2 + 20, H), (236, 241, 247, 255))
    strip.alpha_composite(cells[0][1], (0, 0))
    strip.alpha_composite(cells[1][1], (W + 20, 0))
    strip.save(full)
    return path, full


def preview_sources(fr, man, path):
    """The panel frames at source size with their 9-slice margins (red) and contentInset (green)."""
    keys = list(PANELS) + ['ui_status_0', 'ui_status_1', 'ui_status_2', 'ui_status_3']
    out = Image.new('RGBA', (1100, 520), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    d.text((10, 8), 'ui5 panel frames at source size: 9-slice margins (red), contentInset (green dashed)',
           font=CF.font(18), fill=(30, 40, 60, 255))
    x, y = 10, 40
    for k in keys:
        im = fr[k]
        if x + im.width > 1090:
            x, y = 10, y + 420
        out.alpha_composite(im, (x, y + 20))
        d.text((x, y), k, font=CF.font(15), fill=(60, 70, 90, 255))
        n = man['nineSlice'].get(k)
        if n:
            L, R, T, B = n['left'], n['right'], n['top'], n['bottom']
            for xx in (x + L, x + im.width - R):
                d.line((xx, y + 20, xx, y + 20 + im.height), fill=(230, 40, 60, 200), width=1)
            for yy in (y + 20 + T, y + 20 + im.height - B):
                d.line((x, yy, x + im.width, yy), fill=(230, 40, 60, 200), width=1)
        x += im.width + 16
    out.save(path)
    return path


# =========================================================================== check
def check():
    errs, warns = [], []
    mp = os.path.join(OUT, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: assets/ui5/manifest.json missing')
        return 1
    man = json.load(open(mp))
    files = sorted(os.listdir(OUT))
    if files != ['manifest.json', 'ui5_icons.json', 'ui5_icons.png']:
        errs.append(f'file budget: AL ships exactly 3 files, found {files}')
    a = man['atlases'][0]
    sheet = Image.open(os.path.join(ASSETS, a['png']))
    js = json.load(open(os.path.join(ASSETS, a['json'])))
    if sheet.mode != 'RGBA' or sheet.width > 1024 or sheet.height > 1024:
        errs.append(f'atlas {sheet.size} {sheet.mode} (RGBA <= 1024 x 1024)')
    icons = ['ui_icon_binoculars', 'ui_icon_hand', 'ui_icon_route', 'ui_icon_office', 'ui_icon_letter',
             'ui_icon_inventory', 'ui_icon_news', 'ui_icon_bank', 'ui_icon_staff', 'ui_icon_halo', 'ui_icon_cheer',
             'ui_icon_depot', 'ui_icon_sleigh', 'ui_icon_coach', 'ui_icon_boxcar', 'ui_icon_flatcar', 'ui_icon_play_tab',
             'ui_icon_new']
    panels = {'ui_letter': ((320, 400), (36, 64, 36, 40)), 'ui_chalk_panel': ((320, 240), (28, 28, 28, 36)),
              'ui_office_tab': ((160, 72), (24, 20, 24, 12)), 'ui_office_tab_on': ((160, 72), (24, 20, 24, 12)),
              'ui_chip': ((200, 64), (32, 16, 32, 16))}
    sp = man['sprites']
    full = {}

    def frame(nm, size):
        f = js['frames'].get(nm)
        if not f:
            errs.append(f'atlas frame {nm} missing')
            return None
        if (f['sourceSize']['w'], f['sourceSize']['h']) != size:
            errs.append(f'{nm}: sourceSize {f["sourceSize"]} != {size}')
        r, s = f['frame'], f['spriteSourceSize']
        im = Image.new('RGBA', size, (0, 0, 0, 0))
        im.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
        full[nm] = im
        return f

    for k in icons:
        e = sp.get(k)
        if not e or e.get('anchor') != [0.5, 0.5] or e.get('frameSize') != [96, 96]:
            errs.append(f'{k}: manifest entry / anchor / frameSize')
            continue
        frame(k, (96, 96))
    for k, (size, m) in panels.items():
        f = frame(k, size)
        if f is None:
            continue
        if f['trimmed'] or (f['frame']['w'], f['frame']['h']) != size:
            errs.append(f'{k}: panel frames must be untrimmed (NineSlice uses the whole frame)')
        n = man['nineSlice'].get(k)
        if not n or (n['left'], n['top'], n['right'], n['bottom']) != m or n.get('contentInset') != list(m):
            errs.append(f'{k}: nineSlice / contentInset {n} != {m}')
        if n and n.get('frame') != k:
            errs.append(f'{k}: nineSlice.frame')
        # stretch safety: the centre column must be (nearly) uniform along x, the centre row along y (except the
        # letter's periodic ruling, which is checked for its period instead)
        arr = np.asarray(full[k]).astype(np.float32)
        L, T, R, B = m
        mid = arr[T:size[1] - B, L:size[0] - R]
        if mid.size:
            colvar = np.abs(np.diff(mid, axis=1)).max()
            if colvar > 24:
                errs.append(f'{k}: centre region not uniform along x (max step {colvar:.0f}) - would smear when stretched')
    for i in range(4):
        frame(f'ui_status_{i}', (32, 32))
    if 'ui_status' not in sp or sp['ui_status'].get('frames') != 4:
        errs.append('ui_status: manifest entry with 4 frames missing')
    # readability at 32 px: every icon keeps a visible silhouette (alpha coverage) and contrast on cream and on dark
    cream, dark = np.array([255, 248, 236], np.float32), np.array([43, 47, 58], np.float32)
    for k in icons:
        im = full.get(k)
        if im is None:
            continue
        sm = np.asarray(im.resize((32, 32), Image.LANCZOS)).astype(np.float32)
        al = sm[..., 3:] / 255
        cov = float((al > 0.5).mean())
        if cov < 0.18:
            errs.append(f'{k}: only {cov:.0%} of the 32 px icon is solid - too thin to read')
        for bgn, bg in (('cream', cream), ('dark', dark)):
            comp = sm[..., :3] * al + bg * (1 - al)
            lum = comp @ np.array([0.299, 0.587, 0.114], np.float32)
            inside = al[..., 0] > 0.5
            if inside.sum() and np.percentile(np.abs(lum[inside] - (bg @ np.array([0.299, 0.587, 0.114]))), 90) < 40:
                errs.append(f'{k}: weak contrast on {bgn} at 32 px')
        a96 = np.asarray(im)[..., 3]
        if max(a96[0].max(), a96[-1].max(), a96[:, 0].max(), a96[:, -1].max()) > 40:
            errs.append(f'{k}: art touches the 96 px frame border')
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    src_sum = sum(f['frame']['w'] * f['frame']['h'] * 4 for f in js['frames'].values()) / 2 ** 20
    print(f'ui5 check: {len(js["frames"])} frames, page {sheet.width}x{sheet.height} = {page_mib:.3f} MiB (RGBA), '
          f'frames {src_sum:.3f} MiB, png {os.path.getsize(os.path.join(ASSETS, a["png"])) / 1024:.0f} KB')
    if page_mib > 1.5:
        warns.append(f'page {page_mib:.3f} MiB > the 1.5 MiB budget')
    for w in warns:
        print('WARN:', w)
    for e in errs:
        print('ERROR:', e)
    print(f'{len(errs)} errors, {len(warns)} warnings')
    return len(errs)


def look(keys):
    fr = {}
    allfn = {k: fn for k, fn, *_ in ICONS}
    allfn.update({k: v[0] for k, v in PANELS.items()})
    for k in keys:
        fr[k] = allfn[k]()
    W = sum(max(96, im.width) * 2 + 10 for im in fr.values()) + 10
    H = max(im.height for im in fr.values()) * 2 + 20
    out = Image.new('RGBA', (W, H * 2), (255, 248, 236, 255))
    ImageDraw.Draw(out).rectangle((0, H, W, 2 * H), fill=(43, 47, 58, 255))
    x = 10
    for k, im in fr.items():
        big = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
        out.alpha_composite(big, (x, 10))
        out.alpha_composite(big, (x, H + 10))
        out.alpha_composite(im.resize((32, 32), Image.LANCZOS), (x, H - 40)) if im.width == 96 else None
        x += big.width + 10
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, 'look_ui5.png')
    out.save(p)
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--look', default='')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--no-preview', action='store_true')
    ap.add_argument('--preview-only', action='store_true', help='previews from the delivered atlas frames')
    a = ap.parse_args()
    if a.look:
        print(look([k.strip() for k in a.look.split(',') if k.strip()]))
        return
    if a.check:
        sys.exit(1 if check() else 0)
    fr = render_all()
    if a.preview_only:
        man = json.load(open(os.path.join(OUT, 'manifest.json')))
    else:
        sheet, atlas, man = write_assets(fr)
        print(f'assets/ui5: {len(atlas["frames"])} frames, page {sheet.size} = {man["conventions"]["pageMiB"]} MiB')
    if not a.no_preview:
        os.makedirs(PREV, exist_ok=True)
        print(preview_icons(fr, os.path.join(PREV, 'ui5_icons.png')))
        print(preview_sources(fr, man, os.path.join(PREV, 'ui5_panel_sources.png')))
        for p in preview_panels(fr, man, os.path.join(PREV, 'ui5_panels.png')):
            print(p)
    sys.exit(1 if check() else 0)


if __name__ == '__main__':
    main()
