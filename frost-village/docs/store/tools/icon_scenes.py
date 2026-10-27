"""
icon_scenes.py - app-icon options for the Play listing, built in Blender from the game's own models
(bld_assets houses, prop_assets pines / lamp posts, the title-art lighting helpers), no character close-ups:

    globe    a snow globe on a wooden base with a little lit cabin, pines and a lamp inside, falling snow
    island   a small floating snowy island with three cottages, pines and lamp posts at dusk, windows lit
    day      the same island in soft daylight

    /tmp/bvenv/bin/python docs/store/tools/icon_scenes.py -- --tools <checkout>/frost-village/tools/blender \\
        --out DIR [--scene globe|island|day] [--pass full|fg|bg] [--size 1024] [--samples 40] [--threads 2]

`--tools` must point at a checkout of the published commit's tools/blender (the model builders are imported from
there; nothing in that checkout is written). Writes DIR/<scene>_<pass>.png:
    full   the whole square picture (opaque)
    fg     the subject only on transparent (Android adaptive-icon foreground, framed for the 66 dp safe circle)
    bg     the background only (Android adaptive-icon background)
make_graphics.py turns these into icon_512.png and the launcher set.
"""
import argparse
import math
import os
import random
import sys

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
ap = argparse.ArgumentParser()
ap.add_argument('--tools', required=True)
ap.add_argument('--out', required=True)
ap.add_argument('--scene', default='globe')
ap.add_argument('--pass', dest='pss', default='full')
ap.add_argument('--size', type=int, default=1024)
ap.add_argument('--samples', type=int, default=40)
ap.add_argument('--threads', type=int, default=2)
A = ap.parse_args(argv)
sys.path.insert(0, os.path.abspath(A.tools))

import bpy                       # noqa: E402
import bmesh                     # noqa: E402
from mathutils import Vector, Euler, noise   # noqa: E402

import bl_common as bc           # noqa: E402
import prop_lib as L             # noqa: E402
import ttl_lib as TL             # noqa: E402

CAM_YAW = 45.0
SUBJECT = set()                  # names of the objects that form the foreground (fg pass)


def new_objects(fn, *a, **k):
    before = set(bpy.data.objects)
    fn(*a, **k)
    return [o for o in bpy.data.objects if o not in before]


def group(objs, name, loc=(0, 0, 0), yaw=0.0, scale=1.0):
    bpy.context.view_layer.update()
    root = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(root)
    for o in objs:
        if o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_parent_inverse = root.matrix_world.inverted()
            o.matrix_world = mw
    root.location = loc
    root.rotation_euler = Euler((0, 0, math.radians(yaw)))
    root.scale = (scale, scale, scale)
    for o in [root] + list(root.children_recursive):
        SUBJECT.add(o.name)
    return root


def at(right, away, z=0.0):
    """camera-relative ground position: screen right = (+.707, +.707), away from the camera = (-.707, +.707)"""
    r = Vector((0.7071, 0.7071, 0.0))
    a = Vector((-0.7071, 0.7071, 0.0))
    return tuple(r * right + a * away + Vector((0, 0, z)))


def house(kind, loc, yaw=0.0, scale=1.0):
    import bld_assets as BA
    return group(new_objects(getattr(BA, 'b_' + kind)), kind, loc, yaw, scale)


def pine(loc, variant=0, scale=1.0, rot=0.0):
    import prop_assets as PA
    fns = [PA.b_tree_pine_snow, PA.b_tree_pine_a, PA.b_tree_pine_b]
    return group(new_objects(fns[variant % 3]), 'pine', loc, rot, scale)


def lamp(loc, scale=1.0, yaw=0.0):
    import prop_assets as PA
    return group(new_objects(PA.b_lamp_post), 'lamp', loc, yaw, scale)


