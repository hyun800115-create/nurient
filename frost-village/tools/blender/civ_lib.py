"""
civ_lib.py - modelling + layering helpers for the v8 civic & incident set "살아 있는 도시"
(docs/CONTRACT_V8.md section AB): bank and police station rendered as aligned CUTAWAY layers, burnt ruins,
rubble, scorch, demolition fence, moving props.

Everything is built with the SAME helpers, palette, camera, light and PPU as the village / town / harbour
(bl_common, prop_lib, prop_assets, life_assets, bld_assets, town_lib - imported READ-ONLY, never modified).

Conventions (as bld_assets / town_assets)
  * 1 unit = 1 m, world origin = footprint centre = sprite anchor, local front = -Y (screen down-left); the +X side
    (screen down-right) is the other face the camera sees.  The camera looks from (+X, -Y) toward (-X, +Y): visible
    faces have normals -Y (front) and +X (right).  Inside a cutaway building the camera therefore sees the INNER
    faces of the back (+Y) wall and of the left (-X) wall.
  * Interaction markers use bld_assets.mark(kind, loc, facing) so bld_render.markers() records them.

Cutaway layers (bank, police_station)
  Every object is tagged with the layer it belongs to (``with layer('interior'): ...``):
      floor     floor slab, tiles, rugs, steps, plinth, low outdoor bits           (always drawn, bottom)
      back      the two far walls seen from inside (+Y back wall, -X left wall) with their inner decoration
      interior  furniture, counters' back parts, vault room, lamps ...           (static)
      front     occluders that stand IN FRONT of 'behind' characters: counter fronts + glass, cell bars, desk
      shell_cut low wall stubs (dollhouse cut, ~0.55 m) of the two near walls + column stubs
      shell     the closed building: near walls, roof, portico, signs (the part that fades)
      <anim>    animated parts rendered as separate overlay sprites (vault door, cell door) - see civ_render
  civ_render renders one pass per layer with all layers EARLIER in the draw order as holdout (so a layer never paints
  over something that is physically in front of it) and all LATER layers invisible to the camera but still casting
  shadows; the shell is hidden in the inner passes (bright dollhouse light).  The ground shadow of the whole closed
  building is a separate shadow-catcher pass merged under the floor layer at pack time.

Not run directly - see civ_assets.py / civ_render.py.
"""
import math

import bpy  # noqa: F401  (import before mathutils when bpy is a module)
from mathutils import Vector, Euler

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, log, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T

INNER_LAYERS = ['floor', 'back', 'interior', 'front']
SHELL_LAYERS = ['shell_cut', 'shell']
ALL_LAYERS = INNER_LAYERS + SHELL_LAYERS

CHAR = '#3A3330'            # charcoal
CHAR_DARK = '#221D1B'
CHAR_LIGHT = '#574D47'
ASH = '#A9A49F'
ASH_DARK = '#8A847F'
SOOT = '#3E3836'
EMBER = '#FF6A1A'
CUT = '#E9DCC6'             # wall cross-section colour of the dollhouse cut (warm cream, reads as 'cut')

LAYER_PROP = 'civ_layer'
OVERLAYS = {}               # name -> {'objs': [...], 'set': fn(i), 'frames': n, 'fps': f, 'repeat': r, ...}


def reset():
    OVERLAYS.clear()


# =========================================================================== layer tagging

class layer:
    """Context manager: every object created inside the block is tagged with the layer name (custom property),
    children included.  Nested blocks tag their own objects first (innermost wins)."""

    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.c = L.Collect()
        self.c.__enter__()
        return self

    def __exit__(self, *a):
        self.c.__exit__(*a)
        self.objs = self.c.objs
        for o in self.objs:
            if LAYER_PROP not in o.keys():
                o[LAYER_PROP] = self.name
        return False


def tag(objs, name):
    """(Re)tag objects (and their children) with a layer name."""
    for o in BA.descendants(list(objs)):
        o[LAYER_PROP] = name


def overlay(name, objs, setter, frames, fps=8, repeat=-1, extra=None):
    """Register an overlay animation (rendered with everything else as holdout, see civ_render)."""
    every = BA.descendants(list(objs))
    OVERLAYS[name] = dict(objs=every, set=setter, frames=frames, fps=fps, repeat=repeat, extra=extra or {})
    return OVERLAYS[name]


