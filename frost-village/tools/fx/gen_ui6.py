"""
gen_ui6.py - CONTRACT_GEUMBANG §AQ: the 금방 마켓 UI kit `ui6_gb` (the chief's phone app, its icons, tracker, logos,
the mascot 금방이, HUD chip / toast frames, the doorstep photo frame and the doorbell FX), procedurally in the house
"soft toy" style of assets/ui .. ui5 (fxlib.toy: dark tinted outline, top -> bottom gradient lit by a rounded bevel
from the shared upper-left sun, gloss, ONE soft navy drop shadow per icon), in the 금방 brand colours:
gold #F2B33D, goldDark #D9962A, cream #F4EDE0, charcoal #3B3F52, navy #2B4F7E (navy <= 15 % of any sprite).

Text is baked ONLY into ui_gb_logo_ko ("금방", Jua) and ui_gb_logo_en ("Geumbang", Fredoka Bold); every other label is
written by the game.  The mark 금방이 (gold disc, goldDark rim, a face-on cream parcel with navy dot eyes, pink cheeks
and an "o" mouth, a cream 4-point sparkle above) is the same design as assets/geumbang (gb_lib.mark, variant A of
docs/previews/gb_mark_thumbs.png).  Original brand: no rocket, wings, bird, arrow-smile, lightning or cat.

    python3 tools/fx/gen_ui6.py                 # render + atlas + manifest + previews + check
    python3 tools/fx/gen_ui6.py --no-preview    # assets + check only
    python3 tools/fx/gen_ui6.py --preview-only  # previews from the cached frames + the delivered manifest
    python3 tools/fx/gen_ui6.py --check         # check the delivered set (exit 1 on any error)
    python3 tools/fx/gen_ui6.py --look a,b      # scratch sheet of some keys -> <cache>/look_ui6.png
    python3 tools/fx/gen_ui6.py --mock          # phone mock (390 x 844 @3x) of the app -> <cache>/mock_*.png
Outputs
    assets/ui6/ui6_gb.png / .json   one atlas (<= 1024 x 1024, <= 2.5 MiB RGBA): icons / tracker / logos / mascot /
                                    FX trimmed (sourceSize kept); 9-slice frames + the photo frame UNTRIMMED
    assets/ui6/manifest.json        sprites (anchor, frameSize, anims, notes, codeFallback), nineSlice + contentInset,
                                    brand, pagePlan (resident HUD set vs the transient app page)
    docs/previews/ui6_*.png / .gif  icon sheet (96 / 48 / 32 / 24 px on cream, gold, dark and night), tracker, logos,
                                    mascot GIFs, panels, the app at 720 x 1100 logical, brand-safety sheet
Imports fxlib, emote_art, gen_ui3, gen_ui4, gen_ui5 and gen_chief_fx (packer, fonts, night) READ-ONLY.
Cache: $FV_UI6_CACHE (default: /tmp/fv_cache/ui6).  Deterministic.
"""
import argparse
import hashlib
import inspect
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
TOOLS = os.path.dirname(HERE)
for p in (HERE, TOOLS):
    if p not in sys.path:
        sys.path.insert(0, p)
import fxlib as F                                       # noqa: E402
from fxlib import hexc                                  # noqa: E402
import emote_art as EA                                  # noqa: E402
import gen_ui3 as U3                                    # noqa: E402
import gen_ui4 as U4                                    # noqa: E402
import gen_ui5 as U5                                    # noqa: E402
import gen_chief_fx as CF                               # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'ui6')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.environ.get('FV_UI6_CACHE', '/tmp/fv_cache/ui6')
FONT_DIR = os.path.join(TOOLS, 'fonts')
ATLAS = 'ui6_gb'
WHITE = hexc('#FFFFFF')
U = F.union
canvas, shadow, rot = U3.canvas, U3.shadow, U3.rot

# --------------------------------------------------------------------------- brand
BRAND = {'gold': '#F2B33D', 'goldDark': '#D9962A', 'cream': '#F4EDE0', 'charcoal': '#3B3F52', 'navy': '#2B4F7E'}
PINK_CHEEK = '#F2A0A8'
LID = '#E6DBC6'
# soft-toy palettes (top, bottom, outline); the bottom colour is the brand colour, the outline a darker tint of it
# (never black or chocolate brown beside the gold - plan §7.4)
G = ('#FFD887', '#F2B33D', '#94600F')           # gold
GD = ('#F0B54C', '#D9962A', '#86540E')          # goldDark
CR = ('#FFFFFF', '#F4EDE0', '#8F7A5C')          # cream
LIDP = ('#F6EEDF', '#E6DBC6', '#8F7A5C')        # the parcel lid band
NV = ('#6488BC', '#2B4F7E', '#172B4C')          # navy
CH = ('#737A92', '#3B3F52', '#1D2030')          # charcoal
SKY = ('#E8F6FF', '#9CCBF2', '#2C5F9C')         # glass
SNOW = ('#FFFFFF', '#DCE6F2', '#7E93B5')
SKIN = U3.SKIN
GREYP = ('#F2EEE6', '#DCD5C8', '#A39985')       # tracker "off" pieces
INK_GOLD = '#8A5510'                            # dark amber line on gold
DAWN_RIM = '#5B67A6'                            # periwinkle window rim (not the brand navy)
BRACKET = ('#9DBDE6', '#4E78B2', '#22426E')     # follow-icon viewfinder (mid blue, navy outline)
TINT = {'gold': '#C0701A', 'cream': '#B89C70', 'navy': '#18305A', 'char': '#20222E', 'sky': '#2A5FA8',
        'snow': '#7E9CCC', 'grey': '#9A8E78', 'pink': '#B0204E'}


def part(c, d, pal, ow=3.0, bevel=6.0, gloss=0.3, hi=0.5, lo=0.45, tint=None, **kw):
    return U3.part(c, d, pal, ow=ow, bevel=bevel, gloss=gloss, hi=hi, lo=lo, tint=TINT.get(tint, tint), **kw)


def glint(c, x, y, s, edge='#9A6212', tip='#FFE08A', a=1.0):
    EA.twinkle(c, x, y, s, a=a, edge=edge, tip=tip)


def sparkle_sd(c, x, y, r, waist=0.3, X=None, Y=None):
    """Brand 4-point sparkle (concave star), points up / down / left / right."""
    X = c.X if X is None else X
    Y = c.Y if Y is None else Y
    return F.sd_star(X, Y, x, y, r, r * waist, 4, rot=-math.pi / 2, round_=max(0.25, r * 0.06))


# --------------------------------------------------------------------------- the mark 금방이
def mark(c, cx, cy, R, border=True, drop=True, face_scale=1.0, X=None, Y=None):
    """금방이 on canvas c, centred (cx, cy), outer radius R (output px).  Left-right symmetric shapes; the light
    comes from straight above (not the house upper-left sun) so the mark stays its own mirror image."""
    X = c.X if X is None else X
    Y = c.Y if Y is None else Y
    ow = max(1.0, R * 0.042)
    d_out = F.sd_circle(X, Y, cx, cy, R)
    if drop:
        c.shadow(c.cov(d_out), dy=max(1.2, R * 0.05), sigma=max(1.0, R * 0.05), opacity=0.30)
    if border:                                          # cream sticker border
        c.fill(d_out, hexc('#9A6A1E'))
        c.fill(d_out + ow, hexc('#FFFBF3'))
        t = np.clip((Y - (cy - R)) / (2 * R), 0, 1)
        c.paint(c.cov(d_out + ow) * np.clip(t - 0.55, 0, 1) * 1.6, hexc('#E9DFCC'), 0.9)
        r_rim = R * 0.90
    else:
        c.fill(d_out, hexc('#9A6A1E'))
        r_rim = R - ow
    # goldDark rim + gold disc (a shallow dome: lighter top, warmer bottom, a soft symmetric top gloss)
    c.fill(F.sd_circle(X, Y, cx, cy, r_rim), hexc(BRAND['goldDark']))
    t = np.clip((Y - (cy - r_rim)) / (2 * r_rim), 0, 1)
    c.paint(c.cov(F.sd_circle(X, Y, cx, cy, r_rim)) * (t ** 2), hexc('#B97A1C'), 0.55)
    r_disc = r_rim - R * 0.11
    dd = F.sd_circle(X, Y, cx, cy, r_disc)
    t = np.clip((Y - (cy - r_disc)) / (2 * r_disc), 0, 1)
    c.paint(c.cov(dd), F.mix(hexc('#FFCB5E'), hexc('#EEA93A'), t))
    c.paint(c.cov(F.sd_ellipse(X, Y, cx, cy - r_disc * 0.62, r_disc * 0.62, r_disc * 0.26), feather=R * 0.08),
            hexc('#FFE7A8'), 0.55)
    # the parcel (face-on), a little below the centre
    k = face_scale
    pw, ph = R * 0.98 * k, R * 0.80 * k
    pcy = cy + R * 0.16 * k
    py0 = pcy - ph / 2
    box = F.sd_box(X, Y, cx, pcy, pw / 2, ph / 2, R * 0.12 * k)
    c.fill(box - max(0.7, R * 0.03), hexc('#9A6A1E'), 0.9)
    tb = np.clip((Y - py0) / ph, 0, 1)
    c.paint(c.cov(box), F.mix(hexc('#FFFDF8'), hexc('#F1E8D6'), tb))
    lid = F.intersect(box, Y - (py0 + ph * 0.24))
    c.paint(c.cov(lid), hexc(LID))
    c.fill(F.intersect(np.abs(Y - (py0 + ph * 0.24)) - max(0.35, R * 0.012), box + 0.3), hexc('#C9B793'), 0.9)
    # face
    ey = py0 + ph * 0.54
    er = R * 0.078 * k
    for sx in (-1, 1):
        ex = cx + sx * pw * 0.21
        c.fill(F.sd_circle(X, Y, ex, ey, er), hexc(BRAND['navy']))
        if R >= 16:
            c.fill(F.sd_circle(X, Y, ex - er * 0.3, ey - er * 0.35, er * 0.33), WHITE, 0.95)
        c.fill(F.sd_ellipse(X, Y, cx + sx * pw * 0.34, ey + R * 0.13 * k, R * 0.088 * k, R * 0.06 * k),
               hexc(PINK_CHEEK), 0.95, feather=R * 0.01)
    my = ey + R * 0.17 * k
    mr = R * 0.068 * k
    c.fill(F.sd_circle(X, Y, cx, my, mr), hexc(BRAND['navy']))
    c.fill(F.sd_circle(X, Y, cx, my, mr * 0.45), hexc('#F6C9C9'))
    # the sparkle above the parcel
    sy = py0 - R * 0.21 * k
    sr = R * 0.25 * k
    sd = sparkle_sd(c, cx, sy, sr, 0.3, X, Y)
    c.fill(sd - max(0.6, R * 0.025), hexc('#B97A1C'), 0.9)
    c.fill(sd, hexc('#FFF8EA'))
    return d_out


# --------------------------------------------------------------------------- text (logos only)
TEXT_USED = set()            # keys whose draw function rendered text (the check: only the listed logo keys)
_CURRENT = [None]


def text_cov(c, txt, font_file, size, x, y, anchor='lm'):
    """Anti-aliased text coverage on canvas c's grid, text box placed at (x, y) output px with anchor
    'lm' (left-middle) or 'mm'.  Records that the current key baked text."""
    TEXT_USED.add(_CURRENT[0])
    ss = c.ss
    f = ImageFont.truetype(os.path.join(FONT_DIR, font_file), int(round(size * ss)))
    l, t, r, b = f.getbbox(txt)
    H, W = c.a.shape
    im = Image.new('L', (W, H), 0)
    tw, th = r - l, b - t
    ox = x * ss - (tw / 2 if anchor[0] == 'm' else 0) - l
    oy = y * ss - th / 2 - t
    ImageDraw.Draw(im).text((ox, oy), txt, font=f, fill=255)
    return np.asarray(im).astype(np.float32) / 255.0, (tw / ss, th / ss)


def lettering(c, cov, fill_top='#5A86C4', fill_bot=BRAND['navy'], rim='#FFFBF3', rim_w=3.2, drop=0.32):
    """Chunky brand lettering: soft drop shadow, a cream rim (reads on gold, cream and dark), navy letters with a
    gentle top-light gradient and a bevel highlight along their upper edges."""
    ss = c.ss
    rimc = np.clip(F.blur(cov, rim_w * 0.55 * ss) * 3.2, 0, 1)
    rimc = np.maximum(rimc, cov)
    c.shadow(rimc, dy=2.2, sigma=1.6, opacity=drop)
    c.paint(np.clip(F.blur(rimc, 0.5 * ss) * 1.6, 0, 1), hexc('#B98A3E'), 0.85)        # thin amber line round the rim
    c.paint(rimc, hexc(rim))
    ys = c.Y[cov > 0.5]
    y0, y1 = (float(ys.min()), float(ys.max())) if ys.size else (0, 1)
    t = np.clip((c.Y - y0) / max(1e-3, y1 - y0), 0, 1)
    c.paint(cov, F.mix(hexc(fill_top), hexc(fill_bot), t ** 1.6))
    hl = np.clip(cov - F.shift(cov, 0, 1.4 * ss), 0, 1) * cov
    c.paint(hl, hexc('#9DB8DE'), 0.75)
    lo = np.clip(cov - F.shift(cov, 0, -1.2 * ss), 0, 1) * cov
    c.paint(lo, hexc('#16294A'), 0.5)


def logo(lang):
    """ui_gb_logo_ko (192 x 72 <= 256 x 96): mark + "금방" (Jua);  ui_gb_logo_en (250 x 72 <= 320 x 96): mark +
    "Geumbang" (Fredoka).  72 px tall = the header's logo height, so the game draws them 1:1 (crisp)."""
    if lang == 'ko':
        W, H = 192, 72
        c = F.Canvas(W, H)
        mark(c, 36, 36, 30.5)
        cov, (tw, th) = text_cov(c, '금방', 'Jua-Regular.ttf', 56, 74, 38)
        lettering(c, cov, rim_w=3.3)
        glint(c, 74 + tw + 9, 13, 6.0)
    else:
        W, H = 250, 72
        c = F.Canvas(W, H)
        mark(c, 36, 36, 30.5)
        cov, (tw, th) = text_cov(c, 'Geumbang', 'Fredoka-Bold.ttf', 34, 72, 37)
        lettering(c, cov, rim_w=3.1)
        glint(c, 72 + tw - 6, 11, 5.0)
    return c.image()


def logo_mark():
    """ui_gb_mark 128 x 128: the mark alone (app splash, the 금방 letter, the office row)."""
    c = F.Canvas(128, 128)
    mark(c, 64, 62, 52)
    return c.image()


# --------------------------------------------------------------------------- mascot 금방이 (128 x 128, anchor 0.5, 0.9)
MASCOT_FOOT_Y = 115.2
MASCOT_SCALE = 0.78


def mascot(pose, f):
    """The mark's parcel on stubby legs with a navy scarf under its chin (UI only, never mirrored).
    pose 'idle' (2 f: stands and waves), 'run' (4 f: runs to the right, scarf flying), 'bow' (2 f: a polite bow)."""
    c = F.Canvas(128, 128)
    fy = MASCOT_FOOT_Y
    k_ = MASCOT_SCALE                         # draw a little inside the frame (page budget); feet stay on the anchor
    c.X = 64 + (c.X - 64) / k_
    c.Y = fy + (c.Y - fy) / k_
    bw, bh = 56.0, 54.0                       # parcel body (front face)
    lean, bob, hipx = 0.0, 0.0, 64.0
    legs = [(-1, 0.0, 0.0), (1, 0.0, 0.0)]    # (side, forward offset px, lift px)
    arm = {'l': 8.0, 'r': -8.0}               # arm swing angles (deg, 0 = down, + = forward / up)
    scarf_ph, fly = 0.0, 0.35
    eyes, mouth = 'dot', 'o'
    tip = 0.0
    if pose == 'idle':
        bob = (0.0, 1.2)[f]
        arm = {'l': 6.0, 'r': (150.0, 126.0)[f]}
        mouth = 'smile'
        scarf_ph = f * 0.5
    elif pose == 'run':
        ph = f / 4.0
        s = math.sin(ph * 2 * math.pi)
        lean = 8.0
        bob = -abs(math.cos(ph * 2 * math.pi)) * 3.5 + 1.0
        legs = [(-1, 9.0 * s, max(0.0, -s) * 7.0), (1, -9.0 * s, max(0.0, s) * 7.0)]
        arm = {'l': -45.0 * s, 'r': 45.0 * s}
        scarf_ph, fly = ph, 1.0
        hipx = 62.0
    elif pose == 'bow':                      # a face-on bow: the box tips toward us (more lid, face lower)
        tip = (0.45, 1.0)[f]
        bob = (1.0, 2.5)[f]
        arm = {'l': 38.0, 'r': -38.0}        # mittens folded in front
        eyes, mouth = 'happy', 'smile'
        scarf_ph, fly = 0.25 + f * 0.25, 0.3
    hipy = fy - 12.0 + bob
    # body frame: rotate the sample grid about the hip so the parcel leans forward (to the right)
    X, Y = F.rot(c.X, c.Y, hipx, hipy, math.radians(lean))      # + = the top leans forward (to the right)
    bh = bh * (1 - 0.12 * tip)                # tipping toward us foreshortens the front
    bcx, bcy = hipx, hipy - bh / 2 - 1.0
    top = bcy - bh / 2
    body = F.sd_box(X, Y, bcx, bcy, bw / 2, bh / 2, 9.0)
    scarf_y = bcy + bh * 0.25 + 2.5 * tip     # under the chin
    # --- legs (charcoal trousers, gold boots), drawn first
    leg_d, boot_d = None, None
    for side, fwd, lift in legs:
        lx = hipx + side * 10.5 + fwd
        footy = fy - 3.0 - lift
        seg = F.sd_segment(c.X, c.Y, hipx + side * 10.5, hipy - 4.0, lx, footy - 3.0, 5.6)
        boot = F.sd_box(c.X, c.Y, lx + 3.0, footy, 8.0, 4.6, 4.2)
        leg_d = seg if leg_d is None else np.minimum(leg_d, seg)
        boot_d = boot if boot_d is None else np.minimum(boot_d, boot)
    # --- scarf tails (behind the body, flying out to the left from the knot)
    tails = None
    kx, ky = bcx - bw / 2 + 5.0, scarf_y + 1.0
    for k, (len_, w_) in enumerate(((27.0, 5.6), (21.0, 4.8))):
        pts = []
        for i in range(8):
            u = i / 7.0
            wave = math.sin((u * 1.5 - scarf_ph + k * 0.35) * 2 * math.pi) * (1.0 + 3.5 * u) * (0.5 + 0.5 * fly)
            droop = (1.0 - fly) * u * u * 18.0
            pts.append((kx - u * len_ * (0.55 + 0.45 * fly), ky + k * 4.5 + wave + droop + u * (2.0 + k * 3.0)))
        seg = F.sd_polyline(X, Y, pts, w_ * 0.5)
        tails = seg if tails is None else np.minimum(tails, seg)
    def arm_sd(side, ang):
        """A stubby arm from the shoulder on `side`: ang 0 = hanging down, + = swung forward (to the right) / up."""
        sx = bcx + side * (bw / 2 - 1.5)
        sy = bcy + 2.0
        th = math.radians(ang)
        ex, ey = sx + side * 3.0 + math.sin(th) * 12.5, sy + math.cos(th) * 12.5
        return np.minimum(F.sd_segment(X, Y, sx, sy, ex, ey, 4.2), F.sd_circle(X, Y, ex, ey, 5.4))
    arm_l, arm_r = arm_sd(-1, arm['l']), arm_sd(1, arm['r'])
    shadow_d = U(body, leg_d, boot_d, tails, arm_l, arm_r)
    # contact shadow on the ground (a soft ellipse) + one soft drop shadow
    c.fill(F.sd_ellipse(c.X, c.Y, 64, fy + 1.5, 26, 4.5), hexc('#1B2840'), 0.22, feather=3.0)
    c.shadow(c.cov(shadow_d - 2.0), dy=2.0, sigma=1.8, opacity=0.25)
    part(c, tails, NV, ow=2.0, bevel=2.0, gloss=0.15, tint='navy')
    part(c, leg_d, CH, ow=2.0, bevel=3.0, gloss=0.15, tint='char')
    part(c, boot_d, G, ow=2.0, bevel=3.0, gloss=0.35, tint='gold')
    if pose != 'bow':
        part(c, arm_l, CR, ow=2.0, bevel=2.5, gloss=0.2, tint='cream')
    # --- the parcel body: cream, rounded, lit from the upper left
    c.fill(body - 2.2, hexc('#8F7A5C'))
    tb = np.clip((Y - top) / bh, 0, 1)
    n = F.bevel_normals(body, 7.0, c.px)
    col = F.shade(F.mix(hexc('#FFFEFA'), hexc('#EEE3CD'), tb), F.lambert(n), 0.45, 0.35, hexc('#C8AE84'))
    c.paint(c.cov(body), col)
    lid_y = top + bh * (0.22 + 0.2 * tip)
    lid = F.intersect(body, Y - lid_y)
    c.paint(c.cov(lid), F.mix(hexc('#EFE6D4'), hexc(LID), np.clip((Y - top) / (lid_y - top), 0, 1)), 0.97)
    c.fill(F.intersect(np.abs(Y - lid_y) - 0.6, body + 0.5), hexc('#BFA982'), 0.9)
    tape = F.intersect(F.sd_box(X, Y, bcx, (top + lid_y) / 2, 5.0, (lid_y - top) / 2 + 1.0, 0.5), body + 0.2)
    part(c, tape, G, ow=0, bevel=1.2, gloss=0.3, tint='gold')
    EA.glossy_spot(c, bcx - bw * 0.30, top + bh * 0.36, 4.5, 2.0, -30, 0.45, 1.2)
    # face
    ey = bcy - 2.0 + 7.0 * tip
    for sx in (-1, 1):
        ex = bcx + sx * 11.0
        if eyes == 'dot':
            c.fill(F.sd_ellipse(X, Y, ex, ey, 3.6, 4.3), hexc(BRAND['navy']))
            c.fill(F.sd_circle(X, Y, ex - 1.1, ey - 1.6, 1.3), WHITE)
        else:
            c.fill(F.sd_arc(X, Y, ex, ey + 2.4, 4.0, math.radians(200), math.radians(340), 1.3), hexc(BRAND['navy']))
        c.fill(F.sd_ellipse(X, Y, bcx + sx * 18.5, ey + 6.0, 4.6, 2.9), hexc(PINK_CHEEK), 0.95, feather=0.8)
    my = ey + 8.0
    if mouth == 'o':
        c.fill(F.sd_ellipse(X, Y, bcx, my, 3.2, 3.6), hexc(BRAND['navy']))
        c.fill(F.sd_ellipse(X, Y, bcx, my + 0.6, 1.6, 1.9), hexc('#F28C9A'))
    else:
        c.fill(F.sd_arc(X, Y, bcx, my - 2.8, 4.2, math.radians(25), math.radians(155), 1.25), hexc(BRAND['navy']))
    # the scarf: a soft navy band round the box under the chin, knot on its left (the side it runs away from)
    band = F.intersect(F.sd_box(X, Y, bcx, scarf_y, bw / 2 + 1.5, 4.2, 2.0), body - 2.2)
    knot = F.sd_ellipse(X, Y, kx, ky, 5.0, 4.6)
    part(c, U(band, knot), NV, ow=1.6, bevel=2.0, gloss=0.3, tint='navy')
    for k in range(3):                                      # knitted ribs
        c.fill(F.intersect(F.sd_segment(X, Y, bcx - 14 + k * 14, scarf_y - 3.2, bcx - 14 + k * 14, scarf_y + 3.2, 0.5),
                           band + 0.8), hexc('#5F86BD'), 0.6)
    if pose == 'bow':
        part(c, arm_l, CR, ow=2.0, bevel=2.5, gloss=0.2, tint='cream')
    part(c, arm_r, CR, ow=2.0, bevel=2.5, gloss=0.2, tint='cream')
    if pose == 'run':                                       # two little snow puffs kicked up behind
        for dx, dy, r in ((-26, -2, 4.0), (-33, -6, 2.8)):
            x_ = 64 + dx - f * 2
            c.fill(F.sd_circle(c.X, c.Y, x_, fy + dy, r), hexc('#FFFFFF'), 0.95)
            c.fill(np.abs(F.sd_circle(c.X, c.Y, x_, fy + dy, r)) - 0.5, hexc('#9FB2CE'), 0.8)
    if pose == 'idle' and f == 1:
        glint(c, 101, 30, 6.0)
    return c.image()


