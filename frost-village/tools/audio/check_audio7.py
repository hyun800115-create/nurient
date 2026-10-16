"""Frost Village - audio QA for assets/audio7 (CONTRACT_V42 section AM, the office + the loop railway) + previews.

Run:  python3 tools/audio/check_audio7.py [--no-demo] [--no-browser]        (exit 1 on any FAIL)
Checks
  * the fragment ships exactly 3 files: manifest.json (= the sprite JSON), audio7_sprite.mp3, amb_office.mp3;
  * every section AM key is in the manifest (kind / loop / volume sane); every one-shot is `inSprite: "audio7"`
    with no files and a [start, duration] in audioSprite.keys; slices are in order, inside the sprite, with >= 50 ms
    gaps (Assets.sliceSprite cuts dur + 30 ms, which must land in the gap); groups sfx_typewriter / sfx_coin_sack;
    no key or group collides with any other assets/audio* fragment;
  * the sprite decodes (ffmpeg) to exactly the length the build wrote; per slice: sample peak and true peak <= -1
    dBFS, duration = the contract's (typewriter 0.6, switch 0.4, squeal 1.2, flag 0.3, coin sack 0.5 s), starts
    on its first sample (<= 4 ms of silence; the squeal starts from silence by design), faded tail, effective level
    (file level + 20 log10 volume) within 1 dB of TARGET + headroom;
  * design checks: 4 key onsets in every typewriter variant, the margin bell (F6) on variant 3, the mailbox bell
    (C7), the three coin-sack variants are different (cross-correlation < 0.85), the squeal is gentle (< 3 % of
    its energy above 4 kHz) and silent at both ends (loops back to back without a click);
  * amb_office: 24 s, decoded length == loopSamples, round(duration * 44100) == loopSamples, mp3StartPad, wrap
    click detector (check_audio.loop_metrics hf / d2 ratio < 1), integrated level on target, its 1 Hz clock;
  * phone speakers: loss through the 500 Hz high-pass / 9 kHz low-pass phone model <= 6 dB for every key;
  * headless Chromium (Playwright): decodeAudioData of the sprite and the loop into 44.1 and 48 kHz contexts -
    the loop decodes to exactly loopSamples at 44.1 kHz and does not jump at the wrap at either rate; every sprite
    slice cut the way Assets.sliceSprite does lines up with the ffmpeg decode within 1 ms.
Writes docs/previews/audio7_report.txt, audio7_spectrograms.png (waveform + spectrogram of every key),
audio7_demo.mp3 (~40 s: a morning in the 촌장 사무실, then the train on the loop) and audio7_preview.html.
Cache: /tmp/fv_cache/audio7 (FV_AUDIO7_CACHE).
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
AUD = os.path.join(ASSETS, "audio7")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.environ.get("FV_AUDIO7_CACHE", "/tmp/fv_cache/audio7")
SR = 44100

# CONTRACT_V42 section AM, written out independently of build_audio7.py on purpose
CONTRACT = {"sfx_typewriter": 0.6, "sfx_switch_clack": 0.4, "sfx_wheel_squeal": 1.2, "sfx_mailbox_flag": 0.3,
            "sfx_coin_sack": 0.5}
VARIANTS = {"sfx_typewriter": 3, "sfx_coin_sack": 3}
LOOP = ("amb_office", 24.0)
FILES = ["amb_office.mp3", "audio7_sprite.mp3", "manifest.json"]
HEADROOM_DB = -2.0
PHONE_MAX_LOSS = 6.0
TUNE = {"sfx_typewriter_3": (1300.0, 1500.0, 1396.91, "F6 margin bell", (0.40, 0.6)),
        "sfx_mailbox_flag": (1950.0, 2250.0, 2093.00, "C7 mailbox bell", (0.07, 0.3))}


def phone_weight(x):
    """Crude phone speaker (audio6 critic's model): 4th-order high-pass at 500 Hz + 2nd-order low-pass at 9 kHz."""
    from scipy import signal
    sos = np.vstack([signal.butter(4, 500, "hp", fs=SR, output="sos"), signal.butter(2, 9000, "lp", fs=SR, output="sos")])
    return signal.sosfilt(sos, np.atleast_2d(x), axis=-1)


def levels(x):
    x = np.atleast_2d(x)
    pad = np.concatenate([x, np.zeros((x.shape[0], S.n_of(0.5)))], axis=1)
    return S.lufs(pad), S.momentary_max(pad)


def peak_hz(x, lo, hi):
    m = np.atleast_2d(x).mean(axis=0)
    n = 1 << int(np.ceil(np.log2(max(len(m), 1 << 16))))
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    idx = np.nonzero((f >= lo) & (f <= hi))[0]
    k = int(idx[np.argmax(sp[idx])])
    a, b, c = np.log(sp[k - 1] + 1e-12), np.log(sp[k] + 1e-12), np.log(sp[k + 1] + 1e-12)
    p = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
    return (k + p) * SR / n


def onsets(x, hop: float = 0.004, thr_db: float = 9.0):
    m = S.hp(np.atleast_2d(x).mean(axis=0), 250, order=2)
    h = S.n_of(hop)
    nf = len(m) // h
    e = np.array([np.sum(m[i * h:(i + 1) * h] ** 2) for i in range(nf)]) + 1e-12
    ref = np.array([e[max(0, i - 5):i].mean() if i else 1e-12 for i in range(nf)])
    rise = 10 * np.log10(e / np.maximum(ref, 1e-12))
    gate = e > e.max() * 10 ** (-30 / 10)
    out, last = [], -1.0
    for i in np.nonzero((rise > thr_db) & gate)[0]:
        t = i * hop
        if t - last > 0.05:
            out.append(round(t, 3))
            last = t
    return out


def harshness(x):
    m = np.atleast_2d(x).mean(axis=0)
    sp = np.abs(np.fft.rfft(m)) ** 2
    f = np.fft.rfftfreq(len(m), 1 / SR)
    tot = sp[f > 40].sum() + 1e-20
    return 100.0 * sp[f > 4000].sum() / tot, float((sp * f)[f > 40].sum() / tot)


def targets():
    try:
        import build_audio7 as B7
        return {k: v[2] for k, v in B7.SOUNDS.items()}
    except Exception:  # noqa: BLE001
        return {}


def other_fragments():
    return [d for d in sorted(os.listdir(ASSETS)) if d.startswith("audio") and d != "audio7"
            and os.path.exists(os.path.join(ASSETS, d, "manifest.json"))]


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
const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { chromium } = loadPW();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body>decode test</body></html>');
const out = { version: browser.version(), files: [] };
for (const f of job.files) {
  const b64 = fs.readFileSync(f.path).toString('base64');
  const r = await page.evaluate(async ({ b64, keys }) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const res = {};
    for (const sr of [44100, 48000]) {
      const ctx = new OfflineAudioContext(1, 1, sr);
      let buf;
      try { buf = await ctx.decodeAudioData(u.buffer.slice(0)); } catch (e) { return { error: String(e) }; }
      const x = buf.getChannelData(0), n = x.length;
      const at = (i) => x[((i % n) + n) % n];
      const d2 = (i) => Math.abs(at(i) - 2 * at(i - 1) + at(i - 2));
      let seam = 0; for (const i of [0, 1, 2]) seam = Math.max(seam, d2(i));
      const s = []; for (let i = 2; i < n; i += 3) s.push(d2(i));
      s.sort((a, b) => a - b);
      const ref = s[Math.floor(s.length * 0.999)];
      const r = { length: n, sampleRate: buf.sampleRate, seamRatio: seam / Math.max(ref, 1e-9) };
      if (keys) {            // Assets.sliceSprite: a = floor(start * sr), n = ceil((dur + 0.03) * sr); energy centroid
        r.slices = {};
        for (const k in keys) {
          const [st, du] = keys[k];
          const a = Math.max(0, Math.floor(st * sr)), m = Math.min(n - a, Math.ceil((du + 0.03) * sr));
          let e = 0, et = 0, pk = 0;
          for (let i = 0; i < m; i++) { const v = x[a + i] * x[a + i]; e += v; et += v * i; pk = Math.max(pk, Math.abs(x[a + i])); }
          r.slices[k] = { centroid: et / Math.max(e, 1e-12) / sr, peak: pk, len: m };
        }
      }
      res[sr] = r;
    }
    return res;
  }, { b64, keys: f.keys || null });
  out.files.push(Object.assign({ key: f.key }, r));
}
await browser.close();
console.log(JSON.stringify(out));
"""


def chromium_decode(job):
    import subprocess
    os.makedirs(CACHE, exist_ok=True)
    js, lst = os.path.join(CACHE, "chromium_decode7.mjs"), os.path.join(CACHE, "chromium_decode7.json")
    with open(js, "w") as f:
        f.write(_JS)
    with open(lst, "w") as f:
        json.dump(job, f)
    try:
        p = subprocess.run(["node", js, lst], capture_output=True, text=True, timeout=300)
    except Exception as e:  # noqa: BLE001
        return {"error": f"could not run node: {e}"}
    if p.returncode != 0:
        return {"error": (p.stderr or p.stdout).strip().splitlines()[-1:] or ["node failed"]}
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except Exception as e:  # noqa: BLE001
        return {"error": f"bad output: {e}"}


# ----------------------------------------------------------------------------- previews
def previews_png(rows, path):
    from PIL import Image, ImageDraw

    import preview as P
    W = 1250
    spec_h, wave_h = 150, 46
    row_h = spec_h + wave_h + 46
    loop_rows = [r for r in rows if r["loop"]]
    one = [r for r in rows if not r["loop"]]
    cols = 3
    cw = (W - 12 * (cols + 1)) // cols
    H = 50 + len(loop_rows) * (row_h + 10) + ((len(one) + cols - 1) // cols) * (row_h + 10) + 20
    img = Image.new("RGB", (W, H), P.BG)
    d = ImageDraw.Draw(img)
    d.text((12, 12), "Frost Village audio7 (v4.2 office + loop railway) - spectrogram 40 Hz-12 kHz (log) + waveform at "
                     "the delivered level; red = -1 dBFS", fill=P.TXT, font=P.font(15))
    y = 44
    for r in loop_rows:
        d.text((12, y), f"{r['key']}  {r['dur']:.2f} s loop  I {r['I']:.1f} LUFS  vol {r['vol']}  (the loop wraps at "
                        f"the right edge)", fill=P.TXT, font=P.font(13))
        img.paste(P.spectrogram(r["x"], W - 24, spec_h), (12, y + 20))
        img.paste(P.waveform(r["x"], W - 24, wave_h, (130, 220, 170), True), (12, y + 22 + spec_h))
        y += row_h + 10
    for i, r in enumerate(one):
        cx = 12 + (i % cols) * (cw + 12)
        cy = y + (i // cols) * (row_h + 10)
        d.text((cx, cy), f"{r['key']}  {r['dur']:.2f} s  Mmax {r['M']:.1f}  vol {r['vol']}", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], cw, spec_h, nfft=1024), (cx, cy + 20))
        img.paste(P.waveform(r["x"], cw, wave_h, (120, 200, 255)), (cx, cy + 22 + spec_h))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man, sprite_pcm, loop_pcm, path_mp3):
    """~40 s at manifest volumes (like the game): a morning in the 촌장 사무실 (amb_office at full reveal under a
    quiet bgm_village, typing, the mailbox flag, the courier's coin sack, a stamp and coins counted, the margin bell)
    then outside at the station loop (wind, the steam whistle, the switch lever, the wheels squealing round the
    curve - two cars, slightly different rates - the brakes, the courier walking past)."""
    mans = {f: json.load(open(os.path.join(ASSETS, f, "manifest.json"))) for f in other_fragments()}
    groups = dict(man.get("audioGroups", {}))
    cache = {}
    r = np.random.default_rng(5)
    last = {}

    def get(key):
        if key in cache:
            return cache[key]
        a = man["audio"].get(key)
        if a and a.get("inSprite"):
            st, du = man["audioSprite"]["keys"][key]
            i = int(round(st * SR))
            cache[key] = (sprite_pcm[i:i + int(round(du * SR))], a["volume"])
        elif key == "amb_office":
            cache[key] = (loop_pcm, a["volume"])
        else:
            for f, m in mans.items():
                b = m.get("audio", {}).get(key)
                if b and b.get("files"):
                    p = os.path.join(ASSETS, [q for q in b["files"] if q.endswith(".mp3")][0])
                    x = F.decode(p)
                    cache[key] = (x.mean(axis=0), b["volume"])
                    break
            else:
                raise KeyError(key)
        return cache[key]

    def pick(key):
        g = groups.get(key)
        for m in mans.values():
            g = g or m.get("audioGroups", {}).get(key)
        if g:
            i = int(r.integers(len(g)))
            if len(g) > 1 and i == last.get(key):
                i = (i + 1) % len(g)
            last[key] = i
            return g[i]
        return key

    DUR = 40.0
    n = S.n_of(DUR)
    bed, fx = np.zeros(n), np.zeros(n)

    def sfx(t, key, vol=1.0, rate=1.0):
        x, v = get(pick(key))
        if rate != 1.0:
            m = int(len(x) / rate)
            x = np.interp(np.arange(m) * rate, np.arange(len(x)), x)
        i = S.n_of(t)
        e = min(n, i + len(x))
        fx[i:e] += x[:e - i] * v * vol

    def loop(key, pts, vol=1.0, start=0.0, rate=1.0):
        x, v = get(key)
        if rate != 1.0:
            m = int(len(x) / rate)
            x = np.interp(np.arange(m) * rate, np.arange(len(x)), x)
        x = np.concatenate([x, np.zeros(S.n_of(0.03))]) if key == "sfx_wheel_squeal" else x   # the sliceSprite tail
        i0 = S.n_of(start)
        reps = int(np.ceil((n - i0) / len(x))) + 1
        y = np.zeros(n)
        y[i0:] = np.tile(x, reps)[:n - i0]
        bed[:] += v * vol * y * S.env_pts(pts, n)

    loop("amb_office", [(0, 0), (0.8, 1), (20.5, 1), (22, 0), (DUR, 0)])
    loop("bgm_village", [(0, 0), (1, 0.35), (21, 0.35), (22.5, 0.5), (DUR - 1, 0.5), (DUR, 0)])
    loop("amb_wind", [(0, 0), (21, 0), (23, 0.7), (DUR, 0.7)])
    t = 1.2
    for k in range(7):                                    # 셈이 types a line
        sfx(t, "sfx_typewriter", 0.9)
        t += r.uniform(0.62, 0.78)
    sfx(t, "sfx_typewriter_3", 0.9)
    sfx(7.4, "sfx_mailbox_flag", 0.8)                     # a letter arrives
    sfx(9.6, "sfx_door", 0.7)
    sfx(10.6, "sfx_coin_sack", 1.0)                       # 딸랑이 comes back with the tills
    sfx(12.0, "sfx_coin_sack", 0.6)
    sfx(13.4, "sfx_coin_sack_3", 1.0)
    sfx(14.6, "sfx_coin_count", 0.9)
    sfx(16.2, "sfx_stamp", 0.8)
    t = 17.2
    for k in range(4):
        sfx(t, "sfx_typewriter", 0.6)
        t += r.uniform(0.6, 0.75)
    # outside: the station loop
    sfx(23.0, "sfx_steam_whistle", 0.5)
    sfx(25.2, "sfx_switch_clack", 1.0)
    loop("sfx_wheel_squeal", [(0, 0), (27.0, 0), (27.5, 1), (32.5, 1), (33.5, 0), (DUR, 0)], 1.0, 27.0, 1.0)
    loop("sfx_wheel_squeal", [(0, 0), (28.1, 0), (28.6, 0.8), (33.6, 0.8), (34.6, 0), (DUR, 0)], 1.0, 28.1, 0.96)
    sfx(34.8, "sfx_brakes", 0.6)
    sfx(37.2, "sfx_coin_sack_2", 0.5)
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    wav = os.path.join(CACHE, "audio7_demo.wav")
    S.write_wav(wav, mix)
    F.encode_mp3(wav, path_mp3, 1, 128)
    lines = [f"demo: bed {S.lufs(bed):.1f} LUFS | sfx layer {S.lufs(fx):.1f} LUFS | mix {S.lufs(mix):.1f} LUFS, "
             f"peak {S.db(pk):.1f} dBFS", "demo timeline (4 s windows, max momentary LUFS)  bed | sfx"]
    for s in range(0, int(DUR), 4):
        a, b = S.n_of(s), S.n_of(s + 4)
        fxm = S.momentary_max(fx[a:b]) if np.any(fx[a:b]) else -99.0
        lines.append(f"  {s:2d}s  {S.momentary_max(bed[a:b]):6.1f} | {fxm:6.1f}")
    return "\n".join(lines)


def preview_html(man, path):
    rows = []
    for k, a in man["audio"].items():
        rows.append(f"<div class='card'><button data-key='{k}' data-loop='{int(bool(a.get('loop') or a.get('loopable')))}'>"
                    f"&#9654;</button><div><b>{k}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                    f"{' &middot; loop' if a.get('loop') or a.get('loopable') else ''}</small></div></div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Office Sounds</title>
<style>
:root{--bg:#F4F7FB;--card:#FFF8EC;--ink:#2B2F3A;--accent:#2CB7A8;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#1b2130;--card:#262e40;--ink:#eef2f8;--accent:#43C9B8;--muted:#9aa3b2}}
body{margin:0;padding:16px;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
h1{font-size:22px;margin:4px 0} p{color:var(--muted);margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:8px;margin-top:12px}
.card{display:flex;gap:10px;align-items:center;background:var(--card);border-radius:12px;padding:8px 10px}
.card b{display:block;font-size:14px;overflow-wrap:anywhere} .card small{color:var(--muted)}
button{width:40px;height:40px;border-radius:50%;border:0;background:var(--accent);color:#fff;font-size:16px;cursor:pointer;flex:none}
button.on{background:#F28C28}
</style></head><body>
<h1>촌장 사무실 · 고리 선로 소리 (audio7)</h1>
<p>게임과 같은 기본 볼륨, 같은 방식(하나의 스프라이트에서 잘라 쓰기)으로 재생합니다. 반복음은 한 번 더 누르면 멈춰요.
Open through the game's local web server (http://.../docs/previews/audio7_preview.html).</p>
<div class="grid">""" + "\n".join(rows) + """</div>
<script>
const BASE='../../assets/audio7/';let ctx,man,sprite,loopBuf;const playing={};
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function dec(u){const ab=await (await fetch(u)).arrayBuffer();return await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no))}
async function init(){if(man)return;man=await (await fetch(BASE+'manifest.json')).json();sprite=await dec('../../assets/'+man.audioSprite.file)}
function slice(k){const [st,du]=man.audioSprite.keys[k],sr=sprite.sampleRate,a=Math.floor(st*sr),n=Math.ceil((du+0.03)*sr);
 const b=ac().createBuffer(1,n,sr);b.getChannelData(0).set(sprite.getChannelData(0).subarray(a,a+n));return b}
async function play(k,btn){await init();const a=man.audio[k];let b;
 if(a.inSprite)b=slice(k);else{if(!loopBuf)loopBuf=await dec('../../assets/'+a.files[0]);b=loopBuf}
 const s=ac().createBufferSource(),g=ac().createGain();s.buffer=b;s.loop=!!(a.loop||a.loopable);g.gain.value=a.volume;
 s.connect(g).connect(ac().destination);s.start();if(s.loop){playing[k]=s;btn.classList.add('on')}}
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;
 if(playing[k]){playing[k].stop();delete playing[k];b.classList.remove('on');return}
 try{await play(k,b)}catch(e){document.body.insertAdjacentHTML('afterbegin','<p>'+e+' (open via http://)</p>')}});
</script></body></html>
"""
    with open(path, "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main(argv=None):
    argv = list(argv or [])
    errors, warns, rep = [], [], []

    def fail(m):
        errors.append(m)

    def warn(m):
        warns.append(m)

    man_p = os.path.join(AUD, "manifest.json")
    if not os.path.exists(man_p):
        print("FAIL: assets/audio7/manifest.json missing")
        return 1
    man = json.load(open(man_p))
    files = sorted(os.listdir(AUD))
    if files != FILES:
        fail(f"file budget: assets/audio7 must ship exactly {FILES}, found {files}")
    audio, groups, sp = man.get("audio", {}), man.get("audioGroups", {}), man.get("audioSprite", {})
    want_keys = set(CONTRACT) | {LOOP[0]}
    for base, nv in VARIANTS.items():
        want_keys |= {base} | {f"{base}_{i}" for i in range(2, nv + 1)}
        g = groups.get(base)
        if g != [base] + [f"{base}_{i}" for i in range(2, nv + 1)]:
            fail(f"group {base} = {g}")
    if set(audio) != want_keys:
        fail(f"keys differ: missing {sorted(want_keys - set(audio))}, extra {sorted(set(audio) - want_keys)}")
    T = targets()
    # --- clashes with other fragments
    for frag in other_fragments():
        om = json.load(open(os.path.join(ASSETS, frag, "manifest.json")))
        names = set(om.get("audio", {})) | set(om.get("audioGroups", {}))
        clash = (set(audio) | set(groups)) & names
        if clash:
            fail(f"name clash with {frag}: {sorted(clash)}")
    # --- the sprite
    if sp.get("file") != "audio7/audio7_sprite.mp3":
        fail(f"audioSprite.file {sp.get('file')}")
    keys = sp.get("keys", {})
    spr_path = os.path.join(ASSETS, sp.get("file", "x"))
    pcm = F.decode(spr_path, 1)[0] if os.path.exists(spr_path) else np.zeros(1)
    total = len(pcm) / SR
    if abs(total - sp.get("dur", 0)) > 0.002:
        fail(f"sprite decodes to {total:.4f} s, manifest dur {sp.get('dur')}")
    order = sorted(keys.items(), key=lambda kv: kv[1][0])
    prev_end = 0.0
    for k, (st, du) in order:
        if st - prev_end < 0.05 - 1e-4:
            fail(f"{k}: gap before it {st - prev_end:.4f} s < 50 ms")
        prev_end = st + du
        if prev_end > total + 1e-4:
            fail(f"{k}: slice runs past the sprite end")
    if total - prev_end < 0.05 - 1e-4:
        fail(f"final gap {total - prev_end:.4f} s < 50 ms")
    rows = []
    rep.append(f"audio7 QA - sprite {total:.3f} s ({len(keys)} slices), payload "
               f"{sum(os.path.getsize(os.path.join(AUD, f)) for f in files)} bytes")
    rep.append(f"{'key':18s} {'dur':>6s} {'I':>6s} {'Mmax':>6s} {'peak':>6s} {'tpk':>6s} {'vol':>6s} {'eff':>6s} "
               f"{'want':>6s} {'phone':>6s} {'>4k%':>5s} {'centr':>6s}")
    for k, a in audio.items():
        loop = bool(a.get("loop"))
        if loop:
            x = F.decode(os.path.join(ASSETS, a["files"][0]), 1)[0]
            m = F.ebur128(os.path.join(ASSETS, a["files"][0]), 1)
        else:
            if a.get("inSprite") != "audio7" or a.get("files") != []:
                fail(f"{k}: one-shots live in the sprite (inSprite 'audio7', files [])")
            if k not in keys:
                fail(f"{k}: no audioSprite slice")
                continue
            st, du = keys[k]
            if abs(du - a["duration"]) > 1e-4:
                fail(f"{k}: manifest duration {a['duration']} != slice {du}")
            i = int(round(st * SR))
            x = pcm[i:i + int(round(du * SR))]
            p = os.path.join(CACHE, f"check_{k}.wav")
            os.makedirs(CACHE, exist_ok=True)
            S.write_wav(p, x)
            m = F.ebur128(p, 1)
            base = k.rsplit("_", 1)[0] if k[-2:] in ("_2", "_3") else k
            want = CONTRACT.get(base)
            if want is not None and abs(du - want) > 0.02:
                fail(f"{k}: {du:.3f} s, the contract says {want} s")
            lead = np.nonzero(np.abs(x) > S.peak(x) * 0.02)[0]
            if k != "sfx_wheel_squeal" and len(lead) and lead[0] > S.n_of(0.004):
                fail(f"{k}: {lead[0] / SR * 1000:.1f} ms of silence at the start")
            tail = np.sqrt(np.mean(x[-S.n_of(0.01):] ** 2)) / max(S.peak(x), 1e-9)
            if tail > 0.05:
                fail(f"{k}: tail not faded ({S.db(tail):.1f} dB re peak)")
        if not (0.05 <= a["volume"] <= 1.0):
            fail(f"{k}: volume {a['volume']}")
        if max(m["peak"], m["tpk"]) > -1.0 + 1e-6:
            fail(f"{k}: peak {m['peak']:.2f} / true peak {m['tpk']:.2f} > -1 dBFS")
        lvl = m["I"] if loop else m["M"]
        eff = lvl + 20 * np.log10(a["volume"])
        want_lvl = T.get(k, lvl) + HEADROOM_DB
        if abs(eff - want_lvl) > 1.0:
            (warn if a["volume"] in (0.05, 1.0) else fail)(f"{k}: effective {eff:.1f} vs target {want_lvl:.1f} LUFS")
        full_i, full_m = levels(x)
        ph_i, ph_m = levels(phone_weight(x)[0])
        loss = (full_i - ph_i) if loop else max(full_i - ph_i, full_m - ph_m)
        if loss > PHONE_MAX_LOSS:
            fail(f"{k}: loses {loss:.1f} dB on a phone speaker (> {PHONE_MAX_LOSS})")
        hs, cen = harshness(x)
        rows.append({"key": k, "x": x[None, :] * a["volume"], "dur": len(x) / SR, "I": m["I"], "M": m["M"],
                     "peak": m["peak"], "vol": a["volume"], "loop": loop})
        rep.append(f"{k:18s} {len(x) / SR:6.3f} {m['I']:6.1f} {m['M']:6.1f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                   f"{a['volume']:6.3f} {eff:6.1f} {want_lvl:6.1f} {loss:6.1f} {hs:5.1f} {cen:6.0f}")
        # --- design checks
        if k.startswith("sfx_typewriter"):
            on = onsets(x)
            if len(on) < 4:
                fail(f"{k}: {len(on)} key onsets found, 4 wanted ({on})")
            rep.append(f"    onsets {on}")
        if k in TUNE:
            lo, hi, f0, lab, win = TUNE[k]
            seg = x[S.n_of(win[0]):S.n_of(win[1])]
            hz = peak_hz(seg, lo, hi)
            cents = 1200 * np.log2(hz / f0)
            rep.append(f"    {lab}: {hz:.1f} Hz ({cents:+.1f} cents)")
            if abs(cents) > 25:
                fail(f"{k}: {lab} at {hz:.1f} Hz ({cents:+.0f} cents)")
        if k == "sfx_wheel_squeal":
            if hs > 3.0:
                fail(f"{k}: {hs:.1f} % of its energy above 4 kHz (gentle squeal wanted)")
            e0 = np.sqrt(np.mean(x[:S.n_of(0.02)] ** 2)) / S.peak(x)
            e1 = np.sqrt(np.mean(x[-S.n_of(0.02):] ** 2)) / S.peak(x)
            if max(e0, e1) > 0.01:
                fail(f"{k}: ends not silent ({S.db(e0):.0f} / {S.db(e1):.0f} dB) - would click when looped")
            rep.append(f"    ends {S.db(e0 + 1e-9):.0f} / {S.db(e1 + 1e-9):.0f} dB re peak; centroid {cen:.0f} Hz")
        if loop:
            L = int(a.get("loopSamples", 0))
            if abs(LOOP[1] - L / SR) > 0.01:
                fail(f"{k}: {L / SR:.3f} s loop (contract {LOOP[1]} s)")
            if round(a["duration"] * 44100) != L:
                fail(f"{k}: round(duration * 44100) != loopSamples")
            if len(x) != L:
                fail(f"{k}: decoded {len(x)} samples != loopSamples {L}")
            if not a.get("mp3StartPad"):
                fail(f"{k}: mp3StartPad missing")
            lm = loop_metrics(x[None, :])
            rep.append(f"    loop seam hf {lm['hf_ratio']:.3f} d2 {lm['d2_ratio']:.3f} (fail >= 1)")
            if lm["hf_ratio"] >= 1 or lm["d2_ratio"] >= 1:
                fail(f"{k}: loop seam click (hf {lm['hf_ratio']:.2f}, d2 {lm['d2_ratio']:.2f})")
            # the 1 Hz wall clock: autocorrelation of the high-passed envelope peaks at 1 s
            hpx = np.abs(S.hp(x, 1500, order=2))
            env = hpx.reshape(-1, 441).mean(axis=1)                 # 10 ms frames
            env = env - env.mean()
            ac = np.fft.irfft(np.abs(np.fft.rfft(env, 2 * len(env))) ** 2)[:300]
            lag = int(np.argmax(ac[60:140])) + 60
            rep.append(f"    clock: envelope autocorrelation peak at {lag * 10} ms")
    # coin sack variants differ
    sk = [r for r in rows if r["key"].startswith("sfx_coin_sack")]
    for i in range(len(sk)):
        for j in range(i + 1, len(sk)):
            a_, b_ = sk[i]["x"][0], sk[j]["x"][0]
            nn = min(len(a_), len(b_))
            nf = 1 << int(np.ceil(np.log2(2 * nn)))
            xc = np.fft.irfft(np.fft.rfft(a_[:nn], nf) * np.conj(np.fft.rfft(b_[:nn], nf)), nf)
            c = np.max(np.abs(xc)) / np.sqrt(np.sum(a_[:nn] ** 2) * np.sum(b_[:nn] ** 2))
            rep.append(f"    xcorr {sk[i]['key']} / {sk[j]['key']}: {c:.2f}")
            if c > 0.85:
                fail(f"{sk[i]['key']} and {sk[j]['key']} are too alike ({c:.2f})")
    # --- Chromium
    if "--no-browser" not in argv:
        job = {"files": [{"key": "sprite", "path": spr_path, "keys": keys},
                         {"key": "amb_office", "path": os.path.join(AUD, "amb_office.mp3")}]}
        res = chromium_decode(job)
        if "error" in res:
            warn(f"Chromium decode skipped: {res['error']}")
        else:
            rep.append(f"Chromium {res.get('version')}: decodeAudioData at 44.1 / 48 kHz")
            for f in res["files"]:
                if "error" in f:
                    fail(f"Chromium cannot decode {f['key']}: {f['error']}")
                    continue
                r44, r48 = f["44100"], f["48000"]
                rep.append(f"    {f['key']}: 44.1k {r44['length']} smp (seam {r44['seamRatio']:.2f}), "
                           f"48k {r48['length']} smp (seam {r48['seamRatio']:.2f})")
                if f["key"] == "amb_office":
                    L = audio["amb_office"]["loopSamples"]
                    if r44["length"] != L:
                        fail(f"Chromium amb_office: {r44['length']} samples at 44.1 kHz != loopSamples {L}")
                    if abs(r48["length"] - L * 48000 / 44100) > 2:
                        fail(f"Chromium amb_office at 48 kHz: {r48['length']} samples")
                    for sr_, rr in (("44.1k", r44), ("48k", r48)):
                        if rr["seamRatio"] >= 1:
                            fail(f"Chromium amb_office wrap jumps at {sr_} (seam {rr['seamRatio']:.2f})")
                else:
                    if abs(r44["length"] - len(pcm)) > 1:
                        fail(f"Chromium sprite length {r44['length']} != ffmpeg {len(pcm)}")
                    for k, (st, du) in keys.items():
                        for srk, rr in (("44100", r44), ("48000", r48)):
                            s_ = rr["slices"][k]
                            i = int(round(st * SR))
                            seg = pcm[i:i + int(np.ceil((du + 0.03) * SR))]
                            e = seg ** 2
                            ref_c = float((e * np.arange(len(e))).sum() / max(e.sum(), 1e-12) / SR)
                            if abs(s_["centroid"] - ref_c) > 0.001:
                                fail(f"Chromium {srk}: slice {k} energy centroid {s_['centroid']:.4f} s vs ffmpeg "
                                     f"{ref_c:.4f} s (> 1 ms) - sliceSprite would cut it off-time")
                    rep.append("    every slice cut like Assets.sliceSprite lines up with ffmpeg within 1 ms "
                               "(44.1 and 48 kHz)" if not any("energy centroid" in e_ for e_ in errors) else
                               "    slice alignment FAILED")
    # --- previews
    os.makedirs(PREV, exist_ok=True)
    try:
        previews_png(rows, os.path.join(PREV, "audio7_spectrograms.png"))
    except Exception as e:  # noqa: BLE001
        warn(f"spectrogram preview failed: {e}")
    if "--no-demo" not in argv:
        loop_pcm = F.decode(os.path.join(AUD, "amb_office.mp3"), 1)[0]
        rep.append(demo_mix(man, pcm, loop_pcm, os.path.join(PREV, "audio7_demo.mp3")))
    preview_html(man, os.path.join(PREV, "audio7_preview.html"))
    rep.append("")
    rep += [f"WARN: {w}" for w in warns] + [f"FAIL: {e}" for e in errors]
    rep.append(f"RESULT: {'OK' if not errors else 'FAIL'} ({len(errors)} errors, {len(warns)} warnings)")
    txt = "\n".join(rep)
    with open(os.path.join(PREV, "audio7_report.txt"), "w") as f:
        f.write(txt + "\n")
    print(txt)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
