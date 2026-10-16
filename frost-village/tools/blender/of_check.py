"""
of_check.py - validate assets/officefolk (CONTRACT_V42 AJ) together with assets/townfolk (+ townfolk2 / beachfolk /
cityfolk when present).  Plain python3 (numpy + Pillow).

    python3 tools/blender/of_check.py [--assets DIR] [--dump cases.json] [--fragments v42|all] [--n 500]

Checks
  files      9 files (4 atlases x png/json + manifest), tfatlas v1 128 x 128, <= 2048 px, png size = json size, rects
             in bounds, no frame name shared with another fragment, atlas keys unique, paths under officefolk/.
  block      fragment header (version / fragment / extends / requires / mergeAfter), frame size + anchor.
  merge      townfolk + officefolk (v4.2) AND townfolk + every fragment present + officefolk: no redefinition, every
             packed frame resolves to its atlas (frameAtlas / frameAtlasAnim), headPoseFallback applied only without
             townfolk2; merging officefolk changes nothing that was there (old keys, bases keys, generator output of
             4000 seeded people incl. every other preset, draw lists + atlases of 1500 old-anim frames).
  anims      the 14 anims: frames / fps / repeat / dirs / impactFrame / page per the contract table; timelines with
             the contract head pose (soc NE / N -> loco; down -> nod without townfolk2); every face + brow of every
             face set exists for the poses and dirs used.
  bases      the 4 bases: headOffset for every frame, ofCover for every anim (carry_sack = the courier wardrobe on
             adults only), handPoint / impactPoint / sackPoint / tipPoint / groundSpeed / deskSeat; every point inside
             the 128 x 128 frame.
  frames     limb frames for every frame (far-side limbs hidden by the body allowed), every cover part has frames in
             every frame (some sub; holes reported), anim items only in their anims, desk_write pen 0-3 / stamp 4-5,
             old-anim frames of the extended layers (ofExt).
  parts      11 new parts (family, space, tint, ages, anims == framed anims).
  presets    8 presets: bases + wardrobe per the contract, 'force', each keeps PROMISE (of_presets) for 60 people in
             both merges; animFallback == contract; pickAnim never returns an anim the merge lacks (sit without
             townfolk2) or carry_walk.
  look       seat anchor: the seated body sits ON the anchor (hips at the anchor line, legs below), standing feet on
             the anchor; budgets (desk <= 6, work <= 4, errand <= 4, sack <= 1.5 MiB RGBA), payload.
  points     (polish) every hand / impact / sack / tip point lies on the item it names: within 3 px (hand: 6 px, the
             point is between the palms) of an opaque pixel of that layer on every frame where the layer is drawn,
             all 4 bases (round bases stretched); bow / scoop head steps <= 8 px per frame (eased).
  cross-set  (polish) office: tipPoint.point_board at chief_office.boardPoint / boardDir lies inside boardRect;
             civic bank: with counter.places.bank.liftPx the stamp_stand impact and the hand_over hands (frames 2-3)
             are above the counter top; the bank manager's seat lift = deskSeat.groundOffsetPx.
  --dump     python draw lists for tools/test/officefolk_phaser.mjs --parity (500 seeded people: the 8 presets +
             random townsfolk, 4 anims each -> pickAnim, dir incl. mirrors, frame, face, noItems, atlas per layer,
             canPlay of all 14 anims, points, pageNeeded).
"""
import copy
import json
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

D3 = ['S', 'SE', 'E']
# anim: (frames, fps, repeat, dirs, head pose, items, page, impactFrame)
CONTRACT = {
    'sit_idle': (4, 4, -1, D3, 'soc', [], 'desk', None),
    'desk_type': (6, 10, -1, D3, 'down', [], 'desk', None),
    'desk_write': (6, 8, -1, D3, 'down', ['held_pen', 'held_stamp'], 'desk', 4),
    'desk_phone': (4, 5, -1, D3, 'soc', ['held_receiver'], 'desk', None),
    'desk_read': (4, 4, -1, D3, 'down', ['held_letter'], 'desk', None),
    'desk_count': (6, 8, -1, D3, 'down', ['held_coins'], 'desk', None),
    'file': (6, 8, -1, ['NE', 'N'], 'loco', ['held_letter'], 'work', None),
    'point_board': (6, 8, -1, ['NE', 'N', 'E'], 'soc', ['held_pointer'], 'work', None),
    'stamp_stand': (6, 8, -1, D3, 'down', ['held_stamp'], 'work', 3),
    'bow': (6, 8, 0, D3, 'down', [], 'errand', None),
    'note': (4, 5, -1, D3, 'down', ['held_notebook'], 'errand', None),
    'hand_over': (6, 9, 0, ['NE', 'E', 'SE'], 'soc', [], 'errand', None),
    'scoop': (6, 9, -1, D3, 'down', ['held_sack_open'], 'errand', None),
    'carry_sack': (8, 12, -1, ['S', 'SE', 'E', 'NE', 'N'], 'loco', ['held_sack_shoulder'], 'sack', None),
}
PAGE_BUDGET = {'desk': 6.0, 'work': 4.0, 'errand': 4.0, 'sack': 1.5}
ATLAS_KEYS = ['of_desk_0', 'of_work_0', 'of_errand_0', 'of_sack_0']
BASES = ['adult_slim', 'adult_round', 'elder_slim', 'elder_round']
RENDER = ['adult_slim', 'elder_slim']
FALLBACK = {'sit_idle': ['sit', 'idle'], 'desk_type': ['sit_idle', 'sit', 'idle'],
            'desk_write': ['sit_idle', 'sit', 'idle'], 'desk_phone': ['sit_idle', 'sit', 'idle'],
            'desk_read': ['sit_idle', 'sit', 'idle'], 'desk_count': ['sit_idle', 'sit', 'idle'], 'file': ['idle'],
            'point_board': ['point', 'talk', 'idle'], 'stamp_stand': ['talk', 'idle'], 'bow': ['wave', 'idle'],
            'note': ['idle'], 'hand_over': ['talk', 'idle'], 'scoop': ['happy', 'idle'], 'carry_sack': ['walk']}
