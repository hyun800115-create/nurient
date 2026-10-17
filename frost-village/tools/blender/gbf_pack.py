"""
gbf_pack.py - geumbangfolk layers -> assets/geumbangfolk (2 atlases + manifest fragment; CONTRACT_GEUMBANG AP).

Run AFTER gbf_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/gbf_pack.py [--colors 64] [--cache /tmp/fv_cache/geumbangfolk] [--out assets/geumbangfolk]

Same layer processing (ink ring minus the mannequin silhouette), frame naming and compact 'tfatlas' JSON as
tools/blender/tf_pack.py / of_pack.py (imported, never edited).  ONE atlas per page:

    gbf_road_0   carry_parcel, ring_doorbell, hand_parcel + top_gb_jacket / det_gb_vest in idle / walk / talk / wave /
                 happy + hat_gb_cap on every head frame (resident wherever a courier or crew member is drawn)
    gbf_hub_0    scan, sort_parcel, tape_box (only while the depot is revealed)

Frames are '<layer>@adult_slim/<anim>_<dir>_<i>' (adult_round draws the slim frames stretched, townfolk rule) and
'<layer>/<headPose>_<dir>' for the cap.  Frames that repeat a body key or a torso key are the same image: stored once
(several frame names, one rect).  The packer refuses to write anything when a render is missing.
"""
import hashlib
import json
import math
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
import tf2_parts as tp2                    # noqa: E402,F401
import of_pack as ofp                      # noqa: E402  (read only: pack_sheet / quantizer helpers)
import gbf_anim as ga                      # noqa: E402
import gbf_parts as gp                     # noqa: E402
import gbf_presets as gpr                  # noqa: E402
import townfolk_compose as tc              # noqa: E402

FRAME = 128
DEFAULT_CACHE = '/tmp/fv_cache/geumbangfolk'
OUT = os.path.join(GAME, 'assets', 'geumbangfolk')
LIMBS = ['arm_R', 'arm_L', 'hand_R', 'hand_L']
PAGES = ['road', 'hub']
ATLAS = {'road': 'gbf_road_0', 'hub': 'gbf_hub_0'}
BUDGET_MIB = {'road': 3.5, 'hub': 2.5}
# lower-body sharing: torso keys whose legs / hips are identical (spine lean only) reuse one render of the bottoms
LOWER_OF = {'stand_lean': 'stand'}
ANCHOR_ERR = 9.0
BOX_M = 0.20          # the box the packer tapes (gb_parcel_m / cardboard_box_m height, m)
ANCHOR_ROWS = 24

