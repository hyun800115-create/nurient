"""Props for the intro renders: the company Ray EV, charger, street, ladder, pole, manhole and room pieces."""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix
from common import mat, tex_mat, srgb, mesh_obj, tube, ellipsoid, box, cylinder, curve_tube, sag, text_obj, image_plane, link


# ---------- materials ----------
def _plane_coords(nodes, links, tc, plane):
    """Brick textures pattern X/Y; remap so a wall in the given plane gets the pattern."""
    sep = nodes.new("ShaderNodeSeparateXYZ")
    comb = nodes.new("ShaderNodeCombineXYZ")
    links.new(tc.outputs["Object"], sep.inputs[0])
    a, b, c = {"XZ": ("X", "Z", "Y"), "YZ": ("Y", "Z", "X"), "XY": ("X", "Y", "Z")}[plane]
    links.new(sep.outputs[a], comb.inputs["X"])
    links.new(sep.outputs[b], comb.inputs["Y"])
    links.new(sep.outputs[c], comb.inputs["Z"])
    return comb.outputs[0]


def facade(name, wall="#d5dbe2", glass="#9fb6cc", glass2="#8aa3bb", scale=(1.6, 1.35), mortar=0.42, plane="XZ"):
    def build(nodes, links, bsdf):
        tc = nodes.new("ShaderNodeTexCoord")
        br = nodes.new("ShaderNodeTexBrick")
        br.offset = 0.0
        br.squash = 1.0
        br.inputs["Color1"].default_value = srgb(glass)
        br.inputs["Color2"].default_value = srgb(glass2)
        br.inputs["Mortar"].default_value = srgb(wall)
        br.inputs["Scale"].default_value = 1.0
        br.inputs["Mortar Size"].default_value = mortar
        br.inputs["Brick Width"].default_value = scale[0]
        br.inputs["Row Height"].default_value = scale[1]
        links.new(_plane_coords(nodes, links, tc, plane), br.inputs["Vector"])
        links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
        rough = nodes.new("ShaderNodeMapRange")
        links.new(br.outputs["Fac"], rough.inputs["Value"])
        rough.inputs["To Min"].default_value = 0.15
        rough.inputs["To Max"].default_value = 0.8
        links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    return tex_mat(name, build)


def bricks(name="bricks", c1="#a5644a", c2="#8f553f", mortar="#cbbfae", plane="YZ"):
    def build(nodes, links, bsdf):
        tc = nodes.new("ShaderNodeTexCoord")
        br = nodes.new("ShaderNodeTexBrick")
        br.inputs["Color1"].default_value = srgb(c1)
        br.inputs["Color2"].default_value = srgb(c2)
        br.inputs["Mortar"].default_value = srgb(mortar)
        br.inputs["Scale"].default_value = 1.0
        br.inputs["Mortar Size"].default_value = 0.012
        br.inputs["Brick Width"].default_value = 0.24
        br.inputs["Row Height"].default_value = 0.075
        links.new(_plane_coords(nodes, links, tc, plane), br.inputs["Vector"])
        links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.85
    return tex_mat(name, build)


