"""
tf_pack.py - townfolk paper-doll layers -> game atlases + manifest (CONTRACT_V4 J).

Run AFTER tf_render.py (plain python3 with numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/tf_pack.py                         # everything in the cache
    python3 tools/blender/tf_pack.py --colors 96 --cache /tmp/fv_cache/townfolk --out assets/townfolk

What it does
  1. reads the tiled renders (<cache>/head/<layer>.png, <cache>/body/<base>/<anim>_<dir>/<layer>.png)
  2. per layer frame: hair '.sheen' -> white+alpha highlight, every other non-face layer gets its
     ink ring with the mannequin silhouette erased (tf_layerfx.ring_layer); empty frames are dropped
  3. identical frames are stored once (several JSON frame names point at the same rect)
  4. packs into <=2048x2048 sheets: tf_head_<k> (all head-space layers) and tf_<base>_<k>
     (body layers of that base; every layer stays whole inside one sheet), palettised with
     libimagequant
  5. writes assets/townfolk/manifest.json: atlases + the 'townfolk' block the game composes from
     (parts, subs, tints, z per dir, timeline, head offsets, palettes, rules, presets, ...)
Frame names
  body  <layer>@<base>/<anim>_<dir>_<i>    e.g.  top_parka.fur@adult_slim/walk_SE_3, arm_R@child_round/idle_S_0
  head  <layer>/<headpose>_<dir>           e.g.  hair_bob.main~hat/soc_E, face.kid.talk_open/nod_S, head.dot/loco_N
"""
import hashlib
import json
import os
import sys
import time

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, HERE)
sys.path.insert(0, TOOLS)

import pack_utils                          # noqa: E402
import tf_anim as ta                       # noqa: E402
import tf_parts as tp                      # noqa: E402
import tf_presets as tpr                   # noqa: E402
import tf_layerfx as fx                    # noqa: E402
import townfolk_compose as tc              # noqa: E402

try:
    import imagequant
except ImportError:                        # pragma: no cover
    imagequant = None

FRAME = 128
DEFAULT_CACHE = '/tmp/fv_cache/townfolk'
OUT = os.path.join(GAME, 'assets', 'townfolk')
SHEET = 2048
SHEET_FILL = 0.62           # usable fraction of a sheet for the greedy layer->sheet split (shelf packing)
LIMB_LAYERS = ['arm_R', 'arm_L', 'hand_R', 'hand_L']


