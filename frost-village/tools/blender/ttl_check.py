"""
ttl_check.py - acceptance checks for the title art (plain python: Pillow + numpy; scipy optional).

    python3 tools/blender/ttl_check.py [--cache /tmp/fv_cache/title] [--out report.json]

Exit code 1 when a check fails.  ttl_build.sh runs it after packing.

Checks
  name      the logo texts parse and every character has a glyph (ttl_config.validate_title)
  jamo      the main logo, shrunk to 215 px wide (a 360-px phone, k = 1), keeps every jamo apart:
            for each big letter the most body runs along a vertical / horizontal scan line are at
            least what the plain Jua glyph has (ㄲ shows two ㄱ, 을 shows ㅇ, ㅡ and ㄹ's three bars)
  emblem    the 눈꽃 emblem covers <= 3 % of any letter piece (render alphas from the cache)
  counters  English logo: every enclosed counter (o, b, ...) of the big word is >= 30 % of its
            letter's width
  seams     every horizontally tiled strip: the wrap column differs from its neighbour by no more
            than 2 x the median adjacent-column difference
  payload   what the title loads (manifest meta.payload) <= 1.5 MB
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ttl_config as C          # noqa: E402

OUT = C.OUT_DIR
PHONE_LOGO_W = 215              # px: the main logo on a 360-px-wide phone at k = 1
BODY_LUM = 0.30                 # brighter than the navy ink / shadow = letter body (colour, snow, rim)


def rgba(name):
    return np.asarray(Image.open(os.path.join(OUT, name)).convert('RGBA'), np.float32) / 255.0


def lum(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def runs(v):
    """number of True runs in a 1-D bool array"""
    v = np.asarray(v, bool)
    return int(np.count_nonzero(v[1:] & ~v[:-1]) + (1 if v[0] else 0)) if len(v) else 0


def scan_max(mask, axis, lo=0.2, hi=0.8, steps=25):
    """most runs along lines across `mask` (axis 0 = vertical lines at x fractions, 1 = horizontal)."""
    h, w = mask.shape
    best = 0
    for f in np.linspace(lo, hi, steps):
        if axis == 0:
            best = max(best, runs(mask[:, int(f * (w - 1))]))
        else:
            best = max(best, runs(mask[int(f * (h - 1)), :]))
    return best


def glyph_mask(ch, h):
    """the plain font glyph as a bool mask about h px tall (tight bbox)."""
    fp = C.font_for(ch, 'ko') or C.FONT_KO
    f = ImageFont.truetype(fp, int(h * 1.35))
    im = Image.new('L', (int(h * 2.2), int(h * 2.2)), 0)
    ImageDraw.Draw(im).text((int(h * 0.3), int(h * 0.1)), ch, font=f, fill=255)
    a = np.asarray(im) > 127
    ys, xs = np.nonzero(a)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # resample to the target height (nearest) so thin gaps keep their proportions
    hh = max(4, h)
    ww = max(4, int(round(a.shape[1] * hh / a.shape[0])))
    return np.asarray(Image.fromarray(a.astype(np.uint8) * 255).resize((ww, hh), Image.BILINEAR)) > 127


def check_jamo(man):
    res = {'ok': True, 'letters': []}
    main = man['meta'].get('logo', {}).get('main', {})
    parts = main.get('parts') or []
    size2x = main.get('size2x')
    if not parts or not size2x:
        return {'ok': False, 'error': 'no meta.logo.main.parts'}
    full = rgba('ttl_logo_main.png')
    s = PHONE_LOGO_W / float(full.shape[1])
    small = Image.open(os.path.join(OUT, 'ttl_logo_main.png')).convert('RGBA')
    small = small.resize((PHONE_LOGO_W, max(1, round(small.height * s))), Image.LANCZOS)
    sa = np.asarray(small, np.float32) / 255.0
    body = (sa[..., 3] > 0.5) & (lum(sa) > BODY_LUM)
    word = C.TITLE['main']
    letters = sorted([p for p in parts if p['frame'].startswith('ttl_logo_main_')],
                     key=lambda p: int(p['frame'].rsplit('_', 1)[1]))
    for i, p in enumerate(letters):
        ch = word[i] if i < len(word) else '?'
        cx = (size2x[0] / 2.0 + p['dx']) * s
        cy = (size2x[1] / 2.0 + p['dy']) * s
        # the inked piece box minus its ink margin (10 px @2x) -> the letter's own box
        w = max(4, (p['w'] - 24) * s)
        h = max(4, (p['h'] - 24) * s)
        x0, x1 = int(round(cx - w / 2)), int(round(cx + w / 2))
        y0, y1 = int(round(cy - h / 2)), int(round(cy + h / 2))
        m = body[max(0, y0):y1, max(0, x0):x1]
        g = glyph_mask(ch, max(8, y1 - y0))
        rec = {'letter': ch, 'box': [x0, y0, x1, y1]}
        ok = True
        for axis, lo, hi, nm in ((0, 0.15, 0.85, 'vertical'), (1, 0.08, 0.92, 'horizontal')):
            want = scan_max(g, axis, lo, hi)
            got = scan_max(m, axis, lo, hi)
            rec[nm] = {'font': want, 'logo': got}
            if got < want:
                ok = False
        rec['ok'] = ok
        res['letters'].append(rec)
        res['ok'] = res['ok'] and ok
    return res


def check_emblem(cache):
    """emblem render alpha vs every letter piece render alpha (same camera, cache/logo)."""
    info_p = os.path.join(cache, 'logo', 'logo_main.json')
    if not os.path.exists(info_p):
        return {'ok': None, 'note': 'no cache renders (%s) - skipped' % info_p}
    info = json.load(open(info_p))
    pcs = {int(k): v['name'] for k, v in info['pieces'].items()}
    em = [k for k, v in pcs.items() if v == 'emblem']
    if not em:
        return {'ok': True, 'note': 'no emblem piece'}

    def alpha(i):
        p = os.path.join(cache, 'logo', 'logo_main_part%d.png' % i)
        return np.asarray(Image.open(p).convert('RGBA'), np.float32)[..., 3] / 255.0
    ea = alpha(em[0]) > 0.5
    res = {'ok': True, 'cover': {}}
    for k, v in pcs.items():
        if not v.startswith('main_'):
            continue
        la = alpha(k) > 0.5
        frac = float((la & ea).sum()) / max(1.0, float(la.sum()))
        res['cover'][v] = round(frac * 100, 2)
        if frac > 0.03:
            res['ok'] = False
    return res


def check_counters():
    """English big word: enclosed counters vs their letter's width (on ttl_logo_en_1x)."""
    p = os.path.join(OUT, 'ttl_logo_en_1x.png')
    if not os.path.exists(p):
        return {'ok': None, 'note': 'no ttl_logo_en_1x'}
    try:
        from scipy import ndimage as ndi
    except Exception:
        return {'ok': None, 'note': 'scipy missing - skipped'}
    a = np.asarray(Image.open(p).convert('RGBA'), np.float32) / 255.0
    body = (a[..., 3] > 0.5) & (lum(a) > BODY_LUM)
    # the big word only: rows above the sign (the sign's wood is body too) = upper ~62 %
    H = body.shape[0]
    top = body[:int(H * 0.62)]
    lab_b, nb = ndi.label(top)
    holes, nh = ndi.label(~top)
    out = {'ok': True, 'counters': []}
    for k in range(1, nh + 1):
        ys, xs = np.nonzero(holes == k)
        if ys.min() == 0 or xs.min() == 0 or ys.max() == top.shape[0] - 1 or xs.max() == top.shape[1] - 1:
            continue                                     # touches the border: outside, not a counter
        if len(ys) < 3:
            continue
        # skip the gaps between the emblem's petals: round a petal gap the body is pale ice-blue, round a
        # LETTER's counter it is the letter's saturated candy colour
        y0_, y1_ = max(0, ys.min() - 3), min(top.shape[0], ys.max() + 4)
        x0_, x1_ = max(0, xs.min() - 3), min(top.shape[1], xs.max() + 4)
        win = a[y0_:y1_, x0_:x1_]
        bw = body[y0_:y1_, x0_:x1_] & (holes[y0_:y1_, x0_:x1_] != k)
        if bw.any():
            mx, mn = win[..., :3].max(axis=-1), win[..., :3].min(axis=-1)
            sat = ((mx - mn) / np.maximum(mx, 1e-3))[bw].mean()
            bluish = win[..., 2][bw].mean() > win[..., 0][bw].mean()
            if bluish and sat < 0.48:                    # the emblem: pale ice-blue petals
                continue
        # the letter around it: the body component just left of the hole's centre row
        r = int(ys.mean())
        row = lab_b[r]
        left = row[:xs.min()][::-1]
        lid = next((v for v in left if v > 0), 0)
        if not lid:
            continue
        lys, lxs = np.nonzero(lab_b == lid)
        lw = lxs.max() - lxs.min() + 1
        hw = xs.max() - xs.min() + 1
        ratio = hw / float(lw)
        out['counters'].append({'x': int(xs.mean()), 'w': int(hw), 'letterW': int(lw), 'ratio': round(ratio, 2)})
        if ratio < 0.30 and lw > 10:
            out['ok'] = False
    return out


