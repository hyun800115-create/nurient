"""Frost Village - build the v2/v3/v4 sounds (CONTRACT_V3 section G) into assets/audio2/.

render (sfx2.py, music2.py) -> loop fitting -> encode (.ogg + .mp3) -> measure -> manifest -> QA.
Reuses build_audio.py's machinery by importing it (that file is not modified): fit_loop() (Vorbis
block-boundary loop fitting), _encode_one() (Vorbis q4 + LAME, codec-peak trim), volume_for()
(loudness -> manifest volume, same HEADROOM_DB / target conventions as assets/audio), and the same
CHANNELS / MP3_KBPS / PEAK_MAX tables. Its module-level tables are re-pointed at the audio2 key set,
cache and output folder *inside this process only* (bind()), so nothing in assets/audio is touched.

Run from anywhere (deterministic, safe to re-run; ~1.5 min on 2 cores):
    python3 tools/audio/build_audio2.py                          # everything + check_audio2
    python3 tools/audio/build_audio2.py --only sfx_chatter_1,sfx_lute
    python3 tools/audio/build_audio2.py --skip-render            # re-encode from tools/audio/_cache/audio2/*.wav
    python3 tools/audio/build_audio2.py --no-check               # skip check_audio2.py at the end
    python3 tools/audio/build_audio2.py --workers 2
Outputs
    assets/audio2/<key>.ogg + .mp3      44.1 kHz; music stereo, ambience-type loops + sfx mono
    assets/audio2/manifest.json         CONTRACT section 2 fragment: audio{} + audioGroups{}
    docs/previews/audio2_preview.html   listening page (open through the game's local web server)
    (check_audio2.py) docs/previews/audio2_report.txt, audio2_waveforms.png, audio2_demo.mp3
Mix conventions = assets/audio: files mastered hot (sfx peak -1.5 dBFS, music -18 LUFS, loops -20 LUFS),
manifest `volume` = 10^((TARGET + HEADROOM_DB - measured) / 20) with the TARGET table below.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
import build_audio as BA  # noqa: E402
import ffmpeg_tools as F  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))           # frost-village/
CACHE = os.path.join(HERE, "_cache", "audio2")
OUT = os.path.join(ROOT, "assets", "audio2")
PREV = os.path.join(ROOT, "docs", "previews")
REL = "audio2"                                                    # manifest paths are relative to assets/

# ----------------------------------------------------------------------------- the sound list
# key: (kind, loop, target loudness at game call volume 1 (before HEADROOM_DB), extra manifest fields)
#   extra "cues" = seconds from the start of the file to a sync point (e.g. sync fx_build_done to "fanfare").
#   music / ambience: integrated LUFS ; sfx: max momentary LUFS (400 ms) - same as build_audio.SOUNDS.
#   v1 references: bgm_village -24.5, amb_* -31..-32.5, sfx_chop -16, sfx_customer_happy -17,
#   sfx_animal_* -18, sfx_build -16, sfx_unlock -15, sfx_complete -14, sfx_pad_fill -20.
SOUNDS = {
    "bgm_spring":         ("music", True, -24.5, {"bars": 24, "tonality": "F major",
                                                 "notes": "v4 chapter-ending spring theme; quotes the bgm_village hook. "
                                                          "Stereo ~62.6 s (~22 MB as decoded PCM): load only when needed."}),
    "sfx_lute":           ("ambience", True, -25.0, {"bars": 4, "tonality": "F major",
                                                    "notes": "bard strum loop (mono). Play like ambience: "
                                                             "Audio.setAmbience('sfx_lute', 0..1) by distance to the bard."}),
    "sfx_hammer_1":       ("sfx", False, -17.5, {}),
    "sfx_hammer_2":       ("sfx", False, -17.5, {}),
    "sfx_hammer_3":       ("sfx", False, -17.5, {}),
    "sfx_build_done":     ("sfx", False, -15.0, {"cues": {"thunk": 0.26, "fanfare": 0.58}}),
    "sfx_saw_short":      ("sfx", False, -18.5, {}),
    "sfx_boat_horn":      ("sfx", False, -16.5, {"cues": {"toot1": 0.0, "toot2": 0.34}}),
    "sfx_row":            ("sfx", False, -20.0, {"cues": {"catch": 0.1},
                                                "notes": "one oar stroke (~1 s); retrigger once per row cycle"}),
    "sfx_register":       ("sfx", False, -17.0, {"cues": {"bell": 0.29}}),
    "sfx_tower_fire":     ("sfx", False, -16.0, {"cues": {"ignite": 0.07},
                                                "notes": "one-shot ignition; for the burning loop reuse audio/amb_fire"}),
    "sfx_fog_clear":      ("sfx", False, -15.0, {"cues": {"whooshPeak": 0.9, "reveal": 0.95}}),
    "sfx_chatter_1":      ("sfx", False, -19.0, {"voice": "high"}),
    "sfx_chatter_2":      ("sfx", False, -19.0, {"voice": "high"}),
    "sfx_chatter_3":      ("sfx", False, -19.0, {"voice": "high"}),
    "sfx_chatter_4":      ("sfx", False, -19.0, {"voice": "low"}),
    "sfx_chatter_5":      ("sfx", False, -19.0, {"voice": "low"}),
    "sfx_chatter_6":      ("sfx", False, -19.0, {"voice": "low"}),
    "sfx_laugh_1":        ("sfx", False, -18.5, {"voice": "high"}),
    "sfx_laugh_2":        ("sfx", False, -18.5, {"voice": "low"}),
    "sfx_snowball_throw": ("sfx", False, -19.5, {"cues": {"swish": 0.12}}),
    "sfx_snowball_hit":   ("sfx", False, -17.5, {}),
    "sfx_dog_bark":       ("sfx", False, -18.0, {}),
    "sfx_cat_meow":       ("sfx", False, -18.5, {}),
    "sfx_penguin":        ("sfx", False, -18.5, {}),
    "sfx_cheer":          ("sfx", False, -16.0, {}),
}
GROUPS = {
    "sfx_hammer": ["sfx_hammer_1", "sfx_hammer_2", "sfx_hammer_3"],
    "sfx_chatter": [f"sfx_chatter_{i}" for i in range(1, 7)],
    "sfx_laugh": ["sfx_laugh_1", "sfx_laugh_2"],
    # extra (optional): pick the voice that matches the speaker (kids / teens vs adults / elders)
    "sfx_chatter_hi": ["sfx_chatter_1", "sfx_chatter_2", "sfx_chatter_3"],
    "sfx_chatter_lo": ["sfx_chatter_4", "sfx_chatter_5", "sfx_chatter_6"],
}
LOOPS = {"bgm_spring": ("music2", "render_spring"), "sfx_lute": ("music2", "render_lute")}
# Same codec settings as assets/audio (build_audio.MP3_KBPS / CHANNELS / OGG_Q): payload ~2.5 MB of the 3 MB budget.
MP3_KBPS = dict(BA.MP3_KBPS)


def bind():
    """Point build_audio's module tables at the audio2 set (this process / worker only)."""
    BA.SOUNDS = SOUNDS
    BA.LOOPS = LOOPS
    BA.GROUPS = GROUPS
    BA.CACHE = CACHE
    BA.OUT = OUT
    BA.MP3_KBPS = MP3_KBPS


