"""Frost Village - v8 'living city' music by procedural synthesis (library + script).

  bgm_city  : busy, upbeat town theme for the living city. F major, 126 bpm, light shuffle, 32 bars (61.0 s), form
              A1 A2 B A3 like bgm_village and in its melodic family (same key, same hook, same palette), but its own
              tune and harmony:
                A = F | Dm7 | Gm7 | C7 | F | D7 | Gm7 C7 | F   the bgm_village hook "A4 C5 D5 - C5 A4 C5 -" verbatim
                    in bars 1 and 5; new bars in between: off-beat entries answered by 16th-note 'traffic' pickups
                    from the other lead instrument, a D7 'city' secondary dominant, running eighths, a 'ta-da-da!'
                    answer.
                B = Gm7 | C7 | Fmaj7 | Dm7 | Bb | C | Am7 D7 | Gm7 C7   a new lyrical flute tune; the village B melody
                    appears only as a 2-bar muted-trumpet quote over Bb | C (bars 5-6); a marimba hook fragment in
                    the bar-4 gap, a little 'beep-beep' car-horn toot (E4 + G4) before the return.
              Arrangement: A1 marimba lead over bouncing pizzicato bass (trumpet answers), off-beat electric-piano
              'chk' chords, kick / brushed snare / clap / shaker groove; A2 the muted trumpet takes the tune (marimba
              answers), a new glockenspiel counter-line, brass 'pap-pa!' stabs, a bicycle-bell fill; B flute +
              plucked arpeggios + walking bass + woodblock; A3 tutti (trumpet + marimba, glock, a nod of sleigh
              bells - it is still a snowy town), tom fill turnaround F | C7 back into the hook.
  bgm_chase : comic chase (cops after a bread thief, everybody smiling). F major / D minor, 168 bpm, 16 bars (22.9 s):
                A = F | F | C7 | F | F | Bb | C7 | F A7     xylophone gallop built on the village hook (A C D C A C D F)
                B = Dm | Gm | C7 | F | Dm | Gm | A7 | Bb C7 4 bars of tiptoe pizzicato (sneaking), then the race
                    (running scales, trumpet, C#6 'uh-oh' on A7) and a slide whistle swooping back to the top.
              Tuba 'oom' + staccato 'pah', clip-clop woodblocks, snare backbeat, a bulb-horn 'honk-honk', a cartoon
              'boing', cymbal at the top. Never dark or scary: major-key gallop, minor only as a cheeky sneak.

Loops: performance rendered past the loop end, tail folded onto the start (synth.fold_loop), circular compressor /
limiter (music.finish) -> seamless; everything is delayed 12 ms so the loop point sits just before the downbeat.
build_audio6.py moves the loop point to the nearest Vorbis block boundary via build_audio.fit_loop(); the
pre-mix is memoised so each fit trial only re-folds and re-masters.

Run:   python3 tools/audio/music6.py [city] [chase]
       -> /tmp/fv_cache/audio6/bgm_<name>.wav (32-bit float stereo, -18 LUFS)
Normally called through build_audio6.py.  Deterministic (fixed seeds).  Needs numpy + scipy.
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
from music import CHORDS, MEL_B, Mixer, Song, bass_note, finish, parse_bar, premix, voice  # noqa: E402
from music2 import flute, triangle  # noqa: E402
from sfx import chime, coin_hit  # noqa: E402
from sfx3 import horn_tone  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.environ.get("FV_AUDIO6_CACHE", "/tmp/fv_cache/audio6")

CH6 = dict(CHORDS)
CH6.update({
    "Gm": (7, [7, 10, 2], [7, 10, 2, 5]),
    "A7": (9, [9, 1, 4, 7], [9, 1, 4, 7]),
    "D7": (2, [2, 6, 9, 0], [2, 6, 9, 0]),          # secondary dominant (V of Gm7): the 'city' colour
    "Fmaj7": (5, [5, 9, 0, 4], [5, 9, 0, 4]),
})


# ----------------------------------------------------------------------------- new voices
def xylo(m: float, vel: float = 0.8, r=None) -> np.ndarray:
    """Xylophone: hard-mallet rosewood bar, first overtone tuned to the 12th (x3), short ring, bright tick."""
    r = r or S.rng(0)
    f = float(S.midi_hz(m))
    t60 = float(np.clip(0.9 - (m - 72) * 0.02, 0.35, 1.0))
    n = n_of(t60 * 0.8 + 0.03)
    modes = [(1.0, 1.0, t60), (3.0, 0.38 * (0.5 + vel), t60 * 0.35), (6.1, 0.1 * vel, t60 * 0.15),
             (9.8, 0.04 * vel, 0.04)]
    y = S.modal(f, n, modes, r, fmax=9000.0, attack=0.0004)
    k = n_of(0.004)
    y[:k] += S.bp(r.standard_normal(k), 3500, 1.0) * np.hanning(k) * 0.25 * vel
    return y * (0.5 + 0.5 * vel) / 1.3


def epiano(m: float, vel: float = 0.7, dur: float = 0.3, r=None) -> np.ndarray:
    """Warm electric piano (FM tine): 1:1 carrier/modulator with a decaying index (bark -> mellow), a faint
    fast-decaying tine partial, soft release."""
    r = r or S.rng(0)
    rel = 0.12
    n = n_of(dur + rel)
    t = np.arange(n) / SR
    f = float(S.midi_hz(m))
    idx = 0.25 + 1.5 * vel * np.exp(-t / 0.22)
    y = S.fm(f, n, 1.0, idx)
    y = y + 0.12 * vel * S.sine(f * 7.0, n) * np.exp(-t / 0.03)
    env = S.env_adsr(n, 0.003, 0.35, 0.55, rel, gate=dur) * np.exp(-t / 1.6)
    return S.lp(y * env, 5000) * (0.55 + 0.45 * vel)


def trumpet(m: float, vel: float = 0.8, dur: float = 0.3, mute: bool = True) -> np.ndarray:
    """Soft cartoon trumpet (instruments.brass) through a cup-mute style band: nasal, round, never blaring."""
    y = I.brass(m, vel, dur, bright=0.8 if mute else 1.0)
    if mute:
        y = S.peq(y, 1500, 6.0, 1.4)
        y = S.hp(y, 350)
        y = S.lp(y, 3600, 0.7, order=2)
    return y


def tuba(m: float, vel: float = 0.8, dur: float = 0.25) -> np.ndarray:
    """Comic tuba 'oom': low brass, dark and short."""
    y = I.brass(m, vel, dur, bright=0.35)
    y = S.lp(y, 900, 0.7, order=2)
    n = len(y)
    sub = S.sine(float(S.midi_hz(m)), n) * S.env_adsr(n, 0.015, 0.1, 0.7, 0.08, gate=dur)
    return y + 0.35 * sub * vel


def brass_stab(ms, vel: float, dur: float = 0.12) -> np.ndarray:
    """Short brass-section chord 'pap!'."""
    ys = [trumpet(m, vel, dur, mute=False) for m in ms]
    n = max(len(y) for y in ys)
    out = np.zeros(n)
    for y in ys:
        out[:len(y)] += y
    return S.lp(out / len(ys) * 1.5, 4200)


def slide_whistle(m0: float, m1: float, dur: float, r) -> np.ndarray:
    """Slide whistle swoop m0 -> m1 (ease-in-out), airy, with a little wobble."""
    n = n_of(dur + 0.05)
    t = np.arange(n) / SR
    u = np.clip(t / dur, 0, 1)
    semis = m0 + (m1 - m0) * (0.5 - 0.5 * np.cos(np.pi * u)) + 0.15 * np.sin(TAU * 6.0 * t)
    f = S.midi_hz(semis)
    tone = S.additive(f, n, [(1, 1.0), (2, 0.06)], fmax=9000)
    air = S.bp(r.standard_normal(n), float(np.mean(f)), 3.0)
    y = tone + 0.25 * air / max(np.std(air), 1e-9) * 0.2
    return y * S.env_pts([(0, 0), (0.03, 1.0), (dur * 0.9, 0.9), (dur + 0.05, 0)], n)


def bike_bell(r, vel: float = 0.7) -> np.ndarray:
    """Bicycle bell 'ring-ring' (two thumb flicks, C7-ish dome bell)."""
    y = np.zeros(n_of(0.9))
    for k, t0 in enumerate((0.0, 0.11)):
        b = chime(2093.0, 0.55, 0.8, r)
        c = coin_hit(r, 2093.0 * 1.47, 0.2)
        b[:len(c)] += 0.5 * c
        i = n_of(t0)
        y[i:i + len(b)] += b[:len(y) - i] * (1.0 if k == 0 else 0.8)
    return S.lp(y, 8000) * vel


def car_toot(m: float, dur: float, r) -> np.ndarray:
    """Little tuned car-horn toot (sfx3.horn_tone) for the city 'beep-beep'."""
    return horn_tone(m, dur, r, bright=0.6, formant=950.0, scoop=-0.4)


def bulb_horn(r, m: float = 62.0, dur: float = 0.16) -> np.ndarray:
    """Clown / bicycle bulb horn 'honk' (squeezed reed: pitch bends up then sags)."""
    n = n_of(dur + 0.04)
    t = np.arange(n) / SR
    semis = m - 2.0 * np.exp(-t / 0.02) - 1.0 * np.clip((t - dur * 0.6) / (dur * 0.4), 0, 1)
    f = S.midi_hz(semis)
    x = 0.6 * S.saw(f, n) + 0.4 * S.square(f, n, 0.25)
    x = S.peq(S.lp(x, 2600, 0.7, order=2), 1100, 8.0, 2.0)
    return x * S.env_pts([(0, 0), (0.01, 1.0), (dur, 0.8), (dur + 0.04, 0)], n)


def spring_boing(r, f0: float = 196.0, dur: float = 0.4) -> np.ndarray:
    """Cartoon spring 'boing' (twangy tone with slowing vibrato)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    vib = 0.06 * np.exp(-t / 0.25) * np.sin(TAU * (22 - 8 * t / dur) * t)
    f = f0 * (1 + vib) * (1 - 0.08 * t / dur)
    x = S.additive(f, n, [(1, 1.0), (2, 0.45), (3, 0.3), (4, 0.15)], fmax=6000)
    return x * S.env_exp(n, 0.16, 0.002)


