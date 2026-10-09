"""
lgx_vehicles.py - logistics vehicles (docs/CONTRACT_V8.md section AA) in the assets/vehicles conventions:
toy-like, round, glossy, 1 px ink outline at pack time, NO baked shadow, two rendered axis headings
(SE = world +X, NE = world +Y; SW / NW are flipX mirrors), seats with occlusion proxies (veh_render masks).

  forklift / forklift_loaded   idle 2, move 4 (beacon blinks), lift 6 (carriage + forks rise 0 -> 1.25 m)
  delivery_van_red|blue|mint   idle 2, move 4
  moving_truck                 idle 2, move 4, unload 6 (rear roll door up, ramp slides out + tilts down)
  pallet_jack                  idle 1, move 4 (pushed by a worker; handlePoint for the townfolk2 push pose)

Registry VEH has the veh_models.VEH spec format; lgx_render injects it into veh_models.VEH at run time and renders
with veh_render.render_vehicle() unchanged.  Local frame (veh_lib doc): front = -Y, right side = -X (the side the
camera sees), origin = ground centre of the footprint.

Not run directly - see lgx_render.py.
"""
import math
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector

import prop_lib as L
from prop_lib import flat, box, cyl, sphere, hexmix
import prop_assets as PA
import town_lib as T
import veh_lib as VL
from veh_lib import rbox, paint, chrome
import veh_models as VM
import lgx_lib as X

VEH = OrderedDict()


def veh(key, anims, notes='', samples=24, family=None, variant=None):
    def deco(fn):
        VEH[key] = dict(key=key, fn=fn, era=3, anims=anims, notes=notes, samples=samples, family=family or key,
                        variant=variant, kind='vehicle')
        return fn
    return deco


def anim(frames, fps, repeat=-1, bob=None, spin=False, blink=False, smoke=False):
    return dict(frames=frames, fps=fps, repeat=repeat, bob=bob or [0] * frames, spin=spin, blink=blink, smoke=smoke)


# =========================================================================================== forklift

LIFT = [0.0, 0.25, 0.5, 0.75, 1.0, 1.25]
FORK_Z = 0.1
FORKLIFT_ANIMS = OrderedDict([('idle', anim(2, 6, bob=[0, 1])),
                              ('move', anim(4, 10, bob=[0, 1, 1, 0], spin=True, blink=True)),
                              ('lift', anim(6, 8, repeat=0))])
FORKLIFT_NOTE = ('Toy forklift (2.5 m incl. forks): sunny yellow body, dark counterweight with hazard stripes and the '
                 'Frost Village snowflake, open black overhead guard (no roof snow: it works indoors) and an orange '
                 'beacon, steel mast '
                 'with a hydraulic ram, two forks. Seat 0 = the driver (empty: the game draws a townsfolk in `sit` at '
                 'seats + the over_* overlay). idle = engine shake, move = wheels + beacon blink, lift = 6 frames, '
                 'carriage + forks rise from the ground to 1.25 m (play forward to lift, backward to lower). '
                 'cargoPoint = middle of the forks at frame 0; liftPx[i] = extra screen-y of the forks in lift frame i.')