COVER = ['top_cardigan', 'top_sweater', 'top_blazer', 'top_vest', 'top_duffle', 'top_coat', 'top_parka', 'top_uniform',
         'bot_pants', 'bot_longskirt', 'bot_skirt', 'bot_tights', 'shoe_shoes', 'shoe_boots', 'shoe_furboots',
         'acc_scarf', 'acc_satchel', 'acc_mailbag', 'det_tie', 'det_bow', 'det_lanyard', 'det_hivis', 'acc_sleeves',
         'acc_bell_pin']
# (polish M6) + acc_bowtie: the tellers' bow tie (det_bow shares the shirt's tint slot, invisible on a vest shirt)
COVER = COVER + ['acc_bowtie']
COURIER_COVER = ['top_duffle', 'bot_pants', 'shoe_furboots', 'acc_satchel', 'acc_bell_pin']
NEW_PARTS = {'acc_sleeves': 'detail', 'acc_bell_pin': 'detail', 'acc_bowtie': 'detail', 'held_receiver': 'held',
             'held_pen': 'held',
             'held_stamp': 'held', 'held_letter': 'held', 'held_notebook': 'held', 'held_pointer': 'held',
             'held_sack_open': 'held', 'held_coins': 'held', 'held_sack_shoulder': 'held'}
PRESETS = {   # bases, must wear (contract table)
    'office_a': (['adult_round'], ['top_cardigan', 'bot_longskirt', 'shoe_shoes', 'acc_glasses_sq', 'det_lanyard',
                                   'acc_sleeves', 'hair_bob']),
    'office_b': (['adult_slim'], ['top_sweater', 'bot_pants', 'shoe_boots', 'acc_scarf', 'hair_ponytail']),
    'secretary': (['adult_slim'], ['top_blazer', 'det_bow', 'bot_skirt', 'bot_tights', 'shoe_shoes', 'hair_bun']),
    'courier': (['adult_round'], ['top_duffle', 'bot_pants', 'shoe_furboots', 'hat_beanie', 'acc_satchel',
                                  'acc_bell_pin']),
    'teller_a': (['adult_slim'], ['top_vest', 'acc_bowtie', 'bot_pants', 'shoe_shoes']),
    'teller_b': (['adult_round'], ['top_vest', 'acc_bowtie', 'bot_skirt', 'shoe_shoes']),
    'bank_manager': (['elder_round'], ['top_blazer', 'det_tie', 'bot_pants', 'shoe_shoes', 'acc_glasses']),
    'depot_worker': (['adult_slim', 'adult_round'], ['top_parka', 'det_hivis', 'bot_pants', 'shoe_boots',
                                                     'hat_beanie']),
}
# limbs the body hides in a whole frame (checked by eye on the renders): the far mitten / arm in side views, the
# mittens in front of the chest seen from behind (file / point_board N, NE), the pointer hand behind the head
HIDDEN_OK = {('file', 'N', 'hand_R'), ('file', 'N', 'hand_L'), ('file', 'NE', 'hand_R'),
             ('point_board', 'N', 'hand_R'), ('point_board', 'NE', 'hand_R')}
# items the head / body hides on some frames (looked at): reported as info, never all frames of a dir except these
ITEM_HIDDEN_DIR_OK = {('desk_count', 'E', 'held_coins', 'elder_slim')}
GROUND_TOL = 4


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
                err.append(f'merging officefolk removed {p}')
                continue
            sub_dict(v, new[k], p, err, allow)
        return
    if isinstance(old, list) and isinstance(new, list) and any(path.endswith(a) for a in allow):
        if [x for x in old if x not in new]:
            err.append(f'merging officefolk dropped items of {path}')
        return
    if old != new:
        err.append(f'merging officefolk changed {path}')


