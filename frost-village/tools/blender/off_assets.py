"""
off_assets.py - the 촌장 사무실 (chief office) set for docs/CONTRACT_V42.md section AI:
    chief_office      one-storey timber-and-plaster office as a CUTAWAY build (civic / logistics layer contract)
    office_mailbox    red post mailbox with a pinecone emblem and a side flag (anims flag / pop)
    item_coin_sack_s / _m / _l, item_letter_bundle, item_newspaper_bundle, item_ledger   (72 x 72 items)

Same helpers, palette, camera, light and PPU as every other set (bl_common, prop_lib, prop_assets, life_assets,
bld_assets, town_lib, civ_lib, civ_assets are imported READ-ONLY and never modified).

Conventions
  * 1 unit = 1 m, origin = footprint centre = sprite anchor, front = -Y (screen down-left), +X = screen down-right.
    The camera sees the -Y and +X faces; inside the cutaway it sees the inner faces of the back (+Y) and left (-X)
    walls.
  * Every object is tagged with its layer (civ_lib.layer):
        floor      floor slab (plinth copy), floorboards, rugs, the chief's dais, inside door mat
        back       the two far walls from inside (wallpaper, wainscot, chalkboard, map, notice board, mail shelf,
                   window, clock, key board, emblem)
        interior   furniture behind people (chairs, stove, filing cabinet, safe, coin sacks, plants, coat rack, bench)
        ifront     the four desks + the counting table (= _interior_front: hides the legs of seated people)
        shell_cut  dollhouse wall stubs (top at 1.2 m) + window sills + the door frame
        shell      the closed building: plinth copy, front + right walls, roof, chimney, sign board, door, windows
        props      always-drawn outdoor parts: steps, door lantern on its post, snow tufts by the steps
        <overlay>  typewriter_a, typewriter_b, phone, stove, lamp_a, lamp_b, safe (civ_lib.overlay)
  * Objects with o['off_glow'] are the lit glass of the closed building (window panes, fan light, lantern): the
    renderer turns them into the night glow layer.
  * Interaction markers: bld_assets.mark(kind, loc, facing).  Inside points stand on the raised floor (PL).

Not run directly - see off_render.py.
"""
import math

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
import civ_lib as CL
import civ_assets as CA
from civ_lib import layer
from bld_assets import mark

# ------------------------------------------------------------------------------------------------ dimensions
X0, X1, Y0, Y1 = -2.8, 2.8, -2.2, 2.2          # footprint 5.6 x 4.4 m
WT = 0.16                                       # wall thickness
PL = 0.3                                        # raised floor (floorLiftPx = PL * 55.43 = 17 px)
H = 3.05                                        # wall top / eave
RIDGE = 4.05
OVER = 0.32
STUB = 1.2                                      # dollhouse cut height (absolute z)
XI0, XI1, YI0, YI1 = X0 + WT, X1 - WT, Y0 + WT, Y1 - WT
DOOR_X, DOOR_W, DOOR_H = -1.6, 0.98, 1.78
DAIS = 0.04
SEAT = 0.45
DESK_TOP = 0.72

# ------------------------------------------------------------------------------------------------ palette
PLASTER = '#F6E4C4'
TIMBER = '#8A5A33'
TIMBER_D = '#6E4527'
STONE = '#CBC4B7'
TEAL = '#3E8E8A'
TEAL_D = '#2E6F6B'
TRIM = '#F7F2E8'
GOLD = '#F2C14E'
RED = '#D9483B'
OAK = '#C08A55'
WALNUT = '#7A4E2E'
PAPER = '#FBF6EA'
INK = '#2B2F3A'

NOTE = ('촌장 사무실 (chief office, 5.6 x 4.4 m): a cosy one-storey timber-and-plaster office - warm cream plaster '
        'between honey timber posts and belts on a pale stone plinth, a snowy teal gable roof (the town hall family) '
        'with a pinecone finial and a brick chimney, tall white windows with little red curtains, a teal double door '
        'with brass knobs under a fan light, a blank cream sign board over the door (the game writes 촌장 사무실 into '
        'signRect), a lantern post by the steps.  CUTAWAY (bank / logistics layer contract): _floor (floorboards, '
        'rugs, the chief\'s round dais, the open-building ground shadow), _back (wallpaper + wainscot, chalkboard, '
        'village map with pins, cork notice board, pigeonhole mail shelf, window, clock, key board, town emblem), '
        '_interior (chairs, pot-belly stove + kettle, filing cabinet, iron safe + coin sacks, coat rack, bench, '
        'plants), _interior_front (the chief\'s desk, two clerk desks, the secretary desk, the counting table), '
        '_shell_cut (wall stubs at 1.2 m + sills + door frame), _shell (the closed building incl. its ground shadow '
        'and the outdoor props), _glow (night window light + lantern halo), _props (steps, lantern post).')


def tagged(objs, key, val=True):
    for o in BA.descendants(list(objs)):
        o[key] = val
    return objs


def glow(objs):
    return tagged(objs, 'off_glow')


def iso(x, y, z=0.0):
    return CL.iso_px(x, y, z)


# ================================================================================================ materials

def floorboards():
    key = ('off_boards',)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('off_boards', rough=0.6)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    # planks run along X, 0.2 m wide; each plank gets its own tone, butt joints every ~1.2 m (staggered)
    row = nb.math('FLOOR', nb.math('MULTIPLY', sep.outputs['Y'], 5.0))
    fr = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Y'], 5.0))
    seam = nb.map_range(fr, 0.93, 0.97)
    xs = nb.math('ADD', nb.math('MULTIPLY', sep.outputs['X'], 0.83), nb.math('MULTIPLY', row, 0.37))
    joint = nb.map_range(nb.math('FRACT', xs), 0.975, 0.99)
    tone = nb.math('FRACT', nb.math('MULTIPLY', nb.math('ADD', row, nb.math('FLOOR', xs)), 0.618))
    base = nb.mix_rgb(tone, '#B97E47', '#D29A60')
    nz = nb.noise(9.0, 2.0, 'Object')
    grain = nb.map_range(nz, 0.3, 0.7)
    base = nb.mix_rgb(nb.math('MULTIPLY', grain, 0.35), base, '#A86E3C')
    line = nb.math('MAXIMUM', seam, joint)
    nb.base(nb.mix_rgb(line, base, '#7A4E2E'))
    L._CUSTOM[key] = nb.m
    return nb.m


def stone_plinth():
    return L.brick('#D3CCC0', '#BFB7AA', '#ECE6DC', scale=1.0, row_h=0.15, brick_w=0.42, snow_top=True,
                   name='off_plinth')


def plaster():
    return T.plaster(PLASTER, var=0.04, scale=6.0)


def wallpaper(axis):
    return L.stripes('#F2E5C9', '#E8D5B0', 7.0, axis, rough=0.88, soft=0.12)


def burlap(col='#D8BE8E'):
    key = ('off_burlap', col)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('off_burlap', rough=0.95)
    tc = nb.n('ShaderNodeTexCoord')
    ch = nb.n('ShaderNodeTexChecker')
    ch.inputs['Color1'].default_value = nb.rgb(col)
    ch.inputs['Color2'].default_value = nb.rgb(hexmix(col, '#000000', 0.1))
    ch.inputs['Scale'].default_value = 60.0
    nb.link(tc.outputs['Object'], ch.inputs['Vector'])
    nz = nb.noise(6.0, 2.0, 'Object')
    col2 = nb.mix_rgb(nb.math('MULTIPLY', nb.map_range(nz, 0.35, 0.7), 0.4), ch.outputs['Color'],
                      hexmix(col, '#7A5A33', 0.4))
    nb.base(col2)
    L._CUSTOM[key] = nb.m
    return nb.m


def newsprint():
    key = ('off_news',)
    if key in L._CUSTOM:
        return L._CUSTOM[key]
    nb = L.NB('off_news', rough=0.85)
    tc = nb.n('ShaderNodeTexCoord')
    sep = nb.n('ShaderNodeSeparateXYZ')
    nb.link(tc.outputs['Object'], sep.inputs[0])
    lines = nb.map_range(nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Y'], 34.0)), 0.55, 0.62)
    cols = nb.map_range(nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['X'], 9.0)), 0.88, 0.9)
    f = nb.math('MULTIPLY', lines, nb.math('SUBTRACT', 1.0, cols))
    nb.base(nb.mix_rgb(nb.math('MULTIPLY', f, 0.55), '#F1EBDD', '#8C9098'))
    L._CUSTOM[key] = nb.m
    return nb.m


# ================================================================================================ shared models

def coin_sack(name, loc, r=0.2, rot_z=0.0, seed=0, coins=True, emblem=True, tie=RED):
    """Burlap coin sack: round body, gathered neck tied with red string, a gold coin emblem on the camera side and
    a few coins peeking out of the top.  loc = ground point under the sack."""
    x, y, z = loc
    bm = burlap()
    objs = [blob(name, r, (0, 0, r * 0.95), bm, scale=(1.0, 0.92, 1.0), seed=seed, amp=0.1, freq=1.6, subdiv=3,
                 flat_bottom=0.45)]
    objs.append(cyl(name + '_neck', r * 0.34, r * 0.42, (0, 0, r * 1.72), mat=bm, r_top=r * 0.5, segs=16,
                    bevel=r * 0.08))
    objs.append(blob(name + '_ruff', r * 0.4, (0, 0, r * 2.12), bm, scale=(1.15, 1.15, 0.55), seed=seed + 3, amp=0.25,
                     freq=2.4, subdiv=2))
    objs.append(cyl(name + '_tie', r * 0.37, r * 0.1, (0, 0, r * 1.83), mat=flat(tie, 0.5), segs=16,
                    bevel=r * 0.03))
    mb = L.MB()
    for k, a in enumerate((0.6, 2.4)):
        mb.seg((r * 0.3 * math.cos(a), r * 0.3 * math.sin(a) - r * 0.2, r * 1.88),
               (r * 0.55 * math.cos(a) + 0.02, r * 0.55 * math.sin(a) - r * 0.45, r * 1.45), r * 0.045,
               flat(tie, 0.5), segs=6)
    objs.append(mb.done(name + '_ends'))
    if coins:
        g = CL.gold()
        for k, (dx, dy, tilt) in enumerate(((0.0, -0.05, 25), (0.08, 0.04, -20), (-0.07, 0.03, 40))):
            objs.append(cyl(name + '_pc%d' % k, r * 0.28, r * 0.07, (dx * r * 2.2, dy * r * 2.2, r * 2.28),
                            rot=(tilt, 15 * k, 0), mat=g, segs=18, origin='center', bevel=r * 0.02))
    if emblem:
        # gold coin with a darker rim on the side that faces the camera (local -Y after rot_z)
        e = [cyl(name + '_em', r * 0.42, r * 0.07, (0, 0, 0), rot=(90, 0, 0), mat=CL.gold(), segs=28,
                 origin='center', bevel=r * 0.02),
             cyl(name + '_emr', r * 0.46, r * 0.05, (0, 0.006, 0), rot=(90, 0, 0), mat=flat('#C98F2E', 0.35, 0.6),
                 segs=28, origin='center', bevel=r * 0.015)]
        mb2 = L.MB()
        dk = flat('#B47A2A', 0.4, 0.6)
        mb2.cube((r * 0.09, r * 0.04, r * 0.42), dk, loc=(0, -r * 0.045, 0))
        for s_ in (-1, 1):
            mb2.cube((r * 0.26, r * 0.04, r * 0.08), dk, loc=(0, -r * 0.045, s_ * r * 0.12))
        e.append(mb2.done(name + '_emk'))
        eg = L.group(e, name + '_emg', loc=(0, 0, 0))
        eg.location = (r * 0.93 * math.cos(math.radians(-45)), r * 0.93 * math.sin(math.radians(-45)) * 0.92, r * 0.95)
        eg.rotation_euler = Euler((math.radians(-8), 0, math.radians(45)), 'XYZ')
        objs.append(eg)
    return L.group(objs, name + '_g', loc=(x, y, z), rot=(0, 0, rot_z))


def ledger_book(name, loc, w=0.24, d=0.32, t=0.07, col='#3E7F55', rot_z=0.0, ribbon=True):
    x, y, z = loc
    objs = [box(name + '_cov', (w, d, t), (0, 0, 0), mat=flat(col, 0.6), bevel=0.012),
            box(name + '_pages', (w - 0.025, d - 0.02, t - 0.024), (0.008, 0, 0.012), mat=L.stripes(PAPER, '#E6DFCF',
                                                                                                  140.0, 'Z',
                                                                                                  rough=0.8),
                bevel=0.002)]
    g = CL.gold()
    for sy in (-1, 1):
        objs.append(box(name + '_corner', (0.06, 0.06, t + 0.006), (-w / 2 + 0.03, sy * (d / 2 - 0.03), -0.003),
                        rot=(0, 0, 45), mat=g, bevel=0.006))
    objs.append(box(name + '_spine', (0.03, d + 0.004, t + 0.004), (-w / 2 + 0.012, 0, -0.002), mat=flat(
        hexmix(col, '#000000', 0.25), 0.6), bevel=0.01))
    objs.append(box(name + '_label', (0.1, 0.14, 0.004), (0.02, 0, t - 0.002), mat=flat('#F3E3B5', 0.7),
                    bevel=0.002))
    if ribbon:
        objs.append(box(name + '_rib', (0.02, 0.008, 0.08), (0.04, -d / 2 - 0.002, -0.06 + t), mat=flat(RED, 0.5),
                        bevel=0.0))
    return L.group(objs, name + '_g', loc=(x, y, z), rot=(0, 0, rot_z))


def envelope(name, loc, w=0.2, d=0.13, col=PAPER, rot_z=0.0, seal=None, flap='#E9DFC8'):
    x, y, z = loc
    objs = [box(name, (w, d, 0.012), (0, 0, 0), mat=flat(col, 0.8), bevel=0.003)]
    tri = extrude(name + '_flap', [(-w / 2 + 0.005, d / 2 - 0.002), (w / 2 - 0.005, d / 2 - 0.002), (0.0, 0.0)], 0.003,
                  top=flat(flap, 0.8), side=flat(flap, 0.8), bevel=0.0)
    tri.location = (0, 0, 0.012)
    objs.append(tri)
    if seal == 'heart':
        hp = [(px * 0.035, py * 0.035) for px, py in T.heart_pts(1.0, 20)]
        hs = extrude(name + '_heart', hp, 0.012, top=flat('#D93B4F', 0.35), side=flat('#B02A3C', 0.4), bevel=0.003)
        hs.location = (0.0, 0.004, 0.014)
        objs.append(hs)
    elif seal:
        objs.append(cyl(name + '_seal', 0.022, 0.01, (0.0, 0.004, 0.014), mat=flat(seal, 0.4), segs=14, bevel=0.003))
    return L.group(objs, name + '_g', loc=(x, y, z), rot=(0, 0, rot_z))


