"""Frost Village - v7 "햇살 해변" (Sunny Beach) + living-sea sounds (CONTRACT_V7 section Z) by procedural synthesis
(library + script).

Same toolkit and layering style as sfx.py .. sfx4.py (imported, never edited):
  sea           amb_sea_waves (mono, seamless 42 s = 7 swell periods: the village coast's REAL rolling sea - one
                near breaker per 6 s shore-swell crest like Water.js draws them, in a set of rising and falling
                sizes, each swelling up, curling, breaking (plunging 'whump' or spilling roll), churning, rushing up
                the shore and hissing / fizzing / rattling the shingle as the foam drains back; irregular waves
                further along the coast, a far surf roar, a deep sea rumble, cold air, a few ice floes knocking),
                sfx_wave_crash_1..3 (water hitting rocks / the breakwater: '철썩!' slap + boom, spray, droplets raining
                back, water pouring off the stones), sfx_wave_wash / _2 / _3 (one swash running up the sand and
                draining back; group sfx_wave_wash)
  beach         amb_beach (mono, seamless 24 s = 4 swell periods: low spilling surf on sand on the same grid, a far
                babble of children, far gulls and splashes, a warm breeze and a soft beach crowd), sfx_beach_kids_1..4
                (giggle / squeal / 'o-maa~' / 'wheee'), sfx_splash_1 / 1b / 1c (hand splashes, group
                sfx_splash_beach), sfx_splash_2 (jumping in), sfx_splash_3 (cannonball), sfx_pool_splash (hotel
                pool: crisp dive with deck + wall reflections and gutter lapping), sfx_lifeguard_whistle (pea whistle
                'tweet - tweeeet', F7, deep pea trill), sfx_icecream_bell (cart chime playing the bgm_village hook
                A C D -> F on bright bells + a jingle), sfx_beachball_bounce (vinyl beach ball 'boing' on F5 with a
                vinyl 'pock', two little re-bounces), sfx_hotel_bell (reception desk service bell 'ding', C7),
                sfx_sand_step_1..3 (dry sand, group sfx_sand_step) and _4, _5 (damp sand, group sfx_sand_step_wet)
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
       (loop renders here use the nominal length; build_audio5 fits them to Vorbis block boundaries)
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
from sfx import Mono, blip, bubble, burst, room, smooth_noise, tax  # noqa: E402
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
# The game's water (src/systems/Water.js) rolls a shore swell whose crest reaches the waterline every
# SWELL.shore.period = 6.0 s (shader shore cycle 0); the swash then runs up for 0.3 of the cycle (1.8 s) and drains
# back. The near waves of amb_sea_waves / amb_beach sit on that 6 s grid (loops are whole multiples of it) and every
# wave is listed in the manifest (cues.waterline / cues.breaks, swellPeriod, swellPhase), so the game can start a bed
# in step with the crests on screen. Mid / far waves (further along the coast, not on screen) stay irregular.
SWELL_P = 6.0


def wave_times(size: float, approach: float, swash: float):
    """(break, waterline, upmost) in seconds from the start of a surf_wave() render: the crest breaks at `approach`,
    its white water reaches the waterline (= Water.js shore cycle 0) and runs up the shore until `upmost`, where the
    backwash begins. Same formulas surf_wave uses."""
    t_sw = approach + 0.45 + 0.35 * size
    d_sw = (1.1 + 0.9 * size) * swash
    return float(approach), float(t_sw), float(t_sw + 0.75 * d_sw)


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
    e_app = np.where(t < A, app ** 2.4, np.exp(-np.maximum(t - A, 0) / 0.3))   # hands over smoothly to the crash
    rise_fc = 160 + (650 + 500 * size) * app ** 1.6                       # lowpass opening as it steepens
    rum_app = S.tv_filter(rum, "lp", np.where(t < A + 0.5, rise_fc, rise_fc[min(n - 1, n_of(A))]), 0.7, block=64)
    spill = np.where(t < A, np.clip((t - 0.55 * A) / (0.45 * A), 0, 1) ** 2.2,
                     np.exp(-np.maximum(t - A, 0) / 0.25)) * (1.0 - 0.6 * plunge)
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


# ============================================================================ loop helpers
_MEMO = {}


def _memo(key, fn):
    if key not in _MEMO:
        _MEMO[key] = fn()
    return _MEMO[key]


def _dbg(name, x):
    if os.environ.get("FV_AUDIO_DEBUG"):
        print(f"   layer {name:10s} lufs {S.lufs(x):6.1f}  peak {S.db(S.peak(x)):6.1f}", flush=True)


def at_lufs(x, level: float) -> np.ndarray:
    """Scale a layer so its integrated loudness is ``level`` LUFS (gain staging of the loop layers: every layer is
    mixed at a planned level relative to the main one; the finished loop is then mastered to -20 LUFS)."""
    x = np.asarray(x, dtype=float)
    lv = S.lufs(x)
    return x * S.undb(level - lv) if lv > -69.0 else x


def mix_layers(layers: dict, levels: dict) -> np.ndarray:
    """Sum memoised, length-independent event layers, each at levels[name] LUFS."""
    out = None
    for name, x in layers.items():
        y = at_lufs(x, levels[name])
        _dbg(name, y)
        out = y if out is None else out + y
    return out


# ============================================================================ amb_sea_waves (loop)
# One near breaker per shore-swell crest (every SWELL_P s, like the crests on screen), 7 crests = a 42 s loop.
# (slot, jitter s, size, approach s, plunge, shingle, swash, retreat). The waterline time of slot k is
# SEA_PHASE + k * SWELL_P + jitter; sizes rise and fall in a set (a small pair, the big set waves, a lull), each wave
# has its own break type (plunging 'whump' / spilling roll), run-up and backwash, so no two waves sound alike even
# though they arrive on the swell's beat.
SEA_WAVES = 7
SEA_PHASE = 4.4
# both beds roll off above ~15 kHz (24 dB / oct, -6 dB at BED_LP): air absorption over the water, the same band the
# .mp3 fallback keeps, inaudible on phone speakers - and Vorbis then spends ~20 kB less on hiss nobody hears.
BED_LP = 15000.0
SEA_NEAR = [(0, +0.12, 0.66, 2.4, 0.35, 0.45, 1.0, 1.05), (1, -0.15, 0.56, 2.2, 0.18, 0.35, 0.95, 0.95),
            (2, +0.05, 0.84, 2.7, 0.6, 0.6, 1.05, 1.1), (3, -0.08, 1.06, 3.0, 0.8, 0.85, 1.1, 1.15),
            (4, +0.17, 1.14, 3.2, 0.88, 0.9, 1.1, 1.2), (5, -0.04, 0.9, 2.8, 0.55, 0.7, 1.0, 1.1),
            (6, +0.09, 0.7, 2.4, 0.3, 0.45, 1.0, 1.0)]
# waves breaking further along the coast (left / right of the village shore): irregular, softer, darker, smeared.
# (break time s, size, distance)
SEA_MID = [(3.3, 0.8, 0.5), (8.5, 0.65, 0.45), (14.1, 0.9, 0.5), (19.0, 0.7, 0.55), (25.3, 0.85, 0.45),
           (30.2, 0.6, 0.5), (35.6, 0.95, 0.55), (40.4, 0.7, 0.45)]
SEA_FAR = [(2.6, 0.9), (5.4, 0.7), (8.9, 1.0), (11.6, 0.8), (14.9, 0.9), (17.7, 0.75), (20.9, 1.0), (24.1, 0.85),
           (26.8, 0.7), (29.9, 1.0), (32.6, 0.8), (35.3, 0.9), (38.4, 0.75), (40.9, 0.95)]
SEA_ICE = [(7.4, 3), (19.6, 2), (31.1, 4), (38.0, 2)]
# mix plan (LUFS of each layer before mastering; the near breakers are the reference)
SEA_LEVELS = {"near": -20.0, "mid": -27.5, "far": -32.0, "ice": -36.0,
              "roar": -31.5, "sets": -35.0, "sub": -38.0, "cold": -43.0}


def place_wrap(buf, t_sec: float, sig, g: float, period: float):
    """place() for loop event layers: an event that would start before 0 is moved one loop later (it folds back
    onto the start), so its timing inside the loop is kept."""
    place(buf, t_sec + period if t_sec < 0 else t_sec, sig, g)


def _sea_events(seed: int, nominal: float):
    """Length-independent event layers of amb_sea_waves (memoised): near / mid / far waves, ice floes.
    -> (mix, near-wave timing list [(break, waterline, upmost, size)])."""
    r = S.rng(seed + 1)
    nb = n_of(nominal + 16.0)
    lay = {k: np.zeros(nb) for k in ("near", "mid", "far", "ice")}
    timing = []
    for slot, jit, size, A, pl, sh, swash, ret in SEA_NEAR:
        tw = SEA_PHASE + slot * SWELL_P + jit                   # white water reaches the waterline
        b, w_, u = wave_times(size, A, swash)
        w = surf_wave(r, size, A, plunge=pl, swash=swash, retreat=ret, shingle=sh, foam=1.0)
        place_wrap(lay["near"], tw - w_, distance(w, 0.1, verb=0.35, rt60=1.8), 1.0, nominal)
        timing.append((tw - (w_ - b), tw, tw + (u - w_), size))
    for tb, size, dist in SEA_MID:
        A = r.uniform(2.2, 3.0)
        w = surf_wave(r, size, A, plunge=r.uniform(0.1, 0.6), swash=0.9, retreat=0.9, shingle=0.2, foam=0.7)
        place_wrap(lay["mid"], tb - A, distance(w, dist, lp_min=1100.0, verb=0.7, rt60=2.6), size, nominal)
    for tb, g in SEA_FAR:
        A = r.uniform(2.0, 3.2)
        w = surf_wave(r, r.uniform(0.7, 1.1), A, plunge=r.uniform(0.0, 0.5), swash=0.8, retreat=0.7, foam=0.4)
        place_wrap(lay["far"], tb - A, distance(w, 0.85, lp_min=700.0, verb=0.8, rt60=3.0), g, nominal)
    for t0, cnt in SEA_ICE:                                     # ice floes knocking as a swell lifts them
        tt = t0
        for k in range(cnt):
            place(lay["ice"], tt, distance(ice_knock(r, r.uniform(0.5, 1.0)), 0.3, verb=0.5, rt60=1.4), 1.0)
            tt += r.uniform(0.18, 0.55)
    return mix_layers(lay, SEA_LEVELS), timing


def swell_meta(timing, phase0: float, waves: int, L: int, shift: int) -> dict:
    """Manifest fields that let the game line a bed up with Water.js: the loop holds `waves` swell periods
    (swellPeriod = loop / waves, 6.0 s within a few ms after Vorbis loop fitting); cues.waterline / cues.breaks /
    cues.upmost = loop times (after the quiet-start rotation) of every near wave; swellPhase = loop time of the
    grid the waterline cues sit on (+- their jitter)."""
    dur = L / SR
    P = dur / waves
    rot = shift / SR

    def at(t):
        return round(float((t - rot) % dur), 3)
    cues = {"waterline": sorted(at(w) for _, w, _, _ in timing), "breaks": sorted(at(b) for b, _, _, _ in timing),
            "upmost": sorted(at(u) for _, _, u, _ in timing)}
    return {"swellPeriod": round(P, 5), "swellWaves": waves, "swellPhase": round(float((phase0 - rot) % P), 3),
            "cues": cues}


def render_sea_waves(seed: int = 10100, loop_samples=None, nominal: float = SEA_WAVES * SWELL_P):
    """Village-coast sea (mono loop): the memoised wave layers over a periodic bed - a far surf roar that swells
    with distant sets (a dark layer plus a brighter one that only rises with the sets, so the roar brightens as it
    grows), a deep sea rumble, and thin cold air over the water. -> (loop, meta)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    sets = S.periodic_curve(L, r, max(2, int(dur / 9)), max(4, int(dur / 2.2)), slope=0.8)
    slow = S.periodic_curve(L, r, 1, 4, slope=1.2)
    tex = S.periodic_curve(L, r, int(dur * 2), int(dur * 6), slope=0.3)        # far roar texture (churn)
    dark = S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 300.0) ** 2) / np.sqrt(np.maximum(f, 70.0)))
    brt = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 900.0) / 1.3) ** 2))
    sub = S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 70.0) ** 4) * (f > 22))
    cold = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 4800.0) / 1.4) ** 2))
    bed = (at_lufs(dark * (0.55 + 0.45 * sets) * (0.85 + 0.3 * tex), SEA_LEVELS["roar"])
           + at_lufs(brt * sets ** 1.6 * (0.8 + 0.4 * tex), SEA_LEVELS["sets"])
           + at_lufs(sub * (0.7 + 0.3 * slow), SEA_LEVELS["sub"])
           + at_lufs(cold * (0.5 + 0.5 * slow), SEA_LEVELS["cold"]))
    ev, timing = _memo(("sea", seed, nominal), lambda: _sea_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 36, order=2)
    y = S.filt_circ(y, "lshelf", 110, gain_db=-3.0)            # keep the weight, spend the level on the surf
    y = S.filt_circ(y, "lp", BED_LP, order=2)                  # air absorption over the water (see BED_LP)
    y, shift = rotate_quiet(master_mono(y, -20.0))
    return y, {"loopSamples": L, "rotation": shift, **swell_meta(timing, SEA_PHASE, SEA_WAVES, L, shift)}


