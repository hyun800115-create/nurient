"""
tr2_rails.py - the v4.2 loop rails and their props (docs/CONTRACT_V42.md section AK.2), rendered by tr2_render.py:

  rail_loop_ours / rail_loop_town   ground decals of the balloon loops (plan section 5.1): the spring turnout at
        T1 = L(-1, 0) / T2 = L(37, 0) (long switch ties, switch blades + tie bars, closure rails, frog, guard rails),
        the curves D -> T (R 1.75 cells), C -> D, the straight B -> C and the semicircle A -> B that joins the
        straight main line at A.  Same ballast / sleeper / rail / snow / shadow materials as town_rails (the straight
        pieces in the render ARE town_rails.segment(), unchanged).  The town loop is the world mirror in i, rendered
        on its own (the light does not mirror).
        The render R contains the straight main line too; tr2_pack.py turns it into the decal by difference
        matting against the real rail_x tiles drawn under it (decal over tiles == R where the loop / turnout is,
        == the tiles elsewhere), so the ballast meets the straight track at A and T with no seam.
  rail_fence_x / rail_fence_x_end   low snow fence tile along world X (owns the post at its -X end) + closing post
  rail_switch_stand                 switch lever + lamp on a post, frames idle_0 (green) / idle_1 (yellow, thrown)
  rail_water_tower                  small wooden water tower for the loop infield, idle + pour 6 f

Coordinates: world metres, origin = the sprite anchor (decals: the turnout point T on the track centre line).
Lattice: one cell = sqrt(2) m along world X (i) and Y (j); +j = sea side = screen up-right.
"""
import json
import math
import os
import time
from collections import OrderedDict

import bpy
import bmesh
from mathutils import Vector

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob, tonal
import prop_assets as PA
import life_assets as LA
import town_rails as TRL           # read-only reuse: segment(), ballast_mat()

SEG = math.sqrt(2.0)
GAUGE = 0.9
RAIL_TOP = 0.15
RC = 1.75                          # curve radius in cells
RAD = RC * SEG                     # 2.4749 m
ITEMS = OrderedDict()
DARK = '#2B2F3A'


def item(key, kind, **kw):
    def deco(fn):
        ITEMS[key] = dict(key=key, kind=kind, fn=fn, **kw)
        return fn
    return deco


# =========================================================================== loop geometry (pure maths)

LOOPS = OrderedDict([
    ('rail_loop_ours', dict(T=(-1, 0), mirror=1, tiles=list(range(-6, 3)), turnout='T1', ends='A')),
    ('rail_loop_town', dict(T=(37, 0), mirror=-1, tiles=list(range(34, 42)), turnout='T2', ends="A'")),
])
# the loop in lattice cells relative to the turnout T, for OUR end (the town end mirrors x)
PATH_CELLS = [('arc', (0.0, RC), RC, -90.0, -180.0),          # T -> D
              ('arc', (-2 * RC, RC), RC, 0.0, 90.0),            # D -> C
              ('line', (-2 * RC, 2 * RC), (-2 * RC - 1.5, 2 * RC)),   # C -> B (1.5 cells)
              ('arc', (-2 * RC - 1.5, RC), RC, 90.0, 270.0)]    # B -> A (semicircle)
A_CELLS = -2 * RC - 1.5            # A = (-5, 0) cells from T
NAMED = {'T': (0.0, 0.0), 'D': (-RC, RC), 'C': (-2 * RC, 2 * RC), 'B': (A_CELLS, 2 * RC), 'A': (A_CELLS, 0.0),
         'leftmost': (A_CELLS - RC, RC)}


def loop_path(mirror, step=0.03):
    """Sampled loop centre line T -> D -> C -> B -> A in metres from T: list of (P, tangent, s)."""
    pts = []
    s = 0.0
    for seg in PATH_CELLS:
        if seg[0] == 'arc':
            _, c, r, a0, a1 = seg
            ln = abs(math.radians(a1 - a0)) * r * SEG
            n = max(2, int(math.ceil(ln / step)))
            for k in range(n + (1 if seg is PATH_CELLS[-1] else 0)):
                a = math.radians(a0 + (a1 - a0) * k / n)
                p = Vector(((c[0] + r * math.cos(a)) * SEG, (c[1] + r * math.sin(a)) * SEG))
                sg = 1 if a1 > a0 else -1
                t = Vector((-math.sin(a) * sg, math.cos(a) * sg))
                pts.append([p, t, s + ln * k / n])
            s += ln
        else:
            _, p0, p1 = seg
            a, b = Vector(p0) * SEG, Vector(p1) * SEG
            ln = (b - a).length
            n = max(2, int(math.ceil(ln / step)))
            t = (b - a).normalized()
            for k in range(n):
                pts.append([a + (b - a) * (k / n), t, s + ln * k / n])
            s += ln
    for q in pts:
        q[0].x *= mirror
        q[1].x *= mirror
    return pts