def potted_fern(name, loc, s=1.0, pot='#C2603F', seed=0):
    """Fluffy potted fern / palm (bigger and leafier than civ_lib.potted_plant)."""
    x, y, z = loc
    objs = [cyl(name + '_pot', 0.15 * s, 0.24 * s, (x, y, z), mat=flat(pot, 0.65), r_top=0.19 * s, segs=20,
                bevel=0.02),
            cyl(name + '_rim', 0.2 * s, 0.05 * s, (x, y, z + 0.22 * s), mat=flat(hexmix(pot, '#FFFFFF', 0.12), 0.6),
                segs=20, bevel=0.015),
            cyl(name + '_soil', 0.17 * s, 0.02 * s, (x, y, z + 0.25 * s), mat=flat('#5A3E2B', 0.9), segs=18,
                bevel=0.0)]
    rnd = L.rng(seed)
    mb = L.MB()
    l1, l2, l3 = flat('#3E7F55', 0.6), flat('#4F9A63', 0.6), flat('#2F6B47', 0.6)
    for k in range(11):
        a = math.tau * k / 11 + rnd.uniform(-0.2, 0.2)
        ln = rnd.uniform(0.32, 0.46) * s
        lift = rnd.uniform(0.15, 0.45) * s
        p0 = Vector((x, y, z + 0.27 * s))
        n = 6
        prev = p0
        for j in range(1, n + 1):
            t = j / n
            p = p0 + Vector((math.cos(a) * ln * t, math.sin(a) * ln * t, lift * math.sin(math.pi * t * 0.85)))
            mb.sphere(0.055 * s * (1.0 - 0.6 * t) + 0.012, [l1, l2, l3][(k + j) % 3], loc=tuple(p),
                      scale=(1.6, 1.0, 0.45), rot=(0, 0, math.degrees(a)), segs=8, rings=5)
            prev = p
        del prev
    mb.sphere(0.1 * s, l2, loc=(x, y, z + 0.36 * s), scale=(1, 1, 0.8), segs=10, rings=6)
    objs.append(mb.done(name + '_leaves'))
    return objs


def chair(name, seat_front, facing, col='#3E8E8A', wood=WALNUT, wide=0.44, back_h=0.5, z0=PL, arms=False,
          wing=False):
    """Desk chair whose SEAT FRONT-CENTRE is at seat_front (x, y) at height z0 + SEAT, facing `facing` (deg, 0 = -Y,
    90 = +X).  Built facing -Y, then turned."""
    f = flat(col, 0.65)
    w = flat(wood, 0.6)
    d = 0.42
    objs = [box(name + '_seat', (wide, d, 0.09), (0, d / 2, SEAT - 0.09), mat=f, bevel=0.04),
            box(name + '_back', (wide, 0.09, back_h + (0.25 if wing else 0.0)), (0, d - 0.02, SEAT - 0.04), mat=f,
                bevel=0.05)]
    for sx in (-1, 1):
        for sy in (0.06, d - 0.06):
            objs.append(cyl(name + '_leg', 0.025, SEAT - 0.09, (sx * (wide / 2 - 0.05), sy, 0.0), mat=w, segs=8,
                            bevel=0.006))
        if arms or wing:
            objs.append(box(name + '_arm', (0.08, d - 0.06, 0.22), (sx * (wide / 2 + 0.01), d / 2 + 0.02, SEAT - 0.04),
                            mat=f, bevel=0.035))
        if wing:
            objs.append(box(name + '_wing', (0.08, 0.2, back_h + 0.1), (sx * (wide / 2 - 0.02), d - 0.1, SEAT + 0.1),
                            mat=f, bevel=0.04))
    if wing:
        mb = L.MB()
        for k in range(5):
            mb.sphere(0.018, CL.brass(), loc=(-wide / 2 + 0.06 + k * (wide - 0.12) / 4, d - 0.075, SEAT + back_h + 0.1),
                      segs=8, rings=5)
        objs.append(mb.done(name + '_studs'))
    a = math.radians(facing)
    # local -Y (front) must point to the facing direction: facing 0 -> -Y, 90 -> +X
    return L.group(objs, name, loc=(seat_front[0], seat_front[1], z0), rot=(0, 0, facing))


def desk(name, cx, cy, sx, sy, front, top_z, wood=OAK, top_col=None, panel_col=None, emblem=None):
    """Office desk: body sx (X) x sy (Y), top at top_z (absolute), modesty panel on the `front` face ('y-' / 'x+').
    Returns the list of objects."""
    wm = flat(wood, 0.55)
    dk = flat(hexmix(wood, '#000000', 0.22), 0.6)
    tm = flat(top_col or hexmix(wood, '#FFFFFF', 0.12), 0.45)
    z0 = top_z - DESK_TOP
    objs = [box(name + '_top', (sx + 0.06, sy + 0.06, 0.05), (cx, cy, top_z - 0.05), mat=tm, bevel=0.015)]
    # two pedestals with drawers (the person side is open)
    h = DESK_TOP - 0.05
    if front == 'y-':
        for s_ in (-1, 1):
            px = cx + s_ * (sx / 2 - 0.17)
            objs.append(box(name + '_ped', (0.34, sy - 0.02, h), (px, cy, z0), mat=wm, bevel=0.025))
            for k in range(3):
                objs.append(box(name + '_drw', (0.28, 0.02, 0.17), (px, cy + sy / 2 - 0.0, z0 + 0.06 + 0.2 * k),
                                mat=dk, bevel=0.006))
        objs.append(box(name + '_panel', (sx - 0.66, 0.05, h - 0.12), (cx, cy - sy / 2 + 0.06, z0 + 0.1),
                        mat=flat(panel_col or wood, 0.55), bevel=0.02))
        objs.append(box(name + '_kick', (sx, 0.04, 0.06), (cx, cy - sy / 2 + 0.01, z0), mat=dk, bevel=0.01))
        for s_ in (-1, 1):
            objs.append(box(name + '_trim', (0.03, 0.03, h - 0.08), (cx + s_ * (sx / 2 - 0.02), cy - sy / 2 - 0.005,
                                                                     z0 + 0.04), mat=dk, bevel=0.008))
    else:   # 'x+'
        for s_ in (-1, 1):
            py = cy + s_ * (sy / 2 - 0.17)
            objs.append(box(name + '_ped', (sx - 0.02, 0.34, h), (cx, py, z0), mat=wm, bevel=0.025))
        objs.append(box(name + '_panel', (0.05, sy - 0.66, h - 0.12), (cx + sx / 2 - 0.06, cy, z0 + 0.1),
                        mat=flat(panel_col or wood, 0.55), bevel=0.02))
        objs.append(box(name + '_kick', (0.04, sy, 0.06), (cx + sx / 2 - 0.01, cy, z0), mat=dk, bevel=0.01))
        for s_ in (-1, 1):
            objs.append(box(name + '_trim', (0.03, 0.03, h - 0.08), (cx + sx / 2 + 0.005, cy + s_ * (sy / 2 - 0.02),
                                                                     z0 + 0.04), mat=dk, bevel=0.008))
            for k in range(3):
                objs.append(box(name + '_drw', (0.02, 0.28, 0.17), (cx + sx / 2 - 0.0, cy + s_ * (sy / 2 - 0.17),
                                                                    z0 + 0.06 + 0.2 * k), mat=dk, bevel=0.006))
    if emblem:
        emblem(objs)
    return objs


# ------------------------------------------------------------------------------------------------ overlay models

def typewriter(name, loc, rot_z, col='#3FA58C'):
    """Chunky toy typewriter (body, 3 rows of round keys, carriage + roller + paper).  Returns (objs, setter)."""
    x, y, z = loc
    bm = flat(col, 0.35)
    dk = flat(hexmix(col, '#000000', 0.3), 0.4)
    with L.Collect() as c:
        box(name + '_body', (0.4, 0.3, 0.1), (0, 0.0, 0), mat=bm, bevel=0.035, taper=(0.95, 0.8))
        box(name + '_back', (0.38, 0.12, 0.08), (0, 0.09, 0.08), mat=bm, bevel=0.03)
        box(name + '_well', (0.32, 0.14, 0.02), (0, -0.05, 0.085), mat=flat(INK, 0.5), bevel=0.008)
    body = c.objs
    keys = []
    km = flat('#F4EFE4', 0.4)
    rim = flat(INK, 0.4)
    for row in range(3):
        rk = []
        for k in range(6 - (row == 2)):
            kx = -0.13 + 0.052 * k + 0.026 * (row == 2)
            ky = -0.11 + 0.035 * row
            kz = 0.075 + 0.012 * row
            kb = cyl(name + '_key', 0.017, 0.022, (kx, ky, kz), mat=rim, segs=10, bevel=0.004)
            kt = cyl(name + '_cap', 0.019, 0.008, (kx, ky, kz + 0.022), mat=km, segs=10, bevel=0.003)
            rk.append((kb, kt))
        keys.append(rk)
    sp = box(name + '_space', (0.16, 0.026, 0.014), (0, -0.142, 0.07), mat=km, bevel=0.005)
    with L.Collect() as cc:
        cyl(name + '_roll', 0.035, 0.42, (0, 0, 0), rot=(0, 90, 0), mat=flat(INK, 0.45), segs=14, origin='center',
            bevel=0.01)
        for s_ in (-1, 1):
            cyl(name + '_knob', 0.04, 0.035, (s_ * 0.23, 0, 0), rot=(0, 90, 0), mat=flat(GOLD, 0.3, 0.6), segs=14,
                origin='center', bevel=0.008)
        box(name + '_paper', (0.2, 0.012, 0.17), (0.0, 0.025, 0.02), rot=(-12, 0, 0), mat=flat(PAPER, 0.8),
            bevel=0.002)
        box(name + '_lever', (0.08, 0.012, 0.012), (-0.25, -0.02, 0.03), rot=(0, -30, 0), mat=flat(GOLD, 0.3, 0.6),
            bevel=0.003)
    carriage = L.group(BA.top_level(cc.objs), name + '_car', loc=(0, 0.11, 0.17))
    root = L.group(BA.top_level(body) + [o for rk in keys for p in rk for o in p] + [sp, carriage], name,
                   loc=(x, y, z), rot=(0, 0, rot_z))
    objs = [root] + BA.descendants([root])
    base = {id(kb): (kb.location.z, kt.location.z) for rk in keys for kb, kt in rk}

    hop = [[], [(0, 1), (1, 3), (2, 0)], [(0, 4), (1, 1), (2, 3)], [(0, 2), (2, 1), (1, 4)]]
    car = [0.0, 0.025, 0.05, 0.075]

    def setter(i):
        for rk in keys:
            for kb, kt in rk:
                z0, z1 = base[id(kb)]
                kb.location.z, kt.location.z = z0, z1
        for (r_, k_) in hop[i]:
            kb, kt = keys[r_][min(k_, len(keys[r_]) - 1)]
            z0, z1 = base[id(kb)]
            kb.location.z, kt.location.z = z0 + 0.03, z1 + 0.03
        carriage.location.x = car[i]
    return objs, setter


def desk_phone(name, loc, rot_z, col='#2B2F3A'):
    """Old-fashioned desk telephone: domed base with a gold dial, handset on the cradle.  Frame 1 = ringing (the
    handset jumps up and tilts, the base hops)."""
    x, y, z = loc
    bm = flat(col, 0.3)
    g = flat(GOLD, 0.3, 0.6)
    with L.Collect() as c:
        box(name + '_base', (0.22, 0.2, 0.05), (0, 0, 0), mat=bm, bevel=0.02)
        sphere(name + '_dome', 0.1, (0, 0.01, 0.05), bm, scale=(1.05, 0.95, 0.55), segs=18, rings=10)
        cyl(name + '_dial', 0.055, 0.012, (0, -0.07, 0.07), rot=(60, 0, 0), mat=g, segs=20, origin='center',
            bevel=0.004)
        cyl(name + '_dialc', 0.022, 0.016, (0, -0.072, 0.071), rot=(60, 0, 0), mat=flat(PAPER, 0.5), segs=14,
            origin='center', bevel=0.003)
        for s_ in (-1, 1):
            box(name + '_fork', (0.025, 0.03, 0.06), (s_ * 0.09, 0.02, 0.09), mat=bm, bevel=0.008)
    base_objs = c.objs
    with L.Collect() as hc:
        cyl(name + '_hs', 0.022, 0.2, (0, 0, 0), rot=(0, 90, 0), mat=bm, segs=12, origin='center', bevel=0.008)
        for s_ in (-1, 1):
            sphere(name + '_cup', 0.04, (s_ * 0.1, 0, -0.012), bm, scale=(0.9, 1.0, 0.7), segs=14, rings=8)
    hs = L.group(BA.top_level(hc.objs), name + '_handset', loc=(0, 0.02, 0.15))
    bgrp = L.group(BA.top_level(base_objs), name + '_bgrp', loc=(0, 0, 0))
    root = L.group([bgrp, hs], name, loc=(x, y, z), rot=(0, 0, rot_z))
    objs = [root] + BA.descendants([root])

    def setter(i):
        if i == 0:
            hs.location = (0, 0.02, 0.15)
            hs.rotation_euler = Euler((0, 0, 0), 'XYZ')
            bgrp.location = (0, 0, 0)
            bgrp.rotation_euler = Euler((0, 0, 0), 'XYZ')
        else:
            hs.location = (0.015, 0.01, 0.2)
            hs.rotation_euler = Euler((math.radians(6), math.radians(-14), math.radians(8)), 'XYZ')
            bgrp.location = (0, 0, 0.012)
            bgrp.rotation_euler = Euler((0, math.radians(4), 0), 'XYZ')
    return objs, setter


def desk_lamp(name, loc, rot_z):
    """Brass desk lamp with a big dome shade: frame 0 warm cream glow, frame 1 red alert shade (reads at phone zoom)."""
    x, y, z = loc
    br = CL.brass()
    warm = L.emissive(name + '_warm', '#FFE3A6', '#FFD27A', 1.7)
    red = L.emissive(name + '_red', '#F0453A', '#FF2E22', 3.2)
    with L.Collect() as c:
        cyl(name + '_foot', 0.085, 0.03, (0, 0, 0), mat=br, segs=18, bevel=0.01)
        cyl(name + '_stem', 0.016, 0.34, (0, 0.0, 0.025), mat=br, segs=10, bevel=0.004)
        cyl(name + '_arm', 0.014, 0.13, (0, 0.0, 0.34), rot=(0, 70, 0), mat=br, segs=8, bevel=0.003)
        sh = cyl(name + '_shade', 0.15, 0.13, (0.12, 0.0, 0.27), mat=warm, r_top=0.05, segs=24, bevel=0.015)
        cyl(name + '_bulb', 0.06, 0.02, (0.12, 0.0, 0.265), mat=L.emissive(name + '_bulbm', '#FFF6DA', '#FFF1C4',
                                                                           3.0), segs=12, bevel=0.0)
        sphere(name + '_knob', 0.024, (0.12, 0.0, 0.405), br, segs=8, rings=5)
    root = L.group(BA.top_level(c.objs), name, loc=(x, y, z), rot=(0, 0, rot_z))
    objs = [root] + BA.descendants([root])

    def setter(i):
        sh.data.materials.clear()
        sh.data.materials.append(warm if i == 0 else red)
    return objs, setter, sh


