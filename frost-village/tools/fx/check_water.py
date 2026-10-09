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
    at frame 0, loops close (last -> first change <= 1.3 x a normal frame step), shore-wave strips chain seamlessly
  * palettes: the village (winter_sea) shallows stay clearly colder / greyer than the beach (tropical) ones, and
    the winter deep water is no lighter than the old water_sea tileSprite
  * baked fields (fields.* in the manifest): the PNG matches its meta, and it is not stale for the current world
    (node tools/fx/gen_water_field.mjs --check)
  * memory: decoded RGBA size of every sheet + the default village set (the Game loads sheets on demand)
"""
import colorsys
import subprocess
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
LOOP_MAX = 1.3            # loops: last -> first change at most 1.3 x the mean frame step
OLD_SEA = os.path.join(ROOT, 'assets', 'ground', 'water_sea.png')

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
        def nf(v):     # numbers compare as floats (node writes 1, python 1.0)
            if isinstance(v, bool):
                return v
            if isinstance(v, (int, float)):
                return float(v)
            if isinstance(v, list):
                return [nf(x) for x in v]
            if isinstance(v, dict):
                return {k: nf(x) for k, x in v.items()}
            return v
        jp, pals_n = nf(jp), nf(pals)
        if json.dumps(jp, sort_keys=True) != json.dumps(pals_n, sort_keys=True):
            diff = [k for k in set(jp) | set(pals_n) if json.dumps(jp.get(k), sort_keys=True) != json.dumps(pals_n.get(k), sort_keys=True)]
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
            if ratio > LOOP_MAX:
                err('%s does not loop smoothly (last->first %.2fx a normal step > %.1f)' % (k, ratio, LOOP_MAX))
        if not (0 <= s['anchor'][0] <= 1 and 0 <= s['anchor'][1] <= 1):
            err('%s anchor out of range' % k)
        if k.startswith('fx_shore_wave'):
            # chain 3 copies one segment apart (like the game): no visible seam at the two joins
            sc = s.get('drawScale', 1)
            sx_, sy_ = int(256 / sc), int(128 / sc)          # one segment in sheet px
            dy = sy_ if k.endswith('_x') else -sy_
            fr = frames[n // 2][..., 3] / 255.0
            acc = np.zeros((fh + 2 * sy_, fw + 2 * sx_))
            for j in range(3):
                ox, oy = j * sx_, (j * dy if dy > 0 else 2 * sy_ + j * dy)
                sub = acc[oy:oy + fh, ox:ox + fw]
                acc[oy:oy + fh, ox:ox + fw] = 1 - (1 - sub) * (1 - fr)
            prof = np.abs(np.diff(acc, axis=1)).sum(axis=0)
            joins = [fw // 2 + sx_ // 2 + sx_ * j for j in range(2)]
            jv = max(prof[x - 2:x + 2].max() for x in joins)
            ratio = jv / max(np.median(prof[fw // 2:fw // 2 + 2 * sx_]), 1e-3)
            notes.append('chain %-16s join / median column change %.2f' % (k, ratio))
            if ratio > 3.0:
                err('%s: visible seam where the strips join (%.1fx)' % (k, ratio))
    # ---------------------------------------------------------------- palettes: winter vs tropical, deep vs old sea
    def hls(hx):
        r, g, b = hexrgb(hx) / 255.0
        return colorsys.rgb_to_hls(r, g, b)
    if 'winter_sea' in pals and 'tropical' in pals:
        ws = [hls(st[1]) for st in pals['winter_sea']['lut'] if 0.05 <= st[0] <= 0.3]
        ts = [hls(st[1]) for st in pals['tropical']['lut'] if 0.05 <= st[0] <= 0.4]
        wsat = float(np.mean([x[2] for x in ws])); tsat = float(np.mean([x[2] for x in ts]))
        whue = float(np.mean([x[0] for x in ws])) * 360; thue = float(np.mean([x[0] for x in ts])) * 360
        notes.append('shallows: winter_sea hue %.0f sat %.2f | tropical hue %.0f sat %.2f' % (whue, wsat, thue, tsat))
        if abs(whue - thue) < 8 and tsat - wsat < 0.15:
            err('winter_sea shallows too close to the tropical ones (hue %.0f vs %.0f, sat %.2f vs %.2f)' % (whue, thue, wsat, tsat))
        deep = hls(pals['winter_sea']['lut'][-1][1])
        if os.path.exists(OLD_SEA):
            old = np.asarray(Image.open(OLD_SEA).convert('RGB')).reshape(-1, 3).astype(np.float32).mean(0) / 255.0
            ol = colorsys.rgb_to_hls(*old)[1]
            notes.append('winter deep L %.2f (old water_sea L %.2f)' % (deep[1], ol))
            if deep[1] > ol + 0.01:
                err('winter_sea deep water (L %.2f) is lighter than the old water_sea (L %.2f)' % (deep[1], ol))
    # ---------------------------------------------------------------- baked fields
    for name, f in (man.get('fields') or {}).items():
        p = os.path.join(ROOT, 'assets', f.get('png', ''))
        if not os.path.exists(p):
            err('baked field %s: %s missing' % (name, f.get('png')))
            continue
        im = Image.open(p)
        if im.mode != 'RGB' or im.size != (f['fnx'], f['fny'] * 3):
            err('baked field %s: %s %s, expected RGB %dx%d' % (name, im.mode, im.size, f['fnx'], f['fny'] * 3))
        notes.append('baked field %s %dx%d (x%d) sig %s, %.0f KB' % (name, f['fnx'], f['fny'], f['s'], f['sig'], os.path.getsize(p) / 1024))
    if man.get('fields'):
        try:
            r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'fx', 'gen_water_field.mjs'), '--check'], capture_output=True, text=True, timeout=300)
            if r.returncode != 0:
                err('a baked field is stale for the current world / Water.js (re-run node tools/fx/gen_water_field.mjs): ' + r.stdout.replace('\n', ' ')[:300])
            else:
                notes.append('baked fields are current (gen_water_field.mjs --check)')
        except Exception as e:  # noqa: BLE001
            warn('could not run gen_water_field.mjs --check (%s)' % e)
    # ---------------------------------------------------------------- memory (decoded RGBA)
    dec = {k: s_['frameWidth'] * s_['frameHeight'] * s_['frameCount'] * 4 for k, s_ in sheets.items()}
    if dec:
        notes.append('decoded fx sheets: all %.1f MB; biggest %s' % (sum(dec.values()) / 1048576,
                     ', '.join('%s %.1f' % (k, v / 1048576) for k, v in sorted(dec.items(), key=lambda kv: -kv[1])[:4])))
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
