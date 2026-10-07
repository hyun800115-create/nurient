"""
ship_check.py - validate assets/ships/ against docs/CONTRACT_V6.md section S.   python3 tools/blender/ship_check.py
Exit code 0 = no errors (warnings are printed), 1 = errors.

Checks: manifest + atlas files, sheet sizes <= 2048 and PNG size == JSON meta size, every frame a manifest entry
implies (anims x dirs, base_<dir>, slot<k>_<dir>), sourceSize == frameSize, anchors normalised + consistent,
dirs / mirror sanity, required points per dir and inside the frame, contract anims (seagull fly 6f in 5 dirs, glide
2f, land 4f, idle 4f; ships idle + move; trawler haul), ferry deck / gangway points, cargo slots, overlays not empty,
nothing clipped at the frame border, payload <= 5 MB.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
SHIPS = os.path.join(ASSETS, 'ships')
BUDGET = 5.0 * 1048576

REQUIRED = ['ferry', 'cargo_ship', 'trawler_big', 'tugboat', 'sailboat', 'yacht', 'seagull']
LAYERED = ['ferry', 'cargo_ship', 'trawler_big']
FUNNEL = ['ferry', 'cargo_ship', 'trawler_big', 'tugboat']
GULL_ANIMS = {'fly': (6, 5), 'glide': (2, None), 'land': (4, None), 'idle': (4, None)}
ALL8 = {'S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW'}


def main():
    errs, warns = [], []

    def E(msg):
        errs.append(msg)

    def W(msg):
        warns.append(msg)

    mp = os.path.join(SHIPS, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: %s missing' % mp)
        return 1
    man = json.load(open(mp, encoding='utf-8'))
    if man.get('version') != 1:
        E('manifest version must be 1')
    atl = {}
    for a in man.get('atlases', []):
        png = os.path.join(ASSETS, a['png'])
        js = os.path.join(ASSETS, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            E('atlas %s: file missing' % a['key'])
            continue
        im = Image.open(png)
        data = json.load(open(js))
        if im.width > 2048 or im.height > 2048:
            E('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        sz = data['meta']['size']
        if (sz['w'], sz['h']) != im.size:
            E('atlas %s: json size %s != png %s' % (a['key'], sz, im.size))
        atl[a['key']] = (im, data['frames'])
    chars = man.get('characters', {})
    for k in REQUIRED:
        if k not in chars:
            E('character %s missing' % k)
    for k, e in chars.items():
        a = e.get('atlas')
        if a not in atl:
            E('%s: atlas %s not loaded' % (k, a))
            continue
        sheet, frames = atl[a]
        W_, H_ = e['frameSize']
        ax, ay = e['anchor']
        if not (0 < ax < 1 and 0 < ay < 1):
            E('%s: anchor %s not normalised' % (k, e['anchor']))
        dirs = e['dirs']
        for m, t in e.get('mirror', {}).items():
            if t not in dirs:
                E('%s: mirror %s -> %s is not a rendered dir' % (k, m, t))
            if m in dirs:
                E('%s: mirrored dir %s is also rendered' % (k, m))
        if not set(dirs) <= ALL8:
            E('%s: bad dirs %s' % (k, dirs))
        names = []
        for an, info in e['anims'].items():
            for d in info.get('dirs') or dirs:
                if d not in dirs:
                    E('%s: anim %s dir %s not in dirs' % (k, an, d))
                for i in range(info['frames']):
                    names.append(('%s_%s_%d' % (an, d, i), an))
        if e.get('layered'):
            for d in dirs:
                names.append(('base_%s' % d, 'base'))
            cs = e.get('cargoSlots')
            if cs:
                for kk in range(cs['count']):
                    for d in dirs:
                        names.append(('slot%d_%s' % (kk, d), 'slot'))
        anchor_px = (ax * W_, ay * H_)
        for n, an in names:
            f = frames.get(n)
            if f is None:
                E('%s: frame %s missing' % (k, n))
                continue
            if (f['sourceSize']['w'], f['sourceSize']['h']) != (W_, H_):
                E('%s: %s sourceSize %s != frameSize %s' % (k, n, f['sourceSize'], e['frameSize']))
            s = f['spriteSourceSize']
            if s['x'] <= 0 or s['y'] <= 0 or s['x'] + s['w'] >= W_ or s['y'] + s['h'] >= H_:
                W('%s: %s touches the frame border (clipped?)' % (k, n))
            r = f['frame']
            crop = np.asarray(sheet.convert('RGBA').crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])))
            if (crop[..., 3] > 20).sum() < 12:
                (E if an in ('base',) else W)('%s: %s is (almost) empty' % (k, n))
        # points
        need = ['wakePoint', 'bowPoint'] if e['kind'] == 'ship' else []
        if k in FUNNEL:
            need.append('smokePoint')
        if k == 'ferry':
            need += ['gangwayPoint', 'deckPoints']
        if k == 'cargo_ship':
            need += ['cargoPoints']
        if k == 'trawler_big':
            need += ['netPoint']
        for p in need:
            v = e.get(p)
            if not isinstance(v, dict):
                E('%s: %s missing' % (k, p))
                continue
            for d in dirs:
                if d not in v:
                    E('%s: %s has no %s' % (k, p, d))
        for p, v in e.items():
            if not (p.endswith('Point') or p.endswith('Points')) or not isinstance(v, dict):
                continue
            for d, val in v.items():
                pts = []
                if isinstance(val, dict):
                    pts = list(val.values())
                elif val and isinstance(val[0], list):
                    pts = val
                elif val:
                    pts = [val]
                for q in pts:
                    x, y = anchor_px[0] + q[0], anchor_px[1] + q[1]
                    if not (0 <= x <= W_ and 0 <= y <= H_):
                        E('%s: %s[%s] %s lies outside the frame' % (k, p, d, q))
        if k == 'ferry':
            for d in dirs:
                n = len(e.get('deckPoints', {}).get(d, []))
                if n < 3:
                    E('ferry: only %d deckPoints for %s' % (n, d))
        if k == 'cargo_ship':
            cs = e.get('cargoSlots') or {}
            if cs.get('count', 0) < 4:
                E('cargo_ship: cargoSlots.count %s < 4' % cs.get('count'))
            for d in dirs:
                o = (cs.get('order') or {}).get(d, [])
                if sorted(o) != list(range(cs.get('count', 0))):
                    E('cargo_ship: slot order for %s is not a permutation' % d)
                if len(e.get('cargoPoints', {}).get(d, [])) != cs.get('count'):
                    E('cargo_ship: cargoPoints[%s] count != slots' % d)
        if e['kind'] == 'ship':
            for an in ('idle', 'move'):
                if an not in e['anims']:
                    E('%s: anim %s missing' % (k, an))
        if k == 'trawler_big':
            h = e['anims'].get('haul')
            if not h:
                E('trawler_big: haul anim missing')
            elif h['frames'] < 4:
                E('trawler_big: haul has only %d frames' % h['frames'])
        if k == 'seagull':
            for an, (nf, nd) in GULL_ANIMS.items():
                info = e['anims'].get(an)
                if not info:
                    E('seagull: anim %s missing' % an)
                    continue
                if info['frames'] != nf:
                    E('seagull: %s has %d frames (contract %d)' % (an, info['frames'], nf))
                if nd and len(info.get('dirs') or dirs) < nd:
                    E('seagull: %s in %d dirs (contract %d)' % (an, len(info.get('dirs') or dirs), nd))
    total = sum(os.path.getsize(os.path.join(SHIPS, f)) for f in os.listdir(SHIPS)
                if os.path.isfile(os.path.join(SHIPS, f)))
    if total > BUDGET:
        E('payload %.2f MB > 5 MB' % (total / 1048576.0))
    for w in warns:
        print('WARN ', w)
    for e_ in errs:
        print('ERROR', e_)
    print('ship_check: %d characters, %d atlases, payload %.2f MB - %d error(s), %d warning(s)' % (
        len(chars), len(atl), total / 1048576.0, len(errs), len(warns)))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
