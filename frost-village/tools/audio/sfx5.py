"""Frost Village - v7 "햇살 해변" (Sunny Beach) + living-sea sounds (CONTRACT_V7 section Z) by procedural synthesis
(library + script).

Same toolkit and layering style as sfx.py .. sfx4.py (imported, never edited):
  sea           amb_sea_waves (mono, seamless ~46 s: the village coast's REAL rolling sea - near breakers in sets of
                different sizes and intervals that swell up, curl, break (plunging 'whump' or spilling roll), churn,
                rush up the shore and hiss / fizz / rattle the shingle as the foam drains back; a second line of waves
                further along the coast, a far surf roar, a deep sea rumble, cold air, a few ice floes knocking),
                sfx_wave_crash_1..3 (water hitting rocks / the breakwater: '철썩!' slap + boom, spray, droplets raining
                back, water pouring off the stones), sfx_wave_wash (one swash running up the sand and draining back)
  beach         amb_beach (mono, seamless ~28 s: gentle spilling surf on sand + distant children playing + gulls +
                a warm breeze and a soft beach crowd), sfx_splash_1..3 (hand splash / jump in / cannonball),
                sfx_pool_splash (hotel pool: crisp dive with deck + wall reflections and gutter lapping),
                sfx_lifeguard_whistle (pea whistle 'tweet - tweeeet', F7), sfx_icecream_bell (cart chime playing the
                bgm_village hook A C D -> F on bright bells + a jingle), sfx_beachball_bounce (vinyl beach ball
                'boing' on sand with two little re-bounces), sfx_hotel_bell (reception desk service bell 'ding', C7),
                sfx_sand_step_1..4 (footsteps on soft dry sand 1-3 and damp firm sand 4)
Musical sounds are in F major like bgm_village and every earlier sfx.

How the sea is built (shared by amb_sea_waves, amb_beach, sfx_wave_wash): surf_wave() renders one wave as four
spectral layers (rumble / body / hiss / air, each its own noise) whose gains follow the life of a breaker - the
approach (low swell rising, the crest starting to spill), the break (plunge 'whump' + crash with a fast or slow
attack), the turbulent roll (every layer 'churned' by independent smooth random gains at 3-25 Hz: real white
water is never a smooth noise), the swash running up the shore, and the backwash (fizz of popping foam bubbles in
ten resonant bands, sucking gurgles, shingle rattle). Every wave gets new random numbers, its own size, approach
time and break type, so no two waves are alike.
Loops are built like ambience.py / sfx3.py / sfx4.py: continuous beds in the frequency domain (synth.noise_fft)
with modulation curves of whole cycles over the loop (synth.periodic_curve), discrete events rendered past the end
and folded back (synth.fold_loop), circular limiter, then the loop is rotated to start at its quietest zero
crossing (rotate_quiet). The event layers are length-independent and memoised, so build_audio.fit_loop only
re-folds them for every candidate loop length.

Run:   python3 tools/audio/sfx5.py [key ...]        (no key = all)
       -> tools/audio/_cache/audio5/<key>.wav  (mono 44.1 kHz float; sfx peak -1.5 dBFS, loops -20 LUFS)
Normally called through build_audio5.py.  Deterministic (each key has a fixed seed).
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deps  # noqa: E402

deps.ensure()
import numpy as np  # noqa: E402

import instruments as I  # noqa: E402
import synth as S  # noqa: E402
from sfx import Mono, blip, bubble, burst, coin_hit, room, smooth_noise, tax  # noqa: E402
from sfx2 import utter  # noqa: E402
from sfx3 import _babble  # noqa: E402
from sfx4 import fold1, gull_call, handbell, master_mono, norm, place, rotate_quiet, tail_fade, unit  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio5")


# ============================================================================ building blocks
def shaped(n: int, r, shape) -> np.ndarray:
    """Unit-RMS noise of length n with magnitude response shape(f) (frequency domain, synth.noise_fft)."""
    return S.noise_fft(n, r, shape)


def band(fc: float, octaves: float):
    """Log-gaussian band shape for shaped() / noise_fft."""
    return lambda f: np.exp(-0.5 * (np.log2(f / fc) / (octaves / 2.0)) ** 2)


def churn(r, n: int, rate: float, depth: float) -> np.ndarray:
    """Turbulence gain >= 0: 1 + depth * (smooth random wobble band-limited to ~rate Hz). Real white water is a
    noise whose level keeps tumbling at several speeds; multiplying each spectral layer by its own churn gives the
    'rolling, churning' texture instead of a smooth hiss."""
    return np.maximum(0.0, 1.0 + depth * smooth_noise(r, n, rate))


def env_ar(t, t0: float, att: float, tau: float, curve: float = 1.0) -> np.ndarray:
    """0 before t0, rise over att (smooth), exponential decay tau after the peak."""
    u = t - t0
    rise = np.clip(u / max(att, 1e-4), 0, 1)
    rise = (0.5 - 0.5 * np.cos(np.pi * rise)) ** curve
    return np.where(u < 0, 0.0, rise * np.exp(-np.maximum(u - att, 0) / max(tau, 1e-4)))


def fizz(r, n: int, density, lo: float = 1800.0, hi: float = 9500.0, nb: int = 10, q=(4.0, 9.0)) -> np.ndarray:
    """Popping foam: Poisson clicks (rate = density(t) per second, an array) split over nb resonant bands between
    lo and hi Hz (small bubbles ring high and very briefly). Returns roughly unit-peak crackle * density shape."""
    dens = np.broadcast_to(np.asarray(density, dtype=float), (n,))
    out = np.zeros(n)
    fcs = np.geomspace(lo, hi, nb)
    for k, fc in enumerate(fcs):
        p = np.clip(dens / nb / SR, 0, 0.5)
        hit = r.random(n) < p
        amp = np.where(hit, r.lognormal(0.0, 0.55, n) * np.sign(r.standard_normal(n)), 0.0)
        qq = q[0] + (q[1] - q[0]) * r.random()
        out += S.bp(amp, fc * r.uniform(0.9, 1.1), qq) * (fc / 3000.0) ** -0.25
    return out


def stones(r, n: int, density, size: float = 1.0) -> np.ndarray:
    """Shingle rattle (pebbles knocking as the backwash drags them): sparse clicks with a short stony ring."""
    dens = np.broadcast_to(np.asarray(density, dtype=float), (n,))
    p = np.clip(dens / SR, 0, 0.5)
    hit = r.random(n) < p
    amp = np.where(hit, r.lognormal(0.0, 0.7, n) * np.sign(r.standard_normal(n)), 0.0)
    y = 0.55 * S.bp(amp, 2700 / size, 3.2) + 0.4 * S.bp(amp, 4300 / size, 4.0) + 0.35 * S.bp(amp, 1500 / size, 2.6)
    return y


def gurgle(r, t0: float, count: int, f_lo: float, f_hi: float, spread: float, buf: Mono, g: float):
    """A few low draining bubbles 'glug' (water sucked into the sand / between stones)."""
    for _ in range(count):
        tt = t0 + r.exponential(spread)
        buf.add(tt, bubble(r, r.uniform(f_lo, f_hi), r.uniform(0.04, 0.09), r.uniform(0.5, 1.3)),
                g * r.uniform(0.4, 1.0))


def distance(y, dist: float, lp_min: float = 900.0, verb: float = 0.6, rt60: float = 2.4) -> np.ndarray:
    """Push a sound away: high frequencies absorbed (lp from 9 kHz at dist 0 to lp_min at dist 1), more diffuse
    reverberant smear. dist 0 = at your feet, 1 = far along the coast."""
    if dist <= 0.02:
        return np.asarray(y, float)
    lp_hz = float(np.exp(np.log(14000.0) * (1 - dist) + np.log(lp_min) * dist))
    z = S.lp(np.asarray(y, float), lp_hz, order=2)
    if dist > 0.25:
        z = S.lp(z, lp_hz * 1.6)
    mix = verb * dist
    if mix > 0.03:
        z = I.verb_mono(z, rt60=rt60, mix=mix, tail=1.2, predelay=0.03 + 0.03 * dist, size=1.0,
                        hi_cut=min(6000.0, lp_hz * 1.2))
    return z


# ============================================================================ one wave
def surf_wave(r, size: float = 1.0, approach: float = 2.6, plunge: float = 0.5, swash: float = 1.0,
              retreat: float = 1.0, shingle: float = 0.0, foam: float = 1.0, warm: float = 0.0,
              rumble: float = 1.0) -> np.ndarray:
    """One breaking wave reaching the shore -> mono (unnormalised; roughly unit-ish for size 1).
    The break happens at t = approach seconds.
      size     0.3 (ripple) .. 1.3 (big set wave): level, length and weight of everything
      plunge   0 = spilling breaker (soft rolling start) .. 1 = plunging breaker (hard 'whump' when the lip lands)
      swash    how far the foam runs up the shore; retreat = length of the backwash hiss
      shingle  pebble rattle in the backwash (cold northern beach) ; foam = fizz amount ; warm = darker / softer air
      rumble   weight of the low swell / roll (lower for a small wash seen from the sand)
    """
    A = float(approach)
    t_sw = A + 0.45 + 0.35 * size                          # swash (rush up) starts
    d_sw = (1.1 + 0.9 * size) * swash                      # rush-up length
    t_bw = t_sw + 0.75 * d_sw                              # backwash starts
    d_bw = (2.2 + 2.2 * size) * retreat                    # backwash length
    total = t_bw + d_bw + 0.6
    n = n_of(total)
    t = tax(n)
    u = t - A                                              # time since the break
    # ---- spectral layers: four independent noises (dark rumble, body, hiss, air)
    rum = shaped(n, r, lambda f: 1.0 / (1 + (f / 170.0) ** 2) / np.sqrt(np.maximum(f, 28.0)))
    body = shaped(n, r, band(650.0 + 150 * size, 2.2))
    hiss = shaped(n, r, band(2300.0 - 400 * warm, 2.0))
    air = shaped(n, r, band(5600.0 - 1500 * warm, 1.6))
    # ---- approach: the swell rises (low roar grows, darkness lifting), the crest starts to spill late
    app = np.clip(t / A, 0, 1)
    e_app = np.where(t < A, app ** 2.4, 0.0)
    rise_fc = 160 + (650 + 500 * size) * app ** 1.6                       # lowpass opening as it steepens
    rum_app = S.tv_filter(rum, "lp", np.where(t < A + 0.5, rise_fc, rise_fc[min(n - 1, n_of(A))]), 0.7, block=64)
    spill = np.where(t < A, np.clip((t - 0.55 * A) / (0.45 * A), 0, 1) ** 2.2, 0.0) * (1.0 - 0.6 * plunge)
    # ---- break: crash attack (fast for plunging, slow roll for spilling) and the turbulent roll
    att = 0.05 + 0.32 * (1 - plunge)
    e_crash = env_ar(t, A, att, 0.45 + 0.55 * size)
    e_roll = env_ar(t, A + 0.05, 0.35 + 0.2 * size, 0.9 + 0.9 * size)
    e_rum = env_ar(t, A - 0.1, 0.4, 0.8 + 0.9 * size)
    # crash brightness falls as the white water spreads (layer weights do the darkening)
    bright = np.exp(-np.maximum(u, 0) / (0.35 + 0.3 * size))
    # ---- swash: foam rushing up the shore, thinning and slowing
    us = t - t_sw
    e_sw = np.where(us < 0, 0.0, np.sin(np.pi * np.clip(us / d_sw, 0, 1)) ** 1.3 *
                    np.exp(-np.clip(us / d_sw, 0, 1) * 0.6))
    e_sw = e_sw * (0.5 + 0.5 * np.clip(us / 0.25, 0, 1))
    # ---- backwash: draining hiss, fizz of popping bubbles, gurgles, rattling shingle
    ub = t - t_bw
    e_bw = np.where(ub < 0, 0.0, np.clip(ub / 0.5, 0, 1) ** 1.5 * np.exp(-np.maximum(ub - 0.5, 0) / (0.42 * d_bw)))
    dens_fz = np.where(u < 0.25, 0.0, 1.0) * (
        1600 * foam * size * np.exp(-np.maximum(u - 0.25, 0) / 1.0)
        + 900 * foam * np.where(ub < 0, 0.0, np.exp(-np.maximum(ub, 0) / (0.45 * d_bw))) * np.clip(ub / 0.3, 0, 1))
    # ---- churn (independent per layer, several speeds)
    c_r = churn(r, n, 3.0, 0.35) * churn(r, n, 9.0, 0.25)
    c_b = churn(r, n, 5.0, 0.45) * churn(r, n, 17.0, 0.3)
    c_h = churn(r, n, 7.0, 0.5) * churn(r, n, 24.0, 0.35)
    c_a = churn(r, n, 11.0, 0.55) * churn(r, n, 30.0, 0.35)
    sz = size ** 1.25
    y = (rum_app * (0.42 * e_app + 0.55 * e_rum * (0.6 + 0.4 * plunge)) * c_r * sz * rumble
         + body * (0.16 * spill * e_app + 0.62 * e_crash + 0.42 * e_roll + 0.16 * e_sw) * c_b * sz
         + hiss * (0.12 * spill * e_app + 0.55 * e_crash * (0.35 + 0.65 * bright) + 0.22 * e_roll
                   + 0.36 * e_sw + 0.07 * e_bw) * c_h * sz
         + air * (0.05 * spill * e_app + 0.38 * e_crash * bright + 0.18 * e_sw + 0.075 * e_bw) * c_a * sz * (1 - 0.4 * warm))
    # plunge 'whump': the lip landing traps air (low thud + a hollow boom)
    if plunge > 0.05:
        k = n_of(0.9)
        i0 = n_of(A)
        th = blip(72.0, 44.0, 0.9, 0.08, 0.16 + 0.1 * size, attack=0.012)
        th = th + S.lp(r.standard_normal(k), 210, order=2) * S.env_exp(k, 0.09 + 0.05 * size, 0.01) * 0.6
        th = th + 0.35 * S.bp(r.standard_normal(k), 420, 1.5) * S.env_exp(k, 0.05, 0.004)
        e = min(n, i0 + k)
        y[i0:e] += th[:e - i0] * 0.55 * plunge * sz
    # foam fizz (crackle) and backwash details
    fz = fizz(r, n, dens_fz, 1900.0, 9800.0 - 2500 * warm)
    y = y + fz * 0.05 * sz
    m = Mono(total)
    gurgle(r, t_bw + 0.1, int(2 + 3 * size), 160, 420, 0.5, m, 0.05 * sz)
    gurgle(r, t_sw + 0.1, int(2 + 4 * size), 380, 900, 0.6, m, 0.035 * sz)
    if shingle > 0.02:
        dens_st = 900 * shingle * e_bw / max(e_bw.max(), 1e-9)
        y = y + stones(r, n, dens_st) * 0.05 * shingle * sz
    y[:len(m.x)] += m.x[:n]
    return S.hp(y, 30, order=2)


def ice_knock(r, vel: float = 1.0) -> np.ndarray:
    """Two ice floes bumping on the swell: a hollow, glassy-woody 'tok' and a small slosh between them."""
    n = n_of(0.35)
    f = r.uniform(480.0, 820.0)
    y = S.modal(f, n, [(1.0, 1.0, 0.08), (2.29, 0.55, 0.05), (3.71, 0.32, 0.035), (5.6, 0.16, 0.02),
                       (7.9, 0.06, 0.012)], r, fmax=9000.0, attack=0.0006)
    y[:n_of(0.012)] += burst(r, 0.012, 2200, 0.9, tau=0.002)[:n_of(0.012)] * 0.5
    sl = S.bp(r.standard_normal(n), r.uniform(350, 700), 0.9) * S.env_pts([(0, 0), (0.05, 1.0), (0.35, 0)], n)
    return (y + unit(sl) * 0.12) * vel


# ============================================================================ amb_sea_waves (loop)
_MEMO = {}


def _memo(key, fn):
    if key not in _MEMO:
        _MEMO[key] = fn()
    return _MEMO[key]


# (break time s, size, approach s, plunge, shingle) - near breakers of the village coast. Irregular intervals
# (5.3 - 8.6 s), a set of three bigger waves in the middle, small ones between: no pattern inside the loop.
SEA_NEAR = [(3.6, 0.72, 2.4, 0.35, 0.45), (10.4, 0.95, 2.9, 0.65, 0.7), (16.0, 0.6, 2.2, 0.2, 0.35),
            (22.2, 1.12, 3.2, 0.85, 0.9), (28.9, 1.02, 3.0, 0.7, 0.8), (34.4, 0.86, 2.7, 0.55, 0.6),
            (39.7, 0.55, 2.1, 0.15, 0.3), (44.2, 0.68, 2.3, 0.4, 0.4)]
# waves breaking further along the coast (left / right of the village shore): softer, darker, smeared
SEA_MID = [(1.2, 0.8, 0.5), (6.9, 0.65, 0.45), (13.3, 0.9, 0.5), (19.0, 0.7, 0.55), (25.6, 0.85, 0.45),
           (31.6, 0.6, 0.5), (37.1, 0.95, 0.55), (42.0, 0.7, 0.45)]
SEA_FAR = [(2.6, 0.9), (5.1, 0.7), (8.6, 1.0), (11.9, 0.8), (14.7, 0.9), (18.1, 0.75), (20.6, 1.0), (24.1, 0.85),
           (27.2, 0.7), (30.4, 1.0), (33.3, 0.8), (36.2, 0.9), (40.6, 0.75), (43.4, 0.95)]
SEA_ICE = [(6.2, 3), (20.1, 2), (33.0, 4), (41.3, 2)]


def _sea_events(seed: int, nominal: float):
    """Length-independent event layer of amb_sea_waves (memoised): near / mid / far waves, ice floes."""
    r = S.rng(seed + 1)
    buf = np.zeros(n_of(nominal + 16.0))
    for tb, size, A, pl, sh in SEA_NEAR:
        w = surf_wave(r, size, A, plunge=pl, swash=1.0, retreat=1.1, shingle=sh, foam=1.0)
        w = distance(w, 0.12, verb=0.35, rt60=1.8)
        place(buf, tb - A, w, 1.0)
    for tb, size, dist in SEA_MID:
        A = r.uniform(2.2, 3.0)
        w = surf_wave(r, size, A, plunge=r.uniform(0.1, 0.6), swash=0.9, retreat=0.9, shingle=0.2, foam=0.7)
        w = distance(w, dist, lp_min=1100.0, verb=0.7, rt60=2.6)
        place(buf, tb - A, w, 0.42)
    for tb, g in SEA_FAR:
        A = r.uniform(2.0, 3.2)
        w = surf_wave(r, r.uniform(0.7, 1.1), A, plunge=r.uniform(0.0, 0.5), swash=0.8, retreat=0.7, foam=0.4)
        w = distance(w, 0.85, lp_min=700.0, verb=0.8, rt60=3.0)
        place(buf, tb - A, w, 0.24 * g)
    for t0, cnt in SEA_ICE:                                     # ice floes knocking as a swell lifts them
        tt = t0
        for k in range(cnt):
            place(buf, tt, distance(ice_knock(r, r.uniform(0.5, 1.0)), 0.3, verb=0.5, rt60=1.4), 0.045)
            tt += r.uniform(0.18, 0.55)
    return buf


def render_sea_waves(seed: int = 10100, loop_samples=None, nominal: float = 46.0):
    """Village-coast sea (mono loop): the memoised wave layer over a periodic bed - a far surf roar that swells
    with distant sets (crossfaded dark/bright spectra so it brightens as it grows), a deep sea rumble, and thin
    cold air over the water. -> (loop, meta)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    sets = S.periodic_curve(L, r, max(2, int(dur / 9)), max(4, int(dur / 2.2)), slope=0.8)
    slow = S.periodic_curve(L, r, 1, 4, slope=1.2)
    dark = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 260.0) ** 2) / np.sqrt(np.maximum(f, 30.0))))
    brt = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 900.0) / 1.3) ** 2)))
    sub = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 70.0) ** 4) * (f > 22)))
    cold = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 4800.0) / 1.4) ** 2)))
    tex = S.periodic_curve(L, r, int(dur * 2), int(dur * 6), slope=0.3)        # far roar texture (churn)
    bed = (dark * 0.055 * (0.55 + 0.45 * sets) * (0.85 + 0.3 * tex)
           + brt * 0.03 * sets ** 1.6 * (0.8 + 0.4 * tex)
           + sub * 0.04 * (0.7 + 0.3 * slow)
           + cold * 0.006 * (0.5 + 0.5 * slow))
    ev = _memo(("sea", seed, nominal), lambda: _sea_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 28, order=2)
    y, shift = rotate_quiet(master_mono(y, -20.0))
    return y, {"loopSamples": L, "rotation": shift}


