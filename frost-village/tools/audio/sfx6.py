"""Frost Village - v8 'living city' sounds (CONTRACT_V8 section AE) by procedural synthesis (library + script).

Same toolkit, layering style and mastering as sfx.py ... sfx4.py (imported, never edited). Everything stays cute,
warm and family-friendly: sirens are rounded retro toys, the big fire is a cosy cartoon blaze, the scuffle is a
dust cloud of bonks and boings, nobody gets hurt.
  fire brigade  sfx_siren_fire (retro two-tone 'nee-naw' A4 / D5, loop), sfx_fire_alarm_bell (electric bell,
                two bursts), amb_fire_big (roar + crackle + snaps + flame flutter, loop), sfx_fire_flare ('FWOOMP'),
                sfx_hose_spray (water jet + splatter, loop), sfx_steam_hiss ('pssshhh' + sizzle + a last 'pff-pop'),
                sfx_collapse_soft (creak, crack, beams tumble 'donk-donk-donk' down an F-major arpeggio, dust 'poof',
                one late 'plink')
  rebuild       sfx_excavator (toy diesel + hydraulic whine, loop), sfx_demolish_crunch (bucket bite: clank, wood
                splinters, brick rubble pour, dust), amb_construction (distant hammering, saw, drill, clanks, reverse
                beeps, gravel, loop - no voices)
  bank          amb_bank (marble-hall murmur, soft footsteps on tile, a faint note counter, paper, loop - texture
                only), sfx_ticket_chime (extra: the queue display's 'ding-dong' C6 A5), sfx_coin_count (coins stacked, rising, 'ching'), sfx_stamp (rubber stamp 'THUNK' on a ledger),
                sfx_vault_door (wheel spin, three bolts, heavy swing, treasure 'ting')
  logistics     amb_warehouse (conveyor hum + roller rattle + boxes bumping + far reverse beeps + big hall, loop),
                sfx_forklift_beep (three friendly reverse beeps, C6), sfx_moving_truck (engine stops, air brake,
                roll-up door, ramp), sfx_box_drop (cardboard 'thup' + contents rattle; + _2 small box of tins, _3 big
                heavy box: group sfx_box), sfx_newspaper (grab, 'FWAP' unfold, crinkle)
  police        sfx_siren_police (gliding toy 'wee-oo' C5 - F5, loop), sfx_police_whistle (pea whistle 'pweet!
                pweeeeet!'), sfx_cuffs_click (toy cuffs ratchet + latch + chain jingle), sfx_comic_fight (cartoon
                dust-cloud scuffle: bonk, pow, biff, swish, boing, squeak, tiny 'hai!' 'ya!', loop)
  crowd         sfx_crowd_gasp ('h-oooh!' small crowd), sfx_crowd_cheer_small ('yay!' 'hoo-ray!', finger whistle,
                applause)
Musical sounds are in F major like bgm_village and the v1-v7 sfx.

Loops are built like ambience.py / sfx3.py / sfx4.py: continuous beds in the frequency domain (synth.noise_fft),
modulation curves with whole cycles over the loop (synth.periodic_curve), sustained oscillators re-tuned by a
fraction of a cent so they complete whole cycles over the loop (loop_freq), discrete events rendered past the end
and folded back (synth.fold_loop), circular filters / reverb / limiter, then the loop is rotated to start at its
quietest zero crossing (rotate_quiet). Every loop is periodic in its own length, so build_audio.fit_loop can
re-render it at any Vorbis block boundary; the expensive event layers are memoised and only re-folded.

Run:   python3 tools/audio/sfx6.py [key ...]        (no key = all)
       -> /tmp/fv_cache/audio6/<key>.wav  (mono 44.1 kHz float; sfx peak -1.5 dBFS, loops -20 LUFS)
Normally called through build_audio6.py.  Deterministic (each key has a fixed seed).
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
from ambience import _pop  # noqa: E402
from sfx import Mono, blip, bubble, burst, chime, coin_hit, mix, nsweep, puff, room, smooth_noise, soft_square, tax  # noqa: E402
from sfx2 import utter  # noqa: E402
from sfx3 import _babble  # noqa: E402
from sfx4 import (circ_tv, creak, delay_line, fold1, master_mono, norm, rotate_quiet, steel_clank,  # noqa: E402
                  tail_fade, unit)
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.environ.get("FV_AUDIO6_CACHE", "/tmp/fv_cache/audio6")


# ============================================================================ loop helpers
def loop_freq(f, L: int) -> np.ndarray:
    """Scale a (per-sample) frequency track by a fraction of a cent so its phase completes a whole number of
    cycles over L samples: a sustained oscillator then wraps seamlessly (sample L == sample 0)."""
    f = np.array(np.broadcast_to(np.asarray(f, dtype=float), (L,)), dtype=float)
    tot = f.sum() / SR
    return f * (max(1.0, round(tot)) / tot)


def loop_rate(hz: float, L: int) -> float:
    """Nearest LFO rate with a whole number of cycles over L samples."""
    return max(1, round(hz * L / SR)) * SR / L


def smooth_periodic(x, sec: float) -> np.ndarray:
    """Zero-phase gaussian smoothing of a periodic control track (std ``sec``)."""
    x = np.asarray(x, dtype=float)
    L = len(x)
    f = np.fft.rfftfreq(L, 1.0 / SR)
    return np.fft.irfft(np.fft.rfft(x) * np.exp(-0.5 * (TAU * f * sec) ** 2), L)


def circ_verb(y, rt60: float = 0.8, mix: float = 0.2, **kw) -> np.ndarray:
    """Mono loop + its own reverb tail wrapped around (render several periods, keep the last one)."""
    y = np.asarray(y, dtype=float)
    L = len(y)
    reps = 2 + int(np.ceil(rt60 * 1.2 / (L / SR)))
    wet = S.reverb(np.tile(y, reps), rt60=rt60, **kw).mean(axis=0)[(reps - 1) * L:]
    return y + mix * wet


def place(buf, t_samples: float, sig, g: float = 1.0, L: int | None = None):
    """Add sig at sample t. Loop layers pass L: an onset before 0 moves to the loop end (fold_loop then carries
    its tail across the wrap); otherwise its head is cropped."""
    i = int(round(t_samples))
    sig = np.asarray(sig, dtype=float)
    if i < 0 and L:
        i += L
    if i < 0:
        sig, i = sig[-i:], 0
    e = min(len(buf), i + len(sig))
    if e > i:
        buf[i:e] += g * sig[:e - i]


def finish_loop(y, meta: dict, target: float = -20.0):
    """master_mono (loudness + circular limiter) + rotate_quiet -> (loop, meta + rotation)."""
    y, shift = rotate_quiet(master_mono(y, target))
    return y, dict(meta, rotation=shift)


def far(x, lp_hz: float, mix: float = 0.6, rt60: float = 1.8, tail: float = 1.2):
    """Distance: low-pass + mostly reverb (mono)."""
    y = S.lp(np.asarray(x, float), lp_hz, order=2)
    return I.verb_mono(y, rt60=rt60, mix=mix, tail=tail, predelay=0.03, size=1.0, hi_cut=min(5000, lp_hz * 1.3))


def rate_shift(x, rate: float) -> np.ndarray:
    """Resample (pitch + speed) by ``rate`` with linear interpolation."""
    x = np.asarray(x, dtype=float)
    m = max(2, int(len(x) / rate))
    return np.interp(np.arange(m) * rate, np.arange(len(x)), x)


# ============================================================================ small voices / parts
def wood_knock(r, f: float, vel: float = 1.0, t60: float = 0.18) -> np.ndarray:
    """Hollow wooden beam / plank knock tuned to f (modal 1 : 2.43 : 3.95) + soft thud + click."""
    n = n_of(t60 + 0.08)
    y = S.modal(f, n, [(1, 1, t60), (2.43, 0.42, t60 * 0.5), (3.95, 0.2, t60 * 0.28), (5.7, 0.06, t60 * 0.15)], r,
                fmax=8000.0, attack=0.0008)
    th = blip(f * 0.55, f * 0.3, 0.12, 0.02, 0.04, attack=0.001)
    k = min(len(th), n)
    y[:k] += th[:k] * 0.5
    y[:n_of(0.006)] += burst(r, 0.006, 2600, 1.0, tau=0.001) * 0.35
    return y * vel


def paper_grains(r, dur: float, rate: float, lo: float = 1800.0, hi: float = 7000.0, env=None) -> np.ndarray:
    """Paper crinkle: a cloud of tiny band-passed crackles (rate per second, envelope [(t, g)])."""
    n = n_of(dur + 0.02)
    y = np.zeros(n)
    e = (lambda t: 1.0) if env is None else (lambda t: float(np.interp(t, [p[0] for p in env], [p[1] for p in env])))
    t = 0.0
    while True:
        t += r.exponential(1.0 / rate)
        if t >= dur:
            break
        k = n_of(0.006)
        g = e(t) * r.uniform(0.2, 1.0) ** 1.5
        place(y, t * SR, burst(r, 0.006, r.uniform(lo, hi), 1.4, tau=r.uniform(0.0004, 0.0016)), g)
    return y


def toy_squeak(r, f0: float = 1500.0, dur: float = 0.11) -> np.ndarray:
    """Squeaky rubber toy 'eek': rising-falling buzzy tone through a soft formant."""
    n = n_of(dur)
    u = np.linspace(0, 1, n)
    f = f0 * (0.85 + 0.35 * np.sin(np.pi * u) ** 0.8)
    x = 0.6 * S.saw(f, n) + 0.4 * S.sine(f, n)
    x = S.lp(S.peq(x, 2200, 6.0, 1.5), 4200)
    return x * S.env_pts([(0, 0), (0.01, 1), (dur * 0.6, 0.8), (dur, 0)], n)


def boing(r, f0: float = 190.0, dur: float = 0.42) -> np.ndarray:
    """Cartoon spring 'boiiing': twangy tone with a fast vibrato that slows, pitch sagging, rattly edge."""
    n = n_of(dur)
    t = tax(n)
    vib = 0.06 * np.exp(-t / 0.25) * np.sin(TAU * (22 - 8 * t / dur) * t)
    f = f0 * (1 + vib) * (1 - 0.08 * t / dur)
    x = S.additive(f, n, [(1, 1.0), (2, 0.45), (3, 0.3), (4, 0.15), (5, 0.08)], fmax=6000)
    x = x * S.env_exp(n, 0.16, 0.002)
    return S.peq(x, 900, 4.0, 1.2)


def bonk(r, f: float = 420.0, vel: float = 1.0) -> np.ndarray:
    """Comic 'bonk' on a noggin (a toy-hollow coconut tok with a pitch drop) - funny, not painful."""
    y = blip(f, f * 0.45, 0.16, 0.03, 0.045, attack=0.0008, harm=[(2, 0.25), (3, 0.08)])
    y = y + S.modal(f * 1.9, n_of(0.16), [(1, 1, 0.07), (1.6, 0.4, 0.04)], r, attack=0.0005) * 0.3
    y[:n_of(0.005)] += burst(r, 0.005, 2400, 1.0, tau=0.001) * 0.4
    return y * vel


def pow_puff(r, vel: float = 1.0) -> np.ndarray:
    """Muffled cartoon 'pow' inside a dust cloud: soft low thump + a puff of dust."""
    n = n_of(0.3)
    y = blip(150, 58, 0.3, 0.025, 0.07, attack=0.0015) * 0.6
    y = y + S.bp(r.standard_normal(n), 700, 0.8) * S.env_pts([(0, 0), (0.004, 1), (0.05, 0.4), (0.3, 0)], n) * 0.7
    y = y + S.bp(r.standard_normal(n), 1600, 0.9) * S.env_exp(n, 0.012, 0.0006) * 0.25
    return y * vel


def swish(r, dur: float = 0.16, f0: float = 500.0, f1: float = 900.0, mid: float = 2600.0) -> np.ndarray:
    """Quick arm / leg swish."""
    return nsweep(r, dur, f0, f1, 1.6, [(0, 0), (dur * 0.45, 1.0), (dur * 0.7, 0.5), (dur, 0)], mid=mid)


def cardboard(r, vel: float = 1.0, size: float = 1.0) -> np.ndarray:
    """Cardboard box set down / bumped: hollow 'thup' (box air cavity + panel), flap flutter."""
    n = n_of(0.3)
    body = blip(210 / size, 95 / size, 0.3, 0.02, 0.045, attack=0.0015)
    panel = S.bp(r.standard_normal(n), 560 / size ** 0.5, 1.1) * S.env_exp(n, 0.016, 0.0006)
    cav = S.modal(270 / size, n, [(1, 1, 0.05), (1.58, 0.4, 0.03), (2.6, 0.15, 0.02)], r, attack=0.001)
    y = body * 0.55 + unit(panel) * 0.3 + cav * 0.5
    for t0 in (0.025, 0.048):
        place(y, t0 * SR, S.bp(r.standard_normal(n_of(0.02)), 1300, 1.2) * S.env_exp(n_of(0.02), 0.004, 0.0005), 0.12)
    return y * vel


def beep(m: float, dur: float, vel: float = 1.0) -> np.ndarray:
    """Friendly reverse-alarm beep: rounded square + sine, soft edges."""
    x = soft_square(m, dur, vel, cutoff=3200.0) * 0.7
    n = len(x)
    s = S.sine(float(S.midi_hz(m)), n) * S.env_adsr(n, 0.005, 0.03, 0.9, 0.05, gate=dur)
    return x + 0.45 * s * vel


def clap_crowd(m: Mono, r, t0: float, t1: float, clappers: int, gain: float, fade_to: float = 0.4):
    """A few people clapping between t0 and t1 (each at their own tempo)."""
    for c in range(clappers):
        t = t0 + 0.04 * c + r.uniform(0, 0.05)
        while t < t1:
            g = gain * (1.0 - (1 - fade_to) * (t - t0) / max(t1 - t0, 1e-3)) * r.uniform(0.7, 1.0)
            m.add(t, I.clap_soft(0.8, r), g)
            t += 1.0 / r.uniform(4.6, 6.2)


# ============================================================================ sirens (loops)
def render_siren_fire(seed: int = 10100, loop_samples=None, nominal: float = 2.0, cycles: int = 2):
    """Fire engine: retro two-tone 'nee-naw' (high D5 / low A4, a fourth apart - the classic two-tone interval,
    both notes in F major), 0.5 s per note. Two slightly detuned compressor-horn voices (saw + pulse, nasal
    horn formant ~1.15 kHz, everything above ~2.5 kHz rolled off so it is round, not piercing), a 12 ms
    portamento + a small spin-up scoop at each change, gentle vibrato, valve dip, a little street slap.
    Two full cycles per loop; any loop length is seamless (whole cycles of every oscillator)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    t = np.arange(L) / SR
    period = L / cycles / SR
    u = (np.arange(L) * cycles / L) % 1.0
    hi = (u < 0.5).astype(float)
    semis = smooth_periodic(69.0 + 5.0 * hi, 0.012)
    since = (u % 0.5) * period
    semis = semis - 0.3 * np.exp(-since / 0.03)
    semis = semis + 0.05 * np.sin(TAU * loop_rate(5.4, L) * t)
    f = S.midi_hz(semis)
    x = np.zeros(L)
    for cents, g in ((0.0, 1.0), (8.0, 0.6)):
        ff = loop_freq(f * 2 ** (cents / 1200.0), L)
        ph = r.random()
        x += g * (0.55 * S.saw(ff, L, ph) + 0.45 * S.square(ff, L, 0.36, ph))
    dip = 1.0 - 0.22 * np.exp(-since / 0.018)
    y = x * smooth_periodic(dip, 0.003)
    y = S.filt_circ(y, "lp", 2500, 0.7, order=2)
    y = S.filt_circ(y, "peak", 1150, 1.3, 5.0)
    y = S.filt_circ(y, "peak", 560, 1.0, 2.5)
    y = S.filt_circ(y, "hp", 260, order=2)
    air = S.noise_fft(L, r, lambda fr: np.exp(-0.5 * (np.log2(fr / 1300.0) / 0.8) ** 2))
    y = unit(y) + 0.05 * unit(air)
    y = circ_verb(y, rt60=0.6, mix=0.12, hf_rt60=0.3, predelay=0.012, size=0.6)
    return finish_loop(y, {"loopSamples": L, "cycles": cycles, "notes": ["D5", "A4"]})


