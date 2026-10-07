"""
gen_ui.py - procedural UI art for Frost Village (CONTRACT §6).  No text is baked.

Re-run (from anywhere):
    python3 frost-village/tools/fx/gen_ui.py            # build everything
    python3 frost-village/tools/fx/gen_ui.py --only ui_arrow,ui_pad_cash --preview-only
Outputs:
    assets/ui/ui_icons.png/.json   atlas: icons, arrow, bubble, badge, joystick, pads, rings
    assets/ui/<9-slice>.png        ui_panel, ui_button_{blue,green,gray}, ui_coin_bar,
                                   ui_bubble_body  (plain images, margins in manifest.nineSlice)
    assets/ui/ui_title_bg.png      720x1280 title backdrop
    assets/ui/manifest.json
    docs/previews/ui_sheet.png, ui_pads_scene.png, ui_title_bg.png
Deterministic: no randomness except seeded numpy generators.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # frost-village/
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))              # tools/ (pack_utils)
import fxlib as F                                       # noqa: E402
from fxlib import hexc                                  # noqa: E402
import pack_utils                                       # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'ui')
PREV = os.path.join(ROOT, 'docs', 'previews')

WHITE = hexc('#FFFFFF')
NAVY = '#1B2840'


# =========================================================================== helpers
def toy(c, d, top, bot, outline=None, ow=3.0, bevel=7.0, gloss=0.35, shadow=0.3,
        sh_dy=3.0, sh_sigma=2.2, hi=0.5, lo=0.45, spec=0.0, yr=None, tint_lo=None, gloss_h=0.45):
    """Paint one 'soft toy' part: drop shadow, outline, gradient fill lit by a rounded bevel,
    glossy highlight on the upper part."""
    if shadow:
        dd = d - (ow if outline is not None else 0)
        c.shadow(c.cov(dd), dy=sh_dy, sigma=sh_sigma, opacity=shadow)
    if outline is not None:
        c.fill(d - ow, hexc(outline) if isinstance(outline, str) else outline)
    if yr is None:
        ys = c.Y[d < 0]
        yr = (float(ys.min()), float(ys.max())) if ys.size else (0, 1)
    t = np.clip((c.Y - yr[0]) / max(yr[1] - yr[0], 1e-3), 0, 1)
    base = F.mix(hexc(top) if isinstance(top, str) else top, hexc(bot) if isinstance(bot, str) else bot, t)
    n = F.bevel_normals(d, bevel, c.px)
    s = F.lambert(n)
    col = F.shade(base, s, hi, lo, tint_lo)
    if spec:
        col = np.clip(col + spec * F.specular(n, 30)[..., None], 0, 1)
    c.paint(c.cov(d), col)
    if gloss:
        g = c.cov(d + bevel * 0.5, feather=1.0) * np.clip(1 - (c.Y - yr[0]) / ((yr[1] - yr[0]) * gloss_h), 0, 1) ** 1.6
        c.paint(g, WHITE, gloss)
    return yr


def stroke(c, d, width, color, alpha=1.0):
    c.fill(np.abs(d) - width / 2, hexc(color) if isinstance(color, str) else color, alpha)


def floor_xy(c, cx, cy):
    """Floor-plane coordinates for iso pads: screen (x,y) -> (fx, fy) with fy = 2*dy
    (2:1 projection of the ground plane; a floor circle becomes a 2:1 ellipse)."""
    return c.X - cx, (c.Y - cy) * 2.0


def floor_uv(fx, fy):
    """World-axis coordinates on the floor (u runs screen down-right, v down-left)."""
    return (fx + fy) / 2.0, (fy - fx) / 2.0


# =========================================================================== 9-slice art
def button(color):
    pal = {
        'blue': ('#7DBBF7', '#3D8BE0', '#2E74C8', '#245CA6', '#163E78'),
        'green': ('#93E59B', '#5CC86A', '#47B257', '#35924A', '#1F6331'),
        'gray': ('#D7DEE8', '#AEB8C6', '#9AA5B5', '#7F8A9B', '#4E5868'),
    }[color]
    top, mid, bot, lip, line = pal
    W, H = 128, 96
    c = F.Canvas(W, H)
    x0, x1 = 5, W - 5
    face = F.sd_box(c.X, c.Y, W / 2, 6 + 70 / 2, (x1 - x0) / 2, 70 / 2, 24)          # y 6..76
    body = F.sd_box(c.X, c.Y, W / 2, 6 + 80 / 2, (x1 - x0) / 2, 80 / 2, 24)          # y 6..86
    # soft drop shadow under the whole button
    c.shadow(c.cov(body), dy=3.5, sigma=3.0, opacity=0.32)
    # dark rim + bottom lip (gives the chunky 3D thickness)
    c.fill(body - 1.6, hexc(line))
    c.fill(body, hexc(lip))
    lip_t = np.clip((c.Y - 70) / 16, 0, 1)
    c.paint(c.cov(body) * c.cov(-face), F.mix(hexc(lip), hexc(line), lip_t * 0.35))
    # face: vertical gradient + gentle bevel
    t = np.clip((c.Y - 6) / 70, 0, 1)
    base = F.ramp([(0, hexc(top)), (0.45, hexc(mid)), (1, hexc(bot))], t)
    n = F.bevel_normals(face, 5, c.px)
    col = F.shade(base, F.lambert(n), 0.45, 0.25)
    c.paint(c.cov(face), col)
    # top gloss band (kept inside the top 9-slice margin)
    gl = F.sd_box(c.X, c.Y, W / 2, 17.5, (x1 - x0) / 2 - 12, 7.5, 7.5)
    gt = np.clip(1 - (c.Y - 10) / 15, 0, 1)
    c.paint(c.cov(gl, 0.8) * gt, WHITE, 0.42)
    # tiny specular dots in the top-left corner (polish)
    c.fill(F.sd_circle(c.X, c.Y, 16, 15, 3.0), WHITE, 0.55, feather=0.6)
    return c.image()


def panel():
    W, H = 128, 128
    c = F.Canvas(W, H)
    body = F.sd_box(c.X, c.Y, W / 2, 6 + 112 / 2, 58, 112 / 2, 26)        # y 6..118
    face = F.sd_box(c.X, c.Y, W / 2, 6 + 106 / 2, 58, 106 / 2, 26)        # y 6..112
    c.shadow(c.cov(body), dy=5, sigma=5, opacity=0.30)
    c.fill(body - 1.2, hexc('#C7AE88'))
    c.fill(body, hexc('#E4CFAB'))
    t = np.clip((c.Y - 6) / 106, 0, 1)
    base = F.ramp([(0, hexc('#FFFEFA')), (0.35, hexc('#FFF8EC')), (1, hexc('#FBEFD9'))], t)
    n = F.bevel_normals(face, 6, c.px)
    c.paint(c.cov(face), F.shade(base, F.lambert(n), 0.6, 0.18))
    # thin inner border line (stitched-looking cream frame)
    inner = F.sd_box(c.X, c.Y, W / 2, 6 + 106 / 2, 50, 106 / 2 - 8, 19)
    stroke(c, inner, 1.6, '#EBDCC1', 0.9)
    return c.image()


def coin_bar():
    W, H = 200, 64
    c = F.Canvas(W, H)
    pill = F.sd_box(c.X, c.Y, W / 2, 31, W / 2 - 5, 25, 25)
    c.shadow(c.cov(pill), dy=2.5, sigma=2.5, opacity=0.3)
    t = np.clip((c.Y - 6) / 50, 0, 1)
    c.paint(c.cov(pill), F.mix(hexc('#2C3C5C'), hexc('#1C2740'), t), 0.78)
    stroke(c, pill + 1.2, 2.4, '#FFFFFF', 0.22)
    inner_hi = F.sd_box(c.X, c.Y, W / 2, 15, W / 2 - 22, 5, 5)
    c.paint(c.cov(inner_hi, 1.5), WHITE, 0.10)
    return c.image()


def bubble_shape(c, W, body_h, tail=True):
    cx = W / 2
    body = F.sd_box(c.X, c.Y, cx, 6 + body_h / 2, W / 2 - 7, body_h / 2, 24)
    if not tail:
        return body
    tl = F.sd_polygon(c.X, c.Y, [(cx - 15, 6 + body_h - 8), (cx + 15, 6 + body_h - 8), (cx + 1.5, 6 + body_h + 20),
                                  (cx - 1.5, 6 + body_h + 20)]) - 2.5
    return F.smin(body, tl, 5)


def bubble(tail=True):
    W = 160 if tail else 96
    body_h = 98 if tail else 66
    H = 6 + body_h + (26 if tail else 8) + 2
    c = F.Canvas(W, H)
    d = bubble_shape(c, W, body_h, tail)
    c.shadow(c.cov(d), dy=3.5, sigma=3.0, opacity=0.28)
    c.fill(d - 2.2, hexc('#8FA0BA'))
    t = np.clip((c.Y - 6) / body_h, 0, 1)
    base = F.mix(hexc('#FFFFFF'), hexc('#EEF3FA'), t)
    n = F.bevel_normals(d, 7, c.px)
    c.paint(c.cov(d), F.shade(base, F.lambert(n), 0.5, 0.22, tint_lo=hexc('#B8C6DC')))
    return c.image()


def bubble_tail():
    W, H = 40, 30
    c = F.Canvas(W, H)
    cx = W / 2
    tl = F.sd_polygon(c.X, c.Y, [(cx - 15, -6), (cx + 15, -6), (cx + 1.5, 22), (cx - 1.5, 22)]) - 2.5
    c.shadow(c.cov(tl), dy=3.5, sigma=3.0, opacity=0.28)
    c.fill(tl - 2.2, hexc('#8FA0BA'))
    c.fill(tl, hexc('#EEF3FA'))
    # trim top 2px so it butts against bubble body bottom edge
    return c.image()


# =========================================================================== icons (96x96)
def icon_coin(S=96):
    c = F.Canvas(S, S)
    k = S / 96
    cx, cy = 48 * k, 47 * k
    rim = F.sd_circle(c.X, c.Y, cx, cy, 40 * k)
    # coin thickness: darker edge visible below
    edge = F.sd_circle(c.X, c.Y, cx, cy + 4 * k, 40 * k)
    both = np.minimum(rim, edge)
    c.shadow(c.cov(both - 2.5 * k), dy=3 * k, sigma=2.2 * k, opacity=0.3)
    c.fill(both - 2.5 * k, hexc('#7A4A0E'))
    c.fill(edge, hexc('#C98A1E'))
    # edge ridges (milled coin)
    ang = np.arctan2(c.Y - cy - 4 * k, c.X - cx)
    ridge = (0.5 + 0.5 * np.cos(ang * 36)) * c.cov(edge) * c.cov(-rim) * (c.Y > cy)
    c.paint(ridge, hexc('#A86E14'), 0.5)
    toy(c, rim, '#FFE58A', '#E9A92C', None, bevel=6 * k, gloss=0, shadow=0, hi=0.6, lo=0.5)
    face = F.sd_circle(c.X, c.Y, cx, cy, 30 * k)
    # recessed inner face: inverted bevel (lit from below-right)
    n = F.bevel_normals(-face - 0 * k, 3 * k, c.px)
    n[..., 0] *= -1
    n[..., 1] *= -1
    t = np.clip((c.Y - (cy - 30 * k)) / (60 * k), 0, 1)
    base = F.mix(hexc('#F7C850'), hexc('#F2B53A'), t)
    c.paint(c.cov(face), F.shade(base, F.lambert(n) * 0.8, 0.5, 0.5))
    # embossed star
    st = F.sd_star(c.X, c.Y, cx, cy + 1 * k, 21 * k, 9.5 * k, 5, round_=2.6 * k)
    c.shadow(c.cov(st), dx=1.2 * k, dy=1.6 * k, sigma=1.2 * k, color='#8A5A12', opacity=0.45)
    toy(c, st, '#FFF0B0', '#F5B83A', None, bevel=4 * k, gloss=0, shadow=0, hi=0.75, lo=0.55)
    # sparkle glint
    sp = F.sd_star(c.X, c.Y, cx - 22 * k, cy - 22 * k, 9 * k, 1.6 * k, 4, rot=0)
    c.fill(sp, WHITE, 0.95, feather=0.4 * k)
    c.fill(F.sd_circle(c.X, c.Y, cx - 22 * k, cy - 22 * k, 2.2 * k), WHITE, 1.0)
    # upper-left rim gloss
    arc = F.sd_arc(c.X, c.Y, cx, cy, 35 * k, math.radians(195), math.radians(250), 2.2 * k)
    c.fill(arc, WHITE, 0.55, feather=0.8 * k)
    return c.image()


def icon_settings():
    c = F.Canvas(96, 96)
    cx, cy = 48, 47
    d = F.sd_circle(c.X, c.Y, cx, cy, 27)
    for i in range(8):
        a = i * math.pi / 4 + math.pi / 8
        X2, Y2 = F.rot(c.X, c.Y, cx, cy, -a)
        tooth = F.sd_box(X2, Y2, cx + 32, cy, 9, 8.2, 3.5)
        d = F.smin(d, tooth, 3.0)
    d = F.subtract(d, F.sd_circle(c.X, c.Y, cx, cy, 11))
    toy(c, d, '#FFFFFF', '#C8D3E3', '#34425C', ow=3.2, bevel=6, gloss=0.25, hi=0.4, lo=0.5,
        tint_lo=hexc('#7F93B5'))
    # inner ring groove
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 19), 2.0, '#9EAECA', 0.55)
    return c.image()


def _speaker(c, ox=0):
    pts = [(14 + ox, 37), (28 + ox, 37), (46 + ox, 22), (46 + ox, 72), (28 + ox, 57), (14 + ox, 57)]
    return F.sd_polygon(c.X, c.Y, pts) - 3.5


def icon_sound(on=True):
    c = F.Canvas(96, 96)
    sp = _speaker(c, ox=2)
    if on:
        w1 = F.sd_arc(c.X, c.Y, 47, 47, 13, -0.85, 0.85, 3.8)
        w2 = F.sd_arc(c.X, c.Y, 47, 47, 26, -0.9, 0.9, 3.8)
        d = union(sp, w1, w2)
        toy(c, d, '#FFFFFF', '#C8D3E3', '#34425C', ow=3.2, bevel=5, gloss=0.25, hi=0.4, lo=0.5,
            tint_lo=hexc('#7F93B5'))
    else:
        toy(c, sp, '#FFFFFF', '#C8D3E3', '#34425C', ow=3.2, bevel=5, gloss=0.25, hi=0.4, lo=0.5,
            tint_lo=hexc('#7F93B5'))
        x = union(F.sd_segment(c.X, c.Y, 59, 37, 79, 57, 4.6), F.sd_segment(c.X, c.Y, 79, 37, 59, 57, 4.6))
        toy(c, x, '#FF8A7A', '#DE3B2F', '#7E1A16', ow=3.0, bevel=4, gloss=0.3, shadow=0.2)
    return c.image()


def union(*ds):
    return F.union(*ds)


def _note(c):
    h1 = F.sd_ellipse(*F.rot(c.X, c.Y, 31, 69, math.radians(-22)), 31, 69, 12.5, 9.5)
    h2 = F.sd_ellipse(*F.rot(c.X, c.Y, 67, 61, math.radians(-22)), 67, 61, 12.5, 9.5)
    s1 = F.sd_box(c.X, c.Y, 41.0, 47, 3.4, 22, 1.5)
    s2 = F.sd_box(c.X, c.Y, 77.0, 39, 3.4, 22, 1.5)
    beam = F.sd_polygon(c.X, c.Y, [(37.6, 22), (80.4, 13), (80.4, 25), (37.6, 34)]) - 1.0
    return union(h1, h2, s1, s2, beam)


def icon_music(on=True):
    c = F.Canvas(96, 96)
    d = _note(c)
    toy(c, d, '#FFFFFF', '#C8D3E3', '#34425C', ow=3.2, bevel=4.5, gloss=0.25, hi=0.4, lo=0.5,
        tint_lo=hexc('#7F93B5'))
    if not on:
        sl = F.sd_segment(c.X, c.Y, 18, 18, 80, 80, 4.6)
        toy(c, sl, '#FF8A7A', '#DE3B2F', '#7E1A16', ow=3.0, bevel=4, gloss=0.3, shadow=0.25)
    return c.image()


def icon_lock(S=96):
    c = F.Canvas(S, S)
    k = S / 96
    cx = 48 * k
    shackle = F.sd_arc(c.X, c.Y, cx, 40 * k, 17 * k, math.pi, 2 * math.pi, 5.5 * k)
    legs = union(F.sd_box(c.X, c.Y, cx - 17 * k, 46 * k, 5.5 * k, 8 * k, 0),
                 F.sd_box(c.X, c.Y, cx + 17 * k, 46 * k, 5.5 * k, 8 * k, 0))
    sh = np.minimum(shackle, legs)
    body = F.sd_box(c.X, c.Y, cx, 63 * k, 29 * k, 22 * k, 9 * k)
    c.shadow(c.cov(np.minimum(sh, body) - 3 * k), dy=3 * k, sigma=2.2 * k, opacity=0.32)
    toy(c, sh, '#F4F7FB', '#8E96A3', '#3E4756', ow=3 * k, bevel=4.5 * k, gloss=0.3, shadow=0, spec=0.35)
    toy(c, body, '#FFE07A', '#E39A22', '#7A4A0E', ow=3 * k, bevel=7 * k, gloss=0.35, shadow=0, hi=0.55)
    kh = union(F.sd_circle(c.X, c.Y, cx, 59 * k, 5.6 * k),
               F.sd_polygon(c.X, c.Y, [(cx - 3.2 * k, 60 * k), (cx + 3.2 * k, 60 * k), (cx + 4.5 * k, 74 * k), (cx - 4.5 * k, 74 * k)]) - 0.8 * k)
    c.fill(kh - 1.2 * k, hexc('#FFF2C0'), 0.6)
    c.fill(kh, hexc('#5A3510'))
    return c.image()


def icon_close():
    c = F.Canvas(96, 96)
    d = union(F.sd_segment(c.X, c.Y, 25, 25, 71, 71, 9.5), F.sd_segment(c.X, c.Y, 71, 25, 25, 71, 9.5))
    toy(c, d, '#FF8E7E', '#D9372C', '#7E1A16', ow=3.4, bevel=6, gloss=0.35)
    return c.image()


def icon_check():
    c = F.Canvas(96, 96)
    d = F.sd_polyline(c.X, c.Y, [(20, 50), (39, 69), (77, 27)], 9.5)
    toy(c, d, '#9BEA8E', '#3FAE4C', '#1F5E2A', ow=3.4, bevel=6, gloss=0.35)
    return c.image()


def icon_backpack():
    c = F.Canvas(96, 96)
    cx = 48
    handle = F.sd_arc(c.X, c.Y, cx, 22, 9, math.pi, 2 * math.pi, 3.6)
    body = F.sd_box(c.X, c.Y, cx, 54, 28, 32, 14)
    straps_side = union(F.sd_box(c.X, c.Y, cx - 29, 60, 5, 18, 4), F.sd_box(c.X, c.Y, cx + 29, 60, 5, 18, 4))
    allsh = union(handle, body, straps_side)
    c.shadow(c.cov(allsh - 3), dy=3, sigma=2.2, opacity=0.32)
    toy(c, handle, '#A8683A', '#6E4428', '#3C2414', ow=2.8, bevel=3, gloss=0, shadow=0)
    toy(c, straps_side, '#9A5E34', '#6E4428', '#3C2414', ow=2.8, bevel=3, gloss=0, shadow=0)
    toy(c, body, '#E3A665', '#B5733F', '#4E2E16', ow=3.0, bevel=8, gloss=0.22, shadow=0)
    # top flap
    flap = F.intersect(F.sd_box(c.X, c.Y, cx, 37, 27, 17, 13), body + 1.5)
    flap = F.subtract(flap, F.sd_box(c.X, c.Y, cx, 60, 40, 6, 0))
    toy(c, flap, '#C98F55', '#9A5E34', '#4E2E16', ow=2.4, bevel=5, gloss=0.3, shadow=0.25, sh_dy=2)
    # front pocket
    pocket = F.sd_box(c.X, c.Y, cx, 70, 17, 11, 7)
    toy(c, pocket, '#D99A5C', '#A8683A', '#4E2E16', ow=2.2, bevel=4, gloss=0.15, shadow=0.2, sh_dy=1.5)
    stroke(c, F.sd_box(c.X, c.Y, cx, 70, 12.5, 6.5, 4), 1.2, '#7A4A28', 0.55)
    # buckle strap
    strap = F.sd_box(c.X, c.Y, cx, 48, 4.2, 9, 1.5)
    toy(c, strap, '#8A5A33', '#6E4428', '#3C2414', ow=1.6, bevel=2, gloss=0, shadow=0)
    buckle = F.sd_box(c.X, c.Y, cx, 54, 6.5, 4.5, 1.5)
    toy(c, buckle, '#FFE07A', '#D99A22', '#6A400C', ow=1.6, bevel=2.5, gloss=0.3, shadow=0.2, sh_dy=1)
    return c.image()


def icon_speed():
    c = F.Canvas(96, 96)
    # fur-trimmed snow boot facing right, with speed lines
    shaft = F.sd_box(c.X, c.Y, 50, 40, 15, 22, 6)
    foot = F.sd_box(c.X, c.Y, 60, 62, 25, 12, 11)
    boot = F.smin(shaft, foot, 6)
    sole = F.intersect(F.sd_box(c.X, c.Y, 60, 66, 26.5, 11.5, 11), -F.sd_box(c.X, c.Y, 60, 60, 40, 10, 0) * -1)
    sole = F.intersect(F.sd_box(c.X, c.Y, 60, 64, 26.5, 13, 11.5), F.sd_box(c.X, c.Y, 60, 77, 40, 6, 0))
    cuff = F.sd_box(c.X, c.Y, 50, 22, 19, 8.5, 8)
    def taper(x0, x1, y, r):
        # tapered streak: thin at the left end, round at the right
        tt = np.clip((c.X - x0) / (x1 - x0), 0, 1)
        return F.sd_segment(c.X, c.Y, x0, y, x1, y, 0) - (1.5 + (r - 1.5) * tt)
    lines = union(taper(12, 25, 38, 3.4), taper(3, 25, 53, 3.8), taper(13, 27, 68, 3.4))
    allsh = union(boot, sole, cuff)
    c.shadow(c.cov(allsh - 3), dy=3, sigma=2.2, opacity=0.32)
    toy(c, lines, '#FFFFFF', '#C8D3E3', '#34425C', ow=2.6, bevel=2.5, gloss=0, shadow=0.2, sh_dy=2)
    toy(c, boot, '#4FA0EE', '#2E6FC0', '#173B6E', ow=3.0, bevel=7, gloss=0.3, shadow=0)
    toy(c, sole, '#6E4428', '#4E2E16', '#2E1A0C', ow=2.4, bevel=3, gloss=0, shadow=0)
    # laces
    for i, y in enumerate((44, 52)):
        c.fill(F.sd_segment(c.X, c.Y, 54, y, 64, y + 2, 1.6), hexc('#FFFFFF'), 0.9)
    # fluffy fur cuff (bumpy)
    fur = cuff
    for i in range(5):
        fur = F.smin(fur, F.sd_circle(c.X, c.Y, 34 + i * 8, 23 + (i % 2) * 1.5, 7.2), 3)
    toy(c, fur, '#FFFFFF', '#E6DCCB', '#6B5A44', ow=2.6, bevel=5, gloss=0.2, shadow=0.15, sh_dy=2)
    return c.image()


def icon_worker(S=96):
    c = F.Canvas(S, S)
    k = S / 96
    cx = 48 * k
    dome = F.sd_ellipse(c.X, c.Y, cx, 56 * k, 31 * k, 31 * k)
    dome = F.intersect(dome, F.sd_box(c.X, c.Y, cx, 40 * k, 40 * k, 22 * k, 0))
    dome = F.smin(dome, F.sd_box(c.X, c.Y, cx, 58 * k, 31 * k, 4 * k, 3 * k), 2 * k)
    brim = F.sd_ellipse(c.X, c.Y, cx + 2 * k, 63 * k, 42 * k, 10 * k)
    ridge = F.intersect(F.sd_box(c.X, c.Y, cx, 40 * k, 6 * k, 30 * k, 3 * k), dome + 0.5 * k)
    lamp = F.sd_box(c.X, c.Y, cx, 46 * k, 9 * k, 7 * k, 3.5 * k)
    allsh = union(dome, brim)
    c.shadow(c.cov(allsh - 3 * k), dy=3 * k, sigma=2.2 * k, opacity=0.32)
    toy(c, brim, '#FFB24A', '#D9701E', '#7A3A0E', ow=3 * k, bevel=4 * k, gloss=0.1, shadow=0)
    toy(c, dome, '#FFC75A', '#EE8424', '#7A3A0E', ow=3 * k, bevel=9 * k, gloss=0.4, shadow=0, spec=0.25)
    toy(c, ridge, '#FFD27A', '#F09A34', None, bevel=3 * k, gloss=0.2, shadow=0.18, sh_dy=1.2 * k)
    toy(c, lamp, '#DDE4EE', '#8E96A3', '#3E4756', ow=2 * k, bevel=3 * k, gloss=0, shadow=0.2, sh_dy=1.5 * k)
    c.fill(F.sd_circle(c.X, c.Y, cx, 46 * k, 4.2 * k), hexc('#FFE9A0'))
    c.fill(F.sd_circle(c.X, c.Y, cx - 1.2 * k, 44.8 * k, 1.6 * k), WHITE)
    return c.image()


# =========================================================================== bigger UI bits
def arrow():
    W, H = 120, 156
    c = F.Canvas(W, H)
    cx = W / 2
    shaft = F.sd_box(c.X, c.Y, cx, 46, 21, 40, 10)
    head = F.sd_polygon(c.X, c.Y, [(cx - 50, 78), (cx + 50, 78), (cx, 140)]) - 6
    d = F.smin(shaft, head, 6)
    c.shadow(c.cov(d - 4), dx=2, dy=5, sigma=3.0, opacity=0.33)
    c.fill(d - 4.2, hexc('#7A3608'))
    c.fill(d - 1.6, hexc('#FFF6D6'))
    t = np.clip((c.Y - 8) / 136, 0, 1)
    base = F.ramp([(0, hexc('#FFE98C')), (0.45, hexc('#FFC83D')), (1, hexc('#FF8A1E'))], t)
    n = F.bevel_normals(d, 13, c.px)
    col = F.shade(base, F.lambert(n), 0.6, 0.5, tint_lo=hexc('#D06010'))
    col = np.clip(col + 0.45 * F.specular(n, 25)[..., None], 0, 1)
    c.paint(c.cov(d), col)
    # glossy streak on the left of the shaft + head
    gl = union(F.sd_box(c.X, c.Y, cx - 9, 42, 5, 28, 5),
               F.sd_segment(c.X, c.Y, cx - 34, 88, cx - 12, 116, 4))
    c.paint(c.cov(gl, 1.2), WHITE, 0.55)
    return c.image()


def badge_max():
    W, H = 128, 60
    c = F.Canvas(W, H)
    d = F.sd_box(c.X, c.Y, W / 2, 28, 56, 22, 22)
    c.shadow(c.cov(d - 3), dy=3, sigma=2.5, opacity=0.32)
    c.fill(d - 3.6, hexc('#7A1E12'))
    c.fill(d - 1.2, hexc('#FFD45A'))
    inner = d + 1.5
    t = np.clip((c.Y - 8) / 40, 0, 1)
    base = F.mix(hexc('#FF7A5A'), hexc('#D8322A'), t)
    n = F.bevel_normals(inner, 7, c.px)
    c.paint(c.cov(inner), F.shade(base, F.lambert(n), 0.55, 0.5))
    gl = F.sd_box(c.X, c.Y, W / 2, 16, 44, 5.5, 5.5)
    c.paint(c.cov(gl, 1.0) * np.clip(1 - (c.Y - 10) / 12, 0, 1), WHITE, 0.45)
    # two tiny stars on the ends (decoration, no text)
    for sx in (W / 2 - 41, W / 2 + 41):
        st = F.sd_star(c.X, c.Y, sx, 28, 7.5, 3.3, 5, round_=0.8)
        toy(c, st, '#FFF3B0', '#FFC83D', '#8A4A0E', ow=1.4, bevel=2, gloss=0, shadow=0.2, sh_dy=1)
    return c.image()


def joystick_base():
    S = 220
    c = F.Canvas(S, S)
    cx = cy = S / 2
    d = F.sd_circle(c.X, c.Y, cx, cy, 100)
    c.shadow(c.cov(d), dy=4, sigma=5, opacity=0.18)
    r = np.hypot(c.X - cx, c.Y - cy) / 100
    c.paint(c.cov(d), F.mix(hexc('#2A3A5C'), hexc('#1A2440'), np.clip(r, 0, 1)), 0.30)
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 96), 7, '#FFFFFF', 0.55)
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 100.5), 2, '#1B2840', 0.35)
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 64), 2, '#FFFFFF', 0.18)
    for i in range(4):
        a = i * math.pi / 2
        X2, Y2 = F.rot(c.X, c.Y, cx, cy, -a)
        chev = F.sd_polyline(X2, Y2, [(cx + 72, cy - 10), (cx + 82, cy), (cx + 72, cy + 10)], 3.2)
        c.fill(chev, WHITE, 0.6)
    return c.image()


def joystick_knob():
    S = 104
    c = F.Canvas(S, S)
    cx, cy = S / 2, S / 2 - 2
    d = F.sd_circle(c.X, c.Y, cx, cy, 44)
    c.shadow(c.cov(d), dy=4, sigma=3.5, opacity=0.35)
    c.fill(d - 2.5, hexc('#2E4E7E'))
    t = np.clip((c.Y - (cy - 44)) / 88, 0, 1)
    base = F.mix(hexc('#FFFFFF'), hexc('#BFD4EE'), t)
    n = F.bevel_normals(d, 30, c.px)
    col = F.shade(base, F.lambert(n), 0.6, 0.55, tint_lo=hexc('#6F8FC0'))
    col = np.clip(col + 0.5 * F.specular(n, 30)[..., None], 0, 1)
    c.paint(c.cov(d), col)
    # subtle grip ring
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 26), 2.2, '#9DB5D6', 0.55)
    return c.image()


def ring(fill=False):
    S = 128
    c = F.Canvas(S, S)
    cx = cy = S / 2
    d = np.abs(F.sd_circle(c.X, c.Y, cx, cy, 52)) - 9
    if not fill:
        c.shadow(c.cov(d), dy=2, sigma=2.5, opacity=0.25)
        c.fill(d - 1.5, hexc('#FFFFFF'), 0.55)
        r = np.hypot(c.X - cx, c.Y - cy)
        inner_sh = np.clip((r - 43) / 18, 0, 1)
        c.paint(c.cov(d), F.mix(hexc('#0E1830'), hexc('#2A3A5C'), inner_sh), 0.55)
    else:
        n = F.bevel_normals(d, 9, c.px)
        s = F.lambert(n)
        col = F.shade(np.full(d.shape + (3,), 0.97, np.float32), s, 0.6, 0.35)
        c.paint(c.cov(d), col)
    return c.image()


# =========================================================================== iso floor pads
PAD_W, PAD_H = 192, 96
PAD_S = 44.0      # half-size of the square in floor-uv units (diamond 2*2S wide)


def pad_base(c, fill_col, fill_a, dashed=False, border='#FFFFFF'):
    cx, cy = PAD_W / 2, PAD_H / 2
    fx, fy = floor_xy(c, cx, cy)
    u, v = floor_uv(fx, fy)
    sq = F.sd_box(u, v, 0, 0, PAD_S, PAD_S, 13) * 1.1           # ~screen-px scale
    # translucent fill with a soft inner vignette
    inner = F.sd_box(u, v, 0, 0, PAD_S - 3, PAD_S - 3, 11) * 1.1
    vig = np.clip(-inner / 26, 0, 1)
    fc = hexc(fill_col)
    c.paint(c.cov(inner, 0.6), F.mix(fc * 0.75, fc, vig), fill_a * (1.25 - 0.35 * vig))
    # border band
    bd_out = sq
    bd_in = F.sd_box(u, v, 0, 0, PAD_S - 6.5, PAD_S - 6.5, 8) * 1.1
    band = F.subtract(bd_out, bd_in)
    if dashed:
        # dashes: corners as solid L-brackets, 2 dashes per straight side
        Ld = PAD_S - 6.5 / 2
        mask = np.zeros_like(u)
        t_side = np.where(np.abs(u) > np.abs(v), v, u)   # coordinate along the nearest side
        seg = np.abs(t_side)
        # corners: |t| > 26 solid ; straight parts: dash pattern on |t| in [0,26]
        dash = ((seg > 25.5) | ((seg > 3.5) & (seg < 16.0))).astype(np.float32)
        band_cov = c.cov(band) * F.smoothstep(0.0, 1.0, dash * 2 - 0.5 + 0 * Ld)
        # soften dash ends with a small blur in screen space
        band_cov = np.clip(F.blur(band_cov, 0.35 * c.ss), 0, 1)
    else:
        band_cov = c.cov(band)
    # dark under-stroke so the white border reads on white snow
    c.shadow(band_cov, dy=1.6, sigma=1.4, color='#16223A', opacity=0.55)
    c.paint(band_cov, hexc(border), 0.96)
    return fx, fy, u, v


def pad_symbol(c, d, col='#FFFFFF', alpha=0.95):
    """Symbol painted/engraved on the pad: white with a darker cut edge on the sun side."""
    cv = c.cov(d)
    c.shadow(cv, dy=1.4, sigma=1.0, color='#16223A', opacity=0.45)
    c.paint(cv, hexc(col), alpha)
    # engraved look: inner shadow on the upper-left inside edge
    inner = np.clip(F.shift(cv, -1.2 * c.ss, -1.0 * c.ss), 0, 1)
    edge = np.clip(cv - inner, 0, 1)
    c.paint(F.blur(edge, 0.5 * c.ss), hexc('#9DB0CC'), 0.55)


def pad(kind):
    c = F.Canvas(PAD_W, PAD_H)
    if kind == 'unlock':
        pad_base(c, '#1A2A48', 0.22, dashed=True)
        return c.image()
    cols = {'input': '#3D8BE0', 'output': '#4DBA62', 'cash': '#F2B53A', 'hire': '#F08A3D', 'upgrade': '#8E6BE0'}
    pad_base(c, cols[kind], 0.42)
    # symbols use a milder foreshortening (1.55 instead of the true 2.0) so they stay legible
    fx, fy = c.X - PAD_W / 2, (c.Y - PAD_H / 2) * 1.55
    if kind in ('input', 'output'):
        # tray (U shape) + arrow along screen-vertical; arrow points into (input) or out of (output) the tray
        tray = F.sd_polyline(fx, fy, [(-28, 8), (-28, 30), (28, 30), (28, 8)], 4.6)
        if kind == 'input':
            shaft = F.sd_box(fx, fy, 0, -24, 6.0, 13, 2)
            head = F.sd_polygon(fx, fy, [(-17, -12), (17, -12), (0, 14)]) - 2.5
        else:
            shaft = F.sd_box(fx, fy, 0, 0, 6.0, 13, 2)
            head = F.sd_polygon(fx, fy, [(-17, -12), (17, -12), (0, -36)]) - 2.5
        d = union(tray, shaft, head)
    elif kind == 'cash':
        ring_ = np.abs(F.sd_circle(fx, fy, 0, 0, 28)) - 4.5
        st = F.sd_star(fx, fy, 0, 1, 17, 7.5, 5, round_=2.0)
        d = union(ring_, st)
    elif kind == 'hire':
        # worker silhouette (head + shoulders) wearing a hard hat, plus a small "+"
        head = F.sd_circle(fx, fy, -6, 2, 12)
        body = F.intersect(F.sd_ellipse(fx, fy, -6, 38, 24, 22), fy - 33)
        neck_gap = F.sd_ellipse(fx, fy, -6, 16, 16, 4)
        hat = F.intersect(F.sd_circle(fx, fy, -6, -4, 15), fy + 4)
        brim = F.sd_box(fx, fy, -6, -4, 19, 2.6, 2.6)
        d = union(F.subtract(union(head, body), neck_gap), hat, brim)
        d = F.subtract(d, F.sd_box(fx, fy, -6, -1.2, 22, 1.2, 0))      # gap between hat and face
        plus = union(F.sd_box(fx, fy, 30, -10, 3.6, 11, 1.5), F.sd_box(fx, fy, 30, -10, 11, 3.6, 1.5))
        d = union(d, plus)
    elif kind == 'upgrade':
        shaft = F.sd_box(fx, fy, 0, 8, 8, 15, 3)
        head = F.sd_polygon(fx, fy, [(-24, -4), (24, -4), (0, -32)]) - 3
        bar = F.sd_box(fx, fy, 0, 31, 22, 3.6, 3)
        d = union(shaft, head, bar)
    pad_symbol(c, d)
    return c.image()


# =========================================================================== title backdrop
def pine_tree(R, x, by, h, w, tiers, body, body_dark, snow, snow_shade, shadow_a=0.35, k_round=2.0, lit_side=None):
    """Stylised layered pine (bottom tier first, each upper tier drapes over the next).
    R = canvas/region to paint into.  Snow caps only on the upper part of each tier."""
    X, Y = R.X, R.Y
    shapes = []
    for k in range(tiers):
        ty = by - h + k * h * (0.82 / tiers)
        yb = ty + h * (0.30 + 0.06 * k / max(1, tiers - 1))
        tw = w * (0.40 + 0.60 * (k + 1) / tiers)
        tri = F.sd_polygon(X, Y, [(x, ty), (x + tw, yb - tw * 0.10), (x - tw, yb - tw * 0.10)]) - k_round
        # scalloped bottom edge
        for j in (-0.62, 0.0, 0.62):
            tri = F.smin(tri, F.sd_circle(X, Y, x + j * tw, yb - tw * 0.20, tw * 0.30), tw * 0.08)
        tri = np.maximum(tri, F.sd_polygon(X, Y, [(x, ty - 4), (x + tw * 1.15, yb + 4), (x - tw * 1.15, yb + 4)]))
        shapes.append((ty, yb, tw, tri))
    trunk = F.sd_box(X, Y, x, by + h * 0.03, max(1.2, w * 0.085), h * 0.07, 1)
    R.fill(trunk, hexc('#5A4048'))
    for ty, yb, tw, tri in reversed(shapes):
        cv = R.cov(tri)
        if shadow_a:
            R.shadow(cv, dy=max(1.0, h * 0.012), sigma=max(0.8, h * 0.01), color='#101C30', opacity=shadow_a)
        t = np.clip((Y - ty) / (yb - ty), 0, 1)
        col = F.mix(hexc(body), hexc(body_dark), t ** 1.3)
        side = np.clip((X - x) / tw, -1, 1)
        col = F.mix(col, hexc(body_dark), np.clip(side, 0, 1) * 0.55)
        R.paint(cv, col)
        # snow cap: upper ~45% of the tier, drippy lower edge
        cap_y = ty + (yb - ty) * 0.42 + (yb - ty) * 0.10 * np.sin((X - x) / tw * 7.0 + tw)
        cap = np.maximum(tri + 1.0, Y - cap_y)
        lit = np.clip(0.5 - (X - x) / (2 * tw), 0, 1)
        R.paint(R.cov(cap), F.mix(hexc(snow_shade), hexc(snow), lit ** 0.7))


def title_bg():
    """720x1280 painterly snowy dawn (rendered at 2x, shapes evaluated in local regions)."""
    W, H = 720, 1280
    c = F.Canvas(W, H, ss=2)
    rng = np.random.default_rng(1207)
    # --- sky
    t = c.Y / H
    sky = F.ramp([(0.00, hexc('#33457E')), (0.14, hexc('#4F62A0')), (0.28, hexc('#8584C0')),
                  (0.38, hexc('#C99CC4')), (0.45, hexc('#F6B7AE')), (0.52, hexc('#FFD3AE')), (0.58, hexc('#FFE6C4'))], t)
    c.paint(np.ones_like(c.X), sky)
    del sky
    sx, sy = 452, 655
    r = np.hypot((c.X - sx), (c.Y - sy) * 1.35)
    c.paint(np.clip(1 - r / 600, 0, 1) ** 2.2, hexc('#FFEBCB'), 0.85)
    c.paint(np.clip((58 - r) / 14, 0, 1), hexc('#FFF8EA'), 1.0)
    del r
    for _ in range(80):
        x, y = rng.uniform(0, W), rng.uniform(0, 360)
        rr = rng.uniform(0.6, 1.5)
        a = (1 - y / 400) * rng.uniform(0.3, 0.85)
        R = c.region(x - 4, y - 4, x + 4, y + 4)
        R.fill(F.sd_circle(R.X, R.Y, x, y, rr), WHITE, a, feather=0.6)
    for _ in range(6):
        x, y = rng.uniform(40, W - 40), rng.uniform(30, 260)
        R = c.region(x - 10, y - 10, x + 10, y + 10)
        R.fill(F.sd_star(R.X, R.Y, x, y, 7.5, 1.0, 4, rot=0), WHITE, 0.75, feather=0.5)
        R.fill(F.sd_circle(R.X, R.Y, x, y, 1.6), WHITE, 0.9, feather=0.6)
    # soft clouds lit from below
    L = c.layer()
    for (cx, cy, sc, a) in [(130, 470, 1.0, 0.65), (585, 405, 1.2, 0.6), (380, 560, 0.8, 0.5),
                            (690, 585, 0.7, 0.45), (250, 315, 0.6, 0.28)]:
        R = L.region(cx - 260 * sc, cy - 110 * sc, cx + 260 * sc, cy + 60 * sc)
        d = None
        for j in range(7):
            ox = rng.uniform(-115, 115) * sc
            oy = rng.uniform(-16, 8) * sc
            rr = rng.uniform(26, 50) * sc
            e = F.sd_ellipse(R.X, R.Y, cx + ox, cy + oy, rr * 1.7, rr * 0.72)
            d = e if d is None else F.smin(d, e, 20 * sc)
        d = np.maximum(d, R.Y - (cy + 16 * sc))
        lit = np.clip((R.Y - (cy - 44 * sc)) / (62 * sc), 0, 1)
        R.paint(R.cov(d, 12 * sc), F.mix(hexc('#A99CD2'), hexc('#FFD9C9'), lit), a)
    c.over(L)
    del L

    xs = (np.arange(W * c.ss) + 0.5) / c.ss

    def mountains(peaks, base_y, lit_c, shade_c, snow_c, snow_sh, haze_c, cap=0.33, rim='#FFE6D2'):
        tops = np.stack([py + np.abs(xs - px) * sl for px, py, sl in peaks])     # (n, W)
        idx = np.argmin(tops, 0)
        crest = tops[idx, np.arange(xs.size)]
        R = c.region(0, float(crest.min()) - 2, W, base_y + 40)
        inside = R.Y - crest[None, :]
        cov = np.clip(inside * c.ss + 0.5, 0, 1)
        pk = np.array(peaks)
        ppx = pk[idx, 0][None, :]
        ppy = pk[idx, 1][None, :]
        left = (R.X < ppx).astype(np.float32)
        # soften the face split a little
        left = np.clip(0.5 + (ppx - R.X) * 0.8, 0, 1)
        col = F.mix(hexc(shade_c), hexc(lit_c), left)
        hz = np.clip((R.Y - ppy) / (base_y - ppy + 1e-3), 0, 1)
        col = F.mix(col, hexc(haze_c), hz ** 1.2)
        R.paint(cov, col)
        # jagged snow caps
        depth = R.Y - ppy
        hgt = (base_y - ppy)
        zig = np.abs(((R.X - ppx) / 13.0) % 2 - 1) * 9 + 4 * np.sin(R.X * 0.11)
        snow = np.clip((hgt * cap + zig - depth) * c.ss * 0.5, 0, 1) * cov
        R.paint(snow, F.mix(hexc(snow_sh), hexc(snow_c), left))
        # warm rim light on crests near the sun
        near = np.clip(1 - np.abs(R.X - sx) / 380, 0, 1)
        R.paint(np.clip(1 - inside / 3.5, 0, 1) * cov * near, hexc(rim), 0.85)

    mountains([(40, 470, 0.9), (190, 430, 1.0), (330, 520, 0.95), (560, 445, 0.9), (700, 500, 1.1), (450, 560, 1.2)],
              760, '#D9CBE6', '#B3A6D3', '#FFF6F4', '#DCD2EC', '#E3D7EC', cap=0.30)
    mountains([(-20, 600, 0.75), (120, 640, 0.8), (270, 585, 0.85), (420, 665, 0.8), (610, 600, 0.75), (760, 640, 0.8)],
              820, '#B9B5DE', '#9693C6', '#F7F1FA', '#C9C3E3', '#D6D2EC', cap=0.28)

    def ridge(base_y, amp, seed, freq):
        rr = np.random.default_rng(seed)
        y = np.full_like(xs, base_y, dtype=np.float64)
        for k in range(1, 5):
            y -= amp / k * (0.5 + 0.5 * np.sin(xs * freq * k / W * math.pi + rr.uniform(0, 6.3)))
        return y

    def field(yline, col_top, col_bot, depth=260):
        R = c.region(0, float(yline.min()) - 2, W, H)
        inside = R.Y - yline[None, :]
        cov = np.clip(inside * c.ss + 0.5, 0, 1)
        R.paint(cov, F.mix(hexc(col_top), hexc(col_bot), np.clip(inside / depth, 0, 1)))
        R.paint(np.clip(1 - inside / 4, 0, 1) * cov, hexc('#FFFFFF'), 0.6)

    def forest(base_y, count, hmin, hmax, body, dark, snow, snow_sh, seed, shadow_a=0.0):
        rr = np.random.default_rng(seed)
        L = c.layer()
        xs_ = rr.uniform(-30, W + 30, count)
        hs = rr.uniform(hmin, hmax, count)
        bys = base_y + rr.uniform(-10, 10, count)
        for i in np.argsort(bys):
            x, h, by = xs_[i], hs[i], bys[i]
            w = h * 0.36
            R = L.region(x - w - 6, by - h - 6, x + w + 6, by + h * 0.12)
            if R.empty:
                continue
            pine_tree(R, x, by, h, w, 3, body, dark, snow, snow_sh, shadow_a=shadow_a, k_round=1.0)
        c.over(L)

    field(ridge(835, 22, 21, 0.8), '#E6DAEE', '#EEE7F4')
    forest(848, 56, 34, 62, '#9496C8', '#8084BA', '#F1ECF8', '#D6D0EA', 31)
    field(ridge(892, 24, 22, 0.7), '#EEE7F4', '#F2EEF8')
    forest(912, 36, 60, 100, '#6E80B2', '#56669C', '#F4F1FA', '#CFCDE8', 32, shadow_a=0.15)
    field(ridge(968, 30, 23, 0.55), '#F6F2FB', '#EAF0F9', depth=320)

    # little log cabin with warm windows on the snow field
    cab_x, cab_y = 214, 990
    R = c.region(cab_x - 80, cab_y - 260, cab_x + 120, cab_y + 40)
    X, Y = R.X, R.Y
    R.fill(F.sd_ellipse(X, Y, cab_x + 6, cab_y + 20, 60, 9), hexc('#C2CDE3'), 0.6, feather=4)
    chim = F.sd_box(X, Y, cab_x + 22, cab_y - 44, 5.5, 11, 1)
    R.fill(chim, hexc('#7C6470'))
    body = F.sd_box(X, Y, cab_x, cab_y, 36, 21, 2)
    R.fill(body, hexc('#8A5F5A'))
    for ly in range(int(cab_y - 17), int(cab_y + 20), 7):
        R.fill(np.maximum(np.abs(Y - ly) - 0.6, body), hexc('#6A4548'), 0.6)
    roof = F.sd_polygon(X, Y, [(cab_x - 48, cab_y - 13), (cab_x, cab_y - 50), (cab_x + 48, cab_y - 13)]) - 2.5
    R.fill(roof, hexc('#FBF7FD'))
    R.fill(np.maximum(roof, X - cab_x), hexc('#DCD5EC'), 0.75)
    door = F.sd_box(X, Y, cab_x + 2, cab_y + 8, 6, 12, 2)
    R.fill(door, hexc('#4E3644'))
    for wx in (cab_x - 20, cab_x + 21):
        w_ = F.sd_box(X, Y, wx, cab_y + 1, 6.5, 6.5, 1.5)
        R.glow(R.cov(w_), 10, '#FFB860', 0.65)
        R.fill(w_, hexc('#FFD27A'))
        R.fill(np.maximum(np.abs(X - wx) - 0.7, w_), hexc('#B0702E'), 0.6)
    for i in range(7):
        sy_ = cab_y - 66 - i * 24
        sx_ = cab_x + 22 + i * 6 + 6 * math.sin(i * 1.2)
        R.fill(F.sd_circle(X, Y, sx_, sy_, 7 + i * 3.0), hexc('#F7EFF5'), 0.4 - i * 0.05, feather=5 + i * 2)
    # small pines beside the cabin
    for (px_, pb, ph) in [(150, 1000, 70), (290, 1004, 84), (318, 1010, 56)]:
        R = c.region(px_ - 40, pb - ph - 6, px_ + 40, pb + 12)
        pine_tree(R, px_, pb, ph, ph * 0.36, 3, '#3F6E78', '#2C5262', '#FFFFFF', '#D5DEEE', shadow_a=0.2, k_round=1.2)

    # near snow: soft drifts + sparkles
    R = c.region(0, 940, W, H)
    g = np.clip((R.Y - 968) / 312, 0, 1)
    R.paint(np.clip((R.Y - 950) / 30, 0, 1), F.mix(hexc('#F7F4FB'), hexc('#DDE6F4'), g), 0.55)
    for (dx, dy, rx, ry) in [(120, 1095, 270, 36), (590, 1150, 300, 42), (330, 1248, 400, 50)]:
        R = c.region(dx - rx - 40, dy - ry - 40, dx + rx + 40, dy + ry + 40)
        d = F.sd_ellipse(R.X, R.Y, dx, dy, rx, ry)
        R.paint(R.cov(d, 26) * np.clip((R.Y - dy + ry) / (2 * ry), 0, 1), hexc('#C4D2E8'), 0.5)
        R.paint(R.cov(d + 6, 10) * np.clip(1 - (R.Y - dy + ry) / (0.8 * ry), 0, 1), WHITE, 0.6)
    for _ in range(60):
        x, y = rng.uniform(0, W), rng.uniform(990, H)
        R = c.region(x - 6, y - 6, x + 6, y + 6)
        R.fill(F.sd_star(R.X, R.Y, x, y, rng.uniform(2.5, 4.5), 0.6, 4, rot=0), WHITE, rng.uniform(0.5, 0.9), feather=0.4)

    # framing foreground pines (palette pine, cooled by the dawn light)
    for (x, by, h) in [(-70, 1330, 430), (40, 1205, 560), (690, 1180, 500), (790, 1320, 400)]:
        w = h * 0.40
        R = c.region(x - w - 12, by - h - 12, x + w + 12, by + h * 0.12)
        if R.empty:
            continue
        pine_tree(R, x, by, h, w, 5, '#2F6A5E', '#1C4440', '#FFFFFF', '#CBD8EC', shadow_a=0.4, k_round=3.0)
    field(ridge(1228, 20, 41, 0.9), '#F8FAFD', '#E7EEF8', depth=60)

    # --- snowfall
    for _ in range(190):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        rr = rng.uniform(1.1, 3.0)
        R = c.region(x - 6, y - 6, x + 6, y + 6)
        R.fill(F.sd_circle(R.X, R.Y, x, y, rr), WHITE, rng.uniform(0.5, 0.95), feather=0.8)
    for _ in range(24):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        rr = rng.uniform(5, 11)
        R = c.region(x - 3 * rr, y - 3 * rr, x + 3 * rr, y + 3 * rr)
        R.fill(F.sd_circle(R.X, R.Y, x, y, rr), WHITE, rng.uniform(0.22, 0.45), feather=rr * 0.7)
    vx = (c.X / W - 0.5) * 2
    vy = (c.Y / H - 0.5) * 2
    vig = np.clip((vx * vx * 0.6 + vy * vy * 0.35) - 0.25, 0, 1)
    c.paint(vig, hexc('#1B2840'), 0.24)
    return c.image().convert('RGB')


# =========================================================================== registry
ICONS = {
    'ui_icon_coin': icon_coin,
    'ui_icon_settings': icon_settings,
    'ui_icon_sound_on': lambda: icon_sound(True),
    'ui_icon_sound_off': lambda: icon_sound(False),
    'ui_icon_music_on': lambda: icon_music(True),
    'ui_icon_music_off': lambda: icon_music(False),
    'ui_icon_lock': icon_lock,
    'ui_icon_close': icon_close,
    'ui_icon_check': icon_check,
    'ui_icon_backpack': icon_backpack,
    'ui_icon_speed': icon_speed,
    'ui_icon_worker': icon_worker,
}
ATLAS_ITEMS = dict(ICONS)
ATLAS_ITEMS.update({
    'ui_arrow': arrow,
    'ui_bubble': lambda: bubble(True),
    'ui_bubble_tail': bubble_tail,
    'ui_badge_max': badge_max,
    'ui_joystick_base': joystick_base,
    'ui_joystick_knob': joystick_knob,
    'ui_ring_bg': lambda: ring(False),
    'ui_ring_fill': lambda: ring(True),
    'ui_pad_unlock': lambda: pad('unlock'),
    'ui_pad_input': lambda: pad('input'),
    'ui_pad_output': lambda: pad('output'),
    'ui_pad_cash': lambda: pad('cash'),
    'ui_pad_hire': lambda: pad('hire'),
    'ui_pad_upgrade': lambda: pad('upgrade'),
})
# anchors (normalised, of the untrimmed frame)
ANCHORS = {
    'ui_arrow': [0.5, 0.92],        # tip of the arrow
    'ui_bubble': [0.5, 0.985],      # tip of the tail
    'ui_bubble_tail': [0.5, 0.0],
}
NOTES = {
    'ui_arrow': 'Points DOWN; anchor = arrow tip. Bounce it with a y tween.',
    'ui_bubble': 'Speech bubble 160x132, tail at bottom centre (anchor = tail tip). Content area ~ x 14..146, y 12..96.',
    'ui_bubble_tail': 'Extra: tail only, to pair with the 9-slice ui_bubble_body for wider bubbles (anchor = top centre).',
    'ui_badge_max': 'Red/gold pill badge; game draws "MAX" text (white, dark stroke) centred.',
    'ui_coin_bar': 'Dark translucent pill (9-slice). Put ui_icon_coin overlapping the left end and white text.',
    'ui_ring_fill': 'White ring (tint it). Same geometry as ui_ring_bg: centre radius 52, thickness 18 in a 128 frame.',
    'ui_ring_bg': 'Dark translucent track with a soft white rim.',
    'ui_pad_unlock': 'Iso 2:1 floor pad (192x96), white dashed rounded border, translucent navy fill.',
    'ui_joystick_base': '220x220, translucent; knob travel radius ~70 px.',
    'ui_title_bg': '720x1280 portrait backdrop; keep title text in the upper sky (y 180-460) and the tap prompt near y 1080.',
}
for k in ('input', 'output', 'cash', 'hire', 'upgrade'):
    NOTES['ui_pad_' + k] = 'Iso 2:1 floor pad (192x96) with a symbol painted on the floor; colour-coded.'

NINE = {
    'ui_panel': (panel, dict(left=36, right=36, top=36, bottom=42)),
    'ui_button_blue': (lambda: button('blue'), dict(left=32, right=32, top=32, bottom=36)),
    'ui_button_green': (lambda: button('green'), dict(left=32, right=32, top=32, bottom=36)),
    'ui_button_gray': (lambda: button('gray'), dict(left=32, right=32, top=32, bottom=36)),
    'ui_coin_bar': (coin_bar, dict(left=34, right=34, top=30, bottom=30)),
    'ui_bubble_body': (lambda: bubble(False), dict(left=34, right=34, top=32, bottom=36)),
}


# =========================================================================== previews
def nine_slice(img, w, h, m):
    """Simple 9-slice stretch (for previews / sanity of margins)."""
    l, r, t, b = m['left'], m['right'], m['top'], m['bottom']
    W, H = img.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    xs = [(0, l, 0, l), (l, W - r, l, w - r), (W - r, W, w - r, w)]
    ys = [(0, t, 0, t), (t, H - b, t, h - b), (H - b, H, h - b, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if sx1 <= sx0 or sy1 <= sy0 or dx1 <= dx0 or dy1 <= dy0:
                continue
            part = img.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.BILINEAR)
            out.alpha_composite(part, (dx0, dy0))
    return out


def preview_sheet(imgs, nine_imgs, title_img):
    W = 1400
    sheet = Image.new('RGBA', (W, 1500), (0, 0, 0, 255))
    dr = ImageDraw.Draw(sheet)
    # backgrounds: snow, plaza, cream panel
    sheet.paste((244, 247, 251, 255), (0, 0, W, 520))
    sheet.paste((216, 159, 138, 255), (0, 520, W, 860))
    sheet.paste((46, 70, 110, 255), (0, 860, W, 1500))
    dr.text((10, 6), 'UI sheet - icons/pads on snow (top), plaza (middle), dark (bottom); 9-slices stretched', fill=(30, 30, 40, 255))
    # icons row on snow and on a panel
    x = 20
    for k in ICONS:
        sheet.alpha_composite(imgs[k], (x, 30))
        x += 104
    # panel with icons + buttons
    pan = nine_slice(nine_imgs['ui_panel'], 520, 300, NINE['ui_panel'][1])
    sheet.alpha_composite(pan, (20, 140))
    for i, k in enumerate(['ui_icon_sound_on', 'ui_icon_sound_off', 'ui_icon_music_on', 'ui_icon_music_off']):
        sheet.alpha_composite(imgs[k].resize((64, 64), Image.LANCZOS), (60 + i * 80, 180))
    for i, col in enumerate(['blue', 'green', 'gray']):
        b = nine_slice(nine_imgs['ui_button_' + col], 140, 80, NINE['ui_button_' + col][1])
        sheet.alpha_composite(b, (50 + i * 155, 300))
        ic = imgs[['ui_icon_check', 'ui_icon_settings', 'ui_icon_lock'][i]].resize((52, 52), Image.LANCZOS)
        sheet.alpha_composite(ic, (50 + i * 155 + 44, 306))
    wide = nine_slice(nine_imgs['ui_button_green'], 300, 110, NINE['ui_button_green'][1])
    sheet.alpha_composite(wide, (580, 150))
    bar = nine_slice(nine_imgs['ui_coin_bar'], 260, 64, NINE['ui_coin_bar'][1])
    sheet.alpha_composite(bar, (580, 290))
    sheet.alpha_composite(imgs['ui_icon_coin'].resize((76, 76), Image.LANCZOS), (566, 282))
    sheet.alpha_composite(imgs['ui_badge_max'], (900, 300))
    sheet.alpha_composite(imgs['ui_arrow'], (1060, 160))
    sheet.alpha_composite(imgs['ui_bubble'], (1200, 150))
    sheet.alpha_composite(imgs['ui_icon_coin'].resize((56, 56), Image.LANCZOS), (1252, 170))
    wb = nine_slice(nine_imgs['ui_bubble_body'], 220, 90, NINE['ui_bubble_body'][1])
    sheet.alpha_composite(wb, (900, 390))
    tl = imgs['ui_bubble_tail']
    sheet.alpha_composite(tl, (900 + 110 - tl.width // 2, 390 + 90 - 10))
    # pads row on snow
    x = 20
    for k in ['ui_pad_unlock', 'ui_pad_input', 'ui_pad_output', 'ui_pad_cash', 'ui_pad_hire', 'ui_pad_upgrade']:
        sheet.alpha_composite(imgs[k], (x, 410))
        sheet.alpha_composite(imgs[k], (x, 540 + 30))
        x += 210
    # ring + joystick on plaza
    sheet.alpha_composite(imgs['ui_ring_bg'], (40, 700))
    rf = imgs['ui_ring_fill'].copy()
    arr = np.asarray(rf).copy()
    yy, xx = np.mgrid[0:128, 0:128]
    ang = (np.degrees(np.arctan2(xx - 64, -(yy - 64))) + 360) % 360
    arr[..., 3] = np.where(ang < 250, arr[..., 3], 0)
    tint = np.array([255, 200, 61]) / 255.0
    arr[..., :3] = (arr[..., :3] * tint).astype(np.uint8)
    sheet.alpha_composite(Image.fromarray(arr), (40, 700))
    sheet.alpha_composite(imgs['ui_ring_bg'], (200, 700))
    sheet.alpha_composite(imgs['ui_ring_fill'], (200, 700))
    sheet.alpha_composite(imgs['ui_joystick_base'], (400, 630))
    sheet.alpha_composite(imgs['ui_joystick_knob'], (400 + 110 - 52 + 30, 630 + 110 - 52 - 20))
    # icons on dark
    x = 20
    for k in ICONS:
        sheet.alpha_composite(imgs[k], (x, 880))
        x += 104
    # icons on blue buttons
    x = 20
    for k in ICONS:
        b = nine_slice(nine_imgs['ui_button_blue'], 96, 84, NINE['ui_button_blue'][1])
        sheet.alpha_composite(b, (x, 1000))
        sheet.alpha_composite(imgs[k].resize((60, 60), Image.LANCZOS), (x + 18, 1006))
        x += 104
    # title thumbnail
    th = title_img.resize((180, 320), Image.LANCZOS).convert('RGBA')
    sheet.alpha_composite(th, (1200, 1120 - 0))
    # 1:1 small icon sizes (48 / 32 px) on dark
    x = 20
    for k in ICONS:
        sheet.alpha_composite(imgs[k].resize((48, 48), Image.LANCZOS), (x, 1120))
        sheet.alpha_composite(imgs[k].resize((32, 32), Image.LANCZOS), (x + 56, 1128))
        x += 100
    sheet = sheet.crop((0, 0, W, 1450))
    return sheet


def pads_scene(imgs):
    """Pads on snow + plaza strips with tiles, as seen in game (also checks the dashed border)."""
    W, H = 900, 300
    im = Image.new('RGBA', (W, H), (244, 247, 251, 255))
    dr = ImageDraw.Draw(im)
    # plaza diamond-ish band on the right half
    dr.polygon([(450, 0), (900, 0), (900, 300), (450, 300)], fill=(216, 159, 138, 255))
    ks = ['ui_pad_unlock', 'ui_pad_input', 'ui_pad_output', 'ui_pad_cash', 'ui_pad_hire', 'ui_pad_upgrade']
    for i, k in enumerate(ks):
        x = 20 + (i % 3) * 140 + (450 if i >= 3 else 0)
        y = 40 + (i % 2) * 120
        sheet_x = x
        im.alpha_composite(imgs[k], (sheet_x, y))
    for i, k in enumerate(ks[:3]):
        im.alpha_composite(imgs[k], (470 + i * 140, 180))
    for i, k in enumerate(ks[3:]):
        im.alpha_composite(imgs[k], (20 + i * 140, 180))
    return im


# =========================================================================== main
def build(only=None, preview_only=False):
    os.makedirs(OUT, exist_ok=True)
    imgs = {}
    for k, fn in ATLAS_ITEMS.items():
        if only and k not in only:
            continue
        imgs[k] = fn()
        print('  built', k, imgs[k].size, flush=True)
    nine_imgs = {}
    for k, (fn, m) in NINE.items():
        if only and k not in only:
            continue
        nine_imgs[k] = fn()
        print('  built', k, nine_imgs[k].size, flush=True)
    title = None
    if not only or 'ui_title_bg' in only:
        title = title_bg()
        print('  built ui_title_bg', title.size, flush=True)

    if only:
        tmp = os.path.join(ROOT, 'tools', 'fx', '_cache')
        os.makedirs(tmp, exist_ok=True)
        allimgs = list(imgs.items()) + list(nine_imgs.items())
        if allimgs:
            cell_w = max(i.width for _, i in allimgs) + 16
            cell_h = max(i.height for _, i in allimgs) + 16
            n = len(allimgs)
            cols = min(n, 6)
            rows = (n + cols - 1) // cols
            sheet = Image.new('RGBA', (cols * cell_w * 2, rows * cell_h), (244, 247, 251, 255))
            for i, (k, im) in enumerate(allimgs):
                x = (i % cols) * cell_w * 2
                y = (i // cols) * cell_h
                sheet.alpha_composite(im, (x + 8, y + 8))
                bg = Image.new('RGBA', (cell_w, cell_h), (216, 159, 138, 255))
                bg.alpha_composite(im, (8, 8))
                sheet.alpha_composite(bg, (x + cell_w, y))
            sheet.save(os.path.join(tmp, 'ui_only.png'))
            print('  preview ->', os.path.join(tmp, 'ui_only.png'))
        if title is not None:
            title.save(os.path.join(tmp, 'ui_title_bg.png'))
        return

    # --- write assets
    frames = [(k, im) for k, im in imgs.items()]
    sheet, atlas = pack_utils.pack_atlas(frames, max_width=1024, padding=2)
    F.save_png(sheet, os.path.join(OUT, 'ui_icons.png'))
    atlas['meta']['image'] = 'ui_icons.png'
    with open(os.path.join(OUT, 'ui_icons.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    for k, im in nine_imgs.items():
        F.save_png(im, os.path.join(OUT, k + '.png'))
    F.save_png(title, os.path.join(OUT, 'ui_title_bg.png'), quant=256, dither=1.0)

    manifest = {
        'version': 1,
        'generator': 'tools/fx/gen_ui.py',
        'conventions': {
            'text': 'No text is baked into any UI image; the game renders all text.',
            'iconSize': [96, 96],
            'pads': 'ui_pad_* are 192x96 iso (2:1) diamonds: floor square of ~2.1 m at PPU 64; anchor = centre.',
            'colours': {'blue': '#3D8BE0', 'green': '#5CC86A', 'gold': '#FFC83D', 'darkText': '#2B2F3A', 'cream': '#FFF8EC'},
        },
        'atlases': [{'key': 'ui_icons', 'png': 'ui/ui_icons.png', 'json': 'ui/ui_icons.json'}],
        'images': [{'key': k, 'png': 'ui/%s.png' % k} for k in NINE] + [{'key': 'ui_title_bg', 'png': 'ui/ui_title_bg.png'}],
        'sprites': {},
        'nineSlice': {},
    }
    for k, im in imgs.items():
        kind = 'icon' if k.startswith('ui_icon_') else 'ui'
        e = {'atlas': 'ui_icons', 'frame': k, 'anchor': ANCHORS.get(k, [0.5, 0.5]), 'kind': kind,
             'frameSize': list(im.size)}
        if k.startswith('ui_pad_'):
            e['footprint'] = [184, 92]
        if k == 'ui_ring_fill':
            e['tintable'] = True
        if k in NOTES:
            e['notes'] = NOTES[k]
        manifest['sprites'][k] = e
    for k, im in nine_imgs.items():
        e = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'ui', 'frameSize': list(im.size)}
        if k in NOTES:
            e['notes'] = NOTES[k]
        manifest['sprites'][k] = e
        m = dict(NINE[k][1])
        m['image'] = k
        manifest['nineSlice'][k] = {'image': k, 'left': m['left'], 'right': m['right'], 'top': m['top'], 'bottom': m['bottom']}
    manifest['sprites']['ui_title_bg'] = {'image': 'ui_title_bg', 'anchor': [0.5, 0.5], 'kind': 'ui',
                                          'frameSize': [720, 1280], 'notes': NOTES['ui_title_bg']}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    # previews
    os.makedirs(PREV, exist_ok=True)
    preview_sheet(imgs, nine_imgs, title).convert('RGB').save(os.path.join(PREV, 'ui_sheet.png'), optimize=True)
    pads_scene(imgs).convert('RGB').save(os.path.join(PREV, 'ui_pads_scene.png'), optimize=True)
    title.resize((360, 640), Image.LANCZOS).save(os.path.join(PREV, 'ui_title_bg.png'), optimize=True)
    print('UI done ->', OUT)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='', help='comma separated keys (writes a scratch preview only)')
    ap.add_argument('--preview-only', action='store_true')
    a = ap.parse_args()
    only = set(k for k in a.only.split(',') if k) or None
    build(only, a.preview_only)
