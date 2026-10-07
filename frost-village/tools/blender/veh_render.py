"""
veh_render.py - render the v5 vehicles + vehicle buildings (docs/CONTRACT_V5.md sections L + M) into a raw frame
cache.  veh_pack.py then makes assets/vehicles/ (atlases + manifest.json) and the previews.

Vehicles (veh_models.VEH) are rendered like the characters / boats / train: NO baked shadow (the game draws a soft
ellipse), ink outline added at pack time, two rendered headings along the iso ground axes:
    SE = world +X (front + right side visible)      NE = world +Y (rear + right side visible)
    game mirrors (flipX): SW <- SE (world -Y), NW <- NE (world -X)
For vehicles with seats, two cheap occlusion masks per frame are rendered as well:
    pall_<anim>_<dir>_<i>.png   seated-person proxies alone
    pvis_<anim>_<dir>_<i>.png   proxies with the vehicle body as a holdout (= proxy parts NOT hidden by the body)
pall - pvis = where the vehicle body is IN FRONT of a passenger; veh_pack cuts that out of the colour frame as the
over_<anim>_<dir>_<i> overlay (draw: vehicle -> passengers -> overlay).  Interior parts (seats, steering wheel) and
smoke are left out of the overlay; clear panes let passengers show, the frosted back of a far pane does not.

Vehicle buildings (veh_bld.VBLD) go through bld_render.render_build() UNCHANGED (prop conventions, baked shadow).

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/veh_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
                                                        [--dirs SE,NE] [--anims idle,move] [--frames 0,1] [--nomask]
Re-run (your PC, Blender 4.2+):  blender -b -P tools/blender/veh_render.py -- [same args]
  * no keys -> everything not cached yet (resumable; frames are written as .tmp.png and renamed)
  * keys    -> vehicle / building keys, prefixes with a trailing * (car_*), or groups: era2, era3, cars, buildings
Default cache: <tmp>/fv_cache/vehicles.  Deterministic: fixed seeds + sample counts.
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
from mathutils import Vector, Matrix  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import veh_lib as VL  # noqa: E402
import veh_models as VM  # noqa: E402

DIRS = ['SE', 'NE']
MIRROR = {'SW': 'SE', 'NW': 'NE'}
AXIS_DIRS = {'X+': 'SE', 'Y+': 'NE', 'Y-': 'SW', 'X-': 'NW'}
MARGIN = 4
SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
CAM_TOWARD = Vector((0.612372, -0.612372, 0.5)).normalized()
STAND_DROP = 0.065 - 0.338            # standing anchor below the seat surface for a "seated" idle frame (m)


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'vehicles'), 'list': False,
            'dirs': None, 'anims': None, 'frames': None, 'nomask': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a == '--nomask':
            opts['nomask'] = True
        elif a in ('--samples', '--cache', '--dirs', '--anims', '--frames'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def registries():
    try:
        import veh_bld as VBD
        bld = VBD.VBLD
    except ImportError:
        bld = {}
    return VM.VEH, bld


def groups():
    veh, bld = registries()
    g = {'era2': [k for k, s in veh.items() if s['era'] == 2], 'era3': [k for k, s in veh.items() if s['era'] == 3],
         'cars': [k for k in veh if k.startswith('car_')], 'vehicles': list(veh), 'buildings': list(bld)}
    return g


def select(keys):
    veh, bld = registries()
    allk = list(veh) + list(bld)
    if not keys:
        return allk
    gr = groups()
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        elif k in gr:
            out += gr[k]
        else:
            raise SystemExit('unknown key: ' + k)
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


# --------------------------------------------------------------------------- helpers

def screen_dir(v):
    sx = (v.x + v.y) * math.sqrt(0.5)
    sy = (v.x - v.y) * math.sqrt(0.5) * 0.5
    a = math.atan2(sy * 2.0, sx)
    return SECTORS[int(round(a / (math.pi / 4))) % 8]


def to_px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def descendants(o):
    out = []
    for ch in o.children:
        out.append(ch)
        out.extend(descendants(ch))
    return out


def veh_objects(B):
    """Every mesh / curve of the vehicle (incl. animals, crew), excluding proxies and boolean cutters."""
    px = set(B.proxies)
    out = []
    for o in descendants(B.root):
        if o.type in ('MESH', 'CURVE') and o not in px and not o.get('veh_cutter'):
            out.append(o)
    return out


def visible_meshes(B):
    return [o for o in veh_objects(B) if not o.hide_render and o.visible_camera]


def bake_booleans(B):
    """Apply every modifier stack that contains a BOOLEAN (shells with window cuts / arches) into a static mesh and
    delete the cutters, so posing a frame never re-evaluates the (slow, exact) booleans."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    cutters = set()
    for o in list(descendants(B.root)):
        if o.type != 'MESH' or not any(m.type == 'BOOLEAN' for m in o.modifiers):
            continue
        for m in o.modifiers:
            if m.type == 'BOOLEAN' and m.object is not None:
                cutters.add(m.object)
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=False, depsgraph=dg)
        o.modifiers.clear()
        o.data = me
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    bpy.context.view_layer.update()


