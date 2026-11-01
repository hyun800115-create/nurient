"""
market_pack.py - turn the stall renders (market_render.py cache) into assets/market/: one trimmed Phaser atlas per
stage (market_s1.png/.json) + manifest.json.  No Blender needed: python3 with numpy + Pillow (+ imagequant).

    python3 tools/blender/market_pack.py [--cache DIR] [--prev DIR] [--quantize auto|on|off]

  1. reads <cache>/<stage>.json sidecars (bld_render format + the object-mask overlay of market_render.py)
  2. the SAME post as the props / v3 buildings (bld_pack.load: clean_alpha + tint_shadow + border_fade; the front
     layer = the base frame x the object mask)
  3. atlas per stage (assets/market/<stage>.png/.json); palettised with libimagequant when the RGBA file is over
     the 1 MB per page budget (--quantize auto)
  4. assets/market/manifest.json: <stage>_back (staffPoints / staffDirs / staffDepth "front" / overlay /
     stepLiftPx / customerPoints / signQuad / fxPoints) + <stage>_front (kind overlay)
  5. --prev DIR: a look-dev sheet <DIR>/market_stages.png (the docs folder is not written by default)
Guard: it refuses (exit 1, nothing written) when a stage of the current manifest has no render in the cache.
The game loads assets/market at boot (src/core/Assets.js FRAGMENTS 'market'): the first stall is on screen at
second 0 of a new game.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import bld_pack as bp    # noqa: E402  (read-only reuse: load = post-processing + overlay cut, quantize)

OUT = os.path.join(GAME, 'assets', 'market')
DEFAULT_CACHE = os.path.join(__import__('tempfile').gettempdir(), 'fv_cache', 'market')
PAGE_BUDGET = 1.0 * 1048576
SIGN = {'market_s1': {'text': 'sign_market_1', 'color': '#6E3E1E'}}

CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre.',
    'layers': '<stage>_back = the whole stall (posts, shelf, signboard, step, counter); <stage>_front = only the '
              'counter and what stands on it (same frame + anchor). Draw back (depth d), the clerk at '
              'staffPoints[0] lifted by stepLiftPx (d + 0.5), front (d + 1).',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the sprite anchor (unscaled sprite).',
    'staffPoints': 'the clerk\'s feet on the plank step, projected to the ground (z = 0); stepLiftPx = how far the '
                   'sprite is drawn higher because the clerk stands on the step.',
    'customerPoints': 'where the first customer of the line stands: diagonally front-left of the clerk, so the '
                      'front customer does not stand between the camera and the clerk.',
    'signQuad': 'the 4 corners [top-left, top-right, bottom-right, bottom-left] of the blank signboard face (it faces '
                'world -Y: the top edge slopes down to the right, 1 px down per 2 px across). The game writes the '
                'stage name (signText = a strings.js key) into it, sheared the same way.',
}


def entries(k, m, frame_atlas):
    first = m['frames'][0]
    pts = m['framePoints'][first]
    dirs = m.get('frameDirs', {}).get(first, {})
    staff, step = pts['staff'][0], pts['step'][0]
    s = {'atlas': frame_atlas[first], 'frame': first, 'anchor': m['anchor'], 'kind': 'building',
         'footprint': m['footprint'], 'footprintM': m['footprintM'], 'frameSize': m['frameSize'],
         'topPx': m['topPx'].get(first) if isinstance(m['topPx'], dict) else m['topPx'], 'front': m.get('front', '-Y'),
         'staffPoints': [staff], 'staffDirs': dirs.get('staff', ['SW'])[:1], 'staffDepth': 'front',
         'stepLiftPx': int(staff[1] - step[1]), 'stepM': m.get('stepH'), 'counterM': m.get('counterH'),
         'signTopM': m.get('signTop'),
         'customerPoints': pts.get('customer', []), 'customerDirs': dirs.get('customer', []),
         'signQuad': pts['sign'], 'signText': SIGN.get(k, {}).get('text'), 'signColor': SIGN.get(k, {}).get('color'),
         'overlay': m['overlay']['key'], 'stage': int(k.rsplit('_s', 1)[1]) if '_s' in k else 1,
         'notes': m.get('notes', '')}
    if m.get('fxPoints'):
        s['fxPoints'] = m['fxPoints']
    ov = m['overlay']['key']
    o = {'atlas': frame_atlas[ov], 'frame': ov, 'anchor': m['anchor'], 'kind': 'overlay', 'of': first,
         'frameSize': m['frameSize'],
         'notes': 'Front layer of %s (same frame + anchor): %s. Draw it ABOVE the clerk (d + 1).' % (first,
                                                                                                   m['overlay']['notes'])}
    return {first: s, ov: o}


def preview(keys, builds, frames, path):
    cells = []
    for k in keys:
        m = builds[k]
        base = frames[m['frames'][0]]
        ov = frames[m['overlay']['key']]
        cv = Image.new('RGBA', (base.width * 2 + 30, base.height + 30), (200, 132, 104, 255))
        cv.alpha_composite(base, (10, 20))
        ax, ay = m['anchorPx']
        d = ImageDraw.Draw(cv)
        pts = m['framePoints'][m['frames'][0]]
        q = [(10 + ax + x, 20 + ay + y) for x, y in pts['sign']]
        d.polygon(q, outline=(40, 120, 220, 255))
        sx, sy = pts['staff'][0]
        d.ellipse((10 + ax + sx - 4, 20 + ay + sy - 4, 10 + ax + sx + 4, 20 + ay + sy + 4), outline=(220, 40, 40, 255))
        cv.alpha_composite(ov, (base.width + 20, 20))
        d.text((10, 4), k + '  back | front', fill=(0, 0, 0, 255))
        cells.append(cv)
    W = max(c.width for c in cells)
    sheet = Image.new('RGBA', (W, sum(c.height for c in cells)), (200, 132, 104, 255))
    y = 0
    for c in cells:
        sheet.alpha_composite(c, (0, y))
        y += c.height
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert('RGB').save(path)
    print('preview', path)


def main():
    args = sys.argv[1:]

    def opt(k, d=None):
        return args[args.index(k) + 1] if k in args else d
    cache = opt('--cache', DEFAULT_CACHE)
    prev = opt('--prev')
    mode = opt('--quantize', 'auto')
    if not os.path.isdir(cache):
        raise SystemExit('market_pack: no render cache %s - run market_render.py first' % cache)
    keys, builds, _boats, _staff, frames, _bf = bp.load(cache)
    keys = [k for k in keys if k.startswith('market_')]
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
    have = {e for k in keys for e in (builds[k]['frames'][0], builds[k]['overlay']['key'])}
    missing = sorted(set((old.get('sprites') or {}).keys()) - have)
    if not keys or missing:
        raise SystemExit('market_pack: ABORT - the cache %s lacks %s; nothing was written (render them first: '
                         'market_render.py)' % (cache, ', '.join(missing) or 'every stage'))
    os.makedirs(OUT, exist_ok=True)
    atlases, sprites, frame_atlas = [], {}, {}
    for k in keys:
        m = builds[k]
        names = [m['frames'][0], m['overlay']['key']]
        sheet, atlas = pu.pack_atlas([(n, frames[n]) for n in names], max_width=2048, trim=True, padding=2)
        png, js = os.path.join(OUT, k + '.png'), os.path.join(OUT, k + '.json')
        pu.save_atlas(sheet, atlas, png, js, quantize=False)
        size = os.path.getsize(png)
        if mode == 'on' or (mode == 'auto' and size > PAGE_BUDGET):
            try:
                bp.quantize(sheet).save(png, optimize=True)
                print('  %s palettised (%d KB RGBA -> %d KB)' % (k, size // 1024, os.path.getsize(png) // 1024))
            except ImportError:
                print('  imagequant not installed -> kept RGBA')
        for n in atlas['frames']:
            frame_atlas[n] = k
        atlases.append({'key': k, 'png': 'market/%s.png' % k, 'json': 'market/%s.json' % k})
        sprites.update(entries(k, m, frame_atlas))
        print('%-10s %4dx%-4d %d frames %6.1f KB  (GPU %.2f MiB)' % (k, sheet.width, sheet.height,
                                                                   len(atlas['frames']), os.path.getsize(png) / 1024.0,
                                                                   sheet.width * sheet.height * 4 / 1048576.0))
    man = {'version': 1, 'generator': 'tools/blender/market_render.py + market_pack.py (v4.2.0.2 M1: the first '
                                      'shop\'s stall stages)', 'conventions': CONVENTIONS,
           'atlases': atlases, 'sprites': sprites}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('wrote', man_path, '(%d sprites)' % len(sprites))
    if prev:
        preview(keys, builds, frames, os.path.join(prev, 'market_stages.png'))


if __name__ == '__main__':
    main()
