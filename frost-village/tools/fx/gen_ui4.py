"""
gen_ui4.py - CONTRACT_V8 §AC city UI for Frost Village: the 96-px icon set `ui4_icons` (bank, story network,
police, fire, logistics) and the panels ui_wanted_poster, ui_newspaper (+ masthead / column / photo / divider
pieces), ui_passbook (+ row), ui_story_card (+ news variant).  Same "soft toy" house style as assets/ui, ui2, ui3
(fxlib.toy: dark tinted outline, gradient lit by a rounded bevel from the shared upper-left sun, gloss band, ONE
soft navy drop shadow).  No text is baked - the game renders every word (poster title, names, the paper's
"솔방울 신문" masthead, amounts).

Library module of the fx_city builder (tools/fx/gen_fx_city.py writes assets/fx_city + previews).  Its own CLI
only makes scratch previews (assets untouched):
    python3 tools/fx/gen_ui4.py --only ui_icon_piggy,ui_wanted_poster      # -> <tmp>/fv_cache/fx_city/ui4_only.png
    python3 tools/fx/gen_ui4.py --all                                       # every icon + panel, scratch sheet
Imports fxlib, gen_ui3, emote_art, ui2_art and gen_fx_city_fx READ-ONLY.
"""
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import fxlib as F                                       # noqa: E402
from fxlib import hexc, toy, stroke                     # noqa: E402
import emote_art as EA                                  # noqa: E402
import gen_ui3 as U3                                    # noqa: E402  (palettes + canvas/shadow/part helpers)
import ui2_art as U2                                    # noqa: E402  (villager head)
import gen_fx_city_fx as FXC                            # noqa: E402  (toy flames, question mark)

CACHE = os.path.join(tempfile.gettempdir(), 'fv_cache', 'fx_city')
WHITE = hexc('#FFFFFF')
U = F.union
canvas, shadow, part, rot, star = U3.canvas, U3.shadow, U3.part, U3.rot, U3.star
GOLD, RED, BLUE, GREEN, PINK = U3.GOLD, U3.RED, U3.BLUE, U3.GREEN, U3.PINK
PURPLE, SILVER, STEEL, WOOD, WOOD_D = U3.PURPLE, U3.SILVER, U3.STEEL, U3.WOOD, U3.WOOD_D
PAPER, CREAM, NAVY, SKIN, MINT, LAV = U3.PAPER, U3.CREAM, U3.NAVY, U3.SKIN, U3.MINT, U3.LAV
PIGPINK = ('#FFD0DE', '#F48AAE', '#8E2450')
KRAFT = ('#F6D29C', '#C98F55', '#6A4220')
BURLAP = ('#F4DCAA', '#C99A5C', '#6A4220')
YELLOW = ('#FFF0A0', '#F2C230', '#7A4A0E')
SKY = ('#E6F6FF', '#8CC4F0', '#245592')
TIRE = ('#5A6478', '#262C38', '#10141C')
INK = '#3A2A1E'


def glossy(c, x, y, rx, ry, ang=-38, a=0.6):
    EA.glossy_spot(c, x, y, rx, ry, ang, a, 1.0)


def coin_face(c, x, y, r, ow=2.2):
    """Small front-facing gold coin with an embossed star (icon scale)."""
    d = F.sd_circle(c.X, c.Y, x, y, r)
    part(c, d, GOLD, ow=ow, bevel=r * 0.35, gloss=0.0, hi=0.6, tint='gold', spec=0.2)
    c.fill(np.abs(F.sd_circle(c.X, c.Y, x, y, r * 0.72)) - max(0.5, r * 0.05), hexc('#C8861E'), 0.6)
    part(c, star(c, x, y + r * 0.03, r * 0.5, r * 0.22, round_=r * 0.06), ('#FFF6C8', '#F5B83A', '#B8650E'), ow=0,
         bevel=r * 0.15, gloss=0.0, hi=0.7)
    return d


def coin_edge(c, x, y, rx, ry, th):
    """Coin seen from the side-top (for stacks): rim band + top ellipse."""
    body = U(F.sd_ellipse(c.X, c.Y, x, y, rx, ry), F.sd_box(c.X, c.Y, x, y + th / 2, rx, th / 2, 0.01),
             F.sd_ellipse(c.X, c.Y, x, y + th, rx, ry))
    part(c, body, ('#F2C04A', '#C8861E', '#7A4A0E'), ow=2.0, bevel=2.5, gloss=0.0, hi=0.5, tint='gold')
    for k in range(9):
        xx = x - rx + (k + 0.5) * 2 * rx / 9
        c.fill(F.intersect(F.sd_box(c.X, c.Y, xx, y + th * 0.6, 0.55, th * 0.42, 0.3), body + 1.0), hexc('#A86E12'), 0.55)
    top = F.sd_ellipse(c.X, c.Y, x, y, rx - 0.5, ry - 0.5)
    t = np.clip((c.Y - (y - ry)) / (2 * ry), 0, 1)
    c.paint(c.cov(top), F.mix(hexc('#FFF2A8'), hexc('#F5B83A'), t))
    c.fill(np.abs(F.sd_ellipse(c.X, c.Y, x, y, rx * 0.68, ry * 0.62)) - 0.6, hexc('#D0922A'), 0.7)
    return body


def plus_badge(c, x, y, r=10.5, pal=GREEN):
    d = F.sd_circle(c.X, c.Y, x, y, r)
    c.shadow(c.cov(d), dy=1.5, sigma=1.2, opacity=0.3)
    part(c, d, pal, ow=2.0, bevel=r * 0.4, gloss=0.3, hi=0.55)
    p = U(F.sd_box(c.X, c.Y, x, y, r * 0.55, r * 0.16, r * 0.1), F.sd_box(c.X, c.Y, x, y, r * 0.16, r * 0.55, r * 0.1))
    c.fill(p, WHITE)


def check_badge(c, x, y, r=10.5):
    d = F.sd_circle(c.X, c.Y, x, y, r)
    c.shadow(c.cov(d), dy=1.5, sigma=1.2, opacity=0.3)
    part(c, d, GREEN, ow=2.0, bevel=r * 0.4, gloss=0.3, hi=0.55)
    tick = F.sd_polyline(c.X, c.Y, [(x - r * 0.48, y + r * 0.02), (x - r * 0.12, y + r * 0.38), (x + r * 0.5, y - r * 0.36)],
                         r * 0.17)
    c.fill(tick, WHITE)


def arrow_sd(X, Y, pts, w, head):
    """Thick polyline arrow ending in a triangular head at the last point."""
    body = F.sd_polyline(X, Y, pts[:-1] + [pts[-1]], w)
    (x0, y0), (x1, y1) = pts[-2], pts[-1]
    L = math.hypot(x1 - x0, y1 - y0) or 1
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    tip = (x1 + ux * head * 0.9, y1 + uy * head * 0.9)
    b1 = (x1 - uy * head, y1 + ux * head)
    b2 = (x1 + uy * head, y1 - ux * head)
    return F.smin(body, F.sd_polygon(X, Y, [tip, b1, b2]) - 1.2, 1.5)


def house_sd(c, x, y, s=1.0):
    """Simple cosy house: walls rect + roof triangle (y = ground line)."""
    walls = F.sd_box(c.X, c.Y, x, y - 14 * s, 17 * s, 14 * s, 2.5 * s)
    roof = F.sd_polygon(c.X, c.Y, [(x - 24 * s, y - 25 * s), (x, y - 46 * s), (x + 24 * s, y - 25 * s)]) - 2.5 * s
    return walls, roof


def paint_house(c, x, y, s=1.0, roof=RED, door=True):
    walls, rf = house_sd(c, x, y, s)
    part(c, walls, ('#FFF6E4', '#EAD3AA', '#6A4A2A'), ow=2.4, bevel=4 * s, gloss=0.15, tint='paper')
    part(c, rf, roof, ow=2.6, bevel=4 * s, gloss=0.3, tint='red' if roof is RED else None)
    snow = F.smin(F.sd_polygon(c.X, c.Y, [(x - 13 * s, y - 37 * s), (x, y - 46 * s), (x + 13 * s, y - 37 * s)]) - 2.5 * s,
                  F.sd_circle(c.X, c.Y, x - 7 * s, y - 37 * s, 3.2 * s), 2 * s)
    part(c, snow, ('#FFFFFF', '#DCE6F2', '#7E93B5'), ow=1.4, bevel=2, gloss=0.2, tint='#7E9CCC')
    win = F.sd_box(c.X, c.Y, x + 8 * s, y - 17 * s, 4.6 * s, 4.6 * s, 1.2 * s)
    part(c, win, ('#FFF4C0', '#FFC83D', '#7A4A0E'), ow=1.4, bevel=1.5, gloss=0.3, hi=0.6)
    c.fill(U(F.sd_box(c.X, c.Y, x + 8 * s, y - 17 * s, 0.6 * s, 4.6 * s, 0.1), F.sd_box(c.X, c.Y, x + 8 * s, y - 17 * s,
                                                                                         4.6 * s, 0.6 * s, 0.1)),
           hexc('#9A6A2A'), 0.8)
    if door:
        dr = F.sd_box(c.X, c.Y, x - 6 * s, y - 9 * s, 5 * s, 9 * s, 2.2 * s)
        part(c, dr, WOOD_D, ow=1.6, bevel=2, gloss=0.2, tint='wood')
        c.fill(F.sd_circle(c.X, c.Y, x - 3 * s, y - 9 * s, 0.9 * s), hexc('#FFC83D'))
    return walls, rf


def box_iso(c, x, y, w, h, d, pal=KRAFT, tape=True, paint=True):
    """Cardboard box in a 3/4 view: front face, side face and top (y = bottom front edge).  Returns its SDF
    (paint=False only computes it, e.g. for the icon's drop shadow)."""
    front = F.sd_polygon(c.X, c.Y, [(x - w, y - h), (x, y - h + d * 0.5), (x, y), (x - w, y - d * 0.5)]) - 1.0
    side = F.sd_polygon(c.X, c.Y, [(x, y - h + d * 0.5), (x + w * 0.8, y - h), (x + w * 0.8, y - d * 0.5), (x, y)]) - 1.0
    top = F.sd_polygon(c.X, c.Y, [(x - w, y - h), (x - w * 0.2, y - h - d * 0.45), (x + w * 0.8, y - h),
                                   (x, y - h + d * 0.5)]) - 1.0
    allb = U(front, side, top)
    if not paint:
        return allb
    c.fill(allb - 2.2, hexc(pal[2]))
    for dd, k in ((front, 0.95), (side, 0.78), (top, 1.12)):
        t = np.clip((c.Y - (y - h - d)) / (h + d), 0, 1)
        col = np.clip(F.mix(hexc(pal[0]), hexc(pal[1]), t) * k, 0, 1)
        c.paint(c.cov(dd), col)
    c.fill(np.abs(top + 1.0) - 0.6, hexc(pal[2]), 0.35)
    if tape:
        tp = F.sd_polygon(c.X, c.Y, [(x - w * 0.62, y - h - d * 0.16), (x - w * 0.5, y - h - d * 0.24),
                                     (x + w * 0.42, y - h + d * 0.2), (x + w * 0.3, y - h + d * 0.28)])
        c.fill(F.intersect(tp, top), hexc('#E8C58A'), 0.95)
    return allb


