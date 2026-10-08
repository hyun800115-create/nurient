"""
gen_fx_city_fx.py - CONTRACT_V8 §AC city FX spritesheets for Frost Village (fire, smoke, embers, hose, mist,
steam, fight cloud, alarm, sirens, demolition dust, question / idea / memory).  Library module, imported by
tools/fx/gen_fx_city.py (the builder).  Built on fxlib.py and the drawing helpers of gen_fx.py (imported
read-only: ball, glint, star5, puff_sdf, cloud, soft_mask).

House rules (handoff doc 04 §2.5): every sheet is NORMAL-blend artwork - saturated cores with darker warm / cool
rims - because ADD blending vanishes on the near-white snow.  One-shots: t = (i + lead) / (n - 1 + lead) so
frame 0 already shows the effect.  Loops: every motion is periodic in 2*pi*i/n (seamless last -> first frame).
Deterministic (fixed seeds), no I/O here.

Scratch preview (no assets touched):
    python3 tools/fx/gen_fx_city_fx.py --only fx_fire_bld_s,fx_smoke_column   # -> <tmp>/fv_cache/fx_city/
"""
import math
import os
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import fxlib as F                                       # noqa: E402
from fxlib import hexc, toy                             # noqa: E402
import gen_fx as GF                                     # noqa: E402  (read-only helpers)

WHITE = hexc('#FFFFFF')
CACHE = os.path.join(tempfile.gettempdir(), 'fv_cache', 'fx_city')


# =========================================================================== small helpers
def _t1(i, n, lead=0.7):
    """One-shot time 0..1 (frame 0 already shows the effect)."""
    return (i + lead) / (n - 1 + lead)


def _slc(c, x0, y0, x1, y1):
    """Index slices of the supersampled arrays covering the output-px box (clipped)."""
    s = c.ss
    H, W = c.a.shape
    i0 = min(H, max(0, int(math.floor(y0 * s))))
    i1 = min(H, max(i0, int(math.ceil(y1 * s))))
    j0 = min(W, max(0, int(math.floor(x0 * s))))
    j1 = min(W, max(j0, int(math.ceil(x1 * s))))
    return (slice(i0, i1), slice(j0, j1))


def _col(v):
    return hexc(v) if isinstance(v, str) else np.asarray(v, np.float32)


def _paint_grad(c, cov, y0, y1, top, bot, alpha=1.0):
    t = np.clip((c.Y - y0) / max(1e-3, y1 - y0), 0, 1)
    c.paint(cov, F.mix(_col(top), _col(bot), t), alpha)


# =========================================================================== flames
WOB_F, WOB_A = 6.0, 0.8      # travelling S-wiggle of a tongue: frequency (radians over its height), amplitude (x r)


def tongue_sd(X, Y, cx, by, h, r, sway=0.0, wob=0.0, ph=0.0, lean=0.0):
    """Toy flame tongue: round base of radius r sitting on y=by, a full belly and concave flanks tapering to a
    sharp tip h above the base-circle centre (half width r*(1-t)^1.35*(1+1.1t), t = height fraction).
    sway bends the upper part sideways (quadratic), wob adds a travelling wiggle, lean tilts it linearly.
    Returns an approximate signed distance (good enough for fills and a ~2 px outline)."""
    cy = by - r
    h = max(h, r * 1.2)
    t = (cy - Y) / h
    tc = np.clip(t, 0, 1)
    xc = cx + sway * tc ** 2 * h * 0.35 + lean * tc * h + wob * np.sin(tc * WOB_F - ph) * tc * r * WOB_A
    om = 1 - tc
    hw = r * om ** 1.35 * (1 + 1.1 * tc)
    dhw = r * (-1.35 * om ** 0.35 * (1 + 1.1 * tc) + 1.1 * om ** 1.35) / h      # d(hw)/dt / h = slope per px
    side = (np.abs(X - xc) - hw) / np.sqrt(1 + dhw * dhw)
    circ = np.hypot(X - cx, Y - cy) - r
    tipx = cx + sway * h * 0.35 + lean * h + wob * math.sin(WOB_F - ph) * r * WOB_A
    tip = np.hypot(X - tipx, Y - (cy - h)) - 0.6
    d = np.where(t <= 0, circ, np.where(t >= 1, tip, side))
    return np.minimum(d, circ).astype(np.float32)


def flame_union(c, tongues, k, scale_h=1.0, scale_r=1.0, lift=0.0, base=None):
    """Smooth union of tongues [(cx, by, h, r, sway, wob, ph, lean), ...] (+ optional base ellipse
    (cx, cy, rx, ry)) evaluated only near each tongue.  Inner layers = same tongues, shorter / thinner."""
    D = np.full(c.a.shape, 1e3, np.float32)
    for (cx, by, h, r, sway, wob, ph, lean) in tongues:
        hh, rr = h * scale_h, max(0.6, r * scale_r)
        reach = abs(sway) * hh * 0.4 + abs(lean) * hh + rr * 0.6 + k + 3
        sl = _slc(c, cx - rr - reach, by - lift - 2 * rr - hh - k - 3, cx + rr + reach, by - lift + k + 2)
        if c.a[sl].size == 0:
            continue
        d = tongue_sd(c.X[sl], c.Y[sl], cx, by - lift, hh, rr, sway, wob, ph, lean)
        D[sl] = F.smin(D[sl], d, k)
    if base is not None:
        bx, byy, rx, ry = base
        sl = _slc(c, bx - rx - k - 3, byy - ry - k - 3, bx + rx + k + 3, byy + ry + k + 3)
        d = F.sd_ellipse(c.X[sl], c.Y[sl], bx, byy, rx, ry)
        D[sl] = F.smin(D[sl], d, k * 1.5)
    return D


FIRE_LAYERS = [  # (scale_h, scale_r, lift, top colour, bottom colour, feather)
    (1.00, 1.00, 0.0, '#E8421C', '#FF6E22', 0.0),
    (0.72, 0.74, 2.0, '#FF8C1E', '#FFAA34', 0.25),
    (0.47, 0.52, 3.5, '#FFC83A', '#FFE070', 0.45),
    (0.24, 0.33, 4.5, '#FFF2B8', '#FFFBE4', 0.8),
]
FIRE_RIM = '#9E2412'


def paint_fire(c, tongues, k, base=None, ow=2.2, bevel=7.0, rim=FIRE_RIM, alpha=1.0, glow=True, fade=None):
    """Layered toy fire: dark-red rim + red-orange body (bevel-lit from the upper-left sun), orange, yellow and a
    pale core nested inside (shorter copies of the same tongues), plus an inner glow.
    fade = (y_solid, y_gone): the fire melts away toward its bottom (blends into the roof / wall it sits on)."""
    if fade is not None:
        L = c.layer()
        D0 = paint_fire(L, tongues, k, base, ow, bevel, rim, 1.0, glow, None)
        m = 1 - F.smoothstep(fade[0], fade[1], c.Y)
        c.over(L, alpha, mask=m)
        return D0
    D0 = flame_union(c, tongues, k, base=base)
    ys = c.Y[D0 < 0]
    if ys.size == 0:
        return D0
    y0, y1 = float(ys.min()), float(ys.max())
    c.fill(D0 - ow, hexc(rim), alpha)
    cores = []
    for j, (sh, sr, lift, top, bot, fea) in enumerate(FIRE_LAYERS):
        if j == 0:
            D = D0
        else:
            bb = None
            if base is not None:
                bx, byy, rx, ry = base
                bb = (bx, byy - lift * 1.5, rx * (1 - 0.13 * j), ry * (1 - 0.2 * j))
            D = flame_union(c, tongues, k * (1 - 0.15 * j), sh, sr, lift * (k / 6.0 + 0.6), base=bb)
        t = np.clip((c.Y - y0) / max(1.0, y1 - y0), 0, 1)
        base_col = F.mix(_col(top), _col(bot), t)
        if j <= 1:
            n = F.bevel_normals(D, bevel * (1 - 0.3 * j), c.px)
            s = F.lambert(n)
            base_col = F.shade(base_col, s, 0.35, 0.35, hexc('#C0281A') if j == 0 else hexc('#E0601A'))
        c.paint(c.cov(D, fea), base_col, alpha)
        cores.append(D)
    if glow:
        g = F.blur(c.cov(cores[2]), 5.0 * c.ss)
        c.paint(np.clip(g, 0, 1) * c.cov(D0), hexc('#FFE9A0'), 0.35 * alpha)
    # glossy streak on the upper-left of the body (toy look)
    gl = c.cov(D0 + bevel * 0.55, 1.0) * c.cov(-(cores[1] - 1.5)) * np.clip(1 - (c.Y - y0) / ((y1 - y0) * 0.75), 0, 1)
    sx = np.clip(-(np.gradient(D0, axis=1)) * 3, 0, 1)
    c.paint(gl * sx, hexc('#FFD0A0'), 0.35 * alpha)
    return D0


