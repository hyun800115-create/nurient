"""Frost Village - v4.2 office + loop-rail sounds (CONTRACT_V42 section AM) by procedural synthesis (library + script).

Same toolkit, layering style and mastering as sfx.py ... sfx6.py (imported, never edited). Cute, warm, soft:
  office      sfx_typewriter (+ _2, _3: four soft key clacks, the third variant ends on the tiny margin bell),
              sfx_mailbox_flag (tin flag flips up and clacks + a tiny bell), sfx_coin_sack (+ _2, _3: the courier
              딸랑이 shakes the coin sack 'ttallang-ttallang' - muffled coins in cloth + her little bell pin),
              amb_office (24 s loop: two typists far and near, page turns, a pen, the kettle simmering on the stove,
              the wall clock ticking - texture, no voices)
  railway     sfx_switch_clack (the spring turnout lever: grab, swing, '철' + '컥' latch, a soft spring settling),
              sfx_wheel_squeal (gentle flange squeal on the loop curves: a steady 1.23 s periodic loop = the 1.2 s
              slice + the 30 ms Assets.sliceSprite keeps, so the sliced buffer loops seamlessly)
Musical bits are in F major like bgm_village (margin bell F6, mailbox bell C7, sack bell A6 / C7).

Loops follow ambience.py / sfx6.py: periodic beds from synth.noise_fft, events rendered past the end and folded back
(fold1), circular reverb, then rotate_quiet. Every loop is periodic in its own length.

Run:   python3 tools/audio/sfx7.py [key ...]        (no key = all)
       -> /tmp/fv_cache/audio7/<key>.wav  (mono 44.1 kHz float; sfx peak -1.5 dBFS, the loop -20 LUFS)
Normally called through build_audio7.py.  Deterministic (each key has a fixed seed).
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
from sfx import Mono, blip, bubble, burst, coin_hit, nsweep, room, tax  # noqa: E402
from sfx4 import creak, fold1, steel_clank, tail_fade, unit  # noqa: E402
from sfx6 import boing, circ_verb, finish_loop, paper_grains, place, wood_knock  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.environ.get("FV_AUDIO7_CACHE", "/tmp/fv_cache/audio7")


# ============================================================================ parts
def key_clack(r, vel: float = 1.0, pitch: float = 1.0, soft: float = 1.0) -> np.ndarray:
    """One typewriter key: the typebar strikes the platen (a rounded click with a 1-3 kHz body, not a needle-sharp
    tick), the plastic key cap bottoms out (hollow knock), a faint low thud, then the bar falls back (a tiny tick
    ~22 ms later) and the escapement ratchets one step."""
    n = n_of(0.16)
    y = np.zeros(n)
    place(y, 0, burst(r, 0.012, 2600 * pitch, 1.1, tau=0.0016), 0.55 * soft)              # typebar on platen
    place(y, 0, S.modal(1150 * pitch, n_of(0.07), [(1, 1, 0.035), (1.62, 0.5, 0.022), (2.71, 0.25, 0.014)], r,
                        attack=0.0004), 0.5)                                                  # hollow key-cap knock
    place(y, 0, blip(210 * pitch, 120, 0.05, 0.01, 0.014, attack=0.0008), 0.14)              # soft thud in the desk
    place(y, n_of(0.004), wood_knock(r, 760 * pitch, 0.6, 0.035), 0.22)
    # polish (critic L10): the metal type bar's own bright 'tick' (2.5-4 kHz), ~10 dB under the body, so it reads
    # as a typewriter key, not a wooden knock
    place(y, n_of(0.0005), burst(r, 0.005, 3200 * pitch, 1.6, tau=0.0007), 0.30)
    place(y, n_of(0.0012), burst(r, 0.004, 4200 * pitch, 2.0, tau=0.0005), 0.14)
    place(y, n_of(0.021 + r.uniform(0, 0.006)), burst(r, 0.006, 3400 * pitch, 1.3, tau=0.0009), 0.18)   # bar falls back
    place(y, n_of(0.032 + r.uniform(0, 0.006)), burst(r, 0.005, 2200, 1.4, tau=0.0008), 0.10)   # escapement step
    y = S.lp(y, 7500, order=2)
    return y * vel


def margin_bell(r, m: int = 89, vel: float = 1.0, t60: float = 0.55) -> np.ndarray:
    """The typewriter's tiny margin bell 'ting' (a little nickel dome, near-harmonic, F6)."""
    f = float(S.midi_hz(m))
    n = n_of(t60 * 0.9)
    y = S.modal(f, n, [(1, 1, t60), (2.32, 0.28, t60 * 0.45), (3.88, 0.1, t60 * 0.25), (1.004, 0.4, t60 * 0.9)], r,
                fmax=9000.0, attack=0.0006)
    y[:n_of(0.004)] += burst(r, 0.004, 4000, 1.2, tau=0.0007) * 0.2
    return y * vel


