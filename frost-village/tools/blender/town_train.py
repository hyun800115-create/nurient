"""
town_train.py - the short snow train of 솔방울 마을 (docs/CONTRACT_V4.md section K): a red toy steam engine with a
yellow snow plough and a little driver in the cab, a blue passenger coach and an open goods wagon.

Each car is its own characters-style atlas (separate sprites so the game can chain them along the rails, each
depth-sorted by its own anchor and able to follow a curve):
    train_engine   idle 4f (standing, steam wisps, driver waves) + move 8f (crank / rods / wheels, puffs of smoke)
    train_car_a    passenger coach   idle 1f + move 8f (wheels turn, gentle sway)
    train_car_b    goods wagon       idle 1f + move 8f (cargoPoint: the game draws bought goods on its deck)
Dirs: all 5 render dirs S, SE, E, NE, N (SW/W/NW = flipX).  Rails run along the two iso axes, i.e. the train
heads SE / NW (world +-X) or NE / SW (world +-Y) on straight track - those four headings are the rendered SE / NE
frames and their mirrors; S, E and N are the in-between headings used while the train rounds a curve or a
turntable, so a path follower never has to snap more than 45 deg.

Frames: <cache>/<key>/<anim>_<dir>_<i>.png, one fixed frame size per car, anchor = ground point under the car centre
on the track centre line (world origin, z = 0; wheels stand on the rail top at RAIL_TOP).  NO baked shadow; the pack
adds the characters' 1 px ink outline.  Separate soft shadow frames shadow_<DIR>.png for all EIGHT headings (the
mirrored dirs need their own shadow, the light does not flip) with their own frame size / anchor.
meta.json: frameSize, anchor, anims, lengthM, couplerM {front, back} (local metres along the heading),
smokePoint / lampPoint / cargoPoint / boardPoint per dir (px offsets from the anchor), headTop, shadow frame info.

Rendered by town_render.py (keys train_engine, train_car_a, train_car_b).
"""
import json
import math
import os
import time
from collections import OrderedDict

import bpy
from mathutils import Vector, Euler, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import C, flat, box, cyl, sphere, blob, extrude, tonal, hexmix
import prop_assets as PA
import bld_assets as BA

TRAIN = OrderedDict()
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
RAIL_TOP = 0.15            # rail head height (town_rails builds the same)
GAUGE = 0.9                # rail centre distance
MARGIN = 4


def car(key, anims, length, coupler, samples=24, notes=''):
    def deco(fn):
        TRAIN[key] = dict(key=key, fn=fn, anims=anims, length=length, coupler=coupler, samples=samples, notes=notes)
        return fn
    return deco


# =========================================================================== shared parts

def wheel(name, r, w=0.08, col='#2B2F3A', hub='#D9483B', rim='#F4F1EA', spokes=3, crank=None):
    """Disc wheel along local X (axle), centred at the origin: dark disc + coloured hub + white tyre line and
    `spokes` coloured holes, so a 45 deg step per frame reads as forward rolling.  crank = pin radius."""
    objs = [cyl(name + '_d', r, w, (0, 0, 0), rot=(0, 90, 0), mat=flat(col, 0.45), segs=32, origin='center',
                bevel=0.02),
            cyl(name + '_t', r * 0.92, w + 0.012, (0, 0, 0), rot=(0, 90, 0), mat=flat(rim, 0.5), segs=32,
                origin='center', bevel=0.005),
            cyl(name + '_f', r * 0.84, w + 0.02, (0, 0, 0), rot=(0, 90, 0), mat=flat(hub, 0.45), segs=32,
                origin='center', bevel=0.01),
            cyl(name + '_h', r * 0.25, w + 0.05, (0, 0, 0), rot=(0, 90, 0), mat=flat('#F2C14E', 0.3, 0.7), segs=16,
                origin='center', bevel=0.01)]
    for k in range(spokes):
        a = math.tau * k / spokes
        objs.append(cyl(name + '_o', r * 0.17, w + 0.03, (0, r * 0.55 * math.cos(a), r * 0.55 * math.sin(a)),
                        rot=(0, 90, 0), mat=flat(col, 0.45), segs=14, origin='center', bevel=0.0))
    pin = None
    if crank:
        pin = Vector((0.0, 0.0, crank))
        objs.append(cyl(name + '_pin', 0.035, w + 0.12, tuple(pin), rot=(0, 90, 0), mat=flat('#B9C2CE', 0.3, 0.75),
                        segs=12, origin='center'))
        cw = [(r * 0.75 * math.cos(t), r * 0.75 * math.sin(t)) for t in [math.pi + 0.5 + (math.pi - 1.0) * k / 10
                                                                        for k in range(11)]]
        cw += [(r * 0.4 * math.cos(t), r * 0.4 * math.sin(t)) for t in [2 * math.pi - 0.5 - (math.pi - 1.0) * k / 10
                                                                      for k in range(11)]]
        cwo = extrude(name + '_cw', [(-z, y) for y, z in cw], w + 0.026, rot=(0, 90, 0), top=flat(col, 0.45),
                      side=flat(col, 0.45), bevel=0.0)
        cwo.location.x = -(w + 0.026) / 2
        objs.append(cwo)
    return L.group(objs, name)


