"""
civ_veh.py - demolition vehicles of the civic set (docs/CONTRACT_V8.md section AB): excavator + dump truck.

Vehicle conventions of assets/vehicles (veh_lib / veh_render, imported READ-ONLY): kind "vehicle", NO baked shadow,
1 px ink outline at pack time, two rendered headings SE (world +X) and NE (world +Y), game mirrors SW <- SE and
NW <- NE.  Local frame: front = -Y, right side = -X (the side the camera sees), origin = ground centre.
The specs below use the veh_models.VEH format; civ_render registers them into veh_models.VEH at run time and calls
veh_render.render_vehicle() unchanged, then write_extra_meta() adds the per-frame points (bucket, tipping bed).

A friendly operator in a yellow hard hat + orange hi-vis vest is baked into each cab (built with the characters'
char_build body, like the chief in truck_cargo_chief).

Not run directly - see civ_render.py.
"""
import json
import math
import os
from collections import OrderedDict

import bpy  # noqa: F401
from mathutils import Vector, Euler

import bl_common as bc
import prop_lib as L
from prop_lib import flat, box, cyl, sphere, blob, extrude, hexmix
import prop_assets as PA
import bld_assets as BA
import char_build as CB
import char_geo as G
import veh_lib as VL
from veh_lib import rbox, paint, chrome, rubber
import civ_lib as CL

VEH = OrderedDict()
YEL = '#F2C230'
ORANGE = '#EE7F33'
DARK = '#2B2F3A'


def veh(key, anims, notes='', samples=24):
    def deco(fn):
        VEH[key] = dict(key=key, fn=fn, era=3, anims=anims, notes=notes, samples=samples, family=key, variant=None,
                        kind='vehicle')
        return fn
    return deco


# =========================================================================== helpers

def collect_to(parent, fn):
    """Run fn() (modelled in the parent's local frame) and parent every new top-level object to `parent`."""
    with L.Collect() as c:
        fn()
    for o in BA.top_level(c.objs):
        if o is not parent and o.parent is None:
            o.parent = parent
    return c.objs


def pane_on(B, name, corners, parent):
    """veh_lib.VB.pane with another parent (swinging cab)."""
    o = B.pane(name, corners)
    o.parent = parent
    return o


def beam(name, p, q, w, h, mat, r=0.06):
    """Rounded box beam from p to q (in the YZ plane, x = p.x)."""
    p, q = Vector(p), Vector(q)
    d = q - p
    ln = d.length
    o = rbox(name, (w, ln, h), (0, 0, 0), mat, r=r, origin='center')
    o.rotation_mode = 'XYZ'
    o.rotation_euler = Euler((math.atan2(d.z, d.y), 0, 0), 'XYZ')
    o.location = (p + q) / 2
    return o


def dress_operator(rig, spec):
    """Construction / demolition operator: yellow hard hat, orange hi-vis vest with silver bands, blue work jacket."""
    vest = CB.M('hivis', '#F28A2E', rough=0.55)
    prof = [(0.226, -0.03), (0.222, 0.05), (0.218, 0.14), (0.214, 0.24), (0.200, 0.31), (0.160, 0.38)]
    G.mesh_obj('vest', CB.vest_lathe(prof, gap_deg=22), vest, rig.j['spine'])
    refl = CB.M('refl', '#EEF3F6', rough=0.25, emission='#EEF3F6', emission_strength=0.25)
    for z0 in (0.06, 0.2):
        G.mesh_obj('vest_band', CB.vest_lathe([(0.229, z0), (0.227, z0 + 0.035)], gap_deg=22), refl,
                   rig.j['spine'])
    CB.belt(rig, '#3B2A20', z=-0.03, r=0.228, buckle='#B9C2CE')
    CB.hair_shell(rig, spec['hair'], fringe=0.24, wave=0.05, waves=10.0, sweep=0.0, back_low=-0.45)
    hat = CB.M('hardhat_y', '#F7C531', rough=0.32)
    CB.cap_shell(rig, hat, lambda x, y: 0.16 - 0.05 * y, base=1.14, puff=0.12, name='hardhat', soft=0.02)
    CB.tilted_ring(rig, 'hardhat_rim', hat, CB.HEAD_R[0] * 1.10, 0.024, 0.22, 0.10, sy=0.96, rz=0.7)
    import bmesh
    visor = G.bm_lathe([(0.30, 0.008), (0.37, -0.012), (0.375, -0.022), (0.30, -0.006)], seg=40, sy=1.0,
                       cap_top=False, cap_bottom=False)
    kill = [f for f in visor.faces if f.calc_center_median().y > -0.12]
    bmesh.ops.delete(visor, geom=kill, context='FACES')
    CB.head_obj(rig, 'hardhat_visor', visor, hat, loc=(0, 0.0, 0.055), rot=(-4, 0, 0))
    CB.head_obj(rig, 'hardhat_ridge', G.bm_ellipsoid(0.035, 0.24, 0.03, 12, 8), hat, loc=(0, 0.02, 0.4))


def operator_rig(parent, seat_front):
    import bld_boats as BB
    rig = BB.crew_rig('miner', spec_over={'coat': '#4A72A8', 'hair': '#5A3A26', 'mitten': '#E8C25A',
                                          'pants': '#3E4A5C'}, dress=dress_operator)
    rig.j['root'].parent = parent
    rig.rest_loc['root'] = Vector(seat_front)
    return rig