def b_forklift(key, loaded=False):
    B = VL.VB(key)
    B.length, B.width, B.height = 2.5, 1.16, 2.25
    yel, grey = '#F2C230', '#4A505A'
    wf, wr = 0.3, 0.24
    axf, axr = -0.08, 0.92

    def build():
        rbox('fk_chassis', (1.06, 1.3, 0.4), (0, 0.45, 0.2), paint(yel), r=0.13)
        rbox('fk_cover', (0.98, 0.72, 0.34), (0, 0.62, 0.56), paint(yel), r=0.13)
        rbox('fk_cw', (1.12, 0.42, 0.78), (0, 1.05, 0.22), paint(grey, 0.4), r=0.18)
        box('fk_cwhaz', (1.13, 0.43, 0.12), (0, 1.05, 0.34), mat=X.hazard(X.LINE_YEL, X.INK, 5.0, 45.0, ('X', 'Z')),
            bevel=0.03)
        VL.snowflake_badge('fk_badge', (-0.57, 1.0, 0.75), r=0.12, psi=-90.0)
        rbox('fk_dash', (0.86, 0.24, 0.42), (0, -0.05, 0.5), paint(yel), r=0.09)
        rbox('fk_step', (0.3, 0.3, 0.06), (-0.5, 0.3, 0.2), flat('#3B3F48', 0.6), r=0.02)
        gm = flat('#2B2F3A', 0.45, 0.2)
        posts = [((-0.5, -0.02, 0.62), (-0.5, 0.06, 2.08)), ((0.5, -0.02, 0.62), (0.5, 0.06, 2.08)),
                 ((-0.5, 1.02, 0.98), (-0.5, 0.95, 2.08)), ((0.5, 1.02, 0.98), (0.5, 0.95, 2.08))]
        for k, (p, q) in enumerate(posts):
            VL.rod('fk_post%d' % k, p, q, 0.04, gm)
        VL.rail_path('fk_top', [(-0.5, 0.06, 2.08), (0.5, 0.06, 2.08), (0.5, 0.95, 2.08), (-0.5, 0.95, 2.08),
                                (-0.5, 0.06, 2.08)], 0.04, gm)
        for x in (-0.25, 0.0, 0.25):
            VL.rod('fk_bar', (x, 0.06, 2.1), (x, 0.95, 2.1), 0.025, gm)
        # (polish) no snow cap on the overhead guard: the forklift works indoors (it read as a white lid)
        cyl('fk_beacon_b', 0.06, 0.05, (0.3, 0.75, 2.12), mat=flat('#2B2F3A', 0.5), segs=12)
        # mast (outer channels, cross bars, hydraulic ram)
        mm = flat('#5A606B', 0.35, 0.55)
        for sx in (-1, 1):
            rbox('fk_mast', (0.09, 0.11, 2.0), (sx * 0.3, -0.36, 0.1), mm, r=0.02)
        rbox('fk_mtop', (0.7, 0.12, 0.09), (0, -0.36, 2.02), mm, r=0.02)
        rbox('fk_mmid', (0.7, 0.1, 0.07), (0, -0.33, 1.05), mm, r=0.02)
        cyl('fk_ram', 0.05, 1.25, (0, -0.27, 0.14), mat=chrome(), segs=14, bevel=0.01)
        cyl('fk_ramc', 0.07, 0.5, (0, -0.27, 0.12), mat=mm, segs=14, bevel=0.01)
        for sx in (-1, 1):
            VL.headlamp('fk_lamp', (sx * 0.5, -0.06, 1.95), r=0.07, facing=-1, depth=0.06)
            VL.taillamp('fk_tail', (sx * 0.42, 1.27, 0.85), r=0.05, facing=1)
        cyl('fk_exh', 0.035, 0.35, (0.42, 1.12, 1.0), mat=chrome(), segs=10, bevel=0.0)
    VM.collect(B, build)
    B.blinker('fk_beacon', (0.3, 0.75, 2.22), '#FF8A1A', r=0.08, phase=0, off='#C9762E', strength=5.0)

    def build_interior():
        steering_col = VM.steering('fk_swheel', (0.0, 0.05, 1.22), r=0.15)
        del steering_col
    VM.interior(B, VM.collect(B, build_interior))
    B.seat((0.0, 0.36, 0.9), (0, -1, 0), name='fk_seat0', cushion='#2B2F3A', back_h=0.55, w=0.6, ceiling=2.04)
    VM.interior(B, [o for o in B.body.children if o.name.startswith('fk_seat')])
    # carriage + forks (+ pallet when loaded) -> one group that rises in the lift anim
    with L.Collect() as c:
        cm = flat('#3B3F48', 0.4, 0.5)
        rbox('fk_plate', (0.72, 0.08, 0.36), (0, -0.46, FORK_Z), cm, r=0.02)
        for k in range(5):
            x = -0.3 + 0.15 * k
            rbox('fk_back', (0.035, 0.035, 0.62), (x, -0.47, FORK_Z + 0.32), cm, r=0.01)
        rbox('fk_backtop', (0.72, 0.05, 0.05), (0, -0.47, FORK_Z + 0.92), cm, r=0.015)
        for sx in (-1, 1):
            rbox('fk_tine', (0.12, 0.88, 0.05), (sx * 0.22, -0.92, FORK_Z - 0.02), flat('#2E323C', 0.4, 0.5), r=0.015)
            rbox('fk_shank', (0.12, 0.05, 0.4), (sx * 0.22, -0.5, FORK_Z - 0.02), flat('#2E323C', 0.4, 0.5), r=0.015)
        if loaded:
            X.pallet('fk_pal', 0.74, 0.74, 0.12, loc=(0, -0.92, FORK_Z + 0.03))
            k = 0
            for x in (-0.18, 0.18):
                for y in (-0.18, 0.18):
                    X.cardboard_box('fk_bx%d' % k, 0.34, 0.34, 0.24, loc=(x, -0.92 + y, FORK_Z + 0.15),
                                    label=(k == 0), seed=k)
                    k += 1
            X.cardboard_box('fk_bxt', 0.36, 0.34, 0.22, loc=(-0.1, -0.95, FORK_Z + 0.39), rot_z=6, label=True)
            box('fk_strap', (0.05, 0.76, 0.012), (0.12, -0.92, FORK_Z + 0.4), mat=flat('#3D7CC9', 0.5), bevel=0.0)
    car = L.group([o for o in c.objs if o.parent is None], 'fk_carriage')
    car.parent = B.body
    car.rotation_mode = 'XYZ'

    def hook(anim_, i, n):
        car.location.z = LIFT[i] if anim_ == 'lift' else 0.0
    B.hooks.append(hook)
    for y, r in ((axf, wf), (axr, wr)):
        for sx in (-1, 1):
            B.add_wheel((sx * 0.46, y, r), r, w=0.24, hub='#F4F1EA', holes=3, name='fk_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.5, -0.12, 1.95), many=True)
        B.point('tailPoints', (sx * 0.42, 1.3, 0.85), many=True)
    B.point('exhaustPoint', (0.42, 1.12, 1.4))
    B.point('cargoPoint', (0.0, -0.92, FORK_Z + 0.03 + (0.6 if loaded else 0.0)))
    B.point('forkTipPoint', (0.0, -1.36, FORK_Z))
    B.point('doorPoints', (-0.95, 0.3, 0.0), many=True)
    B.point('doorPoints', (0.95, 0.3, 0.0), many=True)
    B.point('sirenPoint', (0.3, 0.75, 2.22))
    B.driver_wheel = Vector((0.0, 0.05, 1.22))
    return B


veh('forklift', FORKLIFT_ANIMS, notes=FORKLIFT_NOTE)(lambda: b_forklift('forklift'))
veh('forklift_loaded', FORKLIFT_ANIMS, notes=FORKLIFT_NOTE + ' Variant _loaded: a pallet of parcels on the forks '
                                                             '(rises with the forks; cargoPoint = top of the load).',
    family='forklift', variant='loaded')(lambda: b_forklift('forklift_loaded', loaded=True))


# =========================================================================================== delivery van

VAN_COLOURS = [('red', '#D9483B'), ('blue', '#3D7CC9'), ('mint', '#4FB79B')]
VAN_NOTE = ('Retro delivery van (4.4 m): round bread-van body in %s with a cream roof + snow, a short rounded nose '
            'with frog-eye chrome lamps and a smile grille, the logistics parcel-with-wings emblem on the side, '
            'two rear doors with little round windows. 2 seats (seat 0 = driver, right front). rearDoorPoint = '
            'where a worker stands to load / unload at the back; cargoPoint = the rear cargo floor.')


def b_van(key, col):
    B = VL.VB(key)
    B.length, B.width, B.height = 4.4, 1.9, 2.36
    W_, wr = 1.9, 0.38
    ax = (-1.3, 1.35)
    cream = '#F7EDD6'

    def build():
        # body colour, a cream belt pinstripe just under the windows, cream roof
        bm = VL.band_paint(key + '_paint', [(-9, col), (0.64, cream), (0.73, col), (1.5, cream)])
        cuts = [(-W_ / 2 - 0.2, -W_ / 2 + 0.2, -1.6, -0.9, 1.15, 1.72, 0.08),
                (W_ / 2 - 0.2, W_ / 2 + 0.2, -1.6, -0.9, 1.15, 1.72, 0.08),
                (-W_ / 2 + 0.15, W_ / 2 - 0.15, -1.95, -1.55, 1.12, 1.78, 0.1)]
        VL.shell('dv_body', (W_, 3.9, 1.9), (0, 0.2, 0.42), bm, r=0.42, wall=0.06, inner=flat('#E9DCC2', 0.8),
                 frame_mat=paint('#F4F1EA', 0.4), cuts=cuts,
                 arches=[(ax[0], wr + 0.03, 0.48, -1.3, 1.3), (ax[1], wr + 0.03, 0.48, -1.3, 1.3)])
        VL.shell('dv_nose', (1.72, 0.85, 0.72), (0, -1.68, 0.42), paint(col), r=0.3, hollow=False,
                 arches=[(ax[0], wr + 0.03, 0.48, -1.3, 1.3)])
        rbox('dv_wall', (W_ - 0.1, 0.06, 1.75), (0, -0.6, 0.45), flat('#E9DCC2', 0.8), r=0.02)
        VL.wheel_well('dv_wellF', ax[0], wr, 0.48, 0.9)
        VL.wheel_well('dv_wellR', ax[1], wr, 0.48, 0.9)
        for sx in (-1, 1):
            VL.headlamp('dv_head', (sx * 0.58, -2.08, 0.86), r=0.15, facing=-1, depth=0.1)
            VL.taillamp('dv_tail', (sx * 0.82, 2.13, 0.9), r=0.08, facing=1)
            VL.mirror_arm('dv_mir', (sx * 0.96, -1.5, 1.3), out=sx)
        rbox('dv_grille', (0.62, 0.08, 0.18), (0, -2.1, 0.55), chrome(), r=0.07)
        for k in range(2):
            rbox('dv_slot', (0.48, 0.04, 0.03), (0, -2.14, 0.59 + 0.06 * k), flat('#2B2F3A', 0.6), r=0.01)
        VL.bumper('dv_bumpF', -2.14, 1.7, 0.46, t=0.12, h=0.13)
        VL.bumper('dv_bumpR', 2.16, 1.7, 0.46, t=0.12, h=0.13)
        # side emblem (right side) + door seam + handle
        T.emblem_at('dv_em', lambda s=1.0: _parcel_emblem(s), (-W_ / 2 - 0.02, 0.6, 1.1), psi=-90.0, scale=1.1)
        rbox('dv_handle', (0.04, 0.16, 0.05), (-W_ / 2 - 0.02, -0.98, 1.0), chrome(), r=0.02, origin='center')
        rbox('dv_seam', (0.02, 0.02, 1.0), (-W_ / 2 - 0.005, -0.88, 0.55), flat('#2B2F3A', 0.6), r=0.005)
        # rear doors with round windows + handles
        rbox('dv_rseam', (0.02, 0.02, 1.4), (0, 2.13, 0.55), flat('#2B2F3A', 0.6), r=0.005)
        for sx in (-1, 1):
            cyl('dv_rwin', 0.13, 0.03, (sx * 0.45, 2.13, 1.55), rot=(90, 0, 0), mat=paint('#F4F1EA', 0.4), segs=24,
                origin='center', bevel=0.01)
            cyl('dv_rwing', 0.1, 0.035, (sx * 0.45, 2.135, 1.55), rot=(90, 0, 0), mat=flat(VL.FROST, 0.2), segs=24,
                origin='center', bevel=0.0)
            rbox('dv_rh', (0.05, 0.04, 0.14), (sx * 0.1, 2.16, 1.05), chrome(), r=0.015)
        VL.snow_cap('dv_snow', 1.3, 2.6, (0.05, 0.4, 2.31), t=0.07, seed=7)
        cyl('dv_exh', 0.04, 0.16, (-0.55, 2.2, 0.32), rot=(90, 0, 0), mat=chrome(), segs=12, origin='center')
        L.point_light('dv_inlight', (0, -1.2, 1.9), 'window', 6.0, 0.3)
    VM.collect(B, build)

    def build_interior():
        rbox('dv_dash', (1.6, 0.22, 0.14), (0, -1.58, 1.08), flat('#E9DCC2', 0.6), r=0.05)
        VM.steering('dv_swheel', (-0.42, -1.4, 1.36))
    VM.interior(B, VM.collect(B, build_interior))
    sz, ceil = 0.86, 2.24
    for k, sx in enumerate((-0.42, 0.42)):
        B.seat((sx, -1.25, sz), (0, -1, 0), name='dv_seat%d' % k, cushion='#8A5A33', back_h=0.8, ceiling=ceil)
    VM.interior(B, [o for o in B.body.children if o.name.startswith('dv_seat')])
    B.side_window('dv_pR', -W_ / 2 + 0.03, -1.6, -0.9, 1.15, 1.72, side=-1)
    B.side_window('dv_pL', W_ / 2 - 0.03, -1.6, -0.9, 1.15, 1.72, side=1, glint=False)
    B.end_window('dv_pW', -1.92, -W_ / 2 + 0.15, W_ / 2 - 0.15, 1.12, 1.78, end=-1)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.78, y, wr), wr, w=0.28, hub='#F4F1EA', holes=3, name='dv_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.58, -2.16, 0.86), many=True)
        B.point('tailPoints', (sx * 0.82, 2.18, 0.9), many=True)
    B.point('exhaustPoint', (-0.55, 2.3, 0.32))
    B.point('doorPoints', (-1.35, -1.2, 0.0), many=True)
    B.point('doorPoints', (1.35, -1.2, 0.0), many=True)
    B.point('rearDoorPoint', (0.0, 2.75, 0.0))
    B.point('cargoPoint', (0.0, 1.5, 0.48))
    B.driver_wheel = Vector((-0.42, -1.4, 1.36))
    return B


