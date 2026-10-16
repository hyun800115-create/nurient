"""
off_render.py - render the 촌장 사무실 set (docs/CONTRACT_V42.md section AI) into a raw frame cache; off_pack.py then
builds assets/office/ (atlases office_bld + office_items, manifest.json) and the docs/previews/off_* previews.

  * chief_office (off_assets.build_office): ONE scene, one camera / frame / anchor, many passes.  Per pass every
    layer group is VISIBLE, HOLDOUT (cuts alpha where it is in front), GHOST (invisible to the camera, still casts
    shadows / bounces light) or HIDDEN, so the layers composite back exactly in the game's draw order:
        floor          floorboards + rugs + dais (furniture ghosts give contact shadows; the back walls cast none)
        gshadow_open   ground shadow of the OPEN building (back walls + furniture + props) on a ring catcher
                       outside the plinth -> merged under _floor at pack time
        back           the two far walls from inside (no self shadow: bright dollhouse light)
        interior       furniture behind people (floor + back = holdout, desks = ghost)
        ifront         desks + counting table (floor + back + interior + desk overlays at frame 0 = holdout)
        shell_cut      wall stubs at 1.2 m + sills + door frame
        shell          the closed building + the outdoor props (= the closed look in one frame)
        gshadow_closed ground shadow of the closed building + props -> merged under _shell at pack time
        props          steps + lantern post + snow tufts (always drawn)
        glowmask       the lit glass of the closed building (white emission, everything else holdout) -> _glow
    Overlays (civ_lib.OVERLAYS), border-rendered (only the overlay's screen box is rendered, the frame stays full
    size so every overlay frame is aligned with the building):
        mode 'plain'  (stove fire, safe door): <name>_<i> = the overlay alone, earlier layers holdout
        mode 'patch'  (typewriters, phone, lamps on the clerk desks): <name>_solo_<i> = the overlay alone (its
                      silhouette) and <name>_<i> = the whole inside (floor .. desks, the other overlays at frame 0)
                      with this overlay at state i; off_pack keeps <name>_<i> only inside the union of the solo
                      silhouettes, so the patch replaces exactly the overlay + the desk top it moves over.
  * office_mailbox: bld_render.render_build() UNCHANGED (prop conventions, baked soft shadow), 4 frames.
  * items: bld_render.render_build() UNCHANGED with the contract's item anchor [0.5, 0.86] (72 x 72): the anchor
    constant bld_assets.ITEM_ANCHOR is set at run time only (the module file is not modified).

Every Cycles render runs with 2 fixed threads (shared build machine); frames are written as .tmp.png + rename, so an
interrupted run resumes; existing frames are skipped unless --force.

    /tmp/bvenv/bin/python tools/blender/off_render.py -- [office|mailbox|items|all] [--force] [--samples N]
                                                         [--cache DIR] [--passes a,b] [--look]
    blender -b -P tools/blender/off_render.py -- [same args]
Default cache: <tmp>/fv_cache/office.  --look = quick look-dev (16 samples, office passes only, cache .../look).
"""
import json
import math
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import bld_assets as BA  # noqa: E402
import bld_render as BR  # noqa: E402   (read-only reuse)
import civ_lib as CL  # noqa: E402
import off_assets as OA  # noqa: E402

THREADS = [2]
_orig_setup_render = bc.setup_render


def _setup_render_fixed(*a, **kw):
    sc = _orig_setup_render(*a, **kw)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS[0]
    return sc


bc.setup_render = _setup_render_fixed           # run-time wrap only (bl_common.py is not modified)

ITEM_ANCHOR = (36, 61.92)                       # [0.5, 0.86] of 72 x 72 (CONTRACT_V42 AI.3)
INNER = ['floor', 'back', 'interior', 'ifront']
PLAIN_OVL = ['stove', 'safe']
DESK_OVL = ['typewriter_a', 'lamp_a', 'lamp_b', 'typewriter_b', 'phone']      # far -> near (patch order)
KEY = 'chief_office'


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None, 'cache': os.path.join(tempfile.gettempdir(), 'fv_cache',
                                                                                'office'),
            'passes': None, 'look': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a == '--look':
            opts['look'] = True
        elif a in ('--samples', '--cache', '--passes', '--threads'):
            i += 1
            if a == '--threads':
                THREADS[0] = int(argv[i])
            else:
                opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


# =================================================================================================== pass control

def scene_objs():
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')]


SNAP = {}


def snapshot():
    SNAP.clear()
    for o in scene_objs():
        SNAP[o.name] = (o.hide_render, o.visible_shadow)


