"""
bbld_lib.py - modelling helpers for the beachfront buildings of "햇살 해변" (Sunny Beach, docs/CONTRACT_V7.md §X).

Everything is built with the SAME helpers, palette family, camera, light and PPU as the village / town / harbour sets:
prop_lib, prop_assets, life_assets, bld_assets, town_lib and harbor_lib are imported READ-ONLY and never modified.

Warm coast = no snow.  The shared helpers bake snow (window sills, roof slabs, the snowy() shader, snow caps,
drifts).  warm() is a context manager that, ONLY while a beach build runs in this process, swaps those snow
functions for snow-free stand-ins (module attributes are patched in memory and restored afterwards; no file of the
other sets changes):  prop_lib.snow_slab / prop_assets.snow_cap / life_assets.snow_drift -> an invisible empty,
snowy() -> a plain tonal() of the base colour, prop_lib.brick(..., snow_top) -> snow_top=False.  sweep_snow() also
deletes any leftover mesh whose only material is the snow albedo.

Conventions (as town_lib / harbor_lib)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left, the sea side);
    +X = screen down-right, the other face the camera sees.  `_x` variants are the same model rotated yaw 90 (front
    = +X): every camera-facing sign must use psi() (= 45 - YAW) so it still faces the camera after the rotation.
  * FACE frame for wall parts (doors, windows, balconies): wall plane y = 0, outward -y, x along the wall, z up;
    T.face_group() places it on 'y-' / 'x+' / 'y+' / 'x-'.
  * SIGN frame for emblems: picture in the XZ plane, bulging toward -Y; T.sign_disc / T.emblem_at turn it to psi.
  * Night: materials registered with night() light up in the render's glow pass (everything else turns black);
    bbld_pack turns that pass into the additive `<key>_glow` overlay and the night frames.
  * front(objs) tags occluders for the overlay pass (things that must be drawn ABOVE a character standing behind
    them: balcony railings, a concierge desk, a shop counter).

Not run directly - see bbld_assets.py / bbld_render.py.
"""
import math
from contextlib import contextmanager

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
import bmesh
from mathutils import Vector, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import flat, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import harbor_lib as H

YAW = 0.0                         # yaw of the build being modelled (set by bbld_render before the builder runs)
NIGHT = []                        # [(material, night colour, strength)] lit in the glow pass
FRONT = []                        # occluder objects for the overlay pass
LIGHTS = []                       # [(kind, size_m)] parallel to the 'light' markers
GLOWOBJ = []                      # [(object, colour hex | None, strength, tint)] lit WHOLE in the glow pass
SEG = math.sqrt(2.0)

# warm-coast palette (inside the CONTRACT palette family: same saturation / value range as town + harbour)
STUCCO = '#F7F2E8'
STUCCO_W = '#FBF8F2'
SAND = '#EAD7B0'
SAND_D = '#D9C08E'
CORAL = '#F07A62'
PEACH = '#F6B38E'
MINT = '#8FD9C4'
TURQ = '#2FB3B0'
AQUA = '#5BC8D8'
SKY = '#7FB8E0'
LEMON = '#F6D35B'
PINK = '#F59AB5'
LILAC = '#B9A3E3'
NAVY = '#2E4A7A'
TERRA = '#D9774B'
WOOD = '#C9A070'
WOOD_D = '#9C7048'
DRIFT = '#BFAE92'
THATCH = '#D8B26A'
LEAF = '#3E9A5A'
LEAF_D = '#2E7A48'
WHITE = '#F4F1EA'
RED = '#E04B3F'
GOLD = '#F2C14E'
INK = '#2B2F3A'
GLASS = '#A9D8EA'
WARM_LIGHT = '#FFBE62'
SNOW_MAT_PREFIX = 'm_' + L.C('snow_mat').lstrip('#')


def psi(base=T.CAM_PSI):
    """Heading that faces the camera AFTER the build is rotated by YAW."""
    return base - YAW


# =========================================================================== warm(): snow-free helpers

def _null(name='nosnow', *a, **k):
    e = bpy.data.objects.new('nosnow_%s' % name, None)
    bpy.context.scene.collection.objects.link(e)
    return e


def _nosnowy(base, snow='snow_mat', lo=0.42, hi=0.62, noise_amt=0.35, noise_scale=2.2, rough=0.8, metal=0.0,
             name=None, coords='Object'):
    return tonal(base, 0.06, 3.0, rough=rough, metal=metal)


_BRICK = L.brick


def _brick_nosnow(*a, **k):
    k['snow_top'] = False
    return _BRICK(*a, **k)


@contextmanager
def warm():
    saved = []

    def patch(mod, name, val):
        if hasattr(mod, name):
            saved.append((mod, name, getattr(mod, name)))
            setattr(mod, name, val)
    for mod in (L, PA, LA, BA, T, H):
        patch(mod, 'snowy', _nosnowy)
    patch(L, 'snow_slab', _null)
    patch(PA, 'snow_cap', _null)
    patch(LA, 'snow_drift', _null)
    patch(T, 'snow_patch', _null)
    patch(L, 'brick', _brick_nosnow)
    try:
        yield
    finally:
        for mod, name, val in reversed(saved):
            setattr(mod, name, val)


def sweep_snow():
    """Delete meshes whose every material is the snow albedo (anything that slipped past warm())."""
    n = 0
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH' or not o.data.materials:
            continue
        if all(m is not None and m.name.startswith(SNOW_MAT_PREFIX) for m in o.data.materials):
            bpy.data.objects.remove(o, do_unlink=True)
            n += 1
    return n


def reset():
    NIGHT.clear()
    FRONT.clear()
    LIGHTS.clear()
    GLOWOBJ.clear()


# =========================================================================== registries

def night(m, col=WARM_LIGHT, strength=2.2):
    """Register a material to glow at night (glow pass); returns m."""
    NIGHT.append((m, col, strength))
    return m


def front(objs):
    """Tag occluders for the overlay pass (objects and their children)."""
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    for o in BA.descendants(list(objs)):
        if o is not None and o not in FRONT:
            FRONT.append(o)
    return objs


def glow_objs(objs, col=None, strength=0.85, tint=None):
    """Light whole objects (and their children) in the night glow pass - a backlit sign / medallion, or an interior
    seen through a window.  col None = every material glows in its OWN base colour (a sign keeps its picture),
    tint = optional (r, g, b) multiplier (warm interior light); col = one colour for everything.  Shared materials
    are not touched (the glow pass swaps per object), so other objects using the same material stay dark."""
    if not isinstance(objs, (list, tuple)):
        objs = [objs]
    for o in BA.descendants(list(objs)):
        if o is not None and o.type in ('MESH', 'CURVE') and all(g[0] is not o for g in GLOWOBJ):
            GLOWOBJ.append((o, col, strength, tint))
    return objs


def light_pt(loc, kind='lamp', size=0.6):
    """Night light spot (lightPoints): a lamp head, a lit window, a sign.  size = glow radius (m)."""
    BA.mark('light', loc)
    LIGHTS.append((kind, size))


# =========================================================================== materials

def stucco(col=STUCCO, var=0.04, scale=6.0):
    return tonal(col, var, scale, rough=0.88)


def glass_mat(name, top='#CFEAF4', bottom='#7DBFDC', night_col=WARM_LIGHT, strength=2.0, lit=True):
    """Day: sky-reflecting glass (light at the top, deeper blue below).  Night: registered to glow warm."""
    nb = L.NB(name, rough=0.12)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Generated'], sep.inputs[0])
    f = nb.map_range(sep.outputs['Z'], 0.15, 0.95)
    nb.base(nb.mix_rgb(f, bottom, top))
    nb.p.inputs['Specular IOR Level'].default_value = 0.7
    if lit:
        night(nb.m, night_col, strength)
    return nb.m


def neon_mat(name, col, day=0.6, strength=4.0):
    """Coloured neon / bulb: faintly lit by day, bright at night."""
    m = L.emissive(name, col, col, day, rough=0.35)
    night(m, col, strength)
    return m


def water_mat(name, phase=0.0, col='#3CC6D0', deep='#1FA3B8', alpha=0.82, R=0.6):
    """Pool water: turquoise, lighter ripples from two Voronoi layers moving on circles (phase 0..1 loops)."""
    nb = L.NB(name, rough=0.06)
    tc = nb.n('ShaderNodeTexCoord')
    a = math.tau * phase
    outs = []
    for k, (sc, sgn) in enumerate(((2.6, 1.0), (4.1, -1.0))):
        mp = nb.n('ShaderNodeMapping')
        mp.inputs['Location'].default_value = (R * math.cos(sgn * a + k), R * math.sin(sgn * a + k), 0.0)
        nb.link(tc.outputs['Object'], mp.inputs['Vector'])
        vo = nb.n('ShaderNodeTexVoronoi')
        vo.inputs['Scale'].default_value = sc
        nb.link(mp.outputs['Vector'], vo.inputs['Vector'])
        outs.append(vo.outputs['Distance'])
    s = nb.math('ADD', outs[0], outs[1])
    f = nb.map_range(s, 0.95, 0.5)
    f = nb.math('POWER', f, 2.2)
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Generated'], sep.inputs[0])
    depth = nb.map_range(sep.outputs['Y'], 0.0, 1.0)
    base = nb.mix_rgb(depth, col, deep)
    nb.base(nb.mix_rgb(f, base, '#E9FBFF'))
    nb.p.inputs['Alpha'].default_value = alpha
    nb.p.inputs['Specular IOR Level'].default_value = 0.8
    return nb.m


