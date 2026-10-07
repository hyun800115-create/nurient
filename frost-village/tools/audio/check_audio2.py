"""Frost Village - audio QA for assets/audio2 (CONTRACT_V3 section G) + human previews.

Run:  python3 tools/audio/check_audio2.py [--no-png] [--no-demo] [--no-browser]   (exit 1 on any FAIL)
Checks
  * every section G key is in assets/audio2/manifest.json with files [.ogg, .mp3] that exist and decode
    at 44.1 kHz (bgm_spring stereo, sfx_lute + sfx mono), kind / loop / volume sane; audioGroups
    sfx_hammer (3), sfx_chatter (6), sfx_laugh (2) complete; no key collides with assets/audio;
  * per file: duration (DUR ranges, e.g. chatter 0.25-0.6 s, lute 8-12 s, spring 60-90 s), sample
    peak <= -1 dBFS, true peak, integrated + max momentary LUFS (ffmpeg ebur128), DC offset;
    sfx: no leading silence (<= 4 ms), faded tail;
  * loops: decoded .ogg length == rendered loop length, .ogg end padding == 0, manifest loopSamples,
    click detector at the wrap (check_audio.loop_metrics: hf_ratio / d2_ratio must be < 1);
  * headless Chromium (Playwright): decodeAudioData of every .ogg loop must return exactly
    loopSamples frames (Chromium ignores the Vorbis end-trim) and the wrap must not jump
    (2nd-difference at the seam vs the 99.9th percentile of the whole buffer); mp3 lengths reported;
  * payload of assets/audio2 <= 3 MB; mix sanity vs assets/audio (effective level = file level +
    20 log10(volume) should land on the same targets as the v1 sounds).
Writes docs/previews/audio2_report.txt, audio2_waveforms.png (waveform of every key + spectrograms of the
loops and the voices) and audio2_demo.mp3 (a 46 s 'village day -> spring' soundscape mixed from the
delivered files at their manifest volumes over the v1 music / ambience).
"""
from __future__ import annotations

import json
import os
import subprocess
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
AUD2 = os.path.join(ASSETS, "audio2")
AUD1 = os.path.join(ASSETS, "audio")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.path.join(HERE, "_cache", "audio2")

# CONTRACT_V3 section G, written out independently of build_audio2.py on purpose.
CONTRACT = {
    "music": ["bgm_spring"],
    "ambience": ["sfx_lute"],
    "sfx": ["sfx_hammer_1", "sfx_hammer_2", "sfx_hammer_3", "sfx_build_done", "sfx_saw_short", "sfx_boat_horn",
            "sfx_row", "sfx_register", "sfx_tower_fire", "sfx_fog_clear",
            "sfx_chatter_1", "sfx_chatter_2", "sfx_chatter_3", "sfx_chatter_4", "sfx_chatter_5", "sfx_chatter_6",
            "sfx_laugh_1", "sfx_laugh_2", "sfx_snowball_throw", "sfx_snowball_hit", "sfx_dog_bark",
            "sfx_cat_meow", "sfx_penguin", "sfx_cheer"],
}
CONTRACT_GROUPS = {"sfx_hammer": 3, "sfx_chatter": 6, "sfx_laugh": 2}
DUR = {"bgm_spring": (60, 90), "sfx_lute": (8, 12), "sfx_cheer": (1.0, 3.0), "sfx_fog_clear": (1.5, 4.0),
       "sfx_build_done": (1.0, 3.0), "sfx_laugh_1": (0.4, 1.2), "sfx_laugh_2": (0.4, 1.2),
       **{f"sfx_chatter_{i}": (0.25, 0.6) for i in range(1, 7)},
       **{f"sfx_hammer_{i}": (0.08, 0.5) for i in range(1, 4)}}
WANT_CH = {"music": 2, "ambience": 1, "sfx": 1}
MAX_PAYLOAD = 3 * 1024 * 1024
TARGET_V1 = {"music": -24.5 - 2.0}                       # bgm_village effective level (target + headroom)


