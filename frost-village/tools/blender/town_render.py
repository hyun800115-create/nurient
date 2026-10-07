"""
town_render.py - render the neighbour town "솔방울 마을" (docs/CONTRACT_V4.md section K) into a raw frame cache:
one PNG per frame + one sidecar JSON per build.  town_pack.py then makes assets/town/ (atlases + manifest.json)
and the previews.

  * buildings / street props (town_assets.TOWN) go through bld_render.render_build() UNCHANGED - the exact
    camera, light, PPU, shadow catcher, frame fit and marker maths of the village buildings;
  * rail tiles (town_rails.RAILS) are cut out of a long continuous track render (seamless tiling, see town_rails);
  * the snow train (town_train.TRAIN) is rendered like the characters / boats: 5 dirs, idle + move anims,
    no baked shadow (ink outline at pack time) + separate soft shadow frames for all 8 headings.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/town_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/town_render.py -- [same args]

  * no keys  -> render every build that is not cached yet (resumable)
  * keys     -> build keys (school, cafe, rail_x, train_engine ...), prefixes with a trailing * (townhouse_*,
                rail_*, train_*), or a group name: civic, shops, homes, park, street, rails, train
  * --force  -> re-render even if cached;  --dirs S,E / --anims move  (train only) render a subset (look-dev)
Default cache: <tmp>/fv_cache/town.  Deterministic: fixed seeds + sample counts.
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
import bld_render as BR  # noqa: E402   (read-only reuse: render_build, cached)
import town_assets as TA  # noqa: E402


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'town'), 'list': False,
            'dirs': None, 'anims': None}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--force':
            opts['force'] = True
        elif a in ('--samples', '--cache', '--dirs', '--anims'):
            i += 1
            opts[a[2:]] = int(argv[i]) if a == '--samples' else argv[i]
        elif a == '--list':
            opts['list'] = True
        else:
            opts['keys'].append(a)
        i += 1
    return opts


def registries():
    import town_rails as TR
    import town_train as TT
    return TR, TT


def all_keys():
    TR, TT = registries()
    return list(TA.TOWN) + list(TR.RAILS) + list(TT.TRAIN)


def groups():
    TR, TT = registries()
    g = {}
    for k, s in TA.TOWN.items():
        g.setdefault(s['extra'].get('zone', 'misc'), []).append(k)
    g['rails'] = list(TR.RAILS)
    g['train'] = list(TT.TRAIN)
    return g


def select(keys):
    allk = all_keys()
    if not keys:
        return allk
    gr = groups()
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        elif k in gr:
            out += gr[k]
        else:
            hit = [n for n, s in TA.TOWN.items() if k in (s['sprites'] or [n])]
            if not hit:
                raise SystemExit('unknown key: ' + k)
            out += hit
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


def render_town_build(spec, cache, samples):
    meta = BR.render_build(spec, cache, samples)
    # town extras on top of the bld sidecar (name, zone, anim alias) - rewritten in place
    side = os.path.join(cache, spec['key'] + '.json')
    m = json.load(open(side))
    if spec.get('anim_name') and 'anims' in m:
        m['animAlias'] = spec['anim_name']
    m['townKind'] = spec['kind']
    with open(side, 'w') as f:
        json.dump(m, f, indent=1)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    TR, TT = registries()
    if opts['list']:
        for k in keys:
            if k in TA.TOWN:
                s = TA.TOWN[k]
                print(k, s['kind'], s['atlas'], 'zone=%s' % s['extra'].get('zone'), 'work=%d' % s['work'])
            elif k in TR.RAILS:
                print(k, 'rail tile', TR.RAILS[k]['axis'])
            else:
                print(k, 'train car', ', '.join('%s(%d)' % (a, n['frames']) for a, n in TT.TRAIN[k]['anims'].items()))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if k in TT.TRAIN:
            TT.render_car(k, opts)
            continue
        if k in TR.RAILS:
            if not opts['force'] and TR.cached(k, opts['cache']):
                print('[%s] cached' % k)
                continue
            TR.render_rail(k, opts['cache'], opts['samples'])
            continue
        if not opts['force'] and BR.cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_town_build(TA.TOWN[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