# ================================================================================================ the office

def build_office():
    """Builds every layer of chief_office + registers its overlays.  Returns {'fx': ..., 'extra': ..., 'pts': ...}."""
    CL.reset()
    pts = {}                    # name -> (x, y, z) for the manifest points not made by markers

    # -------------------------------------------------------------------------------------- floor
    stone = stone_plinth()
    with layer('floor'):
        box('plinth_f', (X1 - X0 + 0.12, Y1 - Y0 + 0.12, PL - 0.02), (0, 0, 0), mat=stone, bevel=0.03)
        box('boards', (XI1 - XI0 + 0.12, YI1 - YI0 + 0.12, 0.04), (0, 0, PL - 0.04), mat=floorboards(), bevel=0.0)
        # door mat inside + a teal runner toward the room
        box('mat_in', (0.85, 0.5, 0.012), (DOOR_X, YI0 + 0.3, PL), mat=L.stripes('#8A5A33', '#A8743F', 12.0, 'X',
                                                                                     rough=0.95), bevel=0.0)
        box('mat_in_b', (0.89, 0.54, 0.008), (DOOR_X, YI0 + 0.3, PL), mat=flat(RED, 0.8), bevel=0.0)
        box('runner', (0.7, 1.4, 0.008), (DOOR_X + 0.75, -0.95, PL), rot=(0, 0, -62),
            mat=L.stripes(TEAL, '#F3E3B5', 9.0, 'X', rough=0.9, soft=0.05), bevel=0.0)
        # the chief's raised round rug (dais) under desk + chair
        cyl('dais', 1.05, DAIS, (0.4, 1.2, PL), mat=flat(WALNUT, 0.6), segs=48, bevel=0.012)
        cyl('rug', 0.98, 0.012, (0.4, 1.2, PL + DAIS), mat=flat('#B8433A', 0.85), segs=48, bevel=0.0)
        cyl('rug2', 0.86, 0.014, (0.4, 1.2, PL + DAIS), mat=flat('#E3A93B', 0.85), segs=48, bevel=0.0)
        cyl('rug3', 0.8, 0.016, (0.4, 1.2, PL + DAIS), mat=flat('#B8433A', 0.85), segs=48, bevel=0.0)
        mb = L.MB()
        for k in range(16):
            a = math.tau * k / 16
            mb.sphere(0.045, flat('#E3A93B', 0.8), loc=(0.4 + 0.6 * math.cos(a), 1.2 + 0.6 * math.sin(a),
                                                        PL + DAIS + 0.012), scale=(1, 1, 0.25), segs=8, rings=4)
        mb.done('rugdots')
        # small round rug in the visitor corner
        cyl('rug_v', 0.55, 0.01, (1.6, -0.95, PL), mat=flat('#7FB5AB', 0.9), segs=36, bevel=0.0)
        cyl('rug_v2', 0.45, 0.012, (1.6, -0.95, PL), mat=flat('#F3E3B5', 0.9), segs=36, bevel=0.0)

    # -------------------------------------------------------------------------------------- back walls (inside)
    with layer('back'):
        bw = CL.wall_x('wall_back', X0, X1, Y1 - WT / 2, PL - 0.02, H, WT, wallpaper('X'))
        lw = CL.wall_y('wall_left', Y0, Y1 - WT, X0 + WT / 2, PL - 0.02, H, WT, wallpaper('Y'))
        CA.cap_strip('wcap', bw + lw)
        CL.wainscot('wsb', XI0, XI1, YI1, 0.82, face='y-', col=TIMBER, cap='#C98F55', z0=PL)
        CL.wainscot('wsl', YI0, YI1, XI0, 0.82, face='x+', col=TIMBER, cap='#C98F55', z0=PL)
        # crown moulding (timber) along the wall tops
        box('crown_b', (XI1 - XI0, 0.08, 0.1), (0, YI1 - 0.04, H - 0.14), mat=flat(TIMBER, 0.6), bevel=0.02)
        box('crown_l', (0.08, YI1 - YI0, 0.1), (XI0 + 0.04, 0, H - 0.14), mat=flat(TIMBER, 0.6), bevel=0.02)
        back_wall_dressing()
    # -------------------------------------------------------------------------------------- interior
    with layer('interior'):
        interior_furniture(pts)
    # -------------------------------------------------------------------------------------- interior front (desks)
    with layer('ifront'):
        desks(pts)
    # -------------------------------------------------------------------------------------- overlays
    overlays(pts)
    # -------------------------------------------------------------------------------------- shell
    with layer('shell'):
        shell(pts)
    with layer('shell_cut'):
        shell_cut()
    with layer('props'):
        props(pts)
    # -------------------------------------------------------------------------------------- markers (points)
    markers(pts)
    fx = {'chimney': pts['chimney'], 'kettle': pts['kettle'], 'lampDoor': pts['lantern'],
          'lamps': [pts['lamp_chief'], pts['lamp_a'], pts['lamp_b']],
          'windows': pts['windows'], 'sign': pts['sign_c'], 'stove': pts['stove_fire']}
    return {'fx': fx, 'pts': pts}


# ------------------------------------------------------------------------------------------------ back wall dressing

def back_wall_dressing():
    # ---- chalkboard 재고판 (blank) on the back wall X -0.2 .. 1.8, 1.0 - 1.9 m
    bx0, bx1, bz0, bz1 = -0.2, 1.8, PL + 1.0, PL + 1.9
    w, h = bx1 - bx0, bz1 - bz0
    cb = [box('cb_frame', (w, 0.06, h), (0, -0.03, 0), mat=flat('#9A6A42', 0.6), bevel=0.02),
          box('cb_slate', (w - 0.12, 0.03, h - 0.12), (0, -0.07, 0.06), mat=tonal('#2F4F43', 0.1, 6.0, rough=0.95),
              bevel=0.0),
          box('cb_tray', (w - 0.06, 0.1, 0.04), (0, -0.08, -0.01), mat=flat('#9A6A42', 0.6), bevel=0.012)]
    mbc = L.MB()
    for k, (dx, col) in enumerate(((-0.55, '#FBF6EA'), (-0.43, '#F6B6C8'), (-0.33, '#F7E27A'), (0.6, '#FBF6EA'))):
        mbc.cube((0.07, 0.016, 0.016), flat(col, 0.8), loc=(dx, -0.1, 0.04), rot=(0, 0, 8 * k))
    mbc.cube((0.12, 0.05, 0.035), flat('#3D7CC9', 0.7), loc=(0.35, -0.11, 0.045))
    mbc.cube((0.12, 0.05, 0.012), flat('#F4F1EA', 0.9), loc=(0.35, -0.11, 0.03))
    cb.append(mbc.done('cb_chalk'))
    # faint chalk smudges near the edges (the middle stays clean for the game's bars)
    cb.append(box('cb_smudge', (0.22, 0.004, 0.05), (-w / 2 + 0.22, -0.086, h - 0.16), rot=(0, 6, 0),
                  mat=flat('#6E8A7E', 0.95), bevel=0.0))
    T.face_group(cb, 'y-', ((bx0 + bx1) / 2, YI1, bz0), 'chalkboard')
    # ---- the town emblem above the chalkboard: teal shield with a gold pinecone + two little laurels
    em = [cyl('emb_disc', 0.27, 0.05, (0, -0.03, 0), rot=(90, 0, 0), mat=flat(TEAL, 0.5), segs=32, origin='center',
              bevel=0.012),
          cyl('emb_rim', 0.3, 0.04, (0, -0.015, 0), rot=(90, 0, 0), mat=CL.gold(), segs=32, origin='center',
              bevel=0.01)]
    with L.Collect() as pc:
        T.em_pinecone(0.55, col='#E3A93B')
    em.append(L.group(BA.top_level(pc.objs), 'emb_cone', loc=(0, -0.09, -0.01), rot=(90, 0, 0)))
    mbl = L.MB()
    for s_ in (-1, 1):
        for k in range(5):
            a = math.radians(200 + 28 * k) if s_ < 0 else math.radians(-20 - 28 * k)
            mbl.sphere(0.05, flat('#5E9A4A', 0.6), loc=(0.36 * math.cos(a), -0.05, 0.36 * math.sin(a)),
                       scale=(1.5, 0.5, 0.8), rot=(0, -math.degrees(a), 0), segs=8, rings=5)
    em.append(mbl.done('emb_laurel'))
    T.face_group(em, 'y-', (0.8, YI1, PL + 2.38), 'emblem')
    # ---- village map with pins: back wall X -2.15 .. -0.6
    mx0, mx1, mz0, mz1 = -2.12, -0.62, PL + 1.2, PL + 2.08
    mw, mh = mx1 - mx0, mz1 - mz0
    mp = [box('map_fr', (mw, 0.05, mh), (0, -0.025, 0), mat=flat('#7A4E2E', 0.6), bevel=0.02),
          box('map_land', (mw - 0.1, 0.02, mh - 0.1), (0, -0.055, 0.05), mat=tonal('#CFE5B5', 0.06, 5.0, rough=0.9),
              bevel=0.0),
          box('map_sea', (mw - 0.1, 0.022, 0.24), (0, -0.057, 0.05), mat=flat('#8CC6E6', 0.8), bevel=0.0)]
    mb = L.MB()
    for k in range(6):                                  # little wave dashes on the sea
        mb.cube((0.08, 0.006, 0.012), flat('#F4F9FC', 0.8), loc=(-0.6 + 0.24 * k, -0.07, 0.12 + 0.06 * (k % 2)))
    rd = flat('#F4EBD6', 0.8)
    mb.cube((mw - 0.16, 0.006, 0.035), rd, loc=(0, -0.07, 0.55))                 # main road
    mb.cube((0.035, 0.006, mh - 0.4), rd, loc=(-0.15, -0.07, 0.3 + (mh - 0.4) / 2))
    rl = flat('#8A5A33', 0.7)                                                   # rail line with ties
    mb.cube((mw - 0.2, 0.006, 0.018), rl, loc=(0.05, -0.07, 0.72))
    for k in range(14):
        mb.cube((0.012, 0.006, 0.05), rl, loc=(-0.6 + 0.095 * k, -0.071, 0.72))
    pm = flat('#F2C14E', 0.6)
    mb.cube((0.16, 0.006, 0.16), pm, loc=(-0.15, -0.072, 0.55))                  # the plaza
    for k, (hx, hz, col) in enumerate(((-0.45, 0.42, RED), (-0.32, 0.65, '#3D7CC9'), (0.15, 0.4, RED),
                                       (0.32, 0.62, '#E8749A'), (0.5, 0.42, '#3D7CC9'), (-0.55, 0.62, '#F2C14E'))):
        mb.cube((0.07, 0.008, 0.06), flat(col, 0.6), loc=(hx, -0.072, hz))
    for k, (tx, tz) in enumerate(((-0.62, 0.82), (-0.48, 0.86), (0.55, 0.8), (0.42, 0.84), (0.0, 0.84))):
        mb.cone(0.04, 0.0, 0.08, flat('#3E7F55', 0.6), loc=(tx, -0.07, tz), rot=(90, 0, 0), segs=6)
    mp.append(mb.done('map_art'))
    mbp = L.MB()
    for k, (px_, pz_, col) in enumerate(((-0.15, 0.6, RED), (0.32, 0.67, '#3D7CC9'), (-0.45, 0.47, RED),
                                         (0.5, 0.47, '#3D7CC9'), (0.18, 0.3, RED))):
        mbp.seg((px_, -0.06, pz_), (px_, -0.13, pz_ + 0.02), 0.006, flat('#D9DFE6', 0.3, 0.6), segs=5)
        mbp.sphere(0.035, flat(col, 0.35), loc=(px_, -0.135, pz_ + 0.025), segs=10, rings=6)
    mp.append(mbp.done('map_pins'))
    T.face_group(mp, 'y-', ((mx0 + mx1) / 2, YI1, mz0), 'villagemap')
    # ---- window on the back wall right (warm daylight, red curtains) + key board under it
    CA.inner_window('bwin', (2.24, YI1, PL + 2.42), 'y-', w=0.52, h=0.72, curtain=RED, seed=3)
    kb = [box('kb_board', (0.46, 0.04, 0.3), (0, -0.02, 0), mat=flat('#C98F55', 0.6), bevel=0.015),
          box('kb_rim', (0.5, 0.03, 0.34), (0, -0.005, -0.02), mat=flat(TIMBER_D, 0.6), bevel=0.012)]
    mbk = L.MB()
    for k in range(4):
        kx = -0.15 + 0.1 * k
        mbk.cube((0.012, 0.03, 0.012), flat(INK, 0.4), loc=(kx, -0.05, 0.24))
        mbk.seg((kx, -0.06, 0.23), (kx, -0.06, 0.17), 0.006, CL.brass(), segs=5)
        mbk.sphere(0.022, CL.brass(), loc=(kx, -0.06, 0.15), scale=(1, 0.4, 1), segs=8, rings=5)
        mbk.cube((0.015, 0.012, 0.07), CL.brass(), loc=(kx, -0.06, 0.1))
        mbk.cube((0.04, 0.008, 0.05), flat(['#F7E27A', '#F6B6C8', '#9FD3F0', '#FBF6EA'][k], 0.7),
                 loc=(kx + 0.02, -0.064, 0.06), rot=(0, 12, 0))
    kb.append(mbk.done('kb_keys'))
    T.face_group(kb, 'y-', (2.24, YI1, PL + 1.06), 'keyboard')
    # ---- sconces on the back wall
    CA.wall_lamp_in('sc0', (-0.42, YI1, PL + 1.95), 'y-', strength=2.2)
    # ---- left wall: cork notice board near the door, pigeonhole shelf, clock
    nb_ = [box('nb_fr', (0.8, 0.05, 0.62), (0, -0.025, 0), mat=flat(TIMBER, 0.6), bevel=0.02),
           box('nb_cork', (0.72, 0.03, 0.54), (0, -0.055, 0.04), mat=tonal('#C9925A', 0.14, 16.0, rough=0.95),
               bevel=0.0)]
    rnd = L.rng(21)
    mbn = L.MB()
    for k, (nx, nz, col, pw, ph) in enumerate(((-0.22, 0.32, '#FBF6EA', 0.2, 0.17), (0.04, 0.36, '#F7E27A', 0.17, 0.15),
                                                (0.24, 0.3, '#9FD3F0', 0.16, 0.2), (-0.2, 0.1, '#F6B6C8', 0.18, 0.15),
                                                (0.21, 0.08, '#FBF6EA', 0.17, 0.14))):
        mbn.cube((pw, 0.01, ph), flat(col, 0.8), loc=(nx, -0.078, nz), rot=(0, rnd.uniform(-9, 9), 0))
        mbn.sphere(0.018, flat([RED, '#3D7CC9', '#5CC86A'][k % 3], 0.35), loc=(nx, -0.09, nz + ph / 2 - 0.03), segs=8,
                   rings=5)
        for j in range(2):
            mbn.cube((pw * 0.7, 0.004, 0.012), flat('#8C94A0', 0.8), loc=(nx, -0.084, nz - 0.02 - 0.035 * j))
    # a photo (polaroid with a tiny snowy landscape) and a red ribbon rosette
    mbn.cube((0.14, 0.01, 0.16), flat('#FFFFFF', 0.6), loc=(0.0, -0.08, 0.12), rot=(0, -6, 0))
    mbn.cube((0.11, 0.004, 0.09), flat('#9FD3F0', 0.6), loc=(0.0, -0.086, 0.14), rot=(0, -6, 0))
    mbn.cube((0.11, 0.005, 0.035), flat('#F4F9FC', 0.6), loc=(0.0, -0.087, 0.11), rot=(0, -6, 0))
    mbn.cone(0.025, 0.0, 0.05, flat('#3E7F55', 0.6), loc=(-0.025, -0.089, 0.14), rot=(90, 0, 0), segs=5)
    mbn.sphere(0.045, flat(RED, 0.45), loc=(-0.06, -0.09, 0.47), scale=(1, 0.4, 1), segs=12, rings=6)
    mbn.sphere(0.02, flat(GOLD, 0.35), loc=(-0.06, -0.11, 0.47), segs=8, rings=5)
    for s_ in (-1, 1):
        mbn.cube((0.03, 0.006, 0.1), flat(RED, 0.45), loc=(-0.06 + s_ * 0.02, -0.09, 0.4), rot=(0, s_ * 18, 0))
    nb_.append(mbn.done('nb_notes'))
    T.face_group(nb_, 'x+', (XI0, -0.55, PL + 1.38), 'noticeboard')
    # pigeonhole mail shelf, 3 rows x 4 columns along the left wall (Y +0.4 .. +1.6), top at 2.2 m
    sy0, sy1, sz0 = 0.4, 1.6, PL + 1.3
    cw, ch, dep = (sy1 - sy0) / 4, 0.24, 0.28
    shelf = [box('ph_back', (sy1 - sy0 + 0.04, 0.02, 3 * ch + 0.04), (0, -0.01, -0.02), mat=flat('#9A6A42', 0.6),
                 bevel=0.0)]
    wd = flat('#B9783F', 0.55)
    for r_ in range(4):
        shelf.append(box('ph_h', (sy1 - sy0 + 0.04, dep, 0.025), (0, -dep / 2, r_ * ch - 0.02), mat=wd, bevel=0.006))
    for c_ in range(5):
        shelf.append(box('ph_v', (0.025, dep, 3 * ch + 0.02), (-(sy1 - sy0) / 2 + c_ * cw, -dep / 2, -0.02), mat=wd,
                         bevel=0.006))
    shelf.append(box('ph_top', (sy1 - sy0 + 0.1, dep + 0.04, 0.04), (0, -dep / 2, 3 * ch), mat=flat(TIMBER, 0.6),
                     bevel=0.012))
    mbs = L.MB()
    fill = {(0, 0): ('#FBF6EA', 3), (0, 2): ('#F6B6C8', 1), (1, 1): ('#FBF6EA', 2), (1, 3): ('#9FD3F0', 2),
            (2, 0): ('#F7E27A', 1), (2, 2): ('#FBF6EA', 3), (0, 3): ('#C9A06A', 0)}
    for (r_, c_), (col, n) in fill.items():
        cx = -(sy1 - sy0) / 2 + (c_ + 0.5) * cw
        if n == 0:          # a little parcel
            mbs.cube((0.18, 0.16, 0.12), flat(col, 0.8), loc=(cx, -0.1, r_ * ch + 0.07))
            mbs.cube((0.03, 0.17, 0.125), flat(RED, 0.6), loc=(cx, -0.1, r_ * ch + 0.07))
            continue
        for j in range(n):
            mbs.cube((0.2, 0.12, 0.012), flat(col if j == 0 else PAPER, 0.8),
                     loc=(cx + 0.01 * j, -0.12, r_ * ch + 0.02 + 0.06 * j), rot=(70 - 12 * j, 0, 0))
    shelf.append(mbs.done('ph_mail'))
    T.face_group(shelf, 'x+', (XI0, (sy0 + sy1) / 2, sz0), 'mailshelf')
    CL.wall_clock('clock', (XI0, -1.42, PL + 2.42), 'x+', r=0.2)
    CA.wall_lamp_in('sc1', (XI0, -1.2, PL + 1.95), 'x+', strength=2.0)


