"""
life2_lib.py - shared modelling helpers for the v5 life-event props (docs/CONTRACT_V5.md section P):
roses / flower balls / garlands, satin ribbons and bows, little babies, stepping stones, a blossom tree, a stone
lantern.  Everything is built with prop_lib primitives + materials (albedo-adjusted `flat`, `tonal`, `snowy`), so
the new props share the palette, camera, light and soft toy look of assets/props, life_props and town.

Not run directly - imported by life2_assets.py / life2_stroller.py (which life2_render.py drives).
prop_lib / prop_assets / bld_assets / town_lib / life_assets are imported read-only, never modified.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bmesh  # noqa: E402
import bpy  # noqa: E402,F401   (bpy before mathutils when bpy is a module)
from mathutils import Vector, Matrix  # noqa: E402

import prop_lib as L  # noqa: E402
from prop_lib import flat, tonal, box, cyl, sphere, blob  # noqa: E402
import prop_assets as PA  # noqa: E402

# ---------------------------------------------------------------------------- palette (sits inside the world palette)
ROSE = '#E8749A'        # deep pink rose
PINK = '#F4A6BE'        # pink
BLUSH = '#F9CCD7'       # blush
WHITE = '#FBF7F0'       # warm white petals
PEACH = '#F8C29A'
BUTTER = '#F7DC7A'      # pale yellow
LILAC = '#C9B3E6'
SKY = '#A9CCEB'
LEAF = '#5E9E6A'
LEAF_DARK = '#3E7F55'
RIBBON_PINK = '#F28DB2'
RIBBON_WHITE = '#FDF6EE'
LAVENDER = '#B9A3DC'
GOLD = '#F2C14E'
SKIN = '#F6CFAE'
CHEEK = '#F29A9A'
INK = '#3A2A2A'
WEDDING_COLS = (PINK, BLUSH, WHITE, ROSE, PEACH, WHITE, BLUSH)
GENTLE_COLS = (WHITE, BUTTER, LILAC, BLUSH, WHITE, SKY)


def shade(col, t=0.18, toward='#5A1F3A'):
    return L.hexmix(col, toward, t)


def euler_deg_from_normal(n, spin=0.0):
    """Euler (deg) that turns local +Z onto `n` (then spins about it)."""
    n = Vector(n).normalized()
    q = Vector((0, 0, 1)).rotation_difference(n)
    if spin:
        q = q @ Matrix.Rotation(math.radians(spin), 4, 'Z').to_quaternion()
    e = q.to_euler()
    return tuple(math.degrees(a) for a in e)


def catmull(pts, n=6):
    """Dense smooth polyline through `pts` (Catmull-Rom, endpoints kept)."""
    P = [Vector(p) for p in pts]
    if len(P) < 3:
        return P
    out = []
    ext = [P[0] * 2 - P[1]] + P + [P[-1] * 2 - P[-2]]
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                              (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-1])
    return out


def sag(p, q, depth, n=12):
    """Points of a hanging swag from p to q that sags `depth` metres at the middle (parabola)."""
    p, q = Vector(p), Vector(q)
    return [p.lerp(q, k / n) - Vector((0, 0, depth * 4 * (k / n) * (1 - k / n))) for k in range(n + 1)]


# ---------------------------------------------------------------------------- fast batcher

_TEMPL = {}


def _templ(kind, a, b=0):
    """Unit primitive (verts, faces) cached per kind / resolution (built once with bmesh)."""
    key = (kind, a, b)
    if key not in _TEMPL:
        bm = bmesh.new()
        if kind == 'uv':
            bmesh.ops.create_uvsphere(bm, u_segments=a, v_segments=b, radius=1.0)
        elif kind == 'ico':
            bmesh.ops.create_icosphere(bm, subdivisions=a, radius=1.0)
        bm.verts.index_update()
        _TEMPL[key] = ([tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces])
        bm.free()
    return _TEMPL[key]


class MB:
    """Drop-in for prop_lib.MB (same calls) that stays linear in the number of primitives: prop_lib.MB runs a bmesh
    operator on one growing mesh per primitive (every operator touches the whole mesh -> quadratic, minutes for a
    few hundred flowers on a busy machine).  Here every primitive is a cached unit template transformed in Python
    and the mesh is built once with from_pydata."""

    def __init__(self):
        self.verts, self.faces, self.fmat, self.mats = [], [], [], []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _add(self, verts, faces, M, m):
        base = len(self.verts)
        self.verts.extend(tuple(M @ Vector(v)) for v in verts)
        mi = self._mi(m)
        for f in faces:
            self.faces.append(tuple(base + i for i in f))
            self.fmat.append(mi)

    @staticmethod
    def M(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
        from mathutils import Euler
        R = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
        S = Matrix.Diagonal((*scale, 1.0))
        return Matrix.Translation(Vector(loc)) @ R @ S

    def sphere(self, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=10, rings=6):
        v, f = _templ('uv', segs, rings)
        self._add(v, f, self.M(loc, rot, (scale[0] * r, scale[1] * r, scale[2] * r)), mat)

    def ico(self, r, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), subdiv=1):
        v, f = _templ('ico', subdiv)
        self._add(v, f, self.M(loc, rot, (scale[0] * r, scale[1] * r, scale[2] * r)), mat)

    def _cyl(self, r1, r2, depth, segs, M, m):
        verts, faces = [], []
        for z, r in ((-depth / 2, r1), (depth / 2, r2)):
            for k in range(segs):
                a = math.tau * k / segs
                verts.append((r * math.cos(a), r * math.sin(a), z))
        for k in range(segs):
            k2 = (k + 1) % segs
            faces.append((k, k2, segs + k2, segs + k))
        faces.append(tuple(range(segs - 1, -1, -1)))
        if r2 > 1e-6:
            faces.append(tuple(segs + k for k in range(segs)))
        else:
            verts = verts[:segs] + [(0.0, 0.0, depth / 2)]
            faces = [(k, (k + 1) % segs, segs) for k in range(segs)] + [tuple(range(segs - 1, -1, -1))]
        self._add(verts, faces, M, m)

    def cone(self, r1, r2, depth, mat, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=8):
        self._cyl(r1, r2, depth, segs, self.M(loc, rot, scale), mat)

    def cube(self, size, mat, loc=(0, 0, 0), rot=(0, 0, 0)):
        sx, sy, sz = (size, size, size) if isinstance(size, (int, float)) else size
        v = [(x * 0.5, y * 0.5, z * 0.5) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
        f = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        self._add(v, f, self.M(loc, rot, (sx, sy, sz)), mat)

    def seg(self, p, q, r, mat, segs=6, r2=None):
        p, q = Vector(p), Vector(q)
        d = q - p
        ln = d.length
        if ln < 1e-5:
            return
        rotm = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        M = Matrix.Translation((p + q) / 2) @ rotm
        self._cyl(r, r if r2 is None else r2, ln, segs, M, mat)

    def done(self, name, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True, bevel=0.0):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.verts, [], self.faces)
        for m in self.mats:
            me.materials.append(m)
        if self.fmat:
            me.polygons.foreach_set('material_index', self.fmat)
        me.validate(clean_customdata=False)
        me.update()
        if smooth:
            me.shade_smooth()
        from mathutils import Euler
        ob = bpy.data.objects.new(name, me)
        ob.location = loc
        ob.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
        bpy.context.scene.collection.objects.link(ob)
        return ob


# ---------------------------------------------------------------------------- ribbons + bows

def strip(name, pts, width, mat, normal=(0, -1, 0), thick=0.012, smooth_n=0, taper=None):
    """Flat satin band along a polyline; the band's face looks along `normal` (its width runs across).
    width may be a float or f(u) with u in [0, 1].  taper (0..1) narrows the far end."""
    P = catmull(pts, smooth_n) if smooth_n else [Vector(p) for p in pts]
    n = Vector(normal).normalized()
    bm = bmesh.new()
    left, right = [], []
    N = len(P)
    for i, p in enumerate(P):
        t = (P[min(i + 1, N - 1)] - P[max(i - 1, 0)])
        t = t.normalized() if t.length > 1e-6 else Vector((0, 0, 1))
        side = t.cross(n)
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        u = i / max(1, N - 1)
        w = width(u) if callable(width) else width
        if taper:
            w *= 1.0 - taper * u
        left.append(bm.verts.new(p + side * w / 2))
        right.append(bm.verts.new(p - side * w / 2))
    for i in range(N - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    ob = L.finish(name, bm, [mat], smooth=True)
    sol = ob.modifiers.new('Sol', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 0.0
    return ob


def tail_pts(start, length, out=0.08, wave=0.03, n=6, down=(0, 0, -1), side=(1, 0, 0)):
    """A hanging ribbon tail: falls `length` along `down`, drifts `out` along `side`, gentle wave."""
    s, d, sd = Vector(start), Vector(down).normalized(), Vector(side).normalized()
    return [s + d * (length * k / n) + sd * (out * k / n + wave * math.sin(k * 1.7)) for k in range(n + 1)]


def bow(name, loc, s, mat, rz=0.0, tails=0.3, tail_out=0.06, tilt=0.0, knot_mat=None, tail_w=None):
    """Cute satin bow facing local -Y (two loops along X, a knot, two tails), size s ~ half-span in m.
    rz turns it about Z (rz 90 -> faces +X), tilt leans it back (deg)."""
    km = knot_mat or mat
    objs = []
    for sx in (-1, 1):
        objs.append(sphere(name + '_loop', s * 0.5, (sx * s * 0.52, 0.0, s * 0.06), mat, scale=(1.0, 0.36, 0.62),
                           rot=(0, sx * 18, 0), segs=18, rings=10))
        objs.append(sphere(name + '_in', s * 0.22, (sx * s * 0.42, -s * 0.12, s * 0.04), flat(shade(
            _mat_hex(mat), 0.22), 0.55), scale=(1.2, 0.3, 0.75), rot=(0, sx * 18, 0), segs=12, rings=8))
    objs.append(sphere(name + '_knot', s * 0.2, (0, -s * 0.06, 0), km, scale=(1.0, 0.8, 1.1), segs=14, rings=8))
    if tails:
        tw = tail_w or s * 0.32
        for sx in (-1, 1):
            pts = tail_pts((sx * s * 0.08, -s * 0.02, -s * 0.1), tails, out=sx * tail_out, wave=0.012, n=6,
                           side=(1, 0, 0))
            o = strip(name + '_tail', pts, tw, mat, normal=(0, -1, 0), thick=0.01, smooth_n=3)
            objs.append(o)
            # V-cut end as a darker tip so the tail reads at 1x
            tip = Vector(pts[-1])
            objs.append(sphere(name + '_tip', tw * 0.45, tuple(tip), flat(shade(_mat_hex(mat), 0.12), 0.55),
                               scale=(1.0, 0.3, 0.6), segs=8, rings=6))
    g = L.group(objs, name, loc=loc, rot=(tilt, 0, rz))
    return g


_MAT_HEX = {}


def satin(col, rough=0.35):
    m = flat(col, rough)
    _MAT_HEX[m.name] = col
    return m


def _mat_hex(m):
    return _MAT_HEX.get(m.name, '#F28DB2')


# ---------------------------------------------------------------------------- flowers (batched)

def rose(mb, loc, r, col, normal=(0, 0, 1), spin=0.0, inner=True):
    """Two-tone rose head into a MB batcher: a cupped outer bloom + a darker swirl bud on the open side."""
    n = Vector(normal).normalized()
    rot = euler_deg_from_normal(n, spin)
    mb.sphere(r, flat(col, 0.55), loc=tuple(loc), rot=rot, scale=(1.0, 1.0, 0.72), segs=12, rings=8)
    if inner:
        mb.sphere(r * 0.55, flat(shade(col, 0.2), 0.5), loc=tuple(Vector(loc) + n * r * 0.42), rot=rot,
                  scale=(1.0, 1.0, 0.55), segs=10, rings=6)


def daisy(mb, loc, r, col, centre=GOLD, normal=(0, 0, 1)):
    """Flat 5-petal flower (chrysanthemum / daisy) into a MB batcher."""
    n = Vector(normal).normalized()
    rot = euler_deg_from_normal(n)
    R = Matrix.Rotation(math.radians(0), 3, 'Z')
    q = Vector((0, 0, 1)).rotation_difference(n)
    for k in range(6):
        a = math.tau * k / 6
        off = q @ (R @ Vector((math.cos(a) * r * 0.62, math.sin(a) * r * 0.62, 0.0)))
        mb.sphere(r * 0.46, flat(col, 0.6), loc=tuple(Vector(loc) + off), rot=rot, scale=(1.0, 1.0, 0.42),
                  segs=10, rings=6)
    mb.sphere(r * 0.36, flat(centre, 0.6), loc=tuple(Vector(loc) + n * r * 0.12), rot=rot, scale=(1.0, 1.0, 0.6),
              segs=10, rings=6)


def mum(mb, loc, r, col, normal=(0, 0, 1)):
    """Pom-pom chrysanthemum (국화): a round fluffy head with a lighter dome - the gentle farewell flower."""
    n = Vector(normal).normalized()
    rot = euler_deg_from_normal(n)
    mb.ico(r, flat(shade(col, 0.1, '#8A7F96'), 0.75), loc=tuple(loc), rot=rot, scale=(1.0, 1.0, 0.78), subdiv=2)
    mb.ico(r * 0.72, flat(col, 0.7), loc=tuple(Vector(loc) + n * r * 0.3), rot=rot, scale=(1.0, 1.0, 0.7),
           subdiv=2)


def leaf(mb, loc, r, col, direction, roll=0.0):
    """Small pointed leaf ellipsoid lying along `direction`."""
    d = Vector(direction).normalized()
    q = Vector((1, 0, 0)).rotation_difference(d)
    if roll:
        q = q @ Matrix.Rotation(math.radians(roll), 4, 'X').to_quaternion()
    rot = tuple(math.degrees(a) for a in q.to_euler())
    mb.sphere(r, flat(col, 0.6), loc=tuple(Vector(loc) + d * r * 0.6), rot=rot, scale=(1.0, 0.45, 0.16),
              segs=10, rings=6)


def fib_dirs(n, zmin=-0.2):
    """n roughly even unit directions on the sphere cap z >= zmin (Fibonacci sphere, filtered)."""
    frac = max(0.05, (1.0 - zmin) / 2.0)
    tot = int(math.ceil(n / frac)) + 1
    ga = math.pi * (3 - math.sqrt(5))
    out = []
    for k in range(tot):
        z = 1 - 2 * (k + 0.5) / tot
        if z < zmin:
            continue
        r = math.sqrt(max(0.0, 1 - z * z))
        a = ga * k
        out.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    return out[:n]


def flower_ball(mb, center, R, cols, n=18, seed=0, zmin=-0.25, rr=None, leaves=10, leaf_col=LEAF, kind='rose',
                squash=(1.0, 1.0, 1.0), filler=0):
    """Round arrangement: flower heads over a sphere cap (dense, toy-like) + leaves around its rim.
    filler = tiny white 'baby's breath' dots."""
    rnd = L.rng(seed)
    c = Vector(center)
    sq = Vector(squash)
    rr = rr or R * 0.32
    for i, d in enumerate(fib_dirs(n, zmin)):
        d = Vector((d.x * sq.x, d.y * sq.y, d.z * sq.z))
        p = c + d * R
        col = cols[rnd.randrange(len(cols))]
        s = rr * rnd.uniform(0.85, 1.15)
        if kind == 'rose':
            rose(mb, p, s, col, normal=d, spin=rnd.uniform(0, 360))
        elif kind == 'mum':
            mum(mb, p, s, col, normal=d)
        else:
            daisy(mb, p, s, col, normal=d)
    for k in range(leaves):
        a = math.tau * k / max(1, leaves) + rnd.uniform(-0.2, 0.2)
        d = Vector((math.cos(a) * sq.x, math.sin(a) * sq.y, rnd.uniform(-0.45, 0.05)))
        leaf(mb, c + d.normalized() * R * 0.95, R * 0.42, leaf_col if k % 3 else LEAF_DARK, d, roll=rnd.uniform(0, 60))
    for k in range(filler):
        d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.1, 1))).normalized()
        mb.sphere(R * 0.06, flat(WHITE, 0.6), loc=tuple(c + d * R * 1.12), segs=8, rings=5)


