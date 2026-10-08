"""Frost Village - audio QA for assets/audio5 (CONTRACT_V7 section Z, living sea + Sunny Beach) + human previews.

Run:  python3 tools/audio/check_audio5.py [--no-png] [--no-demo] [--no-browser]   (exit 1 on any FAIL)
Checks
  * every section Z key (+ the polish extras: wash / hand-splash / damp-step variants, sfx_beach_kids_1..4) is in
    assets/audio5/manifest.json with files [.ogg, .mp3] that exist and decode at 44.1 kHz (music stereo; ambience
    + sfx mono), kind / loop / volume sane; audioGroups exactly as GROUPS_WANT (hand splashes only in
    sfx_splash_beach, dry steps only in sfx_sand_step, damp ones in sfx_sand_step_wet, ...); no key or group
    collides with any other assets/audio* fragment (they merge with Object.assign) - including a group name equal
    to another fragment's KEY, which would hijack Audio.play(key) (e.g. a group called 'sfx_splash' would replace
    the v1 fish splash);
  * per file: duration (bgm_beach 45-90 s, amb_sea_waves 40-60 s as the contract says), sample peak <= -1 dBFS,
    TRUE peak <= -1 dBTP, integrated + max momentary LUFS (ffmpeg ebur128), DC offset; sfx: no leading silence
    (<= 4 ms), faded tail; effective level (file level + 20 log10 volume) within 1 dB of TARGET + headroom;
    phone-speaker loss (max momentary loudness lost through a 600 Hz 4th-order high-pass) <= 4 dB;
    dry sand steps over within 120 ms (< 5 % of the energy after it: running steps are 0.225 s apart);
  * tuning of the pitched sounds (strongest partial in a window: hotel bell C7, ice-cream chime's last bell F6,
    beach ball F5; lifeguard whistle F7 = spectral centroid of the trilled tone) and cue onsets (wave-crash
    impacts, ball bounces) near their manifest cues; the whistle's pea trill depth;
  * swell sync of amb_sea_waves / amb_beach (Water.js shore swell, 6.0 s): swellPeriod, swellWaves = loop /
    swellPeriod, cues.waterline on the swellPhase grid, and the measured near-wave surges (loudest 400 ms per swell
    period; amb_beach in the 2.5-8 kHz foam band, where its low near surf stands out) at their waterline cues;
  * loops: decoded .ogg length == rendered loop length, .ogg end padding == 0, manifest loopSamples / duration,
    click detector at the wrap (check_audio.loop_metrics: hf_ratio / d2_ratio < 1) for .ogg and .mp3;
  * sea realism metrics for amb_sea_waves (and the old audio/amb_sea for comparison): momentary-loudness range,
    per-wave size spread, and the strongest circular self-similarity of the 16-band spectral envelope at lags of
    3 s .. (loop - 3 s) - must stay < 0.6 (the old amb_sea, two near-identical halves, scores 0.63). The loudness
    curve's own self-similarity is reported too: it is high at the 6 s swell period on purpose;
  * headless Chromium (Playwright, check_audio2.chromium_decode): decodeAudioData of every loop must return exactly
    loopSamples frames for the .ogg (Chromium ignores the Vorbis end-trim) and the wrap must not jump; .mp3 lengths
    reported;
  * payload of assets/audio5 (files + manifest) <= 3,500,000 bytes; bgm_beach plays at the same effective loudness
    as bgm_village.
Writes docs/previews/audio5_report.txt, audio5_waveforms.png (waveform of every key, spectrograms of the loops and
of every one-shot) and audio5_demo.mp3 (a 64 s 'village sea -> beach day -> hotel pool -> sunset' soundscape mixed
from the delivered files at their manifest volumes, over the v1-v6 sounds).
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
import numpy as np  # noqa: E402

import check_audio2 as C2  # noqa: E402
import ffmpeg_tools as F  # noqa: E402
import synth as S  # noqa: E402
from check_audio import loop_metrics  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
AUD5 = os.path.join(ASSETS, "audio5")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.path.join(HERE, "_cache", "audio5")

# CONTRACT_V7 section Z, written out independently of build_audio5.py on purpose.
CONTRACT = {
    "music": ["bgm_beach"],
    "ambience": ["amb_sea_waves", "amb_beach"],
    "sfx": ["sfx_wave_crash_1", "sfx_wave_crash_2", "sfx_wave_crash_3", "sfx_wave_wash", "sfx_splash_1",
            "sfx_splash_2", "sfx_splash_3", "sfx_lifeguard_whistle", "sfx_icecream_bell", "sfx_beachball_bounce",
            "sfx_hotel_bell", "sfx_sand_step_1", "sfx_sand_step_2", "sfx_sand_step_3", "sfx_sand_step_4",
            "sfx_pool_splash"],
}
EXTRA_KEYS = {"sfx_wave_wash_2", "sfx_wave_wash_3", "sfx_splash_1b", "sfx_splash_1c", "sfx_sand_step_5",
              "sfx_beach_kids_1", "sfx_beach_kids_2", "sfx_beach_kids_3", "sfx_beach_kids_4"}
GROUPS_WANT = {
    "sfx_wave_crash": ["sfx_wave_crash_1", "sfx_wave_crash_2", "sfx_wave_crash_3"],
    "sfx_wave_wash": ["sfx_wave_wash", "sfx_wave_wash_2", "sfx_wave_wash_3"],
    "sfx_splash_beach": ["sfx_splash_1", "sfx_splash_1b", "sfx_splash_1c"],
    "sfx_sand_step": ["sfx_sand_step_1", "sfx_sand_step_2", "sfx_sand_step_3"],
    "sfx_sand_step_wet": ["sfx_sand_step_4", "sfx_sand_step_5"],
    "sfx_beach_kids": ["sfx_beach_kids_1", "sfx_beach_kids_2", "sfx_beach_kids_3", "sfx_beach_kids_4"],
}
SWELL_P = 6.0                                # src/systems/Water.js SWELL.shore.period
SWELL_BAND = {"amb_sea_waves": None, "amb_beach": (2500.0, 8000.0)}   # band for the measured near-wave surges
PHONE_HP, PHONE_MAX_DB = 600.0, 4.0
DRY_STEPS = ("sfx_sand_step_1", "sfx_sand_step_2", "sfx_sand_step_3")
DUR = {"bgm_beach": (45, 90), "amb_sea_waves": (40, 60), "amb_beach": (20, 40),
       "sfx_wave_crash_1": (1.5, 4.5), "sfx_wave_crash_2": (1.5, 4.5), "sfx_wave_crash_3": (1.5, 4.5),
       "sfx_wave_wash": (2.0, 4.0), "sfx_wave_wash_2": (2.0, 4.0), "sfx_wave_wash_3": (2.0, 4.0),
       "sfx_splash_1": (0.3, 2.5), "sfx_splash_1b": (0.3, 1.2), "sfx_splash_1c": (0.3, 1.2),
       "sfx_splash_2": (0.3, 2.5), "sfx_splash_3": (0.3, 2.5),
       "sfx_pool_splash": (1.0, 3.0), "sfx_lifeguard_whistle": (0.6, 2.0), "sfx_icecream_bell": (1.0, 3.0),
       "sfx_beachball_bounce": (0.4, 1.5), "sfx_hotel_bell": (1.0, 3.0),
       **{f"sfx_sand_step_{i}": (0.1, 0.45) for i in range(1, 6)},
       **{f"sfx_beach_kids_{i}": (0.3, 1.5) for i in range(1, 5)}}
# strongest spectral peak inside (lo, hi) Hz must sit within tol cents of want (Hz)
TUNING = {"sfx_hotel_bell": (1900.0, 2300.0, 2093.0, "C7", 25),
          "sfx_lifeguard_whistle": (2500.0, 3100.0, 2793.8, "F7 (centroid of the trilled tone)", 35),
          "sfx_icecream_bell": (1300.0, 1500.0, 1396.9, "F6 last chime", 25),
          "sfx_beachball_bounce": (600.0, 800.0, 698.5, "F5 'boing'", 40)}
TUNE_CENTROID = {"sfx_lifeguard_whistle"}     # a deep pea trill spreads the tone into FM sidebands
ONSETS = {"sfx_wave_crash_1": ["impact"], "sfx_wave_crash_2": ["impact"], "sfx_wave_crash_3": ["impact", "impact2"],
          "sfx_beachball_bounce": ["bounce1", "bounce2", "bounce3"], "sfx_pool_splash": ["slap"]}
WANT_CH = {"music": 2, "ambience": 1, "sfx": 1}
MAX_PAYLOAD = 3_500_000                      # '3.5 MB' read strictly (decimal)
HEADROOM_DB = -2.0
TARGET_V1 = {"music": -24.5 + HEADROOM_DB}               # bgm_village effective level (target + headroom)
MAX_SELF_SIM = 0.6


def other_fragments():
    """Every other assets/audio* fragment (audio, audio2 .. audio4, and audio6+ when present)."""
    out = []
    for d in sorted(os.listdir(ASSETS)):
        if d.startswith("audio") and d != "audio5" and os.path.exists(os.path.join(ASSETS, d, "manifest.json")):
            out.append(d)
    return out


def targets():
    """Loudness targets from build_audio5 (only to report effective-level errors)."""
    try:
        import build_audio5 as B5
        return {k: v[2] for k, v in B5.SOUNDS.items()}
    except Exception:  # noqa: BLE001
        return {}


def peak_hz(x, lo, hi):
    """Frequency of the strongest spectral peak between lo and hi Hz (parabolic interpolation)."""
    m = np.atleast_2d(x).mean(axis=0)
    n = 1 << int(np.ceil(np.log2(max(len(m), 1 << 16))))
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)), n))
    f = np.fft.rfftfreq(n, 1 / 44100)
    idx = np.nonzero((f >= lo) & (f <= hi))[0]
    k = int(idx[np.argmax(sp[idx])])
    a, b, c = np.log(sp[k - 1] + 1e-12), np.log(sp[k] + 1e-12), np.log(sp[k + 1] + 1e-12)
    p = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    return (k + p) * 44100 / n


def centroid_hz(x, lo, hi):
    """Power-weighted mean frequency between lo and hi Hz."""
    m = np.atleast_2d(x).mean(axis=0)
    n = 1 << int(np.ceil(np.log2(max(len(m), 1 << 16))))
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)), n)) ** 2
    f = np.fft.rfftfreq(n, 1 / 44100)
    w = (f >= lo) & (f <= hi)
    return float((sp[w] * f[w]).sum() / max(sp[w].sum(), 1e-30))


def _sos(kind, f, order=4):
    from scipy import signal
    return signal.butter(order, f, kind, fs=44100, output="sos")


def phone_loss(x):
    """dB of max momentary loudness lost through a 600 Hz 4th-order Butterworth high-pass (a small phone speaker
    reproduces little below 400-600 Hz)."""
    from scipy import signal
    m = np.atleast_2d(x)
    return float(S.momentary_max(m) - S.momentary_max(signal.sosfilt(_sos("highpass", PHONE_HP), m, axis=-1)))


def trill_depth(x, t0=0.35, t1=0.8):
    """Pea-whistle trill: amplitude-modulation index of the 2.3-3.4 kHz tone at its strongest 20-70 Hz rate."""
    from scipy import signal
    m = np.atleast_2d(x).mean(axis=0)[S.n_of(t0):S.n_of(t1)]
    b = signal.sosfiltfilt(_sos("bandpass", [2300.0, 3400.0]), m)
    env = signal.sosfiltfilt(_sos("lowpass", 150.0, 2), np.abs(signal.hilbert(b)))
    E = np.abs(np.fft.rfft(env - env.mean()))
    fe = np.fft.rfftfreq(len(env), 1 / 44100)
    j = np.nonzero((fe > 20) & (fe < 70))[0]
    k = int(j[np.argmax(E[j])])
    return float(fe[k]), float(2 * E[k] / len(env) / env.mean())


def bandenv(x, hop=0.05, nb=16):
    """16-band (60 Hz-12 kHz, log spaced) spectral envelope in dB, 2048-point frames every hop s."""
    m = np.atleast_2d(x).mean(axis=0)
    h, w = int(hop * 44100), 2048
    n = (len(m) - w) // h
    fr = np.stack([m[i * h:i * h + w] * np.hanning(w) for i in range(n)])
    P = np.abs(np.fft.rfft(fr, axis=1)) ** 2
    f = np.fft.rfftfreq(w, 1 / 44100)
    edges = np.geomspace(60, 12000, nb + 1)
    B = np.stack([P[:, (f >= edges[i]) & (f < edges[i + 1])].sum(1) for i in range(nb)], 1)
    return 10 * np.log10(B + 1e-12)


def env_selfsim(x, hop=0.05, minlag=3.0):
    """Strongest circular (loop) self-similarity of the z-scored band envelope at lags minlag .. loop - minlag."""
    B = bandenv(x, hop)
    X = (B - B.mean(0)) / (B.std(0) + 1e-9)
    n = len(X)
    F_ = np.fft.rfft(X, axis=0)
    ac = np.fft.irfft(F_ * np.conj(F_), n, axis=0).sum(1) / (n * X.shape[1])
    lags = np.arange(n) * hop
    ok = (lags >= minlag) & (lags <= lags[-1] - minlag)
    i = int(np.argmax(np.where(ok, ac, -9)))
    return float(ac[i]), float(lags[i])


def swell_check(key, x, a, fail, lines):
    """Near waves on the Water.js swell grid: manifest fields + measured surges at the waterline cues."""
    from scipy import signal
    P, W, ph, cues = a.get("swellPeriod"), a.get("swellWaves"), a.get("swellPhase"), a.get("cues", {})
    wl = cues.get("waterline") or []
    if not (P and W and ph is not None and wl):
        fail(f"{key}: swellPeriod / swellWaves / swellPhase / cues.waterline missing")
        return
    dur = x.shape[-1] / 44100
    if abs(P - SWELL_P) > 0.01:
        fail(f"{key}: swellPeriod {P} != Water.js {SWELL_P}")
    if abs(dur - W * P) > 0.002 or abs(dur / SWELL_P - W) > 0.01:
        fail(f"{key}: loop {dur:.4f} s is not swellWaves {W} x {SWELL_P} s")
    if len(wl) != W:
        fail(f"{key}: {len(wl)} waterline cues for {W} swell periods")
    grid = np.array([((t - ph + P / 2) % P) - P / 2 for t in wl])
    m = np.atleast_2d(x)
    band = SWELL_BAND.get(key)
    if band:
        m = signal.sosfilt(_sos("bandpass", list(band)), m, axis=-1)
    pw = S._block_powers(m, True, 0.4, 0.1)
    mc = -0.691 + 10 * np.log10(np.maximum(pw, 1e-15))
    t = np.arange(len(mc)) * 0.1 + 0.2                     # block centres
    err = []
    for w_ in wl:
        d = ((t - w_ + dur / 2) % dur) - dur / 2
        sel = np.nonzero(np.abs(d) <= P / 2)[0]
        err.append(float(d[sel[np.argmax(mc[sel])]]))
    err = np.array(err)
    lines.append(f"{'':22s} swell: {W} x {P} s (Water.js {SWELL_P}), phase {ph} s; waterline cues "
                 f"{', '.join(f'{v:.2f}' for v in wl)}; grid offsets {', '.join(f'{v:+.2f}' for v in grid)} s; "
                 f"measured surge - waterline {', '.join(f'{v:+.2f}' for v in err)} s (mean |err| "
                 f"{np.abs(err).mean():.2f}){' in ' + str(int(band[0])) + '-' + str(int(band[1])) + ' Hz' if band else ''}")
    if np.abs(grid).max() > 0.3:
        fail(f"{key}: waterline cues off the swell grid by up to {np.abs(grid).max():.2f} s")
    if np.abs(err).mean() > 0.5 or np.abs(err).max() > 1.0:
        fail(f"{key}: measured near-wave surges {np.abs(err).mean():.2f} s (max {np.abs(err).max():.2f}) off the "
             f"waterline cues")


def onset_near(x, t, win=0.06):
    """Time of the steepest energy rise (5 ms RMS, dB) within +-win s of t, among frames within 10 dB of the
    loudest frame of that window."""
    m = np.atleast_2d(x).mean(axis=0)
    k = S.n_of(0.005)
    nb = len(m) // k
    e = 10 * np.log10(np.mean(m[:nb * k].reshape(nb, k) ** 2, axis=1) + 1e-12)
    d = np.diff(e, prepend=-120.0)                         # silence before the file start
    a, b = max(0, int((t - win) / 0.005)), min(nb, int((t + win) / 0.005) + 1)
    if b <= a:
        return None
    loud = e[a:b] > e[a:b].max() - 10.0                   # only rises that reach the loud part (not noise flicker)
    return (a + int(np.argmax(np.where(loud, d[a:b], -1e9)))) * 0.005


def sea_metrics(x):
    """Realism metrics of a sea loop: momentary loudness (400 ms, 100 ms hop) range, breakers (peaks of the
    smoothed loudness curve, >= 2.5 s apart, >= 3 dB above the median) and the loudness curve's strongest
    circular self-similarity at lags 3 s .. loop - 3 s."""
    xs = np.atleast_2d(x)
    pw = S._block_powers(xs, True, 0.4, 0.1)
    mc = -0.691 + 10 * np.log10(np.maximum(pw, 1e-15))
    dur = xs.shape[1] / S.SR
    sm = np.convolve(np.concatenate((mc[-5:], mc, mc[:5])), np.ones(5) / 5, mode="same")[5:-5]
    med = float(np.median(sm))
    peaks = []
    for i in np.argsort(sm)[::-1]:
        if sm[i] < med + 3.0:
            break
        if all(min(abs(i - j), len(sm) - abs(i - j)) * 0.1 >= 2.5 for j in peaks):
            peaks.append(int(i))
    peaks.sort()
    t = np.array(peaks) * 0.1
    iv = np.diff(np.concatenate((t, [t[0] + len(sm) * 0.1]))) if len(t) else np.array([])
    c = mc - mc.mean()
    n = len(c)
    ac = np.array([np.sum(c * np.roll(c, L)) for L in range(n)]) / max(np.sum(c * c), 1e-12)
    lags = np.arange(n) * 0.1
    sel = (lags >= 3.0) & (lags <= dur - 3.0)
    j = int(np.argmax(ac[sel]))
    es, el = env_selfsim(xs)
    return {"p10": float(np.percentile(mc, 10)), "p95": float(np.percentile(mc, 95)),
            "range": float(np.percentile(mc, 95) - np.percentile(mc, 10)), "breakers": len(peaks),
            "intervals": iv, "peak_spread": float(sm[peaks].max() - sm[peaks].min()) if peaks else 0.0,
            "loud_selfsim": float(ac[sel][j]), "loud_selfsim_lag": float(lags[sel][j]),
            "selfsim": es, "selfsim_lag": el}


# ----------------------------------------------------------------------------- previews
def previews_png(rows, path):
    """Waveform of every key (3 columns) + spectrogram strips of the loops + spectrograms of every one-shot."""
    from PIL import Image, ImageDraw

    import preview as P
    cols, tw, th, lh = 3, 400, 58, 30
    nrow = (len(rows) + cols - 1) // cols
    wave_h = nrow * (th + lh + 10) + 46
    loops = [r for r in rows if r["loop"]]
    lw, lh2 = 1236, 150
    loop_h = len(loops) * (lh2 + 66) + 30
    spec = [r for r in rows if not r["loop"]]
    vw, vh = 300, 120
    vcols = 4
    vrows = (len(spec) + vcols - 1) // vcols
    spec_h = vrows * (vh + 36) + 30
    W = cols * (tw + 12) + 12
    img = Image.new("RGB", (W, wave_h + loop_h + spec_h), P.BG)
    d = ImageDraw.Draw(img)
    d.text((12, 10), "Frost Village audio5 (v7 living sea + Sunny Beach) - waveforms (light = RMS, dark = peak; red "
           "lines = -1 dBFS; orange edges = seamless loop)", fill=P.TXT, font=P.font(15))
    colors = {"music": (255, 196, 92), "ambience": (130, 220, 170), "sfx": (120, 200, 255)}
    for i, r in enumerate(rows):
        cx, cy = 12 + (i % cols) * (tw + 12), 40 + (i // cols) * (th + lh + 10)
        d.text((cx, cy), r["key"], fill=P.TXT, font=P.font(13))
        loud = f"I {r['I']:.1f}" if r["kind"] != "sfx" else f"Mmax {r['M']:.1f}"
        d.text((cx, cy + 15), f"{r['dur']:.2f}s  {loud} LUFS  peak {r['peak']:.1f}  vol {r['vol']}",
               fill=(160, 170, 190), font=P.font(11))
        img.paste(P.waveform(r["x"], tw, th, colors[r["kind"]], loop_marks=r["loop"]), (cx, cy + lh))
    y0 = wave_h
    d.text((12, y0), "Loops - spectrogram (40 Hz-12 kHz, log) + waveform; the loop wraps at the right edge",
           fill=P.TXT, font=P.font(15))
    for i, r in enumerate(loops):
        y = y0 + 26 + i * (lh2 + 66)
        d.text((12, y), f"{r['key']}  {r['dur']:.2f}s  I {r['I']:.1f} LUFS  vol {r['vol']}", fill=P.TXT, font=P.font(13))
        img.paste(P.spectrogram(r["x"], lw, lh2), (12, y + 18))
        img.paste(P.waveform(r["x"], lw, 40, colors[r["kind"]], True), (12, y + 20 + lh2))
    y0 = wave_h + loop_h
    d.text((12, y0), "One-shots - spectrogram 40 Hz-12 kHz (crashes, wash, splashes, whistle, bells, ball, sand steps)",
           fill=P.TXT, font=P.font(15))
    for i, r in enumerate(spec):
        cx, cy = 12 + (i % vcols) * (vw + 12), y0 + 26 + (i // vcols) * (vh + 36)
        d.text((cx, cy), f"{r['key']} {r['dur']:.2f}s", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], vw, vh, nfft=1024), (cx, cy + 16))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man5, path_mp3):
    """64 s soundscape at manifest volumes x call-site volume (like the game): the village coast in winter
    (bgm_village + wind + the new rolling sea, waves crashing on a rock along the coast on every other swell crest,
    footsteps in the snow, a ship horn) - crossfade to the Sunny Beach (bgm_beach + amb_beach, washes up the sand
    started on the bed's own swell crests as the game would, dry then damp sand steps, kids' hand splashes and
    calls, beach ball, lifeguard whistle, ice-cream cart, gulls) - the hotel (door, reception bell, pool dives,
    cheering) - sunset (music fades, the sea comes back, washes on the crests, a last gull)."""
    mans = {}
    for frag in other_fragments():
        with open(os.path.join(ASSETS, frag, "manifest.json")) as f:
            mans[frag] = json.load(f)
    mans["audio5"] = man5
    order = ["audio5"] + [f for f in mans if f != "audio5"]
    groups = {}
    for frag in order[::-1]:
        groups.update(mans[frag].get("audioGroups", {}))
    cache = {}

    def src(key):
        for frag in order:
            a = mans.get(frag, {}).get("audio", {}).get(key)
            if a:
                return a, os.path.join(ASSETS, a["files"][0])
        raise KeyError(key)

    def get(key):
        if key not in cache:
            a, p = src(key)
            cache[key] = F.decode(p, 2 if a["kind"] == "music" else 1)
        return cache[key]

    DUR_S = 64.0
    n = S.n_of(DUR_S)
    bed, fx = np.zeros((2, n)), np.zeros((2, n))
    r = np.random.default_rng(7)
    last = {}

    def sfx(t, key, vol=1.0, p=0.0, rate=1.0):
        if key in groups:
            opts = groups[key]
            i = int(r.integers(len(opts)))
            if len(opts) > 1 and i == last.get(key):
                i = (i + 1) % len(opts)
            last[key] = i
            key = opts[i]
        try:
            x = get(key)[0]
        except KeyError:
            return
        if rate != 1.0:
            m = int(len(x) / rate)
            x = np.interp(np.arange(m) * rate, np.arange(len(x)), x)
        st = S.pan(x, p) * src(key)[0]["volume"] * vol
        i = S.n_of(t)
        e = min(n, i + st.shape[1])
        fx[:, i:e] += st[:, :e - i]

    def loop(key, env_pts, p=0.0, vol=1.0):
        try:
            x = get(key)
        except KeyError:
            return
        x = x if x.shape[0] == 2 else S.pan(x[0], p)
        y = np.tile(x, (1, int(np.ceil(n / x.shape[1])) + 1))[:, :n]
        bed[:] += src(key)[0]["volume"] * vol * y * S.env_pts(env_pts, n)

    def walk(t0, count, step, key, vol=0.32, p=0.0):
        for i in range(count):
            sfx(t0 + i * step + float(r.normal(0, 0.01)), key, vol, p, float(r.uniform(0.92, 1.08)))

    # --- beds: village coast -> Sunny Beach -> hotel pool -> sunset
    loop("bgm_village", [(0, 0), (0.8, 0.8), (12.0, 0.8), (16.0, 0), (DUR_S, 0)])
    loop("amb_wind", [(0, 0), (0.6, 0.5), (13.0, 0.5), (16.5, 0), (DUR_S, 0)])
    loop("amb_sea_waves", [(0, 0), (0.5, 0.75), (13.0, 0.75), (17.0, 0), (51.0, 0), (55.0, 0.6), (DUR_S - 0.3, 0.6),
                           (DUR_S, 0)])
    loop("bgm_beach", [(0, 0), (15.0, 0), (17.5, 0.85), (50.0, 0.85), (56.0, 0.4), (62.0, 0.25), (DUR_S, 0)])
    loop("amb_beach", [(0, 0), (15.0, 0), (17.5, 1.0), (37.5, 1.0), (39.5, 0.45), (48.5, 0.45), (51.0, 0.8),
                       (56.0, 0.45), (DUR_S - 0.3, 0.4), (DUR_S, 0)])
    bed[:, -S.n_of(0.05):] *= np.linspace(1, 0, S.n_of(0.05))
    def crests(bed, t0, t1):
        """demo times (bed tiled from 0) at which the bed's near waves reach the waterline, in [t0, t1)"""
        a5 = man5["audio"][bed]
        out, k = [], 0
        while k * a5["duration"] < t1:
            out += [w + k * a5["duration"] for w in a5["cues"]["waterline"] if t0 <= w + k * a5["duration"] < t1]
            k += 1
        return sorted(out)

    washes = ["sfx_wave_wash", "sfx_wave_wash_2", "sfx_wave_wash_3"]

    def wash_on_crests(t0, t1, vol, p):
        """the game's sync: start a wash cues.waterline s before each crest of the beach bed"""
        for i, tc in enumerate(crests("amb_beach", t0, t1)):
            k = washes[i % 3]
            sfx(tc - man5["audio"][k]["cues"]["waterline"], k, vol * float(r.uniform(0.8, 1.0)), p + 0.15 * (i % 2))

    # --- village coast (0-15 s): every other crest throws spray on a rock a little way along the coast
    for i, tc in enumerate(crests("amb_sea_waves", 0.5, 15.0)):
        if i % 2 == 0:
            sfx(tc + 2.2 - man5["audio"]["sfx_wave_crash_1"]["cues"]["impact"], "sfx_wave_crash", 0.75 - 0.2 * (i % 4 > 0),
                -0.35 if i % 4 == 0 else 0.45)
    walk(5.0, 8, 0.33, "sfx_step_snow", 0.32, 0.1)
    sfx(12.4, "sfx_ship_horn_big", 0.55, 0.3)
    # --- Sunny Beach (16-38 s): washes on the bed's crests, dry then damp sand steps, kids, ball, whistle, cart
    wash_on_crests(17.5, 37.0, 0.6, 0.3)
    walk(17.0, 6, 0.33, "sfx_sand_step", 0.32, -0.1)
    walk(19.0, 4, 0.33, "sfx_sand_step_wet", 0.32, -0.05)
    sfx(21.0, "sfx_splash_beach", 0.75, -0.3)
    sfx(21.6, "sfx_beach_kids_1", 0.6, -0.3)
    sfx(23.4, "sfx_beachball_bounce", 0.85, 0.2)
    sfx(24.3, "sfx_splash_beach", 0.6, -0.25)
    sfx(25.1, "sfx_splash_2", 0.6, 0.45)
    sfx(26.0, "sfx_beach_kids_4", 0.55, 0.45)
    sfx(27.0, "sfx_lifeguard_whistle", 0.8, -0.4)
    sfx(29.6, "sfx_icecream_bell", 0.9, 0.25)
    sfx(31.0, "sfx_chatter_1", 0.6, 0.2)
    sfx(31.7, "sfx_beach_kids_2", 0.5, -0.4)
    sfx(32.5, "sfx_coin", 0.6, 0.25)
    sfx(35.6, "sfx_seagull", 0.5, -0.5)
    sfx(36.4, "sfx_beach_kids_3", 0.45, 0.35)
    # --- hotel + pool (38-50 s)
    sfx(38.4, "sfx_door", 0.5, 0.0)
    sfx(39.4, "sfx_hotel_bell", 1.0, 0.1)
    sfx(40.6, "sfx_chatter_4", 0.6, 0.1)
    sfx(43.0, "sfx_pool_splash", 1.0, -0.2)
    sfx(46.0, "sfx_splash_3", 0.7, 0.3)
    sfx(47.1, "sfx_cheer", 0.4, 0.0)
    # --- sunset (50-64 s)
    wash_on_crests(51.0, 62.0, 0.45, -0.2)
    sfx(56.5, "sfx_seagull", 0.4, 0.5, 0.95)
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "audio5_demo.wav")
    S.write_wav(wav, mix)
    F.encode_mp3(wav, path_mp3, 2, 128)
    lines = [f"demo: bed {S.lufs(bed):.1f} LUFS | sfx layer {S.lufs(fx):.1f} LUFS | mix {S.lufs(mix):.1f} LUFS, "
             f"peak {S.db(pk):.1f} dBFS", "demo timeline (4 s windows, max momentary LUFS)  bed | sfx"]
    for s in range(0, int(DUR_S), 4):
        a, b = S.n_of(s), S.n_of(s + 4)
        fxm = S.momentary_max(fx[:, a:b]) if np.any(fx[:, a:b]) else -99.0
        lines.append(f"  {s:2d}s  {S.momentary_max(bed[:, a:b]):6.1f} | {fxm:6.1f}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- main
def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    fails, warns, rows, lines = [], [], [], []
    fail = fails.append
    man_p = os.path.join(AUD5, "manifest.json")
    try:
        with open(man_p) as f:
            man = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: cannot read {man_p}: {e}")
        return 1
    audio, groups = man.get("audio", {}), man.get("audioGroups", {})
    if man.get("version") != 1:
        fail("manifest version != 1")
    others = other_fragments()
    lines.append(f"collision check against: {', '.join('assets/' + o for o in others)}")
    for frag in others:
        mp = os.path.join(ASSETS, frag, "manifest.json")
        try:
            with open(mp) as f:
                mo = json.load(f)
            oa, og = set(mo.get("audio", {})), set(mo.get("audioGroups", {}))
            clash = sorted((set(audio) & oa) | (set(groups) & og))
            if clash:
                fail(f"keys / groups collide with assets/{frag} (fragments merge with Object.assign): {clash}")
            hijack = sorted((set(groups) & oa) | (set(audio) & og))
            if hijack:
                fail(f"group name == key across fragments with assets/{frag} (Audio.play would pick the group): {hijack}")
        except Exception as e:  # noqa: BLE001
            warns.append(f"could not read assets/{frag}/manifest.json for the collision check: {e}")

    every = {kind: (keys + sorted(EXTRA_KEYS) if kind == "sfx" else keys) for kind, keys in CONTRACT.items()}
    for kind, keys in every.items():
        for k in keys:
            a = audio.get(k)
            if a is None:
                fail(f"{k}: missing from manifest")
                continue
            if a.get("kind") != kind:
                fail(f"{k}: kind {a.get('kind')} != {kind}")
            if bool(a.get("loop")) != (kind != "sfx"):
                fail(f"{k}: loop flag {a.get('loop')} wrong for {kind}")
            v = a.get("volume")
            if not isinstance(v, (int, float)) or not (0 < v <= 1):
                fail(f"{k}: volume {v} not in (0, 1]")
            files = a.get("files", [])
            if [os.path.splitext(f)[1] for f in files] != [".ogg", ".mp3"]:
                fail(f"{k}: files must be [ogg, mp3], got {files}")
            if any(not f.startswith("audio5/") for f in files):
                fail(f"{k}: files must live in audio5/: {files}")
    extra = sorted(set(audio) - {k for ks in every.values() for k in ks})
    if extra:
        warns.append(f"unexpected extra keys: {extra}")
    for g, want in GROUPS_WANT.items():
        if groups.get(g) != want:
            fail(f"audioGroups.{g} = {groups.get(g)}, expected {want}")
    if set(groups) - set(GROUPS_WANT):
        warns.append(f"unexpected extra groups: {sorted(set(groups) - set(GROUPS_WANT))}")
    for g, members in groups.items():
        missing = [m for m in members if m not in audio]
        if missing:
            fail(f"audioGroups.{g} references unknown keys {missing}")

    # ---- per file
    tg = targets()
    total = 0
    lines.append(f"{'key':22s} {'fmt':4s} {'ch':>2s} {'dur s':>7s} {'peak':>6s} {'TP':>6s} {'I LUFS':>7s} "
                 f"{'Mmax':>6s} {'vol':>6s} {'eff':>6s} {'want':>6s} {'DC':>8s} {'kB':>6s} {'phone':>6s}")
    loop_items = []
    sea_x = None
    for kind, keys in every.items():
        for k in keys:
            a = audio.get(k)
            if a is None:
                continue
            decoded = {}
            for rel in a.get("files", []):
                p = os.path.join(ASSETS, rel)
                if not os.path.exists(p):
                    fail(f"{k}: file missing {rel}")
                    continue
                size = os.path.getsize(p)
                total += size
                info = F.probe(p)
                if info["sample_rate"] != 44100:
                    fail(f"{k}: {rel} sample rate {info['sample_rate']}")
                if info["channels"] != WANT_CH[kind]:
                    fail(f"{k}: {rel} has {info['channels']} ch, want {WANT_CH[kind]}")
                try:
                    x = F.decode(p, info["channels"])
                except Exception as e:  # noqa: BLE001
                    fail(f"{k}: {rel} does not decode: {e}")
                    continue
                m = F.ebur128(p, info["channels"])
                fmt = os.path.splitext(rel)[1][1:]
                decoded[fmt] = (x, m)
                dc = float(np.max(np.abs(x.mean(axis=1))))
                dur = x.shape[1] / 44100
                lvl = m["I"] if kind != "sfx" else m["M"]
                eff = lvl + 20 * np.log10(max(a.get("volume", 1.0), 1e-6))
                want = tg.get(k, np.nan) + HEADROOM_DB
                ph = phone_loss(x) if kind == "sfx" else None
                lines.append(f"{k:22s} {fmt:4s} {info['channels']:2d} {dur:7.3f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                             f"{m['I']:7.1f} {m['M']:6.1f} {a.get('volume', 0):6.3f} {eff:6.1f} {want:6.1f} {dc:8.5f} "
                             f"{size / 1024:6.1f} {'' if ph is None else f'{ph:6.1f}'}")
                if m["peak"] > -1.0:
                    fail(f"{k}: {fmt} sample peak {m['peak']:.2f} dBFS > -1")
                if m["tpk"] > -1.0:
                    fail(f"{k}: {fmt} true peak {m['tpk']:.2f} dBTP > -1")
                if ph is not None and fmt == "ogg" and ph > PHONE_MAX_DB:
                    fail(f"{k}: loses {ph:.1f} dB on a phone speaker (600 Hz high-pass), max {PHONE_MAX_DB}")
                if fmt == "ogg" and k in DRY_STEPS:
                    e = np.cumsum(np.atleast_2d(x).mean(axis=0) ** 2)
                    late = 1 - e[S.n_of(0.12)] / e[-1]
                    lines.append(f"{'':22s} energy after 120 ms {100 * late:.1f} % (running steps are 0.225 s apart)")
                    if late > 0.05:
                        fail(f"{k}: {100 * late:.0f} % of the step comes after 120 ms (gallops when running)")
                if fmt == "ogg" and k == "sfx_lifeguard_whistle":
                    rate, depth = trill_depth(x)
                    lines.append(f"{'':22s} pea trill {rate:.0f} Hz, AM index {depth:.2f} (v7.0: 0.15)")
                    if depth < 0.3:
                        warns.append(f"{k}: shallow pea trill (AM index {depth:.2f})")
                if dc > 0.002:
                    fail(f"{k}: {fmt} DC offset {dc:.4f}")
                if fmt == "ogg" and np.isfinite(want) and abs(eff - want) > 1.0:
                    if a.get("volume") in (0.05, 1.0):
                        warns.append(f"{k}: effective level {eff:.1f} vs target {want:.1f} (volume clamped)")
                    else:
                        fail(f"{k}: effective level {eff:.1f} LUFS, target {want:.1f}")
                if fmt == "ogg" and k in DUR:
                    true_dur = a.get("duration", dur) if kind == "sfx" else dur   # sfx ogg decodes ~20 ms long
                    if not (DUR[k][0] <= true_dur <= DUR[k][1]):
                        fail(f"{k}: duration {true_dur:.3f}s outside {DUR[k]}")
                if kind == "sfx" and fmt == "ogg":
                    env = np.max(np.abs(x), axis=0)
                    pk = env.max()
                    lead = np.argmax(env > pk * 0.003) / 44100
                    if lead > 0.004:
                        fail(f"{k}: {lead * 1000:.1f} ms leading silence")
                    tail = np.sqrt(np.mean(x[:, -S.n_of(0.004):] ** 2)) / max(pk, 1e-9)
                    if tail > 0.02:
                        warns.append(f"{k}: tail not faded ({S.db(tail):.0f} dB re peak)")
                    if dur > 5.0:
                        warns.append(f"{k}: long sfx {dur:.1f}s")
                if fmt == "ogg" and k in TUNING:
                    lo, hi, hz, name, tol = TUNING[k]
                    got = centroid_hz(x, lo, hi) if k in TUNE_CENTROID else peak_hz(x, lo, hi)
                    cents = 1200 * np.log2(got / hz)
                    lines.append(f"{'':22s} tuning: strongest partial {got:.1f} Hz = {name} {cents:+.1f} cents")
                    if abs(cents) > tol:
                        fail(f"{k}: tuned {cents:+.0f} cents off {name}")
                if fmt == "ogg" and k in ONSETS:
                    cues = a.get("cues", {})
                    res = []
                    for c in ONSETS[k]:
                        if c not in cues:
                            fail(f"{k}: cue {c} missing")
                            continue
                        got = onset_near(x, cues[c])
                        if got is None:
                            continue
                        res.append(f"{c} {cues[c]:.3f}->{got:.3f}")
                        if abs(got - cues[c]) > 0.04:
                            warns.append(f"{k}: cue {c} at {cues[c]:.3f}s but the onset is at {got:.3f}s")
                    lines.append(f"{'':22s} cue onsets (manifest -> detected): " + ", ".join(res))
            if "ogg" not in decoded:
                continue
            x, m = decoded["ogg"]
            if a.get("loop"):
                lm = loop_metrics(x)
                srcw = os.path.join(CACHE, f"{k}.wav")
                n_src = S.read_wav(srcw).shape[1] if os.path.exists(srcw) else None
                lines.append(f"{'':22s} loop: n={x.shape[1]} (render {n_src}) hf_ratio={lm['hf_ratio']:.3f} "
                             f"d2_ratio={lm['d2_ratio']:.3f} level_jump={lm['lvl_jump_db']:+.1f} dB "
                             f"wrap_jump={lm['wrap_jump']:.4f}")
                if n_src is not None and n_src != x.shape[1]:
                    fail(f"{k}: decoded ogg length {x.shape[1]} != rendered loop {n_src}")
                tail = F.ogg_tail(os.path.join(ASSETS, a["files"][0]))
                lines.append(f"{'':22s} ogg end padding {tail['discard']} smp (must be 0); manifest loopSamples "
                             f"{a.get('loopSamples')}; duration {a.get('duration')} s")
                if tail["discard"] != 0:
                    fail(f"{k}: ogg has {tail['discard']} samples of end padding -> gap at every loop in Chrome")
                if a.get("loopSamples") != x.shape[1]:
                    fail(f"{k}: manifest loopSamples {a.get('loopSamples')} != decoded {x.shape[1]}")
                if abs(a.get("duration", 0) * 44100 - x.shape[1]) > 0.00005 * 44100 + 0.5:     # manifest rounds to 0.1 ms
                    fail(f"{k}: manifest duration {a.get('duration')} != {x.shape[1] / 44100:.4f}")
                if lm["hf_ratio"] > 1.0 or lm["d2_ratio"] > 1.0:
                    fail(f"{k}: possible click at loop point (hf {lm['hf_ratio']:.2f}, d2 {lm['d2_ratio']:.2f})")
                if "mp3" in decoded:
                    xm = decoded["mp3"][0]
                    if xm.shape[1] == x.shape[1]:
                        lmm = loop_metrics(xm)
                        lines.append(f"{'':22s} mp3 loop (ffmpeg, gapless tag honoured): n={xm.shape[1]} "
                                     f"hf_ratio={lmm['hf_ratio']:.3f} d2_ratio={lmm['d2_ratio']:.3f}")
                        if lmm["hf_ratio"] > 1.0 or lmm["d2_ratio"] > 1.0:
                            warns.append(f"{k}: mp3 wrap ratios hf {lmm['hf_ratio']:.2f} d2 {lmm['d2_ratio']:.2f}")
                    else:
                        nm = xm.shape[1]
                        warns.append(f"{k}: mp3 decodes to {nm} samples vs ogg {x.shape[1]} ({(nm - x.shape[1]) / 44.1:+.1f} ms)"
                                     f" with ffmpeg - mp3 loop relies on the LAME gapless tag / Audio.trimLoops")
                for fmt_, rel in zip(("ogg", "mp3"), a["files"]):
                    loop_items.append({"key": k, "fmt": fmt_, "path": os.path.join(ASSETS, rel),
                                       "want": int(a.get("loopSamples") or x.shape[1])})
                if k == "amb_sea_waves":
                    sea_x = x
                if k in SWELL_BAND:
                    swell_check(k, x, a, fail, lines)
            rows.append({"key": k, "kind": kind, "x": x, "dur": x.shape[1] / 44100 if a.get("loop") else
                         a.get("duration", x.shape[1] / 44100), "I": m["I"], "M": m["M"],
                         "peak": max(m["peak"], decoded.get("mp3", (None, m))[1]["peak"]),
                         "vol": a.get("volume"), "loop": bool(a.get("loop"))})
    man_size = os.path.getsize(man_p)
    total += man_size
    lines.append(f"total payload assets/audio5 (audio files + manifest): {total} bytes = {total / 1e6:.3f} MB = "
                 f"{total / 1024 / 1024:.3f} MiB (limit {MAX_PAYLOAD} bytes)")
    if total > MAX_PAYLOAD:
        fail(f"payload {total} bytes > {MAX_PAYLOAD}")
    on_disk = sorted(os.listdir(AUD5))
    listed = {"manifest.json"} | {os.path.basename(f) for a in audio.values() for f in a.get("files", [])}
    stray = [f for f in on_disk if f not in listed]
    if stray:
        warns.append(f"files in assets/audio5 not referenced by the manifest: {stray}")

    # ---- sea realism: new amb_sea_waves vs the old v1 amb_sea
    if sea_x is not None:
        old_p = os.path.join(ASSETS, "audio", "amb_sea.ogg")
        cmp = [("amb_sea_waves (new)", sea_x)] + ([("audio/amb_sea (old)", F.decode(old_p, 1))]
                                                 if os.path.exists(old_p) else [])
        lines.append("sea realism (momentary loudness 400 ms / 100 ms hop):")
        for name, xx in cmp:
            sm = sea_metrics(xx)
            iv = sm["intervals"]
            ivs = f"{iv.min():.1f}-{iv.max():.1f} s (mean {iv.mean():.1f})" if len(iv) else "-"
            lines.append(f"  {name:22s} {xx.shape[1] / 44100:5.1f}s  range p95-p10 {sm['range']:4.1f} dB, "
                         f"{sm['breakers']} breakers, intervals {ivs}, breaker level spread {sm['peak_spread']:.1f} dB, "
                         f"spectral-envelope self-similarity {sm['selfsim']:.2f} at lag {sm['selfsim_lag']:.1f} s "
                         f"(loudness curve {sm['loud_selfsim']:.2f} at {sm['loud_selfsim_lag']:.1f} s)")
            if name.startswith("amb_sea_waves"):
                if sm["selfsim"] >= MAX_SELF_SIM:
                    fail(f"amb_sea_waves repeats itself inside the loop (self-similarity {sm['selfsim']:.2f} at "
                         f"{sm['selfsim_lag']:.1f} s)")
                if sm["breakers"] < 5:
                    fail(f"amb_sea_waves: only {sm['breakers']} distinct breakers detected")
                if sm["range"] < 8.0:
                    warns.append(f"amb_sea_waves: loudness range only {sm['range']:.1f} dB (waves may sound flat)")

    # ---- headless Chromium decode of the loops (check_audio2's Playwright runner, our cache folder)
    if "--no-browser" not in argv and loop_items:
        C2.CACHE = CACHE
        res = C2.chromium_decode([{k: v for k, v in it.items() if k != "want"} for it in loop_items])
        if "error" in res:
            warns.append(f"Chromium decode test not run: {res['error']}")
        else:
            lines.append(f"headless Chromium {res.get('version')} decodeAudioData (OfflineAudioContext 44.1 kHz):")
            for it, rr in zip(loop_items, res["files"]):
                if "error" in rr:
                    fail(f"{it['key']}: Chromium cannot decode {it['fmt']}: {rr['error']}")
                    continue
                ok = rr["length"] == it["want"]
                diff = "exact" if ok else "%+d" % (rr["length"] - it["want"])
                lines.append(f"  {it['key']:22s} {it['fmt']}: {rr['length']} frames x {rr['channels']} ch "
                             f"(want {it['want']}, {diff}), seam d2 ratio {rr['seamRatio']:.3f}")
                if it["fmt"] == "ogg":
                    if not ok:
                        fail(f"{it['key']}: Chromium decodes the ogg loop to {rr['length']} frames, want {it['want']}")
                    if rr["seamRatio"] > 1.0:
                        fail(f"{it['key']}: Chromium-decoded loop jumps at the seam (ratio {rr['seamRatio']:.2f})")
                elif not ok:
                    warns.append(f"{it['key']}: Chromium mp3 decode {rr['length']} vs {it['want']} frames "
                                 f"(only used where ogg is unsupported; Audio.trimLoops handles longer buffers)")

    # ---- mix sanity vs assets/audio
    for r_ in rows:
        if r_["kind"] == "music":
            eff = r_["I"] + 20 * np.log10(audio[r_["key"]]["volume"])
            lines.append(f"mix: {r_['key']} plays at {eff:.1f} LUFS effective (bgm_village target {TARGET_V1['music']:.1f})")
            if abs(eff - TARGET_V1["music"]) > 1.0:
                warns.append(f"{r_['key']} effective level {eff:.1f} vs village {TARGET_V1['music']:.1f}")

    demo_txt = ""
    if "--no-demo" not in argv:
        try:
            demo_txt = demo_mix(man, os.path.join(PREV, "audio5_demo.mp3"))
        except Exception as e:  # noqa: BLE001
            warns.append(f"demo mix failed: {e}")
    os.makedirs(PREV, exist_ok=True)
    report = "\n".join(lines + ([demo_txt] if demo_txt else []) + [""] + [f"WARN: {w}" for w in warns] +
                       [f"FAIL: {f}" for f in fails] + ["", "RESULT: " + ("FAIL" if fails else "OK")])
    with open(os.path.join(PREV, "audio5_report.txt"), "w") as f:
        f.write(report + "\n")
    print(report)
    if "--no-png" not in argv and rows:
        previews_png(rows, os.path.join(PREV, "audio5_waveforms.png"))
        print("wrote docs/previews/audio5_waveforms.png" + (", audio5_demo.mp3" if demo_txt else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