def render_siren_police(seed: int = 10200, loop_samples=None, nominal: float = 2.4, cycles: int = 4):
    """Police car: a gliding toy 'wee-oo' (C5 -> F5 -> C5, a fourth, 0.6 s per cycle): quick ease-out rise,
    a short top, a slower fall. Rounder and lighter than the fire engine (triangle + soft square, horn formant
    ~1.4 kHz), with a soft sub-octave so it still sounds friendly on phone speakers. Loops seamlessly."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    t = np.arange(L) / SR
    u = (np.arange(L) * cycles / L) % 1.0
    rise = np.sin(np.clip(u / 0.24, 0, 1) * np.pi / 2)
    fall = 0.5 + 0.5 * np.cos(np.clip((u - 0.34) / 0.66, 0, 1) * np.pi)
    w = np.where(u < 0.34, rise, fall)
    w = smooth_periodic(w, 0.006)
    semis = 72.0 + 5.0 * w + 0.04 * np.sin(TAU * loop_rate(6.0, L) * t)
    f = loop_freq(S.midi_hz(semis), L)
    ph = r.random()
    x = 0.5 * S.tri(f, L) + 0.32 * S.square(f, L, 0.5, ph) + 0.08 * S.sine(loop_freq(f * 0.5, L), L)
    x2 = S.tri(loop_freq(f * 2 ** (6 / 1200.0), L), L)
    y = (x + 0.35 * x2) * (0.82 + 0.18 * w)
    y = S.filt_circ(y, "lp", 3000, 0.7, order=2)
    y = S.filt_circ(y, "peak", 1400, 1.2, 4.0)
    y = S.filt_circ(y, "hp", 220, order=2)
    y = circ_verb(unit(y), rt60=0.55, mix=0.12, hf_rt60=0.3, predelay=0.012, size=0.6)
    return finish_loop(y, {"loopSamples": L, "cycles": cycles, "notes": ["C5", "F5"]})


# ============================================================================ fire
_MEMO = {}


def _memo(key, fn):
    if key not in _MEMO:
        _MEMO[key] = fn()
    return _MEMO[key]


def _fire_events(seed: int, nominal: float):
    """Length-independent crackle layer of amb_fire_big (memoised; times as fractions of the loop)."""
    r = S.rng(seed + 1)
    ev = []
    t = 0.0
    while True:                                          # crackles: ticks, cracks, a few snaps
        t += r.exponential(1 / 11.0)
        if t >= nominal:
            break
        u = r.random()
        size = 2 if u < 0.05 else (1 if u < 0.3 else 0)
        ev.append((t / nominal, _pop(r, size) * (1.4 if size else 1.0), 1.0))
    t = 0.0
    while True:                                          # micro crackle
        t += r.exponential(1 / 40.0)
        if t >= nominal:
            break
        ev.append((t / nominal, _pop(r, 0), 0.35))
    for t0 in (1.3, 4.6, 7.1):                           # a log shifting: woody knock + crunch
        k = wood_knock(r, r.uniform(150, 210), 0.8, 0.12)
        k = S.lp(k, 2500)
        ev.append((t0 / nominal, k, 0.22))
        for _ in range(5):
            ev.append(((t0 + r.uniform(0.01, 0.12)) / nominal, _pop(r, 1), 0.6))
    for t0 in (2.7, 6.2):                                # a cosy 'fwoosh' as the flames lick up
        d = 1.1
        w = nsweep(r, d, 260, 700, 0.8, [(0, 0), (0.35, 1.0), (0.6, 0.7), (d, 0)], mid=1100)
        ev.append((t0 / nominal, S.lp(w, 2000), 0.5))
    return ev


# polish (critic: the bed vanished on phone speakers): crackle +6 dB, flame flutter x2, a 1.5 kHz flame 'tongue',
# roar shelved -3.5 dB below 150 Hz -> phone loss <= 6 dB, at least as loud as v1 amb_fire on a phone.
FIRE_MIX = {"crackle": 1.3, "flame": 0.13, "lick": 0.022, "hiss": 0.016}


def render_fire_big(seed: int = 10300, loop_samples=None, nominal: float = 8.0):
    """A building on fire, cartoon-cosy (mono loop): deep warm roar breathing slowly, flames fluttering
    (mid band modulated at 5-20 Hz), a soft hiss, dense wood crackle with a few bright snaps, logs shifting,
    two 'fwoosh' licks per loop. Big but rounded: hardly anything above 6 kHz, no screaming highs."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    slow = S.periodic_curve(L, r, 1, 5)
    breath = S.periodic_curve(L, r, 2, 9, slope=0.8)
    flick = S.periodic_curve(L, r, int(nominal * 5), int(nominal * 20), slope=0.5)
    roar = unit(S.noise_fft(L, r, lambda f: 1.0 / np.maximum(f, 35) ** 0.8 / (1 + (f / 380.0) ** 2.5)))
    roar = S.filt_circ(roar, "lshelf", 150, 0.7, -3.5)          # polish: less sub-rumble (lost on phones anyway)
    flame = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 850.0) / 0.9) ** 2)))
    flame = unit(circ_tv(flame, "lp", 900 + 900 * flick, 0.7))
    lick = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 1500.0) / 0.6) ** 2)))   # flame 'tongue'
    hiss = unit(S.noise_fft(L, r, lambda f: (f > 2200) / (1 + (f / 6500.0) ** 4)))
    bed = roar * 0.25 * (0.55 + 0.3 * slow + 0.3 * breath ** 1.5) + \
        flame * FIRE_MIX["flame"] * (0.2 + 0.8 * flick ** 2) * (0.6 + 0.4 * slow) + \
        lick * FIRE_MIX["lick"] * (0.1 + 0.9 * flick ** 3) + \
        hiss * FIRE_MIX["hiss"] * (0.5 + 0.5 * flick)
    ev = _memo(("fire", seed, nominal), lambda: _fire_events(seed, nominal))
    buf = np.zeros(L + n_of(1.5))
    for u, sig, g in ev:
        place(buf, u * L, sig, g * (0.6 + 0.4 * slow[min(L - 1, int(u * L))]), L)
    y = bed + FIRE_MIX["crackle"] * fold1(buf, L)
    y = S.filt_circ(y, "hp", 38, order=2)
    y = S.filt_circ(y, "hshelf", 5000, 0.7, -6.0)
    y = S.filt_circ(y, "lp", 6500)                               # snaps stay rounded
    return finish_loop(y, {"loopSamples": L})


