"""
cf_check.py - validate assets/cityfolk (CONTRACT_V8 AD) together with assets/townfolk + assets/townfolk2
(+ assets/beachfolk when present).  Plain python3.

    python3 tools/blender/cf_check.py [--assets DIR] [--budget-mb 7] [--dump cases.json]

Checks: fragment manifest structure; atlases exist, tfatlas v1, <= 2048 px, png size = json size, rects in bounds;
no frame name in two atlases or shared with another fragment; atlas keys / paths; the merge of every fragment
(cityfolk_compose.merge_fragments) has no key collisions and every packed frame resolves to its atlas; the twelve
anims (frames / dirs per the contract) with timelines whose head poses and faces exist; every base (incl. round)
has headOffset for every new frame, cfCover for every new anim, nozzle / box / sweep points; limb frames for every
new frame; every cast part has frames in every frame of its anims (at least one sub; per-frame holes reported);
anim items only in their anims; new head parts on every head frame; new face expressions on every face frame of
every face set; lower-body sharing (identical rects); tints (precomputed table, clamps); presets name existing
parts and wear what they promise; merged-generator people (every preset) can play their key anims and compose
without missing core layers; payload / GPU budget.  --dump writes Python draw lists for the JS parity test.
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

from townfolk_compose import iter_tf_frames, srgb_to_lin, lin_to_srgb, hex_rgb      # noqa: E402,F401
import cityfolk_compose as cc                                                       # noqa: E402
import townfolk2_compose as tc2                                                     # noqa: E402

CONTRACT = {'run': (8, 5), 'flee': (8, 5), 'arrested_walk': (8, 5), 'carry_box': (8, 5), 'argue': (6, 3),
            'fight': (6, 3), 'point': (6, 3), 'think': (4, 3), 'shocked': (4, 3), 'phone': (4, 3), 'sweep': (6, 3),
            'spray_hose': (4, 4)}
CONTRACT_DIRS = {'spray_hose': ['S', 'SE', 'E', 'NE']}
NEW_PARTS = ['hat_fire_helmet', 'top_fire_coat', 'bot_fire_pants', 'acc_air_tank', 'top_police_v2', 'top_stripes',
             'acc_eye_mask', 'hat_burglar_beanie', 'held_loot_sack', 'top_suit_3pc', 'top_teller_vest', 'acc_visor',
             'top_work_jacket', 'acc_gloves', 'hat_delivery_cap', 'top_delivery_polo', 'bot_mover_overalls',
             'acc_back_brace', 'top_hivis_jacket', 'acc_toolbelt', 'acc_camera', 'held_notepad', 'top_trench',
             'hat_deerstalker']
PRESETS = ['firefighter', 'police_officer', 'detective', 'burglar', 'banker', 'bank_teller', 'warehouse_worker',
           'forklift_driver', 'delivery_driver', 'mover', 'construction_worker', 'demolition_worker', 'reporter']
# what each preset must wear, and the anims it must be able to play (its job in the living city)
PROMISE = {
    'firefighter': (['top_fire_coat', 'bot_fire_pants', 'hat_fire_helmet'], ['spray_hose', 'run', 'point', 'idle', 'walk',
                                                                             'talk', 'happy', 'wave']),
    'police_officer': (['top_police_v2', 'hat_police', 'det_police'], ['run', 'point', 'phone', 'think', 'walk', 'talk']),
    'detective': (['top_trench'], ['think', 'point', 'phone', 'walk', 'talk', 'run']),
    'burglar': (['top_stripes', 'hat_burglar_beanie', 'acc_eye_mask', 'held_loot_sack'],
                ['flee', 'run', 'arrested_walk', 'walk', 'idle', 'fight', 'argue', 'sad', 'sit']),
    'banker': (['top_suit_3pc', 'det_tie'], ['walk', 'talk', 'think', 'shocked', 'phone', 'flee']),
    'bank_teller': (['top_teller_vest'], ['walk', 'talk', 'phone', 'shocked', 'flee']),
    'warehouse_worker': (['top_work_jacket', 'acc_gloves'], ['carry_box', 'carry_walk', 'walk', 'sweep']),
    'forklift_driver': (['hat_hardhat', 'det_hivis'], ['carry_box', 'walk', 'talk']),
    'delivery_driver': (['top_delivery_polo', 'hat_delivery_cap'], ['carry_box', 'run', 'walk', 'phone']),
    'mover': (['bot_mover_overalls', 'acc_back_brace'], ['carry_box', 'carry_walk', 'walk']),
    'construction_worker': (['top_hivis_jacket', 'hat_hardhat', 'acc_toolbelt'], ['sweep', 'carry_box', 'point', 'walk']),
    'demolition_worker': (['hat_hardhat', 'det_hivis', 'acc_gloves'], ['sweep', 'carry_box', 'point', 'walk']),
    'reporter': (['acc_camera', 'held_notepad'], ['run', 'phone', 'point', 'talk', 'walk', 'think', 'shocked']),
}


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
            frames[n] = (at['key'], (x, y, fw, fh, dx, dy))
            if x < 0 or y < 0 or x + fw > w or y + fh > h or dx < 0 or dy < 0 or dx + fw > 128 or dy + fh > 128:
                err.append(f'{n}: rect out of bounds')
    return frames


def main():
    args = sys.argv[1:]
    assets = os.path.join(GAME, 'assets')
    budget = 7.0
    dump = None
    if '--assets' in args:
        assets = args[args.index('--assets') + 1]
    if '--budget-mb' in args:
        budget = float(args[args.index('--budget-mb') + 1])
    if '--dump' in args:
        dump = args[args.index('--dump') + 1]
    err, warn, info = [], [], []
    man1 = json.load(open(os.path.join(assets, 'townfolk', 'manifest.json'), encoding='utf-8'))
    man3 = json.load(open(os.path.join(assets, 'cityfolk', 'manifest.json'), encoding='utf-8'))
    if 'cityfolk' not in man3:
        print('ERROR no cityfolk block')
        sys.exit(1)
    F = man3['cityfolk']
    frames = {k: v[0] for k, v in load_frames(assets, man1, err, 'townfolk').items()}
    rects3 = load_frames(assets, man3, err, 'cityfolk')
    f3 = {k: v[0] for k, v in rects3.items()}
    blocks = []
    keys_seen = {a['key'] for a in man1['atlases']}
    for frag in cc.FRAGMENT_ORDER:
        mp = os.path.join(assets, frag, 'manifest.json')
        if not os.path.exists(mp):
            continue
        man = json.load(open(mp, encoding='utf-8'))
        name, block = cc.fragment_block(man)
        fr = {k: v[0] for k, v in (rects3.items() if frag == 'cityfolk' else load_frames(assets, man, err, frag).items())}
        ov = set(block.get('overrides', []))
        for n in set(frames) & set(fr):
            if n not in ov:
                err.append(f'frame {n} in {frag} and an earlier fragment')
        for a in man['atlases']:
            if a['key'] in keys_seen:
                err.append(f'atlas key {a["key"]} clashes')
            keys_seen.add(a['key'])
        frames.update(fr)
        blocks.append((name, block))
        info.append(f'fragment {frag}: {len(man["atlases"])} atlases, {len(fr)} frames')
    for a in man3['atlases']:
        if not a['png'].startswith('cityfolk/'):
            err.append(f'{a["key"]}: path {a["png"]} not under cityfolk/')
    try:
        T = cc.merge_fragments(man1['townfolk'], blocks)
    except Exception as e:                      # noqa: BLE001
        print('ERROR merge:', e)
        sys.exit(1)
    # generic merge == townfolk2's own merge for v4 + v5
    t2 = dict(blocks).get('townfolk2')
    if t2 is not None:
        A = cc.merge_fragments(man1['townfolk'], [('townfolk2', t2)])
        B = tc2.merge_townfolk(man1['townfolk'], t2)
        A.pop('fragments', None)
        if json.dumps(A, sort_keys=True) != json.dumps(B, sort_keys=True):
            diff = [k for k in set(A) | set(B) if json.dumps(A.get(k), sort_keys=True) != json.dumps(B.get(k), sort_keys=True)]
            err.append(f'generic merge differs from townfolk2_compose.merge_townfolk in {diff}')
        else:
            info.append('generic merge(v4, townfolk2) == townfolk2_compose.merge_townfolk')
    # every frame resolves to its atlas
    nbad = 0
    ovs = set(T.get('overrides', []))
    for n, key in frames.items():
        got = cc.atlas_of(T, n)
        if got != key and n not in ovs:
            nbad += 1
            if nbad <= 10:
                err.append(f'atlas lookup of {n} -> {got}, frame is in {key}')
    if nbad > 10:
        err.append(f'... {nbad} frames resolve to the wrong atlas')
    # anims + timeline
    for a, (n, nd) in CONTRACT.items():
        inf = T['anims'].get(a)
        if not inf or inf['frames'] != n or len(inf['dirs']) != nd:
            err.append(f'anim {a}: {inf}')
            continue
        if a in CONTRACT_DIRS and inf['dirs'] != CONTRACT_DIRS[a]:
            err.append(f'anim {a} dirs {inf["dirs"]}')
        for d in inf['dirs']:
            if len(T['timeline'][a][d]) != n:
                err.append(f'timeline {a} {d}')
            for k, t in enumerate(T['timeline'][a][d]):
                if t['hp'] not in T['headPoses']:
                    err.append(f'timeline {a} {d} {k}: head pose {t["hp"]}')
                if d in T['faceDirs'] and t['face'] not in T['faceExprs'].get(t['hp'], []) and \
                        t['face'] not in ('neutral', 'blink', 'smile', 'happy', 'talk_open', 'talk_mid'):
                    err.append(f'timeline {a} {d} {k}: face {t["face"]} not rendered for pose {t["hp"]}')
    # bases
    hidden = []
    for base, B in T['bases'].items():
        rb = B.get('render', base)
        for a, (n, nd) in CONTRACT.items():
            for d in T['anims'][a]['dirs']:
                ho = B['headOffset'].get(a, {}).get(d)
                if not ho or len(ho) != n:
                    err.append(f'{base}: headOffset {a} {d}')
                for i in range(n):
                    for limb in ('arm_R', 'arm_L', 'hand_R', 'hand_L'):
                        nm = f'{limb}@{rb}/{a}_{d}_{i}'
                        if nm not in frames:
                            (hidden if limb.endswith('_L') and d in ('SE', 'E', 'NE') else err).append(f'missing {nm}')
            if a not in B.get('cfCover', {}):
                err.append(f'{base}: no cfCover for {a}')
        for key, anim in (('nozzlePoint', 'spray_hose'), ('boxPoint', 'carry_box'), ('sweepPoint', 'sweep')):
            tab = B.get(key, {}).get(anim, {})
            for d in T['anims'][anim]['dirs']:
                if len(tab.get(d, [])) != T['anims'][anim]['frames'] or any(v is None for v in tab.get(d, [])):
                    err.append(f'{base}: {key} {anim} {d}')
    if hidden:
        info.append(f'{len(hidden)} far-side limb frames hidden by the body (expected)')
    # coverage: every cast part has frames in every frame (some sub)
    holes = {}
    for base in ('child_slim', 'adult_slim', 'elder_slim'):
        if base not in T['bases']:
            continue
        B = T['bases'][base]
        for a, parts in B.get('cfCover', {}).items():
            inf = T['anims'][a]
            items = T.get('animItems', {}).get(a, [])
            for pn in list(parts) + items:
                P = T['parts'][pn]
                if P['space'] != 'body':
                    continue
                if a in P.get('noAnims', []) or (P.get('onlyAnims') and a not in P['onlyAnims']):
                    err.append(f'{base}: {pn} cast in {a} but has noAnims/onlyAnims excluding it')
                    continue
                got_any = False
                for d in inf['dirs']:
                    for i in range(inf['frames']):
                        ok = any(f'{pn}.{s}@{base}/{a}_{d}_{i}' in frames for s in P['subs'])
                        got_any |= ok
                        if not ok:
                            holes.setdefault(f'{pn}@{base} {a}', []).append(f'{d}{i}')
                if not got_any:
                    err.append(f'{base}: {pn} cast in {a} but has no frames at all')
    for k, v in holes.items():
        if len(v) > 4:
            warn.append(f'{k}: no frame in {len(v)} frames ({",".join(v[:6])}...)')
        else:
            info.append(f'{k}: hidden in {",".join(v)}')
    # anim items only in their anims
    for it, onl in [(k, v.get('onlyAnims')) for k, v in T['parts'].items() if v.get('onlyAnims')]:
        for n in frames:
            if n.startswith(it + '.') and '@' in n:
                anim = n.split('/')[1].rsplit('_', 2)[0]
                if anim not in onl:
                    err.append(f'{n}: anim item outside its anims')
                    break
    # head parts + faces
    hp_frames = [f'{hp}_{d}' for hp, info_ in T['headPoses'].items() for d in info_['dirs']]
    for pn in NEW_PARTS:
        P = T['parts'].get(pn)
        if P is None:
            err.append(f'missing part {pn}')
            continue
        if P['space'] != 'head':
            continue
        for hf in hp_frames:
            if not any(f'{pn}.{s}/{hf}' in frames for s in P['subs']):
                err.append(f'head part {pn} missing in {hf}')
    for hp, exprs in F['faceExprs'].items():
        for d in T['headPoses'][hp]['dirs']:
            if d not in T['faceDirs']:
                continue
            for fs in T['faces']:
                for e in exprs:
                    if f'face.{fs}.{e}/{hp}_{d}' not in frames:
                        err.append(f'missing face.{fs}.{e}/{hp}_{d}')
                for b in set(F['exprBrow'].values()):
                    if f'brow.{fs}.{b}/{hp}_{d}' not in frames:
                        err.append(f'missing brow.{fs}.{b}/{hp}_{d}')
    # lower-body sharing: shared frames are aliases of one rect
    share = F.get('lowerShare', {})
    nshare = 0
    for base in ('child_slim', 'adult_slim', 'elder_slim'):
        for layer in share.get('layers', []):
            for a1, a2 in (('run', 'flee'), ('arrested_walk', 'carry_box')):
                for d in T['anims'][a1]['dirs']:
                    for i in range(8):
                        n1, n2 = f'{layer}@{base}/{a1}_{d}_{i}', f'{layer}@{base}/{a2}_{d}_{i}'
                        if n1 in rects3 and n2 in rects3:
                            nshare += 1
                            if rects3[n1] != rects3[n2]:
                                err.append(f'lower layer not shared: {n1} vs {n2}')
    info.append(f'{nshare} lower-body frame pairs shared run/flee + arrested_walk/carry_box')
    # tints
    for slot, tbl in F['tintTable'].items():
        ref = T['tintRef'].get(slot, T['tintRef']['default'])
        for c, t in tbl.items():
            want = lin_to_srgb(srgb_to_lin(hex_rgb(c)))
            got = hex_rgb(t) * hex_rgb(ref)
            if float(abs(got - want).max()) > 0.12 and slot not in ('hands',):
                warn.append(f'tint {slot} {c} clamps ({float(abs(got - want).max()):.2f})')
    # presets + generator
    tf = cc.Cityfolk(T, None)
    rng = random.Random(7)
    for pr in PRESETS:
        if pr not in T['generator']['presets']:
            err.append(f'missing preset {pr}')
            continue
        must, anims = PROMISE[pr]
        fails = {}
        for k in range(60):
            p = tf.preset(pr, rng=rng)
            for pn in p['parts']:
                if pn not in T['parts']:
                    err.append(f'{pr}: unknown part {pn}')
            if not all(m in p['parts'] for m in must):
                fails.setdefault('wear', []).append(sorted(set(must) - set(p['parts'])))
            for a in anims:
                if not tf.can_play(p, a):
                    fails.setdefault(a, []).append(p['base'])
        for a, v in fails.items():
            (warn if a == 'wear' and len(v) < 6 else err).append(f'{pr}: {a} fails {len(v)}/60 {v[:3]}')
    # random people: how many can play each new anim (the cast)
    can = {a: 0 for a in CONTRACT}
    N = 600
    for k in range(N):
        p = tf.random_person(rng=rng)
        for a in CONTRACT:
            can[a] += tf.can_play(p, a)
    info.append('random townsfolk able to play: ' + ', '.join(f'{a} {100 * v / N:.0f}%' for a, v in can.items()))
    # payload / GPU
    d3 = os.path.join(assets, 'cityfolk')
    total = sum(os.path.getsize(os.path.join(d3, f)) for f in os.listdir(d3))
    area = 0
    for a in man3['atlases']:
        js = json.load(open(os.path.join(assets, a['json'])))
        area += js['size'][0] * js['size'][1]
    info.append(f'payload {total / 1e6:.2f} MB (budget {budget}), {len(man3["atlases"])} atlases, '
                f'{area / 1e6:.2f} Mpx = {area * 4 / 2 ** 20:.1f} MiB GPU')
    if total / 1e6 > budget:
        err.append(f'payload {total / 1e6:.2f} MB > {budget} MB')
    # dump python draw lists for the JS parity test
    if dump:
        cases, persons = [], []
        prng = random.Random(11)
        names = PRESETS + [None] * 4
        for k in range(300):
            pr = names[k % len(names)]
            p = tf.preset(pr, rng=prng) if pr else tf.random_person(rng=prng)
            persons.append(p)
            for a in prng.sample(sorted(T['anims']), 4):
                pick, face = tf.pick_anim(p, a)
                inf = T['anims'][pick]
                d = prng.choice(inf['dirs'] + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}.get(x, x) for x in inf['dirs']])
                rd = cc.MIRROR.get(d, d)
                i = prng.randrange(inf['frames'])
                no_items = prng.random() < 0.2
                lay = tf.layers(p, pick, rd, i, face=face, no_items=no_items)
                tints = []
                for z, nm, t, sp in lay:
                    tints.append([z, nm, None if t is None else '#%02X%02X%02X' % tuple(int(round(float(v) * 255))
                                                                                         for v in t)])
                cases.append({'p': k, 'anim': a, 'pick': pick, 'face': face, 'dir': d, 'i': i, 'noItems': no_items,
                              'canPlay': {x: tf.can_play(p, x) for x in ('run', 'flee', 'carry_box', 'spray_hose')},
                              'layers': tints,
                              'points': {'nozzle': tf.nozzle_point(p, d, i) if pick == 'spray_hose' else None,
                                         'box': tf.box_point(p, d, i) if pick == 'carry_box' else None,
                                         'sweep': tf.sweep_point(p, d, i) if pick == 'sweep' else None}})
        os.makedirs(os.path.dirname(os.path.abspath(dump)), exist_ok=True)
        with open(dump, 'w') as f:
            json.dump({'persons': persons, 'cases': cases}, f)
        info.append(f'dumped {len(cases)} draw lists -> {dump}')
    for x in info:
        print('INFO', x)
    for x in warn:
        print('WARN', x)
    for x in err[:60]:
        print('ERROR', x)
    print(f'{len(err)} errors, {len(warn)} warnings')
    sys.exit(1 if err else 0)


if __name__ == '__main__':
    main()