def group_of(o):
    return o.get(CL.LAYER_PROP)


def apply_pass(vis=(), hold=(), ghost=(), ghost_ns=(), hold_ns=(), vis_ns=(), extra_vis=None, extra_hold=None):
    """vis / vis_ns / hold / hold_ns / ghost / ghost_ns are layer-group names (*_ns = casts no shadow); extra_* are
    predicates (sub selections that win over the group rule).  Everything else is hidden.  The back walls never
    cast a shadow inside (bright dollhouse light), so every inner pass lists them as *_ns."""
    for o in scene_objs():
        if o.name not in SNAP or o.name.startswith('OffCatch') or o.name == 'ShadowCatcher':
            continue
        hr0, vs0 = SNAP[o.name]
        o.is_holdout = False
        o.visible_camera = True
        o.visible_shadow = vs0
        if o.get('civ_bounds'):
            o.hide_render = True
            continue
        g = group_of(o)
        mode = 'hide'
        if extra_vis and extra_vis(o):
            mode = 'vis'
        elif extra_hold and extra_hold(o):
            mode = 'hold'
        elif g in vis:
            mode = 'vis'
        elif g in vis_ns:
            mode = 'vis_ns'
        elif g in hold:
            mode = 'hold'
        elif g in hold_ns:
            mode = 'hold_ns'
        elif g in ghost:
            mode = 'ghost'
        elif g in ghost_ns:
            mode = 'ghost_ns'
        if mode == 'hide':
            o.hide_render = True
            continue
        o.hide_render = hr0
        if mode == 'vis_ns':
            o.visible_shadow = False
        elif mode in ('hold', 'hold_ns'):
            o.is_holdout = True
            if mode == 'hold_ns':
                o.visible_shadow = False
        elif mode in ('ghost', 'ghost_ns'):
            o.visible_camera = False
            if mode == 'ghost_ns':
                o.visible_shadow = False


