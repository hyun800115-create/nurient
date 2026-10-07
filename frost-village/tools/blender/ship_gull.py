"""
ship_gull.py - the harbour seagull 갈매기 (docs/CONTRACT_V6.md section S), registered in ship_lib.SHIPS as a
'full' render (complete frames) with the 5 character dirs.

Look: chubby toy gull, ~0.55 m tall standing, wingspan ~1.3 m: white round body + big round head, yellow beak with
a red spot, black bead eyes with a highlight, pale grey wings with black tips and white spots, grey-tipped white
tail, orange legs and webbed feet.

Anims (front = local -Y, origin = the feet = sprite anchor for every frame):
    fly   6f  flapping loop (wings up / down with the hand lagging, legs tucked, body bob)
    glide 2f  wings spread with a gentle dihedral, tiny teeter
    land  4f  once: wings raised + body tilted up with the feet reaching down -> braking -> folding -> standing
    idle  4f  standing (on a post / bollard / mast top): head looks around, a squat, one squawk with the beak open
"""
import math

import bpy  # noqa: F401
from mathutils import Vector, Euler

import prop_lib as L
from prop_lib import flat, sphere, blob, cyl
import ship_lib as SL

WHITE = '#F7F8F5'
GREY = '#AEB9C8'
TIP = '#2B2F3A'
BEAK = '#F2B53A'
LEG = '#F08A3A'

BODY_Z = 0.27


def ell(name, r, loc, mat, scale, rot=(0, 0, 0), segs=20, rings=12):
    return sphere(name, r, loc, mat, scale=scale, rot=rot, segs=segs, rings=rings)


def wing(name, side, white, grey, tip):
    """Wing hierarchy: shoulder empty -> arm (inner) -> elbow empty -> hand (outer, black tip).  Built along +X for the
    right wing (side +1) and -X for the left; returns (shoulder, elbow)."""
    sh = bpy.data.objects.new(name + '_sh', None)
    bpy.context.scene.collection.objects.link(sh)
    arm = ell(name + '_arm', 1.0, (side * 0.16, 0.02, 0.0), grey, (0.17, 0.12, 0.028), segs=18, rings=10)
    arm.parent = sh
    lead = ell(name + '_lead', 1.0, (side * 0.16, -0.075, 0.008), flat(WHITE, 0.55), (0.16, 0.035, 0.03),
               segs=14, rings=8)
    lead.parent = sh
    el = bpy.data.objects.new(name + '_el', None)
    bpy.context.scene.collection.objects.link(el)
    el.parent = sh
    el.location = (side * 0.3, 0.0, 0.0)
    hand = ell(name + '_hand', 1.0, (side * 0.15, 0.03, 0.0), grey, (0.17, 0.095, 0.024), segs=18, rings=10)
    hand.parent = el
    tipo = ell(name + '_tip', 1.0, (side * 0.27, 0.055, 0.0), tip, (0.1, 0.06, 0.022), segs=14, rings=8)
    tipo.parent = el
    for k, (x, y) in enumerate(((0.25, 0.07), (0.31, 0.06))):
        d = ell(name + '_spot%d' % k, 0.022, (side * x, y, 0.017), flat(WHITE, 0.5), (1, 1, 0.5), segs=10, rings=6)
        d.parent = el
    return sh, el