def sfx_fire_flare():
    """Flames burst out of a window: 'FWOOMP!' - low soft thump, a rising roar whoosh, then a shower of
    crackles settling. Big but round (cartoon), cues: flare 0."""
    r = S.rng(10400)
    m = Mono(1.8)
    m.add(0.0, blip(115, 42, 0.6, 0.06, 0.14, attack=0.006), 0.8)
    m.add(0.0, puff(r, 1.1, 480, [(0, 0), (0.025, 1.0), (0.25, 0.6), (0.6, 0.25), (1.1, 0)]), 0.65)
    w = nsweep(r, 1.0, 220, 900, 0.7, [(0, 0), (0.05, 1.0), (0.3, 0.7), (1.0, 0)], mid=1400)
    m.add(0.0, S.lp(w, 3000), 0.9)
    t = 0.04
    while t < 1.5:
        g = np.exp(-(t - 0.04) / 0.45)
        size = 1 if r.random() < 0.25 else 0
        m.add(t, _pop(r, size), 0.9 * g * (1.6 if size else 1.0))
        t += r.exponential(1 / 28.0)
    y = S.shelf_hi(m.x, 5000, -4.0)
    y = room(y, 0.7, 0.12, 0.3, 0.8)
    return tail_fade(y, 0.3)


def _hose_events(seed: int, nominal: float):
    r = S.rng(seed + 1)
    ev = []
    t = 0.0
    while True:                                          # droplets splattering on the wall / snow
        t += r.exponential(1 / 260.0)
        if t >= nominal:
            break
        d = r.uniform(0.004, 0.012)
        ev.append((t / nominal, burst(r, d, r.uniform(700, 3800), 1.3, tau=d / 4), r.uniform(0.15, 1.0) ** 2))
    t = 0.0
    while True:                                          # bigger splats / gloops
        t += r.exponential(1 / 9.0)
        if t >= nominal:
            break
        ev.append((t / nominal, bubble(r, r.uniform(350, 900), r.uniform(0.03, 0.06), 0.9), 0.5))
        ev.append((t / nominal, S.lp(burst(r, 0.04, 700, 0.8, tau=0.01), 2000), 0.6))
    return ev


HOSE_MIX = {"jet": 0.126, "wash": 0.17, "splat": 0.3}