def noisy(name, c1, c2, scale=8.0, rough=0.85):
    def build(nodes, links, bsdf):
        n = nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = 8
        r = nodes.new("ShaderNodeValToRGB")
        r.color_ramp.elements[0].color = srgb(c1)
        r.color_ramp.elements[1].color = srgb(c2)
        links.new(n.outputs["Fac"], r.inputs["Fac"])
        links.new(r.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = rough
    return tex_mat(name, build)


def planks(name="planks", c1="#b3804f", c2="#9c6c41", mortar="#7a5233"):
    def build(nodes, links, bsdf):
        tc = nodes.new("ShaderNodeTexCoord")
        br = nodes.new("ShaderNodeTexBrick")
        br.offset = 0.5
        br.inputs["Color1"].default_value = srgb(c1)
        br.inputs["Color2"].default_value = srgb(c2)
        br.inputs["Mortar"].default_value = srgb(mortar)
        br.inputs["Scale"].default_value = 1.0
        br.inputs["Mortar Size"].default_value = 0.004
        br.inputs["Brick Width"].default_value = 1.2
        br.inputs["Row Height"].default_value = 0.18
        links.new(tc.outputs["Object"], br.inputs["Vector"])
        links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.4
    return tex_mat(name, build)


def stripes(name, c1="#ffcc1f", c2="#1b1b1b", scale=6.0):
    def build(nodes, links, bsdf):
        tc = nodes.new("ShaderNodeTexCoord")
        w = nodes.new("ShaderNodeTexWave")
        w.wave_type = "BANDS"
        w.bands_direction = "DIAGONAL"
        w.inputs["Scale"].default_value = scale
        w.inputs["Distortion"].default_value = 0
        r = nodes.new("ShaderNodeValToRGB")
        r.color_ramp.interpolation = "CONSTANT"
        r.color_ramp.elements[0].color = srgb(c1)
        r.color_ramp.elements[1].position = 0.5
        r.color_ramp.elements[1].color = srgb(c2)
        links.new(tc.outputs["Object"], w.inputs["Vector"])
        links.new(w.outputs["Fac"], r.inputs["Fac"])
        links.new(r.outputs["Color"], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.5
    return tex_mat(name, build)


# ---------- the company EV (front at +X, ground at z = 0, centred on loc) ----------
def ray_ev(loc=(0, 0, 0), yaw=0.0, logo_path=None, driver=None, glass_clear=False, wheel_spin=None):
    """Blue boxy city EV. Returns dict of anchor points and created objects."""
    paint = mat("ray_paint", "#2459c8", rough=0.2, metal=0.55, coat=1.0)
    black = mat("ray_black", "#111418", rough=0.4)
    trim = mat("ray_trim", "#1a1d22", rough=0.6)
    glass = mat("ray_glass_clear", "#3c4a58", rough=0.02, trans=1.0) if glass_clear else mat("ray_glass", "#0c131c", rough=0.04, spec=0.8)
    lamp = mat("ray_lamp", "#f5f7fa", rough=0.1, emit="#fff4dc", strength=1.5)
    tail = mat("ray_tail", "#c4122c", rough=0.2, emit="#ff1a33", strength=0.6)
    tire = mat("tire", "#141516", rough=0.85)
    rim = mat("rim", "#c3c9d0", rough=0.25, metal=1.0)
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(yaw, 4, "Z")
    W = lambda v: M @ Vector(v)
    R3 = M.to_3x3()
    objs = []

    def extrude(name, prof, y0, y1, material, bevel=0.05, open_top=None):
        bm = bmesh.new()
        a = [bm.verts.new(W((x, y0, z))) for x, z in prof]
        b = [bm.verts.new(W((x, y1, z))) for x, z in prof]
        n = len(prof)
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        for i in range(n):
            j = (i + 1) % n
            if open_top is not None and prof[i][1] >= open_top and prof[j][1] >= open_top:
                continue
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method="BEAUTY", ngon_method="EAR_CLIP")
        ob = mesh_obj(name, bm, material, mods=[("BEVEL", {"width": bevel, "segments": 4, "limit_method": "ANGLE"})])
        objs.append(ob)
        return ob

    def arc(cx, cz, r, a0, a1, n=12):
        return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cz + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]

    lower = [(-1.80, 0.32)] + arc(-1.26, 0.30, 0.37, 180, 0) + arc(1.26, 0.30, 0.37, 180, 0) + \
            [(1.80, 0.33), (1.84, 0.55), (1.83, 0.78), (1.76, 0.93), (1.45, 1.03), (1.28, 1.08), (-1.83, 1.08), (-1.84, 0.6)]
    lower = list(reversed(lower))
    extrude("ray_body", lower, -0.795, 0.795, paint, open_top=1.079)
    inner = mat("ray_inner", "#24272c", rough=0.8)
    for y in (-0.74, 0.74):
        objs.append(box("ray_card", W((-0.2, y, 0.8)), (3.2, 0.03, 0.55), inner, rot=R3))
    objs.append(box("ray_floor", W((-0.2, 0, 0.42)), (3.3, 1.45, 0.04), inner, rot=R3))
    roof = [(-1.80, 1.595), (1.02, 1.595), (0.86, 1.70), (-1.66, 1.715), (-1.81, 1.655)]
    extrude("ray_roof", roof, -0.765, 0.765, paint, bevel=0.04)
    # pillars
    for y in (-0.76, 0.76):
        objs.append(tube("ray_apillar", [W((1.46, y, 1.03)), W((1.03, y * 0.99, 1.62))], [0.045, 0.045], paint))
        objs.append(box("ray_bpillar", W((0.0, y, 1.34)), (0.11, 0.05, 0.54), black, rot=R3))
        objs.append(box("ray_cpillar", W((-1.02, y, 1.34)), (0.09, 0.05, 0.54), black, rot=R3))
        objs.append(box("ray_dpillar", W((-1.775, y, 1.34)), (0.07, 0.06, 0.54), paint, rot=R3, bevel=0.015))
    # glass
    def pane(name, pts):
        bm = bmesh.new()
        bm.faces.new([bm.verts.new(W(p)) for p in pts])
        objs.append(mesh_obj(name, bm, glass, smooth=False))
    for y in (-0.775, 0.775):
        pane("ray_side", [(-1.74, y, 1.09), (1.33, y, 1.09), (1.0, y, 1.585), (-1.74, y, 1.585)])
    pane("ray_wind", [(1.44, -0.73, 1.045), (1.44, 0.73, 1.045), (1.04, 0.72, 1.6), (1.04, -0.72, 1.6)])
    pane("ray_rear", [(-1.835, -0.66, 1.12), (-1.835, -0.66, 1.57), (-1.835, 0.66, 1.57), (-1.835, 0.66, 1.12)])
    # lights, bumpers, mirrors, handles, seams
    for y in (-1, 1):
        objs.append(box("ray_head", W((1.78, y * 0.6, 0.86)), (0.08, 0.26, 0.11), lamp, rot=R3, bevel=0.03))
        objs.append(box("ray_tail", W((-1.84, y * 0.68, 1.0)), (0.03, 0.1, 0.32), tail, rot=R3, bevel=0.01))
        objs.append(box("ray_mirror", W((1.18, y * 0.86, 1.13)), (0.1, 0.12, 0.08), paint, rot=R3, bevel=0.02))
        for hx in (0.62, -0.62):
            objs.append(box("ray_handle", W((hx, y * 0.802, 0.98)), (0.12, 0.012, 0.025), black, rot=R3, bevel=0.005))
        for sx in (0.02, -1.0):
            objs.append(box("ray_seam", W((sx, y * 0.797, 0.68)), (0.008, 0.006, 0.78), trim, rot=R3, smooth=False))
    objs.append(box("ray_fbump", W((1.82, 0, 0.42)), (0.08, 1.5, 0.2), trim, rot=R3, bevel=0.03))
    objs.append(box("ray_rbump", W((-1.83, 0, 0.42)), (0.07, 1.5, 0.2), trim, rot=R3, bevel=0.03))
    objs.append(box("ray_grille", W((1.835, 0, 0.62)), (0.03, 0.55, 0.12), black, rot=R3, bevel=0.02))
    objs.append(box("ray_port", W((1.838, -0.3, 0.78)), (0.02, 0.13, 0.1), mat("port", "#e8eef4", rough=0.3), rot=R3, bevel=0.01))
    objs.append(box("ray_skirt", W((0, 0, 0.33)), (1.6, 1.62, 0.07), trim, rot=R3, bevel=0.02))
    # wheels
    spin_objs = []
    for wx in (-1.26, 1.26):
        for y in (-0.7, 0.7):
            c = W((wx, y, 0.30))
            ax = R3 @ Vector((0, 1, 0))
            t = cylinder("ray_tire", c - ax * 0.095, c + ax * 0.095, 0.30, tire, segs=40, bevel=0.04)
            r = cylinder("ray_rim", c + ax * (0.08 if y > 0 else -0.08), c + ax * (0.1 if y > 0 else -0.1), 0.19, rim, segs=32, bevel=0.01)
            objs += [t, r]
            hub = bpy.data.objects.new("hub", None)
            link(hub)
            hub.location = c
            hub.rotation_euler = (0, 0, yaw)
            side = 1 if y > 0 else -1
            for k in range(5):
                a = 2 * math.pi * k / 5
                sp = box("ray_spoke", Vector((0.09 * math.cos(a), side * 0.105, 0.09 * math.sin(a))), (0.16, 0.02, 0.035), rim,
                         rot=Matrix.Rotation(-a, 3, "Y"), bevel=0.005)
                sp.parent = hub
                objs.append(sp)
            spin_objs.append(hub)
    if wheel_spin:
        f0, f1, ang = wheel_spin
        for hub in spin_objs:
            hub.rotation_mode = "XYZ"
            hub.rotation_euler = (0, 0, yaw)
            hub.keyframe_insert("rotation_euler", frame=f0)
            hub.rotation_euler.rotate_axis("Y", ang)
            hub.keyframe_insert("rotation_euler", frame=f1)
    # decal with the company logo on both sides
    if logo_path:
        for side in (-1, 1):
            p = W((-0.5, side * 0.803, 0.86))
            ob = image_plane(f"ray_logo{side}", logo_path, p, 0.95, 0.182, rot=(math.pi / 2, 0, yaw + (0 if side < 0 else math.pi)))
            objs.append(ob)
    # cabin: seats, dash, wheel
    seat = mat("seat", "#2a2d33", rough=0.8)
    objs.append(box("ray_dash", W((1.2, 0, 1.0)), (0.35, 1.45, 0.16), trim, rot=R3, bevel=0.03))
    objs.append(box("ray_seat_base", W((0.35, 0.38, 0.62)), (0.5, 0.48, 0.14), seat, rot=R3, bevel=0.04))
    objs.append(box("ray_seat_back", W((0.08, 0.38, 0.98)), (0.14, 0.48, 0.66), seat, rot=R3 @ Matrix.Rotation(-0.18, 3, "Y"), bevel=0.05))
    objs.append(box("ray_seat_head", W((0.02, 0.38, 1.42)), (0.1, 0.26, 0.2), seat, rot=R3, bevel=0.04))
    wheel_c = W((0.86, 0.38, 1.08))
    tor = bpy.ops.mesh.primitive_torus_add(location=wheel_c, major_radius=0.18, minor_radius=0.022,
                                           rotation=(0, math.radians(90 - 28), yaw), major_segments=40, minor_segments=10)
    bpy.context.object.data.materials.append(black)
    objs.append(bpy.context.object)
    return dict(objs=objs, port=W((1.84, -0.3, 0.78)), rear_tire=W((-1.26, -0.8, 0.36)), front_tire=W((1.26, -0.8, 0.36)),
                roof=W((-0.4, -0.5, 1.72)), window=W((0.5, -0.78, 1.35)), M=M)