def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    dump, dump_frags, ncases = None, 'v42', 500
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
    od = os.path.join(assets, 'officefolk')
    man = json.load(open(os.path.join(od, 'manifest.json'), encoding='utf-8'))
    F = man.get('officefolk')
    if F is None:
        print('ERROR no officefolk block')
        sys.exit(1)
    files = sorted(os.listdir(od))
    want = sorted(['manifest.json'] + [f'{k}.{e}' for k in ATLAS_KEYS for e in ('png', 'json')])
    if files != want:
        err.append(f'assets/officefolk holds {files}, want {want}')
    if [a['key'] for a in man['atlases']] != ATLAS_KEYS:
        err.append(f'atlas keys {[a["key"] for a in man["atlases"]]}')
    for a in man['atlases']:
        if not a['png'].startswith('officefolk/') or not a['json'].startswith('officefolk/'):
            err.append(f'{a["key"]}: path not under officefolk/')
    hdr = {k: F.get(k) for k in ('version', 'fragment', 'extends', 'requires', 'mergeAfter')}
    if hdr != {'version': 1, 'fragment': 'officefolk', 'extends': 'townfolk', 'requires': ['townfolk'],
               'mergeAfter': ['townfolk2', 'beachfolk', 'cityfolk']}:
        err.append(f'block header {hdr}')
    cv = man.get('conventions', {})
    if cv.get('frameSize') != [128, 128] or cv.get('anchor') != [0.5, 0.8125]:
        err.append(f'conventions {cv}')
    rects = load_frames(assets, man, err, 'officefolk')
    fof = {k: v[0] for k, v in rects.items()}
    info.append(f'officefolk: {len(man["atlases"])} atlases, {len(rects)} frame names, '
                f'{len({(v[0], v[1][:4]) for v in rects.values()})} rects')

    # ------------------------------------------------------------------ fragments + merges
    man1 = json.load(open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8'))
    frames_all = {k: v[0] for k, v in load_frames(assets, man1, err, 'townfolk').items()}
    tf_frames = dict(frames_all)
    keys_seen = {a['key'] for a in man1['atlases']}
    blocks = []
    for frag in ofc.FRAGMENT_ORDER[:-1]:
        mp = os.path.join(assets, frag, 'manifest.json')
        if not os.path.exists(mp):
            continue
        m = json.load(open(mp, encoding='utf-8'))
        name, block = cc.fragment_block(m)
        fr = {k: v[0] for k, v in load_frames(assets, m, [], frag).items()}
        for a in m['atlases']:
            keys_seen.add(a['key'])
        frames_all.update(fr)
        blocks.append((name, block))
    for n in fof:
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
    for tag, bl in (('v42', []), ('all', blocks)):
        try:
            M = ofc.merge_officefolk(T1, bl + [('officefolk', F)])
        except Exception as e:                  # noqa: BLE001
            err.append(f'merge {tag}: {e}')
            continue
        merges[tag] = M
        M0 = cc.merge_fragments(T1, bl)
        # every packed frame resolves to its atlas
        fr = dict(frames_all if tag == 'all' else tf_frames)
        fr.update(fof)
        ovs = set(M.get('overrides', []))
        nbad = 0
        for n, key in fr.items():
            if cc.atlas_of(M, n) != key and n not in ovs:
                nbad += 1
                if nbad <= 5:
                    err.append(f'merge {tag}: atlas lookup of {n} -> {cc.atlas_of(M, n)}, frame is in {key}')
        info.append(f'merge {tag} ({" + ".join(M["fragments"])}): {len(fr)} frames, {nbad} wrong atlas lookups')
        # nothing that was there changes
        e2 = []
        sub_dict({k: v for k, v in M0.items() if k not in ('fragments', 'animFragment', 'frameAtlasAnim', 'bases',
                                                             'tintTable')},
                 {k: v for k, v in M.items()}, '', e2, allow=('exclude', 'extraSlots'))
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
        old_ext = {(a, L) for a, mp_ in M.get('frameAtlasAnim', {}).items() for L in mp_
                   if a not in F['anims'] and L not in M0.get('frameAtlasAnim', {}).get(a, {})}
        ext_layers = {f'{pn}.{s}@{b}' for b in RENDER for pn in F['bases'][b]['ofExt']
                      for s in M['parts'][pn]['subs']}
        stray = sorted({L for a, L in old_ext if L not in ext_layers and L.split('.')[0].split('@')[0] not in NEW_PARTS})
        if stray:
            e2.append(f'old-anim routing added for townfolk layers {stray[:5]}')
        err += [f'merge {tag}: {x}' for x in e2[:10]]
        info.append(f'merge {tag}: officefolk adds {len(old_ext)} old-anim routes (extended / new layers only), '
                    f'changes {len(e2)} existing values')
        # generator output unchanged for everybody (random + every other preset)
        others = [None] * 6 + sorted(p for p in M0['generator']['presets'])
        ndiff = 0
        for k in range(4000):
            pr = others[k % len(others)]
            if tc2.generate2(M0, random.Random(k), pr) != tc2.generate2(M, random.Random(k), pr):
                ndiff += 1
        if ndiff:
            err.append(f'merge {tag}: {ndiff}/4000 generated people differ once officefolk is merged')
        # old-anim draw lists + atlases unchanged for random townsfolk
        t0 = cc.Cityfolk(M0, None)
        t1 = ofc.Officefolk(M, None)
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
        # head pose fallback
        has_down = 'down' in M['headPoses']
        hps = {e['hp'] for a in F['anims'] for row in M['timeline'][a].values() for e in row}
        if not has_down and 'down' in hps:
            err.append(f'merge {tag}: hp "down" left without townfolk2')
        if has_down and 'nod' in hps and 'down' not in hps:
            err.append(f'merge {tag}: down replaced although townfolk2 is merged')
        if any(e['hp'] == 'nod' for a in F['anims'] for row in F['timeline'][a].values() for e in row):
            err.append('the merge rule changed the fragment block itself')
    if 'v42' not in merges:
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
                want = hp if hp in M['headPoses'] else F['headPoseFallback'].get(hp, hp)
                if d not in M['headPoses'][want]['dirs']:
                    want = 'loco'
                for k, e in enumerate(row):
                    if e['hp'] != want:
                        err.append(f'{tag}: timeline {a} {d} {k}: head pose {e["hp"]} (want {want})')
                        break
                    if e['hp'] not in M['headPoses'] or d not in M['headPoses'][e['hp']]['dirs']:
                        err.append(f'{tag}: timeline {a} {d} {k}: no head pose {e["hp"]} {d}')
                    if d in M['faceDirs']:
                        for fs in M['faces']:
                            for nm in (f'face.{fs}.{e["face"]}/{e["hp"]}_{d}', f'brow.{fs}.{e["brow"]}/{e["hp"]}_{d}'):
                                if cc.atlas_of(M, nm) is None or nm not in frames_all:
                                    err.append(f'{tag}: timeline {a} {d} {k}: no {nm}')
                                    break
        pg = M['ofPages']['groups']
        for a, c in CONTRACT.items():
            if a not in pg.get(c[6], {}).get('anims', []):
                err.append(f'{tag}: {a} not on page {c[6]}')
    if set(F['anims']) != set(CONTRACT):
        err.append(f'anims {sorted(F["anims"])}')
    if F['animFallback'] != FALLBACK:
        err.append(f'animFallback {F["animFallback"]} != contract')
    hp_count = {}
    for a in F['anims']:
        for row in merges['v42']['timeline'][a].values():
            for e in row:
                hp_count[e['hp']] = hp_count.get(e['hp'], 0) + 1
    info.append(f'v4.2 merge head poses: {hp_count} (down -> nod)')

    # ------------------------------------------------------------------ bases + points
    M = merges['v42']
    for b in BASES:
        B = F['bases'].get(b)
        if B is None:
            err.append(f'missing base {b}')
            continue
        age = M['bases'][b]['age']
        for a, (n, *_r) in CONTRACT.items():
            for d in F['anims'][a]['dirs']:
                ho = B['headOffset'].get(a, {}).get(d)
                if not ho or len(ho) != n:
                    err.append(f'{b}: headOffset {a} {d}')
            cov = B['ofCover'].get(a)
            if cov is None:
                err.append(f'{b}: no ofCover {a}')
                continue
            if a == 'carry_sack':
                want = sorted(COURIER_COVER) if age == 'adult' else []
                if sorted(cov) != want:
                    err.append(f'{b}: ofCover carry_sack {cov} != {want}')
            elif not set(cov) <= set(COVER):
                err.append(f'{b}: ofCover {a} has {sorted(set(cov) - set(COVER))} outside the contract cover')
        pts = []

        def chk(tab, name, anims, per_frame):
            for a in anims:
                t = tab.get(a, {}) if a else tab
                for d in F['anims'][a or 'hand_over']['dirs']:
                    v = t.get(d)
                    n = F['anims'][a or 'hand_over']['frames']
                    if v is None or (per_frame and (len(v) != n or any(x is None for x in v))):
                        err.append(f'{b}: {name} {a} {d} missing')
                        continue
                    pts.extend(v if per_frame else [v])
        chk(B['handPoint'], 'handPoint', [None], True)
        chk(B['impactPoint'], 'impactPoint', ['desk_write', 'stamp_stand'], False)
        chk(B['sackPoint'], 'sackPoint', ['scoop'] + (['carry_sack'] if age == 'adult' else []), True)
        chk(B['tipPoint'], 'tipPoint', ['point_board'], True)
        for x, y in pts:
            if not (-64 <= x <= 64 and -104 <= y <= 24):
                err.append(f'{b}: point ({x}, {y}) outside the frame')
                break
        if age != 'adult' and (B.get('groundSpeed') or B['sackPoint'].get('carry_sack')):
            err.append(f'{b}: carry_sack groundSpeed / sackPoint on a base without carry_sack frames')
        if age == 'adult':
            gs = B.get('groundSpeed', {}).get('carry_sack', {})
            if sorted(gs) != sorted(CONTRACT['carry_sack'][3]) or not all(10 < v < 120 for v in gs.values()):
                err.append(f'{b}: groundSpeed carry_sack {gs}')
        ds = B.get('deskSeat', {})
        if not (15 < ds.get('groundOffsetPx', 0) < 40) or not (-40 < ds.get('deskTopPx', 0) < 0):
            err.append(f'{b}: deskSeat {ds}')
        if 'seat' in B:
            err.append(f'{b}: bases.seat would overwrite townfolk2 sit data')
    a_s = F['bases']['adult_slim']
    info.append(f'adult_slim: groundSpeed carry_sack {a_s["groundSpeed"]["carry_sack"]} px/s, deskSeat '
                f'{a_s["deskSeat"]}, impactPoint {a_s["impactPoint"]}')

    # ------------------------------------------------------------------ frames: limbs, cover, items, old anims
    hidden = []
    for b in RENDER:
        age = M['bases'][b]['age']
        for a, (n, *_r) in CONTRACT.items():
            if a == 'carry_sack' and age != 'adult':
                if any(f'@{b}/carry_sack_' in k for k in fof):
                    err.append(f'{b}: carry_sack frames for elders')
                continue
            for d in F['anims'][a]['dirs']:
                for limb in ('arm_R', 'arm_L', 'hand_R', 'hand_L'):
                    got = [i for i in range(n) if f'{limb}@{b}/{a}_{d}_{i}' in fof]
                    miss = [i for i in range(n) if i not in got]
                    if not miss:
                        continue
                    exp = (limb.endswith('_L') and d in ('SE', 'E', 'NE')) or (a, d, limb) in HIDDEN_OK
                    (hidden if exp else err).append(f'{limb}@{b} {a} {d} hidden in {miss}')
    info.append(f'{len(hidden)} limb rows with frames hidden by the body (far side / behind the back; expected)')
    holes = {}
    for b in RENDER:
        B = F['bases'][b]
        for a, parts in B['ofCover'].items():
            inf = F['anims'][a]
            for pn in parts:
                P = M['parts'][pn]
                if P['space'] != 'body':
                    continue
                any_ = False
                for d in inf['dirs']:
                    for i in range(inf['frames']):
                        ok = any(f'{pn}.{s}@{b}/{a}_{d}_{i}' in fof for s in P['subs'])
                        any_ |= ok
                        if not ok:
                            holes.setdefault(f'{pn}@{b} {a}', []).append(f'{d}{i}')
                if not any_:
                    err.append(f'{b}: {pn} cast in {a} but has no frames')
    for k, v in holes.items():
        (warn if len(v) > 6 else info).append(f'{k}: no frame in {len(v)} frames ({",".join(v[:6])})')
    info.append(f'{len(holes)} cover part rows with frames hidden somewhere (inner subs, far side)')
    item_info = []
    for b in RENDER:
        age = M['bases'][b]['age']
        for a, its in F['animItems'].items():
            if a == 'carry_sack' and age != 'adult':
                continue
            inf = F['anims'][a]
            for it in its:
                P = F['parts'][it]
                for d in inf['dirs']:
                    got = [i for i in range(inf['frames']) if any(f'{it}.{s}@{b}/{a}_{d}_{i}' in fof for s in P['subs'])]
                    if a == 'desk_write':
                        want = [0, 1, 2, 3] if it == 'held_pen' else [4, 5]
                        if got != want:
                            err.append(f'{it}@{b} desk_write {d}: frames {got} != {want}')
                        continue
                    if not got and (a, d, it, b) not in ITEM_HIDDEN_DIR_OK:
                        err.append(f'{it}@{b} {a} {d}: never visible')
                    elif len(got) < inf['frames']:
                        item_info.append(f'{it}@{b} {a} {d} {len(got)}/{inf["frames"]}')
    info.append('items hidden by the head / body on some frames: ' + ', '.join(item_info))
    for n in fof:
        L, fr = n.split('/')
        pn = L.split('.')[0]
        if pn in F['parts'] and 'anim_item' in F['parts'][pn].get('tags', []):
            anim = fr.rsplit('_', 2)[0]
            if anim not in F['parts'][pn]['anims']:
                err.append(f'{n}: item outside its anims')
    # old anims of the extended layers (ofExt) + new wear parts
    for b in RENDER:
        for pn, anims in F['bases'][b]['ofExt'].items():
            for a in anims:
                for d in M['anims'][a]['dirs']:
                    for i in range(M['anims'][a]['frames']):
                        if not any(f'{pn}.{s}@{b}/{a}_{d}_{i}' in fof for s in M['parts'][pn]['subs']):
                            err.append(f'{b}: ofExt {pn} {a} {d} {i} has no frame')
                            break
    # ------------------------------------------------------------------ parts
    for pn, fam in NEW_PARTS.items():
        P = F['parts'].get(pn)
        if P is None:
            err.append(f'missing part {pn}')
            continue
        if P['family'] != fam or P['space'] != 'body':
            err.append(f'{pn}: family {P["family"]} space {P["space"]}')
        if pn == 'acc_sleeves' and {s['tint'] for s in P['subs'].values()} != {'acc'}:
            err.append('acc_sleeves: tint slot is not acc')
        if pn == 'acc_bell_pin' and any(s['tint'] for s in P['subs'].values()):
            err.append('acc_bell_pin is tinted')
        if pn == 'acc_bowtie' and {s['tint'] for s in P['subs'].values()} != {'acc2'}:
            err.append('acc_bowtie: tint slot is not acc2')
        if pn not in F['ofParts']:
            err.append(f'{pn} not in ofParts')
        framed = {n.split('/')[1].rsplit('_', 2)[0] for n in fof if n.split('.')[0] == pn}
        if set(P['anims']) != framed:
            err.append(f'{pn}: anims {sorted(P["anims"])} != framed {sorted(framed)}')
    for b in BASES:
        for pn in ('acc_sleeves', 'acc_bell_pin', 'acc_bowtie'):
            if (pn in F['bases'][b]['parts']) != (M['bases'][b]['age'] == 'adult'):
                err.append(f'{b}: parts {pn}')

    # ------------------------------------------------------------------ presets + fallbacks
    sys.path.insert(0, HERE)
    import of_presets as opr
    for tag, Mx in merges.items():
        tf = ofc.Officefolk(Mx, None)
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
                for a in opr.PROMISE[pr]:
                    if a in Mx['anims'] and not tf.can_play(p, a):
                        fails.setdefault(a, []).append(p['base'])
                    if a not in Mx['anims']:
                        fails.setdefault(f'{a} (not merged)', []).append(1)
            for a, v in fails.items():
                err.append(f'{tag} {pr}: {a} fails {len(v)}/60 {v[:2]}')
        # random townsfolk: share who can play each office anim; pickAnim never returns a missing anim
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
        # the bank manager is forced into the blazer; the elder teacher (townfolk preset) is not
        p = tf.preset('bank_manager', seed=3)
        if 'top_blazer' not in p['parts']:
            err.append(f'{tag}: force top_blazer failed')
    # ------------------------------------------------------------------ tints
    for slot, tbl in F['tintTable'].items():
        ref = M['tintRef'].get(slot, M['tintRef']['default'])
        for c, t in tbl.items():
            want_ = lin_to_srgb(srgb_to_lin(hex_rgb(c)))
            got = hex_rgb(t) * hex_rgb(ref)
            if float(abs(got - want_).max()) > 0.12 and slot not in ('hands',):
                warn.append(f'tint {slot} {c} clamps ({float(abs(got - want_).max()):.2f})')

    # ------------------------------------------------------------------ look: seat anchor, standing feet
    src = ofc.AtlasSourceOF(assets, ['officefolk'])
    tfx = ofc.Officefolk(src.T, src)
    anchor_y = tc.ANCHOR[1]
    rows = []
    for pr in ('teller_a', 'office_a', 'bank_manager'):
        p = tfx.preset(pr, seed=2)
        b = p['base']
        for a in ('sit_idle', 'desk_write', 'bow', 'stamp_stand', 'note'):
            for d in ('S', 'SE'):
                im = np.asarray(tfx.compose(p, a, d, 0))
                al = im[..., 3] > 40
                ys = np.where(al.any(1))[0]
                bottom = int(ys.max()) if len(ys) else -1
                # the body's widest row near the hips: for seated anims the lap sits on the anchor line
                if a in M['seat']['anims']:
                    ok = anchor_y - 2 <= bottom <= anchor_y + M['bases'][b]['deskSeat']['groundOffsetPx'] + 2 \
                        if 'deskSeat' in M['bases'][b] else True
                    lap = al[anchor_y - 6:anchor_y + 1].any(1).all()
                    if not ok or not lap:
                        err.append(f'{pr} {a} {d}: seated body bottom {bottom}, lap at anchor {lap}')
                    rows.append(f'{a}/{b[:5]}/{d} legs to +{bottom - anchor_y}px')
                else:
                    if abs(bottom - anchor_y) > GROUND_TOL + 3:
                        err.append(f'{pr} {a} {d}: feet at {bottom}, anchor {anchor_y}')
    info.append('seated: ' + ', '.join(rows[:6]) + ' (floor at +deskSeat.groundOffsetPx: the chibi legs hang)')

    # ------------------------------------------------------------------ points on their items (polish H2)
    TOL = {'hand': 6.0, 'impact': 3.0, 'sack': 4.0, 'tip': 3.0}     # (sack: the mouth may sit just behind the near arm in E)
    far, npts = [], 0
    for b in BASES:
        rb, sxb = tfx.render_base(b)
        B = F['bases'][b]
        tables = [('hand', 'hand_over', B['handPoint'], ['hand_R', 'hand_L'], True)]
        for a in ('desk_write', 'stamp_stand'):
            tables.append(('impact', a, {d: [v] for d, v in B['impactPoint'][a].items()}, ['held_stamp.main'], False))
        for a, row in B['sackPoint'].items():
            tables.append(('sack', a, row, ['held_sack_open.main' if a == 'scoop' else 'held_sack_shoulder.main'],
                           True))
        tables.append(('tip', 'point_board', B['tipPoint']['point_board'], ['held_pointer.main'], True))
        for kind, a, tab, layers, per_frame in tables:
            for d, row in tab.items():
                for k, pt in enumerate(row):
                    i = k if per_frame else F['anims'][a]['impactFrame']
                    acc = np.zeros((128, 128), np.float32)
                    for L in layers:
                        im = src.get(f'{L}@{rb}/{a}_{d}_{i}')
                        if im is not None:
                            if sxb != 1.0:
                                im = tc.scale_x(im, sxb)
                            acc = np.maximum(acc, im[..., 3])
                    ys, xs = np.nonzero(acc > 0.5)
                    if not len(xs):
                        continue                          # the item is hidden on this frame (behind the body)
                    npts += 1
                    x, y = tc.ANCHOR[0] + pt[0], tc.ANCHOR[1] + pt[1]
                    dist = float(np.min(np.hypot(xs + 0.5 - x, ys + 0.5 - y)))
                    tol = TOL[kind] + (5.0 if kind == 'hand' and d == 'NE' else 0.0)   # back view: palms hidden
                    if dist > tol:
                        far.append(f'{b} {kind} {a} {d} {i}: {dist:.1f} px from {layers[0]}')
    for x in far[:12]:
        err.append(f'point off its item: {x}')
    info.append(f'points on their items: {npts - len(far)}/{npts} within tolerance {TOL} (hand_over NE +5 px: the '
                f'palms are behind the body, L10)')
    # eased bow / scoop (polish M7)
    for b in BASES:
        for a in ('bow', 'scoop'):
            for d, row in F['bases'][b]['headOffset'][a].items():
                steps = [abs(row[(k + 1) % len(row)][1] - row[k][1]) for k in range(len(row) - (F['anims'][a]['repeat'] == 0))]
                if max(steps) > 8:
                    err.append(f'{b} {a} {d}: head step {max(steps)} px (> 8, not eased)')
    info.append('bow / scoop head steps (adult_slim S): ' + ', '.join(
        f'{a} {[r[1] for r in F["bases"]["adult_slim"]["headOffset"][a]["S"]]}' for a in ('bow', 'scoop')))

    # ------------------------------------------------------------------ cross-set: office board, civic bank (polish)
    op = os.path.join(assets, 'office', 'manifest.json')
    if os.path.exists(op):
        O = json.load(open(op, encoding='utf-8'))['sprites'].get('chief_office', {})
        bp, bd, R = O.get('boardPoint'), O.get('boardDir'), O.get('boardRect')
        if bp and bd and R:
            rows = []
            for b in BASES:
                tab = F['bases'][b]['tipPoint']['point_board']
                dd = MIRROR.get(bd, bd)
                for k, t in enumerate(tab[dd]):
                    tx = -t[0] if bd in MIRROR else t[0]
                    u = bp[0] + tx - R['point'][0]
                    v = bp[1] + t[1] - (R['point'][1] + R['shearY'] * u)
                    rows.append(u)
                    if abs(u) > R['widthPx'] / 2 - 2 or abs(v) > R['heightPx'] / 2 - 2:
                        err.append(f'office board: {b} point_board {bd} {k} tip at board-local ({u:.1f}, {v:.1f}), '
                                   f'outside boardRect {R["widthPx"]} x {R["heightPx"]}')
                        break
            info.append(f'office board: point_board {bd} tips at board-local x {min(rows):.0f}..{max(rows):.0f} '
                        f'(half width {R["widthPx"] / 2})')
    else:
        warn.append('assets/office missing: board tip cross-check skipped')
    cb = F.get('counter', {}).get('places', {}).get('bank')
    if cb:
        top = cb['counterTopPx']
        lows = []
        for b in [x for x in BASES if M['bases'][x]['age'] == 'adult']:     # the tellers (adult presets)
            lift = cb['liftPx'][b]['SE']
            imp = F['bases'][b]['impactPoint']['stamp_stand']['SE']
            if -imp[1] + lift < top:
                err.append(f'bank counter: {b} stamp impact {-imp[1] + lift:.1f} px above the feet < counter top {top}')
            hands = F['bases'][b]['handPoint']['SE'][2:4]
            if min(-h[1] + lift for h in hands) < top:
                err.append(f'bank counter: {b} hand_over hands under the counter top')
            lows.append(f'{b} lift {lift}: stamp {-imp[1] + lift:.0f}, hands {min(-h[1] + lift for h in hands):.0f}')
        info.append(f'bank counter top {top} px (glass to {cb["glassTopPx"]}): ' + '; '.join(lows))
    else:
        warn.append('counter.places.bank missing (assets/civic not found at pack time)')
    sp = F.get('seat', {}).get('places', {}).get('bank', {})
    if sp.get('anchorLiftPx') != 'bases[b].deskSeat.groundOffsetPx':
        err.append('seat.places.bank: the manager must sit at staffPoints[3] lifted by deskSeat.groundOffsetPx')

    # ------------------------------------------------------------------ budgets + payload
    tot_mib = 0
    for a in man['atlases']:
        js = json.load(open(os.path.join(assets, a['json'])))
        mib = js['size'][0] * js['size'][1] * 4 / 2 ** 20
        tot_mib += mib
        pg = a['key'].split('_')[1]
        if mib > PAGE_BUDGET[pg] + 1e-9:
            err.append(f'{a["key"]}: {mib:.2f} MiB > {PAGE_BUDGET[pg]} MiB')
        g = F['ofPages']['groups'][pg]
        if g['atlases'] != [a['key']] or abs(g['mib'] - mib) > 0.01 or g['budgetMiB'] != PAGE_BUDGET[pg]:
            err.append(f'ofPages.{pg} {g}')
        info.append(f'{a["key"]}: {js["size"][0]}x{js["size"][1]} = {mib:.2f} MiB (budget {PAGE_BUDGET[pg]}), '
                    f'{os.path.getsize(os.path.join(assets, a["png"])) / 1024:.0f} KB png')
    roam = F['ofPages'].get('roam', {})
    nroam = 0
    for n, key in fof.items():
        L, fr = n.split('/')
        anim = fr.rsplit('_', 2)[0]
        pg = key.split('_')[1]
        lay, b = L.split('@')
        if anim in F['anims'] and lay.split('.')[0] in roam.get(anim, {}).get(b, ()):
            nroam += 1
            if pg != F['ofPages']['resident']:
                err.append(f'{n}: roaming frame on page {pg}, not on the resident page')
                break
            continue
        if anim in F['anims'] and CONTRACT[anim][6] != pg:
            err.append(f'{n} on page {pg}, anim belongs to {CONTRACT[anim][6]}')
            break
    info.append(f'{nroam} roaming frame names on the resident page ({", ".join(sorted(roam))})')
    payload = sum(os.path.getsize(os.path.join(od, f)) for f in os.listdir(od))
    info.append(f'payload {payload / 1e6:.2f} MB in {len(os.listdir(od))} files, {tot_mib:.2f} MiB RGBA source-sum')

    # ------------------------------------------------------------------ dump
    if dump:
        Mx = merges['v42' if dump_frags == 'v42' else 'all']
        tf = ofc.Officefolk(Mx, None)
        prng = random.Random(42)
        names = list(PRESETS) + [None] * 4
        office = list(CONTRACT)
        cases, persons = [], []
        for k in range(ncases):
            pr = names[k % len(names)]
            p = tf.preset(pr, rng=prng) if pr else tf.random_person(rng=prng)
            persons.append(p)
            pool = sorted(Mx['anims'])
            for a in prng.sample(office, 3) + [prng.choice(pool)]:
                pick, face = tf.pick_anim(p, a)
                inf = Mx['anims'][pick]
                d = prng.choice(inf['dirs'] + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}[x] for x in inf['dirs'] if x in MIRROR.values()])
                rd = MIRROR.get(d, d)
                i = prng.randrange(inf['frames'])
                no_items = prng.random() < 0.15
                lay = tf.layers(p, pick, rd, i, face=face, no_items=no_items)
                out = []
                for z, nm, t, sp in lay:
                    out.append([z, nm, None if t is None else '#%02X%02X%02X' % tuple(int(round(float(v) * 255)) for v in t),
                                cc.atlas_of(Mx, nm)])
                cases.append({'p': k, 'anim': a, 'pick': pick, 'face': face, 'dir': d, 'i': i, 'noItems': no_items,
                              'canPlay': {x: tf.can_play(p, x) for x in office},
                              'page': tf.page_needed(p, pick), 'pageOf': tf.page_of(pick),
                              'layers': out,
                              'points': {'hand': tf.hand_point(p, d, i) if pick == 'hand_over' else None,
                                         'impact': tf.impact_point(p, pick, d) if pick in ('desk_write', 'stamp_stand') else None,
                                         'sack': tf.sack_point(p, pick, d, i) if pick in ('scoop', 'carry_sack') else None,
                                         'tip': tf.tip_point(p, d, i) if pick == 'point_board' else None,
                                         'speed': tf.ground_speed(p, pick, d) if pick == 'carry_sack' else None}})
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
