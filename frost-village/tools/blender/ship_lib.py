"""
ship_lib.py - modelling + layered-render helpers for the v6 harbour ships of "갈매기 항구"
(docs/CONTRACT_V6.md section S).  Not run directly: ship_models.py / ship_gull.py register the ships,
ship_render.py renders them, ship_pack.py packs assets/ships/.

Same camera / light / PPU / colour handling as every Frost Village sprite (bl_common), the village prop helpers
(prop_lib, prop_assets) and the v3 boat helpers (bld_boats: holdout water, crew rigs, captain dress) are imported
READ-ONLY and never modified.

Conventions
  * 1 unit = 1 m, world origin = the sprite anchor = waterline centre of the hull (z = 0 is the sea surface).
  * Ship-local frame: bow at -Y, stern at +Y, z up (the characters' "front = -Y" rule, so
    bl_common.yaw_for_dir(d) turns the bow toward screen direction d).  Everything below z = 0 is cut out of the
    sprite by a holdout water plane (bld_boats.holdout_water).
  * Rendered headings: S (bow toward the camera, "arriving"), SE (world +X, screen down-right) and NE (world +Y,
    screen up-right); the game mirrors SW <- SE and NW <- NE with flipX.  Ships sail along the two iso axes like
    the vehicles; S is the arrival heading.  The gull uses the 5 character dirs.
  * Two render modes:
      'full'    every frame is a complete picture (small boats, the gull) - exactly like boat_rowboat/fishing.
      'layered' big ships: base_<dir> = the whole ship at rest + small overlay frames that only hold the moving
                parts (funnel smoke, bow foam, the trawler's haul gear), rendered with the static ship as a holdout
                so they are already occluded correctly.  The game draws base, then the overlay on top (same frame
                size + anchor), and bobs the whole stack with a sine.  This keeps a 16-21 m ship inside one
                2048 px atlas and a few hundred KB.
"""
import math
import os
from collections import OrderedDict

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler, noise

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, box, cyl, sphere, blob, extrude, tonal, hexmix
import prop_assets as PA
import bld_boats as BB

SHIPS = OrderedDict()
SHIP_DIRS = ['S', 'SE', 'NE']
SHIP_MIRROR = {'SW': 'SE', 'NW': 'NE'}
GULL_DIRS = ['S', 'SE', 'E', 'NE', 'N']
GULL_MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
CAM_TOWARD = Vector((0.612372, -0.612372, 0.5)).normalized()       # direction from the scene toward the camera

WHITE = '#F4F1EA'
NAVY = '#2B4C8C'
INK = '#2B2F3A'
GLASS = '#9CC7E6'
GLOW = '#FFE2A0'


def ship(key, mode, anims, length, beam, dirs=None, samples=24, notes='', kind='ship', water=True, margin=6,
         mirror=None, **extra):
    """Register a ship builder.  anims[name] = {frames, fps, repeat, layers: [...], dirs: [...] (optional)}.
    'layers' (layered mode) = which animated layers the overlay frames of that anim show."""
    def deco(fn):
        SHIPS[key] = dict(key=key, fn=fn, mode=mode, anims=anims, lengthM=length, beamM=beam,
                          dirs=list(dirs or SHIP_DIRS), mirror=mirror or SHIP_MIRROR, samples=samples, notes=notes,
                          kind=kind, water=water, margin=margin, extra=extra)
        return fn
    return deco


# =========================================================================== materials

def band_mat(name, bands, rough=0.5, metal=0.0):
    """Colour bands by object-space Z: bands = [(z_from, colour), ...] ascending (the first z is ignored)."""
    key = ('band', name, tuple(bands), rough)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB(name, rough=rough, metal=metal)
    if len(bands) == 1:
        nb.p.inputs['Base Color'].default_value = nb.rgb(bands[0][1])
    else:
        tc = nb.n('ShaderNodeTexCoord')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(tc.outputs['Object'], sep.inputs[0])
        out = None
        for z, c in bands[1:]:
            f = nb.map_range(sep.outputs['Z'], z - 0.008, z + 0.008)
            out = nb.mix_rgb(f, out if out is not None else C(bands[0][1]), C(c))
        nb.base(out)
    L._CUSTOM[key] = nb.m
    return nb.m


def glow_mat(strength=1.6):
    key = ('shipglow', strength)
    if key not in L._CUSTOM:
        L._CUSTOM[key] = L.emissive('ship_glow', GLOW, 'window', strength)
    return L._CUSTOM[key]


def glass_mat():
    return flat(GLASS, 0.12, 0.15)


def dark_glass():
    return flat('#3E5F86', 0.15, 0.1)


def foam_mat(name, alpha=0.95):
    return L.smoke_mat(name, '#F4F8FC', alpha)


def light_mat(col, strength=3.0):
    key = ('shiplight', col, strength)
    if key not in L._CUSTOM:
        L._CUSTOM[key] = L.emissive('ship_light_' + col.lstrip('#'), col, col, strength)
    return L._CUSTOM[key]


# =========================================================================== hull

