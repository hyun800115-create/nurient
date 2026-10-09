"""
bbld_render.py - render the beachfront buildings of "햇살 해변" (docs/CONTRACT_V7.md §X) into a raw frame cache:
one PNG per frame + one sidecar JSON per build.  bbld_pack.py then makes assets/beach_bld/ (atlases + manifest.json)
and the previews docs/previews/bbld_*.

Same camera / light / PPU / markers as the village, town and harbour buildings: bl_common + prop_lib + bld_render
(markers, parent_to_root, frames_for, fit_frames, render_png, cached) are imported READ-ONLY.  render_bbld() is a
copy-and-extend of bld_render.render_build() / harbor_render.render_harbor() with what the warm coast needs:
  * the builder runs inside bbld_lib.warm() (snow-free stand-ins for the shared snow helpers) and bbld_lib.YAW is set
    first, so camera-facing signs still face the camera on the yaw-90 `_x` variants;
  * any number of work frames (aquarium fish, arcade bulbs, string lights, bbq smoke);
  * GLOW pass  <key>_glow.png : every material registered with bbld_lib.night() (windows, lamps, neon, bulbs) plus
    the already-emissive ones glow, everything else is black, no lights -> bbld_pack makes the additive night overlay
    `<key>_glow` and the night frames (resort_hotel_night);
  * OVERLAY mask <key>_front_mask.png : white where an object tagged with bbld_lib.front() (balcony railings, a desk,
    a counter) is visible, black elsewhere -> bbld_pack makes `<key>_front` (drawn above characters standing behind
    those occluders: staffDepth / balconyPoints);
  * WATER frames <key>_water_<i>.png (hotel_pool): the pool water surface (animated ripples, seamless loop) is hidden
    in the idle frame and shown here -> bbld_pack cuts them to `waterPoly` = the `hotel_pool_water` fallback overlay;
  * ground: a z = 0 shadow catcher with optional rectangular holes (the pool opening).

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/bbld_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list] [--only glow]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/bbld_render.py -- [same args]

  * no keys -> render every build that is not cached yet (resumable)
  * keys    -> build keys (resort_hotel, beach_cafe_x ...), prefixes with a trailing * (beach_*), or an atlas / zone name
  * --force -> re-render even if cached
  * --only glow -> re-render only the night glow pass of the given builds (keeps their frames / masks)
Default cache: <tmp>/fv_cache/beach_bld.  Deterministic: fixed seeds + sample counts.
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
import bld_render as BR  # noqa: E402   (read-only reuse)
import bbld_lib as B  # noqa: E402
import bbld_assets as BB  # noqa: E402

GLOW_K = 0.5            # night() strengths are "scene" strengths; the glow pass renders emission alone


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'beach_bld'), 'list': False, 'only': None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache', '--only'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def select(keys):
    allk = list(BB.BBLD)
    if not keys:
        return allk
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        else:
            grp = [n for n, s in BB.BBLD.items() if k in (s['extra'].get('zone'), s['atlas'])]
            if not grp:
                raise SystemExit('unknown key: ' + k)
            out += grp
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


# --------------------------------------------------------------------------- catcher with holes

def add_catcher(size, holes=()):
    """z = 0 shadow catcher, size x size, minus axis-aligned rectangular holes (x0, x1, y0, y1) in world metres."""
    S = size / 2.0
    xs = sorted({-S, S} | {h[0] for h in holes} | {h[1] for h in holes})
    ys = sorted({-S, S} | {h[2] for h in holes} | {h[3] for h in holes})
    bm = bmesh.new()
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            cx, cy = (xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2
            if any(h[0] < cx < h[1] and h[2] < cy < h[3] for h in holes):
                continue
            vs = [bm.verts.new(p) for p in ((xs[i], ys[j], 0.0), (xs[i + 1], ys[j], 0.0),
                                            (xs[i + 1], ys[j + 1], 0.0), (xs[i], ys[j + 1], 0.0))]
            bm.faces.new(vs)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    me = bpy.data.meshes.new('ShadowCatcher')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('ShadowCatcher', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.is_shadow_catcher = True
    return ob


# --------------------------------------------------------------------------- passes

def _black():
    m = bpy.data.materials.new('GlowBlack')
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0, 0, 0, 1)
    p.inputs['Roughness'].default_value = 1.0
    p.inputs['Specular IOR Level'].default_value = 0.0
    return m


def _emit(name, rgb_lin, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*rgb_lin, 1.0)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def _mat_emission(m):
    """(linear rgb, strength) of an emissive Principled material, or None."""
    if not m or not m.use_nodes:
        return None
    p = m.node_tree.nodes.get('Principled BSDF')
    if not p:
        return None
    s = p.inputs['Emission Strength'].default_value
    if s <= 0.05:
        return None
    c = p.inputs['Emission Color'].default_value
    if max(c[0], c[1], c[2]) < 0.02:
        return None
    return (c[0], c[1], c[2]), s


_HEX = __import__('re').compile(r'([0-9A-Fa-f]{6})')


def _base_rgb(m):
    """Linear base colour of a material (its Principled base colour, else the hex in its name, else warm white).
    flat() albedos are pre-scaled by prop_lib.ALBEDO_K -> undo that so a sign glows in its palette colour."""
    if m is not None and m.use_nodes:
        p = m.node_tree.nodes.get('Principled BSDF')
        if p is not None and not p.inputs['Base Color'].is_linked:
            c = p.inputs['Base Color'].default_value
            k = 1.0 / getattr(L, 'ALBEDO_K', 1.0)
            return (min(1.0, c[0] * k), min(1.0, c[1] * k), min(1.0, c[2] * k))
    if m is not None:
        h = _HEX.search(m.name)
        if h:
            return bc.srgb_to_linear('#' + h.group(1))
    return bc.srgb_to_linear('#FFE6B0')


def _swap_materials(fn):
    """Replace every material slot of every visible mesh / curve via fn(material) -> material (objects already
    handled by the per-object glow are skipped)."""
    for o in bpy.context.scene.objects:
        if o.type not in ('MESH', 'CURVE') or o.name.startswith('ShadowCatcher') or o.get('_glow_done'):
            continue
        mats = o.data.materials
        for i in range(len(mats)):
            mats[i] = fn(mats[i])
        if o.type == 'MESH' and not len(mats):
            mats.append(fn(None))


def render_glow(path, samples=16):
    """Night glow pass (see module doc).  Returns True if anything glows."""
    sc = bpy.context.scene
    lit = {}
    for m, col, s in B.NIGHT:
        lit[m.name] = (bc.srgb_to_linear(L.C(col)), s * GLOW_K)
    black = _black()
    cache = {}
    any_lit = [False]

    def fn(m):
        if m is None:
            return black
        if m.name in lit:
            rgb, s = lit[m.name]
        else:
            e = _mat_emission(m)
            if not e:
                return black
            rgb, s = e[0], max(0.6, min(2.2, e[1])) * 0.55
        key = (m.name, s)
        if key not in cache:
            cache[key] = _emit('G_' + m.name, rgb, s)
        any_lit[0] = True
        return cache[key]
    # whole objects lit in their own colours (backlit signs, interiors seen through a window): per object, so a
    # shared material (a white flat()) glows only on these objects
    gob = {o.name: (col, s_, tint) for o, col, s_, tint in B.GLOWOBJ}

    def own(m, col, s_, tint):
        rgb = bc.srgb_to_linear(L.C(col)) if col else _base_rgb(m)
        if tint:
            rgb = tuple(c * t for c, t in zip(rgb, tint))
        key = ('own', m.name if m else '-', col, s_, tint)
        if key not in cache:
            cache[key] = _emit('GO_%d' % len(cache), rgb, s_)
        any_lit[0] = True
        return cache[key]
    for o in bpy.context.scene.objects:
        if o.name in gob and o.type in ('MESH', 'CURVE'):
            col, s_, tint = gob[o.name]
            mats = o.data.materials
            for i in range(len(mats)):
                mats[i] = own(mats[i], col, s_, tint)
            if o.type == 'MESH' and not len(mats):
                mats.append(own(None, col or '#FFE6B0', s_, tint))
            o['_glow_done'] = 1
    _swap_materials(fn)
    for o in sc.objects:
        if o.type == 'LIGHT' or o.name.startswith('ShadowCatcher'):
            o.hide_render = True
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    if any_lit[0]:
        BR.render_png(path)
    return any_lit[0]


def render_front_mask(path, samples=12):
    """White where a front()-tagged object is visible, black for every other surface (they still occlude)."""
    sc = bpy.context.scene
    tagged = set(o.name for o in B.FRONT)
    white = _emit('MaskW', (1.0, 1.0, 1.0), 1.0)
    blackm = _emit('MaskB', (0.0, 0.0, 0.0), 0.0)
    for o in sc.objects:
        if o.type not in ('MESH', 'CURVE') or o.name.startswith('ShadowCatcher'):
            continue
        m = white if o.name in tagged else blackm
        o.data.materials.clear()
        o.data.materials.append(m)
        if o.type == 'MESH':
            for p in o.data.polygons:
                p.material_index = 0
    for o in sc.objects:
        if o.type == 'LIGHT' or o.name.startswith('ShadowCatcher'):
            o.hide_render = True
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    BR.render_png(path)


# --------------------------------------------------------------------------- water polygon

def _clip(poly, a, b, keep_sign):
    """Sutherland-Hodgman: keep the part of poly on the keep_sign side of the line a->b (2D)."""
    def side(p):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    out = []
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        sp, sq = side(p) * keep_sign, side(q) * keep_sign
        if sp >= 0:
            out.append(p)
        if (sp >= 0) != (sq >= 0):
            t = sp / (sp - sq)
            out.append((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t))
    return out


def water_poly(rect, zw, yaw):
    """Visible screen polygon of a rectangular pool water surface (x0, x1, y0, y1) at height zw below a deck at z 0:
    the far edges (+Y, -X) at water level, clipped by the deck-level lines of the near edges (-Y, +X) whose coping
    hides the strip of water right below them.  Returns (visible px polygon, water-level px rectangle)."""
    R = Matrix.Rotation(math.radians(yaw), 3, 'Z')
    x0, x1, y0, y1 = rect

    def P(x, y, z):
        v = R @ Vector((x, y, z))
        X, Y = bc.world_to_pixel(tuple(v), 0, 0, (0.0, 0.0))
        return (X, Y)
    wl = [P(x0, y0, zw), P(x1, y0, zw), P(x1, y1, zw), P(x0, y1, zw)]
    poly = list(wl)
    centre = P((x0 + x1) / 2, (y0 + y1) / 2, zw)
    # deck-level edges: the near ones occlude; clip keeping the side that contains the centre of the water
    for (ax, ay), (bx, by) in (((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))):
        a, b = P(ax, ay, 0.0), P(bx, by, 0.0)
        s = (b[0] - a[0]) * (centre[1] - a[1]) - (b[1] - a[1]) * (centre[0] - a[0])
        poly = _clip(poly, a, b, 1 if s > 0 else -1)
    return [[int(round(x)), int(round(y))] for x, y in poly], [[int(round(x)), int(round(y))] for x, y in wl]


def rebuild(spec, W, H_, anchor, samples):
    """Fresh scene of the build's idle state (same camera / catcher) for the next destructive pass."""
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    B.reset()
    B.YAW = spec['yaw']
    bc.setup_lighting()
    with B.warm():
        res = spec['fn']() or {}
    B.sweep_snow()
    if res.get('water'):
        for o in res['water']['objs']:
            o.hide_render = True
            o.hide_viewport = True
    BR.parent_to_root(spec['yaw'])
    fr = BR.frames_for(spec, res)
    if fr[0][1]:
        fr[0][1]()
    if spec['shadow']:
        add_catcher(spec['catcher'], _holes(spec, res))
    bc.setup_render(W, H_, samples=samples or spec['samples'])
    bc.setup_camera(W, H_, anchor)
    bpy.context.view_layer.update()
    return res


