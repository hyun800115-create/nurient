"""
gbf_check.py - validate assets/geumbangfolk (CONTRACT_GEUMBANG AP + AS) together with assets/townfolk (+ townfolk2 /
beachfolk / cityfolk / officefolk when present).  Plain python3 (numpy + Pillow).

    python3 tools/blender/gbf_check.py [--assets DIR] [--dump cases.json] [--fragments v43|bare|all] [--n 500]

Checks
  files      5 files (2 atlases x png/json + manifest), tfatlas v1 128 x 128, <= 2048 px, png size = json size, rects
             in bounds, no frame name shared with another fragment, atlas keys unique, paths under geumbangfolk/.
  block      fragment header (version / fragment / extends / requires / mergeAfter), frame size + anchor.
  merge      bare (townfolk + geumbangfolk), v43 (townfolk + officefolk + geumbangfolk) and all (every fragment
             present): no redefinition, every packed frame resolves to its atlas (frameAtlas / frameAtlasAnim /
             frameAtlasPose), headPoseFallback applied only without townfolk2; merging geumbangfolk changes nothing that
             was there (old keys, bases, tints, generator output of 4000 seeded people incl. every other preset, old-anim
             draw lists + atlases of 1500 random frames, canPlay).
  anims      the 6 anims: frames / fps / repeat / dirs / impactFrame / page / items per the contract table; timelines
             with the contract head pose (soc NE / N -> loco; down -> nod without townfolk2); every face + brow of every
             face set exists for the poses and dirs used.
  bases      adult_slim / adult_round: headOffset for every frame, gbCover (= the contract cover), boxPoint / handPoint /
             bellPoint / beamPoint / tapePoint / groundSpeed for every frame; points inside the frame.
  frames     limb frames for every frame (far-side limbs hidden allowed), every cover part has frames somewhere in every
             anim, anim items only in their anims (parcel main in carry_parcel / ring_doorbell, small on sort_parcel
             frames 1-4 only), the cap on all 20 head frames, the jacket / vest in idle / walk / talk / wave / happy.
  parts      6 new parts (family, space, tints, anims == framed anims, ages).
  presets    7 presets: bases + wardrobe per the contract, each keeps PROMISE (6 crew anims + idle / walk / talk / wave /
             happy) for 60 people in every merge; animFallback == contract; pickAnim never returns a missing anim.
  points     every point lies on what it names (box on the parcel, hand between the mittens, bell on the right
             mitten, beam window on the scanner, tape roller on the tape gun), adult_slim + adult_round.
  brand      (AS, gb_check rules for this set) navy <= 15 % of every preset sprite's opaque px; the two largest colour
             areas of every preset sprite are not BOTH within dE2000 15 of a real brand's primary pair (plan 7.4); the
             mark is mirror-safe (texture vs own mirror <= 6 %, the back / front mark frames in S / N vs their own
             mirror <= 6 %); no letters (none drawn); crew distinct from depot_worker at 0.3 scale.
  budgets    road <= 3.5 MiB, hub <= 2.5 MiB (RGBA W x H x 4), payload.
  hub        logistics clerk / packer lift (hub.places) puts the scanner beam target / tape roller on the real
             counter / table top.
  --dump     python draw lists for tools/test/geumbangfolk_phaser.mjs --parity (500 seeded people: the 7 presets +
             random townsfolk + officefolk staff when merged, 4 anims each -> pickAnim, dir incl. mirrors, frame,
             face, noItems, atlas per layer, canPlay of the 6 crew anims, points, pageNeeded).
"""
import colorsys
import json
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from townfolk_compose import iter_tf_frames, srgb_to_lin, lin_to_srgb, hex_rgb, MIRROR      # noqa: E402
import townfolk_compose as tc                                                               # noqa: E402
import townfolk2_compose as tc2                                                             # noqa: E402
import cityfolk_compose as cc                                                               # noqa: E402
import officefolk_compose as ofc                                                            # noqa: E402
import geumbangfolk_compose as gbc                                                          # noqa: E402

D3 = ['S', 'SE', 'E']
LOCO = ['S', 'SE', 'E', 'NE', 'N']
# anim: (frames, fps, repeat, dirs, head pose, items, page, impactFrame)
CONTRACT = {
    'carry_parcel': (8, 12, -1, LOCO, 'loco', ['held_parcel_gb'], 'road', None),
    'ring_doorbell': (6, 8, 0, ['NE', 'N', 'E'], 'soc', ['held_parcel_gb'], 'road', 2),
    'hand_parcel': (6, 9, 0, ['NE', 'E', 'SE'], 'soc', [], 'road', None),
    'scan': (4, 6, -1, D3, 'down', ['held_scanner'], 'hub', 2),
    'sort_parcel': (6, 8, -1, ['SE', 'E', 'NE'], 'down', ['held_parcel_gb'], 'hub', None),
    'tape_box': (6, 10, -1, D3, 'down', ['held_tapegun'], 'hub', 3),
}
# frames whose head pose differs from the anim's on purpose (hand_parcel f5 = the bow: nod; scan f3 = the glance: soc)
HP_EXCEPT = {('hand_parcel', 5): 'nod', ('scan', 3): 'soc'}
PAGE_BUDGET = {'road': 3.5, 'hub': 2.5}
ATLAS_KEYS = ['gbf_road_0', 'gbf_hub_0']
BASES = ['adult_slim', 'adult_round']
RENDER = ['adult_slim']
FALLBACK = {'carry_parcel': ['walk'], 'ring_doorbell': ['talk', 'idle'], 'hand_parcel': ['talk', 'idle'],
            'scan': ['idle'], 'sort_parcel': ['idle'], 'tape_box': ['idle']}
COVER = ['top_gb_jacket', 'top_parka', 'top_sweater', 'det_gb_vest', 'bot_pants', 'shoe_boots', 'acc_scarf']
NEW_PARTS = {'top_gb_jacket': ('top', 'body'), 'det_gb_vest': ('job', 'body'), 'hat_gb_cap': ('hat', 'head'),
             'held_parcel_gb': ('held', 'body'), 'held_scanner': ('held', 'body'), 'held_tapegun': ('held', 'body')}