def pose(B, spec, anim, i):
    a = spec['anims'][anim]
    n = a['frames']
    B.body.location.z = a['bob'][i % len(a['bob'])] * VL.PX_Z
    base = getattr(B, 'spin0', 0.35)
    if a.get('spin'):
        B.spin(base + (math.tau / B.wheel_sym) * getattr(B, 'wheel_turns', 1) * i / n)
    else:
        B.spin(base)
    B.set_blink(a.get('blink', False), i)
    for s in B.smokes:
        if a.get('smoke'):
            s.set(i, frames=n)
        else:
            s.show(False)
    for h in B.hooks:
        h(anim, i, n)
    for rig in B.rigs:
        try:
            rig.update_strings()
        except Exception:
            pass
    bpy.context.view_layer.update()


def measure(B, spec, dirs):
    xs, ys = [], []
    for d in dirs:
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        for anim, a in spec['anims'].items():
            for i in range(a['frames']):
                pose(B, spec, anim, i)
                for p in L.world_points(visible_meshes(B)):
                    x, y = L.screen_xy(p)
                    xs.append(x)
                    ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def setup_scene(W, H, anchor, samples):
    sc = bc.setup_render(W, H, samples=samples, denoise=True)
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 8
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    return sc


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


def render_masks(B, spec, out, mtodo):
    """Occlusion passes.  'vis': vehicle body = holdout, interior / smoke hidden, panes clear-front / holdout-back,
    proxies emissive; 'all': only the proxies.  Mode flags are re-applied after every pose (posing toggles face /
    smoke visibility) and everything is restored at the end."""
    objs = veh_objects(B)
    panes = set(B.panes)
    hidden = set(B.mask_hidden)
    snap = [(o, o.hide_render, o.is_holdout) for o in objs]
    pane_mats = [(o, o.data.materials[0]) for o in B.panes]
    lights = [(o, o.hide_render) for o in bpy.context.scene.objects if o.type == 'LIGHT']
    for o, _ in lights:
        o.hide_render = True
    for o in B.panes:
        o.data.materials[0] = B.pane_mask
    for o in B.proxies:
        o.hide_render = False
    try:
        for phase in ('vis', 'all'):
            for anim, d, i, name in mtodo:
                B.root.rotation_euler.z = bc.yaw_for_dir(d)
                pose(B, spec, anim, i)
                for o in objs:
                    if phase == 'all':
                        o.hide_render = True
                    elif o in panes:
                        o.hide_render = False
                    elif o.get('veh_interior') or o in hidden:
                        o.hide_render = True
                    else:
                        o.is_holdout = True
                for o in B.proxies:
                    o.hide_render = False
                render_png(os.path.join(out, '%s_%s.png' % ('pvis' if phase == 'vis' else 'pall', name)))
    finally:
        for o, hr, ho in snap:
            o.hide_render = hr
            o.is_holdout = ho
        for o, m in pane_mats:
            o.data.materials[0] = m
        for o in B.proxies:
            o.hide_render = True
        for o, hr in lights:
            o.hide_render = hr


# --------------------------------------------------------------------------- vehicle render

