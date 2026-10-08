"""Frost Village - audio QA for assets/audio6 (CONTRACT_V8 section AE, the living city) + human previews.

Run:  python3 tools/audio/check_audio6.py [--no-png] [--no-demo] [--no-browser]   (exit 1 on any FAIL)
Checks
  * every section AE key is in assets/audio6/manifest.json with files [.ogg, .mp3] that exist and decode at
    44.1 kHz (music stereo; ambience-type loops + sfx mono), kind / loop / volume sane; no key or group collides
    with any other assets/audio* fragment (fragments merge with Object.assign; a group named like another
    fragment's key would hijack Audio.play of that key);
  * per file: duration (bgm_city 60-90 s and bgm_chase 20-40 s as the contract says), sample peak <= -1 dBFS, true
    peak, integrated + max momentary LUFS (ffmpeg ebur128), DC offset; sfx: no leading silence (<= 4 ms), faded
    tail; effective level (file level + 20 log10 volume) within 1 dB of TARGET + headroom;
  * tuning of the pitched sounds (strongest partial in a window; the trilling whistle: power-weighted centre of
    its band): fire siren low tone A4, forklift beep C6, alarm bell A5, police whistle C7, coin-count 'ching' F6 -
    within 25 cents;
  * cue timing: onset detection near every manifest cue of the percussive one-shots (report; warn > 40 ms);
  * 'friendliness': share of energy above 4 kHz and spectral centroid of the sirens / bell / whistle / fire
    compared with the existing audio3 sfx_bus_horn (report only);
  * loops: decoded .ogg length == rendered loop length, .ogg end padding == 0, manifest loopSamples / duration,
    click detector at the wrap (check_audio.loop_metrics: hf_ratio / d2_ratio < 1) for .ogg and .mp3;
  * headless Chromium (Playwright): decodeAudioData of every loop into a 44.1 kHz context must return exactly
    loopSamples frames for the .ogg and the .mp3 (Chromium ignores the Vorbis end-trim) and the wrap must not jump;
    a second pass decodes into a 48 kHz context (what phones, iOS especially, run at - the decoder resamples and
    the loop length becomes fractional) and the wrap must not jump there either (ogg and mp3);
  * phone speakers: every key is also measured through a crude phone-speaker model (4th-order high-pass 500 Hz +
    2nd-order low-pass 9 kHz, the critic's model): phone loss = phone-weighted level - full-range level (integrated
    for loops, max momentary for one-shots) must be <= 6 dB, and amb_fire_big must not be quieter on a phone than
    the v1 camp fire (assets/audio amb_fire);
  * loop manifest duration: round(duration * 44100) == loopSamples (Audio.trimLoops cuts to round(duration * rate));
  * payload of assets/audio6 (files + manifest) <= 4,000,000 bytes; both music loops play at the same effective
    loudness as bgm_village.
Writes docs/previews/audio6_report.txt, audio6_waveforms.png (waveform of every key, spectrograms of the loops
and of every one-shot) and audio6_demo.mp3 (a ~76 s 'a day in the living city' soundscape mixed from the
delivered files at their manifest volumes, over the v1-v5 sounds).
Cache: /tmp/fv_cache/audio6 (FV_AUDIO6_CACHE).
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

import ffmpeg_tools as F  # noqa: E402
import synth as S  # noqa: E402
from check_audio import loop_metrics  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
AUD6 = os.path.join(ASSETS, "audio6")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.environ.get("FV_AUDIO6_CACHE", "/tmp/fv_cache/audio6")

# CONTRACT_V8 section AE, written out independently of build_audio6.py on purpose.
CONTRACT = {
    "music": ["bgm_city", "bgm_chase"],
    "ambience": ["amb_fire_big", "amb_construction", "amb_bank", "amb_warehouse",
                 # positional loops the contract names sfx_* (loop): kind ambience like audio3 sfx_truck_engine
                 "sfx_siren_fire", "sfx_siren_police", "sfx_hose_spray", "sfx_excavator", "sfx_comic_fight"],
    "sfx": ["sfx_fire_flare", "sfx_steam_hiss", "sfx_collapse_soft", "sfx_demolish_crunch", "sfx_coin_count",
            "sfx_stamp", "sfx_vault_door", "sfx_forklift_beep", "sfx_police_whistle", "sfx_crowd_gasp",
            "sfx_crowd_cheer_small", "sfx_cuffs_click", "sfx_fire_alarm_bell", "sfx_moving_truck", "sfx_box_drop",
            "sfx_newspaper",
            # extras - not in the contract: variants (group sfx_box), the bank queue chime (was baked into amb_bank)
            "sfx_box_drop_2", "sfx_box_drop_3", "sfx_ticket_chime"],
}
CONTRACT_GROUPS = {"sfx_box": 3}
DUR = {"bgm_city": (60, 90), "bgm_chase": (20, 40),
       "amb_fire_big": (6, 30), "amb_construction": (6, 30), "amb_bank": (6, 30), "amb_warehouse": (6, 30),
       "sfx_siren_fire": (1.5, 4.0), "sfx_siren_police": (1.5, 4.0), "sfx_hose_spray": (1.5, 4.0),
       "sfx_excavator": (1.5, 4.0), "sfx_comic_fight": (1.5, 4.0),
       "sfx_fire_flare": (0.6, 2.5), "sfx_steam_hiss": (1.0, 3.0), "sfx_collapse_soft": (1.0, 3.0),
       "sfx_demolish_crunch": (0.6, 2.5), "sfx_coin_count": (0.6, 2.0), "sfx_stamp": (0.1, 0.8),
       "sfx_vault_door": (1.0, 3.5), "sfx_ticket_chime": (0.6, 2.0), "sfx_forklift_beep": (0.8, 2.0), "sfx_police_whistle": (0.6, 2.0),
       "sfx_crowd_gasp": (0.6, 2.0), "sfx_crowd_cheer_small": (1.0, 3.0), "sfx_cuffs_click": (0.15, 0.8),
       "sfx_fire_alarm_bell": (1.0, 3.5), "sfx_moving_truck": (1.5, 3.5), "sfx_box_drop": (0.1, 0.8),
       "sfx_box_drop_2": (0.1, 0.8), "sfx_box_drop_3": (0.1, 0.8),
       "sfx_newspaper": (0.3, 1.5)}
# strongest spectral peak inside (lo, hi) Hz must sit within 25 cents of want (Hz); (t0, t1) = analysis window (s)
TUNING = {"sfx_siren_fire": (400.0, 480.0, 440.0, "A4 (low tone)", None),
          "sfx_forklift_beep": (980.0, 1120.0, 1046.50, "C6", None),
          "sfx_fire_alarm_bell": (830.0, 930.0, 880.0, "A5", None),
          "sfx_police_whistle": (1950.0, 2250.0, 2093.00, "C7 (centre of the pea trill)", None),
          "sfx_coin_count": (1330.0, 1460.0, 1396.91, "F6 'ching'", (0.72, 1.3)),
          "sfx_ticket_chime": (980.0, 1120.0, 1046.50, "C6 'ding'", (0.0, 0.3))}
# sounds whose pitch is a trill / FM cluster: measure the power-weighted centre of the band, not the strongest line
# (the pea's ~26 Hz flutter puts more energy in the sidebands than in the carrier)
TUNE_CENTROID = {"sfx_police_whistle"}
# percussive cues checked against detected onsets (soft swells / creaks / the bell's 2nd burst are not onsets)
ONSET_CUES = {"sfx_forklift_beep": ("beep1", "beep2", "beep3"), "sfx_vault_door": ("bolt1", "bolt2", "bolt3", "open"),
              "sfx_collapse_soft": ("crack", "donk1", "donk2", "donk3", "flumph", "plink"),
              "sfx_cuffs_click": ("ratchet", "latch"), "sfx_police_whistle": ("blast1", "blast2"),
              "sfx_fire_alarm_bell": ("ring1",), "sfx_coin_count": ("first", "ching"), "sfx_stamp": ("thunk",),
              "sfx_moving_truck": ("brake", "door", "doorTop", "ramp", "rampDown"), "sfx_steam_hiss": ("hiss",),
              "sfx_demolish_crunch": ("bite",), "sfx_fire_flare": ("flare",), "sfx_ticket_chime": ("ding", "dong")}
HARSH_KEYS = ("sfx_siren_fire", "sfx_siren_police", "sfx_fire_alarm_bell", "sfx_police_whistle", "sfx_forklift_beep",
              "amb_fire_big", "sfx_hose_spray")
WANT_CH = {"music": 2, "ambience": 1, "sfx": 1}
MAX_PAYLOAD = 4_000_000                      # '4 MB' read strictly (decimal)
HEADROOM_DB = -2.0
TARGET_V1 = {"music": -24.5 + HEADROOM_DB}               # bgm_village effective level (target + headroom)
PHONE_MAX_LOSS = 6.0                         # dB lost through the phone-speaker model (critic's fail line)


def phone_weight(x):
    """Crude phone speaker (the critic's model): 4th-order high-pass at 500 Hz + 2nd-order low-pass at 9 kHz."""
    from scipy import signal
    sos = np.vstack([signal.butter(4, 500, "hp", fs=44100, output="sos"),
                     signal.butter(2, 9000, "lp", fs=44100, output="sos")])
    return signal.sosfilt(sos, np.atleast_2d(x), axis=-1)


def levels(x):
    """(integrated LUFS, max momentary LUFS) of (ch, n) with 0.5 s of silence appended (ebur128 practice)."""
    x = np.atleast_2d(x)
    pad = np.concatenate([x, np.zeros((x.shape[0], S.n_of(0.5)))], axis=1)
    return S.lufs(pad), S.momentary_max(pad)


_JS48 = r"""
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
function loadPW() {
  try { return require('playwright'); } catch (e) { /* next */ }
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* */ }
  roots.push('/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules');
  for (const r of roots) { try { return require(path.join(r, 'playwright')); } catch (e) { /* next */ } }
  throw new Error('playwright package not found');
}
const files = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { chromium } = loadPW();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body>decode test</body></html>');
const out = { version: browser.version(), files: [] };
for (const f of files) {
  const b64 = fs.readFileSync(f.path).toString('base64');
  const r = await page.evaluate(async ({ b64 }) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const res = {};
    for (const sr of [44100, 48000]) {
      const ctx = new OfflineAudioContext(1, 1, sr);
      let buf;
      try { buf = await ctx.decodeAudioData(u.buffer.slice(0)); } catch (e) { return { error: String(e) }; }
      let seam = 0, ref = 0;
      for (let c = 0; c < buf.numberOfChannels; c++) {
        const x = buf.getChannelData(c), n = x.length;
        const at = (i) => x[((i % n) + n) % n];
        const d2 = (i) => Math.abs(at(i) - 2 * at(i - 1) + at(i - 2));
        for (const i of [0, 1, 2]) seam = Math.max(seam, d2(i));        // differences straddling the wrap
        const s = []; for (let i = 2; i < n; i += 3) s.push(d2(i));
        s.sort((a, b) => a - b); ref = Math.max(ref, s[Math.floor(s.length * 0.999)]);
      }
      res[sr] = { length: buf.length, channels: buf.numberOfChannels, seamRatio: seam / Math.max(ref, 1e-9) };
    }
    return res;
  }, { b64 });
  out.files.push(Object.assign({ key: f.key, fmt: f.fmt }, r));
}
await browser.close();
console.log(JSON.stringify(out));
"""


def chromium_decode2(items):
    """items: [{key, path, fmt}] -> {version, files: [{key, fmt, 44100: {length, channels, seamRatio}, 48000: ...}]}
    (decodeAudioData into 44.1 kHz and 48 kHz OfflineAudioContexts) or {'error': ...}."""
    import subprocess
    os.makedirs(CACHE, exist_ok=True)
    js, lst = os.path.join(CACHE, "chromium_decode48.mjs"), os.path.join(CACHE, "chromium_decode48.json")
    with open(js, "w") as f:
        f.write(_JS48)
    with open(lst, "w") as f:
        json.dump(items, f)
    try:
        p = subprocess.run(["node", js, lst], capture_output=True, text=True, timeout=480)
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not run node: {e}"}
    if p.returncode != 0:
        return {"error": (p.stderr or p.stdout).strip().splitlines()[-1:] or ["node failed"]}
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {"error": f"bad output: {e}: {p.stdout[-300:]}"}


def targets():
    """Loudness targets from build_audio6 (only to report effective-level errors)."""
    try:
        import build_audio6 as B6
        return {k: v[2] for k, v in B6.SOUNDS.items()}
    except Exception:  # noqa: BLE001
        return {}


def other_fragments():
    """Every other assets/audio* fragment that has a manifest (audio .. audio5 and any later one)."""
    out = []
    for d in sorted(os.listdir(ASSETS)):
        if d.startswith("audio") and d != "audio6" and os.path.exists(os.path.join(ASSETS, d, "manifest.json")):
            out.append(d)
    return out


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


def band_centroid(x, lo, hi):
    """Power-weighted mean frequency between lo and hi Hz (pitch centre of a trill / vibrato)."""
    m = np.atleast_2d(x).mean(axis=0)
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
    f = np.fft.rfftfreq(len(m), 1 / 44100)
    sel = (f >= lo) & (f <= hi)
    return float((sp[sel] * f[sel]).sum() / max(sp[sel].sum(), 1e-20))


def onsets(x, hop: float = 0.004, thr_db: float = 9.0):
    """Simple onset detector: high-passed energy in 4 ms hops, rise of > thr_db against the previous 20 ms."""
    m = S.hp(np.atleast_2d(x).mean(axis=0), 250, order=2)
    h = S.n_of(hop)
    nf = len(m) // h
    e = np.array([np.sum(m[i * h:(i + 1) * h] ** 2) for i in range(nf)]) + 1e-12
    ref = np.array([e[max(0, i - 5):i].mean() if i else 1e-12 for i in range(nf)])
    rise = 10 * np.log10(e / np.maximum(ref, 1e-12))
    gate = e > e.max() * 10 ** (-36 / 10)
    out, last = [], -1.0
    for i in np.nonzero((rise > thr_db) & gate)[0]:
        t = i * hop
        if t - last > 0.03:
            out.append(t)
            last = t
    return out


def harshness(x):
    """(share of energy above 4 kHz in %, spectral centroid in Hz)."""
    m = np.atleast_2d(x).mean(axis=0)
    sp = np.abs(np.fft.rfft(m)) ** 2
    f = np.fft.rfftfreq(len(m), 1 / 44100)
    tot = sp[f > 40].sum() + 1e-20
    return 100.0 * sp[f > 4000].sum() / tot, float((sp * f)[f > 40].sum() / tot)


# ----------------------------------------------------------------------------- previews
def previews_png(rows, path):
    """Waveform of every key (3 columns) + spectrogram strips of the loops + spectrograms of every one-shot."""
    from PIL import Image, ImageDraw

    import preview as P
    cols, tw, th, lh = 3, 400, 58, 30
    nrow = (len(rows) + cols - 1) // cols
    wave_h = nrow * (th + lh + 10) + 46
    loops = [r for r in rows if r["loop"]]
    lw, lh2 = 1236, 120
    loop_h = len(loops) * (lh2 + 66) + 30
    spec = [r for r in rows if not r["loop"]]
    vw, vh = 300, 110
    vcols = 4
    vrows = (len(spec) + vcols - 1) // vcols
    spec_h = vrows * (vh + 36) + 30
    W = cols * (tw + 12) + 12
    img = Image.new("RGB", (W, wave_h + loop_h + spec_h), P.BG)
    d = ImageDraw.Draw(img)
    d.text((12, 10), "Frost Village audio6 (v8 living city) - waveforms (light = RMS, dark = peak; red lines = -1 dBFS; "
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
    d.text((12, y0), "One-shots - spectrogram 40 Hz-12 kHz", fill=P.TXT, font=P.font(15))
    for i, r in enumerate(spec):
        cx, cy = 12 + (i % vcols) * (vw + 12), y0 + 26 + (i // vcols) * (vh + 36)
        d.text((cx, cy), f"{r['key']} {r['dur']:.2f}s", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], vw, vh, nfft=1024), (cx, cy + 16))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man6, path_mp3):
    """~76 s 'a day in the living city' at manifest volumes x call-site volume (like the game):
    morning city (bgm_city, amb_town, bus, chatter, newspaper boy) -> the bank (amb_bank, door, the queue chime,
    coins counted, stamp, vault) -> the logistics centre (amb_warehouse, forklift beeps, boxes, a moving truck, settlement stamp)
    -> fire! (alarm bell, gasps, flare, the big fire, the fire engine's siren approaching, brakes, hose, steam,
    cheer) -> a bread thief (whistle, bgm_chase, police siren, dust-cloud scuffle, whistle, cuffs, cheer) ->
    next morning the paper (bgm_city, newspaper, laugh)."""
    mans = {}
    for frag in other_fragments():
        with open(os.path.join(ASSETS, frag, "manifest.json")) as f:
            mans[frag] = json.load(f)
    mans["audio6"] = man6
    order = ["audio6"] + sorted((k for k in mans if k != "audio6"), reverse=True)
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

    DUR_S = 76.0
    n = S.n_of(DUR_S)
    bed, fx = np.zeros((2, n)), np.zeros((2, n))
    r = np.random.default_rng(8)
    last = {}

    def pick(key):
        if key in groups:
            opts = groups[key]
            i = int(r.integers(len(opts)))
            if len(opts) > 1 and i == last.get(key):
                i = (i + 1) % len(opts)
            last[key] = i
            return opts[i]
        return key

    def sfx(t, key, vol=1.0, p=0.0, rate=1.0):
        key = pick(key)
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

    def loop(key, env_pts, p=0.0, vol=1.0, start=0.0):
        x = get(key)
        x = x if x.shape[0] == 2 else S.pan(x[0], p)
        i0 = S.n_of(start)
        y = np.zeros((2, n))
        reps = int(np.ceil((n - i0) / x.shape[1])) + 1
        y[:, i0:] = np.tile(x, (1, reps))[:, :n - i0]
        bed[:] += src(key)[0]["volume"] * vol * y * S.env_pts(env_pts, n)

    E = DUR_S
    # ---------------------------------------------------------------- music beds
    loop("bgm_city", [(0, 0), (1.0, 1), (11, 1), (13, 0.4), (30, 0.4), (32, 0.5), (49.5, 0.5), (51, 0), (E, 0)])
    loop("bgm_chase", [(0, 0), (50.6, 0), (51.2, 1), (63.5, 1), (65.5, 0), (E, 0)], start=50.6)
    loop("bgm_city", [(0, 0), (66.5, 0), (68, 0.9), (E - 0.6, 0.9), (E, 0)], start=66.5)
    # ---------------------------------------------------------------- ambience beds
    loop("amb_town", [(0, 0), (0.5, 0.7), (11, 0.7), (13, 0.15), (30, 0.15), (32, 0.5), (49, 0.5), (66, 0.4),
                      (68, 0.7), (E, 0.7)])
    loop("amb_bank", [(0, 0), (11.5, 0), (13, 1.0), (21.5, 1.0), (23, 0), (E, 0)])
    loop("amb_warehouse", [(0, 0), (21.5, 0), (23, 1.0), (31, 1.0), (32.5, 0), (E, 0)])
    loop("amb_fire_big", [(0, 0), (34.4, 0), (35.2, 0.7), (40, 1.0), (45.5, 1.0), (47.5, 0.15), (48.5, 0), (E, 0)], p=0.15)
    loop("sfx_siren_fire", [(0, 0), (36.5, 0), (37, 0.2), (41.5, 0.9), (42.6, 0.9), (43.6, 0), (E, 0)], p=-0.3)
    loop("sfx_hose_spray", [(0, 0), (43.6, 0), (43.9, 0.9), (46.8, 0.9), (47.1, 0), (E, 0)], p=0.1)
    loop("sfx_siren_police", [(0, 0), (52.8, 0), (53.3, 0.35), (58, 0.8), (59, 0.8), (59.6, 0), (E, 0)], p=0.3)
    loop("sfx_comic_fight", [(0, 0), (59.4, 0), (59.6, 1.0), (62.2, 1.0), (62.4, 0), (E, 0)], p=-0.1)
    bed[:, -S.n_of(0.05):] *= np.linspace(1, 0, S.n_of(0.05))
    # ---------------------------------------------------------------- one-shots
    # morning city
    sfx(1.2, "sfx_bell_hall", 0.45, 0.3)
    sfx(3.6, "sfx_bus_horn", 0.5, -0.4)
    sfx(5.0, "sfx_chatter", 0.6, 0.2)
    sfx(5.7, "sfx_chatter", 0.6, -0.1)
    sfx(7.0, "sfx_newspaper", 0.8, 0.25)
    sfx(8.4, "sfx_car_honk", 0.45, 0.5)
    sfx(9.6, "sfx_laugh", 0.5, -0.2)
    # the bank
    sfx(12.2, "sfx_door", 0.8, 0.0)
    sfx(13.4, "sfx_ticket_chime", 1.0, -0.15)
    sfx(14.2, "sfx_chatter_lo", 0.5, 0.2)
    sfx(15.2, "sfx_coin_count", 1.0, 0.1)
    sfx(17.0, "sfx_stamp", 1.0, 0.1)
    sfx(18.4, "sfx_vault_door", 0.9, -0.25)
    sfx(20.3, "sfx_ticket_chime", 0.85, -0.15)
    sfx(21.0, "sfx_cash", 0.6, 0.1)
    # the logistics centre
    sfx(23.6, "sfx_forklift_beep", 0.8, -0.35)
    sfx(24.86, "sfx_forklift_beep", 0.8, -0.35)
    sfx(28.4, "sfx_chatter_lo", 0.4, 0.3)
    sfx(25.3, "sfx_box", 1.0, 0.2)
    sfx(25.8, "sfx_box", 0.8, 0.25, 1.08)
    sfx(26.3, "sfx_box", 0.9, 0.15, 0.94)
    sfx(26.8, "sfx_moving_truck", 0.9, 0.4)
    sfx(29.6, "sfx_stamp", 1.0, 0.0)
    sfx(30.2, "sfx_coins_many", 0.6, 0.0)
    # fire!
    sfx(33.0, "sfx_fire_alarm_bell", 1.0, 0.1)
    sfx(34.1, "sfx_crowd_gasp", 1.0, 0.0)
    sfx(34.6, "sfx_fire_flare", 1.0, 0.15)
    sfx(38.8, "sfx_fire_flare", 0.6, 0.3)
    sfx(42.6, "sfx_brakes", 0.6, -0.3)
    sfx(42.9, "sfx_door", 0.6, -0.3)
    sfx(47.0, "sfx_steam_hiss", 1.0, 0.15)
    sfx(48.9, "sfx_crowd_cheer_small", 1.0, 0.0)
    # the bread thief
    sfx(51.0, "sfx_police_whistle", 1.0, 0.2)
    sfx(51.7, "sfx_crowd_gasp", 0.7, -0.2)
    sfx(55.5, "sfx_chatter", 0.5, -0.3)
    sfx(62.3, "sfx_police_whistle", 0.8, 0.0)
    sfx(63.2, "sfx_cuffs_click", 1.0, 0.0)
    sfx(64.0, "sfx_crowd_cheer_small", 0.8, 0.1)
    # next morning: the paper
    sfx(68.2, "sfx_newspaper", 1.0, 0.0)
    sfx(69.6, "sfx_chatter", 0.6, 0.2)
    sfx(70.4, "sfx_laugh", 0.6, 0.25)
    sfx(72.5, "sfx_bus_horn", 0.4, -0.4)
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "audio6_demo.wav")
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
    man_p = os.path.join(AUD6, "manifest.json")
    try:
        with open(man_p) as f:
            man = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: cannot read {man_p}: {e}")
        return 1
    audio, groups = man.get("audio", {}), man.get("audioGroups", {})
    if man.get("version") != 1:
        fail("manifest version != 1")
    for frag in other_fragments():
        try:
            with open(os.path.join(ASSETS, frag, "manifest.json")) as f:
                mo = json.load(f)
            oa, og = mo.get("audio", {}), mo.get("audioGroups", {})
            clash = sorted((set(audio) & set(oa)) | (set(groups) & set(og)) | (set(groups) & set(oa)) |
                           (set(audio) & set(og)))
            if clash:
                fail(f"keys / groups collide with assets/{frag} (fragments merge with Object.assign): {clash}")
        except Exception as e:  # noqa: BLE001
            warns.append(f"could not read assets/{frag}/manifest.json for the collision check: {e}")
    lines.append(f"collision check against: {', '.join(other_fragments())}")

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
            if any(not f.startswith("audio6/") for f in files):
                fail(f"{k}: files must live in audio6/: {files}")
    extra = sorted(set(audio) - {k for ks in CONTRACT.values() for k in ks})
    if extra:
        warns.append(f"extra keys (allowed): {extra}")
    for g, cnt in CONTRACT_GROUPS.items():
        if len(groups.get(g, [])) != cnt:
            fail(f"audioGroups.{g} = {groups.get(g)}, expected {cnt} members")
    for g, members in groups.items():
        missing = [m for m in members if m not in audio]
        if missing:
            fail(f"audioGroups.{g} references unknown keys {missing}")

    # ---- per file
    tg = targets()
    total = 0
    lines.append(f"{'key':22s} {'fmt':4s} {'ch':>2s} {'dur s':>7s} {'peak':>6s} {'TP':>6s} {'I LUFS':>7s} "
                 f"{'Mmax':>6s} {'vol':>6s} {'eff':>6s} {'want':>6s} {'DC':>8s} {'kB':>6s}")
    loop_items, onset_lines, harsh_lines, phone_rows = [], [], [], []
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
                lines.append(f"{k:22s} {fmt:4s} {info['channels']:2d} {dur:7.3f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                             f"{m['I']:7.1f} {m['M']:6.1f} {a.get('volume', 0):6.3f} {eff:6.1f} {want:6.1f} {dc:8.5f} "
                             f"{size / 1024:6.1f}")
                if m["peak"] > -1.0:
                    fail(f"{k}: {fmt} sample peak {m['peak']:.2f} dBFS > -1")
                if m["tpk"] > -1.0:
                    warns.append(f"{k}: {fmt} true peak {m['tpk']:.2f} dBTP > -1")
                if dc > 0.002:
                    fail(f"{k}: {fmt} DC offset {dc:.4f}")
                if np.isfinite(want) and abs(eff - want) > 1.0:
                    if a.get("volume") in (0.05, 1.0):
                        warns.append(f"{k}: {fmt} effective level {eff:.1f} vs target {want:.1f} (volume clamped)")
                    elif fmt == "ogg":
                        fail(f"{k}: effective level {eff:.1f} LUFS, target {want:.1f}")
                    else:
                        warns.append(f"{k}: mp3 effective level {eff:.1f} vs target {want:.1f}")
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
                    lo, hi, hz, name, win = TUNING[k]
                    xx = x if win is None else x[:, S.n_of(win[0]):S.n_of(win[1])]
                    got = band_centroid(xx, lo, hi) if k in TUNE_CENTROID else peak_hz(xx, lo, hi)
                    cents = 1200 * np.log2(got / hz)
                    how = "band centre" if k in TUNE_CENTROID else "strongest partial"
                    lines.append(f"{'':22s} tuning: {how} {got:.1f} Hz = {name} {cents:+.1f} cents")
                    if abs(cents) > 25:
                        fail(f"{k}: tuned {cents:+.0f} cents off {name}")
                if fmt == "ogg" and k in ONSET_CUES and a.get("cues"):
                    det = onsets(x)
                    parts = []
                    for cn, ct in a["cues"].items():
                        if cn not in ONSET_CUES[k]:
                            continue
                        near = min(det, key=lambda d: abs(d - ct)) if det else None
                        err = (near - ct) * 1000 if near is not None else float("nan")
                        parts.append(f"{cn} {ct:.2f}->{near:.3f}" if near is not None else f"{cn} {ct:.2f}->none")
                        if near is None or abs(err) > 40:
                            warns.append(f"{k}: cue '{cn}' {ct:.2f}s: nearest onset "
                                         f"{'none' if near is None else f'{near:.3f}s'} ({err:+.0f} ms)")
                    onset_lines.append(f"  {k:22s} " + ", ".join(parts))
                if fmt == "ogg" and k in HARSH_KEYS:
                    hs, cen = harshness(x)
                    harsh_lines.append(f"  {k:22s} energy > 4 kHz {hs:5.1f} %   centroid {cen:6.0f} Hz")
                if fmt == "ogg":
                    fI, fM = levels(x)
                    pI, pM = levels(phone_weight(x))
                    full, ph = (fM, pM) if kind == "sfx" else (fI, pI)
                    loss = full - ph
                    g = 20 * np.log10(max(a.get("volume", 1.0), 1e-6))
                    phone_rows.append((k, kind, loss, ph + g, "Mmax" if kind == "sfx" else "I"))
                    if loss > PHONE_MAX_LOSS:
                        fail(f"{k}: loses {loss:.1f} dB on a phone speaker (> {PHONE_MAX_LOSS:.0f} dB): too much of it "
                             f"is below 500 Hz")
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
                if round(a.get("duration", 0) * 44100) != x.shape[1]:          # Audio.trimLoops: round(duration*rate)
                    fail(f"{k}: manifest duration {a.get('duration')} * 44100 rounds to "
                         f"{round(a.get('duration', 0) * 44100)}, not loopSamples {x.shape[1]}")
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
            rows.append({"key": k, "kind": kind, "x": x, "dur": x.shape[1] / 44100 if a.get("loop") else
                         a.get("duration", x.shape[1] / 44100), "I": m["I"], "M": m["M"],
                         "peak": max(m["peak"], decoded.get("mp3", (None, m))[1]["peak"]),
                         "vol": a.get("volume"), "loop": bool(a.get("loop"))})
    if onset_lines:
        lines.append("cue timing (manifest cue -> nearest detected onset, s):")
        lines.extend(onset_lines)
    ref = os.path.join(ASSETS, "audio3", "sfx_bus_horn.ogg")
    if os.path.exists(ref):
        hs, cen = harshness(F.decode(ref, 1))
        harsh_lines.append(f"  {'(audio3 sfx_bus_horn)':22s} energy > 4 kHz {hs:5.1f} %   centroid {cen:6.0f} Hz")
    if harsh_lines:
        lines.append("friendliness (less energy up top = rounder, less shrill):")
        lines.extend(harsh_lines)
    if phone_rows:
        ref_fire = None
        try:
            with open(os.path.join(ASSETS, "audio", "manifest.json")) as f:
                af = json.load(f)["audio"]["amb_fire"]
            xf = F.decode(os.path.join(ASSETS, af["files"][0]), 1)
            ref_fire = levels(phone_weight(xf))[0] + 20 * np.log10(af["volume"])
        except Exception as e:  # noqa: BLE001
            warns.append(f"could not measure assets/audio amb_fire for the phone comparison: {e}")
        lines.append(f"phone speaker model (HP 500 Hz 4th order + LP 9 kHz): loss must be <= {PHONE_MAX_LOSS:.0f} dB; "
                     "phone-effective = phone-weighted level + 20 log10(volume)")
        for k, kind, loss, peff, what in sorted(phone_rows, key=lambda t: -t[2]):
            lines.append(f"  {k:22s} {kind:8s} loss {loss:5.1f} dB   phone-effective {what} {peff:6.1f}")
        if ref_fire is not None:
            big = [t for t in phone_rows if t[0] == "amb_fire_big"]
            lines.append(f"  {'(audio amb_fire, v1)':22s} {'ambience':8s} {'':14s}   phone-effective I {ref_fire:6.1f}")
            if big and big[0][3] < ref_fire - 0.05:
                fail(f"amb_fire_big is quieter on a phone ({big[0][3]:.1f}) than the v1 camp fire amb_fire "
                     f"({ref_fire:.1f})")
    man_size = os.path.getsize(man_p)
    total += man_size
    lines.append(f"total payload assets/audio6 (audio files + manifest): {total} bytes = {total / 1e6:.3f} MB = "
                 f"{total / 1024 / 1024:.3f} MiB (limit {MAX_PAYLOAD} bytes)")
    if total > MAX_PAYLOAD:
        fail(f"payload {total} bytes > {MAX_PAYLOAD}")
    on_disk = sorted(os.listdir(AUD6))
    listed = {"manifest.json"} | {os.path.basename(f) for a in audio.values() for f in a.get("files", [])}
    stray = [f for f in on_disk if f not in listed]
    if stray:
        warns.append(f"files in assets/audio6 not referenced by the manifest: {stray}")

    # ---- headless Chromium decode of the loops at 44.1 kHz and 48 kHz (phones)
    if "--no-browser" not in argv and loop_items:
        res = chromium_decode2([{k: v for k, v in it.items() if k != "want"} for it in loop_items])
        if "error" in res:
            warns.append(f"Chromium decode test not run: {res['error']}")
        else:
            lines.append(f"headless Chromium {res.get('version')} decodeAudioData (OfflineAudioContext 44.1 kHz | 48 kHz):")
            for it, rr in zip(loop_items, res["files"]):
                if "error" in rr:
                    fail(f"{it['key']}: Chromium cannot decode {it['fmt']}: {rr['error']}")
                    continue
                a44, a48 = rr["44100"], rr["48000"]
                ok = a44["length"] == it["want"]
                diff = "exact" if ok else "%+d" % (a44["length"] - it["want"])
                ideal48 = it["want"] * 48000 / 44100
                lines.append(f"  {it['key']:22s} {it['fmt']}: {a44['length']} frames x {a44['channels']} ch "
                             f"(want {it['want']}, {diff}), seam {a44['seamRatio']:.3f} | 48k: {a48['length']} frames "
                             f"(ideal {ideal48:.2f}), seam {a48['seamRatio']:.3f}")
                if not ok:
                    if it["fmt"] == "ogg":
                        fail(f"{it['key']}: Chromium decodes the ogg loop to {a44['length']} frames, want {it['want']}")
                    else:
                        warns.append(f"{it['key']}: Chromium mp3 decode {a44['length']} vs {it['want']} frames "
                                     f"(Audio.trimLoops handles longer buffers)")
                for sr, aa in (("44.1", a44), ("48", a48)):
                    if aa["seamRatio"] > 1.0:
                        fail(f"{it['key']}: Chromium-decoded {it['fmt']} jumps at the seam at {sr} kHz "
                             f"(ratio {aa['seamRatio']:.2f})")

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
            demo_txt = demo_mix(man, os.path.join(PREV, "audio6_demo.mp3"))
        except Exception as e:  # noqa: BLE001
            warns.append(f"demo mix failed: {e}")
    os.makedirs(PREV, exist_ok=True)
    report = "\n".join(lines + ([demo_txt] if demo_txt else []) + [""] + [f"WARN: {w}" for w in warns] +
                       [f"FAIL: {f}" for f in fails] + ["", "RESULT: " + ("FAIL" if fails else "OK")])
    with open(os.path.join(PREV, "audio6_report.txt"), "w") as f:
        f.write(report + "\n")
    print(report)
    if "--no-png" not in argv and rows:
        previews_png(rows, os.path.join(PREV, "audio6_waveforms.png"))
        print("wrote docs/previews/audio6_waveforms.png" + (", audio6_demo.mp3" if demo_txt else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