def tile(sheet, k, cols):
    x, y = (k % cols) * FRAME, (k // cols) * FRAME
    return sheet[y:y + FRAME, x:x + FRAME]


def load(p):
    return np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def process(img, kind, mask):
    if kind == 'sheen':
        return tc.sheen_alpha(img)
    if kind == 'face':
        return img
    return fx.ring_layer(img, mask)


# --------------------------------------------------------------------------- collect

def collect_head(cache, log):
    hd = os.path.join(cache, 'head')
    meta = json.load(open(os.path.join(hd, 'meta.json')))
    frames = meta['frames']
    masks = {}
    for name in frames:
        mp = os.path.join(hd, name, 'head.none.png')
        if os.path.exists(mp):
            masks[name] = load(mp)[..., 3]
        else:
            log.append(f'missing head frame {name}')
    frames = [f for f in frames if f in masks]
    out = {}                                          # layer -> {frame: uint8}
    for layer in meta['layers']:
        if layer == 'head.none':
            continue
        kind = fx.layer_kind(layer)
        fr = {}
        for k, name in enumerate(frames):
            d = name.split('_', 1)[1]
            if kind == 'face' and d not in ta.FACE_DIRS:
                continue
            p = os.path.join(hd, name, layer + '.png')
            if not os.path.exists(p):
                log.append(f'missing head layer {name}/{layer}')
                continue
            img = load(p)
            if img[..., 3].max() <= 2 / 255:
                continue
            res = process(img, kind, masks[name])
            if res[..., 3].max() <= 2 / 255:
                continue
            fr[name] = to_u8(res)
        if fr:
            out[layer] = fr
    return out, meta


def body_tile(sh, i, tl):
    """128x128 frame i from a tiled group sheet (tile box w x h at offset ox, oy in the frame)."""
    x, y = (i % tl['cols']) * tl['w'], (i // tl['cols']) * tl['h']
    out = np.zeros((FRAME, FRAME, 4), np.float32)
    out[tl['oy']:tl['oy'] + tl['h'], tl['ox']:tl['ox'] + tl['w']] = sh[y:y + tl['h'], x:x + tl['w']]
    return out


def collect_body(cache, base, log):
    bd = os.path.join(cache, 'body', base)
    meta = json.load(open(os.path.join(bd, 'meta.json')))
    tl = meta.get('tile', {'w': FRAME, 'h': FRAME, 'cols': 4, 'ox': 0, 'oy': 0})
    out = {}
    reach = tpr.reachable_parts(tpr.BASES[base]['age'])
    for anim in ta.ORDER:
        info = ta.ANIMS[anim]
        for d in info['dirs']:
            gd = os.path.join(bd, f'{anim}_{d}')
            if not os.path.exists(os.path.join(gd, 'mask.png')):
                log.append(f'missing body group {base}/{anim}_{d}')
                continue
            mask = load(os.path.join(gd, 'mask.png'))
            for f in sorted(os.listdir(gd)):
                if not f.endswith('.png') or f == 'mask.png':
                    continue
                layer = f[:-4]
                pn = layer.split('.')[0]
                if layer not in LIMB_LAYERS and (pn not in tp.PARTS or (tp.PARTS[pn].ages and
                                                                        tpr.BASES[base]['age'] not in tp.PARTS[pn].ages)):
                    continue                     # stale render of a part this base no longer wears
                if layer not in LIMB_LAYERS and pn not in reach:
                    continue                     # rendered, but no generator path / preset gives it to this age
                sh = load(os.path.join(gd, f))
                kind = fx.layer_kind(layer)
                fr = out.setdefault(layer, {})
                for i in range(info['frames']):
                    img = body_tile(sh, i, tl)
                    if img[..., 3].max() <= 2 / 255:
                        continue
                    res = process(img, kind, body_tile(mask, i, tl)[..., 3])
                    if res[..., 3].max() <= 2 / 255:
                        continue
                    fr[f'{anim}_{d}_{i}'] = to_u8(res)
    out = {k: v for k, v in out.items() if v}
    return out, meta


# --------------------------------------------------------------------------- atlases

def trimmed_area(img):
    a = img[..., 3]
    ys, xs = np.nonzero(a)
    if len(xs) == 0:
        return 0
    return (xs.max() - xs.min() + 3) * (ys.max() - ys.min() + 3)


def compact_atlas(atlas, image, size):
    """Phaser JSON-hash -> 'tfatlas' v1 (~8x smaller; townfolk_compose.js townfolkInstall() adds the
    frames to the Phaser texture, townfolk_compose.iter_tf_frames() reads it in python):
    frames[prefix][group] = rect (head frames '<layer>/<pose>_<dir>') or [rect | 0, ...] indexed by the
    frame number (body frames '<layer>@<base>/<anim>_<dir>_<i>'); rect = [x, y, w, h, dx, dy]."""
    out = {}
    for name, fr in atlas['frames'].items():
        assert not fr.get('rotated'), name
        prefix, suffix = name.rsplit('/', 1)
        r, s = fr['frame'], fr['spriteSourceSize']
        rect = [r['x'], r['y'], r['w'], r['h'], s['x'], s['y']]
        group, _, idx = suffix.rpartition('_')
        if group and idx.isdigit():
            lst = out.setdefault(prefix, {}).setdefault(group, [])
            lst.extend([0] * (int(idx) + 1 - len(lst)))
            lst[int(idx)] = rect
        else:
            out.setdefault(prefix, {})[suffix] = rect
    return {'tfatlas': 1, 'image': image, 'size': [size[0], size[1]], 'frameSize': [FRAME, FRAME], 'frames': out}


def build_sheets(prefix, layers, frame_name, colors, dither, report):
    """layers: {layer: {frame: uint8}} -> list of (atlas key, png path, json path); returns
    (atlases, layer->atlas key map)."""
    # unique images first (dedupe identical frames inside this group)
    items = []                   # (layer, [names], img)
    sizes = {}
    for layer in sorted(layers):
        seen = {}
        lst = []
        for fr, img in layers[layer].items():
            h = hashlib.md5(img.tobytes()).hexdigest()
            name = frame_name(layer, fr)
            if h in seen:
                seen[h][1].append(name)
                continue
            ent = [layer, [name], img]
            seen[h] = ent
            lst.append(ent)
        items.extend(lst)
        sizes[layer] = sum(trimmed_area(e[2]) for e in lst)
    # greedy layer -> sheet assignment by area
    budget = SHEET * SHEET * SHEET_FILL
    groups, cur, acc = [], [], 0
    for layer in sorted(layers, key=lambda l: (l.split('.')[0], l)):
        if cur and acc + sizes[layer] > budget:
            groups.append(cur)
            cur, acc = [], 0
        cur.append(layer)
        acc += sizes[layer]
    if cur:
        groups.append(cur)
    atlases, where = [], {}
    k = 0
    pending = list(groups)
    while pending:
        grp = pending.pop(0)
        frames, alias = [], {}
        for layer, names, img in items:
            if layer not in grp:
                continue
            frames.append((names[0], Image.fromarray(img, 'RGBA')))
            for n in names[1:]:
                alias[n] = names[0]
        sheet, atlas = pack_utils.pack_atlas(frames, max_width=SHEET, trim=True, padding=2)
        if sheet.size[1] > SHEET and len(grp) > 1:          # too tall: split the group and retry
            h = len(grp) // 2
            pending[:0] = [grp[:h], grp[h:]]
            continue
        key = f'{prefix}_{k}'
        k += 1
        for n, src in alias.items():
            atlas['frames'][n] = dict(atlas['frames'][src])
        png = os.path.join(OUT, key + '.png')
        js = os.path.join(OUT, key + '.json')
        if imagequant is not None:
            q = imagequant.quantize_pil_image(sheet, dithering_level=dither, max_quality=100, min_quality=0,
                                              max_colors=colors)
            q.save(png, optimize=True)
        else:
            sheet.save(png, optimize=True)
        with open(js, 'w', encoding='utf-8') as f:
            json.dump(compact_atlas(atlas, key + '.png', sheet.size), f, separators=(',', ':'))
        for layer in grp:
            where[layer] = key
        atlases.append({'key': key, 'png': f'townfolk/{key}.png', 'json': f'townfolk/{key}.json', 'format': 'tfatlas'})
        report.append((key, sheet.size, len(frames), len(alias), os.path.getsize(png)))
        print(f'  {key}: {sheet.size[0]}x{sheet.size[1]}  {len(frames)} frames (+{len(alias)} dup)  '
              f'{os.path.getsize(png) / 1024:.0f} KB', flush=True)
    return atlases, where


# --------------------------------------------------------------------------- manifest

def part_entry(P):
    e = {'family': P.family, 'space': P.space, 'label': P.label, 'tags': sorted(P.tags), 'subs': {}}
    for s, sd in P.subs.items():
        se = {'tint': sd['tint'], 'z': sd['z']}
        for k in ('sheen', 'follow', 'noclip'):
            if sd.get(k):
                se[k] = sd[k]
        e['subs'][s] = se
    if P.hatfit:
        e['hatfit'] = True
    if P.cls:
        e['cls'] = P.cls
    if P.ages:
        e['ages'] = list(P.ages)
    if getattr(P, 'dress', False):
        e['dress'] = True
    if getattr(P, 'sleeves', None):
        e['sleeves'] = P.sleeves
    return e


def nested(flat, frames_of):
    """{'anim_dir_i': v} -> {anim: {dir: [v...]}}"""
    out = {}
    for anim in ta.ORDER:
        info = ta.ANIMS[anim]
        out[anim] = {d: [flat[f'{anim}_{d}_{i}'] for i in range(info['frames'])] for d in info['dirs']}
    return out


def build_manifest(head_meta, body_metas, where_head, where_body, body_layers, head_layers, atlases):
    tl = ta.timeline()
    timeline = {a: {d: [tl[(a, d, i)] for i in range(ta.ANIMS[a]['frames'])] for d in ta.ANIMS[a]['dirs']}
                for a in ta.ORDER}
    bases = {}
    for base in tpr.BASE_ORDER:
        B = tpr.BASES[base]
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in body_metas:
            continue
        m = body_metas[src]
        parts = sorted({l.split('.')[0] for l in body_layers[src] if l not in LIMB_LAYERS})
        if sx == 1.0:
            ho = m['headOffset']
            cp = m['carryPoint']
        else:
            ho = {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}
            cp = {d: [int(round(v[0] * sx)), v[1], v[2]] for d, v in m['carryPoint'].items()}
        e = {'age': B['age'], 'build': B['build'], 'shadow': B['shadow'], 'carryPoint': cp,
             'headOffset': nested(ho, None), 'parts': parts,
             'label': {'ko': {'child': '어린이', 'adult': '어른', 'elder': '노인'}[B['age']] + ' ' +
                       {'slim': '날씬', 'round': '통통'}[B['build']], 'en': base.replace('_', ' ')}}
        if src != base:
            e['render'] = src
            e['scaleX'] = sx
        bases[base] = e
    frame_atlas = {}
    for layer, key in where_head.items():
        frame_atlas[layer] = key
    for base, w in where_body.items():
        for layer, key in w.items():
            frame_atlas[f'{layer}@{base}'] = key
    parts = {pn: part_entry(P) for pn, P in tp.PARTS.items()}
    tint_table = {}
    for slot, pal in tpr.SLOT_PALETTE.items():
        ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
        cols = set(tpr.PALETTES[pal])
        if slot == 'hair':
            cols |= set(tpr.PALETTES['hair_elder']) | set(tpr.PALETTES['hair_fun'])
        tint_table[slot] = {c: tc.tint_hex(c, ref, tpr.TINT_MODEL, slot) for c in sorted(cols)}
    tint_table['hands'] = {c: tc.tint_hex(c, tpr.TINT_REF['hands'], tpr.TINT_MODEL, 'hands')
                           for c in sorted(set(tpr.PALETTES['gloves']) | set(tpr.PALETTES['skin']))}
    T = {
        'version': 1,
        'frameSize': [FRAME, FRAME], 'anchor': [0.5, 104 / FRAME],
        'headFrameSize': [FRAME, FRAME], 'headAnchor': [head_meta['anchor'][0] / FRAME, head_meta['anchor'][1] / FRAME],
        'dirs': ta.LOCO_DIRS, 'mirror': {'SW': 'SE', 'W': 'E', 'NW': 'NE'}, 'faceDirs': ta.FACE_DIRS,
        'anims': {a: dict(ta.ANIMS[a]) for a in ta.ORDER},
        'timeline': timeline,
        'headPoses': {hp: {'lookDown': v[0], 'tilt': v[1], 'turn': v[2], 'dirs': ta.HEAD_POSE_DIRS[hp]}
                      for hp, v in ta.HEAD_POSES.items()},
        'z': dict(tp.Z),
        'limbs': {'arm_R': {'tint': 'sleeve', 'z': tp.Z['arm'], 'zFront': tp.Z['arm_front']},
                  'arm_L': {'tint': 'sleeve', 'z': tp.Z['arm'], 'zFront': tp.Z['arm_front']},
                  'hand_R': {'tint': 'hands', 'z': tp.Z['hand'], 'zFront': tp.Z['hand_front']},
                  'hand_L': {'tint': 'hands', 'z': tp.Z['hand'], 'zFront': tp.Z['hand_front']}},
        'bases': bases,
        'faces': {fs: {} for fs in tpr.FACE_SETS},
        'noses': ['dot', 'big', 'button'],
        'parts': parts,
        'tintRef': dict(tpr.TINT_REF), 'tintModel': dict(tpr.TINT_MODEL), 'sheen': dict(tpr.SHEEN),
        'tintTable': tint_table,
        'palettes': tpr.PALETTES,
        'generator': {'baseWeights': tpr.BASE_WEIGHTS, 'byAge': tpr.GEN, 'presets': tpr.PRESETS,
                      'exclude': tpr.EXCLUDE, 'underDress': tpr.UNDER_DRESS, 'slotPalette': tpr.SLOT_PALETTE},
        'frameNames': {'body': '{layer}@{base}/{anim}_{dir}_{i}', 'head': '{layer}/{headPose}_{dir}'},
        'layerNames': {'head': 'head.{nose}', 'face': 'face.{faceSet}.{expr}', 'brow': 'brow.{faceSet}.{brow}',
                       'part': '{part}.{sub}', 'hairUnderFullHat': '{part}.{sub}~hat', 'sheen': '{partLayer}.sheen',
                       'limb': '{arm_R|arm_L|hand_R|hand_L}'},
        'frameAtlas': frame_atlas,
        'notes': ('Paper-doll townsfolk. Compose per frame exactly like tools/townfolk_compose.py: body layers at the '
                  'character anchor, head-space layers at anchor + bases[base].headOffset[anim][dir][i] (head frame '
                  'anchor headAnchor), draw by z (sub z may be a per-dir dict; limbs listed in timeline zfront use '
                  'zFront; subs with follow use that limb z + 0.5), tint = tintTable[slot][colour] (or tintModel '
                  'formula), mirrored dirs flip every sprite and negate headOffset x. A frame missing from its '
                  'atlas is empty: hide that sprite.'),
    }
    return {'version': 1, 'notes': ('Townfolk paper-doll layers (CONTRACT_V4 J); see the townfolk block. atlases[*].json '
                                    'are tfatlas v1 (compact, NOT Phaser JSON hash): load the png with load.image and add '
                                    'the frames with townfolkPreload / townfolkInstall from tools/townfolk_compose.js.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'townfolk': T}


def main():
    args = sys.argv[1:]
    cache, colors, dither = DEFAULT_CACHE, 96, 0.5
    global OUT
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
            OUT = os.path.abspath(args[i + 1]); i += 2; continue
        i += 1
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith('tf_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(OUT, f))
    log, report = [], []
    print('[head] collecting', flush=True)
    head_layers, head_meta = collect_head(cache, log)
    atlases, where_head = build_sheets('tf_head', head_layers, lambda l, f: f'{l}/{f}', colors, dither, report)
    body_metas, where_body, body_layer_names = {}, {}, {}
    for base in tpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'meta.json')):
            log.append(f'no body renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        layers, meta = collect_body(cache, base, log)
        body_metas[base] = meta
        body_layer_names[base] = sorted(layers)
        at, w = build_sheets(f'tf_{base}', layers, lambda l, f, b=base: f'{l}@{b}/{f}', colors, dither, report)
        atlases += at
        where_body[base] = w
    man = build_manifest(head_meta, body_metas, where_head, where_body, body_layer_names, sorted(head_layers),
                         atlases)
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    area = sum(w * h for _, (w, h), *_ in report)
    print(f'atlases {len(atlases)}, frames {sum(r[2] for r in report)} (+{sum(r[3] for r in report)} aliases), '
          f'sheet area {area / 1e6:.2f} Mpx, payload {total / 1e6:.2f} MB, {time.time() - t0:.0f}s')
    for l in log:
        print('WARN', l)


if __name__ == '__main__':
    main()