def render_hose_spray(seed: int = 10500, loop_samples=None, nominal: float = 2.4):
    """Fire hose spraying (mono loop): the jet's airy 'shhhh' (wide band around 2.5 kHz, gently swaying as the
    nozzle moves), water drumming on the target (dense droplet splatter + a few gloops), the pump's low
    rumble. Soft top end: a friendly garden-hose-sized giant."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    sway = S.periodic_curve(L, r, 1, 4)
    flut = S.periodic_curve(L, r, int(nominal * 4), int(nominal * 12), slope=0.6)
    jet = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 2500.0) / 1.4) ** 2)))
    jet = unit(circ_tv(jet, "bp", 1900 + 1400 * sway, 0.5))
    wash = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 700.0) / 1.0) ** 2)))
    rum = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 120.0) ** 2) / np.sqrt(np.maximum(f, 30))))
    # polish (critic: 53 % of the energy in 2-5 kHz): jet -4 dB, water hitting the wall (wash, splats, gloops) +3 dB
    bed = jet * HOSE_MIX["jet"] * (0.85 + 0.15 * flut) + wash * HOSE_MIX["wash"] * (0.6 + 0.4 * flut) + rum * 0.05
    ev = _memo(("hose", seed, nominal), lambda: _hose_events(seed, nominal))
    buf = np.zeros(L + n_of(0.3))
    for u, sig, g in ev:
        place(buf, u * L, sig, g, L)
    y = bed + HOSE_MIX["splat"] * fold1(buf, L)
    y = S.filt_circ(y, "peak", 1000, 0.8, 2.0)
    y = S.filt_circ(y, "hp", 60, order=2)
    y = S.filt_circ(y, "lp", 6000)
    return finish_loop(y, {"loopSamples": L})


def sfx_steam_hiss():
    """The fire goes out: a big soft 'PSSSHHHhhh' (hiss sweeping down 5.5 -> 2 kHz), sizzle crackles fading,
    a few bubbles, and a tiny last 'pff-pop' (cartoon full stop). cues: hiss 0, pop 1.95."""
    r = S.rng(10600)
    d = 2.1
    n = n_of(d)
    fc = 5500 * (2000 / 5500) ** (np.linspace(0, 1, n) ** 0.7)
    hiss = S.tv_filter(r.standard_normal(n), "bp", fc, 0.8)
    hiss = unit(hiss) * S.env_pts([(0, 0), (0.025, 1.0), (0.45, 0.8), (1.2, 0.35), (d, 0)], n)
    m = Mono(2.6)
    m.add(0.0, hiss, 0.3)
    m.add(0.0, puff(r, 1.4, 900, [(0, 0), (0.02, 1), (0.4, 0.4), (1.4, 0)]), 0.25)
    t = 0.0
    while t < 1.6:
        m.add(t, _pop(r, 0), 0.55 * np.exp(-t / 0.5))
        t += r.exponential(1 / 45.0)
    for _ in range(9):
        t0 = r.uniform(0.1, 1.2)
        m.add(t0, bubble(r, r.uniform(500, 1300), r.uniform(0.03, 0.06), 0.8), 0.08 * np.exp(-t0 / 0.8))
    m.add(1.95, puff(r, 0.12, 2500, [(0, 0), (0.01, 1), (0.12, 0)]), 0.12)
    m.add(2.01, bubble(r, 760, 0.07, 1.4, tau=0.02), 0.22)
    y = S.shelf_hi(m.x, 7000, -6.0)
    y = room(y, 0.5, 0.08, 0.2, 0.7)
    return tail_fade(y, 0.15)


def sfx_collapse_soft():
    """A burnt shell settles (cute, no violence): a long creak, a woody crack, three beams tumble down
    'donk - donk - donk' tuned down an F-major arpeggio (C4 A3 F3) with little bounces, a soft heavy 'flumph',
    a pour of small rubble, a dust 'poof' - and, after a beat, one last tiny 'plink'.
    cues: creak 0, crack 0.42, donk1 0.6, donk2 0.84, donk3 1.06, flumph 1.22, plink 2.05."""
    r = S.rng(10700)
    m = Mono(2.8)
    c = creak(r, 0.5, [(0, 14), (0.3, 30), (0.5, 46)], res=((300, 4.0, 1.0), (700, 5.0, 0.6), (1500, 6.0, 0.25)),
              env_pts=[(0, 0), (0.1, 0.6), (0.4, 1.0), (0.5, 0.2)])
    m.add(0.0, norm(c), 0.28)
    m.add(0.42, _pop(r, 2), 0.9)
    m.add(0.42, wood_knock(r, 520, 0.5, 0.06), 0.25)
    # polish (phones): a dry 1-2 kHz woody 'krak' on the crack
    m.add(0.42, S.bp(r.standard_normal(n_of(0.06)), 1500, 1.1) * S.env_exp(n_of(0.06), 0.008, 0.0004), 0.35)
    m.add(0.425, wood_knock(r, 1180, 0.7, 0.05), 0.22)
    for t0, note, v in ((0.6, "C4", 1.0), (0.84, "A3", 0.92), (1.06, "F3", 0.95)):
        f = float(S.midi_hz(S.note(note)))
        m.add(t0, wood_knock(r, f, v, 0.22), 0.42)
        m.add(t0, wood_knock(r, 2 * f, v, 0.12), 0.3)                    # octave 'tok': the arpeggio reads on phones
        m.add(t0 + 0.075, wood_knock(r, f * 1.01, v * 0.4, 0.12), 0.3)
        m.add(t0 + 0.075, wood_knock(r, 2.02 * f, v * 0.4, 0.07), 0.14)
        m.add(t0, puff(r, 0.18, 1200, [(0, 0), (0.005, 1), (0.18, 0)]), 0.16)
    m.add(1.22, blip(95, 40, 0.5, 0.05, 0.12, attack=0.004), 0.55)
    m.add(1.22, puff(r, 0.9, 420, [(0, 0), (0.02, 1.0), (0.3, 0.5), (0.9, 0)]), 0.4)
    m.add(1.22, cardboard(r, 1.0, 0.6), 0.35)                            # hollow mid 'flumph' body (~350-900 Hz)
    t = 1.25
    while t < 1.95:                                      # rubble pour
        g = np.exp(-(t - 1.25) / 0.3)
        m.add(t, wood_knock(r, r.uniform(500, 1400), r.uniform(0.3, 1.0), 0.04), 0.12 * g)
        t += r.exponential(1 / 30.0)
    m.add(1.25, puff(r, 1.2, 1500, [(0, 0), (0.08, 1.0), (0.5, 0.45), (1.2, 0)]), 0.18)   # dust poof
    m.add(2.05, wood_knock(r, 1568.0, 0.6, 0.05), 0.2)                                       # 'plink' (G6)
    y = S.lp(m.x, 7000)
    y = room(y, 0.7, 0.12, 0.3, 0.8)
    return tail_fade(y, 0.25)


# ============================================================================ demolition / construction
# polish (critic: 95.8 % below 300 Hz, phone loss -17.6 dB): hydraulic whine 0.07 -> EXC_MIX + its 2nd harmonic,
# 1.1-2.3 kHz track-link rattle on the firing grid, sub shelved -3 dB, low-pass 4 kHz.
EXC_MIX = {"whine": 0.36, "links": 0.18, "chug": 0.9}


def render_excavator(seed: int = 10800, loop_samples=None, nominal: float = 2.0):
    """Toy excavator at work (mono loop): a chunky diesel 'chug' (4-stroke firing ~9.5 Hz, deep pipe tone,
    harmonic hum locked to it), the hydraulic pump whine rising and falling as the arm moves (one cycle per
    loop), and a soft track / bucket clank twice per loop. Play with rate 0.85 (idle) .. 1.15 (digging)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    k = max(2, int(round(dur * 9.5)))
    P = L / k
    ff = SR / P
    ph = 0.35 + 0.3 * (((L // 64) * 0.6180339887) % 1.0)
    buf = np.zeros(L + n_of(0.4))
    for i in range(k):
        g = (1.0 if i % 2 == 0 else 0.86) * (1 + 0.06 * r.standard_normal())
        n = n_of(0.09)
        pop = S.lp(r.standard_normal(n), 420, order=2) * S.env_exp(n, 0.009, 0.001)
        f1 = 68.0 * (1 + 0.015 * r.standard_normal())
        tone = S.modal(f1, n, [(1, 1, 0.07), (2.05, 0.5, 0.04), (3.1, 0.22, 0.02)], r, attack=0.0015)
        chug = S.bp(r.standard_normal(n), 420, 1.2) * S.env_exp(n, 0.014, 0.001)          # polish: 300 -> 420 Hz
        place(buf, (i + ph) * P + r.normal(0, 0.0008) * SR, pop * 0.9 + tone * 1.2 + chug * EXC_MIX["chug"], g, L)
    y = fold1(buf, L)
    t = np.arange(L) / SR
    hum = S.additive(ff, L, [(h, 1.0 / (1 + ((h * ff - 230) / 150) ** 2)) for h in range(1, 40)], fmax=4000)
    arm = 0.5 - 0.5 * np.cos(TAU * t / dur)
    whine_f = loop_freq(560.0 * (1 + 0.22 * arm), L)
    whine = S.sine(whine_f, L) + 0.5 * S.sine(loop_freq(whine_f * 2.0, L), L)
    y = unit(y) + 0.3 * unit(hum) + EXC_MIX["whine"] * whine * (0.3 + 0.7 * arm)
    rat = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 1300.0) / 0.8) ** 2))
    y = y + 0.06 * unit(rat) * (0.5 + 0.5 * np.cos(TAU * ff * (t - ph / ff)) ** 2)
    links = np.zeros(L + n_of(0.1))                                         # polish: track links 'tikka-tikka'
    for i in range(2 * k):                                                  # two per firing -> whole cycles per loop
        place(links, (i * 0.5 + ph + 0.27) * P + r.normal(0, 0.0012) * SR,
              S.hp(steel_clank(r, r.uniform(1150, 2300), 0.5, 0.035), 700, order=2),
              r.uniform(0.5, 1.0) * (0.7 + 0.3 * arm[int(i * P / 2) % L]), L)
    y = y + EXC_MIX["links"] * unit(fold1(links, L))
    cl = np.zeros(L + n_of(0.5))
    for u in (0.27, 0.77):
        place(cl, u * L, steel_clank(r, 280, 0.6, 0.2), 0.25, L)
    y = y + fold1(cl, L)
    y = S.filt_circ(y, "hp", 45, order=2)
    y = S.filt_circ(y, "lshelf", 130, 0.7, -5.0)                           # polish: less sub (lost on phones)
    y = S.filt_circ(y, "peak", 380, 0.9, 3.0)
    y = S.filt_circ(y, "peak", 1100, 0.9, 2.5)
    y = S.filt_circ(y, "lp", 4000)                                          # toy: nothing sharp
    return finish_loop(y, {"loopSamples": L, "firings": k, "firingHz": round(ff, 3)})


def sfx_demolish_crunch():
    """Excavator bucket bites into a burnt wall: teeth clank, wood splinters, brick rubble pours down, a low
    thud and a dust puff. Chunky but soft-edged. cues: bite 0, pour 0.18."""
    r = S.rng(10900)
    m = Mono(2.0)
    m.add(0.0, steel_clank(r, 230, 1.0, 0.25), 0.35)
    m.add(0.0, blip(140, 48, 0.35, 0.03, 0.08, attack=0.002), 0.7)
    for _ in range(9):                                   # splinters
        t0 = r.gamma(2.0, 0.04)
        m.add(t0, _pop(r, 2), r.uniform(0.6, 1.1))
        m.add(t0, wood_knock(r, r.uniform(300, 700), 0.5, 0.05), 0.15)
    t = 0.18
    while t < 1.3:                                       # rubble pour (bricks, charcoal chunks)
        g = np.exp(-(t - 0.18) / 0.35)
        m.add(t, wood_knock(r, r.uniform(380, 1100), r.uniform(0.4, 1.0), 0.05), 0.18 * g)
        if r.random() < 0.3:
            m.add(t, burst(r, 0.02, r.uniform(1500, 3500), 1.0, tau=0.004), 0.12 * g)
        t += r.exponential(1 / 34.0)
    m.add(0.2, puff(r, 1.0, 380, [(0, 0), (0.03, 1), (0.4, 0.5), (1.0, 0)]), 0.45)
    m.add(0.3, puff(r, 1.2, 1600, [(0, 0), (0.1, 1), (0.5, 0.4), (1.2, 0)]), 0.12)
    y = S.lp(m.x, 6500)
    y = room(y, 0.6, 0.1, 0.25, 0.8)
    return tail_fade(y, 0.25)


def _drill(r, dur: float = 0.8) -> np.ndarray:
    """Cordless drill 'rrrrr-rrr': motor whine with speed ramps + gear buzz + bit chatter."""
    n = n_of(dur)
    t = tax(n)
    sp = np.interp(t, [0, 0.08, dur * 0.45, dur * 0.55, dur * 0.62, dur - 0.08, dur], [0, 1, 1, 0.6, 1, 1, 0])
    f = 180 + 520 * sp
    x = S.additive(f, n, [(1, 1.0), (2, 0.6), (3, 0.4), (5, 0.2), (7, 0.1)], fmax=6000)
    chat = S.bp(r.standard_normal(n), 2200, 1.2) * (0.5 + 0.5 * np.sin(TAU * S.phase(f / 4, n)))
    return (x * 0.6 + unit(chat) * 0.15) * np.clip(sp * 1.5, 0, 1)


def _construction_events(seed: int, nominal: float):
    import sfx as V1
    import sfx2 as V2
    r = S.rng(seed + 1)
    k9 = nominal / 9.0                                  # times below were laid out for 9 s
    buf = np.zeros(n_of(nominal + 4.0))
    for t0, cnt, v, step in ((0.4, 5, 1, 0.42), (3.9, 4, 3, 0.36), (6.6, 6, 2, 0.4)):      # hammering
        for i in range(cnt):
            h = V2.sfx_hammer(v if i % 3 else (v % 3) + 1)
            place(buf, (t0 * k9 + i * step + r.normal(0, 0.012)) * SR, far(norm(h), 4200, 0.45, 1.2), 0.16 * r.uniform(0.75, 1.0))
    saw = V1.sfx_saw()                                                                        # hand saw
    place(buf, 2.1 * k9 * SR, far(norm(saw), 3800, 0.5, 1.2), 0.09)
    place(buf, 5.3 * k9 * SR, far(norm(_drill(r, 0.75)), 4000, 0.4, 1.0), 0.07)                      # drill
    place(buf, 8.4 * k9 * SR, far(norm(_drill(r, 0.5)), 4000, 0.4, 1.0), 0.05)
    for t0, f in ((1.6, 330), (4.8, 420), (7.7, 290)):                                        # steel clanks
        place(buf, t0 * k9 * SR, far(steel_clank(r, f, 1.0, 0.35), 4500, 0.5, 1.5), 0.12)
    for i in range(3):                                                                        # far reverse beeps
        place(buf, (2.9 * k9 + i * 0.5) * SR, far(beep(84, 0.22, 1.0), 3000, 0.7, 1.6), 0.05)
    # polish: no worker calls in the bed (an identifiable voice repeated every 8 s); the game adds audio2
    # sfx_chatter_lo / sfx_hammer at random 6-20 s intervals instead.
    for t0 in (1.0, 5.9):                                                                      # gravel shovelled
        g = np.zeros(n_of(0.5))
        tt = 0.0
        while tt < 0.35:
            place(g, tt * SR, wood_knock(r, r.uniform(700, 1800), r.uniform(0.3, 1.0), 0.03), 0.3)
            tt += r.exponential(1 / 60.0)
        place(buf, t0 * k9 * SR, far(g, 4000, 0.5, 1.2), 0.08)
    return buf