def build_gull():
    g = bpy.data.objects.new('gull', None)
    bpy.context.scene.collection.objects.link(g)
    white = flat(WHITE, 0.55)
    grey = flat(GREY, 0.55)
    tip = flat(TIP, 0.5)
    root = bpy.data.objects.new('gull_body', None)
    bpy.context.scene.collection.objects.link(root)
    root.parent = g
    root.location = (0, 0, BODY_Z)
    body = ell('gbody', 1.0, (0, 0.02, 0.0), white, (0.13, 0.21, 0.125), rot=(-8, 0, 0))
    back = ell('gback', 1.0, (0, 0.07, 0.07), grey, (0.105, 0.16, 0.06), rot=(-10, 0, 0))
    tail = ell('gtail', 1.0, (0, 0.24, 0.045), white, (0.07, 0.1, 0.022), rot=(18, 0, 0))
    tailt = ell('gtailt', 1.0, (0, 0.31, 0.065), flat('#8E99A8', 0.55), (0.055, 0.035, 0.02), rot=(18, 0, 0))
    for o in (body, back, tail, tailt):
        o.parent = root
    neck = bpy.data.objects.new('gull_neck', None)
    bpy.context.scene.collection.objects.link(neck)
    neck.parent = root
    neck.location = (0, -0.12, 0.08)
    head = ell('ghead', 0.115, (0, -0.06, 0.08), white, (1.0, 1.0, 0.98), segs=24, rings=14)
    head.parent = neck
    beak_up = cyl('gbeak', 0.034, 0.13, (0, -0.16, 0.065), rot=(96, 0, 0), mat=flat(BEAK, 0.4), segs=14, r_top=0.008,
                  bevel=0.0)
    beak_up.parent = neck
    jaw = bpy.data.objects.new('gull_jaw', None)
    bpy.context.scene.collection.objects.link(jaw)
    jaw.parent = neck
    jaw.location = (0, -0.16, 0.05)
    beak_lo = cyl('gbeakl', 0.024, 0.1, (0, 0, 0), rot=(92, 0, 0), mat=flat(BEAK, 0.4), segs=12, r_top=0.006,
                  bevel=0.0)
    beak_lo.parent = jaw
    spot = ell('gspot', 0.016, (0, -0.075, -0.006), flat('#D9483B', 0.4), (1, 1, 1), segs=10, rings=6)
    spot.parent = jaw
    for s in (-1, 1):
        e = ell('geye%d' % s, 0.024, (s * 0.07, -0.125, 0.115), flat('#1E2026', 0.25), (1, 0.7, 1.15), segs=14,
                rings=8)
        e.parent = neck
        hl = ell('gehl%d' % s, 0.008, (s * 0.074, -0.142, 0.126), flat('#FFFFFF', 0.2), (1, 1, 1), segs=8, rings=5)
        hl.parent = neck
        ck = ell('gcheek%d' % s, 0.022, (s * 0.075, -0.115, 0.075), flat('#F6B9B0', 0.6), (1, 0.5, 0.7), segs=10,
                 rings=6)
        ck.parent = neck
    wings = {}
    for s in (-1, 1):
        sh, el = wing('gw%d' % (s > 0), s, white, grey, tip)
        sh.parent = root
        sh.location = (s * 0.1, -0.02, 0.06)
        wings[s] = (sh, el)
    legs = {}
    leg_m = flat(LEG, 0.45)
    for s in (-1, 1):
        hip = bpy.data.objects.new('gleg%d' % s, None)
        bpy.context.scene.collection.objects.link(hip)
        hip.parent = root
        hip.location = (s * 0.05, 0.03, -0.09)
        shin = cyl('gshin%d' % s, 0.016, 0.19, (0, 0, -0.19), mat=leg_m, segs=8, bevel=0.0)
        shin.parent = hip
        foot = SL.extrude('gfoot%d' % s, [(-0.05, -0.07), (0.05, -0.07), (0.0, 0.03)], 0.014, loc=(0, -0.0, -0.195),
                          top=leg_m, side=leg_m, bevel=0.004)
        foot.parent = hip
        legs[s] = hip
    return {'group': g, 'root': root, 'neck': neck, 'jaw': jaw, 'wings': wings, 'legs': legs}


def set_wing(B, up, hand, sweep=0.0, fold=0.0, fwd=0.0):
    """up: shoulder elevation (deg, + = wing tip up); hand: extra bend of the outer wing (deg, + = up);
    sweep: wing swept back (deg); fold 0..1 = folded against the body; fwd = wing rotated forward (braking)."""
    for s, (sh, el) in B['wings'].items():
        if fold > 0:
            # folded: wing rotated back along the body, lying flat on the side
            sh.rotation_euler = Euler((math.radians(-5 + fwd), math.radians(-s * (12 + 70 * (1 - fold))),
                                       math.radians(s * (-(sweep + 80 * fold)))), 'XYZ')
            el.rotation_euler = Euler((0, 0, math.radians(s * (-150 * fold))), 'XYZ')
        else:
            sh.rotation_euler = Euler((math.radians(fwd), math.radians(-s * up), math.radians(-s * sweep)), 'XYZ')
            el.rotation_euler = Euler((0, math.radians(-s * hand), math.radians(-s * sweep * 0.6)), 'XYZ')