# =========================================================================== bank
def icon_piggy():
    """Savings: chubby pink piggy bank (facing left) with a gold coin dropping into the slot."""
    c = canvas(0.95)
    body = F.sd_ellipse(c.X, c.Y, 50, 58, 33, 25)
    snout = F.sd_ellipse(c.X, c.Y, 17, 60, 7.5, 9.5)
    ear = F.sd_polygon(c.X, c.Y, [(31, 40), (35, 25), (45, 37)]) - 2.5
    legs = [F.sd_box(c.X, c.Y, x, 80, 5.2, 6.5, 2.6) for x in (30, 44, 59, 72)]
    tail = F.sd_arc(c.X, c.Y, 86, 54, 4.5, math.radians(-150), math.radians(160), 1.7)
    coin_d = F.sd_ellipse(c.X, c.Y, 56, 18, 9.5, 10.5)
    allsh = U(body, snout, ear, *legs, tail, coin_d)
    shadow(c, allsh)
    for lg in legs[1::2]:
        part(c, lg, ('#F7B0C6', '#D86A92', '#8E2450'), ow=2.2, bevel=2.5, gloss=0.0)
    part(c, tail, PIGPINK, ow=1.6, bevel=1.5, gloss=0.0)
    part(c, F.smin(body, snout, 4), PIGPINK, ow=3.0, bevel=9, gloss=0.3, hi=0.5, lo=0.45, tint='#C03070')
    for lg in legs[0::2]:
        part(c, lg, PIGPINK, ow=2.2, bevel=2.5, gloss=0.0)
    part(c, ear, ('#FFC0D2', '#E86E98', '#8E2450'), ow=2.0, bevel=2.5, gloss=0.0)
    part(c, snout, ('#FFC8D8', '#F07AA0', '#8E2450'), ow=2.0, bevel=3, gloss=0.2, hi=0.55)
    for dy in (-3.2, 3.2):
        c.fill(F.sd_ellipse(c.X, c.Y, 16, 60 + dy, 1.6, 2.0), hexc('#8E2450'))
    c.fill(F.sd_ellipse(c.X, c.Y, 31, 50, 2.6, 3.4), hexc(EA.INK))
    c.fill(F.sd_circle(c.X, c.Y, 30.2, 48.8, 1.0), WHITE)
    EA.cheeks(c, 33, 60, 0, 0, rx=4.6, ry=2.6, a=0.55)
    slot = F.sd_box(c.X, c.Y, 56, 34.5, 9, 2.0, 2.0)
    c.fill(slot - 0.8, hexc('#8E2450'))
    c.fill(slot, hexc('#5A1430'))
    # coin half-way into the slot (clipped by the slot line)
    Xc, Yc = rot(c, 56, 22, 0)
    cd = F.intersect(F.sd_ellipse(Xc, Yc, 56, 22, 9.5, 10.5), c.Y - 34.5)
    part(c, cd, GOLD, ow=2.0, bevel=3, gloss=0.0, hi=0.6, tint='gold', spec=0.3)
    part(c, F.intersect(star(c, 56, 22, 5.2, 2.3, round_=0.5), cd + 1), ('#FFF6C8', '#F5B83A', '#B8650E'), ow=0,
         bevel=1.2, gloss=0)
    glossy(c, 38, 42, 8, 3.5, -30, 0.55)
    EA.twinkle(c, 76, 18, 6.0, edge='#8E520A')
    return c.image()


def icon_loan():
    """Loan: a fat burlap money sack with a gold coin emblem, and a blue arrow curving in (money arrives)."""
    c = canvas(0.96)
    sack = F.smin(F.sd_ellipse(c.X, c.Y, 44, 62, 27, 25), F.sd_box(c.X, c.Y, 44, 34, 9, 6, 3), 7)
    ruff = F.smin(F.sd_ellipse(c.X, c.Y, 36, 24, 7, 6), F.sd_ellipse(c.X, c.Y, 52, 24, 7, 6), 3)
    ruff = F.smin(ruff, F.sd_ellipse(c.X, c.Y, 44, 21, 6, 6), 3)
    tie = F.sd_box(c.X, c.Y, 44, 32, 11.5, 3.2, 3)
    arr = arrow_sd(c.X, c.Y, [(84, 22), (88, 44), (82, 62), (75, 70)], 4.0, 8.0)
    allsh = U(sack, ruff, tie, arr)
    shadow(c, allsh)
    part(c, ruff, BURLAP, ow=2.4, bevel=3, gloss=0.0, tint='wood')
    part(c, sack, BURLAP, ow=3.0, bevel=8, gloss=0.25, tint='wood')
    for k in range(5):                                       # burlap weave hints
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, 22 + k * 3, 52 + k * 7, 28 + k * 3, 50 + k * 7, 0.6), sack + 4),
               hexc('#A87A3E'), 0.35)
    part(c, tie, ('#E86A5A', '#B8352A', '#5E1410'), ow=2.0, bevel=2, gloss=0.2)
    coin_face(c, 44, 63, 12.5)
    part(c, arr, BLUE, ow=2.4, bevel=3, gloss=0.3, tint='blue')
    glossy(c, 30, 48, 6, 3, -40, 0.5)
    return c.image()


def icon_interest():
    """Interest: a stack of gold coins with a little seedling sprouting on top and a green up-arrow (savings grow)."""
    c = canvas(0.96)
    stack = []
    for k in range(4):
        y = 76 - k * 9
        stack.append((40, y, 23, 7.5, 7))
    sprout_stem = F.sd_polyline(c.X, c.Y, [(40, 46), (40.5, 36), (41, 28)], 2.0)
    lf1 = F.sd_ellipse(*rot(c, 31, 28, -28), 31, 28, 9.5, 5.0)
    lf2 = F.sd_ellipse(*rot(c, 50, 24, 25), 50, 24, 10.5, 5.4)
    arr = arrow_sd(c.X, c.Y, [(78, 74), (78, 36)], 4.6, 9.0)
    allsh = U(*[F.sd_box(c.X, c.Y, x, y, rx, ry + 4, 6) for x, y, rx, ry, _ in stack], sprout_stem, lf1, lf2, arr)
    shadow(c, allsh)
    part(c, arr, GREEN, ow=2.4, bevel=3, gloss=0.3, tint='green')
    for x, y, rx, ry, th in stack:
        coin_edge(c, x, y - th, rx, ry, th)
    part(c, sprout_stem, GREEN, ow=1.6, bevel=1.5, gloss=0.0, tint='green')
    for lf in (lf1, lf2):
        part(c, lf, ('#B5F2A8', '#4FBE5C', '#1F5E2A'), ow=1.8, bevel=3, gloss=0.3, hi=0.55, tint='green')
    c.fill(F.intersect(F.sd_segment(c.X, c.Y, 24, 31, 37, 27, 0.6), lf1 + 1), hexc('#2E7A3A'), 0.7)
    c.fill(F.intersect(F.sd_segment(c.X, c.Y, 43, 27, 58, 22, 0.6), lf2 + 1), hexc('#2E7A3A'), 0.7)
    EA.twinkle(c, 20, 44, 5.5, edge='#8E520A')
    return c.image()


def icon_passbook():
    """Passbook: a navy-blue bank book (slightly turned) with a gold coin emblem, cream page edges and a red
    ribbon bookmark."""
    c = canvas(0.95)
    X, Y = rot(c, 48, 50, -8)
    pages = F.sd_box(X, Y, 50, 52, 27, 34, 5)
    cover = F.sd_box(X, Y, 46, 50, 27, 34, 6)
    ribbon = F.sd_polygon(X, Y, [(58, 80), (65, 80), (65, 93), (61.5, 89), (58, 93)]) - 0.8
    allsh = U(pages, cover, ribbon)
    shadow(c, allsh)
    part(c, ribbon, RED, ow=1.6, bevel=1.5, gloss=0.0)
    part(c, pages, CREAM, ow=2.4, bevel=2.5, gloss=0.0, hi=0.4, tint='paper')
    for k in range(4):
        c.fill(F.intersect(np.abs(X - (73.5 - k * 1.4)) - 0.35, pages + 1.5), hexc('#C9B48E'), 0.6)
    part(c, cover, ('#6C9CE8', '#2A55B0', '#102A64'), ow=3.0, bevel=6, gloss=0.3, hi=0.5, tint='#1E3A8A')
    spine = F.intersect(cover + 1.5, X - 26)
    c.fill(spine, hexc('#1E3A8A'), 0.35)
    c.fill(np.abs(F.sd_box(X, Y, 48, 50, 18.5, 25.5, 3)) - 0.8, hexc('#FFD86A'), 0.75)
    coin_face(c, 48, 46, 10.5, ow=1.8)
    c.fill(F.sd_box(X, Y, 48, 66, 10, 1.6, 0.8), hexc('#FFD86A'), 0.8)
    glossy(c, 34, 26, 7, 3, -45, 0.5)
    return c.image()


def icon_insurance():
    """Fire insurance: a blue shield with a white rim guarding a little red-roofed house, green check badge."""
    c = canvas(0.95)
    cx = 46
    top, bot = 14, 86

    def shield(w, h_top, h_bot, inset):
        body = F.sd_box(c.X, c.Y, cx, (top + inset + 54) / 2, w, (54 - top - inset) / 2, 7)
        tip = F.sd_polygon(c.X, c.Y, [(cx - w, 50), (cx + w, 50), (cx, h_bot - inset)])
        return F.smin(body, tip - 4, 6)
    sh_out = shield(33, top, bot, 0)
    sh_in = shield(26, top, bot, 7)
    shadow(c, sh_out)
    part(c, sh_out, SILVER, ow=3.0, bevel=5, gloss=0.3, hi=0.5, tint='silver', spec=0.25)
    part(c, sh_in, ('#7FB2F0', '#2F78D6', '#143B74'), ow=1.6, bevel=5, gloss=0.25, tint='blue')
    paint_house(c, cx, 64, 0.72)
    check_badge(c, 76, 74, 11.5)
    glossy(c, 32, 26, 7, 3, -40, 0.5)
    return c.image()


# =========================================================================== story network
def icon_story():
    """Story: an open storybook with ruled pages and a pink heart + twinkles rising out of it."""
    c = canvas(0.96)
    cover = U(F.sd_polygon(c.X, c.Y, [(8, 52), (48, 58), (48, 86), (8, 78)]) - 3,
              F.sd_polygon(c.X, c.Y, [(88, 52), (48, 58), (48, 86), (88, 78)]) - 3)
    pl = F.sd_polygon(c.X, c.Y, [(13, 44), (47, 52), (47, 79), (13, 71)]) - 2.5
    pr = F.sd_polygon(c.X, c.Y, [(83, 44), (49, 52), (49, 79), (83, 71)]) - 2.5
    heart = EA.heart_sdf(c.X, c.Y, 48, 28, 30) - 0.5
    allsh = U(cover, pl, pr, heart)
    shadow(c, allsh)
    part(c, cover, ('#E86A5A', '#B8352A', '#5E1410'), ow=2.6, bevel=3, gloss=0.0, tint='red')
    for p in (pl, pr):
        part(c, p, CREAM, ow=1.8, bevel=3, gloss=0.0, hi=0.4, lo=0.3, tint='paper')
    for k in range(3):
        y = 56 + k * 6
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, 18, y - 6 + k * 0.6, 42, y + k * 0.3 - 0.5, 0.65), pl + 2), hexc('#C9B48E'))
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, 54, y + k * 0.3 - 0.5, 78, y - 6 + k * 0.6, 0.65), pr + 2), hexc('#C9B48E'))
    c.fill(F.sd_segment(c.X, c.Y, 48, 53, 48, 80, 0.8), hexc('#8A6A44'), 0.7)
    part(c, heart, PINK, ow=2.4, bevel=6, gloss=0.0, hi=0.6, pillow=5.0, tint='pink')
    glossy(c, 41, 21, 4.5, 2.4, -40, 0.75)
    EA.twinkle(c, 22, 26, 6.0, edge='#8E520A')
    EA.twinkle(c, 74, 18, 4.8, edge='#B0204E', tip='#FFA0BC')
    return c.image()


def icon_rumor():
    """Rumour: a big friendly ear listening to purple whisper waves ')))' (소문)."""
    c = canvas(0.96)
    outer = F.smin(F.sd_ellipse(c.X, c.Y, 38, 44, 22, 29), F.sd_ellipse(c.X, c.Y, 44, 70, 10, 10), 6)
    inner = F.sd_ellipse(c.X, c.Y, 42, 44, 12, 18)
    fold = F.sd_arc(c.X, c.Y, 41, 44, 9.5, math.radians(150), math.radians(390), 3.0)
    waves = [F.sd_arc(c.X, c.Y, 60, 44, r, math.radians(-50), math.radians(50), 3.0) for r in (12, 21, 30)]
    allsh = U(outer, *waves)
    shadow(c, allsh)
    part(c, outer, SKIN, ow=3.0, bevel=7, gloss=0.2, hi=0.45, lo=0.4, tint='#C86A50')
    c.fill(inner, hexc('#E8A07E'), 0.55, feather=1.5)
    part(c, fold, ('#FFE0C8', '#F0A884', '#8E4A2A'), ow=1.4, bevel=2, gloss=0.0, hi=0.4)
    c.fill(F.sd_ellipse(c.X, c.Y, 44, 53, 3.4, 2.6), hexc('#B8604A'), 0.6)
    for k, w in enumerate(waves):
        part(c, w, (('#E6D6FF', '#9A72E8', '#3E2480'), ('#DCC8FF', '#8458E0', '#35206E'),
                    ('#D2BAFF', '#7C4FE0', '#35206E'))[k], ow=1.8, bevel=1.8, gloss=0.0)
    glossy(c, 27, 28, 6, 3, -45, 0.55)
    EA.twinkle(c, 84, 18, 5.0, edge='#5A30B0', tip='#C9A8FF')
    return c.image()


