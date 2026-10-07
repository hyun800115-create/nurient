"""Frost Village - v6 harbour music by procedural synthesis (library + script).

  bgm_harbor : cheerful sea-shanty flavoured theme for the harbour city "갈매기 항구". F major, 6/8 with a light
               jig lilt (dotted quarter = 94 bpm), 48 bars (61.3 s), form A1 A2 B A3 C A4:
                 A  = F | F | Bb | C | F | Dm | Bb C | F        the bgm_village hook "A4 C5 D5 - C5 A4 C5 -"
                      re-set as a rocking long-short shanty line (same pitches A C D C A C, bars 1-2 and 5),
                      bar 4 echoes the village question "G4 ... A4", bar 6 reaches up like the village bar 6.
                 B  = Bb | C | Am | Dm | Gm7 | C | Am Dm | Gm7 C7  (= the bgm_village B progression) tin-whistle
                      chorus with grace-note cuts, ends on the village B cadence figure G A C D C.
                 C  = Dm | Bb | F | C | Dm | Bb | Gm7 | C7       'open sea' interlude: music box + glock over rolling
                      marimba waves, string pad, ship's-bell dings, swells; builds back into the hook.
               Arrangement: A1 marimba lead (the village voice) with pizzicato 'boom-chick'; A2 the accordion takes the
               tune over 'oom-cha-cha' squeezebox chords, deck stomps, claps and bodhran; B tin whistle + banjo-ish
               pluck arpeggios; A3 tutti (accordion + whistle an octave up + glock counter-melody, a nod of sleigh
               bells); C calm; A4 accordion + music-box sparkles, turnaround F | C7 back into A1.
               Brighter and bouncier than bgm_village, same key, same hook, same instrument family (marimba,
               music box, glock, pizzicato bass, shaker, woodblock) plus the harbour band (accordion, whistle,
               stomps, claps, bodhran, ship's bell).

Loop: performance rendered past the loop end, tail folded onto the start (synth.fold_loop), circular compressor /
limiter (music.finish) -> seamless; everything is delayed 12 ms so the loop point sits just before the downbeat.
build_audio4.py moves the loop point to the nearest Vorbis block boundary via build_audio.fit_loop(); the
pre-mix is memoised so each fit trial only re-folds and re-masters.

Run:   python3 tools/audio/music4.py
       -> tools/audio/_cache/audio4/bgm_harbor.wav (32-bit float stereo, -18 LUFS)
Normally called through build_audio4.py.  Deterministic (fixed seed).  Needs numpy + scipy.
Set FV_AUDIO_DEBUG=1 to print per-bus loudness.
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deps  # noqa: E402

deps.ensure()
import instruments as I  # noqa: E402
import synth as S  # noqa: E402
from music import CHORDS, Mixer, bass_note, finish, premix, voice  # noqa: E402
from music2 import flute, scale_step, triangle  # noqa: E402
from sfx import blip, burst  # noqa: E402
from sfx4 import ship_bell  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio4")

BPM_DQ = 94.0                        # dotted-quarter beats per minute (two per 6/8 bar)
BARS = 48


# ----------------------------------------------------------------------------- timing / parsing
class Song68:
    """6/8 timing in eighth notes with a jig lilt: inside each dotted-quarter group the first eighth is a
    little long and the third a little short (0, 1.10, 2.04 instead of 0, 1, 2). t(bar, eighth) -> s."""

    def __init__(self, bpm_dq: float, seed: int, lilt=(0.10, 0.04)):
        self.e = 60.0 / (bpm_dq * 3.0)
        self.r = S.rng(seed)
        self.lilt = lilt

    def t(self, bar, e):
        g = np.floor(e / 3.0 + 1e-9)
        u = e - 3.0 * g
        u2 = float(np.interp(u, [0, 1, 2, 3], [0, 1 + self.lilt[0], 2 + self.lilt[1], 3]))
        return (bar * 6 + 3 * g + u2) * self.e

    def hum(self, sd=0.004):
        return float(self.r.normal(0, sd))

    def vel(self, v, sd=0.05):
        return float(np.clip(v + self.r.normal(0, sd), 0.05, 1.0))


def parse6(s: str):
    """'A4 - C5 D5 - -' (6 eighth slots per 6/8 bar; NOTE / '-' hold / '.' rest) -> [(start_e, len_e, midi)]."""
    toks = s.split()
    assert len(toks) == 6, s
    out = []
    for i, tk in enumerate(toks):
        if tk in "-.":
            if tk == "-" and out and out[-1][0] + out[-1][1] == i:
                st, ln, m = out[-1]
                out[-1] = (st, ln + 1, m)
            continue
        out.append((i, 1, S.note(tk)))
    return out


# ----------------------------------------------------------------------------- score
A_MEL = [
    "A4 -  C5 D5 -  -",      # F      the village hook A C D | C A C, rocking long-short
    "C5 -  A4 C5 -  -",      # F
    "D5 -  D5 F5 -  D5",     # Bb
    "C5 -  -  G4 A4 Bb4",    # C      (question; walks up into the hook)
    "A4 -  C5 D5 -  -",      # F      hook again
    "F5 -  E5 D5 -  A4",     # Dm     reaches up like village bar 6
    "Bb4 - D5 C5 -  E5",     # Bb | C
    "F5 -  -  E5 D5 C5",     # F      (open: runs down into the hook)
]
A_END_CLOSED = "F5 -  -  -  .  ."
A_CH = [("F", "F"), ("F", "F"), ("Bb", "Bb"), ("C", "C7"), ("F", "F"), ("Dm", "Dm"), ("Bb", "C"), ("F", "F")]
A_CH_OPEN = A_CH[:7] + [("F", "C")]          # the run E D C over C turns back into the hook / on to B
B_MEL = [
    "D5 -  F5 Bb5 -  A5",    # Bb
    "G5 -  E5 C5 -  -",      # C
    "E5 -  A5 G5 -  E5",     # Am
    "F5 -  -  D5 E5 F5",     # Dm
    "G5 -  Bb5 A5 -  G5",    # Gm7
    "E5 -  G5 C6 -  -",      # C      (the high point)
    "C6 -  A5 D6 -  A5",     # Am | Dm
    "G5 -  A5 C6 D6 C6",     # Gm7 | C7   the village B cadence figure G A C D C
]
B_CH = [("Bb", "Bb"), ("C", "C"), ("Am", "Am"), ("Dm", "Dm"), ("Gm7", "Gm7"), ("C", "C"), ("Am", "Dm"), ("Gm7", "C7")]
C_MEL = [
    "A5 -  -  F5 -  -",      # Dm
    "D6 -  -  F5 -  -",      # Bb
    "C6 -  -  A5 -  -",      # F
    "G5 -  -  -  -  -",      # C
    "A5 -  -  D6 -  -",      # Dm
    "F6 -  -  D6 -  -",      # Bb
    "D6 -  C6 Bb5 -  A5",    # Gm7
    "G5 -  -  E5 F5 G5",     # C7     (lifts back towards the hook)
]
C_CH = [("Dm", "Dm"), ("Bb", "Bb"), ("F", "F"), ("C", "C"), ("Dm", "Dm"), ("Bb", "Bb"), ("Gm7", "Gm7"), ("C7", "C7")]
COUNTER_A = [("C6", "A5"), ("F6", "C6"), ("D6", "F6"), ("E6", "G6"), ("C6", "A5"), ("D6", "F6"), ("D6", "E6"),
             ("F6", "C6")]
SECTIONS = [(0, "A1", A_MEL, A_CH_OPEN), (8, "A2", A_MEL, A_CH_OPEN), (16, "B", B_MEL, B_CH),
            (24, "A3", A_MEL[:7] + [A_END_CLOSED], A_CH), (32, "C", C_MEL, C_CH),
            (40, "A4", A_MEL, A_CH[:7] + [("F", "C7")])]


# ----------------------------------------------------------------------------- harbour-band voices
def accordion(m: float, vel: float = 0.8, dur: float = 0.4, r=None, musette: float = 7.0, bright: float = 1.0,
              reeds: int = 3) -> np.ndarray:
    """Squeezebox / concertina reed voice: up to three free reeds (one in tune, two a few cents sharp / flat ->
    the gentle 'musette' shimmer of a sea-shanty accordion), each a nasal saw + narrow pulse, reed-chamber
    honk around 1.2 kHz, quick reed onset, a little bellows shake on long notes."""
    r = r or S.rng(0)
    rel = 0.07
    n = n_of(dur + rel)
    t = np.arange(n) / SR
    f0 = float(S.midi_hz(m))
    x = np.zeros(n)
    for k, c in enumerate((0.0, musette, -0.8 * musette)[:reeds]):
        f = f0 * 2 ** (c / 1200.0)
        ph = r.random()
        x += (0.55 * S.saw(f, n, ph) + 0.45 * S.square(f, n, 0.3, ph)) * (1.0 if k == 0 else 0.7)
    x /= 1.0 + 0.7 * (reeds - 1)
    x = S.lp(x, min(5200.0, f0 * (5.0 + 6.0 * bright * vel)), 0.6, order=2)
    x = S.peq(x, 1250, 2.0, 1.2)
    x = S.hp(x, 110)
    env = S.env_adsr(n, 0.018, 0.08, 0.85, rel, gate=dur)
    shake = 1 + 0.045 * np.sin(TAU * 5.4 * t + r.uniform(0, TAU)) * np.clip((t - 0.3) / 0.25, 0, 1)
    return x * env * shake * (0.55 + 0.45 * vel)


def accordion_chord(ms, vel: float, dur: float, r, bright: float = 0.8) -> np.ndarray:
    """Left-hand chord button: the triad on two reeds, short and bouncy."""
    ys = [accordion(m, vel, dur, r, musette=6.0, bright=bright, reeds=2) for m in ms]
    n = max(len(y) for y in ys)
    out = np.zeros(n)
    for y in ys:
        out[:len(y)] += y
    return out / len(ys) * 1.6


def stomp(vel: float, r) -> np.ndarray:
    """Boots on a wooden deck: low thump + hollow plank 'thock' + a scuff."""
    n = n_of(0.35)
    body = blip(105, 50, 0.35, 0.025, 0.09, attack=0.002)
    deck = S.modal(165, n, [(1, 1, 0.09), (2.3, 0.35, 0.05), (3.7, 0.15, 0.03)], r, attack=0.001) * 0.45
    scuff = S.lp(r.standard_normal(n), 900) * S.env_exp(n, 0.012, 0.001) * 0.25
    y = body + deck + scuff
    return y / max(S.peak(y), 1e-9) * vel


def bodhran(vel: float, r, low: bool = True) -> np.ndarray:
    """Frame drum: low skin 'dum' (pitch drops as the skin settles) or a lighter tipper 'ta'."""
    n = n_of(0.3)
    t = np.arange(n) / SR
    f = (86.0 if low else 150.0) * (1 + 0.28 * np.exp(-t / 0.02))
    y = S.sine(f, n) * S.env_exp(n, 0.11 if low else 0.05, 0.001)
    skin = S.bp(r.standard_normal(n), 650 if low else 1200, 0.8) * S.env_exp(n, 0.02, 0.0005) * 0.55
    k = n_of(0.01)
    y[:k] += burst(r, 0.01, 2600, 1.0, tau=0.002)[:k] * (0.25 if low else 0.45)
    y = y + skin
    return y / max(S.peak(y), 1e-9) * vel


def small_bell(m: float, vel: float, r) -> np.ndarray:
    """A small ship's bell 'ding' for the band (prime m, strike an octave up)."""
    y = ship_bell(m, r, t60=1.7, vel=vel)
    return S.lp(y, 7000)


