"""Frost Village - build the v7 living-sea + Sunny Beach sounds (CONTRACT_V7 section Z) into assets/audio5/.

render (sfx5.py, music5.py) -> loop fitting -> encode (.ogg + .mp3) -> measure -> manifest -> QA.
Reuses build_audio.py's machinery by importing it (that file is not modified): fit_loop() (Vorbis
block-boundary loop fitting with the grid-of-64 fallback), _encode_one() (Vorbis q4 + LAME, codec-peak
trim), volume_for() (loudness -> manifest volume, same HEADROOM_DB / target conventions as assets/audio .. audio4),
encode_all(), load_measurements() and the same CHANNELS / MP3_KBPS / PEAK_MAX tables. Its module-level tables
are re-pointed at the audio5 key set, cache and output folder *inside this process only* (bind()), so nothing
in assets/audio .. audio4 is touched.

Run from anywhere (deterministic, safe to re-run; ~4 min on busy cores):
    python3 tools/audio/build_audio5.py                          # everything + check_audio5
    python3 tools/audio/build_audio5.py --only sfx_hotel_bell,amb_beach
    python3 tools/audio/build_audio5.py --skip-render            # re-encode from tools/audio/_cache/audio5/*.wav
    python3 tools/audio/build_audio5.py --no-check               # skip check_audio5.py at the end
    python3 tools/audio/build_audio5.py --workers 2
Outputs
    assets/audio5/<key>.ogg + .mp3      44.1 kHz; music stereo, ambience + sfx mono
    assets/audio5/manifest.json         CONTRACT section 2 fragment: audio{} + audioGroups{}
    docs/previews/audio5_preview.html   listening page (open through the game's local web server)
    (check_audio5.py) docs/previews/audio5_report.txt, audio5_waveforms.png, audio5_demo.mp3
Mix conventions = assets/audio .. audio4: files mastered hot (sfx peak -1.5 dBFS, music -18 LUFS, loops -20 LUFS),
manifest `volume` = 10^((TARGET + HEADROOM_DB - measured) / 20) with the TARGET table below.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
import build_audio as BA  # noqa: E402
import ffmpeg_tools as F  # noqa: E402
import sfx5  # noqa: E402  (wash cue times)

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))           # frost-village/
CACHE = os.path.join(HERE, "_cache", "audio5")
OUT = os.path.join(ROOT, "assets", "audio5")
PREV = os.path.join(ROOT, "docs", "previews")
REL = "audio5"                                                    # manifest paths are relative to assets/

# ----------------------------------------------------------------------------- the sound list
# key: (kind, loop, target loudness at game call volume 1 (before HEADROOM_DB), extra manifest fields)
#   music / ambience: integrated LUFS ; sfx: max momentary LUFS (400 ms) - same as build_audio.SOUNDS.
#   extra "cues" = seconds from the start of the file to a sync point.
#   References: bgm_village / bgm_harbor -24.5, amb_sea / amb_harbor / amb_town -31.5, sfx_splash -17,
#   sfx_step_snow -17.5, sfx_school_bell -17.5, sfx_boat_horn / sfx_ferry_bell -16.5, sfx_chatter -19,
#   sfx_rope_creak -19.5.
_SWELL_NOTE = ("SWELL SYNC (src/systems/Water.js, shore swell period 6.0 s): the loop is swellWaves periods of "
               "swellPeriod s, one near wave per crest. cues.waterline = loop times its white water reaches the "
               "waterline (shader shore cycle 0), cues.breaks = the break just before, cues.upmost = backwash start. "
               "To start in step with the crests on screen: cyc = fract((water.shore.w * water.t + water._nu(gx, gy) "
               "- PI/2) / (2 PI)) at the sand / shore point nearest the camera; seek = (swellPhase + (cyc + k) * "
               "swellPeriod) mod duration (any integer k); play with { seek } and re-seek whenever the bed restarts.")
_CRASH_NOTE = ("Wave on rocks / breakwater / quay ('철썩!'), group sfx_wave_crash; a ~0.2 s surge runs in, the slap is at "
               "cues.impact. Drive it from Water.js crash events (big crests, av >= 0.78, at rock / breakwater points, "
               "about every 6 s; Water starts water/fx_wave_crash there and its frame 0 is the impact). crashEvents is "
               "a pure function of time, so look ahead by cues.impact: water.crashEvents(tPrev + 0.2, t + 0.2, "
               "(x, y, strength) => play) - the slap then lands on frame 0. Volume clamp(0.25 + 0.55 * strength, 0.3, "
               "1) x distance (strength 0.4-1.4), rate 0.94-1.06; skip off-camera points; at most 2 in any 0.5 s.")
_WASH_NOTE = ("Swash up the sand and back with a fizzing hiss, group sfx_wave_wash (1 medium, 2 small quick lap, 3 big "
              "with a long backwash). Play one on every shore-swell crest at the sand near the camera: the shore cycle "
              "cyc (see amb_sea_waves) wraps to 0 when a crest reaches the waterline - start the sound "
              "cues.waterline s before that. Volume 0.3-0.8 x water._av(gx, gy, t), rate 0.95-1.05. amb_beach only "
              "has a low surf bed on the same grid, so these washes ARE the near surf.")
_DRY_NOTE = ("Footstep on dry sand, group sfx_sand_step (1-3): like sfx_step_snow on the walk-cycle contact frames on "
             "beach sand (call volume ~0.32, rate 0.9-1.1); each is over within ~120 ms (running steps 0.225 s apart).")
_WET_NOTE = ("Footstep on damp firm sand, group sfx_sand_step_wet (4-5, 'thup'): instead of sfx_sand_step in the wet "
             "band at the waterline (Water.js shore distance about -RUNUP..0 on sand), call volume ~0.32.")
_KIDS_NOTE = ("Children playing nearby, group sfx_beach_kids (1 giggle, 2 squeal, 3 'o-maa~!', 4 'wheee~'): near "
              "beachfolk families / kids, one at a time at random every 6-15 s, volume 0.4-0.9 by distance, rate "
              "0.95-1.08 (4 also suits the banana boat). amb_beach only has a far babble.")
SOUNDS = {
    "bgm_beach":          ("music", True, -24.5, {"bars": 24, "meter": "4/4", "tonality": "F major",
                                                 "notes": "Sunny Beach theme (120 bpm calypso lilt): steel pan plays the "
                                                          "bgm_village hook and its B melody, ukulele, calypso bass, "
                                                          "congas, claves. Audio.playMusic('bgm_beach') at the beach. "
                                                          "~18 MB decoded: keep it out of Preload and load it lazily "
                                                          "with amb_beach when the player first nears the beach (e.g. "
                                                          "a lazy rule /^(bgm_beach|amb_beach)$/)."}),
    "amb_sea_waves":      ("ambience", True, -31.5, {"notes": "Real rolling sea for the village coast, replacing "
                                                              "audio/amb_sea: Audio.setAmbience('amb_sea_waves', 0.15 + "
                                                              "sea * 0.6) where Game.js drives amb_sea now, amb_sea to 0 "
                                                              "and then marked unused (saves its 4.6 MB decode). Cold "
                                                              "coast: near breakers on the swell, waves along the coast, "
                                                              "far surf, rumble, ice floes knocking - keep it on the "
                                                              "snowy side of the beach transition. Deferred with the "
                                                              "other amb_ loops. " + _SWELL_NOTE}),
    "amb_beach":          ("ambience", True, -31.5, {"notes": "Sunny Beach bed: low spilling surf on the same 6 s grid "
                                                              "(seek it like amb_sea_waves), far children's babble, two "
                                                              "far gulls, warm breeze, faint crowd. setAmbience('amb_beach',"
                                                              " 0..1) by distance to the sand, crossfaded against "
                                                              "amb_harbor (amb_sea_waves has ice knocks: fade it out "
                                                              "before the sand). Add the life as one-shots: "
                                                              "sfx_wave_wash on crests, sfx_beach_kids, audio4 "
                                                              "sfx_seagull now and then. Lazy with bgm_beach; keep it "
                                                              "out of the generic ^amb_ rule, e.g. "
                                                              "/^(bgm_village|amb_(?!beach)|sfx_lute)/."}),
    "sfx_wave_crash_1":   ("sfx", False, -16.5, {"cues": {"impact": 0.2}, "notes": "medium slap + white spray. " + _CRASH_NOTE}),
    "sfx_wave_crash_2":   ("sfx", False, -16.5, {"cues": {"impact": 0.2}, "notes": "big boom, long spray (see _1)."}),
    "sfx_wave_crash_3":   ("sfx", False, -16.5, {"cues": {"impact": 0.2, "impact2": 0.54},
                                                "notes": "double slap (see _1)."}),
    "sfx_wave_wash":      ("sfx", False, -19.0, {"cues": sfx5.wash_cues(1), "notes": _WASH_NOTE}),
    "sfx_wave_wash_2":    ("sfx", False, -19.0, {"cues": sfx5.wash_cues(2), "notes": "small quick lap (see sfx_wave_wash)."}),
    "sfx_wave_wash_3":    ("sfx", False, -19.0, {"cues": sfx5.wash_cues(3), "notes": "big wash (see sfx_wave_wash)."}),
    "sfx_splash_1":       ("sfx", False, -17.5, {"cues": {"slap": 0.0, "slap2": 0.13},
                                                "notes": "Hand splash, group sfx_splash_beach (1, 1b, 1c): beachfolk "
                                                         "splash_play impact frame, kids in the shallows. (Never name a "
                                                         "group 'sfx_splash': that is the v1 fish-splash key.)"}),
    "sfx_splash_1b":      ("sfx", False, -17.5, {"cues": {"slap": 0.0}, "notes": "flat slap (see sfx_splash_1)."}),
    "sfx_splash_1c":      ("sfx", False, -17.5, {"cues": {"slap": 0.0}, "notes": "three paddles (see sfx_splash_1)."}),
    "sfx_splash_2":       ("sfx", False, -17.0, {"cues": {"slap": 0.0}, "notes": "jumping in feet-first: a swimmer "
                                                "entering the water. Play by key (not in the hand-splash group)."}),
    "sfx_splash_3":       ("sfx", False, -16.5, {"cues": {"slap": 0.0}, "notes": "cannonball / big jump, banana boat "
                                                "tipping over. Play by key."}),
    "sfx_pool_splash":    ("sfx", False, -17.0, {"cues": {"slap": 0.0, "laps": 0.62},
                                                "notes": "Guest diving into the hotel pool (tiled walls, gutter laps)."}),
    "sfx_lifeguard_whistle": ("sfx", False, -18.0, {"cues": {"tweet": 0.0, "tweeet": 0.27},
                                                   "notes": "Pea whistle 'tweet - tweeeet' (F7): lifeguard calls a "
                                                            "swimmer back from the buoy line. At most once per 8 s."}),
    "sfx_icecream_bell":  ("sfx", False, -17.5, {"cues": {"chime": 0.0, "last": 0.62, "jingle": 0.95},
                                                "notes": "Ice-cream cart chime (the village hook, landing on F): when "
                                                         "customers arrive / every 20-40 s while open."}),
    "sfx_beachball_bounce": ("sfx", False, -17.5, {"cues": {"bounce1": 0.0, "bounce2": 0.3, "bounce3": 0.48},
                                                  "notes": "Beach ball 'boing' (F5 + vinyl 'pock', carries on phones) "
                                                           "and two re-bounces: ball landing; ball_catch at volume "
                                                           "0.6, rate 1.15."}),
    "sfx_hotel_bell":     ("sfx", False, -17.5, {"cues": {"ding": 0.004},
                                                "notes": "Reception bell 'ding' (C7): check-in at resort_hotel / pension."}),
    "sfx_sand_step_1":    ("sfx", False, -17.5, {"notes": _DRY_NOTE}),
    "sfx_sand_step_2":    ("sfx", False, -17.5, {"notes": "dry sand (see _1)."}),
    "sfx_sand_step_3":    ("sfx", False, -17.5, {"notes": "dry sand, quick toe scuff (see _1)."}),
    "sfx_sand_step_4":    ("sfx", False, -17.5, {"notes": _WET_NOTE}),
    "sfx_sand_step_5":    ("sfx", False, -17.5, {"notes": "damp sand 'thup-p' (see _4)."}),
    "sfx_beach_kids_1":   ("sfx", False, -19.0, {"notes": _KIDS_NOTE}),
    "sfx_beach_kids_2":   ("sfx", False, -19.0, {"notes": "squeal (see _1)."}),
    "sfx_beach_kids_3":   ("sfx", False, -19.0, {"notes": "'o-maa~!' (see _1)."}),
    "sfx_beach_kids_4":   ("sfx", False, -19.0, {"notes": "'wheee~' (see _1)."}),
}
GROUPS = {
    "sfx_wave_crash": ["sfx_wave_crash_1", "sfx_wave_crash_2", "sfx_wave_crash_3"],
    "sfx_wave_wash": ["sfx_wave_wash", "sfx_wave_wash_2", "sfx_wave_wash_3"],
    "sfx_splash_beach": ["sfx_splash_1", "sfx_splash_1b", "sfx_splash_1c"],
    "sfx_sand_step": ["sfx_sand_step_1", "sfx_sand_step_2", "sfx_sand_step_3"],
    "sfx_sand_step_wet": ["sfx_sand_step_4", "sfx_sand_step_5"],
    "sfx_beach_kids": ["sfx_beach_kids_1", "sfx_beach_kids_2", "sfx_beach_kids_3", "sfx_beach_kids_4"],
}
LOOPS = {"bgm_beach": ("music5", "render_beach"), "amb_sea_waves": ("sfx5", "render_sea_waves"),
         "amb_beach": ("sfx5", "render_beach_amb")}
# extra loop-render meta copied into the manifest (besides loopSamples / bpm)
META_KEYS = ("rotation", "swellPeriod", "swellWaves", "swellPhase", "cues")
# Same codec settings as assets/audio .. audio4 (build_audio.MP3_KBPS / CHANNELS / OGG_Q).
MP3_KBPS = dict(BA.MP3_KBPS)
TRUE_PEAK_MAX = -1.0          # dBTP (ffmpeg ebur128 4x oversampled) of every delivered file, on top of PEAK_MAX


def _encode_one5(key: str):
    """build_audio._encode_one with a TRUE-peak ceiling: the codec trim loop also keeps the oversampled peak of
    the .ogg and the .mp3 at or below -1 dBTP (the sample-peak rule alone let three files reach -0.7 dBTP).
    The manifest volume is computed from the measured loudness after the trim, so in-game levels do not move."""
    kind = SOUNDS[key][0]
    src = os.path.join(CACHE, f"{key}.wav")
    if not os.path.exists(src):
        raise FileNotFoundError(f"{src} missing - run without --skip-render")
    ch = BA.CHANNELS[kind]
    ogg, mp3 = os.path.join(OUT, f"{key}.ogg"), os.path.join(OUT, f"{key}.mp3")
    gain = 0.0
    for _ in range(5):
        F.encode_ogg(src, ogg, ch, BA.OGG_Q, gain)
        F.encode_mp3(src, mp3, ch, MP3_KBPS[kind], gain)
        m_ogg, m_mp3 = F.ebur128(ogg, ch), F.ebur128(mp3, ch)
        over = max(max(m_ogg["peak"], m_mp3["peak"]) - BA.PEAK_MAX, max(m_ogg["tpk"], m_mp3["tpk"]) - TRUE_PEAK_MAX)
        if over <= 0:
            break
        gain -= over + 0.15
    return key, {"ogg": m_ogg, "mp3": m_mp3, "trim_db": round(gain, 2), "channels": ch,
                 "duration": BA.wav_seconds(src)}


def bind():
    """Point build_audio's module tables at the audio5 set (this process / worker only)."""
    BA.SOUNDS = SOUNDS
    BA.LOOPS = LOOPS
    BA.GROUPS = GROUPS
    BA.CACHE = CACHE
    BA.OUT = OUT
    BA.MP3_KBPS = MP3_KBPS
    BA._encode_one = _encode_one5                 # encode_all looks it up in build_audio's globals at call time