PRESETS = {   # bases, must wear (contract)
    'gb_driver': (['adult_slim', 'adult_round'], ['top_gb_jacket', 'hat_gb_cap', 'bot_pants', 'shoe_boots']),
    'gb_picker': (['adult_slim', 'adult_round'], ['top_parka', 'det_gb_vest', 'hat_beanie']),
    'gb_packer': (['adult_slim', 'adult_round'], ['top_sweater', 'det_gb_vest', 'hat_beanie']),
    'gb_sorter': (['adult_slim', 'adult_round'], ['top_parka', 'det_gb_vest', 'hat_gb_cap']),
    'gb_dispatcher': (['adult_slim', 'adult_round'], ['top_gb_jacket', 'acc_glasses']),
    'gb_rider': (['adult_slim', 'adult_round'], ['top_gb_jacket', 'acc_scarf', 'hat_beanie']),
    'gb_night': (['adult_slim', 'adult_round'], ['top_gb_jacket', 'hat_gb_cap', 'bot_pants', 'shoe_boots']),
}
PRESET_COLOURS = {    # contract colours (slot -> allowed); hat = charcoal where the brand rule (navy <= 15 %) overrides the
    # contract's navy beanie / cap dome: a navy dome is 30-40 % of a chibi sprite (the cap itself is fixed-colour)
    'gb_driver': {'top': {'#F2B33D'}, 'hat': {'#3B3F52'}, 'hat2': {'#F2B33D'}, 'bottom': {'#3B3F52'}},
    'gb_picker': {'top': {'#F4EDE0'}, 'acc': {'#F2B33D'}, 'hat': {'#F2B33D'}},
    'gb_packer': {'top': {'#E3D3B4'}, 'acc': {'#F2B33D'}, 'hat': {'#3B3F52'}},
    'gb_sorter': {'acc': {'#F2B33D'}, 'hat': {'#3B3F52'}},
    'gb_dispatcher': {'top': {'#F2B33D'}},
    'gb_rider': {'top': {'#F2B33D'}, 'acc': {'#F4EDE0'}, 'acc2': {'#2B4F7E'}, 'hat': {'#F2B33D'}},
    'gb_night': {'top': {'#D9962A'}, 'hat': {'#3B3F52'}, 'bottom': {'#3B3F52'}},
}
GB_ANIMS = list(CONTRACT)
V4 = ['idle', 'walk', 'talk', 'wave', 'happy']
HEAD_FRAMES = [f'{hp}_{d}' for hp, ds in (('loco', LOCO), ('soc', D3), ('nod', D3), ('up', D3), ('tilt', D3),
                                          ('down', D3)) for d in ds]
NAVY = '#2B4F7E'
BRAND_PAIRS = {   # plan 7.4: a sprite fails when its two largest colour areas are both within dE 15 of a pair
    'UPS': ('#351C15', '#FFB500'), 'DHL': ('#FFCC00', '#D40511'), 'Coupang': ('#E52528', '#346AFF'),
    'Baemin': ('#2AC1BC', '#FFFFFF'), 'Kurly': ('#5F0080', '#FFFFFF'), 'KoreaPost': ('#E60012', '#F39800'),
    'Yamato': ('#FFC20E', '#000000'), 'IKEA-like': ('#FFDA1A', '#0058A3')}
# limbs the body hides in whole frames (looked at): the far mitten / arm in side views, the hands in front of the
# chest from behind
HIDDEN_OK_DIRS = {'NE', 'N'}


def load_frames(assets, man, err, tag):
    from PIL import Image
    frames = {}
    for at in man['atlases']:
        for k in ('png', 'json'):
            if not os.path.exists(os.path.join(assets, at[k])):
                err.append(f'{tag}: missing {at[k]}')
                return frames
        js = json.load(open(os.path.join(assets, at['json'])))
        w, h = js['size']
        if js.get('tfatlas') != 1 or js.get('frameSize') != [128, 128]:
            err.append(f'{at["key"]}: not a tfatlas v1 128x128 json')
        if w > 2048 or h > 2048:
            err.append(f'{at["key"]} is {w}x{h} (> 2048)')
        if Image.open(os.path.join(assets, at['png'])).size != (w, h):
            err.append(f'{at["key"]}: png size differs from json')
        for n, (x, y, fw, fh, dx, dy) in iter_tf_frames(js):
            if n in frames:
                err.append(f'frame {n} in two atlases')
            frames[n] = (at['key'], (x, y, fw, fh, dx, dy))
            if x < 0 or y < 0 or x + fw > w or y + fh > h or dx < 0 or dy < 0 or dx + fw > 128 or dy + fh > 128:
                err.append(f'{n}: rect out of bounds')
    return frames


def sub_dict(old, new, path, err, allow=()):
    """every key/value of `old` is unchanged in `new` (dicts recursively; lists may only grow at `allow` paths)"""
    if isinstance(old, dict) and isinstance(new, dict):
        for k, v in old.items():
            p = f'{path}.{k}' if path else str(k)
            if k not in new:
                err.append(f'merging geumbangfolk removed {p}')
                continue
            sub_dict(v, new[k], p, err, allow)
        return
    if isinstance(old, list) and isinstance(new, list) and any(path.endswith(a) for a in allow):
        if [x for x in old if x not in new]:
            err.append(f'merging geumbangfolk dropped items of {path}')
        return
    if old != new:
        err.append(f'merging geumbangfolk changed {path}')


# --------------------------------------------------------------------------- colour science (brand checks)

def srgb_to_lab(rgb):
    """rgb: (..., 3) floats 0..1 sRGB -> CIE Lab (D65)."""
    import numpy as np
    c = np.asarray(rgb, np.float64)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ M.T
    xyz = xyz / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > (6 / 29) ** 3, np.cbrt(xyz), xyz / (3 * (6 / 29) ** 2) + 4 / 29)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], -1)


