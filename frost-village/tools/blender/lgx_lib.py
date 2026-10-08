"""
lgx_lib.py - modelling helpers for the v8 logistics set (docs/CONTRACT_V8.md section AA): the logistics centre with
its cutaway layers, warehouse racks, conveyor, pallets / crates / boxes, toy furniture and retro appliances (shared by
the items, the two producers, the centre's interior and the moving truck).

Everything goes through the SAME camera / light / PPU / palette as the village and the town: bl_common, prop_lib,
prop_assets, bld_assets, town_lib and life2_lib are imported READ-ONLY and never modified.

Conventions (as bld_assets / town_lib)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left); the +X side
    (screen down-right) is the other face the camera sees.
  * Cutaway groups: every object of the logistics centre carries a custom property 'lgx' = its group name
    (see tag() / Group).  lgx_render.apply_pass() turns a group visible / ghost (invisible to the camera but casting
    shadows + bouncing light) / holdout / hidden per render pass, so all layers share one frame + anchor and
    composite back exactly.

Not run directly - see lgx_render.py.
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector, Matrix, Euler

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import town_lib as T
import life2_lib as L2

# ---------------------------------------------------------------------------------------------- palette
RACK_BLUE = '#3D7CC9'          # pallet-rack uprights (toy blue)
RACK_ORANGE = '#E8823A'        # pallet-rack beams (classic orange)
DECK_WOOD = '#D9A766'
CONCRETE = '#C7CBD2'           # warehouse floor (light cool grey, characters read on it)
CONCRETE_D = '#B4B9C2'
LINE_YEL = '#F2C230'
LINE_WHITE = '#F4F1EA'
INK = '#2B2F3A'
KRAFT = '#C99A62'              # cardboard
KRAFT_D = '#B4844F'
TAPE = '#E9D7AE'
STEEL = '#B3BECB'
STEEL_D = '#6B7380'
RUBBER = '#2E323C'
CUT = '#F3E9D8'                # cutaway section caps (cream)
CUT_EDGE = '#7A5A44'


# ---------------------------------------------------------------------------------------------- tagging

def tag(objs, group):
    """Tag objects (and all their descendants) with a cutaway group name."""
    for o in objs:
        o['lgx'] = group
        for ch in o.children_recursive:
            ch['lgx'] = group
    return objs


class Group:
    """with Group('interior'): ... -> every object created inside is tagged 'interior' (children included)."""

    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.c = L.Collect().__enter__()
        return self

    def __exit__(self, *a):
        self.c.__exit__(*a)
        self.objs = self.c.objs
        tag(self.objs, self.name)
        return False


def place(fn, loc=(0, 0, 0), rot_z=0.0, scale=1.0, name='pl'):
    """Run a sub-model builder fn() (built around the origin) and move / turn / scale the result as one group."""
    with L.Collect() as c:
        fn()
    g = L.group(BA.top_level(c.objs), name, loc=loc, rot=(0, 0, rot_z))
    if scale != 1.0:
        g.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return g


# ---------------------------------------------------------------------------------------------- materials

_M = {}


def _cached(key, fn):
    if key not in _M or _M[key].name not in bpy.data.materials:
        _M[key] = fn()
    return _M[key]


def hazard(c1=LINE_YEL, c2=INK, count=6.0, angle=45.0, axis=('X', 'Z'), rough=0.6):
    """Diagonal hazard stripes in the object-local plane spanned by `axis` (count stripes per metre)."""
    def mk():
        nb = L.NB('hazard_%s_%s' % (C(c1).lstrip('#'), ''.join(axis)), rough=rough)
        tc = nb.n('ShaderNodeTexCoord')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(tc.outputs['Object'], sep.inputs[0])
        a = math.radians(angle)
        u = nb.math('MULTIPLY', sep.outputs[axis[0]], math.cos(a))
        v = nb.math('MULTIPLY', sep.outputs[axis[1]], math.sin(a))
        t = nb.math('MULTIPLY', nb.math('ADD', u, v), count)
        t = nb.math('FRACT', t)
        fac = nb.map_range(t, 0.47, 0.53)
        nb.base(nb.mix_rgb(fac, C(c1), C(c2)))
        return nb.m
    return _cached(('hazard', c1, c2, count, angle, axis), mk)


def corrugated(col, count=9.0, axis='X', depth=0.16, rough=0.55, metal=0.15):
    """Painted corrugated sheet: soft light / dark ridges along `axis` (count ridges per metre)."""
    def mk():
        nb = L.NB('corr_%s_%s' % (C(col).lstrip('#'), axis), rough=rough, metal=metal)
        tc = nb.n('ShaderNodeTexCoord')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(tc.outputs['Object'], sep.inputs[0])
        v = nb.math('MULTIPLY', sep.outputs[axis], count * math.tau)
        s = nb.math('SINE', v)
        fac = nb.map_range(s, -1.0, 1.0)
        nb.base(nb.mix_rgb(fac, hexmix(col, '#000000', depth), C(col)))
        return nb.m
    return _cached(('corr', col, count, axis, depth), mk)


def concrete(col=CONCRETE, dark=CONCRETE_D, scale=1.6):
    def mk():
        nb = L.NB('concrete_' + C(col).lstrip('#'), rough=0.62)
        f = nb.noise(scale, 3.0)
        f2 = nb.noise(scale * 7.0, 2.0)
        f = nb.math('ADD', nb.math('MULTIPLY', f, 0.7), nb.math('MULTIPLY', f2, 0.3))
        f = nb.map_range(f, 0.38, 0.62)
        nb.base(nb.mix_rgb(f, C(dark), C(col)))
        return nb.m
    return _cached(('concrete', col, dark, scale), mk)


def kraft(col=KRAFT):
    return tonal(col, 0.1, 6.0, rough=0.85)


def paint(col, rough=0.45, metal=0.0):
    return flat(col, rough, metal)


# ---------------------------------------------------------------------------------------------- tiny parts

def decal_box(name, x0, x1, y0, y1, mat, z=0.0, t=0.012):
    """Flat floor marking (thin box) covering [x0, x1] x [y0, y1] at height z."""
    return box(name, (x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z), mat=mat, bevel=0.0)


def floor_line(name, p, q, w, mat, z=0.0, t=0.012):
    p, q = Vector((p[0], p[1], 0)), Vector((q[0], q[1], 0))
    d = q - p
    ang = math.degrees(math.atan2(d.y, d.x))
    c = (p + q) / 2
    return box(name, (d.length, w, t), (c.x, c.y, z), rot=(0, 0, ang), mat=mat, bevel=0.0)


def dashed(name, p, q, w, mat, dash=0.5, gap=0.35, z=0.0):
    p, q = Vector(p), Vector(q)
    ln = (q - p).length
    d = (q - p).normalized()
    out, s, k = [], 0.0, 0
    while s < ln - 0.05:
        e = min(ln, s + dash)
        out.append(floor_line('%s%d' % (name, k), p + d * s, p + d * e, w, mat, z))
        s = e + gap
        k += 1
    return out


def arrow_decal(name, c, along=(1, 0), size=0.6, mat=None, z=0.0):
    """Painted floor arrow (shaft + head) pointing along `along`."""
    mat = mat or flat(LINE_WHITE, 0.7)
    a = math.degrees(math.atan2(along[1], along[0]))
    pts = [(-0.5, -0.12), (0.1, -0.12), (0.1, -0.3), (0.5, 0.0), (0.1, 0.3), (0.1, 0.12), (-0.5, 0.12)]
    pts = [(x * size, y * size) for x, y in pts]
    o = extrude(name, pts, 0.012, top=mat, side=mat, bevel=0.0)
    o.location = (c[0], c[1], z)
    o.rotation_euler = (0, 0, math.radians(a))
    return o


def bolt_row(mb, p, q, n, r, mat):
    p, q = Vector(p), Vector(q)
    for k in range(n):
        c = p + (q - p) * ((k + 0.5) / n)
        mb.sphere(r, mat, loc=tuple(c), segs=8, rings=5)


def wall_clock(name, loc, face='y-', r=0.32, rim='#3D7CC9'):
    """Big round wall clock in a face frame (wall plane y = 0, outward -y)."""
    objs = [cyl(name + '_rim', r + 0.05, 0.08, (0, -0.04, 0), rot=(90, 0, 0), mat=flat(rim, 0.4), segs=36,
                origin='center', bevel=0.02),
            cyl(name + '_face', r, 0.03, (0, -0.09, 0), rot=(90, 0, 0), mat=flat('#FBF6EA', 0.5), segs=36,
                origin='center', bevel=0.005)]
    mb = L2.MB()
    km = flat(INK, 0.5)
    for k in range(12):
        a = math.tau * k / 12
        mb.cube((0.025, 0.02, 0.07 if k % 3 == 0 else 0.04), km,
                loc=(math.sin(a) * r * 0.82, -0.11, math.cos(a) * r * 0.82), rot=(0, math.degrees(a), 0))
    mb.cube((0.03, 0.02, r * 0.55), km, loc=(r * 0.18, -0.12, r * 0.18), rot=(0, 45, 0))
    mb.cube((0.04, 0.02, r * 0.4), km, loc=(-r * 0.15, -0.125, 0.08), rot=(0, -60, 0))
    mb.sphere(0.035, flat('#D9483B', 0.4), loc=(0, -0.13, 0))
    objs.append(mb.done(name + '_ticks'))
    return T.face_group(objs, face, loc, name)


def pin_board(name, loc, face='y-', w=1.3, h=0.85, seed=0):
    """Cork notice board with colourful pinned papers (face frame, loc = bottom-centre on the wall)."""
    rnd = L.rng(seed)
    objs = [box(name + '_fr', (w + 0.1, 0.06, h + 0.1), (0, -0.03, -0.05), mat=flat('#8A5A33', 0.7), bevel=0.02),
            box(name + '_cork', (w, 0.05, h), (0, -0.06, 0.0), mat=tonal('#C9925A', 0.12, 14.0, rough=0.9),
                bevel=0.0)]
    mb = L2.MB()
    cols = ['#FBF6EA', '#F7E27A', '#9FD3F0', '#F6B6C8', '#BFE3A6', '#FBF6EA']
    for k in range(7):
        pw, ph = rnd.uniform(0.2, 0.32), rnd.uniform(0.18, 0.3)
        x = -w / 2 + 0.18 + (w - 0.36) * (k % 4) / 3.0 + rnd.uniform(-0.05, 0.05)
        z = 0.12 + (h - 0.3) * (k // 4) + rnd.uniform(0.0, 0.12)
        m = flat(cols[k % len(cols)], 0.8)
        mb.cube((pw, 0.012, ph), m, loc=(x, -0.095, z + ph / 2), rot=(0, rnd.uniform(-8, 8), 0))
        mb.sphere(0.02, flat(['#D9483B', '#3D7CC9', '#5CC86A'][k % 3], 0.3), loc=(x, -0.11, z + ph - 0.03))
        for j in range(3):
            mb.cube((pw * 0.7, 0.004, 0.012), flat('#8C94A0', 0.8), loc=(x, -0.103, z + ph * (0.25 + 0.18 * j)))
    objs.append(mb.done(name + '_notes'))
    return T.face_group(objs, face, loc, name)


def extinguisher(name, loc, face='y-'):
    objs = [cyl(name + '_b', 0.08, 0.38, (0, -0.1, 0.0), mat=flat('#D9483B', 0.35), segs=16, bevel=0.04),
            cyl(name + '_t', 0.035, 0.08, (0, -0.1, 0.38), mat=flat(INK, 0.4), segs=10, bevel=0.01),
            box(name + '_h', (0.14, 0.03, 0.03), (0.04, -0.1, 0.45), mat=flat(INK, 0.4), bevel=0.01),
            box(name + '_lab', (0.1, 0.01, 0.12), (0, -0.18, 0.14), mat=flat('#FBF6EA', 0.6), bevel=0.0),
            box(name + '_bk', (0.2, 0.03, 0.06), (0, -0.015, 0.22), mat=flat(STEEL_D, 0.4, 0.5), bevel=0.01)]
    return T.face_group(objs, face, loc, name)


def wall_lamp(name, loc, face='y-', strength=3.0):
    """Caged industrial wall lamp (warm)."""
    gm = T.glow_mat(name + '_g', 2.2)
    objs = [box(name + '_plate', (0.16, 0.04, 0.2), (0, -0.02, -0.1), mat=flat(INK, 0.5), bevel=0.01),
            box(name + '_arm', (0.05, 0.22, 0.05), (0, -0.13, 0.0), mat=flat(INK, 0.5), bevel=0.01),
            sphere(name + '_bulb', 0.1, (0, -0.28, -0.08), gm, scale=(1, 1, 1.15), segs=16, rings=10),
            cyl(name + '_shade', 0.17, 0.08, (0, -0.28, 0.02), mat=flat('#3D7CC9', 0.4), segs=20, r_top=0.08,
                bevel=0.01)]
    mb = L2.MB()
    for k in range(4):
        a = math.tau * k / 4 + 0.4
        mb.seg((math.cos(a) * 0.1, -0.28 + math.sin(a) * 0.1, 0.0), (math.cos(a) * 0.08, -0.28 + math.sin(a) * 0.08,
                                                                       -0.2), 0.008, flat(INK, 0.5))
    objs.append(mb.done(name + '_cage'))
    return T.face_group(objs, face, loc, name)


def safety_sign(name, loc, face='y-', col='#3FA55B', icon='plus', s=0.34):
    """Small square safety sign (first aid / exit / caution) - icon only, no text."""
    objs = [box(name + '_b', (s, 0.03, s), (0, -0.015, -s / 2), mat=flat(col, 0.5), bevel=0.012)]
    wm = flat('#FBF6EA', 0.5)
    if icon == 'plus':
        objs += [box(name + '_p1', (s * 0.56, 0.02, s * 0.18), (0, -0.035, -s / 2 - s * 0.09), mat=wm, bevel=0.0),
                 box(name + '_p2', (s * 0.18, 0.02, s * 0.56), (0, -0.035, -s / 2 - s * 0.28), mat=wm, bevel=0.0)]
    elif icon == 'tri':
        t = extrude(name + '_t', [(-s * 0.32, 0), (s * 0.32, 0), (0, s * 0.55)], 0.02, rot=(90, 0, 0), top=wm,
                    side=wm, bevel=0.0)
        t.location = (0, -0.03, -s * 0.82)
        objs.append(t)
        objs.append(box(name + '_ex', (s * 0.07, 0.02, s * 0.22), (0, -0.045, -s * 0.66), mat=flat(INK, 0.5),
                        bevel=0.0))
    return T.face_group(objs, face, loc, name)


# ---------------------------------------------------------------------------------------------- goods models
# All goods are modelled around the origin standing on z = 0, front = -Y (they are re-used as items, on racks of
# the producers, in the moving truck and on the conveyor).

def cardboard_box(name, sx, sy, sz, loc=(0, 0, 0), rot_z=0.0, tape=True, label=True, col=KRAFT, seed=0):
    """Kraft cardboard box with a tape strip over the lid seam and a little printed 'this way up' arrows label."""
    objs = [box(name, (sx, sy, sz), (0, 0, 0), mat=kraft(col), bevel=min(0.025, sz * 0.12), segs=2)]
    if tape:
        tm = flat(TAPE, 0.35)
        objs.append(box(name + '_tp', (sx + 0.006, 0.1 * min(1.0, sy / 0.4) + 0.02, 0.012), (0, 0, sz - 0.004), mat=tm,
                        bevel=0.0))
        objs.append(box(name + '_tpf', (0.012, 0.1 * min(1.0, sy / 0.4) + 0.02, sz * 0.32),
                        (-sx / 2 - 0.002, 0, sz * 0.68), mat=tm, bevel=0.0))
        objs.append(box(name + '_tpr', (0.012, 0.1 * min(1.0, sy / 0.4) + 0.02, sz * 0.32),
                        (sx / 2 + 0.002, 0, sz * 0.68), mat=tm, bevel=0.0))
        objs.append(box(name + '_seam', (sx * 0.98, 0.006, 0.006), (0, -sy * 0.25, sz - 0.002),
                        mat=flat(KRAFT_D, 0.8), bevel=0.0))
    if label:
        lm = flat('#FBF6EA', 0.7)
        lw = min(sx, sz) * 0.36
        objs.append(box(name + '_lab', (lw, 0.006, lw * 0.75), (sx * 0.18, -sy / 2 - 0.003, sz * 0.32), mat=lm,
                        bevel=0.0))
        am = flat('#D9483B', 0.6)
        for k in (-1, 1):
            objs.append(extrude(name + '_ar', [(-0.25, 0), (0.25, 0), (0.25, 0.5), (0.5, 0.5), (0, 1.0), (-0.5, 0.5),
                                               (-0.25, 0.5)], 0.004, rot=(90, 0, 0), top=am, side=am, bevel=0.0))
            o = objs[-1]
            o.scale = (lw * 0.18, lw * 0.36, 1)
            o.location = (sx * 0.18 + k * lw * 0.17, -sy / 2 - 0.007, sz * 0.32 - lw * 0.17)
    g = L.group(BA.top_level(objs), name + '_g', loc=loc, rot=(0, 0, rot_z))
    return g


def crate_open(name, sx, sy, sz, loc=(0, 0, 0), rot_z=0.0, col='#C98F55', dark='#9A6A3C'):
    """Open slatted wooden crate (top open) - contents are placed on top by the caller at z = sz - 0.05."""
    wm = tonal(col, 0.1, 5.0, rough=0.78)
    dm = flat(dark, 0.8)
    objs = [box(name + '_bot', (sx - 0.04, sy - 0.04, sz * 0.75), (0, 0, 0.02), mat=flat(hexmix(col, '#000000', 0.35),
                                                                                         0.9), bevel=0.01)]
    n = 3
    for k in range(n):
        z = 0.03 + (sz - 0.06) * k / (n - 1) - 0.0
        h = sz / (n + 0.6)
        zz = min(z, sz - h)
        for sgn in (-1, 1):
            objs.append(box(name + '_sy', (sx, 0.03, h), (0, sgn * (sy / 2 - 0.015), zz), mat=wm, bevel=0.008))
            objs.append(box(name + '_sx', (0.03, sy, h), (sgn * (sx / 2 - 0.015), 0, zz), mat=wm, bevel=0.008))
    for sx_ in (-1, 1):
        for sy_ in (-1, 1):
            objs.append(box(name + '_post', (0.05, 0.05, sz), (sx_ * (sx / 2 - 0.02), sy_ * (sy / 2 - 0.02), 0),
                            mat=dm, bevel=0.008))
    return L.group(BA.top_level(objs), name + '_g', loc=loc, rot=(0, 0, rot_z))


def pallet(name, sx=0.78, sy=0.78, h=0.12, loc=(0, 0, 0), rot_z=0.0, col='#D2A266'):
    """Wooden EUR-style pallet: top deck boards, three runner blocks."""
    wm = tonal(col, 0.1, 6.0, rough=0.8)
    dm = flat(hexmix(col, '#000000', 0.28), 0.85)
    mb = L2.MB()
    nb = 5
    for k in range(nb):
        x = -sx / 2 + sx * (k + 0.5) / nb
        mb.cube((sx / nb - 0.035, sy, 0.025), wm, loc=(x, 0, h - 0.0125))
    for y in (-sy / 2 + 0.06, 0, sy / 2 - 0.06):
        mb.cube((sx, 0.1, 0.025), wm, loc=(0, y, h - 0.04))
        for x in (-sx / 2 + 0.07, 0, sx / 2 - 0.07):
            mb.cube((0.12, 0.1, h - 0.05), dm, loc=(x, y, (h - 0.05) / 2))
    for x in (-sx / 2 + 0.06, sx / 2 - 0.06):
        mb.cube((0.1, sy, 0.022), wm, loc=(x, 0, 0.011))
    o = mb.done(name, smooth=False)
    return L.group([o], name + '_g', loc=loc, rot=(0, 0, rot_z))


def plank_stack(name, sx, sy, layers, loc=(0, 0, 0), col='#D39A5E', strap=True):
    mb = L2.MB()
    rnd = L.rng(len(name))
    cols = [tonal(hexmix(col, '#FFFFFF', rnd.uniform(-0.05, 0.1)), 0.1, 5.0, rough=0.8) for _ in range(3)]
    n = max(2, int(sx / 0.17))
    for j in range(layers):
        for k in range(n):
            x = -sx / 2 + sx * (k + 0.5) / n
            mb.cube((sx / n - 0.012, sy + rnd.uniform(-0.03, 0.03), 0.065), cols[(j + k) % 3],
                    loc=(x, rnd.uniform(-0.015, 0.015), 0.035 + j * 0.072))
    objs = [mb.done(name + '_pl', smooth=False)]
    if strap:
        sm = flat('#3D7CC9', 0.5)
        hgt = layers * 0.072 + 0.006
        for y in (-sy * 0.3, sy * 0.3):
            objs.append(box(name + '_st', (sx + 0.012, 0.035, 0.012), (0, y, hgt), mat=sm, bevel=0.0))
            for s in (-1, 1):
                objs.append(box(name + '_sts', (0.012, 0.035, hgt), (s * (sx / 2 + 0.006), y, 0.0), mat=sm, bevel=0.0))
    return L.group(BA.top_level(objs), name + '_g', loc=loc)


def ingot_stack(name, nx, ny, layers, loc=(0, 0, 0), scale=0.62):
    objs = []
    for j in range(layers):
        for a in range(nx):
            for b in range(ny):
                if j % 2 == 0:
                    p = ((a - (nx - 1) / 2) * 0.24 * scale / 0.62, (b - (ny - 1) / 2) * 0.42 * scale / 0.62,
                         j * 0.115 * scale / 0.62)
                    r = (0, 0, 0)
                else:
                    p = ((b - (ny - 1) / 2) * 0.42 * scale / 0.62 * (nx / ny), (a - (nx - 1) / 2) * 0.24 * scale /
                         0.62 * (ny / nx), j * 0.115 * scale / 0.62)
                    r = (0, 0, 90)
                objs.append(PA.ingot_model('ing', loc=p, rot=r, scale=scale))
    return L.group(BA.top_level(objs), name + '_g', loc=loc)


# ---------------------------------------------------------------------------------------------- furniture

def chair_model(name='chair', s=1.0, col='#C98F55', cushion='#D9483B'):
    wm = tonal(col, 0.08, 5.0, rough=0.6)
    objs = []
    for x in (-0.17, 0.17):
        for y in (-0.16, 0.16):
            objs.append(box(name + '_leg', (0.05, 0.05, 0.42), (x * s, y * s, 0), mat=wm, bevel=0.012))
    objs.append(box(name + '_seat', (0.44 * s, 0.42 * s, 0.06 * s), (0, 0, 0.42 * s), mat=wm, bevel=0.02))
    objs.append(box(name + '_cush', (0.38 * s, 0.36 * s, 0.06 * s), (0, -0.01, 0.48 * s), mat=flat(cushion, 0.75),
                    bevel=0.025))
    for x in (-0.17, 0.17):
        objs.append(box(name + '_bp', (0.05, 0.05, 0.5), (x * s, 0.18 * s, 0.42 * s), mat=wm, bevel=0.012))
    objs.append(box(name + '_br', (0.42 * s, 0.05, 0.16 * s), (0, 0.18 * s, 0.76 * s), mat=wm, bevel=0.02))
    objs.append(box(name + '_br2', (0.36 * s, 0.04, 0.05 * s), (0, 0.18 * s, 0.6 * s), mat=wm, bevel=0.012))
    return objs


def table_model(name='table', w=0.82, d=0.56, h=0.5, col='#C98F55', cloth=None):
    wm = tonal(col, 0.08, 5.0, rough=0.55)
    objs = [box(name + '_top', (w, d, 0.06), (0, 0, h - 0.06), mat=wm, bevel=0.025)]
    for x in (-w / 2 + 0.07, w / 2 - 0.07):
        for y in (-d / 2 + 0.07, d / 2 - 0.07):
            objs.append(cyl(name + '_leg', 0.035, h - 0.06, (x, y, 0), mat=wm, r_top=0.028, segs=12, bevel=0.01))
    objs.append(box(name + '_apr', (w - 0.12, d - 0.12, 0.07), (0, 0, h - 0.13), mat=wm, bevel=0.012))
    if cloth:
        objs.append(box(name + '_cl', (w * 0.5, d + 0.02, 0.012), (0, 0, h), mat=flat(cloth, 0.8), bevel=0.0))
    return objs


def sofa_model(name='sofa', w=0.96, d=0.46, col='#3FA58C', wood='#8A5A33'):
    """Chubby two-seat sofa with rolled arms, two cushions, a little throw pillow and wooden feet."""
    fm = tonal(col, 0.07, 6.0, rough=0.85)
    fd = flat(hexmix(col, '#000000', 0.12), 0.85)
    objs = [box(name + '_base', (w, d, 0.2), (0, 0, 0.07), mat=fm, bevel=0.06, segs=4),
            box(name + '_back', (w, 0.15, 0.32), (0, d / 2 - 0.075, 0.2), mat=fm, bevel=0.07, segs=4)]
    for s in (-1, 1):
        objs.append(box(name + '_arm', (0.15, d, 0.2), (s * (w / 2 - 0.075), 0, 0.22), mat=fm, bevel=0.07, segs=4))
        objs.append(cyl(name + '_roll', 0.09, d, (s * (w / 2 - 0.075), 0, 0.42), rot=(90, 0, 0), mat=fm, segs=18,
                        origin='center', bevel=0.03))
    for s in (-1, 1):
        objs.append(box(name + '_cu', (w / 2 - 0.15, d - 0.17, 0.11), (s * (w / 4 - 0.035), -0.06, 0.26), mat=fd,
                        bevel=0.05, segs=4))
        objs.append(box(name + '_bc', (w / 2 - 0.16, 0.12, 0.22), (s * (w / 4 - 0.035), d / 2 - 0.17, 0.3), mat=fd,
                        bevel=0.05, segs=4, rot=(-12, 0, 0)))
    objs.append(box(name + '_pil', (0.17, 0.08, 0.17), (w / 2 - 0.26, d / 2 - 0.22, 0.36), rot=(-15, 0, 18),
                    mat=flat('#F2C230', 0.8), bevel=0.05, segs=3))
    wm = flat(wood, 0.6)
    for x in (-w / 2 + 0.07, w / 2 - 0.07):
        for y in (-d / 2 + 0.07, d / 2 - 0.07):
            objs.append(cyl(name + '_ft', 0.03, 0.07, (x, y, 0), mat=wm, r_top=0.022, segs=10, bevel=0.008))
    return objs


def bed_model(name='bed', w=0.98, d=0.56, col='#C98F55', quilt='#7FB3E0', pillow='#FBF6EA'):
    """Cosy wooden bed seen from the side: long axis along X, headboard at -X, patchwork quilt."""
    wm = tonal(col, 0.08, 5.0, rough=0.6)
    objs = [box(name + '_frame', (w, d, 0.14), (0, 0, 0.06), mat=wm, bevel=0.025),
            box(name + '_mat', (w - 0.1, d - 0.06, 0.1), (0.02, 0, 0.2), mat=flat('#F4EEE2', 0.85), bevel=0.04)]
    nb = L.NB(name + '_quilt', rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    chk = nb.n('ShaderNodeTexChecker')
    chk.inputs['Scale'].default_value = 3.2
    chk.inputs['Color1'].default_value = nb.rgb(quilt)
    chk.inputs['Color2'].default_value = nb.rgb(hexmix(quilt, '#FFFFFF', 0.35))
    nb.link(tc.outputs['Object'], chk.inputs['Vector'])
    nb.base(chk.outputs['Color'])
    objs.append(box(name + '_quilt', (w * 0.68, d + 0.02, 0.07), (w * 0.14, 0, 0.27), mat=nb.m, bevel=0.035, segs=3))
    objs.append(box(name + '_pil', (0.2, d * 0.72, 0.09), (-w / 2 + 0.2, 0, 0.29), mat=flat(pillow, 0.85),
                    bevel=0.04, segs=3))
    objs.append(box(name + '_head', (0.07, d + 0.04, 0.5), (-w / 2 + 0.035, 0, 0.0), mat=wm, bevel=0.03))
    objs.append(cyl(name + '_headr', 0.06, d + 0.06, (-w / 2 + 0.035, 0, 0.5), rot=(90, 0, 0), mat=wm, segs=16,
                    origin='center', bevel=0.02))
    objs.append(box(name + '_foot', (0.06, d + 0.04, 0.32), (w / 2 - 0.03, 0, 0.0), mat=wm, bevel=0.025))
    for y in (-d / 2 + 0.05, d / 2 - 0.05):
        objs.append(box(name + '_lg', (0.06, 0.06, 0.08), (-w / 2 + 0.06, y, 0), mat=wm, bevel=0.01))
    # little heart on the headboard
    hm = flat('#E8524A', 0.5)
    h = extrude(name + '_hrt', [(x * 0.09, y * 0.09) for x, y in T.heart_pts(1.0, 24)], 0.02, rot=(90, 0, 90),
                top=hm, side=hm, bevel=0.004)
    h.location = (-w / 2 - 0.004, 0, 0.33)
    h.rotation_euler = (math.radians(90), 0, math.radians(-90))
    objs.append(h)
    return objs


def wardrobe_model(name='wardrobe', w=0.56, d=0.34, h=0.95, col='#B9783F'):
    wm = tonal(col, 0.07, 5.0, rough=0.55)
    dm = tonal(hexmix(col, '#FFFFFF', 0.12), 0.06, 5.0, rough=0.5)
    objs = [box(name + '_body', (w, d, h), (0, 0, 0.06), mat=wm, bevel=0.03),
            box(name + '_crown', (w + 0.06, d + 0.05, 0.06), (0, 0, h + 0.06), mat=wm, bevel=0.02),
            box(name + '_plinth', (w + 0.03, d + 0.02, 0.06), (0, 0, 0.0), mat=flat(hexmix(col, '#000000', 0.25),
                                                                                    0.6), bevel=0.015)]
    for s in (-1, 1):
        objs.append(box(name + '_door', (w / 2 - 0.04, 0.03, h - 0.14), (s * (w / 4 - 0.005), -d / 2 - 0.005, 0.12),
                        mat=dm, bevel=0.015))
        objs.append(box(name + '_pan', (w / 2 - 0.14, 0.012, h - 0.36), (s * (w / 4 - 0.005), -d / 2 - 0.022, 0.2),
                        mat=wm, bevel=0.008))
        objs.append(sphere(name + '_knob', 0.022, (s * 0.035, -d / 2 - 0.035, 0.12 + (h - 0.14) * 0.5),
                           flat('#F2C14E', 0.3, 0.8), segs=10, rings=6))
    objs.append(box(name + '_drawer', (w - 0.08, 0.03, 0.0), (0, -d / 2, 0.08), mat=dm, bevel=0.0))
    return objs


# ---------------------------------------------------------------------------------------------- appliances

def fridge_model(name='fridge', w=0.46, d=0.4, h=0.86, col='#9FD8C8'):
    """Retro rounded fridge: two doors, chrome lever handles, little badge, vent at the bottom."""
    pm = flat(col, 0.28)
    objs = [L.box(name + '_body', (w, d, h), (0, 0, 0.04), mat=pm, bevel=0.1, segs=5)]
    sm = flat('#E3EEF0', 0.25)
    objs.append(box(name + '_split', (w - 0.06, 0.012, 0.012), (0, -d / 2 - 0.004, 0.04 + h * 0.66), mat=flat(
        hexmix(col, '#000000', 0.25), 0.4), bevel=0.0))
    ch = flat('#D9DFE6', 0.2, 0.9)
    objs.append(box(name + '_h1', (0.035, 0.05, 0.15), (w / 2 - 0.08, -d / 2 - 0.02, 0.04 + h * 0.7), mat=ch,
                    bevel=0.012))
    objs.append(box(name + '_h2', (0.035, 0.05, 0.22), (w / 2 - 0.08, -d / 2 - 0.02, 0.04 + h * 0.3), mat=ch,
                    bevel=0.012))
    objs.append(box(name + '_vent', (w * 0.6, 0.012, 0.06), (0, -d / 2 - 0.002, 0.08), mat=flat('#5A606B', 0.5),
                    bevel=0.0))
    objs.append(cyl(name + '_badge', 0.035, 0.012, (-w / 2 + 0.12, -d / 2 - 0.005, 0.04 + h * 0.85), rot=(90, 0, 0),
                    mat=flat('#D9483B', 0.4), segs=14, origin='center', bevel=0.0))
    for x in (-w / 2 + 0.08, w / 2 - 0.08):
        objs.append(cyl(name + '_ft', 0.03, 0.05, (x, 0, 0), mat=flat('#5A606B', 0.5), segs=10, bevel=0.01))
    del sm
    return objs


def stove_model(name='stove', s=1.0):
    """Cute cast-iron pot-belly stove (난로) with a short pipe, a red-hot window and a kettle on top."""
    im = flat('#3B3F48', 0.45, 0.35)
    objs = [revolve_belly(name + '_belly', im, s)]
    for k in range(3):
        a = math.tau * k / 3 + 0.5
        objs.append(box(name + '_leg', (0.06 * s, 0.06 * s, 0.14 * s), (math.cos(a) * 0.16 * s, math.sin(a) * 0.16 * s,
                                                                      0), mat=im, bevel=0.015))
    objs.append(cyl(name + '_pipe', 0.06 * s, 0.32 * s, (0.04 * s, 0.06 * s, 0.6 * s), mat=im, segs=14, bevel=0.01))
    objs.append(cyl(name + '_cap', 0.08 * s, 0.03 * s, (0.04 * s, 0.06 * s, 0.92 * s), mat=im, segs=14, bevel=0.01))
    gm = L.emissive(name + '_fire', '#FF8A2A', '#FF8A2A', 2.2)
    objs.append(box(name + '_win', (0.14 * s, 0.03, 0.09 * s), (0, -0.2 * s, 0.3 * s), mat=gm, bevel=0.02))
    objs.append(box(name + '_door', (0.2 * s, 0.025, 0.14 * s), (0, -0.19 * s, 0.27 * s), mat=flat('#2B2F3A', 0.4,
                                                                                                    0.4), bevel=0.02))
    objs.append(box(name + '_win2', (0.14 * s, 0.03, 0.09 * s), (0, -0.21 * s, 0.295 * s), mat=gm, bevel=0.02))
    km = flat('#D9483B', 0.3)
    objs.append(sphere(name + '_ket', 0.09 * s, (-0.06 * s, -0.04 * s, 0.6 * s), km, scale=(1, 1, 0.75), segs=18,
                       rings=10))
    objs.append(cyl(name + '_spout', 0.018 * s, 0.1 * s, (-0.15 * s, -0.04 * s, 0.6 * s), rot=(0, -55, 0), mat=km,
                    segs=8, bevel=0.0))
    mb = L2.MB()
    T.ring_seg(mb, (-0.06 * s, -0.04 * s, 0.66 * s), 0.07 * s, 0.01 * s, flat(INK, 0.4), axis='y', a0=0.2,
               a1=math.pi - 0.2, n=8)
    objs.append(mb.done(name + '_kh'))
    return objs


def revolve_profile(name, prof, mat, segs=28, loc=(0, 0, 0)):
    """Lathe a list of (radius, z) points (bottom to top) around Z; closed at both ends."""
    def p(j, k):
        a = math.tau * j / segs
        r, z = prof[k]
        return (r * math.cos(a), r * math.sin(a), z)
    return L.revolve(name, p, segs, len(prof), mat=mat, loc=loc, top=(0, 0, prof[-1][1]), bottom=(0, 0, prof[0][1]))


def revolve_belly(name, mat, s=1.0):
    prof = [(0.17, 0.12), (0.21, 0.17), (0.24, 0.3), (0.225, 0.44), (0.17, 0.53), (0.1, 0.57), (0.07, 0.6)]
    prof = [(r * s, z * s) for r, z in prof]
    return revolve_profile(name, prof, mat)


def washer_model(name='washer', w=0.48, d=0.44, h=0.56, col='#F4F1EA'):
    """Front-loading washing machine: round porthole with blue water, dial, detergent drawer."""
    pm = flat(col, 0.3)
    objs = [L.box(name + '_body', (w, d, h), (0, 0, 0.02), mat=pm, bevel=0.06, segs=4)]
    objs.append(box(name + '_panel', (w - 0.04, 0.02, 0.1), (0, -d / 2 - 0.004, h - 0.09), mat=flat('#DCE3EA', 0.35),
                    bevel=0.01))
    objs.append(cyl(name + '_dial', 0.035, 0.03, (w * 0.28, -d / 2 - 0.02, h - 0.04), rot=(90, 0, 0),
                    mat=flat('#3D7CC9', 0.4), segs=14, origin='center', bevel=0.008))
    objs.append(box(name + '_drw', (0.12, 0.02, 0.05), (-w * 0.25, -d / 2 - 0.012, h - 0.065), mat=flat('#C9D3DD',
                                                                                                       0.4),
                    bevel=0.008))
    cz = 0.02 + h * 0.42
    objs.append(cyl(name + '_ring', 0.16, 0.04, (0, -d / 2 - 0.01, cz), rot=(90, 0, 0), mat=flat('#B3BECB', 0.2, 0.8),
                    segs=32, origin='center', bevel=0.012))
    wm = L.NB(name + '_water', rough=0.15)
    wm.p.inputs['Base Color'].default_value = wm.rgb('#5FB2E6')
    wm.p.inputs['Emission Color'].default_value = wm.rgb('#8FD0F5', raw=True)
    wm.p.inputs['Emission Strength'].default_value = 0.25
    objs.append(cyl(name + '_glass', 0.125, 0.03, (0, -d / 2 - 0.022, cz), rot=(90, 0, 0), mat=wm.m, segs=28,
                    origin='center', bevel=0.01))
    objs.append(sphere(name + '_bub', 0.03, (0.04, -d / 2 - 0.04, cz + 0.04), flat('#E8F6FF', 0.2), segs=10, rings=6))
    objs.append(sphere(name + '_bub2', 0.02, (-0.03, -d / 2 - 0.04, cz + 0.07), flat('#E8F6FF', 0.2), segs=10,
                       rings=6))
    return objs


def radio_model(name='radio', w=0.5, d=0.24, h=0.32, col='#B9783F'):
    """Retro wooden table radio: arched top, cream speaker grille, gold dial window, two knobs."""
    wm = tonal(col, 0.07, 6.0, rough=0.45)
    pts = PA.arch_pts(w, h, 14)
    o = extrude(name + '_body', pts, d, rot=(90, 0, 0), top=wm, side=wm, bevel=0.03)
    o.location = (0, d / 2, 0)
    objs = [o]
    gm = L.stripes('#F3E6CC', '#D8C7A6', 30.0, 'Z', rough=0.8, soft=0.08)
    g = extrude(name + '_grille', PA.arch_pts(w * 0.42, h * 0.62, 10), 0.012, rot=(90, 0, 0), top=gm, side=gm,
                bevel=0.0)
    g.location = (-w * 0.2, -d / 2 - 0.002, h * 0.16)
    objs.append(g)
    objs.append(box(name + '_dial', (w * 0.3, 0.012, h * 0.18), (w * 0.2, -d / 2 - 0.004, h * 0.5),
                    mat=L.emissive(name + '_dg', '#F2C14E', '#FFD45A', 0.5), bevel=0.006))
    objs.append(box(name + '_needle', (0.008, 0.006, h * 0.14), (w * 0.18, -d / 2 - 0.012, h * 0.52),
                    mat=flat('#D9483B', 0.4), bevel=0.0))
    for x in (w * 0.12, w * 0.28):
        objs.append(cyl(name + '_knob', 0.035, 0.035, (x, -d / 2 - 0.015, h * 0.24), rot=(90, 0, 0),
                        mat=flat('#F3E6CC', 0.4), segs=14, origin='center', bevel=0.01))
    objs.append(box(name + '_base', (w + 0.02, d + 0.02, 0.03), (0, 0, 0), mat=flat(hexmix(col, '#000000', 0.3), 0.6),
                    bevel=0.01))
    return objs


def tv_model(name='tv', w=0.5, d=0.42, h=0.4, col='#C98F55'):
    """Retro CRT television in a wooden cabinet on little splayed legs, rabbit-ear antenna, bulging screen."""
    wm = tonal(col, 0.07, 6.0, rough=0.45)
    z0 = 0.12
    objs = [L.box(name + '_cab', (w, d, h), (0, 0, z0), mat=wm, bevel=0.06, segs=4)]
    sm = L.NB(name + '_scr', rough=0.12)
    sm.p.inputs['Base Color'].default_value = sm.rgb('#5E7F95')
    sm.p.inputs['Emission Color'].default_value = sm.rgb('#9FD3F0', raw=True)
    sm.p.inputs['Emission Strength'].default_value = 0.35
    objs.append(box(name + '_bezel', (w * 0.68, 0.03, h * 0.72), (-w * 0.1, -d / 2 - 0.005, z0 + h * 0.14),
                    mat=flat('#3B3F48', 0.4), bevel=0.04))
    objs.append(box(name + '_screen', (w * 0.58, 0.03, h * 0.6), (-w * 0.1, -d / 2 - 0.02, z0 + h * 0.2),
                    mat=sm.m, bevel=0.05, segs=4))
    objs.append(box(name + '_glint', (0.04, 0.01, h * 0.25), (-w * 0.27, -d / 2 - 0.038, z0 + h * 0.48),
                    rot=(0, -25, 0), mat=flat('#EEF6FC', 0.2), bevel=0.0))
    for k in range(2):
        objs.append(cyl(name + '_knob', 0.03, 0.03, (w * 0.34, -d / 2 - 0.012, z0 + h * (0.62 - 0.26 * k)),
                        rot=(90, 0, 0), mat=flat('#F3E6CC', 0.4), segs=14, origin='center', bevel=0.008))
    lm = flat('#3B3F48', 0.4, 0.4)
    for x in (-w / 2 + 0.07, w / 2 - 0.07):
        for y in (-d / 2 + 0.07, d / 2 - 0.07):
            objs.append(cyl(name + '_leg', 0.018, z0 + 0.02, (x, y, 0), mat=wm, r_top=0.024, segs=8, bevel=0.0))
    mb = L2.MB()
    top = Vector((0, 0.05, z0 + h))
    mb.seg(top, top + Vector((-0.16, 0.0, 0.22)), 0.008, lm)
    mb.seg(top, top + Vector((0.18, 0.02, 0.2)), 0.008, lm)
    mb.sphere(0.02, lm, loc=tuple(top + Vector((-0.16, 0.0, 0.22))))
    mb.sphere(0.02, lm, loc=tuple(top + Vector((0.18, 0.02, 0.2))))
    mb.sphere(0.045, lm, loc=tuple(top), scale=(1, 1, 0.6))
    objs.append(mb.done(name + '_ant'))
    return objs


def toolbox_model(name='tb', s=1.0):
    """Same look as bld_assets item_toolbox (red metal box)."""
    red = flat('#D9483B', 0.45, 0.15)
    steel = flat('#C3CCD8', 0.3, 0.7)
    objs = [box(name + '_box', (0.62 * s, 0.34 * s, 0.2 * s), (0, 0, 0), mat=red, bevel=0.035 * s),
            box(name + '_lid', (0.64 * s, 0.36 * s, 0.05 * s), (0, 0, 0.2 * s), mat=flat('#C23E33', 0.45, 0.15),
                bevel=0.02 * s)]
    for x in (-0.18, 0.18):
        objs.append(box(name + '_l', (0.07 * s, 0.02, 0.07 * s), (x * s, -0.18 * s, 0.15 * s), mat=steel, bevel=0.01))
    objs.append(cyl(name + '_hd', 0.022 * s, 0.4 * s, (0, 0, 0.36 * s), rot=(0, 90, 0), mat=flat(INK, 0.5), segs=10,
                    origin='center'))
    for x in (-0.18, 0.18):
        objs.append(box(name + '_hp', (0.03 * s, 0.03 * s, 0.1 * s), (x * s, 0, 0.25 * s), mat=steel, bevel=0.005))
    return objs


# ---------------------------------------------------------------------------------------------- food

def apple(mb, loc, r=0.06, col='#D9483B'):
    mb.sphere(r, flat(col, 0.35), loc=loc, scale=(1, 1, 0.9), segs=12, rings=8)
    mb.seg(Vector(loc) + Vector((0, 0, r * 0.7)), Vector(loc) + Vector((0.01, 0, r * 1.25)), 0.008, flat('#6E4428', 0.7))


def cabbage(mb, loc, r=0.09):
    mb.sphere(r, flat('#8CC46A', 0.6), loc=loc, scale=(1, 1, 0.85), segs=14, rings=8)
    mb.sphere(r * 0.75, flat('#B8DC8C', 0.6), loc=tuple(Vector(loc) + Vector((0, 0, r * 0.25))), scale=(1, 1, 0.8),
              segs=12, rings=8)


def carrot(mb, loc, ang=0.0):
    p = Vector(loc)
    d = Vector((math.cos(ang), math.sin(ang), 0.15))
    mb.seg(p, p + d * 0.2, 0.035, flat('#F08A2D', 0.5), r2=0.008, segs=10)
    mb.seg(p - d * 0.01, p - d * 0.07 + Vector((0, 0, 0.04)), 0.02, flat('#5CA84E', 0.6), segs=6)


def bun(mb, loc, s=1.0, rot_z=0.0):
    mb.sphere(0.1 * s, flat('#C9853F', 0.55), loc=loc, rot=(0, 0, rot_z), scale=(1.5, 0.85, 0.65), segs=14, rings=8)
    for k in (-1, 0, 1):
        mb.cube((0.012, 0.06 * s, 0.012), flat('#E9C08A', 0.6),
                loc=tuple(Vector(loc) + Vector((k * 0.05 * s * math.cos(rot_z), k * 0.05 * s * math.sin(rot_z),
                                                0.06 * s))), rot=(0, 0, math.degrees(rot_z) + 25))
