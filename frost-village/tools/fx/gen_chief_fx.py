"""
gen_chief_fx.py - CONTRACT_V42 §AG: the chief's halo and the navigation sprites, procedurally (numpy + Pillow on
fxlib), in the fx / ui house style.  One atlas `chief_fx` (frames named {key}_{i}, trimmed JSON-hash, sourceSize
kept) + manifest.json with per-key spritesheet metadata (frames, fps, repeat, anchor, iconRect).

Every sprite is NORMAL-blend artwork that reads on white snow, grey cobbles, brown dirt and under the night
MULTIPLY overlay: bright cores get a darker cool rim (as the fx_city sheets), drawn on a 4x supersampled SDF canvas
and LANCZOS-downsampled, so edges stay clean when the game scales them 0.5x .. 2x.

    python3 tools/fx/gen_chief_fx.py              # frames -> atlas + manifest + previews (docs/previews/chief_fx_*)
    python3 tools/fx/gen_chief_fx.py --no-preview # assets only
    python3 tools/fx/gen_chief_fx.py --check      # check the delivered set (exit 1 on any error)
    python3 tools/fx/gen_chief_fx.py --look KEY   # scratch look-dev strip of one key (cache dir only)
Cache: /tmp/fv_cache/chief_fx (frames + preview intermediates).  Deterministic.
Imports fxlib, emote_art, pack_utils, townfolk_compose READ-ONLY; writes only assets/chief_fx/** and
docs/previews/chief_fx_*.
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))           # frost-village/
TOOLS = os.path.dirname(HERE)
for p in (HERE, TOOLS):
    if p not in sys.path:
        sys.path.insert(0, p)
import fxlib as F                                       # noqa: E402
from fxlib import hexc                                  # noqa: E402

ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'chief_fx')
PREV = os.path.join(ROOT, 'docs', 'previews')
CACHE = os.environ.get('FV_CHIEF_FX_CACHE', '/tmp/fv_cache/chief_fx')
ATLAS = 'chief_fx'
WHITE = hexc('#FFFFFF')
NAVY = '#1B2840'
TAU = 2 * math.pi

# contract colours (CONTRACT_V42 §AG)
MINT, SKY, LILAC = hexc('#43E0C6'), hexc('#7FB2FF'), hexc('#B79CFF')
GOLD_IN = hexc('#FFD36A')          # warm inner line of the aurora ring
TEAL_RIM = hexc('#1F8F86')         # darker outer rim (reads on snow)
GOLD_A, GOLD_B = hexc('#FFC84A'), hexc('#FFE9A0')
TEAL = hexc('#2CB7A8')             # navigation / marker teal
TEAL_D = hexc('#17736B')
TEAL_L = hexc('#7FE6D8')
GLOW_CORE = hexc('#FFE7A3')


# =========================================================================== helpers
def smooth(e0, e1, x):
    return F.smoothstep(e0, e1, x)


def edge_window(c, mx=2.5, my=2.5):
    """1 inside the frame, fading to 0 over the last mx / my px at the frame border (no hard cut-offs)."""
    wx = np.clip(np.minimum(c.X, c.w - c.X) / mx, 0, 1)
    wy = np.clip(np.minimum(c.Y, c.h - c.Y) / my, 0, 1)
    return (wx * wx * (3 - 2 * wx)) * (wy * wy * (3 - 2 * wy))


def ellipse_param(c, cx, cy, rx, ry):
    """(signed distance to the ellipse curve, unit outward normal nx, ny, angle u in 0..1 clockwise from +x)."""
    d = F.sd_ellipse(c.X, c.Y, cx, cy, rx, ry)
    gy, gx = np.gradient(d, c.px)
    g = np.maximum(np.hypot(gx, gy), 1e-6)
    u = (np.arctan2((c.Y - cy) / ry, (c.X - cx) / rx) / TAU) % 1.0
    return d, gx / g, gy / g, u


def arc_frac(u, rx, ry):
    """Parametric angle fraction u (0..1) -> fraction of the ellipse's arc length (dashes of equal length)."""
    t = np.linspace(0, TAU, 2049)
    ds = np.sqrt((rx * np.sin(t)) ** 2 + (ry * np.cos(t)) ** 2)
    s = np.concatenate([[0], np.cumsum((ds[1:] + ds[:-1]) / 2 * (t[1] - t[0]))])
    return np.interp(u * TAU, t, s / s[-1])


def cyc_ramp(stops, u):
    """Cyclic gradient: stops = [colour, ...] evenly spaced round u in 0..1 (wraps back to the first)."""
    n = len(stops)
    t = (u % 1.0) * n
    k = np.floor(t).astype(int) % n
    f = t - np.floor(t)
    f = f * f * (3 - 2 * f)                              # soft blend between stops
    A = np.stack(stops)[k]
    B = np.stack(stops)[(k + 1) % n]
    return A + (B - A) * f[..., None]


def tube_light(nx, ny, s):
    """Light term of a round tube lying along a screen curve: s = signed offset across the tube (-1 inner .. 1 outer),
    (nx, ny) = the curve's outward normal in screen space; shared upper-left sun (fxlib.LIGHT)."""
    s = np.clip(s, -1, 1)
    nz = np.sqrt(np.maximum(0.0, 1 - s * s))
    n = np.dstack([nx * s, ny * s * 0.9, nz])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return F.lambert(n), n


def glint(c, x, y, s, a=1.0, core=WHITE, tip=None, edge=None, edge_a=0.55, pinch=0.5, ry=None):
    """4-point twinkle star (concave sides) with an optional thin darker edge so it reads on snow."""
    if s <= 0.05 or a <= 0.002:
        return
    ry = s if ry is None else ry
    d = F.sd_glint(c.X, c.Y, x, y, s, ry, c.px, pinch=pinch)
    if edge is not None:
        c.fill(d - 0.8, edge, edge_a * a, feather=0.3)
    r = np.hypot(c.X - x, c.Y - y) / max(s, 1e-3)
    col = core if tip is None else F.mix(core, tip, np.clip(r, 0, 1) ** 0.8)
    c.paint(c.cov(d), col, a)


def premul_over(dst, src):
    """Alpha-composite two PIL RGBA images (src over dst), returns a new image."""
    out = dst.copy()
    out.alpha_composite(src)
    return out


# =========================================================================== chief_halo (192 x 96, 12 f)
HALO_W, HALO_H = 192, 96
HALO_RX, HALO_RY = 88.5, 42.5          # centre line of the band: outer edge 184 x 92 (contract)
HALO_T = 3.5                           # half thickness: ring 7 px


def ring_band(c, pal_fn, f, nf, cx=96, cy=48, rx=HALO_RX, ry=HALO_RY, t=HALO_T, glow_a=0.25, glow_sigma=3.0,
              rim=TEAL_RIM, rim_a=0.5, inner=GOLD_IN, inner_a=0.6, spec=0.55, deep=None):
    """The jelly-tube ring shared by the aurora and gold halos.  pal_fn(u_moving) -> (H,W,3) base colours."""
    d, nx, ny, u = ellipse_param(c, cx, cy, rx, ry)
    band = np.abs(d) - t
    phase = f / nf
    base = pal_fn((u - phase) % 1.0)
    win = edge_window(c, 2.5, 2.0)
    # 1) soft outer glow (both sides of the band, never reaching the frame border; centre stays clear)
    if glow_a > 0:
        g = np.exp(-0.5 * (np.maximum(band, 0) / glow_sigma) ** 2) * win
        g = g * np.where(d < 0, np.clip(1 + d / 12.0, 0, 1), 1.0)       # inner side dies out quickly
        gl_col = np.clip(base * 0.55 + 0.45, 0, 1)
        c.paint(g * (band > -0.2), gl_col, glow_a)
    # 2) darker cool rim just outside the band (reads on white snow)
    if rim is not None:
        rim_cov = c.cov(np.abs(d - (t + 0.6)) - 0.6) * win
        c.paint(rim_cov, rim, rim_a)
    # 3) the tube: gradient colour lit as a round jelly tube (upper-left sun), deeper on its shaded side
    lam, n = tube_light(nx, ny, d / t)
    deep_c = deep if deep is not None else np.clip(base * np.array([0.55, 0.62, 0.78]), 0, 1)
    up = np.clip(lam, 0, None)[..., None]
    dn = np.clip(-lam, 0, None)[..., None]
    col = base + (1 - base) * up * 0.55
    col = col + (deep_c - col) * np.clip(dn * 1.15, 0, 1)
    sp = F.specular(n, 26.0)[..., None]
    col = np.clip(col + sp * spec, 0, 1)
    cov = c.cov(band)
    c.paint(cov, col, 1.0)
    # 4) warm inner line hugging the band's inner edge
    if inner is not None:
        c.paint(c.cov(np.abs(d + t + 0.55) - 0.55), inner, inner_a)
    return d, u, base


def aurora(u):
    return cyc_ramp([MINT, SKY, LILAC], u)


def draw_halo(f, nf=12):
    c = F.Canvas(HALO_W, HALO_H, ss=4)
    d, u, base = ring_band(c, aurora, f, nf)
    # 6 tiny 4-point stars sit on the ring and twinkle (each twice per loop, staggered)
    for k, deg in enumerate((10, 62, 118, 170, 240, 300)):
        a = math.radians(deg)
        x = 96 + HALO_RX * math.cos(a)
        y = 48 + HALO_RY * math.sin(a)
        ph = (2 * f / nf + k * 0.37) % 1.0
        tw = max(0.0, math.sin(math.pi * ph)) ** 1.6
        s = 2.2 + 3.9 * tw
        glint(c, x, y, s, a=0.35 + 0.65 * tw, core=WHITE, tip=hexc('#FFF3C4'), edge=TEAL_RIM, edge_a=0.45)
    c.clip(edge_window(c, 1.5, 1.2))
    return c.image()


# =========================================================================== chief_halo_gold (192 x 96, 8 f)
def gold_pal(u):
    return cyc_ramp([GOLD_A, GOLD_B, hexc('#FFD86E'), GOLD_B], u)