def stadium(L_s, rt, n=12):
    """Track outline in (y, z): straight runs of length L_s, round ends of radius rt, bottom at z = 0 (CCW)."""
    pts = []
    for k in range(n + 1):
        a = -math.pi / 2 + math.pi * k / n
        pts.append((L_s / 2 + rt * math.cos(a), rt + rt * math.sin(a)))
    for k in range(n + 1):
        a = math.pi / 2 + math.pi * k / n
        pts.append((-L_s / 2 + rt * math.cos(a), rt + rt * math.sin(a)))
    return pts


def stadium_at(s, L_s, rt):
    """Point + outward normal angle on the stadium path at arc length s (0 = bottom front end, running +Y along
    the bottom, up the rear end, -Y along the top, down the front end)."""
    P = 2 * L_s + 2 * math.pi * rt
    s %= P
    if s < L_s:                                  # bottom run, moving +Y
        return Vector((0, -L_s / 2 + s, 0.0)), -math.pi / 2
    s -= L_s
    if s < math.pi * rt:                         # rear end, going up
        a = -math.pi / 2 + s / rt
        return Vector((0, L_s / 2 + rt * math.cos(a), rt + rt * math.sin(a))), a
    s -= math.pi * rt
    if s < L_s:                                  # top run, moving -Y
        return Vector((0, L_s / 2 - s, 2 * rt)), math.pi / 2
    s -= L_s
    a = math.pi / 2 + s / rt                     # front end, going down
    return Vector((0, -L_s / 2 + rt * math.cos(a), rt + rt * math.sin(a))), a


# =========================================================================== EXCAVATOR

EXC_NOTE = ('Toy excavator (tracked, 2.9 m long + arm): sunny yellow house with black-and-yellow hazard stripes on '
            'the counterweight, a round-cornered cab with big windows and a friendly operator in a yellow hard hat, an '
            'amber beacon, a jointed boom + stick + steel bucket with teeth. idle = engine shake; move = tracks run '
            '(sprockets + cleats) and the beacon blinks; dig = 8-frame loop: reach out (1), bucket bites the ground '
            '(2 = digFrame: teeth on the ground ~3.3 m ahead, dust FX at bucketPoints), curls up a load of rubble (3), swings 90 deg to its LEFT side '
            '(4-5) and dumps it (5 = dumpFrame: drop FX at bucketPoints / dumpPoint), swings back (6-7). The left side '
            'is the side AWAY from the camera, so the dump truck parks behind the excavator (it never hides it): use '
            'demolitionLayout, or park a dump_truck so that its cargoGround is under dumpPoint.')

TRK_RT, TRK_W, TRK_X = 0.27, 0.34, 0.6
TRK_SYM = 6
TRK_SPACING = TRK_RT * 2 * math.pi / TRK_SYM
TRK_N = 18
TRK_LS = (TRK_N * TRK_SPACING - 2 * math.pi * TRK_RT) / 2

EXC_REST = dict(sw=0.0, boom=-14.0, stick=30.0, bucket=55.0)
EXC_DIG = [  # swing (deg, + = toward the LEFT side = away from the camera), boom, stick, bucket (joint X axes)
    dict(sw=0.0, boom=-14.0, stick=30.0, bucket=55.0),       # 0 raised
    dict(sw=0.0, boom=6.0, stick=-42.0, bucket=-10.0),       # 1 reach far out (stick extended)
    dict(sw=0.0, boom=25.0, stick=-35.0, bucket=-5.0),       # 2 bite (teeth at the ground ~3.3 m ahead: over the fence)
    dict(sw=0.0, boom=6.0, stick=-16.0, bucket=75.0),        # 3 scoop: drag back + curl
    dict(sw=45.0, boom=-18.0, stick=14.0, bucket=85.0),      # 4 swing with the load
    dict(sw=90.0, boom=-22.0, stick=0.0, bucket=-40.0),      # 5 dump on the left side (into the truck behind)
    dict(sw=45.0, boom=-18.0, stick=16.0, bucket=25.0),      # 6 swing back
    dict(sw=12.0, boom=-15.0, stick=26.0, bucket=48.0),      # 7 almost home
]
EXC_ANIMS = OrderedDict([
    ('idle', dict(frames=2, fps=4, repeat=-1, bob=[0, 1], spin=False, blink=False, smoke=False)),
    ('move', dict(frames=4, fps=8, repeat=-1, bob=[0, 0, 1, 0], spin=True, blink=True, smoke=False)),
    ('dig', dict(frames=8, fps=6, repeat=-1, bob=[0, 0, 1, 0, 0, 0, 1, 0], spin=False, blink=True, smoke=True,
                 digFrame=2, dumpFrame=5)),
])