def icon_question():
    """Question: a white speech bubble holding a glossy blue '?' (residents asking about new things)."""
    c = F.Canvas(96, 96)
    body = F.sd_box(c.X, c.Y, 49, 42, 37, 31, 18)
    tail = F.sd_polygon(c.X, c.Y, [(24, 62), (42, 66), (16, 87)]) - 2.5
    d = F.smin(body, tail, 4)
    shadow(c, d)
    c.fill(d - 2.6, hexc('#7F90AE'))
    t = np.clip((c.Y - 12) / 70, 0, 1)
    base = F.mix(hexc('#FFFFFF'), hexc('#E9EFF8'), t)
    n = F.bevel_normals(d, 7, c.px)
    c.paint(c.cov(d), F.shade(base, F.lambert(n), 0.5, 0.25, tint_lo=hexc('#B8C6DC')))
    gl = F.sd_box(c.X, c.Y, 45, 18, 24, 4, 4)
    c.paint(c.cov(gl, 1.0) * np.clip(1 - (c.Y - 14) / 9, 0, 1), WHITE, 0.6)
    X2, Y2 = rot(c, 50, 44, -8)
    q = FXC.qmark_sd(X2, Y2, 50, 46, 0.86)
    c.shadow(c.cov(q - 2.0), dy=1.6, sigma=1.2, opacity=0.25)
    part(c, q, BLUE, ow=2.4, bevel=4, gloss=0.0, hi=0.6, tint='blue')
    c.fill(F.sd_arc(X2, Y2, 50, 46 - 9, 10.3, math.radians(205), math.radians(258), 1.2), WHITE, 0.75, feather=0.5)
    return c.image()


def icon_friend_new():
    """New friend: two villager heads leaning together under a pink heart, with a green '+' badge."""
    c = F.Canvas(96, 96)
    heads = [(30, 56, 22, ('#FFE07A', '#F2C230'), '#7A4A0E'), (66, 58, 22, ('#FF8E7E', '#D9483B'), '#6A1A12')]
    heart = EA.heart_sdf(c.X, c.Y, 48, 22, 26) - 0.5
    sil = U(*[F.sd_circle(c.X, c.Y, x, y, r) for x, y, r, _, _ in heads], heart)
    shadow(c, sil, ow=2.4)
    for x, y, r, pk, ln in heads:
        U2._villager_head(c, x, y, r, pk, ln)
    part(c, heart, PINK, ow=2.4, bevel=5, gloss=0.0, hi=0.6, pillow=4.5, tint='pink')
    glossy(c, 42, 16, 4, 2.2, -40, 0.75)
    plus_badge(c, 81, 20, 10.5)
    return c.image()


def icon_memory():
    """Memory: a tilted instant photo of a snowy village with a little heart sticker and a twinkle."""
    c = canvas(0.94)
    X, Y = rot(c, 48, 48, 9)
    frame = F.sd_box(X, Y, 48, 48, 31, 36, 4)
    photo = F.sd_box(X, Y, 48, 41, 25, 24, 1.5)
    heart = EA.heart_sdf(c.X, c.Y, 74, 76, 20) - 0.3
    shadow(c, U(frame, heart))
    part(c, frame, ('#FFFFFF', '#EEF0F4', '#6E7A99'), ow=2.6, bevel=3, gloss=0.0, hi=0.4, lo=0.3, tint='#8A96B8')
    sky = F.mix(hexc('#9FD0FF'), hexc('#E6F4FF'), np.clip((Y - 17) / 30, 0, 1))
    c.paint(c.cov(photo), sky)
    c.fill(F.intersect(F.sd_circle(X, Y, 63, 26, 5.5), photo), hexc('#FFD86A'))
    hill = F.intersect(F.sd_ellipse(X, Y, 40, 70, 40, 18), photo)
    c.fill(hill, hexc('#FFFFFF'))
    c.fill(F.intersect(F.sd_ellipse(X, Y, 66, 68, 26, 13), photo), hexc('#E2EAF5'))
    hw = F.intersect(F.sd_box(X, Y, 42, 50, 7, 5.5, 1), photo)
    hr = F.intersect(F.sd_polygon(X, Y, [(33, 45.5), (42, 38), (51, 45.5)]) - 0.8, photo)
    c.fill(hw, hexc('#F4D9A8'))
    c.fill(hr, hexc('#D9483B'))
    c.fill(F.intersect(F.sd_box(X, Y, 44.5, 51, 2, 2, 0.5), photo), hexc('#FFC83D'))
    for (tx, ty, s) in ((24, 50, 6), (60, 52, 5)):
        tree = F.intersect(F.sd_polygon(X, Y, [(tx - s, ty + 2), (tx, ty - 2.4 * s), (tx + s, ty + 2)]), photo)
        c.fill(tree, hexc('#2E6B4F'))
    stroke(c, photo, 1.0, '#8A96B8', 0.7)
    part(c, heart, PINK, ow=2.2, bevel=4, gloss=0.0, hi=0.6, pillow=4.0, tint='pink')
    glossy(c, 70, 70, 3, 1.6, -40, 0.75)
    EA.twinkle(c, 18, 18, 6.5, edge='#5A30B0', tip='#C9A8FF')
    return c.image()


def _move_house(c, x, y):
    return paint_house(c, x, y, 0.95)


def icon_move_in():
    """Move in (welcome home): a cosy house whose front doorway stands OPEN and glows with warm light, a pink heart
    welcome mat on the step, a big green arrow curving INTO the doorway and a moving box waiting beside it.
    Shape-coded (open lit doorway + inward arrow + heart mat) so it never relies on the arrow colour alone."""
    c = canvas(0.95)
    hx, hy = 60, 80
    walls, rf = house_sd(c, hx, hy, 1.1)
    mat = F.sd_box(c.X, c.Y, hx - 7, hy + 3.8, 11, 3.2, 1.6)
    arr = arrow_sd(c.X, c.Y, [(6, 34), (18, 42), (30, 54), (37, 63)], 4.6, 8.0)
    bx = box_iso(c, 86, 92, 9, 11, 9, paint=False)
    shadow(c, U(walls, rf, arr, bx, mat))
    paint_house(c, hx, hy, 1.1, door=False)
    door = F.sd_box(c.X, c.Y, hx - 7, hy - 11, 6.6, 11, 2.0)
    part(c, door + 1.6, WOOD_D, ow=1.6, bevel=1.5, gloss=0.0, tint='wood')        # door frame
    t = np.clip((c.Y - (hy - 22)) / 22, 0, 1)
    c.paint(c.cov(door), F.mix(hexc('#FFF6C8'), hexc('#FFB43D'), t))            # warm light inside
    c.paint(c.cov(door) * np.clip(1 - np.abs(c.X - (hx - 7)) / 6.6, 0, 1), WHITE, 0.45)
    part(c, mat, ('#FFB0C4', '#E85A86', '#7A1E40'), ow=1.4, bevel=1.5, gloss=0.1, tint='pink')
    c.fill(F.sd_heart(c.X, c.Y, hx - 7, hy + 3.9, 2.4), WHITE, 0.95)
    box_iso(c, 87, 92, 9, 11, 9)
    part(c, arr, GREEN, ow=2.4, bevel=3, gloss=0.3, tint='green')
    return c.image()


def icon_move_out():
    """Move out (goodbye): a chubby orange moving truck loaded with boxes driving off, speed lines behind it - a
    truck silhouette, unmistakable next to move_in at 32 px (not only a different arrow colour)."""
    c = canvas(0.95)
    cargo = F.sd_box(c.X, c.Y, 40, 54, 26, 19, 4)
    cab = F.smin(F.sd_box(c.X, c.Y, 74, 60, 11, 13, 5), F.sd_box(c.X, c.Y, 79, 66, 9, 7, 4), 2.5)
    wheels = [(26, 76), (70, 76)]
    allsh = U(cargo, cab, *[F.sd_circle(c.X, c.Y, x, y, 9.5) for x, y in wheels])
    shadow(c, allsh)
    for k, (yy, ln) in enumerate(((42, 7), (52, 9), (62, 6))):                  # speed lines behind the truck
        c.fill(F.sd_segment(c.X, c.Y, 3 + k, yy, 3 + k + ln, yy, 1.8), hexc('#8FA6C8'), 0.9)
    part(c, cargo, ('#FFD08A', '#F08A3D', '#7A3A0E'), ow=3.0, bevel=6, gloss=0.3, tint='#C05A1A', spec=0.1)
    c.fill(F.intersect(F.sd_box(c.X, c.Y, 40, 62, 26, 2.0, 1.0), cargo + 1.5), WHITE, 0.9)
    box_iso(c, 30, 46, 8, 9, 8)                                             # boxes peeking over the rail
    box_iso(c, 46, 44, 9, 11, 9)
    part(c, cab, ('#FFD08A', '#F08A3D', '#7A3A0E'), ow=3.0, bevel=5, gloss=0.35, tint='#C05A1A', spec=0.1)
    win = F.sd_box(c.X, c.Y, 77, 55, 5.5, 5.5, 2.4)
    part(c, win, SKY, ow=1.4, bevel=2, gloss=0.4, hi=0.6)
    part(c, F.sd_circle(c.X, c.Y, 87, 68, 2.6), ('#FFF6C8', '#FFC83D', '#7A4A0E'), ow=1.2, bevel=1.5, gloss=0.3,
         hi=0.8)
    for x, y in wheels:
        part(c, F.sd_circle(c.X, c.Y, x, y, 9.5), TIRE, ow=2.2, bevel=3.5, gloss=0.15)
        part(c, F.sd_circle(c.X, c.Y, x, y, 4.4), STEEL, ow=1.3, bevel=2, gloss=0.2, spec=0.3)
    return c.image()


def pinecone(c, x, y, s, ow=1.6):
    """Little pinecone emblem (솔방울): stacked scale rows on an egg shape + a needle sprig."""
    egg = F.sd_ellipse(c.X, c.Y, x, y, 7.5 * s, 10.5 * s)
    sprig = U(F.sd_segment(c.X, c.Y, x, y - 10 * s, x + 6 * s, y - 15 * s, 1.2 * s),
              F.sd_segment(c.X, c.Y, x, y - 10 * s, x - 5 * s, y - 16 * s, 1.2 * s),
              F.sd_segment(c.X, c.Y, x, y - 10 * s, x + 1 * s, y - 17 * s, 1.2 * s))
    part(c, sprig, GREEN, ow=ow * 0.8, bevel=1, gloss=0.0)
    part(c, egg, ('#D9A066', '#9A5E2A', '#4A2810'), ow=ow, bevel=3 * s, gloss=0.0, hi=0.45, tint='wood')
    for row in range(4):
        yy = y - 6 * s + row * 4.2 * s
        for k in range(-1 - (row % 2 == 0), 2):
            xx = x + (k + (0.5 if row % 2 == 0 else 0)) * 4.0 * s
            sc = F.intersect(F.sd_arc(c.X, c.Y, xx, yy - 2.0 * s, 2.4 * s, math.radians(20), math.radians(160), 0.5 * s),
                             egg + 0.8)
            c.fill(sc, hexc('#5A3214'), 0.75)
    return U(egg, sprig)


def icon_newspaper():
    """Newspaper (솔방울 신문): a folded town paper with a pinecone emblem on the masthead, a photo box and columns."""
    c = canvas(0.95)
    X, Y = rot(c, 48, 50, -7)
    back = F.sd_box(X, Y, 53, 52, 30, 34, 3)
    page = F.sd_box(X, Y, 47, 49, 31, 35, 3)
    shadow(c, U(back, page))
    part(c, back, ('#F2EAD8', '#D9CCB0', '#6E5E44'), ow=2.2, bevel=2, gloss=0.0, hi=0.3)
    part(c, page, ('#FFFDF6', '#EFE6D2', '#6E5E44'), ow=2.6, bevel=2.5, gloss=0.0, hi=0.35, lo=0.3, tint='paper')
    c.fill(F.sd_box(X, Y, 47, 29, 25, 0.9, 0.4), hexc('#3A3A44'), 0.9)
    c.fill(F.sd_box(X, Y, 50, 22, 15, 3.2, 1.5), hexc('#3A3A44'), 0.85)
    pinecone(c, 26, 22, 0.62, ow=1.2)
    ph_ = F.sd_box(X, Y, 33, 45, 10, 9, 1)
    c.fill(ph_ - 1.0, hexc('#5E6A80'))
    c.fill(ph_, hexc('#A9C2DE'))
    c.fill(F.intersect(F.sd_ellipse(X, Y, 33, 54, 12, 5), ph_), hexc('#FFFFFF'))
    c.fill(F.intersect(F.sd_polygon(X, Y, [(29, 49), (33, 44), (37, 49)]), ph_), hexc('#D9483B'))
    for k in range(4):
        c.fill(F.sd_box(X, Y, 61, 38 + k * 5, 10, 1.1, 0.5), hexc('#8A8A96'), 0.8)
    for k in range(4):
        c.fill(F.sd_box(X, Y, 35, 61 + k * 5, 12, 1.1, 0.5), hexc('#8A8A96'), 0.8)
        c.fill(F.sd_box(X, Y, 61, 61 + k * 5, 10, 1.1, 0.5), hexc('#8A8A96'), 0.8)
    c.fill(F.sd_box(X, Y, 47, 34, 25, 0.5, 0.2), hexc('#3A3A44'), 0.6)
    return c.image()


