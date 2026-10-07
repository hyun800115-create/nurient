"""
tf2_render.py - render the townfolk v5 paper-doll layers (CONTRACT_V5 Q) with Blender Cycles.

Builds on tf_render / tf_body / tf_parts / tf_anim (imported, never edited) + tf2_anim / tf2_parts.
Output cache (default /tmp/fv_cache/townfolk2; the v4 cache /tmp/fv_cache/townfolk is only READ):

  head/<pose>_<dir>/<layer>.png   - 'down' pose (S/SE/E): EVERY head layer (all parts, noses, faces);
                                    old 17 frames: only the NEW head parts (veil, flower_crown,
                                    black_hat), the new face expressions (sad / sad_closed / tear) and
                                    brow 'sad'; head.none (mask) everywhere.
  body/<base>/<anim>_<dir>/<layer>.png  (tiled, tile i = frame i)
     --pass new : the new anims (sad, clap, sit, push) x every body part the game can give this
                  age (assets/townfolk bases[*].parts) + the new body parts; limbs + mask.
     --pass old : the 6 v4 anims x the NEW body parts only (wedding_dress, groom_suit,
                  mourning_coat, held_bouquet); masks come from the v4 cache.
  body/<base>/meta2.json  headOffset(F) of the new anims, pushPoint/pushGrip, tiles per anim.

Usage (build machine, bpy module; resumable - only missing layer PNGs render):
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode head
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode body --pass new --bases adult_slim [--reverse]
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode body --pass old --bases adult_slim
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode meta --bases all       (meta2.json only)
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode headfix                 (HEAD_FIXES copies)
    /tmp/bvenv/bin/python tools/blender/tf2_render.py -- --mode full --combos look      (look-dev renders)
Options: --anims a,b  --dirs S,SE  --samples 6  --cache DIR  --force  --reverse  --out DIR (full)
Then: python3 tools/blender/tf2_pack.py && python3 tools/blender/tf2_check.py
"""
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy                                   # noqa: E402
from mathutils import Vector, Quaternion     # noqa: E402

import bl_common as bc                       # noqa: E402
import tf_anim as ta                         # noqa: E402
import tf_body as tb                         # noqa: E402
import tf_parts as tp                        # noqa: E402
import tf_render as tr                       # noqa: E402
import tf2_anim as ta2                       # noqa: E402
import tf2_parts as tp2                      # noqa: E402

# the new face expressions / brow become regular face-set layers (in this process only)
ta.FACE_EXPR.update(ta2.FACE_EXPR2)
ta.BROW_SHAPES.update(ta2.BROW_SHAPES2)

FRAME = tr.FRAME
ANCHOR = tr.ANCHOR
HEAD_ANCHOR = tr.HEAD_ANCHOR
OLD_CACHE = '/tmp/fv_cache/townfolk'
DEFAULT_CACHE = '/tmp/fv_cache/townfolk2'
GAME = os.path.dirname(os.path.dirname(HERE))
TF_MANIFEST = os.path.join(GAME, 'assets', 'townfolk', 'manifest.json')
NEW_HEAD = [p for p in tp2.NEW_PARTS if tp.PARTS[p].space == 'head']
NEW_BODY = [p for p in tp2.NEW_PARTS if tp.PARTS[p].space == 'body']
TILE_H = {'sit': 128}                 # sit frames hang the legs below the (seat) anchor: full height tile


def parse_args():
    a = bc.script_args()
    opt = {'mode': 'head', 'bases': 'all', 'pass': 'new', 'anims': 'all', 'dirs': 'all', 'samples': '6',
           'cache': DEFAULT_CACHE, 'force': False, 'reverse': False, 'combos': 'look', 'out': None,
           'parts': 'all'}
    i = 0
    while i < len(a):
        k = a[i].lstrip('-')
        if k in ('force', 'reverse'):
            opt[k] = True
            i += 1
        else:
            opt[k] = a[i + 1]
            i += 2
    return opt


def sel(spec, full):
    return list(full) if spec == 'all' else [x for x in spec.split(',') if x in full]


# --------------------------------------------------------------------------- posing

def stabilize_head2(rig, hp, d):
    down, tilt, turn = ta2.head_rot2(hp, d)
    target = tr.q_axis((0, 0, 1), bc.DIR_YAW[d] + turn) @ tr.q_axis((1, 0, 0), down) @ tr.q_axis((0, 1, 0), tilt)
    bpy.context.view_layer.update()
    parent = rig.j['neck'].matrix_world.to_quaternion()
    rig.j['head'].rotation_quaternion = parent.inverted() @ target
    bpy.context.view_layer.update()


