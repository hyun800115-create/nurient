"""
gb_pack.py - turn the raw 금방 renders (gb_render.py cache) into assets/geumbang/: two trimmed Phaser atlases
(256-colour palettes) + manifest.json (docs/CONTRACT_GEUMBANG.md section AO).

No Blender needed: python3 with numpy + Pillow (+ imagequant).
    python3 tools/blender/gb_pack.py [--cache DIR] [--out DIR] [--quantize on|off] [--allow-partial]
Default cache: $GB_CACHE or <tmp>/fv_cache/geumbang.

Pages
  gb_van_0 (<= 2048 x 1024)   gb_van: idle 2 + move 4 per dir (cropped back to delivery_van_red's 284 x 252 frame) +
                              over_* overlays; door 3 / unload 4 PATCHES (the full render on the grown canvas with every
                              pixel outside the changed rectangle cleared, so the trimmed frame is only the door; the
                              frame keeps the grown canvas as sourceSize + its own anchor, so it lands on idle_<dir>_0);
                              gb_van_turn S / E / N + over_turn_*; gb_roofsign_{ko|en}_{0|1}
  gb_bld_0 (<= 1024 x 1024)   hub layers (nameplates, banner), props (sign, flag, lockers + open patches), items,
                              pennant
Post: vehicles, roof signs and the pennant get the characters' 1 px ink outline (char_pack.ink_outline); props get the
village shadow post (clean_alpha + cool tint + border fade) and are cropped to the contract frame maxima around their
anchor (the long baked shadow fades out at the frame edge); hub layers / items as rendered (clean alpha).
Guard: refuses (nothing written) when a required render is missing, unless --allow-partial.  Deterministic.
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
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade)
import char_pack as cp   # noqa: E402  (read-only reuse: ink_outline)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'geumbang')
LGX = os.path.join(ASSETS, 'logistics', 'manifest.json')
VEH = os.path.join(ASSETS, 'vehicles', 'manifest.json')
BRAND = {'gold': '#F2B33D', 'goldDark': '#D9962A', 'cream': '#F4EDE0', 'charcoal': '#3B3F52', 'navy': '#2B4F7E'}
VAN_PAGE_MAX = (2048, 1024)
BLD_PAGE_MAX = (1024, 1024)
VAN_DIRS = ['SE', 'NE']
TURN_DIRS = ['S', 'E', 'N']
PROP_MAX = {'gb_sign': (128, 288), 'gb_flag': (128, 224), 'gb_locker_a': (208, 224), 'gb_locker_b': (208, 224)}
POINT_FIELDS = ['cargoPoint', 'doorPoints', 'exhaustPoint', 'lightPoints', 'tailPoints', 'rearDoorPoint', 'seats',
                'seatDirs', 'seatsStand', 'seatDrawOrder', 'seatNames', 'driverSeat', 'footprintPoly', 'shadow',
                'wheels', 'lengthM', 'widthM', 'heightM', 'topPx', 'headTop', 'mirror', 'axisDirs', 'dirs',
                'frameSize', 'anchor']
PATCH_THR = 18              # channel difference that counts as a changed pixel (render noise stays below)
PATCH_PAD = 3
SQ5 = math.sqrt(45.2548 ** 2 + 22.6274 ** 2)
TEXT_KEYS = ['gb_roofsign_ko_0', 'gb_roofsign_ko_1', 'gb_roofsign_en_0', 'gb_roofsign_en_1', 'gb_nameplate_ko',
             'gb_nameplate_en', 'seori_nameplate_ko', 'seori_nameplate_en', 'gb_banner_ko']


def rgba(p):
    return Image.open(p).convert('RGBA')


def arr(im):
    return np.asarray(im).astype(np.int16)


# =================================================================================================== packer

def _maxrects(sizes, W, H, pad):
    """MaxRects (best short side fit) of (w, h) boxes (+pad) into W x H; returns [(x, y)] or None."""
    free = [(0, 0, W + pad, H + pad)]
    out = [None] * len(sizes)
    order = sorted(range(len(sizes)), key=lambda i: (-max(sizes[i]), -sizes[i][0] * sizes[i][1]))
    for i in order:
        w, h = sizes[i][0] + pad, sizes[i][1] + pad
        best = None
        for (fx, fy, fw, fh) in free:
            if w <= fw and h <= fh:
                sc = (min(fw - w, fh - h), max(fw - w, fh - h), fy, fx)
                if best is None or sc < best[0]:
                    best = (sc, fx, fy)
        if best is None:
            return None
        _, x, y = best
        out[i] = (x, y)
        nf = []
        for (fx, fy, fw, fh) in free:
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                nf.append((fx, fy, fw, fh))
                continue
            if x > fx:
                nf.append((fx, fy, x - fx, fh))
            if x + w < fx + fw:
                nf.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy:
                nf.append((fx, fy, fw, y - fy))
            if y + h < fy + fh:
                nf.append((fx, y + h, fw, fy + fh - y - h))
        # prune rectangles contained in another
        nf = [r for k, r in enumerate(nf) if not any(
            k != j and r[0] >= q[0] and r[1] >= q[1] and r[0] + r[2] <= q[0] + q[2] and r[1] + r[3] <= q[1] + q[3]
            and (r != q or j < k) for j, q in enumerate(nf))]
        free = nf
    return out


def pack_tight(frames, max_size, padding=2):
    """(polish) A tighter drop-in for pack_utils.pack_atlas: MaxRects into the smallest W x H (multiples of 4, within
    max_size) found by a sweep of page widths.  Same atlas JSON (trimmed frames, sourceSize, spriteSourceSize)."""
    items = []
    for name, im in frames:
        im = im.convert('RGBA')
        box = pu._trim_box(im)
        items.append((name, im.size, box, im.crop(box)))
    sizes = [it[3].size for it in items]
    area = sum(w * h for w, h in sizes)
    best = None
    wmin = max(w for w, h in sizes)
    for W in range((wmin + 3) // 4 * 4, max_size[0] + 1, 16):
        lo = max(max(h for w, h in sizes), int(area / W))
        hi = max_size[1]
        if _maxrects(sizes, W, hi, padding) is None:
            continue
        while lo < hi:                                    # smallest height that still fits at this width
            mid = (lo + hi) // 2
            if _maxrects(sizes, W, mid, padding) is None:
                lo = mid + 1
            else:
                hi = mid
        H = (lo + 3) // 4 * 4
        pl = _maxrects(sizes, W, H, padding)
        if pl is None:
            continue
        used_w = max(x + w for (x, y), (w, h) in zip(pl, sizes))
        used_h = max(y + h for (x, y), (w, h) in zip(pl, sizes))
        Wf, Hf = (used_w + 3) // 4 * 4, (used_h + 3) // 4 * 4
        if best is None or Wf * Hf < best[0] * best[1]:
            best = (Wf, Hf, pl)
    if best is None:
        raise ValueError('pack_tight: %d frames do not fit %s' % (len(items), max_size))
    Wf, Hf, pl = best
    sheet = Image.new('RGBA', (Wf, Hf), (0, 0, 0, 0))
    af = {}
    for (name, (sw, sh), box, crop), (x, y) in zip(items, pl):
        sheet.paste(crop, (x, y))
        af[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != (sw, sh),
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': sw, 'h': sh}}
    atlas = {'frames': af, 'meta': {'app': 'frost-village/tools/blender/gb_pack.py (maxrects)', 'version': '1.0',
                                    'image': '', 'format': 'RGBA8888', 'size': {'w': Wf, 'h': Hf}, 'scale': '1'}}
    return sheet, atlas


# =================================================================================================== van

PATCH_DEPTH = 0.0005        # (polish H2) patch depth above the body: under the riders (+0.001) and over_* (+0.004)
PATCH_ORDER = ['shadow', 'body (idle_<dir>_0)', 'patch (+patchDepth)', 'riders (+0.001..)', 'overlay (+0.004)',
               'roof sign (+0.02)']
PATCH_STRONG = 24           # (polish H2) a real change (door / leaf / parcels), not render noise or lamp spill
RIDER_BOX = (-16, -46, 16, 8)   # px around a seat point that a seated / standing rider doll covers


def rider_zone(pd, W, H, ox, oy):
    """Boolean mask (grown canvas) of the rider boxes at seats + seatsStand of one dir."""
    z = np.zeros((H, W), bool)
    for f in ('seats', 'seatsStand'):
        for q in pd.get(f, []):
            x0, y0 = int(ox + q[0] + RIDER_BOX[0]), int(oy + q[1] + RIDER_BOX[1])
            x1, y1 = int(ox + q[0] + RIDER_BOX[2]), int(oy + q[1] + RIDER_BOX[3])
            z[max(0, y0):max(0, y1), max(0, x0):max(0, x1)] = True
    return z


def changed_mask(a, b, thr=PATCH_THR):
    """Pixels whose colour (premultiplied) or alpha differ by more than thr."""
    pa = a[..., :3] * a[..., 3:4] / 255.0
    pb = b[..., :3] * b[..., 3:4] / 255.0
    d = np.maximum(np.abs(pa - pb).max(-1), np.abs(a[..., 3] - b[..., 3]))
    m = d > thr
    # drop isolated noise pixels (need >= 2 changed neighbours)
    k = np.zeros_like(m, dtype=np.int16)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy or dx:
                k += np.roll(np.roll(m, dy, 0), dx, 1)
    return m & (k >= 2)


def _dilate(m, n):
    m = m.copy()
    for _ in range(n):
        d2 = m.copy()
        d2[1:, :] |= m[:-1, :]
        d2[:-1, :] |= m[1:, :]
        d2[:, 1:] |= m[:, :-1]
        d2[:, :-1] |= m[:, 1:]
        m = d2
    return m


def patch_pixels(cur, base, rect, strong_thr=None, region_px=4, collar=2, exclude=None):
    """The pixels a patch keeps inside rect: every changed pixel + an opaque collar around them.  Unchanged
    pixels are cleared, so semi-transparent edges / soft shadows are never composited twice over the base frame.
    (polish H2) strong_thr: only changes NEAR a real change count - a pixel is kept when it differs by > 3 and lies
    within region_px of a pixel that differs by > strong_thr (render noise / the faint light change of the cargo lamp
    in the empty cab are dropped); exclude: a mask of pixels (e.g. the cab / rider zone) where only strong changes
    may be kept."""
    x0, y0, x1, y1 = rect
    c = cur[y0:y1, x0:x1]
    b = base[y0:y1, x0:x1]
    diff = np.abs(c - b).max(-1)
    ch = diff > 3
    if strong_thr is not None:
        strong = changed_mask(c, b, thr=strong_thr)
        ch &= _dilate(strong, region_px)
        if exclude is not None:
            ch &= ~exclude[y0:y1, x0:x1] | strong
    dil = _dilate(ch, collar)
    keep = ch | (dil & (c[..., 3] == 255) & (b[..., 3] == 255))
    if strong_thr is not None and exclude is not None:
        keep &= ~exclude[y0:y1, x0:x1] | strong          # not even a collar pixel in the cab / rider zone
    out = np.zeros(cur.shape, np.uint8)
    sub = np.zeros(c.shape, np.uint8)
    sub[keep] = c[keep]
    out[y0:y1, x0:x1] = sub
    return out


def van(cache, report):
    vd = os.path.join(cache, 'gb_van')
    meta = json.load(open(os.path.join(vd, 'meta.json')))
    W, H = meta['frameSize']
    ax, ay = meta['anchorPx']
    E = meta['expand']
    WE, HE = meta['canvas']
    frames, overs = [], []
    full = {}
    for anim in ('idle', 'move', 'door', 'unload'):
        for d in VAN_DIRS:
            for i in range(meta['anims'][anim]['frames']):
                n = '%s_%s_%d' % (anim, d, i)
                full[n] = cp.ink_outline(rgba(os.path.join(vd, n + '.png')))
    # base frames: crop back to the red van's frame
    for anim in ('idle', 'move'):
        for d in VAN_DIRS:
            for i in range(meta['anims'][anim]['frames']):
                n = '%s_%s_%d' % (anim, d, i)
                im = full[n]
                spill = np.asarray(im)[..., 3].copy()
                spill[E:E + H, E:E + W] = 0
                if spill.max() > 8:
                    report['errors'].append('gb_van %s has pixels outside the red van frame' % n)
                frames.append((n, im.crop((E, E, E + W, E + H))))
                pa = np.asarray(rgba(os.path.join(vd, 'pall_%s.png' % n)))[..., 3].astype(np.float32)
                pv = np.asarray(rgba(os.path.join(vd, 'pvis_%s.png' % n)))[..., 3].astype(np.float32)
                mask = np.clip((pa - pv) / 255.0, 0, 1)
                mask[mask < 0.04] = 0.0
                a = np.asarray(im).astype(np.float32)
                a[..., 3] *= mask
                a[a[..., 3] < 2] = 0
                overs.append(('over_' + n, Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')
                              .crop((E, E, E + W, E + H))))
    # patches over idle_<dir>_0 (grown canvas)
    patches = {}
    pts = meta['points']
    for anim in ('door', 'unload'):
        for d in VAN_DIRS:
            base = arr(full['idle_%s_0' % d])
            # (polish H2) the cab / rider zone of this dir: the over_idle alpha + the rider boxes at seats and
            # seatsStand (grown canvas px)
            zone = rider_zone(pts[d], WE, HE, ax + E, ay + E)
            ov = np.asarray(rgba(os.path.join(vd, 'pall_idle_%s_0.png' % d)))[..., 3] > 8
            zone |= ov
            for i in range(meta['anims'][anim]['frames']):
                n = '%s_%s_%d' % (anim, d, i)
                cur = arr(full[n])
                # door: the whole changed rectangle (it sits under the riders and its own over_door_* overlay);
                # unload: only pixels near a real change, nothing in the cab / rider zone (H2)
                strong = anim == 'unload'
                m = changed_mask(cur, base, thr=PATCH_STRONG if strong else PATCH_THR)
                ys, xs = np.nonzero(m)
                if len(xs) == 0:
                    report['errors'].append('gb_van %s: no change vs idle_%s_0' % (n, d))
                    continue
                g = PATCH_PAD + (4 if strong else 0)
                x0, x1 = max(0, xs.min() - g), min(WE, xs.max() + 1 + g)
                y0, y1 = max(0, ys.min() - g), min(HE, ys.max() + 1 + g)
                if strong:
                    out = patch_pixels(cur, base, (x0, y0, x1, y1), strong_thr=PATCH_STRONG, region_px=4, collar=1,
                                       exclude=zone)
                else:
                    out = patch_pixels(cur, base, (x0, y0, x1, y1))
                # pixels the patch cannot reproduce: opaque in idle_0, see-through in the patch (drawn OVER idle_0)
                erase = int(((base[y0:y1, x0:x1, 3] > 160) & (cur[y0:y1, x0:x1, 3] < 60)).sum())
                outside = m.copy()
                outside[y0:y1, x0:x1] = False
                total_diff = changed_mask(cur, base, thr=6)
                total_diff[y0:y1, x0:x1] = False
                opaque = max(1, int((base[..., 3] > 0).sum()))
                edge = bool(out[0, :, 3].any() or out[-1, :, 3].any() or out[:, 0, 3].any() or out[:, -1, 3].any())
                kept = out[..., 3] > 0
                patches[n] = {'rect': [int(x0 - E - ax), int(y0 - E - ay), int(x1 - x0), int(y1 - y0)],
                              'erasePx': erase, 'diffOutsidePct': round(100.0 * total_diff.sum() / opaque, 3),
                              'touchesCanvasEdge': edge, 'px': int(kept.sum()),
                              'zonePx': int((kept & zone).sum()),
                              'zoneWeakPx': int((kept & zone & ~changed_mask(cur, base, thr=PATCH_STRONG)).sum())}
                frames.append((n, Image.fromarray(out, 'RGBA')))
                # (polish H2) the patch's own overlay: what of the van is in front of a rider in this pose (the
                # open driver door / its pillar in front of seat 1, a rear leaf in front of a standing rider);
                # drawn INSTEAD of over_idle_<dir>_0 while the patch shows, on the patch's grown canvas
                pa = np.asarray(rgba(os.path.join(vd, 'pall_%s.png' % n)))[..., 3].astype(np.float32)
                pv = np.asarray(rgba(os.path.join(vd, 'pvis_%s.png' % n)))[..., 3].astype(np.float32)
                mask = np.clip((pa - pv) / 255.0, 0, 1)
                mask[mask < 0.04] = 0.0
                a = np.asarray(full[n]).astype(np.float32)
                a[..., 3] *= mask
                a[a[..., 3] < 2] = 0
                overs.append(('over_' + n, Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')))
    # turn frames
    tm = meta['turn']
    TW, TH = tm['frameSize']
    for d in TURN_DIRS:
        n = 'turn_%s_0' % d
        im = cp.ink_outline(rgba(os.path.join(vd, n + '.png')))
        frames.append((n, im))
        pa = np.asarray(rgba(os.path.join(vd, 'pall_%s.png' % n)))[..., 3].astype(np.float32)
        pv = np.asarray(rgba(os.path.join(vd, 'pvis_%s.png' % n)))[..., 3].astype(np.float32)
        mask = np.clip((pa - pv) / 255.0, 0, 1)
        mask[mask < 0.04] = 0.0
        a = np.asarray(im).astype(np.float32)
        a[..., 3] *= mask
        a[a[..., 3] < 2] = 0
        overs.append(('over_' + n, Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')))
    # roof signs
    rmeta = json.load(open(os.path.join(cache, 'roofsign', 'meta.json')))
    for n in rmeta['frames']:
        frames.append((n, cp.ink_outline(rgba(os.path.join(cache, 'roofsign', n + '.png')))))
    import veh_pack as vp
    ov_items, alias = vp.dedupe(overs)
    return meta, rmeta, frames, ov_items, alias, patches


# =================================================================================================== builds

def crop_around_anchor(im, anchor, maxwh):
    """Crop a prop render to at most maxwh around its anchor: keep the object, let the baked shadow fade out."""
    W, H = im.size
    ax, ay = anchor
    a = np.asarray(im)[..., 3]
    solid = a > 200
    ys, xs = np.nonzero(solid)
    if len(xs) == 0:
        return im, anchor
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    mw, mh = maxwh
    # horizontal: object first, shadow (to the right / below) with what is left
    x0 = max(0, bx0 - 4)
    x1 = min(W, max(bx1 + 4, x0 + mw))
    x1 = min(x1, x0 + mw)
    y0 = max(0, by0 - 4)
    y1 = min(H, y0 + mh)
    return im.crop((x0, y0, x1, y1)), (ax - x0, ay - y0)


def builds(cache):
    bd = os.path.join(cache, 'builds')
    out = {}
    for fn in sorted(os.listdir(bd)):
        if not fn.endswith('.json'):
            continue
        m = json.load(open(os.path.join(bd, fn)))
        k = m['build']
        ims = {}
        anchor = m['anchorPx']
        size = m['frameSize']
        if m['kind'] == 'item':
            for n in m['frames']:
                ims[n] = pu.clean_alpha(rgba(os.path.join(bd, n + '.png')), floor=3)
        else:
            raw = {n: pp.tint_shadow(pu.clean_alpha(rgba(os.path.join(bd, n + '.png')), floor=10)) for n in m['frames']}
            # one crop box for every frame of the key (the union of the solid parts)
            first = raw[m['frames'][0]]
            union = np.zeros(first.size[::-1], bool)
            for im in raw.values():
                union |= np.asarray(im)[..., 3] > 200
            ys, xs = np.nonzero(union)
            mw, mh = PROP_MAX.get(k, size)
            x0 = max(0, xs.min() - 4)
            x1 = min(size[0], x0 + mw)
            if xs.max() + 4 > x1:
                x0 = max(0, xs.max() + 4 - mw)
                x1 = x0 + mw
            y0 = max(0, ys.min() - 4)
            y1 = min(size[1], y0 + mh)
            for n, im in raw.items():
                ims[n] = pp.border_fade(im.crop((x0, y0, x1, y1)), width=12)
            anchor = [anchor[0] - x0, anchor[1] - y0]
            size = [x1 - x0, y1 - y0]
            m['cropFrom'] = [x0, y0]
        out[k] = (m, ims, anchor, size)
    return out


def hub(cache, report):
    hd = os.path.join(cache, 'hub')
    m = json.load(open(os.path.join(hd, 'meta.json')))
    ims = {}
    emb = m.get('emblems', {})
    bases = {e['base'] for e in emb.values()}
    for n in m['boxes']:
        if n in bases or n in emb:
            continue
        ims[n] = pu.clean_alpha(rgba(os.path.join(hd, n + '.png')), floor=4)
    # (polish M2) emblem / roof-parcel patches over logistics_center_shell: keep the pixels that changed between the
    # shell-pass render as shipped (base_*) and the 금방 render (+ a 2 px opaque collar), so the wall where the
    # wings were is re-rendered and nothing else of the shell is touched
    for key, e in emb.items():
        cur = arr(rgba(os.path.join(hd, key + '.png')))
        base = arr(rgba(os.path.join(hd, e['base'] + '.png')))
        mk = changed_mask(cur, base, thr=10)
        ys, xs = np.nonzero(mk)
        if len(xs) == 0:
            report['errors'].append('%s: no change vs the shipped shell' % key)
            continue
        H_, W_ = mk.shape
        x0, x1 = max(0, xs.min() - 4), min(W_, xs.max() + 5)
        y0, y1 = max(0, ys.min() - 4), min(H_, ys.max() + 5)
        out = patch_pixels(cur, base, (x0, y0, x1, y1), strong_thr=10, region_px=3, collar=2)
        ims[key] = Image.fromarray(out, 'RGBA')
        report.setdefault('hubPatches', {})[key] = {'px': int((out[..., 3] > 0).sum()),
                                                    'rect': [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]}
    return m, ims


def pennant(cache):
    pd = os.path.join(cache, 'pennant')
    m = json.load(open(os.path.join(pd, 'meta.json')))
    ims = {}
    for d in m['dirs']:
        for i in range(m['frames']):
            n = 'gb_pennant_%s_%d' % (d, i)
            ims[n] = cp.ink_outline(rgba(os.path.join(pd, n + '.png')))
    return m, ims


# =================================================================================================== maths

def patchify(ims, base_name, names, anchor, size, report):
    """Turn ims[n] (n in names) into a patch over ims[base_name]: clear every pixel outside the changed rectangle."""
    base = arr(ims[base_name])
    for n in names:
        cur = arr(ims[n])
        mk = changed_mask(cur, base)
        ys, xs = np.nonzero(mk)
        if len(xs) == 0:
            report['errors'].append('%s: no change vs %s' % (n, base_name))
            continue
        x0, x1 = max(0, xs.min() - PATCH_PAD), min(size[0], xs.max() + 1 + PATCH_PAD)
        y0, y1 = max(0, ys.min() - PATCH_PAD), min(size[1], ys.max() + 1 + PATCH_PAD)
        o = patch_pixels(cur, base, (x0, y0, x1, y1))
        erase = int(((base[y0:y1, x0:x1, 3] > 160) & (cur[y0:y1, x0:x1, 3] < 60)).sum())
        ims[n] = Image.fromarray(o, 'RGBA')
        report['patches'][n] = {'rect': [int(x0 - anchor[0]), int(y0 - anchor[1]), int(x1 - x0), int(y1 - y0)],
                                'erasePx': erase, 'over': base_name}


def iso_px(p, yaw_deg):
    """bl_common.world_to_pixel of a body-local point turned by yaw (no Blender)."""
    x, y, z = p
    c, s = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    X, Y = x * c - y * s, x * s + y * c
    k = math.sqrt(0.5)
    sx = (X + Y) * k
    syg = (-X + Y) * k
    up = syg * 0.5 + z * math.cos(math.radians(30.0))
    return [sx * 64.0, -up * 64.0]


DIR_YAW = {'S': 45.0, 'SE': 90.0, 'E': 135.0, 'NE': 180.0, 'N': 225.0, 'NW': 270.0, 'W': 315.0, 'SW': 0.0}


def mirror_shift(frame_w, anchor_x):
    """Phaser 3 flips a frame about its CENTRE (WebGL batchSprite: x += -realWidth + 2 * displayOriginX), not about
    its origin: a pixel at dx from the origin of a flipped sprite lands at -dx + (frame_w - 2 * anchor_x * frame_w)."""
    return frame_w - 2.0 * anchor_x * frame_w


def sled_pennant(foot, pen_w, pen_ax):
    vm = json.load(open(VEH, encoding='utf-8'))
    ds = vm['characters']['dog_sled']
    out = {}
    for d in ('SE', 'NE'):
        base = iso_px(foot, DIR_YAW[d])
        out[d] = {}
        for an in ('idle', 'move'):
            bob = ds['anims'][an]['bobPx']
            out[d][an] = [[int(round(base[0])), int(round(base[1] + b))] for b in bob]
    # (polish M4) explicit mirrored tables: flipped sled + flipped pennant, each flipped about its own frame centre
    ss = mirror_shift(ds['frameSize'][0], ds['anchor'][0])
    sp = mirror_shift(pen_w, pen_ax)
    for d, src in (('SW', 'SE'), ('NW', 'NE')):
        out[d] = {an: [[int(round(-q[0] + ss - sp)), q[1]] for q in v] for an, v in out[src].items()}
    return out, ds, {'dog_sled': round(ss, 2), 'gb_pennant': round(sp, 2)}


def foot_poly(fp, yaw):
    if fp is None:
        return None
    if fp[0] == 'r':
        r = fp[1]
        return [[int(round(iso_px((r * math.cos(t), r * math.sin(t), 0), 0)[0])),
                 int(round(iso_px((r * math.cos(t), r * math.sin(t), 0), 0)[1]))]
                for t in [k * math.tau / 8 for k in range(8)]]
    a, b = fp
    return [[int(round(v)) for v in iso_px((sx * a / 2, sy * b / 2, 0), yaw)]
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


# =================================================================================================== main

def _jdefault(o):
    if isinstance(o, np.integer):
        return int(o)
    if isinstance(o, np.floating):
        return float(o)
    if isinstance(o, np.bool_):
        return bool(o)
    raise TypeError(type(o))


def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    cache = os.environ.get('GB_CACHE') or os.path.join(tempfile.gettempdir(), 'fv_cache', 'geumbang')
    out_dir, mode, partial = OUT, 'on', False
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ('--cache', '--out', '--quantize'):
            v = argv[i + 1]
            i += 1
            if a == '--cache':
                cache = v
            elif a == '--out':
                out_dir = v
            else:
                mode = v
        elif a == '--allow-partial':
            partial = True
        i += 1
    need = [os.path.join(cache, p) for p in ('gb_van/meta.json', 'roofsign/meta.json', 'hub/meta.json',
                                              'pennant/meta.json', 'builds/gb_sign.json')]
    missing = [p for p in need if not os.path.exists(p)]
    if missing and not partial:
        raise SystemExit('gb_pack: ABORT - missing renders (nothing written):\n  ' + '\n  '.join(missing) +
                         '\n  run: nice -n 10 /tmp/bvenv/bin/python tools/blender/gb_render.py -- all')
    report = {'errors': [], 'warnings': [], 'patches': {}}
    lgx = json.load(open(LGX, encoding='utf-8'))
    red = lgx['characters']['delivery_van_red']
    LC = lgx['sprites']['logistics_center']
    vmeta, rmeta, vframes, vovers, valias, patches = van(cache, report)
    report['patches'] = patches
    bmeta = builds(cache)
    hmeta, hims = hub(cache, report)
    pmeta, pims = pennant(cache)
    # ---------------------------------------------------------------- pages
    sheets = []
    vsheet, vatlas = pack_tight(vframes + vovers, VAN_PAGE_MAX, padding=2)
    import veh_pack as vp
    vp.add_aliases(vatlas, valias)
    sheets.append(('gb_van_0', vsheet, vatlas))
    for name, sh, _ in sheets:
        lim = VAN_PAGE_MAX if name == 'gb_van_0' else BLD_PAGE_MAX
        if sh.width > lim[0] or sh.height > lim[1]:
            report['errors'].append('%s is %dx%d (> %dx%d)' % (name, sh.width, sh.height, lim[0], lim[1]))
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.startswith('gb_') and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(out_dir, fn))
    sizes = {}
    for name, sh, at in sheets:
        png = os.path.join(out_dir, name + '.png')
        pu.save_atlas(sh, at, png, os.path.join(out_dir, name + '.json'), quantize=False)
        if mode == 'on':
            quantize(sh).save(png, optimize=True)
        sizes[name] = {'size': [sh.width, sh.height], 'MiB': round(sh.width * sh.height * 4 / 1048576.0, 2),
                       'bytes': os.path.getsize(png) + os.path.getsize(os.path.join(out_dir, name + '.json'))}
        print('%-10s %4dx%-4d %3d frames  %.2f MiB texture  %.1f KB file' % (
            name, sh.width, sh.height, len(at['frames']), sizes[name]['MiB'], sizes[name]['bytes'] / 1024.0))
    # ---------------------------------------------------------------- manifest
    W, H = vmeta['frameSize']
    ax, ay = vmeta['anchorPx']
    E = vmeta['expand']
    WE, HE = vmeta['canvas']
    pts = vmeta['points']
    vis = vmeta['visible']
    anims = {'idle': {'frames': 2, 'fps': 6, 'repeat': -1, 'bobPx': list(red['anims']['idle']['bobPx'])},
             'move': {'frames': 4, 'fps': 10, 'repeat': -1, 'bobPx': list(red['anims']['move']['bobPx']),
                      'wheels': True},
             'door': {'frames': 3, 'fps': 10, 'repeat': 0, 'patch': True, 'over': 'idle_{dir}_0',
                      'frameSize': [WE, HE], 'anchor': [round((ax + E) / WE, 5), round((ay + E) / HE, 5)],
                      'rects': {d: [patches.get('door_%s_%d' % (d, i), {}).get('rect') for i in range(3)]
                                for d in VAN_DIRS},
                      'patchDepth': PATCH_DEPTH, 'overlay': 'over_door_{dir}_{i}', 'emptySeats': [0],
                      'drawOrder': PATCH_ORDER},
             'unload': {'frames': 4, 'fps': 8, 'repeat': 0, 'patch': True, 'over': 'idle_{dir}_0',
                        'frameSize': [WE, HE], 'anchor': [round((ax + E) / WE, 5), round((ay + E) / HE, 5)],
                        'rects': {d: [patches.get('unload_%s_%d' % (d, i), {}).get('rect') for i in range(4)]
                                  for d in VAN_DIRS},
                        'patchDepth': PATCH_DEPTH, 'overlay': 'over_unload_{dir}_{i}', 'emptySeats': [],
                        'drawOrder': PATCH_ORDER}}
    van_e = {k: red[k] for k in POINT_FIELDS if k in red}
    van_e.update({
        'atlas': 'gb_van_0', 'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'vehicle', 'era': 3,
        'family': 'delivery_van', 'variant': 'gb', 'role': 'gb', 'rig': 'delivery_van_red',
        'overlay': {'atlas': 'gb_van_0', 'frameName': 'over_{anim}_{dir}_{i}'},
        'roofSignPoint': {d: pts[d]['roofSignPoint'] for d in VAN_DIRS},
        'parcelPoints': {d: pts[d]['parcelPoints'] for d in VAN_DIRS},
        'parcelGround': {d: pts[d]['parcelGround'] for d in VAN_DIRS},
        # (polish M5 / L4) which points are actually seen from the camera (ray-tested in Blender, per point)
        'parcelPointsVisible': {d: vis[d]['parcelPoints'] for d in VAN_DIRS},
        'lightsVisible': {d: vis[d]['lightPoints'] for d in VAN_DIRS},
        'tailsVisible': {d: vis[d]['tailPoints'] for d in VAN_DIRS},
        'mirrorShiftPx': W - 2 * ax,
        'doorstepDirs': ['NE', 'NW'],
        'roofSign': {'ko': ['gb_roofsign_ko_0', 'gb_roofsign_ko_1'], 'en': ['gb_roofsign_en_0', 'gb_roofsign_en_1'],
                     'anchor': [0.5, 1.0], 'note': 'draw at roofSignPoint[dir] (+ the current bobPx; negate dx for a '
                                                   'mirrored dir) ABOVE the van and its overlay, never flipped; '
                                                   '_0 by day, _1 when lit (night).'},
        'turn': 'gb_van_turn',
        'notes': ('금방 van: the delivery_van_red rig (same frame, anchor, dirs, sizes and every point) in the 금방 '
                  'livery - honey-gold body, navy belt line, cream roof band + snow, the symmetric 금방이 mark on '
                  'both flanks, NO letters (SW / NW are flipX mirrors). The word 금방 rides on the camera-facing roof '
                  'sign (roofSign / roofSignPoint). door (3 f, once): the driver door swings open; unload (4 f, '
                  'once): the rear doors open, f3 shows the parcels at parcelPoints (parcelGround = the floor '
                  'under them) - only where parcelPointsVisible says so: in SE / SW the rear faces away and the '
                  'parcels are hidden by the body, so stage doorstep kerb stops facing NE / NW (doorstepDirs) or '
                  'show the parcel only once it is in the courier\'s hands. door / unload are PATCHES: hold the '
                  'body on idle_<dir>_0 and draw the patch frame at the SAME position with anims.<anim>.anchor / '
                  'frameSize (the grown canvas; rects = [x, y, w, h] px from the van anchor) at body depth + '
                  'patchDepth (0.0005: UNDER the riders), then the riders, then anims.<anim>.overlay '
                  '(over_door_<dir>_<i> / over_unload_<dir>_<i>, same anchor / frameSize as the patch) INSTEAD of '
                  'over_idle_<dir>_0. door: seat 0 (the driver) is empty while it plays - he steps out at '
                  'doorPoints[0]; a seat-1 passenger stays and is drawn after the patch. Play backward to close. '
                  'lightsVisible / tailsVisible: add night glows only at the visible lamps.'),
    })
    # computed points vs the red van (same rig: must be 0 px apart)
    cmp = {}
    for f in ('cargoPoint', 'doorPoints', 'exhaustPoint', 'lightPoints', 'tailPoints', 'rearDoorPoint', 'seats',
              'seatsStand', 'footprintPoly'):
        for d in VAN_DIRS:
            a, b = red.get(f, {}).get(d), pts[d].get(f)
            if a is None or b is None:
                continue
            fa = np.array(a[:2] if f == 'cargoPoint' else a, float)
            fb = np.array(b[:2] if f == 'cargoPoint' else b, float)
            cmp['%s.%s' % (f, d)] = float(np.abs(fa - fb).max()) if fa.shape == fb.shape else 99.0
    report['rigDelta'] = cmp
    report['vanVisible'] = vmeta.get('visible', {})
    report['rearParts'] = vmeta.get('rearParts', {})
    report['vanGold'] = vmeta.get('vanGold')
    tm = vmeta['turn']
    TW, TH = tm['frameSize']
    tax, tay = tm['anchorPx']
    L_, Wd = vmeta['lengthM'], vmeta['widthM']
    turn_e = {
        'atlas': 'gb_van_0', 'frameSize': [TW, TH], 'anchor': [round(tax / TW, 5), round(tay / TH, 5)],
        'dirs': TURN_DIRS, 'mirror': {'W': 'E'}, 'frameName': 'turn_{dir}_0', 'kind': 'vehicle', 'era': 3,
        'family': 'delivery_van', 'variant': 'gb', 'role': 'gb', 'of': 'gb_van',
        'anims': {'turn': {'frames': 1, 'fps': 1, 'repeat': 0}},
        'overlay': {'atlas': 'gb_van_0', 'frameName': 'over_turn_{dir}_0'},
        'shadow': {'S': [int(round(Wd * 64 * 1.05)), int(round(L_ * 32 * 0.98)), 0.0],
                   'N': [int(round(Wd * 64 * 1.05)), int(round(L_ * 32 * 0.98)), 0.0],
                   'E': [int(round(L_ * 64 * 0.98)), int(round(Wd * 32 * 1.05)), 0.0]},
        'headingDeg': {'S': 90, 'E': 0, 'N': 270, 'W': 180},
        'notes': ('The 45-degree corner frames of gb_van (anchor = the ground under the van centre): shown for '
                  'van.turnS (0.3 s) mid-corner. S (front to the camera), E (pure side), N (rear to the camera); '
                  'W = E flipped (negate dx). Draw the shadow ellipse, the frame, seated people at seats, '
                  'over_turn_<dir>_0, then the roof sign at roofSignPoint.'),
    }
    for f in ('seats', 'seatDirs', 'seatsStand', 'seatDrawOrder', 'lightPoints', 'tailPoints', 'roofSignPoint',
              'footprintPoly', 'doorPoints', 'rearDoorPoint', 'cargoPoint', 'exhaustPoint'):
        turn_e[f] = {d: pts[d][f] for d in TURN_DIRS if f in pts[d]}
    turn_e['seatNames'] = vmeta['seatNames']
    turn_e['driverSeat'] = 0
    turn_e['lightsVisible'] = {d: vis[d]['lightPoints'] for d in TURN_DIRS}
    turn_e['tailsVisible'] = {d: vis[d]['tailPoints'] for d in TURN_DIRS}
    turn_e['mirrorShiftPx'] = TW - 2 * tax
    sprites = {}
    for n in rmeta['frames']:
        lang, lit = n.split('_')[2], int(n.split('_')[3])
        sprites[n] = {'atlas': 'gb_van_0', 'frame': n, 'anchor': [0.5, 1.0], 'frameSize': rmeta['frameSize'],
                      'kind': 'overlay', 'of': 'gb_van', 'point': 'roofSignPoint', 'lang': lang, 'lit': bool(lit),
                      'mirror': False, 'hasText': True,
                      'notes': 'Camera-facing roof A-board (cream face, gold rim, %s) on a charcoal roof bar; %s. '
                               'Never flipped; on a mirrored van draw it at x - p[0] + mirrorShiftPx.' % (
                                   'the mark + navy "금방"' if lang == 'ko' else
                                   'a stacked lockup: the mark + navy GEUM / BANG on two lines',
                                   'lit (night)' if lit else 'day')}
    # hub layers
    hanchor = [round(hmeta['anchorPx'][0] / hmeta['frameSize'][0], 5),
               round(hmeta['anchorPx'][1] / hmeta['frameSize'][1], 5)]
    if hanchor != LC['anchor'] or hmeta['frameSize'] != LC['frameSize']:
        report['errors'].append('hub frame %s / anchor %s differ from logistics_center %s / %s' % (
            hmeta['frameSize'], hanchor, LC['frameSize'], LC['anchor']))
    texts = {'gb_nameplate_ko': 'mark + 금방 + 물류센터', 'gb_nameplate_en': 'mark + GEUMBANG / CENTRE',
             'seori_nameplate_ko': '서리 물류창고', 'seori_nameplate_en': 'Frost Depot'}
    for k, t in texts.items():
        lang = k[-2:]
        sprites[k] = {'atlas': 'gb_bld_0', 'frame': k, 'anchor': LC['anchor'], 'frameSize': LC['frameSize'],
                      'kind': 'layer', 'of': 'logistics_center', 'layer': 'nameplate_' + lang,
                      'replaces': 'nameplate_' + lang, 'depthOffset': 0.0005, 'lang': lang, 'withShell': True,
                      'hasText': True,
                      'notes': 'Raised navy letters (%s) lit like the shell, inside nameBoard: draw INSTEAD of '
                               'logistics_center_nameplate_%s, right above _shell, with the shell\'s alpha.%s'
                               % (t, lang, ' (서리 물류창고: before 금방 opens.)' if k.startswith('seori') else
                                  ' (after 금방 opens.)')}
    for lang in ('ko', 'en'):
        fr = ['gb_banner_%s_%d' % (lang, f) for f in range(hmeta['sway'])]
        sprites['gb_banner_' + lang] = {
            'atlas': 'gb_bld_0', 'frame': fr[0], 'anchor': LC['anchor'], 'frameSize': LC['frameSize'],
            'kind': 'patch', 'of': 'logistics_center', 'layer': 'banner', 'depthOffset': 0.0012, 'lang': lang,
            'withShell': True, 'hasText': lang == 'ko',
            'anims': {'sway': {'frames': fr, 'fps': 5, 'repeat': -1}},
            'notes': '0.7 x 1.8 m 금방 cloth banner on the front wall left of dock 1 (%s), with its own soft wall '
                     'shadow; sway loop. Fades with the shell. The print is de-sheared for the wall, so the mark and '
                     'the syllables stand upright on screen.' % ('the mark + 금 / 방 stacked upright' if lang == 'ko'
                                                                 else 'the mark + sparkles, no letters')}
    # (polish M2) the 금방 hub replaces the old logistics mark baked into the shell
    hp_notes = {'gb_emblem_gable': 'the big gable disc above dock 2: the 금방이 mark instead of the winged parcel',
                'gb_emblem_blade': 'the corner blade sign: a 금방이 disc instead of the blue winged-parcel disc',
                'gb_roofparcel': 'the giant parcel on the ridge: gold ribbons + bow instead of red'}
    for k, t in hp_notes.items():
        if k not in hims:
            continue
        sprites[k] = {'atlas': 'gb_bld_0', 'frame': k, 'anchor': LC['anchor'], 'frameSize': LC['frameSize'],
                      'kind': 'patch', 'of': 'logistics_center', 'layer': 'shell', 'depthOffset': 0.0004,
                      'withShell': True, 'hasText': False, 'brand': 'gb',
                      'notes': 'Re-render patch over logistics_center_shell (%s; only the changed pixels + a collar). '
                               'Draw it with the 금방 hub (gb_nameplate_<lang>) right above _shell, depth = building '
                               '+ 0.0004, alpha = shell alpha; not with the 서리 depot (seori_nameplate_*), which keeps '
                               'the centre\'s own mark.' % t}
    # props + items
    lg_sp = lgx['sprites']
    for k, (m, ims, anchor, size) in bmeta.items():
        fnames = list(m['frames'])
        e = {'atlas': 'gb_bld_0', 'frame': fnames[0], 'anchor': [round(anchor[0] / size[0], 5),
                                                                round(anchor[1] / size[1], 5)],
             'frameSize': size, 'kind': m['kind'], 'notes': m['notes']}
        tops = m.get('topPx', {})
        e['topPx'] = int(max(tops.values())) if tops else None
        if m['kind'] == 'item':
            e.update({'icon': True, 'stackStep': m.get('stackStep'), 'thicknessM': m.get('thicknessM'),
                      'carryScale': 0.65, 'category': m.get('category', 'goods')})
            box_of = m.get('boxOf') or {'gb_parcel_doorstep': 'cardboard_box_m', 'gb_parcel_open': 'cardboard_box_m',
                                        'gb_parcel_cat': 'cardboard_box_l'}.get(k)
            if box_of:
                e['boxOf'] = box_of
                e['sizeClass'] = lg_sp[box_of]['sizeClass']
                # (polish L5) the stacking fields follow the box class it stands in for
                for f in ('stackStep', 'thicknessM'):
                    if lg_sp[box_of].get(f) is not None:
                        e[f] = lg_sp[box_of][f]
            if k == 'gb_parcel_doorstep':
                e['states'] = {'fresh': fnames[0], 'snowy': fnames[1]}
                e['anims'] = {'idle': {'frames': fnames, 'fps': 1, 'repeat': 0}}
            if k == 'gb_parcel_cat':
                e['anims'] = {'blink': {'frames': fnames, 'fps': 4, 'repeat': -1, 'repeatDelay': 1600}}
        else:
            e['shadow'] = 'baked'
            e['footprintM'] = m.get('footprintM')
            e['footprintPoly'] = foot_poly(GBA_FP.get(k), GBA_YAW.get(k, 0.0))
            if 'heightM' in m:
                e['heightM'] = m['heightM']
            if k == 'gb_sign':
                e['states'] = {'day': fnames[0], 'lit': fnames[1]}
                e['anims'] = {'idle': {'frames': fnames, 'fps': 1, 'repeat': 0}}
            elif k == 'gb_flag':
                e['anims'] = {'wave': {'frames': fnames, 'fps': 8, 'repeat': -1}}
            elif k.startswith('gb_locker'):
                op = [n for n in fnames if '_open_' in n]
                e['states'] = {'day': k + '_0', 'lit': k + '_1'}
                e['anims'] = {'idle': {'frames': [k + '_0', k + '_1'], 'fps': 1, 'repeat': 0},
                              'open': {'frames': op, 'fps': 12, 'repeat': 0, 'patch': True, 'over': k + '_0'}}
                e['faces'] = m.get('faces')
                fp = m['framePoints'][fnames[0]]
                fd = m['frameDirs'][fnames[0]]
                e['slotPoints'] = fp['slot']
                e['openSlot'] = int(m.get('openSlot', 7))
                e['openPoint'] = fp['open'][0]
                e['standPoint'] = fp['stand'][0]
                e['standDir'] = fd['stand'][0]
                e['fillPoint'] = fp['fill'][0]
                e['fillDir'] = fd['fill'][0]
                patchify(ims, k + '_0', op, anchor, size, report)
            if k == 'gb_sign' or k.startswith('gb_locker'):
                # night = a crop patch over the day frame (CONTRACT AO.5 'night = f1 or a crop patch'): page area
                patchify(ims, k + '_0', [k + '_1'], anchor, size, report)
                e['litPatch'] = True
        sprites[k] = e
    # pennant
    foot = pmeta['footSled']
    PW, PH = pmeta['frameSize']
    pax, pay = pmeta['anchorPx']
    sp_pen, ds, shifts = sled_pennant(foot, PW, pax / float(PW))
    sprites['gb_pennant'] = {
        'atlas': 'gb_bld_0', 'frame': 'gb_pennant_SE_0', 'frameSize': [PW, PH],
        'anchor': [round(pax / PW, 5), round(pay / PH, 5)], 'kind': 'overlay', 'of': 'dog_sled',
        'dirs': ['SE', 'NE'], 'mirror': {'SW': 'SE', 'NW': 'NE'}, 'frameName': 'gb_pennant_{dir}_{i}',
        'anims': {'flutter': {'frames': 4, 'fps': 10, 'repeat': -1}}, 'sledPennant': sp_pen, 'hasText': False,
        'mirrorShiftPx': PW - 2 * pax,
        'notes': ('A gold 금방이 pennant on a little stick for the dog sled (금방 개썰매): put its anchor (the stick '
                  'foot) at dog_sled anchor + sledPennant[dir][anim][i] for the sled frame being shown (idle 4 / '
                  'move 8; includes the sled bob) and draw it right after the sled + its overlay. sledPennant has '
                  'all four dirs: SW / NW are explicit tables for the flipped sled + flipped pennant (Phaser flips '
                  'a frame about its centre, not its anchor: x = -x(SE / NE) + dog_sled shift - pennant shift) - use '
                  'them as they are, do not negate.'),
    }
    # the open patches changed: re-pack gb_bld_0 with them
    bframes = []
    for n, im in hims.items():
        bframes.append((n, im))
    for k, (m, ims, anchor, size) in bmeta.items():
        bframes += list(ims.items())
    bframes += list(pims.items())
    bsheet, batlas = pack_tight(bframes, BLD_PAGE_MAX, padding=2)
    png = os.path.join(out_dir, 'gb_bld_0.png')
    pu.save_atlas(bsheet, batlas, png, os.path.join(out_dir, 'gb_bld_0.json'), quantize=False)
    if mode == 'on':
        quantize(bsheet).save(png, optimize=True)
    sizes['gb_bld_0'] = {'size': [bsheet.width, bsheet.height], 'MiB': round(bsheet.width * bsheet.height * 4 /
                                                                            1048576.0, 2),
                         'bytes': os.path.getsize(png) + os.path.getsize(os.path.join(out_dir, 'gb_bld_0.json'))}
    if bsheet.width > BLD_PAGE_MAX[0] or bsheet.height > BLD_PAGE_MAX[1]:
        report['errors'].append('gb_bld_0 is %dx%d' % (bsheet.width, bsheet.height))
    print('gb_bld_0   %4dx%-4d (final)  %.2f MiB texture' % (bsheet.width, bsheet.height, sizes['gb_bld_0']['MiB']))
    man = {
        'version': 1, 'fragment': 'geumbang',
        'generator': 'tools/blender/gb_render.py + gb_pack.py (docs/CONTRACT_GEUMBANG.md section AO)',
        'brand': BRAND,
        'conventions': {
            'ppu': 64,
            'vehicles': ('characters{} kind "vehicle" in the assets/vehicles conventions (dirs SE, NE; SW <- SE and '
                         'NW <- NE with flipX; frame names {anim}_{dir}_{i}; no baked shadow: draw shadow[dir]; seats '
                         '+ over_* overlays; px points per dir, negate dx when mirrored). gb_van = the delivery_van_red '
                         'rig exactly; gb_van_turn = its S / E / N corner frames (W <- E).'),
            'patches': ('A patch frame is drawn over its base frame at the same position with its own '
                        'anchor / frameSize (the trimmed frame holds only the changed pixels). gb_van door / unload: '
                        'over idle_<dir>_0 at body depth + patchDepth (0.0005), i.e. UNDER the seated / standing '
                        'riders, and the van overlay switches to anims.<anim>.overlay (over_door_* / over_unload_*, '
                        'same anchor / frameSize as the patch) - never draw a van patch above the riders or above '
                        'over_*; door empties seat 0. gb_locker_* open over <key>_0; gb_banner_* (0.0012), '
                        'gb_emblem_* / gb_roofparcel (0.0004) over logistics_center_shell, fading with the shell.'),
            'mirror': ('Phaser flips a frame about its CENTRE, not its anchor: a point (dx, dy) of a flipped sprite '
                       'lands at (-dx + mirrorShiftPx, dy), mirrorShiftPx = frameW - 2 * anchorX * frameW '
                       '(gb_van -2, gb_van_turn %s, gb_pennant %s, dog_sled %s). The red-van tables keep the plain '
                       'negation (2 px); sledPennant ships explicit SW / NW tables because the sled and the pennant '
                       'shift by 50 px between them.' % (round(mirror_shift(*[turn_e['frameSize'][0],
                                                                               turn_e['anchor'][0]]), 1),
                                                         shifts['gb_pennant'], shifts['dog_sled'])),
            'layers': ('gb_nameplate_<lang> / seori_nameplate_<lang> share logistics_center frameSize + anchor: '
                       'draw one of them INSTEAD of logistics_center_nameplate_<lang> (replaces), depth = building '
                       '+ 0.0005, alpha = shell alpha.'),
            'states': ('props / items with states{}: show the named frame (day / lit at night) - not an animation. '
                       'litPatch: true -> the lit frame is a PATCH: draw it over the day frame at night.'),
            'items': ('72 x 72, anchor (36, 54); stackStep, carryScale, topPx, sizeClass from the matching '
                      'cardboard_box_* (boxOf). Also usable as icons.'),
            'text': ('Letters only on: ' + ', '.join(TEXT_KEYS) + '. No letters on any mirrored sprite (gb_van, '
                     'gb_van_turn, gb_pennant).'),
            'night': ('Lit frames (_1 / roof sign _1) are drawn under the game\'s MULTIPLY night tint; add the usual '
                      'ADD glow at the VISIBLE lightPoints (lightsVisible) / roofSignPoint / the sign disc for the '
                      'lantern feel, and a soft ADD glow at logistics_center fxPoints.board so the 금방 nameplate '
                      'and banner do not sink below the lit windows at night.'),
        },
        'atlases': [{'key': n, 'png': 'geumbang/%s.png' % n, 'json': 'geumbang/%s.json' % n}
                    for n in ('gb_van_0', 'gb_bld_0')],
        'pages': {n: dict(sizes[n], residency={'gb_van_0': 'class gbVan (a van within 1,200 px of the view)',
                                               'gb_bld_0': 'gb_core (built with ui6 resident icons): area gb + '
                                                           'doorstep / locker / sled in view'}[n])
                  for n in sizes},
        'characters': {'gb_van': van_e, 'gb_van_turn': turn_e},
        'vehicleFamilies': {'delivery_van': ['gb_van']},
        'sprites': sprites,
        'geumbang': {'sledPennant': sp_pen, 'roofSignPoint': van_e['roofSignPoint'],
                     'hub': {'banner': hmeta['banner'], 'nameplates': hmeta['info']},
                     'report': {k: v for k, v in report.items() if k != 'errors'}},
    }
    with open(os.path.join(out_dir, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False, default=_jdefault)
    tot = sum(v['bytes'] for v in sizes.values()) + os.path.getsize(os.path.join(out_dir, 'manifest.json'))
    print('wrote %s: %d characters, %d sprites, payload %.2f MB, textures %.2f MiB' % (
        os.path.join(out_dir, 'manifest.json'), len(man['characters']), len(sprites), tot / 1048576.0,
        sum(v['MiB'] for v in sizes.values())))
    for e in report['errors']:
        print('ERROR', e)
    rp = os.path.join(cache, 'pack_report.json')
    with open(rp, 'w') as f:
        json.dump(report, f, indent=1, default=_jdefault)
    return 1 if report['errors'] else 0


GBA_FP = {'gb_sign': ('r', 0.3), 'gb_flag': ('r', 0.3), 'gb_locker_a': (1.8, 0.6), 'gb_locker_b': (1.8, 0.6)}
GBA_YAW = {'gb_locker_b': 90.0}

if __name__ == '__main__':
    sys.exit(main())