def garland(mb, pts, cols, seed=0, r=0.07, step=0.05, flower_every=3, leaf_col=LEAF, rose_r=None, filler=True):
    """Leafy rope along a (dense) path with roses tucked in - swags over doors, arches, the wreath ring."""
    rnd = L.rng(seed)
    P = [Vector(p) for p in pts]
    dense = [P[0]]
    for a, b in zip(P, P[1:]):
        ln = (b - a).length
        m = max(1, int(ln / step))
        for k in range(1, m + 1):
            dense.append(a.lerp(b, k / m))
    rr = rose_r or r * 0.95
    for i, p in enumerate(dense):
        t = (dense[min(i + 1, len(dense) - 1)] - dense[max(i - 1, 0)])
        t = t.normalized() if t.length > 1e-6 else Vector((1, 0, 0))
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-3:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(t).normalized()
        for k in range(3):
            a = math.tau * k / 3 + i * 0.9
            d = (side * math.cos(a) + up * math.sin(a)).normalized()
            leaf(mb, p + d * r * 0.4, r * 0.85, leaf_col if (i + k) % 3 else LEAF_DARK, (d + t * 0.6), roll=rnd.uniform(0, 90))
        if i % flower_every == 0:
            a = rnd.uniform(0, math.tau)
            d = (side * math.cos(a) * 0.6 + up * (0.5 + 0.5 * abs(math.sin(a)))).normalized()
            rose(mb, p + d * r * 0.55, rr * rnd.uniform(0.85, 1.1), cols[rnd.randrange(len(cols))], normal=d,
                 spin=rnd.uniform(0, 360))
        elif filler and i % flower_every == 1 and rnd.random() < 0.6:
            d = (side * rnd.uniform(-1, 1) + up).normalized()
            mb.sphere(r * 0.22, flat(WHITE, 0.6), loc=tuple(p + d * r * 0.9), segs=8, rings=5)


