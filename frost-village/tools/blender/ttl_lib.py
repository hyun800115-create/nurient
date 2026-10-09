"""
ttl_lib.py - shared Blender helpers for the title art (3D toy letters, puffy snow, emblem, sign).

Space: glyphs live in the XY plane (x right, y up), depth along +Z toward the camera.  The camera
looks down -Z, tilted a few degrees from above (+Y) so snow caps and letter tops show.
Snow falls along -Y.  1 unit = the font size (a Hangul syllable of Jua is ~0.72 units tall).
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ttl_config as C          # noqa: E402

_FONTS = {}
_MATS = {}


# ------------------------------------------------------------------ basics
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _FONTS.clear()
    _MATS.clear()
    return bpy.context.scene


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))


def lin(c):
    if isinstance(c, str):
        c = hex_rgb(c)
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c[:3])


def font(path):
    if path not in _FONTS:
        _FONTS[path] = bpy.data.fonts.load(path)
    return _FONTS[path]


def link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, scale=1.0):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (scale, scale, scale)
    return link(ob, parent)


def render_setup(w, h, samples=64, threads=2):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.02
    sc.cycles.max_bounces = 6
    sc.cycles.use_denoising = True
    try:
        sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.cycles.film_transparent_glass = True
    sc.render.resolution_x = int(w)
    sc.render.resolution_y = int(h)
    sc.render.resolution_percentage = 100
    sc.render.filter_size = 1.2
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = threads
    s = sc.render.image_settings
    s.file_format = 'PNG'
    s.color_mode = 'RGBA'
    s.color_depth = '8'
    s.compression = 60
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0.0
    return sc


def ortho_camera(cx, cy, width_units, w, h, tilt_deg=7.0, dist=30.0):
    """Ortho camera centred on (cx, cy) in the glyph plane, `width_units` wide, tilted from above."""
    sc = bpy.context.scene
    cd = bpy.data.cameras.new('Cam')
    cd.type = 'ORTHO'
    cd.ortho_scale = width_units if w >= h else width_units * h / w
    cd.clip_start = 0.1
    cd.clip_end = 200
    cam = bpy.data.objects.new('Cam', cd)
    a = math.radians(tilt_deg)
    cam.rotation_euler = (-a, 0, 0)
    # keep the glyph-plane point (cx, cy, 0) in the middle of the frame
    cam.location = (cx, cy + math.sin(a) * dist, math.cos(a) * dist)
    link(cam)
    sc.camera = cam
    return cam


def world_env(color=(0.80, 0.88, 1.0), strength=0.55, top=None):
    """Uniform (or bottom->top gradient along the scene's +Y = up) environment light."""
    sc = bpy.context.scene
    wd = bpy.data.worlds.new('W')
    wd.use_nodes = True
    nt = wd.node_tree
    bg = nt.nodes['Background']
    if top is None:
        bg.inputs['Color'].default_value = (*color, 1)
    else:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = -1.0
        mr.inputs['From Max'].default_value = 1.0
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        nt.links.new(tc.outputs['Generated'], sep.inputs[0])
        nt.links.new(sep.outputs['Y'], mr.inputs['Value'])
        nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
        ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].color = (*top, 1)
        nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    sc.world = wd
    return wd


def area_light(name, loc, target, size, energy, color=(1, 1, 1), shadow=True, shape='DISK'):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.size = size
    ld.shape = shape
    ld.energy = energy
    ld.color = color
    ld.use_shadow = shadow
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    d = (Vector(target) - Vector(loc)).normalized()
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    link(ob)
    return ob


def sun(name, direction, energy, color=(1, 1, 1), angle=8.0, shadow=True):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = energy
    ld.color = color
    ld.angle = math.radians(angle)
    ld.use_shadow = shadow
    ob = bpy.data.objects.new(name, ld)
    ob.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
    link(ob)
    return ob


# ------------------------------------------------------------------ materials
def _principled(m):
    return m.node_tree.nodes.get('Principled BSDF')


