"""
lgx_pack.py - turn the raw logistics renders (lgx_render.py cache) into assets/logistics/: trimmed Phaser atlases
(each sheet <= 2048 px, 256-colour palettes) + manifest.json.  Previews: lgx_preview.py.

No Blender needed: python3 with numpy + Pillow (+ imagequant).
    python3 tools/blender/lgx_pack.py [--cache DIR] [--quantize on|auto|off] [--allow-partial] [--out DIR]

Guard + merge (like bld_pack / harbor_pack / veh_pack): the packer MERGES into an existing
assets/logistics/manifest.json (unknown top-level fields and extra fields inside entries are kept, generated fields
win) and REFUSES (exit 1, nothing written) when a key of the current manifest or of lgx_check.REQUIRED has no
complete render in the cache.  --allow-partial packs what is cached.  An empty manifest is never written.

The logistics centre
  * layers (same frameSize + anchor): back, floor, interior, interior_racks (= interior x the rack-front mask: front
    uprights + beams drawn over the stock), interior_front (= interior x the front-furniture mask), stub, shell_cut,
    shell, props; patches: conveyor (8), dock door 1 / 2 (6 each), office lamp (4).
  * palette groups: every layer that is drawn exactly on top of another one shares its sheet (and palette):
    lgx_center_a = shell + dock door patches, lgx_center_b = interior + interior_racks + interior_front + conveyor + lamp,
    lgx_center_c = back + floor + stub + shell_cut + props.
  * depth bands are VALIDATED here against the interior's 16-bit view-depth pass: every standing point, every
    forklift path sample and every rack slot is tested against the rendered interior pixels (what is in front of it,
    what is behind it) -> band 'mid' (drawn between _interior and _interior_front: behind the counter / conveyor /
    packing table), 'front' (above _interior_front) or 'outside'; rack slots get maxStackPx (free screen height above
    the slot before the shelf above).  Conflicts are written to manifest.logistics.validation and fail lgx_check.
"""
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, carry_scale)
import veh_pack as vp    # noqa: E402  (read-only reuse: load, veh_images, dedupe, add_aliases, veh_entry)
import lgx_check as LCK  # noqa: E402  (REQUIRED key lists)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'logistics')
MAX_SHEET = 2048
BUDGET_MB = 7.0
KX, KY, KZ = 45.2548, 22.6274, 55.4256
CENTER = 'logistics_center'
LAYERS = ['back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub', 'shell_cut', 'shell', 'props']
DERIVED = {'interior_front': 'fmask', 'interior_racks': 'rmask'}     # = _interior x mask pass
LAYER_SRC = {'shell_cut': 'cut'}
SHEET_OF = {'shell': 'lgx_center_a', 'interior': 'lgx_center_b', 'interior_front': 'lgx_center_b',
            'interior_racks': 'lgx_center_b',
            'back': 'lgx_center_c', 'floor': 'lgx_center_c', 'stub': 'lgx_center_c', 'shell_cut': 'lgx_center_c',
            'props': 'lgx_center_c'}
PATCHES = {'conveyor': ('belt', 8, 'lgx_center_b', 8, -1), 'dock1': ('door1', 6, 'lgx_center_a', 8, 0),
           'dock2': ('door2', 6, 'lgx_center_a', 8, 0), 'lamp': ('lamp', 4, 'lgx_center_b', 4, -1)}
DEPTH = {'back': -0.40, 'floor': -0.35, 'interior': -0.30, 'lamp': -0.29, 'stock': -0.25, 'interior_racks': -0.22,
         'mid': -0.20,
         'interior_front': -0.10, 'conveyor': -0.09, 'front': -0.05, 'stub': -0.02, 'shell_cut': -0.015,
         'shell': 0.0, 'dock1': 0.001, 'dock2': 0.001, 'props': 0.01}
VEH_ORDER = ['forklift', 'forklift_loaded', 'pallet_jack', 'delivery_van_red', 'delivery_van_blue',
             'delivery_van_mint', 'moving_truck']
VEH_EXTRA = ['handlePoint', 'pushOffset', 'rampPoint', 'forkTipPoint', 'rearDoorPoint']
VEH_LENGTH = {'truck_cargo': 5.5, 'delivery_van': 4.4, 'moving_truck': 6.5, 'forklift': 2.5}
DOCK_GAP = {'truck_cargo': 0.35, 'delivery_van': 0.35, 'moving_truck': 1.4, 'forklift': 0.2}


def px(p):
    x, y = p[0], p[1]
    z = p[2] if len(p) > 2 else 0.0
    return [int(round((x + y) * KX)), int(round((x - y) * KY - z * KZ))]


# =================================================================================================== load

