"""
gb_check.py - contract check of assets/geumbang (docs/CONTRACT_GEUMBANG.md AO + AS: frames, dirs, anchors, points,
alignment, MiB, brand).  No Blender needed.  Exit 1 on any error.

    python3 tools/blender/gb_check.py [--json OUT]

Checks
  * manifest + 2 atlases load; every frame a key / anim / dir / overlay / patch names exists
  * pages: gb_van_0 <= 2048 x 1024 and <= 8 MiB, gb_bld_0 <= 1024 x 1024 and <= 2.5 MiB, total <= 10.5 MiB;
    5 source files / 3 shipped (the atlas JSON is embedded at build time)
  * gb_van = the delivery_van_red rig: frameSize, anchor, dirs, mirror, sizes and EVERY point field identical (0 px);
    the re-measured geometry of the gold van is 0 px from the red van's points (gb_pack report); anims idle 2 / 6 fps,
    move 4 / 10 fps (red's bobPx), door 3 / 10 fps once, unload 4 / 8 fps once as patches (pixels changed outside the
    patch <= 0.5 %, no pixel the patch would have to erase); roofSignPoint + parcelPoints[3] per dir
  * gb_van_turn: S / E / N rendered, W <- E, frame <= 368 x 352, seats*, light / tailPoints, roofSignPoint, shadow,
    footprintPoly
  * roof signs 96 x 56 anchor [0.5, 1]; at zoom 0.6 on a 390-CSS phone the sign is >= 30 CSS px and the van mark
    >= 12 CSS px
  * hub layers: logistics_center frame + anchor, kind / replaces / depthOffset, nameplate inside nameBoard, the banner
    clear of dock 1, the dock lamps, the loading sign and the name board (opaque-pixel overlap)
  * props / items / pennant: frame maxima, anchors, anims, points (slotPoints 12, openSlot, stand / fill), sledPennant
  * brand: the mark is its own mirror (<= 6 % px), navy <= 15 % of every sprite's opaque px, no sprite whose two
    largest colour areas sit within dE2000 15 of a listed brand pair, letters only in the listed keys, no letters on
    any mirrored sprite; no key collides with another fragment
  (polish, gb_vehicles_bld_critique.md)
  * H1: rear-door windows / handles stay on their leaves (Blender geometry); no detached island >= 6 px in any
    door / unload patch composited over idle_<dir>_0
  * H2: patchDepth under the riders, over_<anim>_<dir>_<i> for every patch frame on the patch canvas, door empties
    seat 0, no unchanged cab px of an unload patch in the rider zone
  * M2: gb_emblem_gable / gb_emblem_blade / gb_roofparcel patches on the centre frame; M3: every roof-sign text line
    >= CAP_MIN px; M4: sledPennant SW / NW = Phaser centre-flip mirrors of SE / NE; M5 / L4: per-point visibility
    flags; L3: the van mark MEASURED (projected mark box, checked on the pixels), colour pairs by hue family, navy
    counted lit + shaded, hub layers / patches judged too
    GB_DIR=<dir> checks another copy of the set (regression runs against the pre-polish files)
"""
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
A = os.path.join(GAME, 'assets')
D = os.environ.get('GB_DIR') or os.path.join(A, 'geumbang')   # GB_DIR: check another copy (regression runs)
sys.path.insert(0, HERE)

ERR, WARN, INFO = [], [], {}
CSS_PER_PX = 390.0 / 720.0           # phone 390 CSS px wide shows the 720 px logical canvas
BRAND_PAIRS = {'UPS': ('#351C15', '#FFB500'), 'DHL': ('#FFCC00', '#D40511'), 'Coupang': ('#E52528', '#346AFF'),
               'Baemin': ('#2AC1BC', '#FFFFFF'), 'Kurly': ('#5F0080', '#FFFFFF'), 'Korea Post': ('#E60012', '#F39800'),
               'Yamato': ('#FFC20E', '#000000'), 'IKEA-like': ('#FFDA1A', '#0058A3')}
NAVY = '#2B4F7E'
TEXT_KEYS = {'gb_roofsign_ko_0', 'gb_roofsign_ko_1', 'gb_roofsign_en_0', 'gb_roofsign_en_1', 'gb_nameplate_ko',
             'gb_nameplate_en', 'seori_nameplate_ko', 'seori_nameplate_en', 'gb_banner_ko'}
MIRRORED = {'gb_van', 'gb_van_turn', 'gb_pennant'}
CAP_MIN = 10                         # (polish M3) letter / cap height on the sprite, px (>= 5.4 CSS px at zoom 1.0)


def err(m):
    ERR.append(m)


def warn(m):
    WARN.append(m)


# --------------------------------------------------------------------------- colour maths

def hex_rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float64)


def rgb2lab(rgb):
    c = np.asarray(rgb, np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = c @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116.0)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def de2000(l1, l2):
    L1, a1, b1 = np.moveaxis(np.asarray(l1, np.float64), -1, 0)
    L2, a2, b2 = np.moveaxis(np.asarray(l2, np.float64), -1, 0)
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25.0 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    dhp = h2p - h1p
    dhp = np.where(np.abs(dhp) > 180, dhp - 360 * np.sign(dhp), dhp)
    dhp = np.where(C1p * C2p == 0, 0, dhp)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hbp = np.where(np.abs(h1p - h2p) > 180, (h1p + h2p + 360) / 2, (h1p + h2p) / 2)
    hbp = np.where(C1p * C2p == 0, h1p + h2p, hbp)
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp)) +
         0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dth = 30 * np.exp(-((hbp - 275) / 25) ** 2)
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25.0 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh))