# =========================================================================== police
def icon_badge():
    """Police badge: a gold shield with a blue enamel centre and a white star, little laurel bumps."""
    c = canvas(0.95)
    cx = 48
    body = F.sd_box(c.X, c.Y, cx, 40, 30, 24, 10)
    tip = F.sd_polygon(c.X, c.Y, [(cx - 30, 50), (cx + 30, 50), (cx, 90)])
    sh_ = F.smin(body, tip - 4, 8)
    bumps = U(*[F.sd_circle(c.X, c.Y, cx + 30 * math.cos(a), 46 + 34 * math.sin(a), 5) for a in
                np.linspace(math.radians(-200), math.radians(20), 9)])
    out = F.smin(sh_, bumps, 3)
    inner = F.sd_circle(c.X, c.Y, cx, 50, 19)
    shadow(c, out)
    part(c, out, ('#FFE98C', '#E0A020', '#7A4A0E'), ow=3.0, bevel=6, gloss=0.3, hi=0.55, tint='gold', spec=0.25)
    part(c, inner, ('#7FB2F0', '#2A55B0', '#102A64'), ow=2.2, bevel=5, gloss=0.25, tint='#1E3A8A')
    part(c, star(c, cx, 51, 13, 5.6, round_=1.2), ('#FFFFFF', '#DCE6F2', '#56739F'), ow=1.4, bevel=2.5, gloss=0.0,
         hi=0.6)
    ribbon = F.sd_box(c.X, c.Y, cx, 23, 14, 4, 2)
    part(c, ribbon, RED, ow=1.8, bevel=2, gloss=0.2)
    glossy(c, 32, 30, 6, 3, -40, 0.55)
    return c.image()


def icon_wanted():
    """Wanted: a little pinned poster - red header band, a sepia portrait silhouette in a frame, a reward coin."""
    c = canvas(0.95)
    X, Y = rot(c, 48, 50, 6)
    paper = F.sd_box(X, Y, 48, 50, 30, 38, 3)
    shadow(c, paper)
    part(c, paper, ('#FFF6E0', '#EAD3A2', '#7A5A30'), ow=2.6, bevel=2.5, gloss=0.0, hi=0.35, lo=0.35, tint='paper')
    band = F.intersect(F.sd_box(X, Y, 48, 22, 26, 6, 2), paper + 2)
    part(c, band, RED, ow=1.6, bevel=2, gloss=0.2)
    frame = F.sd_box(X, Y, 48, 48, 16, 15, 2)
    part(c, frame, WOOD_D, ow=1.6, bevel=2, gloss=0.0)
    win = F.sd_box(X, Y, 48, 48, 12, 11, 1)
    c.paint(c.cov(win), F.mix(hexc('#F2DEB4'), hexc('#D9B880'), np.clip((Y - 37) / 22, 0, 1)))
    head = F.intersect(F.sd_circle(X, Y, 48, 45, 5.5), win)
    sh2 = F.intersect(F.sd_ellipse(X, Y, 48, 60, 10, 7), win)
    c.fill(U(head, sh2), hexc('#6A4A2E'))
    c.fill(F.intersect(F.sd_box(X, Y, 48, 44, 6.5, 1.6, 0.8), head + 0.5), hexc('#2A1E14'))       # little mask band
    for k in range(2):
        c.fill(F.sd_box(X, Y, 48, 70 + k * 4.5, 14 - 4 * k, 1.1, 0.5), hexc('#9A7A4E'), 0.8)
    coin_face(c, 69, 77, 7.5, ow=1.6)
    pin = F.sd_circle(c.X, c.Y, 48, 12, 5.0)
    c.shadow(c.cov(pin), dx=1.5, dy=2.0, sigma=1.2, opacity=0.35)
    part(c, pin, ('#9FD0FF', '#2F78D6', '#143B74'), ow=1.6, bevel=2.5, gloss=0.0, spec=0.5)
    glossy(c, 46.4, 10.6, 1.8, 1.0, -35, 0.85)
    return c.image()


def icon_cuffs_cute():
    """Cute toy handcuffs: two chubby silver rings joined by a short chain, with a pink heart charm."""
    c = canvas(0.96)
    r1 = np.abs(F.sd_ellipse(*rot(c, 30, 52, -20), 30, 52, 19, 21)) - 5.0
    r2 = np.abs(F.sd_ellipse(*rot(c, 68, 46, 18), 68, 46, 19, 21)) - 5.0
    links = [np.abs(F.sd_ellipse(*rot(c, x, y, a), x, y, 5.0, 3.4)) - 1.6 for x, y, a in ((44, 44, 20), (52, 41, -15))]
    heart = EA.heart_sdf(c.X, c.Y, 49, 72, 18) - 0.3
    hstr = F.sd_segment(c.X, c.Y, 49, 46, 49, 66, 1.0)
    allsh = U(r1, r2, *links, heart)
    shadow(c, allsh)
    c.fill(hstr, hexc('#B0204E'), 0.9)
    for lk in links:
        part(c, lk, STEEL, ow=1.6, bevel=1.5, gloss=0.2, spec=0.4)
    for rr in (r1, r2):
        part(c, rr, SILVER, ow=2.6, bevel=4.0, gloss=0.35, hi=0.5, lo=0.5, tint='silver', spec=0.45)
    for (x, y) in ((30, 31), (68, 25)):
        part(c, F.sd_box(c.X, c.Y, x, y, 5, 3.5, 1.5), STEEL, ow=1.6, bevel=1.5, gloss=0.2, spec=0.3)
    part(c, heart, PINK, ow=2.2, bevel=4, gloss=0.0, hi=0.6, pillow=4.0, tint='pink')
    glossy(c, 45, 69, 3, 1.6, -40, 0.75)
    EA.twinkle(c, 84, 76, 5.5, edge='#5A6478', tip='#DCE6F2')
    return c.image()


def icon_thief():
    """Petty thief (cute): round face with a black domino mask, black-and-white striped beanie with a pompom and
    a cheeky grin."""
    c = canvas(0.96)
    cx, cy = 48, 56
    face = F.sd_circle(c.X, c.Y, cx, cy, 27)
    hat = F.intersect(F.sd_ellipse(c.X, c.Y, cx, cy - 9, 29, 27), c.Y - (cy - 10))
    brim = F.sd_box(c.X, c.Y, cx, cy - 11, 29.5, 5.5, 5)
    pom = F.sd_circle(c.X, c.Y, cx + 3, cy - 38, 7)
    shadow(c, U(face, hat, brim, pom))
    part(c, face, SKIN, ow=2.8, bevel=8, gloss=0.0, hi=0.45, lo=0.4, tint='#C86A50')
    hb = U(hat, brim)
    part(c, hb, ('#5A6070', '#23262E', '#0E1014'), ow=2.6, bevel=5, gloss=0.2)
    stripes = (np.mod(c.Y - (cy - 36), 9.0) < 4.2).astype(np.float32)
    c.paint(c.cov(hat + 1.5) * stripes * (c.Y < cy - 16), hexc('#F2F2F2'), 0.95)
    part(c, brim, ('#4A505E', '#1E2128', '#0E1014'), ow=0, bevel=3, gloss=0.25)
    part(c, pom, ('#FFFFFF', '#DCE0E8', '#4A5060'), ow=2.0, bevel=3, gloss=0.0, hi=0.4, pillow=3.0)
    mask = F.smin(F.sd_ellipse(c.X, c.Y, cx - 11, cy + 2, 11, 7), F.sd_ellipse(c.X, c.Y, cx + 11, cy + 2, 11, 7), 4)
    mask = U(mask, F.sd_box(c.X, c.Y, cx, cy + 1, 26, 2.2, 1.5))
    part(c, F.intersect(mask, face + 0.5), ('#4A505E', '#1E2128', '#0E1014'), ow=1.2, bevel=2, gloss=0.3)
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * 11, cy + 2, 5.2, 3.8), WHITE)
        c.fill(F.sd_circle(c.X, c.Y, cx + s * 11 + 1.6, cy + 2.3, 2.4), hexc(EA.INK))
        c.fill(F.sd_circle(c.X, c.Y, cx + s * 11 + 0.8, cy + 1.2, 0.8), WHITE)
    EA.cheeks(c, cx, cy + 12, 16, 0, rx=4.4, ry=2.6, a=0.55)
    grin = F.sd_arc(c.X, c.Y, cx + 3, cy + 9, 8, math.radians(25), math.radians(140), 1.6)
    c.fill(grin, hexc(EA.INK))
    glossy(c, 34, 30, 6, 2.8, -35, 0.45)
    return c.image()


# =========================================================================== fire
def icon_fire_alert():
    """Fire alert: a rounded red warning triangle with a white rim and a toy flame inside."""
    c = canvas(0.95)
    tri = F.sd_polygon(c.X, c.Y, [(48, 12), (88, 82), (8, 82)]) - 5
    shadow(c, tri)
    part(c, tri, ('#FFFFFF', '#E9EEF5', '#7E1A16'), ow=2.6, bevel=4, gloss=0.2, hi=0.4)
    inner = F.sd_polygon(c.X, c.Y, [(48, 23), (80, 77), (16, 77)]) - 3
    part(c, inner, ('#FF8E7E', '#DE3B2F', '#7E1A16'), ow=1.4, bevel=4, gloss=0.25, tint='red')
    fl = c.layer()
    tongues = [(48, 72, 26, 9.0, 0.3, 0.4, 0.0, 0.0), (40, 72, 15, 6.5, -0.4, 0.4, 1.0, -0.15),
               (56, 72, 17, 6.5, 0.4, 0.4, 2.0, 0.12)]
    FXC.paint_fire(fl, tongues, 3.0, base=(48, 68, 11, 5), ow=1.6, bevel=3.0, rim='#5E1410', glow=False)
    c.over(fl)
    glossy(c, 40, 33, 4, 2, -55, 0.4)
    return c.image()


def icon_firetruck():
    """Fire engine: chubby red truck (side view) with a silver ladder, white stripe, beacon and chunky wheels."""
    c = canvas(0.96)
    body = F.sd_box(c.X, c.Y, 44, 58, 34, 14, 5)
    cab = F.smin(F.sd_box(c.X, c.Y, 70, 49, 14, 18, 7), F.sd_box(c.X, c.Y, 76, 60, 12, 10, 6), 3)
    ladder_r = U(F.sd_box(c.X, c.Y, 38, 36.5, 27, 1.8, 0.9), F.sd_box(c.X, c.Y, 38, 42.5, 27, 1.8, 0.9))
    rungs = U(*[F.sd_box(c.X, c.Y, 14 + k * 6.8, 39.5, 1.1, 3.4, 0.4) for k in range(8)])
    beacon = F.sd_box(c.X, c.Y, 70, 28, 5, 4, 2.5)
    wheels = [(24, 74), (68, 74)]
    allsh = U(body, cab, ladder_r, beacon, *[F.sd_circle(c.X, c.Y, x, y, 11) for x, y in wheels])
    shadow(c, allsh)
    part(c, body, RED, ow=3.0, bevel=6, gloss=0.3, tint='red', spec=0.15)
    part(c, cab, RED, ow=3.0, bevel=6, gloss=0.35, tint='red', spec=0.15)
    c.fill(F.intersect(F.sd_box(c.X, c.Y, 50, 61, 44, 2.2, 1), U(body, cab) + 2), WHITE, 0.95)
    for x in (24, 40):
        part(c, F.sd_box(c.X, c.Y, x, 53, 6, 4.5, 1.5), ('#FF9A8A', '#C9362C', '#5E1410'), ow=1.2, bevel=1.5, gloss=0.2)
        c.fill(F.sd_box(c.X, c.Y, x, 53, 3, 0.8, 0.4), hexc('#DCE6F2'), 0.9)
    win = F.sd_box(c.X, c.Y, 74, 43, 7.5, 7, 3)
    part(c, win, SKY, ow=1.6, bevel=2.5, gloss=0.4, hi=0.6)
    c.fill(F.sd_segment(c.X, c.Y, 70, 47, 75, 40, 1.0), WHITE, 0.8)
    part(c, U(ladder_r, rungs), SILVER, ow=1.4, bevel=1.2, gloss=0.2, spec=0.3)
    part(c, beacon, ('#9FD0FF', '#2F78D6', '#143B74'), ow=1.6, bevel=2, gloss=0.3, hi=0.7)
    c.fill(F.sd_circle(c.X, c.Y, 68.5, 26.5, 1.4), WHITE, 0.9)
    part(c, F.sd_circle(c.X, c.Y, 88, 62, 3.4), ('#FFF6C8', '#FFC83D', '#7A4A0E'), ow=1.4, bevel=2, gloss=0.3, hi=0.8)
    for x, y in wheels:
        part(c, F.sd_circle(c.X, c.Y, x, y, 11), TIRE, ow=2.2, bevel=4, gloss=0.15)
        part(c, F.sd_circle(c.X, c.Y, x, y, 5.2), STEEL, ow=1.4, bevel=2.5, gloss=0.2, spec=0.3)
        c.fill(F.sd_circle(c.X, c.Y, x, y, 1.6), hexc('#5A6478'))
    EA.twinkle(c, 86, 22, 5.0, edge='#7E1A16', tip='#FF9A8A')
    return c.image()


