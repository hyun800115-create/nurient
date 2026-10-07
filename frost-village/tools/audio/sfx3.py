"""Frost Village - v5 sounds (CONTRACT_V5 section R) by procedural synthesis (library + script).

Same toolkit and layering style as sfx.py / sfx2.py (imported, never edited):
  vehicles      sfx_bus_horn (retro two-tone 'bap-baaap'), sfx_car_honk_1 ('meep-meep'),
                sfx_car_honk_2 (squeeze-bulb 'hoonk'), sfx_steam_whistle (chime whistle 'toot-tooot'),
                sfx_brakes (soft squeal + air 'pssht'), sfx_door (handle click + 'ka-thunk')
  town          sfx_bell_hall (town-hall tower bells 'ding-dong-ding-dong'), sfx_school_bell (brass hand bell)
  life          sfx_baby_giggle (rattle shake + tiny giggle + coo; high, short, breathy = toy-like)
  missions      sfx_mission_done (card stamp + 'A C D -> F' jingle from the village hook),
                sfx_fame_up ('ta-ta-ta-TAAA' fanfare + glock run + star chime)
  loops (mono, seamless; build_audio3 moves the loop point onto a Vorbis block boundary)
                sfx_truck_engine (toy putt-putt engine, ~1.6 s), sfx_sleigh_bells (~2.4 s),
                sfx_horse_trot (two horses 'clip-clop' on packed snow, ~2.4 s, same tempo as the bells),
                amb_night (soft night wind, distant owl call + answer, faint wind chime, ~17 s),
                amb_town (busy town murmur: walla, passing chatter, footsteps, distant traffic, ~14 s)
Musical sounds are in F major like bgm_village and the v1/v2 sfx.

Loops are built like ambience.py: continuous beds in the frequency domain (synth.noise_fft) and
modulation curves with whole cycles over the loop length (synth.periodic_curve); rhythmic loops
(engine, bells, hooves) place an exact whole number of strokes in the loop; discrete events are
rendered past the end and folded back (synth.fold_loop); the limiter runs circularly; finally the
loop is rotated to start at its quietest zero crossing (rotate_quiet) so the codecs' file edges are
smooth. Expensive event layers (babble voices, owl) are memoised so build_audio.fit_loop only re-folds them.

Run:   python3 tools/audio/sfx3.py [key ...]        (no key = all)
       -> tools/audio/_cache/audio3/<key>.wav  (mono 44.1 kHz float; sfx peak -1.5 dBFS, loops -20 LUFS)
Normally called through build_audio3.py.  Deterministic (each key has a fixed seed).
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
from sfx import Mono, blip, burst, chime, coin_hit, mix, nsweep, puff, room, smooth_noise, sparkles, tax  # noqa: E402
from sfx2 import _level, utter  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio3")


# ============================================================================ helpers
def tail_fade(y, sec: float):
    """Fade the last ``sec`` seconds smoothly (for sounds that are still ringing when the file ends)."""
    y = np.array(y, dtype=float, copy=True)
    k = min(len(y), n_of(sec))
    if k > 1:
        y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return y


def horn_tone(m: float, dur: float, r, bright: float = 1.0, formant: float = 900.0, scoop: float = -0.5,
              rel: float = 0.05, buzz: float = 0.35, pw: float = 0.3) -> np.ndarray:
    """Little electric / reed car-horn voice: saw + narrow pulse, quick pitch scoop at the start,
    nasal formant peaks, soft low-pass (round and toy-like rather than harsh)."""
    n = n_of(dur + rel)
    t = tax(n)
    semis = scoop * np.exp(-t / 0.025)
    f = float(S.midi_hz(m)) * 2 ** (semis / 12)
    x = (1 - buzz) * S.saw(f, n, r.random()) + buzz * S.square(f, n, pw, r.random())
    x = S.lp(x, 1600 + 1700 * bright, 0.7, order=2)
    x = S.peq(x, formant, 6.0, 1.6)
    x = S.peq(x, formant * 2.15, 2.5, 2.0)
    return x * S.env_adsr(n, 0.008, 0.05, 0.85, rel, gate=dur)


def whistle_pipe(m: float, dur: float, r, scoop: float = -1.2, breath: float = 0.35) -> np.ndarray:
    """One steam-whistle pipe: near-sine with a pressure 'swoop' up onto the pitch, airy band noise
    around the pitch, slow late vibrato."""
    rel = 0.12
    n = n_of(dur + rel)
    t = tax(n)
    f0 = float(S.midi_hz(m))
    semis = scoop * np.exp(-t / 0.05) + 0.07 * np.sin(TAU * 5.2 * t + r.uniform(0, TAU)) * np.clip((t - 0.18) / 0.2, 0, 1)
    f = f0 * 2 ** (semis / 12)
    tone = S.additive(f, n, [(1, 1.0), (2, 0.16), (3, 0.06), (4, 0.02)], fmax=9500)
    nz = r.standard_normal(n)
    air = S.bp(nz, f0, 5.0)
    air = air / max(np.std(air), 1e-9) * 0.25
    env = S.env_adsr(n, 0.03, 0.08, 0.86, rel, gate=dur)
    return (tone + breath * air) * env


def tower_bell(prime_m: float, r, t60: float = 3.6, vel: float = 1.0, dur: float | None = None) -> np.ndarray:
    """Tower bell (strike note = nominal, one octave above the prime): hum, prime, a MAJOR-third tierce
    (sweeter than a minor-third church bell), quint, nominal, upper partials; doubled partials beat
    slowly. Clapper 'tonk' on top."""
    f = float(S.midi_hz(prime_m))
    n = n_of(dur if dur else t60)
    parts = [(0.5, 0.13, t60 * 0.9), (1.0, 0.3, t60 * 0.8), (1.0035, 0.12, t60 * 0.75), (1.26, 0.24, t60 * 0.6),
             (1.5, 0.2, t60 * 0.5), (2.0, 1.0, t60 * 0.6), (2.0055, 0.35, t60 * 0.55), (2.52, 0.16, t60 * 0.3),
             (3.0, 0.32, t60 * 0.25), (4.02, 0.13, t60 * 0.13), (5.4, 0.05, t60 * 0.07)]
    y = S.modal(f, n, parts, r, fmax=9000.0, attack=0.0015)
    k = n_of(0.02)
    y[:k] += S.lp(burst(r, 0.02, 1600, 0.9, tau=0.003), 3500) * 0.25
    y[:k] += S.modal(f * 6.1, k, [(1, 1, 0.02)], r) * 0.08
    return y * vel


def handbell(m: float, r, vel: float = 1.0, t60: float = 1.3) -> np.ndarray:
    """Brass school hand bell: fundamental + strong 12th (x3), shimmer pair, bright clapper click."""
    f = float(S.midi_hz(m))
    n = n_of(t60)
    modes = [(1.0, 1.0, t60), (1.0028, 0.35, t60 * 0.9), (2.0, 0.07, t60 * 0.45), (3.0, 0.42, t60 * 0.42),
             (4.16, 0.12, t60 * 0.22), (5.43, 0.08, t60 * 0.13), (6.8, 0.04, 0.08)]
    y = S.modal(f, n, modes, r, fmax=11000.0, attack=0.0004)
    k = n_of(0.006)
    y[:k] += burst(r, 0.006, 5200, 1.0, tau=0.0008) * 0.5
    return y * vel


def rattle(r, dur: float = 0.09, density: float = 900.0) -> np.ndarray:
    """Baby rattle shake: a cloud of tiny bead clicks inside a plastic shell (bright, soft)."""
    n = n_of(dur + 0.03)
    y = np.zeros(n)
    cnt = int(density * dur)
    for t0 in np.sort(r.uniform(0, dur, cnt)):
        k = n_of(0.004)
        i = n_of(t0)
        g = np.sin(np.pi * t0 / dur) ** 0.7 * r.uniform(0.3, 1.0)
        y[i:i + k] += burst(r, 0.004, r.uniform(3500, 7000), 1.6, tau=0.0006)[:max(0, min(k, n - i))] * g
    shell = S.bp(y, 2400, 1.2) * 0.4
    return y + shell


def master_mono(x, target: float = -20.0, ceiling: float = -1.5) -> np.ndarray:
    """Loop mastering (like ambience.master_loop, mono): DC removal, loudness, circular limiter."""
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    x = x * S.undb(target - S.lufs(x))
    return S.limiter(x, ceiling, window_ms=5.0, circular=True)


def rotate_quiet(y, win: int = 512):
    """Circularly shift a finished mono loop so it starts at its quietest, flattest zero crossing.
    The loop stays the same loop, but the file edges - where the codecs restart (MP3 encodes a step
    from its zero pre-roll, Vorbis's first / last block) - now sit where the signal is ~0, so the
    decoded wrap is smooth in both formats. -> (rotated loop, shift)."""
    y = np.asarray(y, dtype=float)
    L = len(y)
    p = y ** 2
    cs = np.concatenate(([0.0], np.cumsum(np.concatenate((p[-(win // 2):], p, p[:win // 2])))))
    rms = np.sqrt((cs[win:win + L] - cs[:L]) / win)
    zc = np.nonzero(np.sign(y) != np.sign(np.roll(y, 1)))[0]
    if not len(zc):
        return y, 0
    cost = rms[zc] + 4.0 * np.abs(y - np.roll(y, 1))[zc]
    i = int(zc[np.argmin(cost)])
    return np.roll(y, -i), i


def finish_loop(y, meta: dict, target: float = -20.0):
    """master_mono + rotate_quiet -> (loop, meta + rotation)."""
    y, shift = rotate_quiet(master_mono(y, target))
    return y, dict(meta, rotation=shift)


def fold1(buf, L: int) -> np.ndarray:
    """fold_loop for a mono buffer -> (L,)."""
    return S.fold_loop(np.asarray(buf, dtype=float)[None, :], L)[0]


def unit(x):
    return x / max(float(np.std(x)), 1e-12)


def circ_tv(x, kind, f, q=0.7071, pre_sec=1.5):
    """Time-varying biquad on a loop (pre-roll = the loop's own end), mono."""
    x = np.asarray(x, dtype=float)
    L = x.shape[-1]
    pre = min(L, n_of(pre_sec))
    fa = np.broadcast_to(np.asarray(f, dtype=float), (L,))
    qa = np.broadcast_to(np.asarray(q, dtype=float), (L,))
    y = S.tv_filter(np.concatenate((x[..., -pre:], x), axis=-1), kind,
                    np.concatenate((fa[-pre:], fa)), np.concatenate((qa[-pre:], qa)))
    return y[..., pre:]


# ============================================================================ vehicles: one-shots
def sfx_bus_horn():
    """Retro village bus: friendly two-tone horn (F4 + A4, major third) 'bap - baaap' with a soft
    low body and a little outdoor slap-back."""
    r = S.rng(7100)
    m = Mono(1.2)
    for t0, d, g in ((0.0, 0.12, 0.8), (0.21, 0.5, 1.0)):
        for mm, gm, fm in ((65, 1.0, 820), (69, 0.8, 980)):
            m.add(t0 + r.uniform(0, 0.006), horn_tone(mm + 0.04 * r.standard_normal(), d, r, 0.85, fm, -0.6), 0.3 * gm * g)
        n = n_of(d + 0.05)
        m.add(t0, S.sine(float(S.midi_hz(53)), n) * S.env_adsr(n, 0.01, 0.05, 0.8, 0.05, gate=d), 0.12 * g)
    y = S.lp(m.x, 5000)
    y = I.verb_mono(y, rt60=0.6, mix=0.12, tail=0.35, predelay=0.02, size=0.8)
    return y


def sfx_car_honk(v: int):
    """Little round toy cars. v1 'meep-meep' (C5 + E5, two quick bright pips),
    v2 squeeze-bulb 'hoonk' (reedy buzz that bends up, wobbles and sighs down as the bulb empties)."""
    r = S.rng(7200 + v)
    m = Mono(0.8)
    if v == 1:
        for t0 in (0.0, 0.15):
            for mm, gm, fm in ((72, 1.0, 1250), (76, 0.75, 1500)):
                m.add(t0, horn_tone(mm, 0.085, r, 1.0, fm, -0.4, rel=0.03, buzz=0.45, pw=0.25), 0.32 * gm)
        y = S.lp(m.x, 6500)
    else:
        dur = 0.36
        n = n_of(dur + 0.06)
        t = tax(n)
        semis = np.interp(t, [0, 0.03, 0.08, 0.26, dur, dur + 0.06], [-4.0, -1.2, 0.0, -0.3, -2.2, -3.0])
        semis = semis + 0.18 * np.sin(TAU * 9.0 * t) * np.clip((t - 0.06) / 0.05, 0, 1)
        f = float(S.midi_hz(66)) * 2 ** (semis / 12)            # ~F#4/G4 rubber-reed honk
        x = 0.55 * S.square(f, n, 0.18, r.random()) + 0.45 * S.saw(f, n, r.random())
        x = S.lp(x, 3200, 0.8, order=2)
        x = S.peq(x, 1150, 8.0, 1.8)
        x = S.peq(x, 2500, 4.0, 2.5)
        env = S.env_pts([(0, 0), (0.025, 0.9), (0.08, 1.0), (0.26, 0.85), (dur, 0.35), (dur + 0.06, 0)], n)
        m.add(0.02, x * env, 0.55)
        sq = S.bp(r.standard_normal(n_of(0.05)), 1800, 1.0) * S.env_pts([(0, 0), (0.008, 1), (0.05, 0)], n_of(0.05))
        m.add(0.0, sq, 0.08)                                     # rubber bulb squeeze
        y = m.x
    return I.verb_mono(y, rt60=0.5, mix=0.1, tail=0.25, predelay=0.015, size=0.7)


def sfx_steam_whistle():
    """Cute steam wagon whistle: valve 'tss', then a three-pipe chime whistle (F5 A5 C6)
    'toot - toooot' with a pressure swoop and a puff of escaping steam after each toot."""
    r = S.rng(7300)
    m = Mono(2.0)
    n = n_of(0.08)
    m.add(0.0, S.hp(r.standard_normal(n), 3000, order=2) * S.env_pts([(0, 0), (0.01, 1), (0.08, 0)], n), 0.05)
    for t0, d, g in ((0.05, 0.16, 0.8), (0.34, 0.72, 1.0)):
        for mm, gm in ((77, 1.0), (81, 0.8), (84, 0.62)):
            m.add(t0 + r.uniform(0, 0.012), whistle_pipe(mm, d, r, -1.3 - 0.4 * r.random()), 0.26 * gm * g)
        k = n_of(0.4)
        steam = S.hp(r.standard_normal(k), 2200, order=2) * S.env_pts([(0, 0), (0.03, 1), (0.4, 0)], k)
        m.add(t0 + d + 0.02, steam, 0.05 * g)
        k2 = n_of(d + 0.1)
        hiss = S.bp(r.standard_normal(k2), 5000, 0.8) * S.env_adsr(k2, 0.02, 0.05, 0.6, 0.1, gate=d)
        m.add(t0, hiss, 0.035 * g)
    y = S.lp(m.x, 9000)
    return I.verb_mono(y, rt60=1.0, mix=0.16, tail=0.5, predelay=0.025, size=0.9)


def sfx_brakes():
    """Bus / truck pulls up gently: tyres scrunch on packed snow, a short soft brake squeal that
    sinks in pitch, the body settles ('thunk'), then the air brakes sigh 'pssht'."""
    r = S.rng(7400)
    m = Mono(1.3)
    n = n_of(0.5)
    t = tax(n)
    crunch = np.zeros(n)
    for t0 in np.sort(r.uniform(0, 0.42, 70)):
        k = n_of(0.005)
        i = n_of(t0)
        crunch[i:i + k] += burst(r, 0.005, r.uniform(1200, 5000), 1.3, tau=0.0008)[:max(0, min(k, n - i))] * r.uniform(0.2, 1)
    crunch += S.lp(r.standard_normal(n), 900, order=2) * 0.25
    m.add(0.0, crunch * S.env_pts([(0, 0), (0.05, 1), (0.35, 0.7), (0.5, 0)], n), 0.22)
    d = 0.34
    k = n_of(d)
    tt = tax(k)
    f = 1350 * (1 - 0.16 * tt / d) * (1 + 0.006 * np.sin(TAU * 29 * tt))
    sq = S.additive(f, k, [(1, 1.0), (2, 0.22), (3, 0.06)], fmax=8000)
    sq *= (1 - 0.3 * (0.5 + 0.5 * np.sin(TAU * 41 * tt))) * S.env_pts([(0, 0), (0.06, 0.7), (0.22, 1.0), (d, 0)], k)
    m.add(0.12, sq, 0.16)
    m.add(0.47, blip(150, 85, 0.14, 0.02, 0.035, attack=0.002), 0.32)         # body settles
    m.add(0.47, S.modal(240, n_of(0.15), [(1, 1, 0.07), (1.7, 0.4, 0.04)], r), 0.18)
    ta = 0.6
    k = n_of(0.55)
    air = S.hp(r.standard_normal(k), 1500, order=2)
    air = air * 0.7 + S.bp(r.standard_normal(k), 4200, 0.9) * 0.6
    m.add(ta, air * S.env_pts([(0, 0), (0.015, 1.0), (0.12, 0.55), (0.55, 0)], k), 0.2)
    return room(S.lp(m.x, 9000), 0.45, 0.08, 0.15, 0.6)


def sfx_door():
    """Vehicle door: handle click, a tiny swing whoosh, solid rounded 'ka-THUNK' with the latch
    catching twice and a little panel rattle."""
    r = S.rng(7500)
    m = Mono(0.7)
    m.add(0.0, burst(r, 0.005, 3600, 1.2, tau=0.0008), 0.35)
    m.add(0.0, S.modal(1750, n_of(0.05), [(1, 1, 0.025), (2.3, 0.4, 0.012)], r, attack=0.0003), 0.12)
    m.add(0.06, nsweep(r, 0.16, 350, 900, 1.0, [(0, 0), (0.08, 1), (0.16, 0)]), 0.07)
    tk = 0.21
    m.add(tk, blip(170, 90, 0.12, 0.015, 0.028, attack=0.0015), 0.5)
    m.add(tk, S.modal(320, n_of(0.18), [(1, 1, 0.06), (1.62, 0.6, 0.045), (2.45, 0.4, 0.03), (3.7, 0.2, 0.015)], r,
                      attack=0.0006), 0.7)
    m.add(tk, S.lp(r.standard_normal(n_of(0.05)), 1300, order=2) * S.env_exp(n_of(0.05), 0.01, 0.001), 0.45)
    m.add(tk, burst(r, 0.05, 750, 1.0, tau=0.012), 0.55)                     # mid 'chunk'
    for k, (dt, g) in enumerate(((0.004, 0.55), (0.028, 0.35))):              # latch catches
        m.add(tk + dt, burst(r, 0.004, 4200, 1.2, tau=0.0007), g)
        m.add(tk + dt, S.modal(2700 + 300 * k, n_of(0.05), [(1, 1, 0.02), (1.5, 0.5, 0.01)], r), g * 0.35)
    for k in range(3):                                                        # panel rattle
        m.add(tk + 0.05 + k * 0.021 + r.uniform(0, 0.006), burst(r, 0.006, 1900, 1.4, tau=0.0012), 0.12 / (k + 1))
    return room(m.x, 0.35, 0.08, 0.12, 0.5)


# ============================================================================ town bells
def sfx_bell_hall():
    """Town-hall tower bells: two bells a fifth apart, 'ding (C) - dong (F) - ding - DONG', ringing out
    over the square (major-third tierce = warm and festive; doubles as the wedding bell)."""
    r = S.rng(7600)
    m = Mono(4.6)
    hits = ((0.0, 60, 0.85), (0.6, 53, 0.95), (1.2, 60, 0.8), (1.8, 53, 1.0))      # primes C4 / F3 -> strike C5 / F4
    for t0, pm, v in hits:
        m.add(t0, tower_bell(pm, r, t60=3.4 if pm == 53 else 2.8, vel=v, dur=4.4 - t0), 0.5 if pm == 53 else 0.4)
    y = S.hp(S.lp(m.x, 7000), 110, order=2)
    y = S.peq(y, 900, 2.0, 0.8)                      # strike-note presence on phone speakers
    y = I.verb_mono(y, rt60=2.2, mix=0.2, tail=0.2, predelay=0.04, size=1.0)
    return tail_fade(y, 1.0)


def sfx_school_bell():
    """School hand bell (C6, brass) swung back and forth: 'dingalingaling' for ~1.6 s, the clapper
    hitting both sides, loudness swaying with the swing, then it rings out."""
    r = S.rng(7700)
    m = Mono(3.0)
    swing = 0.27                                      # one back-and-forth; the clapper hits on both ends
    t = 0.0
    k = 0
    while t < 1.6:
        v = (1.0 if k % 2 == 0 else 0.72) * r.uniform(0.85, 1.0) * (1.0 if t < 1.2 else 0.85)
        m.add(t, handbell(84, r, v, t60=1.25), 0.32)
        t += swing / 2 + r.normal(0, 0.006)
        k += 1
    y = m.x
    tt = tax(len(y))
    sway = 1 - 0.22 * (0.5 + 0.5 * np.cos(TAU * tt / swing)) * np.clip(1.0 - (tt - 1.6) / 0.3, 0, 1)
    y = S.lp(y * sway, 8500)
    y = I.verb_mono(y, rt60=0.9, mix=0.12, tail=0.2, predelay=0.012, size=0.7)
    return tail_fade(y, 0.6)


# ============================================================================ life
def sfx_baby_giggle():
    """Happy baby in the stroller: two little rattle shakes, then a tiny breathy giggle
    'heh-heh-heh-heh' and a rising coo 'aah~' - very high, soft and short so it reads as cute, not uncanny."""
    r = S.rng(7800)
    m = Mono(1.4)
    m.add(0.0, rattle(r, 0.08, 800), 0.16)
    m.add(0.12, rattle(r, 0.07, 800), 0.12)
    sylls = [("h", "e", 0.075, 1.0, -0.04, 0.8), ("h", "a", 0.072, 1.07, -0.05, 0.95),
             ("h", "a", 0.072, 1.02, -0.05, 0.9), ("h", "e", 0.075, 0.97, -0.06, 0.82),
             ("", "a", 0.27, 1.06, 0.2, 0.72)]
    y = utter(r, sylls, 470, fs=1.38, tilt=0.95, breath=0.06, jitter=0.005, vib=0.012, vib_rate=6.5,
              fmax=9500.0, asp_gain=0.4, burst_gain=0.1)
    y = S.hp(y, 220)
    y = S.lp(y, 6500)
    m.add(0.22, y, 0.62)
    return room(m.x, 0.3, 0.06, 0.12, 0.45)


# ============================================================================ missions & fame
def sfx_mission_done():
    """Mission complete: the mission card gets a soft rubber-stamp 'thunk', then a quick marimba +
    glock run on the village hook 'A C D' landing on F with a plucked F chord, bell and sparkles."""
    r = S.rng(7900)
    m = Mono(2.0)
    m.add(0.0, blip(190, 92, 0.12, 0.018, 0.035, attack=0.0015), 0.55)              # stamp
    m.add(0.0, S.lp(r.standard_normal(n_of(0.04)), 1100, order=2) * S.env_exp(n_of(0.04), 0.008, 0.001), 0.5)
    m.add(0.002, burst(r, 0.02, 2300, 0.9, tau=0.003), 0.25)                        # paper slap
    T = 0.13
    run = ((0.0, 81), (0.07, 84), (0.14, 86), (0.24, 89))                           # A5 C6 D6 -> F6
    for dt, mm in run:
        last = mm == 89
        m.add(T + dt, I.marimba(mm - 12, 0.85 if last else 0.7, r), 0.42 if last else 0.34)
        m.add(T + dt, I.glock(mm, 0.8 if last else 0.6, r), 0.3 if last else 0.2)
    tl = T + 0.24
    for k, mm in enumerate((65, 69, 72, 77)):                                       # F4 A4 C5 F5 strum
        m.add(tl + 0.012 * k, I.pluck(mm, 0.7, r, t60=1.4, dur=0.9, bright=0.55), 0.18)
    m.add(tl, I.bass(41, 0.8, 0.5, r), 0.32)
    m.add(tl, I.pad_chord([65, 69, 72, 77], 0.5, r, cutoff=2200, attack=0.02, release=0.7), 0.3)
    m.add(tl + 0.03, chime(float(S.midi_hz(96)), 0.9, 0.7, r), 0.18)                # C7 ding
    sparkles(m, r, tl + 0.12, 6, 0.07, 0.15)
    return room(m.x, 1.0, 0.16, 0.45, 0.8)


def sfx_fame_up():
    """Fame up (star medal): soft timpani roll under brass 'ta-ta-ta-TAAA' (C5 C5 C5 -> F major),
    a crash, a rising glock run to F7 and a bright star 'shing' with sparkles."""
    r = S.rng(8000)
    m = Mono(3.0)
    e = 0.105
    for k in range(3):
        m.add(k * e, I.brass(72, 0.75 + 0.05 * k, 0.07, bright=0.9), 0.36)
        m.add(k * e, I.glock(84, 0.5, r), 0.12)
    t = 0.0
    while t < 3 * e:                                                         # timpani-ish roll
        m.add(t, I.tom(41, 0.3 + 0.5 * t / (3 * e)), 0.25)
        t += 0.045
    tf = 3 * e + 0.03
    for mm, g in ((65, 0.22), (69, 0.22), (72, 0.24), (77, 0.32)):
        m.add(tf, I.brass(mm, 0.9, 0.85, bright=1.0), g)
    m.add(tf, I.bass(41, 0.9, 0.9, r), 0.4)
    m.add(tf, I.kick(0.8, r), 0.4)
    m.add(tf, I.tom(41, 0.7), 0.35)
    m.add(tf - 0.004, I.cymbal_soft(0.65, 1.8, r), 0.4)
    for k, mm in enumerate((77, 81, 84, 89, 93, 96, 101)):                  # F5 .. F7
        m.add(tf + 0.05 + k * 0.045, I.glock(mm, 0.55 + 0.05 * k, r), 0.22)
    ts = tf + 0.38
    m.add(ts, chime(float(S.midi_hz(101)), 1.1, 0.9, r), 0.2)                # star 'shing'
    m.add(ts, nsweep(r, 0.5, 3000, 9000, 1.2, [(0, 0), (0.05, 1), (0.5, 0)]), 0.05)
    m.add(ts, I.bell_fm(89, 0.6, t60=1.8), 0.14)
    sparkles(m, r, ts + 0.08, 12, 0.07, 0.18, decay=8.0)
    return tail_fade(room(m.x, 1.4, 0.2, 0.7, 1.0), 0.5)


# ============================================================================ vehicle loops
def _place(buf, t_samples: float, sig, g: float = 1.0, L: int | None = None):
    """Add sig at sample t (rounded). Loop layers pass L: an onset jittered before 0 moves to the loop
    end (fold_loop then carries its tail across the wrap); otherwise its head is cropped."""
    i = int(round(t_samples))
    if i < 0 and L:
        i += L
    if i < 0:
        sig, i = sig[-i:], 0
    e = min(len(buf), i + len(sig))
    if e > i:
        buf[i:e] += g * sig[:e - i]


def render_truck_engine(seed: int = 8100, loop_samples=None, nominal: float = 1.6):
    """Toy delivery-truck engine, steady run (mono loop). Two-cylinder 'putt-putt' at ~13 firings/s:
    every firing = exhaust pop + resonant pipe tone + mid 'putt'; under it a harmonic hum locked to
    the firing rate, valve ticks, a faint gear whine and a body rattle. A whole number of firings
    fits the loop, so it is seamless at any length. The firing grid starts 0.35-0.65 of a period in, so
    the wrap falls between two pops (no attack straddles it); that phase is a fixed function of the loop
    length, which gives build_audio.fit_loop a different block layout at the file end for every candidate
    length (with a constant phase the end geometry is translation-invariant and the Vorbis end padding
    never reaches 0). Play with rate 0.85 (idle) .. 1.3 (driving)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    dur = L / SR
    k = max(2, 2 * int(round(dur * 13.0 / 2)))                 # even: the two cylinders alternate
    P = L / k
    ff = SR / P                                                # firing rate (Hz), exact over the loop
    ph = 0.35 + 0.3 * (((L // 64) * 0.6180339887) % 1.0)       # grid phase in periods (see docstring)
    buf = np.zeros(L + n_of(0.3))
    for i in range(k):
        cyl = i % 2
        g = (1.0 if cyl == 0 else 0.8) * (1 + 0.07 * r.standard_normal())
        n = n_of(0.06)
        pop = S.lp(r.standard_normal(n), 650, order=2) * S.env_exp(n, 0.006, 0.0008)
        f1 = (104 if cyl == 0 else 98) * (1 + 0.015 * r.standard_normal())
        tone = S.modal(f1, n, [(1, 1, 0.045), (2.1, 0.45, 0.025), (3.3, 0.2, 0.012)], r, attack=0.001)
        putt = S.bp(r.standard_normal(n), 420, 1.6) * S.env_exp(n, 0.009, 0.0008)
        _place(buf, (i + ph) * P + r.normal(0, 0.0007) * SR, pop * 0.9 + tone * 1.1 + putt * 0.7, g, L)
        # valve tick (two per firing interval, tiny)
        for h in (0.25, 0.75):
            _place(buf, (i + ph + h) * P, burst(r, 0.003, 3800, 1.5, tau=0.0005), 0.035, L)
    y = fold1(buf, L)
    t = np.arange(L) / SR
    hum = S.additive(ff, L, [(h, 1.0 / (1 + ((h * ff - 220) / 160) ** 2)) for h in range(1, 28)], fmax=6000)
    y = unit(y) + 0.28 * unit(hum)
    whine = S.sine(ff * 61, L) * (0.75 + 0.25 * np.sin(TAU * ff / 2 * t))
    y = y + 0.025 * whine
    rat = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 1600.0) / 0.8) ** 2))
    fire_env = 0.5 + 0.5 * np.cos(TAU * ff * (t - ph / ff)) ** 2
    y = y + 0.08 * unit(rat) * fire_env
    y = S.filt_circ(y, "hp", 55, order=2)
    y = S.filt_circ(y, "peak", 450, 0.9, 3.0)                  # 'putt' presence on phone speakers
    y = S.filt_circ(y, "lp", 5500)
    return finish_loop(y, {"loopSamples": L, "firings": k, "firingHz": round(ff, 3), "phase": round(ph, 4)})


def render_sleigh_bells(seed: int = 8200, loop_samples=None, nominal: float = 2.4):
    """Harness sleigh bells for the horse sleigh bus (mono loop): a jingle on every trot step
    (8 per loop, accented 1 & 5, same tempo as sfx_horse_trot) plus a soft shimmer of single bells."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    beat = L / 8
    buf = np.zeros(L + n_of(0.6))
    acc = [1.0, 0.55, 0.78, 0.5, 0.92, 0.55, 0.75, 0.5]
    for i in range(8):
        v = acc[i] * r.uniform(0.9, 1.0)
        _place(buf, i * beat + r.normal(0, 0.004) * SR, I.sleigh(0.8, r, nbells=7 if acc[i] > 0.7 else 5), 0.55 * v, L)
    t = 0.0
    while t < L / SR:                                              # loose single bells between the steps
        t += r.exponential(0.06)
        if t >= L / SR:
            break
        f = r.uniform(2400, 3600)
        b = S.modal(f, n_of(0.25), [(1, 1, r.uniform(0.1, 0.22)), (1.47, 0.5, 0.1), (2.09, 0.2, 0.06)], r, fmax=7800)
        _place(buf, t * SR, b, 0.05 * r.uniform(0.4, 1.0))
    y = fold1(buf, L)
    y = S.filt_circ(y, "hp", 900, order=2)
    y = S.filt_circ(y, "lp", 8000)
    return finish_loop(y, {"loopSamples": L, "steps": 8})


def hoof(r, pitch: float, vel: float = 1.0) -> np.ndarray:
    """One hoof on packed snow over cobbles: hollow 'coconut' knock + click + soft thud + snow crunch."""
    n = n_of(0.14)
    y = S.modal(pitch, n, [(1, 1, 0.05), (1.48, 0.45, 0.03), (2.31, 0.25, 0.015), (3.2, 0.1, 0.008)], r,
                attack=0.0004)
    y[:n_of(0.006)] += burst(r, 0.006, 3200, 1.0, tau=0.0009) * 0.5
    th = blip(170, 85, 0.1, 0.012, 0.022, attack=0.001)
    y[:len(th)] += th * 0.6
    for t0 in np.sort(r.gamma(2.0, 0.008, 9)):
        if t0 < 0.06:
            k = n_of(0.005)
            i = n_of(t0)
            y[i:i + k] += burst(r, 0.005, r.uniform(1800, 5500), 1.3, tau=0.0007)[:max(0, min(k, n - i))] * \
                r.uniform(0.1, 0.35) * np.exp(-t0 / 0.03)
    return y * vel


def render_horse_trot(seed: int = 8300, loop_samples=None, nominal: float = 2.4):
    """Two draft horses trotting (mono loop): 4 strides per loop, two beats per stride ('clip' high,
    'clop' low), the second horse a hair behind and a little lower -> 'clippety-clop'. Same tempo
    (8 steps / 2.4 s) as sfx_sleigh_bells."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    stride = L / 4
    buf = np.zeros(L + n_of(0.3))
    for s in range(4):
        for b, (pitch, v) in enumerate(((820, 1.0), (640, 0.86))):
            t0 = s * stride + b * stride / 2
            _place(buf, t0 + r.normal(0, 0.003) * SR, hoof(r, pitch * r.uniform(0.97, 1.03), v * r.uniform(0.9, 1.0)), 0.8, L)
            _place(buf, t0 + (0.085 + r.normal(0, 0.004)) * SR,
                   hoof(r, pitch * 0.88 * r.uniform(0.97, 1.03), v * r.uniform(0.85, 1.0)), 0.55)
    y = fold1(buf, L)
    y = S.filt_circ(y, "hp", 70, order=2)
    wet = S.reverb(np.concatenate((y, y)), rt60=0.5, hf_rt60=0.25, predelay=0.008, size=0.5).mean(axis=0)[L:]
    y = y + 0.1 * wet                                               # a little street space (circular: 2nd pass)
    return finish_loop(y, {"loopSamples": L, "strides": 4})


# ============================================================================ ambience loops
_MEMO = {}


def _memo(key, fn):
    if key not in _MEMO:
        _MEMO[key] = fn()
    return _MEMO[key]


def owl_call(r, f0: float, pattern) -> np.ndarray:
    """Tawny-owl-like 'hoo' notes (soft, rounded 'u' formants, breathy). pattern = [(t, dur, quaver), ...]."""
    total = max(t + d for t, d, _ in pattern) + 0.1
    out = np.zeros(n_of(total))
    for t0, d, quav in pattern:
        n = n_of(d)
        t = tax(n)
        f = f0 * np.interp(t, [0, 0.05, d * 0.6, d], [0.93, 1.0, 0.99, 0.94])
        f = f * (1 + 0.025 * quav * np.sin(TAU * 11 * t))
        amp = S.env_pts([(0, 0), (min(0.06, d * 0.3), 1.0), (d * 0.7, 0.85), (d, 0)], n)
        if quav:
            amp = amp * (1 - 0.3 * quav * (0.5 + 0.5 * np.sin(TAU * 11 * t)))
        y = I.formant_voice(f, amp, [(f0 * 1.05, 160, 1.0), (f0 * 2.0, 260, 0.3), (2400, 400, 0.05)], r,
                            breath=0.12, tilt=1.6, jitter=0.004, fmax=4500.0)
        i = n_of(t0)
        out[i:i + n] += y
    return out


def _night_events(seed: int, nominal: float):
    """Expensive, length-independent event layer of amb_night (memoised): owl + answer, chimes, snow flump."""
    r = S.rng(seed + 1)
    total = n_of(nominal + 4.0)
    buf = np.zeros(total)
    o1 = owl_call(r, 560, [(0.0, 0.5, 0), (1.25, 0.12, 0), (1.5, 0.14, 0), (1.78, 0.8, 1.0)])
    o2 = owl_call(r, 505, [(0.0, 0.42, 0), (0.95, 0.6, 0.6)])
    for t0, o, g in ((4.6, o1, 1.0), (13.4, o2, 0.6)):
        o = S.lp(o, 2600)
        o = I.verb_mono(o, rt60=2.4, mix=0.75, tail=2.5, predelay=0.05, size=1.0, hi_cut=3200)
        _place(buf, t0 * SR, o / max(S.peak(o), 1e-9), 0.4 * g)
    for k, mm in enumerate((89, 84, 93, 86, 96)):                     # faint distant wind chime
        c = mix((I.glock(mm, 0.5, r), 0.6), (I.musicbox(mm, 0.4, r), 0.4))
        _place(buf, (10.2 + k * 0.23 + r.uniform(0, 0.08)) * SR, c, 0.03 * r.uniform(0.6, 1.0))
    n = n_of(0.9)                                                     # snow sliding off a branch: 'fff-flump'
    sl = S.lp(r.standard_normal(n), 1800, order=2) * S.env_pts([(0, 0), (0.5, 0.6), (0.62, 1.0), (0.9, 0)], n)
    _place(buf, 15.6 * SR, sl, 0.05)
    _place(buf, 16.22 * SR, blip(120, 70, 0.2, 0.03, 0.06, attack=0.004), 0.05)
    return buf


def render_night(seed: int = 8400, loop_samples=None, nominal: float = 17.0):
    """Winter night (mono loop): soft dark wind with slow gusts and a low airy howl, faint snow hiss,
    a distant owl ('hoo ... hu-hu-hoooo') answered by a second owl, a faint wind chime, snow
    sliding off a branch. Calm and cosy - nothing sharp or scary."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    gust = S.periodic_curve(L, r, 1, 5, slope=1.2)
    wob = S.periodic_curve(L, r, 2, 9, slope=0.9)
    base = S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 380.0) / 1.4) ** 2) / np.sqrt(np.maximum(f, 30)))
    fc = 200 + 420 * gust ** 1.3
    body = unit(circ_tv(base, "bp", fc, 0.8)) * (0.35 + 0.65 * gust ** 1.6)
    howl = unit(circ_tv(S.pink(L, r), "bp", 330 + 160 * wob, 11.0)) * 0.16 * gust ** 2.4
    hiss = unit(S.filt_circ(S.filt_circ(S.noise_fft(L, r), "hp", 4500, order=2), "lp", 8000)) * 0.03 * (0.3 + 0.7 * gust)
    rumble = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 80.0) ** 4))) * 0.14 * (0.5 + 0.5 * gust)
    bed = body + howl + hiss + rumble
    bed = S.filt_circ(bed, "hp", 40, order=2)
    ev = _memo(("night", seed, nominal), lambda: _night_events(seed, nominal))
    y = unit(bed) * 0.075 + fold1(ev, L)
    return finish_loop(y, {"loopSamples": L})