# ------------------------------------------------------------------------------------------------ interior

def interior_furniture(pts):
    # ---- pot-belly stove in the back-left corner, turned 45 deg toward the room
    sx_, sy_ = -2.28, 1.72
    im = flat('#3B3F48', 0.42, 0.35)
    st = []
    st.append(box('st_plate', (0.62, 0.62, 0.03), (0, 0, 0), mat=flat('#9A9086', 0.8), bevel=0.01))
    for k in range(3):
        a = math.tau * k / 3 + 0.3
        st.append(box('st_leg', (0.06, 0.06, 0.16), (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.03), mat=im,
                      bevel=0.015))
    st.append(cyl('st_base', 0.2, 0.08, (0, 0, 0.15), mat=im, segs=24, bevel=0.02))
    st.append(sphere('st_belly', 0.27, (0, 0, 0.45), im, scale=(1.0, 1.0, 1.0), segs=28, rings=16))
    st.append(cyl('st_band', 0.275, 0.04, (0, 0, 0.5), mat=flat('#C9A045', 0.35, 0.6), segs=28, bevel=0.01))
    st.append(cyl('st_top', 0.22, 0.1, (0, 0, 0.66), mat=im, segs=24, r_top=0.18, bevel=0.02))
    st.append(cyl('st_lid', 0.2, 0.03, (0, 0, 0.76), mat=flat('#2B2F3A', 0.4, 0.5), segs=24, bevel=0.01))
    # fire window recess (the flames are the 'stove' overlay): dark inside, brass frame, facing local -Y
    st.append(cyl('st_win_rim', 0.11, 0.06, (0, -0.25, 0.4), rot=(90, 0, 0), mat=flat('#C9A045', 0.35, 0.6), segs=24,
                  origin='center', bevel=0.012))
    st.append(cyl('st_win_in', 0.085, 0.07, (0, -0.255, 0.4), rot=(90, 0, 0), mat=flat('#2A1A14', 0.9), segs=24,
                  origin='center', bevel=0.0))
    st.append(sphere('st_knob', 0.025, (0.1, -0.26, 0.52), CL.brass(), segs=8, rings=5))
    km = flat(RED, 0.3)
    st.append(sphere('st_ket', 0.11, (-0.03, 0.02, 0.86), km, scale=(1, 1, 0.78), segs=18, rings=10))
    st.append(sphere('st_ketlid', 0.04, (-0.03, 0.02, 0.95), flat('#F4F1EA', 0.4), scale=(1, 1, 0.6), segs=10,
                     rings=6))
    st.append(cyl('st_spout', 0.02, 0.12, (0.08, -0.03, 0.86), rot=(0, 55, -30), mat=km, segs=8, bevel=0.0,
                  r_top=0.013))
    mbk = L.MB()
    T.ring_seg(mbk, (-0.03, 0.02, 0.92), 0.09, 0.012, flat(INK, 0.4), axis='y', a0=0.25, a1=math.pi - 0.25, n=8)
    st.append(mbk.done('st_kh'))
    st.append(cyl('st_pipe', 0.065, H - PL - 0.8, (0.0, 0.08, 0.78), mat=im, segs=14, bevel=0.0))
    st.append(cyl('st_pipe_c', 0.075, 0.05, (0.0, 0.08, 1.5), mat=flat('#C9A045', 0.35, 0.6), segs=14, bevel=0.01))
    # a little log basket beside it
    st.append(cyl('st_basket', 0.13, 0.2, (0.33, 0.12, 0.0), mat=L.stripes('#C98F55', '#A8743F', 30.0, 'Z',
                                                                         rough=0.85), segs=16, bevel=0.02))
    for k in range(3):
        st.append(L.log('st_log', 0.035, 0.3, (0.33 + 0.05 * (k - 1), 0.12, 0.22 + 0.02 * (k % 2)), rot=(90, 0, 20 * k),
                        segs=10))
    g = L.group(st, 'stove', loc=(sx_, sy_, PL), rot=(0, 0, 45))
    del g
    a = math.radians(45)
    fwd = Vector((math.sin(a), -math.cos(a), 0.0))                                # local -Y after the 45 deg turn
    pts['stove_fire'] = (sx_ + fwd.x * 0.25, sy_ + fwd.y * 0.25, PL + 0.4)
    spout = Vector((0.08 + 0.1 * math.cos(math.radians(30)), -0.03 - 0.06, 0.92))
    R = Euler((0, 0, a), 'XYZ').to_matrix()
    sp = R @ spout
    pts['kettle'] = (sx_ + sp.x, sy_ + sp.y, PL + sp.z + 0.05)
    pts['stove_xy'] = (sx_, sy_)
    pts['stove_ground'] = (sx_ + fwd.x * 0.62, sy_ + fwd.y * 0.62, PL)
    L.point_light('stove_l', (sx_ + fwd.x * 0.5, sy_ + fwd.y * 0.5, PL + 0.4), 'glow', 9.0, 0.15)

    # ---- filing cabinet (4 drawers) on the left wall between the clerk desks
    fx_, fy_ = XI0 + 0.24, 0.04
    fc = [box('fc_body', (0.46, 0.46, 1.28), (0, 0, 0), mat=flat('#7FA08A', 0.45, 0.15), bevel=0.03),
          box('fc_top', (0.5, 0.5, 0.04), (0, 0, 1.28), mat=flat('#6E8C78', 0.45, 0.15), bevel=0.012)]
    for k in range(4):
        fc.append(box('fc_drw', (0.03, 0.38, 0.27), (0.23, 0, 0.06 + 0.305 * k), mat=flat('#8FB39A', 0.45, 0.15),
                      bevel=0.012))
        fc.append(box('fc_hd', (0.03, 0.14, 0.03), (0.255, 0, 0.24 + 0.305 * k), mat=CL.brass(), bevel=0.006))
        fc.append(box('fc_lbl', (0.01, 0.1, 0.05), (0.25, 0, 0.29 + 0.305 * k), mat=flat(PAPER, 0.7), bevel=0.0))
    fc.append(ledger_book('fc_book', (0.0, -0.02, 1.32), w=0.2, d=0.28, t=0.06, col='#3D7CC9', ribbon=False))
    fc += potted_fern('fc_plant', (0.02, 0.1, 1.32), s=0.55, pot='#F3E3B5', seed=5)
    L.group(fc, 'filing', loc=(fx_, fy_, PL))

    # ---- coat rack by the door with a coat, a red scarf and a hat; umbrella stand
    cx_, cy_ = XI0 + 0.24, -1.68
    wd = flat(WALNUT, 0.6)
    cyl('cr_post', 0.03, 1.7, (cx_, cy_, PL), mat=wd, segs=10, bevel=0.005)
    for k in range(3):
        aa = math.tau * k / 3 + 0.4
        box('cr_foot', (0.26, 0.05, 0.04), (cx_ + 0.11 * math.cos(aa), cy_ + 0.11 * math.sin(aa), PL),
            rot=(0, 0, math.degrees(aa)), mat=wd, bevel=0.01)
    sphere('cr_top', 0.05, (cx_, cy_, PL + 1.72), wd, segs=10, rings=6)
    blob('cr_coat', 0.17, (cx_ + 0.02, cy_ - 0.04, PL + 1.15), flat('#7A3A2E', 0.85), scale=(0.75, 0.9, 2.1), seed=9,
         amp=0.08, subdiv=2)
    blob('cr_scarf', 0.08, (cx_ + 0.05, cy_ - 0.12, PL + 1.48), flat(RED, 0.8), scale=(1.4, 1.0, 0.7), seed=10,
         amp=0.1, subdiv=2)
    box('cr_scarf_t', (0.08, 0.03, 0.42), (cx_ + 0.1, cy_ - 0.16, PL + 1.05), rot=(0, 6, 0),
        mat=L.stripes(RED, '#F4F1EA', 14.0, 'Z', rough=0.85), bevel=0.012)
    cyl('cr_hat', 0.13, 0.03, (cx_ + 0.04, cy_ + 0.05, PL + 1.6), rot=(0, 18, 0), mat=flat('#4A4E58', 0.7), segs=20,
        bevel=0.01)
    cyl('cr_hat2', 0.08, 0.1, (cx_ + 0.04, cy_ + 0.05, PL + 1.61), rot=(0, 18, 0), mat=flat('#4A4E58', 0.7), segs=18,
        bevel=0.02)
    cyl('us_stand', 0.09, 0.32, (cx_ + 0.06, cy_ - 0.26, PL), mat=flat(TEAL, 0.5), segs=16, bevel=0.015)
    cyl('us_umb', 0.03, 0.62, (cx_ + 0.06, cy_ - 0.26, PL + 0.05), rot=(6, 4, 0), mat=flat('#3D7CC9', 0.6), segs=10,
        r_top=0.012, bevel=0.0)
    L.smooth_tube('us_hook', [(cx_ + 0.1, cy_ - 0.22, PL + 0.66), (cx_ + 0.11, cy_ - 0.22, PL + 0.73),
                              (cx_ + 0.06, cy_ - 0.22, PL + 0.76), (cx_ + 0.03, cy_ - 0.22, PL + 0.7)], 0.015,
                  flat(WALNUT, 0.5))

    # ---- chairs (seat FRONT-CENTRE at the seat point; the person anim anchors there)
    s1 = (-2.1, 0.5)
    s2 = (-2.1, -1.1)
    chair('ch_sem', s1, 90, col='#3D7CC9')
    chair('ch_bok', s2, 90, col='#E8749A')
    sc = (0.0, -1.06)
    chair('ch_chong', sc, 0, col='#F2C14E', back_h=0.42)
    sch = (0.4, 1.36)
    chair('ch_chief', sch, 0, col='#B8433A', wood=TIMBER_D, wide=0.56, back_h=0.62, z0=PL + DAIS, wing=True)
    st_ = (1.73, 0.75)
    chair('ch_ttal', st_, 90, col='#3FA58C', back_h=0.34)
    pts['seat_sem'] = (s1[0], s1[1], PL + SEAT)
    pts['seat_bok'] = (s2[0], s2[1], PL + SEAT)
    pts['seat_chong'] = (sc[0], sc[1], PL + SEAT)
    pts['seat_chief'] = (sch[0], sch[1], PL + DAIS + SEAT)
    pts['seat_ttal'] = (st_[0], st_[1], PL + SEAT)

    # ---- iron safe in the back-right corner, door on the -Y face (the door is the 'safe' overlay)
    kx_, ky_ = 2.3, 1.72
    sw, sd, sh = 0.62, 0.56, 0.82
    sm = flat('#2F5E4A', 0.4, 0.4)
    box('sf_body', (sw, sd, sh), (kx_, ky_, PL + 0.08), mat=sm, bevel=0.04)
    box('sf_top', (sw + 0.04, sd + 0.04, 0.04), (kx_, ky_, PL + 0.08 + sh), mat=flat('#244A3A', 0.4, 0.4),
        bevel=0.012)
    for sxx in (-1, 1):
        for syy in (-1, 1):
            cyl('sf_foot', 0.05, 0.08, (kx_ + sxx * (sw / 2 - 0.08), ky_ + syy * (sd / 2 - 0.08), PL), mat=CL.brass(),
                segs=12, bevel=0.01)
    box('sf_gold', (sw + 0.01, sd + 0.01, 0.03), (kx_, ky_, PL + 0.12), mat=CL.gold(), bevel=0.008)
    box('sf_gold2', (sw + 0.01, sd + 0.01, 0.03), (kx_, ky_, PL + 0.82), mat=CL.gold(), bevel=0.008)
    # the open cavity (seen when the door swings open): dark, with coin stacks and a gold bar
    fy_ = ky_ - sd / 2
    box('sf_cav', (sw - 0.12, 0.05, sh - 0.14), (kx_, fy_ + 0.015, PL + 0.15), mat=flat('#1E2E26', 0.8), bevel=0.0)
    box('sf_shelf', (sw - 0.14, 0.3, 0.025), (kx_, fy_ + 0.17, PL + 0.5), mat=flat('#3E6E58', 0.5), bevel=0.0)
    for k in range(4):
        cyl('sf_coins', 0.045, 0.05 + 0.03 * (k % 3), (kx_ - 0.17 + 0.11 * k, fy_ + 0.12, PL + 0.525), mat=CL.gold(),
            segs=14, bevel=0.006)
    box('sf_bar', (0.2, 0.1, 0.06), (kx_ - 0.05, fy_ + 0.12, PL + 0.2), mat=CL.gold(), bevel=0.012, taper=(0.8, 0.8))
    blob('sf_bag', 0.1, (kx_ + 0.14, fy_ + 0.15, PL + 0.27), burlap(), scale=(1, 1, 1.1), seed=31, amp=0.12,
         subdiv=2, flat_bottom=0.5)
    pts['safe_front'] = (kx_, fy_, PL)
    pts['safe_door'] = (kx_, fy_ - 0.01, PL + 0.08 + sh / 2)
    # coin sacks beside the safe (the courier's three sizes)
    coin_sack('cs1', (1.86, 1.78, PL), r=0.17, rot_z=-15, seed=1)
    coin_sack('cs2', (1.98, 1.42, PL), r=0.13, rot_z=10, seed=2)
    coin_sack('cs3', (XI1 - 0.2, 1.22, PL), r=0.12, rot_z=-30, seed=3, emblem=False)

    # ---- visitor bench (seats face -Y = SW on screen) with two cushions
    bx_, by_ = 1.6, -0.62
    bw_, bd_ = 1.1, 0.44
    wm = flat('#B9783F', 0.55)
    box('vb_seat', (bw_, bd_, 0.07), (bx_, by_, PL + SEAT - 0.07), mat=wm, bevel=0.02)
    box('vb_back', (bw_, 0.07, 0.48), (bx_, by_ + bd_ / 2 - 0.035, PL + SEAT - 0.02), mat=wm, bevel=0.02)
    box('vb_rail', (bw_ + 0.06, 0.09, 0.05), (bx_, by_ + bd_ / 2 - 0.035, PL + SEAT + 0.46), mat=flat(TIMBER, 0.55),
        bevel=0.015)
    for s_ in (-1, 1):
        box('vb_side', (0.06, bd_, SEAT + 0.2), (bx_ + s_ * (bw_ / 2 - 0.03), by_, PL), mat=flat(TIMBER, 0.55),
            bevel=0.015)
    for k, (dx, col) in enumerate(((-0.25, '#F2C14E'), (0.25, '#7FB5AB'))):
        box('vb_cush', (0.44, 0.36, 0.06), (bx_ + dx, by_ - 0.02, PL + SEAT - 0.01), mat=flat(col, 0.8), bevel=0.03)
    pts['seats'] = [(bx_ - 0.25, by_ - bd_ / 2 + 0.02, PL + SEAT), (bx_ + 0.25, by_ - bd_ / 2 + 0.02, PL + SEAT)]

    # ---- plants
    potted_fern('pl_fr', (XI1 - 0.25, YI0 + 0.25, PL), s=1.25, pot='#C2603F', seed=11)
    potted_fern('pl_bk', (-0.38, YI1 - 0.24, PL), s=1.0, pot=TEAL, seed=12)
    potted_fern('pl_fm', (1.0, YI0 + 0.24, PL), s=0.9, pot='#F3E3B5', seed=13)

    # ---- warm interior fill (bright dollhouse light)
    L.point_light('in_l1', (0.2, 0.2, PL + 2.5), 'window', 34.0, 0.4)
    L.point_light('in_l2', (-1.6, 0.6, PL + 2.4), 'window', 20.0, 0.3)
    L.point_light('in_l3', (1.8, 0.8, PL + 2.4), 'window', 16.0, 0.3)