# ============================================================================ amb_beach (loop)
BEACH_NEAR = [(2.9, 0.5, 1.9), (8.4, 0.42, 1.7), (13.1, 0.58, 2.1), (18.9, 0.38, 1.6), (23.5, 0.52, 2.0)]
BEACH_MID = [(5.6, 0.45), (11.0, 0.5), (16.2, 0.4), (21.3, 0.5), (26.4, 0.45)]


def kid_voice(r, kind: str) -> np.ndarray:
    """Distant children playing: 'babble' phrase, 'laugh' (hi-hi-hi), 'squeal' (ee-YAA!), 'call' (o-maa~!),
    'whee' (wheee~). Cute sfx2 formant voices, normalised."""
    if kind == "babble":
        y = _babble(r, True)
    elif kind == "laugh":
        f0 = r.uniform(480, 560)
        sy = [("h", "i" if r.random() < 0.6 else "e", 0.085, 1.0 - 0.035 * i, -0.05, 1.0 - 0.07 * i) for i in range(5)]
        y = utter(r, sy, f0, fs=1.22, tilt=0.9, breath=0.06, jitter=0.006, asp_gain=0.5, fmax=8000.0)
    elif kind == "squeal":
        y = utter(r, [("", "i", 0.11, 1.0, 0.18, 0.85), ("y", "a", 0.34, 1.22, -0.25, 1.0)], r.uniform(560, 660),
                  fs=1.3, tilt=0.85, breath=0.05, jitter=0.006, vib=0.01, fmax=8500.0)
    elif kind == "call":
        y = utter(r, [("", "o", 0.13, 1.0, 0.04, 0.8), ("m", "a", 0.42, 1.14, -0.14, 1.0)], r.uniform(400, 470),
                  fs=1.25, tilt=0.9, breath=0.04, jitter=0.005, vib=0.012, fmax=8000.0)
    else:                                                  # whee
        y = utter(r, [("w", "i", 0.55, 1.0, 0.32, 1.0)], r.uniform(500, 580), fs=1.28, tilt=0.88, breath=0.05,
                  jitter=0.006, vib=0.015, fmax=8500.0)
    return norm(S.hp(y, 200))


