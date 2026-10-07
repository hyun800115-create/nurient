"""
harbor_lib.py - modelling helpers for the harbour city "갈매기 항구" (docs/CONTRACT_V6.md section T).

Everything is built with the SAME helpers, palette, camera, light and PPU as the village / town props: prop_lib,
prop_assets (shared sub-models), life_assets (two-sided roof, snow drift), bld_assets (windows, markers) and
town_lib (doors, signs, emblems, lamps) are imported READ-ONLY and never modified.

Harbour conventions (on top of the town ones - see harbor_assets.py)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left).
  * z = 0 is the QUAY / PIER DECK level: the land, the quay apron and every pier deck are walkable at z = 0, so
    characters walk from the land onto a pier with no lift.  The sea surface lies WATER_Z = -0.55 m lower; pilings,
    quay walls and breakwater stones go down to it, and over-water parts cast their baked shadow onto it.
    A ship (assets/ships, anchor = waterline) therefore sits on WATER_Z: every berth / mooring point in the manifest
    is already projected to the water plane (WATER_PX = 30 px lower on screen than the deck point above it).
  * The main waterfront faces -Y (screen down-left, the side the camera sees); piers run along both iso axes.
  * Wall-mounted parts / emblems use the town_lib FACE / SIGN frames.

Not run directly - see harbor_assets.py / harbor_render.py.
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
import bmesh
from mathutils import Vector, Euler, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T

WATER_Z = -0.55                     # sea surface below the quay / deck level (m)
WATER_PX = int(round(-WATER_Z * 55.4256))   # 30 px: deck point -> the water point straight below it
SEG = math.sqrt(2.0)                # tile length along an axis = one 128x64 grid cell
INV = 1.0 / 1.2247449               # helpers for the computed-ground maths (see harbor_render)

# harbour palette (sits inside the CONTRACT palette family)
NAVY = '#2E4A7A'
NAVY_DARK = '#22385E'
HRED = '#D9483B'
HWHITE = '#F4F1EA'
CREAM = '#F3E6C8'
TEAL = '#3FA58C'
SKY = '#7FB8E0'
HBLUE = '#3D7CC9'
YELLOW = '#F2B632'
TAR = '#3A3330'
ROPE = '#D9C39A'
IRON = '#2E3440'
STEEL = '#5A606B'
CONCRETE = '#B8BEC8'
PILE = '#7A5A3E'
DECK = ('#C9A070', '#BE9466', '#D2AB7C', '#C49A6A')
GULL_GREY = '#AEB9C6'


# =========================================================================== small geometry

def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mats=None, seg_fn=None, M=32, K=12, smooth=True):
    """Torus around local Z (ring radius R, tube radius r).  mats = list of materials, seg_fn(j) -> material index
    of ring column j (stripes on a life ring)."""
    bm = bmesh.new()
    rows = []
    for j in range(M):
        a = math.tau * j / M
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for k in range(K):
            b = math.tau * k / K
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((rr * ca, rr * sa, r * math.sin(b))))
        rows.append(ring)
    for j in range(M):
        j2 = (j + 1) % M
        for k in range(K):
            k2 = (k + 1) % K
            f = bm.faces.new((rows[j][k], rows[j2][k], rows[j2][k2], rows[j][k2]))
            if seg_fn:
                f.material_index = seg_fn(j)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L.finish(name, bm, mats or [flat(HRED, 0.5)], loc, rot, smooth=smooth)


def life_ring(name, loc, rz=0.0, R=0.2, r=0.055, tilt=90.0):
    """Red-white life ring standing up (ring plane vertical, facing heading rz-90 ... i.e. local -Y at rz=0)."""
    m1, m2 = flat(HRED, 0.45), flat(HWHITE, 0.5)
    return torus(name, R, r, loc, rot=(tilt, 0, rz), mats=[m1, m2], seg_fn=lambda j: (j // 4) % 2, M=32, K=12)


def tyre(name, loc, rot=(90, 0, 0), R=0.2, r=0.08):
    return torus(name, R, r, loc, rot=rot, mats=[flat('#2B2D33', 0.85)], M=24, K=10)


def rope_coil(name, loc, r=0.2, turns=3, rr=0.035):
    """Flat coil of rope lying on the deck."""
    objs = []
    for k in range(turns):
        objs.append(torus(name + '_%d' % k, r - k * rr * 1.9, rr, (loc[0], loc[1], loc[2] + rr), mats=[flat(ROPE, 0.85)],
                          M=24, K=8))
    objs.append(torus(name + '_top', r * 0.55, rr, (loc[0] + 0.02, loc[1], loc[2] + rr * 2.6), mats=[flat(ROPE, 0.85)],
                      M=20, K=8))
    return objs


def foam_ring(name, x, y, r, z=WATER_Z, w=0.05, alpha=0.75):
    """White foam ring on the water around a piling / stone (no shadow, camera only)."""
    m = bpy.data.materials.new(name + '_m')
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.92, 0.95, 0.98, 1.0)
    p.inputs['Roughness'].default_value = 0.9
    p.inputs['Alpha'].default_value = alpha
    o = torus(name, r + w * 0.5, w, (x, y, z + 0.004), mats=[m], M=28, K=6)
    o.scale = (1.0, 1.0, 0.25)
    o.visible_shadow = False
    return o


def foam_line(name, p0, p1, z=WATER_Z, w=0.06, alpha=0.7):
    """Straight foam strip on the water (quay foot)."""
    m = bpy.data.materials.new(name + '_m')
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.92, 0.95, 0.98, 1.0)
    p.inputs['Alpha'].default_value = alpha
    a, b = Vector((p0[0], p0[1], z + 0.004)), Vector((p1[0], p1[1], z + 0.004))
    d = b - a
    o = box(name, (d.length, w, 0.012), tuple((a + b) / 2), rot=(0, 0, math.degrees(math.atan2(d.y, d.x))), mat=m,
            bevel=0.004, origin='center')
    o.visible_shadow = False
    return o


def piling(name, x, y, z_top=0.12, r=0.1, z_bot=None, snow=True, foam=True, seed=0, tar=True):
    """Timber pile from below the water up to z_top: tar band at the waterline, end grain + snow on top."""
    z_bot = WATER_Z - 0.08 if z_bot is None else z_bot
    objs = [cyl(name, r, z_top - z_bot, (x, y, z_bot), mat=tonal(PILE, 0.12, 4.0, rough=0.85), segs=14,
                cap_mat=L.end_grain(light='#D9B48A', ring='#B88B5E'), bevel=0.02)]
    if tar:
        objs.append(cyl(name + '_tar', r + 0.008, 0.26, (x, y, WATER_Z - 0.06), mat=flat('#2C3A36', 0.8), segs=14,
                        bevel=0.0))
    if snow and z_top > -0.05:
        objs.append(PA.snow_cap(name + '_sn', r * 0.9, (x, y, z_top - 0.005), 0.05, seed))
    if foam:
        objs.append(foam_ring(name + '_foam', x, y, r + 0.03))
    return objs


def plank_mat(c):
    return tonal(c, 0.08, 6.0, rough=0.82)


def deck_planks(name, u0, u1, v0, v1, along='x', pitch=SEG / 6, z=0.0, t=0.08, seed=0, gap=0.022, period=None):
    """Planks lying across the run direction `along` (x: planks are long in Y, laid one after another along X).
    Colours / small jitter are chosen per plank index modulo `period` (planks per tile) so tiles stay periodic."""
    n0 = int(math.floor(u0 / pitch + 1e-6))
    n1 = int(math.ceil(u1 / pitch - 1e-6))
    objs = []
    per = period or 6
    for n in range(n0, n1):
        k = n % per
        rnd = L.rng(seed * 31 + k)
        c = DECK[rnd.randrange(len(DECK))]
        uu = (n + 0.5) * pitch
        ln = (v1 - v0) + rnd.uniform(-0.04, 0.02)
        vv = (v0 + v1) / 2 + rnd.uniform(-0.02, 0.02)
        sz = (pitch - gap, ln, t) if along == 'x' else (ln, pitch - gap, t)
        loc = (uu, vv, z - t) if along == 'x' else (vv, uu, z - t)
        objs.append(box(name, sz, loc, rot=(0, 0, rnd.uniform(-0.6, 0.6)), mat=plank_mat(c), bevel=0.015))
    return objs


# =========================================================================== props / decor models

def bollard_model(name, loc, s=1.0, rope=False, snow=True, seed=0):
    """Cast-iron mushroom bollard (painted dark navy with a red cap band)."""
    x, y, z = loc
    im = flat(IRON, 0.45, 0.45)
    objs = [cyl(name + '_base', 0.2 * s, 0.07 * s, (x, y, z), mat=im, segs=20, r_top=0.18 * s, bevel=0.02),
            cyl(name + '_body', 0.13 * s, 0.26 * s, (x, y, z + 0.06 * s), mat=im, segs=20, r_top=0.1 * s,
                bevel=0.02),
            cyl(name + '_band', 0.105 * s, 0.05 * s, (x, y, z + 0.27 * s), mat=flat(HRED, 0.45), segs=20,
                bevel=0.01),
            cyl(name + '_cap', 0.17 * s, 0.1 * s, (x, y, z + 0.31 * s), mat=im, segs=22, r_top=0.12 * s,
                bevel=0.03)]
    if snow:
        objs.append(PA.snow_cap(name + '_sn', 0.13 * s, (x, y, z + 0.4 * s), 0.05, seed))
    if rope:
        objs.append(torus(name + '_loop', 0.14 * s, 0.03 * s, (x, y, z + 0.2 * s), mats=[flat(ROPE, 0.85)], M=24,
                          K=8))
        objs.append(L.smooth_tube(name + '_line', [(x + 0.12 * s, y - 0.06 * s, z + 0.2 * s),
                                                   (x + 0.4 * s, y - 0.3 * s, z + 0.08 * s),
                                                   (x + 0.7 * s, y - 0.62 * s, z - 0.02)], 0.028 * s,
                                  flat(ROPE, 0.85)))
    return objs


def fish_crate(name, loc, rz=0.0, kind='fish', s=1.0, seed=0, col='#3D7CC9', ice=True):
    """Shallow open fish box (blue plastic or wood) with fish on crushed ice."""
    rnd = L.rng(seed)
    W, D, H = 0.62 * s, 0.42 * s, 0.2 * s
    m = flat(col, 0.55) if col else tonal('#B97C48', 0.1, 3.0)
    parts = [box(name + '_b', (W, D, 0.04 * s), (0, 0, 0), mat=m, bevel=0.012)]
    for sx in (-1, 1):
        parts.append(box(name + '_s', (0.04 * s, D, H), (sx * (W / 2 - 0.02 * s), 0, 0), mat=m, bevel=0.012))
    for sy in (-1, 1):
        parts.append(box(name + '_s', (W, 0.04 * s, H), (0, sy * (D / 2 - 0.02 * s), 0), mat=m, bevel=0.012))
        parts.append(box(name + '_h', (0.16 * s, 0.05 * s, 0.04 * s), (0, sy * (D / 2 - 0.01 * s), H * 0.62),
                         mat=flat(hexmix(col or '#B97C48', '#000000', 0.35), 0.6), bevel=0.01))
    if ice:
        parts.append(box(name + '_ice', (W - 0.08 * s, D - 0.08 * s, 0.1 * s), (0, 0, 0.03 * s),
                         mat=flat('#E8F2FA', 0.25), bevel=0.03))
    n = 3 if kind != 'tuna' else 1
    for k in range(n):
        if kind == 'tuna':
            with L.Collect() as tc:
                BA.tuna_model(name + '_tuna', length=0.62 * s, height=0.27 * s, thick=0.16 * s)
            g = L.group(BA.top_level(tc.objs), name + '_tg', loc=(0, 0, 0.16 * s), rot=(0, 0, rnd.uniform(-8, 8)))
        else:
            fm = PA.fish_model(name + '_f%d' % k, length=0.42 * s, height=0.2 * s, thick=0.1 * s,
                               loc=(rnd.uniform(-0.06, 0.06) * s, (k - 1) * 0.11 * s, 0.15 * s + k * 0.015 * s),
                               rot=(0, 0, rnd.uniform(-12, 12) + (180 if k % 2 else 0)))
            g = fm
        parts.append(g)
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def container_model(name, loc, rz=0.0, col='#D9483B', Lc=2.4, Wc=1.1, Hc=1.1, snow=True, seed=0, doors=True):
    """Toy shipping container: corrugated side walls, darker frame + corner castings, door end with lock bars."""
    dark = hexmix(col, '#000000', 0.25)
    cor = L.stripes(col, hexmix(col, '#000000', 0.12), 1.0 / 0.14, 'X', rough=0.55, soft=0.25)
    cor_y = L.stripes(col, hexmix(col, '#000000', 0.12), 1.0 / 0.14, 'Y', rough=0.55, soft=0.25)
    fm = flat(dark, 0.55)
    parts = [box(name + '_body', (Lc - 0.08, Wc - 0.04, Hc - 0.08), (0, 0, 0.04), mat=cor, bevel=0.02)]
    parts[-1].data.materials.append(cor_y)
    for p in parts[-1].data.polygons:
        if abs(p.normal.x) > 0.7:
            p.material_index = 1
    t = 0.07
    for sy in (-1, 1):
        for z in (0.0, Hc - t):
            parts.append(box(name + '_rl', (Lc, t, t), (0, sy * (Wc / 2 - t / 2), z), mat=fm, bevel=0.012))
    for sx in (-1, 1):
        for z in (0.0, Hc - t):
            parts.append(box(name + '_re', (t, Wc, t), (sx * (Lc / 2 - t / 2), 0, z), mat=fm, bevel=0.012))
        for sy in (-1, 1):
            parts.append(box(name + '_post', (t, t, Hc), (sx * (Lc / 2 - t / 2), sy * (Wc / 2 - t / 2), 0), mat=fm,
                             bevel=0.012))
            for z in (0.0, Hc - 0.09):
                parts.append(box(name + '_cc', (0.1, 0.1, 0.09), (sx * (Lc / 2 - 0.05), sy * (Wc / 2 - 0.05), z),
                                 mat=flat('#3A3E46', 0.5, 0.3), bevel=0.01))
    if doors:
        # door end at +X: two leaves, 4 vertical lock bars, handles
        x = Lc / 2 + 0.005
        parts.append(box(name + '_seam', (0.02, 0.02, Hc - 0.16), (x, 0, 0.08), mat=fm, bevel=0.0))
        for k, yy in enumerate((-Wc * 0.36, -Wc * 0.13, Wc * 0.13, Wc * 0.36)):
            parts.append(box(name + '_bar', (0.03, 0.03, Hc - 0.14), (x + 0.02, yy, 0.07), mat=flat('#C9CED6', 0.35, 0.6),
                             bevel=0.008))
            parts.append(box(name + '_hd', (0.04, 0.12, 0.04), (x + 0.04, yy - 0.05, Hc * 0.45),
                             mat=flat('#C9CED6', 0.35, 0.6), bevel=0.008))
    # a white "logo" stripe: a little seagull band (no text)
    parts.append(box(name + '_logo', (Lc * 0.42, 0.012, Hc * 0.16), (-Lc * 0.12, -Wc / 2 - 0.004, Hc * 0.58),
                     mat=flat('#F4F1EA', 0.6), bevel=0.0))
    if snow:
        parts.append(L.snow_slab(name + '_snow', Lc - 0.14, Wc - 0.14, 0.09, (0, 0, Hc - 0.01), seed=seed, droop=0.02))
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def gull(name, loc, rz=0.0, s=1.0, pose='stand'):
    """Cute static seagull (decor on posts / roofs): white body, grey wings, yellow beak with a red dot."""
    w = flat('#FBFBF8', 0.55)
    g = flat(GULL_GREY, 0.55)
    parts = [sphere(name + '_body', 0.12 * s, (0, 0, 0.14 * s), w, scale=(1.35, 0.9, 0.85), segs=18, rings=10),
             sphere(name + '_head', 0.085 * s, (0.12 * s, 0, 0.27 * s), w, segs=16, rings=10)]
    for sy in (-1, 1):
        parts.append(sphere(name + '_wing', 0.1 * s, (-0.03 * s, sy * 0.085 * s, 0.17 * s), g,
                            scale=(1.5, 0.35, 0.6), rot=(sy * 8, -12, 0), segs=14, rings=8))
        parts.append(sphere(name + '_eye', 0.014 * s, (0.175 * s, sy * 0.055 * s, 0.295 * s), flat('#1E2430', 0.3),
                            segs=8, rings=6))
    parts.append(cyl(name + '_beak', 0.026 * s, 0.1 * s, (0.2 * s, 0, 0.255 * s), rot=(0, 90, 0),
                     mat=flat('#F2C14E', 0.4), segs=10, r_top=0.008 * s, bevel=0.005))
    parts.append(sphere(name + '_dot', 0.01 * s, (0.24 * s, 0, 0.245 * s), flat(HRED, 0.4), segs=6, rings=4))
    parts.append(cyl(name + '_tail', 0.06 * s, 0.1 * s, (-0.15 * s, 0, 0.16 * s), rot=(0, -100, 0),
                     mat=flat('#4A5260', 0.5), segs=8, r_top=0.015 * s, bevel=0.01))
    if pose == 'stand':
        for sy in (-1, 1):
            parts.append(cyl(name + '_leg', 0.012 * s, 0.07 * s, (0.0, sy * 0.04 * s, 0.0), mat=flat('#F08A3A', 0.5),
                             segs=6))
    return L.group(parts, name, loc=loc, rot=(0, 0, rz))


def tetrapod(name, loc, rot=(0, 0, 0), s=1.0, col=CONCRETE, seed=0):
    """Breakwater tetrapod: four stubby rounded cone legs from a centre (tetrahedral directions)."""
    mb = L.MB()
    m = tonal(col, 0.1, 3.0, rough=0.9)
    dirs = [Vector((0, 0, 1)), Vector((0.943, 0, -0.333)), Vector((-0.471, 0.816, -0.333)),
            Vector((-0.471, -0.816, -0.333))]
    for d in dirs:
        rotm = Vector((0, 0, 1)).rotation_difference(d).to_euler()
        c = d * 0.22 * s
        mb.cone(0.14 * s, 0.085 * s, 0.44 * s, m, loc=tuple(c), rot=tuple(math.degrees(a) for a in rotm), segs=12)
        mb.sphere(0.085 * s, m, loc=tuple(d * 0.44 * s), segs=12, rings=8)
    mb.sphere(0.16 * s, m, loc=(0, 0, 0), segs=14, rings=8)
    return mb.done(name, loc=loc, rot=rot)


def anchor_model(name, s=1.0, col='#2E3440', loc=(0, 0, 0), rot=(0, 0, 0), ring=True, stock_col=None):
    """Classic anchor in the XZ plane (sign frame: bulges toward -Y), ~0.8 m tall at s = 1, origin at its middle."""
    m = flat(col, 0.4, 0.5)
    mb = L.MB()
    mb.seg((0, 0, -0.32 * s), (0, 0, 0.3 * s), 0.045 * s, m, segs=12)                     # shank
    stock = flat(stock_col, 0.6) if stock_col else m
    mb.seg((-0.2 * s, 0, 0.22 * s), (0.2 * s, 0, 0.22 * s), 0.035 * s, stock, segs=10)   # stock
    mb.sphere(0.045 * s, stock, loc=(-0.2 * s, 0, 0.22 * s), segs=10, rings=6)
    mb.sphere(0.045 * s, stock, loc=(0.2 * s, 0, 0.22 * s), segs=10, rings=6)
    pts = [Vector((0.3 * s * math.sin(a), 0, -0.1 * s - 0.24 * s * math.cos(a))) for a in
           [math.radians(-80 + 10 * k) for k in range(17)]]
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, 0.04 * s, m, segs=10)                                                # arms
    for sx in (-1, 1):
        tip = pts[0] if sx < 0 else pts[-1]
        mb.cone(0.075 * s, 0.0, 0.15 * s, m, loc=tuple(tip + Vector((0, 0, 0.05 * s))), rot=(0, 0, 0), segs=4)
    mb.sphere(0.06 * s, m, loc=(0, 0, -0.33 * s), segs=10, rings=6)
    objs = [mb.done(name + '_a')]
    if ring:
        objs.append(torus(name + '_ring', 0.07 * s, 0.022 * s, (0, 0, 0.38 * s), rot=(90, 0, 0), mats=[m], M=20, K=8))
    return L.group(objs, name, loc=loc, rot=rot)


def wheel_model(name, s=1.0, wood='#A8693A', loc=(0, 0, 0), rot=(0, 0, 0)):
    """Ship's helm in the XZ plane (sign frame), ~0.8 m wide at s = 1."""
    wm = flat(wood, 0.55)
    objs = [torus(name + '_rim', 0.25 * s, 0.035 * s, (0, 0, 0), rot=(90, 0, 0), mats=[wm], M=32, K=10),
            cyl(name + '_hub', 0.07 * s, 0.07 * s, (0, 0.035 * s, 0), rot=(90, 0, 0), mat=flat('#F2C14E', 0.3, 0.8),
                segs=16, origin='center')]
    mb = L.MB()
    for k in range(8):
        a = math.tau * k / 8
        d = Vector((math.cos(a), 0, math.sin(a)))
        mb.seg(d * 0.06 * s, d * 0.36 * s, 0.022 * s, wm, segs=8)
        mb.sphere(0.038 * s, wm, loc=tuple(d * 0.38 * s), scale=(1, 1, 1), segs=10, rings=6)
    objs.append(mb.done(name + '_spokes'))
    return L.group(objs, name, loc=loc, rot=rot)


