"""Frost Village - build the v5 sounds (CONTRACT_V5 section R) into assets/audio3/.

render (sfx3.py, music3.py) -> loop fitting -> encode (.ogg + .mp3) -> measure -> manifest -> QA.
Reuses build_audio.py's machinery by importing it (that file is not modified): fit_loop() (Vorbis
block-boundary loop fitting with the grid-of-64 fallback), _encode_one() (Vorbis q4 + LAME, codec-peak
trim), volume_for() (loudness -> manifest volume, same HEADROOM_DB / target conventions as assets/audio
and assets/audio2), encode_all(), load_measurements() and the same CHANNELS / MP3_KBPS / PEAK_MAX tables.
Its module-level tables are re-pointed at the audio3 key set, cache and output folder *inside this
process only* (bind()), so nothing in assets/audio or assets/audio2 is touched.

Run from anywhere (deterministic, safe to re-run; a few minutes on 2 busy cores):
    python3 tools/audio/build_audio3.py                          # everything + check_audio3
    python3 tools/audio/build_audio3.py --only sfx_door,amb_town
    python3 tools/audio/build_audio3.py --skip-render            # re-encode from tools/audio/_cache/audio3/*.wav
    python3 tools/audio/build_audio3.py --no-check               # skip check_audio3.py at the end
    python3 tools/audio/build_audio3.py --workers 2
Outputs
    assets/audio3/<key>.ogg + .mp3      44.1 kHz; music stereo, ambience-type loops + sfx mono
    assets/audio3/manifest.json         CONTRACT section 2 fragment: audio{} + audioGroups{}
    docs/previews/audio3_preview.html   listening page (open through the game's local web server)
    (check_audio3.py) docs/previews/audio3_report.txt, audio3_waveforms.png, audio3_demo.mp3
Mix conventions = assets/audio + audio2: files mastered hot (sfx peak -1.5 dBFS, music -18 LUFS, loops
-20 LUFS), manifest `volume` = 10^((TARGET + HEADROOM_DB - measured) / 20) with the TARGET table below.
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
CACHE = os.path.join(HERE, "_cache", "audio3")
OUT = os.path.join(ROOT, "assets", "audio3")
PREV = os.path.join(ROOT, "docs", "previews")
REL = "audio3"                                                    # manifest paths are relative to assets/

# ----------------------------------------------------------------------------- the sound list
# key: (kind, loop, target loudness at game call volume 1 (before HEADROOM_DB), extra manifest fields)
#   music / ambience: integrated LUFS ; sfx: max momentary LUFS (400 ms) - same as build_audio.SOUNDS.
#   extra "cues" = seconds from the start of the file to a sync point.
#   References: bgm_village / bgm_spring -24.5, amb_wind -32.5, amb_sea -31.5, sfx_lute (positional loop) -25,
#   sfx_boat_horn -16.5, sfx_chop -16, sfx_laugh -18.5, sfx_build_done / sfx_unlock -15, sfx_complete -14.
VEHICLE_NOTE = ("positional mono loop: play like ambience, Audio.setAmbience('{k}', 0..1) by distance to the "
                "nearest {what} (or sm.add(key,{{loop:true}}) per vehicle)")
SOUNDS = {
    "bgm_wedding":       ("music", True, -24.5, {"bars": 16, "tonality": "F major",
                                                "notes": "town-hall wedding march (124 bpm, 31 s). A = bgm_village hook, "
                                                         "B = a nod to the Bridal Chorus incipit (public domain) on bells; "
                                                         "~11 MB as decoded PCM: load when a wedding starts."}),
    "bgm_farewell":      ("music", True, -25.0, {"bars": 16, "meter": "3/4", "tonality": "F major",
                                                "notes": "memorial-garden flower farewell: gentle, warm, hopeful lullaby "
                                                         "on the village hook (93 bpm 3/4, 31 s), no drums; load on demand."}),
    "amb_night":         ("ambience", True, -33.0, {"notes": "winter night bed: soft wind, distant owl + answer, faint wind "
                                                             "chime. Crossfade with audio/amb_wind at dusk (setAmbience)."}),
    "amb_town":          ("ambience", True, -31.5, {"notes": "busy town murmur (walla, passers-by, footsteps, distant traffic, "
                                                            "shop bell). Scale with the number of townsfolk on screen."}),
    "sfx_truck_engine":  ("ambience", True, -27.0, {"notes": VEHICLE_NOTE.format(k="sfx_truck_engine", what="truck / bus / car")
                                                    + "; rate 0.85 idle .. 1.0 cruise .. 1.3 fast (Phaser sound rate)"}),
    "sfx_sleigh_bells":  ("ambience", True, -26.5, {"notes": VEHICLE_NOTE.format(k="sfx_sleigh_bells", what="horse sleigh bus / "
                                                                                 "cargo sleigh / dog sled")
                                                    + "; 8 jingles per loop, ~ the trot tempo of sfx_horse_trot (loop "
                                                      "lengths 2.40 / 2.42 s after Vorbis fitting: not beat-locked)"}),
    "sfx_horse_trot":    ("ambience", True, -26.0, {"notes": VEHICLE_NOTE.format(k="sfx_horse_trot", what="horse sleigh bus")
                                                    + "; rate ~ horse speed (0.8 .. 1.2)"}),
    "sfx_bus_horn":      ("sfx", False, -16.5, {"cues": {"toot1": 0.0, "toot2": 0.21}}),
    "sfx_car_honk_1":    ("sfx", False, -17.0, {"cues": {"pip1": 0.0, "pip2": 0.15}}),
    "sfx_car_honk_2":    ("sfx", False, -17.0, {}),
    "sfx_steam_whistle": ("sfx", False, -16.5, {"cues": {"toot1": 0.05, "toot2": 0.34}}),
    "sfx_brakes":        ("sfx", False, -18.5, {"cues": {"squeal": 0.12, "stop": 0.47, "air": 0.6}}),
    "sfx_door":          ("sfx", False, -18.5, {"cues": {"click": 0.0, "thunk": 0.21}}),
    "sfx_bell_hall":     ("sfx", False, -16.5, {"cues": {"ding1": 0.0, "dong1": 0.6, "ding2": 1.2, "dong2": 1.8},
                                               "notes": "town-hall tower bells (C5 / F4 strike notes); hourly chime, "
                                                        "wedding start, festival"}),
    "sfx_school_bell":   ("sfx", False, -17.5, {"notes": "brass hand bell, ~1.6 s of ringing then rings out (class "
                                                        "start / end)"}),
    "sfx_baby_giggle":   ("sfx", False, -18.5, {"voice": "baby", "cues": {"giggle": 0.22},
                                               "notes": "rattle shake + tiny giggle + coo"}),
    "sfx_mission_done":  ("sfx", False, -15.0, {"cues": {"stamp": 0.0, "jingle": 0.13, "land": 0.37}}),
    "sfx_fame_up":       ("sfx", False, -14.5, {"cues": {"fanfare": 0.345, "star": 0.725}}),
}
GROUPS = {
    "sfx_car_honk": ["sfx_car_honk_1", "sfx_car_honk_2"],
}
LOOPS = {"bgm_wedding": ("music3", "render_wedding"), "bgm_farewell": ("music3", "render_farewell"),
         "amb_night": ("sfx3", "render_night"), "amb_town": ("sfx3", "render_town"),
         "sfx_truck_engine": ("sfx3", "render_truck_engine"), "sfx_sleigh_bells": ("sfx3", "render_sleigh_bells"),
         "sfx_horse_trot": ("sfx3", "render_horse_trot")}
# extra loop-render meta copied into the manifest (besides loopSamples / bpm)
META_KEYS = ("firingHz", "rotation")
# Short, smooth, low-passed loops whose Vorbis coding error alone can step at the wrap (the error at the
# file end and at the file start are uncorrelated): try render variants, keep the smoothest decoded seam.
SEAM_FIT = {"sfx_truck_engine": [{"seed": s} for s in range(8100, 8132)]}
# Same codec settings as assets/audio + audio2 (build_audio.MP3_KBPS / CHANNELS / OGG_Q).
MP3_KBPS = dict(BA.MP3_KBPS)


def bind():
    """Point build_audio's module tables at the audio3 set (this process / worker only)."""
    BA.SOUNDS = SOUNDS
    BA.LOOPS = LOOPS
    BA.GROUPS = GROUPS
    BA.CACHE = CACHE
    BA.OUT = OUT
    BA.MP3_KBPS = MP3_KBPS


