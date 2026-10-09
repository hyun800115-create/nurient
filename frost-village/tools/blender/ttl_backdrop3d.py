"""
ttl_backdrop3d.py - the 3D parts of the title backdrop (Blender, Cycles): seamless horizontal strips
of snowy mountains and a pine-forest ridge, rendered with the game's soft toy look.

    /tmp/bvenv/bin/python tools/blender/ttl_backdrop3d.py -- --out DIR [--layers mtn_far,mtn_mid,forest]
                                                           [--samples 24] [--pct 100] [--threads 2]

Each strip is a heightfield that repeats every P metres in x; three periods are built (so shadows
and occlusion at the seams are right) and an orthographic camera exactly one period wide renders
the middle one -> DIR/bd_<layer>.png tiles left/right without a seam.  The forest uses the game's
own pine (prop_assets.pine, the tree_pine_* sprites) as linked duplicates.  Painted in DAY colours;
the title tints them for dusk / night (ttl_backdrop.py writes the tint table into the manifest).
"""
import argparse
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                       # noqa: E402
import numpy as np               # noqa: E402
from mathutils import Vector     # noqa: E402

import ttl_lib as T              # noqa: E402

# strip specs: period (m), grid step (m), output width px, camera pitch (deg), solid bottom fraction
LAYERS = {
    # far range: tall, asymmetric, double summits; blue-grey rock band under a ragged snowline, snow
    # held in the gullies that follow the ridges; a low key sun from the upper left
    'mtn_far': dict(P=64.0, step=0.25, W=1080, pitch=4.0, seed=3, kind='mtn', Hmax=19.0, depth=36.0,
                    peaks=5, rows=2, snowline=0.50, rock='#7C8DB5', snow_col='#F6F8FF', ridged=0.06, dome=1.05,
                    rock_amt=1.0, spurs=0.11),
    # nearer: low, round snowy hills dotted with pines (the far city peeks over them at the city stage)
    'mtn_mid': dict(P=44.0, step=0.20, W=1080, pitch=6.0, seed=8, kind='mtn', Hmax=7.0, depth=24.0,
                    peaks=4, rows=2, snowline=0.18, rock='#8A97BE', snow_col='#F4F7FF', ridged=0.04, spurs=0.04,
                    dome=0.62, rock_amt=0.30, trees=44, tree_max=0.80, tree_scale=0.55),
    'forest': dict(P=30.0, step=0.16, W=1440, pitch=7.0, seed=5, kind='forest', Hmax=3.2, depth=16.0,
                   trees=46, snow_col='#FAFCFF', shadow='#C3D3EE'),
    'clouds': dict(P=48.0, W=1440, pitch=0.0, seed=12, kind='clouds', count=6),
    # the far city across the bay (final city stage): the game's own retro buildings
    'city': dict(P=50.0, W=1080, pitch=9.0, seed=21, kind='city'),
}


def wrap(dx, P):
    return (dx + P / 2.0) % P - P / 2.0


def blur2d(Z, sigma):
    """Separable gaussian blur in numpy (bpy's python has no scipy)."""
    r = int(math.ceil(sigma * 3))
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma * sigma))
    k /= k.sum()
    P = np.pad(Z, r, mode='edge')
    P = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, P)
    P = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, P)
    return P


def periodic_noise(X, Y, P, cells_x, cell_y, seed):
    """Smooth value noise, periodic in x with period P (cells_x cells per period), 0..1."""
    rnd = np.random.default_rng(seed)
    ny = int(np.ceil((Y.max() - Y.min()) / cell_y)) + 3
    R = rnd.random((ny, cells_x))
    fx = (X / P * cells_x) % cells_x
    fy = (Y - Y.min()) / cell_y
    x0 = np.floor(fx).astype(int)
    y0 = np.floor(fy).astype(int)
    tx = fx - x0
    ty = fy - y0
    tx = tx * tx * (3 - 2 * tx)
    ty = ty * ty * (3 - 2 * ty)
    x1 = (x0 + 1) % cells_x
    y1 = np.minimum(y0 + 1, ny - 1)
    a = R[y0, x0] * (1 - tx) + R[y0, x1] * tx
    b = R[y1, x0] * (1 - tx) + R[y1, x1] * tx
    return a * (1 - ty) + b * ty


