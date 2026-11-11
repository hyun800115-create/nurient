"""
bakery_render.py - render the v4.3 「밀밭 · 빵집」 art (bakery_assets.py: the bakery cottage, its bread stall, the field's
농막, scarecrow, sled cart and sacks) into a raw frame cache; bakery_pack.py then makes assets/bakery43/ (atlas +
manifest + ghost signatures).

Same camera / light / PPU / shadow catcher / sidecar format as the v3 buildings (bld_render.render_build, imported
unchanged) and the same object-mask layers as the stall and the deck (market_render.render_layer_mask, imported
unchanged):
  * a builder's `front` objects are white in <key>_front_mask.png (the cottage's sill / ledge, the stall's counter);
  * a builder's `stock` sets (the stall's loaves) are rendered as extra frames with the set shown, and each set is
    white in <overlay>_mask.png, so the stock overlay = that frame x its mask (same frame + anchor as the stall).

Re-run (build machine, Blender as a Python module; one Blender at a time, niced, under the shared lock):
    flock <lock> nice -n 10 /tmp/bvenv/bin/python tools/blender/bakery_render.py -- [keys ...] [--force] [--samples N]
          [--cache DIR]
Default cache: <tmp>/fv_cache/bakery43.  Resumable (a build whose sidecar + frames + masks exist is skipped).
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
import bakery_assets as BK  # noqa: E402


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'bakery43')}
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
    names = list(meta.get('frames', []))
    if meta.get('overlay'):
        names.append(meta['overlay']['mask'])
    names += [s['mask'] for s in meta.get('stock', [])]
    return all(os.path.exists(os.path.join(cache, n + '.png')) for n in names)


def render_one(key, cache, samples=None):
    spec = dict(BK.BAKERY43[key])
    held = {}
    fn = spec['fn']

    def build():
        res = fn() or {}
        held['front'] = list(res.pop('front', []) or [])
        held['stock'] = res.pop('stock', {}) or {}
        held['frames'] = list(res.get('frames') or [])
        return res
    spec['fn'] = build
    meta = BR.render_build(spec, cache, samples)
    base = meta['frames'][0]
    # stock frames are only sources for the overlays: the sprite list keeps the base frame
    setters = dict(held['frames'])
    if held['front']:
        if setters.get(base):
            setters[base]()
        ov_key = base.replace('_back', '_front')
        mask = ov_key + '_mask'
        MR.render_layer_mask(held['front'], os.path.join(cache, mask + '.png'))
        meta['overlay'] = {'key': ov_key, 'mask': mask, 'of': base,
                           'notes': 'the objects of the builder\'s front block (object mask)'}
    stock = []
    for k, (ov_key, objs) in enumerate(sorted(held['stock'].items())):
        src = '%s_b%d' % (base.replace('_back', ''), k + 1)
        if src not in setters:
            raise SystemExit('%s: stock overlay %s has no source frame %s' % (key, ov_key, src))
        setters[src]()
        mask = ov_key + '_mask'
        MR.render_layer_mask(objs, os.path.join(cache, mask + '.png'))
        stock.append({'key': ov_key, 'mask': mask, 'src': src, 'of': base})
    if stock:
        meta['stock'] = stock
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %d frame(s), front layer: %d objects, stock overlays: %s' % (
        key, len(meta['frames']), len(held['front']), ', '.join(s['key'] for s in stock) or '-'), flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = opts['keys'] or list(BK.BAKERY43)
    for k in keys:
        if k not in BK.BAKERY43:
            raise SystemExit('unknown build: %s (known: %s)' % (k, ', '.join(BK.BAKERY43)))
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