def mesh_from(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    SUBJECT.add(ob.name)
    return ob


# ------------------------------------------------------------------ pieces
def island_body(R=3.4, depth=4.8, seed=3):
    """an upside-down rocky cone with a snowy top, gently lumpy"""
    rnd = random.Random(seed)
    bm = bmesh.new()
    rings, segs = 14, 64
    verts = []
    for i in range(rings + 1):
        t = i / rings                                   # 0 = rim, 1 = tip
        rr = R * (1 - t) ** 0.85 * (1 + 0.04 * math.sin(t * 9))
        z = -depth * t ** 1.25
        row = []
        for j in range(segs):
            a = 2 * math.pi * j / segs
            n = noise.noise(Vector((math.cos(a) * 1.7, math.sin(a) * 1.7, t * 3 + seed))) * 0.22 * (1 - t * 0.5)
            row.append(bm.verts.new(((rr + n) * math.cos(a), (rr + n) * math.sin(a), z + (0.05 * rnd.random() if i else 0))))
        verts.append(row)
    tip = bm.verts.new((0, 0, -depth - 0.25))
    for i in range(rings):
        for j in range(segs):
            a, b = verts[i][j], verts[i][(j + 1) % segs]
            c, d = verts[i + 1][(j + 1) % segs], verts[i + 1][j]
            bm.faces.new((a, d, c, b))
    for j in range(segs):
        bm.faces.new((verts[rings][j], tip, verts[rings][(j + 1) % segs]))
    bm.faces.new(list(verts[0]))                          # flat top
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    rock = L.tonal('#7B6A5E', 0.18, 3.0, rough=0.85, dark='#5A4A40')
    body = mesh_from('island_rock', bm, rock)
    # the snow top: a soft, slightly domed cap a little wider than the rock, with a rim that hangs over
    snow = TL.mat_snow('isl_snow')
    cap = TL.ellipsoid('island_snow', R + 0.12, R + 0.12, 0.34, snow, loc=(0, 0, -0.06), seg=64, rings=24)
    SUBJECT.add(cap.name)
    # a few earthy strata bands on the cone
    for k, (z, w) in enumerate(((-0.75, 0.14), (-1.7, 0.1))):
        rr = R * (1 - (-z / depth) ** (1 / 1.25)) ** 0.85 + 0.03
        band = L.cyl('strata%d' % k, rr, w, (0, 0, z - w / 2), mat=L.flat('#8E7766', 0.9), segs=64, bevel=0.0)
        SUBJECT.add(band.name)
    return body


def snow_ground_disc(R, z=0.0):
    snow = TL.mat_snow('ground_snow')
    ob = TL.ellipsoid('globe_snow', R, R, 0.32, snow, loc=(0, 0, z), seg=64, rings=24)
    SUBJECT.add(ob.name)
    return ob


def flakes(n, center, R, zmin, seed=5, size=0.025):
    rnd = random.Random(seed)
    m = TL.mat_flat('flake', '#FFFFFF', rough=0.3, emission='#FFFFFF', estr=0.6)
    made = 0
    while made < n:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))
        if v.length > 1:
            continue
        p = Vector(center) + v * R
        if p.z < zmin:
            continue
        ob = L.sphere('flake', size * rnd.uniform(0.7, 1.3), tuple(p), mat=m, segs=8, rings=5)
        SUBJECT.add(ob.name)
        made += 1


def glass_mat():
    m = bpy.data.materials.new('globe_glass')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    gl = nt.nodes.new('ShaderNodeBsdfGlossy')
    gl.inputs['Roughness'].default_value = 0.04
    lw = nt.nodes.new('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.28
    mix = nt.nodes.new('ShaderNodeMixShader')
    # a faint cool tint in the glass so the globe reads as a shape against any background
    tint = nt.nodes.new('ShaderNodeBsdfTransparent')
    tint.inputs['Color'].default_value = (0.92, 0.97, 1.0, 1)
    nt.links.new(lw.outputs['Fresnel'], mix.inputs['Fac'])
    nt.links.new(tint.outputs[0], mix.inputs[1])
    nt.links.new(gl.outputs[0], mix.inputs[2])
    # rim light: emission on the silhouette edge
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0.85, 0.93, 1.0, 1)
    em.inputs['Strength'].default_value = 0.9
    lw2 = nt.nodes.new('ShaderNodeLayerWeight')
    lw2.inputs['Blend'].default_value = 0.12
    pw = nt.nodes.new('ShaderNodeMath')
    pw.operation = 'POWER'
    pw.inputs[1].default_value = 3.0
    nt.links.new(lw2.outputs['Facing'], pw.inputs[0])
    add = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(pw.outputs[0], add.inputs['Fac'])
    nt.links.new(mix.outputs[0], add.inputs[1])
    nt.links.new(em.outputs[0], add.inputs[2])
    nt.links.new(add.outputs[0], out.inputs['Surface'])
    m.blend_method = 'BLEND' if hasattr(m, 'blend_method') else None
    return m


def globe_scene():
    # the base: a turned wooden plinth with a gold band and a little red ribbon
    wood = L.tonal('#8A4E2C', 0.12, 5.0, rough=0.55, dark='#6A3A20')
    b1 = L.cyl('base_low', 1.42, 0.22, (0, 0, -0.62), mat=wood, segs=64, bevel=0.05)
    b2 = L.cyl('base_mid', 1.30, 0.34, (0, 0, -0.42), mat=wood, segs=64, r_top=1.18, bevel=0.04)
    gold = TL.mat_flat('gold_band', '#F2C14E', rough=0.28, coat=0.5)
    band = L.cyl('base_band', 1.255, 0.08, (0, 0, -0.33), mat=gold, segs=64, bevel=0.01)
    for o in (b1, b2, band):
        SUBJECT.add(o.name)
    # the village inside
    snow_ground_disc(1.12, z=-0.12)
    house('house_a', at(-0.06, 0.10, 0.05), yaw=-8.0, scale=0.36)
    pine(at(-0.66, 0.30, 0.02), 0, 0.34, 20)
    pine(at(0.62, 0.36, 0.02), 2, 0.30, 70)
    pine(at(0.32, -0.42, 0.04), 0, 0.20, 130)
    lamp(at(-0.46, -0.30, 0.04), 0.24, 0)
    # the glass globe (a little more than a hemisphere above the base)
    R = 1.22
    gz = 0.38
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=96, v_segments=48, radius=R)
    for v in list(bm.verts):
        if v.co.z < -0.62 * R:
            bm.verts.remove(v)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, gz))
    glass = mesh_from('globe', bm, glass_mat())
    glass.visible_shadow = False
    flakes(70, (0, 0, gz), R * 0.92, zmin=0.05)
    return {'target': (0, 0, 0.47), 'dist': 5.25, 'elev': 16.0, 'lens': 50.0, 'sky': (-0.62, 0.16)}


