"""
life2_stroller.py - the baby stroller 유모차 (docs/CONTRACT_V5.md section P), a characters-style atlas so a parent
can push it around the village (townsfolk2 `push` anim).

Look: a round toy-like retro pram - deep bathtub body in a soft pastel with a cream band and rim, a folding hood with
three ribs and a white scalloped brim, a little star rattle hanging from the brim, big white-rimmed wheels with gold
hubs on curly springs, a low push bar with a cream grip.  A chubby baby in a knit bonnet with a pom-pom sits under the
hood behind a star blanket, looking forward (its face is visible whenever the pram heads S / SE / E / SW / W).

Anims (5 render dirs S, SE, E, NE, N; the game mirrors SW / W / NW with flipX, like the characters):
    idle 4 f @ 6 fps   baby waves a mitten, tilts its head, blinks on the last frame; the rattle sways
    move 8 f @ 12 fps  wheels roll one full turn per loop (2 * pi * 0.13 m = 0.82 m -> ~1.2 m/s at 12 fps), soft
                       spring bounce, the baby bobs, the rattle swings
Frame 128 x 128, anchor (64, 104) = ground point under the pram centre (exactly the characters' frame).  NO baked
shadow (the game draws its soft ellipse, `shadow` [w, h]); life2_pack adds the characters' 1 px ink outline.

Points per dir (px from the anchor, rest pose): handlePoint = centre of the grip (handleHeightM above the ground,
handleBackM behind the pram centre), babyPoint = the baby's face (emotes), hoodTop.  life2_pack derives pushOffset
(pusher anchor -> pram anchor) from them, see the manifest notes.

Variants: baby_stroller (sky-blue pram, pink bonnet, butter blanket), baby_stroller_pink (pink pram, sky bonnet,
mint blanket).  Rendered by life2_render.py (keys baby_stroller*).
"""
import math
from collections import OrderedDict

import bmesh
import bpy  # noqa: F401
from mathutils import Vector, Matrix

import bl_common as bc
import prop_lib as L
from prop_lib import flat, tonal, box, cyl, sphere
import life2_lib as G
import life2_assets as A2

STROLLERS = OrderedDict()
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ANIMS = OrderedDict([('idle', {'frames': 4, 'fps': 6, 'repeat': -1}),
                     ('move', {'frames': 8, 'fps': 12, 'repeat': -1})])
FRAME = (128, 128)
ANCHOR = (64, 104)
GRIP = Vector((0.0, 0.53, 0.64))         # grip centre (local, front = -Y)
WHEEL_R = (0.11, 0.13)                   # front, rear


def stroller(key, body, bonnet, blanket, ko, en, notes=''):
    STROLLERS[key] = dict(key=key, body=body, bonnet=bonnet, blanket=blanket, name={'ko': ko, 'en': en},
                          notes=notes, samples=32)


stroller('baby_stroller', '#8FC3E8', '#F7A8C0', '#FFE59A', '유모차', 'Baby stroller')
stroller('baby_stroller_pink', '#F4A6BE', '#9CCBEB', '#BFE3D5', '유모차(분홍)', 'Baby stroller (pink)')


def wheel(name, r, body_col):
    """Pram wheel along local X: dark tyre, cream disc, three body-colour spokes (reads as rolling at 45 deg /
    frame), gold hub.  Returns the wheel's group (rotate .rotation_euler.x to roll)."""
    objs = [cyl(name + '_tyre', r, 0.036, (0, 0, 0), rot=(0, 90, 0), mat=flat('#3A3F4A', 0.5), segs=32,
                origin='center', bevel=0.014),
            cyl(name + '_disc', r * 0.8, 0.042, (0, 0, 0), rot=(0, 90, 0), mat=flat('#FFF3DE', 0.55), segs=32,
                origin='center', bevel=0.006),
            cyl(name + '_hub', r * 0.26, 0.056, (0, 0, 0), rot=(0, 90, 0), mat=flat(G.GOLD, 0.3, 0.6), segs=16,
                origin='center', bevel=0.008)]
    for k in range(3):
        a = math.tau * k / 3
        objs.append(box(name + '_spoke', (0.05, 0.03, r * 0.62), (0, 0, 0), rot=(math.degrees(a), 0, 0),
                        mat=flat(body_col, 0.5), bevel=0.008, origin='bottom'))
    return L.group(objs, name)