def heights(spec, X, Y):
    rnd = random.Random(spec['seed'])
    P = spec['P']
    Z = np.zeros_like(X)
    if spec['kind'] == 'mtn':
        # stylised peaks: rotated diamond pyramids (crisp ridges) with the apex pushed to one side
        # (asymmetric flanks), some with a second summit, merged with a soft max
        n = spec['peaks']
        dome = spec.get('dome', 1.12)
        for r in range(spec['rows']):
            back = r / max(1, spec['rows'] - 1)                  # 0 front row .. 1 back row
            for i in range(n):
                x0 = (i + rnd.uniform(-0.3, 0.3) + 0.5 * r) * P / n
                y0 = spec['depth'] * (0.30 + 0.45 * back) + rnd.uniform(-2, 2)
                hero = rnd.random() < 0.40
                H = spec['Hmax'] * ((0.66 if hero else 0.42) + 0.28 * back + rnd.uniform(-0.08, 0.12))
                Rl = H * rnd.uniform(0.85, 1.9)                    # asymmetric left / right flanks
                Rr = H * rnd.uniform(0.85, 1.9)
                Ry = H * rnd.uniform(0.85, 1.25)
                ang = math.radians(rnd.uniform(-35, 35))
                dx = wrap(X - x0, P)
                dy = Y - y0
                u = dx * math.cos(ang) + dy * math.sin(ang)
                v = -dx * math.sin(ang) + dy * math.cos(ang)
                Rx = np.where(u < 0, Rl, Rr)
                pyr = np.clip(1.0 - (np.abs(u) / Rx + np.abs(v) / Ry), 0, 1)
                pk = H * pyr ** dome
                # ridges + gullies RADIATING from the summit (they follow the slope like real spurs)
                th = np.arctan2(v / Ry, u / Rx)
                m_ = rnd.choice((7, 9, 11))
                ph_ = rnd.uniform(0, math.tau)
                spur = (1.0 - np.abs(np.sin(m_ * th / 2.0 + ph_))) ** 3.5
                spur2 = (1.0 - np.abs(np.sin(2 * m_ * th / 2.0 + ph_ * 1.7))) ** 3
                prof = np.clip(pyr * 3.0, 0, 1) * np.clip((1 - pyr) * 2.2, 0, 1)   # not at the tip / foot
                pk = pk + spec.get('spurs', 0.10) * H * (0.75 * spur + 0.35 * spur2 - 0.45) * prof
                # a second summit / shoulder on one flank
                if hero or rnd.random() < 0.45:
                    side = rnd.choice((-1, 1))
                    sx = x0 + side * H * rnd.uniform(0.45, 0.85)
                    H2 = H * rnd.uniform(0.62, 0.86)
                    d2x = wrap(X - sx, P)
                    pyr2 = np.clip(1.0 - (np.abs(d2x) / (H2 * rnd.uniform(0.9, 1.3)) +
                                          np.abs(Y - y0 + 0.8) / (H2 * 1.0)), 0, 1)
                    pk = np.maximum(pk, H2 * pyr2 ** dome)
                Z = np.log(np.exp(Z / 0.6) + np.exp(pk / 0.6)) * 0.6       # soft max
        Z -= Z.min()
        # ridged noise carves secondary ridges + gullies running down the faces (follows the slopes,
        # strongest high up) - no vertical texture streaks
        rg = np.zeros_like(Z)
        for k, (cx, cy, amp) in enumerate(((10, 5.0, 1.0), (22, 2.4, 0.5), (46, 1.2, 0.25))):
            nz = periodic_noise(X, Y, P, cx, cy, spec['seed'] * 31 + k)
            rg += amp * (1.0 - np.abs(2.0 * nz - 1.0)) ** 2
        rg /= 1.75
        Z += spec.get('ridged', 0.15) * spec['Hmax'] * (rg - 0.35) * np.clip(Z / spec['Hmax'], 0.0, 1.0) ** 0.7
        Z = np.maximum(Z, 0.0)
        Z = blur2d(Z, 0.8)
    else:
        for k, amp in ((1, 0.9), (2, 0.6), (3, 0.45), (5, 0.25), (9, 0.12)):
            ph = rnd.uniform(0, math.tau)
            Z += amp * np.sin(k * math.tau * X / P + ph) * np.clip(Y / spec['depth'], 0, 1)
        Z = 0.6 + Z * 0.55 + np.clip(Y / spec['depth'], 0, 1) * spec['Hmax']
    return Z


