"""
ttl_logo.py - the 3D toy logo of the title screen (Blender, Cycles).

    /tmp/bvenv/bin/python tools/blender/ttl_logo.py -- --layout main --out DIR [--ppu 380] [--samples 40]
                       [--pct 100] [--no-label] [--parts | --parts-only] [--skip-existing] [--threads 2]

    --parts       also render every piece ALONE (same camera) -> logo_<layout>_part<i>.png, so the
                  title can drop the letters in one by one without holes where pieces overlap
    --parts-only  only the pieces (ttl_pack.py composites the full logo from them; used for 'main')
    --skip-existing  resume after an interruption (keeps PNGs already on disk)

Layouts (all texts come from ttl_config.TITLE - rename the game there and re-run):
    main   "행복한" (small gold, sparkles) / "눈꽃마을" (big candy letters with snow caps, the 눈꽃
           emblem sitting on 꽃) / "이야기" on a little snowy wooden sign      -> portrait title logo
    short  "눈꽃 / 마을" in a 2 x 2 block with the emblem                    -> splash / icon / badge
    en     "Snowbloom" (the first 'o' of "bloom" is the emblem) / "Village" on the sign

Writes DIR/logo_<layout>.png (colour, transparent), DIR/logo_<layout>_label.png (flat ID colours,
one per animatable piece: red = index * 16 + 8) and DIR/logo_<layout>.json (pieces, ppu, frame).
tools/blender/ttl_pack.py turns those into assets/title/ (outline, shadow, sizes, shine mask, parts).
"""
import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                  # noqa: E402
from mathutils import Vector               # noqa: E402

import ttl_config as C                     # noqa: E402
import ttl_lib as T                        # noqa: E402

TILT = 8.0            # camera looks down a little: snow caps and letter tops show
PIECES = {}           # piece index -> [objects]
PIECE_NAMES = {}


def reg(idx, name, *obs):
    PIECE_NAMES[idx] = name
    lst = PIECES.setdefault(idx, [])
    for ob in obs:
        lst.append(ob)
        for ch in ob.children_recursive:
            lst.append(ch)


# ------------------------------------------------------------------ one 3D letter with its snow
def glyph_box(ch, fpath, size):
    loops, bb = T.glyph_outline(ch, fpath, size)
    return loops, bb