# ---------------------------------------------------------------------------- amb_town
_CONS = ["b", "d", "m", "n", "w", "y", "l", "h", ""]
_VOW = ["a", "e", "i", "o", "u", "a", "o", "e"]


def _babble(r, kid: bool) -> np.ndarray:
    """One indistinct passer-by phrase (4-8 syllables) from the sfx2 syllable sequencer."""
    k = int(r.integers(4, 9))
    f0 = r.uniform(330, 440) if kid else r.uniform(140, 250)
    fs = r.uniform(1.15, 1.25) if kid else r.uniform(0.95, 1.08)
    sylls = []
    for i in range(k):
        last = i == k - 1
        sylls.append((str(r.choice(_CONS)), str(r.choice(_VOW)), r.uniform(0.085, 0.14) * (1.5 if last else 1.0),
                      r.uniform(0.92, 1.12), (r.uniform(-0.12, 0.2) if last else r.uniform(-0.04, 0.04)),
                      r.uniform(0.75, 1.0)))
    y = utter(r, sylls, f0, fs=fs, tilt=0.95 if kid else 1.05, breath=0.03, jitter=0.005,
              fmax=7000.0, asp_gain=0.3, burst_gain=0.12)
    return S.hp(y, 140 if kid else 100)


def _town_events(seed: int, nominal: float):
    """Expensive, length-independent layer of amb_town (memoised): chatter, laughs, footsteps,
    passing cars, a shop-door bell."""
    import sfx as V1
    r = S.rng(seed + 1)
    dur = nominal
    buf = np.zeros(n_of(dur + 4.0))
    voices = np.zeros_like(buf)
    t = 0.2
    while t < dur:                                                    # passers-by chatting nearby (2-3 at a time)
        kid = r.random() < 0.3
        y = _babble(r, kid)
        g = r.uniform(0.35, 1.0) * (0.8 if kid else 1.0)
        _place(voices, t * SR, y / max(S.peak(y), 1e-9), g)
        t += r.uniform(0.35, 0.9)
    far = np.zeros_like(buf)
    t = 0.05
    while t < dur:                                                    # the crowd further away (dense, soft)
        y = _babble(r, r.random() < 0.25)
        _place(far, t * SR, y / max(S.peak(y), 1e-9), r.uniform(0.25, 0.6))
        t += r.uniform(0.1, 0.28)
    far = S.lp(far, 2300)
    far = I.verb_mono(far, rt60=1.4, mix=0.8, tail=0.0, predelay=0.03, size=1.0)[:len(buf)]
    buf += far * 0.1
    for t0, kid in ((5.3, True), (12.1, False)):                      # distant laughs
        sy = [("h", "i" if kid else "a", 0.09, 1.0 - 0.04 * i, -0.05, 1.0 - 0.08 * i) for i in range(4)]
        y = utter(r, sy, 470 if kid else 230, fs=1.2 if kid else 1.04, tilt=0.95, breath=0.06, asp_gain=0.45,
                  fmax=7000.0)
        _place(voices, t0 * SR, y / max(S.peak(y), 1e-9), 0.7)
    voices = S.lp(voices, 3600)
    voices = I.verb_mono(voices, rt60=0.9, mix=0.45, tail=0.0, predelay=0.02, size=0.9)[:len(buf)]
    buf += voices * 0.24
    for t0, step, cnt, g in ((0.6, 0.36, 9, 1.0), (6.4, 0.33, 10, 0.8), (11.2, 0.39, 8, 0.9)):   # walkers pass by
        for i in range(cnt):
            st = V1.sfx_step_snow(int(r.integers(1, 4)))
            rate = r.uniform(0.9, 1.15)
            st = np.interp(np.arange(int(len(st) / rate)) * rate, np.arange(len(st)), st)
            env = np.sin(np.pi * (i + 0.5) / cnt) ** 1.5
            _place(buf, (t0 + i * step + r.normal(0, 0.012)) * SR, st / max(S.peak(st), 1e-9), 0.05 * g * env)
    for t0, f_eng, g in ((3.2, 92.0, 1.0), (10.0, 108.0, 0.8)):      # gentle car passing by in the distance
        d = 3.2
        n = n_of(d)
        tt = tax(n)
        x = (tt - d / 2) / 0.9
        swell = 1.0 / (1 + x ** 2)
        fdop = f_eng * (1 + 0.035 * np.tanh(-x * 1.4))
        eng = S.additive(fdop, n, [(h, 1.0 / h) for h in range(1, 12)], fmax=2500)
        tyre = S.bp(r.standard_normal(n), 900, 0.6) + 0.5 * S.hp(r.standard_normal(n), 2500)
        car = (unit(eng) * 0.5 + unit(tyre) * 0.6) * swell
        car = S.lp(car, 2800)
        _place(buf, t0 * SR, car * S.env_pts([(0, 0), (0.3, 1), (d - 0.3, 1), (d, 0)], n), 0.05 * g)
    bell = sum(coin_hit(r, f, 0.5) * a for f, a in ((1760.0, 1.0), (2093.0, 0.7)))   # shop door bell 'ting-a-ling'
    for k in range(3):
        _place(buf, (8.1 + k * 0.09) * SR, bell, 0.025 * (1 - 0.25 * k))
    return buf


