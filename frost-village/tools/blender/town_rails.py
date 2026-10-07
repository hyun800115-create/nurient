"""
town_rails.py - snow-train track tiles for 솔방울 마을 (docs/CONTRACT_V4.md section K): straight segments along both
iso axes, road crossings and buffer-stop ends.  They tile like the props' fence_log_x / fence_log_y, but seamlessly:

  * one tile = one grid cell of SEG = sqrt(2) m (~1.414 m) along world X or Y, so consecutive tiles sit exactly
    (+64, +32) px (x axis, track runs screen down-right) or (+64, -32) px (y axis, screen up-right) apart - integer
    steps, no sub-pixel drift;
  * every tile is cut out of a render of a LONG continuous track (identical, periodic geometry: same seeds per
    segment), so ballast, sleepers, rails, snow and the baked contact shadow continue across tile borders;
  * town_pack applies a partition-of-unity weight w(u) along the axis (u = ground coordinate of each pixel, a linear
    ramp of +-h around each tile border, w(u) + w(u - SEG) = 1) with alpha' = 1 - (1 - alpha)^w, so two neighbouring
    tiles composite back to exactly the continuous image (same trick as prop_pack.tile_shadow, here for the whole tile).

Track: gravel ballast bed with snowy edges, three wooden sleepers per tile, two steel rails (gauge 0.9 m, rail head at
RAIL_TOP = 0.15 m - the train's wheels stand there).  Anchor = track centre line at the middle of the tile (z = 0);
the train cars' anchors go on the same centre line.  Rendered by town_render.py; sidecar <key>.json like the buildings
plus tileAxis / segM / stepPx / rampM / openEnds.
"""
import json
import math
import os
import time
from collections import OrderedDict

import bpy
from mathutils import Vector

import bl_common as bc
import prop_lib as L
from prop_lib import flat, snowy, tonal, box, cyl, sphere, blob, extrude
import prop_assets as PA
import life_assets as LA

RAILS = OrderedDict()
SEG = math.sqrt(2.0)
GAUGE = 0.9
RAIL_TOP = 0.15
RAMP = 0.1                      # half width (m) of the blend ramp at each tile border
N_SIDE = 3                      # continuous segments rendered on each open side


def rail(key, axis, ends=(True, True), variant='plain', notes=''):
    """ends = (open toward -axis, open toward +axis); a closed end gets a buffer stop."""
    RAILS[key] = dict(key=key, axis=axis, ends=ends, variant=variant, notes=notes)


NOTE = ('Track tile (sqrt(2) m = one 128x64 grid cell) along world %s: %s. Anchor = track centre line, tile middle; '
        'place consecutive tiles exactly %s px apart and they join seamlessly (ballast, sleepers, rails and the '
        'baked shadow continue). Draw tiles on the ground layer (kind decal, under characters / train cars).')
rail('rail_x', 'x', notes=NOTE % ('X', 'straight', '(+64, +32)'))
rail('rail_y', 'y', notes=NOTE % ('Y', 'straight', '(+64, -32)'))
rail('rail_x_crossing', 'x', variant='crossing',
     notes=NOTE % ('X', 'level crossing (planked road between and beside the rails, red-white posts)', '(+64, +32)'))
rail('rail_y_crossing', 'y', variant='crossing',
     notes=NOTE % ('Y', 'level crossing (planked road between and beside the rails, red-white posts)', '(+64, -32)'))
rail('rail_x_end_p', 'x', ends=(True, False),
     notes=NOTE % ('X', 'end of line, buffer stop at the +X (screen down-right) end', '(+64, +32)'))
rail('rail_x_end_n', 'x', ends=(False, True),
     notes=NOTE % ('X', 'end of line, buffer stop at the -X (screen up-left) end', '(+64, +32)'))
rail('rail_y_end_p', 'y', ends=(True, False),
     notes=NOTE % ('Y', 'end of line, buffer stop at the +Y (screen up-right) end', '(+64, -32)'))
