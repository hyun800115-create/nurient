"""Frost Village - audio QA for assets/audio8 (CONTRACT_GEUMBANG section AR, the 금방 sounds) + previews.

Run:  python3 tools/audio/check_audio8.py [--no-demo] [--no-browser]        (exit 1 on any FAIL)
Checks
  * the fragment ships exactly 2 files: manifest.json (= the sprite JSON) and audio8_sprite.mp3; mono, 96 kbps;
  * every section AR key is in the manifest (kind / volume sane); every sound is `inSprite: "audio8"` with no files and
    a [start, duration] in audioSprite.keys; slices are in order, inside the sprite, with >= 50 ms gaps
    (Assets.sliceSprite cuts dur + 30 ms, which must land in the gap); groups sfx_gb_doorbell / _thump / _tape; no key
    or group collides with any other assets/*/manifest.json;
  * the sprite decodes (ffmpeg) to exactly the length the build wrote; per slice: sample peak and true peak <= -1
    dBFS, duration <= the contract's maximum, starts on its first sample (<= 4 ms of silence), faded tail, effective
    level (file level + 20 log10 volume) within 1 dB of TARGET + headroom;
  * design checks: the doorbells ring G5 -> E5 and A5 -> F#5, the app chime rises C6 -> F6, the jingle rises in 3
    notes F5 -> G5 -> C6, the horn is two beeps and gentle, the scan is a soft A6 <= 0.15 s, the locker clicks then
    chimes A5 -> D6, the tape is noisy (stick-slip, not tonal), the variants differ (cross-correlation < 0.85), nothing
    is shrill (energy above 4 kHz), every pitch within 25 cents;
  * phone speakers: loss through the 500 Hz high-pass / 9 kHz low-pass phone model <= 6 dB for every key;
  * headless Chromium (Playwright): decodeAudioData of the sprite into 44.1 and 48 kHz contexts - every slice cut the
    way Assets.sliceSprite does lines up with the ffmpeg decode within 1 ms.
Writes docs/previews/audio8_report.txt, audio8_spectrograms.png (waveform + spectrogram of every key),
audio8_demo.mp3 (~34 s: the 금방 opening and one delivery, at the manifest volumes over the village bed) and
audio8_preview.html (play every key, sliced from the sprite like the game).
Cache: $FV_AUDIO8_CACHE (default /tmp/fv_cache/audio8).
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
from check_audio7 import _JS, harshness, levels, onsets, peak_hz, phone_weight  # noqa: E402  (read-only helpers)

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
AUD = os.path.join(ASSETS, "audio8")
PREV = os.path.join(ROOT, "docs", "previews")
CACHE = os.environ.get("FV_AUDIO8_CACHE", "/tmp/fv_cache/audio8")
SR = 44100

# CONTRACT_GEUMBANG section AR, written out independently of build_audio8.py on purpose: key -> max seconds
CONTRACT = {"sfx_gb_doorbell": 0.9, "sfx_gb_horn": 0.5, "sfx_gb_chime": 0.45, "sfx_gb_thump": 0.35,
            "sfx_gb_jingle": 1.2, "sfx_gb_tape": 0.5, "sfx_gb_scan": 0.15, "sfx_gb_locker": 0.4}
VARIANTS = {"sfx_gb_doorbell": 2, "sfx_gb_thump": 2, "sfx_gb_tape": 2}
FILES = ["audio8_sprite.mp3", "manifest.json"]
HEADROOM_DB = -2.0
PHONE_MAX_LOSS = 6.0
HZ = lambda m: 440.0 * 2 ** ((m - 69) / 12.0)          # noqa: E731
# key -> [(window s0, s1, midi, label)]: the notes each sound must sound, in order
PITCH = {
    "sfx_gb_doorbell": [(0.03, 0.31, 79, "ding G5"), (0.40, 0.88, 76, "dong E5")],
    "sfx_gb_doorbell_2": [(0.03, 0.31, 81, "ding A5"), (0.40, 0.88, 78, "dong F#5")],
    "sfx_gb_chime": [(0.01, 0.085, 84, "C6"), (0.11, 0.40, 89, "F6")],
    "sfx_gb_jingle": [(0.01, 0.12, 77, "F5"), (0.14, 0.27, 79, "G5"), (0.30, 0.70, 84, "C6")],
    "sfx_gb_scan": [(0.01, 0.09, 93, "A6")],
    "sfx_gb_locker": [(0.105, 0.185, 81, "A5"), (0.20, 0.38, 86, "D6")],
}
ONSETS = {"sfx_gb_horn": 2, "sfx_gb_chime": 2, "sfx_gb_jingle": 3, "sfx_gb_doorbell": 2, "sfx_gb_doorbell_2": 2}
MAX_HF = {"sfx_gb_tape": 45.0, "sfx_gb_tape_2": 45.0, "sfx_gb_thump": 30.0, "sfx_gb_thump_2": 30.0}   # % > 4 kHz


def targets():
    try:
        import build_audio8 as B8
        return {k: v[0] for k, v in B8.SOUNDS.items()}
    except Exception:  # noqa: BLE001
        return {}


def all_keys_elsewhere():
    """sprite / audio / group / atlas keys of every other assets/*/manifest.json (clash guard)."""
    out = {}
    for d in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, d, "manifest.json")
        if d == "audio8" or d.startswith("_") or not os.path.exists(p):
            continue
        try:
            m = json.load(open(p))
        except Exception:  # noqa: BLE001
            continue
        out[d] = set(m.get("audio", {})) | set(m.get("audioGroups", {}))
    return out


def flatness(x):
    """Spectral flatness (0 tonal .. 1 white) of the loud part, 1-8 kHz."""
    m = np.atleast_2d(x).mean(axis=0)
    sp = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2 + 1e-18
    f = np.fft.rfftfreq(len(m), 1 / SR)
    b = sp[(f > 1000) & (f < 8000)]
    return float(np.exp(np.mean(np.log(b))) / np.mean(b))


def chromium_decode(job):
    import subprocess
    os.makedirs(CACHE, exist_ok=True)
    js, lst = os.path.join(CACHE, "chromium_decode8.mjs"), os.path.join(CACHE, "chromium_decode8.json")
    with open(js, "w") as f:
        f.write(_JS)
    with open(lst, "w") as f:
        json.dump(job, f)
    try:
        p = subprocess.run(["nice", "-n", "10", "node", js, lst], capture_output=True, text=True, timeout=300)
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
    cols = 3
    cw = (W - 12 * (cols + 1)) // cols
    H = 50 + ((len(rows) + cols - 1) // cols) * (row_h + 10) + 20
    img = Image.new("RGB", (W, H), P.BG)
    d = ImageDraw.Draw(img)
    d.text((12, 12), "Frost Village audio8 (Geumbang sounds) - spectrogram 40 Hz-12 kHz (log) + waveform at the delivered "
                     "level; red = -1 dBFS", fill=P.TXT, font=P.font(15))
    y = 44
    for i, r in enumerate(rows):
        cx = 12 + (i % cols) * (cw + 12)
        cy = y + (i // cols) * (row_h + 10)
        d.text((cx, cy), f"{r['key']}  {r['dur']:.2f} s  Mmax {r['M']:.1f}  vol {r['vol']}", fill=P.TXT, font=P.font(12))
        img.paste(P.spectrogram(r["x"], cw, spec_h, nfft=1024), (cx, cy + 20))
        img.paste(P.waveform(r["x"], cw, wave_h, (242, 179, 61)), (cx, cy + 22 + spec_h))
    img.convert("P", palette=Image.ADAPTIVE, colors=160).save(path, optimize=True)


def demo_mix(man, sprite_pcm, path_mp3):
    """~34 s at the manifest volumes (like the game): the 금방 opening (ribbon, jingle, the first order ping) and one
    delivery - picked from the rack, taped twice, scanned into the van, the van beeps at a walker, a parcel lands on a
    snowy step, the doorbell, the locker - over bgm_village and the town bed from the existing fragments."""
    mans = {}
    for d in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, d, "manifest.json")
        if d.startswith("audio") and d != "audio8" and os.path.exists(p):
            mans[d] = json.load(open(p))
    groups = dict(man.get("audioGroups", {}))
    cache = {}
    r = np.random.default_rng(8)
    last = {}

    def get(key):
        if key in cache:
            return cache[key]
        a = man["audio"].get(key)
        if a:
            st, du = man["audioSprite"]["keys"][key]
            i = int(round(st * SR))
            cache[key] = (sprite_pcm[i:i + int(round(du * SR))], a["volume"])
            return cache[key]
        for f, m in mans.items():
            b = m.get("audio", {}).get(key)
            if not b:
                continue
            if b.get("inSprite"):
                spf = os.path.join(ASSETS, m["audioSprite"]["file"])
                if spf not in cache:
                    cache[spf] = F.decode(spf, 1)[0]
                st, du = m["audioSprite"]["keys"][key]
                i = int(round(st * SR))
                cache[key] = (cache[spf][i:i + int(round(du * SR))], b["volume"])
            else:
                p = os.path.join(ASSETS, [q for q in b["files"] if q.endswith(".mp3")][0])
                cache[key] = (F.decode(p).mean(axis=0), b["volume"])
            return cache[key]
        raise KeyError(key)

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

    DUR = 34.0
    n = S.n_of(DUR)
    bed, fx = np.zeros(n), np.zeros(n)
    used = []

    def sfx(t, key, vol=1.0, rate=1.0):
        k = pick(key)
        try:
            x, v = get(k)
        except KeyError:
            return
        used.append(k)
        if rate != 1.0:
            m = int(len(x) / rate)
            x = np.interp(np.arange(m) * rate, np.arange(len(x)), x)
        i = S.n_of(t)
        e = min(n, i + len(x))
        fx[i:e] += x[:e - i] * v * vol

    def loop(key, pts, vol=1.0):
        try:
            x, v = get(key)
        except KeyError:
            return
        reps = int(np.ceil(n / len(x))) + 1
        bed[:] += v * vol * np.tile(x, reps)[:n] * S.env_pts(pts, n)

    loop("bgm_village", [(0, 0), (1, 0.35), (2.0, 0.35), (2.4, 0.18), (4.0, 0.18), (5.0, 0.35), (DUR - 1, 0.35), (DUR, 0)])
    loop("amb_town", [(0, 0), (1.5, 0.6), (DUR - 1, 0.6), (DUR, 0)])
    sfx(1.2, "sfx_ribbon_cut", 0.8)                       # the opening ribbon (if the fragment has it)
    sfx(2.4, "sfx_gb_jingle", 1.0)                        # 금-방!
    sfx(5.0, "sfx_gb_chime", 1.0)                         # the first order arrives in the app
    sfx(7.0, "sfx_box_drop", 0.5)                         # picked from the rack
    for k, t in enumerate((9.0, 10.4)):                   # packed: two tape pulls
        sfx(t, "sfx_gb_tape", 0.9)
    sfx(11.6, "sfx_gb_thump", 0.6)                        # staged by dock 1
    for k in range(3):                                    # scanned into the van
        sfx(13.0 + k * 0.7, "sfx_gb_scan", 1.0, rate=r.uniform(0.98, 1.03))
    sfx(15.4, "sfx_door", 0.7)
    sfx(17.0, "sfx_gb_horn", 0.8)                         # a walker in the lane
    sfx(19.5, "sfx_brakes", 0.4)
    sfx(21.0, "sfx_gb_doorbell", 1.0)                     # 띵동
    sfx(23.6, "sfx_gb_thump", 0.9)                        # nobody home: the box on the snowy step
    sfx(25.4, "sfx_gb_chime", 0.8)                        # the app: arrived (doorstep photo)
    sfx(28.0, "sfx_gb_locker", 1.0)                       # the plaza locker
    sfx(30.2, "sfx_gb_doorbell", 0.9)                     # the house next door rings differently
    mix = bed + fx
    pk = S.peak(mix)
    if pk > S.undb(-1.0):
        mix = S.limiter(mix, -1.0, 5.0)
    wav = os.path.join(CACHE, "audio8_demo.wav")
    S.write_wav(wav, mix)
    F.encode_mp3(wav, path_mp3, 1, 128)
    lines = [f"demo: bed {S.lufs(bed):.1f} LUFS | sfx layer {S.lufs(fx):.1f} LUFS | mix {S.lufs(mix):.1f} LUFS, "
             f"peak {S.db(pk):.1f} dBFS; keys {sorted(set(used))}", "demo timeline (4 s windows, max momentary LUFS)  bed | sfx"]
    for s in range(0, int(DUR), 4):
        a, b = S.n_of(s), S.n_of(s + 4)
        fxm = S.momentary_max(fx[a:b]) if np.any(fx[a:b]) else -99.0
        lines.append(f"  {s:2d}s  {S.momentary_max(bed[a:b]):6.1f} | {fxm:6.1f}")
    return "\n".join(lines)


def preview_html(man, path):
    rows = []
    for k, a in man["audio"].items():
        rows.append(f"<div class='card'><button data-key='{k}'>&#9654;</button><div><b>{k}</b><small>"
                    f"{a['duration']:.2f}s &middot; vol {a['volume']}</small><small class='n'>"
                    f"{a.get('notes', '').split('.')[0]}</small></div></div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Geumbang Sounds</title>
<style>
:root{--bg:#FBF6EC;--card:#FFFFFF;--ink:#3B3F52;--accent:#F2B33D;--accent2:#D9962A;--muted:#7A6A55}
@media (prefers-color-scheme:dark){:root{--bg:#22252f;--card:#2c303c;--ink:#F4EDE0;--accent:#F2B33D;--accent2:#D9962A;--muted:#b7aa94}}
body{margin:0;padding:16px;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
h1{font-size:22px;margin:4px 0} p{color:var(--muted);margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr));gap:8px;margin-top:12px}
.card{display:flex;gap:10px;align-items:center;background:var(--card);border-radius:14px;padding:8px 10px;border-left:6px solid var(--accent)}
.card b{display:block;font-size:14px;overflow-wrap:anywhere} .card small{display:block;color:var(--muted)}
button{width:44px;height:44px;border-radius:50%;border:0;background:var(--accent);color:#3B3F52;font-size:16px;cursor:pointer;flex:none}
button:active{background:var(--accent2)}
</style></head><body>
<h1>금방 소리 (audio8)</h1>
<p>게임과 같은 기본 볼륨, 같은 방식(하나의 스프라이트에서 잘라 쓰기)으로 재생합니다. 띵동 · 빵빵 · 앱 알림 · 문 앞 상자 · 금-방! ·
테이프 찌익 · 삑 · 보관함. Open through the game's local web server (http://.../docs/previews/audio8_preview.html).</p>
<div class="grid">""" + "\n".join(rows) + """</div>
<script>
const BASE='../../assets/audio8/';let ctx,man,sprite;
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function dec(u){const ab=await (await fetch(u)).arrayBuffer();return await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no))}
async function init(){if(man)return;man=await (await fetch(BASE+'manifest.json')).json();sprite=await dec('../../assets/'+man.audioSprite.file)}
function slice(k){const [st,du]=man.audioSprite.keys[k],sr=sprite.sampleRate,a=Math.floor(st*sr),n=Math.ceil((du+0.03)*sr);
 const b=ac().createBuffer(1,n,sr);b.getChannelData(0).set(sprite.getChannelData(0).subarray(a,a+n));return b}
async function play(k){await init();const a=man.audio[k];const s=ac().createBufferSource(),g=ac().createGain();
 s.buffer=slice(k);g.gain.value=a.volume;s.connect(g).connect(ac().destination);s.start()}
document.querySelectorAll('button').forEach(b=>b.onclick=async()=>{
 try{await play(b.dataset.key)}catch(e){document.body.insertAdjacentHTML('afterbegin','<p>'+e+' (open via http://)</p>')}});
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
        print("FAIL: assets/audio8/manifest.json missing")
        return 1
    man = json.load(open(man_p))
    files = sorted(os.listdir(AUD))
    if files != FILES:
        fail(f"file budget: assets/audio8 must ship exactly {FILES}, found {files}")
    audio, groups, sp = man.get("audio", {}), man.get("audioGroups", {}), man.get("audioSprite", {})
    want_keys = set(CONTRACT)
    for base, nv in VARIANTS.items():
        want_keys |= {f"{base}_{i}" for i in range(2, nv + 1)}
        g = groups.get(base)
        if g != [base] + [f"{base}_{i}" for i in range(2, nv + 1)]:
            fail(f"group {base} = {g}")
    if set(audio) != want_keys:
        fail(f"keys differ: missing {sorted(want_keys - set(audio))}, extra {sorted(set(audio) - want_keys)}")
    if sp.get("ch") != 1 or sp.get("kbps") != 96 or abs(sp.get("gap", 0) - 0.05) > 1e-9:
        fail(f"sprite format ch {sp.get('ch')} kbps {sp.get('kbps')} gap {sp.get('gap')} (mono, 96 kbps, 50 ms)")
    T = targets()
    for frag, names in all_keys_elsewhere().items():
        clash = (set(audio) | set(groups)) & names
        if clash:
            fail(f"name clash with {frag}: {sorted(clash)}")
    if sp.get("file") != "audio8/audio8_sprite.mp3":
        fail(f"audioSprite.file {sp.get('file')}")
    keys = sp.get("keys", {})
    spr_path = os.path.join(ASSETS, sp.get("file", "x"))
    pr = F.probe(spr_path) if os.path.exists(spr_path) else {}
    if pr.get("channels") != 1:
        fail(f"sprite is not mono ({pr})")
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
    rows, xs = [], {}
    rep.append(f"audio8 QA - sprite {total:.3f} s ({len(keys)} slices), payload "
               f"{sum(os.path.getsize(os.path.join(AUD, f)) for f in files)} bytes")
    rep.append(f"{'key':18s} {'dur':>6s} {'I':>6s} {'Mmax':>6s} {'peak':>6s} {'tpk':>6s} {'vol':>6s} {'eff':>6s} "
               f"{'want':>6s} {'phone':>6s} {'>4k%':>5s} {'centr':>6s}")
    os.makedirs(CACHE, exist_ok=True)
    for k, a in audio.items():
        if a.get("inSprite") != "audio8" or a.get("files") != []:
            fail(f"{k}: sounds live in the sprite (inSprite 'audio8', files [])")
        if k not in keys:
            fail(f"{k}: no audioSprite slice")
            continue
        st, du = keys[k]
        if abs(du - a["duration"]) > 1e-4:
            fail(f"{k}: manifest duration {a['duration']} != slice {du}")
        i = int(round(st * SR))
        x = pcm[i:i + int(round(du * SR))]
        xs[k] = x
        p = os.path.join(CACHE, f"check_{k}.wav")
        S.write_wav(p, x)
        m = F.ebur128(p, 1)
        base = k.rsplit("_", 1)[0] if k[-2:] in ("_2", "_3") else k
        mx = CONTRACT.get(base)
        if mx is not None and du > mx + 1e-4:
            fail(f"{k}: {du:.3f} s > the contract's {mx} s")
        lead = np.nonzero(np.abs(x) > S.peak(x) * 0.02)[0]
        if len(lead) and lead[0] > S.n_of(0.004):
            fail(f"{k}: {lead[0] / SR * 1000:.1f} ms of silence at the start")
        tail = np.sqrt(np.mean(x[-S.n_of(0.01):] ** 2)) / max(S.peak(x), 1e-9)
        if tail > 0.05:
            fail(f"{k}: tail not faded ({S.db(tail):.1f} dB re peak)")
        if not (0.05 <= a["volume"] <= 1.0):
            fail(f"{k}: volume {a['volume']}")
        if max(m["peak"], m["tpk"]) > -1.0 + 1e-6:
            fail(f"{k}: peak {m['peak']:.2f} / true peak {m['tpk']:.2f} > -1 dBFS")
        eff = m["M"] + 20 * np.log10(a["volume"])
        want_lvl = T.get(k, m["M"]) + HEADROOM_DB
        if abs(eff - want_lvl) > 1.0:
            (warn if a["volume"] in (0.05, 1.0) else fail)(f"{k}: effective {eff:.1f} vs target {want_lvl:.1f} LUFS")
        full_i, full_m = levels(x)
        ph_i, ph_m = levels(phone_weight(x)[0])
        loss = max(full_i - ph_i, full_m - ph_m)
        if loss > PHONE_MAX_LOSS:
            fail(f"{k}: loses {loss:.1f} dB on a phone speaker (> {PHONE_MAX_LOSS})")
        hs, cen = harshness(x)
        if hs > MAX_HF.get(k, 15.0):
            fail(f"{k}: {hs:.1f} % of its energy above 4 kHz (shrill; <= {MAX_HF.get(k, 15.0)} %)")
        rows.append({"key": k, "x": x[None, :] * a["volume"], "dur": len(x) / SR, "I": m["I"], "M": m["M"],
                     "peak": m["peak"], "vol": a["volume"]})
        rep.append(f"{k:18s} {len(x) / SR:6.3f} {m['I']:6.1f} {m['M']:6.1f} {m['peak']:6.1f} {m['tpk']:6.1f} "
                   f"{a['volume']:6.3f} {eff:6.1f} {want_lvl:6.1f} {loss:6.1f} {hs:5.1f} {cen:6.0f}")
        # --- design checks
        if k in ONSETS:
            on = onsets(x)
            if len(on) < ONSETS[k]:
                fail(f"{k}: {len(on)} onsets found, {ONSETS[k]} wanted ({on})")
            rep.append(f"    onsets {on}")
        if k in PITCH:
            got = []
            for w0, w1, mm, lab in PITCH[k]:
                f0 = HZ(mm)
                seg = x[S.n_of(w0):S.n_of(w1)]
                hz = peak_hz(seg, f0 * 0.85, f0 * 1.15)
                cents = 1200 * np.log2(hz / f0)
                got.append(hz)
                rep.append(f"    {lab}: {hz:.1f} Hz ({cents:+.1f} cents)")
                if abs(cents) > 25:
                    fail(f"{k}: {lab} at {hz:.1f} Hz ({cents:+.0f} cents)")
            if k in ("sfx_gb_chime", "sfx_gb_jingle", "sfx_gb_locker") and any(b <= a_ for a_, b in zip(got, got[1:])):
                fail(f"{k}: the notes must rise ({[round(g) for g in got]})")
            if k.startswith("sfx_gb_doorbell") and not got[1] < got[0]:
                fail(f"{k}: 띵동 must fall a third ({[round(g) for g in got]})")
        if k.startswith("sfx_gb_tape"):
            fl = flatness(x)
            rep.append(f"    spectral flatness 1-8 kHz {fl:.3f} (noisy stick-slip, not a tone: > 0.08)")
            if fl < 0.08:
                fail(f"{k}: too tonal for tape (flatness {fl:.3f})")
        if k.startswith("sfx_gb_thump"):
            low = S.lp(x, 250, order=2)
            share = float(np.sum(low ** 2) / max(np.sum(x ** 2), 1e-12))
            rep.append(f"    body < 250 Hz: {share * 100:.0f} % of the energy")
            if share < 0.08:
                fail(f"{k}: no body thud (only {share * 100:.0f} % of the energy under 250 Hz)")
    # variants differ
    for base, nv in VARIANTS.items():
        names = [base] + [f"{base}_{i}" for i in range(2, nv + 1)]
        for i_ in range(len(names)):
            for j_ in range(i_ + 1, len(names)):
                a_, b_ = xs.get(names[i_]), xs.get(names[j_])
                if a_ is None or b_ is None:
                    continue
                nn = min(len(a_), len(b_))
                nf = 1 << int(np.ceil(np.log2(2 * nn)))
                xc = np.fft.irfft(np.fft.rfft(a_[:nn], nf) * np.conj(np.fft.rfft(b_[:nn], nf)), nf)
                c = np.max(np.abs(xc)) / np.sqrt(np.sum(a_[:nn] ** 2) * np.sum(b_[:nn] ** 2))
                rep.append(f"    xcorr {names[i_]} / {names[j_]}: {c:.2f}")
                if c > 0.85:
                    fail(f"{names[i_]} and {names[j_]} are too alike ({c:.2f})")
    # --- Chromium
    if "--no-browser" not in argv:
        res = chromium_decode({"files": [{"key": "sprite", "path": spr_path, "keys": keys}]})
        if "error" in res:
            warn(f"Chromium decode skipped: {res['error']}")
        else:
            rep.append(f"Chromium {res.get('version')}: decodeAudioData at 44.1 / 48 kHz")
            for f in res["files"]:
                if "error" in f:
                    fail(f"Chromium cannot decode {f['key']}: {f['error']}")
                    continue
                r44, r48 = f["44100"], f["48000"]
                rep.append(f"    sprite: 44.1k {r44['length']} smp, 48k {r48['length']} smp")
                if abs(r44["length"] - len(pcm)) > 1:
                    fail(f"Chromium sprite length {r44['length']} != ffmpeg {len(pcm)}")
                bad = 0
                for k, (st, du) in keys.items():
                    for srk, rr in (("44100", r44), ("48000", r48)):
                        s_ = rr["slices"][k]
                        i = int(round(st * SR))
                        seg = pcm[i:i + int(np.ceil((du + 0.03) * SR))]
                        e = seg ** 2
                        ref_c = float((e * np.arange(len(e))).sum() / max(e.sum(), 1e-12) / SR)
                        if abs(s_["centroid"] - ref_c) > 0.001:
                            bad += 1
                            fail(f"Chromium {srk}: slice {k} energy centroid {s_['centroid']:.4f} s vs ffmpeg "
                                 f"{ref_c:.4f} s (> 1 ms) - sliceSprite would cut it off-time")
                rep.append("    every slice cut like Assets.sliceSprite lines up with ffmpeg within 1 ms "
                           "(44.1 and 48 kHz)" if not bad else "    slice alignment FAILED")
    # --- previews
    os.makedirs(PREV, exist_ok=True)
    try:
        previews_png(rows, os.path.join(PREV, "audio8_spectrograms.png"))
    except Exception as e:  # noqa: BLE001
        warn(f"spectrogram preview failed: {e}")
    if "--no-demo" not in argv:
        rep.append(demo_mix(man, pcm, os.path.join(PREV, "audio8_demo.mp3")))
    preview_html(man, os.path.join(PREV, "audio8_preview.html"))
    rep.append("")
    rep += [f"WARN: {w}" for w in warns] + [f"FAIL: {e}" for e in errors]
    rep.append(f"RESULT: {'OK' if not errors else 'FAIL'} ({len(errors)} errors, {len(warns)} warnings)")
    txt = "\n".join(rep)
    with open(os.path.join(PREV, "audio8_report.txt"), "w") as f:
        f.write(txt + "\n")
    print(txt)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