class Hull:
    """Chunky toy hull: plan = rounded-point bow (-Y) + rounded-square stern (+Y), vertical sides with a slight flare
    and a rounded rim, raked stem.  The top cap is the deck (material 1).  Below z = 0 nothing is visible."""

    def __init__(self, L_, W, F, rake=0.5, stern_over=0.1, pb=1.9, qb=1.45, ps=8.0, qs=6.0, draft=0.7, M=44):
        self.L, self.W, self.F = L_, W, F
        self.pb, self.qb, self.ps, self.qs = pb, qb, ps, qs
        self.levels = [(-draft, 0.82, -0.9, -0.1), (0.0, 0.95, -0.15, 0.0), (F * 0.55, 1.0, rake * 0.5, stern_over * 0.5),
                       (F - 0.14, 1.03, rake * 0.92, stern_over * 0.92), (F - 0.045, 1.02, rake * 0.99, stern_over),
                       (F, 0.99, rake, stern_over)]
        self.ts = [-math.cos(math.pi * k / M) for k in range(M + 1)]

    def hw(self, t):
        W = self.W
        if t < 0:
            return W / 2 * max(0.0, 1.0 - (-t) ** self.pb) ** (1.0 / self.qb)
        return W / 2 * max(0.0, 1.0 - t ** self.ps) ** (1.0 / self.qs)

    def level_at(self, z):
        lv = self.levels
        if z <= lv[0][0]:
            return lv[0][1:]
        for a, b in zip(lv, lv[1:]):
            if a[0] <= z <= b[0]:
                f = (z - a[0]) / max(1e-6, b[0] - a[0])
                return tuple(a[k] + (b[k] - a[k]) * f for k in (1, 2, 3))
        return lv[-1][1:]

    def xy(self, t, z, side=1.0):
        s, eb, es = self.level_at(z)
        x = side * s * self.hw(t)
        y = t * self.L / 2 - eb * max(0.0, -t) ** 3 + es * max(0.0, t) ** 6
        return x, y

    def side_point(self, t, z, side=1.0, out=0.0):
        """(position, outward horizontal normal) on the hull side at parameter t (-1 bow .. 1 stern), height z."""
        dt = 0.004
        x0, y0 = self.xy(max(-1.0, t - dt), z, side)
        x1, y1 = self.xy(min(1.0, t + dt), z, side)
        x, y = self.xy(t, z, side)
        tx, ty = x1 - x0, y1 - y0
        n = Vector((ty, -tx, 0.0))
        if n.x * side < 0:
            n = -n
        n.normalize()
        return Vector((x, y, z)) + n * out, n

    def t_at_y(self, y):
        """Hull parameter t whose deck-level y is closest to y."""
        best = min(self.ts, key=lambda t: abs(self.xy(t, self.F)[1] - y))
        lo, hi = max(-1.0, best - 0.06), min(1.0, best + 0.06)
        for _ in range(30):
            mid = (lo + hi) / 2
            if self.xy(mid, self.F)[1] < y:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def ring(self, z):
        right = [self.xy(t, z, 1.0) for t in self.ts]
        left = [(-x, y) for (x, y) in right[-2:0:-1]]
        return right + left

    def deck_outline(self, inset=0.0, z=None):
        """Closed deck outline (CCW seen from above) at height z (default deck), pulled in by `inset` m."""
        z = self.F if z is None else z
        pts = self.ring(z)
        if inset <= 0:
            return pts
        out = []
        n = len(pts)
        for i in range(n):
            p = Vector((*pts[i], 0.0))
            a = Vector((*pts[i - 1], 0.0))
            b = Vector((*pts[(i + 1) % n], 0.0))
            t = (b - a).normalized()
            nn = Vector((t.y, -t.x, 0.0))
            if nn.dot(p) < 0:
                nn = -nn
            q = p - nn * inset
            out.append((q.x, q.y))
        return out

    def build(self, name, side_mat, deck_mat, bevel=0.05):
        bm = bmesh.new()
        rings = []
        for (z, s, eb, es) in self.levels:
            rings.append([bm.verts.new((x, y, z)) for (x, y) in self.ring(z)])
        n = len(rings[0])
        for k in range(len(rings) - 1):
            for j in range(n):
                j2 = (j + 1) % n
                bm.faces.new((rings[k][j], rings[k][j2], rings[k + 1][j2], rings[k + 1][j]))
        bot = bm.faces.new(list(reversed(rings[0])))
        top = bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        for f in bm.faces:
            f.material_index = 1 if (f is top or f.normal.z > 0.95) else 0
        bot.material_index = 0
        return L.finish(name, bm, [side_mat, deck_mat], bevel=bevel, segs=3, angle=40)

    def bulwark(self, name, h_fn, out_mat, in_mat, cap_mat, thick=0.09, z0=None, gap=None):
        """Wall around the deck edge.  h_fn(t) = height above the deck; the outer face continues the hull side
        (use the hull's band material: object Z = world Z).  gap=(t0, t1, side) or a list of them leaves openings
        (gangway, stern ramp); side None = both sides."""
        z0 = self.F - 0.06 if z0 is None else z0
        ts = self.ts
        loop = [(t, 1.0) for t in ts] + [(t, -1.0) for t in ts[-2:0:-1]]
        P = []
        for t, sd in loop:
            x, y = self.xy(t, self.F, sd)
            P.append((Vector((x, y, 0.0)), t, sd))
        n = len(P)
        bm = bmesh.new()
        cols = []
        for i in range(n):
            p, t, sd = P[i]
            a, b = P[i - 1][0], P[(i + 1) % n][0]
            tg = (b - a).normalized()
            nn = Vector((tg.y, -tg.x, 0.0))
            if nn.dot(p) < 0:
                nn = -nn
            q = p - nn * thick
            h = self.F + h_fn(t)
            ob = bm.verts.new((p.x, p.y, z0))
            ot = bm.verts.new((p.x, p.y, h))
            it = bm.verts.new((q.x, q.y, h))
            ib = bm.verts.new((q.x, q.y, z0))
            cols.append((ob, ot, it, ib, t, sd))
        made = []
        for i in range(n):
            a, b = cols[i], cols[(i + 1) % n]
            made.append(False)
            if gap:
                skip = False
                for g0, g1, gs in (gap if isinstance(gap, list) else [gap]):
                    tm = (a[4] + b[4]) / 2
                    if (gs is None or (a[5] == gs and b[5] == gs)) and g0 <= tm <= g1 and \
                            g0 <= a[4] <= g1 and g0 <= b[4] <= g1:
                        skip = True
                if skip:
                    continue
            for (u, v, mi) in ((0, 1, 0), (1, 2, 2), (2, 3, 1)):
                f = bm.faces.new((a[u], b[u], b[v], a[v]))
                f.material_index = mi
            made[-1] = True
        for i in range(n):                       # end caps where a gap starts / stops
            if made[i - 1] != made[i]:
                c = cols[i]
                f = bm.faces.new((c[0], c[1], c[2], c[3]))
                f.material_index = 2
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return L.finish(name, bm, [out_mat, in_mat, cap_mat], bevel=0.025, segs=2, angle=50)