def path_at(path, s):
    """Interpolated (P, tangent) at arc length s."""
    lo, hi = 0, len(path) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if path[mid][2] <= s:
            lo = mid
        else:
            hi = mid
    a, b = path[lo], path[hi]
    f = 0.0 if b[2] == a[2] else (s - a[2]) / (b[2] - a[2])
    return a[0].lerp(b[0], f), a[1].lerp(b[1], f).normalized()


def nrm(t):
    return Vector((-t.y, t.x))


def curve_offset(u):
    """Distance of the T -> D curve centre line from the straight at |u| m from T (u <= RAD)."""
    u = min(abs(u), RAD)
    return RAD - math.sqrt(RAD * RAD - u * u)


def frog_u():
    """|u| of the crossing of the curve's outer rail (radius RAD + g/2) with the straight's +Y rail."""
    r = RAD + GAUGE / 2
    dy = RAD - GAUGE / 2
    return math.sqrt(r * r - dy * dy)


def tie_reach(d):
    """How far (+Y) a switch tie at |u| = d must reach: past the curve rails that cross that line."""
    ys = []
    for r, extra in ((RAD - GAUGE / 2, 0.18), (RAD + GAUGE / 2, 0.25)):
        if d <= r:
            ys.append(RAD - math.sqrt(r * r - d * d) + extra)
    return max(ys) if ys else 0.0


# turnout layout (|u| in metres from T toward the loop): long switch ties at the straight's own sleeper positions
TIE_U = [SEG * c for c in (1 / 6.0, 0.5, 5 / 6.0, 7 / 6.0, 1.5)]
TURNOUT_U = (-0.05, 2.36)          # repaint zone on the main line (|u| from T)


# =========================================================================== mesh builders

def ribbon(name, path, profile, mat, s0=None, s1=None):
    """Swept cross-section along the path: profile = [(n_offset, z), ...] (open strip)."""
    bm = bmesh.new()
    rows = []
    for P, T, s in path:
        if (s0 is not None and s < s0) or (s1 is not None and s > s1):
            continue
        N = nrm(T)
        rows.append([bm.verts.new((P.x + N.x * o, P.y + N.y * o, z)) for o, z in profile])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(len(profile) - 1):
            bm.faces.new((r0[k], r0[k + 1], r1[k + 1], r1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    return L.finish(name, bm, [mat], smooth=True)


def swept_box(name, path, off, w, z0, z1, mat, s0=None, s1=None, bevel=0.0):
    """Rail-like bar of section w x (z1 - z0) swept along the path at normal offset `off`.  bevel > 0: the same
    angle-limited bevel as prop_lib.box (town_rails' rail heads: the bright rail-top highlight line)."""
    prof = [(off - w / 2, z0), (off - w / 2, z1), (off + w / 2, z1), (off + w / 2, z0)]
    bm = bmesh.new()
    rows = []
    for P, T, s in path:
        if (s0 is not None and s < s0) or (s1 is not None and s > s1):
            continue
        N = nrm(T)
        rows.append([bm.verts.new((P.x + N.x * o, P.y + N.y * o, z)) for o, z in prof])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k]))
    if len(rows) > 1:
        bm.faces.new(list(reversed(rows[0])))
        bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0:
        return L.finish(name, bm, [mat], bevel=bevel, segs=3)
    return L.finish(name, bm, [mat], smooth=False)


def rail_set(name, path, off, s0=None, s1=None, steel=None):
    """foot + web + head like town_rails.segment (rail head at RAIL_TOP)."""
    steel = steel or flat('#AEB8C4', 0.28, 0.75)
    dark = flat('#5A606B', 0.5, 0.5)
    # (polish L1) bevelled like the straight rail_x rails (town_rails: foot / web 0.003, head 0.006), so the curved
    # rails carry the same bright rail-top highlight and the tone does not change at A / T
    return [swept_box(name + '_f', path, off, 0.12, 0.095, 0.115, dark, s0, s1, bevel=0.003),
            swept_box(name + '_w', path, off, 0.04, 0.11, 0.14, dark, s0, s1, bevel=0.003),
            swept_box(name + '_h', path, off, 0.075, RAIL_TOP - 0.025, RAIL_TOP, steel, s0, s1, bevel=0.006)]


def sub_path(path, s0, s1):
    return [q for q in path if s0 <= q[2] <= s1]


def offset_path(path, off):
    return [[P + nrm(T) * off, T, s] for P, T, s in path]


# =========================================================================== loop decal scene

def straight_segments(spec, keep):
    """town_rails.segment() pieces at the real tile positions (identical geometry to the rail_x tiles).
    keep(obj_name, u, y) -> False drops a piece (sleepers replaced by switch ties, shoulder decor under the loop)."""
    iT = spec['T'][0]
    for k in spec['tiles']:
        uc = (k + 0.5 - iT) * SEG
        with L.Collect() as c:
            objs = TRL.segment(0, 'plain')
        for o in c.objs:
            if o.parent is None:
                o.location.x += uc
        bpy.context.view_layer.update()
        for o in list(c.objs):
            if o.parent is not None:
                continue
            nm = o.name.split('.')[0]
            if not keep(nm, o.location.x, o.location.y):
                for ch in list(o.children_recursive):
                    bpy.data.objects.remove(ch, do_unlink=True)
                bpy.data.objects.remove(o, do_unlink=True)
        del objs


def build_loop(key):
    spec = LOOPS[key]
    mx = spec['mirror']
    path = loop_path(mx)
    s_end = path[-1][2]
    uA = mx * A_CELLS * SEG
    # (polish L1) the swept loop bed is shaded with up-facing normals across its whole top, the straight extruded
    # bed (town_rails) with corner normals averaged into its end caps: the same snowy() mix then reads ~10 levels
    # lighter on the loop. Shift the snow threshold so the loop bed matches the straight tiles' tone at the joints.
    lballast = L.snowy('#8C8784', lo=1.05, hi=1.29, noise_amt=0.7, noise_scale=6.0, rough=0.95)
    wood = tonal('#8A5A33', 0.12, 5.0, rough=0.85)
    dark = flat('#5A606B', 0.5, 0.5)
    iron = flat('#3D424C', 0.45, 0.5)
    tz0, tz1 = TURNOUT_U

    def keep(nm, u, y):
        uu = u * mx                       # |u| toward the loop side is negative for ours -> use -uu
        d = -uu
        if nm.startswith('slp') and tz0 <= d <= tz1:
            return False                  # replaced by the long switch ties (same positions)
        if (nm.startswith('bsn') or nm.startswith('grav')) and y > 0 and 0.15 <= d <= 2.45:
            return False                  # the curve's ballast covers the +Y shoulder here
        return True
    straight_segments(spec, keep)
    objs = []
    # ---- curved route ballast (2 mm under the straight's top so the turnout overlap stays clean)
    prof = [(-0.86, 0.0), (-0.7, 0.048), (0.7, 0.048), (0.86, 0.0)]
    objs.append(ribbon('lballast', path, prof, lballast))
    # ---- rails along the whole loop (inner / outer), fishplates every SEG from A (phase of the straight)
    for side, off in (('o', GAUGE / 2), ('i', -GAUGE / 2)):
        objs += rail_set('lrail_' + side, path, off)
    n = 0
    while True:
        s = s_end - n * SEG
        if s < 0.6:
            break
        P, T = path_at(path, s)
        for off in (GAUGE / 2, -GAUGE / 2):
            q = P + nrm(T) * off
            objs.append(box('lfish', (0.12, 0.1, 0.035), (q.x, q.y, 0.1), rot=(0, 0, math.degrees(math.atan2(T.y, T.x))),
                            mat=dark, bevel=0.008, origin='center'))
        n += 1
    # ---- sleepers on the loop: every SEG/3 of arc length, phase-continuous with the straight at A
    s_first = 2.62                         # below this the switch ties carry the curve (no crossing sleepers)
    snow_k = 0
    n = 0
    while True:
        s = s_end - SEG / 6 - n * SEG / 3
        if s < s_first:
            break
        P, T = path_at(path, s)
        a = math.degrees(math.atan2(T.y, T.x))
        objs.append(box('lslp', (0.18, 1.32, 0.06), (P.x, P.y, 0.035), rot=(0, 0, a), mat=wood, bevel=0.015))
        N = nrm(T)
        o = 0.45 if n % 2 else -0.5
        q = P + N * o
        objs.append(L.snow_slab('lslps%d' % n, 0.12, 0.22, 0.025, (q.x, q.y, 0.095), rot=(0, 0, a), seed=30 + n % 3))
        snow_k += 1
        n += 1
    # ---- switch ties under both routes (perpendicular to the straight, at the straight's sleeper positions)
    for k, d in enumerate(TIE_U):
        u = -mx * d
        y_hi = max(0.66, tie_reach(d))
        objs.append(box('stie%d' % k, (0.18, y_hi + 0.66, 0.06), (u, (y_hi - 0.66) / 2, 0.035), mat=wood, bevel=0.015))
        if k % 2 == 0:
            objs.append(L.snow_slab('sties%d' % k, 0.12, 0.24, 0.025, (u, -0.5, 0.095), seed=40 + k))
        if k < 2:                          # slide chairs under the switch blades
            for y in (-GAUGE / 2 + 0.06, GAUGE / 2 - 0.06):
                objs.append(box('chair', (0.15, 0.16, 0.012), (u, y, 0.095), mat=iron, bevel=0.003))
    # ---- switch blades (bright, slightly tapered), tie bars reaching to the lever side (-Y)
    blade = flat('#D3DBE4', 0.22, 0.8)
    bl_len = 0.95
    for sgn in (-1, 1):                    # blade along the straight's inner side of each stock rail
        y_tip = sgn * (GAUGE / 2 - 0.05)
        y_heel = sgn * (GAUGE / 2 - 0.085) if sgn > 0 else sgn * (GAUGE / 2 - 0.05)
        bm = bmesh.new()
        u0, u1 = -mx * 0.02, -mx * bl_len
        w0, w1 = 0.012, 0.05
        vs = [bm.verts.new(v) for v in ((u0, y_tip - w0 / 2, 0.11), (u0, y_tip + w0 / 2, 0.11),
                                        (u1, y_heel + w1 / 2, 0.11), (u1, y_heel - w1 / 2, 0.11))]
        vt = [bm.verts.new((v.co.x, v.co.y, 0.148)) for v in vs]
        bm.faces.new(vs[::-1])
        bm.faces.new(vt)
        for i in range(4):
            bm.faces.new((vs[i], vs[(i + 1) % 4], vt[(i + 1) % 4], vt[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        objs.append(L.finish('blade', bm, [blade], smooth=False))
    for k, d in enumerate((0.1, 0.42)):
        u = -mx * d
        objs.append(box('tiebar%d' % k, (0.035, 1.55 if k == 0 else 1.0, 0.028),
                        (u, -0.95 + (1.55 if k == 0 else 1.0) / 2, 0.112), mat=iron, bevel=0.006))
    # ---- frog (crossing of the curve's outer rail and the straight's +Y rail) + guard rails
    uf = frog_u()
    pf = Vector((-mx * uf, GAUGE / 2))
    s_f = min(path, key=lambda q: (q[0] + nrm(q[1]) * (mx * GAUGE / 2) - pf).length)[2]
    Pf, Tf = path_at(path, s_f)
    ang_c = math.degrees(math.atan2(Tf.y, Tf.x))
    ang_s = 180.0 if mx > 0 else 0.0
    bis = (ang_c + ang_s) / 2.0 if abs(ang_c - ang_s) < 180 else (ang_c + ang_s) / 2.0 + 180
    objs.append(box('frog', (0.62, 0.2, 0.016), (pf.x, pf.y, 0.094), rot=(0, 0, bis), mat=flat('#4A505A', 0.45, 0.55),
                    bevel=0.01, origin='center'))
    objs.append(box('frognose', (0.3, 0.06, 0.05), (pf.x - mx * 0.12, pf.y + 0.02, 0.11), rot=(0, 0, bis),
                    mat=flat('#C3CCD6', 0.25, 0.8), bevel=0.01, origin='center'))
    gpath = [[Vector((-mx * u, -GAUGE / 2 + 0.085)), Vector((-mx, 0.0)), u] for u in
             [uf - 0.36 + 0.72 * k / 12 for k in range(13)]]
    objs += rail_set('guard_s', gpath, 0.0)
    sub = sub_path(path, s_f - 0.36, s_f + 0.36)
    objs += rail_set('guard_c', sub, mx * (-GAUGE / 2 + 0.1))
    # ---- shoulders of the loop: gravel lumps + snow drifts (seeded), not on the straight main line
    rnd = L.rng(1234 if mx > 0 else 4321)
    s = 0.6
    while s < s_end - 0.1:
        for j in range(6):
            ss = s + rnd.uniform(0, SEG)
            if ss >= s_end:
                continue
            P, T = path_at(path, ss)
            side = 1 if j % 2 else -1
            q = P + nrm(T) * side * rnd.uniform(0.62, 0.8)
            if abs(q.y) < 1.0 and mx * q.x > mx * uA - 0.05:
                continue
            objs.append(blob('lgrav', rnd.uniform(0.05, 0.08), (q.x, q.y, 0.04), flat('#7D7874', 0.9),
                             scale=(1.3, 1.0, 0.6), seed=j, amp=0.3, subdiv=1, facet=True))
        for j in range(3):
            ss = s + (j + 0.3) * SEG / 3
            if ss >= s_end:
                continue
            P, T = path_at(path, ss)
            side = -1 if j % 2 else 1
            q = P + nrm(T) * side * rnd.uniform(0.82, 0.92)
            if abs(q.y) < 1.0 and mx * q.x > mx * uA - 0.05:
                continue
            a = math.degrees(math.atan2(T.y, T.x))
            objs.append(LA.snow_drift('ldrift', rnd.uniform(0.16, 0.22), (q.x, q.y, 0.0), seed=20 + j,
                                      scale=(1.6, 0.8, 0.3)))
            objs[-1].rotation_euler.z = math.radians(a)
        s += SEG
    # a soft drift in the V between the two routes beyond the frog
    q = Vector((-mx * (uf + 0.7), 1.05))
    objs.append(LA.snow_drift('vdrift', 0.2, (q.x, q.y, 0.0), seed=77, scale=(1.8, 0.7, 0.3)))
    return path, objs


def loop_frame(path, mirror):
    """Frame + anchor (= T) covering the loop ground band (+-1.3 m), the turnout end and the joint at A."""
    xs, ys = [], []
    pts = []
    for P, T, s in path[::4]:
        N = nrm(T)
        for o in (-1.3, 1.3):
            pts.append(P + N * o)
    for u in (-0.2, 0.6):
        for y in (-1.3, 1.3):
            pts.append(Vector((mirror * u, y)))
    uA = mirror * A_CELLS * SEG
    for u in (uA, uA + mirror * 0.8):
        for y in (-1.3, 1.3):
            pts.append(Vector((u, y)))
    for p in pts:
        for z in (0.0, 0.2):
            x, y = L.screen_xy((p.x, p.y, z))
            xs.append(x)
            ys.append(y)
    m = 8
    ax = int(math.ceil(-min(xs) + m))
    ay = int(math.ceil(-min(ys) + m))
    w = (int(math.ceil(ax + max(xs) + m + 6)) + 3) // 4 * 4
    h = (int(math.ceil(ay + max(ys) + m + 4)) + 3) // 4 * 4
    return w, h, (ax, ay)


def render_loop(key, opts):
    spec = LOOPS[key]
    cache = opts['cache']
    png = os.path.join(cache, key + '.png')
    side = os.path.join(cache, key + '.json')
    if not opts.get('force') and os.path.exists(png) and os.path.exists(side):
        print('[%s] cached' % key)
        return
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    path, objs = build_loop(key)
    W, H, anchor = loop_frame(path, spec['mirror'])
    bc.add_shadow_catcher(size=40.0)
    sc = bc.setup_render(W, H, samples=opts.get('samples') or 64)
    sc.cycles.max_bounces = 4
    bc.setup_camera(W, H, anchor)
    tmp = png[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, png)
    mx = spec['mirror']
    poly = [[round(P.x, 3), round(P.y, 3)] for P, T, s in path[::5]] + [[round(path[-1][0].x, 3),
                                                                         round(path[-1][0].y, 3)]]
    named = {n: [round(mx * c[0] * SEG, 4), round(c[1] * SEG, 4)] for n, c in NAMED.items()}
    meta = {'build': key, 'kind': 'decal', 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 6), round(anchor[1] / H, 6)], 'mirror': mx, 'T': spec['T'],
            'tiles': spec['tiles'], 'pathM': poly, 'pathLengthM': round(path[-1][2], 4), 'pointsM': named,
            'turnoutU': [mx * -TURNOUT_U[0], mx * -TURNOUT_U[1]], 'uA': round(mx * A_CELLS * SEG, 4),
            'frogM': [round(-mx * frog_u(), 4), GAUGE / 2], 'tieU': [round(-mx * d, 4) for d in TIE_U],
            'railTopM': RAIL_TOP, 'gaugeM': GAUGE, 'radiusM': round(RAD, 4)}
    with open(side, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %.1fs' % (key, W, H, anchor, time.time() - t0), flush=True)


for _k in LOOPS:
    ITEMS[_k] = dict(key=_k, kind='loop')


# =========================================================================== props (baked shadow like the buildings)

def wood_mat():
    return tonal('#8A6440', 0.14, 6.0, rough=0.85)


def fence_segment(name, cam=True):
    """One sqrt(2) m snow-fence segment along X centred on the origin; post at the -X end."""
    h = SEG / 2
    w = wood_mat()
    post = tonal('#6E4E33', 0.12, 6.0, rough=0.85)
    objs = [box(name + '_post', (0.09, 0.09, 0.62), (-h, 0, 0), mat=post, bevel=0.02),
            PA.snow_cap(name + '_pcap', 0.065, (-h, 0, 0.63), 0.04, 3),
            box(name + '_r1', (SEG, 0.045, 0.1), (0, 0.0, 0.18), mat=w, bevel=0.015),
            box(name + '_r2', (SEG, 0.045, 0.1), (0, 0.0, 0.42), mat=w, bevel=0.015),
            L.snow_slab(name + '_sn', SEG * 0.8, 0.07, 0.03, (0.06, 0.0, 0.52), seed=5),
            L.snow_slab(name + '_sn2', SEG * 0.45, 0.06, 0.02, (-0.2, 0.0, 0.28), seed=6),
            LA.snow_drift(name + '_drift', 0.2, (0.25, -0.06, 0.0), seed=8, scale=(1.9, 0.7, 0.32))]
    for o in objs:
        if not cam:
            o.visible_camera = False
    return objs


@item('rail_fence_x', 'tile', fp=(SEG, 0.2), catcher=8.0, samples=48,
      notes='Low snow fence tile along world X (one grid cell = sqrt(2) m, step (64, 32) px): weathered wooden posts '
            'with snow caps and two plank rails with snow on top, a little drift at the foot (~0.6 m). The tile owns '
            'the post at its -X end; chain tiles at stepPx and close the run with rail_fence_x_end (the post at the '
            '+X end of the last tile). Shadows join seamlessly (partition-of-unity cut like the rails). Depth-sort '
            'with the actors by anchor y (it hides the lower wheels of a train standing behind it).')
def b_fence():
    fence_segment('seg')
    for k, off in enumerate((-1, 1)):                      # neighbours: shadow only (continuous shadow)
        for o in fence_segment('nb%d' % k, cam=False):
            o.location.x += off * SEG
    return {'extra': {'tileAxis': 'x', 'segM': round(SEG, 5), 'stepPx': [64, 32], 'postEnd': '-x',
                      'tileLayer': 'objects', 'heightM': 0.66}}


@item('rail_fence_x_end', 'tile', fp=('r', 0.08), catcher=6.0, samples=48,
      notes='Closing post of a rail_fence_x run (place it at the +X end of the last tile = last tile anchor + '
            '(32, 16) px).')
def b_fence_end():
    post = tonal('#6E4E33', 0.12, 6.0, rough=0.85)
    box('post', (0.09, 0.09, 0.62), (0, 0, 0), mat=post, bevel=0.02)
    PA.snow_cap('pcap', 0.065, (0, 0, 0.63), 0.04, 3)
    LA.snow_drift('drift', 0.12, (0.05, -0.05, 0.0), seed=9, scale=(1.2, 0.9, 0.35))
    return {}


SW_LENS = {}


@item('rail_switch_stand', 'prop', fp=('r', 0.3), catcher=6.0, samples=64, frames=['idle_0', 'idle_1'],
      notes='Switch stand of the spring turnout (~0.9 m): two timber blocks, a black post with a red-and-white '
            'weighted throw lever at its foot and a lamp box on top. idle_0 = lamp green (set for the straight '
            'route, lever down to the left), idle_1 = lamp yellow (the train trails through, lever thrown). '
            'The game flips them with sfx_switch_clack; lampPoint = lens centre (night glow).')
def b_switch_stand():
    wood = tonal('#8A5A33', 0.12, 5.0, rough=0.85)
    iron = flat('#2B2F3A', 0.45, 0.5)
    for y in (-0.12, 0.12):
        box('block', (0.5, 0.14, 0.08), (0, y, 0), mat=wood, bevel=0.015)
    box('plate', (0.22, 0.3, 0.03), (0, 0, 0.08), mat=iron, bevel=0.008)
    cyl('post', 0.035, 0.66, (0, 0, 0.1), mat=iron, segs=14)
    # lamp box with round lenses on four sides
    box('lampbox', (0.15, 0.15, 0.17), (0, 0, 0.74), mat=iron, bevel=0.025)
    cyl('lampcap', 0.06, 0.06, (0, 0, 0.91), mat=iron, segs=14, r_top=0.03, bevel=0.01)
    cyl('chim', 0.018, 0.05, (0, 0, 0.96), mat=iron, segs=8)
    green = L.emissive('lens_g', '#7DF29A', '#4BE07A', 0.0)
    yellow = L.emissive('lens_y', '#FFD86A', '#FFC83D', 0.0)
    SW_LENS.clear()
    SW_LENS['g'], SW_LENS['y'] = green, yellow
    lenses = {}
    for k, (dx, dy, ax) in enumerate(((0.078, 0, 'x'), (-0.078, 0, 'x'), (0, 0.078, 'y'), (0, -0.078, 'y'))):
        rot = (0, 90, 0) if ax == 'x' else (90, 0, 0)
        cyl('rim%d' % k, 0.055, 0.02, (dx, dy, 0.825), rot=rot, mat=flat('#F2C14E', 0.3, 0.7), segs=18,
            origin='center')
        lenses[k] = cyl('lens%d' % k, 0.043, 0.026, (dx * 1.04, dy * 1.04, 0.825), rot=rot, mat=green, segs=18,
                        origin='center')
    PA.snow_cap('lsnow', 0.06, (0, 0, 0.92), 0.025, 11)
    # throw lever (pivot at the post foot), weighted red-and-white handle
    piv = bpy.data.objects.new('lever', None)
    bpy.context.scene.collection.objects.link(piv)
    piv.location = (0, -0.06, 0.16)
    with L.Collect() as c:
        box('arm', (0.035, 0.035, 0.42), (0, 0, 0), mat=iron, bevel=0.008)
        cyl('grip', 0.03, 0.12, (0, 0, 0.42), mat=L.stripes('#D9483B', '#F4F1EA', 22.0, 'Z', soft=0.02), segs=12,
            bevel=0.01)
        box('weight', (0.09, 0.06, 0.07), (0, 0, 0.14), mat=flat('#D9483B', 0.5), bevel=0.012)
    for o in c.objs:
        if o.parent is None:
            o.parent = piv

    def state(i):
        on = i == 0
        for k, o in lenses.items():
            o.data.materials[0] = green if on else yellow
        L.set_emission(green, 3.2 if on else 0.0)
        L.set_emission(yellow, 0.0 if on else 3.2)
        piv.rotation_euler = (0.0, math.radians(-62 if on else 62), 0.0)
    return {'frames': state, 'fx': {'lamp': (0.0, -0.08, 0.825)}}


@item('rail_water_tower', 'prop', fp=(1.6, 1.6), catcher=10.0, samples=48,
      frames=['idle', 'pour_0', 'pour_1', 'pour_2', 'pour_3', 'pour_4', 'pour_5', 'pour_base'],
      notes='Small wooden water tower beside the loop (footprint 1.6 m, ~3.2 m): four braced timber legs, a round '
            'stave tank with iron hoops, a cone roof with snow, a ladder and a swinging spout. idle = spout raised; '
            'pour_base = spout lowered (no water); anim pour (6 f loop) = the water stream with drips and a splash '
            'in the trough, shipped as small OVERLAY frames drawn over pour_base (same origin).')
def b_water_tower():
    wood = tonal('#8A5A33', 0.12, 5.0, rough=0.85)
    dark = flat('#5E3B26', 0.7)
    iron = flat('#474D58', 0.45, 0.5)
    leg_h = 1.5
    for sx in (-1, 1):
        for sy in (-1, 1):
            p0 = Vector((sx * 0.62, sy * 0.62, 0.0))
            p1 = Vector((sx * 0.48, sy * 0.48, leg_h))
            mb = L.MB()
            mb.seg(p0, p1, 0.06, wood, segs=8)
            mb.done('leg')
            box('foot', (0.2, 0.2, 0.08), (p0.x, p0.y, 0.0), mat=flat('#9AA2AD', 0.8), bevel=0.02)
    mb = L.MB()
    for z0, z1, r0, r1 in ((0.2, 1.3, 0.6, 0.5), (1.3, 0.2, 0.5, 0.6)):
        for k in range(4):
            a0 = math.radians(45 + 90 * k)
            a1 = math.radians(45 + 90 * (k + 1))
            mb.seg(Vector((math.cos(a0) * r0 * 1.414, math.sin(a0) * r0 * 1.414, z0)),
                   Vector((math.cos(a1) * r1 * 1.414, math.sin(a1) * r1 * 1.414, z1)), 0.025, dark, segs=6)
    for z, r in ((0.75, 0.55), (1.45, 0.49)):
        for k in range(4):
            a0 = math.radians(45 + 90 * k)
            a1 = math.radians(45 + 90 * (k + 1))
            mb.seg(Vector((math.cos(a0) * r * 1.414, math.sin(a0) * r * 1.414, z)),
                   Vector((math.cos(a1) * r * 1.414, math.sin(a1) * r * 1.414, z)), 0.03, wood, segs=6)
    mb.done('brace')
    # tank
    box('deck', (1.25, 1.25, 0.06), (0, 0, leg_h), mat=wood, bevel=0.02)
    staves = L.stripes('#A86F42', '#94603A', 24.0, 'X', rough=0.8, soft=0.08)
    cyl('tank', 0.66, 0.95, (0, 0, leg_h + 0.06), mat=staves, segs=40, bevel=0.03)
    for z in (0.12, 0.47, 0.82):
        cyl('hoop', 0.675, 0.045, (0, 0, leg_h + 0.06 + z), mat=iron, segs=40, bevel=0.01)
    cyl('roof', 0.78, 0.42, (0, 0, leg_h + 1.01), mat=flat('#2F5D46', 0.6), segs=40, r_top=0.06, bevel=0.02)
    cyl('ball', 0.06, 0.08, (0, 0, leg_h + 1.43), mat=flat('#F2C14E', 0.3, 0.7), segs=12, bevel=0.02)
    blob('rsnow', 0.62, (0.04, 0.02, leg_h + 1.16), flat('snow_mat', 0.9), scale=(1.0, 1.0, 0.32), seed=5, amp=0.12,
         subdiv=3)
    # ladder up the -Y side (camera side)
    mb = L.MB()
    for x in (-0.16, 0.16):
        mb.seg(Vector((x, -0.66, 0.0)), Vector((x, -0.6, leg_h + 0.9)), 0.022, wood, segs=6)
    for k in range(10):
        z = 0.25 + k * 0.22
        yy = -0.66 + 0.06 * z / (leg_h + 0.9)
        mb.seg(Vector((-0.16, yy, z)), Vector((0.16, yy, z)), 0.018, wood, segs=6)
    mb.done('ladder')
    # spout: pivot on the tank side facing +X (toward the track), counter weight chain
    piv = bpy.data.objects.new('spout', None)
    bpy.context.scene.collection.objects.link(piv)
    piv.location = (0.62, -0.18, leg_h + 0.3)
    with L.Collect() as c:
        cyl('pipe', 0.07, 0.8, (0, 0, 0), rot=(0, 90, 0), mat=iron, segs=16, bevel=0.01)
        cyl('mouth', 0.085, 0.08, (0.78, 0, 0), rot=(0, 90, 0), mat=iron, segs=16, bevel=0.01)
        cyl('ring', 0.08, 0.03, (0.05, 0, 0), rot=(0, 90, 0), mat=flat('#F2C14E', 0.3, 0.7), segs=16)
    for o in c.objs:
        if o.parent is None:
            o.parent = piv
    cyl('valve', 0.09, 0.12, (0.6, -0.18, leg_h + 0.24), rot=(0, 90, 0), mat=iron, segs=16, bevel=0.01)
    # trough on the ground under the spout tip (lowered)
    th = math.radians(58)
    tip_down = Vector((0.62 + 0.82 * math.cos(th), -0.18, leg_h + 0.3 - 0.82 * math.sin(th)))
    box('trough', (0.5, 0.36, 0.2), (tip_down.x, -0.18, 0.0), mat=wood, bevel=0.02)
    box('troughw', (0.42, 0.28, 0.02), (tip_down.x, -0.18, 0.17), mat=flat('#7FB6DA', 0.15), bevel=0.0)
    LA.snow_drift('d0', 0.24, (-0.7, -0.5, 0.0), seed=31, scale=(1.6, 1.0, 0.32))
    LA.snow_drift('d1', 0.2, (0.6, 0.75, 0.0), seed=32, scale=(1.4, 1.0, 0.3))
    # water stream (camera only), drips, splash
    wm = L.smoke_mat('water', '#BFE3F7', 0.82)
    stream = []
    for k in range(6):
        o = blob('drop%d' % k, 0.05, (0, 0, 0), wm, scale=(0.8, 0.8, 1.6), seed=40 + k, amp=0.15, subdiv=2)
        o.visible_shadow = False
        stream.append(o)
    col = cyl('stream', 0.035, 1.0, (0, 0, 0), mat=wm, segs=12, bevel=0.0)
    col.visible_shadow = False
    spl = []
    for k in range(5):
        o = blob('spl%d' % k, 0.04, (0, 0, 0), wm, seed=50 + k, amp=0.2, subdiv=2)
        o.visible_shadow = False
        spl.append(o)

    def state(i):
        pour = i > 0                      # pour_0 .. pour_5 and pour_base (7): spout lowered
        water = 0 < i < 7                 # (polish H1) pour_base = the lowered spout without water
        piv.rotation_euler = (0.0, math.radians(58 if pour else -35), 0.0)
        for o in stream + spl + [col]:
            o.hide_render = not water
        if not water:
            return
        f = (i - 1) / 6.0
        top, bot = tip_down.z - 0.06, 0.2
        col.location = (tip_down.x, tip_down.y, bot)
        col.scale = (1.0, 1.0, top - bot)
        for k, o in enumerate(stream):
            t = (k / 6.0 + f) % 1.0
            o.location = (tip_down.x + 0.02 * math.sin(k * 2.1), tip_down.y, top - (top - bot) * t * t)
        for k, o in enumerate(spl):
            a = math.tau * k / 5 + f * 2.0
            r = 0.06 + 0.1 * ((f + k / 5.0) % 1.0)
            o.location = (tip_down.x + r * math.cos(a), tip_down.y + r * math.sin(a) * 0.6,
                          0.2 + 0.08 * math.sin(math.pi * ((f + k / 5.0) % 1.0)))
    return {'frames': state, 'fx': {'spout': tuple(tip_down), 'top': (0, 0, leg_h + 1.5)},
            'extra': {'pourFps': 10}}


def render_prop(key, opts):
    spec = ITEMS[key]
    cache = opts['cache']
    frames = spec.get('frames') or [key]
    names = [key if f == key else '%s_%s' % (key, f) for f in frames]
    side = os.path.join(cache, key + '.json')
    if not opts.get('force') and os.path.exists(side) and all(os.path.exists(os.path.join(cache, n + '.png'))
                                                             for n in names):
        print('[%s] cached' % key)
        return
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    res = spec['fn']() or {}
    setter = res.get('frames')
    W = H = 0
    ax0 = ay0 = 0
    x1 = y1 = 0
    tops = {}
    for i, n in enumerate(names):
        if setter:
            setter(i)
        bpy.context.view_layer.update()
        objs = [o for o in L.scene_meshes()]
        w, h, (ax, ay), top = L.frame_fit(margin=6, shadow=True, objs=objs)
        ax0, ay0 = max(ax0, ax), max(ay0, ay)
        x1, y1 = max(x1, w - ax), max(y1, h - ay)
        tops[n] = int(round(top))
    W = (ax0 + x1 + 3) // 4 * 4
    H = (ay0 + y1 + 3) // 4 * 4
    anchor = (ax0, ay0)
    bc.add_shadow_catcher(size=spec.get('catcher', 8.0))
    sc = bc.setup_render(W, H, samples=opts.get('samples') or spec.get('samples', 48))
    sc.cycles.max_bounces = 4
    bc.setup_camera(W, H, anchor)
    for i, n in enumerate(names):
        if setter:
            setter(i)
        bpy.context.view_layer.update()
        p = os.path.join(cache, n + '.png')
        bc.render_to(p[:-4] + '.tmp.png')
        os.replace(p[:-4] + '.tmp.png', p)
    fx = {}
    for nm, p in (res.get('fx') or {}).items():
        x, y = L.screen_xy(p)
        fx[nm] = [int(round(x)), int(round(y))]
    meta = {'build': key, 'kind': spec['kind'], 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'frames': names, 'notes': spec['notes'],
            'topPx': max(tops.values()), 'fxPoints': fx}
    fp = spec.get('fp')
    if fp is not None:
        meta['footprint'] = L.footprint_px(fp)
        meta['footprintM'] = list(fp) if fp[0] != 'r' else {'radius': fp[1]}
    meta.update(res.get('extra') or {})
    with open(side, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)  %.1fs' % (key, W, H, anchor, len(names), time.time() - t0), flush=True)


def render_item(key, opts):
    if ITEMS[key]['kind'] == 'loop':
        render_loop(key, opts)
    else:
        render_prop(key, opts)
