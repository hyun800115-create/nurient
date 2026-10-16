"""
ch2_render.py - render the v4.2 chief anims (CONTRACT_V42 AH) with the player rig, camera and light.

Re-run (build machine, bpy module; one Blender process at a time, niced):
    nice -n 10 /tmp/bvenv/bin/python tools/blender/ch2_render.py -- --anims all
On a PC with Blender:
    blender -b -P tools/blender/ch2_render.py -- --anims sit_read --dirs SE

Options (after the literal --):
    --anims  all | comma list (sit_idle,sit_write,sit_read,sit_eat,doze,talk,wave,warm_hands,cheer)
    --dirs   all | S,SE,E          --frames all | comma list      --samples 24 (as char_render)
    --cache  raw frame folder (default /tmp/fv_cache/chief2)      --force  re-render existing frames
    --meta-only   only (re)write <cache>/player_b/meta.json (impact / desk points)

Output: <cache>/player_b/<anim>_<dir>_<i>.png (128 x 128 RGBA, anchor (64, 104) = the feet for standing
anims and the SEAT POINT for seated ones) + meta.json; for the desk anims (ch2_anim.DESK_OVERLAY) also a second
flat-emission pass <anim>_<dir>_<i>_mask.png (white = surface ON the desk zone) that ch2_pack cuts the `_desk`
overlay frames with.  ~0.15 s a frame on 4 cores (the whole set incl. masks ~2 min).  Then:
    python3 tools/blender/ch2_pack.py      # ink outline (char_pack), atlas char_player_b, manifest, previews
    python3 tools/blender/ch2_check.py     # frame names, dirs, anchors, points, budget, char_player untouched

Scene = char_render.setup_scene (bl_common camera 30 deg / yaw 45, PPU 64, the same lights, samples,
bounces, denoiser) and the rig = char_build.build('player') + ch2_build extras.
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
import char_render               # noqa: E402  (setup_scene, FRAME, ANCHOR - imported, never edited)
import ch2_build                 # noqa: E402
import ch2_anim as ca            # noqa: E402

FRAME = char_render.FRAME        # 128
ANCHOR = char_render.ANCHOR      # (64, 104)
KEY = 'player_b'
DEFAULT_CACHE = '/tmp/fv_cache/chief2'


def parse_args():
    a = bc.script_args()
    opt = {'anims': 'all', 'dirs': 'all', 'frames': 'all', 'samples': '24', 'cache': DEFAULT_CACHE,
           'force': False, 'meta-only': False}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'meta-only'):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def px(p):
    q = bc.world_to_pixel(tuple(p), FRAME, FRAME, ANCHOR)
    return [round(q[0] - ANCHOR[0]), round(q[1] - ANCHOR[1])]


def write_meta(rig, outdir):
    anims = {}
    for an in ca.ORDER:
        info = dict(ca.ANIMS[an])
        info['dirs'] = list(ca.DIRS)
        anims[an] = info
    # sit_write impactPoint: the stamp's rubber face at the impact frame (px from the anchor, per dir)
    imp = {}
    info = anims['sit_write']
    for d in ca.DIRS:
        pose = ca.pose_for('sit_write', info['impactFrame'], info['frames'], d)
        ch2_build.apply(rig, pose, d)
        imp[d] = px(rig.meta['fx']['stamp'].matrix_world.translation)
    info['impactPoint'] = imp
    # seated reference points (px from the seat-point anchor): the floor under the seat (shadow) and the
    # centre of the desk / table top's near edge (0.72 m high, 0.10 m in front of the seat front)
    desk = {}
    for d in ca.DIRS:
        rig.apply({}, yaw_deg=bc.DIR_YAW[d])
        bpy.context.view_layer.update()
        root = rig.j['root'].matrix_world
        desk[d] = px(root @ Vector((0.0, -ca.DESK_EDGE, ca.DESK_TOP)))
    floor = px(Vector((0.0, 0.0, -ca.SEAT_H)))[1]          # the floor under the seat point (same for every dir)
    meta = {'key': KEY, 'kind': 'human', 'anims': anims, 'frameSize': [FRAME, FRAME],
            'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME],
            'seat': {'heightM': ca.SEAT_H, 'deskTopM': round(ca.SEAT_H + ca.DESK_TOP, 3), 'deskEdgeM': ca.DESK_EDGE,
                     'hipBackM': ca.SEAT_BACK, 'floorBelowPx': floor, 'deskEdgePoint': desk}}
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    return meta


def render_mask(rig, path):
    """Second pass of a seated frame: the desk-zone mask (flat emission material override, no denoise)."""
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    den = sc.cycles.use_denoising
    dith = sc.render.dither_intensity
    vl.material_override = ch2_build.mask_material(rig)
    sc.cycles.use_denoising = False
    sc.render.dither_intensity = 0.0
    try:
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
    finally:
        vl.material_override = None
        sc.cycles.use_denoising = den
        sc.render.dither_intensity = dith


def main():
    opt = parse_args()
    t0 = time.time()
    outdir = os.path.join(opt['cache'], KEY)
    os.makedirs(outdir, exist_ok=True)
    anims = ca.ORDER if opt['anims'] == 'all' else [a for a in opt['anims'].split(',') if a in ca.ANIMS]
    dirs = ca.DIRS if opt['dirs'] == 'all' else [d for d in opt['dirs'].split(',') if d in ca.DIRS]
    todo = []
    for an in anims:
        n = ca.ANIMS[an]['frames']
        frames = range(n) if opt['frames'] == 'all' else [int(f) for f in opt['frames'].split(',') if int(f) < n]
        for d in dirs:
            for i in frames:
                path = os.path.join(outdir, f'{an}_{d}_{i}.png')
                if opt['force'] or not os.path.exists(path):
                    todo.append((an, d, i, n, path))
    rig = ch2_build.build()
    char_render.setup_scene(int(opt['samples']))
    write_meta(rig, outdir)
    if opt['meta-only']:
        print('[player_b] meta written', flush=True)
        return
    print(f'[player_b] {len(todo)} frames to render', flush=True)
    worst = 0.0
    for k, (an, d, i, n, path) in enumerate(todo):
        pose = ca.pose_for(an, i, n, d)
        res = ch2_build.apply(rig, pose, d)
        for side, m in res['miss'].items():
            worst = max(worst, m)
            if m > 0.012:
                print(f'  WARN {an}_{d}_{i}: {side} mitten {m * 100:.1f} cm short of its target', flush=True)
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if an in ca.DESK_OVERLAY:
            render_mask(rig, path[:-4] + '_mask.png')
        if k % 10 == 0:
            print(f'[player_b] {k + 1}/{len(todo)} {an}_{d}_{i}  {time.time() - t0:.0f}s', flush=True)
    print(f'[player_b] done in {time.time() - t0:.0f}s (worst IK miss {worst * 100:.1f} cm)', flush=True)


if __name__ == '__main__':
    main()
