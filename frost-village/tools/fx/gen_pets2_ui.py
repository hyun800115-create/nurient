"""
gen_pets2_ui.py - the dog-play UI icons of CONTRACT_V4 section I, drawn procedurally in the house
"soft toy" style of assets/ui/ui_icons (fxlib.toy: dark tinted outline, vertical gradient lit by a
rounded bevel from the shared upper-left sun, glossy top, one soft navy drop shadow).  No text.

    ui_icon_whistle      silver pea whistle on a red lanyard + white sound waves   (call the dog)
    ui_icon_treat        bone biscuit + twinkle                                    (give a treat)
    ui_icon_play         red ball with a white band + speed streaks                (play fetch)
    ui_icon_pet          happy shiba face (^^ eyes) with a patting hand on its head (pet / belly rub)
    ui_icon_heart_full   glossy pink heart                                         (affection gauge)
    ui_icon_heart_empty  the same heart as an empty, sunken grey socket            (affection gauge)
All 96x96, anchor [0.5, 0.5].  The two hearts share exactly the same silhouette and position, so a
partial heart = the full heart cropped (setCrop) over the empty one.

Re-run (from anywhere; ~20 s):
    python3 frost-village/tools/fx/gen_pets2_ui.py               # atlas + manifest + preview
    python3 frost-village/tools/fx/gen_pets2_ui.py --preview-only  # scratch preview in <tmp>/fv_cache/pets2_ui/
Outputs:
    assets/pets2/pets2_icons.png/.json   trimmed Phaser JSON-hash atlas (pack_utils.pack_atlas)
    assets/pets2/manifest.json           MERGED: only the pets2_icons atlas + ui_icon_* sprites are
                                         (re)written; the dog / item entries of pet2_pack.py are kept
    docs/previews/pets2_icons.png        icons on light + dark panels, at 96 / 64 / 40 px
Imports fxlib.py, emote_art.py (heart shape) and pack_utils READ-ONLY; nothing else is touched.
"""
import argparse
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))          # frost-village/
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))              # tools/ (pack_utils)
import fxlib as F                                       # noqa: E402
from fxlib import hexc, toy, stroke                     # noqa: E402
import emote_art as EA                                  # noqa: E402
import pack_utils                                       # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'pets2')
PREV = os.path.join(ROOT, 'docs', 'previews')
SCRATCH = os.path.join(tempfile.gettempdir(), 'fv_cache', 'pets2_ui')
ATLAS = 'pets2_icons'
WHITE = hexc('#FFFFFF')
NAVY_LINE = '#34425C'

# soft-toy palettes (top, bottom, outline) - same families as gen_ui / emote_art
STEEL = ('#FFFFFF', '#AEB9C9', '#3A4352')
RED = ('#FF8E7E', '#DE3B2F', '#7E1A16')
BISCUIT = ('#F7C47A', '#C2732F', '#5E2E0E')
ORANGE = ('#FFC27A', '#E8893A', '#7A3A0E')
CREAM = ('#FFFFFF', '#F2E2C6', '#7A5A3A')
SKIN = ('#FFE6CF', '#F2B48C', '#8E4A2A')
HEART = ('#FFA0BC', '#E8336A', '#8E1238')
EMPTY = ('#F4F6FA', '#C3CBD8', '#6E7A90')


def U(*ds):
    return F.union(*ds)


def shadow(c, d, opacity=0.32, dy=3.0, sigma=2.2):
    c.shadow(c.cov(d - 3.0), dy=dy, sigma=sigma, opacity=opacity)


def part(c, d, pal, ow=3.0, bevel=6.0, gloss=0.3, **kw):
    top, bot, line = pal
    return toy(c, d, top, bot, line if ow else None, ow=ow, bevel=bevel, gloss=gloss, shadow=0, **kw)


