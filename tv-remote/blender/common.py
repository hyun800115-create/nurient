"""Shared Blender helpers for the intro renders: materials, mesh building, lights, camera, render."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

_mats = {}


def reset():
    """Start from an empty scene with Cycles on the CPU."""
    _mats.clear()
    import addon_utils
    addon_utils.enable("cycles", default_set=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 96
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.max_bounces = 6
    sc.cycles.transparent_max_bounces = 8
    sc.render.resolution_x, sc.render.resolution_y = 810, 1440
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    sc.render.image_settings.file_format = "PNG"
    return sc


def srgb(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


def mat(name, color="#808080", rough=0.5, metal=0.0, coat=0.0, emit=None, strength=0.0, sss=0.0, trans=0.0, ior=1.45, spec=0.5):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color) if isinstance(color, str) else color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Specular IOR Level"].default_value = spec
    if coat:
        b.inputs["Coat Weight"].default_value = coat
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit)
        b.inputs["Emission Strength"].default_value = strength
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Scale"].default_value = 0.01
    if trans:
        b.inputs["Transmission Weight"].default_value = trans
        b.inputs["IOR"].default_value = ior
    _mats[name] = m
    return m


def tex_mat(name, build):
    """Material whose node tree is filled in by build(nodes, links, bsdf)."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    build(nt.nodes, nt.links, nt.nodes["Principled BSDF"])
    _mats[name] = m
    return m


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_obj(name, bm, material=None, smooth=True, mods=()):
    if smooth:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = link(bpy.data.objects.new(name, me))
    if material is not None:
        mats = material if isinstance(material, (list, tuple)) else [material]
        for m in mats:
            me.materials.append(m)
    for kind, opts in mods:
        md = ob.modifiers.new(kind.lower(), kind)
        for k, v in opts.items():
            setattr(md, k, v)
    return ob


def frame_from(d, up=None):
    d = d.normalized()
    up = up or (Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0)))
    u = d.cross(up).normalized()
    v = d.cross(u).normalized()
    return u, v