def halo(c, x, y, rx, ry, col='#FFB04A', a=0.3, edge=20.0):
    """Soft warm light glow (gaussian), faded to zero `edge` px before the frame borders so no box shows when the
    sheet is drawn over darker art (smoke, roofs)."""
    sl = _slc(c, x - rx * 2.6, y - ry * 2.6, x + rx * 2.6, y + ry * 2.6)
    r = np.hypot((c.X[sl] - x) / rx, (c.Y[sl] - y) / ry)
    k = np.zeros(c.a.shape, np.float32)
    k[sl] = np.exp(-r ** 2)
    win = (F.smoothstep(0, edge, c.X) * F.smoothstep(0, edge, c.w - c.X) * F.smoothstep(0, edge, c.Y) *
           F.smoothstep(0, edge, c.h - c.Y))
    c.paint(k * win, hexc(col), a)


def ember(c, x, y, s, a, hot=1.0):
    """Glowing ember dot: warm halo, dark-red rim (reads on snow), hot yellow core."""
    if a <= 0.02 or s <= 0.2:
        return
    R = c.region(x - s * 4, y - s * 4, x + s * 4, y + s * 4)
    if R.empty:
        return
    r = np.hypot(R.X - x, R.Y - y)
    R.paint(np.exp(-(r / (s * 2.2)) ** 2), hexc('#FFB03A'), a * 0.55)
    R.fill(r - s - 0.55, hexc('#B8341A'), a * 0.9)
    R.fill(r - s, F.mix(hexc('#FF7A1E'), hexc('#FFF2B0'), hot), a)


def lick(c, x, by, h, r, a, lean=0.0):
    """Detached little flame (a lick torn off the top of the fire)."""
    if a <= 0.02 or r < 0.6:
        return
    R = c.region(x - r * 2 - abs(lean) * h - 3, by - 2 * r - h - 3, x + r * 2 + abs(lean) * h + 3, by + 3)
    if R.empty:
        return
    d = tongue_sd(R.X, R.Y, x, by, h, r, 0.5, 0.0, 0.0, lean)
    R.fill(d - 1.4, hexc(FIRE_RIM), a)
    R.fill(d, hexc('#FF6A22'), a)
    d2 = tongue_sd(R.X, R.Y, x, by - r * 0.15, h * 0.5, r * 0.55, 0.5, 0.0, 0.0, lean)
    R.fill(d2, hexc('#FFB43A'), a, feather=0.4)


def crown_tongues(W, span, by, hmax, rmin, rmax, n_t, seed, ph, m_set=(1, 2, 3), dome=1.2, side_lean=0.15):
    """Tongue list for a building-fire crown: n_t tongues across `span` px, tallest in the middle (dome
    envelope), heights flicker with integer-harmonic sines (seamless loop over the phase ph)."""
    rng = np.random.default_rng(seed)
    out = []
    xs = np.linspace(-span / 2, span / 2, n_t)
    for j in range(n_t):
        main = j % 2 == 0                                   # big tongues with lower fillers in between
        x = xs[j] + rng.uniform(-0.2, 0.2) * span / n_t
        e = max(0.0, math.cos(min(1.0, abs(x) / (span / 2 + 1e-3)) * math.pi / 2)) ** dome
        h0 = hmax * (0.30 + 0.70 * e) * (rng.uniform(0.8, 1.06) if main else rng.uniform(0.42, 0.6))
        r = (rmin + (rmax - rmin) * (0.4 + 0.6 * e)) * (rng.uniform(0.92, 1.1) if main else rng.uniform(0.6, 0.75))
        m = int(m_set[int(rng.integers(0, len(m_set)))])
        p0 = rng.uniform(0, 2 * math.pi)
        p1 = rng.uniform(0, 2 * math.pi)
        hh = h0 * (1 + 0.15 * math.sin(ph * m + p0) + 0.07 * math.sin(ph * (m + 1) + p1))
        sway = 0.55 * math.sin(ph * m + p0 + 0.9) + 0.15 * math.sin(ph * 2 + p1)
        lean = side_lean * (x / (span / 2))
        out.append((W / 2 + x, by, hh, r, sway, 0.55, ph * m + p0, lean))
    return out


def sh_fire_bld(i, n, W, H, size):
    """Building-sized fire loop: a wide crown of toy flame tongues over a glowing base mass, a pulsing warm
    halo, licks tearing off the top and embers.  size = 's' | 'm' | 'l'.  Anchor = middle of the base of the
    fire (where it sits on the roof / wall top)."""
    P = {  # span, base ry, hmax, rmin, rmax, tongues, smooth k, outline, bevel, licks, embers, seed, ss
        's': (140, 12, 118, 10.5, 22.0, 9, 6.0, 2.3, 7.0, 4, 6, 31, 4),
        'm': (192, 15, 158, 13.0, 28.0, 11, 7.5, 2.6, 9.0, 5, 8, 47, 3),
        'l': (248, 18, 200, 15.0, 34.0, 13, 9.0, 2.9, 11.0, 6, 10, 59, 3),
    }[size]
    span, bry, hmax, rmin, rmax, n_t, k, ow, bev, n_l, n_e, seed, ss = P
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H, ss=ss)
    cx, by = W / 2, H * 0.86
    # warm halo (light cast on the wall / snow) - breathes
    halo(c, cx, by - hmax * 0.45, span * 0.62, hmax * 0.55, '#FFB04A', 0.30 + 0.05 * math.sin(ph * 2))
    halo(c, cx, by - 8, span * 0.45, bry * 1.1, '#FFD27A', 0.35 + 0.06 * math.sin(ph * 3 + 1))
    # embers
    for j in range(n_e):
        u = (i / n + j / n_e) % 1.0
        x0 = cx + (j - n_e / 2 + 0.5) * span / n_e * 0.8
        x = x0 + 12 * math.sin(2 * math.pi * u * (1 + j % 2) + j * 1.3) * (0.3 + u)
        y = by - hmax * 0.55 - (H * 0.86 - hmax * 0.55 - 6) * u
        ember(c, x, y, 1.5 + 0.6 * (j % 3 == 0), math.sin(math.pi * u) ** 0.7, hot=1 - u * 0.7)
    tongues = crown_tongues(W, span, by, hmax, rmin, rmax, n_t, seed, ph)
    # a few short side flames licking outward at the base
    rng = np.random.default_rng(seed + 1)
    for s in (-1, 1):
        p0 = rng.uniform(0, 6.28)
        tongues.append((cx + s * span * 0.47, by + 2, hmax * 0.26 * (1 + 0.2 * math.sin(ph * 2 + p0)), rmin * 0.9,
                        0.4 * math.sin(ph + p0), 1.0, ph * 2 + p0, 0.25 * s))
    base = (cx, by - bry * 0.55, span * 0.5, bry)
    # licks tearing off the top (each lives one loop, staggered)
    tops = sorted(tongues[:n_t:2], key=lambda q: abs(q[0] - cx))[:max(3, n_l)]   # stable: central main tongues
    for j in range(n_l):
        u = (i / n + j / n_l) % 1.0
        tx, tby, th, tr = tops[j % len(tops)][:4]
        ty = tby - tr - th * 0.8
        x = tx + (j % 2 * 2 - 1) * tr * 0.4 + 6 * math.sin(2 * math.pi * u + j)
        y = ty - u * hmax * 0.38
        r = tr * 0.36 * (1 - u) ** 0.8 * min(1.0, 0.45 + u * 6)
        lick(c, x, y, r * 3.6, r, min(1.0, (1 - u) * 6.0), lean=0.22 * math.sin(j * 2.3 + 1))
    paint_fire(c, tongues, k, base=base, ow=ow, bevel=bev, fade=(by - bry * 1.3, by + 1))
    return c.image()


