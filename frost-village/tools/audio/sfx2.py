"""Frost Village - v2/v3 sound effects by procedural synthesis (library + script).

CONTRACT_V3 section G one-shots, built with the same toolkit and layering style as sfx.py
(transient + body + texture + short room), imported, never edited:
  construction  sfx_hammer_1..3, sfx_build_done, sfx_saw_short
  boats / shop  sfx_boat_horn, sfx_row, sfx_register
  territory     sfx_tower_fire, sfx_fog_clear
  villagers     sfx_chatter_1..6 (cute babble: 1-3 high / kid, 4-6 low / adult), sfx_laugh_1..2,
                sfx_snowball_throw, sfx_snowball_hit, sfx_cheer
  pets          sfx_dog_bark, sfx_cat_meow, sfx_penguin
Musical sounds (build_done, fog_clear, register bell, boat horn chord) are in F major like
bgm_village / bgm_spring and the v1 sfx. The looping bard strum sfx_lute lives in music2.py.

Voices ("babble") are formant-filtered glottal pulses: instruments.formant_voice (a band-limited
pulse train whose harmonics are weighted by three moving formant resonances) driven by a small
syllable sequencer (utter()) - consonants b/d/m/n/w/y/l/h shape the formant + amplitude tracks,
vowels a/e/i/o/u set the targets. Kid voices = high pitch + formants scaled up ~20 %, adult
voices = lower pitch, natural formants. Quick (70-160 ms) bright syllables + light room keep
them toy-like rather than human-uncanny.

Run:   python3 tools/audio/sfx2.py [key ...]        (no key = all)
       -> tools/audio/_cache/audio2/<key>.wav  (mono 44.1 kHz float, trimmed, faded, peak -1.5 dBFS)
Normally called through build_audio2.py.  Deterministic (each key has a fixed seed).
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
from sfx import Mono, blip, bubble, burst, chime, coin_hit, nsweep, puff, room, smooth_noise, sparkles, tax  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio2")


# ============================================================================ voice: syllable sequencer
# vowel formant targets (Hz) for a neutral adult voice; kids scale them up (fs ~1.2)
VOWELS = {"a": (820, 1250, 2700), "e": (560, 1950, 2750), "i": (340, 2450, 3150),
          "o": (520, 900, 2600), "u": (390, 880, 2450), "ei": (480, 2100, 2800)}
NASAL = {"m": (270, 1150, 2450), "n": (270, 1650, 2600)}
GLIDE = {"w": (320, 720, 2400), "y": (300, 2350, 3050), "l": (360, 1150, 2750)}


def _smooth(x, hz):
    """Zero-phase low-pass of a control track (keeps glides smooth, no lag)."""
    b, a = S.bq("lp", hz, 0.7071)
    pad = n_of(0.05)
    y = S.sps.filtfilt(b, a, np.concatenate((np.full(pad, x[0]), x, np.full(pad, x[-1]))))
    return y[pad:-pad]


def _level(y, a, lo=0.5, hi=2.0):
    """Gentle AGC: make the voice's short-term level follow the intended amplitude track (formants
    crossing sparse harmonics of a high voice otherwise make syllables jump +-6 dB)."""
    env = np.sqrt(np.maximum(_smooth(y ** 2, 40.0), 1e-12))
    an = a / max(a.max(), 1e-9)
    live = an > 0.5
    if not live.any():
        return y
    en = env / np.median(env[live])
    g = np.where(an > 0.12, np.clip(an / np.maximum(en, 1e-4), lo, hi), 1.0)
    y = y * _smooth(g, 30.0)
    return y / max(S.peak(y), 1e-9)


def utter(r, sylls, f0, fs=1.0, tilt=1.0, breath=0.03, jitter=0.004, vib=0.0, vib_rate=5.5, fmax=8000.0,
          asp_gain=0.35, burst_gain=0.18, tail=0.0):
    """Cute babble from a syllable list -> mono array.

    sylls: [(consonant, vowel, dur_s, pitch_ratio, slide, amp), ...]
      consonant in '', b, d, m, n, w, y, l, h ; vowel in VOWELS ; pitch_ratio x f0 ; slide = relative
      pitch change over the syllable (0.2 = rises 20 % - a question) ; amp 0..1.
    fs scales every formant (kid ~1.2, adult ~1.0). tail = seconds of silence appended."""
    T, P, A, F1, F2, F3 = [], [], [], [], [], []
    events = []                                   # (t, kind, (F1, F2, F3), dur)

    def kf(t, p, a, fmt):
        T.append(t), P.append(p), A.append(a)
        F1.append(fmt[0]), F2.append(fmt[1]), F3.append(fmt[2])

    t = 0.0
    last = len(sylls) - 1
    for i, (c, v, d, pr, sl, amp) in enumerate(sylls):
        V = tuple(x * fs for x in VOWELS[v])
        p = f0 * pr
        if c in ("b", "d"):
            cl = 0.024 if c == "b" else 0.02
            on = (V[0] * 0.45, V[1] * 0.75 if c == "b" else 1750 * fs, V[2])
            kf(t, p * 0.97, 0.0, on)
            kf(t + cl, p * 0.97, 0.0, on)
            kf(t + cl + 0.014, p, amp * 0.9, (V[0] * 0.8, (V[1] + on[1]) / 2, V[2]))
            events.append((t + cl, c, V, 0.0))
            body = t + cl + 0.03
        elif c in NASAL:
            N = tuple(x * fs ** 0.5 for x in NASAL[c])
            kf(t, p * 0.96, 0.0, N)
            kf(t + 0.012, p * 0.97, amp * 0.3, N)
            kf(t + 0.038, p * 0.98, amp * 0.34, N)
            body = t + 0.06
        elif c in GLIDE:
            G = tuple(x * fs for x in GLIDE[c])
            kf(t, p * 0.95, amp * 0.12, G)
            kf(t + 0.02, p * 0.97, amp * 0.6, G)
            body = t + 0.06
        elif c == "h":
            hd = 0.03
            kf(t, p, 0.0, V)
            kf(t + hd, p, 0.0, V)
            kf(t + hd + 0.014, p, amp, V)
            events.append((t, "h", V, hd + 0.02))
            body = t + hd + 0.02
        else:
            kf(t, p * 0.96, 0.0, V)
            kf(t + 0.016, p, amp * 0.9, V)
            body = t + 0.03
        end = t + d
        body = min(body, end - 0.03)
        kf(body, p, amp, V)
        kf(end - 0.022, p * (1 + sl), amp * 0.92, V)
        kf(end - 0.004, p * (1 + sl * 1.08), amp * (0.0 if i == last else 0.35), V)
        t = end
    total = t + 0.01
    n = n_of(total + tail)
    ts = np.arange(n) / SR
    Ta = np.array(T, dtype=float)
    for i in range(1, len(Ta)):                   # keep keyframes strictly increasing for interp
        Ta[i] = max(Ta[i], Ta[i - 1] + 1e-4)
    tr = lambda xs: np.interp(ts, Ta, np.array(xs, dtype=float))  # noqa: E731
    f = _smooth(tr(P), 28.0)
    a = np.clip(_smooth(tr(A), 90.0), 0.0, None)
    a[ts > total] = 0.0
    fm1, fm2, fm3 = (_smooth(tr(F), 40.0) for F in (F1, F2, F3))
    if vib:
        f = f * (1 + vib * np.sin(TAU * vib_rate * ts) * np.clip((ts - 0.12) / 0.15, 0, 1))
    bw = 0.4 * float(np.median(f))               # wider resonances for high voices: few harmonics per
    y = I.formant_voice(f, a, [(fm1, 110 * fs + bw, 1.0), (fm2, 160 * fs + bw, 0.75),   # formant -> less
                               (fm3, 260 * fs + bw, 0.32)], r,                            # level jumping
                        breath=breath, tilt=tilt, fmax=fmax, jitter=jitter)
    y = _level(y, a)
    rms = np.sqrt(np.mean(y[a > 0.2 * a.max()] ** 2)) if np.any(a > 0) else 0.1
    for te, kind, V, dd in events:                # consonant noise (released after normalising the voice)
        i0 = n_of(te)
        if kind == "h":                           # aspiration: breath through the next vowel's formants
            k = n_of(dd)
            nz = r.standard_normal(k)
            asp = sum(g * S.bp(nz, F, F / bw) for F, bw, g in ((V[0], 160, 0.6), (V[1], 220, 1.0), (V[2], 320, 0.7)))
            asp *= S.env_pts([(0, 0), (dd * 0.4, 1.0), (dd * 0.8, 0.7), (dd, 0.0)], k)
            asp = asp / max(np.std(asp), 1e-9) * rms * asp_gain
            y[i0:i0 + k] += asp[:max(0, min(k, n - i0))]
        else:                                     # b / d release: tiny soft pop
            k = n_of(0.008)
            fc = 700 * fs if kind == "b" else 3000 * fs
            pop = S.bp(r.standard_normal(k), fc, 1.2) * S.env_exp(k, 0.0018, 0.0003)
            pop = pop / max(S.peak(pop), 1e-9) * rms * burst_gain * 2.5
            y[i0:i0 + k] += pop[:max(0, min(k, n - i0))]
    return y


# ============================================================================ construction
def sfx_hammer(v: int):
    """Hammer on nail + plank: hard click, short steel ping, wooden knock body, low thump.
    v1 = nail (bright ping), v2 = plank knock (woody, lower), v3 = higher nail + small bounce."""
    r = S.rng(5100 + v)
    fp, gp, fw, gw = {1: (2950, 0.42, 520, 0.75), 2: (2380, 0.18, 430, 0.95), 3: (3350, 0.36, 610, 0.7)}[v]
    m = Mono(0.4)
    m.add(0, burst(r, 0.006, 4600, 1.0, tau=0.0008), 0.55)
    ping = S.modal(fp, n_of(0.32), [(1, 1, 0.2), (1.52, 0.55, 0.11), (2.31, 0.3, 0.06), (0.47, 0.25, 0.08)], r,
                   fmax=11000, attack=0.0003)
    m.add(0, ping, gp)
    tw = 0.13 if v == 2 else 0.085                  # the plank knock rings a little longer
    wood = S.modal(fw, n_of(0.22), [(1, 1, tw), (1.73, 0.55, tw * 0.6), (2.6, 0.35, 0.03), (4.1, 0.15, 0.015)], r,
                   attack=0.0005)
    m.add(0, wood, gw)
    m.add(0, burst(r, 0.035, 1700 + 200 * v, 0.9, tau=0.005), 0.7)
    m.add(0, blip(260, 130, 0.08, 0.012, 0.018, attack=0.001), 0.2)
    if v == 3:                                     # hammer bounces once on the nail head
        m.add(0.052, ping[:n_of(0.12)] * S.env_exp(n_of(0.12), 0.03), 0.12)
        m.add(0.052, burst(r, 0.005, 4200, 1.0, tau=0.0007), 0.18)
    return room(S.hp(S.lp(m.x, 9000), 160), 0.4, 0.08, 0.12, 0.5)


def sfx_build_done():
    """Building finished: two quick hammer taps -> wooden 'thunk' + dust puff -> brass 'ta-DAA'
    (C5 -> F major) with a rising glock run, a soft cymbal and music-box sparkles."""
    r = S.rng(5150)
    m = Mono(2.4)
    for k, tt in enumerate((0.0, 0.11)):
        m.add(tt, S.modal(540 * (1, 1.09)[k], n_of(0.18), [(1, 1, 0.09), (1.73, 0.5, 0.05), (2.6, 0.35, 0.03)], r,
                          attack=0.0005), 0.5)
        m.add(tt, burst(r, 0.02, 2600, 1.0, tau=0.0025), 0.55)
        m.add(tt, blip(230, 115, 0.1, 0.015, 0.03), 0.3)
    tk = 0.26
    m.add(tk, blip(170, 82, 0.28, 0.03, 0.07, attack=0.002), 0.75)            # heavy wooden thunk
    m.add(tk, S.modal(260, n_of(0.25), [(1, 1, 0.12), (2.1, 0.5, 0.06), (3.3, 0.25, 0.03)], r), 0.35)
    m.add(tk + 0.01, puff(r, 0.45, 1300, [(0, 0), (0.03, 1), (0.14, 0.4), (0.45, 0)]), 0.42)
    t1 = 0.44
    m.add(t1, I.brass(72, 0.75, 0.09, bright=0.85), 0.42)                       # ta (C5)
    m.add(t1, I.glock(84, 0.6, r), 0.2)
    t2 = t1 + 0.14
    for mm, g in ((65, 0.24), (69, 0.24), (72, 0.26), (77, 0.4)):              # DAA (F4 A4 C5 F5)
        m.add(t2, I.brass(mm, 0.85, 0.62, bright=0.95), g)
    m.add(t2, I.bass(41, 0.8, 0.6, r), 0.3)
    m.add(t2, I.kick(0.55, r), 0.3)
    m.add(t2 - 0.005, I.cymbal_soft(0.4, 1.4, r), 0.28)
    for k, mm in enumerate((77, 81, 84, 89, 93)):                               # F5 A5 C6 F6 A6
        m.add(t2 + 0.03 + k * 0.055, I.glock(mm + 12 if k == 4 else mm, 0.62 + 0.05 * k, r), 0.26)
    m.add(t2 + 0.3, I.bell_fm(89, 0.55, t60=1.6), 0.16)
    sparkles(m, r, t2 + 0.32, 8, 0.075, 0.17)
    return room(m.x, 1.1, 0.18, 0.5, 0.85)


def sfx_saw_short():
    """Hand saw on a plank: two strokes (push / pull) of tooth rasp with a wooden body, sawdust ticks."""
    r = S.rng(5200)
    m = Mono(0.7)
    for t0, d, fc, rate, g in ((0.0, 0.23, 2500, 92, 1.0), (0.26, 0.21, 2000, 78, 0.85)):
        n = n_of(d)
        t = tax(n)
        teeth = (0.5 + 0.5 * np.sin(TAU * S.phase(rate * (1 + 0.15 * np.sin(TAU * t / d * 0.5)), n))) ** 3
        env = S.env_pts([(0, 0), (0.035, 1), (d * 0.65, 0.9), (d, 0)], n)
        nz = r.standard_normal(n)
        rasp = S.bp(nz, fc, 1.1) * (0.3 + 0.7 * teeth)
        body = S.bp(nz, 820, 2.2) * (0.5 + 0.5 * teeth)
        y = (rasp / max(np.std(rasp), 1e-9) * 0.5 + body / max(np.std(body), 1e-9) * 0.22) * env
        m.add(t0, y, g)
        m.add(t0, burst(r, 0.012, 3000, 1.0, tau=0.002), 0.25 * g)
        for tt in np.sort(r.uniform(0.04, d * 0.9, 9)):
            m.add(t0 + tt, burst(r, 0.008, r.uniform(3000, 6500), 1.5, tau=0.001), r.uniform(0.05, 0.14))
    return room(S.lp(m.x, 7500), 0.35, 0.07, 0.12, 0.5)


# ============================================================================ boats & shop
def _horn_note(m_: float, dur: float, r, scoop: float = -0.7) -> np.ndarray:
    """One reedy boat-horn voice: saw/square with a pitch scoop, late gentle vibrato, formant peak ~650 Hz."""
    rel = 0.18
    n = n_of(dur + rel)
    t = tax(n)
    semis = scoop * np.exp(-t / 0.06) + 0.06 * np.sin(TAU * 4.6 * t + r.uniform(0, TAU)) * np.clip((t - 0.25) / 0.2, 0, 1)
    f = float(S.midi_hz(m_)) * 2 ** (semis / 12)
    x = 0.65 * S.saw(f, n) + 0.35 * S.square(f * 1.002, n, 0.4)
    x = S.lp(x, 1500, 0.8, order=2)
    x = S.peq(x, 650, 7.0, 1.4)
    x = S.peq(x, 1300, 3.0, 2.0)
    return x * S.env_adsr(n, 0.05, 0.12, 0.85, rel, gate=dur)


def sfx_boat_horn():
    """Friendly little fishing-boat horn: 'toot - tooooot' on an F-major triad (F3 A3 C4) + sub + steam."""
    r = S.rng(5400)
    m = Mono(2.2)
    for t0, d, g in ((0.0, 0.2, 0.85), (0.34, 0.85, 1.0)):
        for mm, gm in ((53, 1.0), (57, 0.75), (60, 0.7)):
            m.add(t0 + r.uniform(0, 0.012), _horn_note(mm, d, r), 0.3 * gm * g)
        n = n_of(d + 0.2)
        m.add(t0, S.sine(float(S.midi_hz(41)), n) * S.env_adsr(n, 0.06, 0.1, 0.8, 0.2, gate=d), 0.16 * g)
        steam = S.bp(r.standard_normal(n), 1700, 0.8) * S.env_adsr(n, 0.02, 0.1, 0.4, 0.15, gate=d)
        m.add(t0, steam, 0.035 * g)
    y = S.lp(m.x, 4200)
    y = I.verb_mono(y, rt60=1.5, mix=0.22, tail=0.7, predelay=0.03, size=1.0)   # open water
    return y


def sfx_row():
    """One oar stroke: oarlock creak, blade 'plunk' into the water, swirling pull, drips."""
    r = S.rng(5500)
    m = Mono(1.0)
    n = n_of(0.16)                                                  # wooden oarlock squeak (stick-slip)
    t = tax(n)
    f = 330 + 160 * (t / 0.16)
    slip = (0.5 + 0.5 * np.sign(np.sin(TAU * S.phase(f, n)))) * np.exp(-((t % (1 / 48)) * 48) * 2.0)
    creak = S.bp(S.lp(slip - slip.mean(), 4000), 1150, 1.6) + 0.5 * S.bp(slip - slip.mean(), 2300, 2.5)
    creak *= S.env_pts([(0, 0), (0.03, 1), (0.12, 0.7), (0.16, 0)], n)
    m.add(0.0, creak / max(S.peak(creak), 1e-9), 0.16)
    tc = 0.1                                                        # catch: blade enters the water
    m.add(tc, blip(320, 140, 0.12, 0.02, 0.04, attack=0.002), 0.35)
    m.add(tc, bubble(r, 520, 0.09, 1.1, tau=0.03), 0.45)
    m.add(tc, burst(r, 0.06, 1400, 0.7, tau=0.012), 0.3)
    n = n_of(0.55)                                                  # pull: water swirl
    swirl = S.lp(r.standard_normal(n), 900, order=2) * (0.7 + 0.3 * smooth_noise(r, n, 9.0))
    swirl += 0.5 * S.bp(r.standard_normal(n), 420, 1.4)
    swirl *= S.env_pts([(0, 0), (0.08, 1), (0.3, 0.75), (0.55, 0)], n)
    m.add(tc + 0.03, swirl / max(np.std(swirl), 1e-9) * 0.16, 1.0)
    for k in range(4):
        m.add(tc + 0.08 + r.uniform(0, 0.35), bubble(r, r.uniform(380, 800), r.uniform(0.04, 0.07), 0.9), 0.14)
    for tt in np.sort(0.62 + r.exponential(0.07, 5)):               # drips off the blade
        m.add(tt, bubble(r, r.uniform(1300, 2400), 0.03, 0.6, tau=0.008), r.uniform(0.08, 0.16))
    return room(m.x, 0.5, 0.1, 0.18, 0.6)


def sfx_register():
    """Shop cash register (clerk rings you up): 'tk-tk-tk' keys, short crank ratchet,
    bright 'DING' bell (F6), drawer slides open with a small coin jingle."""
    r = S.rng(5600)
    m = Mono(1.3)
    for k, tt in enumerate((0.0, 0.065, 0.125)):                    # three key presses
        m.add(tt, burst(r, 0.006, 3400 + 300 * k, 1.2, tau=0.001), 0.55)
        m.add(tt, S.modal(1180 - 60 * k, n_of(0.06), [(1, 1, 0.03), (2.4, 0.4, 0.015)], r, attack=0.0003), 0.3)
        m.add(tt + 0.012, blip(420, 260, 0.05, 0.01, 0.014), 0.25)
    t = 0.19
    for k in range(5):                                              # crank ratchet
        m.add(t + k * 0.017, burst(r, 0.005, 2800, 1.5, tau=0.0007), 0.3 + 0.05 * k)
        m.add(t + k * 0.017, S.modal(1900, n_of(0.02), [(1, 1, 0.012)], r), 0.12)
    tb = 0.29                                                       # the bell
    bell = S.modal(1396.9, n_of(1.0), [(1, 1, 0.9), (2.0, 0.28, 0.5), (2.76, 0.35, 0.3), (5.4, 0.12, 0.12),
                                       (1.004, 0.4, 0.85)], r, fmax=12000, attack=0.0004)
    m.add(tb, bell, 0.42)
    m.add(tb, burst(r, 0.004, 6500, 1.0, tau=0.0006), 0.25)
    m.add(tb + 0.03, nsweep(r, 0.17, 500, 1500, 1.1, [(0, 0), (0.03, 1), (0.13, 0.6), (0.17, 0)]), 0.12)  # drawer
    m.add(tb + 0.2, blip(170, 95, 0.1, 0.02, 0.03), 0.4)            # drawer stop clunk
    m.add(tb + 0.2, S.modal(640, n_of(0.12), [(1, 1, 0.06), (2.3, 0.4, 0.03)], r), 0.25)
    for k in range(4):
        m.add(tb + 0.21 + r.uniform(0, 0.12), coin_hit(r, r.uniform(3200, 5200), 0.1), 0.13)
    return room(m.x, 0.6, 0.12, 0.3, 0.6)


# ============================================================================ territory
def sfx_tower_fire():
    """Watchtower fire basket catches: quick scratch, 'FWOOMP' ignition with an upward whoosh,
    then a flickering roar with crackles that settles down."""
    r = S.rng(5700)
    dur = 1.9
    m = Mono(dur + 0.4)
    m.add(0.0, S.hp(r.standard_normal(n_of(0.07)), 2500) * S.env_pts([(0, 0), (0.01, 1), (0.07, 0)], n_of(0.07)), 0.18)
    ti = 0.07
    n = n_of(0.8)
    x = r.standard_normal(n)
    m.add(ti, S.lp(x, 520, order=2) * S.env_pts([(0, 0), (0.09, 1), (0.3, 0.5), (0.8, 0)], n), 1.0)
    m.add(ti, S.bp(x, 1600, 0.7) * S.env_pts([(0, 0), (0.06, 1), (0.22, 0.25), (0.8, 0)], n), 0.22)
    m.add(ti, blip(130, 55, 0.4, 0.05, 0.12, attack=0.01), 0.55)
    m.add(ti, nsweep(r, 0.5, 300, 1800, 1.0, [(0, 0), (0.12, 1), (0.5, 0)]), 0.3)
    n = n_of(dur - 0.15)                                            # flame body
    fl = np.clip(0.7 + 0.35 * smooth_noise(r, n, 8.0), 0.15, 1.4)
    roar = S.bp(r.standard_normal(n), 420, 0.6) * fl
    breath = S.bp(r.standard_normal(n), 1300, 0.9) * fl ** 1.5
    env = S.env_pts([(0, 0), (0.25, 1.0), (0.8, 0.8), (dur - 0.15, 0)], n)
    m.add(0.15, (roar / max(np.std(roar), 1e-9) * 0.13 + breath / max(np.std(breath), 1e-9) * 0.05) * env, 1.0)
    t = 0.28
    while t < dur - 0.1:                                            # crackles
        big = r.random() < 0.18
        g = (0.55 if big else 0.22) * r.uniform(0.5, 1.0) * (1.0 - 0.5 * t / dur)
        m.add(t, burst(r, 0.02 if big else 0.008, r.uniform(1200, 2400) if big else r.uniform(2500, 6000), 1.2,
                       tau=0.004 if big else 0.0012), g)
        t += r.exponential(0.075)
    return room(m.x, 0.6, 0.1, 0.25, 0.6)


def sfx_fog_clear():
    """The snow-fog bank clears (watchtower lit): a big soft wind whoosh that swells and blows
    away, revealing the new land with a rising F-major glock run, a warm pad bloom and sparkles."""
    r = S.rng(5800)
    dur = 2.6
    n = n_of(dur)
    u = np.linspace(0, 1, n)
    fc = np.interp(u, [0, 0.35, 0.55, 1.0], [260, 1500, 1900, 520])
    air = S.tv_filter(S.pink(n, r), "bp", fc, 0.9) + 0.6 * S.tv_filter(S.pink(n, r), "bp", fc * 2.1, 1.3)
    air *= S.env_pts([(0, 0), (0.9, 1.0), (1.35, 0.85), (dur, 0)], n)
    hiss = S.hp(r.standard_normal(n), 4200, order=2) * S.env_pts([(0, 0), (1.0, 1), (dur, 0)], n) ** 2
    m = Mono(dur + 1.0)
    m.add(0, air / max(np.std(air[n // 3:2 * n // 3]), 1e-9) * 0.16, 1.0)
    m.add(0, hiss, 0.025)
    tr = 0.95
    for k, mm in enumerate((77, 81, 84, 89, 93, 96)):               # F5 A5 C6 F6 A6 C7
        m.add(tr + k * 0.07, I.glock(mm, 0.55 + 0.06 * k, r), 0.22)
        m.add(tr + k * 0.07 + 0.004, I.musicbox(mm, 0.5, r), 0.14)
    m.add(tr + 0.2, I.pad_chord([65, 69, 72, 79, 84], 1.1, r, cutoff=2600, attack=0.35, release=1.0), 0.5)
    m.add(tr + 0.42, I.bell_fm(89, 0.5, t60=2.0), 0.14)
    m.add(tr + 0.4, I.cymbal_soft(0.35, 1.6, r, swell=False), 0.12)
    sparkles(m, r, tr + 0.5, 10, 0.09, 0.15, decay=8.0)
    return room(m.x, 1.5, 0.22, 0.7, 1.0)


# ============================================================================ villagers
# (consonant, vowel, dur, pitch ratio, slide, amp)
CHATTER = {
    # high / kid-like
    1: dict(f0=410, fs=1.2, tilt=0.85, sylls=[("b", "a", 0.095, 1.0, 0.03, 1.0), ("d", "i", 0.08, 1.14, 0.0, 0.88),
                                              ("b", "u", 0.08, 1.04, -0.02, 0.85), ("d", "a", 0.14, 0.97, -0.1, 1.0)]),
    2: dict(f0=385, fs=1.22, tilt=0.85, sylls=[("m", "i", 0.105, 1.0, 0.0, 0.9), ("m", "o", 0.09, 0.94, 0.0, 0.85),
                                               ("n", "e", 0.17, 1.02, 0.28, 1.0)]),
    3: dict(f0=430, fs=1.18, tilt=0.85, sylls=[("w", "a", 0.1, 1.0, 0.06, 1.0), ("y", "a", 0.075, 1.16, 0.0, 0.9),
                                               ("y", "a", 0.075, 1.26, 0.0, 0.95), ("", "o", 0.15, 1.2, -0.14, 1.0)]),
    # low / adult-like
    4: dict(f0=225, fs=1.05, tilt=1.0, sylls=[("m", "a", 0.1, 1.0, 0.04, 1.0), ("n", "e", 0.09, 1.08, 0.0, 0.9),
                                              ("d", "o", 0.09, 0.98, 0.0, 0.85), ("b", "a", 0.16, 0.9, -0.09, 0.95)]),
    5: dict(f0=148, fs=0.95, tilt=1.05, sylls=[("b", "o", 0.11, 1.0, 0.02, 1.0), ("d", "o", 0.095, 1.12, 0.0, 0.9),
                                               ("m", "a", 0.19, 0.93, -0.07, 1.0)]),
    6: dict(f0=178, fs=1.0, tilt=1.0, sylls=[("n", "a", 0.1, 1.0, 0.0, 1.0), ("b", "i", 0.08, 0.95, 0.0, 0.85),
                                             ("d", "o", 0.09, 1.0, 0.0, 0.85), ("y", "a", 0.17, 1.07, 0.22, 1.0)]),
}


def sfx_chatter(v: int):
    """Cute villager babble (talk bubbles): 3-4 quick formant syllables, 1-3 kid / high, 4-6 adult / low.
    1 'ba-di-bu-da!' (cheerful), 2 'mi-mo-ne?' (question), 3 'wa-ya-ya-o!' (excited),
    4 'ma-ne-do-ba' (warm aunt), 5 'bo-do-ma' (low uncle), 6 'na-bi-do-ya?' (elder, asking)."""
    r = S.rng(6000 + v)
    c = CHATTER[v]
    y = utter(r, c["sylls"], c["f0"], fs=c["fs"], tilt=c["tilt"], breath=0.025, jitter=0.004,
              fmax=9000.0 if v <= 3 else 7500.0)
    y = S.hp(y, 160 if v <= 3 else 90)
    return room(y, 0.35, 0.07, 0.12, 0.45)


def sfx_laugh(v: int):
    """Giggles. 1 = kid 'hi-hi-hi-hi-hee' (high, quick, descending), 2 = warm adult 'ha-ha-ha-ha'."""
    r = S.rng(6100 + v)
    if v == 1:
        f0, fs, k, step, vow = 540, 1.2, 6, 0.085, "i"
        pitches = [1.0, 0.97, 0.93, 0.9, 0.87, 0.92]
    else:
        f0, fs, k, step, vow = 238, 1.05, 5, 0.118, "a"
        pitches = [1.0, 0.95, 0.92, 0.88, 0.85]
    sylls = []
    for i in range(k):
        last = i == k - 1
        d = step * (1.5 if last else 1.0)
        sylls.append(("h", "e" if (v == 1 and last) else vow, d, pitches[i], -0.06 if not last else -0.12,
                      1.0 - 0.06 * i))
    y = utter(r, sylls, f0, fs=fs, tilt=0.9 if v == 1 else 1.0, breath=0.06, jitter=0.006, asp_gain=0.5,
              fmax=9000.0 if v == 1 else 7500.0)
    y = S.hp(y, 150 if v == 1 else 90)
    return room(y, 0.4, 0.08, 0.14, 0.5)


def sfx_snowball_throw():
    """Throwing a snowball: soft snow-pack crumble in the hand + a quick airy arm swish."""
    r = S.rng(6200)
    m = Mono(0.45)
    for tt in np.sort(r.gamma(2.0, 0.008, 14)):                       # crumbs of packed snow
        if tt < 0.06:
            m.add(tt, burst(r, 0.006, r.uniform(2000, 6000), 1.3, tau=r.uniform(0.0005, 0.0012)),
                  r.uniform(0.1, 0.35))
    m.add(0.0, burst(r, 0.05, 900, 0.8, tau=0.012, attack=0.004), 0.18)
    d = 0.24
    m.add(0.03, nsweep(r, d, 600, 900, 1.5, [(0, 0), (0.09, 1), (0.14, 0.5), (d, 0)], mid=2700), 0.75)
    m.add(0.03, puff(r, d, 450, [(0, 0), (0.09, 1), (d, 0)]), 0.35)
    return room(m.x, 0.3, 0.05, 0.08, 0.45)


def sfx_snowball_hit():
    """Snowball lands on someone - soft and funny, not painful: 'pff-splat' thud, powdery crunch, puff."""
    r = S.rng(6300)
    m = Mono(0.5)
    m.add(0, blip(250, 92, 0.14, 0.02, 0.035, attack=0.001), 0.55)
    n = n_of(0.22)
    m.add(0, S.lp(r.standard_normal(n), 2400, order=2) * S.env_pts([(0, 0), (0.003, 1), (0.04, 0.45), (0.22, 0)], n),
          0.65)
    m.add(0.004, S.hp(r.standard_normal(n_of(0.3)), 3200) *
          S.env_pts([(0, 0), (0.01, 0.6), (0.08, 0.25), (0.3, 0)], n_of(0.3)) ** 1.5, 0.3)
    for t0 in 0.002 + r.gamma(2.0, 0.014, 26):
        if t0 < 0.12:
            m.add(t0, burst(r, 0.006, r.uniform(1500, 6500), 1.3, tau=r.uniform(0.0004, 0.0013)),
                  1.2 * r.uniform(0.2, 1.0) ** 2 * np.exp(-t0 / 0.06))
    m.add(0.01, puff(r, 0.28, 900, [(0, 0), (0.02, 1), (0.28, 0)]), 0.25)
    return room(m.x, 0.35, 0.06, 0.1, 0.5)


def sfx_cheer():
    """Small crowd cheer (zone unlocked, show ends): ~8 cute voices 'yay!' / 'woo!' / 'hey!' at
    different pitches, three clappers and a soft crowd murmur."""
    r = S.rng(6400)
    m = Mono(2.4)
    voices = [  # onset, word, f0, formant scale, length, gain
        (0.00, "hey", 228, 1.05, 0.42, 0.55), (0.03, "yay", 430, 1.2, 0.5, 0.7), (0.07, "woo", 178, 1.0, 0.62, 0.5),
        (0.11, "yay", 470, 1.22, 0.42, 0.6), (0.15, "woo", 395, 1.18, 0.66, 0.55), (0.2, "yay", 255, 1.05, 0.52, 0.5),
        (0.62, "yay", 450, 1.2, 0.46, 0.5), (0.72, "woo", 205, 1.02, 0.55, 0.42),
    ]
    for t0, word, f0, fs, d, g in voices:
        if word == "yay":
            sy = [("y", "e", d * 0.62, 1.0, 0.24, 1.0), ("", "i", d * 0.38, 1.22, -0.18, 0.75)]
        elif word == "woo":
            sy = [("w", "u", d, 1.0, 0.32, 1.0)]
        else:
            sy = [("h", "e", d * 0.7, 1.08, 0.12, 1.0), ("", "i", d * 0.3, 1.18, -0.15, 0.7)]
        y = utter(r, sy, f0, fs=fs, tilt=0.9, breath=0.05, jitter=0.006, vib=0.012, vib_rate=6.0,
                  fmax=8500.0, asp_gain=0.4)
        m.add(t0, S.hp(y, 120), g * 0.45)
    for c in range(3):                                                # clappers
        t = 0.08 + 0.05 * c + r.uniform(0, 0.04)
        while t < 1.75:
            g = 0.32 * (1.0 - 0.45 * t / 1.75) * r.uniform(0.7, 1.0)
            m.add(t, I.clap_soft(0.8, r), g)
            t += 1 / r.uniform(5.2, 6.4)
    n = n_of(1.9)
    mur = S.noise_fft(n, r, lambda f: sum(g / (1 + ((f - F) / 250) ** 2) for F, g in ((650, 1.0), (1500, 0.7),
                                                                                       (2600, 0.35))))
    mur *= (0.7 + 0.3 * smooth_noise(r, n, 7.0)) * S.env_pts([(0, 0), (0.1, 1), (0.8, 0.65), (1.9, 0)], n)
    m.add(0, mur, 0.045)
    return room(m.x, 0.8, 0.14, 0.4, 0.75)


# ============================================================================ pets
def sfx_dog_bark():
    """Small cute shiba 'arf! arf!': quick rough formant yips with a pitch flick."""
    r = S.rng(6500)
    m = Mono(0.6)
    for t0, sc in ((0.0, 1.0), (0.2, 1.07)):
        dur = 0.13
        n = n_of(dur)
        t = tax(n)
        f0 = S.env_pts([(0, 560 * sc), (0.018, 760 * sc), (0.06, 690 * sc), (dur, 470 * sc)], n)
        rough = 1 - 0.35 * (0.5 + 0.5 * np.sin(TAU * 72 * t))
        amp = S.env_pts([(0, 0), (0.007, 1), (0.05, 0.85), (dur, 0)], n) * rough
        F1 = S.env_pts([(0, 650), (0.02, 1000), (dur, 760)], n)
        F2 = S.env_pts([(0, 1500), (0.02, 1750), (dur, 1350)], n)
        y = I.formant_voice(f0, amp, [(F1, 180, 1.0), (F2, 260, 0.8), (3100, 400, 0.35)], r, breath=0.18,
                            tilt=0.55, jitter=0.012)
        m.add(t0, S.hp(y, 260), 0.8 * (1.0 if t0 == 0 else 0.92))
        m.add(t0, burst(r, 0.02, 1400, 0.8, tau=0.004), 0.12)
    return room(m.x, 0.4, 0.08, 0.14, 0.5)


def sfx_cat_meow():
    """Kitten 'mi-a-ow': nasal 'm' onset opening to 'a' and closing to 'ow', rising-falling pitch."""
    r = S.rng(6600)
    dur = 0.6
    n = n_of(dur)
    t = tax(n)
    f0 = S.env_pts([(0, 600), (0.08, 700), (0.22, 860), (0.4, 760), (dur, 560)], n)
    f0 = f0 * (1 + 0.012 * np.sin(TAU * 6.5 * t) * np.clip((t - 0.3) / 0.1, 0, 1))
    amp = S.env_pts([(0, 0), (0.03, 0.35), (0.07, 0.45), (0.13, 1.0), (0.38, 0.85), (0.52, 0.45), (dur, 0)], n)
    F1 = S.env_pts([(0, 320), (0.07, 360), (0.16, 1050), (0.34, 980), (0.5, 620), (dur, 520)], n)
    F2 = S.env_pts([(0, 1900), (0.07, 2100), (0.16, 1750), (0.34, 1600), (0.5, 1050), (dur, 950)], n)
    y = I.formant_voice(f0, amp, [(F1, 150, 1.0), (F2, 220, 0.7), (3300, 380, 0.25)], r, breath=0.06, tilt=0.75,
                        jitter=0.006, fmax=9000.0)
    return room(S.hp(y, 280), 0.45, 0.08, 0.15, 0.5)


def sfx_penguin():
    """Baby penguin: two squeaky 'pip!' calls and a wobbly 'pweee~' (nasal, toy-like)."""
    r = S.rng(6700)
    m = Mono(0.8)
    calls = [(0.0, 0.07, (1050, 1250, 980), 0.0), (0.11, 0.07, (1100, 1320, 1020), 0.0),
             (0.23, 0.28, (900, 1150, 1380), 1.0)]
    for t0, dur, (fa, fb, fc), wob in calls:
        n = n_of(dur)
        t = tax(n)
        f0 = S.env_pts([(0, fa), (dur * 0.35, fb), (dur, fc)], n)
        amp = S.env_pts([(0, 0), (0.006, 1), (dur * 0.6, 0.85), (dur, 0)], n)
        if wob:
            amp = amp * (1 - 0.35 * (0.5 + 0.5 * np.sin(TAU * 26 * t)))
            f0 = f0 * (1 + 0.02 * np.sin(TAU * 13 * t))
        y = I.formant_voice(f0, amp, [(1500, 300, 1.0), (2900, 420, 0.65), (4300, 600, 0.2)], r, breath=0.05,
                            tilt=0.5, jitter=0.006, fmax=9500.0)
        m.add(t0, y, 0.8 if not wob else 0.9)
    return room(S.hp(m.x, 500), 0.4, 0.08, 0.14, 0.5)


# ============================================================================ registry
SFX2 = {
    "sfx_hammer_1": lambda: sfx_hammer(1), "sfx_hammer_2": lambda: sfx_hammer(2), "sfx_hammer_3": lambda: sfx_hammer(3),
    "sfx_build_done": sfx_build_done, "sfx_saw_short": sfx_saw_short,
    "sfx_boat_horn": sfx_boat_horn, "sfx_row": sfx_row, "sfx_register": sfx_register,
    "sfx_tower_fire": sfx_tower_fire, "sfx_fog_clear": sfx_fog_clear,
    **{f"sfx_chatter_{v}": (lambda v=v: sfx_chatter(v)) for v in range(1, 7)},
    "sfx_laugh_1": lambda: sfx_laugh(1), "sfx_laugh_2": lambda: sfx_laugh(2),
    "sfx_snowball_throw": sfx_snowball_throw, "sfx_snowball_hit": sfx_snowball_hit,
    "sfx_dog_bark": sfx_dog_bark, "sfx_cat_meow": sfx_cat_meow, "sfx_penguin": sfx_penguin,
    "sfx_cheer": sfx_cheer,
}

# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH2 = {
    "sfx_hammer_1": dict(punch=7), "sfx_hammer_2": dict(punch=7), "sfx_hammer_3": dict(punch=7),
    "sfx_saw_short": dict(punch=2), "sfx_row": dict(punch=2), "sfx_register": dict(punch=2),
    "sfx_snowball_hit": dict(punch=3), "sfx_snowball_throw": dict(punch=1),
    "sfx_dog_bark": dict(punch=2), "sfx_build_done": dict(punch=2), "sfx_tower_fire": dict(punch=2),
    **{f"sfx_chatter_{v}": dict(punch=2, fout=0.02) for v in range(1, 7)},
    "sfx_laugh_1": dict(punch=2, fout=0.02), "sfx_laugh_2": dict(punch=2, fout=0.02),
    "sfx_cat_meow": dict(punch=1, fout=0.02), "sfx_penguin": dict(punch=1, fout=0.02),
}


def render(key: str) -> np.ndarray:
    """Same mastering chain as sfx.render: optional punch limiter -> synth.finish_sfx (peak -1.5 dBFS)."""
    y = np.asarray(SFX2[key](), dtype=float)
    opts = dict(FINISH2.get(key, {}))
    punch = opts.pop("punch", 0)
    if punch:
        y = S.hp(y, 30, order=2)
        y = S.limiter(y / max(S.peak(y), 1e-12), -float(punch), window_ms=3.0)
    return S.finish_sfx(y, peak_db=-1.5, **opts)


def main(keys):
    os.makedirs(CACHE, exist_ok=True)
    for k in keys:
        y = render(k)
        p = os.path.join(CACHE, f"{k}.wav")
        S.write_wav(p, y)
        print(f"{k:20s} {len(y) / SR:5.2f}s  peak {S.db(S.peak(y)):6.2f} dBFS  Mmax {S.momentary_max(y):6.1f}")


if __name__ == "__main__":
    main(sys.argv[1:] or list(SFX2))