def tube(name, pts, radii, material, segs=20, cap_start=False, cap_end=False, mods=()):
    """Smooth tube through pts; radii are floats or (rx, ry). Frames are parallel-transported."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    u = v = None
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        if u is None:
            u, v = frame_from(d)
        else:
            u = (u - d * u.dot(d)).normalized()
            v = d.cross(u).normalized()
        r = radii[i]
        rx, ry = (r, r) if not isinstance(r, (tuple, list)) else r
        rings.append([bm.verts.new(p + u * math.cos(a) * rx + v * math.sin(a) * ry)
                      for a in (2 * math.pi * k / segs for k in range(segs))])
    for a, b in zip(rings, rings[1:]):
        for k in range(segs):
            bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))
    if cap_end:
        bm.faces.new(rings[-1])
    return mesh_obj(name, bm, material, mods=mods)


def ellipsoid(name, center, radii, material, rot=None, segs=24, rings=14, mods=()):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    M = Matrix.Translation(Vector(center)) @ (rot.to_4x4() if rot is not None else Matrix()) @ Matrix.Diagonal((*radii, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    return mesh_obj(name, bm, material, mods=mods)


def box(name, center, size, material, rot=None, bevel=0.0, segs=3, smooth=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    M = Matrix.Translation(Vector(center)) @ (rot.to_4x4() if rot is not None else Matrix()) @ Matrix.Diagonal((*size, 1))
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    mods = [("BEVEL", {"width": bevel, "segments": segs, "limit_method": "ANGLE"})] if bevel else []
    return mesh_obj(name, bm, material, smooth=bool(bevel) if smooth is None else smooth, mods=mods)


def cylinder(name, p0, p1, r0, material, r1=None, segs=24, caps=True, bevel=0.0):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r0, radius2=r1 if r1 is not None else r0, depth=d.length)
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((p0 + p1) / 2) @ rot, verts=bm.verts)
    mods = [("BEVEL", {"width": bevel, "segments": 3, "limit_method": "ANGLE"})] if bevel else []
    ob = mesh_obj(name, bm, material, smooth=True, mods=mods)
    return ob


def curve_tube(name, pts, radius, material, resolution=12):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.resolution_u = resolution
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(pts))
    ob = link(bpy.data.objects.new(name, cu))
    cu.materials.append(material)
    return ob


def sag(p0, p1, depth, n=16):
    """Points of a hanging wire between p0 and p1."""
    p0, p1 = Vector(p0), Vector(p1)
    return [p0.lerp(p1, i / n) - Vector((0, 0, depth * 4 * (i / n) * (1 - i / n))) for i in range(n + 1)]


def text_obj(name, body, loc, size, material, rot=(math.pi / 2, 0, 0), align="CENTER", extrude=0.0):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    ob = link(bpy.data.objects.new(name, cu))
    ob.location = loc
    ob.rotation_euler = rot
    cu.materials.append(material)
    return ob


def image_plane(name, path, center, w, h, rot=(math.pi / 2, 0, 0), emit=0.0, alpha=False):
    img = bpy.data.images.load(path)
    def build(nodes, links, bsdf):
        t = nodes.new("ShaderNodeTexImage")
        t.image = img
        links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.45
        if emit:
            links.new(t.outputs["Color"], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = emit
        if alpha:
            links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    m = tex_mat(name + "_mat", build)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    uv = bm.loops.layers.uv.new()
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (co.x + 0.5, co.y + 0.5)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((w, h, 1, 1)), verts=bm.verts)
    ob = mesh_obj(name, bm, m, smooth=False)
    ob.location = center
    ob.rotation_euler = rot
    return ob


def sun(direction_euler, strength=3.0, color="#fff4e6", angle=0.02):
    d = bpy.data.lights.new("sun", "SUN")
    d.energy = strength
    d.color = srgb(color)[:3]
    d.angle = angle
    ob = link(bpy.data.objects.new("sun", d))
    ob.rotation_euler = direction_euler
    return ob


def area(loc, target, power, size=2.0, color="#ffffff"):
    d = bpy.data.lights.new("area", "AREA")
    d.energy = power
    d.size = size
    d.color = srgb(color)[:3]
    ob = link(bpy.data.objects.new("area", d))
    ob.location = loc
    look_at(ob, target)
    return ob


def world(color="#bcd6ee", strength=1.0):
    w = bpy.data.worlds.new("world")
    bpy.context.scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    bg.inputs[0].default_value = srgb(color)
    bg.inputs[1].default_value = strength
    return w


def gradient_world(top, bottom, strength=1.0):
    """Sky that goes from bottom (horizon) to top (zenith)."""
    w = bpy.data.worlds.new("world")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb(bottom)
    ramp.color_ramp.elements[1].position = 0.6
    ramp.color_ramp.elements[1].color = srgb(top)
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    mp = nt.nodes.new("ShaderNodeMapRange")
    mp.inputs["From Min"].default_value = 0.5
    mp.inputs["From Max"].default_value = 1.0
    nt.links.new(sep.outputs["Z"], mp.inputs["Value"])
    nt.links.new(mp.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs[0])
    bg.inputs[1].default_value = strength
    return w


def look_at(ob, target, roll=0.0):
    d = Vector(target) - ob.location
    q = d.to_track_quat("-Z", "Y")
    ob.rotation_euler = q.to_euler()
    if roll:
        ob.rotation_euler.rotate_axis("Z", roll)


def camera(loc, target, lens=50, fstop=0.0, focus=None):
    cd = bpy.data.cameras.new("cam")
    cd.lens = lens
    cd.sensor_width = 36
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 36
    ob = link(bpy.data.objects.new("cam", cd))
    ob.location = loc
    look_at(ob, target)
    bpy.context.scene.camera = ob
    if fstop:
        cd.dof.use_dof = True
        cd.dof.aperture_fstop = fstop
        cd.dof.focus_distance = (Vector(focus or target) - Vector(loc)).length
    return ob


def ground(size=80, material=None, z=0.0):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size / 2)
    bmesh.ops.translate(bm, vec=Vector((0, 0, z)), verts=bm.verts)
    return mesh_obj("ground", bm, material, smooth=False)


def project(points):
    """World points -> normalized image coords (u to the right, v down) for the active camera."""
    sc = bpy.context.scene
    bpy.context.view_layer.update()
    cam = sc.camera
    out = {}
    for k, p in points.items():
        co = world_to_camera_view(sc, cam, Vector(p))
        out[k] = [round(co.x, 4), round(1 - co.y, 4)]
    return out


def render(path, samples=None):
    sc = bpy.context.scene
    if samples:
        sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
