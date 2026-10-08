"""
bf_pack.py - beachfolk layers -> assets/beachfolk atlases + manifest fragment (CONTRACT_V7 Y).

Run AFTER bf_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/bf_pack.py [--colors 56] [--cache <scratch>/v7_beachfolk/cache] [--out assets/beachfolk]

Same layer processing, frame naming and compact 'tfatlas' JSON as tools/blender/tf_pack.py (imported, not edited).
Atlas keys are bf_head_<k> and bf_<base>_<k> (never clash with tf_* / tf2_*).  Water anims: the ink ring is also
erased inside 'mask_uw' (everything under the surface), so the waterline cut gets no outline.

What the fragment holds (no frame name of assets/townfolk or assets/townfolk2 is repeated):
  body  <layer>@<base>/<anim>_<dir>_<i>   new anims (swim, float, sunbathe, dig, ball_throw, ball_catch, splash_play,
                                          surf) for the limbs and the beach parts; the beach parts in the v4 / v5
                                          anims their anim set lists (bf_presets.PART_ANIMS)
  head  <layer>/<pose>_<dir>              poses 'swim' (water-cut) and 'lie' for every v4 head layer; the new head
                                          parts in every pose; face exprs laugh / relax / wow
The manifest's 'beachfolk' block is a PARTIAL townfolk block: merge it after townfolk2 with the rules in MERGE_RULES
(tools/beachfolk_compose.py / .js implement them).
"""
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

import tf_pack as tpk                      # noqa: E402
import tf_anim as ta                       # noqa: E402
import tf_parts as tp                      # noqa: E402
import tf_presets as tpr                   # noqa: E402
import tf_layerfx as fx                    # noqa: E402
import tf2_anim as ta2                     # noqa: E402
import tf2_pack as tpk2                    # noqa: E402
import tf2_parts as tp2                    # noqa: E402
import bf_anim as ba                       # noqa: E402
import bf_parts as bp                      # noqa: E402
import bf_presets as bpr                   # noqa: E402
import townfolk_compose as tc              # noqa: E402

FRAME = 128
SCRATCH = '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beachfolk'
DEFAULT_CACHE = os.path.join(SCRATCH, 'cache')
OUT = os.path.join(GAME, 'assets', 'beachfolk')
LIMB_LAYERS = tpk.LIMB_LAYERS

MERGE_RULES = [
    'Merge order: assets/townfolk "townfolk" + assets/townfolk2 "townfolk2" (mergeTownfolk) and then this '
    '"beachfolk" block (mergeBeachfolk in tools/beachfolk_compose.js / .py).  Queue the atlases of all three.',
    'anims, timeline, headPoses, parts, z, tintRef, palettes, frameAtlas: add the new keys (the fragment never '
    'redefines an existing key - the merge throws if it would).',
    'frameAtlasExt: [{anims:[...], map:{layer@base: atlas}}] -> frameAtlasAnim[anim]; [{poses:[...], map:{layer: '
    'atlas}}] -> frameAtlasPose[pose] (v4 limbs in the new anims, v4 head layers in the new head poses).',
    'faceExprs: union per head pose (new poses swim / lie, new exprs laugh / relax / wow on some old poses); '
    'exprBrow: add.  faceDirsByPose (new): head poses whose face dirs differ from faceDirs (lie: SE only).',
    'bases[b]: headOffset gets the new anim keys; parts = union; ballPoint, digPoint, splashPoint, lieShadow, '
    'bodyK are new keys.',
    'tintModel.slotS: add; tintTable[slot]: union of colours.',
    'generator.presets: add (throws on a clash); slotPalette: add; exclude: concatenate; beachSlots (new): colour '
    'slots generate3 always fills (preset colour or slot palette); animParts (new): {anim: [part]} props drawn in that '
    'anim even when the person does not wear them (float: swim_ring_worn, surf: surfboard, dig: toy_spade).',
    'parts[p].anims (new): the anims this beach part has frames for (a part without it = a v4 / v5 part: frames for '
    'the v4 + v5 anims only).  canPlay(person, anim) = every BODY part of the person has frames for the anim.',
    'timeline[anim][dir][i].hd (new, optional): the head frame dir when it differs from the anim dir (surf NE looks E).',
    'subs followDz (new, optional): z = limb z + followDz instead of + 0.5 (bare_arms 0.2 < sleeve cuffs 0.5 < '
    'arm floaties 0.7).',
]


