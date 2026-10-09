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
  * layers (same frameSize + anchor): apron (outside ground, always drawn), shadow_open (the open building's ground
    shadow, fades in as the shell fades out), back, floor, interior, interior_racks (= interior x the rack-front mask:
    front uprights + beams drawn over the stock), interior_front (= interior x the front-furniture mask), stub,
    shell_cut, shell, props (wall bumpers), nameplate_ko / nameplate_en (baked name lettering, fades with the shell);
    patches: conveyor (8), dock door 1 / 2 (6 each, the roll-up leaf only), office lamp (4).
  * outdoor props: every free-standing prop (bollards, dock lamps, loading sign, bench, bin, empty pallets, snow
    piles) is its own small sprite with a GROUND anchor (logistics_center_prop_<kind>), placed at
    outdoorProps[].point and y-sorted like town props / outside actors.
  * palette groups: every layer that is drawn exactly on top of another one shares its sheet (and palette):
    lgx_center_a = shell + nameplates + dock door patches, lgx_center_b = interior + interior_racks + interior_front +
    conveyor + lamp, lgx_center_c = back + floor + stub + shell_cut + props, lgx_center_d = apron + shadow_open +
    outdoor props.
  * depth bands are VALIDATED here against the interior's 16-bit view-depth pass: every standing point, every
    forklift path sample and every rack slot is tested against the rendered interior pixels (what is in front of it,
    what is behind it) -> band 'mid' (drawn between _interior and _interior_front: behind the counter / conveyor /
    packing table), 'front' (above _interior_front) or 'outside'; rack slots get maxStackPx (free screen height above
    the slot before the shelf above).  Conflicts are written to manifest.logistics.validation and fail lgx_check.
  * (polish) KEEP-CLEAR: the forklift body (2.5 x 1.16 m) on every leg (facing legDir) and at every node (arrival /
    action / departure facings, + 0.4 m load overhang at action nodes) must not touch any staff / customer / door
    point (person radius 0.25 m) -> validation issue.
  * (polish) STOCK: each rack slot gets cells (small items 2 lanes x 2 rows, big items 1 x 1, floor bays 1 x 1), the
    free height of every cell (back rows are measured where they are - the deck above hides them earlier) and itemFit
    {item key: max stack count} at the category stockScale; a category's scale drops below 0.85 only if one of its
    items would otherwise fit no slot.
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
TOP_STACK_PX = 46                 # max pile height on a top shelf (no shelf above it)
KX, KY, KZ = 45.2548, 22.6274, 55.4256
CENTER = 'logistics_center'
NAME_TEXT = {'ko': '솔방울 물류센터', 'en': 'Pinecone Logistics'}
LAYERS = ['apron', 'shadow_open', 'back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub', 'shell_cut',
          'shell', 'props', 'nameplate_ko', 'nameplate_en']
DERIVED = {'interior_front': 'fmask', 'interior_racks': 'rmask'}     # = _interior x mask pass
LAYER_SRC = {'shell_cut': 'cut', 'nameplate_ko': 'name_ko', 'nameplate_en': 'name_en'}
SHEET_OF = {'shell': 'lgx_center_a', 'nameplate_ko': 'lgx_center_a', 'nameplate_en': 'lgx_center_a',
            'interior': 'lgx_center_b', 'interior_front': 'lgx_center_b', 'interior_racks': 'lgx_center_b',
            'back': 'lgx_center_c', 'floor': 'lgx_center_c', 'stub': 'lgx_center_c', 'shell_cut': 'lgx_center_c',
            'props': 'lgx_center_c', 'apron': 'lgx_center_d', 'shadow_open': 'lgx_center_d'}
PROP_SHEET = 'lgx_center_d'
DOOR_DIM = 140                    # max alpha of the shell's roof shadow seen through an open dock door
SHADOW_LAYERS = ('shell', 'shadow_open')          # baked ground shadow -> cool tint + soft frame edge
PATCHES = {'conveyor': ('belt', 8, 'lgx_center_b', 8, -1), 'dock1': ('door1', 6, 'lgx_center_a', 8, 0),
           'dock2': ('door2', 6, 'lgx_center_a', 8, 0), 'lamp': ('lamp', 4, 'lgx_center_b', 4, -1)}
DEPTH = {'apron': -0.45, 'shadow_open': -0.44, 'back': -0.40, 'floor': -0.35, 'interior': -0.30, 'lamp': -0.29,
         'stock': -0.25, 'interior_racks': -0.22, 'mid': -0.20,
         'interior_front': -0.10, 'conveyor': -0.09, 'front': -0.05, 'stub': -0.02, 'shell_cut': -0.015,
         'shell': 0.0, 'nameplate_ko': 0.0005, 'nameplate_en': 0.0005, 'dock1': 0.001, 'dock2': 0.001,
         'props': 0.01}
VEH_ORDER = ['forklift', 'forklift_loaded', 'pallet_jack', 'delivery_van_red', 'delivery_van_blue',
             'delivery_van_mint', 'moving_truck']