bind()


# ----------------------------------------------------------------------------- render
def _render_job(key: str) -> str:
    """Worker: render one key to _cache/audio2/<key>.wav (+ .json meta). Loops go through fit_loop."""
    bind()
    sys.path.insert(0, HERE)
    import synth as S
    t0 = time.time()
    os.makedirs(CACHE, exist_ok=True)
    meta = {}
    if key in LOOPS:
        x, meta = BA.fit_loop(key)
    else:
        import sfx2
        x = sfx2.render(key)
    S.write_wav(os.path.join(CACHE, f"{key}.wav"), x)
    with open(os.path.join(CACHE, f"{key}.json"), "w") as f:
        json.dump(meta, f)
    extra = (f"  loop {meta['loopSamples']} smp ({meta.get('fitMethod')}, nominal {meta.get('nominalSamples')})"
             if key in LOOPS else "")
    return f"  rendered {key:20s} {x.shape[-1] / S.SR:6.2f}s  ({time.time() - t0:4.1f}s){extra}"


def render(keys, workers: int):
    heavy = [k for k in keys if k in LOOPS]
    light = [k for k in keys if k not in LOOPS]
    order = sorted(heavy, key=lambda k: k != "bgm_spring") + light            # long pole first
    with ProcessPoolExecutor(max_workers=max(1, workers)) as ex:
        for line in ex.map(_render_job, order):
            print(line, flush=True)


# ----------------------------------------------------------------------------- manifest
def write_manifest(meas):
    audio = {}
    for key, (kind, loop, target, extra) in SOUNDS.items():
        m = meas[key]
        entry = {"files": [f"{REL}/{key}.ogg", f"{REL}/{key}.mp3"], "volume": BA.volume_for(key, m),
                 "loop": loop, "kind": kind, "duration": round(m["duration"], 4)}
        mp = os.path.join(CACHE, f"{key}.json")
        if loop and os.path.exists(mp):
            with open(mp) as f:
                meta = json.load(f)
            entry["loopSamples"] = meta.get("loopSamples")
            if "bpm" in meta:
                entry["bpm"] = round(meta["bpm"], 3)
        if loop:
            gl = F.mp3_gapless(os.path.join(OUT, f"{key}.mp3"))
            if gl:
                entry["mp3StartPad"] = gl[0] + 529        # only for decoders that ignore the LAME tag
        entry.update(extra)
        audio[key] = entry
    man = {"version": 1,
           "generator": "tools/audio/build_audio2.py (procedural synthesis: sfx2.py, music2.py; "
                        "same toolkit + loudness conventions as assets/audio)",
           "audio": audio, "audioGroups": GROUPS}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return man


