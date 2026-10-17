"""Frost Village - the 금방 (Geumbang) online-market sounds (CONTRACT_GEUMBANG section AR) by procedural synthesis.

Same toolkit, layering style and mastering as sfx.py ... sfx7.py (imported, never edited). Cute, warm, soft; no voice,
no real brand's jingle:
  door        sfx_gb_doorbell (+ _2): a soft two-tone '띵동' from a felt-hammer tone-bar chime (G5 -> E5; the variant
              A5 -> F#5 for the house next door)
  van         sfx_gb_horn: a friendly double toy beep ('빵빵', a soft rounded square dyad C5 + E5, never a blare)
  app         sfx_gb_chime: the 금방 app ping - two rising music-box notes C6 -> F6
  doorstep    sfx_gb_thump (+ _2): a parcel set down on a snowy step - hollow cardboard knock + thud + snow crunch
  brand       sfx_gb_jingle: an original rising 3-note '금-방!' (F5 G5 C6 = do re sol in F, marimba + glockenspiel,
              a soft F-major bloom and music-box sparkles under the last note)
  hub         sfx_gb_tape (+ _2): packing tape pulled off the roll '찌익' (stick-slip crackle that speeds up, the
              dispenser's teeth snip it), sfx_gb_scan: a soft '삑' (A6 sine), sfx_gb_locker: the locker latch clicks
              and pops, then a two-note chime A5 -> D6
Musical bits are in F major like bgm_village (the doorbell keeps the contract's G5 -> E5 / A5 -> F#5).

Run:   python3 tools/audio/sfx8.py [key ...]        (no key = all)
       -> $FV_AUDIO8_CACHE/<key>.wav  (mono 44.1 kHz float; peak -1.5 dBFS)
Normally called through build_audio8.py.  Deterministic (each key has a fixed seed).
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
from sfx import Mono, blip, burst, nsweep, room, soft_square, tax  # noqa: E402
from sfx4 import tail_fade  # noqa: E402
from sfx6 import place, wood_knock  # noqa: E402
from sfx7 import fit_len, small_bell, tin_clack  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.environ.get("FV_AUDIO8_CACHE", "/tmp/fv_cache/audio8")

# contract section AR: the maximum length of every key (the sounds use exactly these lengths)
LENGTH = {"sfx_gb_doorbell": 0.9, "sfx_gb_doorbell_2": 0.9, "sfx_gb_horn": 0.5, "sfx_gb_chime": 0.45,
          "sfx_gb_thump": 0.35, "sfx_gb_thump_2": 0.35, "sfx_gb_jingle": 1.2, "sfx_gb_tape": 0.5,
          "sfx_gb_tape_2": 0.5, "sfx_gb_scan": 0.15, "sfx_gb_locker": 0.4}


# ============================================================================ parts
def tone_bar(r, m: float, vel: float = 1.0, t60: float = 1.5) -> np.ndarray:
    """A door-chime tone bar struck by a felt hammer: a pure fundamental with a slow shimmer (two bars a hair apart),
    a soft octave and the bar's 3.9 mode, a felt 'tup' at the start; low-passed - round, never piercing."""
    f = float(S.midi_hz(m))
    n = n_of(t60 * 0.8)
    y = S.modal(f, n, [(1.0, 1.0, t60), (1.0023, 0.32, t60 * 0.95), (2.0, 0.09, t60 * 0.45), (3.93, 0.06, t60 * 0.2),
                       (5.6, 0.015, 0.08)], r, fmax=8000.0, attack=0.0025)
    k = n_of(0.012)
    y[:k] += S.lp(r.standard_normal(k), 900) * np.hanning(k) * 0.05            # the felt hammer
    return S.lp(y, 6000, order=2) * vel


def music_box(r, m: float, vel: float = 0.8) -> np.ndarray:
    return I.musicbox(m, vel, r)