# ------------------------------------------------------------------------------------------------ desks (ifront)

def desks(pts):
    # ---- the chief's big walnut desk (front faces -Y) on the dais
    cx, cy = 0.4, 0.92
    top = PL + DAIS + DESK_TOP

    def chief_emblem(objs):
        e = [cyl('cd_em', 0.12, 0.03, (0, 0, 0), rot=(90, 0, 0), mat=CL.gold(), segs=24, origin='center',
                 bevel=0.008)]
        with L.Collect() as pc:
            T.em_pinecone(0.26, col='#B47A2A')
        e.append(L.group(BA.top_level(pc.objs), 'cd_cone', loc=(0, -0.03, 0.0), rot=(90, 0, 0)))
        objs.append(L.group(e, 'cd_emg', loc=(cx, cy - 0.31 + 0.06 - 0.03, top - 0.36)))
    desk('cdesk', cx, cy, 1.36, 0.62, 'y-', top, wood=WALNUT, top_col='#3E7F55', panel_col='#8A5A33',
         emblem=chief_emblem)
    # desk things: nameplate (blank), stamp + ink pad, letters, globe, inkwell + quill (the lamp is fxPoints.lamps[0])
    box('cd_np', (0.36, 0.05, 0.08), (cx + 0.05, cy - 0.22, top), rot=(18, 0, 0), mat=flat('#7A4E2E', 0.5),
        bevel=0.012)
    box('cd_npf', (0.3, 0.012, 0.055), (cx + 0.05, cy - 0.25, top + 0.012), rot=(18, 0, 0), mat=CL.gold(),
        bevel=0.004)
    box('cd_pad', (0.14, 0.1, 0.02), (cx - 0.42, cy - 0.12, top), mat=flat(RED, 0.6), bevel=0.006)
    cyl('cd_stamp', 0.03, 0.06, (cx - 0.25, cy - 0.12, top), mat=flat('#C98F55', 0.5), segs=12, bevel=0.006)
    sphere('cd_stampk', 0.035, (cx - 0.25, cy - 0.12, top + 0.08), flat(RED, 0.4), segs=10, rings=6)
    for k in range(4):
        envelope('cd_let%d' % k, (cx + 0.38 + 0.01 * k, cy + 0.02, top + 0.013 * k),
                 col=[PAPER, '#F6D9E0', PAPER, '#D6E9F5'][k], rot_z=8 * k - 10, seal='heart' if k == 3 else None)
    cyl('cd_gl_st', 0.04, 0.02, (cx - 0.5, cy + 0.15, top), mat=CL.brass(), segs=14, bevel=0.005)
    cyl('cd_gl_p', 0.008, 0.08, (cx - 0.5, cy + 0.15, top + 0.02), mat=CL.brass(), segs=8)
    sphere('cd_globe', 0.075, (cx - 0.5, cy + 0.15, top + 0.17), flat('#6FB7DA', 0.5), segs=18, rings=10)
    for k, (dz, da) in enumerate(((0.03, 0.4), (-0.02, 2.3), (0.0, 4.1))):
        sphere('cd_land', 0.045, (cx - 0.5 + 0.055 * math.cos(da), cy + 0.15 + 0.055 * math.sin(da),
                                  top + 0.17 + dz), flat('#7BC27E', 0.6), scale=(1, 1, 0.5), segs=8, rings=5)
    L.smooth_tube('cd_gl_ring', [(cx - 0.5 + 0.09 * math.cos(t), cy + 0.15, top + 0.17 + 0.09 * math.sin(t))
                                 for t in [math.pi * (-0.6 + 1.2 * k / 8) for k in range(9)]], 0.006, CL.brass())
    cyl('cd_ink', 0.03, 0.05, (cx + 0.3, cy - 0.12, top), mat=flat('#2B2F3A', 0.2), segs=12, bevel=0.008)
    cyl('cd_quill', 0.006, 0.26, (cx + 0.3, cy - 0.12, top + 0.03), rot=(0, 24, 30), mat=flat('#F4F1EA', 0.6),
        segs=6, r_top=0.002)
    blob('cd_feather', 0.04, (cx + 0.36, cy - 0.09, top + 0.24), flat('#F4F1EA', 0.7), scale=(0.5, 0.35, 2.0),
         seed=4, amp=0.1, subdiv=2)
    ledger_book('cd_book', (cx - 0.12, cy + 0.12, top), w=0.22, d=0.3, t=0.06, col='#3D7CC9', rot_z=-14, ribbon=True)
    # the chief's lamp (static, warm green banker's lamp)
    lb = (cx + 0.55, cy + 0.16, top)
    box('cd_lb', (0.18, 0.12, 0.04), lb, mat=CL.brass(), bevel=0.012)
    cyl('cd_ls', 0.012, 0.24, (lb[0], lb[1], top + 0.04), mat=CL.brass(), segs=8)
    cyl('cd_lsh', 0.06, 0.24, (lb[0], lb[1] - 0.02, top + 0.31), rot=(0, 90, 0), mat=L.emissive('cd_lgl', '#3E8E57',
                                                                                               '#FFE3A6', 1.0),
        segs=16, origin='center', bevel=0.01)
    pts['lamp_chief'] = (lb[0], lb[1], top + 0.31)
    pts['chief_desk'] = (cx, cy)

    # ---- clerk desk 1 (셈이): faces +X, abacus + ledgers (+ overlays lamp_a / typewriter_a)
    d1 = (-1.72, 0.66)
    top1 = PL + DESK_TOP
    desk('desk1', d1[0], d1[1], 0.55, 0.92, 'x+', top1, wood=OAK, top_col='#D9A66A')
    # abacus: wooden frame with 5 rods of coloured beads (lies on the desk, toward the clerk's left = -Y side)
    ax_, ay_ = d1[0] + 0.02, d1[1] - 0.3
    ab = [box('ab_fr', (0.22, 0.3, 0.03), (0, 0, 0), mat=flat(WALNUT, 0.6), bevel=0.008)]
    mba = L.MB()
    for r_ in range(5):
        yy = -0.11 + 0.055 * r_
        mba.seg((-0.09, yy, 0.03), (0.09, yy, 0.03), 0.004, CL.brass(), segs=5)
        for b in range(5):
            mba.sphere(0.017, flat(['#D9483B', '#F2C14E', '#3D7CC9', '#3FA58C', '#E8749A'][r_], 0.4),
                       loc=(-0.075 + 0.03 * b + (0.03 if b > 2 else 0.0), yy, 0.032), scale=(0.7, 1, 0.9), segs=8,
                       rings=5)
    ab.append(mba.done('ab_beads'))
    L.group(ab, 'abacus', loc=(ax_, ay_, top1), rot=(0, 0, 8))
    ledger_book('d1_l1', (d1[0] + 0.12, d1[1] - 0.02, top1), col='#3E7F55', rot_z=12)
    ledger_book('d1_l2', (d1[0] + 0.13, d1[1] - 0.01, top1 + 0.07), col='#B8433A', rot_z=-6, ribbon=False)
    # open ledger in front of the clerk
    box('d1_open', (0.2, 0.3, 0.02), (d1[0] - 0.13, d1[1] - 0.14, top1), mat=flat(PAPER, 0.8), bevel=0.004)
    box('d1_open_c', (0.22, 0.32, 0.01), (d1[0] - 0.13, d1[1] - 0.14, top1 - 0.004), mat=flat('#3E7F55', 0.6),
        bevel=0.003)
    cyl('d1_pen', 0.008, 0.16, (d1[0] - 0.09, d1[1] - 0.06, top1 + 0.025), rot=(90, 0, 30), mat=flat(INK, 0.4),
        segs=6)
    pts['desk1'] = d1

    # ---- clerk desk 2 (소복이): faces +X, letter tray (+ overlays typewriter_b / phone / lamp_b)
    d2 = (-1.72, -0.72)
    desk('desk2', d2[0], d2[1], 0.55, 1.3, 'x+', top1, wood=OAK, top_col='#D9A66A')
    tray = [box('tr_b', (0.26, 0.2, 0.012), (0, 0, 0), mat=flat('#B9C2CE', 0.35, 0.5), bevel=0.003)]
    for s_ in (-1, 1):
        tray.append(box('tr_s', (0.26, 0.012, 0.06), (0, s_ * 0.1, 0), mat=flat('#B9C2CE', 0.35, 0.5), bevel=0.002))
    for k in range(3):
        tray.append(envelope('tr_e%d' % k, (0.0, 0.0, 0.014 + 0.014 * k), w=0.22, d=0.15,
                             col=[PAPER, '#F6D9E0', '#D6E9F5'][k], rot_z=6 * k - 6, seal=RED if k == 2 else None))
    L.group(tray, 'tray', loc=(d2[0] + 0.1, d2[1] - 0.48, top1), rot=(0, 0, 90))
    cyl('d2_mug', 0.04, 0.09, (d2[0] - 0.16, d2[1] - 0.5, top1), mat=flat('#F2C14E', 0.4), segs=14, bevel=0.01)
    cyl('d2_cocoa', 0.034, 0.004, (d2[0] - 0.16, d2[1] - 0.5, top1 + 0.085), mat=flat('#7A4A2A', 0.4), segs=14,
        bevel=0.0)
    pts['desk2'] = d2

    # ---- secretary desk (총총이): faces -Y, appointment book, desk bell, flowers
    d3 = (0.0, -1.5)
    desk('desk3', d3[0], d3[1], 1.0, 0.52, 'y-', top1, wood='#B9783F', top_col='#E3B67E', panel_col='#F3E3B5')
    box('d3_book', (0.3, 0.22, 0.03), (d3[0] - 0.08, d3[1] + 0.03, top1), rot=(0, 0, -6), mat=flat(RED, 0.6),
        bevel=0.008)
    box('d3_pages', (0.27, 0.2, 0.012), (d3[0] - 0.08, d3[1] + 0.03, top1 + 0.03), rot=(0, 0, -6),
        mat=L.stripes(PAPER, '#DCE4EE', 30.0, 'Y', rough=0.8), bevel=0.003)
    box('d3_spine', (0.02, 0.21, 0.014), (d3[0] - 0.08, d3[1] + 0.03, top1 + 0.04), rot=(0, 0, -6),
        mat=flat('#B02A3C', 0.5), bevel=0.003)
    sphere('d3_bell', 0.055, (d3[0] + 0.3, d3[1] - 0.06, top1 + 0.015), CL.gold(), scale=(1, 1, 0.7), segs=14, rings=8)
    cyl('d3_bellb', 0.06, 0.015, (d3[0] + 0.3, d3[1] - 0.06, top1), mat=flat(INK, 0.4), segs=14, bevel=0.004)
    sphere('d3_bellk', 0.014, (d3[0] + 0.3, d3[1] - 0.06, top1 + 0.06), CL.gold(), segs=8, rings=5)
    cyl('d3_vase', 0.05, 0.16, (d3[0] - 0.36, d3[1] + 0.08, top1), mat=flat('#7FB5AB', 0.25), segs=16, r_top=0.035,
        bevel=0.012)
    mbf = L.MB()
    for k, (fx, fy, fz, col) in enumerate(((0.0, 0.0, 0.3, '#F28DB2'), (-0.05, 0.02, 0.26, '#F2C14E'),
                                           (0.05, -0.02, 0.27, RED), (0.02, 0.05, 0.24, '#F4F1EA'),
                                           (-0.03, -0.04, 0.28, '#E8749A'))):
        mbf.seg((d3[0] - 0.36, d3[1] + 0.08, top1 + 0.12), (d3[0] - 0.36 + fx, d3[1] + 0.08 + fy, top1 + fz - 0.03),
                0.006, flat('#3E7F55', 0.6), segs=5)
        mbf.sphere(0.034, flat(col, 0.5), loc=(d3[0] - 0.36 + fx, d3[1] + 0.08 + fy, top1 + fz), segs=10, rings=6)
    mbf.done('d3_flowers')
    pts['desk3'] = d3

    # ---- courier's counting table (round-cornered square, coin stacks, a little brass scale)
    d4 = (2.12, 0.75)
    tw = flat('#C98F55', 0.55)
    box('ct_top', (0.6, 0.62, 0.05), (d4[0], d4[1], top1 - 0.05), mat=flat('#D9A66A', 0.45), bevel=0.02)
    box('ct_apron', (0.54, 0.56, 0.1), (d4[0], d4[1], top1 - 0.14), mat=tw, bevel=0.015)
    for sxx in (-1, 1):
        for syy in (-1, 1):
            cyl('ct_leg', 0.03, top1 - PL - 0.05, (d4[0] + sxx * 0.24, d4[1] + syy * 0.25, PL), mat=tw, segs=10,
                bevel=0.006, r_top=0.035)
    box('ct_felt', (0.4, 0.42, 0.006), (d4[0] - 0.02, d4[1], top1), mat=flat('#3E7F55', 0.9), bevel=0.0)
    for k, (dx, dy, n) in enumerate(((-0.1, -0.12, 5), (0.0, -0.13, 3), (0.08, -0.05, 6), (-0.08, 0.06, 2),
                                     (0.12, 0.12, 4))):
        for j in range(n):
            cyl('ct_coin', 0.04, 0.014, (d4[0] + dx, d4[1] + dy, top1 + 0.006 + 0.014 * j), mat=CL.gold(), segs=16,
                bevel=0.004)
    # tiny brass balance scale at the back corner
    sx2, sy2 = d4[0] + 0.18, d4[1] + 0.2
    cyl('ct_sc_b', 0.05, 0.02, (sx2, sy2, top1), mat=CL.brass(), segs=14, bevel=0.005)
    cyl('ct_sc_p', 0.008, 0.18, (sx2, sy2, top1 + 0.02), mat=CL.brass(), segs=8)
    box('ct_sc_beam', (0.2, 0.012, 0.012), (sx2, sy2, top1 + 0.2), mat=CL.brass(), bevel=0.0)
    for s_ in (-1, 1):
        cyl('ct_sc_pan', 0.045, 0.012, (sx2 + s_ * 0.1, sy2, top1 + 0.12), mat=CL.brass(), segs=14, bevel=0.004)
        L.smooth_tube('ct_sc_w', [(sx2 + s_ * 0.1, sy2, top1 + 0.2), (sx2 + s_ * 0.1, sy2, top1 + 0.13)], 0.003,
                      CL.brass())
    pts['desk4'] = d4


