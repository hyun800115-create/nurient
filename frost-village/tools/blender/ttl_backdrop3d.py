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
    'mtn_far': dict(P=64.0, step=0.30, W=1080, pitch=4.0, seed=3, kind='mtn', Hmax=17.0, depth=36.0,
                    peaks=6, rows=2, snow=0.95, rock='#8E92C6', snow_col='#E6EAFA', shadow='#B9C2EC'),
    'mtn_mid': dict(P=44.0, step=0.22, W=1080, pitch=6.0, seed=8, kind='mtn', Hmax=9.0, depth=24.0,
                    peaks=4, rows=2, snow=0.70, rock='#6A7AAE', snow_col='#EEF2FC', shadow='#AFC0E6',
                    dome=1.45, trees=34, tree_max=0.42, tree_scale=0.75),
    'forest': dict(P=30.0, step=0.16, W=1440, pitch=7.0, seed=5, kind='forest', Hmax=3.2, depth=16.0,
                   trees=46, snow_col='#FAFCFF', shadow='#C3D3EE'),
    'clouds': dict(P=48.0, W=1440, pitch=0.0, seed=12, kind='clouds', count=6),
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


def heights(spec, X, Y):
    rnd = random.Random(spec['seed'])
    P = spec['P']
    Z = np.zeros_like(X)
    if spec['kind'] == 'mtn':
        # stylised peaks: rotated diamond pyramids (four crisp ridges each) merged with a soft max,
        # then a little blur so the ridges read like the game's soft toy shapes
        n = spec['peaks']
        dome = spec.get('dome', 1.12)
        for r in range(spec['rows']):
            back = r / max(1, spec['rows'] - 1)                  # 0 front row .. 1 back row
            for i in range(n):
                x0 = (i + rnd.uniform(-0.3, 0.3) + 0.5 * r) * P / n
                y0 = spec['depth'] * (0.30 + 0.45 * back) + rnd.uniform(-2, 2)
                hero = rnd.random() < 0.35
                H = spec['Hmax'] * ((0.62 if hero else 0.40) + 0.30 * back + rnd.uniform(-0.08, 0.12))
                Rl = H * rnd.uniform(0.95, 1.7)                    # asymmetric left / right flanks
                Rr = H * rnd.uniform(0.95, 1.7)
                Ry = H * rnd.uniform(0.85, 1.25)
                ang = math.radians(rnd.uniform(-35, 35))
                dx = wrap(X - x0, P)
                dy = Y - y0
                u = dx * math.cos(ang) + dy * math.sin(ang)
                v = -dx * math.sin(ang) + dy * math.cos(ang)
                Rx = np.where(u < 0, Rl, Rr)
                pyr = np.clip(1.0 - (np.abs(u) / Rx + np.abs(v) / Ry), 0, 1)
                pk = H * pyr ** dome
                # a shoulder peak on one flank of the big ones
                if hero:
                    sx = x0 + rnd.choice((-1, 1)) * H * rnd.uniform(0.6, 0.9)
                    H2 = H * rnd.uniform(0.55, 0.7)
                    d2x = wrap(X - sx, P)
                    pyr2 = np.clip(1.0 - (np.abs(d2x) / (H2 * 1.2) + np.abs(Y - y0 + 1.0) / (H2 * 1.0)), 0, 1)
                    pk = np.maximum(pk, H2 * pyr2 ** dome)
                Z = np.log(np.exp(Z / 0.6) + np.exp(pk / 0.6)) * 0.6       # soft max
        Z -= Z.min()
        for k, amp in ((5, 0.30), (11, 0.18), (23, 0.10)):
            ph = rnd.uniform(0, math.tau)
            ph2 = rnd.uniform(0, math.tau)
            Z += amp * spec['Hmax'] * 0.05 * np.sin(k * math.tau * X / P + ph) * np.cos(Y * 0.31 * k / 5 + ph2) * \
                np.clip(Z / spec['Hmax'], 0.1, 1.0)
        # light blur (keeps x periodic: the grid spans 3 periods)
        Z = blur2d(Z, 0.9)
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
    # snow / rock colour per vertex: rock where steep or high-frequency ridges, snow elsewhere
    gy, gx = np.gradient(Z, st)
    slope = np.sqrt(gx * gx + gy * gy)
    rnd = np.random.default_rng(spec['seed'])
    noise = np.zeros_like(Z)
    for k in (5, 11, 23):
        noise += np.sin(k * math.tau * X / P + rnd.uniform(0, 6)) * np.sin(Y * k * 0.21 + rnd.uniform(0, 6)) / k
    # vertical gullies (high frequency along x, slow along height) -> rocky streaks down the faces
    streak = np.zeros_like(Z)
    for k in (37, 53, 79):
        streak += np.sin(k * math.tau * X / P + Z * 0.35 + rnd.uniform(0, 6))
    streak /= 3.0
    if spec['kind'] == 'mtn':
        # rock streaks on the steep faces, more on the lower half; summits stay white
        steep = np.clip((slope - (0.95 - 0.35 * (1 - spec['snow']))) * 1.4, 0, 1)
        rock = np.clip(steep * (0.55 + streak * 0.8) + noise * 2.5, 0, 1)
        rock *= np.clip(1.25 - Z / spec['Hmax'], 0, 1) * (1.0 - 0.45 * spec['snow'])
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
    p.inputs['Roughness'].default_value = 0.62
    p.inputs['Subsurface Weight'].default_value = 0.25
    p.inputs['Subsurface Radius'].default_value = (0.5, 0.7, 1.0)
    p.inputs['Subsurface Scale'].default_value = 0.4
    p.inputs['Coat Weight'].default_value = 0.1
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
        if any(wrap(x - a, P) ** 2 + (y - b) ** 2 < 1.7 ** 2 for a, b, _s, _v, _r in spots):
            continue
        if spec['kind'] == 'mtn' and h_at(x, y) > spec.get('tree_max', 1.0) * spec['Hmax']:
            continue
        s = rnd.uniform(0.85, 1.35) * (1.0 + 0.25 * (y / spec['depth'])) * spec.get('tree_scale', 1.0)
        spots.append((x, y, s, rnd.randrange(3), rnd.uniform(0, 360)))
    for (x, y, s, v, r) in spots:
        for k in (-1, 0, 1):
            ob = bpy.data.objects.new('pine', protos[v].data)
            ob.location = (x + k * P, y, h_at(x + k * P, y) - 0.25)
            ob.rotation_euler = (0, 0, math.radians(r))
            ob.scale = (s, s, s * rnd.uniform(0.95, 1.1))
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


def lights():
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
    terr, xyz = build_terrain(spec)
    if spec.get('trees'):
        n = plant_forest(spec, xyz)
        print('trees', n, flush=True)
    lights()
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
