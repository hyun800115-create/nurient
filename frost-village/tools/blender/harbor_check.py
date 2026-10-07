"""
harbor_check.py - verify assets/harbor/ against docs/CONTRACT_V6.md section T.

    python3 tools/blender/harbor_check.py [--out DIR]

Checks: every REQUIRED sprite exists (contract keys incl. the alias keys pier_end / breakwater, plus the tile family);
atlases exist and every sheet is <= 2048 px; every referenced frame exists in its atlas JSON; anchors are normalised and
agree with sourceSize; anims have the contract frame counts (lighthouse 8, harbor_crane 8 with 8 hookPoints, shipyard
4, buoy 4) and share the idle frame size; points are [dx, dy] int pairs with matching *Dirs; the per-building fields
the game needs (boardPoints, waitPoints, gangwayPoint, berthPoint, staffPoints, customerPoints, doorPoint, inPoint,
pickPoint, dropPoint, footprintPoly ...); tiles carry tileAxis / stepPx / segM / cuts; no sprite / atlas key collides
with another fragment; townfolk_presets.json only names existing parts / bases / palettes and generates 200 people
per preset without errors (tools/townfolk_compose.generate); payload <= 6 MB.  Exit 1 on errors.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 6.0

LANDMARKS = ['lighthouse', 'harbor_crane']
BUILDINGS = ['ferry_terminal', 'customs_house', 'fish_auction', 'shipyard', 'harbor_market', 'seafood_restaurant',
             'sailor_lodge', 'harbor_warehouse', 'harbor_office']
PROPS = ['bollard', 'harbor_lamp', 'anchor_decor', 'net_rack', 'container_stack', 'container_stack_b',
         'container_red', 'container_blue', 'container_green', 'container_yellow', 'crate_stack', 'barrel_stack',
         'buoy']
TILES = ['pier_x', 'pier_y', 'pier_end_xp', 'pier_end_xn', 'pier_end_yp', 'pier_end_yn', 'pier_root_xp',
         'pier_root_xn', 'pier_root_yp', 'pier_root_yn', 'quay_x', 'quay_y', 'quay_corner', 'breakwater_x',
         'breakwater_y', 'breakwater_end_xp', 'breakwater_end_yn']
ALIASES = {'pier_end': 'pier_end_yn', 'breakwater': 'breakwater_x'}
REQUIRED = LANDMARKS + BUILDINGS + PROPS + TILES + list(ALIASES)
ANIM = {'lighthouse': (8, 'light'), 'harbor_crane': (8, 'lift'), 'shipyard': (4, None), 'buoy': (4, 'bob')}
FIELDS = {
    'lighthouse': ['doorPoint', 'staffPoints', 'fxPoints'],
    'harbor_crane': ['pickPoint', 'dropPoint', 'hookPoint', 'staffPoints', 'workPoints', 'quayEdge', 'pickFrame',
                     'dropFrame'],
    'ferry_terminal': ['doorPoint', 'boardPoints', 'waitPoints', 'gangwayPoint', 'berthPoint', 'staffPoints',
                       'customerPoints', 'seatPoints', 'quayEdge'],
    'customs_house': ['doorPoint', 'staffPoints', 'customerPoints', 'inPoint'],
    'fish_auction': ['staffPoints', 'customerPoints', 'buyerPoints', 'inPoint', 'outPoint', 'quayEdge'],
    'shipyard': ['workPoints', 'staffPoints', 'inPoint', 'fxPoints', 'quayEdge'],
    'harbor_market': ['staffPoints', 'customerPoints', 'inPoint'],
    'seafood_restaurant': ['doorPoint', 'customerPoints', 'staffPoints', 'seatPoints', 'inPoint', 'fxPoints'],
    'sailor_lodge': ['doorPoint', 'staffPoints', 'seatPoints', 'fxPoints'],
    'harbor_warehouse': ['doorPoint', 'inPoint', 'outPoint', 'staffPoints', 'workPoints'],
    'harbor_office': ['doorPoint', 'staffPoints', 'customerPoints', 'fxPoints'],
    'buoy': ['fxPoints'],
    'harbor_lamp': ['fxPoints'],
    'net_rack': ['workPoints'],
}
PRESETS = ['dock_worker', 'sailor', 'auctioneer', 'lighthouse_keeper', 'tourist']


def check_presets(out, errs, warns):
    p = os.path.join(out, 'townfolk_presets.json')
    if not os.path.exists(p):
        errs.append('townfolk_presets.json missing')
        return 0
    data = json.load(open(p, encoding='utf-8'))
    pres = data.get('presets', {})
    for k in PRESETS:
        if k not in pres:
            errs.append('townfolk preset %s missing' % k)
    tp = os.path.join(ASSETS, 'townfolk', 'manifest.json')
    if not os.path.exists(tp):
        warns.append('assets/townfolk/manifest.json missing - presets not validated')
        return 0
    T = json.load(open(tp, encoding='utf-8'))['townfolk']
    parts, bases, pals = T['parts'], T['bases'], T['palettes']
    tables = ('tops', 'bottoms', 'shoes', 'hats', 'extra', 'neck', 'bag', 'headAcc', 'glasses', 'hair', 'facialHair')
    for name, P in pres.items():
        for b in (P.get('bases') or {}):
            if b not in bases:
                errs.append('preset %s: unknown base %s' % (name, b))
        for t in tables:
            v = P.get(t)
            if not v:
                continue
            names = list(v) if isinstance(v, (dict, list)) else [v]
            for n in names:
                if n not in parts:
                    errs.append('preset %s.%s: unknown part %s' % (name, t, n))
        for slot, v in (P.get('colors') or {}).items():
            vals = v if isinstance(v, list) else [v]
            for c in vals:
                if not (c.startswith('#') or c.startswith('=') or c == 'skin' or c in pals):
                    errs.append('preset %s.colors.%s: unknown palette %s' % (name, slot, c))
    sys.path.insert(0, os.path.join(GAME, 'tools'))
    try:
        import townfolk_compose as tc
    except Exception as e:                 # noqa: BLE001
        warns.append('townfolk_compose not importable (%s) - generation not tested' % e)
        return 0
    T['generator']['presets'].update(pres)
    n = 0
    for name in pres:
        seen = set()
        for s in range(200):
            try:
                person = tc.generate(T, random.Random(s), preset=name)
            except Exception as e:         # noqa: BLE001
                errs.append('preset %s seed %d: generate failed: %s' % (name, s, e))
                break
            n += 1
            seen.update(person['parts'])
            for a in person['parts']:
                for b in person['parts']:
                    if a < b and tc.conflicts(T, a, b):
                        errs.append('preset %s seed %d: conflicting parts %s + %s' % (name, s, a, b))
        want = list(pres[name].get('extra') or [])
        for w in want:
            if isinstance(w, str) and w not in seen:
                errs.append('preset %s: extra part %s never generated' % (name, w))
        hats = pres[name].get('hats') or {}
        if hats and not any(h in seen for h in hats):
            errs.append('preset %s: no hat ever generated' % name)
    return n


def main():
    out = os.path.join(ASSETS, 'harbor')
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    errs, warns = [], []
    mp = os.path.join(out, 'manifest.json')
    if not os.path.exists(mp):
        print('harbor_check: no manifest at %s' % mp)
        sys.exit(1)
    man = json.load(open(mp, encoding='utf-8'))
    base = os.path.dirname(out)
    from PIL import Image
    atl = {}
    payload = os.path.getsize(mp)
    for a in man.get('atlases', []):
        png, js = os.path.join(base, a['png']), os.path.join(base, a['json'])
        if not os.path.exists(png) and out != os.path.join(ASSETS, 'harbor'):      # --out dry runs
            png, js = os.path.join(out, os.path.basename(a['png'])), os.path.join(out, os.path.basename(a['json']))
        if not (os.path.exists(png) and os.path.exists(js)):
            errs.append('atlas %s files missing' % a['key'])
            continue
        payload += os.path.getsize(png) + os.path.getsize(js)
        im = Image.open(png)
        if im.width > 2048 or im.height > 2048:
            errs.append('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        atl[a['key']] = json.load(open(js))['frames']
    tp = os.path.join(out, 'townfolk_presets.json')
    if os.path.exists(tp):
        payload += os.path.getsize(tp)
    sprites = man.get('sprites', {})
    for k in REQUIRED:
        if k not in sprites:
            errs.append('missing sprite %s' % k)
    for a, t in ALIASES.items():
        if a in sprites and sprites[a].get('aliasOf') != t:
            errs.append('%s: aliasOf %s != %s' % (a, sprites[a].get('aliasOf'), t))

    def has(akey, fr):
        return akey in atl and fr in atl[akey]

    def is_pt(v):
        return isinstance(v, list) and len(v) == 2 and all(isinstance(q, int) for q in v)

    nframes = 0
    for k, s in sprites.items():
        if not has(s.get('atlas'), s.get('frame')):
            errs.append('%s: frame %s not in atlas %s' % (k, s.get('frame'), s.get('atlas')))
            continue
        nframes += 1
        f = atl[s['atlas']][s['frame']]
        if [f['sourceSize']['w'], f['sourceSize']['h']] != s.get('frameSize'):
            errs.append('%s: frameSize %s != sourceSize %s' % (k, s.get('frameSize'), f['sourceSize']))
        ax, ay = s['anchor']
        if not (0 <= ax <= 1 and 0 <= ay <= 1):
            errs.append('%s: anchor not normalised %s' % (k, s['anchor']))
        if 'footprint' not in s:
            errs.append('%s: no footprint' % k)
        if s.get('kind') == 'building' and 'footprintPoly' not in s:
            errs.append('%s: no footprintPoly' % k)
        for an, a in s.get('anims', {}).items():
            for fr in a['frames']:
                nframes += 1
                if not has(s['atlas'], fr):
                    errs.append('%s.%s: frame %s missing' % (k, an, fr))
                elif atl[s['atlas']][fr]['sourceSize'] != f['sourceSize']:
                    errs.append('%s.%s: frame %s size differs from idle' % (k, an, fr))
            if 'hookPoints' in a:
                if len(a['hookPoints']) != len(a['frames']) or not all(is_pt(p) for p in a['hookPoints']):
                    errs.append('%s.%s: hookPoints must be one [dx, dy] per frame' % (k, an))
        for field, v in s.items():
            if field.endswith('Point'):
                if not is_pt(v):
                    errs.append('%s.%s: not a [dx, dy] int pair: %r' % (k, field, v))
            elif field == 'fxPoints':
                if not (isinstance(v, dict) and all(is_pt(q) for q in v.values())):
                    errs.append('%s.fxPoints: not {name: [dx, dy]}' % k)
            elif field.endswith('Points'):
                if not (isinstance(v, list) and v and all(is_pt(p) for p in v)):
                    errs.append('%s.%s: bad point list' % (k, field))
                dfield = field[:-6] + 'Dirs'
                if dfield in s and len(s[dfield]) != len(v):
                    errs.append('%s.%s: %d dirs for %d points' % (k, dfield, len(s[dfield]), len(v)))
    for k, (n, alias) in ANIM.items():
        s = sprites.get(k)
        if not s:
            continue
        a = s.get('anims', {})
        if 'work' not in a or len(a['work']['frames']) != n:
            errs.append('%s: anims.work must have %d frames' % (k, n))
        if alias and alias not in a:
            errs.append('%s: anim alias %s missing' % (k, alias))
    if 'harbor_crane' in sprites and 'hookPoints' not in sprites['harbor_crane'].get('anims', {}).get('work', {}):
        errs.append('harbor_crane: anims.work.hookPoints missing')
    for k, fields in FIELDS.items():
        s = sprites.get(k)
        if not s:
            continue
        for f in fields:
            if f not in s:
                errs.append('%s: %s missing' % (k, f))
    for k in TILES:
        s = sprites.get(k)
        if not s:
            continue
        for f in ('tileAxis', 'stepPx', 'segM', 'cuts', 'rampM'):
            if f not in s:
                errs.append('%s: %s missing' % (k, f))
        exp = [64, 32] if s.get('tileAxis') == 'x' else [64, -32]
        if s.get('stepPx') != exp:
            errs.append('%s: stepPx %s != %s' % (k, s.get('stepPx'), exp))
        if s.get('kind') != 'decal':
            warns.append('%s: tiles should be kind decal (ground layer)' % k)
    for k in ('pier_x', 'pier_y', 'pier_end_yn', 'pier_end_xp'):
        if k in sprites and len(sprites[k].get('moorPoints', [])) != 2:
            errs.append('%s: 2 moorPoints expected' % k)
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
        for k in {a['key'] for a in o.get('atlases', [])} & set(atl):
            errs.append('atlas key %s also in assets/%s' % (k, frag))
    npeople = check_presets(out, errs, warns)
    mb = payload / 1048576.0
    if mb > BUDGET_MB:
        errs.append('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    for e in errs:
        print('ERROR', e)
    for w in warns:
        print('WARN', w)
    print('harbor_check: %d sprites (%d required), %d frames, %d atlases, %d preset people generated, payload %.2f MB: '
          '%d errors, %d warnings' % (len(sprites), len(REQUIRED), nframes, len(atl), npeople, mb, len(errs),
                                      len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
