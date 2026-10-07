"""
bld_check.py - verify assets/buildings/manifest.json against docs/CONTRACT_V3.md section E.

    python3 tools/blender/bld_check.py          (exit code 1 on any error)
    python3 tools/blender/bld_check.py --dir <folder with manifest.json + atlases>     (check a dry-run pack)

Checks
  * every REQUIRED sprite key + both boats exist; every atlas listed exists (PNG + JSON), sheets <= 2048 px,
    meta.size == PNG size, frame rects inside the sheet
  * every sprite frame / anims.work frame / boat frame name exists in its atlas; anchors normalised and
    frameSize == the frame's untrimmed sourceSize
  * buildings: footprint (int px), topPx, kind; animated ones have a 4-frame work loop (fps, repeat -1) whose
    frames share the idle frame's sourceSize; fxPoints / *Point / *Points are [int, int]; shop_general has
    staffPoints + its overlay sprite (same frameSize + anchor); houses have fxPoints.smoke; the watchtower has
    fxPoints.fire; in/out pads sit outside the footprint
  * construction stages: per size S/M/L the three stage sprites share frameSize + anchor; footprints are 2x2 / 3x3
    / 4x4 m diamonds; workPoints + dropPoint present
  * items: kind item, frameSize 72x72, anchor [0.5, 0.75], int stackStep 8..14, carryScale 0.4..1.0, icon true
  * boats (characters{}): kind boat, dirs S..N, mirror, every {anim}_{dir}_{i} frame exists with sourceSize ==
    frameSize, anims (idle 2f + row 6f / sail 4f), cargoPoint for the 5 dirs as [dx, dy, bool]
  * staff overrides market_counter_staff / trade_post_staff reference existing props sprites
  * no key collides with the other manifests (characters, props, villagers, life_props, ui, fx, ...)
  * payload (PNG + JSON + manifest) <= 5 MB
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')

BUILDINGS = ['warehouse', 'station_cannery', 'shop_general', 'station_toolsmith', 'house_a', 'house_b', 'house_c',
             'watchtower', 'boathouse']
ANIMATED = ['warehouse', 'station_cannery', 'station_toolsmith', 'watchtower', 'boathouse']
SITES = ['site_%s_%s' % (st, sz) for sz in 'SML' for st in ('plot', 'foundation', 'scaffold')]
ITEMS = ['item_can', 'item_fish_big', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow',
         'item_toolbox']
STAFF = ['market_counter_staff', 'trade_post_staff']
OVERLAYS = ['shop_general_front']
REQUIRED = BUILDINGS + OVERLAYS + SITES + ITEMS + STAFF
REQUIRED_CHARS = ['boat_rowboat', 'boat_fishing']
BOAT_ANIMS = {'boat_rowboat': {'idle': 2, 'row': 6}, 'boat_fishing': {'idle': 2, 'sail': 4}}
FOOT_M = {'warehouse': (3, 3), 'station_cannery': (3, 3), 'shop_general': (3, 3), 'station_toolsmith': (3, 3),
          'watchtower': (2, 2), 'boathouse': (3, 2)}
DIRS = ['S', 'SE', 'E', 'NE', 'N']
BUDGET_MB = 5.0
OTHER = ['characters', 'props', 'villagers', 'life_props', 'emotes', 'fx', 'ui', 'ground', 'audio', 'villagers2',
         'ui2', 'audio2']


def is_pt(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(x, int) for x in v)


def main():
    errors, warns = [], []
    base = os.path.join(ASSETS, 'buildings')
    if '--dir' in sys.argv:
        base = os.path.abspath(sys.argv[sys.argv.index('--dir') + 1])
    man_path = os.path.join(base, 'manifest.json')

    def apath(rel):                     # manifest paths are relative to assets/ (buildings/<file>)
        return os.path.join(base, rel.split('/', 1)[1]) if rel.startswith('buildings/') else os.path.join(ASSETS, rel)

    if not os.path.exists(man_path):
        print('FAIL: missing', man_path)
        return 1
    man = json.load(open(man_path, encoding='utf-8'))
    sprites = man.get('sprites', {})
    chars = man.get('characters', {})
    total = os.path.getsize(man_path)
    atlas_frames = {}
    for a in man.get('atlases', []):
        png, js = apath(a['png']), apath(a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            errors.append('atlas %s: missing file(s)' % a['key'])
            continue
        if not a['png'].startswith('buildings/'):
            errors.append('atlas %s: path %s outside assets/buildings' % (a['key'], a['png']))
        total += os.path.getsize(png) + os.path.getsize(js)
        with Image.open(png) as im:
            size = im.size
        if size[0] > 2048 or size[1] > 2048:
            errors.append('atlas %s is %dx%d (> 2048)' % (a['key'], *size))
        data = json.load(open(js))
        ms = data.get('meta', {}).get('size', {})
        if (ms.get('w'), ms.get('h')) != size:
            errors.append('atlas %s: meta.size %s != png %s' % (a['key'], ms, size))
        for fn, fr in data['frames'].items():
            r = fr['frame']
            if r['x'] < 0 or r['y'] < 0 or r['x'] + r['w'] > size[0] or r['y'] + r['h'] > size[1]:
                errors.append('atlas %s: frame %s outside the sheet' % (a['key'], fn))
        atlas_frames[a['key']] = data['frames']

    def frame_of(atlas, name, what):
        tab = atlas_frames.get(atlas)
        if tab is None:
            errors.append('%s: atlas %r not listed/loaded' % (what, atlas))
            return None
        f = tab.get(name)
        if f is None:
            errors.append('%s: frame %r missing from atlas %s' % (what, name, atlas))
        return f

    for key in REQUIRED:
        if key not in sprites:
            errors.append('missing sprite %s' % key)
    for key, s in sprites.items():
        if key in STAFF or s.get('kind') == 'staff':
            if s.get('of') not in ('market_counter', 'trade_post'):
                errors.append('%s: bad "of" %r' % (key, s.get('of')))
            if not (isinstance(s.get('staffPoints'), list) and s['staffPoints'] and all(is_pt(p) for p in
                                                                                       s['staffPoints'])):
                errors.append('%s: bad staffPoints %r' % (key, s.get('staffPoints')))
            continue
        f = frame_of(s.get('atlas'), s.get('frame'), key)
        if f is None:
            continue
        ax, ay = s.get('anchor', [None, None])
        if not (isinstance(ax, (int, float)) and 0 <= ax <= 1 and 0 <= ay <= 1):
            errors.append('%s: bad anchor %r' % (key, s.get('anchor')))
        src = [f['sourceSize']['w'], f['sourceSize']['h']]
        if s.get('frameSize') != src:
            errors.append('%s: frameSize %s != sourceSize %s' % (key, s.get('frameSize'), src))
        kind = s.get('kind')
        for fld, v in s.items():
            if fld.endswith('Point') and not is_pt(v):
                errors.append('%s: %s %r is not [int, int]' % (key, fld, v))
            if fld.endswith('Points') and fld != 'fxPoints' and not (isinstance(v, list) and all(is_pt(p) for p in v)):
                errors.append('%s: %s %r is not a list of [int, int]' % (key, fld, v))
        for n, v in (s.get('fxPoints') or {}).items():
            if not is_pt(v):
                errors.append('%s: fxPoints.%s %r is not [int, int]' % (key, n, v))
        if key in ITEMS:
            if kind != 'item':
                errors.append('%s: kind %r != item' % (key, kind))
            if src != [72, 72] or s.get('anchor') != [0.5, 0.75]:
                errors.append('%s: items must be 72x72 with anchor [0.5, 0.75] (got %s %s)' % (key, src,
                                                                                               s.get('anchor')))
            st = s.get('stackStep')
            if not isinstance(st, int) or not 8 <= st <= 14:
                errors.append('%s: stackStep %r not an int in 8..14' % (key, st))
            cs = s.get('carryScale')
            if not isinstance(cs, (int, float)) or not 0.4 <= cs <= 1.0:
                errors.append('%s: carryScale %r not in 0.4..1.0' % (key, cs))
            if s.get('icon') is not True:
                errors.append('%s: icon flag missing' % key)
            continue
        if kind == 'overlay':
            base = sprites.get(s.get('of'))
            if not base or base.get('frameSize') != s.get('frameSize') or base.get('anchor') != s.get('anchor'):
                errors.append('%s: overlay must share frameSize + anchor with %r' % (key, s.get('of')))
            continue
        fp = s.get('footprint')
        if not (isinstance(fp, list) and len(fp) == 2 and all(isinstance(v, int) and v > 0 for v in fp)):
            errors.append('%s: missing/bad footprint %r' % (key, fp))
        if not isinstance(s.get('topPx'), int) or s['topPx'] <= 0:
            errors.append('%s: bad topPx %r' % (key, s.get('topPx')))
        if key in FOOT_M and list(s.get('footprintM', [])) != list(FOOT_M[key]):
            errors.append('%s: footprintM %r != contract %s' % (key, s.get('footprintM'), FOOT_M[key]))
        if key in ANIMATED:
            w = (s.get('anims') or {}).get('work')
            if not w or len(w.get('frames', [])) != 4:
                errors.append('%s: anims.work must have 4 frames' % key)
            else:
                for fn in w['frames']:
                    wf = frame_of(w.get('atlas', s['atlas']), fn, key + ' work')
                    if wf and wf['sourceSize'] != f['sourceSize']:
                        errors.append('%s: work frame %s size differs from idle' % (key, fn))
                if w.get('repeat') != -1 or not isinstance(w.get('fps'), (int, float)):
                    errors.append('%s: work anim needs fps + repeat -1' % key)
        if key in ('house_a', 'house_b', 'house_c') and 'smoke' not in (s.get('fxPoints') or {}):
            errors.append('%s: fxPoints.smoke missing' % key)
        if key == 'watchtower' and 'fire' not in (s.get('fxPoints') or {}):
            errors.append('watchtower: fxPoints.fire missing')
        if key == 'shop_general':
            if not s.get('staffPoints'):
                errors.append('shop_general: staffPoints missing')
            if s.get('overlay') not in sprites:
                errors.append('shop_general: overlay sprite %r missing' % s.get('overlay'))
        if key in BUILDINGS and key not in ('house_a', 'house_b', 'house_c', 'watchtower', 'shop_general',
                                            'boathouse'):
            for fld in ('inPoint', 'outPoint'):
                if fld not in s:
                    errors.append('%s: %s missing' % (key, fld))
        for fld in ('inPoint', 'outPoint', 'cashPoint'):
            if fld in s and fp:
                dx, dy = s[fld]
                # pad centre must lie outside the footprint diamond (|dx|/(w/2) + |dy|/(h/2) > 1)
                if abs(dx) / (fp[0] / 2.0) + abs(dy) / (fp[1] / 2.0) <= 1.0:
                    errors.append('%s: %s %s lies inside the footprint' % (key, fld, s[fld]))
                if dy < 0 and fld != 'outPoint':
                    warns.append('%s: %s is above the anchor (character there sorts behind the building)' % (key,
                                                                                                           fld))
        if kind == 'site':
            if not s.get('workPoints') or 'dropPoint' not in s:
                errors.append('%s: workPoints / dropPoint missing' % key)
    for sz, m in (('S', 2), ('M', 3), ('L', 4)):
        st = [sprites.get('site_%s_%s' % (n, sz)) for n in ('plot', 'foundation', 'scaffold')]
        if all(st):
            if len({json.dumps([x['frameSize'], x['anchor']]) for x in st}) != 1:
                errors.append('site size %s: stages do not share frameSize + anchor' % sz)
            if st[0].get('footprintM') != [m, m]:
                errors.append('site size %s: footprintM %r != [%d, %d]' % (sz, st[0].get('footprintM'), m, m))
    for k in REQUIRED_CHARS:
        c = chars.get(k)
        if c is None:
            errors.append('missing boat %s' % k)
            continue
        if c.get('kind') != 'boat':
            errors.append('%s: kind %r != boat' % (k, c.get('kind')))
        if c.get('dirs') != DIRS or c.get('mirror') != {'SW': 'SE', 'W': 'E', 'NW': 'NE'}:
            errors.append('%s: dirs / mirror wrong' % k)
        anims = c.get('anims', {})
        for a, n in BOAT_ANIMS[k].items():
            if anims.get(a, {}).get('frames') != n:
                errors.append('%s: anim %s must have %d frames (got %r)' % (k, a, n, anims.get(a)))
        for a, info in anims.items():
            for d in DIRS:
                for i in range(info.get('frames', 0)):
                    f = frame_of(c.get('atlas'), '%s_%s_%d' % (a, d, i), k)
                    if f and [f['sourceSize']['w'], f['sourceSize']['h']] != c.get('frameSize'):
                        errors.append('%s: frame %s_%s_%d sourceSize != frameSize' % (k, a, d, i))
        cp = c.get('cargoPoint', {})
        for d in DIRS:
            v = cp.get(d)
            if not (isinstance(v, list) and len(v) == 3 and all(isinstance(x, int) for x in v[:2]) and
                    isinstance(v[2], bool)):
                errors.append('%s: cargoPoint[%s] %r is not [dx, dy, behind]' % (k, d, v))
        ax, ay = c.get('anchor', [None, None])
        if not (isinstance(ax, (int, float)) and 0 <= ax <= 1 and 0 <= ay <= 1):
            errors.append('%s: bad anchor' % k)
    # staff overrides refer to real props sprites
    try:
        props = json.load(open(os.path.join(ASSETS, 'props', 'manifest.json'), encoding='utf-8'))['sprites']
        for k in STAFF:
            if k in sprites and sprites[k].get('of') not in props:
                errors.append('%s: %r is not a props sprite' % (k, sprites[k].get('of')))
    except (OSError, ValueError, KeyError):
        warns.append('props manifest unreadable - staff override targets not verified')
    # key collisions with the other fragments
    mine = set(sprites) | set(chars) | {a['key'] for a in man.get('atlases', [])}
    for frag in OTHER:
        p = os.path.join(ASSETS, frag, 'manifest.json')
        if not os.path.exists(p):
            continue
        try:
            o = json.load(open(p, encoding='utf-8'))
        except ValueError:
            warns.append('%s/manifest.json unreadable' % frag)
            continue
        theirs = set(o.get('sprites', {})) | set(o.get('characters', {})) | {a['key'] for a in o.get('atlases', [])}
        theirs |= {i['key'] for i in o.get('images', [])} | {s['key'] for s in o.get('spritesheets', [])}
        clash = sorted(mine & theirs)
        if clash:
            errors.append('key collision with %s: %s' % (frag, clash))
    mb = total / 1048576.0
    if mb > BUDGET_MB:
        errors.append('payload %.2f MB > %.1f MB budget' % (mb, BUDGET_MB))
    extra = sorted(set(sprites) - set(REQUIRED))
    print('buildings manifest: %d sprites (%d required, %d extra: %s), %d boats, %d atlases, payload %.2f MB'
          % (len(sprites), len(REQUIRED), len(extra), ', '.join(extra) or '-', len(chars), len(atlas_frames), mb))
    for w in warns:
        print('WARN:', w)
    for e in errors:
        print('FAIL:', e)
    print('%d errors, %d warnings' % (len(errors), len(warns)))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