def build(spec):
    body_col, bonnet, blanket = spec['body'], spec['bonnet'], spec['blanket']
    root = bpy.data.objects.new('Stroller', None)
    bpy.context.scene.collection.objects.link(root)
    chrome = flat('#D6DDE6', 0.3, 0.75)
    cream = flat('#FFF3DE', 0.6)
    B = {'wheels': []}
    with L.Collect() as rig:
        # chassis (does not bounce)
        wheels = []
        for (y, r) in ((-0.2, WHEEL_R[0]), (0.21, WHEEL_R[1])):
            for sx in (-1, 1):
                w = wheel('w', r, body_col)
                w.location = (sx * 0.235, y, r)
                wheels.append(w)
            cyl('axle', 0.012, 0.47, (0, y, r), rot=(0, 90, 0), mat=chrome, segs=8, origin='center', bevel=0.0)
        B['wheels'] = wheels
        mb = G.MB()
        for y, r in ((-0.2, WHEEL_R[0]), (0.21, WHEEL_R[1])):
            for sx in (-1, 1):
                x = sx * 0.2
                pts = [Vector((x, y, r)), Vector((x, y - 0.06 * (1 if y < 0 else -1), r + 0.09)),
                       Vector((x, y * 0.6, 0.27))]
                for a, b in zip(pts, pts[1:]):
                    mb.seg(a, b, 0.013, chrome, segs=6)
        mb.done('springs')
    with L.Collect() as top:
        tub = flat(body_col, 0.5)
        box('tub', (0.42, 0.62, 0.27), (0, 0.0, 0.29), mat=tub, bevel=0.11, segs=4)
        box('band', (0.435, 0.635, 0.03), (0, 0.0, 0.44), mat=cream, bevel=0.012)
        box('rim', (0.44, 0.64, 0.035), (0, 0.0, 0.54), mat=cream, bevel=0.016)
        # hood over the back half
        A2.hood_shell('hood', (0, 0.1, 0.55), 0.23, flat(body_col, 0.55), flat('#FFF8EC', 0.7), axis=(0, 1, 0),
                      thick=0.018)
        mbh = G.MB()
        for phi in (30.0, 62.0):
            ph = math.radians(phi)
            rr = 0.236
            pts = [(rr * math.cos(t), 0.1 + rr * math.sin(t) * math.sin(ph), 0.55 + rr * math.sin(t) * math.cos(ph))
                   for t in [math.pi * j / 16 for j in range(17)]]
            for p, q in zip(pts, pts[1:]):
                mbh.seg(p, q, 0.009, cream, segs=6)
        for k in range(17):
            t = math.pi * k / 16
            mbh.sphere(0.026, flat('#FFFFFF', 0.75), loc=(0.235 * math.cos(t), 0.095, 0.55 + 0.235 * math.sin(t)),
                       scale=(1.0, 0.55, 1.0), segs=8, rings=5)
        mbh.done('hood_trim')
        # blanket over the front half
        box('blanket', (0.37, 0.34, 0.055), (0, -0.12, 0.53), mat=flat(blanket, 0.85), bevel=0.025)
        box('fold', (0.375, 0.07, 0.07), (0, 0.04, 0.53), mat=flat('#FFFFFF', 0.85), bevel=0.03)
        mbs = G.MB()
        G.star_dots(mbs, (0, -0.12, 0.0), 0.15, 0.13, 0.587, 7, col='#FFFFFF', seed=400, r=0.02)
        mbs.done('stars')
        # handle
        mbk = G.MB()
        for sx in (-1, 1):
            mbk.seg((sx * 0.17, 0.27, 0.45), (sx * 0.165, GRIP.y, GRIP.z), 0.016, chrome, segs=8)
        mbk.done('handlebars')
        cyl('grip', 0.026, 0.36, tuple(GRIP), rot=(0, 90, 0), mat=cream, segs=14, origin='center', bevel=0.01)
        # baby: torso under the hood, head, hand (awake / blink heads are swapped per frame)
        sphere('onesie', 0.1, (0, 0.04, 0.58), flat(L.hexmix(bonnet, '#FFFFFF', 0.25), 0.8), scale=(1.05, 0.9, 0.85),
               segs=18, rings=10)
        with L.Collect() as h_open:
            G.baby('baby', (0, 0.025, 0.69), s=1.12, bonnet=bonnet, awake=True, hand=False)
        with L.Collect() as h_blink:
            G.baby('babyb', (0, 0.025, 0.69), s=1.12, bonnet=bonnet, awake=True, blink=True, hand=False)
        hand = sphere('mitten', 0.04, (0.085, -0.06, 0.6), flat(L.hexmix(bonnet, '#FFFFFF', 0.3), 0.85),
                      scale=(1.0, 0.9, 1.05), segs=12, rings=8)
        hand2 = sphere('mitten2', 0.038, (-0.09, -0.04, 0.585), flat(L.hexmix(bonnet, '#FFFFFF', 0.3), 0.85),
                       segs=12, rings=8)
        del hand2
        # star rattle hanging from the brim
        rattle_piv = bpy.data.objects.new('rattle_piv', None)
        bpy.context.scene.collection.objects.link(rattle_piv)
        rattle_piv.location = (0.12, 0.095, 0.72)
        with L.Collect() as rat:
            L.tube('rstring', [(0, 0, 0), (0, 0, -0.08)], 0.004, flat('#F4F1EA', 0.5))
            o = L.extrude('rstar', [(x * 1.0, y * 1.0) for x, y in _star(0.045, 0.02)], 0.022, rot=(90, 0, 0),
                          top=flat(G.GOLD, 0.4, 0.3), side=flat('#E9B13C', 0.4, 0.3), bevel=0.006)
            o.location = (0, 0.011, -0.12)
        for o in rat.objs:
            if o.parent is None:
                o.parent = rattle_piv
    bouncer = bpy.data.objects.new('bouncer', None)
    bpy.context.scene.collection.objects.link(bouncer)
    bouncer.location = (0, 0.0, 0.3)
    inv = Matrix.Translation((0, 0, 0.3)).inverted()
    for o in top.objs:
        if o.parent is None and o is not bouncer:
            o.parent = bouncer
            o.matrix_parent_inverse = inv
    for o in rig.objs + [bouncer]:
        if o.parent is None:
            o.parent = root
    # head groups tilt around the neck: their group empties are the top-level objects of each Collect
    B.update(root=root, bouncer=bouncer, head_open=[o for o in h_open.objs if o.type == 'EMPTY' and o.name.startswith('baby')],
             head_blink=[o for o in h_blink.objs if o.type == 'EMPTY' and o.name.startswith('babyb')],
             h_open=h_open.objs, h_blink=h_blink.objs, hand=hand, rattle=rattle_piv)
    B['points'] = {'handlePoint': tuple(GRIP), 'babyPoint': (0.0, -0.06, 0.68), 'hoodTop': (0.0, 0.12, 0.8)}
    return B


