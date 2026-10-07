"""
tf2_check.py - validate assets/townfolk2 (CONTRACT_V5 Q) together with assets/townfolk.  Plain python3.

    python3 tools/blender/tf2_check.py [--assets DIR] [--budget-mb 7]

Checks: fragment manifest structure; atlases exist, tfatlas v1, <= 2048 px, png size = json size, rects in
bounds; no frame name in two atlases and none shared with assets/townfolk; the merge (merge_townfolk) has no
key collisions; anims sad 4 / clap 6 / sit 4 (S, SE, E) + push 8 (5 dirs) with timelines; head pose 'down';
every base (incl. round) has headOffset for every new frame, pushPoint for 5 dirs, seat; limb frames for every
new frame (far-side hidden limbs reported, not errors); every body part a base can wear has frames in every new
anim; the new body parts have frames in every v4 anim (minus noAnims); every head layer has its 'down' frames;
new head parts exist in every head frame; new face exprs exist for every pose listed in faceExprs; new tint
slots have refs / tables and no palette colour clamps (> 12 %); presets only name existing parts and wear what
they promise; 400 merged-generator people (incl. every new preset) compose in every new anim without missing
core layers; payload budget.
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

from townfolk_compose import iter_tf_frames, srgb_to_lin, lin_to_srgb, hex_rgb      # noqa: E402
from townfolk2_compose import merge_townfolk, Townfolk2, generate2, atlas_of       # noqa: E402

NEW_ANIMS = {'sad': (4, 3), 'clap': (6, 3), 'sit': (4, 3), 'push': (8, 5)}
OLD_ANIMS = ['idle', 'walk', 'carry_walk', 'talk', 'wave', 'happy']
NEW_PARTS = {'wedding_dress': 'body', 'veil': 'head', 'groom_suit': 'body', 'flower_crown': 'head',
             'mourning_coat': 'body', 'black_hat': 'head', 'held_bouquet': 'body'}
NEW_PRESETS = {'bride': ['wedding_dress', 'veil', 'flower_crown', 'held_bouquet'], 'groom': ['groom_suit'],
               'wedding_guest': [], 'flower_girl': ['flower_crown', 'held_bouquet'],
               'mourner': ['mourning_coat', 'held_bouquet'], 'mourner_family': ['mourning_coat', 'held_bouquet']}


def tc_dir_ok(T, anim, d):
    return {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(d, d) in T['anims'][anim]['dirs']


def load_frames(assets, man, err, tag):
    from PIL import Image
    frames = {}
    for at in man['atlases']:
        for k in ('png', 'json'):
            if not os.path.exists(os.path.join(assets, at[k])):
                err.append(f'{tag}: missing {at[k]}')
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
            frames[n] = at['key']
            if x < 0 or y < 0 or x + fw > w or y + fh > h or dx < 0 or dy < 0 or dx + fw > 128 or dy + fh > 128:
                err.append(f'{n}: rect out of bounds')
    return frames


def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    budget = 7.0
    if '--assets' in args:
        assets = args[args.index('--assets') + 1]
    if '--budget-mb' in args:
        budget = float(args[args.index('--budget-mb') + 1])
    err, warn, info = [], [], []
    d2 = os.path.join(assets, 'townfolk2')
    man1 = json.load(open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8'))
    man2 = json.load(open(os.path.join(d2, 'manifest.json'), encoding='utf-8'))
    if 'townfolk2' not in man2:
        print('ERROR no townfolk2 block')
        sys.exit(1)
    T1, F = man1['townfolk'], man2['townfolk2']
    f1 = load_frames(assets, man1, err, 'townfolk')
    f2 = load_frames(assets, man2, err, 'townfolk2')
    for n in set(f1) & set(f2):
        err.append(f'frame {n} in both fragments')
    keys1 = {a['key'] for a in man1['atlases']}
    for a in man2['atlases']:
        if a['key'] in keys1:
            err.append(f'atlas key {a["key"]} clashes with assets/townfolk')
        if not a['png'].startswith('townfolk2/'):
            err.append(f'{a["key"]}: path {a["png"]} not under townfolk2/')
    try:
        T = merge_townfolk(T1, F)
    except Exception as e:                      # noqa: BLE001
        print('ERROR merge:', e)
        sys.exit(1)
    frames = dict(f1)
    frames.update(f2)
    # every frame of both fragments must resolve (frameAtlas / frameAtlasAnim / frameAtlasPose) to its atlas
    nbad = 0
    for n, key in frames.items():
        got = atlas_of(T, n)
        if got != key:
            nbad += 1
            if nbad <= 10:
                err.append(f'atlas lookup of {n} -> {got}, frame is in {key}')
    if nbad > 10:
        err.append(f'... {nbad} frames resolve to the wrong atlas')
    # anims + timeline
    for a, (n, nd) in NEW_ANIMS.items():
        info_ = T['anims'].get(a)
        if not info_ or info_['frames'] != n or len(info_['dirs']) != nd:
            err.append(f'anim {a}: {info_}')
            continue
        for dd in info_['dirs']:
            if len(T['timeline'][a][dd]) != n:
                err.append(f'timeline {a} {dd}')
            for k, t in enumerate(T['timeline'][a][dd]):
                if t['hp'] not in T['headPoses']:
                    err.append(f'timeline {a} {dd} {k}: head pose {t["hp"]}')
    if T['headPoses'].get('down', {}).get('dirs') != ['S', 'SE', 'E']:
        err.append('head pose down missing / wrong dirs')
    # bases
    hidden = []
    for base, B in T['bases'].items():
        rb = B.get('render', base)
        for a, (n, nd) in NEW_ANIMS.items():
            for dd in T['anims'][a]['dirs']:
                ho = B['headOffset'].get(a, {}).get(dd)
                if not ho or len(ho) != n:
                    err.append(f'{base}: headOffset {a} {dd}')
                for i in range(n):
                    for limb in ('arm_R', 'arm_L', 'hand_R', 'hand_L'):
                        nm = f'{limb}@{rb}/{a}_{dd}_{i}'
                        if nm not in frames:
                            if limb.endswith('_L') and dd in ('SE', 'E', 'NE'):
                                hidden.append(nm)
                            else:
                                err.append(f'missing {nm}')
        if sorted(B.get('pushPoint', {})) != sorted(T['dirs']):
            err.append(f'{base}: pushPoint dirs {sorted(B.get("pushPoint", {}))}')
        if 'seat' not in B:
            err.append(f'{base}: no seat')
        if rb != base:
            continue
        # every body part this base can wear has frames in every new anim
        for pn in B['parts']:
            P = T['parts'][pn]
            if P['space'] != 'body':
                continue
            for a in list(NEW_ANIMS) + (OLD_ANIMS if pn in NEW_PARTS else []):
                if a in P.get('noAnims', []):
                    if any(f'{pn}.{s}@{base}/{a}_S_0' in frames for s in P['subs']):
                        err.append(f'{pn}@{base}: has frames in noAnims {a}')
                    continue
                for dd in T['anims'][a]['dirs']:
                    if not any(f'{pn}.{s}@{base}/{a}_{dd}_{i}' in frames for s in P['subs']
                               for i in range(T['anims'][a]['frames'])):
                        err.append(f'{pn}@{base}: no frame in {a}_{dd}')
    # head layers: every v4 head layer with a soc frame also has the down frame
    soc_layers = {n.split('/')[0] for n in f1 if n.endswith('/soc_S') or n.endswith('/soc_SE') or n.endswith('/soc_E')}
    for layer in sorted(soc_layers):
        if layer.startswith('face.') or layer.startswith('brow.'):
            continue
        for dd in ('S', 'SE', 'E'):
            if f'{layer}/soc_{dd}' in f1 and f'{layer}/down_{dd}' not in frames:
                err.append(f'head layer {layer}: no down_{dd}')
    head_frames = [f'{hp}_{dd}' for hp, H in T['headPoses'].items() for dd in H['dirs']]
    for pn, sp in NEW_PARTS.items():
        P = T['parts'].get(pn)
        if P is None:
            err.append(f'missing part {pn}')
            continue
        if P['space'] != sp:
            err.append(f'{pn}: space {P["space"]}')
        if sp == 'head':
            for hf in head_frames:
                if not any(f'{pn}.{s}/{hf}' in frames for s in P['subs']):
                    err.append(f'head part {pn}: no frame {hf}')
    for hp, exprs in T['faceExprs'].items():
        for fs in T['faces']:
            for dd in T['headPoses'][hp]['dirs']:
                if dd not in T['faceDirs']:
                    continue
                for e in exprs:
                    if f'face.{fs}.{e}/{hp}_{dd}' not in frames:
                        err.append(f'missing face.{fs}.{e}/{hp}_{dd}')
                if f'brow.{fs}.sad/{hp}_{dd}' not in frames:
                    err.append(f'missing brow.{fs}.sad/{hp}_{dd}')
    # tints
    M = T['tintModel']
    import numpy as np
    for slot in ('gown', 'flower', 'flower2', 'wrap'):
        if slot not in T['tintRef'] or slot not in T['tintTable']:
            err.append(f'tint slot {slot}: no ref / table')
    for slot, tbl in F['tintTable'].items():
        ref = T['tintRef'].get(slot, T['tintRef']['default'])
        S = np.asarray(M.get('slotS', {}).get(slot, M['S']), np.float32)
        for c in tbl:
            r = (lin_to_srgb(srgb_to_lin(hex_rgb(c)) + S) / lin_to_srgb(srgb_to_lin(hex_rgb(ref)) + S)).max()
            if r > 1.12:
                err.append(f'tint {slot} {c}: {r:.2f}x brighter than ref {ref} (clamps)')
            elif r > 1.02:
                warn.append(f'tint {slot} {c}: clamps slightly ({r:.2f})')
    # presets / generator
    G = T['generator']
    for pr, P in F['generator']['presets'].items():
        for k in ('tops', 'bottoms', 'shoes', 'hats', 'hair', 'headAcc', 'extra', 'glasses', 'neck', 'bag'):
            v = P.get(k)
            if not v:
                continue
            names = list(v) if isinstance(v, (list, dict)) else [v]
            for pn in names:
                if pn not in T['parts']:
                    err.append(f'preset {pr}.{k}: unknown part {pn}')
    tf = Townfolk2(T, None)
    rng = random.Random(2026)
    presets = list(NEW_PRESETS) + [None, None, 'teacher', 'police', 'doctor']
    sigs = set()
    counts = []
    for k in range(400):
        pr = presets[k % len(presets)]
        p = generate2(T, rng, pr)
        if pr in NEW_PRESETS:
            for need in NEW_PRESETS[pr]:
                if need not in p['parts']:
                    err.append(f'person {k} ({pr}) misses {need}: {p["parts"]}')
        fams = [T['parts'][pn]['family'] for pn in p['parts']]
        for need in ('top', 'shoes'):
            if need not in fams:
                err.append(f'person {k} ({pr}) has no {need}: {p["parts"]}')
        for slot in ('gown', 'flower', 'wrap'):
            if pr in ('bride',) and slot not in p['colors']:
                err.append(f'bride {k} has no colour for {slot}')
        n = 0
        for a, dd, i in (('sad', 'S', 0), ('clap', 'SE', 2), ('sit', 'E', 1), ('push', 'N', 3), ('push', 'SE', 5)):
            core = 0
            for z, nm, tint, space in tf.layers(p, a, dd, i):
                if nm in frames:
                    n += 1
                    if nm.startswith('head.') or nm.startswith('arm_R@') or '.main@' in nm:
                        core += 1
                elif nm.startswith('head.') or nm.startswith('face.') or (nm.startswith('arm_R@') and dd != 'N'):
                    err.append(f'person {k} ({pr}): missing core frame {nm}')
            if core < 2:
                err.append(f'person {k} ({pr}): {a}_{dd}_{i} has {core} core layers')
        counts.append(n / 5)
        sigs.add(json.dumps([p['base'], sorted(p['parts']), sorted(p['colors'].items())]))
    if '--dump' in args:                    # python reference draw lists for tools/test/townfolk2_parity.mjs
        dump = args[args.index('--dump') + 1]
        r2 = random.Random(77)
        persons, cases = [], []
        anims = [(a, dd, i) for a in ('sad', 'clap', 'sit', 'push', 'idle', 'walk', 'happy', 'wave')
                 for dd in ('S', 'SE', 'E', 'SW', 'W', 'NE', 'N', 'NW') for i in range(T['anims'][a]['frames'])
                 if tc_dir_ok(T, a, dd)]
        for k in range(150):
            pr = presets[k % len(presets)]
            p = generate2(T, r2, pr)
            persons.append(p)
            for _ in range(8):
                a, dd, i = r2.choice(anims)
                face = r2.choice([None, None, 'sad', 'tear', 'smile'])
                rd = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}.get(dd, dd)
                lst = tf.layers(p, a, rd, i, face=face)
                cases.append({'p': k, 'anim': a, 'dir': dd, 'i': i, 'face': face,
                              'layers': [[z, nm, None if t is None else '#%02X%02X%02X' % tuple(
                                  int(round(float(v) * 255)) for v in t)] for z, nm, t, sp in lst]})
        os.makedirs(os.path.dirname(dump), exist_ok=True)
        json.dump({'persons': persons, 'cases': cases}, open(dump, 'w'))
        print(f'dumped {len(cases)} draw lists -> {dump}')
    total = sum(os.path.getsize(os.path.join(d2, f)) for f in os.listdir(d2))
    if total > budget * 1e6:
        err.append(f'payload {total / 1e6:.2f} MB > {budget} MB')
    area = 0
    for at in man2['atlases']:
        js = json.load(open(os.path.join(assets, at['json'])))
        area += js['size'][0] * js['size'][1]
    print(f'townfolk2: {len(man2["atlases"])} atlases, {len(f2)} frame names, new parts {len(F["parts"])}, '
          f'new presets {len(F["generator"]["presets"])}, merged {len(T["parts"])} parts / {len(T["anims"])} anims')
    print(f'payload {total / 1e6:.2f} MB, texture area {area / 1e6:.2f} Mpx ({area * 4 / 2 ** 20:.0f} MiB RGBA), '
          f'sprites per person (new anims) avg {sum(counts) / len(counts):.1f} (max {max(counts):.0f}), '
          f'{len(sigs)}/400 distinct')
    if hidden:
        print(f'{len(hidden)} far-side limb frames are empty in the new anims (hidden behind the body)')
    for w in warn[:12]:
        print('WARN', w)
    if len(warn) > 12:
        print(f'... {len(warn) - 12} more warnings')
    for e in err[:60]:
        print('ERROR', e)
    print(f'{len(err)} errors, {len(warn)} warnings')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
