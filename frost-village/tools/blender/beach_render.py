"""
beach_render.py - render the v7 "햇살 해변" (Sunny Beach) props (docs/CONTRACT_V7.md section W) into a raw frame
cache: one PNG per frame + one sidecar JSON per build (sprites{} props), and per-key folders with meta.json for the
characters-style atlases (water-plane boats, crab - see beach_boats.py).  beach_pack.py then makes assets/beach/.

Same camera / light / PPU / markers as the village, town and harbour sets: bl_common + prop_lib + bld_render
(markers, parent_to_root, frames_for, cached, render_png, render_overlay_mask) + harbor_render (shadow framing on
the catcher plane, seamless tile framing) are imported READ-ONLY.  render_beach() is a copy-and-extend of
harbor_render.render_harbor():
  * shadow catcher on the sand (z 0); water-plane props are modelled with their waterline at z 0, so the same
    catcher is their sea surface and hides what is under the water;
  * any number of states / anim frames sharing one frame + anchor (res['frames'] + res['anims'] with named loops,
    e.g. parasol flutter, palm sway, shower water, buoy-line bob, ball bounce, sandcastle build stages);
  * per-frame marker points (staff / customer / seat / lie / work / look ...);
  * seamless tiles (boardwalk, buoy line) with the harbour tile framing + partition-of-unity cut at pack time;
  * occluder overlays (lifeguard_tower_front) with bld_render's camera-side plane mask.

Re-run (build machine, Blender as a Python module):
    /tmp/bvenv/bin/python tools/blender/beach_render.py -- [keys ...] [--force] [--samples N] [--cache DIR] [--list]
Re-run (your PC, Blender 4.2+):
    blender -b -P tools/blender/beach_render.py -- [same args]

  * no keys -> render every build (props + boats + crab) that is not cached yet (resumable)
  * keys    -> build keys (parasol_red, lifeguard_tower, swan_pedal_boat ...), prefixes with a trailing *
               (parasol_*), or a group / atlas name (shade, play, service, nature, water, tiles, boats)
  * --force -> re-render even if cached;  --dirs / --anims (boats / crab only) render a subset (look-dev)
Default cache: <tmp>/fv_cache/beach.  Deterministic: fixed seeds + sample counts.
Frames are written as <name>.tmp.png and renamed, so an interrupted run resumes cleanly.
"""
import json
import math
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import bl_common as bc  # noqa: E402
import prop_lib as L  # noqa: E402
import bld_assets as BA  # noqa: E402
import bld_render as BR  # noqa: E402   (read-only reuse: markers, parent_to_root, frames_for, cached, render_png)
import harbor_render as HR  # noqa: E402 (read-only reuse: frame_fit_h / fit_frames_h / tile_frame)
import beach_assets as BAS  # noqa: E402

PLANES = [0.0]


def parse(argv):
    opts = {'keys': [], 'force': False, 'samples': None,
            'cache': os.path.join(tempfile.gettempdir(), 'fv_cache', 'beach'), 'list': False, 'dirs': None,
            'anims': None}
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


def boats():
    import beach_boats as BB_
    return BB_


def all_keys():
    return list(BAS.BEACH) + list(boats().CHARS)


def select(keys):
    allk = all_keys()
    if not keys:
        return allk
    chars = boats().CHARS
    out = []
    for k in keys:
        if k.endswith('*'):
            out += [n for n in allk if n.startswith(k[:-1])]
        elif k in allk:
            out.append(k)
        elif k == 'boats':
            out += list(chars)
        else:
            grp = [n for n, s in BAS.BEACH.items() if k in (s['extra'].get('zone'), s['atlas'],
                                                              s['atlas'].replace('beach_', ''))]
            grp += [n for n, s in BAS.BEACH.items() if k in (s['sprites'] or [])]
            if not grp:
                raise SystemExit('unknown key: ' + k)
            out += grp
    seen = set()
    return [k for k in out if not (k in seen or seen.add(k))]


# --------------------------------------------------------------------------- render one build

def frames_for(spec, res):
    if res.get('frames'):
        return res['frames']
    return BR.frames_for(spec, res)