# ============================================================================ amb_beach (loop)
# 4 swell crests = a 24 s loop. Gentle spilling waves sliding up the sand, one per crest, kept LOW in the bed
# (~8 dB under the rest) because the game adds sfx_wave_wash on the crests near the camera - the bed only has to
# carry the surf further along the beach. The children are a far, indistinct babble (the recognisable calls are
# the sfx_beach_kids one-shots), two far gulls, two far splashes, a warm breeze and a faint holiday crowd.
BEACH_WAVES = 4
BEACH_PHASE = 3.2
# (slot, jitter, size, approach)
BEACH_NEAR = [(0, +0.1, 0.5, 1.9), (1, -0.12, 0.42, 1.7), (2, +0.06, 0.58, 2.1), (3, -0.05, 0.38, 1.6)]
BEACH_MID = [(4.4, 0.45), (10.3, 0.5), (15.2, 0.4), (20.6, 0.5)]
# (t, call variant, pitch, closeness 0..1, lowpass Hz) - far over the water, part of the texture
BEACH_GULLS = ((6.6, 3, 0.96, 0.18, 2600), (17.9, 1, 1.06, 0.22, 2900))
# near surf ~8 dB lower than in v7.0 (it was the loudest layer by 7-9 dB): now level with the continuous surf and the
# far voices, the off-grid waves further along the beach (mid) stay 3.5 dB under it so the beat is the swell's.
BEACH_LEVELS = {"near": -28.0, "mid": -31.5, "kids": -28.0, "gulls": -32.0, "splash": -37.0,
                "surf": -28.0, "breeze": -33.0, "leaves": -38.5, "walla": -33.0}