# =========================================================================== icons
def icon_whistle():
    c = F.Canvas(96, 96)
    cx, cy, r = 50.0, 60.0, 21.0
    chamber = F.sd_circle(c.X, c.Y, cx, cy, r)
    mouth = F.sd_box(c.X, c.Y, 30.0, cy - r + 9.5, 21.0, 9.5, 5.0)        # flush with the chamber top
    body = F.smin(chamber, mouth, 3.0)
    # lanyard ring at the back of the chamber + red cord loop hanging down-right
    ring = np.abs(F.sd_circle(c.X, c.Y, 74.0, 66.0, 6.0)) - 2.4
    cord = np.abs(F.sd_ellipse(*F.rot(c.X, c.Y, 80.0, 79.0, math.radians(-30)), 80.0, 79.0, 9.0, 12.5)) - 2.8
    cord = F.subtract(cord, F.sd_circle(c.X, c.Y, 74.0, 66.0, 4.0))
    waves = U(F.sd_arc(c.X, c.Y, 44.0, 36.0, 15.0, -1.30, -0.30, 3.4),
              F.sd_arc(c.X, c.Y, 44.0, 36.0, 26.0, -1.25, -0.35, 3.4))
    shadow(c, U(body, ring, cord, waves))
    part(c, cord, RED, ow=2.4, bevel=2.5, gloss=0.2)
    part(c, ring, STEEL, ow=2.2, bevel=2.0, gloss=0.0, spec=0.3)
    part(c, body, STEEL, ow=3.2, bevel=7.0, gloss=0.35, hi=0.45, lo=0.5, spec=0.35, tint_lo=hexc('#6F7FA0'))
    # mouthpiece opening + the air slot on top
    c.fill(F.sd_ellipse(c.X, c.Y, 11.6, cy - r + 9.5, 2.6, 6.2), hexc('#2E3646'))
    slot = F.sd_box(c.X, c.Y, 44.0, cy - r + 2.6, 6.5, 2.3, 1.2)
    c.fill(slot, hexc('#2E3646'))
    # pea-chamber ring groove + glint
    stroke(c, F.sd_circle(c.X, c.Y, cx, cy, 12.0), 1.6, '#8E9AB0', 0.6)
    EA.glossy_spot(c, cx - 9, cy - 9, 5.5, 3.0, -38, 0.8, 0.6)
    part(c, waves, ('#FFFFFF', '#C8D3E3', NAVY_LINE), ow=2.8, bevel=2.5, gloss=0.0, hi=0.4, lo=0.5,
         tint_lo=hexc('#7F93B5'))
    return c.image()


def bone_sdf(X, Y, cx, cy, half, knob, shaft, ang_deg):
    Xr, Yr = F.rot(X, Y, cx, cy, math.radians(ang_deg))
    d = F.sd_box(Xr, Yr, cx, cy, half, shaft, shaft * 0.7)
    for sx in (-1, 1):
        for sy in (-1, 1):
            d = F.smin(d, F.sd_circle(Xr, Yr, cx + sx * half, cy + sy * knob * 0.68, knob), 2.5)
    return d, Xr, Yr


def icon_treat():
    c = F.Canvas(96, 96)
    cx, cy, ang = 46.0, 52.0, -24.0
    d, Xr, Yr = bone_sdf(c.X, c.Y, cx, cy, 25.0, 12.0, 9.0, ang)
    shadow(c, d)
    part(c, d, BISCUIT, ow=3.2, bevel=7.5, gloss=0.3, hi=0.5, lo=0.5, tint_lo=hexc('#9A4A1A'))
    # docking dots along the shaft (in the bone's rotated frame)
    for k in (-1, 0, 1):
        c.fill(F.sd_circle(Xr, Yr, cx + k * 10.0, cy + 0.5, 2.1), hexc('#7A3E14'), 0.85)
        c.fill(F.sd_circle(Xr, Yr, cx + k * 10.0 - 0.6, cy - 0.3, 0.9), hexc('#FFE2B0'), 0.35)
    EA.glossy_spot(c, cx - 25, cy - 3, 5.0, 2.8, -40, 0.75, 0.6)
    EA.twinkle(c, 77.0, 22.0, 9.5, edge='#8E520A', tip='#FFD45A')
    EA.twinkle(c, 18.0, 76.0, 5.5, edge='#8E520A', tip='#FFD45A')
    return c.image()