def _holes(spec, res):
    R = Matrix.Rotation(math.radians(spec['yaw']), 3, 'Z')
    hw = []
    for (x0, x1, y0, y1) in res.get('holes') or ():
        c = [R @ Vector(p) for p in ((x0, y0, 0), (x1, y1, 0))]
        hw.append((min(c[0].x, c[1].x), max(c[0].x, c[1].x), min(c[0].y, c[1].y), max(c[0].y, c[1].y)))
    return hw


# --------------------------------------------------------------------------- render one build

def render_bbld(spec, cache, samples=None, only=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    B.reset()
    B.YAW = spec['yaw']
    bc.setup_lighting()
    with B.warm():
        res = spec['fn']() or {}
    swept = B.sweep_snow()
    if swept:
        print('[%s] swept %d snow mesh(es)' % (key, swept))
    if spec['work'] and not ('idle' in res and 'work' in res):
        raise SystemExit('%s: a build with work frames must return idle() and work(i)' % key)
    water = res.get('water')
    if water:
        for o in water['objs']:
            o.hide_render = True
            o.hide_viewport = True
    BR.parent_to_root(spec['yaw'])
    frames = BR.frames_for(spec, res)
    W, H_, anchor, tops = BR.fit_frames(frames, spec['shadow'])
    if spec['shadow']:
        add_catcher(spec['catcher'], _holes(spec, res))
    sc = bc.setup_render(W, H_, samples=samples or spec['samples'])
    bc.setup_camera(W, H_, anchor)
    fpts, fdirs = {}, {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        if only in (None, 'frames'):
            BR.render_png(os.path.join(cache, name + '.png'))
        fpts[name], fdirs[name] = BR.markers(spec['yaw'])
    if frames[0][1]:
        frames[0][1]()
    bpy.context.view_layer.update()
    meta = {
        'build': key, 'kind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H_],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H_, 5)],
        'frames': [n for n, _ in frames], 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': tops, 'framePoints': fpts, 'frameDirs': fdirs, 'lightMeta': [list(x) for x in B.LIGHTS],
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
    meta.update(spec['extra'])
    meta.update(res.get('extra') or {})
    # ---- water frames (pool): show the surface, animate the ripple phase
    if water:
        vis, wl = water_poly(water['rect'], water['z'], spec['yaw'])
        names = []
        for o in water['objs']:
            o.hide_render = False
            o.hide_viewport = False
        for i in range(water['frames']):
            water['set'](i)
            bpy.context.view_layer.update()
            n = '%s_water_%d' % (key, i)
            if only in (None, 'frames', 'water'):
                BR.render_png(os.path.join(cache, n + '.png'))
            names.append(n)
        for o in water['objs']:
            o.hide_render = True
        meta['water'] = {'frames': names, 'fps': water.get('fps', 6), 'poly': vis, 'rectWater': wl,
                         'z': water['z'], 'rectM': list(water['rect'])}
    # ---- destructive passes (they replace materials): tag mask, plane mask, glow - each on a freshly built scene
    passes = []
    if B.FRONT and res.get('overlay', True):
        passes.append('tags')
    if res.get('overlay_plane'):
        passes.append('plane')
    if res.get('glow', True):
        passes.append('glow')
    first = True
    masks = []
    for ps in passes:
        if not first:
            rebuild(spec, W, H_, anchor, samples)
        first = False
        if ps == 'tags':
            n = '%s_front_mask' % key
            if only in (None, 'frames', 'masks'):
                render_front_mask(os.path.join(cache, n + '.png'))
            masks.append({'mask': n, 'kind': 'tags'})
        elif ps == 'plane':
            st = [em for kind, em, _ in BA.MARKERS if kind == 'staff']
            c = st[0].matrix_world.translation.copy()
            n = '%s_front_mask2' % key
            if only in (None, 'frames', 'masks'):
                BR.render_overlay_mask(c, os.path.join(cache, n + '.png'))
            masks.append({'mask': n, 'kind': 'plane', 'staff': 0})
        else:
            glow = '%s_glow' % key
            if render_glow(os.path.join(cache, glow + '.png')):
                meta['glow'] = glow
    if masks:
        meta['overlay'] = {'key': '%s_front' % key, 'masks': masks, 'of': frames[0][0]}
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)%s%s%s  %.1fs' % (key, W, H_, anchor, len(frames),
                                                         ' +water' if water else '',
                                                         ' +overlay' if meta.get('overlay') else '',
                                                         ' +glow' if meta.get('glow') else '', time.time() - t0),
          flush=True)
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
        names += [m['mask'] for m in meta['overlay']['masks']]
    if meta.get('glow'):
        names.append(meta['glow'])
    if meta.get('water'):
        names += meta['water']['frames']
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    if opts['list']:
        for k in keys:
            s = BB.BBLD[k]
            print(k, s['kind'], s['atlas'], 'yaw=%g' % s['yaw'], 'work=%d' % s['work'])
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_bbld(BB.BBLD[k], opts['cache'], opts['samples'], opts['only'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