def snow_crunch(r, dur: float = 0.11, density: int = 34, lo: float = 1500.0, hi: float = 6500.0,
                gain: float = 1.0) -> np.ndarray:
    """Packed snow giving under a weight: a dense granular crackle (the sfx_step_snow recipe, quieter tail)."""
    m = Mono(dur + 0.03)
    times = 0.002 + r.gamma(2.0, dur / 6.5, density)
    for t0 in times[times < dur]:
        g = 1.4 * (r.uniform(0.25, 1.0) ** 2) * np.exp(-t0 / (dur * 0.55))
        m.add(t0, burst(r, 0.006, r.uniform(lo, hi), 1.3, tau=r.uniform(0.0004, 0.0014)), g)
    m.add(0, burst(r, dur, 1100, 0.8, tau=dur / 4, attack=0.006), 0.3)       # the hush of compressed snow
    return m.x * gain


def cardboard_knock(r, f: float = 330.0, vel: float = 1.0) -> np.ndarray:
    """A hollow cardboard box landing: a short inharmonic panel resonance + a papery slap (phone-audible mids)."""
    n = n_of(0.14)
    y = S.modal(f, n, [(1.0, 1.0, 0.07), (1.58, 0.6, 0.05), (2.31, 0.4, 0.035), (3.4, 0.2, 0.02)], r, fmax=7000.0,
                attack=0.0006)
    y[:n_of(0.012)] += burst(r, 0.012, 900, 0.7, tau=0.003) * 0.6
    return y * vel


def damped(x, hold: float, tau: float) -> np.ndarray:
    """x held for `hold` s, then dying away with time constant `tau` (a hand damping a bar / tine)."""
    x = np.asarray(x, dtype=float)
    t = tax(len(x))
    return x * np.where(t < hold, 1.0, np.exp(-(t - hold) / tau))


# ============================================================================ one-shots
DOORBELL = {1: (79, 76), 2: (81, 78)}         # G5 -> E5 ; A5 -> F#5 (contract)


def sfx_gb_doorbell_v(v: int):
    """'띵동' at a front door: two felt-hammer tone bars, the second a major third lower, 0.33 s apart; a soft small
    room. 0.9 s. cues: ding 0, dong 0.33."""
    r = S.rng(18000 + v)
    hi_, lo_ = DOORBELL[v]
    m = Mono(1.2)
    m.add(0.0, tone_bar(r, hi_, 1.0, 1.6), 0.55)
    m.add(0.33, tone_bar(r, lo_, 0.95, 1.8), 0.6)
    y = room(m.x, 0.45, 0.10, 0.12, 0.5)
    return tail_fade(fit_len(y, 0.9), 0.18)


def sfx_gb_horn():
    """A friendly double toy beep from the 금방 van ('빵빵', soft): two short rounded-square dyads C5 + E5 that start a
    hair flat and settle, a little nasal body (a squeeze-horn formant), no blare. 0.5 s. cues: beep1 0, beep2 0.19."""
    r = S.rng(18100)
    m = Mono(0.7)
    for t0, dur, vel in ((0.0, 0.12, 0.95), (0.19, 0.15, 1.0)):
        for mm, g in ((72, 0.55), (76, 0.45)):
            x = soft_square(mm, dur, vel, cutoff=2300.0, bend=0.0)
            n = len(x)
            t = tax(n)
            f0 = float(S.midi_hz(mm))
            # a tiny upward scoop at the start (-35 cents -> 0 in 25 ms): toy-like, friendly
            ph = np.cumsum(f0 * 2 ** ((-0.35 * np.exp(-t / 0.025)) / 12.0)) / SR
            sq = 0.6 * np.sign(np.sin(TAU * ph)) + 0.5 * (2 * np.abs(2 * (ph % 1.0) - 1) - 1)
            sq = S.lp(sq, 2300, 0.7, order=2) * S.env_adsr(n, 0.006, 0.05, 0.75, 0.05, gate=dur) * vel
            m.add(t0, sq, g)
        m.add(t0, burst(r, 0.01, 1800, 1.0, tau=0.002), 0.05)
    y = S.peq(m.x, 1150, 4.0, 1.2)                                    # the squeeze-horn's nasal body
    y = S.lp(y, 4200, order=2)
    y = room(y, 0.35, 0.08, 0.1, 0.45)
    return tail_fade(fit_len(y, 0.5), 0.12)


