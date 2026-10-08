#!/usr/bin/env python3
"""
check_water.py - validate assets/water (CONTRACT_V7 section V) + the palette copy in src/systems/Water.js.
Exit 0 = OK, 1 = errors.   python3 tools/fx/check_water.py

  * every manifest file exists, nothing unreferenced; payload of assets/water <= 2.5 MB
  * data textures: power of two, RGB / opaque, seamless (wrap difference ~ neighbour difference), normal maps
    decode to unit-ish normals with a sane slope spread, caustics / lace span 0..1
  * water_lut: one row per palette, matching the palette stops (colour + opacity), shore ramp rows
  * palettes in the manifest == DEFAULT_PALETTES in src/systems/Water.js
  * fx sheets: frame grid matches the png (rows wrapped <= 2048 px), every frame non-empty, one-shots visible
    at frame 0, loops close (last -> first change ~ a normal frame step), shore-wave strips chain seamlessly
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'water')
WATER_JS = os.path.join(ROOT, 'src', 'systems', 'Water.js')
PAYLOAD_MAX = int(2.5 * 1024 * 1024)
REQUIRED_SHEETS = ['fx_wave_crash', 'fx_splash_small', 'fx_splash_big', 'fx_swim_ripple', 'fx_wake_v2',
                   'fx_sparkle_water', 'fx_shore_wave_x', 'fx_shore_wave_y']
REQUIRED_IMAGES = ['water_waves_a', 'water_waves_b', 'water_foam', 'water_lut', 'water_shore_ramp']

errors, warns, notes = [], [], []
err = errors.append
warn = warns.append


def seam(a, axis):
    a = a.astype(np.float32)
    if axis == 0:
        a = np.swapaxes(a, 0, 1)
    edge = np.abs(a[:, 0] - a[:, -1]).mean()
    d = np.abs(a[:, 1:] - a[:, :-1]).mean(axis=tuple(i for i in range(a.ndim) if i != 1))
    local = np.concatenate([d[:3], d[-3:]]).mean()
    return float(edge / max(local, 1e-3, 0.2 * d.mean()))


def hexrgb(h):
    n = int(h.lstrip('#'), 16)
    return np.array([(n >> 16) & 255, (n >> 8) & 255, n & 255], np.float32)


def js_palettes():
    src = open(WATER_JS, encoding='utf-8').read()
    m = re.search(r'export const DEFAULT_PALETTES = (\{.*?\n\});', src, re.S)
    if not m:
        err('Water.js: DEFAULT_PALETTES block not found')
        return None
    s = m.group(1)
    s = re.sub(r"'", '"', s)
    s = re.sub(r'([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:', r'\1"\2":', s)
    s = re.sub(r',(\s*[}\]])', r'\1', s)
    try:
        return json.loads(s)
    except Exception as e:  # noqa: BLE001
        err('Water.js: DEFAULT_PALETTES does not parse (%s)' % e)
        return None


def main():
    mpath = os.path.join(OUT, 'manifest.json')
    if not os.path.exists(mpath):
        err('assets/water/manifest.json missing')
        return
    man = json.load(open(mpath))
    files = set()
    imgs = {i['key']: i for i in man.get('images', [])}
    sheets = {s['key']: s for s in man.get('spritesheets', [])}
    for k in REQUIRED_IMAGES:
        if k not in imgs:
            err('manifest: image %s missing' % k)
    for k in REQUIRED_SHEETS:
        if k not in sheets:
            err('manifest: spritesheet %s missing' % k)
    for e in list(imgs.values()) + list(sheets.values()):
        p = os.path.join(ROOT, 'assets', e['png'])
        files.add(os.path.basename(p))
        if not os.path.exists(p):
            err('missing file assets/%s' % e['png'])
    for f in os.listdir(OUT):
        if f != 'manifest.json' and f not in files:
            warn('assets/water/%s is not referenced by the manifest' % f)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    notes.append('payload %.2f MB (limit 2.5 MB)' % (total / 1048576))
    if total > PAYLOAD_MAX:
        err('payload %.2f MB > 2.5 MB' % (total / 1048576))

    # ---------------------------------------------------------------- data textures
    for k in ('water_waves_a', 'water_waves_b', 'water_foam'):
        if k not in imgs:
            continue
        im = Image.open(os.path.join(ROOT, 'assets', imgs[k]['png']))
        w, h = im.size
        if w & (w - 1) or h & (h - 1):
            err('%s is %dx%d, not power of two' % (k, w, h))
        if im.mode not in ('RGB',):
            err('%s mode %s (data textures must be plain RGB)' % (k, im.mode))
        a = np.asarray(im.convert('RGB')).astype(np.float32)
        rx, ry = seam(a, 1), seam(a, 0)
        notes.append('seam %-14s x %.2f y %.2f' % (k, rx, ry))
        if rx > 1.5 or ry > 1.5:
            err('%s not seamless (x %.2f, y %.2f)' % (k, rx, ry))
        if k.startswith('water_waves'):
            n = a[..., :2] / 127.5 - 1
            r2 = (n ** 2).sum(-1)
            if r2.max() > 1.0:
                err('%s: normal xy longer than 1' % k)
            sd = float(np.sqrt(r2.mean()))
            notes.append('%s normal xy rms %.3f, caustics %.2f..%.2f' % (k, sd, a[..., 2].min() / 255, a[..., 2].max() / 255))
            if not 0.08 < sd < 0.45:
                warn('%s: normal spread %.3f looks odd' % (k, sd))
            if abs(n[..., 0].mean()) > 0.02 or abs(n[..., 1].mean()) > 0.02:
                warn('%s: normals not centred (tilted water)' % k)
        if k == 'water_foam':
            for ch, nm in enumerate('RGB'):
                lo, hi = a[..., ch].min() / 255, a[..., ch].max() / 255
                if lo > 0.05 or hi < 0.95:
                    warn('water_foam %s spans %.2f..%.2f (expected 0..1)' % (nm, lo, hi))
    # ---------------------------------------------------------------- LUT + palettes
    pals = man.get('palettes', {})
    if 'water_lut' in imgs:
        lut = np.asarray(Image.open(os.path.join(ROOT, 'assets', imgs['water_lut']['png'])).convert('RGBA')).astype(np.float32)
        if lut.shape[1] != 256:
            err('water_lut must be 256 wide')
        for name, p in pals.items():
            row = lut[p['row']]
            us = np.array([s[0] for s in p['lut']])
            for j, x in enumerate((np.arange(256) + 0.5) / 256):
                if j % 32:
                    continue
                exp = np.array([np.interp(x, us, [hexrgb(s[1])[c] for s in p['lut']]) for c in range(3)])
                ea = np.interp(x, us, [s[2] for s in p['lut']]) * 255
                if np.abs(row[j, :3] - exp).max() > 3 or abs(row[j, 3] - ea) > 3:
                    err('water_lut row %d (%s) differs from its stops at u=%.2f' % (p['row'], name, x))
                    break
        for need in ('winter_sea', 'harbor', 'tropical'):
            if need not in pals:
                err('palette %s missing' % need)
    jp = js_palettes()
    if jp is not None:
        if json.dumps(jp, sort_keys=True) != json.dumps(pals, sort_keys=True):
            diff = [k for k in set(jp) | set(pals) if json.dumps(jp.get(k), sort_keys=True) != json.dumps(pals.get(k), sort_keys=True)]
            err('palettes in Water.js and the manifest differ: %s (re-run gen_water.py / edit both)' % diff)
        else:
            notes.append('Water.js DEFAULT_PALETTES == manifest palettes (%d)' % len(jp))
    # ---------------------------------------------------------------- fx sheets
    for k, s in sheets.items():
        p = os.path.join(ROOT, 'assets', s['png'])
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGBA')
        fw, fh, n = s['frameWidth'], s['frameHeight'], s['frameCount']
        W, H = im.size
        if W > 2048:
            err('%s is %d px wide (> 2048)' % (k, W))
        cols = min(n, W // fw)
        rows = -(-n // cols)
        if W % fw or H != rows * fh:
            err('%s: %dx%d does not hold %d frames of %dx%d' % (k, W, H, n, fw, fh))
            continue
        a = np.asarray(im).astype(np.float32)
        frames = [a[(i // cols) * fh:(i // cols + 1) * fh, (i % cols) * fw:(i % cols + 1) * fw] for i in range(n)]
        for i, fr in enumerate(frames):
            if fr[..., 3].max() < 40 and not (s['repeat'] == 0 and i == n - 1):
                err('%s frame %d is empty' % (k, i))
        if s['repeat'] == 0 and frames[0][..., 3].max() < 120:
            err('%s: one-shot frame 0 is not visible' % k)
        if s['repeat'] == -1 and n > 2:
            steps = [np.abs(frames[i + 1] - frames[i]).mean() for i in range(n - 1)]
            close = np.abs(frames[0] - frames[-1]).mean()
            ratio = close / max(np.mean(steps), 1e-3)
            notes.append('loop %-18s close/step %.2f' % (k, ratio))
            if ratio > 2.2:
                err('%s does not loop (last->first %.1fx a normal step)' % (k, ratio))
        if not (0 <= s['anchor'][0] <= 1 and 0 <= s['anchor'][1] <= 1):
            err('%s anchor out of range' % k)
        if k.startswith('fx_shore_wave'):
            # chain 3 copies one segment apart (like the game): no visible seam at the two joins
            dy = 128 if k.endswith('_x') else -128
            fr = frames[n // 2][..., 3] / 255.0
            acc = np.zeros((fh + 256, fw + 512))
            for j in range(3):
                ox, oy = j * 256, (j * dy if dy > 0 else 256 + j * dy)
                sub = acc[oy:oy + fh, ox:ox + fw]
                acc[oy:oy + fh, ox:ox + fw] = 1 - (1 - sub) * (1 - fr)
            prof = np.abs(np.diff(acc, axis=1)).sum(axis=0)
            joins = [fw // 2 + 128 + 256 * j for j in range(2)]
            jv = max(prof[x - 2:x + 2].max() for x in joins)
            ratio = jv / max(np.median(prof[fw // 2:fw // 2 + 512]), 1e-3)
            notes.append('chain %-16s join / median column change %.2f' % (k, ratio))
            if ratio > 3.0:
                err('%s: visible seam where the strips join (%.1fx)' % (k, ratio))
    # ---------------------------------------------------------------- Water.js sanity
    src = open(WATER_JS, encoding='utf-8').read()
    m = re.search(r'\n  _draw\(renderer, camera, calc, isShore\) \{(.*?)\n  \}\n', src, re.S)
    if m:
        body = m.group(1)
        bad = [t for t in ('new ', '=> ', '.map(', '.filter(', '.slice(', 'for (const') if t in body]
        if bad:
            err('Water._draw allocates per frame: %s' % bad)
        else:
            notes.append('Water._draw: no allocations (no new / closures / array helpers)')
    else:
        warn('Water._draw not found for the allocation check')
    print('\n'.join(['NOTE  ' + n for n in notes] + ['WARN  ' + w for w in warns] + ['ERROR ' + e for e in errors]))
    print('RESULT: %s (%d errors, %d warnings)' % ('OK' if not errors else 'FAIL', len(errors), len(warns)))


if __name__ == '__main__':
    main()
    sys.exit(1 if errors else 0)