# ----------------------------------------------------------------------------- shared helpers
_PREMIX = {}


def _memo(key, fn):
    if key not in _PREMIX:
        _PREMIX[key] = fn()
    mix, meta = _PREMIX[key]
    return mix, dict(meta)


def _delay(mix, sec=0.012):
    return np.concatenate((np.zeros((2, n_of(sec))), mix), axis=1)


# ----------------------------------------------------------------------------- bgm_city score
# polish (critic: 82 % of the eighth-note slots, 15 of 32 bars, both progressions and the counter-line were
# bgm_village's): the family markers stay - F major, the hook "A4 C5 D5 - C5 A4 C5 -" verbatim in bars 1 and 5,
# marimba / muted-trumpet palette - but every other bar, both progressions, the B section and the counter-line are
# new. A is busier and more 'city': off-beat entries answered by 16th-note 'traffic' pickups from a second
# instrument, a D7 secondary dominant; B is a new lyrical flute tune on its own progression; the village B melody
# survives only as a 2-bar muted-trumpet quote (B bars 5-6, over the same Bb | C it had in the village).
CITY_A = [
    "A4 C5 D5 -  C5 A4 C5 -",     # F      the village hook, verbatim
    ".  F5 .  E5 F5 A5 -  .",     # Dm7    off-beat entry (answered by a 16th 'ba-da' pickup on beat 1)
    "G5 -  F5 D5 .  Bb4 D5 F5",   # Gm7    syncopated climb back up
    "E5 -  D5 C5 Bb4 .  .  .",    # C7     the question ... brass 'pap-pa!' in the gap
    "A4 C5 D5 -  C5 A4 C5 -",     # F      the hook again
    ".  F#5 .  A5 C6 -  A5 .",    # D7     the city twist (secondary dominant), off-beat again
    "Bb5 A5 G5 D5 E5 G5 Bb5 G5",  # Gm7|C7 running eighths
    "A5 -  F5 .  C5 .  F5 .",     # F      'ta - da - da!' answer
]
CITY_TURN = "F5 .  C5 A4 G4 .  F4 G4"          # loop end: pickup F4 G4 back into the hook
CITY_CH_A = [("F", "F"), ("Dm", "Dm"), ("Gm7", "Gm7"), ("C7", "C7"), ("F", "F"), ("D7", "D7"), ("Gm7", "C7"), ("F", "F")]
CITY_B = [
    "D5 -  -  F5 G5 -  F5 D5",    # Gm7    new lyrical flute tune
    "E5 -  -  -  C5 .  .  .",     # C7
    "A5 -  G5 A5 C6 -  A5 -",     # Fmaj7
    "F5 -  -  -  .  .  .  .",     # Dm7    (marimba hook fragment in the gap)
    MEL_B[0],                     # Bb     the village B, bars 1-2 only: a muted-trumpet quote
    MEL_B[1],                     # C
    "C5 -  E5 G5 F#5 -  A5 -",    # Am7|D7
    "Bb5 -  A5 G5 E5 -  .  .",    # Gm7|C7 -> back to the hook
]
CITY_CH_B = [("Gm7", "Gm7"), ("C7", "C7"), ("Fmaj7", "Fmaj7"), ("Dm", "Dm"), ("Bb", "Bb"), ("C", "C"), ("Am", "D7"),
             ("Gm7", "C7")]
