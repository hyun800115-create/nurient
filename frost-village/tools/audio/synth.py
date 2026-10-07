"""Frost Village - procedural audio toolkit (numpy + scipy only).

Small DSP library shared by music.py / ambience.py / sfx.py:

* oscillators: sine, band-limited (polyBLEP) saw / square, triangle, FM
* envelopes: ADSR, exponential decay, smooth periodic random curves
* coloured noise (white / pink / brown, spectrally shaped -> perfectly periodic)
* RBJ biquads (static and block-wise time-varying), Butterworth helpers
* instruments: Karplus-Strong pluck (fractional-delay tuned), bass, mallet
  (marimba-ish), bells (celesta / glockenspiel / music box), ocarina-flute,
  detuned saw pad, brass, kick / clap / shaker / sleigh bells / woodblock
* effects: stereo chorus, band-split Freeverb-style reverb (polyphase combs,
  frequency dependent RT60), compressor, look-ahead limiter
* meters: BS.1770 integrated + max-momentary loudness, peak

Not run directly - see build_audio.py.  Requirements: numpy, scipy (and Pillow
for the preview image).  Everything is deterministic given the seeds.
"""
from __future__ import annotations

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d, uniform_filter1d

SR = 44100
TAU = 2.0 * np.pi

# ----------------------------------------------------------------------------
# basics
# ----------------------------------------------------------------------------
_NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def midi(name) -> float:
    """'C5' -> 72, 'Bb3' -> 58, 'F#4' -> 66; numbers pass through."""
    if isinstance(name, (int, float, np.integer, np.floating)):
        return float(name)
    off = _NOTE[name[0].upper()]
    i = 1
    while i < len(name) and name[i] in "#b":
        off += 1 if name[i] == "#" else -1
        i += 1
    return float(12 * (int(name[i:]) + 1) + off)


def mtof(m) -> float:
    return 440.0 * 2.0 ** ((midi(m) - 69.0) / 12.0)


def ns(sec: float) -> int:
    return int(round(sec * SR))


def tt(n: int) -> np.ndarray:
    return np.arange(n) / SR


def rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def db(x: float) -> float:
    return 10.0 ** (x / 20.0)


def todb(x: float) -> float:
    return 20.0 * np.log10(max(float(x), 1e-12))


def place(dst: np.ndarray, src: np.ndarray, start: int, gain: float = 1.0, wrap: bool = False):
    """Add src into dst (1-D or (2, n)) at sample index start (clipped or wrapped)."""
    n = dst.shape[-1]
    m = src.shape[-1]
    if wrap:
        idx = (start + np.arange(m)) % n
        if dst.ndim == 1:
            np.add.at(dst, idx, src * gain)
        else:
            for c in range(dst.shape[0]):
                s = src[c] if src.ndim == 2 else src
                np.add.at(dst[c], idx, s * gain)
        return
    a = max(start, 0)
    b = min(start + m, n)
    if b <= a:
        return
    if dst.ndim == 1:
        dst[a:b] += gain * src[a - start:b - start]
    else:
        if src.ndim == 1:
            dst[:, a:b] += gain * src[a - start:b - start]
        else:
            dst[:, a:b] += gain * src[:, a - start:b - start]