@veh('excavator', EXC_ANIMS, notes=EXC_NOTE, samples=24)
def b_excavator():
    B = VL.VB('excavator')
    B.length, B.width, B.height = 2.9, 1.75, 2.3
    B.wheel_sym = TRK_SYM
    yel = paint(YEL)
    ink = flat('#2E323C', 0.6)
    track_m = flat('#3A3F48', 0.7)
    cleat_m = flat('#4A505B', 0.6)
    # ---- undercarriage (body-local, does not swing)
    def under():
        for sx in (-1, 1):
            VL.profile_x('trk', stadium(TRK_LS, TRK_RT), TRK_W, track_m, bevel=0.05, x=sx * TRK_X)
            VL.profile_x('trkplate', stadium(TRK_LS - 0.1, TRK_RT - 0.1), 0.04, paint('#3D424C', 0.5),
                         bevel=0.015, x=sx * (TRK_X + TRK_W / 2 + 0.005))
            for y in (-0.32, 0.0, 0.32):
                cyl('roller', 0.08, 0.05, (sx * (TRK_X + TRK_W / 2 + 0.03), y, 0.12), rot=(0, 90, 0),
                    mat=paint(YEL, 0.4), segs=16, origin='center', bevel=0.01)
            rbox('trkguard', (TRK_W + 0.02, TRK_LS + 0.1, 0.06), (sx * TRK_X, 0.0, 2 * TRK_RT - 0.02), yel, r=0.03)
        rbox('carbody', (2 * TRK_X - TRK_W + 0.1, TRK_LS * 0.7, 0.3), (0, 0, 0.18), ink, r=0.08)
        cyl('ring', 0.62, 0.1, (0, 0.05, 2 * TRK_RT), mat=flat('#3D424C', 0.5), segs=36, bevel=0.02)
    with L.Collect() as uc:
        under()
    B.adopt(uc.objs)
    # sprockets (spin) at both ends of each track, outer side
    for sx in (-1, 1):
        for y in (-TRK_LS / 2, TRK_LS / 2):
            B.add_wheel((sx * (TRK_X + TRK_W / 2 + 0.035), y, TRK_RT), TRK_RT * 0.82, w=0.07, hub=YEL, holes=TRK_SYM,
                        tyre='#3A3F48', name='spr')
    # cleats on the belt (moved per frame by the hook)
    cleats = []
    for sx in (-1, 1):
        for k in range(TRK_N):
            c = rbox('cleat', (TRK_W + 0.04, 0.09, 0.05), (0, 0, 0), cleat_m, r=0.015, origin='center')
            c.parent = B.body
            c.rotation_mode = 'XYZ'
            cleats.append((c, sx, k))

    def place_cleats(phase):
        for c, sx, k in cleats:
            p, a = stadium_at((k + phase) * TRK_SPACING, TRK_LS, TRK_RT)
            n = Vector((0, math.cos(a), math.sin(a)))
            c.location = Vector((sx * TRK_X, p.y, p.z)) + n * 0.02
            c.rotation_euler = Euler((a - math.pi / 2, 0, 0), 'XYZ')
    place_cleats(0.0)
    # ---- upper structure (swings)
    sw = G.empty('ex_swing', B.body, (0, 0.05, 2 * TRK_RT + 0.1))
    sw.rotation_mode = 'XYZ'

    def house():
        rbox('house', (1.5, 1.85, 0.58), (0, 0.28, 0.0), yel, r=0.16)
        haz = L.stripes(YEL, DARK, 7.0, 'X', rough=0.4, soft=0.02)
        rbox('cweight', (1.58, 0.44, 0.62), (0, 1.22, -0.03), haz, r=0.18)
        rbox('hood', (1.0, 0.78, 0.26), (0.24, 0.72, 0.56), yel, r=0.1)
        for k in range(4):
            rbox('grille', (0.02, 0.5, 0.035), (0.75, 0.72, 0.62 + 0.05 * k), ink, r=0.01)
        cyl('exh', 0.05, 0.42, (0.5, 0.95, 0.78), mat=chrome(), segs=12, bevel=0.01)
        cyl('exhcap', 0.065, 0.05, (0.5, 0.95, 1.18), mat=flat(DARK, 0.5), segs=12, bevel=0.01)
        VL.snow_cap('hoodsnow', 0.6, 0.4, (0.25, 0.75, 0.82), t=0.05, seed=3)
        # cab (right-front), seat + levers inside
        VL.shell('cab', (0.96, 1.0, 1.45), (-0.29, -0.38, 0.5), yel, r=0.22, wall=0.05,
                 inner=flat('#E9DCC2', 0.8), frame_mat=paint(DARK, 0.4),
                 cuts=[(-0.66, 0.08, -0.98, -0.72, 0.98, 1.74, 0.09),      # front
                       (-0.87, -0.67, -0.76, 0.0, 0.98, 1.74, 0.09),       # right side
                       (0.09, 0.29, -0.76, 0.0, 0.98, 1.74, 0.09)])        # left side
        VL.snow_cap('cabsnow', 0.7, 0.72, (-0.29, -0.38, 1.94), t=0.06, seed=4)
        rbox('seat', (0.44, 0.4, 0.12), (-0.29, -0.2, 0.62), paint('#3D424C', 0.6), r=0.05)
        rbox('seatb', (0.44, 0.1, 0.5), (-0.29, 0.02, 0.64), paint('#3D424C', 0.6), r=0.05)
        for sx in (-1, 1):
            cyl('lever', 0.018, 0.28, (-0.29 + sx * 0.2, -0.62, 0.66), rot=(-20, 0, 0), mat=flat(DARK, 0.5), segs=8)
            sphere('knob', 0.035, (-0.29 + sx * 0.2, -0.67, 0.93), flat('#D9483B', 0.4), segs=10, rings=6)
        VL.headlamp('wlamp', (-0.29, -0.89, 1.84), r=0.07, facing=-1)
        # boom foot bracket
        rbox('bfoot', (0.36, 0.42, 0.4), (0.4, -0.62, 0.42), yel, r=0.08)
    house_objs = collect_to(sw, house)
    pane_on(B, 'cab_pF', [(-0.64, -0.86, 1.0), (0.06, -0.86, 1.0), (0.06, -0.86, 1.72), (-0.64, -0.86, 1.72)], sw)
    pane_on(B, 'cab_pR', [(-0.755, -0.02, 1.0), (-0.755, -0.74, 1.0), (-0.755, -0.74, 1.72), (-0.755, -0.02, 1.72)],
            sw)
    B.blinker('beacon', (-0.05, -0.2, 2.0), '#FFB347', r=0.08, parent=sw)
    # smoke from the exhaust while digging
    sm = CL.SoftSmoke('exsmoke', (0.5, 0.95, 1.25), n=3, rise=0.9, drift=(0.25, 0.15), r0=0.06, r1=0.22,
                      color='#D5D9E0', alpha=0.6, seed=5)
    for o in sm.obs:
        o.parent = sw
    B.smokes.append(sm)
    B.mask_hidden.extend(sm.obs)
    # ---- boom / stick / bucket
    bm = G.empty('ex_boom', sw, (0.4, -0.62, 0.62))
    bm.rotation_mode = 'XYZ'
    P1, P2 = Vector((0, -0.8, 0.78)), Vector((0, -1.7, 0.6))

    def boom():
        beam('boom1', (0, 0.1, -0.05), P1 + Vector((0, 0.05, 0)), 0.26, 0.3, yel, r=0.1)
        beam('boom2', P1 - Vector((0, 0.05, 0)), P2 + Vector((0, 0.08, 0.04)), 0.24, 0.27, yel, r=0.1)
        sphere('bjoint', 0.15, tuple(P1), yel, segs=18, rings=10)
        cyl('pin0', 0.09, 0.32, (0, 0, 0), rot=(0, 90, 0), mat=flat(DARK, 0.4), segs=16, origin='center')
        cyl('pin1', 0.08, 0.3, tuple(P2), rot=(0, 90, 0), mat=flat(DARK, 0.4), segs=16, origin='center')
        beam('ram', (0, -0.15, -0.22), P1 + Vector((0, 0.22, -0.18)), 0.09, 0.09, chrome(), r=0.04)
        beam('ram2', P1 + Vector((0, 0.0, 0.2)), P2 + Vector((0, 0.15, 0.25)), 0.08, 0.08, chrome(), r=0.035)
    collect_to(bm, boom)
    st = G.empty('ex_stick', bm, tuple(P2))
    st.rotation_mode = 'XYZ'
    S_END = Vector((0, -0.16, -1.0))

    def stick():
        beam('stick', (0, 0.05, 0.12), S_END + Vector((0, 0.02, 0.05)), 0.2, 0.22, yel, r=0.08)
        cyl('pin2', 0.07, 0.28, tuple(S_END), rot=(0, 90, 0), mat=flat(DARK, 0.4), segs=16, origin='center')
    collect_to(st, stick)
    bk = G.empty('ex_bucket', st, tuple(S_END))
    bk.rotation_mode = 'XYZ'
    steel = flat('#6B7380', 0.4, 0.4)
    inside = flat('#4A505B', 0.6)

    def bucket():
        outer = [(0.06, 0.08), (0.04, -0.12), (-0.08, -0.3), (-0.3, -0.38), (-0.5, -0.24)]
        inner_ = [(-0.43, -0.22), (-0.27, -0.29), (-0.1, -0.23), (-0.02, -0.1), (-0.01, 0.06)]
        VL.profile_x('bk_shell', outer + inner_, 0.5, steel, bevel=0.02)
        side = outer + [(-0.36, -0.05), (-0.12, 0.08)]
        for sx in (-1, 1):
            VL.profile_x('bk_side', side, 0.04, steel, bevel=0.012, x=sx * 0.25)
        rbox('bk_lip', (0.5, 0.08, 0.05), (0, -0.48, -0.24), flat('#8E96A3', 0.35, 0.5), r=0.02, origin='center')
        for k in range(4):
            x = -0.18 + 0.12 * k
            cyl('tooth', 0.035, 0.12, (x, -0.55, -0.25), rot=(90, 0, 0), mat=flat('#B9C2CE', 0.3, 0.6), segs=8,
                r_top=0.012, origin='center')
        rbox('bk_ear', (0.2, 0.16, 0.18), (0, 0.02, 0.0), steel, r=0.05)
    collect_to(bk, bucket)
    tip = G.empty('ex_tip', bk, (0, -0.56, -0.25))
    # rubble load inside the bucket + a few chunks falling at the dump frame
    load = []

    def load_fn():
        blob('ld', 0.2, (0, -0.2, -0.12), CL.charcoal(5.0, seed=3), scale=(1.1, 0.8, 0.55), seed=31, amp=0.3,
             subdiv=2)
        CL.charred_beam('ldbeam', (-0.18, -0.05, -0.05), (0.15, -0.38, 0.02), r=0.045, seed=33, snow=False)
        CL.bricks('ldbricks', (0.08, -0.22, -0.08), 0.12, 3, seed=34, col='#B4593F')
    load = collect_to(bk, load_fn)
    drop = []

    def drop_fn():
        for k, (dy, dz, r) in enumerate(((-0.3, -0.45, 0.09), (-0.45, -0.7, 0.07), (-0.2, -0.85, 0.06),
                                         (-0.5, -0.38, 0.05))):
            blob('dr', r, (0.05 * (k - 1.5), dy, dz), CL.charcoal(5.0, seed=40 + k) if k % 2 == 0 else
                 flat('#9A948F', 0.85), seed=40 + k, amp=0.3, subdiv=2)
        CL.bricks('drbricks', (0.0, -0.4, -0.6), 0.1, 2, seed=44, col='#B4593F')
    drop = collect_to(bk, drop_fn)
    # operator
    rig = operator_rig(sw, (-0.29, -0.4, 0.74))
    B.rigs.append(rig)
    stick_c = Vector((-0.29, -0.66, 0.92))

    def show(objs, on):
        for o in BA.descendants(objs):
            o.hide_render = not on

    def hook(anim, i, n):
        p = EXC_DIG[i] if anim == 'dig' else EXC_REST
        sw.rotation_euler = Euler((0, 0, math.radians(p['sw'])), 'XYZ')
        bm.rotation_euler = Euler((math.radians(p['boom']), 0, 0), 'XYZ')
        st.rotation_euler = Euler((math.radians(p['stick']), 0, 0), 'XYZ')
        bk.rotation_euler = Euler((math.radians(p['bucket']), 0, 0), 'XYZ')
        show(load, anim == 'dig' and i in (3, 4))
        show(drop, anim == 'dig' and i == 5)
        place_cleats(i / float(n) if anim == 'move' else 0.0)
        bpy.context.view_layer.update()
        VL.pose_driver(rig, sw.matrix_world @ stick_c, anim, i, n, wave=(anim == 'idle' and i == 1),
                       face='face_happy' if anim == 'dig' and i in (2, 5) else 'face_smile')
    B.hooks.append(hook)
    B.extra_points = {'bucketPoints': tip}
    B.crew_note = {'driver': 'operator (yellow hard hat, hi-vis vest)', 'seat': 'cab, baked'}
    B.driver_seat = None
    B.point('exhaustPoint', (0.5, 1.0, 1.85))
    B.point('lightPoints', (-0.24, -0.95, 2.5), many=True)
    B.point('sirenPoint', (-0.05, -0.15, 2.7))
    return B