# ----------------------------------------------------------------------------- performance
_PREMIX = {}


def _memo(key, fn):
    if key not in _PREMIX:
        _PREMIX[key] = fn()
    mix, meta = _PREMIX[key]
    return mix, dict(meta)


def _delay(mix, sec=0.012):
    return np.concatenate((np.zeros((2, n_of(sec))), mix), axis=1)


def _premix_harbor(seed: int):
    song = Song68(BPM_DQ, seed)
    r = song.r
    E = song.e
    L = n_of(BARS * 6 * E)
    mx = Mixer(L / SR + 8, loop=L / SR)
    prev_tri, prev_pad, prev_acc = None, None, None
    for bar0, kind, mel, chs in SECTIONS:
        for i in range(8):
            bar = bar0 + i
            last = i == 7
            # ------------------------------------------------ melody
            for st, ln, m in parse6(mel[i]):
                t0 = song.t(bar, st) + song.hum(0.003)
                dur = song.t(bar, st + ln) - song.t(bar, st)
                strong = st in (0, 3)
                acc = 0.86 if strong else 0.7
                if kind == "A1":
                    mx.add("mel", t0, I.marimba(m, song.vel(acc), r), 0.44, -0.1)
                    mx.add("mbox", t0 + 0.004, I.musicbox(m + 12, song.vel(0.5), r), 0.14, 0.3)
                elif kind in ("A2", "A4"):
                    mx.add("acc", t0, accordion(m, song.vel(acc), dur * 0.92, r), 0.6, -0.12)
                    mx.add("mel", t0 + 0.003, I.marimba(m, song.vel(acc * 0.8), r), 0.22, 0.2)
                    if kind == "A4" and i >= 4:
                        mx.add("mbox", t0 + 0.006, I.musicbox(m + 12, song.vel(0.55), r), 0.16, 0.3)
                elif kind == "A3":
                    mx.add("acc", t0, accordion(m, song.vel(acc), dur * 0.92, r), 0.6, -0.15)
                    g = scale_step(m + 12, 1) - (m + 12) if (strong and ln >= 2) else 0.0
                    gl = 0.045 if g else 0.0
                    mx.add("whis", t0 - gl, flute(m + 12, song.vel(0.7), dur * 0.9, r, vib=0.6 if ln >= 3 else 0.2,
                                                  grace=g, grace_len=0.045), 0.3, 0.15)
                elif kind == "B":
                    g = scale_step(m, 1) - m if (strong and ln >= 2) else 0.0
                    gl = 0.045 if g else 0.0
                    mx.add("whis", t0 - gl, flute(m, song.vel(0.8), dur * 0.95, r, vib=1.0 if ln >= 3 else 0.4,
                                                  grace=g, grace_len=0.045), 0.45, -0.05)
                    if ln >= 3:
                        mx.add("mel", t0, I.marimba(m - 12, song.vel(0.4), r), 0.16, -0.25)
                else:                                   # C: music box lead, glock + marimba echo
                    mx.add("mbox", t0, I.musicbox(m, song.vel(0.75 if strong else 0.6), r), 0.34, -0.1)
                    mx.add("glock", t0 + 0.005, I.glock(m + 12, song.vel(0.4), r), 0.07, 0.35)
            # ------------------------------------------------ harmony
            for half in (0, 1):
                ch = chs[i][half]
                root, tri, padpcs = CHORDS[ch]
                tri_v = voice(tri[:3], prev_tri, 55, 70)
                prev_tri = tri_v
                acc_v = voice(tri[:3], prev_acc, 53, 67)
                prev_acc = acc_v
                he = half * 3                          # eighth offset of this half-bar
                bm = bass_note(root)
                fifth = bm + 7 if bm + 7 <= 50 else bm - 5
                same = chs[i][0] == chs[i][1]
                nb = bm if (half == 0 or not same) else fifth
                tb = song.t(bar, he) + song.hum(0.002)
                if kind == "C":
                    if half == 0 or not same:
                        pdur = 6 * E if same else 3 * E
                        pad_v = voice(padpcs, prev_pad, 52, 72)
                        prev_pad = pad_v
                        mx.add("pad", tb, I.pad_chord(pad_v, pdur * 1.02, r, cutoff=1300, attack=0.6, release=1.2), 0.2)
                        mx.add("bass", tb, I.bass(bm, song.vel(0.7), pdur * 0.9, r), 0.5)
                    arp = tri_v + [tri_v[0] + 12]
                    for k, idx in enumerate((0, 1, 2) if half == 0 else (3, 2, 1)):
                        mx.add("mel", song.t(bar, he + k) + song.hum(0.003),
                               I.marimba(arp[idx], song.vel(0.5 if k == 0 else 0.4), r), 0.3, 0.3 if k % 2 else -0.2)
                    continue
                # pizzicato bass 'boom' on both dotted-quarter beats (root, then fifth when the chord holds)
                mx.add("bass", tb, I.bass(nb, song.vel(0.85 if half == 0 else 0.72), 2.4 * E, r), 0.62)
                if kind in ("A2", "A3", "A4"):         # accordion bass reed doubles the 'oom'
                    mx.add("accb", tb, accordion(nb + 12, song.vel(0.6), 1.2 * E, r, reeds=1, bright=0.3), 0.2)
                if kind == "A1":                       # 'boom - chick': light pluck chord on the 3rd eighth
                    tt = song.t(bar, he + 2) + song.hum(0.003)
                    for j, mm in enumerate(tri_v):
                        mx.add("pluck", tt + j * 0.009, I.pluck(mm, song.vel(0.55), r, t60=1.0, dur=0.6 * E), 0.15,
                               0.3 + 0.08 * (j - 1))
                elif kind == "B":                      # banjo-ish pluck arpeggio on every eighth
                    arp = tri_v + [tri_v[0] + 12]
                    for k in range(3):
                        mm = arp[(k + 3 * half) % 4] if half == 0 else arp[(3 - k) % 4]
                        mx.add("pluck", song.t(bar, he + k) + song.hum(0.003),
                               I.pluck(mm + 12, song.vel(0.6 if k == 0 else 0.48), r, t60=0.8, dur=0.9 * E, bright=0.7),
                               0.2, 0.35 if k % 2 else 0.15)
                    if half == 0 or not same:          # held squeezebox chord under the whistle
                        pdur = (6 if same else 3) * E
                        mx.add("acc", tb, accordion_chord(acc_v, 0.5, pdur * 0.95, r, bright=0.5), 0.13, 0.25)
                else:                                  # A2 / A3 / A4: 'oom-cha-cha' squeezebox chords
                    for k, v in ((1, 0.62), (2, 0.5)):
                        tt = song.t(bar, he + k) + song.hum(0.003)
                        mx.add("acc", tt, accordion_chord(acc_v, song.vel(v), 0.55 * E, r), 0.17, 0.28)
            # ------------------------------------------------ colour lines
            if kind == "A3" or (kind == "A4" and i >= 4):
                for half in (0, 1):
                    nm = COUNTER_A[i][half]
                    if kind == "A4" and last and half == 1:
                        nm = "E6"                       # C7 turnaround
                    mx.add("glock", song.t(bar, half * 3) + 0.006, I.glock(S.note(nm), song.vel(0.55), r),
                           0.1 if kind == "A3" else 0.08, 0.4)
            # ------------------------------------------------ percussion
            if kind == "C":
                mx.add("bod", song.t(bar, 0) + song.hum(0.002), bodhran(song.vel(0.5), r), 0.3, -0.1)
                if i % 2 == 1:
                    mx.add("bod", song.t(bar, 3) + song.hum(0.002), bodhran(song.vel(0.35), r), 0.25, -0.1)
                for k in range(6):
                    mx.add("shk", song.t(bar, k) + song.hum(0.002), I.shaker(song.vel(0.28 if k % 3 else 0.4), r, 0.08),
                           0.05, 0.45)
            else:
                full = kind in ("A2", "A3", "A4", "B")
                mx.add("stomp", song.t(bar, 0) + song.hum(0.002), stomp(song.vel(0.8 if full else 0.6), r),
                       0.5 if full else 0.38)
                if full:
                    mx.add("stomp", song.t(bar, 3) + song.hum(0.002), stomp(song.vel(0.7), r), 0.44)
                    mx.add("clap", song.t(bar, 3) + song.hum(0.004), I.clap_soft(song.vel(0.6), r), 0.2, -0.25)
                    mx.add("clap", song.t(bar, 3) + 0.011 + song.hum(0.004), I.clap_soft(song.vel(0.5), r), 0.16, 0.3)
                    for k, low in ((0, True), (1, False), (2, False), (3, True), (4, False), (5, False)):
                        if kind == "B" and k in (1, 4):
                            continue
                        mx.add("bod", song.t(bar, k) + song.hum(0.003),
                               bodhran(song.vel(0.62 if low else 0.38), r, low), 0.22 if low else 0.16, -0.15)
                for k in range(6):
                    mx.add("shk", song.t(bar, k) + song.hum(0.002), I.shaker(song.vel(0.5 if k in (0, 3) else 0.3), r, 0.09),
                           0.06, 0.45)
                if kind == "A3":
                    mx.add("sleigh", song.t(bar, 3) + 0.008, I.sleigh(song.vel(0.45), r), 0.06, -0.4)
            # ------------------------------------------------ fills / transitions
            if kind in ("A1", "A4") and last:          # woodblock pickup into the hook
                mx.add("wb", song.t(bar, 4), I.woodblock(84, 0.7, r), 0.16, 0.3)
                mx.add("wb", song.t(bar, 5), I.woodblock(79, 0.6, r), 0.15, 0.2)
            if kind == "A2" and last:                  # bodhran roll + swell into the whistle chorus
                e = 3.0
                while e < 5.99:
                    mx.add("bod", song.t(bar, e), bodhran(0.25 + 0.3 * (e - 3.0) / 3.0, r, low=e % 1 == 0), 0.2, -0.1)
                    e += 0.5
                sw = I.cymbal_soft(0.4, 1.2, r, swell=True)
                mx.add("cym", song.t(bar + 1, 0) - len(sw) / SR, sw, 0.16, 0.0)
            if kind == "B" and i in (0, 4):            # ship's bell 'ding-ding' at the top of each phrase
                mx.add("bell", song.t(bar, 0) + 0.01, small_bell(77, 0.7, r), 0.1, 0.45)
                mx.add("bell", song.t(bar, 1) + 0.01, small_bell(77, 0.55, r), 0.08, 0.45)
            if kind == "B" and last:                   # stomp-stomp into the tutti
                mx.add("stomp", song.t(bar, 4), stomp(0.75, r), 0.42)
                mx.add("stomp", song.t(bar, 5), stomp(0.85, r), 0.46)
            if kind == "A3" and last:                  # big landing, then the sea opens up
                mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.4, 1.8, r), 0.16, 0.2)
                mx.add("tri", song.t(bar + 1, 0) + 0.004, triangle(song.vel(0.45), r), 0.08, -0.4)
            if kind == "C" and i in (0, 4):            # sea swell + a far bell
                sw = I.cymbal_soft(0.3, 2.2, r, swell=True)
                mx.add("cym", song.t(bar, 3), sw, 0.1, -0.3 if i == 0 else 0.3)
                mx.add("bell", song.t(bar, 3) + 0.01, small_bell(72, 0.5, r), 0.07, -0.45)
            if kind == "C" and last:                   # bodhran build + swell back into the hook
                e = 3.0
                while e < 5.99:
                    mx.add("bod", song.t(bar, e), bodhran(0.25 + 0.35 * (e - 3.0) / 3.0, r, low=e % 1 == 0), 0.22, -0.1)
                    e += 0.5
                sw = I.cymbal_soft(0.45, 1.4, r, swell=True)
                mx.add("cym", song.t(bar + 1, 0) - len(sw) / SR, sw, 0.18, 0.0)
                for k, mm in enumerate((84, 89, 93, 96)):
                    mx.add("mbox", song.t(bar, 3 + k * 0.75), I.musicbox(mm, song.vel(0.4), r), 0.1, 0.35)
            if kind in ("A2", "A4") and i == 0:
                mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.28, 1.5, r), 0.12, 0.25)
    sends = {"mel": 0.22, "mbox": 0.38, "acc": 0.16, "accb": 0.04, "whis": 0.3, "glock": 0.42, "pluck": 0.17,
             "bass": 0.03, "pad": 0.4, "stomp": 0.06, "bod": 0.08, "clap": 0.2, "shk": 0.1, "sleigh": 0.22,
             "wb": 0.22, "cym": 0.3, "tri": 0.35, "bell": 0.45}
    gains = {"mel": 1.15, "mbox": 1.0, "acc": 1.0, "accb": 1.0, "whis": 0.5, "glock": 1.4, "pluck": 2.6, "bass": 0.48,
             "pad": 3.0, "stomp": 0.95, "bod": 1.3, "clap": 2.2, "shk": 5.0, "sleigh": 2.4, "wb": 1.3, "cym": 1.0,
             "tri": 1.0, "bell": 1.0}
    mix = premix(mx, sends, gains, L, rt60=1.7, pad_bus="pad")
    mix = _delay(mix)
    meta = {"bpm": BPM_DQ, "bars": BARS, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_harbor(seed: int = 71, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Pre-mix memoised (same interface as music3.render_wedding)."""
    mix, meta = _memo(("harbor", seed), lambda: _premix_harbor(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


def main():
    os.makedirs(CACHE, exist_ok=True)
    x, meta = render_harbor()
    p = os.path.join(CACHE, "bgm_harbor.wav")
    S.write_wav(p, x)
    print(f"bgm_harbor: {x.shape[-1] / SR:.2f}s ch {x.shape[0]} peak {S.db(S.peak(x)):.2f} dBFS  "
          f"LUFS {S.lufs(x):.2f}  -> {p}", flush=True)


if __name__ == "__main__":
    main()
