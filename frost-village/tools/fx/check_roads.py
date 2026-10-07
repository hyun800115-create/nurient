"""
check_roads.py - validates assets/roads/ (CONTRACT_V5 §N) built by tools/fx/gen_roads.py.

Re-run (from anywhere; exit code 0 = no errors, 1 = errors):
    python3 frost-village/tools/fx/check_roads.py
Checks:
  * manifest parses; every path is relative to assets/ and lives in assets/roads/; files exist; nothing unreferenced;
    roadKit spec present
  * every CONTRACT_V5 §N key resolves (+ the documented extras: near / variant / corner pieces)
  * textures: 512x512, opaque, seamless in x and y (same seam test as check_assets.py), clearly different from
    ground_snow; grid alignment: sidewalk slab joints on the half-cell lines, dirt ruts on lane centre +-0.75 m
    (road_dirt along X, road_dirt_y along Y, both in road_dirt_cross)
  * pieces: frames untrimmed in the atlas, integer anchorPx == anchor * frameSize, transparent frame borders,
    straight pieces chained 4x (variants mixed) never overlap; corner pieces meet the adjacent straight pieces without
    overlap; markings visible on road_asphalt
  * exact join tests against the generator (imports gen_roads read-only): three chained 1-cell pieces == one
    continuous 3-cell strip at the same lattice phase; every variant == its base piece next to the cut lines; every
    corner piece == the adjacent straight piece next to their shared cut line (anti-aliasing fringe excluded)
  * payload of assets/roads <= 2.5 MB
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
FOLDER = 'roads'
sys.path.insert(0, HERE)
import check_assets as CA                               # noqa: E402  (read-only reuse of seam_ratio)

PAYLOAD_MAX = int(2.5 * 1024 * 1024)
CONTRACT = ['road_dirt', 'road_cobble_wide', 'road_asphalt', 'sidewalk', 'curb_x', 'curb_y', 'lane_x', 'lane_y',
            'crosswalk_x', 'crosswalk_y', 'intersection', 'stall_lines']
TEXTURES = ['road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'road_asphalt', 'sidewalk']
STRAIGHT = ['curb_x', 'curb_x_near', 'curb_y', 'curb_y_near', 'snow_edge_x', 'snow_edge_x_near', 'snow_edge_y',
            'snow_edge_y_near']
CORNERS = ['%s_%s' % (f, q) for f in ('curb_corner', 'curb_inner', 'snow_corner', 'snow_inner') for q in 'nesw']
MARKINGS = ['lane_x', 'lane_y', 'crosswalk_x', 'crosswalk_y', 'stall_lines', 'stall_lines_y']
SIDES = {'e': (1, 1), 's': (1, -1), 'w': (-1, -1), 'n': (-1, 1)}

errors, warns, notes = [], [], []


def err(m):
    errors.append(m)


def warn(m):
    warns.append(m)


def lum(a):
    a = np.asarray(a, np.float32)
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def recon(R):
    """Render each straight family once as a continuous strip 3 cells long (monkeypatched frame / partition) and as
    three chained 1-cell pieces at the same lattice phase; inside the middle 2 cells (which contain two cut lines)
    the premultiplied pixels must agree."""
    sf, sk = R.straight_frame, R.straight_keep
    try:
        singles = {}
        for fam, fn in (('curb', R.curb_straight), ('snow_edge', R.snow_straight)):
            for axis in 'xy':
                for far in (True, False):
                    singles[(fam, axis, far)] = fn(axis, far, 0)

        def long_frame(axis, vmin, vmax, lift=0.0, pad=3):
            h = 1.5 * R.CELL_M
            pts = [((u, v) if axis == 'x' else (v, u)) for u in (-h, h) for v in (vmin, vmax)]
            return R.Frame(pts, pad, lift)
        R.straight_frame = long_frame
        R.straight_keep = lambda fr, axis: np.ones((fr.h, fr.w), bool)
        for (fam, axis, far), (img1, fr1) in singles.items():
            fn = R.curb_straight if fam == 'curb' else R.snow_straight
            imgL, frL = fn(axis, far, 0)
            L = np.asarray(imgL).astype(np.float32)
            chain = Image.new('RGBA', (frL.w, frL.h), (0, 0, 0, 0))
            step = (64, 32) if axis == 'x' else (64, -32)
            for n in (-1, 0, 1):
                chain.alpha_composite(img1, (frL.ax + n * step[0] - fr1.ax, frL.ay + n * step[1] - fr1.ay))
            Cn = np.asarray(chain).astype(np.float32)
            ys, xs = np.mgrid[0:frL.h, 0:frL.w].astype(np.float32) + 0.5
            q = (xs - frL.ax) + 2 * (ys - frL.ay) if axis == 'x' else (xs - frL.ax) - 2 * (ys - frL.ay)
            inner = np.abs(q) < 128 - 3
            pmL = np.dstack([L[..., :3] * L[..., 3:4] / 255, L[..., 3:4]])
            pmC = np.dstack([Cn[..., :3] * Cn[..., 3:4] / 255, Cn[..., 3:4]])
            d = np.abs(pmL - pmC).max(-1)[inner]
            key = ('curb_' if fam == 'curb' else 'snow_edge_') + axis + ('' if far else '_near')
            if d.max() > 3.0:
                err('%s: chained pieces differ from the continuous strip (max %.1f, mean %.2f) - visible seam'
                    % (key, d.max(), d.mean()))
            notes.append('%-17s continuous-strip reconstruction: max diff %.2f / 255' % (key, d.max()))
    finally:
        R.straight_frame, R.straight_keep = sf, sk
    # corner pieces must continue the straight pieces exactly next to the cut lines they share
    corner_x = {('curb_corner', 1, 1): 'x_far', ('curb_corner', -1, 1): 'x_far', ('curb_corner', -1, -1): 'x_near',
                ('curb_corner', 1, -1): 'x_near', ('curb_inner', 1, 1): 'x_near', ('curb_inner', -1, 1): 'x_near',
                ('curb_inner', -1, -1): 'x_far', ('curb_inner', 1, -1): 'x_far'}
    corner_y = {('curb_corner', 1, 1): 'y_near', ('curb_corner', -1, 1): 'y_far', ('curb_corner', -1, -1): 'y_far',
                ('curb_corner', 1, -1): 'y_near', ('curb_inner', 1, 1): 'y_far', ('curb_inner', -1, 1): 'y_near',
                ('curb_inner', -1, -1): 'y_near', ('curb_inner', 1, -1): 'y_far'}
    R.straight_keep = lambda fr, axis: np.ones((fr.h, fr.w), bool)
    try:
        for fam in ('curb_corner', 'curb_inner', 'snow_corner', 'snow_inner'):
            for qd, (sx, sy) in SIDES.items():
                inner = fam.endswith('inner')
                cimg, cfr = (R.curb_corner if fam.startswith('curb') else R.snow_corner)(qd, inner)
                C = np.asarray(cimg).astype(np.float32)
                ys, xs = np.mgrid[0:cfr.h, 0:cfr.w].astype(np.float32) + 0.5
                pa, qb = sx * ((xs - cfr.ax) + 2 * (ys - cfr.ay)), sy * ((xs - cfr.ax) - 2 * (ys - cfr.ay))
                cfam = 'curb_corner' if fam in ('curb_corner', 'snow_corner') else 'curb_inner'
                worst = 0.0
                for axis, side, band, off in (('x', corner_x[(cfam, sx, sy)], (pa > 128 - 18) & (pa < 128),
                                               (sx * 32, sx * 16)),
                                              ('y', corner_y[(cfam, sx, sy)], (qb > 128 - 18) & (qb < 128),
                                               (sy * 32, -sy * 16))):
                    far = side.endswith('far')
                    fn = R.curb_straight if fam.startswith('curb') else R.snow_straight
                    simg, sfr = fn(axis, far, 0)
                    S_ = np.zeros_like(C)
                    canvas = Image.new('RGBA', (cfr.w, cfr.h), (0, 0, 0, 0))
                    canvas.alpha_composite(simg, (cfr.ax + off[0] - sfr.ax, cfr.ay + off[1] - sfr.ay)) \
                        if (0 <= cfr.ax + off[0] - sfr.ax and 0 <= cfr.ay + off[1] - sfr.ay) else None
                    if not (0 <= cfr.ax + off[0] - sfr.ax and 0 <= cfr.ay + off[1] - sfr.ay):
                        big = Image.new('RGBA', (cfr.w + 400, cfr.h + 400), (0, 0, 0, 0))
                        big.alpha_composite(simg, (200 + cfr.ax + off[0] - sfr.ax, 200 + cfr.ay + off[1] - sfr.ay))
                        canvas = big.crop((200, 200, 200 + cfr.w, 200 + cfr.h))
                    S_ = np.asarray(canvas).astype(np.float32)
                    op = S_[..., 3] >= 250                      # erode 2 px: skip the anti-aliasing fringe, whose
                    for _ in range(2):                            # colour legitimately depends on what lies beneath
                        op = op & np.roll(op, 1, 0) & np.roll(op, -1, 0) & np.roll(op, 1, 1) & np.roll(op, -1, 1)
                    sel = band & op
                    if sel.any():
                        worst = max(worst, float(np.abs(C[..., :3] - S_[..., :3]).max(-1)[sel].max()))
                key = '%s_%s' % (fam, qd)
                if worst > 6:
                    err('%s does not continue the straight pieces at its cut lines (max diff %.1f)' % (key, worst))
                notes.append('%-15s joins straights: max diff %.1f' % (key, worst))
    finally:
        R.straight_keep = sk
    # variants must equal the base piece near the cut lines (so any mix of variants joins seamlessly)
    for (fam, axis, far), (img0, fr0) in singles.items():
        fn = R.curb_straight if fam == 'curb' else R.snow_straight
        a0 = np.asarray(img0).astype(np.float32)
        ys, xs = np.mgrid[0:fr0.h, 0:fr0.w].astype(np.float32) + 0.5
        q = (xs - fr0.ax) + 2 * (ys - fr0.ay) if axis == 'x' else (xs - fr0.ax) - 2 * (ys - fr0.ay)
        band = (np.abs(q) > 64 - 10) & (np.abs(q) < 64)
        for v in (1, 2):
            av = np.asarray(fn(axis, far, v)[0]).astype(np.float32)
            pm0 = np.dstack([a0[..., :3] * a0[..., 3:4] / 255, a0[..., 3:4]])
            pmv = np.dstack([av[..., :3] * av[..., 3:4] / 255, av[..., 3:4]])
            dmax = np.abs(pm0 - pmv).max(-1)[band].max()
            key = ('curb_' if fam == 'curb' else 'snow_edge_') + axis + ('' if far else '_near')
            if dmax > 3.0:
                err('%s_%d differs from %s next to its cut lines (max %.1f): variants would show a seam' % (key, v, key,
                                                                                                          dmax))


def main():
    mp = os.path.join(ASSETS, FOLDER, 'manifest.json')
    if not os.path.exists(mp):
        print('check_roads: manifest missing')
        return 1
    with open(mp, encoding='utf-8') as f:
        m = json.load(f)
    if 'roadKit' not in m or 'cellPx' not in m['roadKit']:
        err('manifest.roadKit (composition spec) missing')
    used = {'manifest.json'}
    imgs = {}
    for e in m.get('images', []):
        p = e.get('png', '')
        if not p.startswith(FOLDER + '/') or '..' in p:
            err('image %s path %r not inside assets/%s/' % (e.get('key'), p, FOLDER))
            continue
        fp = os.path.join(ASSETS, p)
        if not os.path.exists(fp):
            err('missing file %s' % p)
            continue
        used.add(os.path.basename(p))
        imgs[e['key']] = fp
    atlas = {}
    sheet = None
    for a in m.get('atlases', []):
        for fld in ('png', 'json'):
            p = a.get(fld, '')
            if not p.startswith(FOLDER + '/'):
                err('atlas %s %s path %r not inside assets/%s/' % (a.get('key'), fld, p, FOLDER))
            elif not os.path.exists(os.path.join(ASSETS, p)):
                err('missing file %s' % p)
            used.add(os.path.basename(p))
        with open(os.path.join(ASSETS, a['json']), encoding='utf-8') as f:
            js = json.load(f)
        sheet = Image.open(os.path.join(ASSETS, a['png'])).convert('RGBA')
        if (js['meta']['size']['w'], js['meta']['size']['h']) != sheet.size:
            err('atlas meta.size != png size')
        atlas = js['frames']
    for f in sorted(os.listdir(os.path.join(ASSETS, FOLDER))):
        if f not in used:
            warn('assets/%s/%s is not referenced by the manifest' % (FOLDER, f))
    S = m.get('sprites', {})
    for k in CONTRACT + TEXTURES + STRAIGHT + CORNERS + MARKINGS:
        if k not in S:
            err('sprites[%s] missing' % k)

    # ------------------------------------------------------------------ textures
    snow = np.asarray(Image.open(os.path.join(ASSETS, 'ground', 'ground_snow.png')).convert('RGB'), np.float32)
    snow_l = lum(snow).mean()
    tex = {}
    for k in TEXTURES:
        if k not in S or S[k].get('image') not in imgs:
            continue
        im = Image.open(imgs[S[k]['image']])
        a = np.asarray(im.convert('RGBA'))
        if im.size != (512, 512):
            err('%s is %s, expected 512x512' % (k, im.size))
        if a[..., 3].min() < 255:
            err('%s is not opaque' % k)
        rgb = a[..., :3].astype(np.float32)
        tex[k] = rgb
        sx, sy = CA.seam_ratio(rgb, 1), CA.seam_ratio(rgb, 0)
        if max(sx, sy) > 1.5:
            err('%s seam ratio x %.2f / y %.2f (> 1.5: visible seam)' % (k, sx, sy))
        dl = snow_l - lum(rgb).mean()
        if dl < 12:
            err('%s too close to ground_snow (luminance only %.1f darker)' % (k, dl))
        notes.append('%-17s seam x %.2f y %.2f, %5.1f darker than snow' % (k, sx, sy, dl))
        if S[k].get('tile') != 'xy':
            err('%s.tile should be "xy"' % k)
    ys, xs = np.mgrid[0:512, 0:512].astype(np.float32) + 0.5
    A, B = xs + 2 * ys, xs - 2 * ys
    if 'sidewalk' in tex:
        L = lum(tex['sidewalk'])
        da = np.minimum(np.mod(A, 64), 64 - np.mod(A, 64))
        db = np.minimum(np.mod(B, 64), 64 - np.mod(B, 64))
        joint = (np.minimum(da, db) < 2.5)
        mid = (np.minimum(da, db) > 12)
        if not L[mid].mean() - L[joint].mean() > 3.0 and abs(L[mid].mean() - L[joint].mean()) < 3.0:
            err('sidewalk slab joints are not on the half-cell grid (joint %.1f vs slab %.1f)' % (L[joint].mean(),
                                                                                                L[mid].mean()))
        notes.append('sidewalk joints on grid: slab %.1f / joint %.1f' % (L[mid].mean(), L[joint].mean()))
    for k, Q in (('road_dirt', B), ('road_dirt_y', A)):
        if k not in tex:
            continue
        L = lum(tex[k])
        t = np.mod(Q, 256) - 128
        rut = (np.abs(np.abs(t) - 68) < 8)
        mid = (np.abs(t) < 18) | (np.abs(t) > 112)
        diff = L[mid].mean() - L[rut].mean()
        if diff < 4:
            err('%s: ruts not on the lane centres +-0.75 m (rut %.1f vs between %.1f)' % (k, L[rut].mean(),
                                                                                       L[mid].mean()))
        Qo = A if k == 'road_dirt' else B                       # the other axis must NOT show the pattern
        to = np.mod(Qo, 256) - 128
        diff_o = L[(np.abs(to) < 18) | (np.abs(to) > 112)].mean() - L[np.abs(np.abs(to) - 68) < 8].mean()
        if abs(diff_o) > diff * 0.4:
            err('%s: rut pattern also appears along the other axis' % k)
        notes.append('%s ruts: %.1f darker than lane centre/edges (other axis %.1f)' % (k, diff, diff_o))
    if 'road_dirt_cross' in tex:
        L = lum(tex['road_dirt_cross'])
        for Q in (A, B):
            t = np.mod(Q, 256) - 128
            if L[(np.abs(t) < 18) | (np.abs(t) > 112)].mean() - L[np.abs(np.abs(t) - 68) < 8].mean() < 2.5:
                err('road_dirt_cross: missing ruts along one axis')

    # ------------------------------------------------------------------ pieces
    frames = {}
    for k, s in S.items():
        if s.get('kind') != 'decal':
            continue
        fr = atlas.get(s.get('frame'))
        if fr is None:
            err('%s: frame not in atlas' % k)
            continue
        r, sss, so = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
        if sss['x'] or sss['y'] or (r['w'], r['h']) != (so['w'], so['h']):
            err('%s: frame is trimmed (pieces must be untrimmed)' % k)
        if [so['w'], so['h']] != s.get('frameSize'):
            err('%s: frameSize %s != atlas %s' % (k, s.get('frameSize'), (so['w'], so['h'])))
        ap = s.get('anchorPx')
        if not (isinstance(ap, list) and all(isinstance(v, int) for v in ap)):
            err('%s: anchorPx must be integer pixels' % k)
            continue
        if abs(s['anchor'][0] * so['w'] - ap[0]) > 0.01 or abs(s['anchor'][1] * so['h'] - ap[1]) > 0.01:
            err('%s: anchor %s does not match anchorPx %s' % (k, s['anchor'], ap))
        img = np.asarray(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])))
        frames[k] = (img, ap)
        border = max(img[0, :, 3].max(), img[-1, :, 3].max(), img[:, 0, 3].max(), img[:, -1, 3].max())
        if border > 8:
            err('%s touches its frame border (alpha %d): content clipped' % (k, border))
        if img[..., 3].max() < 200:
            err('%s looks empty' % k)
        for v in s.get('variants', []):
            if v not in S:
                err('%s: variant %s missing' % (k, v))

    def canvas_put(cv, owner, idx, key, x, y):
        img, ap = frames[key]
        x0, y0 = int(x - ap[0]), int(y - ap[1])
        h, w = img.shape[:2]
        sub = cv[y0:y0 + h, x0:x0 + w]
        a = img[..., 3:4].astype(np.float32) / 255
        sub[..., :3] = sub[..., :3] * (1 - a) + img[..., :3] * a
        sub[..., 3:4] = sub[..., 3:4] * (1 - a) + a
        o = owner[y0:y0 + h, x0:x0 + w]
        hit = img[..., 3] > 0
        clash = hit & (o >= 0) & (o != idx)
        o[hit] = idx
        return int(clash.sum())

    # straight pieces: chain 4 copies with mixed variants -> no overlap, no seam
    for base in STRAIGHT:
        if base not in frames:
            continue
        axis = 'x' if '_x' in base else 'y'
        step = (64, 32) if axis == 'x' else (64, -32)
        keys = [base, base + '_1', base + '_2', base]
        if not all(k in frames for k in keys):
            continue
        cv = np.zeros((600, 700, 4), np.float32)
        owner = np.full((600, 700), -1, np.int32)
        clashes = 0
        for n, k in enumerate(keys):
            clashes += canvas_put(cv, owner, n, k, 150 + n * step[0], 300 + n * step[1])
        if clashes:
            err('%s: chained pieces overlap on %d px' % (base, clashes))
        r = 0.0
        notes.append('%-17s chain of 4 (variants mixed): no overlap' % base)

    # corners vs adjacent straights: no overlap
    piece_for = {('curb_corner', 1, 1): ('curb_x', 'curb_y_near'), ('curb_corner', -1, 1): ('curb_x', 'curb_y'),
                 ('curb_corner', -1, -1): ('curb_x_near', 'curb_y'), ('curb_corner', 1, -1): ('curb_x_near', 'curb_y_near'),
                 ('curb_inner', 1, 1): ('curb_x_near', 'curb_y'), ('curb_inner', -1, 1): ('curb_x_near', 'curb_y_near'),
                 ('curb_inner', -1, -1): ('curb_x', 'curb_y_near'), ('curb_inner', 1, -1): ('curb_x', 'curb_y')}
    for fam in ('curb_corner', 'curb_inner', 'snow_corner', 'snow_inner'):
        for q, (sx, sy) in SIDES.items():
            key = '%s_%s' % (fam, q)
            if key not in frames:
                continue
            cfam = 'curb_corner' if fam in ('curb_corner', 'snow_corner') else 'curb_inner'
            xk, yk = piece_for[(cfam, sx, sy)]
            if fam.startswith('snow'):
                xk, yk = xk.replace('curb', 'snow_edge'), yk.replace('curb', 'snow_edge')
            cv = np.zeros((700, 900, 4), np.float32)
            owner = np.full((700, 900), -1, np.int32)
            P = (450, 350)
            clashes = canvas_put(cv, owner, 0, key, *P)
            for n in range(1, 3):             # X edge pieces leaving toward sx (first piece starts one cell away)
                i = sx * n if sx > 0 else -n - 1
                x, y = P[0] + 64 * i + 32, P[1] + 32 * i + 16
                clashes += canvas_put(cv, owner, n, xk, x, y)
            for n in range(1, 3):
                j = sy * n if sy > 0 else -n - 1
                x, y = P[0] + 64 * j + 32, P[1] - 32 * j - 16
                clashes += canvas_put(cv, owner, 10 + n, yk, x, y)
            if clashes:
                err('%s overlaps its adjacent straight pieces on %d px' % (key, clashes))

    # exact reconstruction: a continuous 2-cell strip rendered by the generator == the chain of 1-cell pieces
    try:
        import gen_roads as R
        recon(R)
    except ImportError as e:
        warn('reconstruction test skipped (%s)' % e)

    # markings visible on asphalt
    if 'road_asphalt' in tex:
        al = lum(tex['road_asphalt']).mean()
        for k in MARKINGS:
            if k not in frames:
                continue
            img = frames[k][0]
            sel = img[..., 3] > 200
            ml = lum(img[..., :3][sel]).mean() if sel.any() else 0
            if ml - al < 60:
                err('%s barely visible on road_asphalt (marking lum %.0f vs road %.0f)' % (k, ml, al))
    # payload
    tot = sum(os.path.getsize(os.path.join(ASSETS, FOLDER, f)) for f in os.listdir(os.path.join(ASSETS, FOLDER)))
    notes.append('payload %.1f KB (limit %.0f KB)' % (tot / 1024, PAYLOAD_MAX / 1024))
    if tot > PAYLOAD_MAX:
        err('payload %.1f KB > %.0f KB' % (tot / 1024, PAYLOAD_MAX / 1024))
    for n in notes:
        print('  ' + n)
    for w in warns:
        print('WARN  ' + w)
    for e in errors:
        print('ERROR ' + e)
    print('check_roads: %d errors, %d warnings' % (len(errors), len(warns)))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
