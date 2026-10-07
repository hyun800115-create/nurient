"""
ui2_art.py - v2/v3 UI art for Frost Village (CONTRACT_V3 §F): iso floor pads, 96 px soft-3D icons and the
build-menu card 9-slices.  Library module (no CLI) - imported by tools/fx/gen_ui2.py.

Style is copied 1:1 from tools/fx/gen_ui.py (imported read-only, never edited):
  * pads   : gen_ui.pad_base() (translucent colour-coded iso diamond, white rounded border with a dark
             under-stroke) + gen_ui.pad_symbol() (white engraved symbol, upper-left cut edge).  Symbols are
             drawn in floor coordinates with the same milder 1.55 foreshortening as the existing pads.
  * icons  : fxlib.toy() "soft toy" parts - dark tinted outline, top->bottom gradient lit by a rounded bevel
             from the shared upper-left sun, gloss band, ONE navy drop shadow per icon.  Faces / bread use the
             emote palette of tools/fx/emote_art.py (imported read-only).
  * cards  : chunky rounded panel (rim + bottom lip + bevel) like ui_panel / ui_button_*, 9-slice safe:
             every non-stretchable detail lives inside the margins.
Every function returns a PIL RGBA image; deterministic (no randomness).
"""
import math

import numpy as np

import fxlib as F
from fxlib import hexc, toy, stroke
import gen_ui as GU
import emote_art as EA

WHITE = hexc('#FFFFFF')
union = F.union

# ============================================================================ iso floor pads (192 x 96)
PAD_COLOURS = {   # existing: input #3D8BE0, output #4DBA62, cash #F2B53A, hire #F08A3D, upgrade #8E6BE0
    'clerk': '#E2659A',      # pink   - hire a clerk (cash register + "+")
    'porter': '#8FB23A',     # lime   - hire a porter (porter with crates on a back frame + "+")
    'build': '#E0534A',      # coral  - build here (hammer + "+")
    'tower': '#B05CC8',      # violet - raise a watchtower (beacon at dusk)
    'boat': '#4A58C0',       # deep-sea indigo - buy / upgrade a boat
    'register': '#22AE98',   # teal   - stand here to take payment (two footprints + coin)
}


def _plus(fx, fy, x, y, arm=11.5, t=3.8):
    return union(F.sd_box(fx, fy, x, y, t, arm, 1.5), F.sd_box(fx, fy, x, y, arm, t, 1.5))


def _sym_register_machine(fx, fy, ox=-6.0, oy=0.0):
    """Cash register silhouette (slanted keypad body, pop-up display, drawer groove, key holes)."""
    body = F.sd_polygon(fx, fy, [(ox - 26, oy + 26), (ox + 24, oy + 26), (ox + 24, oy + 2), (ox + 10, oy - 9),
                                 (ox - 26, oy - 9)]) - 2.4
    neck = F.sd_box(fx, fy, ox - 13, oy - 13, 3.6, 5, 1)
    disp = F.sd_box(fx, fy, ox - 13, oy - 22, 12.5, 7.5, 3)
    d = union(body, neck, disp)
    d = F.subtract(d, F.sd_box(fx, fy, ox - 1, oy + 13.5, 27, 1.5, 0))          # drawer groove
    d = F.subtract(d, F.sd_box(fx, fy, ox - 1, oy + 20.5, 6, 1.6, 1.5))         # drawer handle slot
    for kx in (-17, -8, 1):                                                     # two rows of keys
        for ky in (-3.0, 5.0):
            d = F.subtract(d, F.sd_box(fx, fy, ox + kx, oy + ky, 2.6, 2.2, 0.8))
    d = F.subtract(d, F.sd_box(fx, fy, ox - 13, oy - 22, 7.5, 3.0, 1.2))        # display window
    return d


def _hammer_frame(X, Y, cx, cy, deg):
    return F.rot(X, Y, cx, cy, math.radians(deg))


def _horn(X, Y, cx, cy, r, a0, a1, t0, t1, steps=10):
    """Tapered curved horn (polygon around an arc of radius r from angle a0 to a1, half-thickness t0 -> t1)."""
    outer, inner = [], []
    for j in range(steps + 1):
        u = j / steps
        a = a0 + (a1 - a0) * u
        t = t0 + (t1 - t0) * u
        outer.append((cx + (r + t) * math.cos(a), cy + (r + t) * math.sin(a)))
        inner.append((cx + (r - t) * math.cos(a), cy + (r - t) * math.sin(a)))
    return F.sd_polygon(X, Y, outer + inner[::-1])


def _hammer_sd(X, Y, cx, cy, k=1.0, parts=False):
    """Claw hammer in its own upright frame centred at (cx, cy): handle down, head across the top.
    Square striking face on the left, a tapered claw curving down on the right."""
    handle = F.sd_box(X, Y, cx, cy + 12 * k, 4.6 * k, 22 * k, 2.2 * k)
    head = F.sd_box(X, Y, cx - 2 * k, cy - 14 * k, 12 * k, 7.5 * k, 2.5 * k)
    face_ = F.sd_box(X, Y, cx - 15 * k, cy - 14 * k, 4.5 * k, 10 * k, 2.2 * k)
    claw = _horn(X, Y, cx + 8 * k, cy - 1 * k, 13 * k, math.radians(-95), math.radians(-12), 6.5 * k, 1.6 * k) - 0.8 * k
    hd = F.smin(union(head, face_), claw, 1.5 * k)
    if parts:
        return handle, hd
    return union(handle, hd)


