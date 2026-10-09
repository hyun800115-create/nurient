"""
ttl_icon.py - the app icon scene (Blender, Cycles): a close, bold portrait of the chief (the game's
player model, char_build) with a big happy smile and a TALL, leaning tower of salmon steaks on his
wooden A-frame carrier (지게) rising to the top-right corner, a red pennant with the 눈꽃 emblem on
top; 콩이 the shiba (pet2_build) pops in at the bottom left with her ^^ eyes; behind them only a
saturated ice-blue sky, the red roof corner of the game's log cabin (bld_assets house_a) and a
snowy bank - so the face and the stack read at 48 px.

    /tmp/bvenv/bin/python tools/blender/ttl_icon.py -- --out DIR [--size 1024] [--samples 48]
                       [--passes full,mask,fg,bg] [--pct 100] [--threads 2] [--skip-existing]

Passes (DIR/icon_<pass>.png):
    full   the whole picture, square, opaque (sky is the world background)
    mask   alpha of the chief + stack + dog in the full framing (ttl_iconpack draws the navy rim)
    fg     Android adaptive foreground: chief + dog + stack only, transparent, framed so the head is
           ~40 % of the 66 dp safe circle
    bg     Android adaptive background: sky + roof corner + snow bank, same framing, opaque
ttl_iconpack.py adds the navy rim, falling snow + finishing and writes assets/title/icon/.
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
from mathutils import Vector, Euler   # noqa: E402

import bl_common as bc           # noqa: E402

CAM_YAW = 45.0                   # camera sits at world (+x, -y): the side the game's sprites are seen from
CHAR_YAW = bc.DIR_YAW['S'] - 4   # chief faces the camera, turned a little toward 콩이
STACK_N = 9                      # salmon steaks in the tower
STEAK_TILT = (38.0, 66.0)        # each steak tips its orange cut face toward the camera, more toward the top
                                 # (they sit above eye level; a casual-game 'fanned' stack)
FG_OBJECTS = set()               # names of chief / dog / stack objects (fg pass)


def new_objects(fn, *args, **kw):
    before = set(bpy.data.objects)
    ret = fn(*args, **kw)
    return ret, [o for o in bpy.data.objects if o not in before]


def group(objs, name, loc=(0, 0, 0), rot_deg=(0, 0, 0), scale=1.0, parent=None):
    """Parent every top-level object of `objs` to a new empty and place that empty."""
    bpy.context.view_layer.update()          # fresh matrix_world for objects made this frame
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_parent_inverse = root.matrix_world.inverted()
            o.matrix_world = mw
    root.location = loc
    root.rotation_euler = Euler([math.radians(v) for v in rot_deg])
    root.scale = (scale, scale, scale)
    if parent is not None:
        root.parent = parent
    return root


# ------------------------------------------------------------------ chief + carrier + stack
def build_chief():
    import char_build
    import char_anim
    rig = char_build.build('player')                    # resets the scene
    pose = char_anim.pose_for('human', 'idle', 0, 4, 'player')
    pose.update({
        'ik_R': (-0.30, -0.16, 0.02, -1.0, 0.2, -1.0), 'hand_R': (10, 0, 20),   # cheery raised fist, low
        'ik_L': (0.20, -0.10, 0.02),                                         # hand on the strap
        'spine': (-4, 4, 4), 'head': (-6, -6, 3),                            # leans back a little under the load
        'hip_R': (4, 7, 0), 'hip_L': (-3, 9, 0),
    })
    pose['_show'] = {'face_normal'}
    rig.apply(pose, yaw_deg=CHAR_YAW)
    rig.update_strings()
    big_smile(rig)
    for o in bpy.data.objects:
        FG_OBJECTS.add(o.name)
    return rig


def big_smile(rig):
    """Swap the little mouth for a wide open D smile with a tongue (an icon must read 'happy' at
    48 px; the game's small arc / round 'o' mouths read as neutral / surprised at that size)."""
    import bmesh
    import char_build as cb
    import ttl_lib as TL
    for o in bpy.data.objects:
        if o.name.startswith('mouth'):
            o.hide_render = True
            o.hide_viewport = True
    head = rig.j['head']

    def d_shape(R, h, depth, top=0.0):
        bm = bmesh.new()
        pts = []
        N = 18
        for i in range(N + 1):                       # round bottom
            a = math.pi + math.pi * i / N
            pts.append((R * math.cos(a), -h * abs(math.sin(a)) ** 0.9))
        vs = [bm.verts.new((x, 0.0, z + top)) for x, z in pts]
        f = bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(bm, geom=[f])
        for v in [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]:
            v.co.y += depth
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return bm

    dark = TL.mat_flat('smile_dark', '#5A2025', rough=0.5)
    pink = TL.mat_flat('smile_tongue', '#F2737E', rough=0.45)
    cb.on_head('smile', d_shape(0.060, 0.058, 0.010, top=0.012), dark, head, 0.0, -0.33, out=-0.004)
    cb.on_head('smile_tongue', d_shape(0.034, 0.022, 0.012, top=-0.020), pink, head, 0.0, -0.36, out=-0.001)


def carrier_and_stack(rig, seed=4):
    """지게 (A-frame) on the chest joint + the goods tower standing on its shelf."""
    import prop_lib as L
    import prop_assets as PA
    from prop_lib import box, cyl, flat
    chest = rig.j['chest']
    made = []
    wood = L.tonal('#9A6438', 0.12, 5.0)
    wood2 = flat('#7E4E2A', 0.8)

    def add(fn, *a, **k):
        _r, objs = new_objects(fn, *a, **k)
        made.extend(objs)
        return objs

    # chest-local frame: front -Y, back +Y, up +Z; chest joint at z ~0.67 m above the feet
    by = 0.20
    for sx in (-1, 1):
        add(cyl, 'jige_pole', 0.035, 1.05, (sx * 0.16, by + 0.02, -0.42), rot=(-6, sx * -4, 0), mat=wood, segs=10,
            bevel=0.01)
    for z in (-0.10, 0.18, 0.40):
        add(box, 'jige_bar', (0.36, 0.05, 0.05), (0, by + 0.03, z), mat=wood2, bevel=0.012)
    # the shelf prongs
    for sx in (-1, 1):
        add(box, 'jige_prong', (0.05, 0.42, 0.05), (sx * 0.15, by + 0.22, -0.30), rot=(8, 0, 0), mat=wood, bevel=0.012)
    add(box, 'jige_shelf', (0.40, 0.36, 0.035), (0, by + 0.22, -0.28), mat=wood2, bevel=0.01)
    # straps over the shoulders
    strap = flat('#5B3A22', 0.85)
    for sx in (-1, 1):
        add(box, 'strap', (0.05, 0.05, 0.28), (sx * 0.12, 0.13, 0.13), rot=(-28, 0, 0), mat=strap, bevel=0.01)
    parent_all = group([o for o in made if o.parent is None], 'jige', parent=chest)
    parent_all.location = (0, 0, 0)

    # the goods tower: a TALL, leaning stack of salmon steaks (the game's stacking hook, like the
    # style reference) - raw cut faces up (orange flesh + white fat lines), silver-blue skin sides
    k = 0.8
    rnd = random.Random(seed)
    tower = bpy.data.objects.new('tower', None)
    bpy.context.scene.collection.objects.link(tower)
    tower.parent = chest
    tower.location = (0.36, by + 0.24, -0.27)
    tower.rotation_euler = (math.radians(-4), math.radians(-7), 0)
    z = 0.0
    n_steaks = STACK_N
    th = 0.15
    for i in range(n_steaks):
        _r, objs = new_objects(PA.steak_model, 'steak', R=0.36, thick=th, cooked=False)
        made.extend(objs)
        u = i / max(1, n_steaks - 1)
        lean = 0.20 * u * u + rnd.uniform(-0.012, 0.012)          # a gentle banana lean to the right
        tilt = STEAK_TILT[0] + (STEAK_TILT[1] - STEAK_TILT[0]) * u
        g = group(objs, 'item_%d' % i, loc=(lean, 0.015 * math.sin(i * 1.7), z * k), scale=k,
                  rot_deg=(0, 0, 0))
        g.rotation_mode = 'ZXY'          # spin about its own axis first, then tip the cut face to the camera
        g.rotation_euler = (math.radians(tilt), 0, math.radians(180 + rnd.uniform(-9, 9)))
        g.parent = tower
        z += th * 1.05
    # red pennant with the 눈꽃 emblem on top
    import ttl_lib as TL
    pole_h = 0.42
    _r, o = new_objects(cyl, 'pole', 0.018, pole_h, (0.0, 0, 0), mat=flat('#6B4426', 0.7), segs=8, bevel=0.005)
    made.extend(o)
    flag = TL.poly_solid('pennant', [(0, 0), (0.42, -0.10), (0, -0.21)], 0.012, 0.008,
                         TL.mat_flat('pennant_m', '#D9483B', rough=0.55, coat=0.2),
                         loc=(0.0, 0.0, pole_h - 0.02), rot=(math.radians(90), 0, math.radians(-90)))
    em = TL.emblem('flag_emblem', 0.075, loc=(0.0, -0.035, pole_h - 0.12), rot_deg=0)
    em.rotation_euler = (math.radians(90), 0, math.radians(-90))
    gpen = group(o + [flag, em], 'pennant_g', loc=(0.10, 0.0, z * k + 0.02))
    gpen.parent = tower
    gpen.rotation_euler = (0, 0, math.radians(20))
    # everything under the chest that is new belongs to the foreground
    for ob in [tower, parent_all, gpen] + list(tower.children_recursive) + list(parent_all.children_recursive):
        FG_OBJECTS.add(ob.name)
    return tower


def _coin():
    import prop_assets as PA
    PA.b_item_coin()


# ------------------------------------------------------------------ 콩이 the shiba
def build_dog(loc, yaw):
    import pet2_build as pb
    orig = bc.reset_scene
    bc.reset_scene = lambda *a, **k: None              # keep the chief in the scene
    before = set(bpy.data.objects)
    try:
        rig = pb.build()
    finally:
        bc.reset_scene = orig
    pose = pb.pose_for(rig, 'beg', 1, 'S')
    rig.apply(pose, yaw_deg=yaw)
    for nm, ob in rig.meta.get('crumbs', {}).items():
        ob.hide_render = True
    for t in ('treat', 'ball'):
        for ob in rig.toggles.get(t, []):
            ob.hide_render = True
            for ch in ob.children_recursive:
                ch.hide_render = True
    rig.update_strings()
    top = bpy.data.objects.get('pet_scale') or rig.j['root'].parent
    top.location = loc
    for o in bpy.data.objects:
        if o not in before:
            FG_OBJECTS.add(o.name)
    return rig


# ------------------------------------------------------------------ house, pines, ground
def build_house(loc, yaw=0.0, scale=1.0):
    import bld_assets as BA
    _r, objs = new_objects(BA.b_house_a)
    return group(objs, 'house', loc=loc, rot_deg=(0, 0, yaw), scale=scale)


def build_pine(loc, variant=0, scale=1.0, rot=0.0):
    import prop_assets as PA
    fns = [PA.b_tree_pine_snow, PA.b_tree_pine_a, PA.b_tree_pine_b]
    _r, objs = new_objects(fns[variant % 3])
    return group(objs, 'pine', loc=loc, rot_deg=(0, 0, rot), scale=scale)


def build_ground(size=60.0, step=0.25, seed=2):
    import ttl_lib as TL
    n = int(size / step)
    xs = np.linspace(-size / 2, size / 2, n)
    X, Y = np.meshgrid(xs, xs)
    rnd = np.random.default_rng(seed)
    Z = np.zeros_like(X)
    for k in range(6):
        f = rnd.uniform(0.15, 0.6)
        Z += 0.06 * np.sin(f * X + rnd.uniform(0, 6)) * np.cos(f * 0.8 * Y + rnd.uniform(0, 6))
    # soft rise toward the back (a snowy bank behind the house)
    back = (-(X) + Y) / math.sqrt(2)            # distance away from the camera
    Z += np.clip(back - 6.0, 0, None) * 0.18
    Z[np.hypot(X, Y) < 2.2] *= 0.3              # flat where the chief stands
    verts = np.stack([X.ravel(), Y.ravel(), Z.ravel()], axis=1)
    idx = np.arange(n * n).reshape(n, n)
    faces = np.stack([idx[:-1, :-1].ravel(), idx[:-1, 1:].ravel(), idx[1:, 1:].ravel(), idx[1:, :-1].ravel()], 1)
    me = bpy.data.meshes.new('ground')
    me.from_pydata(verts.tolist(), [], faces.tolist())
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new('ground', me)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.new('ground_snow')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*TL.lin('#F3F7FF'), 1)
    p.inputs['Roughness'].default_value = 0.55
    p.inputs['Subsurface Weight'].default_value = 0.3
    p.inputs['Subsurface Radius'].default_value = (0.5, 0.7, 1.0)
    p.inputs['Subsurface Scale'].default_value = 0.05
    p.inputs['Coat Weight'].default_value = 0.15
    me.materials.append(m)
    return ob