# --------------------------------------------------------------------------- small shared pieces
ICON_K = 0.94          # all icons drawn a touch inside their 96 px frame (the AQ page budget is tight)


def icanvas(scale):
    return canvas(scale * ICON_K)


def parcel(c, x, y, w, h, X=None, Y=None, tape=True, face=False, ow=2.0, pal=CR):
    """A cream 금방 parcel seen face-on: lid band, gold tape strip down the lid, optional little face."""
    X = c.X if X is None else X
    Y = c.Y if Y is None else Y
    d = F.sd_box(X, Y, x, y, w / 2, h / 2, max(1.5, min(w, h) * 0.14))
    part(c, d, pal, ow=ow, bevel=max(2.0, min(w, h) * 0.2), gloss=0.25, tint='cream')
    ly = y - h / 2 + h * 0.3
    c.paint(c.cov(F.intersect(d, Y - ly)), hexc(LID), 0.95)
    c.fill(F.intersect(np.abs(Y - ly) - 0.45, d + 0.4), hexc('#BFA982'), 0.9)
    if tape:
        t = F.intersect(F.sd_box(X, Y, x, y - h / 2 + h * 0.15, max(1.4, w * 0.11), h * 0.16, 0.3), d + 0.2)
        part(c, t, G, ow=0, bevel=1.0, gloss=0.3, tint='gold')
    if face:
        ey = y + h * 0.12
        for s in (-1, 1):
            c.fill(F.sd_circle(X, Y, x + s * w * 0.2, ey, max(0.9, w * 0.06)), hexc(BRAND['navy']))
            c.fill(F.sd_ellipse(X, Y, x + s * w * 0.33, ey + h * 0.13, w * 0.07, h * 0.05), hexc(PINK_CHEEK), 0.9)
        c.fill(F.sd_circle(X, Y, x, ey + h * 0.17, max(0.8, w * 0.05)), hexc(BRAND['navy']))
    return d


def mini_sparkle(c, x, y, r, col='#FFF8EA', edge='#B97A1C'):
    sd = sparkle_sd(c, x, y, r)
    c.fill(sd - 0.7, hexc(edge), 0.9)
    c.fill(sd, hexc(col))


# --------------------------------------------------------------------------- icons (96 x 96, no text)
def icon_gb():
    """ui_icon_gb: the mark 금방이 (HUD chip, office row, letters)."""
    c = icanvas(1.0)
    mark(c, 48, 47, 43)
    return c.image()


def icon_order():
    """주문: an order slip with a gold header band, three lines and a round gold check seal."""
    c = icanvas(0.92)
    X, Y = rot(c, 48, 48, -6)
    p = 7.0
    tri = np.abs(((X - 21) / p) % 1.0 * 2 - 1)
    slip = F.intersect(F.sd_box(X, Y, 46, 44, 25, 36, 4.5), Y - (73 + 4.5 * tri))
    seal = F.sd_circle(c.X, c.Y, 66, 66, 13)
    shadow(c, U(slip, seal), ow=2.4)
    part(c, slip, CR, ow=2.6, bevel=4, gloss=0.2, tint='cream')
    band = F.intersect(slip + 0.2, Y - 25)
    part(c, band, G, ow=0, bevel=2.5, gloss=0.35, tint='gold')
    c.fill(F.intersect(np.abs(Y - 25) - 0.6, slip), hexc(INK_GOLD), 0.7)
    mini_sparkle(c, 34, 16.5, 5.5)
    for i, (yy, ln) in enumerate(((36, 30), (46, 26), (56, 16))):
        c.fill(F.sd_segment(X, Y, 30, yy, 30 + ln, yy, 2.2), hexc('#8796B0'))
    part(c, seal, G, ow=2.4, bevel=4, gloss=0.35, tint='gold')
    c.fill(F.sd_polyline(c.X, c.Y, [(59.5, 66.5), (64.5, 71.5), (73, 61)], 2.4), hexc('#FFF8EA'))
    return c.image()


def van_body(c, X, Y, x0=6.0, s=1.0, mark_r=10.5, snow=True, wheels=True, pal=G, belt=True, mark_on=True):
    """Side view of the 금방 van facing right (x0 = rear edge).  Returns the silhouette sd."""
    def P(px, py):
        return x0 + px * s, py
    cargo = F.sd_box(X, Y, x0 + 32 * s, 49, 32 * s, 21, 7 * s)
    cab = F.sd_polygon(X, Y, [P(56, 28), P(74, 28), P(88, 46), P(90, 70), P(56, 70)]) - 4 * s
    body = F.smin(cargo, cab, 3.0)
    wl = [(x0 + 18 * s, 72), (x0 + 72 * s, 72)]
    wd = U(*[F.sd_circle(X, Y, wx, wy, 9.5 * s) for wx, wy in wl])
    sil = U(body, wd)
    part(c, body, pal, ow=2.6, bevel=6, gloss=0.3, tint='gold')
    roof = F.intersect(body + 0.1, Y - 37)
    part(c, roof, CR, ow=0, bevel=3, gloss=0.3, tint='cream')
    c.fill(F.intersect(np.abs(Y - 37) - 0.6, body), hexc('#B98A3E'), 0.8)
    if belt:
        c.fill(F.intersect(np.abs(Y - 60) - 1.5, body + 1.2), hexc(BRAND['navy']), 0.95)
    glass = F.sd_polygon(X, Y, [P(62, 40), P(75, 40), P(84, 52), P(62, 52)]) - 1.5
    part(c, glass, SKY, ow=1.6, bevel=2, gloss=0.5, tint='sky')
    c.fill(F.sd_box(X, Y, x0 + 87 * s, 63, 2.6, 2.4, 1.2), hexc('#FFF2B8'))
    c.fill(np.abs(F.sd_box(X, Y, x0 + 87 * s, 63, 2.6, 2.4, 1.2)) - 0.5, hexc(INK_GOLD), 0.8)
    if mark_on:
        mark(c, x0 + 30 * s, 52, mark_r * s, drop=False, X=X, Y=Y)
    if snow:
        U5.snow_cap(c, x0 + 4 * s, x0 + 72 * s, 27.5, 3.2,
                    lumps=((x0 + 16 * s, 25.5, 4.0), (x0 + 40 * s, 25.0, 4.5), (x0 + 60 * s, 26.0, 3.5)))
    if wheels:
        for wx, wy in wl:
            U5.wheel(c, wx, wy, 9.5 * s)
            c.fill(F.sd_circle(X, Y, wx, wy, 2.4 * s), hexc(BRAND['gold']))
    return sil


def icon_van():
    """금방 밴: the honey-gold van in profile, cream roof band under snow, navy belt line, the mark on its side."""
    c = icanvas(0.94)
    x0, s = 5.0, 0.95
    cargo = F.sd_box(c.X, c.Y, x0 + 32 * s, 49, 32 * s, 21, 7 * s)
    cab = F.sd_polygon(c.X, c.Y, [(x0 + 56 * s, 28), (x0 + 74 * s, 28), (x0 + 88 * s, 46), (x0 + 90 * s, 70),
                                  (x0 + 56 * s, 70)]) - 4 * s
    sil = U(cargo, cab, F.sd_circle(c.X, c.Y, x0 + 18 * s, 72, 9.5 * s), F.sd_circle(c.X, c.Y, x0 + 72 * s, 72, 9.5 * s))
    shadow(c, sil, ow=2.4)
    van_body(c, c.X, c.Y, x0=x0, s=s)
    return c.image()


def husky_head(c, x, y, s=1.0):
    """A friendly husky head in profile looking right: grey cap and ear, white muzzle and cheek, charcoal nose,
    a pink tongue - unmistakably a dog (long muzzle), never a cat."""
    skull = F.sd_ellipse(c.X, c.Y, x, y, 11 * s, 10 * s)
    muzzle = F.sd_box(*F.rot(c.X, c.Y, x + 12 * s, y + 4 * s, math.radians(8)), x + 12 * s, y + 4 * s, 9 * s, 5.5 * s,
                      5 * s)
    ear = F.sd_polygon(c.X, c.Y, [(x - 6 * s, y - 6 * s), (x - 1 * s, y - 19 * s), (x + 4 * s, y - 7 * s)]) - 1.2 * s
    head = F.smin(skull, muzzle, 3 * s)
    part(c, ear, ('#C9D2E0', '#7D8AA2', '#2C3446'), ow=1.8, bevel=2, gloss=0.1, tint='#3E4A62')
    c.fill(F.sd_polygon(c.X, c.Y, [(x - 3.5 * s, y - 8 * s), (x - 1 * s, y - 15 * s), (x + 1.5 * s, y - 8 * s)]),
           hexc('#F2C9CF'), 0.9)
    part(c, head, ('#FFFFFF', '#E3E8F0', '#2C3446'), ow=1.8, bevel=3.5, gloss=0.25, tint='#5A6A88')
    cap = F.intersect(head + 0.3, F.smin(F.sd_ellipse(c.X, c.Y, x - 3 * s, y - 6 * s, 12 * s, 7.5 * s),
                                           F.sd_ellipse(c.X, c.Y, x - 9 * s, y + 2 * s, 5 * s, 9 * s), 3 * s))
    c.paint(c.cov(cap), hexc('#8994AC'))
    c.fill(F.sd_circle(c.X, c.Y, x + 2 * s, y - 2.5 * s, 2.1 * s), hexc('#2E4E7E'))
    c.fill(F.sd_circle(c.X, c.Y, x + 1.4 * s, y - 3.2 * s, 0.75 * s), WHITE)
    c.fill(F.sd_ellipse(c.X, c.Y, x + 20.5 * s, y + 3 * s, 2.6 * s, 2.2 * s), hexc(BRAND['charcoal']))
    c.fill(F.sd_ellipse(c.X, c.Y, x + 15 * s, y + 10.5 * s, 2.6 * s, 3.4 * s), hexc('#F28C9A'))
    c.fill(F.sd_arc(c.X, c.Y, x + 15 * s, y + 6 * s, 3.6 * s, math.radians(20), math.radians(150), 0.6 * s),
           hexc('#2C3446'), 0.8)
    return head


def icon_sled():
    """금방 개썰매: a husky pulls a little birch sled with a 금방 parcel and the gold pennant (mark only)."""
    c = icanvas(0.93)
    runner = F.sd_polyline(c.X, c.Y, [(6, 80), (44, 80), (50, 77), (52, 71)], 1.8)
    bed = F.sd_box(c.X, c.Y, 26, 71, 20, 4, 2)
    pole = F.sd_segment(c.X, c.Y, 9, 69, 9, 24, 1.5)
    flag = F.sd_polygon(c.X, c.Y, [(10, 23), (31, 30), (10, 38)]) - 1.0
    fur = ('#FFFFFF', '#DCE2EC', '#2C3446')
    dog_body = F.sd_box(c.X, c.Y, 66, 63, 14, 9, 8.5)
    legs = U(*[F.sd_box(c.X, c.Y, lx, 74, 3.4, 7.5, 3.2) for lx in (56, 63, 71, 78)])
    tail = F.sd_arc(c.X, c.Y, 52.5, 54, 6.0, math.radians(100), math.radians(300), 3.0)
    sil = U(runner, bed, pole, flag, dog_body, legs, tail, F.sd_circle(c.X, c.Y, 77, 45, 13))
    shadow(c, sil, ow=2.0)
    part(c, runner, CH, ow=1.2, bevel=1.2, gloss=0.2, tint='char')
    for sx in (14, 38):
        c.fill(F.sd_segment(c.X, c.Y, sx, 74, sx, 80, 1.2), hexc(BRAND['charcoal']))
    part(c, bed, ('#FFF6E4', '#EAD3AA', '#8F7A5C'), ow=1.8, bevel=2, gloss=0.2, tint='cream')
    parcel(c, 26, 58, 22, 18, ow=1.8)
    part(c, pole, CH, ow=0.8, bevel=1, gloss=0.2, tint='char')
    part(c, flag, G, ow=1.6, bevel=2, gloss=0.35, tint='gold')
    mini_sparkle(c, 17, 30.5, 4.0)
    c.fill(F.sd_circle(c.X, c.Y, 9, 23, 2.4), hexc(BRAND['gold']))
    c.fill(F.sd_segment(c.X, c.Y, 48, 69, 55, 63, 1.1), hexc(BRAND['goldDark']))          # the harness line
    part(c, legs, fur, ow=1.6, bevel=1.5, gloss=0.1, tint='#5A6A88')
    for lx in (56, 63, 71, 78):
        c.fill(F.sd_ellipse(c.X, c.Y, lx, 80.5, 3.8, 1.8), hexc('#C9D2E0'))
    part(c, tail, fur, ow=1.6, bevel=2, gloss=0.2, tint='#5A6A88')
    part(c, dog_body, fur, ow=1.8, bevel=4, gloss=0.25, tint='#5A6A88')
    c.paint(c.cov(F.intersect(dog_body + 0.3, F.sd_ellipse(c.X, c.Y, 64, 55.5, 15, 6.5))), hexc('#8994AC'))
    harness = F.intersect(np.abs(F.sd_box(c.X, c.Y, 71, 63, 3, 10, 1)) - 1.4, dog_body)
    c.fill(harness, hexc(BRAND['gold']))
    husky_head(c, 75.5, 45, 1.05)
    return c.image()


def icon_locker():
    """금방 보관함: a gold locker with blue doors under a snow cap, a little mark screen on top, one door open
    with a parcel inside."""
    c = icanvas(0.92)
    cab = F.sd_box(c.X, c.Y, 46, 53, 30, 34, 5)
    door_open = F.sd_polygon(c.X, c.Y, [(74, 55), (86, 51), (86, 66), (74, 70)]) - 0.8
    shadow(c, U(cab, door_open), ow=2.4)
    part(c, cab, G, ow=2.6, bevel=5, gloss=0.3, tint='gold')
    scr = F.sd_box(c.X, c.Y, 46, 28, 16, 6, 2.5)
    part(c, scr, CR, ow=1.6, bevel=1.5, gloss=0.4, tint='cream')
    mark(c, 46, 28, 5.2, border=False, drop=False)
    DOOR = ('#A9C6EC', '#5F86BD', '#203E66')
    for r_, yy in enumerate((44, 59, 74)):
        for cc, xx in enumerate((33, 59)):
            d = F.sd_box(c.X, c.Y, xx, yy, 11, 6.2, 1.8)
            if (r_, cc) == (1, 1):
                c.fill(d, hexc('#5A4A36'))
                c.fill(d + 1.0, hexc('#F3E9D6'))
                parcel(c, xx, yy + 1.2, 13, 9, ow=1.2)
                continue
            part(c, d, DOOR, ow=1.6, bevel=1.8, gloss=0.25, tint='navy')
            c.fill(F.sd_circle(c.X, c.Y, xx + 7, yy, 1.4), hexc(BRAND['gold']))
    part(c, door_open, DOOR, ow=1.6, bevel=1.4, gloss=0.2, tint='navy')
    U5.snow_cap(c, 16, 76, 20, 3.4, lumps=((28, 17.5, 4.2), (50, 17.0, 4.8), (68, 18.0, 3.8)))
    return c.image()


def icon_deal():
    """특가: a gold price tag with a big cream star, on its string, with sparkles."""
    c = icanvas(0.92)
    X, Y = rot(c, 50, 50, -32)
    tag = F.sd_polygon(X, Y, [(14, 50), (30, 31), (84, 31), (84, 69), (30, 69)]) - 3.0
    hole = F.sd_circle(X, Y, 28, 50, 4.2)
    tag = F.subtract(tag, hole)
    string = F.sd_polyline(c.X, c.Y, [(25, 62), (16, 70), (10, 66), (12, 58)], 1.3)
    shadow(c, U(tag, string), ow=2.4)
    part(c, string, NV, ow=0, bevel=0.8, gloss=0.1, tint='navy')
    part(c, tag, G, ow=2.6, bevel=5, gloss=0.35, tint='gold')
    c.fill(np.abs(F.sd_circle(X, Y, 28, 50, 4.2)) - 1.0, hexc(INK_GOLD), 0.9)
    st = F.sd_star(X, Y, 58, 50, 15, 6.6, 5, rot=-math.pi / 2, round_=1.6)
    part(c, st, CR, ow=1.8, bevel=3, gloss=0.4, tint='cream')
    glint(c, 80, 18, 9.0)
    glint(c, 84, 76, 5.0)
    return c.image()


def icon_review():
    """후기: a cream speech bubble holding a big gold star, a little pink heart."""
    c = icanvas(0.92)
    bub = F.smin(F.sd_box(c.X, c.Y, 46, 44, 34, 26, 15),
                 F.sd_polygon(c.X, c.Y, [(22, 62), (36, 66), (18, 82)]) - 1.5, 3.0)
    heart = F.sd_heart(c.X, c.Y, 78, 22, 8.5)
    shadow(c, U(bub, heart), ow=2.4)
    part(c, bub, CR, ow=2.6, bevel=5, gloss=0.3, tint='cream')
    st = F.sd_star(c.X, c.Y, 46, 45, 19, 8.4, 5, rot=-math.pi / 2, round_=2.0)
    part(c, st, G, ow=2.2, bevel=4, gloss=0.4, tint='gold')
    part(c, heart, ('#FFC2CE', '#F07A92', '#8E2450'), ow=2.0, bevel=3, gloss=0.35, tint='pink')
    return c.image()


