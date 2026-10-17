"""
gbf_render.py - render the geumbangfolk paper-doll layers (CONTRACT_GEUMBANG AP) with Blender Cycles.

Builds on tf_render / tf_body / tf_parts / tf_anim / tf2_* (imported, never edited) + gbf_anim / gbf_parts /
gbf_presets.  The officefolk acting technique (tools/blender/of_render.py, read only) re-implemented for the 금방 crew.
Cache (default /tmp/fv_cache/geumbangfolk; other caches are never touched):

  head/<pose>_<dir>/<layer>.png   hat_gb_cap (main / brim / mark) on all 20 head frames (17 v4 + 3 'down') + head.none
  body/<base>/<job>/<layer>.png   tiled renders (128 x 128 tiles, 4 x 2 per sheet); body/<base>/index.json maps tiles
      T_<n>        TORSO pass: (torso key, dir) tiles - every non-limb layer of the cover (garments, legs, boots,
                   scarf, the vest) with ONLY the mannequin core as holdout (the acting limbs are drawn over them)
      A_<anim>_<n> ACTING pass: (dir, body key) tiles of one anim - limbs, limb-following subs (cuffs) and the anim
                   items, with core + other limbs + the torso proxy shell + the head as holdouts
      W_<dir>      LOWER pass (carry_parcel): the 8 frames of one dir, only the trousers / boots (walking legs), the
                   usual townfolk holdouts; the upper body of the parcel walk is a torso key (cw_hi_L / cw_lo / cw_hi_R)
      O_<anim>_<dir> OLD pass: top_gb_jacket + det_gb_vest in the v4 anims (idle / walk / talk / wave / happy)
  body/<base>/meta5.json          head offsets per geumbangfolk frame, box / hand / bell / beam / tape points, walk
                                  feet (groundSpeed), IK reach gaps

Usage (bpy module; resumable - only missing layer PNGs render; ONE Blender process at a time, nice -n 10):
    /tmp/bvenv/bin/python tools/blender/gbf_render.py -- --mode full --combos look [--out DIR] [--parts driver]
    /tmp/bvenv/bin/python tools/blender/gbf_render.py -- --mode head
    /tmp/bvenv/bin/python tools/blender/gbf_render.py -- --mode body --pass torso|act|walk|old|all
    /tmp/bvenv/bin/python tools/blender/gbf_render.py -- --mode meta
Options: --anims a,b  --samples 6  --threads 3  --cache DIR  --force  --reverse  --drop-layers l1,l2
Then: python3 tools/blender/gbf_pack.py && python3 tools/blender/gbf_check.py
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
from mathutils import Vector                 # noqa: E402

import bl_common as bc                       # noqa: E402
import tf_anim as ta                         # noqa: E402
import tf_body as tb                         # noqa: E402
import tf_parts as tp                        # noqa: E402
import tf_render as tr                       # noqa: E402
import tf2_anim as ta2                       # noqa: E402
import tf2_parts as tp2                      # noqa: E402,F401
import gbf_anim as ga                        # noqa: E402
import gbf_parts as gp                       # noqa: E402
import gbf_presets as gpr                    # noqa: E402

FRAME = tr.FRAME
ANCHOR = tr.ANCHOR
HEAD_ANCHOR = tr.HEAD_ANCHOR
DEFAULT_CACHE = '/tmp/fv_cache/geumbangfolk'
BIG = (128, 128)
MQ = ['M_core'] + tr.MQ_LIMBS
LIMBS = ['arm_R', 'arm_L', 'hand_R', 'hand_L']
LIMB_COL = tr.LIMB_LAYERS
PROXY = 'M_proxy'
HEADC = 'M_head_none'
# torso proxy: the thinnest garment torso (tf_parts SHIRT) pulled in by 0.008 m - every cover top is at least this big
PROXY_PROFILE = [(0.228, -0.085), (0.222, -0.02), (0.204, 0.10), (0.200, 0.22), (0.187, 0.31), (0.147, 0.39),
                 (0.062, 0.45), (0.0, 0.46)]


def parse_args():
    a = bc.script_args()
    opt = {'mode': 'full', 'bases': 'all', 'pass': 'torso', 'anims': 'all', 'samples': '6', 'threads': '3',
           'cache': DEFAULT_CACHE, 'force': False, 'reverse': False, 'combos': 'look', 'out': None, 'parts': 'all',
           'drop-layers': '', 'dirs': 'all'}
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

def build5(ctx, base, parts, face_sets=(), hat_variants=True, proxy=False):
    """tf_render.build + geumbangfolk items (+ the torso proxy shell for the acting renders)."""
    bc.reset_scene()
    gp._TEX.clear()
    rig = tb.build_rig()
    rig.meta['ch'] = {'age': tb.BASES[base]['age']}
    tb.build_mannequin(rig, ctx, noses=tr.NOSES)
    for fs in face_sets:
        tb.build_face_set(rig, ctx, fs)
    for pn in parts:
        tp.build_part(rig, ctx, pn)
    if proxy:
        import char_geo as g
        m = bc.mat('mq_proxy', '#5A5460', rough=0.8)
        with ctx.into(PROXY):
            g.mesh_obj('proxy_torso', g.bm_lathe(PROXY_PROFILE, seg=40, sy=0.84, smooth_n=20, cap_top=False), m,
                       rig.j['spine'])
    bpy.context.view_layer.update()
    if hat_variants:
        for pn in parts:
            if tp.PARTS[pn].hatfit:
                tp.hat_clip(rig, ctx, pn)
    if ctx.mode == 'layer':
        tr.make_diffuse_only(ctx, parts)
    ch = tb.apply_base(rig, base)
    rig.toggles.clear()
    return rig, ch


# --------------------------------------------------------------------------- posing

def stabilize_head(rig, hp, d):
    down, tilt, turn = ta2.head_rot2(hp, d)
    target = tr.q_axis((0, 0, 1), bc.DIR_YAW[d] + turn) @ tr.q_axis((1, 0, 0), down) @ tr.q_axis((0, 1, 0), tilt)
    bpy.context.view_layer.update()
    parent = rig.j['neck'].matrix_world.to_quaternion()
    rig.j['head'].rotation_quaternion = parent.inverted() @ target
    bpy.context.view_layer.update()


def solve_world_ik(rig, p):
    """'wik_R' / 'wik_L': root-local (facing frame) mitten targets + elbow poles -> chest-local IK."""
    bpy.context.view_layer.update()
    root = rig.j['root'].matrix_world
    inv = rig.j['chest'].matrix_world.inverted()
    rr = root.to_quaternion()
    ri = inv.to_quaternion()
    for side in ('R', 'L'):
        v = p.get('wik_' + side)
        if v is None:
            continue
        tgt = inv @ (root @ Vector(v[:3]))
        pole = ri @ (rr @ Vector(v[3:6]))
        rig.solve_arm(side, tuple(tgt), tuple(pole))
    bpy.context.view_layer.update()


def head_pose_of_key(anim, k, d):
    for i, kk in enumerate(ga.KEYS5[anim]):
        if kk == k:
            return ga.hp_for(anim, d, i)
    return 'loco'


def pose5(rig, anim, d, k, place=True, by_frame=False, hp=None, lower=False):
    """Pose body key k of a geumbangfolk anim (by_frame: k is a frame index), or frame k of a v4 / v5 anim.
    lower: the walking legs at their own hip height (carry_parcel LOWER pass / feet).  Returns (head pose, points)."""
    ch = rig.meta['ch']
    if anim in ga.ANIMS5:
        if by_frame:
            i = k
            k = ga.KEYS5[anim][i]
            hp = ga.hp_for(anim, d, i)
        p = ga.body_pose5(anim, k, ch, d, frame=(i if by_frame else None), lower=lower)
        hp = hp or head_pose_of_key(anim, k, d)
    else:
        p = ta2.pose2(anim, k, ch, d)
        hp = p['_hp']
    flags = {kk: v for kk, v in p.items() if kk.startswith('_')}
    wik = {kk: v for kk, v in p.items() if kk.startswith('wik_')}
    body = {kk: v for kk, v in p.items() if not kk.startswith('_') and not kk.startswith('wik_')}
    tb.scale_ik(rig, body)
    rig.apply(body, yaw_deg=bc.DIR_YAW[d])
    if wik:
        solve_world_ik(rig, wik)
    stabilize_head(rig, hp, d)
    pts = {}
    if place:
        pts = gp.place_items5(rig, d, flags, anim)
    return hp, pts


def pose_torso(rig, tk, d):
    """Torso key only (limbs at rest - they are not in the torso renders)."""
    ch = rig.meta['ch']
    p = ga.torso_pose(tk, ch, d)
    rig.apply(p, yaw_deg=bc.DIR_YAW[d])
    stabilize_head(rig, 'soc' if d in ga.FRONT else 'loco', d)
    gp.place_items5(rig, d, {})


def px_off(p, anchor=ANCHOR):
    return tr.px_off(p, anchor)


# --------------------------------------------------------------------------- jobs

def part_layers(pn):
    return [f'{pn}.{s}' for s in tp.PARTS[pn].subs]


def follows(layer):
    pn, s = layer.split('.', 1)
    return bool(tp.PARTS[pn].subs[s].get('follow'))


def chunks(lst, n):
    return [lst[i:i + n] for i in range(0, len(lst), n)]


def anim_items(anim):
    return list(ga.ANIM_ITEMS.get(anim, []))


def item_layers(anim):
    """layers of the anim items drawn in `anim` (held_parcel_gb: only the sub of that anim)."""
    out = []
    for it in anim_items(anim):
        for s, sd in tp.PARTS[it].subs.items():
            if sd.get('onlyAnims') and anim not in sd['onlyAnims']:
                continue
            out.append(f'{it}.{s}')
    return out


def plan_jobs(base):
    jobs = []
    cols = tr.BODY_COLS * tr.BODY_ROWS
    cast = gpr.cover_parts('scan', base)
    # TORSO: every (torso key, dir) of the acting anims
    tl = [l for pn in cast for l in part_layers(pn) if not follows(l)]
    tiles = [(tk, d) for tk, d in ga.torso_keys()]
    for n, ch_ in enumerate(chunks(tiles, cols)):
        jobs.append({'id': f'T_{n}', 'pass': 'torso', 'tiles': ch_, 'layers': ['mask'] + tl, 'parts': cast})
    # ACTING: limbs + following subs + items, per anim
    fl = [l for pn in cast for l in part_layers(pn) if follows(l)]
    for anim in ga.ORDER5:
        if not ga.acting(anim):
            continue
        items = anim_items(anim)
        layers = ['mask'] + LIMBS + fl + item_layers(anim)
        tiles = [(anim, d, k) for d in ga.ANIMS5[anim]['dirs'] for k in ga.keys_of(anim)]
        for n, ch_ in enumerate(chunks(tiles, cols)):
            jobs.append({'id': f'A_{anim}_{n}', 'pass': 'act', 'tiles': ch_, 'layers': layers, 'parts': cast + items})
    # LOWER (walk): the per-frame trousers / boots of the walking anims (carry_parcel); the upper body is shared
    for anim in sorted(ga.LOWER5):
        wcast = [pn for pn in gpr.cover_parts(anim, base) if pn.startswith(('bot_', 'shoe_'))]
        layers = ['mask'] + [l for pn in wcast for l in part_layers(pn)]
        for d in ga.ANIMS5[anim]['dirs']:
            tiles = [(anim, d, i) for i in range(ga.ANIMS5[anim]['frames'])]
            jobs.append({'id': f'W_{d}', 'pass': 'walk', 'tiles': tiles, 'layers': layers, 'parts': wcast,
                         'zfront': []})
    # OLD: the new body parts in the v4 anims
    for pn, anims in gpr.old_cast(base).items():
        for anim in anims:
            info = ta.ANIMS[anim]
            for d in info['dirs']:
                jid = f'O_{anim}_{d}'
                job = next((j for j in jobs if j['id'] == jid), None)
                if job is None:
                    job = {'id': jid, 'pass': 'old', 'tiles': [(anim, d, i) for i in range(info['frames'])],
                           'layers': ['mask'], 'parts': []}
                    jobs.append(job)
                job['parts'].append(pn)
                job['layers'] += part_layers(pn)
    return jobs


def write_index(bdir, base, jobs):
    idx = {'base': base, 'cols': tr.BODY_COLS, 'jobs': {}}
    for j in jobs:
        idx['jobs'][j['id']] = {'pass': j['pass'], 'w': BIG[0], 'h': BIG[1], 'ox': 0, 'oy': 0,
                                'tiles': [list(t) for t in j['tiles']], 'layers': j['layers'],
                                'parts': j['parts'], 'zfront': j.get('zfront', [])}
    with open(os.path.join(bdir, 'index.json'), 'w') as f:
        json.dump(idx, f, indent=0)
    return idx


def layer_specs(L, ctx, layers, ps):
    """View layers of one pass."""
    def sibs(pn, cname):
        cols = tr.part_sub_cols(ctx, pn)
        if ps == 'torso':
            # (critique H1) the limb-following subs (cuff_R / cuff_L) stand at the REST arm pose in the torso pass; as
            # holdouts they punched a see-through hole into the jacket / parka at the hip (the acting arms are posed
            # elsewhere).  They are drawn by the acting pass, so the torso garments never hold them out.
            return [c for s, c in cols.items() if c != cname and not tp.PARTS[pn].subs[s].get('follow')]
        return [c for c in cols.values() if c != cname]
    for name in layers:
        if name == 'mask':
            if ps == 'torso':
                L.add('mask', ['M_core', HEADC])
            else:
                L.add('mask', MQ + [HEADC])
            continue
        if name in LIMB_COL:
            cname = LIMB_COL[name]
            hold = [c for c in MQ if c != cname]
            if ps == 'act':
                L.add(name, [cname], holdout=hold + [PROXY, HEADC])
            else:
                L.add(name, [cname], holdout=hold, indirect=[HEADC])
            continue
        pn, s = name.split('.', 1)
        cols = tr.part_sub_cols(ctx, pn)
        cname = cols.get(s)
        if cname is None:
            continue
        if ps == 'torso':
            L.add(name, [cname], holdout=['M_core'] + sibs(pn, cname), indirect=[HEADC])
        elif ps == 'act':
            L.add(name, [cname], holdout=MQ + [PROXY, HEADC] + sibs(pn, cname))
        else:
            L.add(name, [cname], holdout=MQ + sibs(pn, cname), indirect=[HEADC])


def render_jobs(opt, base, jobs, t0):
    bdir = os.path.join(opt['cache'], 'body', base)
    groups = {}
    for j in jobs:
        groups.setdefault(j['pass'], []).append(j)
    for ps, js in groups.items():
        todo_jobs = []
        for j in js:
            outdir = os.path.join(bdir, j['id'])
            want = j['layers']
            todo = want if opt['force'] else [n for n in want if n not in tr.done_layers(outdir, want)]
            if todo:
                todo_jobs.append((j, todo))
        if not todo_jobs:
            continue
        parts = []
        for j, _ in todo_jobs:
            parts += [p for p in j['parts'] if p not in parts]
        layers = []
        for j, todo in todo_jobs:
            layers += [l for l in j['layers'] if l not in layers]
        ctx = tb.Ctx('layer')
        rig, ch = build5(ctx, base, parts, proxy=(ps == 'act'))
        w, h = BIG
        tx = tr.TILE_X * (w / 128.0)
        ty = tr.TILE_Y * (h / 128.0)
        rigs = tr.make_tiles(rig, tr.BODY_COLS * tr.BODY_ROWS, tr.BODY_COLS, tx=tx, ty=ty)
        sc, cam = setup_scene(opt, ANCHOR, tr.BODY_COLS * w, tr.BODY_ROWS * h)
        L = tr.Layers(ctx)
        layer_specs(L, ctx, layers, ps)
        L.realize()
        names = {s_[0] for s_ in L.specs}
        print(f'[{base}] {ps}: {len(todo_jobs)} jobs, {len(names)} layers, {len(parts)} parts', flush=True)
        if opt['reverse']:
            todo_jobs = todo_jobs[::-1]
        for j, todo in todo_jobs:
            outdir = os.path.join(bdir, j['id'])
            tiles = j['tiles']
            for k, r_ in enumerate(rigs):
                t = tiles[min(k, len(tiles) - 1)]
                if ps == 'torso':
                    pose_torso(r_, t[0], t[1])
                elif ps == 'act':
                    pose5(r_, t[0], t[1], t[2])
                else:                                  # walk / old: frame index
                    pose5(r_, t[0], t[1], t[2], by_frame=(t[0] in ga.ANIMS5), lower=(ps == 'walk'))
            L.render(outdir, {n for n in todo if n in names})
            print(f'[{base}] {j["id"]}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)


def invalidate(bdir, jobs, drop):
    """Cache hygiene: a job whose tiles changed since the cached index.json is wiped; --drop-layers removes those layer
    PNGs everywhere (they re-render, nothing else)."""
    old = {}
    ip = os.path.join(bdir, 'index.json')
    if os.path.exists(ip):
        old = json.load(open(ip)).get('jobs', {})
    for j in jobs:
        jd = os.path.join(bdir, j['id'])
        if not os.path.isdir(jd):
            continue
        prev = old.get(j['id'])
        if prev is None or [list(t) for t in j['tiles']] != prev['tiles']:
            for f in os.listdir(jd):
                if f.endswith('.png'):
                    os.remove(os.path.join(jd, f))
            print(f'[cache] {j["id"]}: tiles changed -> re-render', flush=True)
            continue
        for L in drop:
            f = os.path.join(jd, L + '.png')
            if os.path.exists(f):
                os.remove(f)


def render_body(opt):
    t0 = time.time()
    drop = [x for x in opt['drop-layers'].split(',') if x]
    for base in sel(opt['bases'], gpr.RENDER_BASES):
        jobs = plan_jobs(base)
        bdir = os.path.join(opt['cache'], 'body', base)
        os.makedirs(bdir, exist_ok=True)
        invalidate(bdir, jobs, drop)
        write_index(bdir, base, jobs)
        mine = [j for j in jobs if opt['pass'] == 'all' or j['pass'] == opt['pass']]
        if opt['anims'] != 'all':
            want = opt['anims'].split(',')
            mine = [j for j in mine if any(t[0] in want for t in j['tiles'])]
        render_jobs(opt, base, mine, t0)
        print(f'[{base}] {opt["pass"]} done {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- head (hat_gb_cap on every head frame)

def render_head(opt):
    t0 = time.time()
    parts = gp.NEW_HEAD5
    ctx = tb.Ctx('layer')
    rig, ch = build5(ctx, 'adult_slim', parts)
    sc, cam = setup_scene(opt, HEAD_ANCHOR, FRAME, FRAME)
    L = tr.Layers(ctx)
    hold = [HEADC]
    L.add('head.none', [HEADC])
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
    meta = {'anchor': list(HEAD_ANCHOR), 'layout': 'dirs', 'frames': [f'{hp}_{d}' for hp, d in ta2.all_head_frames()],
            'layers': names, 'newHeadParts': parts}
    with open(os.path.join(hdir, 'meta.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print(f'[head5] {len(frames)} frames, {len(names)} layers', flush=True)
    for k, (hp, d) in enumerate(frames):
        outdir = os.path.join(hdir, f'{hp}_{d}')
        todo = names if opt['force'] else [n for n in names if n not in tr.done_layers(outdir, names)]
        if not todo:
            continue
        rig.apply({}, yaw_deg=0.0)
        stabilize_head(rig, hp, d)
        tr.aim_camera(cam, rig.j['head'].matrix_world.translation.copy(), HEAD_ANCHOR)
        L.render(outdir, set(todo))
        print(f'[head5] {k + 1}/{len(frames)} {hp}_{d}: {len(todo)} layers  {time.time() - t0:.0f}s', flush=True)
    print(f'[head5] done in {time.time() - t0:.0f}s', flush=True)


# --------------------------------------------------------------------------- meta

def body_meta5(opt, base):
    items = sorted({it for a in ga.ORDER5 for it in ga.ANIM_ITEMS.get(a, [])})
    ctx = tb.Ctx('layer')
    rig, ch = build5(ctx, base, items)
    rig.rest_loc['root'] = Vector((0, 0, 0))
    meta = {'base': base, 'anchor': [ANCHOR[0] / FRAME, ANCHOR[1] / FRAME], 'headAnchor': list(HEAD_ANCHOR),
            'headOffset': {}, 'headOffsetF': {}, 'box': {}, 'hand': {}, 'bell': {}, 'beam': {}, 'tape': {},
            'gaps': {}, 'fwd': {}, 'feet': {}}
    for anim, d, i in ga.frames5():
        hp, pts = pose5(rig, anim, d, i, by_frame=True)
        off = px_off(rig.j['head'].matrix_world.translation)
        meta['headOffsetF'][f'{anim}_{d}_{i}'] = [round(off[0], 2), round(off[1], 2)]
        meta['headOffset'][f'{anim}_{d}_{i}'] = [int(round(off[0])), int(round(off[1]))]
        key = f'{anim}_{d}_{i}'
        if 'box' in pts:
            c_, b_ = px_off(pts['box'][0]), px_off(pts['box'][1])
            meta['box'][key] = [round(c_[0], 1), round(c_[1], 1), round(b_[0], 1), round(b_[1], 1)]
        for name in ('hand', 'bell', 'tape'):
            if name in pts:
                o = px_off(pts[name])
                meta[name][key] = [round(o[0], 1), round(o[1], 1)]
        if 'beam' in pts:
            a_, b_ = px_off(pts['beam'][0]), px_off(pts['beam'][1])
            meta['beam'][key] = [round(a_[0], 1), round(a_[1], 1), round(b_[0], 1), round(b_[1], 1)]
        # IK reach: how far the mittens ended from where the pose wanted them
        p = ga.body_pose5(anim, ga.KEYS5[anim][i], rig.meta['ch'], d)
        gap = 0.0
        root = rig.j['root'].matrix_world
        for s in ('R', 'L'):
            if 'wik_' + s in p:
                want = root @ Vector(p['wik_' + s][:3])
                gap = max(gap, (rig.world('hand_' + s) - want).length)
            elif 'ik_' + s in p:
                q = dict(p)
                tb.scale_ik(rig, q)
                want = rig.j['chest'].matrix_world @ Vector(q['ik_' + s][:3])
                gap = max(gap, (rig.world('hand_' + s) - want).length)
        meta['gaps'][key] = round(gap, 3)
        if anim in ga.WALKERS5:
            pose5(rig, anim, d, i, by_frame=True, place=False, lower=True)       # the rendered (LOWER pass) legs
            fr = []
            for n in ('R', 'L'):
                w = rig.world('knee_' + n, (0, -0.02, -0.15))
                o = px_off(w)
                fr.append([round(o[0], 2), round(o[1], 2), round(w.z, 4)])
            meta['feet'][key] = fr
    # reference: townfolk walk feet (same measurement) for the groundSpeed comparison
    for d in ga.LOCO:
        for i in range(8):
            pose5(rig, 'walk', d, i, place=False)
            fr = []
            for n in ('R', 'L'):
                w = rig.world('knee_' + n, (0, -0.02, -0.15))
                o = px_off(w)
                fr.append([round(o[0], 2), round(o[1], 2), round(w.z, 4)])
            meta['feet'][f'walk_{d}_{i}'] = fr
    for d in ga.LOCO:
        rig.apply({}, yaw_deg=bc.DIR_YAW[d])
        bpy.context.view_layer.update()
        root = rig.j['root'].matrix_world
        a, b = px_off(root @ Vector((0, 0, 0))), px_off(root @ Vector((0, -1, 0)))
        n = math.hypot(b[0] - a[0], b[1] - a[1]) or 1.0
        meta['fwd'][d] = [round((b[0] - a[0]) / n, 4), round((b[1] - a[1]) / n, 4)]
    # static parcels the game draws under the hub anims (bases.boxPoint.scan / .tape_box = [cx, cy, bx, by]: the
    # parcel's top centre and bottom centre): the parcel lying on the counter under the beam, the box being taped
    for anim, top, h in (('scan', ga.SCAN_TARGET, ga.PARCEL_ON_COUNTER), ('tape_box', ga.TAPE_BOX_TOP, ga.TAPE_BOX_H)):
        for d in ga.ANIMS5[anim]['dirs']:
            rig.apply({}, yaw_deg=bc.DIR_YAW[d])
            bpy.context.view_layer.update()
            root = rig.j['root'].matrix_world
            c_ = px_off(root @ Vector(top))
            b_ = px_off(root @ Vector((top[0], top[1], top[2] - h)))
            for i in range(ga.ANIMS5[anim]['frames']):
                meta['box'][f'{anim}_{d}_{i}'] = [round(c_[0], 1), round(c_[1], 1), round(b_[0], 1), round(b_[1], 1)]
    # work heights in px above the feet (for the hub lift)
    rig.apply({}, yaw_deg=bc.DIR_YAW['S'])
    bpy.context.view_layer.update()
    meta['heights'] = {k: round(px_off(Vector((0, 0, v)))[1], 2) for k, v in
                       (('counterTop', ga.COUNTER_TOP), ('boxTop', ga.BOX_TOP), ('shelf', ga.shelf('SE')),
                        ('tote', ga.TOTE))}
    bdir = os.path.join(opt['cache'], 'body', base)
    os.makedirs(bdir, exist_ok=True)
    with open(os.path.join(bdir, 'meta5.json'), 'w') as f:
        json.dump(meta, f, indent=0)
    return meta


def render_meta(opt):
    for base in sel(opt['bases'], gpr.RENDER_BASES):
        m = body_meta5(opt, base)
        worst = sorted(m['gaps'].items(), key=lambda kv: -kv[1])[:10]
        print(base, 'worst IK gaps (m):', worst, flush=True)


# --------------------------------------------------------------------------- full (look-dev / proof)

def render_full(opt):
    t0 = time.time()
    if opt['combos'] == 'look':
        combos = [dict(c, frames=gpr.LOOK_FRAMES[c['name']]) for c in gpr.LOOK]
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
        items = sorted({it for a, _, _ in todo for it in ga.ANIM_ITEMS.get(a, [])})
        parts = list(cb_['parts']) + [it for it in items if it not in cb_['parts']]
        ctx = tb.Ctx('full', cb_['colors'])
        hat = any(tp.PARTS[p].family == 'hat' and tp.PARTS[p].cls == 'full' for p in parts)
        rig, ch = build5(ctx, cb_['base'], parts, (cb_['face'],), hat_variants=hat)
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
            for cname in ctx.cols:                          # items only in the anims (and subs) they belong to
                if not cname.startswith('P.'):
                    continue
                pn, s = cname.split('.')[1], cname.split('.')[2].split('~')[0]
                P = tp.PARTS[pn]
                only = getattr(P, 'only_anims', None)
                vis = True
                if only is not None:
                    vis = anim in only
                sd = P.subs.get(s, {})
                if sd.get('onlyAnims') and anim not in sd['onlyAnims']:
                    vis = False
                if P.hatfit:
                    vis = vis and cname.endswith('~hat') == hat
                vl.layer_collection.children.get(cname).exclude = not vis
            rig.rest_loc['root'] = root0
            hp, pts = pose5(rig, anim, d, i, by_frame=True)
            if anim in ga.ANIMS5:
                face = ga.face_for(anim, d, i)
                brow = ga.expr_brow(face)
            else:
                tl = ta2.pose2(anim, i, rig.meta['ch'], d)
                face, brow = tl['_face'], tl['_brow']
            want = {f'F_{fs}_{t}' for t in ta.FACE_EXPR.get(face, []) or ta2.FACE_EXPR2.get(face, [])}
            want.add(f'F_{fs}_{ta.BROW_SHAPES.get(brow, "brow_neutral")}')
            want.add(f'F_{fs}_lines')
            for cname in ctx.cols:
                if cname.startswith('F_'):
                    vl.layer_collection.children.get(cname).exclude = cname not in want
            bc.render_to(os.path.join(outdir, f'{anim}_{d}_{i}.png'))
        print(f'[full5] {cb_["name"]} {len(todo)} frames  {time.time() - t0:.0f}s', flush=True)


def main():
    opt = parse_args()
    os.makedirs(opt['cache'], exist_ok=True)
    {'body': render_body, 'meta': render_meta, 'full': render_full, 'head': render_head}[opt['mode']](opt)


if __name__ == '__main__':
    main()