def icon_play():
    c = F.Canvas(96, 96)
    cx, cy, r = 57.0, 45.0, 25.0
    ball = F.sd_circle(c.X, c.Y, cx, cy, r)

    def taper(x0, y0, x1, y1, r1):
        L = math.hypot(x1 - x0, y1 - y0)
        t = np.clip(((c.X - x0) * (x1 - x0) + (c.Y - y0) * (y1 - y0)) / (L * L), 0, 1)
        return F.sd_segment(c.X, c.Y, x0, y0, x1, y1, 0) - (1.4 + (r1 - 1.4) * t)
    streaks = U(taper(8, 84, 30, 66, 3.6), taper(4, 66, 26, 54, 3.2), taper(22, 92, 42, 77, 3.0))
    shadow(c, U(ball, streaks))
    part(c, streaks, ('#FFFFFF', '#C8D3E3', NAVY_LINE), ow=2.6, bevel=2.5, gloss=0.0)
    part(c, ball, RED, ow=3.2, bevel=9.0, gloss=0.0, hi=0.55, lo=0.5, pillow=6.0)
    # white band: front half of a tilted ellipse ring (the band's great circle seen in 3D)
    Xr, Yr = F.rot(c.X, c.Y, cx, cy, math.radians(-32))
    ring = np.abs(F.sd_ellipse(Xr, Yr, cx, cy - 2.0, r * 1.02, 10.5)) - 3.6
    front = (Yr > cy - 2.0).astype(np.float32)
    band_cov = c.cov(ring) * c.cov(ball + 1.6) * front
    shade = F.mix(hexc('#FFFFFF'), hexc('#E3D2C6'), np.clip((c.Y - (cy - r)) / (2 * r), 0, 1))
    c.paint(band_cov, shade)
    EA.glossy_spot(c, cx - 10, cy - 12, 7.0, 4.0, -38, 0.85, 0.7)
    c.fill(F.sd_circle(c.X, c.Y, cx - 16.5, cy - 3.0, 1.8), WHITE, 0.75)
    return c.image()


