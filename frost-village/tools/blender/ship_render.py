"""
ship_render.py - render the v6 harbour ships + the seagull (docs/CONTRACT_V6.md section S) into a raw frame cache;
ship_pack.py then builds assets/ships/ (atlases + manifest.json) and the previews.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/ship_render.py -- [keys ...] [--force] [--samples N] [--cache DIR]
                                                         [--dirs S,SE] [--anims idle,move] [--parts base,anim,slot]
                                                         [--meta-only] [--list]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/ship_render.py -- [same args]

  * no keys      -> every ship, skipping frames that are already cached (resumable)
  * --force      -> re-render the selected frames even if cached
  * --dirs/--anims/--parts  render a subset (look-dev); meta.json is rewritten every run and says `complete`
  * --meta-only  -> only measure + write meta.json (frame size, anchor, points, deck visibility)
Default cache: <tmp>/fv_cache/ships/<key>/  (frames <name>.png + meta.json).  Frames are written as .tmp.png and
renamed, so an interrupted run resumes cleanly.  Deterministic: fixed seeds + fixed sample counts.

Frame names
  full mode (small boats, gull) : {anim}_{dir}_{i}                     complete pictures
  layered mode (big ships)      : base_{dir}                           the whole ship at rest
                                  {anim}_{dir}_{i}                     moving parts only (static ship = holdout)
                                  slot{k}_{dir}                        cargo_ship container stacks (pre-occluded)
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
import bld_boats as BB  # noqa: E402
import ship_lib as SL  # noqa: E402
import ship_models  # noqa: E402,F401  (registers the ships)
import ship_gull  # noqa: E402,F401   (registers the seagull)

BORDER_PAD = 10


def parse(argv):
    o = {'keys': [], 'force': False, 'samples': None, 'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'ships'),
         'dirs': None, 'anims': None, 'parts': None, 'list': False, 'meta_only': False}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            o['force'] = True
        elif a == '--list':
            o['list'] = True
        elif a == '--meta-only':
            o['meta_only'] = True
        elif a in ('--samples', '--cache', '--dirs', '--anims', '--parts'):
            i += 1
            o[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        else:
            o['keys'].append(a)
        i += 1
    return o


# --------------------------------------------------------------------------- scene

class Scene:
    def __init__(self, spec):
        self.spec = spec
        bc.reset_scene()
        L._CUSTOM.clear()
        bc.setup_lighting()
        B = spec['fn']()
        self.B = B
        grp = B['group']
        for o in list(bpy.context.scene.objects):
            if o is grp or o.parent is not None or o.type in ('CAMERA', 'LIGHT'):
                continue
            o.parent = grp
        self.water = BB.holdout_water() if spec['water'] else None
        self.layers = {k: SL.mesh_objs(v) for k, v in (B.get('layers') or {}).items()}
        self.slots = [SL.mesh_objs(s) for s in (B.get('slots') or [])]
        anim_set = set()
        for v in self.layers.values():
            anim_set |= set(v)
        for s in self.slots:
            anim_set |= set(s)
        self.static = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and o is not self.water
                       and o not in anim_set]
        self.layered = spec['mode'] == 'layered'
        bpy.context.view_layer.update()

    # ---- states
    def orient(self, d):
        g = self.B['group']
        g.location = (0, 0, 0)
        g.rotation_euler = (0.0, 0.0, bc.yaw_for_dir(d))

    def all_anim_objs(self):
        out = []
        for v in self.layers.values():
            out += v
        for s in self.slots:
            out += s
        return out

    def state_base(self, d):
        """Layered: static ship only.  Full: rest pose = first anim frame 0."""
        self.orient(d)
        if self.layered:
            SL.set_visible(self.all_anim_objs(), False)
            SL.set_visible(self.static, True)
            SL.set_holdout(self.static, False)
            rest = self.B.get('rest')
            if rest:
                rest(self.B)
        else:
            first = list(self.spec['anims'])[0]
            self.B['pose'](self.B, first, 0, self.spec['anims'][first]['frames'])
        bpy.context.view_layer.update()

    def state_anim(self, d, anim, i):
        """Returns the objects that must be visible + not holdout (the border objects)."""
        self.orient(d)
        a = self.spec['anims'][anim]
        if self.layered:
            show = []
            for ln in a.get('layers', []):
                show += self.layers.get(ln, [])
            SL.set_visible(self.all_anim_objs(), False)
            SL.set_visible(self.static, True)
            SL.set_holdout(self.static, True)
            SL.set_visible(show, True)
            SL.set_holdout(show, False)
            self.B['pose'](self.B, anim, i, a['frames'])
            # pose() may toggle visibility of its own parts (e.g. smoke.show) - keep only this anim's layers on
            for ln, objs in self.layers.items():
                if ln not in a.get('layers', []):
                    SL.set_visible(objs, False)
            bpy.context.view_layer.update()
            return [o for o in show if not o.hide_render]
        self.B['pose'](self.B, anim, i, a['frames'])
        bpy.context.view_layer.update()
        return [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and not o.hide_render
                and o is not self.water]

    def state_slot(self, d, k):
        self.orient(d)
        SL.set_visible(self.all_anim_objs(), False)
        SL.set_visible(self.static, True)
        SL.set_holdout(self.static, True)
        SL.set_visible(self.slots[k], True)
        SL.set_holdout(self.slots[k], False)
        bpy.context.view_layer.update()
        return list(self.slots[k])

    def reset_holdout(self):
        SL.set_holdout(self.static + self.all_anim_objs(), False)


def anim_dirs(spec, anim):
    return spec['anims'][anim].get('dirs') or spec['dirs']


def frame_list(spec, sc):
    """[(name, kind, args)] every frame of a ship."""
    out = []
    if spec['mode'] == 'layered':
        for d in spec['dirs']:
            out.append(('base_%s' % d, 'base', (d,)))
        for k in range(len(sc.slots) if sc else len(spec.get('slots_n', []) or [])):
            for d in spec['dirs']:
                out.append(('slot%d_%s' % (k, d), 'slot', (d, k)))
    for anim, a in spec['anims'].items():
        for d in anim_dirs(spec, anim):
            for i in range(a['frames']):
                out.append(('%s_%s_%d' % (anim, d, i), 'anim', (d, anim, i)))
    return out


def project(objs, zmin=-0.02):
    xs, ys = [], []
    for p in L.world_points(objs):
        if p.z < zmin:
            continue
        x, y = L.screen_xy(p)
        xs.append(x)
        ys.append(y)
    return xs, ys


def measure(sc):
    """Union screen bbox (px offsets from the origin) over every frame of every dir."""
    spec = sc.spec
    X, Y = [], []
    for name, kind, args in frame_list(spec, sc):
        if kind == 'base':
            sc.state_base(*args)
            objs = sc.static if sc.layered else None
        elif kind == 'slot':
            objs = sc.state_slot(*args)
        else:
            objs = sc.state_anim(*args)
        if objs is None:
            objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and not o.hide_render
                    and o is not sc.water]
        xs, ys = project(objs)
        if xs:
            X += [min(xs), max(xs)]
            Y += [min(ys), max(ys)]
    sc.reset_holdout()
    return min(X), max(X), min(Y), max(Y)


def set_border(sc_render, objs, W, H, anchor):
    xs, ys = project(objs)
    if not xs:
        sc_render.render.use_border = False
        return
    x0 = max(0, int(math.floor(min(xs) + anchor[0])) - BORDER_PAD)
    x1 = min(W, int(math.ceil(max(xs) + anchor[0])) + BORDER_PAD)
    y0 = max(0, int(math.floor(min(ys) + anchor[1])) - BORDER_PAD)
    y1 = min(H, int(math.ceil(max(ys) + anchor[1])) + BORDER_PAD)
    r = sc_render.render
    r.use_border = True
    r.use_crop_to_border = False
    r.border_min_x = x0 / float(W)
    r.border_max_x = x1 / float(W)
    r.border_min_y = 1.0 - y1 / float(H)
    r.border_max_y = 1.0 - y0 / float(H)


def to_px(p, anchor):
    x, y = L.screen_xy(p)
    return [int(round(x)), int(round(y))]


def world(B, v):
    return B['group'].matrix_world @ Vector(v)


def points_meta(sc, anchor):
    """Per-dir px offsets of every named point (rest pose) + visibility-filtered deck / cargo spots."""
    spec, B = sc.spec, sc.B
    P = B.get('points') or {}
    out = {}
    vis_tables = {}
    for d in spec['dirs']:
        sc.state_base(d)
        if sc.water:
            SL.set_visible([sc.water], False)
        bpy.context.view_layer.update()
        for name, v in P.items():
            if name.startswith('_'):
                continue
            if isinstance(v, dict):
                out.setdefault(name, {})[d] = {k: to_px(world(B, q), anchor) for k, q in v.items()}
            elif isinstance(v, (list, tuple)) and v and isinstance(v[0], (Vector, tuple, list)) and \
                    not isinstance(v[0], (int, float)):
                pts = [world(B, q) for q in v]
                if name in ('deck', 'cargo'):
                    # keep spots where a standing townsperson (deck) / a 0.9 m stack (cargo) is >= 90% visible
                    keep, tab = [], []
                    for q, w in zip(v, pts):
                        f = SL.visible_fraction(w, None if name == 'deck' else SL.stack_samples(w))
                        tab.append([round(q[0], 2), round(q[1], 2), round(q[2], 2), round(f, 3)])
                        if name == 'cargo' or f >= 0.9:
                            keep.append((w, f))
                    keep.sort(key=lambda t: BB.cam_depth(t[0]), reverse=True)        # far -> near
                    out.setdefault(name, {})[d] = [to_px(w, anchor) + ([round(f, 2)] if name == 'cargo' else [])
                                                   for w, f in keep]
                    vis_tables.setdefault(name, {})[d] = tab
                else:
                    out.setdefault(name, {})[d] = [to_px(w, anchor) for w in pts]
            else:
                out.setdefault(name, {})[d] = to_px(world(B, v), anchor)
        if sc.water:
            SL.set_visible([sc.water], True)
        # cargo slot draw order (far -> near)
        if sc.slots and B.get('slot_centres'):
            cen = [world(B, c) for c in B['slot_centres']]
            order = sorted(range(len(cen)), key=lambda k: BB.cam_depth(cen[k]), reverse=True)
            out.setdefault('slotOrder', {})[d] = order
            out.setdefault('slotPoints', {})[d] = [to_px(c, anchor) for c in cen]
    return out, vis_tables


# --------------------------------------------------------------------------- render one ship

def render_ship(key, opts):
    spec = SL.SHIPS[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    sc = Scene(spec)
    x0, x1, y0, y1 = measure(sc)
    m = spec['margin'] + 2
    W = int(math.ceil(x1) - math.floor(x0)) + 2 * m
    H = int(math.ceil(y1) - math.floor(y0)) + 2 * m
    W += W % 2
    H += H % 2
    anchor = (int(-math.floor(x0)) + m, int(-math.floor(y0)) + m)
    print('[%s] frame %dx%d anchor %s (content x %.0f..%.0f y %.0f..%.0f)' % (key, W, H, anchor, x0, x1, y0, y1),
          flush=True)
    frames = frame_list(spec, sc)
    sel_dirs = set(opts['dirs'].split(',')) if opts.get('dirs') else None
    sel_anims = set(opts['anims'].split(',')) if opts.get('anims') else None
    sel_parts = set(opts['parts'].split(',')) if opts.get('parts') else None
    todo = []
    for name, kind, args in frames:
        d = args[0]
        if sel_dirs and d not in sel_dirs:
            continue
        if sel_parts and kind not in sel_parts:
            continue
        if sel_anims and kind == 'anim' and args[1] not in sel_anims:
            continue
        if sel_anims and kind != 'anim' and not sel_parts:
            continue
        path = os.path.join(out, name + '.png')
        if opts['force'] or not os.path.exists(path):
            todo.append((name, kind, args, path))
    rsc = None
    if not opts['meta_only'] and todo:
        rsc = BB.setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
        print('[%s] %d frames to render' % (key, len(todo)), flush=True)
    for k, (name, kind, args, path) in enumerate([] if opts['meta_only'] else todo):
        t1 = time.time()
        if kind == 'base':
            sc.state_base(*args)
            border = sc.static if sc.layered else None
        elif kind == 'slot':
            border = sc.state_slot(*args)
        else:
            border = sc.state_anim(*args)
        if border is None:
            border = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and not o.hide_render
                      and o is not sc.water]
        set_border(rsc, border, W, H, anchor)
        if 'rigs' in sc.B:
            for rig in sc.B['rigs']:
                rig.update_strings()
        tmp = path[:-4] + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        sc.reset_holdout()
        print('[%s] %d/%d %s  %.1fs (total %.0fs)' % (key, k + 1, len(todo), name, time.time() - t1,
                                                     time.time() - t0), flush=True)
    sc.reset_holdout()
    pts, vis = points_meta(sc, anchor)
    meta = {'key': key, 'kind': spec['kind'], 'mode': spec['mode'], 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / float(W), 5), round(anchor[1] / float(H), 5)], 'dirs': spec['dirs'],
            'mirror': spec['mirror'], 'anims': {a: {kk: vv for kk, vv in v.items()} for a, v in spec['anims'].items()},
            'lengthM': spec['lengthM'], 'beamM': spec['beamM'], 'notes': spec['notes'], 'points': pts,
            'visibility': vis, 'slots': len(sc.slots), 'frames': [f[0] for f in frames], 'extra': spec['extra']}
    meta['complete'] = all(os.path.exists(os.path.join(out, f[0] + '.png')) for f in frames)
    with open(os.path.join(out, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs (complete=%s)' % (key, time.time() - t0, meta['complete']), flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = opts['keys'] or list(SL.SHIPS)
    for k in keys:
        if k not in SL.SHIPS:
            raise SystemExit('unknown ship key %s (have: %s)' % (k, ', '.join(SL.SHIPS)))
    if opts['list']:
        for k in keys:
            s = SL.SHIPS[k]
            print(k, s['mode'], s['dirs'], ', '.join('%s(%d%s)' % (a, v['frames'], '' if not v.get('dirs') else
                                                                    ' ' + '/'.join(v['dirs']))
                                                    for a, v in s['anims'].items()))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        render_ship(k, opts)
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