def sfx_gb_chime():
    """The 금방 app ping (new order, tracker step): two rising music-box notes C6 -> F6 with a glockenspiel edge; the
    first is damped so the second reads as its own note. 0.45 s. cues: note1 0, note2 0.11."""
    r = S.rng(18200)
    m = Mono(0.8)
    n1 = damped(music_box(r, 84, 0.75), 0.05, 0.03)
    m.add(0.0, n1, 0.5)
    m.add(0.0, damped(I.glock(96, 0.4, r), 0.04, 0.025), 0.07)
    m.add(0.11, music_box(r, 89, 0.9), 0.65)
    m.add(0.11, I.glock(101, 0.5, r), 0.10)
    y = room(m.x, 0.35, 0.08, 0.1, 0.4)
    return tail_fade(fit_len(y, 0.45), 0.15)


THUMP = {1: dict(f=330.0, tock=560.0, thud=(150, 92), crunch=34, seed=18300, slide=False),
         2: dict(f=255.0, tock=470.0, thud=(118, 72), crunch=46, seed=18310, slide=True)}


def sfx_gb_thump_v(v: int):
    """A 금방 parcel set down on a snowy doorstep: a hollow cardboard knock with a bright cardboard 'tock' (polish L7:
    400-900 Hz, the part a phone speaker can play, so the sound keeps its level on a phone and its manifest volume has
    headroom below 1.0), a lighter body thud, the snow giving under it; variant 2 is a heavier box that settles with a
    little scrape. 0.35 s. cues: land 0."""
    P = THUMP[v]
    r = S.rng(P["seed"])
    m = Mono(0.5)
    m.add(0.0, cardboard_knock(r, P["f"], 1.0), 0.45)
    m.add(0.0, cardboard_knock(r, P["tock"], 1.0), 0.62)                    # the cardboard 'tock' (phone-audible)
    m.add(0.0, cardboard_knock(r, P["f"] * 2.6, 0.7), 0.30)                   # the lid panel
    m.add(0.0, blip(P["thud"][0], P["thud"][1], 0.12, 0.02, 0.035, attack=0.0015), 0.15)
    m.add(0.0, burst(r, 0.03, 1300, 0.9, tau=0.006), 0.28)                   # papery slap of the flaps
    m.add(0.004, snow_crunch(r, 0.11, P["crunch"], gain=0.75), 1.0)
    if P["slide"]:
        m.add(0.07, nsweep(r, 0.12, 2400, 1400, 1.4, [(0, 0), (0.02, 1), (0.12, 0)]), 0.08)
        m.add(0.15, wood_knock(r, 520, 0.5, 0.03), 0.10)
    y = room(m.x, 0.3, 0.06, 0.08, 0.4)                                    # outdoors-ish, a porch
    y = y / max(S.peak(y), 1e-12)
    y = np.tanh(2.4 * y) / np.tanh(2.4)        # round off the knock's 1 ms spike: a denser, louder thump at the same peak
    return tail_fade(fit_len(y, 0.35), 0.1)


JINGLE = [(0.0, 77, 0.85), (0.13, 79, 0.9), (0.28, 84, 1.0)]     # F5 G5 C6 = do re sol: '금 - 방!'