def icon_hydrant():
    """Fire hydrant: chunky red hydrant with a domed cap, side outlets with chained caps and a snow cap."""
    c = canvas(0.95)
    cx = 48
    body = F.sd_box(c.X, c.Y, cx, 58, 17, 22, 6)
    dome = F.sd_ellipse(c.X, c.Y, cx, 36, 18, 12)
    nub = F.sd_box(c.X, c.Y, cx, 22, 5, 5, 2)
    collar = F.sd_box(c.X, c.Y, cx, 40, 21, 4, 2.5)
    base = F.sd_box(c.X, c.Y, cx, 82, 23, 5, 2.5)
    outs = [F.sd_box(c.X, c.Y, cx + s * 22, 56, 7, 7, 2.5) for s in (-1, 1)]
    snow = F.smin(F.sd_ellipse(c.X, c.Y, cx - 2, 26, 12, 5.5), F.sd_circle(c.X, c.Y, cx + 7, 27, 4), 2)
    allsh = U(body, dome, nub, collar, base, *outs)
    shadow(c, allsh)
    for o in outs:
        part(c, o, ('#FFE98C', '#E0A020', '#7A4A0E'), ow=2.2, bevel=2.5, gloss=0.2, tint='gold')
    part(c, F.smin(body, dome, 3), RED, ow=3.0, bevel=7, gloss=0.3, tint='red', spec=0.2)
    part(c, nub, ('#FFE98C', '#E0A020', '#7A4A0E'), ow=2.2, bevel=2, gloss=0.2)
    part(c, collar, ('#FF9A8A', '#C9362C', '#5E1410'), ow=2.2, bevel=2, gloss=0.2)
    part(c, base, ('#FF9A8A', '#B8352A', '#5E1410'), ow=2.4, bevel=2.5, gloss=0.1)
    for s in (-1, 1):
        part(c, F.sd_circle(c.X, c.Y, cx + s * 22, 56, 3.2), ('#FFF4C0', '#F5B83A', '#8E520A'), ow=1.0, bevel=1.5, gloss=0)
    for k in range(4):
        c.fill(F.sd_circle(c.X, c.Y, cx - 6 + k * 4, 64 + 2.2 * math.sin(k * 1.6), 1.2), hexc('#8E96A3'), 0.9)
    part(c, snow, ('#FFFFFF', '#DCE6F2', '#7E93B5'), ow=1.6, bevel=2.5, gloss=0.25, tint='#7E9CCC')
    glossy(c, 38, 46, 3.5, 7, -10, 0.45)
    return c.image()


# =========================================================================== logistics
def icon_box():
    """Parcel: a kraft cardboard box in a 3/4 view with packing tape and a little 'this side up' arrow."""
    c = canvas(0.95)
    shadow(c, box_iso(c, 46, 86, 32, 44, 40, paint=False))
    box_iso(c, 46, 86, 32, 44, 40)
    X2, Y2 = c.X, c.Y
    up = arrow_sd(X2, Y2, [(30, 70), (30, 58)], 1.6, 4.0)
    c.fill(up, hexc('#7A4A28'), 0.8)
    up2 = arrow_sd(X2, Y2, [(37, 72), (37, 60)], 1.6, 4.0)
    c.fill(up2, hexc('#7A4A28'), 0.8)
    c.fill(F.sd_polygon(c.X, c.Y, [(52, 67), (68, 59), (68, 66), (52, 74)]), hexc('#FFFDF6'), 0.9)
    return c.image()


def icon_forklift():
    """Forklift: a chubby yellow forklift (side view) lifting a pallet with a box."""
    c = canvas(0.96)
    body = F.smin(F.sd_box(c.X, c.Y, 58, 64, 20, 11, 5), F.sd_box(c.X, c.Y, 74, 56, 8, 10, 4), 3)
    cage = U(F.sd_box(c.X, c.Y, 47, 40, 1.8, 16, 0.8), F.sd_box(c.X, c.Y, 69, 40, 1.8, 16, 0.8),
             F.sd_box(c.X, c.Y, 58, 24, 14, 2.4, 1.2))
    mast = U(F.sd_box(c.X, c.Y, 34, 46, 2.6, 30, 1), F.sd_box(c.X, c.Y, 39, 46, 1.8, 30, 1))
    forks = F.sd_box(c.X, c.Y, 22, 56, 12, 1.8, 0.8)
    pallet = F.sd_box(c.X, c.Y, 21, 52, 14, 2.6, 0.8)
    wheels = [(46, 77, 9), (72, 78, 8)]
    allsh = U(body, cage, mast, forks, pallet, F.sd_box(c.X, c.Y, 21, 38, 12, 11, 2),
              *[F.sd_circle(c.X, c.Y, x, y, r) for x, y, r in wheels])
    shadow(c, allsh)
    part(c, mast, STEEL, ow=1.8, bevel=1.5, gloss=0.2, spec=0.3)
    part(c, cage, ('#5A6478', '#2E3440', '#10141C'), ow=1.4, bevel=1.2, gloss=0.2)
    part(c, F.sd_box(c.X, c.Y, 60, 46, 5, 6, 2.5), ('#7FB2F0', '#2F78D6', '#143B74'), ow=1.4, bevel=2, gloss=0.2)   # seat
    part(c, body, YELLOW, ow=3.0, bevel=6, gloss=0.35, tint='gold', spec=0.2)
    c.fill(F.intersect(F.sd_box(c.X, c.Y, 58, 70, 22, 1.6, 0.5), body + 1), hexc('#2E3440'), 0.6)
    part(c, forks, STEEL, ow=1.4, bevel=1, gloss=0.2)
    part(c, pallet, WOOD, ow=1.6, bevel=1.5, gloss=0.0, tint='wood')
    box_iso(c, 19, 50, 11, 18, 10)
    for x, y, r in wheels:
        part(c, F.sd_circle(c.X, c.Y, x, y, r), TIRE, ow=2.0, bevel=3.5, gloss=0.15)
        part(c, F.sd_circle(c.X, c.Y, x, y, r * 0.45), STEEL, ow=1.2, bevel=2, gloss=0.2, spec=0.3)
    part(c, F.sd_circle(c.X, c.Y, 75, 44, 3.0), ('#FFC0A0', '#F08A3D', '#7A3A0E'), ow=1.2, bevel=1.5, gloss=0.3, hi=0.8)
    return c.image()


def icon_settle():
    """Settlement: a receipt with a zig-zag tear and ruled lines, freshly stamped with a red round seal, and the
    little wooden stamp beside it (정산 도장 쾅!)."""
    c = canvas(0.95)
    X, Y = rot(c, 42, 50, -6)
    zig = [(16 + k * 5, 86 + (2.6 if k % 2 else -1.0)) for k in range(11)]
    rec = F.sd_polygon(X, Y, [(16, 12), (66, 12)] + zig[::-1][:0] + [(66, 86)] + zig[::-1] + [(16, 86)]) - 1.5
    handle = F.sd_box(*rot(c, 76, 30, 28), 76, 24, 6, 12, 5)
    knob = F.sd_circle(*rot(c, 76, 30, 28), 76, 11, 7)
    foot = F.sd_box(*rot(c, 76, 30, 28), 76, 40, 11, 5, 2)
    allsh = U(rec, handle, knob, foot)
    shadow(c, allsh)
    part(c, rec, ('#FFFFFF', '#F2EEE4', '#6E6A5E'), ow=2.4, bevel=2, gloss=0.0, hi=0.3, lo=0.25)
    for k in range(5):
        c.fill(F.sd_box(X, Y, 36 + (6 if k == 0 else 0), 24 + k * 8, 14 - (6 if k == 0 else 0), 1.1, 0.5), hexc('#9A968A'),
               0.85)
        c.fill(F.sd_box(X, Y, 58, 24 + k * 8, 4, 1.1, 0.5), hexc('#9A968A'), 0.85)
    c.fill(F.sd_box(X, Y, 41, 63, 21, 0.6, 0.3), hexc('#6E6A5E'), 0.7)
    seal = np.abs(F.sd_circle(X, Y, 40, 70, 12)) - 1.8
    tick = F.sd_polyline(X, Y, [(34, 70), (38.5, 74.5), (47, 65)], 2.0)
    ink = U(seal, tick)
    c.fill(ink, hexc('#E3302A'), 0.85)
    part(c, foot, ('#FF8E7E', '#C9362C', '#5E1410'), ow=2.0, bevel=2, gloss=0.2)
    part(c, handle, WOOD, ow=2.2, bevel=3, gloss=0.3, tint='wood')
    part(c, knob, WOOD_D, ow=2.2, bevel=3, gloss=0.3, tint='wood')
    return c.image()


def icon_stock():
    """Stock: a wooden storage rack with goods on its shelves (crates, a sack, cans) - warehouse stock levels."""
    c = canvas(0.95)
    posts = U(F.sd_box(c.X, c.Y, 14, 50, 3, 38, 1.2), F.sd_box(c.X, c.Y, 82, 50, 3, 38, 1.2))
    shelves = U(*[F.sd_box(c.X, c.Y, 48, y, 36, 2.6, 1.2) for y in (36, 62, 86)])
    shadow(c, U(posts, shelves))
    part(c, posts, WOOD_D, ow=2.2, bevel=1.5, gloss=0.1, tint='wood')
    # top shelf: two crates + a jar
    for x, w, col in ((28, 9, WOOD), (48, 9, ('#9FD0FF', '#3D8BE0', '#163E78'))):
        d = F.sd_box(c.X, c.Y, x, 25, w, 8.5, 1.8)
        part(c, d, col, ow=1.8, bevel=2.5, gloss=0.2)
        stroke(c, F.sd_box(c.X, c.Y, x, 25, w - 3, 5.5, 0.8), 1.0, col[2], 0.5)
    part(c, F.sd_box(c.X, c.Y, 69, 24, 7, 9.5, 3), ('#FFE0B0', '#F2A64A', '#7A3A0E'), ow=1.8, bevel=2.5, gloss=0.35)
    part(c, F.sd_box(c.X, c.Y, 69, 14.5, 5.5, 2, 1), RED, ow=1.4, bevel=1, gloss=0.2)
    # middle shelf: sack + cans
    sack = F.smin(F.sd_ellipse(c.X, c.Y, 30, 52, 12, 9), F.sd_box(c.X, c.Y, 30, 43, 4, 3, 1.5), 3)
    part(c, sack, BURLAP, ow=1.8, bevel=3, gloss=0.2, tint='wood')
    for k, x in enumerate((52, 62, 72)):
        d = F.sd_box(c.X, c.Y, x, 51, 4.6, 8, 1.6)
        part(c, d, (SILVER, RED, GREEN)[k], ow=1.6, bevel=1.8, gloss=0.3)
        c.fill(F.sd_box(c.X, c.Y, x, 51, 4.6, 3, 0.5), hexc('#FFFDF6'), 0.85)
    # bottom shelf: big crate + pallet of logs
    part(c, F.sd_box(c.X, c.Y, 33, 76, 15, 8.5, 2), WOOD, ow=1.8, bevel=2.5, gloss=0.2, tint='wood')
    stroke(c, F.sd_box(c.X, c.Y, 33, 76, 11, 5, 0.8), 1.0, '#4E2E16', 0.5)
    for k, (x, y) in enumerate(((60, 79), (70, 79), (65, 71))):
        lg = F.sd_circle(c.X, c.Y, x, y, 5.2)
        part(c, lg, ('#E8B880', '#B07840', '#4E2E16'), ow=1.6, bevel=2, gloss=0.0)
        c.fill(np.abs(F.sd_circle(c.X, c.Y, x, y, 2.6)) - 0.5, hexc('#8A5A33'), 0.7)
    part(c, shelves, WOOD, ow=2.2, bevel=1.5, gloss=0.15, tint='wood')
    return c.image()


