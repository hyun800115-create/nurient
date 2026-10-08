"""
lgx_render.py - render the v8 logistics set (docs/CONTRACT_V8.md section AA) into a raw frame cache; lgx_pack.py then
builds assets/logistics/ (atlases + manifest.json) and the docs/previews/lgx_* previews.

  * logistics_center (lgx_center.build): ONE scene, many passes that share the frame + anchor (camera never moves):
        back, floor, interior, fmask (front-furniture mask), stub, cut, shell, props   (full-frame layers)
        door1_<f>, door2_<f> (f 0..5), belt_<f> (f 0..7), lamp_<f> (f 0..3)              (border-rendered patches)
        depth_interior (16-bit view-depth of the interior, used by lgx_pack to validate the depth bands)
    Per pass every group is VISIBLE, GHOST (invisible to the camera, still casts shadows / bounces light),
    HOLDOUT (cuts alpha where it is in front) or HIDDEN - see PASSES.  So the layers composite back exactly.
  * items + producers (lgx_assets.LGX): bld_render.render_build() UNCHANGED (prop / item conventions).
  * vehicles (lgx_vehicles.VEH): injected into veh_models.VEH at run time and rendered by veh_render.render_vehicle()
    UNCHANGED (2 axis headings, seat proxies, occlusion masks).

Every Cycles render runs with 2 fixed threads (shared build machine).  Frames are written as .tmp.png + rename, so
an interrupted run resumes; existing frames are skipped unless --force.

    /tmp/bvenv/bin/python tools/blender/lgx_render.py -- [keys|center|items|producers|vehicles] [--force]
                                                          [--samples N] [--cache DIR] [--passes a,b] [--list]
    blender -b -P tools/blender/lgx_render.py -- [same args]
Default cache: <tmp>/fv_cache/logistics   (center/, builds in the root, veh/<key>/ for vehicles)
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
from mathutils import Vector, Euler  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402

THREADS = 2
_orig_setup_render = bc.setup_render


def _setup_render_fixed(width, height, samples=32, denoise=True):
    sc = _orig_setup_render(width, height, samples=samples, denoise=denoise)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS
    return sc


bc.setup_render = _setup_render_fixed          # run-time wrapper only (bl_common.py itself is untouched)

MARGIN = 10
DMIN, DMAX = 40.0, 80.0                         # view-depth range encoded in the 16-bit depth pass

ALL = ['back', 'floor', 'apron', 'interior', 'front_f', 'lamp', 'belt', 'stub', 'cut', 'shell', 'door1', 'door2',
       'props']
# pass -> (visible, ghost, holdout, ghost-without-shadow); everything else hidden
PASSES = {
    'back': (['back'], ['floor', 'apron', 'interior', 'front_f', 'stub', 'props'], [], []),
    'floor': (['floor', 'apron'], ['interior', 'front_f', 'stub', 'props', 'lamp'], [], ['back']),
    'interior': (['interior', 'front_f', 'lamp'], ['floor', 'apron', 'stub', 'props'], [], ['back']),
    'stub': (['stub'], ['interior', 'front_f', 'floor', 'apron', 'props'], [], ['back']),
    'cut': (['cut'], ['interior', 'front_f', 'floor', 'apron', 'props'], [], ['back']),
    'shell': (['shell', 'back', 'door1', 'door2'], [], [], []),
    'props': (['props'], ['shell', 'back', 'door1', 'door2', 'floor', 'apron'], [], []),
}
LAYER_PASSES = ['back', 'floor', 'interior', 'stub', 'cut', 'shell', 'props']
DESK_PREFIX = ('desk', 'papers', 'abacus', 'mug', 'lamp_base', 'lamp_stem')


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None, 'cache': os.path.join(tempfile.gettempdir(), 'fv_cache',
                                                                                'logistics'),
            'list': False, 'passes': None, 'look': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a == '--look':
            opts['look'] = True
        elif a in ('--samples', '--cache', '--passes'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
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
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE', 'LIGHT', 'EMPTY')]


SNAP = {}


def snapshot():
    """Remember each object's own shadow / hide flags (some builders turn shadows off on purpose)."""
    SNAP.clear()
    for o in scene_objs():
        SNAP[o.name] = (o.hide_render, o.visible_shadow)


