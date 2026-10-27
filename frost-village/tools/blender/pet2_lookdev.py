"""
pet2_lookdev.py - look-dev / hero renders of the village dog 누리 (pet2_build -> pet2_maltipoo).

    /tmp/bvenv/bin/python tools/blender/pet2_lookdev.py -- --turn  [--out DIR] [--samples 16] [--zoom 4]
        turnaround: the idle pose in all 8 directions + sit / happy / roll / beg in S and SE, through the GAME
        camera (iso 30 deg, the game lights) at `zoom` x game scale -> DIR/turn_<pose>_<dir>.png
    /tmp/bvenv/bin/python tools/blender/pet2_lookdev.py -- --hero [--out DIR] [--samples 64]
        designer hero renders on transparent backgrounds (soft 3/4 UI camera, 1024 px):
        DIR/hero_sit.png, DIR/hero_run.png  (the 'with the chief' hero is composed by pet2_hero.py)
Writes only into --out (default /tmp/fv_cache/pets2_lookdev); never touches assets/.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                      # noqa: E402
import bl_common as bc          # noqa: E402
import pet2_build as pb         # noqa: E402

DIRS8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']


def parse():
    a = bc.script_args()
    o = {'out': '/tmp/fv_cache/pets2_lookdev', 'samples': None, 'zoom': '4', 'turn': False, 'hero': False,
         'only': ''}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('turn', 'hero'):
            o[k] = True
            i += 1
        else:
            o[k] = a[i + 1]
            i += 2
    return o


def pose(rig, anim, i, d, face=None):
    p = pb.pose_for(rig, anim, i, d)
    if face:
        import pet2_anim as pa
        p['_show'] = (p['_show'] - set(sum(pa.PET2_FACES.values(), []))) | set(pa.PET2_FACES[face])
    pb.apply(rig, p, d)
    bpy.context.view_layer.update()


def p_root_yaw(rig):
    return 0.0


def turn(o):
    import vil_render
    z = int(o['zoom'])
    W = 128 * z
    rig = pb.build()
    vil_render.setup_scene(int(o['samples'] or 16), w=W, h=W, anchor=(64 * z, 104 * z), ppu=bc.PPU * z)
    jobs = [('idle', 0, d, None) for d in DIRS8]
    jobs += [(a, i, d, None) for a, i in (('sit', 0), ('happy', 2), ('roll', 0), ('beg', 0), ('run', 3))
             for d in ('S', 'SE', 'E')]
    only = set(filter(None, o['only'].split(',')))
    for anim, i, d, face in jobs:
        if only and anim not in only:
            continue
        dd = d if d in ('S', 'SE', 'E', 'NE', 'N') else {'SW': 'SE', 'W': 'E', 'NW': 'NE'}[d]
        pose(rig, anim, i, dd, face)
        if d != dd:                                    # mirrored dirs: really turn the model (true 8-dir look)
            import char_geo as g
            yaw = (p_root_yaw(rig) or 0.0)
            rig.j['root'].rotation_quaternion = g.q_axis((0, 0, 1), bc.DIR_YAW[d] + yaw)
            bpy.context.view_layer.update()
        path = os.path.join(o['out'], f'turn_{anim}{i}_{d}.png')
        bc.render_to(path)
        print('->', path, flush=True)


def hero(o):
    import vil_render
    rig = pb.build()
    sc = bc.setup_render(1024, 1024, samples=int(o['samples'] or 64), denoise=True)
    sc.cycles.max_bounces = 4
    bc.setup_lighting()
    shots = [('sit', 0, 'S', -18, 'pet_happy', 'hero_sit'), ('run', 3, 'SE', 0, None, 'hero_run'),
             ('idle', 0, 'S', -14, 'pet_neutral', 'hero_idle')]
    only = set(filter(None, o['only'].split(',')))
    for anim, i, d, yaw, face, name in shots:
        if only and name not in only:
            continue
        p = pb.pose_for(rig, anim, i, d)
        if face:
            import pet2_anim as pa
            p['_show'] = (p['_show'] - set(sum(pa.PET2_FACES.values(), []))) | set(pa.PET2_FACES[face])
        rig.apply(p, yaw_deg=bc.DIR_YAW[d] + yaw)
        rig.update_strings()
        bpy.context.view_layer.update()
        for ob in [x for x in bpy.data.objects if x.type == 'CAMERA']:
            bpy.data.objects.remove(ob)
        tz = rig.j['body'].matrix_world.translation.z + 0.02
        vil_render.ui_camera(1024, 1024, 1150, (0, 0, tz), elev_deg=16.0, anchor_px=(512, 560))
        path = os.path.join(o['out'], name + '.png')
        bc.render_to(path)
        print('->', path, flush=True)


def main():
    o = parse()
    os.makedirs(o['out'], exist_ok=True)
    if o['turn']:
        turn(o)
    if o['hero']:
        hero(o)


if __name__ == '__main__':
    main()