def bogie_wheels(prefix, ys, r, crank=None, hub='#D9483B'):
    """Wheels on both sides (x = +-GAUGE/2) at the given local y positions; returns [(empty, y)]."""
    out = []
    for k, y in enumerate(ys):
        for s in (-1, 1):
            w = wheel('%s%d%s' % (prefix, k, 'LR'[s > 0]), r, crank=crank, hub=hub)
            w.location = (s * GAUGE / 2, y, RAIL_TOP + r)
            out.append(w)
    return out


def roof_curved(name, W, Lg, z, rise=0.16, col='#8E2F27', over=0.08, seed=0):
    """Barrel roof along local Y (coaches / cab): an arc section extruded along Y + a snow slab."""
    n = 10
    pts = []
    R = (W / 2 + over) ** 2 / (2 * rise) + rise / 2
    for k in range(n + 1):
        x = -W / 2 - over + (W + 2 * over) * k / n
        zz = math.sqrt(max(0.0, R * R - x * x)) - (R - rise)
        pts.append((x, zz))
    thick = 0.07
    outline = pts + [(x, zz - thick) for x, zz in reversed(pts)]
    rm = flat(col, 0.6)
    o = extrude(name, outline, Lg + 2 * over, rot=(90, 0, 0), top=rm, side=rm, bevel=0.015)
    o.location = (0, (Lg + 2 * over) / 2, z)
    out = [o]
    for k, (yy, rr) in enumerate(((-Lg * 0.22, 0.2), (Lg * 0.18, 0.24))):
        out.append(PA.snow_cap(name + '_snow%d' % k, rr, (0.06 * (k * 2 - 1), yy, z + rise - 0.02), 0.07, seed + k,
                               scale=(1.0, 1.3, 1.0)))
    return out


def lamp(name, loc, r=0.08):
    m = L.emissive(name + '_g', '#FFF1C4', '#FFD27A', 3.5)
    objs = [cyl(name + '_b', r * 1.2, 0.08, loc, rot=(90, 0, 0), mat=flat('#2B2F3A', 0.4, 0.5), segs=16,
                origin='center'),
            sphere(name + '_l', r, (loc[0], loc[1] - 0.04, loc[2]), m, scale=(1, 0.6, 1), segs=16, rings=8)]
    return objs


def coupler(name, y, z=0.42):
    m = flat('#2B2F3A', 0.4, 0.5)
    return [box(name, (0.1, 0.22, 0.08), (0, y, z - 0.04), mat=m, bevel=0.02),
            cyl(name + '_h', 0.05, 0.06, (0, y + (0.11 if y > 0 else -0.11), z), rot=(90, 0, 0), mat=m, segs=10,
                origin='center')]


def buffers(name, y, z=0.5, col='#2B2F3A'):
    out = []
    for s in (-1, 1):
        out.append(cyl(name, 0.07, 0.14, (s * 0.38, y, z), rot=(90, 0, 0), mat=flat('#3D424C', 0.4, 0.5), segs=14,
                       origin='center'))
        out.append(cyl(name + '_p', 0.09, 0.03, (s * 0.38, y + math.copysign(0.075, y), z), rot=(90, 0, 0),
                       mat=flat(col, 0.4, 0.5), segs=14, origin='center'))
    return out


def driver_dress(rig, spec):
    """Engine driver: blue-white striped (hickory) cap, red neckerchief, navy jacket."""
    import char_build as CB
    import char_geo as G
    CB.hair_shell(rig, '#3A2A22', fringe=0.26, wave=0.06, waves=10.0, sweep=0.05)
    CB.cap_shell(rig, CB.M('capblue', '#3B5B9A', rough=0.7), lambda x, y: 0.26 - 0.14 * y, base=1.12, puff=0.08,
                 name='cap_top')
    CB.tilted_ring(rig, 'cap_band', CB.M('capband', '#F4F1EA', rough=0.7), CB.HEAD_R[0] * 1.06, 0.03, 0.34, 0.18,
                   sy=1.0, rz=1.3)
    peak = G.bm_slab([(-0.15, 0.0), (0.15, 0.0), (0.11, -0.12), (-0.11, -0.12)], 0.025, bevel=0.008)
    G.mesh_obj('cap_peak', peak, CB.M('peak2', '#2E4F8A', rough=0.6), rig.j['head'], loc=(0, -0.21, 0.36),
               rot=(-12, 0, 0))
    G.mesh_obj('scarf', G.bm_ring(0.135, 0.06, seg=48, segr=12, sy=0.92), CB.M('neck', '#D9483B', rough=0.8),
               rig.j['chest'], loc=(0, 0.01, 0.10))


def make_driver(grp, loc):
    """Driver rig (char_build body) parented to the train group; None if the character builder is unavailable."""
    try:
        import bld_boats as BB
        rig = BB.crew_rig('villager_c', spec_over={'coat': '#2E3F66', 'coat_rough': 0.75, 'pants': '#2E3440',
                                                   'boots': '#2A2A30', 'mitten': '#F4F1EA', 'hem_fur': False},
                          dress=driver_dress)
    except Exception as e:                                     # keep the train renderable without the rig
        print('WARNING train driver not built: %r' % (e,), flush=True)
        return None
    rig.j['root'].parent = grp
    rig.rest_loc['root'] = Vector(loc)
    return rig