def components(mask):
    """4-connected components of a boolean mask -> [(count, (x0, y0, x1, y1))] (no scipy on the build box)."""
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    out = []
    ys, xs = np.nonzero(mask)
    k = 0
    for y, x in zip(ys.tolist(), xs.tolist()):
        if lab[y, x]:
            continue
        k += 1
        st = [(y, x)]
        lab[y, x] = k
        n, x0, y0, x1, y1 = 0, x, y, x, y
        while st:
            cy, cx = st.pop()
            n += 1
            x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = k
                    st.append((ny, nx))
        out.append((n, (x0, y0, x1 + 1, y1 + 1)))
    return out


def families(px, k=6):
    """(polish L3) colour areas merged by hue family: k-means in Lab, then clusters of one hue (chroma >= 10, hue
    within 25 deg) or one grey level (chroma < 10, dL < 25) are merged, so lit and shaded gold count as ONE area.
    Returns [(lab centroid, fraction)] largest first."""
    lab = rgb2lab(px)
    if len(lab) > 6000:
        lab = lab[np.linspace(0, len(lab) - 1, 6000).astype(int)]
    order = np.argsort(lab[:, 0])
    cent = lab[order[np.linspace(0, len(lab) - 1, k).astype(int)]].copy()
    for _ in range(12):
        d = ((lab[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        lbl = d.argmin(1)
        for j in range(k):
            if (lbl == j).any():
                cent[j] = lab[lbl == j].mean(0)
    cnt = np.bincount(lbl, minlength=k).astype(float)
    fam = list(range(k))

    def same(a, b):
        ca, cb = np.hypot(*cent[a][1:]), np.hypot(*cent[b][1:])
        if ca < 10 and cb < 10:
            return abs(cent[a][0] - cent[b][0]) < 25
        if ca < 10 or cb < 10:
            return False
        ha = math.degrees(math.atan2(cent[a][2], cent[a][1]))
        hb = math.degrees(math.atan2(cent[b][2], cent[b][1]))
        return abs((ha - hb + 180) % 360 - 180) < 25
    for a in range(k):
        for b in range(a + 1, k):
            if cnt[a] and cnt[b] and same(a, b):
                fa, fb = fam[a], fam[b]
                fam = [fa if f == fb else f for f in fam]
    out = []
    for f in sorted(set(fam)):
        idx = [j for j in range(k) if fam[j] == f and cnt[j]]
        if not idx:
            continue
        w = cnt[idx]
        out.append(((cent[idx] * w[:, None]).sum(0) / w.sum(), w.sum() / cnt.sum()))
    out.sort(key=lambda t: -t[1])
    return out


def two_largest(px):
    """Two largest colour areas of an (N, 3) pixel list: deterministic k-means (k = 6) in Lab."""
    lab = rgb2lab(px)
    if len(lab) > 6000:
        lab = lab[np.linspace(0, len(lab) - 1, 6000).astype(int)]
    order = np.argsort(lab[:, 0])
    cent = lab[order[np.linspace(0, len(lab) - 1, 6).astype(int)]].copy()
    for _ in range(12):
        d = ((lab[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        lbl = d.argmin(1)
        for k in range(6):
            if (lbl == k).any():
                cent[k] = lab[lbl == k].mean(0)
    cnt = np.bincount(lbl, minlength=6)
    top = np.argsort(-cnt)[:2]
    return cent[top], cnt[top] / float(len(lab))


# --------------------------------------------------------------------------- atlas frames

ATL = {}


def load_atlas(key):
    if key not in ATL:
        j = json.load(open(os.path.join(D, key + '.json')))
        im = Image.open(os.path.join(D, j['meta']['image'])).convert('RGBA')
        ATL[key] = (j, im)
    return ATL[key]


def has(atlas, name):
    return name in load_atlas(atlas)[0]['frames']


def frame(atlas, name):
    j, img = load_atlas(atlas)
    f = j['frames'][name]
    fr, ss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
    out = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
    out.paste(img.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), (ss['x'], ss['y']))
    return out


def opaque_px(im, thr=200):
    a = np.asarray(im)
    return a[a[..., 3] >= thr][:, :3]


# --------------------------------------------------------------------------- checks

def check_pages(M):
    keys = [a['key'] for a in M['atlases']]
    if keys != ['gb_van_0', 'gb_bld_0']:
        err('atlases must be gb_van_0 + gb_bld_0, got %s' % keys)
    tot = 0.0
    for k, lim, mib in (('gb_van_0', (2048, 1024), 8.0), ('gb_bld_0', (1024, 1024), 2.5)):
        j, im = load_atlas(k)
        w, h = im.size
        m = w * h * 4 / 1048576.0
        tot += m
        INFO['page_' + k] = {'size': [w, h], 'MiB': round(m, 2), 'frames': len(j['frames'])}
        if w > lim[0] or h > lim[1]:
            err('%s is %dx%d (> %dx%d)' % (k, w, h, lim[0], lim[1]))
        if m > mib + 1e-6:
            err('%s is %.2f MiB (> %.1f)' % (k, m, mib))
    INFO['textureMiB'] = round(tot, 2)
    if tot > 10.5:
        err('textures %.2f MiB > 10.5' % tot)
    files = sorted(f for f in os.listdir(D) if not f.startswith('.'))
    INFO['sourceFiles'] = files
    if len(files) != 5:
        err('assets/geumbang must hold 5 source files (2 png + 2 json + manifest), has %d: %s' % (len(files), files))
    INFO['shippedFiles'] = 3
    INFO['bytes'] = sum(os.path.getsize(os.path.join(D, f)) for f in files)


def check_van(M, LG):
    red = LG['characters']['delivery_van_red']
    v = M['characters'].get('gb_van')
    if not v:
        err('gb_van missing')
        return
    for f in ('frameSize', 'anchor', 'dirs', 'mirror', 'axisDirs', 'lengthM', 'widthM', 'heightM', 'topPx',
              'shadow', 'footprintPoly', 'cargoPoint', 'doorPoints', 'exhaustPoint', 'lightPoints', 'tailPoints',
              'rearDoorPoint', 'seats', 'seatDirs', 'seatsStand', 'seatDrawOrder', 'driverSeat', 'wheels'):
        if v.get(f) != red.get(f):
            err('gb_van.%s differs from delivery_van_red' % f)
    if v.get('family') != 'delivery_van' or v.get('variant') != 'gb' or v.get('era') != 3 or v.get('role') != 'gb':
        err('gb_van family / variant / era / role')
    rep = M.get('geumbang', {}).get('report', {})
    rd = rep.get('rigDelta', {})
    if not rd or max(rd.values()) > 0.0:
        err('the gold van geometry is not 0 px from the red van points: %s' % rd)
    INFO['rigDeltaMaxPx'] = max(rd.values()) if rd else None
    an = v['anims']
    exp = {'idle': (2, 6, -1), 'move': (4, 10, -1), 'door': (3, 10, 0), 'unload': (4, 8, 0)}
    for a, (n, fps, rep_) in exp.items():
        e = an.get(a)
        if not e or e['frames'] != n or e['fps'] != fps or e.get('repeat', -1) != rep_:
            err('gb_van.anims.%s must be %d f, %d fps, repeat %d' % (a, n, fps, rep_))
    for a in ('idle', 'move'):
        if an[a].get('bobPx') != red['anims'][a]['bobPx']:
            err('gb_van.%s bobPx differs from red' % a)
    for a in ('door', 'unload'):
        if not an[a].get('patch'):
            err('gb_van.%s must be a patch' % a)
    for a in ('idle', 'move', 'door', 'unload'):
        for d in v['dirs']:
            for i in range(an[a]['frames']):
                n = '%s_%s_%d' % (a, d, i)
                if not has('gb_van_0', n):
                    err('gb_van frame %s missing' % n)
                if a in ('idle', 'move') and not has('gb_van_0', 'over_' + n):
                    err('gb_van overlay over_%s missing' % n)
    # patches: alignment + changed pixels outside the patch + erase
    for n, p in rep.get('patches', {}).items():
        if n.startswith(('door_', 'unload_')):
            if p.get('diffOutsidePct', 0) > 0.5:
                err('%s: %.2f %% of the van changed outside the patch (> 0.5 %%)' % (n, p['diffOutsidePct']))
            if p.get('erasePx', 0) > 0:
                err('%s: %d px would have to be erased (patch drawn over idle_0)' % (n, p['erasePx']))
            if p.get('touchesCanvasEdge'):
                err('%s touches the grown canvas edge (clipped door)' % n)
    INFO['vanPatchesMaxOutsidePct'] = max([p.get('diffOutsidePct', 0) for n, p in rep.get('patches', {}).items()
                                           if n.startswith(('door_', 'unload_'))] or [0])
    # the base frame must match the patch canvas: anchor of the grown canvas lands on the van anchor
    W, H = v['frameSize']
    ax, ay = v['anchor'][0] * W, v['anchor'][1] * H
    for a in ('door', 'unload'):
        fw, fh = an[a]['frameSize']
        e = (fw - W) / 2.0
        bx, by = an[a]['anchor'][0] * fw, an[a]['anchor'][1] * fh
        if abs(bx - (ax + e)) > 0.51 or abs(by - (ay + e)) > 0.51:
            err('gb_van.%s anchor does not land on the van anchor' % a)
        for d in v['dirs']:
            j = load_atlas('gb_van_0')[0]['frames']['%s_%s_0' % (a, d)]
            if j['sourceSize'] != {'w': fw, 'h': fh}:
                err('%s_%s_0 sourceSize %s != %s' % (a, d, j['sourceSize'], [fw, fh]))
    for d in v['dirs']:
        if len(v['roofSignPoint'].get(d, [])) != 2:
            err('gb_van.roofSignPoint.%s' % d)
        if len(v['parcelPoints'].get(d, [])) != 3:
            err('gb_van.parcelPoints.%s must hold 3 points' % d)
    # (polish L3) the side mark MEASURED: the projected box of the mark mesh the camera sees (gb_render), checked on
    # the pixels of idle_<dir>_0 (the box must hold the mark's cream face / sticker and its navy dot eyes)
    vis = rep.get('vanVisible', {})
    marks = {}
    for d in v['dirs']:
        mb = vis.get(d, {}).get('markBoxPx')
        if not mb:
            err('gb_van %s: no measured mark box (gb_render visibility)' % d)
            continue
        w, h = mb[2] - mb[0], mb[3] - mb[1]
        im = np.asarray(frame('gb_van_0', 'idle_%s_0' % d)).astype(np.int16)
        x0, y0 = int(round(ax + mb[0])), int(round(ay + mb[1]))
        x1, y1 = int(round(ax + mb[2])), int(round(ay + mb[3]))
        sub = im[max(0, y0):y1, max(0, x0):x1]
        op = sub[..., 3] > 200
        lab = rgb2lab(sub[..., :3][op])
        cream = (lab[:, 0] > 80) & (np.hypot(lab[:, 1], lab[:, 2]) < 16)
        navy = de2000(lab, rgb2lab(hex_rgb(NAVY))) < 16
        marks[d] = {'boxPx': [round(w, 1), round(h, 1)], 'creamPct': round(100 * float(cream.mean()), 1),
                    'navyPx': int(navy.sum())}
        if cream.mean() < 0.08 or navy.sum() < 6:
            err('gb_van %s: the measured mark box does not hold the mark on the pixels (%s)' % (d, marks[d]))
        if min(w, h) < 36:
            err('gb_van %s: van mark %.1f px < 36' % (d, min(w, h)))
        if min(w, h) * 0.6 * CSS_PER_PX < 12:
            err('gb_van %s: van mark %.1f CSS px at zoom 0.6 < 12' % (d, min(w, h) * 0.6 * CSS_PER_PX))
    INFO['vanMark'] = marks
    mpx = min([m['boxPx'][0] for m in marks.values()] or [0])
    INFO['vanMarkPx'] = mpx
    INFO['vanMarkCssAtZoom06'] = round(mpx * 0.6 * CSS_PER_PX, 2)
    # (polish H1) rear-door windows / handles stay on their leaves (Blender geometry, every unload pose)
    rp = rep.get('rearParts', {})
    INFO['rearPartsOffLeafM'] = rp.get('maxOffLeafM')
    if rp.get('maxOffLeafM') is None or rp['maxOffLeafM'] > 0.06 or rp.get('problems'):
        err('rear-door parts leave their leaves: %s' % rp)
    # (polish H1) no detached island in any patch-over-idle composite (a floating porthole / handle)
    isl = {}
    fw, fh = an['door']['frameSize']
    e = (fw - W) // 2
    for a in ('door', 'unload'):
        for d in v['dirs']:
            base = np.zeros((fh, fw), bool)
            base[e:e + H, e:e + W] = np.asarray(frame('gb_van_0', 'idle_%s_0' % d))[..., 3] > 128
            for i in range(an[a]['frames']):
                n = '%s_%s_%d' % (a, d, i)
                pt = np.asarray(frame('gb_van_0', n))[..., 3] > 128
                comp = sorted(components(base | pt), key=lambda c: -c[0])
                extra = [c for c in comp[1:] if c[0] >= 6]
                isl[n] = [c[0] for c in extra]
                if extra:
                    err('%s: %d detached island(s) of %s px over idle_%s_0 (floating parts)' % (
                        n, len(extra), [c[0] for c in extra], d))
    INFO['patchIslands'] = {k: v_ for k, v_ in isl.items() if v_}
    # (polish H2) draw order: the patch goes UNDER the riders (+0.001 in VehicleSprite) and the van overlay switches
    # to the patch's own over_<anim>_<dir>_<i>; no unchanged cab pixel of an unload patch in the rider zone
    for a in ('door', 'unload'):
        pa = an[a]
        if not (0 < pa.get('patchDepth', 1) < 0.001):
            err('gb_van.anims.%s.patchDepth must put the patch under the riders (0 < d < 0.001)' % a)
        if pa.get('overlay') != 'over_%s_{dir}_{i}' % a:
            err('gb_van.anims.%s.overlay must be over_%s_{dir}_{i}' % (a, a))
        for d in v['dirs']:
            for i in range(pa['frames']):
                n = 'over_%s_%s_%d' % (a, d, i)
                if not has('gb_van_0', n):
                    err('%s missing' % n)
                elif load_atlas('gb_van_0')[0]['frames'][n]['sourceSize'] != {'w': fw, 'h': fh}:
                    err('%s must share the patch canvas %s' % (n, [fw, fh]))
    if 0 not in an['door'].get('emptySeats', []):
        err('gb_van.anims.door.emptySeats must hold the driver seat 0')
    zone_px = {}
    for d in v['dirs']:
        z = np.zeros((fh, fw), bool)
        for f in ('seats', 'seatsStand'):
            for q in v[f][d]:
                zx, zy = int(ax + e + q[0]), int(ay + e + q[1])
                z[max(0, zy - 46):zy + 8, max(0, zx - 16):zx + 16] = True
        idle = np.zeros((fh, fw, 4), np.int16)
        idle[e:e + H, e:e + W] = np.asarray(frame('gb_van_0', 'idle_%s_0' % d)).astype(np.int16)
        for i in range(an['unload']['frames']):
            n = 'unload_%s_%d' % (d, i)
            pt = np.asarray(frame('gb_van_0', n)).astype(np.int16)
            weak = (pt[..., 3] > 0) & (np.abs(pt - idle).max(-1) <= 12) & z
            zone_px[n] = int(weak.sum())
            if weak.sum() > 3:                       # (a stray px or two of palette rounding is not a cab copy)
                err('%s: %d unchanged cab px inside the rider zone' % (n, int(weak.sum())))
    INFO['unloadRiderZoneWeakPx'] = max(zone_px.values()) if zone_px else None
    # (polish M5 / L4) visibility flags per point
    for f, src in (('parcelPointsVisible', 'parcelPoints'), ('lightsVisible', 'lightPoints'),
                   ('tailsVisible', 'tailPoints')):
        for d in v['dirs']:
            fl = v.get(f, {}).get(d)
            if not isinstance(fl, list) or len(fl) != len(v[src][d]) or not all(isinstance(b, bool) for b in fl):
                err('gb_van.%s.%s must hold one boolean per %s point' % (f, d, src))
    if not any(any(v.get('parcelPointsVisible', {}).get(d, [])) for d in v['dirs']):
        err('gb_van: no dir shows the unload parcels')
    INFO['parcelPointsVisible'] = v.get('parcelPointsVisible')


def check_turn(M):
    t = M['characters'].get('gb_van_turn')
    if not t:
        err('gb_van_turn missing')
        return
    if t['dirs'] != ['S', 'E', 'N'] or t.get('mirror') != {'W': 'E'}:
        err('gb_van_turn dirs / mirror')
    if t['frameSize'][0] > 368 or t['frameSize'][1] > 352:
        err('gb_van_turn frame %s > 368 x 352' % t['frameSize'])
    for d in t['dirs']:
        for n in ('turn_%s_0' % d, 'over_turn_%s_0' % d):
            if not has('gb_van_0', n):
                err('gb_van_turn frame %s missing' % n)
        for f in ('seats', 'seatDirs', 'seatsStand', 'seatDrawOrder', 'lightPoints', 'tailPoints', 'roofSignPoint',
                  'shadow', 'footprintPoly'):
            if d not in t.get(f, {}):
                err('gb_van_turn.%s.%s missing' % (f, d))
        for f, src in (('lightsVisible', 'lightPoints'), ('tailsVisible', 'tailPoints')):
            fl = t.get(f, {}).get(d)
            if not isinstance(fl, list) or len(fl) != len(t[src][d]):
                err('gb_van_turn.%s.%s must hold one boolean per point' % (f, d))
        # anchor = ground at the van centre: the footprint centroid is the anchor
        fp = np.array(t['footprintPoly'][d], float)
        if np.abs(fp.mean(0)).max() > 1.0:
            err('gb_van_turn %s footprint not centred on the anchor' % d)


def check_roofsign(M):
    for lang in ('ko', 'en'):
        for lit in (0, 1):
            k = 'gb_roofsign_%s_%d' % (lang, lit)
            s = M['sprites'].get(k)
            if not s:
                err(k + ' missing')
                continue
            if s['frameSize'] != [96, 56] or s['anchor'] != [0.5, 1.0] or s.get('mirror') is not False:
                err('%s must be 96 x 56, anchor [0.5, 1], never mirrored' % k)
            im = frame('gb_van_0', k)
            bb = im.getbbox()
            w = bb[2] - bb[0]
            css = w * 0.6 * CSS_PER_PX
            INFO.setdefault('roofSignCssAtZoom06', {})[k] = round(css, 2)
            if css < 30.0:
                err('%s is %.1f CSS px at zoom 0.6 (< 30)' % (k, css))
            # (polish M3) letter height of every text line (navy runs of rows; the mark's dot eyes are dropped as
            # tiny components) >= CAP_MIN px
            a = np.asarray(im).astype(np.int16)
            op = a[..., 3] > 160
            lab = rgb2lab(a[..., :3])
            nv = (np.min(np.stack([de2000(lab, rgb2lab(np.clip(hex_rgb(NAVY) * f, 0, 255))) for f in
                                   (0.6, 0.8, 1.0, 1.2)]), 0) < 14) & op & (np.hypot(lab[..., 1], lab[..., 2]) >= 15)
            keep = np.zeros_like(nv)
            for cnt, (x0, y0, x1, y1) in components(nv):
                if cnt >= 8:
                    keep[y0:y1, x0:x1] |= nv[y0:y1, x0:x1]
            rows = keep.sum(1) > 0
            for y in range(1, len(rows) - 1):            # a 1-row break inside a glyph (lit face) is not a new line
                if not rows[y] and rows[y - 1] and rows[y + 1]:
                    rows[y] = True
            runs, r0 = [], None
            for y, on in enumerate(list(rows) + [False]):
                if on and r0 is None:
                    r0 = y
                elif not on and r0 is not None:
                    runs.append(y - r0)
                    r0 = None
            runs = [r for r in runs if r >= 3]
            INFO.setdefault('roofSignLetterPx', {})[k] = runs
            if not runs or min(runs) < CAP_MIN:
                err('%s: letter lines %s px tall (< %d px: unreadable on a phone)' % (k, runs, CAP_MIN))


def check_hub(M, LG):
    C = LG['sprites']['logistics_center']
    S = M['sprites']
    # (polish M2) the 금방 hub repaints the old logistics mark: emblem / roof-parcel patches over the shell
    for k in ('gb_emblem_gable', 'gb_emblem_blade', 'gb_roofparcel'):
        s = S.get(k)
        if not s:
            err(k + ' missing (the 금방 hub would keep the winged-parcel / red-ribbon marks)')
            continue
        if s['frameSize'] != C['frameSize'] or s['anchor'] != C['anchor'] or s.get('kind') != 'patch' or \
                s.get('of') != 'logistics_center' or not (0 < s.get('depthOffset', 0) < 0.0005):
            err('%s frame / anchor / kind / depthOffset' % k)
        if not has('gb_bld_0', s['frame']):
            err('%s frame missing' % k)
            continue
        a = np.asarray(frame('gb_bld_0', s['frame']))[..., 3] > 0
        INFO.setdefault('hubPatchPx', {})[k] = int(a.sum())
        if a.sum() < 200:
            err('%s holds only %d px' % (k, int(a.sum())))
    for k in ('gb_nameplate_ko', 'gb_nameplate_en', 'seori_nameplate_ko', 'seori_nameplate_en'):
        s = S.get(k)
        if not s:
            err(k + ' missing')
            continue
        lang = k[-2:]
        if s['frameSize'] != C['frameSize'] or s['anchor'] != C['anchor']:
            err('%s frame / anchor differ from logistics_center' % k)
        if s.get('kind') != 'layer' or s.get('replaces') != 'nameplate_' + lang or s.get('depthOffset') != 0.0005:
            err('%s kind / replaces / depthOffset' % k)
        # letters inside nameBoard (137 x 43 px, shear 0.5) around nameBoard.point
        im = frame('gb_bld_0', k)
        a = np.asarray(im)[..., 3] > 40
        ys, xs = np.nonzero(a)
        ax, ay = C['anchor'][0] * C['frameSize'][0], C['anchor'][1] * C['frameSize'][1]
        nb = C['nameBoard']
        px, py = xs - ax - nb['point'][0], ys - ay - nb['point'][1]
        py_unsheared = py - nb['shearY'] * px
        out = ((np.abs(px) > nb['widthPx'] / 2 + 2) | (np.abs(py_unsheared) > nb['heightPx'] / 2 + 3)).sum()
        INFO.setdefault('nameplatePxOutsideBoard', {})[k] = int(out)
        if out > 0:
            err('%s: %d px outside nameBoard' % (k, out))
    for lang in ('ko', 'en'):
        k = 'gb_banner_' + lang
        s = S.get(k)
        if not s:
            err(k + ' missing')
            continue
        if s.get('kind') != 'patch' or s.get('depthOffset') != 0.0012 or s['anims']['sway']['fps'] != 5 or \
                len(s['anims']['sway']['frames']) != 4 or s['anims']['sway']['repeat'] != -1:
            err('%s kind / depthOffset / sway' % k)
    # banner clear of dock 1, the dock lamps, the loading sign and the name board
    ax, ay = C['anchor'][0] * C['frameSize'][0], C['anchor'][1] * C['frameSize'][1]
    ban = np.zeros(C['frameSize'][::-1], bool)
    for lang in ('ko', 'en'):
        for n in S['gb_banner_' + lang]['anims']['sway']['frames']:
            ban |= np.asarray(frame('gb_bld_0', n))[..., 3] > 60
    import importlib
    lp = importlib.import_module('gb_preview')
    occ = {}
    d1 = np.asarray(lp.frame(lp.lgx_atlas('logistics_center_dock1_5'), 'logistics_center_dock1_5'))[..., 3] > 60
    d1 |= np.asarray(lp.frame(lp.lgx_atlas('logistics_center_dock1_0'), 'logistics_center_dock1_0'))[..., 3] > 60
    occ['dock1'] = int((ban & d1).sum())
    for op in C['outdoorProps']:
        if op['sprite'].endswith(('docklight', 'loadsign')):
            sp = LG['sprites'][op['sprite']]
            im = lp.frame(lp.lgx_atlas(op['sprite']), op['sprite'])
            m = np.zeros_like(ban)
            x0 = int(round(ax + op['point'][0] - sp['anchor'][0] * im.width))
            y0 = int(round(ay + op['point'][1] - sp['anchor'][1] * im.height))
            a = np.asarray(im)[..., 3] > 200          # the prop itself, not its soft ground shadow
            hh, ww = a.shape
            xs0, ys0 = max(0, x0), max(0, y0)
            xs1, ys1 = min(m.shape[1], x0 + ww), min(m.shape[0], y0 + hh)
            m[ys0:ys1, xs0:xs1] = a[ys0 - y0:ys1 - y0, xs0 - x0:xs1 - x0]
            occ[op['name']] = int((ban & m).sum())
    nb = C['nameBoard']
    ys, xs = np.nonzero(ban)
    px, py = xs - ax - nb['point'][0], ys - ay - nb['point'][1]
    occ['nameBoard'] = int(((np.abs(px) <= nb['widthPx'] / 2 + 4) &
                            (np.abs(py - nb['shearY'] * px) <= nb['heightPx'] / 2 + 4)).sum())
    INFO['bannerOverlapPx'] = occ
    for k, v in occ.items():
        if v > 0:
            err('gb_banner overlaps %s by %d px' % (k, v))


PROP_MAX = {'gb_sign': (128, 288), 'gb_flag': (128, 224), 'gb_locker_a': (208, 224), 'gb_locker_b': (208, 224)}


def check_props_items(M, LG):
    S = M['sprites']
    for k, (mw, mh) in PROP_MAX.items():
        s = S.get(k)
        if not s:
            err(k + ' missing')
            continue
        if s['frameSize'][0] > mw or s['frameSize'][1] > mh:
            err('%s frame %s > [%d, %d]' % (k, s['frameSize'], mw, mh))
        if s.get('shadow') != 'baked' or not s.get('footprintPoly') or s.get('topPx') is None:
            err('%s needs a baked shadow, footprintPoly and topPx' % k)
        for an, e in s.get('anims', {}).items():
            for n in e['frames']:
                if not has('gb_bld_0', n):
                    err('%s.%s frame %s missing' % (k, an, n))
    if S['gb_flag']['anims']['wave']['fps'] != 8 or len(S['gb_flag']['anims']['wave']['frames']) != 6:
        err('gb_flag wave must be 6 f at 8 fps')
    for k in ('gb_locker_a', 'gb_locker_b'):
        s = S[k]
        op = s['anims']['open']
        if len(op['frames']) != 4 or op['fps'] != 12 or op['repeat'] != 0 or not op.get('patch'):
            err('%s open must be 4 f, 12 fps, once, patches' % k)
        if len(s.get('slotPoints', [])) != 12 or not (0 <= s.get('openSlot', -1) < 12):
            err('%s slotPoints / openSlot' % k)
        for f in ('standPoint', 'standDir', 'fillPoint', 'fillDir'):
            if f not in s:
                err('%s.%s missing' % (k, f))
    if S['gb_locker_a'].get('faces') != 'SW' or S['gb_locker_b'].get('faces') != 'SE':
        err('gb_locker_a faces SW, gb_locker_b faces SE')
    lg = LG['sprites']
    for k in ('gb_parcel_s', 'gb_parcel_m', 'gb_parcel_l', 'gb_parcel_doorstep', 'gb_parcel_open', 'gb_parcel_cat'):
        s = S.get(k)
        if not s:
            (warn if k == 'gb_parcel_cat' else err)(k + ' missing')
            continue
        if s['frameSize'] != [72, 72] or s['anchor'] != [0.5, 0.75] or not s.get('icon'):
            err('%s must be 72 x 72, anchor [0.5, 0.75], icon' % k)
        for f in ('stackStep', 'carryScale', 'topPx', 'sizeClass'):
            if s.get(f) is None:
                err('%s.%s missing' % (k, f))
        if s.get('boxOf') and s.get('sizeClass') != lg[s['boxOf']]['sizeClass']:
            err('%s sizeClass != %s' % (k, s['boxOf']))
    for k, b in (('gb_parcel_s', 'cardboard_box_s'), ('gb_parcel_m', 'cardboard_box_m'), ('gb_parcel_l', 'cardboard_box_l')):
        if S[k].get('boxOf') != b:
            err('%s.boxOf must be %s' % (k, b))
    if len(S['gb_parcel_doorstep']['anims']['idle']['frames']) != 2:
        err('gb_parcel_doorstep needs f0 + f1 (snow cap)')
    p = S.get('gb_pennant')
    if not p:
        err('gb_pennant missing')
        return
    if p['frameSize'] != [48, 56] or p['anims']['flutter']['frames'] != 4 or p['anims']['flutter']['fps'] != 10:
        err('gb_pennant must be 48 x 56, flutter 4 f at 10 fps')
    for d in ('SE', 'NE'):
        for i in range(4):
            if not has('gb_bld_0', 'gb_pennant_%s_%d' % (d, i)):
                err('gb_pennant_%s_%d missing' % (d, i))
        sp = p['sledPennant'].get(d, {})
        if len(sp.get('idle', [])) != 4 or len(sp.get('move', [])) != 8:
            err('sledPennant.%s needs idle 4 / move 8' % d)
    # (polish M4) explicit SW / NW tables for Phaser's centre flip: x = -x(SE / NE) + sled shift - pennant shift
    VH = json.load(open(os.path.join(A, 'vehicles', 'manifest.json'), encoding='utf-8'))
    ds = VH['characters']['dog_sled']
    ss = ds['frameSize'][0] - 2 * ds['anchor'][0] * ds['frameSize'][0]
    spn = p['frameSize'][0] - 2 * p['anchor'][0] * p['frameSize'][0]
    for d, src in (('SW', 'SE'), ('NW', 'NE')):
        for an_ in ('idle', 'move'):
            got = p['sledPennant'].get(d, {}).get(an_)
            want = [[int(round(-q[0] + ss - spn)), q[1]] for q in p['sledPennant'][src][an_]]
            if got != want:
                err('sledPennant.%s.%s must be the centre-flip mirror of %s (%s != %s)' % (d, an_, src, got, want))
    INFO['mirrorShift'] = {'dog_sled': round(ss, 2), 'gb_pennant': round(spn, 2)}


def check_brand(M):
    S = M['sprites']
    import gb_mark_thumbs as MT
    for sz in (96, 24):
        im = np.asarray(MT.mark(sz)).astype(np.int16)
        mir = im[:, ::-1]
        diff = (np.abs(im - mir).max(-1) > 24).sum() / float((im[..., 3] > 0).sum())
        INFO['markMirrorDiffPct_%d' % sz] = round(100 * diff, 2)
        if diff > 0.06:
            err('the mark (%d px) differs from its mirror by %.1f %%' % (sz, 100 * diff))
    tex = os.environ.get('GB_CACHE')
    # navy share + colour pairs on every shipped sprite frame
    # (polish L2 / L3) navy counted wide: lit AND shaded navy (x 0.5 .. 1.2, chroma >= 12), as a viewer sees it
    shades = [rgb2lab(np.clip(hex_rgb(NAVY) * f, 0, 255)) for f in (0.5, 0.65, 0.8, 1.0, 1.2)]
    pairs = {k: (rgb2lab(hex_rgb(a)), rgb2lab(hex_rgb(b))) for k, (a, b) in BRAND_PAIRS.items()}
    shares, pairs_out = {}, {}
    names = []
    for k in ('gb_van', 'gb_van_turn'):
        c = M['characters'][k]
        for a, e in c['anims'].items():
            if e.get('patch'):
                continue
            for d in c['dirs']:
                for i in range(e['frames']):
                    names.append(('gb_van_0', ('turn_%s_0' % d) if k == 'gb_van_turn' else '%s_%s_%d' % (a, d, i), k))
    letters_only = set()
    for k, s in S.items():
        names.append((s['atlas'], s['frame'], k))
        if s.get('kind') == 'layer' and s.get('of') == 'logistics_center':
            letters_only.add(s['frame'])               # nameplates: raised letters only (their navy IS the layer)
    for atlas, n, key in names:
        im = frame(atlas, n)
        px = opaque_px(im, 240)            # baked soft shadows (alpha <= 216) are not paint
        if len(px) < 30:
            continue
        lab = rgb2lab(px)
        dmin = np.min(np.stack([de2000(lab, s) for s in shades]), 0)
        chroma = np.hypot(lab[:, 1], lab[:, 2])
        share = float(((dmin < 12) & (chroma >= 12)).mean())    # navy paint, not the grey charcoal
        if n not in letters_only:
            shares[n] = round(100 * share, 1)
            if share > 0.15:
                err('%s: navy is %.1f %% of the opaque px (> 15 %%)' % (n, 100 * share))
        fam = families(px)
        if len(fam) < 2 or fam[1][1] < 0.08:
            continue                                   # one colour family (letters-only layers): no pair
        cent = [fam[0][0], fam[1][0]]
        for b, (p1, p2) in pairs.items():
            d11, d22 = de2000(cent[0], p1), de2000(cent[1], p2)
            d12, d21 = de2000(cent[0], p2), de2000(cent[1], p1)
            if (d11 < 15 and d22 < 15) or (d12 < 15 and d21 < 15):
                err('%s: its two largest colour areas sit within dE 15 of the %s pair' % (n, b))
            pairs_out.setdefault(n, {})[b] = round(float(min(max(d11, d22), max(d12, d21))), 1)
    INFO['navySharePct'] = shares
    INFO['navyShareMaxPct'] = max(shares.values()) if shares else 0
    INFO['brandPairMinDE'] = {n: min(v.values()) for n, v in pairs_out.items()}
    INFO['brandPairMinDEAll'] = round(min(INFO['brandPairMinDE'].values()), 1) if pairs_out else None
    # letters only in the listed keys, never on mirrored sprites
    for k, s in S.items():
        if s.get('hasText') and k not in TEXT_KEYS:
            err('%s carries letters but is not a text key' % k)
    for k in MIRRORED:
        e = M['characters'].get(k) or S.get(k) or {}
        if e.get('hasText'):
            err('%s is mirrored and must not carry letters' % k)
    del tex


def check_collisions(M):
    mine = set(M['sprites']) | set(M['characters'])
    hits = []
    for d in sorted(os.listdir(A)):
        p = os.path.join(A, d, 'manifest.json')
        if d == 'geumbang' or not os.path.exists(p):
            continue
        try:
            o = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        for sec in ('sprites', 'characters'):
            for k in o.get(sec, {}) if isinstance(o.get(sec), dict) else []:
                if k in mine:
                    hits.append('%s (%s)' % (k, d))
    for h in hits:
        err('key collision: ' + h)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    M = json.load(open(os.path.join(D, 'manifest.json'), encoding='utf-8'))
    LG = json.load(open(os.path.join(A, 'logistics', 'manifest.json'), encoding='utf-8'))
    if M.get('brand') != {'gold': '#F2B33D', 'goldDark': '#D9962A', 'cream': '#F4EDE0', 'charcoal': '#3B3F52',
                          'navy': '#2B4F7E'}:
        err('manifest.brand must be the contract colours')
    check_pages(M)
    check_van(M, LG)
    check_turn(M)
    check_roofsign(M)
    check_hub(M, LG)
    check_props_items(M, LG)
    check_brand(M)
    check_collisions(M)
    out = {'errors': ERR, 'warnings': WARN, 'info': INFO}
    if '--json' in argv:
        p = argv[argv.index('--json') + 1]
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(out, open(p, 'w'), indent=1, ensure_ascii=False)
    for k in ('page_gb_van_0', 'page_gb_bld_0', 'textureMiB', 'rigDeltaMaxPx', 'vanPatchesMaxOutsidePct',
              'vanMark', 'vanMarkCssAtZoom06', 'roofSignCssAtZoom06', 'roofSignLetterPx', 'rearPartsOffLeafM',
              'patchIslands', 'unloadRiderZoneWeakPx', 'parcelPointsVisible', 'mirrorShift', 'hubPatchPx',
              'navyShareMaxPct', 'brandPairMinDEAll', 'bannerOverlapPx', 'nameplatePxOutsideBoard',
              'markMirrorDiffPct_96', 'markMirrorDiffPct_24'):
        print('%-26s %s' % (k, INFO.get(k)))
    for w in WARN:
        print('WARNING', w)
    for e in ERR:
        print('ERROR', e)
    print('gb_check: %d error(s), %d warning(s)' % (len(ERR), len(WARN)))
    return 1 if ERR else 0


if __name__ == '__main__':
    sys.exit(main())