def apply_pass(vis, ghost=(), hold=(), ghost_ns=(), extra_vis=None, extra_hold=None):
    """vis / ghost / hold / ghost_ns are group names; extra_* are predicates on objects (sub-group selections)."""
    for o in scene_objs():
        if o.name not in SNAP or o.name.startswith('ShadowCatcher') or o.name.startswith('LgxCatch'):
            continue
        g = o.get('lgx')
        hr0, vs0 = SNAP[o.name]
        o.is_holdout = False
        o.visible_camera = True
        o.visible_shadow = vs0
        if g is None:
            # cameras, suns, untagged helpers stay as they are
            o.hide_render = hr0
            continue
        mode = 'hide'
        if extra_vis and extra_vis(o):
            mode = 'vis'
        elif extra_hold and extra_hold(o):
            mode = 'hold'
        elif g in vis:
            mode = 'vis'
        elif g in hold:
            mode = 'hold'
        elif g in ghost:
            mode = 'ghost'
        elif g in ghost_ns:
            mode = 'ghost_ns'
        if mode == 'hide':
            o.hide_render = True
            continue
        o.hide_render = hr0
        if mode == 'hold':
            o.is_holdout = True
        elif mode in ('ghost', 'ghost_ns'):
            o.visible_camera = False
            for attr in ('visible_glossy', 'visible_transmission'):
                pass
            if mode == 'ghost_ns':
                o.visible_shadow = False


def catcher(name, x0, x1, y0, y1, z=0.0):
    import bmesh
    bm = bmesh.new()
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
    x, y = bc.world_to_pixel(tuple(p), 0, 0, anchor)
    return x, y


def bbox_px(pts, anchor, pad=6):
    xs, ys = zip(*[px_of(p, anchor) for p in pts])
    return (min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad)


def objs_bbox_px(objs, anchor, pad=6):
    pts = L.world_points([o for o in objs if o.type in ('MESH', 'CURVE')])
    return bbox_px(pts, anchor, pad)


def override_material(mat):
    bpy.context.view_layer.material_override = mat


def mask_white():
    m = bpy.data.materials.new('LgxMaskWhite')
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