# =========================================================================== engine

ENG_NOTE = ('Snow train engine (~2.6 m incl. the plough): red toy steam locomotive with gold bands, a tall flared '
            'black chimney, headlamp, gold dome + bell, a yellow V snow plough pushing a little snow, big red disc '
            'wheels with crank pins + side / main rods, a navy cab with a cosy lit window and the driver in a striped '
            'cap. idle = standing (steam wisps, driver waves); move = 8-frame loop: one full wheel turn (45 deg per '
            'frame -> ~1.7 m of track per loop: at 12 fps move the engine ~2.6 m/s = ~166 px/s along the rails to '
            'match), rods, crosshead, chimney puffs drifting back. smokePoint = chimney top for extra game smoke.')


@car('train_engine', anims={'idle': {'frames': 4, 'fps': 6, 'repeat': -1},
                            'move': {'frames': 8, 'fps': 12, 'repeat': -1}},
     length=2.6, coupler={'front': -1.38, 'back': 1.22}, notes=ENG_NOTE)
def b_engine():
    grp = bpy.data.objects.new('train', None)
    bpy.context.scene.collection.objects.link(grp)
    red, gold, dark = '#D9483B', '#F2C14E', '#2B2F3A'
    with L.Collect() as c:
        # chassis + running boards + buffer beam
        box('frame', (0.84, 2.2, 0.18), (0, 0.05, 0.4), mat=flat(dark, 0.5), bevel=0.03)
        for s in (-1, 1):
            box('board', (0.2, 2.15, 0.05), (s * 0.58, 0.05, 0.6), mat=flat(dark, 0.5), bevel=0.015)
            box('valance', (0.03, 2.1, 0.05), (s * 0.68, 0.05, 0.6), mat=flat(gold, 0.3, 0.7), bevel=0.01)
        box('beam', (1.2, 0.14, 0.24), (0, -1.08, 0.38), mat=flat(red, 0.45), bevel=0.03)
        buffers('buf', -1.2, 0.52)
        # snow plough: two slanted yellow plates meeting at the nose + snow pile
        ym = flat('#F2C14E', 0.45)
        for s in (-1, 1):
            ang = math.degrees(math.atan2(0.42, 0.55))
            box('plough', (0.72, 0.06, 0.34), (s * 0.27, -1.36, RAIL_TOP + 0.02), rot=(-22, 0, s * ang),
                mat=L.stripes('#F2C14E', '#D9483B', 1.5, 'X', rough=0.5, soft=0.02), bevel=0.02, origin='bottom')
        blob('ploughsnow', 0.16, (0.0, -1.62, RAIL_TOP + 0.06), flat('snow_mat', 0.9), scale=(1.6, 0.9, 0.6), seed=3,
             amp=0.25, subdiv=2)
        del ym
        # boiler with gold bands, smokebox front, door, headlamp
        bz = 0.98
        cyl('boiler', 0.38, 1.3, (0, -0.4, bz), rot=(90, 0, 0), mat=flat(red, 0.4), segs=36, origin='center',
            bevel=0.03)
        for y in (-0.82, -0.35, 0.1):
            cyl('bband', 0.39, 0.05, (0, y, bz), rot=(90, 0, 0), mat=flat(gold, 0.3, 0.7), segs=36, origin='center',
                bevel=0.008)
        cyl('smokebox', 0.4, 0.22, (0, -1.0, bz), rot=(90, 0, 0), mat=flat('#3D424C', 0.45), segs=36,
            origin='center', bevel=0.03)
        cyl('sbdoor', 0.3, 0.06, (0, -1.13, bz), rot=(90, 0, 0), mat=flat('#4A515C', 0.4), segs=32, origin='center',
            bevel=0.02)
        cyl('sbhub', 0.06, 0.06, (0, -1.17, bz), rot=(90, 0, 0), mat=flat(gold, 0.3, 0.7), segs=16, origin='center')
        lamp('hlamp', (0, -1.12, bz + 0.47), r=0.09)
        box('lampbox', (0.22, 0.2, 0.16), (0, -1.03, bz + 0.36), mat=flat(dark, 0.5), bevel=0.03)
        # chimney (flared funnel) + dome + bell
        cyl('chim', 0.11, 0.3, (0, -0.72, bz + 0.3), mat=flat(dark, 0.45), segs=20)
        cyl('chimfl', 0.11, 0.26, (0, -0.72, bz + 0.58), mat=flat(dark, 0.45), segs=20, r_top=0.21, bevel=0.02)
        cyl('chimrim', 0.22, 0.05, (0, -0.72, bz + 0.83), mat=flat(gold, 0.3, 0.7), segs=24, bevel=0.015)
        cyl('chimhole', 0.15, 0.02, (0, -0.72, bz + 0.875), mat=flat('#1A1614', 0.9), segs=20, bevel=0.0)
        sphere('dome', 0.17, (0, -0.2, bz + 0.34), flat(gold, 0.3, 0.7), scale=(1, 1, 0.9), segs=20, rings=10)
        cyl('domebase', 0.17, 0.1, (0, -0.2, bz + 0.26), mat=flat(gold, 0.3, 0.7), segs=20)
        cyl('bellpost', 0.03, 0.18, (0, 0.06, bz + 0.36), mat=flat(gold, 0.3, 0.7), segs=8)
        sphere('bell', 0.08, (0, 0.06, bz + 0.52), flat(gold, 0.3, 0.75), scale=(1, 1, 1.1), segs=14, rings=8)
        # cylinders (pistons) low at the front sides
        for s in (-1, 1):
            cyl('pcyl', 0.12, 0.42, (s * 0.58, -0.62, 0.5), rot=(90, 0, 0), mat=flat(red, 0.45), segs=20,
                origin='center', bevel=0.02)
            cyl('pcylcap', 0.125, 0.04, (s * 0.58, -0.84, 0.5), rot=(90, 0, 0), mat=flat(gold, 0.3, 0.7), segs=20,
                origin='center')
        # cab: navy walls with windows, curved roof, lit inside
        cw, cy0, cy1 = 1.16, 0.22, 1.05
        cz0, cz1 = 0.6, 1.86
        navy = flat('#2E3F66', 0.5)
        box('cabfront', (cw, 0.08, cz1 - cz0), (0, cy0, cz0), mat=navy, bevel=0.02)
        box('cabback', (cw, 0.08, 0.6), (0, cy1, cz0), mat=navy, bevel=0.02)
        for s in (-1, 1):
            box('cabside', (0.08, cy1 - cy0, 0.55), (s * cw / 2, (cy0 + cy1) / 2, cz0), mat=navy, bevel=0.02)
            box('cabpost', (0.08, 0.1, cz1 - cz0), (s * cw / 2, cy1 - 0.05, cz0), mat=navy, bevel=0.02)
            box('cabpost2', (0.08, 0.1, cz1 - cz0), (s * cw / 2, cy0 + 0.05, cz0), mat=navy, bevel=0.02)
            box('cabtrim', (0.1, cy1 - cy0 + 0.04, 0.05), (s * cw / 2, (cy0 + cy1) / 2, cz0 + 0.55),
                mat=flat(gold, 0.3, 0.7), bevel=0.01)
            cyl('cabwin', 0.12, 0.06, (s * 0.32, cy0 - 0.01, cz0 + 0.86), rot=(90, 0, 0), mat=flat('#FFE2A0', 0.3),
                segs=20, origin='center')
            cyl('cabwinr', 0.15, 0.05, (s * 0.32, cy0 - 0.02, cz0 + 0.86), rot=(90, 0, 0),
                mat=flat(gold, 0.3, 0.7), segs=20, origin='center')
        box('cabfloor', (cw - 0.08, cy1 - cy0, 0.04), (0, (cy0 + cy1) / 2, cz0), mat=flat('#8A5A33', 0.8), bevel=0.0)
        box('firebox', (0.5, 0.2, 0.42), (0, cy0 + 0.14, cz0), mat=flat(dark, 0.5), bevel=0.03)
        box('fireglow', (0.28, 0.02, 0.14), (0, cy0 + 0.25, cz0 + 0.16), mat=L.emissive('fireg', '#FF8A2A',
                                                                                           '#FF8A2A', 3.0), bevel=0.0)
        roof_curved('cabroof', cw, cy1 - cy0, cz1, rise=0.14, col='#B23A30', over=0.1, seed=4)
        box('roofband', (cw + 0.22, 0.06, 0.06), (0, cy0 - 0.1, cz1 - 0.02), mat=flat(gold, 0.3, 0.7), bevel=0.01)
        # coal bunker behind the cab
        box('bunker', (1.0, 0.24, 0.42), (0, cy1 + 0.12, cz0), mat=flat(dark, 0.5), bevel=0.03)
        for k in range(6):
            blob('coal', 0.07, (-0.3 + 0.12 * k, cy1 + 0.12, cz0 + 0.45), flat('#1A1614', 0.6), seed=40 + k, amp=0.3,
                 subdiv=1, facet=True)
        PA.snow_cap('bunksnow', 0.18, (0.2, cy1 + 0.12, cz0 + 0.5), 0.05, 7, scale=(1.4, 0.6, 1.0))
        coupler('coup', 1.22, 0.42)
        # snow on the boiler top + footboard ends
        L.snow_slab('bsnow', 0.3, 0.9, 0.05, (0, -0.42, bz + 0.37), seed=8, droop=0.01)
        L.point_light('cablight', (0.0, 0.62, 1.3), 'window', 18.0, 0.2)
    parts = BA.top_level(c.objs)
    for o in parts:
        if o.parent is None:
            o.parent = grp
    # driving wheels (crank pins) + small leading wheels
    wheels = bogie_wheels('dw', [0.08, 0.7], 0.27, crank=0.14)
    lead = bogie_wheels('lw', [-0.72], 0.17)
    for w in wheels + lead:
        w.parent = grp
    # side + main rods (rebuilt per frame)
    rods = []
    smoke = L.Smoke('esmoke', (0, -0.72, bz + 0.9), n=3, rise=0.75, drift=(0.0, 0.6), r0=0.1, r1=0.24,
                    color='#EEF1F5', alpha=0.9, seed=5)
    wisp = L.Smoke('ewisp', (0, -0.72, bz + 0.86), n=2, rise=0.45, drift=(0.0, 0.12), r0=0.06, r1=0.13,
                   color='#F4F6F9', alpha=0.75, seed=6)
    for o in smoke.obs + wisp.obs:
        o.parent = grp
    rig = make_driver(grp, (0.1, 0.64, cz0 - 0.3))
    return {'group': grp, 'wheels': [(w, 0.27) for w in wheels] + [(w, 0.17) for w in lead], 'drive': wheels,
            'rods': rods, 'smoke': smoke, 'wisp': wisp, 'rig': rig, 'pose': pose_engine,
            'points': {'smokePoint': (0, -0.72, bz + 0.9), 'lampPoint': (0, -1.2, bz + 0.47),
                       'boardPoint': (-1.0, 0.65, 0.0)},
            'head_ref': Vector((0, 0, 2.0))}