def pad_symbol_sd(kind, fx, fy):
    """SDF of the engraved symbol in pad floor coords (fx right, fy = 1.55 * screen dy)."""
    if kind == 'clerk':
        return union(_sym_register_machine(fx, fy, -7, 2), _plus(fx, fy, 33, -21))
    if kind == 'porter':
        # porter walking left with a crate stack on a back frame (side view)
        head = F.sd_circle(fx, fy, -18, -21, 9.0)
        body = F.sd_segment(fx, fy, -15, -5, -12, 10, 8.2)
        legs = union(F.sd_segment(fx, fy, -13, 14, -23, 31, 3.5), F.sd_segment(fx, fy, -9, 14, -1, 31, 3.5))
        arm = F.sd_segment(fx, fy, -17, -1, -26, 9, 3.0)
        rail = F.sd_segment(fx, fy, -1, 26, 1, -32, 2.6)
        crate1 = F.sd_box(fx, fy, 10, 7, 11, 12, 2.2)
        crate2 = F.sd_box(fx, fy, 9, -16, 9, 9.5, 2.2)
        crates = union(crate1, crate2)
        crates = F.subtract(crates, np.abs(F.sd_box(fx, fy, 10, 7, 6.5, 7.5, 1.2)) - 0.75)
        crates = F.subtract(crates, F.sd_box(fx, fy, 9, -5.5, 14, 1.3, 0))
        person = union(F.subtract(head, F.sd_circle(fx, fy, -15, -9, 6.0)), body, legs, arm)   # neck gap
        person = F.subtract(person, union(crates, rail) - 2.2)              # gap so the load reads separately
        d = union(person, F.subtract(rail, crates - 1.6), crates)
        return union(d, _plus(fx, fy, 34, -17, 10.5, 3.6))
    if kind == 'build':
        X, Y = _hammer_frame(fx, fy, -7, 4, -40)
        return union(_hammer_sd(X, Y, -7, 4, 1.0), _plus(fx, fy, 31, -21, 12.5, 4.0))
    if kind == 'tower':
        legs = union(F.sd_segment(fx, fy, -21, 33, -11, -6, 3.2), F.sd_segment(fx, fy, 21, 33, 11, -6, 3.2))
        brace = union(F.sd_segment(fx, fy, -17, 22, 13.5, 5, 2.1), F.sd_segment(fx, fy, 17, 22, -13.5, 5, 2.1),
                      F.sd_segment(fx, fy, -19, 30, 19, 30, 2.1))
        deck = F.sd_box(fx, fy, 0, -9, 20, 4.2, 1.5)
        basket = F.sd_polygon(fx, fy, [(-6, -13), (6, -13), (12, -24), (-12, -24)]) - 1.2
        flame = F.sd_teardrop(fx, fy, 0, -34, 8.5, 22, tip=1.2)
        flame = F.subtract(flame, F.sd_teardrop(fx, fy, 0, -31, 3.6, 10, tip=0.6))   # inner tongue cut
        d = union(legs, brace, deck, basket, flame)
        d = F.subtract(d, F.sd_box(fx, fy, 0, -20, 9, 1.2, 0))                        # basket weave line
        return d
    if kind == 'boat':
        hull = F.sd_polygon(fx, fy, [(-37, 2), (37, 2), (27, 19), (-27, 19)]) - 2.5
        hull = F.subtract(hull, F.sd_box(fx, fy, 0, 8.5, 30, 1.3, 0))                 # strake line
        mast = F.sd_box(fx, fy, -1, -17, 2.4, 19, 1)
        sail = F.sd_polygon(fx, fy, [(4, -36), (4, -3), (28, -3)]) - 1.5
        jib = F.sd_polygon(fx, fy, [(-6, -30), (-6, -3), (-24, -3)]) - 1.5
        w = 3.0 * np.sin(fx * 0.32)
        waves = np.maximum(np.abs(fy - 31 - w) - 2.3, np.abs(fx) - 30)
        return union(hull, mast, sail, jib, waves)
    if kind == 'register':
        d = None
        for sx, sy, ang in ((-24, 6, -8), (-3, 0, 8)):                               # two boot prints
            X, Y = F.rot(fx, fy, sx, sy, math.radians(ang))
            sole = F.sd_ellipse(X, Y, sx, sy - 6, 8.2, 13.5)
            heel = F.sd_ellipse(X, Y, sx, sy + 15.5, 6.6, 6.0)
            dd = union(sole, heel)
            d = dd if d is None else union(d, dd)
        ring = np.abs(F.sd_circle(fx, fy, 25, -12, 14)) - 3.2
        st = F.sd_star(fx, fy, 25, -11.5, 8.6, 3.9, 5, round_=1.2)
        return union(d, ring, st)
    raise KeyError(kind)


def pad(kind):
    """192x96 iso floor pad, identical construction to gen_ui.pad()."""
    c = F.Canvas(GU.PAD_W, GU.PAD_H)
    GU.pad_base(c, PAD_COLOURS[kind], 0.55)
    fx, fy = c.X - GU.PAD_W / 2, (c.Y - GU.PAD_H / 2) * 1.55
    GU.pad_symbol(c, pad_symbol_sd(kind, fx, fy))
    return c.image()


# ============================================================================ icons (96 x 96)
STEEL = ('#F4F7FB', '#8E96A3', '#3E4756')
WOOD = ('#C98F55', '#8A5A33', '#3C2414')
WOOD_L = ('#E0A867', '#A8703E', '#4E2E16')
SILVER = ('#FFFFFF', '#C8D3E3', '#34425C')


def _shadow(c, d, ow=3.0):
    c.shadow(c.cov(d - ow), dy=3, sigma=2.2, opacity=0.32)