def render_beach(spec, cache, samples=None):
    key = spec['key']
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    BA.MARKERS.clear()
    bc.setup_lighting()
    res = spec['fn']() or {}
    if spec['work'] and not res.get('frames') and not ('idle' in res and 'work' in res):
        raise SystemExit('%s: a build with work frames must return idle() and work(i)' % key)
    BR.parent_to_root(spec['yaw'])
    frames = frames_for(spec, res)
    tile = res.get('tile')
    if tile:
        if frames[0][1]:
            frames[0][1]()
        bpy.context.view_layer.update()
        W, H_, anchor, top = HR.tile_frame(tile, PLANES)
        tops = {n: int(round(top)) for n, _ in frames}
    else:
        W, H_, anchor, tops = HR.fit_frames_h(frames, spec['shadow'], PLANES)
    if spec['shadow']:
        bc.add_shadow_catcher(size=spec['catcher'])
    sc = bc.setup_render(W, H_, samples=samples or spec['samples'])
    if res.get('bounces'):
        sc.cycles.max_bounces = res['bounces']
    bc.setup_camera(W, H_, anchor)
    fpts, fdirs = {}, {}
    R = Matrix.Rotation(math.radians(spec['yaw']), 3, 'Z')
    wpts = {}
    for name, setter in frames:
        if setter:
            setter()
        bpy.context.view_layer.update()
        BR.render_png(os.path.join(cache, name + '.png'))
        fpts[name], fdirs[name] = BR.markers(spec['yaw'])
        if res.get('points_fn'):
            wpts[name] = {n: BR.px(R @ Vector(p)) for n, p in res['points_fn']().items() if p is not None}
    if frames[0][1]:
        frames[0][1]()
    bpy.context.view_layer.update()
    meta = {
        'build': key, 'kind': spec['kind'], 'atlas': spec['atlas'], 'frameSize': [W, H_],
        'anchorPx': list(anchor), 'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H_, 5)],
        'frames': [n for n, _ in frames], 'shadow': spec['shadow'], 'notes': spec['notes'], 'yaw': spec['yaw'],
        'topPx': tops, 'framePoints': fpts, 'frameDirs': fdirs,
        'sprites': res.get('sprites') or {key: {'frame': frames[0][0]}},
        'ground': spec['ground'],
    }
    if wpts:
        meta['frameWorldPoints'] = wpts
    if res.get('anims'):
        meta['anims'] = res['anims']
    elif spec['work']:
        meta['anims'] = {'work': {'frames': [n for n, _ in frames[1:]], 'fps': spec['fps'], 'repeat': -1}}
        if spec.get('anim_name'):
            meta['animAlias'] = spec['anim_name']
    if spec['fp'] is not None:
        meta['footprint'] = L.footprint_px(spec['fp'], spec['yaw'])
        meta['footprintM'] = list(spec['fp']) if spec['fp'][0] != 'r' else {'radius': spec['fp'][1]}
    if spec['front']:
        meta['front'] = spec['front']
    fx = {n: BR.px(R @ Vector(p)) for n, p in (res.get('fx') or {}).items() if p is not None}
    if fx:
        meta['fxPoints'] = fx
    if res.get('points'):
        meta['points'] = {}
        for n, p in res['points'].items():
            if isinstance(p, list):
                meta['points'][n] = [BR.px(R @ Vector(q)) for q in p]
            else:
                meta['points'][n] = BR.px(R @ Vector(p))
    if tile:
        meta.update({'tileAxis': tile['axis'], 'segM': round(tile['seg'], 5),
                     'stepPx': tile.get('stepPx') or ([64, 32] if tile['axis'] == 'x' else [64, -32]),
                     'rampM': tile['ramp'], 'openEnds': {'neg': bool(tile['ends'][0]), 'pos': bool(tile['ends'][1])},
                     'cuts': [list(c) for c in tile['cuts']]})
    meta.update(spec['extra'])
    meta.update(res.get('extra') or {})
    ov = res.get('overlay')
    if ov:
        mask = '%s_mask' % ov['key']
        c_world = R @ Vector(ov['at'])
        BR.render_overlay_mask(c_world, os.path.join(cache, mask + '.png'))
        meta['overlay'] = {'key': ov['key'], 'mask': mask, 'of': frames[0][0],
                           'notes': ov.get('notes', 'every surface on the camera side of the vertical plane through '
                                                    'the staff spot (railing in front of the guard)')}
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %d frame(s)  %.1fs' % (key, W, H_, anchor, len(frames), time.time() - t0),
          flush=True)
    return meta


def main():
    opts = parse(bc.script_args())
    keys = select(opts['keys'])
    BB_ = boats()
    if opts['list']:
        for k in keys:
            if k in BAS.BEACH:
                s = BAS.BEACH[k]
                print(k, s['kind'], s['atlas'], 'work=%d' % s['work'], ', '.join(s['sprites'] or [k]))
            else:
                s = BB_.CHARS[k]
                print(k, s['kind'], s['dirs'], ', '.join('%s(%d)' % (a, v['frames']) for a, v in s['anims'].items()))
        return
    os.makedirs(opts['cache'], exist_ok=True)
    t0 = time.time()
    for k in keys:
        if k in BB_.CHARS:
            BB_.render_char(k, opts)
            continue
        if not opts['force'] and BR.cached(k, opts['cache']):
            print('[%s] cached' % k)
            continue
        render_beach(BAS.BEACH[k], opts['cache'], opts['samples'])
    print('all done in %.0fs' % (time.time() - t0), flush=True)


if __name__ == '__main__':
    main()