def icon_today():
    """오늘: a little desk calendar (gold binding, navy rings) with a smiling sun on its page."""
    c = icanvas(0.92)
    page = F.sd_box(c.X, c.Y, 48, 54, 32, 30, 7)
    shadow(c, page, ow=2.4)
    part(c, page, CR, ow=2.6, bevel=4, gloss=0.2, tint='cream')
    band = F.intersect(page + 0.2, Y_lt(c, 38))
    part(c, band, G, ow=0, bevel=3, gloss=0.35, tint='gold')
    c.fill(F.intersect(np.abs(c.Y - 38) - 0.6, page), hexc(INK_GOLD), 0.7)
    for rx in (34, 62):
        ring = F.sd_box(c.X, c.Y, rx, 25, 3.2, 7, 3)
        part(c, ring, NV, ow=1.4, bevel=1.5, gloss=0.4, tint='navy')
    rays = None
    for k in range(8):
        a = k * math.pi / 4
        seg = F.sd_segment(c.X, c.Y, 48 + math.cos(a) * 14, 62 + math.sin(a) * 14,
                           48 + math.cos(a) * 19, 62 + math.sin(a) * 19, 2.2)
        rays = seg if rays is None else np.minimum(rays, seg)
    part(c, rays, G, ow=1.4, bevel=1.2, gloss=0.2, tint='gold')
    sun = F.sd_circle(c.X, c.Y, 48, 62, 11.5)
    part(c, sun, ('#FFE9A8', '#F7B733', '#94600F'), ow=1.8, bevel=4, gloss=0.4, tint='gold')
    for s in (-1, 1):
        c.fill(F.sd_circle(c.X, c.Y, 48 + s * 4.2, 60.5, 1.5), hexc(BRAND['navy']))
        c.fill(F.sd_ellipse(c.X, c.Y, 48 + s * 7, 64.5, 2.2, 1.4), hexc(PINK_CHEEK), 0.9)
    c.fill(F.sd_arc(c.X, c.Y, 48, 62.5, 3.2, math.radians(25), math.radians(155), 0.8), hexc(BRAND['navy']))
    return c.image()


def Y_lt(c, y):
    """sd of the half plane above y (negative where c.Y < y)."""
    return c.Y - y


def icon_catalog():
    """상품: a 2 x 2 grid of product tiles - bread, a fish, a jam jar and a ball of yarn."""
    c = icanvas(0.93)
    tiles = [(30, 30), (66, 30), (30, 66), (66, 66)]
    ds = [F.sd_box(c.X, c.Y, x, y, 16, 16, 6) for x, y in tiles]
    shadow(c, U(*ds), ow=2.2)
    for d in ds:
        part(c, d, CR, ow=2.2, bevel=3, gloss=0.25, tint='cream')
    for (x, y) in tiles:
        c.fill(F.intersect(F.sd_box(c.X, c.Y, x, y, 16, 16, 6) + 1.6, c.Y - (y + 9)), hexc('#F2E3C4'), 0.8)
    # bread loaf
    bx, by = tiles[0]
    loaf = F.smin(F.sd_ellipse(c.X, c.Y, bx, by + 1, 11, 7.5), F.sd_box(c.X, c.Y, bx, by + 4, 11, 4, 2), 2)
    part(c, loaf, ('#FFE0A0', '#E8A85A', '#8A5A2A'), ow=1.6, bevel=3, gloss=0.35, tint='#A85A1A')
    for k in (-5, 0, 5):
        c.fill(F.sd_segment(c.X, c.Y, bx + k - 1.5, by - 3, bx + k + 1.5, by + 1, 0.9), hexc('#FFF4D8'), 0.9)
    # fish
    fx, fy = tiles[1]
    fish = F.smin(F.sd_ellipse(c.X, c.Y, fx - 2, fy, 9.5, 5.5),
                  F.sd_polygon(c.X, c.Y, [(fx + 5, fy), (fx + 12, fy - 6), (fx + 12, fy + 6)]) - 0.8, 1.5)
    part(c, fish, ('#D8F0FF', '#7FB8F0', '#1F4F8E'), ow=1.6, bevel=2.5, gloss=0.4, tint='sky')
    c.fill(F.sd_circle(c.X, c.Y, fx - 7, fy - 1.5, 1.3), hexc(BRAND['navy']))
    # jam jar (pink lid)
    jx, jy = tiles[2]
    jar = F.sd_box(c.X, c.Y, jx, jy + 2, 8, 8.5, 3)
    lid = F.sd_box(c.X, c.Y, jx, jy - 7.5, 8.5, 2.6, 1.2)
    part(c, jar, ('#FFD6E2', '#F07A9A', '#8E2450'), ow=1.6, bevel=2.5, gloss=0.45, tint='pink')
    c.fill(F.sd_box(c.X, c.Y, jx, jy + 3, 5.5, 3.5, 1.2), hexc('#FFF8EA'), 0.95)
    part(c, lid, ('#FFE8EE', '#F2A0B8', '#8E2450'), ow=1.4, bevel=1.2, gloss=0.3, tint='pink')
    # yarn ball (lavender)
    yx, yy = tiles[3]
    ball = F.sd_circle(c.X, c.Y, yx, yy, 9.5)
    part(c, ball, ('#EADDFF', '#A68AE0', '#4A2E7E'), ow=1.6, bevel=3.5, gloss=0.3, tint='#5A30B0')
    for k in range(3):
        c.fill(F.intersect(F.sd_arc(c.X, c.Y, yx - 9 + k * 6, yy + 10, 12, math.radians(220), math.radians(320), 0.7),
                           ball + 1.0), hexc('#6A4EB0'), 0.7)
    return c.image()


def icon_crew():
    """기사님: a 금방 courier's friendly face under the navy cap (gold brim, the mark), gold jacket, cream collar."""
    c = icanvas(0.90)
    shoulders = F.intersect(F.sd_box(c.X, c.Y, 48, 88, 30, 14, 12), c.Y - 95)
    face = F.sd_circle(c.X, c.Y, 48, 52, 21)
    cap = F.intersect(F.sd_ellipse(c.X, c.Y, 48, 42, 23.5, 20), c.Y - 42)
    flaps = U(F.sd_box(c.X, c.Y, 27, 50, 4.6, 9, 4), F.sd_box(c.X, c.Y, 69, 50, 4.6, 9, 4))
    brim = F.sd_ellipse(c.X, c.Y, 48, 41.5, 25, 5.5)
    shadow(c, U(shoulders, face, cap, flaps, brim), ow=2.4)
    part(c, shoulders, G, ow=2.6, bevel=5, gloss=0.25, tint='gold')
    collar = F.intersect(shoulders + 0.5, F.smin(F.sd_polygon(c.X, c.Y, [(32, 72), (48, 86), (64, 72), (64, 80),
                                                                         (48, 94), (32, 80)]), shoulders, 0.1))
    c.fill(F.sd_polygon(c.X, c.Y, [(33, 73), (48, 86), (63, 73), (63, 79), (48, 92), (33, 79)]), hexc('#FFF8EA'))
    c.fill(np.abs(F.sd_polygon(c.X, c.Y, [(33, 73), (48, 86), (63, 73), (63, 79), (48, 92), (33, 79)])) - 0.6,
           hexc('#8F7A5C'), 0.8)
    part(c, face, SKIN, ow=2.4, bevel=7, gloss=0.15, tint='#C86A50')
    part(c, flaps, NV, ow=1.8, bevel=2.5, gloss=0.2, tint='navy')
    part(c, cap, NV, ow=2.4, bevel=5, gloss=0.35, tint='navy')
    part(c, brim, G, ow=2.0, bevel=2.5, gloss=0.35, tint='gold')
    mark(c, 48, 30, 7.2, border=True, drop=False)
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, 48 + s * 8, 55, 2.4, 3.0), hexc('#2A2A3A'))
        c.fill(F.sd_circle(c.X, c.Y, 48 + s * 8 - 0.8, 53.8, 0.9), WHITE)
        c.fill(F.sd_ellipse(c.X, c.Y, 48 + s * 13, 61, 3.6, 2.2), hexc(PINK_CHEEK), 0.75, feather=0.8)
    c.fill(F.sd_arc(c.X, c.Y, 48, 59.5, 5.0, math.radians(25), math.radians(155), 1.2), hexc('#6A3A2A'))
    return c.image()


def icon_dawn():
    """새벽배송: a dawn window - lilac sky going peach, a crescent moon and a star, the gold sun rising behind snowy
    hills, a parcel waiting on the hill."""
    c = icanvas(0.92)
    win = F.sd_box(c.X, c.Y, 48, 48, 36, 36, 16)
    shadow(c, win, ow=2.4)
    c.fill(win - 2.6, hexc(DAWN_RIM))
    t = np.clip((c.Y - 14) / 70, 0, 1)
    sky = F.ramp([(0.0, hexc('#8C9AD8')), (0.45, hexc('#C9B5E0')), (0.75, hexc('#F7C6B0')), (1.0, hexc('#FFE1A0'))], t)
    c.paint(c.cov(win), sky)
    sun = F.intersect(F.sd_circle(c.X, c.Y, 56, 66, 15), c.Y - 66)
    c.glow(c.cov(F.sd_circle(c.X, c.Y, 56, 64, 15)), 5, hexc('#FFE9A8'), 0.6)
    part(c, F.intersect(sun, win + 2), ('#FFF1B8', '#F7B733', '#B07010'), ow=0, bevel=4, gloss=0.3, tint='gold')
    moon = F.subtract(F.sd_circle(c.X, c.Y, 30, 32, 10), F.sd_circle(c.X, c.Y, 35, 28, 8.5))
    part(c, moon, ('#FFFFFF', '#FFF2C8', '#8A7A5A'), ow=1.4, bevel=2, gloss=0.3, tint='cream')
    for sx, sy, r in ((62, 26, 4.0), (74, 38, 2.6), (44, 22, 2.2)):
        mini_sparkle(c, sx, sy, r, col='#FFFFFF', edge='#6A76B0')
    hills = F.intersect(U(F.sd_circle(c.X, c.Y, 28, 98, 34), F.sd_circle(c.X, c.Y, 76, 104, 36)), win + 0.5)
    part(c, hills, SNOW, ow=0, bevel=4, gloss=0.2, tint='snow')
    c.fill(F.intersect(np.abs(U(F.sd_circle(c.X, c.Y, 28, 98, 34), F.sd_circle(c.X, c.Y, 76, 104, 36))) - 0.8,
                       win + 1), hexc('#8EA2C6'), 0.9)
    parcel(c, 30, 64.5, 15, 12, ow=1.4)
    c.fill(np.abs(win) - 1.4, hexc(DAWN_RIM))
    return c.image()


def icon_doorstep():
    """문 앞 배송: a blue front door in a cream frame, a 금방 parcel waiting on the snowy step."""
    c = icanvas(0.92)
    frame = F.sd_box(c.X, c.Y, 42, 46, 24, 34, 5)
    frame = F.smin(frame, F.sd_circle(c.X, c.Y, 42, 30, 24), 0.1)
    frame = F.intersect(frame, F.sd_box(c.X, c.Y, 42, 46, 24, 40, 0))
    step = F.sd_box(c.X, c.Y, 48, 84, 38, 5, 3)
    shadow(c, U(frame, step), ow=2.4)
    part(c, frame, CR, ow=2.6, bevel=4, gloss=0.25, tint='cream')
    door = F.intersect(F.smin(F.sd_box(c.X, c.Y, 42, 52, 16, 26, 2), F.sd_circle(c.X, c.Y, 42, 32, 16), 0.1),
                       c.Y - 78)
    part(c, door, ('#B4CDEE', '#6F93C8', '#244272'), ow=2.0, bevel=3, gloss=0.3, tint='navy')
    win = F.sd_circle(c.X, c.Y, 42, 34, 6.5)
    c.fill(win - 1.2, hexc('#244272'))
    c.fill(win, hexc('#FFE9A0'))
    c.fill(F.intersect(np.abs(c.X - 42) - 0.7, win), hexc('#C9A040'), 0.8)
    c.fill(F.sd_circle(c.X, c.Y, 52, 56, 2.3), hexc(BRAND['gold']))
    c.fill(np.abs(F.sd_circle(c.X, c.Y, 52, 56, 2.3)) - 0.5, hexc(INK_GOLD), 0.8)
    part(c, step, SNOW, ow=2.0, bevel=2.5, gloss=0.3, tint='snow')
    mat = F.sd_box(c.X, c.Y, 42, 79.5, 15, 2.2, 1.2)
    c.fill(mat, hexc('#86B48E'))
    parcel(c, 72, 70, 24, 19, ow=2.0, face=True)
    U5.snow_cap(c, 62, 82, 60.8, 2.2, lumps=((68, 59.5, 2.8), (76, 59.8, 2.6)))
    return c.image()


def icon_cart():
    """장바구니 (order bubbles): a little shopping cart carrying a 금방 parcel, a sparkle above."""
    c = icanvas(0.92)
    basket = F.sd_polygon(c.X, c.Y, [(22, 38), (84, 38), (76, 66), (30, 66)]) - 2.0
    handle = F.sd_polyline(c.X, c.Y, [(8, 28), (16, 28), (26, 66), (30, 74), (76, 74)], 2.4)
    wheels = U(F.sd_circle(c.X, c.Y, 36, 82, 5.5), F.sd_circle(c.X, c.Y, 70, 82, 5.5))
    shadow(c, U(basket, handle, wheels, F.sd_box(c.X, c.Y, 52, 28, 16, 14, 3)), ow=2.4)
    part(c, handle, CH, ow=1.4, bevel=1.5, gloss=0.3, tint='char')
    parcel(c, 52, 30, 30, 24, ow=2.2, face=True)
    part(c, basket, ('#FFFFFF', '#DDE3EC', '#3B3F52'), ow=2.4, bevel=3, gloss=0.3, tint='char')
    for gx in (36, 50, 64):
        c.fill(F.intersect(F.sd_segment(c.X, c.Y, gx, 41, gx - 1.5, 64, 0.9), basket + 1.5), hexc('#8E96A8'), 0.9)
    c.fill(F.intersect(np.abs(c.Y - 52) - 0.8, basket + 1.5), hexc('#8E96A8'), 0.9)
    for wx in (36, 70):
        U5.wheel(c, wx, 82, 5.5)
    glint(c, 80, 16, 8.0)
    return c.image()


def icon_follow():
    """따라가기: a gold camera viewfinder framing a 금방 parcel with a little face, motion puffs behind it."""
    c = icanvas(0.94)
    k, L, w = 31, 14, 3.4
    corners = None
    for sx in (-1, 1):
        for sy in (-1, 1):
            cx, cy = 48 + sx * k, 48 + sy * k
            seg = F.sd_polyline(c.X, c.Y, [(cx - sx * L, cy), (cx, cy), (cx, cy - sy * L)], w)
            corners = seg if corners is None else np.minimum(corners, seg)
    puffs = U(F.sd_circle(c.X, c.Y, 22, 60, 4.8), F.sd_circle(c.X, c.Y, 15, 53, 3.2))
    box = F.sd_box(c.X, c.Y, 52, 49, 20, 17, 4)
    shadow(c, U(corners, box, puffs), ow=2.0)
    part(c, corners, GD, ow=1.8, bevel=1.8, gloss=0.45, tint='gold')
    part(c, puffs, SNOW, ow=1.4, bevel=1.5, gloss=0.2, tint='snow')
    parcel(c, 52, 49, 40, 34, ow=2.3, face=True)
    glint(c, 74, 26, 7.0)
    return c.image()


ICONS = [
    ('ui_icon_gb', icon_gb, '금방 (HUD chip, office 재고 row, letters, settings): the mark 금방이.',
     'ui_icon_depot (ui5)'),
    ('ui_icon_gb_order', icon_order, '주문 tab / new-order toast: an order slip with a gold band and a check seal.',
     'ui_icon_box (ui4)'),
    ('ui_icon_gb_van', icon_van, '금방 밴 (기사님 tab rows, van tap, upgrade cards): the gold van in profile with the '
     'mark on its side.', 'ui_icon_delivery (ui3)'),
    ('ui_icon_gb_sled', icon_sled, '금방 개썰매 (G1b, 기사님 tab, "곧 개썰매로" line): a husky pulling a sled with a '
     'parcel and the gold pennant.', 'ui_icon_sleigh (ui5)'),
    ('ui_icon_gb_locker', icon_locker, '금방 보관함 (G1b upgrade card, locker tap): a gold locker, blue doors, one '
     'open with a parcel.', 'ui_icon_box (ui4)'),
    ('ui_icon_gb_deal', icon_deal, '특가 (상품 tab button, 특가 chip, 지금 특가 row): a gold price tag with a cream star.',
     'ui_icon_coin (ui)'),
    ('ui_icon_gb_review', icon_review, '후기 tab / new review: a speech bubble with a gold star and a pink heart.',
     'ui_icon_fame (ui3)'),
    ('ui_icon_gb_today', icon_today, '오늘 tab: a desk calendar with a smiling sun.', 'ui_icon_day (ui3)'),
    ('ui_icon_gb_catalog', icon_catalog, '상품 tab: a 2 x 2 grid of products (bread, fish, jam, yarn).',
     'ui_icon_inventory (ui5)'),
    ('ui_icon_gb_crew', icon_crew, '기사님 tab / crew list: a courier in the navy 금방 cap and gold jacket.',
     'ui_icon_staff (ui5)'),
    ('ui_icon_gb_dawn', icon_dawn, '새벽배송 (upgrade card, first dawn toast, 관망 cut): moon, stars and the sun rising '
     'behind snowy hills, a parcel waiting.', 'ui_icon_night (ui3)'),
    ('ui_icon_gb_doorstep', icon_doorstep, '문 앞 배송 (done card without a photo, "문 앞에 두고 갈게요" toast, '
     'setting 금방 문 앞 장면): a blue door with a parcel on the snowy step.', 'ui_icon_box (ui4)'),
    ('ui_icon_gb_cart', icon_cart, 'order bubble over the orderer (with the item icon) and 주문 counts: a shopping '
     'cart carrying a 금방 parcel.', 'ui_icon_box (ui4)'),
    ('ui_icon_gb_follow', icon_follow, '따라가기 button and the follow caption chip: gold viewfinder corners around a '
     'parcel.', 'ui_icon_binoculars (ui5)'),
]


# --------------------------------------------------------------------------- tracker (steps, dots, line, stars)
STEP_KEYS = ['order', 'pick', 'pack', 'go', 'done']
STEP_WORDS = {'order': ('주문', 'Ordered'), 'pick': ('고르기', 'Picking'), 'pack': ('포장', 'Packing'),
              'go': ('배달 중', 'On the way'), 'done': ('도착', 'Arrived')}
OFF_FILL, OFF_LINE, OFF_INK = '#ECE6DA', '#BDB3A0', '#B0A691'


