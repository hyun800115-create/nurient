"""
tr2_render.py - render the v4.2 train cars and loop rails (docs/CONTRACT_V42.md section AK) into a raw frame cache.
tr2_pack.py then makes assets/train2/ (atlases + manifest.json) and the previews.

  * cars (tr2_cars.CARS: train_coach, train_boxcar, train_flatcar) exactly like the town train cars
    (town_train.render_car): same camera / light / samples, one fixed frame + anchor per car, frames
    <cache>/<car>/<anim>_<dir>_<i>.png for the rendered dirs of each anim (door_open: SE, NE only), soft shadow
    frames shadow_<DIR>.png for all EIGHT headings (car invisible to the camera, shadow catcher), meta.json with the
    points per dir (px from the anchor);
  * loop decals, fence tiles and props (tr2_rails.ITEMS): <cache>/<key>.png (+ _<frame>.png) + <key>.json.

Re-run (build machine, Blender as a Python module, one process at a time, `nice`):
    nice -n 10 /tmp/bvenv/bin/python tools/blender/tr2_render.py -- [keys ...] [--force] [--samples N]
                                      [--cache DIR] [--dirs S,E] [--anims move] [--list] [--meta-only]
  * no keys -> everything not cached yet (resumable); keys: car / rail keys, `cars`, `rails`
  * --dirs / --anims render a subset of a car (look-dev; meta is still written)
Default cache: /tmp/fv_cache/train2.  Deterministic: fixed seeds + sample counts.
"""
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import tr2_cars as TC  # noqa: E402

ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
MARGIN = 4
CAM = Vector((0.612, -0.612, 0.0)).normalized()        # ground direction toward the camera


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None, 'cache': '/tmp/fv_cache/train2', 'list': False,
            'dirs': None, 'anims': None, 'meta_only': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache', '--dirs', '--anims'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
        elif a == '--meta-only':
            opts['meta_only'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def all_meshes(grp):
    out = []

    def walk(o):
        for ch in o.children:
            if ch.type in ('MESH', 'CURVE') and not ch.hide_render:
                out.append(ch)
            walk(ch)
    walk(grp)
    return out


def to_px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def frames_of(spec, dirs=None, anims=None):
    out = []
    for anim, a in spec['anims'].items():
        if anims and anim not in anims:
            continue
        for d in a['dirs']:
            if dirs and d not in dirs:
                continue
            for i in range(a['frames']):
                out.append((anim, d, i))
    return out


def measure(B, spec):
    xs, ys = [], []
    for anim, d, i in frames_of(spec):
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, anim, i, spec['anims'][anim]['frames'])
        bpy.context.view_layer.update()
        for p in L.world_points([o for o in all_meshes(B['group']) if o.visible_camera]):
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
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    return sc


def yawed(v, d):
    a = bc.yaw_for_dir(d)
    return Vector((v[0] * math.cos(a) - v[1] * math.sin(a), v[0] * math.sin(a) + v[1] * math.cos(a), 0.0))


def seen(p, own=0.14, far=40.0):
    """(polish M2) is world point p visible from the (orthographic) camera?  Cast from the camera side toward p:
    visible when nothing is hit more than `own` m in front of p (a lamp / window surface itself counts as seen)."""
    cam = bpy.context.scene.camera
    d = (cam.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))).normalized()
    o = p - d * far
    dg = bpy.context.evaluated_depsgraph_get()
    hit, loc, _n, _i, _ob, _m = bpy.context.scene.ray_cast(dg, o, d, distance=2 * far)
    return (not hit) or (loc - o).dot(d) >= far - own


def car_points(B, spec):
    """Points per rendered dir (rest pose = idle frame 0): px offsets from the anchor.
    (polish M2) windowPoints = the lit SIDE windows that face the camera and are not hidden; the end-door windows
    go to endWindowPoints (they sit between two coupled coaches: glow them weakly or not at all); lampPoints keep
    only the lamps the camera really sees in that dir (ray cast), so no glow lands on a roof or a tarp."""
    P = B['points']
    out = {}
    head = {}
    hidden = {}
    for d in TC.DIRS:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, 'idle', 0, 1)
        bpy.context.view_layer.update()
        mw = B['group'].matrix_world
        for name, val in P.items():
            if name in ('lampR', 'lampN'):
                continue
            if name == 'doorPoints':
                out.setdefault(name, {})[d] = {side: [to_px(mw @ Vector(p)) for p in pts] for side, pts in val.items()}
            elif name == 'windowPoints':
                vis, end = [], []
                for p, n in val:
                    w = mw @ Vector(p)
                    if yawed(n, d).dot(CAM) > 0.3 and seen(w, own=0.2):
                        (end if abs(n[1]) > 0.5 else vis).append(to_px(w))
                out.setdefault(name, {})[d] = vis
                out.setdefault('endWindowPoints', {})[d] = end
            elif name == 'lampPoints':
                vis = []
                for k_, p in enumerate(val):
                    w = mw @ Vector(p)
                    # a directional lamp (lens normal lampN) glows only toward the side its lens faces
                    lens_ok = 'lampN' not in P or yawed(P['lampN'][k_], d).dot(CAM) > -0.3
                    if lens_ok and seen(w, own=P.get('lampR', 0.1) + 0.03):     # its own surface counts as seen
                        vis.append(to_px(w))
                    else:
                        hidden.setdefault(d, []).append(to_px(w))
                out.setdefault(name, {})[d] = vis
            elif name == 'cargoPoint':
                out.setdefault(name, {})[d] = to_px(mw @ Vector(val)) + [False]
            elif name == 'cargoSlots':
                slots = [to_px(mw @ Vector(p)) + [False] for p in val]
                out.setdefault(name, {})[d] = sorted(slots, key=lambda s: (s[1], s[0]))
            else:
                out.setdefault(name, {})[d] = to_px(mw @ Vector(val))
        head[d] = to_px(mw @ B['head_ref'])[1]
    if hidden:
        out['lampHiddenPx'] = hidden
    return out, head