def tile_mat(c1='#FFFFFF', c2='#E6F2F4', n=6.0, grout='#C9DDE2'):
    """Square tiles (pool floor / walls / decks), object coordinates, n tiles per metre."""
    key = ('btile', c1, c2, n, grout)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('btile_%s' % c1.lstrip('#'), rough=0.35)
    tc = nb.n('ShaderNodeTexCoord')
    br = nb.n('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = nb.rgb(c1)
    br.inputs['Color2'].default_value = nb.rgb(c2)
    br.inputs['Mortar'].default_value = nb.rgb(grout)
    br.inputs['Scale'].default_value = n
    br.inputs['Mortar Size'].default_value = 0.03
    br.inputs['Brick Width'].default_value = 1.0
    br.inputs['Row Height'].default_value = 1.0
    br.offset = 0.0
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    comb = nb.n('ShaderNodeCombineXYZ')
    nb.link(nb.math('ADD', sep.outputs['X'], sep.outputs['Z']), comb.inputs['X'])
    nb.link(nb.math('ADD', sep.outputs['Y'], sep.outputs['Z']), comb.inputs['Y'])
    nb.link(comb.outputs[0], br.inputs['Vector'])
    nb.base(br.outputs['Color'])
    L._CUSTOM[key] = nb.m
    return nb.m


def scallop_stripes(c1, c2, n, axis='X'):
    return L.stripes(c1, c2, n, axis, rough=0.8, soft=0.01)


# =========================================================================== small geometry

def rbox(name, size, loc, mat, rot=(0, 0, 0), bevel=0.04):
    return box(name, size, loc, rot=rot, mat=mat, bevel=bevel)


def cone_wedges(name, r, h, loc, mats, n=8, droop=0.0, rot=(0, 0, 0), tip=0.0):
    """Parasol / umbrella canopy: a shallow cone of n wedges alternating mats, scalloped rim dropping by droop."""
    bm = bmesh.new()
    apex = bm.verts.new((0, 0, h))
    m = n * 4
    rim = []
    for j in range(m + 1):
        a = math.tau * j / m
        k = (j % 4) / 4.0
        rr = r * (1.0 - 0.06 * math.sin(math.pi * k))
        rim.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), -droop * math.sin(math.pi * k))))
    for j in range(m):
        f = bm.faces.new((apex, rim[j], rim[j + 1]))
        f.material_index = (j // 4) % len(mats)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L.finish(name, bm, mats, loc, rot, smooth=False)


def parasol(name, loc, r=0.55, h=1.7, c1=CORAL, c2=WHITE, n=8, tilt=(0, 0), pole='#F4F1EA', base=True):
    """Beach / balcony parasol: pole, striped scalloped canopy, finial ball."""
    x, y, z = loc
    pm = flat(pole, 0.5)
    objs = [cyl(name + '_pole', 0.022, h, (0, 0, 0), mat=pm, segs=8, bevel=0.0)]
    objs.append(cone_wedges(name + '_can', r, r * 0.32, (0, 0, h - r * 0.22), [flat(c1, 0.6), flat(c2, 0.6)], n=n,
                            droop=r * 0.08))
    objs.append(sphere(name + '_top', 0.035, (0, 0, h + r * 0.12), flat(c1, 0.5), segs=10, rings=6))
    if base:
        objs.append(cyl(name + '_base', 0.11, 0.05, (0, 0, 0), mat=flat('#9AA3AE', 0.5, 0.4), segs=14, r_top=0.08))
    return L.group(objs, name, loc=loc, rot=(tilt[0], tilt[1], 0))


def lounger(name, loc, rz=0.0, col=AQUA, frame=WHITE, towel=None, s=1.0):
    """Sun lounger (long axis along local X, head end at +X, backrest up)."""
    fm = flat(frame, 0.45)
    cm = L.stripes(col, WHITE, 6.0, 'X', rough=0.8, soft=0.02) if towel is None else flat(col, 0.75)
    Lh, W = 1.15 * s, 0.5 * s
    objs = [box(name + '_bed', (Lh * 0.72, W, 0.08 * s), (-Lh * 0.14, 0, 0.26 * s), mat=fm, bevel=0.02),
            box(name + '_cush', (Lh * 0.7, W * 0.92, 0.05 * s), (-Lh * 0.14, 0, 0.34 * s), mat=cm, bevel=0.02)]
    bk = box(name + '_back', (Lh * 0.32, W, 0.07 * s), (Lh * 0.33, 0, 0.3 * s), rot=(0, -35, 0), mat=fm, bevel=0.02,
             origin='center')
    objs.append(bk)
    objs.append(box(name + '_bcush', (Lh * 0.3, W * 0.92, 0.05 * s), (Lh * 0.31, 0, 0.36 * s), rot=(0, -35, 0),
                    mat=cm, bevel=0.02, origin='center'))
    for lx in (-Lh * 0.45, Lh * 0.18):
        for ly in (-W * 0.4, W * 0.4):
            objs.append(cyl(name + '_leg', 0.022 * s, 0.26 * s, (lx, ly, 0), mat=fm, segs=6, bevel=0.0))
    if towel:
        objs.append(box(name + '_towel', (Lh * 0.45, W * 0.7, 0.012), (-Lh * 0.2, 0, 0.375 * s),
                        mat=L.stripes(towel, WHITE, 8.0, 'X', soft=0.02), bevel=0.004))
    return L.group(objs, name, loc=loc, rot=(0, 0, rz))


def deck_chair(name, loc, rz=0.0, col=CORAL, frame=WOOD):
    """Folding canvas deck chair facing local -Y."""
    wm = tonal(frame, 0.06, 4.0)
    cm = L.stripes(col, WHITE, 9.0, 'X', soft=0.02)
    objs = []
    for s in (-1, 1):
        objs.append(box(name + '_r', (0.04, 0.62, 0.04), (s * 0.24, 0.0, 0.32), rot=(-28, 0, 0), mat=wm, bevel=0.01,
                        origin='center'))
        objs.append(box(name + '_f', (0.04, 0.04, 0.42), (s * 0.24, -0.25, 0.0), rot=(14, 0, 0), mat=wm, bevel=0.01))
    objs.append(box(name + '_seat', (0.46, 0.58, 0.02), (0, 0.02, 0.3), rot=(-34, 0, 0), mat=cm, bevel=0.005,
                    origin='center'))
    return L.group(objs, name, loc=loc, rot=(0, 0, rz))


def towel_hang(name, loc, w=0.32, h=0.42, c=CORAL, c2=WHITE, face_rz=0.0, n=6.0):
    """Beach towel draped over a rail (hangs on the outer side, local -Y)."""
    m = L.stripes(c, c2, n / w, 'X', soft=0.02)
    objs = [box(name + '_top', (w, 0.06, 0.02), (0, 0.0, 0.0), mat=m, bevel=0.008),
            box(name + '_fr', (w, 0.015, h), (0, -0.035, -h), mat=m, bevel=0.006)]
    return L.group(objs, name, loc=loc, rot=(0, 0, face_rz))


def pot_plant(name, loc, r=0.2, col=TERRA, kind='round', seed=0):
    """Terracotta pot with a round shrub, flowers or a little agave."""
    rnd = L.rng(seed)
    x, y, z = loc
    objs = [cyl(name + '_pot', r, r * 1.05, (x, y, z), mat=tonal(col, 0.06, 5.0), r_top=r * 1.2, segs=18, bevel=0.03),
            cyl(name + '_rim', r * 1.24, r * 0.16, (x, y, z + r * 0.92), mat=tonal(col, 0.06, 5.0), segs=18,
                bevel=0.02)]
    if kind == 'agave':
        mb = L.MB()
        lm = flat('#5FA97A', 0.7)
        for k in range(9):
            a = math.tau * k / 9 + rnd.uniform(-0.2, 0.2)
            p0 = Vector((x, y, z + r))
            p1 = p0 + Vector((math.cos(a) * r * 1.3, math.sin(a) * r * 1.3, r * 1.4 + rnd.uniform(0, 0.1)))
            mb.seg(p0, p1, r * 0.13, lm, segs=5, r2=0.005)
        objs.append(mb.done(name + '_ag'))
    else:
        for k in range(6):
            a = rnd.uniform(0, math.tau)
            rr = rnd.uniform(0, r * 0.6)
            objs.append(sphere(name + '_lf', r * 0.5, (x + rr * math.cos(a), y + rr * math.sin(a), z + r * 1.3 +
                                                       rnd.uniform(0, r * 0.3)), flat(LEAF, 0.8),
                               scale=(1, 1, 0.85), segs=10, rings=6))
        if kind == 'flowers':
            for k in range(7):
                a = rnd.uniform(0, math.tau)
                rr = rnd.uniform(0, r * 0.7)
                objs.append(sphere(name + '_fl', r * 0.16, (x + rr * math.cos(a), y + rr * math.sin(a),
                                                            z + r * 1.75 + rnd.uniform(-0.05, 0.05)),
                                   flat((PINK, CORAL, LEMON, WHITE)[k % 4], 0.5), segs=8, rings=6))
    return objs


def frond(name, base, ang, length=0.9, width=0.22, droop=0.55, lift=0.35, mat=None, n=10):
    """One drooping palm frond (V-folded strip with a serrated look), base point, heading ang (rad)."""
    bm = bmesh.new()
    d = Vector((math.cos(ang), math.sin(ang), 0.0))
    side = Vector((-d.y, d.x, 0.0))
    rows = []
    for k in range(n + 1):
        t = k / n
        c = Vector(base) + d * (length * t) + Vector((0, 0, lift * math.sin(math.pi * t * 0.9) - droop * t * t))
        w = width * math.sin(math.pi * min(1.0, t * 1.08)) * (1.0 - 0.15 * (k % 2))
        rows.append((bm.verts.new(c + side * w + Vector((0, 0, -0.05 * w))), bm.verts.new(c + Vector((0, 0, 0.02))),
                     bm.verts.new(c - side * w + Vector((0, 0, -0.05 * w)))))
    for k in range(n):
        a, b = rows[k], rows[k + 1]
        bm.faces.new((a[0], b[0], b[1], a[1]))
        bm.faces.new((a[1], b[1], b[2], a[2]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.015)
    return L.finish(name, bm, [mat or flat(LEAF, 0.75)], smooth=True)


def palm(name, loc, h=2.6, lean=(0.25, 0.0), n_fronds=8, s=1.0, seed=0, coconuts=True):
    """Toy palm tree: ringed curved trunk, drooping two-tone fronds, coconuts.  loc = trunk foot."""
    rnd = L.rng(seed)
    x, y, z = loc
    tm = L.stripes('#A8794E', '#8C6240', 9.0 / s, 'Z', rough=0.85, soft=0.15)
    pts = []
    for k in range(9):
        t = k / 8
        pts.append((x + lean[0] * s * t * t, y + lean[1] * s * t * t, z + h * s * t))
    objs = [L.smooth_tube(name + '_trunk', pts, 0.11 * s, tm)]
    objs.append(cyl(name + '_foot', 0.16 * s, 0.12 * s, (x, y, z), mat=tm, segs=14, r_top=0.11 * s))
    top = Vector(pts[-1])
    m1, m2 = flat(LEAF, 0.75), flat('#58B36B', 0.75)
    for k in range(n_fronds):
        a = math.tau * k / n_fronds + rnd.uniform(-0.15, 0.15)
        objs.append(frond(name + '_fr%d' % k, top + Vector((0, 0, 0.02)), a, length=1.05 * s * rnd.uniform(0.85, 1.1),
                          width=0.2 * s, droop=0.75 * s, lift=0.35 * s, mat=m1 if k % 2 else m2))
    for k in range(3):
        objs.append(frond(name + '_up%d' % k, top + Vector((0, 0, 0.04)), math.tau * (k + 0.5) / 3, length=0.6 * s,
                          width=0.14 * s, droop=0.1 * s, lift=0.4 * s, mat=m2))
    if coconuts:
        for k in range(3):
            a = math.tau * k / 3 + 0.4
            objs.append(sphere(name + '_nut', 0.075 * s, tuple(top + Vector((0.09 * s * math.cos(a), 0.09 * s *
                                                                             math.sin(a), -0.1 * s))),
                               flat('#7A5232', 0.6), segs=10, rings=8))
    return objs


def planter_palm(name, loc, h=1.6, s=0.7, seed=0, pot=TERRA):
    x, y, z = loc
    objs = pot_plant(name + '_p', (x, y, z), r=0.24 * s / 0.7, col=pot, kind='none', seed=seed)
    objs = [o for o in objs if not o.name.startswith(name + '_p_lf')]
    objs += palm(name, (x, y, z + 0.28 * s / 0.7), h=h, lean=(0.06, -0.04), s=s, seed=seed, coconuts=False)
    return objs


def bulb_string(name, p0, p1, n=9, sag=0.25, cols=(LEMON, CORAL, AQUA, PINK, '#9BE37A'), r=0.045, phase_mats=None,
                wire='#3D424C', day=0.9, strength=4.5):
    """String of round party bulbs hanging along a sagging wire from p0 to p1.  phase_mats: list of 4 lists that
    collects the bulb materials by phase (for twinkle animations)."""
    a, b = Vector(p0), Vector(p1)
    pts = []
    for k in range(13):
        t = k / 12
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        pts.append(tuple(p))
    objs = [L.smooth_tube(name + '_wire', pts, 0.008, flat(wire, 0.6))]
    for k in range(n):
        t = (k + 0.5) / n
        p = a.lerp(b, t)
        p.z -= sag * 4 * t * (1 - t)
        col = cols[k % len(cols)]
        m = neon_mat('%s_b%d' % (name, k), col, day, strength)
        if phase_mats is not None:
            phase_mats[k % len(phase_mats)].append(m)
        objs.append(cyl(name + '_cap', r * 0.5, 0.05, (p.x, p.y, p.z - 0.04), mat=flat(wire, 0.5), segs=8))
        objs.append(sphere(name + '_bulb', r, (p.x, p.y, p.z - 0.05 - r * 0.8), m, scale=(1, 1, 1.2), segs=10,
                           rings=8))
    return objs


def rope_rail(name, pts, r=0.022, col='#D9C39A'):
    return L.smooth_tube(name, pts, r, flat(col, 0.85))


def plank_floor(name, x0, x1, y0, y1, z=0.0, t=0.08, along='x', seed=0, cols=None):
    """Wooden deck between x0..x1, y0..y1 (top at z), planks laid across `along` (harbor_lib deck_planks)."""
    if along == 'x':
        objs = H.deck_planks(name, x0, x1, y0, y1, along='x', pitch=0.22, z=z, t=t, seed=seed)
    else:
        objs = H.deck_planks(name, y0, y1, x0, x1, along='y', pitch=0.22, z=z, t=t, seed=seed)
    return objs


def deck_skirt(name, x0, x1, y0, y1, h=0.18, col=WOOD_D):
    """Low wooden fascia around a raised deck (sides the camera sees)."""
    m = tonal(col, 0.06, 4.0)
    return [box(name + '_f', (x1 - x0, 0.05, h), ((x0 + x1) / 2, y0 + 0.025, -h + 0.0), mat=m, bevel=0.01),
            box(name + '_r', (0.05, y1 - y0, h), (x1 - 0.025, (y0 + y1) / 2, -h + 0.0), mat=m, bevel=0.01)]


# =========================================================================== windows / doors / balconies

def gwin(name, loc, face='y-', w=0.5, h=0.62, frame=WHITE, shutters=None, curtain=None, sill=WHITE, arch=False,
         mull=True, lit=True, strength=2.0, glass_top='#CFEAF4', glass_bot='#7DBFDC', depth=0.1):
    """Warm-coast glass window (loc = bottom-centre of the glass ON the wall surface, z = sill height).
    Day: sky-reflecting glass + curtains; night: the glass glows warm (curtains stay dark silhouettes)."""
    fm = flat(frame, 0.7)
    gm = glass_mat(name + '_gl', glass_top, glass_bot, strength=strength, lit=lit)
    objs = []
    if arch:
        objs.append(T.ext_xz(name + '_fr', PA.arch_pts(w + 0.14, h + 0.08, 12), depth, fm, y=0.0))
        objs[-1].location.z = -0.04
        objs.append(T.ext_xz(name + '_g', PA.arch_pts(w, h, 12), depth, gm, y=-0.02))
        front_y = -depth - 0.02
    else:
        objs.append(box(name + '_fr', (w + 0.14, depth, h + 0.14), (0, -0.01, -0.07), mat=fm, bevel=0.025))
        objs.append(box(name + '_g', (w, depth, h), (0, -0.035, 0.0), mat=gm, bevel=0.008))
        front_y = -depth - 0.002
    if mull:
        objs.append(box(name + '_m1', (0.04, 0.02, h * (0.98 if not arch else 0.9)), (0, front_y - 0.005, 0.0), mat=fm,
                        bevel=0.0))
        objs.append(box(name + '_m2', (w, 0.02, 0.04), (0, front_y - 0.005, h * (0.62 if not arch else 0.5)), mat=fm,
                        bevel=0.0))
    if curtain:
        cm = flat(curtain, 0.85)
        for s in (-1, 1):
            objs.append(box(name + '_cu', (w * 0.24, 0.012, h * (0.86 if not arch else 0.62)),
                            (s * (w / 2 - w * 0.12), front_y - 0.012, h * 0.06), mat=cm, bevel=0.004))
    # glass sheen
    objs.append(box(name + '_sh', (0.035, 0.008, h * 0.6), (-w * 0.26, front_y - 0.006, h * 0.2), rot=(0, -28, 0),
                    mat=flat('#F2FBFF', 0.1), bevel=0.0))
    if sill:
        objs.append(box(name + '_sill', (w + 0.24, 0.16, 0.05), (0, -0.07, -0.12), mat=flat(sill, 0.7), bevel=0.015))
    if shutters:
        sm = L.stripes(shutters, hexmix(shutters, '#000000', 0.12), 1.0 / 0.06, 'Z', soft=0.1)
        for s in (-1, 1):
            objs.append(box(name + '_sh%d' % (s > 0), (w * 0.42, 0.05, h + 0.06), (s * (w / 2 + w * 0.24), -0.02,
                                                                                  -0.03), mat=sm, bevel=0.015))
    return T.face_group(objs, face, loc, name)


def glass_door(name, loc, face='y-', w=1.0, h=1.5, frame='#E9E4DA', double=True, handle=GOLD, lit=True,
               strength=2.2, glass_top='#D7EFF6', glass_bot='#86C6DF'):
    """Glass entrance door(s) in a light frame (loc = bottom-centre on the wall)."""
    fm = flat(frame, 0.5, 0.3)
    gm = glass_mat(name + '_gl', glass_top, glass_bot, strength=strength, lit=lit)
    objs = [box(name + '_fr', (w + 0.14, 0.1, h + 0.08), (0, -0.01, 0.0), mat=fm, bevel=0.02),
            box(name + '_g', (w, 0.1, h), (0, -0.04, 0.02), mat=gm, bevel=0.005)]
    if double:
        objs.append(box(name + '_mid', (0.05, 0.11, h), (0, -0.05, 0.02), mat=fm, bevel=0.0))
    objs.append(box(name + '_kick', (w, 0.11, 0.12), (0, -0.05, 0.02), mat=fm, bevel=0.0))
    for s in ((-1, 1) if double else (1,)):
        objs.append(box(name + '_hd', (0.03, 0.05, 0.42), (s * 0.08, -0.12, h * 0.38), mat=flat(handle, 0.3, 0.8),
                        bevel=0.01))
    objs.append(box(name + '_sh', (0.04, 0.008, h * 0.55), (-w * 0.3, -0.095, h * 0.3), rot=(0, -24, 0),
                    mat=flat('#F2FBFF', 0.1), bevel=0.0))
    return T.face_group(objs, face, loc, name)


def balcony(name, loc, face='y-', w=1.1, depth=0.5, rail=WHITE, rail_top=TURQ, floor=STUCCO_W, items=(),
            seed=0, h=0.5, tag_front=True):
    """Balcony slab + baluster railing on a wall (loc = slab top-centre ON the wall surface).
    items: 'parasol:c1:c2', 'towel:c', 'chair:c', 'plant', 'lounger:c'.  Returns (group, standing point in local
    face coords) - the railing is tagged front() for the overlay pass."""
    fm = flat(floor, 0.75)
    rm = flat(rail, 0.55)
    tm = flat(rail_top, 0.5)
    objs = [box(name + '_slab', (w + 0.1, depth, 0.1), (0, -depth / 2, -0.1), mat=fm, bevel=0.03),
            box(name + '_lip', (w + 0.14, depth + 0.04, 0.05), (0, -depth / 2 - 0.02, -0.14), mat=fm, bevel=0.02)]
    rails = []
    n = max(3, int(round(w / 0.11)))
    for k in range(n + 1):
        x = -w / 2 + w * k / n
        rails.append(cyl(name + '_bal', 0.017, h, (x, -depth + 0.03, 0.0), mat=rm, segs=6, bevel=0.0))
    m = max(2, int(round(depth / 0.11)))
    for s in (-1, 1):
        for k in range(m):
            y = -depth + 0.03 + (depth - 0.06) * k / m
            rails.append(cyl(name + '_bals', 0.017, h, (s * w / 2, y, 0.0), mat=rm, segs=6, bevel=0.0))
        rails.append(box(name + '_tops', (0.055, depth, 0.05), (s * w / 2, -depth / 2, h), mat=tm, bevel=0.015))
    rails.append(box(name + '_top', (w + 0.055, 0.055, 0.05), (0, -depth + 0.03, h), mat=tm, bevel=0.015))
    rails.append(box(name + '_bot', (w, 0.04, 0.035), (0, -depth + 0.03, 0.06), mat=rm, bevel=0.01))
    objs += rails
    stand = (0.0, -depth * 0.45)
    for it in items:
        p = it.split(':')
        if p[0] == 'parasol':
            objs.append(parasol(name + '_ps', (-w * 0.28, -depth * 0.5, 0.0), r=0.36, h=1.05, c1=p[1],
                                c2=p[2] if len(p) > 2 else WHITE, n=6, base=False))
            stand = (w * 0.18, -depth * 0.45)
        elif p[0] == 'towel':
            t = towel_hang(name + '_tw', (w * 0.22 if len(p) < 3 else float(p[2]) * w, -depth + 0.03, h + 0.04),
                           c=p[1], w=0.26, h=0.36)
            objs.append(t)
            rails.append(t)
        elif p[0] == 'chair':
            objs.append(deck_chair(name + '_ch', (-w * 0.3, -depth * 0.55, 0.0), rz=20.0, col=p[1]))
        elif p[0] == 'plant':
            objs += pot_plant(name + '_pl', (w * 0.36, -depth * 0.45, 0.0), r=0.09, kind='flowers', seed=seed)
        elif p[0] == 'table':
            objs.append(cyl(name + '_tb', 0.13, 0.03, (w * 0.3, -depth * 0.5, 0.42), mat=flat(WHITE, 0.4), segs=16))
            objs.append(cyl(name + '_tl', 0.015, 0.42, (w * 0.3, -depth * 0.5, 0.0), mat=flat(WHITE, 0.4), segs=6))
    g = T.face_group(objs, face, loc, name)
    if tag_front:
        front(rails)
    return g, stand


def face_to_local(face, loc, p):
    """Point p = (x, y[, z]) in a FACE frame placed at loc -> local build coordinates."""
    rz = math.radians(T.FACE_RZ[face])
    x, y = p[0], p[1]
    z = p[2] if len(p) > 2 else 0.0
    return (loc[0] + x * math.cos(rz) - y * math.sin(rz), loc[1] + x * math.sin(rz) + y * math.cos(rz), loc[2] + z)


def canopy_flat(name, x0, x1, y0, y1, z, t=0.12, col=WHITE, edge=TURQ, posts=(), post_col=WHITE, light=True,
                top=None):
    """Flat entrance canopy slab with a coloured fascia, optional posts [(x, y)], underside downlights.
    top = optional material for the slab (e.g. a striped canvas top)."""
    objs = [box(name, (x1 - x0, y1 - y0, t), ((x0 + x1) / 2, (y0 + y1) / 2, z), mat=top or flat(col, 0.6),
                bevel=0.03),
            box(name + '_fa', (x1 - x0 + 0.04, 0.06, t + 0.08), ((x0 + x1) / 2, y0 - 0.01, z - 0.04),
                mat=flat(edge, 0.5), bevel=0.02),
            box(name + '_fs', (0.06, y1 - y0, t + 0.08), (x1 + 0.01, (y0 + y1) / 2, z - 0.04), mat=flat(edge, 0.5),
                bevel=0.02)]
    for px, py in posts:
        objs.append(cyl(name + '_post', 0.07, z, (px, py, 0.0), mat=flat(post_col, 0.5), segs=16, bevel=0.02))
        objs.append(cyl(name + '_pb', 0.11, 0.1, (px, py, 0.0), mat=flat(post_col, 0.5), segs=16, bevel=0.02))
    if light:
        for k in range(3):
            x = x0 + (x1 - x0) * (k + 0.5) / 3
            m = neon_mat(name + '_dl%d' % k, '#FFF1C8', 0.8, 5.0)
            objs.append(cyl(name + '_dl', 0.06, 0.02, (x, (y0 + y1) / 2, z - 0.015), mat=m, segs=12))
    return objs


def pennant_line(name, p0, p1, n=8, sag=0.18, cols=(CORAL, LEMON, AQUA, WHITE, PINK, TURQ), size=0.16):
    return H.signal_flags(name, p0, p1, n=n, sag=sag, size=size, cols=cols)


def stairs(name, x, y0, z_top, w=1.0, n=None, depth=0.26, col=WHITE, axis='y'):
    """Steps descending toward -Y from a landing at z_top (front edge at y0)."""
    n = n or max(1, int(round(z_top / 0.16)))
    h = z_top / n
    objs = []
    for k in range(n):
        zt = z_top - k * h
        if axis == 'y':
            objs.append(box(name, (w, depth * (k + 1), zt), (x, y0 - depth * (k + 1) / 2, 0.0),
                            mat=tonal(col, 0.04, 5.0, rough=0.8), bevel=0.02))
    return objs


# =========================================================================== emblems (SIGN frame, ~0.8 m at s=1)

def em_sun(s=1.0, col=LEMON, ray=GOLD, face=True):
    """Smiling sun with triangular rays."""
    m = flat(col, 0.45)
    objs = [cyl('sun', 0.24 * s, 0.1 * s, (0, 0, 0), rot=(90, 0, 0), mat=m, segs=36, origin='center', bevel=0.03 * s)]
    rm = flat(ray, 0.45)
    for k in range(12):
        a = math.tau * k / 12
        pts = [(0.3 * s * math.cos(a - 0.12), 0.3 * s * math.sin(a - 0.12)),
               (0.42 * s * math.cos(a), 0.42 * s * math.sin(a)),
               (0.3 * s * math.cos(a + 0.12), 0.3 * s * math.sin(a + 0.12))]
        objs.append(T.ext_xz('ray', pts, 0.06 * s, rm, y=-0.02 * s, bevel=0.01))
    if face:
        ink = flat(INK, 0.4)
        for sx in (-1, 1):
            objs.append(sphere('se', 0.03 * s, (sx * 0.08 * s, -0.06 * s, 0.05 * s), ink, scale=(1, 0.5, 1.3),
                               segs=10, rings=6))
            objs.append(sphere('sb', 0.04 * s, (sx * 0.15 * s, -0.055 * s, -0.04 * s), flat('#F7A08A', 0.6),
                               scale=(1.2, 0.4, 0.8), segs=10, rings=6))
        mb = L.MB()
        T.ring_seg(mb, (0, -0.06 * s, -0.01 * s), 0.08 * s, 0.014 * s, ink, axis='y', a0=math.pi * 1.15,
                   a1=math.pi * 1.85, n=8)
        objs.append(mb.done('smile'))
    return objs


def em_icecream(s=1.0, scoops=(PINK, MINT, LEMON), cone='#D9A35A', cherry=True):
    objs = []
    cm = L.stripes(cone, hexmix(cone, '#000000', 0.18), 1.0 / (0.07 * s), 'X', soft=0.15)
    objs.append(T.ext_xz('cone', [(-0.17 * s, 0.05 * s), (0.17 * s, 0.05 * s), (0.0, -0.42 * s)], 0.12 * s, cm))
    for k, c in enumerate(scoops[:2]):
        x = (-0.08 + 0.16 * k) * s
        objs.append(sphere('scoop', 0.15 * s, (x, -0.06 * s, 0.13 * s), flat(c, 0.55), scale=(1, 0.75, 0.95),
                           segs=20, rings=12))
    if len(scoops) > 2:
        objs.append(sphere('scoop3', 0.15 * s, (0.0, -0.07 * s, 0.31 * s), flat(scoops[2], 0.55),
                           scale=(1, 0.75, 0.95), segs=20, rings=12))
    if cherry:
        objs.append(sphere('cherry', 0.055 * s, (0.02 * s, -0.1 * s, 0.48 * s), flat(RED, 0.3), segs=12, rings=8))
        mb = L.MB()
        mb.seg((0.02 * s, -0.1 * s, 0.52 * s), (0.07 * s, -0.1 * s, 0.6 * s), 0.008 * s, flat('#4E7A3A', 0.6))
        objs.append(mb.done('stem'))
    return objs


def em_cocktail(s=1.0, drink=CORAL):
    """Coconut drink with a straw and a paper umbrella."""
    objs = [sphere('coco', 0.22 * s, (0, 0, -0.12 * s), flat('#7A5232', 0.7), scale=(1, 0.7, 0.9), segs=22,
                   rings=12),
            cyl('cocotop', 0.17 * s, 0.03 * s, (0, -0.02 * s, 0.05 * s), rot=(90, 0, 0), mat=flat('#F7F1E2', 0.6),
                segs=24, origin='center')]
    mb = L.MB()
    mb.seg((0.05 * s, -0.06 * s, 0.0), (0.18 * s, -0.06 * s, 0.35 * s), 0.02 * s, flat(PINK, 0.5), segs=8)
    objs.append(mb.done('straw'))
    um = cone_wedges('umb', 0.18 * s, 0.07 * s, (-0.1 * s, -0.08 * s, 0.32 * s), [flat(TURQ, 0.6), flat(LEMON, 0.6)],
                     n=6, rot=(0, -25, 0))
    objs.append(um)
    mb2 = L.MB()
    mb2.seg((-0.1 * s, -0.08 * s, 0.32 * s), (-0.02 * s, -0.08 * s, 0.05 * s), 0.008 * s, flat(WOOD, 0.6))
    objs.append(mb2.done('ustick'))
    objs.append(sphere('lime', 0.07 * s, (0.17 * s, -0.08 * s, 0.05 * s), flat('#9BD54A', 0.5), scale=(1, 0.4, 1),
                       segs=12, rings=8))
    return objs


def em_iced(s=1.0, drink='#C98A5A', cup='#F4F1EA'):
    """Tall iced drink with straw (beach cafe)."""
    objs = [T.ext_xz('glass', [(-0.15 * s, -0.36 * s), (0.15 * s, -0.36 * s), (0.19 * s, 0.22 * s),
                                (-0.19 * s, 0.22 * s)], 0.1 * s, flat('#E9F6FA', 0.15)),
            T.ext_xz('drink', [(-0.13 * s, -0.33 * s), (0.13 * s, -0.33 * s), (0.165 * s, 0.1 * s),
                                (-0.165 * s, 0.1 * s)], 0.1 * s, flat(drink, 0.4), y=-0.01 * s),
            T.ext_xz('cream', T.rounded_rect_pts(0.4 * s, 0.12 * s, 0.05 * s, cz=0.24 * s), 0.11 * s,
                     flat('#FFF8EC', 0.6), y=-0.01 * s)]
    for k in range(3):
        objs.append(box('ice', (0.07 * s, 0.03 * s, 0.07 * s), ((-0.06 + 0.06 * k) * s, -0.11 * s, (-0.05 + 0.08 *
                                                                                                      (k % 2)) * s),
                        rot=(0, 20 * k, 0), mat=flat('#F2FBFF', 0.1), bevel=0.01 * s, origin='center'))
    mb = L.MB()
    mb.seg((0.05 * s, -0.06 * s, 0.1 * s), (0.16 * s, -0.06 * s, 0.48 * s), 0.02 * s, flat(TURQ, 0.5), segs=8)
    objs.append(mb.done('straw'))
    return objs


def em_shell(s=1.0, col=PEACH):
    """Scallop shell."""
    pts = [(0.0, -0.28 * s)]
    for k in range(25):
        a = math.radians(200 - 220 * k / 24)
        r = 0.36 * s * (1.0 + 0.06 * math.cos(9 * a * 2))
        pts.append((r * math.cos(a) * 0.95, r * math.sin(a) * 0.8 - 0.02 * s))
    m = flat(col, 0.5)
    objs = [T.ext_xz('shell', pts, 0.08 * s, m)]
    rib = flat(hexmix(col, '#000000', 0.15), 0.5)
    mb = L.MB()
    for k in range(7):
        a = math.radians(160 - 140 * k / 6)
        mb.seg((0, -0.09 * s, -0.24 * s), (0.3 * s * math.cos(a), -0.09 * s, 0.26 * s * math.sin(a)), 0.012 * s, rib)
    objs.append(mb.done('ribs'))
    objs.append(T.ext_xz('hinge', [(-0.1 * s, -0.36 * s), (0.1 * s, -0.36 * s), (0.06 * s, -0.24 * s),
                                    (-0.06 * s, -0.24 * s)], 0.085 * s, m))
    return objs


def em_starfish(s=1.0, col=CORAL):
    m = flat(col, 0.5)
    objs = [T.ext_xz('star', T.star_pts(0.38 * s, 0.17 * s), 0.08 * s, m, bevel=0.03 * s)]
    dm = flat('#FFE1C8', 0.5)
    for k in range(10):
        a = math.pi / 2 + math.tau * (k // 2) / 5
        rr = (0.12 + 0.1 * (k % 2)) * s
        objs.append(sphere('dot', 0.022 * s, (rr * math.cos(a), -0.09 * s, rr * math.sin(a)), dm, segs=8, rings=6))
    return objs


def em_swimring(s=1.0, c1=CORAL, c2=WHITE):
    return [H.torus('ring', 0.24 * s, 0.1 * s, (0, 0, 0), rot=(90, 0, 0), mats=[flat(c1, 0.45), flat(c2, 0.5)],
                    seg_fn=lambda j: (j // 4) % 2, M=32, K=12)]


def em_surfboard(s=1.0, col=TURQ, stripe=LEMON):
    pts = []
    for k in range(25):
        t = k / 24
        a = math.tau * t
        pts.append((0.13 * s * math.sin(a), 0.42 * s * math.cos(a) * (1.0 if math.cos(a) > 0 else 0.92)))
    objs = [T.ext_xz('board', pts, 0.06 * s, flat(col, 0.35)),
            T.ext_xz('bstripe', T.rounded_rect_pts(0.035 * s, 0.7 * s, 0.015 * s), 0.065 * s, flat(stripe, 0.4),
                     y=-0.005 * s)]
    for o in objs:
        o.rotation_euler.y = math.radians(-25)
    return objs


def em_info(s=1.0, col=WHITE):
    m = flat(col, 0.4)
    return [cyl('idot', 0.07 * s, 0.08 * s, (0, -0.02 * s, 0.2 * s), rot=(90, 0, 0), mat=m, segs=20, origin='center'),
            T.ext_xz('ibar', T.rounded_rect_pts(0.12 * s, 0.36 * s, 0.03 * s, cz=-0.1 * s), 0.08 * s, m, y=0.02 * s)]


def em_whale(s=1.0, col='#5C8FD6', belly='#E9F4FA'):
    """Cute whale with a water spout (aquarium)."""
    m = flat(col, 0.5)
    objs = [sphere('wbody', 0.25 * s, (-0.02 * s, 0, -0.04 * s), m, scale=(1.35, 0.6, 0.85), segs=24, rings=14),
            sphere('wbelly', 0.2 * s, (0.0, -0.06 * s, -0.11 * s), flat(belly, 0.5), scale=(1.3, 0.5, 0.55), segs=20,
                   rings=10)]
    objs.append(T.ext_xz('tail', [(-0.3 * s, -0.04 * s), (-0.48 * s, 0.16 * s), (-0.4 * s, 0.02 * s),
                                   (-0.5 * s, -0.08 * s)], 0.08 * s, m, y=0.03 * s))
    objs.append(sphere('weye', 0.028 * s, (0.17 * s, -0.13 * s, 0.02 * s), flat(INK, 0.3), segs=10, rings=6))
    objs.append(sphere('wcheek', 0.035 * s, (0.21 * s, -0.12 * s, -0.06 * s), flat('#F7A0A0', 0.6),
                       scale=(1.2, 0.4, 0.8), segs=10, rings=6))
    mb = L.MB()
    wm = flat('#8FD3F5', 0.3)
    mb.seg((0.05 * s, -0.02 * s, 0.17 * s), (0.05 * s, -0.02 * s, 0.32 * s), 0.025 * s, wm)
    for sx in (-1, 1):
        mb.seg((0.05 * s, -0.02 * s, 0.32 * s), (0.05 * s + sx * 0.1 * s, -0.02 * s, 0.38 * s), 0.02 * s, wm)
        mb.sphere(0.03 * s, wm, loc=(0.05 * s + sx * 0.11 * s, -0.02 * s, 0.38 * s), segs=8, rings=6)
    objs.append(mb.done('spout'))
    return objs


def em_joystick(s=1.0):
    """Arcade: a star with a coin."""
    objs = [T.ext_xz('astar', T.star_pts(0.36 * s, 0.16 * s), 0.08 * s, flat(LEMON, 0.4), bevel=0.02 * s)]
    objs.append(cyl('acoin', 0.11 * s, 0.05 * s, (0.2 * s, -0.08 * s, -0.2 * s), rot=(90, 0, 0),
                    mat=flat(GOLD, 0.3, 0.8), segs=24, origin='center', bevel=0.01 * s))
    return objs


def em_shellfish_grill(s=1.0):
    """Seafood BBQ: a clam on a little grill with flames."""
    objs = []
    gm = flat('#3D424C', 0.5, 0.5)
    mb = L.MB()
    for k in range(5):
        x = (-0.24 + 0.12 * k) * s
        mb.seg((x, -0.02 * s, -0.12 * s), (x, -0.02 * s, -0.12 * s + 0.001), 0.012 * s, gm)
    mb.seg((-0.3 * s, -0.05 * s, -0.12 * s), (0.3 * s, -0.05 * s, -0.12 * s), 0.02 * s, gm)
    objs.append(mb.done('grate'))
    fm = flat('#FF8A2A', 0.5, emission='#FF8A2A', emission_strength=0.6)
    for k in range(3):
        x = (-0.16 + 0.16 * k) * s
        objs.append(T.ext_xz('flame', [(x - 0.06 * s, -0.36 * s), (x + 0.06 * s, -0.36 * s), (x + 0.02 * s, -0.18 * s),
                                        (x, -0.15 * s), (x - 0.03 * s, -0.2 * s)], 0.05 * s, fm, y=0.01 * s))
    objs.append(sphere('clam', 0.2 * s, (0, -0.02 * s, 0.02 * s), flat('#F1E3C8', 0.5), scale=(1.2, 0.5, 0.75),
                       segs=22, rings=12))
    objs.append(sphere('clamtop', 0.19 * s, (0, -0.02 * s, 0.13 * s), flat('#E3C9A1', 0.5), scale=(1.2, 0.45, 0.5),
                       rot=(-12, 0, 0), segs=22, rings=12))
    objs.append(PA.fish_model('gfish', length=0.36 * s, height=0.15 * s, thick=0.07 * s,
                              loc=(0.05 * s, -0.12 * s, 0.32 * s), rot=(90, 0, 0)))
    return objs


def em_house(s=1.0, wall=WHITE, roof=TERRA, heart=PINK):
    """Pension: little house with a heart window."""
    objs = [T.ext_xz('hwall', [(-0.24 * s, -0.32 * s), (0.24 * s, -0.32 * s), (0.24 * s, 0.05 * s),
                                (-0.24 * s, 0.05 * s)], 0.08 * s, flat(wall, 0.5)),
            T.ext_xz('hroof', [(-0.34 * s, 0.02 * s), (0.34 * s, 0.02 * s), (0.0, 0.34 * s)], 0.09 * s,
                     flat(roof, 0.5), y=-0.005 * s)]
    hp = [(x * 0.55, z * 0.55 - 0.12 * s) for x, z in T.heart_pts(0.3 * s)]
    objs.append(T.ext_xz('hheart', hp, 0.09 * s, flat(heart, 0.5), y=-0.005 * s))
    return objs


def em_basket(s=1.0):
    return T.em_basket(s, col=TURQ)


def em_lifeguard(s=1.0):
    objs = [H.torus('lr', 0.26 * s, 0.085 * s, (0, 0, 0), rot=(90, 0, 0), mats=[flat(RED, 0.45), flat(WHITE, 0.5)],
                    seg_fn=lambda j: (j // 4) % 2, M=32, K=12)]
    cm = flat(RED, 0.45)
    objs.append(box('cx', (0.2 * s, 0.06 * s, 0.07 * s), (0, -0.02 * s, -0.035 * s), mat=cm, bevel=0.01,
                    origin='center'))
    objs.append(box('cz', (0.07 * s, 0.06 * s, 0.2 * s), (0, -0.02 * s, -0.1 * s), mat=cm, bevel=0.01))
    return objs


def em_figures(s=1.0):
    """Restroom: two pictogram figures (blue + pink)."""
    objs = []
    for sx, col, dress in ((-1, '#3D7CC9', False), (1, '#E8749A', True)):
        x = sx * 0.17 * s
        m = flat(col, 0.5)
        objs.append(cyl('fh', 0.06 * s, 0.06 * s, (x, -0.02 * s, 0.22 * s), rot=(90, 0, 0), mat=m, segs=16,
                        origin='center'))
        if dress:
            objs.append(T.ext_xz('fd', [(x - 0.11 * s, -0.12 * s), (x + 0.11 * s, -0.12 * s), (x + 0.05 * s, 0.13 * s),
                                         (x - 0.05 * s, 0.13 * s)], 0.06 * s, m))
        else:
            objs.append(T.ext_xz('fb', T.rounded_rect_pts(0.14 * s, 0.26 * s, 0.03 * s, cx=x, cz=0.0), 0.06 * s, m))
        for lx in (-0.035, 0.035):
            objs.append(T.ext_xz('fl', T.rounded_rect_pts(0.04 * s, 0.17 * s, 0.015 * s, cx=x + lx * s, cz=-0.2 * s),
                                 0.06 * s, m))
    return objs


def em_umbrella(s=1.0):
    objs = [cone_wedges('eu', 0.36 * s, 0.14 * s, (0, 0, 0.0), [flat(CORAL, 0.6), flat(WHITE, 0.6)], n=8,
                        rot=(90 - 20, 0, 0))]
    mb = L.MB()
    mb.seg((0, 0.05 * s, 0.0), (0, -0.1 * s, -0.38 * s), 0.018 * s, flat(WHITE, 0.5))
    objs.append(mb.done('eupole'))
    return objs


# =========================================================================== bigger shared pieces

def awning(face, W, wall, z_back, z_front, depth, c1, c2=WHITE, n=8, x=0.0, name='awn', scallop=True):
    """Striped scalloped awning (prop_assets.awning without snow) on face 'y-' (wall at y = wall) or 'x+'."""
    with L.Collect() as c:
        PA.awning(W, depth, z_back, z_front, -abs(wall), -abs(wall) - depth, c1, c2, n, name=name, x=x,
                  flaps=scallop, snow=False)
    if face == 'x+':
        BA.regroup(c.objs, name + '_r', rot=(0, 0, 90))
    return c.objs


def awning_at(name, face, loc, W, depth, z_back, z_front, c1, c2=WHITE, n=8, scallop=True):
    """Awning in a FACE frame at loc (wall surface point, z = 0 reference)."""
    with L.Collect() as c:
        PA.awning(W, depth, z_back, z_front, 0.0, -depth, c1, c2, n, name=name, x=0.0, flaps=scallop, snow=False)
    return T.face_group(c.objs, face, loc, name + '_g')


def sign_board(name, center, w=1.6, h=0.5, bg='#FFF8EC', frame=TURQ, psi_=None, t=0.08, posts=None, lit=True,
               bulbs=0):
    """Blank rectangular sign board (game writes the name at its centre) facing psi; optional marquee bulbs.  lit:
    the board face glows softly at night (an illuminated sign the name is written on)."""
    fm = flat(frame, 0.5)
    bm = flat(bg, 0.6)
    if lit:
        bm = L.NB(name + '_bdm', rough=0.6).m
        p = bm.node_tree.nodes.get('Principled BSDF')
        p.inputs['Base Color'].default_value = (*bc.srgb_to_linear(L.adj(bg)), 1.0)
        night(bm, '#FFE9B8', 1.1)
    objs = [box(name + '_fr', (w + 0.12, t, h + 0.12), (0, 0.01, -(h + 0.12) / 2), mat=fm, bevel=0.03),
            box(name + '_bd', (w, t, h), (0, -0.02, -h / 2), mat=bm, bevel=0.02)]
    if bulbs:
        bm_ = neon_mat(name + '_bulb', '#FFF1C8', 0.9, 4.0)
        nb = bulbs
        for k in range(nb):
            u = k / nb
            per = 2 * (w + h)
            d = u * per
            if d < w:
                p = (-w / 2 + d, h / 2 + 0.03)
            elif d < w + h:
                p = (w / 2 + 0.03, h / 2 - (d - w))
            elif d < 2 * w + h:
                p = (w / 2 - (d - w - h), -h / 2 - 0.03)
            else:
                p = (-w / 2 - 0.03, -h / 2 + (d - 2 * w - h))
            objs.append(sphere(name + '_b', 0.035, (p[0], -0.06, p[1]), bm_, segs=8, rings=6))
    g = L.group(objs, name, loc=center, rot=(0, 0, psi() if psi_ is None else psi_))
    return g


def lamp_post(name, loc, h=2.5, col=WHITE, head=TURQ, strength=3.0, kind='lantern'):
    """Seaside lamp post: white fluted post, nautical lantern head (turquoise cap) - night glow registered."""
    x, y, z = loc
    pm = flat(col, 0.45)
    hm = flat(head, 0.45)
    objs = [cyl(name + '_base', 0.15, 0.26, (x, y, z), mat=pm, segs=16, r_top=0.1, bevel=0.03),
            cyl(name + '_post', 0.055, h - 0.26, (x, y, z + 0.26), mat=pm, segs=14, r_top=0.045)]
    for k in range(3):
        objs.append(cyl(name + '_ring', 0.07, 0.035, (x, y, z + 0.6 + 0.6 * k), mat=hm, segs=14))
    gm = neon_mat(name + '_gl', '#FFE6A8', 1.2, 5.0)
    objs.append(cyl(name + '_cup', 0.07, 0.06, (x, y, z + h), mat=hm, segs=12, r_top=0.12))
    objs.append(cyl(name + '_gl', 0.13, 0.3, (x, y, z + h + 0.06), mat=gm, segs=16, r_top=0.15, bevel=0.02))
    for a in range(4):
        aa = math.tau * a / 4 + math.pi / 4
        objs.append(box(name + '_bar', (0.022, 0.022, 0.3), (x + 0.145 * math.cos(aa), y + 0.145 * math.sin(aa),
                                                             z + h + 0.06), mat=hm, bevel=0.0))
    objs.append(cyl(name + '_hat', 0.22, 0.13, (x, y, z + h + 0.36), mat=hm, segs=16, r_top=0.05, bevel=0.02))
    objs.append(sphere(name + '_knob', 0.05, (x, y, z + h + 0.52), hm, segs=10, rings=6))
    light_pt((x, y, z + h + 0.2), 'lamp', 1.2)
    return objs, (x, y, z + h + 0.2)


def luggage_cart(name, loc, rz=0.0):
    """Brass hotel luggage trolley with suitcases + a hat box."""
    br = flat(GOLD, 0.3, 0.85)
    objs = [box(name + '_deck', (0.9, 0.5, 0.06), (0, 0, 0.16), mat=flat('#B0303A', 0.6), bevel=0.02)]
    for sx in (-1, 1):
        objs.append(cyl(name + '_wh', 0.07, 0.04, (sx * 0.35, -0.26, 0.07), rot=(90, 0, 0), mat=flat(INK, 0.5),
                        segs=14, origin='center'))
        objs.append(cyl(name + '_wh2', 0.07, 0.04, (sx * 0.35, 0.26, 0.07), rot=(90, 0, 0), mat=flat(INK, 0.5),
                        segs=14, origin='center'))
    mb = L.MB()
    for sx in (-1, 1):
        mb.seg((sx * 0.42, 0, 0.2), (sx * 0.42, 0, 1.45), 0.025, br)
        mb.seg((sx * 0.42, -0.22, 0.2), (sx * 0.42, 0.22, 0.2), 0.02, br)
    pts = [(-0.42 + 0.84 * k / 12, 0, 1.45 + 0.18 * math.sin(math.pi * k / 12)) for k in range(13)]
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, 0.025, br)
    mb.seg((-0.42, 0, 0.9), (0.42, 0, 0.9), 0.015, br)
    objs.append(mb.done(name + '_frame'))
    objs.append(box(name + '_s1', (0.62, 0.36, 0.22), (-0.04, 0.0, 0.22), mat=flat('#3D7CC9', 0.6), bevel=0.04))
    objs.append(box(name + '_s2', (0.48, 0.3, 0.3), (0.0, 0.0, 0.44), rot=(0, 0, 6), mat=flat(CORAL, 0.6), bevel=0.05))
    objs.append(box(name + '_s3', (0.32, 0.22, 0.24), (-0.05, 0.02, 0.74), rot=(0, 0, -8), mat=flat(LEMON, 0.6),
                    bevel=0.04))
    objs.append(cyl(name + '_hb', 0.12, 0.14, (0.2, 0.0, 0.74), mat=flat(MINT, 0.6), segs=18, bevel=0.02))
    for b in (objs[-4], objs[-3]):
        pass
    objs.append(box(name + '_st', (0.62, 0.04, 0.05), (-0.04, -0.17, 0.32), mat=flat('#7A4A2A', 0.6), bevel=0.01))
    return L.group(objs, name, loc=loc, rot=(0, 0, rz))


def flag_pole(name, loc, h=3.2, col=TURQ, w=0.6, fh=0.4, seed=0):
    x, y, z = loc
    objs = [cyl(name + '_pole', 0.035, h, (x, y, z), mat=flat(WHITE, 0.4), segs=10),
            sphere(name + '_top', 0.055, (x, y, z + h + 0.03), flat(GOLD, 0.3, 0.8), segs=10, rings=6),
            PA.flag(name + '_flag', (x + 0.03, y, z + h - 0.06), w, fh, col, seed=seed, emblem=True)]
    return objs


# =========================================================================== roofs

def tile_roof_mat(col=TERRA, rows=0.17):
    """Terracotta tile courses: horizontal bands (object Z) + a faint vertical joint pattern."""
    return L.stripes(col, hexmix(col, '#000000', 0.16), 1.0 / rows, 'Z', rough=0.7, soft=0.12)


def barrel_roof_mat(col=TERRA, pitch=0.17, course=0.21):
    """Mediterranean barrel tiles: rounded tile crowns running DOWN every slope (light crowns, darker channels) over
    horizontal courses with a shadow line.  The crown direction follows the OBJECT-space normal, so front / back
    slopes get crowns along X and the hip ends along Y (and a yaw-rotated `_x` build keeps them right)."""
    key = ('barrel', C_(col), pitch, course)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('barrel_' + C_(col).lstrip('#'), rough=0.6)
    tc = nb.n('ShaderNodeTexCoord')
    sp = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sp.inputs[0])
    sn = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Normal'], sn.inputs[0])
    ax = nb.math('ABSOLUTE', sn.outputs['X'])
    ay = nb.math('ABSOLUTE', sn.outputs['Y'])
    u = nb.math('ADD', nb.math('MULTIPLY', sp.outputs['X'], ay), nb.math('MULTIPLY', sp.outputs['Y'], ax))
    wave = nb.math('SINE', nb.math('MULTIPLY', u, math.tau / pitch))
    crown = nb.map_range(wave, -0.7, 1.0)
    c1 = nb.mix_rgb(crown, hexmix(col, '#000000', 0.2), hexmix(col, '#FFFFFF', 0.1))
    f = nb.math('FRACT', nb.math('MULTIPLY', sp.outputs['Z'], 1.0 / course))
    line = nb.map_range(f, 0.0, 0.16)
    nb.base(nb.mix_rgb(line, hexmix(col, '#000000', 0.3), c1))
    L._CUSTOM[key] = nb.m
    return nb.m


def C_(c):
    return L.C(c)


def eave_caps(name, ex0, ex1, ey0, ey1, z, rise, col=TERRA, pitch=0.17, r=0.055, length=0.2):
    """Row of round barrel-tile ends along the four eaves of a hip roof (eave rectangle ex0..ex1 x ey0..ey1 at z,
    ridge `rise` above it): a scalloped Mediterranean eave edge instead of a flat slab edge."""
    Wd, Dd = ex1 - ex0, ey1 - ey0
    d = min(Wd, Dd) / 2
    k = rise / d
    mb = L.MB()
    m = flat(hexmix(col, '#FFFFFF', 0.06), 0.6)
    edges = (((ex0, ey0), (1, 0), (0, 1)), ((ex0, ey1), (1, 0), (0, -1)),
             ((ex0, ey0), (0, 1), (1, 0)), ((ex1, ey0), (0, 1), (-1, 0)))
    for (sx, sy), (ux, uy), (nx, ny) in edges:
        L_ = Wd if ux else Dd
        n = int(L_ / pitch)
        off = (L_ - n * pitch) / 2
        for i in range(n + 1):
            t = off + i * pitch
            if t < 0.14 or t > L_ - 0.14:
                continue
            x, y = sx + ux * t, sy + uy * t
            p = Vector((x, y, z + 0.035))
            dvec = Vector((nx, ny, k)).normalized()
            mb.seg(p, p + dvec * length, r, m, segs=8)
    return mb.done(name)


def hip_roof(name, x0, x1, y0, y1, z, rise, over=0.3, col=TERRA, fascia=STUCCO_W, t=0.09, ridge_col=None,
             barrel=False):
    """Hip roof over the rectangle x0..x1, y0..y1 (eaves at z, overhang `over`), 45-degree hips in plan, ridge along
    the longer axis.  Returns (objs, roof_z(x, y) function for placing things on the slopes)."""
    ex0, ex1, ey0, ey1 = x0 - over, x1 + over, y0 - over, y1 + over
    Wd, Dd = ex1 - ex0, ey1 - ey0
    cx, cy = (ex0 + ex1) / 2, (ey0 + ey1) / 2
    bm = bmesh.new()
    if Wd >= Dd:
        d = Dd / 2
        r0, r1 = (ex0 + d, cy, z + rise), (ex1 - d, cy, z + rise)
    else:
        d = Wd / 2
        r0, r1 = (cx, ey0 + d, z + rise), (cx, ey1 - d, z + rise)
    c00, c10, c11, c01 = (ex0, ey0, z), (ex1, ey0, z), (ex1, ey1, z), (ex0, ey1, z)
    V = {k: bm.verts.new(v) for k, v in (('c00', c00), ('c10', c10), ('c11', c11), ('c01', c01), ('r0', r0),
                                          ('r1', r1))}
    if Wd >= Dd:
        faces = [('c00', 'c10', 'r1', 'r0'), ('c10', 'c11', 'r1'), ('c11', 'c01', 'r0', 'r1'), ('c01', 'c00', 'r0')]
    else:
        faces = [('c00', 'c10', 'r0'), ('c10', 'c11', 'r1', 'r0'), ('c11', 'c01', 'r1'), ('c01', 'c00', 'r0', 'r1')]
    for f in faces:
        bm.faces.new([V[k] for k in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=-t)
    m = barrel_roof_mat(col) if barrel else tile_roof_mat(col)
    objs = [L.finish(name, bm, [m], smooth=False)]
    rc = ridge_col or hexmix(col, '#000000', 0.25)
    rm = flat(rc, 0.6)
    mb = L.MB()
    mb.seg(r0, r1, 0.07, rm, segs=10)
    for c, r in ((c00, r0), (c01, r0), (c10, r1), (c11, r1)):
        mb.seg(c, r, 0.055, rm, segs=8)
    mb.sphere(0.09, rm, loc=r0, segs=10, rings=6)
    mb.sphere(0.09, rm, loc=r1, segs=10, rings=6)
    if barrel:                      # half-round ridge caps: little bumps along the ridge and the hips
        for (a_, b_) in [(r0, r1)] + [(c, r) for c, r in ((c00, r0), (c01, r0), (c10, r1), (c11, r1))]:
            A_, B_ = Vector(a_), Vector(b_)
            nn = max(2, int((B_ - A_).length / 0.26))
            for i in range(1, nn):
                mb.sphere(0.08, rm, loc=tuple(A_.lerp(B_, i / nn)), segs=10, rings=6)
    objs.append(mb.done(name + '_ridge'))
    if barrel:
        objs.append(eave_caps(name + '_eave', ex0, ex1, ey0, ey1, z, rise, col=col))
    fm = flat(fascia, 0.6)
    objs.append(box(name + '_fa', (Wd, 0.06, 0.12), (cx, ey0 + 0.03, z - 0.12), mat=fm, bevel=0.02))
    objs.append(box(name + '_fb', (Wd, 0.06, 0.12), (cx, ey1 - 0.03, z - 0.12), mat=fm, bevel=0.02))
    objs.append(box(name + '_fl', (0.06, Dd, 0.12), (ex0 + 0.03, cy, z - 0.12), mat=fm, bevel=0.02))
    objs.append(box(name + '_fr', (0.06, Dd, 0.12), (ex1 - 0.03, cy, z - 0.12), mat=fm, bevel=0.02))

    def roof_z(x, y):
        """Height of the roof surface above (x, y) (inside the eave rectangle)."""
        dist = min(x - ex0, ex1 - x, y - ey0, ey1 - y)
        return z + rise * min(1.0, max(0.0, dist / d))
    return objs, roof_z


def dormer(name, x, y_front, z0, w=0.8, h=0.75, depth=1.0, wall=STUCCO_W, roof=TERRA, curtain=LEMON, face='y-'):
    """Little roof dormer (front face at y_front, bottom at z0) with a gable cap and a glass window."""
    objs = [box(name + '_b', (w, depth, h), (x, y_front + depth / 2, z0), mat=stucco(wall), bevel=0.03)]
    with L.Collect() as c:
        T.gable(name + '_r', w, depth + 0.2, z0 + h, z0 + h + w * 0.45, 0.1, roof, stucco(wall), x=x,
                y=y_front + depth / 2 - 0.1, along='y', snow_frac=(0, 0))
    objs += c.objs
    objs.append(gwin(name + '_w', (x, y_front, z0 + 0.15), 'y-', w=w * 0.52, h=h * 0.6, arch=True, curtain=curtain,
                     sill=None))
    return objs


def roof_deck(name, W, D, z, x=0.0, y=0.0, wall=STUCCO_W, cap=TURQ, parapet=0.26, floor='#E9DFCC', t=0.14):
    """Flat roof with a light tiled deck (not the town's grey slab), a parapet and coloured caps."""
    objs = [box(name, (W, D, t), (x, y, z), mat=tile_mat(floor, hexmix(floor, '#000000', 0.06), 2.5,
                                                         hexmix(floor, '#000000', 0.15)), bevel=0.02)]
    pm = flat(wall, 0.75)
    cm = flat(cap, 0.5)
    pt = 0.14
    for sx, sy, cx, cy in ((W + 0.1, pt, 0, -D / 2), (W + 0.1, pt, 0, D / 2), (pt, D, -W / 2, 0), (pt, D, W / 2, 0)):
        objs.append(box(name + '_p', (sx, sy, parapet), (x + cx, y + cy, z), mat=pm, bevel=0.03))
        objs.append(box(name + '_c', (sx + 0.05, sy + 0.06, 0.06), (x + cx, y + cy, z + parapet), mat=cm, bevel=0.02))
    return objs


def shell(name, BX, BY, W, D, PL, H, wall, plinth='#D8CBB6', trim=None, trim_t=0.13):
    """Plinth + wall block + corner trims; returns (x0, x1, y0, y1)."""
    T.plinth(name + '_pl', W, D, h=PL, col=plinth, x=BX, y=BY)
    box(name, (W, D, H - PL), (BX, BY, PL), mat=wall if not isinstance(wall, str) else stucco(wall), bevel=0.04)
    if trim:
        T.corner_trims(name + '_ct', W, D, PL, H - PL, trim, t=trim_t, x=BX, y=BY)
    return BX - W / 2, BX + W / 2, BY - D / 2, BY + D / 2


def bulb_ring(name, pts, mats, r=0.04, closed=False):
    """Marquee bulbs along a polyline (list of 3D points), materials cycling through `mats` (phase groups)."""
    objs = []
    n = len(pts)
    for k, p in enumerate(pts):
        objs.append(sphere('%s%d' % (name, k), r, p, mats[k % len(mats)], segs=8, rings=6))
    return objs


def phase_mats(name, cols, n=4, day=0.9, strength=4.5):
    """n groups of neon materials (for chasing / twinkling bulbs): returns list of lists [[m per colour]]."""
    out = []
    for g in range(n):
        out.append([neon_mat('%s_%d_%d' % (name, g, c), col, day, strength) for c, col in enumerate(cols)])
    return out


def set_phase(groups, i, hi=2.6, lo=0.35):
    """Frame i of a chase: group i % n bright, the next one medium, the rest dim (day emission)."""
    n = len(groups)
    for g, ms in enumerate(groups):
        d = (g - i) % n
        s = hi if d == 0 else (hi * 0.45 if d == 1 else lo)
        for m in ms:
            L.set_emission(m, s)


def tank_glass(name, col='#7FD3F0', alpha=0.38, glow=0.35, night_col='#5BC8F0'):
    """See-through glowing aquarium / live-tank glass (alpha blended, so what is inside shows)."""
    nb = L.NB(name, rough=0.08)
    rgb = nb.rgb(col, raw=True)
    nb.p.inputs['Base Color'].default_value = rgb
    nb.p.inputs['Emission Color'].default_value = rgb
    nb.p.inputs['Emission Strength'].default_value = glow
    nb.p.inputs['Alpha'].default_value = alpha
    night(nb.m, night_col, 1.6)
    return nb.m


def thatch_mat(col=THATCH):
    """Straw thatch: course bands + streaky noise along the slope."""
    key = ('thatch', col)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('thatch', rough=0.95)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    band = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Z'], 1.0 / 0.16))
    band = nb.map_range(band, 0.55, 0.95)
    wv = nb.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z')
    wv.inputs['Scale'].default_value = 3.0
    wv.inputs['Distortion'].default_value = 6.0
    wv.inputs['Detail'].default_value = 3.0
    mp = nb.n('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (8.0, 8.0, 0.6)
    nb.link(tc.outputs['Object'], mp.inputs['Vector'])
    nb.link(mp.outputs['Vector'], wv.inputs['Vector'])
    streak = nb.map_range(wv.outputs['Fac'], 0.3, 0.8)
    c1 = nb.mix_rgb(streak, hexmix(col, '#000000', 0.12), hexmix(col, '#FFFFFF', 0.12))
    nb.base(nb.mix_rgb(band, c1, hexmix(col, '#000000', 0.25)))
    L._CUSTOM[key] = nb.m
    return nb.m
