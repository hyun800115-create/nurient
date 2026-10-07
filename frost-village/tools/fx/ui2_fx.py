"""
ui2_fx.py - v3 animated effect sheets for Frost Village (CONTRACT_V3 §F).  Library module (no CLI),
imported by tools/fx/gen_ui2.py.  Built on fxlib.py and the drawing helpers of gen_fx.py (imported
read-only: ball, glint, star5, flame_layers, puff_sdf, cloud, soft_mask).

All sheets are NORMAL-blend artwork (saturated cores + darker warm/cool rims) because ADD blending
vanishes on the near-white snow (handoff doc 04 §2.5).

  fx_build_dust   160x128 x 12, 24 fps, once   hammer "pow" + warm dust balls rolling out on the ground,
                                               wood chips flying; anchor = ground point [0.5, 0.72]
  fx_build_done   192x192 x 18, 20 fps, once   completion: flash, golden iso ground ring, light fan,
                                               fountain of stars + confetti + twinkles; anchor = building
                                               footprint centre [0.5, 0.78]
  fx_wake         256x128 x 12, 12 fps, loop   foam ripple rings around a hull (iso 2:1), for dark sea;
                                               anchor = hull centre on the waterline [0.5, 0.5]
  fx_wake_ring    192x96  x 14, 16 fps, once   (extra) ONE expanding foam ring: spawn behind a moving
                                               boat every ~0.25 s and the rings form a V wake by themselves
  fx_fire_big     128x192 x 12, 14 fps, loop   watchtower fire basket: tall flames, embers, smoke wisps;
                                               anchor = base of the flames (basket rim) [0.5, 0.9]
One-shots: t = (i + 0.7) / (n - 1 + 0.7) so frame 0 already shows the effect.  Loops: every motion is
periodic in 2*pi*i/n (seamless).  Deterministic (fixed seeds).
"""
import math

import numpy as np

import fxlib as F
from fxlib import hexc, toy
import gen_fx as GF

WHITE = hexc('#FFFFFF')


# =========================================================================== fx_build_dust
def chip(c, x, y, s, ang, col=('#E0A867', '#A8703E', '#4E2E16'), a=1.0):
    """Small wooden plank chip (toy shaded) rotated by ang."""
    if s < 0.6 or a <= 0.02:
        return
    R = c.region(x - s * 2, y - s * 2, x + s * 2, y + s * 2)
    if R.empty:
        return
    X, Y = F.rot(R.X, R.Y, x, y, ang)
    d = F.sd_box(X, Y, x, y, s * 1.5, s * 0.55, s * 0.2)
    toy(R, d, col[0], col[1], col[2], ow=max(0.7, s * 0.22), bevel=s * 0.4, gloss=0.0, shadow=0, hi=0.5, lo=0.4,
        alpha=a)