def flower_mound(mb, center, rx, ry, h, cols, n=24, seed=0, kind='daisy', fr=0.06, leaf_col=LEAF):
    """Low flower bed: a leafy mound with flower heads sprinkled on top (garden borders, base of a stone)."""
    rnd = L.rng(seed)
    c = Vector(center)
    for k in range(max(6, n // 2)):
        a = rnd.uniform(0, math.tau)
        rr = math.sqrt(rnd.random())
        p = c + Vector((math.cos(a) * rx * rr, math.sin(a) * ry * rr, h * (1 - rr * rr) * 0.7))
        leaf(mb, p, fr * 1.6, leaf_col if k % 3 else LEAF_DARK, Vector((math.cos(a), math.sin(a), 0.5)),
             roll=rnd.uniform(0, 90))
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = math.sqrt(rnd.random()) * 0.92
        p = c + Vector((math.cos(a) * rx * rr, math.sin(a) * ry * rr, h * (1 - rr * rr) + fr * 0.4))
        col = cols[rnd.randrange(len(cols))]
        nrm = Vector((math.cos(a) * rr * 0.6, math.sin(a) * rr * 0.6, 1.0))
        s = fr * rnd.uniform(0.85, 1.2)
        if kind == 'rose':
            rose(mb, p, s, col, normal=nrm, spin=rnd.uniform(0, 360))
        elif kind == 'mum':
            mum(mb, p, s, col, normal=nrm)
        else:
            daisy(mb, p, s, col, centre=GOLD if col != BUTTER else '#E9A23C', normal=nrm)


# ---------------------------------------------------------------------------- garden pieces

def stepping_stone(name, loc, rx, ry, rz_deg=0.0, col='#E3D3B8', seed=0, z=0.0):
    return blob(name, 1.0, (loc[0], loc[1], z), tonal(col, 0.08, 6.0, rough=0.9), scale=(rx, ry, 0.035),
                rot=(0, 0, rz_deg), seed=seed, amp=0.08, freq=1.6, subdiv=3, flat_bottom=0.0)


def shrub(name, loc, r, seed=0, col=LEAF_DARK, snow=True):
    m = L.snowy(col, lo=0.74, hi=0.9, noise_amt=0.4)
    x, y, z = loc
    objs = [blob(name, r, (x, y, z + r * 0.7), m, seed=seed, amp=0.18, freq=2.2, subdiv=3, flat_bottom=0.65,
                 scale=(1.0, 1.0, 0.85))]
    if snow:
        objs.append(PA.snow_cap(name + '_sn', r * 0.62, (x - r * 0.12, y + r * 0.1, z + r * 1.38), r * 0.22, seed + 3,
                                scale=(1.0, 0.9, 1.0)))
    return objs


def blossom_tree(name, loc, h=2.2, R=0.75, seed=0, cols=('#F6BFCF', '#F9D6E0', '#FBEAF0'), snow=True):
    """Small winter plum blossom tree (매화): curvy trunk with three arms, a soft cloud of pink blossom blobs,
    blossom dots, a little snow on top.  Gentle and warm, never bare."""
    rnd = L.rng(seed)
    x, y, z = loc
    bark = tonal('#7A5038', 0.15, 5.0, rough=0.9)
    mb = MB()
    trunk = [Vector((x, y, z)), Vector((x + 0.03, y, z + h * 0.25)), Vector((x - 0.04, y + 0.02, z + h * 0.45)),
             Vector((x + 0.02, y - 0.02, z + h * 0.58))]
    for a, b, r1, r2 in zip(trunk, trunk[1:], (0.11, 0.09, 0.075), (0.09, 0.075, 0.06)):
        mb.seg(a, b, r1, bark, segs=10, r2=r2)
    arms = []
    for k, (ax, ay, az) in enumerate(((0.42, 0.1, 0.78), (-0.4, -0.05, 0.74), (0.05, 0.38, 0.86), (0.1, -0.3, 0.8))):
        p0 = trunk[-1]
        p1 = Vector((x + ax * 0.5, y + ay * 0.5, z + h * (az - 0.08)))
        p2 = Vector((x + ax, y + ay, z + h * az))
        mb.seg(p0, p1, 0.055, bark, segs=8, r2=0.045)
        mb.seg(p1, p2, 0.045, bark, segs=8, r2=0.03)
        arms.append(p2)
    mb.cone(0.18, 0.11, 0.1, bark, loc=(x, y, z + 0.05), segs=10)
    mb.done(name + '_wood')
    objs = []
    centres = [(0.0, 0.0, 0.86, 1.0), (0.38, 0.06, 0.8, 0.72), (-0.36, -0.04, 0.78, 0.72), (0.04, 0.34, 0.9, 0.7),
               (0.08, -0.3, 0.84, 0.66), (0.0, 0.02, 1.0, 0.62)]
    blossom = []
    for k, (cx, cy, cz, s) in enumerate(centres):
        c = Vector((x + cx * R, y + cy * R, z + h * cz))
        col = cols[k % len(cols)]
        objs.append(blob(name + '_canopy', R * 0.5 * s, tuple(c), L.snowy(col, snow='#FFFFFF', lo=0.86, hi=0.97,
                                                                           noise_amt=0.35),
                         seed=seed + 7 * k, amp=0.2, freq=2.4, subdiv=3, scale=(1.0, 1.0, 0.82)))
        blossom.append((c, R * 0.5 * s * 0.82))
    dots = MB()
    for c, r in blossom:
        for k in range(26):
            d = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))).normalized()
            p = c + Vector((d.x * r * 1.2, d.y * r * 1.2, d.z * r))
            col = ('#E8749A', '#FFFFFF', '#F4A6BE', '#FFFFFF')[k % 4]
            dots.sphere(0.035, flat(col, 0.55), loc=tuple(p), scale=(1, 1, 0.7), segs=8, rings=5)
    objs.append(dots.done(name + '_dots'))
    if snow:
        for k, (c, r) in enumerate(blossom[:4]):
            objs.append(PA.snow_cap(name + '_snow', r * 0.55, (c.x - r * 0.15, c.y + r * 0.1, c.z + r * 0.78),
                                    r * 0.16, seed + k, scale=(1.0, 0.9, 1.0)))
    return objs