def _t(c, d, pal, ow=3.0, bevel=6.0, gloss=0.3, hi=0.5, lo=0.45, spec=0.0, tint_lo=None, yr=None, pillow=None):
    top, bot, line = pal
    return toy(c, d, top, bot, line, ow=ow, bevel=bevel, gloss=gloss, shadow=0, hi=hi, lo=lo, spec=spec,
               tint_lo=None if tint_lo is None else hexc(tint_lo), yr=yr, pillow=pillow)


def icon_zoom(plus=True):
    """Magnifier: silver rim, light-blue glass with glare, wooden handle; green plus / red minus inside."""
    c = F.Canvas(96, 96)
    cx, cy, R = 41, 40, 27.5
    X, Y = F.rot(c.X, c.Y, 70, 70, math.radians(45))
    handle = F.sd_box(X, Y, 70, 70, 7.8, 17, 6.5)
    collar = F.sd_box(X, Y, 70, 56.5, 8.6, 4.2, 2.0)
    rim = F.sd_circle(c.X, c.Y, cx, cy, R)
    glass = F.sd_circle(c.X, c.Y, cx, cy, R - 6.5)
    _shadow(c, union(handle, rim, collar))
    _t(c, handle, ('#B8743E', '#6E4428', '#3C2414'), bevel=5, gloss=0.25)
    _t(c, collar, STEEL, ow=2.4, bevel=3, gloss=0.2, spec=0.3)
    _t(c, rim, SILVER, ow=3.2, bevel=6, gloss=0.25, hi=0.4, lo=0.5, tint_lo='#7F93B5')
    # glass: inverted bevel (recessed), cool gradient, curved glare
    n = F.bevel_normals(-glass, 4, c.px)
    n[..., 0] *= -1
    n[..., 1] *= -1
    t = np.clip((c.Y - (cy - R)) / (2 * R), 0, 1)
    base = F.mix(hexc('#DFF1FF'), hexc('#8CC4F0'), t)
    c.paint(c.cov(glass), F.shade(base, F.lambert(n) * 0.7, 0.5, 0.45, hexc('#4C86C8')))
    arc = F.sd_arc(c.X, c.Y, cx, cy, R - 11, math.radians(200), math.radians(255), 2.6)
    c.fill(arc, WHITE, 0.85, feather=0.6)
    c.fill(F.sd_circle(c.X, c.Y, cx - 14, cy + 4, 1.8), WHITE, 0.7)
    # symbol
    bar = F.sd_box(c.X, c.Y, cx, cy, 12.5, 4.4, 2.2)
    if plus:
        sym = union(bar, F.sd_box(c.X, c.Y, cx, cy, 4.4, 12.5, 2.2))
        toy(c, sym, '#B5F2A8', '#3FAE4C', '#1F5E2A', ow=2.4, bevel=3.5, gloss=0.3, shadow=0.25, sh_dy=1.5,
            sh_sigma=1.2)
    else:
        toy(c, bar, '#FFA898', '#D9372C', '#7E1A16', ow=2.4, bevel=3.5, gloss=0.3, shadow=0.25, sh_dy=1.5,
            sh_sigma=1.2)
    return c.image()


def icon_map():
    """Folded three-panel parchment map: sea, forest, red dashed route, a red pin at the goal."""
    c = F.Canvas(96, 96)
    xs = [12, 33, 57, 82]
    ys_top = [24, 17, 24, 17]                     # zig-zag fold: panels alternate tilt
    H = 54
    panels = [F.sd_polygon(c.X, c.Y, [(xs[i], ys_top[i]), (xs[i + 1], ys_top[i + 1]), (xs[i + 1], ys_top[i + 1] + H),
                                       (xs[i], ys_top[i] + H)]) - 1.6 for i in range(3)]
    whole = union(*panels)
    pin_head = F.sd_circle(c.X, c.Y, 66, 30, 9.5)
    pin_tip = F.sd_polygon(c.X, c.Y, [(58.5, 33), (73.5, 33), (66, 50)]) - 1.0
    pin = F.smin(pin_head, pin_tip, 3)
    _shadow(c, union(whole, pin))
    c.fill(whole - 3.0, hexc('#6B4A2E'))
    shades = [('#FFF6DE', '#EED7A6'), ('#F1DCAE', '#D9BC84'), ('#FFF6DE', '#EED7A6')]
    for i, p in enumerate(panels):
        n = F.bevel_normals(p, 3, c.px)
        t = np.clip((c.Y - 17) / (H + 7), 0, 1)
        c.paint(c.cov(p), F.shade(F.mix(hexc(shades[i][0]), hexc(shades[i][1]), t), F.lambert(n), 0.45, 0.35))
    inside = c.cov(whole + 1.0)
    # sea (left), forest blobs (middle / right), snowy hills
    sea = F.sd_ellipse(c.X, c.Y, 14, 60, 15, 19)
    c.paint(c.cov(sea, 0.6) * inside, hexc('#5FA8E6'), 0.95)
    c.paint(c.cov(np.abs(sea + 3) - 0.8, 0.4) * inside, WHITE, 0.6)
    for (x, y, r) in ((40, 34, 6.5), (47, 40, 5.5), (37, 44, 5.0), (74, 62, 6.0), (80, 54, 4.5)):
        tr = F.sd_circle(c.X, c.Y, x, y, r)
        c.paint(c.cov(tr) * inside, hexc('#2E6B4F'))
        c.paint(c.cov(F.sd_circle(c.X, c.Y, x - r * 0.3, y - r * 0.35, r * 0.45)) * inside, hexc('#5FA07A'))
    # dashed route from the sea to the pin
    pts = [(20, 66), (32, 60), (44, 63), (55, 56), (62, 46)]
    route = F.sd_polyline(c.X, c.Y, pts, 1.9)
    # dash mask along the path: approximate arc-length by x
    dash = (np.sin(c.X * 0.75 + c.Y * 0.25) > -0.2).astype(np.float32)
    c.paint(c.cov(route) * dash * inside, hexc('#D9372C'))
    # fold creases
    for i in (1, 2):
        cr = F.sd_segment(c.X, c.Y, xs[i], ys_top[i], xs[i], ys_top[i] + H, 0.7)
        c.paint(c.cov(cr) * inside, hexc('#B89A68'), 0.8)
    # pin
    _t(c, pin, ('#FF8E7E', '#D9372C', '#7E1A16'), ow=2.6, bevel=4.5, gloss=0.35, spec=0.2)
    c.fill(F.sd_circle(c.X, c.Y, 66, 30, 3.6), hexc('#FFF2EC'))
    return c.image()