def _dbg(name, x):
    if os.environ.get("FV_AUDIO_DEBUG"):
        print(f"   layer {name:10s} lufs {S.lufs(x):6.1f}  peak {S.db(S.peak(x)):6.1f}", flush=True)


def _beach_events(seed: int, nominal: float):
    """Length-independent event layer of amb_beach (memoised): gentle surf, kids, gulls, far splashes."""
    r = S.rng(seed + 1)
    buf = np.zeros(n_of(nominal + 12.0))
    for tb, size, A in BEACH_NEAR:                         # small spilling waves sliding up the sand
        w = surf_wave(r, size, A, plunge=0.12, swash=1.25, retreat=1.2, shingle=0.0, foam=1.3, warm=0.5)
        w = distance(w, 0.18, verb=0.3, rt60=1.5)
        place(buf, tb - A, w, 1.0)
    for tb, size in BEACH_MID:
        A = r.uniform(1.6, 2.2)
        w = surf_wave(r, size, A, plunge=0.1, swash=1.0, retreat=0.9, foam=0.8, warm=0.6)
        w = distance(w, 0.5, lp_min=1200.0, verb=0.6, rt60=2.0)
        place(buf, tb - A, w, 0.4)
    _dbg("surf", buf)
    # children at play down the beach (all distant: high end absorbed, outdoor smear)
    kids = np.zeros_like(buf)
    plan = [(0.8, "babble"), (1.6, "laugh"), (3.9, "squeal"), (5.2, "babble"), (7.3, "call"), (9.1, "babble"),
            (10.0, "laugh"), (12.4, "whee"), (14.6, "babble"), (15.3, "babble"), (17.7, "squeal"), (19.6, "laugh"),
            (21.0, "babble"), (23.2, "call"), (24.8, "babble"), (26.2, "laugh")]
    for t0, kind in plan:
        y = kid_voice(r, kind)
        g = r.uniform(0.55, 1.0) * (1.15 if kind in ("squeal", "call", "whee") else 1.0)
        place(kids, t0 + r.uniform(-0.15, 0.15), y, g)
    kids = S.lp(kids, 3200, order=2)
    kids = I.verb_mono(kids, rt60=1.3, mix=0.55, tail=0.0, predelay=0.03, size=1.0, hi_cut=4500)[:len(buf)]
    _dbg("kids", kids * 0.085)
    buf += kids * 0.085
    # far splashes of kids jumping in, a ball 'pok'
    other = np.zeros_like(buf)
    for t0 in (4.6, 12.9, 22.3):
        sp = distance(splash(r, r.uniform(0.4, 0.75)), 0.55, verb=0.6, rt60=1.6)
        place(other, t0, norm(sp), 0.05)
    _dbg("splashes", other)
    # gulls overhead and far over the water (shifted pitches so they differ from audio4's calls)
    gulls = ((2.2, 1, 1.08, 0.55, 3800), (9.6, 3, 0.94, 0.4, 3000), (16.9, 2, 1.12, 0.32, 2800),
             (20.4, 1, 0.9, 0.7, 4600), (25.4, 3, 1.04, 0.3, 2500))
    for t0, v, pitch, g, lpf in gulls:
        y = gull_call(r, v, f_base={1: 1180.0, 2: 1100.0, 3: 1320.0}[v] * pitch, rasp=0.24)
        y = S.lp(y, lpf, order=2)
        y = I.verb_mono(y, rt60=1.8, mix=0.6 - 0.3 * g, tail=1.2, predelay=0.04, size=1.0, hi_cut=min(5000, lpf))
        place(other, t0, norm(y), 0.16 * g)
    _dbg("+gulls", other)
    return buf + other


