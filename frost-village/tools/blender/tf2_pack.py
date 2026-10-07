"""
tf2_pack.py - townfolk v5 layers -> assets/townfolk2 atlases + manifest fragment (CONTRACT_V5 Q).

Run AFTER tf2_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/tf2_pack.py [--colors 56] [--cache /tmp/fv_cache/townfolk2] [--out assets/townfolk2]

Same layer processing, frame naming and compact 'tfatlas' JSON as tools/blender/tf_pack.py (imported, not
edited).  Atlas keys are tf2_head_<k> and tf2_<base>_<k> (never clash with assets/townfolk tf_*).

What the fragment holds (all frame names are NEW - no name of assets/townfolk is repeated):
  body  <layer>@<base>/<anim>_<dir>_<i>   new anims sad/clap/sit/push for every body layer the game can
                                          use + the new body parts for the v4 anims
  head  <layer>/<pose>_<dir>              pose 'down' for every head layer; new head parts (veil,
                                          flower_crown, black_hat) for every pose; face exprs sad /
                                          sad_closed / tear (+ brow sad) for every face pose
The manifest's 'townfolk2' block is a PARTIAL townfolk block; merge it into assets/townfolk's
'townfolk' block with the rules in MERGE_RULES (tools/townfolk2_compose.py/.js implement them).
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
import tf2_parts as tp2                    # noqa: E402
import tf2_presets as tpr2                 # noqa: E402
import townfolk_compose as tc              # noqa: E402

FRAME = 128
DEFAULT_CACHE = '/tmp/fv_cache/townfolk2'
OLD_CACHE = '/tmp/fv_cache/townfolk'
OUT = os.path.join(GAME, 'assets', 'townfolk2')
LIMB_LAYERS = tpk.LIMB_LAYERS
NEW_HEAD = [p for p in tp2.NEW_PARTS if tp.PARTS[p].space == 'head']
NEW_BODY = [p for p in tp2.NEW_PARTS if tp.PARTS[p].space == 'body']

MERGE_RULES = [
    'Load assets/townfolk/manifest.json (block "townfolk") AND assets/townfolk2/manifest.json (block "townfolk2"); '
    'queue the atlases of both (townfolkPreload / townfolkInstall work on the merged atlas list).',
    'atlases: concatenate.  frameAtlas: union (the two never share a key) - it holds the layers that are new in '
    'townfolk2.  frameAtlasExt: v4 layers whose NEW frames live in townfolk2 atlases: [{anims:[...], map:{layer: '
    'atlas}}, {poses:[...], map:{layer: atlas}}] -> merged as frameAtlasAnim[anim][layer@base] and '
    'frameAtlasPose[headPose][layer]; atlas of a body frame = frameAtlasAnim[anim]?.[layer@base] ?? '
    'frameAtlas[layer@base], of a head frame = frameAtlasPose[pose]?.[layer] ?? frameAtlas[layer].',
    'anims, timeline, headPoses: add the new keys (sad, clap, sit, push; head pose down).',
    'bases[b]: headOffset gets the new anim keys; parts = union; pushPoint, pushGrip and seat are new keys.',
    'parts, z: add the new keys (the fragment never redefines an existing part / z key).',
    'tintRef, palettes: add new keys; tintModel.slotS: add new slots; tintTable[slot]: union of colours.',
    'generator.presets / slotPalette: add new keys; generator.exclude: concatenate; generator.extraSlots: '
    'colour slots the v4 generator does not fill (filled from the preset colours, see townfolk2_compose).',
    'faceExprs (new): {headPose: [expr...]} every face expression that exists for that pose - a sprite may '
    'override the timeline face with any of them (e.g. "sad" while walking to the memorial garden).',
    'Everything else (frame size, anchors, limbs, faces, noses, frameNames, layerNames) is the v4 block unchanged.',
]


def load(p):
    return tpk.load(p)


def to_u8(img):
    return tpk.to_u8(img)


def process(img, kind, mask):
    return tpk.process(img, kind, mask)


# --------------------------------------------------------------------------- collect

def collect_head2(cache, log):
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
        d = name.split('_', 1)[1]
        for f in sorted(os.listdir(fd)):
            if not f.endswith('.png') or f == 'head.none.png':
                continue
            layer = f[:-4]
            kind = fx.layer_kind(layer)
            if kind == 'face' and d not in ta.FACE_DIRS:
                continue
            img = load(os.path.join(fd, f))
            if img[..., 3].max() <= 2 / 255:
                continue
            res = process(img, kind, mask)
            if res[..., 3].max() <= 2 / 255:
                continue
            out.setdefault(layer, {})[name] = to_u8(res)
    return out, meta


def body_tile(sh, i, tl):
    return tpk.body_tile(sh, i, tl)


def collect_body2(cache, base, log):
    bd = os.path.join(cache, 'body', base)
    meta = json.load(open(os.path.join(bd, 'meta2.json')))
    old_meta = json.load(open(os.path.join(OLD_CACHE, 'body', base, 'meta.json')))
    out = {}
    groups = [(a, d, ta2.ANIMS2[a]['frames'], True) for a in ta2.ORDER2 for d in ta2.ANIMS2[a]['dirs']]
    groups += [(a, d, ta.ANIMS[a]['frames'], False) for a in ta.ORDER for d in ta.ANIMS[a]['dirs']]
    for anim, d, n, new in groups:
        gd = os.path.join(bd, f'{anim}_{d}')
        tl = meta['tiles'].get(anim, meta['tile'])
        if new:
            mpath = os.path.join(gd, 'mask.png')
            mtl = tl
        else:
            mpath = os.path.join(OLD_CACHE, 'body', base, f'{anim}_{d}', 'mask.png')
            mtl = old_meta.get('tile', tl)
        if not os.path.exists(mpath):
            log.append(f'missing mask {base}/{anim}_{d}')
            continue
        if not os.path.isdir(gd):
            log.append(f'missing body group {base}/{anim}_{d}')
            continue
        mask = load(mpath)
        for f in sorted(os.listdir(gd)):
            if not f.endswith('.png') or f == 'mask.png':
                continue
            layer = f[:-4]
            pn = layer.split('.')[0]
            if not new and pn not in NEW_BODY:
                continue                       # v4 anims: only the new parts belong to this fragment
            if layer not in LIMB_LAYERS and pn not in tp.PARTS:
                continue
            sh = load(os.path.join(gd, f))
            kind = fx.layer_kind(layer)
            fr = out.setdefault(layer, {})
            for i in range(n):
                img = body_tile(sh, i, tl)
                if img[..., 3].max() <= 2 / 255:
                    continue
                res = process(img, kind, body_tile(mask, i, mtl)[..., 3])
                if res[..., 3].max() <= 2 / 255:
                    continue
                fr[f'{anim}_{d}_{i}'] = to_u8(res)
    out = {k: v for k, v in out.items() if v}
    return out, meta


# --------------------------------------------------------------------------- manifest

def part_entry2(P):
    e = tpk.part_entry(P)
    for s, sd in P.subs.items():
        if sd.get('zfrontFollow'):
            e['subs'][s]['zfrontFollow'] = sd['zfrontFollow']
    if P.name in tp2.ITEM_NO_ANIMS:
        e['noAnims'] = list(tp2.ITEM_NO_ANIMS[P.name])
    return e


def nested2(flat):
    return {a: {d: [flat[f'{a}_{d}_{i}'] for i in range(ta2.ANIMS2[a]['frames'])] for d in ta2.ANIMS2[a]['dirs']}
            for a in ta2.ORDER2}


def build_manifest2(body_metas, where_head, where_body, body_layers, atlases):
    tl = ta2.timeline2()
    timeline = {a: {d: [tl[(a, d, i)] for i in range(ta2.ANIMS2[a]['frames'])] for d in ta2.ANIMS2[a]['dirs']}
                for a in ta2.ORDER2}
    bases = {}
    for base in tpr.BASE_ORDER:
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in body_metas:
            continue
        m = body_metas[src]
        parts = sorted({l.split('.')[0] for l in body_layers[src] if l.split('.')[0] in NEW_BODY})
        ho = {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}
        pp = {d: [int(round(v[0] * sx)), int(round(v[1])), v[2]] for d, v in m['pushPointF'].items()}
        e = {'headOffset': nested2(ho), 'parts': parts, 'pushPoint': pp, 'pushGrip': dict(m['pushGrip']),
             'seat': {'heightM': m['seat']['heightM'], 'groundOffsetPx': int(round(m['seat']['groundOffsetPx']))}}
        bases[base] = e
    # a layer whose name already exists in assets/townfolk (v4 part / limb / face / head) keeps its v4 frameAtlas
    # entry for the v4 frames; its NEW frames (new anims / new head pose) are found through frameAtlasExt
    with open(os.path.join(GAME, 'assets', 'townfolk', 'manifest.json'), encoding='utf-8') as f:
        fa1 = json.load(f)['townfolk']['frameAtlas']
    frame_atlas, ext_anim, ext_pose = {}, {}, {}
    for layer, key in where_head.items():
        (ext_pose if layer in fa1 else frame_atlas)[layer] = key
    for base, w in where_body.items():
        for layer, key in w.items():
            L = f'{layer}@{base}'
            (ext_anim if L in fa1 else frame_atlas)[L] = key
    frame_atlas_ext = [{'anims': list(ta2.ORDER2), 'map': ext_anim}, {'poses': list(ta2.HEAD_POSES2), 'map': ext_pose}]
    parts = {pn: part_entry2(tp.PARTS[pn]) for pn in tp2.NEW_PARTS}
    tint_ref = dict(tp2.TINT_REF2)
    tint_table = {}
    model = dict(tpr.TINT_MODEL)
    model['slotS'] = dict(model['slotS'], **tp2.TINT_MODEL_SLOTS2)
    for slot, pal in tpr2.SLOT_PALETTE2.items():
        ref = tint_ref.get(slot) or tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
        tint_table[slot] = {c: tc.tint_hex(c, ref, model, slot) for c in sorted(set(tpr2.PALETTES2[pal]))}
    for slot, cols in tpr2.EXTRA_TINTS.items():           # new colours for v4 slots (formal / mourning wear)
        ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
        tint_table.setdefault(slot, {}).update({c: tc.tint_hex(c, ref, tpr.TINT_MODEL, slot) for c in sorted(cols)})
    seat_px = round(ta2.SEAT_H * 64 * 0.8660254, 2)
    T2 = {
        'version': 1, 'fragment': 'townfolk2', 'extends': 'townfolk',
        'anims': {a: dict(ta2.ANIMS2[a]) for a in ta2.ORDER2},
        'timeline': timeline,
        'headPoses': {hp: {'lookDown': v[0], 'tilt': v[1], 'turn': v[2], 'dirs': ta2.HEAD_POSE_DIRS2[hp]}
                      for hp, v in ta2.HEAD_POSES2.items()},
        'faceExprs': ta2.face_exprs_by_pose(),
        'exprBrow': dict(ta.EXPR_BROW, **ta2.EXPR_BROW2),
        'bases': bases,
        'parts': parts,
        'z': {k: v for k, v in tp2.Z2.items()},
        'tintRef': tint_ref,
        'tintModel': {'slotS': dict(tp2.TINT_MODEL_SLOTS2)},
        'tintTable': tint_table,
        'palettes': dict(tpr2.PALETTES2),
        'generator': {'presets': tpr2.PRESETS2, 'slotPalette': dict(tpr2.SLOT_PALETTE2),
                      'exclude': tpr2.EXCLUDE2, 'extraSlots': list(tpr2.EXTRA_SLOTS)},
        'frameAtlas': frame_atlas,
        'frameAtlasExt': frame_atlas_ext,
        'sit': {'anim': 'sit', 'seatHeightM': ta2.SEAT_H, 'anchor': 'seat front-centre (like villagers / life_props '
                'seatPoints)', 'hipBackM': ta2.SEAT_BACK, 'groundOffsetPx': seat_px,
                'notes': 'Put the sprite anchor ON the seat point (seat front-centre at seat height). The ground '
                         'under the sitter is anchor + (0, groundOffsetPx): draw the soft shadow there. Depth: '
                         'follow the seat prop\'s seatDepth rule (front = just above the seat, behind = y-sort).'},
        'push': {'anim': 'push', 'handleHeightM': ta2.HANDLE_H, 'handleWidthM': ta2.HANDLE_W,
                 'stroller': 'life2 baby_stroller / baby_stroller_pink (characters-style atlas, anims idle / move)',
                 'notes': 'bases[b].pushPoint[dir] = [dx, dy, strollerBehind]: pixel offset from the pusher anchor '
                          'to the middle of the handle bar the hands hold (constant over the 8 frames; mirrored '
                          'dirs negate dx).  Place the stroller so its handlePoint lands there and move both at '
                          'the walk speed.  strollerBehind (NE/N): the stroller is farther from the camera - '
                          'draw it under the pusher; S/SE/E: draw it over the pusher.  The grip height is the '
                          'life2 baby_stroller handleHeightM (0.64 m) for every age, so stroller anchor = pusher '
                          'anchor + pushPoint - stroller.handlePoint[dir] puts the bar exactly in the hands.'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_V5 Q). Merge into the v4 "townfolk" block (rules in "merge"), '
                  'then compose exactly like tools/townfolk2_compose.py: the v4 rules plus (1) subs with '
                  'zfrontFollow (held_bouquet) use z = limb zFront + 0.5 when that limb is in the frame\'s zfront, '
                  'else their own z; (2) optional face override: any expr in faceExprs[headPose]; brow = '
                  'exprBrow[expr]; (3) parts with noAnims have no frames in those anims (hide or pick another '
                  'anim); (4) sit frames are anchored on the seat front-centre; (5) push: see "push".'),
    }
    return {'version': 1, 'notes': ('Townfolk v5 fragment (CONTRACT_V5 Q): new anims sad / clap / sit / push for every '
                                    'townsperson, wedding & farewell wardrobe. Atlas JSONs are tfatlas v1 like '
                                    'assets/townfolk (NOT Phaser JSON hash). Block "townfolk2" merges into '
                                    'assets/townfolk "townfolk" - see townfolk2.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'townfolk2': T2}


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
    tpk.OUT = out                                      # tf_pack.build_sheets writes into this folder
    t0 = time.time()
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('tf2_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(out, f))
    log, report = [], []
    print('[head2] collecting', flush=True)
    head_layers, head_meta = collect_head2(cache, log)
    atlases, where_head = tpk.build_sheets('tf2_head', head_layers, lambda l, f: f'{l}/{f}', colors, dither, report)
    body_metas, where_body, body_layer_names = {}, {}, {}
    for base in tpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'meta2.json')):
            log.append(f'no body renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        layers, meta = collect_body2(cache, base, log)
        body_metas[base] = meta
        body_layer_names[base] = sorted(layers)
        at, w = tpk.build_sheets(f'tf2_{base}', layers, lambda l, f, b=base: f'{l}@{b}/{f}', colors, dither, report)
        atlases += at
        where_body[base] = w
    for at in atlases:                                  # tf_pack writes 'townfolk/<key>' paths
        at['png'] = 'townfolk2/' + at['png'].split('/', 1)[1]
        at['json'] = 'townfolk2/' + at['json'].split('/', 1)[1]
    man = build_manifest2(body_metas, where_head, where_body, body_layer_names, atlases)
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    area = sum(w * h for _, (w, h), *_ in report)
    print(f'atlases {len(atlases)}, frames {sum(r[2] for r in report)} (+{sum(r[3] for r in report)} aliases), '
          f'sheet area {area / 1e6:.2f} Mpx, payload {total / 1e6:.2f} MB, {time.time() - t0:.0f}s')
    for l in log:
        print('WARN', l)


if __name__ == '__main__':
    main()
