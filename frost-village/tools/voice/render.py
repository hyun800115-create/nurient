"""눈꽃말 voice tools - render one clip (plan x voice) to a finished mono 44.1 kHz array (library).

    y = render_clip(plan, voice_name)      # float64, peak-normalised -1.5 dBFS, trimmed + faded

Pipeline: eSpeak NG articulation (Finnish table, monotone, rate 190, cached per phoneme string)
-> WORLD analysis (cached) -> new timing (voice speed, snappy consonants, plan vowel lengths)
-> designed melody (prosody plan x voice range over the voice base pitch, scoops, vibrato / tremor,
jitter) -> envelope warp (alpha), smile, tilt, breathiness -> WORLD synthesis at 22.05 kHz ->
2x polyphase upsampling -> high-pass, gentle compression, tiny snowy room -> trim / fades.
Deterministic: the only randomness (jitter) is seeded from (voice, clip id).
"""
from __future__ import annotations

import hashlib
import os
import sys
import zlib

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "audio"))
import espeak as E  # noqa: E402
import vocoder as V  # noqa: E402
from voices import VOICES  # noqa: E402

import synth as S  # noqa: E402  (tools/audio toolkit, imported read-only)

CACHE = os.path.join(HERE, "_cache")
ES_RATE = 190
ES_VOICE = "fi"
VOWEL_CH = set("aeiouyY&@")
GLIDE_CH = {"I", "U"}
STOPS = {"p", "b", "t", "d", "k", "g", "tS"}
FRICS = {"f", "v", "s", "S"}
_mem = {}


def _ph(p: str) -> str:
    return p.strip("',:")


def is_vowel(p: str) -> bool:
    q = _ph(p)
    return bool(q) and q[0] in VOWEL_CH


def articulation(es: str):
    """eSpeak render + WORLD analysis of a phoneme string (memory + disk cache)."""
    key = hashlib.sha1(f"{ES_VOICE}|{ES_RATE}|{es}|v2-fresh-process".encode()).hexdigest()[:16]
    if key in _mem:
        return _mem[key]
    path = os.path.join(CACHE, "artic", key + ".npz")
    hit = None
    if os.path.exists(path):
        try:
            z = np.load(path, allow_pickle=False)
            an = {"f0": z["f0"], "t": z["t"], "sp": z["sp"], "ap": z["ap"], "fs": int(z["fs"]), "n": int(z["n"])}
            ev = [(float(t), str(p)) for t, p in zip(z["ev_t"], z["ev_p"])]
            hit = True
        except Exception:                             # half-written by a crashed run: redo it
            hit = None
    if not hit:
        x, ev = E.render(es, rate=ES_RATE, voice=ES_VOICE)
        if len(x) == 0:
            raise RuntimeError(f"eSpeak rendered nothing for {es!r}")
        an = V.analyse(x, E.SR_ES)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = f"{path}.{os.getpid()}.tmp"
        with open(tmp, "wb") as fh:                   # parallel workers: write aside, then rename atomically
            np.savez_compressed(fh, f0=an["f0"], t=an["t"], sp=an["sp"].astype(np.float64), ap=an["ap"],
                                fs=an["fs"], n=an["n"], ev_t=np.array([t for t, _ in ev]),
                                ev_p=np.array([p for _, p in ev]))
        os.replace(tmp, path)
    _mem[key] = (an, ev)
    return an, ev


def segments(an, ev):
    """[(t0, t1, phoneme)] covering the analysed signal; glides I/U fold into the previous vowel."""
    T = an["n"] / an["fs"]
    segs = []
    for i, (t, p) in enumerate(ev):
        t1 = ev[i + 1][0] if i + 1 < len(ev) else T
        if t1 <= t:
            continue
        if _ph(p) in GLIDE_CH and segs and is_vowel(segs[-1][2]):
            a, _, q = segs[-1]
            segs[-1] = (a, t1, q)
            continue
        segs.append((t, t1, p))
    return segs