def build_terrain(spec):
    P, st = spec['P'], spec['step']
    xs = np.arange(-P, 2 * P + st * 0.5, st)
    ys = np.arange(-6.0, spec['depth'] + st * 0.5, st)
    X, Y = np.meshgrid(xs, ys)
    Z = heights(spec, X, Y)
    ny, nx = Z.shape
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    idx = np.arange(nx * ny).reshape(ny, nx)
    a = idx[:-1, :-1].ravel()
    b = idx[:-1, 1:].ravel()
    c = idx[1:, 1:].ravel()
    d = idx[1:, :-1].ravel()
    faces = np.stack([a, b, c, d], axis=1)
    me = bpy.data.meshes.new('terrain')
    me.vertices.add(len(verts))
    me.vertices.foreach_set('co', verts.astype(np.float32).ravel())
    me.loops.add(len(faces) * 4)
    me.loops.foreach_set('vertex_index', faces.astype(np.int32).ravel())
    me.polygons.add(len(faces))
    me.polygons.foreach_set('loop_start', (np.arange(len(faces)) * 4).astype(np.int32))
    me.polygons.foreach_set('loop_total', np.full(len(faces), 4, np.int32))
    me.update(calc_edges=True)
    me.validate()
    me.polygons.foreach_set('use_smooth', np.ones(len(faces), bool))
    # snow / rock colour per vertex: a blue-grey rock band under a RAGGED snowline; above it rock only
    # on steep convex ridges; snow always lies in the concave gullies (they follow the ridges)
    gy, gx = np.gradient(Z, st)
    slope = np.sqrt(gx * gx + gy * gy)
    lap = np.gradient(gx, st, axis=1) + np.gradient(gy, st, axis=0)       # > 0 = gully, < 0 = ridge
    lap = blur2d(lap, 1.2)
    if spec['kind'] == 'mtn':
        H = spec['Hmax']
        rag = 0.6 * periodic_noise(X, Y, spec['P'], 9, 6.0, spec['seed'] * 7 + 5) + \
            0.4 * periodic_noise(X, Y, spec['P'], 23, 2.5, spec['seed'] * 7 + 6)
        line = H * (spec.get('snowline', 0.5) + 0.26 * (rag - 0.5))
        below = np.clip((line - Z) / (0.10 * H) + 0.5, 0, 1)                # under the snowline
        ridge = np.clip(-lap * 1.6 + 0.35, 0, 1)                            # convex -> rock shows
        gully = np.clip(lap * 2.2, 0, 1)                                    # concave -> snow
        steep = np.clip((slope - 1.05) * 1.2, 0, 1)
        # under the snowline: rock on the spurs AND faces, snow tongues only down the gullies; above it
        # a little rock on the steepest crests
        rock = np.clip(below * (0.70 + 0.30 * ridge) * (1 - gully * 0.90) + steep * ridge * 0.25, 0, 1)
        rock *= np.clip(Z / (0.06 * H), 0, 1)                               # the snowy foot stays white
        rock = np.clip(blur2d(rock, 1.2) * 1.15 * spec.get('rock_amt', 1.0), 0, 1)
    else:
        rock = np.zeros_like(Z)
    col = np.zeros((ny * nx, 4), np.float32)
    s = np.array(T.lin(spec['snow_col']), np.float32)
    rk = np.array(T.lin(spec.get('rock', '#7A86A8')), np.float32)
    r1 = rock.ravel()[:, None]
    col[:, :3] = s * (1 - r1) + rk * r1
    col[:, 3] = 1.0
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', col.ravel())
    ob = bpy.data.objects.new('terrain', me)
    T.link(ob)
    m = bpy.data.materials.new('terrain_m')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = 'Col'
    nt.links.new(at.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.70
    p.inputs['Subsurface Weight'].default_value = 0.08
    p.inputs['Subsurface Radius'].default_value = (0.5, 0.7, 1.0)
    p.inputs['Subsurface Scale'].default_value = 0.2
    p.inputs['Coat Weight'].default_value = 0.05
    me.materials.append(m)
    return ob, (X, Y, Z)


def build_clouds(spec):
    """Puffy toy clouds (metaballs, soft white with SSS) along one period, copied at x - P and x + P."""
    rnd = random.Random(spec['seed'])
    P = spec['P']
    m = bpy.data.materials.new('cloud_m')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*T.lin('#FFFFFF'), 1)
    p.inputs['Roughness'].default_value = 0.7
    p.inputs['Subsurface Weight'].default_value = 0.45
    p.inputs['Subsurface Radius'].default_value = (0.6, 0.75, 1.0)
    p.inputs['Subsurface Scale'].default_value = 0.6
    p.inputs['Coat Weight'].default_value = 0.1
    clouds = []
    n = spec['count']
    for i in range(n):
        cx = (i + rnd.uniform(-0.25, 0.25)) * P / n
        cz = rnd.uniform(0.0, 7.0)
        w = rnd.uniform(4.0, 8.0)
        balls = []
        k = int(5 + w)
        for j in range(k):
            t = 0.1 + 0.8 * j / (k - 1)
            r = (0.80 + 0.70 * math.sin(math.pi * t) + rnd.uniform(-0.10, 0.15)) * w / 6.0
            balls.append(((t - 0.5) * w, rnd.uniform(-0.4, 0.4), r * 0.62, r))
        # puffy tops
        for j in range(3):
            balls.append((rnd.uniform(-0.28, 0.22) * w, rnd.uniform(-0.3, 0.3), w * rnd.uniform(0.18, 0.26),
                          w * rnd.uniform(0.16, 0.23)))
        clouds.append((cx, cz, balls))
    for (cx, cz, balls) in clouds:
        for k_ in (-1, 0, 1):
            mb = bpy.data.metaballs.new('cloud')
            mb.resolution = 0.12
            mb.render_resolution = 0.06
            mb.threshold = 0.6
            for (bx, by, bz, r) in balls:
                el = mb.elements.new(type='BALL')
                el.co = (bx, by, bz)
                el.radius = r
                el.stiffness = 2.0
            # flat-ish underside: a wide squashed ellipsoid along the base
            el = mb.elements.new(type='ELLIPSOID')
            el.co = (0, 0, 0.15)
            el.radius = 1.0
            el.size_x = max(b[0] for b in balls) * 0.95
            el.size_y = 0.8
            el.size_z = 0.35
            el.stiffness = 2.0
            ob = bpy.data.objects.new('cloud', mb)
            ob.location = (cx + k_ * P, 10.0, cz)
            mb.materials.append(m)
            T.link(ob)
    bpy.context.view_layer.update()
    # bounds for the camera: every ball centre +- radius (+ a little air above and below)
    zs = [cz + bz + dz for (cx, cz, balls) in clouds for (bx, by, bz, r) in balls for dz in (-r, r)]
    return [Vector((P / 2.0, 10.0, min(zs) - 0.5)), Vector((P / 2.0, 10.0, max(zs) + 0.3))]