def stone_lantern(name, loc, s=1.0, glow=2.2):
    """Little round stone garden lantern (석등) with a warm glowing fire box and a snowy cap."""
    x, y, z = loc
    st = tonal('#C9C2B6', 0.07, 6.0, rough=0.88)
    objs = [cyl(name + '_b', 0.2 * s, 0.1 * s, (x, y, z), mat=st, segs=8, bevel=0.03),
            cyl(name + '_p', 0.075 * s, 0.38 * s, (x, y, z + 0.1 * s), mat=st, segs=12, bevel=0.02),
            cyl(name + '_t', 0.17 * s, 0.07 * s, (x, y, z + 0.48 * s), mat=st, segs=8, bevel=0.025)]
    lm = L.emissive(name + '_fire', '#FFD27A', '#FFB347', glow)
    objs.append(box(name + '_fb', (0.24 * s, 0.24 * s, 0.2 * s), (x, y, z + 0.55 * s), mat=st, bevel=0.025))
    for a in (0.0, 90.0):
        objs.append(box(name + '_win', (0.13 * s, 0.26 * s, 0.12 * s), (x, y, z + 0.585 * s), rot=(0, 0, a), mat=lm,
                        bevel=0.01))
    objs.append(cyl(name + '_roof', 0.26 * s, 0.13 * s, (x, y, z + 0.75 * s), mat=st, segs=6, r_top=0.06 * s,
                    bevel=0.03))
    objs.append(sphere(name + '_fin', 0.05 * s, (x, y, z + 0.9 * s), st, segs=10, rings=6))
    objs.append(PA.snow_cap(name + '_sn', 0.17 * s, (x - 0.02, y + 0.02, z + 0.84 * s), 0.05 * s, 5))
    objs.append(L.point_light(name + '_light', (x + 0.05, y - 0.05, z + 0.62 * s), 'window', 9.0 * s, 0.05))
    return objs


