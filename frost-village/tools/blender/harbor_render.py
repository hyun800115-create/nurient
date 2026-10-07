"""
harbor_render.py - render the harbour city "갈매기 항구" (docs/CONTRACT_V6.md section T) into a raw frame cache:
one PNG per frame + one sidecar JSON per build.  harbor_pack.py then makes assets/harbor/ (atlases + manifest.json)
and the previews.

Same camera / light / PPU / markers as the village buildings and the town: bl_common + prop_lib + bld_render
(markers, parent_to_root, frames_for, cached) are imported READ-ONLY.  render_harbor() is a copy-and-extend of
bld_render.render_build() with what a harbour needs:
  * ground = 'land'  -> shadow catcher at z = 0 (exactly like the town buildings)
    ground = 'water' -> shadow catcher on the sea surface harbor_lib.WATER_Z (piers, buoy, breakwater)
    ground = {'land': [(x0, x1, y0, y1), ...]} -> catchers at z = 0 over those rectangles (local metres), the sea
             surface everywhere else (buildings whose gangway / slipway / pier reaches over the water)
  * frames fit the shadow on every catcher plane;
  * any number of work frames (lighthouse / crane: 8) and per-frame marker points (crane hookPoint);
  * seamless tiles (piers, quay walls, breakwater): the builder models a long continuous run and returns
    {'tile': {'axis', 'seg', 'ramp', 'ends'}}; the frame is clipped to the tile's strip and harbor_pack cuts it with
    the partition-of-unity weight of town_rails / town_pack (consecutive tiles composite back to the continuous run).

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/harbor_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/harbor_render.py -- [same args]

  * no keys -> render every build that is not cached yet (resumable)
  * keys    -> build keys (lighthouse, pier_x ...), prefixes with a trailing * (pier_*), or a group / atlas name
               (landmarks, buildings, water, props or harbor_buildings ...)
  * --force -> re-render even if cached
Default cache: <tmp>/fv_cache/harbor.  Deterministic: fixed seeds + sample counts.
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
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import bld_assets as BA  # noqa: E402
import bld_render as BR  # noqa: E402   (read-only reuse: markers, parent_to_root, frames_for, cached, render_png)
import harbor_lib as H  # noqa: E402
import harbor_assets as HA  # noqa: E402

MARGIN = 8
KX, KY = 45.2548, 22.6274


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'harbor'), 'list': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def select(keys):
    allk = list(HA.HARBOR)
    if not keys:
        return allk
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        else:
            grp = [n for n, s in HA.HARBOR.items() if k in (s['extra'].get('zone'), s['atlas'],
                                                              s['atlas'].replace('harbor_', ''))]
            grp += [n for n, s in HA.HARBOR.items() if k in (s['sprites'] or [])]
            if not grp:
                raise SystemExit('unknown key: ' + k)
            out += grp
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


# --------------------------------------------------------------------------- ground planes / catchers

def planes_for(ground):
    if ground == 'land':
        return [0.0]
    if ground == 'water':
        return [H.WATER_Z]
    return [0.0, H.WATER_Z]


def catcher_rect(name, x0, x1, y0, y1, z):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z))]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    return ob


def add_catchers(spec):
    """Shadow catchers for the spec's ground (see module doc).  All named ShadowCatcher* so the framing / marker code
    ignores them."""
    g = spec['ground']
    S = spec['catcher'] / 2.0
    R = Matrix.Rotation(math.radians(spec['yaw']), 4, 'Z')
    out = []
    if g == 'land':
        out.append(catcher_rect('ShadowCatcher', -S, S, -S, S, 0.0))
    elif g == 'water':
        out.append(catcher_rect('ShadowCatcher', -S, S, -S, S, H.WATER_Z))
    else:
        for k, (x0, x1, y0, y1) in enumerate(g['land']):
            o = catcher_rect('ShadowCatcherLand%d' % k, x0, x1, y0, y1, 0.0)
            o.matrix_world = R @ o.matrix_world
            out.append(o)
        w = catcher_rect('ShadowCatcherWater', -S, S, -S, S, H.WATER_Z)
        out.append(w)
    return out


# --------------------------------------------------------------------------- framing

def frame_fit_h(planes, margin=MARGIN, shadow=True, objs=None):
    """prop_lib.frame_fit with the ground shadow projected onto every catcher plane (z = 0 and / or the sea)."""
    objs = objs or L.scene_meshes()
    pts = L.world_points(objs)
    xs, ys = [], []
    top = 0.0
    for p in pts:
        x, y = L.screen_xy(p)
        xs.append(x)
        ys.append(y)
        top = min(top, y)
    if shadow:
        margin += 12
        casters = [p for o in objs if o.visible_shadow for p in L.world_points([o])]
        for p in casters:
            for zp in planes:
                hgt = p.z - zp
                if hgt > 0.02:
                    q = (p.x + hgt * L.SHADOW_K, p.y, zp)
                    x2, y2 = L.screen_xy(q)
                    soft = 3 + 7.0 * hgt
                    xs += [x2 + soft, x2 - soft * 0.5]
                    ys += [y2 + soft * 0.6, y2 - soft * 0.3]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    ax = int(math.ceil(-minx + margin))
    ay = int(math.ceil(-miny + margin))
    w = int(math.ceil(ax + maxx + margin))
    h = int(math.ceil(ay + maxy + margin))
    w = max(16, (w + 3) // 4 * 4)
    h = max(16, (h + 3) // 4 * 4)
    return w, h, (ax, ay), -top


def fit_frames_h(frames, shadow, planes):
    """One frame that fits every state, one shared anchor (bld_render.fit_frames with the harbour planes)."""
    left = right = up = down = 0
    tops = {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        w, h, (x, y), top = frame_fit_h(planes, shadow=shadow)
        left, right, up, down = max(left, x), max(right, w - x), max(up, y), max(down, h - y)
        tops[name] = int(round(top))
    W = (left + right + 3) // 4 * 4
    H_ = (up + down + 3) // 4 * 4
    return W, H_, (left, up), tops


def tile_frame(tile, planes):
    """Frame of a seamless tile: fit the whole continuous run, then clip it to the tile's strip: for every cut
    [axis, 'neg' | 'pos', at] keep the pixels whose computed ground coordinate along that axis is inside at +- ramp
    (closed ends have no cut and keep everything)."""
    import numpy as np
    W, H_, (ax, ay), top = frame_fit_h(planes)
    X, Y = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H_) + 0.5 - ay)
    g = {'x': (X / KX + Y / KY) / 2.0, 'y': (X / KX - Y / KY) / 2.0}
    inside = np.ones((H_, W), bool)
    # content bounds in computed-ground coordinates (vertices + their shadows on every plane), so the infinite strip
    # of a cut is limited to where the run actually has pixels
    gxs, gys = [], []
    for p in L.world_points():
        for zp in [p.z] + [q for q in planes if p.z - q > 0.02]:
            x = p.x + (p.z - zp) * L.SHADOW_K
            gxs.append(x - 1.2247449 * zp)
            gys.append(p.y + 1.2247449 * zp)
    pad = 0.45
    inside &= (g['x'] >= min(gxs) - pad) & (g['x'] <= max(gxs) + pad)
    inside &= (g['y'] >= min(gys) - pad) & (g['y'] <= max(gys) + pad)
    m = tile['ramp'] + 0.03
    for axis, side, at in tile['cuts']:
        inside &= (g[axis] >= at - m) if side == 'neg' else (g[axis] <= at + m)
    ys_, xs_ = np.nonzero(inside)
    x0, x1 = max(0, xs_.min() - 2), min(W, xs_.max() + 3)
    y0, y1 = max(0, ys_.min() - 2), min(H_, ys_.max() + 3)
    w2 = int((x1 - x0 + 3) // 4 * 4)
    h2 = int((y1 - y0 + 3) // 4 * 4)
    return w2, h2, (int(ax - x0), int(ay - y0)), top


# --------------------------------------------------------------------------- render one build

def render_harbor(spec, cache, samples=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    bc.setup_lighting()
    res = spec['fn']() or {}
    if spec['work'] and not ('idle' in res and 'work' in res):
        raise SystemExit('%s: a build with work frames must return idle() and work(i)' % key)
    BR.parent_to_root(spec['yaw'])
    frames = BR.frames_for(spec, res)
    planes = planes_for(spec['ground'])
    tile = res.get('tile')
    if tile:
        bpy.context.view_layer.update()
        W, H_, anchor, top = tile_frame(tile, planes)
        tops = {frames[0][0]: int(round(top))}
    else:
        W, H_, anchor, tops = fit_frames_h(frames, spec['shadow'], planes)
    if spec['shadow']:
        add_catchers(spec)
    sc = bc.setup_render(W, H_, samples=samples or spec['samples'])
    if res.get('bounces'):
        sc.cycles.max_bounces = res['bounces']
    bc.setup_camera(W, H_, anchor)
    fpts, fdirs = {}, {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        BR.render_png(os.path.join(cache, name + '.png'))
        fpts[name], fdirs[name] = BR.markers(spec['yaw'])
    if frames[0][1]:
        frames[0][1]()
    bpy.context.view_layer.update()
    meta = {
        'build': key, 'kind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H_],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H_, 5)],
        'frames': [n for n, _ in frames], 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': tops, 'framePoints': fpts, 'frameDirs': fdirs,
        'sprites': res.get('sprites') or {key: {'frame': key}},
        'ground': spec['ground'] if isinstance(spec['ground'], str) else 'land+water',
        'waterZ': H.WATER_Z, 'waterPx': H.WATER_PX,
    }
    if spec['work']:
        meta['anims'] = {'work': {'frames': [n for n, _ in frames[1:]], 'fps': spec['fps'], 'repeat': -1}}
        if spec.get('anim_name'):
            meta['animAlias'] = spec['anim_name']
    if spec['fp'] is not None:
        meta['footprint'] = L.footprint_px(spec['fp'], spec['yaw'])
        meta['footprintM'] = list(spec['fp']) if spec['fp'][0] != 'r' else {'radius': spec['fp'][1]}
    if spec['front']:
        meta['front'] = spec['front']
    R = Matrix.Rotation(math.radians(spec['yaw']), 3, 'Z')
    fx = {n: BR.px(R @ Vector(p)) for n, p in (res.get('fx') or {}).items() if p is not None}
    if fx:
        meta['fxPoints'] = fx
    if tile:
        meta.update({'tileAxis': tile['axis'], 'segM': round(tile['seg'], 5),
                     'stepPx': [64, 32] if tile['axis'] == 'x' else [64, -32], 'rampM': tile['ramp'],
                     'openEnds': {'neg': bool(tile['ends'][0]), 'pos': bool(tile['ends'][1])},
                     'cuts': [list(c) for c in tile['cuts']]})
    meta.update(spec['extra'])
    meta.update(res.get('extra') or {})
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)  %.1fs' % (key, W, H_, anchor, len(frames), time.time() - t0),
          flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    if opts['list']:
        for k in keys:
            s = HA.HARBOR[k]
            print(k, s['kind'], s['atlas'], 'ground=%s' % (s['ground'] if isinstance(s['ground'], str) else 'split'),
                  'work=%d' % s['work'], ', '.join(s['sprites'] or [k]))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if not opts['force'] and BR.cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_harbor(HA.HARBOR[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