def sh_fire_window(i, n, W=96, H=144):
    """Flames licking out of a window: inner orange glow where the window is, tongues spilling out of the upper
    half of the opening and curling up the wall, a couple of licks + sparks.  Anchor = window centre."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H)
    cx, cy = W / 2, H * 0.74
    halo(c, cx, cy - 10, 30, 34, '#FFB04A', 0.32 + 0.06 * math.sin(ph * 2))
    # glowing window light (soft, flickers) - the burning room seen through the opening
    k = 0.85 + 0.15 * math.sin(ph * 3 + 0.4)
    win = F.sd_box(c.X, c.Y, cx, cy, 13, 17, 5)
    c.paint(np.clip(F.blur(c.cov(win), 5.0 * c.ss), 0, 1), hexc('#FF9A2A'), 0.55 * k)
    c.paint(np.clip(F.blur(c.cov(win + 4), 4.0 * c.ss), 0, 1), hexc('#FFE27A'), 0.6 * k)
    by = cy - 4
    tongues = []
    rng = np.random.default_rng(7)
    for j, (dx, h, r, m) in enumerate(((-10, 40, 8.5, 1), (0, 62, 11.0, 2), (10, 46, 8.5, 1), (-4, 30, 7.0, 3),
                                       (6, 28, 7.0, 2))):
        p0 = rng.uniform(0, 6.28)
        hh = h * (1 + 0.16 * math.sin(ph * m + p0) + 0.06 * math.sin(ph * (m + 1) + p0 * 1.7))
        tongues.append((cx + dx, by, hh, r, 0.6 * math.sin(ph * m + p0 + 0.8), 0.6, ph * m + p0, 0.05))
    paint_fire(c, tongues, 5.0, base=(cx, by - 6, 15, 8), ow=2.0, bevel=6.0, fade=(by - 10, by + 8))
    for j in range(3):
        u = (i / n + j / 3) % 1.0
        x = cx + (j - 1) * 6 + 4 * math.sin(2 * math.pi * u + j)
        y = by - 52 - u * 26
        r = 5.0 * (1 - u) ** 0.8 * min(1.0, 0.45 + u * 6)
        lick(c, x, y, r * 2.4, r, min(1.0, (1 - u) * 6.0))
    for j in range(4):
        u = (i / n + j / 4 + 0.12) % 1.0
        ember(c, cx + (j - 1.5) * 8 + 6 * math.sin(2 * math.pi * u + j), by - 40 - u * 58, 1.6,
              math.sin(math.pi * u) ** 0.7, 1 - u * 0.7)
    return c.image()


# =========================================================================== billowing clouds (smoke / steam / dust)
def billow(c, lobes, col_fn, alpha_fn, lo_fn, rim_fn, rim_a=0.75, hi=0.45, lo=0.6, crease=0.0, feather=0.6,
           under=None):
    """Union of spheres seen from the front: lobes = [(x, y, r, z), ...].  Per pixel the highest sphere wins, so
    overlapping lobes form soft 3D billows with creases between them; lit from the shared upper-left sun.
    Colour / alpha / shadow tint / rim colour are functions of the pixel y (so a rising column stays seamless)."""
    H = np.full(c.a.shape, -1e4, np.float32)
    D = np.full(c.a.shape, 1e3, np.float32)
    ID = np.full(c.a.shape, -1, np.int32)
    for k, (x, y, r, z) in enumerate(lobes):
        if r < 0.5:
            continue
        sl = _slc(c, x - r - 2, y - r - 2, x + r + 2, y + r + 2)
        if c.a[sl].size == 0:
            continue
        dx = c.X[sl] - x
        dy = c.Y[sl] - y
        q = r * r - dx * dx - dy * dy
        h = np.where(q > 0, z + np.sqrt(np.maximum(q, 0)), -1e4)
        win = h > H[sl]
        H[sl] = np.where(win, h, H[sl])
        ID[sl] = np.where(win, k, ID[sl])
        D[sl] = np.minimum(D[sl], np.sqrt(dx * dx + dy * dy) - r)
    inside = D < 0
    if not inside.any():
        return
    Hs = np.where(inside, H, 0)
    gy, gx = np.gradient(Hs, c.px)
    gx = np.where(inside, np.clip(gx, -6, 6), 0)
    gy = np.where(inside, np.clip(gy, -6, 6), 0)
    n = np.dstack([-gx, -gy, np.ones_like(gx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    s = F.lambert(n)
    Y = c.Y
    base = col_fn(Y)
    col = F.shade(base, s, hi, lo, None if lo_fn is None else lo_fn(Y))
    if under is not None:                      # warm light from below (fire glow on the smoke's underside)
        ucol, ufn = under
        w = np.clip(n[..., 1], 0, 1) * ufn(Y)
        col = col + (hexc(ucol) - col) * w[..., None]
    al = alpha_fn(Y)
    if rim_fn is not None and rim_a > 0:
        c.paint(c.cov(D - 1.1, feather), rim_fn(Y), al * rim_a)
    c.paint(c.cov(D, feather), col, al)
    if crease > 0:
        e = np.zeros(c.a.shape, np.float32)
        e[:, 1:] += (ID[:, 1:] != ID[:, :-1])
        e[1:, :] += (ID[1:, :] != ID[:-1, :])
        e = np.clip(F.blur(np.clip(e, 0, 1) * inside, 0.6 * c.ss), 0, 1) * 2.0
        c.paint(np.clip(e, 0, 1) * c.cov(D + 1.5), rim_fn(Y) if rim_fn is not None else hexc('#556070'),
                al * crease)


def _yramp(stops):
    """Function y -> colour (H,W,3) from [(y, '#hex'), ...] (y ascending)."""
    st = [(p, hexc(col)) for p, col in stops]
    return lambda Y: F.ramp(st, Y)


def _yalpha(pts):
    ys = [p for p, _ in pts]
    vs = [v for _, v in pts]
    return lambda Y: np.interp(Y, ys, vs).astype(np.float32)


def puff_lobes(x, y, R, rot, seed, n=6, z=0.0):
    rng = np.random.default_rng(seed)
    out = [(x, y, R * 0.8, z + R * 0.25)]
    for k in range(n):
        ang = rot + k * 2 * math.pi / n + rng.uniform(-0.35, 0.35)
        rr = rng.uniform(0.45, 0.62) * R
        out.append((x + math.cos(ang) * R * 0.58, y + math.sin(ang) * R * 0.5, rr, z + rng.uniform(-0.1, 0.15) * R))
    return out


def sh_smoke_column(i, n, W=224, H=400):
    """Tall smoke plume loop: sooty billows well up from a glowing source at the base, swell, drift right with
    the wind and turn light grey as they climb, thinning out at the top (underside lit orange by the fire near
    the base).  Seamless: each puff's age = (i/n + k/K) mod 1; colour and alpha are functions of height.
    Anchor = the base of the column (on the fire / roof)."""
    c = F.Canvas(W, H, ss=2)
    K = 16
    ph = 2 * math.pi * i / n
    bx, by = W * 0.32, H * 0.95
    rng = np.random.default_rng(77)
    rs = rng.uniform(0.82, 1.18, K)
    wx = rng.uniform(-1, 1, K)
    lobes = []
    # source cluster at the base (always there, gently churning)
    for k in range(5):
        a = ph + k * 2 * math.pi / 5
        lobes.append((bx + 9 * math.cos(a) + (k - 2) * 3, by - 12 + 4 * math.sin(a), 10 + 2 * math.sin(a * 2 + k),
                      8 + 3 * math.sin(a)))
    for k in range(K):
        u = (i / n + k / K) % 1.0
        e = u ** 0.95
        x = bx + 78 * u ** 1.8 + (8 * wx[k] + 6 * math.sin(2 * math.pi * u * 1.5 + k * 2.4)) * (0.3 + u)
        y = by - 16 - (H * 0.95 - 82) * e
        R = (15 + 40 * u ** 0.8) * rs[k] * min(1.0, 0.6 + u * 8)
        lobes += puff_lobes(x, y, R, rot=u * 2.4 + k * 1.3, seed=200 + k, z=-u * 30)
    yb, yt = by, 30
    col = _yramp([(yt, '#F4F6F9'), (yt + (yb - yt) * 0.35, '#D9DDE4'), (yt + (yb - yt) * 0.68, '#8E95A3'),
                  (yb - 40, '#555B68'), (yb, '#3E434E')])
    lo_t = _yramp([(yt, '#8B9AB8'), (yb - 60, '#4A5368'), (yb, '#2A2E38')])
    rim = _yramp([(yt, '#A7AFBE'), (yt + (yb - yt) * 0.5, '#7D8697'), (yb - 40, '#353A45'), (yb, '#2C3039')])
    alpha = _yalpha([(yt - 10, 0.0), (yt + 50, 0.55), (yt + 130, 0.93), (yb, 0.98)])
    glow = _yalpha([(yb - 110, 0.0), (yb - 40, 0.35), (yb, 0.6)])
    billow(c, lobes, col, alpha, lo_t, rim, rim_a=0.85, hi=0.55, lo=0.7, crease=0.0, under=('#FF8A3A', glow))
    return c.image()


# =========================================================================== embers
def ember_streak(c, x0, y0, x1, y1, s, a, hot):
    """Ember with a short fading motion trail from (x0,y0) (older) to (x1,y1) (now)."""
    if a <= 0.02:
        return
    R = c.region(min(x0, x1) - s * 4, min(y0, y1) - s * 4, max(x0, x1) + s * 4, max(y0, y1) + s * 4)
    if R.empty:
        return
    vx, vy = x1 - x0, y1 - y0
    L2 = max(vx * vx + vy * vy, 1e-6)
    h = np.clip(((R.X - x0) * vx + (R.Y - y0) * vy) / L2, 0, 1)
    d = np.hypot(R.X - (x0 + vx * h), R.Y - (y0 + vy * h)) - s * (0.35 + 0.65 * h)
    R.paint(R.cov(d, 0.8) * (0.15 + 0.85 * h), hexc('#FF8A2A'), a * 0.55)
    ember(c, x1, y1, s, a, hot)                      # (full canvas: region() of a region is not supported)


def sh_embers(i, n, W=128, H=224):
    """Loop of sparks / embers spiralling up from a fire (use above fx_fire_bld_* or a ruin): glowing dots with
    short motion trails, flickering.  Anchor = bottom centre (the fire)."""
    c = F.Canvas(W, H)
    rng = np.random.default_rng(5)
    N = 18

    def pos(u, x0, sw, fr, p0):
        return (x0 + sw * math.sin(2 * math.pi * (u * fr) + p0) * (0.3 + u) + 22 * u * u, H * 0.96 - (H * 0.9) * u)

    for j in range(N):
        off = j / N + rng.uniform(-0.02, 0.02)
        x0 = W / 2 + rng.uniform(-28, 28)
        sw = rng.uniform(6, 16)
        fr = int(rng.integers(1, 3))
        p0 = rng.uniform(0, 6.28)
        big = rng.uniform(2.2, 3.6)
        u = (i / n + off) % 1.0
        x, y = pos(u, x0, sw, fr, p0)
        xp, yp = pos(max(0.0, u - 0.05), x0, sw, fr, p0)
        sz = big * (1 - 0.45 * u)
        a = math.sin(math.pi * min(1.0, u * 1.05)) ** 0.6
        a *= 0.75 + 0.25 * math.sin(2 * math.pi * (i / n) * 4 + j)
        ember_streak(c, xp, yp, x, y, sz, a, 1 - u * 0.8)
    return c.image()


# =========================================================================== hose stream (aimable segments)
SEG_W, SEG_H = 32, 24          # one segment = one bead period: seamless in x, flows toward +x, centre line y = 12


def _wrap_x(xs, W):
    return [xs - W, xs, xs + W]


def sh_hose_stream(i, n, W=SEG_W, H=SEG_H):
    """One segment of the fire-hose water jet (seamless in x; flows toward +x by W/n px per frame).  The game
    chains copies along an arc from the nozzle to the target, each rotated to the arc tangent (or maps the
    frame onto a Phaser Rope).  One segment = exactly one bead period (32 px), so chained copies at scaleX 1 continue
    the pattern perfectly.  Gently pulsing beads + a moving glint sell the flow (spray lives in fx_hose_tip /
    fx_water_mist, so the chained jet stays clean at every bend)."""
    c = F.Canvas(W, H, ss=4)
    cy = H / 2
    sh = W * i / n                                           # flow offset (px)
    X = c.X
    ph = 2 * math.pi * (X - sh) / 32.0                       # period 32 px divides W -> seamless
    r = 4.4 + 0.5 * np.sin(ph) + 0.15 * np.sin(2 * ph + 1.0)
    d = np.abs(c.Y - cy - 0.25 * np.sin(ph + 0.6)) - r
    # cylinder shading (normal across the jet), toy rim
    ny = np.clip((c.Y - cy) / np.maximum(r, 1), -1, 1)
    nz = np.sqrt(np.clip(1 - ny * ny, 0, 1))
    n3 = np.dstack([np.zeros_like(ny), ny, nz]).astype(np.float32)
    base = F.ramp([(-1, hexc('#E8F7FF')), (0, hexc('#9FD6FA')), (1, hexc('#4FA3E8'))], ny)
    col = F.shade(base, F.lambert(n3), 0.6, 0.45, hexc('#2A70C8'))
    c.fill(d - 1.3, hexc('#2B6FB8'), 0.95)
    c.paint(c.cov(d), col, 0.96)
    # moving glint dashes on the upper side
    g = (0.5 + 0.5 * np.cos(2 * math.pi * (X - sh) / 16.0)) ** 3
    gd = np.abs(c.Y - (cy - r * 0.42)) - 0.85
    c.paint(c.cov(gd, 0.4) * g, WHITE, 0.95)
    return c.image()


def sh_hose_rope(i, n, reps=8):
    """Rope texture (extra): the same flowing jet as fx_hose_stream, 8 bead periods long (256 px), for a Phaser
    Rope laid along the aimed arc (the rope maps the texture once over its length; typical jets are 200-450 px
    long, so the beads keep about their size).  Flows 4 px per frame like the segment, seamless loop."""
    from PIL import Image
    seg = sh_hose_stream(i, n)
    out = Image.new('RGBA', (seg.width * reps, seg.height))
    for k in range(reps):
        out.paste(seg, (k * seg.width, 0))
    return out


def droplet(c, x, y, r, a=1.0, vx=0.0, vy=-1.0, stretch=1.0):
    """Water droplet: blue rim, pale body, white glint; stretched along its velocity."""
    if a <= 0.02 or r < 0.3:
        return
    R = c.region(x - r * 3 - 2, y - r * 3 - 2, x + r * 3 + 2, y + r * 3 + 2)
    if R.empty:
        return
    L = math.hypot(vx, vy) or 1.0
    ux, uy = vx / L, vy / L
    dx, dy = R.X - x, R.Y - y
    along = dx * ux + dy * uy
    perp = -dx * uy + dy * ux
    d = np.hypot(along / stretch, perp) - r
    R.fill(d - 0.75, hexc('#2B6FB8'), a * 0.9)
    R.fill(d, hexc('#D8F2FF'), a)
    R.fill(F.sd_circle(R.X, R.Y, x - r * 0.3, y - r * 0.35, r * 0.33), WHITE, a * 0.9)


def sh_hose_tip(i, n, W=96, H=64):
    """End of the hose jet (extra): the stream thins and breaks up into a fan of droplets.  Same flow speed as
    fx_hose_stream; attach its left-middle point (anchor [0, 0.5]) to the end of the last segment, same
    rotation.  Seamless loop."""
    c = F.Canvas(W, H, ss=4)
    cy = H / 2
    sh = SEG_W * i / n
    X = c.X
    fade = np.clip(1 - X / 40.0, 0, 1)
    ph = 2 * math.pi * (X - sh) / 32.0
    r = (4.3 + 0.75 * np.sin(ph)) * (0.25 + 0.75 * fade)
    d = np.maximum(np.abs(c.Y - cy) - r, X - 44)
    ny = np.clip((c.Y - cy) / np.maximum(r, 0.5), -1, 1)
    base = F.ramp([(-1, hexc('#E8F7FF')), (0, hexc('#9FD6FA')), (1, hexc('#4FA3E8'))], ny)
    c.fill(d - 1.3, hexc('#2B6FB8'), 0.95)
    c.paint(c.cov(d), base, 0.96)
    rng = np.random.default_rng(9)
    for k in range(16):
        u = (i / n + k / 16) % 1.0
        ang = rng.uniform(-0.55, 0.55)
        sp = rng.uniform(50, 66)
        x = 26 + sp * u * math.cos(ang)
        y = cy + sp * u * math.sin(ang) + 22 * u * u
        rr = rng.uniform(1.2, 2.4) * (1 - 0.4 * u)
        droplet(c, x, y, rr, min(1.0, (1 - u) * 3.5), vx=math.cos(ang), vy=math.sin(ang) + 0.7 * u, stretch=1.5)
    return c.image()


# =========================================================================== water mist / steam
def sh_water_mist(i, n, W=160, H=112):
    """Loop where the hose hits: a translucent pale-blue spray cloud churns, a splash crown of water flicks up,
    droplets bounce out and fall, glints twinkle.  Anchor = impact point [0.5, 0.6]."""
    c = F.Canvas(W, H, ss=3)
    ph = 2 * math.pi * i / n
    cx, cy = W / 2, H * 0.6
    # splash crown: water flicks arcing up and over from the impact point (periodic)
    rng = np.random.default_rng(23)
    for k in range(6):
        u = (i / n + k / 6) % 1.0
        ang = -math.pi / 2 + (k - 2.5) * 0.42
        v0 = 190.0
        pts = []
        for q in range(7):
            tt = u * 0.5 * q / 6 + max(0.0, u - 0.25) * 0.45 * (1 - q / 6)      # tail lags behind the head
            pts.append((cx + math.cos(ang) * v0 * tt, cy - 6 + math.sin(ang) * v0 * tt + 330 * tt * tt))
        al = math.sin(math.pi * u) ** 0.5
        hx, hy = pts[-1]
        R = c.region(min(p[0] for p in pts) - 5, min(p[1] for p in pts) - 5, max(p[0] for p in pts) + 5,
                     max(p[1] for p in pts) + 5)
        if R.empty:
            continue
        d = None
        for q in range(6):
            e = F.sd_segment(R.X, R.Y, *pts[q], *pts[q + 1], 0.6 + 1.6 * (q + 1) / 6)
            d = e if d is None else np.minimum(d, e)
        R.fill(d - 0.9, hexc('#2B6FB8'), 0.85 * al)
        R.fill(d, hexc('#DDF4FF'), al)
        R.fill(F.sd_circle(R.X, R.Y, hx - 0.6, hy - 0.6, 0.8), WHITE, al)
    # soft spray cloud (feathered, translucent, no hard outline)
    lobes = []
    for k in range(8):
        a = ph * (1 if k % 2 else -1) * 0.5 + k * 2 * math.pi / 8
        lobes.append((cx + math.cos(a) * 28, cy + math.sin(a) * 11 - 6, 13 + 3 * math.sin(ph + k), 0))
    for k in range(3):
        a = ph + k * 2 * math.pi / 3
        lobes.append((cx + math.cos(a) * 9, cy - 12 + math.sin(a) * 4, 17 + 2 * math.sin(ph * 2 + k), 5))
    col = _yramp([(cy - 40, '#FFFFFF'), (cy + 20, '#E4F3FD')])
    lo_t = _yramp([(cy - 40, '#A9CFF0'), (cy + 20, '#86B8E4')])
    rim = _yramp([(cy - 40, '#9CC4EA'), (cy + 20, '#78AAD8')])
    L = c.layer()
    billow(L, lobes, col, _yalpha([(0, 1.0), (H, 1.0)]), lo_t, rim, rim_a=0.55, hi=0.5, lo=0.4, feather=1.6)
    c.over(L, 0.62)
    # droplets bouncing out and falling (drawn last, outside the cloud mostly)
    for k in range(10):
        u = (i / n + k / 10 + 0.03) % 1.0
        ang = rng.uniform(-math.pi * 0.92, -math.pi * 0.08)
        sp = rng.uniform(40, 58)
        x = cx + math.cos(ang) * (26 + sp * u * 0.85)           # born on the cloud's surface
        y = cy - 8 + math.sin(ang) * (14 + sp * u * 0.8) + 64 * u * u
        droplet(c, x, y, rng.uniform(1.5, 2.5) * (1 - 0.3 * u), min(1.0, (1 - u) * 3) * min(1.0, u * 10),
                vx=math.cos(ang), vy=math.sin(ang) + 2.6 * u, stretch=1.35)
    for k in range(3):
        u = (i / n + k / 3) % 1.0
        GF.glint(c, cx + (k - 1) * 34, cy - 20 - 6 * (k % 2), 6.0 * math.sin(math.pi * u), core='#FFFFFF',
                 glow='#BFE6FF', edge='#2B6FB8', glow_a=0.5)
    return c.image()


def sh_steam_puff(i, n, W=128, H=192):
    """One-shot steam billow (water meeting fire): a white puff bursts up, swells, rises fast and dissolves.
    Spawn several where the hose hits flames (more as the fire dies).  Anchor = source [0.5, 0.9]."""
    t = _t1(i, n, 0.6)
    c = F.Canvas(W, H, ss=3)
    cx, by = W / 2, H * 0.9
    p = F.ease_out(t, 1.8)
    y = by - 16 - 106 * p
    x = cx + 10 * p
    R = 12 + 30 * F.ease_out(t, 1.5)
    lobes = puff_lobes(x, y, R, rot=t * 2.0, seed=41, n=7)
    for k, (dx, dy, rs) in enumerate(((-0.55, 0.75, 0.55), (0.5, 0.85, 0.45), (-0.1, 1.35, 0.38))):
        lobes += puff_lobes(x + dx * R, y + dy * R * (1 - 0.3 * t), R * rs * (1 - 0.35 * t), rot=t + k, seed=50 + k,
                            n=4, z=-6 * (k + 1))
    a = min(1.0, 0.4 + t * 6) * (1 - F.smoothstep(0.45, 1.0, t))
    col = _yramp([(0, '#FFFFFF'), (H, '#EEF4FB')])
    lo_t = _yramp([(0, '#B9C9E6'), (H, '#9FB3D6')])
    rim = _yramp([(0, '#A7B8D6'), (H, '#8EA2C6')])
    billow(c, lobes, col, _yalpha([(0, a), (H, a)]), lo_t, rim, rim_a=0.7, hi=0.5, lo=0.45)
    return c.image()


# =========================================================================== fight cloud
PARKAS = [('#FF8E7E', '#DE3B2F', '#7E1A16'), ('#94D2FF', '#2F78D6', '#143B74'), ('#FFE58A', '#F2B53A', '#8A520A'),
          ('#9BEA8E', '#3FAE4C', '#1F5E2A')]
SKIN = ('#FFE6CF', '#F2B48C', '#8E4A2A')
BOOT = ('#9A6A48', '#5A3A24', '#2A1A10')


def _part(c, d, pal, ow=1.8, bevel=4.0, gloss=0.25, hi=0.5, lo=0.45):
    top, bot, line = pal
    toy(c, d, top, bot, line, ow=ow, bevel=bevel, gloss=gloss, shadow=0, hi=hi, lo=lo)


def fist(c, x0, y0, ang, ext, sleeve):
    """Arm in a parka sleeve with a round fist, pointing at angle ang (radians, screen), ext px out of (x0,y0)."""
    ux, uy = math.cos(ang), math.sin(ang)
    ex, ey = x0 + ux * ext, y0 + uy * ext
    R = c.region(min(x0, ex) - 16, min(y0, ey) - 16, max(x0, ex) + 16, max(y0, ey) + 16)
    if R.empty:
        return
    arm = F.sd_segment(R.X, R.Y, x0, y0, ex - ux * 6, ey - uy * 6, 5.2)
    cuff = F.sd_segment(R.X, R.Y, ex - ux * 7.5, ey - uy * 7.5, ex - ux * 5.5, ey - uy * 5.5, 6.4)
    hand = F.smin(F.sd_circle(R.X, R.Y, ex, ey, 6.6),
                  F.sd_circle(R.X, R.Y, ex - uy * 4.5 + ux * 1.0, ey + ux * 4.5 + uy * 1.0, 3.2), 1.5)   # thumb
    _part(R, arm, sleeve, bevel=3.5)
    _part(R, cuff, ('#FFFFFF', '#E6DCCB', '#6B5A44'), bevel=2.5, gloss=0.0)
    _part(R, hand, SKIN, bevel=3.5, gloss=0.3)
    for k in (-1, 0, 1):                                            # knuckle creases
        kx, ky = ex + ux * 4.2 - uy * k * 2.6, ey + uy * 4.2 + ux * k * 2.6
        R.fill(F.sd_circle(R.X, R.Y, kx, ky, 0.7), hexc('#C07050'), 0.7)


def foot(c, x0, y0, ang, ext, pants):
    """Leg in trousers with a chunky boot at the end (sole toward the outside)."""
    ux, uy = math.cos(ang), math.sin(ang)
    ex, ey = x0 + ux * ext, y0 + uy * ext
    R = c.region(min(x0, ex) - 18, min(y0, ey) - 18, max(x0, ex) + 18, max(y0, ey) + 18)
    if R.empty:
        return
    leg = F.sd_segment(R.X, R.Y, x0, y0, ex - ux * 5, ey - uy * 5, 5.6)
    # boot: rounded box along the leg direction, toe bending "down" (perpendicular, +90deg)
    bx, by_ = ex + (-uy) * 2.5, ey + ux * 2.5
    Xr, Yr = F.rot(R.X, R.Y, bx, by_, ang)
    boot = F.sd_box(Xr, Yr, bx + 1.5, by_, 6.0, 8.5, 4.5)
    sole = F.intersect(boot - 0.0, Xr - (bx + 5.0))
    _part(R, leg, pants, bevel=3.5)
    _part(R, boot, BOOT, bevel=3.5, gloss=0.3)
    R.fill(sole, hexc('#3A2416'), 0.95)


def pow_burst(c, x, y, s, a, rot_=0.0):
    """Comic impact burst: jagged yellow star with a white core and dark-orange rim."""
    if a <= 0.02 or s < 1:
        return
    R = c.region(x - s * 1.4, y - s * 1.4, x + s * 1.4, y + s * 1.4)
    if R.empty:
        return
    d = F.sd_star(R.X, R.Y, x, y, s, s * 0.52, 8, rot=rot_, round_=s * 0.06)
    R.fill(d - 1.6, hexc('#B8501A'), a)
    R.fill(d, hexc('#FFD23A'), a)
    d2 = F.sd_star(R.X, R.Y, x, y, s * 0.6, s * 0.32, 8, rot=rot_ + 0.2, round_=s * 0.05)
    R.fill(d2, hexc('#FFFBE0'), a)


def sh_fight_cloud(i, n, W=192, H=176):
    """Classic cartoon scuffle: a tumbling dust ball with fists and boots popping out in turn, dizzy stars
    orbiting the top, pow bursts and speed swooshes, little dust kicked out at the ground.  Seamless loop.
    Anchor = ground under the middle [0.5, 0.86].  Nobody gets hurt: it is all dust and stars."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H, ss=3)
    cx, gy = W / 2, H * 0.86
    bounce = abs(math.sin(ph * 2))                               # hops twice per loop
    cy = gy - 50 - 7 * bounce
    cx = cx + 4 * math.sin(ph * 3)
    # ground shadow
    c.fill(F.sd_ellipse(c.X, c.Y, cx + 4, gy - 2, 62 + 3 * math.sin(ph * 2), 13), hexc('#1B2840'), 0.16, feather=5)
    # kicked-up dust at the ground (periodic)
    for k in range(6):
        u = (i / n + k / 6) % 1.0
        side = 1 if k % 2 else -1
        x = cx + side * (36 + 40 * u)
        y = gy - 6 - 10 * math.sin(math.pi * u)
        GF.ball(c, x, y, (7 - 5 * u) * min(1.0, u * 6 + 0.3), a=1 - u ** 2, top='#FFFBF2', bot='#E9DCC4',
                lo='#B49C78', rim='#A08A6A')
    # limbs: each pops out of the cloud in its own window of the loop
    limbs = [  # kind, angle deg, window start (0..1), colour idx
        ('fist', -150, 0.00, 0), ('foot', 12, 0.08, 1), ('fist', -35, 0.25, 1), ('foot', 168, 0.33, 0),
        ('fist', -95, 0.50, 2), ('foot', -55, 0.58, 3), ('fist', 192, 0.75, 3), ('foot', -128, 0.83, 2)]
    for kind, ang_d, w0, ci in limbs:
        u = (i / n - w0) % 1.0
        if u > 0.33:
            continue
        k = math.sin(math.pi * u / 0.33)                         # out and back in
        ext = 34 + 34 * k
        ang = math.radians(ang_d + 10 * math.sin(ph * 2 + w0 * 9))
        ox, oy = cx + math.cos(ang) * 14, cy + math.sin(ang) * 10
        if kind == 'fist':
            fist(c, ox, oy, ang, ext, PARKAS[ci])
        else:
            pants = [('#7FA2D8', '#3D5E9C', '#1C2E52'), ('#B08A6A', '#6E4E36', '#2E1E12')][ci % 2]
            foot(c, ox, oy, ang, ext, pants)
    # the dust ball (tumbling lobes)
    lobes = []
    for k in range(11):
        a0 = k * 2 * math.pi / 11
        a = a0 + ph * (1 if k % 3 else -1)                       # lobes churn around
        rr = 38 + 6 * math.sin(ph * 2 + k * 1.3)
        sq = 1 + 0.08 * bounce                                   # squash & stretch with the hop
        lobes.append((cx + math.cos(a) * rr * 0.62 * sq, cy + math.sin(a) * rr * 0.5 / sq, 21 + 4 * math.sin(ph * 3 + k), 2))
    for k in range(4):
        a = ph * 2 + k * math.pi / 2
        lobes.append((cx + math.cos(a) * 10, cy + math.sin(a) * 8 - 2, 26 + 2 * math.sin(ph + k), 10))
    col = _yramp([(cy - 50, '#FFFDF6'), (cy + 40, '#E6D8BF')])
    lo_t = _yramp([(cy - 50, '#C9B08A'), (cy + 40, '#A88C66')])
    rim = _yramp([(cy - 50, '#9E8868'), (cy + 40, '#7E6A4E')])
    billow(c, lobes, col, _yalpha([(0, 1), (H, 1)]), lo_t, rim, rim_a=1.0, hi=0.5, lo=0.55)
    # speed swooshes (white arcs with a soft grey edge) circling the ball
    for k in range(2):
        a0 = ph + k * math.pi
        d = F.sd_arc(c.X, (c.Y - cy) * 1.6 + cy, cx, cy, 66, a0, a0 + 0.9, 2.2)
        c.fill(d - 1.0, hexc('#9AA6BA'), 0.7)
        c.fill(d, WHITE, 0.95)
    # pow bursts at the edge (two per loop)
    for w0, ang_d in ((0.1, -40), (0.6, 200)):
        u = (i / n - w0) % 1.0
        if u < 0.2:
            k = math.sin(math.pi * u / 0.2)
            a = math.radians(ang_d)
            pow_burst(c, cx + math.cos(a) * 52, cy + math.sin(a) * 36, 13 * (0.6 + 0.6 * k), min(1.0, k * 2), u * 3)
    # dizzy stars orbiting the top (front half drawn larger)
    for k in range(3):
        a = ph + k * 2 * math.pi / 3
        x = cx + math.cos(a) * 34
        y = cy - 50 + math.sin(a) * 9
        depth = 0.75 + 0.25 * math.sin(a)
        GF.star5(c, x, y, 10.0 * depth, ph * 2 + k, a=1.0)
    return c.image()