def pan2(x: np.ndarray, p: float = 0.0) -> np.ndarray:
    """Constant-power pan of a mono signal, p in [-1, 1] -> (2, n)."""
    th = (np.clip(p, -1, 1) + 1.0) * np.pi / 4.0
    return np.vstack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2.0)


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0) -> np.ndarray:
    y = x.copy()
    n = y.shape[-1]
    a = min(ns(fin), n)
    b = min(ns(fout), n)
    if a > 0:
        y[..., :a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b > 0:
        y[..., n - b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return y


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


# ----------------------------------------------------------------------------
# oscillators
# ----------------------------------------------------------------------------
def phase(freq, n: int, ph0: float = 0.0) -> np.ndarray:
    """Cumulative phase in cycles for a (possibly time-varying) frequency."""
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    ph = np.empty(n)
    ph[0] = 0.0
    if n > 1:
        np.cumsum(f[:-1], out=ph[1:])
    return ph0 + ph / SR


def sine(freq, n: int, ph0: float = 0.0) -> np.ndarray:
    return np.sin(TAU * phase(freq, n, ph0))


def _blep(p, dt):
    out = np.zeros_like(p)
    m = p < dt
    if np.any(m):
        t = p[m] / dt[m]
        out[m] = t + t - t * t - 1.0
    m = p > 1.0 - dt
    if np.any(m):
        t = (p[m] - 1.0) / dt[m]
        out[m] = t * t + t + t + 1.0
    return out


def saw(freq, n: int, ph0: float = 0.0) -> np.ndarray:
    p = phase(freq, n, ph0) % 1.0
    dt = np.broadcast_to(np.abs(np.asarray(freq, dtype=float)) / SR, (n,)).copy()
    dt = np.clip(dt, 1e-9, 0.5)
    return 2.0 * p - 1.0 - _blep(p, dt)


def square(freq, n: int, pw: float = 0.5, ph0: float = 0.0) -> np.ndarray:
    p = phase(freq, n, ph0) % 1.0
    dt = np.broadcast_to(np.abs(np.asarray(freq, dtype=float)) / SR, (n,)).copy()
    dt = np.clip(dt, 1e-9, 0.5)
    y = np.where(p < pw, 1.0, -1.0)
    y = y + _blep(p, dt) - _blep((p - pw) % 1.0, dt)
    return y - (2 * pw - 1)  # remove DC of asymmetric pulse


def tri(freq, n: int, ph0: float = 0.0) -> np.ndarray:
    p = phase(freq, n, ph0 + 0.25) % 1.0
    return 4.0 * np.abs(p - 0.5) - 1.0


def fm(freq, n: int, ratio: float, index, ph0: float = 0.0) -> np.ndarray:
    """2-operator FM: sin(2pi fc t + I(t) sin(2pi fm t))."""
    pc = phase(freq, n, ph0)
    pm = phase(np.asarray(freq) * ratio, n)
    return np.sin(TAU * pc + np.asarray(index) * np.sin(TAU * pm))


def partials(f0: float, n: int, spec, r: np.random.Generator | None = None, fmax: float = 9500.0):
    """Additive sum. spec = [(ratio, amp, tau_seconds), ...] with exp decays."""
    t = tt(n)
    y = np.zeros(n)
    for k, (ratio, amp, tau) in enumerate(spec):
        f = f0 * ratio
        if f >= fmax or f <= 0:
            continue
        ph = r.random() if r is not None else 0.0
        y += amp * np.sin(TAU * (f * t + ph)) * np.exp(-t / tau)
    return y


# ----------------------------------------------------------------------------
# envelopes
# ----------------------------------------------------------------------------
def adsr(gate: float, a: float = 0.005, d: float = 0.1, s: float = 0.7, r: float = 0.2) -> np.ndarray:
    """Envelope of length gate+r seconds. Linear-ish attack, exp decay, smooth release."""
    ng = max(ns(gate), 1)
    nr = max(ns(r), 1)
    t = tt(ng)
    a = max(a, 1e-4)
    att = np.sin(np.clip(t / a, 0, 1) * np.pi / 2) ** 1.5
    dec = s + (1 - s) * np.exp(-np.maximum(t - a, 0) / max(d / 3.0, 1e-4))
    e = np.where(t < a, att, dec)
    last = e[-1]
    x = np.linspace(0, 1, nr)
    rel = last * (1 - x) ** 2.5
    return np.concatenate([e, rel])


def expdec(n: int, tau: float, attack: float = 0.0015) -> np.ndarray:
    t = tt(n)
    e = np.exp(-t / tau)
    if attack > 0:
        e *= 1.0 - np.exp(-t / attack)
    return e


def periodic_curve(n: int, r: np.random.Generator, kmax: int = 8, slope: float = 1.0, kmin: int = 1) -> np.ndarray:
    """Smooth random curve that is exactly periodic over n samples, normalised to [0, 1]."""
    t = np.arange(n) / n
    y = np.zeros(n)
    for k in range(kmin, kmax + 1):
        y += (1.0 / k ** slope) * np.cos(TAU * (k * t + r.random()))
    y -= y.min()
    return y / max(y.max(), 1e-9)


# ----------------------------------------------------------------------------
# noise
# ----------------------------------------------------------------------------
def white(n: int, r: np.random.Generator) -> np.ndarray:
    return r.standard_normal(n)


def shaped_noise(n: int, r: np.random.Generator, gain_fn) -> np.ndarray:
    """White noise shaped in the frequency domain (periodic over n), unit RMS."""
    X = np.fft.rfft(r.standard_normal(n))
    f = np.fft.rfftfreq(n, 1.0 / SR)
    X *= gain_fn(np.maximum(f, 1.0))
    X[0] = 0
    y = np.fft.irfft(X, n)
    return y / max(np.sqrt(np.mean(y ** 2)), 1e-12)


def pink(n: int, r: np.random.Generator) -> np.ndarray:
    return shaped_noise(n, r, lambda f: 1.0 / np.sqrt(np.maximum(f, 20.0)))


def brown(n: int, r: np.random.Generator) -> np.ndarray:
    return shaped_noise(n, r, lambda f: 1.0 / np.maximum(f, 20.0))


def band_noise(n: int, r: np.random.Generator, fc: float, octaves: float = 1.0, tilt: float = 0.0) -> np.ndarray:
    """Periodic noise with a log-gaussian band around fc (width in octaves)."""
    def g(f):
        lo = np.log2(f / fc)
        return np.exp(-0.5 * (lo / (octaves / 2.0)) ** 2) * (f / fc) ** tilt
    return shaped_noise(n, r, g)


# ----------------------------------------------------------------------------
# filters
# ----------------------------------------------------------------------------
def biquad_coefs(kind: str, f0: float, q: float = 0.7071, gain_db: float = 0.0):
    f0 = float(np.clip(f0, 5.0, SR * 0.49))
    A = 10 ** (gain_db / 40.0)
    w0 = TAU * f0 / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == "lp":
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "hp":
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "bp":  # 0 dB peak gain
        b = [al, 0.0, -al]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "notch":
        b = [1, -2 * cw, 1]
        a = [1 + al, -2 * cw, 1 - al]
    elif kind == "peak":
        b = [1 + al * A, -2 * cw, 1 - al * A]
        a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == "ls":
        sa = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sa), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sa)]
        a = [(A + 1) + (A - 1) * cw + sa, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sa]
    elif kind == "hs":
        sa = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sa), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sa)]
        a = [(A + 1) - (A - 1) * cw + sa, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sa]
    else:
        raise ValueError(kind)
    b = np.array(b, dtype=float)
    a = np.array(a, dtype=float)
    return b / a[0], a / a[0]


