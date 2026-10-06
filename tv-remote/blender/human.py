"""Procedural field technician for the intro renders.

Character frame: feet at the origin, facing -Y, +X is the character's left side, Z up.
Angles: flex swings a limb forward (toward -Y), abd swings it outward to its own side.
"""
import math
import bmesh
from mathutils import Vector, Matrix
from common import mat, mesh_obj, tube, ellipsoid, box, curve_tube

HIP_Z = 0.93          # hip joints when standing
PIVOT_Z = 0.98        # upper body rotates around the pelvis
TORSO = [             # z, half width, half depth, forward offset (negative = forward)
    (0.86, 0.150, 0.100, 0.010), (0.92, 0.168, 0.110, 0.012), (0.98, 0.170, 0.110, 0.010),
    (1.05, 0.154, 0.101, 0.004), (1.12, 0.151, 0.103, -0.002), (1.20, 0.162, 0.109, -0.008),
    (1.28, 0.175, 0.115, -0.012), (1.36, 0.184, 0.111, -0.008), (1.42, 0.181, 0.099, 0.000),
    (1.465, 0.146, 0.084, 0.004), (1.495, 0.084, 0.064, 0.004), (1.515, 0.058, 0.054, 0.004),
]
SHOULDER = (0.166, 0.008, 1.402)
HEAD = Vector((0, -0.014, 1.642))


def materials():
    return dict(
        skin=mat("skin", "#e9b48f", rough=0.55, sss=0.15),
        hair=mat("hair", "#1d1714", rough=0.6),
        eye=mat("eye", "#f4f1ea", rough=0.2),
        iris=mat("iris", "#24170f", rough=0.1),
        lip=mat("lip", "#b46b5d", rough=0.5),
        shirt=mat("shirt", "#2c3a5c", rough=0.85),
        pants=mat("pants", "#273150", rough=0.85),
        vest=mat("vest", "#ff6a10", rough=0.65),
        tape=mat("tape", "#d9dfe6", rough=0.25, metal=0.35),
        helmet=mat("helmet", "#f6f6f2", rough=0.28, coat=0.6),
        red=mat("red", "#e4002b", rough=0.35),
        cap=mat("cap", "#d8102c", rough=0.7),
        harness=mat("harness", "#ffc928", rough=0.55),
        metal=mat("metal", "#c9cfd6", rough=0.25, metal=1.0),
        glove=mat("glove", "#f0bd2d", rough=0.75),
        boot=mat("boot", "#26211e", rough=0.45),
        sole=mat("sole", "#121110", rough=0.8),
        cover=mat("cover", "#8fc3ea", rough=0.6),
        gaiter=mat("gaiter", "#8c94a1", rough=0.8),
        gaiter_s=mat("gaiter_s", "#5d6572", rough=0.7),
        belt=mat("belt", "#161616", rough=0.5),
        dark=mat("darkgear", "#1f2226", rough=0.5),
        led=mat("led", "#ff2a1a", emit="#ff2a1a", strength=12),
        badge=mat("badge", "#f4f6f8", rough=0.4),
    )


def _cr(p0, p1, p2, p3, t):
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)


def torso_section(z):
    zs = [r[0] for r in TORSO]
    z = max(zs[0], min(zs[-1], z))
    for i in range(len(zs) - 1):
        if zs[i] <= z <= zs[i + 1]:
            t = (z - zs[i]) / (zs[i + 1] - zs[i])
            rows = [TORSO[max(i - 1, 0)], TORSO[i], TORSO[i + 1], TORSO[min(i + 2, len(TORSO) - 1)]]
            return tuple(_cr(*(r[k] for r in rows), t) for k in (1, 2, 3))
    return TORSO[-1][1:]


def torso_point(theta, z, off=0.0, n=2.6):
    rx, ry, cy = torso_section(z)
    c, s = math.cos(theta), math.sin(theta)
    sx = math.copysign(abs(c) ** (2 / n), c)
    sy = math.copysign(abs(s) ** (2 / n), s)
    return Vector(((rx + off) * sx, cy + (ry + off) * sy, z))


def _dir(flex, abd, side):
    v = Vector((side * math.sin(abd), -math.sin(flex) * math.cos(abd), -math.cos(flex) * math.cos(abd)))
    return v.normalized()