VEH_EXTRA = ['handlePoint', 'pushOffset', 'rampPoint', 'forkTipPoint', 'rearDoorPoint']
VEH_LENGTH = {'truck_cargo': 5.5, 'delivery_van': 4.4, 'moving_truck': 6.5, 'forklift': 2.5}
DOCK_GAP = {'truck_cargo': 0.35, 'delivery_van': 0.35, 'moving_truck': 1.4, 'forklift': 0.2}
# forklift body for the keep-clear test (lgx_vehicles.b_forklift: 2.5 m incl. forks, 1.16 m wide; anchor ~ centre)
FK_FRONT, FK_REAR, FK_HALF_W, FK_LOAD = 1.36, 1.2, 0.58, 0.4
PERSON_R = 0.25                   # a chibi's footprint radius
HEAD = {'SE': (1.0, 0.0), 'NE': (0.0, 1.0), 'NW': (-1.0, 0.0), 'SW': (0.0, -1.0)}
STOCK_SCALE = 0.85
SMALL_W = 44                      # trimmed item width (px at 1x) up to which an item is 'small' (2 x 2 per slot)
CELLS = {'small': [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]], 'big': [[0.0, 0.0]]}
BAY_CELLS = {'small': [[0.0, 0.0]], 'big': [[0.0, 0.0]]}
MAX_PER_STACK = 4
CELL_HALF_W = {'small': 16, 'big': 26}
RACK_CATEGORIES = {'materials': ['pallet_planks', 'pallet_logs', 'pallet_ingots', 'pallet_ore', 'pallet_boxes'],
                   'food': ['item_crate_food', 'item_crate_bread', 'item_crate_produce', 'item_crate_smoked',
                            'item_crate_cans'],
                   'goods': ['item_crate_jam', 'item_cloth_rolls', 'cardboard_box_s', 'cardboard_box_m',
                             'cardboard_box_l', 'item_crate_cans'],
                   'furniture': ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'],
                   'tools': ['item_toolbox', 'item_crate_tools', 'cardboard_box_s'],
                   'appliances': ['item_fridge', 'item_stove_iron', 'item_washer', 'item_radio', 'item_tv_retro']}


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
    need = ['apron', 'shadow_open', 'back', 'floor', 'interior', 'fmask', 'rmask', 'stub', 'cut', 'shell', 'props',
            'name_ko', 'name_en', 'depth_interior']
    for k, (pre, n, _, _, _) in PATCHES.items():
        need += ['%s_%d' % (pre, f) for f in range(n)]
    need += [op['render'] for op in meta.get('oprops', []) if op.get('render')]
    if not meta.get('oprops'):
        need.append('oprop_*')
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
        if name in SHADOW_LAYERS:
            im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
        else:
            im = pu.clean_alpha(im, floor=3)
        imgs[name] = im
    # the shell has open holes at the dock doors: the roof's shadow on the catcher inside them darkens the real inside
    # layers seen through an open door - keep that "dim inside" at <= 55 % so goods / forklift still read
    sh = np.asarray(imgs['shell']).copy()
    for (x0, y0, x1, y1) in meta.get('patches', {}).get('doors', []):
        x0, y0, x1, y1 = max(0, int(x0)), max(0, int(y0)), int(math.ceil(x1)), int(math.ceil(y1))
        reg = sh[y0:y1, x0:x1]
        semi = reg[..., 3] < 250
        reg[..., 3] = np.where(semi, np.minimum(reg[..., 3], DOOR_DIM), reg[..., 3])
    imgs['shell'] = Image.fromarray(sh, 'RGBA')
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
    # outdoor props: crop each kind's border render to its box -> own sprite, anchor = the prop's ground point
    W, H = meta['frameSize']
    props = {}
    for op in meta.get('oprops', []):
        if not op.get('render'):
            continue
        x0, y0, x1, y1 = op['box']
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        crop = ld(op['render']).crop((x0, y0, x1, y1))
        crop = pp.border_fade(pp.tint_shadow(pu.clean_alpha(crop, floor=10)), width=8)
        gx, gy = op['groundPx']
        props[op['kind']] = (crop, (gx - x0, gy - y0))
    return imgs, patches, props


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
        ia = np.asarray(imgs['interior'])[..., 3].astype(np.float32)
        fa = np.asarray(imgs['interior_front'])[..., 3].astype(np.float32)
        self.cover = ia > 140
        # front furniture: _interior_front = _interior x fmask, so judge the mask ratio (anti-aliased rims of the
        # counter / conveyor / table keep only part of the interior alpha and must still count as front)
        self.front = (fa > 140) | ((fa > 60) & (fa >= 0.5 * ia))
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

    @staticmethod
    def _run(m):
        best = cur = 0
        for v in m:
            cur = cur + 1 if v else 0
            best = max(best, cur)
        return best

    def stack(self, p, half_w=26, item_r=0.22, cap=96, rod=10):
        """Free screen height (px) above a stock slot before something of the interior is in front of the stack,
        + F pixels behind the stack (would be drawn over it).
        Thin rods (the zig-zag bracing of the rack end frames: < `rod` px per row) do not stop a stack - the goods
        simply cover them; a solid occluder (the shelf above, a sign) stops it where its contiguous run begins."""
        sx, sy = px(p)
        sx += self.ax
        sy += self.ay
        free = cap
        runs = []
        for k in range(0, cap):
            row = int(sy - k)
            if row < 0:
                break
            h = k / KZ
            ad = self.dworld((p[0], p[1], p[2] + h)) - item_r
            x0, x1 = max(0, int(sx - half_w)), min(self.W, int(sx + half_w + 1))
            ok = self.ok[row, x0:x1] & ~self.rack[row, x0:x1]
            runs.append(self._run(ok & (self.depth[row, x0:x1] < ad - 0.03)))
            if runs[-1] >= rod:
                k0 = k
                while k0 > 0 and runs[k0 - 1] > 0:      # back to where this occluder starts
                    k0 -= 1
                free = k0
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