bind()


# ----------------------------------------------------------------------------- render
def _render_job(key: str) -> str:
    """Worker: render one key to _cache/audio5/<key>.wav (+ .json meta). Loops go through fit_loop."""
    bind()
    sys.path.insert(0, HERE)
    import synth as S
    t0 = time.time()
    os.makedirs(CACHE, exist_ok=True)
    meta = {}
    if key in LOOPS:
        x, meta = BA.fit_loop(key)
    else:
        import sfx5
        x = sfx5.render(key)
    S.write_wav(os.path.join(CACHE, f"{key}.wav"), x)
    with open(os.path.join(CACHE, f"{key}.json"), "w") as f:
        json.dump(meta, f)
    extra = (f"  loop {meta['loopSamples']} smp ({meta.get('fitMethod')}, nominal {meta.get('nominalSamples')})"
             if key in LOOPS else "")
    return f"  rendered {key:22s} {x.shape[-1] / S.SR:6.2f}s  ({time.time() - t0:5.1f}s){extra}"


def render(keys, workers: int):
    heavy = [k for k in keys if k in LOOPS]
    light = [k for k in keys if k not in LOOPS]
    rank = {"bgm_beach": 0, "amb_sea_waves": 1, "amb_beach": 2}
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
           "generator": "tools/audio/build_audio5.py (procedural synthesis: sfx5.py, music5.py; "
                        "same toolkit + loudness conventions as assets/audio .. audio4)",
           "audio": audio, "audioGroups": GROUPS}
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        f.write(manifest_text(man) + "\n")
    return man