def step_badge(kind, on):
    """ui_gb_step_<kind>_<on|off> 64 x 64: a round badge with a pictogram.  on = the gold disc with cream / navy
    pictogram; off = a pale grey disc with a flat grey pictogram (the game always writes the step word under it)."""
    c = F.Canvas(64, 64)
    cx, cy, R = 32.0, 31.0, 23.5
    disc = F.sd_circle(c.X, c.Y, cx, cy, R)
    if on:
        c.shadow(c.cov(disc - 2), dy=2.2, sigma=1.6, opacity=0.30)
        part(c, disc, G, ow=2.4, bevel=7, gloss=0.35, tint='gold')
        paper, line_c, accent, ink = CR, '#7F8FAA', BRAND['navy'], '#8F7A5C'
    else:
        c.fill(disc, hexc(OFF_LINE))
        c.fill(disc + 2.0, hexc(OFF_FILL))
        paper, line_c, accent, ink = ('#FBF8F2', '#F4F0E8', OFF_INK), OFF_INK, OFF_INK, OFF_INK

    def piece(d, pal_on, ow=1.6, bevel=2.0, gloss=0.3, tint=None):
        if on:
            part(c, d, pal_on, ow=ow, bevel=bevel, gloss=gloss, tint=tint)
        else:
            c.fill(d - ow, hexc(OFF_INK))
            c.fill(d, hexc('#F8F5EF'))

    if kind == 'order':
        X, Y = F.rot(c.X, c.Y, cx, cy, math.radians(-6))
        tri = np.abs(((X - 20) / 5.0) % 1.0 * 2 - 1)
        slip = F.intersect(F.sd_box(X, Y, cx, cy - 1, 12, 15, 2.5), Y - (cy + 11 + 3 * tri))
        piece(slip, CR, tint='cream')
        for yy, ln in ((cy - 7, 14), (cy - 1.5, 12), (cy + 4, 8)):
            c.fill(F.sd_segment(X, Y, cx - 7, yy, cx - 7 + ln, yy, 1.4), hexc(line_c if on else OFF_INK))
    elif kind == 'pick':
        basket = F.sd_polygon(c.X, c.Y, [(cx - 15, cy - 2), (cx + 15, cy - 2), (cx + 11, cy + 14), (cx - 11, cy + 14)]) - 1.2
        handle = F.sd_arc(c.X, c.Y, cx, cy - 2, 11, math.radians(190), math.radians(350), 1.8)
        it1 = F.sd_circle(c.X, c.Y, cx - 6, cy - 4, 5.2)
        it2 = F.sd_box(c.X, c.Y, cx + 5, cy - 5, 5.2, 4.5, 1.2)
        if on:
            part(c, handle, NV, ow=1.0, bevel=1, gloss=0.3, tint='navy')
            part(c, it1, ('#FFD6E2', '#F07A9A', '#8E2450'), ow=1.2, bevel=1.5, gloss=0.4, tint='pink')
            part(c, it2, ('#D8F0FF', '#7FB8F0', '#1F4F8E'), ow=1.2, bevel=1.5, gloss=0.4, tint='sky')
        else:
            c.fill(handle, hexc(OFF_INK))
            for d in (it1, it2):
                piece(d, CR)
        piece(basket, CR, tint='cream')
        for gx in (-6, 0, 6):
            c.fill(F.intersect(F.sd_segment(c.X, c.Y, cx + gx, cy + 1, cx + gx * 0.8, cy + 11, 0.8), basket + 1.2),
                   hexc(line_c if on else OFF_INK), 0.9)
    elif kind == 'pack':
        box = F.sd_box(c.X, c.Y, cx, cy + 3, 14, 11, 2.5)
        flapL = F.sd_polygon(c.X, c.Y, [(cx - 14, cy - 8), (cx - 1, cy - 8), (cx - 5, cy - 15), (cx - 18, cy - 13)]) - 0.8
        flapR = F.sd_polygon(c.X, c.Y, [(cx + 14, cy - 8), (cx + 1, cy - 8), (cx + 5, cy - 15), (cx + 18, cy - 13)]) - 0.8
        piece(U(flapL, flapR), LIDP, tint='cream')
        piece(box, CR, tint='cream')
        tape = F.intersect(F.sd_box(c.X, c.Y, cx, cy + 3, 3.2, 12, 0.3), box + 0.2)
        if on:
            part(c, tape, GD, ow=0, bevel=1, gloss=0.3, tint='gold')
        else:
            c.fill(tape, hexc('#D6CFC2'))
        if on:
            mini_sparkle(c, cx + 13, cy - 15, 4.0, col='#FFFFFF', edge=BRAND['goldDark'])
    elif kind == 'go':
        X, Y = c.X, c.Y
        cargo = F.sd_box(X, Y, cx - 4, cy + 1, 13, 9, 3)
        cab = F.sd_polygon(X, Y, [(cx + 7, cy - 6), (cx + 13, cy - 6), (cx + 18, cy + 2), (cx + 18, cy + 10),
                                  (cx + 7, cy + 10)]) - 1.6
        body = F.smin(cargo, cab, 1.5)
        piece(body, CR, tint='cream')
        if on:
            c.fill(F.intersect(np.abs(Y - (cy + 4)) - 1.0, body + 0.8), hexc(accent))
            c.fill(F.sd_polygon(X, Y, [(cx + 9, cy - 3), (cx + 13, cy - 3), (cx + 16, cy + 2), (cx + 9, cy + 2)]) - 0.4,
                   hexc('#9CCBF2'))
            mark(c, cx - 4, cy - 1, 4.2, border=False, drop=False)
        else:
            c.fill(F.intersect(np.abs(Y - (cy + 4)) - 1.0, body + 0.8), hexc(OFF_INK))
        for wx in (cx - 10, cx + 11):
            w = F.sd_circle(X, Y, wx, cy + 11, 4.0)
            if on:
                part(c, w, CH, ow=1.0, bevel=1.5, gloss=0.2, tint='char')
                c.fill(F.sd_circle(X, Y, wx, cy + 11, 1.4), hexc(BRAND['gold']))
            else:
                c.fill(w, hexc(OFF_INK))
                c.fill(F.sd_circle(X, Y, wx, cy + 11, 1.4), hexc(OFF_FILL))
        for k, yy in enumerate((cy - 3, cy + 3)):
            c.fill(F.sd_segment(X, Y, cx - 24 + k * 2, yy, cx - 19 + k * 2, yy, 1.1), hexc('#FFF8EA' if on else OFF_INK), 0.9)
    elif kind == 'done':
        house = F.smin(F.sd_box(c.X, c.Y, cx - 2, cy + 5, 12, 9, 1.5),
                       F.sd_polygon(c.X, c.Y, [(cx - 17, cy - 2), (cx - 2, cy - 15), (cx + 13, cy - 2)]) - 1.2, 0.5)
        piece(house, CR, tint='cream')
        door = F.sd_box(c.X, c.Y, cx - 2, cy + 9, 3.2, 5.2, 1.2)
        c.fill(door, hexc(accent))
        chk = F.sd_circle(c.X, c.Y, cx + 11, cy + 10, 7.5)
        if on:
            part(c, chk, NV, ow=1.4, bevel=2, gloss=0.4, tint='navy')
            c.fill(F.sd_polyline(c.X, c.Y, [(cx + 7.5, cy + 10), (cx + 10, cy + 12.8), (cx + 14.5, cy + 7)], 1.4),
                   hexc('#FFFFFF'))
        else:
            c.fill(chk, hexc(OFF_INK))
            c.fill(F.sd_polyline(c.X, c.Y, [(cx + 7.5, cy + 10), (cx + 10, cy + 12.8), (cx + 14.5, cy + 7)], 1.4),
                   hexc(OFF_FILL))
    return c.image()


def dot(state):
    """ui_gb_dot_<off|on|now> 28 x 28: tracker dots - a hollow pale ring, a gold dot, and the current step (a bigger
    gold dot in a soft cream halo with a navy centre)."""
    c = F.Canvas(28, 28, ss=6)
    cx, cy = 14.0, 13.6
    if state == 'off':
        d = F.sd_circle(c.X, c.Y, cx, cy, 7.5)
        c.fill(d, hexc(OFF_LINE))
        c.fill(d + 2.0, hexc('#FBF8F2'))
    elif state == 'on':
        d = F.sd_circle(c.X, c.Y, cx, cy, 8.0)
        c.shadow(c.cov(d - 1), dy=1.2, sigma=0.8, opacity=0.3)
        part(c, d, G, ow=1.6, bevel=3, gloss=0.4, tint='gold')
    else:
        c.fill(F.sd_circle(c.X, c.Y, cx, cy, 13.0), hexc('#FFE7A8'), 0.55, feather=2.0)
        d = F.sd_circle(c.X, c.Y, cx, cy, 10.0)
        c.shadow(c.cov(d - 1), dy=1.2, sigma=0.8, opacity=0.3)
        c.fill(d, hexc('#FFFFFF'))
        part(c, d + 2.4, G, ow=1.6, bevel=3, gloss=0.4, tint='gold')
        c.fill(F.sd_circle(c.X, c.Y, cx, cy, 3.2), hexc(BRAND['navy']))
        c.fill(F.sd_circle(c.X, c.Y, cx - 1.0, cy - 1.0, 1.0), WHITE, 0.9)
    return c.image()


def line(on):
    """ui_gb_line_<off|on> 32 x 8: the tracker connector; uniform along x (stretch it with setDisplaySize)."""
    c = F.Canvas(32, 8, ss=6)
    band = np.abs(c.Y - 4.0) - (2.0 if not on else 2.4)
    if on:
        c.fill(band - 0.8, hexc(INK_GOLD), 0.7)
        t = np.clip((c.Y - 1.6) / 4.8, 0, 1)
        c.paint(c.cov(band), F.mix(hexc('#FFD887'), hexc('#E2A12E'), t))
    else:
        c.paint(c.cov(band), hexc('#DDD4C3'))
    return c.image()


def star32(full):
    """ui_gb_star_<full|empty> 32 x 32 (후기 rows, done cards: always 4-5 stars)."""
    c = F.Canvas(32, 32, ss=6)
    d = F.sd_star(c.X, c.Y, 16, 16.6, 13.5, 6.0, 5, rot=-math.pi / 2, round_=1.4)
    if full:
        c.shadow(c.cov(d - 1), dy=1.2, sigma=0.8, opacity=0.3)
        part(c, d, G, ow=1.8, bevel=3.5, gloss=0.45, tint='gold')
    else:
        c.fill(d, hexc(OFF_LINE))
        c.fill(d + 1.8, hexc('#F1EBDF'))
    return c.image()


# --------------------------------------------------------------------------- 9-slice frames (untrimmed)
def phone_frame():
    """ui_gb_phone 360 x 640: the chief's phone - a rounded charcoal bezel with a soft rim light, a speaker slot and a
    camera dot, and the app's cream screen (the game draws the header, tabs and content inside contentInset)."""
    W, H = 360, 640
    c = F.Canvas(W, H, ss=3)
    outer = F.sd_box(c.X, c.Y, W / 2, 318, 174, 314, 46)
    c.shadow(c.cov(outer), dy=4.0, sigma=3.2, opacity=0.34)
    c.fill(outer, hexc('#1E2130'))
    body = outer + 1.6
    t = np.clip((c.Y - 4) / 630, 0, 1)
    n = F.bevel_normals(body, 9, c.px)
    c.paint(c.cov(body), F.shade(F.mix(hexc('#565B73'), hexc('#3B3F52'), t), F.lambert(n), 0.45, 0.4))
    # a thin warm rim light along the inner edge of the bezel (reads on dark backgrounds)
    c.fill(F.intersect(np.abs(outer + 3.2) - 0.6, -(outer + 5)), hexc('#8A90A8'), 0.35)
    screen = F.sd_box(c.X, c.Y, W / 2, 320, 159, 290, 30)            # x 21..339, y 30..610
    c.fill(screen + 1.5, hexc('#262938'))                              # the screen's black lip
    ts = np.clip((c.Y - 30) / 580, 0, 1)
    c.paint(c.cov(screen), F.mix(hexc('#FCF8F0'), hexc('#F6EFE2'), ts))
    sh = np.clip(1 - (c.Y - 30) / 10, 0, 1) ** 2                       # the bezel's soft shade on the top of the screen
    c.paint(c.cov(screen) * sh, hexc('#B9AD96'), 0.35)
    # speaker slot + front camera in the top bezel
    spk = F.sd_box(c.X, c.Y, W / 2, 15.5, 26, 2.6, 2.6)
    c.fill(spk, hexc('#15171F'))
    c.fill(F.intersect(spk + 1.0, c.Y - 14.5), hexc('#4A4F66'), 0.6)
    cam = F.sd_circle(c.X, c.Y, W / 2 + 40, 15.5, 3.4)
    c.fill(cam, hexc('#15171F'))
    c.fill(F.sd_circle(c.X, c.Y, W / 2 + 39, 14.5, 1.1), hexc('#6A7AA8'), 0.9)
    return c.image()


def header_frame():
    """ui_gb_header 320 x 128: the app's gold header band - rounded top corners that match the phone screen (r 30),
    a soft top gloss, a goldDark lip and a soft shadow onto the screen below it."""
    W, H = 320, 128
    c = F.Canvas(W, H, ss=4)
    band = F.intersect(F.sd_box(c.X, c.Y, W / 2, 70, W / 2, 70, 30), c.Y - 116)
    shade = np.clip(1 - (c.Y - 116) / 12, 0, 1) ** 1.8 * (c.Y > 116)
    c.paint(shade.astype(np.float32), hexc('#8A6A3A'), 0.28)
    t = np.clip(c.Y / 110, 0, 1)
    c.paint(c.cov(band), F.ramp([(0.0, hexc('#FFD98A')), (0.55, hexc('#F7BE4A')), (1.0, hexc('#F2B33D'))], t))
    c.paint(c.cov(band) * np.clip(1 - c.Y / 34, 0, 1) ** 1.5, WHITE, 0.32)
    lip = F.intersect(band, 108 - c.Y)
    c.paint(c.cov(lip), hexc(BRAND['goldDark']))
    c.fill(F.intersect(np.abs(c.Y - 108) - 0.6, band), hexc('#FFE3A0'), 0.7)
    return c.image()


def tab_frame(on):
    """ui_gb_tab / ui_gb_tab_on 144 x 64: the app's tab buttons - a pale cream tab, and the selected one in gold with a
    gloss and a small shadow (write its word in navy, the other tabs in warm grey)."""
    W, H = 144, 64
    c = F.Canvas(W, H, ss=4)
    d = F.sd_box(c.X, c.Y, W / 2, 31, 68, 25, 22)
    if on:
        c.shadow(c.cov(d), dy=2.2, sigma=1.6, opacity=0.30)
        c.fill(d, hexc('#B07A1C'))
        inner = d + 2.0
        t = np.clip((c.Y - 6) / 50, 0, 1)
        n = F.bevel_normals(inner, 6, c.px)
        c.paint(c.cov(inner), F.shade(F.mix(hexc('#FFD887'), hexc('#F2B33D'), t), F.lambert(n), 0.4, 0.3))
        c.paint(c.cov(inner + 3, feather=2) * np.clip(1 - (c.Y - 8) / 14, 0, 1), WHITE, 0.5)
    else:
        c.fill(d, hexc('#E3D7C0'))
        inner = d + 1.6
        t = np.clip((c.Y - 6) / 50, 0, 1)
        c.paint(c.cov(inner), F.mix(hexc('#FBF6EC'), hexc('#F1E8D7'), t))
    return c.image()


def card_frame():
    """ui_gb_card 320 x 160: an order / product card - warm white, a hairline border, a soft shadow and a gold strip
    down its left edge."""
    W, H = 320, 160
    c = F.Canvas(W, H, ss=4)
    d = F.sd_box(c.X, c.Y, W / 2, 78, 156, 75, 18)
    c.shadow(c.cov(d), dy=3.0, sigma=2.4, opacity=0.24)
    c.fill(d, hexc('#E6D8BE'))
    inner = d + 1.5
    t = np.clip((c.Y - 3) / 150, 0, 1)
    c.paint(c.cov(inner), F.mix(hexc('#FFFEFA'), hexc('#FBF5EA'), t))
    strip = F.intersect(inner, c.X - 13)
    c.paint(c.cov(strip), F.mix(hexc('#FFD27A'), hexc('#F2B33D'), np.clip(c.X - 5, 0, 8) / 8))
    c.fill(F.intersect(np.abs(c.X - 13) - 0.5, inner), hexc(BRAND['goldDark']), 0.6)
    return c.image()


def chip_frame():
    """ui_gb_chip 200 x 64 (the HUD 금방 chip; ui_chip rules): a cream pill with a gold rim, round ends = the 32 px
    left / right slices; build it 64 tall and scale it uniformly for smaller chips (minHeight 64)."""
    W, H = 200, 64
    c = F.Canvas(W, H)
    pill = F.sd_box(c.X, c.Y, W / 2, H / 2 - 1.5, W / 2 - 5, H / 2 - 6, H / 2 - 6)
    c.shadow(c.cov(pill), dy=2.5, sigma=2.0, opacity=0.32)
    c.fill(pill - 0.8, hexc('#94600F'))
    t = np.clip((c.Y - 6) / 50, 0, 1)
    c.paint(c.cov(pill), F.mix(hexc('#FFD27A'), hexc('#E9A531'), t))
    inner = pill + 3.4
    n = F.bevel_normals(inner, 6, c.px)
    c.paint(c.cov(inner), F.shade(F.mix(hexc('#FFFDF6'), hexc('#F4EBD8'), t), F.lambert(n), 0.45, 0.25))
    c.paint(c.cov(inner + 4, feather=2) * np.clip(1 - (c.Y - 9) / 14, 0, 1), WHITE, 0.5)
    return c.image()


def toast_frame():
    """ui_gb_toast 300 x 64: a cream toast with a gold left edge and a soft shadow (icon + one line by the game)."""
    W, H = 300, 64
    c = F.Canvas(W, H)
    d = F.sd_box(c.X, c.Y, W / 2, 30, 146, 26, 16)
    c.shadow(c.cov(d), dy=3.0, sigma=2.4, opacity=0.30)
    c.fill(d, hexc('#D9C6A2'))
    inner = d + 1.4
    t = np.clip((c.Y - 4) / 52, 0, 1)
    c.paint(c.cov(inner), F.mix(hexc('#FFFEF9'), hexc('#F8F0E0'), t))
    edge = F.intersect(inner, c.X - 16)
    c.paint(c.cov(edge), F.mix(hexc('#FFD27A'), hexc('#EBA634'), t))
    c.fill(F.intersect(np.abs(c.X - 16) - 0.5, inner), hexc(BRAND['goldDark']), 0.7)
    c.paint(c.cov(inner + 3, feather=2) * np.clip(1 - (c.Y - 6) / 12, 0, 1), WHITE, 0.4)
    return c.image()


def ribbon_frame():
    """ui_gb_ribbon 160 x 48 (blank): a gold ribbon banner with swallowtail ends (특가 / 새로 / NEW labels by the game,
    in navy).  Build it 48 tall and stretch only the width (minHeight 48)."""
    W, H = 160, 48
    c = F.Canvas(W, H)
    shape = F.sd_polygon(c.X, c.Y, [(3, 7), (157, 7), (147, 23.5), (157, 40), (3, 40), (13, 23.5)])
    c.shadow(c.cov(shape - 1), dy=2.0, sigma=1.6, opacity=0.30)
    c.fill(shape - 1.2, hexc('#94600F'))
    t = np.clip((c.Y - 7) / 33, 0, 1)
    n = F.bevel_normals(shape, 4, c.px)
    c.paint(c.cov(shape), F.shade(F.mix(hexc('#FFD98A'), hexc('#EBA634'), t), F.lambert(n), 0.4, 0.3))
    for x0, s in ((20, 1), (140, -1)):                         # the fold creases near each end
        fold = F.intersect(F.intersect(shape, s * (c.X - x0)), s * (x0 + s * 5 - c.X))
        c.paint(c.cov(fold), hexc('#C98A22'), 0.55)
    c.fill(F.intersect(np.abs(c.Y - 11) - 0.7, F.intersect(shape, F.intersect(c.X - 25, 135 - c.X))),
           hexc('#FFF1C8'), 0.75)
    c.fill(F.intersect(np.abs(c.Y - 36) - 0.7, F.intersect(shape, F.intersect(c.X - 25, 135 - c.X))),
           hexc('#B07A1C'), 0.6)
    return c.image()


PHOTO_RECT = [24, 16, 128, 80]


def photo_frame():
    """ui_gb_photo 176 x 136 (fixed): the doorstep-photo print - a white instant-photo card, a strip of gold tape,
    a 금방이 sticker, and a transparent window photoRect [24, 16, 128, 80] for the game's 128 x 80 render texture
    (draw the photo UNDER the frame; the window edge carries a soft inner shade)."""
    W, H = 176, 136
    c = F.Canvas(W, H)
    card = F.sd_box(c.X, c.Y, W / 2, 66, 84, 62, 6)
    c.shadow(c.cov(card), dy=3.0, sigma=2.4, opacity=0.30)
    c.fill(card, hexc('#D8CCB4'))
    t = np.clip((c.Y - 4) / 124, 0, 1)
    c.paint(c.cov(card + 1.2), F.mix(hexc('#FFFFFF'), hexc('#F7F1E6'), t))
    x, y, w, h = PHOTO_RECT
    win = F.sd_box(c.X, c.Y, x + w / 2, y + h / 2, w / 2, h / 2, 1.5)
    c.fill(win - 1.2, hexc('#CDBFA4'))                                  # the window's rim
    c.erase(c.cov(win))
    inner = np.clip(1 + win / 5.0, 0, 1) * (win < 0)                    # inner shade along the edges (over the photo)
    topk = np.clip(1 - (c.Y - y) / 5, 0, 1) * (win < 0)
    c.paint(np.maximum(inner ** 2 * 0.6, topk ** 2 * 0.8).astype(np.float32), hexc('#3B3F52'), 0.32)
    X, Y = F.rot(c.X, c.Y, 88, 13, math.radians(-4))
    tape = F.sd_box(X, Y, 88, 11.5, 24, 6.5, 1.2)
    c.paint(c.cov(tape), hexc('#F6C35A'), 0.82)
    c.fill(F.intersect(np.abs(Y - 8) - 0.6, tape), hexc('#FFE3A0'), 0.6)
    mark(c, 150, 114, 12, drop=True)
    return c.image()


