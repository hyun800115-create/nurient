"""Frost Village - v4 spring music and the bard's lute loop by procedural synthesis (library + script).

  bgm_spring : warm, hopeful spring theme for the chapter ending ("the spring lantern is lit").
               Same melodic family as bgm_village: same key (F major), same pentatonic hook
               "A4 C5 D5 - C5 A4 C5 -" quoted verbatim at the top of each A section, and the
               village B-section cadence "G4 - A4 C5 D5 - C5 -" quoted at the end of B.
               92 bpm, light swing 0.55, 24 bars (~62.6 s), form A1 B A2:
                 A1 = F | Am | Bb | C | F | Dm | Gm7 C | F         flute lead an octave up (bright) with
                      grace-note flicks, harp arpeggios, pizzicato bass, shaker, soft kick, birdsong answers
                 B  = Bb | C | Am | Dm | Gm7 | C | Am Dm | Gm7 C7  ocarina lead, nylon off-beat
                      comping, woodblock 'clip-clop', airy string pad, music-box sparkles
                 A2 = F | Am | Bb | C | Dm | Bb | Gm7 C7 | F C7    warm low flute + music-box octave, glock
                      counter-melody, finger-snap 2 & 4, triangle, walking bass; C7 turns back to A1.
               Brighter than the winter theme: no sleigh bells, flute / ocarina / harp / glock on top,
               birds (pitched chirps that land on F-major-pentatonic notes) in the gaps.
  sfx_lute   : the bard's strum loop (npc_bard perform): 4 bars of a little F-major jig over
               F | Dm | Bb | C, double-course lute (two detuned Karplus-Strong strings per note),
               thumb bass + down/up strums + plucked tune. 100 bpm, ~9.6 s, mono.

Both loops: performance rendered past the loop end, tail folded onto the start (synth.fold_loop),
circular compressor / limiter (music.finish) -> seamless. build_audio2.py moves the loop point to
the nearest Vorbis block boundary via build_audio.fit_loop(); the performance pre-mix is memoised
so each fit trial only re-folds and re-masters.

Run:   python3 tools/audio/music2.py [spring] [lute]
       -> tools/audio/_cache/audio2/<key>.wav (32-bit float; spring stereo -18 LUFS, lute mono -20 LUFS)
Normally called through build_audio2.py.  Deterministic (fixed seeds).  Needs numpy + scipy.
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
import music as MU  # noqa: E402
import synth as S  # noqa: E402
from music import CHORDS, Mixer, Song, bass_note, finish, parse_bar, premix, voice  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio2")

# ----------------------------------------------------------------------------- spring score
# one string per bar, 8 eighth-note slots (music.parse_bar): NOTE = new note, '-' = hold, '.' = rest
HOOK = MU.MEL_A[0]                                   # "A4 C5 D5 - C5 A4 C5 -"  (bgm_village hook)
MEL_S_A1 = [
    HOOK,                           # F     the village hook, verbatim
    "E5 -  -  C5 D5 -  C5 A4",      # Am
    "D5 -  F5 -  D5 C5 D5 F5",      # Bb
    "G5 -  -  -  E5 D5 C5 -",       # C
    "A4 C5 D5 -  C5 A4 C5 F5",      # F     hook again, leaps up
    "A5 -  G5 F5 D5 -  F5 -",       # Dm
    "G5 -  F5 D5 E5 -  C5 -",       # Gm7 | C
    "F5 -  -  -  .  .  D5 E5",      # F     (pickup into B)
]
MEL_S_B = [
    "F5 -  -  D5 F5 G5 A5 -",       # Bb
    "G5 -  -  E5 C5 -  .  .",       # C
    "E5 -  C5 E5 A5 -  G5 E5",      # Am
    "F5 -  -  -  D5 E5 F5 G5",      # Dm
    "A5 -  G5 F5 D5 -  F5 -",       # Gm7
    "G5 -  -  -  C5 -  E5 G5",      # C
    "A5 -  G5 E5 F5 -  D5 -",       # Am | Dm
    MU.MEL_B[6],                    # Gm7 | C7   "G4 - A4 C5 D5 - C5 -" (bgm_village B cadence)
]
MEL_S_A2 = [
    HOOK,                           # F
    "E5 -  -  C5 D5 -  C5 A4",      # Am
    "D5 -  F5 -  D5 C5 D5 F5",      # Bb
    "G5 -  -  -  E5 D5 C5 -",       # C
    MU.MEL_A[5],                    # Dm    "D5 - F5 G5 F5 - D5 -" (village)
    MU.MEL_A[2],                    # Bb    "D5 C5 D5 - F5 D5 C5 A4" (village)
    "G4 -  A4 C5 D5 -  E5 -",       # Gm7 | C7
    "F5 -  -  -  E5 D5 C5 -",       # F | C7   (turn back to the hook)
]
CH_S_A1 = [("F", "F"), ("Am", "Am"), ("Bb", "Bb"), ("C", "C"), ("F", "F"), ("Dm", "Dm"), ("Gm7", "C"), ("F", "F")]
CH_S_B = [("Bb", "Bb"), ("C", "C"), ("Am", "Am"), ("Dm", "Dm"), ("Gm7", "Gm7"), ("C", "C"), ("Am", "Dm"),
          ("Gm7", "C7")]
CH_S_A2 = [("F", "F"), ("Am", "Am"), ("Bb", "Bb"), ("C", "C"), ("Dm", "Dm"), ("Bb", "Bb"), ("Gm7", "C7"), ("F", "C7")]
COUNTER_S = [("C6", "A5"), ("E6", "C6"), ("F6", "D6"), ("E6", "G6"), ("F6", "A5"), ("D6", "F6"), ("D6", "E6"),
             ("F6", "E6")]
BIRD_NOTES = [96, 98, 101, 103, 105]                 # C7 D7 F7 G7 A7 (F-major pentatonic)


F_MAJOR = {5, 7, 9, 10, 0, 2, 4}


def scale_step(m: int, d: int) -> int:
    """The next F-major scale note above (d=1) or below (d=-1) midi note m."""
    k = m + d
    while k % 12 not in F_MAJOR:
        k += d
    return k


# ----------------------------------------------------------------------------- new voices
def flute(m: float, vel: float = 0.8, dur: float = 0.5, r=None, vib: float = 1.0, grace: float = 0.0,
          grace_len: float = 0.05) -> np.ndarray:
    """Soft wooden/concert flute: near-sine with a 2nd/3rd harmonic, breath noise, attack 'chiff',
    delayed vibrato. grace = semitone offset of a slurred grace-note flick of grace_len seconds
    at the start (the note then lands on pitch); place the call grace_len early."""
    r = r or S.rng(0)
    rel = 0.12
    n = n_of(dur + grace_len * (grace != 0) + rel)
    t = np.arange(n) / SR
    f0 = float(S.midi_hz(m))
    semis = -0.12 * np.exp(-t / 0.025)
    if grace:
        semis = semis + grace * np.clip(1.0 - (t - grace_len * 0.8) / 0.012, 0, 1)
    semis = semis + 0.13 * vib * np.sin(TAU * 5.3 * t + r.uniform(0, TAU)) * np.clip((t - 0.2) / 0.25, 0, 1)
    f = f0 * 2 ** (semis / 12)
    tone = S.additive(f, n, [(1, 1.0), (2, 0.3), (3, 0.11), (4, 0.045), (5, 0.015)], fmax=9500)
    nz = r.standard_normal(n)
    breath = S.bp(nz, 2 * f0, 5.0) * 0.07 + S.bp(nz, 3800, 0.7) * 0.018
    k = n_of(0.05)
    chiff = np.zeros(n)
    chiff[:k] = S.bp(r.standard_normal(k), min(3.0 * f0, 6000), 2.0) * S.env_exp(k, 0.012, 0.002) * 0.35
    gate = dur + grace_len * (grace != 0)
    env = S.env_adsr(n, 0.03, 0.12, 0.84, rel, gate=gate)
    benv = S.env_adsr(n, 0.02, 0.1, 0.45, rel, gate=gate)
    return (tone * env + breath * benv + chiff * (0.6 + 0.4 * vel)) * (0.6 + 0.4 * vel)


def bird(r, kind: str, target_m: int) -> np.ndarray:
    """A short birdsong figure whose pitch lands on target_m (pentatonic): tweet / trill / whistle."""
    f1 = float(S.midi_hz(target_m))
    out = []
    if kind == "tweet":                       # 2-3 falling chirps 'tsee-tsee'
        for k in range(int(r.integers(2, 4))):
            d = 0.075
            n = n_of(d)
            t = np.arange(n) / SR
            f = f1 * (1 + 0.45 * np.exp(-t / 0.018))
            y = np.sin(TAU * S.phase(f, n)) + 0.08 * np.sin(2 * TAU * S.phase(f, n))
            y *= S.env_pts([(0, 0), (0.006, 1), (0.03, 0.6), (d, 0)], n)
            out.append((k * 0.1, y))
    elif kind == "trill":                     # quick warble on one note
        cnt = int(r.integers(6, 10))
        for k in range(cnt):
            d = 0.03
            n = n_of(d)
            t = np.arange(n) / SR
            f = f1 * (1 + 0.08 * np.sin(TAU * t / d))
            y = np.sin(TAU * S.phase(f, n)) * np.sin(np.pi * t / d) ** 2
            out.append((k * 0.038, y * (0.6 + 0.4 * np.sin(np.pi * (k + 0.5) / cnt))))
    else:                                     # 'whistle': swoop up onto the note, little flick at the end
        d = 0.26
        n = n_of(d)
        t = np.arange(n) / SR
        f = f1 * np.interp(t, [0, 0.11, 0.2, 0.23, d], [0.78, 1.0, 1.0, 1.12, 1.12])
        y = np.sin(TAU * S.phase(f, n)) + 0.06 * np.sin(2 * TAU * S.phase(f, n))
        y *= S.env_pts([(0, 0), (0.03, 0.8), (0.2, 1.0), (0.22, 0.3), (0.235, 0.8), (d, 0)], n)
        out.append((0.0, y))
    total = max(o + len(y) / SR for o, y in out)
    buf = np.zeros(n_of(total) + 2)
    for o, y in out:
        i = n_of(o)
        buf[i:i + len(y)] += y
    return buf


def triangle(vel: float = 0.5, r=None) -> np.ndarray:
    """Orchestral triangle 'ting' (inharmonic high partials, long soft ring)."""
    y = S.modal(3300, n_of(1.6), [(1, 1, 1.4), (2.08, 0.55, 1.1), (3.25, 0.4, 0.8), (4.6, 0.2, 0.5)], r,
                fmax=15000, attack=0.0004)
    return S.lp(y, 9000) * vel * 0.6


def snap(vel: float = 0.6, r=None) -> np.ndarray:
    """Finger snap: very short bright click + tiny body."""
    r = r or S.rng(0)
    n = n_of(0.08)
    y = S.bp(r.standard_normal(n), 2600, 1.4) * S.env_exp(n, 0.008, 0.0005)
    y += S.bp(r.standard_normal(n), 1200, 2.0) * S.env_exp(n, 0.015, 0.001) * 0.4
    return y / max(S.peak(y), 1e-9) * vel


def lute_note(m: float, vel: float, r, dur: float = 0.6, t60: float | None = None) -> np.ndarray:
    """One lute course: two gut strings a few cents apart (3 ms apart), bright pluck, gentle body EQ."""
    f = float(S.midi_hz(m))
    t60 = t60 or float(np.clip(2.0 - (m - 48) * 0.035, 0.8, 2.0))
    total = dur + 0.25
    a = S.ks_pluck(f * 2 ** (2.5 / 1200), total, r, t60=t60, bright=0.55 + 0.25 * vel, stretch=0.36, pick=0.13)
    b = S.ks_pluck(f * 2 ** (-2.5 / 1200), total, r, t60=t60 * 0.92, bright=0.5 + 0.25 * vel, stretch=0.38, pick=0.15)
    d = n_of(0.003)
    y = a / max(S.peak(a), 1e-9) + 0.8 * np.concatenate((np.zeros(d), b[:-d])) / max(S.peak(b), 1e-9)
    nd = n_of(dur)
    env = np.ones(len(y))
    env[nd:] = np.exp(-np.arange(len(y) - nd) / (0.05 * SR))
    y = S.lp(y * env, 6500)
    return y * (0.4 + 0.6 * vel) / 1.8


# ----------------------------------------------------------------------------- memo for fit_loop
_PREMIX = {}


def _memo(key, fn):
    if key not in _PREMIX:
        _PREMIX[key] = fn()
    mix, meta = _PREMIX[key]
    return mix, dict(meta)


# ----------------------------------------------------------------------------- bgm_spring
def _premix_spring(seed: int):
    bars = 24
    song = Song(92, swing=0.55, seed=seed)
    r = song.r
    L = n_of(bars * 4 * song.beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    sections = [(0, "A1", MEL_S_A1, CH_S_A1), (8, "B", MEL_S_B, CH_S_B), (16, "A2", MEL_S_A2, CH_S_A2)]
    bird_kinds = ["tweet", "whistle", "trill"]
    prev_tri, prev_pad, prev_arp = None, None, None
    for bar0, kind, mel, chs in sections:
        for i in range(8):
            bar = bar0 + i
            notes = parse_bar(mel[i])
            # ------------------------------------------------ melody
            for j, (st, ln, m) in enumerate(notes):
                t0 = song.t(bar, st / 2) + song.hum(0.004)
                dur = song.t(bar, (st + ln) / 2) - song.t(bar, st / 2)
                accent = 0.85 if st % 2 == 0 else 0.72
                if kind == "B":
                    mx.add("oca", t0, I.ocarina(m, song.vel(0.8), dur * 0.95, r, vib=1.0 if ln >= 3 else 0.5), 0.5, -0.06)
                    if ln >= 4:
                        mx.add("harp", t0 + 0.01, I.pluck(m - 12, song.vel(0.4), r, t60=2.2, dur=dur, bright=0.4), 0.2, -0.2)
                else:
                    # grace-note flick (birdsong-like) on long notes that start on a beat
                    gr = 0.0
                    if ln >= 2 and st % 2 == 0 and r.random() < (0.55 if kind == "A1" else 0.4):
                        gr = float(scale_step(m, 1 if r.random() < 0.6 else -1) - m)   # diatonic neighbour
                    gl = 0.055
                    up = 12 if kind == "A1" else 0          # A1: bright 'spring is here' octave, A2: warm + music box
                    mx.add("flute", t0 - (gl if gr else 0.0),
                           flute(m + up, song.vel(accent), dur * 0.97, r, vib=1.0 if ln >= 3 else 0.4, grace=gr,
                                 grace_len=gl), 0.42 if up else 0.5, -0.1)
                    if kind == "A2":
                        mx.add("mbox", t0 + 0.004, I.musicbox(m + 12, song.vel(0.55), r), 0.2, 0.3)
            # ------------------------------------------------ harmony
            for half in (0, 1):
                ch = chs[i][half]
                root, tri, padpcs = CHORDS[ch]
                tri_v = voice(tri[:3], prev_tri, 55, 70)
                prev_tri = tri_v
                pad_v = voice(padpcs, prev_pad, 55, 74)
                prev_pad = pad_v
                arp_v = voice(tri[:3], prev_arp, 60, 76)
                prev_arp = arp_v
                hb = half * 2
                same = chs[i][0] == chs[i][1]
                if half == 0 or not same:
                    pdur = song.beat * (4 if (same and half == 0) else 2)
                    pg = {"A1": 0.08, "B": 0.16, "A2": 0.11}[kind]
                    mx.add("pad", song.t(bar, hb), I.pad_chord(pad_v, pdur * 1.02, r, cutoff=1700, attack=0.7), pg)
                # bass: pizzicato root / fifth
                bm = bass_note(root)
                fifth = bm + 7 if bm + 7 <= 50 else bm - 5
                note1 = bm if (half == 0 or not same) else fifth
                mx.add("bass", song.t(bar, hb) + song.hum(0.003),
                       I.bass(note1, song.vel(0.8 if half == 0 else 0.68), song.beat * (0.9 if kind != "B" else 1.6), r), 0.6)
                if kind == "A2" and half == 1 and i % 2 == 0:
                    mx.add("bass", song.t(bar, 3.5) + song.hum(0.003),
                           I.bass(note1 + (2 if note1 < 44 else -2), song.vel(0.5), song.beat * 0.4, r), 0.48)
                # harp arpeggio (A sections): rising then falling 8ths over the chord
                if kind in ("A1", "A2"):
                    arp = arp_v + [arp_v[0] + 12]
                    order = [0, 1, 2, 3] if half == 0 else [2, 1, 3, 2]
                    for k in range(4):
                        mm = arp[order[k]]
                        mx.add("harp", song.t(bar, hb + k * 0.5) + song.hum(0.003),
                               I.pluck(mm, song.vel(0.55 if k == 0 else 0.42), r, t60=2.3, dur=song.beat * 1.4, bright=0.48),
                               0.2 if kind == "A1" else 0.17, 0.3 if k % 2 else -0.05)
                # nylon off-beat comping (B, A2)
                if kind in ("B", "A2"):
                    for tb, v in ((hb + 0.5, 0.55), (hb + 1.5, 0.48)):
                        tt = song.t(bar, tb) + song.hum(0.003)
                        vv = song.vel(v)
                        for jj, mm in enumerate(tri_v):
                            mx.add("gtr", tt + jj * 0.01, I.pluck(mm, vv, r, t60=1.0, dur=song.beat * 0.3), 0.15,
                                   0.35 + 0.07 * (jj - 1))
            # ------------------------------------------------ counter melody / sparkle
            if kind == "A2":
                for half in (0, 1):
                    mx.add("glock", song.t(bar, half * 2) + 0.006, I.glock(S.note(COUNTER_S[i][half]), song.vel(0.55), r),
                           0.1, 0.4)
            if kind == "B" and i % 2 == 1:
                root, tri, _ = CHORDS[chs[i][1]]
                v = voice(tri[:3], None, 79, 92)
                for k, mm in enumerate(v + [v[0] + 12]):
                    mx.add("mbox", song.t(bar, 3.0 + k * 0.25), I.musicbox(mm, song.vel(0.42), r), 0.12, 0.35)
            # ------------------------------------------------ percussion (light)
            mx.add("drm", song.t(bar, 0), I.kick(song.vel(0.55 if kind != "A2" else 0.62), r), 0.45)
            if kind == "A2":
                mx.add("drm", song.t(bar, 2), I.kick(song.vel(0.5), r), 0.4)
            for k in range(8):
                sv = 0.5 if k % 2 else 0.28
                mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(sv), r, 0.09), 0.07, 0.45)
            if kind == "B":
                for b, mm in ((1, 84), (3, 79)):
                    mx.add("wb", song.t(bar, b) + song.hum(0.002), I.woodblock(mm, song.vel(0.5), r), 0.09, -0.3)
            if kind == "A2":
                for b in (1, 3):
                    mx.add("snap", song.t(bar, b) + song.hum(0.002), snap(song.vel(0.6), r), 0.13, 0.15)
                if i % 4 == 0:
                    mx.add("tri", song.t(bar, 0) + 0.004, triangle(song.vel(0.45), r), 0.1, 0.5)
            if bar in (7, 15):                       # little fills into the next section
                for k, mm in enumerate((86, 84, 81, 79)):
                    mx.add("wb", song.t(bar, 2.0 + k * 0.5), I.woodblock(mm - 5, 0.45 + 0.05 * k, r), 0.1, -0.2 + 0.13 * k)
                sw = I.cymbal_soft(0.4, 1.2, r, swell=True)
                mx.add("cym", song.t(bar + 1, 0) - len(sw) / SR, sw, 0.14, 0.0)
            if bar in (0, 8, 16):
                mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.22, 1.5, r), 0.12, 0.25)
            # ------------------------------------------------ birdsong in the gaps (end of phrases)
            if (kind != "B" and i % 2 == 1) or (kind == "B" and i in (1, 3, 7)):
                tb = song.t(bar, 3.0 + 0.5 * r.random())
                k = bird_kinds[(bar // 2) % 3]
                y = bird(r, k, int(r.choice(BIRD_NOTES)))
                mx.add("bird", tb, y, 0.09 if k != "trill" else 0.07, 0.7 if (bar // 2) % 2 else -0.7)
                if r.random() < 0.5:                 # an answering bird on the other side
                    y2 = bird(r, bird_kinds[(bar // 2 + 1) % 3], int(r.choice(BIRD_NOTES)))
                    mx.add("bird", tb + 0.45, y2, 0.06, -0.6 if (bar // 2) % 2 else 0.6)

    sends = {"flute": 0.3, "oca": 0.32, "mbox": 0.38, "glock": 0.42, "harp": 0.3, "gtr": 0.15, "bass": 0.03,
             "pad": 0.4, "drm": 0.05, "shk": 0.1, "wb": 0.2, "snap": 0.18, "tri": 0.35, "cym": 0.3, "bird": 0.5}
    gains = {"flute": 0.48, "oca": 0.4, "harp": 2.55, "gtr": 2.4, "bass": 0.68, "pad": 4.2, "drm": 0.75, "shk": 4.6,
             "wb": 2.3, "snap": 2.2, "glock": 1.5, "tri": 1.0, "mbox": 1.1, "bird": 0.85}
    mix = premix(mx, sends, gains, L, rt60=2.0, pad_bus="pad")
    mix = S.shelf_hi(mix, 5000, 1.2)                 # a touch brighter / airier than the winter theme
    # delay everything 12 ms: the loop point then sits just before the bar-1 downbeat instead of on the
    # kick / harp attacks (fold_loop wraps the extra 12 ms of tail onto the start as usual)
    mix = np.concatenate((np.zeros((2, n_of(0.012))), mix), axis=1)
    meta = {"bpm": 92, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_spring(seed: int = 31, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Same interface as music.render_village; the pre-mix is memoised
    so build_audio.fit_loop (which calls this with different loop_samples) only re-masters."""
    mix, meta = _memo(("spring", seed), lambda: _premix_spring(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


# ----------------------------------------------------------------------------- sfx_lute
LUTE_MEL = [
    "C5 -  A4 C5 F5 -  C5 A4",      # F
    "D5 -  F5 D5 A4 -  D5 -",       # Dm
    "F5 -  D5 F5 G5 F5 D5 C5",      # Bb
    "C5 -  G4 A4 C5 -  .  .",       # C
]
LUTE_CH = ["F", "Dm", "Bb", "C"]


def _premix_lute(seed: int):
    bars = 4
    song = Song(100, swing=0.56, seed=seed)
    r = song.r
    L = n_of(bars * 4 * song.beat)
    mx = Mixer(L / SR + 4, loop=L / SR)
    off = 0.015            # the loop point sits 15 ms before the downbeat: no pluck attack straddles the wrap

    def T(b, beat):
        return song.t(b, beat) + off

    prev = None
    for bar in range(bars):
        root, tri, _ = CHORDS[LUTE_CH[bar]]
        chord = voice(tri[:3], prev, 53, 65)
        prev = chord
        full = sorted(set(chord + [chord[0] + 12]))
        bm = bass_note(root, 41, 52)
        fifth = bm + 7 if bm + 7 <= 55 else bm - 5
        # thumb bass on 1 and 3
        mx.add("lute", T(bar, 0) + song.hum(0.003), lute_note(bm, song.vel(0.8), r, song.beat * 1.7), 0.55)
        mx.add("lute", T(bar, 2) + song.hum(0.003), lute_note(fifth, song.vel(0.68), r, song.beat * 1.7), 0.5)
        # strums: (8th slot, down?, velocity, strings)
        for slot, down, v, strings in ((0, True, 0.62, full), (2, True, 0.42, full[1:]), (3, False, 0.34, full[1:]),
                                       (5, False, 0.36, full[1:]), (6, True, 0.46, full[1:]), (7, False, 0.32, full[2:])):
            t0 = T(bar, slot / 2) + song.hum(0.004)
            seq = strings if down else strings[::-1]
            for k, mm in enumerate(seq):
                mx.add("lute", t0 + k * (0.011 if down else 0.008) * (1 + 0.25 * r.random()),
                       lute_note(mm, song.vel(v * (1 - 0.06 * k)), r, song.beat * 0.45), 0.32)
        # the plucked tune on top
        for st, ln, m in parse_bar(LUTE_MEL[bar]):
            t0 = T(bar, st / 2) + song.hum(0.004)
            dur = T(bar, (st + ln) / 2) - T(bar, st / 2)
            mx.add("lute", t0 + 0.006, lute_note(m, song.vel(0.86 if st % 2 == 0 else 0.74), r, dur * 0.95), 0.62)
        # a soft knock on the lute body on beat 4 of bars 2 and 4 (bard's flourish)
        if bar % 2 == 1:
            mx.add("knock", T(bar, 3.5), I.woodblock(62, 0.4, r), 0.08)
    total = L + n_of(4.0)
    dry = sum(b.get(total) for b in mx.bus.values())[0]
    wet = S.reverb(dry, rt60=1.1, hf_rt60=0.5, predelay=0.012, size=0.7, lo_cut=200, hi_cut=5500).mean(axis=0)
    mix = dry + 0.22 * wet
    mix = S.hp(mix, 70, order=2)
    mix = S.peq(mix, 230, 2.0, 1.0)                  # wooden body
    mix = S.peq(mix, 2800, 1.5, 1.2)                 # pluck presence on phone speakers
    meta = {"bpm": 100, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -20.0}
    return mix[None, :], meta


def render_lute(seed: int = 41, loop_samples=None, premix_only: bool = False):
    """-> (mono loop (1, L), meta). Folded, circular compression + limiter (music.finish), -20 LUFS."""
    mix, meta = _memo(("lute", seed), lambda: _premix_lute(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


def main(names):
    os.makedirs(CACHE, exist_ok=True)
    for nm in names:
        fn, key = {"spring": (render_spring, "bgm_spring"), "lute": (render_lute, "sfx_lute")}[nm]
        x, meta = fn()
        p = os.path.join(CACHE, f"{key}.wav")
        S.write_wav(p, x)
        print(f"{key}: {x.shape[-1] / SR:.2f}s ch {x.shape[0]} peak {S.db(S.peak(x)):.2f} dBFS  "
              f"LUFS {S.lufs(x):.2f}  -> {p}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["spring", "lute"])