def icon_hammer():
    """Chunky claw hammer, wooden handle, steel head (tilted)."""
    c = F.Canvas(96, 96)
    cx, cy, k = 50, 48, 1.4
    X, Y = _hammer_frame(c.X, c.Y, cx, cy, -40)
    handle, d_head = _hammer_sd(X, Y, cx, cy, k, parts=True)
    grip = F.sd_box(X, Y, cx, cy + 25 * k, 5.4 * k, 9 * k, 2.6 * k)
    _shadow(c, union(handle, grip, d_head))
    _t(c, handle, WOOD, bevel=4, gloss=0.2)
    _t(c, grip, ('#FF7A6A', '#C9362C', '#5A1410'), ow=2.6, bevel=4, gloss=0.25)
    for gy in (-5, 0, 5):
        g = np.maximum(np.abs(Y - (cy + 25 * k + gy)) - 0.7, grip + 1.5)
        c.fill(g, hexc('#7A1C14'), 0.5)
    _t(c, d_head, STEEL, ow=3.0, bevel=6, gloss=0.35, spec=0.3, tint_lo='#5A6780')
    return c.image()


def icon_house():
    """Cosy log cabin: snow-capped red roof, chimney, glowing window, door."""
    c = F.Canvas(96, 96)
    walls = F.sd_box(c.X, c.Y, 48, 63, 29, 18, 3)
    roof = F.sd_polygon(c.X, c.Y, [(48, 14), (86, 48), (10, 48)]) - 2.5
    chim = F.sd_box(c.X, c.Y, 69, 28, 5.5, 10, 1.5)
    snow = F.intersect(F.sd_polygon(c.X, c.Y, [(48, 11), (89, 47), (7, 47)]) - 2.5,
                       -(F.sd_polygon(c.X, c.Y, [(48, 25), (82, 56), (14, 56)])))
    snow = F.smin(snow, union(F.sd_circle(c.X, c.Y, 22, 42, 4.5), F.sd_circle(c.X, c.Y, 74, 42, 4.5)), 3)
    chim_snow = F.sd_ellipse(c.X, c.Y, 69, 18.5, 7.5, 3.6)
    door = F.sd_box(c.X, c.Y, 60, 69, 7.5, 12, 3)
    win = F.sd_box(c.X, c.Y, 33, 62, 8.5, 7.5, 2.5)
    _shadow(c, union(walls, roof, chim, chim_snow))
    _t(c, chim, ('#B9B2AA', '#7A736C', '#3A3430'), ow=2.6, bevel=3, gloss=0.2)
    _t(c, chim_snow, ('#FFFFFF', '#D5E2F2', '#56739F'), ow=1.8, bevel=3, gloss=0.2)
    _t(c, walls, WOOD, bevel=5, gloss=0.15)
    for ly in (52, 60, 68, 76):                                  # log seams
        s = np.maximum(np.abs(c.Y - ly) - 0.9, walls + 1.5)
        c.fill(s, hexc('#6E4428'), 0.55)
    for lx in (21.5, 74.5):                                       # log ends at the corners
        for ly in (48, 56, 64, 72):
            c.fill(F.sd_circle(c.X, c.Y, lx, ly + 4, 3.2) , hexc('#E8B67F'), 0.9)
            c.fill(np.abs(F.sd_circle(c.X, c.Y, lx, ly + 4, 3.2)) - 0.5, hexc('#8A5A33'), 0.8)
    _t(c, door, ('#9A5E34', '#6E4428', '#3C2414'), ow=2.2, bevel=3, gloss=0.1)
    c.fill(F.sd_circle(c.X, c.Y, 64, 70, 1.4), hexc('#FFD45A'))
    _t(c, win, ('#FFF2B0', '#FFC23A', '#5A3510'), ow=2.4, bevel=3, gloss=0.25, hi=0.6)
    c.fill(union(F.sd_box(c.X, c.Y, 33, 62, 0.9, 7.5), F.sd_box(c.X, c.Y, 33, 62, 8.5, 0.9)), hexc('#7A4A28'), 0.9)
    _t(c, roof, ('#E85A4A', '#A8302A', '#5A1410'), ow=3.0, bevel=5, gloss=0.25)
    _t(c, snow, ('#FFFFFF', '#D5E2F2', '#56739F'), ow=2.4, bevel=4.5, gloss=0.25, tint_lo='#7E9CCC')
    return c.image()