# --------------------------------------------------------------------------- FX: doorbell (64 x 64, 4 f, 12 fps)
def bell_sd(c, cx, cy, s, ang):
    """Bell hanging from (cx, cy) (its top loop), scale s, swung by ang degrees."""
    X, Y = F.rot(c.X, c.Y, cx, cy, math.radians(ang))
    dome = F.sd_circle(X, Y, cx, cy + 15 * s, 10.5 * s)
    skirt = F.sd_polygon(X, Y, [(cx - 10.5 * s, cy + 15 * s), (cx + 10.5 * s, cy + 15 * s), (cx + 15 * s, cy + 28 * s),
                                (cx - 15 * s, cy + 28 * s)])
    rim = F.sd_box(X, Y, cx, cy + 28.5 * s, 15.5 * s, 2.6 * s, 2.4 * s)
    body = F.smin(F.smin(dome, skirt, 3 * s), rim, 1.5 * s)
    loop = np.abs(F.sd_circle(X, Y, cx, cy + 3 * s, 3.2 * s)) - 1.3 * s
    clap = F.sd_circle(X, Y, cx, cy + 32 * s, 3.6 * s)
    return body, loop, clap, (X, Y)


def fx_bell(f):
    """fx_gb_bell 64 x 64, frame f of 4 (12 fps, once): the doorbell '띵동' over a door - the gold bell pops in,
    swings left, right with ringing arcs and sparkles, then settles as the arcs fade."""
    c = F.Canvas(64, 64)
    s, ang, arcs, spk = [(0.72, 0.0, (), 0.0), (1.0, -20.0, ((19, 1.0),), 0.6), (1.0, 18.0, ((19, 1.0), (26, 0.9)), 1.0),
                         (1.0, -6.0, ((26, 0.55),), 0.6)][f]
    s *= 0.86
    cx, cy = 32.0, 13.0 + (0.86 - s) * 14
    body, loop, clap, (X, Y) = bell_sd(c, cx, cy, s, ang)
    for r, a in arcs:
        for side in (-1, 1):
            a0, a1 = (math.radians(150), math.radians(210)) if side < 0 else (math.radians(-30), math.radians(30))
            arc = F.sd_arc(c.X, c.Y, 32, 30, r, a0, a1, 1.7)
            c.fill(arc - 1.0, hexc(INK_GOLD), 0.85 * a)
            c.fill(arc, hexc('#FFE08A'), a)
    c.shadow(c.cov(U(body, clap) - 1.5), dy=1.6, sigma=1.2, opacity=0.28)
    part(c, clap, GD, ow=1.4, bevel=2, gloss=0.3, tint='gold')
    part(c, loop, GD, ow=1.0, bevel=1, gloss=0.3, tint='gold')
    part(c, body, G, ow=2.0, bevel=5 * s, gloss=0.45, tint='gold')
    c.fill(F.sd_ellipse(X, Y, cx - 4.5 * s, cy + 14 * s, 2.2 * s, 5.0 * s), hexc('#FFF6D8'), 0.75, feather=0.8)
    if spk:
        for x, y, r in ((10, 12, 4.5), (54, 14, 3.6), (52, 50, 3.0)):
            glint(c, x, y, r * (0.7 + 0.3 * spk), a=spk)
    return c.image()


# --------------------------------------------------------------------------- the app layout (suggested; manifest appLayout)
NINE = {
    # key: (nineSlice {left, top, right, bottom}, contentInset [l, t, r, b], extra)
    'ui_gb_phone': (dict(left=56, top=64, right=56, bottom=64), [21, 30, 21, 30],
                    {'screenRect': [21, 30, 318, 580], 'screenRadius': 30}),
    'ui_gb_header': (dict(left=40, top=36, right=40, bottom=28), [24, 14, 24, 22], {'cornerRadius': 30}),
    'ui_gb_tab': (dict(left=26, top=22, right=26, bottom=22), [18, 12, 18, 12], {'minHeight': 64}),
    'ui_gb_tab_on': (dict(left=26, top=22, right=26, bottom=22), [18, 12, 18, 12], {'minHeight': 64}),
    'ui_gb_card': (dict(left=28, top=24, right=24, bottom=28), [28, 16, 18, 20], {}),
    'ui_gb_chip': (dict(left=32, top=16, right=32, bottom=16), [32, 16, 32, 16], {'minHeight': 64}),
    'ui_gb_toast': (dict(left=32, top=22, right=22, bottom=26), [26, 10, 16, 12], {}),
    'ui_gb_ribbon': (dict(left=24, top=14, right=24, bottom=14), [22, 8, 22, 10], {'minHeight': 48}),
}
APP = {
    # logical units: the panel is 720 wide and fills the viewport width, so 1 CSS px = 2 logical on a 360 CSS
    # phone and 1.85 on a 390 one.  Every tap / text minimum below holds on BOTH (designCss).
    'panel': [720, 1100], 'screen': [21, 30, 678, 1040], 'designCss': [360, 390],
    'header': {'rect': [21, 30, 678, 150], 'logo': [44, 46, 1.0], 'tagline': [52, 136, 28],
               'close': [642, 92, 44], 'mascot': [540, 174, 1.0]},
    'tabs': {'y': 190, 'h': 88, 'w': 128, 'gap': 4, 'icon': 34, 'iconGap': 5, 'font': 28, 'fontEn': 24,
             'scale': 1.375},
    'content': [37, 290, 646, 780],
    'card': {'w': 646, 'h': 256, 'gap': 16, 'font': 30, 'small': 28},
    'orderCard': {'h': 348, 'trackerY': 152, 'button': [272, 240, 250], 'etaY': 284},
    'tracker': {'y': 128, 'x0': 52, 'x1': 594, 'badge': 54, 'labelGap': 6, 'labelFont': 28, 'labelFontEn': 24},
    'button': {'h': 88, 'scale': 1.375},
    'toggle': {'w': 112, 'h': 44, 'hitH': 88},
    'tapMinCss': 44, 'bodyMinCss': 15, 'textMinCss': 12,
}
TABS = [('today', 'ui_icon_gb_today', '오늘', 'Today'), ('order', 'ui_icon_gb_order', '주문', 'Order'),
        ('catalog', 'ui_icon_gb_catalog', '상품', 'Shop'), ('crew', 'ui_icon_gb_crew', '기사님', 'Crew'),
        ('review', 'ui_icon_gb_review', '후기', 'Stars')]
NAVY_T, INK_T, GREY_T = (43, 79, 126, 255), (59, 63, 82, 255), (128, 116, 98, 255)


def _scaled(im, s):
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)


def _nine(fr, k, w, h):
    m = NINE[k][0]
    return U3.nine_stretch(fr[k], m, int(round(w)), int(round(h)))


def _item(name, size):
    try:
        ic = CF.Atlas.get('props/props_items').frame(name)
    except KeyError:
        return None
    (fdx, fdy), fsz = CF.icon_center_offset(ic)
    s = size / fsz
    return ic.resize((round(ic.width * s), round(ic.height * s)), Image.LANCZOS), (fdx * s, fdy * s)


def _paste_item(out, name, cx, cy, size):
    r = _item(name, size)
    if r:
        im, (dx, dy) = r
        out.alpha_composite(im, (int(cx - im.width / 2 - dx), int(cy - im.height / 2 - dy)))


def _icon(out, fr, k, cx, cy, size):
    im = _scaled(fr[k], size / 96.0 if fr[k].width == 96 else size / max(fr[k].size))
    out.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def tracker(out, fr, d, x0, x1, y, step, en=False, font=None):
    """Draw the 5-step tracker: steps < `step` done (on), == step current (on + 'now' dot), > step off."""
    T = APP['tracker']
    n = len(STEP_KEYS)
    xs = [x0 + (x1 - x0) * i / (n - 1) for i in range(n)]
    b = T['badge']
    for i in range(n - 1):
        on = i < step
        ln = _scaled(fr['ui_gb_line_on' if on else 'ui_gb_line_off'], 1.0)
        w = int(xs[i + 1] - xs[i] - b - 6)
        ln = ln.resize((w, 8), Image.LANCZOS)
        out.alpha_composite(ln, (int(xs[i] + b / 2 + 3), int(y - 4)))
    for i, k in enumerate(STEP_KEYS):
        on = i <= step
        im = _scaled(fr[f'ui_gb_step_{k}_{"on" if on else "off"}'], b / 64.0)
        out.alpha_composite(im, (int(xs[i] - im.width / 2), int(y - im.height / 2)))
        if i == step:
            dt = fr['ui_gb_dot_now']
            out.alpha_composite(dt, (int(xs[i] + b / 2 - 18), int(y - b / 2 - 8)))
        word = STEP_WORDS[k][1 if en else 0]
        d.text((xs[i], y + b / 2 + T['labelGap']), word, font=font or CF.font(T['labelFontEn' if en else 'labelFont']),
               fill=NAVY_T if i == step else (INK_T if on else GREY_T), anchor='mt')
    return xs


