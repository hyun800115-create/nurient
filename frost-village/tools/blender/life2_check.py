"""
life2_check.py - verify assets/life2/ against docs/CONTRACT_V5.md section P.

    python3 tools/blender/life2_check.py [--out DIR]

Checks: every REQUIRED sprite / stroller exists; atlases exist, every sheet <= 2048 px; every referenced frame
exists in its atlas JSON; anchors are normalised and agree with sourceSize; anims reference existing frames of the
same size; *Point / *Points are [dx, dy] int pairs with matching *Dirs; contract fields: wedding_chairs seatPoints,
memorial_garden 6 stonePoints, school_desk_row overlay, ribbon_garland attachTo town_hall (and town_hall exists in
assets/town), items 72 x 72 @ (36, 54) with stackStep 8..14; strollers have every {anim}_{dir}_{i} frame in the 5
render dirs (idle + move), 128 x 128 at (64, 104), handlePoint / pushOffset / babyPoint for every dir; no key
collides with another fragment's manifest; payload <= 2.5 MB.  Exit 1 on errors.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 2.5

WEDDING = ['wedding_arch', 'wedding_carpet', 'wedding_chairs', 'wedding_cake_table', 'flower_stand', 'ribbon_garland']
MEMORIAL = ['memorial_garden', 'memorial_stone', 'flower_wreath']
DECOR = ['cradle', 'school_desk_row']
ITEMS = ['item_bouquet', 'item_cake', 'item_gift_box', 'item_letter']
REQUIRED = WEDDING + MEMORIAL + DECOR + ITEMS
REQUIRED_CHARS = ['baby_stroller']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
VALID_DIRS = {'S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'}
SIT_DIRS = {'S', 'SE', 'E', 'SW', 'W'}      # sit frames exist for S / SE / E (+ mirrors)


def main():
    out = os.path.join(ASSETS, 'life2')
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    errs, warns = [], []
    mp = os.path.join(out, 'manifest.json')
    if not os.path.exists(mp):
        print('life2_check: no manifest at %s' % mp)
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
        if s.get('kind') not in ('overlay', 'item') and 'footprint' not in s:
            errs.append('%s: no footprint' % k)
        for an, a in s.get('anims', {}).items():
            if not a.get('frames'):
                errs.append('%s.%s: no frames' % (k, an))
            for fr in a.get('frames', []):
                if not has(s['atlas'], fr):
                    errs.append('%s.%s: frame %s missing' % (k, an, fr))
                elif atl[s['atlas']][fr]['sourceSize'] != f['sourceSize']:
                    errs.append('%s.%s: frame %s size differs from the rest frame' % (k, an, fr))
        for field, v in s.items():
            if field.endswith('Point'):
                if not (isinstance(v, list) and len(v) == 2 and all(isinstance(q, int) for q in v)):
                    errs.append('%s.%s: not a [dx, dy] int pair: %r' % (k, field, v))
            if field == 'fxPoints':
                if not (isinstance(v, dict) and all(isinstance(q, list) and len(q) == 2 for q in v.values())):
                    errs.append('%s.fxPoints: not {name: [dx, dy]}' % k)
                continue
            if field.endswith('Points'):
                if not (isinstance(v, list) and v and all(isinstance(p, list) and len(p) == 2 for p in v)):
                    errs.append('%s.%s: bad point list' % (k, field))
                dfield = field[:-6] + 'Dirs'
                if dfield in s:
                    if len(s[dfield]) != len(v):
                        errs.append('%s.%s: %d dirs for %d points' % (k, dfield, len(s[dfield]), len(v)))
                    if set(s[dfield]) - VALID_DIRS:
                        errs.append('%s.%s: bad dirs %s' % (k, dfield, s[dfield]))
            if field.endswith('Dir') and v not in VALID_DIRS:
                errs.append('%s.%s: bad dir %r' % (k, field, v))
        if 'seatPoints' in s:
            if set(s.get('seatDirs', [])) - SIT_DIRS:
                errs.append('%s: seatDirs %s include a dir without sit frames' % (k, s.get('seatDirs')))
            if len(s.get('seatGroundPoints', [])) != len(s['seatPoints']):
                errs.append('%s: seatGroundPoints count differs' % k)
            if s.get('seatDepth') not in ('front', 'between', 'behind'):
                errs.append('%s: seatDepth %r' % (k, s.get('seatDepth')))
        if s.get('overlay'):
            o = sprites.get(s['overlay'])
            if not o:
                errs.append('%s: overlay %s missing' % (k, s['overlay']))
            elif o.get('frameSize') != s.get('frameSize') or o.get('anchor') != s.get('anchor'):
                errs.append('%s: overlay frame / anchor differ' % k)
        if s.get('kind') == 'item':
            if s.get('frameSize') != [72, 72] or s.get('anchor') != [0.5, 0.75]:
                errs.append('%s: item frame %s anchor %s (72x72 @ (36,54) expected)' % (k, s.get('frameSize'),
                                                                                     s.get('anchor')))
            if not (isinstance(s.get('stackStep'), int) and 8 <= s['stackStep'] <= 14):
                errs.append('%s: stackStep %r not in 8..14' % (k, s.get('stackStep')))
            if not (0.4 <= s.get('carryScale', 0) <= 1.0):
                errs.append('%s: carryScale %r' % (k, s.get('carryScale')))
    # contract specifics
    for k in ('wedding_chairs',):
        if k in sprites and len(sprites[k].get('seatPoints', [])) < 2:
            errs.append('%s: needs seatPoints (rows of chairs)' % k)
    g = sprites.get('memorial_garden', {})
    if g:
        if len(g.get('stonePoints', [])) != 6:
            errs.append('memorial_garden: %d stonePoints (6 expected)' % len(g.get('stonePoints', [])))
        for f in ('seatPoints', 'gatherPoints', 'doorPoint'):
            if f not in g:
                errs.append('memorial_garden: %s missing' % f)
    st = sprites.get('memorial_stone', {})
    for f in ('mournerPoints', 'layPoint', 'wreathPoint', 'plaquePoint'):
        if st and f not in st:
            errs.append('memorial_stone: %s missing' % f)
    a = sprites.get('wedding_arch', {})
    for f in ('couplePoints', 'officiantPoint'):
        if a and f not in a:
            errs.append('wedding_arch: %s missing' % f)
    if 'school_desk_row' in sprites and not sprites['school_desk_row'].get('overlay'):
        errs.append('school_desk_row: overlay missing')
    rg = sprites.get('ribbon_garland', {})
    if rg:
        if rg.get('attachTo') != 'town_hall':
            errs.append('ribbon_garland: attachTo %r' % rg.get('attachTo'))
        tp = os.path.join(ASSETS, 'town', 'manifest.json')
        if not os.path.exists(tp) or 'town_hall' not in json.load(open(tp, encoding='utf-8')).get('sprites', {}):
            warns.append('ribbon_garland: assets/town town_hall not found (the garland is drawn on it)')
    if 'cradle' in sprites and 'rock' not in sprites['cradle'].get('anims', {}):
        errs.append('cradle: anim rock missing')
    # strollers
    nframes = 0
    for c, e in chars.items():
        akey = e.get('atlas')
        if e.get('frameSize') != [128, 128] or e.get('anchor') != [0.5, 0.8125]:
            errs.append('%s: frame %s anchor %s (128x128 @ (64,104) expected)' % (c, e.get('frameSize'),
                                                                               e.get('anchor')))
        for an in ('idle', 'move'):
            if an not in e.get('anims', {}):
                errs.append('%s: anim %s missing' % (c, an))
        for an, info in e.get('anims', {}).items():
            for d in DIRS:
                for i in range(info['frames']):
                    nframes += 1
                    fr = '%s_%s_%d' % (an, d, i)
                    if not has(akey, fr):
                        errs.append('%s: frame %s missing' % (c, fr))
                    elif [atl[akey][fr]['sourceSize']['w'], atl[akey][fr]['sourceSize']['h']] != e['frameSize']:
                        errs.append('%s: frame %s size differs' % (c, fr))
        for p in ('handlePoint', 'pushOffset', 'babyPoint', 'depthVsPusher'):
            if set(e.get(p, {})) != set(DIRS):
                errs.append('%s.%s: dirs %s' % (c, p, sorted(e.get(p, {}))))
        if e.get('mirror') != {'SW': 'SE', 'W': 'E', 'NW': 'NE'}:
            errs.append('%s: mirror map %r' % (c, e.get('mirror')))
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
        for k in {x['key'] for x in o.get('atlases', [])} & set(atl):
            errs.append('atlas key %s also in assets/%s' % (k, frag))
    mb = payload / 1048576.0
    if mb > BUDGET_MB:
        errs.append('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    for e in errs:
        print('ERROR', e)
    for w in warns:
        print('WARN', w)
    print('life2_check: %d sprites (%d required), %d strollers, %d stroller frames, %d atlases, payload %.2f MB: '
          '%d errors, %d warnings' % (len(sprites), len(REQUIRED), len(chars), nframes, len(atl), mb, len(errs),
                                      len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