def stamp_bank():
    """Extra: red round bank seal (도장 자국) - stamp it on passbook rows / settlement receipts.  Ink only (no
    outline / shadow), slightly uneven like a real stamp."""
    c = F.Canvas(96, 96)
    cx, cy = 48, 48
    rng = np.random.default_rng(4)
    nz = F.blur(rng.standard_normal(c.a.shape).astype(np.float32), 2.0 * c.ss)
    nz = nz / (np.abs(nz).max() + 1e-6)
    ring = np.abs(F.sd_circle(c.X, c.Y, cx, cy, 38)) - 3.2
    ring2 = np.abs(F.sd_circle(c.X, c.Y, cx, cy, 31)) - 1.2
    st = star(c, cx, cy + 1, 17, 7.5, round_=1.5)
    ink = U(ring, ring2, st)
    cov = c.cov(ink) * np.clip(0.88 + 0.25 * nz, 0, 1)
    c.paint(cov, hexc('#E3302A'), 0.92)
    return c.image()


ICONS = [
    ('ui_icon_piggy', icon_piggy, 'Bank savings: pink piggy bank with a coin dropping in (저축).'),
    ('ui_icon_loan', icon_loan, 'Loan: burlap money sack with a coin emblem and a blue arrow curving in (대출).'),
    ('ui_icon_interest', icon_interest, 'Interest: coin stack with a sprouting seedling and a green up-arrow (이자).'),
    ('ui_icon_passbook', icon_passbook, 'Passbook: navy bank book with a gold coin emblem and a red bookmark (통장).'),
    ('ui_icon_insurance', icon_insurance, 'Fire insurance: blue shield guarding a little house, green check (보험).'),
    ('ui_icon_story', icon_story, 'Stories: open storybook with a pink heart rising out (이야기).'),
    ('ui_icon_rumor', icon_rumor, 'Rumour: a friendly ear listening to purple whisper waves (소문).'),
    ('ui_icon_question', icon_question, 'Question: speech bubble with a glossy blue "?" (질문).'),
    ('ui_icon_friend_new', icon_friend_new, 'New friend: two villager heads under a pink heart, green "+" (새 친구).'),
    ('ui_icon_memory', icon_memory, 'Memory: tilted instant photo of the snowy village with a heart sticker (기억).'),
    ('ui_icon_move_in', icon_move_in, 'Moving in: house with the door open (warm light), heart welcome mat, green '
                                      'arrow curving in + a moving box (이사 옴).'),
    ('ui_icon_move_out', icon_move_out, 'Moving out: orange moving truck loaded with boxes driving off, speed lines '
                                        '(이사 감) - a different silhouette from move_in.'),
    ('ui_icon_newspaper', icon_newspaper, 'Town paper "솔방울 신문": folded paper with a pinecone emblem (신문).'),
    ('ui_icon_badge', icon_badge, 'Police: gold shield badge, blue enamel, white star (경찰).'),
    ('ui_icon_wanted', icon_wanted, 'Wanted: pinned poster with a red band, sepia portrait and reward coin (현상수배).'),
    ('ui_icon_cuffs_cute', icon_cuffs_cute, 'Arrest: cute toy handcuffs with a pink heart charm (체포).'),
    ('ui_icon_thief', icon_thief, 'Petty thief: round face, domino mask, striped beanie, cheeky grin (좀도둑).'),
    ('ui_icon_fire_alert', icon_fire_alert, 'Fire alert: red warning triangle with a toy flame (화재 경보).'),
    ('ui_icon_firetruck', icon_firetruck, 'Fire engine: chubby red truck with ladder and beacon (소방차).'),
    ('ui_icon_hydrant', icon_hydrant, 'Fire hydrant: red hydrant with gold outlets and a snow cap (소화전).'),
    ('ui_icon_box', icon_box, 'Parcel: kraft cardboard box with tape (택배 상자).'),
    ('ui_icon_forklift', icon_forklift, 'Forklift: yellow forklift lifting a pallet with a box (지게차).'),
    ('ui_icon_settle', icon_settle, 'Settlement: receipt with a red check seal + wooden stamp (정산).'),
    ('ui_icon_stock', icon_stock, 'Stock: wooden rack with crates, sack, cans and logs (재고).'),
    ('ui_stamp_bank', stamp_bank, 'Extra: red round bank seal imprint, ink only - stamp it on passbook rows / receipts.'),
]


# =========================================================================== panels
def _paper(c, d, top='#FFF6E2', bot='#F0DCB4', edge='#C9A46A', edge_w=16, rim='#8A6A44', y0=0, y1=None):
    """Aged paper: rim line, vertical gradient, burnt edge vignette, soft bevel."""
    y1 = y1 if y1 is not None else c.h
    c.fill(d - 1.6, hexc(rim))
    t = np.clip((c.Y - y0) / max(1, y1 - y0), 0, 1)
    base = F.mix(hexc(top), hexc(bot), t)
    n = F.bevel_normals(d, 5, c.px)
    col = F.shade(base, F.lambert(n), 0.45, 0.25)
    c.paint(c.cov(d), col)
    v = np.clip(1 + d / edge_w, 0, 1) ** 2
    c.paint(c.cov(d) * v, hexc(edge), 0.45)


def _pin(c, x, y, pal=RED, r=6.5):
    head = F.sd_circle(c.X, c.Y, x, y, r)
    c.shadow(c.cov(head), dx=2.0, dy=3.0, sigma=1.6, opacity=0.35)
    part(c, head, pal, ow=1.8, bevel=r * 0.5, gloss=0.0, hi=0.6, spec=0.5)
    EA.glossy_spot(c, x - r * 0.33, y - r * 0.36, r * 0.33, r * 0.2, -35, 0.85, 0.4)


WANTED_W, WANTED_H = 224, 296
WANTED_BOXES = {'titleBox': [40, 22, 144, 36], 'portraitWindow': [48, 78, 128, 128], 'nameBox': [40, 224, 144, 26],
                'rewardIcon': [52, 262, 24, 24], 'rewardBox': [82, 256, 104, 26]}


def wanted_poster():
    """현상수배 poster (UI panel + drawn small on the civic wanted_board): aged paper with torn edges and a curled
    corner, two push-pins, a red ribbon header for the title text, a wooden portrait frame with a sepia
    sunburst behind the portrait (game draws a 128x128 resident portrait in portraitWindow), a name plate and a
    reward line with a gold coin.  All text by the game."""
    W, H = WANTED_W, WANTED_H
    c = F.Canvas(W, H)
    nz = F.fft_noise(c.a.shape[0], c.a.shape[1], 11, scale=6.0 * c.ss)
    paper = F.sd_box(c.X, c.Y, W / 2, H / 2 + 2, W / 2 - 10, H / 2 - 12, 4) + 1.3 * nz
    cut = F.sd_polygon(c.X, c.Y, [(W - 38, H), (W, H), (W, H - 38)])
    paper = F.subtract(paper, cut + 0.0)
    c.shadow(c.cov(paper), dy=4, sigma=3.0, opacity=0.3)
    _paper(c, paper, y0=14, y1=H - 10)
    # curled corner flap
    flap = F.sd_polygon(c.X, c.Y, [(W - 40, H - 10), (W - 10, H - 40), (W - 30, H - 30)]) - 1.0
    c.shadow(c.cov(flap), dx=-2, dy=-1, sigma=1.6, opacity=0.25)
    part(c, flap, ('#FFF8EA', '#E6CFA0', '#8A6A44'), ow=1.6, bevel=3, gloss=0.0, hi=0.5)
    # ribbon header
    x0, y0, w, h = WANTED_BOXES['titleBox']
    rib = F.sd_box(c.X, c.Y, x0 + w / 2, y0 + h / 2, w / 2 + 6, h / 2, 3)
    tails = U(F.sd_polygon(c.X, c.Y, [(x0 - 18, y0 + 8), (x0 + 4, y0 + 8), (x0 + 4, y0 + h + 6), (x0 - 18, y0 + h + 6),
                                       (x0 - 9, y0 + h / 2 + 7)]) - 1.0,
              F.sd_polygon(c.X, c.Y, [(x0 + w + 18, y0 + 8), (x0 + w - 4, y0 + 8), (x0 + w - 4, y0 + h + 6),
                                       (x0 + w + 18, y0 + h + 6), (x0 + w + 9, y0 + h / 2 + 7)]) - 1.0)
    c.shadow(c.cov(U(rib, tails)), dy=2, sigma=1.6, opacity=0.3)
    part(c, tails, ('#E86A5A', '#A8281E', '#5E1410'), ow=2.0, bevel=3, gloss=0.0, tint='red')
    part(c, rib, ('#FF8E7E', '#D9302A', '#6E1410'), ow=2.4, bevel=5, gloss=0.35, tint='red')
    c.fill(np.abs(F.sd_box(c.X, c.Y, x0 + w / 2, y0 + h / 2, w / 2 + 1, h / 2 - 5, 1.5)) - 0.7, hexc('#FFD8C8'), 0.6)
    for sx in (x0 - 4, x0 + w + 4):
        part(c, star(c, sx, y0 + h / 2 - 1, 7, 3.2, round_=0.8), GOLD, ow=1.4, bevel=1.6, gloss=0.0, hi=0.7)
    # portrait frame + sepia sunburst
    px, py, pw, ph = WANTED_BOXES['portraitWindow']
    frame = F.sd_box(c.X, c.Y, px + pw / 2, py + ph / 2, pw / 2 + 9, ph / 2 + 9, 5)
    win = F.sd_box(c.X, c.Y, px + pw / 2, py + ph / 2, pw / 2, ph / 2, 2)
    c.shadow(c.cov(frame), dy=2.5, sigma=2.0, opacity=0.3)
    part(c, frame, WOOD_D, ow=2.4, bevel=4, gloss=0.25, tint='wood')
    ang = np.arctan2(c.Y - (py + ph * 0.42), c.X - (px + pw / 2))
    rays = (np.mod(ang * 12 / math.pi, 2.0) < 1.0).astype(np.float32)
    t = np.clip((c.Y - py) / ph, 0, 1)
    sep = F.mix(hexc('#F6E3BC'), hexc('#E3C48E'), t)
    sep = F.mix(sep, hexc('#E9CB96'), rays * 0.5)
    rr = np.hypot(c.X - (px + pw / 2), c.Y - (py + ph / 2)) / (pw * 0.72)
    sep = sep * (1 - 0.18 * np.clip(rr, 0, 1) ** 2)[..., None]
    c.paint(c.cov(win), sep)
    c.paint(c.cov(win) * np.clip(1 + win / 6, 0, 1), hexc('#5A3A1E'), 0.35)       # inner frame shadow
    # name plate
    nx, ny, nw, nh = WANTED_BOXES['nameBox']
    plate = F.sd_box(c.X, c.Y, nx + nw / 2, ny + nh / 2, nw / 2, nh / 2, 5)
    part(c, plate, ('#FFFDF6', '#F2E4C4', '#8A6A44'), ow=1.6, bevel=2.5, gloss=0.2, hi=0.4)
    # reward line with a coin
    rx, ry, rw, rh = WANTED_BOXES['rewardBox']
    c.fill(F.sd_box(c.X, c.Y, rx + rw / 2, ry + rh - 2, rw / 2, 0.9, 0.4), hexc('#9A7A4E'), 0.8)
    ix, iy, iw, ih = WANTED_BOXES['rewardIcon']
    coin_face(c, ix + iw / 2, iy + ih / 2, 12, ow=1.8)
    for (x, y) in ((24, 22), (W - 24, 22)):
        _pin(c, x, y)
    return c.image()


NEWS_MARGINS = dict(left=26, right=26, top=26, bottom=30)