def bq(x: np.ndarray, kind: str, f0: float, q: float = 0.7071, gain_db: float = 0.0) -> np.ndarray:
    b, a = biquad_coefs(kind, f0, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def lp(x, f, q=0.7071):
    return bq(x, "lp", f, q)


def hp(x, f, q=0.7071):
    return bq(x, "hp", f, q)


def bp(x, f, q=1.0):
    return bq(x, "bp", f, q)


def peq(x, f, gain_db, q=1.0):
    return bq(x, "peak", f, q, gain_db)


def butter(x, kind: str, f, order: int = 4):
    """Butterworth via SOS. kind in lowpass/highpass/bandpass; f scalar or (lo, hi)."""
    sos = signal.butter(order, f, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def tv_filter(x: np.ndarray, kind: str, f_curve, q=0.7071, block: int = 64) -> np.ndarray:
    """Block-wise time-varying biquad (coefficients updated every `block` samples)."""
    n = len(x)
    fc = np.broadcast_to(np.asarray(f_curve, dtype=float), (n,))
    qc = np.broadcast_to(np.asarray(q, dtype=float), (n,))
    y = np.empty(n)
    zi = np.zeros(2)
    for i in range(0, n, block):
        j = min(i + block, n)
        m = (i + j) // 2
        b, a = biquad_coefs(kind, fc[m], qc[m])
        y[i:j], zi = signal.lfilter(b, a, x[i:j], zi=zi)
    return y


def onepole_lp(x, fc):
    a = np.exp(-TAU * fc / SR)
    return signal.lfilter([1 - a], [1, -a], x, axis=-1)


def dc_block(x, fc: float = 20.0):
    return butter(x, "highpass", fc, order=2)


# ----------------------------------------------------------------------------
# instruments
# ----------------------------------------------------------------------------
def ks_pluck(freq: float, dur: float, t60: float = 1.5, bright: float = 0.5, pick: float = 0.15,
             excite_lp: float = 5000.0, r: np.random.Generator | None = None) -> np.ndarray:
    """Karplus-Strong string with 3-tap loop lowpass and allpass fractional-delay tuning."""
    r = r or rng(1)
    n = max(ns(dur), 16)
    period = SR / freq
    N = int(np.floor(period - 1.0 - 0.1))
    frac = period - 1.0 - N
    C = (1 - frac) / (1 + frac)
    g = 10 ** (-3.0 / (t60 * freq))
    k = 0.25 - 0.22 * np.clip(bright, 0, 1)  # loop filter [k, 1-2k, k] (delay 1)
    h = np.array([k, 1 - 2 * k, k])
    poly = np.convolve(h, [C, 1.0])
    a = np.zeros(N + 4)
    a[0] = 1.0
    a[1] += C
    a[N:N + 4] -= g * poly
    b = np.array([1.0, C])
    P = max(int(round(period)), 2)
    e = r.uniform(-1, 1, P)
    e = lp(e, excite_lp, 0.6)
    pk = max(int(round(pick * P)), 1)
    e[pk:] -= 0.8 * e[:-pk].copy()
    e -= e.mean()
    x = np.zeros(n)
    x[:P] = e
    y = signal.lfilter(b, a, x)
    return y / max(np.max(np.abs(y)), 1e-9)


def release_at(y: np.ndarray, gate: float, rel: float) -> np.ndarray:
    """Fade a ringing note out starting at `gate` over `rel` seconds (truncates)."""
    g = ns(gate)
    rn = max(ns(rel), 1)
    if g >= len(y):
        return y
    out = y[:g + rn].copy()
    m = len(out) - g
    out[g:] *= (1 - np.linspace(0, 1, m)) ** 2
    return out


def pluck(f, dur, vel=1.0, r=None, t60=1.6, bright=0.55, body=True, gate=None, pick=0.18):
    """Nylon/harp-ish KS pluck with a little body resonance."""
    y = ks_pluck(f, dur, t60=t60, bright=bright, pick=pick, excite_lp=3500 + 2500 * bright, r=r)
    if body:
        y = peq(y, 220, 3.0, 1.0)
        y = peq(y, 2800, -3.0, 0.8)
        y = lp(y, 6000)
    if gate is not None:
        y = release_at(y, gate, 0.08)
    return y * vel


def bass(f, dur, vel=1.0, r=None):
    """Soft upright-pizz bass: KS + sine body, lowpassed."""
    ring = dur + 0.12
    k = ks_pluck(f, ring, t60=1.1, bright=0.15, pick=0.22, excite_lp=900, r=r)
    n = len(k)
    t = tt(n)
    body = np.sin(TAU * f * t) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.55)
    y = 0.6 * k + 0.75 * body
    y = lp(y, 1100, 0.6)
    y = release_at(y, dur, 0.09)
    return y * vel


def mallet(f, dur, vel=1.0, r=None, hard=0.6, ring=1.0):
    """Warm marimba-like mallet (bar modes 1, 3.93, 9.2) + mallet click."""
    r = r or rng(2)
    tau = 0.5 * (440.0 / f) ** 0.4 * ring
    n = ns(min(4.5 * tau, dur + 0.5) + 0.05)
    t = tt(n)
    y = np.sin(TAU * f * t) * np.exp(-t / tau)
    if 3.93 * f < 9000:
        y += 0.28 * hard * np.sin(TAU * 3.93 * f * t) * np.exp(-t / (tau * 0.15))
    if 9.2 * f < 9000:
        y += 0.08 * hard * np.sin(TAU * 9.2 * f * t) * np.exp(-t / (tau * 0.05))
    y *= 1 - np.exp(-t / 0.0012)
    clk = lp(r.uniform(-1, 1, n), 2400, 0.7) * np.exp(-t / 0.003) * 0.25 * hard
    y = y + clk
    if dur + 0.45 < len(y) / SR:
        y = release_at(y, dur + 0.3, 0.15)
    return y * vel


def bell(f, dur, vel=1.0, r=None, kind="celesta", ring=1.0):
    """Bell family: celesta (FM, warm), glock (inharmonic, sparkly), musicbox (tine)."""
    r = r or rng(3)
    if kind == "celesta":
        tau = 1.1 * (880.0 / f) ** 0.5 * ring
        n = ns(min(4 * tau, dur + 1.2))
        t = tt(n)
        idx = 1.6 * np.exp(-t / 0.05) + 0.25
        y = fm(f, n, 1.0, idx) * np.exp(-t / tau)
        y += 0.10 * np.sin(TAU * 4.0 * f * t) * np.exp(-t / 0.06) if 4 * f < 9000 else 0
    elif kind == "glock":
        tau = 0.9 * (1046.0 / f) ** 0.4 * ring
        n = ns(min(4 * tau, dur + 1.5))
        y = partials(f, n, [(1.0, 1.0, tau), (2.76, 0.22, tau * 0.3), (5.40, 0.09, tau * 0.12),
                            (8.93, 0.03, tau * 0.05)], r, fmax=9000)
        t = tt(n)
    elif kind == "musicbox":
        tau = 0.8 * (880.0 / f) ** 0.3 * ring
        n = ns(min(4 * tau, dur + 1.0))
        y = partials(f, n, [(1.0, 1.0, tau), (2.0, 0.10, tau * 0.4), (3.0, 0.05, tau * 0.2),
                            (5.98, 0.05, 0.04)], r, fmax=9000)
        t = tt(n)
    else:
        raise ValueError(kind)
    y = y * (1 - np.exp(-t / 0.0008))
    return y * vel


def flute(f, dur, vel=1.0, r=None, vib=0.0045, breath=0.06, att=0.045, rel=0.13, scoop=-0.012):
    """Warm ocarina / soft flute: few harmonics, delayed vibrato, breath noise."""
    r = r or rng(4)
    n = ns(dur + rel)
    t = tt(n)
    vib_env = smoothstep((t - 0.18) / 0.35) if dur > 0.35 else np.zeros(n)
    fi = f * (1 + scoop * np.exp(-t / 0.035) + vib * vib_env * np.sin(TAU * 5.1 * t + r.random() * TAU))
    ph = TAU * phase(fi, n, r.random())
    y = np.sin(ph) + 0.16 * np.sin(2 * ph) + 0.05 * np.sin(3 * ph) + 0.015 * np.sin(4 * ph)
    env = adsr(dur, att, 0.2, 0.82, rel)[:n]
    env = np.pad(env, (0, n - len(env)))
    nz = bp(r.standard_normal(n), min(2.2 * f, 3500), 1.4)
    br = breath * (0.4 + 2.0 * np.exp(-t / 0.05))
    y = y * env + nz * env * br
    return lp(y, 4200, 0.6) * vel


def pad_chord(freqs, dur, vel=1.0, r=None, att=0.6, rel=1.2, cutoff=1300.0, detune=7.0):
    """Soft detuned saw+triangle pad for a whole chord (mono, chorus it on the bus)."""
    r = r or rng(5)
    n = ns(dur + rel)
    y = np.zeros(n)
    for f in freqs:
        for c in (-detune, 0.0, detune):
            y += 0.33 * saw(f * 2 ** (c / 1200.0), n, r.random())
        y += 0.45 * tri(f, n, r.random())
    y = lp(y, cutoff, 0.55)
    y = lp(y, cutoff * 1.6, 0.5)
    env = adsr(dur, att, 0.4, 0.85, rel)[:n]
    return y * env * vel / max(len(freqs), 1)


def brass(f, dur, vel=1.0, r=None, att=0.03, rel=0.18, bright=1.0):
    """Synth brass for fanfares: detuned saws, filter envelope, late vibrato."""
    r = r or rng(6)
    n = ns(dur + rel)
    t = tt(n)
    vib = 1 + 0.004 * smoothstep((t - 0.25) / 0.3) * np.sin(TAU * 5.5 * t)
    y = np.zeros(n)
    for c in (-6, 0, 6):
        y += saw(f * vib * 2 ** (c / 1200), n, r.random())
    y /= 3
    env = adsr(dur, att, 0.25, 0.8, rel)[:n]
    env = np.pad(env, (0, n - len(env)))
    fc = 600 + bright * (2200 * np.exp(-t / 0.18) + 1400 * env)
    y = tv_filter(y, "lp", fc, 0.9)
    return y * env * vel


def kick(vel=1.0, r=None, f_end=48.0, f_start=150.0, tau=0.22):
    r = r or rng(7)
    n = ns(0.5)
    t = tt(n)
    f = f_end + (f_start - f_end) * np.exp(-t / 0.032)
    y = np.sin(TAU * phase(f, n)) * np.exp(-t / tau) * (1 - np.exp(-t / 0.0008))
    clk = lp(r.uniform(-1, 1, n), 2500) * np.exp(-t / 0.0025) * 0.25
    return lp(y + clk, 4000) * vel


def clap(vel=1.0, r=None, fc=1500.0, tone=330.0):
    """Soft 'snap/clap' backbeat (two micro bursts + tail), warm not splashy."""
    r = r or rng(8)
    n = ns(0.25)
    t = tt(n)
    nz = r.standard_normal(n)
    e = np.exp(-t / 0.045)
    for d in (0.0, 0.009):
        m = t >= d
        e[m] += 1.5 * np.exp(-(t[m] - d) / 0.004)
    y = bp(nz, fc, 0.9) * e
    y += 0.35 * np.sin(TAU * tone * t) * np.exp(-t / 0.03)
    return lp(y, 6500) * vel * 0.6


def shaker(vel=1.0, r=None):
    r = r or rng(9)
    n = ns(0.13)
    t = tt(n)
    y = butter(r.standard_normal(n), "bandpass", (3200, 7200), 2)
    e = (1 - np.exp(-t / 0.007)) * np.exp(-t / 0.032)
    return y * e * vel * 0.8


def sleigh(vel=1.0, r=None):
    """Tiny jingle-bell cluster (kept under 8 kHz)."""
    r = r or rng(10)
    n = ns(0.4)
    t = tt(n)
    y = np.zeros(n)
    for _ in range(8):
        f = r.uniform(2400, 6500)
        d = r.uniform(0, 0.014)
        tau = r.uniform(0.04, 0.11)
        m = t >= d
        y[m] += r.uniform(0.3, 1.0) * np.sin(TAU * f * (t[m] - d)) * np.exp(-(t[m] - d) / tau)
    nz = butter(r.standard_normal(n), "bandpass", (3500, 7500), 2) * np.exp(-t / 0.03) * 0.6
    return lp((y / 4 + nz), 7500) * vel * 0.6


def woodblock(f=1100.0, vel=1.0, r=None):
    r = r or rng(11)
    n = ns(0.12)
    t = tt(n)
    y = np.sin(TAU * f * t) * np.exp(-t / 0.035) + 0.4 * np.sin(TAU * f * 1.58 * t) * np.exp(-t / 0.015)
    y += lp(r.uniform(-1, 1, n), 3000) * np.exp(-t / 0.002) * 0.4
    return y * vel


# ----------------------------------------------------------------------------
# effects
# ----------------------------------------------------------------------------
def chorus(x: np.ndarray, rate: float = 0.25, depth_ms: float = 2.5, base_ms: float = 14.0,
           mix: float = 0.5, period_n: int | None = None, r=None) -> np.ndarray:
    """Mono -> stereo chorus (2 modulated taps per side). If period_n is given the LFO
    rates are snapped to whole cycles over period_n so loops stay seamless."""
    r = r or rng(12)
    n = len(x)
    idx = np.arange(n, dtype=float)
    out = np.zeros((2, n))

    def snap(rt):
        if period_n:
            k = max(1, int(round(rt * period_n / SR)))
            return k * SR / period_n
        return rt

    for ch in range(2):
        acc = np.zeros(n)
        for v in range(2):
            rt = snap(rate * (1.0 + 0.37 * v + 0.11 * ch))
            ph = r.random() * TAU
            d = (base_ms + 4.0 * v + depth_ms * np.sin(TAU * rt * idx / SR + ph)) * SR / 1000.0
            acc += np.interp(idx - d, idx, x, left=0.0)
        out[ch] = (1 - mix) * x + mix * 0.5 * acc
    return out


_COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617]
_AP = [556, 441, 341, 225]