def icon_pet():
    c = F.Canvas(96, 96)
    cx, cy = 46.0, 60.0
    head = F.sd_ellipse(c.X, c.Y, cx, cy, 30.0, 25.0)
    ears = []
    for s in (-1, 1):
        ex = cx + s * 19.0
        tri = F.sd_polygon(c.X, c.Y, [(ex - 11.0, cy - 15.0), (ex + 11.0, cy - 15.0),
                                       (ex + s * 3.0, cy - 39.0)]) - 3.0
        ears.append(tri)
    headall = F.smin(head, U(*ears), 3.0)
    # the patting hand (back of the hand, fingers to the left) resting on top of the head
    hx, hy = 52.0, 33.5
    Xh, Yh = F.rot(c.X, c.Y, hx, hy, math.radians(8))
    palm = F.sd_box(Xh, Yh, hx + 4.0, hy, 13.0, 9.5, 8.0)
    fingers = [F.sd_box(Xh, Yh, hx - 10.0 - k * 0.0, hy - 6.5 + k * 4.6, 9.0, 2.6, 2.6) for k in range(4)]
    thumb = F.sd_box(*F.rot(Xh, Yh, hx - 3.0, hy + 9.0, math.radians(-35)), hx - 3.0, hy + 9.0, 7.0, 3.2, 3.2)
    cuff = F.sd_box(Xh, Yh, hx + 19.0, hy, 5.0, 11.0, 4.0)
    hand = U(palm, F.smin(U(*fingers), palm, 1.5), thumb)
    # motion marks above the hand + a small heart
    marks = U(F.sd_arc(c.X, c.Y, 56.0, 26.0, 21.0, -2.50, -2.00, 2.0),
              F.sd_arc(c.X, c.Y, 56.0, 26.0, 21.0, -1.15, -0.65, 2.0))
    hs = EA.heart_sdf(c.X, c.Y, 16.0, 26.0, 17.0)
    shadow(c, U(headall, hand, cuff, hs))
    part(c, headall, ORANGE, ow=3.2, bevel=8.0, gloss=0.25, hi=0.5, lo=0.45, tint_lo=hexc('#C0541A'))
    for s in (-1, 1):
        ex = cx + s * 19.0
        inner = F.sd_polygon(c.X, c.Y, [(ex - 5.5, cy - 17.0), (ex + 5.5, cy - 17.0), (ex + s * 2.0, cy - 31.0)]) - 1.5
        c.fill(inner, hexc('#FBE6CC'), 0.95)
    # cream lower face + eyebrow dots (shiba "maro")
    low = F.intersect(F.sd_ellipse(c.X, c.Y, cx, cy + 10.0, 22.0, 15.0), head + 0.5)
    part(c, low, CREAM, ow=0, bevel=5.0, gloss=0.0, hi=0.4, lo=0.3)
    for s in (-1, 1):
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * 11.0, cy - 13.0, 3.6, 2.4), hexc('#FBE6CC'))
    # ^^ eyes, nose, w-mouth with tongue, blush
    for s in (-1, 1):
        stroke(c, F.sd_arc(c.X, c.Y, cx + s * 11.0, cy - 1.0, 5.0, -2.75, -0.39, 0), 2.8, '#3A2418')
    c.fill(F.sd_ellipse(c.X, c.Y, cx, cy + 5.5, 3.6, 2.6), hexc('#2A2026'))
    tongue = F.sd_ellipse(c.X, c.Y, cx, cy + 13.5, 3.8, 4.4)
    c.fill(tongue - 0.9, hexc('#8E2C1E'))
    c.fill(tongue, hexc('#FF7F8E'))
    for s in (-1, 1):
        stroke(c, F.sd_arc(c.X, c.Y, cx + s * 3.6, cy + 8.0, 3.6, 0.3, 2.84, 0), 1.8, '#5A2A2A')
        c.fill(F.sd_ellipse(c.X, c.Y, cx + s * 19.0, cy + 5.0, 5.0, 3.0), hexc('#FF7A8A'), 0.6)
    part(c, hand, SKIN, ow=2.6, bevel=4.5, gloss=0.25, hi=0.5, lo=0.45, tint_lo=hexc('#C86A50'))
    for k in range(3):                                   # finger creases
        c.fill(F.sd_segment(Xh, Yh, hx - 16.0, hy - 4.2 + k * 4.6, hx - 6.0, hy - 4.2 + k * 4.6, 0.55),
               hexc('#C47A58'), 0.7)
    part(c, cuff, ('#FFFFFF', '#E6DCCB', '#6B5A44'), ow=2.4, bevel=4.0, gloss=0.2)   # white parka fur cuff
    part(c, marks, ('#FFFFFF', '#C8D3E3', NAVY_LINE), ow=2.2, bevel=2.0, gloss=0.0)
    part(c, hs, HEART, ow=2.2, bevel=4.0, gloss=0.0, hi=0.55, lo=0.45, pillow=3.0)
    EA.glossy_spot(c, 12.5, 23.0, 2.6, 1.6, -38, 0.85, 0.4)
    return c.image()


HEART_C = (48.0, 50.0, 80.0)          # cx, cy, width - shared by full + empty


def icon_heart(full=True):
    c = F.Canvas(96, 96)
    cx, cy, w = HEART_C
    d = EA.heart_sdf(c.X, c.Y, cx, cy, w) - 1.5
    shadow(c, d, opacity=0.30 if full else 0.22)
    if full:
        part(c, d, HEART, ow=3.4, bevel=8.0, gloss=0.0, hi=0.6, lo=0.5, pillow=12.0, tint_lo=hexc('#B0204E'))
        EA.glossy_spot(c, cx - 19.0, cy - 14.0, 9.5, 5.4, -38, 0.85, 0.8)
        c.fill(F.sd_circle(c.X, c.Y, cx - 26.0, cy - 2.0, 2.4), WHITE, 0.75)
    else:
        # dark rim, then a sunken (inverted bevel) pale socket: lit from below-right
        c.fill(d - 3.4, hexc(EMPTY[2]))
        inner = d
        n = F.bevel_normals(inner, 8.0, c.px)
        n[..., 0] *= -1
        n[..., 1] *= -1
        t = np.clip((c.Y - (cy - w * 0.45)) / (w * 0.9), 0, 1)
        base = F.mix(hexc('#D3DAE5'), hexc('#EEF1F6'), t)
        c.paint(c.cov(inner), F.shade(base, F.lambert(n), 0.45, 0.35, tint_lo=hexc('#8090B0')))
        stroke(c, d + 7.5, 1.6, '#B7C0CF', 0.6)
    return c.image()