def _villager_head(c, cx, cy, r, parka, line, hair='#3A2A22'):
    """Chibi villager head in a parka hood with a fur trim (like the yellow/red/blue villagers)."""
    hood = F.sd_circle(c.X, c.Y, cx, cy, r)
    _t(c, hood, (parka[0], parka[1], line), ow=2.4, bevel=r * 0.4, gloss=0.2)
    fur = F.sd_circle(c.X, c.Y, cx, cy + r * 0.12, r * 0.74)
    fur = F.smin(fur, union(*[F.sd_circle(c.X, c.Y, cx + r * 0.7 * math.cos(a), cy + r * 0.12 + r * 0.7 * math.sin(a),
                                          r * 0.16) for a in np.linspace(0, 2 * math.pi, 13)[:-1]]), r * 0.08)
    toy(c, fur, '#FFFFFF', '#E6DCCB', None, bevel=r * 0.2, gloss=0, shadow=0, hi=0.4, lo=0.4, tint_lo=hexc('#A89880'))
    fc = F.sd_circle(c.X, c.Y, cx, cy + r * 0.16, r * 0.55)
    toy(c, fc, '#FFE6CF', '#F2BE98', '#8E4A2A', ow=1.4, bevel=r * 0.25, gloss=0, shadow=0, hi=0.4, lo=0.35)
    bangs = F.intersect(F.sd_circle(c.X, c.Y, cx, cy - r * 0.06, r * 0.56), c.Y - (cy - r * 0.02))
    bangs = F.intersect(bangs, fc + 0.5)
    c.fill(bangs, hexc(hair))
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * r * 0.22, cy + r * 0.22, r * 0.075, r * 0.1), hexc(EA.INK))
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * r * 0.36, cy + r * 0.36, r * 0.11, r * 0.07), hexc(EA.CHEEK), 0.6, feather=0.8)
    c.fill(F.sd_arc(c.X, c.Y, cx, cy + r * 0.32, r * 0.12, math.radians(30), math.radians(150), r * 0.03 + 0.5),
           hexc(EA.INK))


def icon_people():
    """Population: three villager heads (blue & red behind, yellow in front)."""
    c = F.Canvas(96, 96)
    heads = [(25, 39, 20.5, ('#7FB2F0', '#3D7CC9'), '#163E78'), (71, 39, 20.5, ('#FF8E7E', '#D9483B'), '#6A1A12'),
             (48, 57, 26, ('#FFE07A', '#F2C230'), '#7A4A0E')]
    sil = union(*[F.sd_circle(c.X, c.Y, x, y, r) for x, y, r, _, _ in heads])
    _shadow(c, sil, 2.4)
    for x, y, r, pk, ln in heads:
        _villager_head(c, x, y, r, pk, ln)
    return c.image()


def icon_clerk():
    """Shop clerk bust: bob hair + red/white headscarf, red-white striped apron, name tag."""
    c = F.Canvas(96, 96)
    cx = 48
    body = np.maximum(F.sd_ellipse(c.X, c.Y, cx, 95, 31, 29), c.Y - 89)     # rounded shoulders, flat cut
    body = F.smin(body, F.sd_box(c.X, c.Y, cx, 85, 27, 4, 3), 3)
    head = F.sd_circle(c.X, c.Y, cx, 41, 22)
    hair = F.smin(F.sd_circle(c.X, c.Y, cx, 38, 24.5), F.sd_box(c.X, c.Y, cx, 50, 25, 9, 6), 4)
    _shadow(c, union(body, hair))
    _t(c, body, ('#FFFFFF', '#DCE4EE', '#5A6780'), ow=2.6, bevel=6, gloss=0.15)
    bib = F.intersect(F.sd_box(c.X, c.Y, cx, 84, 15, 16, 6), body + 1.4)
    stripes = (np.mod(c.X - cx + 3.2, 12.8) < 6.4).astype(np.float32)
    c.paint(c.cov(bib) * stripes, hexc('#E2463B'))
    stroke(c, bib, 1.6, '#8A2018', 0.8)
    tag = F.sd_box(c.X, c.Y, cx - 21, 79, 5.0, 3.4, 1.5)
    _t(c, tag, ('#FFF2B0', '#F2C14E', '#7A4A0E'), ow=1.4, bevel=2, gloss=0.2)
    _t(c, hair, ('#6E4A34', '#3A2A22', '#1E140F'), ow=2.6, bevel=7, gloss=0.25)
    fc = F.sd_ellipse(c.X, c.Y, cx, 46, 17.5, 16.5)
    toy(c, fc, '#FFE6CF', '#F2BE98', '#8E4A2A', ow=1.6, bevel=7, gloss=0, shadow=0, hi=0.4, lo=0.35)
    bangs = F.intersect(F.sd_ellipse(c.X, c.Y, cx + 3, 34, 20, 9), fc + 0.6)
    c.fill(bangs, hexc('#3A2A22'))
    scarf = np.abs(F.sd_circle(c.X, c.Y, cx, 44, 25.5)) - 4.2
    scarf = F.intersect(scarf, c.Y - 33)              # keep only the band over the crown (a headscarf)
    _t(c, scarf, ('#FF7A6A', '#D9372C', '#6A1A12'), ow=2.0, bevel=3, gloss=0.25)
    dots = F.intersect(union(*[F.sd_circle(c.X, c.Y, cx + 25.5 * math.cos(a), 44 + 25.5 * math.sin(a), 1.6)
                               for a in np.linspace(math.radians(200), math.radians(340), 6)]), scarf)
    c.fill(dots, WHITE, 0.95)
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * 6.5, 48, 2.0, 2.7), hexc(EA.INK))
        c.fill(F.sd_circle(c.X, c.Y, cx + s * 6.5 - 0.7, 47, 0.75), WHITE)
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * 11, 53, 3.0, 1.9), hexc(EA.CHEEK), 0.6, feather=0.8)
    c.fill(F.sd_arc(c.X, c.Y, cx, 52.5, 3.4, math.radians(25), math.radians(155), 1.0), hexc(EA.INK))
    return c.image()