def slot_geom(s, D):
    """-> (span unit vector, lane span length, row unit vector (back -> front), usable depth) of a rack slot (world)."""
    w = s['widthM']
    if s['rack'] == 'rack_furniture':            # shelf runs along +Y, front faces +X
        span, dep, depth = (0.0, 1.0), (1.0, 0.0), D['frackD']
    elif s['rack'] == 'floor_bays':              # bay along X, front faces -Y
        span, dep, depth = (1.0, 0.0), (0.0, -1.0), 1.1
    else:                                        # back racks: shelf along +X, front faces -Y
        span, dep, depth = (1.0, 0.0), (0.0, -1.0), D['rackD']
    return span, w - 0.12, dep, max(0.2, depth - 0.3)


def slot_cells(s):
    return BAY_CELLS if s['rack'] == 'floor_bays' else CELLS


def cell_world(s, D, t, u):
    span, ln, dep, use = slot_geom(s, D)
    x, y, z = s['world']
    return (x + span[0] * ln * t + dep[0] * use * u, y + span[1] * ln * t + dep[1] * use * u, z)


def body_hits(c, h, p, front, rear=FK_REAR, half_w=FK_HALF_W, r=PERSON_R):
    """Does a person circle (p, r) touch the forklift body (anchor c, heading unit h, [-rear, front] x +-half_w)?"""
    dx, dy = p[0] - c[0], p[1] - c[1]
    a = dx * h[0] + dy * h[1]
    b = -dx * h[1] + dy * h[0]
    ca, cb = min(max(a, -rear), front), min(max(b, -half_w), half_w)
    return math.hypot(a - ca, b - cb) < r


def keep_clear(P):
    """Forklift body vs every person point: on every leg (sampled every 0.1 m, facing legDir) and at every node in the
    arrival / action / departure facings (+ the load overhang at action nodes)."""
    people = [('staff %d (%s)' % (k, s['role']), s['at']) for k, s in enumerate(P['staff'])]
    people += [('customer %d' % k, c['at']) for k, c in enumerate(P['customers'])]
    people += [('doorPoint', P['doorPoint']), ('insidePoint', P['inside'])]
    path = P['forkliftPath']
    n = len(path)
    issues, seen = [], set()
    for i, node in enumerate(path):
        prev, nxt = path[(i - 1) % n], path[(i + 1) % n]
        a, b = node['at'], nxt['at']
        poses = [(a, prev['legDir'], FK_FRONT), (a, node['dir'], FK_FRONT + (FK_LOAD if node.get('action') else 0.0)),
                 (a, node['legDir'], FK_FRONT)]
        ln = math.hypot(b[0] - a[0], b[1] - a[1])
        steps = max(1, int(ln / 0.1))
        for k in range(steps + 1):
            t = k / steps
            poses.append(((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), node['legDir'], FK_FRONT))
        for c, d, front in poses:
            for name, p in people:
                if (name, i) not in seen and body_hits(c, HEAD[d], p, front):
                    seen.add((name, i))
                    issues.append('keep-clear: %s at %s is inside the forklift (node %d %s / leg %d->%d, facing %s)'
                                  % (name, tuple(p[:2]), i, node.get('action') or 'pass', i, (i + 1) % n, d))
    return issues


