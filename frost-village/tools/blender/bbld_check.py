"""
bbld_check.py - verify assets/beach_bld/ against docs/CONTRACT_V7.md section X.

    python3 tools/blender/bbld_check.py [--out DIR]

Checks: every REQUIRED sprite exists (contract keys + _x variants + derived overlay / glow / night / pool water
sprites); atlases exist and every sheet is <= 2048 px; every referenced frame exists in its atlas JSON; anchors are
normalised and agree with sourceSize (derived sprites share their building's frame + anchor); anims have the expected
frame counts and share the idle frame size; points are [dx, dy] int pairs with matching *Dirs; the per-building fields
the game needs (doorPoint, staffPoints for doorman / bellhop / receptionist, customerPoints, inPoint, balconyPoints,
fxPoints, lightPoints, footprintPoly, waterPoly ...); waterPoly lies inside the frame; no warm-coast sprite has snow
(no near-white flat top areas the snow albedo would leave, see SNOW); no sprite / atlas key collides with another
fragment; payload <= 7 MB.  Exit 1 on errors.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 7.0

BUILDINGS = ['resort_hotel', 'hotel_pool', 'pension', 'beach_cafe', 'beach_bar', 'seafood_bbq', 'icecream_shop',
             'souvenir_shop', 'swimwear_shop', 'surf_shop', 'convenience_store', 'lifeguard_station', 'tourist_info',
             'restroom_shower', 'mini_aquarium', 'beach_arcade']
STREET = ['beach_gate', 'beach_lamp', 'string_lights_x', 'string_lights_y']
X_VARIANTS = ['resort_hotel_x', 'beach_cafe_x', 'icecream_shop_x', 'beach_bar_x', 'convenience_store_x',
              'beach_gate_x']
DERIVED = ['resort_hotel_front', 'resort_hotel_x_front',
           'hotel_pool_water', 'beach_cafe_front', 'icecream_shop_front', 'beach_bar_front', 'seafood_bbq_front',
           'tourist_info_front', 'lifeguard_station_front', 'pension_front']
REQUIRED = BUILDINGS + STREET + X_VARIANTS + DERIVED
RETIRED = ['resort_hotel_night', 'resort_hotel_x_night']
LAZY = ['bbld_glow', 'bbld_x', 'bbld_x_glow']
ANIM = {'seafood_bbq': (4, 'grill'), 'mini_aquarium': (8, 'fish'), 'beach_arcade': (4, 'lights'),
        'string_lights_x': (4, 'twinkle'), 'string_lights_y': (4, 'twinkle'), 'hotel_pool_water': (6, 'ripple')}
COMMON = ['footprintPoly', 'fxPoints', 'lightPoints', 'name', 'zone', 'night']
FIELDS = {
    'resort_hotel': ['doorPoint', 'staffPoints', 'staffRoles', 'customerPoints', 'inPoint', 'balconyPoints', 'overlay',
                     'balconyFloors', 'balconyHeadroomPx'],
    'hotel_pool': ['waterPoly', 'waterPolyFlat', 'waterRegion', 'waterZ', 'swimPoints', 'lyingPoints', 'lyingDirs', 'lyingFeetDirs',
                   'lyingHeadPoints', 'lyingFeetPoints', 'lyingAxis', 'staffPoints', 'waterOverlay'],
    'pension': ['doorPoint', 'staffPoints', 'customerPoints', 'balconyPoints', 'inPoint'],
    'beach_cafe': ['doorPoint', 'staffPoints', 'customerPoints', 'seatPoints', 'inPoint', 'overlay'],
    'beach_bar': ['staffPoints', 'seatPoints', 'customerPoints', 'inPoint', 'overlay'],
    'seafood_bbq': ['doorPoint', 'staffPoints', 'customerPoints', 'seatPoints', 'inPoint', 'overlay', 'anims'],
    'icecream_shop': ['doorPoint', 'staffPoints', 'customerPoints', 'seatPoints', 'inPoint', 'overlay'],
    'souvenir_shop': ['doorPoint', 'staffPoints', 'customerPoints', 'inPoint'],
    'swimwear_shop': ['doorPoint', 'staffPoints', 'customerPoints', 'inPoint'],
    'surf_shop': ['doorPoint', 'staffPoints', 'customerPoints', 'workPoints', 'inPoint'],
    'convenience_store': ['doorPoint', 'staffPoints', 'customerPoints', 'seatPoints', 'inPoint'],
    'lifeguard_station': ['doorPoint', 'staffPoints', 'lookoutPoint', 'inPoint', 'overlay'],
    'tourist_info': ['staffPoints', 'customerPoints', 'inPoint', 'overlay'],
    'restroom_shower': ['doorPoint', 'staffPoints', 'customerPoints', 'showerPoints', 'inPoint'],
    'mini_aquarium': ['doorPoint', 'staffPoints', 'viewPoints', 'customerPoints', 'inPoint', 'anims'],
    'beach_arcade': ['doorPoint', 'staffPoints', 'customerPoints', 'inPoint', 'anims'],
    'beach_gate': ['fxPoints'],
    'beach_lamp': ['fxPoints', 'lightPoints'],
}
NO_COMMON = {'beach_lamp': ['name'], 'string_lights_x': ['fxPoints'], 'string_lights_y': ['fxPoints'],
             'beach_gate': [], 'beach_gate_x': []}
DIRS = {'S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW'}
PAIRS = {'staffPoints': 'staffDirs', 'customerPoints': 'customerDirs', 'seatPoints': 'seatDirs',
         'balconyPoints': 'balconyDirs', 'lyingPoints': 'lyingDirs', 'workPoints': 'workDirs', 'viewPoints': 'viewDirs',
         'showerPoints': 'showerDirs'}


def is_pt(p):
    return isinstance(p, list) and len(p) == 2 and all(isinstance(v, int) for v in p)


def main():
    out = os.path.join(ASSETS, 'beach_bld')
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    errs, warns = [], []
    mp = os.path.join(out, 'manifest.json')
    if not os.path.exists(mp):
        print('bbld_check: no manifest at %s' % mp)
        sys.exit(1)
    man = json.load(open(mp, encoding='utf-8'))
    base = os.path.dirname(out)
    from PIL import Image
    import numpy as np
    atl, sheets = {}, {}
    payload = os.path.getsize(mp)
    for a in man.get('atlases', []):
        png, js = os.path.join(base, a['png']), os.path.join(base, a['json'])
        if not os.path.exists(png) and out != os.path.join(ASSETS, 'beach_bld'):
            png, js = os.path.join(out, os.path.basename(a['png'])), os.path.join(out, os.path.basename(a['json']))
        if not (os.path.exists(png) and os.path.exists(js)):
            errs.append('atlas %s files missing' % a['key'])
            continue
        payload += os.path.getsize(png) + os.path.getsize(js)
        im = Image.open(png)
        if im.width > 2048 or im.height > 2048:
            errs.append('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        atl[a['key']] = json.load(open(js))['frames']
        sheets[a['key']] = im
    sp = man.get('sprites', {})
    for k in REQUIRED:
        if k not in sp:
            errs.append('required sprite %s missing' % k)

    def frame_ok(k, atlas, fr, size, anchor):
        if atlas not in atl:
            errs.append('%s: atlas %s not in manifest atlases' % (k, atlas))
            return False
        f = atl[atlas].get(fr)
        if f is None:
            errs.append('%s: frame %s missing in %s' % (k, fr, atlas))
            return False
        ss = f['sourceSize']
        if [ss['w'], ss['h']] != list(size):
            errs.append('%s: frame %s sourceSize %sx%s != frameSize %s' % (k, fr, ss['w'], ss['h'], size))
        return True

    snow_hits = []
    for k, s in sp.items():
        for f in ('atlas', 'frame', 'anchor', 'frameSize', 'kind'):
            if f not in s:
                errs.append('%s: field %s missing' % (k, f))
        if 'anchor' in s and not (0 <= s['anchor'][0] <= 1 and 0 <= s['anchor'][1] <= 1):
            errs.append('%s: anchor %s not normalised' % (k, s['anchor']))
        if 'atlas' in s and 'frame' in s:
            frame_ok(k, s['atlas'], s['frame'], s['frameSize'], s['anchor'])
        for an, a in (s.get('anims') or {}).items():
            for fr in a.get('frames', []):
                frame_ok('%s.%s' % (k, an), s['atlas'], fr, s['frameSize'], s['anchor'])
        if s.get('of'):
            o = sp.get(s['of'])
            if not o:
                errs.append('%s: of %s missing' % (k, s['of']))
            elif o['frameSize'] != s['frameSize'] or o['anchor'] != s['anchor']:
                errs.append('%s: frame / anchor differ from %s' % (k, s['of']))
        if s.get('kind') in ('overlay', 'glow', 'night') or k.endswith(('_front', '_glow', '_night', '_water')):
            continue
        base = k[:-2] if k.endswith('_x') and k[:-2] in FIELDS else k
        need = list(FIELDS.get(base, []))
        if s.get('kind') == 'building' or base in FIELDS:
            need += [c for c in COMMON if c not in NO_COMMON.get(base, [])]
        for f in need:
            if f not in s:
                errs.append('%s: field %s missing' % (k, f))
        for pf, df in PAIRS.items():
            if pf in s:
                if not all(is_pt(p) for p in s[pf]):
                    errs.append('%s.%s: not [dx, dy] int pairs' % (k, pf))
                if df in s and (len(s[df]) != len(s[pf]) or not all(d in DIRS for d in s[df])):
                    errs.append('%s.%s: %d dirs for %d points' % (k, df, len(s.get(df, [])), len(s[pf])))
        for pf in ('doorPoint', 'inPoint', 'lookoutPoint'):
            if pf in s and not is_pt(s[pf]):
                errs.append('%s.%s: not an int pair' % (k, pf))
        if 'lightPoints' in s:
            if not all(is_pt(p) for p in s['lightPoints']):
                errs.append('%s.lightPoints: not int pairs' % k)
            if len(s.get('lightKinds', [])) != len(s['lightPoints']):
                errs.append('%s: lightKinds / lightPoints length mismatch' % k)
        if 'staffPoints' in s:
            sd = s.get('staffDepths')
            if not isinstance(sd, list) or len(sd) != len(s['staffPoints']) or not all(v in ('front', 'behind')
                                                                                       for v in sd):
                errs.append('%s: staffDepths %s does not match %d staffPoints' % (k, sd, len(s['staffPoints'])))
            elif s.get('staffDepth') != sd[0]:
                errs.append('%s: staffDepth != staffDepths[0]' % k)
            for i in s.get('staffBehindOverlay', []):
                if isinstance(sd, list) and i < len(sd) and sd[i] != 'front':
                    errs.append('%s: staff %d is behind the overlay but not drawn "front"' % (k, i))
        if 'lyingPoints' in s:
            n = len(s['lyingPoints'])
            opp = {'S': 'N', 'N': 'S', 'E': 'W', 'W': 'E', 'SE': 'NW', 'NW': 'SE', 'NE': 'SW', 'SW': 'NE'}
            for f in ('lyingHeadPoints', 'lyingFeetPoints', 'lyingFeetDirs'):
                if len(s.get(f, [])) != n:
                    errs.append('%s.%s: %d entries for %d lyingPoints' % (k, f, len(s.get(f, [])), n))
            if [opp[d] for d in s.get('lyingDirs', [])] != s.get('lyingFeetDirs', []):
                errs.append('%s: lyingFeetDirs is not the opposite of lyingDirs' % k)
        if 'lightPoints' in s and len(s.get('lightK', [])) != len(s['lightPoints']):
            errs.append('%s: lightK / lightPoints length mismatch' % k)
        if 'staffPoints' in s and 'staffRoles' in s and len(s['staffRoles']) != len(s['staffPoints']):
            errs.append('%s: staffRoles %d != staffPoints %d' % (k, len(s['staffRoles']), len(s['staffPoints'])))
        for r in s.get('staffRoles', []):
            if r not in man.get('staffPresets', {}):
                errs.append('%s: staff role %s has no staffPresets entry' % (k, r))
        if base == 'resort_hotel':
            roles = s.get('staffRoles', [])
            for r in ('doorman', 'bellhop', 'receptionist'):
                if r not in roles:
                    errs.append('%s: no %s staff point' % (k, r))
            if len(s.get('balconyPoints', [])) < 6:
                errs.append('%s: only %d balconyPoints' % (k, len(s.get('balconyPoints', []))))
            # a standing guest is 80 - 100 px tall: no balcony may sit right above another one
            for i, (hp, fl) in enumerate(zip(s.get('balconyHeadroomPx', []), s.get('balconyFloors', []))):
                if hp < 70:
                    errs.append('%s: balcony %d (floor %d) has only %d px headroom' % (k, i, fl, hp))
            bp = s.get('balconyPoints', [])
            for i in range(len(bp)):
                for j in range(len(bp)):
                    if i != j and abs(bp[i][0] - bp[j][0]) < 30 and 0 < bp[i][1] - bp[j][1] < 100:
                        errs.append('%s: balcony %d is right under balcony %d (%s / %s)' % (k, i, j, bp[i], bp[j]))
        if 'overlay' in s and s['overlay'] not in sp:
            errs.append('%s: overlay %s missing' % (k, s['overlay']))
        nt = s.get('night')
        if nt:
            if nt.get('glow') not in sp:
                errs.append('%s: night.glow %s missing' % (k, nt.get('glow')))
            if nt.get('frame') or nt.get('tint'):
                errs.append('%s: night.frame / night.tint are retired (DayClock night model)' % k)
            g = sp.get(nt.get('glow'), {})
            if g.get('atlas') in sheets:
                f = atl[g['atlas']][g['frame']]['frame']
                ga = np.asarray(sheets[g['atlas']].convert('RGBA').crop((f['x'], f['y'], f['x'] + f['w'],
                                                                         f['y'] + f['h'])))[..., 3]
                if (ga > 90).sum() < 40:
                    errs.append('%s: night glow %s is (almost) empty' % (k, nt.get('glow')))
        if 'waterPoly' in s:
            W, H = s['frameSize']
            ax, ay = s['anchor'][0] * W, s['anchor'][1] * H
            if len(s['waterPoly']) < 3 or not all(is_pt(p) for p in s['waterPoly']):
                errs.append('%s.waterPoly malformed' % k)
            elif not all(0 <= ax + x <= W and 0 <= ay + y <= H for x, y in s['waterPoly']):
                errs.append('%s.waterPoly leaves the frame' % k)
            if s.get('waterOverlay') not in sp:
                errs.append('%s: waterOverlay %s missing' % (k, s.get('waterOverlay')))
            elif s.get('atlas') in sheets:
                # land over water: the deck must be transparent inside waterPoly, the fallback water opaque there
                from PIL import ImageDraw as _D
                msk = Image.new('L', (W, H), 0)
                _D.Draw(msk).polygon([(ax + x, ay + y) for x, y in s['waterPoly']], fill=255)
                msk = np.asarray(msk.filter(__import__('PIL.ImageFilter', fromlist=['x']).MinFilter(5))) > 0

                def full(key):
                    e = sp[key]
                    fr = atl[e['atlas']][e['frame']]
                    a = np.zeros((H, W), np.uint8)
                    c = np.asarray(sheets[e['atlas']].convert('RGBA').crop(
                        (fr['frame']['x'], fr['frame']['y'], fr['frame']['x'] + fr['frame']['w'],
                         fr['frame']['y'] + fr['frame']['h'])))[..., 3]
                    sx, sy = fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']
                    a[sy:sy + c.shape[0], sx:sx + c.shape[1]] = c
                    return a
                deck, wat = full(k), full(s['waterOverlay'])
                # the Water.js region (water bbox) must be covered by the deck everywhere outside the water hole
                rg = s.get('waterRegion')
                if not rg:
                    errs.append('%s: waterRegion missing' % k)
                else:
                    hole = Image.new('L', (W, H), 0)
                    _D.Draw(hole).polygon([(ax + x, ay + y) for x, y in s['waterPoly']], fill=255)
                    hole = np.asarray(hole.filter(__import__('PIL.ImageFilter', fromlist=['x']).MaxFilter(5))) > 0
                    x0_, y0_ = int(round(ax + rg[0])), int(round(ay + rg[1]))
                    box_ = np.zeros((H, W), bool)
                    box_[max(0, y0_):y0_ + int(rg[3]) + 1, max(0, x0_):x0_ + int(rg[2]) + 1] = True
                    open_ = box_ & ~hole & (deck < 235)
                    if open_.sum() > 0:
                        errs.append('%s: %d px of waterRegion outside the water are not covered by the deck (Water.js '
                                    'blocks would show)' % (k, int(open_.sum())))
                if deck[msk].mean() > 10:
                    errs.append('%s: the deck is not cut out inside waterPoly (mean alpha %.0f)' % (k, deck[msk].mean()))
                if wat[msk].mean() < 245:
                    errs.append('%s: the fallback water is not opaque inside waterPoly' % k)
        if base in ANIM or k in ANIM:
            n, alias = ANIM.get(k, ANIM.get(base))
            a = s.get('anims', {})
            if len(a.get('work', {}).get('frames', [])) != n:
                errs.append('%s: anims.work has %d frames, want %d' % (k, len(a.get('work', {}).get('frames', [])), n))
            if alias and alias not in a:
                errs.append('%s: anims.%s alias missing' % (k, alias))
        # snow check: the snow albedo #E9EFF7 (bluish white) must not appear on up-facing parts in quantity
        if s.get('atlas') in sheets:
            f = atl[s['atlas']][s['frame']]['frame']
            im = np.asarray(sheets[s['atlas']].convert('RGBA').crop((f['x'], f['y'], f['x'] + f['w'],
                                                                     f['y'] + f['h']))).astype(np.int32)
            m = (im[..., 3] > 200) & (np.abs(im[..., 0] - 233) < 8) & (np.abs(im[..., 1] - 239) < 8) & \
                (np.abs(im[..., 2] - 247) < 6) & (im[..., 2] > im[..., 0] + 8)
            frac = m.sum() / max(1, (im[..., 3] > 200).sum())
            if frac > 0.04:
                snow_hits.append('%s (%.1f%%)' % (k, frac * 100))
    for k in ANIM:
        if k in sp and 'anims' not in sp[k]:
            errs.append('%s: anims missing' % k)
    for k in RETIRED:
        if k in sp:
            errs.append('retired sprite %s is still in the manifest' % k)
    lazy = man.get('lazyAtlases', [])
    for a in LAZY:
        if a not in lazy:
            errs.append('atlas %s should be lazy (lazyAtlases)' % a)
    for k in X_VARIANTS:
        if k in sp and sp[k].get('atlas') not in ('bbld_x',) and not str(sp[k].get('atlas', '')).startswith('bbld_x_'):
            errs.append('%s: _x variant not in the lazy bbld_x atlas (%s)' % (k, sp[k].get('atlas')))
    if snow_hits:
        warns.append('possible snow-coloured areas: ' + ', '.join(snow_hits))
    # key collisions with the other fragments
    mine_atl = {a['key'] for a in man.get('atlases', [])}
    for d in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, d, 'manifest.json')
        if d == 'beach_bld' or not os.path.exists(p):
            continue
        try:
            o = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        osp = o.get('sprites', {}) if isinstance(o, dict) else {}
        for k in set(osp if isinstance(osp, dict) else []) & set(sp):
            errs.append('sprite key %s collides with assets/%s' % (k, d))
        oat = o.get('atlases', []) if isinstance(o, dict) else []
        for a in (oat if isinstance(oat, list) else []):
            if isinstance(a, dict) and a.get('key') in mine_atl:
                errs.append('atlas key %s collides with assets/%s' % (a['key'], d))
    mb = payload / 1048576.0
    if mb > BUDGET_MB:
        errs.append('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    print('bbld_check: %d sprites, %d atlases, payload %.2f MB' % (len(sp), len(man.get('atlases', [])), mb))
    for w in warns:
        print('  WARNING', w)
    for e in errs:
        print('  ERROR', e)
    print('bbld_check: %d error(s), %d warning(s)' % (len(errs), len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
