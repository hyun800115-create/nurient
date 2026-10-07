"""
veh_models.py - the v5 vehicles (docs/CONTRACT_V5.md section L), one builder per key, registered in VEH.

Era 2 (읍):  horse_sleigh_bus, steam_wagon, dog_sled, cargo_sleigh
Era 3 (도시): retro_bus, truck_cargo, truck_cargo_chief, car_a..car_d (x3 colours), police_car, fire_truck, ambulance

Style: toys from the same world as the village / town - round, chunky, glossy, snow on the roofs, warm lamps.
Local frame (veh_lib doc): front = -Y, right side = -X (the side the camera always sees), origin = ground centre.
A builder returns a veh_lib.VB; veh_render poses it per anim frame (spin / bob / blink / smoke / hooks).

Anim specs per key: {anim: {frames, fps, repeat, bob: [px per frame], spin: bool, blink: bool, smoke: bool}}.
  bob  = integer pixel lift of the sprung body per frame (wheels stay on the ground)
  spin = wheels turn (360 / hub symmetry per loop, seamless)
  blink= emergency beacons alternate (on in even frames for phase 0, odd for phase 1)
  smoke= chimney / steam puffs active (L.Smoke loop)

Not run directly - see veh_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector, Euler

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob, hexmix
import prop_assets as PA
import veh_lib as VL
from veh_lib import rbox, paint, chrome, rubber

VEH = OrderedDict()


def veh(key, era, anims, notes='', samples=24, family=None, variant=None, kind='vehicle'):
    def deco(fn):
        VEH[key] = dict(key=key, fn=fn, era=era, anims=anims, notes=notes, samples=samples,
                        family=family or key, variant=variant, kind=kind)
        return fn
    return deco


def motor(idle=2, move=4, idle_fps=6, move_fps=10, idle_bob=None, move_bob=None):
    return OrderedDict([
        ('idle', dict(frames=idle, fps=idle_fps, repeat=-1, bob=idle_bob or [0, 1] * (idle // 2) + [0] * (idle % 2),
                      spin=False, blink=False, smoke=False)),
        ('move', dict(frames=move, fps=move_fps, repeat=-1, bob=move_bob or [0, 1, 1, 0][:move] + [0] * (move - 4),
                      spin=True, blink=False, smoke=False)),
    ])


def collect(B, fn):
    with L.Collect() as c:
        fn()
    B.adopt(c.objs)
    return c.objs


def interior(B, objs):
    for o in objs:
        o['veh_interior'] = True
        for ch in o.children_recursive:
            ch['veh_interior'] = True


# =========================================================================== retro bus (village bonnet bus)

BUS_NOTE = ('Retro village bonnet bus (7.0 m, toy-like): mint + cream two-tone with a red belt line, round chrome '
            'headlamps on the front fenders, a chrome grille with the Frost Village snowflake badge, white roof with '
            'snow + a roof rack with luggage, a blank route board over the windscreen (fxPoints.board), folding door '
            'on the right side behind the driver. 9 seats (seat 0 = driver, then 4 rows x 2). Empty: the game draws '
            'the driver + passengers at seats and then the over_* overlay. idle = engine shake, move = wheels + bounce.')


@veh('retro_bus', 3, motor(idle=2, move=4), notes=BUS_NOTE, samples=24)
def b_retro_bus():
    B = VL.VB('retro_bus')
    B.length, B.width, B.height = 7.2, 2.3, 2.95
    mint, cream, red = '#5FC09E', '#F7EDD6', '#D9483B'
    z0 = 0.48
    W2 = 1.15
    win_z = (1.5, 2.16)
    right = [(-2.08, -1.45)]                       # driver window
    door = (-1.35, -0.62)
    pax = [(-0.48, 0.62), (0.78, 1.88), (2.04, 3.14)]
    left = [(-2.08, -1.45), (-1.3, -0.62)] + pax
    rw, lw = right + pax, left
    parts = {}

    def build():
        body = VL.band_paint('bus_paint', [(-9, mint), (0.86, red), (0.95, cream)])
        cuts = []
        for (y0, y1) in rw:
            cuts.append((-W2 - 0.2, -W2 + 0.2, y0, y1, win_z[0], win_z[1], 0.08))
        cuts.append((-W2 - 0.2, -W2 + 0.2, door[0], door[1], 0.74, 2.2, 0.06))
        for (y0, y1) in lw:
            cuts.append((W2 - 0.2, W2 + 0.2, y0, y1, win_z[0], win_z[1], 0.08))
        cuts += [(-1.0, -0.06, -2.45, -2.05, 1.52, 2.2, 0.08), (0.06, 1.0, -2.45, -2.05, 1.52, 2.2, 0.08),
                 (-0.85, 0.85, 3.25, 3.65, 1.58, 2.16, 0.08)]
        arches = [(2.3, z0 + 0.02, 0.6, -1.4, 1.4), (-2.55, z0 + 0.02, 0.6, -1.4, 1.4)]
        parts['shell'] = VL.shell('bus_shell', (2.3, 5.7, 2.05), (0, 0.6, z0), body, r=0.3, wall=0.07,
                                  inner=flat('#EFE4CB', 0.8), frame_mat=paint('#F4F1EA', 0.4), cuts=cuts,
                                  arches=arches)
        # bonnet (rounded nose) + front fenders, wheel wells
        VL.shell('bus_bonnet', (1.72, 1.45, 0.86), (0, -2.85, 0.6), paint(mint), r=0.36, hollow=False,
                 arches=[(-2.55, z0 + 0.02, 0.6, -1.4, 1.4)])
        for sx in (-1, 1):
            VL.shell('bus_fender', (0.6, 1.4, 0.66), (sx * 0.86, -2.58, 0.46), paint(mint), r=0.27, hollow=False,
                     arches=[(-2.55, z0 + 0.02, 0.58, -1.4, 1.4)])
        VL.wheel_well('bus_wellF', -2.55, z0, 0.57, 1.0)
        VL.wheel_well('bus_wellR', 2.3, z0, 0.57, 1.06)
        rbox('bus_skirt', (2.24, 5.5, 0.12), (0, 0.6, z0 - 0.02), flat('#3B4150', 0.6), r=0.05)
        # grille + badge + chrome strip on the bonnet
        rbox('bus_grille', (0.92, 0.1, 0.56), (0, -3.56, 0.7), chrome(), r=0.08)
        for k in range(4):
            rbox('bus_slot', (0.74, 0.04, 0.05), (0, -3.62, 0.79 + 0.11 * k), flat('#2B2F3A', 0.6), r=0.02)
        VL.snowflake_badge('bus_badge', (0, -3.6, 1.36), r=0.12, psi=0.0)
        rbox('bus_hoodstrip', (0.1, 1.3, 0.04), (0, -2.85, 1.44), chrome(), r=0.02)
        for sx in (-1, 1):
            VL.headlamp('bus_head', (sx * 0.86, -3.3, 0.86), r=0.16, facing=-1)
            VL.taillamp('bus_tail', (sx * 0.93, 3.46, 0.95), r=0.085, facing=1)
            VL.taillamp('bus_tail2', (sx * 0.93, 3.46, 0.74), r=0.07, facing=1, col='#F2A23A')
            VL.mirror_arm('bus_mir', (sx * 1.1, -2.2, 1.6), out=sx)
            sphere('bus_marker', 0.055, (sx * 0.9, -2.3, 2.47), L.emissive('bus_mk', '#F2A23A', '#F2A23A', 2.0),
                   segs=12, rings=6)
        VL.bumper('bus_bumpF', -3.66, 2.0, 0.62)
        VL.bumper('bus_bumpR', 3.52, 2.24, 0.6)
        # route board over the windscreen (blank: the game writes the route)
        rbox('bus_board', (1.5, 0.1, 0.26), (0, -2.3, 2.21), flat('#2B2F3A', 0.5), r=0.04)
        rbox('bus_boardf', (1.38, 0.06, 0.18), (0, -2.35, 2.25), L.emissive('bus_boardg', '#FFF6DE', '#FFF6DE', 0.5),
             r=0.03)
        # roof: snow, rack with luggage, rear ladder
        VL.snow_cap('bus_roofsnow', 1.3, 1.1, (0.15, -1.45, 2.5), t=0.07, seed=3)
        VL.snow_cap('bus_roofsnow2', 0.8, 0.7, (-0.35, -0.3, 2.5), t=0.05, seed=4)
        VL.snowflake_badge('bus_sidebadge', (-W2 - 0.012, 1.3, 1.02), r=0.17, psi=-90.0)
        cm = chrome()
        for sx in (-1, 1):
            VL.rail_path('bus_rack', [(sx * 0.95, 0.7, 2.53), (sx * 0.95, 0.7, 2.68), (sx * 0.95, 3.25, 2.68),
                                      (sx * 0.95, 3.25, 2.53)], 0.025, cm)
        for y in (0.7, 1.55, 2.4, 3.25):
            VL.rod('bus_rackx', (-0.95, y, 2.68), (0.95, y, 2.68), 0.022, cm)
        rbox('bus_case1', (0.8, 0.55, 0.36), (-0.35, 1.3, 2.56), paint('#B9783F', 0.5), r=0.06)
        rbox('bus_case2', (0.62, 0.45, 0.3), (0.42, 2.45, 2.56), paint('#3D7CC9', 0.45), r=0.06)
        rbox('bus_case3', (0.5, 0.4, 0.26), (-0.4, 2.6, 2.56), paint('#E8749A', 0.45), r=0.06)
        L.snow_slab('bus_casesnow', 0.6, 0.4, 0.05, (-0.35, 1.3, 2.92), seed=4)
        for z in (0.75, 1.15, 1.55, 1.95, 2.35):
            VL.rod('bus_lad', (-0.88, 3.56, z), (-0.62, 3.56, z), 0.018, cm)
        for x in (-0.88, -0.62):
            VL.rod('bus_ladr', (x, 3.56, 0.62), (x, 3.56, 2.55), 0.022, cm)
        # exhaust pipe (rear right, low)
        cyl('bus_exh', 0.05, 0.22, (-0.7, 3.5, 0.36), rot=(90, 0, 0), mat=cm, segs=12, origin='center')
        # door: chrome edges + step + handrail
        for y in door:
            VL.rod('bus_doore', (-W2 - 0.005, y, 0.76), (-W2 - 0.005, y, 2.16), 0.022, cm)
        rbox('bus_step', (0.5, 0.66, 0.08), (-0.82, (door[0] + door[1]) / 2, 0.56), flat('#3B4150', 0.6), r=0.02)
        L.point_light('bus_inlight', (0, 0.6, 2.25), 'window', 26.0, 0.4)

    collect(B, build)

    def build_interior():
        rbox('bus_floor', (2.12, 5.5, 0.03), (0, 0.6, 0.56), flat('#B98A5E', 0.8), r=0.01)
        rbox('bus_dash', (2.0, 0.28, 0.42), (0, -2.05, 1.12), flat('#3B4150', 0.6), r=0.06)
        sw = VL.rod('bus_swcol', (-0.55, -2.05, 1.35), (-0.55, -1.86, 1.6), 0.03, flat('#2B2F3A', 0.5))
        ring = L.MB()
        for k in range(24):
            a0, a1 = math.tau * k / 24, math.tau * (k + 1) / 24
            p0 = Vector((-0.55 + 0.2 * math.cos(a0), -1.86, 1.6 + 0.2 * math.sin(a0) * 0.6))
            p1 = Vector((-0.55 + 0.2 * math.cos(a1), -1.86, 1.6 + 0.2 * math.sin(a1) * 0.6))
            ring.seg(p0 + Vector((0, 0.08 * math.sin(a0), 0)), p1 + Vector((0, 0.08 * math.sin(a1), 0)), 0.025,
                     flat('#2B2F3A', 0.45))
        ring.done('bus_swheel')
        del sw
        rbox('bus_pole', (0.06, 0.06, 1.6), (-0.4, door[1] + 0.08, 0.6), chrome(), r=0.02)
    interior(B, collect(B, build_interior))
    # seats (seat 0 = driver)
    sz, ceil = 1.07, 2.45
    B.seat((-0.55, -1.58, sz), (0, -1, 0), name='bus_seat0', cushion='#3B5B9A', back_h=0.62, ceiling=ceil)
    for r_, yf in enumerate((-0.3, 0.6, 1.5, 2.4)):
        for sx in (-1, 1):
            B.seat((sx * 0.52, yf, sz), (0, -1, 0), name='bus_seat%d%s' % (r_, 'R' if sx < 0 else 'L'),
                   cushion='#D9483B', back_h=0.62, ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('bus_seat')])
    # panes
    for k, (y0, y1) in enumerate(rw):
        B.side_window('bus_paneR%d' % k, -W2 + 0.02, y0, y1, win_z[0], win_z[1], side=-1)
    B.side_window('bus_paneD', -W2 + 0.03, door[0], door[1], 0.76, 2.18, side=-1)
    for k, (y0, y1) in enumerate(lw):
        B.side_window('bus_paneL%d' % k, W2 - 0.02, y0, y1, win_z[0], win_z[1], side=1, glint=False)
    B.end_window('bus_paneW1', -2.23, -1.0, -0.06, 1.52, 2.2, end=-1)
    B.end_window('bus_paneW2', -2.23, 0.06, 1.0, 1.52, 2.2, end=-1, glint=False)
    B.end_window('bus_paneB', 3.43, -0.85, 0.85, 1.58, 2.16, end=1)
    # wheels
    for y in (-2.55, 2.3):
        for sx in (-1, 1):
            B.add_wheel((sx * 0.95, y, z0), 0.48, w=0.34, hub='#F4F1EA', holes=3, name='bus_wh')
    B.wheel_sym = 3
    # points
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.86, -3.4, 0.86), many=True)
    for sx in (-1, 1):
        B.point('tailPoints', (sx * 0.93, 3.5, 0.95), many=True)
    B.point('exhaustPoint', (-0.7, 3.62, 0.36))
    B.point('doorPoints', (-1.6, (door[0] + door[1]) / 2, 0.0), many=True)
    B.point('doorPoints', (1.6, (door[0] + door[1]) / 2, 0.0), many=True)
    B.point('cargoPoint', (0.0, 1.9, 2.6))
    B.point('routeBoardPoint', (0.0, -2.36, 2.34))
    B.driver_wheel = Vector((-0.55, -1.86, 1.6))
    return B


# =========================================================================== round compact car (car_a)

CAR_COLOURS = {
    'car_a': [('red', '#D9483B'), ('blue', '#3D7CC9'), ('yellow', '#F2C230')],
    'car_b': [('red', '#D9483B'), ('blue', '#3D7CC9'), ('mint', '#5FC09E')],
    'car_c': [('red', '#D9483B'), ('blue', '#3D7CC9'), ('orange', '#EE8A3A')],
    'car_d': [('red', '#D9483B'), ('blue', '#3D7CC9'), ('cream', '#EADBB8')],
}
ROOF_CREAM = '#F7EDD6'


def car_cabin(B, name, col, y0, y1, z0, z1, w, r, roof_col=ROOF_CREAM, wins=None, front_cut=True, rear_cut=True,
              roof_split=None, inner='#E9DCC2'):
    """Hollow rounded cabin (greenhouse) with windscreen, rear window and side windows (right + left), clear
    panes, roof in a second colour above `roof_split` (object z)."""
    h = z1 - z0
    split = roof_split if roof_split is not None else h - 0.17
    m = VL.band_paint(name + '_paint', [(-9, col), (split, roof_col)])
    cuts = []
    wz0, wz1 = z0 + 0.17, z1 - 0.2
    wins = wins or [(y0 + 0.32, (y0 + y1) / 2 - 0.06), ((y0 + y1) / 2 + 0.06, y1 - 0.34)]
    for (a, b) in wins:
        cuts.append((-w / 2 - 0.2, -w / 2 + 0.2, a, b, wz0, wz1, 0.09))
        cuts.append((w / 2 - 0.2, w / 2 + 0.2, a, b, wz0, wz1, 0.09))
    if front_cut:
        cuts.append((-w / 2 + 0.16, w / 2 - 0.16, y0 - 0.2, y0 + 0.2, wz0, wz1 + 0.02, 0.1))
    if rear_cut:
        cuts.append((-w / 2 + 0.2, w / 2 - 0.2, y1 - 0.2, y1 + 0.2, wz0 + 0.03, wz1, 0.1))
    VL.shell(name, (w, y1 - y0, h), (0, (y0 + y1) / 2, z0), m, r=r, wall=0.06, inner=flat(inner, 0.8),
             frame_mat=paint('#F4F1EA', 0.4), cuts=cuts)
    return dict(wz=(wz0, wz1), wins=wins, w=w, y0=y0, y1=y1)


def car_panes(B, name, cab, front=True, rear=True):
    w2 = cab['w'] / 2
    wz0, wz1 = cab['wz']
    for k, (a, b) in enumerate(cab['wins']):
        B.side_window('%s_pR%d' % (name, k), -w2 + 0.03, a, b, wz0, wz1, side=-1)
        B.side_window('%s_pL%d' % (name, k), w2 - 0.03, a, b, wz0, wz1, side=1, glint=False)
    if front:
        B.end_window(name + '_pW', cab['y0'] + 0.03, -w2 + 0.16, w2 - 0.16, wz0, wz1 + 0.02, end=-1)
    if rear:
        B.end_window(name + '_pB', cab['y1'] - 0.03, -w2 + 0.2, w2 - 0.2, wz0 + 0.03, wz1, end=1)


def steering(name, c, r=0.15, tilt=0.55):
    mb = L.MB()
    m = flat('#2B2F3A', 0.45)
    pts = []
    for k in range(21):
        a = math.tau * k / 20
        pts.append(Vector((c[0] + r * math.cos(a), c[1] + r * math.sin(a) * tilt * 0.6,
                           c[2] + r * math.sin(a) * (1 - tilt * 0.5))))
    for p, q in zip(pts, pts[1:]):
        mb.seg(p, q, 0.022, m, segs=6)
    mb.seg(Vector(c), Vector((c[0], c[1] + 0.25, c[2] - 0.2)), 0.025, m, segs=6)
    return mb.done(name)


def b_car_a(colour):
    B = VL.VB('car_a')
    B.length, B.width, B.height = 3.5, 1.84, 1.98
    W_, wr = 1.84, 0.36
    ax = (-1.14, 1.12)
    cab = {}

    def build():
        VL.shell('ca_body', (W_, 3.44, 0.84), (0, 0, 0.3), paint(colour), r=0.38, hollow=False, taper=(0.94, 0.96),
                 arches=[(ax[0], wr + 0.02, 0.45, -1.2, 1.2), (ax[1], wr + 0.02, 0.45, -1.2, 1.2)])
        cab.update(car_cabin(B, 'ca_cab', colour, -0.98, 1.38, 0.98, 1.98, 1.66, 0.34, roof_col=colour))
        VL.wheel_well('ca_wellF', ax[0], wr, 0.44, 0.8)
        VL.wheel_well('ca_wellR', ax[1], wr, 0.44, 0.8)
        # frog-eye headlamps on the front, a chrome smile grille, badge
        for sx in (-1, 1):
            VL.headlamp('ca_head', (sx * 0.56, -1.6, 0.88), r=0.17, facing=-1, depth=0.12)
            VL.taillamp('ca_tail', (sx * 0.62, 1.66, 0.82), r=0.08, facing=1)
        rbox('ca_grille', (0.62, 0.08, 0.16), (0, -1.73, 0.5), chrome(), r=0.06)
        for k in range(2):
            rbox('ca_slot', (0.48, 0.04, 0.03), (0, -1.77, 0.54 + 0.06 * k), flat('#2B2F3A', 0.6), r=0.01)
        VL.snowflake_badge('ca_badge', (0, -1.74, 0.86), r=0.08, psi=0.0, bg=hexmix(colour, '#FFFFFF', 0.2))
        VL.bumper('ca_bumpF', -1.76, 1.62, 0.42, t=0.12, h=0.12)
        VL.bumper('ca_bumpR', 1.76, 1.62, 0.42, t=0.12, h=0.12)
        # door seam + handle on the right side, rubber trim at the belt line
        rbox('ca_handle', (0.04, 0.16, 0.05), (-W_ / 2 - 0.02, 0.18, 0.98), chrome(), r=0.02, origin='center')
        cyl('ca_exh', 0.04, 0.16, (-0.52, 1.72, 0.32), rot=(90, 0, 0), mat=chrome(), segs=12, origin='center')
        VL.snow_cap('ca_snow', 1.2, 1.5, (0, 0.24, 1.97), t=0.07, seed=5)
        L.point_light('ca_inlight', (0, 0.2, 1.75), 'window', 7.0, 0.3)

    collect(B, build)

    def build_interior():
        rbox('ca_dash', (1.5, 0.22, 0.14), (0, -0.82, 1.06), flat('#E9DCC2', 0.6), r=0.05)
        steering('ca_swheel', (-0.4, -0.66, 1.36))
    interior(B, collect(B, build_interior))
    sz, ceil = 0.64, 1.92
    for k, (sx, yf) in enumerate(((-0.4, -0.38), (0.4, -0.38), (-0.4, 0.5), (0.4, 0.5))):
        B.seat((sx, yf, sz), (0, -1, 0), name='ca_seat%d' % k, cushion='#E8E0CE', back_h=0.8, ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('ca_seat')])
    car_panes(B, 'ca', cab)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.74, y, wr), wr, w=0.27, hub='#F4F1EA', holes=3, name='ca_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.56, -1.72, 0.88), many=True)
        B.point('tailPoints', (sx * 0.62, 1.72, 0.82), many=True)
    B.point('exhaustPoint', (-0.52, 1.82, 0.32))
    B.point('doorPoints', (-1.3, -0.3, 0.0), many=True)
    B.point('doorPoints', (1.3, -0.3, 0.0), many=True)
    B.driver_wheel = Vector((-0.4, -0.66, 1.36))
    return B


CAR_A_NOTE = ('Round compact car (3.5 m, a chubby bubble car like a wind-up toy): frog-eye chrome headlamps, '
              'chrome smile grille, cream roof with snow, whitewall hubs. 4 seats (seat 0 = driver, right front). '
              'Colour variant: %s.')

for _c, _hex in CAR_COLOURS['car_a']:
    veh('car_a_' + _c, 3, motor(idle=2, move=4), notes=CAR_A_NOTE % _c, family='car_a', variant=_c)(
        (lambda h: (lambda: b_car_a(h)))(_hex))


# =========================================================================== horse sleigh bus (era 2)

HSB_NOTE = ('Horse-drawn sleigh bus (~7.5 m incl. horses): two chunky toy draft horses (chestnut with a white blaze '
            '+ bay) in red collars with gold bells and red blankets pull a covered coach on brass runners: deep red '
            'lower body with gold lining, cream window band, pine-green barrel roof with snow, two glowing lanterns, '
            'luggage on the roof. 9 seats: seat 0 = the coachman on the open box (driver), 8 passengers inside '
            '(4 rows x 2). idle = horses breathe, flick an ear, swish tails; move = 8-frame trot loop (diagonal '
            'pairs, bells swing, coach glides).')

HSB_ANIMS = OrderedDict([
    ('idle', dict(frames=4, fps=6, repeat=-1, bob=[0, 0, 0, 0], spin=False, blink=False, smoke=False)),
    ('move', dict(frames=8, fps=10, repeat=-1, bob=[0, 0, 1, 1, 0, 0, 1, 1], spin=False, blink=False,
                  smoke=False)),
])


@veh('horse_sleigh_bus', 2, HSB_ANIMS, notes=HSB_NOTE, samples=24)
def b_horse_sleigh_bus():
    import town_train as TT
    B = VL.VB('horse_sleigh_bus')
    B.length, B.width, B.height = 7.9, 1.95, 2.95
    red, cream, gold, green = '#B8392F', '#F6EBD2', '#E2B33C', '#2E6B4F'
    W2 = 0.95
    cy0, cy1 = 0.0, 3.55
    z0 = 0.62
    wz = (1.44, 2.1)
    wins = [(0.28, 0.98), (1.18, 2.0), (2.2, 3.28)]

    def build():
        body = VL.band_paint('hsb_paint', [(-9, red), (0.76, gold), (0.81, cream)], rough=0.4)
        cuts = []
        for (a, b) in wins:
            cuts.append((-W2 - 0.2, -W2 + 0.2, a, b, wz[0], wz[1], 0.1))
            cuts.append((W2 - 0.2, W2 + 0.2, a, b, wz[0], wz[1], 0.1))
        cuts.append((-0.62, 0.62, cy0 - 0.2, cy0 + 0.2, 1.5, 2.1, 0.1))
        cuts.append((-0.62, 0.62, cy1 - 0.2, cy1 + 0.2, 1.5, 2.1, 0.1))
        VL.shell('hsb_coach', (2 * W2, cy1 - cy0, 1.82), (0, (cy0 + cy1) / 2, z0), body, r=0.2, wall=0.07,
                 inner=flat('#E9D7B4', 0.8), frame_mat=paint(gold, 0.35), cuts=cuts)
        # gold panel lines on the lower body (right side) + door outline
        gm = paint(gold, 0.3)
        for (a, b) in ((0.2, 1.05), (2.15, 3.35)):
            VL.rail_path('hsb_panel', [(-W2 - 0.012, a, 0.82), (-W2 - 0.012, b, 0.82), (-W2 - 0.012, b, 1.28),
                                       (-W2 - 0.012, a, 1.28), (-W2 - 0.012, a, 0.82)], 0.014, gm)
        VL.rail_path('hsb_door', [(-W2 - 0.012, 1.15, 0.72), (-W2 - 0.012, 2.03, 0.72), (-W2 - 0.012, 2.03, 2.18),
                                  (-W2 - 0.012, 1.15, 2.18), (-W2 - 0.012, 1.15, 0.72)], 0.016, gm)
        sphere('hsb_knob', 0.04, (-W2 - 0.03, 1.9, 1.32), gm, segs=10, rings=6)
        rbox('hsb_step', (0.3, 0.6, 0.06), (-W2 - 0.12, 1.59, 0.44), flat('#5E3A22', 0.7), r=0.02)
        # barrel roof (green) with snow + luggage (roof_curved builds it centred on y = 0 -> group + move)
        with L.Collect() as rc:
            TT.roof_curved('hsb_roof', 2 * W2 + 0.04, cy1 - cy0, z0 + 1.82 - 0.03, rise=0.2, col=green, over=0.1,
                           seed=6, long_snow=False)
        L.group(VL.BA.top_level(rc.objs), 'hsb_roofg', loc=(0, (cy0 + cy1) / 2, 0))
        VL.snow_cap('hsb_roofsnow', 1.1, 1.6, (-0.15, 1.0, z0 + 1.82 + 0.17), t=0.08, seed=12)
        rbox('hsb_trunk', (0.9, 0.7, 0.42), (0.2, 2.6, z0 + 1.98), paint('#8A5A33', 0.6), r=0.06)
        rbox('hsb_trunkb', (0.94, 0.08, 0.44), (0.2, 2.6, z0 + 1.97), paint(gold, 0.35), r=0.02)
        L.snow_slab('hsb_trunksnow', 0.7, 0.55, 0.06, (0.2, 2.6, z0 + 2.4), seed=8)
        # runners (brass) + posts
        rm = paint('#C9973A', 0.3)
        for sx in (-1, 1):
            VL.runner('hsb_run', -0.62, 3.75, sx * 0.74, 0.05, rm, curl=0.42, r=0.05)
            for y in (0.25, 1.75, 3.25):
                VL.rod('hsb_post', (sx * 0.74, y, 0.05), (sx * 0.74, y, z0 + 0.04), 0.04, flat('#3D424C', 0.45, 0.5))
        VL.rod('hsb_rbar', (-0.74, -0.3, 0.42), (0.74, -0.3, 0.42), 0.035, rm)
        # coachman's box: seat, footboard, dash
        rbox('hsb_box', (1.3, 0.56, 0.42), (0, -0.34, z0 + 0.04), paint(red, 0.4), r=0.1)
        rbox('hsb_seatbox', (1.24, 0.46, 0.26), (0, -0.3, 1.12), paint('#6B4226', 0.6), r=0.07)
        rbox('hsb_cush', (1.16, 0.42, 0.1), (0, -0.33, 1.36), paint('#3D7CC9', 0.6, coat=0.1), r=0.045)
        rbox('hsb_foot', (1.2, 0.5, 0.05), (0, -0.88, 0.86), flat('#8A5A33', 0.7), r=0.02)
        dash = [(-0.62, -1.12, 0.86), (-0.6, -1.2, 1.02), (-0.55, -1.25, 1.12)]
        for k, x in enumerate((-0.6, -0.3, 0.0, 0.3, 0.6)):
            VL.rod('hsb_dashp', (x, -1.12, 0.88), (x * 1.04, -1.26, 1.14), 0.025, flat('#8A5A33', 0.7))
        VL.rail_path('hsb_dashr', [(-0.64, -1.27, 1.15), (0.64, -1.27, 1.15)], 0.035, paint(gold, 0.3))
        del dash
        for sx in (-1, 1):
            VL.rod('hsb_footpost', (sx * 0.62, -0.92, 0.95), (sx * 0.62, -0.62, 0.6), 0.03, flat('#3D424C', 0.45))
            # lanterns at the coach front corners
            VL.rod('hsb_lpost', (sx * (W2 + 0.04), 0.05, 1.5), (sx * (W2 + 0.12), -0.05, 1.86), 0.025,
                   flat('#3D424C', 0.45, 0.5))
            TT.lamp('hsb_lan', (sx * (W2 + 0.12), -0.07, 1.98), r=0.08)
            rbox('hsb_lanbox', (0.18, 0.18, 0.26), (sx * (W2 + 0.12), -0.05, 1.86), flat('#2B2F3A', 0.5, 0.4),
                 r=0.03)
        # pole + whippletree + traces
        wood = flat('#8A5A33', 0.7)
        VL.rod('hsb_pole', (0, -1.1, 0.8), (0, -3.4, 1.05), 0.055, wood)
        VL.rod('hsb_whip', (-0.9, -1.38, 0.86), (0.9, -1.38, 0.86), 0.045, wood)
        rope = flat('#5E3A22', 0.7)
        for hx in (-0.56, 0.56):
            for d in (-0.36, 0.36):
                VL.rod('hsb_trace', (hx + d * 0.9, -1.38, 0.86), (hx + d * 1.05, -2.75, 1.28), 0.02, rope)
        L.point_light('hsb_inlight', (0, 1.8, 2.15), 'window', 14.0, 0.4)

    collect(B, build)
    sz, ceil = 0.98, 2.36
    B.seat((-0.32, -0.56, 1.43), (0, -1, 0), name='hsb_seat0', cushion=None)
    for r_, yf in enumerate((0.36, 1.2, 2.05, 2.9)):
        for sx in (-1, 1):
            B.seat((sx * 0.45, yf, sz), (0, -1, 0), name='hsb_seat%d%s' % (r_, 'R' if sx < 0 else 'L'),
                   cushion='#3D7CC9', back_h=0.62, ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('hsb_seat')])
    for k, (a, b) in enumerate(wins):
        B.side_window('hsb_pR%d' % k, -W2 + 0.03, a, b, wz[0], wz[1], side=-1)
        B.side_window('hsb_pL%d' % k, W2 - 0.03, a, b, wz[0], wz[1], side=1, glint=False)
    B.end_window('hsb_pF', cy0 + 0.03, -0.62, 0.62, 1.5, 2.1, end=-1)
    B.end_window('hsb_pB', cy1 - 0.03, -0.62, 0.62, 1.5, 2.1, end=1)
    # horses (not sprung with the coach): chestnut with blaze on the right (camera side), bay on the left
    hA = VL.build_horse('hsA', coat='#C27A42', mane='#F3E6CC', muzzle='#F1DCC0', blaze=True, scale=1.22)
    hB = VL.build_horse('hsB', coat='#8A5638', mane='#3A2A22', muzzle='#C9A17E', blaze=False, blanket='#3D7CC9',
                        scale=1.22)
    for rig, x in ((hA, -0.56), (hB, 0.56)):
        rig.j['root'].parent = B.root
        rig.rest_loc['root'] = Vector((x, -2.5, 0.0))
        B.rigs.append(rig)

    def hook(anim, i, n):
        VL.pose_horse(hA, anim, i, n, phase=0.0)
        VL.pose_horse(hB, anim, i, n, phase=0.55 if anim == 'move' else 1.3)
    B.hooks.append(hook)
    for sx in (-1, 1):
        B.point('lightPoints', (sx * (W2 + 0.12), -0.12, 1.98), many=True)
    B.point('doorPoints', (-1.45, 1.59, 0.0), many=True)
    B.point('doorPoints', (1.45, 1.59, 0.0), many=True)
    B.point('cargoPoint', (0.2, 1.4, 2.62))
    B.point('steamPoint', (0.0, -3.75, 1.75))
    B.driver_wheel = None
    return B


# =========================================================================== shared era-2 bits

ERA2_ANIMS = OrderedDict([
    ('idle', dict(frames=4, fps=6, repeat=-1, bob=[0, 0, 0, 0], spin=False, blink=False, smoke=False)),
    ('move', dict(frames=8, fps=10, repeat=-1, bob=[0, 0, 1, 1, 0, 0, 1, 1], spin=True, blink=False,
                  smoke=False)),
])


def era2_anims(idle_smoke=False, move_smoke=False, move_bob=None):
    a = OrderedDict((k, dict(v)) for k, v in ERA2_ANIMS.items())
    a['idle']['smoke'] = idle_smoke
    a['move']['smoke'] = move_smoke
    if move_bob:
        a['move']['bob'] = move_bob
    return a


# =========================================================================== steam wagon (era 2)

STEAM_NOTE = ('Cute steam cargo wagon (4.4 m): forest-green toy steam lorry with a brass-banded boiler and a tall '
              'black chimney with a gold crown at the front, an open driver cab under a cream canopy, red spoked '
              'wheels (big at the back) and a wooden cargo bed with two lashed crates + a sack at the back; the '
              'front half of the bed is free for the game cargo stack (cargoPoint). 2 seats (seat 0 = driver, right). '
              'idle = gentle chimney steam, move = 8-frame loop: wheels, puffing chimney, bounce. steamPoint = '
              'chimney top for extra game puffs.')


@veh('steam_wagon', 2, era2_anims(idle_smoke=True, move_smoke=True, move_bob=[0, 1, 0, 1, 0, 1, 0, 1]),
     notes=STEAM_NOTE)
def b_steam_wagon():
    B = VL.VB('steam_wagon')
    B.length, B.width, B.height = 4.5, 1.86, 3.0
    green, cream, red, brass, dark = '#2F7A55', '#F2E6C8', '#C8463D', '#E2B33C', '#2B2F3A'
    zf = 0.62

    def build():
        rbox('sw_frame', (1.2, 4.1, 0.2), (0, 0.05, zf - 0.12), flat(dark, 0.5), r=0.05)
        # engine house: rounded green front with the boiler
        VL.shell('sw_nose', (1.62, 1.25, 0.95), (0, -1.55, zf), paint(green), r=0.32, hollow=False,
                 arches=[(-1.45, 0.42, 0.5, -1.2, 1.2)])
        cyl('sw_boiler', 0.5, 1.2, (0, -1.5, zf + 0.5), mat=paint('#3D424C', 0.35), segs=36, bevel=0.06)
        for z in (zf + 0.75, zf + 1.05, zf + 1.38):
            cyl('sw_band', 0.515, 0.06, (0, -1.5, z), mat=paint(brass, 0.25), segs=36, bevel=0.01)
        sphere('sw_dome', 0.5, (0, -1.5, zf + 1.68), paint('#3D424C', 0.35), scale=(1, 1, 0.45), segs=28, rings=12)
        cyl('sw_chim', 0.13, 0.75, (0, -1.68, zf + 1.75), mat=flat(dark, 0.45), segs=20)
        cyl('sw_chimfl', 0.13, 0.22, (0, -1.68, zf + 2.42), mat=flat(dark, 0.45), segs=20, r_top=0.22, bevel=0.02)
        cyl('sw_crown', 0.235, 0.07, (0, -1.68, zf + 2.62), mat=paint(brass, 0.25), segs=24, bevel=0.015)
        cyl('sw_hole', 0.17, 0.02, (0, -1.68, zf + 2.685), mat=flat('#1A1614', 0.9), segs=20, bevel=0.0)
        sphere('sw_whistle', 0.06, (0.22, -1.32, zf + 2.0), paint(brass, 0.25), scale=(1, 1, 1.6), segs=12, rings=8)
        cyl('sw_firedoor', 0.16, 0.05, (0, -1.0, zf + 0.62), rot=(90, 0, 0), mat=paint(brass, 0.3), segs=20,
            origin='center')
        rbox('sw_glow', (0.18, 0.02, 0.08), (0, -0.97, zf + 0.58), L.emissive('sw_fire', '#FF8A2A', '#FF8A2A', 3.0),
             r=0.01)
        TT_lamp = __import__('town_train').lamp
        TT_lamp('sw_lamp', (0, -2.2, zf + 0.75), r=0.1)
        rbox('sw_lampbox', (0.26, 0.2, 0.22), (0, -2.12, zf + 0.62), paint(dark, 0.4), r=0.05)
        VL.snowflake_badge('sw_badge', (-0.82, -1.55, zf + 0.5), r=0.15, psi=-90.0, bg=red)
        VL.bumper('sw_bump', -2.22, 1.5, zf + 0.12, mat=paint(red, 0.4), t=0.16, h=0.16)
        # open driver cab: floor, low walls, canopy on 4 posts
        rbox('sw_cabfl', (1.7, 1.05, 0.12), (0, -0.4, zf + 0.06), paint(green), r=0.05)
        for sx in (-1, 1):
            VL.shell('sw_cabside', (0.1, 1.0, 0.55), (sx * 0.8, -0.4, zf + 0.12), paint(green), r=0.04,
                     hollow=False)
        rbox('sw_cabback', (1.7, 0.1, 0.62), (0, 0.08, zf + 0.12), paint(green), r=0.04)
        for sx in (-1, 1):
            for y in (-0.88, 0.06):
                VL.rod('sw_post', (sx * 0.8, y, zf + 0.55), (sx * 0.8, y, zf + 1.95), 0.04, paint(brass, 0.3))
        rbox('sw_canopy', (1.9, 1.3, 0.12), (0, -0.4, zf + 1.92), paint(cream, 0.5), r=0.05)
        rbox('sw_canopyr', (1.96, 1.36, 0.06), (0, -0.4, zf + 1.9), paint(green), r=0.03)
        VL.snow_cap('sw_snow', 1.3, 0.8, (0.1, -0.35, zf + 2.04), t=0.06, seed=4)
        # cargo bed with stakes + crates at the back
        rbox('sw_bed', (1.8, 2.25, 0.1), (0, 1.15, zf + 0.1), L.stripes('#D9AA70', '#C4935A', 9.0, 'X', soft=0.04),
             r=0.02)
        gm = L.stripes('#3E8E57', '#357A4A', 6.0, 'Z', soft=0.05)
        for sx in (-1, 1):
            rbox('sw_side', (0.06, 2.25, 0.28), (sx * 0.87, 1.15, zf + 0.2), gm, r=0.02)
            for y in (0.2, 1.15, 2.1):
                rbox('sw_stake', (0.08, 0.08, 0.42), (sx * 0.9, y, zf + 0.14), flat('#8A5A33', 0.7), r=0.02)
        rbox('sw_tail', (1.8, 0.06, 0.28), (0, 2.25, zf + 0.2), gm, r=0.02)
        VL.crate('sw_cr1', 0.5, (-0.38, 1.85, zf + 0.2), rot_z=6, snow=True, seed=21)
        VL.crate('sw_cr2', 0.42, (0.36, 1.88, zf + 0.2), rot_z=-10, snow=False, seed=22)
        VL.sack('sw_sack', (0.34, 1.35, zf + 0.2), s=0.75, seed=23)
        L.smooth_tube('sw_lash', [(-0.85, 1.6, zf + 0.5), (-0.3, 1.62, zf + 0.75), (0.3, 1.62, zf + 0.72),
                                  (0.85, 1.6, zf + 0.5)], 0.015, flat('#D9C39A', 0.8))
        for sx in (-1, 1):
            VL.taillamp('sw_tl', (sx * 0.75, 2.3, zf + 0.25), r=0.06, facing=1)
        L.point_light('sw_firelight', (0, -0.8, zf + 0.7), 'fire', 6.0, 0.2)
    collect(B, build)
    B.seat((-0.42, -0.62, zf + 0.5), (0, -1, 0), name='sw_seat0', cushion='#C8463D', back_h=0.4)
    B.seat((0.42, -0.62, zf + 0.5), (0, -1, 0), name='sw_seat1', cushion='#C8463D', back_h=0.4)
    interior(B, [o for o in B.body.children if o.name.startswith('sw_seat')])
    for y, r_ in ((-1.45, 0.42), (1.45, 0.52)):
        for sx in (-1, 1):
            B.add_wheel((sx * 0.86, y, r_), r_, w=0.2, hub=brass, tyre='#3A3F4B', spokes=6, rim=red, hole_col=red,
                        name='sw_wh')
    B.wheel_sym, B.wheel_turns = 6, 2
    B.smoke('sw_smoke', (0, -1.68, zf + 2.6), n=3, rise=0.9, drift=(0.0, 0.7), r0=0.1, r1=0.28, color='#EEF1F5',
            alpha=0.9, seed=7)
    B.point('steamPoint', (0, -1.68, zf + 2.7))
    B.point('lightPoints', (0, -2.3, zf + 0.75), many=True)
    B.point('tailPoints', (-0.75, 2.34, zf + 0.25), many=True)
    B.point('tailPoints', (0.75, 2.34, zf + 0.25), many=True)
    B.point('cargoPoint', (0.0, 0.75, zf + 0.22))
    B.point('doorPoints', (-1.25, -0.45, 0.0), many=True)
    B.point('doorPoints', (1.25, -0.45, 0.0), many=True)
    return B


# =========================================================================== dog sled (era 2)

DOG_NOTE = ('Small dog sled (~3 m): two fluffy grey huskies (the village dog body, husky coat, blue harness) '
            'pull a little wooden basket sled with curled runners, a red blanket seat and a handle bar. 1 seat '
            '(seat 0 = the rider, sitting in the basket, holding the line). idle = dogs pant and wag, move = the '
            'dogs 8-frame run cycle (the pet_dog run), sled sways.')


@veh('dog_sled', 2, era2_anims(move_bob=[0, 0, 1, 1, 0, 0, 1, 1]), notes=DOG_NOTE)
def b_dog_sled():
    B = VL.VB('dog_sled')
    B.length, B.width, B.height = 3.1, 1.1, 1.3
    wood, wood2 = '#C98F55', '#8A5A33'

    def build():
        rm = flat(wood2, 0.6)
        for sx in (-1, 1):
            VL.runner('ds_run', -0.5, 1.45, sx * 0.34, 0.04, rm, curl=0.3, r=0.035)
            for y in (-0.2, 0.5, 1.2):
                VL.rod('ds_post', (sx * 0.34, y, 0.04), (sx * 0.34, y, 0.3), 0.03, rm)
        rbox('ds_bed', (0.78, 1.55, 0.06), (0, 0.48, 0.28), L.stripes(wood, '#B5763F', 10.0, 'X', soft=0.04), r=0.02)
        for sx in (-1, 1):
            VL.rail_path('ds_rail', [(sx * 0.38, -0.25, 0.34), (sx * 0.38, -0.25, 0.52), (sx * 0.38, 1.22, 0.52),
                                     (sx * 0.38, 1.22, 0.34)], 0.025, flat(wood2, 0.6))
        # basket front curl + seat blanket + handle bar at the back
        VL.rail_path('ds_front', [(-0.36, -0.28, 0.5), (-0.2, -0.42, 0.62), (0.2, -0.42, 0.62), (0.36, -0.28, 0.5)],
                     0.03, flat(wood2, 0.6))
        rbox('ds_blanket', (0.72, 0.62, 0.1), (0, 0.6, 0.33), paint('#C8463D', 0.7, coat=0.0), r=0.04)
        rbox('ds_blanket2', (0.6, 0.12, 0.3), (0, 0.9, 0.33), paint('#C8463D', 0.7, coat=0.0), r=0.05)
        for sx in (-1, 1):
            VL.rod('ds_handle', (sx * 0.34, 1.25, 0.32), (sx * 0.3, 1.38, 1.05), 0.03, flat(wood2, 0.6))
        VL.rod('ds_handlebar', (-0.32, 1.37, 1.04), (0.32, 1.37, 1.04), 0.035, paint('#3D7CC9', 0.4))
        # small parcel behind the seat
        VL.crate('ds_box', 0.3, (0.12, 1.12, 0.34), rot_z=8, snow=True, seed=31)
        # gangline from the sled to the dogs
        rope = flat('#3D7CC9', 0.6)
        VL.rod('ds_gang', (0, -0.42, 0.45), (0, -0.92, 0.42), 0.016, rope)
        for sx in (-1, 1):
            VL.rod('ds_tug', (0, -0.92, 0.42), (sx * 0.3, -1.12, 0.44), 0.013, rope)
    collect(B, build)
    B.seat((-0.0, 0.42, 0.45), (0, -1, 0), name='ds_seat0', cushion=None, ceiling=2.2)
    dogs = []
    for sx, coat, light, ph in ((-1, '#7F8A99', '#F6F3EE', 0), (1, '#4A4F5A', '#F2EEE8', 3)):
        rig = VL.build_husky('husky%d' % (sx > 0), coat=coat, light=light, scale=1.6)
        rig.meta['top'].parent = B.root
        rig.meta['top'].location = (sx * 0.3, -1.45, 0.0)
        dogs.append((rig, ph))
        B.rigs.append(rig)

    def hook(anim, i, n):
        for rig, ph in dogs:
            VL.pose_husky(rig, anim, i, n, phase_i=ph if anim == 'idle' else ph % n)
    B.hooks.append(hook)
    B.point('cargoPoint', (0.12, 1.1, 0.36))
    B.point('doorPoints', (-0.85, 0.5, 0.0), many=True)
    B.point('doorPoints', (0.85, 0.5, 0.0), many=True)
    B.driver_wheel = None
    return B


# =========================================================================== cargo sleigh (era 2)

CSL_NOTE = ('Horse cargo sleigh (~4.9 m): one chunky pony (dapple grey, blue blanket, bells) pulls a low wooden '
            'cargo sleigh with green stake sides, a driver bench at the front and a few sacks + a barrel lashed at '
            'the back; the middle of the bed is free for the game cargo stack (cargoPoint). 1 seat (driver). '
            'idle = the pony breathes / swishes, move = 8-frame trot.')


@veh('cargo_sleigh', 2, era2_anims(move_bob=[0, 0, 1, 1, 0, 0, 1, 1]), notes=CSL_NOTE)
def b_cargo_sleigh():
    B = VL.VB('cargo_sleigh')
    B.length, B.width, B.height = 4.9, 1.6, 2.2
    wood, wood2, green = '#C98F55', '#8A5A33', '#3E8E57'
    zb = 0.42

    def build():
        rm = paint('#3D424C', 0.4)
        for sx in (-1, 1):
            VL.runner('cs_run', -0.15, 2.4, sx * 0.62, 0.04, rm, curl=0.34, r=0.04)
            for y in (0.2, 1.2, 2.2):
                VL.rod('cs_post', (sx * 0.62, y, 0.04), (sx * 0.62, y, zb), 0.035, rm)
        rbox('cs_bed', (1.5, 2.45, 0.1), (0, 1.2, zb), L.stripes('#D9AA70', '#C4935A', 10.0, 'X', soft=0.04),
             r=0.02)
        gm = L.stripes('#3E8E57', '#357A4A', 6.0, 'Z', soft=0.05)
        for sx in (-1, 1):
            rbox('cs_side', (0.06, 1.9, 0.3), (sx * 0.73, 1.45, zb + 0.1), gm, r=0.02)
            for y in (0.5, 1.45, 2.4):
                rbox('cs_stake', (0.08, 0.08, 0.5), (sx * 0.76, y, zb + 0.02), flat(wood2, 0.7), r=0.02)
        rbox('cs_tail', (1.5, 0.06, 0.3), (0, 2.41, zb + 0.1), gm, r=0.02)
        # driver bench at the front + footboard
        rbox('cs_bench', (1.3, 0.42, 0.34), (0, 0.22, zb + 0.1), paint(wood2, 0.6), r=0.05)
        rbox('cs_cush', (1.2, 0.38, 0.08), (0, 0.22, zb + 0.43), paint('#C8463D', 0.7, coat=0.0), r=0.03)
        rbox('cs_backrest', (1.3, 0.08, 0.36), (0, 0.42, zb + 0.4), paint(wood2, 0.6), r=0.03)
        rbox('cs_foot', (1.3, 0.4, 0.06), (0, -0.25, zb + 0.02), flat(wood2, 0.7), r=0.02)
        VL.rail_path('cs_dash', [(-0.62, -0.42, zb + 0.06), (-0.6, -0.5, zb + 0.4), (0.6, -0.5, zb + 0.4),
                                 (0.62, -0.42, zb + 0.06)], 0.03, flat(wood2, 0.6))
        # cargo at the back
        VL.sack('cs_sack1', (-0.4, 2.1, zb + 0.1), s=0.9, seed=41)
        VL.sack('cs_sack2', (0.02, 2.15, zb + 0.1), s=0.85, col='#E2CFA2', seed=42)
        VL.barrel('cs_barrel', (0.45, 2.05, zb + 0.1), scale=0.5, seed=43)
        L.snow_slab('cs_snow', 0.4, 0.3, 0.04, (-0.4, 2.1, zb + 0.55), seed=44)
        # shafts to the pony
        wood_m = flat(wood2, 0.7)
        for sx in (-1, 1):
            VL.rod('cs_shaft', (sx * 0.55, -0.35, zb + 0.15), (sx * 0.42, -2.2, 0.95), 0.04, wood_m)
        VL.rod('cs_whip', (-0.55, -0.4, zb + 0.15), (0.55, -0.4, zb + 0.15), 0.035, wood_m)
        TT_lamp = __import__('town_train').lamp
        VL.rod('cs_lpost', (-0.68, 0.3, zb + 0.4), (-0.7, 0.25, zb + 1.0), 0.02, rm)
        TT_lamp('cs_lan', (-0.7, 0.22, zb + 1.08), r=0.07)
    collect(B, build)
    B.seat((-0.25, 0.04, zb + 0.5), (0, -1, 0), name='cs_seat0', cushion=None, ceiling=3.0)
    pony = VL.build_horse('pony', coat='#B9B4AE', mane='#F4F1EA', muzzle='#E6E0D8', blaze=False, blanket='#3D7CC9',
                          scale=1.12, socks='#F4F1EA', collar='#2E4F8A')
    pony.j['root'].parent = B.root
    pony.rest_loc['root'] = Vector((0, -1.55, 0.0))
    B.rigs.append(pony)

    def hook(anim, i, n):
        VL.pose_horse(pony, anim, i, n, phase=0.0)
    B.hooks.append(hook)
    B.point('cargoPoint', (0.0, 1.2, zb + 0.12))
    B.point('lightPoints', (-0.7, 0.18, zb + 1.08), many=True)
    B.point('doorPoints', (-1.15, 0.2, 0.0), many=True)
    B.point('doorPoints', (1.15, 0.2, 0.0), many=True)
    B.driver_wheel = None
    return B


# =========================================================================== cars b / c / d + police (shared bonnet-car builder)

def b_bonnet_car(key, colour, kind='sedan', scheme=None):
    """Retro round car on a bonnet body.  kind: sedan (car_b, police), pickup (car_c), wagon (car_d)."""
    B = VL.VB(key)
    pre = key[:6]
    W_, wr = 1.86, 0.37
    if kind == 'sedan':
        L_, ax, cab_y, wins = 3.9, (-1.27, 1.3), (-0.82, 1.0), None
    elif kind == 'pickup':
        L_, ax, cab_y, wins = 4.0, (-1.3, 1.35), (-0.78, 0.36), [(-0.5, 0.12)]
    else:
        L_, ax, cab_y, wins = 4.1, (-1.3, 1.4), (-0.84, 1.84), [(-0.56, 0.2), (0.32, 1.0), (1.12, 1.56)]
    B.length, B.width, B.height = L_, W_, 2.0
    y0, y1 = -L_ / 2, L_ / 2
    cab = {}
    police = scheme == 'police'
    body_col = '#F6F3EC' if police else colour
    roof_col = '#2E4F8A' if police else (ROOF_CREAM if kind != 'pickup' else colour)

    def build():
        if police:
            bm = VL.band_paint(pre + '_bpaint', [(-9, '#2E4F8A'), (0.44, '#F2C14E'), (0.5, '#F6F3EC')])
        else:
            bm = paint(body_col)
        arches = [(ax[0], wr + 0.02, 0.46, -1.2, 1.2), (ax[1], wr + 0.02, 0.46, -1.2, 1.2)]
        if kind == 'pickup':
            VL.shell(pre + '_body', (W_, 2.55, 0.8), (0, y0 + 1.275, 0.3), bm, r=0.36, hollow=False,
                     taper=(0.95, 0.97), arches=arches[:1])
            bedc = [(-W_ / 2 + 0.1, W_ / 2 - 0.1, 0.55, y1 - 0.1, 0.87, 1.5, 0.06)]
            VL.shell(pre + '_bed', (W_, 1.55, 0.84), (0, y1 - 0.775, 0.32), paint(body_col), r=0.22, hollow=False,
                     arches=arches[1:], cuts=bedc, frame_mat=flat('#8A5A33', 0.7))
            rbox(pre + '_bedfl', (W_ - 0.26, 1.33, 0.03), (0, y1 - 0.77, 0.875), L.stripes('#D9AA70', '#C4935A',
                                                                                           9.0, 'X', soft=0.04),
                 r=0.01)
            rbox(pre + '_tarp', (1.4, 0.26, 0.22), (0, 0.72, 0.9), paint('#3E8E57', 0.7, coat=0.0), r=0.1)
        else:
            VL.shell(pre + '_body', (W_, L_ - 0.04, 0.8), (0, 0, 0.3), bm, r=0.36, hollow=False,
                     taper=(0.95, 0.97), arches=arches)
        cz0, cz1 = 0.98, 1.98
        cab.update(car_cabin(B, pre + '_cab', body_col, cab_y[0], cab_y[1], cz0, cz1, 1.68, 0.3,
                             roof_col=roof_col, wins=wins, rear_cut=True,
                             roof_split=(cz1 - cz0 - 0.15) if (police or kind != 'pickup') else 9.0))
        VL.wheel_well(pre + '_wellF', ax[0], wr, 0.45, 0.8)
        VL.wheel_well(pre + '_wellR', ax[1], wr, 0.45, 0.8)
        for sx in (-1, 1):
            VL.headlamp(pre + '_head', (sx * 0.6, y0 + 0.1, 0.82), r=0.15, facing=-1, depth=0.12)
            VL.taillamp(pre + '_tail', (sx * 0.64, y1 - 0.06, 0.84), r=0.075, facing=1)
        rbox(pre + '_grille', (0.86, 0.08, 0.22), (0, y0 - 0.02, 0.5), chrome(), r=0.07)
        for k in range(3):
            rbox(pre + '_slot', (0.7, 0.04, 0.03), (0, y0 - 0.06, 0.54 + 0.055 * k), flat('#2B2F3A', 0.6), r=0.01)
        VL.bumper(pre + '_bumpF', y0 - 0.04, 1.7, 0.42, t=0.12, h=0.12)
        VL.bumper(pre + '_bumpR', y1 + 0.04, 1.7, 0.42, t=0.12, h=0.12)
        rbox(pre + '_handle', (0.04, 0.16, 0.05), (-W_ / 2 - 0.02, cab_y[0] + 0.62, 0.98), chrome(), r=0.02,
             origin='center')
        cyl(pre + '_exh', 0.04, 0.16, (-0.55, y1 + 0.02, 0.32), rot=(90, 0, 0), mat=chrome(), segs=12,
            origin='center')
        if kind == 'sedan' and not police:
            for sx in (-1, 1):       # little retro tail fins + a chrome side strip
                rbox(pre + '_fin', (0.08, 0.42, 0.12), (sx * 0.8, y1 - 0.4, 1.02), paint(colour), r=0.04,
                     taper=(0.6, 0.4))
            rbox(pre + '_strip', (0.03, 3.1, 0.04), (-W_ / 2 * 0.985, 0.0, 0.74), chrome(), r=0.015)
        if kind == 'wagon':
            wood = L.stripes('#B5763F', '#9A6236', 14.0, 'Y', soft=0.05)
            for sx in (-1, 1):
                rbox(pre + '_woody', (0.04, 2.3, 0.36), (sx * (W_ / 2 - 0.02), 0.62, 0.6), wood, r=0.02)
                rbox(pre + '_woodyt', (0.05, 2.36, 0.05), (sx * (W_ / 2 - 0.02), 0.62, 0.95), paint('#F2E6C8'),
                     r=0.02)
            cm = chrome()
            for sx in (-0.62, 0.62):
                VL.rail_path(pre + '_rack', [(sx, -0.5, 1.98), (sx, -0.5, 2.06), (sx, 1.5, 2.06), (sx, 1.5, 1.98)],
                             0.02, cm)
            for y in (-0.3, 1.3):
                VL.rod(pre + '_rackx', (-0.62, y, 2.06), (0.62, y, 2.06), 0.02, cm)
            for k, (x, c) in enumerate(((-0.18, '#D9483B'), (0.05, '#F2C230'))):
                rbox(pre + '_ski', (0.1, 2.1, 0.035), (x, 0.5, 2.09), paint(c, 0.4), r=0.015)
            VL.snow_cap(pre + '_snow', 1.1, 0.8, (0.28, 0.3, 2.1), t=0.06, seed=7)
        elif police:
            rbox(pre + '_bar', (1.1, 0.32, 0.1), (0, 0.05, 1.97), paint('#2B2F3A', 0.4), r=0.04)
            B.blinker(pre + '_bR', (-0.3, 0.05, 2.12), '#FF3B30', r=0.12, phase=0, shape='bar')
            B.blinker(pre + '_bB', (0.3, 0.05, 2.12), '#3D8BFF', r=0.12, phase=1, shape='bar')
            sphere(pre + '_siren', 0.07, (0, 0.05, 2.1), chrome(), segs=12, rings=6)
            import town_lib as TL
            TL.emblem_at(pre + '_star', TL.em_star, (-W_ / 2 - 0.03, 0.18, 0.72), psi=-90.0, scale=0.42)
            TL.emblem_at(pre + '_starF', TL.em_star, (0, y0 - 0.04, 0.82), psi=0.0, scale=0.22)
        else:
            VL.snow_cap(pre + '_snow', 1.05, 1.1, (0.1, (cab_y[0] + cab_y[1]) / 2 + 0.1, 1.97), t=0.07, seed=5)
        VL.snowflake_badge(pre + '_badge', (0, y0 - 0.04, 0.8), r=0.075, psi=0.0,
                           bg=hexmix(colour if not police else '#2E4F8A', '#FFFFFF', 0.15))
        L.point_light(pre + '_inlight', (0, (cab_y[0] + cab_y[1]) / 2, 1.75), 'window', 7.0, 0.3)

    collect(B, build)

    def build_interior():
        rbox(pre + '_dash', (1.5, 0.22, 0.14), (0, cab_y[0] + 0.14, 1.06), flat('#E9DCC2', 0.6), r=0.05)
        steering(pre + '_swheel', (-0.4, cab_y[0] + 0.3, 1.36))
    interior(B, collect(B, build_interior))
    sz, ceil = 0.64, 1.92
    rows = [cab_y[0] + 0.44] + ([cab_y[0] + 1.32] if kind != 'pickup' else [])
    k = 0
    for yf in rows:
        for sx in (-0.4, 0.4):
            B.seat((sx, yf, sz), (0, -1, 0), name='%s_seat%d' % (pre, k), cushion='#E8E0CE', back_h=0.8,
                   ceiling=ceil)
            k += 1
    interior(B, [o for o in B.body.children if o.name.startswith(pre + '_seat')])
    car_panes(B, pre, cab)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.75, y, wr), wr, w=0.27, hub='#F4F1EA', holes=3, name=pre + '_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.6, y0 - 0.02, 0.82), many=True)
        B.point('tailPoints', (sx * 0.64, y1 + 0.02, 0.84), many=True)
    B.point('exhaustPoint', (-0.55, y1 + 0.12, 0.32))
    B.point('doorPoints', (-1.3, cab_y[0] + 0.45, 0.0), many=True)
    B.point('doorPoints', (1.3, cab_y[0] + 0.45, 0.0), many=True)
    if kind == 'pickup':
        B.point('cargoPoint', (0.0, y1 - 0.8, 0.9))
    elif kind == 'wagon':
        B.point('cargoPoint', (0.0, 0.5, 2.12))
    if police:
        B.point('sirenPoint', (0, 0.05, 2.2))
    B.driver_wheel = Vector((-0.4, cab_y[0] + 0.3, 1.36))
    return B


CAR_NOTES = {
    'car_b': 'Retro round sedan (3.9 m): rounded bonnet + boot, little tail fins, chrome grille and bumpers, round '
             'lamps, cream roof with snow, whitewall hubs. 4 seats (seat 0 = driver, right front).',
    'car_c': 'Round pickup (4.0 m): short two-seat cab, open wooden bed with a rolled green tarp at the cab; the '
             'bed is free for the game cargo stack (cargoPoint). 2 seats (seat 0 = driver).',
    'car_d': 'Woody wagon (4.1 m): long cabin with three side windows, wood side panels, a roof rack with two '
             'skis and snow (cargoPoint = on the rack). 4 seats (seat 0 = driver).',
}
CAR_KIND = {'car_b': 'sedan', 'car_c': 'pickup', 'car_d': 'wagon'}

for _fam in ('car_b', 'car_c', 'car_d'):
    for _c, _hex in CAR_COLOURS[_fam]:
        veh('%s_%s' % (_fam, _c), 3, motor(idle=2, move=4), notes=CAR_NOTES[_fam] + ' Colour variant: %s.' % _c,
            family=_fam, variant=_c)((lambda k, h, kd: (lambda: b_bonnet_car(k, h, kd)))('%s_%s' % (_fam, _c),
                                                                                           _hex, CAR_KIND[_fam]))


def emergency_anims():
    a = motor(idle=2, move=4)
    a['move']['blink'] = True
    a['siren'] = dict(frames=4, fps=8, repeat=-1, bob=[0, 0, 0, 0], spin=False, blink=True, smoke=False)
    return a


POLICE_NOTE = ('Police car (3.9 m, the round sedan body): white with a navy skirt and roof, gold pinstripe, the '
               'police-box star badge on the door and the nose, a red / blue light bar. idle = parked (lights off), '
               'move = driving with the beacons blinking, siren = standing with the beacons blinking. 4 seats.')


@veh('police_car', 3, emergency_anims(), notes=POLICE_NOTE)
def b_police_car():
    return b_bonnet_car('police_car', '#F6F3EC', 'sedan', scheme='police')


# =========================================================================== truck_cargo (+ the chief)

TRUCK_NOTE = ('Retro delivery truck (5.4 m): sunny yellow round cab with a cream roof + snow, chrome grille and round '
              'lamps on the front fenders, the Frost Village snowflake on the door, a wooden cargo bed with green '
              'stake sides (cargoPoint = middle of the bed, where the game stacks the goods for the neighbour town). '
              '2 seats (seat 0 = driver, right).')
TRUCK_CHIEF_NOTE = ('truck_cargo with the CHIEF (assets/characters player: white fur parka, brown belt) driving: '
                    'idle = he smiles and waves out of the cab, move = hands on the wheel. Seat 0 is taken (baked); '
                    'seats lists the free passenger seat only.')


def b_truck(key, chief=False):
    B = VL.VB(key)
    B.length, B.width, B.height = 5.5, 2.0, 2.4
    yel, cream = '#F2C230', '#F7EDD6'
    W_ = 2.0
    wr = 0.45
    ax = (-1.95, 1.75)
    cab = {}

    def build():
        rbox('tr_frame', (1.2, 4.9, 0.22), (0, 0.2, 0.42), flat('#2B2F3A', 0.5), r=0.05)
        VL.shell('tr_bonnet', (1.5, 1.35, 0.82), (0, -2.08, 0.6), paint(yel), r=0.34, hollow=False,
                 arches=[(ax[0], wr + 0.02, 0.55, -1.3, 1.3)])
        for sx in (-1, 1):
            VL.shell('tr_fender', (0.56, 1.3, 0.62), (sx * 0.74, -1.95, 0.45), paint(yel), r=0.26, hollow=False,
                     arches=[(ax[0], wr + 0.02, 0.54, -1.3, 1.3)])
        VL.wheel_well('tr_wellF', ax[0], wr, 0.53, 0.9)
        cab.update(car_cabin(B, 'tr_cab', yel, -1.45, -0.18, 1.18, 2.32, 1.9, 0.3, roof_col=cream,
                             wins=[(-1.1, -0.42)], roof_split=0.98))
        rbox('tr_cablow', (1.9, 1.27, 0.85), (0, -0.815, 0.48), paint(yel), r=0.22)
        rbox('tr_grille', (0.8, 0.1, 0.52), (0, -2.76, 0.66), chrome(), r=0.08)
        for k in range(4):
            rbox('tr_slot', (0.62, 0.04, 0.045), (0, -2.82, 0.74 + 0.1 * k), flat('#2B2F3A', 0.6), r=0.02)
        VL.snowflake_badge('tr_nose', (0, -2.78, 1.3), r=0.1, psi=0.0)
        rbox('tr_hoodstrip', (0.08, 1.2, 0.04), (0, -2.08, 1.42), chrome(), r=0.02)
        for sx in (-1, 1):
            VL.headlamp('tr_head', (sx * 0.74, -2.6, 0.86), r=0.15, facing=-1)
            VL.mirror_arm('tr_mir', (sx * 0.95, -1.4, 1.35), out=sx)
        VL.bumper('tr_bumpF', -2.82, 1.9, 0.56)
        VL.snowflake_badge('tr_door', (-W_ / 2 - 0.02, -0.8, 1.02), r=0.17, psi=-90.0)
        VL.snow_cap('tr_snow', 1.2, 0.8, (0.1, -0.85, 2.31), t=0.07, seed=9)
        # cargo bed
        zd = 0.98
        rbox('tr_deck', (W_, 2.95, 0.1), (0, 1.32, zd - 0.1), L.stripes('#D9AA70', '#C4935A', 10.0, 'X', soft=0.04),
             r=0.02)
        gm = L.stripes('#3E8E57', '#357A4A', 6.0, 'Z', soft=0.05)
        for sx in (-1, 1):
            rbox('tr_side', (0.06, 2.95, 0.32), (sx * (W_ / 2 - 0.03), 1.32, zd), gm, r=0.02)
            for y in (0.0, 0.9, 1.8, 2.7):
                rbox('tr_stake', (0.08, 0.08, 0.46), (sx * (W_ / 2), y, zd - 0.06), flat('#8A5A33', 0.7), r=0.02)
        rbox('tr_front', (W_, 0.06, 0.5), (0, -0.12, zd), gm, r=0.02)
        rbox('tr_tailg', (W_, 0.06, 0.32), (0, 2.77, zd), gm, r=0.02)
        VL.snow_cap('tr_bedsnow', 0.5, 0.36, (0.62, 2.45, zd), t=0.05, seed=10)
        VL.wheel_well('tr_wellR', ax[1], wr, 0.5, 0.92)
        for sx in (-1, 1):
            rbox('tr_mud', (0.5, 0.05, 0.42), (sx * 0.72, ax[1] + 0.58, 0.2), flat('#2B2F3A', 0.6), r=0.02)
            VL.taillamp('tr_tail', (sx * 0.86, 2.82, 0.78), r=0.075, facing=1)
            rbox('tr_rfender', (0.42, 1.15, 0.1), (sx * 0.78, ax[1], 0.74), paint(yel), r=0.04)
        VL.bumper('tr_bumpR', 2.86, 1.9, 0.6, mat=flat('#2B2F3A', 0.5))
        cyl('tr_exh', 0.05, 0.2, (-0.7, 2.6, 0.34), rot=(90, 0, 0), mat=chrome(), segs=12, origin='center')
        L.point_light('tr_inlight', (0, -0.8, 2.0), 'window', 8.0, 0.3)
    collect(B, build)

    def build_interior():
        rbox('tr_dash', (1.7, 0.22, 0.16), (0, -1.32, 1.12), flat('#E9DCC2', 0.6), r=0.05)
        steering('tr_swheel', (-0.45, -1.15, 1.42), r=0.17)
    interior(B, collect(B, build_interior))
    sz, ceil = 0.95, 2.26
    for k, sx in enumerate((-0.45, 0.45)):
        B.seat((sx, -1.0, sz), (0, -1, 0), name='tr_seat%d' % k, cushion='#8A5A33', back_h=0.8,
               proxy=not (chief and k == 0), ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('tr_seat')])
    car_panes(B, 'tr', cab)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.8, y, wr), wr, w=0.3, hub='#F4F1EA', holes=3, name='tr_wh')
    if chief:
        rig = VL.crew('player', (-0.45, -1.0, sz), B.body)
        B.rigs.append(rig)
        wheel_c = Vector((-0.45, -1.15, 1.42))

        def hook(anim, i, n):
            bpy.context.view_layer.update()
            ww = B.body.matrix_world @ wheel_c
            wave = anim == 'idle' and i in (1, 2)
            VL.pose_driver(rig, ww, anim, i, n, wave=wave,
                           face='face_happy' if (wave or (anim == 'move' and i == 2)) else 'face_smile')
        B.hooks.append(hook)
        B.seats = B.seats[1:]
        B.driver_seat = None
        B.crew_note = {'driver': 'player', 'seat': 'driver (right front), baked'}
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.74, -2.68, 0.86), many=True)
        B.point('tailPoints', (sx * 0.86, 2.86, 0.78), many=True)
    B.point('exhaustPoint', (-0.7, 2.72, 0.34))
    B.point('doorPoints', (-1.4, -0.8, 0.0), many=True)
    B.point('doorPoints', (1.4, -0.8, 0.0), many=True)
    B.point('cargoPoint', (0.0, 1.3, 0.9))
    B.driver_wheel = Vector((-0.45, -1.15, 1.42))
    return B


TRUCK_ANIMS = motor(idle=2, move=4)
CHIEF_ANIMS = motor(idle=4, move=4, idle_bob=[0, 1, 0, 1])
veh('truck_cargo', 3, TRUCK_ANIMS, notes=TRUCK_NOTE)(lambda: b_truck('truck_cargo'))
veh('truck_cargo_chief', 3, CHIEF_ANIMS, notes=TRUCK_NOTE + ' ' + TRUCK_CHIEF_NOTE, family='truck_cargo',
    variant='chief')(lambda: b_truck('truck_cargo_chief', chief=True))


# =========================================================================== fire truck

FIRE_NOTE = ('Fire engine (6.2 m): red cab-forward toy fire truck with a white stripe and gold trim, side lockers '
             'with chrome handles, a silver ladder on the roof, a hose reel, a gold bell on the nose and two red '
             'beacons on the cab. idle = parked (lights off), move = beacons blinking, siren = standing, blinking. '
             '2 seats in the cab (seat 0 = driver).')


@veh('fire_truck', 3, emergency_anims(), notes=FIRE_NOTE)
def b_fire_truck():
    B = VL.VB('fire_truck')
    B.length, B.width, B.height = 6.3, 2.1, 2.95
    red, white, gold = '#D9483B', '#F6F3EC', '#E2B33C'
    W_ = 2.1
    wr = 0.48
    ax = (-1.95, 1.85)
    cab = {}

    def build():
        bm = VL.band_paint('ft_paint', [(-9, red), (0.62, white), (0.74, red)])
        cuts = [(-W_ / 2 - 0.2, -W_ / 2 + 0.2, -2.78, -2.02, 1.42, 2.08, 0.08),
                (W_ / 2 - 0.2, W_ / 2 + 0.2, -2.78, -2.02, 1.42, 2.08, 0.08),
                (-0.92, 0.92, -3.3, -2.9, 1.4, 2.1, 0.1)]
        VL.shell('ft_cab', (W_, 1.4, 1.95), (0, -2.4, 0.46), bm, r=0.32, wall=0.06, inner=flat('#E9DCC2', 0.8),
                 frame_mat=paint('#F4F1EA', 0.4), cuts=cuts, arches=[(ax[0], wr + 0.02, 0.58, -1.3, 1.3)])
        VL.shell('ft_body', (W_, 4.45, 1.55), (0, 0.85, 0.46), bm, r=0.22, hollow=False,
                 arches=[(ax[1], wr + 0.02, 0.58, -1.3, 1.3)])
        VL.wheel_well('ft_wellF', ax[0], wr, 0.56, 0.98)
        VL.wheel_well('ft_wellR', ax[1], wr, 0.56, 0.98)
        cm = chrome()
        for k, (y0_, y1_) in enumerate(((-1.5, -0.35), (-0.2, 1.1), (2.45, 2.95))):
            rbox('ft_locker', (0.04, y1_ - y0_, 0.62), (-W_ / 2 - 0.01, (y0_ + y1_) / 2, 1.18), paint('#C23F33'),
                 r=0.03)
            rbox('ft_lockh', (0.05, 0.22, 0.05), (-W_ / 2 - 0.035, (y0_ + y1_) / 2, 1.42), cm, r=0.02)
        # hose reel on the right side
        cyl('ft_reel', 0.34, 0.2, (-W_ / 2 - 0.08, 1.8, 1.1), rot=(0, 90, 0), mat=paint(gold, 0.3), segs=28,
            origin='center')
        cyl('ft_hose', 0.29, 0.22, (-W_ / 2 - 0.08, 1.8, 1.1), rot=(0, 90, 0), mat=paint('#E8E2D2', 0.6), segs=28,
            origin='center')
        cyl('ft_reelc', 0.08, 0.26, (-W_ / 2 - 0.08, 1.8, 1.1), rot=(0, 90, 0), mat=cm, segs=14, origin='center')
        # ladder on the roof
        for sx in (-0.38, 0.38):
            VL.rod('ft_lrail', (sx, -1.25, 2.12), (sx, 3.05, 2.12), 0.035, cm)
        for k in range(10):
            y = -1.1 + 4.0 * k / 9
            VL.rod('ft_rung', (-0.38, y, 2.12), (0.38, y, 2.12), 0.025, cm)
        for y in (-1.0, 2.8):
            rbox('ft_lsup', (0.9, 0.12, 0.12), (0, y, 2.0), paint('#2B2F3A', 0.5), r=0.03)
        # front: grille, lamps, bell, bumper
        rbox('ft_grille', (1.0, 0.08, 0.42), (0, -3.11, 0.66), cm, r=0.08)
        for k in range(3):
            rbox('ft_slot', (0.82, 0.04, 0.05), (0, -3.16, 0.74 + 0.1 * k), flat('#2B2F3A', 0.6), r=0.02)
        for sx in (-1, 1):
            VL.headlamp('ft_head', (sx * 0.72, -3.1, 0.78), r=0.14, facing=-1)
            VL.taillamp('ft_tail', (sx * 0.86, 3.08, 0.8), r=0.08, facing=1)
            VL.mirror_arm('ft_mir', (sx * 1.04, -2.95, 1.55), out=sx)
        sphere('ft_bell', 0.16, (0.0, -3.22, 1.15), paint(gold, 0.22), scale=(1, 1, 1.05), segs=18, rings=10)
        cyl('ft_bellmount', 0.03, 0.2, (0, -3.15, 1.25), mat=cm, segs=8)
        VL.bumper('ft_bumpF', -3.18, 2.0, 0.55)
        VL.bumper('ft_bumpR', 3.12, 2.0, 0.55, mat=flat('#2B2F3A', 0.5))
        rbox('ft_cabtop', (1.2, 0.36, 0.1), (0, -2.5, 2.4), paint('#2B2F3A', 0.4), r=0.04)
        import town_lib as TL
        TL.emblem_at('ft_em', lambda s_: TL.em_helmet(s_, col='#F2C14E'), (-W_ / 2 - 0.03, -2.4, 1.1), psi=-90.0,
                     scale=0.42)
        VL.snow_cap('ft_snow', 0.8, 0.6, (0.4, 2.2, 2.0), t=0.05, seed=11)
        L.point_light('ft_inlight', (0, -2.4, 2.0), 'window', 8.0, 0.3)
    collect(B, build)
    B.blinker('ft_bL', (-0.4, -2.5, 2.56), '#FF3B30', r=0.13, phase=0)
    B.blinker('ft_bR', (0.4, -2.5, 2.56), '#FF3B30', r=0.13, phase=1)

    def build_interior():
        rbox('ft_dash', (1.8, 0.22, 0.16), (0, -2.92, 1.18), flat('#E9DCC2', 0.6), r=0.05)
        steering('ft_swheel', (-0.48, -2.72, 1.5), r=0.18)
    interior(B, collect(B, build_interior))
    sz, ceil = 0.9, 2.34
    for k, sx in enumerate((-0.48, 0.48)):
        B.seat((sx, -2.55, sz), (0, -1, 0), name='ft_seat%d' % k, cushion='#2B2F3A', back_h=0.8, ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('ft_seat')])
    B.side_window('ft_pR', -W_ / 2 + 0.03, -2.78, -2.02, 1.42, 2.08, side=-1)
    B.side_window('ft_pL', W_ / 2 - 0.03, -2.78, -2.02, 1.42, 2.08, side=1, glint=False)
    B.end_window('ft_pW', -3.07, -0.92, 0.92, 1.4, 2.1, end=-1)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.85, y, wr), wr, w=0.32, hub='#F4F1EA', holes=3, name='ft_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.72, -3.18, 0.78), many=True)
        B.point('tailPoints', (sx * 0.86, 3.12, 0.8), many=True)
    B.point('sirenPoint', (0, -2.5, 2.7))
    B.point('exhaustPoint', (-0.8, 3.15, 0.36))
    B.point('doorPoints', (-1.5, -2.4, 0.0), many=True)
    B.point('doorPoints', (1.5, -2.4, 0.0), many=True)
    B.point('hosePoint', (-1.2, 1.8, 1.1))
    B.driver_wheel = Vector((-0.48, -2.72, 1.5))
    return B


# =========================================================================== ambulance

AMB_NOTE = ('Ambulance (4.9 m): round cream-white toy van with a red stripe, the clinic red heart-plus emblem on '
            'the side and the rear doors, a red / white light bar. idle = parked (lights off), move = beacons '
            'blinking, siren = standing, blinking. 2 seats in the cab (seat 0 = driver); rearDoorPoint = where a '
            'stretcher / patient gets in.')


@veh('ambulance', 3, emergency_anims(), notes=AMB_NOTE)
def b_ambulance():
    import town_lib as TL
    B = VL.VB('ambulance')
    B.length, B.width, B.height = 4.9, 1.96, 2.55
    white, red = '#F6F2EA', '#D9483B'
    W_ = 1.96
    wr = 0.42
    ax = (-1.5, 1.5)

    def build():
        bm = VL.band_paint('am_paint', [(-9, white), (0.6, red), (0.78, white)])
        cuts = [(-W_ / 2 - 0.2, -W_ / 2 + 0.2, -1.42, -0.62, 1.32, 1.95, 0.08),
                (W_ / 2 - 0.2, W_ / 2 + 0.2, -1.42, -0.62, 1.32, 1.95, 0.08),
                (-0.84, 0.84, -1.95, -1.6, 1.3, 1.98, 0.1),
                (-0.6, -0.12, 2.25, 2.6, 1.45, 1.9, 0.06), (0.12, 0.6, 2.25, 2.6, 1.45, 1.9, 0.06)]
        VL.shell('am_body', (W_, 4.1, 1.95), (0, 0.38, 0.45), bm, r=0.34, wall=0.06, inner=flat('#E9DCC2', 0.8),
                 frame_mat=paint('#F4F1EA', 0.4), cuts=cuts,
                 arches=[(ax[0], wr + 0.02, 0.52, -1.3, 1.3), (ax[1], wr + 0.02, 0.52, -1.3, 1.3)])
        VL.shell('am_nose', (1.7, 0.85, 0.72), (0, -1.95, 0.48), paint(white), r=0.3, hollow=False,
                 arches=[(ax[0], wr + 0.02, 0.5, -1.3, 1.3)])
        rbox('am_wall', (W_ - 0.1, 0.06, 1.8), (0, -0.5, 0.5), flat('#E9DCC2', 0.8), r=0.02)
        VL.wheel_well('am_wellF', ax[0], wr, 0.5, 0.9)
        VL.wheel_well('am_wellR', ax[1], wr, 0.5, 0.9)
        TL.emblem_at('am_em', TL.em_heart_plus, (-W_ / 2 - 0.03, 0.95, 1.55), psi=-90.0, scale=0.85)
        TL.emblem_at('am_emB', TL.em_heart_plus, (0.0, 2.45, 1.08), psi=180.0, scale=0.45)
        rbox('am_doorline', (0.03, 0.03, 1.55), (0, 2.44, 0.55), flat('#B9B4AA', 0.6), r=0.01)
        for sx in (-1, 1):
            VL.headlamp('am_head', (sx * 0.6, -2.35, 0.82), r=0.14, facing=-1)
            VL.taillamp('am_tail', (sx * 0.84, 2.42, 0.85), r=0.08, facing=1)
            VL.mirror_arm('am_mir', (sx * 0.98, -1.5, 1.32), out=sx)
        rbox('am_grille', (0.8, 0.08, 0.2), (0, -2.38, 0.55), chrome(), r=0.07)
        VL.bumper('am_bumpF', -2.42, 1.8, 0.48)
        VL.bumper('am_bumpR', 2.48, 1.8, 0.48)
        rbox('am_bar', (1.2, 0.3, 0.1), (0, -1.15, 2.39), paint('#2B2F3A', 0.4), r=0.04)
        VL.snow_cap('am_snow', 1.1, 1.3, (0.1, 1.0, 2.39), t=0.06, seed=12)
        L.point_light('am_inlight', (0, -1.0, 2.0), 'window', 7.0, 0.3)
    collect(B, build)
    B.blinker('am_bR', (-0.32, -1.15, 2.54), '#FF3B30', r=0.12, phase=0, shape='bar')
    B.blinker('am_bW', (0.32, -1.15, 2.54), '#FFF4D6', r=0.12, phase=1, shape='bar', off='#C9C3B8')

    def build_interior():
        rbox('am_dash', (1.6, 0.22, 0.15), (0, -1.6, 1.1), flat('#E9DCC2', 0.6), r=0.05)
        steering('am_swheel', (-0.42, -1.42, 1.4), r=0.16)
    interior(B, collect(B, build_interior))
    sz, ceil = 0.8, 2.32
    for k, sx in enumerate((-0.42, 0.42)):
        B.seat((sx, -1.2, sz), (0, -1, 0), name='am_seat%d' % k, cushion='#3D7CC9', back_h=0.8, ceiling=ceil)
    interior(B, [o for o in B.body.children if o.name.startswith('am_seat')])
    B.side_window('am_pR', -W_ / 2 + 0.03, -1.42, -0.62, 1.32, 1.95, side=-1)
    B.side_window('am_pL', W_ / 2 - 0.03, -1.42, -0.62, 1.32, 1.95, side=1, glint=False)
    B.end_window('am_pW', -1.6, -0.84, 0.84, 1.3, 1.98, end=-1)
    B.end_window('am_pB1', 2.41, -0.6, -0.12, 1.45, 1.9, end=1)
    B.end_window('am_pB2', 2.41, 0.12, 0.6, 1.45, 1.9, end=1, glint=False)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.78, y, wr), wr, w=0.28, hub='#F4F1EA', holes=3, name='am_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.6, -2.42, 0.82), many=True)
        B.point('tailPoints', (sx * 0.84, 2.46, 0.85), many=True)
    B.point('sirenPoint', (0, -1.15, 2.62))
    B.point('exhaustPoint', (-0.6, 2.5, 0.34))
    B.point('doorPoints', (-1.4, -1.0, 0.0), many=True)
    B.point('doorPoints', (1.4, -1.0, 0.0), many=True)
    B.point('rearDoorPoint', (0.0, 3.1, 0.0))
    B.driver_wheel = Vector((-0.42, -1.42, 1.4))
    return B