def charger(loc, yaw=0.0, percent="85%"):
    M = Matrix.Translation(Vector(loc)) @ Matrix.Rotation(yaw, 4, "Z")
    W = lambda v: M @ Vector(v)
    R3 = M.to_3x3()
    white = mat("chg_white", "#f2f4f6", rough=0.35)
    green = mat("chg_green", "#2fae62", rough=0.4)
    dark = mat("chg_dark", "#141b24", rough=0.2)
    glow = mat("chg_glow", "#53e08a", emit="#53e08a", strength=3)
    box("chg_body", W((0, 0, 0.8)), (0.38, 0.3, 1.6), white, rot=R3, bevel=0.03)
    box("chg_top", W((0, 0, 1.62)), (0.42, 0.34, 0.06), green, rot=R3, bevel=0.02)
    box("chg_screen", W((0, -0.152, 1.22)), (0.26, 0.012, 0.3), dark, rot=R3, bevel=0.01)
    t = text_obj("chg_pct", percent, W((0, -0.16, 1.27)), 0.085, glow, rot=(math.pi / 2, 0, yaw))
    box("chg_bar", W((-0.02, -0.16, 1.15)), (0.18, 0.004, 0.035), glow, rot=R3)
    box("chg_holster", W((0.12, -0.17, 0.9)), (0.08, 0.06, 0.16), dark, rot=R3, bevel=0.01)
    return dict(screen=W((0, -0.16, 1.24)), plug=W((0.12, -0.2, 0.86)))


