"""
vil3_render.py - render the batch-3 station operators (기획서_v3_분업) with Cycles.

Re-run (build machine, bpy module; resumable - existing PNGs are skipped):
    /tmp/bvenv/bin/python tools/blender/vil3_render.py -- --chars all --samples 24 --portraits
On your PC with Blender installed:
    blender -b -P tools/blender/vil3_render.py -- --chars npc_sawyer --cache C:/fv_cache/villagers3

Options (after the literal --):
    --chars   all | comma list of keys (vil3_build.ALL_KEYS)        default all
    --anims   all | comma list         --dirs all | S,SE,E,NE,N   --frames all | 0,3
    --samples 24 (same as batch 1 + 2)  --cache /tmp/fv_cache/villagers3
    --force        re-render existing frames
    --portraits    also render the 128x128 portraits (override keys use the batch-1/2
                   portrait code unchanged, so they come out like the originals)
    --only-extras  portraits only           --meta-only  only rewrite <cache>/<key>/meta.json
    --pincheck     no rendering: pose every operate frame in every dir and print how far
                   each mitten is from its '_work' target (IK reach check)

Output: <cache>/<key>/<anim>_<dir>_<i>.png (128x128 RGBA, anchor (64,104)),
<cache>/<key>/meta.json, <cache>/<key>/portrait.png.
Then: python3 tools/blender/vil3_pack.py  &&  python3 tools/blender/vil3_check.py

meta.json: anims (+dirs, impactFrame), carryStyle 'front', carryPoint {dir: [dx, dy,
behind]} (between the hands on carry_walk frame 0, +5 cm, behind = NE/N - the batch-1/2
rule), carryPointFrames, serve.impactPoint (chef), operate.impactPoint {dir: [dx, dy]}
(the 'fx' marker on impactFrame), operate.beats [{frame, kind, point{dir}}], seat data
(aunt), headTop (geometry, like batch 2), shadow, pinErr (max IK miss over operate, m).
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                       # noqa: E402
import bl_common as bc           # noqa: E402
import vil_render as vr          # noqa: E402   (setup_scene, px_off, portraits; nothing runs on import)
import vil2_render as vr2        # noqa: E402   (head_top_px, portraits)
import vil3_build as vb3         # noqa: E402
import vil3_anim as va3          # noqa: E402
import vil_anim as va            # noqa: E402

FRAME = vr.FRAME
ANCHOR = vr.ANCHOR
DEFAULT_CACHE = '/tmp/fv_cache/villagers3'
px_off = vr.px_off


def parse_args():
    a = bc.script_args()
    opt = {'chars': 'all', 'anims': 'all', 'dirs': 'all', 'frames': 'all', 'samples': '24',
           'cache': DEFAULT_CACHE, 'force': False, 'portraits': False, 'only-extras': False,
           'meta-only': False, 'pincheck': False}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'portraits', 'only-extras', 'meta-only', 'pincheck'):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def apply(rig, pose, d):
    rig.apply(pose, yaw_deg=bc.DIR_YAW[d])
    rig.update_strings()


def render_character(key, opt):
    t0 = time.time()
    anims = vb3.anims_for(key)
    want = list(anims) if opt['anims'] == 'all' else [x for x in opt['anims'].split(',') if x in anims]
    outdir = os.path.join(opt['cache'], key)
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
    rig = vb3.build(key)
    vr.setup_scene(int(opt['samples']))
    write_meta(key, rig, anims, outdir)
    if opt['meta-only']:
        print(f'[{key}] meta written', flush=True)
        return rig
    print(f'[{key}] {len(todo)} frames to render', flush=True)
    for k, (anim, d, i, path) in enumerate(todo):
        apply(rig, vb3.pose_for(rig, anim, i, d), d)
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 20 == 0:
            print(f'[{key}] {k + 1}/{len(todo)} {anim}_{d}_{i}  {time.time() - t0:.0f}s', flush=True)
    print(f'[{key}] done in {time.time() - t0:.0f}s', flush=True)
    return rig


def marker_px(rig, name):
    bpy.context.view_layer.update()
    return px_off(rig.meta['markers'][name].matrix_world.translation)


def write_meta(key, rig, anims, outdir):
    meta = {'key': key, 'kind': 'villager', 'role3': vb3.ROLE[key], 'source': vb3.SOURCE.get(key, 'villagers3'),
            'anims': {a: dict(v) for a, v in anims.items()}, 'frameSize': [FRAME, FRAME],
            'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'shadow': rig.meta.get('shadow', [46, 18]),
            'carryStyle': 'front'}
    cp, cpf = {}, {}
    info = anims['carry_walk']
    for d in info['dirs']:
        pts = []
        for i in range(info['frames']):
            apply(rig, vb3.pose_for(rig, 'carry_walk', i, d), d)
            bpy.context.view_layer.update()
            p = (rig.world('hand_R') + rig.world('hand_L')) * 0.5
            p.z += 0.05
            pts.append(px_off(p))
        cp[d] = pts[0] + [d in ('NE', 'N')]
        cpf[d] = pts
    meta['carryPoint'] = cp
    meta['carryPointFrames'] = cpf
    if 'serve' in anims:
        sinfo = meta['anims']['serve']
        ip = {}
        for d in sinfo['dirs']:
            apply(rig, vb3.pose_for(rig, 'serve', sinfo['impactFrame'], d), d)
            bpy.context.view_layer.update()
            ip[d] = px_off(rig.meta['serve_prop'].matrix_world.translation)
        sinfo['impactPoint'] = ip
    # operate: impactPoint (fx marker on impactFrame) + beats (+ IK reach check)
    oinfo = meta['anims']['operate']
    role = vb3.ROLE[key]
    R = va3.ROLES[role]
    f1 = oinfo['impactFrame']
    f2, kind2 = R['beat2']
    ip, ip2, err = {}, {}, 0.0
    for d in oinfo['dirs']:
        for i in range(oinfo['frames']):
            apply(rig, vb3.pose_for(rig, 'operate', i, d), d)
            err = max(err, rig.meta.get('pin_err', 0.0))
            if i == f1:
                ip[d] = marker_px(rig, 'op_fx')
            if i == f2:
                ip2[d] = marker_px(rig, 'op_fx2')
    oinfo['impactPoint'] = ip
    oinfo['beats'] = [{'frame': f1, 'kind': R['impact'], 'point': ip},
                      {'frame': f2, 'kind': kind2, 'point': ip2}]
    meta['pinErr'] = round(err, 4)
    apply(rig, vb3.pose_for(rig, 'idle', 0, 'S'), 'S')
    meta['headTop'] = vr2.head_top_px(rig)
    if 'sit' in anims:
        meta['seatOffset'] = [0, 0]
        meta['seatHeightPx'] = round(va.SEAT_H * bc.VERTICAL_SCALE * bc.PPU)
        apply(rig, vb3.pose_for(rig, 'sit', 0, 'S'), 'S')
        meta['headTopSit'] = vr2.head_top_px(rig)
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[{key}] meta: operate impact {ip}  pinErr {err * 100:.2f} cm', flush=True)


def pincheck(key):
    rig = vb3.build(key)
    info = vb3.anims_for(key)['operate']
    worst = []
    for d in info['dirs']:
        for i in range(info['frames']):
            apply(rig, vb3.pose_for(rig, 'operate', i, d), d)
            worst.append((rig.meta.get('pin_err', 0.0), d, i))
    worst.sort(reverse=True)
    print(f'[{key}] pin error worst: ' + ', '.join(f'{d}{i} {e * 100:.1f}cm' for e, d, i in worst[:6]), flush=True)


# --------------------------------------------------------------------------- portraits

PORTRAIT_PPU = {'npc_sawyer': 122, 'npc_smoker': 118, 'npc_cannery': 120}


def render_portrait(key, opt):
    """Override keys: the unchanged batch-1/2 portrait code (identical framing).  New keys: same recipe."""
    out = os.path.join(opt['cache'], key, 'portrait.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and not opt['force']:
        return out
    if vb3.SOURCE.get(key) == 'villagers':
        return vr.render_portrait(key, opt)
    if vb3.SOURCE.get(key) == 'villagers2':
        return vr2.render_portrait(key, opt)
    rig = vb3.build(key)
    sc = bc.setup_render(128, 128, samples=max(48, int(opt['samples'])), denoise=True)
    sc.cycles.max_bounces = 4
    bc.setup_lighting()
    pose = vb3.pose_for(rig, 'idle', 0, 'S')
    pose['head'] = (4, 0, 0)
    pose['_show'] = vb3.show_set(rig, 'smile', set(), 'idle')
    rig.apply(pose, yaw_deg=bc.DIR_YAW['S'] - 12)
    rig.update_strings()
    bpy.context.view_layer.update()
    hs = rig.meta['body']['head']
    tz = rig.world('head').z + 0.27 * hs - 0.02
    vr.ui_camera(128, 128, PORTRAIT_PPU.get(key, 128), (0, 0, tz), anchor_px=(64, 70))
    bc.render_to(out)
    print(f'[{key}] portrait -> {out}', flush=True)
    return out


def main():
    opt = parse_args()
    keys = vb3.ALL_KEYS if opt['chars'] == 'all' else opt['chars'].split(',')
    for key in keys:
        if opt['pincheck']:
            pincheck(key)
            continue
        if not opt['only-extras']:
            render_character(key, opt)
        if opt['portraits']:
            render_portrait(key, opt)


if __name__ == '__main__':
    main()
