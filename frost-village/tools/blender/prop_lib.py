"""
prop_lib.py - procedural modelling + rendering helpers for Frost Village props.

Used by prop_assets.py (the asset builders) and prop_render.py (the driver).
It never changes the shared camera / light / scale: everything goes through
bl_common (setup_render / setup_camera / setup_lighting at PPU 64).

Contents
  * palette (CONTRACT section 1) + a few extra prop colours
  * materials: flat (bl_common.mat), snow-blend (snow on up-facing surfaces),
    brick, end-grain rings, stripes, animated emission
  * primitives: bevelled box, cylinder/cone, sphere, noisy blob (rocks, snow
    piles), log with end grain, revolve-surface helper (pine tiers, domes),
    extruded 2D outline (steaks, flags, arrows), simple rope/tube
  * framing: computes a frame size + anchor that fits the object and its baked
    shadow, so the world origin (footprint centre) lands on an integer pixel
  * render helpers for idle + animated work frames

Not meant to be run directly.
"""
import math
import os
import random
import sys

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler, noise

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import bl_common as bc  # noqa: E402

PPU = bc.PPU
SUN_DIR = Vector((math.sin(math.radians(40.0)), 0.0, -math.cos(math.radians(40.0))))  # key sun travel dir
SHADOW_K = SUN_DIR.x / -SUN_DIR.z          # ground shadow offset along +X per metre of height

# --------------------------------------------------------------------------- palette
PAL = {
    'snow': '#F4F7FB', 'snow_shadow': '#C9D6E8', 'ice': '#9CC7E6',
    'sea_deep': '#1F5FA8', 'sea_mid': '#2F86C9',
    'plaza': '#D9A08A', 'plaza_dark': '#B97E6A',
    'wood_light': '#C98F55', 'wood_dark': '#8A5A33', 'bark': '#6E4428',
    'pine': '#2E6B4F', 'pine_dark': '#1F4D3A', 'stone': '#8E96A3',
    'ore': '#D9822B', 'gold': '#F2C14E', 'fire': '#FF8A2A', 'fire_hot': '#FFD45A',
    'wheat': '#E8C25A', 'bread': '#C9853F', 'fish': '#F08A5D', 'meat': '#C8463D',
    'skin': '#F6CFAE', 'hair': '#3A2A22',
    'parka_y': '#F2C230', 'parka_r': '#D9483B', 'parka_b': '#3D7CC9',
    'ui_blue': '#3D8BE0', 'ui_green': '#5CC86A', 'ui_gold': '#FFC83D',
    'ui_dark': '#2B2F3A', 'cream': '#FFF8EC',
    # extra prop colours (derived to sit inside the palette family)
    'snow_mat': '#E9EFF7',          # snow albedo (renders ~white under the shared lights)
    'end_grain': '#E9C690', 'end_ring': '#C99A5E',
    'wood_mid': '#AE7444', 'plank': '#D39A5E',
    'soil': '#6A4632', 'soil_dark': '#4E3324',
    'straw': '#E2B85A', 'straw_dark': '#C49A3E', 'rope': '#D9C39A',
    'iron': '#474D58', 'iron_light': '#6B7380', 'steel': '#B3BECB',
    'stone_dark': '#727A87', 'stone_light': '#A9B0BB',
    'brick': '#B4593F', 'brick_dark': '#94442F', 'mortar': '#D9CFC2',
    'canvas': '#EFE1C4', 'red': '#D9483B', 'red_dark': '#B23A30', 'blue': '#3D7CC9',
    'leaf': '#3E7F55', 'berry': '#D9483B', 'charcoal': '#2E2724',
    'glow': '#FFB347', 'window': '#FFD27A', 'leather': '#8B5A35', 'leather_dark': '#6B4226',
    'salmon_skin': '#B9C6D6', 'fish_back': '#4F6F95', 'fish_belly': '#E6EEF5',
    'meat_cooked': '#9A4A2A', 'meat_fat': '#F3E6DA', 'bone': '#F1E9DA',
    'grill_mark': '#6B3418', 'copper': '#C87533',
}