def set_wheels(B, ang):
    # every wheel turns exactly 360 deg per move loop (crank pins + 3 holes stay seamless; 45 deg / frame reads as
    # forward rolling)
    for w, r in B['wheels']:
        w.rotation_euler = Euler((ang, 0, 0), 'XYZ')


def rebuild_rods(B, ang):
    grp = B['group']
    for o in B['rods']:
        bpy.data.objects.remove(o, do_unlink=True)
    B['rods'].clear()
    steel = flat('#B9C2CE', 0.3, 0.75)
    red = flat('#D9483B', 0.45)
    for s in (-1, 1):
        x = s * (GAUGE / 2 + 0.1)
        pins = []
        for y in (0.08, 0.7):
            c = Vector((x, y, RAIL_TOP + 0.27))
            pins.append(c + Vector((0, -math.sin(ang) * 0.14, math.cos(ang) * 0.14)))
        mb = L.MB()
        mb.seg(pins[0], pins[1], 0.03, steel, segs=8)
        # main rod from the crosshead (slides along y at the cylinder axis) to the front pin
        ch = Vector((x, -0.42 - 0.14 * math.sin(ang) * 0.0 + (pins[0].y - 0.08) * 0.9, 0.5))
        mb.seg(ch, pins[0], 0.03, steel, segs=8)
        mb.cube((0.08, 0.12, 0.1), red, loc=tuple(ch))
        mb.seg(Vector((x, -0.62, 0.5)), ch, 0.022, steel, segs=8)
        o = mb.done('rods%d' % (s > 0))
        o.parent = grp
        B['rods'].append(o)