def render_construction(seed: int = 11000, loop_samples=None, nominal: float = 8.0):
    """Building site across the street (mono loop): hammering in three bursts, a hand saw, a cordless drill,
    steel clanks, a far dump truck's reverse beeps, gravel being shovelled, over a low distant engine rumble and a
    light breeze. No voices (the game adds chatter at random times)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    rum = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 150.0) ** 2) / np.maximum(f, 30) ** 0.5))
    breeze = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 600.0) / 1.5) ** 2)))
    bed = rum * 0.035 * (0.7 + 0.3 * S.periodic_curve(L, r, 1, 4)) + breeze * 0.012 * (0.4 + 0.6 * S.periodic_curve(L, r, 1, 3))
    ev = _memo(("construction", seed, nominal), lambda: _construction_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 45, order=2)
    return finish_loop(y, {"loopSamples": L})


# ============================================================================ bank
def counting_machine(r, dur: float = 0.8) -> np.ndarray:
    """Banknote counter 'brrrrrrt': notes flicking past at ~32 per second (paper ticks), motor whine, end clack."""
    n = n_of(dur + 0.1)
    y = np.zeros(n)
    t = tax(n)
    sp = np.interp(t, [0, 0.05, dur - 0.06, dur, dur + 0.1], [0, 1, 1, 0, 0])
    ph = np.cumsum(32.0 * sp) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1
    for i in idx:
        place(y, i, burst(r, 0.006, r.uniform(2500, 4200), 1.2, tau=0.0012), r.uniform(0.5, 1.0))
    mot = S.additive(110 + 60 * sp, n, [(1, 0.5), (2, 1.0), (3, 0.5), (4, 0.3), (6, 0.15)], fmax=3000) * sp
    y = y * 0.6 + mot * 0.1
    place(y, (dur - 0.02) * SR, burst(r, 0.02, 1800, 1.0, tau=0.004), 0.5)
    return y


def heel_step(r, vel: float = 1.0) -> np.ndarray:
    """Shoe on a polished stone floor: click + soft knock."""
    n = n_of(0.08)
    y = S.modal(r.uniform(1700, 2600), n, [(1, 1, 0.025), (1.7, 0.4, 0.015)], r, attack=0.0003) * 0.4
    y += burst(r, 0.08, 900, 0.8, tau=0.006) * 0.4
    return y * vel


def _bank_events(seed: int, nominal: float):
    import sfx as V1
    r = S.rng(seed + 1)
    k9 = nominal / 9.0                                  # times below were laid out for 9 s
    buf = np.zeros(n_of(nominal + 4.0))
    for t0, cnt, step, g in ((0.5, 7, 0.52, 0.7), (5.2, 6, 0.48, 0.55)):             # people crossing the hall
        for i in range(cnt):
            env = np.sin(np.pi * (i + 0.5) / cnt) ** 1.2
            place(buf, (t0 * k9 + i * step + r.normal(0, 0.01)) * SR, S.lp(heel_step(r, r.uniform(0.7, 1.0)), 4000),
                  0.05 * g * env)
    place(buf, 1.6 * k9 * SR, S.lp(counting_machine(r, 0.7), 2500), 0.03)              # a faint note counter
    for t0 in (2.5, 7.6):                                                              # paper shuffle
        place(buf, t0 * k9 * SR, paper_grains(r, 0.4, 90, env=[(0, 0.2), (0.1, 1), (0.4, 0)]), 0.025)
    # polish: no ticket chime / stamps / coin / voices in the bed (they repeated every 8 s while the queue did
    # something else); the game plays sfx_ticket_chime, sfx_stamp, sfx_coin_count, audio2 sfx_chatter_lo on events.
    _ = V1
    return buf


def render_bank(seed: int = 11100, loop_samples=None, nominal: float = 8.0):
    """Inside the bank (mono loop): a hushed murmur in a marble hall, soft footsteps on polished stone, a faint
    note-counting machine, paper shuffling, all in a warm hall reverb; faint air-conditioning hum underneath.
    Texture only: the number-ticket chime, stamps, coins and voices are game-triggered one-shots."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    walla = np.zeros(L)
    for layer in range(3):
        sh = (lambda f, s=layer: sum(g / (1 + ((f - F * (1 + 0.05 * s)) / 260.0) ** 2)
                                     for F, g in ((520, 1.0), (1150, 0.7), (2400, 0.25))) / np.sqrt(np.maximum(f, 60)))
        flutter = S.periodic_curve(L, r, int(nominal * 1.5), int(nominal * 5.0), slope=0.4)
        walla += unit(S.noise_fft(L, r, sh)) * (0.3 + 0.7 * flutter ** 1.5)
    walla = S.filt_circ(walla, "lp", 2600)
    hvac = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 250.0) / 1.2) ** 2)))
    ev = _memo(("bank", seed, nominal), lambda: _bank_events(seed, nominal))
    y = unit(walla) * 0.016 + hvac * 0.009 + 1.6 * fold1(ev, L)
    y = circ_verb(y, rt60=1.6, mix=0.35, hf_rt60=0.7, predelay=0.025, size=1.0, hi_cut=5000)
    y = S.filt_circ(y, "hp", 60, order=2)
    return finish_loop(y, {"loopSamples": L})


def sfx_coin_count():
    """A teller counts coins onto a stack: eight clinks, quickening, each a little higher as the stack grows,
    a light slide, then a bright 'ching' (F6). cues: first 0, ching 0.72."""
    r = S.rng(11200)
    m = Mono(1.6)
    times = [0.0, 0.13, 0.24, 0.33, 0.41, 0.48, 0.54, 0.6]
    for i, t0 in enumerate(times):
        f = 2700 * 2 ** (i * 0.7 / 12)
        m.add(t0, coin_hit(r, f, 0.12), 0.32)
        m.add(t0 + 0.003, coin_hit(r, f * 1.37, 0.08), 0.12)
        m.add(t0, blip(900, 600, 0.03, 0.01, 0.008), 0.06)
    m.add(0.62, nsweep(r, 0.12, 2500, 5000, 1.5, [(0, 0), (0.03, 1), (0.12, 0)]), 0.04)
    m.add(0.72, chime(float(S.midi_hz(89)), 0.6, 0.9, r), 0.3)
    m.add(0.72, coin_hit(r, 3600, 0.2), 0.2)
    m.add(0.74, I.glock(101, 0.45, r), 0.07)
    y = room(m.x, 0.5, 0.08, 0.2, 0.6)
    return tail_fade(y, 0.2)


def sfx_stamp():
    """Rubber stamp on a ledger (settlement 'stamp - done!'): a satisfying 'ka-THUNK' - wooden desk thump,
    papery slap, rubber squash - and a pen hopping on the desk. cues: thunk 0."""
    r = S.rng(11300)
    m = Mono(0.7)
    m.add(0.0, blip(240, 95, 0.2, 0.015, 0.035, attack=0.0008), 0.28)       # polish: desk thump -4 dB
    m.add(0.0, wood_knock(r, 720, 1.0, 0.08), 0.75)                          # polish: knock 310 -> 720 Hz (phones)
    m.add(0.0, wood_knock(r, 310, 0.7, 0.07), 0.2)
    m.add(0.0, S.bp(r.standard_normal(n_of(0.08)), 1900, 0.9) * S.env_exp(n_of(0.08), 0.011, 0.0004), 0.5)
    m.add(0.0, burst(r, 0.01, 3600, 1.2, tau=0.0015), 0.15)
    m.add(0.004, S.lp(r.standard_normal(n_of(0.06)), 1200) * S.env_exp(n_of(0.06), 0.012, 0.001), 0.3)
    m.add(0.11, wood_knock(r, 1400, 0.5, 0.03), 0.2)
    m.add(0.18, wood_knock(r, 1500, 0.35, 0.03), 0.13)
    y = room(m.x, 0.4, 0.08, 0.15, 0.5)
    return tail_fade(y, 0.08)


VAULT_FPS = 8.0          # civ_assets.py: CL.overlay('vault', ..., 8, fps=8, repeat=0) -> frame k at k / 8 s


