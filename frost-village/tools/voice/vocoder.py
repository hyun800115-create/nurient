"""눈꽃말 voice tools - WORLD vocoder voice transformation (library).

An eSpeak articulation (espeak.py, monotone, adult) is analysed with WORLD (pyworld: harvest F0,
CheapTrick spectral envelope, D4C aperiodicity) and resynthesised as a small cute creature voice:

  * time      : new phoneme durations (voice speed, vowel / consonant scaling, final lengthening,
                held "emote" vowels) through a monotone time map; frames are interpolated
  * pitch     : the analysed F0 is thrown away; a designed melody (semitones over the voice's base,
                one target per syllable nucleus, onset scoops, overshoot, declination, vibrato,
                tiny jitter) is drawn on the new time axis; unvoiced frames stay unvoiced
  * formants  : the spectral envelope is warped along frequency by `alpha` (>1 = smaller head:
                kids 1.25..1.4, squeaky 1.5) with an optional extra lift of the F2 region ("smile")
  * timbre    : spectral tilt (dB / octave above 1 kHz), breathiness (aperiodicity floor rising
                with frequency), soft high cut to keep it round and never harsh; unvoiced frames (s, ch, f, h,
                bursts) get an extra high shelf so they stay soft
WORLD (Morise et al., modified-BSD) via pyworld (MIT).

    an = analyse(x, fs)                  # x mono float at fs (eSpeak: 22050 Hz)
    y  = resynth(an, plan, voice)        # -> mono float at an['fs']
"""
from __future__ import annotations

import numpy as np

try:
    import warnings
    with warnings.catch_warnings():               # pyworld 0.3.5 imports pkg_resources (setuptools < 81)
        warnings.simplefilter("ignore")
        import pyworld as pw
except ImportError as e:  # pragma: no cover
    raise SystemExit("tools/voice needs pyworld (and setuptools<81):  python3 -m pip install pyworld 'setuptools<81'") from e

FP = 5.0                  # WORLD frame period, ms


def analyse(x, fs: int):
    x = np.ascontiguousarray(np.asarray(x, dtype=np.float64))
    f0, t = pw.harvest(x, fs, f0_floor=55.0, f0_ceil=500.0, frame_period=FP)
    sp = pw.cheaptrick(x, f0, t, fs)
    ap = pw.d4c(x, f0, t, fs)
    return {"f0": f0, "t": t, "sp": sp, "ap": ap, "fs": fs, "n": len(x)}


# ----------------------------------------------------------------------------- time map
def frames_at(an, tau):
    """Interpolate envelope (log), aperiodicity and voicing at input times tau (s)."""
    n = len(an["f0"])
    pos = np.clip(np.asarray(tau) * 1000.0 / FP, 0, n - 1)
    i0 = np.floor(pos).astype(int)
    i1 = np.minimum(i0 + 1, n - 1)
    w = (pos - i0)[:, None]
    lsp = np.log(np.maximum(an["sp"], 1e-16))
    sp = np.exp(lsp[i0] * (1 - w) + lsp[i1] * w)
    ap = an["ap"][i0] * (1 - w) + an["ap"][i1] * w
    voiced = an["f0"][np.clip(np.round(pos).astype(int), 0, n - 1)] > 0
    return sp, ap, voiced


# ----------------------------------------------------------------------------- spectral shaping
def warp_envelope(sp, fs: int, alpha: float, smile: float = 0.0, tilt_db_oct: float = 0.0,
                  hicut: float = 9000.0, locut: float = 0.0):
    """Frequency-warp every frame of the envelope by alpha (formants x alpha), optional F2-region
    lift (`smile`, dB around 1.6-2.6 kHz), tilt above 1 kHz and a soft high cut (12 dB / oct)."""
    K = sp.shape[1]
    f = np.linspace(0, fs / 2, K)
    src = f / alpha                           # output bin f reads the input at f / alpha
    lsp = np.log(np.maximum(sp, 1e-16))
    out = np.empty_like(lsp)
    top = fs / 2
    for i in range(sp.shape[0]):
        row = lsp[i]
        v = np.interp(np.minimum(src, top), f, row)
        if alpha < 1.0:                       # reading above Nyquist: continue with a gentle fall
            over = src > top
            v[over] = row[-1] - 1.2 * np.log2(src[over] / top)
        out[i] = v
    g = np.zeros(K)
    if smile:
        g += smile / 20 * np.log(10) * np.exp(-0.5 * ((f - 2100.0 * alpha ** 0.5) / 600.0) ** 2)
    if tilt_db_oct:
        g += np.where(f > 1000, tilt_db_oct * np.log2(np.maximum(f, 1000) / 1000), 0.0) / 20 * np.log(10)
    if hicut:
        g += np.where(f > hicut, -12.0 * np.log2(np.maximum(f, hicut) / hicut), 0.0) / 20 * np.log(10)
    if locut:
        g += np.where(f < locut, -12.0 * np.log2(locut / np.maximum(f, 20.0)), 0.0) / 20 * np.log(10)
    return np.exp(out + g[None, :] * 2)       # *2: sp is a power spectrum