def render_town(seed: int = 8500, loop_samples=None, nominal: float = 14.0):
    """Busy town (mono loop): a warm crowd 'walla' (formant-shaped noise with syllable-rate flutter in
    three decorrelated layers), passers-by chatting in the cute babble voices, two distant laughs,
    footsteps in the snow, a far traffic hum with two gentle car pass-bys, a shop-door bell."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    walla = np.zeros(L)
    for layer in range(3):
        sh = (lambda f, s=layer: sum(g / (1 + ((f - F * (1 + 0.06 * s)) / 280.0) ** 2)
                                     for F, g in ((560, 1.0), (1250, 0.75), (2500, 0.3))) / np.sqrt(np.maximum(f, 60)))
        nz = S.noise_fft(L, r, sh)
        flutter = S.periodic_curve(L, r, int(L / SR * 1.5), int(L / SR * 5.0), slope=0.4)
        walla += unit(nz) * (0.35 + 0.65 * flutter ** 1.5) * (0.8 + 0.2 * S.periodic_curve(L, r, 1, 4))
    walla = S.filt_circ(walla, "lp", 3400)
    hum = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 140.0) ** 2) / np.maximum(f, 30))) * \
        (0.8 + 0.2 * S.periodic_curve(L, r, 1, 3))
    bed = unit(walla) * 0.03 + hum * 0.03
    ev = _memo(("town", seed, nominal), lambda: _town_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 50, order=2)
    return finish_loop(y, {"loopSamples": L})


# ============================================================================ registry
SFX3 = {
    "sfx_bus_horn": sfx_bus_horn,
    "sfx_car_honk_1": lambda: sfx_car_honk(1), "sfx_car_honk_2": lambda: sfx_car_honk(2),
    "sfx_steam_whistle": sfx_steam_whistle, "sfx_brakes": sfx_brakes, "sfx_door": sfx_door,
    "sfx_bell_hall": sfx_bell_hall, "sfx_school_bell": sfx_school_bell,
    "sfx_baby_giggle": sfx_baby_giggle,
    "sfx_mission_done": sfx_mission_done, "sfx_fame_up": sfx_fame_up,
}
# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH3 = {
    "sfx_door": dict(punch=4), "sfx_brakes": dict(punch=2), "sfx_mission_done": dict(punch=2),
    "sfx_fame_up": dict(punch=2), "sfx_bell_hall": dict(punch=2, fout=0.05), "sfx_school_bell": dict(punch=2, fout=0.05),
    "sfx_car_honk_1": dict(punch=1), "sfx_car_honk_2": dict(punch=1), "sfx_bus_horn": dict(punch=1),
    "sfx_baby_giggle": dict(punch=1, fout=0.02), "sfx_steam_whistle": dict(punch=1, fout=0.03),
}
# loop renders (key -> function name in this module); called by build_audio.fit_loop(loop_samples=n)
LOOP_FUNCS = {"sfx_truck_engine": "render_truck_engine", "sfx_sleigh_bells": "render_sleigh_bells",
              "sfx_horse_trot": "render_horse_trot", "amb_night": "render_night", "amb_town": "render_town"}


def render(key: str) -> np.ndarray:
    """Same mastering chain as sfx.render / sfx2.render: optional punch limiter -> synth.finish_sfx (-1.5 dBFS)."""
    y = np.asarray(SFX3[key](), dtype=float)
    opts = dict(FINISH3.get(key, {}))
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
        print(f"{k:20s} {len(y) / SR:6.2f}s  peak {S.db(S.peak(y)):6.2f} dBFS  {lv}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or (list(SFX3) + list(LOOP_FUNCS)))