# =========================================================================== alarm / sirens
def sh_alarm_flash(i, n, W=128, H=128):
    """Alarm loop (fire alarm post, building in trouble, police call): a red alarm-lamp disc with a white '!'
    pulses, a red warning burst flashes behind it, ringing arcs ')))' shake out on both sides and a red ring
    ripples out.  Anchor = centre."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H)
    cx, cy = W / 2, H / 2
    flash = 0.5 + 0.5 * math.cos(ph * 2)
    for k in range(2):
        u = (i / n + k / 2) % 1.0
        r = 26 + 34 * u
        a = (1 - u) ** 1.4
        d = np.abs(np.hypot(c.X - cx, c.Y - cy) - r) - (3.0 - 1.4 * u)
        c.fill(d - 1.2, hexc('#7E1A16'), a * 0.8)
        c.fill(d, hexc('#FF6A5A'), a)
    rr = np.hypot(c.X - cx, c.Y - cy)
    c.paint(np.exp(-(rr / 34) ** 2), hexc('#FF5A3A'), 0.25 + 0.3 * flash)
    burst = F.sd_star(c.X, c.Y, cx, cy, 36 + 5 * flash, 25, 10, rot=(math.pi / 10) * (i % 2), round_=2.5)
    c.fill(burst - 2.0, hexc('#8E1A12'), 0.55 + 0.45 * flash)
    c.fill(burst, F.mix(hexc('#E8402A'), hexc('#FF8A3A'), flash), 0.55 + 0.45 * flash)
    # ringing arcs on both sides (shake with the bell)
    for side in (-1, 1):
        for k in range(2):
            r = 44 + k * 9 + 2 * flash
            a0 = (math.pi if side < 0 else 0.0) - 0.55
            d = F.sd_arc(c.X, c.Y, cx + side * 2 * (i % 2), cy, r, a0, a0 + 1.1, 2.6 - 0.5 * k)
            c.fill(d - 1.2, hexc('#7E1A16'), 0.9 - 0.3 * k)
            c.fill(d, hexc('#FF7A5A') if k else hexc('#FFD23A'), 0.95 - 0.3 * k)
    s = 1.0 + 0.08 * flash
    disc = F.sd_circle(c.X, c.Y, cx, cy, 22 * s)
    c.shadow(c.cov(disc), dy=2.5, sigma=2.0, opacity=0.3)
    toy(c, disc, F.mix(hexc('#FF9A8A'), hexc('#FFC8B8'), flash), '#D9302A', '#6E1410', ow=2.4, bevel=8, gloss=0.5,
        shadow=0, hi=0.6, lo=0.45)
    bar = F.sd_segment(c.X, c.Y, cx, cy - 11 * s, cx, cy + 3 * s, 3.6 * s)
    dot = F.sd_circle(c.X, c.Y, cx, cy + 11 * s, 3.6 * s)
    ex = F.union(bar, dot)
    c.fill(ex - 1.2, hexc('#8E1E16'), 0.8)
    c.fill(ex, WHITE)
    return c.image()


def sh_siren_glow(i, n, col, phase0=0.0, W=128, H=64):
    """Rotating beacon light (vehicle siren / alarm lamp): a light fan sweeps around on the ground plane (iso
    2:1) and the lamp flares when the beam faces the camera.  NORMAL-blend art with a saturated rim so it reads
    on snow.  Anchor = the lamp [0.5, 0.5].  Red and blue are half a turn apart (police cars: play both)."""
    pal = {'red': ('#FF4A3A', '#FFB0A0', '#9E1A12'), 'blue': ('#3A7CFF', '#B0D0FF', '#12309E')}[col]
    mid, pale, dark = (hexc(v) for v in pal)
    th = 2 * math.pi * i / n + phase0
    c = F.Canvas(W, H)
    cx, cy = W / 2, H / 2
    face = 0.5 + 0.5 * math.cos(th - math.pi / 2)              # 1 when the beam points down (at the camera)
    dx = c.X - cx
    dy = (c.Y - cy) * 2.0                                    # ground-plane coordinates (2:1)
    r = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    for off, wgt in ((0.0, 1.0), (math.pi, 0.55)):         # two-sided rotating mirror
        da = np.abs(np.angle(np.exp(1j * (ang - th - off))))
        beam = np.clip(1 - da / 0.62, 0, 1) ** 1.3 * np.clip(1 - r / 62, 0, 1) ** 0.7 * np.clip(r / 5, 0, 1)
        c.paint(beam, mid, 0.75 * wgt)
        c.paint(beam ** 2.5, pale, 0.5 * wgt)
    rr = np.hypot(c.X - cx, (c.Y - cy) * 1.3)
    c.paint(np.exp(-(rr / (13 + 10 * face)) ** 2), mid, 0.6 + 0.35 * face)
    c.paint(np.exp(-(rr / (6 + 4 * face)) ** 2), pale, 0.5 + 0.4 * face)
    c.fill(F.sd_circle(c.X, c.Y, cx, cy, 6.0 + 1.5 * face) - 1.1, dark, 0.95)
    c.fill(F.sd_circle(c.X, c.Y, cx, cy, 6.0 + 1.5 * face), F.mix(mid, pale, face))
    c.fill(F.sd_circle(c.X, c.Y, cx - 1.4, cy - 1.6, 2.2 + 0.9 * face), WHITE, 0.7 + 0.3 * face)
    if face > 0.55:
        GF.glint(c, cx, cy, 16 * (face - 0.55) / 0.45 + 3, core='#FFFFFF', glow=None, edge=pal[2], a=1.0)
    return c.image()


# =========================================================================== demolition dust
CHIPS = [('#E0A867', '#A8703E', '#4E2E16'), ('#E88A6E', '#B5523A', '#5E2416'), ('#6A6A70', '#3A3A40', '#18181C')]


def chip(c, x, y, s, ang, pal, a=1.0, plank=True):
    R = c.region(x - s * 2, y - s * 2, x + s * 2, y + s * 2)
    if R.empty or a <= 0.02:
        return
    Xr, Yr = F.rot(R.X, R.Y, x, y, ang)
    d = F.sd_box(Xr, Yr, x, y, s * (1.0 if plank else 0.6), s * (0.32 if plank else 0.45), s * 0.12)
    top, bot, line = pal
    toy(R, d, top, bot, line, ow=1.1, bevel=1.6, gloss=0.0, shadow=0, alpha=a, hi=0.5, lo=0.4)


def sh_demolish_dust(i, n, W=256, H=192):
    """One-shot demolition / collapse burst: a ring of dust balls rolls out along the ground (iso), a dust
    cloud billows up and spreads, planks, bricks and soot bits fly out in arcs.  Anchor = ground centre of the
    building [0.5, 0.78]; scale x1.2-1.6 for big plots.  Cute and soft - no violence."""
    t = _t1(i, n, 0.6)
    c = F.Canvas(W, H, ss=2)
    cx, gy = W / 2, H * 0.78
    p = F.ease_out(t, 2.4)
    c.fill(F.sd_ellipse(c.X, c.Y, cx + 4, gy + 2, 40 + 70 * p, 14 + 22 * p), hexc('#1B2840'),
           0.15 * (1 - t), feather=8)
    lobes = []
    K = 14
    for k in range(K):
        a = 2 * math.pi * k / K + 0.2 * math.sin(k * 3)
        dist = 28 + 62 * p * (0.85 + 0.15 * math.sin(k * 5))
        r = (10 + 16 * F.ease_out(min(1.0, t * 3), 2)) * (1 - 0.45 * F.ease_in(t, 2)) * (0.85 + 0.25 * math.sin(k * 7))
        lobes.append((cx + math.cos(a) * dist, gy + math.sin(a) * dist * 0.36 - r * 0.75, r, 0))
    up = F.ease_out(t, 1.6)
    for k in range(7):
        a = k * 2 * math.pi / 7 + t * 1.5
        R = (18 + 26 * up) * (1 - 0.5 * F.ease_in(t, 2.2))
        lobes.append((cx + math.cos(a) * R * 0.7, gy - 30 - 56 * up + math.sin(a) * R * 0.45, R * 0.75, 6))
    lobes.append((cx, gy - 18 - 40 * up, (30 + 16 * up) * (1 - 0.6 * F.ease_in(t, 2)), 10))
    a_all = 1 - F.smoothstep(0.55, 1.0, t)
    col = _yramp([(gy - 140, '#FFFBF4'), (gy, '#E3D6C0')])
    lo_t = _yramp([(gy - 140, '#BCA584'), (gy, '#9C8462')])
    rim = _yramp([(gy - 140, '#A8957A'), (gy, '#7E6A50')])
    billow(c, lobes, col, _yalpha([(0, a_all), (H, a_all)]), lo_t, rim, rim_a=0.9, hi=0.5, lo=0.55)
    rng = np.random.default_rng(13)
    for k in range(14):
        ang = rng.uniform(-math.pi * 0.95, -math.pi * 0.05)
        sp = rng.uniform(70, 150)
        x = cx + math.cos(ang) * sp * t * 0.9
        y = gy - 30 + math.sin(ang) * sp * t + 190 * t * t
        if y > gy + 10:
            continue
        pal = CHIPS[k % 3]
        chip(c, x, y, rng.uniform(4, 7), t * rng.uniform(-9, 9) + k, pal, a=1 - F.smoothstep(0.75, 1.0, t),
             plank=(k % 3 == 0))
    return c.image()


# =========================================================================== question / idea / memory
BLUE = ('#94D2FF', '#2F78D6', '#143B74')


def qmark_sd(X, Y, cx, cy, s):
    """'?' glyph shape (like emote_question), s = scale (1 = 64-px emote size), centred on (cx, cy)."""
    R, t = 11.0 * s, 4.6 * s
    ay = cy - 10.5 * s
    arc = F.sd_arc(X, Y, cx, ay, R, math.radians(188), math.radians(418), t)
    ex, ey = cx + R * math.cos(math.radians(58)), ay + R * math.sin(math.radians(58))
    stem = F.sd_polyline(X, Y, [(ex, ey), (cx + 0.5 * s, ay + 15.0 * s), (cx, ay + 17.5 * s)], t)
    dot = F.sd_circle(X, Y, cx, ay + 29.0 * s, 6.0 * s)
    return F.union(arc, stem, dot)


def paint_qmark(c, cx, cy, s, tilt_deg, pal=BLUE, a=1.0):
    R = c.region(cx - 30 * s, cy - 34 * s, cx + 30 * s, cy + 34 * s)
    if R.empty or a <= 0.02:
        return
    X2, Y2 = F.rot(R.X, R.Y, cx, cy, math.radians(tilt_deg))
    d = qmark_sd(X2, Y2, cx, cy, s)
    R.shadow(R.cov(d - 2.4 * s), dy=2.0 * s, sigma=1.5 * s, opacity=0.3 * a)
    toy(R, d, pal[0], pal[1], pal[2], ow=2.6 * s, bevel=4.5 * s, gloss=0.0, shadow=0, hi=0.6, lo=0.45, alpha=a,
        tint_lo=hexc('#2A55B0'))
    gl = F.sd_arc(X2, Y2, cx, cy - 10.5 * s, 12.0 * s, math.radians(205), math.radians(258), 1.3 * s)
    R.fill(gl, WHITE, 0.75 * a, feather=0.5)


def sh_question_mark(i, n, W=80, H=112):
    """Loop above a curious resident's head ('what's that? who's new?'): a glossy blue '?' bobs and tilts while
    little '?'s pop off to the sides.  Anchor = head top [0.5, 0.95]."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H)
    cx, cy = W / 2, H * 0.58 - 4 * math.sin(ph)
    for k, side in enumerate((-1, 1)):
        u = (i / n + k * 0.5) % 1.0
        x = cx + side * (14 + 16 * u)
        y = H * 0.42 - 26 * u
        a = math.sin(math.pi * u) ** 0.6
        paint_qmark(c, x, y, 0.42 * (0.6 + 0.4 * math.sin(math.pi * u)), side * 18, ('#C8E6FF', '#5C9CE6', '#1E4C8E'), a)
    paint_qmark(c, cx, cy, 1.05 + 0.04 * math.sin(ph * 2), 12 * math.sin(ph), BLUE, 1.0)
    return c.image()