def manifest_text(man) -> str:
    """json.dumps(indent=1) with every list of plain numbers / strings on one line (files, cues, groups): the
    same JSON, ~1.5 kB smaller and easier to read."""
    txt = json.dumps(man, indent=1, ensure_ascii=False)
    scalar = r'(?:-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?|"(?:[^"\\\n]|\\.)*")'
    pat = re.compile(r"\[\n((?:[ ]*" + scalar + r",?\n)+)[ ]*\]")
    return pat.sub(lambda m: "[" + ", ".join(ln.strip().rstrip(",") for ln in m.group(1).strip().split("\n")) + "]",
                   txt)


# ----------------------------------------------------------------------------- listening page
def write_preview_html(man):
    rows = {"music": [], "ambience": [], "sfx": []}
    for key, a in man["audio"].items():
        rows[a["kind"]].append((key, a))
    parts = []
    titles = (("music", "해변 음악 Beach music (loop)"),
              ("ambience", "바다 · 해변 환경음 Sea + beach ambience (loop)"),
              ("sfx", "해변 효과음 Beach sound effects"))
    for kind, title in titles:
        parts.append(f"<h2>{title}</h2><div class='grid'>")
        for key, a in rows[kind]:
            parts.append(
                f"<div class='card'><button data-key='{key}' data-vol='{a['volume']}' data-loop='{int(a['loop'])}'>"
                f"&#9654;</button><div><b>{key}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                f"{' &middot; loop' if a['loop'] else ''}</small></div></div>")
        parts.append("</div>")
    ref = [("amb_sea", "audio", "v1 sea (old) - compare with amb_sea_waves"), ("bgm_village", "audio", "v1 village music"),
           ("sfx_splash", "audio", "v1 fish splash"), ("sfx_step_snow_1", "audio", "v1 snow step"),
           ("amb_harbor", "audio4", "v6 harbour"), ("sfx_seagull_2", "audio4", "v6 gull")]
    parts.append("<h2>비교용 기존 소리 Reference (assets/audio, audio4)</h2><div class='grid'>")
    for key, frag, label in ref:
        parts.append(f"<div class='card'><button data-key='{key}' data-frag='{frag}' data-vol='' "
                     f"data-loop='{int(key.startswith(('bgm', 'amb')))}'>&#9654;</button><div><b>{key}</b>"
                     f"<small>{label}</small></div></div>")
    parts.append("</div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost Village Beach Sounds</title>
<style>
:root{--bg:#F4F7FB;--card:#FFF8EC;--ink:#2B2F3A;--accent:#2E9FB8;--muted:#6b7280}
@media (prefers-color-scheme:dark){:root{--bg:#1b2130;--card:#262e40;--ink:#eef2f8;--accent:#4fc0d8;--muted:#9aa3b2}}
body{margin:0;padding:16px;font:15px/1.4 system-ui,sans-serif;background:var(--bg);color:var(--ink)}
h1{font-size:22px;margin:4px 0 2px} h2{font-size:17px;margin:22px 0 8px} p{color:var(--muted);margin:4px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr));gap:8px}
code{overflow-wrap:anywhere}
.card{display:flex;gap:10px;align-items:center;background:var(--card);border-radius:12px;padding:8px 10px}
.card b{display:block;font-size:14px;overflow-wrap:anywhere} .card small{color:var(--muted)}
button{width:40px;height:40px;border-radius:50%;border:0;background:var(--accent);color:#fff;font-size:16px;cursor:pointer;flex:none}
button.on{background:#5CC86A} .bar{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.bar button{width:auto;border-radius:10px;padding:0 14px;font-size:14px}
#beat{display:inline-block;min-width:150px;padding:6px 12px;border-radius:10px;background:var(--card);color:var(--muted);font-size:13px}
#beat.hit{animation:hit .7s ease-out} @keyframes hit{0%{background:var(--accent);color:#fff}100%{background:var(--card);color:var(--muted)}}
</style></head><body>
<h1>서리마을 개척기 &mdash; 살아 있는 바다 &amp; 햇살 해변 소리 미리듣기 (v7)</h1>
<p>버튼을 누르면 게임과 같은 기본 볼륨으로 재생됩니다 (반복음은 한 번 더 누르면 정지). 맨 아래 예전 바다 소리(amb_sea)와 새 파도 소리(amb_sea_waves)를 비교해 보세요.
Each sound plays at its in-game base volume through Web Audio (loops are sample-accurate).
Open through the game's local web server (e.g. <code>http://localhost:8000/docs/previews/audio5_preview.html</code>).</p>
<div class="bar"><button id="village">&#9654; 서리마을 바닷가 Village sea</button><button id="beach">&#9654; 햇살 해변 Beach day</button>
<button id="pool">&#9654; 호텔 수영장 Hotel pool</button><button id="sunset">&#9654; 노을 Sunset</button><button id="ab">&#9654; 예전/새 바다 Old vs new sea</button><button id="stop">&#9632; Stop all</button></div>
<p><span id="beat">파도 박자 swell beat</span> &nbsp;파도는 게임 화면의 물결처럼 6초마다 밀려옵니다 (crest = 흰 파도가 모래에 닿는 순간). The beds have one near wave per 6 s swell crest, like Water.js; washes and rock crashes are started so they land on the crests.</p>
""" + "\n".join(parts) + """
<script>
const BASES={audio5:'../../assets/audio5/',audio:'../../assets/audio/',audio2:'../../assets/audio2/',audio3:'../../assets/audio3/',audio4:'../../assets/audio4/'};
let ctx=null; const bufs={}; const playing={}; const mans={};
const ogg=(()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')!==''}catch(e){return false}})();
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function man(frag){if(!mans[frag])mans[frag]=await (await fetch(BASES[frag]+'manifest.json')).json();return mans[frag]}
async function volOf(k,frag){if(frag==='audio5')return +document.querySelector(`[data-key="${k}"]`).dataset.vol;
 return (await man(frag)).audio[k].volume}
async function pick(k,frag){const m=await man(frag);const g=(m.audioGroups||{})[k];return g?g[Math.floor(Math.random()*g.length)]:k}
async function load(k,frag){const id=frag+':'+k;if(bufs[id])return bufs[id];const r=await fetch(BASES[frag]+k+(ogg?'.ogg':'.mp3'));
 const ab=await r.arrayBuffer();bufs[id]=await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no));return bufs[id]}
async function play(k,mult,loop,btn,frag,rate){frag=frag||'audio5';const c=ac();k=await pick(k,frag);const b=await load(k,frag);const v=await volOf(k,frag);
 const s=c.createBufferSource();const g=c.createGain();s.buffer=b;s.loop=!!loop;if(rate)s.playbackRate.value=rate;g.gain.value=v*(mult===undefined?1:mult);
 s.connect(g).connect(c.destination);s.start();
 if(loop){playing[frag+k]={s,btn,g};if(btn)btn.classList.add('on')}
 s.onended=()=>{if(btn)btn.classList.remove('on');if(playing[frag+k]&&playing[frag+k].s===s)delete playing[frag+k]};return s}
function stop(id){const p=playing[id];if(p){try{p.s.stop()}catch(e){}if(p.btn)p.btn.classList.remove('on');delete playing[id]}}
function stopAll(){Object.keys(playing).forEach(stop);(window._mixT||[]).forEach(clearTimeout);window._mixT=[]}
function alertMsg(e){const p=document.createElement('p');p.textContent='Could not load audio ('+e+'). Open via http://, not file://';document.body.prepend(p)}
document.querySelectorAll('.card button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;const fr=b.dataset.frag||'audio5';
 if(playing[fr+k]){stop(fr+k);return} try{await play(k,1,b.dataset.loop==='1',b,fr)}catch(e){alertMsg(e)}});
document.getElementById('stop').onclick=stopAll;
const seq=(list)=>list.forEach(([ms,k,m,fr,rate])=>{window._mixT=window._mixT||[];window._mixT.push(setTimeout(()=>play(k,m,false,null,fr,rate).catch(alertMsg),ms))});
const later=(ms,fn)=>{window._mixT=window._mixT||[];window._mixT.push(setTimeout(fn,ms))};
const steps=(t0,n,dt,key,fr,vol)=>{const l=[];for(let i=0;i<n;i++)l.push([t0+i*dt,key,vol,fr,0.92+0.16*Math.random()]);return l};
const WASH=['sfx_wave_wash','sfx_wave_wash_2','sfx_wave_wash_3'];
function beat(txt){const b=document.getElementById('beat');b.textContent=txt;b.classList.remove('hit');void b.offsetWidth;b.classList.add('hit')}
/* the beds hold one near wave per 6 s swell crest (manifest cues.waterline): wash / crash sounds are started so
   their white water / slap lands on those crests, exactly as the game does it with Water.js */
async function crests(bed,loops,fn){const m=await man('audio5');const a=m.audio[bed];let i=0;
 for(let k=0;k<loops;k++)for(const w of a.cues.waterline)fn(1000*(w+k*a.duration),i++,m)}
async function washes(bed,loops,mult){await crests(bed,loops,(at,i,m)=>{const k=WASH[i%3];const st=at-1000*m.audio[k].cues.waterline;
 if(st>=0){seq([[st,k,mult*(0.75+0.25*Math.random())]]);later(at,()=>beat('파도 crest '+(i+1)))}})}
async function rocks(bed,loops,mult){await crests(bed,loops,(at,i,m)=>{if(i%2)return;const hit=at+2200;   // a rock further along the coast
 seq([[hit-1000*m.audio.sfx_wave_crash_1.cues.impact,'sfx_wave_crash',mult*(i%4?0.7:1)]]);later(hit,()=>beat('철썩! rock'))})}
document.getElementById('village').onclick=async()=>{stopAll();try{await play('amb_sea_waves',0.75,true,null);await play('amb_wind',0.5,true,null,'audio');await play('bgm_village',0.8,true,null,'audio')}catch(e){alertMsg(e)}
 rocks('amb_sea_waves',2,0.6);seq([...steps(6000,8,330,'sfx_step_snow','audio',0.32),[15000,'sfx_boat_horn',0.4,'audio2']])};
document.getElementById('beach').onclick=async()=>{stopAll();try{await play('amb_beach',1,true,null);await play('bgm_beach',0.8,true,null)}catch(e){alertMsg(e)}
 washes('amb_beach',3,0.6);
 seq([...steps(400,8,330,'sfx_sand_step','audio5',0.32),...steps(3200,5,330,'sfx_sand_step_wet','audio5',0.32),[4800,'sfx_splash_beach',0.7],[5600,'sfx_beach_kids',0.6],[7000,'sfx_beachball_bounce',0.8],[8800,'sfx_splash_2',0.6],
 [10600,'sfx_lifeguard_whistle',0.8],[12000,'sfx_beach_kids',0.5],[13000,'sfx_icecream_bell',0.9],[14600,'sfx_chatter_1',0.6,'audio2'],[15400,'sfx_coin',0.6,'audio'],[16400,'sfx_splash_beach',0.6],
 [18200,'sfx_beach_kids',0.7],[19000,'sfx_seagull_2',0.5,'audio4',1.05],[21500,'sfx_splash_beach',0.5],[24500,'sfx_beach_kids',0.45]])};
document.getElementById('pool').onclick=async()=>{stopAll();try{await play('amb_beach',0.5,true,null);await play('bgm_beach',0.6,true,null)}catch(e){alertMsg(e)}
 seq([[500,'sfx_door',0.6,'audio3'],[1300,'sfx_hotel_bell',1],[2600,'sfx_chatter_4',0.6,'audio2'],[4200,'sfx_pool_splash',1],[7000,'sfx_splash_3',0.8],[8600,'sfx_cheer',0.5,'audio2'],[10000,'sfx_pool_splash',0.7]])};
document.getElementById('sunset').onclick=async()=>{stopAll();try{await play('amb_beach',0.35,true,null);await play('amb_sea_waves',0.6,true,null);await play('bgm_beach',0.45,true,null)}catch(e){alertMsg(e)}
 washes('amb_beach',2,0.45);seq([[2500,'sfx_seagull_1',0.5,'audio4',0.95],[9500,'sfx_beach_kids_3',0.35]])};
document.getElementById('ab').onclick=async()=>{stopAll();try{await play('amb_sea',1,true,null,'audio')}catch(e){alertMsg(e)}
 window._mixT=window._mixT||[];window._mixT.push(setTimeout(async()=>{stop('audioamb_sea');try{await play('amb_sea_waves',1,true,null)}catch(e){alertMsg(e)}},12000))};
</script></body></html>
"""
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "audio5_preview.html"), "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated keys to (re)build")
    ap.add_argument("--skip-render", action="store_true", help="reuse tools/audio/_cache/audio5/*.wav")
    ap.add_argument("--no-check", action="store_true", help="do not run check_audio5.py afterwards")
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
    print(f"  {'key':22s} {'dur':>6s} {'I':>6s} {'Mmax':>6s} {'peak':>6s} {'trim':>5s} {'vol':>6s}")
    for key in SOUNDS:
        m = meas[key]
        o = m["ogg"]
        print(f"  {key:22s} {m['duration']:6.2f} {o['I']:6.1f} {o['M']:6.1f} {max(o['peak'], m['mp3']['peak']):6.1f}"
              f" {m['trim_db']:5.1f} {man['audio'][key]['volume']:6.3f}")
    print(f"  done in {time.time() - t0:.0f}s -> {os.path.relpath(OUT, ROOT)}/manifest.json", flush=True)
    if not a.no_check:
        print("[4/4] check_audio5.py ...", flush=True)
        import check_audio5
        sys.exit(check_audio5.main([]))


if __name__ == "__main__":
    main()