def sh_build_dust(i, n, W=160, H=128):
    """Construction puff: a quick hammer 'pow' (white-gold star with an orange rim), warm dust balls rolling
    out sideways on the ground ellipse while rising and swelling, wood chips + a few sparks flying."""
    t = (i + 0.7) / (n - 1 + 0.7)
    c = F.Canvas(W, H)
    cx, cy = W / 2, H * 0.72
    rng = np.random.default_rng(5)
    # faint ground shadow
    sh = F.bump(t, -0.05, 0.95)
    if sh > 0:
        c.fill(F.sd_ellipse(c.X, c.Y, cx + 4, cy + 4, 26 + 34 * F.ease_out(t), 7 + 9 * F.ease_out(t)),
               hexc('#6D5A48'), 0.14 * sh, feather=6)
    # dust balls (back ones first)
    balls = []
    K = 12
    for k in range(K):
        a = math.pi * (k + 0.5) / K
        side = 1 if k % 2 else -1
        p = F.ease_out(F.clamp01(t * 1.08 - rng.uniform(0, 0.08)), 2.3)
        dist = rng.uniform(34, 58)
        x = cx + side * (6 + dist * p) * (0.55 + 0.45 * abs(math.cos(a)))
        y = cy + (rng.uniform(-6, 6) * p) - (8 + rng.uniform(4, 22)) * p - 6 * F.ease_in(t, 1.5)
        r = rng.uniform(9, 15) * F.ease_out(min(1, t * 3.2), 2) * (1 - F.ease_in(t, 1.7)) * (0.8 + 0.4 * p)
        balls.append((y, x, r))
    rc = 17 * F.ease_out(min(1.0, t * 5), 2) * (1 - F.ease_in(min(1.0, t * 1.7), 1.4))
    balls.append((cy - 8 - 12 * t, cx, rc))
    for (y, x, r) in sorted(balls):
        GF.ball(c, x, y, r, top='#FFF8EC', bot='#E9DCC4', lo='#A68A6A', rim='#B59A80')
    # hammer pow (first ~35 %)
    tp = F.clamp01(t / 0.38)
    if tp < 1:
        sc = F.ease_out(min(1, tp * 3), 2) * (1 - F.ease_in(tp, 2.0))
        if sc > 0.05:
            R = c.region(cx - 30, cy - 52, cx + 30, cy - 4)
            d = F.sd_star(R.X, R.Y, cx, cy - 28, 21 * sc, 9 * sc, 6, rot=-math.pi / 2 + 0.3 * tp, round_=1.2 * sc)
            R.fill(d - 2.2, hexc('#C8501A'))
            r_ = np.hypot(R.X - cx, R.Y - cy + 28) / max(1, 20 * sc)
            R.paint(R.cov(d), F.ramp([(0, hexc('#FFFFFF')), (0.5, hexc('#FFF2B0')), (1, hexc('#FFC23A'))], r_))
    # wood chips with gravity
    for k in range(7):
        a = -math.pi / 2 + (k - 3) * 0.42 + rng.uniform(-0.1, 0.1)
        v = rng.uniform(80, 120)
        tt = t * 0.75
        x = cx + math.cos(a) * v * tt
        y = cy - 22 + math.sin(a) * v * tt + 0.5 * 330 * tt * tt
        s = rng.uniform(3.2, 4.6) * (1 - F.ease_in(F.clamp01((t - 0.6) / 0.4), 1.5))
        if y > cy + 6:
            continue
        chip(c, x, y, s, rng.uniform(0, 3) + t * rng.uniform(4, 9) * (1 if k % 2 else -1),
             ('#E0A867', '#A8703E', '#4E2E16') if k % 3 else ('#F0C890', '#C08850', '#5A3418'))
    # sparks from the hammer
    for k in range(4):
        a = -math.pi / 2 + (k - 1.5) * 0.8
        p = F.ease_out(F.clamp01(t / 0.5), 2)
        x = cx + math.cos(a) * 38 * p
        y = cy - 28 + math.sin(a) * 30 * p
        GF.glint(c, x, y, 6.5 * F.bump(F.clamp01(t / 0.5), 0, 1), glow='#FFD45A', edge='#C87A12', glow_a=0.35,
                 tip='#FFD45A', halo=0.6)
    return c.image()


# =========================================================================== fx_build_done
def confetti(c, x, y, s, ang, flip, col, a=1.0):
    """Paper confetti piece (rotating + flipping: width scales with cos(flip))."""
    if a <= 0.02:
        return
    R = c.region(x - s * 2, y - s * 2, x + s * 2, y + s * 2)
    if R.empty:
        return
    X, Y = F.rot(R.X, R.Y, x, y, ang)
    w = s * max(0.18, abs(math.cos(flip)))
    d = F.sd_box(X, Y, x, y, w, s * 0.55, s * 0.12)
    top, bot, line = col
    shade_k = 0.75 + 0.25 * math.cos(flip)
    toy(R, d, top, bot, line, ow=max(0.6, s * 0.16), bevel=s * 0.25, gloss=0.0, shadow=0, hi=0.4, lo=0.35,
        alpha=a)
    if shade_k < 0.9:
        R.paint(R.cov(d), hexc(line), (0.9 - shade_k) * a)


CONFETTI = [('#FF9A8A', '#E3302A', '#7E1A16'), ('#9FD0FF', '#3D8BE0', '#163E78'), ('#FFE58A', '#F2B53A', '#8A520A'),
            ('#A8EE9E', '#4DBA62', '#1F5E2A'), ('#E2C8FF', '#8E6BE0', '#3A2470')]
STAR_COLS = [('#FFF3B0', '#FFC83D', '#B8650E'), ('#FFFFFF', '#CFE2FA', '#5D7DAA'), ('#FFD1DC', '#FF7A9C', '#9E2350')]