def app_mock(fr, tab='order', en=False):
    """The 금방 마켓 app as the game would lay it out (720 x 1100 logical; plan §6 / player plan §9)."""
    W, H = APP['panel']
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(_nine(fr, 'ui_gb_phone', W, H))
    hx, hy, hw, hh = APP['header']['rect']
    out.alpha_composite(_nine(fr, 'ui_gb_header', hw, hh), (hx, hy))
    d = ImageDraw.Draw(out)
    lx, ly, ls = APP['header']['logo']
    out.alpha_composite(_scaled(fr['ui_gb_logo_en' if en else 'ui_gb_logo_ko'], ls), (lx, ly))
    tx, ty, tf = APP['header']['tagline']
    d.text((tx, ty), 'Order now, here in a moment' if en else '방금 시키면 금방 와요', font=CF.font(tf),
           fill=NAVY_T, anchor='lm')
    cx_, cy_, cr = APP['header']['close']
    d.ellipse((cx_ - cr, cy_ - cr, cx_ + cr, cy_ + cr), fill=(255, 251, 243, 255), outline=(176, 122, 28, 255), width=3)
    for s in (-1, 1):
        d.line((cx_ - 13, cy_ - 13 * s, cx_ + 13, cy_ + 13 * s), fill=NAVY_T, width=6)
    mx, my, msc = APP['header']['mascot']
    ms = _scaled(fr['ui_gb_mascot_run_1'], msc)
    out.alpha_composite(ms, (int(mx - ms.width * 0.5), int(my - ms.height * 0.9)))
    # tabs
    T = APP['tabs']
    x = hx + (hw - (5 * T['w'] + 4 * T['gap'])) / 2
    for key, ik, ko, en_ in TABS:
        on = key == tab
        tb = _scaled(_nine(fr, 'ui_gb_tab_on' if on else 'ui_gb_tab', T['w'] / T['scale'], 64), T['scale'])
        out.alpha_composite(tb, (int(x), T['y']))
        word = en_ if en else ko
        f = CF.font(T['fontEn'] if en else T['font'])
        tw = d.textlength(word, font=f)
        total = T['icon'] + T['iconGap'] + tw
        sx = x + (T['w'] - total) / 2
        _icon(out, fr, ik, sx + T['icon'] / 2, T['y'] + T['h'] / 2 - 1, T['icon'])
        d.text((sx + T['icon'] + T['iconGap'], T['y'] + T['h'] / 2 - 1), word, font=f,
               fill=NAVY_T if on else (138, 122, 98, 255), anchor='lm')
        if key == 'review':
            d.ellipse((x + T['w'] - 24, T['y'] + 6, x + T['w'] - 8, T['y'] + 22), fill=(242, 179, 61, 255),
                      outline=(255, 255, 255, 255), width=2)
        x += T['w'] + T['gap']
    cx0, cy0, cw, ch = APP['content']
    C = APP['card']
    big, small = CF.font(C['font']), CF.font(C['small'])
    panel_out = out
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(out)
    if tab == 'order':
        d.text((cx0 + 6, cy0 + 4), 'On the way 3 · New 5' if en else '배달 중 3 · 새 주문 5', font=small, fill=GREY_T)
        y = cy0 + 40
        # card 1: on the way (tracker + ETA + the follow button)
        OC = APP['orderCard']
        h1 = OC['h']
        out.alpha_composite(_nine(fr, 'ui_gb_card', cw, h1), (cx0, y))
        d.text((cx0 + 30, y + 22), 'Pine Apts 2 · Grandma Jeong' if en else '솔방울 아파트 2동 · 정 할머니', font=big,
               fill=INK_T)
        rb = _nine(fr, 'ui_gb_ribbon', 150, 48)
        out.alpha_composite(rb, (cx0 + cw - 168, y + 14))
        d.text((cx0 + cw - 93, y + 37), 'On way' if en else '배달 중', font=small, fill=NAVY_T, anchor='mm')
        _paste_item(out, 'item_log', cx0 + 52, y + 88, 40)
        d.text((cx0 + 78, y + 88), '4', font=big, fill=INK_T, anchor='lm')
        _paste_item(out, 'item_bread', cx0 + 128, y + 88, 40)
        d.text((cx0 + 154, y + 88), '2', font=big, fill=INK_T, anchor='lm')
        coin = CF.Atlas.get('ui/ui_icons').frame('ui_icon_coin')
        out.alpha_composite(_scaled(coin, 34 / max(coin.size)), (cx0 + cw - 120, y + 72))
        d.text((cx0 + cw - 80, y + 89), '+22', font=big, fill=(176, 122, 28, 255), anchor='lm')
        tracker(out, fr, d, cx0 + 60, cx0 + cw - 60, y + OC['trackerY'], 3, en)
        d.text((cx0 + 30, y + OC['etaY']), 'Left! About 20 s' if en else '출발! 약 20초 뒤 도착', font=small,
               fill=INK_T, anchor='lm')
        B = APP['button']
        bo_x, bo_y, bw_ = OC['button']
        bt = _scaled(_nine(fr, 'ui_gb_chip', bw_ / B['scale'], 64), B['scale'])
        bx_, by_ = cx0 + cw - bo_x, y + bo_y
        out.alpha_composite(bt, (bx_, by_))
        _icon(out, fr, 'ui_icon_gb_follow', bx_ + 50, by_ + B['h'] / 2 - 2, 46)
        d.text((bx_ + 82, by_ + B['h'] / 2 - 2), 'Follow' if en else '따라가기', font=small, fill=NAVY_T, anchor='lm')
        y2 = y + h1 + C['gap']
        # card 2: arrived (photo + stars + review line)
        out.alpha_composite(_nine(fr, 'ui_gb_card', cw, 236), (cx0, y2))
        ph = fr['ui_gb_photo']
        snap = doorstep_snapshot(fr)
        px, py = cx0 + 26, y2 + 52
        out.alpha_composite(snap, (px + PHOTO_RECT[0], py + PHOTO_RECT[1]))
        out.alpha_composite(ph, (px, py))
        d.text((cx0 + 30, y2 + 20), "Station St · Minji's" if en else '역앞 집 · 민지네', font=big, fill=INK_T)
        word = 'Arrived' if en else '도착'
        tw_ = d.textlength(word, font=small)
        out.alpha_composite(_scaled(fr['ui_gb_step_done_on'], 44 / 64), (int(cx0 + cw - 28 - tw_ - 8 - 44), y2 + 12))
        d.text((cx0 + cw - 28, y2 + 34), word, font=small, fill=NAVY_T, anchor='rm')
        for i in range(5):
            out.alpha_composite(_scaled(fr['ui_gb_star_full' if i < 5 else 'ui_gb_star_empty'], 34 / 32),
                                (cx0 + 222 + i * 36, y2 + 70))
        lines = (['"Ordered just now,', 'here already? So fast!"'] if en else
                 ['"방금 시켰는데 벌써요?', '진짜 금방이네!"'])
        for i, ln in enumerate(lines):
            d.text((cx0 + 224, y2 + 122 + i * 38), ln, font=small, fill=INK_T)
        y3 = y2 + 236 + C['gap']
        out.alpha_composite(_nine(fr, 'ui_gb_card', cw, 220), (cx0, y3))
        d.text((cx0 + 30, y3 + 22), 'Bakery upstairs · Mr. Oh' if en else '빵집 위층 · 오 아저씨', font=big, fill=INK_T)
        _paste_item(out, 'item_fish_cooked', cx0 + 52, y3 + 88, 40)
        d.text((cx0 + 78, y3 + 88), '3', font=big, fill=INK_T, anchor='lm')
        tracker(out, fr, d, cx0 + 60, cx0 + cw - 60, y3 + 152, 1, en)
    elif tab == 'today':
        stats = [('ui_icon_gb_order', '42', 'Orders' if en else '주문'), ('ui_icon_gb_van', '38', 'Delivered' if en else '배달'),
                 ('ui_icon_gb_catalog', '−214', 'Shelf' if en else '줄어든 재고'), (None, '+1,240', 'Coins' if en else '코인')]
        for i, (ik, num, lab) in enumerate(stats):
            bx = cx0 + (i % 2) * (cw / 2 + 4)
            by = cy0 + 6 + (i // 2) * 128
            out.alpha_composite(_nine(fr, 'ui_gb_card', cw / 2 - 4, 120), (int(bx), int(by)))
            if ik:
                _icon(out, fr, ik, bx + 66, by + 58, 64)
            else:
                coin = CF.Atlas.get('ui/ui_icons').frame('ui_icon_coin')
                out.alpha_composite(_scaled(coin, 56 / max(coin.size)), (int(bx + 38), int(by + 30)))
            d.text((bx + 112, by + 42), num, font=CF.font(40), fill=INK_T, anchor='lm')
            d.text((bx + 112, by + 84), lab, font=small, fill=GREY_T, anchor='lm')
        y = cy0 + 270
        out.alpha_composite(_nine(fr, 'ui_gb_card', cw, 280), (cx0, y))
        d.text((cx0 + 30, y + 20), 'Depot shelves' if en else '물류센터 선반', font=big, fill=INK_T)
        bars = [('item_log', 0.42, 0.66), ('item_bread', 0.30, 0.48), ('item_fish_raw', 0.55, 0.71), ('item_ore', 0.62, 0.80)]
        for i, (ik, now, yest) in enumerate(bars):
            ry = y + 84 + i * 46
            _paste_item(out, ik, cx0 + 54, ry + 8, 34)
            x0b, x1b = cx0 + 84, cx0 + cw - 40
            d.rounded_rectangle((x0b, ry, x1b, ry + 16), radius=8, fill=(236, 228, 214, 255))
            d.rounded_rectangle((x0b, ry, x0b + (x1b - x0b) * now, ry + 16), radius=8, fill=(242, 179, 61, 255))
            xx = x0b + (x1b - x0b) * yest
            d.line((xx, ry - 4, xx, ry + 20), fill=(128, 116, 98, 200), width=3)
        y += 296
        out.alpha_composite(_nine(fr, 'ui_gb_card', cw, 140), (cx0, y))
        rb = _nine(fr, 'ui_gb_ribbon', 150, 48)
        out.alpha_composite(rb, (cx0 + 22, y + 14))
        d.text((cx0 + 97, y + 37), 'Deal' if en else '지금 특가', font=small, fill=NAVY_T, anchor='mm')
        for i, ik in enumerate(('item_log', 'item_ore', 'item_fish_raw')):
            _paste_item(out, ik, cx0 + 230 + i * 70, y + 40, 44)
        _icon(out, fr, 'ui_icon_gb_review', cx0 + 50, y + 100, 40)
        d.text((cx0 + 80, y + 100), '"Through the snow - amazing!"' if en else '"눈길을 뚫고 왔네! 대단해요!"', font=small,
               fill=INK_T, anchor='lm')
        for i in range(5):
            out.alpha_composite(_scaled(fr['ui_gb_star_full'], 26 / 32), (cx0 + cw - 160 + i * 28, y + 88))
    elif tab == 'catalog':
        rows = [('item_log', '장작', 'Firewood', 1, '특가', 'Deal', 'deal'), ('item_bread', '빵', 'Bread', 4, '가게 먼저', 'Shops first', 'pause'),
                ('item_fish_raw', '생선', 'Fish', 3, '판매 중', 'On sale', 'sale'), ('item_ore', '광석', 'Ore', 2, '판매 중', 'On sale', 'sale'),
                ('item_wheat', '밀', 'Wheat', 2, '품절', 'Sold out', 'out')]
        for i, (ik, ko, en_, price, st_ko, st_en, st) in enumerate(rows):
            y = cy0 + 4 + i * 152
            out.alpha_composite(_nine(fr, 'ui_gb_card', cw, 140), (cx0, y))
            _paste_item(out, ik, cx0 + 66, y + 68, 60)
            d.text((cx0 + 116, y + 44), en_ if en else ko, font=big, fill=INK_T, anchor='lm')
            coin = CF.Atlas.get('ui/ui_icons').frame('ui_icon_coin')
            out.alpha_composite(_scaled(coin, 28 / max(coin.size)), (cx0 + 116, y + 78))
            d.text((cx0 + 150, y + 92), f'{price}', font=small, fill=(176, 122, 28, 255), anchor='lm')
            if st == 'deal':
                out.alpha_composite(_nine(fr, 'ui_gb_ribbon', 160, 48), (cx0 + cw - 186, y + 20))
                _icon(out, fr, 'ui_icon_gb_deal', cx0 + cw - 160, y + 44, 30)
                d.text((cx0 + cw - 98, y + 44), st_en if en else st_ko, font=small, fill=NAVY_T, anchor='mm')
            else:
                ch_ = _scaled(_nine(fr, 'ui_gb_chip', 220 * 64 / 50, 64), 50 / 64)
                out.alpha_composite(ch_, (cx0 + cw - 244, y + 19))
                col = {'pause': (138, 122, 98, 255), 'sale': NAVY_T, 'out': (150, 140, 128, 255)}[st]
                d.text((cx0 + cw - 134, y + 44), st_en if en else st_ko, font=small, fill=col, anchor='mm')
            TG = APP['toggle']
            tg = (cx0 + cw - 30 - TG['w'], y + 82, cx0 + cw - 30, y + 82 + TG['h'])
            on = st != 'out'
            d.rounded_rectangle(tg, radius=TG['h'] // 2, fill=(242, 179, 61, 255) if on else (226, 219, 206, 255))
            kr = TG['h'] / 2 - 3
            kx = tg[2] - TG['h'] / 2 if on else tg[0] + TG['h'] / 2
            d.ellipse((kx - kr, tg[1] + 3, kx + kr, tg[3] - 3), fill=(255, 253, 248, 255), outline=(176, 122, 28, 255) if on else (189, 179, 160, 255), width=2)
            d.text((tg[0] - 12, y + 104), ('Sell' if on else 'Rest') if en else ('팔기' if on else '쉬기'), font=small,
                   fill=INK_T, anchor='rm')
    # the content scrolls inside the screen under the tabs (the game masks it the same way)
    sx, sy, sw, sh = APP['screen']
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle((sx, cy0 - 8, sx + sw, sy + sh), radius=30, fill=255)
    ImageDraw.Draw(m).rectangle((sx, cy0 - 8, sx + sw, cy0 + 40), fill=255)
    a = np.asarray(out).copy()
    a[..., 3] = (a[..., 3].astype(np.uint16) * np.asarray(m) // 255).astype(np.uint8)
    panel_out.alpha_composite(Image.fromarray(a, 'RGBA'))
    return panel_out


def doorstep_snapshot(fr):
    """A stand-in for the game's 128 x 80 doorstep render texture (snow, a blue door, the parcel)."""
    c = F.Canvas(128, 80)
    c.paint(np.ones(c.a.shape, np.float32), F.mix(hexc('#DCE6F2'), hexc('#F7F9FC'), np.clip(c.Y / 80, 0, 1)))
    c.fill(F.sd_box(c.X, c.Y, 52, 30, 22, 34, 2), hexc('#F3E9D6'))
    c.fill(F.sd_box(c.X, c.Y, 52, 34, 15, 30, 2), hexc('#6F93C8'))
    c.fill(F.sd_circle(c.X, c.Y, 62, 40, 2), hexc(BRAND['gold']))
    c.fill(F.sd_box(c.X, c.Y, 64, 70, 60, 6, 2), hexc('#FFFFFF'))
    parcel(c, 88, 58, 26, 20, ow=1.6, face=True)
    U5.snow_cap(c, 76, 100, 47.5, 2.2, lumps=((82, 46.5, 2.6), (92, 46.8, 2.4)))
    return c.image()


def phone_shot(app, bg=None, chip=None, toast=None):
    """Compose a 390 x 844 CSS (x3 = 1170 x 2532) phone screenshot: the world behind, the app panel centred."""
    k = 1170 / 720.0
    Hl = int(round(2532 / k))
    scr = Image.new('RGBA', (720, Hl), (226, 233, 242, 255))
    if bg is not None:
        scr.alpha_composite(bg.resize((720, Hl), Image.LANCZOS))
    dim = Image.new('RGBA', (720, Hl), (30, 36, 56, 70))
    scr.alpha_composite(dim)
    scr.alpha_composite(app, (0, (Hl - app.height) // 2))
    return scr.resize((1170, 2532), Image.LANCZOS)


# --------------------------------------------------------------------------- look-dev helpers
def look_sheet(items, path, bgs=('#FFF8EC', '#F2B33D', '#2B2F3A', '#AEB8D2')):
    """items: [(name, PIL RGBA)] -> rows on 4 backgrounds, each at 1x and 2x, plus 32 px and 24 px thumbnails."""
    rows = []
    for name, im in items:
        w = im.width * 2 + im.width + 32 + 24 + 60
        rows.append((name, im, w))
    W = max(r[2] for r in rows) * len(bgs) + 20
    H = sum(max(r[1].height * 2, 64) + 30 for r in rows) + 20
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    y = 10
    for name, im, w in rows:
        hh = max(im.height * 2, 64) + 20
        for bi, bg in enumerate(bgs):
            x0 = 10 + bi * max(r[2] for r in rows)
            d.rectangle((x0, y, x0 + w, y + hh), fill=hexc_rgb(bg))
            out.alpha_composite(im.resize((im.width * 2, im.height * 2), Image.LANCZOS), (x0 + 4, y + 4))
            out.alpha_composite(im, (x0 + im.width * 2 + 10, y + 4))
            if im.width <= 128:
                s32 = im.resize((max(1, im.width * 32 // max(im.size)), max(1, im.height * 32 // max(im.size))), Image.LANCZOS)
                s24 = im.resize((max(1, im.width * 24 // max(im.size)), max(1, im.height * 24 // max(im.size))), Image.LANCZOS)
                out.alpha_composite(s32, (x0 + im.width * 3 + 16, y + 6))
                out.alpha_composite(s24, (x0 + im.width * 3 + 54, y + 10))
        d.text((10, y + hh - 16), name, font=CF.font(13), fill=(30, 40, 60, 255))
        y += hh + 10
    out.save(path)
    return path


def hexc_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def look(keys):
    os.makedirs(CACHE, exist_ok=True)
    items = []
    for k in keys:
        fn = ALL_DRAW[k]
        _CURRENT[0] = k
        items.append((k, fn()))
    return look_sheet(items, os.path.join(CACHE, 'look_ui6.png'))


# =========================================================================== registry
MASCOT_ANIMS = {'idle': (2, 3, -1), 'run': (4, 8, -1), 'bow': (2, 3, 0)}       # frames, fps, repeat
NINE_KEYS = list(NINE)
UNTRIMMED = set(NINE_KEYS) | {'ui_gb_photo', 'ui_gb_line_off', 'ui_gb_line_on'}
LOGO_KEYS = {'ui_gb_logo_ko', 'ui_gb_logo_en'}


def registry():
    """key -> (draw function, args).  Frame names in the atlas are these keys."""
    R = {}
    for k, fn, *_ in ICONS:
        R[k] = (fn, ())
    for kind in STEP_KEYS:
        for st in ('on', 'off'):
            R[f'ui_gb_step_{kind}_{st}'] = (step_badge, (kind, st == 'on'))
    for st in ('off', 'on', 'now'):
        R[f'ui_gb_dot_{st}'] = (dot, (st,))
    R['ui_gb_line_off'], R['ui_gb_line_on'] = (line, (False,)), (line, (True,))
    R['ui_gb_star_full'], R['ui_gb_star_empty'] = (star32, (True,)), (star32, (False,))
    R['ui_gb_logo_ko'], R['ui_gb_logo_en'] = (logo, ('ko',)), (logo, ('en',))
    R['ui_gb_mark'] = (logo_mark, ())
    for anim, (n, _, _) in MASCOT_ANIMS.items():
        for i in range(n):
            R[f'ui_gb_mascot_{anim}_{i}'] = (mascot, (anim, i))
    R['ui_gb_phone'] = (phone_frame, ())
    R['ui_gb_header'] = (header_frame, ())
    R['ui_gb_tab'], R['ui_gb_tab_on'] = (tab_frame, (False,)), (tab_frame, (True,))
    R['ui_gb_card'] = (card_frame, ())
    R['ui_gb_chip'] = (chip_frame, ())
    R['ui_gb_toast'] = (toast_frame, ())
    R['ui_gb_ribbon'] = (ribbon_frame, ())
    R['ui_gb_photo'] = (photo_frame, ())
    for i in range(4):
        R[f'fx_gb_bell_{i}'] = (fx_bell, (i,))
    return R


REG = registry()
ALL_DRAW = {k: (lambda fn=fn, args=args: fn(*args)) for k, (fn, args) in REG.items()}
HELPERS = ('icanvas', 'part', 'glint', 'sparkle_sd', 'mark', 'text_cov', 'lettering', 'parcel', 'mini_sparkle', 'van_body',
           'husky_head', 'Y_lt', 'bell_sd')


def item_hash(fn):
    """Per-item cache hash: the draw function + the shared helpers + palettes + the imported style modules."""
    src = inspect.getsource(fn) + ''.join(inspect.getsource(globals()[n]) for n in HELPERS)
    src += repr((BRAND, G, GD, CR, LIDP, NV, CH, SKY, SNOW, GREYP, TINT, PINK_CHEEK, LID, INK_GOLD, PHOTO_RECT,
                 OFF_FILL, OFF_LINE, OFF_INK, MASCOT_SCALE, MASCOT_FOOT_Y, ICON_K, DAWN_RIM, BRACKET))
    mods = b''.join(open(p, 'rb').read() for p in (F.__file__, U3.__file__, U4.__file__, U5.__file__, EA.__file__))
    fonts = b''.join(open(os.path.join(FONT_DIR, f), 'rb').read()[:4096] for f in ('Jua-Regular.ttf', 'Fredoka-Bold.ttf'))
    return hashlib.sha1(src.encode() + mods + fonts).hexdigest()[:12]


def render_all(only=None):
    out = {}
    os.makedirs(os.path.join(CACHE, 'items'), exist_ok=True)
    for k, (fn, args) in REG.items():
        if only and k not in only:
            continue
        h = item_hash(fn)
        tag = '_'.join(str(a) for a in args)
        p = os.path.join(CACHE, 'items', f'{k}_{h}.png')
        tp = p[:-4] + '.text'
        if os.path.exists(p):
            out[k] = Image.open(p).convert('RGBA')
            if os.path.exists(tp):
                TEXT_USED.add(k)
            continue
        print(f'  render {k} {tag}', flush=True)
        _CURRENT[0] = k
        out[k] = fn(*args)
        out[k].save(p)
        if k in TEXT_USED:
            open(tp, 'w').write('text')
    return out


# =========================================================================== atlas + manifest
def contract_sizes():
    S = {}
    for k, *_ in ICONS:
        S[k] = (96, 96)
    for kind in STEP_KEYS:
        for st in ('on', 'off'):
            S[f'ui_gb_step_{kind}_{st}'] = (64, 64)
    for st in ('off', 'on', 'now'):
        S[f'ui_gb_dot_{st}'] = (28, 28)
    S['ui_gb_line_off'] = S['ui_gb_line_on'] = (32, 8)
    S['ui_gb_star_full'] = S['ui_gb_star_empty'] = (32, 32)
    S['ui_gb_mark'] = (128, 128)
    for anim, (n, _, _) in MASCOT_ANIMS.items():
        for i in range(n):
            S[f'ui_gb_mascot_{anim}_{i}'] = (128, 128)
    S.update({'ui_gb_phone': (360, 640), 'ui_gb_header': (320, 128), 'ui_gb_tab': (144, 64), 'ui_gb_tab_on': (144, 64),
              'ui_gb_card': (320, 160), 'ui_gb_chip': (200, 64), 'ui_gb_toast': (300, 64), 'ui_gb_ribbon': (160, 48),
              'ui_gb_photo': (176, 136)})
    for i in range(4):
        S[f'fx_gb_bell_{i}'] = (64, 64)
    return S


LOGO_MAX = {'ui_gb_logo_ko': (256, 96), 'ui_gb_logo_en': (320, 96)}
RESIDENT = ([k for k, *_ in ICONS] + ['ui_gb_chip', 'ui_gb_toast'] + [f'fx_gb_bell_{i}' for i in range(4)])
CODE_FALLBACK = {
    'icons': 'ui5 ui_icon_depot / ui4 ui_icon_box / ui3 ui_icon_delivery (plan §10.3); see each sprite\'s replaces',
    'tracker': 'text tracker "주문 → 고르기 → 포장 → 배달 중 → 도착" (plan §10.3)',
    'panels': 'ui5 ui_chip / ui_letter frames (plan §10.3)',
    'logos': 'runtime text "금방 마켓" in Pretendard on the header',
    'mascot': 'ui_icon_gb (no animation)',
    'fx_gb_bell': 'emotes fx_music_notes or nothing',
}


EDGE_PAD = {'ui_gb_header', 'ui_gb_line_off', 'ui_gb_line_on'}     # frames whose outer pixels are opaque


def pack_atlas(fr, iters=240, seed=3, max_px=int(2.5 * 2 ** 20 / 4)):
    """Atlas packer for the tight AQ page budget (<= 2.5 MiB = 655,360 px): trimmed frames keep a 1 px transparent
    border of their own (CF._trim pad 1) and the panels have transparent margins, so they pack edge to edge without
    bleeding under linear filtering (no mipmaps); only frames with opaque outer pixels (EDGE_PAD) get a 1 px gap.
    Deterministic random-restart MaxRects (big untrimmed panels first, the rest shuffled), smallest page wins."""
    names = list(REG)
    items, sizes = [], []
    for n in names:
        im = fr[n]
        if n in UNTRIMMED:
            box = (0, 0, im.width, im.height)
            crop = im
        else:
            box = CF._trim(im)
            a = np.asarray(im).copy()
            a[a[..., 3] <= 2] = 0
            crop = Image.fromarray(a, 'RGBA').crop(box)
        items.append((n, im, box, crop))
        p_ = 1 if n in EDGE_PAD else 0
        sizes.append((crop.width + p_, crop.height + p_))
    big = sorted([i for i, n in enumerate(names) if n in UNTRIMMED and sizes[i][0] * sizes[i][1] > 9000],
                 key=lambda i: -sizes[i][0] * sizes[i][1])
    rest = [i for i in range(len(names)) if i not in big]
    rest_sorted = sorted(rest, key=lambda i: (-sizes[i][1], -sizes[i][0]))
    rng = np.random.default_rng(seed)
    best = None
    orders = [big + rest_sorted] + [big + [rest[j] for j in rng.permutation(len(rest))] for _ in range(iters)]
    for o in orders:
        for W in range(640, 1025, 4):
            pl = CF.maxrects(sizes, W, pad=0, order=o)
            if pl is None:
                continue
            uw = max(x + w for (x, _), (w, _) in zip(pl, sizes))
            uh = max(y + h for (_, y), (_, h) in zip(pl, sizes))
            sw, sh = (uw + 1) // 2 * 2, (uh + 1) // 2 * 2
            if sw > 1024 or sh > 1024:
                continue
            if best is None or sw * sh < best[0]:
                best = (sw * sh, sw, sh, pl)
    _, sw, sh, pl = best
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    frames = {}
    for (n, im, box, crop), (x, y) in zip(items, pl):
        sheet.paste(crop, (x, y))
        frames[n] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                     'trimmed': (crop.width, crop.height) != im.size,
                     'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                     'sourceSize': {'w': im.width, 'h': im.height}}
    atlas = {'frames': frames, 'meta': {'app': 'frost-village/tools/fx/gen_ui6.py', 'version': '1.0', 'image': '',
                                        'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    return sheet, atlas


def write_assets(fr):
    sheet, atlas = pack_atlas(fr)
    os.makedirs(OUT, exist_ok=True)
    atlas['meta']['image'] = ATLAS + '.png'
    sheet.save(os.path.join(OUT, ATLAS + '.png'), optimize=True)
    with open(os.path.join(OUT, ATLAS + '.json'), 'w') as f:
        json.dump(atlas, f, separators=(',', ':'))
    S = contract_sizes()
    sprites, nine = {}, {}
    for k, fn, notes, fb in ICONS:
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'icon', 'frameSize': [96, 96],
                      'notes': notes, 'replaces': fb}
    for kind in STEP_KEYS:
        for st in ('on', 'off'):
            k = f'ui_gb_step_{kind}_{st}'
            ko, en = STEP_WORDS[kind]
            sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.484], 'kind': 'tracker', 'frameSize': [64, 64],
                          'step': kind, 'state': st, 'word': {'ko': ko, 'en': en},
                          'notes': f'tracker step {kind} ({ko} / {en}), {"done or current: the gold badge" if st == "on" else "not reached yet: the pale grey badge"}. '
                                   'Always write the step word under it (never colour alone). The badge disc is centred '
                                   'at (32, 31) = anchor.',
                          'replaces': 'text tracker'}
    for st, what in (('off', 'not reached'), ('on', 'done'), ('now', 'the current step (put it on the current badge\'s '
                                                                       'upper-right, or use it alone in a compact tracker)')):
        k = f'ui_gb_dot_{st}'
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.486], 'kind': 'tracker', 'frameSize': [28, 28],
                      'notes': f'compact tracker dot: {what}.', 'replaces': 'generated circles'}
    for st in ('off', 'on'):
        k = f'ui_gb_line_{st}'
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'tracker', 'frameSize': [32, 8],
                      'stretchX': True,
                      'notes': f'tracker connector ({"done" if st == "on" else "to come"}): uniform along x and untrimmed - '
                               'image.setDisplaySize(gapWidth, 8) between two badges / dots.',
                      'replaces': 'generated rectangle'}
    for st in ('full', 'empty'):
        k = f'ui_gb_star_{st}'
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.52], 'kind': 'icon', 'frameSize': [32, 32],
                      'notes': f'review star ({st}); reviews are always 4-5 stars.', 'replaces': 'ui3 ui_icon_fame'}
    sprites['ui_gb_logo_ko'] = {'atlas': ATLAS, 'frame': 'ui_gb_logo_ko', 'anchor': [0.5, 0.5], 'kind': 'logo',
                                'frameSize': list(fr['ui_gb_logo_ko'].size), 'bakedText': '금방', 'font': 'Jua',
                                'markCentre': [36, 36], 'markRadius': 30.5,
                                'notes': 'app header logo (ko): the mark + "금방" in navy with a cream rim (reads on the '
                                         'gold header, cream and dark). Header placement: x 44, y 42, scale 0.8 '
                                         '(appLayout.header.logo).', 'replaces': 'runtime text 금방 마켓'}
    sprites['ui_gb_logo_en'] = {'atlas': ATLAS, 'frame': 'ui_gb_logo_en', 'anchor': [0.5, 0.5], 'kind': 'logo',
                                'frameSize': list(fr['ui_gb_logo_en'].size), 'bakedText': 'Geumbang', 'font': 'Fredoka Bold',
                                'markCentre': [36, 36], 'markRadius': 30.5,
                                'notes': 'app header logo (en): the mark + "Geumbang".', 'replaces': 'runtime text Geumbang'}
    sprites['ui_gb_mark'] = {'atlas': ATLAS, 'frame': 'ui_gb_mark', 'anchor': [0.5, 0.484], 'kind': 'logo',
                             'frameSize': [128, 128], 'notes': 'the mark 금방이 alone (app splash, the 금방 letter, '
                                                              'newspaper ad, office row). Symmetric, no letters.',
                             'replaces': 'ui_icon_gb'}
    anims = {}
    names = []
    for anim, (n, fps, rep) in MASCOT_ANIMS.items():
        fl = [f'ui_gb_mascot_{anim}_{i}' for i in range(n)]
        names += fl
        anims[anim] = {'frames': fl, 'fps': fps, 'repeat': rep}
    sprites['ui_gb_mascot'] = {
        'atlas': ATLAS, 'frame': 'ui_gb_mascot_idle_0', 'anchor': [0.5, 0.9], 'kind': 'mascot', 'frameSize': [128, 128],
        'frames': len(names), 'frameNames': names, 'anims': anims, 'neverMirror': True,
        'notes': '금방이 the mascot: the mark\'s parcel on stubby legs with a navy scarf (UI only, never mirrored - '
                 'it runs to the right). idle = stands and waves (3 fps loop), run = runs in (8 fps loop; tween it in '
                 'from the right edge of the header to appLayout.header.mascot when the app opens, then idle), bow = a '
                 'polite bow (3 fps once; on the first delivery / a new review). Feet at the anchor.',
        'replaces': 'ui_icon_gb'}
    for k, (m, inset, extra) in NINE.items():
        im = fr[k]
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [0.5, 0.5], 'kind': 'panel', 'frameSize': list(im.size),
                      'contentInset': inset, 'notes': PANEL_NOTES[k], 'replaces': PANEL_FALLBACK[k]}
        nine[k] = {'atlas': ATLAS, 'frame': k, 'left': m['left'], 'right': m['right'], 'top': m['top'],
                   'bottom': m['bottom'], 'contentInset': inset}
        nine[k].update(extra)
        sprites[k].update(extra)
    sprites['ui_gb_photo'] = {'atlas': ATLAS, 'frame': 'ui_gb_photo', 'anchor': [0.5, 0.5], 'kind': 'frame',
                              'frameSize': [176, 136], 'photoRect': PHOTO_RECT,
                              'notes': 'doorstep photo print (fixed size, not a 9-slice): draw the 128 x 80 render texture '
                                       'at photoRect (x 24, y 16 from the frame\'s top-left) UNDER the frame - the window '
                                       'is transparent and its edge carries a soft inner shade; the gold tape and the '
                                       'mark sticker sit on top. Scale the whole thing for thumbnails.',
                              'replaces': 'ui_icon_gb_doorstep'}
    fxn = [f'fx_gb_bell_{i}' for i in range(4)]
    sprites['fx_gb_bell'] = {'atlas': ATLAS, 'frame': 'fx_gb_bell_0', 'anchor': [0.5, 0.5], 'kind': 'fx',
                             'frameSize': [64, 64], 'frames': 4, 'frameNames': fxn,
                             'anims': {'play': {'frames': fxn, 'fps': 12, 'repeat': 0}},
                             'notes': '띵동 at the door (world space, with sfx_gb_doorbell on ring_doorbell\'s impact frame): '
                                      'the bell pops in, swings with ringing arcs and sparkles, settles. Draw it centred '
                                      '~40 world px above the door bell (geumbangfolk bellPoint) at a constant screen size '
                                      '(about 40 CSS px: setScale(40 / (64 x zoom x 390 / 720))), depth over the courier; '
                                      'destroy on animationcomplete.',
                             'replaces': 'emotes fx_music_notes'}
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    fsum = lambda ks: round(sum(atlas['frames'][k]['frame']['w'] * atlas['frames'][k]['frame']['h'] * 4
                                for k in ks) / 2 ** 20, 3)
    transient = [k for k in REG if k not in RESIDENT]
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_ui6.py (procedural numpy + Pillow on fxlib; house style of ui .. ui5)',
        'conventions': {
            'contract': 'CONTRACT_GEUMBANG §AQ (plan docs/geumbang_plan.md §6, §7, §10). Paths relative to '
                        'frost-village/assets/. Fragment name: ui6 (late fragment, plan §12 G-P6).',
            'brand': BRAND,
            'mark': '금방이: gold disc, goldDark rim, cream sticker border, a face-on cream parcel with navy dot eyes, '
                    'pink cheeks and an "o" mouth, a cream 4-point sparkle above. Same design as assets/geumbang '
                    '(gb_lib.mark, variant A).',
            'text': 'Text is baked ONLY into ui_gb_logo_ko ("금방") and ui_gb_logo_en ("Geumbang"); the game writes every '
                    'other label (Pretendard). Body text >= 15 CSS px (28 logical), tap targets >= 44 CSS px, statuses '
                    'always icon + word.',
            'bakedText': sorted(TEXT_USED),
            'style': 'House soft-toy style (fxlib.toy): dark tinted outline, bevel lit from the upper left, gloss, one '
                     'navy drop shadow; the mark is lit from straight above so it stays its own mirror image.',
            'nineSlice': "Panel frames live in the atlas UNTRIMMED: this.add.nineslice(x, y, 'ui6_gb', key, w, h, left, "
                         'right, top, bottom) with nineSlice[key]. contentInset = [left, top, right, bottom] px from the '
                         'stretched edges where content goes. Chip and ribbon: build them at their source height and '
                         'scale uniformly (minHeight).',
            'iconSize': [96, 96],
            'pageSize': [sheet.width, sheet.height],
            'pageMiB': round(page_mib, 3),
            'pagePlan': {
                'why': 'plan §10.4: the build packs the resident part with gb_bld_0 into gb_core; the app frames, '
                       'tracker, logos and mascot ship as a transient page acquired only while the app is open.',
                'resident': RESIDENT, 'residentMiB': fsum(RESIDENT),
                'transientApp': transient, 'transientMiB': fsum(transient),
            },
            'appLayout': APP,
            'appLayoutNotes': 'Suggested layout of the 720 x 1100 logical app panel (plan §6): the phone 9-slice fills '
                              'the panel; header / tabs / content rects are in panel px; tracker y and x0..x1 are card '
                              'px. The panel fills the viewport width, so every tap target is >= 88 logical (44 CSS on '
                              'a 360 CSS phone, 47.7 on 390), body text 30 (15 / 16.3 CSS) and no text under 24 '
                              '(12 / 13 CSS). Tabs / the follow button are the 64-tall 9-slices scaled uniformly by '
                              'tabs.scale / button.scale; the catalog sell toggle is drawn 44 tall but its hit area is '
                              'the 88-tall right half of the row (toggle.hitH). English tab words are the short set '
                              'Today / Order / Shop / Crew / Stars. docs/previews/ui6_app.png and ui6_phaser_*.png '
                              'show it.',
            'codeFallback': CODE_FALLBACK,
        },
        'atlases': [{'key': ATLAS, 'png': f'ui6/{ATLAS}.png', 'json': f'ui6/{ATLAS}.json'}],
        'sprites': sprites,
        'nineSlice': nine,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    return sheet, atlas, man


PANEL_NOTES = {
    'ui_gb_phone': 'the 금방 앱 panel (720 x 1100 logical, non-pausing) drawn as the chief\'s phone: charcoal bezel, '
                   'speaker slot + camera, cream screen. screenRect [21, 30, 318, 580] at the source size; the screen '
                   'corners are r 30, so the header (r 30) sits flush in it. Build it at 720 x 1100 (the top-centre '
                   'speaker slot widens with the width - fine for 1.6-2.2x).',
    'ui_gb_header': 'the app header (gold): rounded top corners r 30 = the phone screen\'s, a goldDark lip, a soft '
                    'shadow onto the screen below (the last 12 px). Logo left, tagline under it (navy, 26 px), close '
                    'button right, the mascot runs in between (appLayout.header).',
    'ui_gb_tab': 'app tab (not selected): pale cream; write the word in warm grey #8A7A62 next to the tab icon.',
    'ui_gb_tab_on': 'app tab (selected): gold with gloss and a small shadow; word in navy. Same size and margins as '
                    'ui_gb_tab so they swap in place. A new-content dot is code (a 14 px gold circle, white rim).',
    'ui_gb_card': 'order / product / stat card: warm white, hairline border, soft shadow, a gold strip down the left '
                  'edge (inside the left margin). Done cards may setTint(0xF4F1EA).',
    'ui_gb_chip': 'HUD 금방 chip (plan §6: 120 x 44 CSS under the 업무 chip) and in-app buttons (따라가기): cream pill with '
                  'a gold rim; ui_chip rules - build at 64 tall, setScale(h / 64) for smaller chips (minHeight 64).',
    'ui_gb_toast': 'toast (top centre under the clock row, <= 300 x 48 CSS): cream with a gold left edge; icon at '
                   'contentInset left, one line of text.',
    'ui_gb_ribbon': 'blank gold ribbon with swallowtail ends for 특가 / 배달 중 / NEW labels (navy text, centred). Build it '
                    '48 tall and stretch only the width (minHeight 48).',
}
PANEL_FALLBACK = {'ui_gb_phone': 'ui5 ui_letter', 'ui_gb_header': 'ui5 ui_chip', 'ui_gb_tab': 'ui5 ui_office_tab',
                  'ui_gb_tab_on': 'ui5 ui_office_tab_on', 'ui_gb_card': 'ui5 ui_letter', 'ui_gb_chip': 'ui5 ui_chip',
                  'ui_gb_toast': 'ui5 ui_chip', 'ui_gb_ribbon': 'ui5 ui_chip'}


# =========================================================================== brand maths (ΔE2000, colour pairs)
def srgb_to_lab(rgb):
    """rgb (..., 3) in 0..1 -> CIE Lab (D65)."""
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def de2000(lab1, lab2):
    L1, a1, b1 = lab1[..., 0], lab1[..., 1], lab1[..., 2]
    L2, a2, b2 = lab2[..., 0], lab2[..., 1], lab2[..., 2]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    Gf = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = a1 * (1 + Gf), a2 * (1 + Gf)
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p, h2p = np.degrees(np.arctan2(b1, a1p)) % 360, np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dh = h2p - h1p
    dh = np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh))
    dh = np.where(C1p * C2p == 0, 0, dh)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hs = h1p + h2p
    hbp = np.where(np.abs(h1p - h2p) > 180, np.where(hs < 360, (hs + 360) / 2, (hs - 360) / 2), hs / 2)
    hbp = np.where(C1p * C2p == 0, hs, hbp)
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dth = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def lab_hex(h):
    return srgb_to_lab(np.asarray(hexc(h), np.float64))


BRAND_PAIRS = [('UPS', '#351C15', '#FFB500'), ('DHL', '#FFCC00', '#D40511'), ('Coupang', '#E52528', '#346AFF'),
               ('Baemin', '#2AC1BC', '#FFFFFF'), ('Kurly', '#5F0080', '#FFFFFF'), ('Korea Post', '#E60012', '#F39800'),
               ('Yamato', '#FFC20E', '#000000'), ('IKEA-like', '#FFDA1A', '#0058A3')]


def colour_areas(im, k=2):
    """The k largest colour areas of the opaque px: greedy clustering of 4-bit-per-channel bins by ΔE2000 < 12."""
    a = np.asarray(im).astype(np.float64)
    op = a[..., 3] > 200
    px = a[op][:, :3] / 255.0
    if len(px) == 0:
        return []
    q = np.floor(px * 15.999).astype(int)
    keys, inv, cnt = np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2], return_inverse=True, return_counts=True)
    means = np.zeros((len(keys), 3))
    np.add.at(means, inv, px)
    means /= cnt[:, None]
    labs = srgb_to_lab(means)
    order = np.argsort(-cnt)
    clusters = []                     # [lab, count]
    for i in order:
        for cl in clusters:
            if de2000(cl[0], labs[i]) < 12:
                cl[1] += cnt[i]
                break
        else:
            clusters.append([labs[i], int(cnt[i])])
    clusters.sort(key=lambda c: -c[1])
    tot = float(len(px))
    return [(c[0], c[1] / tot) for c in clusters[:k]]