# ---------------------------------------------------------------------------- babies

def baby(name, loc, s=1.0, bonnet='#F7A8C0', pom='#FFFFFF', awake=True, look=(0, -1, 0.0), hand=True,
         hand_up=0.0, blink=False, tilt=0.0):
    """Chibi baby head + shoulders (the body is under a blanket): round face, rosy cheeks, dot eyes (or closed
    happy arcs), a knit bonnet with a pom-pom and ear flaps, a mitten hand.  Faces `look` (local)."""
    x, y, z = loc
    skin = flat(SKIN, 0.6)
    objs = []
    hr = 0.1 * s
    head = Vector((x, y, z))
    lk = Vector(look).normalized()
    rz = math.degrees(math.atan2(lk.x, -lk.y))
    grp_objs = []
    grp_objs.append(sphere(name + '_head', hr, (0, 0, 0), skin, scale=(1.0, 0.96, 0.93), segs=24, rings=14))
    # bonnet: a shell over the back/top of the head + rim + pom + ties
    bm_ = flat(bonnet, 0.8)
    grp_objs.append(sphere(name + '_bonnet', hr * 1.08, (0, hr * 0.42, hr * 0.12), bm_, scale=(1.0, 1.0, 0.98),
                           segs=22, rings=12))
    grp_objs.append(sphere(name + '_brim', hr * 1.0, (0, -hr * 0.36, hr * 0.1), flat(L.hexmix(bonnet, '#FFFFFF', 0.5),
                                                                                    0.85),
                           scale=(1.08, 0.22, 1.04), segs=22, rings=10))
    grp_objs.append(sphere(name + '_pom', hr * 0.32, (0, hr * 0.5, hr * 1.1), flat(pom, 0.9), segs=12, rings=8))
    # face (on the -Y side)
    face_y = -hr * 0.9
    if awake and not blink:
        for sx in (-1, 1):
            grp_objs.append(sphere(name + '_eye', hr * 0.13, (sx * hr * 0.36, face_y, hr * 0.05), flat(INK, 0.3),
                                   scale=(0.85, 0.5, 1.15), segs=10, rings=6))
            grp_objs.append(sphere(name + '_glint', hr * 0.045, (sx * hr * 0.33, face_y - hr * 0.05, hr * 0.11),
                                   flat('#FFFFFF', 0.2), segs=6, rings=4))
    else:
        for sx in (-1, 1):
            pts = [(sx * hr * 0.36 + hr * 0.14 * math.cos(a), face_y - 0.004, hr * 0.02 + hr * 0.08 * math.sin(a))
                   for a in [math.pi * k / 6 for k in range(7)]]
            if not awake:
                pts = [(p[0], p[1], hr * 0.06 - (p[2] - hr * 0.02)) for p in pts]   # sleepy: arcs curve down
            grp_objs.append(L.tube(name + '_lid', pts, hr * 0.028, flat(INK, 0.4)))
    for sx in (-1, 1):
        grp_objs.append(sphere(name + '_cheek', hr * 0.18, (sx * hr * 0.55, face_y + hr * 0.12, -hr * 0.22),
                               flat(CHEEK, 0.7), scale=(1.0, 0.4, 0.75), segs=10, rings=6))
    grp_objs.append(sphere(name + '_mouth', hr * 0.08, (0, face_y + hr * 0.02, -hr * 0.3), flat('#D9606B', 0.5),
                           scale=(1.2, 0.5, 0.7), segs=8, rings=5))
    g = L.group(grp_objs, name, loc=(x, y, z), rot=(tilt, 0, rz))
    objs.append(g)
    if hand:
        hp = Vector((x + 0.09 * s, y - 0.09 * s, z - hr * 0.95 + hand_up))
        objs.append(sphere(name + '_hand', 0.042 * s, tuple(hp), flat(L.hexmix(bonnet, '#FFFFFF', 0.3), 0.85),
                           scale=(1.0, 0.9, 1.05), segs=12, rings=8))
    return objs


