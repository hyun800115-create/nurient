"""Frost Village - v5 life-event music by procedural synthesis (library + script).

  bgm_wedding  : joyful little wedding march for the town-hall ceremony. F major, 124 bpm, straight
                 8ths, 16 bars (31 s), form A B:
                   A = F | Dm | Bb | C | F | Dm | Gm7 C | F        the bgm_village hook "A4 C5 D5 - C5 A4 C5 -"
                       verbatim (bars 1 and 5) + bgm_village A-melody bars 2, 3, 4 and 6 - marimba lead,
                       music-box octave, soft brass doubling in bars 5-8, 'oom-pah' (pizzicato bass +
                       low brass on 1 & 3, brass/pluck chord stabs on 2 & 4), march snare, sleigh bells.
                   B = F | C7 F | Bb | C | F | C7 F | Dm Gm7 | C7   a nod to the Bridal Chorus that
                       everyone knows as the wedding tune ('딴 딴 따단', Wagner 1850, public domain):
                       only its 2-bar incipit 5-1.1-1 / 5-2.7-1, transposed to F, then new material -
                       glock + tubular-bell lead with a flute, organ-ish pad, guests clapping on 2 & 4,
                       a big F bell 'dong' on bars 9 and 13; C7 turns back into the hook.
  bgm_farewell : gentle, warm, hopeful farewell for the memorial garden (flower farewell). F major, 3/4,
                 93 bpm, 16 bars (31 s). The village hook slowed into a lullaby ("A4 - C5 - D5 -").
                   A = F | Am | Bb | F | Dm | Gm7 | C | C7         music-box lead doubled by a soft harp
                   B = Bb | C | Am | Dm | Gm7 | C | F | C7         warm flute lead rising to A5 (hope),
                       ending on the hook incipit; rolling harp arpeggios, string pad, soft bass, a few
                       high glock chimes, music-box sparkles into each section. No drums.

Both loops: performance rendered past the loop end, tail folded onto the start (synth.fold_loop),
circular compressor / limiter (music.finish) -> seamless; everything is delayed 12 ms so the loop point
sits just before the downbeat (no attack straddles the wrap). build_audio3.py moves the loop point to the
nearest Vorbis block boundary via build_audio.fit_loop(); the pre-mix is memoised so each fit trial
only re-folds and re-masters.

Run:   python3 tools/audio/music3.py [wedding] [farewell]
       -> tools/audio/_cache/audio3/<key>.wav (32-bit float stereo, -18 LUFS)
Normally called through build_audio3.py.  Deterministic (fixed seeds).  Needs numpy + scipy.
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
from music import CHORDS, Mixer, Song, bass_note, finish, premix, voice  # noqa: E402
from music2 import flute, triangle  # noqa: E402
from synth import SR, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio3")


# ----------------------------------------------------------------------------- helpers
def parse_slots(s: str, beats: float = 4.0):
    """Like music.parse_bar but any number of equal slots per bar (8 = eighths, 16 = sixteenths in 4/4,
    6 = eighths in 3/4) -> [(start_beat, len_beats, midi)]. NOTE = new note, '-' = hold, '.' = rest."""
    toks = s.split()
    step = beats / len(toks)
    out = []
    for i, tk in enumerate(toks):
        if tk in "-.":
            if tk == "-" and out:
                st, ln, m = out[-1]
                if abs(st + ln - i * step) < 1e-9:
                    out[-1] = (st, ln + step, m)
            continue
        out.append((i * step, step, S.note(tk)))
    return out


class SongM(Song):
    """music.Song with a bar length of ``bpb`` beats (3 for the 3/4 farewell)."""

    def __init__(self, bpm, swing=0.5, seed=1, bpb=4):
        super().__init__(bpm, swing, seed)
        self.bpb = bpb

    def t(self, bar, beat):
        b = bar * self.bpb + beat
        w = np.floor(b + 1e-9)
        f = b - w
        f2 = f / 0.5 * self.swing if f <= 0.5 else self.swing + (f - 0.5) / 0.5 * (1 - self.swing)
        return (w + f2) * self.beat


_PREMIX = {}


def _memo(key, fn):
    if key not in _PREMIX:
        _PREMIX[key] = fn()
    mix, meta = _PREMIX[key]
    return mix, dict(meta)


def _delay(mix, sec=0.012):
    return np.concatenate((np.zeros((2, n_of(sec))), mix), axis=1)


# ----------------------------------------------------------------------------- bgm_wedding score
W_MEL_A = [
    MU.MEL_A[0],                    # F      "A4 C5 D5 - C5 A4 C5 -"  the village hook, verbatim
    MU.MEL_A[1],                    # Dm     "D5 - F5 D5 C5 - A4 -"   (village)
    MU.MEL_A[2],                    # Bb     "D5 C5 D5 - F5 D5 C5 A4" (village)
    MU.MEL_A[3],                    # C      "G4 - - - A4 G4 . ."     (village; the snare fills the gap)
    "A4 C5 D5 -  C5 A4 C5 F5",      # F      hook again, leaps up
    MU.MEL_A[5],                    # Dm     "D5 - F5 G5 F5 - D5 -"   (village)
    "D5 -  C5 D5 E5 -  G5 -",       # Gm7 | C
    "F5 -  -  -  -  -  .  .",       # F
]
W_MEL_B = [
    "C5 -  -  -  F5 -  -  F5 F5 -  -  -  -  -  -  -",     # F      bridal-chorus incipit  5 | 1. 1 1
    "C5 -  -  -  G5 -  -  E5 F5 -  -  -  -  -  -  -",     # C7 | F                        5 | 2. 7 1
    "D5 -  F5 -  A5 -  G5 F5",                            # Bb
    "G5 -  -  -  E5 -  C5 -",                             # C
    "C5 -  -  -  F5 -  -  F5 A5 -  -  -  -  -  -  -",     # F      the nod again, rising to the 3rd
    "C6 -  -  -  Bb5 -  -  G5 A5 -  -  -  -  -  -  -",    # C7 | F
    "A5 -  F5 -  D5 -  F5 -",                             # Dm | Gm7
    "G5 -  E5 -  C5 -  Bb4 -",                            # C7     (Bb4 -> A4: back into the hook)
]
W_CH_A = [("F", "F"), ("Dm", "Dm"), ("Bb", "Bb"), ("C", "C"), ("F", "F"), ("Dm", "Dm"), ("Gm7", "C"), ("F", "F")]
W_CH_B = [("F", "F"), ("C7", "F"), ("Bb", "Bb"), ("C", "C"), ("F", "F"), ("C7", "F"), ("Dm", "Gm7"), ("C7", "C7")]


def _premix_wedding(seed: int):
    bars = 16
    song = SongM(124, swing=0.5, seed=seed)
    r = song.r
    L = n_of(bars * 4 * song.beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    prev_tri, prev_pad = None, None
    for bar0, kind, mel, chs in ((0, "A", W_MEL_A, W_CH_A), (8, "B", W_MEL_B, W_CH_B)):
        for i in range(8):
            bar = bar0 + i
            # ------------------------------------------------ melody
            for st, ln, m in parse_slots(mel[i]):
                t0 = song.t(bar, st) + song.hum(0.003)
                dur = song.t(bar, st + ln) - song.t(bar, st)
                on_beat = abs(st - round(st)) < 1e-6
                acc = 0.88 if on_beat else 0.74
                if kind == "A":
                    mx.add("mel", t0, I.marimba(m, song.vel(acc), r), 0.5, -0.1)
                    mx.add("mbox", t0 + 0.004, I.musicbox(m + 12, song.vel(0.6), r), 0.2, 0.25)
                    if i >= 4:
                        mx.add("brass", t0, I.brass(m, song.vel(0.6), dur * 0.85, bright=0.7), 0.15, -0.2)
                else:
                    mx.add("bells", t0, I.glock(m + 12, song.vel(acc), r), 0.3, 0.2)
                    mx.add("tbell", t0, I.bell_fm(m, song.vel(acc * 0.85), t60=float(np.clip(0.6 + dur * 1.2, 0.8, 2.2)),
                                                  ratio=3.5, index=1.5), 0.2, -0.15)
                    mx.add("flute", t0, flute(m, song.vel(0.78), dur * 0.95, r, vib=1.0 if ln >= 1.5 else 0.4), 0.42, -0.05)
            # ------------------------------------------------ harmony: pad + oom-pah
            for half in (0, 1):
                ch = chs[i][half]
                root, tri, padpcs = CHORDS[ch]
                tri_v = voice(tri[:3], prev_tri, 55, 70)
                prev_tri = tri_v
                pad_v = voice(padpcs, prev_pad, 53, 72)
                prev_pad = pad_v
                hb = half * 2
                same = chs[i][0] == chs[i][1]
                if half == 0 or not same:
                    pdur = song.beat * (4 if (same and half == 0) else 2)
                    mx.add("pad", song.t(bar, hb), I.pad_chord(pad_v, pdur * 1.02, r, cutoff=1500 if kind == "B" else 1150,
                                                               attack=0.3), 0.15 if kind == "A" else 0.24)
                bm = bass_note(root)
                fifth = bm + 7 if bm + 7 <= 50 else bm - 5
                nb = bm if (half == 0 or not same) else fifth
                tb = song.t(bar, hb) + song.hum(0.002)
                mx.add("bass", tb, I.bass(nb, song.vel(0.85 if half == 0 else 0.75), song.beat * 0.8, r), 0.6)
                mx.add("tuba", tb, I.brass(nb, song.vel(0.7 if half == 0 else 0.6), song.beat * 0.55, bright=0.5), 0.3)
                ts = song.t(bar, hb + 1) + song.hum(0.002)
                for j, mm in enumerate(tri_v):
                    mx.add("stab", ts + j * 0.004, I.brass(mm, song.vel(0.5), 0.13, bright=0.55), 0.1, 0.25)
                    mx.add("pluck", ts + j * 0.008, I.pluck(mm, song.vel(0.58), r, t60=1.0, dur=0.22), 0.14, 0.32)
            # ------------------------------------------------ percussion
            mx.add("drm", song.t(bar, 0), I.kick(song.vel(0.68), r), 0.5)
            mx.add("drm", song.t(bar, 2), I.kick(song.vel(0.58), r), 0.45)
            for b in (1, 3):
                mx.add("snr", song.t(bar, b) + song.hum(0.002), I.snare_soft(song.vel(0.55), r), 0.2, 0.1)
            if i % 2 == 1 and i != 7:
                for k in range(2):                       # march 'ra-ta' pickup
                    mx.add("snr", song.t(bar, 3.5 + k * 0.25) + song.hum(0.002), I.snare_soft(song.vel(0.3), r), 0.18, 0.1)
            for k in range(8):
                mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(0.5 if k % 2 else 0.3), r, 0.09),
                       0.065, 0.45)
            if kind == "A":
                for b in (1, 3):
                    mx.add("sleigh", song.t(bar, b) + 0.008, I.sleigh(song.vel(0.5), r), 0.08, -0.4)
            elif i >= 4:
                for b in (1, 3):                         # the guests clap along
                    mx.add("clap", song.t(bar, b) + song.hum(0.006), I.clap_soft(song.vel(0.6), r), 0.2, -0.25)
                    mx.add("clap", song.t(bar, b) + 0.012 + song.hum(0.006), I.clap_soft(song.vel(0.5), r), 0.16, 0.3)
            if i == 7:                                   # snare roll + cymbal swell into the next section
                t = 2.0
                while t < 3.95:
                    mx.add("snr", song.t(bar, t), I.snare_soft(0.2 + 0.35 * (t - 2.0) / 2.0, r), 0.2, 0.1)
                    t += 0.25
                sw = I.cymbal_soft(0.45, 1.3, r, swell=True)
                mx.add("cym", song.t(bar + 1, 0) - len(sw) / SR, sw, 0.18, 0.0)
                for k, mm in enumerate((96, 93, 89, 84)):  # music-box sparkle down
                    mx.add("mbox", song.t(bar, 2.0 + k * 0.25), I.musicbox(mm, song.vel(0.45), r), 0.12, 0.35)
            if i == 0:
                mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.3, 1.6, r), 0.16, 0.25)
                mx.add("tri", song.t(bar, 0) + 0.004, triangle(song.vel(0.5), r), 0.1, 0.5)
            if kind == "B" and i in (0, 4):                # big wedding bell 'dong' (F4) under the motif
                mx.add("dong", song.t(bar, 0) + 0.003, I.bell_fm(65, 0.8, t60=3.0, ratio=2.0, index=1.2), 0.28, -0.3)
                mx.add("dong", song.t(bar, 0) + 0.003, I.bell_fm(77, 0.6, t60=2.2, ratio=3.5, index=1.4), 0.14, 0.3)
    sends = {"mel": 0.22, "mbox": 0.38, "brass": 0.18, "bells": 0.4, "tbell": 0.35, "flute": 0.3, "pad": 0.4,
             "bass": 0.03, "tuba": 0.05, "stab": 0.15, "pluck": 0.15, "drm": 0.05, "snr": 0.14, "shk": 0.1,
             "sleigh": 0.22, "clap": 0.2, "cym": 0.3, "tri": 0.35, "dong": 0.5}
    gains = {"mel": 1.0, "mbox": 1.0, "brass": 0.9, "bells": 0.95, "tbell": 0.85, "flute": 0.4, "pad": 3.0,
             "bass": 0.6, "tuba": 0.6, "stab": 1.3, "pluck": 2.6, "drm": 0.72, "snr": 2.3, "shk": 4.4,
             "sleigh": 2.4, "clap": 1.8, "cym": 1.0, "tri": 1.0, "dong": 0.5}
    mix = premix(mx, sends, gains, L, rt60=1.8, pad_bus="pad")
    mix = _delay(mix)
    meta = {"bpm": 124, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_wedding(seed: int = 51, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Same interface as music2.render_spring (pre-mix memoised)."""
    mix, meta = _memo(("wedding", seed), lambda: _premix_wedding(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


# ----------------------------------------------------------------------------- bgm_farewell score
F_MEL = [
    "A4 -  C5 -  D5 -",     # F      the village hook, slowed into 3/4
    "C5 -  -  -  A4 C5",    # Am
    "D5 -  -  -  F5 -",     # Bb
    "C5 -  -  -  -  -",     # F
    "A4 -  C5 -  D5 -",     # Dm     hook again
    "F5 -  -  -  E5 D5",    # Gm7
    "E5 -  -  -  D5 C5",    # C
    "G4 -  -  -  .  .",     # C7
    "D5 -  -  -  C5 D5",    # Bb
    "E5 -  -  -  G5 -",     # C
    "A5 -  -  -  G5 E5",    # Am     (lifting: hope)
    "F5 -  -  -  E5 D5",    # Dm
    "D5 -  F5 -  A5 -",     # Gm7    (rises to the 9th)
    "G5 -  -  -  E5 C5",    # C
    "A4 -  C5 -  D5 -",     # F      the hook again, as a goodbye
    "C5 -  -  -  .  .",     # C7
]
F_CH = ["F", "Am", "Bb", "F", "Dm", "Gm7", "C", "C7", "Bb", "C", "Am", "Dm", "Gm7", "C", "F", "C7"]
F_CHIMES = {0: 89, 4: 93, 8: 86, 12: 93}          # high glock chimes at phrase starts (F6 A6 D6 A6)


def _premix_farewell(seed: int):
    bars = 16
    song = SongM(93, swing=0.5, seed=seed, bpb=3)
    r = song.r
    L = n_of(bars * 3 * song.beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    prev_arp, prev_pad = None, None
    for bar in range(bars):
        kind = "A" if bar < 8 else "B"
        # ------------------------------------------------ melody
        for st, ln, m in parse_slots(F_MEL[bar], 3.0):
            t0 = song.t(bar, st) + song.hum(0.005)
            dur = song.t(bar, st + ln) - song.t(bar, st)
            on_beat = abs(st - round(st)) < 1e-6
            if kind == "A":
                mx.add("mbox", t0, I.musicbox(m + 12, song.vel(0.72 if on_beat else 0.6), r), 0.4, -0.1)
                mx.add("harp", t0 + 0.006, I.pluck(m, song.vel(0.5), r, t60=2.6, dur=dur, bright=0.4), 0.16, -0.25)
            else:
                mx.add("flute", t0, flute(m, song.vel(0.74), dur * 0.97, r, vib=1.0 if ln >= 1.5 else 0.5), 0.46, -0.05)
                if ln >= 2:
                    mx.add("mbox", t0 + 0.01, I.musicbox(m + 12, song.vel(0.45), r), 0.12, 0.35)
        # ------------------------------------------------ harmony
        root, tri, padpcs = CHORDS[F_CH[bar]]
        pad_v = voice(padpcs, prev_pad, 53, 72)
        prev_pad = pad_v
        mx.add("pad", song.t(bar, 0), I.pad_chord(pad_v, 3 * song.beat * 1.02, r, cutoff=1300, attack=0.9, release=1.4),
               0.14 if kind == "A" else 0.2)
        bm = bass_note(root, 38, 49)
        mx.add("bass", song.t(bar, 0) + song.hum(0.003), I.bass(bm, song.vel(0.62), 2.6 * song.beat, r), 0.42)
        arp_v = voice(tri[:3], prev_arp, 57, 72)
        prev_arp = arp_v
        arp = arp_v + [arp_v[0] + 12]
        mx.add("harp", song.t(bar, 0) + song.hum(0.003), I.pluck(bm + 12, song.vel(0.55), r, t60=2.6, dur=2.6 * song.beat,
                                                                 bright=0.35), 0.2, -0.05)
        for k, idx in enumerate((0, 1, 2, 3)):       # rolling 8ths on beats 2 and 3
            mx.add("harp", song.t(bar, 1.0 + 0.5 * k) + song.hum(0.004),
                   I.pluck(arp[idx], song.vel(0.46 if k else 0.5), r, t60=2.4, dur=1.5 * song.beat, bright=0.4),
                   0.17, 0.3 if k % 2 else 0.1)
        # ------------------------------------------------ colour
        if bar in F_CHIMES:
            mx.add("glock", song.t(bar, 0) + 0.008, I.glock(F_CHIMES[bar], song.vel(0.45), r), 0.08, 0.45)
        if bar in (7, 15):                           # music-box sparkle rising into the next section (hopeful)
            for k, mm in enumerate((84, 89, 93, 96)):
                mx.add("mbox", song.t(bar, 1.5 + k * 0.25), I.musicbox(mm, song.vel(0.38), r), 0.11, 0.4)
        if bar in (0, 8):
            mx.add("tri", song.t(bar, 0) + 0.004, triangle(song.vel(0.32), r), 0.07, -0.5)
    sends = {"mbox": 0.45, "harp": 0.32, "flute": 0.36, "pad": 0.45, "bass": 0.06, "glock": 0.5, "tri": 0.45}
    gains = {"mbox": 1.4, "harp": 2.2, "flute": 0.45, "pad": 3.2, "bass": 0.62, "glock": 1.3, "tri": 1.6}
    mix = premix(mx, sends, gains, L, rt60=2.6, pad_bus="pad")
    mix = _delay(mix)
    meta = {"bpm": 93, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_farewell(seed: int = 61, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Pre-mix memoised (see render_wedding)."""
    mix, meta = _memo(("farewell", seed), lambda: _premix_farewell(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


def main(names):
    os.makedirs(CACHE, exist_ok=True)
    for nm in names:
        fn, key = {"wedding": (render_wedding, "bgm_wedding"), "farewell": (render_farewell, "bgm_farewell")}[nm]
        x, meta = fn()
        p = os.path.join(CACHE, f"{key}.wav")
        S.write_wav(p, x)
        print(f"{key}: {x.shape[-1] / SR:.2f}s ch {x.shape[0]} peak {S.db(S.peak(x)):.2f} dBFS  "
              f"LUFS {S.lufs(x):.2f}  -> {p}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or ["wedding", "farewell"])