ICONS = [
    ('ui_icon_whistle', icon_whistle, 'Silver pea whistle on a red lanyard with sound waves: call the dog (부르기).'),
    ('ui_icon_treat', lambda: icon_treat(), 'Bone biscuit with twinkles: give a treat (간식 주기).'),
    ('ui_icon_play', icon_play, 'Red ball with a white band + speed streaks: play fetch (놀아주기).'),
    ('ui_icon_pet', icon_pet, 'Happy shiba face (^^) with a patting hand + small heart: pet the dog (쓰다듬기).'),
    ('ui_icon_heart_full', lambda: icon_heart(True), 'Glossy pink heart: one affection point (친밀도).'),
    ('ui_icon_heart_empty', lambda: icon_heart(False),
     'Empty sunken grey heart socket, same silhouette/position as ui_icon_heart_full (crop the full heart over it '
     'for a partial heart).'),
]


# =========================================================================== preview / manifest
def preview(imgs, path):
    keys = list(imgs)
    cell = 112
    W = 16 + cell * len(keys)
    H = 2 * (cell + 18) + 90
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, cell + 18], fill=(255, 248, 236, 255))                 # UI cream panel
    d.rectangle([0, cell + 18, W, 2 * (cell + 18)], fill=(43, 47, 58, 255))      # dark HUD
    d.rectangle([0, 2 * (cell + 18), W, H], fill=(61, 139, 224, 255))            # blue button colour
    for k, key in enumerate(keys):
        x = 16 + k * cell
        for row in range(2):
            im.alpha_composite(imgs[key], (x, 6 + row * (cell + 18)))
        d.text((x, cell + 2), key.replace('ui_icon_', ''), fill=(43, 47, 58, 255))
        sm = imgs[key].resize((64, 64), Image.LANCZOS)
        im.alpha_composite(sm, (x, 2 * (cell + 18) + 6))
        xs = imgs[key].resize((40, 40), Image.LANCZOS)
        im.alpha_composite(xs, (x + 66, 2 * (cell + 18) + 30))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.convert('RGB').save(path, optimize=True)


def merge_manifest(entries):
    path = os.path.join(OUT, 'manifest.json')
    man = {}
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            man = json.load(f)
    man.setdefault('version', 1)
    atl = [a for a in man.get('atlases', []) if a.get('key') != ATLAS]
    atl.append({'key': ATLAS, 'png': 'pets2/%s.png' % ATLAS, 'json': 'pets2/%s.json' % ATLAS})
    man['atlases'] = atl
    sprites = {k: v for k, v in man.get('sprites', {}).items() if v.get('atlas') != ATLAS}
    sprites.update(entries)
    man['sprites'] = sprites
    gens = dict(man.get('generators', {}))
    gens[ATLAS] = 'tools/fx/gen_pets2_ui.py'
    man['generators'] = gens
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    return path


def build(preview_only=False):
    imgs = {}
    for key, fn, _ in ICONS:
        imgs[key] = fn()
        assert imgs[key].size == (96, 96), key
    if preview_only:
        preview(imgs, os.path.join(SCRATCH, 'pets2_icons.png'))
        for k, im in imgs.items():
            im.save(os.path.join(SCRATCH, k + '.png'))
        print('preview ->', SCRATCH)
        return
    os.makedirs(OUT, exist_ok=True)
    sheet, atlas = pack_utils.pack_atlas(list(imgs.items()), max_width=1024, padding=2)
    F.save_png(sheet, os.path.join(OUT, ATLAS + '.png'))
    atlas['meta']['image'] = ATLAS + '.png'
    with open(os.path.join(OUT, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(atlas, f, separators=(',', ':'))
    entries = {key: {'atlas': ATLAS, 'frame': key, 'anchor': [0.5, 0.5], 'kind': 'icon', 'frameSize': [96, 96],
                     'notes': notes} for key, _, notes in ICONS}
    merge_manifest(entries)
    preview(imgs, os.path.join(PREV, 'pets2_icons.png'))
    print('%s: %dx%d, %d icons, %.1f KB' % (ATLAS, sheet.size[0], sheet.size[1], len(imgs),
                                            os.path.getsize(os.path.join(OUT, ATLAS + '.png')) / 1024))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview-only', action='store_true')
    a = ap.parse_args()
    os.makedirs(SCRATCH, exist_ok=True)
    build(a.preview_only)
