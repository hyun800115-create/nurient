"""
deck43_render.py - render the v4.3 step-A art (deck43_assets.py: the fishing deck tiers, the rod holder, the fish crate,
the 옷·신발 공방) into a raw frame cache; deck43_pack.py then makes assets/deck43/ (atlas + manifest).

Same camera / light / PPU / shadow catcher / sidecar format as the v3 buildings (bld_render.render_build, imported
unchanged) and the same object-mask front layer as the stall (market_render.render_layer_mask, imported unchanged):
a deck tier's `front` objects (near rails, the gangway's near rail, the 3단 roof) are white in <key>_front_mask.png.

Re-run (build machine, Blender as a Python module; one Blender at a time, niced, low samples):
    nice -n 15 /tmp/bvenv/bin/python tools/blender/deck43_render.py -- [keys ...] [--force] [--samples N] [--cache DIR]
Default cache: <tmp>/fv_cache/deck43.  Resumable (a build whose sidecar + frames (+ mask) exist is skipped).
"""
import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402,F401

import bl_common as bc  # noqa: E402
import bld_render as BR  # noqa: E402   (render_build, render_png: read-only reuse)
import market_render as MR  # noqa: E402   (render_layer_mask: read-only reuse)
import deck43_assets as DA  # noqa: E402


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None, 'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'deck43')}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def cached(key, cache):
    side = os.path.join(cache, key + '.json')
    if not os.path.exists(side):
        return False
    try:
        meta = json.load(open(side))
    except Exception:
        return False
    names = list(meta.get('frames', [])) + ([meta['overlay']['mask']] if meta.get('overlay') else [])
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


def render_one(key, cache, samples=None):
    spec = dict(DA.DECK43[key])
    held = {}
    fn = spec['fn']

    def build():
        res = fn() or {}
        held['front'] = list(res.pop('front', []) or [])
        return res
    spec['fn'] = build
    meta = BR.render_build(spec, cache, samples)
    if held['front']:
        ov_key = meta['frames'][0].replace('_back', '_front')
        mask = ov_key + '_mask'
        MR.render_layer_mask(held['front'], os.path.join(cache, mask + '.png'))
        meta['overlay'] = {'key': ov_key, 'mask': mask, 'of': meta['frames'][0],
                           'notes': 'the near rails, the gangway near rail and the 3단 roof (object mask)'}
    meta['deckZ'] = DA.DZ
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %d frame(s), front layer: %d objects' % (key, len(meta['frames']), len(held['front'])), flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = opts['keys'] or list(DA.DECK43)
    for k in keys:
        if k not in DA.DECK43:
            raise SystemExit('unknown build: %s (known: %s)' % (k, ', '.join(DA.DECK43)))
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_one(k, opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
