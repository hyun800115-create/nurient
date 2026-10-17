"""
gb_lib.py - shared modelling helpers of the 금방 set (docs/CONTRACT_GEUMBANG.md section AO): the brand palette, the
3D mark 금방이, raised text meshes (Jua / Fredoka), and the 금방 parcel.

Everything goes through bl_common (camera / light / PPU 64) and the READ-ONLY helpers of prop_lib, town_lib,
lgx_lib and veh_lib - none of those files is modified.  Sign frame (town_lib convention): a picture lies in the XZ
plane centred on the origin and bulges toward -Y (the viewer); T.emblem_at / sign_disc turn it to any heading.

Not run directly - see gb_render.py.
"""
import math
import os

import bpy  # noqa: F401
from mathutils import Vector, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere, extrude, hexmix
import town_lib as T
import lgx_lib as X

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.normpath(os.path.join(HERE, '..', 'fonts'))
FONT_KO = 'Jua-Regular.ttf'
FONT_EN = 'Fredoka-Bold.ttf'

# brand (CONTRACT_GEUMBANG brand block)
GOLD = '#F2B33D'
GOLD_D = '#D9962A'
CREAM = '#F4EDE0'
CHARCOAL = '#3B3F52'
NAVY = '#2B4F7E'
BRAND = {'gold': GOLD, 'goldDark': GOLD_D, 'cream': CREAM, 'charcoal': CHARCOAL, 'navy': NAVY}
PINK = '#F2A0A8'
LID = '#E6DBC6'
KRAFT = X.KRAFT
KRAFT_D = X.KRAFT_D


# =========================================================================================== materials

def m_gold(rough=0.4, lit=0.0):
    return _mat('gb_gold', GOLD, rough, lit)


def _mat(name, col, rough=0.5, lit=0.0, emit=None):
    """Matte toy paint; lit > 0 -> the same colour glowing (night frames of lit signs)."""
    if lit <= 0.0:
        return flat(col, rough)
    key = '%s_lit_%g' % (name, lit)
    m = bpy.data.materials.get(key)
    if m:
        return m
    return L.emissive(key, col, emit or col, lit, rough=rough)


# =========================================================================================== the mark

def star4(r, w, n=4, a0=math.pi / 2):
    """4-point sparkle outline (XZ), points at top / right / bottom / left; w = the waist radius."""
    pts = []
    for k in range(2 * n):
        a = a0 + k * math.pi / n
        rr = r if k % 2 == 0 else w
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    # soften the waist with an inner arc point so it reads as a twinkle, not a cross
    return pts


def mark(s=1.0, depth=1.0, lit=0.0, name='mk', border=True):
    """금방이 in the sign frame: outer radius R = 0.5 * s (cream sticker border), goldDark rim, gold disc, a face-on
    cream parcel (lid band) with navy dot eyes, pink cheeks and an 'o' mouth, a cream 4-point sparkle above it.
    Symmetric (mirror-safe), no letters.  depth scales the relief (1 = sign board, ~0.5 = a decal on a van).
    lit > 0 -> the cream / gold parts glow (night frames)."""
    R = 0.5 * s
    d = depth * s
    objs = []
    cream = _mat('gb_cream', CREAM, 0.55, lit)
    gold = _mat('gb_gold', GOLD, 0.42, lit * 0.7)
    goldd = _mat('gb_goldd', GOLD_D, 0.45, lit * 0.5)
    lid = _mat('gb_lid', LID, 0.6, lit)
    navy = flat(NAVY, 0.4)
    pink = flat(PINK, 0.7)
    if border:
        objs.append(cyl(name + '_bd', R, 0.022 * d, (0, 0, 0), rot=(90, 0, 0), mat=cream, segs=48, origin='center',
                        bevel=0.008 * d))
    objs.append(cyl(name + '_rim', R * 0.9, 0.032 * d, (0, -0.006 * d, 0), rot=(90, 0, 0), mat=goldd, segs=48,
                    origin='center', bevel=0.01 * d))
    objs.append(cyl(name + '_disc', R * 0.78, 0.036 * d, (0, -0.012 * d, 0), rot=(90, 0, 0), mat=gold, segs=48,
                    origin='center', bevel=0.012 * d))
    # parcel: body + a slightly proud lid band
    pw, ph = R * 0.98, R * 0.80
    zc = -0.16 * R
    ztop = zc + ph / 2
    body_h = ph * 0.78
    objs.append(T.ext_xz(name + '_pb', T.rounded_rect_pts(pw, body_h, R * 0.1, n=4, cz=ztop - ph + body_h / 2),
                         0.045 * d, cream, y=-0.028 * d, bevel=0.008 * d))
    lid_h = ph * 0.26
    objs.append(T.ext_xz(name + '_pl', T.rounded_rect_pts(pw * 1.04, lid_h, R * 0.08, n=4, cz=ztop - lid_h / 2),
                         0.055 * d, lid, y=-0.028 * d, bevel=0.008 * d))
    # face (on the body's front plane)
    yf = -0.028 * d - 0.045 * d
    ez = ztop - ph * 0.52
    for sx in (-1, 1):
        objs.append(sphere(name + '_eye', R * 0.075, (sx * pw * 0.2, yf - 0.002, ez), navy, scale=(1, 0.45, 1.1),
                           segs=16, rings=8))
        objs.append(sphere(name + '_hi', R * 0.022, (sx * pw * 0.2 + R * 0.025, yf - R * 0.03, ez + R * 0.03),
                           flat('#FFFFFF', 0.3), scale=(1, 0.5, 1), segs=8, rings=6))
        objs.append(cyl(name + '_ck', R * 0.085, 0.004, (sx * pw * 0.33, yf - 0.001, ez - R * 0.13), rot=(90, 0, 0),
                        mat=pink, segs=20, origin='center', bevel=0.0, scale=(1.0, 0.7, 1.0)))
    mz = ez - R * 0.17
    objs.append(cyl(name + '_mo', R * 0.065, 0.006, (0, yf - 0.001, mz), rot=(90, 0, 0), mat=navy, segs=20,
                    origin='center', bevel=0.0))
    objs.append(cyl(name + '_mi', R * 0.03, 0.006, (0, yf - 0.004, mz), rot=(90, 0, 0), mat=cream, segs=14,
                    origin='center', bevel=0.0))
    # sparkle above the parcel
    sr = R * 0.24
    sp = [(x, z + ztop + R * 0.2) for x, z in star4(sr, sr * 0.3)]
    objs.append(T.ext_xz(name + '_sp', sp, 0.03 * d, cream, y=-0.02 * d, bevel=0.004 * d))
    return objs


