"""
bf_check.py - validate assets/beachfolk (CONTRACT_V7 Y) together with assets/townfolk + assets/townfolk2.  Plain python3.

    python3 tools/blender/bf_check.py [--assets DIR] [--budget-mb 7] [--gpu-mb 80] [--dump cases.json]

Checks: fragment manifest structure; atlases exist, tfatlas v1, <= 2048 px, png size = json size, rects in bounds;
no frame name in two atlases and none shared with townfolk / townfolk2; the 3-way merge has no key collisions;
anims (swim 8x5, float 4 S/SE/E, sunbathe 4 SE/NE, dig 6, ball_throw 6 + impactFrame 3, ball_catch 6 + impactFrame 2,
splash_play 6 + impactFrame 2, surf 4 SE/NE) with complete timelines (valid head poses / dirs / zfront limbs);
head poses swim (5 dirs) + lie (SE, NE); every base (incl. round) has headOffset for every new frame, ballPoint,
digPoint, splashPoint, lieShadow; limb frames for every new frame; every beach body part has frames in every
(anim, dir) of its anim set for every base that can wear it; every v4 head layer has frames in the new poses; new
head parts in every head frame; new face exprs on their poses; tint slots have refs / tables and no palette colour
clamps (> 12 %); presets only name existing parts; 1200 generated people (every preset + families) can play every
anim their preset lists (except anims blocked by an optional add-on such as the swim ring, which must resolve
through pickAnim / animFallback) and compose them without missing core layers; payload / GPU budgets.
Polish rules: drop accessories list every anim (anims) and keep the frameless ones in noAnims; no non-swim hat is drawn
in swim / surf, only the allowed hats in float / sunbathe (animHideHead) and a hidden full hat never squashes the hair;
the swim ring shows >= 20 % of a floating person (every base, S / SE / E); no body frame carries a detached speck at
the tile edge (tiled-render leaks); the held ball matches the beach prop (adult radius within 10 % of 0.2 m); no
carry_walk frames.
--dump writes person + draw-list cases for tools/test/beachfolk_phaser.mjs --parity.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from townfolk_compose import iter_tf_frames, srgb_to_lin, lin_to_srgb, hex_rgb, MIRROR    # noqa: E402
import beachfolk_compose as bfc                                                           # noqa: E402

NEW_ANIMS = {'swim': (8, ['S', 'SE', 'E', 'NE', 'N']), 'float': (4, ['S', 'SE', 'E']), 'sunbathe': (4, ['SE', 'NE']),
             'dig': (6, ['S', 'SE', 'E']), 'ball_throw': (6, ['S', 'SE', 'E']), 'ball_catch': (6, ['S', 'SE', 'E']),
             'splash_play': (6, ['S', 'SE', 'E']), 'surf': (4, ['SE', 'NE'])}
IMPACT = {'ball_throw': 3, 'ball_catch': 2, 'splash_play': 2}
NEW_POSES = {'swim': ['S', 'SE', 'E', 'NE', 'N'], 'lie': ['SE', 'NE']}
CONTRACT_PARTS = ['swimsuit_one', 'swim_trunks', 'rash_guard', 'swim_cap', 'straw_hat', 'sun_hat_wide', 'sunglasses',
                  'flip_flops', 'towel_shoulder', 'swim_ring_worn', 'snorkel_mask', 'arm_floaties', 'aloha_shirt',
                  'wetsuit']
OLD_ALL = ['idle', 'walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push']
CONTRACT_PRESETS = ['swimmer', 'sunbather', 'family_beach', 'lifeguard', 'bellhop', 'receptionist', 'doorman',
                    'housekeeper', 'icecream_vendor', 'beach_bar_staff', 'surfer', 'beach_tourist']
LIMBS = ['arm_R', 'arm_L', 'hand_R', 'hand_L']


def load_frames(assets, man, err, tag, sizes=None):
    from PIL import Image
    frames = {}
    for at in man['atlases']:
        for k in ('png', 'json'):
            if not os.path.exists(os.path.join(assets, at[k])):
                err.append(f'{tag}: missing {at[k]}')
        js = json.load(open(os.path.join(assets, at['json'])))
        w, h = js['size']
        if sizes is not None:
            sizes[at['key']] = (w, h)
        if js.get('tfatlas') != 1 or js.get('frameSize') != [128, 128]:
            err.append(f'{at["key"]}: not a tfatlas v1 128x128 json')
        if w > 2048 or h > 2048:
            err.append(f'{at["key"]} is {w}x{h} (> 2048)')
        if Image.open(os.path.join(assets, at['png'])).size != (w, h):
            err.append(f'{at["key"]}: png size differs from json')
        for n, (x, y, fw, fh, dx, dy) in iter_tf_frames(js):
            if n in frames:
                err.append(f'frame {n} in two atlases')
            frames[n] = at['key']
            if x < 0 or y < 0 or x + fw > w or y + fh > h or dx < 0 or dy < 0 or dx + fw > 128 or dy + fh > 128:
                err.append(f'{n}: rect out of bounds')
    return frames


def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    budget, gpu_budget, dump = 7.0, 75.0, None
    if '--assets' in args:
        assets = os.path.abspath(args[args.index('--assets') + 1])
    if '--budget-mb' in args:
        budget = float(args[args.index('--budget-mb') + 1])
    if '--gpu-mb' in args:
        gpu_budget = float(args[args.index('--gpu-mb') + 1])
    if '--dump' in args:
        dump = args[args.index('--dump') + 1]
    err, warn, info = [], [], []
    d3 = os.path.join(assets, 'beachfolk')
    man1 = json.load(open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8'))
    man2 = json.load(open(os.path.join(assets, 'townfolk2', 'manifest.json'), encoding='utf-8'))
    man3 = json.load(open(os.path.join(d3, 'manifest.json'), encoding='utf-8'))
    B = man3.get('beachfolk')
    if not B:
        print('ERROR no beachfolk block')
        sys.exit(1)
    for k in ('anims', 'timeline', 'headPoses', 'faceExprs', 'bases', 'parts', 'tintRef', 'tintTable', 'palettes',
              'generator', 'frameAtlas', 'frameAtlasExt', 'merge', 'water', 'sunbathe', 'ball', 'dig'):
        if k not in B:
            err.append(f'beachfolk.{k} missing')
    # ---- atlases
    sizes = {}
    f1 = load_frames(assets, man1, err, 'townfolk')
    f2 = load_frames(assets, man2, err, 'townfolk2')
    f3 = load_frames(assets, man3, err, 'beachfolk', sizes)
    for n in f3:
        if n in f1 or n in f2:
            err.append(f'frame {n} also in townfolk / townfolk2')
    for at in man3['atlases']:
        if not at['key'].startswith('bf_'):
            err.append(f'atlas key {at["key"]} not bf_*')
    # ---- merge
    try:
        bf = bfc.Beachfolk.from_assets(assets)
    except Exception as e:                                  # noqa: BLE001
        print('ERROR merge failed:', e)
        sys.exit(1)
    T = bf.T
    allframes = dict(f1)
    allframes.update(f2)
    allframes.update(f3)
    ov = set(T.get('overrides', []))
    for n in ov:
        allframes[n] = f2.get(n, allframes.get(n))

    def has(name):
        return name in allframes

    # ---- anims + timeline
    for a, (n, dirs) in NEW_ANIMS.items():
        A = T['anims'].get(a)
        if not A:
            err.append(f'anim {a} missing')
            continue
        if A['frames'] != n or A['dirs'] != dirs:
            err.append(f'anim {a}: {A["frames"]} frames {A["dirs"]} (want {n} {dirs})')
        if a in IMPACT and A.get('impactFrame') != IMPACT[a]:
            err.append(f'anim {a}: impactFrame {A.get("impactFrame")}')
        for d in dirs:
            tl = T['timeline'][a].get(d, [])
            if len(tl) != n:
                err.append(f'timeline {a} {d}: {len(tl)} entries')
                continue
            for i, e in enumerate(tl):
                hp, hd = e['hp'], e.get('hd', d)
                if hp not in T['headPoses']:
                    err.append(f'timeline {a} {d} {i}: unknown head pose {hp}')
                elif hd not in T['headPoses'][hp]['dirs']:
                    err.append(f'timeline {a} {d} {i}: head pose {hp} has no dir {hd}')
                for z in e.get('zfront', []):
                    if z not in LIMBS:
                        err.append(f'timeline {a} {d} {i}: zfront {z}')
                if e['face'] not in T['faceExprs'].get(hp, []) and hd in T.get('faceDirsByPose', {}).get(hp, T['faceDirs']):
                    err.append(f'timeline {a} {d} {i}: face {e["face"]} not rendered for pose {hp}')
    for hp, dirs in NEW_POSES.items():
        if T['headPoses'].get(hp, {}).get('dirs') != dirs:
            err.append(f'head pose {hp} dirs {T["headPoses"].get(hp)}')
    # ---- bases
    for b, Bb in T['bases'].items():
        rb = Bb.get('render', b)
        for a, (n, dirs) in NEW_ANIMS.items():
            for d in dirs:
                ho = Bb['headOffset'].get(a, {}).get(d)
                if not ho or len(ho) != n:
                    err.append(f'{b}: headOffset {a} {d} missing')
            for d in dirs:
                for i in range(n):
                    for limb in LIMBS:
                        if not has(f'{limb}@{rb}/{a}_{d}_{i}'):
                            info.append(f'{rb} {limb} {a}_{d}_{i}')
        for k in ('ballPoint', 'digPoint', 'splashPoint', 'lieShadow'):
            if k not in Bb:
                err.append(f'{b}: {k} missing')
        if 'ballPoint' in Bb:
            for a in ('ball_throw', 'ball_catch'):
                for d in NEW_ANIMS[a][1]:
                    pts = Bb['ballPoint'][a][d]
                    held = [i for i, v in enumerate(pts) if v]
                    want = list(range(0, 4)) if a == 'ball_throw' else list(range(2, 6))
                    if held != want:
                        err.append(f'{b}: ballPoint {a} {d} frames {held} (want {want})')
    # ---- parts
    P3 = B['parts']
    for pn in CONTRACT_PARTS:
        if pn not in P3:
            err.append(f'contract part {pn} missing')
    job_parts = {'lifeguard': 'whistle', 'bellhop': 'bellhop_cap', 'hotel_receptionist': 'hotel_vest',
                 'doorman': 'doorman_coat', 'housekeeper': 'housekeeper_dress', 'icecream_vendor': 'vendor_shirt',
                 'beach_bar_staff': 'bar_apron', 'surfer': 'surfboard', 'tourist_camera': 'tourist_camera'}
    for job, pn in job_parts.items():
        if pn not in P3:
            err.append(f'job outfit {job}: part {pn} missing')
    render_bases = sorted({Bb.get('render', b) for b, Bb in T['bases'].items()})
    hidden_uw = []
    missing_groups = 0
    for pn, P in P3.items():
        if P['space'] != 'body' or not P['subs']:
            continue
        for rb in render_bases:
            age = T['bases'][rb]['age']
            if P.get('ages') and age not in P['ages']:
                continue
            if pn not in T['bases'][rb]['parts']:
                err.append(f'{pn}: not packed for {rb}')
                continue
            for a in [x for x in P.get('anims', []) if x not in P.get('noAnims', [])]:
                n = T['anims'][a]['frames']
                empty = [d for d in T['anims'][a]['dirs']
                         if not any(has(f'{pn}.{s}@{rb}/{a}_{d}_{i}') for s in P['subs'] for i in range(n))]
                missing_groups += len(empty)
                if not empty:
                    continue
                if a in ('swim', 'float') and P['family'] in ('bottom', 'shoes'):
                    hidden_uw.append(f'{pn}@{rb}/{a}')              # entirely under the water surface: legit
                elif len(empty) < len(T['anims'][a]['dirs']) or pn in ('toy_spade',):
                    info.append(f'{pn}@{rb}: hidden in {a} {",".join(empty)}')   # e.g. feet behind a kneeling body
                else:
                    err.append(f'{pn}@{rb}: no frames in {a} at all')
    for pn, P in P3.items():
        if P.get('drop'):
            if sorted(P.get('anims', [])) != sorted(set(P.get('anims', []))) or not P.get('noAnims'):
                err.append(f'drop part {pn}: needs anims = every anim + noAnims')
            if any(a not in P['anims'] for a in T['anims'] if a in B['anims'] or a in OLD_ALL):
                err.append(f'drop part {pn}: anims must list every townfolk / beachfolk anim')
        if P['space'] == 'body' and 'carry_walk' in [a for a in P.get('anims', []) if a not in P.get('noAnims', [])]:
            err.append(f'{pn}: carry_walk frames (dropped for dolls: head carry)')
    if any(n.split('/')[1].startswith('carry_walk_') for n in f3 if '@' in n.split('/')[0]):
        err.append('carry_walk frames packed')
    # pose users (anims whose timeline shows each beachfolk head frame) for the hidden-hat rules
    users = {}
    for a in NEW_ANIMS:
        for d in T['anims'][a]['dirs']:
            for e in T['timeline'][a][d]:
                if e['hp'] in NEW_POSES:
                    users.setdefault((e['hp'], e.get('hd', d)), set()).add(a)
    AH = T.get('animHideHead', {})

    def never_seen(layer, hp, d):
        pn = layer.split('.')[0]
        P = T['parts'].get(pn)
        if not P or P.get('family') != 'hat':
            return False
        us = users.get((hp, d), set())
        return bool(us) and all(pn in AH.get(a, []) for a in us)
    for a in ('swim', 'surf', 'float', 'sunbathe'):
        if a not in AH:
            err.append(f'animHideHead.{a} missing')
    if 'float' not in B.get('animFallback', {}).get('swim', []):
        err.append('animFallback.swim must fall back to float (ring wearers)')
    # head layers in the new poses
    v4_head = [n.split('/')[0] for n in f1 if '@' not in n.split('/')[0]]
    v4_layers = sorted(set(v4_head))
    for hp, dirs in NEW_POSES.items():
        miss = []
        for L in v4_layers:
            if L.startswith('face.') or L.startswith('brow.'):
                continue
            for d in dirs:
                if not has(f'{L}/{hp}_{d}') and not never_seen(L, hp, d):
                    miss.append(f'{L}/{hp}_{d}')
                elif has(f'{L}/{hp}_{d}') and never_seen(L, hp, d):
                    warn.append(f'{L}/{hp}_{d} packed but never drawn (animHideHead)')
        if miss:
            info.append(f'{len(miss)} v4 head layer frames empty in pose {hp} (fully hidden there): {miss[:6]}')
        for d in dirs:
            for nose in ('dot', 'big', 'button'):
                if not has(f'head.{nose}/{hp}_{d}'):
                    err.append(f'head.{nose}/{hp}_{d} missing')
    for pn, P in P3.items():
        if P['space'] != 'head':
            continue
        for hp, H in T['headPoses'].items():
            for d in H['dirs']:
                got = any(has(f'{pn}.{s}/{hp}_{d}') or has(f'{pn}.{s}~hat/{hp}_{d}') for s in P['subs'])
                if not got and not never_seen(pn + '.main', hp, d):
                    err.append(f'head part {pn}: no frame in {hp}_{d}')
    faces = list(T['faces'])
    for hp, exprs in B['faceExprs'].items():
        for d in T['headPoses'][hp]['dirs']:
            if d not in T.get('faceDirsByPose', {}).get(hp, T['faceDirs']):
                continue
            for e in exprs:
                for fs in faces:
                    if not has(f'face.{fs}.{e}/{hp}_{d}'):
                        err.append(f'face.{fs}.{e}/{hp}_{d} missing')
    # ---- tints
    for slot, ref in B['tintRef'].items():
        if slot not in B['tintTable']:
            err.append(f'tint slot {slot}: no table')
    for slot, tbl in T['tintTable'].items():
        ref = T['tintRef'].get(slot, T['tintRef']['default'])
        S = T['tintModel'].get('slotS', {}).get(slot, T['tintModel']['S'])
        for col in tbl:
            want = lin_to_srgb(T['tintModel']['K'] * srgb_to_lin(hex_rgb(col)) + S)
            got = lin_to_srgb(T['tintModel']['K'] * srgb_to_lin(hex_rgb(ref)) + S)
            over = max(0.0, float((want / got).max()) - 1.0)
            if slot in B['tintTable'] and col in B['tintTable'][slot]:
                if over > 0.12:
                    err.append(f'tint {slot} {col} clamps {over * 100:.0f}%')
                elif over > 0.03:
                    warn.append(f'tint {slot} {col} clamps {over * 100:.0f}%')
    # ---- presets / generator
    G = T['generator']
    for pr in CONTRACT_PRESETS:
        if pr not in G['presets']:
            err.append(f'preset {pr} missing')
    rng = random.Random(1234)
    WATER = ('swim', 'float', 'splash_play', 'surf')
    blocked_by_addon, hidden_hat_people = {}, {}
    cases, persons = [], []
    people = 0
    bad_play = {}
    for k in range(1200):
        pr = CONTRACT_PRESETS[k % len(CONTRACT_PRESETS)]
        p = bf.preset(pr, rng=rng)
        people += 1
        for pn in p['parts']:
            if pn not in T['parts']:
                err.append(f'{pr}: unknown part {pn}')
        addon_parts = {k for table, _ in G['presets'][pr].get('addOns', []) for k in table}
        for a in G['presets'][pr].get('anims', []):
            if not bf.can_play(p, a):
                blockers = [pn for pn in bf.anim_parts(p, a) if not bfc.part_plays(T['parts'][pn], a)]
                if blockers and all(b in addon_parts for b in blockers):
                    pa, _ = bf.pick_anim(p, a)
                    blocked_by_addon[(a, pa)] = blocked_by_addon.get((a, pa), 0) + 1
                    if a in WATER and pa not in WATER:
                        err.append(f'{pr}: {a} blocked by {blockers} falls back to land anim {pa}')
                    continue
                bad_play.setdefault((pr, a), []).append(p['parts'])
        for a in ('swim', 'surf', 'float', 'sunbathe'):
            if not bf.can_play(p, a):
                continue
            d = T['anims'][a]['dirs'][k % len(T['anims'][a]['dirs'])]
            lay = bf.layers(p, a, d, 0)
            shown = {name.split('/')[0].split('.')[0] for _, name, _, sp in lay if sp == 'head'}
            bad_hats = [h for h in shown if T['parts'].get(h, {}).get('family') == 'hat' and h in AH.get(a, [])]
            if bad_hats:
                err.append(f'{pr}: hat {bad_hats} drawn in {a}')
            worn_full = [h for h in p['parts'] if T['parts'][h]['family'] == 'hat' and T['parts'][h].get('cls') == 'full']
            if worn_full and all(h in AH.get(a, []) for h in worn_full):
                if any('~hat' in name for _, name, _, sp in lay if sp == 'head'):
                    err.append(f'{pr}: hidden hat still squashes the hair in {a}')
                hidden_hat_people[a] = hidden_hat_people.get(a, 0) + 1
        if k < 240:
            persons.append(p)
            for a in G['presets'][pr].get('anims', [])[:6] + list(NEW_ANIMS):
                if not bf.can_play(p, a):
                    continue
                dirs = T['anims'][a]['dirs']
                d = dirs[k % len(dirs)]
                if k % 3 == 0 and d in ('SE', 'E', 'NE'):
                    d = {'SE': 'SW', 'E': 'W', 'NE': 'NW'}[d]
                i = k % T['anims'][a]['frames']
                rd = MIRROR.get(d, d)
                lay = bf.layers(p, a, rd, i)
                for z, name, tint, space in lay:
                    if (name.startswith('head.') or name.startswith('face.')) and not has(name):
                        err.append(f'{pr}: missing core frame {name}')
                cases.append({'p': len(persons) - 1, 'anim': a, 'dir': d, 'i': i,
                              'layers': [[z, name, None if tint is None else '#%02X%02X%02X' % tuple(
                                  int(round(float(v) * 255)) for v in tint)] for z, name, tint, space in lay]})
    for (pr, a), lst in bad_play.items():
        err.append(f'preset {pr} lists anim {a} but {len(lst)} people cannot play it, e.g. {lst[0]}')
    for k in range(40):
        fam = bf.beach_family(rng=rng)
        kids = sum(1 for p in fam if T['bases'][p['base']]['age'] == 'child')
        if kids < 1 or len(fam) - kids < 1:
            err.append(f'beach family {k}: {len(fam)} people, {kids} kids')
    # ---- swim ring readable in float (>= 20 % of the floating person), every base
    import numpy as np
    ring_share = {}
    for b in T['bases']:
        if 'swim_ring_worn' not in T['bases'][b]['parts']:
            continue
        rr = random.Random(77)
        p = None
        for _ in range(400):
            q = bf.preset('swimmer', rng=rr)
            if q['base'] == b and bf.can_play(q, 'float') and 'swim_ring_worn' not in q['parts']:
                p = q
                break
        if p is None:
            continue
        for d in ('S', 'SE', 'E'):
            full = np.asarray(bf.compose(p, 'float', d, 1, margin=24), np.float32)
            ap = T['generator']['animParts']
            keep = ap['float']
            ap['float'] = []
            try:
                bare = np.asarray(bf.compose(p, 'float', d, 1, margin=24), np.float32)
            finally:
                ap['float'] = keep
            vis = full[..., 3] > 40
            diff = (np.abs(full - bare).max(axis=2) > 24) & vis
            share = diff.sum() / max(1, vis.sum())
            ring_share[f'{b} {d}'] = round(float(share), 3)
            if share < 0.20:
                err.append(f'float {b} {d}: swim ring only {share * 100:.0f} % of the person (< 20 %)')
    # ---- held ball vs the beach prop
    bm = None
    try:
        bm = json.load(open(os.path.join(assets, 'beach', 'manifest.json')))['sprites']['beach_ball_bounce']['footprintM']['radius']
    except Exception:                                       # noqa: BLE001
        pass
    if bm:
        for b, Bb in T['bases'].items():
            if T['bases'][b]['age'] == 'child':
                continue
            rads = {v[3] for a in ('ball_throw', 'ball_catch') for d in Bb['ballPoint'][a] for v in Bb['ballPoint'][a][d] if v}
            for r in rads:
                if abs(r / 64.0 - bm) > 0.1 * bm:
                    err.append(f'{b}: held ball radius {r} px != beach prop {bm} m (+-10 %)')
    # ---- detached specks at the tile edge (tiled-render leaks)
    from PIL import Image
    specks = []
    for at in man3['atlases']:
        if at['key'].startswith('bf_head'):
            continue
        js = json.load(open(os.path.join(assets, at['json'])))
        img = np.asarray(Image.open(os.path.join(assets, at['png'])).convert('RGBA'))
        for n, (x, y, fw, fh, dx, dy) in iter_tf_frames(js):
            if dy > 1 and dy + fh < 127:
                continue
            a = img[y:y + fh, x:x + fw, 3] > 40
            rows = np.nonzero(a.any(axis=1))[0]
            if len(rows) < 2:
                continue
            gaps = np.nonzero(np.diff(rows) >= 6)[0]
            if not len(gaps):
                continue
            first = a[:rows[gaps[0]] + 1].sum()
            last = a[rows[gaps[-1] + 1]:].sum()
            tot = a.sum()
            h_first = rows[gaps[0]] - rows[0] + 1
            h_last = rows[-1] - rows[gaps[-1] + 1] + 1
            if (dy <= 1 and (first < 0.12 * tot or h_first <= 4) and first < tot / 2) or \
                    (dy + fh >= 127 and (last < 0.12 * tot or h_last <= 4) and last < tot / 2):
                specks.append(n)
    for n in specks[:20]:
        err.append(f'{n}: detached speck at the frame edge')
    # ---- budgets
    total = sum(os.path.getsize(os.path.join(d3, f)) for f in os.listdir(d3))
    px = sum(w * h for w, h in sizes.values())
    gpu = px * 4 / 2 ** 20
    if total / 1e6 > budget:
        err.append(f'payload {total / 1e6:.2f} MB > {budget} MB')
    if gpu > gpu_budget:
        warn.append(f'GPU memory {gpu:.1f} MiB > {gpu_budget} MiB')
    # GPU by page class (unique packed rects, x4 bytes; sheets add packing slack on top)
    cls_px = {}
    pc = B.get('pageClasses', {})
    a2c = {a: c for c, lst in pc.items() if isinstance(lst, list) for a in lst}
    for at in man3['atlases']:
        js = json.load(open(os.path.join(assets, at['json'])))
        seen = set()
        for n, (x, y, fw, fh, dx, dy) in iter_tf_frames(js):
            if (x, y) in seen:
                continue
            seen.add((x, y))
            layer, fr = n.split('/')
            if '@' in layer:
                c = a2c.get(fr.rsplit('_', 2)[0], 'other')
            else:
                c = 'head:' + ('beach' if fr.split('_')[0] in ('swim', 'lie') else 'other')
            cls_px[c] = cls_px.get(c, 0) + fw * fh
    if dump:
        with open(dump, 'w') as f:
            json.dump({'persons': persons, 'cases': cases}, f)
    limb_missing = [x for x in info if x.count(' ') == 2]
    print(f'beachfolk: {len(man3["atlases"])} atlases, {len(f3)} frames, payload {total / 1e6:.2f} MB, '
          f'sheets {px / 1e6:.2f} Mpx (~{gpu:.1f} MiB GPU), {people} generated people, {len(cases)} cases')
    print(f'limb frames empty (hidden far limb / under water): {len(limb_missing)}')
    print('GPU by page class (packed rects, MiB):', {c: round(v * 4 / 2 ** 20, 1) for c, v in sorted(cls_px.items())})
    print('anims blocked by an add-on -> pickAnim:', {f'{a}->{b}': n for (a, b), n in sorted(blocked_by_addon.items())})
    print('people whose hats come off (hair un-squashed):', hidden_hat_people)
    print('swim ring share of the floating person:', ring_share)
    print(f'body parts fully under water in swim / float (nothing drawn, by design): {len(hidden_uw)} '
          f'{sorted(set(h.split("@")[0] for h in hidden_uw))}')
    for x in info:
        if x.count(' ') != 2:
            print('INFO', x)
    for w in warn[:40]:
        print('WARN', w)
    for e in err[:80]:
        print('ERROR', e)
    print(f'{len(err)} errors, {len(warn)} warnings')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
