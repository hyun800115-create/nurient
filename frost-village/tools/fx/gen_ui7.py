"""
gen_ui7.py - (v4.2.0.1) the first-run tutorial kit `ui7`: the pointing mitten that shows a new player what to do
(drag, let go, tap), its "touching the glass" frame, a tap ripple and the soft spotlight's hole.  Procedural, in the
house "soft toy" style of assets/ui, ui2, ui3, ui5 (fxlib.toy: dark tinted outline, bevel lit from the shared
upper-left sun, gloss, ONE soft navy drop shadow).  The mitten is the chief's own white knit mitten with the teal
cuff of ui5's `ui_icon_hand`.  No text is baked.

    python3 tools/fx/gen_ui7.py                 # frames -> assets/ui7 (atlas + manifest) + preview + check
    python3 tools/fx/gen_ui7.py --no-preview    # assets + check only
    python3 tools/fx/gen_ui7.py --check         # check the delivered set (exit 1 on any error)
    python3 tools/fx/gen_ui7.py --look a,b      # scratch sheet of some keys -> <cache>/look_ui7.png
Outputs
    assets/ui7/ui7.png / .json         one atlas (<= 512 x 256): ui_finger, ui_finger_press, ui_tap_ripple (trimmed,
                                       sourceSize kept) + ui_spot_hole (128 px, untrimmed, edge pixels extruded 2 px so the
                                       spotlight's dim rectangles meet it without a seam under linear filtering)
    assets/ui7/manifest.json           sprites (anchor = the FINGERTIP for the two hand frames, frameSize, notes)
    docs/previews/ui7_onboard.png      the frames at 112 / 64 / 48 px on cream, on night and over a phone-size crop
Imports fxlib, gen_ui3 (canvas / shadow / part), gen_ui5 (palettes MITTEN_D, TEAL), emote_art and gen_chief_fx (the
trim helper) READ-ONLY.  Cache: /tmp/fv_cache/ui7.  Deterministic.  Loaded at BOOT (Assets.js FRAGMENTS): the hand is
needed at second 0 of a new game, before the late v42_core page (ui5) exists.
"""
import argparse
import hashlib
import inspect
import json
import math
import os
import sys

import numpy as np
from PIL import Image

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
import gen_ui5 as U5                                    # noqa: E402
import gen_chief_fx as CF                               # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'ui7')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.environ.get('FV_UI7_CACHE', '/tmp/fv_cache/ui7')
ATLAS = 'ui7'
S = 128                                   # hand / ripple frame size
HOLE = 128                                # spotlight hole frame size (a smooth ramp: drawn up to ~4x, linear filtering)
TIP = (26.0, 13.0)                        # the fingertip in the 128 frame (= the manifest anchor)
MITTEN_D, TEAL = U5.MITTEN_D, U5.TEAL
TEAL_TINT = U5.TINT['teal']
WHITE = hexc('#FFFFFF')
U = F.union