def kid_voice(r, kind: str) -> np.ndarray:
    """Children playing: 'babble' phrase, 'laugh' (hi-hi-hi), 'squeal' (ee-YAA!), 'call' (o-maa~!),
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


def _beach_events(seed: int, nominal: float):
    """Length-independent event layers of amb_beach (memoised): gentle surf, far kids' babble, gulls, splashes.
    -> (mix, near-wave timing list)."""
    r = S.rng(seed + 1)
    nb = n_of(nominal + 12.0)
    lay = {k: np.zeros(nb) for k in ("near", "mid", "kids", "gulls", "splash")}
    timing = []
    for slot, jit, size, A in BEACH_NEAR:                  # small spilling waves sliding up the sand
        tw = BEACH_PHASE + slot * SWELL_P + jit
        b, w_, u = wave_times(size, A, 1.25)
        w = surf_wave(r, size, A, plunge=0.12, swash=1.25, retreat=1.2, shingle=0.0, foam=1.3, warm=0.5)
        place_wrap(lay["near"], tw - w_, distance(w, 0.15, verb=0.3, rt60=1.5), 1.0, nominal)
        timing.append((tw - (w_ - b), tw, tw + (u - w_), size))
    for tb, size in BEACH_MID:
        A = r.uniform(1.6, 2.2)
        w = surf_wave(r, size, A, plunge=0.1, swash=1.0, retreat=0.9, foam=0.8, warm=0.6)
        place_wrap(lay["mid"], tb - A, distance(w, 0.5, lp_min=1200.0, verb=0.6, rt60=2.0), 1.0, nominal)
    # children far down the beach: many short overlapping phrases at low, uneven levels (a texture, no single
    # voice stands out; the recognisable laughs / squeals / calls are the sfx_beach_kids one-shots)
    t = 0.3
    while t < nominal:
        place_wrap(lay["kids"], t, kid_voice(r, "babble"), r.uniform(0.3, 0.75), nominal)
        t += r.uniform(0.7, 1.9)
    kids = S.lp(lay["kids"], 2700, order=2)                 # distant: highs absorbed, outdoor smear
    lay["kids"] = I.verb_mono(kids, rt60=1.5, mix=0.6, tail=0.0, predelay=0.04, size=1.0, hi_cut=3800)[:nb]
    for t0 in (9.3, 19.9):                                 # far splashes of kids jumping in
        sp = distance(splash(r, r.uniform(0.4, 0.7)), 0.7, verb=0.7, rt60=1.6)
        place(lay["splash"], t0, norm(sp), r.uniform(0.7, 1.0))
    for t0, v, pitch, g, lpf in BEACH_GULLS:               # gulls far over the water
        y = gull_call(r, v, f_base={1: 1180.0, 2: 1100.0, 3: 1320.0}[v] * pitch, rasp=0.24)
        y = S.lp(y, lpf, order=2)
        y = I.verb_mono(y, rt60=2.0, mix=0.6 - 0.3 * g, tail=1.2, predelay=0.05, size=1.0, hi_cut=min(5000, lpf))
        place(lay["gulls"], t0, norm(y), 0.4 + 0.6 * g)
    return mix_layers(lay, BEACH_LEVELS), timing


def render_beach_amb(seed: int = 10200, loop_samples=None, nominal: float = BEACH_WAVES * SWELL_P):
    """Sunny Beach bed (mono loop): soft far surf, a warm breeze through the palms, a faint holiday crowd, plus the
    memoised events (gentle surf on sand on the swell grid, far children, gulls, far splashes)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    swell = S.periodic_curve(L, r, max(2, int(dur / 6)), max(3, int(dur / 2.5)), slope=0.9)
    surf = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 520.0) / 1.6) ** 2) / (1 + (f / 3000) ** 2))
    breeze_c = S.periodic_curve(L, r, 1, 5, slope=1.1)
    breeze = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 700.0) / 1.6) ** 2))
    leaves = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 3600.0) / 1.2) ** 2))
    rustle = S.periodic_curve(L, r, int(dur * 1.5), int(dur * 5), slope=0.4)
    walla = np.zeros(L)
    for layer in range(2):                                  # faint holiday crowd far up the beach
        sh = (lambda f, s=layer: sum(g / (1 + ((f - F * (1 + 0.07 * s)) / 300.0) ** 2)
                                     for F, g in ((600, 1.0), (1350, 0.7), (2600, 0.25))) / np.sqrt(np.maximum(f, 60)))
        fl = S.periodic_curve(L, r, int(dur * 1.5), int(dur * 4.5), slope=0.4)
        walla += unit(S.noise_fft(L, r, sh)) * (0.4 + 0.6 * fl ** 1.5)
    bed = (at_lufs(surf * (0.5 + 0.5 * swell), BEACH_LEVELS["surf"])
           + at_lufs(breeze * (0.4 + 0.6 * breeze_c), BEACH_LEVELS["breeze"])
           + at_lufs(leaves * (0.2 + 0.8 * breeze_c ** 2) * (0.6 + 0.4 * rustle), BEACH_LEVELS["leaves"])
           + at_lufs(walla, BEACH_LEVELS["walla"]))
    ev, timing = _memo(("beach", seed, nominal), lambda: _beach_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 40, order=2)
    y = S.filt_circ(y, "lp", BED_LP, order=2)
    y, shift = rotate_quiet(master_mono(y, -20.0))
    return y, {"loopSamples": L, "rotation": shift, **swell_meta(timing, BEACH_PHASE, BEACH_WAVES, L, shift)}


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
    surge *= (0.22 + 0.78 * np.clip(tt / pre, 0, 1) ** 2) * np.exp(-np.maximum(tt - pre, 0) / 0.05)
    surge[:n_of(0.004)] *= np.linspace(0.25, 1.0, n_of(0.004))   # starts audibly at once: nothing gets trimmed,
    #                                                               so cue 'impact' stays exactly at 0.20 s
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


