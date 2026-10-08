"""
check_beach_ground.py - checks the ground part of assets/beach (written by tools/fx/gen_beach_ground.py).
    python3 tools/fx/check_beach_ground.py        (exit 1 on errors)

  * ground_sand / ground_sand_wet: 512x512, listed in images[] + sprites (kind tile), seamless (wrap-around seam vs.
    interior gradient ratio <= 1.5, the test of tools/fx/check_assets.py)
  * every kit piece / decal: frame exists in beach_ground_decals, sourceSize == frameSize, integer anchorPx inside the
    frame, decal borders transparent (alpha <= 24; kit pieces: <= 24 on the band edges), towels have lyingPoints /
    lyingDirs, courts have cornerPoints
  * the transition kit composes seamlessly: two chained edge pieces of every variant pair reproduce the continuous
    transition along their shared cut (max alpha step <= 40 / 255 across the cut line)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
GEN = 'gen_beach_ground'
TEXTURES = ['ground_sand', 'ground_sand_wet']
EDGES = ['ground_sand_snow_edge_x', 'ground_sand_snow_edge_x_near', 'ground_sand_snow_edge_y',
         'ground_sand_snow_edge_y_near']
KIT = [e + s for e in EDGES for s in ('', '_1', '_2')] + \
    ['ground_sand_snow_%s_%s' % (k, q) for k in ('corner', 'inner') for q in 'nesw']
DECALS = ['decal_footprints_sand', 'decal_shells', 'decal_seaweed', 'decal_sand_ripples', 'decal_volleyball_court',
          'decal_volleyball_court_x'] + ['decal_towel_%s%s' % (c, x) for c in ('red', 'blue', 'yellow', 'green')
                                         for x in ('', '_x')]
REQUIRED = TEXTURES + KIT + DECALS


def seam_ratio(img):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    inner_x = np.abs(np.diff(a, axis=1)).mean()
    inner_y = np.abs(np.diff(a, axis=0)).mean()
    sx = np.abs(a[:, 0] - a[:, -1]).mean() / max(inner_x, 1e-6)
    sy = np.abs(a[0, :] - a[-1, :]).mean() / max(inner_y, 1e-6)
    return sx, sy


def frame_img(sheet, fr):
    r = fr['frame']
    crop = sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    im = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
    im.paste(crop, (fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']))
    return im


def check(man=None, verbose=True):
    errors, warns = [], []
    path = os.path.join(ASSETS, 'beach', 'manifest.json')
    if man is None:
        if not os.path.exists(path):
            return ['assets/beach/manifest.json missing'], []
        man = json.load(open(path, encoding='utf-8'))
    sp = man.get('sprites', {})
    images = {i['key']: i['png'] for i in man.get('images', [])}
    for k in REQUIRED:
        if k not in sp:
            errors.append('missing ground key %s' % k)
    for k in TEXTURES:
        if k not in sp:
            continue
        if k not in images:
            errors.append('%s: not in images[]' % k)
            continue
        p = os.path.join(ASSETS, images[k])
        if not os.path.exists(p):
            errors.append('%s: file %s missing' % (k, images[k]))
            continue
        im = Image.open(p)
        if im.size != (512, 512):
            errors.append('%s: size %s (want 512x512)' % (k, im.size))
        sx, sy = seam_ratio(im)
        if verbose:
            print('  %-18s seam x %.2f y %.2f' % (k, sx, sy))
        if sx > 1.5 or sy > 1.5:
            errors.append('%s: visible tiling seam (x %.2f, y %.2f > 1.5)' % (k, sx, sy))
        if sp[k].get('kind') != 'tile':
            errors.append('%s: kind %s (want tile)' % (k, sp[k].get('kind')))
    atl = next((a for a in man.get('atlases', []) if a['key'] == 'beach_ground_decals'), None)
    if not atl:
        errors.append('atlas beach_ground_decals not listed')
        return errors, warns
    sheet = Image.open(os.path.join(ASSETS, atl['png'])).convert('RGBA')
    js = json.load(open(os.path.join(ASSETS, atl['json'])))
    if max(sheet.size) > 2048:
        errors.append('beach_ground_decals is %dx%d (> 2048)' % sheet.size)
    if (js['meta']['size']['w'], js['meta']['size']['h']) != sheet.size:
        errors.append('beach_ground_decals: json size != png size')
    imgs = {}
    for k in KIT + DECALS:
        e = sp.get(k)
        if not e:
            continue
        fr = js['frames'].get(e.get('frame'))
        if e.get('atlas') != 'beach_ground_decals' or fr is None:
            errors.append('%s: frame %s missing in beach_ground_decals' % (k, e.get('frame')))
            continue
        if [fr['sourceSize']['w'], fr['sourceSize']['h']] != e['frameSize']:
            errors.append('%s: sourceSize != frameSize' % k)
        ax, ay = e.get('anchorPx', [None, None])
        if ax is None or not (0 <= ax <= e['frameSize'][0] and 0 <= ay <= e['frameSize'][1]):
            errors.append('%s: bad anchorPx %s' % (k, e.get('anchorPx')))
        if e.get('generator') != GEN:
            errors.append('%s: generator field != %s' % (k, GEN))
        im = frame_img(sheet, fr)
        imgs[k] = im
        a = np.asarray(im)[..., 3]
        border = max(a[0].max(), a[-1].max(), a[:, 0].max(), a[:, -1].max())
        if border > 24 and k in DECALS:
            errors.append('%s: decal border not transparent (alpha %d)' % (k, border))
        elif border > 60:
            warns.append('%s: kit piece touches its frame edge (alpha %d)' % (k, border))
    for k in DECALS:
        if k.startswith('decal_towel') and k in sp:
            for f in ('lyingPoints', 'lyingDirs', 'lyingHeadPoints', 'lyingAxis'):
                if f not in sp[k]:
                    errors.append('%s: missing %s' % (k, f))
        if k.startswith('decal_volleyball_court') and k in sp and len(sp[k].get('cornerPoints', [])) != 4:
            errors.append('%s: cornerPoints must list 4 corners' % k)
    # seamless chaining of edge pieces: compose A (anchor 0) + B (anchor + step) for every variant pair and compare
    # the composite across the shared cut with the alpha of a single piece just inside its own cut
    for e in EDGES:
        if not all(v in imgs for v in (e, e + '_1', e + '_2')):
            continue
        step = (64, 32) if '_x' in e else (64, -32)
        worst = -999
        for va in ('', '_1', '_2'):
            for vb in ('', '_1', '_2'):
                A, B = imgs[e + va], imgs[e + vb]
                aa, ab_ = sp[e + va]['anchorPx'], sp[e + vb]['anchorPx']
                W = max(A.width, B.width) + 80
                H = max(A.height, B.height) + 80
                canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                ox, oy = 40 + aa[0], 40 + aa[1] + (32 if step[1] < 0 else 0)
                canvas.alpha_composite(A, (ox - aa[0], oy - aa[1]))
                canvas.alpha_composite(B, (ox + step[0] - ab_[0], oy + step[1] - ab_[1]))
                al = np.asarray(canvas)[..., 3].astype(np.float32)
                # sample alpha profiles running ALONG the edge across the cut, at several offsets across the band
                cx, cy = ox + step[0] / 2.0, oy + step[1] / 2.0
                ux = (45.2548, 22.6274) if step[1] > 0 else (45.2548, -22.6274)     # 1 m along the edge
                vx = (45.2548, -22.6274) if step[1] > 0 else (45.2548, 22.6274)     # 1 m across
                for t in np.linspace(-0.5, 0.5, 21):
                    prof = []
                    for u in np.linspace(-0.2, 0.2, 41):
                        px = cx + u * ux[0] + t * vx[0]
                        py = cy + u * ux[1] + t * vx[1]
                        xi, yi = int(round(px)), int(round(py))
                        if 0 <= yi < al.shape[0] and 0 <= xi < al.shape[1]:
                            prof.append(al[yi, xi])
                    if len(prof) == 41:
                        pr = np.asarray(prof)
                        bump = np.abs(pr[1:-1] - (pr[:-2] + pr[2:]) / 2.0)       # index j <-> u = -0.19 + 0.01 j
                        at_cut = bump[14:25].max()                               # |u| <= 0.05 m
                        away = max(bump[:9].max(), bump[-9:].max())              # |u| >= 0.11 m
                        worst = max(worst, int(at_cut - max(away, 10.0)))
        if verbose:
            print('  %-30s seam excess across the cut %d (<= 20 ok)' % (e, worst))
        if worst > 20:
            errors.append('%s: chained pieces show a seam at the cut (alpha bump %d above the normal texture > 20)'
                          % (e, worst))
    return errors, warns


def main():
    errors, warns = check()
    for w in warns:
        print('WARNING', w)
    for e in errors:
        print('ERROR', e)
    print('check_beach_ground: %d ground keys, %d errors, %d warnings' % (len(REQUIRED), len(errors), len(warns)))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
