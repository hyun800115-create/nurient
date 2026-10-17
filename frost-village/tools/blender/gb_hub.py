"""
gb_hub.py - the 금방 / 서리 layers of the logistics centre (docs/CONTRACT_GEUMBANG.md AO.4), rendered on the centre's
OWN frame: the whole logistics_center scene is built by lgx_center.build() (imported read-only, unchanged), the new
pieces are added on top with their own pass tags, and every new layer is a border render of the same camera
(frame 1152 x 864, anchor (478, 509) = the shipped [0.41493, 0.58912]) so it lands on the building pixel-exactly.

  gb_nameplate_ko      mark + big "금방" + small "물류센터"          raised navy letters (Jua), the mark in relief
  gb_nameplate_en      mark + "GEUMBANG" over "CENTRE"              (Fredoka Bold)
  seori_nameplate_ko   "서리 물류창고"                               (as the shipped 솔방울 plate: Jua, same fit rule)
  seori_nameplate_en   "Frost Depot"                                (Fredoka Bold)
        -> kind layer, replaces nameplate_<lang>, rendered with the shell as holdout (letters lit like the shell)
  gb_banner_{ko|en}_{0..3}   a 0.7 x 1.8 m printed cloth on the -Y wall left of dock 1 (x 3.9..4.6 m, z 2.1..3.9 m),
        clear of dock 1, the dock lamps, the loading sign and the name board; sway 4 frames; its soft shadow on the wall
        is caught by a small wall-plane shadow catcher right behind it (the shell is hidden in that pass, so only
        the banner's own shadow / contact darkening is caught)
Not run directly - see gb_render.py.
"""
import json
import math
import os
import time

import bpy  # noqa: F401
from mathutils import Vector

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere
import gb_lib as G

FRAME = (1152, 864)
ANCHOR = (478, 509)
BANNER = dict(x0=3.9, w=0.7, z0=2.1, h=1.8)
SWAY = 4


def tag(objs, group):
    for o in objs:
        for ob in [o] + list(o.children_recursive):
            ob['lgx'] = group


def board(LC):
    bx0, bx1, bz0, bz1 = LC.BOARD
    return dict(cx=(bx0 + bx1) / 2, cz=(bz0 + bz1) / 2, w=bx1 - bx0 - 0.08, h=bz1 - bz0 - 0.08, y=-LC.Y0 - 0.152)


def place_text(name, body, font, h, x, z, y, align_bottom=None, max_w=None):
    o = G.text_mesh(name, body, font, height=h, max_w=max_w, depth=0.012, bevel=0.006, mat=flat(G.NAVY, 0.45))
    o.location = (x, y, z)
    return o


def nameplate_gb(LC, lang):
    B = board(LC)
    objs = []
    with L.Collect() as c:
        G.mark(0.6, depth=0.5, name='np_mk_' + lang)
    mk = L.group([o for o in c.objs if o.parent is None], 'np_mkg_' + lang)
    objs.append(mk)
    if lang == 'ko':
        t1 = G.text_mesh('np_t1_ko', '금방', G.FONT_KO, height=0.44, depth=0.012, bevel=0.006, mat=flat(G.NAVY, 0.45))
        t2 = G.text_mesh('np_t2_ko', '물류센터', G.FONT_KO, height=0.25, depth=0.012, bevel=0.006,
                         mat=flat(G.NAVY, 0.45))
        w1, w2 = t1['textW'], t2['textW']
        gap1, gap2 = 0.12, 0.14
        total = 0.6 + gap1 + w1 + gap2 + w2
        x = B['cx'] - total / 2
        mk.location = (x + 0.3, B['y'], B['cz'])
        x += 0.6 + gap1
        bottom = B['cz'] - 0.44 / 2
        t1.location = (x + w1 / 2, B['y'], B['cz'])
        x += w1 + gap2
        t2.location = (x + w2 / 2, B['y'], bottom + t2['textH'] / 2)
        objs += [t1, t2]
    else:
        t1 = G.text_mesh('np_t1_en', 'GEUMBANG', G.FONT_EN, height=0.28, depth=0.012, bevel=0.006,
                         mat=flat(G.NAVY, 0.45))
        t2 = G.text_mesh('np_t2_en', 'CENTRE', G.FONT_EN, height=0.17, depth=0.012, bevel=0.006,
                         mat=flat(G.NAVY, 0.45))
        w = max(t1['textW'], t2['textW'])
        gap = 0.14
        total = 0.6 + gap + w
        x = B['cx'] - total / 2
        mk.location = (x + 0.3, B['y'], B['cz'])
        tx = x + 0.6 + gap
        block = 0.28 + 0.07 + 0.17
        t1.location = (tx + t1['textW'] / 2, B['y'], B['cz'] + block / 2 - 0.14)
        t2.location = (tx + t2['textW'] / 2, B['y'], B['cz'] - block / 2 + 0.085)
        objs += [t1, t2]
    if total > B['w'] * 0.96:
        print('WARNING gb nameplate %s is %.2f m wide (board %.2f)' % (lang, total, B['w']))
    tag(objs, 'gbname_' + lang)
    return {'widthM': round(total, 3)}