def pose_engine(B, anim, i, n):
    grp = B['group']
    if anim == 'idle':
        grp.location.z = 0.0
        ang = 0.6
        B['smoke'].show(False)
        B['wisp'].set(i, frames=n)
    else:
        t = i / float(n)
        ang = 0.6 + math.tau * t
        grp.location.z = 0.008 * math.sin(2 * math.tau * t)
        B['wisp'].show(False)
        B['smoke'].set(i, frames=n)
    set_wheels(B, ang)
    rebuild_rods(B, ang)
    rig = B['rig']
    if rig is not None:
        import char_anim as CA
        p = CA.pose_for('human', 'idle', i % 4, 4, 'villager_c')
        if anim == 'idle':
            p['head'] = (0, 0, 18)
            p['_show'] = {'face_smile'}
            rig.apply(p, yaw_deg=-20.0)
            bpy.context.view_layer.update()
            wave = Vector((-0.2, -0.1, 0.4 + 0.06 * (i % 2)))
            rig.solve_arm('R', tuple(wave), (-1.0, 0.0, -0.4))
        else:
            p['head'] = (-4, 0, 0)
            p['_show'] = {'face_happy'} if i in (2, 3) else {'face_normal'}
            rig.apply(p, yaw_deg=0.0)
            bpy.context.view_layer.update()
            rig.solve_arm('R', (-0.12, -0.25, 0.08), (-0.8, 0.3, -0.7))
        bpy.context.view_layer.update()


# =========================================================================== coach + wagon

def car_chassis(c_len, body_col='#2B2F3A'):
    box('frame', (0.86, c_len, 0.14), (0, 0, 0.42), mat=flat(body_col, 0.5), bevel=0.03)
    for s in (-1, 1):
        box('step', (0.12, c_len * 0.9, 0.04), (s * 0.6, 0, 0.44), mat=flat(body_col, 0.5), bevel=0.01)
    buffers('bufF', -c_len / 2 - 0.05, 0.5)
    buffers('bufB', c_len / 2 + 0.05, 0.5)
    coupler('cpF', -c_len / 2 - 0.12, 0.42)
    coupler('cpB', c_len / 2 + 0.12, 0.42)


COACH_NOTE = ('Passenger coach (~2.0 m): sky-blue lower body + cream window band with gold lines, three warm lit '
              'windows with little curtains per side, end doors with open platforms + railings, a curved red-brown '
              'roof with snow and a lamp. idle = standing, move = 8-frame wheel loop (same 45 deg/frame as the '
              'engine) with a gentle sway. boardPoint = ground spot beside the car where passengers get on / off.')