# ------------------------------------------------------------------ the far city (game models)
CITY_ROWS = [
    # back row (taller blocks, further away), then the front row placed in the back row's gaps;
    # (module, builder, yaw deg)
    [('town_assets', 'b_apartment_b', 0), ('town_assets', 'b_town_hall', 0), ('bbld_assets', 'b_resort_hotel', 0),
     ('town_assets', 'b_apartment_a', 90), ('town_assets', 'b_apartment_b', 90)],
    [('town_assets', 'b_townhouse_a', 0), ('harbor_assets', 'b_lighthouse', 0), ('town_assets', 'b_school', 0),
     ('harbor_assets', 'b_harbor_crane', 0), ('town_assets', 'b_fire_station', 0), ('town_assets', 'b_apartment_a', 0)],
]
CITY_ROW_DEPTH = [14.0, 0.0]          # metres away from the camera per row


def _new_objects(fn):
    before = set(bpy.data.objects)
    fn()
    return [o for o in bpy.data.objects if o not in before]


def _root_of(objs, name):
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    bpy.context.view_layer.update()
    for o in objs:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = mw
    return root


def _copy_tree(root, dx_vec):
    """Linked duplicate of a whole object tree (meshes shared), moved by dx_vec."""
    mp = {}
    for o in [root] + list(root.children_recursive):
        c = o.copy()
        bpy.context.scene.collection.objects.link(c)
        mp[o] = c
    for o, c in mp.items():
        if o.parent in mp:
            c.parent = mp[o.parent]
            c.matrix_parent_inverse = o.matrix_parent_inverse.copy()
    mp[root].location = root.location + dx_vec
    return mp[root]