def breathy(ap, fs: int, amount: float):
    """Raise the aperiodicity floor (0..1, more at high frequencies) -> soft breathy voice."""
    if amount <= 0:
        return ap
    K = ap.shape[1]
    f = np.linspace(0, fs / 2, K)
    floor = np.clip(amount * (0.25 + 0.75 * np.clip(f / 4000.0, 0, 1.6)), 0, 0.95)
    return np.maximum(ap, floor[None, :])


# ----------------------------------------------------------------------------- melody
def smooth_track(x, hz: float, frame_ms: float = FP):
    from scipy.signal import butter, filtfilt
    if len(x) < 16:
        return x
    b, a = butter(2, min(0.99, hz / (500.0 / frame_ms)), "low")
    pad = min(len(x) - 1, 24)
    return filtfilt(b, a, x, padlen=pad)


def melody(tt, nuclei, rng, base_hz: float, vib_cents: float = 0.0, vib_rate: float = 5.5,
           jitter_cents: float = 6.0, scoop: float = 1.6, decl: float = -1.0, overshoot: float = 0.5):
    """F0 (Hz) over output frame times tt from nucleus targets.

    nuclei: [{t0, t1, st, slope, vib}] in output seconds; st = semitones over base_hz at the start of the
    vowel, slope = semitones gained by its end, vib = 0..1 vibrato weight on that vowel."""
    if not nuclei:
        return np.full(len(tt), base_hz)
    kt, kv = [], []
    for k, nu in enumerate(nuclei):
        t0, t1, st, sl = nu["t0"], nu["t1"], nu["st"], nu.get("slope", 0.0)
        d = max(0.02, t1 - t0)
        sc = nu.get("scoop", scoop)
        kt += [t0, t0 + min(0.035, d * 0.35), t0 + min(0.06, d * 0.5), t1]
        kv += [st - sc, st + overshoot * np.sign(sc if sc else 1) * 0.6, st, st + sl]
    kt = np.maximum.accumulate(np.asarray(kt) + np.arange(len(kt)) * 1e-6)
    st = np.interp(tt, kt, kv)
    st = smooth_track(st, 18.0)
    st = st + decl * tt
    # vibrato on vowels that ask for it (fades in over the vowel)
    if vib_cents > 0:
        w = np.zeros(len(tt))
        for nu in nuclei:
            v = nu.get("vib", 0.0)
            if v <= 0:
                continue
            d = max(0.02, nu["t1"] - nu["t0"])
            ph = np.clip((tt - nu["t0"]) / d, 0, 1)
            inside = (tt >= nu["t0"]) & (tt <= nu["t1"] + 0.03)
            w = np.where(inside, np.maximum(w, v * np.clip(ph * 1.6 - 0.2, 0, 1)), w)
        w = smooth_track(w, 12.0)
        st = st + (vib_cents / 100.0) * w * np.sin(2 * np.pi * vib_rate * tt)
    if jitter_cents > 0:
        j = rng.standard_normal(len(tt))
        j = smooth_track(j, 25.0)
        j = j / max(np.std(j), 1e-9)
        st = st + (jitter_cents / 100.0) * j
    return base_hz * 2.0 ** (st / 12.0)


# ----------------------------------------------------------------------------- resynthesis
def resynth(an, tau, f0_out, alpha=1.0, smile=0.0, tilt=0.0, breath=0.0, hicut=9000.0, locut=0.0,
            gain_track=None, force_voiced=None, soft_unvoiced=7.0):
    """tau: input time (s) for every output frame; f0_out: Hz per output frame (0 where unvoiced is
    wanted is applied automatically from the analysis voicing). gain_track: optional per-frame linear
    gain (envelopes for giggles / held vowels). force_voiced: optional bool mask (frames to voice even
    if eSpeak had a voiceless sound there, e.g. hummed 'mmm')."""
    fs = an["fs"]
    sp, ap, voiced = frames_at(an, tau)
    if force_voiced is not None:
        voiced = voiced | force_voiced
    f0 = np.where(voiced, f0_out, 0.0)
    sp = warp_envelope(sp, fs, alpha, smile=smile, tilt_db_oct=tilt, hicut=hicut, locut=locut)
    ap = breathy(ap, fs, breath)
    if alpha != 1.0:                           # aperiodicity bands move with the formants too
        K = ap.shape[1]
        f = np.linspace(0, fs / 2, K)
        ap = np.stack([np.interp(np.minimum(f / alpha, fs / 2), f, row) for row in ap])
    if soft_unvoiced:                          # soft 'lisp': hiss of s / ch / f / h bursts rounded off
        K = sp.shape[1]
        f = np.linspace(0, fs / 2, K)
        shelf = 10 ** (-soft_unvoiced * np.clip((f - 2500.0) / 5000.0, 0, 1) / 10)     # power
        sp = np.where(voiced[:, None], sp, sp * shelf[None, :])
    if gain_track is not None:
        sp = sp * (np.asarray(gain_track)[:, None] ** 2)
    y = pw.synthesize(np.ascontiguousarray(f0), np.ascontiguousarray(sp), np.ascontiguousarray(ap), fs, FP)
    return y