def validate(meta, dep):
    P = meta['points']
    D = meta['dims']
    out = {'staff': [], 'customers': [], 'forklift': [], 'slots': [], 'issues': []}
    for s in P['staff']:
        if s['role'] == 'dockhand':
            out['staff'].append(('outside', None, None))
            continue
        b, iss, c = dep.band(s['at'])
        out['staff'].append(('mid' if b == 'any' else b, iss, c))      # 'any' (nothing in front / behind) -> mid
        if iss:
            out['issues'].append('staff %s at %s: %s' % (s['role'], s['at'], iss))
    for k, c in enumerate(P['customers']):
        if c['at'][1] < -4.0:
            out['customers'].append(('outside', None, None))
            continue
        b, iss, cnt = dep.band(c['at'])
        out['customers'].append(('front' if b == 'any' else b, iss, cnt))
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
    out['issues'] += keep_clear(P)
    # stock: free height of every CELL (back rows measured where they stand: the deck above hides them earlier), the
    # smallest per rack level and size class (the slot next to an end frame sees the bracing rods first); top shelves
    # (nothing above) are capped at TOP_STACK_PX so the piles stay tidy under the category sign; floor bays (pallets
    # in the open) are capped at ~2 pallets so the forklift / staff stay visible
    meas = []
    for s in P['rackSlots']:
        cap = 60 if s['rack'] == 'floor_bays' else 96
        fr = {}
        for cls, cells in slot_cells(s).items():
            # measured over the item's own width (a small item at stock scale is ~37 px wide, a big one ~52 px): a
            # wider window would see the end frame's bracing beside the stack instead of in front of it
            fr[cls] = min(dep.stack(cell_world(s, D, t, u), cap=cap, half_w=CELL_HALF_W[cls])[0] for t, u in cells)
        _, bf = dep.stack(s['world'], cap=cap)
        meas.append((fr, bf))
    lvl = {}
    for s, (fr, _) in zip(P['rackSlots'], meas):
        if s['rack'] != 'floor_bays':
            for cls, v in fr.items():
                k = (s['rack'], s['level'], cls)
                lvl[k] = min(lvl.get(k, 999), v)
    for s, (fr, bf) in zip(P['rackSlots'], meas):
        free = dict(fr)
        if s['rack'] != 'floor_bays':
            for cls in free:
                free[cls] = lvl[(s['rack'], s['level'], cls)]
                if s.get('upper') is None:
                    free[cls] = min(free[cls], TOP_STACK_PX)
        band = 'front' if s['rack'] == 'floor_bays' else 'stock'
        out['slots'].append((free, bf, band))
        if bf > 25 and band == 'stock':
            out['issues'].append('slot %s L%d S%d: front furniture behind the stack (%d px)' % (s['rack'], s['level'],
                                                                                               s['slot'], bf))
        if free['big'] < 30:
            out['issues'].append('slot %s L%d S%d: only %d px free above' % (s['rack'], s['level'], s['slot'],
                                                                             free['big']))
    return out