# --------------------------------------------------------------- emblems (town_lib sign frame, ~0.8 m wide at s=1)

def em_anchor(s=1.0, col='#2E4A7A'):
    return [anchor_model('anc', s=s * 0.95, col=col, stock_col='#C98F55')]


def em_wheel(s=1.0):
    return [wheel_model('whl', s=s)]


def em_fish(s=1.0, kind='salmon'):
    """Big fish facing right, flank toward the viewer."""
    if kind == 'tuna':
        with L.Collect() as c:
            BA.tuna_model('emt', length=0.85 * s, height=0.38 * s, thick=0.2 * s)
        g = L.group(BA.top_level(c.objs), 'emtg', rot=(-90, 0, 0))
    else:
        g = PA.fish_model('emf', length=0.82 * s, height=0.42 * s, thick=0.18 * s, rot=(-90, 0, 0))
    return [g]


def em_ship(s=1.0, hull='#2E4A7A', band='#D9483B'):
    """Little ferry in profile (sign frame): navy hull, white decks, red funnel, portholes."""
    objs = []
    hull_pts = [(-0.4 * s, 0.0), (0.4 * s, 0.0), (0.46 * s, 0.14 * s), (-0.44 * s, 0.14 * s)]
    hull_pts = [(-0.36 * s, -0.12 * s), (0.34 * s, -0.12 * s), (0.46 * s, 0.06 * s), (-0.42 * s, 0.06 * s)]
    objs.append(T.ext_xz('ehull', hull_pts, 0.12 * s, flat(hull, 0.5)))
    objs.append(T.ext_xz('eband', [(-0.43 * s, 0.03 * s), (0.44 * s, 0.03 * s), (0.46 * s, 0.07 * s),
                                   (-0.44 * s, 0.07 * s)], 0.13 * s, flat(band, 0.5), y=0.005))
    objs.append(T.ext_xz('edeck1', T.rounded_rect_pts(0.62 * s, 0.13 * s, 0.03 * s, cx=-0.02 * s, cz=0.13 * s),
                         0.1 * s, flat('#F7F5F0', 0.5)))
    objs.append(T.ext_xz('edeck2', T.rounded_rect_pts(0.36 * s, 0.1 * s, 0.03 * s, cx=-0.06 * s, cz=0.24 * s),
                         0.09 * s, flat('#F7F5F0', 0.5)))
    objs.append(T.ext_xz('efun', [(0.08 * s, 0.26 * s), (0.2 * s, 0.26 * s), (0.22 * s, 0.4 * s), (0.1 * s, 0.4 * s)],
                         0.1 * s, flat(band, 0.5)))
    objs.append(T.ext_xz('efunt', [(0.1 * s, 0.37 * s), (0.22 * s, 0.37 * s), (0.225 * s, 0.41 * s),
                                   (0.105 * s, 0.41 * s)], 0.105 * s, flat('#2B2F3A', 0.5), y=0.002))
    for k in range(4):
        objs.append(cyl('eport', 0.022 * s, 0.02 * s, (-0.24 * s + 0.12 * s * k, -0.105 * s, 0.13 * s),
                        rot=(90, 0, 0), mat=flat('#7FB8E0', 0.2), segs=12, origin='center'))
    # little waves below
    mb = L.MB()
    for k in range(5):
        a0 = -0.42 * s + k * 0.2 * s
        T.ring_seg(mb, (a0, -0.06 * s, -0.16 * s), 0.07 * s, 0.018 * s, flat('#7FB8E0', 0.4), axis='y', a0=0.0,
                   a1=math.pi, n=8)
    objs.append(mb.done('ewaves'))
    return objs


def em_scales(s=1.0, col='#F2C14E'):
    """Balance scales (customs)."""
    m = flat(col, 0.3, 0.8)
    mb = L.MB()
    mb.seg((0, 0, -0.3 * s), (0, 0, 0.25 * s), 0.03 * s, m, segs=10)
    mb.cone(0.14 * s, 0.1 * s, 0.05 * s, m, loc=(0, 0, -0.32 * s), segs=16)
    mb.seg((-0.3 * s, 0, 0.2 * s), (0.3 * s, 0, 0.2 * s), 0.025 * s, m, segs=8)
    mb.sphere(0.045 * s, m, loc=(0, 0, 0.27 * s), segs=10, rings=6)
    for sx in (-1, 1):
        x = sx * 0.3 * s
        for dx in (-0.1, 0.1):
            mb.seg((x, 0, 0.2 * s), (x + dx * s, 0, -0.02 * s), 0.008 * s, m, segs=5)
        mb.cone(0.13 * s, 0.07 * s, 0.05 * s, m, loc=(x, 0, -0.04 * s), segs=18)
    return [mb.done('scales')]


def em_crab(s=1.0, col='#E8524A'):
    """Smiling crab (seafood restaurant)."""
    m = flat(col, 0.45)
    objs = [sphere('cbody', 0.22 * s, (0, 0, -0.04 * s), m, scale=(1.25, 0.6, 0.85), segs=22, rings=12)]
    mb = L.MB()
    for sx in (-1, 1):
        mb.seg((sx * 0.2 * s, 0, 0.0), (sx * 0.32 * s, 0, 0.16 * s), 0.035 * s, m, segs=8)
        mb.sphere(0.09 * s, m, loc=(sx * 0.34 * s, 0, 0.24 * s), scale=(1.0, 0.7, 1.15), segs=12, rings=8)
        mb.cone(0.05 * s, 0.0, 0.1 * s, m, loc=(sx * 0.3 * s, 0, 0.33 * s), rot=(0, sx * 25, 0), segs=6)
        for k in range(3):
            a = math.radians(-20 - 22 * k)
            p0 = Vector((sx * 0.22 * s, 0, -0.08 * s))
            p1 = p0 + Vector((sx * math.cos(a) * 0.2 * s, 0, math.sin(a) * 0.2 * s))
            mb.seg(p0, p1, 0.022 * s, m, segs=6)
        mb.seg((sx * 0.07 * s, 0, 0.1 * s), (sx * 0.09 * s, 0, 0.2 * s), 0.014 * s, m, segs=6)
        mb.sphere(0.04 * s, flat('#FFFFFF', 0.3), loc=(sx * 0.09 * s, -0.01 * s, 0.22 * s), segs=10, rings=6)
        mb.sphere(0.022 * s, flat('#1E2430', 0.3), loc=(sx * 0.09 * s, -0.045 * s, 0.22 * s), segs=8, rings=6)
    objs.append(mb.done('crablimbs'))
    mb2 = L.MB()
    T.ring_seg(mb2, (0, -0.13 * s, -0.02 * s), 0.06 * s, 0.012 * s, flat('#7A2A22', 0.5), axis='y',
               a0=math.pi * 1.15, a1=math.pi * 1.85, n=8)
    objs.append(mb2.done('crabsmile'))
    for sx in (-1, 1):
        objs.append(sphere('cblush', 0.03 * s, (sx * 0.15 * s, -0.12 * s, 0.0), flat('#F7A0A0', 0.6),
                           scale=(1.2, 0.4, 0.8), segs=10, rings=6))
    return objs


def em_gull(s=1.0):
    """Seagull head-on-ish emblem (the harbour's mascot)."""
    with L.Collect() as c:
        gull('emg', (0, 0, -0.32 * s), rz=-90.0, s=2.4 * s, pose='fly')
    g = L.group(BA.top_level(c.objs), 'emgg', rot=(0, 0, 0))
    return [g]


def em_hammer_hull(s=1.0):
    """Shipyard: a little boat hull with a hammer."""
    objs = []
    hull = [(-0.34 * s, -0.08 * s), (0.3 * s, -0.08 * s), (0.42 * s, 0.1 * s), (-0.4 * s, 0.1 * s)]
    objs.append(T.ext_xz('shull', hull, 0.12 * s, flat('#C98F55', 0.6)))
    for k in range(3):
        objs.append(T.ext_xz('splank', [(-0.37 * s, -0.03 * s + k * 0.045 * s), (0.36 * s, -0.03 * s + k * 0.045 * s),
                                        (0.37 * s, -0.012 * s + k * 0.045 * s), (-0.375 * s, -0.012 * s + k * 0.045 * s)],
                             0.125 * s, flat('#8A5A33', 0.6), y=0.002))
    mb = L.MB()
    mb.seg((-0.05 * s, -0.08 * s, 0.05 * s), (0.22 * s, -0.08 * s, 0.38 * s), 0.03 * s, flat('#C98F55', 0.6), segs=8)
    objs.append(mb.done('shandle'))
    objs.append(box('shead', (0.24 * s, 0.1 * s, 0.1 * s), (0.24 * s, -0.08 * s, 0.36 * s), rot=(0, 40, 0),
                    mat=flat('#6B7380', 0.35, 0.7), bevel=0.02 * s, origin='center'))
    return objs


def em_bed(s=1.0):
    """Sailor lodge: a hammock between two posts with a pillow + star."""
    objs = []
    mb = L.MB()
    for sx in (-1, 1):
        mb.seg((sx * 0.36 * s, 0, -0.3 * s), (sx * 0.36 * s, 0, 0.2 * s), 0.03 * s, flat('#8A5A33', 0.6), segs=8)
    pts = [(-0.34 * s + 0.68 * s * k / 12, -0.02 * s, 0.1 * s - 0.2 * s * math.sin(math.pi * k / 12)) for k in
           range(13)]
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, 0.05 * s, flat('#F2EEE6', 0.7), segs=8)
    objs.append(mb.done('hammock'))
    objs.append(sphere('pillow', 0.07 * s, (-0.2 * s, -0.04 * s, 0.03 * s), flat(HBLUE, 0.6), scale=(1.4, 0.7, 0.8),
                       segs=12, rings=8))
    objs.append(T.ext_xz('star', T.star_pts(0.1 * s, 0.045 * s), 0.04 * s, flat('#F2C14E', 0.4), y=-0.02 * s))
    objs[-1].location.z = 0.26 * s
    return objs


def signal_flags(name, p0, p1, n=7, sag=0.25, size=0.2, cols=('#D9483B', '#F2C14E', '#3D7CC9', '#F4F1EA',
                                                                  '#3FA58C', '#2E4A7A')):
    """String of little signal flags (squares + pennants) hanging along a sagging line."""
    a, b = Vector(p0), Vector(p1)
    pts = []
    for k in range(13):
        t = k / 12
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(tuple(p))
    objs = [L.smooth_tube(name + '_line', pts, 0.008, flat('#3D424C', 0.6))]
    d = (b - a)
    ang = math.degrees(math.atan2(d.y, d.x))
    for k in range(n):
        t = (k + 0.5) / n
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        c = cols[k % len(cols)]
        if k % 2 == 0:
            pts2 = [(-size / 2, 0.0), (size / 2, 0.0), (size / 2, -size), (-size / 2, -size)]
        else:
            pts2 = [(-size / 2, 0.0), (size / 2, 0.0), (0.0, -size * 1.2)]
        f = extrude(name + '_f', pts2, 0.012, rot=(90, 0, 0), top=flat(c, 0.6), side=flat(c, 0.6), bevel=0.004)
        f.location = (0, 0, 0)
        objs.append(L.group([f], name + '_fg', loc=tuple(p), rot=(0, 0, ang)))
    return objs


def stone_blocks_wall(name, u0, u1, z0, z1, face_v, along='x', course_h=0.27, block_l=0.47, depth=0.3, seed=0,
                      cols=('#8E96A3', '#848C99', '#9AA1AC', '#7D8592'), period=None):
    """Wall face of staggered dressed stone blocks between u0..u1 (along `along`), z0..z1, the wall surface at
    v = face_v facing -v (along x: face toward -Y).  Block layout repeats every `period` metres (seamless tiles)."""
    objs = []
    nrows = max(1, int(round((z1 - z0) / course_h)))
    ch = (z1 - z0) / nrows
    for r in range(nrows):
        off = (block_l / 2) if r % 2 else 0.0
        n0 = int(math.floor((u0 - off) / block_l)) - 1
        n1 = int(math.ceil((u1 - off) / block_l)) + 1
        for n in range(n0, n1):
            a = off + n * block_l
            b = a + block_l
            a2, b2 = max(a, u0), min(b, u1)
            if b2 - a2 < 0.02:
                continue
            key = n if period is None else int(round(((a % period) + period) % period / block_l * 7)) % 997
            rnd = L.rng(seed * 101 + r * 13 + key)
            c = cols[rnd.randrange(len(cols))]
            z = z0 + r * ch
            dd = depth + rnd.uniform(-0.015, 0.02)
            if along == 'x':
                objs.append(box(name, (b2 - a2 - 0.03, dd, ch - 0.03), ((a2 + b2) / 2, face_v + dd / 2 - 0.0, z + 0.015),
                                mat=tonal(c, 0.08, 5.0, rough=0.9), bevel=0.03))
            else:
                objs.append(box(name, (dd, b2 - a2 - 0.03, ch - 0.03), (face_v - dd / 2, (a2 + b2) / 2, z + 0.015),
                                mat=tonal(c, 0.08, 5.0, rough=0.9), bevel=0.03))
    return objs


def ground_tiles(name, x0, x1, y0, y1, c1='#C9CED6', c2='#BAC0CA', n=3.0, z=0.0, t=0.04):
    """Paved apron (checker stones) belonging to a building (quay apron, plaza)."""
    key = ('htiles', c1, c2, n)
    if key in L._CUSTOM:
        m = L._CUSTOM[key]
    else:
        nb = L.NB('htiles_%s' % c1.lstrip('#'), rough=0.9)
        tc = nb.n('ShaderNodeTexCoord')
        ch = nb.n('ShaderNodeTexChecker')
        ch.inputs['Color1'].default_value = nb.rgb(c1)
        ch.inputs['Color2'].default_value = nb.rgb(c2)
        ch.inputs['Scale'].default_value = n
        nb.link(tc.outputs['Object'], ch.inputs['Vector'])
        nb.base(ch.outputs['Color'])
        L._CUSTOM[key] = nb.m
        m = nb.m
    return box(name, (x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z - t + 0.002), mat=m, bevel=0.015)


def beam(name, p, q, w, mat, h=None):
    """Square-section beam between two points (crane girders, braces)."""
    p, q = Vector(p), Vector(q)
    d = q - p
    ln = d.length
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    o = box(name, (w, h or w, ln), tuple(p), rot=tuple(math.degrees(a) for a in rot), mat=mat, bevel=min(0.02, w * 0.2))
    return o


def hazard_mat():
    return L.stripes('#F2C14E', '#2B2F3A', 1.0 / 0.16, 'X', rough=0.6, soft=0.02)


def glass_mat(name, col='#BFD8EA', alpha=1.0, rough=0.08):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*bc.srgb_to_linear(col), 1.0)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    p.inputs['Alpha'].default_value = alpha
    return m


def beam_mat(name, col='#FFE89A', alpha=0.5, strength=2.4):
    """Light-beam material: emissive + transparent, fading out along the object's Generated Z (lighthouse beam built
    as a cone along local Z: bright at the lamp, gone at the far end)."""
    nb = L.NB(name, rough=1.0)
    rgb = nb.rgb(col, raw=True)
    nb.p.inputs['Base Color'].default_value = rgb
    nb.p.inputs['Emission Color'].default_value = rgb
    nb.p.inputs['Emission Strength'].default_value = strength
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Generated'], sep.inputs[0])
    f = nb.map_range(sep.outputs['Z'], 1.0, 0.05)
    f = nb.math('POWER', f, 1.4)
    nb.link(nb.math('MULTIPLY', f, alpha), nb.p.inputs['Alpha'])
    return nb.m


def spark_mat(name, col='#FFE27A', strength=4.0):
    nb = L.NB(name, rough=0.4)
    rgb = nb.rgb(col, raw=True)
    nb.p.inputs['Base Color'].default_value = rgb
    nb.p.inputs['Emission Color'].default_value = rgb
    nb.p.inputs['Emission Strength'].default_value = strength
    return nb.m