class Person:
    def __init__(self, name, pos=(0, 0, 0), face=0.0, lean=0.0, hip=HIP_Z, legs=None, arms=None, feet=None,
                 head=(0.0, 0.0), gear=None, ground=0.0):
        self.name = name
        self.M = Matrix.Translation(Vector(pos)) @ Matrix.Rotation(face, 4, "Z")
        dz = hip - HIP_Z
        piv = Vector((0, 0, PIVOT_Z + dz))
        self.U = self.M @ Matrix.Translation(Vector((0, 0, dz))) @ Matrix.Translation(Vector((0, 0, PIVOT_Z))) \
            @ Matrix.Rotation(lean, 4, "X") @ Matrix.Translation(Vector((0, 0, -PIVOT_Z)))
        self.hip = hip
        self.legs = legs or {"L": (0.02, 0.04, 0.0), "R": (0.02, 0.04, 0.0)}
        self.arms = arms or {"L": (0.05, 0.12, 0.12, 0.06), "R": (0.05, 0.12, 0.12, 0.06)}
        self.feet = feet or {"L": 0.0, "R": 0.0}
        self.head = head
        self.ground = ground
        self.g = dict(helmet=True, cap=False, alarm=False, harness=False, vest=True, gloves=True, gaiters=False,
                      covers=False, badge=False)
        self.g.update(gear or {})
        self.m = materials()
        self.anchors = {}
        self.objs = []

    # helpers in local frames
    def W(self, v):
        return self.M @ Vector(v)

    def Wu(self, v):
        return self.U @ Vector(v)

    def add(self, ob):
        self.objs.append(ob)
        return ob

    def build(self):
        self._legs()
        self._torso()
        self._arms()
        self._head()
        return self

    # ---------- legs and feet ----------
    def _legs(self):
        m = self.m
        for side_key, side in (("L", 1), ("R", -1)):
            flex, abd, shin = self.legs[side_key]
            H = Vector((side * 0.092, 0.0, self.hip))
            d1 = _dir(flex, abd, side)
            K = H + d1 * 0.44
            d2 = _dir(shin, abd * 0.5, side)
            A = K + d2 * 0.42
            Hw, Kw, Aw = self.W(H), self.W(K), self.W(A)
            th = [Hw.lerp(Kw, t) for t in (0, .3, .7, 1)]
            self.add(tube(f"{self.name}_thigh{side_key}", th, [0.088, 0.083, 0.071, 0.058], m["pants"]))
            sh = [Kw.lerp(Aw, t) for t in (0, .25, .6, 1)]
            self.add(tube(f"{self.name}_shin{side_key}", sh, [0.057, 0.059, 0.049, 0.043], m["pants"]))
            self.add(ellipsoid(f"{self.name}_knee{side_key}", Kw, (0.058,) * 3, m["pants"], segs=16, rings=10))
            if self.g["gaiters"]:
                g = [Kw.lerp(Aw, t) for t in (0.3, 0.6, 0.94)]
                self.add(tube(f"{self.name}_gaiter{side_key}", g, [0.064, 0.058, 0.054], m["gaiter"]))
                for t in (0.5, 0.8):
                    c0, c1 = Kw.lerp(Aw, t - 0.02), Kw.lerp(Aw, t + 0.02)
                    rr = 0.062 - 0.012 * t
                    self.add(tube(f"{self.name}_gstrap{side_key}{t}", [c0, c1], [rr, rr], m["gaiter_s"]))
            if self.g["harness"]:
                c0, c1 = Hw.lerp(Kw, 0.17), Hw.lerp(Kw, 0.25)
                self.add(tube(f"{self.name}_loop{side_key}", [c0, c1], [0.093, 0.091], m["harness"]))
            self._boot(side_key, A, self.feet[side_key])
            self.anchors[f"knee{side_key}"] = Kw
            self.anchors[f"shin{side_key}"] = Kw.lerp(Aw, 0.55)
            self.anchors[f"foot{side_key}"] = Aw

    def _boot(self, key, A, pitch):
        m = self.m
        f = Vector((0, -math.cos(pitch), math.sin(pitch)))
        up = Vector((0, -math.sin(pitch), -math.cos(pitch))) * -1
        center = A + f * 0.055 - up * 0.035
        R = Matrix((Vector((1, 0, 0)), f, up)).transposed()
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=14, radius=1.0)
        S = Matrix.Diagonal((0.054, 0.135, 0.058, 1))
        bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ R.to_4x4() @ S, verts=bm.verts)
        on_ground = abs(pitch) < 0.05 and A.z < 0.1
        if on_ground:
            for v in bm.verts:
                v.co.z = max(v.co.z, 0.012)
        bmesh.ops.transform(bm, matrix=self.M, verts=bm.verts)
        material = m["cover"] if self.g["covers"] else m["boot"]
        self.add(mesh_obj(f"{self.name}_boot{key}", bm, material))
        shaft = [self.W(A + Vector((0, 0.005, -0.03))), self.W(A + Vector((0, 0.005, 0.09)))]
        self.add(tube(f"{self.name}_shaft{key}", shaft, [0.05, 0.047], material))
        if on_ground and not self.g["covers"]:
            self.add(ellipsoid(f"{self.name}_sole{key}", self.W(Vector((center.x, center.y, 0.012))),
                               (0.056, 0.14, 0.012), m["sole"], rot=self.M.to_3x3() @ R, segs=20, rings=8))

    # ---------- torso, vest, harness ----------
    def _torso(self):
        m = self.m
        segs, zs = 40, [0.86 + (1.515 - 0.86) * i / 34 for i in range(35)]
        bm = bmesh.new()
        rings = [[bm.verts.new(self.Wu(torso_point(2 * math.pi * k / segs, z))) for k in range(segs)] for z in zs]
        for a, b in zip(rings, rings[1:]):
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
        bot = bm.verts.new(self.Wu(Vector((0, 0.01, 0.85))))
        top = bm.verts.new(self.Wu(Vector((0, 0.004, 1.52))))
        for k in range(segs):
            bm.faces.new((rings[0][(k + 1) % segs], rings[0][k], bot))
            bm.faces.new((rings[-1][k], rings[-1][(k + 1) % segs], top))
        # lower part is trousers
        for f in bm.faces:
            f.material_index = 1 if f.calc_center_median().z < self.Wu(Vector((0, 0, 0.985))).z else 0
        self.add(mesh_obj(f"{self.name}_torso", bm, [m["shirt"], m["pants"]]))
        self.add(self._band(0.955, 1.0, 0.006, m["belt"], "belt"))
        self.add(box(f"{self.name}_buckle", self.Wu(torso_point(-math.pi / 2, 0.978, 0.012)), (0.045, 0.01, 0.034), m["metal"],
                     rot=self.U.to_3x3(), bevel=0.003))
        if self.g["vest"]:
            self._vest()
        elif self.g["badge"]:
            p = torso_point(-math.pi / 2 + 0.55, 1.29, 0.004)
            self.add(box(f"{self.name}_badge", self.Wu(p), (0.05, 0.004, 0.07), m["badge"], rot=self.U.to_3x3() @ Matrix.Rotation(0.4, 3, "Z")))
            self.add(box(f"{self.name}_badge2", self.Wu(p + Vector((0, -0.003, 0.026))), (0.05, 0.003, 0.016), m["red"], rot=self.U.to_3x3() @ Matrix.Rotation(0.4, 3, "Z")))
        if self.g["harness"]:
            self._harness()
        self.anchors["chest"] = self.Wu(torso_point(-math.pi / 2, 1.24, 0.03))
        self.anchors["back"] = self.Wu(torso_point(math.pi / 2, 1.25, 0.03))
        self.anchors["waist"] = self.Wu(torso_point(-math.pi / 2, 1.0, 0.03))
        self.anchors["hipSide"] = self.Wu(torso_point(0.0, 1.0, 0.03))

    def _band(self, z0, z1, off, material, name, segs=48):
        bm = bmesh.new()
        rows = [[bm.verts.new(self.Wu(torso_point(2 * math.pi * k / segs, z, off))) for k in range(segs)] for z in (z0, (z0 + z1) / 2, z1)]
        for a, b in zip(rows, rows[1:]):
            for k in range(segs):
                bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
        return mesh_obj(f"{self.name}_{name}", bm, material)

    def _vest(self):
        m = self.m
        def top(theta):
            c, s = abs(math.cos(theta)), math.sin(theta)
            z = 1.435 - 0.14 * c ** 1.5
            if s < 0:
                z = min(z, 1.2 + 0.23 * c / 0.5)
            if c > 0.7:
                z = min(z, 1.27 + (1 - c) * 0.3)
            return z
        cols, rows = 180, 28
        bm = bmesh.new()
        grid = []
        for k in range(cols):
            th = 2 * math.pi * k / cols
            zt = top(th)
            grid.append([bm.verts.new(self.Wu(torso_point(th, 1.0 + (zt - 1.0) * i / rows, 0.014))) for i in range(rows + 1)])
        for k in range(cols):
            a, b = grid[k], grid[(k + 1) % cols]
            for i in range(rows):
                bm.faces.new((a[i], b[i], b[i + 1], a[i + 1]))
        ob = self.add(mesh_obj(f"{self.name}_vest", bm, m["vest"], mods=[("SOLIDIFY", {"thickness": 0.006, "offset": 1.0})]))
        for z0, z1 in ((1.105, 1.135), (1.185, 1.215)):
            self.add(self._band(z0, z1, 0.0215, m["tape"], f"tape{z0}"))
        zip_pts = [self.Wu(torso_point(-math.pi / 2, z, 0.02)) for z in (1.0, 1.1, 1.2)]
        self.add(tube(f"{self.name}_zip", zip_pts, [0.003] * 3, m["dark"], segs=8))
        return ob

    def _strap(self, way, name, width=0.042, off=0.026, material=None):
        pts = []
        for (t0, z0), (t1, z1) in zip(way, way[1:]):
            for i in range(12):
                u = i / 12
                pts.append((t0 + (t1 - t0) * u, z0 + (z1 - z0) * u))
        pts.append(way[-1])
        P = [torso_point(t, z, off) for t, z in pts]
        bm = bmesh.new()
        rows = []
        for i, (t, z) in enumerate(pts):
            T = (P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]).normalized()
            dt = (torso_point(t + 0.02, z, off) - torso_point(t - 0.02, z, off))
            dzv = (torso_point(t, z + 0.01, off) - torso_point(t, z - 0.01, off))
            N = dt.cross(dzv).normalized()
            if N.dot(P[i] - Vector((0, torso_section(z)[2], z))) < 0:
                N = -N
            B = T.cross(N).normalized()
            rows.append([bm.verts.new(self.Wu(P[i] + B * width / 2)), bm.verts.new(self.Wu(P[i] - B * width / 2))])
        for a, b in zip(rows, rows[1:]):
            bm.faces.new((a[0], a[1], b[1], b[0]))
        return self.add(mesh_obj(f"{self.name}_{name}", bm, material or self.m["harness"], mods=[("SOLIDIFY", {"thickness": 0.004})]))

    def _harness(self):
        m, pi = self.m, math.pi
        self._strap([(-pi / 2 + 0.62, 1.44), (-pi / 2 - 0.85, 1.01)], "hxf1")
        self._strap([(-pi / 2 - 0.62, 1.44), (-pi / 2 + 0.85, 1.01)], "hxf2")
        self._strap([(pi / 2 - 0.62, 1.44), (pi / 2 + 0.85, 1.01)], "hxb1")
        self._strap([(pi / 2 + 0.62, 1.44), (pi / 2 - 0.85, 1.01)], "hxb2")
        self.add(self._band(0.97, 1.02, 0.03, m["harness"], "hwaist"))
        c = torso_point(-pi / 2, 1.235, 0.034)
        self.add(box(f"{self.name}_plate", self.Wu(c), (0.05, 0.012, 0.045), m["metal"], rot=self.U.to_3x3(), bevel=0.004))
        b = torso_point(pi / 2, 1.24, 0.045)
        ring = curve_tube(f"{self.name}_dring", [self.Wu(b + Vector((x, 0.0, zz))) for x, zz in
                                                ((-0.02, 0.0), (-0.016, 0.022), (0.0, 0.032), (0.016, 0.022), (0.02, 0.0), (0.0, -0.006), (-0.02, 0.0))], 0.005, m["metal"])
        self.add(ring)
        self.anchors["dring"] = self.Wu(b)

    # ---------- arms and hands ----------
    def _arms(self):
        m = self.m
        for key, side in (("L", 1), ("R", -1)):
            flex, abd, flex2, abd2 = self.arms[key]
            S = Vector((side * SHOULDER[0], SHOULDER[1], SHOULDER[2]))
            E = S + _dir(flex, abd, side) * 0.30
            d2 = _dir(flex2, abd2, side)
            Wr = E + d2 * 0.265
            Sw, Ew, Ww = self.Wu(S), self.Wu(E), self.Wu(Wr)
            self.add(ellipsoid(f"{self.name}_delt{key}", self.Wu(S + Vector((side * 0.004, 0, -0.006))), (0.052, 0.056, 0.056), m["shirt"], segs=18, rings=12))
            self.add(tube(f"{self.name}_uarm{key}", [Sw.lerp(Ew, t) for t in (0, .4, 1)], [0.055, 0.05, 0.044], m["shirt"]))
            self.add(ellipsoid(f"{self.name}_elbow{key}", Ew, (0.046,) * 3, m["shirt"], segs=14, rings=10))
            self.add(tube(f"{self.name}_farm{key}", [Ew.lerp(Ww, t) for t in (0, .3, .85, 1)], [0.046, 0.047, 0.038, 0.037], m["shirt"]))
            dw = (Ww - Ew).normalized()
            lat = self.U.to_3x3() @ Vector((1, 0, 0))
            wv = dw.cross(lat)
            if wv.length < 0.2:
                wv = dw.cross(self.U.to_3x3() @ Vector((0, 1, 0)))
            wv.normalize()
            tv = dw.cross(wv).normalized()
            R = Matrix((tv, wv, dw)).transposed()
            hm = m["glove"] if self.g["gloves"] else m["skin"]
            hc = Ww + dw * 0.07
            self.add(ellipsoid(f"{self.name}_hand{key}", hc, (0.025, 0.045, 0.075), hm, rot=R, segs=18, rings=12))
            th = Ww + dw * 0.04 + wv * 0.033 + tv * side * 0.012
            self.add(ellipsoid(f"{self.name}_thumb{key}", th, (0.017, 0.017, 0.036), hm, rot=R @ Matrix.Rotation(0.5, 3, "X"), segs=12, rings=8))
            if self.g["gloves"]:
                self.add(tube(f"{self.name}_cuff{key}", [Ww - dw * 0.012, Ww + dw * 0.03], [0.043, 0.041], hm))
            self.anchors[f"hand{key}"] = hc
            self.anchors[f"elbow{key}"] = Ew

    # ---------- head ----------
    def _head(self):
        m = self.m
        yaw, pitch = self.head
        Hm = self.U @ Matrix.Translation(HEAD) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Rotation(pitch, 4, "X")
        self.Hm = Hm
        neck = [self.Wu(Vector((0, 0.006, 1.47))), self.Wu(Vector((0, -0.002, 1.575)))]
        self.add(tube(f"{self.name}_neck", neck, [0.06, 0.056], m["skin"]))
        # skull with a tapered jaw
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=22, radius=1.0)
        for v in bm.verts:
            x, y, z = v.co
            if z < 0.15:
                k = (0.15 - z) / 1.15
                x *= 1 - 0.27 * k ** 1.2
                if y > 0:
                    y *= 1 - 0.3 * k
            if y < -0.55:
                y = -0.55 - (-y - 0.55) * 0.6
            if y > 0 and z > -0.1:
                y *= 1.05
            v.co = Vector((x * 0.08, y * 0.099, z * 0.113))
        bmesh.ops.transform(bm, matrix=Hm, verts=bm.verts)
        self.add(mesh_obj(f"{self.name}_skull", bm, m["skin"]))
        H = lambda v: Hm @ Vector(v)
        R3 = Hm.to_3x3().normalized()
        E = lambda name, c, r, mm, rot=None: self.add(ellipsoid(f"{self.name}_{name}", H(c), r, mm, rot=R3 @ (Matrix.Identity(3) if rot is None else rot), segs=16, rings=10))
        E("nose", (0, -0.0885, -0.004), (0.0105, 0.016, 0.025), m["skin"], Matrix.Rotation(-0.22, 3, "X"))
        E("nosetip", (0, -0.0975, -0.02), (0.0112, 0.0095, 0.0092), m["skin"])
        for s in (1, -1):
            E(f"eye{s}", (s * 0.03, -0.0795, 0.012), (0.0098, 0.0092, 0.0088), m["eye"])
            E(f"iris{s}", (s * 0.03, -0.0878, 0.0115), (0.0054, 0.0022, 0.0058), m["iris"])
            E(f"lid{s}", (s * 0.03, -0.0812, 0.0172), (0.0122, 0.0096, 0.0036), m["skin"])
            E(f"brow{s}", (s * 0.032, -0.0868, 0.031), (0.0168, 0.0042, 0.0034), m["hair"], Matrix.Rotation(s * 0.12, 3, "Y"))
            E(f"ear{s}", (s * 0.079, 0.006, 0.0), (0.0095, 0.019, 0.028), m["skin"])
        E("lip", (0, -0.0868, -0.05), (0.0185, 0.0042, 0.0042), m["lip"])
        # hair under the headwear
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=36, v_segments=22, radius=1.0)
        cut = []
        for v in bm.verts:
            x, y, z = v.co
            line = 0.48 if y < -0.35 else (0.48 - (y + 0.35) * 1.1 if y < 0.55 else -0.52)
            line -= 0.18 * max(0, abs(x) - 0.75) / 0.25 if -0.3 < y < 0.3 else 0
            if z < line:
                cut.append(v)
            v.co = Vector((x * 0.0815, y * 0.102, z * 0.121))
        bmesh.ops.delete(bm, geom=cut, context="VERTS")
        bmesh.ops.transform(bm, matrix=Hm @ Matrix.Translation(Vector((0, 0.002, 0.002))), verts=bm.verts)
        self.add(mesh_obj(f"{self.name}_hair", bm, m["hair"]))
        if self.g["helmet"]:
            self._helmet(Hm)
        elif self.g["cap"]:
            self._cap(Hm)
        self.anchors["head"] = H((0, -0.08, 0.0))
        self.anchors["face"] = H((0, -0.1, 0.0))

    def _shell(self, Hm, radii, center, material, name, zmin=0.0):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < zmin], context="VERTS")
        bmesh.ops.transform(bm, matrix=Hm @ Matrix.Translation(Vector(center)) @ Matrix.Diagonal((*radii, 1)), verts=bm.verts)
        return self.add(mesh_obj(f"{self.name}_{name}", bm, material, mods=[("SOLIDIFY", {"thickness": 0.004})]))

    def _helmet(self, Hm):
        m = self.m
        self._shell(Hm, (0.114, 0.134, 0.118), (0, 0.004, 0.03), m["helmet"], "helmet", -0.02)
        self._shell(Hm, (0.024, 0.14, 0.123), (0, 0.004, 0.03), m["red"], "ridge", 0.05)
        R3 = Hm.to_3x3().normalized()
        self.add(ellipsoid(f"{self.name}_brim", Hm @ Vector((0, -0.03, 0.028)), (0.12, 0.155, 0.006), m["helmet"], rot=R3 @ Matrix.Rotation(0.06, 3, "X"), segs=40, rings=10))
        strap = [Hm @ Vector(p) for p in ((-0.077, 0.006, 0.03), (-0.07, -0.028, -0.06), (0, -0.068, -0.12), (0.07, -0.028, -0.06), (0.077, 0.006, 0.03))]
        self.add(curve_tube(f"{self.name}_chin", strap, 0.0032, m["dark"]))
        if self.g["alarm"]:
            self.add(box(f"{self.name}_alarm", Hm @ Vector((0.118, 0.012, 0.072)), (0.026, 0.034, 0.038), m["dark"], rot=R3, bevel=0.004))
            self.add(ellipsoid(f"{self.name}_ledl", Hm @ Vector((0.132, -0.002, 0.082)), (0.006,) * 3, m["led"], segs=10, rings=6))
            self.anchors["alarm"] = Hm @ Vector((0.13, 0.012, 0.072))
        self.anchors["helmet"] = Hm @ Vector((0, -0.04, 0.13))

    def _cap(self, Hm):
        m = self.m
        self._shell(Hm, (0.091, 0.109, 0.097), (0, 0.004, 0.032), m["cap"], "cap", -0.02)
        R3 = Hm.to_3x3().normalized()
        self.add(ellipsoid(f"{self.name}_visor", Hm @ Vector((0, -0.118, 0.032)), (0.074, 0.064, 0.0065), m["cap"], rot=R3 @ Matrix.Rotation(-0.12, 3, "X"), segs=24, rings=8))
        self.anchors["helmet"] = Hm @ Vector((0, -0.02, 0.11))