def sh_build_done(i, n, S=192):
    """Building complete: white-gold flash, golden ground ring on the iso footprint, a fan of soft light
    rays, a fountain of chunky stars + confetti with gravity, twinkles lingering at the end."""
    t = (i + 0.7) / (n - 1 + 0.7)
    c = F.Canvas(S, S)
    cx, gy = S / 2, S * 0.78
    # light fan behind everything (soft golden rays fanning upward)
    ra = F.bump(t, -0.05, 0.7)
    if ra > 0.01:
        L = c.layer()
        Rr = L.region(0, 0, S, gy + 6)
        ang = np.arctan2(Rr.Y - gy, Rr.X - cx)
        r = np.hypot(Rr.X - cx, (Rr.Y - gy))
        for k in range(7):
            a0 = -math.pi / 2 + (k - 3) * 0.36 + 0.05 * math.sin(t * 6 + k)
            da = np.abs(np.angle(np.exp(1j * (ang - a0))))
            ln = (110 + 30 * (k % 2)) * F.ease_out(min(1.0, t * 3), 2)
            w = 0.075 + 0.03 * (k % 2)
            m = np.clip(1 - da / w, 0, 1) ** 1.2 * np.clip(1 - r / max(ln, 1), 0, 1) * np.clip(r / 10, 0, 1)
            Rr.paint(m, F.mix(hexc('#FFF6C8'), hexc('#FFC83D'), np.clip(r / 120, 0, 1)), 0.85)
        c.over(L, ra * 0.75)
    # flash
    if t < 0.3:
        r = np.hypot(c.X - cx, (c.Y - gy + 30) * 1.1)
        c.paint(np.exp(-(r / (18 + 70 * t)) ** 2), hexc('#FFFBEA'), 1.0 - t / 0.3)
    # golden ground ring (iso ellipse) + glow
    tb = F.clamp01(t / 0.6)
    if tb < 1:
        rx = 22 + 66 * F.ease_out(tb, 2.4)
        GF.gold_ellipse_ring(c, cx, gy, rx, rx * 0.5, 3.4 * (1 - tb) + 0.9, (1 - tb) ** 0.7, glow=True)
    rg = np.hypot(c.X - cx, (c.Y - gy) * 2.0)
    c.paint(np.exp(-(rg / 48) ** 2), hexc('#FFD45A'), 0.45 * F.bump(t, -0.1, 0.8))
    # fountain: stars + confetti (back-to-front by depth sign)
    rng = np.random.default_rng(41)
    parts = []
    for k in range(22):
        a = -math.pi / 2 + rng.uniform(-0.95, 0.95)
        v = rng.uniform(150, 235)
        t0 = rng.uniform(0.0, 0.18)
        tt = max(0.0, (t - t0)) * 0.95
        g = 380.0
        x = cx + math.cos(a) * v * tt * 0.75
        y = gy - 22 + math.sin(a) * v * tt + 0.5 * g * tt * tt
        life = F.clamp01((t - t0) / 0.9)
        kind = 'star' if k % 3 != 1 else 'conf'
        parts.append((rng.uniform(0, 1), kind, k, x, y, life, tt))
    for depth, kind, k, x, y, life, tt in sorted(parts):
        if life <= 0 or y > gy + 10 or y < 4:
            continue
        fade = 1 - F.ease_in(F.clamp01((life - 0.7) / 0.3), 1.5)
        if kind == 'star':
            s = (7.5 + (k % 4) * 1.6) * min(1.0, life * 8) * (0.4 + 0.6 * fade)
            GF.star5(c, x, y, s, tt * 7 + k, *STAR_COLS[k % 3], a=fade)
        else:
            confetti(c, x, y, 5.2, tt * 9 + k, tt * 16 + k * 1.3, CONFETTI[k % len(CONFETTI)], a=fade)
    # twinkles that linger around the building
    for k, (dx, dy, s0, p0) in enumerate([(-52, -60, 12, 0.35), (48, -84, 10, 0.5), (-20, -112, 9, 0.62),
                                          (62, -40, 8, 0.72), (-66, -30, 7, 0.8), (18, -70, 11, 0.45)]):
        u = F.clamp01((t - p0) / 0.45)
        s = s0 * math.sin(math.pi * u) if 0 < u < 1 else 0
        GF.glint(c, cx + dx, gy + dy, s, glow='#FFD45A', edge='#B8650E', glow_a=0.45, tip='#FFC83D', halo=0.7)
    return c.image()