def tree(loc, h=4.0, r=1.4, seed=0):
    bark = mat("bark", "#5b4330", rough=0.9)
    leaf = noisy("leaf", "#2f7d43", "#4e9e58", scale=3.0, rough=0.8)
    x, y, z = loc
    cylinder("trunk", (x, y, z), (x, y, z + h * 0.55), 0.12, bark, r1=0.08)
    for i, (dx, dy, dz, s) in enumerate(((0, 0, 0.75, 1.0), (0.45, 0.2, 0.58, 0.72), (-0.42, -0.15, 0.6, 0.7), (0.1, -0.35, 0.9, 0.62))):
        ellipsoid("leaves", (x + dx * r, y + dy * r, z + h * dz), (r * s, r * s, r * s * 0.9), leaf, segs=20, rings=12)


def building(center, size, material):
    return box("bldg", center, size, material)


def speed_sign(loc, text="50"):
    x, y, z = loc
    grey = mat("pole_grey", "#8b939d", rough=0.4, metal=0.6)
    white = mat("sign_white", "#f7f7f7", rough=0.4)
    red = mat("sign_red", "#d4102a", rough=0.4)
    ink = mat("sign_ink", "#111111", rough=0.5)
    cylinder("sign_pole", (x, y, z), (x, y, z + 2.4), 0.04, grey)
    cylinder("sign_disc", (x, y - 0.03, z + 2.55), (x, y + 0.0, z + 2.55), 0.36, white, segs=48)
    bpy.ops.mesh.primitive_torus_add(location=(x, y - 0.035, z + 2.55), major_radius=0.31, minor_radius=0.045, rotation=(math.pi / 2, 0, 0), major_segments=48, minor_segments=12)
    bpy.context.object.data.materials.append(red)
    text_obj("sign_txt", text, (x, y - 0.045, z + 2.53), 0.32, ink)
    return Vector((x, y - 0.04, z + 2.55))