@car('train_car_a', anims={'idle': {'frames': 1, 'fps': 2, 'repeat': -1},
                           'move': {'frames': 8, 'fps': 12, 'repeat': -1}},
     length=2.25, coupler={'front': -1.12, 'back': 1.12}, notes=COACH_NOTE)
def b_coach():
    grp = bpy.data.objects.new('train', None)
    bpy.context.scene.collection.objects.link(grp)
    CL = 1.9
    with L.Collect() as c:
        car_chassis(CL)
        bw = 1.12
        z0, zb, z1 = 0.56, 0.98, 1.5
        blue, cream, gold = '#4E8FD6', '#F6EBD2', '#F2C14E'
        bl = 1.5                         # body length (ends are open platforms)
        box('lower', (bw, bl, zb - z0), (0, 0, z0), mat=flat(blue, 0.45), bevel=0.03)
        box('upper', (bw - 0.02, bl - 0.02, z1 - zb), (0, 0, zb), mat=flat(cream, 0.55), bevel=0.03)
        for s in (-1, 1):
            box('gline', (0.03, bl + 0.01, 0.04), (s * (bw / 2 + 0.005), 0, zb - 0.02), mat=flat(gold, 0.3, 0.7),
                bevel=0.0)
            box('gline2', (0.03, bl + 0.01, 0.03), (s * (bw / 2 + 0.005), 0, z0 + 0.12), mat=flat(gold, 0.3, 0.7),
                bevel=0.0)
            for k, y in enumerate((-0.48, 0.0, 0.48)):
                box('win', (0.04, 0.34, 0.3), (s * (bw / 2 + 0.005), y, zb + 0.1), mat=L.emissive('cwin%d%d' % (k, s > 0),
                                                                                              '#FFE2A0', 'window', 1.8),
                    bevel=0.02)
                box('winfr', (0.03, 0.4, 0.36), (s * (bw / 2), y, zb + 0.07), mat=flat('#8A5A33', 0.6), bevel=0.02)
                for cy_ in (y - 0.13, y + 0.13):
                    box('curt', (0.045, 0.07, 0.22), (s * (bw / 2 + 0.008), cy_, zb + 0.17),
                        mat=flat('#E8749A', 0.8), bevel=0.02)
        for e in (-1, 1):
            # end wall with a door + platform with railing
            box('door', (0.42, 0.04, 0.78), (0, e * (bl / 2 + 0.005), z0 + 0.02), mat=flat('#3B6FB0', 0.5), bevel=0.02)
            box('doorwin', (0.24, 0.05, 0.22), (0, e * (bl / 2 + 0.01), z0 + 0.5), mat=flat('#FFE2A0', 0.3),
                bevel=0.01)
            box('plat', (bw - 0.1, 0.22, 0.05), (0, e * (bl / 2 + 0.11), z0 - 0.02), mat=flat('#8A5A33', 0.7),
                bevel=0.01)
            mb = L.MB()
            gm = flat(gold, 0.3, 0.7)
            for s in (-1, 1):
                mb.seg(Vector((s * 0.45, e * (bl / 2 + 0.2), z0)), Vector((s * 0.45, e * (bl / 2 + 0.2), z0 + 0.42)),
                       0.018, gm, segs=6)
                mb.seg(Vector((s * 0.45, e * (bl / 2 + 0.2), z0 + 0.42)), Vector((s * 0.2, e * (bl / 2 + 0.2),
                                                                                   z0 + 0.42)), 0.018, gm, segs=6)
                mb.seg(Vector((s * 0.45, e * (bl / 2 + 0.2), z0 + 0.42)), Vector((s * 0.45, e * bl / 2, z0 + 0.42)),
                       0.018, gm, segs=6)
            mb.done('rail')
        roof_curved('roof', bw, bl + 0.36, z1, rise=0.15, col='#8E2F27', over=0.07, seed=6)
        lamp('rlamp', (0.0, -bl / 2 - 0.02, z1 + 0.06), r=0.05)
        L.point_light('coachlight', (0.0, 0.0, 1.2), 'window', 8.0, 0.3)
    for o in BA.top_level(c.objs):
        o.parent = grp
    wheels = bogie_wheels('cw', [-0.55, 0.55], 0.2)
    for w in wheels:
        w.parent = grp
    return {'group': grp, 'wheels': [(w, 0.2) for w in wheels], 'pose': pose_car,
            'points': {'boardPoint': (-0.95, 0.0, 0.0), 'lampPoint': (0, -0.8, 1.56)},
            'head_ref': Vector((0, 0, 1.6))}


WAGON_NOTE = ('Goods wagon (~2.0 m): open wooden wagon (green sides, stakes, iron corners) with two crates, a sack and '
              'a barrel lashed at the back under a little snow; the front half of the deck is empty: the game draws '
              'the goods the townsfolk bought (item stacks) at cargoPoint[dir] = [dx, dy, behind] like a boat cargo. '
              'idle = standing, move = 8-frame wheel loop + gentle sway.')


@car('train_car_b', anims={'idle': {'frames': 1, 'fps': 2, 'repeat': -1},
                           'move': {'frames': 8, 'fps': 12, 'repeat': -1}},
     length=2.25, coupler={'front': -1.12, 'back': 1.12}, notes=WAGON_NOTE)