# =========================================================================== the mitten
def hand_sd(c, press=False):
    """Signed distances of the pointing mitten, fingertip at TIP, index finger up-left, cuff at the lower right.
    press: the finger 8 % shorter and the whole hand turned +6 deg about the tip (pushed against the glass)."""
    tx, ty = TIP
    ang = math.radians(6.0 if press else 0.0)
    X, Y = F.rot(c.X, c.Y, tx, ty, ang)                 # the press frame turns about the fingertip
    ux, uy = 0.53, 0.848                                 # finger axis, tip -> knuckle (down-right)
    L = 34.0 * (0.92 if press else 1.0)
    r = 12.5
    tcx, tcy = tx + ux * r, ty + uy * r                  # the tip's round end
    kx, ky = tcx + ux * L, tcy + uy * L                  # the knuckle
    finger = F.sd_segment(X, Y, tcx, tcy, kx, ky, r)
    # the palm: a soft box turned along the finger axis, below / right of the knuckle
    pa = math.degrees(math.atan2(ux, uy))                # ~32 deg
    pcx, pcy = kx + ux * 17 + 7, ky + uy * 17 - 1
    PX, PY = F.rot(X, Y, pcx, pcy, math.radians(-pa))
    palm = F.sd_box(PX, PY, pcx, pcy, 24, 25, 19)
    # three curled fingers: knuckle bumps on the palm's front (right) edge
    bumps = []
    for k in range(3):
        bx = pcx + 20 + ux * (k * 11 - 12)
        by = pcy - 14 + uy * (k * 11 - 12)
        EX, EY = F.rot(X, Y, bx, by, math.radians(-pa))
        bumps.append(F.sd_ellipse(EX, EY, bx, by, 9.5, 7.5))
    # the thumb tucked across the palm's left side
    thx, thy = pcx - 20, pcy + 4
    TX, TY = F.rot(X, Y, thx, thy, math.radians(-pa + 25))
    thumb = F.sd_ellipse(TX, TY, thx, thy, 8.0, 13.5)
    hand = F.smin(F.smin(palm, finger, 3.0), U(*bumps), 2.5)
    hand = F.smin(hand, thumb, 2.0)
    # the teal knit cuff at the wrist (lower right)
    cx, cy = pcx + ux * 25, pcy + uy * 25
    CX, CY = F.rot(X, Y, cx, cy, math.radians(-pa))
    cuff = F.sd_box(CX, CY, cx, cy, 25, 9.0, 6)
    geo = dict(X=X, Y=Y, pa=pa, pcx=pcx, pcy=pcy, kx=kx, ky=ky, tcx=tcx, tcy=tcy, cx=cx, cy=cy, bumps=bumps,
               thumb=thumb, thx=thx, thy=thy, palm=palm, finger=finger)
    return hand, cuff, geo


def draw_hand(press=False):
    c = U3.canvas(1.0, S)
    hand, cuff, g = hand_sd(c, press)
    allsh = U(hand, cuff)
    if press:
        c.shadow(c.cov(allsh - 3.4), dx=2.0, dy=3.0, sigma=2.0, opacity=0.45)
    else:
        c.shadow(c.cov(allsh - 3.4), dx=4.0, dy=6.0, sigma=3.0, opacity=0.36)
    U3.part(c, hand, MITTEN_D, ow=3.4, bevel=9, gloss=0.35, tint='#5A78A8', lo=0.55)
    X, Y, pa = g['X'], g['Y'], g['pa']
    # creases between the curled fingers, the thumb's seam
    crease = hexc('#9FB2CE')
    for b in g['bumps'][:2]:
        c.fill(F.intersect(np.abs(b) - 0.7, g['palm'] + 1.0), crease, 0.85)
    c.fill(F.intersect(np.abs(g['thumb']) - 0.7, g['palm'] + 3.0), crease, 0.8)
    # a knitted band across the finger's base and a soft pad on the palm
    BX, BY = F.rot(X, Y, g['kx'], g['ky'], math.radians(-pa))
    c.fill(F.intersect(F.sd_box(BX, BY, g['kx'], g['ky'], 13, 1.6, 0.8), g['finger'] + 1.5), hexc('#C7D6EA'), 0.9)
    c.fill(F.sd_ellipse(*F.rot(X, Y, g['pcx'] - 2, g['pcy'] + 4, math.radians(-pa)), g['pcx'] - 2, g['pcy'] + 4, 12, 10),
           hexc('#E9F0F9'), 0.85, feather=1.5)
    # the teal cuff + 5 knit ribs
    U3.part(c, cuff, TEAL, ow=2.8, bevel=4, gloss=0.2, tint=TEAL_TINT)
    CX, CY = F.rot(X, Y, g['cx'], g['cy'], math.radians(-pa))
    for k in range(5):
        x = g['cx'] - 17 + k * 8.5
        c.fill(F.intersect(F.sd_segment(CX, CY, x, g['cy'] - 6, x, g['cy'] + 6, 1.0), cuff + 1.2), hexc('#C7F3EC'), 0.6)
    # a tiny gloss spot on the fingertip
    EA.glossy_spot(c, g['tcx'] - 3.0, g['tcy'] - 2.0, 4.2, 2.4, -35, 0.8, 0.6)
    return c.image()