# ------------------------------------------------------------------------------------------------ overlays

def overlays(pts):
    """Animated overlays.  Desk-top ones (typewriters, phone, lamps) are rendered as PATCHES (the overlay + the desk
    top around it, see off_render) and keep to the screen-right half of each clerk desk, so a seated clerk never
    covers them; the stove fire and the safe door are plain overlays on _interior furniture."""
    top1 = PL + DESK_TOP
    with layer('typewriter_a'):
        objs, set_a = typewriter('tw_a', (-1.82, 0.85, top1), -90, col='#3FA58C')
    CL.overlay('typewriter_a', objs, set_a, 4, fps=10, repeat=-1, extra={'mode': 'patch', 'desk': 'sem'})
    with layer('lamp_a'):
        objs, set_la, sh_a = desk_lamp('lp_a', (-1.53, 1.0, top1), -45)
    CL.overlay('lamp_a', objs, set_la, 2, fps=2, repeat=-1, extra={'mode': 'patch', 'desk': 'sem'})
    with layer('typewriter_b'):
        objs, set_b = typewriter('tw_b', (-1.82, -0.78, top1), -90, col='#E8746A')
    CL.overlay('typewriter_b', objs, set_b, 4, fps=10, repeat=-1, extra={'mode': 'patch', 'desk': 'bok'})
    with layer('lamp_b'):
        objs, set_lb, sh_b = desk_lamp('lp_b', (-1.9, -0.3, top1), -45)
    CL.overlay('lamp_b', objs, set_lb, 2, fps=2, repeat=-1, extra={'mode': 'patch', 'desk': 'bok'})
    with layer('phone'):
        objs, set_p = desk_phone('ph', (-1.55, -0.4, top1), 60)
    CL.overlay('phone', objs, set_p, 2, fps=8, repeat=-1, extra={'mode': 'patch', 'desk': 'bok'})
    bpy.context.view_layer.update()
    for nm, sh in (('lamp_a', sh_a), ('lamp_b', sh_b)):
        p = sh.matrix_world.translation
        pts[nm] = (p.x, p.y, p.z + 0.04)
    # stove fire: three flame tongues + an ember bed inside the window recess (facing the room)
    sx_, sy_ = pts['stove_xy']
    with layer('stove'):
        hot = L.emissive('fire_hot', '#FFE27A', '#FFD25A', 3.2)
        mid = L.emissive('fire_mid', '#FF9A3A', '#FF8A2A', 2.6)
        red = L.emissive('fire_red', '#E8463C', '#FF4A1E', 1.8)
        with L.Collect() as fc:
            bed = sphere('fire_bed', 0.07, (0, -0.23, 0.33), red, scale=(1.2, 0.5, 0.45), segs=12, rings=6)
            f1 = sphere('fire_f1', 0.04, (-0.03, -0.235, 0.39), mid, scale=(0.8, 0.4, 1.4), segs=10, rings=8)
            f2 = sphere('fire_f2', 0.032, (0.035, -0.235, 0.38), mid, scale=(0.8, 0.4, 1.3), segs=10, rings=8)
            f3 = sphere('fire_f3', 0.022, (0.0, -0.24, 0.37), hot, scale=(0.9, 0.4, 1.4), segs=10, rings=8)
            gl = cyl('fire_glass', 0.086, 0.01, (0, -0.258, 0.4), rot=(90, 0, 0), mat=L.emissive('fire_gl', '#FFB45A',
                                                                                              '#FF9A3A', 0.35),
                     segs=24, origin='center', bevel=0.0)
        del bed, gl
        sg = L.group(BA.top_level(fc.objs), 'stovefire', loc=(sx_, sy_, PL), rot=(0, 0, 45))
    sobjs = [sg] + BA.descendants([sg])
    flick = [((1.0, 1.0), (1.0, 1.0), (1.0, 1.0)), ((1.25, 0.9), (0.8, 1.15), (1.2, 1.0)),
             ((0.9, 1.15), (1.2, 0.9), (0.85, 1.25)), ((1.15, 1.05), (1.05, 1.2), (1.1, 0.8))]
    base = {f: (f.location.copy(), f.scale.copy()) for f in (f1, f2, f3)}

    def set_fire(i):
        for f, (zs, ws) in zip((f1, f2, f3), flick[i]):
            loc, sc = base[f]
            f.scale = (sc.x * ws, sc.y, sc.z * zs)
            f.location = (loc.x + 0.008 * (ws - 1.0) * 4, loc.y, loc.z + 0.03 * (zs - 1.0))
        L.set_emission(mid, [2.6, 3.1, 2.3, 2.9][i])
    CL.overlay('stove', sobjs, set_fire, 4, fps=6, repeat=-1, extra={'mode': 'plain'})
    # safe door: hinge on the left (-X) edge of the -Y face, swings toward the camera
    sf = pts['safe_front']
    with layer('safe'):
        dm = flat('#346B54', 0.38, 0.4)
        with L.Collect() as dc:
            dw_, dh_ = 0.5, 0.64
            box('sd_leaf', (dw_, 0.06, dh_), (dw_ / 2, -0.03, -dh_ / 2), mat=dm, bevel=0.025)
            box('sd_rim', (dw_ - 0.08, 0.02, dh_ - 0.08), (dw_ / 2, -0.065, -dh_ / 2 + 0.04), mat=flat('#2F5E4A', 0.4,
                                                                                                      0.4), bevel=0.01)
            cyl('sd_dial', 0.075, 0.03, (dw_ / 2, -0.08, 0.1), rot=(90, 0, 0), mat=CL.gold(), segs=24, origin='center',
                bevel=0.008)
            cyl('sd_dialc', 0.04, 0.035, (dw_ / 2, -0.085, 0.1), rot=(90, 0, 0), mat=flat(INK, 0.4), segs=18,
                origin='center', bevel=0.006)
            mbd = L.MB()
            for k in range(12):
                aa = math.tau * k / 12
                mbd.cube((0.008, 0.01, 0.018), flat(INK, 0.4), loc=(dw_ / 2 + 0.062 * math.cos(aa), -0.097,
                                                                    0.1 + 0.062 * math.sin(aa)),
                         rot=(0, -math.degrees(aa) + 90, 0))
            mbd.done('sd_ticks')
            box('sd_handle', (0.04, 0.05, 0.16), (dw_ - 0.08, -0.08, -0.12), mat=CL.gold(), bevel=0.012)
            cyl('sd_hub', 0.03, 0.04, (dw_ / 2, -0.09, -0.14), rot=(90, 0, 0), mat=CL.gold(), segs=12,
                origin='center', bevel=0.006)
            for k in range(3):
                cyl('sd_hinge', 0.025, 0.1, (0.0, -0.03, -0.1 - 0.2 * k), mat=CL.brass(), segs=10, bevel=0.005)
            # a pinecone plate on the door
            box('sd_plate', (0.18, 0.012, 0.07), (dw_ / 2, -0.08, -0.28), mat=CL.gold(), bevel=0.006)
        door = L.group(BA.top_level(dc.objs), 'safedoor', loc=(sf[0] - 0.25, sf[1] - 0.005, PL + 0.08 + 0.41 + 0.32))
    dobjs = [door] + BA.descendants([door])

    def set_safe(i):
        door.rotation_euler = Euler((0, 0, math.radians(0 if i == 0 else -105)), 'XYZ')
    CL.overlay('safe', dobjs, set_safe, 2, fps=6, repeat=0, extra={'mode': 'plain'})
    CL.bounds_marker('safe_bm', (sf[0] - 0.25, sf[1] - 0.55, PL + 0.6))
    for name, ov in CL.OVERLAYS.items():
        ov['set'](0)


# ------------------------------------------------------------------------------------------------ shell

def ext_window(name, loc, face, w=0.66, h=1.18, curtain=RED, seed=0):
    """Tall white-framed window (loc = top-centre of the glass on the wall surface): warm-lit glass, little red
    curtains tied back + a valance, a cross bar, a stone sill with snow.  The glass carries off_glow."""
    fm = flat(TRIM, 0.6)
    gm = L.emissive(name + '_glass', '#FFE2A0', 'window', 1.75)
    objs = [box(name + '_fr', (w + 0.18, 0.1, h + 0.18), (0, -0.03, -h - 0.09), mat=fm, bevel=0.03)]
    g = box(name + '_gl', (w, 0.1, h), (0, -0.05, -h), mat=gm, bevel=0.01)
    glow([g])
    objs.append(g)
    cm = flat(curtain, 0.8)
    for s_ in (-1, 1):
        objs.append(box(name + '_cu', (w * 0.24, 0.03, h * 0.86), (s_ * (w / 2 - w * 0.12), -0.1, -h * 0.86 - 0.02),
                        mat=cm, bevel=0.012, taper=(1.5, 1.0)))
    objs.append(box(name + '_val', (w, 0.03, 0.12), (0, -0.1, -0.13), mat=L.stripes(curtain, '#F4F1EA', 18.0, 'X',
                                                                                    rough=0.85), bevel=0.01))
    objs.append(box(name + '_b1', (0.05, 0.12, h), (0, -0.07, -h), mat=fm, bevel=0.0))
    objs.append(box(name + '_b2', (w, 0.12, 0.05), (0, -0.07, -h * 0.42), mat=fm, bevel=0.0))
    objs.append(box(name + '_sill', (w + 0.3, 0.2, 0.07), (0, -0.09, -h - 0.17), mat=flat('#E6E0D6', 0.7),
                    bevel=0.02))
    objs.append(L.snow_slab(name + '_snow', w + 0.24, 0.18, 0.05, (0, -0.1, -h - 0.1), seed=seed))
    objs.append(box(name + '_head', (w + 0.3, 0.14, 0.08), (0, -0.07, 0.07), mat=flat(TIMBER, 0.6), bevel=0.02))
    return T.face_group(objs, face, loc, name)