# ----------------------------------------------------------------------------- listening page
def write_preview_html(man):
    rows = {"music": [], "ambience": [], "sfx": []}
    for key, a in man["audio"].items():
        rows[a["kind"]].append((key, a))
    parts = []
    titles = (("music", "봄 배경음악 Spring music (loop)"), ("ambience", "음유시인 류트 Bard lute (loop)"),
              ("sfx", "새 효과음 New sound effects"))
    for kind, title in titles:
        parts.append(f"<h2>{title}</h2><div class='grid'>")
        for key, a in rows[kind]:
            parts.append(
                f"<div class='card'><button data-key='{key}' data-vol='{a['volume']}' data-loop='{int(a['loop'])}'>"
                f"&#9654;</button><div><b>{key}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                f"{' &middot; loop' if a['loop'] else ''}</small></div></div>")
        parts.append("</div>")
    ref = [("sfx_chop_1", "v1 chop"), ("sfx_coin", "v1 coin"), ("sfx_customer_happy", "v1 customer"),
           ("bgm_village", "v1 village music")]
    parts.append("<h2>비교용 기존 소리 Reference (assets/audio)</h2><div class='grid'>")
    for key, label in ref:
        parts.append(f"<div class='card'><button data-key='{key}' data-v1='1' data-vol='' "
                     f"data-loop='{int(key.startswith('bgm'))}'>&#9654;</button><div><b>{key}</b>"
                     f"<small>{label}</small></div></div>")
    parts.append("</div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost Village Sounds 2</title>
<style>
:root{--bg:#F4F7FB;--card:#FFF8EC;--ink:#2B2F3A;--accent:#3D8BE0;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#1b2130;--card:#262e40;--ink:#eef2f8;--accent:#6aa9f0;--muted:#9aa3b2}}
body{margin:0;padding:16px;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
h1{font-size:22px;margin:4px 0 2px} h2{font-size:17px;margin:22px 0 8px} p{color:var(--muted);margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:8px}
code{overflow-wrap:anywhere}
.card{display:flex;gap:10px;align-items:center;background:var(--card);border-radius:12px;padding:8px 10px}
.card b{display:block;font-size:14px;overflow-wrap:anywhere} .card small{color:var(--muted)}
button{width:40px;height:40px;border-radius:50%;border:0;background:var(--accent);color:#fff;font-size:16px;cursor:pointer;flex:none}
button.on{background:#5CC86A} .bar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.bar button{width:auto;border-radius:10px;padding:0 14px;font-size:14px}
</style></head><body>
<h1>서리마을 개척기 &mdash; 새 소리 미리듣기 (v2&ndash;v4 sounds)</h1>
<p>버튼을 누르면 게임과 같은 기본 볼륨으로 재생됩니다 (반복음은 한 번 더 누르면 정지). 맨 아래 기존 소리와 크기를 비교해 보세요.
Each sound plays at its in-game base volume through Web Audio (loops are sample-accurate).
Open through the game's local web server (e.g. <code>http://localhost:8000/docs/previews/audio2_preview.html</code>).</p>
<div class="bar"><button id="mix">&#9654; 마을 수다 테스트 Village chatter test</button>
<button id="spring">&#9654; 봄 테스트 Spring test</button><button id="stop">&#9632; Stop all</button></div>
""" + "\n".join(parts) + """
<script>
const BASE='../../assets/audio2/', BASE1='../../assets/audio/'; let ctx=null; const bufs={}; const playing={}; let man1=null;
const ogg=(()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')!==''}catch(e){return false}})();
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function vol1(k){if(!man1)man1=await (await fetch(BASE1+'manifest.json')).json();return man1.audio[k].volume}
async function load(k,v1){const id=(v1?'1:':'')+k;if(bufs[id])return bufs[id];const r=await fetch((v1?BASE1:BASE)+k+(ogg?'.ogg':'.mp3'));
 const ab=await r.arrayBuffer();bufs[id]=await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no));return bufs[id]}
async function play(k,vol,loop,btn,v1){const c=ac();const b=await load(k,v1);const s=c.createBufferSource();const g=c.createGain();
 s.buffer=b;s.loop=!!loop;g.gain.value=vol;s.connect(g).connect(c.destination);s.start();
 if(loop){playing[k]={s,btn,g};if(btn)btn.classList.add('on')}
 s.onended=()=>{if(btn)btn.classList.remove('on');if(playing[k]&&playing[k].s===s)delete playing[k]};return s}
function stop(k){const p=playing[k];if(p){try{p.s.stop()}catch(e){}if(p.btn)p.btn.classList.remove('on');delete playing[k]}}
function stopAll(){Object.keys(playing).forEach(stop);(window._mixT||[]).forEach(clearTimeout);window._mixT=[]}
document.querySelectorAll('.card button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;
 if(playing[k]){stop(k);return} try{const v1=b.dataset.v1==='1';const v=v1?await vol1(k):+b.dataset.vol;
 await play(k,v,b.dataset.loop==='1',b,v1)}catch(e){alertMsg(e)}});
function alertMsg(e){const p=document.createElement('p');p.textContent='Could not load audio ('+e+'). Open via http://, not file://';document.body.prepend(p)}
const vol=k=>+document.querySelector(`[data-key="${k}"]`).dataset.vol;
function at(ms,f){window._mixT=window._mixT||[];window._mixT.push(setTimeout(f,ms))}
document.getElementById('stop').onclick=stopAll;
document.getElementById('mix').onclick=async()=>{stopAll();try{await play('bgm_village',await vol1('bgm_village'),true,null,true)}catch(e){}
 await play('sfx_lute',vol('sfx_lute')*0.5,true,null);
 const seq=[[300,'sfx_chatter_1'],[1100,'sfx_chatter_4'],[1900,'sfx_chatter_2'],[2600,'sfx_laugh_1'],[3600,'sfx_chatter_5'],
  [4400,'sfx_chatter_3'],[5200,'sfx_laugh_2'],[6200,'sfx_snowball_throw'],[6600,'sfx_snowball_hit'],[7000,'sfx_laugh_1'],
  [7800,'sfx_dog_bark'],[8600,'sfx_cat_meow'],[9400,'sfx_penguin'],[10200,'sfx_hammer_1'],[10600,'sfx_hammer_2'],
  [11000,'sfx_hammer_3'],[11400,'sfx_hammer_1'],[11900,'sfx_saw_short'],[12700,'sfx_build_done'],[13300,'sfx_cheer'],
  [15200,'sfx_register'],[16400,'sfx_boat_horn'],[17800,'sfx_row'],[18700,'sfx_row'],[19600,'sfx_chatter_6']];
 seq.forEach(([ms,k])=>at(ms,()=>play(k,vol(k),false,null)))};
document.getElementById('spring').onclick=async()=>{stopAll();
 at(0,()=>play('sfx_tower_fire',vol('sfx_tower_fire'),false,null));at(1600,()=>play('sfx_fog_clear',vol('sfx_fog_clear'),false,null));
 at(3600,()=>play('bgm_spring',vol('bgm_spring'),true,null));at(4200,()=>play('sfx_cheer',vol('sfx_cheer'),false,null))};
</script></body></html>
"""
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "audio2_preview.html"), "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated keys to (re)build")
    ap.add_argument("--skip-render", action="store_true", help="reuse tools/audio/_cache/audio2/*.wav")
    ap.add_argument("--no-check", action="store_true", help="do not run check_audio2.py afterwards")
    ap.add_argument("--workers", type=int, default=2)
    a = ap.parse_args()
    keys = [k.strip() for k in a.only.split(",") if k.strip()] or list(SOUNDS)
    bad = [k for k in keys if k not in SOUNDS]
    if bad:
        sys.exit(f"unknown keys: {bad}")
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    if not a.skip_render:
        print(f"[1/4] rendering {len(keys)} sounds ...", flush=True)
        render(keys, a.workers)
    print("[2/4] encoding ogg + mp3 ...", flush=True)
    meas = BA.encode_all(keys, max(1, a.workers + 1))
    rest = [k for k in SOUNDS if k not in meas]
    if rest:
        meas.update(BA.load_measurements(rest))
    print("[3/4] manifest + listening page ...", flush=True)
    man = write_manifest(meas)
    write_preview_html(man)
    print(f"  {'key':20s} {'dur':>6s} {'I':>6s} {'Mmax':>6s} {'peak':>6s} {'trim':>5s} {'vol':>6s}")
    for key in SOUNDS:
        m = meas[key]
        o = m["ogg"]
        print(f"  {key:20s} {m['duration']:6.2f} {o['I']:6.1f} {o['M']:6.1f} {max(o['peak'], m['mp3']['peak']):6.1f}"
              f" {m['trim_db']:5.1f} {man['audio'][key]['volume']:6.3f}")
    print(f"  done in {time.time() - t0:.0f}s -> {os.path.relpath(OUT, ROOT)}/manifest.json")
    if not a.no_check:
        print("[4/4] check_audio2.py ...", flush=True)
        import check_audio2
        sys.exit(check_audio2.main([]))


if __name__ == "__main__":
    main()