def carriage_zip(r, dur: float = 0.42) -> np.ndarray:
    """Carriage return: a ratchet 'zrrrrt' slowing down + the carriage stop knock."""
    n = n_of(dur + 0.08)
    y = np.zeros(n)
    t = tax(n_of(dur))
    rate = 70 * (1 - 0.55 * t / dur)
    ph = np.cumsum(rate) / SR
    for i in np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1:
        place(y, i, burst(r, 0.005, r.uniform(1800, 2600), 1.3, tau=0.0007), r.uniform(0.3, 0.5))
    place(y, 0, nsweep(r, dur, 500, 900, 1.2, [(0, 0), (0.05, 1), (dur * 0.8, 0.6), (dur, 0)]), 0.12)
    place(y, n_of(dur - 0.01), wood_knock(r, 620, 1.0, 0.05), 0.45)
    place(y, n_of(dur - 0.01), steel_clank(r, 900, 0.5, 0.06), 0.12)
    return S.lp(y, 6000, order=2)


def small_bell(r, m: float, vel: float = 1.0, t60: float = 0.35) -> np.ndarray:
    """A little round crotal bell (the courier's bell pin, a mailbox bell): bright but soft, short."""
    f = float(S.midi_hz(m))
    n = n_of(t60 + 0.02)
    y = S.modal(f, n, [(1, 1, t60), (1.59, 0.45, t60 * 0.6), (2.32, 0.3, t60 * 0.4), (3.1, 0.12, t60 * 0.25),
                       (1.006, 0.35, t60 * 0.9)], r, fmax=9500.0, attack=0.0005)
    y[:n_of(0.003)] += burst(r, 0.003, 5000, 1.2, tau=0.0005) * 0.15
    return y * vel


def tin_clack(r, vel: float = 1.0, f: float = 680.0) -> np.ndarray:
    """Thin sheet-metal clack (a tin mailbox flag hitting its stop): inharmonic plate modes, quick, a little rattle."""
    n = n_of(0.16)
    y = S.modal(f, n, [(1, 1, 0.07), (2.26, 0.7, 0.05), (3.93, 0.45, 0.035), (6.1, 0.2, 0.02)], r, fmax=9000.0,
                attack=0.0003)
    y[:n_of(0.004)] += burst(r, 0.004, 3200, 1.0, tau=0.0008) * 0.5
    for k in range(3):
        place(y, n_of(0.012 + 0.011 * k), burst(r, 0.004, 2600 + 300 * k, 1.5, tau=0.0007), 0.25 / (k + 1))
    th = blip(260, 140, 0.05, 0.01, 0.015, attack=0.0008)
    y[:len(th)] += th * 0.25
    return y * vel


def cloth_rustle(r, dur: float, lo: float = 900.0, hi: float = 3200.0) -> np.ndarray:
    n = n_of(dur)
    x = S.bp(r.standard_normal(n), np.sqrt(lo * hi), 0.7)
    grains = paper_grains(r, dur, 140, lo=lo, hi=hi)[:n]
    return unit(x) * 0.25 * S.env_pts([(0, 0), (dur * 0.2, 1), (dur, 0)], n) + grains * 0.6