def set_legs(B, tuck):
    """tuck 0 = standing, 1 = folded back under the tail (flight)."""
    for s, hip in B['legs'].items():
        hip.rotation_euler = Euler((math.radians(-75 * tuck), 0, 0), 'XYZ')
        hip.scale = (1, 1, 1.0 - 0.45 * tuck)


def gull_pose(B, anim, i, n):
    root, neck, jaw = B['root'], B['neck'], B['jaw']
    t = i / float(n)
    ph = math.tau * t
    root.location = (0, 0, BODY_Z)
    root.rotation_euler = (0, 0, 0)
    neck.rotation_euler = (0, 0, 0)
    jaw.rotation_euler = (0, 0, 0)
    if anim == 'fly':
        a = 18 + 42 * math.cos(ph)
        set_wing(B, a, 22 * math.cos(ph - 1.0), sweep=6 + 6 * math.sin(ph))
        set_legs(B, 1.0)
        root.location = (0, 0, BODY_Z + 0.035 * math.sin(ph + 1.2))
        root.rotation_euler = (math.radians(4 * math.sin(ph)), 0, 0)
        neck.rotation_euler = (math.radians(-6), 0, 0)
    elif anim == 'glide':
        set_wing(B, 10, 4 + 2 * (1 if i else -1), sweep=10)
        set_legs(B, 1.0)
        root.rotation_euler = (math.radians(-2), math.radians(4 * (1 if i else -1)), 0)
        neck.rotation_euler = (math.radians(-6), 0, 0)
    elif anim == 'land':
        if i == 0:
            set_wing(B, 62, 18, sweep=-8, fwd=10)
            set_legs(B, 0.0)
            root.rotation_euler = (math.radians(-24), 0, 0)
            root.location = (0, 0, BODY_Z + 0.12)
        elif i == 1:
            set_wing(B, 20, -25, sweep=-20, fwd=28)
            set_legs(B, 0.0)
            root.rotation_euler = (math.radians(-16), 0, 0)
            root.location = (0, 0, BODY_Z + 0.05)
        elif i == 2:
            set_wing(B, 70, 40, sweep=12)
            set_legs(B, 0.0)
            root.rotation_euler = (math.radians(-6), 0, 0)
            root.location = (0, 0, BODY_Z - 0.015)
        else:
            set_wing(B, 0, 0, fold=0.6)
            set_legs(B, 0.0)
            root.rotation_euler = (math.radians(-3), 0, 0)
    else:  # idle
        set_wing(B, 0, 0, fold=1.0)
        set_legs(B, 0.0)
        if i == 1:
            neck.rotation_euler = (0, 0, math.radians(32))
        elif i == 2:
            root.location = (0, 0, BODY_Z - 0.02)
            neck.rotation_euler = (math.radians(-28), 0, 0)
            jaw.rotation_euler = (math.radians(32), 0, 0)
        elif i == 3:
            neck.rotation_euler = (0, 0, math.radians(-30))
    bpy.context.view_layer.update()


@SL.ship('seagull', 'full', {'fly': {'frames': 6, 'fps': 12, 'repeat': -1},
                             'glide': {'frames': 2, 'fps': 3, 'repeat': -1},
                             'land': {'frames': 4, 'fps': 10, 'repeat': 0},
                             'idle': {'frames': 4, 'fps': 4, 'repeat': -1}},
         length=0.55, beam=1.3, dirs=SL.GULL_DIRS, mirror=SL.GULL_MIRROR, samples=28, kind='bird', water=False,
         margin=4,
         notes='Chubby toy seagull: white body, big round head with bead eyes, yellow beak with a red spot, grey '
               'wings with black tips, orange feet. fly 6f loop / glide 2f / land 4f once / idle 4f (head turns, '
               'squawk on frame 2 - play sfx_seagull_*). Anchor = the feet for every frame.')
def b_seagull():
    B = build_gull()
    B['pose'] = gull_pose
    B['points'] = {'beak': Vector((0, -0.3, BODY_Z + 0.15)), 'body': Vector((0, 0, BODY_Z))}
    return B