# ----------------------------------------------------------------------------- headless Chromium
_JS = r"""
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
    const ctx = new OfflineAudioContext(1, 1, 44100);          // 44.1 kHz: no resampling on decode
    let buf;
    try { buf = await ctx.decodeAudioData(u.buffer); } catch (e) { return { error: String(e) }; }
    let seam = 0, ref = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const x = buf.getChannelData(c), n = x.length;
      const at = (i) => x[((i % n) + n) % n];
      const d2 = (i) => Math.abs(at(i) - 2 * at(i - 1) + at(i - 2));
      for (const i of [0, 1, 2]) seam = Math.max(seam, d2(i));        // differences straddling the wrap
      const s = []; for (let i = 2; i < n; i += 5) s.push(d2(i));
      s.sort((a, b) => a - b); ref = Math.max(ref, s[Math.floor(s.length * 0.999)]);
    }
    return { length: buf.length, sampleRate: buf.sampleRate, channels: buf.numberOfChannels, seamRatio: seam / Math.max(ref, 1e-9) };
  }, { b64 });
  out.files.push(Object.assign({ key: f.key, fmt: f.fmt }, r));
}
await browser.close();
console.log(JSON.stringify(out));
"""


def chromium_decode(items):
    """items: [{key, path, fmt}] -> parsed JSON from the Playwright script (or {'error': ...})."""
    os.makedirs(CACHE, exist_ok=True)
    js, lst = os.path.join(CACHE, "chromium_decode.mjs"), os.path.join(CACHE, "chromium_decode.json")
    with open(js, "w") as f:
        f.write(_JS)
    with open(lst, "w") as f:
        json.dump(items, f)
    try:
        p = subprocess.run(["node", js, lst], capture_output=True, text=True, timeout=240)
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not run node: {e}"}
    if p.returncode != 0:
        return {"error": (p.stderr or p.stdout).strip().splitlines()[-1:] or ["node failed"]}
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {"error": f"bad output: {e}: {p.stdout[-300:]}"}


