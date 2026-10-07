"""Frost Village - build the v6 harbour sounds (CONTRACT_V6 section U) into assets/audio4/.

render (sfx4.py, music4.py) -> loop fitting -> encode (.ogg + .mp3) -> measure -> manifest -> QA.
Reuses build_audio.py's machinery by importing it (that file is not modified): fit_loop() (Vorbis
block-boundary loop fitting with the grid-of-64 fallback), _encode_one() (Vorbis q4 + LAME, codec-peak
trim), volume_for() (loudness -> manifest volume, same HEADROOM_DB / target conventions as assets/audio,
audio2 and audio3), encode_all(), load_measurements() and the same CHANNELS / MP3_KBPS / PEAK_MAX tables.
Its module-level tables are re-pointed at the audio4 key set, cache and output folder *inside this process
only* (bind()), so nothing in assets/audio, audio2 or audio3 is touched.

Run from anywhere (deterministic, safe to re-run; a few minutes on busy cores):
    python3 tools/audio/build_audio4.py                          # everything + check_audio4
    python3 tools/audio/build_audio4.py --only sfx_crane,amb_harbor
    python3 tools/audio/build_audio4.py --skip-render            # re-encode from tools/audio/_cache/audio4/*.wav
    python3 tools/audio/build_audio4.py --no-check               # skip check_audio4.py at the end
    python3 tools/audio/build_audio4.py --workers 2
Outputs
    assets/audio4/<key>.ogg + .mp3      44.1 kHz; music stereo, ambience + sfx mono
    assets/audio4/manifest.json         CONTRACT section 2 fragment: audio{} + audioGroups{}
    docs/previews/audio4_preview.html   listening page (open through the game's local web server)
    (check_audio4.py) docs/previews/audio4_report.txt, audio4_waveforms.png, audio4_demo.mp3
Mix conventions = assets/audio, audio2, audio3: files mastered hot (sfx peak -1.5 dBFS, music -18 LUFS, loops
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
CACHE = os.path.join(HERE, "_cache", "audio4")
OUT = os.path.join(ROOT, "assets", "audio4")
PREV = os.path.join(ROOT, "docs", "previews")
REL = "audio4"                                                    # manifest paths are relative to assets/

# ----------------------------------------------------------------------------- the sound list
# key: (kind, loop, target loudness at game call volume 1 (before HEADROOM_DB), extra manifest fields)
#   music / ambience: integrated LUFS ; sfx: max momentary LUFS (400 ms) - same as build_audio.SOUNDS.
#   extra "cues" = seconds from the start of the file to a sync point.
#   References: bgm_village / bgm_spring / bgm_wedding -24.5, amb_sea -31.5, amb_town -31.5, sfx_boat_horn -16.5,
#   sfx_bell_hall -16.5, sfx_school_bell -17.5, sfx_chop -16, sfx_laugh / sfx_baby_giggle -18.5, sfx_saw -18.
SOUNDS = {
    "bgm_harbor":        ("music", True, -24.5, {"bars": 48, "meter": "6/8", "tonality": "F major",
                                                "notes": "harbour-city theme: cheerful sea-shanty flavour (6/8 jig lilt, dotted "
                                                         "quarter = 94 bpm, ~61 s), the bgm_village hook re-set as a rocking "
                                                         "shanty line; accordion, tin whistle, marimba, stomps + claps. "
                                                         "~21 MB as decoded PCM: load when the player first reaches the "
                                                         "harbour (lazy), crossfade from bgm_village with playMusic()."}),
    "amb_harbor":        ("ambience", True, -31.5, {"notes": "harbour bed: water lapping on the pier pilings, gulls near and far, "
                                                            "a bell buoy + a far ship's bell, rigging tinks, moored boats creaking. "
                                                            "Audio.setAmbience('amb_harbor', 0..1) by distance to the quay; "
                                                            "use instead of (or crossfade with) audio/amb_sea there."}),
    "sfx_ship_horn_big": ("sfx", False, -16.0, {"cues": {"blast": 0.0, "blastEnd": 2.3, "echo": 0.46},
                                               "notes": "deep warm ferry / cargo-ship horn (F2 + C3 diaphones), one long blast "
                                                        "+ harbour echo. Ship arriving / departing; audible map-wide "
                                                        "(volume 0.6-1.0 by distance)."}),
    "sfx_ferry_bell":    ("sfx", False, -16.5, {"cues": {"ding1": 0.0, "ding2": 0.23, "ding3": 0.95, "ding4": 1.18},
                                               "notes": "brass ship's bell, strike A5, rung in pairs: ferry boarding / "
                                                        "departure ('all aboard')."}),
    "sfx_seagull_1":     ("sfx", False, -18.5, {"notes": "long mew 'kyaaaow'. Group sfx_seagull: play at random "
                                                        "(every 4-12 s near the water) with rate 0.9-1.12 and volume by "
                                                        "distance; one-shot when a seagull sprite lands / takes off."}),
    "sfx_seagull_2":     ("sfx", False, -18.5, {"cues": {"call": 0.0, "kyows": 0.44},
                                               "notes": "long call 'kee-aaa kyow-kyow-kyow-kyow' (group sfx_seagull)."}),
    "sfx_seagull_3":     ("sfx", False, -18.5, {"notes": "cheeky chuckle 'kek-kek-kek-kek kew?' (group sfx_seagull)."}),
    "sfx_crane":         ("sfx", False, -18.0, {"cues": {"latch": 0.0, "liftStart": 0.05, "slew": 0.74, "lower": 0.97,
                                                        "drop": 1.25, "rewind": 1.36},
                                               "syncAnim": "harbor/harbor_crane anims.work (8 f @ 4 fps = 2.0 s): play once "
                                                           "on frame 0 of every cycle; cue 'drop' = dropFrame 5 (1.25 s)",
                                               "notes": "winch whirr up, slew creak, lower, crate set down (thunk + chain "
                                                        "jingle + clank), rewind. Use volume 0.4-0.7 for a crane in "
                                                        "the background, throttle to one per cycle per crane."}),
    "sfx_auction_bell":  ("sfx", False, -17.0, {"cues": {"burst1": 0.0, "burst2": 0.72},
                                               "notes": "fish-auction hand bell (F5 brass) shaken in two bursts: the "
                                                        "auctioneer opens the bidding when a trawler's catch arrives."}),
    "sfx_rope_creak":    ("sfx", False, -19.5, {"cues": {"creak": 0.0, "slack": 0.98},
                                               "notes": "mooring rope straining on a wooden bollard. Random every 6-15 s "
                                                        "near moored ships (volume 0.5-1, rate 0.85-1.15)."}),
}
GROUPS = {
    "sfx_seagull": ["sfx_seagull_1", "sfx_seagull_2", "sfx_seagull_3"],
}
LOOPS = {"bgm_harbor": ("music4", "render_harbor"), "amb_harbor": ("sfx4", "render_harbor_amb")}
# extra loop-render meta copied into the manifest (besides loopSamples / bpm)
META_KEYS = ("rotation",)
# Same codec settings as assets/audio .. audio3 (build_audio.MP3_KBPS / CHANNELS / OGG_Q).
MP3_KBPS = dict(BA.MP3_KBPS)


def bind():
    """Point build_audio's module tables at the audio4 set (this process / worker only)."""
    BA.SOUNDS = SOUNDS
    BA.LOOPS = LOOPS
    BA.GROUPS = GROUPS
    BA.CACHE = CACHE
    BA.OUT = OUT
    BA.MP3_KBPS = MP3_KBPS


