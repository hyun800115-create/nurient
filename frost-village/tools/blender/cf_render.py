"""
cf_render.py - render the cityfolk paper-doll layers (CONTRACT_V8 AD) with Blender Cycles.

Builds on tf_render / tf_body / tf_parts / tf_anim / tf2_* (imported, never edited) + cf_anim / cf_parts /
cf_presets.  Cache (default /tmp/fv_cache/cityfolk; the townfolk caches are never touched):

  head/<pose>_<dir>/<layer>.png        new head parts on all 20 head frames (17 v4 + 3 'down'), the new face
                                       expressions + brow 'angry' on every face frame; head.none everywhere
  body/<base>/<job>/<layer>.png        tiled renders; body/<base>/index.json maps every tile:
      U_<anim>_<n>   UPPER pass: unique body keys of a cityfolk anim x (limbs, mask, upper layers of the
                     anim's cast + its anim items), normal holdouts
      L_<group>_<n>  LOWER pass: unique lower keys (legs / hips / root) x lower-body layers of every part cast in
                     any anim of that group, rendered WITHOUT arm holdouts (shared by run+flee ...)
      O_<anim>_<dir> OLD pass: the cityfolk wearables cast for a v4 / v5 anim, frame i = tile i (+ own mask)
  body/<base>/meta3.json               head offsets per cityfolk frame, nozzle / box / sweep points, grip gaps

Usage (bpy module; resumable - only missing layer PNGs render; one Blender process at a time):
    /tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode full --combos look [--out DIR]
    /tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode head
    /tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode body --pass upper|lower|old --bases adult_slim
    /tmp/bvenv/bin/python tools/blender/cf_render.py -- --mode meta --bases all
Options: --anims a,b  --samples 6  --threads 2  --cache DIR  --force  --reverse
Then: python3 tools/blender/cf_pack.py && python3 tools/blender/cf_check.py
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
import cf_anim as ca                         # noqa: E402
import cf_parts as cp                        # noqa: E402
import cf_presets as cpr                     # noqa: E402

# every face expression / brow becomes a regular face-set layer (in this process only)
ta.FACE_EXPR.update(ta2.FACE_EXPR2)
ta.FACE_EXPR.update(ca.FACE_EXPR3)
ta.BROW_SHAPES.update(ta2.BROW_SHAPES2)
ta.BROW_SHAPES.update(ca.BROW_SHAPES3)

FRAME = tr.FRAME
ANCHOR = tr.ANCHOR
HEAD_ANCHOR = tr.HEAD_ANCHOR
DEFAULT_CACHE = '/tmp/fv_cache/cityfolk'
NEW_HEAD = [p for p in cp.NEW_PARTS3 if tp.PARTS[p].space == 'head']
TILE_FULL = {'spray_hose', 'sweep', 'sit'}           # anims that need the whole 128x128 frame
BIG = (128, 128)
STD = (tr.BODY_TW, tr.BODY_TH)
WORLD_ITEMS = {'held_hose'}                          # built after the proportions are applied (measured)


def parse_args():
    a = bc.script_args()
    opt = {'mode': 'head', 'bases': 'all', 'pass': 'upper', 'anims': 'all', 'dirs': 'all', 'samples': '6',
           'threads': '2', 'cache': DEFAULT_CACHE, 'force': False, 'reverse': False, 'combos': 'look', 'out': None,
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


def setup_scene(opt, anchor, w, h):
    sc, cam = tr.setup_scene(int(opt['samples']), anchor, w, h)
    sc.render.threads_mode = 'FIXED'
    sc.render.threads = int(opt['threads'])
    return sc, cam


# --------------------------------------------------------------------------- scene build

def build3(ctx, base, parts, face_sets=(), hat_variants=True):
    """tf_render.build + cityfolk items: hand / chest items before the proportions, world items (fire hose)
    after them, measured on the posed rig (the hose must drop from the mittens to the snow)."""
    bc.reset_scene()
    rig = tb.build_rig()
    rig.meta['ch'] = {'age': tb.BASES[base]['age']}
    tb.build_mannequin(rig, ctx, noses=tr.NOSES)
    for fs in face_sets:
        tb.build_face_set(rig, ctx, fs)
        add_face_extras(rig, ctx, fs)
    first = [p for p in parts if p not in WORLD_ITEMS]
    for pn in first:
        tp.build_part(rig, ctx, pn)
    bpy.context.view_layer.update()
    if hat_variants:
        for pn in first:
            if tp.PARTS[pn].hatfit:
                tp.hat_clip(rig, ctx, pn)
    if ctx.mode == 'layer':
        tr.make_diffuse_only(ctx, first)
    ch = tb.apply_base(rig, base)
    rig.toggles.clear()
    late = [p for p in parts if p in WORLD_ITEMS]
    if late:
        rig.meta['hose_mid'] = measure_hose(rig)
        for pn in late:
            tp.build_part(rig, ctx, pn)
        bpy.context.view_layer.update()
    return rig, ch


def add_face_extras(rig, ctx, fs):
    """Extra face toggles of the cityfolk expressions (this process only): 'cheek_angry' = the angry flush drawn
    LOW on the cheeks, below where glasses sit (vil_face cheek_red lies under the lenses and turned glasses into
    red glowing eyes on angry / shout faces)."""
    import vil_face as vf
    spec = tb.FACE_SETS[fs]
    cu_ = spec.get('cheek_u', 0.172)
    cv_ = spec.get('cheek_v', -0.080)
    m = bc.mat('cheek_angry', '#EE5C5E', rough=0.6)
    objs = []
    for s_ in (-1, 1):
        objs.append(vf._obj(rig, 'cheek_angry', vf.bm_blob(vf.ellipse(s_ * (cu_ + 0.016), cv_ - 0.050, 0.056, 0.032, 24),
                                                           thick=0.026, out=0.0, edge=0.25), m))
    ctx.move(objs, f'F_{fs}_cheek_angry')


def measure_hose(rig):
    """Midpoint of the two mittens in spray_hose key 0 (facing frame, dir S, rig at its rest root)."""
    root0 = rig.rest_loc['root'].copy()
    rig.rest_loc['root'] = Vector((0, 0, 0))
    pose_any(rig, 'spray_hose', 'S', 0, place=False)
    mid = (rig.world('hand_R') + rig.world('hand_L')) * 0.5
    local = rig.j['root'].matrix_world.inverted() @ mid
    rig.rest_loc['root'] = root0
    return (round(local.x, 4), round(local.y, 4), round(local.z, 4))


# --------------------------------------------------------------------------- posing

def stabilize_head(rig, hp, d):
    down, tilt, turn = ta2.head_rot2(hp, d)
    target = tr.q_axis((0, 0, 1), bc.DIR_YAW[d] + turn) @ tr.q_axis((1, 0, 0), down) @ tr.q_axis((0, 1, 0), tilt)
    bpy.context.view_layer.update()
    parent = rig.j['neck'].matrix_world.to_quaternion()
    rig.j['head'].rotation_quaternion = parent.inverted() @ target
    bpy.context.view_layer.update()


def pose_any(rig, anim, d, k, place=True, by_frame=False):
    """Pose body key k of a cityfolk anim (or frame k of a v4 / v5 anim; by_frame=True takes k as the frame
    index of a cityfolk anim).  Returns (head pose, item points dict)."""
    ch = rig.meta['ch']
    if anim in ca.ANIMS3:
        if by_frame:
            i = k
            k = ca.KEYS3[anim][i]
        else:
            i = ca.KEYS3[anim].index(k)
        p = ca.body_pose3(anim, k, ch, d)
        hp = ca.HP3[anim][i]
    else:
        p = ta2.pose2(anim, k, ch, d)
        hp = p['_hp']
    flags = {kk: v for kk, v in p.items() if kk.startswith('_')}
    body = {kk: v for kk, v in p.items() if not kk.startswith('_')}
    tb.scale_ik(rig, body)
    rig.apply(body, yaw_deg=bc.DIR_YAW[d])
    stabilize_head(rig, hp, d)
    pts = {}
    if place:
        tp2.place_items(rig)
        pts = cp.place_items3(rig, d, flags)
    return hp, pts


def px_off(p, anchor=ANCHOR):
    return tr.px_off(p, anchor)


# --------------------------------------------------------------------------- jobs

def lower_sub(layer):
    return layer in cp.LOWER_SUBS


def part_layers(pn):
    return [f'{pn}.{s}' for s in tp.PARTS[pn].subs]


def anim_items(anim):
    return list(ca.ANIM_ITEMS.get(anim, []))


def tile_size(anim):
    return BIG if anim in TILE_FULL else STD


def chunks(lst, n):
    return [lst[i:i + n] for i in range(0, len(lst), n)]


def plan_jobs(base, v4parts):
    """Deterministic job list for a base: [{'id', 'pass', 'size', 'tiles': [(anim|group, dir, key)], 'layers'}]."""
    jobs = []
    cols = tr.BODY_COLS * tr.BODY_ROWS
    for anim in ca.ORDER3:
        cast = cpr.cast_parts(anim, base, v4parts) + anim_items(anim)
        layers = ['arm_R', 'arm_L', 'hand_R', 'hand_L', 'mask'] + [l for pn in cast for l in part_layers(pn)
                                                                    if not lower_sub(l)]
        tiles = [(anim, d, k) for d in ca.ANIMS3[anim]['dirs'] for k in ca.keys_of(anim)]
        for n, ch_ in enumerate(chunks(tiles, cols)):
            jobs.append({'id': f'U_{anim}_{n}', 'pass': 'upper', 'size': tile_size(anim), 'tiles': ch_,
                         'layers': layers, 'parts': cast})
    for grp, anims in ca.LOWER_GROUPS.items():
        parts = sorted({pn for a in anims for pn in cpr.cast_parts(a, base, v4parts)})
        layers = ['mask'] + [l for pn in parts for l in part_layers(pn) if lower_sub(l)]
        tiles, seen = [], set()
        for a in anims:
            for d in ca.ANIMS3[a]['dirs']:
                for k in ca.keys_of(a):
                    g_, lk = ca.lower_key(a, k)
                    if (d, lk) in seen:
                        continue
                    seen.add((d, lk))
                    tiles.append((a, d, k))                  # canonical body key that carries this lower key
        size = BIG                                    # legs swing / feet step below the 112 px crop
        for n, ch_ in enumerate(chunks(tiles, cols)):
            jobs.append({'id': f'L_{grp}_{n}', 'pass': 'lower', 'size': size, 'tiles': ch_, 'layers': layers,
                         'parts': parts, 'group': grp})
    for anim in ta.ORDER + ta2.ORDER2:
        parts = cpr.cast_parts(anim, base, v4parts)
        if not parts:
            continue
        info = ta.ANIMS.get(anim) or ta2.ANIMS2[anim]
        layers = ['mask'] + [l for pn in parts for l in part_layers(pn)]
        for d in info['dirs']:
            tiles = [(anim, d, i) for i in range(info['frames'])]
            jobs.append({'id': f'O_{anim}_{d}', 'pass': 'old', 'size': tile_size(anim), 'tiles': tiles,
                         'layers': layers, 'parts': parts})
    return jobs


def write_index(bdir, base, jobs):
    idx = {'base': base, 'cols': tr.BODY_COLS, 'jobs': {}}
    for j in jobs:
        w, h = j['size']
        idx['jobs'][j['id']] = {'pass': j['pass'], 'w': w, 'h': h, 'ox': (FRAME - w) // 2, 'oy': 0,
                                'tiles': [list(t) for t in j['tiles']], 'layers': j['layers'],
                                'group': j.get('group')}
    with open(os.path.join(bdir, 'index.json'), 'w') as f:
        json.dump(idx, f, indent=0)
    return idx


def layer_specs(L, ctx, layers, mode):
    """mode 'upper' / 'old': tf_render body specs; 'lower': no limb holdouts for the part layers."""
    mq = ['M_core'] + tr.MQ_LIMBS
    for name in layers:
        if name in tr.LIMB_LAYERS:
            cname = tr.LIMB_LAYERS[name]
            L.add(name, [cname], holdout=[c for c in mq if c != cname], indirect=['M_head_none'])
        elif name == 'mask':
            L.add('mask', mq + ['M_head_none'])
        else:
            pn, s = name.split('.', 1)
            cols = tr.part_sub_cols(ctx, pn)
            cname = cols.get(s)
            if cname is None:
                continue
            sibs = [c for c in cols.values() if c != cname]
            hold = (['M_core'] if mode == 'lower' else mq) + sibs
            L.add(name, [cname], holdout=hold, indirect=['M_head_none'])


def render_jobs(opt, base, jobs, t0):
    """Group jobs by (pass, tile size) -> one scene each; render every job's tiles."""
    groups = {}
    for j in jobs:
        groups.setdefault((j['pass'], j['size']), []).append(j)
    bdir = os.path.join(opt['cache'], 'body', base)
    for (ps, size), js in groups.items():
        todo_jobs = []
        for j in js:
            outdir = os.path.join(bdir, j['id'])
            want = j['layers']
            todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
            if todo:
                todo_jobs.append((j, todo))
        if not todo_jobs:
            continue
        parts = sorted({pn for j, _ in todo_jobs for pn in j['parts']})
        layers = []
        for j, todo in todo_jobs:
            layers += [l for l in j['layers'] if l not in layers]
        ctx = tb.Ctx('layer')
        rig, ch = build3(ctx, base, parts)
        w, h = size
        ox = (FRAME - w) // 2
        tx = tr.TILE_X * (w / 128.0)
        ty = tr.TILE_Y * (h / 128.0)
        rigs = tr.make_tiles(rig, tr.BODY_COLS * tr.BODY_ROWS, tr.BODY_COLS, tx=tx, ty=ty)
        sc, cam = setup_scene(opt, (ANCHOR[0] - ox, ANCHOR[1]), tr.BODY_COLS * w, tr.BODY_ROWS * h)
        L = tr.Layers(ctx)
        layer_specs(L, ctx, layers, 'lower' if ps == 'lower' else 'upper')
        L.realize()
        names = {s_[0] for s_ in L.specs}
        print(f'[{base}] {ps} {w}x{h}: {len(todo_jobs)} jobs, {len(names)} layers, {len(parts)} parts', flush=True)
        if opt['reverse']:
            todo_jobs = todo_jobs[::-1]
        for j, todo in todo_jobs:
            outdir = os.path.join(bdir, j['id'])
            tiles = j['tiles']
            for k, r_ in enumerate(rigs):
                a, d, key = tiles[min(k, len(tiles) - 1)]
                pose_any(r_, a, d, key)
            L.render(outdir, {n for n in todo if n in names})
            print(f'[{base}] {j["id"]}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)


def render_body(opt):
    t0 = time.time()
    v4 = cpr.v4_base_parts()
    for base in sel(opt['bases'], cpr.RENDER_BASES):
        jobs = plan_jobs(base, v4)
        bdir = os.path.join(opt['cache'], 'body', base)
        os.makedirs(bdir, exist_ok=True)
        write_index(bdir, base, jobs)
        mine = [j for j in jobs if j['pass'] == opt['pass']]
        if opt['anims'] != 'all':
            want = opt['anims'].split(',')
            mine = [j for j in mine if any(t[0] in want for t in j['tiles']) or j.get('group') in want]
        render_jobs(opt, base, mine, t0)
        print(f'[{base}] {opt["pass"]} done {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- meta

def body_meta3(opt, base):
    """headOffset per cityfolk frame + item points, measured on an unproportioned-root rig with all items."""
    v4 = cpr.v4_base_parts()
    items = sorted({it for a in ca.ORDER3 for it in ca.ANIM_ITEMS.get(a, [])})
    ctx = tb.Ctx('layer')
    rig, ch = build3(ctx, base, items)
    rig.rest_loc['root'] = Vector((0, 0, 0))
    meta = {'base': base, 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'headAnchor': list(HEAD_ANCHOR),
            'headOffset': {}, 'headOffsetF': {}, 'nozzle': {}, 'sweep': {}, 'box': {}, 'gaps': {},
            'hoseMid': rig.meta.get('hose_mid')}
    targets = {}
    for anim, d, i in ca.frames3():
        hp, pts = pose_any(rig, anim, d, i, by_frame=True)
        off = px_off(rig.j['head'].matrix_world.translation)
        meta['headOffsetF'][f'{anim}_{d}_{i}'] = [round(off[0], 2), round(off[1], 2)]
        meta['headOffset'][f'{anim}_{d}_{i}'] = [int(round(off[0])), int(round(off[1]))]
        if 'nozzle' in pts:
            tip, ahead = pts['nozzle']
            a_, b_ = px_off(tip), px_off(ahead)
            dx, dy = b_[0] - a_[0], b_[1] - a_[1]
            n = math.hypot(dx, dy) or 1.0
            meta['nozzle'][f'{anim}_{d}_{i}'] = [round(a_[0], 1), round(a_[1], 1), round(dx / n, 3), round(dy / n, 3)]
        if 'sweep' in pts:
            o = px_off(pts['sweep'])
            meta['sweep'][f'{anim}_{d}_{i}'] = [round(o[0], 1), round(o[1], 1)]
        if 'box' in pts:
            c_, b_ = px_off(pts['box'][0]), px_off(pts['box'][1])
            meta['box'][f'{anim}_{d}_{i}'] = [round(c_[0], 1), round(c_[1], 1), round(b_[0], 1), round(b_[1], 1)]
        # IK reach: distance between where the mitten is and where the pose wanted it
        p = ca.body_pose3(anim, ca.KEYS3[anim][i], rig.meta['ch'], d)
        tb.scale_ik(rig, p)
        gap = 0.0
        for s in ('R', 'L'):
            if 'ik_' + s in p:
                want = rig.j['chest'].matrix_world @ Vector(p['ik_' + s][:3])
                gap = max(gap, (rig.world('hand_' + s) - want).length)
        targets[f'{anim}_{d}_{i}'] = round(gap, 3)
    meta['gaps'] = targets
    meta['tiles'] = {a: {'w': tile_size(a)[0], 'h': tile_size(a)[1]} for a in ca.ORDER3}
    # feet per frame of the walking anims (+ townfolk walk for reference): [[px x, px y, world z] R, L] -> cf_pack
    # derives groundSpeed (px/s the planted foot slides back = the speed the game should move the sprite at)
    meta['feet'] = {}
    infos = {a: ca.ANIMS3[a] for a in ca.WALKERS}
    infos['walk'] = ta.ANIMS['walk']
    for anim, info in infos.items():
        for d in info['dirs']:
            for i in range(info['frames']):
                pose_any(rig, anim, d, i, place=False, by_frame=anim in ca.ANIMS3)
                fr = []
                for n in ('R', 'L'):
                    w = rig.world('knee_' + n, (0, -0.02, -0.15))
                    o = px_off(w)
                    fr.append([round(o[0], 2), round(o[1], 2), round(w.z, 4)])
                meta['feet'][f'{anim}_{d}_{i}'] = fr
    bdir = os.path.join(opt['cache'], 'body', base)
    os.makedirs(bdir, exist_ok=True)
    with open(os.path.join(bdir, 'meta3.json'), 'w') as f:
        json.dump(meta, f, indent=0)
    del v4
    return meta


def render_meta(opt):
    for base in sel(opt['bases'], cpr.RENDER_BASES):
        m = body_meta3(opt, base)
        worst = sorted(m['gaps'].items(), key=lambda kv: -kv[1])[:6]
        print(base, 'hoseMid', m['hoseMid'], 'worst IK gaps (m):', worst, flush=True)


# --------------------------------------------------------------------------- head

def head_todo(names, hp, d):
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
            if (kind == 'face' and x in ca.FACE_EXPR3) or (kind == 'brow' and x in ca.BROW_SHAPES3):
                out.append(n)
            continue
        if n.split('.')[0] in NEW_HEAD:
            out.append(n)
    return out


def render_head(opt):
    t0 = time.time()
    parts = sel(opt['parts'], NEW_HEAD)
    face_sets = list(tb.FACE_SETS)
    ctx = tb.Ctx('layer')
    rig, ch = build3(ctx, 'adult_slim', parts, face_sets)
    sc, cam = setup_scene(opt, HEAD_ANCHOR, FRAME, FRAME)
    L = tr.Layers(ctx)
    hold = ['M_head_none']
    L.add('head.none', ['M_head_none'])
    for fs in face_sets:
        lines = [f'F_{fs}_lines'] if f'F_{fs}_lines' in ctx.cols else []
        for expr, togs in ca.FACE_EXPR3.items():
            L.add(f'face.{fs}.{expr}', [f'F_{fs}_{t}' for t in togs] + lines, holdout=hold)
        for shape, tog in ca.BROW_SHAPES3.items():
            L.add(f'brow.{fs}.{shape}', [f'F_{fs}_{tog}'], holdout=hold)
    for pn in parts:
        cols = tr.part_sub_cols(ctx, pn)
        for s, cname in cols.items():
            sibs = [c for c in cols.values() if c != cname]
            L.add(f'{pn}.{s}', [cname], holdout=hold + sibs)
    L.realize()
    names = [s_[0] for s_ in L.specs]
    hdir = os.path.join(opt['cache'], 'head')
    os.makedirs(hdir, exist_ok=True)
    frames = ta2.all_head_frames()
    if opt['dirs'] != 'all':
        frames = [f for f in frames if f[1] in opt['dirs'].split(',')]
    if opt['reverse']:
        frames = frames[::-1]
    meta = {'anchor': list(HEAD_ANCHOR), 'layout': 'dirs', 'frames': [f'{hp}_{d}' for hp, d in ta2.all_head_frames()],
            'layers': names, 'newHeadParts': NEW_HEAD, 'faceExprs3': list(ca.FACE_EXPR3)}
    with open(os.path.join(hdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[head3] {len(frames)} frames, {len(names)} layers in scene', flush=True)
    for k, (hp, d) in enumerate(frames):
        outdir = os.path.join(hdir, f'{hp}_{d}')
        want = head_todo(names, hp, d)
        todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
        if not todo:
            continue
        rig.apply({}, yaw_deg=0.0)
        stabilize_head(rig, hp, d)
        tr.aim_camera(cam, rig.j['head'].matrix_world.translation.copy(), HEAD_ANCHOR)
        L.render(outdir, set(todo))
        print(f'[head3] {k + 1}/{len(frames)} {hp}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)
    print(f'[head3] done in {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- full (look-dev / proof)

def render_full(opt):
    t0 = time.time()
    if opt['combos'] == 'look':
        combos = [dict(c, frames=cpr.LOOK_FRAMES[c['name']]) for c in cpr.LOOK]
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
        items = sorted({it for a, _, _ in todo for it in ca.ANIM_ITEMS.get(a, [])})
        parts = list(cb_['parts']) + [it for it in items if it not in cb_['parts']]
        ctx = tb.Ctx('full', cb_['colors'])
        hat = any(tp.PARTS[p].family == 'hat' and tp.PARTS[p].cls == 'full' for p in parts)
        rig, ch = build3(ctx, cb_['base'], parts, (cb_['face'],), hat_variants=hat)
        root0 = rig.rest_loc['root'].copy()
        sc, cam = setup_scene(opt, ANCHOR, FRAME, FRAME)
        vl = sc.view_layers[0]
        fs = cb_['face']
        for cname in ctx.cols:
            lc = vl.layer_collection.children.get(cname)
            keep = cname in ('M_core', f'M_head_{cb_["nose"]}') or cname in tr.MQ_LIMBS or cname.startswith('P.')
            if cname.startswith('P.'):
                pn = cname.split('.')[1]
                if tp.PARTS[pn].hatfit:
                    keep = cname.endswith('~hat') == hat
            lc.exclude = not keep
        os.makedirs(outdir, exist_ok=True)
        for anim, d, i in todo:
            for cname in ctx.cols:                          # items only in the anims they belong to
                if not cname.startswith('P.'):
                    continue
                pn = cname.split('.')[1]
                P = tp.PARTS[pn]
                only = getattr(P, 'only_anims', None)
                no = getattr(P, 'no_anims', None) or tp2.ITEM_NO_ANIMS.get(pn, ())
                if only is not None or no:
                    vis = (only is None or anim in only) and anim not in no
                    if P.hatfit:
                        vis = vis and cname.endswith('~hat') == hat
                    vl.layer_collection.children.get(cname).exclude = not vis
            rig.rest_loc['root'] = root0
            hp, pts = pose_any(rig, anim, d, i, by_frame=True)
            if anim in ca.ANIMS3:
                face = ca.FACE3[anim][i]
                brow = ca.expr_brow(face)
            else:
                tl = ta2.pose2(anim, i, rig.meta['ch'], d)
                face, brow = tl['_face'], tl['_brow']
            want = {f'F_{fs}_{t}' for t in ta.FACE_EXPR[face]}
            want.add(f'F_{fs}_{ta.BROW_SHAPES[brow]}')
            want.add(f'F_{fs}_lines')
            for cname in ctx.cols:
                if cname.startswith('F_'):
                    vl.layer_collection.children.get(cname).exclude = cname not in want
            bc.render_to(os.path.join(outdir, f'{anim}_{d}_{i}.png'))
        print(f'[full3] {cb_["name"]} {len(todo)} frames  {time.time() - t0:.0f}s', flush=True)


def main():
    opt = parse_args()
    os.makedirs(opt['cache'], exist_ok=True)
    {'head': render_head, 'body': render_body, 'meta': render_meta, 'full': render_full}[opt['mode']](opt)


if __name__ == '__main__':
    main()
