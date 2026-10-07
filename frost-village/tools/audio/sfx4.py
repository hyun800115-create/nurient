"""Frost Village - v6 harbour-city sounds (CONTRACT_V6 section U) by procedural synthesis (library + script).

Same toolkit and layering style as sfx.py / sfx2.py / sfx3.py (imported or copied, never edited):
  ships         sfx_ship_horn_big (deep warm ferry / freighter horn: one long 'BWAAAAM' on F2 + C3 reeds,
                pressure scoop up, sag at the end, echo off the harbour hills),
                sfx_ferry_bell (brass ship's bell rung in pairs 'ding-ding ... ding-ding', strike A5)
  birds         sfx_seagull_1 (one long 'kyaaaow' mew), sfx_seagull_2 (long call 'kee-aaa kyow-kyow-kyow-kyow'),
                sfx_seagull_3 (cheeky chuckle 'kek-kek-kek-kek' + rising 'kew?') - formant-voice gulls a little
                higher, rounder and less raspy than real ones (natural-ish but cute). Group sfx_seagull.
  quay          sfx_crane (harbour crane winch + clank, one 2.0 s work cycle in sync with harbor_crane anims.work:
                latch clank, winch up, slew, lower, crate set down, rewind), sfx_rope_creak (mooring rope
                straining on a wooden bollard: stick-slip 'crrreeeak ... crk'),
                sfx_auction_bell (fish-auction hand bell shaken hard in two bursts, F5 brass)
  loop          amb_harbor (mono, seamless ~22 s: water lapping on the pier pilings over a low swell, gulls near
                and far, a bell buoy and a far ship's bell, rigging tinks, moored boats creaking, a light breeze)
Musical sounds are in F major like bgm_village and the v1-v5 sfx.

amb_harbor is built like ambience.py / sfx3.py: continuous beds in the frequency domain (synth.noise_fft),
modulation curves with whole cycles over the loop (synth.periodic_curve), discrete events rendered past the end
and folded back (synth.fold_loop), circular limiter, then the loop is rotated to start at its quietest zero
crossing (rotate_quiet) so the codecs' file edges are smooth. The event layer is length-independent and
memoised, so build_audio.fit_loop only re-folds it for every candidate loop length.

Run:   python3 tools/audio/sfx4.py [key ...]        (no key = all)
       -> tools/audio/_cache/audio4/<key>.wav  (mono 44.1 kHz float; sfx peak -1.5 dBFS, loop -20 LUFS)
Normally called through build_audio4.py.  Deterministic (each key has a fixed seed).
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
from sfx import Mono, blip, bubble, burst, coin_hit, room, tax  # noqa: E402
from synth import SR, TAU, n_of  # noqa: E402

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_cache", "audio4")


# ============================================================================ helpers (copied from sfx3 so this
# module does not depend on another agent's work-in-progress file)
def tail_fade(y, sec: float):
    """Fade the last ``sec`` seconds smoothly (for sounds still ringing when the file ends)."""
    y = np.array(y, dtype=float, copy=True)
    k = min(len(y), n_of(sec))
    if k > 1:
        y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
    return y


def unit(x):
    return x / max(float(np.std(x)), 1e-12)


def norm(x):
    return x / max(S.peak(x), 1e-12)


def master_mono(x, target: float = -20.0, ceiling: float = -1.5) -> np.ndarray:
    """Loop mastering (like ambience.master_loop, mono): DC removal, loudness, circular limiter."""
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    x = x * S.undb(target - S.lufs(x))
    return S.limiter(x, ceiling, window_ms=5.0, circular=True)


def rotate_quiet(y, win: int = 512):
    """Circularly shift a finished mono loop so it starts at its quietest, flattest zero crossing
    (the codecs' file edges then sit where the signal is ~0) -> (rotated loop, shift)."""
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


def fold1(buf, L: int) -> np.ndarray:
    return S.fold_loop(np.asarray(buf, dtype=float)[None, :], L)[0]


def place(buf, t_sec: float, sig, g: float = 1.0):
    """Add sig into a mono buffer at t seconds (clipped at the buffer end)."""
    i = max(0, n_of(t_sec))
    e = min(len(buf), i + len(sig))
    if e > i:
        buf[i:e] += g * np.asarray(sig, dtype=float)[:e - i]


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


def delay_line(x, sec: float, g: float, lp_hz: float = 2000.0):
    """Single discrete echo (slap-back off the harbour hills / warehouses), low-passed."""
    d = n_of(sec)
    y = np.concatenate((np.asarray(x, float), np.zeros(d)))
    e = np.concatenate((np.zeros(d), S.lp(np.asarray(x, float), lp_hz, order=2)))
    return y + g * e


# ============================================================================ voices
def horn_reed(f0: float, dur: float, r, scoop: float = -1.1, sag: float = -0.7, rel: float = 0.42,
              pw: float = 0.34) -> np.ndarray:
    """One ship-horn diaphone / reed voice: saw + pulse with an air-pressure scoop up onto the pitch, a slow
    gentle wobble while it blows, and the pitch sagging as the pressure falls at the end."""
    n = n_of(dur + rel)
    t = tax(n)
    semis = scoop * np.exp(-t / 0.075)
    semis = semis + 0.045 * np.sin(TAU * 3.7 * t + r.uniform(0, TAU)) * np.clip((t - 0.35) / 0.4, 0, 1)
    semis = semis + sag * np.clip((t - dur) / rel, 0, 1) ** 1.4
    f = f0 * 2 ** (semis / 12)
    x = 0.6 * S.saw(f, n, r.random()) + 0.4 * S.square(f * 1.0012, n, pw, r.random())
    env = S.env_adsr(n, 0.11, 0.2, 0.9, rel, gate=dur)
    return x * env


def ship_bell(prime_m: float, r, t60: float = 2.4, vel: float = 1.0, dur: float | None = None) -> np.ndarray:
    """Small brass ship's bell (strike note = nominal, an octave above the prime): hum, prime, a major-third
    tierce (bright, happy), quint, nominal + slow shimmer pair, upper partials; hard clapper 'tink'."""
    f = float(S.midi_hz(prime_m))
    n = n_of(dur if dur else t60)
    parts = [(0.5, 0.10, t60 * 0.9), (1.0, 0.28, t60 * 0.7), (1.0042, 0.1, t60 * 0.65), (1.25, 0.2, t60 * 0.45),
             (1.5, 0.14, t60 * 0.4), (2.0, 1.0, t60 * 0.55), (2.0061, 0.32, t60 * 0.5), (2.61, 0.16, t60 * 0.22),
             (3.0, 0.22, t60 * 0.2), (4.07, 0.1, t60 * 0.1), (5.25, 0.05, t60 * 0.06)]
    y = S.modal(f, n, parts, r, fmax=10000.0, attack=0.0006)
    k = n_of(0.012)
    y[:k] += burst(r, 0.012, 4200, 1.2, tau=0.0015)[:k] * 0.35
    return y * vel


def handbell(m: float, r, vel: float = 1.0, t60: float = 1.1) -> np.ndarray:
    """Brass hand bell: fundamental + strong 12th (x3), shimmer pair, bright clapper click (as sfx3)."""
    f = float(S.midi_hz(m))
    n = n_of(t60)
    modes = [(1.0, 1.0, t60), (1.0031, 0.35, t60 * 0.9), (2.0, 0.08, t60 * 0.45), (3.0, 0.45, t60 * 0.4),
             (4.2, 0.13, t60 * 0.2), (5.4, 0.08, t60 * 0.12), (6.8, 0.04, 0.07)]
    y = S.modal(f, n, modes, r, fmax=11000.0, attack=0.0004)
    k = n_of(0.006)
    y[:k] += burst(r, 0.006, 5200, 1.0, tau=0.0008) * 0.5
    return y * vel


def gull_note(r, f_base: float, dur: float, contour, vowel, amp_pts=None, rasp: float = 0.22,
              click: float = 0.5) -> np.ndarray:
    """One gull syllable from the formant voice.
    contour: [(u, pitch ratio)] over u = 0..1 of the note (x f_base); vowel: [(u, F1, F2)] formant tracks
    (bright 'kee' ~ 2.6 / 4.2 kHz -> dark 'ow' ~ 1.3 / 2.4 kHz gives the 'kyow'); rasp = the gull's
    rough edge (fast jittery amplitude flutter + noise in the formants), kept mild so it stays cute;
    click = the hard 'k' onset."""
    n = n_of(dur)
    t = tax(n)
    u = t / dur
    f0 = f_base * np.interp(u, [c[0] for c in contour], [c[1] for c in contour])
    F1 = np.interp(u, [v[0] for v in vowel], [v[1] for v in vowel])
    F2 = np.interp(u, [v[0] for v in vowel], [v[2] for v in vowel])
    pts = amp_pts or [(0, 0), (0.012, 0.85), (0.05, 1.0), (dur * 0.55, 0.9), (dur * 0.85, 0.55), (dur, 0)]
    amp = S.env_pts(pts, n)
    y = I.formant_voice(f0, amp, [(F1, 900.0, 1.0), (F2, 1300.0, 0.55), (5200.0, 1800.0, 0.08)], r,
                        breath=0.05, tilt=0.55, fmax=9500.0, jitter=0.012)
    if rasp > 0:                                   # rough flutter (~70-110 Hz, jittery) + formant noise
        fl = 85.0 * (1 + 0.15 * S.lp(r.standard_normal(n), 30.0, order=2) / 0.05)
        ph = S.phase(np.clip(fl, 40, 160), n)
        y = y * (1 - rasp * (0.5 + 0.5 * np.sin(TAU * ph)) ** 2)
        nz = S.tv_filter(r.standard_normal(n), "bp", F1, 2.2) + 0.5 * S.tv_filter(r.standard_normal(n), "bp", F2, 2.5)
        y = y + rasp * 0.35 * unit(nz) * np.std(y) * amp
    if click > 0:
        k = n_of(0.007)
        y[:k] += burst(r, 0.007, 3300, 1.4, tau=0.0015)[:k] * click * S.peak(y)
    return y


def gull_call(r, variant: int, f_base: float | None = None, rasp: float | None = None) -> np.ndarray:
    """The three gull calls (also used, detuned and far away, in amb_harbor). -> dry mono, peak 1."""
    m = Mono(1.6)
    kyow_c = [(0.0, 0.84), (0.13, 1.13), (0.36, 1.1), (0.75, 0.86), (1.0, 0.7)]
    kyow_v = [(0.0, 2700, 4300), (0.25, 2300, 3900), (0.7, 1450, 2600), (1.0, 1250, 2300)]
    if variant == 1:                               # one long 'kyaaaaow' mew
        fb = f_base or 1180.0
        y = gull_note(r, fb, 0.56, [(0.0, 0.8), (0.1, 1.12), (0.45, 1.07), (0.8, 0.88), (1.0, 0.72)],
                      [(0.0, 2800, 4400), (0.2, 2400, 4000), (0.55, 1900, 3200), (1.0, 1300, 2400)],
                      rasp=0.2 if rasp is None else rasp)
        m.add(0.0, y, 1.0)
    elif variant == 2:                             # long call: 'kee-aaa' then 'kyow kyow kyow kyow'
        fb = f_base or 1100.0
        rs = 0.24 if rasp is None else rasp
        m.add(0.0, gull_note(r, fb * 1.06, 0.34, [(0.0, 0.82), (0.12, 1.12), (0.6, 1.08), (1.0, 0.9)],
                             [(0.0, 2800, 4400), (0.3, 2300, 3800), (1.0, 1900, 3200)], rasp=rs), 1.0)
        t = 0.44
        for k in range(4):
            d = 0.15 - 0.012 * k
            m.add(t, gull_note(r, fb * (1.0 - 0.025 * k), d, kyow_c, kyow_v, rasp=rs, click=0.6), 0.92 - 0.1 * k)
            t += d + 0.045 - 0.006 * k
    else:                                          # cheeky chuckle 'kek-kek-kek-kek' + rising 'kew?'
        fb = f_base or 1320.0
        rs = 0.3 if rasp is None else rasp
        t = 0.0
        for k in range(4):
            d = 0.072
            pts = [(0, 0), (0.006, 0.9), (0.02, 1.0), (0.05, 0.6), (d, 0)]
            m.add(t, gull_note(r, fb * (1.0 + 0.02 * (k % 2)), d, [(0, 0.95), (0.3, 1.06), (1, 0.86)],
                               [(0, 2500, 4100), (1, 1900, 3300)], amp_pts=pts, rasp=rs, click=0.7), 0.85 - 0.06 * k)
            t += 0.105
        m.add(t + 0.08, gull_note(r, fb * 0.92, 0.24, [(0, 0.85), (0.5, 1.12), (1, 1.24)],
                                  [(0, 1500, 2600), (0.6, 2400, 3900), (1, 2700, 4300)], rasp=rs * 0.6, click=0.5),
              0.8)
    y = S.hp(m.x, 450, order=2)
    return norm(y)


def creak(r, dur: float, rate_pts, res=((480, 3.5, 1.0), (1080, 4.5, 0.65), (2250, 5.0, 0.28)),
          env_pts=None, jitter: float = 0.18) -> np.ndarray:
    """Stick-slip creak (rope on a wooden bollard, hull against a fender): an irregular pulse train whose
    rate follows rate_pts [(t, Hz)], each slip exciting the wood resonances ``res`` [(Hz, Q, gain)]."""
    n = n_of(dur)
    t = tax(n)
    rate = np.interp(t, [p[0] for p in rate_pts], [p[1] for p in rate_pts])
    rate = rate * (1 + jitter * S.lp(r.standard_normal(n), 25.0, order=2) / 0.06)
    ph = np.cumsum(np.clip(rate, 2.0, 400.0)) / SR
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1
    exc = np.zeros(n)
    exc[idx] = r.uniform(0.45, 1.0, len(idx)) * np.sign(r.standard_normal(len(idx)))
    exc = exc + 0.04 * r.standard_normal(n) * (exc != 0)
    exc = S.lp(exc, 6000)
    y = sum(g * S.bp(exc, f, q) for f, q, g in res)
    env = S.env_pts(env_pts or [(0, 0), (dur * 0.1, 1.0), (dur * 0.75, 0.85), (dur, 0)], n)
    return y * env


def lap(r, strength: float = 1.0) -> np.ndarray:
    """Water lapping against a wooden piling under the pier: a soft 'shhlup' slosh, hollow glug of the air
    pocket under the boards, a couple of plops and drips."""
    d = 0.9
    n = n_of(d)
    sl = S.tv_filter(r.standard_normal(n), "bp", 500 + 600 * np.exp(-tax(n) / 0.12), 0.9, block=64)
    sl = S.lp(sl, 2600) * S.env_pts([(0, 0), (0.06, 0.8), (0.14, 1.0), (0.4, 0.35), (d, 0)], n)
    m = Mono(d + 0.3)
    m.add(0.0, unit(sl) * 0.12, 1.0)
    hol = S.bp(r.standard_normal(n_of(0.3)), r.uniform(190, 260), 5.0) * S.env_exp(n_of(0.3), 0.06, 0.012)
    m.add(0.05, unit(hol) * 0.1, 1.0)
    m.add(0.08, blip(r.uniform(150, 210), 95, 0.16, 0.03, 0.05, attack=0.006), 0.18)
    for k in range(int(r.integers(2, 4))):
        m.add(0.06 + r.uniform(0, 0.2), bubble(r, r.uniform(260, 520), r.uniform(0.05, 0.09), 0.8), r.uniform(0.08, 0.16))
    for k in range(int(r.integers(1, 4))):
        m.add(0.3 + r.exponential(0.12), bubble(r, r.uniform(900, 1700), 0.03, 0.6, tau=0.008), r.uniform(0.03, 0.07))
    return m.x * strength


# ============================================================================ ships
def sfx_ship_horn_big():
    """Big ship's horn (ferry / cargo ship arriving): one long, deep, warm 'BWAAAAAM' - two diaphones a fifth
    apart (F2 + C3) with a softer octave reed (F3) and a slightly detuned twin for slow beating, shaped by
    'aw' vowel formants (~330 / ~850 Hz, audible on phone speakers), steam hiss at the onset, pitch scoop up
    and a sag as the air runs out; then the echo off the harbour hills and a long open-water tail."""
    r = S.rng(9100)
    dur = 2.25
    m = Mono(4.5)
    voices = ((41, 1.0, 0.0), (41.07, 0.5, 0.012), (48, 0.72, 0.006), (53, 0.22, 0.018))   # F2, twin, C3, F3
    for mm, g, dt in voices:
        m.add(dt, horn_reed(float(S.midi_hz(mm)), dur, r), g)
    y = m.x
    y = S.lp(y, 1500, 0.7, order=2)
    y = S.peq(y, 330, 6.0, 1.0)
    y = S.peq(y, 850, 4.0, 1.4)
    y = S.hp(y, 50, order=2)
    n = len(y)
    sub = S.sine(float(S.midi_hz(41)), n) * S.env_adsr(n, 0.15, 0.2, 0.85, 0.45, gate=dur)
    y = norm(y) + 0.18 * sub
    k = n_of(dur + 0.3)                            # steam / air hiss: puff at the onset, faint while blowing
    air = S.bp(r.standard_normal(k), 1500, 0.7) * S.env_pts([(0, 0), (0.04, 1.0), (0.2, 0.35), (dur, 0.25),
                                                                (dur + 0.3, 0)], k)
    y[:k] += unit(air) * 0.025
    y = delay_line(y, 0.46, 0.24, 1100)            # slap-back off the hills / warehouses
    y = delay_line(y, 0.95, 0.09, 800)
    y = I.verb_mono(y, rt60=2.6, mix=0.24, tail=1.2, predelay=0.03, size=1.0, hi_cut=3500)
    return tail_fade(y, 1.2)


def sfx_ferry_bell():
    """Ferry departure / arrival bell: a brass ship's bell (strike A5) rung in pairs - 'ding-ding ... ding-ding'
    - each pair the clapper swung twice in quick succession, then it rings out over the water."""
    r = S.rng(9200)
    m = Mono(3.6)
    hits = ((0.0, 1.0), (0.23, 0.82), (0.95, 1.0), (1.18, 0.85))
    for t0, v in hits:
        m.add(t0 + r.normal(0, 0.004), ship_bell(69, r, t60=2.2, vel=v * r.uniform(0.93, 1.0), dur=3.4 - t0), 0.45)
    y = S.hp(S.lp(m.x, 8500), 160, order=2)
    y = S.peq(y, 1760, 1.5, 1.0)
    y = I.verb_mono(y, rt60=1.5, mix=0.14, tail=0.25, predelay=0.02, size=0.9)
    return tail_fade(y, 1.0)


# ============================================================================ gulls
def sfx_seagull(v: int):
    """Herring-gull-ish calls with a little outdoor space: v1 long mew, v2 long call, v3 cheeky chuckle."""
    r = S.rng(9300 + v)
    y = gull_call(r, v)
    y = I.verb_mono(y, rt60=0.7, mix=0.1, tail=0.25, predelay=0.012, size=0.8)
    return tail_fade(y, 0.2)


# ============================================================================ quay
def steel_clank(r, f: float = 330.0, vel: float = 1.0, ring: float = 0.35) -> np.ndarray:
    """Hook block / shackle clank: inharmonic steel partials (softened top), bright tick, low thud."""
    n = n_of(ring + 0.05)
    y = S.modal(f, n, [(1, 1, ring), (2.31, 0.55, ring * 0.7), (3.93, 0.3, ring * 0.45), (5.62, 0.16, ring * 0.25),
                       (7.4, 0.07, ring * 0.15)], r, fmax=9000.0, attack=0.0003)
    y[:n_of(0.005)] += burst(r, 0.005, 3800, 1.2, tau=0.0008) * 0.6
    th = blip(170, 90, 0.08, 0.012, 0.025, attack=0.0008)
    y[:len(th)] += th * 0.5
    return y * vel


def crate_thunk(r, vel: float = 1.0) -> np.ndarray:
    """Wooden crate set down on the quay: low body thump + hollow wood knock + scrape."""
    n = n_of(0.3)
    y = blip(150, 72, 0.3, 0.03, 0.07, attack=0.0015)
    y = y + S.modal(235, n, [(1, 1, 0.07), (2.43, 0.5, 0.035), (3.95, 0.25, 0.018)], r, attack=0.0006) * 0.45
    y[:n_of(0.03)] += burst(r, 0.03, 900, 0.8, tau=0.008)[:n_of(0.03)] * 0.35
    return y * vel


def winch(r, dur: float, speed_pts, load: float = 1.0) -> np.ndarray:
    """Electric cargo winch: motor hum locked to the drum speed, a toy-like rising gear whine, brush hiss,
    pawl ratchet ticks and a soft cable-drum rumble. speed_pts = [(t, motor Hz)]."""
    n = n_of(dur)
    t = tax(n)
    fr = np.maximum(np.interp(t, [p[0] for p in speed_pts], [p[1] for p in speed_pts]), 1.0)
    run = np.clip((fr - 1.0) / 8.0, 0, 1)
    hum = S.additive(fr * 2, n, [(h, 1.0 / (1 + ((h * 60 - 300) / 260.0) ** 2)) for h in range(1, 16)], fmax=4000)
    whine = 0.55 * S.sine(fr * 9.0, n) + 0.3 * S.sine(fr * 13.0, n)
    brush = S.bp(r.standard_normal(n), 2600, 1.0) * (0.6 + 0.4 * np.sin(TAU * S.phase(fr * 2, n)))
    rumble = S.lp(r.standard_normal(n), 220, order=2)
    y = unit(hum) * 0.5 + whine * 0.32 + unit(brush) * 0.05 + unit(rumble) * 0.18 * load
    ph = np.cumsum(fr * 0.5) / SR                  # ratchet: tick every 2 motor turns
    idx = np.nonzero(np.diff(np.floor(ph)) > 0)[0] + 1
    tick = np.zeros(n)
    for i in idx:
        k = min(n - i, n_of(0.004))
        tick[i:i + k] += burst(r, 0.004, 3200, 1.6, tau=0.0006)[:k]
    y = y + tick * 0.22
    return y * run


def sfx_crane():
    """Harbour crane, one work cycle (2.0 s = harbor_crane anims.work, 8 frames at 4 fps): the hook latches
    onto a crate (clank, frame 0), the winch whirrs up (frames 0-2), the turntable slews with a soft
    creak (frame 3), the winch lets the load down (frame 4), the crate is set on the quay (thunk + chain
    jingle + clank, frame 5 = dropFrame at 1.25 s), the empty hook rewinds (frames 6-7)."""
    r = S.rng(9400)
    m = Mono(2.2)
    m.add(0.0, steel_clank(r, 360, 1.0, 0.3), 0.55)                                   # latch
    m.add(0.03, steel_clank(r, 520, 0.6, 0.18), 0.25)
    up = winch(r, 0.78, [(0, 0), (0.1, 26), (0.5, 30), (0.62, 26), (0.74, 4), (0.78, 0)], 1.0)
    m.add(0.05, up, 0.5)
    sl = creak(r, 0.32, [(0, 18), (0.15, 30), (0.32, 22)], res=((380, 3.0, 1.0), (900, 4.0, 0.5)),
               env_pts=[(0, 0), (0.05, 0.6), (0.25, 0.5), (0.32, 0)])
    m.add(0.74, norm(sl), 0.1)                                                        # slew
    m.add(0.78, winch(r, 0.3, [(0, 0), (0.06, 12), (0.24, 14), (0.3, 0)], 0.5), 0.3)  # slew motor
    dn = winch(r, 0.32, [(0, 0), (0.06, 22), (0.22, 18), (0.3, 6), (0.32, 0)], 0.6)
    m.add(0.97, dn, 0.42)                                                             # lower
    m.add(1.25, crate_thunk(r, 1.0), 0.7)                                             # set down
    m.add(1.262, steel_clank(r, 300, 0.8, 0.28), 0.38)
    for k in range(5):                                                                # chain slack jingle
        m.add(1.29 + 0.032 * k + r.uniform(0, 0.012), coin_hit(r, r.uniform(1900, 2900), 0.08), 0.07 * (1 - 0.12 * k))
    rw = winch(r, 0.55, [(0, 0), (0.08, 30), (0.38, 33), (0.5, 8), (0.55, 0)], 0.35)
    m.add(1.36, rw, 0.42)                                                             # rewind
    m.add(1.9, steel_clank(r, 610, 0.3, 0.1), 0.12)                                   # hook settles
    y = S.hp(m.x, 60, order=2)
    y = S.lp(y, 7500)
    y = room(y, 0.6, 0.1, 0.12, 0.7)
    return tail_fade(y[:n_of(1.99)], 0.08)


def sfx_rope_creak():
    """A moored ship tugging on its rope: a long 'crrreeeak' as the rope stretches round the wooden bollard
    (slip rate rising), a short slack 'crk-crk', and a faint low groan of the pier timbers."""
    r = S.rng(9500)
    m = Mono(1.6)
    a = creak(r, 0.85, [(0, 22), (0.3, 48), (0.65, 72), (0.85, 60)],
              env_pts=[(0, 0), (0.12, 0.7), (0.45, 1.0), (0.75, 0.8), (0.85, 0)])
    m.add(0.0, norm(a), 0.8)
    b = creak(r, 0.26, [(0, 55), (0.26, 30)], res=((560, 3.5, 1.0), (1250, 4.5, 0.6), (2500, 5.0, 0.25)),
              env_pts=[(0, 0), (0.03, 1.0), (0.1, 0.4), (0.13, 0.9), (0.26, 0)])
    m.add(0.98, norm(b), 0.55)
    g = creak(r, 1.1, [(0, 9), (0.5, 14), (1.1, 8)], res=((140, 2.5, 1.0), (330, 3.0, 0.6)), jitter=0.3)
    m.add(0.1, norm(g), 0.16)
    k = n_of(0.9)                                   # rope fibres stretching: soft high rustle
    fib = S.bp(r.standard_normal(k), 3800, 1.2) * S.env_pts([(0, 0), (0.3, 0.6), (0.7, 1.0), (0.9, 0)], k)
    m.add(0.0, unit(fib) * 0.02, 1.0)
    y = S.hp(m.x, 80, order=2)
    y = room(y, 0.5, 0.1, 0.15, 0.7)
    return tail_fade(y, 0.12)


def sfx_auction_bell():
    """Fish-auction hand bell (the auctioneer opens the bidding): a big brass hand bell (F5) shaken hard in
    two bursts - 'kalang-kalang-kalang ... kalang-kalang-kalang' - then it rings out."""
    r = S.rng(9600)
    m = Mono(2.6)
    for b0, b1 in ((0.0, 0.52), (0.72, 1.3)):
        t = b0
        k = 0
        while t < b1:
            v = (1.0 if k % 2 == 0 else 0.72) * r.uniform(0.85, 1.0)
            m.add(t, handbell(77, r, v, t60=1.0), 0.32)
            k += 1
            t += 0.085 + r.normal(0, 0.004)
    y = m.x
    tt = tax(len(y))
    sway = 1 - 0.18 * (0.5 + 0.5 * np.cos(TAU * tt / 0.17))
    y = S.hp(S.lp(y * sway, 9000), 200, order=2)
    y = I.verb_mono(y, rt60=1.0, mix=0.12, tail=0.2, predelay=0.012, size=0.8)   # open auction hall
    return tail_fade(y, 0.7)


# ============================================================================ amb_harbor (loop)
_MEMO = {}


def _memo(key, fn):
    if key not in _MEMO:
        _MEMO[key] = fn()
    return _MEMO[key]


def far(x, lp_hz: float, mix: float = 0.6, rt60: float = 2.2):
    """Distance: low-pass + mostly reverb (mono)."""
    y = S.lp(np.asarray(x, float), lp_hz, order=2)
    return I.verb_mono(y, rt60=rt60, mix=mix, tail=1.6, predelay=0.04, size=1.0, hi_cut=min(5000, lp_hz * 1.3))


def _harbor_events(seed: int, nominal: float):
    """Length-independent event layer of amb_harbor (memoised): laps, gulls, bells, tinks, creaks."""
    r = S.rng(seed + 1)
    buf = np.zeros(n_of(nominal + 5.0))
    # water lapping on the pilings: clusters around each swell crest (~every 4.4 s), slightly irregular
    crests = np.arange(0.6, nominal, nominal / 5.0)
    for c in crests:
        for j in range(int(r.integers(2, 4))):
            place(buf, c + j * r.uniform(0.35, 0.6) + r.uniform(-0.1, 0.1), lap(r, r.uniform(0.6, 1.0)), 0.55)
    # gulls: one fairly close, the rest far over the water
    gulls = ((1.4, 2, 1.0, 0.9, 5200), (5.9, 1, 1.06, 0.35, 2600), (9.3, 3, 0.95, 0.42, 3400),
             (12.6, 1, 0.92, 0.6, 4200), (16.2, 2, 1.1, 0.3, 2400), (19.4, 3, 1.03, 0.25, 2200))
    for t0, v, pitch, g, lpf in gulls:
        y = gull_call(r, v, f_base={1: 1180.0, 2: 1100.0, 3: 1320.0}[v] * pitch)
        y = far(y, lpf, mix=0.35 if g > 0.8 else 0.65)
        place(buf, t0, norm(y), 0.16 * g)
    # bell buoy rocking out at the harbour mouth (strike F5 / C6 - in key), and a far ship's bell pair
    for t0, pm, v in ((3.1, 65, 1.0), (4.15, 72, 0.7), (11.0, 65, 0.85), (17.6, 72, 0.8), (18.5, 65, 0.6)):
        b = far(ship_bell(pm, r, t60=3.2, vel=v), 3000, mix=0.7, rt60=2.8)
        place(buf, t0, norm(b), 0.05 * v)
    for t0 in (14.2, 14.43):
        b = far(ship_bell(69, r, t60=2.0, vel=0.8), 2600, mix=0.75, rt60=2.6)
        place(buf, t0, norm(b), 0.022)
    # rigging: halyards tapping aluminium masts of the moored sailboats ('tink ... tink-tink')
    for t0 in (2.2, 2.42, 7.8, 8.05, 8.2, 13.3, 20.1, 20.3):
        tk = coin_hit(r, r.uniform(2300, 3100), 0.25) * r.uniform(0.5, 1.0)
        place(buf, t0 + r.uniform(-0.03, 0.03), far(tk, 6000, 0.3, 1.0), 0.012)
    # moored boats tugging their ropes / fenders squeezing
    for t0, gg in ((6.8, 1.0), (15.1, 0.7)):
        c = creak(r, 0.9, [(0, 20), (0.4, 44), (0.9, 30)], env_pts=[(0, 0), (0.2, 0.8), (0.6, 1.0), (0.9, 0)])
        place(buf, t0, norm(far(c, 3000, 0.4, 1.2)), 0.03 * gg)
    return buf


def render_harbor_amb(seed: int = 9700, loop_samples=None, nominal: float = 22.0):
    """Harbour bed (mono loop): low sea swell under the pier (5 slow crests per loop), a distant mid-band wash,
    a light sea breeze, plus the memoised event layer (laps, gulls, bells, rigging, creaks)."""
    r = S.rng(seed)
    L = int(loop_samples or n_of(nominal))
    t = np.arange(L) / L
    swell = 0.5 + 0.5 * np.cos(TAU * (5 * t - 0.6 / nominal * 5) + 0.0)          # 5 crests, phase near laps
    swell = 0.6 * swell + 0.4 * S.periodic_curve(L, r, 2, 9, slope=1.1)
    low = unit(S.noise_fft(L, r, lambda f: 1.0 / (1 + (f / 170.0) ** 2) / np.sqrt(np.maximum(f, 25))))
    wash = unit(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 800.0) / 1.1) ** 2)))
    fc = 450 + 900 * swell ** 1.5
    wash = unit(circ_tv(wash, "lp", fc, 0.7))
    breeze_c = S.periodic_curve(L, r, 1, 4, slope=1.2)
    breeze = unit(circ_tv(S.noise_fft(L, r, lambda f: np.exp(-0.5 * (np.log2(f / 600.0) / 1.5) ** 2)), "bp",
                          380 + 420 * breeze_c, 0.8))
    hiss = unit(S.filt_circ(S.noise_fft(L, r), "hp", 3500, order=2))
    bed = low * 0.05 * (0.55 + 0.45 * swell) + wash * 0.03 * (0.35 + 0.65 * swell ** 1.4) + \
        breeze * 0.012 * (0.3 + 0.7 * breeze_c) + hiss * 0.003 * (0.4 + 0.6 * swell)
    ev = _memo(("harbor", seed, nominal), lambda: _harbor_events(seed, nominal))
    y = bed + fold1(ev, L)
    y = S.filt_circ(y, "hp", 35, order=2)
    y, shift = rotate_quiet(master_mono(y, -20.0))
    return y, {"loopSamples": L, "rotation": shift}