def letter(ch, fpath, size, cols, name, pos, rot_deg=0.0, depth=0.10, bevel=0.034, snow_r=0.055,
           seed=1, drips=0.12, snow=True, parent=None, rough=0.30, coat=0.6, z=0.0, up=0.42, sss=0.0):
    """A glyph centred on its own pivot at `pos` (centre of its bbox)."""
    loops, bb = glyph_box(ch, fpath, size)
    cx, cy = (bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2
    grp = T.empty(name, loc=(pos[0], pos[1], z), rot=(0, 0, math.radians(rot_deg)), parent=parent)
    top, bot = cols
    m = T.mat_gradient(name + '_mat', top, bot, bb[1] - cy, bb[3] - cy, rough=rough, coat=coat, sss=sss)
    T.text_mesh(ch, fpath, size, depth, bevel, m, name + '_L', offset=-bevel * 0.35, dx=-cx, dy=-cy,
                parent=grp)
    if snow:
        smp = T.edge_samples(loops, step=max(0.006, snow_r * 0.33), skip_holes=True)
        sn, _n = T.snow_cap(smp, depth + bevel, name.replace('.', '') + 'snow', parent=grp, r=snow_r,
                            seed=seed, drips=drips, dx=-cx, dy=-cy, mat=T.mat_snow(), up=up)
        sn.data.resolution = sn.data.render_resolution
        T.snow_to_mesh(sn)
    return grp, (bb[2] - bb[0], bb[3] - bb[1]), (cx, cy)


def word_row(text, fpath, size, palette, prefix, y, gap, arch=0.0, tilt=0.0, bounce=0.0, seed=10,
             parent=None, x0=0.0, **kw):
    """Letters side by side (bbox spacing), centred on x0, on a gentle arch."""
    boxes = [glyph_box(ch, fpath, size)[1] for ch in text]
    ws = [b[2] - b[0] for b in boxes]
    total = sum(ws) + gap * (len(text) - 1)
    x = x0 - total / 2
    out = []
    half = max(total / 2, 1e-6)
    for i, ch in enumerate(text):
        cxp = x + ws[i] / 2
        u = (cxp - x0) / half
        yy = y - arch * u * u + (bounce if i % 2 else -bounce) * (1 if i % 4 < 2 else 0.6)
        rot = -tilt * u
        cols = palette[i % len(palette)] if isinstance(palette, list) else palette
        if ch.strip():
            g, wh, c = letter(ch, fpath, size, cols, '%s%d' % (prefix, i), (cxp, yy), rot, seed=seed + i,
                              parent=parent, **kw)
            out.append((ch, g, wh))
        x += ws[i] + gap
    return out


# ------------------------------------------------------------------ props
def sparkle(name, R, loc, rot=0.0, parent=None):
    m = T.mat_gradient(name + '_m', '#FFF3B0', '#FFB21C', -R, R, rough=0.2, coat=0.8)
    return T.poly_solid(name, T.star_pts(R, R * 0.42, 4, rot=math.radians(rot)), R * 0.12, R * 0.10, m,
                        parent=parent, loc=loc)


def sign(name, w, h, loc, text, fpath, text_size, rot_deg=0.0, parent=None, seed=7, text_cols=None):
    """A small warm wooden plank sign with a snow cap, nails and the text in cream letters."""
    root = T.empty(name, loc=loc, rot=(0, 0, math.radians(rot_deg)), parent=parent)
    wood = T.wood_mat(name + '_wood', C.PAL['sign_wood'][0], C.PAL['sign_wood'][1], h)
    d = 0.045
    T.poly_solid(name + '_board', T.rounded_rect(w, h, min(0.10, h * 0.32)), d, 0.03, wood, parent=root)
    # darker frame groove (a slightly larger board behind)
    back = T.mat_flat(name + '_back', '#7A4A26', rough=0.6)
    T.poly_solid(name + '_frame', T.rounded_rect(w + 0.05, h + 0.05, min(0.12, h * 0.34)), d * 0.6, 0.02, back,
                 parent=root, loc=(0, 0, -0.03))
    nail = T.mat_flat(name + '_nail', '#5B5F6B', rough=0.3)
    for sx in (-1, 1):
        T.ellipsoid(name + '_nail%d' % sx, 0.022, 0.022, 0.012, nail, parent=root,
                    loc=(sx * (w / 2 - 0.07), 0.0, d + 0.03))
    # snow along the top edge
    pts = []
    n = int(w / 0.012)
    for i in range(n + 1):
        x = -w / 2 + 0.03 + (w - 0.06) * i / n
        pts.append((Vector((x, h / 2 + 0.01)), Vector((0, 1))))
    sn, _ = T.snow_cap([pts], d + 0.03, name.replace('.', '') + 'snow', parent=root, r=0.05, seed=seed,
                       drips=0.10, mat=T.mat_snow(), side_drip=True)
    sn.data.resolution = sn.data.render_resolution
    T.snow_to_mesh(sn)
    tc = text_cols or (C.PAL['sign_text'], '#F1D6AE')
    boxes = [glyph_box(ch, fpath, text_size)[1] for ch in text]
    letters = []
    if fpath == C.FONT_EN:
        adv = advances(text, fpath)
        total = adv[-1] * text_size
        for i, ch in enumerate(text):
            if not ch.strip():
                continue
            b = boxes[i]
            cx = -total / 2 + adv[i] * text_size + (b[0] + b[2]) / 2
            g, _wh, _c = letter(ch, fpath, text_size, tc, '%s_t%d' % (name, i), (cx, -0.035 + (b[1] + b[3]) / 2 - 0.30 * text_size),
                                0.0, depth=0.022, bevel=0.014, snow=False, parent=root, z=d + 0.035, rough=0.45, coat=0.2)
            letters.append(g)
    else:
        gap = text_size * 0.07
        ws = [b[2] - b[0] for b in boxes]
        total = sum(ws) + gap * (len(text) - 1)
        x = -total / 2
        for i, ch in enumerate(text):
            g, _wh, _c = letter(ch, fpath, text_size, tc, '%s_t%d' % (name, i), (x + ws[i] / 2, -0.02), 0.0,
                                depth=0.022, bevel=0.014, snow=False, parent=root, z=d + 0.035, rough=0.45, coat=0.2)
            letters.append(g)
            x += ws[i] + gap
    return root


def advances(text, fpath):
    """Pen positions (em units) of each character + the total advance, from the font's metrics."""
    from PIL import ImageFont
    f = ImageFont.truetype(fpath, 1000)
    out = [f.getlength(text[:i]) / 1000.0 for i in range(len(text) + 1)]
    return out


# ------------------------------------------------------------------ layouts
def build_main():
    t = C.TITLE
    S = 1.0
    main = t['main']
    rows = word_row(main, C.FONT_KO, S, C.PAL['main'], 'M', 0.0, 0.045, arch=0.10, tilt=5.0, bounce=0.025,
                    depth=0.105, bevel=0.036, snow_r=0.056, drips=0.10)
    tops, bots = [], []
    for i, (ch, g, wh) in enumerate(rows):
        reg(1 + i, 'main_%d' % i, g)
        tops.append(g.location.y + wh[1] / 2)
        bots.append(g.location.y - wh[1] / 2)
    # the emblem sits on 꽃 (or on the 2nd syllable when the name has no 꽃)
    k = main.index('꽃') if '꽃' in main else min(1, len(rows) - 1)
    ch, g, wh = rows[k]
    em = T.emblem('emblem', 0.205, loc=(g.location.x + wh[0] * 0.40, g.location.y + wh[1] * 0.52, 0.26),
                  rot_deg=12)
    reg(5, 'emblem', em)
    # 행복한: smaller gold letters over the main word, with sparkles
    top_y = max(tops) + 0.36
    trow = word_row(t['top'], C.FONT_KO, 0.50, [C.PAL['top']], 'T', top_y, 0.035, arch=0.04, tilt=4.0,
                    bounce=0.0, depth=0.075, bevel=0.026, snow=False, rough=0.25, coat=0.8)
    trow_w = sum(w for _c, _g, (w, _h) in trow) + 0.03 * (len(trow) - 1)
    sp = [sparkle('spk0', 0.075, (-trow_w / 2 - 0.15, top_y + 0.02, 0.05), 0),
          sparkle('spk1', 0.045, (-trow_w / 2 - 0.05, top_y + 0.17, 0.05), 20),
          sparkle('spk2', 0.075, (trow_w / 2 + 0.15, top_y + 0.06, 0.05), 10),
          sparkle('spk3', 0.04, (trow_w / 2 + 0.05, top_y - 0.12, 0.05), 35)]
    reg(0, 'top', *[g for _c, g, _w in trow], *sp)
    # 이야기 on a little wooden sign under the main word (in front of it)
    ts = 0.34
    tw = sum(glyph_box(c, C.FONT_KO, ts)[1][2] - glyph_box(c, C.FONT_KO, ts)[1][0] for c in t['bottom'])
    sw = tw + ts * 0.07 * (len(t['bottom']) - 1) + 0.34
    sh = 0.36
    sy = min(bots) - sh * 0.5
    sg = sign('sign', sw, sh, (0.06, sy, 0.24), t['bottom'], C.FONT_KO, ts, rot_deg=-2.5)
    reg(6, 'sign', sg)


def build_short():
    t = C.TITLE
    s = t['short']
    n = len(s)
    half = (n + 1) // 2
    lines = [s[:half], s[half:]] if n > 2 else [s]
    S = 1.0
    ys = [0.40, -0.42] if len(lines) == 2 else [0.0]
    idx = 0
    pal = C.PAL['main']
    for li, line in enumerate(lines):
        rows = word_row(line, C.FONT_KO, S, pal[idx % len(pal):] + pal[:idx % len(pal)], 'S%d' % li, ys[li],
                        0.05, arch=0.0, tilt=3.0 if li == 0 else -3.0, bounce=0.02, seed=20 + li * 5,
                        depth=0.105, bevel=0.036, snow_r=0.056, drips=0.10)
        for ch, g, wh in rows:
            reg(1 + idx, 'short_%d' % idx, g)
            if ch == '꽃':
                em = T.emblem('emblem', 0.205, loc=(g.location.x + wh[0] * 0.40, g.location.y + wh[1] * 0.52, 0.26),
                              rot_deg=12)
                reg(9, 'emblem', em)
            idx += 1
    if 9 not in PIECES:
        em = T.emblem('emblem', 0.2, loc=(0.0, ys[0] + 0.55, 0.26), rot_deg=12)
        reg(9, 'emblem', em)


def build_en():
    t = C.TITLE
    word = t['en_main']
    S = 1.0
    adv = advances(word, C.FONT_EN)
    total = adv[-1] * S
    # which 'o' becomes the emblem
    part = t.get('emblem_in_en', '')
    p0 = word.find(part) if part else -1
    eo = word.find('o', p0) if p0 >= 0 else -1
    blue, pink = C.PAL['main'][0], C.PAL['main'][1]
    split = p0 if p0 > 0 else len(word)
    half = total / 2
    piece = 1
    for i, ch in enumerate(word):
        b = glyph_box(ch, C.FONT_EN, S)[1]
        cx = -half + adv[i] * S + (b[0] + b[2]) / 2
        cy = (b[1] + b[3]) / 2
        u = cx / half
        y = cy - 0.07 * u * u + (0.018 if i % 2 else -0.018)
        rot = -4.0 * u
        if i == eo:
            em = T.emblem('emblem', (b[2] - b[0]) * 0.66, loc=(cx, y + 0.01, 0.20), rot_deg=10)
            reg(piece, 'en_%d' % i, em)
        else:
            g, wh, c = letter(ch, C.FONT_EN, S, blue if i < split else pink, 'E%d' % i, (cx, y), rot,
                              seed=40 + i, depth=0.10, bevel=0.034, snow_r=0.05, drips=0.10)
            reg(piece, 'en_%d' % i, g)
        piece += 1
    # Village on the sign
    ts = 0.36
    sub = t['en_sub']
    sadv = advances(sub, C.FONT_EN)
    sw = sadv[-1] * ts + 0.36
    sg = sign('sign', sw, 0.36, (0.10, -0.33, 0.22), sub, C.FONT_EN, ts, rot_deg=-2.5)
    reg(piece, 'sign', sg)


LAYOUTS = {'main': build_main, 'short': build_short, 'en': build_en}


# ------------------------------------------------------------------ lights + framing + render
def lights():
    T.world_env((0.50, 0.56, 0.72), 0.45, top=(0.95, 0.97, 1.0))
    T.area_light('key', (-4, 6, 7), (0, 0, 0), 5, 800, color=(1, 0.97, 0.92))
    T.area_light('glint', (-1.5, 3.5, 4), (0, 0, 0), 1.0, 170, color=(1, 1, 1), shadow=False)
    T.area_light('rim', (3, 7, -4), (0, 0, 0), 4, 450, color=(0.80, 0.90, 1.0))
    T.area_light('fill', (3, -2, 8), (0, 0, 0), 7, 260, color=(1, 0.95, 0.9), shadow=False)


def all_points():
    pts = []
    for ob in bpy.context.scene.objects:
        if ob.type != 'MESH':
            continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            pts.append(mw @ v.co)
    return pts


def frame_camera(ppu, pad_px):
    cam = T.ortho_camera(0.0, 0.0, 10.0, 100, 100, tilt_deg=TILT)
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    xs, ys = [], []
    for p in all_points():
        q = inv @ p
        xs.append(q.x)
        ys.append(q.y)
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    wu, hu = x1 - x0, y1 - y0
    W = int(math.ceil(wu * ppu + 2 * pad_px))
    H = int(math.ceil(hu * ppu + 2 * pad_px))
    W += W % 2
    H += H % 2
    cam.data.ortho_scale = max(W, H) / ppu
    # move the camera in its own plane so the bounds' centre is the frame centre
    cxm, cym = (x0 + x1) / 2, (y0 + y1) / 2
    cam.location = cam.matrix_world @ Vector((cxm, cym, 0.0))
    bpy.context.view_layer.update()
    return cam, W, H


def project(cam, W, H, ppu, p):
    q = cam.matrix_world.inverted() @ Vector(p)
    return (W / 2 + q.x * ppu, H / 2 - q.y * ppu)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--layout', default='main', choices=sorted(LAYOUTS))
    ap.add_argument('--out', required=True)
    ap.add_argument('--ppu', type=float, default=380.0)
    ap.add_argument('--pad', type=int, default=40)
    ap.add_argument('--samples', type=int, default=40)
    ap.add_argument('--pct', type=int, default=100)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--skip-existing', action='store_true', help='resume: keep renders already on disk')
    ap.add_argument('--no-label', action='store_true')
    ap.add_argument('--parts', action='store_true', help='also render every piece alone (for the drop-in)')
    ap.add_argument('--parts-only', action='store_true', help='render only the pieces (the packer composites them)')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    T.reset()
    PIECES.clear()
    PIECE_NAMES.clear()
    LAYOUTS[a.layout]()
    lights()
    cam, W, H = frame_camera(a.ppu, a.pad)
    sc = T.render_setup(W, H, samples=a.samples, threads=a.threads)
    sc.render.resolution_percentage = a.pct
    base = os.path.join(a.out, 'logo_%s' % a.layout)
    info = {'layout': a.layout, 'texts': C.TITLE, 'ppu': a.ppu, 'size': [W, H], 'pct': a.pct, 'pieces': {}}
    for idx in sorted(PIECES):
        grp = PIECES[idx][0]
        c = project(cam, W, H, a.ppu, grp.matrix_world.translation)
        info['pieces'][str(idx)] = {'name': PIECE_NAMES[idx], 'pivot': [round(c[0], 1), round(c[1], 1)]}
    sc.render.filepath = base + '.png'
    if a.parts_only:
        a.parts = True
    elif not (a.skip_existing and os.path.exists(sc.render.filepath)):
        bpy.ops.render.render(write_still=True)
    if a.parts:
        # every piece alone (nothing in front of it), same camera -> parts line up with the full logo
        allp = {ob.name for obs in PIECES.values() for ob in obs}
        for idx in sorted(PIECES):
            mine = {ob.name for ob in PIECES[idx]}
            for ob in bpy.context.scene.objects:
                if ob.name in allp:
                    ob.hide_render = ob.name not in mine
            sc.render.filepath = base + '_part%d.png' % idx
            if a.skip_existing and os.path.exists(sc.render.filepath):
                continue
            bpy.ops.render.render(write_still=True)
            print('PART_DONE', idx, PIECE_NAMES[idx], flush=True)
        for ob in bpy.context.scene.objects:
            ob.hide_render = False
    if not a.no_label:
        T.label_pass(PIECES)
        sc.cycles.samples = 4
        sc.cycles.use_denoising = False
        sc.render.filter_size = 0.6
        sc.world = None
        sc.render.filepath = base + '_label.png'
        bpy.ops.render.render(write_still=True)
    with open(base + '.json', 'w') as f:
        json.dump(info, f, ensure_ascii=False, indent=1)
    print('LOGO_DONE', a.layout, W, H)


if __name__ == '__main__':
    main()