# =========================================================================== parts

def frame_for(normal):
    """Rotation matrix whose X runs along the wall (horizontal), Y up and Z = the outward normal."""
    n = Vector((normal.x, normal.y, 0.0)).normalized()
    X = Vector((-n.y, n.x, 0.0))
    Y = Vector((0.0, 0.0, 1.0))
    return Matrix((X, Y, n)).transposed()


def rr_pts(w, h, r, n=5, cx=0.0, cy=0.0):
    """Rounded rectangle outline (CCW) centred on (cx, cy)."""
    r = min(r, w / 2 - 1e-3, h / 2 - 1e-3)
    pts = []
    for (sx, sy, a0) in ((1, 1, 0.0), (-1, 1, 90.0), (-1, -1, 180.0), (1, -1, 270.0)):
        ccx, ccy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n)
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts


def panel(name, pos, normal, w, h, r, depth, mat, side=None, bevel=0.015):
    """Rounded-rect panel standing on a wall: centre `pos` on the wall surface, `normal` outward (horizontal)."""
    o = extrude(name, rr_pts(w, h, r), depth, top=mat, side=side or mat, bevel=bevel)
    o.matrix_world = Matrix.Translation(Vector(pos)) @ frame_for(Vector(normal)).to_4x4()
    return o


def disc(name, pos, normal, r, depth, mat, segs=24, bevel=0.012):
    """Disc (porthole glass / rim) on a wall."""
    o = cyl(name, r, depth, (0, 0, 0), mat=mat, segs=segs, bevel=bevel)
    o.matrix_world = Matrix.Translation(Vector(pos)) @ frame_for(Vector(normal)).to_4x4()
    return o


def window(name, pos, normal, w=0.6, h=0.5, r=0.12, glow=True, frame='#F4F1EA', fw=0.07):
    """Toy window: white rounded frame + glowing (or blue glass) pane, sticking out a little from the wall."""
    objs = [panel(name + '_f', pos, normal, w + 2 * fw, h + 2 * fw, r + fw * 0.6, 0.035, flat(frame, 0.55)),
            panel(name + '_g', Vector(pos) + Vector(normal) * 0.012, normal, w, h, r, 0.04,
                  glow_mat() if glow else glass_mat(), bevel=0.01)]
    return objs


def porthole(name, pos, normal, r=0.15, glow=True, rim='#E9C46A'):
    n = Vector(normal)
    return [disc(name + '_r', pos, n, r + 0.055, 0.04, flat(rim, 0.3, 0.5), segs=24),
            disc(name + '_g', Vector(pos) + n * 0.012, n, r, 0.045, glow_mat() if glow else dark_glass(), segs=24)]