def b_wagon():
    grp = bpy.data.objects.new('train', None)
    bpy.context.scene.collection.objects.link(grp)
    CL = 1.9
    with L.Collect() as c:
        car_chassis(CL)
        deck_z = 0.63
        bw, bl = 1.16, 1.86
        box('deck', (bw, bl, 0.07), (0, 0, deck_z - 0.07), mat=L.stripes('#D9AA70', '#C4935A', 8.0, 'X', soft=0.04),
            bevel=0.015)
        green = L.stripes('#3E8E57', '#357A4A', 7.0, 'Z', soft=0.05)
        for s in (-1, 1):
            box('side', (0.06, bl, 0.3), (s * (bw / 2 - 0.03), 0, deck_z), mat=green, bevel=0.02)
            box('end', (bw, 0.06, 0.3), (0, s * (bl / 2 - 0.03), deck_z), mat=green, bevel=0.02)
            for y in (-0.6, 0.0, 0.6):
                box('stake', (0.08, 0.08, 0.42), (s * (bw / 2 + 0.01), y, deck_z - 0.06), mat=flat('#8A5A33', 0.7),
                    bevel=0.015)
        for sx in (-1, 1):
            for sy in (-1, 1):
                box('corner', (0.1, 0.1, 0.34), (sx * (bw / 2 - 0.02), sy * (bl / 2 - 0.02), deck_z - 0.02),
                    mat=flat('#3D424C', 0.4, 0.5), bevel=0.015)
        L.snow_slab('rimsnow', 0.08, bl * 0.8, 0.03, (-(bw / 2 - 0.03), 0, deck_z + 0.3), seed=3)
        # cargo lashed at the back (+Y)
        PA.crate_model('wcr1', 0.42, (-0.24, 0.6, deck_z), snow=True, seed=11)
        PA.crate_model('wcr2', 0.36, (0.26, 0.62, deck_z), rot=(0, 0, 12), snow=False, seed=12)
        PA.crate_model('wcr3', 0.3, (0.24, 0.6, deck_z + 0.36), rot=(0, 0, -8), snow=True, seed=13)
        BA.sack('wsack', (-0.22, 0.12, deck_z), s=0.75, seed=14)
        PA.barrel_model('wbar', loc=(0.28, 0.1, deck_z), scale=0.45, seed=15)
        L.smooth_tube('lash', [(-0.5, 0.36, deck_z + 0.3), (0.0, 0.34, deck_z + 0.5), (0.5, 0.36, deck_z + 0.32)],
                      0.015, flat('#D9C39A', 0.8))
        lamp('wlamp', (0.42, bl / 2 + 0.02, deck_z + 0.1), r=0.045)
    for o in BA.top_level(c.objs):
        o.parent = grp
    wheels = bogie_wheels('ww', [-0.55, 0.55], 0.2)
    for w in wheels:
        w.parent = grp
    return {'group': grp, 'wheels': [(w, 0.2) for w in wheels], 'pose': pose_car,
            'points': {'boardPoint': (-0.95, 0.0, 0.0), 'cargoPoint': (0.0, -0.42, deck_z + 0.02)},
            'head_ref': Vector((0, 0, 1.2))}


def pose_car(B, anim, i, n):
    grp = B['group']
    if anim == 'idle':
        grp.location.z = 0.0
        grp.rotation_euler.y = 0.0
        ang = 0.4
    else:
        t = i / float(n)
        ang = 0.4 + math.tau * t
        grp.location.z = 0.006 * math.sin(2 * math.tau * t)
        grp.rotation_euler.y = math.radians(0.8 * math.sin(math.tau * t))
    set_wheels(B, ang)


# =========================================================================== render driver

def all_meshes(grp):
    out = []

    def walk(o):
        for ch in o.children:
            if ch.type in ('MESH', 'CURVE') and not ch.hide_render:
                out.append(ch)
            walk(ch)
    walk(grp)
    return out


def measure(B, spec):
    xs, ys = [], []
    for d in DIRS:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        for anim, a in spec['anims'].items():
            for i in range(a['frames']):
                B['pose'](B, anim, i, a['frames'])
                bpy.context.view_layer.update()
                for p in L.world_points([o for o in all_meshes(B['group']) if o.visible_camera]):
                    x, y = L.screen_xy(p)
                    xs.append(x)
                    ys.append(y)
    return min(xs), max(xs), min(ys), max(ys)


def to_px(p):
    x, y = bc.world_to_pixel(tuple(p), 0, 0, (0.0, 0.0))
    return [int(round(x)), int(round(y))]


def setup_scene(W, H, anchor, samples):
    sc = bc.setup_render(W, H, samples=samples, denoise=True)
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(W, H, anchor)
    return sc