def stock_plan(C_slots, item_info):
    """-> ({category: stockScale}, [itemFit per slot], [problems]).  item_info = {key: (topPx, stackStep, sizeClass)}.
    A category keeps STOCK_SCALE unless one of its items would fit no slot of the category; then its scale steps down
    (0.05) to at most 0.7."""
    scales, fits, problems = {}, [None] * len(C_slots), []

    def fit_of(s, cat, sc):
        f = {}
        for k in RACK_CATEGORIES[cat]:
            if k not in item_info:
                continue
            top, step, cls = item_info[k]
            free = s['free'][cls]
            h1, st = top * sc, max(4.0, step * sc)
            if h1 <= free + 0.5:
                f[k] = int(min(MAX_PER_STACK, 1 + (free - h1) // st))
        return f
    for cat in RACK_CATEGORIES:
        idx = [i for i, s in enumerate(C_slots) if s['category'] == cat]
        chosen = None
        for sc in (STOCK_SCALE, 0.8, 0.75, 0.7):
            fs = [fit_of(C_slots[i], cat, sc) for i in idx]
            ok = all(any(k in f for f in fs) for k in RACK_CATEGORIES[cat] if k in item_info)
            chosen = (sc, fs)
            if ok:
                break
        sc, fs = chosen
        scales[cat] = sc
        for i, f in zip(idx, fs):
            fits[i] = f
        for k in RACK_CATEGORIES[cat]:
            if k in item_info and not any(k in f for f in fs):
                problems.append('%s (%s) fits no %s slot even at scale %.2f' % (k, cat, cat, sc))
    return scales, fits, problems


# =================================================================================================== manifest entries

def simplify_poly(poly, eps=2.5):
    """Ramer-Douglas-Peucker on a closed polygon (drops duplicate / collinear hull points)."""
    pts = []
    for q in poly:
        if not pts or (abs(q[0] - pts[-1][0]) + abs(q[1] - pts[-1][1])) > 0:
            pts.append(list(q))
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts.pop()

    def rdp(seg):
        if len(seg) < 3:
            return seg
        (ax, ay), (bx, by) = seg[0], seg[-1]
        L = math.hypot(bx - ax, by - ay) or 1e-9
        dmax, idx = 0.0, 0
        for i in range(1, len(seg) - 1):
            d = abs((bx - ax) * (ay - seg[i][1]) - (ax - seg[i][0]) * (by - ay)) / L
            if d > dmax:
                dmax, idx = d, i
        if dmax <= eps:
            return [seg[0], seg[-1]]
        return rdp(seg[:idx + 1])[:-1] + rdp(seg[idx:])
    # split the ring at its two farthest-apart points so both halves are open polylines
    i0 = min(range(len(pts)), key=lambda i: (pts[i][0], pts[i][1]))
    i1 = max(range(len(pts)), key=lambda i: (pts[i][0], pts[i][1]))
    a, b = sorted((i0, i1))
    h1 = rdp(pts[a:b + 1])
    h2 = rdp(pts[b:] + pts[:a + 1])
    return h1[:-1] + h2[:-1]


def pick_band(reqs):
    """-> (band of the leg inside the building, crosses the outer wall?)"""
    out = any(b == 'outside' for b, _ in reqs)
    bands = set(b for b, _ in reqs if b not in ('any', 'outside'))
    if not bands:
        return ('outside' if out and all(b == 'outside' for b, _ in reqs) else 'front'), out
    if len(bands) == 1:
        return bands.pop(), out
    return 'mixed', out


def front_test(poly):
    """outsideActors rule as two numbers: a point (x, y) (px from the anchor) is IN FRONT of the building when
    y - x / 2 > a (below the extended front-left edge = world y < -Y0) or y + x / 2 > b (below the extended front-right
    edge = world x > X0)."""
    (lx, ly), (bx, by), (rx, ry) = poly[0], poly[1], poly[2]
    return {'a': round(ly - lx / 2.0, 1), 'b': round(ry + rx / 2.0, 1)}


def center_entries(meta, frame_atlas, val, item_info, props):
    W, H = meta['frameSize']
    anchor = meta['anchor']
    ax, ay = meta['anchorPx']
    P = meta['points']
    D = meta['dims']
    sprites = {}
    lay = {}
    for name in LAYERS:
        key = '%s_%s' % (CENTER, name)
        lay[name] = key
        sprites[key] = {'atlas': frame_atlas[key], 'frame': key, 'anchor': anchor, 'frameSize': [W, H],
                        'kind': 'layer', 'of': CENTER, 'layer': name, 'depthOffset': DEPTH[name]}
    sprites[lay['apron']]['notes'] = ('Outside ground of the centre (dock apron with bay lines + hazard edges, entrance '
                                      'landing + doormat, the receiving pad = inPoint). ALWAYS drawn (also while the '
                                      'inside layers are skipped), under everything else of the building.')
    sprites[lay['shadow_open']]['notes'] = ('Ground shadow of the OPEN building (back walls, stub walls, racks) on the '
                                            'ground outside the footprint. alpha = 1 - shell alpha (it fades in as '
                                            '_shell, which carries the closed building\'s shadow, fades out).')
    sprites[lay['props']]['notes'] = ('Wall-mounted dock bumpers (always drawn). Free-standing outdoor props are their '
                                      'own y-sorted sprites: see logistics_center.outdoorProps.')
    for lang in ('ko', 'en'):
        sprites[lay['nameplate_' + lang]].update({'lang': lang, 'notes': (
            'Baked name lettering "%s" on the facade board (raised navy letters, lit like the shell). Draw ONE '
            'nameplate (by language) right above _shell with the shell\'s alpha; for a custom name skip it and use '
            'logistics_center.nameBoard.' % NAME_TEXT[lang])})
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
        sprites[patch_keys[k]]['notes'] = ('Roll-up dock door %s = the door LEAF only (the shell has open holes there): '
                                           'frame 0 = closed, 5 = rolled up under the lintel. ALWAYS draw it (frame 0 '
                                           'when closed) with the shell\'s alpha; play forward to open, backward to '
                                           'close. With the door open the real inside (floor, racks, stock, forklift) '
                                           'shows through, darkened by the roof shadow baked into _shell.' % k[-1])
    sprites[patch_keys['lamp']]['notes'] = ('Office desk lamp + desk top: 4-frame warm glow loop. Frame 0 equals '
                                            '_interior; draw right above _interior (below the clerk).')
    # ---- outdoor props: own sprites (ground anchor) + placements
    prop_keys = {}
    for kind, (img, (gx, gy)) in props.items():
        key = '%s_prop_%s' % (CENTER, kind)
        prop_keys[kind] = key
        w, h = img.size
        sprites[key] = {'atlas': frame_atlas[key], 'frame': key, 'anchor': [round(gx / w, 5), round(gy / h, 5)],
                        'frameSize': [w, h], 'kind': 'prop', 'of': CENTER, 'shadow': 'baked',
                        'notes': 'Outdoor prop of the logistics centre (%s), anchor = its ground point; placed by '
                                 'logistics_center.outdoorProps and y-sorted like town props.' % kind}
    oprops = []
    for op in meta.get('oprops', []):
        gx, gy = op['groundPx']
        oprops.append({'sprite': prop_keys[op['kind']], 'name': op['name'],
                       'point': [int(round(gx - ax)), int(round(gy - ay))]})
    # ---- points (px from the anchor)
    staff_pts = [px(s['at']) for s in P['staff']]
    cust_pts = [px(c['at']) for c in P['customers']]
    slots = []
    order = sorted(range(len(P['rackSlots'])), key=lambda i: (px(P['rackSlots'][i]['world'])[1], i))
    rank = {i: r for r, i in enumerate(order)}
    for i, s in enumerate(P['rackSlots']):
        free, bf, band = val['slots'][i]
        span, ln, dep, use = slot_geom(s, D)
        sp_ = px((span[0] * ln, span[1] * ln, 0.0))
        dp_ = px((dep[0] * use, dep[1] * use, 0.0))
        slots.append({'rack': s['rack'], 'category': s['category'], 'level': s['level'], 'slot': s['slot'],
                      'point': px(s['world']), 'maxStackPx': int(free['big']),
                      'maxStackPxBy': {c: int(v) for c, v in free.items()}, 'widthM': s['widthM'],
                      'depthM': round(use, 2), 'spanPx': sp_, 'depthPx': dp_, 'cells': slot_cells(s),
                      'face': s['face'], 'band': band, 'drawOrder': rank[i], 'free': free})
    scales, fits, problems = stock_plan(slots, item_info)
    for sl, f in zip(slots, fits):
        sl['itemFit'] = f
        del sl['free']
    val['issues'] += ['stock: ' + p_ for p_ in problems]
    fpath = []
    for i, node in enumerate(P['forkliftPath']):
        lb, cross = pick_band(val['forklift'][i])
        e = {'point': px(node['at']), 'dir': node['dir'], 'legDir': node['legDir'], 'legBand': lb}
        if node.get('reverse'):
            e['reverse'] = True
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
    rp = simplify_poly(meta['shellHull'])
    fpoly = meta['footprintPoly']
    if abs(sum(q[0] for q in fpoly)) > 20 * 4 or abs(sum(q[1] for q in fpoly)) > 20 * 4:     # old cache: frame px
        fpoly = [[q[0] - ax, q[1] - ay] for q in fpoly]
    cv = P['conveyor']
    main = {
        'atlas': frame_atlas['%s_shell' % CENTER], 'frame': '%s_shell' % CENTER, 'anchor': anchor,
        'frameSize': [W, H], 'kind': 'building', 'name': {'ko': '솔방울 물류센터', 'en': 'Pinecone Logistics Centre'},
        'zone': 'logistics', 'front': '-Y', 'topPx': meta['topPx'],
        'footprintM': [D['W'], D['D']], 'footprint': [int(round((D['W'] + D['D']) * KX)),
                                                      int(round((D['W'] + D['D']) * KY))],
        'footprintPoly': fpoly, 'frontTest': front_test(fpoly), 'revealPoly': rp,
        'layers': lay, 'layerOrder': ['apron', 'shadow_open', 'back', 'floor', 'interior', 'lamp', '<stock>',
                                      'interior_racks', '<actors mid>', 'interior_front', 'conveyor',
                                      '<actors front + floor stock>', 'stub', 'shell_cut', 'shell', 'nameplate_<lang>',
                                      'dock1', 'dock2', 'props'],
        'alwaysDrawn': ['apron', 'props', 'dock1', 'dock2', 'nameplate_<lang>', 'outdoorProps'],
        'insideLayers': ['back', 'floor', 'interior', 'lamp', 'interior_racks', 'interior_front', 'conveyor', 'stub',
                         '<stock + inside actors>'],
        # depth offsets of the three placeholder bands (the layers + patches carry their own depthOffset): stock
        # stacks, 'mid' actors (behind the counter / conveyor / packing table), 'front' actors + floor-bay pallets;
        # inside one band sort by screen y (y * 1e-6 added to the band offset keeps them inside the band)
        'bandDepth': {'stock': DEPTH['stock'], 'mid': DEPTH['mid'], 'front': DEPTH['front']},
        'patches': patch_keys,
        'nameplates': {'ko': lay['nameplate_ko'], 'en': lay['nameplate_en']},
        'outdoorProps': oprops,
        'reveal': {'states': {'closed': {'shell': 1.0, 'shell_cut': 0.0, 'shadow_open': 0.0},
                              'half': {'shell': 0.45, 'shell_cut': 0.0, 'shadow_open': 0.55},
                              'cut': {'shell': 0.0, 'shell_cut': 1.0, 'shadow_open': 1.0},
                              'open': {'shell': 0.0, 'shell_cut': 0.0, 'shadow_open': 1.0}},
                   'withShell': ['dock1', 'dock2', 'nameplate_<lang>'],
                   'fadeMs': 350,
                   'notes': 'Tap / hover inside revealPoly -> tween _shell together with the dock door patches and the '
                            'nameplate to alpha 0 and _shadow_open to 1 (optionally through _shell_cut = walls at '
                            '1.6 m, roof off); a second tap / pointer-out reverses it. While the shell is at alpha 1 and '
                            'both dock doors are at frame 0 the insideLayers (and the stock + inside actors) are fully '
                            'covered and may be skipped to save fill-rate; alwaysDrawn layers / props must stay.'},
        'dockPoints': docks, 'dockDirs': ['SE', 'SE'],
        'dockNames': ['dock 1 - van bay (front, screen lower)', 'dock 2 - truck bay (back, screen upper)'],
        'dockRoles': [d.get('role') for d in P['docks']],
        'dockVehiclePoints': dock_veh,
        'forkliftPath': fpath,
        'rackSlots': slots,
        'rackCategories': {c: [k for k in v if k in item_info] for c, v in RACK_CATEGORIES.items()},
        'stockScale': scales,
        'staffPoints': staff_pts, 'staffDirs': [s['dir'] for s in P['staff']],
        'staffRoles': [s['role'] for s in P['staff']], 'staffBands': [b for b, _, _ in val['staff']],
        'customerPoints': cust_pts, 'customerDirs': [c['dir'] for c in P['customers']],
        'customerBands': [b for b, _, _ in val['customers']],
        'doorPoint': px(P['doorPoint']), 'doorDir': 'NE', 'insidePoint': px(P['inside']), 'inPoint': px(P['inPoint']),
        'conveyor': {'start': px(cv['start']), 'end': px(cv['end']), 'axis': 'x', 'heightM': cv.get('heightM', 0.85),
                     'startGround': px((cv['start'][0], cv['start'][1], 0.0)),
                     'endGround': px((cv['end'][0], cv['end'][1], 0.0)),
                     'note': 'start / end = on the belt surface (heightM above the floor) - where parcels ride; '
                             'startGround / endGround = the floor points under them'},
        'fxPoints': {'board': px(P['fx_board']), 'emblem': px(P['fx_emblem']), 'lamp': px(P['lampPoint']),
                     'vents': [px(v) for v in P['fx_vents']], 'dockLights': [px(v) for v in P['fx_dockLights']]},
        'boardSizePx': [int(round(P['boardSizeM'][0] * KX)), int(round(P['boardSizeM'][1] * KZ))],
        'nameBoard': {'point': px(P['fx_board']), 'widthPx': int(round(P['boardSizeM'][0] * KX)),
                      'heightPx': int(round(P['boardSizeM'][1] * KZ)), 'shearY': 0.5,
                      'text': {'ko': NAME_TEXT['ko'], 'en': NAME_TEXT['en']}, 'color': '#2B4F7E',
                      'note': 'The default name ships baked (nameplates.ko / .en). Only for a CUSTOM name: skip the '
                              'nameplate and write the text centred on point, fitted into widthPx x heightPx and '
                              'sheared y += 0.5 * x (the facade runs along screen (2, 1)); fade it with the shell.'},
        'notes': ('Logistics centre (11 x 8 m) rendered as aligned cutaway layers that share this frame + anchor: '
                  'draw the layers in layerOrder at depth = building depth + depthOffset. Closed look = _apron + '
                  '_shell (this entry\'s own frame) + nameplate + dock door leaves + _props + outdoorProps. Inside: '
                  'blue + orange pallet racks with category signs (food fish, goods can, tools hammer on the back '
                  'wall, a lower 2-level heavy rack for appliances (fridge sign); furniture chair rack on the left '
                  'wall), a green belt conveyor with a feeder hood and a labeller arch, a packing table, the office '
                  'corner (desk, abacus, cabinet, safe, heater with a sleeping cat) behind a green settlement counter '
                  '(ledger, stamp, bell, coins), materials floor bays, two dock levellers.'),
    }
    sprites[CENTER] = main
    return sprites


def size_class(img):
    bb = img.getbbox() or (0, 0, 72, 72)
    return 'small' if (bb[2] - bb[0]) <= SMALL_W else 'big'


def item_info_of(k, m, img):
    tp = m.get('topPx')
    tp = tp.get(m['frames'][0]) if isinstance(tp, dict) else tp
    return (tp or 40, m.get('stackStep') or 12, size_class(img))


def item_entry(k, m, frame_atlas, img):
    e = {'atlas': frame_atlas[m['frames'][0]], 'frame': m['frames'][0], 'anchor': m['anchor'],
         'frameSize': m['frameSize'], 'kind': 'item', 'icon': True,
         'stackStep': m.get('stackStep'), 'thicknessM': m.get('thicknessM'), 'carryScale': pp.carry_scale(img),
         'category': m.get('category'), 'sizeClass': size_class(img), 'notes': m.get('notes', '')}
    tp = m.get('topPx')
    e['topPx'] = tp.get(m['frames'][0]) if isinstance(tp, dict) else tp
    if k == 'item_toolbox':
        e['notes'] += (' NOTE: assets/buildings ships the same key item_toolbox (same builder, same look); whichever '
                       'fragment wins the merge, the picture is the same.')
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
        if 'smoke' in m['fxPoints']:
            e['smokeFx'] = {'sprite': 'fx_smoke', 'at': 'fxPoints.smoke', 'whileWorking': True,
                            'note': 'chimney smoke is NOT baked: spawn the soft fx_smoke puffs (assets/fx) at '
                                    'fxPoints.smoke while the station works, like House / TownBuilding chimneys'}
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
    if k == 'moving_truck':
        e['unloadDirs'] = ['NE', 'NW']
        e['notes'] = e['notes'] + (' unloadDirs: the rear roll door + ramp only read when the truck faces NE / NW '
                                   '(rear toward the camera); in SE / SW they face away - turn the truck before '
                                   'playing unload.')
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
                'building anchor). Depth of a layer = building depth + its depthOffset (layerOrder). ALWAYS drawn: '
                '_apron (outside ground), the dock door patches (frame 0 = closed leaf), one nameplate, _props (wall '
                'bumpers) and the outdoorProps sprites. _shell (+ dock door patches + nameplate) fades for the reveal '
                'while _shadow_open fades in (alpha = 1 - shell alpha); _shell_cut is the optional walls-at-1.6 m '
                'state; _stub (front walls at 0.45 m) is drawn whenever the inside is drawn. Inside actors (staff, '
                'customers inside, forklift / pallet jack inside) are drawn in one of two bands: "mid" = between '
                '_interior (+ stock + _interior_racks) and _interior_front (they stand BEHIND the counter / conveyor / '
                'packing table, which hide their legs), "front" = above _interior_front; "outside" = an actor outside '
                'the walls (outsideActors rule). Sort actors inside a band by their own y (bandDepth + y * 1e-6). '
                'Bands are validated against the rendered depth (staffBands / customerBands / forkliftPath[].legBand).'),
    'stock': ('A rack slot holds stacks of the item sprites of its category, drawn at stockScale[category] in '
              'drawOrder, band "stock" = between _interior and _interior_racks (the rack front uprights + beams are '
              'drawn OVER the goods so they sit inside the racks; empty slot = bare shelf), band "front" (the '
              'materials floor bays) = y-sorted with the front actors. Pick an item from slot.itemFit (key -> max '
              'stack count that fits at that scale; items missing from itemFit do not fit that slot), its sizeClass '
              '(item entry) picks slot.cells[sizeClass]: [t, u] per stack, position = point + spanPx * t + depthPx * '
              'u (u < 0 = back row: draw back rows first, then by screen y). Stack copies by stackStep * scale. Stock '
              'level 0..1 -> how many of cells x itemFit[key] copies are drawn (0 = bare shelf, 1 = every cell at '
              'itemFit). maxStackPxBy[sizeClass] = the free px height those cells have.'),
    'outsideActors': ('Characters / vehicles / outdoorProps outside the building: normal y-sort (depth = y). The '
                      'building is big, so an actor is IN FRONT of it when, with (x, y) = its point minus the '
                      'building anchor, y - x / 2 > frontTest.a or y + x / 2 > frontTest.b (below one of the two '
                      'extended front edges of footprintPoly = world y < -4 m or x > 5.5 m); give such an actor at '
                      'least building depth + 0.02 (+ y * 1e-6 to keep their order). Everything else around the '
                      'building is behind it.'),
    'outdoorProps': ('logistics_center.outdoorProps = [{sprite, name, point}]: put the sprite (its anchor = the '
                     'prop\'s ground point, baked soft shadow) at building anchor + point and y-sort it like a town '
                     'prop. They are placed so that a vehicle at dockVehiclePoints never has one beside its camera-'
                     'side flank (plain anchor y-sort stays correct).'),
    'items': '72 x 72 frames, anchor (36, 54) = bottom centre; stackStep px between stacked copies; carryScale for '
             'hand-carried stacks; sizeClass small / big (rack slot cells); also usable as UI icons.',
    'producers': 'prop / station conventions (baked shadow, anchor = footprint centre, front -Y). anims.work loops '
                 '4 frames. workSpot.point/dir = where the operator stands (screen-left of the machine, in profile '
                 'facing E: draw him above the station sprite); inPoint / outPoint = input / output pads; chimney '
                 'smoke = smokeFx (game FX at fxPoints.smoke, not baked).',
    'vehicles': ('characters{} entries with kind "vehicle" in the assets/vehicles conventions: dirs SE (world +X) and '
                 'NE (world +Y), SW <- SE and NW <- NE with flipX, frame names {anim}_{dir}_{i}, no baked shadow '
                 '(draw shadow[dir]), seats + overlay frames for drivers, px points per dir (negate dx when '
                 'mirrored).'),
    'forkliftPath': ('Loop of nodes. node.dir = the way the forklift faces while it does node.action there (pick / '
                     'drop: play anims.lift forward then backward); the leg to the next node is driven facing '
                     'node.legDir, backwards when node.reverse; legBand = its inside band. Dock nodes stand on the '
                     'leveller inside the door: only the forks reach into a docked vehicle\'s bed, so the forklift '
                     'never leaves the building (no band switch).'),
    'docks': ('dockPoints = the ground point in the middle of each dock door; dockRoles / dockNames: dock 1 = van bay, '
              'dock 2 = truck bay (any family may use either); dockVehiclePoints[family][bay] = where the vehicle '
              'ANCHOR goes when it is backed up to that bay (facing SE = away from the door).'),
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
    props = {}
    if meta:
        imgs, patches, props = center_images(meta)
        groups = {}
        for name in LAYERS:
            groups.setdefault(SHEET_OF[name], []).append(('%s_%s' % (CENTER, name), imgs[name]))
        for k, (pre, n, sheet, _, _) in PATCHES.items():
            for f, im in enumerate(patches[k]):
                groups[sheet].append(('%s_%s_%d' % (CENTER, k, f), im))
        for kind, (im, _) in sorted(props.items()):
            groups.setdefault(PROP_SHEET, []).append(('%s_prop_%s' % (CENTER, kind), im))
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
    item_info = {k: item_info_of(k, builds[k], item_imgs[k]) for k in item_imgs}
    if meta:
        entries_sprites.update(center_entries(meta, frame_atlas, validation, item_info, props))
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