bind()


# ----------------------------------------------------------------------------- render
def fit_loop_seam(key: str, variants, good: float = 0.6):
    """build_audio.fit_loop for each render variant (e.g. seeds) of a loop; every fitted loop is encoded
    exactly like the delivery (Vorbis q4 and LAME, CHANNELS[kind]) and decoded, and the variant whose
    decoded wrap is smoothest in BOTH formats (check_audio.loop_metrics: max of d2_ratio and hf_ratio)
    wins; stops at the first one below ``good``. Returns (x, meta) like fit_loop, + seamVariant / seamRatio."""
    import functools
    import importlib

    import synth as S
    from check_audio import loop_metrics
    mod_name, fn = LOOPS[key]
    mod = importlib.import_module(mod_name)
    base = getattr(mod, fn)
    ch = BA.CHANNELS[SOUNDS[key][0]]
    tmp_wav, tmp_ogg, tmp_mp3 = (os.path.join(CACHE, f"{key}.seam.{e}") for e in ("wav", "ogg", "mp3"))
    best = None
    try:
        for kw in variants:
            setattr(mod, "_seam_variant", functools.partial(base, **kw))
            LOOPS[key] = (mod_name, "_seam_variant")
            x, meta = BA.fit_loop(key)
            if meta.get("fitMethod") == "failed":
                continue
            S.write_wav(tmp_wav, x)
            score = 0.0
            for enc, tmp in ((lambda: F.encode_ogg(tmp_wav, tmp_ogg, ch, BA.OGG_Q), tmp_ogg),
                             (lambda: F.encode_mp3(tmp_wav, tmp_mp3, ch, MP3_KBPS[SOUNDS[key][0]]), tmp_mp3)):
                enc()
                d = F.decode(tmp, ch)
                if d.shape[1] != x.shape[-1]:
                    score = 99.0
                    break
                lm = loop_metrics(d)
                score = max(score, lm["d2_ratio"], lm["hf_ratio"])
            meta = dict(meta, seamVariant=kw, seamRatio=round(score, 3))
            if best is None or score < best[0]:
                best = (score, x, meta)
            if score < good:
                break
    finally:
        LOOPS[key] = (mod_name, fn)
        for p in (tmp_wav, tmp_ogg, tmp_mp3):
            if os.path.exists(p):
                os.remove(p)
    if best is None:
        return BA.fit_loop(key)
    return best[1], best[2]


