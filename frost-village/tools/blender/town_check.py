"""
town_check.py - verify assets/town/ against docs/CONTRACT_V4.md section K.

    python3 tools/blender/town_check.py [--out DIR]

Checks: every REQUIRED sprite / train character exists; atlases exist, every sheet <= 2048 px; every referenced frame
exists in its atlas JSON; anchors are normalised and agree with sourceSize; work anims have 4 frames sharing the idle
frame size; building points are [dx, dy] pairs; rail tiles carry tileAxis / stepPx / segM; train cars have every
{anim}_{dir}_{i} frame in the 5 render dirs + 8 shadow frames; no sprite / character key collides with another
fragment's manifest; payload <= 8 MB.  Exit 1 on errors.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 8.0

BUILDINGS = ['school', 'town_hall', 'post_office', 'clinic', 'police_box', 'fire_station', 'cafe', 'clothing_store',
             'hair_salon', 'flower_shop', 'bookstore', 'toy_shop', 'restaurant', 'supermarket', 'hardware_store',
             'carpenter_workshop', 'apartment_a', 'apartment_b', 'townhouse_a', 'townhouse_b', 'townhouse_c',
             'townhouse_d', 'train_station']
PROPS = ['park_fountain', 'playground', 'streetlight', 'streetlight_double', 'bench_x', 'bench_y', 'sled_stop',
         'town_gate', 'town_gate_x']
RAILS = ['rail_x', 'rail_y', 'rail_x_crossing', 'rail_y_crossing', 'rail_x_end_p', 'rail_x_end_n', 'rail_y_end_p',
         'rail_y_end_n']
REQUIRED = BUILDINGS + PROPS + RAILS
REQUIRED_CHARS = ['train_engine', 'train_car_a', 'train_car_b']
ANIMATED = {'school': 'ring', 'hair_salon': 'spin', 'park_fountain': 'water'}
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
SHOPS = ['cafe', 'clothing_store', 'hair_salon', 'flower_shop', 'bookstore', 'toy_shop', 'restaurant', 'supermarket',
         'hardware_store', 'carpenter_workshop']


def main():
    out = os.path.join(ASSETS, 'town')
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    errs, warns = [], []
    mp = os.path.join(out, 'manifest.json')
    if not os.path.exists(mp):
        print('town_check: no manifest at %s' % mp)
        sys.exit(1)
    man = json.load(open(mp, encoding='utf-8'))
    base = os.path.dirname(out)
    atl = {}
    from PIL import Image
    payload = os.path.getsize(mp)
    for a in man.get('atlases', []):
        png, js = os.path.join(base, a['png']), os.path.join(base, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            errs.append('atlas %s files missing' % a['key'])
            continue
        payload += os.path.getsize(png) + os.path.getsize(js)
        im = Image.open(png)
        if im.width > 2048 or im.height > 2048:
            errs.append('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        atl[a['key']] = json.load(open(js))['frames']
    sprites = man.get('sprites', {})
    chars = man.get('characters', {})
    for k in REQUIRED:
        if k not in sprites:
            errs.append('missing sprite %s' % k)
    for c in REQUIRED_CHARS:
        if c not in chars:
            errs.append('missing character %s' % c)

    def has(akey, fr):
        return akey in atl and fr in atl[akey]

    for k, s in sprites.items():
        if not has(s.get('atlas'), s.get('frame')):
            errs.append('%s: frame %s not in atlas %s' % (k, s.get('frame'), s.get('atlas')))
            continue
        f = atl[s['atlas']][s['frame']]
        if [f['sourceSize']['w'], f['sourceSize']['h']] != s.get('frameSize'):
            errs.append('%s: frameSize %s != sourceSize %s' % (k, s.get('frameSize'), f['sourceSize']))
        ax, ay = s['anchor']
        if not (0 <= ax <= 1 and 0 <= ay <= 1):
            errs.append('%s: anchor not normalised %s' % (k, s['anchor']))
        if 'footprint' not in s:
            errs.append('%s: no footprint' % k)
        for an, a in s.get('anims', {}).items():
            if len(a['frames']) != 4:
                errs.append('%s.%s: %d frames (4 expected)' % (k, an, len(a['frames'])))
            for fr in a['frames']:
                if not has(s['atlas'], fr):
                    errs.append('%s.%s: frame %s missing' % (k, an, fr))
                elif atl[s['atlas']][fr]['sourceSize'] != f['sourceSize']:
                    errs.append('%s.%s: frame %s size differs from idle' % (k, an, fr))
        for field, v in s.items():
            if field.endswith('Point'):
                if not (isinstance(v, list) and len(v) == 2 and all(isinstance(q, int) for q in v)):
                    errs.append('%s.%s: not a [dx, dy] int pair: %r' % (k, field, v))
            if field.endswith('Points'):
                if not (isinstance(v, list) and v and all(isinstance(p, list) and len(p) == 2 for p in v)):
                    errs.append('%s.%s: bad point list' % (k, field))
                dfield = field[:-6] + 'Dirs'
                if dfield in s and len(s[dfield]) != len(v):
                    errs.append('%s.%s: %d dirs for %d points' % (k, dfield, len(s[dfield]), len(v)))
    for k, an in ANIMATED.items():
        if k in sprites and an not in sprites[k].get('anims', {}):
            errs.append('%s: anim %s missing' % (k, an))
    for k in SHOPS:
        s = sprites.get(k, {})
        for f in ('doorPoint', 'customerPoints', 'staffPoints'):
            if s and f not in s:
                errs.append('%s: %s missing' % (k, f))
    for k in BUILDINGS:
        s = sprites.get(k, {})
        if s and 'doorPoint' not in s:
            errs.append('%s: doorPoint missing' % k)
    st = sprites.get('train_station', {})
    for f in ('trackPoint', 'boardPoints', 'waitPoints', 'trainStops'):
        if st and f not in st:
            errs.append('train_station: %s missing' % f)
    for k in RAILS:
        s = sprites.get(k, {})
        if s:
            for f in ('tileAxis', 'stepPx', 'segM', 'openEnds'):
                if f not in s:
                    errs.append('%s: %s missing' % (k, f))
            exp = [64, 32] if s.get('tileAxis') == 'x' else [64, -32]
            if s.get('stepPx') != exp:
                errs.append('%s: stepPx %s != %s' % (k, s.get('stepPx'), exp))
    nframes = 0
    for c, e in chars.items():
        a = e.get('atlas')
        for an, info in e.get('anims', {}).items():
            for d in DIRS:
                for i in range(info['frames']):
                    nframes += 1
                    fr = '%s_%s_%d' % (an, d, i)
                    if not has(a, fr):
                        errs.append('%s: frame %s missing' % (c, fr))
                    elif [atl[a][fr]['sourceSize']['w'], atl[a][fr]['sourceSize']['h']] != e['frameSize']:
                        errs.append('%s: frame %s size differs' % (c, fr))
        shf = e.get('shadowFrames', {})
        for d in ALL8:
            fr = shf.get('frames', {}).get(d)
            if not fr or not has(shf.get('atlas'), fr):
                errs.append('%s: shadow frame for %s missing' % (c, d))
        for f in ('couplerM', 'lengthM', 'boardPoint'):
            if f not in e:
                errs.append('%s: %s missing' % (c, f))
        for p in ('smokePoint', 'cargoPoint', 'boardPoint', 'lampPoint'):
            if p in e and set(e[p]) != set(DIRS):
                errs.append('%s.%s: dirs %s' % (c, p, sorted(e[p])))
    # key collisions with the other fragments
    for frag in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, frag, 'manifest.json')
        if frag == os.path.basename(out) or not os.path.exists(p):
            continue
        try:
            o = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        for k in set(o.get('sprites', {})) & set(sprites):
            errs.append('sprite key %s also in assets/%s' % (k, frag))
        for k in set(o.get('characters', {})) & set(chars):
            errs.append('character key %s also in assets/%s' % (k, frag))
        for k in {a['key'] for a in o.get('atlases', [])} & set(atl):
            errs.append('atlas key %s also in assets/%s' % (k, frag))
    mb = payload / 1048576.0
    if mb > BUDGET_MB:
        errs.append('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    for e in errs:
        print('ERROR', e)
    for w in warns:
        print('WARN', w)
    print('town_check: %d sprites (%d required), %d train cars, %d car frames, %d atlases, payload %.2f MB: %d errors, '
          '%d warnings' % (len(sprites), len(REQUIRED), len(chars), nframes, len(atl), mb, len(errs), len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