def _parcel_emblem(s=1.0):
    """Parcel-with-wings emblem in the sign frame (as the logistics centre's signs)."""
    import lgx_center as LC
    cyl('dvem_disc', 0.36 * s, 0.03, (0, 0.02, 0.0), rot=(90, 0, 0), mat=flat('#F4F1EA', 0.4), segs=32,
        origin='center', bevel=0.008)
    cyl('dvem_rim', 0.4 * s, 0.02, (0, 0.035, 0.0), rot=(90, 0, 0), mat=flat('#F2C230', 0.35), segs=32,
        origin='center', bevel=0.005)
    LC.em_parcel(0.7 * s)


for _c, _hex in VAN_COLOURS:
    veh('delivery_van_' + _c, OrderedDict([('idle', anim(2, 6, bob=[0, 1])),
                                          ('move', anim(4, 10, bob=[0, 1, 1, 0], spin=True))]),
        notes=VAN_NOTE % _c, family='delivery_van', variant=_c)((lambda h, k: (lambda: b_van(k, h)))(_hex,
                                                                                                 'delivery_van_' + _c))


# =========================================================================================== moving truck

DOOR_UP = [0.0, 0.35, 0.7, 0.95, 0.95, 0.95]
RAMP_OUT = [0.0, 0.0, 0.0, 0.5, 1.0, 1.0]
RAMP_TILT = [0.0, 0.0, 0.0, 0.0, 0.0, 1.0]
MOVING_ANIMS = OrderedDict([('idle', anim(2, 6, bob=[0, 1])),
                            ('move', anim(4, 10, bob=[0, 1, 1, 0], spin=True)),
                            ('unload', anim(6, 6, repeat=0))])