GOLD = ('#FFF4AE', '#F5A623', '#8E520A')


def bulb(c, cx, cy, s, lit, a=1.0):
    """Light bulb (64-unit emote proportions x s) - lit 0..1 blends the glass from cool grey to glowing gold."""
    r = 13.8 * s
    glass = F.smin(F.sd_circle(c.X, c.Y, cx, cy, r),
                   F.sd_polygon(c.X, c.Y, [(cx - 7.6 * s, cy + 7.6 * s), (cx + 7.6 * s, cy + 7.6 * s),
                                           (cx + 6.3 * s, cy + 15.6 * s), (cx - 6.3 * s, cy + 15.6 * s)]), 4.0 * s)
    base = F.sd_box(c.X, c.Y, cx, cy + 19.6 * s, 7.1 * s, 5.0 * s, 2.3 * s)
    nub = F.sd_box(c.X, c.Y, cx, cy + 25.6 * s, 3.4 * s, 1.8 * s, 1.5 * s)
    allsh = F.union(glass, base, nub)
    c.shadow(c.cov(allsh - 2.3 * s), dy=2 * s, sigma=1.6 * s, opacity=0.3 * a)
    toy(c, nub, '#9AA6C0', '#4C5874', '#222A40', ow=1.8 * s, bevel=1.5 * s, gloss=0, shadow=0, alpha=a)
    toy(c, base, '#F4F7FB', '#97A2B4', '#3A4352', ow=2.2 * s, bevel=3 * s, gloss=0, shadow=0, hi=0.6, lo=0.5, alpha=a)
    for gy in (cy + 18.0 * s, cy + 21.4 * s):
        c.fill(F.sd_segment(c.X, c.Y, cx - 6 * s, gy - 0.9 * s, cx + 6 * s, gy + 0.9 * s, 0.75 * s), hexc('#6E7A8E'),
               0.85 * a)
    top = F.mix(hexc('#EEF2F8'), hexc('#FFF4AE'), lit)
    bot = F.mix(hexc('#B8C2D2'), hexc('#F5A623'), lit)
    line = F.mix(hexc('#56627A'), hexc('#8E520A'), lit)
    toy(c, glass, top, bot, line, ow=2.4 * s, bevel=7 * s, gloss=0, shadow=0, hi=0.75, lo=0.35, alpha=a)
    coil = F.sd_polyline(c.X, c.Y, [(cx - 3.6 * s + k * 0.9 * s, cy + 4 * s + 1.4 * s * math.sin(k * 1.75))
                                    for k in range(9)], 0.75 * s)
    if lit > 0:
        c.paint(np.exp(-(np.hypot(c.X - cx, c.Y - cy - 4 * s) / (5.0 * s)) ** 2), WHITE, 0.6 * lit * a)
    c.fill(coil, F.mix(hexc('#7A8090'), hexc('#E0661A'), lit), 0.95 * a)
    X2, Y2 = F.rot(c.X, c.Y, cx - 6 * s, cy - 6.5 * s, math.radians(-40))
    c.fill(F.sd_ellipse(X2, Y2, cx - 6 * s, cy - 6.5 * s, 4.2 * s, 2.4 * s), WHITE, 0.9 * a, feather=0.6)


