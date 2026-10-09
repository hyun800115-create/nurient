"""
cf_pack.py - cityfolk layers -> assets/cityfolk atlases + manifest fragment (CONTRACT_V8 AD).

Run AFTER cf_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/cf_pack.py [--colors 56] [--cache /tmp/fv_cache/cityfolk] [--out assets/cityfolk]

Same layer processing (ink ring minus the mannequin silhouette, sheen, face), frame naming and compact
'tfatlas' JSON as tools/blender/tf_pack.py (imported, not edited).  Atlas keys cf_head_<k> and cf_<base>_<k>.

Frames
  body  <layer>@<base>/<anim>_<dir>_<i>   the 12 cityfolk anims for every layer cast in them (cf_presets.CAST3)
                                          + the cityfolk wearables in the v4 / v5 anims (cf_presets.OLD_CAST3)
  head  <layer>/<pose>_<dir>              new head parts on every head frame, new face expressions + brow
                                          'angry' on every face frame
SHARED images: frames that repeat a body key and lower-body layers shared by anims of one lower group are the
same image -> stored once (several frame names, one rect).
The manifest's 'cityfolk' block is a PARTIAL townfolk block; merge it after assets/townfolk2 with
tools/cityfolk_compose.js mergeTownfolkFragments() (rules in cityfolk.merge).
"""
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

import tf_pack as tpk                      # noqa: E402
import tf_anim as ta                       # noqa: E402
import tf_parts as tp                      # noqa: E402
import tf_presets as tpr                   # noqa: E402
import tf_layerfx as fx                    # noqa: E402
import tf2_anim as ta2                     # noqa: E402
import cf_anim as ca                       # noqa: E402
import cf_parts as cp                      # noqa: E402
import cf_presets as cpr                   # noqa: E402
import townfolk_compose as tc              # noqa: E402

FRAME = 128
DEFAULT_CACHE = '/tmp/fv_cache/cityfolk'
OUT = os.path.join(GAME, 'assets', 'cityfolk')
LIMB_LAYERS = tpk.LIMB_LAYERS
NEW_HEAD = [p for p in cp.NEW_PARTS3 if tp.PARTS[p].space == 'head']
NEW_BODY = [p for p in cp.ALL_NEW if tp.PARTS[p].space == 'body']

MERGE_RULES = [
    'Merge order: assets/townfolk "townfolk" <- assets/townfolk2 "townfolk2" <- (assets/beachfolk) <- assets/cityfolk '
    '"cityfolk".  tools/cityfolk_compose.js mergeTownfolkFragments(man, man2, ..., manCity) applies these rules to any '
    'fragment in the townfolk2 format (and gives exactly townfolk2_compose.mergeTownfolk for v4 + v5).',
    'atlases: concatenate.  frameAtlas: union (never shared keys) - layers new in this fragment.  frameAtlasExt: '
    'layers of an earlier fragment whose NEW frames live here: [{anims:[...], map:{layer@base: atlas}}] -> '
    'frameAtlasAnim[anim][layer@base]; the atlas of a body frame = frameAtlasAnim[anim]?.[layer@base] ?? '
    'frameAtlas[layer@base], of a head frame = frameAtlasPose[pose]?.[layer] ?? frameAtlas[layer].',
    'anims, timeline, headPoses, parts, z, tintRef, palettes: add the new keys; redefining a key is an error.',
    'bases[b]: headOffset gets the new anim keys; parts = union; other keys (cfCover, nozzlePoint, boxPoint, '
    'sweepPoint) are added.',
    'faceExprs: per head pose UNION of the expression lists; exprBrow: add.  tintModel.slotS: add; tintTable[slot]: '
    'union of colours.  generator.presets / slotPalette: add; exclude: concatenate; extraSlots: union.',
    'Other top-level keys of the fragment (animItems, animFallback, fallbackFace, cfParts, lowerShare, overrides...): '
    'copied; objects are shallow-merged, arrays concatenated.',
    'Everything else (frame size, anchors, limbs, faces, noses, frameNames, layerNames) is the v4 block unchanged.',
]


ANCHOR_ERR = 9.0          # mean RGB error (0..255) of a layer after quantizing that earns it palette anchors
ANCHOR_ROWS = 24          # height of the temporary anchor strip appended below a sheet while quantizing


def _untinted(layer):
    """True for layers drawn with their rendered colours (no tint): items, badges, reflective trims, faces."""
    pn, _, s = layer.partition('.')
    if pn in ('face', 'head') or layer.startswith('face.'):
        return True
    P = tp.PARTS.get(pn)
    if P is None or s not in P.subs:
        return False
    return P.subs[s].get('tint') is None