MOVING_NOTE = ('Moving truck (6.5 m, 이삿짐 트럭): rounded mint cab with a cream roof + snow, chrome grille and frog-eye '
               'lamps, a tall cream box body with a teal band and a little house-with-a-heart emblem on the side, '
               'moving boxes, a lamp and a sofa inside. 2 seats (seat 0 = driver). unload = 6 frames: the rear roll '
               'door rolls up (0-3), the loading ramp slides out (3-4) and tilts down to the snow (5); play backward to '
               'pack up. rampPoint = ground end of the ramp in frame 5 (movers walk from there up into the box); '
               'cargoPoint = the box floor at the rear.')


def em_house_heart(s=1.0):
    wm = flat('#F4F1EA', 0.5)
    rm = flat('#D9483B', 0.45)
    body = T.ext_xz('mh_body', [(-0.28 * s, -0.3 * s), (0.28 * s, -0.3 * s), (0.28 * s, 0.05 * s), (0.0, 0.3 * s),
                                (-0.28 * s, 0.05 * s)], 0.04, flat('#3FA58C', 0.45), y=0.0)
    del body
    roofp = T.ext_xz('mh_roof', [(-0.36 * s, 0.02 * s), (0.0, 0.36 * s), (0.36 * s, 0.02 * s), (0.3 * s, -0.03 * s),
                                 (0.0, 0.26 * s), (-0.3 * s, -0.03 * s)], 0.05, rm, y=-0.01)
    del roofp
    h = T.ext_xz('mh_heart', [(x * 0.17 * s, y * 0.17 * s - 0.1 * s) for x, y in T.heart_pts(1.0, 28)], 0.03, rm,
                 y=-0.03)
    del h
    box('mh_win', (0.1 * s, 0.03, 0.1 * s), (0.17 * s, -0.045, 0.0), mat=wm, bevel=0.005)


