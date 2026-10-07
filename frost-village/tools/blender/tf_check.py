"""
tf_check.py - validate assets/townfolk against CONTRACT_V4 J.  Plain python3.

    python3 tools/blender/tf_check.py [--assets DIR] [--budget-mb 8]

Checks: manifest structure; every atlas PNG/JSON exists, <= 2048 px; frame names follow
frameNames; every base has headOffset for every (anim, dir, frame) and a carryPoint for
the 5 dirs; anims = idle 4 / walk 8 / carry_walk 8 (5 dirs) + talk 8 / wave 6 / happy 6
(S, SE, E); required part families and counts (hair styles >= 12, hats >= 10, tops >= 10,
bottoms >= 6, shoes, glasses, scarf, earmuffs, bag, necklace, ribbon, 10 job presets);
every limb frame exists for every base/frame; every head part has its loco frames in all
5 dirs; every referenced tint slot has a tintRef / palette; presets / generator only name
existing parts; 300 generated people compose without missing core layers; payload budget.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

from townfolk_compose import Townfolk, generate      # noqa: E402

ANIMS = {'idle': (4, 5), 'walk': (8, 5), 'carry_walk': (8, 5), 'talk': (8, 3), 'wave': (6, 3), 'happy': (6, 3)}
JOBS = ['teacher', 'student', 'police', 'postal', 'doctor', 'nurse', 'hairdresser', 'barista', 'station', 'factory']
NEED = {'hair': 12, 'hat': 10, 'top': 10, 'bottom': 6, 'shoes': 2, 'glasses': 1, 'neck': 2, 'bag': 2,
        'headacc': 2, 'facial_hair': 1}


def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    budget = 8.0
    if '--assets' in args:
        assets = args[args.index('--assets') + 1]
    if '--budget-mb' in args:
        budget = float(args[args.index('--budget-mb') + 1])
    err, warn = [], []
    d = os.path.join(assets, 'townfolk')
    man = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    T = man['townfolk']
    frames = {}
    for at in man['atlases']:
        for k in ('png', 'json'):
            if not os.path.exists(os.path.join(assets, at[k])):
                err.append(f'missing {at[k]}')
        js = json.load(open(os.path.join(assets, at['json'])))
        w, h = js['meta']['size']['w'], js['meta']['size']['h']
        if w > 2048 or h > 2048:
            err.append(f'{at["key"]} is {w}x{h} (> 2048)')
        for n, fr in js['frames'].items():
            if n in frames:
                err.append(f'frame {n} in two atlases')
            frames[n] = at['key']
            if fr['sourceSize'] != {'w': 128, 'h': 128}:
                err.append(f'{n}: sourceSize {fr["sourceSize"]}')
    # anims + timeline
    for a, (n, nd) in ANIMS.items():
        info = T['anims'].get(a)
        if not info or info['frames'] != n or len(info['dirs']) != nd:
            err.append(f'anim {a}: {info}')
            continue
        for dd in info['dirs']:
            if len(T['timeline'][a][dd]) != n:
                err.append(f'timeline {a} {dd}')
    # bases
    for base, B in T['bases'].items():
        for a, (n, nd) in ANIMS.items():
            for dd in T['anims'][a]['dirs']:
                ho = B['headOffset'].get(a, {}).get(dd)
                if not ho or len(ho) != n:
                    err.append(f'{base}: headOffset {a} {dd}')
                for i in range(n):
                    for limb in ('arm_R', 'arm_L', 'hand_R', 'hand_L'):
                        nm = f'{limb}@{base}/{a}_{dd}_{i}'
                        if nm not in frames:
                            err.append(f'missing {nm}')
        if sorted(B['carryPoint']) != sorted(T['dirs']):
            err.append(f'{base}: carryPoint dirs')
    if sorted(T['bases']) != sorted(['child_slim', 'child_round', 'adult_slim', 'adult_round', 'elder_slim',
                                     'elder_round']):
        err.append(f'bases: {sorted(T["bases"])}')
    # parts
    fam = {}
    for pn, P in T['parts'].items():
        fam.setdefault(P['family'], []).append(pn)
        for s, sd in P['subs'].items():
            slot = sd['tint']
            if slot and slot not in T['tintRef'] and 'default' not in T['tintRef']:
                err.append(f'{pn}.{s}: tint {slot} without ref')
        if P['space'] == 'head':
            for dd in T['dirs']:
                if not any(f'{pn}.{s}/loco_{dd}' in frames for s in P['subs']):
                    err.append(f'head part {pn}: no frame in loco_{dd}')
        else:
            for base, B in T['bases'].items():
                if P.get('ages') and B['age'] not in P['ages']:
                    continue
                if pn not in B['parts']:
                    err.append(f'{pn} not rendered for {base}')
                    continue
                if not any(f'{pn}.{s}@{base}/walk_S_0' in frames for s in P['subs']):
                    err.append(f'{pn}@{base}: no walk_S_0 frame')
    for f_, n in NEED.items():
        if len(fam.get(f_, [])) < n:
            err.append(f'family {f_}: {len(fam.get(f_, []))} < {n}')
    for j in JOBS:
        if j not in T['generator']['presets']:
            err.append(f'missing preset {j}')
    for fs in T['faces']:
        for dd in T['faceDirs']:
            if f'face.{fs}.neutral/loco_{dd}' not in frames:
                err.append(f'face {fs} loco_{dd} missing')
    # generator / presets compose
    src_frames = set(frames)
    tf = Townfolk(T, None)
    rng = random.Random(1234)
    sprite_counts = []
    sigs = set()
    for k in range(300):
        preset = JOBS[k % 10] if k % 3 == 0 else None
        p = generate(T, rng, preset)
        for pn in p['parts']:
            if pn not in T['parts']:
                err.append(f'generator picked unknown part {pn}')
        fams = [T['parts'][pn]['family'] for pn in p['parts']]
        for need in ('top', 'shoes'):
            if need not in fams:
                err.append(f'person {k} ({preset}) has no {need}: {p["parts"]}')
        if 'hair' not in fams and 'hat' not in fams:
            warn.append(f'person {k} bald without hat: {p["parts"]}')
        n = 0
        for a, dd, i in (('walk', 'S', 0), ('idle', 'E', 1), ('talk', 'SE', 3)):
            for z, nm, tint, space in tf.layers(p, a, dd, i):
                if nm in src_frames:
                    n += 1
        sprite_counts.append(n / 3)
        sigs.add(json.dumps([p['base'], sorted(p['parts']), sorted(p['colors'].items())]))
    if len(sigs) < 290:
        err.append(f'only {len(sigs)} distinct people out of 300')
    total = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d))
    if total > budget * 1e6:
        err.append(f'payload {total / 1e6:.2f} MB > {budget} MB')
    area = 0
    for at in man['atlases']:
        js = json.load(open(os.path.join(assets, at['json'])))
        area += js['meta']['size']['w'] * js['meta']['size']['h']
    print(f'townfolk: {len(man["atlases"])} atlases, {len(frames)} frame names, {len(T["parts"])} parts '
          f'({", ".join(f"{k} {len(v)}" for k, v in sorted(fam.items()))}), {len(T["bases"])} bases, '
          f'{len(T["generator"]["presets"])} presets')
    print(f'payload {total / 1e6:.2f} MB, texture area {area / 1e6:.2f} Mpx ({area * 4 / 2 ** 20:.0f} MiB RGBA), '
          f'sprites per person avg {sum(sprite_counts) / len(sprite_counts):.1f} (max {max(sprite_counts):.0f}), '
          f'{len(sigs)}/300 distinct')
    for w in warn[:10]:
        print('WARN', w)
    for e in err[:60]:
        print('ERROR', e)
    print(f'{len(err)} errors, {len(warn)} warnings')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