def bounds_marker(name, loc, r=0.05):
    """Invisible (transparent, shadowless) tiny sphere that still counts for prop_lib.frame_fit - keeps the top of a
    smoke overlay or the far end of a swinging part inside the shared frame."""
    m = bpy.data.materials.get('civ_invisible')
    if m is None:
        m = bpy.data.materials.new('civ_invisible')
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        nt.links.new(tr.outputs[0], out.inputs['Surface'])
    o = sphere(name, r, loc, m, segs=6, rings=4)
    o.visible_shadow = False
    o['civ_bounds'] = True
    return o


# =========================================================================== materials

def _cached(key):
    return L._CUSTOM.get(key)


def charcoal(scale=6.0, warm=0.0, snow=0.0, seed=0, base=CHAR, name=None):
    """Toy charcoal: dark warm grey with a soft 'alligator' crackle (Voronoi edges), optional faint ember glow in the
    cracks (warm > 0) and snow on up-facing surfaces (snow > 0 = how far down the snow reaches, 0.0 .. 0.6)."""
    key = ('civ_char', scale, warm, snow, seed, base)
    if _cached(key):
        return L._CUSTOM[key]
    nb = L.NB(name or 'charcoal', rough=0.8)
    tc = nb.n('ShaderNodeTexCoord')
    mp = nb.n('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (seed * 1.37, seed * 0.71, seed * 2.13)
    nb.link(tc.outputs['Object'], mp.inputs['Vector'])
    vor = nb.n('ShaderNodeTexVoronoi')
    try:
        vor.feature = 'DISTANCE_TO_EDGE'
    except Exception:
        pass
    vor.inputs['Scale'].default_value = scale
    nb.link(mp.outputs['Vector'], vor.inputs['Vector'])
    crack = nb.map_range(vor.outputs['Distance'], 0.0, 0.07)          # 0 on the crack lines, 1 inside a cell
    nz = nb.n('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale * 0.6
    nz.inputs['Detail'].default_value = 2.0
    nb.link(mp.outputs['Vector'], nz.inputs['Vector'])
    tone = nb.map_range(nz.outputs['Fac'], 0.35, 0.68)
    col = nb.mix_rgb(tone, hexmix(base, '#000000', 0.18), hexmix(base, '#FFFFFF', 0.12))
    col = nb.mix_rgb(crack, CHAR_DARK, col)
    if snow > 0:
        geo = nb.n('ShaderNodeNewGeometry')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(geo.outputs['Normal'], sep.inputs[0])
        nz2 = nb.noise(2.6, 3.0, 'Object')
        off = nb.math('MULTIPLY', nb.math('SUBTRACT', nz2, 0.5), 0.5)
        t = nb.math('ADD', sep.outputs['Z'], off)
        fac = nb.map_range(t, 1.0 - snow - 0.1, 1.0 - snow + 0.1)
        col = nb.mix_rgb(fac, col, C('snow_mat'))
    nb.base(col)
    if warm > 0:
        glow = nb.math('SUBTRACT', 1.0, crack)                              # 1 on the cracks
        nz3 = nb.n('ShaderNodeTexNoise')
        nz3.inputs['Scale'].default_value = 1.6
        nb.link(mp.outputs['Vector'], nz3.inputs['Vector'])
        spot = nb.map_range(nz3.outputs['Fac'], 0.52, 0.66)               # only some patches glow
        g = nb.math('MULTIPLY', glow, spot)
        g = nb.math('MULTIPLY', g, warm)
        nb.p.inputs['Emission Color'].default_value = nb.rgb(EMBER, raw=True)
        nb.link(g, nb.p.inputs['Emission Strength'])
    L._CUSTOM[key] = nb.m
    return nb.m


def scorched(base, z0=0.4, z1=2.0, soot=SOOT, amount=1.0, scale=2.4, rough=0.85, name=None, snow=0.0):
    """Base colour (plaster, brick, paint) blackened by soot rising toward the top: world Z ramp z0 -> z1 broken up by
    noise, so walls keep their cute colour at the bottom and char at the jagged top."""
    key = ('civ_scorch', C(base), z0, z1, C(soot), amount, scale, rough, snow)
    if _cached(key):
        return L._CUSTOM[key]
    nb = L.NB(name or 'scorched_' + C(base).lstrip('#'), rough=rough)
    geo = nb.n('ShaderNodeNewGeometry')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(geo.outputs['Position'], sep.inputs[0])
    ramp = nb.map_range(sep.outputs['Z'], z0, z1)
    nz = nb.n('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 3.0
    nb.link(geo.outputs['Position'], nz.inputs['Vector'])
    off = nb.math('MULTIPLY', nb.math('SUBTRACT', nz.outputs['Fac'], 0.5), 1.1)
    t = nb.math('ADD', ramp, off)
    fac = nb.map_range(t, 0.25, 0.75)
    fac = nb.math('MULTIPLY', fac, amount)
    tn = nb.n('ShaderNodeTexNoise')
    tn.inputs['Scale'].default_value = 6.0
    nb.link(geo.outputs['Position'], tn.inputs['Vector'])
    btone = nb.map_range(tn.outputs['Fac'], 0.35, 0.65)
    bcol = nb.mix_rgb(btone, hexmix(base, '#000000', 0.07), base)
    col = nb.mix_rgb(fac, bcol, soot)
    if snow > 0:
        sep2 = nb.n('ShaderNodeSeparateXYZ')
        nb.link(geo.outputs['Normal'], sep2.inputs[0])
        sfac = nb.map_range(sep2.outputs['Z'], 1.0 - snow - 0.08, 1.0 - snow + 0.08)
        col = nb.mix_rgb(sfac, col, C('snow_mat'))
    nb.base(col)
    L._CUSTOM[key] = nb.m
    return nb.m


def soot_snow(r0=0.6, r1=2.0, dark=0.85, scale=1.4, name=None, cx=0.0, cy=0.0, ash=False):
    """Soot stain on the snow around (cx, cy): grey-brown smudge, dark inside r0, fading (noisy blotches) to FULLY
    TRANSPARENT at r1, so the patch blends with whatever snow ground the game draws under the ruin.  ash=True adds
    pale ash flecks.  Colours stay above ~75 luminance so prop_pack.tint_shadow leaves them alone."""
    key = ('civ_sootsnow2', r0, r1, dark, scale, cx, cy, ash)
    if _cached(key):
        return L._CUSTOM[key]
    nb = L.NB(name or 'soot_snow', rough=0.92)
    geo = nb.n('ShaderNodeNewGeometry')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(geo.outputs['Position'], sep.inputs[0])
    dx = nb.math('SUBTRACT', sep.outputs['X'], cx)
    dy = nb.math('SUBTRACT', sep.outputs['Y'], cy)
    d = nb.math('SQRT', nb.math('ADD', nb.math('MULTIPLY', dx, dx), nb.math('MULTIPLY', dy, dy)))
    rad = nb.map_range(d, r1, r0)                       # 0 outside r1, 1 inside r0
    nz = nb.n('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 4.0
    nz.inputs['Roughness'].default_value = 0.6
    nb.link(geo.outputs['Position'], nz.inputs['Vector'])
    off = nb.math('MULTIPLY', nb.math('SUBTRACT', nz.outputs['Fac'], 0.5), 1.2)
    t = nb.math('ADD', rad, off)
    fac = nb.map_range(t, 0.15, 0.75)
    edge = nb.map_range(d, r1, r1 * 0.8)               # guarantee 0 at the disc rim
    fac = nb.math('MULTIPLY', nb.math('MULTIPLY', fac, edge), dark)
    deep = nb.map_range(t, 0.8, 1.2)
    col = nb.mix_rgb(deep, '#8A837E', '#5F5853')
    if ash:
        an = nb.n('ShaderNodeTexNoise')
        an.inputs['Scale'].default_value = 20.0
        nb.link(geo.outputs['Position'], an.inputs['Vector'])
        af = nb.math('MULTIPLY', nb.map_range(an.outputs['Fac'], 0.6, 0.68), nb.math('MULTIPLY', fac, 0.9))
        col = nb.mix_rgb(af, col, '#C9C4BF')
    nb.base(col)
    nb.link(fac, nb.p.inputs['Alpha'])
    try:
        nb.m.blend_method = 'BLEND'
    except Exception:
        pass
    L._CUSTOM[key] = nb.m
    return nb.m


def embers(name, center, spread, n, seed=0, size=0.05):
    """A few glowing coals (warm orange emissive pebbles) - the 'still warm' sparkle of a ruin."""
    rnd = L.rng(seed)
    mb = L.MB()
    hot = L.emissive(name + '_hot', '#FF8A2A', EMBER, 2.6)
    warm = L.emissive(name + '_warm', '#C8463D', '#FF5A1A', 1.2)
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = spread * math.sqrt(rnd.random())
        s = size * rnd.uniform(0.7, 1.3)
        mb.ico(s, hot if k % 2 == 0 else warm, loc=(center[0] + rr * math.cos(a), center[1] + rr * math.sin(a),
                                                     center[2] + s * 0.3), scale=(1.0, 0.9, 0.6), subdiv=1)
    o = mb.done(name, smooth=False)
    o.visible_shadow = False
    return o


def tag_glass(objs):
    for o in objs:
        o['civ_glass'] = True
    return objs


def glass_mat(name='civ_glass', tint='#CFE6F5', alpha=0.28):
    """See-through toy glass (teller partitions, display cases): faint tint + low alpha."""
    m = bc.mat(name, L.adj(tint), rough=0.08)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Alpha'].default_value = alpha
    try:
        m.blend_method = 'BLEND'
    except Exception:
        pass
    return m


def gold():
    return flat('#F2C14E', 0.3, 0.75)


def brass():
    return flat('#D9A93E', 0.35, 0.7)


def iron():
    return flat('#474D58', 0.45, 0.6)


# =========================================================================== geometry helpers

def wall_x(name, x0, x1, y, z0, z1, t, mat, holes=(), bevel=0.0):
    """Wall along X (from x0 to x1, centred on the plane y, thickness t) with rectangular holes
    [(xa, xb, za, zb)] made of solid box pieces (no booleans).  Returns the pieces."""
    return _wall('x', name, x0, x1, y, z0, z1, t, mat, holes, bevel)


def wall_y(name, y0, y1, x, z0, z1, t, mat, holes=(), bevel=0.0):
    """Wall along Y (from y0 to y1) on the plane x; holes [(ya, yb, za, zb)]."""
    return _wall('y', name, y0, y1, x, z0, z1, t, mat, holes, bevel)


def _wall(axis, name, a0, a1, c, z0, z1, t, mat, holes, bevel):
    cuts = sorted({a0, a1} | {h[0] for h in holes} | {h[1] for h in holes})
    cuts = [v for v in cuts if a0 <= v <= a1]
    out = []
    for sa, sb in zip(cuts, cuts[1:]):
        if sb - sa < 1e-4:
            continue
        mid = (sa + sb) / 2
        spans = [(z0, z1)]
        for (ha, hb, za, zb) in holes:
            if ha <= mid <= hb:
                new = []
                for (p, q) in spans:
                    if zb <= p or za >= q:
                        new.append((p, q))
                        continue
                    if za > p:
                        new.append((p, za))
                    if zb < q:
                        new.append((zb, q))
                spans = new
        for (p, q) in spans:
            if q - p < 1e-4:
                continue
            if axis == 'x':
                out.append(box(name, (sb - sa, t, q - p), (mid, c, p), mat=mat, bevel=bevel))
            else:
                out.append(box(name, (t, sb - sa, q - p), (c, mid, p), mat=mat, bevel=bevel))
    return out


def jagged_wall_x(name, x0, x1, y, t, tops, mat, z0=0.0, seed=0, snow=True):
    """Ruined wall along X: the top edge follows the polyline `tops` [(x, z), ...] (x0 .. x1).  Built as an extruded
    XZ outline (front face toward -Y).  Snow lumps sit on the higher flat bits."""
    pts = [(x0, z0), (x1, z0)] + [(x, z) for (x, z) in reversed(tops)]
    o = T.ext_xz(name, pts, t, mat, y=y + t / 2, bevel=0.025)
    out = [o]
    if snow:
        rnd = L.rng(seed)
        for (xa, za), (xb, zb) in zip(tops, tops[1:]):
            if abs(zb - za) < 0.12 and abs(xb - xa) > 0.18 and rnd.random() < 0.8:
                out.append(L.snow_slab(name + '_sn', abs(xb - xa) * 0.8, t + 0.04, 0.05,
                                       ((xa + xb) / 2, y, max(za, zb) - 0.01), seed=seed + len(out)))
    return out


def jagged_wall_y(name, y0, y1, x, t, tops, mat, z0=0.0, seed=0, snow=True):
    """Ruined wall along Y on the plane x (front face toward +X); tops [(y, z), ...]."""
    pts = [(y0, z0), (y1, z0)] + [(y_, z) for (y_, z) in reversed(tops)]
    o = extrude(name, pts, t, rot=(90, 0, 90), top=mat, side=mat, bevel=0.025)
    o.location.x = x - t / 2
    out = [o]
    if snow:
        rnd = L.rng(seed + 50)
        for (ya, za), (yb, zb) in zip(tops, tops[1:]):
            if abs(zb - za) < 0.12 and abs(yb - ya) > 0.18 and rnd.random() < 0.8:
                out.append(L.snow_slab(name + '_sn', t + 0.04, abs(yb - ya) * 0.8, 0.05,
                                       (x, (ya + yb) / 2, max(za, zb) - 0.01), seed=seed + len(out)))
    return out


def charred_post(name, x, y, h, w=0.17, lean=(0.0, 0.0), seed=0, snow=True, warm=0.0):
    """Square charred post with a broken, pointy top (a tapered tip) and a snow pinch on top."""
    m = charcoal(5.0, warm=warm, snow=0.35 if snow else 0.0, seed=seed)
    tip = 0.18 + 0.12 * (seed % 3)
    objs = [box(name, (w, w, h - tip), (x, y, 0.0), mat=m, bevel=0.03),
            box(name + '_tip', (w, w, tip), (x, y, h - tip), mat=m, bevel=0.02,
                taper=(0.35 + 0.2 * (seed % 2), 0.55))]
    if snow:
        objs.append(PA.snow_cap(name + '_sn', w * 0.42, (x - w * 0.12, y, h - tip * 0.75), h=0.05, seed=seed))
    g = L.group(objs, name + '_g', loc=(0, 0, 0))
    if lean != (0.0, 0.0):
        for o in objs:
            o.location.x -= x
            o.location.y -= y
        g.location = (x, y, 0.0)
        g.rotation_euler = Euler((math.radians(lean[0]), math.radians(lean[1]), 0.0), 'XYZ')
    return g


def charred_beam(name, p, q, r=0.08, seed=0, snow=True, warm=0.0, square=True):
    """A charred beam (rounded square or log) from p to q with charcoal crackle + a little snow on top."""
    p, q = Vector(p), Vector(q)
    d = q - p
    ln = d.length
    m = charcoal(5.5, warm=warm, snow=0.3 if snow else 0.0, seed=seed)
    if square:
        o = box(name, (r * 2, ln, r * 2), (0, 0, 0), mat=m, bevel=r * 0.35, origin='center')
    else:
        o = cyl(name, r, ln, (0, 0, 0), rot=(90, 0, 0), mat=m, segs=10, origin='center', bevel=r * 0.3)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector((0, 1, 0)).rotation_difference(d.normalized())
    o.location = (p + q) / 2
    return o


def ash_mound(name, r, loc, seed=0, snow=0.35, h=0.32):
    """Soft grey ash/cinder heap with a cap of fresh snow."""
    m = snowy(ASH, lo=1.0 - snow - 0.05, hi=1.0 - snow + 0.1, noise_amt=0.5, noise_scale=3.0, rough=0.95)
    return blob(name, r, loc, m, scale=(1.25, 1.0, h), seed=seed, amp=0.24, freq=2.2, subdiv=3, flat_bottom=0.2)


def cinder_bits(name, center, spread, n, seed=0, size=0.06, z=0.0, cols=(CHAR, CHAR_LIGHT, '#6B5F58')):
    """Scatter of small charred chips / charcoal lumps (one batched object)."""
    rnd = L.rng(seed)
    mb = L.MB()
    mats = [charcoal(7.0, seed=seed + k) if k == 0 else flat(c, 0.85) for k, c in enumerate(cols)]
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = spread * math.sqrt(rnd.random())
        s = size * rnd.uniform(0.6, 1.4)
        mb.ico(s, mats[k % len(mats)], loc=(center[0] + rr * math.cos(a), center[1] + rr * math.sin(a), z + s * 0.4),
               scale=(1.0, rnd.uniform(0.6, 1.2), rnd.uniform(0.45, 0.8)), subdiv=1,
               rot=(rnd.uniform(0, 40), rnd.uniform(0, 40), rnd.uniform(0, 180)))
    return mb.done(name, smooth=False)


def bricks(name, center, spread, n, seed=0, col='#B4593F', soot=0.5, z=0.0):
    """Loose rounded bricks (some sooty) tossed on a heap."""
    rnd = L.rng(seed)
    mb = L.MB()
    mats = [flat(col, 0.85), flat(hexmix(col, SOOT, soot), 0.85), flat(hexmix(col, '#FFFFFF', 0.12), 0.85)]
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = spread * math.sqrt(rnd.random())
        mb.cube((0.22, 0.11, 0.08), mats[k % 3],
                loc=(center[0] + rr * math.cos(a), center[1] + rr * math.sin(a), z + 0.04 + rnd.uniform(0, 0.05)),
                rot=(rnd.uniform(-25, 25), rnd.uniform(-25, 25), rnd.uniform(0, 180)))
    return mb.done(name, smooth=False, bevel=0.012)


def plank_scatter(name, center, spread, n, seed=0, cols=('#C98F55', '#8A5A33', CHAR), z=0.0, length=(0.5, 0.95)):
    """A few loose planks / burnt boards lying at angles (one batched object)."""
    rnd = L.rng(seed)
    mb = L.MB()
    mats = [charcoal(6.0, seed=seed) if c == CHAR else flat(c, 0.8) for c in cols]
    for k in range(n):
        a = rnd.uniform(0, math.tau)
        rr = spread * math.sqrt(rnd.random())
        ln = rnd.uniform(*length)
        mb.cube((ln, 0.16, 0.05), mats[k % len(mats)],
                loc=(center[0] + rr * math.cos(a), center[1] + rr * math.sin(a), z + 0.03 + 0.05 * (k % 3)),
                rot=(rnd.uniform(-12, 12), rnd.uniform(-14, 14), rnd.uniform(0, 180)))
    return mb.done(name, smooth=False, bevel=0.012)


def ground_disc(name, rx, ry, mat, loc=(0, 0, 0), t=0.03, segs=48):
    """Thin flat elliptical ground patch (soot-stained snow under a ruin)."""
    o = cyl(name, 1.0, t, loc, mat=mat, segs=segs, bevel=0.012)
    o.scale = (rx, ry, 1.0)
    return o


def soft_smoke_mat(name, color='#CDD2DA', alpha=0.45):
    """Smoke puff material with SOFT edges: alpha fades toward the silhouette (Layer Weight facing), so a sphere
    reads as a wisp instead of a ball.  The overall alpha lives in a Value node (set_soft_alpha)."""
    nb = L.NB(name, rough=1.0)
    nb.p.inputs['Base Color'].default_value = nb.rgb(color, raw=True)
    lw = nb.n('ShaderNodeLayerWeight')
    lw.inputs['Blend'].default_value = 0.5
    soft = nb.math('POWER', nb.math('SUBTRACT', 1.0, lw.outputs['Facing']), 1.6)
    val = nb.n('ShaderNodeValue')
    val.name = 'civ_alpha'
    val.outputs[0].default_value = alpha
    nb.link(nb.math('MULTIPLY', soft, val.outputs[0]), nb.p.inputs['Alpha'])
    try:
        nb.m.blend_method = 'BLEND'
    except Exception:
        pass
    return nb.m


def set_soft_alpha(m, a):
    m.node_tree.nodes['civ_alpha'].outputs[0].default_value = a


class SoftSmoke(L.Smoke):
    """prop_lib.Smoke (same seamless rise / drift / fade maths) with soft-edged puffs."""

    def __init__(self, name, base, color='#CDD2DA', alpha=0.45, **kw):
        L.Smoke.__init__(self, name, base, color=color, alpha=alpha, **kw)
        for j, o in enumerate(self.obs):
            m = soft_smoke_mat('%s_soft%d' % (name, j), color, alpha)
            o.data.materials.clear()
            o.data.materials.append(m)
            self.mats[j] = m

    def set(self, i, frames=4):
        self.show(True)
        for j, (o, m) in enumerate(zip(self.obs, self.mats)):
            t = (j + i / float(frames)) / self.n
            p, s, a = self.at(t)
            o.location = p
            o.scale = (s, s, s * 0.85)
            o.rotation_euler = Euler((0, 0, t * 2.0 + j), 'XYZ')
            set_soft_alpha(m, a)


def smoke_wisps(name, bases, seed=0, rise=1.4, alpha=0.5, color='#CDD2DA', r0=0.07, r1=0.3, n=4):
    """Gentle smoke wisps for a smouldering ruin: one SoftSmoke column per base (hidden by default).
    Returns (list of SoftSmoke, setter(i, frames))."""
    sm = []
    for k, b in enumerate(bases):
        s = SoftSmoke('%s%d' % (name, k), b, n=n, rise=rise * (0.85 + 0.3 * ((seed + k) % 3) / 2.0),
                      drift=(0.28, 0.16), r0=r0, r1=r1, color=color, alpha=alpha, seed=seed + k, fade_in=0.18)
        sm.append(s)

    def setter(i, frames=4):
        for k, s in enumerate(sm):
            s.set((i + k) % frames, frames=frames)
    return sm, setter


def soot_streak(name, loc, face, w=0.5, h=0.8, alpha=0.75):
    """Soft soot plume painted above a window / door on a wall (a thin dark quad, face frame like T.win)."""
    m = bc.mat(name + '_m', L.adj('#2A2523'), rough=0.95)
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Alpha'].default_value = alpha
    objs = [extrude(name, [(-w / 2, 0.0), (w / 2, 0.0), (w * 0.38, h * 0.6), (0.05, h), (-w * 0.3, h * 0.75)], 0.01,
                    rot=(90, 0, 0), top=m, side=m, bevel=0.0)]
    objs[0].location.y = -0.006
    return T.face_group(objs, face, loc, name)


# =========================================================================== small props

def kettle(name, loc, col='#D9483B', s=1.0):
    m = flat(col, 0.35)
    objs = [cyl(name, 0.11 * s, 0.13 * s, loc, mat=m, r_top=0.08 * s, segs=18, bevel=0.03 * s),
            sphere(name + '_lid', 0.05 * s, (loc[0], loc[1], loc[2] + 0.14 * s), m, scale=(1, 1, 0.5), segs=12,
                   rings=6),
            cyl(name + '_sp', 0.022 * s, 0.12 * s, (loc[0] + 0.1 * s, loc[1], loc[2] + 0.04 * s),
                rot=(0, 55, 0), mat=m, segs=8, r_top=0.014 * s)]
    mb = L.MB()
    T.ring_seg(mb, (loc[0], loc[1], loc[2] + 0.15 * s), 0.07 * s, 0.012 * s, flat('#2B2F3A', 0.5), axis='y',
               a0=0.2, a1=math.pi - 0.2, n=8)
    objs.append(mb.done(name + '_h'))
    return objs


def potted_plant(name, loc, s=1.0, pot='#C2603F', leaf='#3E7F55', seed=0):
    objs = [cyl(name + '_pot', 0.13 * s, 0.2 * s, loc, mat=flat(pot, 0.7), r_top=0.16 * s, segs=18, bevel=0.02)]
    rnd = L.rng(seed)
    mb = L.MB()
    lm = flat(leaf, 0.6)
    lm2 = flat(hexmix(leaf, '#FFFFFF', 0.18), 0.6)
    for k in range(7):
        a = math.tau * k / 7 + rnd.uniform(-0.2, 0.2)
        mb.sphere(0.07 * s, lm if k % 2 else lm2, loc=(loc[0] + 0.08 * s * math.cos(a), loc[1] + 0.08 * s * math.sin(a),
                                                     loc[2] + (0.27 + rnd.uniform(0, 0.12)) * s),
                  scale=(1.0, 0.55, 1.5), rot=(0, 30, math.degrees(a)), segs=8, rings=6)
    mb.sphere(0.1 * s, lm, loc=(loc[0], loc[1], loc[2] + 0.3 * s), segs=10, rings=6)
    objs.append(mb.done(name + '_leaves'))
    return objs


def chair(name, loc, rot_z=0.0, col='#3D7CC9', wood='#8A5A33', s=1.0):
    """Cute round-backed waiting chair (seat 0.45 m)."""
    m = flat(col, 0.55)
    w = flat(wood, 0.7)
    objs = [box(name + '_seat', (0.42 * s, 0.42 * s, 0.08 * s), (0, 0, 0.37 * s), mat=m, bevel=0.035),
            box(name + '_back', (0.42 * s, 0.08 * s, 0.42 * s), (0, 0.18 * s, 0.43 * s), mat=m, bevel=0.035)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(cyl(name + '_leg', 0.022 * s, 0.37 * s, (sx * 0.16 * s, sy * 0.16 * s, 0.0), mat=w, segs=8,
                            bevel=0.005))
    return L.group(objs, name, loc=loc, rot=(0, 0, rot_z))


def wall_clock(name, loc, face='y-', r=0.2):
    objs = [cyl(name + '_b', r, 0.06, (0, -0.03, 0), rot=(90, 0, 0), mat=flat('#F7F1E3', 0.5), segs=32,
                origin='center', bevel=0.012),
            cyl(name + '_r', r + 0.03, 0.05, (0, -0.02, 0), rot=(90, 0, 0), mat=brass(), segs=32, origin='center',
                bevel=0.01)]
    hm = flat('#2B2F3A', 0.5)
    objs.append(box(name + '_hh', (0.025, 0.012, r * 0.5), (0, -0.065, 0.0), rot=(0, 40, 0), mat=hm, bevel=0.0))
    objs.append(box(name + '_mh', (0.018, 0.012, r * 0.75), (0, -0.07, 0.0), rot=(0, -60, 0), mat=hm, bevel=0.0))
    for k in range(12):
        a = math.tau * k / 12
        objs.append(box(name + '_t', (0.018, 0.01, 0.035), (r * 0.82 * math.cos(a), -0.062, r * 0.82 * math.sin(a)),
                        rot=(0, -math.degrees(a) + 90, 0), mat=hm, bevel=0.0, origin='center'))
    return T.face_group(objs, face, loc, name)


def picture_frame(name, loc, face='y-', w=0.5, h=0.4, pic=None, frame_col='#C9A045'):
    """Framed picture on a wall; pic(objs, w, h) adds the picture (face frame, y in [-0.05, -0.03])."""
    objs = [box(name + '_f', (w + 0.08, 0.04, h + 0.08), (0, -0.02, -0.04), mat=flat(frame_col, 0.35, 0.6),
                bevel=0.012),
            box(name + '_p', (w, 0.02, h), (0, -0.045, 0.0), mat=flat('#BFE0EE', 0.7), bevel=0.0)]
    if pic:
        pic(objs, w, h)
    return T.face_group(objs, face, loc, name)


def wainscot(name, x0, x1, y, h, face='y-', col='#8A5A33', cap='#C98F55', z0=0.0):
    """Wood panelling along a wall (face frame helper): lower panel + rail.  For face 'x+' / 'x-' x0, x1 are the
    Y range and y is the wall's x."""
    w = x1 - x0
    objs = [box(name, (w, 0.04, h), (0, -0.02, 0.0), mat=L.stripes(col, hexmix(col, '#000000', 0.12), 6.0 / 1.0,
                                                                    'X', rough=0.7, soft=0.06), bevel=0.0),
            box(name + '_rail', (w, 0.07, 0.06), (0, -0.035, h), mat=flat(cap, 0.6), bevel=0.015)]
    if face in ('y-', 'y+'):
        return T.face_group(objs, face, ((x0 + x1) / 2, y, z0), name)
    return T.face_group(objs, face, (y, (x0 + x1) / 2, z0), name)


def iso_px(x, y, z=0.0):
    """World metres (yaw 0 builds) -> px offset from the anchor (bl_common.world_to_pixel maths)."""
    return [int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274 - z * 55.4256))]