CITY_B_QUOTE = (4, 5)                          # B bars played by the muted trumpet (the village quote)
# 16th-note 'traffic' answers in A (bar index -> [(beat, note)]), played by the instrument NOT carrying the tune
CITY_RESP = {1: [(0.0, "D5"), (0.25, "E5")], 3: [(3.0, "G4"), (3.25, "Bb4"), (3.5, "C5"), (3.75, "E5")],
             5: [(0.0, "D5"), (0.25, "E5")]}
# new glockenspiel counter-line for A2 / A3 (one chord tone per half bar)
COUNTER_CITY = [("C6", "A5"), ("F6", "D6"), ("D6", "G6"), ("E6", "Bb5"), ("A5", "C6"), ("F#6", "C6"), ("Bb5", "Bb5"),
                ("A5", "F5")]
CITY_SECTIONS = [(0, "A1", CITY_A, CITY_CH_A), (8, "A2", CITY_A, CITY_CH_A), (16, "B", CITY_B, CITY_CH_B),
                 (24, "A3", CITY_A[:7] + [CITY_TURN], CITY_CH_A[:7] + [("F", "C7")])]


def _premix_city(seed: int):
    bars = 32
    song = Song(126, swing=0.55, seed=seed)
    r = song.r
    L = n_of(bars * 4 * song.beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    prev_tri, prev_ep, prev_pad = None, None, None
    for bar0, kind, mel, chs in CITY_SECTIONS:
        for i in range(8):
            bar = bar0 + i
            last = i == 7
            # ------------------------------------------------ melody
            for st, ln, m in parse_bar(mel[i]):
                t0 = song.t(bar, st / 2) + song.hum(0.003)
                dur = song.t(bar, (st + ln) / 2) - song.t(bar, st / 2)
                acc = 0.86 if st % 2 == 0 else 0.72
                if kind == "A1":
                    mx.add("mel", t0, I.marimba(m, song.vel(acc), r), 0.46, -0.12)
                    if i >= 4:
                        mx.add("mbox", t0 + 0.004, I.musicbox(m + 12, song.vel(0.5), r), 0.13, 0.3)
                elif kind == "A2":
                    mx.add("tpt", t0, trumpet(m, song.vel(acc), dur * 0.85), 0.5, -0.1)
                    mx.add("mel", t0 + 0.003, I.marimba(m - 12, song.vel(acc * 0.8), r), 0.2, 0.2)
                elif kind == "A3":
                    mx.add("tpt", t0, trumpet(m, song.vel(acc), dur * 0.85), 0.46, -0.12)
                    mx.add("mel", t0 + 0.003, I.marimba(m, song.vel(acc * 0.9), r), 0.3, 0.15)
                    if ln >= 3:
                        mx.add("flu", t0, flute(m + 12, song.vel(0.6), dur * 0.9, r, vib=0.6), 0.12, 0.3)
                elif i in CITY_B_QUOTE:                    # B 5-6: the village B quoted by the muted trumpet
                    mx.add("tpt", t0, trumpet(m, song.vel(acc * 0.92), dur * 0.85), 0.44, 0.2)
                else:                                      # B: the new flute tune
                    mx.add("flu", t0, flute(m, song.vel(0.82), dur * 0.95, r, vib=1.0 if ln >= 3 else 0.4), 0.42, -0.05)
                    if ln >= 4:
                        mx.add("mel", t0, I.marimba(m - 12, song.vel(0.4), r), 0.16, -0.25)
            if kind != "B" and i in CITY_RESP and (i != 3 or kind == "A1"):   # 16th 'traffic' answers (bar 4:
                # only in A1 - A2 / A3 have the brass 'pap-pa!' there)
                for bt, nm in CITY_RESP[i]:
                    tt = song.t(bar, bt) + song.hum(0.002)
                    if kind == "A1":
                        mx.add("tpt", tt, trumpet(S.note(nm), song.vel(0.6), song.beat * 0.22), 0.3, 0.3)
                    else:
                        mx.add("mel", tt, I.marimba(S.note(nm), song.vel(0.7), r), 0.34, 0.3)
            # ------------------------------------------------ harmony
            for half in (0, 1):
                ch = chs[i][half]
                root, tri, padpcs = CH6[ch]
                tri_v = voice(tri[:3], prev_tri, 55, 70)
                prev_tri = tri_v
                ep_v = voice(padpcs, prev_ep, 57, 74)
                prev_ep = ep_v
                hb = half * 2
                same = chs[i][0] == chs[i][1]
                bm = bass_note(root)
                fifth = bm + 7 if bm + 7 <= 50 else bm - 5
                if kind == "B":                            # walking bass in quarters
                    nxt_root = CH6[chs[(i + 1) % 8][0]][0] if half == 1 else CH6[chs[i][1]][0]
                    walk = [bm, bm + (tri[1] - tri[0]) % 12, fifth,
                            bass_note(nxt_root) + (1 if (bass_note(nxt_root) - bm) % 12 > 6 else -1)]
                    for k in range(2):
                        nb = walk[k + 2 * half]
                        mx.add("bass", song.t(bar, hb + k) + song.hum(0.003), I.bass(nb, song.vel(0.8 if k == 0 else 0.68),
                                                                                   song.beat * 0.85, r), 0.6)
                    arp = tri_v + [tri_v[0] + 12]
                    order = [0, 1, 2, 3, 2, 1, 2, 1]
                    for k in range(4):
                        mm = arp[order[(k + 4 * half) % 8]]
                        mx.add("pluck", song.t(bar, hb + k * 0.5) + song.hum(0.003),
                               I.pluck(mm, song.vel(0.6 if k % 2 == 0 else 0.46), r, t60=1.3, dur=song.beat * 0.8), 0.24,
                               0.35 if k % 2 else 0.15)
                    if half == 0 or not same:
                        pad_v = voice(padpcs, prev_pad, 52, 72)
                        prev_pad = pad_v
                        pdur = song.beat * (4 if same else 2)
                        mx.add("pad", song.t(bar, hb), I.pad_chord(pad_v, pdur * 1.02, r, cutoff=1300), 0.2)
                else:                                      # bouncing bass 'boom - boom-ba'
                    n1 = bm if (half == 0 or not same) else fifth
                    mx.add("bass", song.t(bar, hb) + song.hum(0.002), I.bass(n1, song.vel(0.86), song.beat * 0.45, r), 0.62)
                    mx.add("bass", song.t(bar, hb + 1.0) + song.hum(0.002), I.bass(n1, song.vel(0.62), song.beat * 0.3, r), 0.5)
                    mx.add("bass", song.t(bar, hb + 1.5) + song.hum(0.002), I.bass(n1 + 12, song.vel(0.6), song.beat * 0.3, r),
                           0.42)
                    for k in (0.5, 1.5):                   # off-beat electric-piano 'chk'
                        tt = song.t(bar, hb + k) + song.hum(0.003)
                        for j, mm in enumerate(ep_v):
                            mx.add("ep", tt + j * 0.004, epiano(mm, song.vel(0.55 if k == 0.5 else 0.48), song.beat * 0.28, r),
                                   0.13, 0.3 + 0.06 * (j - 1))
                    if kind in ("A2", "A3") and (half == 0 or not same):
                        pad_v = voice(padpcs, prev_pad, 52, 72)
                        prev_pad = pad_v
                        pdur = song.beat * (4 if same else 2)
                        mx.add("pad", song.t(bar, hb), I.pad_chord(pad_v, pdur * 1.02, r, cutoff=1100), 0.12)
            # ------------------------------------------------ colour lines
            if kind in ("A2", "A3"):
                for half in (0, 1):
                    nm = COUNTER_CITY[i][half]
                    if kind == "A3" and last:
                        nm = ("C6", "E6")[half]
                    mx.add("glock", song.t(bar, half * 2) + 0.006, I.glock(S.note(nm), song.vel(0.55), r),
                           0.09 if kind == "A2" else 0.1, 0.4)
            if kind in ("A2", "A3") and i in (3, 7) and not (kind == "A3" and last):   # brass 'pap - pa!' in the gaps
                ch = chs[i][1]
                sv = voice(CH6[ch][1][:3], None, 62, 76)
                mx.add("stab", song.t(bar, 2.5), brass_stab(sv, 0.7, 0.1), 0.28, 0.1)
                mx.add("stab", song.t(bar, 3.0), brass_stab(sv, 0.85, 0.16), 0.32, 0.1)
            if kind == "B" and i == 3:                     # marimba hook fragment in the gap (A4 C5 D5 over Dm7)
                for k, nm in enumerate(("A4", "C5", "D5")):
                    mx.add("mel", song.t(bar, 2.0 + k * 0.5), I.marimba(S.note(nm), song.vel(0.75), r), 0.36, 0.25)
            if kind == "B" and i == 7:                     # 'beep-beep' car horn (E4 + G4, inside C7) on the last beat
                for t0 in (song.t(bar, 3.0), song.t(bar, 3.5)):
                    mx.add("fx", t0, car_toot(64, 0.13, r) + car_toot(67, 0.13, r), 0.1, 0.35)
            if kind == "B" and i % 2 == 1:                 # music-box sparkle
                root, tri, _ = CH6[chs[i][1]]
                v = voice(tri[:3], None, 79, 92)
                for k, mm in enumerate(v + [v[0] + 12]):
                    mx.add("mbox", song.t(bar, 3.0 + k * 0.25), I.musicbox(mm, song.vel(0.45), r), 0.11, 0.35)
            if kind == "A2" and last:                      # bicycle bell fill
                mx.add("fx", song.t(bar, 3.0), bike_bell(r, 0.8), 0.07, -0.35)
            # ------------------------------------------------ drums
            if kind == "B":
                mx.add("kick", song.t(bar, 0), I.kick(song.vel(0.68), r), 0.5)
                mx.add("kick", song.t(bar, 2), I.kick(song.vel(0.55), r), 0.45)
                for b in (1, 3):
                    mx.add("wb", song.t(bar, b) + song.hum(0.002), I.woodblock(79 if b == 1 else 84, song.vel(0.55), r),
                           0.12, 0.25)
                for k in range(8):
                    mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(0.55 if k % 2 else 0.32), r),
                           0.07, 0.45)
            else:
                mx.add("kick", song.t(bar, 0), I.kick(song.vel(0.78), r), 0.55)
                mx.add("kick", song.t(bar, 2), I.kick(song.vel(0.68), r), 0.5)
                if i % 2 == 1:
                    mx.add("kick", song.t(bar, 2.5), I.kick(song.vel(0.45), r), 0.45)
                for b in (1, 3):
                    mx.add("snr", song.t(bar, b) + song.hum(0.002), I.snare_soft(song.vel(0.62 if kind != "A1" else 0.5), r),
                           0.2, 0.1)
                    if kind != "A1":
                        mx.add("clap", song.t(bar, b) + 0.004 + song.hum(0.003), I.clap_soft(song.vel(0.55), r), 0.16, -0.2)
                for k in range(8):
                    mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(0.58 if k % 2 else 0.34), r),
                           0.075, 0.45)
                if kind == "A3":
                    for b in (1, 3):
                        mx.add("sleigh", song.t(bar, b) + 0.01, I.sleigh(song.vel(0.42), r), 0.05, -0.45)
            # ------------------------------------------------ fills / transitions
            if kind == "A1" and last:
                mx.add("wb", song.t(bar, 3.0), I.woodblock(84, 0.7, r), 0.16, 0.3)
                mx.add("wb", song.t(bar, 3.5), I.woodblock(79, 0.6, r), 0.15, 0.2)
            if kind == "A2" and last:
                sw = I.cymbal_soft(0.45, 1.3, r, swell=True)
                mx.add("cym", song.t(16, 0) - len(sw) / SR, sw, 0.18, 0.0)
            if kind == "B" and last:
                for k in range(4):
                    mx.add("snr", song.t(bar, 2 + k * 0.5), I.snare_soft(0.3 + 0.1 * k, r), 0.2, 0.1)
            if kind == "A3" and last:                     # tom fill into the loop top
                for k, mm in enumerate((55, 52, 50, 47)):
                    mx.add("kick", song.t(bar, 2 + k * 0.5), I.tom(mm, 0.5 + 0.08 * k), 0.36, -0.2 + 0.13 * k)
            if bar in (0, 16, 24) or (kind == "A2" and i == 0):
                mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.3, 1.6, r), 0.18, 0.25)
    sends = {"mel": 0.2, "mbox": 0.38, "tpt": 0.2, "flu": 0.3, "glock": 0.42, "pluck": 0.17, "bass": 0.03, "ep": 0.15,
             "pad": 0.38, "kick": 0.04, "snr": 0.14, "clap": 0.18, "shk": 0.1, "sleigh": 0.22, "wb": 0.2, "cym": 0.3,
             "stab": 0.2, "fx": 0.25}
    gains = {"mel": 1.3, "mbox": 1.0, "tpt": 0.68, "flu": 0.45, "glock": 1.7, "pluck": 2.0, "bass": 0.6, "ep": 1.4,
             "pad": 3.0, "kick": 0.66, "snr": 1.9, "clap": 2.0, "shk": 4.2, "sleigh": 2.4, "wb": 1.3, "cym": 1.0,
             "stab": 0.8, "fx": 1.0}
    mix = premix(mx, sends, gains, L, rt60=1.6, pad_bus="pad")
    meta = {"bpm": 126, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta                                  # the lead-in delay is applied in render_city


def render_city(seed: int = 81, loop_samples=None, premix_only: bool = False, lead: float = 0.012):
    """-> (stereo loop (2, L), meta). Pre-mix memoised (same interface as music4.render_harbor).
    lead = how far before the downbeat the loop point sits (s); build_audio6 tries a few values and keeps the one
    whose decoded wrap is smoothest in both codecs, also after the 48 kHz resampling phones do."""
    mix, meta = _memo(("city", seed), lambda: _premix_city(seed))
    mix = _delay(mix, lead)
    meta["lead"] = lead
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


# ----------------------------------------------------------------------------- bgm_chase score
CHASE_A = [
    "A4 C5 D5 C5 A4 C5 D5 F5",     # F     the hook as a running gallop (A C D C A C ...)
    "F5 G5 F5 D5 C5 .  A4 .",      # F
    "G4 Bb4 C5 Bb4 G4 Bb4 C5 E5",  # C7    the hook shape on C7
    "F5 .  C5 .  A4 .  .  .",      # F     (bulb horn 'honk-honk' in the gap)
    "A4 C5 D5 C5 A4 C5 D5 F5",     # F
    "F5 D5 Bb4 D5 F5 G5 A5 Bb5",   # Bb
    "G5 E5 C5 Bb4 G4 A4 Bb4 B4",   # C7    chromatic climb ...
    "C5 .  F5 .  E5 .  C#5 .",     # F | A7  ... 'uh-oh'
]
CHASE_B = [
    "D5 .  F5 .  A5 .  F5 .",      # Dm    tiptoe (pizzicato, sneaking)
    "G5 .  Bb5 . D6 .  Bb5 .",     # Gm
    "C6 .  Bb5 . G5 .  E5 .",      # C7
    "F5 .  C5 .  A4 .  .  .",      # F     (a cartoon 'boing')
    "D5 E5 F5 G5 A5 G5 F5 E5",     # Dm    the race is on
    "D5 E5 F5 G5 Bb5 A5 G5 F5",    # Gm
    "E5 F5 G5 A5 C#6 A5 G5 E5",    # A7
    "F5 .  D5 .  E5 .  .  .",      # Bb | C7  slide whistle swoops back to the top
]
CHASE_CH_A = [("F", "F"), ("F", "F"), ("C7", "C7"), ("F", "F"), ("F", "F"), ("Bb", "Bb"), ("C7", "C7"), ("F", "A7")]
CHASE_CH_B = [("Dm", "Dm"), ("Gm", "Gm"), ("C7", "C7"), ("F", "F"), ("Dm", "Dm"), ("Gm", "Gm"), ("A7", "A7"), ("Bb", "C7")]


def _premix_chase(seed: int):
    bars = 16
    song = Song(168, swing=0.5, seed=seed)
    r = song.r
    L = n_of(bars * 4 * song.beat)
    mx = Mixer(L / SR + 8, loop=L / SR)
    prev = None
    for bar in range(bars):
        sec = "A" if bar < 8 else "B"
        i = bar % 8
        mel = (CHASE_A if sec == "A" else CHASE_B)[i]
        chs = (CHASE_CH_A if sec == "A" else CHASE_CH_B)[i]
        tiptoe = sec == "B" and i < 4
        race = (sec == "A" and i >= 4) or (sec == "B" and i >= 4)
        # ------------------------------------------------ melody
        for st, ln, m in parse_bar(mel):
            t0 = song.t(bar, st / 2) + song.hum(0.002)
            dur = song.t(bar, (st + ln) / 2) - song.t(bar, st / 2)
            acc = 0.88 if st % 2 == 0 else 0.72
            if tiptoe:
                mx.add("pluck", t0, I.pluck(m, song.vel(0.75), r, t60=0.6, dur=dur * 0.5, bright=0.6), 0.42, -0.1)
                mx.add("xylo", t0 + 0.003, xylo(m + 12, song.vel(0.4), r), 0.1, 0.3)
            else:
                mx.add("xylo", t0, xylo(m, song.vel(acc), r), 0.42, -0.12)
                if race:
                    mx.add("tpt", t0, trumpet(m, song.vel(acc * 0.9), dur * 0.8), 0.32, 0.12)
                if sec == "B" and race:
                    mx.add("flu", t0, flute(m + 12, song.vel(0.55), dur * 0.85, r, vib=0.2), 0.12, 0.3)
        # ------------------------------------------------ oom-pah / bass
        for half in (0, 1):
            ch = chs[half]
            root, tri, _ = CH6[ch]
            tri_v = voice(tri[:3], prev, 55, 69)
            prev = tri_v
            hb = half * 2
            bm = bass_note(root, 36, 47)
            fifth = bm + 7 if bm + 7 <= 50 else bm - 5
            nb = bm if (half == 0 or chs[0] != chs[1]) else fifth
            if tiptoe:                                     # sneaky staccato pizz bass on every beat
                for k in range(2):
                    mx.add("bass", song.t(bar, hb + k), I.bass(nb if k == 0 else fifth, song.vel(0.6), song.beat * 0.25, r),
                           0.5)
                mx.add("wb", song.t(bar, hb), I.woodblock(84, song.vel(0.45), r), 0.1, 0.3)       # tick
                mx.add("wb", song.t(bar, hb + 1), I.woodblock(77, song.vel(0.4), r), 0.1, -0.3)  # tock
                continue
            mx.add("tuba", song.t(bar, hb) + song.hum(0.002), tuba(nb + 12, song.vel(0.85), song.beat * 0.55), 0.5)
            mx.add("bass", song.t(bar, hb), I.bass(nb, song.vel(0.8), song.beat * 0.5, r), 0.4)
            tt = song.t(bar, hb + 1) + song.hum(0.002)       # 'pah'
            for j, mm in enumerate(tri_v):
                mx.add("pah", tt + j * 0.004, I.pluck(mm, song.vel(0.62), r, t60=0.8, dur=song.beat * 0.3), 0.2,
                       0.25 + 0.08 * (j - 1))
            if race:
                mx.add("stab", tt, brass_stab([mm + 7 if mm + 7 <= 76 else mm for mm in tri_v], 0.55, 0.08), 0.12, 0.15)
        # ------------------------------------------------ drums
        if tiptoe:
            for k in range(8):
                mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(0.3 if k % 2 else 0.2), r, 0.06),
                       0.05, 0.45)
        else:
            mx.add("kick", song.t(bar, 0), I.kick(song.vel(0.72), r), 0.5)
            mx.add("kick", song.t(bar, 2), I.kick(song.vel(0.65), r), 0.46)
            for b in (1, 3):
                mx.add("snr", song.t(bar, b) + song.hum(0.002), I.snare_soft(song.vel(0.62), r), 0.2, 0.1)
            for k in range(8):                              # clip-clop gallop woodblocks
                mx.add("wb", song.t(bar, k * 0.5) + song.hum(0.002),
                       I.woodblock(84 if k % 2 == 0 else 79, song.vel(0.55 if k % 2 == 0 else 0.4), r), 0.09,
                       0.3 if k % 2 == 0 else -0.3)
            for k in range(8):
                mx.add("shk", song.t(bar, k * 0.5) + song.hum(0.002), I.shaker(song.vel(0.5 if k % 2 else 0.3), r, 0.07),
                       0.06, 0.45)
        # ------------------------------------------------ comic accents / fills
        if sec == "A" and i == 3:                            # bulb horn 'honk-honk'
            mx.add("fx", song.t(bar, 2.5), bulb_horn(r, 62.0, 0.14), 0.12, 0.35)
            mx.add("fx", song.t(bar, 3.0), bulb_horn(r, 62.0, 0.2), 0.14, 0.35)
        if sec == "A" and i == 7:                            # snare pickup into the sneak
            for k in range(4):
                mx.add("snr", song.t(bar, 2 + k * 0.5), I.snare_soft(0.35 + 0.1 * k, r), 0.2, 0.1)
        if sec == "B" and i == 3:                            # cartoon 'boing'
            mx.add("fx", song.t(bar, 2.5), spring_boing(r, 196.0, 0.4), 0.1, -0.3)
        if sec == "B" and i == 4:                            # off they go!
            mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.35, 1.4, r), 0.18, 0.25)
        if sec == "B" and i == 7:                            # slide whistle + snare roll back to the top
            mx.add("fx", song.t(bar, 1.5), slide_whistle(72, 86, song.beat * 2.3, r), 0.12, 0.2)
            k = 0.0
            while k < 2.0 - 1e-9:
                mx.add("snr", song.t(bar, 2.0 + k), I.snare_soft(0.25 + 0.2 * k, r), 0.18, 0.1)
                k += 0.25
        if bar == 0:
            mx.add("cym", song.t(bar, 0), I.cymbal_soft(0.4, 1.6, r), 0.2, 0.25)
            mx.add("tri", song.t(bar, 0) + 0.004, triangle(0.45, r), 0.06, -0.4)
    sends = {"xylo": 0.2, "pluck": 0.2, "tpt": 0.18, "flu": 0.25, "tuba": 0.05, "bass": 0.03, "pah": 0.15, "stab": 0.15,
             "kick": 0.04, "snr": 0.14, "wb": 0.15, "shk": 0.1, "fx": 0.2, "cym": 0.3, "tri": 0.35}
    gains = {"xylo": 1.2, "pluck": 2.0, "tpt": 0.9, "flu": 0.6, "tuba": 1.0, "bass": 0.55, "pah": 1.8, "stab": 1.0,
             "kick": 0.66, "snr": 1.9, "wb": 2.0, "shk": 4.0, "fx": 0.8, "cym": 1.0, "tri": 1.0}
    mix = premix(mx, sends, gains, L, rt60=1.3, pad_bus=None)
    mix = _delay(mix)
    meta = {"bpm": 168, "bars": bars, "loopSamples": L, "nominalSamples": L, "target": -18.0}
    return mix, meta


def render_chase(seed: int = 91, loop_samples=None, premix_only: bool = False):
    """-> (stereo loop (2, L), meta). Pre-mix memoised."""
    mix, meta = _memo(("chase", seed), lambda: _premix_chase(seed))
    if premix_only:
        return mix, meta
    L = int(loop_samples or meta["nominalSamples"])
    meta["loopSamples"] = L
    return finish(mix, L, meta["target"]), meta


def main(names):
    os.makedirs(CACHE, exist_ok=True)
    for nm in names:
        fn = {"city": render_city, "chase": render_chase}[nm]
        x, meta = fn()
        p = os.path.join(CACHE, f"bgm_{nm}.wav")
        S.write_wav(p, x)
        print(f"bgm_{nm}: {x.shape[-1] / SR:.2f}s ch {x.shape[0]} peak {S.db(S.peak(x)):.2f} dBFS  "
              f"LUFS {S.lufs(x):.2f}  -> {p}", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or ["city", "chase"])
