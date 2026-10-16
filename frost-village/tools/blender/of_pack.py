"""
of_pack.py - officefolk layers -> assets/officefolk (4 atlases + manifest fragment; CONTRACT_V42 AJ).

Run AFTER of_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/of_pack.py [--colors 64] [--cache /tmp/fv_cache/officefolk] [--out assets/officefolk]

Same layer processing (ink ring minus the mannequin silhouette), frame naming and compact 'tfatlas' JSON as
tools/blender/tf_pack.py / cf_pack.py (imported, not edited).  ONE atlas per page:

    of_desk_0    sit_idle, desk_type, desk_write, desk_phone, desk_read, desk_count  (+ the elder manager's
                 blazer / tie in idle / walk / talk)
    of_work_0    file, point_board, stamp_stand
    of_errand_0  bow, note, hand_over, scoop
    of_sack_0    carry_sack (+ det_bow / acc_sleeves / acc_bell_pin in idle / walk / talk: the courier and the
                 aide walk everywhere, so their extra layers live on the always-resident page)

Frames are '<layer>@<base>/<anim>_<dir>_<i>' (bases adult_slim / elder_slim; the round bases draw the slim frames
stretched, townfolk rule).  Frames that repeat a body key, a torso key or a lower-body key are the same image:
stored once (several frame names, one rect).  Sheets are MaxRects-packed at the width that gives the smallest page
(GPU memory = W x H x 4).  The packer refuses to write anything when a render is missing.
"""
import hashlib
import math
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

import pack_utils as pu                    # noqa: E402
import tf_pack as tpk                      # noqa: E402
import tf_anim as ta                       # noqa: E402
import tf_parts as tp                      # noqa: E402
import tf_presets as tpr                   # noqa: E402
import tf_layerfx as fx                    # noqa: E402
import tf2_anim as ta2                     # noqa: E402
import tf2_parts as tp2                    # noqa: E402,F401
import of_anim as oa                       # noqa: E402
import of_parts as opp                     # noqa: E402
import of_presets as opr                   # noqa: E402
import townfolk_compose as tc              # noqa: E402

FRAME = 128
DEFAULT_CACHE = '/tmp/fv_cache/officefolk'
OUT = os.path.join(GAME, 'assets', 'officefolk')
LIMBS = ['arm_R', 'arm_L', 'hand_R', 'hand_L']
PAGES = list(oa.PAGES4)
BUDGET_MIB = {'desk': 6.0, 'work': 4.0, 'errand': 4.0, 'sack': 1.5}
LOWER_OF = {'seat_up': 'seat', 'seat_up_b': 'seat', 'seat_work': 'seat', 'seat_dip': 'seat',
            'stand': 'stand', 'stand_lean': 'stand'}
CANON_LOWER = {'seat': 'seat_work', 'stand': 'stand'}
ANCHOR_ERR = 9.0
ANCHOR_ROWS = 24

MERGE_RULES = [
    'Merge order: assets/townfolk "townfolk" <- (assets/townfolk2) <- (assets/beachfolk) <- (assets/cityfolk) <- '
    'assets/officefolk "officefolk".  The fragment REQUIRES only townfolk: it merges whether or not townfolk2 / '
    'beachfolk / cityfolk are loaded (v4.2 loads townfolk + officefolk).  tools/officefolk_compose.js '
    'mergeOfficefolk(man, ...fragments, manOffice) = cityfolk_compose.mergeTownfolkFragments + the two officefolk '
    'post rules below.',
    'Generic merge (cityfolk.merge): atlases concatenate; anims, timeline, headPoses, parts, z, tintRef, palettes, '
    'frameAtlas add NEW keys only (a redefinition is an error); frameAtlasExt routes the officefolk frames of layers '
    'an earlier fragment owns: frameAtlasAnim[anim][layer@base]; bases[b]: headOffset gets the new anims, parts = '
    'union, other keys (ofCover, ofExt, handPoint, impactPoint, sackPoint, tipPoint, deskSeat) are added and '
    'groundSpeed gets the new key carry_sack (cityfolk\'s run / flee ... stay); '
    'tintTable[slot] union; generator.presets add; other top-level keys (animItems, animFallback, officefolkAnims, '
    'ofParts, ofPages, headPoseFallback ...) copied / shallow-merged.',
    'Post rule 1 (headPoseFallback): when the merged block has no head pose "down" (townfolk2 not merged), every '
    'officefolk timeline frame with hp "down" uses "nod" instead (7 deg instead of 15 deg; every face used on those '
    'frames - neutral / blink / smile - exists on "nod").',
    'Post rule 2 (preset force): generating an officefolk preset with a "force" list appends those parts after the '
    'normal generation when the person lacks them (no rng drawn).  The bank manager forces top_blazer: townfolk '
    'gives the blazer the ages child / adult only, and this fragment renders it for elders (bases[elder_*].parts); '
    'no other preset changes, so loading officefolk never changes anybody else\'s look.',
    'canPlay(person, anim) = the cityfolk rule plus: officefolk anims need every worn body part (anim items '
    'excepted) in bases[b].ofCover[anim] (parts with an "anims" list: partPlays); in any other anim a part listed in '
    'bases[b].ofExt (a townfolk part this fragment rendered for a base townfolk did not pack it for: det_bow on '
    'adults, top_blazer / det_tie on elders) plays only its listed anims.  pickAnim walks animFallback (e.g. '
    'desk_write -> sit_idle -> sit -> idle, carry_sack -> walk + the game head-carries item_coin_sack_*).',
    'Acting anims (all but carry_sack): the arms, mittens, cuff sleeves and items are drawn ABOVE the garments and '
    'the head stack in the front views (timeline zfront lists all four limbs in S / SE / E) - their frames are '
    'already cut wherever the body or the head hides them.  Nothing to do in the game: zfront is the townfolk rule.',
    'Pages (ofPages): every officefolk atlas is one page; load the pages a scene needs (ofPages.scenes) and pass '
    'pickAnim a {has} predicate (pageNeeded(person, anim) resident).  sack (ofPages.resident) is small and resident '
    'wherever officefolk staff can be seen (the plaza included).  pageNeeded is per person: the anim\'s frames this '
    'person draws may sit on a page other than the anim\'s own (ofPages.roam: the aide\'s note on sack); with two '
    'pages it names the non-resident one.  pickAnim(person, anim, {has}): a townfolk anim whose only missing page '
    'holds the person\'s officefolk extended layers is played without them (no fallback).',
    'Game runtime (src/core/Townfolk.js TF, DollSprite): call officefolk_compose.installOfficefolkRuntime(TF) once '
    'after TF.init(merged manifest).  It replaces TF.layersInto with layersIntoOF (frameAtlasAnim / frameAtlasPose, '
    'animItems, onlyAnims / noAnims / part anims, cfDrop, hidden head parts, zfrontFollow, face override, noItems) '
    'and wraps TF.person with the preset force rule; TF.of = Officefolk on the same block (pickAnim, points, pages).',
]


