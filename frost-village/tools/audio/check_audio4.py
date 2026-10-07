"""Frost Village - audio QA for assets/audio4 (CONTRACT_V6 section U, harbour city) + human previews.

Run:  python3 tools/audio/check_audio4.py [--no-png] [--no-demo] [--no-browser]   (exit 1 on any FAIL)
Checks
  * every section U key is in assets/audio4/manifest.json with files [.ogg, .mp3] that exist and decode at
    44.1 kHz (music stereo; ambience + sfx mono), kind / loop / volume sane; audioGroups sfx_seagull (3)
    complete; no key or group collides with assets/audio, audio2 or audio3 (fragments merge with Object.assign);
  * per file: duration (bgm 60-90 s as the contract says; sfx_crane <= 2.0 s = one crane work cycle), sample
    peak <= -1 dBFS, true peak, integrated + max momentary LUFS (ffmpeg ebur128), DC offset; sfx: no leading
    silence (<= 4 ms), faded tail; effective level (file level + 20 log10 volume) within 1 dB of TARGET + headroom;
  * tuning of the pitched sounds (strongest partial in a window: ferry bell strike A5, auction bell F5, ship
    horn F2) within 25 cents;
  * loops: decoded .ogg length == rendered loop length, .ogg end padding == 0, manifest loopSamples / duration,
    click detector at the wrap (check_audio.loop_metrics: hf_ratio / d2_ratio < 1);
  * headless Chromium (Playwright, check_audio2.chromium_decode): decodeAudioData of every loop must return
    exactly loopSamples frames for the .ogg (Chromium ignores the Vorbis end-trim) and the wrap must not jump
    (2nd difference at the seam vs the 99.9th percentile); .mp3 lengths reported;
  * payload of assets/audio4 (files + manifest) <= 3,000,000 bytes; bgm_harbor plays at the same effective
    loudness as bgm_village.
Writes docs/previews/audio4_report.txt, audio4_waveforms.png (waveform of every key, spectrograms of the loops
and of every one-shot) and audio4_demo.mp3 (a 48 s 'the train reaches the harbour' soundscape mixed from the
delivered files at their manifest volumes, over the v1-v5 sounds).
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
AUD4 = os.path.join(ASSETS, "audio4")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.path.join(HERE, "_cache", "audio4")
OTHER = ("audio", "audio2", "audio3")           # fragments merged with Object.assign: keys must not collide

# CONTRACT_V6 section U, written out independently of build_audio4.py on purpose.
CONTRACT = {
    "music": ["bgm_harbor"],
    "ambience": ["amb_harbor"],
    "sfx": ["sfx_ship_horn_big", "sfx_ferry_bell", "sfx_seagull_1", "sfx_seagull_2", "sfx_seagull_3", "sfx_crane",
            "sfx_auction_bell", "sfx_rope_creak"],
}
CONTRACT_GROUPS = {"sfx_seagull": 3}
DUR = {"bgm_harbor": (60, 90), "amb_harbor": (15, 30),
       "sfx_ship_horn_big": (2.5, 5.5), "sfx_ferry_bell": (1.5, 4.0),
       "sfx_seagull_1": (0.3, 1.8), "sfx_seagull_2": (0.3, 1.8), "sfx_seagull_3": (0.3, 1.8),
       "sfx_crane": (1.5, 2.0), "sfx_auction_bell": (1.0, 3.0), "sfx_rope_creak": (0.6, 2.5)}
# strongest spectral peak inside (lo, hi) Hz must sit within 25 cents of want (Hz)
TUNING = {"sfx_ferry_bell": (800.0, 960.0, 880.0, "A5 strike"), "sfx_auction_bell": (640.0, 760.0, 698.46, "F5"),
          "sfx_ship_horn_big": (80.0, 95.0, 87.31, "F2")}
WANT_CH = {"music": 2, "ambience": 1, "sfx": 1}
MAX_PAYLOAD = 3_000_000                      # '3 MB' read strictly (decimal); 3 MiB would allow 3,145,728
HEADROOM_DB = -2.0
TARGET_V1 = {"music": -24.5 + HEADROOM_DB}               # bgm_village effective level (target + headroom)


def targets():
    """Loudness targets from build_audio4 (only to report effective-level errors)."""
    try:
        import build_audio4 as B4
        return {k: v[2] for k, v in B4.SOUNDS.items()}
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
    d.text((12, 10), "Frost Village audio4 (v6 harbour) - waveforms (light = RMS, dark = peak; red lines = -1 dBFS; "
           "orange edges = seamless loop)", fill=P.TXT, font=P.font(15))
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
    d.text((12, y0), "One-shots - spectrogram 40 Hz-12 kHz (horn, bells, gulls, crane, creak)", fill=P.TXT,
           font=P.font(15))
    for i, r in enumerate(spec):
        cx, cy = 12 + (i % vcols) * (vw + 12), y0 + 26 + (i // vcols) * (vh + 36)
        d.text((cx, cy), f"{r['key']} {r['dur']:.2f}s", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], vw, vh, nfft=1024), (cx, cy + 16))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man4, path_mp3):
    """48 s soundscape at manifest volumes x call-site volume (like the game): the coastal train pulls into the
    harbour (bgm_village + wind, steam whistle) - crossfade to bgm_harbor + amb_harbor - gulls, the ferry sounds
    its big horn and docks (rope creak, ferry bell), tourists chatter down the gangway - the quay crane works
    five cycles (in sync with harbor_crane's 2 s anim) while a tug toots - the fish auction opens (auction bell,
    bidders, register, coins, cheer) - the ferry leaves (horn, bell) and the gulls have the last word."""
    mans = {}
    for frag in ("audio", "audio2", "audio3"):
        p = os.path.join(ASSETS, frag, "manifest.json")
        if os.path.exists(p):
            with open(p) as f:
                mans[frag] = json.load(f)
    mans["audio4"] = man4
    groups = {}
    for m in mans.values():
        groups.update(m.get("audioGroups", {}))
    cache = {}

    def src(key):
        for frag in ("audio4", "audio3", "audio2", "audio"):
            a = mans.get(frag, {}).get("audio", {}).get(key)
            if a:
                return a, os.path.join(ASSETS, a["files"][0])
        raise KeyError(key)

    def get(key):
        if key not in cache:
            a, p = src(key)
            cache[key] = F.decode(p, 2 if a["kind"] == "music" else 1)
        return cache[key]

    DUR_S = 48.0
    n = S.n_of(DUR_S)
    bed, fx = np.zeros((2, n)), np.zeros((2, n))
    r = np.random.default_rng(6)
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
        x = get(key)
        x = x if x.shape[0] == 2 else S.pan(x[0], p)
        y = np.tile(x, (1, int(np.ceil(n / x.shape[1])) + 1))[:, :n]
        bed[:] += src(key)[0]["volume"] * vol * y * S.env_pts(env_pts, n)

    # --- beds: arriving by train (village music + wind) -> the harbour
    loop("bgm_village", [(0, 0), (0.6, 1), (4.5, 1), (7.0, 0), (DUR_S, 0)])
    loop("amb_wind", [(0, 0), (0.5, 0.5), (5.0, 0.5), (7.5, 0), (DUR_S, 0)])
    loop("bgm_harbor", [(0, 0), (5.2, 0), (7.4, 1), (46.0, 1), (DUR_S, 0)])
    loop("amb_harbor", [(0, 0), (3.5, 0), (6.5, 1.0), (DUR_S - 0.3, 1.0), (DUR_S, 0)])
    bed[:, -S.n_of(0.05):] *= np.linspace(1, 0, S.n_of(0.05))
    # --- one-shots
    sfx(1.0, "sfx_steam_whistle", 0.7, 0.4)
    sfx(3.2, "sfx_brakes", 0.5, 0.3)
    sfx(6.6, "sfx_seagull_1", 0.75, -0.4, 1.04)
    sfx(8.6, "sfx_ship_horn_big", 0.9, 0.2)
    sfx(11.4, "sfx_seagull_2", 0.55, 0.55, 0.96)
    sfx(12.6, "sfx_rope_creak", 0.9, -0.3)
    sfx(13.8, "sfx_ferry_bell", 1.0, 0.25)
    for t, k, p in ((15.6, "sfx_chatter_2", 0.2), (16.2, "sfx_chatter_5", 0.3), (16.9, "sfx_chatter_1", 0.1),
                    (17.6, "sfx_laugh_1", 0.25), (18.3, "sfx_chatter_4", 0.35)):
        sfx(t, k, 0.6, p)
    for k in range(5):                                       # quay crane: one sfx per 2.0 s anim cycle
        sfx(19.5 + 2.0 * k, "sfx_crane", 0.65, -0.35)
    sfx(21.2, "sfx_seagull_3", 0.7, 0.5, 1.08)
    sfx(24.0, "sfx_boat_horn", 0.45, 0.6)
    sfx(26.6, "sfx_rope_creak", 0.6, 0.4, 0.92)
    sfx(30.0, "sfx_auction_bell", 1.0, 0.1)
    for t, k, p in ((32.2, "sfx_chatter_6", -0.2), (32.7, "sfx_chatter_3", 0.3), (33.3, "sfx_chatter_4", 0.0)):
        sfx(t, k, 0.65, p)
    sfx(34.2, "sfx_register", 0.8, 0.1)
    sfx(34.9, "sfx_coins_many", 0.7, 0.1)
    sfx(35.8, "sfx_cheer", 0.55, 0.0)
    sfx(38.6, "sfx_ferry_bell", 0.7, 0.3)
    sfx(40.2, "sfx_ship_horn_big", 0.8, 0.3)
    sfx(43.6, "sfx_seagull", 0.7, -0.5)
    sfx(45.2, "sfx_seagull", 0.55, 0.45, 1.1)
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "audio4_demo.wav")
    S.write_wav(wav, mix)
    F.encode_mp3(wav, path_mp3, 2, 128)
    lines = [f"demo: bed {S.lufs(bed):.1f} LUFS | sfx layer {S.lufs(fx):.1f} LUFS | mix {S.lufs(mix):.1f} LUFS, "
             f"peak {S.db(pk):.1f} dBFS", "demo timeline (2 s windows, max momentary LUFS)  bed | sfx"]
    for s in range(0, int(DUR_S), 2):
        a, b = S.n_of(s), S.n_of(s + 2)
        fxm = S.momentary_max(fx[:, a:b]) if np.any(fx[:, a:b]) else -99.0
        lines.append(f"  {s:2d}s  {S.momentary_max(bed[:, a:b]):6.1f} | {fxm:6.1f}")
    return "\n".join(lines)


# ----------------------------------------------------------------------------- main
def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    fails, warns, rows, lines = [], [], [], []
    fail = fails.append
    man_p = os.path.join(AUD4, "manifest.json")
    try:
        with open(man_p) as f:
            man = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: cannot read {man_p}: {e}")
        return 1
    audio, groups = man.get("audio", {}), man.get("audioGroups", {})
    if man.get("version") != 1:
        fail("manifest version != 1")
    for frag in OTHER:
        mp = os.path.join(ASSETS, frag, "manifest.json")
        if not os.path.exists(mp):
            continue
        try:
            with open(mp) as f:
                mo = json.load(f)
            clash = sorted((set(audio) & set(mo.get("audio", {}))) | (set(groups) & set(mo.get("audioGroups", {}))))
            if clash:
                fail(f"keys collide with assets/{frag} (fragments merge with Object.assign): {clash}")
        except Exception as e:  # noqa: BLE001
            warns.append(f"could not read assets/{frag}/manifest.json for the collision check: {e}")

    for kind, keys in CONTRACT.items():
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
            if any(not f.startswith("audio4/") for f in files):
                fail(f"{k}: files must live in audio4/: {files}")
    extra = sorted(set(audio) - {k for ks in CONTRACT.values() for k in ks})
    if extra:
        warns.append(f"extra keys (allowed): {extra}")
    for g, cnt in CONTRACT_GROUPS.items():
        want = [f"{g}_{i}" for i in range(1, cnt + 1)]
        if groups.get(g) != want:
            fail(f"audioGroups.{g} = {groups.get(g)}, expected {want}")
    for g, members in groups.items():
        missing = [m for m in members if m not in audio]
        if missing:
            fail(f"audioGroups.{g} references unknown keys {missing}")

    # ---- per file
    tg = targets()
    total = 0
    lines.append(f"{'key':18s} {'fmt':4s} {'ch':>2s} {'dur s':>7s} {'peak':>6s} {'TP':>6s} {'I LUFS':>7s} "
                 f"{'Mmax':>6s} {'vol':>6s} {'eff':>6s} {'want':>6s} {'DC':>8s} {'kB':>6s}")
    loop_items = []
    for kind, keys in CONTRACT.items():
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
                lines.append(f"{k:18s} {fmt:4s} {info['channels']:2d} {dur:7.3f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                             f"{m['I']:7.1f} {m['M']:6.1f} {a.get('volume', 0):6.3f} {eff:6.1f} {want:6.1f} {dc:8.5f} "
                             f"{size / 1024:6.1f}")
                if m["peak"] > -1.0:
                    fail(f"{k}: {fmt} sample peak {m['peak']:.2f} dBFS > -1")
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
                    lo, hi, hz, name = TUNING[k]
                    got = peak_hz(x, lo, hi)
                    cents = 1200 * np.log2(got / hz)
                    lines.append(f"{'':18s} tuning: strongest partial {got:.1f} Hz = {name} {cents:+.1f} cents")
                    if abs(cents) > 25:
                        fail(f"{k}: tuned {cents:+.0f} cents off {name}")
            if "ogg" not in decoded:
                continue
            x, m = decoded["ogg"]
            if a.get("loop"):
                lm = loop_metrics(x)
                srcw = os.path.join(CACHE, f"{k}.wav")
                n_src = S.read_wav(srcw).shape[1] if os.path.exists(srcw) else None
                lines.append(f"{'':18s} loop: n={x.shape[1]} (render {n_src}) hf_ratio={lm['hf_ratio']:.3f} "
                             f"d2_ratio={lm['d2_ratio']:.3f} level_jump={lm['lvl_jump_db']:+.1f} dB "
                             f"wrap_jump={lm['wrap_jump']:.4f}")
                if n_src is not None and n_src != x.shape[1]:
                    fail(f"{k}: decoded ogg length {x.shape[1]} != rendered loop {n_src}")
                tail = F.ogg_tail(os.path.join(ASSETS, a["files"][0]))
                lines.append(f"{'':18s} ogg end padding {tail['discard']} smp (must be 0); manifest loopSamples "
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
                        lines.append(f"{'':18s} mp3 loop (ffmpeg, gapless tag honoured): n={xm.shape[1]} "
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
            rows.append({"key": k, "kind": kind, "x": x, "dur": x.shape[1] / 44100 if a.get("loop") else
                         a.get("duration", x.shape[1] / 44100), "I": m["I"], "M": m["M"],
                         "peak": max(m["peak"], decoded.get("mp3", (None, m))[1]["peak"]),
                         "vol": a.get("volume"), "loop": bool(a.get("loop"))})
    man_size = os.path.getsize(man_p)
    total += man_size
    lines.append(f"total payload assets/audio4 (audio files + manifest): {total} bytes = {total / 1e6:.3f} MB = "
                 f"{total / 1024 / 1024:.3f} MiB (limit {MAX_PAYLOAD} bytes)")
    if total > MAX_PAYLOAD:
        fail(f"payload {total} bytes > {MAX_PAYLOAD}")
    on_disk = sorted(os.listdir(AUD4))
    listed = {"manifest.json"} | {os.path.basename(f) for a in audio.values() for f in a.get("files", [])}
    stray = [f for f in on_disk if f not in listed]
    if stray:
        warns.append(f"files in assets/audio4 not referenced by the manifest: {stray}")

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
                lines.append(f"  {it['key']:18s} {it['fmt']}: {rr['length']} frames x {rr['channels']} ch "
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
            demo_txt = demo_mix(man, os.path.join(PREV, "audio4_demo.mp3"))
        except Exception as e:  # noqa: BLE001
            warns.append(f"demo mix failed: {e}")
    os.makedirs(PREV, exist_ok=True)
    report = "\n".join(lines + ([demo_txt] if demo_txt else []) + [""] + [f"WARN: {w}" for w in warns] +
                       [f"FAIL: {f}" for f in fails] + ["", "RESULT: " + ("FAIL" if fails else "OK")])
    with open(os.path.join(PREV, "audio4_report.txt"), "w") as f:
        f.write(report + "\n")
    print(report)
    if "--no-png" not in argv and rows:
        previews_png(rows, os.path.join(PREV, "audio4_waveforms.png"))
        print("wrote docs/previews/audio4_waveforms.png" + (", audio4_demo.mp3" if demo_txt else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
