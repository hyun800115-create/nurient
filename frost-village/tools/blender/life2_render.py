"""
life2_render.py - render the v5 life-event props (docs/CONTRACT_V5.md section P) into a raw frame cache:
one PNG per frame + one sidecar JSON per build (props / items), and <cache>/<stroller>/{anim}_{dir}_{i}.png +
meta.json for the baby strollers.  life2_pack.py then makes assets/life2/ (atlases + manifest.json) + previews.

Props and items go through render_prop(), a copy-extension of bld_render.render_build (same bl_common camera, light,
PPU, shadow catcher, prop_lib.frame_fit, marker maths, item frame 72 x 72 @ (36, 54)) with three additions:
  * `fit_objs`   - fit the frame to a subset of the scene (ribbon_garland is fitted to the decorations only);
  * `catch_objs` - objects rendered as shadow-catching holdouts (the real town_hall geometry: the garland is
                   occluded exactly like the building and keeps its soft shadows on the facade);
  * overlay masks with any plane normal (school_desk_row_front: everything on the -Y side of the seat line).
The strollers are rendered like the characters (5 dirs, idle + move, no shadow, fixed 128 x 128 frame).

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/life2_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
                                                          [--dirs S,E] [--anims idle]   (strollers: look-dev subset)
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/life2_render.py -- [same args]
  * no keys -> render every build that is not cached yet (resumable); keys: build keys, sprite keys (cradle_empty ->
    cradle), prefixes with a trailing * (wedding_*, item_*), or a group: wedding, memorial, decor, items, stroller
  * --force -> re-render even if cached
Default cache: <tmp>/fv_cache/life2.  Deterministic: fixed seeds + sample counts.  Frames are written as
<name>.tmp.png and renamed, so an interrupted run resumes cleanly.
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
from mathutils import Matrix, Vector  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import bld_assets as BA  # noqa: E402
import life2_lib as G  # noqa: E402
import life2_assets as A2  # noqa: E402
import life2_stroller as ST  # noqa: E402

MARGIN = 8
SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
GROUPS = {'wedding': 'life2_wedding', 'memorial': 'life2_memorial', 'decor': 'life2_decor', 'items': 'life2_items'}


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'life2'), 'list': False, 'dirs': None,
            'anims': None}
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
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def all_keys():
    return list(A2.LIFE2) + list(ST.STROLLERS)


def select(keys):
    allk = all_keys()
    if not keys:
        return allk
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        elif k in GROUPS:
            out += [n for n, s in A2.LIFE2.items() if s['atlas'] == GROUPS[k]]
        elif k == 'stroller':
            out += list(ST.STROLLERS)
        else:
            hit = [n for n, s in A2.LIFE2.items() if k in (s['sprites'] or [n])]
            if not hit:
                raise SystemExit('unknown key: ' + k)
            out += hit
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


def screen_dir(v):
    sx = (v.x + v.y) * math.sqrt(0.5)
    sy = (v.x - v.y) * math.sqrt(0.5) * 0.5
    a = math.atan2(sy * 2.0, sx)
    return SECTORS[int(round(a / (math.pi / 4))) % 8]


def px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def parent_to_root(yaw_deg):
    root = bpy.data.objects.new('L2Root', None)
    bpy.context.scene.collection.objects.link(root)
    for o in list(bpy.context.scene.objects):
        if o is root or o.parent is not None or o.type == 'CAMERA' or o.name == 'ShadowCatcher':
            continue
        if o.type == 'LIGHT' and o.data.type == 'SUN':
            continue
        o.parent = root
    root.rotation_euler = (0.0, 0.0, math.radians(yaw_deg))
    bpy.context.view_layer.update()
    return root


def markers(yaw_deg):
    bpy.context.view_layer.update()
    R = Matrix.Rotation(math.radians(yaw_deg), 3, 'Z')
    pts, dirs = {}, {}
    for kind, em, facing in A2.MARKERS:
        pts.setdefault(kind, []).append(px(em.matrix_world.translation))
        if facing is not None:
            dirs.setdefault(kind, []).append(screen_dir(R @ facing))
    return pts, dirs


def mesh_like(objs):
    return [o for o in objs if o.type in ('MESH', 'CURVE') and not o.hide_render and o.visible_camera]


def fit_frames(frames, shadow, objs=None):
    left = right = up = down = 0
    tops = {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        sel = mesh_like(objs) if objs else None
        w, h, (x, y), top = L.frame_fit(margin=MARGIN if shadow else MARGIN + 6, shadow=shadow, objs=sel)
        left, right, up, down = max(left, x), max(right, w - x), max(up, y), max(down, h - y)
        tops[name] = int(round(top))
    W = (left + right + 3) // 4 * 4
    H = (up + down + 3) // 4 * 4
    return W, H, (left, up), tops


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


def mask_material(c_world, normal):
    """Emission white on the side of the vertical plane through c that `normal` points to, else black."""
    m = bpy.data.materials.new('OverlayMask')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    sub = nt.nodes.new('ShaderNodeVectorMath')
    sub.operation = 'SUBTRACT'
    sub.inputs[1].default_value = tuple(c_world)
    nt.links.new(geo.outputs['Position'], sub.inputs[0])
    nt.links.new(sub.outputs[0], dot.inputs[0])
    dot.inputs[1].default_value = tuple(normal)
    gt = nt.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs['Value'], gt.inputs[0])
    nt.links.new(gt.outputs[0], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def render_overlay_mask(c_world, normal, path, samples=16):
    sc = bpy.context.scene
    cat = bpy.data.objects.get('ShadowCatcher')
    if cat:
        cat.hide_render = True
    m = mask_material(c_world, normal)
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE') and o.name != 'ShadowCatcher':
            o.data.materials.clear()
            o.data.materials.append(m)
            if o.type == 'MESH':
                for p in o.data.polygons:
                    p.material_index = 0
            for mod in o.modifiers:
                if mod.type == 'SOLIDIFY':
                    mod.material_offset = 0
                    mod.material_offset_rim = 0
    for o in sc.objects:
        if o.type == 'LIGHT':
            o.hide_render = True
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    render_png(path)


# --------------------------------------------------------------------------- props + items

def render_prop(spec, cache, samples=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    A2.MARKERS.clear()
    BA.MARKERS.clear()
    G._MAT_HEX.clear()
    bc.setup_lighting()
    res = spec['fn']() or {}
    root = parent_to_root(spec['yaw'])
    frames = res.get('frames') or [(key, None)]
    item = spec['item']
    if item:
        W, H = A2.ITEM_FRAME
        anchor = A2.ITEM_ANCHOR
        bpy.context.view_layer.update()
        w2, h2, an2, top = L.frame_fit(margin=0, shadow=False)
        tops = {key: int(round(top))}
        if an2[0] > anchor[0] or an2[1] > anchor[1] or (w2 - an2[0]) > (W - anchor[0]) or \
                (h2 - an2[1]) > (H - anchor[1]):
            print('WARNING item %s exceeds item frame: need anchor %s size %sx%s' % (key, an2, w2, h2), flush=True)
    else:
        W, H, anchor, tops = fit_frames(frames, spec['shadow'], res.get('fit_objs'))
    for o in res.get('catch_objs') or []:
        if o.type in ('MESH', 'CURVE'):
            o.is_shadow_catcher = True
            o.visible_shadow = False
    if spec['shadow']:
        bc.add_shadow_catcher(size=spec['catcher'])
    bc.setup_render(W, H, samples=samples or spec['samples'])
    bc.setup_camera(W, H, anchor)
    fpts, fdirs = {}, {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        render_png(os.path.join(cache, name + '.png'))
        fpts[name], fdirs[name] = markers(spec['yaw'])
    if res.get('rest'):
        res['rest']()
    elif frames[0][1]:
        frames[0][1]()
    bpy.context.view_layer.update()
    meta = {
        'build': key, 'kind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)],
        'frames': [n for n, _ in frames], 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': tops, 'framePoints': fpts, 'frameDirs': fdirs,
        'sprites': res.get('sprites') or {key: {'frame': key}},
    }
    if spec['fp'] is not None:
        meta['footprint'] = L.footprint_px(spec['fp'], spec['yaw'])
        meta['footprintM'] = list(spec['fp']) if spec['fp'][0] != 'r' else {'radius': spec['fp'][1]}
    if spec['front']:
        meta['front'] = spec['front']
    if item:
        meta['stackStep'] = L.stack_step(item['thickness'])
        meta['thicknessM'] = item['thickness']
    R = Matrix.Rotation(math.radians(spec['yaw']), 3, 'Z')
    fx = {n: px(R @ Vector(p)) for n, p in (res.get('fx') or {}).items()}
    if fx:
        meta['fxPoints'] = fx
    meta.update(spec['extra'])
    meta.update(res.get('extra') or {})
    ov = res.get('overlay')
    if ov:
        mask = '%s_mask' % ov['key']
        c_world = R @ Vector(ov['at'])
        n_world = R @ Vector(ov.get('normal', (math.sqrt(0.5), -math.sqrt(0.5), 0.0)))
        render_overlay_mask(c_world, n_world, os.path.join(cache, mask + '.png'))
        meta['overlay'] = {'key': ov['key'], 'mask': mask, 'of': frames[0][0],
                           'notes': 'every surface on the -Y side of the seat line (the desks in front of the '
                                    'seated kids)'}
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)  %.1fs' % (key, W, H, anchor, len(frames), time.time() - t0),
          flush=True)
    del root
    return meta


def cached(key, cache):
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side):
        return False
    try:
        meta = json.load(open(side))
    except Exception:
        return False
    names = list(meta.get('frames', []))
    if meta.get('overlay'):
        names.append(meta['overlay']['mask'])
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


# --------------------------------------------------------------------------- strollers (characters-style)

def render_stroller(key, opts):
    spec = ST.STROLLERS[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    dirs = ST.DIRS if not opts.get('dirs') else [d for d in opts['dirs'].split(',') if d in ST.DIRS]
    anims = list(ST.ANIMS) if not opts.get('anims') else [a for a in opts['anims'].split(',') if a in ST.ANIMS]
    todo = []
    for anim in anims:
        for d in dirs:
            for i in range(ST.ANIMS[anim]['frames']):
                path = os.path.join(out, '%s_%s_%d.png' % (anim, d, i))
                if opts.get('force') or not os.path.exists(path):
                    todo.append((anim, d, i, path))
    meta_path = os.path.join(out, 'meta.json')
    if not todo and os.path.exists(meta_path):
        print('[%s] cached' % key)
        return
    bc.reset_scene()
    L._CUSTOM.clear()
    G._MAT_HEX.clear()
    bc.setup_lighting()
    B = ST.build(spec)
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = ST.measure_fit(B)
    W, H = ST.FRAME
    ax, ay = ST.ANCHOR
    fits = (-x0 + 2 <= ax) and (x1 + 2 <= W - ax) and (-y0 + 2 <= ay) and (y1 + 2 <= H - ay)
    print('[%s] extents x %.0f..%.0f y %.0f..%.0f -> fits 128x128@(64,104): %s; %d frames' % (
        key, x0, x1, y0, y1, fits, len(todo)), flush=True)
    sc = bc.setup_render(W, H, samples=opts.get('samples') or spec['samples'], denoise=True)
    sc.cycles.max_bounces = 4
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, (ax, ay))
    for k, (anim, d, i, path) in enumerate(todo):
        B['root'].rotation_euler.z = bc.yaw_for_dir(d)
        ST.pose(B, anim, i, ST.ANIMS[anim]['frames'])
        bpy.context.view_layer.update()
        render_png(path)
        if k % 10 == 0:
            print('[%s] %d/%d %s_%s_%d  %.0fs' % (key, k + 1, len(todo), anim, d, i, time.time() - t0), flush=True)
    pts = {name: {} for name in B['points']}
    for d in ST.DIRS:
        B['root'].rotation_euler.z = bc.yaw_for_dir(d)
        ST.pose(B, 'idle', 0, ST.ANIMS['idle']['frames'])
        bpy.context.view_layer.update()
        mw = B['root'].matrix_world
        for name, p in B['points'].items():
            pts[name][d] = px(mw @ Vector(p))
    complete = all(os.path.exists(os.path.join(out, '%s_%s_%d.png' % (a, d, i)))
                   for a, info in ST.ANIMS.items() for d in ST.DIRS for i in range(info['frames']))
    meta = {'key': key, 'kind': 'stroller', 'frameSize': [W, H], 'anchorPx': [ax, ay],
            'anchor': [round(ax / W, 5), round(ay / H, 5)], 'anims': ST.ANIMS, 'name': spec['name'],
            'handleHeightM': round(ST.GRIP.z, 3), 'handleBackM': round(ST.GRIP.y, 3),
            'lengthM': 0.9, 'widthM': 0.5, 'extentsPx': [round(x0), round(x1), round(y0), round(y1)],
            'complete': complete}
    meta.update(pts)
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs (complete=%s)' % (key, time.time() - t0, complete), flush=True)


# --------------------------------------------------------------------------- main

def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    if opts['list']:
        for k in keys:
            if k in A2.LIFE2:
                s = A2.LIFE2[k]
                print(k, s['kind'], s['atlas'], 'yaw=%g' % s['yaw'], ', '.join(s['sprites'] or [k]))
            else:
                print(k, 'stroller', ', '.join('%s(%d)' % (a, n['frames']) for a, n in ST.ANIMS.items()))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if k in ST.STROLLERS:
            render_stroller(k, opts)
            continue
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_prop(A2.LIFE2[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