def _quantize(sheet, colors, dither):
    if tpk.imagequant is None:
        return sheet
    return tpk.imagequant.quantize_pil_image(sheet, dithering_level=dither, max_quality=100, min_quality=0,
                                             max_colors=colors)


def _layer_errors(sheet, q, rects):
    """mean |RGB| error per layer over its opaque pixels: rects = {layer: [(x, y, w, h), ...]}."""
    a = np.asarray(sheet.convert('RGBA')).astype(np.int16)
    b = np.asarray(q.convert('RGBA')).astype(np.int16)
    out = {}
    for layer, rs in rects.items():
        tot = n = 0
        for x, y, w, h in rs:
            pa, pb = a[y:y + h, x:x + w], b[y:y + h, x:x + w]
            m = pa[..., 3] > 200
            if m.any():
                tot += np.abs(pa[..., :3][m] - pb[..., :3][m]).mean(axis=1).sum()
                n += int(m.sum())
        if n:
            out[layer] = tot / n
    return out


def _anchor_strip(sheet, rects, layers, width, rows, rng):
    """rows x width strip of opaque pixels sampled equally from `layers` (their colours gain weight in the palette
    imagequant picks; the strip is cut off again after quantizing)."""
    a = np.asarray(sheet.convert('RGBA'))
    pools = []
    for layer in layers:
        px = [a[y:y + h, x:x + w][a[y:y + h, x:x + w][..., 3] > 200] for x, y, w, h in rects[layer][:40]]
        px = np.concatenate([p for p in px if len(p)] or [np.zeros((0, 4), np.uint8)])
        if len(px):
            pools.append(px)
    if not pools:
        return None
    n = width * rows
    per = max(1, n // len(pools))
    pick = np.concatenate([p[rng.integers(0, len(p), per)] for p in pools])
    pick = pick[rng.permutation(len(pick))][:n]
    if len(pick) < n:
        pick = np.concatenate([pick, pick[rng.integers(0, len(pick), n - len(pick))]])
    pick[:, 3] = 255
    return Image.fromarray(pick.reshape(rows, width, 4).astype(np.uint8), 'RGBA')


def build_sheets3(prefix, layers, frame_name, colors, dither, report, tail=0.5, qlog=None):
    """tf_pack.build_sheets (same dedupe, greedy layer -> sheet split, packing, quantizing, compact 'tfatlas' JSON)
    plus
      * tail merge (as bf_pack): a last group smaller than `tail` x the sheet budget is packed with the group before
        it when the pair still fits one 2048 sheet (no 240-px stub atlas = one texture / batch less);
      * palette anchors: the sheet is quantized once, every UNTINTED layer (red fire hose, brass, chrome, hi-vis
        trims, cardboard box, faces ...) whose mean colour error exceeds ANCHOR_ERR gets pixels in a temporary strip
        below the sheet and the sheet is quantized again - small saturated items no longer collapse onto the
        dominant neutral palette (the red hose came out tan).  Tinted layers are rendered near-white, so the
        palette they need is cheap.  qlog collects (sheet, layer, error before, error after)."""
    import hashlib
    import pack_utils
    SHEET = tpk.SHEET
    items, sizes = [], {}
    for layer in sorted(layers):
        seen, lst = {}, []
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
        sizes[layer] = sum(tpk.trimmed_area(e[2]) for e in lst)
    budget = SHEET * SHEET * tpk.SHEET_FILL
    groups, cur, acc = [], [], 0
    for layer in sorted(layers, key=lambda l: (l.split('.')[0], l)):
        if cur and acc + sizes[layer] > budget:
            groups.append(cur)
            cur, acc = [], 0
        cur.append(layer)
        acc += sizes[layer]
    if cur:
        groups.append(cur)

    def pack(grp):
        gs = set(grp)
        frames, alias, owner = [], {}, {}
        for layer, names, img in items:
            if layer not in gs:
                continue
            frames.append((names[0], Image.fromarray(img, 'RGBA')))
            owner[names[0]] = layer
            for n in names[1:]:
                alias[n] = names[0]
        sheet, atlas = pack_utils.pack_atlas(frames, max_width=SHEET, trim=True, padding=2)
        return sheet, atlas, frames, alias, owner

    rng = np.random.default_rng(7)
    atlases, where = [], {}
    k = 0
    pending = list(groups)
    while pending:
        grp = pending.pop(0)
        res = None
        if len(pending) == 1 and sum(sizes[l] for l in pending[0]) < tail * budget:
            res = pack(grp + pending[0])
            if res[0].size[1] <= SHEET:
                grp = grp + pending.pop(0)
            else:
                res = None
        if res is None:
            res = pack(grp)
        sheet, atlas, frames, alias, owner = res
        if sheet.size[1] > SHEET and len(grp) > 1:          # too tall: split the group and retry
            h = len(grp) // 2
            pending[:0] = [grp[:h], grp[h:]]
            continue
        key = f'{prefix}_{k}'
        k += 1
        rects = {}
        for name, fr in atlas['frames'].items():
            r = fr['frame']
            rects.setdefault(owner[name], []).append((r['x'], r['y'], r['w'], r['h']))
        q = _quantize(sheet, colors, dither)
        err0 = _layer_errors(sheet, q, rects)
        bad = sorted([l for l, e in err0.items() if e > ANCHOR_ERR and _untinted(l)], key=lambda l: -err0[l])
        if bad and tpk.imagequant is not None:
            strip = _anchor_strip(sheet, rects, bad, sheet.size[0], ANCHOR_ROWS, rng)
            big = Image.new('RGBA', (sheet.size[0], sheet.size[1] + ANCHOR_ROWS), (0, 0, 0, 0))
            big.paste(sheet, (0, 0))
            big.paste(strip, (0, sheet.size[1]))
            q2 = _quantize(big, colors, dither).crop((0, 0, sheet.size[0], sheet.size[1]))
            err1 = _layer_errors(sheet, q2, rects)
            worse = sum(err1.get(l, 0) - err0.get(l, 0) for l in err0 if not _untinted(l)) / max(1, len(err0))
            if qlog is not None:
                for l in bad:
                    qlog.append((key, l, round(err0[l], 1), round(err1.get(l, 0), 1)))
                qlog.append((key, '(tinted layers, mean change)', 0.0, round(worse, 2)))
            q = q2
        png = os.path.join(tpk.OUT, key + '.png')
        js = os.path.join(tpk.OUT, key + '.json')
        q.save(png, optimize=True)
        for n, src in alias.items():
            atlas['frames'][n] = dict(atlas['frames'][src])
        with open(js, 'w', encoding='utf-8') as f:
            json.dump(tpk.compact_atlas(atlas, key + '.png', sheet.size), f, separators=(',', ':'))
        for layer in grp:
            where[layer] = key
        atlases.append({'key': key, 'png': f'townfolk/{key}.png', 'json': f'townfolk/{key}.json', 'format': 'tfatlas'})
        report.append((key, sheet.size, len(frames), len(alias), os.path.getsize(png)))
        print(f'  {key}: {sheet.size[0]}x{sheet.size[1]}  {len(frames)} frames (+{len(alias)} dup)  '
              f'{os.path.getsize(png) / 1024:.0f} KB  anchors {len(bad)}', flush=True)
    return atlases, where


def load(p):
    return tpk.load(p)


def to_u8(img):
    return tpk.to_u8(img)


def process(img, kind, mask):
    return tpk.process(img, kind, mask)


def tile_img(sh, k, job, cols):
    """128x128 frame of tile k of a job sheet (tile box w x h at (ox, oy) inside the frame)."""
    w, h, ox, oy = job['w'], job['h'], job['ox'], job['oy']
    x, y = (k % cols) * w, (k // cols) * h
    out = np.zeros((FRAME, FRAME, 4), np.float32)
    out[oy:oy + h, ox:ox + w] = sh[y:y + h, x:x + w]
    return out


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


def frames_for(job, tile, layer, cast, base):
    """[(anim, dir, i)] that tile `tile` of `job` supplies for `layer`."""
    a, d, key = tile
    pn = layer.split('.')[0]
    if job['pass'] == 'old':
        return [(a, d, key)]
    if job['pass'] == 'upper':
        return [(a, d, i) for i, k in enumerate(ca.KEYS3[a]) if k == key]
    g_, lk = ca.lower_key(a, key)
    out = []
    for an in ca.LOWER_GROUPS[g_]:
        if d not in ca.ANIMS3[an]['dirs'] or pn not in cast[an]:
            continue
        for i, k in enumerate(ca.KEYS3[an]):
            if ca.lower_key(an, k) == (g_, lk):
                out.append((an, d, i))
    return out


def collect_body3(cache, base, log, v4parts):
    bd = os.path.join(cache, 'body', base)
    idx = json.load(open(os.path.join(bd, 'index.json')))
    meta = json.load(open(os.path.join(bd, 'meta3.json')))
    cols = idx['cols']
    cast = {a: set(cpr.cast_parts(a, base, v4parts)) | set(ca.ANIM_ITEMS.get(a, [])) for a in ca.ORDER3}
    out = {}
    clipped = []
    for jid, job in idx['jobs'].items():
        jd = os.path.join(bd, jid)
        mpath = os.path.join(jd, 'mask.png')
        if not os.path.exists(mpath):
            log.append(f'missing job {base}/{jid}')
            continue
        mask = load(mpath)
        for layer in job['layers']:
            if layer == 'mask':
                continue
            p = os.path.join(jd, layer + '.png')
            if not os.path.exists(p):
                log.append(f'missing layer {base}/{jid}/{layer}')
                continue
            sh = load(p)
            kind = fx.layer_kind(layer)
            fr = out.setdefault(layer, {})
            for k, tile in enumerate(job['tiles']):
                img = tile_img(sh, k, job, cols)
                if img[..., 3].max() <= 2 / 255:
                    continue
                # clipping check: alpha on the tile border (the 96x112 tiles cut anything outside)
                w, h, ox, oy = job['w'], job['h'], job['ox'], job['oy']
                a_ = img[..., 3]
                if (w < FRAME and (a_[:, ox].max() > 0.2 or a_[:, ox + w - 1].max() > 0.2)) or \
                        (h < FRAME and a_[oy + h - 1, :].max() > 0.2) or a_[0, :].max() > 0.2:
                    clipped.append(f'{layer}@{base} {jid} tile {k}')
                res = process(img, kind, tile_img(mask, k, job, cols)[..., 3])
                if res[..., 3].max() <= 2 / 255:
                    continue
                u8 = to_u8(res)
                for an, d, i in frames_for(job, tile, layer, cast, base):
                    fr[f'{an}_{d}_{i}'] = u8
    for c in clipped[:20]:
        log.append('CLIPPED ' + c)
    if len(clipped) > 20:
        log.append(f'... {len(clipped)} clipped tiles')
    out = {k: v for k, v in out.items() if v}
    return out, meta


# --------------------------------------------------------------------------- manifest

def part_entry3(P):
    e = tpk.part_entry(P)
    for s, sd in P.subs.items():
        if sd.get('zfrontFollow'):
            e['subs'][s]['zfrontFollow'] = sd['zfrontFollow']
    if getattr(P, 'no_anims', None):
        e['noAnims'] = list(P.no_anims)
    if getattr(P, 'only_anims', None):
        e['onlyAnims'] = list(P.only_anims)
    return e


def nested3(flat, sx=1.0, pad=None):
    out = {}
    for a in ca.ORDER3:
        info = ca.ANIMS3[a]
        out[a] = {}
        for d in info['dirs']:
            row = []
            for i in range(info['frames']):
                v = flat.get(f'{a}_{d}_{i}', pad)
                row.append(v)
            out[a][d] = row
    return out


def scaled_head(m, sx):
    return {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}


def points(m, key, sx, anims, nd=1):
    """{dir: [[x, y, ...] per frame]} for an item point table of meta3 (x values scaled by sx)."""
    out = {}
    for a in anims:
        info = ca.ANIMS3[a]
        out[a] = {}
        for d in info['dirs']:
            row = []
            for i in range(info['frames']):
                v = m[key].get(f'{a}_{d}_{i}')
                if v is None:
                    row.append(None)
                    continue
                v = list(v)
                if key == 'nozzle':
                    v = [round(v[0] * sx, 1), v[1], round(v[2] * sx, 3), v[3]]
                    n = (v[2] ** 2 + v[3] ** 2) ** 0.5 or 1.0
                    v[2], v[3] = round(v[2] / n, 3), round(v[3] / n, 3)
                elif key == 'box':
                    v = [round(v[0] * sx, 1), v[1], round(v[2] * sx, 1), v[3]]
                else:
                    v = [round(v[0] * sx, 1), v[1]]
                row.append(v)
            out[a][d] = row
    return out


def build_manifest3(body_metas, where_head, where_body, body_layers, atlases, v4parts):
    tl = ca.timeline3()
    timeline = {a: {d: [tl[(a, d, i)] for i in range(ca.ANIMS3[a]['frames'])] for d in ca.ANIMS3[a]['dirs']}
                for a in ca.ORDER3}
    with open(os.path.join(GAME, 'assets', 'townfolk', 'manifest.json'), encoding='utf-8') as f:
        T1 = json.load(f)['townfolk']
    fa1 = T1['frameAtlas']
    bases = {}
    for base in tpr.BASE_ORDER:
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in body_metas:
            continue
        m = body_metas[src]
        packed = {l.split('.')[0] for l in body_layers[src]} - set(LIMB_LAYERS)
        parts = sorted(p for p in packed if p in NEW_BODY)
        cover = {}
        for a in list(ca.ORDER3) + list(ta.ORDER) + list(ta2.ORDER2):
            c = cpr.cast_parts(a, src, v4parts)
            if a in ca.ANIMS3 or c:
                cover[a] = c
        e = {'headOffset': nested3(scaled_head(m, sx)), 'parts': parts, 'cfCover': cover,
             'nozzlePoint': points(m, 'nozzle', sx, ['spray_hose']),
             'boxPoint': points(m, 'box', sx, ['carry_box']),
             'sweepPoint': points(m, 'sweep', sx, ['sweep'])}
        bases[base] = e
    # layers of cityfolk-owned parts (and the new face / brow layers) are new names -> frameAtlas; every other layer
    # (v4 / v5 parts, limbs) keeps its earlier fragment's entry and routes its cityfolk-anim frames through
    # frameAtlasExt (never touches another fragment's frameAtlas key, whichever fragment introduced it)
    owned = set(cp.ALL_NEW)
    frame_atlas, ext_anim = {}, {}
    for layer, key in where_head.items():
        if layer in fa1:
            raise ValueError(f'head layer {layer} already in assets/townfolk')
        frame_atlas[layer] = key
    for base, w in where_body.items():
        for layer, key in w.items():
            L = f'{layer}@{base}'
            (frame_atlas if layer.split('.')[0] in owned else ext_anim)[L] = key
    parts = {pn: part_entry3(tp.PARTS[pn]) for pn in cp.ALL_NEW}
    tint_table = {}
    for slot, cols in cpr.EXTRA_TINTS3.items():
        ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
        tint_table[slot] = {c: tc.tint_hex(c, ref, tpr.TINT_MODEL, slot) for c in sorted(set(cols))}
    for pr in cpr.PRESETS3.values():                      # every fixed preset colour gets a precomputed tint
        for slot, v in pr.get('colors', {}).items():
            if not isinstance(v, list):
                continue
            ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
            for c in v:
                if isinstance(c, str) and c.startswith('#'):
                    tint_table.setdefault(slot, {})[c] = tc.tint_hex(c, ref, tpr.TINT_MODEL, slot)
    face_exprs = {}
    for hp, d, e in ca.face_frames3():
        lst = face_exprs.setdefault(hp, [])
        if e not in lst:
            lst.append(e)
    C = {
        'version': 1, 'fragment': 'cityfolk', 'extends': 'townfolk', 'requires': ['townfolk2'],
        'anims': {a: dict(ca.ANIMS3[a]) for a in ca.ORDER3},
        'timeline': timeline,
        'headPoses': {},
        'faceExprs': face_exprs,
        'exprBrow': dict(ca.EXPR_BROW3),
        'bases': bases,
        'parts': parts,
        'z': {f'cf_{k}': v for k, v in cp.Z3.items()},
        'tintRef': {}, 'tintModel': {'slotS': {}},
        'tintTable': tint_table,
        'palettes': dict(cpr.PALETTES3),
        'generator': {'presets': cpr.PRESETS3, 'slotPalette': dict(cpr.SLOT_PALETTE3), 'exclude': cpr.EXCLUDE3,
                      'extraSlots': []},
        'frameAtlas': frame_atlas,
        'frameAtlasExt': [{'anims': list(ca.ORDER3), 'map': ext_anim}],
        'animItems': dict(ca.ANIM_ITEMS),
        'animFallback': dict(cpr.ANIM_FALLBACK),
        'fallbackFace': dict(cpr.FALLBACK_FACE),
        'cfParts': [p for p in cp.ALL_NEW if tp.PARTS[p].space == 'body'],
        'cityfolkAnims': list(ca.ORDER3),
        'lowerShare': {'groups': ca.LOWER_GROUPS, 'layers': sorted(cp.LOWER_SUBS),
                       'notes': 'Lower-body layers (listed) of the anims of one group are the same images where the '
                                'legs pose is the same (run + flee, arrested_walk + carry_box, the planted stance of '
                                'argue / point / think / shocked / phone / sweep).  Nothing to do in the game.'},
        'items': {
            'carry_box': 'held_box is drawn automatically (animItems).  To carry a real logistics item instead, pass '
                         '{noItems:true} and draw the item with its bottom-centre at boxPoint[anim][dir][i] '
                         '([cx, cy, bx, by]: box centre and bottom-centre px from the anchor; mirrored dirs negate x), '
                         'depth = person depth + 0.0045 in S/SE/E (in front of the body, under the arms), '
                         '- 0.0001 in NE/N (behind).  Box sizes (m): adult 0.36x0.28x0.28, elder 0.32, child 0.27.',
            'spray_hose': 'held_hose is drawn automatically.  nozzlePoint[anim][dir][i] = [x, y, ux, uy]: nozzle tip '
                          'px from the anchor and the screen direction of the water (unit vector; mirrored dirs negate '
                          'x and ux) - aim fx_hose_stream from there.',
            'sweep': 'held_broom is drawn automatically; sweepPoint[anim][dir][i] = [x, y] where the bristles touch the '
                     'snow (puff fx_demolish_dust / snow there).',
            'phone': 'held_phone (tinted acc2) follows the right mitten.',
            'point / argue': 'hand_point (pointing finger, tinted like the hands) is added automatically.'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_V8 AD). Merge after townfolk2 (rules in "merge"), then compose '
                  'exactly like tools/cityfolk_compose.py: the v4 + v5 rules plus (1) animItems[anim] parts are added '
                  'to everybody playing that anim (opts.noItems skips them); parts with onlyAnims only draw there, '
                  'parts with noAnims never draw there; (2) canPlay(person, anim): every worn body part (items '
                  'excluded) must be listed in bases[b].cfCover[anim] for the cityfolk anims, and every worn cityfolk '
                  'part for the older anims; else play animFallback[anim] (first playable) with fallbackFace; '
                  '(3) new face expressions (faceExprs) work as overrides on every face pose.'),
    }
    return {'version': 1, 'notes': ('Cityfolk fragment (CONTRACT_V8 AD): twelve new anims for every townsperson '
                                    '(run, flee, arrested_walk, carry_box, argue, fight, point, think, shocked, phone, '
                                    'sweep, spray_hose) and the city wardrobe (firefighter, police, burglar, bank, '
                                    'warehouse, delivery, movers, construction, reporter, detective). Atlas JSONs are '
                                    'tfatlas v1 like assets/townfolk (NOT Phaser JSON hash). Block "cityfolk" merges '
                                    'after assets/townfolk2 - see cityfolk.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'cityfolk': C}


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
        if f.startswith('cf_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(out, f))
    log, report, qlog = [], [], []
    v4parts = cpr.v4_base_parts()
    if os.path.exists(os.path.join(cache, 'head', 'meta.json')):
        print('[head3] collecting', flush=True)
        head_layers, head_meta = collect_head3(cache, log)
        atlases, where_head = build_sheets3('cf_head', head_layers, lambda l, f: f'{l}/{f}', colors, dither, report,
                                            qlog=qlog)
    else:
        log.append('no head renders')
        atlases, where_head = [], {}
    body_metas, where_body, body_layer_names = {}, {}, {}
    for base in cpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'index.json')):
            log.append(f'no body renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        layers, meta = collect_body3(cache, base, log, v4parts)
        body_metas[base] = meta
        body_layer_names[base] = sorted(layers)
        at, w = build_sheets3(f'cf_{base}', layers, lambda l, f, b=base: f'{l}@{b}/{f}', colors, dither, report, qlog=qlog)
        atlases += at
        where_body[base] = w
    for at in atlases:
        at['png'] = 'cityfolk/' + at['png'].split('/', 1)[1]
        at['json'] = 'cityfolk/' + at['json'].split('/', 1)[1]
    man = build_manifest3(body_metas, where_head, where_body, body_layer_names, atlases, v4parts)
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    area = sum(w * h for _, (w, h), *_ in report)
    print(f'atlases {len(atlases)}, frames {sum(r[2] for r in report)} (+{sum(r[3] for r in report)} aliases), '
          f'sheet area {area / 1e6:.2f} Mpx (~{area * 4 / 2 ** 20:.0f} MiB GPU), payload {total / 1e6:.2f} MB, '
          f'{time.time() - t0:.0f}s')
    for l in log:
        print('WARN', l)
    for key, layer, e0, e1 in qlog:
        print(f'PALETTE {key} {layer}: mean colour error {e0} -> {e1}')


if __name__ == '__main__':
    main()