def spring_coil(r, f0: float = 420.0, dur: float = 0.24) -> np.ndarray:
    """A steel return spring: a soft coil twang (inharmonic, gentle glide), no 'boing' cartoon."""
    n = n_of(dur)
    t = tax(n)
    f = f0 * (1 + 0.04 * np.exp(-t / 0.05))
    y = S.additive(f, n, [(1, 1.0), (2.7, 0.35), (4.9, 0.12)], fmax=6000)
    y = y * S.env_exp(n, 0.07, 0.002) * (1 + 0.25 * np.sin(TAU * 31 * t))
    return S.bp(y, 900, 0.6) * 0.8 + y * 0.4


# ============================================================================ office one-shots
TYPE_LAYOUT = {
    1: dict(times=(0.0, 0.135, 0.265, 0.385), pitch=(1.0, 1.04, 0.97, 1.02), vel=(1.0, 0.85, 0.92, 0.8), bell=False),
    2: dict(times=(0.0, 0.11, 0.245, 0.4), pitch=(0.98, 1.03, 1.0, 0.95), vel=(0.95, 0.9, 1.0, 0.85), bell=False),
    3: dict(times=(0.0, 0.12, 0.225, 0.315), pitch=(1.02, 0.97, 1.04, 1.0), vel=(0.9, 1.0, 0.85, 0.95), bell=True),
}


def sfx_typewriter_v(v: int):
    """Four soft key clacks on a little office typewriter (variant v); variant 3 ends on the margin bell 'ting'.
    0.6 s. cues: key1..key4 (+ bell on variant 3)."""
    r = S.rng(13000 + v)
    L = TYPE_LAYOUT[v]
    m = Mono(0.7)
    for t0, p, g in zip(L["times"], L["pitch"], L["vel"]):
        m.add(t0, key_clack(r, g, p), 0.5)
    if L["bell"]:
        m.add(0.40, margin_bell(r, 89, 1.0, 0.5), 0.2)
    y = room(m.x, 0.35, 0.07, 0.1, 0.45)
    return tail_fade(fit_len(y, 0.6), 0.12 if L["bell"] else 0.08)


def sfx_mailbox_flag():
    """The mailbox flag flips up (a tin flick), clacks against its stop, the little bell on top rings. 0.3 s.
    cues: flick 0, clack 0.05, bell 0.06."""
    r = S.rng(13100)
    m = Mono(0.5)
    m.add(0.0, burst(r, 0.01, 2400, 1.4, tau=0.002), 0.18)                          # the hinge lets go
    m.add(0.0, nsweep(r, 0.05, 900, 2200, 1.5, [(0, 0), (0.01, 1), (0.05, 0)]), 0.08)   # quick flip
    m.add(0.05, tin_clack(r, 1.0, 690), 0.55)
    m.add(0.052, tin_clack(r, 0.5, 1040), 0.18)
    m.add(0.06, small_bell(r, 96, 1.0, 0.32), 0.22)                                  # C7 'ting'
    m.add(0.115, small_bell(r, 96, 0.4, 0.22), 0.07)                                 # tiny second swing
    y = room(m.x, 0.3, 0.06, 0.08, 0.4)
    return tail_fade(fit_len(y, 0.3), 0.09)


SACK = {
    1: dict(shakes=(0.0, 0.22), coins=(9, 8), base=2700, bell=93, thump=150),
    2: dict(shakes=(0.0, 0.19), coins=(8, 10), base=2950, bell=96, thump=165),
    3: dict(shakes=(0.0, 0.25), coins=(12, 10), base=2450, bell=93, thump=128),
}


