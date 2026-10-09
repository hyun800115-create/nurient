"""
bf_pack.py - beachfolk layers -> assets/beachfolk atlases + manifest fragment (CONTRACT_V7 Y).

Run AFTER bf_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/bf_pack.py [--colors 80] [--dither 0.35] [--cache <scratch>/v7_beachfolk/cache] [--out assets/beachfolk]

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
    'parts[p].anims (new): the anims a beach part lets its wearer PLAY (a part without it = a v4 / v5 part: the v4 + '
    'v5 anims).  canPlay(person, anim) = every BODY part of the person lists the anim (partPlays()).  parts[p].noAnims: '
    'the anims where nothing of the part is drawn - drop accessories (drop: true: towel, flip-flops, camera, rescue '
    'tube, arm floaties, cleaning caddy) list EVERY anim in anims and the ones they have no frames for in noAnims '
    '(put down / taken off there), so any compositor honouring anims + noAnims (beachfolk, cityfolk, townfolk2) agrees '
    'on canPlay.  The swim ring is not a drop part: wearers cannot swim / surf / dig / play ball / sunbathe.',
    'animFallback (new, cityfolk-compatible): {anim: [fallbacks]} - pickAnim(person, anim) = anim when canPlay, else '
    'the first playable fallback (swim -> float: a ring wearer bobs in the ring), else idle / walk.  BeachfolkSprite.'
    'play() goes through pickAnim.  For water anims check canPlay / the picked anim stays a water anim.',
    'animHideHead (new): {anim: [head parts hidden there]} - hats come off for swim / surf, only swim caps + sun hats + '
    'the visor and the two v4 beach hats stay on in float, only the swim caps + laid-over-face sun hats in sunbathe.  A '
    'hidden FULL hat no longer squashes the hair (hair draws its normal layer, not ~hat).  The beachfolk hats also '
    'carry these anims in noAnims.  Hat frames nobody can see in the swim / lie poses are not packed.',
    'timeline[anim][dir][i].hd (new, optional): the head frame dir when it differs from the anim dir (surf NE looks E).',
    'subs followDz (new, optional): z = limb z + followDz instead of + 0.5 (bare_arms 0.2 < sleeve cuffs 0.5 < '
    'arm floaties 0.7).',
]


def load(p):
    return tpk.load(p)


PACKER = 'skyline'      # 'shelf' = tools/pack_utils.pack_atlas (the townfolk packer)
SKYLINE_FILL = 0.70     # greedy layer -> sheet split budget (townfolk shelf packing: 0.62)


def skyline_pack(frames, max_width=2048, padding=2):
    """Bottom-left skyline packing (tallest first; for every frame the lowest x on the skyline, leftmost on ties) -
    same output as pack_utils.pack_atlas (sheet, Phaser JSON-hash atlas; trimmed with a 1-px pad).  The shelf packer
    leaves a strip above every shorter frame of a shelf: ~12 % less sheet area here for the same frames."""
    from PIL import Image
    import pack_utils
    items = []
    for name, im in frames:
        im = im.convert('RGBA')
        box = pack_utils._trim_box(im)
        items.append((name, im.size, box, im.crop(box)))
    order = sorted(range(len(items)), key=lambda i: (-items[i][3].height, -items[i][3].width))
    W = max_width
    sky = np.zeros(W + padding, np.int32)
    place = {}
    H = 0
    for i in order:
        w, h = items[i][3].size
        ww = min(w + padding, W + padding)
        win = np.lib.stride_tricks.sliding_window_view(sky, ww).max(axis=1)[:max(1, W - w + 1)]
        x = int(np.argmin(win))
        y = int(win[x])
        place[i] = (x, y)
        sky[x:x + ww] = y + h + padding
        H = max(H, y + h)
    used_w = max(place[i][0] + items[i][3].width for i in place)
    sw, sh = (used_w + 3) // 4 * 4, (H + 3) // 4 * 4
    sw = min(sw, max(W, used_w))
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    fr = {}
    for i, (name, (ow, oh), box, crop) in enumerate(items):
        x, y = place[i]
        sheet.paste(crop, (x, y))
        fr[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != (ow, oh),
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': ow, 'h': oh}}
    atlas = {'frames': fr, 'meta': {'app': 'frost-village/tools/blender/bf_pack.py skyline', 'version': '1.0',
                                    'image': '', 'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    return sheet, atlas


def build_sheets3(prefix, layers, frame_name, colors, dither, report, tail=0.5):
    """tf_pack.build_sheets (same dedupe, greedy layer -> sheet split, packing, quantizing, compact JSON) plus a
    tail merge: a last group smaller than `tail` x the sheet budget is packed together with the group before it
    when the pair still fits one 2048 sheet (no 60-px stub atlases = one texture / draw-call batch less)."""
    import hashlib
    from PIL import Image
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
    budget = SHEET * SHEET * (SKYLINE_FILL if PACKER == 'skyline' else tpk.SHEET_FILL)
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
        frames, alias = [], {}
        for layer, names, img in items:
            if layer not in gs:
                continue
            frames.append((names[0], Image.fromarray(img, 'RGBA')))
            for n in names[1:]:
                alias[n] = names[0]
        if PACKER == 'skyline':
            sheet, atlas = skyline_pack(frames, max_width=SHEET, padding=2)
        else:
            sheet, atlas = pack_utils.pack_atlas(frames, max_width=SHEET, trim=True, padding=2)
        return sheet, atlas, frames, alias

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
        sheet, atlas, frames, alias = res
        if sheet.size[1] > SHEET and len(grp) > 1:          # too tall: split the group and retry
            h = len(grp) // 2
            pending[:0] = [grp[:h], grp[h:]]
            continue
        key = f'{prefix}_{k}'
        k += 1
        for n, src in alias.items():
            atlas['frames'][n] = dict(atlas['frames'][src])
        png = os.path.join(tpk.OUT, key + '.png')
        js = os.path.join(tpk.OUT, key + '.json')
        if tpk.imagequant is not None:
            q = tpk.imagequant.quantize_pil_image(sheet, dithering_level=dither, max_quality=100, min_quality=0,
                                                  max_colors=colors)
            q.save(png, optimize=True)
        else:
            sheet.save(png, optimize=True)
        with open(js, 'w', encoding='utf-8') as f:
            json.dump(tpk.compact_atlas(atlas, key + '.png', sheet.size), f, separators=(',', ':'))
        for layer in grp:
            where[layer] = key
        atlases.append({'key': key, 'png': f'townfolk/{key}.png', 'json': f'townfolk/{key}.json', 'format': 'tfatlas'})
        report.append((key, sheet.size, len(frames), len(alias), os.path.getsize(png)))
        print(f'  {key}: {sheet.size[0]}x{sheet.size[1]}  {len(frames)} frames (+{len(alias)} dup)  '
              f'{os.path.getsize(png) / 1024:.0f} KB', flush=True)
    return atlases, where


def to_u8(img):
    return tpk.to_u8(img)


def process(img, kind, mask):
    return tpk.process(img, kind, mask)


# --------------------------------------------------------------------------- collect

SPECK_GAP = 6          # px of empty rows between a speck and the layer's main body
SPECK_FRAC = 0.12      # a speck holds less than this share of the layer's pixels


def despeckle(img, tl, tag, log):
    """Erase detached slivers glued to the TOP / BOTTOM edge of a body tile: geometry of the neighbouring tile rig in
    the tiled render (e.g. the toy spade dug into the sand in dig frame 0 reached into frame 4's tile, a 3-px pink
    sliver 60 px above the head).  Rows only: a speck is a run of occupied rows touching the tile edge, separated from
    the rest by >= SPECK_GAP empty rows, not the layer's biggest run, and holding < SPECK_FRAC of its pixels or at most
    4 rows tall (a mostly hidden spade can be smaller than the leaked sliver)."""
    a = img[..., 3] > 0.02
    tot = int(a.sum())
    if not tot:
        return img
    occ = a.any(axis=1)
    idx = np.nonzero(occ)[0]
    if len(idx) < 2:
        return img
    br = np.nonzero(np.diff(idx) >= SPECK_GAP)[0]
    if not len(br):
        return img
    segs, s0 = [], 0
    for b in br:
        segs.append((int(idx[s0]), int(idx[b])))
        s0 = b + 1
    segs.append((int(idx[s0]), int(idx[-1])))
    top, bot = tl['oy'], tl['oy'] + tl['h'] - 1
    biggest = max(segs, key=lambda sg: int(a[sg[0]:sg[1] + 1].sum()))
    for r0, r1 in segs:
        if (r0 > top + 1 and r1 < bot - 1) or (r0, r1) == biggest:
            continue
        cnt = int(a[r0:r1 + 1].sum())
        if cnt < SPECK_FRAC * tot or r1 - r0 < 4:
            img = img.copy()
            img[r0:r1 + 1] = 0
            log.append(f'despeckle {tag}: rows {r0}-{r1} ({cnt} of {tot} px)')
    return img


def all_hats():
    """Every hat of townfolk + townfolk2 + beachfolk (tf_parts registry, in-process)."""
    return sorted(pn for pn, P in tp.PARTS.items() if P.family == 'hat' and P.space == 'head')


def anim_hide_head():
    """{anim: [hats hidden there]} = every hat but bf_presets.HEAD_KEEP[anim]."""
    hats = all_hats()
    return {a: [h for h in hats if h not in keep] for a, keep in bpr.HEAD_KEEP.items()}


def pose_users():
    """{(head pose, head dir): {anims whose timeline shows it}} for the beachfolk-only poses swim / lie."""
    out = {}
    for (a, d, i), e in ba.timeline3().items():
        if e['hp'] in ba.HEAD_POSES3:
            out.setdefault((e['hp'], e.get('hd', d)), set()).add(a)
    return out


def head_frame_hidden(layer, hp, d, users, hide):
    """True when this head layer frame can never be drawn: a hat hidden in every anim that uses (hp, d)."""
    if hp not in ba.HEAD_POSES3:
        return False
    pn = layer.split('.')[0]
    P = tp.PARTS.get(pn)
    if P is None or P.family != 'hat':
        return False
    us = users.get((hp, d), set())
    return bool(us) and all(pn in hide.get(a, ()) for a in us)


def collect_head3(cache, log, dropped=None):
    users, hide = pose_users(), anim_hide_head()
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
            if pn in bpr.RETIRED:
                continue
            if head_frame_hidden(layer, hp, d, users, hide):
                if dropped is not None:
                    dropped.append(f'{layer}/{name}')
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
                res = despeckle(res, tl, f'{layer}@{base}/{anim}_{d}_{i}', log)
                if res[..., 3].max() <= 2 / 255:
                    continue
                fr[f'{anim}_{d}_{i}'] = to_u8(res)
    out = {k: v for k, v in out.items() if v}
    return out, meta


# --------------------------------------------------------------------------- manifest

def part_entry3(P, hide=None):
    """anims = the anims this part lets a person PLAY (canPlay); noAnims = anims where nothing of it is drawn.
    Drop accessories: anims = every anim, noAnims = the anims without frames (put down / taken off there).
    Beach hats: noAnims = the anims they are hidden in (= animHideHead; for compositors that only know noAnims)."""
    e = tpk2.part_entry2(P)
    for s, sd in P.subs.items():
        if sd.get('followDz') is not None:
            e['subs'][s]['followDz'] = sd['followDz']
    if P.name in bpr.PART_ANIMS:
        frames = list(bpr.PART_ANIMS[P.name])
        e['anims'] = frames
        if P.name in bpr.DROP_PARTS:
            e['anims'] = list(bpr.ALL_ANIMS)
            e['noAnims'] = [a for a in bpr.ALL_ANIMS if a not in frames]
            e['drop'] = True
    if P.space == 'head' and hide:
        hid = [a for a in bpr.HEAD_KEEP if P.name in hide.get(a, ())]
        if hid:
            e['noAnims'] = hid
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
    hide = anim_hide_head()
    parts = {pn: part_entry3(tp.PARTS[pn], hide) for pn in bp.NEW_PARTS if pn not in bpr.RETIRED}
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
        'sunbathe': {'dirMeans': 'feet',
                     'dir': 'dir = where the FEET point (SE / NE rendered, SW / NW mirrored); the head is at the other '
                            'end.  Anchor = under the hips ON the lying surface (towel decal / lounger lyingPoint).',
                     'spotDir': 'Use sunbatheDirFor(spot, i) (beachfolk_compose.js / sunbathe_dir_for in .py): '
                                'spot.lyingFeetDirs[i] when the prop has it (assets/beach towels + loungers after the '
                                'beach polish), else the OPPOSITE of spot.lyingDirs[i] (lyingDirs = hips -> head, the '
                                'assets/beach convention; beach_bld hotel_pool lists lyingDirs only).  Never play '
                                'sunbathe with lyingDirs directly: the person lies reversed (head off the foot end).',
                     'lieHeightM': ba.LIE_HIPS_Z,
                     'shadow': 'instead of the round shadow draw an ellipse bases[b].lieShadow[dir] = {center [dx, dy], '
                               'length, width, angleDeg} (mirrored dirs: negate dx and the angle)'},
        'dig': {'anchor': 'ground under the hips (kneeling)', 'digPoint': 'bases[b].digPoint[dir] = where the sandcastle '
                                                                        '(beach sandcastle_build stages) stands'},
        'ball': {'radiusM': ba.BALL_R, 'radiusMByAge': {'child': ba.ball_r('child'), 'adult': ba.ball_r('adult'),
                                                         'elder': ba.ball_r('elder')},
                 'ballPoint': 'bases[b].ballPoint[anim][dir][i] = [dx, dy, front, radiusPx] centre of the held ball '
                              '(null = no ball in the hands).  ball_throw: release on impactFrame 3 (spawn the flying '
                              'ball there), ball_catch: the ball arrives on impactFrame 2.  front: draw the ball sprite '
                              'over the person (else under).  Scale the beach ball item so its radius = radiusPx.',
                 'size': 'The held ball has a fixed WORLD size: 0.19 m radius (12.2 px) for adults / elders = the beach '
                         'prop beach_ball_bounce (footprintM.radius 0.2), 0.15 m (9.6 px) for children (short chibi '
                         'arms).  Flying ball: lerp its radius from the thrower radiusPx to the catcher radiusPx; on '
                         'the sand use beach_ball_bounce at its own size.'},
        'animHideHead': anim_hide_head(),
        'animFallback': dict(bpr.ANIM_FALLBACK),
        'pageClasses': {'loco': ['idle', 'walk'],
                        'soc': ['talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push'],
                        'beach': ['dig', 'ball_throw', 'ball_catch', 'sunbathe'],
                        'water': ['swim', 'float', 'splash_play', 'surf'],
                        'headPoses': {'beach': ['swim', 'lie']},
                        'notes': 'For a pack_pages-style residency split (v4-B): loco resident near the beach, the '
                                 'rest on demand; the swim / lie head poses only serve the water / beach classes.  '
                                 'carry_walk has no beachfolk frames (dolls carry on the head).'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_V7 Y).  Merge after townfolk2 (rules in "merge"), then compose '
                  'exactly like tools/beachfolk_compose.py: the v4 + v5 rules plus (1) head frames use timeline hd '
                  '(default dir) and faceDirsByPose; (2) animParts are drawn in their anim even if not worn; '
                  '(3) parts draw only in their "anims" minus "noAnims" (canPlay = every body part lists the anim; '
                  'drop accessories list every anim and are simply put down where they have no frames); (4) followDz; '
                  '(5) water anims are anchored on the water surface (see water); (6) animHideHead hides hats per '
                  'anim (and un-squashes the hair); (7) pickAnim / animFallback (swim -> float for ring wearers); '
                  '(8) sunbathe dir = feet: sunbatheDirFor(spot, i).'),
    }
    return {'version': 1, 'notes': ('Beachfolk fragment (CONTRACT_V7 Y): swim / float / sunbathe / dig / beach ball / '
                                    'splash / surf anims for every townsperson body, swimwear and beach + hotel job '
                                    'outfits.  Atlas JSONs are tfatlas v1 like assets/townfolk (NOT Phaser JSON hash).  '
                                    'Block "beachfolk" merges after assets/townfolk2 - see beachfolk.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'beachfolk': B}


def main():
    args = sys.argv[1:]
    # Beach people show a lot of bare skin (large soft gradients): 56 colours + dither 0.5 (townfolk) speckles it
    # once tinted, so bodies use 80 colours / dither 0.35 and the head sheet (faces) 96 / 0.3 (+0.5 MB payload).
    cache, colors, dither = DEFAULT_CACHE, 80, 0.35
    head_colors, head_dither = 96, 0.3
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
        if a == '--packer':
            global PACKER
            PACKER = args[i + 1]; i += 2; continue
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
    atlases, where_head = build_sheets3('bf_head', head_layers, lambda l, f: f'{l}/{f}', max(colors, head_colors),
                                        min(dither, head_dither), report)
    body_metas, where_body, body_layer_names = {}, {}, {}
    for base in tpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'meta3.json')):
            log.append(f'no body renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        layers, meta = collect_body3(cache, base, log)
        body_metas[base] = meta
        body_layer_names[base] = sorted(layers)
        at, w = build_sheets3(f'bf_{base}', layers, lambda l, f, b=base: f'{l}@{b}/{f}', colors, dither, report)
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
