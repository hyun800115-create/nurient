"""
vil2_render.py - render the batch-2 residents (CONTRACT_V3 section D) with Cycles.

Re-run (build machine, bpy module; resumable - existing PNGs are skipped):
    /tmp/bvenv/bin/python tools/blender/vil2_render.py -- --chars all --samples 24 --portraits
On your PC with Blender installed:
    blender -b -P tools/blender/vil2_render.py -- --chars npc_porter_a --cache C:/fv_cache/villagers2

Options (after the literal --):
    --chars   all | comma list of keys (see vil2_build.KEYS)       default all
    --anims   all | comma list         --dirs all | S,SE,E,NE,N   --frames all | 0,3
    --samples 24                       --cache /tmp/fv_cache/villagers2
    --force        re-render existing frames
    --portraits    also render 128x128 portraits (UI camera, like batch 1)
    --only-extras  portraits only           --meta-only  only rewrite <cache>/<key>/meta.json
    --lookdev      expression look-dev: <cache>/_lookdev/<key>_<face>_<S|E>.png + _S_zoom.png
                   (--faces a,b to limit), composed by vil2_lookdev.py

Output: <cache>/<key>/<anim>_<dir>_<i>.png (128x128 RGBA, anchor (64,104)),
<cache>/<key>/meta.json, <cache>/<key>/portrait.png.
Then: python3 tools/blender/vil2_pack.py  &&  python3 tools/blender/vil2_check.py

meta.json (consumed by vil2_pack): anims (+dirs, impactFrame), carryStyle
('back' for porters, else 'front'), carryPoint {dir: [dx, dy, behind]} (porters:
stack bottom on the carrier shelf, behind = S/SE/E; others: between the hands,
behind = NE/N), carryPointFrames {dir: [[dx, dy] per carry_walk frame]},
serve.impactPoint {dir: [dx, dy]} (parcel/dish centre on the hand-over frame),
seatOffset/seatHeightPx for sitters, headTop / headTopSit measured on the head
geometry (hair/hat incl., carrier frames and the guard's spear excluded), shadow.

Batch 1 (vil_render.py, assets/villagers) is untouched; this module only imports
its scene setup + projection helpers.
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
import vil_render as vr          # noqa: E402   (setup_scene, px_off, ui_camera; nothing runs on import)
import vil2_build as vb2         # noqa: E402
import vil_anim as va            # noqa: E402

FRAME = vr.FRAME
ANCHOR = vr.ANCHOR
DEFAULT_CACHE = '/tmp/fv_cache/villagers2'


def parse_args():
    a = bc.script_args()
    opt = {'chars': 'all', 'anims': 'all', 'dirs': 'all', 'frames': 'all', 'samples': '24',
           'cache': DEFAULT_CACHE, 'force': False, 'portraits': False, 'only-extras': False,
           'meta-only': False, 'lookdev': False, 'faces': 'all'}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'portraits', 'only-extras', 'meta-only', 'lookdev'):
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
    anims = vb2.anims_for(key)
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
    rig = vb2.build(key)
    vr.setup_scene(int(opt['samples']))
    write_meta(key, rig, anims, outdir)
    if opt['meta-only']:
        print(f'[{key}] meta written', flush=True)
        return rig
    print(f'[{key}] {len(todo)} frames to render', flush=True)
    for k, (anim, d, i, path) in enumerate(todo):
        apply(rig, vb2.pose_for(rig, anim, i, d), d)
        tmp = path + '.tmp.png'
        bc.render_to(tmp)
        os.replace(tmp, path)
        if k % 20 == 0:
            print(f'[{key}] {k + 1}/{len(todo)} {anim}_{d}_{i}  {time.time() - t0:.0f}s', flush=True)
    print(f'[{key}] done in {time.time() - t0:.0f}s', flush=True)
    return rig


px_off = vr.px_off


def _descends(ob, root):
    p = ob.parent
    while p is not None:
        if p == root:
            return True
        p = p.parent
    return False


def head_top_px(rig):
    """Highest screen pixel (relative to the anchor) of everything on the head
    (hair, hats, hood ...), from the real vertices of the current pose."""
    bpy.context.view_layer.update()
    head = rig.j['head']
    best = None
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or ob.hide_render or not _descends(ob, head):
            continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            w = mw @ v.co
            y = bc.world_to_pixel(tuple(w), FRAME, FRAME, ANCHOR)[1]
            best = y if best is None else min(best, y)
    return int(round(best - ANCHOR[1])) - 1          # -1: the packer's 1 px ink outline


def write_meta(key, rig, anims, outdir):
    ch = rig.meta['ch']
    meta = {'key': key, 'kind': 'villager', 'anims': {a: dict(v) for a, v in anims.items()},
            'frameSize': [FRAME, FRAME], 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME],
            'shadow': rig.meta.get('shadow', [46, 18])}
    back = ch.get('carry') == 'back'
    meta['carryStyle'] = 'back' if back else 'front'
    cp, cpf = {}, {}
    info = anims['carry_walk']
    for d in info['dirs']:
        pts = []
        for i in range(info['frames']):
            apply(rig, vb2.pose_for(rig, 'carry_walk', i, d), d)
            bpy.context.view_layer.update()
            if back:
                p = rig.meta['markers']['carry_marker'].matrix_world.translation.copy()
            else:
                p = (rig.world('hand_R') + rig.world('hand_L')) * 0.5
                p.z += 0.05
            pts.append(px_off(p))
        behind = (d in ('S', 'SE', 'E')) if back else (d in ('NE', 'N'))
        cp[d] = pts[0] + [behind]
        cpf[d] = pts
    meta['carryPoint'] = cp
    meta['carryPointFrames'] = cpf
    if 'serve' in anims:
        sinfo = meta['anims']['serve']
        ip = {}
        for d in sinfo['dirs']:
            apply(rig, vb2.pose_for(rig, 'serve', sinfo['impactFrame'], d), d)
            bpy.context.view_layer.update()
            ip[d] = px_off(rig.meta['serve_prop'].matrix_world.translation)
        sinfo['impactPoint'] = ip
    apply(rig, vb2.pose_for(rig, 'idle', 0, 'S'), 'S')
    meta['headTop'] = head_top_px(rig)
    if 'sit' in anims:
        meta['seatOffset'] = [0, 0]
        meta['seatHeightPx'] = round(va.SEAT_H * bc.VERTICAL_SCALE * bc.PPU)
        apply(rig, vb2.pose_for(rig, 'sit', 0, 'S'), 'S')
        meta['headTopSit'] = head_top_px(rig)
    with open(os.path.join(outdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)


# --------------------------------------------------------------------------- portraits

PORTRAIT_PPU = {'npc_toddler': 150, 'npc_chef': 104, 'npc_porter_b': 110, 'npc_skater': 122,
                'npc_porter_a': 120, 'npc_guard': 116, 'npc_captain': 120}


def render_portrait(key, opt):
    out = os.path.join(opt['cache'], key, 'portrait.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out) and not opt['force']:
        return out
    rig = vb2.build(key)
    sc = bc.setup_render(128, 128, samples=max(48, int(opt['samples'])), denoise=True)
    sc.cycles.max_bounces = 4
    bc.setup_lighting()
    pose = vb2.pose_for(rig, 'idle', 0, 'S')
    pose['head'] = (4, 0, 0)
    keep = pose['_show'] & {'spear', 'palette', 'brush'}
    pose['_show'] = vb2.show_set(rig, 'smile', keep, 'idle')
    rig.apply(pose, yaw_deg=bc.DIR_YAW['S'] - 12)
    rig.update_strings()
    bpy.context.view_layer.update()
    hs = rig.meta['body']['head']
    tz = rig.world('head').z + 0.27 * hs - 0.02
    if key == 'npc_chef':
        tz += 0.06
    vr.ui_camera(128, 128, PORTRAIT_PPU.get(key, 128), (0, 0, tz), anchor_px=(64, 70))
    bc.render_to(out)
    print(f'[{key}] portrait -> {out}', flush=True)
    return out


# --------------------------------------------------------------------------- look-dev

LOOKDEV_FACES = vr.LOOKDEV_FACES


def render_lookdev(key, opt):
    """Game-scale (128px world camera) + zoomed head close-ups of each expression."""
    out = os.path.join(opt['cache'], '_lookdev')
    os.makedirs(out, exist_ok=True)
    rig = vb2.build(key)
    faces = LOOKDEV_FACES if opt['faces'] == 'all' else opt['faces'].split(',')
    vr.setup_scene(int(opt['samples']))
    for zoom in (False, True):
        if zoom:
            for obj in [o for o in bpy.data.objects if o.type == 'CAMERA']:
                bpy.data.objects.remove(obj)
            apply(rig, vb2.pose_for(rig, 'idle', 0, 'S'), 'S')
            bpy.context.view_layer.update()
            hs = rig.meta.get('body', {}).get('head', 1.0)
            hc = rig.j['head'].matrix_world @ Vector((0, 0, 0.27 * hs - 0.03))
            sc = bpy.context.scene
            sc.render.resolution_x = sc.render.resolution_y = 160
            sc.cycles.samples = int(opt['samples']) + 12
            bc.setup_camera(160, 160, (80, 80), ppu=230 / hs, target=tuple(hc))
        for fc in faces:
            for d in (('S', 'E') if not zoom else ('S',)):
                pose = vb2.pose_for(rig, 'idle', 0, d)
                pose['_show'] = vb2.show_set(rig, fc, pose['_show'] & {'palette', 'brush'}, 'idle')
                if d == 'E':
                    pose['head'] = (0, 0, -20)
                    pose['spine'] = (0, 0, -9)
                apply(rig, pose, d)
                path = os.path.join(out, f'{key}_{fc}_{d}{"_zoom" if zoom else ""}.png')
                bc.render_to(path)
        print(f'[{key}] lookdev zoom={zoom} done', flush=True)


def main():
    opt = parse_args()
    keys = vb2.ALL_KEYS if opt['chars'] == 'all' else opt['chars'].split(',')
    for key in keys:
        if opt['lookdev']:
            render_lookdev(key, opt)
            continue
        if not opt['only-extras']:
            render_character(key, opt)
        if opt['portraits']:
            render_portrait(key, opt)


if __name__ == '__main__':
    main()