def load(p):
    return tpk.load(p)


def to_u8(img):
    return tpk.to_u8(img)


def process(img, kind, mask):
    return tpk.process(img, kind, mask)


# --------------------------------------------------------------------------- collect

def collect_head3(cache, log):
    hd = os.path.join(cache, 'head')
    meta = json.load(open(os.path.join(hd, 'meta.json')))
    out = {}
    for name in meta['frames']:
        fd = os.path.join(hd, name)
        mp = os.path.join(fd, 'head.none.png')
        if not os.path.exists(mp):
            log.append(f'missing head frame {name}')
            continue
        mask = load(mp)[..., 3]
        up = os.path.join(fd, 'mask_uw.png')
        if os.path.exists(up):
            mask = np.maximum(mask, load(up)[..., 3])
        hp, d = name.split('_', 1)
        for f in sorted(os.listdir(fd)):
            if not f.endswith('.png') or f in ('head.none.png', 'mask_uw.png'):
                continue
            layer = f[:-4]
            kind = fx.layer_kind(layer)
            if kind == 'face' and d not in ba.face_dirs(hp):
                continue
            pn = layer.split('.')[0]
            if kind == 'layer' and not layer.startswith('head.') and pn not in tp.PARTS:
                continue
            img = load(os.path.join(fd, f))
            if img[..., 3].max() <= 2 / 255:
                continue
            res = process(img, kind, mask)
            if res[..., 3].max() <= 2 / 255:
                continue
            out.setdefault(layer, {})[name] = to_u8(res)
    return out, meta


def collect_body3(cache, base, log):
    bd = os.path.join(cache, 'body', base)
    meta = json.load(open(os.path.join(bd, 'meta3.json')))
    out = {}
    age = tpr.BASES[base]['age']
    groups = [(a, d, ba.anim_info(a)['frames'], a in ba.ANIMS3) for a in ba.ALL_ANIMS for d in ba.anim_info(a)['dirs']]
    for anim, d, n, new in groups:
        gd = os.path.join(bd, f'{anim}_{d}')
        tl = meta['tiles'].get(anim, meta['tiles']['idle'])
        mpath = os.path.join(gd, 'mask.png')
        if not os.path.isdir(gd):
            if new or any(anim in bpr.PART_ANIMS.get(p, []) for p in bp.NEW_BODY
                          if tp.PARTS[p].subs and (tp.PARTS[p].ages is None or age in tp.PARTS[p].ages)):
                log.append(f'missing body group {base}/{anim}_{d}')
            continue
        if not os.path.exists(mpath):
            log.append(f'missing mask {base}/{anim}_{d}')
            continue
        mask = load(mpath)
        up = os.path.join(gd, 'mask_uw.png')
        if os.path.exists(up):
            uw = load(up)
            mask = mask.copy()
            mask[..., 3] = np.maximum(mask[..., 3], uw[..., 3])
        for f in sorted(os.listdir(gd)):
            if not f.endswith('.png') or f in ('mask.png', 'mask_uw.png'):
                continue
            layer = f[:-4]
            pn = layer.split('.')[0]
            if layer in LIMB_LAYERS:
                if not new:
                    continue
            elif pn not in bp.NEW_BODY or anim not in bpr.PART_ANIMS.get(pn, []):
                continue
            elif tp.PARTS[pn].ages and age not in tp.PARTS[pn].ages:
                continue
            sh = load(os.path.join(gd, f))
            kind = fx.layer_kind(layer)
            fr = out.setdefault(layer, {})
            for i in range(n):
                img = tpk.body_tile(sh, i, tl)
                if img[..., 3].max() <= 2 / 255:
                    continue
                res = process(img, kind, tpk.body_tile(mask, i, tl)[..., 3])
                if res[..., 3].max() <= 2 / 255:
                    continue
                fr[f'{anim}_{d}_{i}'] = to_u8(res)
    out = {k: v for k, v in out.items() if v}
    return out, meta


# --------------------------------------------------------------------------- manifest

