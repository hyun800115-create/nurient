"""
gb_signs.py - the small camera-facing / overlay pieces of the 금방 set (docs/CONTRACT_GEUMBANG.md AO.3, AO.7):

  gb_roofsign_{ko|en}_{0|1}   the van's roof sign: a cream A-board in a gold rim on a charcoal roof bar, the mark and
                              navy "금방" (ko) or a stacked GEUM / BANG lockup (en); 96 x 56, anchor bottom centre (= the roof bar's front foot);
                              0 = day, 1 = lit (the face glows, the letters stay navy).  Built facing the camera, so one
                              sprite serves every van heading and is NEVER mirrored.
  gb_pennant_{SE|NE}_{0..3}   a gold mark pennant on a stick for the dog sled's right handle upright; 48 x 56, anchor =
                              the stick foot; flutter 4 f (the cloth carries its print, gb_tex.pennant).  Rendered in
                              the sled's own two headings (SE / NE); SW / NW = flipX (the mark is symmetric).
Not run directly - see gb_render.py.
"""
import json
import math
import os
import time

import bpy  # noqa: F401

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere
import town_lib as T
import gb_lib as G

ROOF_FRAME = (96, 56)
ROOF_ANCHOR = (48, 56)
PEN_FRAME = (48, 56)
PEN_ANCHOR = (34, 50)
PEN_FOOT_SLED = (-0.3, 1.38, 1.05)      # dog_sled body-local: top of the right handle upright (the camera side)
PEN = dict(stick=0.76, hoist0=0.46, hoist1=0.74, length=0.48)
TEXT = {'ko': ('금방', G.FONT_KO, 0.34, 0.66)}
EN_CAP, EN_LEAD = 0.192, 0.045           # en lockup: cap height of GEUM / BANG (m) and the gap between the lines
EN_MARK, EN_GAP = 0.40, 0.06
EN_FONT = 'Fredoka-SemiBold.ttf'         # the house EN face one weight lighter: big letters, navy <= 15 % of the board


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


def roofsign(lang, lit):
    """Build the roof sign (world origin = the front foot of the roof bar, camera facing)."""
    objs = []
    W, H = 1.46, 0.6
    z0 = 0.11
    tilt = 9.0
    rim = G._mat('gb_gold', G.GOLD, 0.4, 0.0)
    face = G._mat('gb_face', G.CREAM, 0.55, 1.5 if lit else 0.3)
    char = flat(G.CHARCOAL, 0.45)
    # roof bar + 2 posts
    objs.append(box('rs_bar', (1.22, 0.22, 0.075), (0, 0.11, 0.0), mat=char, bevel=0.03))
    for sx in (-1, 1):
        objs.append(cyl('rs_post', 0.025, 0.08, (sx * 0.45, 0.13, 0.06), mat=G.flat('#C3CCD8', 0.3, 0.6), segs=10,
                        bevel=0.0))
    with L.Collect() as c:
        # A-board: front panel (rim + cream face), back panel behind it (only its top edge peeks out)
        T.ext_xz('rs_rim', T.rounded_rect_pts(W, H, 0.12, n=5, cz=H / 2), 0.05, rim, y=0.04, bevel=0.015)
        T.ext_xz('rs_face', T.rounded_rect_pts(W - 0.12, H - 0.12, 0.08, n=5, cz=H / 2), 0.022, face, y=-0.009,
                 bevel=0.008)
        if lang == 'ko':
            with L.Collect() as m:
                G.mark(0.46, depth=0.55, lit=0.9 if lit else 0.0, name='rs_mk')
            L.group([o for o in m.objs if o.parent is None], 'rs_mkg', loc=(-0.42, -0.03, H / 2))
            body, font, h, mw = TEXT[lang]
            tx = G.text_mesh('rs_tx', body, font, height=h, max_w=mw, depth=0.014, bevel=0.005, mat=flat(G.NAVY, 0.4))
            tx.location = (0.235, -0.031, H / 2 - 0.005)
        else:
            # (polish M3) "GEUMBANG" on one line was 6 px caps (8 letters on a 96 px board): the en board is a
            # stacked lockup - a smaller mark + GEUM / BANG on two lines at EN_CAP m (>= 10 px caps on the sprite)
            lines = []
            for k, word in enumerate(('GEUM', 'BANG')):
                t = G.text_mesh('rs_tx%d' % k, word, EN_FONT, height=EN_CAP, depth=0.014, bevel=0.005,
                                mat=flat(G.NAVY, 0.4))
                lines.append(t)
            wmax = max(t['textW'] for t in lines)
            start = -(EN_MARK + EN_GAP + wmax) / 2           # the whole lockup centred on the face
            with L.Collect() as m:
                G.mark(EN_MARK, depth=0.55, lit=0.9 if lit else 0.0, name='rs_mk')
            L.group([o for o in m.objs if o.parent is None], 'rs_mkg', loc=(start + EN_MARK / 2, -0.03, H / 2))
            x0 = start + EN_MARK + EN_GAP
            for k, t in enumerate(lines):
                t.location = (x0 + wmax / 2, -0.031, H / 2 + (1 if k == 0 else -1) * (EN_CAP + EN_LEAD) / 2)
        L.snow_slab('rs_snow', W - 0.16, 0.12, 0.045, (0, 0.03, H - 0.012), seed=6)
    front = L.group([o for o in c.objs if o.parent is None], 'rs_front', loc=(0, 0.09, z0), rot=(-tilt, 0, 0))
    with L.Collect() as c2:
        T.ext_xz('rs_back', T.rounded_rect_pts(W, H, 0.12, n=5, cz=H / 2), 0.05, rim, y=0.0, bevel=0.015)
    yb = 0.09 + 0.05 + 2.0 * H * math.sin(math.radians(tilt)) + 0.02
    back = L.group([o for o in c2.objs if o.parent is None], 'rs_backg', loc=(0, yb, z0), rot=(tilt, 0, 0))
    objs += [front, back]
    if lit:
        L.point_light('rs_glow', (0, -0.4, 0.45), 'window', 6.0, 0.4)
    import bld_assets as BA
    return L.group(BA.top_level(objs), 'roofsign', rot=(0, 0, T.CAM_PSI))