SEORI = {'ko': ('서리 물류창고', G.FONT_KO, 0.44), 'en': ('Frost Depot', G.FONT_EN, 0.36)}


def nameplate_seori(LC, lang):
    """Same fit rule as lgx_center.name_lettering (88 % of the board width, h_frac of its height; en x 1.25)."""
    B = board(LC)
    body, font, h_frac = SEORI[lang]
    probe = G.text_mesh('sp_probe_' + lang, body, font, height=1.0)
    tw, th = probe['textW'], probe['textH']
    bpy.data.objects.remove(probe, do_unlink=True)
    sc = min(B['w'] * 0.88 / tw, B['h'] * h_frac / th * (1.0 if lang == 'ko' else 1.25))
    o = G.text_mesh('sp_' + lang, body, font, height=th * sc, depth=0.012, bevel=0.006, mat=flat(G.NAVY, 0.45))
    o.location = (B['cx'], B['y'], B['cz'] + 0.01)
    tag([o], 'seori_' + lang)
    return {'textWidthM': round(o['textW'], 3), 'textHeightM': round(o['textH'], 3)}


def banner(LC, lang, f, tex):
    b = BANNER
    y_wall = -LC.Y0 - 0.006
    ph = f / float(SWAY)

    def pos(u, v):
        hang = 1.0 - v
        sx = 0.03 * hang ** 1.6 * math.sin(math.tau * ph)
        rip = 0.012 + 0.022 * hang * (0.5 + 0.5 * math.sin(math.tau * (u * 0.9 + hang * 0.7 - ph)))
        return (b['x0'] + u * b['w'] + sx * (0.6 + 0.4 * u), y_wall - 0.03 - rip, b['z0'] + v * b['h'])
    cl = G.cloth('bn_cloth_%s_%d' % (lang, f), 10, 24, pos, G.tex_mat('bn_mat_%s_%d' % (lang, f), tex, alpha=False))
    rod = cyl('bn_rod', 0.022, b['w'] + 0.14, (b['x0'] - 0.07, y_wall - 0.04, b['z0'] + b['h'] + 0.02),
              rot=(0, 90, 0), mat=G.flat(G.GOLD_D, 0.3, 0.5), segs=12, origin='bottom', bevel=0.005)
    rod.location = (b['x0'] - 0.07, y_wall - 0.04, b['z0'] + b['h'] + 0.02)
    caps = [sphere('bn_cap', 0.035, (b['x0'] - 0.07 + k * (b['w'] + 0.14), y_wall - 0.04, b['z0'] + b['h'] + 0.02),
                   G.flat(G.GOLD, 0.3, 0.5), segs=12, rings=8) for k in (0, 1)]
    brk = [box('bn_brk', (0.04, 0.06, 0.08), (b['x0'] + k * b['w'], y_wall - 0.02, b['z0'] + b['h'] - 0.02),
               mat=flat(G.CHARCOAL, 0.5), bevel=0.01) for k in (0.08, 0.92)]
    objs = [cl, rod] + caps + brk
    tag(objs, 'gbbanner')
    return objs