def sky_world(strength=1.0):
    """Gradient sky as the world (seen behind everything in the full / bg passes)."""
    import ttl_lib as TL
    sc = bpy.context.scene
    wd = bpy.data.worlds.new('IconSky')
    wd.use_nodes = True
    nt = wd.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    # world 'Generated' = the view direction, so Z runs -1 (down) .. 0 (horizon) .. 1 (up)
    cr.elements[0].position = 0.0
    cr.elements[0].color = (*TL.lin('#A6DAFF'), 1)
    cr.elements[1].position = 0.38
    cr.elements[1].color = (*TL.lin('#1C69D3'), 1)
    e = cr.elements.new(0.12)
    e.color = (*TL.lin('#56AEF6'), 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    sc.world = wd
    return wd


def lights():
    import ttl_lib as TL
    TL.sun('key', (0.55, 0.62, -0.56), 3.6, color=(1.0, 0.93, 0.82), angle=3.0)
    TL.sun('rim', (-0.75, -0.35, -0.55), 1.4, color=(0.80, 0.90, 1.0), angle=8.0, shadow=False)
    TL.area_light('face_fill', (5.0, -5.0, 2.5), (0, 0, 1.0), 4.0, 260, color=(1.0, 0.93, 0.86), shadow=False)


def camera(target, dist, lens, size, elev=11.0, shift=(0.0, 0.0)):
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('IconCam')
    cd.lens = lens
    cd.sensor_width = 36
    cd.shift_x, cd.shift_y = shift
    cam = bpy.data.objects.new('IconCam', cd)
    sc.collection.objects.link(cam)
    rot = Euler((math.radians(90.0 - elev), 0.0, math.radians(CAM_YAW)), 'XYZ')
    cam.rotation_euler = rot
    cam.location = Vector(target) + (rot.to_matrix() @ Vector((0, 0, 1))) * dist
    sc.camera = cam
    return cam


def render_setup(size, samples, threads):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.015
    sc.cycles.max_bounces = 5
    sc.cycles.use_denoising = True
    sc.render.resolution_x = size
    sc.render.resolution_y = size
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    sc.render.filter_size = 1.2
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    return sc


def at(right, away, z=0.0):
    """camera-relative ground position: screen right = (+0.707, +0.707), away = (-0.707, +0.707)"""
    r = Vector((0.7071, 0.7071, 0.0))
    a = Vector((-0.7071, 0.7071, 0.0))
    return tuple(r * right + a * away + Vector((0, 0, z)))


def build_scene():
    rig = build_chief()
    carrier_and_stack(rig)
    build_dog(at(-0.30, -0.66), bc.DIR_YAW["S"] + 22)
    # only the red roof corner of the cabin peeks in at the top left; a few far pines on the bank
    build_house(at(-3.3, 3.1), yaw=-10.0, scale=1.30)
    rnd = random.Random(7)
    for (rr, aa, v, s_) in ((3.4, 7.5, 0, 1.2), (5.2, 9.5, 1, 1.3), (-6.5, 9.0, 2, 1.2), (7.5, 12.0, 0, 1.4)):
        build_pine(at(rr, aa), variant=v, scale=s_, rot=rnd.uniform(0, 360))
    import life_assets as LA
    for i, (rr, aa, r) in enumerate(((1.2, 0.9, 0.35), (-1.7, 1.2, 0.3), (1.6, -0.9, 0.28))):
        LA.snow_drift('drift%d' % i, r, at(rr, aa), seed=40 + i)
    build_ground()
    lights()
    sky_world(1.0)
    return rig


# framing: (camera target, distance, lens, elevation deg, shift) per pass family
FRAME_FULL = dict(target=(0.0, 0.0, 1.00), dist=1.75, lens=40.0, elev=7.0, shift=(0.07, -0.03))
FRAME_ADAPTIVE = dict(target=(0.0, 0.0, 1.05), dist=1.75 * 1.75, lens=40.0, elev=7.0, shift=(0.02, 0.0))


def face_emblem_to_camera():
    """Put the 눈꽃 emblem flat on the red pennant, turned to the camera (it is the flag's print)."""
    bpy.context.view_layer.update()
    flag = bpy.data.objects.get('pennant')
    em = bpy.data.objects.get('flag_emblem')
    cam = bpy.context.scene.camera
    if not (flag and em and cam):
        return
    mw = flag.matrix_world
    vs = [mw @ v.co for v in flag.data.vertices]
    # the triangle's centroid sits a third of the way out from the pole: weight toward the pole edge
    c = sum(vs, Vector()) / len(vs)
    to_cam = (cam.matrix_world.translation - c).normalized()
    for con in list(em.constraints):
        em.constraints.remove(con)
    em.parent = None
    em.location = c + to_cam * 0.035
    con = em.constraints.new('TRACK_TO')
    con.target = cam
    con.track_axis = 'TRACK_Z'
    con.up_axis = 'UP_Y'
    bpy.context.view_layer.update()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--ad-size', type=int, default=432)
    ap.add_argument('--samples', type=int, default=48)
    ap.add_argument('--passes', default='full,mask,fg,bg')
    ap.add_argument('--pct', type=int, default=100)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--skip-existing', action='store_true')
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    build_scene()
    base_hidden = {o.name for o in bpy.context.scene.objects if o.hide_render}   # toggled-off tools, faces...
    for ps in a.passes.split(','):
        out = os.path.join(a.out, 'icon_%s.png' % ps)
        if a.skip_existing and os.path.exists(out):
            continue
        for o in bpy.context.scene.objects:
            o.hide_render = o.name in base_hidden
        for c in [o for o in bpy.context.scene.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(c)
        fr = FRAME_FULL if ps in ('full', 'mask') else FRAME_ADAPTIVE
        sc = render_setup(a.size if ps in ('full', 'mask') else a.ad_size, a.samples if ps != 'mask' else 4,
                          a.threads)
        sc.render.resolution_percentage = a.pct
        camera(fr['target'], fr['dist'], fr['lens'], 0, elev=fr['elev'], shift=fr['shift'])
        g = bpy.data.objects.get('ground')
        if g is not None:
            g.is_shadow_catcher = False
        if ps in ('mask', 'fg'):
            # chief + stack + dog only, transparent (no shadow catcher: the adaptive foreground floats
            # over its background layer, a grey blob of shadow would only muddy it)
            sc.render.film_transparent = True
            for o in bpy.context.scene.objects:
                if o.type in ('MESH', 'META', 'CURVE') and o.name not in FG_OBJECTS:
                    o.hide_render = True
            if ps == 'mask':
                sc.cycles.use_denoising = False
        elif ps == 'bg':
            sc.render.film_transparent = False
            for o in bpy.context.scene.objects:
                if o.name in FG_OBJECTS and o.type in ('MESH', 'META', 'CURVE'):
                    o.hide_render = True
        else:
            sc.render.film_transparent = False
        face_emblem_to_camera()
        sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        print('ICON_DONE', ps, flush=True)


if __name__ == '__main__':
    main()