def _star(r1, r2, n=5):
    return [((r1 if k % 2 == 0 else r2) * math.cos(math.pi / 2 + math.pi * k / n),
             (r1 if k % 2 == 0 else r2) * math.sin(math.pi / 2 + math.pi * k / n)) for k in range(2 * n)]


def _show(objs, on):
    for o in objs:
        o.hide_render = not on
        o.hide_viewport = not on


def pose(B, anim, i, n):
    t = i / float(n)
    if anim == 'idle':
        B['bouncer'].location.z = 0.3
        B['bouncer'].rotation_euler.x = 0.0
        roll = 0.0
        head_tilt = 7.0 * math.sin(math.tau * t)
        hand_up = (0.0, 0.035, 0.07, 0.035)[i % 4]
        blink = (i == 3)
        swing = 14.0 * math.sin(math.tau * t)
    else:
        B['bouncer'].location.z = 0.3 + 0.009 * abs(math.sin(math.tau * t * 2))
        B['bouncer'].rotation_euler.x = math.radians(1.6 * math.sin(math.tau * t * 2))
        roll = -math.tau * t                          # forward roll (front = -Y): wheels turn about +X negatively
        head_tilt = 4.0 * math.sin(math.tau * t * 2 + 0.6)
        hand_up = 0.012 * math.sin(math.tau * t * 2)
        blink = False
        swing = 22.0 * math.sin(math.tau * t * 2 + 1.0)
    for w in B['wheels']:
        w.rotation_euler.x = roll + 0.4
    _show(B['h_open'], not blink)
    _show(B['h_blink'], blink)
    for g in B['head_open'] + B['head_blink']:
        g.rotation_euler.y = math.radians(head_tilt)
    B['hand'].location.z = 0.6 + hand_up
    B['hand'].location.x = 0.085 + hand_up * 0.3
    B['rattle'].rotation_euler.x = math.radians(swing)


def measure_fit(B):
    """Check that every dir / frame fits the 128 x 128 character frame at anchor (64, 104)."""
    worst = [0, 0, 0, 0]
    for d in DIRS:
        B['root'].rotation_euler.z = bc.yaw_for_dir(d)
        for anim, a in ANIMS.items():
            for i in range(a['frames']):
                pose(B, anim, i, a['frames'])
                bpy.context.view_layer.update()
                objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE') and not o.hide_render]
                for p in L.world_points(objs):
                    x, y = L.screen_xy(p)
                    worst = [min(worst[0], x), max(worst[1], x), min(worst[2], y), max(worst[3], y)]
    return worst