# =========================================================================== wake (water)
def foam_ring(c, cx, cy, rx, ry, th, a, phase=0.0, broken=0.5, seed=0):
    """Iso foam ring: bright foam line with a darker blue under-edge (reads on deep and shallow sea),
    broken up by a periodic angular pattern so it looks like foam rather than a hard line."""
    if a <= 0.01 or rx < 2:
        return
    R = c.region(cx - rx - th - 4, cy - ry - th - 4, cx + rx + th + 4, cy + ry + th + 4)
    if R.empty:
        return
    e = F.sd_ellipse(R.X, R.Y, cx, cy, rx, ry)
    ang = np.arctan2((R.Y - cy) / max(ry, 1), (R.X - cx) / max(rx, 1))
    rng = np.random.default_rng(seed)
    pat = np.zeros_like(ang)
    for k, fr in enumerate((3, 5, 8, 13)):
        pat += np.sin(ang * fr + phase * (1 + k * 0.3) + rng.uniform(0, 6.3)) / (1 + k * 0.6)
    pat = pat / 2.2
    wid = th * np.clip(0.55 + 0.45 * pat + (1 - broken) * 0.5, 0.0, 1.2)
    ring = np.abs(e) - wid
    R.fill(ring - 1.1, hexc('#174A86'), 0.45 * a)
    under = np.abs(e - th * 0.6) - wid * 0.8
    R.fill(under, hexc('#2F86C9'), 0.55 * a)
    R.paint(R.cov(ring), F.mix(hexc('#FFFFFF'), hexc('#CDEBFB'), np.clip(0.5 - pat * 0.5, 0, 1)), a)


def bubbles(c, cx, cy, rx, ry, k_n, t_loop, seed, a=1.0):
    """Little foam bubbles hugging the hull (periodic drift around the ellipse)."""
    rng = np.random.default_rng(seed)
    for k in range(k_n):
        th0 = rng.uniform(0, 2 * math.pi)
        rr = rng.uniform(0.85, 1.12)
        u = (t_loop + rng.uniform(0, 1)) % 1.0
        th = th0 + 0.35 * math.sin(2 * math.pi * u)
        x = cx + math.cos(th) * rx * rr
        y = cy + math.sin(th) * ry * rr
        r = rng.uniform(1.4, 2.8) * (0.6 + 0.4 * math.sin(math.pi * u))
        al = a * math.sin(math.pi * u) ** 0.6
        R = c.region(x - 5, y - 5, x + 5, y + 5)
        if R.empty:
            continue
        R.fill(F.sd_circle(R.X, R.Y, x + 0.5, y + 0.7, r), hexc('#174A86'), 0.35 * al)
        R.fill(F.sd_circle(R.X, R.Y, x, y, r), hexc('#F4FBFF'), al)


def sh_wake(i, n, W=256, H=128):
    """Boat wake loop: three foam ripple rings born at the hull and spreading out on the iso water plane
    (one every n/3 frames, seamless), a lacy foam collar at the waterline and drifting bubbles.
    The centre stays clear for the boat sprite."""
    u0 = i / n
    c = F.Canvas(W, H)
    cx, cy = W / 2, H / 2
    hx, hy = 46, 20                                       # hull footprint (half axes) - kept clear
    for k in range(3):
        u = (u0 + k / 3.0) % 1.0
        rx = hx + 4 + (W / 2 - 10 - hx) * F.ease_out(u, 1.6)
        ry = rx * 0.48
        a = math.sin(math.pi * min(1.0, u * 1.6)) ** 0.7 * (1 - u) ** 1.1
        th = 3.6 * (1 - u) + 1.0
        foam_ring(c, cx, cy + 2, rx, ry, th, a, phase=2 * math.pi * u + k, seed=60 + k)
    # waterline collar (lacy, slowly shifting pattern -> periodic over the loop)
    foam_ring(c, cx, cy + 2, hx + 2, hy + 1, 3.2, 0.95, phase=2 * math.pi * u0, broken=0.2, seed=70)
    bubbles(c, cx, cy + 2, hx + 8, hy + 5, 16, u0, 71)
    return c.image()


def sh_wake_ring(i, n, W=192, H=96):
    """ONE foam ring expanding and fading (spawn behind a moving boat every ~0.25 s)."""
    t = (i + 0.7) / (n - 1 + 0.7)
    c = F.Canvas(W, H)
    cx, cy = W / 2, H / 2
    rx = 10 + (W / 2 - 12) * F.ease_out(t, 1.8)
    a = min(1.0, t * 6) * (1 - F.ease_in(t, 1.4))
    foam_ring(c, cx, cy, rx, rx * 0.48, 3.4 * (1 - t) + 0.9, a, phase=t * 3, seed=80)
    bubbles(c, cx, cy, rx * 0.8, rx * 0.38, 8, t * 0.5, 81, a=a * 0.9)
    return c.image()