def sfx_vault_door():
    """The round vault door opens, timed to anims.vault (8 frames at 8 fps: 0 closed, 1-2 the wheel spins, 3-7 the
    door swings 20 -> 102 deg): the spoked wheel spins (ratchet ticks speeding up, hub whirr), three bolts retract
    'ka-chunk-CLUNK' as frame 3 starts the swing, the heavy door swings with a low hinge groan and a whoosh of
    air, lands with a deep 'dunn' on the last frame, and a little treasure sparkle 'ting'. Every bolt has a
    1.2-2.5 kHz steel 'clack' and the 'dunn' a 1 kHz knock, so it reads on phone speakers.
    cues: spin 0, bolt1 0.25, bolt2 0.31, bolt3 0.375 (frame 3), swing 0.4, open 0.875 (frame 7), sparkle 0.94."""
    r = S.rng(11400)
    fr = 1.0 / VAULT_FPS
    m = Mono(2.4)
    d = 0.24
    n = n_of(d)
    t = tax(n)
    rate = 18 + 30 * (t / d) ** 1.2
    ph = np.cumsum(rate) / SR
    for i in np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1:
        m.add(i / SR, steel_clank(r, r.uniform(1500, 1900), 0.4, 0.04), 0.16)
    whirr = S.bp(r.standard_normal(n), 320, 1.5) * S.env_pts([(0, 0), (0.05, 0.6), (d - 0.03, 1.0), (d, 0)], n)
    m.add(0.0, unit(whirr) * 0.03, 1.0)
    m.add(0.0, steel_clank(r, 1250, 0.6, 0.06), 0.12)                        # hand grabs the wheel
    for k, t0 in enumerate((2 * fr, 2 * fr + 0.06, 3 * fr)):
        m.add(t0, steel_clank(r, 160 + 15 * k, 1.0, 0.25), 0.18 + 0.04 * k)
        m.add(t0, blip(120, 55, 0.18, 0.02, 0.05), 0.18 + 0.04 * k)
        m.add(t0, S.hp(steel_clank(r, 1300 + 350 * k, 0.9, 0.08), 600, order=2), 0.3 + 0.05 * k)   # bright 'clack'
        m.add(t0 + 0.004, wood_knock(r, 640 + 70 * k, 0.9, 0.06), 0.22)
    sw = 7 * fr - 3.2 * fr                                                  # the swing: frame 3 .. frame 7
    g = creak(r, sw, [(0, 10), (sw * 0.45, 18), (sw, 12)], res=((150, 3.0, 1.0), (360, 4.0, 0.6), (780, 5.0, 0.35)),
              env_pts=[(0, 0), (sw * 0.15, 0.8), (sw * 0.6, 1.0), (sw, 0)], jitter=0.2)
    m.add(3.2 * fr, norm(g), 0.2)
    m.add(3.2 * fr, puff(r, sw, 420, [(0, 0), (sw * 0.55, 1.0), (sw, 0)]), 0.3)
    m.add(7 * fr, blip(90, 45, 0.5, 0.04, 0.13, attack=0.003), 0.3)
    m.add(7 * fr, S.modal(110, n_of(0.9), [(1, 1, 0.7), (2.71, 0.4, 0.35), (4.3, 0.15, 0.2)], r, attack=0.002), 0.08)
    m.add(7 * fr, wood_knock(r, 1000, 1.0, 0.08), 0.32)                    # 1 kHz knock in the 'dunn'
    m.add(7 * fr, S.hp(steel_clank(r, 760, 0.8, 0.18), 500, order=2), 0.16)
    m.add(7 * fr + 0.065, I.glock(96, 0.6, r), 0.1)
    m.add(7 * fr + 0.145, I.glock(101, 0.5, r), 0.07)
    y = S.lp(m.x, 8000)
    y = room(y, 0.9, 0.14, 0.35, 0.9)
    return tail_fade(y[:n_of(1.9)], 0.4)


def sfx_ticket_chime():
    """Bank queue: the number display calls the next customer - a soft electronic 'ding-dong' (C6 -> A5, a
    vibraphone-like bell with a slow motor tremolo, F major), a faint display click. cues: ding 0, dong 0.34."""
    r = S.rng(12600)
    m = Mono(1.7)
    m.add(0.0, burst(r, 0.006, 2400, 1.0, tau=0.0012), 0.04)
    for t0, nm, v in ((0.0, "C6", 1.0), (0.34, "A5", 0.92)):
        f = float(S.midi_hz(S.note(nm)))
        n = n_of(1.25)
        b = S.modal(f, n, [(1, 1, 1.1), (1.0025, 0.35, 1.0), (2.0, 0.22, 0.45), (3.0, 0.07, 0.25), (4.0, 0.03, 0.15)],
                    r, fmax=9000.0, attack=0.0025)
        trem = 1.0 - 0.18 * (0.5 - 0.5 * np.cos(TAU * 5.2 * tax(n)))
        m.add(t0, b * trem * v, 0.42)
        m.add(t0, I.glock(S.note(nm), 0.4, r), 0.05 * v)
    y = S.lp(m.x, 7000)
    y = room(y, 0.6, 0.1, 0.22, 0.7)
    return tail_fade(y, 0.3)


# ============================================================================ logistics
def _warehouse_events(seed: int, nominal: float):
    r = S.rng(seed + 1)
    ev = []
    nominal = 9.0                                       # event times are fractions of a 9 s layout
    for t0 in (0.7, 2.6, 4.4, 6.5, 8.2):                                     # boxes bumping over roller joints
        for j in range(3):
            ev.append(((t0 + 0.23 * j) / nominal, S.lp(cardboard(r, 1.0, r.uniform(0.9, 1.3)), 3000),
                       0.06 * (1.0 - 0.25 * j)))
    for t0 in (1.5, 6.9):                                                    # far forklift reversing
        for i in range(4):
            ev.append(((t0 + 0.48 * i) / nominal, far(beep(84, 0.22, 1.0), 3200, 0.75, 2.2), 0.045))
    d = 2.2                                                                  # forklift motor pass
    n = n_of(d)
    tt = tax(n)
    sp = np.sin(np.pi * tt / d) ** 1.5
    wh = S.additive(300 + 260 * sp, n, [(1, 1.0), (2, 0.4), (3, 0.2)], fmax=4000) * sp
    ev.append((3.2 / nominal, far(wh, 2500, 0.6, 2.0), 0.03))
    tp = nsweep(r, 0.5, 1200, 2600, 1.2, [(0, 0), (0.03, 1), (0.45, 0.9), (0.5, 0)])  # tape gun 'zzzrip'
    tp = tp * (0.7 + 0.3 * np.sin(TAU * 60 * tax(len(tp))))
    ev.append((5.4 / nominal, far(tp, 5000, 0.4, 1.6), 0.05))
    ev.append((5.95 / nominal, far(cardboard(r, 1.0, 1.4), 3000, 0.4, 1.6), 0.08))
    for t0 in (2.1, 7.6):                                                    # pallet jack clatter
        cl = np.zeros(n_of(0.4))
        for k in range(5):
            place(cl, (k * 0.06 + r.uniform(0, 0.02)) * SR, steel_clank(r, r.uniform(500, 900), 0.6, 0.1), 0.5)
        ev.append((t0 / nominal, far(cl, 4000, 0.6, 2.0), 0.05))
    # polish: the far voice is gone (it repeated every 8 s); the game adds audio2 sfx_chatter_lo near workers.
    return ev


