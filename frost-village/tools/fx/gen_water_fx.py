#!/usr/bin/env python3
"""
gen_water_fx.py - water effect spritesheets for the living-water module (CONTRACT_V7 section V).

Writes the sheets into assets/water/, adds them to assets/water/manifest.json (spritesheets[]; the
textures written by gen_water.py stay as they are) and renders docs/previews/water_fx_sheet.png +
water_fx_*.gif. Deterministic. Usable with or without the shader (src/systems/Water.js).

    python3 tools/fx/gen_water_fx.py            # all sheets + previews
    python3 tools/fx/gen_water_fx.py --only fx_wave_crash --no-gif

Conventions = assets/fx (handoff doc 04 2.3.2): NORMAL blend toy-water art (white -> ice body, bevel
light from the upper left, thin sea-blue rim so it reads on white snow, sand and deep sea), frames
left -> right wrapped into rows <= 2048 px, one-shots start visibly at frame 0, loops are periodic.
Water rings / foam lie on the iso water plane (2:1). Foam lace = the same water_foam texture the shader
uses, so sprite foam and shader foam look alike.

  fx_wave_crash      192x192 x 10, 20 fps, once  '철썩': a sheet of water fans up the wall, tears into droplets,
                                                 mist; anchor = the wall foot at the waterline [0.5, 0.86]
  fx_splash_small     96x96  x 10, 24 fps, once  small splash (fish jump, pebble, swimmer kick) [0.5, 0.72]
  fx_splash_big      192x192 x 14, 24 fps, once  big splash: chunky 6-petal crown, short column [0.5, 0.80]
  fx_swim_ripple     128x64  x 12, 12 fps, loop  rings + lacy collar around a swimmer; anchor = waterline
                                                 centre [0.5, 0.5]; draw UNDER the swimmer
  fx_wake_v2         256x176 x  8, 12 fps, loop  boat wake V (bow arms + stern trail) for heading SE;
  fx_wake_v2_s/_e/_ne/_n                         other rendered headings (mirror for SW / W / NW with flipX);
                                                 anchor = hull centre at the waterline [0.5, 0.5], under the boat;
                                                 drawn for a ~2.2 m hull: scale 1.15 rowboat, 2.0 fishing boat
  fx_sparkle_water   128x64  x 12, 12 fps, loop  sun glints twinkling on water (scatter a few; low quality /
                                                 canvas fallback, or extra sparkle on calm water)
  fx_shore_wave_x    192x128 x 24, 12 fps, loop  (half res, draw at scale 2) breaking-wave strip for SAND beaches, coast along
                                                 world X with the sea on the far (+Y, screen up-right) side;
  fx_shore_wave_y                                coast along world Y with the sea on the far (-X, up-left) side
                                                 (= flipX of _x). Chain every (+256, +128) px (_x) or (+256, -128)
                                                 px (_y) = 4 tiles; anchor = mean waterline at the segment centre.
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
import fxlib as F  # noqa: E402
from fxlib import hexc  # noqa: E402
import gen_fx as GF  # noqa: E402  (water_part, glint, grid_strip - read only)
import ui2_fx as U2  # noqa: E402  (foam_ring, bubbles - read only)
import gen_water as GW  # noqa: E402  (foam texture - the same lace the shader uses)

OUT = os.path.join(ROOT, 'assets', 'water')
PREV = os.path.join(ROOT, 'docs', 'previews')
WHITE = hexc('#FFFFFF')
RIM = hexc('#174A86')
SEA = hexc('#2F86C9')
PPM = 64.0           # G px per metre
LACE = None


def lace_tex():
    global LACE
    if LACE is None:
        LACE = GW.foam_texture(256)
    return LACE


def sample(tex, gx, gy, ch=0):
    """periodic bilinear sample of a (256, 256, C) texture at G px coordinates"""
    n = tex.shape[0]
    x = np.mod(gx, n)
    y = np.mod(gy, n)
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    tx, ty = x - x0, y - y0
    x1, y1 = (x0 + 1) % n, (y0 + 1) % n
    t = tex[..., ch]
    return ((t[y0, x0] * (1 - tx) + t[y0, x1] * tx) * (1 - ty) + (t[y1, x0] * (1 - tx) + t[y1, x1] * tx) * ty)


def foam(c, pot, lace, a=1.0, aa=0.07, shade_lo='#BCDDF3', rim=True):
    """threshold the lace by a foam potential (0..1) and paint toy foam: white core, icy edges, a thin
    dark-blue under-rim one px lower so it reads on white snow and sand too"""
    cov = np.clip((lace - (1 - pot) + aa) / (2 * aa), 0, 1)
    cov = cov * cov * (3 - 2 * cov)
    if rim:
        sh = np.roll(cov, int(round(1.4 * c.ss)), axis=0)
        c.paint(np.clip(sh - cov, 0, 1), RIM, 0.32 * a)
    core = np.clip((lace - (1 - pot)) / 0.28, 0, 1)
    col = F.mix(hexc(shade_lo), WHITE, core ** 0.7)
    c.paint(cov, col, a)
    return cov


# =========================================================================== splashes
def splash(c, cx, wy, t, S, n_spk=8, col_h=48, spike_len=(18, 28), drops=12, rings=3, seed=4, mist=0.0):
    """water splash at (cx, wy) scaled by S (1 = the 128 px fx_splash): rings on the iso water plane, foam
    disc, crown of tapered spikes, a central column with a blob and droplets flung on arcs"""
    for k, t0 in enumerate((-0.08, 0.2, 0.42)[:rings]):
        tt = F.clamp01((t - t0) / 0.62)
        if 0 < tt < 1:
            rx = (9 + 48 * F.ease_out(tt, 2)) * S
            U2.foam_ring(c, cx, wy, rx, rx * 0.46, (3.0 * (1 - tt) + 0.8) * S, 0.95 * (1 - tt) ** 1.2,
                         phase=tt * 4 + k, broken=0.15 + 0.4 * tt, seed=30 + k + seed)
    fa = 1 - F.ease_in(t, 1.5)
    R = c.region(cx - 30 * S, wy - 14 * S, cx + 30 * S, wy + 14 * S)
    if not R.empty:
        e = F.sd_ellipse(R.X, R.Y, cx, wy, (11 + 12 * t) * S, (4.5 + 5 * t) * S)
        lc = sample(lace_tex(), (R.X - cx) * 3.1 / S + seed * 37, (R.Y - wy) * 6.2 / S + seed * 11)
        foam(R, np.clip(0.95 - np.maximum(e, 0) / (6 * S), 0, 1) * fa, lc, a=0.95)
    hgt = F.bump(t, -0.08, 0.62)
    rng = np.random.default_rng(seed)
    spikes = []
    for k in range(n_spk):
        phi = 2 * math.pi * k / n_spk + 0.35
        p = F.ease_out(t, 2)
        bx = cx + math.cos(phi) * (7 + 10 * p) * S
        by = wy + math.sin(phi) * (3 + 4 * p) * S
        L = rng.uniform(*spike_len) * hgt * S
        dx, dy = math.cos(phi) * 1.05, -1.0
        nrm = math.hypot(dx, dy)
        tx, ty = bx + dx / nrm * L, by + dy / nrm * L * (0.9 + 0.2 * abs(math.cos(phi)))
        spikes.append((math.sin(phi), bx, by, tx, ty, L))

    def spike(sp):
        _, bx, by, tx, ty, L = sp
        R = c.region(min(bx, tx) - 8 * S, ty - 8 * S, max(bx, tx) + 8 * S, by + 6 * S)
        if R.empty or L < 2:
            return
        tt = np.clip(np.hypot(R.X - bx, R.Y - by) / max(L, 1), 0, 1)
        d = F.sd_segment(R.X, R.Y, bx, by, tx, ty, 0) - (2.9 - 2.0 * tt) * S
        d = np.minimum(d, F.sd_circle(R.X, R.Y, tx, ty, 1.9 * S))
        d = np.maximum(d, R.Y - wy - 4 * S)
        GF.water_part(R, d, ty, L)
    for sp in sorted(spikes):
        if sp[0] < 0:
            spike(sp)
    H = col_h * F.bump(t, -0.05, 0.8) ** 0.8 * S
    if H > 2:
        R = c.region(cx - 14 * S, wy - H - 10 * S, cx + 14 * S, wy + 6 * S)
        tt = np.clip((wy - R.Y) / H, 0, 1)
        d = np.abs(R.X - cx) - (5.0 - 2.6 * tt) * S
        d = np.maximum(d, R.Y - wy)
        d = np.maximum(d, (wy - H) - R.Y)
        d = F.smin(d, F.sd_circle(R.X, R.Y, cx, wy - H, 4.2 * S), 2.0 * S)
        GF.water_part(R, d, wy - H, H)
    for sp in sorted(spikes):
        if sp[0] >= 0:
            spike(sp)
    if mist > 0:
        ma = mist * F.bump(t, 0.05, 1.0)
        r = np.hypot((c.X - cx) / (26 * S), (c.Y - (wy - H * 0.7 - 6 * S)) / (22 * S))
        c.paint(np.exp(-r ** 2), hexc('#EAF5FD'), 0.45 * ma)
    for k in range(drops):
        phi = 2 * math.pi * k / drops + rng.uniform(-0.2, 0.2)
        vx = math.cos(phi) * rng.uniform(45, 85) * S
        vy = -rng.uniform(70, 120) * S
        tt = t * 0.75
        x = cx + vx * tt * 0.5
        y = wy - 8 * S + vy * tt * 0.6 + 140 * S * tt * tt
        if y > wy + 2 * S:
            continue
        rr = rng.uniform(1.6, 3.0) * S * (1 - 0.4 * t)
        R = c.region(x - rr * 3, y - rr * 3, x + rr * 3, y + rr * 3)
        if R.empty or rr < 0.5:
            continue
        sp_ = math.hypot(vx * 0.5, vy * 0.6 + 280 * S * tt) + 1e-6
        ux, uy = (vx * 0.5) / sp_, (vy * 0.6 + 280 * S * tt) / sp_
        d = F.sd_segment(R.X, R.Y, x - ux * rr * 1.6, y - uy * rr * 1.6, x, y, 0) - rr * 0.7
        d = np.minimum(d, F.sd_circle(R.X, R.Y, x, y, rr))
        GF.water_part(R, d, y - rr, 2 * rr, a=1 - F.ease_in(t, 3))


def sh_splash_small(i, n, S=96):
    t = (i + 0.7) / (n - 1 + 0.7)
    c = F.Canvas(S, S)
    splash(c, S / 2, S * 0.72, t, 0.68, n_spk=6, col_h=30, spike_len=(14, 22), drops=8, rings=2, seed=7)
    return c.image()


# =========================================================================== wave crash
def soft_noise(c, seed, scale):
    """smooth 0..1 noise over the canvas (periodic FFT noise, bilinear)"""
    n = 128
    z = np.asarray(F.fft_noise(n, n, seed, scale=scale), np.float32).reshape(n, n)
    z = (z - z.min()) / max(1e-6, z.max() - z.min())
    return sample(z[..., None], c.X * n / c.w, c.Y * n / c.h, 0)


def streak_drop(c, x, y, vx, vy, r, a, tail=2.2):
    """a toy droplet streaked along its velocity (round head, tapering tail), water shading + rim"""
    if r < 0.5 or a <= 0.02:
        return
    sp = math.hypot(vx, vy) + 1e-6
    ux, uy = vx / sp, vy / sp
    L = r * tail * min(1.0, sp / 120.0)
    R = c.region(x - r * 2 - L, y - r * 2 - L, x + r * 2 + L, y + r * 2 + L)
    if R.empty:
        return
    d = F.sd_segment(R.X, R.Y, x - ux * L, y - uy * L, x, y, 0) - r * np.clip(0.35 + 0.65 * np.hypot(R.X - x + ux * L, R.Y - y + uy * L) / max(L, 1e-3), 0.35, 1.0)
    d = np.minimum(d, F.sd_circle(R.X, R.Y, x, y, r))
    R.fill(d - 0.9, hexc('#4C9AD6'), 0.22 * a)
    R.fill(d, hexc('#F4FAFF'), a)
    R.fill(F.sd_circle(R.X, R.Y, x - r * 0.3, y - r * 0.3, r * 0.35), WHITE, a)


def sh_wave_crash(i, n, S=192):
    """'철썩!' - a swell crest slamming into rock / a breakwater: a translucent sheet of water (white rim,
    ice-blue body, vertical streaks) fans up above the wall top, tears at its lip into fingers and streaked
    droplets, then falls back as mist and drops while a short soft foam patch spreads and fades on the water.
    Anchor = the wall foot at the waterline [0.5, 0.86]."""
    t = (i + 0.6) / n
    c = F.Canvas(S, S, ss=3)
    cx, wy = S / 2, S * 0.86
    rise = F.ease_out(F.clamp01(t / 0.36), 2.0)
    fall = F.clamp01((t - 0.36) / 0.64)
    rng = np.random.default_rng(21)
    # ---- soft foam patch on the water (iso), behind everything: mottled, no lattice
    fa = F.bump(t, -0.2, 1.05) * (1 - 0.6 * fall)
    rx = 22 + 48 * F.ease_out(t, 1.6)
    R = c.region(cx - rx - 8, wy - rx * 0.5 - 8, cx + rx + 8, wy + rx * 0.5 + 8)
    if not R.empty and fa > 0.02:
        mot = soft_noise(R, 211, 7.0)
        e = F.sd_ellipse(R.X, R.Y, cx, wy + 2, rx, rx * 0.44) + (soft_noise(R, 213, 4.0) - 0.5) * 14
        body = np.clip(-e / (10 + 8 * t), 0, 1) ** 0.7
        R.fill(e - 1.0, hexc('#2F86C9'), 0.16 * fa, feather=2.0)
        R.paint(body * (0.55 + 0.45 * mot), F.mix(hexc('#CFE6F5'), WHITE, mot), 0.85 * fa)
        # round bubbles in the patch
        bub = sample(lace_tex(), (R.X - cx) * 2.4 + 31, (R.Y - wy) * 4.8 + 7, 1)
        R.paint(np.clip((bub - 0.45) * 3, 0, 1) * body, WHITE, 0.9 * fa)
    # ---- mist: soft clouds around the upper sheet, growing and falling back
    ma = F.bump(t, 0.12, 1.1) * 0.5
    if ma > 0.01:
        for k in range(4):
            mx = cx + (k - 1.5) * 22 + 10 * fall * (k - 1.5)
            my = wy - 70 - 40 * rise + 26 * fall + (k % 2) * 12
            r = np.hypot((c.X - mx) / (28 + 18 * t), (c.Y - my) / (22 + 12 * t))
            c.paint(np.exp(-r ** 2 * 1.6), hexc('#EEF7FD'), ma * (0.8 - 0.12 * k))
    # ---- the sheet: a fan of water from the wall foot, its lip scalloped, leaning a little landward
    Hs = 128 * rise * (1 - 0.85 * fall ** 1.15)
    if Hs > 4:
        lean = 0.1
        yy = wy - c.Y                                    # height above the foot
        xr = c.X - cx - lean * yy
        hw = 7 + 0.52 * np.clip(yy, 0, None) * (1 + 0.35 * fall)
        # rounded scallops along the lip (frothy bumps, not spikes)
        lipN = np.abs(np.sin(c.X * 0.19 + 0.7)) ** 0.6 * 0.8 + np.sin(c.X * 0.07 + 1.9) * 0.4
        top = Hs * (1 - 0.42 * (xr / np.maximum(hw, 1)) ** 2) + lipN * (4 + 7 * rise)
        d = np.maximum(np.abs(xr) - hw, np.maximum(yy - top, -yy - 2))
        # tearing apart as it falls: holes open and the lip breaks into fingers
        tear = soft_noise(c, 223, 5.0)
        d = d + (0.5 - tear) * (2 + 22 * fall) + 10 * fall ** 1.3
        al = 1 - F.ease_in(fall, 1.2)
        cov = c.cov(d)
        edge = np.clip(1 - np.abs(d) / 4.5, 0, 1) * cov          # bright rim inside the outline
        hh = np.clip(yy / max(Hs, 1), 0, 1)
        streak = 0.5 + 0.5 * np.sin(xr * 0.55 + soft_noise(c, 227, 3.0) * 6)
        c.fill(d - 1.2, hexc('#2F86C9'), 0.42 * al)                # thin sea-blue rim (reads on snow / sand)
        bodyc = F.mix(hexc('#9FD0EE'), hexc('#E6F4FC'), hh ** 0.8)
        c.paint(cov, bodyc, (0.55 + 0.25 * hh) * al)               # translucent body, whiter toward the lip
        c.paint(cov * streak ** 4, WHITE, 0.32 * al)                # soft vertical streaks of the rising sheet
        nn = F.bevel_normals(d, 4.0, c.px)
        c.paint(edge, F.shade(F.mix(hexc('#FFFFFF'), hexc('#D6ECFA'), hh * 0.25), F.lambert(nn), 0.5, 0.6, hexc('#5E9FD6')), 0.95 * al)
        # the lip: a frothy white crest band along the top edge + small round puffs riding on it
        lip = np.clip(1 - np.abs(yy - top) / (6 + 4 * rise), 0, 1) * (np.abs(xr) < hw) * (yy > 6)
        c.paint(lip * np.clip(1 - fall * 1.3, 0, 1), WHITE, 0.92 * al)
        prng = np.random.default_rng(29)
        for k in range(7):
            u = (k - 3) / 5.2 + prng.uniform(-0.04, 0.04)
            px_ = cx + u * (7 + 0.52 * Hs * (1 + 0.35 * fall)) + lean * Hs
            py_ = wy - Hs * (1 - 0.42 * u * u) - 2 + 10 * fall
            pr = (5.5 + 3.5 * prng.random()) * (0.6 + 0.4 * rise) * (1 - 0.6 * fall)
            if pr < 1:
                continue
            Rp = c.region(px_ - pr - 4, py_ - pr - 4, px_ + pr + 4, py_ + pr + 4)
            if not Rp.empty:
                GF.cloud(Rp, F.sd_circle(Rp.X, Rp.Y, px_, py_, pr), '#FFFFFF', '#DCEEFA', '#7FB2DE', alpha=al * 0.95, bevel=pr * 0.8)
    # ---- fingers + streaked droplets thrown from the lip (up and out, then falling back)
    for k in range(26):
        ang = rng.uniform(-0.8, 0.8) + 0.08
        v = rng.uniform(140, 250)
        t0 = rng.uniform(0.08, 0.42)
        tt = max(0.0, t - t0)
        if tt <= 0:
            continue
        x0 = cx + rng.uniform(-0.6, 0.6) * (10 + 0.5 * 132 * 0.9) * min(1, (t0 / 0.36))
        y0 = wy - 132 * min(1.0, F.ease_out(t0 / 0.36, 2.0)) * rng.uniform(0.75, 1.0)
        vx, vy = math.sin(ang) * v * 0.55, -math.cos(ang) * v
        g = 520.0
        x = x0 + vx * tt
        y = y0 + vy * tt + 0.5 * g * tt * tt
        if y > wy + 4 or y < 4:
            continue
        r = rng.uniform(1.3, 2.7) * (1 - 0.3 * tt)
        streak_drop(c, x, y, vx, vy + g * tt, r, 1 - F.ease_in(F.clamp01(tt / 0.62), 2.2))
    return c.image()


# =========================================================================== big splash (crown)
def petal_sd(X, Y, bx, by, tx, ty, w0):
    """SDF of a thick rounded crown petal from (bx, by) to (tx, ty), base half-width w0, round tip"""
    L = max(1e-3, math.hypot(tx - bx, ty - by))
    tt = np.clip(((X - bx) * (tx - bx) + (Y - by) * (ty - by)) / (L * L), 0, 1)
    return F.sd_segment(X, Y, bx, by, tx, ty, 0) - w0 * (1 - 0.5 * tt)


def sh_splash_big(i, n, S=192):
    """Cannonball / dive: a chunky white crown (6 thick petals joined into one wall), a short rounded central
    column (a dome cap, no bead), round toy droplets on arcs, and a foam ring on the water that stays a few
    frames after the crown has fallen. Anchor = water surface point [0.5, 0.80]."""
    t = (i + 0.6) / n
    c = F.Canvas(S, S, ss=3)
    cx, wy = S / 2, S * 0.80
    rng = np.random.default_rng(9)
    # rings + the foam ring (they outlive the crown)
    for k, t0 in enumerate((-0.05, 0.22, 0.48)):
        tt = F.clamp01((t - t0) / 0.78)
        if 0 < tt < 1:
            rxx = 18 + 66 * F.ease_out(tt, 2)
            U2.foam_ring(c, cx, wy, rxx, rxx * 0.46, (4.6 * (1 - tt) + 1.2), 0.95 * (1 - tt) ** 1.0,
                         phase=tt * 3 + k, broken=0.1 + 0.32 * tt, seed=40 + k)
    # churned foam disc at the impact (soft, mottled)
    fa = 1 - F.ease_in(t, 1.2)
    R = c.region(cx - 52, wy - 28, cx + 52, wy + 28)
    e = F.sd_ellipse(R.X, R.Y, cx, wy, 22 + 24 * t, 10 + 11 * t) + (soft_noise(R, 93, 5.0) - 0.5) * 6
    mot = soft_noise(R, 91, 6.0)
    R.fill(e - 1.0, hexc('#2F86C9'), 0.3 * fa)
    R.paint(np.clip(-e / 6, 0, 1) * (0.75 + 0.25 * mot), F.mix(hexc('#D4ECFA'), WHITE, mot), 0.95 * fa)
    # the crown: 6 thick petals around an iso ring, rising, flaring outward, then sinking
    hgt = F.bump(t, -0.04, 0.72)
    out = F.ease_out(t, 1.5)
    ca = 1.0 - F.ease_in(F.clamp01((t - 0.52) / 0.48), 2)
    back, front, tips = None, None, []
    for k in range(18):
        tall = k % 3 == 0                          # 6 tall petals + a low serrated wall joining them
        phi = 2 * math.pi * k / 18 + 0.3
        rr = 18 + 16 * out
        bx, by = cx + math.cos(phi) * rr, wy + math.sin(phi) * rr * 0.46
        L = ((46 + 8 * math.sin(k * 2.1 + 0.5)) if tall else (22 + 5 * math.sin(k * 1.7))) * hgt
        lean = 0.25 + 0.55 * out
        tx = bx + math.cos(phi) * L * lean
        ty = by - L * (1 - 0.22 * out) + math.sin(phi) * L * lean * 0.3
        if tall:
            tips.append((tx, ty, phi))
        if L < 2:
            continue
        dpk = petal_sd(c.X, c.Y, bx, by, tx, ty, 12.0 if tall else 9.0)
        dpk = np.maximum(dpk, c.Y - (wy + 3))
        if math.sin(phi) < 0:
            back = dpk if back is None else F.smin(back, dpk, 6.0)
        else:
            front = dpk if front is None else F.smin(front, dpk, 6.0)
    if back is not None:
        GF.water_part(c, back, wy - 60 * hgt, 60, a=ca)
    # short rounded central column with a dome cap (no separate bead)
    Hc = 64 * F.bump(t, 0.06, 0.74) ** 0.85
    if Hc > 2:
        R = c.region(cx - 20, wy - Hc - 16, cx + 20, wy + 6)
        tt = np.clip((wy - R.Y) / Hc, 0, 1)
        d = np.abs(R.X - cx) - (10.0 - 3.0 * tt)
        d = np.maximum(d, R.Y - wy)
        d = np.maximum(d, (wy - Hc) - R.Y)
        d = F.smin(d, F.sd_ellipse(R.X, R.Y, cx, wy - Hc, 8.5, 7.0), 5.0)
        GF.water_part(R, d, wy - Hc - 7, Hc + 7)
    if front is not None:
        GF.water_part(c, front, wy - 60 * hgt, 60, a=ca)
    # round toy droplets from the petal tips, on arcs
    for k in range(18):
        tx, ty, phi = tips[k % len(tips)]
        phi = phi + rng.uniform(-0.35, 0.35)
        t0 = rng.uniform(0.18, 0.4)
        tt = max(0.0, t - t0)
        if tt <= 0:
            continue
        v = rng.uniform(60, 110)
        x = cx + math.cos(phi) * (32 + v * tt)
        y0 = wy - 58 * rng.uniform(0.75, 1.05)
        y = y0 - rng.uniform(70, 120) * tt + 300 * tt * tt + math.sin(phi) * 12
        if y > wy + 3:
            continue
        r = rng.uniform(3.0, 5.0) * (1 - 0.3 * t)
        R = c.region(x - r - 3, y - r - 3, x + r + 3, y + r + 3)
        if not R.empty:
            GF.water_part(R, F.sd_circle(R.X, R.Y, x, y, r), y - r, 2 * r, a=1 - F.ease_in(t, 2.5))
    return c.image()


# =========================================================================== swim ripple
def sh_swim_ripple(i, n, W=128, H=64):
    u0 = i / n
    c = F.Canvas(W, H)
    cx, cy = W / 2, H / 2
    for k in range(2):
        u = (u0 + k / 2.0) % 1.0
        rx = 20 + 40 * F.ease_out(u, 1.3)
        a = math.sin(math.pi * min(1.0, u * 2.2)) ** 0.5 * (1 - u) ** 0.9
        U2.foam_ring(c, cx, cy, rx, rx * 0.46, 1.0, a * 0.55, phase=0.0, broken=0.0, seed=5 + k)
        U2.foam_ring(c, cx, cy, rx, rx * 0.46, 2.6 * (1 - u) + 0.8, a * 0.95, phase=2 * math.pi * u + k, broken=0.3 + 0.3 * u,
                     seed=9 + k)
    U2.foam_ring(c, cx, cy, 17, 8, 2.6, 0.95, phase=2 * math.pi * u0, broken=0.4, seed=12)
    U2.bubbles(c, cx, cy, 21, 10, 10, u0, 13)
    return c.image()


# =========================================================================== wake V
WAKE_DIRS = {  # rendered heading -> unit vector in G space (screen x, 2 * screen y)
    'S': (0.0, 1.0), 'SE': (math.sqrt(0.5), math.sqrt(0.5)), 'E': (1.0, 0.0),
    'NE': (math.sqrt(0.5), -math.sqrt(0.5)), 'N': (0.0, -1.0),
}


def wake(i, n, hd, W=256, H=176):
    """Boat wake V for heading hd (G unit vector): two streaky foam arms opening at ~19.5 deg behind the bow,
    churned pale-turquoise water along them, a stern trail and transverse ripples between; the foam
    streaks scroll backwards one texture period per loop (seamless)."""
    u0 = i / n
    c = F.Canvas(W, H, ss=3)
    cx, cy = W / 2, H / 2
    gx = c.X - cx
    gy = 2 * (c.Y - cy)
    hx, hy = hd
    a_ = gx * hx + gy * hy                 # along the heading (+ = ahead)
    b_ = -gx * hy + gy * hx                # across (+ = starboard)
    Lh, Bh = 70.0, 24.0                    # half length / half beam of a ~2.2 m hull (G px)
    lc = lace_tex()
    back = -(a_ - Lh * 0.8)                # distance behind the bow (G px)
    fade = np.clip(1 - back / 290.0, 0, 1) ** 1.4 * np.clip(back / 14.0, 0, 1)
    scroll = 256.0 * u0                    # one lace period per loop
    pot = np.zeros_like(gx)
    body = np.zeros_like(gx)
    k = math.tan(math.radians(19.5))
    for side in (-1, 1):
        off = side * b_ - (Bh * 0.75 + k * back)
        w = 5.5 + 0.05 * back
        arm = np.exp(-(off / w) ** 2) * fade
        streak = sample(lc, off * 2.2 + 50 * side, (back + scroll) * 0.5 + 30)
        pot = np.maximum(pot, arm * (0.62 + 0.25 * streak))
        body = np.maximum(body, np.exp(-(off / (w * 2.4)) ** 2) * fade)
        pot = np.maximum(pot, np.exp(-((off - 13 - 0.05 * back) / 2.4) ** 2) * fade * 0.32)
    # stern trail
    behind = -(a_ + Lh * 0.85)
    tw_ = Bh * 0.8 + behind * 0.07
    trail = np.exp(-(b_ / tw_) ** 2) * np.clip(behind / 10, 0, 1) * np.clip(1 - behind / 230, 0, 1)
    tstreak = sample(lc, b_ * 1.6 + 90, (behind + scroll) * 0.45 + 70)
    pot = np.maximum(pot, trail * (0.5 + 0.3 * tstreak))
    body = np.maximum(body, trail)
    # transverse ripples between the arms
    tw = 0.5 + 0.5 * np.cos((back + (b_ ** 2) * 0.004) * (2 * math.pi / 34.0) - 4 * math.pi * u0)
    inside = np.clip(1 - np.abs(b_) / (Bh + 0.36 * back + 1), 0, 1) * fade
    pot = np.maximum(pot, tw ** 6 * inside * 0.32)
    # thin collar at the hull waterline (the boat covers the inside)
    hull = np.hypot(a_ / Lh, b_ / Bh)
    pot = np.maximum(pot, np.exp(-((hull - 1.04) / 0.08) ** 2) * 0.62)
    keep = hull >= 0.95
    lace = sample(lc, b_ * 0.9 + 31, a_ * 0.6 + scroll * 0.6)
    # fade everything out toward the frame edges: no straight edge where the sprite ends
    win = (np.clip(c.X / 22.0, 0, 1) * np.clip((W - c.X) / 22.0, 0, 1) * np.clip(c.Y / 14.0, 0, 1) * np.clip((H - c.Y) / 14.0, 0, 1))
    win = win * win * (3 - 2 * win)
    c.paint(np.clip(body, 0, 1) * keep * win, hexc('#9FDCEA'), 0.30)
    foam(c, np.clip(pot, 0, 1) * keep * win, 0.5 * lace + 0.5 * sample(lc, gx * 1.3 + 3, gy * 1.3 + scroll * 0.9), a=0.94, aa=0.09)
    return c.image()


def make_wake(hd_key):
    hd = WAKE_DIRS[hd_key]
    return lambda i, n: wake(i, n, hd)


# =========================================================================== sparkles
def sh_sparkle_water(i, n, W=128, H=64):
    c = F.Canvas(W, H)
    rng = np.random.default_rng(17)
    for k in range(9):
        x, y = rng.uniform(14, W - 14), rng.uniform(10, H - 10)
        ph = rng.uniform(0, 1)
        a = max(0.0, math.sin(2 * math.pi * (i / n + ph))) ** 3
        s = rng.uniform(5, 11)
        GF.glint(c, x, y, s * (0.6 + 0.4 * a), core='#FFFFFF', glow='#BFE9FF', a=a, glow_a=0.5, thin=0.45,
                 rot_=rng.uniform(-0.2, 0.2))
    for k in range(14):
        x, y = rng.uniform(4, W - 4), rng.uniform(4, H - 4)
        ph = rng.uniform(0, 1)
        a = max(0.0, math.sin(2 * math.pi * (2 * i / n + ph))) ** 4
        R = c.region(x - 3, y - 3, x + 3, y + 3)
        if not R.empty:
            R.fill(F.sd_circle(R.X, R.Y, x, y, 1.1), WHITE, a)
    return c.image()


# =========================================================================== shore wave strip
SEG_PX = (256.0, 128.0)        # one segment along world X = 4 tiles = 5.66 m = (256, 128) screen px


def shore_wave(i, n, mirror=False, W=384, H=256, p=None, out=None):
    """A breaking crest rolling up a sand beach: the glassy turquoise face with a bright lip moving in,
    collapsing into a foam bore that runs up the beach (thin water sheet) and slides back leaving lace and a
    damp band. Seamless along the coast (periodic over one segment, partition-of-unity ends)."""
    p = i / n if p is None else p
    c = F.Canvas(W, H, ss=3)
    cx, cy = W / 2, H * 0.55
    X = (W - c.X) if mirror else c.X
    gx = X - cx
    gy = 2 * (c.Y - cy)
    # coast along world X: along-shore unit (1, 1)/sqrt2 in G, sea side (+Y) = (1, -1)/sqrt2
    s2 = math.sqrt(0.5)
    u = (gx + gy) * s2 / PPM                 # metres along the coast
    v = (gx - gy) * s2 / PPM                 # metres toward the sea
    L = 4 * math.sqrt(2)
    # partition of unity across the segment ends (ramp 0.35 m)
    ramp = 0.35
    w_end = np.clip((L / 2 + ramp - np.abs(u)) / (2 * ramp), 0, 1)
    w_end = w_end * w_end * (3 - 2 * w_end)
    ua = 2 * math.pi * u / L
    wob = 0.16 * np.sin(ua * 2 + 1.3) + 0.08 * np.sin(ua * 3 + 0.4)
    lc = lace_tex()
    lace = sample(lc, u * PPM * (512.0 / (L * PPM)) * 0.5 + 40, v * PPM * 1.1 + 13)
    # crest position over the cycle: approach (0 .. 0.42), break at 0.42, run-up to 0.68, backwash to 1
    if p < 0.42:
        q = max(0.0, p / 0.42)
        vc = 2.4 - 2.2 * F.ease_in(q, 1.4)
        face = 1.0
    else:
        vc = 0.2
        face = 0.0
    vc = vc + wob
    alpha_all = w_end
    # damp sand band (left by the previous wave, fading), on the land side
    run = 0.0
    if p >= 0.42:
        q = (p - 0.42) / 0.58
        run = 1.25 * math.sin(math.pi * min(1.0, q / 0.45) * 0.5) if q < 0.45 else 1.25 * (1 - F.ease_in((q - 0.45) / 0.55, 1.3))
    edge = -run + wob * 0.6                  # swash edge (metres, negative = up the beach)
    damp = np.clip((v + 1.45 + wob * 0.5) / 0.25, 0, 1) * np.clip((0.15 - v) / 0.4, 0, 1)
    c.paint(damp * alpha_all, hexc('#A8865C'), 0.20)
    # water sheet (swash) between the waterline and the edge
    sheet = np.clip((v - edge) / 0.12, 0, 1) * np.clip((0.35 - v) / 0.25, 0, 1)
    c.paint(sheet * alpha_all, hexc('#C8F4EE'), 0.42)
    # the glassy wave face (turquoise band shoreward of the crest) while the wave approaches
    if face > 0:
        dv = v - vc
        fb = np.exp(-((dv + 0.28) / 0.22) ** 2) * (dv < 0.05)
        c.paint(fb * alpha_all, hexc('#4FD8D2'), 0.55)
        c.paint(np.exp(-((dv + 0.06) / 0.07) ** 2) * alpha_all, hexc('#E9FFFC'), 0.7)
        pot = np.exp(-((dv - 0.05) / 0.16) ** 2) * (0.55 + 0.45 * F.ease_in(min(1.0, p / 0.42), 2))
        pot += np.exp(-np.clip(dv - 0.1, 0, None) / 0.35) * (dv > 0.05) * 0.45 * min(1.0, p / 0.3)
    else:
        q = (p - 0.42) / 0.58
        # the bore: foam band at the swash edge, lace spread over the sheet, remnants offshore fading
        pot = np.exp(-((v - edge) / (0.14 + 0.1 * q)) ** 2) * (1.0 - 0.55 * q)
        pot = np.maximum(pot, sheet * (0.55 - 0.45 * q))
        pot = np.maximum(pot, np.exp(-np.clip(v - 0.15, 0, None) / 0.5) * (v > 0.15) * (0.7 - 0.65 * q))
    foam(c, np.clip(pot, 0, 1) * alpha_all, lace, a=0.97, aa=0.08)
    return c.image(out)


def blend_frames(a, b, w):
    """premultiplied blend of two RGBA PIL frames: (1 - w) a + w b"""
    A = np.asarray(a, np.float32) / 255.0
    B = np.asarray(b, np.float32) / 255.0
    pa = np.dstack([A[..., :3] * A[..., 3:], A[..., 3:]])
    pb = np.dstack([B[..., :3] * B[..., 3:], B[..., 3:]])
    m = pa * (1 - w) + pb * w
    al = m[..., 3:]
    rgb = np.where(al > 1e-4, m[..., :3] / np.maximum(al, 1e-4), 0)
    arr = (np.clip(np.dstack([rgb, al]), 0, 1) * 255 + 0.5).astype(np.uint8)
    arr[arr[..., 3] == 0] = 0
    return Image.fromarray(arr, 'RGBA')


SHORE_OVERLAP = 0.18      # the last 18 % of the cycle cross-fades into its start (seamless loop)


def make_shore(mirror):
    """half-resolution frames (192 x 128, drawn at scale 2): 24 frames at 12 fps (2 s), the end cross-fading
    into the start so the loop has no jump"""
    def fn(i, n):
        p = i / n
        img = shore_wave(i, n, mirror, p=p, out=(192, 128))
        if p > 1 - SHORE_OVERLAP:
            w = (p - (1 - SHORE_OVERLAP)) / SHORE_OVERLAP
            w = w * w * (3 - 2 * w)
            img = blend_frames(img, shore_wave(i, n, mirror, p=p - 1, out=(192, 128)), w)
        return img
    return fn


# key: (fn(i, n), frameW, frameH, frames, fps, repeat, anchor, notes)
SHEETS = {
    'fx_wave_crash': (sh_wave_crash, 192, 192, 10, 20, 0, [0.5, 0.86],
                      '"철썩!" a swell crest slamming into rock / a breakwater: a translucent sheet of water fans up above '
                      'the wall top, tears into fingers and streaked droplets, falls back as mist; a short soft foam patch '
                      'on the water. Anchor = the wall foot at the waterline. Water.js plays it at crest times on rock / '
                      'breakwater faces that look into the swell (crashEvents / onCrash); scale 0.75-1.15.'),
    'fx_splash_small': (sh_splash_small, 96, 96, 10, 24, 0, [0.5, 0.72],
                        'Small splash (fish jump, pebble, swimmer kick). Anchor = water surface point.'),
    'fx_splash_big': (sh_splash_big, 192, 192, 14, 24, 0, [0.5, 0.80],
                      'Big splash (dive, cannonball, crate overboard): a chunky crown of 6 thick petals, a short rounded '
                      'column, round toy droplets on arcs, a foam ring that stays a few frames. Anchor = water surface point.'),
    'fx_swim_ripple': (sh_swim_ripple, 128, 64, 12, 12, -1, [0.5, 0.5],
                       'Rings + lacy collar around a swimmer (loop). Anchor = waterline centre; draw UNDER the swimmer '
                       '(depth = swimmer depth - 1). Clear centre ~32 x 14 px.'),
    'fx_wake_v2': (make_wake('SE'), 256, 176, 8, 12, -1, [0.5, 0.5],
                   'Boat wake V for heading SE (bow arms at 19.5 deg + churned stern trail + transverse ripples), loop. '
                   'Anchor = hull centre at the waterline, draw under the boat. Hull ~2.2 m: scale 1.15 rowboat, 2.0 '
                   'fishing boat. Mirror (flipX) for SW.'),
    'fx_wake_v2_s': (make_wake('S'), 256, 176, 8, 12, -1, [0.5, 0.5], 'Boat wake V, heading S (toward the camera).'),
    'fx_wake_v2_e': (make_wake('E'), 256, 176, 8, 12, -1, [0.5, 0.5], 'Boat wake V, heading E (flipX for W).'),
    'fx_wake_v2_ne': (make_wake('NE'), 256, 176, 8, 12, -1, [0.5, 0.5], 'Boat wake V, heading NE (flipX for NW).'),
    'fx_wake_v2_n': (make_wake('N'), 256, 176, 8, 12, -1, [0.5, 0.5], 'Boat wake V, heading N (away from the camera).'),
    'fx_sparkle_water': (sh_sparkle_water, 128, 64, 12, 12, -1, [0.5, 0.5],
                         'Sun glints twinkling on water (loop). Scatter a few over calm water (low quality / canvas).'),
    'fx_shore_wave_x': (make_shore(False), 192, 128, 24, 12, -1, [0.5, 0.55],
                        'Rolling breaking-wave strip for sand beaches, coast along world X, sea on the far (+Y, screen '
                        'up-right) side. HALF resolution: draw at scale 2 (drawScale). Chain one sprite every (+256, +128) '
                        'world px along the waterline; anchor = mean waterline at the segment centre. Seamless along the coast; '
                        '2 s loop (24 f at 12 fps, its end cross-fades into its start), for beaches drawn WITHOUT the shader '
                        '(canvas / fallback) - the shader draws its own swash on the 6 s shore swell.'),
    'fx_shore_wave_y': (make_shore(True), 192, 128, 24, 12, -1, [0.5, 0.55],
                        'Same for a coast along world Y with the sea on the far (-X, screen up-left) side (= flipX of '
                        '_x). HALF resolution, draw at scale 2. Chain every (+256, -128) world px.'),
}


# =========================================================================== build / previews
def merge_manifest(entries):
    path = os.path.join(OUT, 'manifest.json')
    man = {}
    if os.path.exists(path):
        with open(path) as f:
            man = json.load(f)
    keys = {e['key'] for e in entries}
    man['spritesheets'] = [s for s in man.get('spritesheets', []) if s['key'] not in keys] + entries
    conv = man.get('conventions', {})
    conv['fx'] = ('fx_* sheets: NORMAL-blend toy water art (white -> ice, thin sea-blue rim), frames left->right '
                  'wrapped into rows <= 2048 px, Phaser anim key = sheet key; one-shots visible from frame 0, loops '
                  'periodic. Generator: tools/fx/gen_water_fx.py')
    man['conventions'] = conv
    with open(path, 'w') as f:
        json.dump(man, f, indent=1)


def on_bg(img, col):
    bg = Image.new('RGBA', img.size, col)
    bg.alpha_composite(img)
    return bg


def preview(frames_by_key):
    bgs = [('#F4F7FB', 'snow'), ('#E9D5AE', 'sand'), ('#2C7DBA', 'sea'), ('#1A4E92', 'deep')]
    pad = 8
    rows = []
    for k, frames in frames_by_key.items():
        fw, fh = frames[0].size
        sc = 1.0 if fh <= 192 else 0.75
        picks = frames if len(frames) <= 8 else [frames[int(j * len(frames) / 8)] for j in range(8)]
        row_h = int(fh * sc) * 2 + pad
        rows.append((k, picks, sc, row_h))
    W = 8 * (int(384 * 0.75) + pad) + 160
    H = sum(r[3] + 24 for r in rows) + 20
    im = Image.new('RGB', (W, H), (34, 40, 52))
    dr = ImageDraw.Draw(im)
    y = 10
    for k, picks, sc, row_h in rows:
        dr.text((10, y), k, fill=(235, 240, 248))
        y += 16
        x = 10
        for j, fr in enumerate(picks):
            f2 = fr.resize((int(fr.width * sc), int(fr.height * sc)), Image.LANCZOS) if sc != 1 else fr
            for b, (col, _) in enumerate(bgs[:2] if j % 2 == 0 else bgs[2:]):
                im.paste(on_bg(f2, col).convert('RGB'), (x, y + b * (f2.height + 2)))
            x += f2.width + pad
        y += row_h + 8
    os.makedirs(PREV, exist_ok=True)
    im.crop((0, 0, W, y)).save(os.path.join(PREV, 'water_fx_sheet.png'), optimize=True)


def build(only=None, gifs=True):
    os.makedirs(OUT, exist_ok=True)
    entries, frames_by_key = [], {}
    for k, (fn, fw, fh, n, fps, rep, anc, note) in SHEETS.items():
        if only and k not in only:
            continue
        frames = [fn(i, n) for i in range(n)]
        for fr in frames:
            assert fr.size == (fw, fh), (k, fr.size)
        frames_by_key[k] = frames
        sheet = GF.grid_strip(frames, 2048)
        F.save_png(sheet, os.path.join(OUT, k + '.png'), quant=256, dither=0.6)
        e = {'key': k, 'png': 'water/' + k + '.png', 'frameWidth': fw, 'frameHeight': fh, 'frameCount': n,
             'fps': fps, 'repeat': rep, 'anchor': anc, 'blend': 'NORMAL', 'notes': note}
        if k.startswith('fx_shore_wave'):
            e['drawScale'] = 2
        entries.append(e)
        if gifs and k in ('fx_wave_crash', 'fx_splash_big', 'fx_wake_v2', 'fx_shore_wave_x', 'fx_swim_ripple'):
            F.save_gif(frames, os.path.join(PREV, 'water_' + k + '.gif'), fps, panels=('#F4F7FB', '#E9D5AE', '#2C7DBA'),
                       hold=0 if rep == -1 else 6, anchor=anc)
        print(k, 'ok', flush=True)
    if not only:
        merge_manifest(entries)
        preview(frames_by_key)
    else:
        merge_manifest(entries)
    return entries


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', default='')
    ap.add_argument('--no-gif', action='store_true')
    a = ap.parse_args()
    only = set(k for k in a.only.split(',') if k) or None
    build(only, gifs=not a.no_gif)