def render_vehicle(key, opts):
    spec = VM.VEH[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    dirs = DIRS if not opts.get('dirs') else [d for d in opts['dirs'].split(',') if d in DIRS]
    anims = list(spec['anims']) if not opts.get('anims') else [a for a in opts['anims'].split(',')
                                                               if a in spec['anims']]
    only = None if not opts.get('frames') else {int(v) for v in opts['frames'].split(',')}
    todo, mtodo = [], []
    meta_path = os.path.join(out, 'meta.json')
    for anim in anims:
        for d in dirs:
            for i in range(spec['anims'][anim]['frames']):
                if only is not None and i not in only:
                    continue
                name = '%s_%s_%d' % (anim, d, i)
                if opts.get('force') or not os.path.exists(os.path.join(out, name + '.png')):
                    todo.append((anim, d, i, name))
                if not opts.get('nomask') and (opts.get('force') or not all(
                        os.path.exists(os.path.join(out, '%s_%s.png' % (p, name))) for p in ('pall', 'pvis'))):
                    mtodo.append((anim, d, i, name))
    if not todo and not mtodo and os.path.exists(meta_path) and not opts.get('force'):
        print('[%s] cached' % key)
        return
    bc.reset_scene()
    L._CUSTOM.clear()
    VL._PAINT.clear()
    bc.setup_lighting()
    B = spec['fn']()
    bpy.context.view_layer.update()
    bake_booleans(B)
    if not B.proxies:
        mtodo = []
    x0, x1, y0, y1 = measure(B, spec, DIRS)
    ax = int(math.ceil(-x0)) + MARGIN
    ay = int(math.ceil(-y0)) + MARGIN
    W = (ax + int(math.ceil(x1)) + MARGIN + 3) // 4 * 4
    H = (ay + int(math.ceil(y1)) + MARGIN + 3) // 4 * 4
    anchor = (ax, ay)
    print('[%s] frame %dx%d anchor %s, %d frames + %d mask pairs to render' % (key, W, H, anchor, len(todo),
                                                                                len(mtodo)), flush=True)
    sc = setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
    for k, (anim, d, i, name) in enumerate(todo):
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        pose(B, spec, anim, i)
        render_png(os.path.join(out, name + '.png'))
        if k % 6 == 0:
            print('[%s] %d/%d %s  %.0fs' % (key, k + 1, len(todo), name, time.time() - t0), flush=True)
    if mtodo:
        sc.cycles.samples = 8
        sc.cycles.use_denoising = False
        sc.cycles.use_adaptive_sampling = False
        render_masks(B, spec, out, mtodo)
        print('[%s] masks done  %.0fs' % (key, time.time() - t0), flush=True)
    write_meta(B, spec, key, out, W, H, anchor, y0)
    print('[%s] done in %.0fs' % (key, time.time() - t0), flush=True)


def write_meta(B, spec, key, out, W, H, anchor, y_top):
    first = list(spec['anims'])[0]
    pts = {}
    seats, seat_dirs, seat_stand, seat_order = {}, {}, {}, {}
    foot = {}
    for d in DIRS:
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        pose(B, spec, first, 0)
        mw = B.body.matrix_world
        R = B.root.matrix_world.to_3x3()
        for field, p in B.points.items():
            if isinstance(p, list):
                pts.setdefault(field, {})[d] = [to_px(mw @ q) for q in p]
            else:
                v = to_px(mw @ p)
                if field == 'cargoPoint':
                    v = v + [False]
                pts.setdefault(field, {})[d] = v
        sl, sd, ss, depth = [], [], [], []
        for s in B.seats:
            P = mw @ s['loc']
            f = (R @ s['facing']).normalized()
            sl.append(to_px(P))
            sd.append(screen_dir(f))
            ss.append(to_px(P - f * 0.12 + Vector((0, 0, STAND_DROP))))
            depth.append(P.dot(CAM_TOWARD))
        if B.seats:
            seats[d], seat_dirs[d], seat_stand[d] = sl, sd, ss
            seat_order[d] = sorted(range(len(sl)), key=lambda k: depth[k])
        hl, hw = B.length / 2, B.width / 2
        corners = []
        for lx, ly in ((-hw, -hl), (hw, -hl), (hw, hl), (-hw, hl)):
            corners.append(to_px(R @ Vector((lx, ly, 0.0))))
        foot[d] = corners
    meta = {'key': key, 'kind': spec.get('kind', 'vehicle'), 'era': spec['era'], 'family': spec['family'],
            'variant': spec['variant'], 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'dirs': DIRS, 'mirror': MIRROR,
            'axisDirs': AXIS_DIRS,
            'anims': {a: {k: v for k, v in info.items()} for a, info in spec['anims'].items()},
            'notes': spec['notes'], 'lengthM': B.length, 'widthM': B.width, 'heightM': B.height,
            'topPx': int(math.ceil(-y_top)), 'footprintPoly': foot, 'wheelSym': B.wheel_sym,
            'wheelTurnsPerLoop': getattr(B, 'wheel_turns', 1),
            'wheelR': round(B.wheels[0][1], 3) if B.wheels else None, 'masks': bool(B.proxies)}
    meta.update(pts)
    if B.seats:
        meta['seats'] = seats
        meta['seatDirs'] = seat_dirs
        meta['seatsStand'] = seat_stand
        meta['seatDrawOrder'] = seat_order
        meta['seatNames'] = [s['name'] for s in B.seats]
        meta['driverSeat'] = getattr(B, 'driver_seat', 0)
    if getattr(B, 'crew_note', None):
        meta['crew'] = B.crew_note
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


# --------------------------------------------------------------------------- main

def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    veh, bld = registries()
    if opts['list']:
        for k in keys:
            if k in veh:
                s = veh[k]
                print(k, 'vehicle era %d' % s['era'], ', '.join('%s(%d)' % (a, n['frames'])
                                                               for a, n in s['anims'].items()))
            else:
                s = bld[k]
                print(k, s['kind'], s['atlas'], 'work=%d' % s['work'], ', '.join(s['sprites'] or [k]))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    import bld_render as BR
    for k in keys:
        if k in veh:
            render_vehicle(k, opts)
            continue
        if not opts['force'] and BR.cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        BR.render_build(bld[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