def catcher_ring(name, hx, hy, R=30.0, z=0.0):
    """Shadow-catcher ground OUTSIDE the plinth rectangle (+-hx, +-hy): four quads around a hole."""
    import bmesh
    bm = bmesh.new()
    for (x0, x1, y0, y1) in ((-R, -hx, -R, R), (hx, R, -R, R), (-hx, hx, -R, -hy), (-hx, hx, hy, R)):
        vs = [bm.verts.new(p) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
        bm.faces.new(vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    ob.hide_render = True
    return ob


def set_border(sc, W, H, box_px=None):
    if box_px is None:
        sc.render.use_border = False
        return
    x0, y0, x1, y1 = box_px
    sc.render.use_border = True
    sc.render.use_crop_to_border = False
    sc.render.border_min_x = max(0.0, x0 / W)
    sc.render.border_max_x = min(1.0, x1 / W)
    sc.render.border_min_y = max(0.0, 1.0 - y1 / H)
    sc.render.border_max_y = min(1.0, 1.0 - y0 / H)


def px_of(p, anchor):
    return bc.world_to_pixel(tuple(p), 0, 0, anchor)


def objs_box(objs, anchor, pad=8):
    pts = L.world_points([o for o in objs if o.type in ('MESH', 'CURVE')])
    xs, ys = zip(*[px_of(p, anchor) for p in pts])
    return [int(math.floor(min(xs) - pad)), int(math.floor(min(ys) - pad)), int(math.ceil(max(xs) + pad)),
            int(math.ceil(max(ys) + pad))]


def white_emission():
    m = bpy.data.materials.new('OffMaskWhite')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 1, 1, 1)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


# =================================================================================================== office

def px(p):
    return BR.px(p)


def render_office(opts):
    out = opts['cache']
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    bc.setup_lighting()
    res = OA.build_office()
    root = BR.parent_to_root(0.0)
    bpy.context.view_layer.update()
    objs = scene_objs()
    untagged = [o.name for o in objs if CL.LAYER_PROP not in o.keys() and not o.get('civ_bounds')]
    if untagged:
        print('WARNING untagged objects -> interior: %s' % ', '.join(untagged[:12]))
        for o in objs:
            if o.name in untagged:
                o[CL.LAYER_PROP] = 'interior'
    ovs = CL.OVERLAYS
    # one frame for every state (all layers visible, every overlay frame)
    fit = [('all', None)]
    for name, ov in ovs.items():
        for i in range(ov['frames']):
            fit.append(('%s_%d' % (name, i), (lambda ov=ov, i=i: ov['set'](i))))
    W, H, anchor, tops = BR.fit_frames(fit, True)
    for ov in ovs.values():
        ov['set'](0)
    print('[office] frame %dx%d anchor %s top %s' % (W, H, anchor, tops['all']), flush=True)
    samples = opts.get('samples') or (16 if opts.get('look') else 48)
    sc = bc.setup_render(W, H, samples=samples)
    sc.cycles.max_bounces = 5
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    ring = catcher_ring('OffCatchRing', -OA.X0 + 0.06, -OA.Y0 + 0.06)
    snapshot()
    only = set(opts['passes'].split(',')) if opts.get('passes') else None
    done = []

    def want(name):
        if only is not None and not any(name == p or name.startswith(p) for p in only):
            return False
        return opts.get('force') or not os.path.exists(os.path.join(out, name + '.png'))

    def go(name, setup, border=None, catch=False, spp=None, denoise=True, override=None):
        done.append(name)
        if not want(name):
            return
        t1 = time.time()
        for ov in ovs.values():
            ov['set'](0)
        setup()
        ring.hide_render = not catch
        sc.cycles.samples = spp or samples
        sc.cycles.use_denoising = denoise
        sc.cycles.use_adaptive_sampling = denoise
        bpy.context.view_layer.material_override = override
        set_border(sc, W, H, border)
        bpy.context.view_layer.update()
        render_png(os.path.join(out, name + '.png'))
        bpy.context.view_layer.material_override = None
        print('[office] %-22s %5.0fs' % (name, time.time() - t1), flush=True)

    O = list(ovs)
    # ---------------------------------------------------------------- static layers
    go('%s_floor' % KEY, lambda: apply_pass(vis=['floor'], ghost=['interior', 'ifront'] + O, ghost_ns=['back']))
    go('%s_gshadow_open' % KEY, lambda: apply_pass(ghost=['floor', 'back', 'interior', 'ifront', 'props'] + O),
       catch=True)
    go('%s_back' % KEY, lambda: apply_pass(vis_ns=['back'], hold=['floor'], ghost=['interior', 'ifront'] + O))
    go('%s_interior' % KEY, lambda: apply_pass(vis=['interior'], hold=['floor'], hold_ns=['back'],
                                               ghost=['ifront']))
    go('%s_interior_front' % KEY, lambda: apply_pass(vis=['ifront'], hold=['floor', 'interior'] + DESK_OVL,
                                                     hold_ns=['back']))
    go('%s_shell_cut' % KEY, lambda: apply_pass(vis=['shell_cut'], hold=['floor', 'interior', 'ifront'] + O,
                                                hold_ns=['back'], ghost=['props']))
    go('%s_shell' % KEY, lambda: apply_pass(vis=['shell', 'props'], ghost=['back']), spp=max(samples, 64) if not opts.get('look')
       else samples)
    go('%s_gshadow_closed' % KEY, lambda: apply_pass(ghost=['shell', 'props', 'back']), catch=True)
    go('%s_props' % KEY, lambda: apply_pass(vis=['props'], ghost=['shell']))
    wm = white_emission()
    is_glow = (lambda o: bool(o.get('off_glow')))
    go('%s_glowmask' % KEY, lambda: apply_pass(hold=['shell', 'props'], extra_vis=is_glow), spp=16, denoise=False,
       override=wm)
    # ---------------------------------------------------------------- overlays
    ov_meta = {}
    for name in PLAIN_OVL + DESK_OVL:
        ov = ovs[name]
        mine = set(o.name for o in ov['objs'])
        boxes = []
        for i in range(ov['frames']):
            ov['set'](i)
            bpy.context.view_layer.update()
            boxes.append(objs_box([o for o in ov['objs']], anchor, pad=10))
        ov['set'](0)
        bx = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
        others = [n for n in O if n != name]
        frames, solos = [], []
        for i in range(ov['frames']):
            def set_i(i=i, ov=ov):
                ov['set'](i)
            if ov['extra'].get('mode') == 'patch':
                def solo(i=i, name=name, others=others):
                    apply_pass(vis=[name], hold=['floor', 'interior', 'ifront'] + others, hold_ns=['back'])
                    ov['set'](i)

                def patch(i=i, name=name, others=others):
                    apply_pass(vis=['floor', 'interior', 'ifront', name] + others, vis_ns=['back'])
                    ov['set'](i)
                go('%s_%s_solo_%d' % (KEY, name, i), solo, border=bx, spp=24, denoise=False)
                go('%s_%s_%d' % (KEY, name, i), patch, border=bx)
                solos.append('%s_%s_solo_%d' % (KEY, name, i))
            else:
                def plain(i=i, name=name):
                    apply_pass(vis=[name], hold=['floor', 'interior'], hold_ns=['back'], ghost=['ifront'])
                    ov['set'](i)
                go('%s_%s_%d' % (KEY, name, i), plain, border=bx, spp=max(samples, 48) if not opts.get('look')
                   else samples)
            frames.append('%s_%s_%d' % (KEY, name, i))
        ov['set'](0)
        ov_meta[name] = dict({'frames': frames, 'solo': solos, 'fps': ov['fps'], 'repeat': ov['repeat'],
                              'box': bx}, **ov['extra'])
    set_border(sc, W, H, None)
    # ---------------------------------------------------------------- meta
    bpy.context.view_layer.update()
    mk_pts, mk_dirs = BR.markers(0.0)
    P = res['pts']

    def p3(p):
        return px(Vector(p))
    fx = {}
    for k, v in res['fx'].items():
        if isinstance(v, list):
            fx[k] = [p3(q) for q in v]
        else:
            fx[k] = p3(v)
    meta = {
        'build': KEY, 'frameSize': [W, H], 'anchorPx': list(anchor),
        'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'topPx': tops['all'],
        'markers': mk_pts, 'markerDirs': mk_dirs, 'fxPoints': fx, 'overlays': ov_meta,
        'floorLiftPx': int(round(OA.PL * 55.4256)), 'footprintM': [OA.X1 - OA.X0, OA.Y1 - OA.Y0],
        'sign': {'centre': p3(P['sign_c']), 'w': P['sign_w'], 'h': P['sign_h']},
        'boardSlate': {'x0': -0.2 + 0.06, 'x1': 1.8 - 0.06, 'z0': OA.PL + 1.0 + 0.06, 'z1': OA.PL + 1.9 - 0.06,
                       'y': OA.YI1 - 0.085},
        'dims': {'X0': OA.X0, 'X1': OA.X1, 'Y0': OA.Y0, 'Y1': OA.Y1, 'WT': OA.WT, 'PL': OA.PL, 'H': OA.H,
                 'RIDGE': OA.RIDGE, 'STUB': OA.STUB, 'DOOR_X': OA.DOOR_X, 'DOOR_W': OA.DOOR_W},
        'passes': done, 'samples': samples, 'look': bool(opts.get('look')), 'notes': OA.NOTE,
    }
    with open(os.path.join(out, KEY + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[office] %dx%d anchor %s  %d passes  %.1fs' % (W, H, anchor, len(done), time.time() - t0), flush=True)
    del root
    return meta


# =================================================================================================== mailbox + items

def spec(key, kind, atlas, fn, fp=None, shadow=True, samples=64, notes='', item=None, catcher=8.0, extra=None):
    return dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=0.0, shadow=shadow, samples=samples, notes=notes,
                front='-Y', catcher=catcher, work=0, fps=8, item=item, sprites=None, extra=extra or {})


def render_mailbox(opts):
    s = spec('office_mailbox', 'prop', 'office_bld', OA.build_mailbox, fp=('r', 0.2), notes=OA.MAILBOX_NOTE,
             samples=64)
    side = os.path.join(opts['cache'], 'office_mailbox.json')
    if os.path.exists(side) and not opts['force']:
        print('[office_mailbox] cached')
        return
    BR.render_build(s, opts['cache'], opts.get('samples'))


def render_items(opts):
    BA.ITEM_ANCHOR = ITEM_ANCHOR            # run-time only (contract item anchor [0.5, 0.86])
    for key, it in OA.ITEMS.items():
        side = os.path.join(opts['cache'], key + '.json')
        if os.path.exists(side) and not opts['force']:
            print('[%s] cached' % key)
            continue
        s = spec(key, 'item', 'office_items', (lambda key=key: OA.build_item(key)), shadow=False, samples=64,
                 notes=it['notes'], item={'thickness': it['thickness']})
        BR.render_build(s, opts['cache'], opts.get('samples'))


# =================================================================================================== main

def main():
    opts = parse(bc.script_args())
    keys = opts['keys'] or ['all']
    if opts['look']:
        opts['cache'] = os.path.join(opts['cache'], 'look')
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    if 'office' in keys or 'all' in keys:
        render_office(opts)
    if not opts['look'] and ('mailbox' in keys or 'all' in keys):
        render_mailbox(opts)
    if not opts['look'] and ('items' in keys or 'all' in keys):
        render_items(opts)
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