def draw_halo_gold(f, nf=8):
    c = F.Canvas(HALO_W, HALO_H, ss=4)
    # pulse: frames 0-3 grow, 4-7 settle
    p = [0.15, 0.55, 0.9, 1.0, 0.8, 0.55, 0.32, 0.18][f]
    d, u, base = ring_band(c, gold_pal, f, nf, glow_a=0.30 + 0.10 * p, glow_sigma=3.0 + 0.6 * p,
                           rim=hexc('#B8650E'), rim_a=0.5, inner=hexc('#FFFFFF'), inner_a=0.55, spec=0.65,
                           deep=hexc('#D08A18'))
    # 12 short sun-ray ticks pointing outward: a sunburst inside the ring whose tips run into the band (the frame
    # leaves no room outside the 184 x 92 band); drawn UNDER the band, frames 0-3 grow, 4-7 settle
    L = c.layer()
    for k in range(12):
        a = (k / 12 + 1 / 24) * TAU
        ca, sa = math.cos(a), math.sin(a)
        px_, py_ = HALO_RX * ca, HALO_RY * sa                     # centre-line point (relative)
        sr = math.hypot(px_, py_)
        nx_, ny_ = ca / HALO_RX, sa / HALO_RY
        nn = math.hypot(nx_, ny_)
        cospsi = (px_ * nx_ + py_ * ny_) / (sr * nn)
        rho_edge = 1 - (HALO_T + 2.0) / (sr * cospsi)           # 2 px short of the band's inner edge
        long_ = (k % 2 == 0)
        ln_r = (0.15 + 0.07 * p) if long_ else (0.09 + 0.05 * p)  # grows outward with the pulse
        rho1 = rho_edge - (1 - p) * 0.035
        rho0 = rho1 - ln_r
        tx, ty = 96 + rho1 * px_, 48 + rho1 * py_
        bx, by = 96 + rho0 * px_, 48 + rho0 * py_
        ux, uy = tx - bx, ty - by
        ln = math.hypot(ux, uy)
        ux, uy = ux / ln, uy / ln
        hw = (2.5 if long_ else 2.0) + 0.5 * p
        # a sun ray: wide base toward the chief, point toward the ring
        tri = F.sd_polygon(c.X, c.Y, [(bx - uy * hw, by + ux * hw), (tx, ty), (bx + uy * hw, by - ux * hw)]) - 0.45
        tt = np.clip(((c.X - bx) * ux + (c.Y - by) * uy) / ln, 0, 1)
        L.fill(tri - 0.85, hexc('#B8650E'), 0.55)
        L.paint(L.cov(tri), F.mix(hexc('#FFE9A0'), hexc('#F5B83A'), tt ** 0.8), 1.0)
        L.paint(L.cov(tri + 0.9) * (1 - tt), WHITE, 0.45)
    c.under(L, 0.6 + 0.4 * p)
    # a few warm glints riding the ring
    for k in range(4):
        a = (k / 4 + f / nf * 0.25) * TAU + 0.4
        x, y = 96 + HALO_RX * math.cos(a), 48 + HALO_RY * math.sin(a)
        tw = 0.5 + 0.5 * math.sin(TAU * (f / nf) * 2 + k * 1.7)
        glint(c, x, y, 2.5 + 3.0 * tw * p + 1.0, a=0.5 + 0.5 * tw, core=WHITE, tip=hexc('#FFE9A0'),
              edge=hexc('#B8650E'), edge_a=0.4)
    c.clip(edge_window(c, 1.5, 1.2))
    return c.image()


# =========================================================================== chief_halo_rank2 (216 x 108, 1 f)
def draw_rank2(f=0):
    c = F.Canvas(216, 108, ss=4)
    cx, cy = 108, 54
    win = edge_window(c, 2.0, 1.5)
    # outer band 2 px (outer edge 208 x 104), inner band 1 px, 4 px apart
    d1, nx, ny, u = ellipse_param(c, cx, cy, 103.0, 51.0)
    d2, _, _, _ = ellipse_param(c, cx, cy, 103.0 - 1.0 - 4.0 - 0.5, 51.0 - 1.0 - 4.0 - 0.5)
    glow = np.exp(-0.5 * (np.minimum(np.abs(d1), np.abs(d2)) / 2.2) ** 2) * win
    c.paint(glow, hexc('#FFE9A0'), 0.22)
    for d, hw in ((d1, 1.0), (d2, 0.5)):
        c.paint(c.cov(np.abs(d) - hw - 0.55) * win, hexc('#A65C0C'), 0.55)        # dark amber edge (snow)
    for d, hw in ((d1, 1.0), (d2, 0.5)):
        lam, n = tube_light(nx, ny, np.clip(d / max(hw, 0.6), -1, 1))
        base = cyc_ramp([GOLD_A, GOLD_B, GOLD_A, hexc('#FFD86E')], u)
        col = np.clip(base + (1 - base) * np.clip(lam, 0, None)[..., None] * 0.5
                      - np.clip(-lam, 0, None)[..., None] * 0.25, 0, 1)
        c.paint(c.cov(np.abs(d) - hw) * win, col, 1.0)
    for k, a in enumerate((0.62, 2.2, 3.9, 5.3)):
        x, y = cx + 103.0 * math.cos(a), cy + 51.0 * math.sin(a)
        glint(c, x, y, 3.6 if k % 2 == 0 else 2.6, a=0.9, core=WHITE, tip=hexc('#FFE9A0'), edge=hexc('#A65C0C'),
              edge_a=0.4)
    return c.image()


# =========================================================================== chief_glow_back (160 x 200, 8 f)
def draw_glow_back(f, nf=8):
    """Soft vertical oval radiance behind the chief (anchor [0.5, 0.82] = his feet at (80, 164)): pale gold core
    #FFE7A3 at 55 % fading to mint (left) / lilac (right) edges at 0 %; a slow shimmer of faint aurora rays."""
    W, H = 160, 200
    c = F.Canvas(W, H, ss=2)
    cx, cy = 80.0, 96.0                    # oval centre ~68 px above the feet (behind chest / head)
    ph = f / nf
    breathe = 1.0 + 0.045 * math.sin(TAU * ph)
    rx, ry = 54.0 * breathe, 86.0 * (1 + 0.025 * math.sin(TAU * ph + 1.1))
    X, Y = c.X, c.Y
    r = np.hypot((X - cx) / rx, (Y - cy) / ry)
    # broad soft oval: (1 - r^2)^1.6 has no edge (value and slope reach 0 together at r = 1)
    body = np.clip(1 - r * r, 0, 1) ** 1.6
    core = np.exp(-(r / 0.45) ** 2)
    # faint vertical aurora rays drifting slowly sideways (periodic over the loop)
    rays = np.zeros_like(X)
    for k, (fr, amp, sp) in enumerate(((0.032, 0.5, 1), (0.055, 0.25, -1), (0.021, 0.45, 1))):
        rays += amp * (0.5 + 0.5 * np.sin(TAU * (fr * (X - cx) + sp * ph) + k * 1.3))
    rays = rays / 1.3
    a = 0.55 * body * (0.85 + 0.15 * rays) + 0.08 * core
    a = a * (0.95 + 0.05 * math.sin(TAU * ph + 0.4))
    # colour: gold core -> mint (left) / lilac (right) toward the edge
    side = np.clip(0.5 + (X - cx) / (2 * rx) + 0.12 * math.sin(TAU * ph), 0, 1)
    edge_col = F.mix(MINT, LILAC, side)
    t = np.clip((r - 0.30) / 0.62, 0, 1)
    col = F.mix(GLOW_CORE, edge_col, t ** 1.2)
    col = np.clip(F.mix(col, WHITE, np.clip(core - 0.6, 0, 1)), 0, 1)
    a = np.clip(a, 0, 0.62) * edge_window(c, 6, 6)
    c.rgb = col * a[..., None]
    c.a = a.astype(np.float32)
    return c.image()


# =========================================================================== chief_sparkle (32 x 32, 6 f, once)
def draw_sparkle(f, nf=6):
    c = F.Canvas(32, 32, ss=6)
    life = [0.35, 0.85, 1.0, 0.8, 0.5, 0.18][f]
    rot = math.radians(-8 + 10 * f)
    s = 4.5 + 9.5 * life
    alpha = [0.75, 1.0, 1.0, 0.9, 0.65, 0.3][f]
    # soft warm bloom behind
    r = np.hypot(c.X - 16, c.Y - 16)
    c.paint(np.exp(-(r / (3.5 + 3.5 * life)) ** 2), hexc('#FFE9A0'), 0.55 * alpha)
    X, Y = F.rot(c.X, c.Y, 16, 16, rot)
    d = F.sd_implicit((np.abs(X - 16) / s) ** 0.5 + (np.abs(Y - 16) / s) ** 0.5 - 1.0, c.px) * min(s, s)
    c.fill(d - 1.5, hexc('#A85C0A'), 0.85 * alpha, feather=0.2)        # amber rim (dark enough for snow)
    c.fill(d - 0.6, hexc('#F5B83A'), alpha)
    rr = np.hypot(X - 16, Y - 16) / s
    c.paint(c.cov(d + 0.5), F.mix(WHITE, hexc('#FFD45A'), np.clip(rr * 1.25, 0, 1) ** 1.3), alpha)
    # small secondary diagonal glint
    d2 = F.sd_glint(c.X, c.Y, 16, 16, s * 0.42, s * 0.42, c.px, rot_=math.pi / 4 + rot, pinch=0.6)
    c.paint(c.cov(d2), WHITE, 0.7 * alpha)
    return c.image()


# =========================================================================== chief_marker (72 x 88, 4 f, light sweep)
def pinecone_sd(c, x, y, s):
    """Small pinecone (tip down) centred at (x, y), height ~2.4 s."""
    body = F.smin(F.sd_ellipse(c.X, c.Y, x, y + 0.1 * s, 0.82 * s, 1.05 * s),
                  F.sd_polygon(c.X, c.Y, [(x - 0.55 * s, y + 0.4 * s), (x + 0.55 * s, y + 0.4 * s), (x, y + 1.35 * s)]) - 0.15 * s,
                  0.3 * s)
    return body


def draw_pinecone(c, x, y, s, white=True, ow=1.3):
    body = pinecone_sd(c, x, y, s)
    pal = ('#FFFFFF', '#CFE4F2', '#24585A') if white else ('#C98F55', '#8A5A33', '#3C2414')
    F.toy(c, body, pal[0], pal[1], pal[2], ow=ow, bevel=s * 0.5, gloss=0.25, shadow=0, hi=0.5, lo=0.35,
          tint_lo=hexc('#5E8FB0'))
    # scales: little chevrons
    for j, yy in enumerate((-0.35, 0.15, 0.62)):
        for xx in ((-0.32, 0.32) if j < 2 else (0.0,)):
            sc = F.sd_polyline(c.X, c.Y, [(x + (xx - 0.24) * s, y + (yy - 0.12) * s), (x + xx * s, y + (yy + 0.1) * s),
                                          (x + (xx + 0.24) * s, y + (yy - 0.12) * s)], 0.07 * s + 0.25)
            c.fill(F.intersect(sc, body + 0.6), hexc('#7FA7C4'), 0.8)
    # stem + two teal needles (a little crown)
    c.fill(F.sd_segment(c.X, c.Y, x, y - 1.0 * s, x, y - 1.5 * s, 0.16 * s + 0.4), hexc('#24585A'))
    for sgn in (-1, 1):
        nd = F.sd_segment(c.X, c.Y, x, y - 1.25 * s, x + sgn * 0.95 * s, y - 1.85 * s, 0.17 * s + 0.35)
        c.fill(nd - 0.7, hexc('#17736B'))
        c.fill(nd, hexc('#43E0C6'))
    return body


def draw_marker(f, nf=4):
    W, H = 72, 88
    c = F.Canvas(W, H, ss=4)
    cx, cy, R = 36.0, 43.0, 30.0
    disc = F.sd_circle(c.X, c.Y, cx, cy, R)
    rim_o = F.sd_circle(c.X, c.Y, cx, cy, R + 3.0)
    tail = F.sd_polygon(c.X, c.Y, [(cx - 10.0, cy + 21), (cx + 10.0, cy + 21), (cx, 86.6)]) - 1.4
    outer = F.smin(rim_o, tail, 3.0)
    crown_y = cy - R - 2.0
    # navy drop shadow (one, soft, offset down-right like every house icon)
    c.shadow(c.cov(outer - 0.8), dx=0.8, dy=2.4, sigma=1.8, color=NAVY, opacity=0.42)
    # dark hairline + white rim
    c.fill(outer - 1.0, hexc('#0E4C47'), 0.95)
    c.fill(outer, WHITE)
    inner = F.smin(disc, F.sd_polygon(c.X, c.Y, [(cx - 7.0, cy + 21), (cx + 7.0, cy + 21), (cx, 82.2)]) - 1.0, 2.5)
    yr = (cy - R, cy + R)
    F.toy(c, inner, '#5FD9C9', '#1E9488', None, ow=0, bevel=7, gloss=0.0, shadow=0, hi=0.45, lo=0.5,
          tint_lo=hexc('#0E5A54'), yr=yr)
    # inner soft shade ring (depth)
    c.paint(c.cov(-(disc + 2.5), feather=4.0) * c.cov(disc), hexc('#0E5A54'), 0.25)
    # gold 5-point star (>= 30 px across)
    st = F.sd_star(c.X, c.Y, cx, cy + 1.2, 17.0, 7.6, 5, rot=-math.pi / 2, round_=1.8)
    c.shadow(c.cov(st), dx=0.6, dy=1.6, sigma=1.2, color='#0B3F3A', opacity=0.5)
    F.toy(c, st, '#FFF6C8', '#F5B83A', '#8E520A', ow=1.6, bevel=4.0, gloss=0.0, shadow=0, hi=0.7, lo=0.5,
          tint_lo=hexc('#D0701A'))
    # star facets: brighter upper-left arms
    c.fill(F.intersect(st + 2.2, F.sd_polygon(c.X, c.Y, [(cx, cy - 18), (cx - 18, cy - 4), (cx, cy + 1)])), WHITE, 0.25)
    # static gloss top-left of the badge
    glx, gly = cx - 12, cy - 17
    X2, Y2 = F.rot(c.X, c.Y, glx, gly, math.radians(-35))
    c.fill(F.intersect(F.sd_ellipse(X2, Y2, glx, gly, 9.5, 3.6), disc + 2), WHITE, 0.55, feather=0.8)
    # light sweep (4 frames): a soft diagonal band crossing the badge
    pos = [-46.0, -10.0, 16.0, 46.0][f]
    band = np.abs((c.X - cx) * 0.8 + (c.Y - cy) * 0.6 - pos) - 5.5
    sweep = c.cov(band, feather=3.0) * c.cov(F.union(disc, tail) + 1.5)
    c.paint(sweep, WHITE, 0.42)
    # tiny white pinecone crown on the badge's top edge
    draw_pinecone(c, cx, crown_y + 0.3, 4.1)
    return c.image()