def b_moving_truck(key):
    B = VL.VB(key)
    B.length, B.width, B.height = 6.5, 2.1, 3.05
    mint, cream = '#4FB79B', '#F7EDD6'
    W_, wr = 2.1, 0.44
    ax = (-2.15, 1.75)
    cab = {}
    BOX = (-0.55, 3.1, 0.95, 3.0)          # y0, y1, z0, z1 of the box body
    parts = {}

    def build():
        rbox('mt_frame', (1.2, 5.9, 0.22), (0, 0.1, 0.42), flat('#2B2F3A', 0.5), r=0.05)
        VL.shell('mt_bonnet', (1.6, 1.25, 0.82), (0, -2.55, 0.6), paint(mint), r=0.34, hollow=False,
                 arches=[(ax[0], wr + 0.02, 0.55, -1.3, 1.3)])
        for sx in (-1, 1):
            VL.shell('mt_fender', (0.58, 1.3, 0.62), (sx * 0.78, -2.35, 0.45), paint(mint), r=0.26, hollow=False,
                     arches=[(ax[0], wr + 0.02, 0.54, -1.3, 1.3)])
        VL.wheel_well('mt_wellF', ax[0], wr, 0.53, 0.95)
        cab.update(VM.car_cabin(B, 'mt_cab', mint, -1.9, -0.62, 1.18, 2.4, 2.0, 0.32, roof_col=cream,
                                wins=[(-1.55, -0.85)], roof_split=1.02))
        rbox('mt_cablow', (2.0, 1.28, 0.85), (0, -1.26, 0.48), paint(mint), r=0.22)
        rbox('mt_grille', (0.86, 0.1, 0.52), (0, -3.18, 0.66), chrome(), r=0.08)
        for k in range(4):
            rbox('mt_slot', (0.66, 0.04, 0.045), (0, -3.24, 0.74 + 0.1 * k), flat('#2B2F3A', 0.6), r=0.02)
        for sx in (-1, 1):
            VL.headlamp('mt_head', (sx * 0.78, -3.0, 0.88), r=0.16, facing=-1)
            VL.mirror_arm('mt_mir', (sx * 1.02, -1.85, 1.45), out=sx)
        VL.bumper('mt_bumpF', -3.24, 2.0, 0.56)
        VL.snowflake_badge('mt_door', (-W_ / 2 - 0.02, -1.25, 1.05), r=0.17, psi=-90.0, bg='#F4F1EA', fg='#4FB79B')
        VL.snow_cap('mt_csnow', 1.3, 0.8, (0.1, -1.26, 2.39), t=0.07, seed=9)
        # box body (hollow: open at the rear), teal band, emblem, rear frame
        y0, y1, z0, z1 = BOX
        bandm = VL.band_paint('mt_boxp', [(-9, cream), (0.25, '#3FA58C'), (0.45, cream), (1.75, '#F2EAD8')], rough=0.4)
        VL.shell('mt_box', (W_, y1 - y0, z1 - z0), (0, (y0 + y1) / 2, z0), bandm, r=0.14, wall=0.07,
                 inner=flat('#D9C9A8', 0.85), cuts=[(-W_ / 2 + 0.12, W_ / 2 - 0.12, y1 - 0.2, y1 + 0.2, z0 + 0.1,
                                                     z1 - 0.14, 0.04)],
                 frame_mat=flat('#C9BB9E', 0.6))
        T.emblem_at('mt_em', em_house_heart, (-W_ / 2 - 0.03, 1.3, 2.0), psi=-90.0, scale=1.1)
        fr = flat('#5A606B', 0.4, 0.4)
        for sx in (-1, 1):
            rbox('mt_rpost', (0.1, 0.08, z1 - z0 - 0.1), (sx * (W_ / 2 - 0.08), y1 + 0.02, z0 + 0.05), fr, r=0.02)
        rbox('mt_rtop', (W_ - 0.1, 0.1, 0.16), (0, y1 + 0.02, z1 - 0.2), fr, r=0.03)
        VL.snow_cap('mt_bsnow', 1.6, 3.2, (0.05, (y0 + y1) / 2, z1 - 0.01), t=0.08, seed=10)
        VL.wheel_well('mt_wellR', ax[1], wr, 0.5, 0.96)
        for sx in (-1, 1):
            rbox('mt_mud', (0.5, 0.05, 0.42), (sx * 0.74, ax[1] + 0.6, 0.2), flat('#2B2F3A', 0.6), r=0.02)
            VL.taillamp('mt_tail', (sx * 0.9, y1 + 0.08, 0.8), r=0.08, facing=1)
        VL.bumper('mt_bumpR', y1 + 0.1, 2.0, 0.62, mat=flat('#2B2F3A', 0.5))
        cyl('mt_exh', 0.05, 0.2, (-0.75, 2.7, 0.34), rot=(90, 0, 0), mat=chrome(), segs=12, origin='center')
        # cargo inside the box: moving boxes, a standing lamp, a sofa
        X.cardboard_box('mt_cb1', 0.5, 0.46, 0.44, loc=(-0.5, y1 - 0.45, z0 + 0.06), seed=1)
        X.cardboard_box('mt_cb2', 0.46, 0.42, 0.4, loc=(-0.5, y1 - 0.45, z0 + 0.5), rot_z=6, seed=2)
        X.cardboard_box('mt_cb3', 0.5, 0.46, 0.44, loc=(0.45, y1 - 0.5, z0 + 0.06), seed=3)
        with L.Collect() as cs:
            X.sofa_model('mt_sofa', 1.4, 0.62, '#E8749A')
        L.group(BA_top(cs.objs), 'mt_sofa_g', loc=(0.0, y1 - 1.25, z0 + 0.06), rot=(0, 0, 0))
        cyl('mt_lamp', 0.025, 1.1, (0.62, y1 - 0.95, z0 + 0.06), mat=flat('#2B2F3A', 0.5), segs=8, bevel=0.0)
        cyl('mt_shade', 0.2, 0.25, (0.62, y1 - 0.95, z0 + 1.1), mat=flat('#F2C14E', 0.6), r_top=0.12, segs=18,
            bevel=0.01)
        L.point_light('mt_boxlight', (0, y1 - 1.0, z1 - 0.4), 'window', 25.0, 0.4)
    VM.collect(B, build)
    # roll door (rises) + ramp (slides out, tilts)
    y0, y1, z0, z1 = BOX
    with L.Collect() as cd:
        nb = L.NB('mt_rollup', rough=0.45)
        tc = nb.n('ShaderNodeTexCoord')
        sep = nb.n('ShaderNodeSeparateXYZ')
        nb.link(tc.outputs['Object'], sep.inputs[0])
        v = nb.math('FRACT', nb.math('MULTIPLY', sep.outputs['Z'], 1.0 / 0.14))
        nb.base(nb.mix_rgb(nb.map_range(v, 0.82, 0.92), '#D7DCE3', '#AEB6C1'))
        dh = z1 - z0 - 0.24
        box('mt_rdoor', (W_ - 0.26, 0.04, dh), (0, y1 + 0.0, -dh), mat=nb.m, bevel=0.0)
        rbox('mt_rdh', (0.3, 0.05, 0.05), (0, y1 + 0.04, -dh + 0.15), flat('#2B2F3A', 0.5), r=0.015)
    door_h = z1 - z0 - 0.24
    door_top = z0 + 0.1 + door_h
    door = L.group([o for o in cd.objs if o.parent is None], 'mt_doorg', loc=(0, 0, door_top))
    door.parent = B.body
    with L.Collect() as cr:
        rm = L.stripes('#9AA4B1', '#7F8996', 9.0, 'Y', rough=0.4, soft=0.05)
        box('mt_ramp', (0.95, 1.55, 0.05), (0, 0.775, -0.05), mat=rm, bevel=0.01)
        for sx in (-1, 1):
            box('mt_rampside', (0.04, 1.55, 0.08), (sx * 0.47, 0.775, -0.05), mat=flat('#5A606B', 0.4, 0.4),
                bevel=0.005)
    ramp = L.group([o for o in cr.objs if o.parent is None], 'mt_rampg')
    ramp.parent = B.body
    ramp.rotation_mode = 'XYZ'
    stow_y = y1 - 1.6
    drop = z0 - 0.06

    def hook(anim_, i, n):
        f = i if anim_ == 'unload' else 0
        door.scale = (1.0, 1.0, max(0.03, 1.0 - DOOR_UP[f]))
        ramp.location = (0.0, stow_y + 1.62 * RAMP_OUT[f], z0 - 0.04)
        tilt = RAMP_TILT[f]
        ang = math.asin(min(1.0, drop / 1.55)) * tilt
        ramp.rotation_euler = (-ang, 0.0, 0.0)
        ramp.hide_render = RAMP_OUT[f] <= 0.0
    B.hooks.append(hook)
    hook('idle', 0, 2)

    def build_interior():
        rbox('mt_dash', (1.8, 0.22, 0.16), (0, -1.78, 1.12), flat('#E9DCC2', 0.6), r=0.05)
        VM.steering('mt_swheel', (-0.48, -1.6, 1.42), r=0.17)
    VM.interior(B, VM.collect(B, build_interior))
    sz, ceil = 0.95, 2.34
    for k, sx in enumerate((-0.48, 0.48)):
        B.seat((sx, -1.42, sz), (0, -1, 0), name='mt_seat%d' % k, cushion='#8A5A33', back_h=0.8, ceiling=ceil)
    VM.interior(B, [o for o in B.body.children if o.name.startswith('mt_seat')])
    VM.car_panes(B, 'mt', cab, rear=False)
    for y in ax:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.82, y, wr), wr, w=0.3, hub='#F4F1EA', holes=3, name='mt_wh')
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.78, -3.08, 0.88), many=True)
        B.point('tailPoints', (sx * 0.9, y1 + 0.12, 0.8), many=True)
    B.point('exhaustPoint', (-0.75, 2.85, 0.34))
    B.point('doorPoints', (-1.45, -1.3, 0.0), many=True)
    B.point('doorPoints', (1.45, -1.3, 0.0), many=True)
    B.point('rearDoorPoint', (0.0, y1 + 0.6, 0.0))
    B.point('rampPoint', (0.0, y1 + 1.36, 0.0))
    B.point('cargoPoint', (0.0, y1 - 0.5, z0 + 0.06))
    B.driver_wheel = Vector((-0.48, -1.6, 1.42))
    del parts
    return B