def sfx_coin_sack_v(v: int):
    """The courier shakes the coin sack 'ttallang-ttallang': two shakes of muffled coins in cloth (plus a few bright
    ones at the mouth of the sack), cloth rustle, the soft sack thump and her little bell pin. 0.5 s (variant v).
    cues: shake1 0, shake2 ~0.2."""
    r = S.rng(13200 + v)
    P = SACK[v]
    m = Mono(0.7)
    for si, (t0, cnt) in enumerate(zip(P["shakes"], P["coins"])):
        m.add(t0, blip(P["thump"], P["thump"] * 0.55, 0.12, 0.02, 0.03, attack=0.0015), 0.22)
        m.add(t0, cloth_rustle(r, 0.14), 0.07)
        for k in range(cnt):
            tt = t0 + 0.004 + r.gamma(2.0, 0.012) + 0.006 * k
            f = P["base"] * 2 ** (r.uniform(-4, 6) / 12.0)
            c = coin_hit(r, f, r.uniform(0.07, 0.14))
            muffled = r.random() < 0.65
            m.add(tt, S.lp(c, 3800, order=2) if muffled else c, r.uniform(0.18, 0.32) * (0.7 if muffled else 1.0))
        m.add(t0 + 0.02, small_bell(r, P["bell"] - 2 * si, 0.9, 0.28), 0.12)
    y = room(m.x, 0.32, 0.07, 0.1, 0.45)
    return tail_fade(fit_len(y, 0.5), 0.12)


# ============================================================================ railway one-shots
def sfx_switch_clack():
    """The spring turnout lever by the loop: a hand grabs it, the lever swings over (a short metal slide), '철' as
    the blade moves over, '컥' as the latch drops home - a bright steel clack with a low thud - and the return
    spring hums for a moment. 0.4 s. cues: grab 0, cheol 0.1, keok 0.17."""
    r = S.rng(13300)
    m = Mono(0.6)
    m.add(0.0, steel_clank(r, 1500, 0.35, 0.03), 0.10)                                # glove on the handle
    m.add(0.02, nsweep(r, 0.11, 700, 1500, 1.6, [(0, 0), (0.03, 1), (0.11, 0)]), 0.10)    # the swing / slide
    m.add(0.02, spring_coil(r, 380, 0.22), 0.10)                                      # spring stretches
    m.add(0.10, steel_clank(r, 520, 0.8, 0.12), 0.30)                                 # '철'
    m.add(0.10, S.hp(steel_clank(r, 1650, 0.8, 0.05), 700, order=2), 0.22)
    m.add(0.17, steel_clank(r, 300, 1.0, 0.16), 0.42)                                 # '컥' - the latch
    m.add(0.17, blip(130, 62, 0.14, 0.02, 0.035, attack=0.001), 0.32)
    m.add(0.17, S.hp(steel_clank(r, 1250, 1.0, 0.07), 600, order=2), 0.38)            # phone-speaker 'clack'
    m.add(0.17, wood_knock(r, 520, 0.8, 0.05), 0.18)                                  # the sleeper under it
    m.add(0.19, spring_coil(r, 300, 0.2), 0.08)                                       # the spring settles
    y = room(m.x, 0.6, 0.1, 0.15, 0.7)                                                # outdoors-ish, by the track
    return tail_fade(fit_len(y, 0.4), 0.12)


SQUEAL_PERIOD = 1.23      # one loop = the 1.2 s slice + the 30 ms Assets.sliceSprite keeps after it