def build_city(spec):
    """One period of the far city: the game's own retro buildings in a row along the camera's horizontal
    axis (seen from the game's side, yaw 45), each also copied one period left and right so shadows and
    occlusion at the seam are right.  Transparent background, no ground."""
    import importlib
    import bl_common as bc
    P = spec['P']
    right = Vector((0.7071, 0.7071, 0.0))          # screen right for a camera at yaw 45 (game view)
    away = Vector((-0.7071, 0.7071, 0.0))
    rnd = random.Random(spec['seed'])
    built = []
    n = 0
    for ri, row in enumerate(CITY_ROWS):
        items = []
        for (mod, fn, yaw) in row:
            M = importlib.import_module(mod)
            objs = _new_objects(getattr(M, fn))
            for o in objs:                               # interaction markers etc.
                if o.type == 'EMPTY' and o.name.startswith('MK_'):
                    o.hide_render = True
            root = _root_of(objs, 'city_%d' % n)
            n += 1
            root.rotation_euler = (0, 0, math.radians(yaw))
            bpy.context.view_layer.update()
            xs = []
            for o in [root] + list(root.children_recursive):
                if o.type == 'MESH' and not o.hide_render:
                    mw = o.matrix_world
                    for corner in o.bound_box:
                        xs.append((mw @ Vector(corner)).dot(right))
            if xs:
                items.append((root, min(xs), max(xs)))
        # a row never holds more than one period of houses (no two buildings in the same spot)
        while items and sum(b[2] - b[1] for b in items) + 0.6 * len(items) > P:
            dropped = items.pop()
            for o in [dropped[0]] + list(dropped[0].children_recursive):
                o.hide_render = True
        total = sum(b[2] - b[1] for b in items)
        gap = (P - total) / max(1, len(items))
        # the front row starts half a slot later so its houses stand in front of the back row's gaps
        pos = gap / 2 + (0.5 * (P / max(1, len(items))) if ri == 1 else 0.0)
        for (root, x0, x1) in items:
            w = x1 - x0
            target = (pos - x0 + rnd.uniform(-0.4, 0.4)) % P
            root.location = right * target + away * (CITY_ROW_DEPTH[ri] + rnd.uniform(-1.5, 1.5))
            pos += w + gap
            built.append((root, x0, x1, ri))
    bpy.context.view_layer.update()
    for (root, _a, _b, _d) in built:
        _copy_tree(root, right * P)
        _copy_tree(root, right * -P)
    # hide anything that only exists for the game's sprite pipeline (shadow catchers, ground pads)
    for o in bpy.context.scene.objects:
        if o.type == 'MESH' and getattr(o, 'is_shadow_catcher', False):
            o.hide_render = True
    return built