# Swash variants (group sfx_wave_wash): 1 = medium wash, 2 = small quick lap, 3 = bigger wash with a longer run-up
# and a long fizzing backwash. Each file starts 0.1 s before the spilling crest folds; 'waterline' = the white water
# reaches the waterline (= Water.js shore cycle 0, when the crest line meets the sand) and 'upmost' = the run-up
# stops and the backwash starts (Water.js: 0.3 of the 6 s cycle = 1.8 s after the waterline; the sound's run-up
# fades out before the thin sheet on screen stops, so it turns back 1.0-1.4 s after the waterline).
WASH_A = 0.35                                              # approach inside surf_wave (the file starts at A - 0.1)
WASH = {1: dict(seed=10400, size=0.5, swash=1.0, retreat=0.33, plunge=0.05, foam=1.4, warm=0.3, rumble=0.25),
        2: dict(seed=10410, size=0.36, swash=0.95, retreat=0.3, plunge=0.0, foam=1.2, warm=0.35, rumble=0.18),
        3: dict(seed=10420, size=0.64, swash=1.08, retreat=0.33, plunge=0.12, foam=1.5, warm=0.25, rumble=0.32)}


def wash_cues(v: int) -> dict:
    """Cue times (s from the file start) of wash variant v, from the same formulas surf_wave uses."""
    p = WASH[v]
    b, w, u = wave_times(p["size"], WASH_A, p["swash"])
    off = WASH_A - 0.1
    return {"break": round(b - off, 3), "waterline": round(w - off, 3), "upmost": round(u - off, 3)}