def newspaper_page():
    """Newsprint page (9-slice): off-white paper, a thin inner ink frame with tiny corner diamonds, soft shadow and
    a thicker bottom lip like ui_panel.  Uniform along every stretched edge."""
    W = H = 160
    c = F.Canvas(W, H)
    body = F.sd_box(c.X, c.Y, W / 2, H / 2 + 1, W / 2 - 6, H / 2 - 7, 8)
    face = F.sd_box(c.X, c.Y, W / 2, H / 2 - 1, W / 2 - 6, H / 2 - 9, 8)
    c.shadow(c.cov(body), dy=3.5, sigma=2.8, opacity=0.3)
    c.fill(body - 1.4, hexc('#7A7060'))
    c.fill(body, hexc('#DCD2BC'))
    t = np.clip((c.Y - 8) / (H - 24), 0, 1)
    base = F.mix(hexc('#FBF8EF'), hexc('#F1EAD8'), t)
    n = F.bevel_normals(face, 4, c.px)
    c.paint(c.cov(face), F.shade(base, F.lambert(n), 0.4, 0.2))
    fr = F.sd_box(c.X, c.Y, W / 2, H / 2 - 1, W / 2 - 17, H / 2 - 20, 1.5)
    stroke(c, fr, 1.2, '#4A4A52', 0.85)
    stroke(c, fr + 3, 0.6, '#4A4A52', 0.5)
    for x, y in ((17, 19), (W - 17, 19), (17, H - 21), (W - 17, H - 21)):
        d = F.sd_polygon(c.X, c.Y, [(x, y - 4), (x + 4, y), (x, y + 4), (x - 4, y)])
        c.fill(d, hexc('#4A4A52'), 0.85)
    return c.image()


MAST_W, MAST_H = 320, 104
MAST_MARGINS = dict(left=96, right=96, top=18, bottom=26)
MAST_TITLE = [96, 12, 128, 64]          # title area (x from 96 to width - 96): fits 44-52 px game text or the logo


def newspaper_masthead():
    """'솔방울 신문' masthead strip (9-slice, stretch horizontally): pinecone medallions left and right, a thin rule
    on top and the classic thick + thin double rule underneath.  The middle (titleBox, 64 px tall) stays empty for
    the title - ui_newspaper_logo or game text."""
    W, H = MAST_W, MAST_H
    c = F.Canvas(W, H)
    my = 46
    c.fill(F.sd_box(c.X, c.Y, W / 2, 7, W / 2 - 4, 0.8, 0.4), hexc('#3A3A44'), 0.9)
    c.fill(F.sd_box(c.X, c.Y, W / 2, H - 18, W / 2 - 4, 2.4, 0.8), hexc('#3A3A44'), 0.95)
    c.fill(F.sd_box(c.X, c.Y, W / 2, H - 11, W / 2 - 4, 0.8, 0.4), hexc('#3A3A44'), 0.9)
    for cx, flip in ((44, 1), (W - 44, -1)):
        med = F.sd_circle(c.X, c.Y, cx, my, 27)
        c.shadow(c.cov(med), dy=2, sigma=1.6, opacity=0.25)
        part(c, med, ('#FFFDF6', '#EFE3C8', '#6E5E44'), ow=2.2, bevel=4, gloss=0.25, hi=0.4)
        stroke(c, F.sd_circle(c.X, c.Y, cx, my, 22), 1.0, '#9A8A6A', 0.8)
        for k in range(7):                                     # laurel ticks around the medallion
            a = math.radians(110 + k * 22) if flip > 0 else math.radians(70 - k * 22)
            lx, ly = cx + 24.5 * math.cos(a), my + 24.5 * math.sin(a)
            Xl, Yl = rot(c, lx, ly, math.degrees(a) + 90)
            c.fill(F.sd_ellipse(Xl, Yl, lx, ly, 3.2, 1.5), hexc('#5CA05A'), 0.9)
        pinecone(c, cx, my + 3, 1.3, ow=1.6)
        EA.twinkle(c, cx + flip * 39, 26, 5.0, edge='#56739F', core='#FFFFFF', tip='#BFE6FF')
    return c.image()


FONT_DIR = os.path.join(os.path.dirname(HERE), 'fonts')