def depth_material():
    m = bpy.data.materials.new('LgxDepth')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    cam = nt.nodes.new('ShaderNodeCameraData')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs[1].default_value = DMIN
    mr.inputs[2].default_value = DMAX
    nt.links.new(cam.outputs['View Z Depth'], mr.inputs[0])
    nt.links.new(mr.outputs[0], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


# =================================================================================================== centre

def frame_for_center():
    """Frame + anchor that fit every group (incl. the building shadow) - computed with the full scene visible."""
    objs = [o for o in L.scene_meshes()]
    w, h, (ax, ay), top = L.frame_fit(margin=MARGIN, shadow=True, objs=objs, max_size=(2048, 2048))
    return w, h, (ax, ay), top


def render_center(opts):
    import lgx_center as LC
    out = os.path.join(opts['cache'], 'center')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    ctl, P = LC.build()
    bpy.context.view_layer.update()
    W, H, anchor, top = frame_for_center()
    print('[center] frame %dx%d anchor %s top %d' % (W, H, anchor, top), flush=True)
    samples = opts.get('samples') or 40
    sc = bc.setup_render(W, H, samples=samples)
    sc.cycles.max_bounces = 5
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    ground = catcher('LgxCatchGround', -30, 30, -30, 30, 0.0)
    snapshot()
    only = set(opts['passes'].split(',')) if opts.get('passes') else None

    def want(name):
        if only is not None and not any(name == p or name.startswith(p) for p in only):
            return False
        return opts.get('force') or not os.path.exists(os.path.join(out, name + '.png'))

    def go(name, setup, border=None, catch=False, spp=None, denoise=True, raw=False, depth16=False):
        if not want(name):
            return
        t1 = time.time()
        setup()
        ground.hide_render = not catch
        sc.cycles.samples = spp or samples
        sc.cycles.use_denoising = denoise
        sc.cycles.use_adaptive_sampling = denoise
        sc.view_settings.view_transform = 'Raw' if raw else 'Standard'
        sc.render.image_settings.color_mode = 'BW' if depth16 else 'RGBA'
        sc.render.image_settings.color_depth = '16' if depth16 else '8'
        sc.render.filter_size = 0.01 if depth16 else 1.2
        set_border(sc, W, H, border)
        render_png(os.path.join(out, name + '.png'))
        print('[center] %-14s %.0fs' % (name, time.time() - t1), flush=True)

    # ---------------------------------------------------------------- full-frame layers
    for name in LAYER_PASSES:
        v, g, ho, gns = PASSES[name]
        go(name, lambda v=v, g=g, ho=ho, gns=gns: apply_pass(v, g, ho, gns), catch=(name == 'shell'))
    # front-furniture mask: F white emission, the rest of the interior as holdout
    mw = mask_white()

    def setup_fmask():
        apply_pass(['front_f'], [], ['interior', 'lamp'], [])
        override_material(mw)
    go('fmask', setup_fmask, spp=16, denoise=False)
    override_material(None)
    # interior depth (validation of the depth bands in lgx_pack)
    dm = depth_material()

    def setup_depth():
        apply_pass(['interior', 'front_f', 'lamp'], [], [], [])
        override_material(dm)
    go('depth_interior', setup_depth, spp=1, denoise=False, raw=True, depth16=True)
    override_material(None)
    # ---------------------------------------------------------------- patches
    # conveyor belt (8): belt + boxes, everything else of the interior as holdout
    belt_objs = [o for o in bpy.context.scene.objects if o.get('lgx') == 'belt']
    x0, x1, y0, y1, zb = LC.CONV
    bb = bbox_px([(x0, y0, zb - 0.1), (x1, y0, zb - 0.1), (x1, y1, zb + 0.4), (x0, y1, zb + 0.4)], anchor, pad=10)
    for f in range(LC.BELT_FRAMES):
        def setup_belt(f=f):
            ctl['belt'](f)
            apply_pass(['belt'], ['floor', 'apron', 'stub', 'props'], ['interior', 'front_f', 'lamp'], ['back'])
        go('belt_%d' % f, setup_belt, border=bb)
    ctl['belt'](0)
    del belt_objs
    # dock doors (6 each): leaf + what is seen through the opening (interior lit under the roof), shell = holdout
    for k, (dy0, dy1, dh) in enumerate((LC.DOCK1, LC.DOCK2)):
        db = bbox_px([(LC.X0, dy0 - 0.1, 0.0), (LC.X0, dy1 + 0.1, 0.0), (LC.X0, dy1 + 0.1, dh + 0.1),
                      (LC.X0, dy0 - 0.1, dh + 0.1)], anchor, pad=8)
        me = 'door%d' % (k + 1)
        other = 'door%d' % (2 - k)
        for f in range(6):
            def setup_door(k=k, f=f, me=me, other=other):
                ctl['door'](k, f)
                apply_pass([me, 'interior', 'front_f', 'floor', 'back', 'lamp'], [other],
                           ['shell', 'props', 'apron'], [])
            go('%s_%d' % (me, f), setup_door, border=db)
        ctl['door'](k, 0)
    # office desk lamp (4): lamp head + the desk top, the rest of the interior as holdout
    lb = bbox_px([P['lampPoint'], (-5.25, -1.8, 0.75), (-4.55, -0.7, 0.75), (-4.6, -1.25, 1.25)], anchor, pad=12)

    def is_desk(o):
        return o.get('lgx') == 'interior' and o.name.startswith(DESK_PREFIX)

    def is_lamp(o):
        return o.get('lgx') == 'lamp' or is_desk(o)
    for f in range(4):
        def setup_lamp(f=f):
            ctl['lamp'](f)
            apply_pass(['lamp'], ['floor', 'apron', 'stub', 'props'], ['interior', 'front_f'], ['back'],
                       extra_vis=is_lamp)
        go('lamp_%d' % f, setup_lamp, border=lb)
    ctl['lamp'](0)
    set_border(sc, W, H, None)
    # ---------------------------------------------------------------- meta
    meta = {'build': 'logistics_center', 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'topPx': int(round(top)),
            'samples': samples, 'depth': {'min': DMIN, 'max': DMAX,
                                          'note': 'depth_interior.png: 16-bit grey = (viewZ - min) / (max - min)'},
            'camBack': list(cam_back()), 'points': jsonable(P),
            'patches': {'belt': {'frames': LC.BELT_FRAMES, 'box': list(bb)},
                        'lamp': {'frames': 4, 'box': list(lb)}},
            'dims': {'W': LC.W, 'D': LC.D, 'eave': LC.EAVE, 'rise': LC.RISE, 'stubZ': LC.STUB_Z, 'cutZ': LC.CUT_Z,
                     'rackLevels': LC.RACK_LEVELS, 'frackLevels': LC.FRACK_LEVELS, 'rackYF': LC.RACK_YF,
                     'rackD': LC.RACK_D, 'frackXF': LC.FRACK_XF, 'frackD': LC.FRACK_D,
                     'conv': LC.CONV, 'pack': LC.PACK, 'counter': LC.COUNTER, 'docks': [LC.DOCK1, LC.DOCK2],
                     'entr': LC.ENTR, 'beltSpacing': LC.BELT_SPACING},
            'shellHull': hull_px(anchor), 'footprintPoly': [list(map(round_px, px_of(p, anchor)))
                                                           for p in ((-LC.X0, -LC.Y0, 0), (LC.X0, -LC.Y0, 0),
                                                                     (LC.X0, LC.Y0, 0), (-LC.X0, LC.Y0, 0))]}
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[center] done in %.0fs' % (time.time() - t0), flush=True)


def round_px(v):
    return int(round(v))


def cam_back():
    R = Euler((math.radians(90.0 - bc.CAM_ELEV_DEG), 0.0, math.radians(bc.CAM_YAW_DEG)), 'XYZ').to_matrix()
    v = R @ Vector((0.0, 0.0, 1.0))
    return (round(v.x, 6), round(v.y, 6), round(v.z, 6))


def hull_px(anchor):
    """Screen convex hull of the shell geometry (roof + walls) -> revealPoly source (px relative to the anchor)."""
    objs = [o for o in bpy.context.scene.objects if o.get('lgx') in ('shell', 'back') and o.type in ('MESH', 'CURVE')]
    pts = []
    for p in L.world_points(objs):
        x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
        pts.append((x, y))
    pts = sorted(set((round(x, 1), round(y, 1)) for x, y in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    hull = lower[:-1] + upper[:-1]
    return [[round(x), round(y)] for x, y in hull]


def jsonable(o):
    if isinstance(o, dict):
        return {k: jsonable(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [jsonable(v) for v in o]
    return o


# =================================================================================================== builds + vehicles

def render_builds(keys, opts):
    import bld_render as BR
    import lgx_assets as LA
    for k in keys:
        spec = LA.LGX[k]
        if not opts['force'] and BR.cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        BR.render_build(spec, opts['cache'], opts.get('samples'))


def render_vehicles(keys, opts):
    import veh_models as VM
    import veh_render as VR
    import lgx_vehicles as LV
    for k, spec in LV.VEH.items():
        VM.VEH[k] = spec                      # run-time registration only (veh_models.py is untouched)
    vopts = dict(opts)
    vopts['cache'] = os.path.join(opts['cache'], 'veh')
    for k in keys:
        VR.render_vehicle(k, vopts)


def groups():
    try:
        import lgx_assets as LA
        reg = LA.LGX
    except ImportError:
        reg = {}
    try:
        import lgx_vehicles as LV
        veh = list(LV.VEH)
    except ImportError:
        veh = []
    items = [k for k, s in reg.items() if s['kind'] == 'item']
    prod = [k for k, s in reg.items() if s['kind'] != 'item']
    return {'center': ['logistics_center'], 'items': items, 'producers': prod, 'vehicles': veh}


def main():
    opts = parse(bc.script_args())
    gr = groups()
    allk = gr['center'] + gr['items'] + gr['producers'] + gr['vehicles']
    keys = []
    for k in opts['keys'] or allk:
        if k in gr:
            keys += gr[k]
        elif k.endswith('*'):
            keys += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            keys.append(k)
        else:
            raise SystemExit('unknown key: ' + k)
    if opts['list']:
        for k in keys:
            print(k)
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    if 'logistics_center' in keys:
        render_center(opts)
    b = [k for k in keys if k in gr['items'] + gr['producers']]
    if b:
        render_builds(b, opts)
    v = [k for k in keys if k in gr['vehicles']]
    if v:
        render_vehicles(v, opts)
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