def city_camera(spec):
    """Ortho camera at the game's yaw (45), pitched `pitch` deg down; exactly one period wide."""
    P = spec['P']
    pitch = math.radians(spec['pitch'])
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = P
    cam = bpy.data.objects.new('cam', cd)
    cam.rotation_euler = (math.radians(90.0) - pitch, 0, math.radians(45.0))
    T.link(cam)
    bpy.context.scene.camera = cam
    right = Vector((0.7071, 0.7071, 0.0))
    fwd = Vector((-0.7071, 0.7071, 0.0))
    cam.location = right * (P / 2.0) - fwd * 150.0 + Vector((0, 0, 150.0 * math.tan(pitch)))
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    ys = []
    for o in bpy.context.scene.objects:
        if o.type != 'MESH' or o.hide_render:
            continue
        mw = o.matrix_world
        for corner in o.bound_box:
            q = inv @ (mw @ Vector(corner))
            if -P / 2 - 2 <= q.x <= P / 2 + 2:
                ys.append(q.y)
    top, bot = max(ys), min(ys)
    ppu = spec['W'] / P
    H = int(math.ceil((top - bot) * ppu + 8))
    H += H % 2
    cam.location = cam.matrix_world @ Vector((0, (top + bot) / 2.0, 0))
    return cam, spec['W'], H


def emission_only():
    """Every material without emission -> holdout; emissive (lit windows, lamps) kept: the window
    lights pass of the same render (ADD at night)."""
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        nt = m.node_tree
        lit = False
        for n in nt.nodes:
            if n.type == 'EMISSION' and n.inputs['Strength'].default_value > 0:
                lit = True
            if n.type == 'BSDF_PRINCIPLED':
                st = n.inputs['Emission Strength'].default_value
                col = n.inputs['Emission Color'].default_value
                if st > 0 and (col[0] + col[1] + col[2] > 0.05 or n.inputs['Emission Color'].is_linked):
                    lit = True
        if lit:
            continue
        out = None
        for n in nt.nodes:
            if n.type == 'OUTPUT_MATERIAL':
                out = n
        if out is None:
            continue
        h = nt.nodes.new('ShaderNodeHoldout')
        nt.links.new(h.outputs[0], out.inputs['Surface'])


def pine_proto(seed, variant):
    """One game pine (prop_assets.pine) joined into a single mesh object, hidden as a prototype."""
    import prop_assets as PA
    before = set(bpy.data.objects)
    if variant == 0:
        PA.pine(seed=37, tiers=4, base_r=1.1, top_z=3.3, tier_h=1.25, first_z=0.6, snow_f=0.88, tips=9,
                light='#2C6A50', dark='#1F4D3A')
    elif variant == 1:
        PA.pine(seed=11, tiers=4, base_r=1.05, top_z=3.2, tier_h=1.25, first_z=0.6, snow_f=0.66, tips=9)
    else:
        PA.pine(seed=23, tiers=5, base_r=0.92, top_z=3.9, tier_h=1.15, first_z=0.6, snow_f=0.5, tips=8,
                light='#3A7A58', dark='#1F4D3A')
    new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in new:
        o.select_set(True)
    bpy.context.view_layer.objects.active = new[0]
    if len(new) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = 'pine_proto%d' % variant
    ob.hide_render = True
    ob.location = (0, 0, -100)
    return ob