def BA_top(objs):
    import bld_assets as BA
    return BA.top_level(objs)


veh('moving_truck', MOVING_ANIMS, notes=MOVING_NOTE)(lambda: b_moving_truck('moving_truck'))


# =========================================================================================== pallet jack

JACK_ANIMS = OrderedDict([('idle', anim(1, 1, bob=[0])), ('move', anim(4, 10, bob=[0, 0, 0, 0], spin=True))])
JACK_NOTE = ('Hand pallet jack (1.75 m): red pump body with a chrome ram, two long forks with little tip rollers, '
             'small black steering wheels, a tilted tiller with a black loop grip. The worker walks BEHIND the '
             'handle and pushes it forks-first: front = forks. handlePoint[dir] = the grip (px from the anchor); '
             'align a townfolk2 `push` pose with jack anchor = pusher anchor + pushPoint[dir] - handlePoint[dir] '
             '(or use pushOffset[dir] = where the pusher anchor goes for an adult). cargoPoint = middle of the forks '
             '(draw a pallet_* item there).')


def b_pallet_jack(key):
    B = VL.VB(key)
    B.length, B.width, B.height = 1.75, 0.6, 0.95
    red = '#D9483B'

    def build():
        fm = paint(red, 0.4)
        for sx in (-1, 1):
            rbox('pj_fork', (0.17, 1.12, 0.075), (sx * 0.2, -0.36, 0.03), fm, r=0.02)
        rbox('pj_pump', (0.5, 0.3, 0.32), (0, 0.32, 0.05), fm, r=0.08)
        cyl('pj_ram', 0.045, 0.18, (0, 0.34, 0.36), mat=chrome(), segs=12, bevel=0.005)
        rbox('pj_head', (0.14, 0.12, 0.1), (0, 0.38, 0.48), fm, r=0.03)
        VL.rail_path('pj_tiller', [(0, 0.4, 0.55), (0, 0.62, 0.72), (0, 0.78, 0.8)], 0.025, flat('#3B3F48', 0.4, 0.4))
        mb = L.MB()
        gm = flat('#2B2F3A', 0.55)
        T.ring_seg(mb, (0, 0.88, 0.84), 0.11, 0.022, gm, axis='x', n=16)
        mb.done('pj_grip')
        rbox('pj_lever', (0.03, 0.08, 0.02), (0.05, 0.8, 0.86), flat(X.LINE_YEL, 0.4), r=0.008)
        VL.snowflake_badge('pj_badge', (-0.26, 0.3, 0.22), r=0.07, psi=-90.0)
    VM.collect(B, build)
    B.add_wheel((0.0, 0.34, 0.09), 0.09, w=0.14, hub='#5A606B', tyre=VL.RUBBER, holes=3, name='pj_wh')
    for sx in (-1, 1):
        B.add_wheel((sx * 0.2, -0.82, 0.04), 0.04, w=0.08, hub='#C3CCD8', holes=3, name='pj_tip')
    B.point('handlePoint', (0.0, 0.88, 0.74))
    B.point('cargoPoint', (0.0, -0.36, 0.1))
    B.point('pushOffset', (0.0, 1.3, 0.0))
    return B


veh('pallet_jack', JACK_ANIMS, notes=JACK_NOTE)(lambda: b_pallet_jack('pallet_jack'))