def render_clip(plan: dict, voice: str, seed_extra: str = "") -> np.ndarray:
    v = VOICES[voice]
    an, ev = articulation(plan["es"])
    segs = segments(an, ev)
    speed = v["speed"] * plan.get("rate", 1.0)
    nspec = plan["nuclei"]
    # ---- timing: walk the phonemes, scale each, remember where the vowels land
    ain, aout = [0.0], [0.0]
    nuc = []
    gk = []                                               # (t_out0, t_out1, gain, kind) per segment
    k = 0
    lead = segs[0][0] if segs else 0.0
    ain[0] = max(0.0, lead - 0.01)                       # drop eSpeak's leading silence
    last_sound = max((i for i, s in enumerate(segs) if not _ph(s[2]).startswith("_")), default=-1)
    for i, (t0, t1, p) in enumerate(segs):
        q = _ph(p)
        d = t1 - t0
        if q.startswith("_"):
            f, g = 0.15, 0.0                              # trailing pauses: almost gone
        elif is_vowel(p):
            spec = nspec[min(k, len(nspec) - 1)]
            f, g = spec.get("dur", 1.0), spec.get("gain", 1.0)
        elif q == "h":
            f, g = plan.get("h_len", 1.0), plan.get("h_gain", 0.55)
        elif q == "r":
            f, g = 1.0, 0.95                              # keep the roll
        elif q in STOPS:
            g = 0.08 if i == last_sound else (0.38 if q == "tS" else 0.5)       # final stops unreleased (ㄱ ㅂ)
            f = plan.get("cons", 0.8)
        elif q in FRICS:
            f, g = plan.get("cons", 0.8), (0.45 if q in ("s", "S") else 0.62)
        else:
            f, g = plan.get("cons", 0.8), 1.0             # nasals, l, glides: part of the tune
        f /= speed
        o0 = aout[-1]
        ain.append(t1)
        aout.append(o0 + d * f)
        gk.append((o0, aout[-1], g, "v" if is_vowel(p) else q))
        if is_vowel(p):
            spec = nspec[min(k, len(nspec) - 1)]
            nuc.append({"t0": o0, "t1": aout[-1], "st": spec["st"] * v["range"], "slope": spec["slope"] * v["range"],
                        "vib": max(spec.get("vib", 0.0), v["vib"][2]), "gain": spec.get("gain", 1.0),
                        **({"scoop": spec["scoop"]} if "scoop" in spec else {})})
            k += 1
    T = aout[-1]
    n_out = int(np.ceil(T * 1000.0 / V.FP)) + 1
    tt = np.arange(n_out) * V.FP / 1000.0
    tau = np.interp(tt, aout, ain)
    seed = zlib.crc32(f"{voice}|{plan['id']}|{seed_extra}".encode())
    rng = np.random.default_rng(seed)
    vib_c = plan.get("vib_cents", v["vib"][0])
    f0 = V.melody(tt, nuc, rng, v["f0"], vib_cents=vib_c, vib_rate=v["vib"][1], jitter_cents=v["jitter"],
                  decl=-0.8)
    # ---- level track: syllable gains, softer stop bursts / fricatives, a release on the last sound
    kt, kv = [], []
    last_voiced = max((j for j, s in enumerate(gk) if s[3] not in STOPS and s[2] > 0), default=-1)
    for j, (a, b, g, kind) in enumerate(gk):
        if j == last_voiced:                              # eSpeak stops the last vowel while it is still loud
            kt += [a, a + 0.5 * (b - a), b]
            kv += [g, g, g * 0.22]
        else:
            kt += [a + 0.002, b - 0.002]
            kv += [g, g]
    if kt:                                                # soft 12 ms attack: vowel-first words (앗, 얍, 옴뽁)
        kt, kv = [0.0, 0.012] + [max(0.0121, t_) for t_ in kt[1:]], [0.0, kv[0]] + kv[1:]
    kt = np.maximum.accumulate(np.array(kt) + np.arange(len(kt)) * 1e-6)
    gain = V.smooth_track(np.interp(tt, kt, kv), 45.0)
    gain = np.clip(gain, 2e-3, None)                     # WORLD takes log(sp): never exactly 0
    y = V.resynth(an, tau, f0, alpha=v["alpha"], smile=v["smile"], tilt=v["tilt"],
                  breath=min(0.9, v["breath"] + plan.get("breath", 0.0)), hicut=v["hicut"], gain_track=gain)
    nf = min(len(y) // 4, int(0.02 * an["fs"]))           # dry fade: no click where the sound stops
    if nf > 0:
        y[-nf:] *= np.linspace(1.0, 0.0, nf) ** 2
    return post(y, an["fs"], v)


def post(y, fs: int, v: dict) -> np.ndarray:
    from scipy.signal import resample_poly
    y = np.asarray(y, dtype=np.float64)
    if fs != S.SR:
        g = np.gcd(S.SR, fs)
        y = resample_poly(y, S.SR // g, fs // g)
    y = S.hp(y, v["locut"], order=2)
    y = S.lp(y, min(v["hicut"] + 1800.0, 11000.0), order=1)
    y = y / max(S.peak(y), 1e-9)
    y = S.compress(y, thr_db=-16.0, ratio=2.2, tau=0.025, makeup_db=0.0)
    pad = np.concatenate((y, np.zeros(S.n_of(0.12))))
    wet = S.reverb(pad, rt60=0.32, hf_rt60=0.16, predelay=0.006, size=0.38, lo_cut=200.0, hi_cut=5200.0)
    y = pad + 0.07 * wet[0]
    y = S.trim_silence(y, -52.0, 3.0)
    dur = len(y) / S.SR
    y = S.fade(y, min(0.003, dur / 6), min(0.03, dur / 4))
    return y / max(S.peak(y), 1e-12) * S.undb(-1.5)