def hexmix(a, b, t):
    ca, cb = bc.hex_rgb(PAL.get(a, a)), bc.hex_rgb(PAL.get(b, b))
    c = [ca[i] + (cb[i] - ca[i]) * t for i in range(3)]
    return '#%02X%02X%02X' % tuple(int(round(max(0, min(1, v)) * 255)) for v in c)


def C(name_or_hex):
    """Palette lookup that also accepts a raw hex string."""
    return PAL.get(name_or_hex, name_or_hex)


# The shared lights brighten side faces ~1.4x (tops more).  Albedos are scaled
# by ALBEDO_K in linear space so rendered side faces sit close to the palette.
ALBEDO_K = 0.8
NO_ADJ = {'snow_mat', 'snow'}


def adj(color, k=None):
    """Palette name / hex -> compensated hex (snow is left untouched)."""
    if color in NO_ADJ:
        return C(color)
    lin = bc.srgb_to_linear(C(color))
    k = ALBEDO_K if k is None else k

    def enc(v):
        v = max(0.0, min(1.0, v * k))
        return 12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return '#%02X%02X%02X' % tuple(int(round(enc(v) * 255)) for v in lin)


# --------------------------------------------------------------------------- materials

def flat(color, rough=0.72, metal=0.0, name=None, emission=None, emission_strength=0.0):
    c = adj(color)
    return bc.mat(name or ('m_' + c.lstrip('#') + '_%g_%g' % (rough, metal)), c, rough=rough, metal=metal,
                  emission=None if emission is None else C(emission), emission_strength=emission_strength)