# ============================================================================ registry
SFX4 = {
    "sfx_ship_horn_big": sfx_ship_horn_big,
    "sfx_ferry_bell": sfx_ferry_bell,
    "sfx_seagull_1": lambda: sfx_seagull(1), "sfx_seagull_2": lambda: sfx_seagull(2),
    "sfx_seagull_3": lambda: sfx_seagull(3),
    "sfx_crane": sfx_crane,
    "sfx_auction_bell": sfx_auction_bell,
    "sfx_rope_creak": sfx_rope_creak,
}
# per-key mastering like sfx.FINISH: punch = dB of fast (3 ms look-ahead) limiting before normalisation
FINISH4 = {
    "sfx_ship_horn_big": dict(punch=1, fout=0.08), "sfx_ferry_bell": dict(punch=2, fout=0.05),
    "sfx_seagull_1": dict(punch=1, fout=0.02), "sfx_seagull_2": dict(punch=1, fout=0.02),
    "sfx_seagull_3": dict(punch=1, fout=0.02), "sfx_crane": dict(punch=3, fout=0.03),
    "sfx_auction_bell": dict(punch=2, fout=0.05), "sfx_rope_creak": dict(punch=2, fout=0.03),
}
LOOP_FUNCS = {"amb_harbor": "render_harbor_amb"}


def render(key: str) -> np.ndarray:
    """Same mastering chain as sfx.render / sfx2.render / sfx3.render: optional punch limiter ->
    synth.finish_sfx (high-pass, trim, fades, peak -1.5 dBFS)."""
    y = np.asarray(SFX4[key](), dtype=float)
    opts = dict(FINISH4.get(key, {}))
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
    main(sys.argv[1:] or (list(SFX4) + list(LOOP_FUNCS)))