def cone(loc, h=0.7):
    x, y, z = loc
    org = mat("cone", "#ff6a10", rough=0.5)
    wht = mat("cone_w", "#f4f4f4", rough=0.4)
    blk = mat("cone_b", "#222222", rough=0.7)
    box("cone_base", (x, y, z + 0.02), (0.42, 0.42, 0.04), blk, bevel=0.01)
    cylinder("cone", (x, y, z + 0.04), (x, y, z + h), 0.17, org, r1=0.03, segs=32)
    cylinder("cone_band", (x, y, z + 0.36 * h), (x, y, z + 0.52 * h), 0.17 - 0.14 * 0.38 + 0.004, wht, r1=0.17 - 0.14 * 0.54 + 0.004, segs=32, caps=False)


def ladder(base, top, width=0.48, rung=0.29):
    """Aluminium ladder from base (on the ground) to top (against the wall)."""
    alu = mat("alu", "#c9ced4", rough=0.3, metal=0.9)
    base, top = Vector(base), Vector(top)
    d = (top - base)
    L = d.length
    dn = d.normalized()
    side = dn.cross(Vector((0, 0, 1))).normalized()
    for s in (-1, 1):
        o = side * s * width / 2
        rail = box("rail", (base + top) / 2 + o, (0.035, 0.07, L), alu, rot=Vector((0, 0, 1)).rotation_difference(dn).to_matrix(), bevel=0.006)
    n = int(L / rung)
    for i in range(1, n + 1):
        c = base + dn * (i * rung - 0.1)
        cylinder("rung", c - side * width / 2, c + side * width / 2, 0.017, alu, segs=16)
    return dn, side


def utility_pole(base, height=11.0):
    conc = noisy("concrete", "#a9aeb4", "#c2c6cb", scale=12.0, rough=0.85)
    x, y, z = base
    cylinder("pole", (x, y, z), (x, y, z + height), 0.2, conc, r1=0.14, segs=40)
    return Vector((x, y, z))


def living_room_tv_image(path):
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new("RGB", (1280, 720))
    d = ImageDraw.Draw(im)
    for yy in range(720):
        t = yy / 720
        d.line([(0, yy), (1280, yy)], fill=(int(28 + 90 * t), int(52 - 30 * t), int(140 - 60 * t)))
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 190)
    except Exception:
        f = ImageFont.load_default()
    d.text((640, 340), "B tv", fill=(255, 255, 255), font=f, anchor="mm")
    d.rectangle([470, 470, 810, 482], fill=(234, 0, 44))
    im.save(path)
    return path