class NB:
    """Tiny node-tree builder for custom materials."""

    def __init__(self, name, rough=0.75, metal=0.0):
        self.m = bpy.data.materials.new(name)
        self.m.use_nodes = True
        self.nt = self.m.node_tree
        self.p = self.nt.nodes.get('Principled BSDF')
        self.p.inputs['Roughness'].default_value = rough
        self.p.inputs['Metallic'].default_value = metal

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, out, inp):
        self.nt.links.new(out, inp)

    @staticmethod
    def sock(sockets, name, stype=None):
        for s in sockets:
            if s.name == name and (stype is None or s.type == stype):
                return s
        raise KeyError(name)

    def rgb(self, color, raw=False):
        return (*bc.srgb_to_linear(C(color) if raw else adj(color)), 1.0)

    def mix_rgb(self, fac_out, a, b):
        """Mix two colours (hex or sockets) by a factor socket. Returns colour output socket."""
        mx = self.n('ShaderNodeMix', data_type='RGBA', clamp_factor=True)
        self.link(fac_out, self.sock(mx.inputs, 'Factor', 'VALUE'))
        for val, nm in ((a, 'A'), (b, 'B')):
            s = self.sock(mx.inputs, nm, 'RGBA')
            if isinstance(val, str):
                s.default_value = self.rgb(val)
            else:
                self.link(val, s)
        return self.sock(mx.outputs, 'Result', 'RGBA')

    def map_range(self, val_out, lo, hi, clamp=True):
        mr = self.n('ShaderNodeMapRange', clamp=clamp)
        self.link(val_out, mr.inputs[0])
        mr.inputs[1].default_value = lo
        mr.inputs[2].default_value = hi
        mr.inputs[3].default_value = 0.0
        mr.inputs[4].default_value = 1.0
        return mr.outputs[0]

    def math(self, op, a, b=None):
        mn = self.n('ShaderNodeMath', operation=op)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                mn.inputs[i].default_value = v
            else:
                self.link(v, mn.inputs[i])
        return mn.outputs[0]

    def base(self, out):
        self.link(out, self.p.inputs['Base Color'])

    def noise(self, scale=3.0, detail=2.0, coords='Object', w=None):
        tc = self.n('ShaderNodeTexCoord')
        nz = self.n('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = scale
        nz.inputs['Detail'].default_value = detail
        self.link(tc.outputs[coords], nz.inputs['Vector'])
        return nz.outputs['Fac']


_CUSTOM = {}


def snowy(base, snow='snow_mat', lo=0.42, hi=0.62, noise_amt=0.35, noise_scale=2.2, rough=0.8,
          metal=0.0, name=None, coords='Object'):
    """Base colour with snow on up-facing surfaces (world normal Z), noisy edge."""
    key = ('snowy', C(base), C(snow), lo, hi, noise_amt, noise_scale, rough, metal, coords)
    if key in _CUSTOM:
        return _CUSTOM[key]
    nb = NB(name or 'snowy_' + C(base).lstrip('#'), rough=rough, metal=metal)
    geo = nb.n('ShaderNodeNewGeometry')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(geo.outputs['Normal'], sep.inputs[0])
    nz = nb.noise(noise_scale, 3.0, coords)
    off = nb.math('SUBTRACT', nz, 0.5)
    off = nb.math('MULTIPLY', off, noise_amt)
    t = nb.math('ADD', sep.outputs['Z'], off)
    fac = nb.map_range(t, lo, hi)
    col = nb.mix_rgb(fac, C(base), C(snow))
    nb.base(col)
    _CUSTOM[key] = nb.m
    return nb.m


def tonal(base, var=0.12, scale=4.0, rough=0.75, metal=0.0, name=None, dark=None):
    """Flat colour with gentle large-scale noise variation (wood, soil, canvas)."""
    dark = dark or hexmix(base, '#000000', var)
    key = ('tonal', C(base), C(dark), scale, rough, metal)
    if key in _CUSTOM:
        return _CUSTOM[key]
    nb = NB(name or 'tonal_' + C(base).lstrip('#'), rough=rough, metal=metal)
    f = nb.noise(scale, 2.0)
    f = nb.map_range(f, 0.35, 0.65)
    nb.base(nb.mix_rgb(f, C(dark), C(base)))
    _CUSTOM[key] = nb.m
    return nb.m


def end_grain(name='end_grain', light='end_grain', ring='end_ring', bark=None, scale=9.0):
    """Concentric tree rings around the object's local Z axis (log ends, stumps)."""
    key = ('rings', C(light), C(ring), scale)
    if key in _CUSTOM:
        return _CUSTOM[key]
    nb = NB(name, rough=0.8)
    tc = nb.n('ShaderNodeTexCoord')
    wv = nb.n('ShaderNodeTexWave', wave_type='RINGS', rings_direction='Z', wave_profile='SIN')
    wv.inputs['Scale'].default_value = scale
    wv.inputs['Distortion'].default_value = 1.5
    wv.inputs['Detail'].default_value = 1.0
    nb.link(tc.outputs['Object'], wv.inputs['Vector'])
    f = nb.map_range(wv.outputs['Fac'], 0.75, 0.95)
    nb.base(nb.mix_rgb(f, C(light), C(ring)))
    _CUSTOM[key] = nb.m
    return nb.m


def brick(c1='brick', c2='brick_dark', mortar='mortar', scale=2.2, name=None, row_h=0.25,
          brick_w=0.5, snow_top=True):
    key = ('brick', C(c1), C(c2), C(mortar), scale, row_h, brick_w, snow_top)
    if key in _CUSTOM:
        return _CUSTOM[key]
    nb = NB(name or 'brick', rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    br = nb.n('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = nb.rgb(c1)
    br.inputs['Color2'].default_value = nb.rgb(c2)
    br.inputs['Mortar'].default_value = nb.rgb(mortar)
    br.inputs['Scale'].default_value = scale
    br.inputs['Mortar Size'].default_value = 0.025
    br.inputs['Mortar Smooth'].default_value = 0.3
    br.inputs['Brick Width'].default_value = brick_w
    br.inputs['Row Height'].default_value = row_h
    # bricks wrap around: use object X+Y as horizontal coordinate, Z as vertical
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    comb = nb.n('ShaderNodeCombineXYZ')
    nb.link(nb.math('ADD', sep.outputs['X'], sep.outputs['Y']), comb.inputs['X'])
    nb.link(sep.outputs['Z'], comb.inputs['Y'])
    nb.link(comb.outputs[0], br.inputs['Vector'])
    col = br.outputs['Color']
    if snow_top:
        geo = nb.n('ShaderNodeNewGeometry')
        s2 = nb.n('ShaderNodeSeparateXYZ')
        nb.link(geo.outputs['Normal'], s2.inputs[0])
        fac = nb.map_range(s2.outputs['Z'], 0.55, 0.75)
        col = nb.mix_rgb(fac, col, C('snow_mat'))
    nb.base(col)
    _CUSTOM[key] = nb.m
    return nb.m


def stripes(c1, c2, count=6.0, axis='X', name=None, rough=0.7, soft=0.02):
    """Hard stripes along object-local axis (awnings, flags, sacks)."""
    key = ('stripes', C(c1), C(c2), count, axis, rough)
    if key in _CUSTOM:
        return _CUSTOM[key]
    nb = NB(name or 'stripes', rough=rough)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    v = nb.math('MULTIPLY', sep.outputs[axis], count)
    v = nb.math('FRACT', v)
    fac = nb.map_range(v, 0.5 - soft, 0.5 + soft)
    nb.base(nb.mix_rgb(fac, C(c1), C(c2)))
    _CUSTOM[key] = nb.m
    return nb.m


def emissive(name, base, emit=None, strength=1.0, rough=0.6):
    """Unique (uncached) emissive material so work frames can animate its strength."""
    nb = NB(name, rough=rough)
    nb.p.inputs['Base Color'].default_value = nb.rgb(base)
    nb.p.inputs['Emission Color'].default_value = nb.rgb(emit or base, raw=True)
    nb.p.inputs['Emission Strength'].default_value = strength
    return nb.m


def set_emission(m, strength):
    m.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value = strength


# --------------------------------------------------------------------------- objects

def _link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def finish(name, bm, mats, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), bevel=0.0, segs=3,
           smooth=True, angle=35.0, harden=True):
    """bmesh -> object.  rot in degrees.  Optional bevel modifier (angle-limited)."""
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    if not isinstance(mats, (list, tuple)):
        mats = [mats]
    for m in mats:
        me.materials.append(m)
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    ob.scale = scale
    _link(ob)
    if bevel > 0:
        b = ob.modifiers.new('Bevel', 'BEVEL')
        b.width = bevel
        b.segments = segs
        b.limit_method = 'ANGLE'
        b.angle_limit = math.radians(angle)
        b.harden_normals = harden
        b.miter_outer = 'MITER_ARC'
    return ob


def _faces_by_normal(bm, zmin=0.7, index=1, zmax=None):
    for f in bm.faces:
        z = f.normal.z
        if z > zmin and (zmax is None or z <= zmax):
            f.material_index = index


def box(name, size, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, bevel=0.04, segs=3, origin='bottom',
        top_mat=None, bottom_mat=None, taper=None):
    """Bevelled box.  origin='bottom' puts the object origin at the bottom-face centre.
    taper=(tx,ty) scales the top face (pyramids, furnaces)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if taper:
        for v in bm.verts:
            if v.co.z > 0:
                v.co.x *= taper[0]
                v.co.y *= taper[1]
    if origin == 'bottom':
        bmesh.ops.translate(bm, vec=(0, 0, size[2] / 2.0), verts=bm.verts)
    bm.normal_update()
    mats = [mat]
    if top_mat is not None:
        _faces_by_normal(bm, 0.7, len(mats))
        mats.append(top_mat)
    if bottom_mat is not None:
        for f in bm.faces:
            if f.normal.z < -0.7:
                f.material_index = len(mats)
        mats.append(bottom_mat)
    bevel = min(bevel, min(size) * 0.45)
    return finish(name, bm, mats, loc, rot, bevel=bevel, segs=segs)


def cyl(name, r, h, loc=(0, 0, 0), rot=(0, 0, 0), mat=None, segs=20, r_top=None, bevel=0.03,
        cap_mat=None, origin='bottom', bsegs=3, scale=(1, 1, 1), smooth=True):
    """Cylinder / truncated cone along local Z.  cap_mat -> both end caps."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                          radius2=r if r_top is None else r_top, depth=h)
    if origin == 'bottom':
        bmesh.ops.translate(bm, vec=(0, 0, h / 2.0), verts=bm.verts)
    bm.normal_update()
    mats = [mat]
    if cap_mat is not None:
        for f in bm.faces:
            if abs(f.normal.z) > 0.9 and len(f.verts) > 4:
                f.material_index = 1
        mats.append(cap_mat)
    if r_top == 0:
        bevel = 0
    return finish(name, bm, mats, loc, rot, scale, bevel=min(bevel, r * 0.45, h * 0.45), segs=bsegs,
                  smooth=smooth)


def sphere(name, r, loc=(0, 0, 0), mat=None, scale=(1, 1, 1), rot=(0, 0, 0), segs=24, rings=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    return finish(name, bm, [mat], loc, rot, scale)


def blob(name, r, loc=(0, 0, 0), mat=None, scale=(1, 1, 1), seed=0, amp=0.18, freq=1.5, subdiv=3,
         flat_bottom=0.0, rot=(0, 0, 0), facet=False, mats=None, mat_fn=None):
    """Noise-displaced icosphere (rocks, snow piles, bushes).  flat_bottom: clamp
    z >= -flat_bottom*r (in local units) so it sits on the ground."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    for v in bm.verts:
        n = v.co.normalized()
        d = noise.noise(n * freq + off) + 0.5 * noise.noise(n * freq * 2.3 + off * 1.7)
        v.co = n * r * (1.0 + amp * d)
    if flat_bottom:
        zmin = -flat_bottom * r
        for v in bm.verts:
            if v.co.z < zmin:
                v.co.z = zmin + (v.co.z - zmin) * 0.08
    bm.normal_update()
    ml = mats or [mat]
    if mat_fn:
        for f in bm.faces:
            f.material_index = mat_fn(f)
    return finish(name, bm, ml, loc, rot, scale, smooth=not facet)


def log(name, r, length, loc=(0, 0, 0), rot=(0, 0, 0), bark=None, end=None, segs=16, bevel=0.035,
        origin='center'):
    """Log = cylinder along local Z with end-grain caps.  rot (deg) lays it down,
    e.g. rot=(0,90,0) -> along world X, rot=(90,0,0) -> along world Y."""
    return cyl(name, r, length, loc, rot, bark or flat('bark', 0.85), segs=segs, bevel=bevel,
               cap_mat=end or end_grain(), origin=origin)


def revolve(name, prof, M, K, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), top=None, bottom=None,
            smooth=True, mats=None, mat_fn=None):
    """Generic ring surface.  prof(j, k) -> (x, y, z) for column j in [0,M) (periodic)
    and row k in [0,K) (k=0 = bottom ring).  `top`/`bottom` = closing vertex coords.
    mat_fn(j, k, part) -> material index (part in 'side'|'top'|'bottom')."""
    bm = bmesh.new()
    rows = [[bm.verts.new(prof(j, k)) for j in range(M)] for k in range(K)]
    for k in range(K - 1):
        for j in range(M):
            j2 = (j + 1) % M
            f = bm.faces.new((rows[k][j], rows[k][j2], rows[k + 1][j2], rows[k + 1][j]))
            if mat_fn:
                f.material_index = mat_fn(j, k, 'side')
    if top is not None:
        tv = bm.verts.new(top)
        for j in range(M):
            f = bm.faces.new((rows[-1][j], rows[-1][(j + 1) % M], tv))
            if mat_fn:
                f.material_index = mat_fn(j, K - 1, 'top')
    if bottom is not None:
        bv = bm.verts.new(bottom)
        for j in range(M):
            f = bm.faces.new((rows[0][(j + 1) % M], rows[0][j], bv))
            if mat_fn:
                f.material_index = mat_fn(j, 0, 'bottom')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mats or [mat], loc, rot, smooth=smooth)


def extrude(name, pts, thickness, loc=(0, 0, 0), rot=(0, 0, 0), top=None, side=None, bottom=None,
            bevel=0.03, segs=3, angle=35.0):
    """Extrude a closed 2D outline (counter-clockwise, XY) upward by `thickness`.
    Materials: top (index 0 if given), side, bottom."""
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, 0.0)) for x, y in pts]
    fb = bm.faces.new(vb)
    ret = bmesh.ops.extrude_face_region(bm, geom=[fb])
    vt = [e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, thickness), verts=vt)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mats = [side or top]
    ti = bi = 0
    if top is not None:
        mats.append(top)
        ti = len(mats) - 1
    if bottom is not None:
        mats.append(bottom)
        bi = len(mats) - 1
    for f in bm.faces:
        if f.normal.z > 0.9:
            f.material_index = ti
        elif f.normal.z < -0.9:
            f.material_index = bi
    return finish(name, bm, mats, loc, rot, bevel=bevel, segs=segs, angle=angle)


def tube(name, pts, r, mat, segs=8, loc=(0, 0, 0)):
    """Rope / rail along a polyline of 3D points (curve object with bevel)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(1, segs // 4)
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1.0)
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    cu.materials.append(mat)
    _link(ob)
    return ob


def smooth_tube(name, pts, r, mat, loc=(0, 0, 0), res=6):
    """Rope along a smooth (bezier-auto) path through `pts`."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = 2
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new(name, cu)
    ob.location = loc
    cu.materials.append(mat)
    _link(ob)
    return ob


def point_light(name, loc, color='glow', energy=50.0, radius=0.1):
    ld = bpy.data.lights.new(name, 'POINT')
    ld.energy = energy
    ld.color = bc.srgb_to_linear(C(color))
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    _link(ob)
    return ob


def group(objs, name='grp', loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    """Parent objects to an empty so a sub-assembly can be moved/rotated as one."""
    em = bpy.data.objects.new(name, None)
    _link(em)
    for o in objs:
        o.parent = em
    em.location = loc
    em.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    em.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return em


class Collect:
    """Context manager that records every object created inside the block."""

    def __enter__(self):
        self.before = set(bpy.data.objects)
        self.objs = []
        return self

    def __exit__(self, *a):
        self.objs = [o for o in bpy.data.objects if o not in self.before]
        return False


def scene_meshes():
    return [o for o in bpy.context.scene.objects
            if o.type in ('MESH', 'CURVE') and o.name != 'ShadowCatcher' and not o.hide_render
            and o.visible_camera]


def rotate_all(yaw_deg):
    """Rotate every top-level object (meshes, curves, empties, point lights) about world Z."""
    if not yaw_deg:
        return
    bpy.context.view_layer.update()        # matrix_world is stale until the depsgraph updates
    R = Matrix.Rotation(math.radians(yaw_deg), 4, 'Z')
    for o in list(bpy.context.scene.objects):
        if o.parent is None and o.type in ('MESH', 'CURVE', 'EMPTY', 'LIGHT') and \
                o.name not in ('ShadowCatcher', 'KeySun', 'FillSun'):
            if o.type == 'LIGHT' and o.data.type == 'SUN':
                continue
            o.matrix_world = R @ o.matrix_world


# --------------------------------------------------------------------------- framing

def world_points(objs=None):
    """All evaluated vertex positions (world space) of the given objects."""
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in objs or scene_meshes():
        oe = o.evaluated_get(dg)
        try:
            me = oe.to_mesh()
        except Exception:
            continue
        mw = oe.matrix_world
        pts.extend(mw @ v.co for v in me.vertices)
        oe.to_mesh_clear()
    return pts


def screen_xy(p):
    return bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))


def frame_fit(margin=6, shadow=True, objs=None, min_size=(16, 16), max_size=(1024, 1024)):
    """Frame (w, h) and integer anchor pixel so the object (and its ground shadow)
    fit.  The anchor = world origin = footprint centre."""
    pts = world_points(objs)
    if shadow:
        margin += 12            # halo for the soft contact / sky-occlusion shadow
    xs, ys = [], []
    top = 0.0
    for p in pts:
        x, y = screen_xy(p)
        xs.append(x)
        ys.append(y)
        top = min(top, y)
        if shadow and p.z > 0.02:
            q = (p.x + p.z * SHADOW_K, p.y, 0.0)
            x2, y2 = screen_xy(q)
            soft = 3 + 7.0 * p.z            # penumbra grows with height
            xs += [x2 + soft, x2 - soft * 0.5]
            ys += [y2 + soft * 0.6, y2 - soft * 0.3]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    ax = int(math.ceil(-minx + margin))
    ay = int(math.ceil(-miny + margin))
    w = int(math.ceil(ax + maxx + margin))
    h = int(math.ceil(ay + maxy + margin))
    w = max(min_size[0], (w + 3) // 4 * 4)
    h = max(min_size[1], (h + 3) // 4 * 4)
    if w > max_size[0] or h > max_size[1]:
        print('WARNING frame %dx%d exceeds max %s' % (w, h, max_size))
    return w, h, (ax, ay), -top


def footprint_px(size_m, yaw_deg=0.0):
    """Screen bbox of a rectangular footprint a (local X) x b (local Y) metres,
    or a circle given as ('r', radius).  yaw 0 = world-aligned (diamond);
    yaw 45 = facing the camera (screen-aligned rectangle)."""
    if isinstance(size_m, (list, tuple)) and len(size_m) == 2 and size_m[0] == 'r':
        r = size_m[1]
        return [int(round(2 * r * PPU)), int(round(r * PPU))]
    a, b = size_m
    if abs((yaw_deg % 90) - 45) < 1e-3:
        return [int(round(a * PPU)), int(round(b * PPU / 2.0))]
    w = (a + b) * PPU * math.sqrt(0.5)
    return [int(round(w)), int(round(w / 2.0))]


def stack_step(thickness_m):
    return int(round(thickness_m * bc.VERTICAL_SCALE * PPU))


# --------------------------------------------------------------------------- misc helpers

def rng(seed):
    return random.Random(seed)


def snow_slab(name, sx, sy, t, loc, rot=(0, 0, 0), seed=0, droop=0.0):
    """Soft rounded snow layer (roof / lid / bench top).  Slight random bulge."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, t), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, t / 2.0), verts=bm.verts)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    off = Vector((seed * 1.3, seed * 2.1, 0.0))
    for v in bm.verts:
        if v.co.z > t * 0.6:
            v.co.z += 0.35 * t * noise.noise(Vector((v.co.x * 2.2, v.co.y * 2.2, 0)) + off)
        if droop and v.co.z < t * 0.4:
            v.co.z -= droop * (0.5 + 0.5 * noise.noise(Vector((v.co.x * 5.0, v.co.y * 5.0, 1.0)) + off))
    ob = finish(name, bm, [flat('snow_mat', 0.9)], loc, rot, bevel=min(t * 0.48, 0.08), segs=3, angle=30)
    return ob


class MB:
    """Mesh batcher: many small primitives -> one object (crops, nets, piles)."""

    def __init__(self):
        self.bm = bmesh.new()
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _tag(self, verts, m):
        mi = self._mi(m)
        fs = set()
        for v in verts:
            fs.update(v.link_faces)
        for f in fs:
            f.material_index = mi

    @staticmethod
    def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        R = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
        S = Matrix.Diagonal((*scale, 1.0))
        return Matrix.Translation(Vector(loc)) @ R @ S

    def cone(self, r1, r2, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=8):
        """Cylinder/cone along local Z, centred."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1,
                                    radius2=r2, depth=depth, matrix=self.M(loc, rot, scale))
        self._tag(res['verts'], mat)

    def sphere(self, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=10, rings=6):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=r,
                                        matrix=self.M(loc, rot, scale))
        self._tag(res['verts'], mat)

    def ico(self, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), subdiv=1):
        res = bmesh.ops.create_icosphere(self.bm, subdivisions=subdiv, radius=r,
                                         matrix=self.M(loc, rot, scale))
        self._tag(res['verts'], mat)

    def cube(self, size, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=self.M(loc, rot, size))
        self._tag(res['verts'], mat)

    def seg(self, p, q, r, mat, segs=6, r2=None):
        """Thin cylinder from point p to point q (ropes, stalks, net strands)."""
        p, q = Vector(p), Vector(q)
        d = q - p
        ln = d.length
        if ln < 1e-5:
            return
        rotm = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        mtx = Matrix.Translation((p + q) / 2) @ rotm
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r,
                                    radius2=r if r2 is None else r2, depth=ln, matrix=mtx)
        self._tag(res['verts'], mat)

    def done(self, name, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True, bevel=0.0):
        return finish(name, self.bm, self.mats, loc, rot, smooth=smooth, bevel=bevel)


def blob_surface(n, r, seed=0, amp=0.18, freq=1.5):
    """Surface point of blob() along unit direction n (same noise), for placing ore etc."""
    n = Vector(n).normalized()
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    d = noise.noise(n * freq + off) + 0.5 * noise.noise(n * freq * 2.3 + off * 1.7)
    return n * r * (1.0 + amp * d)