def render_warehouse(seed: int = 11500, loop_samples=None, nominal: float = 8.0):
    """Inside the logistics centre (mono loop): the conveyor's electric motor hum (G2 + harmonics) and the
    rollers' steady rattle, boxes bumping over the roller joints, a forklift reversing at the far end
    ('beep ... beep'), its motor passing, a tape gun, a pallet jack - in a big echoing hall (no voices)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    t = np.arange(L) / SR
    hum_f = loop_freq(98.0, L)
    hum = S.additive(hum_f, L, [(1, 1.0), (2, 0.6), (3, 0.35), (4, 0.2), (6, 0.08)], fmax=2000)
    k = int(round(L / SR * 14.0))                                            # roller rattle grid (whole number)
    P = L / k
    roll = np.zeros(L + n_of(0.1))
    for i in range(k):
        place(roll, i * P + r.normal(0, 0.0015) * SR, burst(r, 0.01, r.uniform(1100, 1900), 1.3, tau=0.002),
              r.uniform(0.4, 1.0), L)
    roll = fold1(roll, L)
    rum = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 200.0) / 1.2) ** 2)))
    air = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 900.0) / 1.6) ** 2)))
    ev = _memo(("warehouse", seed, nominal), lambda: _warehouse_events(seed, nominal))
    buf = np.zeros(L + n_of(3.0))
    for u, sig, g in ev:
        place(buf, u * L, sig, g, L)
    y = unit(hum) * 0.012 * (0.9 + 0.1 * np.sin(TAU * loop_rate(0.5, L) * t)) + unit(roll) * 0.012 + \
        rum * 0.02 + air * 0.006 + fold1(buf, L)
    y = circ_verb(y, rt60=1.9, mix=0.3, hf_rt60=0.8, predelay=0.03, size=1.0, hi_cut=5000)
    y = S.filt_circ(y, "hp", 50, order=2)
    return finish_loop(y, {"loopSamples": L, "humHz": round(float(hum_f[0]), 3)})


def sfx_forklift_beep():
    """Forklift reversing: three friendly beeps (C6, rounded square + sine) 'beep - beep - beep'.
    cues: beep1 0, beep2 0.42, beep3 0.84."""
    r = S.rng(11600)
    m = Mono(1.4)
    for k in range(3):
        m.add(0.42 * k, beep(84, 0.2, 1.0), 0.6)
    y = room(m.x, 0.5, 0.1, 0.25, 0.7)
    _ = r
    return tail_fade(y, 0.15)


def sfx_moving_truck():
    """Moving truck pulls up and opens (matches moving_truck anims.unload): the engine putters to a stop, an air
    brake 'pssht', the roll-up door rattles up 'rrrrrrr-clack', the loading ramp slides out 'shhhk' and lands
    'clang'. cues: brake 0.5, door 0.85, doorTop 1.6, ramp 1.8, rampDown 2.2."""
    r = S.rng(11700)
    m = Mono(3.2)
    for i in range(7):                                                    # engine stopping: slowing putts
        t0 = sum(0.075 * (1 + 0.18 * j) for j in range(i))
        n = n_of(0.07)
        pop = S.lp(r.standard_normal(n), 600, order=2) * S.env_exp(n, 0.007, 0.0008)
        tone = S.modal(100, n, [(1, 1, 0.04), (2.1, 0.4, 0.02)], r, attack=0.001)
        m.add(t0, pop * 0.8 + tone, 0.45 * (1 - 0.1 * i))
    m.add(0.5, nsweep(r, 0.35, 3200, 2000, 0.9, [(0, 0), (0.01, 1), (0.1, 0.6), (0.35, 0)]), 0.22)    # air brake
    d = 0.75                                                              # roll-up door
    n = n_of(d)
    tt = tax(n)
    rate = 18 + 22 * np.sin(np.pi * tt / d)
    ph = np.cumsum(rate) / SR
    for i in np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1:
        m.add(0.85 + i / SR, steel_clank(r, r.uniform(1100, 1500), 0.5, 0.05), 0.09)
    m.add(0.85, S.lp(r.standard_normal(n), 600, order=2) * np.sin(np.pi * tt / d), 0.2)
    m.add(1.6, steel_clank(r, 640, 1.0, 0.2), 0.3)
    m.add(1.8, nsweep(r, 0.38, 1400, 2600, 1.4, [(0, 0), (0.04, 1), (0.34, 0.8), (0.38, 0)]), 0.12)   # ramp slides
    m.add(2.2, steel_clank(r, 250, 1.0, 0.3), 0.4)
    m.add(2.2, blip(130, 55, 0.25, 0.02, 0.06), 0.45)
    m.add(2.3, steel_clank(r, 260, 0.4, 0.15), 0.12)
    y = S.lp(m.x, 7500)
    y = room(y, 0.6, 0.1, 0.25, 0.8)
    return tail_fade(y, 0.2)


def sfx_box_drop():
    """Cardboard box put down on the floor: hollow 'thup', flaps flutter, the things inside rattle."""
    r = S.rng(11800)
    m = Mono(0.6)
    m.add(0.0, cardboard(r, 1.0, 1.0), 1.0)
    for t0 in (0.012, 0.03, 0.055, 0.08):
        m.add(t0, wood_knock(r, r.uniform(900, 1600), r.uniform(0.3, 0.7), 0.03), 0.18)
    y = room(m.x, 0.35, 0.08, 0.12, 0.5)
    return tail_fade(y, 0.06)


def sfx_box_drop_v(v: int):
    """Variants for the group sfx_box: 2 = a small box with tins / toys inside that clink, 3 = a big heavy box
    (deeper 'thump', a short scrape as it settles)."""
    r = S.rng(11800 + v)
    m = Mono(0.7)
    if v == 2:
        m.add(0.0, cardboard(r, 1.0, 0.75), 1.0)
        for t0 in (0.01, 0.024, 0.04, 0.062, 0.09):
            m.add(t0, coin_hit(r, r.uniform(1500, 2800), 0.07), 0.12 * r.uniform(0.5, 1.0))
    else:
        m.add(0.0, cardboard(r, 1.0, 1.35), 1.0)
        m.add(0.0, blip(120, 60, 0.3, 0.03, 0.07, attack=0.002), 0.35)
        m.add(0.07, nsweep(r, 0.16, 700, 1100, 1.2, [(0, 0), (0.03, 1), (0.16, 0)]), 0.05)
        m.add(0.03, wood_knock(r, 700, 0.5, 0.04), 0.12)
    y = room(m.x, 0.35, 0.08, 0.12, 0.5)
    return tail_fade(y, 0.06)


def sfx_newspaper():
    """The town paper: a quick grab, a crisp 'FWAP' as it is shaken open, a crinkly rustle settling.
    cues: fwap 0.16."""
    r = S.rng(11900)
    m = Mono(1.0)
    m.add(0.0, paper_grains(r, 0.12, 160, env=[(0, 0.5), (0.05, 1), (0.12, 0.3)]), 0.5)
    m.add(0.06, puff(r, 0.12, 1800, [(0, 0), (0.1, 1), (0.12, 0.2)]), 0.25)
    m.add(0.16, S.bp(r.standard_normal(n_of(0.05)), 1500, 0.8) * S.env_exp(n_of(0.05), 0.008, 0.0005), 0.7)
    m.add(0.16, blip(220, 95, 0.1, 0.012, 0.03), 0.25)
    m.add(0.17, paper_grains(r, 0.55, 140, env=[(0, 1), (0.2, 0.5), (0.55, 0)]), 0.55)
    m.add(0.18, puff(r, 0.35, 2600, [(0, 0), (0.02, 1), (0.35, 0)]), 0.1)
    y = room(m.x, 0.35, 0.07, 0.12, 0.5)
    return tail_fade(y, 0.08)


# ============================================================================ police
def sfx_police_whistle():
    """Officer's pea whistle: a short 'pweet!' then a long trilling 'pweeeeeet!' (C7 ~2.1 kHz - lower and
    rounder than a real referee whistle; the pea's flutter = fast pitch + level trill). cues: blast1 0,
    blast2 0.3."""
    r = S.rng(12000)
    m = Mono(1.5)
    for t0, d, trill in ((0.0, 0.17, 0.6), (0.3, 0.7, 1.0)):
        n = n_of(d + 0.06)
        t = tax(n)
        rate = 26 + 6 * smooth_noise(r, n, 4.0)
        tr = np.sin(TAU * S.phase(rate, n))
        semis = -1.4 * np.exp(-t / 0.025) + 0.35 * trill * tr - 0.8 * np.clip((t - d) / 0.06, 0, 1)
        f = float(S.midi_hz(96)) * 2 ** (semis / 12)
        tone = S.additive(f, n, [(1, 1.0), (2, 0.08), (3, 0.03)], fmax=9000)
        am = 1 - 0.35 * trill * tr ** 2                  # level dips at both pitch extremes: centred pitch
        air = S.bp(r.standard_normal(n), 2100, 3.0)
        y = (tone * am + 0.18 * unit(air) * 0.3) * S.env_adsr(n, 0.012, 0.03, 0.9, 0.05, gate=d)
        m.add(t0, y, 0.6)
    y = S.lp(m.x, 6000)
    y = room(y, 0.5, 0.1, 0.2, 0.7)
    return tail_fade(y, 0.12)


def sfx_cuffs_click():
    """Toy-ish handcuffs: a quick ratchet 'tk-tk-tk-tk', the latch 'clack', a tiny chain jingle.
    cues: ratchet 0, latch 0.19."""
    r = S.rng(12100)
    m = Mono(0.6)
    for k in range(4):
        m.add(0.035 * k, S.hp(steel_clank(r, r.uniform(2400, 2900), 0.5, 0.03), 900, order=2), 0.22)
    m.add(0.19, S.hp(steel_clank(r, 1100, 1.0, 0.08), 400, order=2), 0.5)
    m.add(0.19, burst(r, 0.01, 2500, 1.0, tau=0.002), 0.3)
    for k in range(3):
        m.add(0.22 + 0.03 * k + r.uniform(0, 0.01), coin_hit(r, r.uniform(2600, 3600), 0.06), 0.08)
    y = room(m.x, 0.35, 0.07, 0.1, 0.45)
    return tail_fade(y, 0.05)


def _fight_events(seed: int):
    """One scuffle bar (fractions of the loop) - memoised signals."""
    r = S.rng(seed + 1)
    seq = [
        (0.00, "bonk", 1.0), (0.09, "swish", 0.8), (0.17, "pow", 1.0), (0.24, "biff", 0.8), (0.30, "squeak", 0.7),
        (0.39, "bonk2", 0.9), (0.44, "hai", 0.8), (0.52, "swish", 0.7), (0.58, "pow", 0.9), (0.64, "boing", 0.8),
        (0.75, "biff", 0.9), (0.79, "ya", 0.8), (0.87, "pow", 0.85), (0.93, "swish", 0.6),
    ]
    sig = {
        "bonk": lambda: bonk(r, 440, 1.0), "bonk2": lambda: bonk(r, 360, 1.0), "pow": lambda: pow_puff(r, 1.0),
        "biff": lambda: mix((blip(320, 130, 0.08, 0.012, 0.025, attack=0.0008), 1.0),
                            (burst(r, 0.05, 950, 0.9, tau=0.01), 0.5)),
        "swish": lambda: swish(r), "boing": lambda: boing(r, 196.0, 0.42), "squeak": lambda: toy_squeak(r, 1550, 0.1),
        "hai": lambda: S.hp(utter(r, [("h", "a", 0.1, 1.0, 0.15, 1.0), ("", "i", 0.08, 1.15, -0.1, 0.8)], 330,
                                  fs=1.12, tilt=0.95, breath=0.05, fmax=8000.0), 150),
        "ya": lambda: S.hp(utter(r, [("y", "a", 0.14, 1.1, -0.15, 1.0)], 280, fs=1.08, tilt=0.95, breath=0.05,
                                 fmax=8000.0), 150),
    }
    gain = {"bonk": 0.5, "bonk2": 0.5, "pow": 0.6, "biff": 0.45, "swish": 0.18, "boing": 0.22, "squeak": 0.12,
            "hai": 0.16, "ya": 0.16}
    out = []
    for u, name, v in seq:
        x = sig[name]()
        out.append((u, norm(x) if name in ("hai", "ya", "squeak", "boing", "swish") else x, gain[name] * v))
    return out


def render_comic_fight(seed: int = 12200, loop_samples=None, nominal: float = 2.4):
    """Cartoon dust-cloud scuffle (mono loop, plays inside fx_fight_cloud): a scuffling dust rumble with feet
    shuffling, and on top a comic cycle of 'bonk', 'swish', 'pow', 'biff', a toy squeak, 'bonk', a tiny
    'hai!', 'pow', a spring 'boiing', 'biff', 'ya!', 'pow' - funny and harmless, no pain sounds."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    flut = S.periodic_curve(L, r, int(nominal * 6), int(nominal * 14), slope=0.5)
    dust = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 700.0) / 1.2) ** 2)))
    low = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 160.0) ** 2) / np.sqrt(np.maximum(f, 30))))
    k = int(round(L / SR * 7.0))                                           # shuffling feet grid
    feet = np.zeros(L + n_of(0.2))
    for i in range(k):
        place(feet, (i + 0.5) * L / k + r.normal(0, 0.006) * SR, S.lp(burst(r, 0.05, 800, 0.8, tau=0.012), 2000),
              r.uniform(0.4, 1.0), L)
    ev = _memo(("fight", seed), lambda: _fight_events(seed))
    buf = np.zeros(L + n_of(0.8))
    for u, sig, g in ev:
        place(buf, u * L, sig, g, L)
    y = dust * 0.05 * (0.4 + 0.6 * flut) + low * 0.03 + unit(fold1(feet, L)) * 0.03 + fold1(buf, L)
    y = S.filt_circ(y, "hp", 50, order=2)
    y = S.filt_circ(y, "lp", 8000)
    y = circ_verb(y, rt60=0.4, mix=0.1, hf_rt60=0.2, predelay=0.008, size=0.5)
    return finish_loop(y, {"loopSamples": L})


