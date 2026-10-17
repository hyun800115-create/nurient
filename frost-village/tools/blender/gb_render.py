"""
gb_render.py - render the 금방 set (docs/CONTRACT_GEUMBANG.md section AO) into a raw frame cache; gb_pack.py then
builds assets/geumbang/ (gb_van_0 + gb_bld_0 + manifest.json) and the docs/previews/gb_* previews.

    /tmp/bvenv/bin/python tools/blender/gb_render.py -- [van|turn|roofsign|hub|builds|pennant|all ...]
                          [--look] [--force] [--samples N] [--cache DIR] [--only key,key]
Run it under `nice -n 10`, one Blender at a time (shared build machine).  Cycles uses 2 fixed threads; every frame is
written as .tmp.png and renamed (resumable; existing frames are skipped unless --force).
Default cache: $GB_CACHE or <tmp>/fv_cache/geumbang.

  van       gb_van (gb_van.b_gb_van = the delivery-van rig + the 금방 livery): SE / NE x idle 2, move 4, door 3,
            unload 4 rendered on the red van's frame grown by EXPAND px on every side (one canvas, so the patches and
            idle_0 share the exact sampling; gb_pack crops idle / move back to the red van's 284 x 252 frame and cuts
            door / unload into patches over idle_<dir>_0), + the seat occlusion masks of idle / move (over_* frames);
            turn S / E / N (the corner frames) on their own frame + masks.  meta.json carries every point per dir.
  roofsign  gb_roofsign_{ko|en}_{0|1} (camera-facing A-board, 96 x 56, anchor bottom centre)
  hub       nameplate + banner layers of the logistics centre (lgx_center.build() imported unchanged, rendered on the
            centre's own frame 1152 x 864 / anchor (478, 509) with the shell as holdout, border-rendered)
  builds    props + items through bld_render.render_build() unchanged (gb_assets.GBA registry)
  pennant   gb_pennant SE / NE x flutter 4 (48 x 56, anchor = the stick foot) + sledPennant offsets
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

THREADS = 2
_orig_setup_render = bc.setup_render


def _setup_render_fixed(width, height, samples=32, denoise=True):
    sc = _orig_setup_render(width, height, samples=samples, denoise=denoise)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS
    return sc


bc.setup_render = _setup_render_fixed          # run-time wrapper only (bl_common.py itself is untouched)

RED_FRAME = (284, 252)                          # delivery_van_red frameSize
RED_ANCHOR = (143, 189)                         # delivery_van_red anchor (0.50352, 0.75) in px
EXPAND = 56                                     # px added on every side for the door / unload frames
VAN_DIRS = ['SE', 'NE']
TURN_DIRS = ['S', 'E', 'N']
TURN_MAX = (368, 352)


def parse(argv):
    opts = {'what': [], 'force': False, 'samples': None, 'look': False, 'only': None,
            'cache': os.environ.get('GB_CACHE') or os.path.join(tempfile.gettempdir(), 'fv_cache', 'geumbang')}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a == '--look':
            opts['look'] = True
        elif a in ('--samples', '--cache', '--only'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        else:
            opts['what'].append(a)
        i += 1
    if opts['only']:
        opts['only'] = set(opts['only'].split(','))
    return opts


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


def to_px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def to_pxf(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [round(x, 2), round(y, 2)]


# =================================================================================================== van

def build_van():
    import veh_lib as VL
    import gb_van as GV
    bc.reset_scene()
    L._CUSTOM.clear()
    VL._PAINT.clear()
    bc.setup_lighting()
    B = GV.b_gb_van()
    bpy.context.view_layer.update()
    return B, {'anims': GV.ANIMS}


def van_points(B, spec, d, anim, i):
    """Every point of the van for heading d in pose (anim, i): px offsets from the anchor."""
    import veh_render as VR
    B.root.rotation_euler.z = bc.yaw_for_dir(d)
    VR.pose(B, spec, anim, i)
    mw = B.body.matrix_world
    R = B.root.matrix_world.to_3x3()
    out = {}
    for field, p in B.points.items():
        if isinstance(p, list):
            out[field] = [to_px(mw @ q) for q in p]
        else:
            v = to_px(mw @ p)
            if field == 'cargoPoint':
                v = v + [False]
            out[field] = v
    for field, ps in getattr(B, 'extra_points', {}).items():
        out[field] = [to_px(mw @ Vector(q)) for q in ps]
    sl, sd, ss, depth = [], [], [], []
    for s in B.seats:
        P = mw @ s['loc']
        f = (R @ s['facing']).normalized()
        sl.append(to_px(P))
        sd.append(VR.screen_dir(f))
        ss.append(to_px(P - f * 0.12 + Vector((0, 0, VR.STAND_DROP))))
        depth.append(P.dot(VR.CAM_TOWARD))
    out['seats'] = sl
    out['seatDirs'] = sd
    out['seatsStand'] = ss
    out['seatDrawOrder'] = sorted(range(len(sl)), key=lambda k: depth[k])
    hl, hw = B.length / 2, B.width / 2
    out['footprintPoly'] = [to_px(R @ Vector((lx, ly, 0.0))) for lx, ly in ((-hw, -hl), (hw, -hl), (hw, hl),
                                                                            (-hw, hl))]
    return out


def GV_GOLD():
    import gb_van as GV
    return GV.VAN_GOLD


def _seen(p, toward, skip=(), eps=0.03):
    """True when the world point p is not hidden from the (orthographic) camera by any rendered mesh: a ray from p
    toward the camera (skip = objects the point sits on, e.g. the lamp itself)."""
    dg = bpy.context.evaluated_depsgraph_get()
    o = p + toward * eps
    for _ in range(8):
        hit, loc, _n, _i, ob, _m = bpy.context.scene.ray_cast(dg, o, toward)
        if not hit:
            return True
        if ob is not None and (ob.name in skip or ob.hide_render or not ob.visible_camera):
            o = loc + toward * 0.002
            continue
        return False
    return True


def visibility(B, spec):
    """(polish M5 / L4) per-dir visibility of lightPoints / tailPoints (lamp faces turned to the camera and not
    hidden) and of the unload-f3 parcelPoints (the parcels on the cargo floor seen through the open rear)."""
    import veh_render as VR
    cam = bpy.context.scene.camera
    toward = (cam.matrix_world.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
    out = {}
    for d in VAN_DIRS + TURN_DIRS:
        anim = 'turn' if d in TURN_DIRS else 'idle'
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        VR.pose(B, spec, anim, 0)
        bpy.context.view_layer.update()
        mw = B.body.matrix_world
        lamps = [o.name for o in bpy.data.objects if o.name.startswith(('dv_head', 'dv_tail'))]
        rec = {}
        for field in ('lightPoints', 'tailPoints'):
            rec[field] = [bool(_seen(mw @ q, toward, lamps)) for q in B.points[field]]
        if d in VAN_DIRS:
            # (polish L3) the flank mark's measured screen box (projected mesh of the mark the camera sees)
            for gname in ('dv_em', 'gb_emL'):
                g = bpy.data.objects.get(gname)
                if g is None:
                    continue
                objs = [o for o in [g] + list(g.children_recursive) if o.type == 'MESH']
                if not objs or not _seen(g.matrix_world.translation, toward, [o.name for o in objs], eps=0.08):
                    continue
                xy = [to_pxf(p) for p in L.world_points(objs)]
                rec['markBoxPx'] = [round(min(q[0] for q in xy), 1), round(min(q[1] for q in xy), 1),
                                    round(max(q[0] for q in xy), 1), round(max(q[1] for q in xy), 1)]
                rec['markObject'] = gname
            VR.pose(B, spec, 'unload', 3)
            bpy.context.view_layer.update()
            cargo = [o.name for o in B.gb['cargo']] + [c.name for o in B.gb['cargo'] for c in o.children_recursive]
            rec['parcelPoints'] = [bool(_seen(mw @ Vector(q), toward, cargo, eps=0.02))
                                   for q in B.extra_points['parcelPoints']]
        out[d] = rec
    return out


def rear_parts_check(B, spec):
    """(polish H1) every rear-door window / handle must stay on its own leaf in every unload pose: the part's
    centre in the leaf's local frame, measured against the leaf's local bounding box (m outside it)."""
    import veh_render as VR
    worst = 0.0
    rec = []
    for d in VAN_DIRS:
        for i in range(spec['anims']['unload']['frames']):
            B.root.rotation_euler.z = bc.yaw_for_dir(d)
            VR.pose(B, spec, 'unload', i)
            bpy.context.view_layer.update()
            for side, parts in B.gb['rearParts'].items():
                leaf = bpy.data.objects['gb_rear' + side]
                inv = leaf.matrix_world.inverted()
                bb = [Vector(c) for c in leaf.bound_box]
                lo = Vector((min(c.x for c in bb), min(c.y for c in bb), min(c.z for c in bb)))
                hi = Vector((max(c.x for c in bb), max(c.y for c in bb), max(c.z for c in bb)))
                for o in parts:
                    q = inv @ o.matrix_world.translation
                    dist = max(0.0, lo.x - q.x, q.x - hi.x, lo.y - q.y, q.y - hi.y, lo.z - q.z, q.z - hi.z)
                    worst = max(worst, dist)
                    if dist > 0.06:
                        rec.append('%s %s_%d %s %.3f m off its leaf' % (o.name, d, i, side, dist))
    VR.pose(B, spec, 'idle', 0)
    return {'maxOffLeafM': round(worst, 4), 'parts': {k: [o.name for o in v] for k, v in B.gb['rearParts'].items()},
            'problems': rec}


def render_van(opts):
    import veh_render as VR
    out = os.path.join(opts['cache'], 'gb_van')
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    B, spec = build_van()
    look = opts['look']
    # measure the idle / move extents (must fit the red van's frame: same rig)
    mspec = {'anims': {k: spec['anims'][k] for k in ('idle', 'move')}}
    x0, x1, y0, y1 = VR.measure(B, mspec, VAN_DIRS)
    W, H = RED_FRAME
    ax, ay = RED_ANCHOR
    fit = {'xMin': round(x0, 1), 'xMax': round(x1, 1), 'yMin': round(y0, 1), 'yMax': round(y1, 1),
           'inside': x0 >= -ax and x1 <= W - ax and y0 >= -ay and y1 <= H - ay}
    print('[gb_van] idle/move extents x %.1f..%.1f y %.1f..%.1f  (red frame %dx%d anchor %s) inside=%s'
          % (x0, x1, y0, y1, W, H, RED_ANCHOR, fit['inside']), flush=True)
    E = EXPAND
    WE, HE = W + 2 * E, H + 2 * E
    samples = opts.get('samples') or (16 if look else 28)
    todo = []
    anims = ['move'] if look else ['idle', 'move', 'door', 'unload']
    for anim in anims:
        for d in VAN_DIRS:
            n = 1 if look else spec['anims'][anim]['frames']
            for i in range(n):
                name = '%s_%s_%d' % (anim, d, i)
                if opts['only'] and name not in opts['only'] and anim not in opts['only']:
                    continue
                if opts['force'] or not os.path.exists(os.path.join(out, name + '.png')):
                    todo.append((anim, d, i, name))
    sc = VR.setup_scene(WE, HE, (ax + E, ay + E), samples)
    for k, (anim, d, i, name) in enumerate(todo):
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        VR.pose(B, spec, anim, i)
        render_png(os.path.join(out, name + '.png'))
        print('[gb_van] %d/%d %s  %.0fs' % (k + 1, len(todo), name, time.time() - t0), flush=True)
    if look:
        return
    # occlusion masks on the same expanded canvas: idle / move (over_* frames) and (polish H2) door / unload too, so
    # the patches ship their own over_door_* / over_unload_* (the open driver door in front of seat 1, the rear
    # leaves in front of standing riders) instead of the closed-door over_idle_<dir>_0
    mtodo = []
    for anim in ('idle', 'move', 'door', 'unload'):
        for d in VAN_DIRS:
            for i in range(spec['anims'][anim]['frames']):
                name = '%s_%s_%d' % (anim, d, i)
                if opts['force'] or not all(os.path.exists(os.path.join(out, '%s_%s.png' % (p, name)))
                                            for p in ('pall', 'pvis')):
                    mtodo.append((anim, d, i, name))
    if mtodo:
        sc.cycles.samples = 8
        sc.cycles.use_denoising = False
        sc.cycles.use_adaptive_sampling = False
        VR.render_masks(B, spec, out, mtodo)
        print('[gb_van] masks done  %.0fs' % (time.time() - t0), flush=True)
    # turn frames (S, E, N) on their own frame
    xs, ys = [], []
    for d in TURN_DIRS:
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        VR.pose(B, spec, 'turn', 0)
        for p in L.world_points(VR.visible_meshes(B)):
            x, y = L.screen_xy(p)
            xs.append(x)
            ys.append(y)
    M = 4
    tax = int(math.ceil(-min(xs))) + M
    tay = int(math.ceil(-min(ys))) + M
    TW = (tax + int(math.ceil(max(xs))) + M + 3) // 4 * 4
    TH = (tay + int(math.ceil(max(ys))) + M + 3) // 4 * 4
    print('[gb_van] turn frame %dx%d anchor (%d, %d)  (max %s)' % (TW, TH, tax, tay, TURN_MAX), flush=True)
    sc = VR.setup_scene(TW, TH, (tax, tay), samples)
    ttodo = [('turn', d, 0, 'turn_%s_0' % d) for d in TURN_DIRS]
    for anim, d, i, name in ttodo:
        if opts['force'] or not os.path.exists(os.path.join(out, name + '.png')):
            B.root.rotation_euler.z = bc.yaw_for_dir(d)
            VR.pose(B, spec, anim, i)
            render_png(os.path.join(out, name + '.png'))
            print('[gb_van] %s  %.0fs' % (name, time.time() - t0), flush=True)
    tm = [t for t in ttodo if opts['force'] or not all(os.path.exists(os.path.join(out, '%s_%s.png' % (p, t[3])))
                                                       for p in ('pall', 'pvis'))]
    if tm:
        sc.cycles.samples = 8
        sc.cycles.use_denoising = False
        sc.cycles.use_adaptive_sampling = False
        VR.render_masks(B, spec, out, tm)
    # ---- meta
    pts = {}
    for d in VAN_DIRS:
        pts[d] = van_points(B, spec, d, 'idle', 0)
    for d in TURN_DIRS:
        pts[d] = van_points(B, spec, d, 'turn', 0)
    # parcels of unload f3 (same body-local points, posed in unload 3)
    for d in VAN_DIRS:
        pp = van_points(B, spec, d, 'unload', 3)
        pts[d]['parcelPoints'] = pp['parcelPoints']
        pts[d]['parcelGround'] = pp['parcelGround']
    vis = visibility(B, spec)
    rear = rear_parts_check(B, spec)
    meta = {'key': 'gb_van', 'frameSize': [W, H], 'anchorPx': [ax, ay], 'expand': E, 'canvas': [WE, HE],
            'anims': {k: dict(v) for k, v in spec['anims'].items()}, 'samples': samples, 'fit': fit,
            'lengthM': B.length, 'widthM': B.width, 'heightM': B.height, 'topPx': int(math.ceil(-y0)),
            'turn': {'frameSize': [TW, TH], 'anchorPx': [tax, tay], 'dirs': TURN_DIRS},
            'points': pts, 'seatNames': [s['name'] for s in B.seats], 'driverSeat': 0,
            'wheelSym': B.wheel_sym, 'wheelR': round(B.wheels[0][1], 3), 'visible': vis, 'rearParts': rear,
            'vanGold': GV_GOLD()}
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[gb_van] done in %.0fs' % (time.time() - t0), flush=True)


# =================================================================================================== main

def main():
    opts = parse(bc.script_args())
    what = opts['what'] or ['all']
    if 'all' in what:
        what = ['van', 'roofsign', 'pennant', 'builds', 'hub']
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for w in what:
        if w == 'van':
            render_van(opts)
        elif w == 'roofsign':
            import gb_signs as GS
            GS.render_roofsigns(opts)
        elif w == 'pennant':
            import gb_signs as GS
            GS.render_pennant(opts)
        elif w == 'builds':
            import gb_assets as GA
            GA.render_all(opts)
        elif w == 'hub':
            import gb_hub as GH
            GH.render_hub(opts)
        else:
            raise SystemExit('unknown part: ' + w)
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