def plant_forest(spec, terrain_xyz):
    X, Y, Z = terrain_xyz
    P = spec['P']
    st = spec['step']
    protos = [pine_proto(spec['seed'], v) for v in range(3)]
    rnd = random.Random(spec['seed'] * 7 + 1)

    def h_at(x, y):
        i = int(round((y - Y[0, 0]) / st))
        j = int(round((x - X[0, 0]) / st))
        i = max(0, min(Z.shape[0] - 1, i))
        j = max(0, min(Z.shape[1] - 1, j))
        return float(Z[i, j])

    spots = []
    n = spec['trees']
    tries = 0
    while len(spots) < n and tries < n * 40:
        tries += 1
        x = rnd.uniform(0, P)
        y = rnd.uniform(1.0, spec['depth'] - 1.0)
        # clumps: more trees where a slow periodic density is high
        dens = 0.5 + 0.5 * math.sin(2 * math.tau * x / P + 1.3) * math.cos(3 * math.tau * x / P + 0.4)
        if rnd.random() > 0.35 + 0.65 * dens:
            continue
        if any(wrap(x - a, P) ** 2 + (y - b) ** 2 < 1.7 ** 2 for a, b, _s, _v, _r, _sz in spots):
            continue
        if spec['kind'] == 'mtn' and h_at(x, y) > spec.get('tree_max', 1.0) * spec['Hmax']:
            continue
        s = rnd.uniform(0.85, 1.35) * (1.0 + 0.25 * (y / spec['depth'])) * spec.get('tree_scale', 1.0)
        spots.append((x, y, s, rnd.randrange(3), rnd.uniform(0, 360), s * rnd.uniform(0.95, 1.1)))
    # every tree is chosen ONCE (size, height, turn) and planted at x - P, x, x + P: a tree that
    # straddles the frame edge is the very same tree on both sides of the seam
    for (x, y, s, v, r, sz) in spots:
        for k in (-1, 0, 1):
            ob = bpy.data.objects.new('pine', protos[v].data)
            ob.location = (x + k * P, y, h_at(x, y) - 0.25)
            ob.rotation_euler = (0, 0, math.radians(r))
            ob.scale = (s, s, sz)
            T.link(ob)
    return len(spots)


def camera_for(spec, ob_pts):
    """Ortho camera looking along +Y, pitched down; frame = one period wide, height fitted."""
    P = spec['P']
    pitch = math.radians(spec['pitch'])
    cd = bpy.data.cameras.new('cam')
    cd.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cd)
    cam.rotation_euler = (math.radians(90.0) - pitch, 0, 0)
    cam.location = (P / 2.0, -120.0, 20.0)
    T.link(cam)
    bpy.context.scene.camera = cam
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    ys = []
    for p in ob_pts:
        if 0.0 <= p[0] <= P:
            ys.append((inv @ Vector(p)).y)
    top = max(ys)
    bot = min(ys)
    ppu = spec['W'] / P
    pad_top = 6.0 / ppu
    H = int(math.ceil((top - bot + pad_top) * ppu))
    H += H % 2
    cd.ortho_scale = P                      # width >= height -> ortho_scale is the width
    # centre the frame vertically on [bot, top + pad]
    cy = (bot + top + pad_top) / 2.0
    cam.location = cam.matrix_world @ Vector((0, cy, 0))
    return cam, spec['W'], H


def lights(kind='forest'):
    if kind == 'mtn':
        # low key sun from the upper left: warm lit flanks, blue shadow flanks (#A9B9DE-ish from the sky)
        T.world_env((0.36, 0.46, 0.80), 0.42, top=(0.52, 0.62, 0.92))
        T.sun('sun', (0.86, 0.30, -0.40), 3.4, color=(1.0, 0.93, 0.84), angle=2.0)
        return
    T.world_env((0.46, 0.55, 0.85), 0.55, top=(0.62, 0.70, 0.95))
    T.sun('sun', (0.80, 0.55, -0.45), 2.1, color=(1.0, 0.95, 0.88), angle=3.0)
    T.sun('fill', (-0.5, 1.0, -0.15), 0.25, color=(0.70, 0.78, 1.0), angle=20.0, shadow=False)