def sfx_wheel_squeal():
    """Gentle flange squeal on the loop curves (polish, critic M5): a STEADY sung steel tone near 1.9 kHz with a slow
    vibrato, a softer upper voice that comes and goes, a little rail rumble and hiss - a sustained level with slow,
    shallow swells (+-2.5 dB), no silences.  Every component makes a whole number of cycles in SQUEAL_PERIOD (1.23 s
    = the 1.2 s slice + the 30 ms sliceSprite tail; noise is circular, filters and reverb are circular), so the
    sliced buffer loops seamlessly with sound.play({loop: true}).  Low-passed at 3.6 kHz: nothing shrill."""
    r = S.rng(13400)
    n = int(round(SQUEAL_PERIOD * SR))
    T = n / SR
    t = np.arange(n) / SR

    def whole(hz):                       # snap a frequency to a whole number of cycles per loop
        return max(1, round(hz * T)) / T

    f1, f2 = whole(1890.0), whole(2390.0)
    v1, v2, sw = whole(2.5), whole(6.5), 1.0 / T
    ph1 = TAU * f1 * t + (0.012 * f1 / v1) * np.sin(TAU * v1 * t + 0.7) + (0.004 * f1 / v2) * np.sin(TAU * v2 * t)
    sq = np.sin(ph1) + 0.12 * np.sin(2 * ph1 + 0.4)
    swell = (1 + 0.16 * np.sin(TAU * sw * t + 0.3) + 0.09 * np.sin(TAU * 2 * sw * t + 1.9)
             + 0.05 * np.sin(TAU * 5 * sw * t + 4.0))
    wob = 0.86 + 0.14 * np.sin(TAU * whole(5.0) * t + 1.1)
    ph2 = TAU * f2 * t + (0.009 * f2 / whole(3.3)) * np.sin(TAU * whole(3.3) * t)
    upper = np.sin(ph2) * 0.30 * (0.45 + 0.55 * (0.5 + 0.5 * np.sin(TAU * 2 * sw * t + 2.4))) ** 1.5
    hiss = S.noise_fft(n, r, lambda f: np.exp(-0.5 * (np.log2(f / 2000.0) / 0.35) ** 2)) * 0.035
    rumble = S.noise_fft(n, r, lambda f: np.exp(-0.5 * (np.log2(f / 260.0) / 0.6) ** 2)) * 0.16
    y = sq * wob * swell + upper + hiss * swell + rumble * (0.9 + 0.1 * np.sin(TAU * 3 * sw * t))
    y = S.filt_circ(y, "lp", 3600, order=2)
    y = circ_verb(y, rt60=0.5, mix=0.22, predelay=0.008, size=0.5, hi_cut=5000)
    y = S.filt_circ(y, "hp", 40, order=2)
    y = y - np.mean(y)
    # rotate the (periodic) loop so it starts in its quietest 10 ms, on the gentlest zero crossing there: the wrap is
    # then the least exposed sample pair of the whole loop, also after the lossy encode
    e = np.sqrt(np.convolve(np.concatenate((y[-441:], y, y[:441])) ** 2, np.ones(441) / 441, "same")[441:-441])
    c0 = int(np.argmin(e))
    w = np.arange(c0 - 220, c0 + 220) % n
    zc = w[np.nonzero((np.sign(y[w]) != np.sign(y[(w + 1) % n])))[0]]
    if len(zc):
        c0 = int(zc[np.argmin(np.abs(y[(zc + 1) % n] - y[zc]))]) + 1
    return np.roll(y, -c0)


def fit_len(y, sec: float) -> np.ndarray:
    """Crop / zero-pad to exactly sec seconds."""
    n = n_of(sec)
    y = np.asarray(y, float)
    return y[:n] if len(y) >= n else np.concatenate((y, np.zeros(n - len(y))))


# ============================================================================ the office loop (24 s)
def _typing_burst(r, buf, t0: float, dur: float, gain: float, pitch: float, lp_hz: float, bell_end: bool):
    """A typist at work: keys at 5-9 per second in little word groups, a space bar now and then; optional margin
    bell + carriage return at the end."""
    t = t0
    while t < t0 + dur:
        word = r.integers(2, 7)
        for k in range(word):
            g = gain * r.uniform(0.65, 1.0)
            kc = key_clack(r, 1.0, pitch * r.uniform(0.96, 1.04), soft=0.8)
            place(buf, t * SR, S.lp(kc, lp_hz, order=2), g)
            t += r.uniform(0.09, 0.16)
        place(buf, t * SR, S.lp(key_clack(r, 1.0, pitch * 0.82, soft=0.6), lp_hz * 0.8, order=2), gain * 0.7)   # space
        t += r.uniform(0.16, 0.34)
    if bell_end:
        place(buf, t * SR, margin_bell(r, 89, 1.0, 0.5), gain * 0.35)
        place(buf, (t + 0.35) * SR, S.lp(carriage_zip(r), lp_hz, order=2), gain * 0.9)
    return t


