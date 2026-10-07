"""
check_ui3.py - validates assets/ui3/ (CONTRACT_V5 §O) built by tools/fx/gen_ui3.py.

Re-run (from anywhere; exit code 0 = no errors, 1 = errors):
    python3 frost-village/tools/fx/check_ui3.py
Checks:
  * manifest parses; every path relative to assets/ and inside assets/ui3/; files exist; nothing unreferenced
  * every CONTRACT_V5 §O key resolves: 17 icons + ui_badge_rank_1..5 (atlas ui3_icons) + ui_mission_card(_done)
    (nineSlice), extras ui_mission_board / ui_progress_bg / ui_progress_fill
  * icons 96x96, badges 128x128 (untrimmed source size), anchor [0.5, 0.5], not clipped by the frame, still solid and
    contrasted at 32 px on the cream panel and the dark HUD, all pairwise distinct; badges get richer with rank
  * 9-slices: margins fit the image, both mission cards share size + margins, stretching to typical in-game sizes
    leaves no transparent holes in the face, and every non-uniform detail lies inside the margins (a stretch test:
    the stretchable rows / columns of the source must be uniform along the stretch direction)
  * payload of assets/ui3 <= 1 MB
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
FOLDER = 'ui3'
sys.path.insert(0, HERE)
import check_assets as CA                               # noqa: E402  (read-only reuse of Frag)

ICONS = ['ui_icon_mission', 'ui_icon_fame', 'ui_icon_title', 'ui_icon_delivery', 'ui_icon_request', 'ui_icon_event',
         'ui_icon_goal', 'ui_icon_explore', 'ui_icon_calendar', 'ui_icon_day', 'ui_icon_night', 'ui_icon_ring',
         'ui_icon_baby', 'ui_icon_flower', 'ui_icon_heart_pair', 'ui_icon_steer', 'ui_icon_timer']
BADGES = ['ui_badge_rank_%d' % i for i in range(1, 6)]
CARDS = ['ui_mission_card', 'ui_mission_card_done']
EXTRA_NINE = ['ui_mission_board', 'ui_progress_bg', 'ui_progress_fill']
# typical in-game stretch sizes (w, h) per 9-slice
STRETCH = {'ui_mission_card': [(640, 110), (400, 96), (680, 140)], 'ui_mission_card_done': [(640, 110), (400, 96)],
           'ui_mission_board': [(680, 900), (420, 300)], 'ui_progress_bg': [(300, 30), (120, 30)],
           'ui_progress_fill': [(300, 30), (40, 30)]}
PAYLOAD_MAX = 1024 * 1024
CREAM, DARK = np.array([255, 248, 236], np.float32), np.array([43, 47, 58], np.float32)

errors, warns, notes = [], [], []


def err(m):
    errors.append(m)


def warn(m):
    warns.append(m)


def over(a, bg):
    al = a[..., 3:4].astype(np.float32) / 255
    return a[..., :3].astype(np.float32) * al + bg * (1 - al)


def lum(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def nine_stretch(img, m, w, h):
    W, H = img.size
    L, R, T, B = m['left'], m['right'], m['top'], m['bottom']
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    for sx0, sx1, dx0, dx1 in ((0, L, 0, L), (L, W - R, L, w - R), (W - R, W, w - R, w)):
        for sy0, sy1, dy0, dy1 in ((0, T, 0, T), (T, H - B, T, h - B), (H - B, H, h - B, h)):
            if dx1 > dx0 and dy1 > dy0:
                out.alpha_composite(img.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.BILINEAR),
                                    (dx0, dy0))
    return out


def main():
    f = CA.Frag(FOLDER)
    m = f.m
    if not m:
        print('check_ui3: manifest missing')
        return 1
    for sect in ('atlases', 'images'):
        for e in m.get(sect, []):
            for fld in ('png', 'json'):
                p = e.get(fld)
                if p and (not p.startswith(FOLDER + '/') or '..' in p):
                    err('%s %s path %r not inside assets/%s/' % (sect, e.get('key'), p, FOLDER))
                elif p and not os.path.exists(os.path.join(ASSETS, p)):
                    err('missing file %s' % p)
    d = os.path.join(ASSETS, FOLDER)
    for fn in sorted(os.listdir(d)):
        if fn not in f.used:
            warn('assets/%s/%s is not referenced by the manifest' % (FOLDER, fn))
    # ------------------------------------------------------------------ icons + badges
    arrs = {}
    for k in ICONS + BADGES:
        a = f.sprite_rgba(k)
        if a is None:
            continue
        s = f.sprites[k]
        size = (96, 96) if k in ICONS else (128, 128)
        if (a.shape[1], a.shape[0]) != size:
            err('%s is %dx%d, expected %dx%d' % (k, a.shape[1], a.shape[0], *size))
        if s.get('anchor') != [0.5, 0.5]:
            err('%s anchor %s (expected [0.5, 0.5])' % (k, s.get('anchor')))
        if s.get('atlas') != 'ui3_icons':
            err('%s should live in atlas ui3_icons' % k)
        border = max(a[0, :, 3].max(), a[-1, :, 3].max(), a[:, 0, 3].max(), a[:, -1, 3].max())
        if border > 90:
            err('%s is clipped by its frame (border alpha %d)' % (k, border))
        elif border > 50:
            warn('%s touches its frame edge (border alpha %d, drop shadow)' % (k, border))
        cov = (a[..., 3] > 128).mean()
        if cov < 0.22:
            err('%s too thin / empty (%.0f%% opaque)' % (k, cov * 100))
        sm = np.asarray(Image.fromarray(a).resize((32, 32), Image.LANCZOS)).astype(np.float32)
        solid = (sm[..., 3] > 160).mean()
        if solid < 0.25:
            err('%s not solid enough at 32 px (%.0f%%)' % (k, solid * 100))
        for bg, name in ((CREAM, 'cream'), (DARK, 'dark')):
            c = over(sm.astype(np.uint8), bg)
            con = np.abs(lum(c) - lum(bg[None, None, :])).mean()
            if con < 18:
                err('%s low contrast on %s at 32 px (%.1f)' % (k, name, con))
        arrs[k] = a.astype(np.float32)
    ks = [k for k in ICONS if k in arrs]
    for i in range(len(ks)):
        for j in range(i + 1, len(ks)):
            dd = np.abs(over(arrs[ks[i]].astype(np.uint8), CREAM) - over(arrs[ks[j]].astype(np.uint8), CREAM)).mean()
            if dd < 12:
                err('%s and %s look too similar (%.1f)' % (ks[i], ks[j], dd))
    # badges get richer: more distinct colours / more opaque area with rank
    prev = None
    for k in BADGES:
        if k not in arrs:
            continue
        a = arrs[k]
        q = (a[..., :3][a[..., 3] > 200] // 32).astype(np.int32)
        ncol = len({tuple(v) for v in q})
        area = (a[..., 3] > 128).mean()
        notes.append('%s: %d colour bins, %.0f%% area' % (k, ncol, area * 100))
        if prev is not None and area + 0.02 < prev:
            warn('%s smaller than the previous rank' % k)
        prev = area
    # ------------------------------------------------------------------ 9-slices
    nines = f.nine
    for k in CARDS + EXTRA_NINE:
        if k not in nines:
            err('nineSlice[%s] missing' % k)
            continue
        n9 = nines[k]
        p = f.images.get(n9.get('image'))
        if not p:
            err('nineSlice[%s] image missing' % k)
            continue
        img = Image.open(p).convert('RGBA')
        W, H = img.size
        L, R, T, B = n9['left'], n9['right'], n9['top'], n9['bottom']
        if L + R >= W or T + B >= H:
            err('%s margins %s do not fit %dx%d' % (k, (L, R, T, B), W, H))
            continue
        a = np.asarray(img).astype(np.float32)
        pm = np.dstack([a[..., :3] * a[..., 3:4] / 255.0, a[..., 3:4]])

        def hf(band, axis):
            """Largest high-frequency residual along `axis` (discrete details smear when stretched; smooth
            gradients do not)."""
            if band.shape[axis] < 7:
                return 0.0
            k = 7
            pad = [(0, 0)] * band.ndim
            pad[axis] = (k // 2, k // 2)
            b = np.pad(band, pad, mode='edge')
            cs = np.cumsum(b, axis=axis)
            cs = np.concatenate([np.zeros_like(np.take(cs, [0], axis=axis)), cs], axis=axis)
            n = band.shape[axis]
            avg = (np.take(cs, range(k, k + n), axis=axis) - np.take(cs, range(0, n), axis=axis)) / k
            return float(np.abs(band - avg).max())
        for name, band, axis in (('centre', pm[T:H - B, L:W - R], 1), ('centre', pm[T:H - B, L:W - R], 0),
                                 ('top edge', pm[:T, L:W - R], 1), ('bottom edge', pm[H - B:, L:W - R], 1),
                                 ('left edge', pm[T:H - B, :L], 0), ('right edge', pm[T:H - B, W - R:], 0)):
            r = hf(band, axis)
            if r > 10:
                err('%s: %s band has a discrete detail along its stretch axis (residual %.0f) - move it into the '
                    'margins' % (k, name, r))
        for (w, h) in STRETCH.get(k, []):
            st = np.asarray(nine_stretch(img, n9, w, h))
            inner = st[h // 2 - 4:h // 2 + 4, L + 4:w - R - 4, 3]
            if inner.size and inner.min() < 250:
                err('%s stretched to %dx%d has a transparent hole in the face' % (k, w, h))
        s = f.sprites.get(k, {})
        if 'contentInset' not in s or 'minSize' not in s:
            warn('%s: sprites entry lacks contentInset / minSize' % k)
        notes.append('%s %dx%d margins L%d R%d T%d B%d' % (k, W, H, L, R, T, B))
    if all(k in nines for k in CARDS):
        a0 = Image.open(f.images[nines[CARDS[0]]['image']]).size
        a1 = Image.open(f.images[nines[CARDS[1]]['image']]).size
        if a0 != a1 or any(nines[CARDS[0]][x] != nines[CARDS[1]][x] for x in ('left', 'right', 'top', 'bottom')):
            err('ui_mission_card and ui_mission_card_done must share size and margins')
    tot = sum(os.path.getsize(os.path.join(d, fn)) for fn in os.listdir(d))
    notes.append('payload %.1f KB (limit %.0f KB)' % (tot / 1024, PAYLOAD_MAX / 1024))
    if tot > PAYLOAD_MAX:
        err('payload %.1f KB > 1 MB' % (tot / 1024))
    errors.extend(e for e in CA.errors if e not in errors)
    for n in notes:
        print('  ' + n)
    for w in warns:
        print('WARN  ' + w)
    for e in errors:
        print('ERROR ' + e)
    print('check_ui3: %d errors, %d warnings' % (len(errors), len(warns)))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