# =========================================================================================== text

def text_mesh(name, body, font=FONT_KO, height=0.3, max_w=None, depth=0.012, bevel=0.006, mat=None,
              align='CENTER'):
    """Raised letters (font curve -> mesh, as lgx_center.name_lettering) in the XZ plane facing -Y, centred on the
    origin (back face at y = 0).  Fitted to `height` (cap block) and at most max_w wide."""
    fnt = bpy.data.fonts.load(os.path.join(FONT_DIR, font), check_existing=True)
    cu = bpy.data.curves.new('tx_' + name, 'FONT')
    cu.body = body
    cu.font = fnt
    cu.size = 1.0
    cu.align_x = align
    cu.align_y = 'CENTER'
    cu.extrude = depth
    cu.bevel_depth = bevel
    cu.bevel_resolution = 2
    cu.resolution_u = 8
    ob = bpy.data.objects.new('tx_tmp_' + name, cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    xs = [v.co.x for v in me.vertices]
    ys = [v.co.y for v in me.vertices]
    tw, th = max(xs) - min(xs), max(ys) - min(ys)
    sc = height / th
    if max_w and tw * sc > max_w:
        sc = max_w / tw
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    me.transform(Matrix.Translation((-cx, -cy, depth)))
    me.transform(Matrix.Diagonal((sc, sc, 1.0, 1.0)))
    for p in me.polygons:
        p.use_smooth = True
    mo = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(mo)
    mo.data.materials.append(mat or flat(NAVY, 0.45))
    mo.rotation_euler = (math.radians(90), 0, 0)
    mo['textW'] = tw * sc
    mo['textH'] = th * sc
    return mo


# =========================================================================================== parcels

TAPE_W = 0.06


def gb_parcel(name, sx, sy, sz, loc=(0, 0, 0), rot_z=0.0, sticker=True, snow=False, tape_col=GOLD, open_=False,
              seed=0):
    """금방 parcel: a kraft box with a gold tape cross over the lid (running down the four sides) and the 금방이
    sticker on the front (-Y) face.  open_=True -> flaps open, empty (no tape on the lid, the tape ends cut)."""
    kr = X.kraft()
    objs = []
    tm = flat(tape_col, 0.35)
    tw = min(TAPE_W, sx * 0.2, sy * 0.2)
    if not open_:
        objs.append(box(name, (sx, sy, sz), (0, 0, 0), mat=kr, bevel=min(0.022, sz * 0.1), segs=2))
        objs.append(box(name + '_tx', (sx + 0.008, tw, 0.01), (0, 0, sz - 0.004), mat=tm, bevel=0.0))
        objs.append(box(name + '_ty', (tw, sy + 0.008, 0.01), (0, 0, sz - 0.004), mat=tm, bevel=0.0))
        for sg in (-1, 1):
            objs.append(box(name + '_tsx', (0.01, tw, sz * 0.42), (sg * (sx / 2 + 0.003), 0, sz * 0.58), mat=tm,
                            bevel=0.0))
            objs.append(box(name + '_tsy', (tw, 0.01, sz * 0.42), (0, sg * (sy / 2 + 0.003), sz * 0.58), mat=tm,
                            bevel=0.0))
        objs.append(box(name + '_seam', (sx * 0.96, 0.006, 0.006), (0, -sy * 0.22, sz - 0.002),
                        mat=flat(KRAFT_D, 0.8), bevel=0.0))
    else:
        # open box: 4 walls + floor, flaps folded out, the tape cut ends on the sides
        t = 0.018
        objs.append(box(name + '_fl', (sx - 0.01, sy - 0.01, t), (0, 0, 0), mat=kr, bevel=0.004))
        objs.append(box(name + '_in', (sx - 2 * t - 0.01, sy - 2 * t - 0.01, 0.004), (0, 0, t),
                        mat=flat(hexmix(KRAFT, '#3A2A1E', 0.35), 0.9), bevel=0.0))
        for sg in (-1, 1):
            objs.append(box(name + '_wx', (t, sy, sz), (sg * (sx / 2 - t / 2), 0, 0), mat=kr, bevel=0.004))
            objs.append(box(name + '_wy', (sx, t, sz), (0, sg * (sy / 2 - t / 2), 0), mat=kr, bevel=0.004))
            objs.append(box(name + '_tsx', (0.01, tw, sz * 0.42), (sg * (sx / 2 + 0.003), 0, sz * 0.58), mat=tm,
                            bevel=0.0))
            objs.append(box(name + '_tsy', (tw, 0.01, sz * 0.42), (0, sg * (sy / 2 + 0.003), sz * 0.58), mat=tm,
                            bevel=0.0))
        # flaps: hinged at the four top edges, opened outward (phi = elevation of the flap above horizontal)
        for k, (axis, sg, phi) in enumerate((('x', -1, 38.0), ('x', 1, 30.0), ('y', -1, 18.0), ('y', 1, 58.0))):
            ph = math.radians(phi)
            if axis == 'x':
                l = sx * 0.42
                f = box(name + '_fp%d' % k, (l, sy * 0.97, 0.008), (0, 0, 0), mat=kr, bevel=0.003, origin='center')
                f.location = (sg * (sx / 2 + l / 2 * math.cos(ph)), 0, sz + l / 2 * math.sin(ph))
                f.rotation_euler = (0, -sg * ph, 0)
            else:
                l = sy * 0.5
                f = box(name + '_fp%d' % k, (sx * 0.97, l, 0.008), (0, 0, 0), mat=kr, bevel=0.003, origin='center')
                f.location = (0, sg * (sy / 2 + l / 2 * math.cos(ph)), sz + l / 2 * math.sin(ph))
                f.rotation_euler = (sg * ph, 0, 0)
            objs.append(f)
    if sticker:
        st = min(sx, sz) * 0.48
        with L.Collect() as c:
            mark(st, depth=0.12, border=True, name=name + '_mk')
        g = L.group([o for o in c.objs if o.parent is None], name + '_stk',
                    loc=(-sx * 0.16, -sy / 2 - 0.004, sz * (0.42 if not open_ else 0.4)))
        objs.append(g)
    if snow and not open_:
        import veh_lib as VL
        objs.append(VL.snow_cap(name + '_snow', sx * 0.98, sy * 0.98, (0, 0, sz - 0.004), t=0.075, seed=seed + 3))
    import bld_assets as BA
    return L.group(BA.top_level(objs), name + '_g', loc=loc, rot=(0, 0, rot_z))


# =========================================================================================== printed cloth

def tex_mat(name, img_path, lit=0.0, rough=0.78, alpha=True):
    """Matte cloth printed with an image (sRGB PNG).  Albedo compensated like prop_lib.flat (x ALBEDO_K in linear);
    lit > 0 -> the print glows (night frames); alpha -> the PNG alpha cuts the cloth (pennant triangle)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes.get('Principled BSDF')
    p.inputs['Roughness'].default_value = rough
    tx = nt.nodes.new('ShaderNodeTexImage')
    tx.image = bpy.data.images.load(img_path, check_existing=True)
    tx.interpolation = 'Linear'
    uv = nt.nodes.new('ShaderNodeUVMap')
    nt.links.new(uv.outputs['UV'], tx.inputs['Vector'])
    mx = nt.nodes.new('ShaderNodeMix')
    mx.data_type = 'RGBA'
    mx.blend_type = 'MULTIPLY'
    nt.links.new(tx.outputs['Color'], L.NB.sock(mx.inputs, 'A', 'RGBA'))
    L.NB.sock(mx.inputs, 'B', 'RGBA').default_value = (L.ALBEDO_K, L.ALBEDO_K, L.ALBEDO_K, 1.0)
    L.NB.sock(mx.inputs, 'Factor', 'VALUE').default_value = 1.0
    nt.links.new(L.NB.sock(mx.outputs, 'Result', 'RGBA'), p.inputs['Base Color'])
    if alpha:
        nt.links.new(tx.outputs['Alpha'], p.inputs['Alpha'])
    if lit > 0.0:
        nt.links.new(tx.outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = lit
    return m


def cloth(name, nu, nv, pos_fn, mat, smooth=True):
    """Grid mesh (nu x nv quads) whose vertex (u, v) in [0, 1]^2 sits at pos_fn(u, v) (world/parent metres), UV = (u,
    v) (v = 0 bottom of the print, 1 top).  Both faces render (thin cloth)."""
    import bmesh
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    verts = [[bm.verts.new(pos_fn(i / nu, j / nv)) for i in range(nu + 1)] for j in range(nv + 1)]
    for j in range(nv):
        for i in range(nu):
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for lp, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                lp[uvl].uv = (a / nu, b / nv)
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob
