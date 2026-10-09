"""
beach_lib.py - modelling + material helpers for the v7 "햇살 해변" (Sunny Beach) ground props
(docs/CONTRACT_V7.md section W).  Not run directly: beach_assets.py / beach_boats.py register the builds,
beach_render.py renders them, beach_pack.py packs assets/beach/.

Same camera / light / PPU / colour handling as every Frost Village sprite: bl_common, prop_lib (albedo-compensated
`flat`, `tonal`, primitives, framing), prop_assets, life2_lib (linear mesh batcher, bows), harbor_lib (torus, rope
coils, foam rings), veh_lib (glossy toy paint, rounded boxes) and town_lib (signs) are imported READ-ONLY and never
modified.

Beach conventions (on top of the village / town / harbour ones)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left) - the sea side
    of the beach is -Y, like the harbour waterfront.
  * z = 0 is the SAND surface.  Water-plane props (swim_buoy_line, float_raft, boats) are modelled with their
    WATERLINE at z = 0 (= their sprite anchor, like assets/ships and harbor/buoy).  On a sand beach the sea surface is
    level with the sand (waterPx 0 - one rule with assets/water and assets/beachfolk), so the anchor goes on the sea
    point itself; only beside quays / piers / breakwaters is the sea 0.55 m (waterPx 30) lower.
  * No snow on the beach props (warm-current coast); the cool sky ambient + warm key sun of bl_common are kept so the
    beach sits in the same light as the village, harbour and town.
  * Materials: woven canvas (`canvas`) with darker seam piping and cream fringe, painted wood with a faint grain
    (`painted`), oiled teak slats (`teak`), glossy inflatable vinyl with a clear coat (`vinyl`, stripes by object
    angle), damp / dry sand (`sand`), rope (`rope`).
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
import bmesh
from mathutils import Vector, Matrix, Euler, noise

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import life2_lib as L2

# =========================================================================== palette (inside the world palette family)
SAND = '#F1E2C2'           # dry white sand (ground texture matches: tools/fx/gen_beach_ground.py)
SAND_DAMP = '#D9B57C'      # packed / damp sand (sandcastles): one step darker + warmer than the dry ground sand so
                           # moulded castles read against it (polish: they blended into the sand)
SAND_WET = '#C9AE80'
SAND_SHADE = '#CDB083'
WHITE = '#F7F3EA'
CREAM = '#EBD9B2'           # fringe / hems (polish: one step darker so white canvas keeps an edge)
RED = '#E8524A'
CORAL = '#F27B5B'
ORANGE = '#F49A3A'
YELLOW = '#F7C948'
LEMON = '#F9DE6B'
MINT = '#7CD6B8'
TURQ = '#2FB9C4'
TEAL = '#1F9AA8'
SKY = '#7FC4EA'
BLUE = '#3D7CC9'
NAVY = '#2E4A7A'
PINK = '#F28DB2'
BLUSH = '#F9C6D3'
LILAC = '#B9A3DC'
GREEN = '#5DBB63'
LEAF = '#4E9A5E'
LEAF_DARK = '#2F6E46'
PALM_LEAF = '#58A24E'
PALM_DARK = '#3A7A3C'
TRUNK = '#A07850'
TRUNK_DARK = '#7D5A3A'
TEAK = '#B97B4A'
TEAK_DARK = '#94603A'
DRIFT = '#B9A991'
WOOD_WHITE = '#E9E2D4'      # warm off-white paint (polish: pure white frames had no tonal range)
WOOD_BLUE = '#5FA8D8'
ROPE = '#D9C39A'
STEEL = '#B3BECB'
CHROME = '#D7DEE6'
IRON = '#3D424C'
INK = '#2B2F3A'
RESCUE_RED = '#E0453A'
RESCUE_YELLOW = '#F7C531'

PARASOL_WAYS = {
    'red': ('#E8524A', WHITE), 'blue': ('#3D86D6', WHITE), 'yellow': ('#F7C948', '#2FB9C4'),
    'green': ('#4FB06A', WHITE), 'pink': ('#F28DB2', WHITE),
    'rainbow': ('#E8524A', '#F49A3A', '#F7C948', '#5DBB63', '#3D86D6', '#9B7BD6', '#E8524A', '#F49A3A'),
}

KX, KY, KZ = 45.2548, 22.6274, 55.4256


# =========================================================================== materials

def _p(m):
    return m.node_tree.nodes.get('Principled BSDF')


def _set(m, **kw):
    p = _p(m)
    names = {'coat': 'Coat Weight', 'coat_rough': 'Coat Roughness', 'sheen': 'Sheen Weight',
             'sheen_tint': 'Sheen Tint', 'spec': 'Specular IOR Level'}
    for k, v in kw.items():
        nm = names.get(k, k)
        if nm in p.inputs:
            if isinstance(v, str):
                p.inputs[nm].default_value = (*bc.srgb_to_linear(L.adj(v)), 1.0)
            else:
                p.inputs[nm].default_value = v
    return m


def canvas(col, rough=0.86, var=0.035, scale=30.0):
    """Woven beach canvas: soft tonal variation + a faint sheen (reads as fabric, not plastic)."""
    key = ('bcanvas', C(col), rough, var, scale)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    m = tonal(col, var, scale, rough=rough, name='canvas_' + C(col).lstrip('#'))
    m = m.copy()
    _set(m, sheen=0.3, sheen_tint='#FFFFFF')
    L._CUSTOM[key] = m
    return m


def vinyl(col, rough=0.2, coat=0.75):
    """Glossy inflatable vinyl: saturated colour, low roughness, a clear coat for crisp sun highlights."""
    key = ('bvinyl', C(col), rough, coat)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    m = bc.mat('vinyl_' + C(col).lstrip('#') + '_%g' % rough, L.adj(col), rough=rough)
    _set(m, coat=coat, coat_rough=0.08)
    L._CUSTOM[key] = m
    return m


def vinyl_stripes(c1, c2, n=6, rough=0.2, coat=0.75, name=None, axis='angle', soft=0.012):
    """Inflatable with n coloured sectors by object-space angle around Z (beach ball / swim ring)."""
    key = ('bvstripes', C(c1), C(c2), n, rough, axis)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB(name or 'vstripe', rough=rough)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    at = nb.math('ARCTAN2', sep.outputs['Y'], sep.outputs['X'])
    v = nb.math('MULTIPLY', at, n / math.tau)
    v = nb.math('FRACT', v)
    fac = nb.map_range(v, 0.5 - soft, 0.5 + soft)
    nb.base(nb.mix_rgb(fac, C(c1), C(c2)))
    _set(nb.m, coat=coat, coat_rough=0.08)
    L._CUSTOM[key] = nb.m
    return nb.m


def painted(col, rough=0.55, var=0.05, grain=True):
    """Painted wood: flat colour with a faint lengthwise grain showing through the paint."""
    key = ('bpaint', C(col), rough, var, grain)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('painted_' + C(col).lstrip('#'), rough=rough)
    tc = nb.n('ShaderNodeTexCoord')
    wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction='X', wave_profile='SIN')
    wv.inputs['Scale'].default_value = 9.0
    wv.inputs['Distortion'].default_value = 6.0
    wv.inputs['Detail'].default_value = 2.0
    nb.link(tc.outputs['Object'], wv.inputs['Vector'])
    f = nb.map_range(wv.outputs['Fac'], 0.25, 0.95)
    nz = nb.noise(5.0, 2.0)
    nz = nb.map_range(nz, 0.3, 0.7)
    f = nb.math('MULTIPLY', f, nz) if grain else nz
    dark = hexmix(col, '#3A2A22', var)
    nb.base(nb.mix_rgb(f, C(col), dark))
    L._CUSTOM[key] = nb.m
    return nb.m


def teak(col=TEAK, rough=0.62, along='X'):
    """Oiled wood with visible grain (slats, decks, boardwalk planks)."""
    key = ('bteak', C(col), rough, along)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('teak_' + C(col).lstrip('#') + along, rough=rough)
    tc = nb.n('ShaderNodeTexCoord')
    wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction=along, wave_profile='SAW')
    wv.inputs['Scale'].default_value = 6.0
    wv.inputs['Distortion'].default_value = 9.0
    wv.inputs['Detail'].default_value = 3.0
    wv.inputs['Detail Scale'].default_value = 1.5
    nb.link(tc.outputs['Object'], wv.inputs['Vector'])
    f = nb.map_range(wv.outputs['Fac'], 0.35, 1.0)
    nb.base(nb.mix_rgb(f, C(col), hexmix(col, '#4A2E1A', 0.22)))
    L._CUSTOM[key] = nb.m
    return nb.m


def sand(col=SAND_DAMP, rough=0.95, var=0.17, scale=38.0):
    """Packed sand: fine grain speckle + a soft large-scale damp variation."""
    key = ('bsand', C(col), rough, var, scale)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('sand_' + C(col).lstrip('#'), rough=rough)
    fine = nb.noise(scale, 2.0)
    fine = nb.map_range(fine, 0.38, 0.62)
    big = nb.noise(2.5, 1.0)
    big = nb.map_range(big, 0.3, 0.7)
    f = nb.math('MULTIPLY', fine, 0.55)
    f = nb.math('ADD', f, nb.math('MULTIPLY', big, 0.45))
    nb.base(nb.mix_rgb(f, hexmix(col, '#7A5A3A', var), hexmix(col, '#FFFFFF', var * 0.6)))
    L._CUSTOM[key] = nb.m
    return nb.m


def rope_mat(col=ROPE):
    return flat(col, 0.88)


def metal(col=STEEL, rough=0.3, m=0.75):
    return flat(col, rough, m)


def glow(name, col='#FFE2A0', strength=2.4):
    return L.emissive(name, col, col, strength)


def water_mat(name, col='#7FD3E0', alpha=0.85, rough=0.05):
    """Clear shallow water / shower stream (camera-only objects)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = _p(m)
    p.inputs['Base Color'].default_value = (*bc.srgb_to_linear(col), 1.0)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Alpha'].default_value = alpha
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = 0.6
    return m


def foam_mat(name, alpha=0.9):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = _p(m)
    p.inputs['Base Color'].default_value = (0.93, 0.96, 0.99, 1.0)
    p.inputs['Roughness'].default_value = 0.85
    p.inputs['Alpha'].default_value = alpha
    return m


def set_alpha(m, a):
    _p(m).inputs['Alpha'].default_value = a


# =========================================================================== small geometry

def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def mesh_from(name, verts, faces, mats, fmat=None, smooth=True, loc=(0, 0, 0), rot=(0, 0, 0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        me.materials.append(m)
    if fmat:
        me.polygons.foreach_set('material_index', fmat)
    me.validate(clean_customdata=False)
    me.update()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    ob.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    return link(ob)


def solidify(ob, t=0.012, offset=0.0):
    mod = ob.modifiers.new('Solid', 'SOLIDIFY')
    mod.thickness = t
    mod.offset = offset
    mod.use_even_offset = True
    return ob


def torus(name, R, r, loc=(0, 0, 0), rot=(0, 0, 0), mats=None, seg_fn=None, M=32, K=12, smooth=True,
          scale=(1, 1, 1)):
    """Torus around local Z (ring radius R, tube radius r); seg_fn(j, k) -> material index (stripes / sectors)."""
    verts, faces, fm = [], [], []
    for j in range(M):
        a = math.tau * j / M
        for k in range(K):
            b = math.tau * k / K
            rr = R + r * math.cos(b)
            verts.append((rr * math.cos(a), rr * math.sin(a), r * math.sin(b)))
    for j in range(M):
        j2 = (j + 1) % M
        for k in range(K):
            k2 = (k + 1) % K
            faces.append((j * K + k, j2 * K + k, j2 * K + k2, j * K + k2))
            fm.append(seg_fn(j, k) if seg_fn else 0)
    ob = mesh_from(name, verts, faces, mats or [flat(RED, 0.4)], fm, smooth=smooth, loc=loc, rot=rot)
    ob.scale = scale
    return ob


def rod(name, p, q, r, mat, segs=10, r2=None):
    mb = L2.MB()
    mb.seg(p, q, r, mat, segs=segs, r2=r2)
    return mb.done(name)


def ellipse_pts(rx, ry, n=24, cx=0.0, cy=0.0, a0=0.0):
    return [(cx + rx * math.cos(a0 + math.tau * k / n), cy + ry * math.sin(a0 + math.tau * k / n)) for k in range(n)]


def rr_pts(w, h, r, n=5, cx=0.0, cy=0.0):
    """Rounded rectangle outline (counter-clockwise, XY)."""
    pts = []
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    for (sx, sy, a0) in ((1, 1, 0.0), (-1, 1, math.pi / 2), (-1, -1, math.pi), (1, -1, 1.5 * math.pi)):
        ccx, ccy = cx + sx * (w / 2 - r), cy + sy * (h / 2 - r)
        for k in range(n + 1):
            a = a0 + (math.pi / 2) * k / n
            pts.append((ccx + r * math.cos(a), ccy + r * math.sin(a)))
    return pts


def plate(name, w, h, t, loc, mat, rot=(0, 0, 0), r=0.04, side=None, bevel=0.012):
    """Rounded flat board lying in XY (thickness t up), origin = bottom centre."""
    o = extrude(name, rr_pts(w, h, r), t, top=mat, side=side or mat, bevel=bevel)
    o.location = loc
    o.rotation_euler = Euler([math.radians(a) for a in rot], 'XYZ')
    return o


def board_xz(name, w, h, t, loc, mat, side=None, r=0.04, rz=0.0, tilt=0.0, bevel=0.012):
    """Rounded board standing in the XZ plane (faces -Y), loc = bottom centre of its front face."""
    o = extrude(name, rr_pts(w, h, r, cy=h / 2), t, top=mat, side=side or mat, bevel=bevel)
    o.rotation_euler = Euler((math.radians(90 - tilt), 0, math.radians(rz)), 'XYZ')
    o.location = loc
    return o


def sand_mound(name, r, h, loc=(0, 0, 0), seed=0, col=SAND, scale=(1, 1, 1)):
    """Low soft heap of dry sand (around a pole foot / a dug hole)."""
    kz = 1.6 * h / r
    o = blob(name, r, (loc[0], loc[1], loc[2] - 0.6 * h), sand(col, var=0.07), scale=(scale[0], scale[1], kz),
             seed=seed, amp=0.14, freq=1.4, subdiv=3)
    return o


def shell(mb, loc, s=0.05, col='#F6E3D4', rz=0.0, kind='scallop'):
    """Tiny sea shell (scallop fan or a spiral cone) into a life2_lib.MB batch."""
    x, y, z = loc
    if kind == 'scallop':
        for k in range(5):
            a = math.radians(rz - 50 + k * 25)
            mb.cone(s * 0.18, s * 0.05, s * 0.95, flat(col, 0.45), loc=(x + math.cos(a) * s * 0.45,
                                                                       y + math.sin(a) * s * 0.45, z + s * 0.12),
                    rot=(90, 0, math.degrees(a) - 90), scale=(1, 0.55, 1), segs=8)
        mb.sphere(s * 0.18, flat(hexmix(col, '#B07A5A', 0.3), 0.5), loc=(x, y, z + 0.01), segs=8, rings=5)
    else:
        mb.cone(s * 0.35, 0.002, s * 1.1, flat(col, 0.4), loc=(x, y, z + s * 0.2), rot=(80, 0, rz), segs=10)
        mb.sphere(s * 0.3, flat(col, 0.4), loc=(x, y, z + s * 0.2), segs=10, rings=6)


def starfish(name, loc, r=0.12, col='#F49A5A', rz=0.0, t=0.05, dots=True, tilt=(0, 0)):
    """Chunky 5-arm starfish (rounded arms, little cream dots on top)."""
    pts = []
    n = 40
    for k in range(n):
        a = math.tau * k / n + math.pi / 2
        arm = 0.5 + 0.5 * math.cos(5 * (a - math.pi / 2))
        rr = r * (0.42 + 0.58 * arm ** 1.6)
        pts.append((rr * math.cos(a), rr * math.sin(a)))
    o = extrude(name, pts, t, top=flat(col, 0.55), side=flat(hexmix(col, '#A0402A', 0.2), 0.6), bevel=t * 0.45,
                segs=3, angle=60)
    o.location = loc
    o.rotation_euler = Euler((math.radians(tilt[0]), math.radians(tilt[1]), math.radians(rz)), 'XYZ')
    objs = [o]
    if dots:
        mb = L2.MB()
        dm = flat('#FFE9C8', 0.5)
        for j in range(5):
            a = math.tau * j / 5 + math.pi / 2
            for f in (0.35, 0.62, 0.85):
                mb.sphere(r * 0.06 * (1.2 - f * 0.5), dm, loc=(f * r * math.cos(a), f * r * math.sin(a), t * 0.98),
                          segs=8, rings=5)
        mb.sphere(r * 0.1, dm, loc=(0, 0, t), segs=8, rings=5)
        d = mb.done(name + '_dots')
        d.parent = o
    return objs


# =========================================================================== deformable meshes (anim frames)

class Deform:
    """Keep a mesh's rest coordinates and re-pose them per frame: fn(rest_co: Vector, index) -> new co."""

    def __init__(self, ob):
        self.ob = ob
        self.rest = [v.co.copy() for v in ob.data.vertices]

    def apply(self, fn):
        me = self.ob.data
        for k, v in enumerate(me.vertices):
            v.co = fn(self.rest[k], k)
        me.update()

    def reset(self):
        self.apply(lambda c, k: c)


# =========================================================================== parasol

def parasol(name, cols, R=1.05, apex=2.3, drop=0.42, panels=8, tilt=0.0, pole_cols=(WOOD_WHITE, TEAK),
            fringe=True, seed=0):
    """Beach parasol: 8-panel domed canopy that sags between the ribs, scalloped valance flaps (one per panel,
    panel colour) with a cream tassel fringe, darker seam piping along every rib, white rib tips, two-tone pole
    with a chrome tilt joint, wooden finial, the foot pushed into a little sand mound.

    Returns dict(objs, canopy (Deform), flaps [(pivot empty, panel index)], set_wind(i, n), apex point, shade).
    cols = list of panel colours (repeated around)."""
    M_PER = 8                                # columns per panel
    M = panels * M_PER
    K = 10
    mats = [canvas(c) for c in cols]
    ncol = len(cols)
    z_rim = apex - drop

    def prof(j, k):
        t = (k + 0.0) / (K - 1)               # 0 = apex ring, 1 = rim
        t = 0.06 + 0.94 * t
        a = math.tau * j / M
        s = math.sin(math.pi * (j % M_PER) / M_PER) ** 2     # 0 on a rib, 1 mid-panel
        rho = R * t * (1.0 - 0.07 * s * t)
        z = apex - drop * (t ** 1.55) - 0.07 * s * t ** 1.2
        return (rho * math.cos(a), rho * math.sin(a), z)

    verts, faces, fm = [], [], []
    for k in range(K):
        for j in range(M):
            verts.append(prof(j, k))
    for k in range(K - 1):
        for j in range(M):
            j2 = (j + 1) % M
            faces.append((k * M + j, k * M + j2, (k + 1) * M + j2, (k + 1) * M + j))
            fm.append((j // M_PER) % ncol)
    top = len(verts)
    verts.append((0, 0, apex + 0.012))
    for j in range(M):
        faces.append((top, (j + 1) % M, j))
        fm.append((j // M_PER) % ncol)
    can = mesh_from(name + '_canopy', verts, faces, mats, fm)
    solidify(can, 0.014, 1.0)
    objs = [can]
    seam = flat(hexmix(cols[0], '#2A1E22', 0.4) if ncol <= 2 else '#B89A6A', 0.7)   # polish: deeper piping
    tipm = flat(hexmix(cols[0], '#2A1E22', 0.3), 0.4)
    mb = L2.MB()
    rib_pts = []
    for p in range(panels):
        a = math.tau * p / panels
        line = []
        for k in range(K):
            t = 0.06 + 0.94 * k / (K - 1)
            rho = R * t
            z = apex - drop * (t ** 1.55)
            line.append(Vector((rho * math.cos(a), rho * math.sin(a), z + 0.013)))
        for q0, q1 in zip(line, line[1:]):
            mb.seg(q0, q1, 0.009, seam, segs=6)
        tip = line[-1] + Vector((math.cos(a) * 0.03, math.sin(a) * 0.03, -0.01))
        mb.sphere(0.024, tipm, loc=tuple(tip), segs=8, rings=5)
        rib_pts.append(line[-1])
        # rib underneath: from the runner on the pole to the rim
        mb.seg(Vector((0, 0, apex - 0.62)), line[-1] + Vector((0, 0, -0.03)), 0.008, metal('#7E8794'), segs=5)
    objs.append(mb.done(name + '_ribs'))
    # valance: one continuous skirt hanging from the canopy rim (so no gap at the sagging rim), scalloped bottom
    # edge per panel (panel colour), a cream hem piping band and a sawtooth tassel fringe - all in one mesh so the
    # flutter can push it outward with a travelling wave.
    dep = 0.13
    sk_v, sk_f, sk_m, sk_info = [], [], [], []
    hem_i = ncol
    fr_i = ncol + 1
    rows = [0.0, 0.5, 0.86, 1.0]             # fraction of the panel depth (top = rim)
    for j in range(M + 1):
        jj = j % M
        rim = Vector(prof(jj, K - 1))
        a = math.tau * j / M
        out = Vector((math.cos(a), math.sin(a), 0.0))
        u = (j % M_PER) / float(M_PER)
        if j == M:
            u = 1.0
        d = dep * (0.62 + 0.38 * math.sin(math.pi * u))
        for f in rows:
            q = rim + out * (0.02 + 0.06 * f) + Vector((0, 0, -d * f))
            sk_v.append(q)
            sk_info.append((a, f * d / dep))
        # fringe tooth tip below the hem (every other column)
        q = rim + out * 0.085 + Vector((0, 0, -d - (0.05 if j % 2 == 0 else 0.012)))
        sk_v.append(q)
        sk_info.append((a, (d + 0.05) / dep))
    R_ = len(rows) + 1
    for j in range(M):
        pan = (j // M_PER) % ncol
        for r in range(R_ - 1):
            i0 = j * R_ + r
            sk_f.append((i0, i0 + R_, i0 + R_ + 1, i0 + 1))
            sk_m.append(pan if r < len(rows) - 2 else (hem_i if r == len(rows) - 2 else fr_i))
    sk_mats = mats + [flat(hexmix(cols[0], '#2A1E22', 0.35) if ncol <= 2 else CREAM, 0.75), flat(CREAM, 0.8)]
    skirt = mesh_from(name + '_skirt', sk_v, sk_f, sk_mats, sk_m)
    solidify(skirt, 0.01, 0.0)
    objs.append(skirt)
    sk_d = Deform(skirt)
    flaps = []
    # pole: lower wood, chrome joint, upper white; finial; runner
    lo, _hi = pole_cols
    objs.append(cyl(name + '_pole_lo', 0.03, 1.3, (0, 0, -0.05), mat=teak(TEAK_DARK, along='Z'), segs=14, bevel=0.008))
    objs.append(cyl(name + '_joint', 0.042, 0.1, (0, 0, 1.23), mat=metal('#9AA3AF', 0.22, 0.85), segs=16, bevel=0.01))
    objs.append(cyl(name + '_pole_hi', 0.026, apex - 1.3, (0, 0, 1.3), mat=painted(lo), segs=14, bevel=0.008))
    objs.append(cyl(name + '_runner', 0.045, 0.08, (0, 0, apex - 0.66), mat=painted(WOOD_WHITE), segs=14,
                    bevel=0.012))
    objs.append(sphere(name + '_finial', 0.05, (0, 0, apex + 0.05), teak(TEAK_DARK, along='Z'), segs=16, rings=10))
    objs.append(cyl(name + '_cap', 0.06, 0.03, (0, 0, apex), mat=teak(TEAK_DARK, along='Z'), segs=16, bevel=0.01))
    objs.append(sand_mound(name + '_mound', 0.2, 0.07, (0, 0, 0), seed=seed + 3, col=SAND))
    can_d = Deform(can)

    def set_wind(i, n=4):
        """Flutter frame i of n (breeze from the screen upper-left = world -X): the valance billows outward with a
        wave travelling round the rim (strongest on the downwind side), the canopy panels breathe."""
        if i is None:
            can_d.reset()
            sk_d.reset()
            return
        ph = math.tau * i / n

        def fs(c, k):
            a, f = sk_info[k]
            down = 0.55 + 0.45 * math.cos(a - math.radians(-20))
            lift = (0.35 + 0.65 * (0.5 + 0.5 * math.sin(ph - a * 2.0))) * down
            out = Vector((math.cos(a), math.sin(a), 0.0))
            return c + out * (0.1 * f * lift) + Vector((0, 0, 0.07 * f * f * lift))
        sk_d.apply(fs)

        def f(c, k):
            if c.z < apex - 0.02 and c.length > 0.15:
                a = math.atan2(c.y, c.x)
                rho = math.hypot(c.x, c.y)
                t = rho / R
                w = 0.036 * t * t * math.sin(ph - a * 2.0 + 0.6)
                return Vector((c.x, c.y, c.z + w))
            return c
        can_d.apply(f)

    return {'objs': objs, 'canopy': can_d, 'flaps': flaps, 'set_wind': set_wind,
            'apex': Vector((0, 0, apex)), 'rim_z': z_rim, 'R': R}


# =========================================================================== lounger

def lounger(name, cushion=('#2FB9C4', WHITE), frame=TEAK_DARK, slat='#C2895A', towel=PINK, length=1.95, width=0.66,
            back_deg=38.0):
    """Wooden sun lounger along local Y, head at +Y: oiled dark-teak frame + leg pairs (polish: was white paint, no
    tonal range on the pale sand), lighter teak slats, small rubber wheels at the head, raised backrest, a striped
    cushion with piping seams + tufting buttons, a rolled towel at the head.
    Returns dict(lie (hip point), head (head point), objs)."""
    objs = []
    fm = teak(frame, along='Y')
    sm = teak(slat, along='X')
    hl = length / 2
    z_rail = 0.3
    hinge_y = 0.22
    for sx in (-1, 1):
        x = sx * (width / 2 - 0.03)
        objs.append(box(name + '_rail%d' % sx, (0.055, length, 0.07), (x, 0, z_rail), mat=fm, bevel=0.018))
    # legs: foot end + head end (with wheels)
    for sx in (-1, 1):
        x = sx * (width / 2 - 0.05)
        objs.append(box(name + '_legf%d' % sx, (0.06, 0.07, z_rail), (x, -hl + 0.12, 0), mat=fm, bevel=0.015))
        objs.append(box(name + '_legh%d' % sx, (0.06, 0.07, z_rail - 0.07), (x, hl - 0.16, 0.07), mat=fm,
                        bevel=0.015))
        w = cyl(name + '_wheel%d' % sx, 0.075, 0.04, (sx * (width / 2 + 0.005), hl - 0.16, 0.075), rot=(0, 90, 0),
                mat=flat('#4A5060', 0.5), segs=18, origin='center', bevel=0.012,
                cap_mat=flat('#C9CED6', 0.35, 0.6))
        objs.append(w)
    objs.append(box(name + '_brace', (width - 0.1, 0.05, 0.05), (0, -hl + 0.12, 0.12), mat=fm, bevel=0.012))
    # flat seat slats
    n = 11
    y0, y1 = -hl + 0.05, hinge_y
    for k in range(n):
        y = y0 + (y1 - y0) * (k + 0.5) / n
        objs.append(box(name + '_sl%d' % k, (width - 0.06, (y1 - y0) / n - 0.018, 0.03), (0, y, z_rail + 0.07),
                        mat=sm, bevel=0.008))
    # backrest (hinged at hinge_y, raised)
    with L.Collect() as bk:
        bl = hl - hinge_y - 0.04
        for sx in (-1, 1):
            box(name + '_brail%d' % sx, (0.05, bl, 0.05), (sx * (width / 2 - 0.05), bl / 2, 0), mat=fm, bevel=0.015)
        nb = 7
        for k in range(nb):
            y = bl * (k + 0.5) / nb
            box(name + '_bsl%d' % k, (width - 0.1, bl / nb - 0.02, 0.028), (0, y, 0.04), mat=sm, bevel=0.008)
        # cushion (back part)
        cb = cushion_pad(name + '_cb', width - 0.08, bl - 0.02, 0.07, (0, bl / 2, 0.07), cushion)
        towel_roll(name + '_towel', (0, bl - 0.08, 0.15), width - 0.16, towel)
    back = L.group([o for o in bk.objs if o.parent is None], name + '_back', loc=(0, hinge_y, z_rail + 0.07),
                   rot=(back_deg, 0, 0))
    # prop under the backrest
    objs.append(box(name + '_prop', (width - 0.14, 0.04, 0.04), (0, hinge_y + 0.32, z_rail + 0.24), mat=fm,
                    bevel=0.01))
    objs.append(back)
    # seat cushion
    objs.append(cushion_pad(name + '_cs', width - 0.08, y1 - y0 - 0.02, 0.07, (0, (y0 + y1) / 2, z_rail + 0.1),
                            cushion))
    z_top = z_rail + 0.1 + 0.07
    lie = Vector((0, -0.12, z_top))
    a = math.radians(back_deg)
    head = Vector((0, hinge_y + math.cos(a) * 0.48, z_rail + 0.07 + math.sin(a) * 0.48 + 0.1))
    return {'objs': objs, 'lie': lie, 'head': head, 'feet': Vector((0, -hl + 0.15, z_top))}


def cushion_pad(name, w, d, t, loc, cols):
    """Striped cushion (stripes along Y) with rounded edges, piping and two rows of tufting buttons."""
    c1, c2 = cols
    st = L.stripes(c1, c2, count=1.0 / 0.11, axis='X', rough=0.85, soft=0.03)
    pad = box(name, (w, d, t), loc, mat=st, bevel=t * 0.45, segs=4)
    mb = L2.MB()
    pm = flat(c2 if c2 != c1 else WHITE, 0.7)
    x0, y0 = loc[0] - w / 2 + 0.01, loc[1] - d / 2 + 0.01
    z = loc[2] + t * 0.5
    corners = [(x0, y0), (x0 + w - 0.02, y0), (x0 + w - 0.02, y0 + d - 0.02), (x0, y0 + d - 0.02)]
    for (a, b) in zip(corners, corners[1:] + corners[:1]):
        mb.seg((a[0], a[1], z), (b[0], b[1], z), 0.012, pm, segs=6)
    bm_ = flat(hexmix(c1, '#1A2A3A', 0.25), 0.6)
    for fx in (-0.25, 0.25):
        for fy in (-0.3, 0.0, 0.3):
            mb.sphere(0.014, bm_, loc=(loc[0] + fx * w, loc[1] + fy * d, loc[2] + t - 0.004), segs=8, rings=5,
                      scale=(1, 1, 0.6))
    ob = mb.done(name + '_pip')
    return L.group([pad, ob], name + '_g')


def towel_roll(name, loc, length, col, stripe=WHITE):
    """Rolled beach towel lying across X with two contrasting end stripes."""
    o = cyl(name, 0.07, length, loc, rot=(0, 90, 0), mat=canvas(col), segs=18,
            origin='center', bevel=0.03)
    objs = [o]
    for s in (-1, 1):
        objs.append(cyl(name + '_st%d' % s, 0.072, 0.035, (loc[0] + s * length * 0.32, loc[1], loc[2]),
                        rot=(0, 90, 0), mat=canvas(stripe), segs=18, origin='center', bevel=0.01))
    objs.append(cyl(name + '_end', 0.05, 0.004, (loc[0] + length / 2 + 0.002, loc[1], loc[2]), rot=(0, 90, 0),
                    mat=canvas(hexmix(col, '#FFFFFF', 0.35)), segs=18, origin='center', bevel=0.0))
    return L.group(objs, name + '_g')


# =========================================================================== misc beach props

def rescue_tube(name, loc, rot=(0, 0, 0), length=0.9, col=ORANGE, strap=True):
    """Lifeguard rescue tube (soft orange foam torpedo with a white label band and a strap)."""
    with L.Collect() as c:
        cyl(name, 0.075, length, (0, 0, 0), rot=(0, 90, 0), mat=vinyl(col, 0.45, 0.3), segs=18, origin='center',
            bevel=0.06)
        cyl(name + '_band', 0.078, 0.22, (0, 0, 0), rot=(0, 90, 0), mat=flat(WHITE, 0.6), segs=18, origin='center',
            bevel=0.01)
        cyl(name + '_cross', 0.079, 0.03, (0, 0, 0), rot=(0, 90, 0), mat=flat(RESCUE_RED, 0.6), segs=18,
            origin='center', bevel=0.0)
        if strap:
            L.smooth_tube(name + '_strap', [(length / 2 - 0.05, 0, 0.06), (length / 2 + 0.1, 0, 0.0),
                                             (length / 2 + 0.2, 0, -0.2), (length / 2 + 0.05, 0, -0.32)], 0.012,
                          flat('#E8D23A', 0.7))
    return L.group([o for o in c.objs if o.parent is None], name + '_g', loc=loc, rot=rot)


def flag(name, top, w, h, cols, rz=0.0, wave=0.06, seed=0, n=8, split='h'):
    """Small cloth flag hanging from (pole) top along local +X, waving; cols = (top / left, bottom / right)."""
    verts, faces, fm = [], [], []
    m = 4
    for a in range(n + 1):
        u = a / n
        for b in range(m + 1):
            v = b / m
            x = u * w
            z = -v * h
            y = wave * math.sin(u * math.pi * 1.6 + seed) * u
            verts.append((x, y, z))
    for a in range(n):
        for b in range(m):
            i0 = a * (m + 1) + b
            faces.append((i0, i0 + m + 1, i0 + m + 2, i0 + 1))
            if split == 'h':
                fm.append(0 if b < m / 2 else 1)
            elif split == 'v':
                fm.append(0 if a < n / 2 else 1)
            else:
                fm.append(0 if (a + b) % 2 == 0 else 1)
    o = mesh_from(name, verts, faces, [canvas(cols[0]), canvas(cols[-1])], fm)
    solidify(o, 0.006)
    o.location = top
    o.rotation_euler = Euler((0, 0, math.radians(rz)), 'XYZ')
    return o


def pennant(name, top, w, h, col, rz=0.0, wave=0.05):
    """Triangular pennant (sandcastle flag)."""
    verts = [(0, 0, 0), (0, 0, -h), (w, wave, -h * 0.45)]
    o = mesh_from(name, verts, [(0, 1, 2)], [canvas(col)], smooth=False)
    solidify(o, 0.006)
    o.location = top
    o.rotation_euler = Euler((0, 0, math.radians(rz)), 'XYZ')
    return o


def bucket(name, loc, r=0.11, h=0.16, col=RED, handle='#F7C948', rot=(0, 0, 0), sand_in=True):
    """Toy sand bucket: tapered glossy plastic pail with a rim and a yellow handle."""
    with L.Collect() as c:
        cyl(name, r * 0.78, h, (0, 0, 0), mat=vinyl(col, 0.3, 0.5), segs=24, r_top=r, bevel=0.012)
        H_torus = torus(name + '_rim', r * 1.0, 0.012, (0, 0, h - 0.005), mats=[vinyl(col, 0.3, 0.5)], M=28, K=8)
        del H_torus
        mb = L2.MB()
        hm = vinyl(handle, 0.3, 0.5)
        pts = []
        for k in range(13):
            a = math.pi * k / 12
            pts.append(Vector((r * 0.98 * math.cos(a), 0.0, h + 0.005 + r * 0.9 * math.sin(a))))
        for p, q in zip(pts, pts[1:]):
            mb.seg(p, q, 0.008, hm, segs=6)
        mb.done(name + '_handle')
        if sand_in:
            blob(name + '_sand', r * 0.9, (0, 0, h - 0.03), sand(SAND_DAMP), scale=(1, 1, 0.35), seed=2, amp=0.12)
    return L.group([o for o in c.objs if o.parent is None], name + '_g', loc=loc, rot=rot)


def spade(name, loc, col='#3D86D6', rot=(0, 0, 0), length=0.32):
    """Toy spade: plastic scoop blade + handle with a D-grip."""
    with L.Collect() as c:
        pts = [(-0.05, 0.0), (0.05, 0.0), (0.06, 0.06), (0.045, 0.11), (0.0, 0.125), (-0.045, 0.11), (-0.06, 0.06)]
        b = extrude(name + '_blade', pts, 0.012, top=vinyl(col, 0.3, 0.5), side=vinyl(col, 0.3, 0.5), bevel=0.005)
        b.location = (0, 0, 0)
        cyl(name + '_shaft', 0.012, length - 0.12, (0, -0.0, 0.006), rot=(90, 0, 0), mat=vinyl(col, 0.3, 0.5),
            segs=10, origin='bottom', bevel=0.004)
        L2_t = torus(name + '_grip', 0.035, 0.01, (0, -(length - 0.12) - 0.03, 0.006), mats=[vinyl(col, 0.3, 0.5)],
                     M=16, K=6)
        del L2_t
    return L.group([o for o in c.objs if o.parent is None], name + '_g', loc=loc, rot=rot)


def tower_bucket(name, loc, r=0.12, h=0.22, mat=None, crenel=True, ridges=5, seed=0):
    """Sandcastle tower moulded in a bucket: tapered (wider at the bottom), horizontal ridges, crenellated top."""
    mat = mat or sand(SAND_DAMP)
    objs = []
    prof_r = []
    K = 18
    for k in range(K + 1):
        t = k / K
        rr = r * (1.0 - 0.22 * t) * (1.0 + 0.035 * math.cos(t * math.pi * 2 * ridges))
        prof_r.append((rr, h * t))
    Mn = 28

    def prof(j, k):
        rr, z = prof_r[k]
        a = math.tau * j / Mn
        n = 1.0 + 0.04 * noise.noise(Vector((math.cos(a) * 3, math.sin(a) * 3, z * 9 + seed)))
        return (rr * n * math.cos(a), rr * n * math.sin(a), z)

    o = L.revolve(name, prof, Mn, K + 1, mat=mat, top=(0, 0, h - 0.004), bottom=(0, 0, 0))
    o.location = loc
    objs.append(o)
    if crenel:
        mb = L2.MB()
        rt = prof_r[-1][0]
        for k in range(6):
            a = math.tau * k / 6
            mb.cube((0.045, 0.035, 0.04), mat, loc=(loc[0] + rt * 0.82 * math.cos(a), loc[1] + rt * 0.82 *
                                                   math.sin(a), loc[2] + h + 0.018), rot=(0, 0, math.degrees(a)))
        objs.append(mb.done(name + '_cren'))
    return objs


def drip_spire(name, loc, r=0.07, h=0.3, mat=None, seed=0):
    """Drip-castle spire: stacked blobs getting smaller toward the top."""
    mat = mat or sand(SAND_DAMP)
    mb = L2.MB()
    z = loc[2]
    rr = r
    k = 0
    while z < loc[2] + h and rr > 0.012:
        mb.sphere(rr, mat, loc=(loc[0] + 0.006 * math.sin(k * 1.7 + seed), loc[1] + 0.006 * math.cos(k * 2.1 + seed),
                                z + rr * 0.6), scale=(1, 1, 0.72), segs=12, rings=7)
        z += rr * 0.85
        rr *= 0.8
        k += 1
    return mb.done(name)