def render_car(key, opts):
    spec = TC.CARS[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    dirs = opts['dirs'].split(',') if opts.get('dirs') else None
    anims = opts['anims'].split(',') if opts.get('anims') else None
    todo = []
    for anim, d, i in frames_of(spec, dirs, anims):
        path = os.path.join(out, '%s_%s_%d.png' % (anim, d, i))
        if opts.get('force') or not os.path.exists(path):
            todo.append((anim, d, i, path))
    shadow_todo = [d for d in ALL8 if opts.get('force') or not os.path.exists(os.path.join(out, 'shadow_%s.png' % d))]
    if dirs or anims:
        shadow_todo = []
    meta_path = os.path.join(out, 'meta.json')
    if opts.get('meta_only'):                 # points / meta again from the model, no frame rendered
        todo, shadow_todo = [], []
    elif not todo and not shadow_todo and os.path.exists(meta_path):
        print('[%s] cached' % key)
        return
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    B = spec['fn']()
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = measure(B, spec)
    ax = int(math.ceil(-x0)) + MARGIN
    ay = int(math.ceil(-y0)) + MARGIN
    W = (ax + int(math.ceil(x1)) + MARGIN + 3) // 4 * 4
    H = (ay + int(math.ceil(y1)) + MARGIN + 3) // 4 * 4
    anchor = (ax, ay)
    print('[%s] frame %dx%d anchor %s, %d frames + %d shadows to render' % (key, W, H, anchor, len(todo),
                                                                             len(shadow_todo)), flush=True)
    setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
    for k, (anim, d, i, path) in enumerate(todo):
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, anim, i, spec['anims'][anim]['frames'])
        bpy.context.view_layer.update()
        tmp = path[:-4] + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 8 == 0:
            print('[%s] %d/%d %s_%s_%d  %.0fs' % (key, k + 1, len(todo), anim, d, i, time.time() - t0), flush=True)
    pts, head = car_points(B, spec)
    # shadow frames (8 headings): car invisible to the camera but casting, on a shadow catcher
    B['pose'](B, 'move', 0, 8)
    bpy.context.view_layer.update()
    sx0 = sy0 = 1e9
    sx1 = sy1 = -1e9
    for d in ALL8:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        bpy.context.view_layer.update()
        w, h, (a_x, a_y), _ = L.frame_fit(margin=6, shadow=True, objs=[o for o in all_meshes(B['group'])
                                                                       if o.visible_shadow and not o.hide_render])
        sx0, sy0 = min(sx0, -a_x), min(sy0, -a_y)
        sx1, sy1 = max(sx1, w - a_x), max(sy1, h - a_y)
    sax, say = int(-sx0), int(-sy0)
    SW = (sax + int(sx1) + 3) // 4 * 4
    SH = (say + int(sy1) + 3) // 4 * 4
    sh_info = {'frameSize': [SW, SH], 'anchorPx': [sax, say], 'anchor': [round(sax / SW, 5), round(say / SH, 5)],
               'frames': {d: 'shadow_%s' % d for d in ALL8}}
    if shadow_todo:
        for o in all_meshes(B['group']):
            o.visible_camera = False
        for o in bpy.context.scene.objects:
            if o.type == 'LIGHT' and o.data.type == 'POINT':
                o.hide_render = True
        bc.add_shadow_catcher(size=12.0)
        setup_scene(SW, SH, (sax, say), 16)
        for d in shadow_todo:
            B['group'].rotation_euler.z = bc.yaw_for_dir(d)
            bpy.context.view_layer.update()
            path = os.path.join(out, 'shadow_%s.png' % d)
            tmp = path[:-4] + '.tmp.png'
            bc.render_to(tmp)
            os.replace(tmp, path)
    anim_info = {a: {k: v for k, v in info.items()} for a, info in spec['anims'].items()}
    meta = {'key': key, 'kind': 'train', 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'anims': anim_info,
            'notes': spec['notes'], 'lengthM': spec['length'], 'bodyM': spec['body'], 'couplerM': spec['coupler'],
            'wheelR': spec['wheel_r'], 'headTop': min(head.values()), 'headTopDir': head, 'shadowFrames': sh_info}
    meta.update(pts)
    complete = all(os.path.exists(os.path.join(out, '%s_%s_%d.png' % f)) for f in frames_of(spec)) and \
        all(os.path.exists(os.path.join(out, 'shadow_%s.png' % d)) for d in ALL8)
    meta['complete'] = complete
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs (complete=%s)' % (key, time.time() - t0, complete), flush=True)


def main():
    opts = parse(bc.script_args())
    keys = opts['keys']
    try:
        import tr2_rails as TR
        rail_keys = list(TR.ITEMS)
    except ImportError:
        TR, rail_keys = None, []
    allk = list(TC.CARS) + rail_keys
    if not keys:
        sel = allk
    else:
        sel = []
        for k in keys:
            if k == 'cars':
                sel += list(TC.CARS)
            elif k == 'rails':
                sel += rail_keys
            elif k.endswith('*'):
                sel += [n for n in allk if n.startswith(k[:-1])]
            elif k in allk:
                sel.append(k)
            else:
                raise SystemExit('unknown key: ' + k)
    if opts['list']:
        for k in sel:
            print(k)
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in sel:
        if k in TC.CARS:
            render_car(k, opts)
        else:
            TR.render_item(k, opts)
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