# ============================================================================ crowd / alarm
def sfx_crowd_gasp():
    """Small crowd gasps 'h-oooh!' (a fire! a thief!): six voices (kids + grown-ups) catch their breath and
    go 'ooh' with a falling pitch, then murmur. Surprised, not scared."""
    r = S.rng(12300)
    m = Mono(1.6)
    voices = ((0.0, 430, 1.2, 1.0), (0.02, 230, 1.04, 0.9), (0.04, 480, 1.22, 0.8), (0.05, 190, 1.0, 0.85),
              (0.07, 300, 1.1, 0.8), (0.09, 255, 1.06, 0.7))
    for t0, f0, fs, g in voices:
        d = r.uniform(0.42, 0.55)
        sy = [("h", "o", 0.1, 1.05, 0.08, 0.65), ("", "o" if r.random() < 0.5 else "u", d, 1.18, -0.3, 1.0)]
        y = utter(r, sy, f0, fs=fs, tilt=0.95, breath=0.07, jitter=0.006, asp_gain=0.6, fmax=8000.0)
        m.add(t0 + r.uniform(0, 0.02), S.hp(y, 120), g * 0.35)
    n = n_of(0.12)
    m.add(0.0, S.bp(r.standard_normal(n), 2600, 0.8) * S.env_pts([(0, 0), (0.06, 1), (0.12, 0)], n), 0.05)
    n = n_of(0.9)
    mur = S.noise_fft(n, r, lambda f: sum(g / (1 + ((f - F) / 250) ** 2) for F, g in ((600, 1.0), (1400, 0.6))))
    mur *= (0.6 + 0.4 * smooth_noise(r, n, 7.0)) * S.env_pts([(0, 0), (0.15, 1), (0.9, 0)], n)
    m.add(0.55, mur, 0.035)
    y = room(m.x, 0.7, 0.12, 0.3, 0.7)
    return tail_fade(y, 0.25)


def sfx_crowd_cheer_small():
    """The fire is out / the thief is caught: a handful of townsfolk 'hoo-ray!', 'yay!', 'woo!', someone's
    finger whistle 'fweet-fweeoo', and a short warm applause. Smaller and different from audio2 sfx_cheer."""
    r = S.rng(12400)
    m = Mono(2.6)
    words = ((0.0, "hooray", 240, 1.05, 0.9), (0.04, "yay", 450, 1.2, 0.8), (0.1, "woo", 200, 1.0, 0.6),
             (0.16, "hooray", 400, 1.18, 0.7), (0.52, "yay", 300, 1.1, 0.55))
    for t0, w, f0, fs, g in words:
        if w == "hooray":
            sy = [("h", "u", 0.13, 1.0, 0.05, 0.85), ("l", "ei", 0.38, 1.22, -0.12, 1.0)]
        elif w == "yay":
            sy = [("y", "e", 0.3, 1.0, 0.25, 1.0), ("", "i", 0.16, 1.22, -0.15, 0.7)]
        else:
            sy = [("w", "u", 0.5, 1.0, 0.3, 1.0)]
        y = utter(r, sy, f0, fs=fs, tilt=0.9, breath=0.05, jitter=0.006, vib=0.012, vib_rate=6.0, fmax=8500.0,
                  asp_gain=0.4)
        m.add(t0, S.hp(y, 120), g * 0.4)
    d = 0.55                                                                   # finger whistle 'fweet-fweeoo'
    n = n_of(d)
    tt = tax(n)
    f = np.where(tt < 0.18, 1700 + 900 * np.clip(tt / 0.1, 0, 1), 2600 - 900 * np.clip((tt - 0.26) / 0.28, 0, 1) ** 1.3)
    f = np.where((tt >= 0.18) & (tt < 0.26), 2100 + 500 * np.clip((tt - 0.2) / 0.05, 0, 1), f)
    wh = S.sine(f, n) + 0.1 * S.bp(r.standard_normal(n), 2300, 2.0)
    wh = wh * S.env_pts([(0, 0), (0.02, 1), (0.16, 0.9), (0.19, 0.25), (0.22, 1.0), (0.48, 0.7), (d, 0)], n)
    m.add(0.25, wh, 0.12)
    clap_crowd(m, r, 0.12, 2.0, 4, 0.3, 0.3)
    y = room(m.x, 0.8, 0.13, 0.4, 0.75)
    return tail_fade(y, 0.3)


def sfx_fire_alarm_bell():
    """Electric fire-alarm bell, kept friendly: a small round gong (prime A5, soft inharmonic partials, highs
    tamed) struck ~17 times a second by the clapper - 'brrrring ... brrrring' - then it rings out.
    cues: ring1 0, ring2 1.15."""
    r = S.rng(12500)
    m = Mono(2.8)
    f = float(S.midi_hz(81))
    parts = [(1.0, 1.0, 0.9), (1.0035, 0.4, 0.8), (2.32, 0.3, 0.35), (4.25, 0.12, 0.2), (6.1, 0.04, 0.1)]
    for t0, t1 in ((0.0, 0.95), (1.15, 2.0)):
        t = t0
        k = 0
        while t < t1:
            v = (1.0 if k % 2 == 0 else 0.8) * r.uniform(0.85, 1.0) * min(1.0, 0.55 + (t - t0) * 4)
            y = S.modal(f, n_of(0.9), parts, r, fmax=7000.0, attack=0.0004)
            y[:n_of(0.004)] += burst(r, 0.004, 3500, 1.0, tau=0.0006) * 0.3
            m.add(t, y * v, 0.16)
            k += 1
            t += 1.0 / 17.0 + r.normal(0, 0.002)
    y = S.lp(m.x, 5200)
    y = S.hp(y, 300, order=2)
    y = room(y, 0.6, 0.1, 0.25, 0.7)
    return tail_fade(y[:n_of(2.45)], 0.45)


# ============================================================================ registry
SFX6 = {
    "sfx_fire_flare": sfx_fire_flare,
    "sfx_steam_hiss": sfx_steam_hiss,
    "sfx_collapse_soft": sfx_collapse_soft,
    "sfx_demolish_crunch": sfx_demolish_crunch,
    "sfx_coin_count": sfx_coin_count,
    "sfx_stamp": sfx_stamp,
    "sfx_vault_door": sfx_vault_door,
    "sfx_forklift_beep": sfx_forklift_beep,
    "sfx_police_whistle": sfx_police_whistle,
    "sfx_crowd_gasp": sfx_crowd_gasp,
    "sfx_crowd_cheer_small": sfx_crowd_cheer_small,
    "sfx_cuffs_click": sfx_cuffs_click,
    "sfx_fire_alarm_bell": sfx_fire_alarm_bell,
    "sfx_moving_truck": sfx_moving_truck,
    "sfx_box_drop": sfx_box_drop,
    "sfx_box_drop_2": lambda: sfx_box_drop_v(2), "sfx_box_drop_3": lambda: sfx_box_drop_v(3),
    "sfx_newspaper": sfx_newspaper,
    "sfx_ticket_chime": sfx_ticket_chime,
}
# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH6 = {
    "sfx_fire_flare": dict(punch=2, fout=0.06), "sfx_steam_hiss": dict(punch=1, fout=0.05, peak_db=-2.6),
    "sfx_collapse_soft": dict(punch=3, fout=0.06), "sfx_demolish_crunch": dict(punch=3, fout=0.06),
    "sfx_coin_count": dict(punch=2, fout=0.05), "sfx_stamp": dict(punch=5, fout=0.03),
    "sfx_vault_door": dict(punch=3, fout=0.08), "sfx_forklift_beep": dict(punch=1, fout=0.03),
    "sfx_police_whistle": dict(punch=1, fout=0.03), "sfx_crowd_gasp": dict(punch=1, fout=0.05),
    "sfx_crowd_cheer_small": dict(punch=2, fout=0.08), "sfx_cuffs_click": dict(punch=6, fout=0.02),
    "sfx_fire_alarm_bell": dict(punch=2, fout=0.08), "sfx_moving_truck": dict(punch=3, fout=0.05),
    "sfx_box_drop": dict(punch=5, fout=0.03),
    "sfx_box_drop_2": dict(punch=5, fout=0.03), "sfx_box_drop_3": dict(punch=7, fout=0.03), "sfx_newspaper": dict(punch=2, fout=0.03),
    "sfx_ticket_chime": dict(punch=1, fout=0.08),
}
# loop renders (key -> function name in this module); build_audio.fit_loop calls them with loop_samples=n
LOOP_FUNCS = {"sfx_siren_fire": "render_siren_fire", "sfx_siren_police": "render_siren_police",
              "amb_fire_big": "render_fire_big", "sfx_hose_spray": "render_hose_spray",
              "sfx_excavator": "render_excavator", "amb_construction": "render_construction",
              "amb_bank": "render_bank", "amb_warehouse": "render_warehouse", "sfx_comic_fight": "render_comic_fight"}


def render_with_lead(key: str):
    """Same mastering chain as sfx.render ... sfx4.render: optional punch limiter -> synth.finish_sfx (-1.5 dBFS).
    -> (finished mono sfx, lead) where lead = seconds of near-silence finish_sfx trimmed off the start (the
    build subtracts it from the designed cue times, so manifest cues match the delivered file)."""
    y = np.asarray(SFX6[key](), dtype=float)
    opts = dict(FINISH6.get(key, {}))
    punch = opts.pop("punch", 0)
    peak_db = opts.pop("peak_db", -1.5)
    if punch:
        y = S.hp(y, 30, order=2)
        y = S.limiter(y / max(S.peak(y), 1e-12), -float(punch), window_ms=3.0)
    a = np.abs(S.hp(y, opts.get("lowcut", 30.0), order=2))        # = finish_sfx's trim_silence decision
    idx = np.nonzero(a > S.undb(opts.get("thr_db", -56.0)) * max(a.max(), 1e-12))[0]
    lead = max(0, int(idx[0]) - n_of(0.001)) / SR if len(idx) else 0.0
    return S.finish_sfx(y, peak_db=peak_db, **opts), lead


def render(key: str) -> np.ndarray:
    """Finished one-shot (see render_with_lead)."""
    return render_with_lead(key)[0]


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
    main(sys.argv[1:] or (list(SFX6) + list(LOOP_FUNCS)))