# =========================================================================== DUMP TRUCK

DUMP_NOTE = ('Toy dump truck (5.2 m): chunky orange cab-over cab with big round lamps and a friendly operator in a '
             'yellow hard hat, dark chassis, six fat wheels, a sunny-yellow ribbed tipping bed with a hinged '
             'tailgate. idle / move = empty; LOADED = the same frame + the cargo overlay frame cargo_{anim}_{dir}_{i} '
             '(the heap of charred beams, bricks and ash, rendered with the truck as holdout: draw it on top at the '
             'same position / origin / flip; cargoPoint = bed centre). tip = 6 frames, play once: the bed rises, the '
             'tailgate swings, a stream of rubble pours out of the tail onto the ground at tipPoint (tipFrame 2-3: '
             'place the dump_pile prop at tipPoint from pileFrame 3 on, dust FX) and the empty bed settles back down '
             '(ends = idle).')

DUMP_ANIMS = OrderedDict([
    ('idle', dict(frames=2, fps=4, repeat=-1, bob=[0, 1], spin=False, blink=False, smoke=False)),
    ('move', dict(frames=4, fps=10, repeat=-1, bob=[0, 1, 1, 0], spin=True, blink=False, smoke=False)),
    ('tip', dict(frames=6, fps=6, repeat=0, bob=[0, 0, 1, 1, 0, 0], spin=False, blink=False, smoke=True,
                 tipFrame=2, pileFrame=3)),
])
# polish v2: the loaded look is an overlay (only the heap) instead of two whole extra truck anims (GPU memory)
CARGO_ANIMS = OrderedDict([('idle', 'idle_loaded'), ('move', 'move_loaded')])
LOADED_POSE = {'idle_loaded': dict(DUMP_ANIMS['idle']), 'move_loaded': dict(DUMP_ANIMS['move'])}
DUMP_TIP = [0.0, 22.0, 46.0, 56.0, 30.0, 0.0]          # bed angle per tip frame (deg, front up)