def plinth_shell():
    return box('plinth_s', (X1 - X0 + 0.12, Y1 - Y0 + 0.12, PL - 0.02), (0, 0, 0), mat=stone_plinth(), bevel=0.03)


def shell(pts):
    pm = plaster()
    tm = flat(TIMBER, 0.62)
    plinth_shell()
    box('sh_floorcap', (X1 - X0, Y1 - Y0, 0.04), (0, 0, PL - 0.04), mat=flat(STONE, 0.8), bevel=0.0)
    box('wall_front', (X1 - X0, WT, H - PL + 0.02), (0, Y0 + WT / 2, PL - 0.02), mat=pm, bevel=0.015)
    box('wall_right', (WT, Y1 - Y0 - WT, H - PL + 0.02), (X1 - WT / 2, (Y0 + Y1) / 2 + WT / 2, PL - 0.02), mat=pm,
        bevel=0.015)
    # timber frame: corner posts, a sill beam on the plinth, a belt at the sill line, the eave beam
    T.corner_trims('post', X1 - X0, Y1 - Y0, PL - 0.02, H - PL + 0.02, TIMBER, t=0.2, faces=('fl', 'fr', 'br'))
    T.band('sillbeam', X1 - X0, Y1 - Y0, PL - 0.02, TIMBER, h=0.14, out=0.03)
    T.band('belt', X1 - X0, Y1 - Y0, STUB - 0.06, TIMBER, h=0.1, out=0.025)
    T.band('eave', X1 - X0, Y1 - Y0, H - 0.16, TIMBER, h=0.16, out=0.04)
    # a few vertical posts on the long front face between the openings + little diagonal braces (half-timber charm)
    for k, x in enumerate((-0.82, 0.92)):
        box('fpost%d' % k, (0.14, 0.05, H - STUB - 0.2), (x, Y0 - 0.02, STUB + 0.04), mat=tm, bevel=0.012)
    for k, y in enumerate((-0.05,)):
        box('rpost%d' % k, (0.05, 0.14, H - STUB - 0.2), (X1 + 0.02, y, STUB + 0.04), mat=tm, bevel=0.012)
    for k, (x, s_) in enumerate(((-0.82, 1), (0.92, -1))):
        ln = 0.62
        box('fbrace%d' % k, (0.08, 0.04, ln), (x + s_ * 0.2, Y0 - 0.025, STUB + 0.12), rot=(0, s_ * 38, 0),
            mat=tm, bevel=0.008)
    # roof: teal gable along X with snow, two gable ends in plaster with timber trim
    T.gable('roof', X1 - X0, Y1 - Y0, H, RIDGE, OVER, TEAL, PLASTER, seed=41, ridge_col=TEAL_D,
            snow_frac=(0.36, 0.5))
    # timber barge boards on the right gable (the face the camera sees)
    slope = (RIDGE - H) / ((Y1 - Y0) / 2)
    for s_ in (-1, 1):
        y_a, y_b = s_ * ((Y1 - Y0) / 2 + OVER), 0.0
        z_a, z_b = H - OVER * slope, RIDGE
        ln = math.hypot(y_b - y_a, z_b - z_a)
        ang = math.degrees(math.atan2(z_b - z_a, abs(y_b - y_a)))
        box('barge%d' % (s_ > 0), (0.07, ln, 0.14), (X1 + 0.06, (y_a + y_b) / 2, (z_a + z_b) / 2 - 0.08),
            rot=(-s_ * ang, 0, 0), mat=tm, bevel=0.015, origin='center')
    # round attic emblem in the right gable: teal disc with a gold pinecone
    T.sign_disc('gemb', (X1 + 0.07, 0.0, H + 0.48), r=0.27, bg=TEAL, rim=GOLD, psi=90.0, tilt=0.0,
                emblem=lambda s: T.em_pinecone(s * 0.6, col='#E3A93B'), es=1.0, snow=False)
    # pinecone finial at the right gable apex
    with L.Collect() as fc:
        T.em_pinecone(0.62, col='#B47A2A')
    L.group(BA.top_level(fc.objs), 'finial', loc=(X1 + OVER * 0.3, 0.0, RIDGE + 0.42))
    cyl('finial_post', 0.035, 0.24, (X1 + OVER * 0.3, 0.0, RIDGE + 0.1), mat=CL.gold(), segs=10)
    # brick chimney on the back slope (left of the middle)
    chx, chy = -1.55, 0.95
    zr = RIDGE - chy * slope
    objs, top = T.chimney('chim', chx, chy, zr - 0.25, RIDGE + 0.36, col='#B4593F', w=0.4)
    PA.snow_cap('chim_snow', 0.17, (chx - 0.03, chy, RIDGE + 0.46), 0.06, 7, scale=(1.3, 1.2, 1.0))
    pts['chimney'] = (chx, chy, RIDGE + 0.55)
    # the door: teal double door with brass knobs under a fan light (glowing), timber door posts
    T.door('door', (DOOR_X, Y0, PL), 'y-', w=DOOR_W, h=DOOR_H, col='#2E7F7A', frame_col=TRIM, double=True,
           step=False, knob='gold')
    fl = [cyl('fan_fr', DOOR_W / 2 + 0.08, 0.1, (0, -0.03, 0), rot=(90, 0, 0), mat=flat(TRIM, 0.6), segs=32,
              origin='center', bevel=0.02)]
    fg = cyl('fan_gl', DOOR_W / 2 - 0.02, 0.1, (0, -0.05, 0), rot=(90, 0, 0), mat=L.emissive('fan_glm', '#FFE2A0',
                                                                                           'window', 1.75),
             segs=32, origin='center', bevel=0.0)
    glow([fg])
    fl.append(fg)
    mbr = L.MB()
    for k in range(5):
        aa = math.pi * (k + 0.5) / 5
        mbr.seg((0, -0.11, 0), ((DOOR_W / 2 - 0.02) * math.cos(aa), -0.11, (DOOR_W / 2 - 0.02) * math.sin(aa)), 0.018,
                flat(TRIM, 0.6), segs=6)
    fl.append(mbr.done('fan_bars'))
    fl.append(box('fan_cut', (DOOR_W + 0.3, 0.3, 0.6), (0, -0.05, -0.6), mat=flat(TRIM, 0.6), bevel=0.0))
    # (fan_cut is removed below - the lower half of the discs is hidden by the door frame)
    g_ = T.face_group(fl, 'y-', (DOOR_X, Y0, PL + DOOR_H + 0.04), 'fanlight')
    for o in BA.descendants([g_]):
        if o.name.startswith('fan_cut'):
            bpy.data.objects.remove(o, do_unlink=True)
    # lower half-discs are hidden behind a lintel beam
    box('door_lintel', (DOOR_W + 0.34, 0.16, 0.12), (DOOR_X, Y0 - 0.06, PL + DOOR_H - 0.02), mat=tm, bevel=0.02)
    for s_ in (-1, 1):
        box('door_post', (0.12, 0.12, DOOR_H + 0.5), (DOOR_X + s_ * (DOOR_W / 2 + 0.17), Y0 - 0.04, PL - 0.02),
            mat=tm, bevel=0.015)
    # windows: two on the front, two on the right side
    wins = []
    for k, x in enumerate((0.05, 1.82)):
        ext_window('fw%d' % k, (x, Y0, STUB + 0.08 + 1.18), 'y-', seed=50 + k)
        wins.append((x, Y0 - 0.05, STUB + 0.08 + 0.59))
    for k, y in enumerate((-1.08, 1.0)):
        ext_window('sw%d' % k, (X1, y, STUB + 0.08 + 1.18), 'x+', seed=60 + k)
        wins.append((X1 + 0.05, y, STUB + 0.08 + 0.59))
    wins.append((DOOR_X, Y0 - 0.05, PL + DOOR_H + 0.2))
    pts['windows'] = wins
    # flower boxes under the two front windows
    for k, x in enumerate((0.05, 1.82)):
        box('fbox%d' % k, (0.8, 0.22, 0.16), (x, Y0 - 0.2, STUB - 0.2), mat=flat(TEAL, 0.55), bevel=0.02)
        mbf = L.MB()
        for j in range(7):
            mbf.sphere(0.06, flat('#3E7F55', 0.6), loc=(x - 0.32 + 0.107 * j, Y0 - 0.22, STUB - 0.02), segs=8,
                       rings=5)
            mbf.sphere(0.035, flat([RED, '#F2C14E', '#F28DB2'][j % 3], 0.5), loc=(x - 0.3 + 0.107 * j, Y0 - 0.3,
                                                                                 STUB + 0.02), segs=8, rings=5)
        mbf.done('fbox_f%d' % k)
        L.snow_slab('fbox_s%d' % k, 0.74, 0.14, 0.04, (x, Y0 - 0.2, STUB - 0.03), seed=70 + k)
    # the sign board over the door: cream board with a teal rim and gold corner studs, standing on the eave in
    # front of the roof edge (BLANK - the game writes 촌장 사무실 into signRect)
    sbw, sbh = 2.0, 0.56
    sx_ = DOOR_X + 0.15
    sy_ = Y0 - OVER - 0.08
    sz0 = H - 0.26
    sb = [box('sign_rim', (sbw + 0.2, 0.08, sbh + 0.2), (0, 0.0, -0.1), mat=flat(TEAL_D, 0.5), bevel=0.035),
          box('sign_face', (sbw, 0.06, sbh), (0, -0.04, 0.0), mat=flat('#FFF3D6', 0.75), bevel=0.012)]
    for sxx in (-1, 1):
        for szz in (0, 1):
            sb.append(sphere('sign_stud', 0.03, (sxx * (sbw / 2 - 0.06), -0.07, 0.06 + szz * (sbh - 0.12)), CL.gold(),
                             segs=10, rings=6))
    sb.append(L.snow_slab('sign_snow', sbw + 0.08, 0.12, 0.06, (0, 0.0, sbh + 0.05), seed=81))
    for sxx in (-1, 1):
        sb.append(box('sign_brk', (0.05, OVER + 0.12, 0.05), (sxx * (sbw / 2 - 0.25), 0.2, 0.1),
                      mat=flat('#3D424C', 0.45, 0.6), bevel=0.0))
    T.face_group(sb, 'y-', (sx_, sy_, sz0), 'signboard')
    pts['sign_c'] = (sx_, sy_ - 0.07, sz0 + sbh / 2)
    pts['sign_w'] = sbw
    pts['sign_h'] = sbh
    # snow drifts against the walls (behind the building too: the closed look)
    for k, (x, y, r) in enumerate(((X1 + 0.15, Y1 - 0.3, 0.3), (X0 - 0.1, Y1 + 0.1, 0.3), (X1 + 0.1, -0.6, 0.18))):
        LA.snow_drift('sdrift%d' % k, r, (x, y, 0.0), seed=90 + k)


def shell_cut():
    pm = plaster()
    tm = flat(TIMBER, 0.62)
    gap = (DOOR_X - DOOR_W / 2 - 0.1, DOOR_X + DOOR_W / 2 + 0.1)
    fr = CL.wall_x('stub_front', X0, X1, Y0 + WT / 2, PL - 0.02, STUB, WT, pm,
                   holes=[(gap[0], gap[1], PL - 0.03, STUB + 0.1)])
    rt = CL.wall_y('stub_right', Y0 + WT, Y1, X1 - WT / 2, PL - 0.02, STUB, WT, pm)
    CA.cap_strip('stubcap', fr + rt, col=CL.CUT)
    T.corner_trims('cpost', X1 - X0, Y1 - Y0, PL - 0.02, STUB - PL + 0.02, TIMBER, t=0.2, faces=('fl', 'fr', 'br'))
    T.band('csill', X1 - X0, Y1 - Y0, PL - 0.02, TIMBER, h=0.14, out=0.03)
    # the belt beam on top of the cut (timber) - but not across the doorway
    for (a, b) in ((X0 - 0.03, gap[0]), (gap[1], X1 + 0.03)):
        box('cbelt_f', (b - a, WT + 0.05, 0.1), ((a + b) / 2, Y0 + WT / 2 - 0.0, STUB - 0.06), mat=tm, bevel=0.015)
    box('cbelt_r', (WT + 0.05, Y1 - Y0 + 0.06, 0.1), (X1 - WT / 2, 0.0, STUB - 0.06), mat=tm, bevel=0.015)
    # window sills on the cut (front + right)
    for k, x in enumerate((0.05, 1.82)):
        box('csl_f%d' % k, (0.96, 0.32, 0.07), (x, Y0 + 0.06, STUB + 0.04), mat=flat('#E6E0D6', 0.7), bevel=0.02)
        L.snow_slab('csn_f%d' % k, 0.86, 0.14, 0.04, (x, Y0 - 0.02, STUB + 0.1), seed=110 + k)
        box('cfb%d' % k, (0.8, 0.22, 0.16), (x, Y0 - 0.2, STUB - 0.2), mat=flat(TEAL, 0.55), bevel=0.02)
        mbf = L.MB()
        for j in range(7):
            mbf.sphere(0.06, flat('#3E7F55', 0.6), loc=(x - 0.32 + 0.107 * j, Y0 - 0.22, STUB - 0.02), segs=8,
                       rings=5)
            mbf.sphere(0.035, flat([RED, '#F2C14E', '#F28DB2'][j % 3], 0.5), loc=(x - 0.3 + 0.107 * j, Y0 - 0.3,
                                                                                 STUB + 0.02), segs=8, rings=5)
        mbf.done('cfb_f%d' % k)
    for k, y in enumerate((-1.08, 1.0)):
        box('csl_r%d' % k, (0.32, 0.96, 0.07), (X1 - 0.06, y, STUB + 0.04), mat=flat('#E6E0D6', 0.7), bevel=0.02)
        L.snow_slab('csn_r%d' % k, 0.14, 0.86, 0.04, (X1 + 0.02, y, STUB + 0.1), seed=120 + k)
    # the door frame: two timber posts + the lintel (a portal that says 'door here') + the threshold
    for s_ in (-1, 1):
        box('cdoor_post', (0.12, 0.2, DOOR_H + 0.12), (DOOR_X + s_ * (DOOR_W / 2 + 0.1), Y0 + WT / 2, PL - 0.02),
            mat=tm, bevel=0.015)
    box('cdoor_lintel', (DOOR_W + 0.34, 0.22, 0.14), (DOOR_X, Y0 + WT / 2, PL + DOOR_H + 0.08), mat=tm, bevel=0.02)
    box('cdoor_thr', (DOOR_W + 0.1, WT + 0.06, 0.03), (DOOR_X, Y0 + WT / 2, PL - 0.01), mat=flat('#E6E0D6', 0.7),
        bevel=0.008)