def sfx_wave_wash(v: int = 1):
    """One wash on a sand beach: a small spilling wave folds over just off-screen, the foam rushes up the sand
    ('shhhhhh'), slows, and drains back with a fizzing hiss and a few sucking gurgles (cues: wash_cues)."""
    p = WASH[v]
    r = S.rng(p["seed"])
    w = surf_wave(r, p["size"], WASH_A, plunge=p["plunge"], swash=p["swash"], retreat=p["retreat"], shingle=0.0,
                  foam=p["foam"], warm=p["warm"], rumble=p["rumble"])
    _, _, u = wave_times(p["size"], WASH_A, p["swash"])
    d_bw = (2.2 + 2.2 * p["size"]) * p["retreat"]
    w = w[n_of(WASH_A - 0.1):n_of(u + d_bw)]               # crest about to fold .. backwash drained (no dead tail)
    w = I.verb_mono(w, rt60=0.9, mix=0.08, tail=0.2, predelay=0.015, size=0.8)
    return tail_fade(w, 0.55)


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


def sfx_splash(v):
    """Beach splashes. Hand splashes (group sfx_splash_beach, interchangeable, for splash_play): 1 = 'splish-splish'
    (both hands, second slap at 0.13 s), '1b' = one flat slap and a flick of spray, '1c' = three quick little
    paddles. By key only: 2 = jumping in feet-first 'sploosh', 3 = cannonball 'KA-BLOOMP' with a big spray."""
    r = S.rng(10500 + {"1b": 11, "1c": 12}.get(v, v))
    if v == 1:
        m = Mono(0.8)
        m.add(0.0, splash(r, 0.35, 0.1, 1.2), 1.0)
        m.add(0.13, splash(r, 0.25, 0.0, 1.3), 0.55)              # a second little slap of the other hand
        y = m.x
    elif v == "1b":
        m = Mono(0.7)
        m.add(0.0, splash(r, 0.4, 0.0, 1.1), 1.0)                 # flat palm slap
        m.add(0.07, splash(r, 0.18, 0.0, 1.4), 0.3)               # the flick of spray thrown forward
        y = m.x
    elif v == "1c":
        m = Mono(0.7)
        for tt, sz, g in ((0.0, 0.26, 0.85), (0.1, 0.3, 1.0), (0.215, 0.22, 0.6)):   # paddle-paddle-paddle
            m.add(tt, splash(r, sz, 0.05, 1.25), g)
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
    rate = 36.0 * (1 + 0.1 * smooth_noise(r, n, 5.0)) * (1 + 0.15 * np.clip(t / 0.08, 0, 1))
    ph = S.phase(rate, n)
    trill = np.sin(TAU * ph)
    # the pea blocks the jet once per turn: a deep, slightly pulsed level flutter (not a gentle tremolo), the pitch
    # dips while the jet is blocked, the tone gets buzzier (more harmonics) on each re-opening
    gate = (0.5 + 0.5 * np.sin(TAU * ph + 0.9)) ** 1.6
    semis = 0.1 - 0.9 * np.exp(-t / 0.018) + 0.42 * trill - 0.2 * gate   # centred on f while it sounds
    fr = f * 2 ** (semis / 12)
    tone = S.additive(fr, n, [(1, 1.0), (2, 0.14), (3, 0.05), (4, 0.015)], fmax=12000)
    buzz = S.additive(fr, n, [(2, 1.0), (3, 0.5)], fmax=12000) * (1 - gate) * 0.08
    am = 1 - 0.82 * gate
    breath = S.bp(r.standard_normal(n), f, 2.5) * 0.2 + S.hp(r.standard_normal(n), 5000) * 0.035
    env = S.env_adsr(n, 0.012, 0.05, 0.86, rel, gate=dur)
    return ((tone + buzz) * am + breath * (0.45 + 0.55 * am)) * env * vel


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
    """Inflatable vinyl beach ball landing: hollow springy 'boing' on F5 (membrane modes with a quick pitch drop,
    voiced high enough to carry on a phone speaker), a bright vinyl 'pock' (skin resonance ~1.6 kHz), and a light
    sand thud with scattering grains. Little weight below 400 Hz on purpose: small speakers drop it."""
    n = n_of(0.4)
    t = tax(n)
    f0 = float(S.midi_hz(77)) * (1 + 0.16 * np.exp(-t / 0.02))            # F5 after a springy drop
    p = S.phase(f0, n)
    y = np.zeros(n)
    for ratio, amp, tau in ((0.5, 0.15, 0.04), (1.0, 1.0, 0.075), (1.59, 0.55, 0.07), (2.14, 0.38, 0.06),
                            (2.65, 0.18, 0.035), (3.16, 0.09, 0.022)):
        y += amp * np.sin(TAU * ratio * p + r.uniform(0, TAU)) * np.exp(-t / tau)
    y *= np.clip(t / 0.002, 0, 1)
    y += S.modal(1620.0, n, [(1.0, 1.0, 0.022), (1.47, 0.5, 0.014), (2.3, 0.25, 0.008)], r) * 0.32   # vinyl 'pock'
    y += S.bp(r.standard_normal(n), 2400, 1.0) * S.env_exp(n, 0.004, 0.0004) * 0.5      # skin slap
    y += S.lp(r.standard_normal(n), 380, order=2) * S.env_exp(n, 0.025, 0.002) * 0.35 * sand   # sand thud
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
    modes = [(1.0, 1.0, 2.2), (1.0017, 0.45, 2.0), (2.67, 0.5, 1.0), (2.676, 0.2, 0.9), (4.13, 0.16, 0.45),
             (5.03, 0.2, 0.35), (6.9, 0.07, 0.18), (8.1, 0.05, 0.12)]
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
    crunch. 1-3 dry fine sand (group sfx_sand_step; 3 = with a quick toe scuff that is over by ~110 ms, so running
    steps 0.225 s apart never 'gallop'), 4-5 damp firm sand at the waterline (group sfx_sand_step_wet, 'thup')."""
    if v == 5:
        return damp_step2()
    r = S.rng(11100 + v)
    total = 0.32
    n = n_of(total)
    t = tax(n)
    damp = v == 4
    m = Mono(total)
    m.add(0.0, blip(120.0 if not damp else 140.0, 80.0, 0.1, 0.02, 0.02, attack=0.003), 0.16 if not damp else 0.2)
    k = n_of(0.16)
    m.add(0.0, S.lp(r.standard_normal(k), 900 if not damp else 700, order=2) * S.env_exp(k, 0.03 if not damp else 0.022,
                                                                                      0.004),
          0.4 if not damp else 0.6)
    grains = shaped(n, r, band(2100.0 if not damp else 1500.0, 2.4)) * churn(r, n, 60.0, 0.6)
    slide = env_ar(t, 0.004, 0.018, 0.045 if not damp else 0.03)
    y = grains * slide * (0.22 if not damp else 0.12)
    dens = (1400 if not damp else 500) * env_ar(t, 0.003, 0.01, 0.05)
    y += fizz(r, n, dens, 1200.0, 6500.0, nb=8, q=(1.5, 3.5)) * (0.16 if not damp else 0.08)
    if v == 3:                                              # toe scuffing the sand on the way out (short)
        y += shaped(n, r, band(2800.0, 2.0)) * env_ar(t, 0.055, 0.02, 0.014) * 0.11
    if damp:                                                # a faint squelch of wet sand
        m.add(0.012, bubble(r, 380.0, 0.05, 0.6), 0.08)
    y[:len(m.x)] += m.x[:n]
    y = S.lp(y, 7000)
    return y


def damp_step2():
    """Second damp-sand step (group sfx_sand_step_wet with 4): heel-then-ball 'thup-p' on firm wet sand, a thin
    film of water squeezed out (tiny hiss), no grain slide."""
    r = S.rng(11105)
    total = 0.28
    n = n_of(total)
    t = tax(n)
    m = Mono(total)
    m.add(0.0, blip(150.0, 85.0, 0.1, 0.02, 0.018, attack=0.003), 0.2)
    k = n_of(0.14)
    m.add(0.0, S.lp(r.standard_normal(k), 650, order=2) * S.env_exp(k, 0.02, 0.003), 0.55)
    m.add(0.045, S.lp(r.standard_normal(k), 900, order=2) * S.env_exp(k, 0.014, 0.002), 0.28)   # ball of the foot
    film = shaped(n, r, band(3600.0, 1.6)) * env_ar(t, 0.01, 0.02, 0.035) * 0.05             # water squeezed out
    dens = 400 * env_ar(t, 0.01, 0.01, 0.04)
    y = film + fizz(r, n, dens, 1500.0, 6000.0, nb=6, q=(1.5, 3.0)) * 0.07
    m.add(0.02, bubble(r, 430.0, 0.04, 0.6), 0.06)
    y[:len(m.x)] += m.x[:n]
    return S.lp(y, 7000)


# ============================================================================ children (one-shots)
KIDS = {1: ("laugh", 11201), 2: ("squeal", 11202), 3: ("call", 11203), 4: ("whee", 11204)}


def sfx_beach_kids(v: int):
    """Children playing on the beach, a little way off (group sfx_beach_kids): 1 = giggle 'hi-hi-hi-hi',
    2 = squeal 'ee-YAA!', 3 = call 'o-maa~!' (엄마~), 4 = 'wheee~'. The same cute sfx2 formant voices as the town,
    outdoors: a touch of air absorption and open-air smear."""
    kind, seed = KIDS[v]
    r = S.rng(seed)
    y = kid_voice(r, kind)
    y = S.lp(y, 6500, order=2)
    y = I.verb_mono(y, rt60=0.9, mix=0.16, tail=0.22, predelay=0.025, size=0.9, hi_cut=5500)
    return tail_fade(y, 0.2)


# ============================================================================ registry
SFX5 = {
    "sfx_wave_crash_1": lambda: sfx_wave_crash(1), "sfx_wave_crash_2": lambda: sfx_wave_crash(2),
    "sfx_wave_crash_3": lambda: sfx_wave_crash(3),
    "sfx_wave_wash": lambda: sfx_wave_wash(1), "sfx_wave_wash_2": lambda: sfx_wave_wash(2),
    "sfx_wave_wash_3": lambda: sfx_wave_wash(3),
    "sfx_splash_1": lambda: sfx_splash(1), "sfx_splash_1b": lambda: sfx_splash("1b"),
    "sfx_splash_1c": lambda: sfx_splash("1c"), "sfx_splash_2": lambda: sfx_splash(2),
    "sfx_splash_3": lambda: sfx_splash(3),
    "sfx_pool_splash": sfx_pool_splash,
    "sfx_lifeguard_whistle": sfx_lifeguard_whistle,
    "sfx_icecream_bell": sfx_icecream_bell,
    "sfx_beachball_bounce": sfx_beachball_bounce,
    "sfx_hotel_bell": sfx_hotel_bell,
    "sfx_sand_step_1": lambda: sfx_sand_step(1), "sfx_sand_step_2": lambda: sfx_sand_step(2),
    "sfx_sand_step_3": lambda: sfx_sand_step(3), "sfx_sand_step_4": lambda: sfx_sand_step(4),
    "sfx_sand_step_5": lambda: sfx_sand_step(5),
    "sfx_beach_kids_1": lambda: sfx_beach_kids(1), "sfx_beach_kids_2": lambda: sfx_beach_kids(2),
    "sfx_beach_kids_3": lambda: sfx_beach_kids(3), "sfx_beach_kids_4": lambda: sfx_beach_kids(4),
}
# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH5 = {
    "sfx_wave_crash_1": dict(punch=3, fout=0.1), "sfx_wave_crash_2": dict(punch=3, fout=0.1),
    "sfx_wave_crash_3": dict(punch=3, fout=0.1), "sfx_wave_wash": dict(punch=1, fout=0.15, lp=BED_LP),
    "sfx_wave_wash_2": dict(punch=1, fout=0.15, lp=BED_LP), "sfx_wave_wash_3": dict(punch=1, fout=0.15, lp=BED_LP),
    "sfx_splash_1": dict(punch=3, fout=0.04), "sfx_splash_1b": dict(punch=3, fout=0.04),
    "sfx_splash_1c": dict(punch=3, fout=0.04), "sfx_splash_2": dict(punch=3, fout=0.05),
    "sfx_splash_3": dict(punch=3, fout=0.06), "sfx_pool_splash": dict(punch=3, fout=0.06),
    "sfx_lifeguard_whistle": dict(punch=1, fout=0.03), "sfx_icecream_bell": dict(punch=2, fout=0.05),
    "sfx_beachball_bounce": dict(punch=3, fout=0.02), "sfx_hotel_bell": dict(punch=2, fout=0.06),
    "sfx_sand_step_1": dict(punch=4, fout=0.01), "sfx_sand_step_2": dict(punch=4, fout=0.01),
    "sfx_sand_step_3": dict(punch=4, fout=0.01), "sfx_sand_step_4": dict(punch=4, fout=0.01),
    "sfx_sand_step_5": dict(punch=4, fout=0.01),
    **{f"sfx_beach_kids_{i}": dict(punch=2, fout=0.04) for i in range(1, 5)},
}
LOOP_FUNCS = {"amb_sea_waves": "render_sea_waves", "amb_beach": "render_beach_amb"}


ONESHOT_LP = 16000.0  # one-shots roll off above 16 kHz (24 dB / oct): inaudible on phones, fewer Vorbis bytes
TAIL_DB = -40.0       # one-shots end where their 20 ms level falls this far under the loudest 20 ms ...
TAIL_FADE = 0.06      # ... with this much cos^2 fade-out after that point


def trim_tail(y, db: float = TAIL_DB, fade: float = TAIL_FADE) -> np.ndarray:
    """End a one-shot where its ring-out has fallen `db` under its loudest 20 ms window, then fade out over `fade` s.
    In the game every one-shot sits on an ambience bed (-33.5 LUFS); a tail 40 dB under the sound's peak is masked
    there, so the bytes go to the sounds instead (payload cap). Nothing before that point is touched (cues keep)."""
    y = np.asarray(y, dtype=float)
    w = n_of(0.02)
    nw = len(y) // w
    if nw < 4:
        return y
    e = 10 * np.log10((y[:nw * w].reshape(nw, w) ** 2).mean(axis=1) + 1e-20)
    above = np.nonzero(e > e.max() + db)[0]
    end = min(len(y), (int(above[-1]) + 1) * w + n_of(fade))
    if end >= len(y) - n_of(0.005):
        return y
    out = y[:end].copy()
    k = n_of(fade)
    out[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return out


def render(key: str) -> np.ndarray:
    """Same mastering chain as sfx.render .. sfx4.render: optional punch limiter -> synth.finish_sfx
    (high-pass, trim, fades, peak -1.5 dBFS) -> trim_tail (ring-out under -40 dB re the loudest 20 ms). A gentle
    roll-off above ONESHOT_LP (washes: BED_LP, like the beach bed they belong to) goes first."""
    y = np.asarray(SFX5[key](), dtype=float)
    opts = dict(FINISH5.get(key, {}))
    punch = opts.pop("punch", 0)
    y = S.lp(y, opts.pop("lp", ONESHOT_LP), order=2)
    if punch:
        y = S.hp(y, 30, order=2)
        y = S.limiter(y / max(S.peak(y), 1e-12), -float(punch), window_ms=3.0)
    return trim_tail(S.finish_sfx(y, peak_db=-1.5, **opts))


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
