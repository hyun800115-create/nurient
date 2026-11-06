"""
deck43_chars.py - the v4.3 fishing-deck character anims (docs/redesign_v43/engineering_plan.md §9), rendered with the
characters' own rigs, camera, light and PPU (char_build / wkr_build / char_render / char_anim, imported READ-ONLY):

  player       `reel`       6 frames, 10 fps, once (0.6 s), impactFrame 3 (the first fish comes then): the chief
                            on the reel spot hauls a short rod up and back toward himself, facing the sea (NE only).
  fisherman, fisherman_b, fisherman_c (the three fisher looks) — seated on the deck's stool, facing the sea (NE only):
               `fsit_cast`  6 frames, 10 fps, once (0.6 s): wind up, cast, the float flies out
               `fsit_wait`  4 frames, 5 fps, loop: the rod held out, the float bobbing on the water
               `fsit_bite`  3 frames, 12 fps, loop: the rod tip jerks down, the float pulled under
               `fsit_reel`  6 frames, 10 fps, once (0.6 s): the rod comes up, the line winds in (the game then sends
                            the fish flying to the crate on land from the float's point)
Seated frames: the anchor is the FLOOR point under the stool (the deck's planks); the stool (SEAT_H) is the deck's art.
The float lands FAR m in front of him on the water, WATER_Z below the planks (world.js deck.lift = 0.3 m), so the
game's bobber point (FishingDeck.bobber) is the same place.  Fisher frames are 160 x 160 (anchor 80, 130 = the same
normalised anchor as every 128 x 128 character frame): the raised rod does not fit 128.

    nice -n 15 /tmp/bvenv/bin/python tools/blender/deck43_chars.py -- [--chars player,fisherman,...] [--samples 16]
        [--cache DIR] [--force]
Output: <cache>/<key>/<anim>_NE_<i>.png + <cache>/<key>/meta.json (anims, frameSize, anchor). deck43_pack.py packs.
"""
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                       # noqa: E402
from mathutils import Vector, Matrix   # noqa: E402
import bl_common as bc           # noqa: E402
import char_geo as g             # noqa: E402
import char_build as cb          # noqa: E402
import char_anim as ca           # noqa: E402
import char_render as cr         # noqa: E402

SEAT_H = 0.25            # stool seat above the planks (deck43_assets.SEAT_H)
WATER_Z = -0.30          # the water below the planks
FAR = 1.25               # the float lands this far in front of him (world.js / FishingDeck.bobber)
DIR = 'NE'
FISHERS = ['fisherman', 'fisherman_b', 'fisherman_c']
ANIMS = {
    'player': {'reel': dict(frames=6, fps=10, repeat=0, impactFrame=3)},
    'fisher': {'fsit_cast': dict(frames=6, fps=10, repeat=0), 'fsit_wait': dict(frames=4, fps=5, repeat=-1),
               'fsit_bite': dict(frames=3, fps=12, repeat=-1), 'fsit_reel': dict(frames=6, fps=10, repeat=0)},
}
FRAME_OF = {'player': (128, (64, 104)), 'fisher': (160, (80, 130))}


# --------------------------------------------------------------------------- the rod (a variant of char_build.make_rod)

def make_rod2(rig, name='rod', tilt=70.0, length=0.86):
    """char_build.make_rod with a configurable float: state '_far' (m in front), '_wz' (height of the water),
    '_dip' (the float pulled under), '_cast' 0 = the float hangs from the tip, 1 = out on the water."""
    M = cb.M
    t = g.empty(name + '_obj', rig.j['hand_R'])
    t.rotation_quaternion = g.q_axis((1, 0, 0), -tilt)
    objs = [g.mesh_obj(name + '_pole', g.bm_lathe([(0.0, 0.10), (0.019, 0.095), (0.016, -0.15), (0.011, -0.5),
                                                    (0.007, -length), (0.0, -length - 0.01)], seg=10, smooth_n=12),
                       M('rod', '#5B3A24', rough=0.45), t),
            g.mesh_obj(name + '_cork', g.bm_lathe([(0.0, 0.10), (0.025, 0.09), (0.024, -0.06), (0.0, -0.07)], seg=12,
                                                  smooth_n=8), M('cork', '#D8A86A', rough=0.8), t),
            g.mesh_obj(name + '_reel', g.bm_cyl(0.035, 0.035, 0.03, seg=16, centered=True), M('reel', '#C8463D', rough=0.4,
                                                                                            metal=0.2), t,
                       loc=(0, 0.045, -0.10), rot=(0, 90, 0))]
    tip = g.empty(name + '_tip', t, (0, 0, -length))
    rig.j[name + '_tip'] = tip
    rig.rest_loc[name + '_tip'] = Vector((0, 0, -length))
    line = g.tube_between(name + '_line', M('line', '#F4F7FB', rough=0.5), radius=0.005, seg=5)
    bob_top = g.mesh_obj(name + '_bob', g.merge(g.bm_ellipsoid(0.04, 0.04, 0.034, 12, 8)), M('bobber', '#E8433A', rough=0.3))
    bob_bot = g.mesh_obj(name + '_bob2', g.bm_ellipsoid(0.037, 0.037, 0.032, 12, 8), M('bobber_w', '#FFFFFF', rough=0.3))
    objs += [line, bob_top, bob_bot]
    rig.toggle(name, objs)

    def update(r):
        if line.hide_render:
            return
        tipw = r.world(name + '_tip')
        cast = float(r.state.get('_cast', 0.0))
        far = float(r.state.get('_far', 0.6))
        wz = float(r.state.get('_wz', 0.03)) - float(r.state.get('_dip', 0.0))
        hang = tipw + Vector((0, 0, -0.22))
        water = r.world('root', (0, -far, wz))
        b = hang.lerp(water, cast)
        r.meta['fx_point'] = b.copy()
        g.set_tube(line, tipw, b + Vector((0, 0, 0.03)))
        bob_top.matrix_world = Matrix.Translation(b + Vector((0, 0, 0.014)))
        bob_bot.matrix_world = Matrix.Translation(b + Vector((0, 0, -0.009)))
    rig.strings.append(update)
    return t