def _poly_rec(xp: np.ndarray, K: int, D: int, g: float) -> np.ndarray:
    """v[n] = x[n] + g*v[n-D] computed as D independent 1st-order recursions."""
    sos = np.array([[1.0, 0.0, 0.0, 1.0, -g, 0.0]])
    Xt = np.ascontiguousarray(xp.reshape(K, D).T)
    return signal.sosfilt(sos, Xt, axis=-1).T.reshape(-1)


def _comb_wet(x: np.ndarray, D: int, g: float, n_out: int) -> np.ndarray:
    """Feedback comb y[n] = x[n] + g*y[n-D]; returns g*y[n-D] (polyphase lfilter)."""
    K = -(-n_out // D)
    xp = np.zeros(K * D)
    m = min(len(x), K * D)
    xp[:m] = x[:m]
    Y = _poly_rec(xp, K, D, g)
    out = np.zeros(n_out)
    out[D:] = g * Y[:n_out - D]
    return out


def _allpass(x: np.ndarray, D: int, g: float) -> np.ndarray:
    n = len(x)
    K = -(-n // D)
    xp = np.zeros(K * D)
    xp[:n] = x
    V = _poly_rec(xp, K, D, g)[:n]
    vd = np.zeros(n)
    vd[D:] = V[:-D]
    return vd - g * V


def reverb(x: np.ndarray, rt60: float = 1.8, room: float = 1.0, band_rt=(1.15, 1.0, 0.45),
           xover=(450.0, 3200.0), predelay: float = 0.018, tail: float = 3.0,
           lo_cut: float = 140.0, hi_cut: float = 6500.0, er: float = 0.35, spread: int = 23) -> np.ndarray:
    """Band-split Freeverb-style reverb. x mono or (2, n). Returns WET stereo (2, n + tail).
    Each band has its own RT60 (low/mid/high multipliers in band_rt) -> warm damping."""
    X = np.atleast_2d(x)
    mono = X.mean(axis=0)
    n_out = len(mono) + ns(tail)
    pd = ns(predelay)
    src = np.zeros(n_out)
    src[pd:pd + len(mono)] = mono[:n_out - pd]
    src = hp(src, lo_cut)
    low = butter(src, "lowpass", xover[0], 2)
    high = butter(src, "highpass", xover[1], 2)
    mid = src - low - high
    bands = (low, mid, high)
    wet = np.zeros((2, n_out))
    for ch in range(2):
        acc = np.zeros(n_out)
        for Dn in _COMB:
            D = int(Dn * room) + (spread if ch else 0)
            for b, mult in zip(bands, band_rt):
                g = 10 ** (-3.0 * D / (rt60 * mult * SR))
                acc += _comb_wet(b, D, g, n_out)
        acc /= len(_COMB)
        for Dn in _AP:
            acc = _allpass(acc, int(Dn * room) + (spread if ch else 0), 0.5)
        wet[ch] = acc
    if er > 0:  # a few early reflections, alternating sides
        taps = [(0.0071, 0.8, 0), (0.0113, 0.7, 1), (0.0173, 0.6, 0), (0.0229, 0.5, 1),
                (0.0311, 0.4, 0), (0.0379, 0.35, 1), (0.0457, 0.28, 0), (0.0523, 0.22, 1)]
        for dt, gg, ch in taps:
            d = pd + ns(dt)
            wet[ch, d:d + len(mono)] += er * gg * mono[:max(0, n_out - d)] * 0.5
    wet = butter(wet, "lowpass", hi_cut, 2)
    return wet * 0.9


def compress(x: np.ndarray, thr_db: float = -18.0, ratio: float = 2.0, knee: float = 6.0,
             att: float = 0.012, rel: float = 0.2, circular: bool = False) -> np.ndarray:
    """Gentle feed-forward RMS compressor (linked stereo)."""
    X = np.atleast_2d(x)
    n = X.shape[-1]
    if circular:
        X3 = np.concatenate([X, X, X], axis=-1)
        return compress(X3, thr_db, ratio, knee, att, rel, False)[..., n:2 * n].reshape(x.shape)
    p = np.mean(X ** 2, axis=0)
    a = np.exp(-1.0 / (att * SR))
    lvl = signal.lfilter([1 - a], [1, -a], p)
    L = 10 * np.log10(np.maximum(lvl, 1e-12))
    over = L - thr_db
    gr = np.where(over <= -knee / 2, 0.0,
                  np.where(over >= knee / 2, over * (1 - 1 / ratio),
                           (1 - 1 / ratio) * (over + knee / 2) ** 2 / (2 * knee)))
    b = np.exp(-1.0 / (rel * SR))
    gr = signal.lfilter([1 - b], [1, -b], gr)
    return (X * 10 ** (-gr / 20)).reshape(x.shape)


def limiter(x: np.ndarray, ceiling_db: float = -1.5, release: float = 0.06, wrap: bool = False) -> np.ndarray:
    """Look-ahead peak limiter: min-hold + triangular smoothing guarantees |y| <= ceiling."""
    X = np.atleast_2d(x).astype(float)
    c = db(ceiling_db)
    pk = np.max(np.abs(X), axis=0)
    g = np.minimum(1.0, c / np.maximum(pk, 1e-12))
    R = max(ns(release), 3)
    mode = "wrap" if wrap else "nearest"
    g = minimum_filter1d(g, size=2 * R + 1, mode=mode)
    h = max(R // 2, 1)
    g = uniform_filter1d(g, size=h, mode=mode)
    g = uniform_filter1d(g, size=h, mode=mode)
    y = np.clip(X * g, -c, c)
    return y.reshape(x.shape)


# ----------------------------------------------------------------------------
# loudness
# ----------------------------------------------------------------------------
def k_weight(x):
    b1, a1 = biquad_coefs("hs", 1681.974450955533, 0.7071752369554196, 3.999843853973347)
    b2, a2 = biquad_coefs("hp", 38.13547087602444, 0.5003270373238773)
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=-1), axis=-1)


def _block_power(x, win=0.4, hop=0.1):
    X = np.atleast_2d(x)
    K = k_weight(X)
    w = ns(win)
    h = ns(hop)
    n = K.shape[-1]
    if n < w:
        K = np.pad(K, ((0, 0), (0, w - n)))
        n = w
    cs = np.concatenate([np.zeros((K.shape[0], 1)), np.cumsum(K ** 2, axis=-1)], axis=-1)
    starts = np.arange(0, n - w + 1, h)
    z = (cs[:, starts + w] - cs[:, starts]) / w
    return z.sum(axis=0)


def lufs(x) -> float:
    """BS.1770-4 integrated loudness (gated)."""
    z = _block_power(x)
    l = -0.691 + 10 * np.log10(np.maximum(z, 1e-12))
    z1 = z[l > -70]
    if len(z1) == 0:
        return -70.0
    lr = -0.691 + 10 * np.log10(z1.mean()) - 10
    z2 = z[(l > -70) & (l > lr)]
    return float(-0.691 + 10 * np.log10(max(z2.mean(), 1e-12)))


def lufs_momentary_max(x) -> float:
    z = _block_power(x, 0.4, 0.01)
    return float(-0.691 + 10 * np.log10(max(z.max(), 1e-12)))


def peak_db(x) -> float:
    return todb(np.max(np.abs(x)))


# ----------------------------------------------------------------------------
# io / finishing
# ----------------------------------------------------------------------------
def write_wav(path, x: np.ndarray):
    X = np.atleast_2d(x)
    data = X.T.astype(np.float32) if X.shape[0] > 1 else X[0].astype(np.float32)
    wavfile.write(str(path), SR, data)


def read_wav(path) -> np.ndarray:
    sr, d = wavfile.read(str(path))
    d = d.astype(np.float64)
    if d.ndim == 2:
        d = d.T
    return d


def finish_sfx(y: np.ndarray, peak: float = -2.0, thresh_db: float = -54.0, fin: float = 0.0015,
               fout: float = 0.02) -> np.ndarray:
    """DC-block, trim leading/trailing silence, short fades, peak-normalise (mono)."""
    y = dc_block(y, 18.0)
    a = np.abs(y)
    th = a.max() * db(thresh_db)
    idx = np.nonzero(a > th)[0]
    if len(idx):
        s = max(idx[0] - ns(0.002), 0)
        e = min(idx[-1] + ns(0.01), len(y))
        y = y[s:e]
    y = y - np.mean(y) * 0  # (mean of short sfx is ~0 after dc_block; keep shape)
    y = fade(y, fin, min(fout, len(y) / SR / 3))
    return y / max(np.max(np.abs(y)), 1e-12) * db(peak)