def _text_mask(txt, font_file, size, ss=4, pad=8):
    """Anti-aliased text coverage (float 0..1) rendered at ss x, plus its box size in output px."""
    from PIL import ImageDraw, ImageFont
    f = ImageFont.truetype(os.path.join(FONT_DIR, font_file), size * ss)
    l, t, r, b = f.getbbox(txt)
    W, H = (r - l) + 2 * pad * ss, (b - t) + 2 * pad * ss
    im = Image.new('L', (W, H), 0)
    ImageDraw.Draw(im).text((pad * ss - l, pad * ss - t), txt, font=f, fill=255)
    return np.asarray(im).astype(np.float32) / 255.0, (W // ss, H // ss)


def newspaper_logo(en=False):
    """Optional baked logotype for the masthead (CONTRACT_V8 §AC 솔방울 신문): chunky rounded Jua letters (Fredoka
    for the English variant) in warm newsprint ink with a letterpress highlight, lumpy snow caps on the first word
    and a little pinecone hanging off the end.  The masthead strip itself stays text-free for other languages."""
    txt, ff, size = ('Pinecone News', 'Fredoka-Bold.ttf', 40) if en else ('솔방울 신문', 'Jua-Regular.ttf', 50)
    ss = 4
    m, (tw, th) = _text_mask(txt, ff, size, ss)
    W, H = tw + 34, th + 6
    c = F.Canvas(W, H, ss=ss)
    Hm, Wm = m.shape
    cov = np.zeros(c.a.shape, np.float32)
    oy = (c.a.shape[0] - Hm) // 2 + 2 * ss
    cov[max(0, oy):oy + Hm, :Wm] = m[:c.a.shape[0] - max(0, oy), :c.a.shape[1]]
    c.shadow(cov, dy=2.0, sigma=1.2, opacity=0.25)
    c.paint(np.clip(F.blur(cov, 1.6 * ss), 0, 1) * 1.6, hexc('#FFFDF6'), 0.9)          # paper halo (outline)
    t = np.clip((c.Y - 4) / (H - 8), 0, 1)
    ink = F.mix(hexc('#4A3A30'), hexc('#2A2220'), t)
    c.paint(cov, ink)
    hl = np.clip(cov - F.shift(cov, 0, 1.2 * ss), 0, 1)                # letterpress highlight on top edges
    c.paint(hl, hexc('#9A8670'), 0.8)
    # snow caps on the first word: lumps along the top edge of the letters
    first = len(txt.split(' ')[0]) / len(txt)
    xs_end = Wm * (first * (0.92 if en else 0.95))
    top = np.argmax(cov > 0.5, axis=0)
    has = (cov > 0.5).any(axis=0)
    caps = np.zeros(c.a.shape, np.float32)
    rng = np.random.default_rng(3)
    for x in range(0, int(xs_end), int(3.2 * ss)):
        if not has[x]:
            continue
        y = top[x]
        r = rng.uniform(2.2, 3.4) * ss
        yy, xx = np.ogrid[:c.a.shape[0], :c.a.shape[1]]
        caps = np.maximum(caps, np.clip(1 - (np.hypot((xx - x) / 1.25, yy - y + r * 0.2) - r) / ss, 0, 1)
                          * (yy < y + r * 0.6))
    caps = np.clip(caps, 0, 1)
    c.paint(caps, hexc('#8FA6C8'), 1.0)
    c.paint(np.clip(F.shift(caps, 0, -0.9 * ss) * caps, 0, 1), hexc('#FFFFFF'), 1.0)
    # pinecone dangling from the last letter on a thread
    px_ = Wm / ss + 10
    c.fill(F.sd_segment(c.X, c.Y, px_ - 6, 10, px_, 16, 0.6), hexc('#6A4A2A'), 0.9)
    pinecone(c, px_ + 2, H * 0.6, 0.95, ow=1.4)
    return c.image()


def wanted_silhouette():
    """Unknown culprit portrait (128x128, for portraitWindow of ui_wanted_poster - '도둑을 찾아라'): a navy shadow bust
    with a beanie and a big glossy yellow '?' on the face.  Cute, not scary."""
    c = F.Canvas(128, 128)
    head = F.sd_circle(c.X, c.Y, 64, 56, 30)
    hat = F.smin(F.intersect(F.sd_ellipse(c.X, c.Y, 64, 50, 32, 30), c.Y - 46), F.sd_circle(c.X, c.Y, 64, 18, 7), 3)
    brim = F.sd_box(c.X, c.Y, 64, 46, 33, 5, 4)
    body = F.sd_ellipse(c.X, c.Y, 64, 132, 52, 42)
    allb = U(head, hat, brim, body)
    c.shadow(c.cov(allb), dy=3, sigma=2.4, opacity=0.25)
    sil = ('#6A7894', '#3A4560', '#1C2234')
    part(c, body, sil, ow=2.4, bevel=8, gloss=0.15, hi=0.35)
    part(c, head, sil, ow=2.4, bevel=8, gloss=0.2, hi=0.35)
    part(c, hat, ('#5A6684', '#323C56', '#1C2234'), ow=2.4, bevel=5, gloss=0.2, hi=0.35)
    part(c, brim, ('#7A88A6', '#4A5674', '#1C2234'), ow=2.0, bevel=3, gloss=0.1)
    q = FXC.qmark_sd(c.X, c.Y, 64, 76, 1.25)
    toy(c, q, '#FFF4AE', '#F5A623', '#8E520A', ow=2.6, bevel=4.0, gloss=0.0, shadow=0, hi=0.6, lo=0.4)
    return c.image()


COL_MARGINS = dict(left=16, right=16, top=54, bottom=16)
COL_BAR = 36                            # headline bar height (fits the game's 24-30 px headlines)


def newspaper_column():
    """Article box (9-slice): thin ink frame, a 36 px grey headline bar on top with a rule under it.  Headline text
    goes in the bar (headlineBox), body text below (contentInset)."""
    W, H = 112, 140
    c = F.Canvas(W, H)
    box = F.sd_box(c.X, c.Y, W / 2, H / 2, W / 2 - 4, H / 2 - 4, 3)
    c.fill(box, hexc('#FBF8EF'), 0.6)
    stroke(c, box, 1.2, '#4A4A52', 0.9)
    bar = F.sd_box(c.X, c.Y, W / 2, 9 + COL_BAR / 2, W / 2 - 9, COL_BAR / 2, 2)
    c.fill(bar, hexc('#E3DDCF'))
    c.fill(F.sd_box(c.X, c.Y, W / 2, 9 + COL_BAR + 3.5, W / 2 - 9, 0.9, 0.4), hexc('#4A4A52'), 0.9)
    return c.image()


PHOTO_MARGINS = dict(left=14, right=14, top=14, bottom=14)


def newspaper_photo():
    """Photo slot (9-slice): dark ink frame with a white mat and a cool grey-blue inner field where the game draws
    a snapshot / portrait (clip it to the inner rect = contentInset)."""
    W, H = 96, 80
    c = F.Canvas(W, H)
    outer = F.sd_box(c.X, c.Y, W / 2, H / 2, W / 2 - 3, H / 2 - 3, 2)
    c.fill(outer - 1.2, hexc('#3A3A44'))
    c.fill(outer, hexc('#FFFFFF'))
    inner = F.sd_box(c.X, c.Y, W / 2, H / 2, W / 2 - 10, H / 2 - 10, 1)
    t = np.clip((c.Y - 10) / (H - 20), 0, 1)
    c.paint(c.cov(inner), F.mix(hexc('#C9D7E6'), hexc('#AFC0D4'), t))
    stroke(c, inner, 0.8, '#6E7A8E', 0.8)
    return c.image()


DIV_MARGINS = dict(left=24, right=24, top=6, bottom=6)


def newspaper_divider():
    """Column / section rule (9-slice, stretch horizontally): a hairline double rule with diamond end ornaments."""
    W, H = 128, 16
    c = F.Canvas(W, H)
    c.fill(F.sd_box(c.X, c.Y, W / 2, 7, W / 2 - 14, 0.9, 0.4), hexc('#4A4A52'), 0.9)
    c.fill(F.sd_box(c.X, c.Y, W / 2, 10, W / 2 - 14, 0.45, 0.2), hexc('#4A4A52'), 0.6)
    for x in (9, W - 9):
        c.fill(F.sd_polygon(c.X, c.Y, [(x, 3.5), (x + 5, 8.5), (x, 13.5), (x - 5, 8.5)]), hexc('#4A4A52'), 0.9)
    return c.image()


PASS_W, PASS_H = 200, 200
PASS_MARGINS = dict(left=48, right=32, top=74, bottom=30)
PASS_HEADER_Y = 66


def passbook():
    """Bank passbook (통장) panel (9-slice): navy cloth cover with a stitched spine on the left, a cream page with a
    title zone (bank / owner name, drawn by the game) above a blue double header rule (column titles sit just
    above it), a gold coin emblem in the top-left corner and a red ribbon bookmark at the top right.
    Rows: draw ui_passbook_row per transaction; stamp entries with ui_stamp_bank."""
    W, H = PASS_W, PASS_H
    c = F.Canvas(W, H)
    cover = F.sd_box(c.X, c.Y, W / 2, H / 2 + 1, W / 2 - 6, H / 2 - 7, 12)
    page = F.sd_box(c.X, c.Y, W / 2 + 10, H / 2, W / 2 - 22, H / 2 - 16, 6)
    c.shadow(c.cov(cover), dy=4, sigma=3, opacity=0.32)
    part(c, cover, ('#5C8AD8', '#24489A', '#0E2050'), ow=2.6, bevel=7, gloss=0.3, hi=0.45, tint='#1E3A8A')
    # stitched spine (solid seam lines: uniform along y so the 9-slice stretch stays clean)
    for x in (24, 29):
        c.fill(F.sd_box(c.X, c.Y, x, H / 2, 0.8, H / 2 - 20, 0.4), hexc('#AFC8F2'), 0.75)
    c.shadow(c.cov(page), dx=-1.5, dy=1.5, sigma=1.4, opacity=0.35)
    t = np.clip((c.Y - 16) / (H - 32), 0, 1)
    c.fill(page - 1.2, hexc('#8A7A5A'))
    n = F.bevel_normals(page, 3, c.px)
    c.paint(c.cov(page), F.shade(F.mix(hexc('#FFFDF6'), hexc('#F3ECDC'), t), F.lambert(n), 0.4, 0.2))
    c.fill(F.sd_box(c.X, c.Y, W / 2 + 10, 36, W / 2 - 30, 0.6, 0.3), hexc('#AFC8F2'), 0.9)
    c.fill(F.sd_box(c.X, c.Y, W / 2 + 10, PASS_HEADER_Y, W / 2 - 30, 1.0, 0.4), hexc('#5C8AD8'), 0.9)
    c.fill(F.sd_box(c.X, c.Y, W / 2 + 10, PASS_HEADER_Y + 3.5, W / 2 - 30, 0.5, 0.2), hexc('#5C8AD8'), 0.6)
    coin_face(c, 22, 22, 12, ow=1.8)
    rib = F.sd_polygon(c.X, c.Y, [(W - 30, 4), (W - 18, 4), (W - 18, 40), (W - 24, 34), (W - 30, 40)]) - 0.8
    c.shadow(c.cov(rib), dy=1.5, sigma=1.0, opacity=0.3)
    part(c, rib, RED, ow=1.6, bevel=2, gloss=0.2)
    return c.image()


ROW_MARGINS = dict(left=10, right=10, top=4, bottom=6)


def passbook_row():
    """One passbook line (9-slice, stretch horizontally): a faint blue lined row with a dotted-free ruled bottom
    line.  Stack them at their height (32 px)."""
    W, H = 128, 32
    c = F.Canvas(W, H)
    c.fill(F.sd_box(c.X, c.Y, W / 2, H / 2 - 1, W / 2 - 4, H / 2 - 4, 3), hexc('#EAF1FB'), 0.55)
    c.fill(F.sd_box(c.X, c.Y, W / 2, H - 3, W / 2 - 4, 0.8, 0.4), hexc('#8FAEDC'), 0.95)
    return c.image()


CARD_W, CARD_H = 176, 124
STORY_MARGINS = dict(left=40, right=26, top=36, bottom=36)


def story_card(news=False):
    """Rumour / news card (9-slice): warm paper face with a thick bottom lip (like ui_card), a coloured ribbon band
    across the top (lilac = rumour / story, sky blue = news) and either a speech-bubble tail at the bottom-left
    (rumour: someone told someone) or a push-pin + curled corner (news).  Game draws icon + text inside."""
    W, H = CARD_W, CARD_H
    c = F.Canvas(W, H)
    y0, fy1 = 8, H - 22
    body = F.sd_box(c.X, c.Y, W / 2, (y0 + fy1) / 2 + 3, W / 2 - 8, (fy1 - y0) / 2 + 3, 16)
    face = F.sd_box(c.X, c.Y, W / 2, (y0 + fy1) / 2, W / 2 - 8, (fy1 - y0) / 2, 16)
    band_col = ('#E6D6FF', '#9A72E8', '#4A2E7E') if not news else ('#CFEAFF', '#4A9AE6', '#1C4C8E')
    if not news:
        tail = F.sd_polygon(c.X, c.Y, [(22, fy1 - 4), (44, fy1 - 4), (16, H - 3)]) - 2.0
        body = F.smin(body, tail, 3)
    rim, lip, lipd = '#9A7A4E', '#E9D5B0', '#B89868'
    c.shadow(c.cov(body), dy=3.5, sigma=2.8, opacity=0.30)
    c.fill(body - 1.6, hexc(rim))
    c.fill(body, hexc(lip))
    lip_t = np.clip((c.Y - (fy1 - 4)) / 10, 0, 1)
    c.paint(c.cov(body) * c.cov(-face), F.mix(hexc(lip), hexc(lipd), lip_t * 0.6))
    t = np.clip((c.Y - y0) / (fy1 - y0), 0, 1)
    base = F.ramp([(0, hexc('#FFFFFF')), (0.35, hexc('#FFFCF4')), (1, hexc('#F8EEDB'))], t)
    n = F.bevel_normals(face, 6, c.px)
    c.paint(c.cov(face), F.shade(base, F.lambert(n), 0.55, 0.2))
    band = F.intersect(face + 2.5, c.Y - (y0 + 22))
    bt = np.clip((c.Y - y0) / 22, 0, 1)
    nb = F.bevel_normals(band, 3, c.px)
    c.paint(c.cov(band), F.shade(F.mix(hexc(band_col[0]), hexc(band_col[1]), bt), F.lambert(nb), 0.5, 0.35))
    c.fill(F.sd_box(c.X, c.Y, W / 2, y0 + 23, W / 2 - 10, 0.8, 0.4), hexc(band_col[2]), 0.6)
    gl = F.sd_box(c.X, c.Y, W / 2, y0 + 6, W / 2 - 26, 2.4, 2.4)
    c.paint(c.cov(gl, 0.8), WHITE, 0.45)
    if news:
        flap = F.sd_polygon(c.X, c.Y, [(W - 30, fy1), (W - 8, fy1 - 22), (W - 8, fy1)]) - 0.5
        c.fill(F.intersect(flap, face + 1), hexc('#E2CFA8'))
        c.fill(np.abs(F.sd_segment(c.X, c.Y, W - 30, fy1, W - 8, fy1 - 22, 0)) - 0.6, hexc(rim), 0.6)
        _pin(c, 20, y0 + 10, ('#9FD0FF', '#2F78D6', '#143B74'), r=6)
    else:
        EA.twinkle(c, W - 20, y0 + 11, 5.5, edge='#5A30B0', core='#FFFFFF', tip='#E6D6FF')
    return c.image()


# key, fn, 9-slice margins (None = fixed image), extra manifest fields, notes
PANELS = [
    ('ui_wanted_poster', wanted_poster, None, dict(WANTED_BOXES),
     '현상수배 poster (fixed 224x296 image, NOT 9-slice): ribbon title band (titleBox), wooden portrait frame '
     '(portraitWindow 128x128 - draw the resident portrait there), name plate (nameBox), reward line '
     '(rewardIcon coin + rewardBox).  Also usable small (x0.3) on the civic wanted_board posterPoints.'),
    ('ui_newspaper', newspaper_page, NEWS_MARGINS, dict(contentInset=[24, 24, 24, 28], minSize=[64, 64]),
     '솔방울 신문 page (9-slice newsprint): stretch to the panel size, then lay out ui_newspaper_masthead at the '
     'top and ui_newspaper_column / _photo / _divider pieces inside contentInset.'),
    ('ui_newspaper_masthead', newspaper_masthead, MAST_MARGINS, dict(titleBox=list(MAST_TITLE), minSize=[200, 104]),
     'Masthead strip (9-slice, stretch horizontally only, keep 104 px tall): pinecone medallions left / right, rules '
     'top and bottom.  Put ui_newspaper_logo (Korean) / ui_newspaper_logo_en centred in titleBox (64 px tall, x '
     'from 96 to width-96 of the stretched strip), or draw the title as text (44-52 px) for other languages.'),
    ('ui_newspaper_logo', lambda: newspaper_logo(False), None, dict(fitsIn='ui_newspaper_masthead.titleBox'),
     'Optional baked logotype "솔방울 신문" (Jua, OFL): chunky newsprint-ink letters, snow caps on 솔방울, a '
     'pinecone dangling at the end.  Plain image; centre it in ui_newspaper_masthead.titleBox (scale <= 1).'),
    ('ui_newspaper_logo_en', lambda: newspaper_logo(True), None, dict(fitsIn='ui_newspaper_masthead.titleBox'),
     'Optional baked logotype "Pinecone News" (Fredoka, OFL) for the English UI, same style.'),
    ('ui_newspaper_column', newspaper_column, COL_MARGINS, dict(contentInset=[12, 56, 12, 10],
                                                              headlineBox=[10, 9, -10, COL_BAR], minSize=[40, 74]),
     'Article box (9-slice): headline in the 36 px grey bar (headlineBox: x, y, width relative to the right edge, h; '
     'fits 24-30 px headline text), body text in contentInset.'),
    ('ui_newspaper_photo', newspaper_photo, PHOTO_MARGINS, dict(contentInset=[10, 10, 10, 10], minSize=[32, 32]),
     'Photo slot (9-slice): draw a snapshot / portrait clipped to the inner rect (contentInset).'),
    ('ui_newspaper_divider', newspaper_divider, DIV_MARGINS, dict(minSize=[52, 16]),
     'Section rule (9-slice, stretch horizontally only, 16 px tall).'),
    ('ui_passbook', passbook, PASS_MARGINS, dict(contentInset=[42, 74, 22, 26], headerY=PASS_HEADER_Y,
                                                 titleBox=[44, 12, 120, 22], minSize=[90, 110]),
     '통장 panel (9-slice): navy cover, cream page; bank / owner title in titleBox (above the thin rule), column titles '
     'just above the double rule at headerY, rows below - stack ui_passbook_row (32 px each) inside contentInset; '
     'stamp deposits with ui_stamp_bank (x0.3).'),
    ('ui_passbook_row', passbook_row, ROW_MARGINS, dict(rowHeight=32, minSize=[24, 32]),
     'One passbook line (9-slice, stretch horizontally, 32 px tall).'),
    ('ui_wanted_silhouette', wanted_silhouette, None, dict(),
     'Unknown-culprit portrait (128x128, navy shadow bust in a beanie with a big yellow "?") - draw it in '
     'ui_wanted_poster.portraitWindow for the "도둑을 찾아라" (find the thief) mission until the culprit is known.'),
    ('ui_story_card', lambda: story_card(False), STORY_MARGINS, dict(contentInset=[18, 34, 16, 28], iconPoint=[24, 20],
                                                                   minSize=[80, 80]),
     'Rumour / story card (9-slice): lilac band on top, speech tail bottom-left (in the margin).  Put ui_icon_rumor '
     '/ ui_icon_story at iconPoint (x0.4) and the text in contentInset.'),
    ('ui_story_card_news', lambda: story_card(True), STORY_MARGINS, dict(contentInset=[18, 34, 16, 28],
                                                                       iconPoint=[24, 20], minSize=[80, 80]),
     'Extra: news variant (sky-blue band, blue push-pin, curled corner).  Same size / margins as ui_story_card.'),
]


# =========================================================================== scratch CLI
def _scratch(keys):
    os.makedirs(CACHE, exist_ok=True)
    items = []
    for k, fn, _ in ICONS:
        if keys is None or k in keys:
            items.append((k, fn()))
    try:
        for k, fn, _m, _i, _n in PANELS:
            if keys is None or k in keys:
                items.append((k, fn()))
    except NameError:
        pass
    cols = 6
    cw = 200
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * 330), (255, 248, 236, 255))
    for j, (k, im) in enumerate(items):
        x, y = (j % cols) * cw, (j // cols) * 330
        if im.width <= 128:
            big = im.resize((im.width * 3 // 2, im.height * 3 // 2), Image.LANCZOS)
            sheet.alpha_composite(big, (x + 10, y + 10))
            sheet.alpha_composite(im.resize((48, 48), Image.LANCZOS), (x + 10, y + 170))
            sheet.alpha_composite(im.resize((32, 32), Image.LANCZOS), (x + 70, y + 178))
            dark = Image.new('RGBA', (60, 60), (43, 47, 58, 255))
            dark.alpha_composite(im.resize((48, 48), Image.LANCZOS), (6, 6))
            sheet.alpha_composite(dark, (x + 110, y + 166))
        else:
            s = min(1.0, (cw - 10) / im.width, 300 / im.height)
            sheet.alpha_composite(im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS), (x + 4, y + 4))
    p = os.path.join(CACHE, 'ui4_only.png')
    sheet.convert('RGB').save(p)
    print('scratch ->', p)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--all', action='store_true')
    a = ap.parse_args()
    _scratch(None if a.all or not a.only else set(a.only.split(',')))