def grip_world(rig, d, side=None):
    """World position of the push grip (bar midpoint, or one hand's spot) for this rig's tile."""
    age = rig.meta['ch']['age']
    f, h, w = ta2.push_grip(age)
    yaw = math.radians(bc.DIR_YAW[d])
    x = 0.0 if side is None else (-w if side == 'R' else w)
    local = Vector((x, -f, h))
    rot = Quaternion(Vector((0, 0, 1)), yaw)
    return rig.rest_loc['root'] + rot @ local


def solve_push(rig, d):
    bpy.context.view_layer.update()
    inv = rig.j['chest'].matrix_world.inverted()
    for side in ('R', 'L'):
        tgt = inv @ grip_world(rig, d, side)
        out = -1.0 if side == 'R' else 1.0
        rig.solve_arm(side, tuple(tgt), (0.55 * out, 0.15, -0.8))
    bpy.context.view_layer.update()


def pose_body2(rig, anim, d, i):
    p = ta2.pose2(anim, i, rig.meta['ch'], d)
    hp = p['_hp']
    push = p.get('_push')
    p = {k: v for k, v in p.items() if not k.startswith('_')}
    if push:
        p.pop('ik_R', None)
        p.pop('ik_L', None)
    tb.scale_ik(rig, p)
    rig.apply(p, yaw_deg=bc.DIR_YAW[d])
    if push:
        solve_push(rig, d)
    stabilize_head2(rig, hp, d)
    tp2.place_items(rig)
    return hp


def pose_head_only2(rig, hp, d):
    rig.apply({}, yaw_deg=0.0)
    stabilize_head2(rig, hp, d)


# --------------------------------------------------------------------------- head

def head_layer_names(L):
    return [s_[0] for s_ in L.specs]


def head_todo(names, hp, d):
    """Layers wanted for head frame (hp, d)."""
    out = []
    face_ok = d in ta.FACE_DIRS
    for n in names:
        if n == 'head.none':
            out.append(n)
            continue
        if n.startswith('face.') or n.startswith('brow.'):
            if not face_ok:
                continue
            kind, fs, x = n.split('.')
            if hp in ta2.HEAD_POSES2:
                if kind == 'face' and x in ta2.DOWN_EXPRS or kind == 'brow':
                    out.append(n)
            elif (kind == 'face' and x in ta2.FACE_EXPR2) or (kind == 'brow' and x in ta2.BROW_SHAPES2):
                out.append(n)
            continue
        pn = n.split('.')[0]
        if hp in ta2.HEAD_POSES2 or pn in NEW_HEAD:
            out.append(n)
    return out


# v4 head layers whose v4 render came out black (Cycles glitch in /tmp/fv_cache/townfolk; assets/townfolk is not
# ours to touch): townfolk2 carries corrected copies for every dir of that head pose ('overrides' in the manifest)
HEAD_FIXES = [('hat_headband.main', 'soc'), ('hat_cap.visor', 'up')]


def render_headfix(opt):
    t0 = time.time()
    parts = sorted({l.split('.')[0] for l, _ in HEAD_FIXES})
    ctx = tb.Ctx('layer')
    rig, ch = tr.build(ctx, 'adult_slim', parts, ())
    sc, cam = tr.setup_scene(int(opt['samples']), HEAD_ANCHOR)
    L = tr.Layers(ctx)
    tr.head_layer_specs(L, ctx, parts, (), with_face=False)
    L.realize()
    hdir = os.path.join(opt['cache'], 'head')
    for layer, hp in HEAD_FIXES:
        for d in ta.HEAD_POSE_DIRS[hp]:
            outdir = os.path.join(hdir, f'{hp}_{d}')
            want = [layer, 'head.none']
            todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
            if not todo:
                continue
            pose_head_only2(rig, hp, d)
            tr.aim_camera(cam, rig.j['head'].matrix_world.translation.copy(), HEAD_ANCHOR)
            L.render(outdir, set(todo))
            print(f'[headfix] {layer} {hp}_{d}  {time.time() - t0:.0f}s', flush=True)
    mp = os.path.join(hdir, 'meta.json')
    meta = json.load(open(mp))
    meta['overrides'] = [[l, hp] for l, hp in HEAD_FIXES]
    with open(mp, 'w') as f:
        json.dump(meta, f, indent=1)