# (polish M2) the shell bakes the old logistics mark twice - a winged parcel on the big +X gable disc and on the corner
# blade sign (wings on parcels are off-brand for 금방) - and a red-ribboned parcel on the ridge.  Each gets a re-render
# PATCH over logistics_center_shell: the region is rendered twice in the shell pass, as shipped ('base_<key>') and
# with the old emblem hidden + the 금방이 mark in its place (or gold ribbons), and gb_pack keeps only the pixels that
# changed (+ a collar) - so the wall / pillar where the wings were is re-rendered too, pixel-exact on the shell.
EMBLEMS = {
    # key: (sign group, old emblem group, new mark outer radius m, sign board thickness m)
    'gb_emblem_gable': ('gsign', 'gsign_em', 0.56, 0.1),       # cream gable disc r 0.62: the mark inside its rim
    'gb_emblem_blade': ('corner_sign_disc', 'corner_sign_disc_em', 0.45, 0.08),   # blue disc r 0.38: covered
}
ROOF_PARCEL = ('pr1', 'pr2', 'pbow')


def _desc(o):
    return [o] + list(o.children_recursive)


def emblem_setup():
    """Build the replacement marks (tag 'gbem', hidden in every other pass) and return
    {key: (old objs, new objs, bbox objs)} + the roof-parcel ribbon objects."""
    out = {}
    for key, (sg, eg, rn, t) in EMBLEMS.items():
        sign = bpy.data.objects.get(sg)
        old = bpy.data.objects.get(eg)
        if sign is None or old is None:
            raise SystemExit('gb_hub: %s / %s not found in the logistics centre scene' % (sg, eg))
        with L.Collect() as c:
            G.mark(2.0 * rn, depth=0.8, name='gbem_' + key)
        g = L.group([o for o in c.objs if o.parent is None], 'gbemg_' + key)
        g.parent = sign
        g.matrix_parent_inverse.identity()
        g.location = (0.0, -t / 2 - 0.012, 0.0)
        g.rotation_euler = (0.0, 0.0, 0.0)
        tag([g], 'gbem')
        bpy.context.view_layer.update()
        olds = [o for o in _desc(old) if o.type in ('MESH', 'CURVE')]
        news = [o for o in _desc(g) if o.type in ('MESH', 'CURVE')]
        out[key] = (olds, news, [o for o in _desc(sign) if o.type in ('MESH', 'CURVE')])
    rib = [o for o in bpy.context.scene.objects if o.name.split('.')[0] in ROOF_PARCEL or
           o.name.startswith('pbow')]
    rib = [o for o in rib if o.type in ('MESH', 'CURVE')]
    box_objs = rib + [o for o in bpy.context.scene.objects if o.name.startswith(('bigparcel', 'psnow', 'plab'))
                      and o.type in ('MESH', 'CURVE')]
    out['gb_roofparcel'] = ([], [], box_objs)
    return out, rib