# =========================================================================== fx_fire_big
def sh_fire_big(i, n, W=128, H=192):
    """Watchtower fire basket loop: a tall bundle of toy flame tongues (gen_fx.flame_layers), warm halo,
    embers spiralling up and soft grey smoke wisps leaving the tip.  All motion periodic over n frames."""
    ph = 2 * math.pi * i / n
    c = F.Canvas(W, H)
    cx, by = W / 2, H * 0.9
    # smoke wisps (behind the flames), rising and fading, periodic
    for k in range(3):
        u = (i / n + k / 3.0) % 1.0
        y = by - 108 - 62 * u
        x = cx + 6 + 10 * u + 4 * math.sin(2 * math.pi * u + k)
        r = 7 + 11 * u
        a = math.sin(math.pi * u) ** 1.2 * 0.75
        R = c.region(x - r * 2, y - r * 2, x + r * 2, y + r * 2)
        if R.empty or a < 0.02:
            continue
        blobs = [(x, y, r * 0.8), (x - r * 0.55, y + r * 0.25, r * 0.55), (x + r * 0.55, y + r * 0.2, r * 0.58)]
        d = GF.puff_sdf(R, blobs, r * 0.18)
        Lr = R
        GF.cloud(Lr, d, '#F4F6FA', '#C9D0DC', '#6E7888', alpha=a, bevel=r * 0.5, rim='#8C96A8', rim_a=0.6)
    # warm halo
    r = np.hypot(c.X - cx, (c.Y - by + 48) * 0.75)
    c.paint(np.exp(-(r / 52) ** 2), hexc('#FFB04A'), 0.30 + 0.05 * math.sin(ph * 2))
    tongues = [  # dx, height, width, phase, speed(int)
        (-22, 70, 16, 0.0, 1), (22, 66, 15, 2.1, 1), (0, 112, 25, 1.0, 1), (-10, 86, 17, 3.9, 2), (11, 80, 16, 5.0, 2),
        (-30, 44, 11, 4.4, 1), (30, 40, 10, 0.7, 2)]
    for j, (dx, h, w, p0, m) in enumerate(sorted(tongues, key=lambda q: -q[1])):
        hh = h * (1 + 0.12 * math.sin(ph * m + p0) + 0.06 * math.sin(ph * 2 * m + p0 * 2))
        sway = 0.5 * math.sin(ph * m + p0 + 0.8)
        GF.flame_layers(c, cx + dx, by, hh, w, sway=sway, wob=1.0, phase=ph * m + p0)
    # embers spiralling up
    for k in range(8):
        u = (i / n + k / 8.0) % 1.0
        x = cx + (k - 3.5) * 6 + 9 * math.sin(2 * math.pi * u + k * 1.7)
        y = by - 50 - 120 * u
        a = math.sin(math.pi * u) * 0.95
        R = c.region(x - 7, y - 7, x + 7, y + 7)
        if R.empty:
            continue
        R.paint(np.exp(-(np.hypot(R.X - x, R.Y - y) / 3.6) ** 2), hexc('#FFB03A'), a * 0.7)
        R.fill(F.sd_circle(R.X, R.Y, x, y, 1.6), hexc('#E0601A'), a)
        R.fill(F.sd_circle(R.X, R.Y, x, y, 1.1), hexc('#FFF0B0'), a)
    return c.image()


# key: (fn(i, n), frameW, frameH, frames, fps, repeat, anchor, notes)
SHEETS = {
    'fx_build_dust': (sh_build_dust, 160, 128, 12, 24, 0, [0.5, 0.72],
                      'Construction hammer puff: pow star + warm dust balls rolling out on the ground + wood chips. '
                      'Anchor = ground point. Play on every hammer hit (~0.5 s).'),
    'fx_build_done': (sh_build_done, 192, 192, 18, 20, 0, [0.5, 0.78],
                      'Building complete: flash, golden iso ground ring, light fan, fountain of stars + confetti. '
                      'Anchor = footprint centre; scale x1.3-1.6 for 3x3 m buildings.'),
    'fx_wake': (sh_wake, 256, 128, 12, 12, -1, [0.5, 0.5],
                'Boat wake loop on dark sea: 3 foam rings spreading from the hull + waterline collar + bubbles. '
                'Anchor = hull centre at the waterline; draw UNDER the boat. Clear centre ~92x40 px. '
                'Scale x0.7 for the rowboat, x1.2 for the fishing boat.'),
    'fx_wake_ring': (sh_wake_ring, 192, 96, 14, 16, 0, [0.5, 0.5],
                     'Extra: one expanding foam ring. Spawn at the stern of a MOVING boat every ~0.25 s (world '
                     'space, under the boat) - the rings form a V-shaped wake trail by themselves.'),
    'fx_fire_big': (sh_fire_big, 128, 192, 12, 14, -1, [0.5, 0.9],
                    'Watchtower fire basket loop (tall flames, embers, smoke wisps). Anchor = base of the flames '
                    '(basket rim, buildings fxPoints.fire).'),
}