rail('rail_y_end_n', 'y', ends=(False, True),
     notes=NOTE % ('Y', 'end of line, buffer stop at the -Y (screen down-left) end', '(+64, -32)'))


# =========================================================================== geometry (built along local X)

def ballast_mat():
    return snowy('#8C8784', lo=0.98, hi=1.22, noise_amt=0.7, noise_scale=6.0, rough=0.95)


def segment(k, variant='plain'):
    """One SEG-long piece of track centred at u = k * SEG (built along +X)."""
    u0 = k * SEG
    objs = []
    # ballast bed: trapezoid profile extruded exactly SEG along X (no end bevel -> invisible joints)
    prof = [(-0.86, 0.0), (0.86, 0.0), (0.7, 0.05), (-0.7, 0.05)]
    b = extrude('ballast%d' % k, [(y, z) for y, z in prof], SEG, rot=(90, 0, 90), top=ballast_mat(),
                side=ballast_mat(), bevel=0.0)
    b.location = (u0 - SEG / 2, 0.0, 0.0)
    objs.append(b)
    # gravel lumps + snow tufts on the shoulders (same per segment)
    rnd = L.rng(7)
    for j in range(6):
        uu = u0 + rnd.uniform(-SEG / 2, SEG / 2)
        side = 1 if j % 2 else -1
        objs.append(blob('grav%d_%d' % (k, j), rnd.uniform(0.05, 0.08), (uu, side * rnd.uniform(0.62, 0.8), 0.04),
                         flat('#7D7874', 0.9), scale=(1.3, 1.0, 0.6), seed=j, amp=0.3, subdiv=1, facet=True))
    for j in range(3):
        uu = u0 - SEG / 2 + (j + 0.3) * SEG / 3
        side = -1 if j % 2 else 1
        objs.append(LA.snow_drift('bsn%d_%d' % (k, j), rnd.uniform(0.16, 0.22),
                                  (uu, side * rnd.uniform(0.82, 0.92), 0.0), seed=20 + j, scale=(1.6, 0.8, 0.3)))
    # sleepers
    wood = tonal('#8A5A33', 0.12, 5.0, rough=0.85)
    for j in range(3):
        uu = u0 - SEG / 2 + (j + 0.5) * SEG / 3
        objs.append(box('slp%d_%d' % (k, j), (0.18, 1.32, 0.06), (uu, 0.0, 0.035), mat=wood, bevel=0.015))
        objs.append(L.snow_slab('slps%d_%d' % (k, j), 0.12, 0.22, 0.025, (uu, (0.45 if j % 2 else -0.5), 0.095),
                                seed=30 + j))
    if variant == 'crossing':
        planks = L.stripes('#C98F55', '#B27843', 1.0 / 0.2, 'X', rough=0.8, soft=0.03)
        for y0, y1 in ((-0.98, -0.53), (-0.37, 0.37), (0.53, 0.98)):
            objs.append(box('xpl%d' % k, (SEG, y1 - y0, 0.1), (u0, (y0 + y1) / 2, 0.05), mat=planks, bevel=0.0))
        objs.append(L.snow_slab('xsn%d' % k, SEG * 0.5, 0.25, 0.03, (u0 + 0.2, 0.75, 0.15), seed=40 + k))
    # rails (head + web + foot), one piece per segment: the tiny joint bevel reads as a fishplate joint
    steel = flat('#AEB8C4', 0.28, 0.75)
    dark = flat('#5A606B', 0.5, 0.5)
    for s in (-1, 1):
        y = s * GAUGE / 2
        objs.append(box('rfoot%d' % k, (SEG, 0.12, 0.02), (u0, y, 0.095), mat=dark, bevel=0.003))
        objs.append(box('rweb%d' % k, (SEG, 0.04, 0.03), (u0, y, 0.11), mat=dark, bevel=0.003))
        objs.append(box('rhead%d' % k, (SEG, 0.075, 0.025), (u0, y, RAIL_TOP - 0.025), mat=steel, bevel=0.006))
        objs.append(box('fish%d' % k, (0.12, 0.1, 0.035), (u0 - SEG / 2, y, 0.1), mat=dark, bevel=0.008))
    return objs