# ----------------------------------------------------------------------------- previews
def previews_png(rows, path):
    """One sheet: waveform of every key (3 columns) + spectrogram strips of the loops + voice spectrograms."""
    from PIL import Image, ImageDraw

    import preview as P
    cols, tw, th, lh = 3, 400, 58, 30
    nrow = (len(rows) + cols - 1) // cols
    wave_h = nrow * (th + lh + 10) + 46
    loops = [r for r in rows if r["loop"]]
    lw, lh2 = 1236, 150
    loop_h = len(loops) * (lh2 + 66) + 30
    voices = [r for r in rows if r["key"].startswith(("sfx_chatter", "sfx_laugh", "sfx_cheer", "sfx_dog", "sfx_cat",
                                                       "sfx_penguin"))]
    vw, vh = 300, 120
    vcols = 4
    vrows = (len(voices) + vcols - 1) // vcols
    voice_h = vrows * (vh + 36) + 30
    W = cols * (tw + 12) + 12
    img = Image.new("RGB", (W, wave_h + loop_h + voice_h), P.BG)
    d = ImageDraw.Draw(img)
    d.text((12, 10), "Frost Village audio2 (v2-v4) - waveforms (light = RMS, dark = peak; red lines = -1 dBFS; "
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
    d.text((12, y0), "Voices & animals - spectrogram 40 Hz-12 kHz (formant tracks = the vowels; gaps = consonants)",
           fill=P.TXT, font=P.font(15))
    for i, r in enumerate(voices):
        cx, cy = 12 + (i % vcols) * (vw + 12), y0 + 26 + (i // vcols) * (vh + 36)
        d.text((cx, cy), f"{r['key']} {r['dur']:.2f}s", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], vw, vh, nfft=1024), (cx, cy + 16))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man2, path_mp3):
    """46 s soundscape: a day in the village (v1 music + wind) with every new sound in context, then the
    tower is lit, the fog clears and the music crossfades to bgm_spring. Uses manifest volumes x the
    call-site volume, like the game. Returns a loudness summary string."""
    with open(os.path.join(AUD1, "manifest.json")) as f:
        man1 = json.load(f)
    a1, a2 = man1["audio"], man2["audio"]
    groups = dict(man1.get("audioGroups", {}), **man2.get("audioGroups", {}))
    cache = {}

    def src(key):
        if key in a2:
            return a2[key], os.path.join(ASSETS, a2[key]["files"][0])
        return a1[key], os.path.join(ASSETS, a1[key]["files"][0])

    def get(key):
        if key not in cache:
            a, p = src(key)
            cache[key] = F.decode(p, 2 if a["kind"] == "music" else 1)
        return cache[key]

    DUR_S = 46.0
    n = S.n_of(DUR_S)
    bed, fx = np.zeros((2, n)), np.zeros((2, n))
    r = np.random.default_rng(11)
    last = {}

    def sfx(t, key, vol=1.0, p=0.0, rate=1.0):
        if key in groups:
            opts = groups[key]
            i = int(r.integers(len(opts)))
            if len(opts) > 1 and i == last.get(key):
                i = (i + 1) % len(opts)
            last[key] = i
            key = opts[i]
        x = get(key)[0]
        if rate != 1.0:
            m = int(len(x) / rate)
            x = np.interp(np.arange(m) * rate, np.arange(len(x)), x)
        st = S.pan(x, p) * src(key)[0]["volume"] * vol
        i = S.n_of(t)
        e = min(n, i + st.shape[1])
        fx[:, i:e] += st[:, :e - i]

    def loop(key, env_pts):
        x = get(key)
        x = x if x.shape[0] == 2 else np.vstack([x, x])
        y = np.tile(x, (1, int(np.ceil(n / x.shape[1])) + 1))[:, :n]
        bed[:] += src(key)[0]["volume"] * y * S.env_pts(env_pts, n)

    loop("bgm_village", [(0, 0), (1.0, 1), (27.5, 1), (30.5, 0), (DUR_S, 0)])
    loop("amb_wind", [(0, 0), (1.0, 0.6), (27, 0.6), (31, 0.15), (DUR_S, 0.15)])
    loop("amb_sea", [(0, 0), (20.5, 0), (23, 0.7), (26.5, 0.7), (28.5, 0), (DUR_S, 0)])
    loop("sfx_lute", [(0, 0), (9.5, 0), (12.5, 0.85), (16.5, 0.85), (19.5, 0), (DUR_S, 0)])   # walking past the bard
    loop("bgm_spring", [(0, 0), (28.5, 0), (30.5, 1), (43.0, 1), (DUR_S, 0)])
    bed[:, -S.n_of(0.05):] *= np.linspace(1, 0, S.n_of(0.05))
    # --- villagers chatting near the plaza
    for t, k, p in ((0.6, "sfx_chatter_1", -0.3), (1.35, "sfx_chatter_4", 0.3), (2.15, "sfx_chatter_2", -0.3),
                    (2.85, "sfx_laugh_1", -0.3), (3.7, "sfx_chatter_5", 0.35), (4.5, "sfx_laugh_2", 0.35)):
        sfx(t, k, 0.85, p)
    sfx(5.6, "sfx_snowball_throw", 0.8, -0.45)                 # snowball fight
    sfx(5.95, "sfx_snowball_hit", 0.9, 0.25)
    sfx(6.35, "sfx_chatter_3", 0.8, 0.25)
    sfx(6.9, "sfx_laugh_1", 0.8, -0.45)
    sfx(7.8, "sfx_dog_bark", 0.8, 0.5)                          # pets
    sfx(8.7, "sfx_penguin", 0.7, -0.5)
    sfx(9.7, "sfx_cat_meow", 0.6, 0.35)
    t = 10.2
    while t < 12.6:                                            # walk to the building site (v1 footsteps x0.32)
        sfx(t, "sfx_step_snow", 0.32, 0.0, 0.9 + 0.2 * r.random())
        t += 0.31
    sfx(12.0, "sfx_chatter_6", 0.6, 0.6)                        # dancers by the bard
    for k in range(9):                                         # porters' building site: hammering x0.8
        sfx(12.8 + k * 0.42 + (0.1 if k > 4 else 0.0), "sfx_hammer", 0.8, -0.15)
    sfx(14.9, "sfx_saw_short", 0.8, 0.2)
    sfx(17.1, "sfx_build_done", 1.0)
    sfx(17.7, "sfx_cheer", 0.9)
    sfx(20.0, "sfx_register", 1.0, 0.1)                         # clerk rings up a customer
    sfx(20.5, "sfx_customer_happy", 0.8, 0.1)
    sfx(20.8, "sfx_coin", 0.4, 0.1)
    sfx(22.2, "sfx_boat_horn", 0.8, 0.45)                       # harbour
    for k in range(4):
        sfx(23.6 + k * 0.85, "sfx_row", 0.7, 0.4)
    sfx(27.2, "sfx_tower_fire", 1.0, -0.1)                      # watchtower lit -> fog clears -> spring
    sfx(28.8, "sfx_fog_clear", 1.0)
    sfx(31.2, "sfx_cheer", 1.0)
    for t, k, p in ((33.0, "sfx_chatter_1", -0.3), (33.8, "sfx_laugh_1", -0.3), (35.0, "sfx_chatter_4", 0.3),
                    (36.0, "sfx_dog_bark", 0.5), (37.4, "sfx_laugh_2", 0.3)):
        sfx(t, k, 0.75, p)
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    os.makedirs(CACHE, exist_ok=True)
    wav = os.path.join(CACHE, "audio2_demo.wav")
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
    man_p = os.path.join(AUD2, "manifest.json")
    try:
        with open(man_p) as f:
            man = json.load(f)
    except Exception as e:  # noqa: BLE001
        print(f"FAIL: cannot read {man_p}: {e}")
        return 1
    audio, groups = man.get("audio", {}), man.get("audioGroups", {})
    if man.get("version") != 1:
        fail("manifest version != 1")
    try:
        with open(os.path.join(AUD1, "manifest.json")) as f:
            man1 = json.load(f)
        clash = sorted((set(audio) & set(man1.get("audio", {}))) |
                       (set(groups) & set(man1.get("audioGroups", {}))))
        if clash:
            fail(f"keys collide with assets/audio (fragments merge with Object.assign): {clash}")
    except Exception as e:  # noqa: BLE001
        warns.append(f"could not read assets/audio/manifest.json for the collision check: {e}")

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
            if any(not f.startswith("audio2/") for f in files):
                fail(f"{k}: files must live in audio2/: {files}")
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
    total = 0
    lines.append(f"{'key':20s} {'fmt':4s} {'ch':>2s} {'dur s':>7s} {'peak':>6s} {'TP':>6s} {'I LUFS':>7s} "
                 f"{'Mmax':>6s} {'vol':>6s} {'eff':>6s} {'DC':>8s} {'kB':>6s}")
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
                lines.append(f"{k:20s} {fmt:4s} {info['channels']:2d} {dur:7.3f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                             f"{m['I']:7.1f} {m['M']:6.1f} {a.get('volume', 0):6.3f} {eff:6.1f} {dc:8.5f} {size / 1024:6.1f}")
                if m["peak"] > -1.0:
                    fail(f"{k}: {fmt} sample peak {m['peak']:.2f} dBFS > -1")
                if dc > 0.002:
                    fail(f"{k}: {fmt} DC offset {dc:.4f}")
                if fmt == "ogg" and k in DUR:
                    true_dur = a.get("duration", dur) if kind == "sfx" else dur   # sfx ogg decodes ~20 ms long
                    if not (DUR[k][0] <= true_dur <= DUR[k][1]):
                        fail(f"{k}: duration {true_dur:.2f}s outside {DUR[k]}")
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
            if "ogg" not in decoded:
                continue
            x, m = decoded["ogg"]
            if a.get("loop"):
                lm = loop_metrics(x)
                srcw = os.path.join(CACHE, f"{k}.wav")
                n_src = S.read_wav(srcw).shape[1] if os.path.exists(srcw) else None
                lines.append(f"{'':20s} loop: n={x.shape[1]} (render {n_src}) hf_ratio={lm['hf_ratio']:.3f} "
                             f"d2_ratio={lm['d2_ratio']:.3f} level_jump={lm['lvl_jump_db']:+.1f} dB "
                             f"wrap_jump={lm['wrap_jump']:.4f}")
                if n_src is not None and n_src != x.shape[1]:
                    fail(f"{k}: decoded ogg length {x.shape[1]} != rendered loop {n_src}")
                tail = F.ogg_tail(os.path.join(ASSETS, a["files"][0]))
                lines.append(f"{'':20s} ogg end padding {tail['discard']} smp (must be 0); manifest loopSamples "
                             f"{a.get('loopSamples')}; duration {a.get('duration')} s")
                if tail["discard"] != 0:
                    fail(f"{k}: ogg has {tail['discard']} samples of end padding -> gap at every loop in Chrome")
                if a.get("loopSamples") != x.shape[1]:
                    fail(f"{k}: manifest loopSamples {a.get('loopSamples')} != decoded {x.shape[1]}")
                if abs(a.get("duration", 0) * 44100 - x.shape[1]) > 0.00005 * 44100 + 0.5:     # manifest rounds to 0.1 ms
                    fail(f"{k}: manifest duration {a.get('duration')} != {x.shape[1] / 44100:.4f}")
                if lm["hf_ratio"] > 1.0 or lm["d2_ratio"] > 1.0:
                    fail(f"{k}: possible click at loop point (hf {lm['hf_ratio']:.2f}, d2 {lm['d2_ratio']:.2f})")
                if "mp3" in decoded and decoded["mp3"][0].shape[1] != x.shape[1]:
                    nm = decoded["mp3"][0].shape[1]
                    warns.append(f"{k}: mp3 decodes to {nm} samples vs ogg {x.shape[1]} ({(nm - x.shape[1]) / 44.1:+.1f} ms)"
                                 f" with ffmpeg - mp3 loop relies on the LAME gapless tag / Audio.trimLoops")
                for fmt_, rel in zip(("ogg", "mp3"), a["files"]):
                    loop_items.append({"key": k, "fmt": fmt_, "path": os.path.join(ASSETS, rel),
                                       "want": int(a.get("loopSamples") or x.shape[1])})
            rows.append({"key": k, "kind": kind, "x": x, "dur": x.shape[1] / 44100 if a.get("loop") else
                         a.get("duration", x.shape[1] / 44100), "I": m["I"], "M": m["M"],
                         "peak": max(m["peak"], decoded.get("mp3", (None, m))[1]["peak"]),
                         "vol": a.get("volume"), "loop": bool(a.get("loop"))})
    lines.append(f"total payload assets/audio2: {total / 1024 / 1024:.2f} MB (limit 3 MB)")
    if total > MAX_PAYLOAD:
        fail(f"payload {total / 1024 / 1024:.2f} MB > 3 MB")

    # ---- headless Chromium decode of the loops
    if "--no-browser" not in argv and loop_items:
        res = chromium_decode([{k: v for k, v in it.items() if k != "want"} for it in loop_items])
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
                lines.append(f"  {it['key']:12s} {it['fmt']}: {rr['length']} frames x {rr['channels']} ch "
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
    sp = audio.get("bgm_spring")
    if sp:
        for r_ in rows:
            if r_["key"] == "bgm_spring":
                eff = r_["I"] + 20 * np.log10(sp["volume"])
                lines.append(f"mix: bgm_spring plays at {eff:.1f} LUFS effective (bgm_village target "
                             f"{TARGET_V1['music']:.1f})")
                if abs(eff - TARGET_V1["music"]) > 1.0:
                    warns.append(f"bgm_spring effective level {eff:.1f} vs village {TARGET_V1['music']:.1f}")

    demo_txt = ""
    if "--no-demo" not in argv:
        try:
            demo_txt = demo_mix(man, os.path.join(PREV, "audio2_demo.mp3"))
        except Exception as e:  # noqa: BLE001
            warns.append(f"demo mix failed: {e}")
    os.makedirs(PREV, exist_ok=True)
    report = "\n".join(lines + ([demo_txt] if demo_txt else []) + [""] + [f"WARN: {w}" for w in warns] +
                       [f"FAIL: {f}" for f in fails] + ["", "RESULT: " + ("FAIL" if fails else "OK")])
    with open(os.path.join(PREV, "audio2_report.txt"), "w") as f:
        f.write(report + "\n")
    print(report)
    if "--no-png" not in argv and rows:
        previews_png(rows, os.path.join(PREV, "audio2_waveforms.png"))
        print("wrote docs/previews/audio2_waveforms.png" + (", audio2_demo.mp3" if demo_txt else ""))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
