"""
civ_render.py - render the v8 civic & incident set (docs/CONTRACT_V8.md section AB) into a raw frame cache.
civ_pack.py then makes assets/civic/ (atlases + manifest.json) and the previews.

  * plain builds (civ_assets.CIV, cutaway=False: ruins, rubble, signs, props, fence tiles) go through
    bld_render.render_build() UNCHANGED (camera / light / PPU / shadow catcher / frame fit / markers of the village
    buildings).  Builds that registered overlay animations (civ_lib.overlay: ruin smoke wisps) get those frames
    rendered afterwards in the same scene with every other object as HOLDOUT (so the overlay is correctly occluded
    and composites on top of the base frame at the same anchor).
  * cutaway builds (bank, police_station) -> render_cutaway(): one shared frame + anchor, one PNG per layer
    (floor, back, interior, front, shell_cut, shell), a ground-shadow pass and the overlay animations (vault door,
    cell door).  See civ_lib for the layer rules.
  * vehicles (civ_veh.VEH: excavator, dump_truck) go through veh_render.render_vehicle() UNCHANGED (they are
    registered into veh_models.VEH at run time) + civ_veh.write_extra_meta() (per-frame bucket points ...).

Every Cycles render uses 2 fixed threads (shared build machine) - bl_common.setup_render is wrapped at run time.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/civ_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
                                                       [--threads N] [--dirs SE,NE] [--anims dig] [--frames 0,2]
Re-run (your PC, Blender 4.2+):  blender -b -P tools/blender/civ_render.py -- [same args]
  * no keys -> everything not cached yet (resumable; frames are written as .tmp.png and renamed)
  * keys    -> build / vehicle keys, sprite keys (bank_shell -> bank), prefixes with a trailing * (ruin_*),
               or a zone name: civic, police, fire, ruins, demolition, moving, vehicles
Default cache: <tmp>/fv_cache/civic.  Deterministic: fixed seeds + sample counts.
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
import bld_render as BR  # noqa: E402   (read-only reuse)
import civ_lib as CL  # noqa: E402
import civ_assets as CA  # noqa: E402

THREADS = [2]
_orig_setup_render = bc.setup_render


def _setup_render_fixed(*a, **kw):
    sc = _orig_setup_render(*a, **kw)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = THREADS[0]
    return sc


bc.setup_render = _setup_render_fixed           # run-time wrap only (bl_common.py is not modified)


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'civic'), 'list': False,
            'dirs': None, 'anims': None, 'frames': None, 'nomask': False, 'threads': 2}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache', '--dirs', '--anims', '--frames', '--threads'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a in ('--samples', '--threads') else argv[i]
        elif a == '--list':
            opts['list'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def vehicles():
    try:
        import civ_veh as CV
        return CV.VEH
    except ImportError:
        return {}


def all_keys():
    return list(CA.CIV) + list(vehicles())


def groups():
    g = {}
    for k, s in CA.CIV.items():
        g.setdefault(s['extra'].get('zone', 'misc'), []).append(k)
    g['vehicles'] = list(vehicles())
    return g


def select(keys):
    allk = all_keys()
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
            hit = [n for n, s in CA.CIV.items() if k in (s['sprites'] or [n]) or k.startswith(n + '_')]
            if not hit:
                raise SystemExit('unknown key: ' + k)
            out += hit[:1]
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


# --------------------------------------------------------------------------- helpers

def scene_objs():
    return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o.name != 'ShadowCatcher'
            and not o.get('veh_cutter')]


def snapshot(objs):
    return {o.name: (o.hide_render, o.visible_camera, o.is_holdout, o.visible_shadow) for o in objs}


def restore(objs, snap):
    for o in objs:
        if o.name in snap:
            o.hide_render, o.visible_camera, o.is_holdout, o.visible_shadow = snap[o.name]


def render_png(path):
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)


def overlay_frames(key, name, n):
    return ['%s_%s_%d' % (key, name, i) for i in range(n)]


# --------------------------------------------------------------------------- plain builds (+ overlays)

def cached(key, cache):
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side):
        return False
    try:
        meta = json.load(open(side))
    except Exception:
        return False
    names = list(meta.get('frames', [])) + [f for ov in meta.get('overlays', {}).values() for f in ov['frames']]
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


def render_overlays(spec, cache, meta, samples):
    """After bld_render.render_build(): render every registered overlay with all other objects as holdout and the
    shadow catcher hidden; record them in the sidecar."""
    key = spec['key']
    objs = scene_objs()
    snap = snapshot(objs)
    cat = bpy.data.objects.get('ShadowCatcher')
    sc = bpy.context.scene
    sc.cycles.samples = samples or spec['samples']
    ovs = {}
    for name, ov in CL.OVERLAYS.items():
        mine = set(o.name for o in ov['objs'])
        names = overlay_frames(key, name, ov['frames'])
        for i, fn in enumerate(names):
            ov['set'](i)
            for o in objs:
                if o.get('civ_bounds'):
                    continue
                if o.name in mine:
                    o.hide_render = False
                    o.is_holdout = False
                else:
                    o.is_holdout = True
            if cat:
                cat.hide_render = True
            bpy.context.view_layer.update()
            render_png(os.path.join(cache, fn + '.png'))
        restore(objs, snap)
        if cat:
            cat.hide_render = False
        ovs[name] = dict({'frames': names, 'fps': ov['fps'], 'repeat': ov['repeat']}, **ov['extra'])
    meta['overlays'] = ovs
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def render_plain(spec, cache, samples=None):
    CL.reset()
    meta = BR.render_build(spec, cache, samples)
    meta['civKind'] = spec['kind']
    if spec.get('anim_name') and 'anims' in meta:
        meta['animAlias'] = spec['anim_name']
    if CL.OVERLAYS:
        t0 = time.time()
        meta = render_overlays(spec, cache, meta, samples)
        print('[%s] overlays %s  %.1fs' % (spec['key'], ', '.join(CL.OVERLAYS), time.time() - t0), flush=True)
    else:
        with open(os.path.join(cache, spec['key'] + '.json'), 'w') as f:
            json.dump(meta, f, indent=1)
    return meta


# --------------------------------------------------------------------------- cutaway builds

def draw_order():
    """Static inner layers + overlays inserted after the layer named in their extra.drawAfter
    ('interior' or 'behind' = after the interior / behind-characters slot, i.e. before / after 'front')."""
    order = list(CL.INNER_LAYERS)
    for name, ov in CL.OVERLAYS.items():
        after = ov['extra'].get('drawAfter', 'interior')
        idx = order.index('front') + (1 if after in ('behind', 'front') else 0)
        order.insert(idx, name)
    return order


def configure(objs, active, ground=False):
    """Visibility for one layer pass (see civ_lib doc): the active layer is seen; layers drawn EARLIER in the game's
    order become holdout (they cut what of the active layer lies behind them), layers drawn LATER are invisible to
    the camera but cast shadows; shells are hidden in the inner passes.  Semi-transparent glass is never used as a
    holdout (a 20 % glass holdout would punch a grey half-hole) - it is hidden instead."""
    order = draw_order()
    inner_active = active not in CL.SHELL_LAYERS
    for o in objs:
        if o.get('civ_bounds'):
            o.hide_render = True
            continue
        lay = o.get(CL.LAYER_PROP, 'interior')
        o.hide_render = False
        o.visible_camera = True
        o.is_holdout = False
        o.visible_shadow = o.get('_civ_shadow', True)
        if ground:                          # whole closed building casts, nothing seen
            o.visible_camera = False
            if lay == 'shell_cut':
                o.hide_render = True
            continue
        if lay == active:
            if inner_active and lay == 'back':
                o.visible_shadow = False
            continue
        if lay in CL.SHELL_LAYERS:
            o.hide_render = True
            continue
        if lay == 'back':
            o.visible_shadow = False        # bright dollhouse light: the far walls cast no shadow inside
        if not inner_active:
            o.is_holdout = True
        elif lay in CL.OVERLAYS and active not in CL.OVERLAYS:
            o.hide_render = True            # animated parts are not part of the static layers
        elif lay in CL.OVERLAYS:
            o.hide_render = True            # other overlays
        elif order.index(lay) < order.index(active):
            o.is_holdout = True
        else:
            o.visible_camera = False
        if o.is_holdout and o.get('civ_glass'):
            o.is_holdout = False
            o.hide_render = True


def render_cutaway(spec, cache, samples=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    CL.reset()
    bc.setup_lighting()
    res = spec['fn']() or {}
    root = BR.parent_to_root(spec['yaw'])
    objs = scene_objs()
    for o in objs:
        o['_civ_shadow'] = o.visible_shadow
        if CL.LAYER_PROP not in o.keys() and not o.get('civ_bounds'):
            print('WARNING %s: untagged object %s -> interior' % (key, o.name))
            o[CL.LAYER_PROP] = 'interior'
    # one frame for every layer + every overlay state
    fit = [('all', None)]
    for name, ov in CL.OVERLAYS.items():
        for i in range(ov['frames']):
            fit.append(('%s_%d' % (name, i), (lambda ov=ov, i=i: ov['set'](i))))
    W, H, anchor, tops = BR.fit_frames(fit, spec['shadow'])
    for ov in CL.OVERLAYS.values():
        ov['set'](0)
    cat = bc.add_shadow_catcher(size=spec['catcher'])
    sc = bc.setup_render(W, H, samples=samples or spec['samples'])
    bc.setup_camera(W, H, anchor)
    bpy.context.view_layer.update()
    pts, dirs = BR.markers(spec['yaw'])
    frames = []

    def shot(name, active, ground=False):
        configure(objs, active, ground)
        cat.hide_render = not ground
        bpy.context.view_layer.update()
        render_png(os.path.join(cache, name + '.png'))
        frames.append(name)
        print('[%s] %s  %.0fs' % (key, name, time.time() - t0), flush=True)

    shot('%s_ground' % key, None, ground=True)
    for lay in CL.INNER_LAYERS:
        if any(o.get(CL.LAYER_PROP) == lay for o in objs):
            shot('%s_%s' % (key, lay), lay)
    ovs = {}
    for name, ov in CL.OVERLAYS.items():
        names = overlay_frames(key, name, ov['frames'])
        for i, fn in enumerate(names):
            ov['set'](i)
            shot(fn, name)
            frames.pop()
        ov['set'](0)
        ovs[name] = dict({'frames': names, 'fps': ov['fps'], 'repeat': ov['repeat']}, **ov['extra'])
    for lay in CL.SHELL_LAYERS:
        if any(o.get(CL.LAYER_PROP) == lay for o in objs):
            shot('%s_%s' % (key, lay), lay)
    # shell silhouette top (bubbles) = topPx of the 'all' state
    R = Matrix.Rotation(math.radians(spec['yaw']), 3, 'Z')
    meta = {
        'build': key, 'kind': spec['kind'], 'civKind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)],
        'frames': frames, 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': {key: tops['all']}, 'framePoints': {key: pts}, 'frameDirs': {key: dirs},
        'cutaway': {'layers': [f[len(key) + 1:] for f in frames if not f.endswith('_ground')],
                    'ground': '%s_ground' % key},
        'overlays': ovs, 'sprites': {key: {'frame': key}},
    }
    if spec['fp'] is not None:
        meta['footprint'] = L.footprint_px(spec['fp'], spec['yaw'])
        meta['footprintM'] = list(spec['fp'])
    if spec['front']:
        meta['front'] = spec['front']
    fx = {n: BR.px(R @ Vector(p)) for n, p in (res.get('fx') or {}).items()}
    if fx:
        meta['fxPoints'] = fx
    meta.update(spec['extra'])
    meta.update(res.get('extra') or {})
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] cutaway %dx%d anchor %s  %d layers + %d overlay frames  %.1fs' % (
        key, W, H, anchor, len(frames), sum(len(v['frames']) for v in ovs.values()), time.time() - t0), flush=True)
    del root
    return meta


# --------------------------------------------------------------------------- main

def main():
    opts = parse(bc.script_args())
    THREADS[0] = max(1, opts['threads'])
    keys = select(opts['keys'])
    veh = vehicles()
    if opts['list']:
        for k in keys:
            if k in CA.CIV:
                s = CA.CIV[k]
                print(k, s['kind'], s['atlas'], 'zone=%s' % s['extra'].get('zone'),
                      'cutaway' if s['cutaway'] else '', ', '.join(s['sprites'] or [k]))
            else:
                print(k, 'vehicle', ', '.join('%s(%d)' % (a, n['frames']) for a, n in veh[k]['anims'].items()))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if k in veh:
            import civ_veh as CV
            CV.render(k, opts)
            continue
        spec = CA.CIV[k]
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        if spec['cutaway']:
            render_cutaway(spec, opts['cache'], opts['samples'])
        else:
            render_plain(spec, opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