@veh('dump_truck', DUMP_ANIMS, notes=DUMP_NOTE, samples=24)
def b_dump_truck():
    B = VL.VB('dump_truck')
    B.length, B.width, B.height = 5.2, 2.1, 2.6
    org = paint(ORANGE)
    yel = paint(YEL)
    wr = 0.5
    axles = (-1.5, 0.95, 1.85)

    def build():
        rbox('frame', (1.2, 4.6, 0.26), (0, 0.15, 0.5), flat(DARK, 0.5), r=0.06)
        # cab-over cab
        VL.shell('cab', (2.0, 1.45, 1.55), (0, -1.55, 0.9), org, r=0.32, wall=0.06, inner=flat('#E9DCC2', 0.8),
                 frame_mat=paint('#F4F1EA', 0.4),
                 cuts=[(-0.82, 0.82, -2.45, -2.1, 1.55, 2.25, 0.1),          # windscreen
                       (-1.2, -0.85, -2.05, -1.05, 1.55, 2.2, 0.1),          # right window
                       (0.85, 1.2, -2.05, -1.05, 1.55, 2.2, 0.1)])           # left window
        rbox('cablow', (2.0, 1.45, 0.62), (0, -1.55, 0.62), org, r=0.22)
        rbox('grille', (1.0, 0.1, 0.42), (0, -2.3, 0.85), chrome(), r=0.08)
        for k in range(4):
            rbox('slot', (0.8, 0.04, 0.04), (0, -2.36, 0.92 + 0.08 * k), flat(DARK, 0.6), r=0.015)
        for sx in (-1, 1):
            VL.headlamp('head', (sx * 0.75, -2.28, 1.0), r=0.16, facing=-1)
            VL.mirror_arm('mir', (sx * 1.02, -2.0, 1.75), out=sx)
            rbox('fender', (0.5, 1.15, 0.12), (sx * 0.85, axles[0], 1.02), org, r=0.05)
        VL.bumper('bumpF', -2.42, 2.0, 0.62, mat=flat(DARK, 0.5), t=0.18, h=0.2)
        VL.snowflake_badge('door', (-1.02, -1.4, 1.35), r=0.17, psi=-90.0, bg='#EE7F33', fg='#F4F1EA')
        VL.snow_cap('cabsnow', 1.4, 1.0, (0.05, -1.55, 2.44), t=0.07, seed=7)
        cyl('exh', 0.06, 1.1, (0.75, -0.72, 1.0), mat=chrome(), segs=12, bevel=0.01)
        cyl('exhcap', 0.075, 0.06, (0.75, -0.72, 2.1), mat=flat(DARK, 0.5), segs=12, bevel=0.01)
        rbox('step', (0.25, 0.4, 0.06), (-1.05, -1.5, 0.42), flat(DARK, 0.5), r=0.02)
        for y in axles:
            VL.wheel_well('well', y, wr, 0.55, 0.92)
        for y in axles[1:]:
            for sx in (-1, 1):
                rbox('rfender', (0.46, 0.7, 0.1), (sx * 0.86, y, 1.05), flat(DARK, 0.5), r=0.04)
        rbox('hingeb', (1.4, 0.2, 0.2), (0, 2.05, 0.75), flat(DARK, 0.5), r=0.05)
    collect(B, build)
    # panes
    B.end_window('pW', -2.27, -0.8, 0.8, 1.57, 2.23, end=-1)
    B.side_window('pR', -0.97, -2.0, -1.1, 1.57, 2.18, side=-1)
    for y in axles:
        for sx in (-1, 1):
            B.add_wheel((sx * 0.85, y, wr), wr, w=0.34, hub=YEL, holes=3, name='wh')
    # tipping bed (hinge at the rear)
    hz, hy = 1.05, 2.12
    bed = G.empty('bed', B.body, (0, hy, hz))
    bed.rotation_mode = 'XYZ'

    def bed_fn():
        y0, y1 = -0.75 - hy, 2.25 - hy
        rbox('bfloor', (2.04, y1 - y0, 0.14), (0, (y0 + y1) / 2, 0.05), yel, r=0.04)
        ribs = L.stripes(YEL, '#E0AE1E', 6.0, 'Y', rough=0.4, soft=0.08)
        for sx in (-1, 1):
            rbox('bside', (0.1, y1 - y0, 0.78), (sx * 0.97, (y0 + y1) / 2, 0.15), ribs, r=0.04)
            for k in range(4):
                rbox('brib', (0.06, 0.08, 0.7), (sx * 1.03, y0 + 0.4 + k * 0.72, 0.18), yel, r=0.02)
        rbox('bfront', (2.04, 0.12, 1.0), (0, y0 + 0.06, 0.15), yel, r=0.05)
        rbox('blip', (2.04, 0.5, 0.08), (0, y0 - 0.15, 1.1), yel, r=0.03)
        rbox('bstripe', (2.06, 0.13, 0.12), (0, y0 + 0.06, 0.88), L.stripes(YEL, DARK, 7.0, 'X', soft=0.02), r=0.02)
        VL.snow_cap('bsnow', 0.6, 0.3, (0.5, y0 - 0.15, 1.18), t=0.04, seed=8)
    collect_to(bed, bed_fn)
    tg = G.empty('tailgate', bed, (0, 2.25 - hy, 0.95))
    tg.rotation_mode = 'XYZ'

    def tg_fn():
        rbox('tgate', (2.0, 0.1, 0.8), (0, 0.0, -0.8), yel, r=0.04)
        for sx in (-1, 1):
            VL.taillamp('tail', (sx * 0.8, 0.07, -0.55), r=0.07, facing=1)
    collect_to(tg, tg_fn)
    load_static, load_fall = [], []

    def load_fn():
        yc = 0.95 - hy + 0.35
        blob('heap', 0.8, (0, yc, 0.15), CL.charcoal(4.0, snow=0.35, seed=91, base=CL.ASH_DARK), scale=(1.12, 1.35, 0.3),
             seed=92, amp=0.25, subdiv=3, flat_bottom=0.3)
        blob('ash', 0.5, (0.3, yc + 0.45, 0.24), snowy_ash(), scale=(1.2, 1.0, 0.42), seed=93, amp=0.25,
             subdiv=2)
        blob('ash2', 0.42, (-0.35, yc - 0.55, 0.22), snowy_ash(), scale=(1.1, 1.0, 0.4), seed=95, amp=0.25,
             subdiv=2)
        for k, (p, q) in enumerate((((-0.6, -0.4, 0.32), (0.5, -1.6, 0.5)), ((0.6, -0.3, 0.3), (-0.2, -1.2, 0.55)),
                                    ((-0.3, -1.9, 0.3), (0.7, -2.3, 0.45)), ((-0.7, -1.0, 0.3), (0.1, -0.2, 0.5)))):
            CL.charred_beam('lb', (p[0], p[1] + 0.95 - hy + 1.2, p[2]), (q[0], q[1] + 0.95 - hy + 1.2, q[2]),
                            r=0.06, seed=94 + k, snow=False)
        CL.bricks('lbricks', (0.1, yc), 0.7, 14, seed=97, col='#B4593F', z=0.4)
        for k in range(4):
            box('ltile', (0.26, 0.18, 0.03), (-0.5 + 0.33 * k, yc - 0.3 + 0.25 * (k % 2), 0.5),
                rot=(15 * (k % 2), -12, 30 * k), mat=flat(['#C8473A', '#3D6FA8'][k % 2], 0.7), bevel=0.01)
    load_static = collect_to(bed, load_fn)

    # polish v2: a rubble STREAM pours from the tailgate lip down to tipPoint (frames 2-3), parented to the body
    stream = []
    for k in range(11):
        if k % 3 == 2:
            o = box('sbrick', (0.2, 0.1, 0.08), (0, 0, 0), mat=flat(['#B4593F', '#C2654A'][k % 2], 0.85), bevel=0.015,
                    origin='center')
        else:
            o = blob('stream', 0.07 + 0.012 * k, (0, 0, 0), CL.charcoal(5.0, seed=100 + k) if k % 2 == 0 else
                     snowy_ash(), seed=100 + k, amp=0.3, subdiv=2)
        o.parent = B.body
        o.rotation_mode = 'XYZ'
        stream.append(o)
    load_fall = stream
    rig = operator_rig(B.body, (-0.45, -1.7, 1.12))
    B.rigs.append(rig)
    rbox('seat', (0.5, 0.42, 0.12), (-0.45, -1.48, 1.0), paint('#3D424C', 0.6), r=0.05).parent = B.body
    wheel_c = Vector((-0.45, -1.98, 1.55))
    import veh_models as VM
    VM.steering('swheel', tuple(wheel_c), r=0.16).parent = B.body

    # telescopic tipping ram: chrome sleeve on the chassis + piston to the bed's front underside
    ram_a = Vector((0, -0.45, 0.66))
    sleeve = cyl('ramsleeve', 0.09, 1.0, (0, 0, 0), mat=flat(DARK, 0.45), segs=14, origin='bottom', bevel=0.01)
    piston = cyl('rampiston', 0.06, 1.0, (0, 0, 0), mat=chrome(), segs=14, origin='bottom', bevel=0.01)
    for o in (sleeve, piston):
        o.parent = B.body
        o.rotation_mode = 'QUATERNION'
    ram_b_local = Vector((0, -0.6 - hy, 0.05))

    def place_ram():
        bpy.context.view_layer.update()
        mb = B.body.matrix_world.inverted() @ (bed.matrix_world @ ram_b_local)
        d = mb - ram_a
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        sleeve.location = ram_a
        sleeve.rotation_quaternion = q
        sleeve.scale = (1, 1, 0.42)
        piston.location = ram_a
        piston.rotation_quaternion = q
        piston.scale = (1, 1, max(0.42, d.length))

    def show(objs, on):
        for o in BA.descendants(objs):
            o.hide_render = not on

    def place_stream(i):
        bpy.context.view_layer.update()
        inv = B.body.matrix_world.inverted()
        lip = inv @ (bed.matrix_world @ Vector((0, 2.25 - hy + 0.12, 0.16)))
        ground = Vector((0.0, 3.0, 0.06))
        n_on = 7 if i == 2 else len(stream)
        for k, o in enumerate(stream):
            t = (k + (0.0 if i == 2 else 0.4)) / float(len(stream))
            o.hide_render = k >= n_on
            p = lip.lerp(ground, t)
            p.z = lip.z - (lip.z - ground.z) * (t ** 1.4)          # falls faster as it goes
            p.y = lip.y + (ground.y - lip.y) * math.sqrt(t)        # thrown slightly back off the lip
            p.x = 0.22 * math.sin(k * 2.3) * (0.4 + t)
            o.location = p
            o.rotation_euler = Euler((k * 0.7, k * 1.3, k * 0.9), 'XYZ')

    def hook(anim, i, n):
        loaded = anim.endswith('_loaded') or (anim == 'tip' and i <= 2)
        ang = DUMP_TIP[i] if anim == 'tip' else 0.0
        bed.rotation_euler = Euler((math.radians(-ang), 0, 0), 'XYZ')
        tg.rotation_euler = Euler((math.radians(ang * (1.0 if anim == 'tip' and i in (2, 3) else 0.6)), 0, 0),
                                  'XYZ')
        show(load_static, loaded)
        place_ram()
        if anim == 'tip' and i in (2, 3):
            place_stream(i)
        else:
            show(load_fall, False)
        bpy.context.view_layer.update()
        VL.pose_driver(rig, B.body.matrix_world @ wheel_c, anim, i, n, wave=(anim.startswith('idle') and i == 1),
                       face='face_happy' if anim == 'tip' and i in (2, 3) else 'face_smile')
    B.hooks.append(hook)
    sm = CL.SoftSmoke('dsmoke', (0.75, -0.72, 2.2), n=3, rise=0.8, drift=(0.2, 0.25), r0=0.06, r1=0.2,
                      color='#D5D9E0', alpha=0.6, seed=9)
    for o in sm.obs:
        o.parent = B.body
    B.smokes.append(sm)
    B.mask_hidden.extend(sm.obs)
    tip_g = G.empty('tip_pt', B.body, (0, 2.9, 0.0))
    B.extra_points = {'bedPoints': G.empty('bed_pt', bed, (0, 0.75 - hy + 0.0, 0.9)), 'tipPoints': tip_g}
    B.crew_note = {'driver': 'operator (yellow hard hat, hi-vis vest)', 'seat': 'cab, baked'}
    B.driver_seat = None
    B.cargo_objs = load_static
    for sx in (-1, 1):
        B.point('lightPoints', (sx * 0.75, -2.36, 1.0), many=True)
        B.point('tailPoints', (sx * 0.8, 2.32, 0.5), many=True)
    B.point('exhaustPoint', (0.75, -0.72, 2.2))
    B.point('cargoPoint', (0.0, 0.75, 1.25))
    B.point('cargoGround', (0.0, 0.75, 0.0))
    B.point('doorPoints', (-1.35, -1.4, 0.0), many=True)
    B.point('tipPoint', (0.0, 3.0, 0.0))
    return B