bind()


# ----------------------------------------------------------------------------- render
def _render_job(key: str) -> str:
    """Worker: render one key to _cache/audio4/<key>.wav (+ .json meta). Loops go through fit_loop."""
    bind()
    sys.path.insert(0, HERE)
    import synth as S
    t0 = time.time()
    os.makedirs(CACHE, exist_ok=True)
    meta = {}
    if key in LOOPS:
        x, meta = BA.fit_loop(key)
    else:
        import sfx4
        x = sfx4.render(key)
    S.write_wav(os.path.join(CACHE, f"{key}.wav"), x)
    with open(os.path.join(CACHE, f"{key}.json"), "w") as f:
        json.dump(meta, f)
    extra = (f"  loop {meta['loopSamples']} smp ({meta.get('fitMethod')}, nominal {meta.get('nominalSamples')})"
             if key in LOOPS else "")
    return f"  rendered {key:20s} {x.shape[-1] / S.SR:6.2f}s  ({time.time() - t0:5.1f}s){extra}"


def render(keys, workers: int):
    heavy = [k for k in keys if k in LOOPS]
    light = [k for k in keys if k not in LOOPS]
    rank = {"bgm_harbor": 0, "amb_harbor": 1}
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
           "generator": "tools/audio/build_audio4.py (procedural synthesis: sfx4.py, music4.py; "
                        "same toolkit + loudness conventions as assets/audio, audio2 and audio3)",
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
    titles = (("music", "항구 음악 Harbour music (loop)"),
              ("ambience", "항구 환경음 Harbour ambience (loop)"),
              ("sfx", "항구 효과음 Harbour sound effects"))
    for kind, title in titles:
        parts.append(f"<h2>{title}</h2><div class='grid'>")
        for key, a in rows[kind]:
            parts.append(
                f"<div class='card'><button data-key='{key}' data-vol='{a['volume']}' data-loop='{int(a['loop'])}'>"
                f"&#9654;</button><div><b>{key}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                f"{' &middot; loop' if a['loop'] else ''}</small></div></div>")
        parts.append("</div>")
    ref = [("bgm_village", "audio", "v1 village music"), ("amb_sea", "audio", "v1 sea"),
           ("sfx_boat_horn", "audio2", "v2 boat horn"), ("sfx_bell_hall", "audio3", "v5 town-hall bells"),
           ("sfx_school_bell", "audio3", "v5 school bell")]
    parts.append("<h2>비교용 기존 소리 Reference (assets/audio, audio2, audio3)</h2><div class='grid'>")
    for key, frag, label in ref:
        parts.append(f"<div class='card'><button data-key='{key}' data-frag='{frag}' data-vol='' "
                     f"data-loop='{int(key.startswith(('bgm', 'amb')))}'>&#9654;</button><div><b>{key}</b>"
                     f"<small>{label}</small></div></div>")
    parts.append("</div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost Village Harbour Sounds</title>
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
<h1>서리마을 개척기 &mdash; 갈매기 항구 소리 미리듣기 (v6 harbour city)</h1>
<p>버튼을 누르면 게임과 같은 기본 볼륨으로 재생됩니다 (반복음은 한 번 더 누르면 정지). 맨 아래 기존 소리와 크기를 비교해 보세요.
Each sound plays at its in-game base volume through Web Audio (loops are sample-accurate).
Open through the game's local web server (e.g. <code>http://localhost:8000/docs/previews/audio4_preview.html</code>).</p>
<div class="bar"><button id="ferry">&#9654; 여객선 도착 Ferry arrives</button><button id="quay">&#9654; 부두 크레인 Quay &amp; crane</button>
<button id="auction">&#9654; 수산물 경매 Fish auction</button><button id="stop">&#9632; Stop all</button></div>
""" + "\n".join(parts) + """
<script>
const BASES={audio4:'../../assets/audio4/',audio:'../../assets/audio/',audio2:'../../assets/audio2/',audio3:'../../assets/audio3/'};
let ctx=null; const bufs={}; const playing={}; const mans={};
const ogg=(()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')!==''}catch(e){return false}})();
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function volOf(k,frag){if(frag==='audio4')return +document.querySelector(`[data-key="${k}"]`).dataset.vol;
 if(!mans[frag])mans[frag]=await (await fetch(BASES[frag]+'manifest.json')).json();return mans[frag].audio[k].volume}
async function load(k,frag){const id=frag+':'+k;if(bufs[id])return bufs[id];const r=await fetch(BASES[frag]+k+(ogg?'.ogg':'.mp3'));
 const ab=await r.arrayBuffer();bufs[id]=await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no));return bufs[id]}
async function play(k,mult,loop,btn,frag,rate){frag=frag||'audio4';const c=ac();const b=await load(k,frag);const v=await volOf(k,frag);
 const s=c.createBufferSource();const g=c.createGain();s.buffer=b;s.loop=!!loop;if(rate)s.playbackRate.value=rate;g.gain.value=v*(mult===undefined?1:mult);
 s.connect(g).connect(c.destination);s.start();
 if(loop){playing[k]={s,btn,g};if(btn)btn.classList.add('on')}
 s.onended=()=>{if(btn)btn.classList.remove('on');if(playing[k]&&playing[k].s===s)delete playing[k]};return s}
function stop(k){const p=playing[k];if(p){try{p.s.stop()}catch(e){}if(p.btn)p.btn.classList.remove('on');delete playing[k]}}
function stopAll(){Object.keys(playing).forEach(stop);(window._mixT||[]).forEach(clearTimeout);window._mixT=[]}
function alertMsg(e){const p=document.createElement('p');p.textContent='Could not load audio ('+e+'). Open via http://, not file://';document.body.prepend(p)}
document.querySelectorAll('.card button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;
 if(playing[k]){stop(k);return} try{await play(k,1,b.dataset.loop==='1',b,b.dataset.frag||'audio4')}catch(e){alertMsg(e)}});