def de2000(lab1, lab2):
    import numpy as np
    L1, a1, b1 = [np.asarray(v, np.float64) for v in (lab1[..., 0], lab1[..., 1], lab1[..., 2])]
    L2, a2, b2 = [np.asarray(v, np.float64) for v in (lab2[..., 0], lab2[..., 1], lab2[..., 2])]
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cm = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp = L2 - L1
    dCp = C2p - C1p
    dh = h2p - h1p
    dh = np.where(C1p * C2p == 0, 0, np.where(dh > 180, dh - 360, np.where(dh < -180, dh + 360, dh)))
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dh / 2))
    Lpm = (L1 + L2) / 2
    Cpm = (C1p + C2p) / 2
    hs = h1p + h2p
    hpm = np.where(C1p * C2p == 0, hs, np.where(np.abs(h1p - h2p) > 180, np.where(hs < 360, (hs + 360) / 2,
                                                                                    (hs - 360) / 2), hs / 2))
    T = (1 - 0.17 * np.cos(np.radians(hpm - 30)) + 0.24 * np.cos(np.radians(2 * hpm)) +
         0.32 * np.cos(np.radians(3 * hpm + 6)) - 0.20 * np.cos(np.radians(4 * hpm - 63)))
    dth = 30 * np.exp(-(((hpm - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lpm - 50) ** 2 / np.sqrt(20 + (Lpm - 50) ** 2)
    Sc = 1 + 0.045 * Cpm
    Sh = 1 + 0.015 * Cpm * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def lab_of(hexc):
    import numpy as np
    return srgb_to_lab(np.array(hex_rgb(hexc)))


def colour_areas(img, k=6):
    """the k largest colour areas of an RGBA image: [(share of opaque px, mean sRGB)] by a coarse Lab clustering"""
    import numpy as np
    a = np.asarray(img).astype(np.float64) / 255.0
    op = a[..., 3] > 0.6
    px = a[..., :3][op]
    if not len(px):
        return []
    lab = srgb_to_lab(px)
    # bin by (L 12, a 12, b 12) cells, merge neighbours greedily
    key = np.floor(lab / np.array([12.0, 12.0, 12.0])).astype(int)
    cells = {}
    for kk, c, p in zip(map(tuple, key), lab, px):
        e = cells.setdefault(kk, [0, np.zeros(3), np.zeros(3)])
        e[0] += 1
        e[1] += c
        e[2] += p
    items = sorted(cells.values(), key=lambda e: -e[0])
    clusters = []
    for n, lsum, psum in items:
        lab_m = lsum / n
        for cl in clusters:
            if float(de2000(lab_m[None], (cl[1] / cl[0])[None])[0]) < 10:
                cl[0] += n
                cl[1] += lsum
                cl[2] += psum
                break
        else:
            clusters.append([n, lsum.copy(), psum.copy()])
    tot = float(len(px))
    clusters.sort(key=lambda c: -c[0])
    return [(c[0] / tot, c[2] / c[0], c[1] / c[0]) for c in clusters[:k]]


def navy_share(img):
    """share of the opaque px (alpha >= 240: baked soft edges are not paint) that are navy PAINT - the same rule as
    tools/blender/gb_check.py (the 금방 vehicles / buildings job): dE2000 < 10 to navy at 0.8 / 1.0 / 1.2 brightness
    AND chroma >= 20 (the grey charcoal / slate is not navy)"""
    import numpy as np
    a = np.asarray(img).astype(np.float64)
    op = a[..., 3] >= 240
    if not op.any():
        return 0.0
    lab = srgb_to_lab(a[..., :3][op] / 255.0)
    nv = hex_rgb(NAVY) * 255.0
    dmin = np.min(np.stack([de2000(lab, np.broadcast_to(srgb_to_lab(np.clip(nv * f, 0, 255)[None] / 255.0)[0],
                                                          lab.shape)) for f in (0.8, 1.0, 1.2)]), 0)
    chroma = np.hypot(lab[:, 1], lab[:, 2])
    return float(((dmin < 10) & (chroma >= 20)).sum()) / float(op.sum())


def mirror_diff(img):
    """fraction of opaque px differing (> 24 levels) from the left-right mirror around the opaque bbox centre"""
    import numpy as np
    a = np.asarray(img).astype(int)
    ys, xs = np.nonzero(a[..., 3] > 128)
    if not len(xs):
        return 0.0
    x0, x1 = xs.min(), xs.max()
    crop = a[:, x0:x1 + 1]
    mir = crop[:, ::-1]
    op = (crop[..., 3] > 128) | (mir[..., 3] > 128)
    diff = (np.abs(crop - mir).max(-1) > 24) & op
    return float(diff.sum()) / max(1, int(op.sum()))


# --------------------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    dump, dump_frags, ncases = None, 'v43', 500
    if '--assets' in args:
        assets = args[args.index('--assets') + 1]
    if '--dump' in args:
        dump = args[args.index('--dump') + 1]
    if '--fragments' in args:
        dump_frags = args[args.index('--fragments') + 1]
    if '--n' in args:
        ncases = int(args[args.index('--n') + 1])
    err, warn, info = [], [], []
    from PIL import Image
    import numpy as np

    # ------------------------------------------------------------------ files + block
    gd = os.path.join(assets, 'geumbangfolk')
    man = json.load(open(os.path.join(gd, 'manifest.json'), encoding='utf-8'))
    F = man.get('geumbangfolk')
    if F is None:
        print('ERROR no geumbangfolk block')
        sys.exit(1)
    files = sorted(os.listdir(gd))
    want = sorted(['manifest.json'] + [f'{k}.{e}' for k in ATLAS_KEYS for e in ('png', 'json')])
    if files != want:
        err.append(f'assets/geumbangfolk holds {files}, want {want}')
    if [a['key'] for a in man['atlases']] != ATLAS_KEYS:
        err.append(f'atlas keys {[a["key"] for a in man["atlases"]]}')
    for a in man['atlases']:
        if not a['png'].startswith('geumbangfolk/') or not a['json'].startswith('geumbangfolk/'):
            err.append(f'{a["key"]}: path not under geumbangfolk/')
    hdr = {k: F.get(k) for k in ('version', 'fragment', 'extends', 'requires', 'mergeAfter')}
    if hdr != {'version': 1, 'fragment': 'geumbangfolk', 'extends': 'townfolk', 'requires': ['townfolk'],
               'mergeAfter': ['townfolk2', 'beachfolk', 'cityfolk', 'officefolk']}:
        err.append(f'block header {hdr}')
    cv = man.get('conventions', {})
    if cv.get('frameSize') != [128, 128] or cv.get('anchor') != [0.5, 0.8125]:
        err.append(f'conventions {cv}')
    rects = load_frames(assets, man, err, 'geumbangfolk')
    fgb = {k: v[0] for k, v in rects.items()}
    info.append(f'geumbangfolk: {len(man["atlases"])} atlases, {len(rects)} frame names, '
                f'{len({(v[0], v[1][:4]) for v in rects.values()})} rects')

    # ------------------------------------------------------------------ fragments + merges
    man1 = json.load(open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8'))
    frames_all = {k: v[0] for k, v in load_frames(assets, man1, err, 'townfolk').items()}
    tf_frames = dict(frames_all)
    keys_seen = {a['key'] for a in man1['atlases']}
    blocks = []
    frag_frames = {}
    for frag in gbc.FRAGMENT_ORDER[:-1]:
        mp = os.path.join(assets, frag, 'manifest.json')
        if not os.path.exists(mp):
            continue
        m = json.load(open(mp, encoding='utf-8'))
        name, block = cc.fragment_block(m)
        fr = {k: v[0] for k, v in load_frames(assets, m, [], frag).items()}
        frag_frames[name] = fr
        for a in m['atlases']:
            keys_seen.add(a['key'])
        frames_all.update(fr)
        blocks.append((name, block))
    for n in fgb:
        if n in frames_all:
            err.append(f'frame {n} also in an earlier fragment')
            break
    for a in man['atlases']:
        if a['key'] in keys_seen:
            err.append(f'atlas key {a["key"]} clashes')
    present = [b[0] for b in blocks]
    info.append('fragments present: townfolk + ' + ' + '.join(present))
    T1 = man1['townfolk']
    merges = {}
    variants = [('bare', [])]
    if 'officefolk' in present:
        variants.append(('v43', [b for b in blocks if b[0] == 'officefolk']))
    variants.append(('all', blocks))
    for tag, bl in variants:
        try:
            M = gbc.merge_geumbangfolk(T1, bl + [('geumbangfolk', F)])
        except Exception as e:                  # noqa: BLE001
            err.append(f'merge {tag}: {e}')
            continue
        merges[tag] = M
        M0 = gbc.merge_geumbangfolk(T1, bl) if bl else cc.merge_fragments(T1, [])
        fr = dict(tf_frames)
        for name, _ in bl:
            fr.update(frag_frames[name])
        fr.update(fgb)
        ovs = set(M.get('overrides', []))
        nbad = 0
        for n, key in fr.items():
            if cc.atlas_of(M, n) != key and n not in ovs:
                nbad += 1
                if nbad <= 5:
                    err.append(f'merge {tag}: atlas lookup of {n} -> {cc.atlas_of(M, n)}, frame is in {key}')
        info.append(f'merge {tag} ({" + ".join(M["fragments"])}): {len(fr)} frames, {nbad} wrong atlas lookups')
        e2 = []
        sub_dict({k: v for k, v in M0.items() if k not in ('fragments', 'animFragment', 'frameAtlasAnim', 'bases',
                                                             'tintTable', 'frameAtlasPose')},
                 {k: v for k, v in M.items()}, '', e2, allow=('exclude', 'extraSlots', 'mergeAfter'))
        for b, B in M0['bases'].items():
            sub_dict({k: v for k, v in B.items() if k != 'parts'}, M['bases'][b], f'bases.{b}', e2)
            if not set(B['parts']) <= set(M['bases'][b]['parts']):
                e2.append(f'bases.{b}.parts lost parts')
        for slot, tbl in M0['tintTable'].items():
            for c, t in tbl.items():
                if M['tintTable'][slot][c] != t:
                    e2.append(f'tintTable.{slot}.{c} changed')
        for a, mp_ in M0.get('frameAtlasAnim', {}).items():
            for L, k in mp_.items():
                if M['frameAtlasAnim'][a].get(L) != k:
                    e2.append(f'frameAtlasAnim.{a}.{L} changed')
        stray = sorted({a for a in M.get('frameAtlasAnim', {}) if a not in F['anims'] and
                        M['frameAtlasAnim'][a] != M0.get('frameAtlasAnim', {}).get(a)})
        if stray:
            e2.append(f'old-anim routing added for {stray[:5]}')
        err += [f'merge {tag}: {x}' for x in e2[:10]]
        info.append(f'merge {tag}: changes {len(e2)} existing values')
        # generator output unchanged for everybody (random + every other preset)
        others = [None] * 6 + sorted(p for p in M0['generator']['presets'])
        ndiff = 0
        for k in range(4000):
            pr = others[k % len(others)]
            if tc2.generate2(M0, random.Random(k), pr) != tc2.generate2(M, random.Random(k), pr):
                ndiff += 1
        if ndiff:
            err.append(f'merge {tag}: {ndiff}/4000 generated people differ once geumbangfolk is merged')
        # old-anim draw lists + atlases + canPlay unchanged for random townsfolk
        t0 = ofc.Officefolk(M0, None)
        t1 = gbc.Geumbangfolk(M, None)
        rng = random.Random(5)
        nd = nfr = 0
        old_anims = [a for a in M0['anims'] if a != 'carry_walk']
        for k in range(300):
            p = t0.random_person(rng=rng)
            for _ in range(5):
                a = rng.choice(old_anims)
                inf = M0['anims'][a]
                d = rng.choice(inf['dirs'])
                i = rng.randrange(inf['frames'])
                l0 = [(z, n, None if t is None else tuple(np.round(t, 5)), cc.atlas_of(M0, n) if s == 'body' else 'h')
                      for z, n, t, s in t0.layers(p, a, d, i)]
                l1 = [(z, n, None if t is None else tuple(np.round(t, 5)), cc.atlas_of(M, n) if s == 'body' else 'h')
                      for z, n, t, s in t1.layers(p, a, d, i)]
                nfr += 1
                if l0 != l1:
                    nd += 1
                    if nd <= 2:
                        err.append(f'merge {tag}: draw list of {a} {d} {i} changes ({p["parts"]})')
                if t0.can_play(p, a) != t1.can_play(p, a):
                    err.append(f'merge {tag}: canPlay {a} changes for {p["parts"]}')
                    break
        info.append(f'merge {tag}: 4000 generated people identical, {nfr - nd}/{nfr} old-anim draw lists + atlases '
                    f'identical')
        # officefolk staff unchanged (their anims, canPlay, pickAnim, pages) when officefolk is merged
        if 'officefolk' in M0.get('fragments', []):
            nd = 0
            for pr in sorted(M0['generator']['presets']):
                if pr not in M0.get('generator', {}).get('presets', {}):
                    continue
                for k in range(8):
                    p = t0.preset(pr, seed=k)
                    for a in M0.get('officefolkAnims', []):
                        if t0.can_play(p, a) != t1.can_play(p, a) or t0.pick_anim(p, a) != t1.pick_anim(p, a):
                            nd += 1
            if nd:
                err.append(f'merge {tag}: officefolk canPlay / pickAnim changes in {nd} cases')
        # head pose fallback
        has_down = 'down' in M['headPoses']
        hps = {e['hp'] for a in F['anims'] for row in M['timeline'][a].values() for e in row}
        if not has_down and 'down' in hps:
            err.append(f'merge {tag}: hp "down" left without townfolk2')
        if has_down and 'down' not in hps:
            err.append(f'merge {tag}: down replaced although townfolk2 is merged')
        if any(e['hp'] == 'nod' and not (a == 'hand_parcel' and k == 5) for a in F['anims']
               for row in F['timeline'][a].values() for k, e in enumerate(row)):
            err.append('the merge rule changed the fragment block itself')
    if 'bare' not in merges:
        print('ERROR', err)
        sys.exit(1)

    # ------------------------------------------------------------------ anims + timeline
    for tag, M in merges.items():
        for a, (n, fps, rep, dirs, hp, items, page, imp) in CONTRACT.items():
            inf = M['anims'].get(a)
            if not inf:
                err.append(f'{tag}: missing anim {a}')
                continue
            if inf['frames'] != n or inf['fps'] != fps or inf['repeat'] != rep or set(inf['dirs']) != set(dirs):
                err.append(f'{tag}: anim {a} {inf} != contract')
            if imp is not None and inf.get('impactFrame') != imp:
                err.append(f'{tag}: {a} impactFrame {inf.get("impactFrame")} != {imp}')
            if sorted(M['animItems'].get(a, [])) != sorted(items):
                err.append(f'{tag}: animItems {a} {M["animItems"].get(a)} != {items}')
            for d in inf['dirs']:
                row = M['timeline'][a][d]
                if len(row) != n:
                    err.append(f'{tag}: timeline {a} {d} has {len(row)} frames')
                for k, e in enumerate(row):
                    h = HP_EXCEPT.get((a, k), hp)
                    want_ = h if h in M['headPoses'] else F['headPoseFallback'].get(h, h)
                    if d not in M['headPoses'][want_]['dirs']:
                        want_ = 'loco'
                    if e['hp'] != want_:
                        err.append(f'{tag}: timeline {a} {d} {k}: head pose {e["hp"]} (want {want_})')
                        break
                    if d in M['faceDirs']:
                        for fs in M['faces']:
                            for nm in (f'face.{fs}.{e["face"]}/{e["hp"]}_{d}', f'brow.{fs}.{e["brow"]}/{e["hp"]}_{d}'):
                                if cc.atlas_of(M, nm) is None or nm not in frames_all:
                                    err.append(f'{tag}: timeline {a} {d} {k}: no {nm}')
                                    break
        pg = M['gbPages']['groups']
        for a, c in CONTRACT.items():
            if a not in pg.get(c[6], {}).get('anims', []):
                err.append(f'{tag}: {a} not on page {c[6]}')
    if set(F['anims']) != set(CONTRACT):
        err.append(f'anims {sorted(F["anims"])}')
    if F['animFallback'] != FALLBACK:
        err.append(f'animFallback {F["animFallback"]} != contract')
    for tag, M in merges.items():
        hp_count = {}
        for a in F['anims']:
            for row in M['timeline'][a].values():
                for e in row:
                    hp_count[e['hp']] = hp_count.get(e['hp'], 0) + 1
        info.append(f'{tag} merge head poses: {hp_count}')

    # ------------------------------------------------------------------ bases + points
    M = merges['bare']
    for b in BASES:
        B = F['bases'].get(b)
        if B is None:
            err.append(f'missing base {b}')
            continue
        for a, (n, *_r) in CONTRACT.items():
            for d in F['anims'][a]['dirs']:
                ho = B['headOffset'].get(a, {}).get(d)
                if not ho or len(ho) != n:
                    err.append(f'{b}: headOffset {a} {d}')
            cov = B['gbCover'].get(a)
            if cov is None or sorted(cov) != sorted(COVER):
                err.append(f'{b}: gbCover {a} {cov} != contract cover')
        pts = []
        for table, anims, size in (('boxPoint', ['carry_parcel', 'ring_doorbell'], 4),
                                   ('handPoint', ['hand_parcel', 'sort_parcel'], 2),
                                   ('bellPoint', ['ring_doorbell'], 2), ('beamPoint', ['scan'], 4),
                                   ('tapePoint', ['tape_box'], 2)):
            for a in anims:
                t = B.get(table, {}).get(a)
                if t is None:
                    err.append(f'{b}: no {table}.{a}')
                    continue
                for d in F['anims'][a]['dirs']:
                    row = t.get(d)
                    if row is None or len(row) != F['anims'][a]['frames'] or any(v is None or len(v) != size
                                                                                 for v in row):
                        err.append(f'{b}: {table}.{a}.{d} incomplete')
                        continue
                    for v in row:
                        pts += [v[:2]] + ([v[2:]] if size == 4 else [])
        for x, y in pts:
            if not (-64 <= x <= 64 and -104 <= y <= 24):
                err.append(f'{b}: point ({x}, {y}) outside the frame')
                break
        gs = B.get('groundSpeed', {}).get('carry_parcel', {})
        if sorted(gs) != sorted(LOCO) or not all(v and 10 < v < 120 for v in gs.values()):
            err.append(f'{b}: groundSpeed carry_parcel {gs}')
        if 'seat' in B or 'deskSeat' in B:
            err.append(f'{b}: bases.seat / deskSeat would overwrite earlier fragments')
    a_s = F['bases']['adult_slim']
    info.append(f'adult_slim: groundSpeed carry_parcel {a_s["groundSpeed"]["carry_parcel"]} px/s; boxPoint '
                f'carry_parcel S0 {a_s["boxPoint"]["carry_parcel"]["S"][0]}, bellPoint NE2 '
                f'{a_s["bellPoint"]["ring_doorbell"]["NE"][2]}, beamPoint SE2 {a_s["beamPoint"]["scan"]["SE"][2]}')

    # ------------------------------------------------------------------ frames
    hidden = []
    for b in RENDER:
        for a, (n, *_r) in CONTRACT.items():
            for d in F['anims'][a]['dirs']:
                for limb in ('arm_R', 'arm_L', 'hand_R', 'hand_L'):
                    got = [i for i in range(n) if f'{limb}@{b}/{a}_{d}_{i}' in fgb]
                    miss = [i for i in range(n) if i not in got]
                    if not miss:
                        continue
                    exp = (limb.endswith('_L') and d in ('SE', 'E', 'NE')) or d in HIDDEN_OK_DIRS
                    (hidden if exp else err).append(f'{limb}@{b} {a} {d} hidden in {miss}')
    info.append(f'{len(hidden)} limb rows with frames hidden by the body (far side / behind the back; expected): '
                + '; '.join(hidden[:6]))
    holes = {}
    for b in RENDER:
        B = F['bases'][b]
        for a, parts in B['gbCover'].items():
            inf = F['anims'][a]
            for pn in parts:
                P = M['parts'][pn]
                any_ = False
                for d in inf['dirs']:
                    for i in range(inf['frames']):
                        ok = any(f'{pn}.{s}@{b}/{a}_{d}_{i}' in fgb for s in P['subs'])
                        any_ |= ok
                        if not ok:
                            holes.setdefault(f'{pn}@{b} {a}', []).append(f'{d}{i}')
                if not any_:
                    err.append(f'{b}: {pn} cast in {a} but has no frames')
    for k, v in holes.items():
        (warn if len(v) > 6 else info).append(f'{k}: no frame in {len(v)} frames ({",".join(v[:6])})')
    item_info = []
    for b in RENDER:
        for a, its in F['animItems'].items():
            inf = F['anims'][a]
            for it in its:
                P = F['parts'][it]
                for d in inf['dirs']:
                    for s in P['subs']:
                        if P['subs'][s].get('onlyAnims') and a not in P['subs'][s]['onlyAnims']:
                            if any(f'{it}.{s}@{b}/{a}_{d}_{i}' in fgb for i in range(inf['frames'])):
                                err.append(f'{it}.{s}@{b} drawn in {a} (onlyAnims)')
                            continue
                        got = [i for i in range(inf['frames']) if f'{it}.{s}@{b}/{a}_{d}_{i}' in fgb]
                        if a == 'sort_parcel':
                            if not set(got) <= {1, 2, 3, 4}:
                                err.append(f'{it}.{s}@{b} sort_parcel {d}: frames {got} (want within 1-4)')
                            continue
                        if not got and d not in ('NE', 'N'):
                            err.append(f'{it}.{s}@{b} {a} {d}: never visible')
                        elif len(got) < inf['frames']:
                            item_info.append(f'{it}.{s} {a} {d} {len(got)}/{inf["frames"]}')
    info.append('items hidden by the body / head on some frames: ' + (', '.join(item_info) or 'none'))
    for n in fgb:
        L, fr = n.split('/')
        pn = L.split('.')[0]
        if pn in F['parts'] and 'anim_item' in F['parts'][pn].get('tags', []):
            anim = fr.rsplit('_', 2)[0]
            if anim not in F['parts'][pn]['anims']:
                err.append(f'{n}: item outside its anims')
    # the cap (one fixed-colour layer: navy crown + flaps, gold band / brim / button, the mark) on every head frame
    miss = [h for h in HEAD_FRAMES if f'hat_gb_cap.main/{h}' not in fgb]
    if miss:
        err.append(f'hat_gb_cap.main: no frame in {miss}')
    info.append(f'hat_gb_cap: one fixed-colour layer on {len(HEAD_FRAMES) - len(miss)}/{len(HEAD_FRAMES)} head frames')
    # the jacket / vest in the v4 anims
    for b in RENDER:
        for pn in ('top_gb_jacket', 'det_gb_vest'):
            for a in V4:
                for d in M['anims'][a]['dirs']:
                    for i in range(M['anims'][a]['frames']):
                        if f'{pn}.main@{b}/{a}_{d}_{i}' not in fgb:
                            err.append(f'{pn}.main@{b} {a} {d} {i} has no frame')
                            break

    # ------------------------------------------------------------------ parts
    for pn, (fam, space) in NEW_PARTS.items():
        P = F['parts'].get(pn)
        if P is None:
            err.append(f'missing part {pn}')
            continue
        if P['family'] != fam or P['space'] != space:
            err.append(f'{pn}: family {P["family"]} space {P["space"]}')
        if pn not in F['gbParts']:
            err.append(f'{pn} not in gbParts')
        if space == 'body':
            framed = {n.split('/')[1].rsplit('_', 2)[0] for n in fgb if n.split('.')[0] == pn}
            if set(P['anims']) != framed:
                err.append(f'{pn}: anims {sorted(P["anims"])} != framed {sorted(framed)}')
    if F['parts'].get('hat_gb_cap', {}).get('cls') != 'full':
        err.append('hat_gb_cap: cls is not full (the hair under it must be the ~hat variant)')
    tints = {pn: {s: sd['tint'] for s, sd in F['parts'][pn]['subs'].items()} for pn in NEW_PARTS if pn in F['parts']}
    # the jacket's collar / chest band / marks are one fixed-colour 'trim' layer; the vest is one fixed-colour layer
    # (gold body, cream stripes, back mark: the brand colours never take a tint)
    want_t = {'top_gb_jacket': {'main': 'top', 'trim': None, 'cuff_R': None, 'cuff_L': None},
              'det_gb_vest': {'main': None},
              'hat_gb_cap': {'main': None}}
    for pn, w in want_t.items():
        if tints.get(pn) != w:
            err.append(f'{pn}: tints {tints.get(pn)} != {w}')
    for b in BASES:
        for pn in ('top_gb_jacket', 'det_gb_vest'):
            if pn not in F['bases'][b]['parts']:
                err.append(f'{b}: parts lacks {pn}')

    # ------------------------------------------------------------------ presets + fallbacks
    sys.path.insert(0, HERE)
    import gbf_presets as gpr
    for tag, Mx in merges.items():
        tf = gbc.Geumbangfolk(Mx, None)
        rng = random.Random(7)
        for pr, (bases, must) in PRESETS.items():
            P = Mx['generator']['presets'].get(pr)
            if P is None:
                err.append(f'{tag}: missing preset {pr}')
                continue
            if not P.get('label', {}).get('ko') or not P.get('label', {}).get('en'):
                err.append(f'{pr}: label')
            if sorted(P['bases']) != sorted(bases):
                err.append(f'{pr}: bases {P["bases"]} != {bases}')
            fails = {}
            for k in range(60):
                p = tf.preset(pr, rng=rng)
                for pn in p['parts']:
                    if pn not in Mx['parts']:
                        err.append(f'{tag} {pr}: unknown part {pn}')
                lack = [m for m in must if m not in p['parts']]
                if lack:
                    fails.setdefault('wear', []).append(lack)
                for slot, allowed in PRESET_COLOURS.get(pr, {}).items():
                    if p['colors'].get(slot) not in allowed:
                        fails.setdefault(f'colour {slot}', []).append(p['colors'].get(slot))
                for a in gpr.PROMISE[pr]:
                    if a in Mx['anims'] and not tf.can_play(p, a):
                        fails.setdefault(a, []).append(p['base'])
                    if a not in Mx['anims']:
                        fails.setdefault(f'{a} (not merged)', []).append(1)
            for a, v in fails.items():
                err.append(f'{tag} {pr}: {a} fails {len(v)}/60 {v[:2]}')
        rng = random.Random(9)
        can = {a: 0 for a in CONTRACT}
        bad_pick = 0
        N = 1500
        for k in range(N):
            p = tf.random_person(rng=rng)
            for a in CONTRACT:
                can[a] += tf.can_play(p, a)
                pick, _ = tf.pick_anim(p, a)
                if pick not in Mx['anims'] or pick == 'carry_walk' or not tf.can_play(p, pick):
                    bad_pick += 1
        if bad_pick:
            err.append(f'{tag}: {bad_pick} pickAnim results not playable / not merged')
        info.append(f'{tag}: random townsfolk able to play: ' +
                    ', '.join(f'{a} {100 * v / N:.0f}%' for a, v in can.items()))
    # ------------------------------------------------------------------ tints
    for slot, tbl in F['tintTable'].items():
        ref = M['tintRef'].get(slot, M['tintRef']['default'])
        for c, t in tbl.items():
            want_ = lin_to_srgb(srgb_to_lin(hex_rgb(c)))
            got = hex_rgb(t) * hex_rgb(ref)
            if float(abs(got - want_).max()) > 0.12 and slot not in ('hands',):
                warn.append(f'tint {slot} {c} clamps ({float(abs(got - want_).max()):.2f})')

    # ------------------------------------------------------------------ look: standing feet on the anchor, points
    src = gbc.AtlasSourceGB(assets, ['geumbangfolk'])
    tfx = gbc.Geumbangfolk(src.T, src)
    anchor_y = tc.ANCHOR[1]
    for pr in ('gb_driver', 'gb_packer', 'gb_dispatcher', 'gb_picker'):
        p = tfx.preset(pr, seed=2)
        for a in GB_ANIMS:
            inf = src.T['anims'][a]
            for d in inf['dirs'][:2]:
                im = np.asarray(tfx.compose(p, a, d, 0))
                al = im[..., 3] > 40
                ys = np.where(al.any(1))[0]
                bottom = int(ys.max()) if len(ys) else -1
                if abs(bottom - anchor_y) > 7:
                    err.append(f'{pr} {a} {d}: feet at {bottom}, anchor {anchor_y}')
    TOL = {'box': 2.0, 'hand': 7.0, 'bell': 5.0, 'beam': 3.0, 'tape': 4.0}
    far, npts = [], 0
    for b in BASES:
        rb, sxb = tfx.render_base(b)
        B = F['bases'][b]
        tables = [('box', a, B['boxPoint'][a], ['held_parcel_gb.main']) for a in ('carry_parcel', 'ring_doorbell')]
        tables += [('hand', 'hand_parcel', B['handPoint']['hand_parcel'], ['hand_R', 'hand_L']),
                   ('hand', 'sort_parcel', B['handPoint']['sort_parcel'], ['hand_R', 'hand_L', 'held_parcel_gb.small']),
                   ('bell', 'ring_doorbell', B['bellPoint']['ring_doorbell'], ['hand_R']),
                   ('beam', 'scan', B['beamPoint']['scan'], ['held_scanner.main']),
                   ('tape', 'tape_box', B['tapePoint']['tape_box'], ['held_tapegun.main'])]
        for kind, a, tab, layers in tables:
            for d, row in tab.items():
                for i, pt in enumerate(row):
                    acc = np.zeros((128, 128), np.float32)
                    for L in layers:
                        im = src.get(f'{L}@{rb}/{a}_{d}_{i}')
                        if im is not None:
                            if sxb != 1.0:
                                im = tc.scale_x(im, sxb)
                            acc = np.maximum(acc, im[..., 3])
                    ys, xs = np.nonzero(acc > 0.5)
                    if not len(xs):
                        continue                          # hidden on this frame (behind the body / head)
                    npts += 1
                    x, y = tc.ANCHOR[0] + pt[0], tc.ANCHOR[1] + pt[1]
                    dist = float(np.min(np.hypot(xs + 0.5 - x, ys + 0.5 - y)))
                    # NE / N: the parcel rides in front of the body, mostly hidden by it - the nearest visible px of
                    # it may be up to half a parcel (~9 px) from its centre / bottom point
                    tol = TOL[kind] + ((9.0 if kind == 'box' else 5.0) if d in ('NE', 'N') else 0.0)
                    if dist > tol:
                        far.append(f'{b} {kind} {a} {d} {i}: {dist:.1f} px from {layers[0]}')
    for x in far[:12]:
        err.append(f'point off its item: {x}')
    info.append(f'points on their items: {npts - len(far)}/{npts} within tolerance {TOL} (NE / N: +9 px box, +5 px '
                f'others)')

    # ------------------------------------------------------------------ brand (AS / plan 7.4)
    mk = '/tmp/fv_cache/geumbangfolk/mark/gb_mark_512.png'
    if os.path.exists(mk):
        md = mirror_diff(Image.open(mk).convert('RGBA'))
        if md > 0.06:
            err.append(f'mark texture vs its mirror: {100 * md:.1f} % > 6 %')
        info.append(f'mark texture vs its own mirror: {100 * md:.2f} %')
    # the mark on the sprites: the decal is centred on the garment's symmetry plane (x = 0, gbf_parts) and textured with
    # this symmetric texture, so a flipped sprite (SW / W / NW) shows the same mark; checked at the sizes it is drawn
    # at on the 128 px frames (back of the jacket ~14 px, vest ~10 px, cap / chest band ~7 px).  (Whole rendered
    # layers are not compared with their own mirror: the key light and the 3/4 iso view shade the two halves of any
    # garment differently.)
    if os.path.exists(mk):
        mm = []
        big = Image.open(mk).convert('RGBA')
        for px in (24, 14, 10, 7):
            md = mirror_diff(big.resize((px, px), Image.LANCZOS))
            mm.append(f'{px} px {100 * md:.1f}%')
            if md > 0.06:
                err.append(f'mark texture at {px} px vs its mirror: {100 * md:.1f} % > 6 %')
        info.append('mark texture vs its own mirror at the drawn sizes: ' + ', '.join(mm))
    navy_rows, pair_rows = [], []
    worst_navy = (0, '')
    for pr in PRESETS:
        for seed in range(6):
            p = tfx.preset(pr, seed=seed)
            for a, d, i in (('idle', 'S', 0), ('idle', 'N', 0), ('walk', 'SE', 2), ('carry_parcel', 'NE', 3),
                            ('carry_parcel', 'S', 1), ('hand_parcel', 'SE', 2), ('scan', 'SE', 0)):
                pick, face = tfx.pick_anim(p, a)
                if pick != a:
                    continue
                img = tfx.compose(p, a, d, i, face=face)
                ns = navy_share(img)
                if ns > worst_navy[0]:
                    worst_navy = (ns, f'{pr} {a} {d} {i}')
                if ns > 0.15:
                    err.append(f'navy {100 * ns:.1f} % > 15 % in {pr} seed {seed} {a} {d} {i}')
                if seed == 0 and (a, d) in (('idle', 'S'), ('idle', 'N')):
                    areas = colour_areas(img)
                    if len(areas) >= 2:
                        l1, l2 = areas[0][2], areas[1][2]
                        for bname, (c1, c2) in BRAND_PAIRS.items():
                            e1, e2 = lab_of(c1), lab_of(c2)
                            dd = min(max(float(de2000(l1[None], e1[None])[0]), float(de2000(l2[None], e2[None])[0])),
                                     max(float(de2000(l1[None], e2[None])[0]), float(de2000(l2[None], e1[None])[0])))
                            if dd < 15:
                                err.append(f'{pr} {a} {d}: its two largest colour areas match the {bname} pair '
                                           f'(dE {dd:.1f})')
                        hexes = ['#%02X%02X%02X' % tuple(int(round(v * 255)) for v in ar[1]) for ar in areas[:2]]
                        pair_rows.append(f'{pr} {d}: {hexes[0]} {100 * areas[0][0]:.0f}% + {hexes[1]} '
                                         f'{100 * areas[1][0]:.0f}%')
    info.append(f'navy share: worst {100 * worst_navy[0]:.1f} % ({worst_navy[1]}) of opaque px (<= 15 %)')
    info.append('largest colour pairs (idle S / N): ' + '; '.join(pair_rows))
    info.append('letters: none drawn (marks are the symmetric 금방이 decal; no text layer in this set)')
    # crew vs depot_worker at 0.3 scale (officefolk merged): idle S of the same base, shrunk to 38 px, the torso band
    # (rows 19..32, under the big head: the uniform) compared pixel by pixel (dE2000 mean over the px opaque in both).
    # The depot workers among themselves (other parka / hi-vis colours) differ by ~7 (median); every crew preset must
    # stay >= 10 from every depot worker (gold puffer / gold vest vs slate-olive parka + lime / orange hi-vis).
    if 'officefolk' in present:
        srcv = gbc.AtlasSourceGB(assets, ['officefolk', 'geumbangfolk'])
        tfv = gbc.Geumbangfolk(srcv.T, srcv)

        def thumb(p):
            im = tfv.compose(p, 'idle', 'S', 0).resize((38, 38), Image.LANCZOS)
            return np.asarray(im).astype(np.float64) / 255.0

        def torso_de(A, B):
            both = (A[..., 3] > 0.5) & (B[..., 3] > 0.5)
            band = np.zeros_like(both)
            band[19:33] = True
            m = both & band
            if not m.any():
                return 99.0
            return float(de2000(srgb_to_lab(A[..., :3][m]), srgb_to_lab(B[..., :3][m])).mean())
        dws = [tfv.preset('depot_worker', seed=s_) for s_ in range(10)]
        dw = [(p['base'], thumb(p)) for p in dws]
        intra = [torso_de(a[1], b[1]) for k_, a in enumerate(dw) for b in dw[k_ + 1:] if a[0] == b[0]]
        rows = []
        for pr in PRESETS:
            ds = []
            for s_ in range(6):
                p = tfv.preset(pr, seed=s_)
                t = thumb(p)
                ds += [torso_de(t, b) for base, b in dw if base == p['base']]
            dmin = min(ds) if ds else 99.0
            rows.append(f'{pr} {dmin:.1f}')
            if dmin < 10:
                err.append(f'{pr} is too close to depot_worker at 0.3 scale (torso dE {dmin:.1f} < 10)')
        info.append(f'crew vs depot_worker at 0.3 scale, min torso-band dE2000 (>= 10; depot workers among '
                    f'themselves: median {float(np.median(intra)):.1f}): ' + ', '.join(rows))

    # ------------------------------------------------------------------ hub lift (cross-set: assets/logistics)
    hub = F.get('hub', {})
    places = hub.get('places', {})
    if not places:
        warn.append('hub.places missing (assets/logistics not found at pack time)')
    MD = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
    for k, pl in places.items():
        anim = pl.get('anim') or ('scan' if pl['role'] == 'clerk' else 'tape_box')
        rd = MD.get(pl['dir'], pl['dir'])
        if anim == 'sort_parcel':
            # open front (conveyor): no lift; the mittens reach the belt top on frame 1 (taking a parcel)
            reach = -a_s['handPoint']['sort_parcel'][rd][1][1]
            info.append(f'hub {k} {pl["role"]} (sort_parcel {pl["dir"]}, open front gap {pl.get("gapUnderPx")} px): '
                        f'no lift, the mittens reach {reach:.0f} px, the belt top is {pl["frontTopPx"]} px')
            if pl['liftPx'] != 0 or abs(reach - pl['frontTopPx']) > 8:
                err.append(f'hub {k}: sort_parcel reach {reach:.0f} px vs belt {pl["frontTopPx"]} px (lift {pl["liftPx"]})')
            continue
        bp = a_s['boxPoint'].get(anim, {}).get(rd)
        if not bp:
            err.append(f'hub {k}: no boxPoint.{anim}.{rd}')
            continue
        bottom = -bp[0][3] + pl['liftPx']
        top_ = -bp[0][1] + pl['liftPx']
        info.append(f'hub {k} {pl["role"]} ({anim} {pl["dir"]}): counter / table front top {pl["frontTopPx"]} px, '
                    f'lift {pl["liftPx"]} -> the parcel stands at {bottom:.0f}..{top_:.0f} px')
        if not pl['frontTopPx'] <= bottom <= pl['frontTopPx'] + 6:
            err.append(f'hub {k}: parcel bottom {bottom:.0f} px vs the front top {pl["frontTopPx"]} px')
        if anim == 'scan':
            tgt = [-v[3] for v in a_s['beamPoint']['scan'][rd]]
            if any(abs(t - (-bp[0][1])) > 1.5 for t in tgt):
                err.append(f'hub {k}: beam target off the parcel top ({tgt} vs {-bp[0][1]})')
        else:
            rol = [(-v[1]) for v in a_s['tapePoint']['tape_box'][rd][1:4]]
            if any(abs(r - (-bp[0][1])) > 5 for r in rol):
                err.append(f'hub {k}: tape roller {rol} px not on the box top {-bp[0][1]:.1f} px')

    # ------------------------------------------------------------------ budgets + payload
    tot_mib = 0
    for a in man['atlases']:
        js = json.load(open(os.path.join(assets, a['json'])))
        mib = js['size'][0] * js['size'][1] * 4 / 2 ** 20
        tot_mib += mib
        pg = a['key'].split('_')[1]
        if mib > PAGE_BUDGET[pg] + 1e-9:
            err.append(f'{a["key"]}: {mib:.2f} MiB > {PAGE_BUDGET[pg]} MiB')
        g = F['gbPages']['groups'][pg]
        if g['atlases'] != [a['key']] or abs(g['mib'] - mib) > 0.01 or g['budgetMiB'] != PAGE_BUDGET[pg]:
            err.append(f'gbPages.{pg} {g}')
        info.append(f'{a["key"]}: {js["size"][0]}x{js["size"][1]} = {mib:.2f} MiB (budget {PAGE_BUDGET[pg]}), '
                    f'{os.path.getsize(os.path.join(assets, a["png"])) / 1024:.0f} KB png')
    for n, key in fgb.items():
        L, fr = n.split('/')
        anim = fr.rsplit('_', 2)[0]
        pg = key.split('_')[1]
        want_pg = CONTRACT[anim][6] if anim in F['anims'] else None
        if want_pg == 'road' and anim in F['gbPages'].get('hubRouted', {}).get(L.split('.')[0], []):
            want_pg = 'hub'                     # the depot crew's own v4 garments at the door (gbPages.hubRouted)
        if want_pg and want_pg != pg:
            err.append(f'{n} on page {pg}, anim belongs to {want_pg}')
            break
        if anim not in F['anims'] and pg != F['gbPages']['resident']:
            err.append(f'{n} (v4 anim / head frame) not on the resident page')
            break
    payload = sum(os.path.getsize(os.path.join(gd, f)) for f in os.listdir(gd))
    info.append(f'payload {payload / 1e6:.2f} MB in {len(os.listdir(gd))} files, {tot_mib:.2f} MiB RGBA source-sum '
                f'(contract AS: AP <= 6 MiB, files 5 source / 3 shipped)')
    if tot_mib > 6.0:
        err.append(f'AP texture budget {tot_mib:.2f} MiB > 6')

    # ------------------------------------------------------------------ dump
    if dump:
        Mx = merges.get(dump_frags) or merges['bare']
        tf = gbc.Geumbangfolk(Mx, None)
        prng = random.Random(42)
        names = list(PRESETS) + [None] * 4
        if 'officefolk' in Mx['fragments']:
            names += ['depot_worker', 'courier']
        crew = list(CONTRACT)
        cases, persons = [], []
        for k in range(ncases):
            pr = names[k % len(names)]
            p = tf.preset(pr, rng=prng) if pr else tf.random_person(rng=prng)
            persons.append(p)
            pool = sorted(Mx['anims'])
            for a in prng.sample(crew, 3) + [prng.choice(pool)]:
                pick, face = tf.pick_anim(p, a)
                inf = Mx['anims'][pick]
                d = prng.choice(inf['dirs'] + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}[x] for x in inf['dirs']
                                               if x in MIRROR.values()])
                rd = MIRROR.get(d, d)
                i = prng.randrange(inf['frames'])
                no_items = prng.random() < 0.15
                lay = tf.layers(p, pick, rd, i, face=face, no_items=no_items)
                out = []
                for z, nm, t, sp in lay:
                    out.append([z, nm, None if t is None else '#%02X%02X%02X' % tuple(int(round(float(v) * 255))
                                                                                     for v in t),
                                cc.atlas_of(Mx, nm)])
                pts = {'box': tf.parcel_point(p, pick, d, i) if pick in ('carry_parcel', 'ring_doorbell') else None,
                       'hand': tf.hand_point_of(p, pick, d, i) if pick in ('hand_parcel', 'sort_parcel') else None,
                       'bell': tf.bell_point(p, d, i) if pick == 'ring_doorbell' else None,
                       'beam': tf.beam_point(p, d, i) if pick == 'scan' else None,
                       'tape': tf.tape_point(p, d, i) if pick == 'tape_box' else None,
                       'speed': tf.ground_speed(p, pick, d) if pick == 'carry_parcel' else None}
                cases.append({'p': k, 'anim': a, 'pick': pick, 'face': face, 'dir': d, 'i': i, 'noItems': no_items,
                              'canPlay': {x: tf.can_play(p, x) for x in crew},
                              'page': tf.page_needed(p, pick), 'pageOf': tf.page_of(pick),
                              'layers': out, 'points': pts})
        os.makedirs(os.path.dirname(os.path.abspath(dump)), exist_ok=True)
        with open(dump, 'w') as f:
            json.dump({'fragments': Mx['fragments'], 'persons': persons, 'cases': cases}, f)
        info.append(f'dumped {len(cases)} draw lists of {ncases} people ({" + ".join(Mx["fragments"])}) -> {dump}')
    for x in info:
        print('INFO', x)
    for x in warn:
        print('WARN', x)
    for x in err[:80]:
        print('ERROR', x)
    print(f'{len(err)} errors, {len(warn)} warnings')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