def seam(name):
    a = rgba(name) * 255.0
    d = np.abs(a[:, 1:] - a[:, :-1]).mean(axis=(0, 2))
    wrap = float(np.abs(a[:, 0] - a[:, -1]).mean())
    med = float(np.median(d))
    # a seam must look like any other column step: <= 2 x the median step, or (flat art with real
    # edges, e.g. a skyline) no worse than the 97th percentile of the steps inside the picture
    lim = max(2.0 * med + 0.5, float(np.percentile(d, 97)))
    return {'wrap': round(wrap, 2), 'median': round(med, 2), 'limit': round(lim, 2), 'ok': wrap <= lim}


def check_seams():
    out = {'ok': True}
    for n in ('ttl_clouds', 'ttl_mtn_far', 'ttl_mtn_mid', 'ttl_forest', 'ttl_city_far', 'ttl_city_lights',
              'ttl_aurora'):
        p = os.path.join(OUT, n + '.png')
        if not os.path.exists(p):
            continue
        r = seam(n + '.png')
        out[n] = r
        out['ok'] = out['ok'] and r['ok']
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.environ.get('TTL_CACHE', '/tmp/fv_cache/title'))
    ap.add_argument('--out', default='')
    a = ap.parse_args()
    man = json.load(open(os.path.join(OUT, 'manifest.json')))
    errs, warns = C.validate_title()
    rep = {'name': {'ok': not errs, 'errors': errs, 'notes': warns},
           'jamo': check_jamo(man),
           'emblem': check_emblem(a.cache),
           'counters': check_counters(),
           'seams': check_seams()}
    pay = man['meta'].get('payload', {})
    tot = pay.get('titleLoadPngBytes') or 0
    rep['payload'] = {'bytes': tot, 'ok': bool(tot) and tot <= 1.5 * 1024 * 1024}
    bad = [k for k, v in rep.items() if isinstance(v, dict) and v.get('ok') is False]
    rep['failed'] = bad
    txt = json.dumps(rep, ensure_ascii=False, indent=1)
    if a.out:
        with open(a.out, 'w') as f:
            f.write(txt)
    print(txt)
    print('TTL_CHECK', 'FAIL ' + ','.join(bad) if bad else 'OK')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
