"""
bld_render.py - render the v3 buildings, construction stages, items and boats
(docs/CONTRACT_V3.md section E) into a raw frame cache: one PNG per frame + one sidecar JSON per build.
bld_pack.py then makes assets/buildings/ (atlases + manifest.json) and the previews.

Same camera / light / PPU / shadow catcher as the base props (bl_common + prop_lib); boats use the
character settings (no shadow, ink outline added at pack time) - see bld_boats.py.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/bld_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/bld_render.py -- [same args]

  * no keys    -> render every build that is not cached yet (resumable), plus staff_overrides
  * keys       -> build keys (shop_general, watchtower, site_M, boat_rowboat ...), sprite keys
                  (site_scaffold_M -> its build), prefixes with a trailing * (house_*, item_*, boat_*)
  * --force    -> re-render even if cached
  * --dirs S,E / --anims row  (boats only) render a subset (look-dev); the sidecar is only written when
                  every frame exists
  * staff_overrides is a pseudo key: it builds the EXISTING market_counter and trade_post
    (prop_assets builders, unchanged), ray-casts where a clerk behind the counter is best seen and
    writes staffPoints - nothing is rendered, nothing in assets/props is touched.
Default cache: <tmp>/fv_cache/buildings.  Deterministic: fixed seeds + sample counts.
Frames are written as <name>.tmp.png and renamed, so an interrupted run resumes cleanly.
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

MARGIN = 8
SECTORS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
CAM_TOWARD = Vector((math.sqrt(0.5), -math.sqrt(0.5), 0.0))      # horizontal direction toward the camera
POINT_FIELDS = {'staff': 'staffPoints', 'work': 'workPoints', 'customer': 'customerPoints'}
DIR_FIELDS = {'staff': 'staffDirs', 'work': 'workDirs', 'customer': 'customerDirs', 'dock': 'dockDir'}
SINGLE_FIELDS = {'in': 'inPoint', 'out': 'outPoint', 'cash': 'cashPoint', 'dock': 'dockPoint', 'door': 'doorPoint',
                 'drop': 'dropPoint'}


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'buildings'), 'list': False,
            'dirs': None, 'anims': None}
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
    import bld_boats as BB
    return list(BA.BLD) + list(BB.BOATS) + ['staff_overrides']


def select(keys):
    import bld_boats as BB
    allk = all_keys()
    if not keys:
        return allk
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        else:
            hit = [n for n, s in BA.BLD.items() if k in (s['sprites'] or [n])]
            if not hit:
                raise SystemExit('unknown key: ' + k)
            out += hit
    seen = set()
    del BB
    return [k for k in out if not (k in seen or seen.add(k))]


def screen_dir(v):
    """World direction -> screen facing name (CONTRACT section 9 sector maths)."""
    sx = (v.x + v.y) * math.sqrt(0.5)
    sy = (v.x - v.y) * math.sqrt(0.5) * 0.5
    a = math.atan2(sy * 2.0, sx)
    return SECTORS[int(round(a / (math.pi / 4))) % 8]


def px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def parent_to_root(yaw_deg):
    """Parent every top-level object to a root empty rotated by yaw (as life_render.py)."""
    root = bpy.data.objects.new('BldRoot', None)
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
    """{kind: [[dx, dy], ...]} + {kind: [dir, ...]} for the current pose."""
    bpy.context.view_layer.update()
    R = Matrix.Rotation(math.radians(yaw_deg), 3, 'Z')
    pts, dirs = {}, {}
    for kind, em, facing in BA.MARKERS:
        pts.setdefault(kind, []).append(px(em.matrix_world.translation))
        if facing is not None:
            dirs.setdefault(kind, []).append(screen_dir(R @ facing))
    return pts, dirs


def fit_frames(frames, shadow):
    """Frame that fits every state with one shared anchor.  Returns W, H, anchor, {frame: topPx}."""
    left = right = up = down = 0
    tops = {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        w, h, (x, y), top = L.frame_fit(margin=MARGIN, shadow=shadow)
        left, right, up, down = max(left, x), max(right, w - x), max(up, y), max(down, h - y)
        tops[name] = int(round(top))
    W = (left + right + 3) // 4 * 4
    H = (up + down + 3) // 4 * 4
    return W, H, (left, up), tops


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


# --------------------------------------------------------------------------- overlay mask

def mask_material(c_world):
    """Emission white on the camera side of the vertical plane through c (normal = toward the camera), else
    black.  Used to cut the occluder overlay (counter in front of a clerk) out of the base render."""
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
    dot.inputs[1].default_value = tuple(CAM_TOWARD)
    gt = nt.nodes.new('ShaderNodeMath')
    gt.operation = 'GREATER_THAN'
    gt.inputs[1].default_value = 0.0
    nt.links.new(dot.outputs['Value'], gt.inputs[0])
    nt.links.new(gt.outputs[0], em.inputs['Color'])
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def render_overlay_mask(c_world, path, samples=16):
    sc = bpy.context.scene
    cat = bpy.data.objects.get('ShadowCatcher')
    if cat:
        cat.hide_render = True
    m = mask_material(c_world)
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE') and o.name != 'ShadowCatcher':
            if o.type == 'MESH':
                o.data.materials.clear()
                o.data.materials.append(m)
                for p in o.data.polygons:
                    p.material_index = 0
            else:
                o.data.materials.clear()
                o.data.materials.append(m)
    for o in sc.objects:
        if o.type == 'LIGHT':
            o.hide_render = True
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    render_png(path)


# --------------------------------------------------------------------------- render one build

def frames_for(spec, res):
    key = spec['key']
    if res.get('frames'):
        return res['frames']
    frames = [(key, res.get('idle'))]
    for i in range(spec['work']):
        frames.append(('%s_work_%d' % (key, i), (lambda i=i: res['work'](i))))
    return frames


def render_build(spec, cache, samples=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    bc.setup_lighting()
    res = spec['fn']() or {}
    if spec['work'] and not ('idle' in res and 'work' in res):
        raise SystemExit('%s: a build with work frames must return idle() and work(i)' % key)
    root = parent_to_root(spec['yaw'])
    frames = frames_for(spec, res)
    item = spec['item']
    if item:
        W, H = BA.ITEM_FRAME
        anchor = BA.ITEM_ANCHOR
        bpy.context.view_layer.update()
        w2, h2, an2, top = L.frame_fit(margin=0, shadow=False)
        tops = {key: int(round(top))}
        if an2[0] > anchor[0] or an2[1] > anchor[1] or (w2 - an2[0]) > (W - anchor[0]) or \
                (h2 - an2[1]) > (H - anchor[1]):
            print('WARNING item %s exceeds item frame: need anchor %s size %sx%s' % (key, an2, w2, h2), flush=True)
    else:
        W, H, anchor, tops = fit_frames(frames, spec['shadow'])
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
    first = frames[0][0]
    if frames[0][1]:
        frames[0][1]()
    bpy.context.view_layer.update()
    meta = {
        'build': key, 'kind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)],
        'frames': [n for n, _ in frames], 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': tops, 'framePoints': fpts, 'frameDirs': fdirs,
        'sprites': res.get('sprites') or {key: {'frame': key}},
    }
    if spec['work']:
        meta['anims'] = {'work': {'frames': [n for n, _ in frames[1:]], 'fps': spec['fps'], 'repeat': -1}}
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
        render_overlay_mask(c_world, os.path.join(cache, mask + '.png'))
        meta['overlay'] = {'key': ov['key'], 'mask': mask, 'of': first,
                           'notes': 'every surface on the camera side of the vertical plane through the staff '
                                    'spot (the counter + what stands in front of the clerk)'}
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)  %.1fs' % (key, W, H, anchor, len(frames), time.time() - t0),
          flush=True)
    del root
    return meta


# --------------------------------------------------------------------------- staff overrides (existing sellers)

def _clerk_score(p, depsgraph, samples):
    """Fraction of sample points on a chibi head (centre 1.12 m, r 0.27 m) + face disc that are visible from
    the camera (ray toward the camera hits nothing)."""
    vis = 0
    for q in samples:
        o = Vector((p.x, p.y, 0.0)) + q
        d = Vector((0.612, -0.612, 0.5)).normalized()
        hit = bpy.context.scene.ray_cast(depsgraph, o + d * 0.02, d)[0]
        vis += 0 if hit else 1
    return vis / float(len(samples))


def staff_overrides(cache):
    """Clerk spots behind the EXISTING market_counter and trade_post (prop_assets builders run unchanged, nothing is
    rendered).  Candidates on a grid behind the counter (+Y side, the seller side) are scored by how much of a
    1.45 m chibi head is visible to the camera over the counter/awning, then the best spot nearest the counter
    middle wins."""
    import prop_assets as PA
    head = []
    for k in range(40):                        # face-side hemisphere samples (toward the camera)
        a = math.tau * k / 40
        for rr in (0.0, 0.12, 0.22):
            off = Vector((rr * math.cos(a), 0.0, rr * math.sin(a)))
            off.rotate(Matrix.Rotation(math.radians(45.0), 3, 'Z'))
            head.append(Vector((0, 0, 1.12)) + off + Vector((0.19, -0.19, 0.0)))
    out = {}
    for key, xs, ys in (('market_counter', [-0.6, -0.3, 0.0, 0.3, 0.6], [0.75, 0.85, 0.95, 1.05]),
                        ('trade_post', [-0.4, -0.1, 0.2, 0.5, 0.8], [0.95, 1.05, 1.15, 1.3])):
        bc.reset_scene()
        L._CUSTOM.clear()
        spec = PA.ASSETS[key]
        spec['fn']()
        L.rotate_all(spec['yaw'])
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        best = None
        table = []
        for y in ys:
            for x in xs:
                p = Vector((x, y, 0.0))
                s = _clerk_score(p, dg, head)
                table.append([x, y, round(s, 3)])
                # prefer visibility, then closeness to the counter middle / back edge
                rank = (round(s, 2), -abs(x) * 0.5 - (y - ys[0]) * 0.3)
                if best is None or rank > best[0]:
                    best = (rank, p, s)
        _, p, s = best
        out[key] = {'of': key, 'kind': 'staff', 'staffPoints': [px(p)], 'staffDirs': ['SW'],
                    'staffDepth': 'behind', 'staffWorldM': [[round(p.x, 3), round(p.y, 3)]],
                    'headVisible': round(s, 3), 'scores': table,
                    'notes': 'Clerk spot behind the existing %s (seller side = world +Y, screen up-right), measured '
                             'from prop_assets geometry (sprite not re-rendered). The clerk faces SW (customers); '
                             'normal anchor-y sorting draws the clerk BEHIND the counter sprite, so the counter '
                             'hides the legs. headVisible = fraction of the head visible over the counter.' % key}
        print('[staff_overrides] %s -> world %s px %s head visible %.0f%%' % (key, tuple(round(v, 2) for v in p),
                                                                           px(p), 100 * s), flush=True)
    with open(os.path.join(cache, 'staff_overrides.json'), 'w') as f:
        json.dump({'build': 'staff_overrides', 'entries': out}, f, indent=1)
    return out


# --------------------------------------------------------------------------- main

def cached(key, cache):
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side):
        return False
    try:
        meta = json.load(open(side))
    except Exception:
        return False
    if key == 'staff_overrides':
        return True
    names = list(meta.get('frames', []))
    if meta.get('overlay'):
        names.append(meta['overlay']['mask'])
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    import bld_boats as BB
    if opts['list']:
        for k in keys:
            if k in BA.BLD:
                s = BA.BLD[k]
                print(k, s['kind'], s['atlas'], 'work=%d' % s['work'], ', '.join(s['sprites'] or [k]))
            elif k in BB.BOATS:
                print(k, 'boat', ', '.join('%s(%d)' % (a, n['frames']) for a, n in BB.BOATS[k]['anims'].items()))
            else:
                print(k, '(pseudo: measure existing sellers)')
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if k == 'staff_overrides':
            if opts['force'] or not cached(k, opts['cache']):
                staff_overrides(opts['cache'])
            else:
                print('[staff_overrides] cached')
            continue
        if k in BB.BOATS:
            BB.render_boat(k, opts)
            continue
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_build(BA.BLD[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