def sfx_gb_jingle():
    """The 금방 sound logo (opening ribbon, first delivery of the day, the app splash): an original rising 3-note
    '금-방!' - F5, G5 and a held C6 (do re sol in F) on a warm marimba doubled by a glockenspiel an octave up; under the
    last note a soft F-major bloom (F4 A4 C5) and four music-box sparkles from the F pentatonic. 1.2 s.
    cues: n1 0, n2 0.13, n3 0.28."""
    r = S.rng(18400)
    m = Mono(1.6)
    for t0, mm, vel in JINGLE:
        last = mm == 84
        if last:
            m.add(t0, I.marimba(mm, vel, r, dur=1.0), 0.7)
            m.add(t0, I.glock(mm + 12, 0.85, r), 0.18)
            m.add(t0, burst(r, 0.008, 2400, 1.0, tau=0.0015), 0.05)          # the mallet's tick on the accent
        else:                                                                 # damped bars: short and bouncy
            m.add(t0, damped(I.marimba(mm, vel, r, dur=0.4), 0.06, 0.05), 0.5)
            m.add(t0, damped(I.glock(mm + 12, 0.5, r), 0.05, 0.04), 0.09)
    pad = I.pad_chord([65, 69, 72], 0.85, r, cutoff=1600.0, attack=0.06)
    m.add(0.28, pad * S.env_pts([(0, 0), (0.06, 1), (0.5, 0.6), (0.85, 0)], len(pad)), 0.10)
    for k, (dt, mm) in enumerate(((0.46, 96), (0.56, 101), (0.66, 98), (0.78, 105))):    # C7 F7 D7 A7 sparkles
        m.add(dt, music_box(r, mm, 0.45), 0.13 * np.exp(-k / 3.0))
    m.add(0.28, I.sleigh(0.35, r, nbells=4), 0.05)
    y = room(m.x, 0.6, 0.12, 0.2, 0.55)
    return tail_fade(fit_len(y, 1.2), 0.3)


TAPE = {1: dict(seed=18500, pull=0.34, rate=(260, 980, 620), snip=0.37, hiss=2600),
        2: dict(seed=18510, pull=0.27, rate=(320, 1150, 760), snip=0.30, hiss=2900)}


def sfx_gb_tape_v(v: int):
    """Packing tape pulled off the roll, '찌익': a stick-slip crackle whose rate rises then eases as the tape leaves
    the roll (each slip a tiny papery tick 2-4.5 kHz), a band of film rustle over it, then the dispenser's teeth snip
    it with a small plastic tick. 0.5 s. cues: pull 0, snip ~0.3-0.37."""
    P = TAPE[v]
    r = S.rng(P["seed"])
    m = Mono(0.7)
    pull = P["pull"]
    n = n_of(pull)
    t = tax(n)
    a, b, c = P["rate"]
    u = t / pull
    rate = np.where(u < 0.55, a + (b - a) * np.sin(np.clip(u / 0.55, 0, 1) * np.pi / 2),
                    b + (c - b) * np.clip((u - 0.55) / 0.45, 0, 1) ** 1.5)
    rate *= 1 + 0.08 * S.lp(r.standard_normal(n), 25) / 0.05
    ph = np.cumsum(np.maximum(rate, 50)) / SR
    hits = np.nonzero(np.diff(np.floor(ph)) > 0)[0]
    env = S.env_pts([(0, 0.0), (0.02, 0.8), (pull * 0.5, 1.0), (pull * 0.9, 0.75), (pull, 0.0)], n)
    crack = np.zeros(n + n_of(0.01))
    for i in hits:
        g = env[i] * r.uniform(0.35, 1.0)
        place(crack, i, burst(r, 0.0022, r.uniform(2000, 4500), 1.6, tau=r.uniform(0.00025, 0.0006)), g)
    m.add(0.0, crack, 0.55)
    film = S.tv_filter(r.standard_normal(n), "bp", P["hiss"] * (0.8 + 0.4 * u), 1.1)
    m.add(0.0, film * env * (0.5 + 0.5 * (rate / b)), 0.12)
    m.add(0.0, S.bp(r.standard_normal(n), 900, 0.8) * env, 0.04)            # the roll turning
    m.x = S.hp(m.x, 380, order=2)                                             # crisp '찌익', no rumble
    sn = P["snip"]
    m.add(sn, tin_clack(r, 0.7, 1500), 0.10)                                  # teeth bite
    m.add(sn, burst(r, 0.012, 3600, 1.2, tau=0.0025), 0.30)                  # the snip
    m.add(sn + 0.012, wood_knock(r, 900, 0.5, 0.025), 0.12)                  # the dispenser settles on the bench
    y = S.lp(m.x, 7500, order=2)
    y = room(y, 0.35, 0.06, 0.08, 0.4)
    return tail_fade(fit_len(y, 0.5), 0.1)