def _office_events(seed: int, nominal: float):
    r = S.rng(seed + 1)
    buf = np.zeros(n_of(nominal + 4.0))
    # two clerks: 셈이 nearer (brighter), 소복이 at the far desk (duller); the bursts never coincide for long
    # polish (critic M6 / L6): the typing is ducked ~3.5 dB (the game's one-shot sfx_typewriter is the foreground)
    # and the bursts are shorter, leaving quiet stretches where the wall clock is the loudest thing in the room
    for t0, dur, g, p, lp, bell in ((0.6, 3.0, 0.28, 1.0, 6500, True), (6.4, 2.0, 0.17, 0.93, 3800, False),
                                    (10.6, 3.2, 0.27, 1.02, 6500, False), (16.0, 2.4, 0.16, 0.94, 3800, True),
                                    (20.6, 1.4, 0.24, 0.99, 6500, False)):
        _typing_burst(r, buf, t0, dur, g, p, lp, bell)
    for t0, g in ((4.9, 0.16), (13.6, 0.13), (19.6, 0.15)):                         # page turns
        d = 0.42
        place(buf, t0 * SR, nsweep(r, d, 700, 2600, 1.1, [(0, 0), (0.08, 1), (0.25, 0.6), (d, 0)]), g)
        place(buf, (t0 + 0.05) * SR, paper_grains(r, 0.36, 110, env=[(0, 0.4), (0.12, 1), (0.36, 0)]), g * 0.5)
        place(buf, (t0 + d - 0.02) * SR, burst(r, 0.03, 900, 0.8, tau=0.008), g * 0.5)   # page lands
    pen = n_of(1.1)                                                                  # a pen scribbling a note
    sc = S.bp(r.standard_normal(pen), 2400, 1.6) * (0.5 + 0.5 * np.abs(np.sin(TAU * 4.3 * tax(pen)))) ** 2
    place(buf, 8.4 * SR, sc * S.env_pts([(0, 0), (0.05, 1), (1.0, 0.9), (1.1, 0)], pen), 0.035)
    place(buf, 22.8 * SR, S.lp(creak(r, 0.5, [(0, 9), (0.25, 16), (0.5, 7)], jitter=0.3), 2400), 0.10)   # a chair
    place(buf, 17.2 * SR, coin_hit(r, 2300, 0.12), 0.05)                            # a cup set on its saucer
    place(buf, 17.2 * SR, wood_knock(r, 900, 0.5, 0.04), 0.06)
    return buf


_MEMO: dict = {}