def _render_job(key: str) -> str:
    """Worker: render one key to _cache/audio3/<key>.wav (+ .json meta). Loops go through fit_loop."""
    bind()
    sys.path.insert(0, HERE)
    import synth as S
    t0 = time.time()
    os.makedirs(CACHE, exist_ok=True)
    meta = {}
    if key in SEAM_FIT:
        x, meta = fit_loop_seam(key, SEAM_FIT[key])
    elif key in LOOPS:
        x, meta = BA.fit_loop(key)
    else:
        import sfx3
        x = sfx3.render(key)
    S.write_wav(os.path.join(CACHE, f"{key}.wav"), x)
    with open(os.path.join(CACHE, f"{key}.json"), "w") as f:
        json.dump(meta, f)
    extra = (f"  loop {meta['loopSamples']} smp ({meta.get('fitMethod')}, nominal {meta.get('nominalSamples')}"
             f"{', seam ' + str(meta['seamRatio']) + ' ' + str(meta['seamVariant']) if 'seamRatio' in meta else ''})"
             if key in LOOPS else "")
    return f"  rendered {key:20s} {x.shape[-1] / S.SR:6.2f}s  ({time.time() - t0:5.1f}s){extra}"


def render(keys, workers: int):
    heavy = [k for k in keys if k in LOOPS]
    light = [k for k in keys if k not in LOOPS]
    rank = {"bgm_wedding": 0, "bgm_farewell": 1, "amb_town": 2, "amb_night": 3}
    order = sorted(heavy, key=lambda k: rank.get(k, 9)) + light                # long poles first
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
            for mk in META_KEYS:
                if mk in meta:
                    entry[mk] = meta[mk]
        if loop:
            gl = F.mp3_gapless(os.path.join(OUT, f"{key}.mp3"))
            if gl:
                entry["mp3StartPad"] = gl[0] + 529        # only for decoders that ignore the LAME tag
        entry.update(extra)
        audio[key] = entry
    man = {"version": 1,
           "generator": "tools/audio/build_audio3.py (procedural synthesis: sfx3.py, music3.py; "
                        "same toolkit + loudness conventions as assets/audio and assets/audio2)",
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
    titles = (("music", "결혼식 · 배웅 음악 Wedding & farewell music (loops)"),
              ("ambience", "환경음 · 탈것 반복음 Ambience & vehicle loops"),
              ("sfx", "새 효과음 New sound effects"))
    for kind, title in titles:
        parts.append(f"<h2>{title}</h2><div class='grid'>")
        for key, a in rows[kind]:
            parts.append(
                f"<div class='card'><button data-key='{key}' data-vol='{a['volume']}' data-loop='{int(a['loop'])}'>"
                f"&#9654;</button><div><b>{key}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                f"{' &middot; loop' if a['loop'] else ''}</small></div></div>")
        parts.append("</div>")
    ref = [("bgm_village", "audio", "v1 village music"), ("amb_wind", "audio", "v1 wind"),
           ("sfx_complete", "audio", "v1 complete"), ("sfx_boat_horn", "audio2", "v2 boat horn"),
           ("sfx_cheer", "audio2", "v2 cheer")]
    parts.append("<h2>비교용 기존 소리 Reference (assets/audio, audio2)</h2><div class='grid'>")
    for key, frag, label in ref:
        parts.append(f"<div class='card'><button data-key='{key}' data-frag='{frag}' data-vol='' "
                     f"data-loop='{int(key.startswith(('bgm', 'amb')))}'>&#9654;</button><div><b>{key}</b>"
                     f"<small>{label}</small></div></div>")
    parts.append("</div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost Village Sounds 3</title>
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
<h1>서리마을 개척기 &mdash; v5 소리 미리듣기 (탈것 · 미션 · 결혼식 · 배웅)</h1>
<p>버튼을 누르면 게임과 같은 기본 볼륨으로 재생됩니다 (반복음은 한 번 더 누르면 정지). 맨 아래 기존 소리와 크기를 비교해 보세요.
Each sound plays at its in-game base volume through Web Audio (loops are sample-accurate).
Open through the game's local web server (e.g. <code>http://localhost:8000/docs/previews/audio3_preview.html</code>).</p>
<div class="bar"><button id="bus">&#9654; 버스 도착 Bus arrives</button><button id="sleigh">&#9654; 말썰매 Horse sleigh</button>
<button id="wedding">&#9654; 결혼식 Wedding</button><button id="night">&#9654; 밤 · 배웅 Night &amp; farewell</button>
<button id="stop">&#9632; Stop all</button></div>
""" + "\n".join(parts) + """
<script>
const BASES={audio3:'../../assets/audio3/',audio:'../../assets/audio/',audio2:'../../assets/audio2/'};
let ctx=null; const bufs={}; const playing={}; const mans={};
const ogg=(()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')!==''}catch(e){return false}})();
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function volOf(k,frag){if(frag==='audio3')return +document.querySelector(`[data-key="${k}"]`).dataset.vol;
 if(!mans[frag])mans[frag]=await (await fetch(BASES[frag]+'manifest.json')).json();return mans[frag].audio[k].volume}
async function load(k,frag){const id=frag+':'+k;if(bufs[id])return bufs[id];const r=await fetch(BASES[frag]+k+(ogg?'.ogg':'.mp3'));
 const ab=await r.arrayBuffer();bufs[id]=await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no));return bufs[id]}
async function play(k,mult,loop,btn,frag){frag=frag||'audio3';const c=ac();const b=await load(k,frag);const v=await volOf(k,frag);
 const s=c.createBufferSource();const g=c.createGain();s.buffer=b;s.loop=!!loop;g.gain.value=v*(mult===undefined?1:mult);
 s.connect(g).connect(c.destination);s.start();
 if(loop){playing[k]={s,btn,g};if(btn)btn.classList.add('on')}
 s.onended=()=>{if(btn)btn.classList.remove('on');if(playing[k]&&playing[k].s===s)delete playing[k]};return s}
function stop(k){const p=playing[k];if(p){try{p.s.stop()}catch(e){}if(p.btn)p.btn.classList.remove('on');delete playing[k]}}
function stopAll(){Object.keys(playing).forEach(stop);(window._mixT||[]).forEach(clearTimeout);window._mixT=[]}
function alertMsg(e){const p=document.createElement('p');p.textContent='Could not load audio ('+e+'). Open via http://, not file://';document.body.prepend(p)}
document.querySelectorAll('.card button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;
 if(playing[k]){stop(k);return} try{await play(k,1,b.dataset.loop==='1',b,b.dataset.frag||'audio3')}catch(e){alertMsg(e)}});
document.getElementById('stop').onclick=stopAll;
const seq=(list)=>list.forEach(([ms,k,m,fr])=>{window._mixT=window._mixT||[];window._mixT.push(setTimeout(()=>play(k,m,false,null,fr).catch(alertMsg),ms))});
document.getElementById('bus').onclick=async()=>{stopAll();try{await play('amb_town',1,true,null);await play('sfx_truck_engine',0.6,true,null)}catch(e){alertMsg(e)}
 seq([[600,'sfx_bus_horn',1],[2200,'sfx_brakes',1],[3300,'sfx_door',1],[4200,'sfx_car_honk_1',1],[5600,'sfx_car_honk_2',0.8],[7000,'sfx_mission_done',1],[9000,'sfx_fame_up',1]])};
document.getElementById('sleigh').onclick=async()=>{stopAll();try{await play('sfx_horse_trot',1,true,null);await play('sfx_sleigh_bells',1,true,null)}catch(e){alertMsg(e)}
 seq([[1500,'sfx_steam_whistle',0.9],[4000,'sfx_school_bell',0.7]])};
document.getElementById('wedding').onclick=async()=>{stopAll();seq([[0,'sfx_bell_hall',1],[1800,'sfx_cheer',0.9,'audio2'],[9000,'sfx_baby_giggle',1]]);
 window._mixT.push(setTimeout(()=>play('bgm_wedding',1,true,null).catch(alertMsg),2600))};
document.getElementById('night').onclick=async()=>{stopAll();try{await play('amb_night',1,true,null);await play('bgm_farewell',1,true,null)}catch(e){alertMsg(e)}};
</script></body></html>
"""
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "audio3_preview.html"), "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated keys to (re)build")
    ap.add_argument("--skip-render", action="store_true", help="reuse tools/audio/_cache/audio3/*.wav")
    ap.add_argument("--no-check", action="store_true", help="do not run check_audio3.py afterwards")
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
    print(f"  done in {time.time() - t0:.0f}s -> {os.path.relpath(OUT, ROOT)}/manifest.json", flush=True)
    if not a.no_check:
        print("[4/4] check_audio3.py ...", flush=True)
        import check_audio3
        sys.exit(check_audio3.main([]))


if __name__ == "__main__":
    main()