def _crate(c, x, y, hw, hh, col=('#E0A867', '#A8703E', '#4E2E16')):
    d = F.sd_box(c.X, c.Y, x, y, hw, hh, 2.5)
    _t(c, d, col, ow=2.4, bevel=3.5, gloss=0.2)
    inner = F.sd_box(c.X, c.Y, x, y, hw - 4.5, hh - 4.5, 1)
    stroke(c, inner, 1.4, '#7A4A28', 0.7)
    dg = np.maximum(F.sd_segment(c.X, c.Y, x - hw + 5, y + hh - 5, x + hw - 5, y - hh + 5, 1.6), inner)
    c.fill(dg, hexc('#8A5A33'), 0.75)
    return d


def icon_porter():
    """Porter: a chibi villager (orange beanie + green scarf, like npc_porter_b) carrying a tall crate
    stack on an A-frame back carrier that rises behind the shoulder; a strap crosses the chest."""
    c = F.Canvas(96, 96)
    crate1 = F.sd_box(c.X, c.Y, 62, 58, 21, 14, 2.5)
    crate2 = F.sd_box(c.X, c.Y, 63, 30, 17, 13, 2.5)
    tips = union(F.sd_segment(c.X, c.Y, 47, 22, 46, 9, 3.4), F.sd_segment(c.X, c.Y, 78, 22, 79, 9, 3.4))
    feet = union(F.sd_segment(c.X, c.Y, 47, 70, 45, 86, 3.4), F.sd_segment(c.X, c.Y, 78, 70, 80, 86, 3.4))
    head = F.sd_circle(c.X, c.Y, 32, 52, 22)
    body = F.sd_box(c.X, c.Y, 34, 80, 19, 9, 8)
    _shadow(c, union(crate1, crate2, tips, feet, head, body))
    _t(c, union(tips, feet), WOOD, ow=2.4, bevel=3, gloss=0.15)
    _crate(c, 62, 58, 21, 14)
    _crate(c, 63, 30, 17, 13, ('#D99A5C', '#9A6236', '#4E2E16'))
    rope = F.sd_segment(c.X, c.Y, 44, 44, 82, 44, 1.6)
    c.fill(rope - 1.2, hexc('#6B4A2E'))
    c.fill(rope, hexc('#EBD9AC'))
    _t(c, body, ('#C98F55', '#8A5A33', '#3C2414'), ow=2.6, bevel=5, gloss=0.15)
    strap = F.intersect(F.sd_segment(c.X, c.Y, 52, 70, 26, 92, 3.0), body + 0.6)
    c.fill(strap - 0.8, hexc('#2E1A0C'))
    c.fill(strap, hexc('#6E4428'))
    fc = F.sd_circle(c.X, c.Y, 32, 54, 18)
    toy(c, fc, '#FFE6CF', '#F2BE98', '#8E4A2A', ow=2.2, bevel=8, gloss=0, shadow=0, hi=0.4, lo=0.35)
    hat = F.intersect(F.sd_circle(c.X, c.Y, 32, 50, 21.5), c.Y - 47)
    hat = F.smin(hat, F.sd_circle(c.X, c.Y, 32, 27, 5.5), 3)
    _t(c, hat, ('#FFB24A', '#E0701E', '#6A300C'), ow=2.6, bevel=6, gloss=0.3)
    cuff = F.sd_box(c.X, c.Y, 32, 45, 21, 4.4, 4.4)
    _t(c, cuff, ('#FFD27A', '#F09A34', '#6A300C'), ow=2.0, bevel=3, gloss=0.1)
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, 32 + s * 7, 55, 2.2, 3.0), hexc(EA.INK))
        c.fill(F.sd_circle(c.X, c.Y, 32 + s * 7 - 0.8, 53.8, 0.8), WHITE)
        c.fill(F.sd_ellipse(c.X, c.Y, 32 + s * 12, 61, 3.4, 2.1), hexc(EA.CHEEK), 0.6, feather=0.8)
    c.fill(F.sd_arc(c.X, c.Y, 32, 59, 3.8, math.radians(25), math.radians(155), 1.1), hexc(EA.INK))
    scarf = F.sd_box(c.X, c.Y, 33, 72.5, 18, 4.3, 4.3)
    _t(c, scarf, ('#7ED39A', '#2E9A5A', '#14502C'), ow=2.0, bevel=3, gloss=0.2)
    return c.image()