def mat_flat(name, color, rough=0.5, coat=0.0, sss=0.0, emission=None, estr=0.0, spec=0.5):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = _principled(m)
    p.inputs['Base Color'].default_value = (*lin(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.06
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Radius'].default_value = (0.6, 0.8, 1.0)
        p.inputs['Subsurface Scale'].default_value = 0.02
    if emission:
        p.inputs['Emission Color'].default_value = (*lin(emission), 1)
        p.inputs['Emission Strength'].default_value = estr
    _MATS[name] = m
    return m


def mat_gradient(name, top, bottom, y0, y1, rough=0.32, coat=0.55, sss=0.0, spec=0.5, stops=None,
                 coords='Object'):
    """Vertical colour gradient in object space (y0 -> bottom colour, y1 -> top colour)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = _principled(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = y0
    mr.inputs['From Max'].default_value = y1
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs[coords], sep.inputs[0])
    nt.links.new(sep.outputs['Y'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    cr = ramp.color_ramp
    cr.interpolation = 'EASE'
    cr.elements[0].color = (*lin(bottom), 1)
    cr.elements[1].color = (*lin(top), 1)
    if stops:
        for pos, col in stops:
            e = cr.elements.new(pos)
            e.color = (*lin(col), 1)
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    p.inputs['Specular IOR Level'].default_value = spec
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.05
    if sss:
        p.inputs['Subsurface Weight'].default_value = sss
        p.inputs['Subsurface Scale'].default_value = 0.03
    _MATS[name] = m
    return m


def mat_snow(name='snow'):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = _principled(m)
    p.inputs['Base Color'].default_value = (*lin(C.PAL['snow']), 1)
    p.inputs['Roughness'].default_value = 0.42
    p.inputs['Specular IOR Level'].default_value = 0.45
    p.inputs['Subsurface Weight'].default_value = 0.35
    p.inputs['Subsurface Radius'].default_value = (0.55, 0.75, 1.0)
    p.inputs['Subsurface Scale'].default_value = 0.025
    p.inputs['Coat Weight'].default_value = 0.25
    p.inputs['Coat Roughness'].default_value = 0.2
    _MATS[name] = m
    return m


def mat_holdout_white(name='maskwhite'):
    """Pure white emission (for the shine-mask pass)."""
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, 1, 1, 1)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    _MATS[name] = m
    return m


def mat_black(name='maskblack'):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (0, 0, 0, 1)
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    _MATS[name] = m
    return m


def set_mat(ob, m):
    if ob.type == 'META':
        ob.data.materials.clear()
        ob.data.materials.append(m)
        return ob
    ob.data.materials.clear()
    ob.data.materials.append(m)
    return ob


# ------------------------------------------------------------------ glyph geometry
def _text_curve(body, fpath, size):
    cu = bpy.data.curves.new('txt', 'FONT')
    cu.body = body
    cu.font = font(fpath)
    cu.size = size
    cu.resolution_u = 6
    cu.render_resolution_u = 12
    return cu


def glyph_outline(body, fpath, size=1.0):
    """Closed outline loops of the glyph(s) in the XY plane: list of [(x, y), ...] + bbox."""
    cu = _text_curve(body, fpath, size)
    cu.fill_mode = 'NONE'
    cu.resolution_u = 10
    ob = bpy.data.objects.new('tmp_outline', cu)
    link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = ob.evaluated_get(dg).to_mesh()
    verts = [v.co.copy() for v in me.vertices]
    adj = {i: [] for i in range(len(verts))}
    for e in me.edges:
        a, b = e.vertices
        adj[a].append(b)
        adj[b].append(a)
    ob.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    seen = set()
    loops = []
    for s in range(len(verts)):
        if s in seen or not adj[s]:
            continue
        loop = [s]
        seen.add(s)
        prev, cur = None, s
        while True:
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        if len(loop) > 2:
            loops.append([(verts[i].x, verts[i].y) for i in loop])
    xs = [p[0] for l in loops for p in l]
    ys = [p[1] for l in loops for p in l]
    bbox = (min(xs), min(ys), max(xs), max(ys))
    return loops, bbox


def point_inside(loops, x, y):
    inside = False
    for l in loops:
        n = len(l)
        j = n - 1
        for i in range(n):
            xi, yi = l[i]
            xj, yj = l[j]
            if (yi > y) != (yj > y):
                xc = xj + (y - yj) * (xi - xj) / (yi - yj)
                if x < xc:
                    inside = not inside
            j = i
    return inside


def resample(loop, step):
    pts = loop + [loop[0]]
    out = []
    acc = 0.0
    for i in range(len(pts) - 1):
        a = Vector(pts[i])
        b = Vector(pts[i + 1])
        L = (b - a).length
        if L < 1e-9:
            continue
        t = -acc
        while t + step <= L + 1e-9:
            t += step
            out.append(a + (b - a) * (t / L))
        acc = L - t
    return out


def is_hole(loops, k):
    """True when loop k lies inside another loop (the counter of o, ㅇ, b ...)."""
    x, y = loops[k][0]
    depth = 0
    for j, l in enumerate(loops):
        if j != k and point_inside([l], x, y):
            depth += 1
    return depth % 2 == 1


def edge_samples(loops, step=0.02, skip_holes=False):
    """Outline samples with the OUTWARD normal: [(p, n), ...] per loop.  skip_holes: leave out the
    inner outlines of counters (no snow lumps sitting inside an o / ㅇ)."""
    res = []
    for k, l in enumerate(loops):
        if skip_holes and is_hole(loops, k):
            continue
        pts = resample(l, step)
        n = len(pts)
        if n < 4:
            continue
        smp = []
        for i in range(n):
            t = (pts[(i + 1) % n] - pts[i - 1]).normalized()
            nrm = Vector((t.y, -t.x))
            q = pts[i] + nrm * 0.006
            if point_inside(loops, q.x, q.y):
                nrm = -nrm
            smp.append((pts[i], nrm))
        res.append(smp)
    return res


def text_mesh(body, fpath, size, depth, bevel, mat, name, offset=0.0, bevel_res=5, dx=0.0, dy=0.0,
              parent=None):
    """3D letters: a text object extruded to +-depth with a round bevel, converted to a mesh."""
    cu = _text_curve(body, fpath, size)
    cu.extrude = depth
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    cu.offset = offset
    cu.fill_mode = 'BOTH'
    ob = bpy.data.objects.new(name, cu)
    link(ob)
    ob.data.materials.append(mat)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    me.transform(Matrix.Translation((dx, dy, 0)))
    for p in me.polygons:
        p.use_smooth = True
    mo = bpy.data.objects.new(name, me)
    link(mo, parent)
    try:
        mo.data.set_sharp_from_angle(angle=math.radians(50))
    except Exception:
        pass
    return mo


# ------------------------------------------------------------------ puffy snow (metaballs)
def snow_cap(samples, depth, name, parent=None, r=0.06, seed=1, drips=0.18, up=0.42, front_z=None,
             dx=0.0, dy=0.0, mat=None, res=0.012, thick=1.0, side_drip=True):
    """Snow along every up-facing outline edge: a row of soft capsules running through the letter's
    depth (so the cap covers the top bevel front and back), lumpy radii, a few drips hanging down the
    front face.  `samples` = edge_samples(); `depth` = half depth of the letter (front face z)."""
    rnd = random.Random(seed)
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res * 2
    mb.render_resolution = res
    mb.threshold = 0.6
    ob = bpy.data.objects.new(name, mb)
    link(ob, parent)
    zf = depth if front_z is None else front_z
    rot = Quaternion((0, 1, 0), math.radians(90))      # capsule axis X -> Z (through the depth)
    count = 0
    for loop in samples:
        n = len(loop)
        flags = [nrm.y > up for (_p, nrm) in loop]
        for i, (p, nrm) in enumerate(loop):
            if not flags[i]:
                continue
            w = min(1.0, (nrm.y - up) / 0.25 + 0.35)      # thinner where the edge turns to a side
            rr = r * thick * (0.80 + 0.35 * rnd.random()) * (0.55 + 0.45 * w)
            c = p + Vector((0, rr * 0.30)) - nrm * rr * 0.05
            el = mb.elements.new(type='CAPSULE')
            el.co = (c.x + dx, c.y + dy, 0.0)
            el.radius = rr
            el.size_x = max(0.0, zf - rr * 0.35)
            el.rotation = rot
            el.stiffness = 2.0
            count += 1
            # little lumps on the top of the cap
            if rnd.random() < 0.18:
                el2 = mb.elements.new(type='BALL')
                el2.co = (c.x + dx + rnd.uniform(-0.01, 0.01), c.y + dy + rr * 0.45, rnd.uniform(-zf, zf) * 0.7)
                el2.radius = rr * 0.75
                el2.stiffness = 1.6
            # drips hanging over the front face where the edge is close to flat
            if rnd.random() < drips * w and nrm.y > 0.80:
                _drip(mb, c.x + dx, c.y + dy, zf, r, rnd)
        # drips at the ends of a run (edge turning down the side)
        if side_drip:
            for i in range(n):
                if (flags[i] and not flags[(i + 1) % n]) or (flags[i] and not flags[i - 1]):
                    if rnd.random() < 0.22:
                        p, nrm = loop[i]
                        _drip(mb, p.x + dx, p.y + dy, zf, r * 0.85, rnd)
    if mat is not None:
        mb.materials.append(mat)
    return ob, count


def _drip(mb, x, y, zf, r, rnd):
    """A cartoon drip on the front face: a soft neck + a round drop at its end."""
    L = r * (0.7 + 1.1 * rnd.random())
    el = mb.elements.new(type='ELLIPSOID')
    el.co = (x, y - L * 0.45, zf + r * 0.05)
    el.radius = r * 0.62
    el.size_x = 0.55
    el.size_y = 0.45 + L / r * 0.45
    el.size_z = 0.42
    el.stiffness = 2.0
    b = mb.elements.new(type='BALL')
    b.co = (x, y - L * 0.95, zf + r * 0.08)
    b.radius = r * 0.62
    b.stiffness = 1.7


def snow_to_mesh(ob):
    """Bake a metaball object into a smooth mesh (stable, and lets several share a family)."""
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    mats = list(ob.data.materials)
    mo = bpy.data.objects.new(ob.name + '_m', me)
    link(mo, ob.parent)
    mo.matrix_parent_inverse = ob.matrix_parent_inverse.copy()
    mo.location = ob.location
    for p in me.polygons:
        p.use_smooth = True
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    bpy.data.objects.remove(ob)
    return mo


# ------------------------------------------------------------------ 2D shapes -> beveled solids
def poly_solid(name, pts, depth, bevel, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel_res=4,
               offset=0.0):
    """Closed 2D polygon (XY) extruded to +-depth with a round bevel (like the letters)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '2D'
    cu.fill_mode = 'BOTH'
    cu.extrude = depth
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    cu.offset = offset
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, (x, y) in enumerate(pts):
        sp.points[i].co = (x, y, 0, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(name, cu)
    link(ob)
    cu.materials.append(mat)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    for p in me.polygons:
        p.use_smooth = True
    mo = bpy.data.objects.new(name, me)
    mo.location = loc
    mo.rotation_euler = rot
    link(mo, parent)
    try:
        mo.data.set_sharp_from_angle(angle=math.radians(50))
    except Exception:
        pass
    return mo


def rounded_rect(w, h, r, seg=8):
    pts = []
    cs = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
          (w / 2 - r, -h / 2 + r, 270)]
    for cx, cy, a0 in cs:
        for k in range(seg + 1):
            a = math.radians(a0 + 90.0 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def star_pts(R, r, n=4, rot=0.0, seg=6, pinch=0.55):
    """A soft n-point sparkle: concave sides (quadratic curves through the inner radius)."""
    pts = []
    for i in range(n):
        a0 = rot + 2 * math.pi * i / n
        a1 = rot + 2 * math.pi * (i + 1) / n
        p0 = Vector((math.cos(a0) * R, math.sin(a0) * R))
        p2 = Vector((math.cos(a1) * R, math.sin(a1) * R))
        am = (a0 + a1) / 2
        p1 = Vector((math.cos(am) * r * pinch, math.sin(am) * r * pinch))
        for k in range(seg):
            t = k / seg
            q = (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t * t * p2
            pts.append((q.x, q.y))
    return pts


def ellipsoid(name, rx, ry, rz, mat, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=32, rings=16):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=(rx, ry, rz), verts=bm.verts)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = rot
    me.materials.append(mat)
    return link(ob, parent)


def capsule2d(name, a, b, rad, depth, mat, parent=None, z=0.0, seg=8):
    """A rounded stroke from a to b (2D) with half-thickness `rad`, extruded thin."""
    a = Vector(a)
    b = Vector(b)
    d = (b - a)
    L = d.length
    ang = math.atan2(d.y, d.x)
    pts = []
    for k in range(seg + 1):
        t = math.pi / 2 + math.pi * k / seg
        pts.append((rad * math.cos(t), rad * math.sin(t)))
    for k in range(seg + 1):
        t = -math.pi / 2 + math.pi * k / seg
        pts.append((L + rad * math.cos(t), rad * math.sin(t)))
    return poly_solid(name, pts, depth, min(depth, rad) * 0.9, mat, parent=parent, loc=(a.x, a.y, z),
                      rot=(0, 0, ang), bevel_res=3)


def emblem(name, R, parent=None, loc=(0, 0, 0), rot_deg=0.0, depth=0.05):
    """The 눈꽃 (snow-flower) emblem: six round petals that are also the arms of a snowflake,
    ice-blue snowflake strokes on the petals, a golden centre.  Front = +Z."""
    root = empty(name, loc=loc, rot=(0, 0, math.radians(rot_deg)), parent=parent)
    pet = mat_gradient(name + '_petal', '#FFFFFF', '#BFE2FF', -R * 0.05, R * 0.95, rough=0.35, coat=0.5,
                       sss=0.15)
    line = mat_flat(name + '_line', C.PAL['emblem_line'], rough=0.3, coat=0.4)
    core = mat_gradient(name + '_core', '#FFE48A', '#F2A21C', -R * 0.22, R * 0.22, rough=0.25, coat=0.7)
    tip = mat_flat(name + '_tip', '#8FD0FF', rough=0.3, coat=0.4)
    for k in range(6):
        a = math.radians(90 + 60 * k)
        pr = empty(name + '_p%d' % k, rot=(0, 0, a - math.pi / 2), parent=root)
        ellipsoid(name + '_petal%d' % k, R * 0.27, R * 0.40, depth * 1.6, pet, parent=pr, loc=(0, R * 0.52, 0))
        # snowflake arm on the petal: a stroke + a V branch
        capsule2d(name + '_arm%d' % k, (0, R * 0.30), (0, R * 0.80), R * 0.045, depth * 0.35, line, parent=pr,
                  z=depth * 1.45)
        for sgn in (-1, 1):
            capsule2d(name + '_br%d%d' % (k, sgn), (0, R * 0.60), (sgn * R * 0.13, R * 0.76), R * 0.036,
                      depth * 0.3, line, parent=pr, z=depth * 1.40)
        # small ice spike between petals (keeps the snowflake reading at small sizes)
        sp = empty(name + '_s%d' % k, rot=(0, 0, a + math.radians(30) - math.pi / 2), parent=root)
        ellipsoid(name + '_spike%d' % k, R * 0.07, R * 0.16, depth * 0.8, tip, parent=sp, loc=(0, R * 0.80, 0))
    ellipsoid(name + '_core', R * 0.25, R * 0.25, depth * 2.0, core, parent=root, loc=(0, 0, depth * 0.6))
    # tiny highlight dots on the core
    return root


def wood_mat(name, top, bottom, h):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = _principled(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1.0, 14.0, 1.0)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 2.2
    nz.inputs['Detail'].default_value = 3.0
    nz.inputs['Distortion'].default_value = 0.8
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -h / 2
    mr.inputs['From Max'].default_value = h / 2
    nt.links.new(sep.outputs['Y'], mr.inputs['Value'])
    grad = nt.nodes.new('ShaderNodeValToRGB')
    grad.color_ramp.elements[0].color = (*lin(bottom), 1)
    grad.color_ramp.elements[1].color = (*lin(top), 1)
    nt.links.new(mr.outputs['Result'], grad.inputs['Fac'])
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    nt.links.new(grad.outputs['Color'], mix.inputs[6])
    gr2 = nt.nodes.new('ShaderNodeValToRGB')
    gr2.color_ramp.elements[0].position = 0.35
    gr2.color_ramp.elements[0].color = (0.70, 0.62, 0.55, 1)
    gr2.color_ramp.elements[1].position = 0.65
    gr2.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(nz.outputs['Fac'], gr2.inputs['Fac'])
    nt.links.new(gr2.outputs['Color'], mix.inputs[7])
    mix.inputs['Factor'].default_value = 1.0
    nt.links.new(mix.outputs[2], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.55
    p.inputs['Coat Weight'].default_value = 0.25
    _MATS[name] = m
    return m


def label_pass(pieces):
    """Swap every material for a flat emission colour per piece (an ID image for splitting the logo).
    `pieces` = {piece_index: [objects]}; colours encode the index in the red channel (index * 16)."""
    for idx, obs in pieces.items():
        v = (idx * 16 + 8) / 255.0
        m = bpy.data.materials.new('label%d' % idx)
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        em.inputs['Color'].default_value = (*lin((v, 0.0, 0.0)), 1)
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        for ob in obs:
            if ob.type in ('MESH', 'META') and ob.data is not None:
                ob.data.materials.clear()
                ob.data.materials.append(m)
