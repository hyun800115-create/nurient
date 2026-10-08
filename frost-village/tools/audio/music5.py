"""Frost Village - v7 "햇살 해변" (Sunny Beach) music by procedural synthesis (library + script).

  bgm_beach : sunny island-style theme for the Sunny Beach resort. F major (like every Frost Village theme), 120 bpm
              with a light calypso lilt (swung eighths 0.56), 24 bars = 48.0 s, form A1 B A2:
                A  = F | Dm | Bb | C | F | Dm | Bb C | F      the bgm_village A progression; the steel pan plays the
                     village hook "A C D - C A C" (same pitches) in a syncopated island rhythm - the D is pushed onto
                     the 'and' of 2 and tied over beat 3, every phrase anticipates the next bar on the 'and' of 4.
                     Bars 4 and 6-7 answer like the village tune (the G-A-G question, the reach up to A5).
                B  = Bb | C | Am | Dm | Bb | C | Gm7 | C7     the bgm_village B section: the village's own B melody
                     on the steel pan (rolled long notes), the village ocarina doubling it softly an octave below,
                     over island comping, a marimba ghost on long notes, steel-pan chord
                     'chinks' on the off-beats, glock sparkles, three cartoon water 'bloops', a slide whistle up into
                     the last A.
                A2 = tutti: steel pan + marimba an octave below (the village voice), glock counter-melody (the
                     village A3 counter-line), claps on 2 and 4, son clave, then the F4 G4 pickup back into the hook.
              Rhythm section all through: re-entrant ukulele strummed 'down, down-up, up-down-up' (real uke chord
              shapes on G4 C4 E4 A4 strings), calypso bass (root, push on the 'and' of 2, fifth, octave), soft kick
              on 1 and 3, rim / clap on 2 and 4, shaker, congas (open tones + slaps), claves.
              Same family as bgm_village / bgm_harbor: same key, same hook, same chords, same marimba / music-box /
              glock / ocarina voices, plus the beach band (steel pan, ukulele, congas, claves, slide whistle).

Loop: performance rendered past the loop end, tail folded onto the start (synth.fold_loop), circular compressor /
limiter (music.finish) -> seamless; everything is delayed 12 ms so the loop point sits just before the downbeat.
build_audio5.py moves the loop point to the nearest Vorbis block boundary via build_audio.fit_loop(); the
pre-mix is memoised so each fit trial only re-folds and re-masters.

Run:   python3 tools/audio/music5.py
       -> tools/audio/_cache/audio5/bgm_beach.wav (32-bit float stereo, -18 LUFS)
Normally called through build_audio5.py.  Deterministic (fixed seed).  Needs numpy + scipy.
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
from music import CHORDS, Mixer, Song, bass_note, finish, premix, voice  # noqa: E402
from music2 import triangle  # noqa: E402
from sfx import bubble  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio5")

BPM = 120.0
SWING = 0.56

# ----------------------------------------------------------------------------- score
# One string per bar, 8 eighth slots. NOTE = new note, '-' = hold (also ACROSS the bar line: a bar that starts with
# '-' continues the last note of the previous bar - the island anticipations), '.' = rest.
A_MEL = [
    "A4 -  C5 D5 -  C5 A4 C5",     # F     the village hook A C D C A C, D pushed onto the 'and' of 2
    "-  -  F5 D5 -  C5 A4 -",      # Dm
    "D5 C5 D5 -  F5 D5 -  C5",     # Bb
    "-  -  G4 -  A4 G4 -  .",      # C     the village question G ... A G
    "A4 -  C5 D5 -  C5 A4 C5",     # F     hook again
    "-  -  F5 A5 -  G5 F5 D5",     # Dm    reaches up (village bar 6)
    "-  C5 D5 E5 -  D5 C5 A4",     # Bb | C
]
A_END_OPEN = "-  -  -  .  .  .  F4 G4"     # F | C7   pickup back into the hook (the village turnaround)
A_END_CLOSED = "-  -  -  -  .  .  .  ."   # F
B_MEL = [                          # the bgm_village B melody (its ocarina line), nearly note for note
    "D5 -  F5 -  D5 C5 D5 -",      # Bb
    "C5 -  -  A4 C5 D5 C5 -",      # C
    "A4 -  C5 A4 G4 A4 C5 -",      # Am
    "D5 -  -  -  -  -  .  .",      # Dm     (water bloops answer here)
    "F5 -  G5 F5 D5 -  F5 -",      # Bb
    "G5 -  -  F5 D5 C5 D5 -",      # C
    "G4 -  A4 C5 D5 -  C5 -",      # Gm7
    "C5 -  -  -  A4 G4 .  .",      # C7     (slide whistle up into A2)
]
CH_A = [("F", "F"), ("Dm", "Dm"), ("Bb", "Bb"), ("C", "C"), ("F", "F"), ("Dm", "Dm"), ("Bb", "C"), ("F", "F")]
CH_A_OPEN = CH_A[:7] + [("F", "C7")]
CH_B = [("Bb", "Bb"), ("C", "C"), ("Am", "Am"), ("Dm", "Dm"), ("Bb", "Bb"), ("C", "C"), ("Gm7", "Gm7"), ("C7", "C7")]
COUNTER = [("C6", "A5"), ("D6", "F5"), ("D6", "F6"), ("E6", "G5"), ("C6", "A5"), ("D6", "A5"), ("D6", "E6"),
           ("F6", "E6")]           # = bgm_village COUNTER_A3 (glock)
SECTIONS = [(0, "A1", A_MEL + [A_END_CLOSED], CH_A), (8, "B", B_MEL, CH_B), (16, "A2", A_MEL + [A_END_OPEN], CH_A_OPEN)]
BARS = 24

# real ukulele chord shapes, strings in playing order G4 C4 E4 A4 (re-entrant tuning)
UKE = {"F": ["A4", "C4", "F4", "A4"], "Dm": ["A4", "D4", "F4", "A4"], "Bb": ["Bb4", "D4", "F4", "Bb4"],
       "C": ["G4", "C4", "E4", "C5"], "Am": ["A4", "C4", "E4", "A4"], "Gm7": ["G4", "D4", "F4", "Bb4"],
       "C7": ["G4", "C4", "E4", "Bb4"]}
STRUM = [(0, "D", 0.82), (2, "D", 0.62), (3, "U", 0.5), (5, "U", 0.55), (6, "D", 0.64), (7, "U", 0.46)]


def melody_stream(bars):
    """Bars of 8 slots -> [(bar, slot, len_slots, midi)] with ties across bar lines."""
    out = []
    for b, s in enumerate(bars):
        toks = s.split()
        assert len(toks) == 8, s
        for i, tk in enumerate(toks):
            if tk == ".":
                continue
            if tk == "-":
                if out:
                    bb, ss, ln, m = out[-1]
                    if bb * 8 + ss + ln == b * 8 + i:
                        out[-1] = (bb, ss, ln + 1, m)
                continue
            out.append((b, i, 1, S.note(tk)))
    return out


def chord_at(chs, bar, slot):
    """Chord name sounding at (bar, slot); anticipations (odd slots 3 / 7) belong to the NEXT chord."""
    return chs[bar][0 if slot < 4 else 1]


def check_consonance(verbose: bool = False):
    """Melody notes on strong / pushed slots must be chord tones or gentle colour tones (6, 7, 9) of the chord
    they sound over (for a pushed note: the chord it lands on). Returns a list of problems."""
    colour = {"F": {5, 9, 0, 7, 2, 4}, "Dm": {2, 5, 9, 0, 4}, "Bb": {10, 2, 5, 9, 0}, "C": {0, 4, 7, 2, 9, 5},
              "Am": {9, 0, 4, 7, 2}, "Gm7": {7, 10, 2, 5, 0}, "C7": {0, 4, 7, 10, 2, 5, 9}}
    bad = []
    for bar0, kind, mel, chs in SECTIONS:
        for b, s, ln, m in melody_stream(mel):
            if s in (0, 4):
                ch = chord_at(chs, b, s)
            elif s in (3, 7) and ln >= 2:              # pushed note tied over the next strong beat
                nb, ns = (b, 4) if s == 3 else (b + 1, 0)
                ch = chord_at(chs, min(nb, 7), ns) if nb < 8 else chs[0][0]
            else:
                continue
            if m % 12 not in colour[ch]:
                bad.append(f"{kind} bar {b + 1} slot {s}: {m} over {ch}")
    if verbose:
        print("consonance:", "OK" if not bad else bad)
    return bad


# ----------------------------------------------------------------------------- beach-band voices
def steelpan(m: float, vel: float = 0.8, r=None, ring: float | None = None) -> np.ndarray:
    """Tenor steel pan note: tuned harmonic partials (fundamental, octave, octave + fifth, 2 octaves) - the octave
    blooms a few ms after the strike and beats slowly against a slightly detuned twin (the pan's shimmer) - a soft
    rubber-stick 'thock', and a whisper of inharmonic steel."""
    r = r or S.rng(0)
    f = float(S.midi_hz(m))
    t60 = float(np.clip(2.1 - (m - 72) * 0.07, 0.6, 2.2)) if ring is None else ring
    n = n_of(t60 * 0.8 + 0.05)
    t = np.arange(n) / SR
    parts = [(1.0, 1.0, t60, 0.0015), (1.0026, 0.22, t60 * 0.9, 0.002), (2.0, 0.6 * (0.6 + 0.4 * vel), t60 * 0.55, 0.008),
             (2.0042, 0.22, t60 * 0.5, 0.012), (3.0, 0.25 * vel, t60 * 0.3, 0.005), (4.01, 0.09 * vel, t60 * 0.17, 0.003),
             (5.02, 0.035 * vel, 0.1, 0.002)]
    y = np.zeros(n)
    for ratio, amp, tt60, att in parts:
        fr = f * ratio
        if fr > 9500:
            continue
        y += amp * np.sin(TAU * fr * t + r.uniform(0, TAU)) * np.exp(-t * 6.9078 / tt60) * (1 - np.exp(-t / att))
    y += S.modal(f * 1.47, n, [(1, 0.05, 0.05), (1.61, 0.03, 0.03), (2.45, 0.02, 0.02)], r, fmax=9000.0)
    k = n_of(0.012)
    y[:k] += S.lp(r.standard_normal(k), 1600 + 800 * vel) * np.hanning(k) * 0.16 * vel
    return y * (0.5 + 0.5 * vel) / 1.4


def pan_roll(m: float, vel: float, dur: float, r) -> np.ndarray:
    """Pannist's roll on a long note: quick alternating strikes (~12 per second), swelling then easing."""
    n = n_of(dur + 0.9)
    out = np.zeros(n)
    k, t = 0, 0.0
    while t < dur - 0.03:
        u = t / max(dur, 1e-3)
        v = vel * (0.5 + 0.18 * np.sin(np.pi * u)) * (1.0 if k % 2 == 0 else 0.86)
        y = steelpan(m, v, r, ring=0.9)
        i = n_of(t)
        e = min(n, i + len(y))
        out[i:e] += y[:e - i]
        k += 1
        t += 1.0 / 12.5 + r.normal(0, 0.003)
    return out


def conga(r, kind: str = "open_lo", vel: float = 0.7) -> np.ndarray:
    """Hand drum: 'open_hi' / 'open_lo' (tuned skin tone with a pitch drop) or 'slap' (sharp skin crack)."""
    n = n_of(0.45)
    t = np.arange(n) / SR
    f0 = {"open_hi": 330.0, "open_lo": 220.0, "slap": 300.0}[kind]
    tau = {"open_hi": 0.13, "open_lo": 0.18, "slap": 0.05}[kind]
    f = f0 * (1 + 0.12 * np.exp(-t / 0.012))
    y = np.sin(TAU * S.phase(f, n)) * np.exp(-t / tau)
    y += 0.3 * np.sin(TAU * S.phase(f * 1.59, n)) * np.exp(-t / (tau * 0.45))
    y += 0.12 * np.sin(TAU * S.phase(f * 2.14, n)) * np.exp(-t / (tau * 0.3))
    skin = S.bp(r.standard_normal(n), 1800 if kind == "slap" else 1000, 0.9) * np.exp(-t / (0.012 if kind == "slap" else 0.006))
    y = y * (0.45 if kind == "slap" else 1.0) + skin * (1.4 if kind == "slap" else 0.35)
    y *= np.clip(t / 0.0008, 0, 1)
    return y / max(S.peak(y), 1e-9) * vel


def claves(r, vel: float = 0.6) -> np.ndarray:
    """Claves 'tock': two hardwood sticks, a short bright ring around 2.5 kHz."""
    n = n_of(0.12)
    y = S.modal(2490.0, n, [(1, 1, 0.07), (2.71, 0.25, 0.02)], r, fmax=12000.0, attack=0.0003)
    return y * vel


def slide_whistle(r, m0: float, m1: float, dur: float, vel: float = 0.6) -> np.ndarray:
    """Cartoon slide whistle gliding from m0 to m1 (ear candy into the last A section)."""
    n = n_of(dur + 0.06)
    t = np.arange(n) / SR
    u = np.clip(t / dur, 0, 1)
    mm = m0 + (m1 - m0) * (u ** 1.3) + 0.12 * np.sin(TAU * 6.0 * t) * u
    f = S.midi_hz(mm)
    y = S.additive(f, n, [(1, 1.0), (2, 0.08), (3, 0.03)], fmax=9000) + 0.05 * S.bp(r.standard_normal(n), 2500, 1.0)
    return y * S.env_adsr(n, 0.04, 0.05, 0.9, 0.06, gate=dur) * vel


def uke_strum(chord: str, direction: str, vel: float, r, ring: float) -> np.ndarray:
    """One ukulele strum over the four re-entrant strings (down = G C E A, up = A E C (G), lighter)."""
    strings = [S.note(x) for x in UKE[chord]]
    order = list(range(4)) if direction == "D" else [3, 2, 1, 0][:3 if r.random() < 0.5 else 4]
    gap = 0.009 if direction == "D" else 0.007
    n = n_of(ring + 0.2 + 4 * gap)
    out = np.zeros(n)
    for j, si in enumerate(order):
        v = vel * (1.0 - 0.06 * j) * r.uniform(0.92, 1.0)
        y = I.pluck(strings[si], v, r, t60=0.9, dur=ring, bright=0.62 if direction == "D" else 0.72)
        i = n_of(j * gap)
        e = min(n, i + len(y))
        out[i:e] += y[:e - i]
    return out


# ----------------------------------------------------------------------------- performance
_PREMIX = {}


def _memo(key, fn):
    if key not in _PREMIX:
        _PREMIX[key] = fn()
    mix, meta = _PREMIX[key]
    return mix, dict(meta)


def _delay(mix, sec=0.012):
    return np.concatenate((np.zeros((2, n_of(sec))), mix), axis=1)


def _premix_beach(seed: int):
    song = Song(BPM, swing=SWING, seed=seed)
    r = song.r
    beat = song.beat
    L = n_of(BARS * 4 * beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    st = lambda bar, slot: song.t(bar, slot / 2.0)      # noqa: E731  slot (eighth) -> seconds
    prev_tri = None
    for bar0, kind, mel, chs in SECTIONS:
        # ------------------------------------------------ melody
        for b, s, ln, m in melody_stream(mel):
            bar = bar0 + b
            t0 = st(bar, s) + song.hum(0.003)
            dur = st(bar, s + ln) - st(bar, s)
            acc = 0.88 if s in (0, 4) else (0.82 if s in (3, 7) else 0.68)
            if kind in ("A1", "A2"):
                if ln >= 4:
                    mx.add("pan", t0, pan_roll(m + 12, song.vel(acc * 0.95), dur * 0.95, r), 0.5, -0.12)
                else:
                    mx.add("pan", t0, steelpan(m + 12, song.vel(acc), r), 0.5, -0.12)
                if kind == "A2":
                    mx.add("mel", t0 + 0.004, I.marimba(m, song.vel(acc * 0.85), r), 0.3, 0.22)
                elif s in (0, 4) and ln >= 2:
                    mx.add("mbox", t0 + 0.005, I.musicbox(m + 24, song.vel(0.45), r), 0.08, 0.35)
            else:                                           # B: the village B melody on the steel pan (a softer,
                #                                             rolled touch), the village ocarina doubling it quietly
                if ln >= 4:                                 # an octave below
                    mx.add("pan", t0, pan_roll(m + 12, song.vel(acc * 0.85), dur * 0.95, r), 0.44, -0.12)
                else:
                    mx.add("pan", t0, steelpan(m + 12, song.vel(acc * 0.92), r), 0.44, -0.12)
                mx.add("oca", t0, I.ocarina(m, song.vel(0.7), dur * 0.96, r, vib=1.0 if ln >= 3 else 0.5), 0.15,
                       -0.08)
                if ln >= 4:
                    mx.add("mel", t0, I.marimba(m - 12, song.vel(0.38), r), 0.2, -0.25)
        # ------------------------------------------------ harmony + rhythm section, bar by bar
        for i in range(8):
            bar = bar0 + i
            c1, c2 = chs[i]
            # ukulele 'down, down-up, up-down-up'
            for k, (slot, dirn, v) in enumerate(STRUM):
                ch = c1 if slot < 4 else c2
                nxt = STRUM[k + 1][0] if k + 1 < len(STRUM) else 8
                ring = st(bar, nxt) - st(bar, slot)
                mx.add("uke", st(bar, slot) + song.hum(0.004), uke_strum(ch, dirn, song.vel(v), r, ring * 0.92), 0.2,
                       0.3 if dirn == "D" else 0.36)
            # calypso bass: root (1), push on the 'and' of 2, fifth / new root on 3, octave on 4
            r1, r2 = bass_note(CHORDS[c1][0]), bass_note(CHORDS[c2][0])
            fifth = (r2 + 7 if r2 + 7 <= 50 else r2 - 5) if c1 == c2 else r2
            octv = r2 + 12 if r2 + 12 <= 52 else r2
            for slot, mm, ln, v in ((0, r1, 2.6, 0.88), (3, r1, 0.9, 0.7), (4, fifth, 1.8, 0.8), (6, octv, 0.9, 0.66)):
                mx.add("bass", st(bar, slot) + song.hum(0.002), I.bass(mm, song.vel(v), ln * beat / 2 * 0.92, r), 0.6)
            # off-beat steel-pan chord 'chinks' in B (voiced in the pan's middle)
            if kind == "B":
                for slot in (3, 7):
                    ch = c1 if slot < 4 else c2
                    tri = voice(CHORDS[ch][1][:3], prev_tri, 64, 77)
                    prev_tri = tri
                    for j, mm in enumerate(tri):
                        mx.add("panc", st(bar, slot) + 0.006 * j + song.hum(0.003), steelpan(mm, song.vel(0.42), r, 0.7),
                               0.16, 0.3 - 0.15 * j)
                if i % 2 == 1:                              # glock sparkle arpeggio (village B music box figure)
                    tri = voice(CHORDS[c2][1][:3], None, 79, 92)
                    for k, mm in enumerate(tri + [tri[0] + 12]):
                        mx.add("glock", st(bar, 6) + k * beat * 0.25, I.glock(mm, song.vel(0.42), r), 0.07, 0.4)
                if i in (0, 4):
                    mx.add("pad", st(bar, 0), I.pad_chord(voice(CHORDS[c1][2], None, 52, 72), 8 * beat * 0.98, r,
                                                          cutoff=1200, attack=0.8, release=1.4), 0.14)
            # glock counter-melody in A2 (bgm_village A3 counter-line)
            if kind == "A2":
                for half in (0, 1):
                    nm = COUNTER[i][half]
                    mx.add("glock", st(bar, half * 4) + 0.006, I.glock(S.note(nm), song.vel(0.55), r), 0.09, 0.38)
            # ------------------------------------------------ percussion
            full = kind != "A1"
            mx.add("kick", st(bar, 0), I.kick(song.vel(0.6), r), 0.42)
            mx.add("kick", st(bar, 4), I.kick(song.vel(0.5), r), 0.36)
            for slot in (2, 6):                             # backbeat: rim click (A1, B) / claps (A2)
                if kind == "A2":
                    mx.add("clap", st(bar, slot) + song.hum(0.004), I.clap_soft(song.vel(0.6), r), 0.2, -0.2)
                    mx.add("clap", st(bar, slot) + 0.012 + song.hum(0.004), I.clap_soft(song.vel(0.5), r), 0.15, 0.25)
                else:
                    mx.add("rim", st(bar, slot) + song.hum(0.002), I.woodblock(91, song.vel(0.5), r), 0.08, -0.15)
            for slot in range(8):
                mx.add("shk", st(bar, slot) + song.hum(0.002), I.shaker(song.vel(0.5 if slot % 2 else 0.3), r, 0.07),
                       0.07, 0.45)
            for slot, kd, v in ((2, "slap", 0.45), (3, "open_hi", 0.6), (6, "open_lo", 0.7), (7, "open_lo", 0.62)):
                if not full and kd == "slap":
                    continue
                mx.add("conga", st(bar, slot) + song.hum(0.004), conga(r, kd, song.vel(v)), 0.24,
                       -0.35 if kd != "open_hi" else -0.25)
            if kind == "A2":                                # son clave 2-3
                for slot in ((2, 4) if i % 2 == 0 else (0, 3, 6)):
                    mx.add("clv", st(bar, slot) + song.hum(0.002), claves(r, song.vel(0.55)), 0.07, 0.3)
            if kind == "B" and i % 4 == 0:
                mx.add("tri", st(bar, 0) + 0.004, triangle(song.vel(0.4), r), 0.07, -0.4)
        # ------------------------------------------------ fills / ear candy
        last = bar0 + 7
        if kind == "A1":                                    # conga fill into B
            for k, (slot, kd) in enumerate(((4, "open_hi"), (5, "open_hi"), (6, "open_lo"), (7, "open_lo"))):
                mx.add("conga", st(last, slot), conga(r, kd, 0.5 + 0.08 * k), 0.26, -0.3)
            sw = I.cymbal_soft(0.35, 1.2, r, swell=True)
            mx.add("cym", st(last + 1, 0) - len(sw) / SR, sw, 0.12, 0.0)
        if kind == "B":
            for k, mm in enumerate((77, 81, 84)):           # water 'bloops' answering the melody (bar 4)
                f = float(S.midi_hz(mm))
                mx.add("bloop", st(bar0 + 3, 5) + k * beat * 0.5, bubble(r, f * 0.8, 0.13, 0.25, tau=0.05), 0.1,
                       0.3 - 0.3 * k)
            mx.add("slide", st(last, 4), slide_whistle(r, 72, 89, 1.4 * beat), 0.07, 0.25)
            sw = I.cymbal_soft(0.4, 1.3, r, swell=True)
            mx.add("cym", st(last + 1, 0) - len(sw) / SR, sw, 0.15, 0.0)
        if kind == "A2":                                    # woodblock pickup back into the hook + crash at the top
            mx.add("rim", st(last, 6), I.woodblock(84, 0.7, r), 0.15, 0.3)
            mx.add("rim", st(last, 7), I.woodblock(79, 0.6, r), 0.14, 0.2)
            mx.add("cym", st(bar0, 0), I.cymbal_soft(0.3, 1.6, r), 0.12, 0.25)
    sends = {"pan": 0.24, "panc": 0.2, "mel": 0.2, "mbox": 0.38, "oca": 0.3, "uke": 0.14, "bass": 0.03,
             "glock": 0.4, "pad": 0.4, "kick": 0.04, "clap": 0.18, "rim": 0.16, "shk": 0.08, "conga": 0.12,
             "clv": 0.2, "tri": 0.35, "cym": 0.3, "bloop": 0.3, "slide": 0.3}
    gains = {"pan": 1.0, "panc": 1.0, "mel": 1.1, "mbox": 1.0, "oca": 0.55, "uke": 1.3, "bass": 0.52, "glock": 1.4,
             "pad": 2.6, "kick": 0.7, "clap": 1.9, "rim": 2.6, "shk": 4.5, "conga": 1.0, "clv": 2.6, "tri": 1.0,
             "cym": 1.0, "bloop": 1.0, "slide": 1.0}
    mix = premix(mx, sends, gains, L, rt60=1.5, pad_bus="pad")
    # gentle roll-off above 16 kHz (24 dB / oct): only shaker / cymbal air ~60 dB down lives there; the .mp3 fallback
    # (iOS) has nothing above ~16 kHz either, so both formats now sound alike, and the .ogg is a few kB lighter.
    mix = S.lp(mix, 16000.0, order=2)
    mix = _delay(mix)
    meta = {"bpm": BPM, "bars": BARS, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_beach(seed: int = 81, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Pre-mix memoised (same interface as music4.render_harbor)."""
    mix, meta = _memo(("beach", seed), lambda: _premix_beach(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


def main():
    check_consonance(verbose=True)
    os.makedirs(CACHE, exist_ok=True)
    x, meta = render_beach()
    p = os.path.join(CACHE, "bgm_beach.wav")
    S.write_wav(p, x)
    print(f"bgm_beach: {x.shape[-1] / SR:.2f}s ch {x.shape[0]} peak {S.db(S.peak(x)):.2f} dBFS  "
          f"LUFS {S.lufs(x):.2f}  -> {p}", flush=True)


if __name__ == "__main__":
    main()
