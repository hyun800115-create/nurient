"""
char_gear.py - v4 worker outfits (CONTRACT_V4 H): believable winter work gear for the
five workers (fisherman, lumberjack, farmer, miner, hunter) and their variants.

Not run directly.  char_build.SPECS points the five worker keys at dress_worker(), which
calls the profession's dresser here with a `look` dict (colours + options).  The worker
variants (wkr_build.py) reuse the same dressers with other looks and body types.

Everything is rigid parts on the existing chibi rig (char_build.build_human), so the
animations, tools, impactPoint and carryPoint logic of char_anim / char_render are
unchanged.  Pieces are deliberately chunky: the sprite is ~80 px tall, so the gear has to
read as big colour blocks (cream sweater vs dark bib overalls, red cap, orange gloves ...)
with the small details (buckles, knife, rope coil, pockets, soot) as accents.

Materials: knitted rib / cable (mat_knit), buffalo & gingham checks (mat_check),
stripes, noise stains (soot), rope twist, floral dots - all procedural node trees on
object coordinates (deterministic, no textures).
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                   # noqa: E402
import bmesh                                 # noqa: E402
from mathutils import Vector, Matrix, Quaternion   # noqa: E402

import bl_common as bc                       # noqa: E402
import char_geo as g                         # noqa: E402
import char_build as cb                      # noqa: E402

PI = math.pi
TAU = math.tau
M = cb.M
HEAD_R, HEAD_C = cb.HEAD_R, cb.HEAD_C
smoothstep = cb.smoothstep
FOREARM = cb.FOREARM


# =========================================================================== materials

class _NB:
    """Tiny node-tree builder for procedural pattern materials."""

    def __init__(self, name, rough=0.8):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        self.m = m
        self.nt = m.node_tree
        self.p = self.nt.nodes.get('Principled BSDF')
        self.p.inputs['Roughness'].default_value = rough
        tc = self.nt.nodes.new('ShaderNodeTexCoord')
        sep = self.nt.nodes.new('ShaderNodeSeparateXYZ')
        self.nt.links.new(tc.outputs['Object'], sep.inputs[0])
        self.vec = tc.outputs['Object']
        self.x, self.y, self.z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']

    def op(self, o, a, b=None, c=None):
        n = self.nt.nodes.new('ShaderNodeMath')
        n.operation = o
        for idx, v in enumerate((a, b, c)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = float(v)
            else:
                self.nt.links.new(v, n.inputs[idx])
        return n.outputs[0]

    def ramp(self, fac, stops, constant=False):
        """stops = [(pos, '#hex'), ...] -> colour socket."""
        r = self.nt.nodes.new('ShaderNodeValToRGB')
        cr = r.color_ramp
        cr.interpolation = 'CONSTANT' if constant else 'LINEAR'
        cr.elements[0].position = stops[0][0]
        cr.elements[0].color = (*bc.srgb_to_linear(stops[0][1]), 1)
        cr.elements[1].position = stops[1][0]
        cr.elements[1].color = (*bc.srgb_to_linear(stops[1][1]), 1)
        for pos, col in stops[2:]:
            e = cr.elements.new(pos)
            e.color = (*bc.srgb_to_linear(col), 1)
        self.nt.links.new(fac, r.inputs['Factor'])
        return r.outputs['Color']

    def base(self, col):
        self.nt.links.new(col, self.p.inputs['Base Color'])

    def bump(self, height, strength=0.5, distance=0.004):
        b = self.nt.nodes.new('ShaderNodeBump')
        b.inputs['Strength'].default_value = strength
        b.inputs['Distance'].default_value = distance
        self.nt.links.new(height, b.inputs['Height'])
        self.nt.links.new(b.outputs['Normal'], self.p.inputs['Normal'])

    def noise(self, scale, detail=3.0, rough=0.55, vec=None):
        n = self.nt.nodes.new('ShaderNodeTexNoise')
        n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail
        n.inputs['Roughness'].default_value = rough
        self.nt.links.new(vec or self.vec, n.inputs['Vector'])
        return n.outputs['Factor']


_GEAR_MATS = {}


def _cached(key, make):
    """Per-scene material cache (entries die with bc.reset_scene's factory reset)."""
    m = _GEAR_MATS.get(key)
    try:
        alive = m is not None and bpy.data.materials.get(m.name) == m
    except ReferenceError:
        alive = False
    if not alive:
        _GEAR_MATS[key] = make()
    return _GEAR_MATS[key]


def mat_knit(name, color, dark=None, cols=18, rows=30, cable=True, rough=0.96, bump=0.55):
    """Knitted wool: vertical rib columns around the part's Z axis (torso, sleeves,
    collars are all lathes around Z) with aran-style chevron cables on every other
    column; grooves are darker and bump-mapped so the knit reads in the light."""
    dark = dark or _shade(color, 0.78)

    def make():
        b = _NB(name, rough)
        ang = b.op('ARCTAN2', b.x, b.y)
        col = b.op('MULTIPLY', ang, cols / TAU)
        cu = b.op('FRACT', col)
        rib = b.op('POWER', b.op('SINE', b.op('MULTIPLY', cu, PI)), 0.6)
        if cable:
            odd = b.op('FLOORED_MODULO', b.op('FLOOR', col), 2.0)
            chev = b.op('FRACT', b.op('ADD', b.op('MULTIPLY', b.z, rows),
                                      b.op('MULTIPLY', b.op('ABSOLUTE', b.op('SUBTRACT', cu, 0.5)), 1.4)))
            zig = b.op('ABSOLUTE', b.op('SUBTRACT', b.op('MULTIPLY', chev, 2.0), 1.0))
            mod = b.op('ADD', 0.55, b.op('MULTIPLY', zig, 0.45))
            # odd columns get the cable, even columns stay plain rib
            k = b.op('ADD', b.op('MULTIPLY', odd, b.op('SUBTRACT', mod, 1.0)), 1.0)
            h = b.op('MULTIPLY', rib, k)
        else:
            h = rib
        b.base(b.ramp(h, [(0.0, dark), (0.55, color), (1.0, _shade(color, 1.05))]))
        b.bump(h, strength=bump, distance=0.006)
        return b.m
    return _cached(('knit', name, color, dark, cols, rows, cable), make)


def mat_check(name, base, line, cross, scale=12.0, duty=0.5, rough=0.88, zscale=None):
    """Two-stripe check on object (X+Y) and Z: buffalo plaid (big, 50% duty) or
    gingham (small).  0 stripes = base, 1 = line, 2 = cross colour."""
    def make():
        b = _NB(name, rough)
        xy = b.op('ADD', b.x, b.y)
        sa = b.op('LESS_THAN', b.op('FRACT', b.op('MULTIPLY', xy, scale * 0.7071)), duty)
        sb = b.op('LESS_THAN', b.op('FRACT', b.op('MULTIPLY', b.z, zscale or scale)), duty)
        idx = b.op('MULTIPLY', b.op('ADD', sa, sb), 0.5)
        b.base(b.ramp(idx, [(0.0, base), (0.4, line), (0.9, cross)], constant=True))
        return b.m
    return _cached(('check', name, base, line, cross, scale, duty, zscale), make)


def mat_stripes(name, c1, c2, scale=20.0, duty=0.5, rough=0.9, knit=True):
    """Horizontal stripes (Breton shirt / guernsey bands)."""
    def make():
        b = _NB(name, rough)
        s = b.op('LESS_THAN', b.op('FRACT', b.op('MULTIPLY', b.z, scale)), duty)
        b.base(b.ramp(s, [(0.0, c1), (0.5, c2)], constant=True))
        if knit:
            ang = b.op('ARCTAN2', b.x, b.y)
            rib = b.op('SINE', b.op('MULTIPLY', b.op('FRACT', b.op('MULTIPLY', ang, 22 / TAU)), PI))
            b.bump(rib, strength=0.35, distance=0.004)
        return b.m
    return _cached(('stripes', name, c1, c2, scale, duty), make)


def mat_stain(name, base, stain, scale=7.0, lo=0.50, hi=0.68, rough=0.9, amount=1.0, weave=True):
    """Work cloth with irregular dark stains (soot, mud): noise -> base..stain."""
    def make():
        b = _NB(name, rough)
        n = b.noise(scale, detail=4.0, rough=0.6)
        mid = _mix_hex(base, stain, amount)
        col = b.ramp(n, [(0.0, base), (lo, base), (hi, mid)])
        b.base(col)
        if weave:
            w = b.op('SINE', b.op('MULTIPLY', b.op('ADD', b.op('ADD', b.x, b.y), b.z), 420.0))
            b.bump(w, strength=0.12, distance=0.002)
        return b.m
    return _cached(('stain', name, base, stain, scale, lo, hi, amount), make)


def mat_rope(name, color, dark=None, scale=90.0, rough=0.9):
    dark = dark or _shade(color, 0.72)

    def make():
        b = _NB(name, rough)
        t = b.op('FRACT', b.op('MULTIPLY', b.op('ADD', b.op('ADD', b.x, b.y), b.z), scale))
        tri = b.op('ABSOLUTE', b.op('SUBTRACT', b.op('MULTIPLY', t, 2.0), 1.0))
        b.base(b.ramp(tri, [(0.0, dark), (0.45, color), (1.0, _shade(color, 1.08))]))
        b.bump(tri, strength=0.5, distance=0.004)
        return b.m
    return _cached(('rope', name, color, scale), make)


def mat_dots(name, base, dots, scale=26.0, size=0.30, rough=0.85):
    """Floral / polka cloth: voronoi cells with a coloured dot in the middle
    (two staggered layers so the print is busy like 몸빼 pants)."""
    def make():
        b = _NB(name, rough)
        v1 = b.nt.nodes.new('ShaderNodeTexVoronoi')
        v1.inputs['Scale'].default_value = scale
        v1.inputs['Randomness'].default_value = 0.6
        b.nt.links.new(b.vec, v1.inputs['Vector'])
        d1 = b.op('LESS_THAN', v1.outputs['Distance'], size)
        v2 = b.nt.nodes.new('ShaderNodeTexVoronoi')
        v2.inputs['Scale'].default_value = scale * 1.3
        v2.inputs['Randomness'].default_value = 0.8
        b.nt.links.new(b.vec, v2.inputs['Vector'])
        d2 = b.op('LESS_THAN', v2.outputs['Distance'], size * 0.75)
        idx = b.op('MAXIMUM', b.op('MULTIPLY', d1, 0.5), d2)
        b.base(b.ramp(idx, [(0.0, base), (0.3, dots[0]), (0.8, dots[1 % len(dots)])], constant=True))
        return b.m
    return _cached(('dots', name, base, tuple(dots), scale, size), make)


def mat_polka(name, base, dot, scale=14.0, size=0.26, rough=0.85):
    """Regular polka dots (grid voronoi, no jitter)."""
    def make():
        b = _NB(name, rough)
        v = b.nt.nodes.new('ShaderNodeTexVoronoi')
        v.inputs['Scale'].default_value = scale
        v.inputs['Randomness'].default_value = 0.0
        b.nt.links.new(b.vec, v.inputs['Vector'])
        d = b.op('LESS_THAN', v.outputs['Distance'], size)
        b.base(b.ramp(d, [(0.0, base), (0.5, dot)], constant=True))
        return b.m
    return _cached(('polka', name, base, dot, scale, size), make)


def mat_fur(name, color, tip=None, rough=0.97, scale=60.0):
    """Fur / fleece: noisy light tips + strong bump."""
    tip = tip or _shade(color, 1.14)

    def make():
        b = _NB(name, rough)
        n = b.noise(scale, detail=6.0, rough=0.7)
        b.base(b.ramp(n, [(0.25, _shade(color, 0.86)), (0.5, color), (0.75, tip)]))
        b.bump(n, strength=0.8, distance=0.008)
        return b.m
    return _cached(('fur', name, color, tip), make)


def mat_weave(name, color, dark=None, scale=70.0, rough=0.85):
    """Straw / wicker: fine crossing bands."""
    dark = dark or _shade(color, 0.82)

    def make():
        b = _NB(name, rough)
        a = b.op('SINE', b.op('MULTIPLY', b.op('ADD', b.x, b.y), scale))
        c = b.op('SINE', b.op('MULTIPLY', b.z, scale * 1.2))
        h = b.op('MULTIPLY', b.op('ADD', b.op('MULTIPLY', a, c), 1.0), 0.5)
        b.base(b.ramp(h, [(0.0, dark), (0.6, color), (1.0, _shade(color, 1.06))]))
        b.bump(h, strength=0.4, distance=0.003)
        return b.m
    return _cached(('weave', name, color, scale), make)


def oilskin(name, color):
    """Waxed / rubberised cloth: smooth, a soft sheen."""
    return M(name, color, rough=0.34)


def _shade(hexcol, k):
    r, gg, bb = bc.hex_rgb(hexcol)
    f = lambda v: max(0.0, min(1.0, v * k))
    return '#%02X%02X%02X' % (round(f(r) * 255), round(f(gg) * 255), round(f(bb) * 255))


def _mix_hex(a, b, t):
    ra, ga, ba = bc.hex_rgb(a)
    rb, gb, bbb = bc.hex_rgb(b)
    return '#%02X%02X%02X' % tuple(round((x + (y - x) * t) * 255) for x, y in ((ra, rb), (ga, gb), (ba, bbb)))


def make_mat(desc, name='cloth'):
    """Material from a compact description: '#hex' | ('knit', col[, dark]) |
    ('check', base, line, cross, scale) | ('stripes', c1, c2, scale) |
    ('stain', base, stain[, scale]) | ('oil', col) | ('dots', base, [c1, c2]) |
    ('fur', col) | ('weave', col) | ('rough', col, r)."""
    if desc is None:
        return None
    if isinstance(desc, str):
        return M(name, desc, rough=0.85)
    kind = desc[0]
    if kind == 'knit':
        return mat_knit(name + '_knit', desc[1], desc[2] if len(desc) > 2 else None,
                        cable=desc[3] if len(desc) > 3 else True)
    if kind == 'rib':
        return mat_knit(name + '_rib', desc[1], desc[2] if len(desc) > 2 else None, cols=26, cable=False)
    if kind == 'check':
        return mat_check(name + '_check', desc[1], desc[2], desc[3], scale=desc[4] if len(desc) > 4 else 12.0,
                         duty=desc[5] if len(desc) > 5 else 0.5)
    if kind == 'stripes':
        return mat_stripes(name + '_str', desc[1], desc[2], scale=desc[3] if len(desc) > 3 else 20.0)
    if kind == 'stain':
        return mat_stain(name + '_stain', desc[1], desc[2], scale=desc[3] if len(desc) > 3 else 7.0,
                         amount=desc[4] if len(desc) > 4 else 1.0)
    if kind == 'oil':
        return oilskin(name + '_oil', desc[1])
    if kind == 'dots':
        return mat_dots(name + '_dots', desc[1], desc[2], scale=desc[3] if len(desc) > 3 else 26.0)
    if kind == 'polka':
        return mat_polka(name + '_polka', desc[1], desc[2], scale=desc[3] if len(desc) > 3 else 14.0)
    if kind == 'fur':
        return mat_fur(name + '_fur', desc[1], desc[2] if len(desc) > 2 else None)
    if kind == 'weave':
        return mat_weave(name + '_weave', desc[1])
    if kind == 'rough':
        return M(name, desc[1], rough=desc[2])
    raise ValueError(desc)


# =========================================================================== geometry helpers

def frange(a, b, n):
    return [a + (b - a) * k / (n - 1) for k in range(n)]


def catmull3(ctrl, n=24):
    """Catmull-Rom through 3D control points."""
    pts = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    segs = len(ctrl) - 1
    out = []
    for k in range(n):
        t = k / (n - 1) * segs
        i = min(int(t), segs - 1)
        u = t - i
        p0, p1, p2, p3 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
        out.append(Vector(tuple(0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * u +
                                       (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u +
                                       (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u ** 3) for c in range(3))))
    return out


def fuzz(bm, amp=0.01, f=23.0, seed=0.0):
    """Deterministic lumpy displacement along vertex normals (fur, knit)."""
    bm.normal_update()
    for v in bm.verts:
        x, y, z = v.co
        nz = (math.sin(f * x + seed) * math.sin(f * 1.13 * y + 2.0 * seed) * math.cos(f * 0.91 * z + 1.7)
              + 0.5 * math.sin(f * 2.1 * (x + z) + 3.0 * seed))
        v.co += v.normal * amp * nz
    return bm


def sector_lathe(prof, keep_deg=70, seg=64, sy=0.84, center_deg=0.0, smooth_n=0):
    """Lathe keeping only |angle - centre| < keep_deg (0 = front, +90 = character's left)."""
    bm = g.bm_lathe(prof, seg=seg, sy=sy, smooth_n=smooth_n, cap_top=False, cap_bottom=False)
    kill = []
    for fc in bm.faces:
        c = fc.calc_center_median()
        ang = math.degrees(math.atan2(c.x, -c.y)) - center_deg
        ang = (ang + 180) % 360 - 180
        if abs(ang) > keep_deg:
            kill.append(fc)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    return bm


def open_lathe(prof, gap_deg=30, seg=64, sy=0.84, smooth_n=0):
    """Lathe with an open front (jackets, vests)."""
    bm = g.bm_lathe(prof, seg=seg, sy=sy, smooth_n=smooth_n, cap_top=False, cap_bottom=False)
    kill = [f for f in bm.faces if abs(math.degrees(math.atan2(f.calc_center_median().x,
                                                               -f.calc_center_median().y))) < gap_deg]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    return bm


class Torso:
    """The coat lathe's surface (same profile/smoothing as char_build.build_human),
    so straps, bibs and pockets can be laid exactly on it."""

    def __init__(self, spec):
        hem_r = spec.get('hem_r', 0.250)
        hz = spec.get('hem_z', -0.095)
        prof = spec.get('torso_profile', [(hem_r, hz), (hem_r - 0.012, hz + 0.08), (0.212, 0.10),
                                          (0.208, 0.22), (0.195, 0.31), (0.155, 0.39), (0.07, 0.45),
                                          (0.0, 0.46)])
        self.sm = g.catmull(prof, 26)
        self.sy = spec.get('torso_sy', 0.84)
        self.hem_z = prof[0][1]
        self.hem_r = prof[0][0]

    def r(self, z):
        sm = self.sm
        if z <= sm[0][1]:
            return sm[0][0]
        for (r0, z0), (r1, z1) in zip(sm, sm[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / max(1e-6, z1 - z0)
                return r0 + (r1 - r0) * t
        return sm[-1][0]

    def pt(self, phi_deg, z, out=0.0):
        r = self.r(z) + out
        a = math.radians(phi_deg)
        return Vector((r * math.sin(a), -r * self.sy * math.cos(a), z))

    def prof(self, z0, z1, out, n=10):
        return [(self.r(z) + out, z) for z in frange(z0, z1, n)]


def strap(parent, pts, width, thick, material, name='strap', n=28, side_ref=(1, 0, 0)):
    """Flat band through control points (suspenders, overall straps, quiver strap)."""
    path = catmull3([Vector(p) for p in pts], n)
    bm = g.bm_tube_path(path, thick / 2, segr=8, side_ref=side_ref, flat=width / thick)
    return g.mesh_obj(name, bm, material, parent)


def surf_obj(parent, name, bm, material, T, phi, z, out, tilt=0.0, spin=0.0):
    """Place a small part (built facing -Y) on the torso surface at (phi, z)."""
    p = T.pt(phi, z, out)
    return g.mesh_obj(name, bm, material, parent, loc=tuple(p), rot=(tilt, spin, phi))


def shoulder_path(T, side, z_front, phi_front, out=0.012, cross=True, z_back=0.06, phi_back=None):
    """Control points of a strap from the front (phi_front, z_front) over the shoulder
    (side=+1 character's left) and down the back (crossing to the other side if cross)."""
    s = side
    pts = [T.pt(s * phi_front, z_front, out), T.pt(s * (phi_front + 1), z_front + 0.10, out),
           T.pt(s * (phi_front + 2), 0.33, out), T.pt(s * (phi_front + 4), 0.385, out + 0.004)]
    pts.append(Vector((s * 0.105, 0.0, 0.452)))
    pb = phi_back if phi_back is not None else (180 - 30)
    pts += [T.pt(s * pb, 0.385, out + 0.004), T.pt(s * (pb - 2), 0.30, out)]
    if cross:
        pts += [T.pt(180 - s * 4, 0.18, out), T.pt(180 - s * 28, z_back, out)]
    else:
        pts += [T.pt(s * (pb - 8), z_back, out)]
    return pts


def buckle(parent, T, phi, z, out, color='#C9CED6', size=(0.046, 0.012, 0.036), name='buckle'):
    m = M('metal_' + color, color, rough=0.32, metal=0.75)
    return surf_obj(parent, name, g.bm_box(*size, bevel=0.006), m, T, phi, z, out)


# =========================================================================== head pieces

def brows(rig, color, spread=0.37, el=0.135, size=(0.050, 0.016, 0.017), tilt=8, bushy=False):
    bm_ = M('brow_' + color, color, rough=0.8)
    for s in (-1, 1):
        if bushy:
            b = fuzz(g.bm_ellipsoid(size[0] * 1.15, size[1] * 1.3, size[2] * 1.5, 14, 8), 0.004, 60.0)
        else:
            b = g.bm_ellipsoid(*size, 12, 6)
        cb.on_head('brow', b, bm_, rig.j['head'], s * spread, el, out=0.0, tilt=s * tilt)


def lashes(rig, spread=0.37, el=-0.10, color='#2A2026'):
    """Little upturned lash flicks at the outer corner of the eyes (female faces)."""
    lm = M('lash', color, rough=0.4)
    for s in (-1, 1):
        cb.on_head('lash', g.bm_ellipsoid(0.026, 0.008, 0.010, 10, 6), lm, rig.j['head'],
                   s * (spread + 0.085), el + 0.075, out=-0.004, tilt=-s * 28)


def moustache(rig, color, size=(0.058, 0.03, 0.03), spread=0.11, el=-0.27, tilt=18, droop=0.0, fuzzy=False):
    m = M('beard_' + color, color, rough=0.8)
    for s in (-1, 1):
        b = g.bm_ellipsoid(*size, 12, 8)
        if fuzzy:
            b = fuzz(b, 0.004, 50.0)
        cb.on_head('stache', b, m, rig.j['head'], s * spread, el - droop, out=-0.002, tilt=-s * tilt)


def beard(rig, color, style='full'):
    """'full' (big lumberjack), 'short' (trimmed, follows the jaw), 'chin' (chinstrap
    without moustache - old salt), 'stubble' (shadow on the jaw)."""
    if style == 'full':
        cb.beard(rig, color, edge=-0.36, curve=0.42, base=1.13, chin=0.16)
    elif style == 'short':
        cb.beard(rig, color, edge=-0.42, curve=0.36, base=1.075, chin=0.07)
    elif style == 'trim':
        cb.beard(rig, color, edge=-0.47, curve=0.30, base=1.05, chin=0.05)
    elif style == 'chin':
        b = cb.beard(rig, color, edge=-0.40, curve=0.32, base=1.13, chin=0.18)
        b.data.materials[0] = M('beard_' + color, color, rough=0.85)
    elif style == 'stubble':
        cb.beard(rig, color, edge=-0.44, curve=0.30, base=1.02, chin=0.02)


def soot_smudges(rig, color='#4E4440', spots=((0.55, -0.12, 0.034), (-0.30, 0.10, 0.026), (0.0, -0.20, 0.016))):
    m = M('soot', color, rough=0.95)
    for az, el, r in spots:
        cb.on_head('smudge', g.bm_ellipsoid(r * 1.3, 0.007, r, 10, 6), m, rig.j['head'], az, el, out=-0.003,
                   tilt=12)
        cb.on_head('smudge', g.bm_ellipsoid(r * 0.8, 0.007, r * 0.7, 10, 6), m, rig.j['head'], az + 0.07,
                   el - 0.04, out=-0.003)


def short_hair(rig, color, fringe=0.30, back_low=-0.45, sweep=0.06, wave=0.05, waves=10.0, nape=True):
    cb.hair_shell(rig, color, fringe=fringe, wave=wave, waves=waves, sweep=sweep, back_low=back_low)
    if nape:
        for k, az in enumerate((2.75, 3.05, 3.35)):
            cb.hair_tuft(rig, color, az, -0.40 + 0.04 * (k % 2), size=(0.05, 0.04, 0.08), tilt=(150, 0, 0),
                         name='nape')


def ponytail(rig, color, tie='#C8463D', high=0.42, length=5, side=0.0, scale=1.0):
    """Ponytail from the back of the head (az = pi) hanging down behind the neck."""
    hm = M('hair', color, rough=0.42)
    p, n = cb.head_point(PI + side, high, out=0.0)
    base = Vector((p.x, p.y, p.z + HEAD_C))
    pts = [base + Vector((0, 0.06, 0.02)), base + Vector((0, 0.14, -0.06)),
           base + Vector((0, 0.17, -0.20)), base + Vector((0, 0.15, -0.34)), base + Vector((0, 0.12, -0.44))]
    path = catmull3(pts, length * 2 + 2)
    for k, c in enumerate(path[1:]):
        t = k / max(1, len(path) - 2)
        rr = (0.075 - 0.035 * t) * scale
        g.mesh_obj('ponytail', g.bm_ellipsoid(rr, rr * 0.9, rr * 1.25, 14, 8), hm, rig.j['head'], loc=tuple(c))
    g.mesh_obj('pony_tie', g.bm_ring(0.042, 0.018, seg=18, segr=6), M('tie_' + tie, tie, rough=0.6),
               rig.j['head'], loc=tuple(path[1]), rot=(70, 0, 0))


def braid(rig, color, tie='#C8463D', start=(0.0, 0.0), pts=None, n=7, r0=0.055, name='braid', parent='head'):
    """A plait: alternating lobes along a path (head-local points)."""
    hm = M('hair', color, rough=0.42)
    path = catmull3([Vector(p) for p in pts], n)
    par = rig.j[parent]
    for k, c in enumerate(path):
        t = k / max(1, len(path) - 1)
        rr = r0 * (1 - 0.35 * t)
        off = Vector(((-1) ** k * 0.012, 0, 0))
        g.mesh_obj(name, g.bm_ellipsoid(rr, rr * 0.85, rr * 1.15, 14, 8), hm, par, loc=tuple(c + off),
                   rot=(0, (-1) ** k * 25, 0))
    end = path[-1]
    g.mesh_obj(name + '_tie', g.bm_ring(0.026, 0.012, seg=16, segr=6), M('tie_' + tie, tie, rough=0.6), par,
               loc=tuple(end + Vector((0, 0, -0.035))))
    g.mesh_obj(name + '_end', g.bm_ellipsoid(0.030, 0.026, 0.045, 10, 6), hm, par,
               loc=tuple(end + Vector((0, 0, -0.08))))


def pompom(rig, color, loc, r=0.075):
    return cb.head_obj(rig, 'pompom', g.bm_ring(0.0, r, seg=24, segr=14, tufts=6, bump=0.28, seed=2.0),
                       mat_fur('pompom', color), loc=loc)


def watch_cap(rig, desc, front=0.40, back=0.10, puff=0.14, base=1.11, cuff=0.048, pom=None, lumps=0.0,
              cuff_desc=None):
    """Rolled-cuff knit cap (fisherman's watch cap / logger's beanie)."""
    km = make_mat(desc, 'cap')
    if cuff_desc:
        cm = make_mat(cuff_desc, 'capcuff')
    elif isinstance(desc, tuple) and desc[0] == 'knit':
        cm = make_mat(('rib', desc[1]), 'capcuff')
    else:
        cm = km
    cb.cap_shell(rig, km, lambda x, y: (front + back) / 2 + (back - front) / 2 * y, base=base, puff=puff,
                 name='cap', lumps=lumps)
    zf, zb = front + 0.02, back + 0.02
    zm = (zf + zb) / 2
    R = HEAD_R[0] * math.sqrt(max(0.05, 1 - zm * zm)) * base * 1.0 + 0.012
    cb.tilted_ring(rig, 'cap_cuff', cm, R, cuff, zf, zb, sy=0.97, rz=1.25)
    if pom:
        cb.head_obj(rig, 'pompom', g.bm_ring(0.0, 0.075, seg=24, segr=14, tufts=6, bump=0.28, seed=2.0),
                    mat_fur('pompom', pom), loc=(0.0, 0.02, HEAD_R[2] * base * (1 + puff) + 0.03))


def straw_hat(rig, straw='#E8C25A', band='#C8463D', brim=0.47, tilt=-8):
    sm = mat_weave('straw', straw)
    tie = M('hatband_' + band, band, rough=0.6)
    cb.head_obj(rig, 'hat_crown', g.bm_lathe([(0.21, 0.0), (0.205, 0.10), (0.17, 0.16), (0.0, 0.175)],
                                             seg=40, smooth_n=12, cap_bottom=False), sm,
                loc=(0, 0.02, 0.20), rot=(tilt, 0, 0))
    cb.head_obj(rig, 'hat_band', g.bm_ring(0.212, 0.022, seg=48, segr=8, rz=1.4), tie,
                loc=(0, 0.02, 0.235), rot=(tilt, 0, 0))
    br = g.bm_lathe([(0.20, 0.012), (0.36, 0.0), (brim, -0.035), (brim + 0.01, -0.050), (0.36, -0.016),
                     (0.20, -0.004)], seg=64, smooth_n=0, cap_top=False, cap_bottom=False)
    cb.head_obj(rig, 'hat_brim', br, sm, loc=(0, 0.02, 0.21), rot=(tilt, 0, 0))


def felt_hat(rig, felt='#6B4A35', band='#3B2A20', brim=0.40, tilt=-6, crown_h=0.17):
    """Fedora-ish felt hat with a pinched crown (old farmer)."""
    fm = M('felt_' + felt, felt, rough=0.9)
    crown = g.bm_lathe([(0.215, 0.0), (0.21, crown_h * 0.6), (0.18, crown_h), (0.0, crown_h * 0.82)],
                       seg=44, smooth_n=12, cap_bottom=False, sy=0.92)
    for v in crown.verts:                      # front pinch
        if v.co.z > crown_h * 0.5 and v.co.y < 0:
            v.co.x *= 1.0 - 0.18 * smoothstep(crown_h * 0.5, crown_h, v.co.z)
    cb.head_obj(rig, 'hat_crown', crown, fm, loc=(0, 0.02, 0.21), rot=(tilt, 0, 0))
    cb.head_obj(rig, 'hat_band', g.bm_ring(0.214, 0.020, seg=48, segr=8, rz=1.3, sy=0.92),
                M('hatband_' + band, band, rough=0.6), loc=(0, 0.02, 0.235), rot=(tilt, 0, 0))
    br = g.bm_lathe([(0.20, 0.010), (0.33, 0.004), (brim, 0.020), (brim + 0.008, 0.008), (0.33, -0.010),
                     (0.20, -0.006)], seg=64, smooth_n=0, cap_top=False, cap_bottom=False, sy=0.95)
    cb.head_obj(rig, 'hat_brim', br, fm, loc=(0, 0.02, 0.215), rot=(tilt, 0, 0))


def hard_hat(rig, color='#F2B33A', lamp=True, ridge=True, goggles=None):
    """Miner's helmet: dome + all-round rim + front peak + centre ridge + cap lamp."""
    hat = M('hardhat_' + color, color, rough=0.32)

    def dome(x, y, z):
        e = 0.16 - 0.05 * y
        t = smoothstep(e - 0.02, e + 0.02, z)
        f = 0.88 + (1.14 - 0.88) * t
        if ridge:
            f *= 1.0 + 0.045 * math.exp(-(x / 0.11) ** 2) * smoothstep(0.25, 0.55, z) * t
        return f * (1.0 + 0.12 * max(0.0, z) ** 2)
    cb.shell(rig, hat, dome, 'hardhat')
    cb.tilted_ring(rig, 'hardhat_rim', hat, HEAD_R[0] * 1.11, 0.026, 0.20, 0.10, sy=0.97, rz=0.7)
    visor = g.bm_lathe([(0.30, 0.010), (0.385, -0.014), (0.39, -0.026), (0.30, -0.006)], seg=48,
                       sy=1.0, cap_top=False, cap_bottom=False)
    kill = [f for f in visor.faces if f.calc_center_median().y > -0.10]
    bmesh.ops.delete(visor, geom=kill, context='FACES')
    cb.head_obj(rig, 'hardhat_visor', visor, hat, loc=(0, 0.0, 0.055), rot=(-4, 0, 0))
    if lamp:
        p, n = cb.head_point(0.0, 0.40, out=0.05)
        rot = (-n).to_track_quat('Z', 'Y')
        cb.head_obj(rig, 'lamp_bracket', g.bm_box(0.07, 0.03, 0.06, bevel=0.008),
                    M('lamp_body', '#4A4F58', rough=0.4, metal=0.5), loc=(p.x, p.y + 0.035, p.z - 0.03), rot=rot)
        cb.head_obj(rig, 'lamp', g.bm_cyl(0.056, 0.062, 0.05, seg=22), M('lamp_body', '#4A4F58', rough=0.4, metal=0.5),
                    loc=(p.x, p.y + 0.02, p.z - 0.02), rot=rot)
        cb.head_obj(rig, 'lamp_rim', g.bm_ring(0.050, 0.012, seg=24, segr=8), M('lamp_rim', '#C9CED6', rough=0.3,
                                                                              metal=0.8),
                    loc=(p.x + n.x * 0.002, p.y + n.y * 0.002 + 0.0, p.z - 0.02), rot=rot)
        cb.head_obj(rig, 'lamp_lens', g.bm_ellipsoid(0.044, 0.044, 0.014, 18, 8),
                    M('lamp_lens', '#FFF6C8', rough=0.2, emission='#FFE27A', emission_strength=5.0),
                    loc=(p.x, p.y - 0.006, p.z - 0.02), rot=rot)
    if goggles:
        strap_m = M('goggle_strap', goggles[0], rough=0.7)
        cb.tilted_ring(rig, 'goggle_strap', strap_m, HEAD_R[0] * 1.15, 0.016, 0.34, 0.24, sy=0.98, rz=1.6)
        lens = M('goggle_lens', goggles[1], rough=0.15, metal=0.2)
        rim = M('goggle_rim', '#5A4A3A', rough=0.5)
        for s in (-1, 1):
            p, n = cb.head_point(s * 0.24, 0.40, out=0.0, radii=tuple(r * 1.16 for r in HEAD_R))
            rot = (-n).to_track_quat('Z', 'Y')
            cb.head_obj(rig, 'goggle_rim', g.bm_cyl(0.058, 0.054, 0.035, seg=20), rim, loc=(p.x, p.y, p.z), rot=rot)
            cb.head_obj(rig, 'goggle_lens', g.bm_ellipsoid(0.046, 0.046, 0.012, 16, 8), lens,
                        loc=(p.x + n.x * 0.03, p.y + n.y * 0.03, p.z + n.z * 0.03), rot=rot)


def trapper_hat(rig, crown='#5A3A24', fur='#C49A6C', flaps='down', fur_desc=None):
    """Fur trapper hat: leather crown, deep fur band all round, long furry ear flaps."""
    cm = M('trapper_crown_' + crown, crown, rough=0.7)
    fm = make_mat(fur_desc or ('fur', fur), 'trapper')
    cb.cap_shell(rig, cm, lambda x, y: 0.30 - 0.12 * y, base=1.13, puff=0.10, name='trapper', lumps=0.01)
    cb.tilted_ring(rig, 'trapper_band', fm, HEAD_R[0] * 1.02, 0.058, 0.50, 0.22, sy=1.0, tufts=14,
                   bump=0.35, seed=4.0)
    if flaps == 'down':
        for s in (-1, 1):
            cb.head_obj(rig, 'earflap', fuzz(g.bm_ellipsoid(0.06, 0.13, 0.17, 18, 10), 0.007, 38.0), fm,
                        loc=(s * 0.31, 0.05, -0.06), rot=(0, s * 12, 0))
            cb.head_obj(rig, 'earflap_tie', g.bm_tube_path([(s * 0.30, -0.02, -0.24), (s * 0.27, -0.06, -0.32)],
                                                           0.008, segr=6), cm)
    # front flap turned up (fur showing)
    cb.head_obj(rig, 'front_flap', fuzz(g.bm_ellipsoid(0.16, 0.05, 0.085, 18, 10), 0.006, 38.0), fm,
                loc=(0, -0.235, 0.215), rot=(-28, 0, 0))


def earflap_cap(rig, desc=('check', '#C8402F', '#5E1A17', '#2A1414', 9.0), lining='#3B2A20'):
    """Plaid hunting cap with ear flaps and a short peak (burly lumberjack)."""
    m = make_mat(desc, 'flapcap')
    cb.cap_shell(rig, m, lambda x, y: 0.36 - 0.12 * y, base=1.12, puff=0.10, name='flapcap')
    cb.tilted_ring(rig, 'flapcap_band', m, HEAD_R[0] * 1.03, 0.030, 0.50, 0.26, sy=0.98, rz=1.2)
    peak = g.bm_lathe([(0.27, 0.008), (0.37, -0.022), (0.375, -0.034), (0.27, -0.008)], seg=48, sy=1.0,
                      cap_top=False, cap_bottom=False)
    kill = [f for f in peak.faces if f.calc_center_median().y > -0.14]
    bmesh.ops.delete(peak, geom=kill, context='FACES')
    cb.head_obj(rig, 'flapcap_peak', peak, m, loc=(0, 0.0, 0.135), rot=(-14, 0, 0))
    for s in (-1, 1):
        cb.head_obj(rig, 'earflap', g.bm_ellipsoid(0.05, 0.12, 0.14, 16, 10), m, loc=(s * 0.31, 0.04, -0.03),
                    rot=(0, s * 10, 0))
        cb.head_obj(rig, 'earflap_lining', fuzz(g.bm_ellipsoid(0.042, 0.11, 0.035, 14, 8), 0.004, 50.0),
                    mat_fur('flap_lining', '#E8DCC8'), loc=(s * 0.31, 0.04, -0.15), rot=(0, s * 10, 0))


def headscarf(rig, desc=('dots', '#E86A8E', ['#FFFFFF', '#F7C6D6'], 30.0)):
    """Korean farm auntie's tied headscarf (towel) with the knot under the chin."""
    m = make_mat(desc, 'scarf')
    cb.cap_shell(rig, m, lambda x, y: 0.16 - 0.30 * y - 0.25 * abs(x) * (y > 0), base=1.12, puff=0.06,
                 name='headscarf', lumps=0.02)
    for s in (-1, 1):
        cb.head_obj(rig, 'scarf_side', fuzz(g.bm_ellipsoid(0.06, 0.13, 0.15, 16, 10), 0.004, 40.0), m,
                    loc=(s * 0.30, 0.02, -0.10), rot=(0, s * 14, 0))
    cb.head_obj(rig, 'scarf_knot', g.bm_ellipsoid(0.05, 0.04, 0.04, 12, 8), m, loc=(0.10, -0.20, -0.29))
    for s in (-1, 1):
        cb.head_obj(rig, 'scarf_end', g.bm_ellipsoid(0.03, 0.015, 0.065, 10, 6), m,
                    loc=(0.10 + s * 0.035, -0.22, -0.35), rot=(10, s * 25, 0))


def wolf_hood(rig, fur='#8E8A86', light='#D8D2C8', inner='#5A4A40'):
    """Wolf-pelt hood: furry hood with pointed ears and a little muzzle on the brow."""
    fm = mat_fur('wolf', fur, light)
    lm = mat_fur('wolf_light', light)

    def hood(x, y, z):
        face = smoothstep(0.05, 0.55, -y) * smoothstep(-0.95, -0.55, z) * \
            (1 - smoothstep(0.40, 0.60, z)) * (1 - smoothstep(0.62, 0.82, abs(x)))
        f = 1.17 - 0.32 * face
        return f * (1.0 + 0.06 * max(0.0, z) ** 2)
    b = g.bm_shell(*HEAD_R, hood, seg=56, rings=28)
    g.mesh_obj('wolf_hood', fuzz(b, 0.006, 45.0), fm, rig.j['head'], loc=(0, 0, HEAD_C))
    cb.head_obj(rig, 'hood_rim', g.bm_ring(0.215, 0.050, seg=56, segr=12, tufts=12, bump=0.45, seed=9.0, sy=1.05),
                lm, loc=(0, -0.20, -0.02), rot=(78, 0, 0))
    for s in (-1, 1):
        p, n = cb.head_point(s * 0.50, 0.82, out=0.03, radii=tuple(r * 1.15 for r in HEAD_R))
        ear = g.bm_lathe([(0.0, 0.0), (0.065, 0.015), (0.04, 0.08), (0.0, 0.13)], seg=14, smooth_n=8, sy=0.5)
        cb.head_obj(rig, 'wolf_ear', ear, fm, loc=(p.x, p.y, p.z), rot=n.to_track_quat('Z', 'Y'))
        cb.head_obj(rig, 'wolf_ear_in', g.bm_ellipsoid(0.028, 0.012, 0.05, 10, 6), M('wolf_in', inner, rough=0.9),
                    loc=(p.x, p.y - 0.024, p.z + 0.04), rot=n.to_track_quat('Z', 'Y'))


def fox_hat(rig, fur='#D9783A', light='#F4E8D8'):
    """Round fox-fur hat with the tail hanging down the back."""
    fm = mat_fur('fox', fur, '#F0A060')
    lm = mat_fur('fox_light', light)
    cb.cap_shell(rig, fm, lambda x, y: 0.32 - 0.10 * y, base=1.13, puff=0.08, name='foxhat', lumps=0.03)
    cb.tilted_ring(rig, 'foxhat_band', mat_fur('fox_band', '#C86A30', '#E89050'), HEAD_R[0] * 1.03, 0.055, 0.48,
                   0.24, sy=1.0, tufts=16, bump=0.4, seed=6.0)
    for sx in (-1, 1):                    # little fox ears on the crown
        p, n = cb.head_point(sx * 0.42, 0.86, out=0.02, radii=tuple(r * 1.13 for r in HEAD_R))
        ear = g.bm_lathe([(0.0, 0.0), (0.05, 0.012), (0.03, 0.06), (0.0, 0.095)], seg=12, smooth_n=8, sy=0.5)
        cb.head_obj(rig, 'fox_ear', ear, fm, loc=(p.x, p.y, p.z), rot=n.to_track_quat('Z', 'Y'))
        cb.head_obj(rig, 'fox_ear_in', g.bm_ellipsoid(0.022, 0.010, 0.035, 10, 6), lm,
                    loc=(p.x, p.y - 0.02, p.z + 0.03), rot=n.to_track_quat('Z', 'Y'))
    pts = [Vector((0.06, 0.30, 0.10 + HEAD_C)), Vector((0.12, 0.36, -0.06 + HEAD_C)),
           Vector((0.14, 0.34, -0.24 + HEAD_C)), Vector((0.10, 0.28, -0.40 + HEAD_C))]
    path = catmull3(pts, 10)
    for k, c in enumerate(path):
        t = k / (len(path) - 1)
        rr = 0.05 + 0.035 * math.sin(PI * min(1.0, t * 1.1))
        mat = lm if t > 0.8 else fm
        g.mesh_obj('fox_tail', fuzz(g.bm_ellipsoid(rr, rr, rr * 1.2, 14, 8), 0.006, 40.0), mat, rig.j['head'],
                   loc=tuple(c))


def pipe(rig, wood='#6B3E24'):
    m = M('pipe', wood, rough=0.5)
    p, n = cb.head_point(0.22, -0.36, out=0.02)
    base = Vector((p.x, p.y, p.z + HEAD_C))
    cb.head_obj(rig, 'pipe_stem', g.bm_tube_path([(0, 0, 0), (0.05, -0.06, -0.03), (0.09, -0.10, -0.02)], 0.011,
                                                 segr=8), M('pipe_stem', '#2A2026', rough=0.4),
                loc=(base.x, base.y, base.z - HEAD_C))
    cb.head_obj(rig, 'pipe_bowl', g.bm_lathe([(0.0, -0.035), (0.032, -0.03), (0.036, 0.02), (0.028, 0.024),
                                              (0.0, 0.0)], seg=16, smooth_n=8), m,
                loc=(base.x + 0.10, base.y - 0.11, base.z - HEAD_C + 0.005))


# =========================================================================== body pieces

def glove_cuffs(rig, color, r=0.066, h=0.03):
    m = M('glove_cuff_' + color, color, rough=0.6)
    for n in ('R', 'L'):
        g.mesh_obj('glove_cuff_' + n, g.bm_lathe([(r * 0.92, -0.02), (r, 0.0), (r * 1.04, h), (r * 0.9, h + 0.004)],
                                                  seg=24, smooth_n=0, cap_top=False, cap_bottom=False), m,
                   rig.j['el_' + n], loc=(0, 0, -FOREARM + 0.0))


def sleeve_cuffs(rig, desc, r=0.072, h=0.035, z=-FOREARM + 0.018):
    m = make_mat(desc, 'cuff')
    for n in ('R', 'L'):
        g.mesh_obj('cuff_' + n, g.bm_ring(r - 0.012, 0.022, seg=28, segr=8, rz=h / 0.03), m, rig.j['el_' + n],
                   loc=(0, 0, z))


def tall_boots(rig, color, band=None, sole='#2A2420', top=0.03, r=0.074):
    """Rubber boots up to just under the knee (wellies / deck boots)."""
    rub = M('rubber_' + color, color, rough=0.28)
    for n in ('R', 'L'):
        g.mesh_obj('bootleg_' + n, g.bm_lathe([(r - 0.004, -0.16), (r, -0.04), (r + 0.004, top - 0.01),
                                               (r + 0.005, top), (0.0, top + 0.001)], seg=24, smooth_n=0,
                                              cap_top=False), rub, rig.j['knee_' + n])
        if band:
            g.mesh_obj('bootband_' + n, g.bm_ring(r + 0.002, 0.012, seg=28, segr=8, rz=1.0),
                       M('bootband_' + band, band, rough=0.4), rig.j['knee_' + n], loc=(0, 0, top - 0.008))
    boot_soles(rig, sole)


def boot_soles(rig, color, h=0.024):
    sm = M('sole_' + color, color, rough=0.7)
    prof = [(0.0, -0.204), (0.058, -0.203), (0.079, -0.196), (0.080, -0.200 + h), (0.0, -0.200 + h)]
    for n in ('R', 'L'):
        g.mesh_obj('sole_' + n, g.bm_lathe(prof, seg=24, sy=1.25, smooth_n=0,
                                           yoff=lambda z: -0.028 * (1 - (z + 0.2) / 0.15)),
                   sm, rig.j['knee_' + n], loc=(0, -0.012, 0.012))


def boot_laces(rig, color='#E8DCC0', toe=None):
    lm = M('lace_' + color, color, rough=0.7)
    for n in ('R', 'L'):
        for k in range(3):
            z = -0.11 + 0.025 * k
            g.mesh_obj('lace_' + n, g.bm_box(0.05, 0.012, 0.008, bevel=0.003), lm, rig.j['knee_' + n],
                       loc=(0, -0.075 - 0.012 * (2 - k) * 0.4, z), rot=(-20, 0, 0))
        if toe:
            g.mesh_obj('toecap_' + n, g.bm_ellipsoid(0.062, 0.05, 0.035, 16, 8), M('toecap_' + toe, toe, rough=0.4,
                                                                                   metal=0.3),
                       rig.j['knee_' + n], loc=(0, -0.085, -0.17))


def sock_rolls(rig, color='#ECE4D2', stripe='#C8463D'):
    sm = make_mat(('rib', color), 'sock')
    st = M('sock_stripe_' + stripe, stripe, rough=0.9)
    for n in ('R', 'L'):
        g.mesh_obj('sock_' + n, g.bm_ring(0.066, 0.022, seg=28, segr=8, rz=1.2), sm, rig.j['knee_' + n],
                   loc=(0, -0.004, -0.055))
        if stripe:
            g.mesh_obj('sockst_' + n, g.bm_ring(0.067, 0.0225, seg=28, segr=8, rz=0.35), st, rig.j['knee_' + n],
                       loc=(0, -0.004, -0.052))


def knee_pads(rig, color='#3B3530', strap='#2A2420'):
    pm = M('kneepad_' + color, color, rough=0.5)
    sm = M('kneestrap_' + strap, strap, rough=0.6)
    for n in ('R', 'L'):
        g.mesh_obj('kneepad_' + n, g.bm_ellipsoid(0.060, 0.032, 0.062, 18, 10), pm, rig.j['knee_' + n],
                   loc=(0, -0.058, -0.012), rot=(8, 0, 0))
        g.mesh_obj('kneestrap_' + n, g.bm_ring(0.066, 0.010, seg=28, segr=6), sm, rig.j['knee_' + n],
                   loc=(0, 0.0, -0.03))


def pants_top(rig, T, desc, z1=0.03, out=0.010, name='waist'):
    """Trouser waist band so a shirt looks tucked in (z from the hem up to z1)."""
    m = make_mat(desc, 'pants')
    prof = T.prof(T.hem_z - 0.004, z1, out, 8)
    bm = g.bm_lathe(prof, seg=56, sy=T.sy, cap_top=False, cap_bottom=True)
    return g.mesh_obj(name, bm, m, rig.j['spine'])


def bib_overalls(rig, T, desc, metal='#C9CED6', bib_top=0.30, waist=0.11, keep=34, pocket=True,
                 straps=True, out=0.012):
    m = make_mat(desc, 'overalls')
    sp = rig.j['spine']
    g.mesh_obj('overall_lower', g.bm_lathe(T.prof(T.hem_z - 0.006, waist, out, 10), seg=64, sy=T.sy,
                                           cap_top=False, cap_bottom=True), m, sp)
    g.mesh_obj('bib', sector_lathe(T.prof(waist - 0.03, bib_top, out + 0.003, 8), keep, sy=T.sy), m, sp)
    # rolled top edge of the bib
    topz = bib_top
    pts = [T.pt(a, topz, out + 0.003) for a in frange(-keep + 1, keep - 1, 9)]
    g.mesh_obj('bib_hem', g.bm_tube_path(pts, 0.008, segr=8), m, sp)
    if pocket:
        g.mesh_obj('bib_pocket', sector_lathe(T.prof(bib_top - 0.11, bib_top - 0.035, out + 0.010, 4), 15, sy=T.sy),
                   make_mat(desc, 'overalls'), sp)
        stitch = M('stitch', '#E8C25A', rough=0.7)
        pts = [T.pt(a, bib_top - 0.035, out + 0.012) for a in frange(-14, 14, 6)]
        g.mesh_obj('pocket_hem', g.bm_tube_path(pts, 0.004, segr=6), stitch, sp)
    if straps:
        for s in (-1, 1):
            strap(sp, shoulder_path(T, s, bib_top - 0.012, keep - 10, out=out + 0.004), 0.045, 0.013, m,
                  name='overall_strap')
            buckle(sp, T, s * (keep - 10), bib_top - 0.008, out + 0.012, metal)
    return m


def suspenders(rig, T, color, clip='#C9CED6', z_front=-0.02, phi=24, out=0.010, width=0.040, name='suspender'):
    m = make_mat(color, name) if isinstance(color, tuple) else M(name + '_' + color, color, rough=0.55)
    sp = rig.j['spine']
    for s in (-1, 1):
        strap(sp, shoulder_path(T, s, z_front, phi, out=out, z_back=-0.02), width, 0.012, m, name=name)
        buckle(sp, T, s * phi, z_front + 0.03, out + 0.008, clip, size=(0.036, 0.012, 0.030), name=name + '_clip')
    return m


def quilted_vest(rig, T, desc, gap=26, z0=None, z1=0.37, out=0.020, step=0.06, amp=0.018, collar=True):
    """Open-front quilted gilet: horizontal puffy channels, no sleeves."""
    m = make_mat(desc, 'vest')
    z0 = T.hem_z + 0.01 if z0 is None else z0
    n = 60
    prof = []
    for k in range(n):
        z = z0 + (z1 - z0) * k / (n - 1)
        t = ((z - z0) / step) % 1.0
        prof.append((T.r(z) + out + amp * math.sin(PI * t) ** 0.7, z))
    # shoulder yoke (no channels) up to the neck
    for z in frange(z1 + 0.02, 0.43, 4):
        prof.append((T.r(z) + out * 0.8, z))
    g.mesh_obj('vest', open_lathe(prof, gap, seg=64, sy=T.sy), m, rig.j['spine'])
    # piping along the opening
    pm = M('vest_pipe', _shade(desc[1] if isinstance(desc, tuple) else desc, 0.7), rough=0.7)
    for s in (-1, 1):
        pts = [T.pt(s * (gap + 1.5), z, out + 0.012) for z in frange(z0, z1 + 0.04, 6)]
        g.mesh_obj('vest_edge', g.bm_tube_path(pts, 0.010, segr=8), pm, rig.j['spine'])
    # armhole rims so the vest reads over the sleeves
    for s in (-1, 1):
        g.mesh_obj('vest_arm', g.bm_ring(0.085, 0.018, seg=28, segr=8), m, rig.j['chest'],
                   loc=(s * 0.175, 0.0, 0.03), rot=(0, 90, 0))
    if collar:
        g.mesh_obj('vest_collar', open_lathe([(0.150, 0.09), (0.14, 0.13), (0.125, 0.16)], gap + 8, seg=48, sy=0.92),
                   m, rig.j['chest'])
    return m


def open_jacket(rig, T, desc, gap=24, z1=0.40, out=0.016, hem_out=0.03, lapel=True, pockets=True):
    """Work jacket worn open (shirt + suspenders show in the gap)."""
    m = make_mat(desc, 'jacket')
    z0 = T.hem_z - 0.02
    prof = [(T.r(z0) + hem_out, z0)] + T.prof(z0 + 0.04, z1, out, 12) + [(T.r(0.43) + out * 0.7, 0.43)]
    g.mesh_obj('jacket', open_lathe(prof, gap, seg=64, sy=T.sy), m, rig.j['spine'])
    sp = rig.j['spine']
    if lapel:
        for s in (-1, 1):
            pts = [T.pt(s * (gap + 4), 0.18, out + 0.010), T.pt(s * (gap + 10), 0.30, out + 0.012),
                   T.pt(s * (gap + 20), 0.40, out + 0.010)]
            g.mesh_obj('lapel', g.bm_tube_path(catmull3(pts, 10), 0.012, segr=8, flat=2.6, side_ref=(0, 0, 1)), m, sp)
    if pockets:
        for s in (-1, 1):
            surf_obj(sp, 'chest_pocket', g.bm_box(0.075, 0.014, 0.065, bevel=0.010), m, T, s * (gap + 22), 0.25,
                     out + 0.010)
            surf_obj(sp, 'pocket_flap', g.bm_box(0.08, 0.016, 0.022, bevel=0.007), m, T, s * (gap + 22), 0.29,
                     out + 0.016)
    return m


def tool_belt(rig, T, color='#5A3A22', z=0.0, pouches=True, hammer=True, battery=True, out=0.022):
    lm = M('toolbelt_' + color, color, rough=0.55)
    sp = rig.j['spine']
    r = T.r(z) + out
    g.mesh_obj('toolbelt', g.bm_ring(r, 0.03, seg=60, segr=10, sy=T.sy, rz=0.85), lm, sp, loc=(0, 0, z))
    surf_obj(sp, 'belt_buckle', g.bm_box(0.06, 0.02, 0.05, bevel=0.008), M('metal_steel', '#B9C2CE', rough=0.3,
                                                                           metal=0.75), T, 0, z, out + 0.018)
    dm = M('pouch_' + color, _shade(color, 0.85), rough=0.6)
    if pouches:
        for s, phi in ((-1, 62), (1, 58)):
            surf_obj(sp, 'pouch', g.bm_box(0.085, 0.05, 0.095, bevel=0.016), dm, T, s * phi, z - 0.05, out + 0.03)
            surf_obj(sp, 'pouch_flap', g.bm_box(0.09, 0.055, 0.03, bevel=0.010), lm, T, s * phi, z - 0.012, out + 0.034)
    if hammer:
        wood = M('wood', cb.WOOD, rough=0.6)
        p = T.pt(98, z - 0.02, out + 0.03)
        g.mesh_obj('belt_hammer', g.bm_lathe([(0.0, 0.0), (0.016, 0.004), (0.016, -0.16), (0.0, -0.165)], seg=10),
                   wood, sp, loc=tuple(p), rot=(0, -8, 0))
        g.mesh_obj('belt_hammer_head', g.bm_box(0.035, 0.11, 0.035, bevel=0.008), M('metal_dark', cb.METAL_D,
                                                                                   rough=0.35, metal=0.6),
                   sp, loc=(p.x, p.y, p.z + 0.02))
    if battery:
        surf_obj(sp, 'battery', g.bm_box(0.12, 0.05, 0.09, bevel=0.012), M('battery', '#2E3238', rough=0.45),
                 T, 180, z - 0.01, out + 0.03)
        surf_obj(sp, 'battery_cap', g.bm_box(0.05, 0.03, 0.02, bevel=0.005), M('battery_cap', '#C8463D', rough=0.4),
                 T, 180, z + 0.045, out + 0.035)


def lamp_cable(rig, T):
    """Cable from the cap lamp, over the helmet and down the back to the battery
    (three dynamic segments: head -> nape -> mid back -> battery)."""
    cm = M('cable', '#22252A', rough=0.5)
    segs = [g.tube_between('lamp_cable', cm, radius=0.010, seg=6) for _ in range(3)]
    head_pt = (0.0, 0.31, HEAD_C + 0.10)
    nape = g.empty('cable_nape', rig.j['chest'], (0.02, 0.17, 0.10))
    mid = g.empty('cable_mid', rig.j['spine'], tuple(T.pt(176, 0.18, 0.022)))
    bat = g.empty('cable_bat', rig.j['spine'], tuple(T.pt(180, 0.03, 0.05)))

    def update(r):
        a = r.world('head', head_pt)
        b = nape.matrix_world.translation.copy()
        c = mid.matrix_world.translation.copy()
        d = bat.matrix_world.translation.copy()
        g.set_tube(segs[0], a, b)
        g.set_tube(segs[1], b, c)
        g.set_tube(segs[2], c, d)
    rig.strings.append(update)


def knife_sheath(rig, T, phi=-72, z=0.03, leather='#6B4A2E', handle='#C98F55', out=0.035):
    sp = rig.j['spine']
    e = g.empty('knife', sp, tuple(T.pt(phi, z, out)))
    e.rotation_mode = 'XYZ'
    e.rotation_euler = (math.radians(-8), math.radians(12 if phi < 0 else -12), math.radians(phi))
    lm = M('sheath_' + leather, leather, rough=0.6)
    g.mesh_obj('sheath', g.bm_slab([(-0.022, 0.0), (0.022, 0.0), (0.016, -0.11), (0.0, -0.135), (-0.016, -0.11)],
                                   0.026, bevel=0.006), lm, e, rot=(0, 0, 90))
    g.mesh_obj('knife_bolster', g.bm_box(0.04, 0.03, 0.014, bevel=0.004), M('brass', '#C9A045', rough=0.35, metal=0.7),
               e, loc=(0, 0, 0.008))
    g.mesh_obj('knife_handle', g.bm_capsule(0.016, 0.06, r_end=0.015), M('knife_handle_' + handle, handle, rough=0.55),
               e, loc=(0, 0, 0.075))
    g.mesh_obj('sheath_loop', g.bm_box(0.05, 0.035, 0.016, bevel=0.004), lm, e, loc=(0, 0, -0.012))


def rope_coil(rig, color='#D9BC85', over='L', z=-0.10, R=0.25, tilt=40.0, strands=4, r=0.019):
    """Coil of rope slung over one shoulder and across the body (bandolier style)."""
    rm = mat_rope('rope', color)
    s = 1 if over == 'L' else -1
    e = g.empty('rope_coil', rig.j['chest'], (0.0, 0.01, z))
    e.rotation_mode = 'XYZ'
    e.rotation_euler = (0.0, math.radians(-s * tilt), 0.0)
    sy = 0.88
    for k in range(strands):
        RR = R + ((k // 2) - 0.5) * r * 1.6
        g.mesh_obj('rope', g.bm_ring(RR, r, seg=72, segr=8, sy=sy, rz=1.0), rm, e,
                   loc=(0, 0, ((k % 2) - 0.5) * r * 1.5))
    # bindings that hold the coil together (front and back)
    wm = mat_rope('rope_bind', '#7A5A3A', scale=140.0)
    for u in (math.radians(-70), math.radians(-110), math.radians(95)):
        p = Vector((R * math.cos(u), R * sy * math.sin(u), 0.004))
        tang = Vector((-math.sin(u), sy * math.cos(u), 0)).normalized()
        q = tang.to_track_quat('Z', 'Y')
        g.mesh_obj('rope_wrap', g.bm_ring(r * 2.3, 0.008, seg=20, segr=6, sx=1.0, sy=1.25), wm, e, loc=tuple(p),
                   rot=q)
    return e


def neckerchief(rig, color, knot_side=0.0, desc=None):
    m = make_mat(desc, 'kerchief') if desc else M('kerchief_' + color, color, rough=0.85)
    g.mesh_obj('kerchief', g.bm_ring(0.128, 0.04, seg=48, segr=10, sy=0.92, rz=0.9), m, rig.j['chest'],
               loc=(0, 0.01, 0.105))
    tri = g.bm_slab([(-0.075, 0.0), (0.075, 0.0), (0.0, -0.10)], 0.018, bevel=0.008)
    g.bm_transform(tri, Matrix.Rotation(PI / 2, 4, 'Z'))
    g.mesh_obj('kerchief_tri', tri, m, rig.j['chest'], loc=(knot_side, -0.145, 0.095), rot=(-14, 0, 0))
    g.mesh_obj('kerchief_knot', g.bm_ellipsoid(0.03, 0.025, 0.025, 10, 8), m, rig.j['chest'],
               loc=(knot_side, -0.150, 0.098))


def turtleneck(rig, desc, R=0.128, r=0.06, dz=0.10):
    m = make_mat(desc, 'collar')
    g.mesh_obj('turtleneck', g.bm_ring(R, r, seg=48, segr=12, sy=0.92, rz=1.15), m, rig.j['chest'], loc=(0, 0.01, dz))


def shirt_collar(rig, desc, spread=0.07, dz=0.115, size=0.07):
    m = make_mat(desc, 'collar')
    for s in (-1, 1):
        tri = g.bm_slab([(0.0, 0.0), (size * 0.9, -size * 0.25), (size * 0.2, -size)], 0.014, bevel=0.005)
        g.bm_transform(tri, Matrix.Rotation(PI / 2, 4, 'Z'))
        g.mesh_obj('collar_pt', tri, m, rig.j['chest'], loc=(s * spread * 0.3, -0.135, dz),
                   rot=(-28, 0, s * 28 + (0 if s > 0 else 180) * 0))
    g.mesh_obj('collar_band', g.bm_ring(0.118, 0.022, seg=40, segr=8, sy=0.92, rz=1.5), m, rig.j['chest'],
               loc=(0, 0.01, dz + 0.01))


def chest_pockets(rig, T, desc, phi=22, z=0.25, out=0.010, button='#3B2A20'):
    m = make_mat(desc, 'pocket')
    sp = rig.j['spine']
    bm_ = M('button_' + button, button, rough=0.4)
    for s in (-1, 1):
        surf_obj(sp, 'pocket', g.bm_box(0.075, 0.012, 0.07, bevel=0.008), m, T, s * phi, z, out)
        surf_obj(sp, 'pocket_flap', g.bm_box(0.08, 0.016, 0.026, bevel=0.007), m, T, s * phi, z + 0.035, out + 0.006)
        surf_obj(sp, 'pocket_btn', g.bm_ellipsoid(0.012, 0.008, 0.012, 8, 6), bm_, T, s * phi, z + 0.028, out + 0.016)


def front_buttons(rig, T, zs, color='#3B2A20', phi=0.0, out=0.006, r=0.015):
    bm_ = M('button_' + color, color, rough=0.4)
    for z in zs:
        surf_obj(rig.j['spine'], 'button', g.bm_ellipsoid(r, 0.009, r, 10, 6), bm_, T, phi, z, out)


def fur_mantle(rig, desc=('fur', '#8E8A86'), r_out=0.06, z0=0.20, collar_r=0.07):
    """Fur capelet over the shoulders + big ruff collar (hunter)."""
    m = make_mat(desc, 'mantle')
    prof = [(0.272, -0.13), (0.268, -0.06), (0.245, 0.01), (0.205, 0.06), (0.15, 0.10)]
    b = g.bm_lathe(prof, seg=56, sy=0.92, smooth_n=10, cap_top=False, cap_bottom=False)
    # ragged hem
    for v in b.verts:
        if v.co.z < -0.10:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += 0.03 * math.sin(a * 11) + 0.015 * math.sin(a * 23 + 1.0)
    g.mesh_obj('mantle', fuzz(b, 0.008, 42.0), m, rig.j['chest'], loc=(0, 0.01, 0.0))
    g.mesh_obj('ruff', g.bm_ring(0.150, collar_r, seg=64, segr=12, sy=0.92, tufts=13, bump=0.45, seed=3.0),
               m, rig.j['chest'], loc=(0, 0.01, 0.10))


def fur_cloak(rig, desc=('fur', '#8E8A86'), keep=118, collar_r=0.066, length=-0.12):
    """Pelt cloak over the shoulders and down the back (open front) + ruff collar."""
    m = make_mat(desc, 'cloak')
    ch = rig.j['chest']
    prof = [(0.300, length - 0.33), (0.292, -0.22), (0.270, -0.10), (0.250, -0.02), (0.222, 0.04),
            (0.180, 0.085), (0.12, 0.115)]
    b = sector_lathe(prof, keep, seg=64, sy=0.90, center_deg=180.0, smooth_n=14)
    for v in b.verts:
        if v.co.z < length - 0.30:
            a = math.atan2(v.co.y, v.co.x)
            v.co.z += 0.025 * math.sin(a * 9) + 0.012 * math.sin(a * 21 + 1.0)
    g.mesh_obj('cloak', fuzz(b, 0.007, 42.0), m, ch, loc=(0, 0.012, 0.0))
    g.mesh_obj('ruff', g.bm_ring(0.150, collar_r, seg=64, segr=12, sy=0.92, tufts=13, bump=0.45, seed=3.0),
               m, ch, loc=(0, 0.01, 0.10))
    for s in (-1, 1):                     # tie cord at the throat
        g.mesh_obj('cloak_tie', g.bm_tube_path([(s * 0.10, -0.12, 0.075), (s * 0.03, -0.155, 0.04)], 0.008, segr=6),
                   M('cloak_tie', '#5A3A22', rough=0.6), ch)


def quiver(rig, T, leather='#6B4A2E', fletch='#E8433A', strap_color='#5A3A22', side=-1):
    """Quiver on the back (top over the character's right shoulder) + chest strap."""
    qm = M('quiver_' + leather, leather, rough=0.65)
    ch = rig.j['chest']
    e = g.empty('quiver', ch, (side * 0.06, 0.29, -0.03))
    e.rotation_mode = 'XYZ'
    e.rotation_euler = (math.radians(-12), math.radians(side * 24), 0.0)
    g.mesh_obj('quiver_body', g.bm_lathe([(0.0, -0.18), (0.050, -0.175), (0.054, 0.12), (0.060, 0.15),
                                          (0.0, 0.151)], seg=18, smooth_n=0), qm, e)
    g.mesh_obj('quiver_band', g.bm_ring(0.058, 0.010, seg=20, segr=6), M('quiver_band', '#C9A045', rough=0.4,
                                                                        metal=0.5), e, loc=(0, 0, 0.12))
    fm = M('fletch_' + fletch, fletch, rough=0.6)
    sm = M('arrow', '#C98F55', rough=0.6)
    for k in range(3):
        x = (k - 1) * 0.022
        g.mesh_obj('q_shaft', g.bm_cyl(0.007, 0.007, 0.08, seg=6), sm, e, loc=(x, (k - 1) * 0.008, 0.15))
        g.mesh_obj('q_fletch', g.bm_slab([(-0.022, 0.0), (0.022, 0.0), (0.013, 0.075), (-0.013, 0.075)], 0.006,
                                         bevel=0.0), fm, e, loc=(x, (k - 1) * 0.008, 0.18), rot=(0, 0, k * 40))
    # strap across the chest: from the right shoulder (quiver top) to the left hip
    stm = M('qstrap_' + strap_color, strap_color, rough=0.6)
    sp = rig.j['spine']
    pts = [T.pt(side * 150, 0.40, 0.014), Vector((side * 0.10, -0.04, 0.452)), T.pt(side * 30, 0.36, 0.016),
           T.pt(-side * 15, 0.20, 0.016), T.pt(-side * 60, 0.06, 0.016), T.pt(-side * 120, 0.05, 0.016),
           T.pt(-side * 170, 0.14, 0.014)]
    strap(sp, pts, 0.036, 0.012, stm, name='quiver_strap', n=36)


def fringe_hem(rig, T, desc, z=None, r=0.018, out=0.0):
    m = make_mat(desc, 'fringe')
    z = T.hem_z if z is None else z
    g.mesh_obj('fringe', g.bm_ring(T.r(z) + out, r, seg=90, segr=8, sy=T.sy, rz=1.6, tufts=34, bump=0.6, seed=8.0),
               m, rig.j['spine'], loc=(0, 0, z + 0.006))


def sash(rig, T, desc=('check', '#B8302A', '#E8C25A', '#2E4A7A', 30.0, 0.22), z=0.04, out=0.012, phi=62):
    """Woven voyageur sash (ceinture flechee) round the waist, knotted on the hip
    with two fringed tails."""
    m = make_mat(desc, 'sash')
    sp = rig.j['spine']
    g.mesh_obj('sash', g.bm_ring(T.r(z) + out, 0.034, seg=60, segr=10, sy=T.sy, rz=1.25), m, sp, loc=(0, 0, z))
    surf_obj(sp, 'sash_knot', g.bm_ellipsoid(0.04, 0.03, 0.035, 12, 8), m, T, phi, z, out + 0.025)
    for k, (dphi, ln, tilt) in enumerate(((-6, 0.17, 8), (6, 0.14, -6))):
        p0 = T.pt(phi + dphi, z - 0.02, out + 0.03)
        pts = [p0, p0 + Vector((0.004, -0.005, -ln * 0.5)), p0 + Vector((0.012 * (1 - 2 * k), -0.01, -ln))]
        g.mesh_obj('sash_tail', g.bm_tube_path(catmull3(pts, 8), 0.010, segr=8, flat=2.4,
                                               side_ref=(math.cos(math.radians(phi)), math.sin(math.radians(phi)), 0)),
                   m, sp)
        end = pts[-1]
        for f in range(3):
            g.mesh_obj('sash_fringe', g.bm_tube_path([end + Vector(((f - 1) * 0.008, 0, 0)),
                                                      end + Vector(((f - 1) * 0.010, 0, -0.035))], 0.004, segr=5),
                       M('sash_fringe', '#B8302A', rough=0.9), sp)


def lacing(rig, T, color='#5A3A22', z0=0.14, z1=0.33, n=4, out=0.008):
    lm = M('lace_' + color, color, rough=0.6)
    sp = rig.j['spine']
    zs = frange(z0, z1, n + 1)
    for a, b in zip(zs, zs[1:]):
        for s in (-1, 1):
            g.mesh_obj('lace', g.bm_tube_path([T.pt(s * 9, a, out), T.pt(-s * 9, b, out)], 0.006, segr=6), lm, sp)
    g.mesh_obj('lace_slit', sector_lathe(T.prof(z0 - 0.01, z1 + 0.02, out - 0.004, 4), 2.5, sy=T.sy),
               M('slit', '#4A3020', rough=0.8), sp)


def mukluks(rig, leather='#8A5E3C', fur='#E8DCC8', snowshoes=True, frame='#8A5A33', web='#D9B98A'):
    lm = M('mukluk_' + leather, leather, rough=0.75)
    fm = mat_fur('mukluk_fur', fur)
    for n in ('R', 'L'):
        k = rig.j['knee_' + n]
        g.mesh_obj('mukluk_' + n, g.bm_lathe([(0.072, -0.15), (0.076, -0.04), (0.078, 0.015), (0.0, 0.016)],
                                             seg=24, smooth_n=0, cap_top=False), lm, k)
        g.mesh_obj('mukluk_fur_' + n, g.bm_ring(0.078, 0.032, seg=32, segr=10, tufts=8, bump=0.4, seed=5.0),
                   fm, k, loc=(0, 0, 0.012))
        g.mesh_obj('mukluk_wrap_' + n, g.bm_ring(0.078, 0.008, seg=28, segr=6, rz=1.0),
                   M('mukluk_wrap', '#C8463D', rough=0.6), k, loc=(0, 0, -0.07))
        if snowshoes:
            fmat = M('snowshoe_frame', frame, rough=0.55)
            wm = mat_check('snowshoe_web', web, _shade(web, 0.78), _shade(web, 0.6), scale=45.0, duty=0.3)
            e = g.empty('snowshoe_' + n, k, (0, -0.02, -0.196))
            ring = g.bm_ring(0.115, 0.012, seg=48, segr=8, sx=0.78, sy=1.35)
            g.mesh_obj('snowshoe', ring, fmat, e, loc=(0, 0.015, 0))
            pad = g.bm_lathe([(0.0, -0.003), (0.105, -0.003), (0.105, 0.003), (0.0, 0.003)], seg=40, sx=0.78,
                             sy=1.35)
            g.mesh_obj('snowshoe_web', pad, wm, e, loc=(0, 0.015, 0))


def apron_sleeves(rig, desc):
    """토시: protective arm covers over the forearms (Korean farm wear)."""
    m = make_mat(desc, 'toshi')
    for n in ('R', 'L'):
        g.mesh_obj('toshi_' + n, g.bm_lathe([(0.076, -FOREARM + 0.01), (0.082, -0.06), (0.08, 0.0), (0.072, 0.012)],
                                            seg=24, smooth_n=6, cap_top=False, cap_bottom=False), m,
                   rig.j['el_' + n])
        for z in (-FOREARM + 0.012, 0.008):
            g.mesh_obj('toshi_band_' + n, g.bm_ring(0.072, 0.010, seg=24, segr=6), m, rig.j['el_' + n], loc=(0, 0, z))


# =========================================================================== the five professions

def _rib_of(desc):
    return ('rib', desc[1]) if isinstance(desc, tuple) else ('rib', desc)


def _look(spec, defaults):
    L = dict(defaults)
    L.update(spec.get('look', {}))
    return L


FISHERMAN = dict(
    hair='#8A4A28', beard='trim', beard_color='#A85A30', stache=True, brows='#7A4022',
    cap=('knit', '#B8372F'), cap_front=0.58, cap_back=0.24, pom=None, hat='watch',
    collar=True,
    overalls=('oil', '#2F4B5C'), metal='#C9CED6', boots='#2B2F35', boot_band='#D9A13A',
    rope='#D9BC85', rope_coil=True, knife=True, belt='#5A3A22', lashes=False, pipe=False, ponytail=None,
)


def dress_fisherman(rig, spec):
    L = _look(spec, FISHERMAN)
    T = Torso(spec)
    hair = L['hair']
    if L.get('ponytail'):
        short_hair(rig, hair, fringe=0.26, back_low=-0.30, sweep=0.12, nape=False)
        ponytail(rig, hair, tie=L['ponytail'])
    else:
        short_hair(rig, hair, fringe=0.30, back_low=-0.42, sweep=0.04)
    if L.get('beard'):
        beard(rig, L['beard_color'], L['beard'])
    if L.get('stache'):
        moustache(rig, L['beard_color'], size=(0.050, 0.026, 0.026), spread=0.10, el=-0.27, tilt=14,
                  fuzzy=L.get('beard') in ('chin', 'full'))
    if L.get('brows'):
        brows(rig, L['brows'], bushy=L.get('bushy', False))
    if L.get('lashes'):
        lashes(rig)
    if L['hat'] == 'watch':
        watch_cap(rig, L['cap'], front=L['cap_front'], back=L['cap_back'], pom=L.get('pom'), puff=0.10,
                  base=1.10, cuff=0.040)
    if L.get('collar'):
        turtleneck(rig, _rib_of(spec['coat_desc']))
    sleeve_cuffs(rig, _rib_of(spec['coat_desc']))
    glove_cuffs(rig, spec.get('mitten', '#E8783A'), r=0.07, h=0.04)
    om = bib_overalls(rig, T, L['overalls'], metal=L['metal'])
    if L.get('belt'):
        cb.belt(rig, L['belt'], z=0.08, r=T.r(0.08) + 0.018, buckle='#B9C2CE', width=0.55)
    if L.get('knife'):
        knife_sheath(rig, T, phi=-74, z=0.06)
    tall_boots(rig, spec['boots'], band=L.get('boot_band'), sole='#3A2E28')
    if L.get('rope_coil'):
        rope_coil(rig, L['rope'])
    if L.get('pipe'):
        pipe(rig)
    cb.make_rod(rig)
    return om


LUMBERJACK = dict(
    hair='#6B3E22', beard='full', beard_color='#6B3E22', brows='#5A321C', hat='beanie',
    cap=('knit', '#3F5A48', None, False), cap_front=0.52, cap_back=-0.14, pom=None,
    shirt_collar=True, suspenders='#A8743F', clip='#C9CED6', pants=('rough', '#34507A', 0.9),
    socks='#ECE4D2', sock_stripe='#C8463D', laces='#E8DCC0', pockets=True, braid=None, lashes=False,
    stache=True,
)


def dress_lumberjack(rig, spec):
    L = _look(spec, LUMBERJACK)
    T = Torso(spec)
    hair = L['hair']
    short_hair(rig, hair, fringe=0.28, back_low=-0.40, sweep=0.05)
    if L.get('braid'):
        braid(rig, hair, tie=L['braid'], pts=[(0.20, 0.10, HEAD_C - 0.18), (0.25, -0.02, HEAD_C - 0.32),
                                             (0.22, -0.10, HEAD_C - 0.45), (0.18, -0.14, HEAD_C - 0.56)], n=7,
              r0=0.058)
    if L.get('beard'):
        beard(rig, L['beard_color'], L['beard'])
    if L.get('stache'):
        moustache(rig, L['beard_color'], size=(0.055, 0.03, 0.03), spread=0.11, el=-0.29, tilt=18, fuzzy=True)
    if L.get('brows'):
        brows(rig, L['brows'], spread=0.37, el=0.12, bushy=L.get('bushy', True))
    if L.get('lashes'):
        lashes(rig)
    if L['hat'] == 'beanie':
        watch_cap(rig, L['cap'], front=L['cap_front'], back=L['cap_back'], puff=0.20, base=1.12, cuff=0.044,
                  pom=L.get('pom'), lumps=0.015)
    elif L['hat'] == 'earflap':
        earflap_cap(rig, L.get('cap_desc', ('check', '#C8402F', '#7A2420', '#2A1414', 9.0)))
    if L.get('shirt_collar'):
        shirt_collar(rig, spec['coat_desc'])
    if L.get('pockets'):
        chest_pockets(rig, T, spec['coat_desc'], phi=24, z=0.24)
    front_buttons(rig, T, (0.06, 0.15, 0.34), color='#2A2020', phi=0.0, out=0.004)
    pants_top(rig, T, L['pants'], z1=0.035)
    if L.get('belt'):
        cb.belt(rig, '#3B2A20', z=0.02, r=T.r(0.02) + 0.016, buckle='#B9C2CE', width=0.5)
    suspenders(rig, T, L['suspenders'], clip=L['clip'], z_front=0.0, phi=24, out=0.013)
    glove_cuffs(rig, _shade(spec.get('mitten', '#C99A5E'), 0.86), r=0.070, h=0.045)
    sleeve_cuffs(rig, spec['coat_desc'], r=0.072)
    boot_soles(rig, '#2A2220', h=0.028)
    boot_laces(rig, L['laces'])
    if L.get('socks'):
        sock_rolls(rig, L['socks'], L.get('sock_stripe'))
    cb.make_axe(rig, length=0.62, big=1.35)


FARMER = dict(
    hair='#A0582E', braids='#C8463D', hat='straw', straw='#E8C25A', band='#C8463D',
    vest=('rough', '#D9A23A', 0.9), overalls=('rough', '#3F5E8C', 0.88), kerchief='#C8463D',
    wellies='#3E6B3A', glove='#D9C29A', lashes=True, brows=None, beard=None, stache=False,
    momppe=None, toshi=None, kerchief_desc=None,
)


def dress_farmer(rig, spec):
    L = _look(spec, FARMER)
    T = Torso(spec)
    hair = L['hair']
    if L.get('braids'):
        cb.hair_shell(rig, hair, fringe=0.24, wave=0.07, waves=11.0, sweep=-0.10)
        hm = M('hair', hair, rough=0.42)
        tie = M('tie_' + L['braids'], L['braids'], rough=0.6)
        for s in (-1, 1):
            pts = [(s * 0.26, 0.10, 0.02), (s * 0.29, 0.08, -0.10), (s * 0.27, 0.06, -0.22), (s * 0.24, 0.05, -0.32)]
            for k, p in enumerate(pts):
                rr = 0.050 - 0.006 * k
                cb.head_obj(rig, 'braid', g.bm_ellipsoid(rr, rr * 0.9, rr * 1.15, 14, 8), hm, loc=p)
            cb.head_obj(rig, 'braid_tie', g.bm_ring(0.025, 0.012, seg=16, segr=6), tie, loc=(s * 0.235, 0.05, -0.375))
            cb.head_obj(rig, 'braid_end', g.bm_ellipsoid(0.030, 0.028, 0.045, 10, 6), hm, loc=(s * 0.235, 0.05, -0.42))
    elif L.get('hair_style') == 'bald':
        def side_hair(x, y, z):
            band = (1 - smoothstep(0.05, 0.25, z)) * smoothstep(-0.75, -0.45, z) * smoothstep(-0.35, 0.05, y)
            return 0.92 + (1.11 - 0.92) * band
        cb.shell(rig, M('hair', hair, rough=0.75), side_hair, 'side_hair')
    else:
        short_hair(rig, hair, fringe=0.30, back_low=-0.42, sweep=0.05)
    if L.get('beard'):
        beard(rig, L.get('beard_color', hair), L['beard'])
    if L.get('stache'):
        moustache(rig, L.get('beard_color', hair), size=(0.058, 0.03, 0.03), spread=0.11, el=-0.28, tilt=22,
                  fuzzy=True)
    if L.get('brows'):
        brows(rig, L['brows'], bushy=L.get('bushy', False))
    if L.get('lashes'):
        lashes(rig)
    if L['hat'] == 'straw':
        straw_hat(rig, L['straw'], L['band'])
    elif L['hat'] == 'felt':
        felt_hat(rig, L.get('felt', '#6B4A35'), L.get('band', '#3B2A20'))
    elif L['hat'] == 'scarf':
        headscarf(rig, L.get('scarf_desc', ('dots', '#E86A8E', ['#FFFFFF', '#F7C6D6'], 30.0)))
    shirt_collar(rig, L.get('collar_desc', spec['coat_desc']))
    if L.get('momppe'):
        pants_top(rig, T, L['momppe'], z1=0.05)
    else:
        bib_overalls(rig, T, L['overalls'], metal='#C9A045', bib_top=0.29, keep=30)
    quilted_vest(rig, T, L['vest'], gap=28 if not L.get('momppe') else 14,
                 z0=0.0 if L.get('momppe') else None)
    if L.get('kerchief'):
        neckerchief(rig, L['kerchief'], desc=L.get('kerchief_desc'))
    if L.get('toshi'):
        apron_sleeves(rig, L['toshi'])
    glove_cuffs(rig, _shade(spec.get('mitten', L['glove']), 0.85), r=0.070, h=0.04)
    tall_boots(rig, spec['boots'], band=L.get('boot_band'), sole='#2A2A26', top=0.0)
    cb.make_sickle(rig)


MINER = dict(
    hair='#3A2A22', stache='#3A2A22', brows='#2E221C', hat_color='#F5B82E', goggles=None,
    jacket=('stain', '#8A6E4A', '#3A3028', 3.5, 0.55), shirt_buttons=True,
    suspenders='#B8402F', belt='#5A3A22', kneepad='#3B3530', soot=True, beard=None, lashes=False,
    hair_style='short', walrus=False, scarf=None,
)


def dress_miner(rig, spec):
    L = _look(spec, MINER)
    T = Torso(spec)
    hair = L['hair']
    if L.get('hair_style') == 'bob':
        cb.hair_shell(rig, hair, fringe=0.22, wave=0.05, waves=12.0, sweep=0.0, back_low=-0.62, side_low=-0.30)
        hm = M('hair', hair, rough=0.42)
        for s in (-1, 1):
            cb.head_obj(rig, 'bob_side', g.bm_ellipsoid(0.07, 0.15, 0.14, 16, 10), hm, loc=(s * 0.28, 0.05, -0.12),
                        rot=(0, s * 10, 0))
    else:
        short_hair(rig, hair, fringe=0.24, back_low=-0.45, sweep=0.0)
    if L.get('stache'):
        if L.get('walrus'):
            moustache(rig, L['stache'], size=(0.075, 0.036, 0.042), spread=0.12, el=-0.28, tilt=28, fuzzy=True)
        else:
            moustache(rig, L['stache'], size=(0.060, 0.032, 0.034), spread=0.12, el=-0.25, tilt=22)
    if L.get('beard'):
        beard(rig, L.get('beard_color', hair), L['beard'])
    if L.get('brows'):
        brows(rig, L['brows'], bushy=L.get('bushy', False))
    if L.get('lashes'):
        lashes(rig)
    hard_hat(rig, L['hat_color'], goggles=L.get('goggles'))
    if L.get('soot'):
        if L.get('soot_spots'):
            soot_smudges(rig, spots=L['soot_spots'])
        else:
            soot_smudges(rig)
    # henley shirt placket + buttons visible in the open jacket
    if L.get('shirt_buttons'):
        surf_obj(rig.j['spine'], 'placket', g.bm_box(0.036, 0.010, 0.13, bevel=0.004),
                 make_mat(spec['coat_desc'], 'shirt'), T, 0, 0.36, 0.002)
        front_buttons(rig, T, (0.32, 0.38), color='#E8E2D6', out=0.010, r=0.012)
    if L.get('suspenders'):
        suspenders(rig, T, L['suspenders'], clip='#C9CED6', z_front=0.02, phi=13, out=0.008, width=0.034)
    if L.get('scarf'):
        neckerchief(rig, L['scarf'])
    if L.get('jacket'):
        open_jacket(rig, T, L['jacket'], gap=24)
        sleeve_cuffs(rig, L['jacket'], r=0.074)
    else:
        sleeve_cuffs(rig, spec['coat_desc'], r=0.074)
    if L.get('coverall'):
        # one-piece boiler suit: zip placket, collar, chest pocket with a pencil
        sp = rig.j['spine']
        surf_obj(sp, 'zip', g.bm_box(0.022, 0.010, 0.44, bevel=0.004), M('zip', '#B9C2CE', rough=0.3, metal=0.7),
                 T, 0, 0.18, 0.004)
        shirt_collar(rig, spec['coat_desc'], dz=0.11, size=0.075)
        surf_obj(sp, 'cov_pocket', g.bm_box(0.08, 0.014, 0.075, bevel=0.01), make_mat(spec['coat_desc'], 'coverall'),
                 T, 24, 0.24, 0.012)
        surf_obj(sp, 'pencil', g.bm_box(0.012, 0.012, 0.06, bevel=0.003), M('pencil', '#F2C14E', rough=0.5),
                 T, 20, 0.29, 0.016)
    tool_belt(rig, T, L['belt'], z=0.0)
    lamp_cable(rig, T)
    knee_pads(rig, L['kneepad'])
    boot_soles(rig, '#1E1C1A', h=0.03)
    boot_laces(rig, '#8A7A60', toe='#8E96A3')
    glove_cuffs(rig, _shade(spec.get('mitten', '#B07A45'), 0.85), r=0.068, h=0.035)
    cb.make_pickaxe(rig)


HUNTER = dict(
    hair='#4A3020', beard='stubble', beard_color='#4A3020', brows='#3A2418', hat='trapper',
    crown='#5A3A24', hat_fur='#C49A6C', mantle=('fur', '#8E8A86', '#C8C2BA'), fringe='#A9784A',
    lace='#5A3A22', quiver='#6B4A2E', fletch='#E8433A', qstrap='#4A3020', mukluk='#7A5236', mukluk_fur='#E8DCC8',
    snowshoes=True, lashes=False, braid=None, stache=False, belt='#4A3020',
    sash=('check', '#B8302A', '#E8C25A', '#2E4A7A', 30.0, 0.22),
)


def dress_hunter(rig, spec):
    L = _look(spec, HUNTER)
    T = Torso(spec)
    hair = L['hair']
    short_hair(rig, hair, fringe=0.22, back_low=-0.45, sweep=0.10)
    if L.get('braid'):
        braid(rig, hair, tie=L['braid'], pts=[(0.0, 0.26, HEAD_C - 0.12), (0.0, 0.31, HEAD_C - 0.26),
                                             (0.0, 0.30, HEAD_C - 0.40), (0.0, 0.27, HEAD_C - 0.54)], n=7, r0=0.06)
    if L.get('beard'):
        beard(rig, L['beard_color'], L['beard'])
    if L.get('stache'):
        moustache(rig, L['beard_color'], size=(0.05, 0.026, 0.026), spread=0.10, el=-0.27, tilt=14)
    if L.get('brows'):
        brows(rig, L['brows'])
    if L.get('lashes'):
        lashes(rig)
    if L['hat'] == 'trapper':
        trapper_hat(rig, L['crown'], L['hat_fur'])
    elif L['hat'] == 'wolf':
        wolf_hood(rig)
    elif L['hat'] == 'fox':
        fox_hat(rig)
    lacing(rig, T, L['lace'])
    fringe_hem(rig, T, L['fringe'])
    if L.get('sash'):
        sash(rig, T, L['sash'], z=0.05)
    else:
        cb.belt(rig, L['belt'], z=0.05, r=T.r(0.05) + 0.012, buckle='#C9A045', width=0.55)
    surf_obj(rig.j['spine'], 'pouch', g.bm_box(0.08, 0.05, 0.08, bevel=0.016),
             M('pouch_h', '#5A3A22', rough=0.6), T, 55, 0.0, 0.035)
    fur_cloak(rig, L['mantle'])
    quiver(rig, T, L['quiver'], L['fletch'], L['qstrap'])
    glove_cuffs(rig, L['mukluk_fur'], r=0.074, h=0.03)
    mukluks(rig, L['mukluk'], L['mukluk_fur'], snowshoes=L['snowshoes'])
    cb.make_bow(rig)


DRESSERS = {'fisherman': dress_fisherman, 'lumberjack': dress_lumberjack, 'farmer': dress_farmer,
            'miner': dress_miner, 'hunter': dress_hunter}


def dress_worker(rig, spec):
    return DRESSERS[spec['profession']](rig, spec)


def coat_materials(spec):
    """Material objects for build_human from the spec's *_desc entries."""
    out = {}
    if spec.get('coat_desc') is not None:
        out['coat_mat'] = make_mat(spec['coat_desc'], 'coat')
    if spec.get('sleeve_desc') is not None:
        out['sleeve_mat'] = make_mat(spec['sleeve_desc'], 'sleeve')
    if spec.get('pants_desc') is not None:
        out['pants_mat'] = make_mat(spec['pants_desc'], 'pants')
    if spec.get('mitt_desc') is not None:
        out['mitt_mat'] = make_mat(spec['mitt_desc'], 'mitt')
    if spec.get('boots_desc') is not None:
        out['boots_mat'] = make_mat(spec['boots_desc'], 'boots')
    return out