def part_entry3(P):
    e = tpk2.part_entry2(P)
    for s, sd in P.subs.items():
        if sd.get('followDz') is not None:
            e['subs'][s]['followDz'] = sd['followDz']
    if P.name in bpr.PART_ANIMS:
        e['anims'] = list(bpr.PART_ANIMS[P.name])
    auto = [a for a, ps in bpr.ANIM_PARTS.items() if P.name in ps]
    if auto:
        e['autoFor'] = auto
    return e


def nested3(flat, default=None):
    return {a: {d: [flat.get(f'{a}_{d}_{i}', default) for i in range(ba.ANIMS3[a]['frames'])]
                for d in ba.ANIMS3[a]['dirs']} for a in ba.ORDER3}


def _sx_pt(v, sx):
    return [round(v[0] * sx, 1), round(v[1], 1)] + list(v[2:])


def build_manifest3(body_metas, where_head, where_body, body_layers, atlases, head_poses, head_layers):
    """head_poses: {head layer: {poses with frames in this fragment}}."""
    zf = body_metas.get('adult_slim', {}).get('zfront', {})
    tl = ba.timeline3(zf)
    timeline = {a: {d: [tl[(a, d, i)] for i in range(ba.ANIMS3[a]['frames'])] for d in ba.ANIMS3[a]['dirs']}
                for a in ba.ORDER3}
    bases = {}
    for base in tpr.BASE_ORDER:
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in body_metas:
            continue
        m = body_metas[src]
        parts = sorted({l.split('.')[0] for l in body_layers[src] if l.split('.')[0] in bp.NEW_BODY})
        if parts:
            parts = sorted(set(parts) | {'no_top'})
        ho = {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}
        bpnt = {}
        for a in ('ball_throw', 'ball_catch'):
            bpnt[a] = {d: [(_sx_pt(m['ballPoint'][f'{a}_{d}_{i}'], sx) if f'{a}_{d}_{i}' in m['ballPoint'] else None)
                           for i in range(ba.ANIMS3[a]['frames'])] for d in ba.ANIMS3[a]['dirs']}
        e = {'headOffset': nested3(ho), 'parts': parts, 'ballPoint': bpnt,
             'digPoint': {d: _sx_pt(v, sx) for d, v in m['digPoint'].items()},
             'splashPoint': {d: _sx_pt(v, sx) for d, v in m['splashPoint'].items()},
             'lieShadow': {d: dict(v, center=_sx_pt(v['center'], sx)) for d, v in m['shadow'].items()},
             'bodyK': m['k']}
        bases[base] = e
    with open(os.path.join(GAME, 'assets', 'townfolk', 'manifest.json'), encoding='utf-8') as f:
        fa1 = json.load(f)['townfolk']['frameAtlas']
    with open(os.path.join(GAME, 'assets', 'townfolk2', 'manifest.json'), encoding='utf-8') as f:
        fa2 = json.load(f)['townfolk2']['frameAtlas']
    old = set(fa1) | set(fa2)
    frame_atlas, ext_anim, ext_pose = {}, {}, {}
    for layer, key in where_head.items():
        if layer not in old:
            frame_atlas[layer] = key
            continue
        for hp in sorted(head_poses.get(layer, ())):
            ext_pose.setdefault(hp, {})[layer] = key
    for base, w in where_body.items():
        for layer, key in w.items():
            L = f'{layer}@{base}'
            (ext_anim if L in old else frame_atlas)[L] = key
    frame_atlas_ext = [{'anims': list(ba.ORDER3), 'map': ext_anim}]
    frame_atlas_ext += [{'poses': [hp], 'map': mp} for hp, mp in sorted(ext_pose.items())]
    parts = {pn: part_entry3(tp.PARTS[pn]) for pn in bp.NEW_PARTS}
    # colours
    tint_ref = dict(bpr.TINT_REF3)
    model = dict(tpr.TINT_MODEL)
    model['slotS'] = dict(model['slotS'], **bpr.TINT_MODEL_SLOTS3)
    tint_table = {}
    for slot, pal in bpr.SLOT_PALETTE3.items():
        cols = set(bpr.PALETTES3[pal])
        if slot == 'swim':
            cols |= set(bpr.PALETTES3['swim_kid']) | set(bpr.PALETTES3['swim_elder'])
        tint_table[slot] = {c: tc.tint_hex(c, tint_ref[slot], model, slot) for c in sorted(cols)}
    extra = {k: set(v) for k, v in bpr.EXTRA_TINTS.items()}
    for pr in bpr.PRESETS3.values():
        for slot, v in pr.get('colors', {}).items():
            if slot == 'hands':
                continue
            vals = v if isinstance(v, list) else ([v] if isinstance(v, str) else [])
            for c in vals:
                if c.startswith('#'):
                    extra.setdefault(slot, set()).add(c)
                elif c in bpr.PALETTES3:
                    extra.setdefault(slot, set()).update(bpr.PALETTES3[c])
    for slot, cols in extra.items():
        if slot in bpr.SLOT_PALETTE3:
            tint_table[slot].update({c: tc.tint_hex(c, tint_ref[slot], model, slot) for c in sorted(cols)})
        else:
            ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
            tint_table.setdefault(slot, {}).update({c: tc.tint_hex(c, ref, tpr.TINT_MODEL, slot) for c in sorted(cols)})
    face_exprs = {}
    for hp, d, e in ba.face_frames3():
        face_exprs.setdefault(hp, [])
        if e not in face_exprs[hp]:
            face_exprs[hp].append(e)
    zkeys = {k: v for k, v in bp.Z3.items()}
    B = {
        'version': 1, 'fragment': 'beachfolk', 'extends': ['townfolk', 'townfolk2'],
        'anims': {a: dict(ba.ANIMS3[a]) for a in ba.ORDER3},
        'timeline': timeline,
        'headPoses': {hp: {'lookDown': v[0], 'tilt': v[1], 'turn': v[2], 'dirs': ba.HEAD_POSE_DIRS3[hp],
                           'cheat': ba.HEAD_CHEAT3[hp]} for hp, v in ba.HEAD_POSES3.items()},
        'faceDirsByPose': {hp: list(ds) for hp, ds in ba.FACE_DIRS3.items()},
        'faceExprs': face_exprs,
        'exprBrow': dict(ba.EXPR_BROW3),
        'bases': bases,
        'parts': parts,
        'z': {('bf_' + k): v for k, v in zkeys.items()},
        'tintRef': tint_ref,
        'tintModel': {'slotS': dict(bpr.TINT_MODEL_SLOTS3)},
        'tintTable': tint_table,
        'palettes': dict(bpr.PALETTES3),
        'generator': {'presets': bpr.PRESETS3, 'slotPalette': dict(bpr.SLOT_PALETTE3), 'exclude': bpr.EXCLUDE3,
                      'beachSlots': list(bpr.BEACH_SLOTS), 'animParts': dict(bpr.ANIM_PARTS)},
        'frameAtlas': frame_atlas,
        'frameAtlasExt': frame_atlas_ext,
        'water': {
            'anims': sorted(ba.WATER_ANIMS),
            'anchor': 'ON THE WATER SURFACE (the sea surface point under the swimmer; harbour / beach water props use the '
                      'same plane: land z 0, sea surface waterPx 30 below it at the quay - on a sand beach the shallow '
                      'water surface is level with the sand line).',
            'cut': 'Everything under the surface is baked out of every layer (camera-only holdout block, z < 0); the '
                   'ink outline is erased along the cut.  Head frames of pose "swim" are cut %.2f m below the head '
                   'centre (= the swim head height), so long hair ends at the waterline too.' % ba.SWIM_HEAD_CUT,
            'swim': {'headCenterAboveWaterM': ba.SWIM_HEAD_Z, 'ripple': 'fx_swim_ripple centred on the anchor, '
                     'radius ~ 0.45 m (29 x 14 px at 1x; x bodyK for children)'},
            'float': {'ringCenterAboveWaterM': ba.FLOAT_RING_Z, 'ripple': 'fx_swim_ripple centred on the anchor, radius '
                      '~ ring radius + 0.1 m (0.4 m adult)'},
            'splash_play': {'feetBelowWaterM': ba.SPLASH_DEPTH, 'impact': 'spawn fx_splash_small at anchor + '
                            'bases[b].splashPoint[dir] on impactFrame 2; fx_swim_ripple at the anchor'},
            'surf': {'boardDeckAboveWaterM': ba.BOARD_TOP, 'dir': 'dir = where the board nose points (SE / NE rendered, '
                     'SW / NW mirrored); fx_wake_v2 behind the tail'},
            'shadow': 'no ground shadow in water anims (draw the ripple instead)'},
        'sunbathe': {'dir': 'dir = where the FEET point (SE / NE rendered, SW / NW mirrored); the head is at the other '
                            'end.  Anchor = under the hips ON the lying surface (towel decal / lounger lyingPoint).',
                     'lieHeightM': ba.LIE_HIPS_Z,
                     'shadow': 'instead of the round shadow draw an ellipse bases[b].lieShadow[dir] = {center [dx, dy], '
                               'length, width, angleDeg} (mirrored dirs: negate dx and the angle)'},
        'dig': {'anchor': 'ground under the hips (kneeling)', 'digPoint': 'bases[b].digPoint[dir] = where the sandcastle '
                                                                        '(beach sandcastle_build stages) stands'},
        'ball': {'radiusM': ba.BALL_R,
                 'ballPoint': 'bases[b].ballPoint[anim][dir][i] = [dx, dy, front, radiusPx] centre of the held ball '
                              '(null = no ball in the hands).  ball_throw: release on impactFrame 3 (spawn the flying '
                              'ball there), ball_catch: the ball arrives on impactFrame 2.  front: draw the ball sprite '
                              'over the person (else under).  Scale the beach ball item so its radius = radiusPx.'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_V7 Y).  Merge after townfolk2 (rules in "merge"), then compose '
                  'exactly like tools/beachfolk_compose.py: the v4 + v5 rules plus (1) head frames use timeline hd '
                  '(default dir) and faceDirsByPose; (2) animParts are drawn in their anim even if not worn; '
                  '(3) parts with "anims" draw only in those anims (canPlay checks a whole person); (4) followDz; '
                  '(5) water anims are anchored on the water surface (see water).'),
    }
    return {'version': 1, 'notes': ('Beachfolk fragment (CONTRACT_V7 Y): swim / float / sunbathe / dig / beach ball / '
                                    'splash / surf anims for every townsperson body, swimwear and beach + hotel job '
                                    'outfits.  Atlas JSONs are tfatlas v1 like assets/townfolk (NOT Phaser JSON hash).  '
                                    'Block "beachfolk" merges after assets/townfolk2 - see beachfolk.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'beachfolk': B}


def main():
    args = sys.argv[1:]
    cache, colors, dither = DEFAULT_CACHE, 56, 0.5
    out = OUT
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--cache':
            cache = args[i + 1]; i += 2; continue
        if a == '--colors':
            colors = int(args[i + 1]); i += 2; continue
        if a == '--dither':
            dither = float(args[i + 1]); i += 2; continue
        if a == '--out':
            out = os.path.abspath(args[i + 1]); i += 2; continue
        i += 1
    tpk.OUT = out
    t0 = time.time()
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('bf_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(out, f))
    log, report = [], []
    print('[head3] collecting', flush=True)
    head_layers, head_meta = collect_head3(cache, log)
    atlases, where_head = tpk.build_sheets('bf_head', head_layers, lambda l, f: f'{l}/{f}', colors, dither, report)
    body_metas, where_body, body_layer_names = {}, {}, {}
    for base in tpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'meta3.json')):
            log.append(f'no body renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        layers, meta = collect_body3(cache, base, log)
        body_metas[base] = meta
        body_layer_names[base] = sorted(layers)
        at, w = tpk.build_sheets(f'bf_{base}', layers, lambda l, f, b=base: f'{l}@{b}/{f}', colors, dither, report)
        atlases += at
        where_body[base] = w
    for at in atlases:
        at['png'] = 'beachfolk/' + at['png'].split('/', 1)[1]
        at['json'] = 'beachfolk/' + at['json'].split('/', 1)[1]
    head_poses = {l: {f.split('_', 1)[0] for f in fr} for l, fr in head_layers.items()}
    man = build_manifest3(body_metas, where_head, where_body, body_layer_names, atlases, head_poses, head_layers)
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    area = sum(w * h for _, (w, h), *_ in report)
    print(f'atlases {len(atlases)}, frames {sum(r[2] for r in report)} (+{sum(r[3] for r in report)} aliases), '
          f'sheet area {area / 1e6:.2f} Mpx (~{area * 4 / 2 ** 20:.1f} MiB GPU), payload {total / 1e6:.2f} MB, '
          f'{time.time() - t0:.0f}s')
    for l in log:
        print('WARN', l)


if __name__ == '__main__':
    main()