def snowy_ash():
    from prop_lib import snowy
    return snowy(CL.ASH, lo=0.6, hi=0.75, noise_amt=0.5, noise_scale=3.0, rough=0.95)


def collect(B, fn):
    with L.Collect() as c:
        fn()
    B.adopt(c.objs)
    return c.objs


# =========================================================================== render glue

def render(key, opts):
    import veh_models as VM
    import veh_render as VR
    VM.VEH[key] = VEH[key]
    VR.render_vehicle(key, opts)
    write_extra_meta(key, opts['cache'])
    if key == 'dump_truck':
        render_cargo(key, opts)


def render_cargo(key, opts):
    """Polish v2: the dump truck's load as an OVERLAY (cargo_{anim}_{dir}_{i}): same camera, frame and anchor as the
    truck frames, the load posed exactly as in the old idle_loaded / move_loaded anims, every other object a
    holdout - so the game draws truck frame + cargo frame instead of keeping two whole loaded truck anims in memory."""
    import veh_render as VR
    out = os.path.join(opts['cache'], key)
    mp = os.path.join(out, 'meta.json')
    if not os.path.exists(mp):
        return
    meta = json.load(open(mp))
    names = ['cargo_%s_%s_%d' % (a, d, i) for a in CARGO_ANIMS for d in VR.DIRS
             for i in range(VEH[key]['anims'][a]['frames'])]
    if not opts.get('force') and all(os.path.exists(os.path.join(out, n + '.png')) for n in names) and \
            'cargoOverlay' in meta:
        print('[%s] cargo overlay cached' % key)
        return
    spec = dict(VEH[key])
    spec['anims'] = OrderedDict(list(VEH[key]['anims'].items()) + list(LOADED_POSE.items()))
    bc.reset_scene()
    L._CUSTOM.clear()
    VL._PAINT.clear()
    bc.setup_lighting()
    B = spec['fn']()
    bpy.context.view_layer.update()
    VR.bake_booleans(B)
    W, H = meta['frameSize']
    VR.setup_scene(W, H, tuple(meta['anchorPx']), opts.get('samples') or spec['samples'])
    cargo = set(o.name for o in BA.descendants(B.cargo_objs))
    objs = VR.veh_objects(B)
    for anim, loaded in CARGO_ANIMS.items():
        for d in VR.DIRS:
            B.root.rotation_euler.z = bc.yaw_for_dir(d)
            for i in range(spec['anims'][anim]['frames']):
                VR.pose(B, spec, loaded, i)
                for o in objs:
                    if o.name in cargo:
                        o.is_holdout = False
                    elif not o.hide_render:
                        o.is_holdout = True
                for s_ in B.smokes:
                    s_.show(False)
                bpy.context.view_layer.update()
                VR.render_png(os.path.join(out, 'cargo_%s_%s_%d.png' % (anim, d, i)))
    meta = json.load(open(mp))
    meta['cargoOverlay'] = {'frameName': 'cargo_{anim}_{dir}_{i}', 'anims': list(CARGO_ANIMS),
                            'frames': {a: VEH[key]['anims'][a]['frames'] for a in CARGO_ANIMS},
                            'notes': 'loaded truck = truck frame {anim}_{dir}_{i} + overlay cargo_{anim}_{dir}_{i} '
                                     'drawn on top (same position, origin and flip); use after the excavator\'s '
                                     'dumpFrame, hide it from tip frame 0 on (the tip frames carry their own load)'}
    with open(mp, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] cargo overlay: %d frames' % (key, len(names)), flush=True)


