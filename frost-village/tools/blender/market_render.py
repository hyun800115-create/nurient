"""
market_render.py - render the first shop's stall stages (market_assets.py) into a raw frame cache; market_pack.py
then makes assets/market/ (atlas + manifest) and the preview.

Same camera / light / PPU / shadow catcher / sidecar format as the v3 buildings: the frame, its anchor and the
interaction markers come from bld_render.render_build (imported, unchanged).  What is new here is the FRONT LAYER
mask: instead of bld_render's half-space mask (every surface on the camera side of a vertical plane through the
clerk - that would also cut the shelf's right end and the barrel over the clerk), the builder lists the objects of
its front layer (the counter and what stands on it) and only those are white in `<stage>_front_mask.png`.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/market_render.py -- [keys ...] [--force] [--samples N] [--cache DIR]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/market_render.py -- [same args]
Default cache: <tmp>/fv_cache/market.  Deterministic (fixed seeds + sample counts); resumable (a stage whose
sidecar + frames + mask exist is skipped unless --force).
"""
import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402

import bl_common as bc  # noqa: E402
import bld_render as BR  # noqa: E402   (render_build, render_png: read-only reuse)
import market_assets as MA  # noqa: E402


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'market')}
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


def object_mask_material(white):
    name = 'LayerMaskW' if white else 'LayerMaskK'
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1.0, 1.0, 1.0, 1.0) if white else (0.0, 0.0, 0.0, 1.0)
    em.inputs['Strength'].default_value = 1.0
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def render_layer_mask(front, path, samples=16):
    """White = the objects of the front layer, black = everything else (so a back object in front of a front object
    still covers it), no shadow catcher, no lights."""
    sc = bpy.context.scene
    cat = bpy.data.objects.get('ShadowCatcher')
    if cat:
        cat.hide_render = True
    fset = set(front)
    W, K = object_mask_material(True), object_mask_material(False)
    for o in sc.objects:
        if o.type in ('MESH', 'CURVE') and o.name != 'ShadowCatcher':
            o.data.materials.clear()
            o.data.materials.append(W if o in fset else K)
            if o.type == 'MESH':
                for p in o.data.polygons:
                    p.material_index = 0
        elif o.type == 'LIGHT':
            o.hide_render = True
    sc.cycles.samples = samples
    sc.cycles.use_denoising = False
    BR.render_png(path)


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


def render_stage(key, cache, samples=None):
    spec = dict(MA.MARKET[key])
    held = {}
    fn = spec['fn']

    def build():
        res = fn() or {}
        held['front'] = list(res.pop('front', []) or [])
        return res
    spec['fn'] = build
    meta = BR.render_build(spec, cache, samples)
    ov_key = '%s_front' % key
    mask = ov_key + '_mask'
    render_layer_mask(held['front'], os.path.join(cache, mask + '.png'))
    meta['overlay'] = {'key': ov_key, 'mask': mask, 'of': meta['frames'][0],
                       'notes': 'the counter and what stands on it (object mask: only the builder\'s front layer)'}
    meta['stepH'] = MA.STEP_H
    meta['counterH'] = MA.COUNTER_H
    meta['signTop'] = MA.SIGN_TOP
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] front layer: %d objects -> %s' % (key, len(held['front']), mask), flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = opts['keys'] or list(MA.MARKET)
    for k in keys:
        if k not in MA.MARKET:
            raise SystemExit('unknown stall stage: %s (known: %s)' % (k, ', '.join(MA.MARKET)))
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if not opts['force'] and cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_stage(k, opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