def island_scene():
    island_body()
    house('house_a', at(-0.55, -0.25, 0.25), yaw=-6.0, scale=0.95)
    house('house_b', at(1.55, 1.05, 0.25), yaw=4.0, scale=0.82)
    house('house_c', at(-1.85, 1.35, 0.25), yaw=-12.0, scale=0.82)
    rnd = random.Random(11)
    for (rr, aa, v, s_) in ((2.45, -0.75, 0, 0.85), (-2.6, -0.2, 1, 0.8), (0.4, 2.55, 2, 0.95), (2.25, 2.4, 0, 0.75),
                            (-0.9, 2.75, 0, 0.7), (1.0, -1.9, 2, 0.6)):
        pine(at(rr, aa, 0.25), v, s_, rnd.uniform(0, 360))
    lamp(at(0.95, -0.55, 0.25), 0.75, 0)
    lamp(at(-1.6, 0.25, 0.25), 0.7, 0)
    return {'target': (0, 0, -0.5), 'dist': 13.6, 'elev': 22.0, 'lens': 50.0, 'sky': (-0.55, 0.2)}


# ------------------------------------------------------------------ world + lights
def gradient_world(stops, strength=1.0, span=(-0.35, 0.75)):
    sc = bpy.context.scene
    wd = bpy.data.worlds.new('IconSky')
    wd.use_nodes = True
    nt = wd.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = span[0]
    mr.inputs['From Max'].default_value = span[1]
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    cr.elements[0].position, cr.elements[0].color = stops[0][0], (*TL.lin(stops[0][1]), 1)
    cr.elements[1].position, cr.elements[1].color = stops[-1][0], (*TL.lin(stops[-1][1]), 1)
    for p, c in stops[1:-1]:
        e = cr.elements.new(p)
        e.color = (*TL.lin(c), 1)
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    sc.world = wd


def lights(mood):
    if mood == 'dusk':
        TL.sun('key', (0.75, 0.45, -0.38), 2.4, color=(1.0, 0.72, 0.48), angle=6.0)
        TL.sun('fill', (-0.6, -0.7, -0.5), 0.55, color=(0.62, 0.70, 1.0), angle=15.0, shadow=False)
        TL.area_light('rim', (-6, 6, 5), (0, 0, 0), 6.0, 500, color=(0.75, 0.8, 1.0), shadow=False)
    else:
        TL.sun('key', (0.55, 0.62, -0.62), 3.4, color=(1.0, 0.95, 0.86), angle=4.0)
        TL.sun('fill', (-0.7, -0.5, -0.5), 0.9, color=(0.80, 0.88, 1.0), angle=15.0, shadow=False)


def camera(target, dist, elev, lens, shift=(0.0, 0.0)):
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


def render_setup(size, samples, threads):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.max_bounces = 8
    sc.cycles.transparent_max_bounces = 16
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


SKIES = {
    # bottom -> top of the view (the icon background)
    'globe': [(0.0, '#F3C7A6'), (0.42, '#C9A6D6'), (0.75, '#5A6FB8'), (1.0, '#2E3F86')],
    'island': [(0.0, '#F7C59A'), (0.40, '#E6A9B8'), (0.70, '#7E86C8'), (1.0, '#3A4790')],
    'day': [(0.0, '#EAF4FF'), (0.45, '#A9D6FA'), (1.0, '#3E8EE0')],
}


def main():
    os.makedirs(A.out, exist_ok=True)
    bc.reset_scene()
    frame = globe_scene() if A.scene == 'globe' else island_scene()
    gradient_world(SKIES[A.scene], 1.0, frame['sky'])
    lights('day' if A.scene == 'day' else 'dusk')
    sc = render_setup(A.size, A.samples, A.threads)
    if A.pss == 'fg':
        # the adaptive foreground: the subject inside the 66 dp safe circle of the 108 dp layer (~58 % of the side)
        camera(frame['target'], frame['dist'] * 1.5, frame['elev'], frame['lens'])
    else:
        camera(frame['target'], frame['dist'], frame['elev'], frame['lens'])
    if A.pss == 'fg':
        sc.render.film_transparent = True
    elif A.pss == 'bg':
        for o in sc.objects:
            if o.name in SUBJECT and o.type in ('MESH', 'CURVE', 'META'):
                o.hide_render = True
    out = os.path.join(A.out, '%s_%s.png' % (A.scene, A.pss))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('ICON_DONE', out, flush=True)


main()