def pair_risk(im):
    """Smallest ΔE2000 (max over the two colours) between the sprite's two largest colour areas and any brand pair."""
    ca = colour_areas(im, 2)
    if len(ca) < 2:
        return ('-', 99.0)
    best = ('-', 99.0)
    for name, h1, h2 in BRAND_PAIRS:
        l1, l2 = lab_hex(h1), lab_hex(h2)
        d = min(max(de2000(ca[0][0], l1), de2000(ca[1][0], l2)), max(de2000(ca[0][0], l2), de2000(ca[1][0], l1)))
        if d < best[1]:
            best = (name, float(d))
    return best


def navy_share(im):
    a = np.asarray(im).astype(np.float64)
    op = a[..., 3] > 128
    if not op.any():
        return 0.0
    labs = srgb_to_lab(a[op][:, :3] / 255.0)
    return float((de2000(labs, lab_hex(BRAND['navy'])) < 10).mean())


def mirror_diff(im):
    a = np.asarray(im).astype(int)
    b = a[:, ::-1]
    return float((np.abs(a - b).max(axis=2) > 24).mean())


# =========================================================================== previews
PBG = {'cream': (255, 248, 236, 255), 'gold': (242, 179, 61, 255), 'dark': (43, 47, 58, 255),
       'snow': (226, 233, 242, 255)}


def _label(d, xy, t, size=16, fill=(30, 40, 60, 255), anchor='la'):
    d.text(xy, t, font=CF.font(size), fill=fill, anchor=anchor)