def star_dots(mb, center, sx, sy, z, n, col='#FFFFFF', seed=0, r=0.022, normal=(0, 0, 1)):
    """Scatter little flat star-ish dots on a blanket / box face."""
    rnd = L.rng(seed)
    c = Vector(center)
    rot = euler_deg_from_normal(normal)
    for k in range(n):
        p = c + Vector((rnd.uniform(-sx, sx), rnd.uniform(-sy, sy), z))
        mb.sphere(r, flat(col, 0.6), loc=tuple(p), rot=rot, scale=(1.0, 1.0, 0.35), segs=8, rings=5)


def garden_bench(name, loc, length=1.3, col='#C98F55', frame='#F4EFE6'):
    """Small wooden garden bench (seat top 0.45 m, seat front edge at local y = -0.2), cream ends, curved back.
    Long axis = local X, sitters face -Y."""
    x0, y0, z0 = loc
    wood = tonal(col, 0.06, 3.0, rough=0.7)
    fm = flat(frame, 0.55)
    objs = []
    for k in range(3):
        objs.append(box(name + '_seat', (length, 0.12, 0.04), (x0, y0 - 0.14 + 0.13 * k, z0 + 0.41), mat=wood,
                        bevel=0.015))
    for k in range(3):
        z = 0.58 + 0.13 * k
        objs.append(box(name + '_back', (length - 0.04 - 0.05 * (k == 2), 0.04, 0.09), (x0, y0 + 0.21 + 0.015 * k,
                                                                                       z0 + z), rot=(-8, 0, 0),
                        mat=wood, bevel=0.015))
    for sx in (-1, 1):
        x = x0 + sx * (length / 2 + 0.01)
        objs.append(box(name + '_end', (0.05, 0.46, 0.06), (x, y0, z0 + 0.36), mat=fm, bevel=0.015))
        objs.append(box(name + '_lf', (0.05, 0.05, 0.4), (x, y0 - 0.18, z0), mat=fm, bevel=0.015))
        objs.append(box(name + '_lb', (0.05, 0.05, 0.95), (x, y0 + 0.2, z0), rot=(-8, 0, 0), mat=fm, bevel=0.015))
        objs.append(box(name + '_arm', (0.07, 0.44, 0.045), (x, y0 - 0.02, z0 + 0.64), mat=fm, bevel=0.018))
        objs.append(cyl(name + '_ap', 0.022, 0.24, (x, y0 - 0.2, z0 + 0.42), mat=fm, segs=8, bevel=0.005))
    return objs