def buffer_stop(u_end, sgn):
    """Buffer stop at the track end u_end; sgn = +1 -> it faces -X (track comes from -X)."""
    red = flat('#D9483B', 0.45)
    objs = []
    x = u_end - sgn * 0.25
    for s in (-1, 1):
        mb = L.MB()
        y = s * GAUGE / 2
        mb.seg(Vector((x, y, RAIL_TOP)), Vector((x, y, 0.62)), 0.05, flat('#5A606B', 0.5, 0.5), segs=8)
        mb.seg(Vector((x + sgn * 0.35, y, RAIL_TOP)), Vector((x, y, 0.6)), 0.04, flat('#5A606B', 0.5, 0.5), segs=8)
        objs.append(mb.done('bstrut%d' % (s > 0)))
    objs.append(box('bbeam', (0.16, 1.3, 0.24), (x, 0.0, 0.42), mat=L.stripes('#D9483B', '#F4F1EA', 4.0, 'Y',
                                                                              soft=0.02), bevel=0.04))
    for s in (-1, 1):
        objs.append(cyl('bbuf', 0.08, 0.14, (x - sgn * 0.12, s * 0.38, 0.54), rot=(0, 90, 0), mat=flat('#2B2F3A', 0.4),
                        segs=14, origin='center'))
    objs.append(PA.snow_cap('bbsnow', 0.3, (x, 0.0, 0.66), 0.08, 3, scale=(0.5, 2.0, 1.0)))
    lm = L.emissive('blamp', '#FF6B5A', '#FF4A3A', 2.5)
    objs.append(cyl('blpost', 0.03, 0.4, (x + sgn * 0.05, 0.0, 0.66), mat=flat('#3D424C', 0.4, 0.5), segs=8))
    objs.append(sphere('blamp', 0.07, (x + sgn * 0.05, 0.0, 1.1), lm, segs=14, rings=8))
    del red
    return objs


def crossing_posts(u0):
    objs = []
    for s in (-1, 1):
        y = s * 1.15
        objs.append(cyl('xpost', 0.04, 1.05, (u0 + s * 0.45, y, 0.0), mat=L.stripes('#D9483B', '#F4F1EA', 6.0, 'Z',
                                                                                     soft=0.02), segs=10))
        for a in (35, -35):
            objs.append(box('xsign', (0.06, 0.62, 0.1), (u0 + s * 0.45, y, 0.92), rot=(a, 0, 0),
                            mat=L.stripes('#F4F1EA', '#D9483B', 5.0, 'Y', soft=0.02), bevel=0.02, origin='center'))
        objs.append(PA.snow_cap('xps', 0.06, (u0 + s * 0.45, y, 1.06), 0.04, 4))
    return objs


# =========================================================================== render

def build_track(spec):
    """Long continuous track along local X (then rotated for axis y).  Returns (objects, local u-range of geometry,
    max height)."""
    ends = spec['ends']
    k0 = -N_SIDE if ends[0] else 0
    k1 = N_SIDE if ends[1] else 0
    objs = []
    for k in range(k0, k1 + 1):
        objs += segment(k, spec['variant'] if k == 0 else 'plain')
    zmax = 0.2
    lo, hi = -SEG / 2 - RAMP, SEG / 2 + RAMP
    if not ends[1]:
        objs += buffer_stop(SEG / 2, +1)
        hi = SEG / 2 + 0.15
        zmax = 1.2
    if not ends[0]:
        objs += buffer_stop(-SEG / 2, -1)
        lo = -SEG / 2 - 0.15
        zmax = 1.2
    if spec['variant'] == 'crossing':
        objs += crossing_posts(0.0)
        zmax = max(zmax, 1.15)
    return objs, (lo, hi), zmax