def render_beach_amb(seed: int = 10200, loop_samples=None, nominal: float = 28.0):
    """Sunny Beach bed (mono loop): soft far surf, a warm breeze through the palms, a faint holiday crowd, plus the
    memoised events (gentle surf on sand, children, gulls, far splashes)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    swell = S.periodic_curve(L, r, max(2, int(dur / 6)), max(3, int(dur / 2.5)), slope=0.9)
    surf = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 520.0) / 1.6) ** 2) / (1 + (f / 3000) ** 2)))
    breeze_c = S.periodic_curve(L, r, 1, 5, slope=1.1)
    breeze = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 700.0) / 1.6) ** 2)))
    leaves = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 3600.0) / 1.2) ** 2)))
    rustle = S.periodic_curve(L, r, int(dur * 1.5), int(dur * 5), slope=0.4)
    walla = np.zeros(L)
    for layer in range(2):                                  # faint holiday crowd far up the beach
        sh = (lambda f, s=layer: sum(g / (1 + ((f - F * (1 + 0.07 * s)) / 300.0) ** 2)
                                     for F, g in ((600, 1.0), (1350, 0.7), (2600, 0.25))) / np.sqrt(np.maximum(f, 60)))
        fl = S.periodic_curve(L, r, int(dur * 1.5), int(dur * 4.5), slope=0.4)
        walla += unit(S.noise_fft(L, r, sh)) * (0.4 + 0.6 * fl ** 1.5)
    bed = (surf * 0.03 * (0.5 + 0.5 * swell)
           + breeze * 0.012 * (0.4 + 0.6 * breeze_c)
           + leaves * 0.0045 * (0.2 + 0.8 * breeze_c ** 2) * (0.6 + 0.4 * rustle)
           + unit(walla) * 0.009)
    _dbg("bed", bed)
    _dbg("walla", unit(walla) * 0.009)
    ev = _memo(("beach", seed, nominal), lambda: _beach_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 40, order=2)
    y, shift = rotate_quiet(master_mono(y, -20.0))
    return y, {"loopSamples": L, "rotation": shift}


# ============================================================================ waves on rocks / sand (one-shots)
def rock_hit(r, size: float = 1.0, boom: float = 1.0) -> np.ndarray:
    """Water slamming into rock at t = 0: hard slap + low boom + spray burst + droplets + pour-off + trickles."""
    total = 1.4 + 1.6 * size
    n = n_of(total)
    t = tax(n)
    m = Mono(total)
    # slap: very fast broadband hit, crunchy mid, a bright crack
    k = n_of(0.25)
    slap = S.hp(r.standard_normal(k), 300) * S.env_exp(k, 0.022 + 0.012 * size, 0.0015)
    m.add(0.0, slap, 0.9)
    m.add(0.0, S.bp(r.standard_normal(k), 1100, 0.9) * S.env_exp(k, 0.06, 0.002), 0.7)
    m.add(0.002, burst(r, 0.03, 4200, 0.8, tau=0.006), 0.6)
    # boom: trapped-air thump in the rock crevice
    m.add(0.0, blip(88.0 - 10 * size, 46.0, 0.7, 0.05, 0.13 + 0.08 * size, attack=0.004), 0.75 * boom * size)
    kb = n_of(0.5)
    m.add(0.0, S.lp(r.standard_normal(kb), 240, order=2) * S.env_exp(kb, 0.1 + 0.05 * size, 0.004), 0.9 * boom * size)
    # spray flying up (bright hiss peaking ~0.1 s later) and the white water pouring off the stones
    hiss = shaped(n, r, band(4200.0, 1.8)) * churn(r, n, 18.0, 0.5)
    body = shaped(n, r, band(1100.0, 2.2)) * churn(r, n, 9.0, 0.55) * churn(r, n, 25.0, 0.3)
    low = shaped(n, r, band(380.0, 1.8)) * churn(r, n, 6.0, 0.5)
    e_spray = env_ar(t, 0.0, 0.06, 0.16 + 0.16 * size)
    e_pour = env_ar(t, 0.03, 0.12, 0.22 + 0.22 * size)
    e_drain = env_ar(t, 0.3, 0.3, 0.5 + 0.3 * size)                      # the last water running off
    y = (hiss * (0.3 * e_spray + 0.03 * e_drain) + body * (0.34 * e_pour + 0.05 * e_drain)
         + low * 0.22 * env_ar(t, 0.02, 0.08, 0.2 + 0.12 * size))
    y[:len(m.x)] += m.x[:n]
    # droplets raining back: crackle + a few small 'plips'
    dens = 2200 * size * env_ar(t, 0.12, 0.12, 0.3 + 0.2 * size)
    y += fizz(r, n, dens, 1600.0, 8000.0, q=(2.0, 5.0)) * 0.05
    d = Mono(total)
    for _ in range(int(10 + 14 * size)):
        tt = 0.15 + r.exponential(0.25 + 0.2 * size)
        if tt < total - 0.1:
            d.add(tt, bubble(r, r.uniform(1100, 3200), r.uniform(0.015, 0.035), r.uniform(0.3, 0.9)),
                  r.uniform(0.04, 0.12) * np.exp(-tt / (0.8 + 0.5 * size)))
    gurgle(r, 0.5 + 0.3 * size, int(3 + 4 * size), 280, 750, 0.4, d, 0.06)       # water trickling off
    y[:len(d.x)] += d.x[:n]
    return y


def sfx_wave_crash(v: int):
    """A wave crashing on rocks / the breakwater ('철썩!'). A short surge (~0.2 s) runs in, then the slap.
    v1 = medium slap with a white spray, v2 = big boom (deep thump, long spray and pour-off),
    v3 = double slap (the wave hits, a second surge hits 0.34 s later). Impact cue = 0.20 s in all three."""
    r = S.rng(10300 + v)
    pre = 0.2
    m = Mono(4.0)
    k = n_of(pre + 0.15)                                   # surge running in
    tt = tax(k)
    surge = S.tv_filter(shaped(k, r, lambda f: 1.0 / (1 + (f / 400.0) ** 2) / np.sqrt(np.maximum(f, 30))), "lp",
                        250 + 1800 * np.clip(tt / pre, 0, 1) ** 2, 0.7, block=32)
    surge *= np.clip(tt / pre, 0, 1) ** 2 * np.exp(-np.maximum(tt - pre, 0) / 0.05)
    if v == 1:
        m.add(0.0, unit(surge) * 0.12, 1.0)
        m.add(pre, rock_hit(r, 0.85, 0.8), 1.0)
    elif v == 2:
        m.add(0.0, unit(surge) * 0.16, 1.0)
        m.add(pre, rock_hit(r, 1.3, 1.25), 1.0)
    else:
        m.add(0.0, unit(surge) * 0.1, 1.0)
        m.add(pre, rock_hit(r, 0.7, 0.6), 0.85)
        m.add(pre + 0.34, rock_hit(r, 0.75, 0.75), 0.95)
    y = S.hp(m.x, 35, order=2)
    y = I.verb_mono(y, rt60=1.2, mix=0.12, tail=0.4, predelay=0.02, size=0.9, hi_cut=6000)  # open shore space
    return tail_fade(y, 0.35)


def sfx_wave_wash():
    """One wash on a sand beach: a small spilling wave folds over just off-screen, the foam rushes up the sand
    ('shhhhhh'), slows, and drains back with a long fizzing hiss and a few sucking gurgles. Cues: rush 0.0,
    peak ~0.55, retreat ~1.5 s."""
    r = S.rng(10400)
    A = 0.35
    w = surf_wave(r, 0.5, A, plunge=0.05, swash=1.0, retreat=0.42, shingle=0.0, foam=1.4, warm=0.3, rumble=0.25)
    w = w[n_of(0.05):]                                     # start right on the rising foam
    w = I.verb_mono(w, rt60=0.9, mix=0.08, tail=0.2, predelay=0.015, size=0.8)
    return tail_fade(w, 0.6)


# ============================================================================ splashes
def splash(r, size: float = 1.0, plunge: float = 0.5, bright: float = 1.0) -> np.ndarray:
    """Body / hand hitting water at t = 0: slap, cavity 'bloomp', spray, falling droplets, bubbles."""
    total = 0.5 + 1.0 * size
    n = n_of(total)
    t = tax(n)
    m = Mono(total)
    k = n_of(0.12)
    m.add(0.0, S.bp(r.standard_normal(k), 1500 + 600 * bright, 0.7) * S.env_exp(k, 0.012 + 0.012 * size, 0.0012), 1.0)
    m.add(0.0, burst(r, 0.02, 3800 + 1200 * bright, 1.0, tau=0.004), 0.55)
    m.add(0.0, blip(230.0, 105.0, 0.25, 0.03, 0.05 + 0.04 * size, attack=0.002), 0.45 * size)
    if plunge > 0.05:                                       # air cavity collapsing: a rising 'bloomp'
        f0 = 150.0 / (0.6 + 0.5 * size)
        m.add(0.06 + 0.06 * size, bubble(r, f0, 0.16 + 0.1 * size, 1.4, tau=0.06 + 0.03 * size),
              0.55 * plunge * size)
    body = shaped(n, r, band(1500.0, 2.4)) * churn(r, n, 14.0, 0.5)
    spray = shaped(n, r, band(5200.0, 1.6)) * churn(r, n, 22.0, 0.5)
    y = body * 0.35 * env_ar(t, 0.003, 0.012, 0.06 + 0.12 * size) + spray * 0.22 * env_ar(t, 0.02, 0.05, 0.1 + 0.2 * size)
    y[:len(m.x)] += m.x[:n]
    dens = 1600 * size * env_ar(t, 0.1, 0.08, 0.18 + 0.3 * size)          # spray falling back
    y += fizz(r, n, dens, 1500.0, 8000.0, q=(2.0, 5.0)) * 0.06
    d = Mono(total)
    for _ in range(int(6 + 12 * size)):
        tt = 0.04 + r.exponential(0.12 + 0.15 * size)
        if tt < total - 0.05:
            d.add(tt, bubble(r, r.uniform(500, 2200), r.uniform(0.02, 0.06), r.uniform(0.4, 1.1)),
                  r.uniform(0.08, 0.25) * np.exp(-tt / (0.3 + 0.4 * size)))
    y[:len(d.x)] += d.x[:n]
    return y


def sfx_splash(v: int):
    """Beach splashes. 1 = kid's hand splash / splash_play 'splish', 2 = jumping in feet-first 'sploosh',
    3 = cannonball 'KA-BLOOMP' with a big spray raining down. Group sfx_splash_beach."""
    r = S.rng(10500 + v)
    if v == 1:
        m = Mono(0.8)
        m.add(0.0, splash(r, 0.35, 0.1, 1.2), 1.0)
        m.add(0.13, splash(r, 0.25, 0.0, 1.3), 0.55)              # a second little slap of the other hand
        y = m.x
    elif v == 2:
        y = splash(r, 0.8, 0.7, 1.0)
    else:
        m = Mono(2.0)
        m.add(0.0, splash(r, 1.35, 1.0, 0.9), 1.0)
        k = n_of(0.6)
        m.add(0.0, S.lp(r.standard_normal(k), 200, order=2) * S.env_exp(k, 0.09, 0.003), 0.6)   # body thump
        y = m.x
    y = S.hp(y, 50, order=2)
    return tail_fade(room(y, 0.5, 0.05, 0.15, 0.7), 0.15)


def sfx_pool_splash():
    """Diving into the hotel pool: crisp slap, plunge 'bloomp', spray, then water slapping the tiled walls and
    lapping into the overflow gutter; short slap-back off the hotel wall + a bright tiled-deck ambience."""
    r = S.rng(10600)
    m = Mono(2.4)
    m.add(0.0, splash(r, 0.95, 0.9, 1.25), 1.0)
    for k, (tt, g) in enumerate(((0.62, 0.5), (0.95, 0.38), (1.28, 0.28), (1.58, 0.18))):   # gutter laps
        kk = n_of(0.3)
        lap = S.tv_filter(r.standard_normal(kk), "bp", 700 + 900 * np.exp(-tax(kk) / 0.08), 1.1, block=32)
        lap = lap * S.env_pts([(0, 0), (0.03, 1.0), (0.12, 0.35), (0.3, 0)], kk)
        m.add(tt + r.uniform(-0.02, 0.02), unit(lap) * 0.1, g)
        m.add(tt + 0.04, bubble(r, r.uniform(320, 520), 0.07, 0.9), 0.12 * g)
    y = S.hp(m.x, 60, order=2)
    d = n_of(0.065)                                         # slap-back off the hotel wall
    y = np.concatenate((y, np.zeros(d))) + 0.22 * np.concatenate((np.zeros(d), S.lp(y, 4500)))
    y = I.verb_mono(y, rt60=0.8, mix=0.16, tail=0.3, predelay=0.008, size=0.6, hi_cut=8000)
    return tail_fade(y, 0.25)


# ============================================================================ beach life
def pea_whistle(dur: float, r, f: float, vel: float = 1.0) -> np.ndarray:
    """Pea whistle blast: a high near-sine whose pitch and level warble fast as the pea spins in the chamber
    (the classic 'trill'), breathy edge, quick pitch scoop at the start."""
    rel = 0.035
    n = n_of(dur + rel)
    t = tax(n)
    rate = 34.0 * (1 + 0.08 * smooth_noise(r, n, 4.0)) * (1 + 0.15 * np.clip(t / 0.08, 0, 1))
    ph = S.phase(rate, n)
    trill = np.sin(TAU * ph)
    semis = -0.9 * np.exp(-t / 0.018) + 0.32 * trill
    fr = f * 2 ** (semis / 12)
    tone = S.additive(fr, n, [(1, 1.0), (2, 0.05), (3, 0.02)], fmax=11000)
    am = 1 - 0.38 * (0.5 + 0.5 * np.sin(TAU * ph + 0.9))
    breath = S.bp(r.standard_normal(n), f, 3.0) * 0.18 + S.hp(r.standard_normal(n), 5000) * 0.03
    env = S.env_adsr(n, 0.012, 0.05, 0.86, rel, gate=dur)
    return (tone * am + breath * (0.6 + 0.4 * am)) * env * vel


def sfx_lifeguard_whistle():
    """Lifeguard on the tower: pea whistle (F7, warbling trill) 'tweet - tweeeeet!'."""
    r = S.rng(10700)
    f = float(S.midi_hz(101))                              # F7 2794 Hz
    m = Mono(1.2)
    m.add(0.0, pea_whistle(0.15, r, f, 0.85), 1.0)
    m.add(0.27, pea_whistle(0.62, r, f, 1.0), 1.0)
    y = S.lp(S.hp(m.x, 600), 9000)
    y = I.verb_mono(y, rt60=0.9, mix=0.1, tail=0.25, predelay=0.02, size=0.8)
    return tail_fade(y, 0.15)


def sfx_icecream_bell():
    """Ice-cream cart chime: the vendor's bright bells play the bgm_village hook 'A C D -' landing on F, then a
    shake of the little cart jingle bells."""
    r = S.rng(10800)
    m = Mono(2.6)
    notes = ((0.0, 81, 0.95), (0.15, 84, 0.85), (0.3, 86, 0.95), (0.62, 89, 1.0))      # A5 C6 D6 . F6
    for tt, mm, v in notes:
        m.add(tt, handbell(mm, r, v, t60=1.3 if mm < 89 else 1.8), 0.34)
        m.add(tt + 0.003, I.glock(mm + 12, v * 0.6, r), 0.12)
    for k in range(3):
        m.add(0.95 + 0.11 * k + r.uniform(0, 0.02), I.sleigh(0.5 - 0.12 * k, r, nbells=4), 0.16)
    y = S.hp(S.lp(m.x, 9500), 250, order=2)
    y = I.verb_mono(y, rt60=1.0, mix=0.1, tail=0.25, predelay=0.012, size=0.7)
    return tail_fade(y, 0.6)


def ball_hit(r, vel: float = 1.0, sand: float = 1.0) -> np.ndarray:
    """Inflatable vinyl beach ball landing: hollow springy 'boing' (membrane modes with a quick pitch drop), the
    vinyl skin slap, and a soft sand thud with scattering grains."""
    n = n_of(0.4)
    t = tax(n)
    f0 = float(S.midi_hz(53)) * (1 + 0.22 * np.exp(-t / 0.025))           # F3 after a springy drop
    p = S.phase(f0, n)
    y = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 0.11), (1.59, 0.5, 0.06), (2.14, 0.3, 0.045), (2.65, 0.18, 0.03),
                            (3.16, 0.1, 0.02)):
        y += amp * np.sin(TAU * ratio * p + r.uniform(0, TAU)) * np.exp(-t / tau)
    y *= np.clip(t / 0.002, 0, 1)
    y += S.bp(r.standard_normal(n), 2000, 1.0) * S.env_exp(n, 0.004, 0.0004) * 0.6     # vinyl slap
    y += S.lp(r.standard_normal(n), 380, order=2) * S.env_exp(n, 0.03, 0.002) * 0.9 * sand   # sand thud
    if sand > 0:
        y += fizz(r, n, 2500 * np.exp(-t / 0.035), 1500.0, 6000.0, nb=6, q=(2.0, 4.0)) * 0.25 * sand
    return y * vel


def sfx_beachball_bounce():
    """Beach ball bouncing on the sand: 'boing' + two little re-bounces (cues bounce1 0, bounce2 0.30,
    bounce3 0.48)."""
    r = S.rng(10900)
    m = Mono(1.0)
    m.add(0.0, ball_hit(r, 1.0, 1.0), 1.0)
    m.add(0.30, ball_hit(r, 0.42, 0.8), 1.0)
    m.add(0.48, ball_hit(r, 0.17, 0.6), 1.0)
    y = S.hp(m.x, 60, order=2)
    return tail_fade(room(y, 0.35, 0.05, 0.1, 0.5), 0.08)


def sfx_hotel_bell():
    """Reception desk service bell: the plunger 'tick' and a bright dome-bell 'DING' (C7) ringing out with a slow
    shimmer, in a marble lobby."""
    r = S.rng(11000)
    f = float(S.midi_hz(96))                               # C7 2093 Hz
    n = n_of(2.4)
    modes = [(1.0, 1.0, 2.2), (1.0017, 0.45, 2.0), (2.67, 0.32, 0.9), (2.676, 0.12, 0.8), (5.03, 0.13, 0.35),
             (8.1, 0.05, 0.15), (0.5, 0.02, 0.5)]
    bell = S.modal(f, n, modes, r, fmax=14000.0, attack=0.0004)
    m = Mono(2.6)
    m.add(0.0, burst(r, 0.006, 5200, 1.2, tau=0.0008), 0.5)                  # plunger click
    m.add(0.0, S.modal(640.0, n_of(0.04), [(1, 1, 0.02), (2.4, 0.4, 0.01)], r), 0.12)
    m.add(0.004, bell, 0.6)
    y = S.hp(S.lp(m.x, 12000), 300, order=2)
    y = I.verb_mono(y, rt60=1.3, mix=0.14, tail=0.3, predelay=0.012, size=0.8)
    return tail_fade(y, 0.8)


def sfx_sand_step(v: int):
    """Footstep on sand: soft heel thud + a short slide of dry grains ('fff-sh'), darker and softer than the snow
    crunch. 1-3 dry fine sand (3 = with a little toe scuff), 4 = damp firm sand near the water ('thup')."""
    r = S.rng(11100 + v)
    total = 0.32
    n = n_of(total)
    t = tax(n)
    damp = v == 4
    m = Mono(total)
    m.add(0.0, blip(120.0 if not damp else 150.0, 80.0, 0.12, 0.02, 0.025 if not damp else 0.035, attack=0.003),
          0.28 if not damp else 0.42)
    k = n_of(0.16)
    m.add(0.0, S.lp(r.standard_normal(k), 900 if not damp else 650, order=2) * S.env_exp(k, 0.03, 0.004),
          0.35 if not damp else 0.5)
    grains = shaped(n, r, band(2100.0 if not damp else 1500.0, 2.4)) * churn(r, n, 60.0, 0.6)
    slide = env_ar(t, 0.004, 0.018, 0.045 if not damp else 0.03)
    y = grains * slide * (0.22 if not damp else 0.12)
    dens = (1400 if not damp else 500) * env_ar(t, 0.003, 0.01, 0.05)
    y += fizz(r, n, dens, 1200.0, 6500.0, nb=8, q=(1.5, 3.5)) * (0.16 if not damp else 0.08)
    if v == 3:                                              # toe scuffing the sand on the way out
        y += shaped(n, r, band(2800.0, 2.0)) * env_ar(t, 0.11, 0.04, 0.05) * 0.1
    if damp:                                                # a faint squelch of wet sand
        m.add(0.012, bubble(r, 380.0, 0.05, 0.6), 0.08)
    y[:len(m.x)] += m.x[:n]
    y = S.lp(y, 7000)
    return y


# ============================================================================ registry
SFX5 = {
    "sfx_wave_crash_1": lambda: sfx_wave_crash(1), "sfx_wave_crash_2": lambda: sfx_wave_crash(2),
    "sfx_wave_crash_3": lambda: sfx_wave_crash(3),
    "sfx_wave_wash": sfx_wave_wash,
    "sfx_splash_1": lambda: sfx_splash(1), "sfx_splash_2": lambda: sfx_splash(2),
    "sfx_splash_3": lambda: sfx_splash(3),
    "sfx_pool_splash": sfx_pool_splash,
    "sfx_lifeguard_whistle": sfx_lifeguard_whistle,
    "sfx_icecream_bell": sfx_icecream_bell,
    "sfx_beachball_bounce": sfx_beachball_bounce,
    "sfx_hotel_bell": sfx_hotel_bell,
    "sfx_sand_step_1": lambda: sfx_sand_step(1), "sfx_sand_step_2": lambda: sfx_sand_step(2),
    "sfx_sand_step_3": lambda: sfx_sand_step(3), "sfx_sand_step_4": lambda: sfx_sand_step(4),
}
# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH5 = {
    "sfx_wave_crash_1": dict(punch=3, fout=0.1), "sfx_wave_crash_2": dict(punch=3, fout=0.1),
    "sfx_wave_crash_3": dict(punch=3, fout=0.1), "sfx_wave_wash": dict(punch=1, fout=0.15),
    "sfx_splash_1": dict(punch=3, fout=0.04), "sfx_splash_2": dict(punch=3, fout=0.05),
    "sfx_splash_3": dict(punch=3, fout=0.06), "sfx_pool_splash": dict(punch=3, fout=0.06),
    "sfx_lifeguard_whistle": dict(punch=1, fout=0.03), "sfx_icecream_bell": dict(punch=2, fout=0.05),
    "sfx_beachball_bounce": dict(punch=3, fout=0.02), "sfx_hotel_bell": dict(punch=2, fout=0.06),
    "sfx_sand_step_1": dict(punch=4, fout=0.01), "sfx_sand_step_2": dict(punch=4, fout=0.01),
    "sfx_sand_step_3": dict(punch=4, fout=0.01), "sfx_sand_step_4": dict(punch=4, fout=0.01),
}
LOOP_FUNCS = {"amb_sea_waves": "render_sea_waves", "amb_beach": "render_beach_amb"}


def render(key: str) -> np.ndarray:
    """Same mastering chain as sfx.render .. sfx4.render: optional punch limiter -> synth.finish_sfx
    (high-pass, trim, fades, peak -1.5 dBFS)."""
    y = np.asarray(SFX5[key](), dtype=float)
    opts = dict(FINISH5.get(key, {}))
    punch = opts.pop("punch", 0)
    if punch:
        y = S.hp(y, 30, order=2)
        y = S.limiter(y / max(S.peak(y), 1e-12), -float(punch), window_ms=3.0)
    return S.finish_sfx(y, peak_db=-1.5, **opts)


def main(keys):
    os.makedirs(CACHE, exist_ok=True)
    for k in keys:
        if k in LOOP_FUNCS:
            y, meta = globals()[LOOP_FUNCS[k]]()
        else:
            y = render(k)
        p = os.path.join(CACHE, f"{k}.wav")
        S.write_wav(p, y)
        lv = f"LUFS {S.lufs(y):6.1f}" if k in LOOP_FUNCS else f"Mmax {S.momentary_max(y):6.1f}"
        print(f"{k:22s} {len(y) / SR:6.2f}s  peak {S.db(S.peak(y)):6.2f} dBFS  {lv}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or (list(SFX5) + list(LOOP_FUNCS)))
