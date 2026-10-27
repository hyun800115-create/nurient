"""
pet2_hero.py - big transparent hero renders of the village dog 누리 for the designer / the store page
(the same 3D model, materials and game lights as the sprites; a soft 3/4 UI camera instead of the iso one).

    /tmp/bvenv/bin/python tools/blender/pet2_hero.py -- --out DIR [--size 1024] [--samples 64] [--only sit,run,chief]
        [--dx 0.28 --dy 0.12 --dyaw -28]   (chief shot: 누리's offset from the stroking hand, her turn)

    DIR/nuri_hero_sit.png     누리 sitting, button eyes, tongue out (square)
    DIR/nuri_hero_run.png     누리 running happily (square)
    DIR/nuri_hero_chief.png   the chief crouching and petting 누리 (4:3)
Writes only into --out; never touches assets/.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                       # noqa: E402
from mathutils import Vector     # noqa: E402
import bl_common as bc           # noqa: E402
import pet2_build as pb          # noqa: E402


def parse():
    a = bc.script_args()
    o = {'out': '/tmp/fv_cache/pets2_hero', 'size': '1024', 'samples': '64', 'only': 'sit,run,chief',
         'dx': '0.28', 'dy': '0.12', 'dyaw': '-28'}
    for i in range(0, len(a) - 1, 2):
        o[a[i].lstrip('-')] = a[i + 1]
    return o


def setup(w, h, samples):
    sc = bc.setup_render(w, h, samples=samples, denoise=True)
    sc.cycles.max_bounces = 4
    sc.render.film_transparent = True
    bc.setup_lighting()
    return sc


def camera(w, h, ppu, target, anchor):
    import vil_render
    for ob in [x for x in bpy.data.objects if x.type == 'CAMERA']:
        bpy.data.objects.remove(ob)
    vil_render.ui_camera(w, h, ppu, target, elev_deg=14.0, anchor_px=anchor)


def dog(anim, i, d, yaw, show=None, keep_scene=False):
    if keep_scene:
        orig = bc.reset_scene
        bc.reset_scene = lambda *a, **k: None
        try:
            rig = pb.build()
        finally:
            bc.reset_scene = orig
    else:
        rig = pb.build()
    p = pb.pose_for(rig, anim, i, d)
    if show is not None:
        p['_show'] = set(show)
    rig.apply(p, yaw_deg=yaw)
    rig.update_strings()
    bpy.context.view_layer.update()
    return rig


def solo(o, name, anim, i, d, yaw_off, show, ppu_k=1.0):
    S = int(o['size'])
    rig = dog(anim, i, d, bc.DIR_YAW[d] + yaw_off, show)
    setup(S, S, int(o['samples']))
    tz = rig.j['body'].matrix_world.translation.z
    camera(S, S, S * 0.80 * ppu_k, (0, 0, tz + 0.08), (S // 2, int(S * 0.52)))
    path = os.path.join(o['out'], name)
    bc.render_to(path)
    print('->', path, flush=True)


def with_chief(o):
    import char_build
    import char_anim
    W = int(o['size']) * 4 // 3
    H = int(o['size'])
    rig = char_build.build('player')                       # resets the scene
    pose = char_anim.pose_for('human', 'pet', 1, 6, 'player')
    pose['_show'] = {'face_happy'}
    chief_yaw = bc.DIR_YAW['E'] - 12                         # crouched, turned toward 누리 at his side (screen right)
    rig.apply(pose, yaw_deg=chief_yaw)
    rig.update_strings()
    bpy.context.view_layer.update()
    hand = rig.j['hand_R'].matrix_world.translation.copy()
    # 누리 sits at the chief's side under the stroking hand, looking up happily, three-quarters to the camera
    d = dog('sit', 0, 'S', bc.DIR_YAW['S'] + float(o['dyaw']), {'p_eye_happy', 'p_m_open'}, keep_scene=True)
    top = bpy.data.objects.get('pet_scale') or d.j['root'].parent
    bpy.context.view_layer.update()
    head = d.j['head'].matrix_world.translation
    top.location = (hand.x - head.x + float(o['dx']), hand.y - head.y + float(o['dy']), 0.0)
    bpy.context.view_layer.update()
    setup(W, H, int(o['samples']))
    mid = (Vector((0, 0, 0)) + top.location) * 0.5
    camera(W, H, H * 0.56, (mid.x, mid.y, 0.40), (W // 2, int(H * 0.55)))
    path = os.path.join(o['out'], 'nuri_hero_chief.png')
    bc.render_to(path)
    print('->', path, flush=True)


def main():
    o = parse()
    os.makedirs(o['out'], exist_ok=True)
    only = set(o['only'].split(','))
    if 'sit' in only:
        solo(o, 'nuri_hero_sit.png', 'sit', 0, 'S', -18, {'p_eye_dot', 'p_m_open'})
    if 'run' in only:
        solo(o, 'nuri_hero_run.png', 'run', 3, 'SE', 8, None, ppu_k=0.92)
    if 'chief' in only:
        with_chief(o)


if __name__ == '__main__':
    main()