def sh_lightbulb_idea(i, n, W=96, H=128):
    """One-shot 'aha!' above a head: a light bulb pops up, flickers, switches on with a burst of rays and
    sparkles and keeps glowing (hold the last frame or loop the last 4).  Anchor = head top [0.5, 0.95]."""
    t = _t1(i, n, 0.7)
    c = F.Canvas(W, H)
    cx = W / 2
    pop = (0.4 + 0.6 * F.ease_out(F.clamp01(t / 0.25), 3)) * (1 + 0.18 * F.bump(t, 0.12, 0.34))
    cy = H * 0.5 + 18 * (1 - F.ease_out(F.clamp01(t / 0.25), 2))
    s = 1.25 * max(0.05, pop)
    if t < 0.42:
        lit = [0.0, 0.0, 0.6, 0.0, 0.8, 0.2][min(5, int(t / 0.42 * 6))] if t > 0.2 else 0.0
    else:
        lit = 1.0
    on = F.clamp01((t - 0.42) / 0.2)
    if on > 0:
        rr = np.hypot(c.X - cx, c.Y - cy)
        c.paint(np.exp(-(rr / (22 + 6 * on)) ** 2), hexc('#FFE27A'), 0.55 * on)
        burst = F.ease_out(on, 2)
        for k in range(8):
            a = -math.pi / 2 + (k - 3.5) * 0.42
            if not (-math.pi * 1.05 < a < 0.05):
                continue
            r0 = 22 + 6 * burst
            r1 = r0 + 10 * burst * (1.0 if k % 2 else 0.7) * (0.85 + 0.15 * math.sin(i * 1.7 + k))
            d = F.sd_segment(c.X, c.Y, cx + r0 * math.cos(a), cy + r0 * math.sin(a), cx + r1 * math.cos(a),
                             cy + r1 * math.sin(a), 2.4)
            toy(c, d, *GOLD, ow=1.6, bevel=1.8, gloss=0, shadow=0, hi=0.5, lo=0.3)
        for k in range(3):
            u = F.clamp01((t - 0.45 - k * 0.1) / 0.5)
            if 0 < u < 1:
                a = -math.pi / 2 + (k - 1) * 1.1
                GF.glint(c, cx + math.cos(a) * (30 + 14 * u), cy + math.sin(a) * (30 + 14 * u), 6 * math.sin(math.pi * u),
                         glow='#FFD45A', edge='#B8650E', tip='#FFC83D')
    bulb(c, cx, cy - 6 * s, s, lit)
    return c.image()