def frame_for(spec, urange, zmax):
    """Frame + integer anchor covering the tile band (u in urange, across +-1.25 m incl. posts / snow, z up to zmax)
    and the shadow it casts (toward +X)."""
    lo, hi = urange
    lo -= 0.06
    hi += 0.06
    xs, ys = [], []
    for u in (lo, hi):
        for v in (-1.25, 1.25):
            for z in (0.0, zmax):
                p = (u, v, z) if spec['axis'] == 'x' else (-v, u, z)      # axis y: local X -> world Y
                for q in (p, (p[0] + z * L.SHADOW_K, p[1], 0.0)):
                    x, y = L.screen_xy(q)
                    xs.append(x)
                    ys.append(y)
    m = 6
    ax = int(math.ceil(-min(xs) + m))
    ay = int(math.ceil(-min(ys) + m))
    w = (int(math.ceil(ax + max(xs) + m)) + 3) // 4 * 4
    h = (int(math.ceil(ay + max(ys) + m)) + 3) // 4 * 4
    return w, h, (ax, ay)


def cached(key, cache):
    side = os.path.join(cache, key + '.json')
    return os.path.exists(side) and os.path.exists(os.path.join(cache, key + '.png'))


def render_rail(key, cache, samples=None):
    spec = RAILS[key]
    t0 = time.time()
    bc.reset_scene()
    L._CUSTOM.clear()
    bc.setup_lighting()
    objs, urange, zmax = build_track(spec)
    if spec['axis'] == 'y':
        root = bpy.data.objects.new('TrackRoot', None)
        bpy.context.scene.collection.objects.link(root)
        for o in objs:
            if o.parent is None:
                o.parent = root
        root.rotation_euler.z = math.radians(90.0)          # local +X -> world +Y
        bpy.context.view_layer.update()
    W, H, anchor = frame_for(spec, urange, zmax)
    bc.add_shadow_catcher(size=30.0)
    sc = bc.setup_render(W, H, samples=samples or 48)
    sc.cycles.max_bounces = 4
    bc.setup_camera(W, H, anchor)
    path = os.path.join(cache, key + '.png')
    tmp = path[:-4] + '.tmp.png'
    bc.render_to(tmp)
    os.replace(tmp, path)
    step = [64, 32] if spec['axis'] == 'x' else [64, -32]
    meta = {'build': key, 'kind': 'decal', 'atlas': 'town_rails', 'frameSize': [W, H], 'anchorPx': list(anchor),
            'anchor': [round(anchor[0] / W, 5), round(anchor[1] / H, 5)], 'frames': [key], 'shadow': True,
            'notes': spec['notes'], 'yaw': 0.0, 'topPx': {key: int(round(zmax * bc.VERTICAL_SCALE * bc.PPU))},
            'framePoints': {key: {}}, 'frameDirs': {key: {}}, 'sprites': {key: {'frame': key}},
            'footprint': L.footprint_px((SEG, 1.72) if spec['axis'] == 'x' else (1.72, SEG)),
            'footprintM': [round(SEG, 4), 1.72] if spec['axis'] == 'x' else [1.72, round(SEG, 4)],
            'tileAxis': spec['axis'], 'segM': round(SEG, 5), 'stepPx': step, 'rampM': RAMP,
            'openEnds': {'neg': spec['ends'][0], 'pos': spec['ends'][1]}, 'railTopM': RAIL_TOP, 'gaugeM': GAUGE,
            'variant': spec['variant'], 'townKind': 'rail'}
    with open(os.path.join(cache, key + '.json'), 'w') as f:
        json.dump(meta, f, indent=1)
    print('[%s] %dx%d anchor %s  %.1fs' % (key, W, H, anchor, time.time() - t0), flush=True)
    return meta