# --------------------------------------------------------------------------- helpers

def load(p):
    return tpk.load(p)


def to_u8(img):
    return tpk.to_u8(img)


def tile_img(sh, k, cols):
    x, y = (k % cols) * FRAME, (k // cols) * FRAME
    return sh[y:y + FRAME, x:x + FRAME]


def _untinted(layer):
    pn, _, s = layer.partition('.')
    s = s.split('@')[0]
    P = tp.PARTS.get(pn)
    if P is None or s not in P.subs:
        return False
    return P.subs[s].get('tint') is None


def maxrects(sizes, W, pad=2):
    """MaxRects (best short side fit / lowest top) of (w, h) boxes into a strip W wide -> ([(x, y)], height)."""
    free = [(0, 0, W + pad, 1 << 15)]
    out = [None] * len(sizes)
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    for i in order:
        w, h = sizes[i][0] + pad, sizes[i][1] + pad
        best = None
        for fx_, fy, fw, fh in free:
            if w <= fw and h <= fh:
                key = (fy + h, min(fw - w, fh - h), fx_)
                if best is None or key < best[0]:
                    best = (key, fx_, fy)
        if best is None:
            return None
        _, x, y = best
        out[i] = (x, y)
        nf = []
        for r in free:
            fx_, fy, fw, fh = r
            if x >= fx_ + fw or x + w <= fx_ or y >= fy + fh or y + h <= fy:
                nf.append(r)
                continue
            if x > fx_:
                nf.append((fx_, fy, x - fx_, fh))
            if x + w < fx_ + fw:
                nf.append((x + w, fy, fx_ + fw - x - w, fh))
            if y > fy:
                nf.append((fx_, fy, fw, y - fy))
            if y + h < fy + fh:
                nf.append((fx_, y + h, fw, fy + fh - y - h))
        nf = list(dict.fromkeys(nf))
        nf.sort(key=lambda r: -(r[2] * r[3]))
        keep = []
        for r in nf:
            if not any(q[0] <= r[0] and q[1] <= r[1] and q[0] + q[2] >= r[0] + r[2] and q[1] + q[3] >= r[1] + r[3]
                       for q in keep):
                keep.append(r)
        free = keep
    hgt = max(out[i][1] + sizes[i][1] for i in range(len(sizes)))
    return out, hgt


def pack_sheet(frames, max_w=2048, pad=0, widths=None):
    """Trim + MaxRects at a few widths; the smallest W x H (multiple-of-4 sides) wins.  Every trimmed frame keeps a
    1 px transparent border (pack_utils._trim_box), so neighbours are >= 2 px apart even with pad 0 (bilinear-safe)."""
    items = []
    for name, im in frames:
        box = pu._trim_box(im)
        items.append((name, im.size, box, im.crop(box)))
    sizes = [it[3].size for it in items]
    area = sum((w + pad) * (h + pad) for w, h in sizes)
    wmin = max(w for w, h in sizes)
    if widths is None:
        w0 = int(max(wmin, (area ** 0.5) * 0.9))
        widths = sorted({min(max_w, max(wmin, int(w0 * f) // 8 * 8)) for f in (0.8, 0.9, 1.0, 1.1, 1.25, 1.45, 1.7, 2.0)}
                        | {max_w})
    best = None
    for W in widths:
        r = maxrects(sizes, W, pad)
        if r is None:
            continue
        pos, hgt = r
        sw = (max(p[0] + s[0] for p, s in zip(pos, sizes)) + 3) // 4 * 4
        sh = (hgt + 3) // 4 * 4
        if sh > 2048 or sw > max_w:
            continue
        if best is None or sw * sh < best[0]:
            best = (sw * sh, sw, sh, pos)
    if best is None:
        raise SystemExit(f'pack_sheet: {len(items)} frames do not fit one {max_w} x 2048 page')
    _, sw, sh, pos = best
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    fr = {}
    for (name, (W0, H0), box, crop), (x, y) in zip(items, pos):
        sheet.paste(crop, (x, y))
        fr[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': True, 'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': W0, 'h': H0}}
    return sheet, {'frames': fr}


def _quantize(sheet, colors, dither):
    if tpk.imagequant is None:
        return sheet
    return tpk.imagequant.quantize_pil_image(sheet, dithering_level=dither, max_quality=100, min_quality=0,
                                             max_colors=colors)


def _layer_errors(sheet, q, rects):
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
    a = np.asarray(sheet.convert('RGBA'))
    pools = []
    for layer in layers:
        px = [a[y:y + h, x:x + w][a[y:y + h, x:x + w][..., 3] > 200] for x, y, w, h in rects[layer][:40]]
        px = [p for p in px if len(p)]
        if px:
            pools.append(np.concatenate(px))
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


def build_page(key, layers, colors, dither, out, qlog):
    """layers: {layer@base: {frame: uint8 img}} -> one atlas (key).  Returns (atlas entry, where, stats)."""
    items, n_alias = [], 0
    owner = {}
    alias = {}
    for L in sorted(layers):
        seen = {}
        for fr, img in sorted(layers[L].items()):
            h = hashlib.md5(img.tobytes()).hexdigest()
            name = f'{L}/{fr}'
            if h in seen:
                alias[name] = seen[h]
                n_alias += 1
                continue
            seen[h] = name
            items.append((name, Image.fromarray(img, 'RGBA')))
            owner[name] = L
    sheet, atlas = pack_sheet(items)
    rects = {}
    for name, fr in atlas['frames'].items():
        r = fr['frame']
        rects.setdefault(owner[name].split('@')[0], []).append((r['x'], r['y'], r['w'], r['h']))
    q = _quantize(sheet, colors, dither)
    err0 = _layer_errors(sheet, q, rects)
    bad = sorted([l for l, e in err0.items() if e > ANCHOR_ERR and _untinted(l)], key=lambda l: -err0[l])
    if bad and tpk.imagequant is not None:
        rng = np.random.default_rng(7)
        strip = _anchor_strip(sheet, rects, bad, sheet.size[0], ANCHOR_ROWS, rng)
        big = Image.new('RGBA', (sheet.size[0], sheet.size[1] + ANCHOR_ROWS), (0, 0, 0, 0))
        big.paste(sheet, (0, 0))
        big.paste(strip, (0, sheet.size[1]))
        q2 = _quantize(big, colors, dither).crop((0, 0, sheet.size[0], sheet.size[1]))
        err1 = _layer_errors(sheet, q2, rects)
        for l in bad:
            qlog.append((key, l, round(err0[l], 1), round(err1.get(l, 0), 1)))
        q = q2
    png = os.path.join(out, key + '.png')
    js = os.path.join(out, key + '.json')
    q.save(png, optimize=True)
    for n, src in alias.items():
        atlas['frames'][n] = dict(atlas['frames'][src])
    with open(js, 'w', encoding='utf-8') as f:
        json.dump(tpk.compact_atlas(atlas, key + '.png', sheet.size), f, separators=(',', ':'))
    where = {L: key for L in layers}
    entry = {'key': key, 'png': f'officefolk/{key}.png', 'json': f'officefolk/{key}.json', 'format': 'tfatlas',
             'size': list(sheet.size), 'mib': round(sheet.size[0] * sheet.size[1] * 4 / 2 ** 20, 3)}
    stats = {'frames': len(items), 'aliases': n_alias, 'bytes': os.path.getsize(png), 'size': sheet.size,
             'anchored': len(bad)}
    return entry, where, stats


# --------------------------------------------------------------------------- collect

def collect(cache, base, log):
    """{page: {layer@base: {frame: u8}}} + meta4 for one render base."""
    bd = os.path.join(cache, 'body', base)
    idx = json.load(open(os.path.join(bd, 'index.json')))
    meta = json.load(open(os.path.join(bd, 'meta4.json')))
    cols = idx['cols']
    torso, act, walk, old = {}, {}, {}, {}
    for jid, job in idx['jobs'].items():
        jd = os.path.join(bd, jid)
        mpath = os.path.join(jd, 'mask.png')
        if not os.path.exists(mpath):
            log.append(f'MISSING job {base}/{jid}')
            continue
        mask = load(mpath)
        for layer in job['layers']:
            if layer == 'mask':
                continue
            p = os.path.join(jd, layer + '.png')
            if not os.path.exists(p):
                log.append(f'MISSING layer {base}/{jid}/{layer}')
                continue
            sh = load(p)
            kind = fx.layer_kind(layer)
            for k, tile in enumerate(job['tiles']):
                img = tile_img(sh, k, cols)
                if img[..., 3].max() <= 2 / 255:
                    continue
                if img[0, :, 3].max() > 0.2 or img[-1, :, 3].max() > 0.2 or img[:, 0, 3].max() > 0.2 or \
                        img[:, -1, 3].max() > 0.2:
                    log.append(f'CLIPPED {layer}@{base} {jid} tile {k} {tile}')
                res = tpk.process(img, kind, tile_img(mask, k, cols)[..., 3])
                if res[..., 3].max() <= 2 / 255:
                    continue
                u8 = to_u8(res)
                t = tuple(tile)
                {'torso': torso, 'act': act, 'walk': walk, 'old': old}[job['pass']].setdefault(t, {})[layer] = u8
    pages = {pg: {} for pg in PAGES}

    def put(pg, layer, fr, img):
        if fr.rsplit('_', 2)[0] in oa.ANIMS4:
            pg = opr.anim_page(fr.rsplit('_', 2)[0], base, layer, pg)
        pages[pg].setdefault(f'{layer}@{base}', {})[fr] = img
    for a in oa.ORDER4:
        info = oa.ANIMS4[a]
        pg = oa.PAGE_OF4[a]
        cover = set(opr.cover_parts(a, base))
        items = set(oa.ANIM_ITEMS.get(a, []))
        for d in info['dirs']:
            for i in range(info['frames']):
                fr = f'{a}_{d}_{i}'
                k = oa.KEYS4[a][i]
                if a == 'carry_sack':
                    for layer, img in walk.get((a, d, i), {}).items():
                        pn = layer.split('.')[0]
                        if layer in LIMBS or pn in cover or pn in items:
                            put(pg, layer, fr, img)
                    continue
                tk = oa.TORSO4[a][k]
                lk = LOWER_OF.get(tk, tk)
                ltk = CANON_LOWER.get(lk, tk)
                for layer, img in torso.get((tk, d), {}).items():
                    if layer.split('.')[0] not in cover or layer.split('.')[0].startswith(('bot_', 'shoe_')):
                        continue
                    put(pg, layer, fr, img)
                for layer, img in torso.get((ltk, d), {}).items():
                    if layer.split('.')[0] in cover and layer.split('.')[0].startswith(('bot_', 'shoe_')):
                        put(pg, layer, fr, img)
                for layer, img in act.get((a, d, k), {}).items():
                    pn = layer.split('.')[0]
                    if layer in LIMBS or pn in cover or pn in items:
                        put(pg, layer, fr, img)
    for (a, d, i), lays in old.items():
        for layer, img in lays.items():
            pn = layer.split('.')[0]
            if pn in opr.old_cast(base) and a in opr.old_cast(base)[pn]:
                put(opr.old_page(base, pn), layer, f'{a}_{d}_{i}', img)
    return pages, meta


# --------------------------------------------------------------------------- manifest

def nested(flat, sx=1.0, anims=None):
    out = {}
    for a in anims or oa.ORDER4:
        info = oa.ANIMS4[a]
        out[a] = {d: [flat.get(f'{a}_{d}_{i}') for i in range(info['frames'])] for d in info['dirs']}
    return out


def scaled_head(m, sx):
    return {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}


def pts_table(m, key, anims, sx, only_frame=None):
    out = {}
    for a in anims:
        info = oa.ANIMS4[a]
        out[a] = {}
        for d in info['dirs']:
            row = []
            for i in range(info['frames']):
                v = m[key].get(f'{a}_{d}_{i}')
                row.append(None if v is None else [round(v[0] * sx, 1), v[1]])
            if only_frame is not None:
                out[a][d] = row[only_frame(a)]
            else:
                out[a][d] = row
    return out


def ground_speed(m, sx):
    """{carry_sack: {dir: px/s}}: how fast the PLANTED foot slides back at the anim fps (move the sprite at that
    speed, or play the anim at fps * speed / groundSpeed)."""
    out = {'carry_sack': {}}
    feet = m.get('feet', {})
    fps = oa.ANIMS4['carry_sack']['fps']
    for d in oa.ANIMS4['carry_sack']['dirs']:
        ux, uy = m['fwd'][d]
        ux *= sx
        n = 8
        sp = []
        for i in range(n):
            f0, f1 = feet[f'carry_sack_{d}_{i}'], feet[f'carry_sack_{d}_{(i + 1) % n}']
            best = None
            for j in (0, 1):
                dx, dy = (f1[j][0] - f0[j][0]) * sx, f1[j][1] - f0[j][1]
                nrm = (ux * ux + uy * uy) ** 0.5 or 1.0
                along = (dx * ux + dy * uy) / nrm
                if along < 0 and (best is None or max(f0[j][2], f1[j][2]) < best[0]):
                    best = (max(f0[j][2], f1[j][2]), -along)
            if best is not None and best[0] < 0.12:
                sp.append(best[1])
        out['carry_sack'][d] = round(sum(sp) / len(sp) * fps, 1) if sp else None
    return out


def part_entry4(P, framed, all_anims):
    e = tpk.part_entry(P)
    for s, sd in P.subs.items():
        for k in ('zfrontFollow', 'onlyAnims', 'noAnims', 'followDz'):
            if sd.get(k):
                e['subs'][s][k] = sd[k]
    tags = set(P.tags)
    if 'anim_item' in tags:
        e['anims'] = list(P.only_anims)
    else:
        e['anims'] = [a for a in all_anims if a in framed]
    return e


def bank_counter():
    """(polish H3) The civic bank counter as the tellers see it: for each teller point (civic bank.staffPoints[0..2],
    band 'behind'), how high above the feet the counter's opaque top edge runs (the near face + top of bank_front hide
    everything of a teller below it) and where its semi-transparent glass partitions end.  Measured on the bank_front
    pixels in a 12 px wide column in front of the point (toward SW, where the teller works)."""
    mp = os.path.join(GAME, 'assets', 'civic', 'manifest.json')
    if not os.path.exists(mp):
        return None
    m = json.load(open(mp, encoding='utf-8'))
    S = m['sprites']
    B, F = S.get('bank'), S.get('bank_front')
    if not B or not F:
        return None
    at = {a['key']: a for a in m['atlases']}[F['atlas']]
    js = json.load(open(os.path.join(GAME, 'assets', at['json'])))
    fr = js['frames']
    f = fr[F['frame']] if isinstance(fr, dict) else [x for x in fr if x['filename'] == F['frame']][0]
    img = np.asarray(Image.open(os.path.join(GAME, 'assets', at['png'])).convert('RGBA'))
    r, ss = f['frame'], f['spriteSourceSize']
    W, H = f['sourceSize']['w'], f['sourceSize']['h']
    full = np.zeros((H, W, 4), np.uint8)
    full[ss['y']:ss['y'] + r['h'], ss['x']:ss['x'] + r['w']] = img[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']]
    ax, ay = B['anchor'][0] * W, B['anchor'][1] * H
    tops, glass = [], []
    for p in B['staffPoints'][:3]:
        x, y = int(round(ax + p[0])), int(round(ay + p[1]))
        for dx in range(-12, 1, 2):                       # in front of the teller (SW = screen left)
            col = full[:y + 1, x + dx, 3]
            h = 0
            while h < y and col[y - h] >= 250:            # the opaque counter, from the feet up
                h += 1
            while h < y and col[y - h] < 30:              # (a gap under the near edge, if any)
                h += 1
            while h < y and col[y - h] >= 250:
                h += 1
            tops.append(h)
            g = h
            while g < y and 30 <= col[y - g] < 250:       # the glass above it
                g += 1
            glass.append(g)
    return {'counterTopPx': int(np.median(tops)), 'counterTopRangePx': [int(min(tops)), int(max(tops))],
            'glassTopPx': int(np.median(glass)), 'points': 'civic bank.staffPoints[0..2]', 'dirs': 'SW'}


def counter_block(bases):
    """(polish H3) stamp_stand / hand_over behind a tall counter: the game lifts the teller (DollSprite.lift) so the
    stamp's impact lands on the counter's top edge and the arms work above it."""
    bc_ = bank_counter()
    out = {'anims': ['stamp_stand', 'hand_over', 'idle', 'talk', 'bow', 'note', 'desk_count'],
           'rule': 'liftPx = counterTopPx + 1 + impactPoint.stamp_stand[dir][1] (impact y is negative): the teller is '
                   'drawn liftPx higher (DollSprite.lift, depth unchanged), standing on the counter step; the counter '
                   'hides the legs.  Keep the lift for every anim played behind that counter.',
           'counterTopM': oa.COUNTER_TOP, 'places': {}}
    if bc_:
        lift = {}
        for b, e in bases.items():
            imp = e['impactPoint']['stamp_stand']
            lift[b] = {d: int(math.ceil(bc_['counterTopPx'] + 1 + imp[d][1])) for d in imp}
        out['places']['bank'] = dict(bc_, liftPx=lift, band='behind',
                                     notes='civic bank tellers (staffPoints[0..2], SW = mirrored SE): lift by '
                                           'liftPx[base].SE.  The glass partitions of bank_front (up to glassTopPx) '
                                           'still veil the faces a little: civic-side (lighter glass or a separate '
                                           'glass layer), see the officefolk build report.')
    return out


def build_manifest(metas, where, atlases, page_info, v4parts, anims_of):
    tl = oa.timeline4()
    timeline = {a: {d: [tl[(a, d, i)] for i in range(oa.ANIMS4[a]['frames'])] for d in oa.ANIMS4[a]['dirs']}
                for a in oa.ORDER4}
    with open(os.path.join(GAME, 'assets', 'townfolk', 'manifest.json'), encoding='utf-8') as f:
        T1 = json.load(f)['townfolk']
    fa1 = T1['frameAtlas']
    bases = {}
    for base in opr.BASES4:
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in metas:
            continue
        m = metas[src]
        cover = {a: opr.cover_parts(a, src) for a in oa.ORDER4}
        ext = {}
        for pn in sorted({p for a in oa.ORDER4 for p in cover[a]}):
            if pn in v4parts[base] or pn in opp.NEW_WEAR4:
                continue
            ext[pn] = list(opr.old_cast(src).get(pn, []))
        parts = sorted([p for p in opp.NEW_WEAR4 if p in cover['desk_write']] +
                       [p for p in opr.old_cast(src) if p not in v4parts[base] and p not in opp.NEW_WEAR4])
        e = {'headOffset': nested(scaled_head(m, sx)), 'parts': parts, 'ofCover': cover, 'ofExt': ext,
             'handPoint': pts_table(m, 'hand', ['hand_over'], sx)['hand_over'],
             'impactPoint': pts_table(m, 'impact', ['desk_write', 'stamp_stand'], sx,
                                      only_frame=lambda a: oa.ANIMS4[a]['impactFrame']),
             'sackPoint': pts_table(m, 'sack', ['scoop'] + (['carry_sack'] if cover['carry_sack'] else []), sx),
             'tipPoint': pts_table(m, 'tip', ['point_board'], sx),
             'deskSeat': {'groundOffsetPx': m['seat']['groundOffsetPx'], 'deskTopPx': m['seat']['deskTopPx']}}
        gs = ground_speed(m, sx) if cover['carry_sack'] and any(k.startswith('carry_sack') for k in m.get('feet', {})) else {}
        if gs:
            e['groundSpeed'] = gs
        bases[base] = e
    # frameAtlas: ONLY the layers of the new parts (nobody else can own them); every other layer (townfolk parts,
    # incl. layers townfolk / townfolk2 / cityfolk may or may not pack for a base) routes its officefolk frames
    # through frameAtlasExt -> frameAtlasAnim[anim][layer@base], scoped to the anims that page holds for it.  Old
    # anims (idle / walk / talk) get their own entries that list ONLY the extended layers rendered there, so the
    # townfolk frames of every other layer keep resolving through frameAtlas.
    own = set(opp.ALL_NEW4)
    frame_atlas = {}
    for pg in PAGES:
        for L, key in sorted(where.get(pg, {}).items()):
            if L.split('.')[0].split('@')[0] in own:
                frame_atlas.setdefault(L, key)
    # (polish) one entry per (page, set of anims with the same layer map): every (anim, layer) routes to the page
    # that really holds its frames ('note' is split between errand and sack, see of_presets.ROAM)
    ext_list = []
    for pg in PAGES:
        key = f'of_{pg}_0'
        lay = anims_of.get(pg, {})
        for is_old in (False, True):
            per = {}
            for L in sorted(lay):
                if frame_atlas.get(L) == key:
                    continue
                for a in lay[L]:
                    if (a in oa.ANIMS4) != is_old:
                        per.setdefault(a, {})[L] = key
            groups_ = {}
            for a in sorted(per, key=lambda x: (oa.ORDER4.index(x) if x in oa.ANIMS4 else 99, x)):
                groups_.setdefault(json.dumps(per[a], sort_keys=True), []).append(a)
            for mp_js, anims in groups_.items():
                e = {'anims': anims, 'page': pg, 'map': json.loads(mp_js)}
                if is_old:
                    e['old'] = True
                ext_list.append(e)
    # parts
    all_anims = [a for a in list(ta.ORDER) + list(ta2.ORDER2) + list(oa.ORDER4) if a != 'carry_walk']
    framed = {}
    for pn in opp.NEW_WEAR4:
        fa = set()
        for a in oa.ORDER4:
            if any(pn in opr.cover_parts(a, b) for b in opr.RENDER_BASES):
                fa.add(a)
        for b in opr.RENDER_BASES:
            fa |= set(opr.old_cast(b).get(pn, []))
        framed[pn] = fa
    parts = {pn: part_entry4(tp.PARTS[pn], framed.get(pn, set()), all_anims) for pn in opp.ALL_NEW4}
    # tints for every fixed preset colour on the slots it tints
    tint_table = {}
    for pr in opr.PRESETS4.values():
        for slot, v in pr.get('colors', {}).items():
            cols = v if isinstance(v, list) else opr.PALETTES4.get(v, [])
            ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
            for c in cols:
                if isinstance(c, str) and c.startswith('#'):
                    tint_table.setdefault(slot, {})[c] = tc.tint_hex(c, ref, tpr.TINT_MODEL, slot)
    for slot, pal in (('top', 'cardigan_office'),):
        pass
    groups = {}
    for pg, inf in page_info.items():
        groups[pg] = dict(inf)
    O = {
        'version': 1, 'fragment': 'officefolk', 'extends': 'townfolk', 'requires': ['townfolk'],
        'mergeAfter': ['townfolk2', 'beachfolk', 'cityfolk'],
        'anims': {a: dict(oa.ANIMS4[a]) for a in oa.ORDER4},
        'timeline': timeline,
        'headPoses': {},
        'headPoseFallback': {'down': 'nod'},
        'faceExprs': {}, 'exprBrow': {},
        'bases': bases,
        'parts': parts,
        'z': {f'of_{k}': v for k, v in opp.Z4.items()},
        'tintRef': {}, 'tintModel': {'slotS': {}},
        'tintTable': tint_table,
        'palettes': dict(opr.PALETTES4),
        'generator': {'presets': {k: opr.PRESETS4[k] for k in opr.PRESET_ORDER}, 'slotPalette': {}, 'exclude': [],
                      'extraSlots': []},
        'frameAtlas': frame_atlas,
        'frameAtlasExt': ext_list,
        'animItems': {a: list(v) for a, v in oa.ANIM_ITEMS.items()},
        'animFallback': dict(opr.ANIM_FALLBACK4),
        'officefolkAnims': list(oa.ORDER4),
        'ofParts': list(opp.ALL_NEW4),
        'ofPages': {'groups': groups, 'resident': 'sack',
                    'roam': {a: {b: list(v) for b, v in bb.items()} for a, bb in opr.ROAM.items()},
                    'scenes': {'office': ['desk', 'work', 'errand', 'sack'], 'bank': ['desk', 'work', 'errand', 'sack'],
                               'plaza': ['sack'], 'depot': ['errand', 'sack']},
                    'notes': 'One atlas per page.  "sack" (ofPages.resident) stays resident wherever officefolk '
                             'staff can be seen, the plaza included: carry_sack, the aide\'s note (roam: her '
                             'wardrobe + the adult limbs + the notebook), and the roaming extended layers in idle / '
                             'walk / talk / wave / happy (bell pin, aide bow, teller bow tie, manager tie).  The '
                             'clerk\'s cuff sleeves and the manager\'s blazer in those anims are on "desk" (office '
                             'wear): off that page they are simply not drawn (pickAnim keeps the anim).  Load desk / '
                             'work / errand with the office / bank / depot and drop them afterwards.  Ask '
                             'pageNeeded(person, anim) (per person) inside the sprite\'s has() predicate.'},
        'counter': counter_block(bases),
        'seat': {'anims': [a for a in oa.ORDER4 if a in oa.SEATED], 'seatHeightM': oa.SEAT_H,
                 'anchor': 'seat front-centre at seat height (the townfolk2 sit convention, office deskPoints)',
                 'deskTopM': 0.72, 'deskEdgeM': -oa.DESK_EDGE,
                 'notes': 'Put the sprite anchor ON the seat point.  The desk (the building\'s _interior_front) is '
                          'drawn over the sitter and hides the legs; the legs are drawn whole anyway.  '
                          'bases[b].deskSeat.groundOffsetPx = the floor under the sitter (soft shadow there), deskTopPx = the desk '
                          'top line (bases[b].seat is townfolk2\'s sit, left alone).',
                 'places': {
                     'office': {'points': 'office chief_office.deskPoints[i]', 'dirs': 'deskDirs[i]',
                                'band': 'deskBands[i] (else pointSlots.deskPoints)', 'anchorLiftPx': 0,
                                'notes': 'the deskPoint IS the seat front-centre: anchor on it.'},
                     'bank': {'points': 'civic bank.staffPoints[3]', 'dir': 'SE', 'band': 'behind',
                              'anchorLiftPx': 'bases[b].deskSeat.groundOffsetPx',
                              'notes': 'The 은행장 sits at his desk behind staffPoints[3] (a FLOOR point): anchor at '
                                       'y - deskSeat.groundOffsetPx (about 25 px up) so he sits on his chair and the '
                                       'bank desk covers his lap; shadow on the point itself.  civic bank.deskPoint is '
                                       'a customer floor spot facing NW (seated anims have no NW): not a seat.'}}},
        'items': {
            'desk_write': 'held_pen on frames 0-3, held_stamp on 4-5 (impactFrame 4 = the stamp hits the paper; '
                          'bases[b].impactPoint.desk_write[dir] = the contact point for a puff / sfx_stamp).',
            'stamp_stand': 'held_stamp; impactFrame 3, impactPoint.stamp_stand[dir].',
            'hand_over': 'no item is drawn: fly the real item (item_coin_sack_*, item_letter_bundle ...) from '
                         'bases[b].handPoint[dir][i] (px from the anchor; mirrored dirs negate x), e.g. on frame 3.',
            'scoop': 'held_sack_open; coins hop into bases[b].sackPoint.scoop[dir][i] (the open sack mouth between '
                     'the mittens; of_check: within 3 px of the sack on every frame).',
            'carry_sack': 'held_sack_shoulder (bounces with the walk, hangs outboard of the right shoulder with a '
                          'coin emblem toward the camera in S / SE / E); sackPoint.carry_sack[dir][i] = the visible '
                          'sack belly (coins hop in there too).  Move at bases[b].groundSpeed.carry_sack[dir] px/s, '
                          'or play at timeScale = clamp(speed / groundSpeed, 0.8, 1.8) (TownSim style) so the feet '
                          'do not skate.  One sack size: show the round\'s value with the coin hops / jingle (and '
                          'item_coin_sack_s/m/l flown at the counter).  Without officefolk the game head-carries '
                          'item_coin_sack_s/m/l on walk.',
            'point_board': 'held_pointer; tipPoint.point_board[dir][i] = the pointer tip (the chalkboard bar it taps).',
            'others': 'held_receiver (desk_phone), held_letter (desk_read sheet / file envelope), held_coins '
                      '(desk_count), held_notebook (note) are drawn automatically (animItems); noItems skips them.'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_V42 AJ): the office staff.  Merge after townfolk (+ townfolk2 / '
                  'beachfolk / cityfolk when present) with tools/officefolk_compose.js mergeOfficefolk() (rules in '
                  '"merge"), then compose exactly like tools/officefolk_compose.py.'),
    }
    return {'version': 1,
            'generator': 'tools/blender/of_render.py + of_pack.py (Blender 5.2 Cycles, bl_common camera / light, '
                         'townfolk tf_* pipeline)',
            'conventions': {'ppu': 64, 'iso': '2:1', 'frameSize': [128, 128], 'anchor': [0.5, 0.8125],
                            'frameNames': '{layer}@{base}/{anim}_{dir}_{i}', 'mirror': {'SW': 'SE', 'W': 'E', 'NW': 'NE'},
                            'seatAnchor': 'seated anims: the seat point (0.45 m, seat front-centre)'},
            'notes': ('Officefolk fragment (CONTRACT_V42 AJ): 14 office anims (desk work, filing, the board, '
                      'stamping, bowing, notes, handing over, the coin courier scooping and carrying his sack), 11 new '
                      'parts and 8 presets.  Atlas JSONs are tfatlas v1 like assets/townfolk.  Block "officefolk" '
                      'merges after assets/townfolk (townfolk2 / beachfolk / cityfolk optional) - see officefolk.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'officefolk': O}


def main():
    args = sys.argv[1:]
    cache, colors, dither, out = DEFAULT_CACHE, 64, 0.5, OUT
    i = 0
    while i < len(args):
        a = args[i]
        if a in ('--cache', '--colors', '--dither', '--out'):
            v = args[i + 1]
            if a == '--cache':
                cache = v
            elif a == '--colors':
                colors = int(v)
            elif a == '--dither':
                dither = float(v)
            else:
                out = os.path.abspath(v)
            i += 2
            continue
        i += 1
    t0 = time.time()
    log, qlog = [], []
    v4parts = opr.v4_base_parts()
    metas, by_page = {}, {pg: {} for pg in PAGES}
    for base in opr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'index.json')) or \
                not os.path.exists(os.path.join(cache, 'body', base, 'meta4.json')):
            log.append(f'MISSING renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        pages, meta = collect(cache, base, log)
        metas[base] = meta
        for pg, lays in pages.items():
            by_page[pg].update(lays)
    missing = [l for l in log if l.startswith('MISSING')]
    if missing or len(metas) != len(opr.RENDER_BASES):
        for l in missing[:20]:
            print('ERROR', l)
        raise SystemExit('of_pack: renders missing - nothing written (render first: of_render.py)')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('of_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(out, f))
    atlases, where, page_info = [], {}, {}
    for pg in PAGES:
        key = f'of_{pg}_0'
        entry, w, st = build_page(key, by_page[pg], colors, dither, out, qlog)
        atlases.append(entry)
        where[pg] = w
        page_info[pg] = {'anims': list(oa.PAGES4[pg]), 'atlases': [key], 'mib': entry['mib'],
                         'budgetMiB': BUDGET_MIB[pg], 'size': entry['size'],
                         'bases': sorted({L.split('@')[1] for L in by_page[pg]})}
        print(f'  {key}: {st["size"][0]}x{st["size"][1]} = {entry["mib"]:.2f} MiB (budget {BUDGET_MIB[pg]})  '
              f'{st["frames"]} rects (+{st["aliases"]} aliases)  {st["bytes"] / 1024:.0f} KB  anchors {st["anchored"]}',
              flush=True)
    anims_of = {pg: {L: {fr.rsplit('_', 2)[0] for fr in frs} for L, frs in by_page[pg].items()} for pg in PAGES}
    man = build_manifest(metas, where, atlases, page_info, v4parts, anims_of)
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
    print(f'atlases {len(atlases)}, total {sum(a["mib"] for a in atlases):.2f} MiB RGBA, payload {total / 1e6:.2f} MB, '
          f'{time.time() - t0:.0f}s')
    for l in log:
        print('WARN', l)
    for key, layer, e0, e1 in qlog:
        print(f'PALETTE {key} {layer}: mean colour error {e0} -> {e1}')


if __name__ == '__main__':
    main()