def sh_memory_sparkle(i, n, W=112, H=112):
    """Dreamy loop while a resident remembers / forms a memory: pastel twinkles spiral up around the head in a
    soft lilac glow.  Anchor = head top [0.5, 0.9]."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H)
    cx, by = W / 2, H * 0.9
    rr = np.hypot(c.X - cx, (c.Y - (by - 40)) * 1.1)
    c.paint(np.exp(-(rr / 32) ** 2), hexc('#D9C4FF'), 0.42 + 0.08 * math.sin(ph))
    for k in range(1):                                         # soft pastel ribbon swirling up
        pts = []
        for q in range(24):
            v = q / 23
            a = 2 * math.pi * (v * 1.2 + i / n) + k * math.pi
            pts.append((cx + math.cos(a) * (14 + 12 * v), by - 8 - 70 * v + math.sin(a) * 5))
        for q in range(23):
            v = q / 23
            d = F.sd_segment(c.X, c.Y, *pts[q], *pts[q + 1], 1.8 * (1 - v) + 0.5)
            c.fill(d, F.mix(hexc('#C9A8FF'), hexc('#FFB0D0'), v), 0.45 * math.sin(math.pi * v))
    cols = [('#FFFFFF', '#C9A8FF', '#5A30B0'), ('#FFFFFF', '#FFB0D0', '#B0204E'), ('#FFFFFF', '#A8D8FF', '#2A55B0'),
            ('#FFFFFF', '#FFE27A', '#B8650E')]
    N = 8
    items = []
    for k in range(N):
        u = (i / n + k / N) % 1.0
        a = 2 * math.pi * (u * 1.0 + k * 0.37)
        x = cx + math.cos(a) * (18 + 14 * u)
        y = by - 10 - 74 * u
        depth = math.sin(a)
        items.append((depth, x, y, u, k))
    for depth, x, y, u, k in sorted(items):
        core, glow, edge = cols[k % 4]
        sz = (7.0 + 4.0 * (k % 2)) * math.sin(math.pi * u) ** 0.7 * (0.8 + 0.2 * depth)
        GF.glint(c, x, y, sz, core=core, glow=glow, edge=edge, tip=glow, glow_a=0.6, a=0.7 + 0.3 * (depth + 1) / 2,
                 halo=0.7)
    for k in range(10):
        u = (i / n + k / 10 + 0.05) % 1.0
        a = 2 * math.pi * (u + k * 0.21) + math.pi
        x = cx + math.cos(a) * (10 + 22 * u)
        y = by - 18 - 60 * u
        R = c.region(x - 3, y - 3, x + 3, y + 3)
        al = math.sin(math.pi * u)
        R.fill(F.sd_circle(R.X, R.Y, x, y, 1.6), hexc(cols[k % 4][2]), 0.5 * al)
        R.fill(F.sd_circle(R.X, R.Y, x, y, 1.1), hexc(cols[k % 4][1]), al)
    return c.image()


SHEET_FNS = {
    'fx_fire_bld_s': lambda i, n: sh_fire_bld(i, n, 208, 224, 's'),
    'fx_fire_bld_m': lambda i, n: sh_fire_bld(i, n, 280, 288, 'm'),
    'fx_fire_bld_l': lambda i, n: sh_fire_bld(i, n, 352, 352, 'l'),
    'fx_fire_window': sh_fire_window,
    'fx_smoke_column': sh_smoke_column,
    'fx_embers': sh_embers,
    'fx_hose_stream': sh_hose_stream,
    'fx_hose_rope': sh_hose_rope,
    'fx_hose_tip': sh_hose_tip,
    'fx_water_mist': sh_water_mist,
    'fx_steam_puff': sh_steam_puff,
    'fx_fight_cloud': sh_fight_cloud,
    'fx_alarm_flash': sh_alarm_flash,
    'fx_siren_glow_red': lambda i, n: sh_siren_glow(i, n, 'red', 0.0),
    'fx_siren_glow_blue': lambda i, n: sh_siren_glow(i, n, 'blue', math.pi),
    'fx_demolish_dust': sh_demolish_dust,
    'fx_question_mark': sh_question_mark,
    'fx_lightbulb_idea': sh_lightbulb_idea,
    'fx_memory_sparkle': sh_memory_sparkle,
}


# =========================================================================== scratch CLI
def _scratch(keys, nframes=None):
    from PIL import Image
    os.makedirs(CACHE, exist_ok=True)
    import gen_fx_city as B
    for k in keys:
        d = B.SHEETS[k]
        fn, fw, fh, nfr = SHEET_FNS[k], d['w'], d['h'], d['frames']
        idx = range(nfr) if not nframes else [int(round(x)) for x in np.linspace(0, nfr - 1, nframes)]
        frames = [fn(i, nfr) for i in idx]
        bgs = ['#F4F7FB', '#D9A08A', '#1F5FA8', '#2B2F3A']
        sheet = Image.new('RGBA', (fw * len(frames), fh * len(bgs)), (0, 0, 0, 255))
        for r, bg in enumerate(bgs):
            for j, f in enumerate(frames):
                tile = Image.new('RGBA', (fw, fh), bg)
                tile.alpha_composite(f)
                sheet.paste(tile, (j * fw, r * fh))
        p = os.path.join(CACHE, k + '_only.png')
        sheet.convert('RGB').save(p)
        if not nframes:
            F.save_gif(frames, os.path.join(CACHE, k + '.gif'), d['fps'], hold=0 if d['repeat'] == -1 else 6,
                       anchor=d['anchor'])
        print('scratch ->', p)


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', required=True)
    ap.add_argument('--frames', type=int, default=0, help='only N evenly spaced frames (no gif)')
    a = ap.parse_args()
    _scratch([k for k in a.only.split(',') if k], a.frames or None)
