"""
veh_bld.py - vehicle buildings (docs/CONTRACT_V5.md section M): depots, stops, parking lots, a house garage, a fuel
depot, a traffic light and a set of blank road signs.  Prop conventions: baked soft shadow, anchor = footprint
centre, front = local -Y (screen down-left), the +X side (screen down-right) is the other face the camera sees.

Registry VBLD uses exactly the spec format of bld_assets.BLD, so everything is rendered by the UNCHANGED
bld_render.render_build() (same camera / light / PPU / shadow catcher / markers / multi-state frames).
Markers (bld_assets.mark) -> manifest fields (veh_pack):
    stall -> stallPoints/stallDirs   (where a parked vehicle's ANCHOR goes + its heading)
    bay   -> bayPoints/bayDirs       (depot bays: vehicle anchor in front of a bay door + heading)
    stop  -> stopPoint/stopDir       (where the bus / sleigh bus anchor halts at a stop)
    wait  -> waitPoints/Dirs   seat -> seatPoints/Dirs   board -> boardPoints   door -> doorPoint
    staff -> staffPoints/Dirs  pump -> pumpPoints (fuel nozzles)
Not run directly - see veh_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import C, flat, snowy, tonal, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import life_assets as LA
import bld_assets as BA
import town_lib as T
from bld_assets import mark

VBLD = OrderedDict()


def vb(key, kind, atlas, fp=None, yaw=0.0, shadow=True, samples=40, notes='', front='-Y', catcher=20.0, work=0,
       fps=8, sprites=None, extra=None, ko=None, en=None, era=None):
    def deco(fn):
        ex = dict(extra or {})
        if ko or en:
            ex['name'] = {'ko': ko or key, 'en': en or key}
        if era:
            ex['era'] = era
        VBLD[key] = dict(key=key, fn=fn, kind=kind, atlas=atlas, fp=fp, yaw=yaw, shadow=shadow, samples=samples,
                         notes=notes, front=front, catcher=catcher, work=work, fps=fps, item=None, sprites=sprites,
                         extra=ex)
        return fn
    return deco


def paint(col, rough=0.4):
    import veh_lib as VL
    return VL.paint(col, rough)


def asphalt(c1='#5B6270', c2='#646B79'):
    return tonal(c1, 0.05, 6.0, rough=0.92)


def horseshoe(s=1.0, col='#F2C14E'):
    """Gold horseshoe emblem in the sign frame (XZ plane, bulging toward -Y), opening down."""
    outer = [(0.27 * s * math.cos(math.radians(a)), 0.27 * s * math.sin(math.radians(a)))
             for a in [-55 + 290 * k / 28 for k in range(29)]]
    inner = [(0.15 * s * math.cos(math.radians(a)), 0.15 * s * math.sin(math.radians(a)))
             for a in [235 - 290 * k / 28 for k in range(29)]]
    objs = [T.ext_xz('hshoe', outer + inner, 0.07 * s, flat(col, 0.3, 0.7), bevel=0.02 * s)]
    for k in range(6):
        a = math.radians(-30 + 240 * k / 5)
        objs.append(sphere('hnail', 0.025 * s, (0.21 * s * math.cos(a), -0.075 * s, 0.21 * s * math.sin(a)),
                           flat('#8A6A2E', 0.4, 0.6), segs=8, rings=4))
    return objs


# =========================================================================== stops

def stop_shelter(roof_col, frame_col, back_col, w=2.0, glass=False):
    fm = flat(frame_col, 0.5, 0.4)
    for x in (-w / 2 + 0.06, w / 2 - 0.06):
        for y in (0.1, 0.62):
            cyl('sh_post', 0.045, 2.0, (x, y, 0), mat=fm, segs=10)
    if glass:
        box('sh_back', (w - 0.1, 0.05, 1.45), (0, 0.64, 0.35), mat=flat(back_col, 0.15), bevel=0.02)
        for x in (-w / 2 + 0.06, w / 2 - 0.06):
            box('sh_side', (0.05, 0.5, 1.2), (x, 0.36, 0.55), mat=flat(back_col, 0.15), bevel=0.02)
        box('sh_sheen', (0.06, 0.02, 1.0), (-0.4, 0.61, 0.5), rot=(0, -25, 0), mat=flat('#F4F8FC', 0.1), bevel=0.0)
        box('sh_roof', (w + 0.3, 1.05, 0.1), (0, 0.32, 2.0), mat=paint(roof_col), bevel=0.04)
        L.snow_slab('sh_snow', w + 0.1, 0.85, 0.1, (0, 0.32, 2.08), seed=20)
    else:
        box('sh_back', (w - 0.1, 0.06, 1.0), (0, 0.65, 0.45), mat=L.stripes(back_col, hexmix(back_col, '#000000', 0.12),
                                                                          6.0, 'Z', soft=0.04), bevel=0.02)
        LA.roof('sh_roof', w + 0.35, -0.2, 1.92, 0.9, 2.12, 0.07, L.stripes(roof_col, hexmix(roof_col, '#000000', 0.12),
                                                                            5.0, 'Y'), snow_frac=0.9, seed=21)
    T.town_bench('sh_bench', (0, 0.38, 0), rot_z=0.0, col='#C98F55')
    mark('seat', (-0.45, 0.2, 0.0), facing=(0, -1, 0))
    mark('seat', (0.35, 0.2, 0.0), facing=(0, -1, 0))


BUS_STOP_NOTE = ('Retro bus stop: a glass shelter with a mint roof under snow, a bench, a round stop sign on a pole '
                 'with a BLANK face (fxPoints.board = where the game writes the stop name / number) and a blank '
                 'timetable board; a litter bin. The road runs along the shelter front (%s); the shelter stands on '
                 'the FAR side of the road (screen-up), so a stopped bus never hides it. waitPoints = queue toward '
                 'the sign, seatPoints = bench, stopPoint/stopDir = where the BUS ANCHOR halts (heading %s = right-hand '
                 'traffic, its door side faces the shelter), boardPoints = curb spot; passengers then walk to the '
                 'bus doorPoints[1] (far side, hidden behind the bus) and get in.')


def bus_stop_builder():
    stop_shelter('#5FC09E', '#3B4150', '#BFDDEE', glass=True)
    # stop sign: pole + round blank board (white with a mint rim) + a small bus pictogram plate under it
    cyl('bs_pole', 0.05, 2.45, (1.35, -0.25, 0), mat=paint('#3B4150'), segs=12)
    cyl('bs_foot', 0.14, 0.1, (1.35, -0.25, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=14, r_top=0.1)
    disc = T.sign_disc('bs_disc', (1.35, -0.25, 2.55), r=0.36, bg='#F6F3EC', rim='#5FC09E', psi=45.0, tilt=6.0,
                       snow=True)
    del disc
    box('bs_plate', (0.46, 0.05, 0.24), (1.35, -0.25, 2.0), rot=(0, 0, 45), mat=paint('#5FC09E'), bevel=0.02)
    # timetable board on the back wall (blank)
    box('bs_tt', (0.5, 0.04, 0.62), (-0.55, 0.6, 0.85), mat=flat('#F4F1EA', 0.6), bevel=0.02)
    box('bs_ttf', (0.56, 0.03, 0.68), (-0.55, 0.62, 0.82), mat=paint('#3B4150'), bevel=0.02)
    # bin
    cyl('bs_bin', 0.16, 0.6, (-1.25, -0.1, 0), mat=paint('#3E8E57'), segs=18, bevel=0.03)
    cyl('bs_binlid', 0.17, 0.05, (-1.25, -0.1, 0.6), mat=paint('#2B2F3A'), segs=18, bevel=0.02)
    LA.snow_drift('bs_drift', 0.22, (-1.0, 0.85, 0.0), seed=22)
    for k in range(3):
        mark('wait', (0.95 - 0.5 * k, -0.6, 0.0), facing=(1, -0.3, 0))
    mark('stop', (0.6, -2.3, 0.0), facing=(-1, 0, 0))
    mark('board', (0.05, -0.95, 0.0), facing=(0, -1, 0))
    return {'fx': {'board': (1.35, -0.25 - 0.06, 2.55), 'timetable': (-0.55, 0.57, 1.16)}}


@vb('bus_stop', 'decor', 'veh_street', fp=(3.0, 1.6), catcher=14.0, notes=BUS_STOP_NOTE % ('world X', 'NW'),
    ko='버스 정류장', en='Bus stop', era=3)
def b_bus_stop():
    return bus_stop_builder()


@vb('bus_stop_y', 'decor', 'veh_street', fp=(3.0, 1.6), yaw=90.0, catcher=14.0,
    notes=BUS_STOP_NOTE % ('world Y, the shelter faces screen down-right', 'SW'), ko='버스 정류장', en='Bus stop',
    era=3)
def b_bus_stop_y():
    return bus_stop_builder()


SLEIGH_STOP_NOTE = ('Sleigh-bus stop (era 2): a small log shelter with a red snowy roof and a bench, a hitching rail, '
                    'a lantern post and a round sign with a gold horseshoe; a blank timetable board. Road along %s. '
                    'waitPoints, seatPoints, stopPoint/stopDir (where the HORSE SLEIGH BUS anchor halts, heading %s), '
                    'boardPoints (coach door).')


def sleigh_stop_builder():
    wood = flat('#8A5A33', 0.7)
    for x in (-0.85, 0.85):
        for y in (0.1, 0.6):
            cyl('ss_post', 0.06, 1.8, (x, y, 0), mat=wood, segs=10)
    box('ss_back', (1.8, 0.08, 0.95), (0, 0.64, 0.45), mat=L.stripes('#B5763F', '#9A6236', 5.0, 'Z', soft=0.05),
        bevel=0.03)
    LA.roof('ss_roof', 2.15, -0.25, 1.78, 0.95, 2.05, 0.08, L.stripes('#B23A30', '#962F27', 5.0, 'Y'), snow_frac=0.9,
            seed=31)
    T.town_bench('ss_bench', (0, 0.38, 0), rot_z=0.0, col='#C98F55')
    box('ss_tt', (0.42, 0.04, 0.5), (0.45, 0.59, 0.95), mat=flat('#F4F1EA', 0.6), bevel=0.02)
    # hitching rail
    for x in (-1.25, -0.45):
        cyl('ss_hpost', 0.05, 0.85, (x, -0.75, 0), mat=wood, segs=10)
    L.log('ss_hrail', 0.05, 0.95, (-0.85, -0.75, 0.8), rot=(0, 90, 0), bark=flat('#8A5A33', 0.7),
          end=flat('#C99A5E', 0.7), segs=10)
    # sign post with a horseshoe disc + a lantern post
    T.post_sign('ss_sign', (1.3, -0.3, 0.0), h=2.25, r=0.32, bg='#2E6B4F', rim='#F2C14E', emblem=horseshoe, es=0.9)
    cyl('ss_lpost', 0.045, 1.7, (-1.35, 0.1, 0), mat=flat('#3D424C', 0.45, 0.5), segs=10)
    PA.lantern('ss_lan', (-1.35, 0.1, 1.8), 0.13, 3.0)
    PA.crate_model('ss_crate', 0.34, (1.05, 0.55, 0.0), rot=(0, 0, 12), snow=True, seed=33)
    LA.snow_drift('ss_d', 0.2, (-1.2, 0.8, 0.0), seed=34)
    mark('seat', (-0.45, 0.2, 0.0), facing=(0, -1, 0))
    mark('seat', (0.35, 0.2, 0.0), facing=(0, -1, 0))
    for k in range(3):
        mark('wait', (0.9 - 0.5 * k, -0.45, 0.0), facing=(1, -0.3, 0))
    mark('stop', (0.4, -2.2, 0.0), facing=(-1, 0, 0))
    mark('board', (-0.2, -1.1, 0.0), facing=(0, -1, 0))
    return {'fx': {'lantern': (-1.35, 0.1, 1.8), 'sign': (1.3, -0.3, 2.25)}}


@vb('sleigh_stop', 'decor', 'veh_street', fp=(3.0, 1.6), catcher=14.0, notes=SLEIGH_STOP_NOTE % ('world X', 'NW'),
    ko='썰매 정류장', en='Sleigh stop', era=2)
def b_sleigh_stop():
    return sleigh_stop_builder()


@vb('sleigh_stop_y', 'decor', 'veh_street', fp=(3.0, 1.6), yaw=90.0, catcher=14.0,
    notes=SLEIGH_STOP_NOTE % ('world Y, the shelter faces screen down-right', 'SW'), ko='썰매 정류장',
    en='Sleigh stop', era=2)
def b_sleigh_stop_y():
    return sleigh_stop_builder()


# =========================================================================== stable depot (era 2)

STABLE_NOTE = ('Stable depot (era 2, 5 x 4 m): a red barn with white trim and a snowy gable roof with a horse weather '
               'vane, two stable half-doors on the front with a friendly horse looking out of one, a hay loft door, '
               'and a wide carriage door on the right side (+X, screen down-right) where the sleigh bus / cargo '
               'sleigh parks. bayPoints/bayDirs = vehicle anchor in front of the carriage door (parked, heading out '
               'SE); staffPoints = stable keeper; fxPoints.vane / lamp.')


@vb('stable_depot', 'building', 'veh_depots', fp=(5.0, 4.0), catcher=26.0, notes=STABLE_NOTE, ko='마구간 차고지',
    en='Stable depot', era=2)
def b_stable_depot():
    import veh_lib as VL
    W, D, H = 5.0, 4.0, 2.4
    red = '#B8392F'
    wall = L.stripes(red, '#A33228', 7.0, 'Z', rough=0.8, soft=0.04)
    T.plinth('st_pl', W, D, h=0.22, col='#8E96A3')
    box('st_walls', (W, D, H), (0, 0, 0.2), mat=wall, bevel=0.05)
    T.corner_trims('st_tr', W, D, 0.2, H, '#F4F1EA', t=0.14)
    T.gable('st_roof', W, D, 0.2 + H, 0.2 + H + 1.5, 0.35, '#5E6672', '#B8392F', seed=40, along='x')
    # front (-Y): two stall half-doors + hay loft door in the gable
    for k, x in enumerate((-1.3, 0.1)):
        box('st_door', (1.0, 0.1, 1.6), (x, -D / 2 - 0.02, 0.22), mat=L.stripes('#F4F1EA', '#E5DFD2', 6.0, 'X',
                                                                              soft=0.04), bevel=0.03)
        box('st_dark', (0.84, 0.06, 0.62), (x, -D / 2 - 0.05, 1.12), mat=flat('#2A2220', 0.9), bevel=0.02)
        box('st_lower', (0.9, 0.1, 0.88), (x, -D / 2 - 0.08, 0.22), mat=L.stripes(red, '#A33228', 5.0, 'X', soft=0.04),
            bevel=0.03)
        for s in (-1, 1):
            box('st_x', (0.06, 0.06, 1.15), (x, -D / 2 - 0.14, 0.24), rot=(0, s * 38, 0), mat=flat('#F4F1EA', 0.7),
                bevel=0.01)
    box('st_loft', (0.9, 0.1, 0.8), (0, -D / 2 - 0.03, 2.75), mat=L.stripes('#F4F1EA', '#E5DFD2', 6.0, 'X', soft=0.04),
        bevel=0.03)
    box('st_hay', (0.7, 0.05, 0.25), (0, -D / 2 - 0.07, 2.78), mat=flat('#E2B85A', 0.9), bevel=0.02)
    # a horse looking out of the first stall
    with L.Collect() as hc:
        h = VL.build_horse('stH', coat='#C27A42', mane='#F3E6CC', muzzle='#F1DCC0', blaze=True, scale=1.0)
    h.apply({'neck': (6, 0, 0), 'head': (8, 0, -12)}, yaw_deg=0.0)
    h.j['root'].location = (-1.3, -D / 2 + 0.95, 0.12)
    del hc
    # right side (+X): the carriage door (open, dark inside) + lamp
    box('st_cdoor_dark', (0.08, 2.3, 2.0), (W / 2 + 0.01, 0.1, 0.22), mat=flat('#2A2220', 0.9), bevel=0.02)
    for s in (-1, 1):
        box('st_cdoor', (0.08, 0.2, 2.2), (W / 2 + 0.05, 0.1 + s * 1.25, 0.22), mat=flat('#F4F1EA', 0.7), bevel=0.02)
    box('st_clintel', (0.12, 2.75, 0.18), (W / 2 + 0.05, 0.1, 2.36), mat=flat('#F4F1EA', 0.7), bevel=0.02)
    for s in (-1, 1):       # swung-open leaves
        box('st_leaf', (1.15, 0.08, 2.0), (W / 2 + 0.6, 0.1 + s * 1.42, 0.22), mat=L.stripes(red, '#A33228', 5.0, 'X',
                                                                                             soft=0.04), bevel=0.03)
    T.lamp_wall('st_lamp', (W / 2 + 0.06, 1.45, 2.3), face='x+')
    # weather vane (horse) on the ridge
    cyl('st_vanep', 0.025, 0.8, (0.6, 0, 0.2 + H + 1.5), mat=flat('#3D424C', 0.45, 0.6), segs=8)
    vm = flat('#2B2F3A', 0.45, 0.6)
    T.ext_xz('st_vane', [(-0.22, 0.0), (0.18, 0.0), (0.26, 0.12), (0.16, 0.2), (0.1, 0.1), (-0.12, 0.1),
                         (-0.24, 0.16), (-0.2, 0.04)], 0.03, vm).location = (0.6, 0.0, 0.2 + H + 2.2)
    # hay bales, trough, snow
    for k, (x, y) in enumerate(((1.7, -2.45), (2.15, -2.3))):
        box('st_bale', (0.6, 0.42, 0.36), (x, y, 0.0), rot=(0, 0, 10 * k), mat=flat('#E2B85A', 0.9), bevel=0.05)
    box('st_trough', (1.1, 0.4, 0.36), (-2.0, -2.45, 0.0), mat=flat('#8A5A33', 0.7), bevel=0.04)
    box('st_water', (0.95, 0.3, 0.02), (-2.0, -2.45, 0.33), mat=flat('#9CC7E6', 0.15), bevel=0.0)
    LA.snow_drift('st_d', 0.3, (-2.5, 1.9, 0.0), seed=41)
    mark('bay', (W / 2 + 3.9, 0.1, 0.0), facing=(1, 0, 0))
    mark('staff', (-0.6, -D / 2 - 0.55, 0.0), facing=(0, -1, 0))
    mark('door', (-1.3, -D / 2 - 0.5, 0.0), facing=(0, 1, 0))
    return {'fx': {'vane': (0.6, 0, 0.2 + H + 2.3), 'lamp': (W / 2 + 0.3, 1.45, 2.2)}}


# =========================================================================== bus depot (era 3, two bays)

DEPOT_NOTE = ('Bus depot (era 3, 6.8 x 5.2 m): a brick garage with a cream barrel roof under snow, two big arched bay '
              'doors on the front (screen down-left) - frame bus_depot = doors closed (mint), bus_depot_open = doors '
              'open (lit interior) - a BLANK name board over the bays (fxPoints.board), a clock, lamps. bayPoints / '
              'bayDirs = where a bus ANCHOR stands in front of each bay (parked nose-out, heading SW; a bus drives '
              'in heading NE and the game can hide it inside while bus_depot_open shows).')


@vb('bus_depot', 'building', 'veh_depots', fp=(6.8, 5.2), catcher=30.0, notes=DEPOT_NOTE, ko='버스 차고지',
    en='Bus depot', era=3,
    sprites={'bus_depot': {'frame': 'bus_depot', 'stage': 0}, 'bus_depot_open': {'frame': 'bus_depot_open',
                                                                                   'stage': 1}})
def b_bus_depot():
    W, D, H = 6.8, 5.2, 3.1
    brick = L.brick('#B4593F', '#94442F', '#D9CFC2', scale=2.4, row_h=0.22)
    T.plinth('bd_pl', W, D, h=0.22, col='#8E96A3')
    box('bd_walls', (W, D, H), (0, 0, 0.2), mat=brick, bevel=0.05)
    T.corner_trims('bd_tr', W, D, 0.2, H, '#EADBB8', t=0.2)
    T.band('bd_band', W, D, 0.2 + H - 0.05, '#EADBB8', h=0.18, out=0.06)
    # barrel roof along Y (gable ends face front / back)
    import town_train as TT
    with L.Collect() as rc:
        TT.roof_curved('bd_roof', W + 0.1, D, 0.2 + H + 0.1, rise=0.9, col='#EADBB8', over=0.18, seed=50)
    L.group(BA.top_level(rc.objs), 'bd_roofg', loc=(0, 0, 0))
    box('bd_gablefill', (W - 0.1, 0.12, 0.9), (0, -D / 2 + 0.04, 0.2 + H), mat=brick, bevel=0.02, taper=(0.55, 1.0))
    # bays: arched door frames; closed = mint roller doors, open = lit interior
    doors_closed, doors_open = [], []
    for k, x in enumerate((-1.65, 1.65)):
        T.ext_xz('bd_arch', PA.arch_pts(2.9, 2.95, 14), 0.12, flat('#EADBB8', 0.7), y=-D / 2 - 0.02).location.x = x
        with L.Collect() as cc:
            o = T.ext_xz('bd_door', PA.arch_pts(2.6, 2.7, 14), 0.08, L.stripes('#5FC09E', '#55B08F', 14.0, 'Z',
                                                                              soft=0.06), y=-D / 2 - 0.05)
            o.location.x = x
            box('bd_win', (2.0, 0.04, 0.26), (x, -D / 2 - 0.1, 1.9), mat=T.glow_mat('bd_dw', 1.4), bevel=0.02)
        doors_closed += cc.objs
        with L.Collect() as oc:
            o = T.ext_xz('bd_in', PA.arch_pts(2.6, 2.7, 14), 0.06, flat('#5A4A40', 0.9), y=-D / 2 + 0.2)
            o.location.x = x
            box('bd_infl', (2.5, 0.25, 0.04), (x, -D / 2 + 0.05, 0.22), mat=flat('#8A7A6E', 0.9), bevel=0.0)
            box('bd_inglow', (1.8, 0.04, 0.5), (x, -D / 2 + 0.15, 2.0), mat=T.glow_mat('bd_ig', 1.2), bevel=0.02)
            PA.barrel_model('bd_brl', loc=(x + 0.9, -D / 2 + 0.05, 0.22), scale=0.4, seed=51 + k)
        doors_open += oc.objs
        mark('bay', (x, -D / 2 - 4.0, 0.0), facing=(0, -1, 0))
    # name board + clock + lamps
    box('bd_board', (3.4, 0.1, 0.5), (0, -D / 2 - 0.06, 0.2 + H + 0.25), mat=flat('#2E4F8A', 0.5), bevel=0.03)
    box('bd_boardf', (3.2, 0.05, 0.36), (0, -D / 2 - 0.1, 0.2 + H + 0.32), mat=flat('#F6F3EC', 0.6), bevel=0.02)
    with L.Collect() as kc:
        T.em_clock(0.7)
    L.group(BA.top_level(kc.objs), 'bd_clock', loc=(0, -D / 2 - 0.12, 0.2 + H + 1.15))
    for x in (-3.2, 0.0, 3.2):
        T.lamp_wall('bd_lamp%d' % int(x), (x, -D / 2 - 0.02, 3.2), face='y-')
    # right side windows
    T.win_row('bd_w', 'x+', 2.4, [-1.4, 0.0, 1.4], W / 2, w=0.7, h=0.7, frame='#EADBB8')
    LA.snow_drift('bd_d', 0.35, (3.6, 2.2, 0.0), seed=55)
    PA.barrel_model('bd_b2', loc=(3.75, -1.6, 0.0), scale=0.5, seed=56)
    mark('door', (0.0, -D / 2 - 0.6, 0.0), facing=(0, 1, 0))
    mark('staff', (-3.6, -D / 2 - 0.5, 0.0), facing=(1, -1, 0))
    every = BA.descendants(doors_closed + doors_open)
    cl, op = BA.descendants(doors_closed), BA.descendants(doors_open)

    def closed():
        BA.show(every, False)
        BA.show(cl, True)

    def opened():
        BA.show(every, False)
        BA.show(op, True)
    closed()
    return {'frames': [('bus_depot', closed), ('bus_depot_open', opened)],
            'sprites': {'bus_depot': {'frame': 'bus_depot', 'state': 'closed'},
                        'bus_depot_open': {'frame': 'bus_depot_open', 'state': 'open'}},
            'fx': {'board': (0, -D / 2 - 0.13, 0.2 + H + 0.5), 'clock': (0, -D / 2 - 0.12, 0.2 + H + 1.15)}}


# =========================================================================== parking lots (ground pieces)

STALL_W, STALL_D = 2.7, 5.2
LOT_NOTE = ('Parking lot %s (%d stalls, %.1f x %.1f m): a GROUND piece (draw on the ground layer under vehicles and '
            'people) - asphalt with a light snow dusting, white stall lines, concrete wheel stops, a blue P sign and '
            'plowed snow along the back edge(s). stallPoints = the ANCHOR of a parked car (stall centre), stallDirs '
            '= the parked heading (nose toward the wheel stop). Cars drive in along the open side.')


def lot_builder(rows):
    """rows: list of (y_centre, heading_sign) - heading +1 = nose toward +Y (NE)."""
    n = 4
    Wl = n * STALL_W + 0.4
    Dl = len(rows) * STALL_D + 0.4
    box('pl_slab', (Wl, Dl, 0.03), (0, 0, 0.0), mat=snowy('#5E6573', lo=0.8, hi=0.95, noise_amt=0.5,
                                                          noise_scale=1.4), bevel=0.02)
    line = flat('#F4F1EA', 0.6)
    for yc, hs in rows:
        y_back = yc + hs * STALL_D / 2
        box('pl_back', (n * STALL_W, 0.1, 0.01), (0, y_back - hs * 0.05, 0.03), mat=line, bevel=0.0)
        for k in range(n + 1):
            x = -n * STALL_W / 2 + k * STALL_W
            box('pl_line', (0.1, STALL_D - 0.3, 0.01), (x, yc + hs * 0.15, 0.03), mat=line, bevel=0.0)
        for k in range(n):
            x = -n * STALL_W / 2 + (k + 0.5) * STALL_W
            box('pl_stop', (1.3, 0.22, 0.12), (x, y_back - hs * 0.5, 0.03), mat=snowy('#B9B4AA', lo=0.6, hi=0.8),
                bevel=0.04)
            mark('stall', (x, yc - hs * 0.15, 0.0), facing=(0, hs, 0))
    # plowed snow along the back edge(s) (screen-top edges only, so it never covers a car)
    yb = max(yc + hs * STALL_D / 2 for yc, hs in rows)
    for k in range(5):
        LA.snow_drift('pl_snow%d' % k, 0.32 + 0.06 * (k % 2), (-Wl / 2 + 1.0 + k * (Wl - 2.0) / 4, yb + 0.25, 0.0),
                      seed=60 + k)
    # P sign at the back-right corner
    cyl('pl_pole', 0.05, 2.1, (Wl / 2 - 0.2, yb + 0.1, 0.0), mat=paint('#3B4150'), segs=12)
    box('pl_sign', (0.62, 0.06, 0.62), (Wl / 2 - 0.2, yb + 0.05, 1.8), rot=(0, 0, 45), mat=paint('#3D7CC9'),
        bevel=0.06)
    with L.Collect() as pc:
        pts = [(-0.12, -0.22), (-0.04, -0.22), (-0.04, -0.04), (0.06, -0.04), (0.14, 0.04), (0.14, 0.14),
               (0.06, 0.22), (-0.12, 0.22)]
        T.ext_xz('pl_P', pts, 0.03, flat('#FFFFFF', 0.4), bevel=0.01)
        T.ext_xz('pl_Ph', [(-0.04, 0.04), (0.05, 0.04), (0.07, 0.08), (0.07, 0.11), (0.05, 0.14), (-0.04, 0.14)],
                 0.04, paint('#3D7CC9'), y=-0.01, bevel=0.005)
    L.group(BA.top_level(pc.objs), 'pl_Pg', loc=(Wl / 2 - 0.2 - 0.03, yb + 0.05 - 0.03, 2.11), rot=(0, 0, 45))
    return {'extra': {'stallSizeM': [STALL_W, STALL_D], 'layer': 'ground'}}


@vb('parking_lot_s', 'decal', 'veh_lots', fp=(4 * STALL_W + 0.4, STALL_D + 0.4), catcher=18.0, samples=32,
    notes=LOT_NOTE % ('S', 4, 4 * STALL_W + 0.4, STALL_D + 0.4), ko='주차장 (소)', en='Parking lot S', era=3)
def b_parking_lot_s():
    return lot_builder([(0.0, 1)])


@vb('parking_lot_m', 'decal', 'veh_lots', fp=(4 * STALL_W + 0.4, 2 * STALL_D + 0.4), catcher=20.0, samples=32,
    notes=LOT_NOTE % ('M', 8, 4 * STALL_W + 0.4, 2 * STALL_D + 0.4), ko='주차장 (중)', en='Parking lot M', era=3)
def b_parking_lot_m():
    return lot_builder([(-STALL_D / 2, -1), (STALL_D / 2, 1)])


# =========================================================================== house garage

GARAGE_NOTE = ('Small house garage (3.2 x 4.6 m): cream plank walls, a snowy blue gable roof, a panelled up-and-over '
               'door - frame garage_small = door closed, garage_small_open = door up, a lit workshop inside. '
               'stallPoints/stallDirs = the driveway spot in front of the door where the family car parks (nose to '
               'the door, heading NE) - place it next to a house_* at higher house levels.')


@vb('garage_small', 'building', 'veh_depots', fp=(3.2, 4.6), catcher=20.0, notes=GARAGE_NOTE, ko='차고', en='Garage',
    era=3, sprites={'garage_small': {'frame': 'garage_small', 'stage': 0},
                    'garage_small_open': {'frame': 'garage_small_open', 'stage': 1}})
def b_garage_small():
    W, D, H = 3.2, 4.6, 2.3
    T.plinth('gs_pl', W, D, h=0.15, col='#8E96A3')
    BA.plank_wall('gs_walls', (W, D, H), (0, 0, 0.12), cols=('#F2E6C8', '#E6D8B6'))
    T.corner_trims('gs_tr', W, D, 0.12, H, '#F4F1EA', t=0.12)
    T.gable('gs_roof', W, D, 0.12 + H, 0.12 + H + 1.0, 0.25, '#3D7CC9', '#F2E6C8', seed=70, along='y')
    T.win_row('gs_w', 'x+', 1.75, [0.6], W / 2, w=0.6, h=0.55, shutters='#3D7CC9')
    T.lamp_wall('gs_lamp', (1.35, -D / 2 - 0.02, 2.2), face='y-')
    T.ext_xz('gs_frame', [(-1.25, 0.0), (1.25, 0.0), (1.25, 2.05), (-1.25, 2.05)], 0.1, flat('#F4F1EA', 0.7),
             y=-D / 2 - 0.02).location.z = 0.12
    with L.Collect() as cc:
        dm = L.stripes('#3D7CC9', '#3570B4', 6.0, 'Z', soft=0.04)
        box('gs_door', (2.3, 0.08, 1.95), (0, -D / 2 - 0.08, 0.14), mat=dm, bevel=0.03)
        for k in range(3):
            box('gs_dwin', (0.5, 0.04, 0.22), (-0.7 + 0.7 * k, -D / 2 - 0.13, 1.55), mat=T.glow_mat('gs_g', 1.2),
                bevel=0.02)
        box('gs_handle', (0.3, 0.05, 0.05), (0, -D / 2 - 0.14, 0.45), mat=flat('#D9DFE6', 0.25, 0.85), bevel=0.01)
    closed_objs = cc.objs
    with L.Collect() as oc:
        box('gs_dark', (2.3, 0.04, 1.95), (0, -D / 2 + 0.25, 0.14), mat=flat('#4A3E36', 0.9), bevel=0.0)
        box('gs_up', (2.3, 0.5, 0.08), (0, -D / 2 + 0.2, 2.0), mat=L.stripes('#3D7CC9', '#3570B4', 6.0, 'Y',
                                                                           soft=0.04), bevel=0.02)
        box('gs_bench', (1.2, 0.35, 0.75), (0.4, -D / 2 + 0.55, 0.14), mat=flat('#8A5A33', 0.7), bevel=0.03)
        box('gs_glow', (1.6, 0.04, 0.4), (0, -D / 2 + 0.3, 1.5), mat=T.glow_mat('gs_ig', 1.0), bevel=0.02)
        PA.barrel_model('gs_brl', loc=(-0.75, -D / 2 + 0.55, 0.14), scale=0.35, seed=71)
    open_objs = oc.objs
    LA.snow_drift('gs_d', 0.25, (1.7, 2.0, 0.0), seed=72)
    PA.crate_model('gs_cr', 0.38, (1.85, -1.7, 0.0), rot=(0, 0, 8), snow=True, seed=73)
    mark('stall', (0.0, -D / 2 - 2.9, 0.0), facing=(0, 1, 0))
    mark('door', (0.0, -D / 2 - 0.6, 0.0), facing=(0, 1, 0))
    every = BA.descendants(closed_objs + open_objs)
    cl, op = BA.descendants(closed_objs), BA.descendants(open_objs)

    def closed():
        BA.show(every, False)
        BA.show(cl, True)

    def opened():
        BA.show(every, False)
        BA.show(op, True)
    closed()
    return {'frames': [('garage_small', closed), ('garage_small_open', opened)],
            'sprites': {'garage_small': {'frame': 'garage_small', 'state': 'closed'},
                        'garage_small_open': {'frame': 'garage_small_open', 'state': 'open'}}}


# =========================================================================== fuel depot

FUEL_NOTE = ('Retro fuel / coal depot (5.2 x 4 m): a red-and-cream canopy on two posts over two round toy fuel '
             'pumps (red + green, glowing round heads), an attendant kiosk, a big cylindrical fuel tank on legs, a '
             'coal bin with a coal heap and barrels (winter: fuel storehouse). A BLANK round sign on a tall pole '
             '(fxPoints.board). stallPoints/stallDirs = where a car anchor stops to refuel (beside each pump, heading '
             'SE); pumpPoints = pump nozzles; staffPoints = attendant.')


@vb('fuel_depot', 'building', 'veh_depots', fp=(5.2, 4.0), catcher=26.0, notes=FUEL_NOTE, ko='주유소', en='Fuel depot',
    era=3)
def b_fuel_depot():
    D = 4.0
    box('fd_slab', (5.2, 4.0, 0.08), (0, 0, 0), mat=snowy('#9AA0AA', lo=0.82, hi=0.95), bevel=0.03)
    # kiosk at the back-left
    BA.plank_wall('fd_kiosk', (1.5, 1.3, 2.0), (-1.7, 1.15, 0.08), cols=('#F2E6C8', '#E6D8B6'))
    T.gable('fd_kroof', 1.5, 1.3, 2.08, 2.6, 0.15, '#D9483B', '#F2E6C8', seed=80, along='x')
    T.win('fd_kw', (-1.7, 1.15 - 0.65, 1.7), face='y-', w=0.8, h=0.55, frame='#F4F1EA')
    T.door('fd_kd', (-0.95, 1.15, 0.08), face='x+', w=0.6, h=1.4, col='#3D7CC9', step=False)
    # canopy over the pump island
    for y in (-0.9, 0.9):
        cyl('fd_post', 0.08, 2.5, (0.7, y, 0.08), mat=paint('#F4F1EA'), segs=14)
    box('fd_canopy', (2.0, 2.9, 0.3), (0.7, 0.0, 2.55), mat=L.stripes('#D9483B', '#F4F1EA', 6.0, 'Y', soft=0.02),
        bevel=0.06)
    L.snow_slab('fd_csnow', 1.8, 2.7, 0.1, (0.7, 0.0, 2.84), seed=81)
    box('fd_island', (0.9, 2.4, 0.15), (0.7, 0.0, 0.08), mat=snowy('#C9C3B8', lo=0.7, hi=0.9), bevel=0.04)
    for k, (y, col) in enumerate(((-0.55, '#D9483B'), (0.55, '#3E8E57'))):
        box('fd_pump', (0.42, 0.36, 1.05), (0.7, y, 0.23), mat=paint(col), bevel=0.12)
        sphere('fd_head', 0.2, (0.7, y, 1.45), L.emissive('fd_hg%d' % k, '#FFF4D6', '#FFE2A0', 1.6), segs=20, rings=10)
        cyl('fd_ring', 0.21, 0.05, (0.7, y, 1.38), mat=paint(col), segs=20)
        box('fd_dial', (0.04, 0.22, 0.2), (0.7 - 0.22, y, 0.85), mat=flat('#F4F1EA', 0.5), bevel=0.02)
        L.smooth_tube('fd_hose%d' % k, [(0.7 - 0.2, y + 0.1, 0.9), (0.7 - 0.35, y + 0.15, 0.6),
                                         (0.7 - 0.3, y + 0.2, 0.4)], 0.025, flat('#2B2F3A', 0.5))
        mark('pump', (0.7 - 0.3, y + 0.2, 0.4))
        mark('stall', (0.7 - 2.0, y * 2.2, 0.0), facing=(1, 0, 0))
    # fuel tank on legs + coal bin
    cyl('fd_tank', 0.6, 2.0, (1.8, 1.6, 0.9), rot=(0, 90, 0), mat=paint('#E2B33C', 0.35), segs=32, origin='center',
        bevel=0.08)
    for x in (1.2, 2.4):
        for y in (1.3, 1.9):
            cyl('fd_leg', 0.05, 0.5, (x, y, 0.08), mat=flat('#3D424C', 0.45, 0.5), segs=8)
    L.snow_slab('fd_tsnow', 1.6, 0.6, 0.06, (1.8, 1.6, 1.46), seed=82)
    box('fd_coalbin', (1.4, 1.0, 0.55), (-1.7, -1.3, 0.08), mat=flat('#8A5A33', 0.7), bevel=0.04)
    for k in range(9):
        blob('fd_coal', 0.14, (-2.1 + 0.1 * k, -1.3 + 0.05 * (k % 3) - 0.05, 0.6 + 0.04 * (k % 2)),
             flat('#1E1C1E', 0.5), seed=83 + k, amp=0.3, subdiv=1)
    PA.barrel_model('fd_b1', loc=(-0.7, -1.6, 0.08), scale=0.5, seed=90)
    PA.barrel_model('fd_b2', loc=(-0.4, -1.75, 0.08), scale=0.45, seed=91)
    # tall sign (blank round board)
    cyl('fd_spole', 0.06, 3.2, (2.35, -1.6, 0.08), mat=paint('#3B4150'), segs=12)
    T.sign_disc('fd_sign', (2.35, -1.6, 3.55), r=0.45, bg='#F6F3EC', rim='#D9483B', psi=45.0, tilt=4.0)
    mark('staff', (-0.3, -0.5, 0.0), facing=(1, -0.5, 0))
    return {'fx': {'board': (2.35, -1.66, 3.55)}}


# =========================================================================== traffic light (3 states)

TL_NOTE = ('Traffic light: a dark pole with a yellow-framed signal head (3 round lamps with visors) facing %s. '
           'Frames %s_green / _yellow / _red share frame + anchor (swap them; anims.cycle = a demo loop '
           'green-green-green-yellow-red-red-red). Place one at each corner of an intersection; the head faces the '
           'traffic that must obey it (%s).')


def traffic_light_builder(prefix):
    pole = paint('#3B4150')
    cyl('tl_base', 0.16, 0.12, (0, 0, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=16, r_top=0.12)
    cyl('tl_pole', 0.06, 2.6, (0, 0, 0.1), mat=pole, segs=12)
    box('tl_head', (0.42, 0.3, 1.05), (0, -0.05, 2.25), mat=paint('#F2C230'), bevel=0.1)
    box('tl_face', (0.36, 0.04, 0.98), (0, -0.2, 2.28), mat=flat('#2B2F3A', 0.5), bevel=0.04)
    L.snow_slab('tl_snow', 0.36, 0.26, 0.05, (0, -0.05, 3.3), seed=95)
    box('tl_btn', (0.14, 0.1, 0.2), (0.0, -0.08, 1.0), mat=paint('#F2C230'), bevel=0.03)
    lamps = {}
    for k, (state, col) in enumerate((('red', '#FF3B30'), ('yellow', '#FFC83D'), ('green', '#3DDC6B'))):
        z = 3.02 - 0.32 * k
        m = L.emissive('tl_%s' % state, '#3A3530', col, 0.0)
        sphere('tl_l%d' % k, 0.11, (0, -0.21, z), m, scale=(1, 0.5, 1), segs=18, rings=10)
        box('tl_vis%d' % k, (0.28, 0.16, 0.04), (0, -0.3, z + 0.12), rot=(-20, 0, 0), mat=flat('#2B2F3A', 0.5),
            bevel=0.01)
        lamps[state] = (m, col)

    def setter(on):
        def f():
            for st, (m, col) in lamps.items():
                p = m.node_tree.nodes.get('Principled BSDF')
                lit = st == on
                p.inputs['Base Color'].default_value = (*L.bc.srgb_to_linear(L.adj(col if lit else '#3A3530')), 1.0)
                p.inputs['Emission Color'].default_value = (*L.bc.srgb_to_linear(col), 1.0)
                p.inputs['Emission Strength'].default_value = 4.0 if lit else 0.0
        return f
    names = ['%s_%s' % (prefix, s) for s in ('green', 'yellow', 'red')]
    setter('green')()
    cyc = [names[0]] * 3 + [names[1]] + [names[2]] * 3
    return {'frames': [(names[0], setter('green')), (names[1], setter('yellow')), (names[2], setter('red'))],
            'sprites': {prefix: {'frame': names[0], 'stage': 0, 'anims': {'cycle': {'frames': cyc, 'fps': 1,
                                                                                   'repeat': -1}}},
                        names[0]: {'frame': names[0], 'state': 'green'},
                        names[1]: {'frame': names[1], 'state': 'yellow'},
                        names[2]: {'frame': names[2], 'state': 'red'}},
            'fx': {'lamps': (0, -0.25, 2.7)}}


@vb('traffic_light', 'decor', 'veh_street', fp=('r', 0.3), catcher=12.0,
    notes=TL_NOTE % ('screen down-left (local -Y)', 'traffic_light', 'vehicles heading NE'), ko='신호등',
    en='Traffic light', era=3)
def b_traffic_light():
    return traffic_light_builder('traffic_light')


@vb('traffic_light_b', 'decor', 'veh_street', fp=('r', 0.3), yaw=90.0, catcher=12.0,
    notes=TL_NOTE % ('screen down-right (world +X)', 'traffic_light_b', 'vehicles heading NW'), ko='신호등',
    en='Traffic light', era=3)
def b_traffic_light_b():
    return traffic_light_builder('traffic_light_b')


# =========================================================================== road signs (blank boards)

SIGN_NOTE = ('Road sign (blank board, faces the camera): %s. fxPoints.board = centre of the board face, boardPx = its '
             'size in px - the game draws the icon / text (speed limit, school zone, direction, town name ...).')


def sign_post(name, h, col='#3B4150'):
    cyl(name + '_foot', 0.14, 0.1, (0, 0, 0), mat=snowy('stone', lo=0.6, hi=0.8), segs=14, r_top=0.1)
    cyl(name + '_pole', 0.045, h, (0, 0, 0.05), mat=paint(col), segs=12)


@vb('road_sign_round', 'decor', 'veh_signs', fp=('r', 0.25), yaw=0.0, catcher=10.0, samples=32,
    notes=SIGN_NOTE % 'round white board with a red rim (regulation: limits, no entry ...)', ko='도로 표지판 (원형)',
    en='Road sign round', era=3)
def b_road_sign_round():
    sign_post('rsr', 2.0)
    T.sign_disc('rsr_d', (0, 0, 2.1), r=0.34, bg='#F6F3EC', rim='#D9483B', psi=45.0, tilt=4.0)
    return {'fx': {'board': (0.04, -0.04, 2.1)}, 'extra': {'boardPx': [42, 44], 'boardShape': 'round'}}


@vb('road_sign_tri', 'decor', 'veh_signs', fp=('r', 0.25), catcher=10.0, samples=32,
    notes=SIGN_NOTE % 'white triangle with a red rim (warning: crossing, children, slippery ...)',
    ko='도로 표지판 (삼각)', en='Road sign triangle', era=3)
def b_road_sign_tri():
    sign_post('rst', 1.9)
    with L.Collect() as c:
        tri = [(-0.4, -0.3), (0.4, -0.3), (0.0, 0.42)]
        T.ext_xz('rst_rim', [(x * 1.18, z * 1.18) for x, z in tri], 0.05, paint('#D9483B'), bevel=0.04)
        T.ext_xz('rst_face', tri, 0.05, flat('#F6F3EC', 0.6), y=-0.03, bevel=0.03)
        L.snow_slab('rst_snow', 0.18, 0.08, 0.04, (0, 0.0, 0.48), seed=96)
    L.group(BA.top_level(c.objs), 'rst_g', loc=(0, 0, 2.15), rot=(-4, 0, 45))
    return {'fx': {'board': (0.03, -0.03, 2.1)}, 'extra': {'boardPx': [46, 40], 'boardShape': 'triangle'}}


@vb('road_sign_rect', 'decor', 'veh_signs', fp=('r', 0.3), catcher=10.0, samples=32,
    notes=SIGN_NOTE % 'blue rectangle (information: parking, bus, crossing)', ko='도로 표지판 (사각)',
    en='Road sign rectangle', era=3)
def b_road_sign_rect():
    sign_post('rsq', 1.8)
    with L.Collect() as c:
        box('rsq_board', (0.66, 0.06, 0.66), (0, 0, -0.33), mat=paint('#3D7CC9'), bevel=0.06)
        box('rsq_rim', (0.58, 0.02, 0.58), (0, -0.035, -0.29), mat=flat('#F6F3EC', 0.6), bevel=0.04)
        box('rsq_face', (0.52, 0.02, 0.52), (0, -0.045, -0.26), mat=paint('#3D7CC9'), bevel=0.04)
        L.snow_slab('rsq_snow', 0.6, 0.08, 0.04, (0, 0, 0.33), seed=97)
    L.group(BA.top_level(c.objs), 'rsq_g', loc=(0, 0, 2.15), rot=(-4, 0, 45))
    return {'fx': {'board': (0.03, -0.03, 2.15)}, 'extra': {'boardPx': [44, 44], 'boardShape': 'square'}}


@vb('road_sign_arrow', 'decor', 'veh_signs', fp=('r', 0.3), catcher=10.0, samples=32,
    notes=SIGN_NOTE % 'green arrow-shaped direction board (place names; pointing screen right - use the mirrored '
                      'text side only by flipping the text, not the sprite)', ko='방향 표지판', en='Direction sign',
    era=3)
def b_road_sign_arrow():
    sign_post('rsa', 2.2, col='#5E3A22')
    with L.Collect() as c:
        pts = [(-0.55, -0.16), (0.38, -0.16), (0.58, 0.0), (0.38, 0.16), (-0.55, 0.16)]
        T.ext_xz('rsa_board', pts, 0.06, paint('#3E8E57'), bevel=0.03)
        T.ext_xz('rsa_rim', [(x * 0.9, z * 0.72) for x, z in pts], 0.02, flat('#F6F3EC', 0.6), y=-0.035, bevel=0.01)
        T.ext_xz('rsa_face', [(x * 0.86, z * 0.6) for x, z in pts], 0.02, paint('#3E8E57'), y=-0.045, bevel=0.01)
        L.snow_slab('rsa_snow', 0.9, 0.08, 0.04, (-0.05, 0.0, 0.17), seed=98)
    L.group(BA.top_level(c.objs), 'rsa_g', loc=(0.12, 0, 2.05), rot=(-4, 0, 45))
    return {'fx': {'board': (0.08, -0.08, 2.05)}, 'extra': {'boardPx': [66, 22], 'boardShape': 'arrow'}}


@vb('road_sign_info', 'decor', 'veh_signs', fp=(1.4, 0.4), yaw=45.0, catcher=12.0, samples=32,
    notes=SIGN_NOTE % 'wide cream information board on two wooden posts with a little snowy roof (town map, '
                      'bus timetable, welcome)', ko='안내판', en='Info board', era=3)
def b_road_sign_info():
    wood = flat('#8A5A33', 0.7)
    for x in (-0.62, 0.62):
        cyl('rsi_post', 0.06, 1.9, (x, 0, 0), mat=wood, segs=10)
    box('rsi_board', (1.3, 0.08, 0.8), (0, 0, 0.85), mat=flat('#8A5A33', 0.7), bevel=0.03)
    box('rsi_face', (1.16, 0.04, 0.68), (0, -0.05, 0.91), mat=flat('#F6EBD2', 0.6), bevel=0.02)
    LA.roof('rsi_roof', 1.55, -0.25, 1.78, 0.25, 1.98, 0.05, L.stripes('#B23A30', '#962F27', 5.0, 'Y'),
            snow_frac=0.9, seed=99)
    return {'fx': {'board': (0, -0.08, 1.25)}, 'extra': {'boardPx': [74, 44], 'boardShape': 'wide'}}