def render_head(opt):
    t0 = time.time()
    parts = sel(opt['parts'], [p.name for p in tp.head_parts()])
    face_sets = list(tb.FACE_SETS)
    ctx = tb.Ctx('layer')
    rig, ch = tr.build(ctx, 'adult_slim', parts, face_sets)
    sc, cam = tr.setup_scene(int(opt['samples']), HEAD_ANCHOR)
    L = tr.Layers(ctx)
    tr.head_layer_specs(L, ctx, parts, face_sets)
    L.realize()
    names = head_layer_names(L)
    hdir = os.path.join(opt['cache'], 'head')
    os.makedirs(hdir, exist_ok=True)
    frames = ta2.head_frames2() + ta.head_frames()          # the expensive new pose first
    if opt['dirs'] != 'all':
        frames = [f for f in frames if f[1] in opt['dirs'].split(',')]
    if opt.get('reverse'):
        frames = frames[::-1]
    meta = {'anchor': list(HEAD_ANCHOR), 'layout': 'dirs', 'frames': [f'{hp}_{d}' for hp, d in ta2.all_head_frames()],
            'layers': names, 'newHeadParts': NEW_HEAD, 'newPoses': list(ta2.HEAD_POSES2),
            'faceExprs2': list(ta2.FACE_EXPR2), 'downExprs': ta2.DOWN_EXPRS}
    with open(os.path.join(hdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[head2] {len(frames)} frames, {len(names)} layers in scene', flush=True)
    for k, (hp, d) in enumerate(frames):
        outdir = os.path.join(hdir, f'{hp}_{d}')
        want = head_todo(names, hp, d)
        todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
        if not todo:
            continue
        pose_head_only2(rig, hp, d)
        tr.aim_camera(cam, rig.j['head'].matrix_world.translation.copy(), HEAD_ANCHOR)
        L.render(outdir, set(todo))
        print(f'[head2] {k + 1}/{len(frames)} {hp}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)
    print(f'[head2] done in {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- body

def base_parts(base):
    """Body parts rendered for `base` in townfolk2: every part the v4 game can give this base
    (assets/townfolk manifest bases[base].parts) + the new body parts of its age."""
    age = tb.BASES[base]['age']
    with open(TF_MANIFEST, encoding='utf-8') as f:
        T = json.load(f)['townfolk']
    old = list(T['bases'][base]['parts'])
    new = [p for p in NEW_BODY if tp.PARTS[p].ages is None or age in tp.PARTS[p].ages]
    return old, new


def item_skip(layer, anim):
    pn = layer.split('.')[0]
    return anim in tp2.ITEM_NO_ANIMS.get(pn, ())


def body_meta2(rig, base, bdir):
    """headOffset for the new anim frames, push grip pixel points, tile layout per anim."""
    meta = {'base': base, 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'headAnchor': list(HEAD_ANCHOR),
            'headOffset': {}, 'headOffsetF': {}, 'handsF': {}}
    root0 = rig.rest_loc['root'].copy()
    rig.rest_loc['root'] = Vector((0, 0, 0))
    for anim, d, i in ta2.frames2():
        pose_body2(rig, anim, d, i)
        off = tr.px_off(rig.j['head'].matrix_world.translation)
        meta['headOffsetF'][f'{anim}_{d}_{i}'] = [round(off[0], 2), round(off[1], 2)]
        meta['headOffset'][f'{anim}_{d}_{i}'] = [int(round(off[0])), int(round(off[1]))]
        if anim == 'push':
            hr = tr.px_off(rig.world('hand_R'))
            hl = tr.px_off(rig.world('hand_L'))
            meta['handsF'][f'{anim}_{d}_{i}'] = [round(hr[0], 1), round(hr[1], 1), round(hl[0], 1), round(hl[1], 1)]
    f, h, w = ta2.push_grip(rig.meta['ch']['age'])
    pp = {}
    for d in ta2.ANIMS2['push']['dirs']:
        o = tr.px_off(grip_world(rig, d))
        pp[d] = [round(o[0], 2), round(o[1], 2), d in ('NE', 'N')]
    # how far the hands actually are from the grip (IK reach check), max over frames, metres
    gap = 0.0
    for d in ta2.ANIMS2['push']['dirs']:
        for i in range(ta2.ANIMS2['push']['frames']):
            pose_body2(rig, 'push', d, i)
            for s in ('R', 'L'):
                gap = max(gap, (rig.world('hand_' + s) - grip_world(rig, d, s)).length)
    meta['pushPointF'] = pp
    meta['pushGrip'] = {'forwardM': f, 'heightM': h, 'widthM': 2 * w, 'maxHandGapM': round(gap, 3)}
    meta['seat'] = {'heightM': ta2.SEAT_H, 'anchor': 'seat front-centre', 'hipBackM': ta2.SEAT_BACK,
                    'groundOffsetPx': round(ta2.SEAT_H * bc.PPU * bc.VERTICAL_SCALE, 2)}
    meta['tile'] = {'w': tr.BODY_TW, 'h': tr.BODY_TH, 'cols': tr.BODY_COLS, 'ox': tr.TILE_OX, 'oy': 0}
    meta['tiles'] = {a: {'w': tr.BODY_TW, 'h': TILE_H.get(a, tr.BODY_TH), 'cols': tr.BODY_COLS, 'ox': tr.TILE_OX,
                         'oy': 0} for a in list(ta2.ORDER2) + list(ta.ORDER)}
    rig.rest_loc['root'] = root0
    with open(os.path.join(bdir, 'meta2.json'), 'w') as fh:
        json.dump(meta, fh, indent=1)
    return meta


def render_groups(opt, base, parts, groups, tile_h, with_limbs, t0):
    """One scene for (base, parts, tile height); renders the given (anim, dir) groups."""
    ctx = tb.Ctx('layer')
    rig, ch = tr.build(ctx, base, parts)
    bdir = os.path.join(opt['cache'], 'body', base)
    os.makedirs(bdir, exist_ok=True)
    if with_limbs and not os.path.exists(os.path.join(bdir, 'meta2.json')):
        body_meta2(rig, base, bdir)
    th = tile_h
    ty = tr.TILE_Y * (th / 128.0)
    rigs = tr.make_tiles(rig, tr.BODY_COLS * tr.BODY_ROWS, tr.BODY_COLS, tx=tr.BODY_TX, ty=ty)
    sc, cam = tr.setup_scene(int(opt['samples']), (ANCHOR[0] - tr.TILE_OX, ANCHOR[1]), tr.BODY_COLS * tr.BODY_TW,
                             tr.BODY_ROWS * th)
    L = tr.Layers(ctx)
    if with_limbs:
        tr.body_layer_specs(L, ctx, parts)
    else:
        mq = ['M_core'] + tr.MQ_LIMBS
        for pn in parts:
            cols = tr.part_sub_cols(ctx, pn)
            for s, cname in cols.items():
                sibs = [c for c in cols.values() if c != cname]
                L.add(f'{pn}.{s}', [cname], holdout=mq + sibs, indirect=['M_head_none'])
    L.realize()
    names = [s_[0] for s_ in L.specs]
    print(f'[{base}] tile h {th}: {len(groups)} groups x {len(names)} layers ({len(parts)} parts)', flush=True)
    for k, (anim, d) in enumerate(groups):
        outdir = os.path.join(bdir, f'{anim}_{d}')
        want = [n for n in names if not item_skip(n, anim)]
        todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
        if not todo:
            continue
        n = (ta2.ANIMS2.get(anim) or ta.ANIMS[anim])['frames']
        for i, r_ in enumerate(rigs):
            pose_body2(r_, anim, d, min(i, n - 1))
        L.render(outdir, set(todo))
        print(f'[{base}] {anim}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)


def render_body(opt):
    t0 = time.time()
    for base in sel(opt['bases'], tr.tb.BASE_ORDER):
        if base not in ('child_slim', 'adult_slim', 'elder_slim'):
            continue
        old, new = base_parts(base)
        if opt['pass'] == 'new':
            anims = ['sit', 'sad', 'clap', 'push']           # push last (stroller handle coordination)
            parts = old + new
        else:
            anims = ta.ORDER
            parts = new
        if opt['parts'] != 'all':
            parts = [p for p in parts if p in opt['parts'].split(',')]
        groups = [(a, d) for a in anims for d in (ta2.ANIMS2.get(a) or ta.ANIMS[a])['dirs']
                  if (opt['anims'] == 'all' or a in opt['anims'].split(','))
                  and (opt['dirs'] == 'all' or d in opt['dirs'].split(','))]
        if opt['reverse']:
            groups = groups[::-1]
        by_h = {}
        for g_ in groups:
            by_h.setdefault(TILE_H.get(g_[0], tr.BODY_TH), []).append(g_)
        for th, gs in by_h.items():
            render_groups(opt, base, parts, gs, th, opt['pass'] == 'new', t0)
        print(f'[{base}] {opt["pass"]} done {time.time() - t0:.0f}s', flush=True)


def render_meta(opt):
    for base in sel(opt['bases'], tr.tb.BASE_ORDER):
        if base not in ('child_slim', 'adult_slim', 'elder_slim'):
            continue
        old, new = base_parts(base)
        ctx = tb.Ctx('layer')
        rig, ch = tr.build(ctx, base, ['held_bouquet'] if 'held_bouquet' in new else [])
        bdir = os.path.join(opt['cache'], 'body', base)
        os.makedirs(bdir, exist_ok=True)
        m = body_meta2(rig, base, bdir)
        print(base, 'pushPoint', m['pushPointF'], m['pushGrip'], flush=True)


# --------------------------------------------------------------------------- full (look-dev / proof)

from tf2_presets import LOOK, LOOK_FRAMES        # noqa: E402  (look-dev / proof outfits)


def render_full(opt):
    t0 = time.time()
    if opt['combos'] == 'look':
        combos = [dict(c, frames=LOOK_FRAMES) for c in LOOK]
    else:
        combos = json.load(open(opt['combos']))
    out_root = opt['out'] or os.path.join(opt['cache'], 'full')
    for cb_ in combos:
        if opt['parts'] != 'all' and cb_['name'] not in opt['parts'].split(','):
            continue
        outdir = os.path.join(out_root, cb_['name'])
        frames = [tuple(f) for f in cb_['frames']]
        todo = [f for f in frames if opt['force'] or not os.path.exists(os.path.join(outdir, '%s_%s_%d.png' % f))]
        if not todo:
            continue
        ctx = tb.Ctx('full', cb_['colors'])
        hat = any(tp.PARTS[p].family == 'hat' and tp.PARTS[p].cls == 'full' for p in cb_['parts'])
        rig, ch = tr.build(ctx, cb_['base'], cb_['parts'], (cb_['face'],), hat_variants=hat)
        sit_rig_root = rig.rest_loc['root'].copy()
        sc, cam = tr.setup_scene(int(opt['samples']), ANCHOR, FRAME, FRAME)
        vl = sc.view_layers[0]
        fs = cb_['face']
        for cname in ctx.cols:
            lc = vl.layer_collection.children.get(cname)
            keep = cname in ('M_core', f'M_head_{cb_["nose"]}') or cname in tr.MQ_LIMBS or cname.startswith('P.')
            if cname.startswith('P.'):
                pn = cname.split('.')[1]
                is_hat = cname.endswith('~hat')
                if tp.PARTS[pn].hatfit:
                    keep = is_hat == hat
            lc.exclude = not keep
        os.makedirs(outdir, exist_ok=True)
        for anim, d, i in todo:
            if anim in tp2.ITEM_NO_ANIMS.get('held_bouquet', ()) and 'held_bouquet' in cb_['parts']:
                for cname in ctx.cols:
                    if cname.startswith('P.held_bouquet.'):
                        vl.layer_collection.children.get(cname).exclude = True
            elif 'held_bouquet' in cb_['parts']:
                for cname in ctx.cols:
                    if cname.startswith('P.held_bouquet.'):
                        vl.layer_collection.children.get(cname).exclude = False
            rig.rest_loc['root'] = sit_rig_root
            pose_body2(rig, anim, d, i)
            tl = ta2.pose2(anim, i, rig.meta['ch'], d)
            want = {f'F_{fs}_{t}' for t in ta.FACE_EXPR[tl['_face']]}
            want.add(f'F_{fs}_{ta.BROW_SHAPES[tl["_brow"]]}')
            want.add(f'F_{fs}_lines')
            for cname in ctx.cols:
                if cname.startswith('F_'):
                    lc = vl.layer_collection.children.get(cname)
                    lc.exclude = cname not in want
            bc.render_to(os.path.join(outdir, f'{anim}_{d}_{i}.png'))
        print(f'[full2] {cb_["name"]} {len(todo)} frames  {time.time() - t0:.0f}s', flush=True)


def main():
    opt = parse_args()
    os.makedirs(opt['cache'], exist_ok=True)
    {'head': render_head, 'headfix': render_headfix, 'body': render_body, 'meta': render_meta,
     'full': render_full}[opt['mode']](opt)


if __name__ == '__main__':
    main()