def sfx_gb_scan():
    """A soft scanner '삑' (each parcel loaded): a short A6 sine with a whisper of its octave, rounded edges. 0.15 s."""
    n = n_of(0.11)
    t = tax(n)
    f = float(S.midi_hz(93))
    y = np.sin(TAU * f * t) + 0.12 * np.sin(TAU * 2 * f * t + 0.4) + 0.05 * np.sin(TAU * 3 * f * t + 1.1)
    y *= S.env_adsr(n, 0.006, 0.02, 0.8, 0.03, gate=0.075)
    y = room(y, 0.25, 0.05, 0.05, 0.35)
    return tail_fade(fit_len(y, 0.15), 0.04)


def sfx_gb_locker():
    """금방 보관함 opens: the latch clicks (a small metal click + a plastic tick), the door pops out a little (soft
    thud), then the locker's two-note chime A5 -> D6. 0.4 s. cues: click 0, pop 0.03, chime 0.1 / 0.19."""
    r = S.rng(18700)
    m = Mono(0.6)
    m.add(0.0, tin_clack(r, 0.9, 1900), 0.22)
    m.add(0.0, burst(r, 0.006, 3200, 1.3, tau=0.0009), 0.30)
    m.add(0.03, blip(210, 120, 0.06, 0.012, 0.02, attack=0.001), 0.25)
    m.add(0.03, wood_knock(r, 700, 0.5, 0.03), 0.10)
    m.add(0.10, small_bell(r, 81, 0.9, 0.3), 0.30)
    m.add(0.10, music_box(r, 81, 0.6), 0.25)
    m.add(0.19, small_bell(r, 86, 1.0, 0.32), 0.33)
    m.add(0.19, music_box(r, 86, 0.65), 0.27)
    y = room(m.x, 0.35, 0.08, 0.1, 0.4)
    return tail_fade(fit_len(y, 0.4), 0.12)


# ============================================================================ registry + rendering
SFX8 = {
    "sfx_gb_doorbell": lambda: sfx_gb_doorbell_v(1),
    "sfx_gb_doorbell_2": lambda: sfx_gb_doorbell_v(2),
    "sfx_gb_horn": sfx_gb_horn,
    "sfx_gb_chime": sfx_gb_chime,
    "sfx_gb_thump": lambda: sfx_gb_thump_v(1),
    "sfx_gb_thump_2": lambda: sfx_gb_thump_v(2),
    "sfx_gb_jingle": sfx_gb_jingle,
    "sfx_gb_tape": lambda: sfx_gb_tape_v(1),
    "sfx_gb_tape_2": lambda: sfx_gb_tape_v(2),
    "sfx_gb_scan": sfx_gb_scan,
    "sfx_gb_locker": sfx_gb_locker,
}


def render(key: str) -> np.ndarray:
    """Finished one-shot (the sfx7 recipe): high-pass 30 Hz, DC fix, exact contract length, a short head fade, a faded
    tail, peak -1.5 dBFS; every sound starts on its first sample."""
    y = np.asarray(SFX8[key](), dtype=float)
    y = S.hp(y, 30, order=2)
    y = fit_len(y, LENGTH[key])
    y = y - np.mean(y) * S.fade(np.ones(len(y)), 0.004, 0.004)
    y = S.fade(y, 0.0008, 0.0)
    y = tail_fade(y, 0.02)
    return y / max(S.peak(y), 1e-12) * S.undb(-1.5)


def main(keys):
    os.makedirs(CACHE, exist_ok=True)
    for k in keys:
        y = render(k)
        S.write_wav(os.path.join(CACHE, f"{k}.wav"), y)
        print(f"{k:20s} {len(y) / SR:6.3f}s  peak {S.db(S.peak(y)):6.2f} dBFS  Mmax {S.momentary_max(y):6.1f}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or list(SFX8))