# --------------------------------------------------------------------------- poses

def seated(rig, lean=6.0, bob=0.0):
    hz = rig.rest_loc['hips'].z
    return {'hips@': (0, 0.02, SEAT_H + 0.065 - hz + bob), 'hip_R': (86, 8, 0), 'hip_L': (86, 8, 0),
            'knee_R': (78, 0, 0), 'knee_L': (84, 0, 0), 'spine': (-lean, 0, 0)}


R = lambda p, sp, e: {'sh_R': (p, sp, 0), 'el_R': (e, 0, 0)}     # noqa: E731
Lh = lambda p, sp, e: {'sh_L': (p, sp, 0), 'el_L': (e, 0, 0)}    # noqa: E731


def fisher_pose(rig, anim, i):
    base = {'_far': FAR, '_wz': WATER_Z, '_show': {'face_normal', 'rod'}}
    if anim == 'fsit_cast':
        keys = [
            ({**R(40, -8, 25), **Lh(36, -30, 46), 'head': (2, 0, 0)}, 0.0, 6),
            ({**R(92, -6, 45), **Lh(42, -26, 52), 'head': (-6, 0, 0)}, 0.0, 2),
            ({**R(104, -4, 58), **Lh(40, -24, 50), 'head': (-8, 0, 0)}, 0.0, -2),
            ({**R(70, -8, 25), **Lh(36, -28, 46), 'head': (2, 0, 0)}, 0.35, 8),
            ({**R(34, -10, 12), **Lh(34, -30, 44), 'head': (6, 0, 0)}, 0.85, 12),
            ({**R(38, -10, 18), **Lh(30, -30, 56), 'head': (4, 0, 0)}, 1.0, 9),
        ]
        k, cast, lean = keys[i]
        return {**seated(rig, lean), **k, **base, '_cast': cast}
    if anim == 'fsit_wait':
        s = math.sin(math.tau * i / 4)
        return {**seated(rig, 7 + s, 0.003 * s), **R(37 + 2 * s, -10, 16), **Lh(32, -30, 52), 'head': (4 - s, 0, 3 * s),
                **base, '_cast': 1.0, '_dip': 0.012 * (1 + s), '_show': {'face_normal' if i != 2 else 'face_smile', 'rod'}}
    if anim == 'fsit_bite':
        k = [(26, 0.07, 12), (20, 0.1, 14), (30, 0.04, 11)][i]
        return {**seated(rig, k[2]), **R(k[0], -10, 10), **Lh(30, -30, 50), 'head': (8, 0, 0), **base, '_cast': 1.0,
                '_dip': k[1], '_show': {'face_happy', 'rod'}}
    if anim == 'fsit_reel':
        keys = [(44, 18, 1.0, 9, (30, -30, 56)), (54, 24, 0.75, 6, (44, -26, 70)), (64, 30, 0.5, 4, (34, -24, 48)),
                (74, 34, 0.25, 3, (46, -26, 72)), (64, 28, 0.08, 4, (36, -28, 52)), (52, 22, 0.0, 6, (32, -30, 54))]
        p, e, cast, lean, lh = keys[i]
        roll = -8
        return {**seated(rig, lean), **R(p, roll, e), **Lh(*lh), 'head': (-2 if i in (2, 3) else 2, 0, 0), **base, '_cast': cast,
                '_show': {'face_happy' if i in (2, 3) else 'face_normal', 'rod'}}
    raise KeyError(anim)