def plan_rr(w, ya, yb, rf, rb, n=8, cx=0.0):
    """Rounded plan outline (CCW): width w (x), from ya (bow side) to yb (stern side); corner radii rf (bow), rb."""
    hx = w / 2
    rf = min(rf, hx - 1e-3, (yb - ya) / 2 - 1e-3)
    rb = min(rb, hx - 1e-3, (yb - ya) / 2 - 1e-3)
    pts = []
    for ccx, ccy, a0, r in ((hx - rb, yb - rb, 0, rb), (-hx + rb, yb - rb, 90, rb), (-hx + rf, ya + rf, 180, rf),
                            (hx - rf, ya + rf, 270, rf)):
        for k in range(n + 1):
            a = math.radians(a0 + 90.0 * k / n)
            pts.append((cx + ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts


def outline_normal(pts, i):
    p = Vector((*pts[i], 0.0))
    a = Vector((*pts[i - 1], 0.0))
    b = Vector((*pts[(i + 1) % len(pts)], 0.0))
    t = (b - a).normalized()
    return Vector((t.y, -t.x, 0.0))


def points_along(pts, step, closed=True, skip=None):
    """Evenly spaced (point, outward normal) samples along a CCW outline."""
    seq = list(pts) + ([pts[0]] if closed else [])
    out = []
    acc = step * 0.5
    for i in range(len(seq) - 1):
        a, b = Vector((*seq[i], 0.0)), Vector((*seq[i + 1], 0.0))
        d = b - a
        ln = d.length
        if ln < 1e-6:
            continue
        t = d / ln
        nrm = Vector((t.y, -t.x, 0.0))
        s = acc
        while s <= ln:
            p = a + t * s
            if not (skip and skip(p)):
                out.append((p, nrm))
            s += step
        acc = s - ln
    return out


def cabin(name, w, ya, yb, z0, h, wall, roof=None, rf=0.6, rb=0.3, cx=0.0, bevel=0.07):
    """Rounded superstructure block (+ returns its outline for windows / rails)."""
    pts = plan_rr(w, ya, yb, rf, rb, cx=cx)
    o = extrude(name, pts, h, loc=(0, 0, z0), top=roof or wall, side=wall, bevel=bevel, angle=40)
    return o, pts


def railing(name, pts, z, h=0.85, col=WHITE, step=0.55, r=0.04, closed=False, mid=True, mat=None):
    """White ship railing along a 2D polyline at deck height z (posts + top rail + mid rail)."""
    m = mat or flat(col, 0.5)
    mb = L.MB()
    seq = list(pts) + ([pts[0]] if closed else [])
    P = [Vector((x, y, z)) for x, y in seq]
    for a, b in zip(P, P[1:]):
        mb.seg(a + Vector((0, 0, h)), b + Vector((0, 0, h)), r, m, segs=8)
        if mid:
            mb.seg(a + Vector((0, 0, h * 0.5)), b + Vector((0, 0, h * 0.5)), r * 0.7, m, segs=6)
    # posts
    total = 0.0
    acc = 0.0
    for a, b in zip(P, P[1:]):
        d = b - a
        ln = d.length
        s = 0.0 if total == 0.0 else (step - acc)
        while s <= ln + 1e-6:
            p = a + d * (s / max(ln, 1e-6))
            mb.seg(p, p + Vector((0, 0, h + r)), r * 0.85, m, segs=8)
            mb.sphere(r * 1.25, m, loc=p + Vector((0, 0, h)), segs=8, rings=5)
            s += step
        acc = (acc + ln) % step
        total += ln
    return mb.done(name)


def funnel(name, loc, w, d, h, col, band='#F4F1EA', top='#2B2F3A', rake=8.0, band_z=(0.45, 0.68), logo=None):
    """Oval toy funnel (long axis along the ship), coloured, with a band and a black top; rake = lean to the stern."""
    bands = [(0.0, col), (h * band_z[0], band), (h * band_z[1], col), (h * 0.86, top)]
    m = band_mat(name + '_m', bands, rough=0.45)
    o = cyl(name, w / 2, h, (0, 0, 0), mat=m, segs=32, bevel=0.06, r_top=w / 2 * 0.96)
    o.scale = (1.0, d / w, 1.0)
    rim = cyl(name + '_rim', w / 2 * 1.02, 0.08, (0, 0, h - 0.06), mat=flat(top, 0.4), segs=32, bevel=0.03)
    rim.scale = (1.0, d / w, 1.0)
    hole = cyl(name + '_in', w / 2 * 0.8, 0.05, (0, 0, h - 0.025), mat=flat('#15161A', 0.9), segs=28, bevel=0.0)
    hole.scale = (1.0, d / w, 1.0)
    objs = [o, rim, hole]
    if logo:
        for s in (-1, 1):
            p = Vector((s * w / 2 * 1.0, 0.0, h * (band_z[0] + band_z[1]) / 2))
            objs += logo(name + '_logo%d' % (s > 0), p, Vector((s, 0, 0)))
    g = L.group(objs, name + '_g', loc=loc, rot=(-rake, 0, 0))
    top_local = Vector((0.0, 0.0, h + 0.02))
    R = Euler((math.radians(-rake), 0, 0), 'XYZ').to_matrix()
    return g, Vector(loc) + R @ top_local


def star_logo(name, p, n, r=0.2, col='#F2C14E'):
    pts = [(r * (1.0 if k % 2 == 0 else 0.45) * math.cos(math.pi / 2 + math.pi * k / 5),
            r * (1.0 if k % 2 == 0 else 0.45) * math.sin(math.pi / 2 + math.pi * k / 5)) for k in range(10)]
    o = extrude(name, pts, 0.04, top=flat(col, 0.4), side=flat(col, 0.4), bevel=0.008)
    o.matrix_world = Matrix.Translation(p) @ frame_for(n).to_4x4()
    return [o]


def flag_on(name, top, w, h, color, yaw_deg=90.0, seed=0, emblem=True):
    """prop_assets.flag (waving cloth toward +X) turned to fly toward the stern (+Y) by default."""
    f = PA.flag(name, tuple(top), w, h, color, seed=seed, emblem=emblem)
    f.rotation_euler.z = math.radians(yaw_deg)
    return f


def mast(name, base, h, col=WHITE, r=0.07, yard=0.9, radar=True, light=True, flag=None, flag_w=0.6):
    """Toy mast: pole + yard + radar bar + masthead light + pennant.  Returns (objects, top point)."""
    bx, by, bz = base
    objs = [cyl(name, r, h, (bx, by, bz), mat=flat(col, 0.5), segs=14, r_top=r * 0.7, bevel=0.02)]
    if yard:
        objs.append(box(name + '_yard', (yard, 0.08, 0.08), (bx, by, bz + h * 0.72), mat=flat(col, 0.5), bevel=0.03))
        for s in (-1, 1):
            objs.append(sphere(name + '_yl', 0.06, (bx + s * yard / 2, by, bz + h * 0.72 + 0.05),
                               light_mat('#FFE07A' if s > 0 else '#FFE07A', 2.5), segs=12, rings=8))
    if radar:
        objs.append(cyl(name + '_rp', 0.08, 0.18, (bx, by, bz + h * 0.84), mat=flat('#3D424C', 0.5), segs=12))
        objs.append(box(name + '_rb', (0.75, 0.12, 0.1), (bx, by, bz + h * 0.84 + 0.16), rot=(0, 0, 30),
                        mat=flat('#3D424C', 0.45), bevel=0.04))
    top = Vector((bx, by, bz + h))
    if light:
        objs.append(sphere(name + '_top', 0.085, tuple(top + Vector((0, 0, 0.05))), light_mat('#FFF4D0', 3.0),
                           segs=14, rings=8))
    if flag:
        objs.append(flag_on(name + '_flag', top - Vector((0, 0, 0.05)), flag_w, flag_w * 0.55, flag, seed=len(name)))
    return objs, top + Vector((0, 0, 0.12))


def life_ring(name, loc, normal, r=0.2, rr=0.055):
    mb = L.MB()
    red, white = flat('#D9483B', 0.5), flat(WHITE, 0.5)
    for k in range(16):
        a0, a1 = math.tau * k / 16, math.tau * (k + 1) / 16
        p = Vector((r * math.cos(a0), r * math.sin(a0), 0))
        q = Vector((r * math.cos(a1), r * math.sin(a1), 0))
        mb.seg(p, q, rr, red if (k // 2) % 2 == 0 else white, segs=10)
    o = mb.done(name)
    # ring lies in the wall plane: local XY -> wall (X along, Y up), Z = normal
    o.matrix_world = Matrix.Translation(Vector(loc)) @ frame_for(Vector(normal)).to_4x4()
    return o


def tyre(name, loc, normal, r=0.24, rr=0.09):
    """Black rubber tyre fender hanging on a hull side (tugboat)."""
    mb = L.MB()
    m = flat('#2A2C31', 0.75)
    for k in range(18):
        a0, a1 = math.tau * k / 18, math.tau * (k + 1) / 18
        mb.seg(Vector((r * math.cos(a0), r * math.sin(a0), 0)), Vector((r * math.cos(a1), r * math.sin(a1), 0)), rr, m,
               segs=10)
    o = mb.done(name)
    o.matrix_world = Matrix.Translation(Vector(loc)) @ frame_for(Vector(normal)).to_4x4()
    return o


def bollard(name, loc, r=0.1, h=0.28, col='#3D424C'):
    x, y, z = loc
    m = flat(col, 0.45, 0.3)
    return [cyl(name + 'a', r, h, (x, y - r * 1.4, z), mat=m, segs=14, bevel=0.02),
            cyl(name + 'b', r, h, (x, y + r * 1.4, z), mat=m, segs=14, bevel=0.02),
            cyl(name + 'ca', r * 1.35, 0.05, (x, y - r * 1.4, z + h), mat=m, segs=14, bevel=0.015),
            cyl(name + 'cb', r * 1.35, 0.05, (x, y + r * 1.4, z + h), mat=m, segs=14, bevel=0.015),
            box(name + 'p', (r * 1.6, r * 4.2, 0.06), (x, y, z), mat=m, bevel=0.02)]


def anchor_on(name, pos, normal, s=0.55, col='#2E3238'):
    """Stockless anchor flat on a hull side (bow), in the wall frame: shank up, crown + flukes down."""
    mb = L.MB()
    m = flat(col, 0.45, 0.4)
    mb.seg(Vector((0, -0.42 * s, 0.02)), Vector((0, 0.32 * s, 0.02)), 0.045 * s / 0.55, m, segs=8)
    mb.cone(0.11 * s, 0.11 * s, 0.05, m, loc=(0, 0.42 * s, 0.02), segs=14)
    for sx in (-1, 1):
        mb.seg(Vector((0, -0.42 * s, 0.02)), Vector((sx * 0.3 * s, -0.24 * s, 0.02)), 0.045 * s / 0.55, m, segs=8)
        mb.cone(0.09 * s, 0.0, 0.16 * s, m, loc=(sx * 0.33 * s, -0.18 * s, 0.02), rot=(0, 0, 0), segs=10)
    mb.seg(Vector((-0.16 * s, 0.22 * s, 0.02)), Vector((0.16 * s, 0.22 * s, 0.02)), 0.035 * s / 0.55, m, segs=8)
    o = mb.done(name)
    o.matrix_world = Matrix.Translation(Vector(pos)) @ frame_for(Vector(normal)).to_4x4()
    return o


def lifeboat(name, loc, length=2.0, beam=0.8, col='#F08A3A', cover=WHITE, yaw=0.0, seed=0):
    """Small closed toy lifeboat (orange hull, white cover, snow on top) on two davit arms."""
    hb = Hull(length, beam, 0.42, rake=0.05, stern_over=0.0, pb=1.7, qb=1.5, ps=2.2, qs=1.6, draft=0.25, M=24)
    hull = hb.build(name + '_h', band_mat(name + '_hm', [(0.0, col), (0.33, WHITE)], rough=0.45),
                    flat(cover, 0.6), bevel=0.04)
    hull.location.z = 0.25
    cv = blob(name + '_cv', 1.0, (0, 0, 0.62), flat(cover, 0.55), scale=(beam * 0.42, length * 0.43, 0.2),
              seed=seed, amp=0.04, subdiv=3)
    sn = PA.snow_cap(name + '_sn', beam * 0.32, (0.04, 0.0, 0.78), 0.07, seed, scale=(1.0, length / beam * 0.8, 1.0))
    objs = [hull, cv, sn]
    m = flat(WHITE, 0.5)
    mb = L.MB()
    for y in (-length * 0.3, length * 0.3):
        mb.seg(Vector((-beam * 0.9, y, -0.35)), Vector((-beam * 0.9, y, 0.75)), 0.04, m, segs=8)
        mb.seg(Vector((-beam * 0.9, y, 0.75)), Vector((0.0, y, 0.95)), 0.035, m, segs=8)
        mb.seg(Vector((0.0, y, 0.95)), Vector((0.0, y, 0.68)), 0.012, flat('#D9C39A', 0.8), segs=5)
    objs.append(mb.done(name + '_dav'))
    return L.group(objs, name, loc=loc, rot=(0, 0, yaw))


def container(name, loc, size, col, snow=True, seed=0, yaw=0.0):
    """Toy shipping container: corrugated walls (stripes), darker end doors, white corner posts."""
    sx, sy, sz = size
    wall = L.stripes(col, hexmix(col, '#000000', 0.16), 7.0, 'Y', rough=0.55, soft=0.12)
    objs = [box(name, size, (0, 0, 0), mat=wall, bevel=0.035)]
    dm = flat(hexmix(col, '#000000', 0.12), 0.55)
    objs.append(box(name + '_d', (sx * 0.9, 0.03, sz * 0.86), (0, -sy / 2 - 0.005, sz * 0.07), mat=dm, bevel=0.01))
    objs.append(box(name + '_d2', (sx * 0.9, 0.03, sz * 0.86), (0, sy / 2 + 0.005, sz * 0.07), mat=dm, bevel=0.01))
    for ex in (-1, 1):
        objs.append(box(name + '_bar', (0.03, 0.04, sz * 0.8), (ex * sx * 0.12, -sy / 2 - 0.02, sz * 0.1),
                        mat=flat('#D9D9D9', 0.4, 0.4), bevel=0.0))
    if snow:
        objs.append(L.snow_slab(name + '_s', sx * 0.82, sy * 0.86, 0.07, (0.02, 0.0, sz - 0.01), seed=seed))
    return L.group(objs, name + '_g', loc=loc, rot=(0, 0, yaw))


def crate(name, loc, s=0.6, seed=0, snow=True):
    with L.Collect() as c:
        PA.crate_model(name, s, (0, 0, 0), snow=snow, seed=seed)
    return L.group([o for o in c.objs if o.parent is None], name + '_g', loc=loc)


# =========================================================================== moving parts

class Foam:
    """Bow wave: a soft white foam ribbon on each side that starts thick at the stem and curls back along the hull,
    spreading into a V and tapering, with a wobble that travels aft; plus lumps of spray at the stem and a few
    bubbles shed off the ribbon.  Same objects every frame (curve points are moved), seamless over `frames`."""

    def __init__(self, name, hull, n=7, length=0.42, spread=0.55, r0=0.16, r1=0.34, seed=0, splash=3, z=0.03,
                 stern=False, K=22):
        self.hull, self.n, self.length, self.spread, self.r0, self.r1 = hull, n, length, spread, r0, r1
        self.z, self.K = z, K
        self.mat = foam_mat(name + '_rib', 1.0)
        self.ribbons = []
        for side in (-1.0, 1.0):
            pts = [(0.0, 0.0, 0.0)] * K
            o = L.tube('%s_r%d' % (name, side > 0), pts, 1.0, self.mat)
            o.data.bevel_resolution = 4
            o.data.resolution_u = 2
            o.visible_shadow = False
            self.ribbons.append((o, side))
        self.obs = []
        self.mats = []
        k = 0
        for side in (-1.0, 1.0):
            for j in range(n):
                m = foam_mat('%s_m%d' % (name, k))
                o = blob('%s%d' % (name, k), 1.0, (0, 0, 0), m, seed=seed * 31 + k, amp=0.22, freq=1.6, subdiv=3)
                o.visible_shadow = False
                self.obs.append((o, side, j))
                self.mats.append(m)
                k += 1
        self.splash = []
        for j in range(splash):
            m = foam_mat('%s_sm%d' % (name, j))
            o = blob('%s_s%d' % (name, j), 1.0, (0, 0, 0), m, seed=seed * 17 + j, amp=0.25, freq=1.8, subdiv=3)
            o.visible_shadow = False
            self.splash.append((o, j, m))
        self.show(False)

    def all(self):
        return [o for o, _ in self.ribbons] + [o for o, _, _ in self.obs] + [o for o, _, _ in self.splash]

    def show(self, on):
        for o in self.all():
            o.hide_render = not on
            o.hide_viewport = not on

    def path(self, u, side):
        t = -1.0 + 0.015 + u * self.length * 2.0
        p, nrm = self.hull.side_point(t, 0.0, side)
        return p + nrm * (0.0 + self.spread * max(0.0, u - 0.22) ** 1.3 * 1.6), nrm

    def set(self, i, frames=4):
        self.show(True)
        ph = math.tau * i / float(frames)
        for o, side in self.ribbons:
            sp = o.data.splines[0]
            for k in range(self.K):
                u = k / float(self.K - 1)
                p, nrm = self.path(u, side)
                wob = math.sin(9.0 * u - ph + side) * (0.05 + 0.08 * u)
                p = p + nrm * wob
                r = self.r1 * (1.0 - u) ** 0.6 * (1.0 + 0.25 * math.sin(13.0 * u - 1.3 * ph + side)) + 0.02
                sp.points[k].co = (p.x, p.y, (self.z + r * 0.2) / 0.6, 1.0)
                sp.points[k].radius = r
            o.scale = (1.0, 1.0, 0.6)
        for (o, side, j), m in zip(self.obs, self.mats):
            u = (j + i / float(frames)) / self.n
            p, nrm = self.path(min(1.0, 0.2 + u * 0.9), side)
            p = p + nrm * (0.12 + 0.3 * u)
            s = self.r0 * (0.35 + 0.45 * math.sin(math.pi * u))
            o.location = (p.x, p.y, self.z + 0.02)
            o.scale = (s * 1.2, s * 1.2, s * 0.45)
            o.rotation_euler = Euler((0, 0, u * 3.0 + j), 'XYZ')
            L.set_alpha(m, 1.0 if u < 0.7 else max(0.0, 1.0 - (u - 0.7) / 0.3))
        tip, _ = self.hull.side_point(-1.0, 0.0, 1.0)
        for (o, j, m) in self.splash:
            u = ((j + i / float(frames)) / max(1, len(self.splash)))
            up = math.sin(math.pi * u)
            o.location = (tip.x + 0.16 * math.sin(j * 2.1 + u * 3), tip.y - 0.08 - 0.12 * u, 0.08 + 0.3 * up)
            s = self.r0 * (0.6 + 0.6 * up)
            o.scale = (s, s, s * 0.8)
            L.set_alpha(m, 0.95 * (0.4 + 0.6 * up))


def smoke(name, base, big=1.0, seed=0, color='#C3C9D2', alpha=0.88, drift=(0.0, 0.6), n=3, rise=1.6):
    """Funnel smoke (prop_lib.Smoke = seamless rising puffs).  base = funnel top in ship-local coordinates."""
    sm = L.Smoke(name, tuple(base), n=n, rise=rise * big, drift=(drift[0] * big, drift[1] * big), r0=0.16 * big,
                 r1=0.42 * big, color=color, alpha=alpha, seed=seed)
    for o in sm.obs:                       # prop_lib puffs are subdiv-2 icospheres: smooth them for big funnels
        mod = o.modifiers.new('Subsurf', 'SUBSURF')
        mod.levels = mod.render_levels = 2
    return sm


# =========================================================================== render-side helpers

def set_visible(objs, on):
    for o in objs:
        o.hide_render = not on
        o.hide_viewport = not on


def set_holdout(objs, on):
    for o in objs:
        try:
            o.is_holdout = on
        except Exception:
            pass


def mesh_objs(objs):
    return [o for o in objs if o.type in ('MESH', 'CURVE')]


def collect(fn, *a, **kw):
    """Run fn and return (result, every new object)."""
    with L.Collect() as c:
        r = fn(*a, **kw)
    return r, list(c.objs)


def person_samples(p):
    """Sample points on a 1.45 m chibi townsperson standing at p (camera-facing half): legs, body, big head."""
    out = []
    side = Vector((0.7071, 0.7071, 0.0))          # screen-horizontal direction
    toward = Vector((0.7071, -0.7071, 0.0))
    for z, r in ((0.12, 0.12), (0.35, 0.2), (0.6, 0.22), (0.85, 0.2), (1.12, 0.26), (1.3, 0.2)):
        for k in (-1.0, -0.5, 0.0, 0.5, 1.0):
            out.append(p + Vector((0, 0, z)) + side * (r * k) + toward * (r * 0.6 * (1 - abs(k))))
    return out


def visible_fraction(p, samples=None, ignore=()):
    """Fraction of a standing person's sample points at world point p that the camera can see."""
    dg = bpy.context.evaluated_depsgraph_get()
    sc = bpy.context.scene
    pts = samples or person_samples(p)
    vis = 0
    for q in pts:
        hit, loc, nrm, idx, ob, mw = sc.ray_cast(dg, q + CAM_TOWARD * 0.02, CAM_TOWARD)
        if hit and ob is not None and ob.name not in ignore:
            continue
        vis += 1
    return vis / float(len(pts))


def stack_samples(p, h=0.9, r=0.3):
    out = []
    side = Vector((0.7071, 0.7071, 0.0))
    for z in (0.05, h * 0.5, h):
        for k in (-1.0, 0.0, 1.0):
            out.append(p + Vector((0, 0, z)) + side * (r * k))
    return out


# =========================================================================== snow

def snow_mat():
    """Packed snow: bluish on the sides, white on top (life_assets.snow_m family)."""
    return L.snowy('#D6E1EE', snow='snow_mat', lo=0.12, hi=0.72, noise_amt=0.22, noise_scale=2.4)


def pillow_snow(name, w, ya, yb, z, rf=0.3, rb=0.3, t=0.15, cx=0.0, seed=0, drifts=3):
    """Soft rounded snow cushion on a flat roof (plan_rr outline) + a few drift lumps so it is not a flat sheet."""
    o = extrude(name, plan_rr(w, ya, yb, rf, rb, cx=cx), t, loc=(0, 0, z), top=snow_mat(), side=snow_mat(),
                bevel=min(0.09, t * 0.48), angle=30)
    out = [o]
    rnd = L.rng(seed)
    for k in range(drifts):
        x = cx + rnd.uniform(-w * 0.3, w * 0.3)
        y = rnd.uniform(ya + (yb - ya) * 0.15, yb - (yb - ya) * 0.15)
        r = rnd.uniform(0.28, 0.45) * min(1.0, w / 2.5)
        out.append(blob(name + '_d%d' % k, r, (x, y, z + t - 0.02), flat('snow_mat', 0.9),
                        scale=(1.4, 1.1, 0.32), seed=seed * 7 + k, amp=0.2, freq=2.0, subdiv=3))
    return out


def drift(name, loc, r=0.3, seed=0, scale=(1.4, 1.0, 0.36)):
    """Small snow drift lump on a deck / ledge."""
    return blob(name, r, loc, flat('snow_mat', 0.9), scale=scale, seed=seed, amp=0.22, freq=2.0, subdiv=3)


# =========================================================================== sails

class Sail:
    """Triangular cloth sail whose shape is updated in place every frame (same object, so the layer lists stay
    valid).  Defined by three corners in the parent frame: tack (bottom front), head (top), clew (bottom back);
    camber bulges the cloth along `normal_side` * (cross product of the chord and the luff)."""

    def __init__(self, name, mat, nu=10, nv=12):
        import bmesh as _bm
        self.nu, self.nv = nu, nv
        bm = _bm.new()
        self.idx = {}
        for j in range(nv + 1):
            for i in range(nu + 1):
                self.idx[(i, j)] = bm.verts.new((0.0, 0.0, 0.0))
        bm.verts.ensure_lookup_table()
        for j in range(nv):
            for i in range(nu):
                bm.faces.new((self.idx[(i, j)], self.idx[(i + 1, j)], self.idx[(i + 1, j + 1)], self.idx[(i, j + 1)]))
        order = {v: k for k, v in enumerate(bm.verts)}
        self.vi = {key: order[v] for key, v in self.idx.items()}
        self.ob = L.finish(name, bm, [mat], smooth=True)
        self.ob.visible_shadow = True

    def shape(self, tack, head, clew, camber=0.25, side=1.0, flutter=0.0, phase=0.0):
        tack, head, clew = Vector(tack), Vector(head), Vector(clew)
        luff = head - tack
        chord = clew - tack
        n = luff.cross(chord).normalized() * side
        me = self.ob.data
        for (i, j), k in self.vi.items():
            u = i / float(self.nu)                 # 0 luff .. 1 leech
            v = j / float(self.nv)                 # 0 foot .. 1 head
            a = tack + luff * v                    # point on the luff
            b = clew + (head - clew) * v           # point on the leech
            p = a + (b - a) * u
            bulge = camber * math.sin(math.pi * u) * (1.0 - 0.55 * v) * (b - a).length / max(chord.length, 1e-3)
            wav = flutter * math.sin(u * 7.0 + v * 3.0 + phase) * u * (1.0 - v * 0.5)
            q = p + n * (bulge + wav)
            me.vertices[k].co = (q.x, q.y, q.z)
        me.update()


def torus_coil(name, loc, r=0.22, rr=0.05, turns=3, col='#D9C39A'):
    """Coiled rope lying on deck."""
    mb = L.MB()
    m = flat(col, 0.85)
    for t in range(turns):
        rt = r - t * rr * 1.6
        for k in range(16):
            a0, a1 = math.tau * k / 16, math.tau * (k + 1) / 16
            mb.seg(Vector((rt * math.cos(a0), rt * math.sin(a0), rr + t * 0.02)),
                   Vector((rt * math.cos(a1), rt * math.sin(a1), rr + t * 0.02)), rr, m, segs=8)
    return mb.done(name, loc=loc)