def write_extra_meta(key, cache):
    """Per-frame px points (bucket tip, bed hinge ...) for every anim and rendered dir -> meta.json, plus the
    ground point under the bucket at the dump frame (dumpPoint) per dir."""
    import veh_render as VR
    out = os.path.join(cache, key)
    mp = os.path.join(out, 'meta.json')
    if not os.path.exists(mp):
        return
    spec = VEH[key]
    bc.reset_scene()
    L._CUSTOM.clear()
    VL._PAINT.clear()
    bc.setup_lighting()
    B = spec['fn']()
    bpy.context.view_layer.update()
    pts, world = {}, {}
    for d in VR.DIRS:
        B.root.rotation_euler.z = bc.yaw_for_dir(d)
        for anim, a in spec['anims'].items():
            for i in range(a['frames']):
                VR.pose(B, spec, anim, i)
                bpy.context.view_layer.update()
                for field, em in getattr(B, 'extra_points', {}).items():
                    w = em.matrix_world.translation.copy()
                    pts.setdefault(field, {}).setdefault(anim, {}).setdefault(d, []).append(VR.to_px(w))
                    world.setdefault(field, {}).setdefault(anim, {}).setdefault(d, []).append(w)
    meta = json.load(open(mp))
    meta['framePoints'] = pts
    meta['framePointsWorldSE'] = {f: {an: [[round(v, 2) for v in w] for w in ws.get('SE', [])]
                                      for an, ws in byanim.items()} for f, byanim in world.items()}
    for anim, a in spec['anims'].items():
        for f in ('digFrame', 'dumpFrame', 'tipFrame', 'pileFrame', 'impactFrame'):
            if f in a:
                meta['anims'][anim][f] = a[f]
        if 'dumpFrame' in a and 'bucketPoints' in world:
            meta['dumpPoint'] = {d: VR.to_px(Vector((w[a['dumpFrame']].x, w[a['dumpFrame']].y, 0.0)))
                                 for d, w in world['bucketPoints'][anim].items()}
            meta['digPoint'] = {d: VR.to_px(Vector((w[a['digFrame']].x, w[a['digFrame']].y, 0.0)))
                                for d, w in world['bucketPoints'][anim].items()}
    if getattr(B, 'extra_meta', None):
        meta.update(B.extra_meta(pts, world))
    with open(mp, 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] extra meta: %s' % (key, ', '.join(pts)), flush=True)
    if 'bucketPoints' in world:
        for anim, ws in world['bucketPoints'].items():
            print('  %s SE bucket z: %s' % (anim, ' '.join('%.2f' % w.z for w in ws['SE'])), flush=True)