def props(pts):
    # stone steps up to the door (the floor is 0.3 m up), a doormat, the lantern on its post, snow tufts
    sm = snowy('#CBC4B7', lo=0.6, hi=0.8, noise_amt=0.3)
    sw = DOOR_W + 0.55
    box('step2', (sw, 0.34, PL - 0.02), (DOOR_X, Y0 - 0.06 - 0.17, 0), mat=sm, bevel=0.03)
    box('step1', (sw + 0.1, 0.3, (PL - 0.02) * 0.5), (DOOR_X, Y0 - 0.06 - 0.34 - 0.15, 0), mat=sm, bevel=0.03)
    box('mat_out', (0.8, 0.26, 0.012), (DOOR_X, Y0 - 0.06 - 0.17, PL - 0.02), mat=L.stripes(RED, '#C9A06A', 10.0,
                                                                                               'X', rough=0.95),
        bevel=0.0)
    # lantern post left of the steps
    lx, ly = DOOR_X - 0.88, Y0 - 0.58
    iron = flat('#2E3A4A', 0.45, 0.6)
    cyl('lp_foot', 0.12, 0.1, (lx, ly, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=16, r_top=0.09, bevel=0.02)
    cyl('lp_post', 0.04, 1.62, (lx, ly, 0.08), mat=iron, segs=12, bevel=0.01)
    box('lp_arm', (0.04, 0.04, 0.26), (lx, ly, 1.62), mat=iron, bevel=0.0)
    lm = PA.lantern('lp_lantern', (lx, ly, 1.7), size=0.2, strength=4.0)
    for o in bpy.data.objects:
        if o.name.startswith('lp_lantern_glass'):
            glow([o])
    PA.snow_cap('lp_snow', 0.1, (lx, ly, 1.97), 0.05, 5)
    cyl('lp_fpole', 0.014, 0.5, (lx, ly, 2.0), mat=flat(GOLD, 0.3, 0.6), segs=8)
    sphere('lp_fball', 0.03, (lx, ly, 2.52), CL.gold(), segs=8, rings=5)
    PA.flag('lp_pennant', (lx + 0.01, ly, 2.48), 0.36, 0.22, TEAL, seed=3, emblem=False)
    del lm
    pts['lantern'] = (lx, ly, 1.83)
    # little hanging plaque under the lantern arm: a teal board with a gold pinecone (charm, no text)
    pl = [box('pq_b', (0.3, 0.03, 0.2), (0, 0, -0.1), mat=flat(TEAL, 0.55), bevel=0.012),
          box('pq_r', (0.33, 0.025, 0.23), (0, 0.006, -0.1), mat=CL.gold(), bevel=0.01)]
    with L.Collect() as pc:
        T.em_pinecone(0.22, col='#E3A93B')
    pl.append(L.group(BA.top_level(pc.objs), 'pq_cone', loc=(0, -0.03, -0.1), rot=(90, 0, 0)))
    L.smooth_tube('pq_chain', [(lx + 0.0, ly, 1.42), (lx + 0.0, ly, 1.33)], 0.008, iron)
    pg = L.group(pl, 'plaque', loc=(lx, ly - 0.01, 1.34), rot=(0, 0, 45))
    del pg
    box('pq_arm', (0.04, 0.04, 0.04), (lx, ly, 1.4), mat=iron, bevel=0.0)
    # snow tufts beside the steps + a small drift at the front-right corner
    LA.snow_drift('pdrift0', 0.22, (DOOR_X + 0.78, Y0 - 0.42, 0.0), seed=131)
    LA.snow_drift('pdrift1', 0.26, (X1 + 0.12, Y0 - 0.1, 0.0), seed=132)


# ------------------------------------------------------------------------------------------------ markers

def markers(pts):
    mark('door', (DOOR_X, Y0 - 0.06 - 0.34 - 0.3 - 0.22, 0.0), facing=(0, 1, 0))
    mark('entry', (DOOR_X, YI0 + 0.36, PL), facing=(0, 1, 0))
    c = pts['seat_chief']
    mark('chiefdesk', c, facing=(0, -1, 0))
    mark('chiefpad', (0.4, 0.15, PL), facing=(0, 1, 0))
    for k, (key, f) in enumerate((('seat_sem', (1, 0, 0)), ('seat_bok', (1, 0, 0)), ('seat_chong', (0, -1, 0)),
                                  ('seat_ttal', (1, 0, 0)))):
        mark('desk', pts[key], facing=f)
    mark('board', (1.42, 1.62, PL), facing=(0, 1, 0))
    mark('cabinet', (XI0 + 0.72, 0.06, PL), facing=(-1, 0, 0))
    mark('shelf', (XI0 + 0.5, 1.3, PL), facing=(-1, 0, 0))
    sf = pts['safe_front']
    mark('safe', (sf[0], sf[1] - 0.42, PL), facing=(0, 1, 0))
    mark('stove', pts['stove_ground'], facing=None)
    for p in pts['seats']:
        mark('seat', p, facing=(0, -1, 0))


# ================================================================================================ mailbox

MAILBOX_NOTE = ('Red post mailbox (1.1 m, footprint 0.4 m) outside the office: a rounded red box with a pinecone '
                'emblem on its +X side and a little red flag, a cream door with the letter slot on the front (-Y), '
                'snow on top, on a timber post with a snowy foot.  anims.flag 2 f (0 down, 1 up), anims.pop 3 f @ '
                '12 fps (the flag springs up and wobbles; ends on flag frame 1).  slotPoint = where letters fly in.')


def build_mailbox():
    """Returns {'frames': [(name, setter)], 'fx': {...}} for bld_render.render_build."""
    red = flat(RED, 0.4)
    wood = flat(TIMBER, 0.62)
    box('mb_foot', (0.36, 0.36, 0.1), (0, 0.02, 0), mat=snowy('#CBC4B7', lo=0.6, hi=0.8), bevel=0.03)
    box('mb_post', (0.12, 0.12, 0.58), (0, 0.04, 0.08), mat=wood, bevel=0.02)
    box('mb_brace', (0.07, 0.22, 0.06), (0, 0.04, 0.52), rot=(32, 0, 0), mat=wood, bevel=0.01)
    bz = 0.64
    bw, bl, bh = 0.34, 0.46, 0.2
    box('mb_body', (bw, bl, bh), (0, 0.0, bz), mat=red, bevel=0.035)
    cyl('mb_round', bw / 2, bl, (0, 0.0, bz + bh), rot=(90, 0, 0), mat=red, segs=28, origin='center', bevel=0.025)
    # front door (-Y face) with a letter slot + a little brass latch, a pinecone stamp
    box('mb_door', (bw - 0.05, 0.02, bh + bw / 2 - 0.05), (0, -bl / 2 - 0.006, bz + 0.025), mat=flat('#FBF3DF', 0.6),
        bevel=0.008)
    box('mb_slot', (bw * 0.62, 0.02, 0.03), (0, -bl / 2 - 0.018, bz + bh - 0.01), mat=flat(INK, 0.5), bevel=0.004)
    sphere('mb_latch', 0.022, (0, -bl / 2 - 0.022, bz + 0.07), CL.brass(), segs=8, rings=5)
    # pinecone emblem on the +X side (gold disc + cone), the side the camera sees
    em = [cyl('mb_em', 0.1, 0.02, (0, 0, 0), rot=(90, 0, 0), mat=CL.gold(), segs=24, origin='center', bevel=0.005),
          cyl('mb_emr', 0.11, 0.015, (0, 0.006, 0), rot=(90, 0, 0), mat=flat('#C98F2E', 0.35, 0.6), segs=24,
              origin='center', bevel=0.004)]
    with L.Collect() as pc:
        T.em_pinecone(0.22, col='#B47A2A')
    em.append(L.group(BA.top_level(pc.objs), 'mb_cone', loc=(0, -0.025, 0), rot=(90, 0, 0)))
    L.group(em, 'mb_emg', loc=(bw / 2 + 0.012, -0.06, bz + 0.16), rot=(0, 0, 90))
    PA.snow_cap('mb_snow', 0.17, (0.0, 0.02, bz + bh + bw / 2 - 0.02), 0.08, 4, scale=(1.0, 1.55, 1.0))
    # the flag on the +X side, hinged near the back: a gold arm with a big red-and-gold flag plate
    with L.Collect() as fc:
        box('mb_flagarm', (0.025, 0.025, 0.3), (0, 0, 0), mat=flat('#E3A93B', 0.35, 0.5), bevel=0.006)
        box('mb_flag', (0.025, 0.16, 0.12), (0, -0.08, 0.2), mat=flat('#F2C14E', 0.4), bevel=0.012)
        box('mb_flagin', (0.03, 0.11, 0.07), (0, -0.08, 0.225), mat=flat(RED, 0.4), bevel=0.008)
    flag = L.group(BA.top_level(fc.objs), 'mb_flaggrp', loc=(bw / 2 + 0.035, bl / 2 - 0.08, bz + 0.1))
    cyl('mb_hinge', 0.03, 0.04, (bw / 2 + 0.03, bl / 2 - 0.08, bz + 0.1), rot=(0, 90, 0), mat=CL.brass(), segs=10,
        origin='center')
    LA.snow_drift('mb_drift', 0.16, (0.14, -0.12, 0.0), seed=7)

    def pose(deg):
        def f():
            # 0 deg = up (vertical); -90 = down (lying along the box, pointing to the front)
            flag.rotation_euler = Euler((math.radians(deg), 0, 0), 'XYZ')
        return f
    frames = [('office_mailbox', pose(-90)), ('office_mailbox_flag_1', pose(0)),
              ('office_mailbox_pop_0', pose(24)), ('office_mailbox_pop_1', pose(-16))]
    fx = {'slot': (0.0, -bl / 2 - 0.03, bz + bh - 0.01), 'flag': (bw / 2 + 0.04, bl / 2 - 0.16, bz + 0.38)}
    return {'frames': frames, 'fx': fx}


# ================================================================================================ items

ITEMS = {
    'item_coin_sack_s': dict(thickness=0.4, r=0.2, notes='Small coin sack: burlap tied with red string, a gold coin '
                                                          'emblem, coins peeking out.'),
    'item_coin_sack_m': dict(thickness=0.48, r=0.24, notes='Medium coin sack (the same sack, fuller).'),
    'item_coin_sack_l': dict(thickness=0.54, r=0.265, notes='Large coin sack, bulging with coins.'),
    'item_letter_bundle': dict(thickness=0.13, notes='Bundle of 5 envelopes (cream, pink, blue) tied with a red '
                                                     'string bow, a red heart seal on top.'),
    'item_newspaper_bundle': dict(thickness=0.17, notes='Folded newspapers (grey column lines, no text) tied with '
                                                        'twine.'),
    'item_ledger': dict(thickness=0.1, notes='Thick green ledger with gold corners and a red ribbon bookmark.'),
}


def build_item(key):
    spec = ITEMS[key]
    with L.Collect() as c:
        if key.startswith('item_coin_sack'):
            coin_sack(key, (0, 0, 0), r=spec['r'], rot_z=-45.0, seed={'s': 1, 'm': 2, 'l': 3}[key[-1]], coins=True,
                      emblem=True)
        elif key == 'item_letter_bundle':
            cols = [PAPER, '#F6D9E0', '#D6E9F5', PAPER, '#F7E7B0']
            for k in range(5):
                envelope('lb%d' % k, (0.01 * (k % 2), 0.006 * k, 0.016 * k), w=0.46, d=0.3, col=cols[k],
                         rot_z=[0, 6, -4, 3, -2][k], seal='heart' if k == 4 else None)
            sm = flat(RED, 0.5)
            box('lb_s1', (0.48, 0.022, 0.1), (0, 0.0, -0.004), mat=sm, bevel=0.005)
            box('lb_s2', (0.022, 0.32, 0.1), (0.07, 0.0, -0.004), mat=sm, bevel=0.005)
            mb = L.MB()
            for s_ in (-1, 1):
                mb.sphere(0.045, sm, loc=(0.07 + s_ * 0.048, -0.03, 0.104), scale=(1.3, 0.6, 0.8), segs=10, rings=6)
                mb.seg((0.07, -0.045, 0.1), (0.07 + s_ * 0.06, -0.11, 0.094), 0.012, sm, segs=5)
            mb.sphere(0.02, sm, loc=(0.07, -0.045, 0.106), segs=8, rings=5)
            mb.done('lb_bow')
        elif key == 'item_newspaper_bundle':
            nm = newsprint()
            for k in range(4):
                box('np%d' % k, (0.5, 0.34, 0.045), (0.006 * (k % 2), 0.004 * k, 0.046 * k),
                    rot=(0, 0, [0, 4, -3, 2][k]), mat=nm, bevel=0.016)
                box('np_m%d' % k, (0.11, 0.28, 0.005), (-0.17 + 0.006 * (k % 2), 0.004 * k, 0.046 * k + 0.044),
                    rot=(0, 0, [0, 4, -3, 2][k]), mat=flat('#C0473A', 0.7), bevel=0.0)
            tw = flat('#C9A06A', 0.85)
            for x in (-0.1, 0.12):
                box('np_t', (0.022, 0.37, 0.19), (x, 0.0, -0.004), mat=tw, bevel=0.006)
            box('np_t2', (0.52, 0.022, 0.19), (0.0, 0.0, -0.004), mat=tw, bevel=0.006)
            sphere('np_knot', 0.03, (0.12, 0.0, 0.19), tw, segs=8, rings=5)
        elif key == 'item_ledger':
            ledger_book('ld', (0, 0, 0), w=0.34, d=0.44, t=0.13, col='#3E7F55', ribbon=True)
    BA._ground_item(c.objs, tilt=0.0, spin={'item_letter_bundle': -20.0, 'item_newspaper_bundle': -20.0}.get(key, 0.0))