def render_office(seed: int = 13500, loop_samples=None, nominal: float = 24.0):
    """Inside the 촌장 사무실 (mono loop, 24 s): a warm small-room tone, the kettle simmering on the stove (soft
    bubbles + a breathy hiss), the wall clock 'tick ... tock' once a second, two typists in turn (near and far,
    one with the margin bell and the carriage return), page turns, a pen, a chair, a cup. Texture only - stamps,
    coins, the mailbox and voices are game-triggered one-shots."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    # room tone + stove: periodic beds (noise_fft) - brown-ish air, a breathy kettle hiss
    air = unit(S.noise_fft(L, r, lambda f: 1.0 / np.maximum(f, 40) ** 0.9 * np.exp(-f / 2500.0)))
    hiss = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(np.maximum(f, 1) / 3600.0) / 0.7) ** 2)))
    hiss_mod = 0.6 + 0.4 * S.periodic_curve(L, r, 3, 12, slope=0.6)
    y = air * 0.010 + hiss * 0.0045 * hiss_mod
    # kettle bubbles (folded events)
    key = ("bub", seed, L)
    if key not in _MEMO:
        bb = np.zeros(L + n_of(1.0))
        t = 0.0
        while t < L / SR:
            t += r.exponential(1.0 / 11.0)
            f0 = r.uniform(280, 900)
            place(bb, t * SR, bubble(r, f0, r.uniform(0.03, 0.07), rise=r.uniform(0.4, 1.0)), r.uniform(0.3, 1.0))
        _MEMO[key] = fold1(S.lp(bb, 2500, order=2), L)
    y = y + _MEMO[key] * 0.012
    # the wall clock: tick (even seconds) / tock (odd), exactly periodic over the loop
    ck = np.zeros(L + n_of(0.5))
    secs = int(round(L / SR))
    for s in range(secs):
        f = 2350 if s % 2 == 0 else 1950
        place(ck, round(s * L / secs), wood_knock(r, f, 1.0, 0.025), 1.0)
        place(ck, round(s * L / secs), burst(r, 0.004, 4200 if s % 2 == 0 else 3500, 1.4, tau=0.0006), 0.4)
    y = y + fold1(S.lp(ck, 7000), L) * 0.052           # polish (critic L6): the clock ~+4 dB
    ev = _MEMO.setdefault(("ev", seed, nominal), _office_events(seed, nominal))
    y = y + fold1(ev, L) * 0.55
    y = circ_verb(y, rt60=0.55, mix=0.25, hf_rt60=0.35, predelay=0.008, size=0.5, hi_cut=6000)
    y = S.filt_circ(y, "hp", 55, order=2)
    return finish_loop(y, {"loopSamples": L, "clockHz": 1.0})


# ============================================================================ registry + rendering
SFX7 = {
    "sfx_typewriter": lambda: sfx_typewriter_v(1),
    "sfx_typewriter_2": lambda: sfx_typewriter_v(2),
    "sfx_typewriter_3": lambda: sfx_typewriter_v(3),
    "sfx_switch_clack": sfx_switch_clack,
    "sfx_wheel_squeal": sfx_wheel_squeal,
    "sfx_mailbox_flag": sfx_mailbox_flag,
    "sfx_coin_sack": lambda: sfx_coin_sack_v(1),
    "sfx_coin_sack_2": lambda: sfx_coin_sack_v(2),
    "sfx_coin_sack_3": lambda: sfx_coin_sack_v(3),
}
LOOP_FUNCS = {"amb_office": "render_office"}
# exact delivered lengths (the contract's numbers); finish keeps the length, no silence trim at the head
LOOP_SLICES = {"sfx_wheel_squeal": 1.2}     # key -> manifest slice length; the wav is one loop period (+ 30 ms)
LENGTH = {"sfx_typewriter": 0.6, "sfx_typewriter_2": 0.6, "sfx_typewriter_3": 0.6, "sfx_switch_clack": 0.4,
          "sfx_wheel_squeal": 1.2, "sfx_mailbox_flag": 0.3, "sfx_coin_sack": 0.5, "sfx_coin_sack_2": 0.5,
          "sfx_coin_sack_3": 0.5}


def render(key: str) -> np.ndarray:
    """Finished one-shot: high-pass 30 Hz, DC fix, exact length, short head fade, peak -1.5 dBFS (synth.finish_sfx
    without its silence trim: the contract lengths are exact and every sound starts on its first sample).
    The squeal is a loop: one full period (1.23 s), only normalised - build_audio7 lays it into the sprite with its
    1.2 s slice, the 30 ms continuation in the gap after it and a short pre / post-roll."""
    y = np.asarray(SFX7[key](), dtype=float)
    if key in LOOP_SLICES:
        return y / max(S.peak(y), 1e-12) * S.undb(-1.5)
    y = S.hp(y, 30, order=2)
    y = fit_len(y, LENGTH[key])
    y = y - np.mean(y) * S.fade(np.ones(len(y)), 0.004, 0.004)
    if key != "sfx_wheel_squeal":
        y = S.fade(y, 0.0008, 0.0)
    y = tail_fade(y, 0.02)
    return y / max(S.peak(y), 1e-12) * S.undb(-1.5)


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
        print(f"{k:20s} {len(y) / SR:6.3f}s  peak {S.db(S.peak(y)):6.2f} dBFS  {lv}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or (list(SFX7) + list(LOOP_FUNCS)))