def load_center(cache):
    d = os.path.join(cache, 'center')
    mp = os.path.join(d, 'meta.json')
    if not os.path.exists(mp):
        return None
    meta = json.load(open(mp))
    need = ['back', 'floor', 'interior', 'fmask', 'rmask', 'stub', 'cut', 'shell', 'props', 'depth_interior']
    for k, (pre, n, _, _, _) in PATCHES.items():
        need += ['%s_%d' % (pre, f) for f in range(n)]
    miss = [n for n in need if not os.path.exists(os.path.join(d, n + '.png'))]
    if miss:
        print('note: logistics_center has missing passes (%s) - not packed' % ' '.join(miss[:8]))
        return None
    meta['dir'] = d
    return meta


def load_builds(cache):
    out = {}
    if not os.path.isdir(cache):
        return out
    for fn in sorted(os.listdir(cache)):
        if not fn.endswith('.json'):
            continue
        try:
            m = json.load(open(os.path.join(cache, fn)))
        except Exception:
            continue
        if 'build' in m and 'frames' in m and all(os.path.exists(os.path.join(cache, n + '.png'))
                                                  for n in m['frames']):
            out[m['build']] = m
    return out


def center_images(meta):
    d = meta['dir']

    def ld(n):
        return Image.open(os.path.join(d, n + '.png')).convert('RGBA')
    imgs = {}
    for name in LAYERS:
        if name in DERIVED:
            continue
        im = ld(LAYER_SRC.get(name, name))
        if name == 'shell':
            im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
        else:
            im = pu.clean_alpha(im, floor=3)
        imgs[name] = im
    a = np.asarray(imgs['interior']).astype(np.float32)
    for name, mask in DERIVED.items():
        m = np.asarray(ld(mask)).astype(np.float32)[..., 3] / 255.0
        m[m < 0.06] = 0.0
        f = a.copy()
        f[..., 3] *= m
        f[f[..., 3] < 2] = 0
        imgs[name] = Image.fromarray(np.clip(f + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    patches = {}
    for k, (pre, n, _, _, _) in PATCHES.items():
        patches[k] = [pu.clean_alpha(ld('%s_%d' % (pre, i)), floor=3) for i in range(n)]
    return imgs, patches


def build_images(cache, m):
    out = {}
    for n in m['frames']:
        im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
        if m.get('shadow', True) and m['kind'] != 'item':
            im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
        else:
            im = pu.clean_alpha(im, floor=3)
        out[n] = im
    return out


# =================================================================================================== validation

class Depth:
    """Interior view-depth (metres) + coverage, and the actor / stack occlusion tests."""

    def __init__(self, meta, imgs):
        d = meta['dir']
        raw = np.asarray(Image.open(os.path.join(d, 'depth_interior.png'))).astype(np.float64)
        if raw.ndim == 3:
            raw = raw[..., 0]
        mx = 65535.0 if raw.max() > 255 else 255.0
        self.valid = raw > 0
        dm = meta['depth']
        self.depth = dm['min'] + raw / mx * (dm['max'] - dm['min'])
        self.cover = np.asarray(imgs['interior'])[..., 3] > 140
        self.front = np.asarray(imgs['interior_front'])[..., 3] > 140
        self.rack = np.asarray(imgs['interior_racks'])[..., 3] > 60      # rack fronts: drawn ABOVE the stock
        self.ok = self.valid & self.cover
        self.b = np.array(meta['camBack'])
        self.ax, self.ay = meta['anchorPx']
        self.H, self.W = self.depth.shape

    def dworld(self, p):
        return 60.0 - float(np.dot(np.array(p, float), self.b))

    def actor(self, p, r=0.25, h_top=1.45, half_w=15, head_w=19):
        """Count interior pixels in front of / behind a standing chibi at ground point p."""
        sx, sy = px(p)
        sx += self.ax
        sy += self.ay
        nf = nn = bf = 0
        for row in range(int(sy - h_top * KZ - 3), int(sy + 5)):
            if row < 0 or row >= self.H:
                continue
            h = min(h_top, max(0.0, (sy - row) / KZ))
            hw = head_w if h > h_top * 0.68 else half_w
            ad = self.dworld((p[0], p[1], h)) - r
            x0, x1 = max(0, int(sx - hw)), min(self.W, int(sx + hw + 1))
            ok = self.ok[row, x0:x1]
            if not ok.any():
                continue
            infront = ok & (self.depth[row, x0:x1] < ad - 0.03)
            fr = self.front[row, x0:x1]
            nf += int((infront & fr).sum())
            nn += int((infront & ~fr).sum())
            bf += int((ok & ~infront & fr).sum())
        return nf, nn, bf

    def band(self, p, tol=6, **kw):
        nf, nn, bf = self.actor(p, **kw)
        issue = None
        if nn > tol:
            issue = 'hidden by non-front interior (%d px)' % nn
        if nf > tol and bf > tol:
            issue = (issue + '; ' if issue else '') + 'needs both bands (front furniture in front %d px and behind %d ' \
                                                      'px)' % (nf, bf)
        band = 'mid' if nf > tol else ('front' if bf > tol else 'any')
        return band, issue, (nf, nn, bf)

    def stack(self, p, half_w=26, item_r=0.22, cap=96):
        """Free screen height (px) above a stock slot before something of the interior is in front of the stack,
        + F pixels behind the stack (would be drawn over it)."""
        sx, sy = px(p)
        sx += self.ax
        sy += self.ay
        free = cap
        for k in range(0, cap):
            row = int(sy - k)
            if row < 0:
                break
            h = k / KZ
            ad = self.dworld((p[0], p[1], p[2] + h)) - item_r
            x0, x1 = max(0, int(sx - half_w)), min(self.W, int(sx + half_w + 1))
            ok = self.ok[row, x0:x1] & ~self.rack[row, x0:x1]
            if (ok & (self.depth[row, x0:x1] < ad - 0.03)).sum() > 2:
                free = k
                break
        bf = 0
        for row in range(int(sy - free), int(sy + 10)):
            if 0 <= row < self.H:
                x0, x1 = max(0, int(sx - half_w)), min(self.W, int(sx + half_w + 1))
                h = max(0.0, (sy - row) / KZ)
                ad = self.dworld((p[0], p[1], p[2] + h)) - item_r
                fr = self.front[row, x0:x1] & self.ok[row, x0:x1] & (self.depth[row, x0:x1] >= ad - 0.03)
                bf += int(fr.sum())
        return max(0, free - 2), bf


def validate(meta, dep):
    P = meta['points']
    out = {'staff': [], 'customers': [], 'forklift': [], 'slots': [], 'issues': []}
    for s in P['staff']:
        if s['role'] == 'dockhand':
            out['staff'].append(('outside', None, None))
            continue
        b, iss, c = dep.band(s['at'])
        out['staff'].append((b, iss, c))
        if iss:
            out['issues'].append('staff %s at %s: %s' % (s['role'], s['at'], iss))
    for k, c in enumerate(P['customers']):
        if c['at'][1] < -4.0:
            out['customers'].append(('outside', None, None))
            continue
        b, iss, cnt = dep.band(c['at'])
        out['customers'].append((b, iss, cnt))
        if iss:
            out['issues'].append('customer %d at %s: %s' % (k, c['at'], iss))
    # forklift: every node + samples every 0.25 m along each leg (cylinder r 0.7 m, 2.25 m tall)
    path = P['forkliftPath']
    for i, node in enumerate(path):
        a = node['at']
        b_ = path[(i + 1) % len(path)]['at']
        n = max(1, int(math.hypot(b_[0] - a[0], b_[1] - a[1]) / 0.25))
        reqs = []
        for k in range(n + 1):
            t = k / n
            p = (a[0] + (b_[0] - a[0]) * t, a[1] + (b_[1] - a[1]) * t, 0.0)
            if p[0] > 5.3:
                reqs.append(('outside', None))
                continue
            bd, iss, _ = dep.band(p, r=0.7, h_top=2.2, half_w=48, head_w=48, tol=20)
            reqs.append((bd, iss))
            if iss:
                out['issues'].append('forklift leg %d at %s: %s' % (i, tuple(round(v, 2) for v in p), iss))
        out['forklift'].append(reqs)
    for s in P['rackSlots']:
        # floor bays: pallets stand in the open - cap the stack at ~2 pallets so the forklift / staff stay visible
        free, bf = dep.stack(s['world'], cap=60 if s['rack'] == 'floor_bays' else 96)
        # rack slots: band 'stock' (above _interior, below _interior_racks); floor bays stand in the open in front
        # of the conveyor / packing table -> band 'front' (y-sorted with the front actors)
        band = 'front' if s['rack'] == 'floor_bays' else 'stock'
        out['slots'].append((free, bf, band))
        if bf > 25 and band == 'stock':
            out['issues'].append('slot %s L%d S%d: front furniture behind the stack (%d px)' % (s['rack'], s['level'],
                                                                                               s['slot'], bf))
        if free < 30:
            out['issues'].append('slot %s L%d S%d: only %d px free above' % (s['rack'], s['level'], s['slot'], free))
    return out


# =================================================================================================== manifest entries

def pick_band(reqs):
    """-> (band of the leg inside the building, crosses the outer wall?)"""
    out = any(b == 'outside' for b, _ in reqs)
    bands = set(b for b, _ in reqs if b not in ('any', 'outside'))
    if not bands:
        return ('outside' if out and all(b == 'outside' for b, _ in reqs) else 'front'), out
    if len(bands) == 1:
        return bands.pop(), out
    return 'mixed', out


def center_entries(meta, frame_atlas, val):
    W, H = meta['frameSize']
    anchor = meta['anchor']
    P = meta['points']
    D = meta['dims']
    sprites = {}
    lay = {}
    for name in LAYERS:
        key = '%s_%s' % (CENTER, name)
        lay[name] = key
        sprites[key] = {'atlas': frame_atlas[key], 'frame': key, 'anchor': anchor, 'frameSize': [W, H],
                        'kind': 'layer', 'of': CENTER, 'layer': name, 'depthOffset': DEPTH[name]}
    patch_keys = {}
    for k, (pre, n, sheet, fps, rep) in PATCHES.items():
        key = '%s_%s' % (CENTER, k)
        frames = ['%s_%s_%d' % (CENTER, k, i) for i in range(n)]
        anim_name = {'conveyor': 'conveyor', 'dock1': 'dock_door', 'dock2': 'dock_door', 'lamp': 'office_lamp'}[k]
        sprites[key] = {'atlas': frame_atlas[frames[0]], 'frame': frames[0], 'anchor': anchor, 'frameSize': [W, H],
                        'kind': 'patch', 'of': CENTER, 'layer': k, 'depthOffset': DEPTH[k],
                        'anims': {anim_name: {'frames': frames, 'fps': fps, 'repeat': rep}}}
        patch_keys[k] = key
    sprites[patch_keys['conveyor']]['notes'] = ('Conveyor belt + riding parcels, 8-frame seamless loop (one parcel spacing '
                                                'per loop). ALWAYS draw it (frame 0 when paused): the belt is not in '
                                                '_interior. Depth: right above _interior_front.')
    for k in ('dock1', 'dock2'):
        sprites[patch_keys[k]]['notes'] = ('Roll-up dock door %s: frame 0 = closed (identical to the shell), 5 = open '
                                           '(the inside seen through the opening, lit under the roof). Play forward '
                                           'to open, backward to close; same alpha as _shell (it belongs to the '
                                           'shell).' % k[-1])
    sprites[patch_keys['lamp']]['notes'] = ('Office desk lamp + desk top: 4-frame warm glow loop. Frame 0 equals '
                                            '_interior; draw right above _interior (below the clerk).')
    # ---- points (px from the anchor)
    staff_pts = [px(s['at']) for s in P['staff']]
    cust_pts = [px(c['at']) for c in P['customers']]
    slots = []
    order = sorted(range(len(P['rackSlots'])), key=lambda i: (px(P['rackSlots'][i]['world'])[1], i))
    rank = {i: r for r, i in enumerate(order)}
    for i, s in enumerate(P['rackSlots']):
        free, bf, band = val['slots'][i]
        w = s['widthM']
        if s['rack'] == 'rack_furniture':            # shelf runs along +Y, front faces +X
            span, dep = (0.0, 1.0), (1.0, 0.0)
            depth = D['frackD']
        elif s['rack'] == 'floor_bays':              # bay along X, front faces -Y
            span, dep = (1.0, 0.0), (0.0, -1.0)
            depth = 1.1
        else:                                        # back racks: shelf along +X, front faces -Y
            span, dep = (1.0, 0.0), (0.0, -1.0)
            depth = D['rackD']
        use = max(0.2, depth - 0.3)                  # usable depth (rows) inside the uprights / bay lines
        sp_ = px((span[0] * (w - 0.12), span[1] * (w - 0.12), 0.0))
        dp_ = px((dep[0] * use, dep[1] * use, 0.0))
        slots.append({'rack': s['rack'], 'category': s['category'], 'level': s['level'], 'slot': s['slot'],
                      'point': px(s['world']), 'maxStackPx': int(free), 'widthM': w, 'depthM': round(use, 2),
                      'spanPx': sp_, 'depthPx': dp_,
                      'face': s['face'], 'band': band, 'drawOrder': rank[i]})
    fpath = []
    for i, node in enumerate(P['forkliftPath']):
        lb, cross = pick_band(val['forklift'][i])
        e = {'point': px(node['at']), 'dir': node['dir'], 'legBand': lb}
        if cross:
            e['legCrossesWall'] = True
        if node.get('action'):
            e['action'] = node['action']
        if node.get('note'):
            e['note'] = node['note']
        fpath.append(e)
    docks = []
    dock_veh = {}
    for d in P['docks']:
        docks.append(px(d['door']))
    for vk, ln in VEH_LENGTH.items():
        dock_veh[vk] = [px((d['door'][0] + DOCK_GAP[vk] + ln / 2.0, d['door'][1], 0.0)) for d in P['docks']]
    rp = meta['shellHull']
    main = {
        'atlas': frame_atlas['%s_shell' % CENTER], 'frame': '%s_shell' % CENTER, 'anchor': anchor,
        'frameSize': [W, H], 'kind': 'building', 'name': {'ko': '솔방울 물류센터', 'en': 'Pinecone Logistics Centre'},
        'zone': 'logistics', 'front': '-Y', 'topPx': meta['topPx'],
        'footprintM': [D['W'], D['D']], 'footprint': [int(round((D['W'] + D['D']) * KX)),
                                                      int(round((D['W'] + D['D']) * KY))],
        'footprintPoly': meta['footprintPoly'], 'revealPoly': rp,
        'layers': lay, 'layerOrder': ['back', 'floor', 'interior', 'lamp', '<stock>', 'interior_racks',
                                      '<actors mid>', 'interior_front', 'conveyor', '<actors front + floor stock>',
                                      'stub', 'shell_cut', 'shell', 'dock1', 'dock2', 'props'],
        'patches': patch_keys,
        'reveal': {'states': {'closed': {'shell': 1.0, 'shell_cut': 0.0},
                              'half': {'shell': 0.45, 'shell_cut': 0.0},
                              'cut': {'shell': 0.0, 'shell_cut': 1.0},
                              'open': {'shell': 0.0, 'shell_cut': 0.0}},
                   'fadeMs': 350,
                   'notes': 'Tap / hover inside revealPoly -> tween shell (and the dock door patches) to alpha 0 '
                            '(optionally through shell_cut = walls at 1.6 m, roof off). Everything inside is drawn '
                            'whether or not the shell is visible (the shell simply covers it); skip the inside '
                            'layers while the shell is at alpha 1 and both dock doors are closed to save fill-rate.'},
        'dockPoints': docks, 'dockDirs': ['SE', 'SE'], 'dockNames': ['front bay', 'back bay'],
        'dockVehiclePoints': dock_veh,
        'forkliftPath': fpath,
        'rackSlots': slots,
        'rackCategories': {'materials': ['pallet_planks', 'pallet_logs', 'pallet_ingots', 'pallet_boxes'],
                           'food': ['item_crate_food', 'item_crate_bread', 'item_crate_produce', 'item_crate_cans'],
                           'goods': ['cardboard_box_s', 'cardboard_box_m', 'cardboard_box_l', 'item_crate_cans'],
                           'furniture': ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'],
                           'tools': ['item_toolbox', 'cardboard_box_s'],
                           'appliances': ['item_fridge', 'item_stove_iron', 'item_washer', 'item_radio',
                                          'item_tv_retro']},
        'staffPoints': staff_pts, 'staffDirs': [s['dir'] for s in P['staff']],
        'staffRoles': [s['role'] for s in P['staff']], 'staffBands': [b for b, _, _ in val['staff']],
        'customerPoints': cust_pts, 'customerDirs': [c['dir'] for c in P['customers']],
        'customerBands': [b for b, _, _ in val['customers']],
        'doorPoint': px(P['doorPoint']), 'doorDir': 'NE', 'insidePoint': px(P['inside']), 'inPoint': px(P['inPoint']),
        'conveyor': {'start': px(P['conveyor']['start']), 'end': px(P['conveyor']['end']), 'axis': 'x'},
        'fxPoints': {'board': px(P['fx_board']), 'emblem': px(P['fx_emblem']), 'lamp': px(P['lampPoint']),
                     'vents': [px(v) for v in P['fx_vents']], 'dockLights': [px(v) for v in P['fx_dockLights']]},
        'boardSizePx': [int(round(P['boardSizeM'][0] * KX)), int(round(P['boardSizeM'][1] * KZ))],
        'nameBoard': {'point': px(P['fx_board']), 'widthPx': int(round(P['boardSizeM'][0] * KX)),
                      'heightPx': int(round(P['boardSizeM'][1] * KZ)), 'shearY': 0.5,
                      'text': {'ko': '솔방울 물류센터', 'en': 'Pinecone Logistics'}, 'color': '#2B4F7E',
                      'note': 'blank cream name board on the -Y facade (part of _shell): the game writes the name '
                              'here, centred on point, fitted into widthPx x heightPx and sheared y += 0.5 * x '
                              '(the facade runs along screen (2, 1)); fade it with the shell.'},
        'notes': ('Logistics centre (11 x 8 m) rendered as aligned cutaway layers that share this frame + anchor: '
                  'draw the layers in layerOrder at depth = building depth + depthOffset. Closed look = _shell '
                  '(this entry\'s own frame). Inside: blue + orange pallet racks with category signs (food fish, '
                  'goods can, tools hammer, appliances fridge on the back wall; furniture chair on the left wall), '
                  'a green belt conveyor with a feeder hood and a labeller arch, a packing table, the office corner '
                  '(desk, abacus, cabinet, safe, heater with a sleeping cat) behind a green settlement counter '
                  '(ledger, stamp, bell, coins), materials floor bays, two dock levellers.'),
    }
    sprites[CENTER] = main
    return sprites


def item_entry(k, m, frame_atlas, img):
    e = {'atlas': frame_atlas[m['frames'][0]], 'frame': m['frames'][0], 'anchor': m['anchor'],
         'frameSize': m['frameSize'], 'kind': 'item', 'icon': True,
         'stackStep': m.get('stackStep'), 'thicknessM': m.get('thicknessM'), 'carryScale': pp.carry_scale(img),
         'category': m.get('category'), 'notes': m.get('notes', '')}
    tp = m.get('topPx')
    e['topPx'] = tp.get(m['frames'][0]) if isinstance(tp, dict) else tp
    return e


def producer_entry(k, m, frame_atlas):
    first = m['frames'][0]
    e = {'atlas': frame_atlas[first], 'frame': first, 'anchor': m['anchor'], 'frameSize': m['frameSize'],
         'kind': m['kind'], 'footprint': m.get('footprint'), 'footprintM': m.get('footprintM'), 'front': '-Y',
         'notes': m.get('notes', ''), 'name': m.get('name'), 'chain': m.get('chain')}
    tp = m.get('topPx')
    e['topPx'] = tp.get(first) if isinstance(tp, dict) else tp
    a, b = m['footprintM']
    e['footprintPoly'] = [px((-a / 2, -b / 2)), px((a / 2, -b / 2)), px((a / 2, b / 2)), px((-a / 2, b / 2))]
    if 'fxPoints' in m:
        e['fxPoints'] = m['fxPoints']
    fp = m.get('framePoints', {}).get(first, {})
    fd = m.get('frameDirs', {}).get(first, {})
    if fp.get('in'):
        e['inPoint'] = fp['in'][0]
    if fp.get('out'):
        e['outPoint'] = fp['out'][0]
    if fp.get('staff'):
        e['staffPoints'] = fp['staff']
        e['staffDirs'] = fd.get('staff')
        e['staffDepth'] = 'front'
    ws = dict(m.get('workSpot') or {})
    if fp.get('work'):
        ws['point'] = fp['work'][0]
        ws['dir'] = (fd.get('work') or [ws.get('dir')])[0]
    e['workSpot'] = ws
    if m.get('anims'):
        e['anims'] = {'work': dict(m['anims']['work'])}
    return e


def vehicle_entry(k, m, atlas_key, over_key):
    e = vp.veh_entry(k, m, atlas_key, over_key)
    e['kind'] = 'vehicle'
    e['era'] = 3
    for f in VEH_EXTRA:
        if f in m:
            e[f] = m[f]
    if k.startswith('forklift'):
        e['anims']['lift']['liftPx'] = [-int(round(v * KZ)) for v in (0.0, 0.25, 0.5, 0.75, 1.0, 1.25)]
        if 'cargoPoint' in e:
            cp = e['cargoPoint']
            e['cargoPoint'] = {'SE': [cp['SE'][0], cp['SE'][1], False], 'NE': [cp['NE'][0], cp['NE'][1], True]}
        e['notes'] = e['notes'] + (' cargoPoint behind=true for NE (the forks point away from the camera: draw the '
                                   'load before the forklift).')
    return e


CONVENTIONS = {
    'ppu': 64,
    'cutaway': ('logistics_center_* layers share frameSize + anchor with logistics_center (place them all at the '
                'building anchor). Depth of a layer = building depth + its depthOffset (layerOrder). Inside actors '
                '(staff, customers inside, forklift / pallet jack inside) are drawn in one of two bands: "mid" = '
                'between _interior (+ stock) and _interior_front (they stand BEHIND the counter / conveyor / packing '
                'table, which hide their legs), "front" = above _interior_front. Sort actors inside a band by their '
                'own y. Bands are validated against the rendered depth (staffBands / customerBands / '
                'forkliftPath[].legBand; legCrossesWall = the leg leaves / enters through a dock door: outside the '
                'wall use the outside rule). Stock: draw the item sprites of a rack slot at slot.point (bottom of '
                'the stack), stacked by stackStep (scaled with the item, e.g. 0.85), never higher than maxStackPx, '
                'in drawOrder. A slot holds lanes x rows of stacks: lane offsets = point + spanPx * t (t in '
                '-0.5..0.5, across the slot width), row offsets = point + depthPx * u (u -0.5 = back row, +0.5 = '
                'front row; draw back rows first, lanes by screen y). Stock level -> number of stacks + stack '
                'heights (empty slot = bare shelf, full = every lane x row stacked to maxStackPx). slot.band "stock" = between _interior and _interior_racks (the rack front uprights and '
                'beams are drawn OVER the goods, so they sit inside the racks; empty slot = bare shelf); slot.band '
                '"front" (the materials floor bays) = y-sorted with the front actors. _stub (front walls at 0.45 m) '
                'and _props (apron '
                'props) are always drawn; _shell (+ dock door patches) fades for the reveal; _shell_cut is the '
                'optional walls-at-1.6 m state.'),
    'outsideActors': ('Characters / vehicles outside the building: normal y-sort, but the building is big - an '
                      'actor is in front of it when its anchor is below the two front edges of footprintPoly '
                      '(left->bottom, bottom->right).'),
    'items': '72 x 72 frames, anchor (36, 54) = bottom centre; stackStep px between stacked copies; carryScale for '
             'hand-carried stacks; also usable as UI icons.',
    'producers': 'prop / station conventions (baked shadow, anchor = footprint centre, front -Y). anims.work loops '
                 '4 frames. workSpot.point/dir = where the operator stands (in front of the machine, draw him above '
                 'the station sprite); inPoint / outPoint = input / output pads.',
    'vehicles': ('characters{} entries with kind "vehicle" in the assets/vehicles conventions: dirs SE (world +X) and '
                 'NE (world +Y), SW <- SE and NW <- NE with flipX, frame names {anim}_{dir}_{i}, no baked shadow '
                 '(draw shadow[dir]), seats + overlay frames for drivers, px points per dir (negate dx when '
                 'mirrored).'),
    'docks': ('dockPoints = the ground point in the middle of each dock door; dockVehiclePoints[family][bay] = where '
              'the vehicle ANCHOR goes when it is backed up to that bay (facing SE = away from the door).'),
}


# =================================================================================================== pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def pack_sheet(name, frames, padding=2):
    sheet, atlas = pu.pack_atlas(frames, max_width=MAX_SHEET, trim=True, padding=padding)
    if sheet.height > MAX_SHEET:
        raise SystemExit('lgx_pack: sheet %s would be %dx%d (> %d)' % (name, sheet.width, sheet.height, MAX_SHEET))
    return sheet, atlas


def guard(cache, have, need, allow_partial):
    have = set(have)
    if not have:
        raise SystemExit('lgx_pack: ABORT - no complete renders in the cache %s; nothing was written. Run '
                         'lgx_render.py first. / 렌더 캐시가 비어 있습니다.' % cache)
    missing = sorted(set(need) - have)
    if missing and not allow_partial:
        raise SystemExit('lgx_pack: ABORT - %d key(s) are missing from the render cache %s; packing now would DELETE '
                         'them. Nothing was written.\n    %s\n  fix: /tmp/bvenv/bin/python tools/blender/lgx_render.py '
                         '-- <keys>  (or --allow-partial) / 캐시에 없는 키가 있어 중단합니다.'
                         % (len(missing), cache, ' '.join(missing)))
    if missing:
        print('lgx_pack: WARNING --allow-partial: dropping %s' % ' '.join(missing))
    return missing


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'logistics')
    mode, partial, out_dir = 'on', False, OUT
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--cache', '--quantize', '--out'):
            v = argv[i + 1]
            i += 1
            if a == '--cache':
                cache = v
            elif a == '--quantize':
                mode = v
            else:
                out_dir = v
        elif a == '--allow-partial':
            partial = True
        i += 1
    meta = load_center(cache)
    builds = load_builds(cache)
    vehicles, _ = vp.load(os.path.join(cache, 'veh'))
    have = list(builds) + list(vehicles) + ([CENTER] if meta else [])
    old = None
    mpath = os.path.join(out_dir, 'manifest.json')
    if os.path.exists(mpath):
        old = json.load(open(mpath, encoding='utf-8'))
    need = set(LCK.REQUIRED_ALL)
    if old:
        need |= set(k for k in old.get('sprites', {}) if not k.startswith(CENTER + '_'))
        need |= set(old.get('characters', {}))
    need = [k for k in need if k in set(LCK.REQUIRED_ALL) or k in (old or {}).get('characters', {}) or
            k in (old or {}).get('sprites', {})]
    guard(cache, have, need, partial)
    sheets = []
    frame_atlas = {}
    entries_sprites = {}
    validation = None
    # ---------------------------------------------------------------- centre
    if meta:
        imgs, patches = center_images(meta)
        groups = {}
        for name in LAYERS:
            groups.setdefault(SHEET_OF[name], []).append(('%s_%s' % (CENTER, name), imgs[name]))
        for k, (pre, n, sheet, _, _) in PATCHES.items():
            for f, im in enumerate(patches[k]):
                groups[sheet].append(('%s_%s_%d' % (CENTER, k, f), im))
        for g in sorted(groups):
            sheets.append((g,) + pack_sheet(g, groups[g]))
        dep = Depth(meta, imgs)
        validation = validate(meta, dep)
    # ---------------------------------------------------------------- items + producers
    item_imgs, prod_frames = {}, []
    item_frames = []
    for k in LCK.ITEMS + LCK.PRODUCERS:
        if k not in builds:
            continue
        ims = build_images(cache, builds[k])
        if builds[k]['kind'] == 'item':
            item_imgs[k] = ims[builds[k]['frames'][0]]
            item_frames += list(ims.items())
        else:
            prod_frames += list(ims.items())
    if item_frames:
        sheets.append(('lgx_items',) + pack_sheet('lgx_items', item_frames))
    if prod_frames:
        sheets.append(('lgx_producers',) + pack_sheet('lgx_producers', prod_frames))
    # ---------------------------------------------------------------- vehicles
    veh_atlas = {}
    for k in [v for v in VEH_ORDER if v in vehicles]:
        base, over = vp.veh_images(os.path.join(cache, 'veh'), k, vehicles[k])
        items = list(base.items())
        ov_items, alias = vp.dedupe(list(over.items()))
        akey = 'lgx_' + k
        sheet, atlas = pu.pack_atlas(items + ov_items, max_width=MAX_SHEET, trim=True, padding=2)
        if sheet.height <= MAX_SHEET:
            vp.add_aliases(atlas, alias)
            sheets.append((akey, sheet, atlas))
            veh_atlas[k] = (akey, akey if over else None)
        else:
            s1, a1 = pack_sheet(akey, items)
            sheets.append((akey, s1, a1))
            s2, a2 = pack_sheet(akey + '_over', ov_items)
            vp.add_aliases(a2, alias)
            sheets.append((akey + '_over', s2, a2))
            veh_atlas[k] = (akey, akey + '_over')
    # ---------------------------------------------------------------- write
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.startswith('lgx_') and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(out_dir, fn))
    total = 0
    for akey, sheet, atlas in sheets:
        png = os.path.join(out_dir, akey + '.png')
        jsn = os.path.join(out_dir, akey + '.json')
        pu.save_atlas(sheet, atlas, png, jsn, quantize=False)
        total += os.path.getsize(png) + os.path.getsize(jsn)
    rgba_total = total
    if mode == 'on' or (mode == 'auto' and total / 1048576.0 > BUDGET_MB * 0.85):
        total = 0
        for akey, sheet, atlas in sheets:
            png = os.path.join(out_dir, akey + '.png')
            quantize(sheet).save(png, optimize=True)
            total += os.path.getsize(png) + os.path.getsize(os.path.join(out_dir, akey + '.json'))
        print('palettised with libimagequant (256 colours, dither 0.6): %.2f MB -> %.2f MB'
              % (rgba_total / 1048576.0, total / 1048576.0))
    for akey, sheet, atlas in sheets:
        for n in atlas['frames']:
            frame_atlas[n] = akey
        print('%-26s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     os.path.getsize(os.path.join(out_dir, akey + '.png')) / 1024.0))
    if meta:
        entries_sprites.update(center_entries(meta, frame_atlas, validation))
    for k in LCK.ITEMS:
        if k in builds:
            entries_sprites[k] = item_entry(k, builds[k], frame_atlas, item_imgs[k])
    for k in LCK.PRODUCERS:
        if k in builds:
            entries_sprites[k] = producer_entry(k, builds[k], frame_atlas)
    chars = {}
    for k in [v for v in VEH_ORDER if v in vehicles]:
        chars[k] = vehicle_entry(k, vehicles[k], veh_atlas[k][0], veh_atlas[k][1])
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/lgx_render.py + lgx_pack.py (docs/CONTRACT_V8.md section AA)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'logistics/%s.png' % a, 'json': 'logistics/%s.json' % a} for a, _, _ in sheets]
    oldsp, oldch = (old or {}).get('sprites', {}), (old or {}).get('characters', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in entries_sprites.items()}
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    fam = {}
    for k, m in vehicles.items():
        if m.get('variant') and m['family'] != k:
            fam.setdefault(m['family'], []).append(k)
    man['vehicleFamilies'] = {f: sorted(v) for f, v in sorted(fam.items())}
    if validation is not None:
        man['logistics'] = {'validation': {'issues': validation['issues'],
                                           'staff': [list(c) if c else None for _, _, c in validation['staff']],
                                           'customers': [list(c) if c else None for _, _, c in
                                                         validation['customers']],
                                           'note': 'counts = (front-furniture px in front, other interior px in '
                                                   'front, front-furniture px behind) of a standing chibi'}}
    if not man['sprites'] and not man['characters']:
        raise SystemExit('lgx_pack: refusing to write an empty manifest')
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    print('wrote %s: %d sprites, %d vehicles, %d atlases, payload %.2f MB' % (
        mpath, len(man['sprites']), len(man['characters']), len(sheets), total / 1048576.0))
    if validation and validation['issues']:
        print('VALIDATION ISSUES:')
        for s in validation['issues']:
            print('  - ' + s)


if __name__ == '__main__':
    main()