def render_roofsigns(opts):
    out = os.path.join(opts['cache'], 'roofsign')
    os.makedirs(out, exist_ok=True)
    meta = {'frameSize': list(ROOF_FRAME), 'anchorPx': list(ROOF_ANCHOR), 'frames': []}
    t0 = time.time()
    for lang in ('ko', 'en'):
        for lit in (0, 1):
            name = 'gb_roofsign_%s_%d' % (lang, lit)
            meta['frames'].append(name)
            p = os.path.join(out, name + '.png')
            if os.path.exists(p) and not opts['force']:
                continue
            bc.reset_scene()
            L._CUSTOM.clear()
            bc.setup_lighting()
            roofsign(lang, lit)
            bpy.context.view_layer.update()
            w, h, an, top = L.frame_fit(margin=0, shadow=False)
            sc = bc.setup_render(ROOF_FRAME[0], ROOF_FRAME[1], samples=opts.get('samples') or 64)
            sc.cycles.max_bounces = 4
            bc.setup_camera(ROOF_FRAME[0], ROOF_FRAME[1], ROOF_ANCHOR)
            render_png(p)
            meta.setdefault('fit', {})[name] = {'need': [w, h], 'anchor': list(an)}
            print('[roofsign] %s (needs %dx%d, anchor %s)  %.0fs' % (name, w, h, an, time.time() - t0), flush=True)
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


# =================================================================================================== pennant

def pennant(d, i, n=4):
    """Stick + printed pennant in the dog sled's local frame (front -Y, the cloth trails +Y), rotated to heading d.
    Origin = the stick foot."""
    root = bpy.data.objects.new('pen_root', None)
    bpy.context.scene.collection.objects.link(root)
    stick = cyl('pen_stick', 0.014, PEN['stick'], (0, 0, 0), mat=flat(G.CHARCOAL, 0.5), segs=10, bevel=0.0)
    ball = sphere('pen_ball', 0.03, (0, 0, PEN['stick'] + 0.01), G.flat(G.GOLD, 0.3, 0.4), segs=14, rings=8)
    clip = cyl('pen_clip', 0.026, 0.06, (0, 0, -0.01), mat=flat(G.CHARCOAL, 0.5), segs=10, bevel=0.005)
    ph = i / float(n)
    h0, h1, ln = PEN['hoist0'], PEN['hoist1'], PEN['length']

    def pos(u, v):
        amp = 0.045 * u ** 1.2
        x = amp * math.sin(math.tau * (u * 1.15 - ph))
        y = 0.016 + u * ln
        z = h0 + v * (h1 - h0) - 0.05 * u * u + 0.012 * math.sin(math.tau * (u * 0.8 - ph))
        return (x, y, z)
    tex = os.path.join(G_CACHE['tex'], 'pennant.png')
    cl = G.cloth('pen_cloth', 16, 6, pos, G.tex_mat('pen_mat', tex, alpha=True))
    for o in (stick, ball, clip, cl):
        o.parent = root
    root.rotation_euler = (0, 0, bc.yaw_for_dir(d))
    bpy.context.view_layer.update()
    return root


G_CACHE = {}


def render_pennant(opts):
    import gb_tex
    out = os.path.join(opts['cache'], 'pennant')
    os.makedirs(out, exist_ok=True)
    G_CACHE['tex'] = os.path.join(opts['cache'], 'tex')
    gb_tex.write_all(G_CACHE['tex'])
    meta = {'frameSize': list(PEN_FRAME), 'anchorPx': list(PEN_ANCHOR), 'dirs': ['SE', 'NE'], 'frames': 4,
            'footSled': list(PEN_FOOT_SLED)}
    t0 = time.time()
    for d in ('SE', 'NE'):
        for i in range(4):
            name = 'gb_pennant_%s_%d' % (d, i)
            p = os.path.join(out, name + '.png')
            if os.path.exists(p) and not opts['force']:
                continue
            bc.reset_scene()
            L._CUSTOM.clear()
            bc.setup_lighting()
            pennant(d, i)
            sc = bc.setup_render(PEN_FRAME[0], PEN_FRAME[1], samples=opts.get('samples') or 48)
            sc.cycles.max_bounces = 4
            bc.setup_camera(PEN_FRAME[0], PEN_FRAME[1], PEN_ANCHOR)
            render_png(p)
            print('[pennant] %s  %.0fs' % (name, time.time() - t0), flush=True)
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
