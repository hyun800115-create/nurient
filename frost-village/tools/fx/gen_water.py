#!/usr/bin/env python3
"""
gen_water.py - procedural textures for the living-water module (CONTRACT_V7 section V).

Writes assets/water/ (textures + manifest.json) and docs/previews/water_textures.png.
Deterministic (fixed seeds): two runs give byte-identical files.

    python3 tools/fx/gen_water.py            # textures + manifest + preview
    python3 tools/fx/gen_water_fx.py         # the FX spritesheets (adds itself to the same manifest)
    python3 tools/fx/check_water.py          # validate

Conventions (shared with src/systems/Water.js)
------------------------------------------------
* "G space" = the iso ground plane seen from above: G = (screen x, 2 * screen y) in world px.
  It is metric: 1 m along any ground direction = 64 G px (PPU 64). Water.js samples every
  texture with uv = G / tilePx, so the waves come out foreshortened 2:1 like the ground.
* Image row 0 = v 0 = smallest G y (no flip on upload).
* Data textures are plain RGB (alpha 255 everywhere) so no browser premultiplies / damages them.

Textures
--------
water_waves_a  512x512 RGB  R,G = ripple normal x,y (0.5 + 0.5 n) of a periodic FFT ocean height
                            field (JONSWAP spectrum, peak 1.4 m, tile 8 m = 512 G px);
                            B = refraction caustics of that same field (bright web, 0..1)
water_waves_b  256x256 RGB  same for the fine ripple layer (peak 0.5 m, tile 3 m, sampled at 192 G px)
water_foam     256x256 RGB  R = foam lace potential (Worley bubble lace, threshold it), G = round
                            bubbles / slush ice bits, B = smooth low-frequency variation noise
water_lut      256x8  RGBA  one row per palette (see PALETTES): u = 1 - exp(-depth / depthScale);
                            RGB = water colour, A = water opacity over the bottom (0 = clear)
water_shore_ramp 256x4 RGB  wet/dry ramps per shore material: row 0 sand (dry -> damp -> wet ->
                            submerged), row 1 snow bank, row 2 rock, row 3 quay stone
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import fxlib as F  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'water')
PREV = os.path.join(ROOT, 'docs', 'previews')
PPM = 64.0   # G px per metre

# --------------------------------------------------------------------------- palettes
# Single source of truth for the colours. Water.js carries an identical copy (DEFAULT_PALETTES)
# so it also works without the manifest; check_water.py fails if the two ever differ.
#   lut        : [u, '#rrggbb', opacity] stops, u = 1 - exp(-depth_m / depthScale)
#   depthScale : metres (bigger = colour reaches the deep tone further out)
#   skyHi/skyLo: reflected sky (zenith / horizon), sun: glint colour, foam / foamShade: foam body / shadow
#   bottom     : sea-bed colour seen through clear water, caustic: strength of the bed light web
#   wet        : darkening colour of freshly wet shore, film: swash water film tint
#   slush      : amount of ice slush bits on snow-bank shores, sss: crest glow colour
PALETTES = {
    'winter_sea': {
        'row': 0, 'depthScale': 2.2,
        'lut': [[0.00, '#A9DCE6', 0.30], [0.10, '#78C7D8', 0.62], [0.24, '#45A3C9', 0.86],
                [0.45, '#2C7DBA', 0.97], [0.70, '#2164AA', 1.0], [1.00, '#1A4E92', 1.0]],
        'skyHi': '#5E8FC8', 'skyLo': '#DCEBF6', 'sun': '#FFF8E8', 'sss': '#3FB4D2',
        'foam': '#FFFFFF', 'foamShade': '#B9D7EC', 'bottom': '#8FA8B8', 'caustic': 0.55,
        'wet': '#7C93AE', 'film': '#BFE6F0', 'slush': 1.0,
    },
    'harbor': {
        'row': 1, 'depthScale': 1.6,
        'lut': [[0.00, '#A8D8CF', 0.35], [0.12, '#6DB9B6', 0.70], [0.28, '#3B98A8', 0.90],
                [0.50, '#2A7A9E', 0.98], [0.75, '#21628F', 1.0], [1.00, '#1A4C78', 1.0]],
        'skyHi': '#5F8CB8', 'skyLo': '#D6E6EE', 'sun': '#FFF6E2', 'sss': '#46B3B0',
        'foam': '#FFFFFF', 'foamShade': '#B4D3DC', 'bottom': '#7E8E86', 'caustic': 0.35,
        'wet': '#6D7F86', 'film': '#BFE2E2', 'slush': 0.0,
    },
    'tropical': {
        'row': 2, 'depthScale': 2.8,
        'lut': [[0.00, '#E6F7F0', 0.00], [0.08, '#B4F0E6', 0.22], [0.20, '#5FDCD6', 0.55],
                [0.36, '#26C2CC', 0.80], [0.56, '#14A3BC', 0.94], [0.78, '#1186A8', 1.0],
                [1.00, '#0F6C93', 1.0]],
        'skyHi': '#56A6DA', 'skyLo': '#E4F6FA', 'sun': '#FFFBEA', 'sss': '#4FE3D6',
        'foam': '#FFFFFF', 'foamShade': '#BDE6EC', 'bottom': '#EBD9B4', 'caustic': 0.9,
        'wet': '#BFA27A', 'film': '#C8F4EE', 'slush': 0.0,
    },
    'pool': {
        'row': 3, 'depthScale': 1.2,
        'lut': [[0.00, '#D8F8FF', 0.15], [0.25, '#8EE3F4', 0.50], [0.55, '#45C6EA', 0.78],
                [1.00, '#1F9AD6', 0.92]],
        'skyHi': '#6FB4E4', 'skyLo': '#F0FAFF', 'sun': '#FFFFFF', 'sss': '#6FE6F4',
        'foam': '#FFFFFF', 'foamShade': '#C4E8F4', 'bottom': '#CDEFF7', 'caustic': 1.0,
        'wet': '#9DB4C0', 'film': '#D8F6FF', 'slush': 0.0,
    },
}
LUT_ROWS = 8          # spare rows for game-defined palettes (Water.js can write rows 4..7 at run time)

# Shore wet/dry ramps (u = 0 dry ... 0.5 wet ... 1 under water), one row per material
SHORE_RAMPS = [
    ('sand', [[0.0, '#F3E6CB'], [0.30, '#E9D5AE'], [0.55, '#CDB08A'], [0.80, '#BB9E7A'], [1.0, '#A99B85']]),
    ('snowbank', [[0.0, '#F4F7FB'], [0.35, '#DCE6F0'], [0.60, '#AFC2D4'], [0.85, '#8DA3B8'], [1.0, '#7F95A8']]),
    ('rock', [[0.0, '#A9AFB8'], [0.40, '#8D939E'], [0.65, '#636B78'], [1.0, '#4E5867']]),
    ('quay', [[0.0, '#C9CCD2'], [0.40, '#AEB3BC'], [0.70, '#7F8794'], [1.0, '#5D6676']]),
]


def ramp_rgb(stops, u):
    """stops [[u, '#hex', (a)], ...] -> rgb (and a) arrays for the 1-D positions u"""
    us = np.array([s[0] for s in stops], np.float32)
    cols = np.array([F.hexc(s[1]) for s in stops], np.float32)
    rgb = np.stack([np.interp(u, us, cols[:, i]) for i in range(3)], -1)
    a = None
    if len(stops[0]) > 2:
        a = np.interp(u, us, np.array([s[2] for s in stops], np.float32))
    return rgb, a


# --------------------------------------------------------------------------- FFT ocean
def ocean_field(n, tile_m, peak_m, wind_deg, spread, seed, min_m, max_m, gamma=3.3):
    """Periodic height field (metres) + its exact slopes on an n x n grid covering tile_m x tile_m.
    JONSWAP-like spectrum around peak_m, cos^2s directional spreading around wind_deg (G space,
    0 = +x, 90 = +y), band-limited to [min_m, max_m] wavelengths (longer waves are the swell's job)."""
    rng = np.random.default_rng(seed)
    d = tile_m / n
    k1 = 2 * np.pi * np.fft.fftfreq(n, d=d)
    kx = k1[None, :].astype(np.float64)
    ky = k1[:, None].astype(np.float64)
    k = np.hypot(kx, ky)
    k[0, 0] = 1e-9
    kp = 2 * np.pi / peak_m
    S = k ** -4 * np.exp(-1.25 * (kp / k) ** 2)
    sig = np.where(k <= kp, 0.07, 0.09)
    S *= gamma ** np.exp(-((k - kp) ** 2) / (2 * sig ** 2 * kp ** 2))
    th = np.arctan2(ky, kx) - math.radians(wind_deg)
    D = np.abs(np.cos(th / 2)) ** (2 * spread)
    kmax, kmin = 2 * np.pi / min_m, 2 * np.pi / max_m
    band = np.exp(-(k / kmax) ** 2) * (1 - np.exp(-(k / kmin) ** 4))
    amp = np.sqrt(S * D / k * band)
    amp[0, 0] = 0
    H = amp * (rng.standard_normal((n, n)) + 1j * rng.standard_normal((n, n))) / math.sqrt(2)
    h = np.real(np.fft.ifft2(H))
    hx = np.real(np.fft.ifft2(1j * kx * H)) / 1.0
    hy = np.real(np.fft.ifft2(1j * ky * H))
    hxx = np.real(np.fft.ifft2(-kx * kx * H))
    hyy = np.real(np.fft.ifft2(-ky * ky * H))
    hxy = np.real(np.fft.ifft2(-kx * ky * H))
    return h, hx, hy, (hxx, hyy, hxy)


def normalise_slopes(hx, hy, target_std):
    s = math.sqrt(float((hx ** 2 + hy ** 2).mean()) / 2)
    f = target_std / max(s, 1e-12)
    return hx * f, hy * f, f


def caustics(hx, hy, focus, ss=3, blur=0.7):
    """Light-web on the sea bed under a periodic surface: every surface sample refracts the sun
    straight down and lands displaced by -focus * slope (texels); photon density on the periodic
    grid = caustic intensity (exactly tileable). Returns 0..1 (bright thin web, dark cells)."""
    n = hx.shape[0]
    # supersample the slope field (periodic, spectral) so the splats are dense
    def up(a):
        A = np.fft.fft2(a)
        m = n * ss
        B = np.zeros((m, m), complex)
        h2 = n // 2
        B[:h2, :h2] = A[:h2, :h2]
        B[:h2, -h2:] = A[:h2, -h2:]
        B[-h2:, :h2] = A[-h2:, :h2]
        B[-h2:, -h2:] = A[-h2:, -h2:]
        return np.real(np.fft.ifft2(B)) * ss * ss
    sx, sy = up(hx), up(hy)
    m = n * ss
    yy, xx = np.mgrid[0:m, 0:m].astype(np.float64)
    px = (xx + 0.5) / ss - focus * sx
    py = (yy + 0.5) / ss - focus * sy
    # bilinear splat into an (n*2) grid with wrap
    g = n * 2
    fx, fy = px * 2 - 0.5, py * 2 - 0.5
    x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    tx, ty = fx - x0, fy - y0
    acc = np.zeros(g * g)
    for ox, oy, w in ((0, 0, (1 - tx) * (1 - ty)), (1, 0, tx * (1 - ty)), (0, 1, (1 - tx) * ty), (1, 1, tx * ty)):
        idx = ((y0 + oy) % g) * g + ((x0 + ox) % g)
        np.add.at(acc, idx.ravel(), w.ravel())
    acc = acc.reshape(g, g)
    acc = F.blur(acc.astype(np.float32), blur * 2, wrap=True)
    acc = F.downsample_wrap(acc[..., None], 2)[..., 0]
    acc /= acc.mean()
    # tone: dark cells, bright filaments
    c = np.clip((acc - 0.75) / 1.6, 0, None)
    c = 1 - np.exp(-2.2 * c)
    c /= max(np.percentile(c, 99.7), 1e-6)
    return np.clip(c, 0, 1).astype(np.float32)


def waves_texture(n, tile_m, peak_m, wind_deg, spread, seed, min_m, max_m, slope_std, focus_k):
    h, hx, hy, (hxx, hyy, hxy) = ocean_field(n, tile_m, peak_m, wind_deg, spread, seed, min_m, max_m)
    # slopes are dimensionless (metres per metre) -> scale to the wanted roughness
    hx, hy, f = normalise_slopes(hx, hy, slope_std)
    lap = (hxx + hyy) * f * (tile_m / n)          # curvature per texel
    focus = focus_k / max(float(lap.std()), 1e-9)
    nz = 1.0 / np.sqrt(1 + hx ** 2 + hy ** 2)
    nx, ny = -hx * nz, -hy * nz
    c = caustics(hx.astype(np.float64), hy.astype(np.float64), focus)
    rgb = np.dstack([0.5 + 0.5 * nx, 0.5 + 0.5 * ny, c]).astype(np.float32)
    info = {'slopeStd': round(float(math.sqrt((hx ** 2 + hy ** 2).mean() / 2)), 4),
            'maxSlope': round(float(np.abs(np.dstack([hx, hy])).max()), 3), 'causticFocusTexels': round(focus, 1)}
    return rgb, (h * f), info


# --------------------------------------------------------------------------- foam
def foam_texture(n=256):
    """R = lace potential, G = bubbles / slush ice bits, B = smooth variation noise (all tile)."""
    # lace: bubble walls (Worley F2 - F1 ridges) at two scales, holes at the cell centres
    f1a, f2a, _ = F.worley(n, n, 18, 401, jitter=0.95)
    f1b, f2b, _ = F.worley(n, n, 36, 402, jitter=0.95)
    ra = 1 - np.clip((f2a - f1a) / 5.0, 0, 1)
    rb = 1 - np.clip((f2b - f1b) / 3.2, 0, 1)
    nz = F.fft_noise(n, n, 403, scale=9.0)
    lace = 0.50 * ra + 0.32 * rb + 0.18 * np.clip(0.5 + 0.25 * nz, 0, 1)
    lace = F.blur(lace.astype(np.float32), 0.6, wrap=True)
    lace = (lace - lace.min()) / (lace.max() - lace.min())
    # equalise so thresholds behave linearly (uniform histogram)
    order = np.argsort(lace.ravel(), kind='stable')
    eq = np.empty(n * n, np.float32)
    eq[order] = np.linspace(0, 1, n * n, dtype=np.float32)
    lace = 0.65 * eq.reshape(n, n) + 0.35 * lace
    # bubbles / slush: round blobs of varied size
    g1, _, gid = F.worley(n, n, 22, 404, jitter=0.85)
    rr = np.random.default_rng(405).random(22 * 22).astype(np.float32)
    rad = 1.2 + 4.2 * rr[gid] ** 1.6
    blobs = np.clip((rad - g1) / 1.3, 0, 1) * (rr[gid] > 0.18)
    g2, _, gid2 = F.worley(n, n, 46, 406, jitter=0.9)
    rr2 = np.random.default_rng(407).random(46 * 46).astype(np.float32)
    blobs2 = np.clip((0.9 + 1.8 * rr2[gid2] - g2) / 1.0, 0, 1) * (rr2[gid2] > 0.45)
    bub = np.maximum(blobs, 0.7 * blobs2)
    # variation: smooth, low frequency, equalised to 0..1
    v = F.fft_noise(n, n, 408, scale=26.0) * 0.8 + F.fft_noise(n, n, 409, scale=60.0) * 0.6
    v = 0.5 + 0.5 * np.tanh(v * 0.9)
    return np.dstack([lace, bub, v]).astype(np.float32)


# --------------------------------------------------------------------------- LUT + ramps
def lut_texture():
    w = 256
    out = np.zeros((LUT_ROWS, w, 4), np.float32)
    out[..., 3] = 1
    u = (np.arange(w) + 0.5) / w
    for name, p in PALETTES.items():
        rgb, a = ramp_rgb(p['lut'], u)
        out[p['row'], :, :3] = rgb
        out[p['row'], :, 3] = a
    # spare rows = winter_sea (Water.js may overwrite them with game palettes)
    for r in range(len(PALETTES), LUT_ROWS):
        out[r] = out[0]
    return out


def ramp_texture():
    w = 256
    u = (np.arange(w) + 0.5) / w
    rows = [ramp_rgb(st, u)[0] for _, st in SHORE_RAMPS]
    return np.stack(rows, 0).astype(np.float32)


# --------------------------------------------------------------------------- save / preview
def to_u8(a):
    return (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)


def save_rgb(arr, name):
    path = os.path.join(OUT, name + '.png')
    Image.fromarray(to_u8(arr), 'RGB').save(path, optimize=True)
    return path


def save_rgba(arr, name):
    path = os.path.join(OUT, name + '.png')
    Image.fromarray(to_u8(arr), 'RGBA').save(path, optimize=True)
    return path


def tiled(img, nx=2, ny=2):
    w, h = img.size
    out = Image.new(img.mode, (w * nx, h * ny))
    for j in range(ny):
        for i in range(nx):
            out.paste(img, (i * w, j * h))
    return out


def relief(rgb):
    """normal map -> lit grey relief (sun upper-left) for previews"""
    nx = rgb[..., 0] * 2 - 1
    ny = rgb[..., 1] * 2 - 1
    nz = np.sqrt(np.clip(1 - nx ** 2 - ny ** 2, 0, 1))
    L = np.array([-0.45, -0.6, 0.66])
    L /= np.linalg.norm(L)
    s = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    return np.repeat(s[..., None], 3, -1)


def preview(texs, lut, ramp):
    """docs/previews/water_textures.png: every channel tiled 2x2 (seams would show as lines through
    the middle), the palettes and the shore ramps, plus a quick 'how it combines' swatch."""
    cell = 384
    labels = [('waves_a: normal (lit)', Image.fromarray(to_u8(relief(texs['a'])))),
              ('waves_a: caustics (B)', Image.fromarray(to_u8(texs['a'][..., 2]))),
              ('waves_b: normal (lit)', Image.fromarray(to_u8(relief(texs['b'])))),
              ('waves_b: caustics (B)', Image.fromarray(to_u8(texs['b'][..., 2]))),
              ('foam: lace (R)', Image.fromarray(to_u8(texs['f'][..., 0]))),
              ('foam: bubbles (G)', Image.fromarray(to_u8(texs['f'][..., 1]))),
              ('foam: variation (B)', Image.fromarray(to_u8(texs['f'][..., 2]))),
              ('lace thresholds 0.75 / 0.55 / 0.35', None)]
    cols = 4
    rows = 2
    W = cols * (cell + 12) + 12
    H = rows * (cell + 30) + 30 + 330
    im = Image.new('RGB', (W, H), (34, 40, 52))
    dr = ImageDraw.Draw(im)
    dr.text((12, 8), 'assets/water textures - each tile repeated 2x2 (seams would cross the centre); '
            'G space (iso ground, 64 px/m) is sampled 2:1 in game', fill=(230, 235, 245))
    for i, (lab, img) in enumerate(labels):
        x = 12 + (i % cols) * (cell + 12)
        y = 30 + (i // cols) * (cell + 30)
        if img is None:
            lace = texs['f'][..., 0]
            th = np.zeros(lace.shape + (3,), np.float32)
            base = np.array(F.hexc('#2569B2'))
            th[:] = base
            for t, col in ((0.35, '#B9D7EC'), (0.55, '#E3F0F8'), (0.75, '#FFFFFF')):
                m = np.clip((lace - t) * 20 + 0.5, 0, 1)[..., None]
                th = th * (1 - m) + np.array(F.hexc(col)) * m
            img = Image.fromarray(to_u8(th))
        t = tiled(img.convert('RGB'))
        im.paste(t.resize((cell, cell), Image.LANCZOS), (x, y))
        dr.text((x, y + cell + 4), lab, fill=(220, 226, 236))
    # palettes
    y = 30 + rows * (cell + 30) + 6
    dr.text((12, y), 'water_lut rows (u = 1 - exp(-depth/depthScale); top half = colour, bottom half = colour over the bed '
            'by opacity)', fill=(230, 235, 245))
    y += 18
    for name, p in PALETTES.items():
        row = lut[p['row']]
        bed = np.array(F.hexc(p['bottom']))
        over = row[:, :3] * row[:, 3:4] + bed * (1 - row[:, 3:4])
        strip = np.concatenate([np.repeat(row[None, :, :3], 22, 0), np.repeat(over[None], 22, 0)], 0)
        img = Image.fromarray(to_u8(strip)).resize((900, 44), Image.NEAREST)
        im.paste(img, (12, y))
        dr.text((924, y + 14), '%s (depthScale %.1f m)' % (name, p['depthScale']), fill=(220, 226, 236))
        y += 52
    dr.text((12, y), 'water_shore_ramp rows: dry -> wet -> under water', fill=(230, 235, 245))
    y += 18
    for i, (name, _) in enumerate(SHORE_RAMPS):
        img = Image.fromarray(to_u8(np.repeat(ramp[i][None], 14, 0))).resize((900, 14), Image.NEAREST)
        im.paste(img, (12, y))
        dr.text((924, y), name, fill=(220, 226, 236))
        y += 18
    os.makedirs(PREV, exist_ok=True)
    im = im.crop((0, 0, W, min(H, y + 10)))
    im.save(os.path.join(PREV, 'water_textures.png'), optimize=True)


def seam(a, axis):
    a = a.astype(np.float32)
    if axis == 0:
        a = np.swapaxes(a, 0, 1)
    edge = np.abs(a[:, 0] - a[:, -1]).mean()
    d = np.abs(a[:, 1:] - a[:, :-1]).mean(axis=tuple(i for i in range(a.ndim) if i != 1))
    local = np.concatenate([d[:3], d[-3:]]).mean()
    return float(edge / max(local, 1e-4, 0.2 * d.mean()))


# --------------------------------------------------------------------------- manifest
def merge_manifest(images, info):
    """Write / merge assets/water/manifest.json. gen_water_fx.py adds the FX sheets to the same
    file; each generator only replaces the entries it owns."""
    path = os.path.join(OUT, 'manifest.json')
    man = {}
    if os.path.exists(path):
        with open(path) as f:
            man = json.load(f)
    keep_images = [im for im in man.get('images', []) if im['key'] not in {i['key'] for i in images}]
    man['version'] = 1
    man['generator'] = 'tools/fx/gen_water.py (+ tools/fx/gen_water_fx.py for the fx sheets)'
    conv = man.get('conventions', {})
    conv.update({
        'gspace': 'G = (screen x, 2 * screen y) world px = the iso ground plane seen from above (1 m = 64 G px). '
                  'Water.js samples every texture with uv = G / tilePx (2:1 foreshortening like the ground). '
                  'Image row 0 = v 0 = smallest G y.',
        'data': 'water_waves_a / water_waves_b / water_foam / water_shore_ramp are DATA textures: plain RGB, no alpha, '
                'upload with UNPACK_PREMULTIPLY_ALPHA false and UNPACK_COLORSPACE_CONVERSION NONE, REPEAT + mipmaps '
                '(all power of two). water_lut is RGBA (A = opacity), CLAMP, no mipmaps.',
        'module': 'src/systems/Water.js draws the sea with these (WebGL); Canvas fallback = ground/water_sea tileSprite.',
        'levels': 'sea surface 0.55 m below land = waterPx 30 screen px (same as assets/harbor). Water.js heightAt() '
                  'returns the swell height in screen px around that plane (+ = up).',
    })
    man['conventions'] = conv
    man['images'] = keep_images + images
    sprites = man.get('sprites', {})
    for im in images:
        sprites[im['key']] = {k: v for k, v in im.items() if k not in ('key', 'png')}
        sprites[im['key']]['image'] = im['key']
        sprites[im['key']]['kind'] = 'data'
    man['sprites'] = sprites
    man['palettes'] = PALETTES
    man['shoreRamps'] = [name for name, _ in SHORE_RAMPS]
    man['textureInfo'] = info
    man['waterPx'] = 30
    os.makedirs(OUT, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(man, f, indent=1)
    return path


def main():
    os.makedirs(OUT, exist_ok=True)
    # layer A: 8 m tile, ripples 0.45 .. 4 m, peak 1.4 m, wind from the north-west, broad spreading
    a, ha, info_a = waves_texture(512, 8.0, 1.4, 70, 3, 1101, 0.35, 4.0, 0.20, 0.95)
    # layer B: 3 m tile (sampled at 192 G px), fine ripples 0.12 .. 1.2 m, other direction
    b, hb, info_b = waves_texture(256, 3.0, 0.5, 125, 2, 1202, 0.10, 1.4, 0.22, 0.9)
    f = foam_texture(256)
    lut = lut_texture()
    ramp = ramp_texture()
    images = [
        {'key': 'water_waves_a', 'png': 'water/water_waves_a.png', 'frameSize': [512, 512], 'tilePx': 512,
         'channels': 'R,G = ripple normal x,y in G space (0.5 + 0.5 n); B = caustics', 'tile': 'xy',
         'notes': 'FFT (JONSWAP) ripple field, 8 m tile, peak 1.4 m; sample uv = G / 512.'},
        {'key': 'water_waves_b', 'png': 'water/water_waves_b.png', 'frameSize': [256, 256], 'tilePx': 192,
         'channels': 'R,G = ripple normal x,y; B = caustics', 'tile': 'xy',
         'notes': 'Fine ripple field, 3 m physical tile; Water.js samples it at 192 G px per tile.'},
        {'key': 'water_foam', 'png': 'water/water_foam.png', 'frameSize': [256, 256], 'tilePx': 256,
         'channels': 'R = foam lace potential (threshold it), G = bubbles / slush bits, B = low-frequency variation',
         'tile': 'xy', 'notes': 'Equalised lace: threshold t covers ~ (1 - t) of the area.'},
        {'key': 'water_lut', 'png': 'water/water_lut.png', 'frameSize': [256, LUT_ROWS], 'rows': {k: v['row'] for k, v in PALETTES.items()},
         'channels': 'RGB = water colour, A = opacity over the bed', 'tile': 'none',
         'notes': 'u = 1 - exp(-depth_m / palette.depthScale); sample v = (row + 0.5) / 8.'},
        {'key': 'water_shore_ramp', 'png': 'water/water_shore_ramp.png', 'frameSize': [256, 4],
         'rows': {name: i for i, (name, _) in enumerate(SHORE_RAMPS)}, 'channels': 'RGB', 'tile': 'none',
         'notes': 'wet/dry ramps per shore material: u 0 = dry, 0.5 = fresh wet, 1 = under water.'},
    ]
    save_rgb(a, 'water_waves_a')
    save_rgb(b, 'water_waves_b')
    save_rgb(f, 'water_foam')
    save_rgba(lut, 'water_lut')
    save_rgb(ramp, 'water_shore_ramp')
    seams = {}
    for k, arr in (('water_waves_a', a), ('water_waves_b', b), ('water_foam', f)):
        u8 = to_u8(arr).astype(np.float32)
        seams[k] = [round(seam(u8, 1), 3), round(seam(u8, 0), 3)]
    info = {'water_waves_a': info_a, 'water_waves_b': info_b, 'seams': seams}
    merge_manifest(images, info)
    preview({'a': a, 'b': b, 'f': f}, lut, ramp)
    tot = sum(os.path.getsize(os.path.join(OUT, im['png'].split('/')[-1])) for im in images)
    print(json.dumps({'textures_bytes': tot, 'info': info}, indent=1))


if __name__ == '__main__':
    main()