# =========================================================================== navigation
def ground_xy(c, cx, cy, ang_screen):
    """Ground-plane coordinates (u along the arrow, v across) for a decal pointing at screen angle ang_screen
    (radians, 0 = screen right, clockwise).  The 2:1 ground maps (gx, gy) -> screen (gx, gy / 2)."""
    phi = math.atan2(2 * math.sin(ang_screen), math.cos(ang_screen))
    gx, gy = c.X - cx, (c.Y - cy) * 2.0
    u = gx * math.cos(phi) + gy * math.sin(phi)
    v = -gx * math.sin(phi) + gy * math.cos(phi)
    return u, v


def to_screen_sd(c, f_ground):
    """Ground-space distance field -> approximately screen-space distance (|grad| on the screen grid)."""
    gy, gx = np.gradient(f_ground.astype(np.float32), c.px)
    g = np.maximum(np.hypot(gx, gy), 1e-4)
    return (f_ground / g).astype(np.float32)


def chevron_sd_ground(u, v, tip, arm, spread, half_w):
    """One '>' chevron in ground units: apex at u = tip, arms back by `arm` and out by +-spread, stroke half_w."""
    def seg(ax, ay, bx, by):
        pax, pay = u - ax, v - ay
        bax, bay = bx - ax, by - ay
        h = np.clip((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
        return np.hypot(pax - bax * h, pay - bay * h)
    d = np.minimum(seg(tip, 0, tip - arm, -spread), seg(tip, 0, tip - arm, spread))
    return d - half_w


def draw_nav_chevron(k):
    """Flat ground chevron (double '>'), frame k points along screen angle k x 22.5 deg (0 = right, clockwise),
    pre-projected onto the 2:1 ground like a decal; teal with a white rim and a soft gold inner highlight."""
    c = F.Canvas(64, 40, ss=4)
    ang = math.radians(k * 22.5)
    u, v = ground_xy(c, 32, 20.5, ang)
    g_front = chevron_sd_ground(u, v, 18.5, 15.0, 10.0, 4.3)
    g_back = chevron_sd_ground(u, v, -1.5, 15.0, 10.0, 4.3)
    d_front = to_screen_sd(c, g_front)
    d_back = to_screen_sd(c, g_back)
    both = np.minimum(d_front, d_back)
    # soft contact shadow on the ground (offset down: the decal sits a hair above the snow)
    c.shadow(c.cov(both - 2.2), dx=0.0, dy=1.6, sigma=1.4, color=NAVY, opacity=0.38)
    for dd, bright in ((d_back, 0.82), (d_front, 1.0)):
        c.fill(dd - 2.3, hexc('#0E4C47'), 0.85)                  # dark hairline (reads on snow)
        c.fill(dd - 1.7, WHITE)                                  # white rim
        yr = (float(c.Y[dd < 0].min()) if (dd < 0).any() else 0, float(c.Y[dd < 0].max()) if (dd < 0).any() else 1)
        F.toy(c, dd, '#62DCCB', '#1E9C8F', None, ow=0, bevel=2.2, gloss=0.0, shadow=0, hi=0.5, lo=0.4,
              tint_lo=hexc('#0E5A54'), yr=yr, alpha=1.0)
        # soft gold inner highlight along the middle of the stroke
        c.paint(c.cov(dd + 2.2, feather=1.2), hexc('#FFE08A'), 0.55 * bright)
    c.clip(edge_window(c, 1.5, 1.5))
    return c.image()


def draw_nav_dot(k):
    """Footprint dot on the ground: k = 0 normal (teal, white centre), 1 = highlight (brighter, gold rim)."""
    c = F.Canvas(28, 14, ss=6)
    cx, cy = 14, 6.6
    rx, ry = 8.8, 4.2
    d = F.sd_ellipse(c.X, c.Y, cx, cy, rx, ry)
    c.shadow(c.cov(d - 1.2), dy=0.8, sigma=0.7, color=NAVY, opacity=0.35)
    if k == 0:
        c.fill(d - 1.6, hexc('#0E4C47'), 0.8)
        c.fill(d - 1.0, WHITE)
        F.toy(c, d, '#5FD9C9', '#1E9488', None, ow=0, bevel=2.0, gloss=0.0, shadow=0, hi=0.5, lo=0.4,
              tint_lo=hexc('#0E5A54'), yr=(cy - ry, cy + ry))
        c.fill(F.sd_ellipse(c.X, c.Y, cx - 0.6, cy - 0.5, 3.4, 1.7), WHITE, 0.95, feather=0.4)
    else:
        c.paint(np.exp(-np.maximum(d, 0) ** 2 / 2.5) * edge_window(c, 1.5, 2.0), hexc('#FFE9A0'), 0.6)
        c.fill(d - 1.8, hexc('#A65C0C'), 0.8)
        c.fill(d - 1.2, hexc('#FFD45A'))
        F.toy(c, d, '#B8FFF2', '#43E0C6', None, ow=0, bevel=2.0, gloss=0.0, shadow=0, hi=0.6, lo=0.3,
              tint_lo=hexc('#1F8F86'), yr=(cy - ry, cy + ry))
        c.fill(F.sd_ellipse(c.X, c.Y, cx - 0.4, cy - 0.4, 4.4, 2.2), WHITE, 1.0, feather=0.4)
    c.clip(edge_window(c, 1.6, 2.6))
    return c.image()


def draw_nav_ring(f, nf=8):
    """Dashed ground ring (12 dashes, teal with a gold core) pulsing outward and fading: frame 0 small / bright,
    frame 7 large / faint (the destination marker under the badge)."""
    c = F.Canvas(160, 80, ss=4)
    t = f / (nf - 1)
    k = 0.52 + 0.48 * (1 - (1 - t) ** 1.6)                  # radius fraction: eases out
    alpha = 1.0 - 0.82 * t ** 1.2
    rx, ry = 70.0 * k, 35.0 * k
    hw = 3.4 - 1.2 * t
    d, nx, ny, u = ellipse_param(c, 80, 40, rx, ry)
    spin = f / nf / 12.0                                     # dashes creep 1/12 turn per loop... (seamless:
    duty = 0.62                                              # one full dash period over the loop)
    ph = ((arc_frac(u, rx, ry) - spin) * 12.0) % 1.0
    per = math.pi * (3 * (rx + ry) - math.sqrt((3 * rx + ry) * (rx + 3 * ry))) / 12.0   # dash period (arc px)
    dash_d = (np.abs(ph - 0.5) - duty / 2) * per                       # + outside the dash, along the arc
    rr = hw * 0.95                                                     # round caps (capsule dashes)
    qa, qc = dash_d + rr, np.abs(d) - hw + rr
    band = np.hypot(np.maximum(qa, 0), np.maximum(qc, 0)) + np.minimum(np.maximum(qa, qc), 0) - rr
    win = edge_window(c, 2.0, 1.5)
    L = c.layer()
    L.paint(np.exp(-0.5 * (np.maximum(np.abs(d) - hw, 0) / 3.0) ** 2) * win, hexc('#7FE6D8'), 0.28)
    L.shadow(L.cov(band - 1.2), dy=1.2, sigma=1.0, color=NAVY, opacity=0.35)
    L.fill(band - 1.9, hexc('#0E4C47'), 0.85)
    L.fill(band - 1.3, WHITE)
    lam, n = tube_light(nx, ny, d / hw)
    base = np.broadcast_to(hexc('#26AE9F'), d.shape + (3,))
    col = np.clip(base + (1 - base) * np.clip(lam, 0, None)[..., None] * 0.45
                  - base * np.clip(-lam, 0, None)[..., None] * 0.35, 0, 1)
    L.paint(L.cov(band), col)
    # gold core line inside each dash
    L.paint(L.cov(np.maximum(np.abs(d) - hw * 0.28, dash_d + hw * 0.9)), hexc('#FFD45A'), 0.95)
    c.over(L, alpha)
    c.clip(edge_window(c, 1.5, 1.2))
    return c.image()


def badge_body(c, x0, y0, w, h, r, tip_y, tw):
    body = F.sd_box(c.X, c.Y, x0 + w / 2, y0 + h / 2, w / 2, h / 2, r)
    cx = x0 + w / 2
    tail = F.sd_polygon(c.X, c.Y, [(cx - tw, y0 + h - 6), (cx + tw, y0 + h - 6), (cx, tip_y)]) - 1.2
    return F.smin(body, tail, 3.0), body


def draw_nav_badge(f=0):
    """Rounded teal speech badge (80 x 80 body, white 3 px rim, navy drop shadow) with a pointer at the bottom
    (anchor = its tip); an empty cream disc of 56 px (iconRect) for the item icon the game draws."""
    W, H = 88, 100
    c = F.Canvas(W, H, ss=4)
    x0, y0, bw, bh = 4.0, 2.5, 80.0, 80.0
    outer, body = badge_body(c, x0, y0, bw, bh, 22.0, 99.2, 11.0)
    c.shadow(c.cov(outer - 0.6), dx=0.6, dy=2.2, sigma=1.6, color=NAVY, opacity=0.42)
    c.fill(outer - 0.9, hexc('#0E4C47'), 0.95)
    c.fill(outer, WHITE)
    inner, _ = badge_body(c, x0 + 3, y0 + 3, bw - 6, bh - 6, 19.0, 94.0, 8.0)
    F.toy(c, inner, '#5FD9C9', '#1E9488', None, ow=0, bevel=7, gloss=0.0, shadow=0, hi=0.45, lo=0.5,
          tint_lo=hexc('#0E5A54'), yr=(y0, y0 + bh))
    cx, cy, R = 44.0, 42.0, 28.0
    disc = F.sd_circle(c.X, c.Y, cx, cy, R)
    # recessed disc: inner shadow from the top, cream bowl, thin teal-dark lip
    c.fill(disc - 1.4, hexc('#167A70'), 0.9)
    t = np.clip((c.Y - (cy - R)) / (2 * R), 0, 1)
    c.paint(c.cov(disc), F.mix(hexc('#EFE6D2'), hexc('#FFFDF6'), t ** 0.7))
    c.paint(c.cov(disc) * np.clip(1 - (c.Y - (cy - R)) / 9.0, 0, 1) ** 2, hexc('#6B5A44'), 0.22)
    X2, Y2 = F.rot(c.X, c.Y, 22, 14, math.radians(-30))
    c.fill(F.intersect(F.sd_ellipse(X2, Y2, 22, 14, 10, 3.6), inner + 1.5), WHITE, 0.5, feather=0.8)
    glint(c, 75.5, 13.0, 4.0, a=1.0, core=WHITE, tip=hexc('#FFE9A0'), edge=hexc('#0E4C47'), edge_a=0.5)
    return c.image()


def draw_nav_edge(f=0):
    """Screen-edge badge: teal circle (D 64) with a white rim and an arrow notch on its RIGHT side (the game rotates
    it toward the target), an empty cream disc of 44 px (iconRect) for the item icon."""
    W, H = 80, 80
    c = F.Canvas(W, H, ss=4)
    cx, cy, R = 40.0, 40.0, 32.0
    circ = F.sd_circle(c.X, c.Y, cx, cy, R)
    notch = F.sd_polygon(c.X, c.Y, [(cx + 20, cy - 15), (77.0, cy), (cx + 20, cy + 15)]) - 0.8
    outer = F.smin(circ, notch, 2.5)
    c.shadow(c.cov(outer - 0.4), dx=0.4, dy=1.8, sigma=1.4, color=NAVY, opacity=0.42)
    c.fill(outer - 0.9, hexc('#0E4C47'), 0.95)
    c.fill(outer, WHITE)
    inner = F.smin(F.sd_circle(c.X, c.Y, cx, cy, R - 3.0),
                   F.sd_polygon(c.X, c.Y, [(cx + 20, cy - 11), (73.6, cy), (cx + 20, cy + 11)]) - 0.6, 2.0)
    F.toy(c, inner, '#5FD9C9', '#1E9488', None, ow=0, bevel=6, gloss=0.0, shadow=0, hi=0.45, lo=0.5,
          tint_lo=hexc('#0E5A54'), yr=(cy - R, cy + R))
    disc = F.sd_circle(c.X, c.Y, cx, cy, 22.0)
    c.fill(disc - 1.3, hexc('#167A70'), 0.9)
    t = np.clip((c.Y - (cy - 22)) / 44, 0, 1)
    c.paint(c.cov(disc), F.mix(hexc('#EFE6D2'), hexc('#FFFDF6'), t ** 0.7))
    c.paint(c.cov(disc) * np.clip(1 - (c.Y - (cy - 22)) / 7.0, 0, 1) ** 2, hexc('#6B5A44'), 0.22)
    # the arrow notch gets a small white chevron so the direction reads even under an icon
    ch = F.sd_polyline(c.X, c.Y, [(65.5, cy - 5.5), (70.5, cy), (65.5, cy + 5.5)], 1.5)
    c.fill(ch, WHITE, 0.95)
    X2, Y2 = F.rot(c.X, c.Y, 27, 17, math.radians(-35))
    c.fill(F.intersect(F.sd_ellipse(X2, Y2, 27, 17, 9, 3.2), inner + 1.5), WHITE, 0.5, feather=0.8)
    return c.image()


# =========================================================================== registry
def frames_of(key):
    spec = SPEC[key]
    return [spec['draw'](i) for i in range(spec['frames'])]


SPEC = {
    'chief_halo': dict(size=(192, 96), frames=12, fps=10, repeat=-1, anchor=[0.5, 0.5], draw=draw_halo),
    'chief_halo_gold': dict(size=(192, 96), frames=8, fps=12, repeat=-1, anchor=[0.5, 0.5], draw=draw_halo_gold),
    'chief_halo_rank2': dict(size=(216, 108), frames=1, fps=0, repeat=0, anchor=[0.5, 0.5], draw=draw_rank2),
    'chief_glow_back': dict(size=(160, 200), frames=8, fps=8, repeat=-1, anchor=[0.5, 0.82], draw=draw_glow_back),
    'chief_sparkle': dict(size=(32, 32), frames=6, fps=12, repeat=0, anchor=[0.5, 0.5], draw=draw_sparkle),
    'chief_marker': dict(size=(72, 88), frames=4, fps=6, repeat=-1, anchor=[0.5, 1.0], draw=draw_marker),
    'nav_chevron': dict(size=(64, 40), frames=16, fps=0, repeat=0, anchor=[0.5, 0.5], draw=draw_nav_chevron,
                        names='{key}_{i:02d}'),
    'nav_dot': dict(size=(28, 14), frames=2, fps=0, repeat=0, anchor=[0.5, 0.5], draw=draw_nav_dot),
    'nav_ring': dict(size=(160, 80), frames=8, fps=10, repeat=-1, anchor=[0.5, 0.5], draw=draw_nav_ring),
    'nav_badge': dict(size=(88, 100), frames=1, fps=0, repeat=0, anchor=[0.5, 1.0], draw=draw_nav_badge,
                      iconRect=[16, 14, 56, 56]),
    'nav_edge': dict(size=(80, 80), frames=1, fps=0, repeat=0, anchor=[0.5, 0.5], draw=draw_nav_edge,
                     iconRect=[18, 18, 44, 44]),
}


CONTRACT_KEYS = ['chief_halo', 'chief_halo_gold', 'chief_halo_rank2', 'chief_glow_back', 'chief_sparkle', 'chief_marker',
                 'nav_chevron', 'nav_dot', 'nav_ring', 'nav_badge', 'nav_edge']
NOTES = {
    'chief_halo': ('fv_halo', 'Aurora ring on the ground under the chief (DEPTH.PAD + 2: over pads and decals, under shadows '
                   'and every character). Hollow 2:1 jelly tube, outer 184 x 92, ring 7 px; mint -> sky -> lilac gradient '
                   'travels once round per loop; 1 px gold inner line, 1 px darker teal outer rim (snow), soft glow; 6 tiny '
                   'stars twinkle on it. Centre fully transparent. World width = aura.ringPx 70 x min(2, 1.2 / zoom) for '
                   'zoom < 1.2 (else 70) -> setScale(width / 192): ~45 CSS px on a 390 px phone at every zoom.'),
    'chief_halo_gold': ('fv_halo_gold', 'The working state (chief at a station work spot, labour.chiefSpeed x1.25 made '
                        'visible): same ellipse in warm gold, brighter glow, a sunburst of 12 short rays inside the ring '
                        'pointing out at it (frames 0-3 grow, 4-7 settle). Same scale / position as chief_halo; crossfade.'),
    'chief_halo_rank2': ('fv_halo_rank2', 'From 읍 on: thin double gold band (2 px + 1 px, 4 px apart), outer 208 x 104, '
                         'drawn just under the ring (depth ring - 0.01) at the ring scale x 192 / 192 (it already sits '
                         '12 px outside the 184 px ring in its own 216 px frame: use the SAME scale as the ring).'),
    'chief_glow_back': ('fv_halo_glow', '광채: soft vertical oval radiance behind the body (depth = chief - 0.5), anchor = '
                        'his feet. Pale gold core #FFE7A3 55 % fading to mint (left) / lilac (right) at 0 %, slow shimmer, '
                        'no hard edge. Drawn 1:1 it spans ~1.4 x the 128 px chief frame. Alpha aura.glowDay 0.35 by day, '
                        'aura.glowNight 0.6 at night.'),
    'chief_sparkle': ('fv_halo_mote / fx_sparkle', 'One mote twinkle (appears, peaks on frames 1-2, fades): <= 6 pooled, '
                      'riding the ring (depth chief +- 1) at setScale(ring scale x (0.45 .. 0.75)), and the x1.25 / '
                      '응원 sparkles at scale ~1.'),
    'chief_marker': ('fv_halo_pin (ui3 ui_icon_fame stand-in)', 'Far-zoom / crowd / 관망 star pin over his head (or his '
                     'carried tower), DEPTH.LABEL - 30 (above the night overlay). Anchor = pointer tip. Draw 22 CSS px wide: '
                     'world scale = 22 / (zoom x 390 / 720) / 72. Star 32 px across in the frame (>= 30). 4-frame light '
                     'sweep at 6 fps, no bob.'),
    'nav_chevron': ('fv_nav_chevron (frames c0..c15)', 'Flat ground chevron (double >) lying on the 2:1 ground, '
                    'pre-projected like a decal. Frame k = nav_chevron_{k:02d} points along SCREEN angle k x 22.5 deg (0 = '
                    'screen right, clockwise): k = round(atan2(dy, dx) / 22.5 deg) mod 16 for the screen vector to the next '
                    'route point. DEPTH.PAD + 3, 56 px ahead of his boots, scale 1 (0.8 when the tutorial arrow also shows).'),
    'nav_dot': ('fv_nav_dot (frames d0, d1)', 'Footprint dot along the route every nav.dotEvery 48 px: nav_dot_0 normal, '
                'nav_dot_1 highlight for the light wave running toward the target every 1.2 s. DEPTH.PAD + 3.'),
    'nav_ring': ('fv_nav_ring', 'Destination ring on the pad (DEPTH.PAD + 3): 12 teal capsule dashes with gold cores pulsing '
                 'outward and fading (frame 0 small / bright -> 7 large / faint), dashes creep 1/12 turn per loop. Play the '
                 'anim at scale 1 (drop the code pulse).'),
    'nav_badge': ('Navigator badge container (ui_panel + item icon)', 'Badge 90 px above the destination ring (DEPTH.LABEL - '
                  '40). Anchor = pointer tip. Draw the item icon into iconRect [x, y, w, h] (a 56 px cream disc; icon ~44 px), '
                  'the short name as text beside or under it.'),
    'nav_edge': ('fv_nav_edge (ui_arrow)', 'Screen-edge badge (UI scene): rotate it so its RIGHT-side notch points at the '
                 'off-screen target (rotation = atan2(dy, dx)); keep the icon upright (draw the icon as a separate image at '
                 'the badge centre, iconRect [x, y, w, h] = 44 px disc) and the route metres under it.'),
}


# =========================================================================== packing (MaxRects, best short side fit)
def _trim(im, pad=1, floor=2):
    """Bounding box of the pixels with alpha > floor (/255) plus pad; fainter pixels are invisible and dropped."""
    bb = im.getchannel('A').point(lambda v: 255 if v > floor else 0).getbbox()
    if bb is None:
        return (0, 0, 1, 1)
    x0, y0, x1, y1 = bb
    return (max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad))


SORTS = (lambda s: (-max(s), -s[0] * s[1]), lambda s: (-s[0] * s[1],), lambda s: (-s[1], -s[0]),
         lambda s: (-s[0], -s[1]))


def maxrects(sizes, W, H=8192, pad=2, sort=0, order=None):
    """Place rects (w, h) in a W-wide bin; returns [(x, y)] or None.  Each rect reserves w+pad x h+pad."""
    free = [(0, 0, W + pad, H)]
    out = [None] * len(sizes)
    if order is None:
        order = sorted(range(len(sizes)), key=lambda i: SORTS[sort](sizes[i]))
    for i in order:
        w, h = sizes[i][0] + pad, sizes[i][1] + pad
        best = None
        for (fx, fy, fw, fh) in free:
            if w <= fw and h <= fh:
                score = (fy + h, min(fw - w, fh - h))          # bottom-left first, then short-side fit
                if best is None or score < best[0]:
                    best = (score, fx, fy)
        if best is None:
            return None
        _, x, y = best
        out[i] = (x, y)
        nf = []
        for (fx, fy, fw, fh) in free:
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                nf.append((fx, fy, fw, fh))
                continue
            if x > fx:
                nf.append((fx, fy, x - fx, fh))
            if x + w < fx + fw:
                nf.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy:
                nf.append((fx, fy, fw, y - fy))
            if y + h < fy + fh:
                nf.append((fx, y + h, fw, fy + fh - y - h))
        nf = [r for r in nf if r[2] > 0 and r[3] > 0]
        free = [r for j, r in enumerate(nf) if not any(
            k != j and r[0] >= q[0] and r[1] >= q[1] and r[0] + r[2] <= q[0] + q[2] and r[1] + r[3] <= q[1] + q[3]
            and (r != q or k < j) for k, q in enumerate(nf))]
    return out


def pack(frames, max_side=1024, pad=2, trim=True, no_trim=(), widths=None, app='frost-village/tools/fx/gen_chief_fx.py',
         shuffles=0):
    """frames: [(name, PIL RGBA)] -> (sheet, Phaser JSON-hash atlas).  Tries several sheet widths and keeps the
    smallest area that fits max_side x max_side.  Names in no_trim keep their full frame (9-slice panels)."""
    items = []
    for name, im in frames:
        if trim and name not in no_trim:
            box = _trim(im)
            a = np.asarray(im).copy()
            a[a[..., 3] <= 2] = 0                               # what the trim drops must not exist anywhere
            crop = Image.fromarray(a, 'RGBA').crop(box)
        else:
            box = (0, 0, im.width, im.height)
            crop = im.crop(box)
        items.append((name, im, box, crop))
    sizes = [(c.width, c.height) for _, _, _, c in items]
    best = None
    rng = np.random.default_rng(7)
    base_orders = [sorted(range(len(sizes)), key=lambda i, so=so: SORTS[so](sizes[i])) for so in range(len(SORTS))]
    extra = []
    for _ in range(shuffles):                  # deterministic random restarts: big rects first, the rest shuffled
        o = list(base_orders[0])
        k = max(1, len(o) // 4)
        tail = o[k:]
        rng.shuffle(tail)
        extra.append(o[:k] + tail)
    for W in (widths or range(max(max(w for w, _ in sizes), 256), max_side + 1, 8)):
      for order in base_orders + extra:
        pl = maxrects(sizes, W, pad=pad, order=order)
        if pl is None:
            continue
        used_w = max(x + w for (x, _), (w, _) in zip(pl, sizes))
        used_h = max(y + h for (_, y), (_, h) in zip(pl, sizes))
        sw, sh = (used_w + 1) // 2 * 2, (used_h + 1) // 2 * 2          # even sizes (NPOT is fine for WebGL)
        if sw > max_side or sh > max_side:
            continue
        if best is None or sw * sh < best[0] or (sw * sh == best[0] and max(sw, sh) < max(best[1], best[2])):
            best = (sw * sh, sw, sh, pl)
    if best is None:
        raise SystemExit(f'atlas does not fit {max_side} x {max_side}')
    _, sw, sh, pl = best
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    fr = {}
    for (name, im, box, crop), (x, y) in zip(items, pl):
        sheet.paste(crop, (x, y))
        fr[name] = {'frame': {'x': x, 'y': y, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != im.size,
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': im.width, 'h': im.height}}
    atlas = {'frames': fr, 'meta': {'app': app, 'version': '1.0', 'image': '', 'format': 'RGBA8888',
                                    'size': {'w': sw, 'h': sh}, 'scale': '1'}}
    return sheet, atlas


def frame_names(key):
    sp = SPEC[key]
    pat = sp.get('names', '{key}_{i}')
    return [pat.format(key=key, i=i) for i in range(sp['frames'])]


def render_all():
    """All frames {name: PIL}; cached as PNGs in CACHE/frames (keyed by this file's hash)."""
    import hashlib
    h = hashlib.sha1(open(__file__, 'rb').read() + open(F.__file__, 'rb').read()).hexdigest()[:12]
    d = os.path.join(CACHE, 'frames_' + h)
    out = {}
    if os.path.isdir(d) and all(os.path.exists(os.path.join(d, n + '.png')) for k in SPEC for n in frame_names(k)):
        for k in SPEC:
            for n in frame_names(k):
                out[n] = Image.open(os.path.join(d, n + '.png')).convert('RGBA')
        return out
    os.makedirs(d, exist_ok=True)
    for k in SPEC:
        for n, im in zip(frame_names(k), frames_of(k)):
            assert im.size == tuple(SPEC[k]['size']), (n, im.size)
            im.save(os.path.join(d, n + '.png'))
            out[n] = im
    return out


def write_assets(frames):
    order = [n for k in SPEC for n in frame_names(k)]
    sheet, atlas = pack([(n, frames[n]) for n in order])
    os.makedirs(OUT, exist_ok=True)
    atlas['meta']['image'] = ATLAS + '.png'
    sheet.save(os.path.join(OUT, ATLAS + '.png'), optimize=True)
    with open(os.path.join(OUT, ATLAS + '.json'), 'w') as f:
        json.dump(atlas, f, separators=(',', ':'))
    sprites = {}
    for k in CONTRACT_KEYS:
        sp = SPEC[k]
        names = frame_names(k)
        e = {'atlas': ATLAS, 'frame': names[0], 'anchor': sp['anchor'], 'kind': 'fx', 'blend': 'NORMAL',
             'frameSize': list(sp['size']), 'frames': sp['frames'], 'frameNames': names,
             'fps': sp['fps'], 'repeat': sp['repeat']}
        if sp['frames'] > 1 and sp['fps'] > 0:
            e['anims'] = {'play': {'frames': names, 'fps': sp['fps'], 'repeat': sp['repeat']}}
        if 'iconRect' in sp:
            e['iconRect'] = sp['iconRect']
        if k == 'nav_chevron':
            e['headings'] = 16
            e['headingStepDeg'] = 22.5
        if k == 'nav_dot':
            e['states'] = {'normal': names[0], 'highlight': names[1]}
        if k == 'nav_edge':
            e['pointsAtRad'] = 0.0
        e['replaces'] = NOTES[k][0]
        e['notes'] = NOTES[k][1]
        sprites[k] = e
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    man = {
        'version': 1,
        'generator': 'tools/fx/gen_chief_fx.py (procedural numpy + Pillow on fxlib; fx / ui house style)',
        'conventions': {
            'contract': 'CONTRACT_V42 §AG. Paths relative to frost-village/assets/. Fragment name: chief_fx (the build '
                        'packs it with ui5_icons into the v42_core page).',
            'blend': 'NORMAL',
            'frames': 'Atlas frames are named {key}_{i} (nav_chevron_{ii}); trimmed JSON-hash with sourceSize kept, so '
                      'anchors refer to the full contract frame. sprites[key]: frame (first), anchor, frameSize, frames, '
                      'frameNames, fps, repeat; animated keys also carry anims.play, so Assets.spriteAnims creates '
                      "'spr:<key>:play' (e.g. sprite.play('spr:chief_halo:play')).",
            'readability': 'Every bright shape has a darker cool (teal / navy) or amber rim and the nav pieces a soft '
                           'navy contact shadow, so they read on white snow, grey cobbles, brown dirt and under the night '
                           'MULTIPLY overlay (darkness 0.45, #5A6AA8). Drawn on a 4x supersampled canvas, clean from 0.5x '
                           'to 2x.',
            'screenSize': {
                'chief_halo': 'drawn 45 CSS px wide on a 390 px phone at every zoom: world width = aura.ringPx 70 x '
                              'min(2, 1.2 / zoom) (zoom < aura.fullZoom 1.2, else 70); setScale(width / 192). CSS px per '
                              'world px = zoom x 390 / 720.',
                'chief_marker': 'drawn 22 CSS px wide: setScale(22 / (zoom x 390 / 720) / 72), 14 px above the head or '
                                'the top of the carried stack.',
                'nav': 'nav_chevron / nav_dot / nav_ring at world scale 1 (0.8 next to the tutorial arrow); nav_badge '
                       'scale 1 in the world; nav_edge in the UI scene at scale 0.75-1.',
            },
            'depth': 'ring + rank band DEPTH.PAD + 2 (band - 0.01), glow chief - 0.5, sparkles chief +- 1, marker '
                     'DEPTH.LABEL - 30; nav chevron / dots / ring DEPTH.PAD + 3, badge DEPTH.LABEL - 40.',
            'pageSize': [sheet.width, sheet.height],
            'pageMiB': round(page_mib, 3),
        },
        'atlases': [{'key': ATLAS, 'png': f'chief_fx/{ATLAS}.png', 'json': f'chief_fx/{ATLAS}.json'}],
        'sprites': sprites,
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    return sheet, atlas, man


# =========================================================================== preview compositor (device pixels)
PHONE_K = 390.0 / 720.0 * 3.0          # device px per world px at camera zoom 1 (390 CSS px wide, DPR 3)
NIGHT = (np.array([0x5A, 0x6A, 0xA8], np.float32) / 255.0, 0.45)
GROUNDS = {'snow': 'ground/ground_snow.png', 'cobble': 'roads/road_cobble_wide.png', 'plaza': 'ground/ground_plaza.png',
           'dirt': 'ground/ground_dirt.png'}
_FONT = os.path.join(TOOLS, 'fonts', 'Pretendard-ExtraBold.ttf')


def font(size):
    try:
        return ImageFont.truetype(_FONT, size)
    except OSError:
        return ImageFont.load_default()


class Atlas:
    """Read-only access to a Phaser JSON-hash atlas (full untrimmed frames)."""
    _cache = {}

    def __init__(self, png, js):
        self.img = Image.open(png).convert('RGBA')
        with open(js) as f:
            self.fr = json.load(f)['frames']

    @classmethod
    def get(cls, rel):
        if rel not in cls._cache:
            cls._cache[rel] = Atlas(os.path.join(ASSETS, rel + '.png'), os.path.join(ASSETS, rel + '.json'))
        return cls._cache[rel]

    def frame(self, name):
        f = self.fr[name]
        r, s, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
        im = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        im.paste(self.img.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
        return im


def chief_frame(anim='idle', d='S', i=0):
    return Atlas.get('characters/char_player').frame(f'{anim}_{d}_{i}')


class Stage:
    """A camera view in DEVICE pixels: world objects (x, y in world px) drawn at zoom x PHONE_K like Phaser does."""

    def __init__(self, w, h, zoom, ground, cx, cy):
        self.w, self.h, self.zoom = w, h, zoom
        self.k = zoom * PHONE_K
        self.cx, self.cy = cx, cy
        self.items = []
        g = Image.open(os.path.join(ASSETS, GROUNDS[ground])).convert('RGBA') if ground in GROUNDS else None
        self.bg = Image.new('RGBA', (w, h), ground if ground not in GROUNDS else (0, 0, 0, 255))
        if g is not None:
            gs = g.resize((max(1, round(g.width * self.k)), max(1, round(g.height * self.k))), Image.LANCZOS)
            ox = int(-((cx * self.k - w / 2) % gs.width))
            oy = int(-((cy * self.k - h / 2) % gs.height))
            for yy in range(oy, h, gs.height):
                for xx in range(ox, w, gs.width):
                    self.bg.alpha_composite(gs, (max(0, xx), max(0, yy)), (max(0, -xx), max(0, -yy)))

    def dev(self, x, y):
        return (self.w / 2 + (x - self.cx) * self.k, self.h / 2 + (y - self.cy) * self.k)

    def add(self, img, x, y, anchor=(0.5, 0.5), scale=1.0, alpha=1.0, depth=0.0, overlay=False, rot=0.0):
        self.items.append((depth, len(self.items), img, x, y, anchor, scale, alpha, overlay, rot))

    def shadow(self, x, y, w=46, h=18, depth=-11000.0):
        c = F.Canvas(w + 8, h + 8, ss=2)
        d = F.sd_ellipse(c.X, c.Y, (w + 8) / 2, (h + 8) / 2, w / 2, h / 2)
        c.fill(d, hexc('#1B2840'), 0.28, feather=4.0)
        self.add(c.image(), x, y, (0.5, 0.5), 1.0, 1.0, depth)

    def render(self, night=0.0):
        out = self.bg.copy()
        dark_done = False
        for depth, _, img, x, y, anchor, scale, alpha, overlay, rot in sorted(self.items, key=lambda t: (t[0], t[1])):
            if night > 0 and not dark_done and overlay:
                out = apply_night(out, night)
                dark_done = True
            s = scale * self.k
            im = img
            if rot:
                im = im.rotate(-math.degrees(rot), resample=Image.BICUBIC, expand=False)
            tw, th = max(1, round(im.width * s)), max(1, round(im.height * s))
            im = im.resize((tw, th), Image.LANCZOS)
            if alpha < 1:
                a = np.asarray(im).copy()
                a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
                im = Image.fromarray(a, 'RGBA')
            px, py = self.dev(x, y)
            ox, oy = int(round(px - anchor[0] * tw)), int(round(py - anchor[1] * th))
            layer = Image.new('RGBA', out.size, (0, 0, 0, 0))
            layer.paste(im, (ox, oy))
            out.alpha_composite(layer)
        if night > 0 and not dark_done:
            out = apply_night(out, night)
        return out


def apply_night(img, darkness=NIGHT[1]):
    a = np.asarray(img).astype(np.float32)
    m = 1 - darkness + darkness * NIGHT[0]
    a[..., :3] *= m
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def ring_width(zoom):
    return 70.0 * (min(2.0, 1.2 / zoom) if zoom < 1.2 else 1.0)


def place_chief(st, frames, x, y, state, zoom, t=0, night=False, anim=None):
    """The chief + his aura exactly as ChiefAura sizes it (ring scale = ringWidth / 192, glow x1.15, marker 22 CSS)."""
    w = ring_width(zoom)
    sc = w / 192.0
    f_h = frames[f'chief_halo_{t % 12}']
    f_g = frames[f'chief_halo_gold_{t % 8}']
    if state in ('rank2',):
        st.add(frames['chief_halo_rank2_0'], x, y + 2, (0.5, 0.5), sc * 1.12 * 192 / 216, 1.0, -11998.01)
    if state == 'working':
        st.add(f_g, x, y + 2, (0.5, 0.5), sc * (1 + 0.06 * (t % 8 < 3)), 1.0, -11997.99)
    elif state != 'off':
        st.add(f_h, x, y + 2, (0.5, 0.5), sc, 0.6 if state == 'observe' else 0.9, -11998)
    if state == 'off':
        pass
    else:
        ga = 0.6 if night else 0.35
        st.add(frames[f'chief_glow_back_{t % 8}'], x, y + 4, (0.5, 0.82), 1.15, ga, y - 0.5)
        # motes riding the ring
        rx, ry = w * 0.46, w * 0.23
        for i in range(6):
            ang = (t / 60.0) * TAU + i / 6 * TAU
            tw = 0.5 + 0.5 * math.sin(t * 0.31 + i * 1.7)
            fi = min(5, max(0, int(round(1 + 2 * (1 - tw)))))
            st.add(frames[f'chief_sparkle_{fi}'], x + math.cos(ang) * rx, y + 2 + math.sin(ang) * ry - 2 - tw * 4,
                   (0.5, 0.5), sc * (0.55 + tw * 0.4) * 0.8, 0.35 + tw * 0.55,
                   y + 1 if math.sin(ang) > 0 else y - 1)
    if state == 'carry_nav':
        ang = math.radians(-25)
        k = int(round(math.degrees(ang) / 22.5)) % 16
        st.add(frames[f'nav_chevron_{k:02d}'], x + math.cos(ang) * w * 0.46 * 1.05,
               y + 2 + math.sin(ang) * w * 0.23 * 1.05, (0.5, 0.5), sc * 1.6, 0.9, -11997.98)
    st.shadow(x, y)
    img = chief_frame(*(anim or ('idle', 'S', 0)))
    st.add(img, x, y, (0.5, 0.8125), 1.0, 1.0, y)
    if state in ('observe', 'far', 'crowd'):
        css_k = zoom * 390 / 720
        ms = 22.0 / css_k / 72.0
        st.add(frames[f'chief_marker_{t % 4}'], x, y - 84 - 14, (0.5, 1.0), ms, 1.0, 40970, overlay=True)
    if state == 'working':
        st.add(frames['chief_sparkle_2'], x + 26, y - 70, (0.5, 0.5), 1.0, 1.0, y + 1)


def townfolk_people(n=20, seed=42):
    """n composed townsfolk (PIL 128 x 128, anchor (64, 104)) for crowd previews; cached in CACHE."""
    d = os.path.join(CACHE, 'crowd')
    os.makedirs(d, exist_ok=True)
    paths = [os.path.join(d, f'p{i:02d}.png') for i in range(n)]
    if all(os.path.exists(p) for p in paths):
        return [Image.open(p).convert('RGBA') for p in paths]
    from townfolk_compose import Townfolk
    tf = Townfolk.from_assets()
    dirs = ['S', 'SE', 'E', 'SW', 'W', 'NE', 'NW', 'N']
    out = []
    for i in range(n):
        person = tf.random_person(seed=seed + i * 7)
        anim = 'walk' if i % 3 else 'idle'
        im = tf.compose(person, anim, dirs[i % len(dirs)], (i * 3) % 4)
        im.save(paths[i])
        out.append(im)
    return out


def label(img, text, xy=(8, 6), size=22, fill=(30, 40, 60, 255), bg=(255, 255, 255, 200)):
    d = ImageDraw.Draw(img)
    f = font(size)
    bb = d.textbbox(xy, text, font=f)
    d.rounded_rectangle((bb[0] - 5, bb[1] - 3, bb[2] + 5, bb[3] + 3), radius=6, fill=bg)
    d.text(xy, text, font=f, fill=fill)
    return img


def sheet_with_header(cells, cols, header, cell_bg=(255, 255, 255, 255), pad=10, head_h=64, sub=None):
    cw, ch = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    W = cols * cw + (cols + 1) * pad
    H = head_h + rows * ch + (rows + 1) * pad
    out = Image.new('RGBA', (W, H), (236, 241, 247, 255))
    d = ImageDraw.Draw(out)
    d.text((pad, 10), header, font=font(26), fill=(30, 40, 60, 255))
    if sub:
        d.text((pad, 40), sub, font=font(17), fill=(80, 90, 110, 255))
    for i, c in enumerate(cells):
        x = pad + (i % cols) * (cw + pad)
        y = head_h + pad + (i // cols) * (ch + pad)
        out.paste(c, (x, y))
    return out


STATES = [('normal', '보통 normal'), ('working', '일하는 중 working x1.25'), ('rank2', '읍 rank 2 band'),
          ('observe', '관망 observe + 별'), ('carry_nav', '짐 + 길 안내 notch'), ('night', '밤 night')]


def preview_states(frames, zoom, path):
    cells = []
    for gname in ('snow', 'cobble', 'plaza'):
        for st_key, st_label in STATES:
            W, H = 300, 330
            st = Stage(W, H, zoom, gname, 0, -0.27 * H / (zoom * PHONE_K))
            night = st_key == 'night'
            state = 'normal' if night else st_key
            anim = ('chop', 'SE', 4) if state == 'working' else None
            if state == 'carry_nav':
                anim = ('carry_idle', 'SE', 0)
            place_chief(st, frames, 0, 0, state, zoom, t=3, night=night, anim=anim)
            if state == 'carry_nav':
                ang = math.radians(-25)
                for j in range(3):
                    st.add(frames['nav_dot_1' if j == 1 else 'nav_dot_0'], 70 + j * 44, -30 - j * 20, (0.5, 0.5), 1.0, 0.9,
                           -11997)
            im = st.render(night=NIGHT[1] if night else 0.0)
            label(im, f'{gname} · {st_label}', size=17)
            cells.append(im)
    css = zoom * 390 / 720
    sh = sheet_with_header(cells, 6, f'chief_fx — the real chief with every aura state, zoom {zoom} on a 390 px phone '
                                     f'(device px, DPR 3)',
                           sub=f'halo world width {ring_width(zoom):.0f} px = {ring_width(zoom) * css:.1f} CSS px; '
                               f'marker 22 CSS px; glow x1.15 at alpha 0.35 day / 0.6 night (MULTIPLY #5A6AA8 x 0.45). '
                               f'A phone shows this at 1/3 of the size.')
    sh.save(path)
    return path


def preview_crowd(frames, path):
    people = townfolk_people(20)
    rng = np.random.default_rng(5)
    pos = []
    while len(pos) < 20:
        x, y = rng.uniform(-170, 170), rng.uniform(-110, 120)
        if math.hypot(x, y * 1.6) < 46 or any(math.hypot(x - a, y - b) < 34 for a, b in pos):
            continue
        pos.append((x, y))
    cells = []
    for zoom in (0.6, 1.2):
        for gname, night in (('snow', False), ('cobble', False), ('dirt', False), ('cobble', True)):
            W, H = 560, 520
            st = Stage(W, H, zoom, gname, 0, -20)
            for im, (x, y) in zip(people, pos):
                st.shadow(x, y)
                st.add(im, x, y, (0.5, 104 / 128), 1.0, 1.0, y)
            place_chief(st, frames, 0, 0, 'crowd', zoom, t=5, night=night, anim=('walk', 'SE', 2))
            out = st.render(night=NIGHT[1] if night else 0.0)
            label(out, f'zoom {zoom} · {gname}{" · night" if night else ""} · 20 townsfolk', size=20)
            cells.append(out)
    sh = sheet_with_header(cells, 4, 'chief_fx — find the chief: halo + 광채 + star pin in a crowd of 20 townsfolk',
                           sub='device px (390 px phone, DPR 3); the pin shows because >= 4 people stand within 160 px '
                               '(plan §3.1 pin rule). Top row zoom 0.6, bottom row zoom 1.2.')
    sh.save(path)
    return path


def road_strip(st, poly_world, tex='roads/road_cobble_wide.png'):
    """Paint a real road texture (scaled like the ground) inside a world-space polygon, straight into the stage bg."""
    g = Image.open(os.path.join(ASSETS, tex)).convert('RGBA')
    gs = g.resize((max(1, round(g.width * st.k)), max(1, round(g.height * st.k))), Image.LANCZOS)
    layer = Image.new('RGBA', (st.w, st.h), (0, 0, 0, 0))
    ox = int(-((st.cx * st.k - st.w / 2) % gs.width))
    oy = int(-((st.cy * st.k - st.h / 2) % gs.height))
    for yy in range(oy, st.h, gs.height):
        for xx in range(ox, st.w, gs.width):
            layer.alpha_composite(gs, (max(0, xx), max(0, yy)), (max(0, -xx), max(0, -yy)))
    mask = Image.new('L', (st.w * 2, st.h * 2), 0)
    ImageDraw.Draw(mask).polygon([tuple(2 * v for v in st.dev(x, y)) for x, y in poly_world], fill=255)
    mask = mask.resize((st.w, st.h), Image.LANCZOS)
    layer.putalpha(Image.fromarray((np.asarray(layer.getchannel('A')).astype(np.float32)
                                    * np.asarray(mask).astype(np.float32) / 255).astype(np.uint8)))
    st.bg.alpha_composite(layer)


def icon_center_offset(im):
    """(dx, dy) from the frame centre to the centre of the opaque pixels (to centre an item icon in a disc)."""
    bb = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).getbbox()
    return ((bb[0] + bb[2]) / 2 - im.width / 2, (bb[1] + bb[3]) / 2 - im.height / 2), max(bb[2] - bb[0], bb[3] - bb[1])


def preview_nav(frames, path):
    """Navigation mock on real ground: chevron ahead of the chief, dots along a bent route with the light wave, the
    destination ring + badge (item icon), an edge badge at the screen border when the target is off screen."""
    items = Atlas.get('props/props_items')
    fish = items.frame('item_fish_cooked')
    (fdx, fdy), fsz = icon_center_offset(fish)
    route = [(0, 0), (130, -65), (260, -130), (340, -90), (420, -50)]
    cells = []
    for zoom, (ccx, ccy) in ((0.6, (180, -50)), (1.0, (150, -60))):
        W, H = 760, 620
        st = Stage(W, H, zoom, 'snow', ccx, ccy)
        hw = 46
        def strip(ax, ay, bx, by, ext=40):
            L = math.hypot(bx - ax, by - ay)
            ux, uy = (bx - ax) / L, (by - ay) / L
            nx, ny = -uy * 2, ux                               # perpendicular on the 2:1 ground
            nn = math.hypot(nx, ny * 1.0)
            nx, ny = nx / nn * hw, ny / nn * hw
            ax, ay, bx, by = ax - ux * ext, ay - uy * ext, bx + ux * ext, by + uy * ext
            return [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]
        road_strip(st, strip(-140, 70, 260, -130, 30))
        road_strip(st, strip(260, -130, 600, 40, 30))
        # dots every 48 px along the route, hidden within 90 px of him, the light wave on one
        pts, acc = [], 0.0
        for (ax, ay), (bx, by) in zip(route[:-1], route[1:]):
            L = math.hypot(bx - ax, by - ay)
            t0 = (48 - acc) % 48
            while t0 <= L:
                pts.append((ax + (bx - ax) * t0 / L, ay + (by - ay) * t0 / L))
                t0 += 48
            acc = (acc + L) % 48
        shown = [p for p in pts if math.hypot(*p) >= 90 and math.hypot(p[0] - route[-1][0], p[1] - route[-1][1]) > 40]
        for j, (x, y) in enumerate(shown[:16]):
            lit = j == 3
            st.add(frames['nav_dot_1' if lit else 'nav_dot_0'], x, y, (0.5, 0.5), 1.0, 1.0 if lit else 0.8, -11997)
        dx, dy = route[1][0] - route[0][0], route[1][1] - route[0][1]
        ang = math.atan2(dy, dx)
        k = int(round(math.degrees(ang) / 22.5)) % 16
        st.add(frames[f'nav_chevron_{k:02d}'], math.cos(ang) * 56, math.sin(ang) * 56 * 0.5 + 4, (0.5, 0.5), 1.0, 0.95,
               -11997)
        tx, ty = route[-1]
        st.add(frames['nav_ring_1'], tx, ty, (0.5, 0.5), 1.0, 1.0, -11997)
        st.add(frames['nav_ring_5'], tx, ty, (0.5, 0.5), 1.0, 1.0, -11997)
        # the badge 90 px above the pad + the item icon centred in its iconRect (the game draws icon + name)
        st.add(frames['nav_badge_0'], tx, ty - 90, (0.5, 1.0), 1.0, 1.0, 40960, overlay=True)
        ir = SPEC['nav_badge']['iconRect']
        icx = tx - 44 + ir[0] + ir[2] / 2
        icy = ty - 90 - 100 + ir[1] + ir[3] / 2
        isc = 44.0 / fsz
        st.add(fish, icx - fdx * isc, icy - fdy * isc, (0.5, 0.5), isc, 1.0, 40961, overlay=True)
        place_chief(st, frames, 0, 0, 'normal', zoom, t=2, anim=('carry_walk', 'NE', 3))
        for j in range(3):                                   # the carried fish tower
            st.add(fish, 12, -46 - 9 * j - 6, (0.5, 0.75), 0.6, 1.0, 1 + j * 0.01)
        img = st.render()
        dr = ImageDraw.Draw(img)
        bx, by = st.dev(tx, ty - 90 - 100)
        dr.text((bx, by - 6), '광장 판매대', font=font(max(16, int(20 * st.k))), fill=(31, 95, 102, 255), anchor='mb',
                stroke_width=max(2, int(4 * st.k)), stroke_fill=(255, 255, 255, 255))
        if st.dev(tx, ty)[0] > W - 30:
            # off screen to the right: the edge badge (UI scene, ~0.9 x logical 720 -> 390 CSS at DPR 3)
            e = frames['nav_edge_0']
            es = 0.9 * 390 / 720 * 3
            tgt = st.dev(tx, ty)
            ex, ey = W - round(40 * es) - 10, int(min(H - 120, max(120, tgt[1])))
            rot = math.degrees(math.atan2(tgt[1] - ey, tgt[0] - ex))
            eim = e.resize((round(80 * es), round(80 * es)), Image.LANCZOS).rotate(-rot, resample=Image.BICUBIC)
            img.alpha_composite(eim, (ex - eim.width // 2, ey - eim.height // 2))
            isc2 = 44 * es * 0.78 / fsz
            fi = fish.resize((round(72 * isc2), round(72 * isc2)), Image.LANCZOS)
            img.alpha_composite(fi, (int(ex - fi.width / 2 - fdx * isc2), int(ey - fi.height / 2 - fdy * isc2)))
            dr.text((ex - 8, ey + eim.height // 2 - 4), '28m', font=font(34), fill=(31, 95, 102, 255), anchor='mt',
                    stroke_width=5, stroke_fill=(255, 255, 255, 255))
        label(img, f'zoom {zoom} · nav mock on snow + cobble road (device px)', size=20)
        cells.append(img)
    sh = sheet_with_header(cells, 2, 'chief_fx — navigation: chevron, footprint dots + light wave, destination ring + '
                                     'badge, edge badge',
                           sub='chevron frame = round(screen angle / 22.5°) mod 16; dots every 48 px, hidden within 90 '
                               'px; the item icon (props_items item_fish_cooked) and texts are drawn by the game.')
    sh.save(path)
    return path


def preview_sheet(frames, path):
    """Every frame of every key over snow / cobble / dirt / night, labelled."""
    bgs = [('snow', '#F4F7FB'), ('cobble', '#8F96A3'), ('dirt', '#6B4A2E'), ('night', '#28324A')]
    rows = []
    for k in CONTRACT_KEYS:
        names = frame_names(k)
        w, h = SPEC[k]['size']
        sc = 1.0 if w >= 120 else (2.0 if w >= 40 else 3.0)
        cw, chh = int(w * sc), int(h * sc)
        n = len(names)
        per_row = max(1, min(n, 1500 // (cw + 4)))
        nrow = (n + per_row - 1) // per_row
        block = Image.new('RGBA', (1560, 30 + nrow * len(bgs) * (chh + 4)), (236, 241, 247, 255))
        d = ImageDraw.Draw(block)
        sp = SPEC[k]
        d.text((6, 4), f"{k}  {w}x{h}  {n} f  {sp['fps']} fps  {'loop' if sp['repeat'] == -1 else 'once/still'}  "
                       f"anchor {sp['anchor']}  (x{sc:g})", font=font(18), fill=(30, 40, 60, 255))
        for bi, (bn, col) in enumerate(bgs):
            for i, nme in enumerate(names):
                r, c = divmod(i, per_row)
                x = 6 + c * (cw + 4)
                y = 30 + (r * len(bgs) + bi) * (chh + 4)
                cell = Image.new('RGBA', (cw, chh), col)
                im = frames[nme].resize((cw, chh), Image.LANCZOS) if sc != 1 else frames[nme]
                cell.alpha_composite(im)
                if bn == 'night':
                    cell = apply_night(cell)
                block.paste(cell, (x, y))
        rows.append(block)
    H = sum(b.height for b in rows) + 60
    out = Image.new('RGBA', (1560, H), (236, 241, 247, 255))
    ImageDraw.Draw(out).text((6, 12), 'chief_fx — all frames over snow / cobble / dirt / night (night = the game\'s MULTIPLY '
                                      'overlay)', font=font(24), fill=(30, 40, 60, 255))
    y = 60
    for b in rows:
        out.paste(b, (0, y))
        y += b.height
    out.save(path)
    return path


def preview_gifs(frames):
    paths = []
    panels = ('#F4F7FB', '#8F96A3', '#6B4A2E', '#28324A')
    for k, scale, hold in (('chief_halo', 2, 0), ('chief_halo_gold', 2, 0), ('chief_glow_back', 1, 0),
                           ('chief_sparkle', 4, 4), ('chief_marker', 3, 0), ('nav_ring', 2, 0)):
        fr = [frames[n] for n in frame_names(k)]
        p = os.path.join(PREV, f'chief_fx_{k}.gif')
        F.save_gif(fr, p, SPEC[k]['fps'] or 8, panels=panels, hold=hold, scale=scale, anchor=SPEC[k]['anchor'])
        paths.append(p)
    # chevron: the 16 headings in turn
    fr = [frames[f'nav_chevron_{i:02d}'] for i in range(16)]
    p = os.path.join(PREV, 'chief_fx_nav_chevron.gif')
    F.save_gif(fr, p, 4, panels=panels, scale=3)
    paths.append(p)
    # the chief on snow at zoom 0.6 with the live aura (24 game frames ~ 2.4 s)
    seq = []
    for t in range(24):
        st = Stage(360, 300, 0.6, 'snow', 0, -40)
        place_chief(st, frames, 0, 0, 'normal' if t < 12 else 'working', 0.6, t=t,
                    anim=('idle', 'S', (t // 3) % 4) if t < 12 else ('chop', 'SE', t % 8))
        seq.append(st.render())
    p = os.path.join(PREV, 'chief_fx_aura_live.gif')
    seq[0].convert('RGB').save(p, save_all=True, append_images=[s.convert('RGB') for s in seq[1:]], duration=100, loop=0)
    paths.append(p)
    return paths


# =========================================================================== check
def check():
    """Check the delivered set against CONTRACT_V42 §AG.  Returns the number of errors (also printed)."""
    errs, warns = [], []
    mp = os.path.join(OUT, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: assets/chief_fx/manifest.json missing')
        return 1
    man = json.load(open(mp))
    files = sorted(os.listdir(OUT))
    if files != ['chief_fx.json', 'chief_fx.png', 'manifest.json']:
        errs.append(f'file budget: AG ships exactly 3 files, found {files}')
    atl = man['atlases']
    if len(atl) != 1 or atl[0]['key'] != ATLAS:
        errs.append('one atlas chief_fx expected')
    sheet = Image.open(os.path.join(ASSETS, atl[0]['png']))
    js = json.load(open(os.path.join(ASSETS, atl[0]['json'])))
    if sheet.mode != 'RGBA':
        errs.append(f'atlas mode {sheet.mode} (RGBA expected)')
    if sheet.width > 1024 or sheet.height > 1024:
        errs.append(f'atlas {sheet.size} > 1024 x 1024')
    if (js['meta']['size']['w'], js['meta']['size']['h']) != sheet.size:
        errs.append('atlas meta size != png size')
    want = {
        'chief_halo': ((192, 96), 12, 10, -1, [0.5, 0.5]), 'chief_halo_gold': ((192, 96), 8, 12, -1, [0.5, 0.5]),
        'chief_halo_rank2': ((216, 108), 1, None, None, [0.5, 0.5]),
        'chief_glow_back': ((160, 200), 8, 8, -1, [0.5, 0.82]), 'chief_sparkle': ((32, 32), 6, 12, 0, [0.5, 0.5]),
        'chief_marker': ((72, 88), 4, 6, -1, [0.5, 1.0]), 'nav_chevron': ((64, 40), 16, None, None, [0.5, 0.5]),
        'nav_dot': ((28, 14), 2, None, None, [0.5, 0.5]), 'nav_ring': ((160, 80), 8, 10, -1, [0.5, 0.5]),
        'nav_badge': ((88, 100), 1, None, None, [0.5, 1.0]), 'nav_edge': ((80, 80), 1, None, None, [0.5, 0.5]),
    }
    sp = man['sprites']
    if set(sp) != set(want):
        errs.append(f'sprite keys differ: missing {set(want) - set(sp)}, extra {set(sp) - set(want)}')
    full = {}
    for k, (size, n, fps, rep, anc) in want.items():
        e = sp.get(k)
        if not e:
            continue
        if e.get('blend') != 'NORMAL':
            errs.append(f'{k}: blend must be NORMAL')
        if e['anchor'] != anc:
            errs.append(f'{k}: anchor {e["anchor"]} != {anc}')
        if tuple(e['frameSize']) != size or e['frames'] != n:
            errs.append(f'{k}: frameSize/frames {e["frameSize"]}/{e["frames"]} != {size}/{n}')
        if fps is not None and (e['fps'] != fps or e['repeat'] != rep or 'anims' not in e
                                or e['anims']['play']['fps'] != fps or e['anims']['play']['repeat'] != rep):
            errs.append(f'{k}: fps/repeat/anims wrong')
        names = [f'{k}_{i:02d}' for i in range(n)] if k == 'nav_chevron' else [f'{k}_{i}' for i in range(n)]
        if e['frameNames'] != names or e['frame'] != names[0]:
            errs.append(f'{k}: frame names {e["frameNames"][:3]}... != {names[:3]}...')
        for nm in names:
            f = js['frames'].get(nm)
            if not f:
                errs.append(f'{k}: atlas frame {nm} missing')
                continue
            if (f['sourceSize']['w'], f['sourceSize']['h']) != size:
                errs.append(f'{nm}: sourceSize {f["sourceSize"]} != {size}')
            r, s = f['frame'], f['spriteSourceSize']
            if r['x'] + r['w'] > sheet.width or r['y'] + r['h'] > sheet.height:
                errs.append(f'{nm}: frame outside the sheet')
            if s['x'] < 0 or s['y'] < 0 or s['x'] + s['w'] > size[0] or s['y'] + s['h'] > size[1]:
                errs.append(f'{nm}: spriteSourceSize outside the frame')
            im = Image.new('RGBA', size, (0, 0, 0, 0))
            im.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (s['x'], s['y']))
            a = np.asarray(im)[..., 3].astype(np.float32) / 255
            full[nm] = im
            if a.max() < (0.1 if k == 'nav_ring' else 0.5):
                errs.append(f'{nm}: (almost) empty frame')
            bottom = a[-1].copy()
            if anc == [0.5, 1.0]:                       # the pointer tip IS the anchor: allowed at the bottom centre
                bottom[size[0] // 2 - 6:size[0] // 2 + 6] = 0
            border = np.concatenate([a[0], bottom, a[:, 0], a[:, -1]])
            if border.max() > 0.2:
                errs.append(f'{nm}: art touches the frame border (alpha {border.max():.2f}) - clipped')
        if 'iconRect' in want.get(k, ()) or k in ('nav_badge', 'nav_edge'):
            ir = e.get('iconRect')
            exp = {'nav_badge': 56, 'nav_edge': 44}[k]
            if not ir or ir[2] != exp or ir[3] != exp or ir[0] < 0 or ir[1] < 0 or ir[0] + ir[2] > size[0] \
                    or ir[1] + ir[3] > size[1]:
                errs.append(f'{k}: iconRect {ir} (want a {exp} px disc inside the frame)')
            else:
                im = full[names[0]]
                cxy = (int(ir[0] + ir[2] / 2), int(ir[1] + ir[3] / 2))
                px = im.getpixel(cxy)
                if px[3] < 250 or min(px[:3]) < 200:
                    errs.append(f'{k}: iconRect centre is not an empty light disc ({px})')
    if errs:
        pass
    else:
        # look-specific checks
        for i in range(12):
            a = np.asarray(full[f'chief_halo_{i}'])[..., 3]
            if a[30:66, 50:142].max() > 0:
                errs.append(f'chief_halo_{i}: centre not fully transparent ({a[30:66, 50:142].max()})')
        # ring 7 px thick at the sides, outer edge 184 x 92
        a = np.asarray(full['chief_halo_0'])[..., 3]
        row = a[48]
        opaque = np.nonzero(row > 200)[0]
        if len(opaque) == 0 or opaque.min() < 3 or opaque.max() > 188:
            errs.append(f'chief_halo: outer edge at x {opaque.min() if len(opaque) else None}..'
                        f'{opaque.max() if len(opaque) else None} (184 px ring centred in 192)')
        else:
            left = opaque[opaque < 96]
            if not 5 <= (left.max() - left.min() + 1) <= 9:
                warns.append(f'chief_halo: ring thickness at the left side {left.max() - left.min() + 1} px (7 wanted)')
        # loop smoothness: halo / gold / glow / marker / ring step from last to first frame ~ a normal step
        for k in ('chief_halo', 'chief_halo_gold', 'chief_glow_back', 'nav_ring'):
            n = want[k][1]
            arr = [np.asarray(full[f'{k}_{i}']).astype(np.float32) for i in range(n)]
            steps = [np.abs(arr[(i + 1) % n] - arr[i]).mean() for i in range(n)]
            wrap = steps[-1]
            if k != 'nav_ring' and wrap > 2.5 * max(1e-3, float(np.median(steps[:-1]))):
                errs.append(f'{k}: loop seam step {wrap:.2f} vs median {np.median(steps[:-1]):.2f}')
        # marker star >= 30 px across (gold pixels)
        m = np.asarray(full['chief_marker_0']).astype(int)
        gold = (m[..., 0] > 200) & (m[..., 1] > 140) & (m[..., 2] < 140) & (m[..., 3] > 200)
        xs = np.nonzero(gold.any(axis=0))[0]
        if len(xs) == 0 or xs.max() - xs.min() + 1 < 30:
            errs.append(f'chief_marker: gold star only {xs.max() - xs.min() + 1 if len(xs) else 0} px across (>= 30)')
        tip = np.asarray(full['chief_marker_0'])[..., 3]
        if tip[84:88, 33:39].max() < 120:
            errs.append('chief_marker: pointer tip does not reach the anchor (bottom centre)')
        # chevron headings: the front tip of frame k lies along screen angle k x 22.5 deg, the tail opposite
        for kk in range(16):
            a = np.asarray(full[f'nav_chevron_{kk:02d}'])[..., 3]
            th = math.radians(kk * 22.5)
            phi = math.atan2(2 * math.sin(th), math.cos(th))
            fx_, fy_ = 32 + 19.0 * math.cos(phi), 20.5 + 19.0 * math.sin(phi) * 0.5
            bx_, by_ = 32 - 19.0 * math.cos(phi), 20.5 - 19.0 * math.sin(phi) * 0.5
            if a[int(round(fy_ - 0.5)), int(round(fx_ - 0.5))] < 128:
                errs.append(f'nav_chevron_{kk:02d}: no tip at screen angle {kk * 22.5} deg')
            if a[int(round(by_ - 0.5)), int(round(bx_ - 0.5))] > 128:
                errs.append(f'nav_chevron_{kk:02d}: opaque where the tail gap should be')
        # nav ring: frame 0 smaller and brighter than frame 7
        a0 = np.asarray(full['nav_ring_0'])[..., 3]
        a7 = np.asarray(full['nav_ring_7'])[..., 3]
        w0 = np.nonzero(a0.max(axis=0) > 60)[0]
        w7 = np.nonzero(a7.max(axis=0) > 20)[0]
        if not (w0.max() - w0.min() < w7.max() - w7.min() and a0.max() > a7.max()):
            errs.append('nav_ring: frame 0 must be small / bright, frame 7 large / faint')
        # sparkle: appears and fades (once)
        al = [np.asarray(full[f'chief_sparkle_{i}'])[..., 3].sum() for i in range(6)]
        if not (al[-1] < al[2] and al[0] < al[2]):
            errs.append('chief_sparkle: should appear, peak and fade')
        # glow: no hard edge (max alpha step between neighbours small), core alpha ~0.55
        g = np.asarray(full['chief_glow_back_0']).astype(np.float32)
        ga = g[..., 3] / 255
        if abs(ga.max() - 0.55) > 0.12:
            warns.append(f'chief_glow_back: core alpha {ga.max():.2f} (0.55 wanted)')
        if np.abs(np.diff(ga, axis=0)).max() > 0.06 or np.abs(np.diff(ga, axis=1)).max() > 0.06:
            errs.append('chief_glow_back: hard edge (alpha step > 0.06 between neighbours)')
    page_mib = sheet.width * sheet.height * 4 / 2 ** 20
    src_sum = sum(f['sourceSize']['w'] * f['sourceSize']['h'] * 4 for f in js['frames'].values()) / 2 ** 20
    print(f'chief_fx check: {len(js["frames"])} frames, page {sheet.width}x{sheet.height} = {page_mib:.2f} MiB '
          f'(RGBA source), frames source-sum {src_sum:.2f} MiB, png {os.path.getsize(os.path.join(OUT, "chief_fx.png")) / 1024:.0f} KB')
    for w in warns:
        print('WARN:', w)
    for e in errs:
        print('ERROR:', e)
    print(f'{len(errs)} errors, {len(warns)} warnings')
    return len(errs)


def look(key, scale=3, bg=('#F4F7FB', '#8F96A3', '#6B4A2E', '#28324A')):
    """Scratch strip of one key over snow / cobble / dirt / night colours, each frame at `scale` (LANCZOS)."""
    fr = frames_of(key)
    w, h = fr[0].size
    W, H = w * scale, h * scale
    out = Image.new('RGBA', (W * len(fr), H * len(bg)), (0, 0, 0, 255))
    for j, col in enumerate(bg):
        for i, im in enumerate(fr):
            cell = Image.new('RGBA', (W, H), col)
            cell.alpha_composite(im.resize((W, H), Image.LANCZOS))
            out.paste(cell, (i * W, j * H))
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f'look_{key}.png')
    out.save(p)
    return p


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    ap.add_argument('--look', default='')
    ap.add_argument('--scale', type=int, default=2)
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--no-preview', action='store_true')
    ap.add_argument('--only-preview', default='', help='comma list: sheet,states,crowd,nav,gifs')
    a = ap.parse_args()
    if a.look:
        print(look(a.look, a.scale))
        return
    if a.check:
        sys.exit(1 if check() else 0)
    frames = render_all()
    if not a.only_preview:
        sheet, atlas, man = write_assets(frames)
        print(f'assets/chief_fx: {len(atlas["frames"])} frames, page {sheet.size}, '
              f'{man["conventions"]["pageMiB"]} MiB')
    if a.no_preview:
        sys.exit(1 if check() else 0)
    os.makedirs(PREV, exist_ok=True)
    want = set((a.only_preview or 'sheet,states,crowd,nav,gifs').split(','))
    if 'sheet' in want:
        print(preview_sheet(frames, os.path.join(PREV, 'chief_fx_sheet.png')))
    if 'states' in want:
        for z in (0.6, 1.0, 1.2):
            print(preview_states(frames, z, os.path.join(PREV, f'chief_fx_states_z{str(z).replace(".", "")}.png')))
    if 'crowd' in want:
        print(preview_crowd(frames, os.path.join(PREV, 'chief_fx_crowd.png')))
    if 'nav' in want:
        print(preview_nav(frames, os.path.join(PREV, 'chief_fx_nav_mock.png')))
    if 'gifs' in want:
        for p in preview_gifs(frames):
            print(p)
    if not a.only_preview:
        sys.exit(1 if check() else 0)


if __name__ == '__main__':
    main()