def draw_ripple():
    """A soft white ring (10 px) with a warm #FFE27A glow that fades inward (taps; flattened = the world pulse ring)."""
    c = U3.canvas(1.0, S)
    cx = cy = S / 2
    d = F.sd_circle(c.X, c.Y, cx, cy, 52.0)
    r = np.hypot(c.X - cx, c.Y - cy)
    glow = np.clip((r - 22.0) / 30.0, 0, 1) ** 1.8 * (r < 53)
    c.paint(glow.astype(np.float32), hexc('#FFE27A'), 0.75)
    ring = np.abs(d) - 5.0
    c.shadow(c.cov(ring), dy=1.5, sigma=1.5, opacity=0.25, color='#7A5A10')
    c.fill(ring, WHITE, 1.0)
    c.fill(np.abs(F.sd_circle(c.X, c.Y, cx, cy, 55.5)) - 0.9, hexc('#E8B93A'), 0.85)
    return c.image()


def draw_hole():
    """HOLE x HOLE radial mask: transparent to r = 0.62, a smooth ramp to opaque white at r = 1.0 (and beyond)."""
    yy, xx = np.mgrid[0:HOLE, 0:HOLE].astype(np.float32)
    r = np.hypot(xx + 0.5 - HOLE / 2, yy + 0.5 - HOLE / 2) / (HOLE / 2)
    t = np.clip((r - 0.62) / 0.38, 0, 1)
    a = t * t * (3 - 2 * t)
    arr = np.zeros((HOLE, HOLE, 4), np.uint8)
    arr[..., :3] = 255
    arr[..., 3] = (a * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


FRAMES = [
    ('ui_finger', lambda: draw_hand(False), 'hand', [TIP[0] / S, TIP[1] / S],
     "The pointing mitten (index finger up-left, teal cuff lower right). Anchor = the fingertip: setPosition(x, y) puts "
     "the tip on (x, y). Shown 112 logical px tall; flipX near the right edge."),
    ('ui_finger_press', lambda: draw_hand(True), 'hand', [TIP[0] / S, TIP[1] / S],
     'The same mitten touching the glass: finger 8 % shorter, hand turned +6 deg about the tip, tighter shadow. Same anchor.'),
    ('ui_tap_ripple', draw_ripple, 'fx', [0.5, 0.5],
     'Tap ripple: white ring + warm inner glow. Scale 0.3 -> 1.1, alpha 0.9 -> 0 in 450 ms. Flattened (scaleY 0.5) it is '
     'the world pulse ring under a target pad.'),
    ('ui_spot_hole', draw_hole, 'mask', [0.5, 0.5],
     'Soft spotlight hole (128 px, drawn larger): transparent to r = 0.62, opaque white from r = 1.0. Tint #1b2638, alpha 0.30; four rectangles '
     'of the same tint fill the rest of the screen. Untrimmed, edge pixels extruded 2 px in the atlas.'),
]
HELPERS = ('hand_sd', 'draw_hand', 'draw_ripple', 'draw_hole')


def item_hash(key):
    src = ''.join(inspect.getsource(globals()[n]) for n in HELPERS) + repr((TIP, S, HOLE, MITTEN_D, TEAL, key))
    mods = b''.join(open(p, 'rb').read() for p in (F.__file__, U3.__file__, EA.__file__))
    return hashlib.sha1(src.encode() + mods).hexdigest()[:12]


def render_all():
    out = {}
    for k, fn, *_ in FRAMES:
        p = os.path.join(CACHE, 'items', f'{k}_{item_hash(k)}.png')
        if os.path.exists(p):
            out[k] = Image.open(p).convert('RGBA')
            continue
        print(f'  render {k}', flush=True)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        out[k] = fn()
        out[k].save(p)
    return out


# =========================================================================== atlas (fixed layout: 4 frames)
def write_assets(fr):
    """Hole at (2, 2) with a 2 px extruded border; the three trimmed frames in a column / row to its right."""
    items = []
    for k in ('ui_finger', 'ui_finger_press', 'ui_tap_ripple'):
        im = fr[k]
        box = CF._trim(im)
        a = np.asarray(im).copy()
        a[a[..., 3] <= 2] = 0
        items.append((k, im, box, Image.fromarray(a, 'RGBA').crop(box)))
    x0 = 2 + HOLE + 2 + 2
    # place the trimmed frames left to right, wrapping into rows inside the 256 px tall page
    pos, x, y, rowh = {}, x0, 0, 0
    for k, im, box, crop in items:
        if x + crop.width > 512:
            x, y, rowh = x0, y + rowh + 2, 0
        pos[k] = (x, y)
        x += crop.width + 2
        rowh = max(rowh, crop.height)
    used_w = max(px + c.width for (k, im, box, c), (px, py) in zip(items, [pos[k] for k, *_ in items]))
    used_h = max(HOLE + 4, max(py + c.height for (k, im, box, c), (px, py) in zip(items, [pos[k] for k, *_ in items])))
    if used_h > 256:
        raise SystemExit(f'ui7 page {used_w} x {used_h} > 512 x 256')
    sw, sh = (used_w + 1) // 2 * 2, (used_h + 1) // 2 * 2
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    hole = fr['ui_spot_hole']
    ext = np.asarray(hole)
    ext = np.pad(ext, ((2, 2), (2, 2), (0, 0)), mode='edge')          # extrude the edge 2 px
    sheet.paste(Image.fromarray(ext, 'RGBA'), (0, 0))
    frames = {'ui_spot_hole': {'frame': {'x': 2, 'y': 2, 'w': HOLE, 'h': HOLE}, 'rotated': False, 'trimmed': False,
                               'spriteSourceSize': {'x': 0, 'y': 0, 'w': HOLE, 'h': HOLE},
                               'sourceSize': {'w': HOLE, 'h': HOLE}}}
    for k, im, box, crop in items:
        px, py = pos[k]
        sheet.paste(crop, (px, py))
        frames[k] = {'frame': {'x': px, 'y': py, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                     'trimmed': (crop.width, crop.height) != im.size,
                     'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                     'sourceSize': {'w': im.width, 'h': im.height}}
    atlas = {'frames': frames, 'meta': {'app': 'frost-village/tools/fx/gen_ui7.py', 'version': '1.0', 'image': ATLAS + '.png',
                                        'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    os.makedirs(OUT, exist_ok=True)
    # an 8-bit palette would band the hole's ramp: plain RGBA, optimized
    sheet.save(os.path.join(OUT, ATLAS + '.png'), optimize=True)
    with open(os.path.join(OUT, ATLAS + '.json'), 'w') as f:
        json.dump(atlas, f, separators=(',', ':'))
    sprites = {}
    for k, fn, kind, anchor, notes in FRAMES:
        im = fr[k]
        sprites[k] = {'atlas': ATLAS, 'frame': k, 'anchor': [round(anchor[0], 4), round(anchor[1], 4)], 'kind': kind,
                      'frameSize': [im.width, im.height], 'notes': notes}
        if kind == 'hand':
            sprites[k]['tip'] = [TIP[0], TIP[1]]
            sprites[k]['displayHeight'] = 112
    page_mib = sw * sh * 4 / 2 ** 20
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_ui7.py (procedural numpy + Pillow on fxlib; house style of ui / ui2 / ui3 / ui5)',
        'conventions': {
            'contract': '(v4.2.0.1) the first-run tutorial (src/systems/Onboarding.js + src/scenes/OnboardOverlay.js). '
                        'Paths relative to frost-village/assets/. Fragment name: ui7, loaded at boot.',
            'text': 'No text is baked; the game renders every label.',
            'anchor': 'The two hand frames are anchored on the fingertip (sprites[k].tip in frame px).',
            'fallback': 'Without this atlas OnboardOverlay draws a Phaser Graphics stand-in (fv_finger).',
            'pageSize': [sw, sh],
            'pageMiB': round(page_mib, 3),
        },
        'atlases': [{'key': ATLAS, 'png': f'ui7/{ATLAS}.png', 'json': f'ui7/{ATLAS}.json'}],
        'sprites': sprites,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    return sheet, atlas, man


# =========================================================================== preview
def frame_img(sheet, atlas, k):
    f = atlas['frames'][k]
    fr, ss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
    crop = sheet.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
    full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
    full.paste(crop, (ss['x'], ss['y']))
    return full


def preview(sheet, atlas, path):
    from PIL import ImageDraw
    W, H = 1240, 720
    out = Image.new('RGBA', (W, H), hexc_rgba('#E9EEF5'))
    d = ImageDraw.Draw(out)
    bgs = [('#F4F7FB', 'cream'), ('#1F2A44', 'night')]
    y = 10
    for bi, (bg, name) in enumerate(bgs):
        d.rectangle((10, y, 690, y + 160), fill=hexc_rgba(bg))
        x = 20
        for k in ('ui_finger', 'ui_finger_press'):
            im = frame_img(sheet, atlas, k)
            for px in (112, 64, 48):
                sc = px / S
                t = im.resize((max(1, int(S * sc)), max(1, int(S * sc))), Image.LANCZOS)
                out.alpha_composite(t, (x, y + 10))
                # the anchor: a small red cross at the fingertip
                ax, ay = x + TIP[0] * sc, y + 10 + TIP[1] * sc
                d.line((ax - 4, ay, ax + 4, ay), fill=(220, 40, 40, 255))
                d.line((ax, ay - 4, ax, ay + 4), fill=(220, 40, 40, 255))
                x += int(S * sc) + 12
        rp = frame_img(sheet, atlas, 'ui_tap_ripple').resize((96, 96), Image.LANCZOS)
        out.alpha_composite(rp, (x + 4, y + 30))
        y += 170
    # the hole over a busy strip
    hole = frame_img(sheet, atlas, 'ui_spot_hole').resize((256, 256), Image.BILINEAR)
    tint = Image.new('RGBA', hole.size, (27, 38, 56, 0))
    ha = np.asarray(hole)[..., 3].astype(np.float32) * 0.30
    ta = np.asarray(tint).copy()
    ta[..., 3] = ha.astype(np.uint8)
    strip = Image.new('RGBA', (256, 256), hexc_rgba('#CFE0F0'))
    sd = ImageDraw.Draw(strip)
    for i in range(0, 256, 32):
        sd.rectangle((i, 0, i + 15, 255), fill=hexc_rgba('#F4F7FB'))
    strip.alpha_composite(Image.fromarray(ta, 'RGBA'))
    out.alpha_composite(strip, (10, y + 10))
    d.text((14, y + 270), 'ui_spot_hole tinted #1b2638 @ 0.30', fill=(40, 50, 70, 255))
    # over a phone crop (412 x 915 game screenshot) when one is around: the ghost joystick + finger at phone size
    shot = None
    for cand in (os.path.join(ROOT, 'docs', 'previews', 'screens', '02_start.jpg'),
                 '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/onboard/study/shots/05_game_first_screen.jpg'):
        if os.path.exists(cand):
            shot = Image.open(cand).convert('RGBA')
            break
    if shot is not None:
        k = 520 / shot.height
        ph = shot.resize((max(1, int(shot.width * k)), 520), Image.LANCZOS)
        px0, py0 = 700, 10
        out.alpha_composite(ph, (px0, py0))
        # logical 720 wide -> ph.width px
        lk = ph.width / 720.0
        base_d, knob_d, hand_h = int(172 * lk), int(84 * lk), int(112 * lk)
        gx, gy = px0 + int(446 * lk), py0 + int(ph.height * 0.62)
        d.ellipse((gx - base_d // 2, gy - base_d // 2, gx + base_d // 2, gy + base_d // 2), outline=(255, 255, 255, 170), width=3)
        d.ellipse((gx + 20 - knob_d // 2, gy - 25 - knob_d // 2, gx + 20 + knob_d // 2, gy - 25 + knob_d // 2), fill=(255, 255, 255, 150))
        hand = frame_img(sheet, atlas, 'ui_finger_press').resize((hand_h, hand_h), Image.LANCZOS)
        out.alpha_composite(hand, (int(gx + 20 - TIP[0] * hand_h / S), int(gy - 25 - TIP[1] * hand_h / S)))
        d.text((px0, py0 + 525), 'finger + ghost joystick at 412 x 915 phone size', fill=(40, 50, 70, 255))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.convert('RGB').save(path, optimize=True)
    return path


def hexc_rgba(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


# =========================================================================== check
def luma(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


def check():
    errs = []
    try:
        man = json.load(open(os.path.join(OUT, 'manifest.json')))
        atlas = json.load(open(os.path.join(OUT, ATLAS + '.json')))
        sheet = Image.open(os.path.join(OUT, ATLAS + '.png')).convert('RGBA')
    except Exception as e:  # noqa: BLE001
        print('ui7 check: cannot read the delivered set:', e)
        return 1
    for k, *_ in FRAMES:
        if k not in atlas['frames']:
            errs.append(f'missing frame {k}')
        if k not in man['sprites']:
            errs.append(f'missing sprite {k}')
    if sheet.width > 512 or sheet.height > 256:
        errs.append(f'atlas {sheet.size} > 512 x 256')
    size = os.path.getsize(os.path.join(OUT, ATLAS + '.png'))
    # (design target 40 KB; the two shaded hands alone are ~40 KB of RGBA PNG and an 8-bit palette bands their shading)
    if size > 64 * 1024:
        errs.append(f'atlas png {size} B > 64 KB')
    if sheet.width * sheet.height * 4 > 0.3 * 2 ** 20:
        errs.append(f'atlas page {sheet.size} = {sheet.width * sheet.height * 4 / 2 ** 20:.3f} MiB GPU > 0.3 MiB')
    for k in ('ui_finger', 'ui_finger_press'):
        if k not in atlas['frames']:
            continue
        im = np.asarray(frame_img(sheet, atlas, k))
        ax, ay = man['sprites'][k]['anchor'][0] * S, man['sprites'][k]['anchor'][1] * S
        ys, xs = np.nonzero(im[..., 3] > 128)
        if not len(xs):
            errs.append(f'{k}: empty')
            continue
        dist = np.hypot(xs + 0.5 - ax, ys + 0.5 - ay).min()
        if dist > 6:
            errs.append(f'{k}: nearest opaque pixel {dist:.1f} px from the fingertip anchor (> 6)')
        # outline contrast on cream and on night: the darkest outline pixels vs the background
        a = im[..., 3] > 200
        if a.any():
            lum = luma(im[..., :3][a].astype(np.float32).T)
            dark = np.percentile(lum, 3)
            light = np.percentile(lum, 97)
            if abs(luma(hexc_rgba('#F4F7FB')) - dark) < 40:
                errs.append(f'{k}: outline does not read on cream (luma {dark:.0f})')
            if abs(light - luma(hexc_rgba('#1F2A44'))) < 40:
                errs.append(f'{k}: body does not read on night (luma {light:.0f})')
    h = atlas['frames'].get('ui_spot_hole')
    if h:
        f = h['frame']
        a = np.asarray(sheet)[..., 3]
        c = a[f['y'] + HOLE // 2, f['x'] + HOLE // 2]
        e = a[f['y'] + HOLE // 2, f['x']]
        ex = a[f['y'] + HOLE // 2, f['x'] - 1]
        if c != 0 or e < 250 or ex < 250:
            errs.append(f'ui_spot_hole: centre {c} edge {e} extruded {ex} (want 0 / 255 / 255)')
    for e in errs:
        print('ui7 check ERROR:', e)
    print(f'ui7 check: {len(atlas["frames"])} frames, page {sheet.size}, {size} B, {len(errs)} errors')
    return 1 if errs else 0


def look(keys):
    fr = render_all()
    keys = keys or [k for k, *_ in FRAMES]
    ims = [fr[k] for k in keys if k in fr]
    W = sum(i.width * 2 + 10 for i in ims) + 10
    Hh = max(i.height * 2 for i in ims) + 20
    out = Image.new('RGBA', (W, Hh), hexc_rgba('#F4F7FB'))
    x = 10
    for i in ims:
        out.alpha_composite(i.resize((i.width * 2, i.height * 2), Image.LANCZOS), (x, 10))
        x += i.width * 2 + 10
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, 'look_ui7.png')
    out.save(p)
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--look', default=None, nargs='?', const='')
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--no-preview', action='store_true')
    a = ap.parse_args()
    if a.look is not None:
        print(look([k.strip() for k in a.look.split(',') if k.strip()]))
        return
    if a.check:
        sys.exit(check())
    fr = render_all()
    sheet, atlas, man = write_assets(fr)
    print(f'assets/ui7: {len(atlas["frames"])} frames, page {sheet.size} = {man["conventions"]["pageMiB"]} MiB')
    if not a.no_preview:
        print(preview(sheet, atlas, os.path.join(PREV, 'ui7_onboard.png')))
    sys.exit(check())


if __name__ == '__main__':
    main()