document.getElementById('stop').onclick=stopAll;
const seq=(list)=>list.forEach(([ms,k,m,fr,rate])=>{window._mixT=window._mixT||[];window._mixT.push(setTimeout(()=>play(k,m,false,null,fr,rate).catch(alertMsg),ms))});
document.getElementById('ferry').onclick=async()=>{stopAll();try{await play('amb_harbor',1,true,null);await play('bgm_harbor',0.8,true,null)}catch(e){alertMsg(e)}
 seq([[800,'sfx_seagull_1',0.8,'audio4',1.05],[2200,'sfx_ship_horn_big',1],[6200,'sfx_rope_creak',0.9],[7400,'sfx_ferry_bell',1],[9800,'sfx_seagull_2',0.6,'audio4',0.95],[11500,'sfx_chatter_2',0.6,'audio2'],[12300,'sfx_chatter_5',0.6,'audio2'],[13600,'sfx_laugh_1',0.5,'audio2']])};
document.getElementById('quay').onclick=async()=>{stopAll();try{await play('amb_harbor',1,true,null)}catch(e){alertMsg(e)}
 const l=[];for(let i=0;i<6;i++)l.push([500+i*2000,'sfx_crane',0.8]);l.push([3100,'sfx_seagull_3',0.7],[7800,'sfx_rope_creak',1],[9300,'sfx_boat_horn',0.6,'audio2']);seq(l)};
document.getElementById('auction').onclick=async()=>{stopAll();try{await play('amb_harbor',0.8,true,null)}catch(e){alertMsg(e)}
 seq([[500,'sfx_auction_bell',1],[2900,'sfx_chatter_4',0.7,'audio2'],[3300,'sfx_chatter_1',0.7,'audio2'],[3800,'sfx_chatter_6',0.7,'audio2'],[4600,'sfx_register',0.8,'audio2'],[5500,'sfx_coins_many',0.7,'audio'],[6300,'sfx_cheer',0.6,'audio2'],[8000,'sfx_seagull_2',0.7]])};
</script></body></html>
"""
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "audio4_preview.html"), "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated keys to (re)build")
    ap.add_argument("--skip-render", action="store_true", help="reuse tools/audio/_cache/audio4/*.wav")
    ap.add_argument("--no-check", action="store_true", help="do not run check_audio4.py afterwards")
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
        print("[4/4] check_audio4.py ...", flush=True)
        import check_audio4
        sys.exit(check_audio4.main([]))


if __name__ == "__main__":
    main()