MERGE_RULES = [
    'Merge order: assets/townfolk "townfolk" <- (assets/townfolk2) <- (assets/beachfolk) <- (assets/cityfolk) <- '
    '(assets/officefolk) <- assets/geumbangfolk "geumbangfolk".  The fragment REQUIRES only townfolk: it merges '
    'whether or not townfolk2 / beachfolk / cityfolk / officefolk are loaded (v4.3 loads townfolk + officefolk + '
    'geumbangfolk; no cityfolk).  tools/geumbangfolk_compose.js mergeGeumbangfolk(man, ...fragments, manGb) = '
    'cityfolk_compose.mergeTownfolkFragments + the post rule below.',
    'Generic merge (cityfolk.merge): atlases concatenate; anims, timeline, headPoses, parts, z, tintRef, palettes, '
    'frameAtlas add NEW keys only (a redefinition is an error); frameAtlasExt routes the geumbangfolk frames of layers '
    'an earlier fragment owns (limbs, top_parka, top_sweater, bot_pants, shoe_boots, acc_scarf in the crew anims): '
    'frameAtlasAnim[anim][layer@base]; bases[b]: headOffset gets the six new anims, parts = union (+ top_gb_jacket, '
    'det_gb_vest), other keys are shallow-merged by anim name: boxPoint (+ carry_parcel, ring_doorbell, scan, tape_box; cityfolk\'s '
    'carry_box stays), handPoint (+ hand_parcel, sort_parcel - anim-keyed; officefolk\'s dir-keyed hand_over rows '
    'stay, no key collides), groundSpeed (+ carry_parcel), bellPoint, beamPoint, tapePoint, gbCover; '
    'tintTable[slot] union; generator.presets add (7 gb_* presets); palettes add (gb_*); other top-level keys '
    '(animItems, animFallback, geumbangfolkAnims, gbParts, gbPages, headPoseFallback, hub, brand ...) copied / '
    'shallow-merged.',
    'Post rule (headPoseFallback): when the merged block has no head pose "down" (townfolk2 not merged), every '
    'geumbangfolk timeline frame with hp "down" uses "nod" instead (faces on those frames: neutral / blink / smile, '
    'which exist on "nod" too).  officefolk applies the same rule to its own anims.',
    'canPlay(person, anim) = the officefolk / cityfolk rule plus: geumbangfolk anims need every worn body part (anim '
    'items excepted) in bases[b].gbCover[anim] (parts with an "anims" list: beachfolk_compose.partPlays); the new '
    'parts top_gb_jacket / det_gb_vest list exactly the anims they have frames in (6 crew anims + idle / walk / talk / '
    'wave / happy), so in every other anim (sit, run, desk_write ...) their wearer falls back.  pickAnim walks '
    'animFallback (carry_parcel -> walk + the game head-carries gb_parcel_*; ring_doorbell / hand_parcel -> talk -> '
    'idle; scan / sort_parcel / tape_box -> idle).',
    'Acting anims (all but carry_parcel): arms, mittens, cuffs and items are drawn ABOVE the garments and the head '
    'stack in the front views (timeline zfront lists all four limbs in S / SE / E) - their frames are already cut '
    'wherever the body or the head hides them.  Nothing to do in the game: zfront is the townfolk rule.',
    'Pages (gbPages): every geumbangfolk atlas is one page.  "road" (gbPages.resident) holds the courier anims, the cap '
    '(head frames) and the jacket / vest in the v4 anims: keep it resident wherever a 금방 courier or crew member is '
    'drawn.  "hub" (scan / sort_parcel / tape_box) is loaded while the depot is revealed.  pageNeeded(person, anim) is '
    'per person (the page holding the frames THAT person draws; the non-resident one when two are needed).',
    'Game runtime (src/core/Townfolk.js TF, DollSprite): after TF.init(...) (+ TF.mergeOfficefolk when the office '
    'exists) merge the block and call geumbangfolk_compose.installGeumbangfolkRuntime(TF) once (recipe in '
    'docs/build_reports/gb_people.md).  It installs the officefolk draw-list runtime (layersIntoOF: frameAtlasAnim, '
    'animItems, onlyAnims / anims lists, zfrontFollow - generic, it draws the crew anims too) and sets TF.gb (and TF.of '
    'when officefolk is merged) to a Geumbangfolk instance: pickAnim, pageNeeded, parcelPoint, handPointOf, bellPoint, '
    'beamPoint, tapePoint, groundSpeed.',
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
    s = s.split('@')[0].split('/')[0]
    P = tp.PARTS.get(pn)
    if P is None or s not in P.subs:
        return False
    return P.subs[s].get('tint') is None


def build_page(key, layers, colors, dither, out, qlog):
    """layers: {layer(@base): {frame: uint8 img}} -> one atlas.  Returns (atlas entry, where, stats)."""
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
    # MaxRects at every width from the widest frame to 1.6 x sqrt(area) (step 16): the smallest W x H wins
    boxes = [im.getchannel('A').getbbox() or (0, 0, 1, 1) for _, im in items]
    wmin = max(b[2] - b[0] + 2 for b in boxes)
    side = int(sum((b[2] - b[0] + 2) * (b[3] - b[1] + 2) for b in boxes) ** 0.5)
    widths = list(range((wmin + 7) // 8 * 8, min(2048, int(side * 1.6)) + 16, 16))
    sheet, atlas = ofp.pack_sheet(items, widths=widths)
    rects = {}
    for name, fr in atlas['frames'].items():
        r = fr['frame']
        rects.setdefault(owner[name].split('@')[0], []).append((r['x'], r['y'], r['w'], r['h']))
    q = ofp._quantize(sheet, colors, dither)
    err0 = ofp._layer_errors(sheet, q, rects)
    bad = sorted([l for l, e in err0.items() if e > ANCHOR_ERR and _untinted(l)], key=lambda l: -err0[l])
    if bad and tpk.imagequant is not None:
        rng = np.random.default_rng(7)
        strip = ofp._anchor_strip(sheet, rects, bad, sheet.size[0], ANCHOR_ROWS, rng)
        big = Image.new('RGBA', (sheet.size[0], sheet.size[1] + ANCHOR_ROWS), (0, 0, 0, 0))
        big.paste(sheet, (0, 0))
        big.paste(strip, (0, sheet.size[1]))
        q2 = ofp._quantize(big, colors, dither).crop((0, 0, sheet.size[0], sheet.size[1]))
        err1 = ofp._layer_errors(sheet, q2, rects)
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
    entry = {'key': key, 'png': f'geumbangfolk/{key}.png', 'json': f'geumbangfolk/{key}.json', 'format': 'tfatlas',
             'size': list(sheet.size), 'mib': round(sheet.size[0] * sheet.size[1] * 4 / 2 ** 20, 3)}
    stats = {'frames': len(items), 'aliases': n_alias, 'bytes': os.path.getsize(png), 'size': sheet.size,
             'anchored': len(bad)}
    return entry, where, stats


# --------------------------------------------------------------------------- collect

def collect_head(cache, log):
    """{layer: {'<hp>_<dir>': u8}} of the cap's head frames (ring cut by the head ellipsoid mask)."""
    hd = os.path.join(cache, 'head')
    mp = os.path.join(hd, 'meta.json')
    if not os.path.exists(mp):
        log.append('MISSING head renders')
        return {}
    meta = json.load(open(mp))
    out = {}
    for name in meta['frames']:
        mpath = os.path.join(hd, name, 'head.none.png')
        if not os.path.exists(mpath):
            log.append(f'MISSING head frame {name}')
            continue
        mask = load(mpath)[..., 3]
        for layer in meta['layers']:
            if layer == 'head.none':
                continue
            p = os.path.join(hd, name, layer + '.png')
            if not os.path.exists(p):
                log.append(f'MISSING head layer {name}/{layer}')
                continue
            img = load(p)
            if img[..., 3].max() <= 2 / 255:
                continue
            res = tpk.process(img, fx.layer_kind(layer), mask)
            if res[..., 3].max() <= 2 / 255:
                continue
            out.setdefault(layer, {})[name] = to_u8(res)
    return out


# (texture memory, road page <= 3.5 MiB) road-anim frames of the depot crew's own (v4) garments that live on the hub
# page.  Everything a courier wears (top_gb_jacket, the cap, scarf, trousers, boots) and the dockhand's carry_parcel
# outside at the docks (parka + vest + cap) stay on 'road'.  The packer's sweater: the packer works at the packing
# table and never delivers; the parka at the door (ring_doorbell / hand_parcel): parka wearers are the depot crew
# (picker, dockhand), who deliver nothing.  pageNeeded(person, anim) is per person: their doorstep anims ask for 'hub'
# (and fall back to talk / idle without it), a courier never needs it.
ROUTE_HUB = {'top_sweater': None, 'top_parka': ('ring_doorbell', 'hand_parcel')}


def route_page(layer, anim, pg):
    if pg == 'road' and anim in ga.ANIMS5:
        pn = layer.split('.')[0]
        if pn in ROUTE_HUB and (ROUTE_HUB[pn] is None or anim in ROUTE_HUB[pn]):
            return 'hub'
    return pg


def collect(cache, base, log):
    """{page: {layer@base: {frame: u8}}} + meta5 for one render base."""
    bd = os.path.join(cache, 'body', base)
    idx = json.load(open(os.path.join(bd, 'index.json')))
    meta = json.load(open(os.path.join(bd, 'meta5.json')))
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
        pg = route_page(layer, fr.rsplit('_', 2)[0], pg)
        pages[pg].setdefault(f'{layer}@{base}', {})[fr] = img
    for a in ga.ORDER5:
        info = ga.ANIMS5[a]
        pg = ga.PAGE_OF5[a]
        cover = set(gpr.cover_parts(a, base))
        items = set(ga.ANIM_ITEMS.get(a, []))
        for d in info['dirs']:
            for i in range(info['frames']):
                fr = f'{a}_{d}_{i}'
                k = ga.KEYS5[a][i]
                tk = ga.TORSO5[a][k]
                ltk = LOWER_OF.get(tk, tk)
                for layer, img in torso.get((tk, d), {}).items():
                    if layer.split('.')[0] not in cover or layer.split('.')[0].startswith(('bot_', 'shoe_')):
                        continue
                    put(pg, layer, fr, img)
                lower = walk.get((a, d, i), {}) if a in ga.LOWER5 else torso.get((ltk, d), {})
                for layer, img in lower.items():
                    if layer.split('.')[0] in cover and layer.split('.')[0].startswith(('bot_', 'shoe_')):
                        put(pg, layer, fr, img)
                for layer, img in act.get((a, d, k), {}).items():
                    pn = layer.split('.')[0]
                    if layer in LIMBS or pn in cover or pn in items:
                        put(pg, layer, fr, img)
    for (a, d, i), lays in old.items():
        for layer, img in lays.items():
            pn = layer.split('.')[0]
            if pn in gpr.old_cast(base) and a in gpr.old_cast(base)[pn]:
                put('road', layer, f'{a}_{d}_{i}', img)
    return pages, meta


# --------------------------------------------------------------------------- manifest

def nested(flat, anims=None):
    out = {}
    for a in anims or ga.ORDER5:
        info = ga.ANIMS5[a]
        out[a] = {d: [flat.get(f'{a}_{d}_{i}') for i in range(info['frames'])] for d in info['dirs']}
    return out


def scaled_head(m, sx):
    return {k: [int(round(v[0] * sx)), int(round(v[1]))] for k, v in m['headOffsetF'].items()}


def pts_table(m, key, anims, sx, quad=False):
    """{anim: {dir: [point | None per frame]}}; x scaled by sx (round bases draw the slim frames stretched);
    quad: [x, y, x2, y2] (both x scaled)."""
    out = {}
    for a in anims:
        info = ga.ANIMS5[a]
        out[a] = {}
        for d in info['dirs']:
            row = []
            for i in range(info['frames']):
                v = m[key].get(f'{a}_{d}_{i}')
                if v is None:
                    row.append(None)
                elif quad:
                    row.append([round(v[0] * sx, 1), v[1], round(v[2] * sx, 1), v[3]])
                else:
                    row.append([round(v[0] * sx, 1), v[1]])
            out[a][d] = row
    return out


def ground_speed(m, sx, anim='carry_parcel'):
    """{anim: {dir: px/s}}: how fast the PLANTED foot slides back at the anim fps (move the sprite at that speed, or
    play the anim at fps * speed / groundSpeed)."""
    out = {anim: {}}
    feet = m.get('feet', {})
    fps = ga.ANIMS5[anim]['fps']
    for d in ga.ANIMS5[anim]['dirs']:
        ux, uy = m['fwd'][d]
        ux *= sx
        n = 8
        sp = []
        for i in range(n):
            f0, f1 = feet[f'{anim}_{d}_{i}'], feet[f'{anim}_{d}_{(i + 1) % n}']
            best = None
            for j in (0, 1):
                dx, dy = (f1[j][0] - f0[j][0]) * sx, f1[j][1] - f0[j][1]
                nrm = (ux * ux + uy * uy) ** 0.5 or 1.0
                along = (dx * ux + dy * uy) / nrm
                if along < 0 and (best is None or max(f0[j][2], f1[j][2]) < best[0]):
                    best = (max(f0[j][2], f1[j][2]), -along)
            if best is not None and best[0] < 0.12:
                sp.append(best[1])
        out[anim][d] = round(sum(sp) / len(sp) * fps, 1) if sp else None
    return out


def part_entry5(P, framed, all_anims):
    e = tpk.part_entry(P)
    for s, sd in P.subs.items():
        for k in ('zfrontFollow', 'onlyAnims', 'noAnims', 'followDz'):
            if sd.get(k):
                e['subs'][s][k] = sd[k]
    tags = set(P.tags)
    if 'anim_item' in tags:
        e['anims'] = list(P.only_anims)
    elif P.space == 'body':
        e['anims'] = [a for a in all_anims if a in framed]
    return e


def _sprite_rgba(man_path, sprite):
    m = json.load(open(man_path, encoding='utf-8'))
    S = m['sprites']
    F = S.get(sprite)
    if not F:
        return None, None
    at = {a['key']: a for a in m['atlases']}[F['atlas']]
    js = json.load(open(os.path.join(GAME, 'assets', at['json'])))
    fr = js['frames']
    f = fr[F['frame']] if isinstance(fr, dict) else [x for x in fr if x['filename'] == F['frame']][0]
    img = np.asarray(Image.open(os.path.join(GAME, 'assets', at['png'])).convert('RGBA'))
    r, ss = f['frame'], f['spriteSourceSize']
    W, H = f['sourceSize']['w'], f['sourceSize']['h']
    full = np.zeros((H, W, 4), np.uint8)
    full[ss['y']:ss['y'] + r['h'], ss['x']:ss['x'] + r['w']] = img[r['y']:r['y'] + r['h'], r['x']:r['x'] + r['w']]
    return m, full


MIRROR_D = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}


def hub_block(metas):
    """The logistics centre's counter / packing table / conveyor as the clerk and packers see them (assets/logistics
    logistics_center staffPoints 0..2, facing SW = mirrored SE, band 'mid', drawn under interior_front): the opaque
    height of interior_front in a 12 px column in front of each point, and the lift that puts the modelled work
    height (counter 0.30 m + parcel / box top 0.40 m) onto it."""
    mp = os.path.join(GAME, 'assets', 'logistics', 'manifest.json')
    out = {'workHeightsM': {'counterTop': ga.COUNTER_TOP, 'parcelOnCounter': ga.PARCEL_ON_COUNTER,
                            'boxTop': ga.BOX_TOP, 'shelf': ga.SHELF, 'tote': ga.TOTE},
           'rule': 'liftPx = frontTopPx - parcelBottomPx + 2 (rounded up): draw the clerk / packer liftPx higher '
                   '(sprite y - liftPx, depth unchanged), standing on a hidden step behind the counter / table, so the '
                   'parcel the game draws at bases.boxPoint.scan / .tape_box (bottom = [bx, by]) stands 2 px behind '
                   'the front edge of the real counter / table top, under the scanner beam / the tape roller.  Keep '
                   'the lift for every anim played there (scan, talk, idle, tape_box ...).  Pickers (racks) and the '
                   'dockhand need no lift.  The box is gb_parcel_m at 0.20 m (scale it so topPx = 0.20 x 55.4 px).  '
                   'places[staffN].anim = what to play there.',
           'places': {}}
    if not os.path.exists(mp):
        return out
    m, full = _sprite_rgba(mp, 'logistics_center_interior_front')
    if full is None:
        return out
    B = m['sprites']['logistics_center']
    H, W = full.shape[:2]
    ax, ay = B['anchor'][0] * W, B['anchor'][1] * H
    vpx = 64.0 * math.cos(math.radians(30.0))            # px per metre of height (2:1 iso, PPU 64)
    # the parcel's bottom above the feet on screen (px) in the staff dir (SW = mirrored SE): on the counter (clerk,
    # scan) / the packing table (packer, tape_box) - the model puts it in front of the worker, lower on screen
    m0 = metas.get('adult_slim', {})

    def bottom_px(role, d):
        anim = 'scan' if role == 'clerk' else 'tape_box'
        v = m0.get('box', {}).get(f'{anim}_{MIRROR_D.get(d, d)}_0')
        if v is None:                                     # no meta: the modelled work height under the feet
            return (ga.COUNTER_TOP if role == 'clerk' else ga.BOX_TOP - BOX_M) * vpx
        return -v[3]
    for k, (p, role, d) in enumerate(zip(B['staffPoints'], B['staffRoles'], B['staffDirs'])):
        if role not in ('clerk', 'packer'):
            continue
        x, y = int(round(ax + p[0])), int(round(ay + p[1]))
        tops = []
        for dx in range(-12, 1, 2):                       # in front of the worker (SW = screen left)
            col = full[:y + 1, x + dx, 3]
            h = 0
            while h < y and col[y - h] < 30 and h < 40:   # (a gap under the near edge, if any)
                h += 1
            while h < y and col[y - h] >= 200:
                h += 1
            tops.append(h)
        top = int(np.median(tops))
        pb = bottom_px(role, d)
        pl = {'role': role, 'point': p, 'dir': d, 'anim': 'scan' if role == 'clerk' else 'tape_box',
              'frontTopPx': top, 'frontTopRangePx': [int(min(tops)), int(max(tops))], 'parcelBottomPx': round(pb, 1),
              'liftPx': max(0, int(math.ceil(top - pb + 2)))}
        out['places'][f'staff{k}'] = pl
    return out


def build_manifest(metas, where, atlases, page_info, v4parts, anims_of, mark_src):
    tl = ga.timeline5()
    timeline = {a: {d: [tl[(a, d, i)] for i in range(ga.ANIMS5[a]['frames'])] for d in ga.ANIMS5[a]['dirs']}
                for a in ga.ORDER5}
    bases = {}
    for base in gpr.BASES5:
        src, sx = tpr.ROUND_FROM.get(base, (base, 1.0))
        if src not in metas:
            continue
        m = metas[src]
        cover = {a: gpr.cover_parts(a, src) for a in ga.ORDER5}
        parts = sorted(p for p in gp.NEW_WEAR5 if p in cover['scan'])
        e = {'headOffset': nested(scaled_head(m, sx)), 'parts': parts, 'gbCover': cover,
             'boxPoint': pts_table(m, 'box', ['carry_parcel', 'ring_doorbell', 'scan', 'tape_box'], sx, quad=True),
             'handPoint': pts_table(m, 'hand', ['hand_parcel', 'sort_parcel'], sx),
             'bellPoint': pts_table(m, 'bell', ['ring_doorbell'], sx),
             'beamPoint': pts_table(m, 'beam', ['scan'], sx, quad=True),
             'tapePoint': pts_table(m, 'tape', ['tape_box'], sx),
             'groundSpeed': ground_speed(m, sx)}
        bases[base] = e
    # frameAtlas: ONLY the layers of the new parts (nobody else can own them) - their road frames (the page holding
    # most of them); the hub anims' frames of every layer route through frameAtlasExt -> frameAtlasAnim
    own = set(gp.ALL_NEW5)
    frame_atlas = {}
    for pg in PAGES:
        for L, key in sorted(where.get(pg, {}).items()):
            if L.split('.')[0].split('@')[0] in own and L not in frame_atlas and pg == 'road':
                frame_atlas[L] = key
    for pg in PAGES:
        for L, key in sorted(where.get(pg, {}).items()):
            if L.split('.')[0].split('@')[0] in own and L not in frame_atlas:
                frame_atlas[L] = key
    ext_list = []
    for pg in PAGES:
        key = ATLAS[pg]
        lay = anims_of.get(pg, {})
        per = {}
        for L in sorted(lay):
            if '@' not in L:                          # head layers (the cap): frameAtlas
                continue
            for a in lay[L]:
                if a not in ga.ANIMS5:
                    continue                          # the new parts' v4-anim frames: frameAtlas (road)
                if frame_atlas.get(L) == key:
                    continue
                per.setdefault(a, {})[L] = key
        groups_ = {}
        for a in sorted(per, key=lambda x: ga.ORDER5.index(x)):
            groups_.setdefault(json.dumps(per[a], sort_keys=True), []).append(a)
        for mp_js, anims in groups_.items():
            ext_list.append({'anims': anims, 'page': pg, 'map': json.loads(mp_js)})
    # parts
    all_anims = [a for a in list(ta.ORDER) + list(ta2.ORDER2) + list(ga.ORDER5) if a != 'carry_walk']
    framed = {}
    for pn in gp.NEW_WEAR5:
        fa = set()
        for a in ga.ORDER5:
            if any(pn in gpr.cover_parts(a, b) for b in gpr.RENDER_BASES):
                fa.add(a)
        for b in gpr.RENDER_BASES:
            fa |= set(gpr.old_cast(b).get(pn, []))
        framed[pn] = fa
    parts = {pn: part_entry5(tp.PARTS[pn], framed.get(pn, set()), all_anims) for pn in gp.ALL_NEW5}
    for pn in gp.NEW_WEAR5:
        parts[pn]['ages'] = ['adult']
    # tints for every fixed preset colour on the slots it tints
    tint_table = {}
    for pr in gpr.PRESETS5.values():
        for slot, v in pr.get('colors', {}).items():
            cols = v if isinstance(v, list) else gpr.PALETTES5.get(v, [])
            ref = tpr.TINT_REF.get(slot, tpr.TINT_REF['default'])
            for c in cols:
                if isinstance(c, str) and c.startswith('#'):
                    tint_table.setdefault(slot, {})[c] = tc.tint_hex(c, ref, tpr.TINT_MODEL, slot)
    groups = {pg: dict(inf) for pg, inf in page_info.items()}
    G = {
        'version': 1, 'fragment': 'geumbangfolk', 'extends': 'townfolk', 'requires': ['townfolk'],
        'mergeAfter': ['townfolk2', 'beachfolk', 'cityfolk', 'officefolk'],
        'anims': {a: dict(ga.ANIMS5[a]) for a in ga.ORDER5},
        'timeline': timeline,
        'headPoses': {},
        'headPoseFallback': {'down': 'nod'},
        'faceExprs': {}, 'exprBrow': {},
        'bases': bases,
        'parts': parts,
        'z': {f'gbf_{k}': v for k, v in gp.Z5.items()},
        'tintRef': {}, 'tintModel': {'slotS': {}},
        'tintTable': tint_table,
        'palettes': dict(gpr.PALETTES5),
        'generator': {'presets': {k: gpr.PRESETS5[k] for k in gpr.PRESET_ORDER}, 'slotPalette': {}, 'exclude': [],
                      'extraSlots': []},
        'frameAtlas': frame_atlas,
        'frameAtlasExt': ext_list,
        'animItems': {a: list(v) for a, v in ga.ANIM_ITEMS.items()},
        'animFallback': dict(gpr.ANIM_FALLBACK5),
        'geumbangfolkAnims': list(ga.ORDER5),
        'gbParts': list(gp.ALL_NEW5),
        'gbPages': {'groups': groups, 'resident': 'road',
                    'hubRouted': {pn: list(ROUTE_HUB[pn] or ga.PAGES5['road']) for pn in sorted(ROUTE_HUB)},
                    'scenes': {'road': ['road'], 'town': ['road'], 'village': ['road'], 'depot': ['road', 'hub']},
                    'notes': 'One atlas per page.  "road" (gbPages.resident) stays resident wherever a 금방 courier or '
                             'crew member can be seen: carry_parcel, ring_doorbell, hand_parcel, the cap on every head '
                             'frame and the jacket / vest in idle / walk / talk / wave / happy.  "hub" holds scan, '
                             'sort_parcel and tape_box: load it while the depot (금방 물류센터) is revealed and drop it '
                             'afterwards.  It also holds the road-anim frames of the depot crew\'s own v4 garments '
                             '(texture memory): top_sweater in carry_parcel / ring_doorbell / hand_parcel (the packer) '
                             'and top_parka in ring_doorbell / hand_parcel (picker, dockhand at the door); a courier '
                             '(jacket, cap, scarf) and the dockhand\'s carry_parcel at the docks (parka + vest + cap) '
                             'never need it.  Ask pageNeeded(person, anim) (per person) inside the sprite\'s has() '
                             'predicate: a depot-crew doorstep anim without "hub" falls back (talk / idle).'},
        'crew': {k: {'label': gpr.PRESETS5[k]['label'], 'names': gpr.CREW_NAMES[k], 'signature': gpr.SIGNATURE[k]}
                 for k in gpr.PRESET_ORDER},
        'brand': dict(gpr.BRAND, mark='금방이 (gold disc + goldDark rim + cream sticker border, a face-on cream parcel '
                                      'with navy dot eyes, pink cheeks, an "o" mouth and a cream sparkle above; '
                                      'symmetric, no letters)', markSource=mark_src,
                      notes='Untinted (fixed) layers: the jacket trim / cuffs / marks, the vest stripes / mark, the '
                            'cap mark and every held item.  Tinted: jacket body (top: gold / goldDark), vest (acc: '
                            'gold), cap crown (hat: navy), cap band + brim + button (hat2: gold).'),
        'hub': hub_block(metas),
        'items': {
            'carry_parcel': 'held_parcel_gb (main): the medium 금방 parcel hugged at the belly.  With {noItems:true} '
                            'the game draws its own gb_parcel_s/m/l (assets/geumbang) at bases[b].boxPoint.carry_parcel'
                            '[dir][i] = [cx, cy, bx, by] (centre and bottom-centre, px from the anchor; mirrored dirs '
                            'negate x) at depth +0.0045 in S / SE / E and -0.0001 in NE / N.  Move at bases[b]'
                            '.groundSpeed.carry_parcel[dir] px/s, or play at timeScale = clamp(speed / groundSpeed, '
                            '0.8, 1.8) so the feet do not skate.',
            'ring_doorbell': 'held_parcel_gb (main) tucked under the LEFT arm (boxPoint.ring_doorbell, same depth rule); '
                             'the right mitten presses the bell on impactFrame 2 (띵) and 3 (동): bellPoint.ring_doorbell'
                             '[dir][i] = the mitten tip -> sfx_gb_doorbell + fx_gb_bell there.  Plays once and holds '
                             'the last frame (waiting at the door), then onDone.',
            'hand_parcel': 'no item is drawn: fly the real gb_parcel_* from handPoint.hand_parcel[dir][i] (between the '
                           'palms; draw it there on frames 0-2, it leaves on frame 3), frame 5 = the little bow; '
                           'plays once, holds the bow, then onDone (-> wave).',
            'scan': 'held_scanner (right fist); beamPoint.scan[dir][i] = [wx, wy, tx, ty]: the scanner window and the '
                    'beam target (the parcel top on the counter).  impactFrame 2 = 삑 (sfx_gb_scan + a short beam / '
                    'glint from window to target).  The game draws the parcel lying on the counter (gb_parcel_s, '
                    '0.14 m: scale = 0.14 x 55.4 / topPx) with its bottom-centre at bases.boxPoint.scan[dir][i] = '
                    '[cx, cy, bx, by] (top = the beam target) at the clerk\'s depth + 0.005 (over the body, under '
                    'the head / arms / scanner).  The clerk works behind the counter: lift per hub.places.',
            'sort_parcel': 'held_parcel_gb (small) between the mittens on frames 1-4 (taken from the shelf on 1, dropped '
                           'into the tote on 4: the rack stack drops one step at frame 1); handPoint.sort_parcel[dir][i] '
                           '= between the mittens.  Shelf height per dir (NE reaches up, SE / E chest high): hub.'
                           'workHeightsM.shelf.',
            'tape_box': 'held_tapegun (right fist), the left mitten holds the flaps; the game draws the box '
                        '(gb_parcel_m at 0.20 m: scale = 0.20 x 55.4 / topPx) with its bottom-centre at '
                        'bases.boxPoint.tape_box[dir][i] = [cx, cy, bx, by] (still; top centre = cx, cy) at the '
                        'packer\'s depth + 0.005 (over the body, under the head / arms / tape gun); tapePoint.tape_box'
                        '[dir][i] = the roller running along the box top.  impactFrame 3 = 찌익 + the cutting flick '
                        '(sfx_gb_tape).  Lift per hub.places.',
            'gbOthers': 'noItems skips every anim item (animItems); the parcel / scanner / tape gun frames are drawn '
                      'automatically otherwise.'},
        'merge': MERGE_RULES,
        'notes': ('Partial townfolk block (CONTRACT_GEUMBANG AP): the 금방 crew.  Merge after townfolk (+ townfolk2 / '
                  'beachfolk / cityfolk / officefolk when present) with tools/geumbangfolk_compose.js '
                  'mergeGeumbangfolk() (rules in "merge"), then compose exactly like tools/geumbangfolk_compose.py.'),
    }
    return {'version': 1,
            'generator': 'tools/blender/gbf_render.py + gbf_pack.py (Blender 5.2 Cycles, bl_common camera / light, '
                         'townfolk tf_* pipeline, officefolk acting technique)',
            'conventions': {'ppu': 64, 'iso': '2:1', 'frameSize': [128, 128], 'anchor': [0.5, 0.8125],
                            'frameNames': '{layer}@{base}/{anim}_{dir}_{i}  |  {layer}/{headPose}_{dir} (cap)',
                            'mirror': {'SW': 'SE', 'W': 'E', 'NW': 'NE'}},
            'notes': ('Geumbangfolk fragment (CONTRACT_GEUMBANG AP): 금방 uniforms (gold puffer jacket, work vest, '
                      'ear-flap cap) and six courier / warehouse anims (carry_parcel, ring_doorbell, hand_parcel, scan, '
                      'sort_parcel, tape_box) with 7 crew presets.  Atlas JSONs are tfatlas v1 like assets/townfolk.  '
                      'Block "geumbangfolk" merges after assets/townfolk (townfolk2 / beachfolk / cityfolk / '
                      'officefolk optional) - see geumbangfolk.merge.'),
            'atlases': atlases, 'images': [], 'sprites': {}, 'geumbangfolk': G}


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
    v4parts = gpr.v4_base_parts()
    metas, by_page = {}, {pg: {} for pg in PAGES}
    for base in gpr.RENDER_BASES:
        if not os.path.exists(os.path.join(cache, 'body', base, 'index.json')) or \
                not os.path.exists(os.path.join(cache, 'body', base, 'meta5.json')):
            log.append(f'MISSING renders for {base}')
            continue
        print(f'[{base}] collecting', flush=True)
        pages, meta = collect(cache, base, log)
        metas[base] = meta
        for pg, lays in pages.items():
            by_page[pg].update(lays)
    head = collect_head(cache, log)
    for layer, frs in head.items():
        by_page['road'][layer] = frs
    missing = [l for l in log if l.startswith('MISSING')]
    if missing or len(metas) != len(gpr.RENDER_BASES):
        for l in missing[:20]:
            print('ERROR', l)
        raise SystemExit('gbf_pack: renders missing - nothing written (render first: gbf_render.py)')
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.startswith('gbf_') and (f.endswith('.png') or f.endswith('.json')):
            os.remove(os.path.join(out, f))
    atlases, where, page_info = [], {}, {}
    for pg in PAGES:
        key = ATLAS[pg]
        entry, w, st = build_page(key, by_page[pg], colors, dither, out, qlog)
        atlases.append(entry)
        where[pg] = w
        page_info[pg] = {'anims': list(ga.PAGES5[pg]), 'atlases': [key], 'mib': entry['mib'],
                         'budgetMiB': BUDGET_MIB[pg], 'size': entry['size']}
        if pg == 'road':
            page_info[pg]['also'] = 'hat_gb_cap (20 head frames); top_gb_jacket / det_gb_vest in idle / walk / talk / ' \
                                    'wave / happy'
        print(f'  {key}: {st["size"][0]}x{st["size"][1]} = {entry["mib"]:.2f} MiB (budget {BUDGET_MIB[pg]})  '
              f'{st["frames"]} rects (+{st["aliases"]} aliases)  {st["bytes"] / 1024:.0f} KB  anchors {st["anchored"]}',
              flush=True)
    anims_of = {pg: {L: {fr.rsplit('_', 2)[0] for fr in frs} for L, frs in by_page[pg].items()} for pg in PAGES}
    src = 'unknown'
    sp = os.path.join(cache, 'mark', 'source.txt')
    if os.path.exists(sp):
        src = open(sp).read().strip()
    man = build_manifest(metas, where, atlases, page_info, v4parts, anims_of, src)
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