def preview_icons(fr, path):
    """The 14 icons at 96 / 48 / 32 / 24 px on the app cream, then strips at 48 px on gold, dark and snow + night."""
    keys = [k for k, *_ in ICONS]
    cols, cw, ch = 7, 220, 160
    rows = (len(keys) + cols - 1) // cols
    W = cols * cw + 20
    H = 80 + rows * ch + 4 * 72 + 30
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    _label(d, (10, 10), 'ui6 icons - 14 at 96 / 48 / 32 / 24 px (house soft-toy style, brand gold / cream / navy, no text)', 24)
    _label(d, (10, 44), 'labels by the game; the 32 px column is the tab / chip size on a 390 CSS px phone', 15,
           (80, 90, 110, 255))
    for i, k in enumerate(keys):
        x0, y0 = 10 + (i % cols) * cw, 76 + (i // cols) * ch
        d.rounded_rectangle((x0, y0, x0 + cw - 8, y0 + ch - 8), radius=14, fill=PBG['cream'], outline=(214, 196, 166, 255))
        out.alpha_composite(fr[k], (x0 + 4, y0 + 6))
        out.alpha_composite(fr[k].resize((48, 48), Image.LANCZOS), (x0 + 104, y0 + 10))
        out.alpha_composite(fr[k].resize((32, 32), Image.LANCZOS), (x0 + 158, y0 + 18))
        out.alpha_composite(fr[k].resize((24, 24), Image.LANCZOS), (x0 + 108, y0 + 70))
        _label(d, (x0 + 104 + 32, y0 + 76), '24', 12, (120, 110, 90, 255))
        _label(d, (x0 + 8, y0 + 106), k.replace('ui_icon_', ''), 15, (50, 60, 80, 255))
    y = 76 + rows * ch + 6
    for name, night in (('gold', False), ('dark', False), ('cream', False), ('snow', True)):
        strip_ = Image.new('RGBA', (W - 20, 64), PBG[name])
        for i, k in enumerate(keys):
            strip_.alpha_composite(fr[k].resize((48, 48), Image.LANCZOS), (8 + i * 62, 8))
        if night:
            strip_ = CF.apply_night(strip_)
        out.paste(strip_, (10, y))
        _label(d, (W - 16, y + 46), name + (' + night' if night else ''), 14,
               (255, 255, 255, 255) if name == 'dark' else (30, 40, 60, 255), 'rs')
        y += 70
    out.save(path)
    return path


def preview_tracker(fr, path):
    """Steps on / off, dots, lines, stars, and the tracker at every stage at app size."""
    W, H = 1180, 760
    out = Image.new('RGBA', (W, H), PBG['cream'])
    d = ImageDraw.Draw(out)
    _label(d, (12, 10), 'ui6 tracker: ui_gb_step_* (on / off), ui_gb_dot_*, ui_gb_line_*, ui_gb_star_* - icon AND word', 22)
    for i, k in enumerate(STEP_KEYS):
        for j, st in enumerate(('on', 'off')):
            x, y = 20 + i * 150, 54 + j * 96
            out.alpha_composite(fr[f'ui_gb_step_{k}_{st}'], (x, y))
            out.alpha_composite(fr[f'ui_gb_step_{k}_{st}'].resize((32, 32), Image.LANCZOS), (x + 74, y + 16))
            _label(d, (x + 32, y + 68), STEP_WORDS[k][0], 15, (59, 63, 82, 255), 'ma')
    x = 790
    for j, st in enumerate(('off', 'on', 'now')):
        out.alpha_composite(fr[f'ui_gb_dot_{st}'], (x + j * 50, 60))
        _label(d, (x + j * 50 + 14, 94), st, 13, (90, 90, 100, 255), 'ma')
    for j, st in enumerate(('off', 'on')):
        out.alpha_composite(fr[f'ui_gb_line_{st}'].resize((120, 8), Image.LANCZOS), (x, 130 + j * 22))
    for j, st in enumerate(('full', 'empty')):
        out.alpha_composite(fr[f'ui_gb_star_{st}'], (x + 160 + j * 40, 124))
    y = 260
    for stage in range(5):
        card = _nine(fr, 'ui_gb_card', 560, 110)
        out.alpha_composite(card, (20, y))
        dd = ImageDraw.Draw(out)
        tracker(out, fr, dd, 70, 530, y + 44, stage, font=CF.font(20))
        if stage < 4:
            card2 = _nine(fr, 'ui_gb_card', 560, 110)
            out.alpha_composite(card2, (600, y))
            tracker(out, fr, dd, 650, 1110, y + 44, stage, en=True, font=CF.font(18))
        y += 120 if stage < 4 else 0
    out.save(path)
    return path


def preview_logos(fr, path):
    """Logos and the mark on the app gold, cream and dark, at 1x, the header size (0.8x) and small; the mark at 24 px."""
    W, H = 1160, 560
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    _label(d, (12, 10), 'ui_gb_logo_ko / _en (the only baked text: Jua "금방", Fredoka "Geumbang") + ui_gb_mark', 22)
    for j, bg in enumerate(('gold', 'cream', 'dark')):
        y = 50 + j * 160
        d.rectangle((10, y, W - 10, y + 150), fill=PBG[bg])
        out.alpha_composite(fr['ui_gb_logo_ko'], (20, y + 26))
        out.alpha_composite(fr['ui_gb_logo_en'], (290, y + 26))
        out.alpha_composite(fr['ui_gb_mark'], (630, y + 10))
        out.alpha_composite(_scaled(fr['ui_gb_logo_ko'], 0.5), (780, y + 20))
        out.alpha_composite(_scaled(fr['ui_gb_logo_en'], 0.5), (780, y + 80))
        for s, xx in ((48, 960), (32, 1020), (24, 1065), (16, 1100)):
            out.alpha_composite(fr['ui_gb_mark'].resize((s, s), Image.LANCZOS), (xx, y + 60 - s // 2))
    _label(d, (12, 530), 'right: the logos at 0.5x and the mark at 48 / 32 / 24 / 16 px (it must read at 24 px)', 15,
           (80, 90, 110, 255))
    out.save(path)
    return path


def preview_mascot(fr, path_png, path_gif):
    frames = {a: [fr[f'ui_gb_mascot_{a}_{i}'] for i in range(n)] for a, (n, _, _) in MASCOT_ANIMS.items()}
    W, H = 3 * 300 + 20, 330
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    _label(d, (12, 8), 'ui_gb_mascot 금방이 (128², anchor 0.5, 0.9): idle 2 f · run 4 f 8 fps · bow 2 f - UI only, never '
                       'mirrored', 18)
    x = 10
    for a, fl in frames.items():
        for i, im in enumerate(fl):
            bg = Image.new('RGBA', (128, 128), PBG['gold'] if a == 'run' else PBG['cream'])
            bg.alpha_composite(im)
            out.alpha_composite(bg, (x + (i % 2) * 140, 44 + (i // 2) * 140))
            ax, ay = x + (i % 2) * 140 + 64, 44 + (i // 2) * 140 + 115.2
            d.line((ax - 4, ay, ax + 4, ay), fill=(255, 0, 90, 200))
            d.line((ax, ay - 4, ax, ay + 4), fill=(255, 0, 90, 200))
        _label(d, (x, 316), a, 15, (50, 60, 80, 255))
        x += 300
    out.save(path_png)
    # GIF: idle x2, run x3, bow (held) on cream / gold / dark
    seq = frames['idle'] * 3 + frames['run'] * 4 + [frames['bow'][0]] * 2 + [frames['bow'][1]] * 4
    F.save_gif([f.resize((192, 192), Image.LANCZOS) for f in seq], path_gif, 6,
               panels=('#FFF8EC', '#F2B33D', '#2B2F3A'))
    return path_png, path_gif


def preview_bell(fr, path):
    seq = [fr[f'fx_gb_bell_{i}'] for i in range(4)]
    return F.save_gif([f.resize((128, 128), Image.LANCZOS) for f in seq], path, 12, panels=('#F4F7FB', '#C9D4E6', '#3E4A7E'),
                      hold=6)


def preview_panels(fr, man, path):
    """The 9-slice frames at source size with margins (red) and contentInset (green), and the photo frame."""
    keys = NINE_KEYS + ['ui_gb_photo']
    W, H = 1240, 760
    out = Image.new('RGBA', (W, H), (96, 106, 136, 255))
    d = ImageDraw.Draw(out)
    _label(d, (12, 8), 'ui6 frames at source size: 9-slice margins (red), contentInset (green), photoRect (cyan)', 18,
           (255, 255, 255, 255))
    x, y, rowh = 10, 40, 0
    for k in keys:
        im = fr[k]
        if x + im.width > W - 10:
            x, y, rowh = 10 + 380, y + rowh + 30, 0
        out.alpha_composite(im, (x, y + 18))
        _label(d, (x, y), k, 14, (255, 255, 255, 255))
        n = man['nineSlice'].get(k)
        if n:
            for xx in (x + n['left'], x + im.width - n['right']):
                d.line((xx, y + 18, xx, y + 18 + im.height), fill=(230, 40, 60, 220))
            for yy in (y + 18 + n['top'], y + 18 + im.height - n['bottom']):
                d.line((x, yy, x + im.width, yy), fill=(230, 40, 60, 220))
            l, t, r, b = n['contentInset']
            d.rectangle((x + l, y + 18 + t, x + im.width - r, y + 18 + im.height - b), outline=(40, 200, 90, 200))
        if k == 'ui_gb_photo':
            px, py, pw, ph = PHOTO_RECT
            d.rectangle((x + px, y + 18 + py, x + px + pw, y + 18 + py + ph), outline=(0, 220, 255, 255))
        rowh = max(rowh, im.height + 18)
        x += im.width + 20
        if k == 'ui_gb_phone':
            x, y, rowh = 390, 40, 0
    out.save(path)
    return path


def preview_app(fr, path):
    """The app at 720 x 1100 logical (shown 1/2): 오늘, 주문, 상품 in Korean and 주문 in English - plus the HUD pieces."""
    tabs = [('today', False), ('order', False), ('catalog', False), ('order', True)]
    W = 4 * 370 + 20
    out = Image.new('RGBA', (W, 640), (214, 222, 234, 255))
    d = ImageDraw.Draw(out)
    _label(d, (12, 8), '금방 마켓 app (ui_gb_phone / header / tab / card / ribbon / chip / photo + icons, tracker, logo, '
                       'mascot) at 720 x 1100 logical, shown 1/2; text by the game (Pretendard)', 16)
    for i, (tab, en) in enumerate(tabs):
        im = app_mock(fr, tab, en).resize((360, 550), Image.LANCZOS)
        out.alpha_composite(im, (10 + i * 370, 40))
        _label(d, (10 + i * 370, 598), f'{tab} ({"en" if en else "ko"})', 15)
    out.save(path)
    return path


def preview_hud(fr, path):
    """HUD pieces at phone scale on snow: the 금방 chip, a toast, an order bubble icon, the doorbell FX."""
    W, H = 1170, 680
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    snow = Image.open(os.path.join(ASSETS, 'ground/ground_snow.png')).convert('RGBA')
    for yy in range(0, H, snow.height):
        for xx in range(0, W, snow.width):
            out.paste(snow, (xx, yy))
    d = ImageDraw.Draw(out)
    k = 3.0                                        # device px per CSS px
    chip = _nine(fr, 'ui_gb_chip', 120 / 44 * 64, 64)
    chip = chip.resize((int(120 * k), int(44 * k)), Image.LANCZOS)
    out.alpha_composite(chip, (int(16 * k), int(20 * k)))
    _icon(out, fr, 'ui_icon_gb', int(16 * k + 22 * k), int(20 * k + 22 * k), int(30 * k))
    d.text((int(16 * k + 42 * k), int(20 * k + 22 * k)), '배달 중 3', font=CF.font(int(15 * k)), fill=NAVY_T, anchor='lm')
    d.ellipse((int(16 * k + 110 * k), int(18 * k), int(16 * k + 122 * k), int(30 * k)), fill=(242, 179, 61, 255),
              outline=(255, 255, 255, 255), width=4)
    toast = _nine(fr, 'ui_gb_toast', 300 / 48 * 64, 64).resize((int(300 * k), int(48 * k)), Image.LANCZOS)
    out.alpha_composite(toast, (int(45 * k), int(80 * k)))
    _icon(out, fr, 'ui_icon_gb_order', int(45 * k + 34 * k), int(80 * k + 23 * k), int(32 * k))
    d.text((int(45 * k + 56 * k), int(80 * k + 23 * k)), '띵동! 새 주문 · 민지네 · 빵 3', font=CF.font(int(15 * k)),
           fill=INK_T, anchor='lm')
    # order bubble (ui_emote_bubble stand-in: a white round bubble) with the cart + bread
    bx, by = int(30 * k), int(150 * k)
    d.rounded_rectangle((bx, by, bx + int(84 * k), by + int(48 * k)), radius=int(20 * k), fill=(255, 255, 255, 255),
                        outline=(160, 172, 196, 255), width=4)
    _icon(out, fr, 'ui_icon_gb_cart', bx + int(24 * k), by + int(24 * k), int(34 * k))
    _paste_item(out, 'item_bread', bx + int(60 * k), by + int(24 * k), int(26 * k))
    _label(d, (bx, by + int(52 * k)), 'order bubble: cart + item', int(9 * k), (60, 70, 90, 255))
    for i in range(4):
        b = fr[f'fx_gb_bell_{i}'].resize((int(40 * k), int(40 * k)), Image.LANCZOS)
        out.alpha_composite(b, (int((170 + i * 50) * k), int(150 * k)))
    _label(d, (int(170 * k), int(202 * k)), 'fx_gb_bell 0-3 at 40 CSS px', int(9 * k), (60, 70, 90, 255))
    ms = fr['ui_gb_mascot_idle_1'].resize((int(64 * k), int(64 * k)), Image.LANCZOS)
    out.alpha_composite(ms, (int(300 * k), int(16 * k)))
    out.save(path)
    return path


def preview_brand(fr, path, report):
    """Brand-safety sheet: palette, the mark against its mirror, per-sprite navy share and colour-pair distance."""
    W, H = 1200, 620
    out = Image.new('RGBA', (W, H), (250, 250, 252, 255))
    d = ImageDraw.Draw(out)
    _label(d, (12, 10), '금방 brand check (ui6): palette, mark mirror, navy share, two largest colour areas vs real '
                        'couriers (ΔE2000, fail < 15)', 18)
    for i, (n, h) in enumerate(BRAND.items()):
        d.rounded_rectangle((20 + i * 150, 46, 150 + i * 150, 96), radius=10, fill=hexc_rgb(h), outline=(0, 0, 0, 60))
        _label(d, (20 + i * 150, 100), f'{n} {h}', 13)
    m = fr['ui_gb_mark']
    out.alpha_composite(m, (820, 30))
    out.alpha_composite(m.transpose(Image.FLIP_LEFT_RIGHT), (960, 30))
    _label(d, (820, 162), f'mark vs its mirror: {mirror_diff(m) * 100:.2f} % px differ (<= 6 %)', 13)
    y = 190
    for x0 in (20, 620):
        _label(d, (x0, y), 'key', 13)
        _label(d, (x0 + 260, y), 'navy %', 13)
        _label(d, (x0 + 340, y), 'closest pair', 13)
        _label(d, (x0 + 480, y), 'ΔE2000', 13)
    rows = sorted(report.items(), key=lambda kv: kv[1]['pair'][1])
    for i, (k, r) in enumerate(rows[:34]):
        col, xo = (i // 17), (i % 17)
        x0, yy = 20 + col * 600, y + 22 + xo * 22
        _label(d, (x0, yy), k, 13, (50, 60, 80, 255))
        _label(d, (x0 + 260, yy), f'{r["navy"] * 100:.1f}', 13)
        _label(d, (x0 + 340, yy), r['pair'][0], 13)
        _label(d, (x0 + 480, yy), f'{r["pair"][1]:.1f}', 13, (200, 40, 40, 255) if r['pair'][1] < 15 else (40, 120, 60, 255))
    _label(d, (20, H - 24), 'the 34 sprites closest to a real courier pair are listed; every sprite is checked by '
                            'gen_ui6.py --check', 13, (80, 90, 110, 255))
    out.save(path)
    return path


# =========================================================================== check
def check():
    errs, warns = [], []
    mp = os.path.join(OUT, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: assets/ui6/manifest.json missing')
        return 1
    man = json.load(open(mp))
    files = sorted(os.listdir(OUT))
    if files != ['manifest.json', 'ui6_gb.json', 'ui6_gb.png']:
        errs.append(f'file budget: AQ ships 3 source files (2 shipped), found {files}')
    a = man['atlases'][0]
    sheet = Image.open(os.path.join(ASSETS, a['png']))
    js = json.load(open(os.path.join(ASSETS, a['json'])))
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    if sheet.mode != 'RGBA' or sheet.width > 1024 or sheet.height > 1024:
        errs.append(f'atlas {sheet.size} {sheet.mode} (RGBA <= 1024 x 1024)')
    if page_mib > 2.5:
        errs.append(f'page {page_mib:.3f} MiB > 2.5 MiB (AQ)')
    S = contract_sizes()
    full = {}
    for k, size in S.items():
        f = js['frames'].get(k)
        if not f:
            errs.append(f'atlas frame {k} missing')
            continue
        if (f['sourceSize']['w'], f['sourceSize']['h']) != size:
            errs.append(f'{k}: sourceSize {f["sourceSize"]} != {size}')
        r, s = f['frame'], f['spriteSourceSize']
        im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        im.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
        full[k] = im
        if k in UNTRIMMED and (f['trimmed'] or (r['w'], r['h']) != size):
            errs.append(f'{k}: must be untrimmed (NineSlice / stretch / photoRect use the whole frame)')
    for k, mx in LOGO_MAX.items():
        f = js['frames'].get(k)
        if not f:
            errs.append(f'atlas frame {k} missing')
            continue
        w, h = f['sourceSize']['w'], f['sourceSize']['h']
        if w > mx[0] or h > mx[1]:
            errs.append(f'{k}: {w} x {h} > {mx}')
        r, s = f['frame'], f['spriteSourceSize']
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        im.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
        full[k] = im
    extra = set(js['frames']) - set(S) - set(LOGO_MAX)
    if extra:
        errs.append(f'unexpected atlas frames {sorted(extra)}')
    sp = man['sprites']
    # manifest entries
    for k, *_ in ICONS:
        e = sp.get(k)
        if not e or e.get('frameSize') != [96, 96] or e.get('anchor') != [0.5, 0.5] or not e.get('replaces'):
            errs.append(f'{k}: manifest entry / frameSize / anchor / replaces (code stand-in)')
    m = sp.get('ui_gb_mascot', {})
    if m.get('anchor') != [0.5, 0.9] or m.get('frameSize') != [128, 128]:
        errs.append('ui_gb_mascot: anchor [0.5, 0.9] / frameSize 128')
    an = m.get('anims', {})
    for anim, (n, fps, rep) in (('idle', (2, None, None)), ('run', (4, 8, -1)), ('bow', (2, None, None))):
        e = an.get(anim)
        if not e or len(e['frames']) != n or (fps and e['fps'] != fps) or (rep is not None and e['repeat'] != rep):
            errs.append(f'ui_gb_mascot anim {anim}: {e}')
    bell = sp.get('fx_gb_bell', {})
    pl = bell.get('anims', {}).get('play', {})
    if pl.get('fps') != 12 or pl.get('repeat') != 0 or len(pl.get('frames', [])) != 4:
        errs.append(f'fx_gb_bell: 4 f, 12 fps, once ({pl})')
    nine = man.get('nineSlice', {})
    for k in NINE_KEYS:
        n = nine.get(k)
        if not n or n.get('frame') != k or len(n.get('contentInset', [])) != 4:
            errs.append(f'{k}: nineSlice / contentInset missing')
            continue
        im = full.get(k)
        if im is None:
            continue
        arr = np.asarray(im).astype(np.float32)
        L, T, R, B = n['left'], n['top'], n['right'], n['bottom']
        mid = arr[T:im.height - B, L:im.width - R]
        if mid.size and np.abs(np.diff(mid, axis=1)).max() > 24:
            errs.append(f'{k}: centre not uniform along x (would smear when stretched)')
        band = arr[T:im.height - B]
        # side columns stretch along y (unless the frame is built at its source height: minHeight): they must be
        # uniform along y too (vertical gradient steps are tiny)
        if not n.get('minHeight') and band.size and np.abs(np.diff(band[:, :L], axis=0)).max() > 24:
            errs.append(f'{k}: left column not uniform along y (would smear when stretched vertically)')
    if nine.get('ui_gb_chip', {}).get('minHeight') != 64:
        errs.append('ui_gb_chip: minHeight 64 (ui_chip rules)')
    ph = sp.get('ui_gb_photo', {})
    if ph.get('photoRect') != PHOTO_RECT:
        errs.append(f'ui_gb_photo: photoRect {ph.get("photoRect")} != {PHOTO_RECT}')
    elif 'ui_gb_photo' in full:
        x, y, w, h = PHOTO_RECT
        win = np.asarray(full['ui_gb_photo'])[y + 6:y + h - 6, x + 6:x + w - 6, 3]
        if win.max() > 8:
            errs.append('ui_gb_photo: the photo window is not transparent')
    pp = man['conventions'].get('pagePlan', {})
    if set(pp.get('resident', [])) | set(pp.get('transientApp', [])) != set(js['frames']):
        errs.append('pagePlan: resident + transientApp must cover every frame exactly')
    # the suggested app layout keeps tap targets / text sizes on the narrowest design phone (panel = viewport width)
    L = man['conventions'].get('appLayout', {})
    try:
        for css_w in L['designCss']:
            k_ = css_w / L['panel'][0]
            taps = {'tab height': L['tabs']['h'], 'close button': 2 * L['header']['close'][2],
                    'follow button': L['button']['h'], 'toggle hit row': L['toggle']['hitH']}
            for nm, v in taps.items():
                if v * k_ < L['tapMinCss'] - 0.05:
                    errs.append(f'appLayout: {nm} {v * k_:.1f} CSS px < {L["tapMinCss"]} on a {css_w} CSS phone')
            if L['card']['font'] * k_ < L['bodyMinCss'] - 0.05:
                errs.append(f'appLayout: body text {L["card"]["font"] * k_:.1f} CSS px < {L["bodyMinCss"]} at {css_w}')
            small_ = min(L['card']['small'], L['tabs']['fontEn'], L['tracker']['labelFontEn'], L['header']['tagline'][2])
            if small_ * k_ < L['textMinCss'] - 0.05:
                errs.append(f'appLayout: smallest text {small_ * k_:.1f} CSS px < {L["textMinCss"]} at {css_w}')
    except (KeyError, TypeError) as e:
        errs.append(f'appLayout incomplete: {e!r}')
    # text only in the logo keys (recorded at render time)
    bt = set(man['conventions'].get('bakedText', []))
    if bt != LOGO_KEYS:
        errs.append(f'baked text in {sorted(bt)} - only {sorted(LOGO_KEYS)} may carry letters')
    # readability at 32 px (icons), border clearance
    cream, dark = np.array([255, 248, 236], np.float32), np.array([43, 47, 58], np.float32)
    lw = np.array([0.299, 0.587, 0.114], np.float32)
    readability = {}
    for k, *_ in ICONS:
        im = full.get(k)
        if im is None:
            continue
        sm = np.asarray(im.resize((32, 32), Image.LANCZOS)).astype(np.float32)
        al = sm[..., 3:] / 255
        cov = float((al > 0.5).mean())
        if cov < 0.18:
            errs.append(f'{k}: only {cov:.0%} solid at 32 px')
        elif cov < 0.28:
            warns.append(f'{k}: {cov:.0%} solid at 32 px (house icons >= 29 %)')
        cons = []
        for bg in (cream, dark):
            comp = sm[..., :3] * al + bg * (1 - al)
            inside = al[..., 0] > 0.5
            c_ = float(np.percentile(np.abs(comp @ lw - bg @ lw)[inside], 90)) if inside.sum() else 0
            cons.append(c_)
            if c_ < 40:
                errs.append(f'{k}: weak contrast at 32 px')
        readability[k] = (cov, *cons)
        a96 = np.asarray(im)[..., 3]
        if max(a96[0].max(), a96[-1].max(), a96[:, 0].max(), a96[:, -1].max()) > 40:
            errs.append(f'{k}: art touches the 96 px frame border')
    for k in [k for k in full if k.startswith('ui_gb_mascot') or k.startswith('fx_gb_bell') or k.startswith('ui_gb_step')
              or k in ('ui_gb_mark',) or k in LOGO_KEYS]:
        a_ = np.asarray(full[k])[..., 3]
        if max(a_[0].max(), a_[-1].max(), a_[:, 0].max(), a_[:, -1].max()) > 40:
            errs.append(f'{k}: art touches the frame border')
    # brand: mark symmetry, navy share, colour pairs
    for k in ('ui_icon_gb', 'ui_gb_mark'):
        if k in full:
            md = mirror_diff(full[k])
            if md > 0.06:
                errs.append(f'{k}: the mark differs from its own mirror by {md:.1%} (<= 6 %)')
    report = {}
    for k, im in full.items():
        ns = navy_share(im)
        pr = pair_risk(im) if k not in ('ui_gb_line_off', 'ui_gb_line_on') else ('-', 99.0)
        report[k] = {'navy': ns, 'pair': pr}
        if ns > 0.15:
            errs.append(f'{k}: navy {ns:.1%} of the opaque px (<= 15 %)')
        if pr[1] < 15:
            errs.append(f'{k}: two largest colour areas within ΔE2000 {pr[1]:.1f} of {pr[0]}')
    worst = sorted(report.items(), key=lambda kv: kv[1]['pair'][1])[:3]
    print('  closest courier pairs: ' + ', '.join(f'{k} {v["pair"][0]} {v["pair"][1]:.1f}' for k, v in worst))
    nv = sorted(report.items(), key=lambda kv: -kv[1]['navy'])[:3]
    print('  most navy: ' + ', '.join(f'{k} {v["navy"] * 100:.1f} %' for k, v in nv))
    thin = sorted(readability.items(), key=lambda kv: kv[1][0])[:4]
    print('  thinnest icons at 32 px (solid, contrast cream / dark): ' + ', '.join(
        f'{k.replace("ui_icon_gb_", "")} {v[0]:.2f} {v[1]:.0f}/{v[2]:.0f}' for k, v in thin))
    print(f'  mark mirror diff: ui_icon_gb {mirror_diff(full["ui_icon_gb"]) * 100:.2f} %, ui_gb_mark '
          f'{mirror_diff(full["ui_gb_mark"]) * 100:.2f} %')
    fs = sum(f['frame']['w'] * f['frame']['h'] * 4 for f in js['frames'].values()) / 2 ** 20
    src_bytes = sum(os.path.getsize(os.path.join(OUT, f)) for f in files)
    print(f'ui6 check: {len(js["frames"])} frames, page {sheet.width} x {sheet.height} = {page_mib:.3f} MiB RGBA '
          f'(frames {fs:.3f}), resident {pp.get("residentMiB")} / transient {pp.get("transientMiB")} MiB, '
          f'files {src_bytes / 1024:.0f} KB')
    for w in warns:
        print('WARN:', w)
    for e in errs:
        print('ERROR:', e)
    print(f'{len(errs)} errors, {len(warns)} warnings')
    check.report = report
    return len(errs)


# =========================================================================== main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--look', default='')
    ap.add_argument('--mock', action='store_true')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--no-preview', action='store_true')
    ap.add_argument('--preview-only', action='store_true', help='previews from the cached frames + delivered manifest')
    a = ap.parse_args()
    if a.look:
        keys = list(ALL_DRAW) if a.look == 'all' else [k.strip() for k in a.look.split(',') if k.strip()]
        print(look(keys))
        return
    if a.check:
        sys.exit(1 if check() else 0)
    fr = render_all()
    if a.mock:
        snow = Image.open(os.path.join(ASSETS, 'ground/ground_snow.png')).convert('RGBA')
        bg = Image.new('RGBA', (720, 1556))
        for yy in range(0, 1556, snow.height):
            for xx in range(0, 720, snow.width):
                bg.paste(snow, (xx, yy))
        for tab in ('order', 'today', 'catalog'):
            for en in (False, True):
                p = os.path.join(CACHE, f'mock_{tab}_{"en" if en else "ko"}.png')
                phone_shot(app_mock(fr, tab, en), bg).save(p)
                print(p)
        return
    if a.preview_only:
        man = json.load(open(os.path.join(OUT, 'manifest.json')))
    else:
        sheet, atlas, man = write_assets(fr)
        print(f'assets/ui6: {len(atlas["frames"])} frames, page {sheet.size} = {man["conventions"]["pageMiB"]} MiB')
    n_err = check()
    if not a.no_preview:
        os.makedirs(PREV, exist_ok=True)
        print(preview_icons(fr, os.path.join(PREV, 'ui6_icons.png')))
        print(preview_tracker(fr, os.path.join(PREV, 'ui6_tracker.png')))
        print(preview_logos(fr, os.path.join(PREV, 'ui6_logos.png')))
        print(*preview_mascot(fr, os.path.join(PREV, 'ui6_mascot.png'), os.path.join(PREV, 'ui6_mascot.gif')))
        print(preview_bell(fr, os.path.join(PREV, 'ui6_fx_bell.gif')))
        print(preview_panels(fr, man, os.path.join(PREV, 'ui6_panels.png')))
        print(preview_app(fr, os.path.join(PREV, 'ui6_app.png')))
        print(preview_hud(fr, os.path.join(PREV, 'ui6_hud.png')))
        print(preview_brand(fr, os.path.join(PREV, 'ui6_brand.png'), check.report))
    sys.exit(1 if n_err else 0)


if __name__ == '__main__':
    main()