def chief_pose(rig, anim, i):
    """`reel`: both hands on a short rod, a quick haul up and back toward himself, then down to catch."""
    st = {'hip_R': (2, 3, 0), 'hip_L': (2, 3, 0), 'knee_R': (4, 0, 0), 'knee_L': (4, 0, 0)}
    keys = [
        # rod low toward the water, line out
        ({**R(46, -6, 20), **Lh(44, -24, 40), 'spine': (-6, 0, 0), 'head': (4, 0, 0)}, 1.0, 'face_normal'),
        ({**R(60, -6, 28), **Lh(58, -22, 44), 'spine': (-2, 0, 0), 'head': (0, 0, 0)}, 0.7, 'face_normal'),
        ({**R(76, -6, 34), **Lh(72, -20, 48), 'spine': (4, 0, 0), 'head': (-6, 0, 0), 'hips@': (0, 0.02, -0.01)}, 0.35,
         'face_happy'),
        # impact: up high to his right, the line comes in (the fish come to him)
        ({**R(90, -6, 40), **Lh(84, -18, 52), 'spine': (7, 0, 0), 'head': (-8, 0, 0), 'hips@': (0, 0.03, -0.012)}, 0.1,
         'face_happy'),
        ({**R(74, -6, 32), **Lh(70, -20, 46), 'spine': (3, 0, 0), 'head': (-2, 0, 0)}, 0.0, 'face_smile'),
        ({**R(52, -6, 24), **Lh(50, -24, 42), 'spine': (-2, 0, 0), 'head': (2, 0, 0)}, 0.0, 'face_smile'),
    ]
    k, cast, face = keys[i]
    return {**st, **k, '_cast': cast, '_far': 0.9, '_wz': 0.03, '_show': {face, 'rod'}}


# --------------------------------------------------------------------------- render

def parse():
    a = bc.script_args()
    opt = {'chars': 'player,' + ','.join(FISHERS), 'samples': '16', 'cache': '/tmp/fv_cache/deck43_chars', 'force': False}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k == 'force':
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def render_key(key, opt):
    t0 = time.time()
    kind = 'player' if key == 'player' else 'fisher'
    anims = ANIMS[kind]
    size, anchor = FRAME_OF[kind]
    outdir = os.path.join(opt['cache'], key)
    os.makedirs(outdir, exist_ok=True)
    todo = []
    for an, info in anims.items():
        for i in range(info['frames']):
            path = os.path.join(outdir, '%s_%s_%d.png' % (an, DIR, i))
            if opt['force'] or not os.path.exists(path):
                todo.append((an, i, path))
    # the rod with the far float (patched in for the build only: char_build / char_gear call cb.make_rod)
    keep = cb.make_rod
    cb.make_rod = make_rod2
    try:
        rig = cb.build(key)
        if key == 'player':
            make_rod2(rig)
    finally:
        cb.make_rod = keep
    sc = bc.setup_render(size, size, samples=int(opt['samples']), denoise=True)
    sc.cycles.max_bounces = 4
    sc.cycles.diffuse_bounces = 2
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.transparent_max_bounces = 4
    sc.cycles.adaptive_threshold = 0.02
    sc.render.use_persistent_data = True
    bc.setup_camera(size, size, anchor)
    bc.setup_lighting()
    meta = {'key': key, 'kind': 'human', 'frameSize': [size, size], 'anchor': [anchor[0] / size, anchor[1] / size],
            'dir': DIR, 'anims': {}}
    mod = ca.POSE_MODS.get(key)
    for an, info in anims.items():
        m = dict(info)
        m['dirs'] = [DIR]
        meta['anims'][an] = m
    # the reel's impact point (the rod tip at the impact frame) and the fishers' float point
    for k, (an, i, path) in enumerate(todo):
        pose = chief_pose(rig, an, i) if kind == 'player' else fisher_pose(rig, an, i)
        if mod:
            pose = mod(an, i, anims[an]['frames'], pose)
        rig.apply(pose, yaw_deg=bc.DIR_YAW[DIR])
        rig.update_strings()
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 6 == 0:
            print('[%s] %d/%d %s_%d  %.0fs' % (key, k + 1, len(todo), an, i, time.time() - t0), flush=True)
    # points (px from the anchor): the float on the water (fishers), the rod tip at the reel's impact frame (chief)
    pts = {}
    if kind == 'fisher':
        pose = fisher_pose(rig, 'fsit_wait', 0)
        rig.apply(pose, yaw_deg=bc.DIR_YAW[DIR])
        rig.update_strings()
        bpy.context.view_layer.update()
        q = bc.world_to_pixel(tuple(rig.meta['fx_point']), size, size, anchor)
        pts['floatPoint'] = [round(q[0] - anchor[0]), round(q[1] - anchor[1])]
    else:
        pose = chief_pose(rig, 'reel', 3)
        rig.apply(pose, yaw_deg=bc.DIR_YAW[DIR])
        rig.update_strings()
        bpy.context.view_layer.update()
        q = bc.world_to_pixel(tuple(rig.world('rod_tip')), size, size, anchor)
        meta['anims']['reel']['impactPoint'] = {DIR: [round(q[0] - anchor[0]), round(q[1] - anchor[1])]}
    meta.update(pts)
    meta['shadow'] = rig.meta.get('shadow', [46, 18])
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] done in %.0fs' % (key, time.time() - t0), flush=True)


def main():
    opt = parse()
    for key in opt['chars'].split(','):
        render_key(key, opt)


if __name__ == '__main__':
    main()