def render_car(key, opts):
    spec = TRAIN[key]
    t0 = time.time()
    out = os.path.join(opts['cache'], key)
    os.makedirs(out, exist_ok=True)
    dirs = DIRS if not opts.get('dirs') else [d for d in opts['dirs'].split(',') if d in DIRS]
    anims = list(spec['anims']) if not opts.get('anims') else [a for a in opts['anims'].split(',')
                                                               if a in spec['anims']]
    todo = []
    for anim in anims:
        for d in dirs:
            for i in range(spec['anims'][anim]['frames']):
                path = os.path.join(out, '%s_%s_%d.png' % (anim, d, i))
                if opts.get('force') or not os.path.exists(path):
                    todo.append((anim, d, i, path))
    shadow_todo = [d for d in ALL8 if opts.get('force') or not os.path.exists(os.path.join(out, 'shadow_%s.png' % d))]
    if opts.get('dirs') or opts.get('anims'):
        shadow_todo = []
    meta_path = os.path.join(out, 'meta.json')
    if not todo and not shadow_todo and os.path.exists(meta_path):
        print('[%s] cached' % key)
        return
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    B = spec['fn']()
    bpy.context.view_layer.update()
    x0, x1, y0, y1 = measure(B, spec)
    ax = int(math.ceil(-x0)) + MARGIN
    ay = int(math.ceil(-y0)) + MARGIN
    W = (ax + int(math.ceil(x1)) + MARGIN + 3) // 4 * 4
    H = (ay + int(math.ceil(y1)) + MARGIN + 3) // 4 * 4
    anchor = (ax, ay)
    print('[%s] frame %dx%d anchor %s, %d frames + %d shadows to render' % (key, W, H, anchor, len(todo),
                                                                             len(shadow_todo)), flush=True)
    sc = setup_scene(W, H, anchor, opts.get('samples') or spec['samples'])
    for k, (anim, d, i, path) in enumerate(todo):
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, anim, i, spec['anims'][anim]['frames'])
        if B.get('rig') is not None:
            B['rig'].update_strings()
        bpy.context.view_layer.update()
        tmp = path[:-4] + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 8 == 0:
            print('[%s] %d/%d %s_%s_%d  %.0fs' % (key, k + 1, len(todo), anim, d, i, time.time() - t0), flush=True)
    # points per dir (rest pose = first anim, frame 0)
    first = list(spec['anims'])[0]
    pts = {name: {} for name in B['points']}
    head = {}
    for d in DIRS:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        B['pose'](B, first, 0, spec['anims'][first]['frames'])
        bpy.context.view_layer.update()
        mw = B['group'].matrix_world
        for name, p in B['points'].items():
            v = to_px(mw @ Vector(p))
            if name == 'cargoPoint':
                v = v + [False]
            pts[name][d] = v
        head[d] = to_px(mw @ B['head_ref'])[1]
    # shadow frames (8 headings): car invisible to the camera but casting, on a shadow catcher
    sh_info = None
    meshes = all_meshes(B['group'])
    B['pose'](B, 'move' if 'move' in spec['anims'] else first, 0, spec['anims'].get('move', spec['anims'][first])['frames'])
    if 'smoke' in B:
        B['smoke'].show(False)
    if 'wisp' in B:
        B['wisp'].show(False)
    bpy.context.view_layer.update()
    sx0 = sy0 = 1e9
    sx1 = sy1 = -1e9
    for d in ALL8:
        B['group'].rotation_euler.z = bc.yaw_for_dir(d)
        bpy.context.view_layer.update()
        w, h, (a_x, a_y), _ = L.frame_fit(margin=6, shadow=True, objs=[o for o in all_meshes(B['group'])
                                                                       if o.visible_shadow and not o.hide_render])
        sx0, sy0 = min(sx0, -a_x), min(sy0, -a_y)
        sx1, sy1 = max(sx1, w - a_x), max(sy1, h - a_y)
    sax, say = int(-sx0), int(-sy0)
    SW = (sax + int(sx1) + 3) // 4 * 4
    SH = (say + int(sy1) + 3) // 4 * 4
    sh_info = {'frameSize': [SW, SH], 'anchorPx': [sax, say], 'anchor': [round(sax / SW, 5), round(say / SH, 5)],
               'frames': {d: 'shadow_%s' % d for d in ALL8}}
    if shadow_todo:
        for o in meshes:
            o.visible_camera = False
        for o in bpy.context.scene.objects:
            if o.type == 'LIGHT' and o.data.type == 'POINT':
                o.hide_render = True
        bc.add_shadow_catcher(size=12.0)
        sc = setup_scene(SW, SH, (sax, say), 16)
        for d in shadow_todo:
            B['group'].rotation_euler.z = bc.yaw_for_dir(d)
            bpy.context.view_layer.update()
            path = os.path.join(out, 'shadow_%s.png' % d)
            tmp = path[:-4] + '.tmp.png'
            bc.render_to(tmp)
            os.replace(tmp, path)
    meta = {'key': key, 'kind': 'train', 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'anims': spec['anims'],
            'notes': spec['notes'], 'lengthM': spec['length'], 'couplerM': spec['coupler'], 'headTop': min(head.values()),
            'shadowFrames': sh_info}
    meta.update(pts)
    complete = all(os.path.exists(os.path.join(out, '%s_%s_%d.png' % (a, d, i)))
                   for a, info in spec['anims'].items() for d in DIRS for i in range(info['frames'])) and \
        all(os.path.exists(os.path.join(out, 'shadow_%s.png' % d)) for d in ALL8)
    meta['complete'] = complete
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs (complete=%s)' % (key, time.time() - t0, complete), flush=True)
