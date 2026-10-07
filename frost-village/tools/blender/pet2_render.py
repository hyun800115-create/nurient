"""
pet2_render.py - render the dog-play fragment assets/pets2 (CONTRACT_V4 section I) with Blender Cycles:
the full pet_dog re-render (batch-1 look + eat / roll / beg / run_ball / catch / trick) and the two
items item_treat / item_ball.

Re-run (build machine, bpy module), from frost-village/:
    /tmp/bvenv/bin/python tools/blender/pet2_render.py -- --portrait --items
On your PC with Blender 4.2+:
    blender -b -P tools/blender/pet2_render.py -- --portrait --items

Options (after the literal --):
    --anims   all | comma list (pet2_anim.ORDER)    --dirs all | S,SE,E,NE,N    --frames all | 0,3
    --samples 24          --cache /tmp/fv_cache/pets2
    --force               re-render existing frames (default: resumable, skips PNGs that exist)
    --portrait            also render the 128x128 portrait (vil_render.render_portrait, same UI camera)
    --items               also render item_treat + item_ball (bld_render.render_build, 72x72 item frame)
    --only-items          items only            --meta-only   only rewrite <cache>/pet_dog/meta.json
Output: <cache>/pet_dog/<anim>_<dir>_<i>.png (128x128 RGBA, anchor (64,104)), <cache>/pet_dog/meta.json,
<cache>/pet_dog/portrait.png, <cache>/items/<item>.png + .json (bld_render sidecar format).
Then: python3 tools/blender/pet2_pack.py && python3 tools/blender/pet2_check.py

Reuses (read-only, never modified): bl_common, char_geo, vil_pets (the dog model), vil_anim (batch-1
poses), vil_render (scene setup + portrait), bld_assets / bld_render (item helpers + item render).
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                       # noqa: E402
from mathutils import Vector     # noqa: E402
import bl_common as bc           # noqa: E402
import pet2_build as pb          # noqa: E402
import pet2_anim as pa           # noqa: E402

FRAME = 128
ANCHOR = (64, 104)
DEFAULT_CACHE = '/tmp/fv_cache/pets2'
KEY = pb.KEY


def parse_args():
    a = bc.script_args()
    opt = {'anims': 'all', 'dirs': 'all', 'frames': 'all', 'samples': '24', 'cache': DEFAULT_CACHE,
           'force': False, 'portrait': False, 'items': False, 'only-items': False, 'meta-only': False}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'portrait', 'items', 'only-items', 'meta-only'):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def setup_scene(samples):
    import vil_render
    return vil_render.setup_scene(samples)          # same Cycles settings as the batch-1 villagers


def px_off(p):
    px = bc.world_to_pixel(tuple(p), FRAME, FRAME, ANCHOR)
    return [round(px[0] - ANCHOR[0]), round(px[1] - ANCHOR[1])]


def joint_px(rig, anim, i, d, joint, local=(0, 0, 0)):
    pb.apply(rig, pb.pose_for(rig, anim, i, d), d)
    bpy.context.view_layer.update()
    return px_off(rig.j[joint].matrix_world @ Vector(local))


def write_meta(rig, anims, outdir):
    meta = {'key': KEY, 'kind': 'pet', 'anims': {a: dict(v) for a, v in anims.items()},
            'frameSize': [FRAME, FRAME], 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME],
            'shadow': rig.meta.get('shadow', [54, 23])}
    c = meta['anims']['catch']
    c['impactPoint'] = {d: joint_px(rig, 'catch', c['impactFrame'], d, 'ball_j') for d in c['dirs']}
    meta['mouthPoint'] = {d: joint_px(rig, 'idle', 0, d, 'ball_j') for d in pa.LOCO}
    meta['treatPoint'] = {d: joint_px(rig, 'eat', 0, d, 'treat_j') for d in pa.SOCIAL}
    meta['bellyPoint'] = {d: joint_px(rig, 'roll', 0, d, 'body', (0.0, 0.02, -0.11)) for d in pa.SOCIAL}
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def render_dog(opt):
    t0 = time.time()
    anims = pb.anims()
    want = list(anims) if opt['anims'] == 'all' else [x for x in opt['anims'].split(',') if x in anims]
    outdir = os.path.join(opt['cache'], KEY)
    os.makedirs(outdir, exist_ok=True)
    todo = []
    for anim in want:
        info = anims[anim]
        dirs = info['dirs'] if opt['dirs'] == 'all' else [d for d in opt['dirs'].split(',') if d in info['dirs']]
        n = info['frames']
        frames = range(n) if opt['frames'] == 'all' else [int(f) for f in opt['frames'].split(',') if int(f) < n]
        for d in dirs:
            for i in frames:
                path = os.path.join(outdir, f'{anim}_{d}_{i}.png')
                if opt['force'] or not os.path.exists(path):
                    todo.append((anim, d, i, path))
    rig = pb.build()
    setup_scene(int(opt['samples']))
    write_meta(rig, anims, outdir)
    if opt['meta-only']:
        print(f'[{KEY}] meta written', flush=True)
        return
    print(f'[{KEY}] {len(todo)} frames to render', flush=True)
    for k, (anim, d, i, path) in enumerate(todo):
        pb.apply(rig, pb.pose_for(rig, anim, i, d), d)
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 20 == 0:
            print(f'[{KEY}] {k + 1}/{len(todo)} {anim}_{d}_{i}  {time.time() - t0:.0f}s', flush=True)
    print(f'[{KEY}] done in {time.time() - t0:.0f}s', flush=True)


def render_portrait(opt):
    import vil_render
    vil_render.render_portrait(KEY, {'cache': opt['cache'], 'force': opt['force'], 'samples': opt['samples']})


def render_items(opt):
    import pet2_items
    import bld_render
    cache = os.path.join(opt['cache'], 'items')
    os.makedirs(cache, exist_ok=True)
    for key in pet2_items.ITEMS:
        if not opt['force'] and bld_render.cached(key, cache):
            print(f'[{key}] cached', flush=True)
            continue
        bld_render.render_build(pet2_items.spec(key), cache)


def main():
    opt = parse_args()
    if not opt['only-items']:
        render_dog(opt)
        if opt['portrait']:
            render_portrait(opt)
    if opt['items'] or opt['only-items']:
        render_items(opt)


if __name__ == '__main__':
    main()
