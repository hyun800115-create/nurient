"""
gen_beach_ground.py - procedural Sunny Beach ground for Frost Village v7 (docs/CONTRACT_V7.md section W):
seamless sand textures, the sand <-> snow transition kit (both iso axes + corners) and the beach ground decals.
numpy + Pillow (+ imagequant) only, deterministic (fixed seeds), ~1 min.

    python3 tools/fx/gen_beach_ground.py            # build -> assets/beach/ (+ merges its keys into the manifest)
    python3 tools/fx/gen_beach_ground.py --only ground_sand,decal_towel_red   # scratch sheet in tools/fx/_cache only
    python3 tools/fx/check_beach_ground.py           # checks (also run at the end of a build)

Outputs (paths relative to assets/):
  beach/ground_sand.png, beach/ground_sand_wet.png    512x512 seamless (images[] + sprites kind "tile")
  beach/beach_ground_decals.png/.json                 atlas of every decal / transition piece (kind "decal")
  beach/manifest.json                                 ONLY the keys owned by this generator are rewritten
                                                      (generator "gen_beach_ground"); every other entry (the Blender
                                                      props of beach_pack.py) is kept as is.
  docs/previews/beach_ground.png                      sheet: textures 2x2, the transition kit composed on a cell
                                                      grid, every decal

Geometry (CONTRACT section 1, PPU 64, 2:1 iso; the same cell grid as assets/roads):
  * 1 m world X = (+45.25, +22.63) px (screen down-right), 1 m world Y = (+45.25, -22.63) px (screen up-right).
  * cell = sqrt(2) m = (64, 32) px along X, (64, -32) px along Y; lattice (i, j) = G + i*(64,32) + j*(64,-32).
  * Textures are drawn as repeating patterns (scale 1) anchored at the same grid origin G.
  * Transition kit (copy of the roads snow-bank rules): every cell is SAND or SNOW.
      X edge = segment lattice (i,j)-(i+1,j) between cells (i,j-1) and (i,j):
          ground_sand_snow_edge_x       snow cell (i,j) (+Y, screen up-right side), sand at -Y
          ground_sand_snow_edge_x_near  snow cell (i,j-1) (-Y), sand at +Y
        anchor = lattice (i,j) + (32, 16) px (the midpoint of the edge)
      Y edge = segment (i,j)-(i,j+1) between cells (i-1,j) and (i,j):
          ground_sand_snow_edge_y       snow cell (i-1,j) (-X), sand at +X
          ground_sand_snow_edge_y_near  snow cell (i,j) (+X), sand at -X
        anchor = lattice (i,j) + (32, -16) px
      three variants each (*, *_1, *_2): pick variant = (i*7 + j*13) mod 3 - the ends of every variant are identical, so
      any sequence joins seamlessly.
      Corners (anchor = the lattice point, quarters n = (-X,+Y) up, e = (+X,+Y) right, s = (+X,-Y) down,
      w = (-X,-Y) left):
          ground_sand_snow_corner_<q>   the cell in quarter q is SNOW, the other three SAND (a snowy block's corner)
          ground_sand_snow_inner_<q>    the cell in quarter q is SAND, the other three SNOW (sand bay's corner)
        a corner piece OWNS the first cell of both edges leaving the lattice point toward its quarter (do not draw edge
        pieces on those two cells).
    Draw order: ground_snow everywhere -> ground_sand on sand cells -> transition pieces -> decals -> sprites.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import fxlib as F  # noqa: E402
from fxlib import hexc  # noqa: E402
import gen_ground as GG  # noqa: E402   (read-only reuse: coords, relief, lerp3, periodic_conv, centred_kernel)
import pack_utils as pu  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'beach')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.path.join(HERE, '_cache')
N = 512
GEN = 'gen_beach_ground'
KX, KY = 45.2548, 22.6274
SEG = math.sqrt(2.0)
LXY = GG.LXY
WHITE = hexc('#FFFFFF')

SAND = '#F1E3C4'
SAND_HI = '#FBF3E0'
SAND_LO = '#D9C39C'
SAND_WET = '#CDB389'
SNOW = '#F4F7FB'
SNOW_LO = '#C9D6E8'


# =========================================================================== helpers

def world(X, Y, cx, cy):
    """Screen px (canvas coords) -> world metres (x along world X, y along world Y) around the anchor (cx, cy)."""
    a, b = (X - cx) / KX, (Y - cy) / KY
    return (a + b) / 2, (a - b) / 2


def screen(x, y):
    return (x + y) * KX, (x - y) * KY


def shade_height(h, ss, k=1.0):
    gy, gx = np.gradient(h.astype(np.float32), 1.0 / ss)
    return -(gx * LXY[0] + gy * LXY[1]) * k


def sm(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# =========================================================================== seamless textures

def tex_sand(ss=2):
    """Dry white sand: soft undulation, wind ripples running along world X that come and go, fine light / dark grains,
    a few shell crumbs.  Relief lit by the shared sun (upper-left)."""
    n = N * ss
    rng = np.random.default_rng(701)
    low = F.fft_noise(n, n, 11, scale=90 * ss)
    mid = F.fft_noise(n, n, 12, scale=22 * ss)
    # ripples: crests along world X = screen direction (2,1); band-pass noise stretched along that direction
    rip = F.fft_noise(n, n, 13, band=(1 / (15.0 * ss), 1 / (8.5 * ss)), aniso=5.0, angle=math.atan2(1, 2))
    rip = np.sign(rip) * np.abs(rip) ** 0.75
    rip *= np.clip(0.3 + 0.7 * F.fft_noise(n, n, 14, scale=60 * ss), 0, 1)
    h = low * 2.6 + mid * 0.8 + rip * 1.5
    lit = shade_height(h, 1, 1.0) * ss
    base = np.broadcast_to(hexc(SAND), (n, n, 3)).copy()
    rgb = GG.lerp3(base, hexc(SAND_LO), np.clip(-lit * 0.7 - low * 0.05, 0, 1) * 0.7)
    rgb = GG.lerp3(rgb, hexc(SAND_HI), np.clip(lit * 0.7 + low * 0.05, 0, 1) * 0.9)
    rgb = GG.lerp3(rgb, hexc('#E6D1A6'), np.clip(-mid * 0.4, 0, 1) * 0.6)
    rgb = F.downsample_wrap(rgb, ss)
    # grains at output resolution
    g = rng.random((N, N)).astype(np.float32)
    rgb = GG.lerp3(rgb, hexc('#B89B70'), (g > 0.965).astype(np.float32) * 0.5)
    rgb = GG.lerp3(rgb, hexc('#FFFDF6'), (g < 0.045).astype(np.float32) * 0.65)
    g2 = rng.random((N, N)).astype(np.float32)
    rgb = GG.lerp3(rgb, hexc('#A8865A'), (g2 > 0.994).astype(np.float32) * 0.6)
    rgb = GG.lerp3(rgb, hexc('#9AA3AE'), (g2 < 0.0015).astype(np.float32) * 0.7)
    # shell crumbs: tiny pink / white flecks with a soft halo
    imp = np.zeros((N, N), np.float32)
    pts = rng.integers(0, N, (90, 2))
    imp[pts[:, 1], pts[:, 0]] = 1.0
    fleck = GG.periodic_conv(imp, GG.centred_kernel(N, lambda dx, dy: np.exp(-(dx * dx * 0.5 + dy * dy * 1.0) / 1.2)))
    cols = np.where((np.arange(N)[None, :] + np.arange(N)[:, None]) % 3 == 0, 1.0, 0.0)[..., None]
    rgb = GG.lerp3(rgb, hexc('#FFFFFF') * cols + hexc('#F7C9C6') * (1 - cols), np.clip(fleck, 0, 1) * 0.8)
    return np.clip(rgb, 0, 1)


def tex_sand_wet(ss=2):
    """Wet sand left by the swash: darker, smooth and glossy (sky sheen streaks), backwash lace lines along world X,
    tiny bubble holes."""
    n = N * ss
    rng = np.random.default_rng(702)
    low = F.fft_noise(n, n, 21, scale=80 * ss)
    mid = F.fft_noise(n, n, 22, scale=16 * ss)
    rip = F.fft_noise(n, n, 23, band=(1 / (40.0 * ss), 1 / (22.0 * ss)), aniso=3.0, angle=math.atan2(1, 2))
    h = low * 1.4 + mid * 0.25 + rip * 0.35
    lit = shade_height(h, 1, 1.0) * ss
    base = np.broadcast_to(hexc(SAND_WET), (n, n, 3)).copy()
    rgb = GG.lerp3(base, hexc('#B79B71'), np.clip(-lit * 0.6, 0, 1) * 0.6)
    rgb = GG.lerp3(rgb, hexc('#DCC6A0'), np.clip(lit * 0.6, 0, 1) * 0.6)
    # glossy sky sheen: soft streaks stretched along world X, bluish-white
    sheen = F.fft_noise(n, n, 24, scale=10 * ss, aniso=4.0, angle=math.atan2(1, 2))
    sheen = np.clip(sheen * 0.5 + low * 0.35 - 0.75, 0, 1)
    rgb = GG.lerp3(rgb, hexc('#D9E1DF'), sheen * 0.4)
    # backwash lace: thin bright lines along world X with warp
    Xs, Ys = GG.coords(N, ss)
    a, b = GG.ab(Xs, Ys)
    warp = F.fft_noise(n, n, 25, scale=30 * ss) * 9.0
    P = 512.0 / 7.0
    phase = np.mod(b + warp, P) / P
    lace = np.exp(-((phase - 0.5) / 0.018) ** 2) * np.clip(0.5 + 0.5 * F.fft_noise(n, n, 26, scale=20 * ss), 0, 1)
    rgb = GG.lerp3(rgb, hexc('#EFE6D2'), lace * 0.45)
    rgb = GG.lerp3(rgb, hexc('#A88B62'), np.roll(lace, 2 * ss, 0) * 0.25)
    rgb = F.downsample_wrap(rgb, ss)
    g = rng.random((N, N)).astype(np.float32)
    rgb = GG.lerp3(rgb, hexc('#8E7350'), (g > 0.992).astype(np.float32) * 0.5)
    rgb = GG.lerp3(rgb, hexc('#F4EEE0'), (g < 0.004).astype(np.float32) * 0.7)
    return np.clip(rgb, 0, 1)


# =========================================================================== transition kit

W_BAND = 0.62          # half width of the transition band (m)
R_CORNER = 0.42        # rounding of convex / concave corners (m)


def edge_noise(s, seed, var=None):
    """Displacement of the boundary (m) as a function of the coordinate s along an edge; periodic with the cell
    (SEG) so every piece joins, + a per-variant term windowed to zero at the cell ends."""
    rng = np.random.default_rng(seed)
    out = np.zeros_like(s)
    for k, amp in ((1, 0.05), (2, 0.04), (3, 0.03), (5, 0.018), (8, 0.01)):
        out += amp * np.sin(math.tau * k * s / SEG + rng.uniform(0, math.tau))
    if var is not None and var > 0:
        r2 = np.random.default_rng(seed * 31 + var)
        w = np.sin(math.pi * np.mod(s, SEG) / SEG) ** 2
        v = np.zeros_like(s)
        for k, amp in ((2, 0.06), (3, 0.05), (6, 0.025)):
            v += amp * np.sin(math.tau * k * s / SEG + r2.uniform(0, math.tau))
        out += v * w
    return out


def quad_sdf(x, y, qx, qy, r):
    """Signed distance (m, + inside) to the rounded quadrant {qx*x > 0, qy*y > 0} (corner rounded by r)."""
    ax = -qx * x + r            # > 0: outside the shrunken quadrant along x
    ay = -qy * y + r
    out = np.where((ax > 0) | (ay > 0), np.hypot(np.maximum(ax, 0), np.maximum(ay, 0)), np.maximum(ax, ay))
    return r - out


def piece_fields(kind, x, y, var):
    """(d, s_noise) for a piece: d = signed distance (m) to the sand/snow boundary, + on the SNOW side; plus the
    boundary noise already added.  kind: ('edge', axis, snow_sign) | ('corner', qx, qy) | ('inner', qx, qy)."""
    if kind[0] == 'edge':
        _, axis, sgn = kind
        if axis == 'x':
            s = x + SEG / 2
            d = sgn * y
            seed = 3
        else:
            s = y + SEG / 2
            d = sgn * x
            seed = 5
        return d + edge_noise(s, seed, var)
    _, qx, qy = kind
    q = quad_sdf(x, y, qx, qy, R_CORNER)
    if kind[0] == 'inner':
        q = -q
    # boundary noise: blend the X-arm noise (s = x, seed 3) and the Y-arm noise (s = y, seed 5) by which arm is nearer
    nx = edge_noise(np.mod(x, SEG), 3)
    ny = edge_noise(np.mod(y, SEG), 5)
    wx = sm(-0.15, 0.15, np.abs(qy * y) - np.abs(qx * x))      # 1 near the X arm (|y| small vs |x|)
    wx = 1 - wx
    nz = nx * wx + ny * (1 - wx)
    return q + nz


def owned_box(kind):
    """World box (x0, x1, y0, y1) a piece owns (cut lines perpendicular to its edges)."""
    w = W_BAND
    if kind[0] == 'edge':
        if kind[1] == 'x':
            return (-SEG / 2, SEG / 2, -w, w)
        return (-w, w, -SEG / 2, SEG / 2)
    _, qx, qy = kind
    xs = sorted([0.0, qx * SEG])
    ys = sorted([0.0, qy * SEG])
    # the arms run toward the quarter; the band extends w beyond the lattice point on the other side
    x0, x1 = (xs[0], xs[1] + w) if qx < 0 else (xs[0] - w, xs[1])
    y0, y1 = (ys[0], ys[1] + w) if qy < 0 else (ys[0] - w, ys[1])
    return (x0, x1, y0, y1)


def render_piece(kind, var=0, ss=4, seed=0):
    """RGBA image + integer anchor of one transition piece."""
    x0, x1, y0, y1 = owned_box(kind)
    corners = [screen(x, y) for x in (x0, x1) for y in (y0, y1)]
    sx0 = math.floor(min(c[0] for c in corners)) - 3
    sx1 = math.ceil(max(c[0] for c in corners)) + 3
    sy0 = math.floor(min(c[1] for c in corners)) - 6
    sy1 = math.ceil(max(c[1] for c in corners)) + 3
    W, H = sx1 - sx0, sy1 - sy0
    ax, ay = -sx0, -sy0
    c = F.Canvas(W, H, ss=ss)
    x, y = world(c.X, c.Y, ax, ay)
    # partition-of-unity weight across the cut lines (ramp of +-CUT_RAMP m): two neighbouring pieces overlap by the
    # ramp and alpha' = 1 - (1 - alpha)^w composites back to exactly one continuous transition (no seam line)
    rmp = 0.035
    inside = np.ones_like(x)
    for dist in (x - x0, x1 - x, y - y0, y1 - y):
        inside = inside * np.clip(0.5 + dist / (2 * rmp), 0, 1)
    d = piece_fields(kind, x, y, var)
    # snow clumps on the sand side + sand dust on the snow side (deterministic, away from the cut lines)
    rng = np.random.default_rng(1000 + seed * 7 + var * 13)
    clump = np.zeros_like(x)
    dust = np.zeros_like(x)
    for k in range(6):
        if kind[0] == 'edge':
            if kind[1] == 'x':
                px, py = rng.uniform(-SEG / 2 + 0.2, SEG / 2 - 0.2), -kind[2] * rng.uniform(0.12, 0.42)
            else:
                px, py = -kind[2] * rng.uniform(0.12, 0.42), rng.uniform(-SEG / 2 + 0.2, SEG / 2 - 0.2)
        else:
            px, py = rng.uniform(x0 + 0.25, x1 - 0.25), rng.uniform(y0 + 0.25, y1 - 0.25)
        rr = rng.uniform(0.04, 0.09)
        bl = np.exp(-(((x - px) / rr) ** 2 + ((y - py) / (rr * 0.8)) ** 2))
        clump = np.maximum(clump, bl)
        bx, by = px + rng.uniform(-0.3, 0.3), py + rng.uniform(-0.3, 0.3)
        dust = np.maximum(dust, np.exp(-(((x - bx) / 0.08) ** 2 + ((y - by) / 0.06) ** 2)))
    hgt = sm(-0.04, 0.08, d) * 4.0 + clump * 2.5 * (d < 0) + sm(0.05, 0.4, d) * 1.0
    hgt = F.blur(hgt, 0.6 * ss)
    lit = shade_height(hgt, ss, 1.0) * 0.55
    snow_amt = np.clip(sm(-0.02, 0.05, d) + (clump > 0.45) * (d < 0) * 0.9, 0, 1)
    # colours: sand side (damp melt band right at the edge) / snow side (sand dust fading in)
    sandc = np.broadcast_to(hexc(SAND), x.shape + (3,)).copy()
    gr = rng.random(x.shape).astype(np.float32)
    sandc = GG.lerp3(sandc, hexc('#C9AE84'), (gr > 0.992).astype(np.float32) * 0.6)
    sandc = GG.lerp3(sandc, hexc(SAND_HI), (gr < 0.012).astype(np.float32) * 0.7)
    sandc = GG.lerp3(sandc, hexc('#E7D4AE'), np.clip(np.sin(x * 37.0 + y * 11.0) * np.sin(y * 29.0 - x * 7.0), 0, 1)
                      * 0.35)
    damp = np.exp(-((d + 0.1) / 0.12) ** 2) * (d < 0.02)
    sandc = GG.lerp3(sandc, hexc('#D9C29A'), damp * 0.45)
    snowc = np.broadcast_to(hexc(SNOW), x.shape + (3,)).copy()
    dusting = np.clip(np.exp(-np.maximum(d, 0) / 0.09) * 0.22 + dust * 0.3 * (d > 0), 0, 0.6)
    snowc = GG.lerp3(snowc, hexc('#E9DCC0'), dusting)
    col = GG.lerp3(sandc, snowc, snow_amt)
    col = GG.lerp3(col, hexc(SNOW_LO), np.clip(-lit, 0, 1) * 0.8)
    col = GG.lerp3(col, WHITE, np.clip(lit, 0, 1) * 0.7)
    # alpha: opaque over the hard texture seam (|d_true| small), fading to 0 at the band edge
    alpha = 1.0 - sm(W_BAND * 0.55, W_BAND * 0.98, np.abs(d))
    alpha = np.maximum(alpha, (clump > 0.2) * np.clip(clump * 1.6, 0, 1) * (d < 0))
    alpha = 1.0 - np.power(np.clip(1.0 - alpha, 1e-6, 1.0), inside)
    alpha = np.where(inside <= 0, 0.0, alpha)
    c.rgb[...] = col * alpha[..., None]
    c.a[...] = alpha
    return c.image(), (ax, ay)


EDGE_KINDS = {
    'ground_sand_snow_edge_x': (('edge', 'x', 1), 'X edge with the SNOW cell at +Y (screen up-right), sand at -Y.'),
    'ground_sand_snow_edge_x_near': (('edge', 'x', -1), 'X edge with the snow cell at -Y (screen down-left), sand at '
                                                        '+Y.'),
    'ground_sand_snow_edge_y': (('edge', 'y', -1), 'Y edge with the snow cell at -X (screen up-left), sand at +X.'),
    'ground_sand_snow_edge_y_near': (('edge', 'y', 1), 'Y edge with the snow cell at +X (screen down-right), sand at '
                                                       '-X.'),
}
QUARTERS = {'n': (-1, 1), 'e': (1, 1), 's': (1, -1), 'w': (-1, -1)}


def build_kit():
    out = {}
    for key, (kind, note) in EDGE_KINDS.items():
        for v in range(3):
            k = key if v == 0 else '%s_%d' % (key, v)
            im, an = render_piece(kind, v, seed=len(key))
            out[k] = (im, an, {'piece': 'edge', 'family': 'sand_snow', 'axis': kind[1],
                               'side': 'far' if (kind[1] == 'x') == (kind[2] > 0) else 'near',
                               'step': [64, 32] if kind[1] == 'x' else [64, -32], 'cells': 1, 'variantOf': key,
                               'variants': [key, key + '_1', key + '_2'],
                               'notes': 'Sand <-> snow transition, 1 cell long: ' + note + ' Anchor = midpoint of '
                                        'the cell edge; snow lip with a damp melt band on the sand, sand dust '
                                        'blowing onto the snow.'})
    for q, (qx, qy) in QUARTERS.items():
        im, an = render_piece(('corner', qx, qy), 0, seed=11 + qx + 3 * qy)
        out['ground_sand_snow_corner_' + q] = (im, an, {
            'piece': 'corner', 'family': 'sand_snow_corner', 'quarter': [qx, qy], 'quarterDir': q,
            'notes': 'Rounded corner of a SNOW cell sticking into the sand: the cell in quarter %s is snow, the other '
                     'three sand. Anchor = the lattice point; owns the first cell of both edges leaving it toward its '
                     'quarter.' % q})
        im, an = render_piece(('inner', qx, qy), 0, seed=21 + qx + 3 * qy)
        out['ground_sand_snow_inner_' + q] = (im, an, {
            'piece': 'corner', 'family': 'sand_snow_inner', 'quarter': [qx, qy], 'quarterDir': q,
            'notes': 'Concave corner (sand bay): the cell in quarter %s is SAND, the other three snow. Anchor = the '
                     'lattice point; owns the first cell of both edges leaving it toward its quarter.' % q})
    return out


# =========================================================================== decals

def canvas_for(wm, hm, pad=0.15):
    """Canvas that fits a world rectangle |x| <= wm/2, |y| <= hm/2 (+pad) with the anchor at its centre."""
    pts = [screen(sx * (wm / 2 + pad), sy * (hm / 2 + pad)) for sx in (-1, 1) for sy in (-1, 1)]
    hw = math.ceil(max(abs(p[0]) for p in pts)) + 2
    hh = math.ceil(max(abs(p[1]) for p in pts)) + 2
    return hw * 2, hh * 2, (hw, hh)


def decal_footprints():
    """Bare footprints walking along world X: heel, sole, five toes pressed into dry sand (shaded rims)."""
    W, H, (ax, ay) = canvas_for(2.8, 0.6)
    ss = 4
    c = F.Canvas(W, H, ss=ss)
    x, y = world(c.X, c.Y, ax, ay)
    d = np.full(x.shape, 9.0, np.float32)
    for k in range(6):
        uc = -1.15 + k * 0.46
        vc = 0.09 if k % 2 == 0 else -0.09
        side = 1 if k % 2 == 0 else -1
        u, v = x - uc, y - vc
        sole = np.hypot(u / 0.09, v / 0.045) - 1.0
        heel = np.hypot((u + 0.1) / 0.045, v / 0.04) - 1.0
        f = np.minimum(sole * 0.045, heel * 0.04)
        for t, (tu, tv, tr) in enumerate(((0.12, -0.03, 0.022), (0.125, -0.005, 0.017), (0.122, 0.015, 0.015),
                                         (0.115, 0.032, 0.013), (0.105, 0.046, 0.011))):
            toe = np.hypot(u - tu, v - side * tv) / tr - 1.0
            f = np.minimum(f, toe * tr)
        d = np.minimum(d, f)
    pr = np.clip(-d / 0.02, 0, 1)
    hgt = -F.blur(pr, 1.0 * ss) * 3.0 + F.blur(np.clip(1 - np.abs(d) / 0.03, 0, 1), 1.2 * ss) * 0.8
    lit = shade_height(hgt, ss, 0.9)
    col = np.broadcast_to(hexc(SAND), x.shape + (3,)).copy()
    col = GG.lerp3(col, hexc('#C4A97C'), pr * 0.9)
    col = GG.lerp3(col, hexc('#B79D72'), np.clip(-lit, 0, 1) * 0.8)
    col = GG.lerp3(col, hexc(SAND_HI), np.clip(lit, 0, 1) * 0.8)
    a = np.clip(F.blur(np.clip(1 - d / 0.035, 0, 1), 1.0 * ss) * 1.2, 0, 1)
    c.rgb[...] = col * a[..., None]
    c.a[...] = a
    return c.image(), (ax, ay), {'notes': 'Bare footprints walking along world X (screen down-right), 6 prints over '
                                          '2.8 m; flipX for the other direction, use rotation-free (iso).'}


def shell_sprite(c, px, py, kind, col, s, rot_):
    """Tiny painted shell at screen px (py) in canvas c."""
    R = c.region(px - s * 2, py - s * 2, px + s * 2, py + s * 2)
    if R.empty:
        return
    if kind == 'scallop':
        X, Y = F.rot(R.X, R.Y, px, py, rot_)
        fan = F.sd_ellipse(X, Y, px, py, s * 1.1, s * 0.7)
        R.fill(F.sd_ellipse(X + 0.8, Y - 0.8, px, py, s * 1.1, s * 0.7), hexc('#7A6248'), 0.35)
        R.fill(fan, hexc(col))
        for k in range(-2, 3):
            seg = F.sd_segment(X, Y, px, py + s * 0.6, px + k * s * 0.4, py - s * 0.55, 0.25)
            R.fill(seg, hexc(col) * 0.82)
        R.fill(F.sd_box(X, Y, px, py + s * 0.62, s * 0.35, s * 0.18, 0.5), hexc(col) * 0.9)
    elif kind == 'cone':
        X, Y = F.rot(R.X, R.Y, px, py, rot_)
        R.fill(F.sd_ellipse(X + 0.8, Y - 0.8, px, py, s * 1.2, s * 0.5), hexc('#7A6248'), 0.3)
        R.fill(F.sd_ellipse(X, Y, px, py, s * 1.2, s * 0.5), hexc(col))
        for k in range(3):
            R.fill(F.sd_segment(X, Y, px - s * (0.8 - k * 0.5), py - s * 0.45, px - s * (0.5 - k * 0.5),
                                py + s * 0.45, 0.25), hexc(col) * 0.78)
    elif kind == 'star':
        R.fill(F.sd_star(R.X + 0.8, R.Y - 0.8, px, py, s * 1.3, s * 0.55, 5, rot_, 0.6), hexc('#7A4A30'), 0.3)
        R.fill(F.sd_star(R.X, R.Y, px, py, s * 1.3, s * 0.55, 5, rot_, 0.6), hexc(col))
        R.fill(F.sd_circle(R.X, R.Y, px - 0.4, py - 0.4, s * 0.25), hexc('#FFE3C2'), 0.7)
    else:  # pebble
        R.fill(F.sd_ellipse(R.X + 0.7, R.Y - 0.7, px, py, s * 0.9, s * 0.6), hexc('#5E4634'), 0.35)
        R.fill(F.sd_ellipse(R.X, R.Y, px, py, s * 0.9, s * 0.6), hexc(col))
        R.fill(F.sd_ellipse(R.X, R.Y, px - s * 0.25, py - s * 0.2, s * 0.35, s * 0.2), WHITE, 0.45)


def decal_shells():
    W, H = 220, 110
    c = F.Canvas(W, H, ss=4)
    rng = np.random.default_rng(31)
    kinds = [('scallop', '#F7E4D6'), ('scallop', '#F6C3C8'), ('cone', '#F3D2B0'), ('scallop', '#FFFFFF'),
             ('pebble', '#9AA3AE'), ('pebble', '#C9B8A0'), ('star', '#F2894E'), ('cone', '#E9B9C9'),
             ('scallop', '#F9D9A8'), ('pebble', '#B7A48A')]
    for k, (kind, col) in enumerate(kinds):
        a = rng.uniform(0, math.tau)
        rr = math.sqrt(rng.uniform(0.05, 1.0))
        px = W / 2 + math.cos(a) * rr * 80
        py = H / 2 + math.sin(a) * rr * 34
        shell_sprite(c, px, py, kind, col, rng.uniform(4.2, 6.0) if kind != 'star' else 7.0, rng.uniform(0, 6.28))
    return c.image(), (W // 2, H // 2), {'notes': 'Scattered shells, pebbles and a little starfish on the sand '
                                                  '(~2.5 x 1.2 m patch).'}


def decal_seaweed():
    """Wrack line: washed-up seaweed strands along world X with shells and dried foam crumbs."""
    W, H, (ax, ay) = canvas_for(3.0, 0.7)
    ss = 4
    c = F.Canvas(W, H, ss=ss)
    x, y = world(c.X, c.Y, ax, ay)
    rng = np.random.default_rng(41)
    damp = np.exp(-((y - 0.04 * np.sin(x * 3.1)) / 0.22) ** 2) * sm(1.5, 1.2, np.abs(x))
    lay = c.layer()
    lay.paint(damp * 0.55, hexc('#D8C29C'))
    c.over(lay)
    cols = ['#3E6B3A', '#56803E', '#6B5A2E', '#2F5A3A', '#7A8A3A']
    for k in range(26):
        x0 = rng.uniform(-1.35, 1.35)
        y0 = rng.uniform(-0.12, 0.12)
        ln = rng.uniform(0.15, 0.4)
        ang = rng.uniform(-0.6, 0.6)
        pts = []
        for t in np.linspace(0, 1, 7):
            xx = x0 + math.cos(ang) * ln * t
            yy = y0 + math.sin(ang) * ln * t + 0.04 * math.sin(t * 6 + k)
            pts.append(screen(xx, yy))
        pts = [(px + ax, py + ay) for px, py in pts]
        d = F.sd_polyline(c.X, c.Y, pts, rng.uniform(0.9, 1.6))
        c.fill(F.sd_polyline(c.X + 0.7, c.Y - 0.7, pts, 1.3), hexc('#5E4A30'), 0.25)
        c.fill(d, hexc(cols[k % len(cols)]))
    for k in range(9):
        px, py = screen(rng.uniform(-1.3, 1.3), rng.uniform(-0.2, 0.2))
        shell_sprite(c, px + ax, py + ay, ['scallop', 'cone', 'pebble'][k % 3],
                     ['#F7E4D6', '#F6C3C8', '#C9B8A0'][k % 3], rng.uniform(2.8, 4.0), rng.uniform(0, 6.28))
    for k in range(40):
        px, py = screen(rng.uniform(-1.4, 1.4), rng.uniform(-0.25, 0.25))
        c.fill(F.sd_circle(c.X, c.Y, px + ax, py + ay, rng.uniform(0.5, 1.2)), hexc('#F7F3EA'), 0.8)
    return c.image(), (ax, ay), {'notes': 'Wrack line along world X: washed-up seaweed strands, shells, dried foam '
                                          'crumbs on a damp streak (put it along the high-water line).'}


def decal_sand_ripples():
    W, H, (ax, ay) = canvas_for(2.6, 1.6)
    ss = 4
    c = F.Canvas(W, H, ss=ss)
    x, y = world(c.X, c.Y, ax, ay)
    rip = np.sin(math.tau * (y + 0.05 * np.sin(x * 4.0)) / 0.2)
    rip = np.sign(rip) * np.abs(rip) ** 0.6
    mask = np.clip(1.0 - np.hypot(x / 1.3, y / 0.8), 0, 1) ** 0.7
    hgt = rip * mask * 1.6
    lit = shade_height(hgt, ss, 0.9)
    col = np.broadcast_to(hexc(SAND), x.shape + (3,)).copy()
    col = GG.lerp3(col, hexc('#C2A574'), np.clip(-lit, 0, 1))
    col = GG.lerp3(col, hexc(SAND_HI), np.clip(lit, 0, 1))
    a = np.clip(mask * 1.4, 0, 1) ** 0.8 * (0.25 + 0.75 * np.clip(np.abs(lit) * 2.5, 0, 1))
    c.rgb[...] = col * a[..., None]
    c.a[...] = a
    return c.image(), (ax, ay), {'notes': 'Patch of pronounced wind ripples (crests along world X) fading out at '
                                          'the edges; scatter a few for variety.'}


TOWELS = {'red': ('#E8524A', '#F7F3EA', '#F7C948'), 'blue': ('#3D86D6', '#F7F3EA', '#7FD3E0'),
          'yellow': ('#F7C948', '#F49A3A', '#F7F3EA'), 'green': ('#4FB06A', '#F7F3EA', '#F28DB2')}


def decal_towel(name, cols, axis='y'):
    """Beach towel lying flat (0.8 x 1.6 m, long side along world `axis`): woven stripes, white end bands, a cream
    fringe at both ends, soft wrinkles and a faint lifted edge shadow."""
    wm, hm = (0.8, 1.6) if axis == 'y' else (1.6, 0.8)
    W, H, (ax, ay) = canvas_for(wm, hm, pad=0.12)
    ss = 4
    c = F.Canvas(W, H, ss=ss)
    x, y = world(c.X, c.Y, ax, ay)
    u, v = (x, y) if axis == 'y' else (-y, x)          # u across (0.8 m), v along (1.6 m), head at +v
    rng = np.random.default_rng(len(name) * 7)
    # outline with a slight wave, corners rounded
    hw, hh = 0.4, 0.8
    du = np.abs(u) - hw + 0.012 * np.sin(v * 9 + 1.0)
    dv = np.abs(v) - hh
    d = np.hypot(np.maximum(du, 0), np.maximum(dv, 0)) + np.minimum(np.maximum(du, dv), 0) - 0.02
    cov = np.clip(-d / 0.008, 0, 1)
    main, stripe, accent = cols
    col = np.broadcast_to(hexc(main), x.shape + (3,)).copy()
    band = np.mod(u + hw, 0.2) < 0.06
    col = np.where(band[..., None], hexc(stripe), col)
    ends = np.abs(v) > hh - 0.18
    col = np.where((ends & (np.abs(np.abs(v) - (hh - 0.11)) < 0.04))[..., None], hexc(accent), col)
    col = np.where((ends & (np.abs(np.abs(v) - (hh - 0.11)) >= 0.04) & (np.abs(v) > hh - 0.18))[..., None],
                   hexc('#F7F3EA'), col)
    # wrinkles: soft folds across the towel
    wr = np.zeros_like(u)
    for k in range(4):
        vv = rng.uniform(-0.6, 0.6)
        wr += np.exp(-((v - vv - 0.08 * np.sin(u * 5 + k)) / 0.05) ** 2) * rng.uniform(0.4, 1.0)
    hgt = wr * 1.5 + F.blur(cov, 1.5 * ss) * 1.2
    lit = shade_height(hgt, ss, 0.8)
    col = GG.lerp3(col, col * 0.72, np.clip(-lit, 0, 1))
    col = GG.lerp3(col, WHITE, np.clip(lit, 0, 1) * 0.35)
    # weave texture
    weave = (np.sin(u * 400) * np.sin(v * 400)) * 0.03
    col = np.clip(col + weave[..., None], 0, 1)
    lay = c.layer()
    # contact shadow (lower-right), then the towel
    sh = F.shift(cov, 2.0 * ss, 1.5 * ss)
    sh = F.blur(sh, 1.5 * ss)
    lay.paint(np.clip(sh, 0, 1) * 0.35, hexc('#7A6248'))
    c.over(lay)
    t2 = c.layer()
    t2.rgb[...] = col * cov[..., None]
    t2.a[...] = cov
    c.over(t2)
    # fringe tassels at both ends
    for sv in (-1, 1):
        for k in range(15):
            uu = -hw + 0.03 + k * (2 * hw - 0.06) / 14
            p0 = (uu, sv * (hh - 0.01))
            p1 = (uu + rng.uniform(-0.01, 0.01), sv * (hh + 0.06))
            if axis == 'y':
                a0, a1 = screen(*p0), screen(*p1)
            else:
                a0, a1 = screen(p0[1], -p0[0]), screen(p1[1], -p1[0])
            c.fill(F.sd_segment(c.X, c.Y, a0[0] + ax, a0[1] + ay, a1[0] + ax, a1[1] + ay, 0.55), hexc('#F3E6C8'))
    lie = screen(*((0.0, -0.1) if axis == 'y' else (0.1, 0.0)))
    head = screen(*((0.0, 0.55) if axis == 'y' else (-0.55, 0.0)))
    extra = {'lyingPoints': [[int(round(lie[0])), int(round(lie[1]))]], 'lyingHeadPoints': [[int(round(head[0])),
                                                                                              int(round(head[1]))]],
             'lyingDirs': ['NE' if axis == 'y' else 'NW'], 'lyingAxis': axis, 'lyingHeightM': 0.0,
             'notes': 'Beach towel (%s) lying flat, long side along world %s (0.8 x 1.6 m): ground decal. lyingPoints '
                      '= hip point of a sunbather on their back (beachfolk `sunbathe`), lyingHeadPoints = the head end, '
                      'lyingDirs = screen direction from hips to head.' % (name, axis.upper())}
    return c.image(), (ax, ay), extra


def decal_volleyball_court(axis='y'):
    """Beach volleyball court lines (blue rope, 3.6 x 7.0 m, long axis along world `axis`) with corner pegs; the net
    stands on the middle line (volleyball_net for axis y, volleyball_net_y for axis x)."""
    wm, hm = (3.6, 7.0) if axis == 'y' else (7.0, 3.6)
    W, H, (ax, ay) = canvas_for(wm, hm, pad=0.25)
    ss = 3
    c = F.Canvas(W, H, ss=ss)
    pts = [screen(sx * wm / 2, sy * hm / 2) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    pts = [(px + ax, py + ay) for px, py in pts]
    loop = pts + [pts[0]]
    d = F.sd_polyline(c.X, c.Y, loop, 1.7)
    c.fill(F.sd_polyline(c.X + 1.0, c.Y - 0.6, loop, 1.9), hexc('#B79D72'), 0.35)
    c.fill(d, hexc('#2E86C9'))
    c.fill(F.sd_polyline(c.X - 0.4, c.Y - 0.4, loop, 0.6), hexc('#8FD0F2'), 0.6)
    for px, py in pts:
        c.fill(F.sd_circle(c.X, c.Y, px, py, 3.2), hexc('#E8524A'))
        c.fill(F.sd_circle(c.X, c.Y, px - 0.8, py - 0.8, 1.2), WHITE, 0.7)
    # sand scuffs inside the court (played-on sand)
    x, y = world(c.X, c.Y, ax, ay)
    rng = np.random.default_rng(9 if axis == 'y' else 10)
    sc = np.zeros_like(x)
    for k in range(18):
        px, py = rng.uniform(-wm / 2 + 0.3, wm / 2 - 0.3), rng.uniform(-hm / 2 + 0.3, hm / 2 - 0.3)
        sc = np.maximum(sc, np.exp(-(((x - px) / 0.25) ** 2 + ((y - py) / 0.18) ** 2)))
    lay = c.layer()
    lay.paint(sc * 0.3, hexc('#D3BC93'))
    c.under(lay)
    corners = [[int(round(p[0] - ax)), int(round(p[1] - ay))] for p in pts]
    return c.image(), (ax, ay), {'courtM': [wm, hm], 'cornerPoints': corners, 'netAxis': 'x' if axis == 'y' else 'y',
                                 'notes': 'Beach volleyball court lines (blue rope with red corner pegs), %s x %s m, '
                                          'long axis along world %s. Put %s at the anchor (the court centre).'
                                          % (wm, hm, axis.upper(), 'volleyball_net' if axis == 'y' else
                                             'volleyball_net_y')}


def build_decals():
    out = {}
    im, an, ex = decal_footprints()
    out['decal_footprints_sand'] = (im, an, ex)
    im, an, ex = decal_shells()
    out['decal_shells'] = (im, an, ex)
    im, an, ex = decal_seaweed()
    out['decal_seaweed'] = (im, an, ex)
    im, an, ex = decal_sand_ripples()
    out['decal_sand_ripples'] = (im, an, ex)
    for nm, cols in TOWELS.items():
        out['decal_towel_' + nm] = decal_towel(nm, cols, 'y')
        out['decal_towel_%s_x' % nm] = decal_towel(nm, cols, 'x')
    out['decal_volleyball_court'] = decal_volleyball_court('y')
    out['decal_volleyball_court_x'] = decal_volleyball_court('x')
    return out


# =========================================================================== build

TEXTURES = {
    'ground_sand': (tex_sand, 'Dry white sand (seamless 512, pattern anchored at the grid origin G, scale 1): soft '
                              'undulation, wind ripples along world X that come and go, fine grains and shell crumbs.'),
    'ground_sand_wet': (tex_sand_wet, 'Wet sand left by the swash (seamless 512): darker, smooth and glossy with '
                                      'sky-sheen streaks, faint backwash lace lines along world X, bubble holes. The '
                                      'Water module draws its own animated wet band; use this for static wet areas.'),
}


def kit_compose_preview(kit, sand, snow):
    """A small cell map composed with the kit (exactly the placement rules) for the preview sheet."""
    grid = ["SSSSSSSS",
            "SSAAAASS",
            "SAAAAAAS",
            "SAAAAAAS",
            "SSAAASSS",
            "SSSAASSS",
            "SSSSSSSS"]
    nj, ni = len(grid), len(grid[0])

    def cell(i, j):
        if 0 <= j < nj and 0 <= i < ni:
            return grid[nj - 1 - j][i]
        return 'S'
    G = (40, 40 + nj * 32)
    Wd, Hd = 80 + 64 * (ni + nj), 80 + 32 * (ni + nj)

    def L(i, j):
        return (G[0] + i * 64 + j * 64, G[1] + i * 32 - j * 32)
    img = Image.new('RGBA', (Wd, Hd), (0, 0, 0, 0))
    # snow everywhere, sand on sand cells
    def tile(tex):
        t = Image.new('RGBA', (Wd, Hd))
        for ty in range(0, Hd, tex.height):
            for tx in range(0, Wd, tex.width):
                t.paste(tex, (tx, ty))
        return t
    img.alpha_composite(tile(snow))
    mask = Image.new('L', (Wd, Hd), 0)
    dr = ImageDraw.Draw(mask)
    for j in range(nj):
        for i in range(ni):
            if cell(i, j) == 'A':
                dr.polygon([L(i, j), L(i + 1, j), L(i + 1, j + 1), L(i, j + 1)], fill=255)
    img.paste(tile(sand), (0, 0), mask)
    owned = set()
    pieces = []
    for j in range(-1, nj + 1):
        for i in range(-1, ni + 1):
            q = {(-1, 1): cell(i - 1, j), (1, 1): cell(i, j), (1, -1): cell(i, j - 1), (-1, -1): cell(i - 1, j - 1)}
            snow_q = [k for k, v in q.items() if v == 'S']
            if len(snow_q) == 1:
                qx, qy = snow_q[0]
                name = 'ground_sand_snow_corner_' + {(-1, 1): 'n', (1, 1): 'e', (1, -1): 's', (-1, -1): 'w'}[snow_q[0]]
            elif len(snow_q) == 3:
                sand_q = [k for k, v in q.items() if v != 'S'][0]
                qx, qy = sand_q
                name = 'ground_sand_snow_inner_' + {(-1, 1): 'n', (1, 1): 'e', (1, -1): 's', (-1, -1): 'w'}[sand_q]
            else:
                continue
            pieces.append((name, L(i, j)))
            owned.add(('x', i if qx > 0 else i - 1, j))
            owned.add(('y', i, j if qy > 0 else j - 1))
    for j in range(-1, nj + 1):
        for i in range(-1, ni + 1):
            a, b = cell(i, j - 1), cell(i, j)
            if a != b and ('x', i, j) not in owned:
                nm = 'ground_sand_snow_edge_x' if b == 'S' else 'ground_sand_snow_edge_x_near'
                v = (i * 7 + j * 13) % 3
                p = L(i, j)
                pieces.append((nm if v == 0 else '%s_%d' % (nm, v), (p[0] + 32, p[1] + 16)))
            a, b = cell(i - 1, j), cell(i, j)
            if a != b and ('y', i, j) not in owned:
                nm = 'ground_sand_snow_edge_y' if a == 'S' else 'ground_sand_snow_edge_y_near'
                v = (i * 7 + j * 13) % 3
                p = L(i, j)
                pieces.append((nm if v == 0 else '%s_%d' % (nm, v), (p[0] + 32, p[1] - 16)))
    for name, (px, py) in pieces:
        im, (ax, ay), _ = kit[name]
        img.alpha_composite(im, (int(px - ax), int(py - ay)))
    return img


def preview(texs, kit, decals, out):
    tiles = []
    for k, im in texs.items():
        t = Image.new('RGB', (1024, 1024))
        for y in (0, 512):
            for x in (0, 512):
                t.paste(im, (x, y))
        tiles.append((k, t.resize((512, 512), Image.LANCZOS)))
    snow = Image.open(os.path.join(ROOT, 'assets', 'ground', 'ground_snow.png')).convert('RGBA') \
        if os.path.exists(os.path.join(ROOT, 'assets', 'ground', 'ground_snow.png')) else \
        Image.new('RGBA', (64, 64), hexc_rgba(SNOW))
    comp = kit_compose_preview(kit, texs['ground_sand'].convert('RGBA'), snow)
    W = 1700
    # layout: textures row, kit composite, decals shelf on sand
    from PIL import ImageFont
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
    except OSError:
        f = ImageFont.load_default()
    shelf = []
    for k, (im, an, ex) in list(decals.items()) + [(k, v) for k, v in kit.items() if k.endswith(('_x', '_y',
                                                                                                    'corner_n',
                                                                                                    'inner_n'))]:
        bb = im.getbbox() or (0, 0, 1, 1)
        shelf.append((k, im.crop(bb)))
    sx, sy, sh = 10, 0, 0
    pos = []
    for k, im in shelf:
        slot = max(im.width, int(f.getlength(k)) + 4)      # the label must not run into the next decal's label
        if sx + slot + 10 > W:
            sx = 10
            sy += sh + 30
            sh = 0
        pos.append((k, im, sx + (slot - im.width) // 2, sy))
        sx += slot + 24
        sh = max(sh, im.height)
    shelf_h = sy + sh + 40
    H = 40 + 512 + 40 + comp.height + 40 + shelf_h
    sheet = Image.new('RGBA', (W, H), (226, 232, 240, 255))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), 'assets/beach ground (gen_beach_ground.py): seamless textures tiled 2x2 at 0.5x, the sand<->snow '
                     'kit composed on a cell map at 1x, decals at 1x on sand', fill=(30, 34, 44), font=f)
    xx = 10
    for k, t in tiles:
        sheet.paste(t, (xx, 36))
        d.text((xx, 36 + 514), k, fill=(30, 34, 44), font=f)
        xx += 530
    y0 = 36 + 512 + 30
    sheet.alpha_composite(comp, (10, y0))
    d.text((10 + comp.width + 10, y0 + 20), 'transition kit: snow cells around a sand bay\n(edge pieces x / x_near / y '
                                             '/ y_near,\n3 variants each, corner_* and inner_*)', fill=(30, 34, 44),
           font=f)
    y1 = y0 + comp.height + 30
    sand = Image.new('RGBA', (W, shelf_h), (241, 227, 196, 255))
    tex = texs['ground_sand'].convert('RGBA')
    for ty in range(0, shelf_h, 512):
        for tx in range(0, W, 512):
            sand.paste(tex, (tx, ty))
    sheet.alpha_composite(sand, (0, y1))
    for k, im, px, py in pos:
        sheet.alpha_composite(im, (px, y1 + py + 6))
        d.text((px + im.width // 2, y1 + py + 8 + im.height), k, fill=(40, 34, 28), font=f, anchor='ma')
    sheet.convert('RGB').save(out, optimize=True)


def hexc_rgba(h):
    c = hexc(h)
    return tuple(int(v * 255) for v in c) + (255,)


def merge_manifest(entries, images, atlas_json_key):
    path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    man = dict(old)
    man.setdefault('version', 1)
    sprites = {k: v for k, v in (old.get('sprites') or {}).items() if v.get('generator') != GEN}
    sprites.update(entries)
    man['sprites'] = sprites
    imgs = [i for i in (old.get('images') or []) if i.get('key') not in images]
    imgs += [{'key': k, 'png': 'beach/%s.png' % k} for k in images]
    man['images'] = imgs
    atl = [a for a in (old.get('atlases') or []) if a.get('key') != atlas_json_key]
    atl.append({'key': atlas_json_key, 'png': 'beach/%s.png' % atlas_json_key,
                'json': 'beach/%s.json' % atlas_json_key})
    man['atlases'] = atl
    conv = dict(man.get('conventions') or {})
    conv['ground'] = ('gen_beach_ground: ground_sand / ground_sand_wet = 512 seamless textures (draw as patterns '
                      'anchored at the grid origin G, scale 1; the cell grid of assets/roads: one cell = sqrt(2) m = '
                      '(64, 32) px along X, (64, -32) along Y). ground_sand_snow_* = the sand<->snow transition kit '
                      '(placement rules in sandKit). decal_* = flat ground decals (draw on the ground layer below '
                      'every depth-sorted sprite).')
    man['conventions'] = conv
    man['sandKit'] = {
        'cellM': SEG, 'cellPx': {'x': [64, 32], 'y': [64, -32]},
        'layers': ['1 ground_snow everywhere', '2 ground_sand (or ground_sand_wet) on SAND cells',
                   '3 ground_sand_snow_edge_* / _corner_* / _inner_*', '4 decal_* (towels, shells, court ...)',
                   'then depth-sorted sprites'],
        'edgeRule': 'X edge = segment lattice (i,j)-(i+1,j) between cells (i,j-1) and (i,j): ground_sand_snow_edge_x if '
                    'the SNOW cell is (i,j) (+Y), ground_sand_snow_edge_x_near if it is (i,j-1); anchor = lattice (i,j) + '
                    '(32,16). Y edge = segment (i,j)-(i,j+1) between cells (i-1,j) and (i,j): ground_sand_snow_edge_y if '
                    'the snow cell is (i-1,j) (-X), _y_near if it is (i,j); anchor = lattice (i,j) + (32,-16). Variant = '
                    '(i*7 + j*13) mod 3 -> suffix "", "_1", "_2".',
        'cornerRule': 'At every lattice point look at its 4 cells (quarters n = (-X,+Y), e = (+X,+Y), s = (+X,-Y), '
                      'w = (-X,-Y)): exactly one SNOW -> ground_sand_snow_corner_<that quarter>; exactly three SNOW -> '
                      'ground_sand_snow_inner_<the sand quarter>. Anchor = the lattice point. A corner piece owns the '
                      'first cell of both edges leaving the point toward its quarter: skip the edge pieces there. '
                      'Diagonal checkerboards (two snow cells on a diagonal) are not supported.',
        'reference': 'tools/fx/gen_beach_ground.py kit_compose_preview() implements these rules.'}
    man['generator'] = man.get('generator') or 'tools/blender/beach_render.py + beach_pack.py; tools/fx/gen_beach_ground.py'
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def build(only=None):
    os.makedirs(CACHE, exist_ok=True)
    texs = {}
    for k, (fn, note) in TEXTURES.items():
        if only and k not in only:
            continue
        texs[k] = F.to_rgb_image(fn())
    kit = build_kit() if not only or any(k.startswith('ground_sand_snow') for k in only) else {}
    decals = build_decals() if not only or any(k.startswith('decal_') for k in only) else {}
    if only:
        ents = [(k, im) for k, im in texs.items()] + [(k, v[0]) for k, v in list(kit.items()) + list(decals.items())
                                                       if k in only or not only]
        x, W = 10, 1600
        hh = max(im.height for _, im in ents) + 30
        sheet = Image.new('RGBA', (W, hh * (1 + len(ents) // 3)), (241, 227, 196, 255))
        y = 0
        for k, im in ents:
            if x + im.width > W:
                x, y = 10, y + hh
            sheet.alpha_composite(im.convert('RGBA'), (x, y))
            x += im.width + 10
        sheet.save(os.path.join(CACHE, 'beach_ground_only.png'))
        print('scratch sheet ->', os.path.join(CACHE, 'beach_ground_only.png'))
        return
    os.makedirs(OUT, exist_ok=True)
    entries = {}
    for k, im in texs.items():
        F.save_png(im, os.path.join(OUT, k + '.png'), quant=256, dither=0.75)
        entries[k] = {'image': k, 'anchor': [0.5, 0.5], 'kind': 'tile', 'tile': 'xy', 'frameSize': list(im.size),
                      'generator': GEN, 'notes': TEXTURES[k][1]}
    frames = []
    meta = {}
    for k, (im, an, ex) in list(kit.items()) + list(decals.items()):
        frames.append((k, im))
        meta[k] = (im.size, an, ex)
    sheet, atlas = pu.pack_atlas(frames, max_width=2048, trim=True, padding=2)
    akey = 'beach_ground_decals'
    png = os.path.join(OUT, akey + '.png')
    pu.save_atlas(sheet, atlas, png, os.path.join(OUT, akey + '.json'), quantize=False)
    import imagequant
    imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0,
                                  max_colors=256).save(png, optimize=True)
    for k, (size, an, ex) in meta.items():
        e = {'atlas': akey, 'frame': k, 'anchor': [round(an[0] / size[0], 5), round(an[1] / size[1], 5)],
             'anchorPx': [int(an[0]), int(an[1])], 'frameSize': list(size), 'kind': 'decal', 'layer': 'ground',
             'generator': GEN}
        e.update(ex)
        entries[k] = e
    merge_manifest(entries, list(texs), akey)
    os.makedirs(PREV, exist_ok=True)
    texs_s = {k: Image.open(os.path.join(OUT, k + '.png')).convert('RGB') for k in texs}
    preview(texs_s, kit, decals, os.path.join(PREV, 'beach_ground.png'))
    print('beach ground done -> %s (%d textures, %d decal / kit frames, atlas %dx%d)' % (
        OUT, len(texs), len(frames), sheet.width, sheet.height))
    import check_beach_ground as cbg
    errs, warns = cbg.check(verbose=False)
    for w in warns:
        print('WARNING', w)
    for e in errs:
        print('ERROR', e)
    print('check_beach_ground: %d errors, %d warnings' % (len(errs), len(warns)))
    if errs:
        sys.exit(1)


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='', help='comma separated keys -> scratch sheet in tools/fx/_cache only')
    a = ap.parse_args()
    build(set(k for k in a.only.split(',') if k) or None)