def render_hub(opts):
    import lgx_center as LC
    import lgx_render as LR
    import gb_tex
    out = os.path.join(opts['cache'], 'hub')
    os.makedirs(out, exist_ok=True)
    tex = gb_tex.write_all(os.path.join(opts['cache'], 'tex'))
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    ctl, P = LC.build()
    info = {}
    for lang in ('ko', 'en'):
        info['gb_nameplate_' + lang] = nameplate_gb(LC, lang)
        info['seori_nameplate_' + lang] = nameplate_seori(LC, lang)
    emb, ribbons = emblem_setup()
    banners = {}
    for lang in ('ko', 'en'):
        for f in range(SWAY):
            objs = banner(LC, lang, f, tex['banner_' + lang])
            for o in objs:
                for ob in [o] + list(o.children_recursive):
                    ob['lgx'] = 'gbbanner_%s_%d' % (lang, f)
            banners[(lang, f)] = objs
    # wall shadow catcher behind the banner
    wall = LR.catcher('GbWallCatch', 0, 1, 0, 1)
    me = wall.data
    import bmesh
    bm = bmesh.new()
    yw = -LC.Y0 - 0.002
    vs = [bm.verts.new(p) for p in ((3.8, yw, 1.98), (4.76, yw, 1.98), (4.76, yw, 3.97), (3.8, yw, 3.97))]
    bm.faces.new(vs)
    bm.to_mesh(me)
    bm.free()
    bpy.context.view_layer.update()
    W, H = FRAME
    sc = bc.setup_render(W, H, samples=opts.get('samples') or 40)
    sc.cycles.max_bounces = 5
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, ANCHOR)
    LR.snapshot()
    boxes = {}

    def go(name, setup, objs, catch=False, pad=8):
        bb = LR.objs_bbox_px(objs, ANCHOR, pad=pad)
        boxes[name] = [int(math.floor(bb[0])), int(math.floor(bb[1])), int(math.ceil(bb[2])), int(math.ceil(bb[3]))]
        p = os.path.join(out, name + '.png')
        if os.path.exists(p) and not opts['force']:
            return
        setup()
        wall.hide_render = not catch
        LR.set_border(sc, W, H, boxes[name])
        LR.render_png(p)
        print('[hub] %-24s %.0fs' % (name, time.time() - t0), flush=True)
    for key in ('gb_nameplate_ko', 'gb_nameplate_en', 'seori_nameplate_ko', 'seori_nameplate_en'):
        grp = {'gb_nameplate_ko': 'gbname_ko', 'gb_nameplate_en': 'gbname_en', 'seori_nameplate_ko': 'seori_ko',
               'seori_nameplate_en': 'seori_en'}[key]
        objs = [o for o in bpy.context.scene.objects if o.get('lgx') == grp and o.type in ('MESH', 'CURVE')]
        go(key, lambda grp=grp: LR.apply_pass([grp], [], ['shell'], []), objs)
    for (lang, f), objs in banners.items():
        grp = 'gbbanner_%s_%d' % (lang, f)
        meshes = [o for o in bpy.context.scene.objects if o.get('lgx') == grp and o.type in ('MESH', 'CURVE')]
        go('gb_banner_%s_%d' % (lang, f), lambda grp=grp: LR.apply_pass([grp], [], [], []), meshes,
           catch=True, pad=14)
    # (polish M2) emblem / roof-parcel patches: base (as shipped) + after (금방), same border box
    gold = G._mat('gb_gold', G.GOLD, 0.4, 0.0)
    emeta = {}
    for key, (olds, news, bobjs) in emb.items():
        def base_setup():
            LR.apply_pass(['shell'], ['back'], [], [])

        def after_setup(olds=olds, key=key):
            LR.apply_pass(['shell', 'gbem'] if key != 'gb_roofparcel' else ['shell'], ['back'], [], [])
            for o in olds:
                o.hide_render = True
            if key == 'gb_roofparcel':
                for o in ribbons:
                    o['gb_mats'] = [m.name for m in o.data.materials]
                    for k in range(len(o.data.materials)):
                        o.data.materials[k] = gold
        if key != 'gb_roofparcel':
            # only this key's new mark is visible in its after pass
            others = [o for k2, v in emb.items() if k2 != key for o in v[1]]

            def after_setup(olds=olds, others=others):
                LR.apply_pass(['shell', 'gbem'], ['back'], [], [])
                for o in olds + others:
                    o.hide_render = True
        go('base_' + key, base_setup, bobjs, pad=18)
        go(key, after_setup, bobjs, pad=18)
        if key == 'gb_roofparcel':
            for o in ribbons:
                names = o.get('gb_mats')
                if names:
                    for k, nm in enumerate(names):
                        o.data.materials[k] = bpy.data.materials[nm]
        emeta[key] = {'box': boxes[key], 'base': 'base_' + key}
    LR.set_border(sc, W, H, None)
    meta = {'frameSize': [W, H], 'anchorPx': list(ANCHOR), 'boxes': boxes, 'info': info, 'banner': BANNER,
            'sway': SWAY, 'samples': sc.cycles.samples, 'emblems': emeta}
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[hub] done in %.0fs' % (time.time() - t0), flush=True)