def sample_points(obs, every=7):
    pts = []
    for ob in obs:
        me = ob.data
        mw = ob.matrix_world
        n = len(me.vertices)
        co = np.empty(n * 3, np.float32)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)[::every]
        for c in co:
            pts.append(mw @ Vector(c))
    return pts


def render_layer(name, a):
    spec = LAYERS[name]
    T.reset()
    if spec['kind'] == 'clouds':
        pts = build_clouds(spec)
        T.world_env((0.55, 0.68, 0.95), 0.75, top=(0.75, 0.85, 1.0))
        T.sun('sun', (0.6, 0.4, -0.7), 2.6, color=(1.0, 0.97, 0.92), angle=10.0)
        cam, W, H = camera_for(spec, pts)
        sc = T.render_setup(W, H, samples=a.samples, threads=a.threads)
        sc.render.resolution_percentage = a.pct
        sc.render.filepath = os.path.join(a.out, 'bd_%s.png' % name)
        bpy.ops.render.render(write_still=True)
        print('BD_DONE', name, W, H, flush=True)
        return
    if spec['kind'] == 'city':
        build_city(spec)
        T.world_env((0.42, 0.52, 0.82), 0.55, top=(0.62, 0.72, 0.95))
        T.sun('sun', (0.86, 0.30, -0.45), 2.8, color=(1.0, 0.94, 0.86), angle=3.0)
        cam, W, H = city_camera(spec)
        sc = T.render_setup(W, H, samples=a.samples, threads=a.threads)
        sc.render.resolution_percentage = a.pct
        sc.render.filepath = os.path.join(a.out, 'bd_city.png')
        bpy.ops.render.render(write_still=True)
        print('BD_DONE', name, W, H, flush=True)
        emission_only()
        sc.world = None
        for o in bpy.context.scene.objects:
            if o.type == 'LIGHT':
                o.hide_render = True
        sc.cycles.samples = max(8, a.samples // 2)
        sc.render.filepath = os.path.join(a.out, 'bd_city_lights.png')
        bpy.ops.render.render(write_still=True)
        print('BD_DONE', name + '_lights', W, H, flush=True)
        return
    terr, xyz = build_terrain(spec)
    if spec.get('trees'):
        n = plant_forest(spec, xyz)
        print('trees', n, flush=True)
    lights(spec['kind'])
    pts = sample_points([terr])
    if spec.get('trees'):
        # tree tops matter for the frame top
        P = spec['P']
        for ob in bpy.context.scene.objects:
            if ob.name.startswith('pine') and not ob.hide_render and 0 <= ob.location.x <= P:
                pts.append(Vector((ob.location.x, ob.location.y, ob.location.z + 4.2 * ob.scale.z)))
    cam, W, H = camera_for(spec, pts)
    sc = T.render_setup(W, H, samples=a.samples, threads=a.threads)
    sc.render.resolution_percentage = a.pct
    sc.render.filepath = os.path.join(a.out, 'bd_%s.png' % name)
    bpy.ops.render.render(write_still=True)
    print('BD_DONE', name, W, H, flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--layers', default='mtn_far,mtn_mid,forest,clouds')
    ap.add_argument('--samples', type=int, default=24)
    ap.add_argument('--pct', type=int, default=100)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--skip-existing', action='store_true')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    for name in a.layers.split(','):
        if a.skip_existing and os.path.exists(os.path.join(a.out, 'bd_%s.png' % name)):
            continue
        render_layer(name, a)


if __name__ == '__main__':
    main()