def icon_tools():
    """Crossed axe and pickaxe (the toolsmith's goods)."""
    c = F.Canvas(96, 96)
    # pickaxe: handle bottom-right -> top-left, curved head at the top-left
    h1 = F.sd_segment(c.X, c.Y, 78, 82, 26, 26, 4.4)
    pick = F.sd_arc(c.X, c.Y, 41, 41, 31, math.radians(170), math.radians(280), 4.2)
    tipL = F.sd_circle(c.X, c.Y, 41 + 31 * math.cos(math.radians(170)), 41 + 31 * math.sin(math.radians(170)), 2.0)
    tipR = F.sd_circle(c.X, c.Y, 41 + 31 * math.cos(math.radians(280)), 41 + 31 * math.sin(math.radians(280)), 2.0)
    pick = union(pick, tipL, tipR)
    pick = F.smin(pick, F.sd_circle(c.X, c.Y, 22, 22, 6.5), 3)
    # axe: handle bottom-left -> top-right, blade at the top-right
    h2 = F.sd_segment(c.X, c.Y, 18, 82, 70, 30, 4.4)
    Xa, Ya = F.rot(c.X, c.Y, 70, 28, math.radians(45))
    blade = F.sd_polygon(Xa, Ya, [(62, 18), (78, 12), (88, 22), (88, 36), (78, 44), (62, 38)]) - 2.5
    blade = F.intersect(blade, F.sd_circle(Xa, Ya, 64, 28, 24))
    _shadow(c, union(h1, h2, pick, blade))
    _t(c, h1, WOOD, bevel=3.5, gloss=0.15)
    _t(c, pick, STEEL, ow=3.0, bevel=4.5, gloss=0.3, spec=0.3, tint_lo='#5A6780')
    _t(c, h2, WOOD_L, bevel=3.5, gloss=0.15)
    _t(c, blade, STEEL, ow=3.0, bevel=5, gloss=0.35, spec=0.35, tint_lo='#5A6780')
    edge = F.intersect(blade + 0.5, -(F.sd_circle(Xa, Ya, 64, 28, 18)))
    c.fill(edge, WHITE, 0.55)
    return c.image()


def icon_food():
    """Food (miners' rations): a golden bread loaf in front of a smoked meat drumstick."""
    c = F.Canvas(96, 96)
    # drumstick behind (upper right): meat blob + bone
    X, Y = F.rot(c.X, c.Y, 62, 36, math.radians(40))
    meat = F.sd_ellipse(X, Y, 62, 40, 17, 21)
    bone = F.sd_box(X, Y, 62, 14, 4.2, 12, 2)
    knob = union(F.sd_circle(X, Y, 57.5, 4, 5.2), F.sd_circle(X, Y, 66.5, 4, 5.2))
    bone = union(bone, knob)
    # bread in front
    dome = F.sd_ellipse(c.X, c.Y, 40, 62, 31, 22)
    dome = np.maximum(dome, c.Y - 72)
    base = F.sd_box(c.X, c.Y, 40, 70, 30, 6, 6)
    bread = F.smin(dome, base, 3.5)
    _shadow(c, union(meat, bone, bread))
    _t(c, bone, ('#FFFFFF', '#E9DCC8', '#6B5A44'), ow=2.4, bevel=3, gloss=0.25)
    _t(c, meat, ('#D9644A', '#8E2C1E', '#4A140C'), ow=2.8, bevel=6, gloss=0.3, tint_lo='#5A140C')
    c.paint(c.cov(F.sd_ellipse(X, Y, 57, 40, 4, 9)), hexc('#F08A6A'), 0.45)
    top, bot, line = EA.PAL['bread']
    toy(c, bread, top, bot, line, ow=3.0, bevel=8, gloss=0.25, shadow=0, hi=0.55, lo=0.45,
        tint_lo=hexc(EA.LO_TINT['bread']), gloss_h=0.5)
    c.paint(c.cov(bread + 0.5) * np.clip((c.Y - 67) / 7, 0, 1), hexc('#F7D49A'), 0.55)
    for sx in (-14, 0, 14):
        x0, y0 = 40 + sx - 5, 58 + abs(sx) * 0.25
        x1, y1 = 40 + sx + 5, 48 + abs(sx) * 0.25
        sc = F.sd_segment(c.X, c.Y, x0, y0, x1, y1, 2.5)
        c.fill(sc - 1.1, hexc('#8A4214'), 0.8)
        c.fill(sc, hexc('#FCE3B0'))
    EA.glossy_spot(c, 26, 50, 5.5, 2.4, -28, 0.55, 0.8)
    return c.image()


def icon_happy():
    """Happiness: warm smiling face (emote palette) with ^^ eyes, open smile and rosy cheeks."""
    c = F.Canvas(96, 96)
    cx, cy, r = 48, 48, 37
    d = F.sd_circle(c.X, c.Y, cx, cy, r)
    _shadow(c, d, 2.5)
    top, bot, line = EA.PAL['face']
    toy(c, d, top, bot, line, ow=3.2, bevel=r * 0.5, gloss=0, shadow=0, hi=0.55, lo=0.42,
        tint_lo=hexc(EA.LO_TINT['face']))
    EA.glossy_spot(c, cx - r * 0.40, cy - r * 0.55, r * 0.30, r * 0.15, -32, 0.6, 1.0)
    EA.glossy_spot(c, cx - r * 0.70, cy - r * 0.18, r * 0.06, r * 0.06, 0, 0.45, 0.6)
    EA.cheeks(c, cx, cy, 23, 7, rx=6.5, ry=4.0, a=0.6)
    EA.eye_happy(c, cx - 13, cy - 7, w=6.2, t=2.3)
    EA.eye_happy(c, cx + 13, cy - 7, w=6.2, t=2.3)
    EA.mouth_open(c, cx, cy + 5, 15, 15, teeth=False, tongue=True, ink_w=1.6)
    return c.image()


def icon_lock_open():
    """Same gold padlock as ui_icon_lock, but the shackle is lifted and swung open (+ a twinkle)."""
    c = F.Canvas(96, 96)
    cx = 48
    ox, lift = -17, -9                                        # shackle pivots on its left leg, lifted
    shackle = F.sd_arc(c.X, c.Y, cx + ox, 40 + lift, 17, math.pi, 2 * math.pi, 5.5)
    legs = union(F.sd_box(c.X, c.Y, cx + ox - 17, 46 + lift, 5.5, 8, 0),
                 F.sd_box(c.X, c.Y, cx + ox + 17, 46 + lift + 2, 5.5, 6, 0))
    sh = union(shackle, legs)
    body = F.sd_box(c.X, c.Y, cx, 63, 29, 22, 9)
    c.shadow(c.cov(np.minimum(sh, body) - 3), dy=3, sigma=2.2, opacity=0.32)
    toy(c, sh, '#F4F7FB', '#8E96A3', '#3E4756', ow=3, bevel=4.5, gloss=0.3, shadow=0, spec=0.35)
    toy(c, body, '#FFE07A', '#E39A22', '#7A4A0E', ow=3, bevel=7, gloss=0.35, shadow=0, hi=0.55)
    kh = union(F.sd_circle(c.X, c.Y, cx, 59, 5.6),
               F.sd_polygon(c.X, c.Y, [(cx - 3.2, 60), (cx + 3.2, 60), (cx + 4.5, 74), (cx - 4.5, 74)]) - 0.8)
    c.fill(kh - 1.2, hexc('#FFF2C0'), 0.6)
    c.fill(kh, hexc('#5A3510'))
    EA.twinkle(c, 72, 28, 9.5)
    EA.twinkle(c, 83, 44, 5.0)
    return c.image()


ICONS = {
    'ui_icon_zoom_in': lambda: icon_zoom(True),
    'ui_icon_zoom_out': lambda: icon_zoom(False),
    'ui_icon_map': icon_map,
    'ui_icon_hammer': icon_hammer,
    'ui_icon_house': icon_house,
    'ui_icon_people': icon_people,
    'ui_icon_clerk': icon_clerk,
    'ui_icon_porter': icon_porter,
    'ui_icon_tools': icon_tools,
    'ui_icon_food': icon_food,
    'ui_icon_happy': icon_happy,
    'ui_icon_lock_open': icon_lock_open,
}
PADS = {'ui_pad_' + k: (lambda k=k: pad(k)) for k in PAD_COLOURS}


# ============================================================================ build-menu cards (9-slice)
CARD_W, CARD_H = 112, 128
CARD_MARGINS = dict(left=30, right=30, top=30, bottom=36)


def card(selected=False):
    """Selectable build-menu card.  Cream face with a rounded rim + thick bottom lip (like ui_panel /
    ui_button_*).  Selected = gold rim, warm face, soft gold glow and a twinkle in the top-left corner.
    Both share size, body geometry and 9-slice margins so the game can swap them in place."""
    W, H = CARD_W, CARD_H
    c = F.Canvas(W, H)
    x0, x1, y0 = 9, W - 9, 8
    body = F.sd_box(c.X, c.Y, W / 2, y0 + (H - 18 - y0) / 2 + 3, (x1 - x0) / 2, (H - 18 - y0) / 2 + 3, 20)  # rim+lip
    face = F.sd_box(c.X, c.Y, W / 2, y0 + (H - 18 - y0) / 2, (x1 - x0) / 2, (H - 18 - y0) / 2, 20)
    fy0, fy1 = y0, H - 18
    if selected:
        c.glow(c.cov(body - 3), 3.2, '#FFC83D', 0.95)
        c.shadow(c.cov(body), dy=3, sigma=2.6, opacity=0.25)
        c.fill(body - 5.0, hexc('#B8650E'))
        c.fill(body - 3.0, hexc('#FFD45A'))
        rim_t = np.clip((c.Y - y0) / (H - 18), 0, 1)
        c.paint(c.cov(body - 3.0) * c.cov(-(body - 0.6)), F.mix(hexc('#FFF0A8'), hexc('#F5A623'), rim_t))
        c.fill(body - 0.6, hexc('#D9861A'))
        lip = '#EBC07A'
        tops = [(0, '#FFFEF4'), (0.35, '#FFF8DE'), (1, '#FCEBC2')]
        inner_col = '#F2D9A0'
    else:
        c.shadow(c.cov(body), dy=3.5, sigma=2.8, opacity=0.30)
        c.fill(body - 1.6, hexc('#8FA0BA'))
        lip = '#C9D6E8'
        tops = [(0, '#FFFFFF'), (0.35, '#FFFCF5'), (1, '#F6EEDD')]
        inner_col = '#E8DDC8'
    c.fill(body, hexc(lip))
    lip_t = np.clip((c.Y - (fy1 - 4)) / 10, 0, 1)
    c.paint(c.cov(body) * c.cov(-face), F.mix(hexc(lip), hexc('#8FA0BA' if not selected else '#C98A2A'), lip_t * 0.45))
    t = np.clip((c.Y - fy0) / (fy1 - fy0), 0, 1)
    base = F.ramp([(p, hexc(col)) for p, col in tops], t)
    n = F.bevel_normals(face, 6, c.px)
    c.paint(c.cov(face), F.shade(base, F.lambert(n), 0.55, 0.22))
    inner = F.sd_box(c.X, c.Y, W / 2, (fy0 + fy1) / 2, (x1 - x0) / 2 - 7, (fy1 - fy0) / 2 - 7, 14)
    stroke(c, inner, 1.5, inner_col, 0.9)
    # gloss band inside the top margin
    gl = F.sd_box(c.X, c.Y, W / 2, fy0 + 8.5, (x1 - x0) / 2 - 12, 4, 4)
    c.paint(c.cov(gl, 0.8) * np.clip(1 - (c.Y - fy0 - 4) / 10, 0, 1), WHITE, 0.55)
    if selected:
        EA.twinkle(c, x0 + 10, y0 + 9, 7.5)
        EA.twinkle(c, x0 + 20, y0 + 3.5, 3.6)
    return c.image()


NINE = {
    'ui_card': (lambda: card(False), dict(CARD_MARGINS)),
    'ui_card_selected': (lambda: card(True), dict(CARD_MARGINS)),
}
