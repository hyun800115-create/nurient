"""Frost Village - build the v8 'living city' sounds (CONTRACT_V8 section AE) into assets/audio6/.

render (sfx6.py, music6.py) -> loop fitting -> encode (.ogg + .mp3) -> measure -> manifest -> QA.
Reuses build_audio.py's machinery by importing it (that file is not modified): fit_loop() (the fixed version:
Vorbis block-boundary loop fitting with the grid-of-64 fallback and the channel count the key ships with),
_encode_one() (Vorbis q4 + LAME, codec-peak trim), volume_for() (loudness -> manifest volume, same HEADROOM_DB /
target conventions as assets/audio .. audio4), encode_all(), load_measurements() and the same CHANNELS /
MP3_KBPS / OGG_Q / PEAK_MAX tables. Its module-level tables are re-pointed at the audio6 key set, cache and
output folder *inside this process only* (bind()), so nothing in assets/audio .. audio5 is touched.
fit_loop_seam() is a copy of build_audio3's (that module re-binds build_audio on import, so it is not
imported): for the short positional loops it tries render variants and keeps the smoothest decoded wrap in
both codecs.

Run from anywhere (deterministic, safe to re-run; ~4 min on 2 busy cores):
    python3 tools/audio/build_audio6.py                          # everything + check_audio6
    python3 tools/audio/build_audio6.py --only sfx_stamp,amb_bank
    python3 tools/audio/build_audio6.py --skip-render            # re-encode from the cache wavs
    python3 tools/audio/build_audio6.py --no-check               # skip check_audio6.py at the end
    python3 tools/audio/build_audio6.py --workers 2
Cache: /tmp/fv_cache/audio6 (override with FV_AUDIO6_CACHE).
Outputs
    assets/audio6/<key>.ogg + .mp3      44.1 kHz; music stereo, ambience-type loops + sfx mono
    assets/audio6/manifest.json         CONTRACT section 2 fragment: audio{} + audioGroups{}
    docs/previews/audio6_preview.html   listening page with scene buttons (open through the game's web server)
    (check_audio6.py) docs/previews/audio6_report.txt, audio6_waveforms.png, audio6_demo.mp3
Mix conventions = assets/audio .. audio4: files mastered hot (sfx peak -1.5 dBFS, music -18 LUFS, loops
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
CACHE = os.environ.get("FV_AUDIO6_CACHE", "/tmp/fv_cache/audio6")
OUT = os.path.join(ROOT, "assets", "audio6")
PREV = os.path.join(ROOT, "docs", "previews")
REL = "audio6"                                                    # manifest paths are relative to assets/

# ----------------------------------------------------------------------------- the sound list
# key: (kind, loop, target loudness at game call volume 1 (before HEADROOM_DB), extra manifest fields)
#   music / ambience: integrated LUFS ; sfx: max momentary LUFS (400 ms) - same as build_audio.SOUNDS.
#   extra "cues" = seconds from the start of the file to a sync point.
#   References: bgm_village / bgm_harbor -24.5, amb_fire -31.0, amb_town / amb_harbor -31.5, amb_wind -32.5,
#   sfx_truck_engine (positional loop) -27, sfx_lute -25, sfx_bus_horn -16.5, sfx_register -17, sfx_cheer -16,
#   sfx_chatter -19, sfx_crane -18, sfx_door -18.5.
POS = ("positional mono loop (kind ambience, like audio3 sfx_truck_engine): Audio.setAmbience('{k}', 0..1) by "
       "distance to the nearest {what}, or sm.add('{k}', {{loop: true}}) per {what}; ")
SOUNDS = {
    "bgm_city":              ("music", True, -24.5, {"bars": 32, "tonality": "F major", "meter": "4/4",
                                                    "notes": "busy upbeat living-city theme (126 bpm shuffle, 61 s), A A B A "
                                                             "like bgm_village and in its family (the village hook verbatim in "
                                                             "bars 1 and 5 of A, same palette) but its own tune and chords: A "
                                                             "F Dm7 Gm7 C7 F D7 Gm7-C7 F with 16th 'traffic' answers, B a new "
                                                             "flute tune on Gm7 C7 Fmaj7 Dm7 Bb C Am7-D7 Gm7-C7 (the village B "
                                                             "only as a 2-bar trumpet quote). Daytime in the city districts "
                                                             "(logistics, bank, police). ~21 MB as decoded PCM: load lazily, "
                                                             "Audio.playMusic('bgm_city') crossfades; after bgm_chase resume it "
                                                             "from its saved position, not bar 1."}),
    "bgm_chase":             ("music", True, -24.5, {"bars": 16, "tonality": "F major / D minor", "meter": "4/4",
                                                    "notes": "comic chase gallop (168 bpm, 23 s): play while police chase a thief "
                                                             "(or a fire engine races), then playMusic back to the previous "
                                                             "theme on arrest. Sneaky tiptoe bars 9-12."}),
    "amb_fire_big":          ("ambience", True, -30.0, {"notes": "building fire: warm roar + crackle + snaps + 'fwoosh' licks "
                                                                "(cosy cartoon, no scary highs). setAmbience('amb_fire_big', 0..1) "
                                                                "by distance x fire size; fade out with the steam hiss."}),
    "amb_construction":      ("ambience", True, -31.5, {"notes": "building site across the street (hammering, saw, drill, clanks, "
                                                                "far reverse beeps, gravel; no voices). setAmbience by distance "
                                                                "to any construction / rebuild site; for life add audio2 "
                                                                "sfx_chatter_lo / sfx_hammer at random 6-20 s intervals."}),
    "amb_bank":              ("ambience", True, -32.5, {"notes": "inside the bank, texture only: hushed marble-hall murmur, soft "
                                                                "footsteps, a faint note counter, paper, HVAC. setAmbience 0..1 "
                                                                "while the bank's inside is revealed / the camera is near it. The "
                                                                "events are one-shots the game fires: sfx_ticket_chime when a "
                                                                "teller calls the next customer, sfx_stamp / sfx_coin_count on "
                                                                "loans and deposits, audio2 sfx_chatter_lo for talk."}),
    "amb_warehouse":         ("ambience", True, -32.0, {"notes": "inside the logistics centre: conveyor hum + roller rattle, boxes "
                                                                "bumping, far forklift reverse beeps, tape gun, pallet jack, big "
                                                                "hall (no voices). setAmbience 0..1 while revealed / near; add "
                                                                "audio2 sfx_chatter_lo near workers."}),
    "sfx_siren_fire":        ("ambience", True, -23.0, {"notes": POS.format(k="sfx_siren_fire", what="fire engine")
                                                       + "retro two-tone 'nee-naw' (D5 / A4, 0.5 s each, round, not "
                                                         "piercing). Start on dispatch, fade out ~1 s after arrival. "
                                                         "Use rate 1.0; a Doppler-ish rate 1.03 -> 0.97 as it passes is cute."}),
    "sfx_siren_police":      ("ambience", True, -23.5, {"notes": POS.format(k="sfx_siren_police", what="police car")
                                                       + "toy 'wee-oo' glide (C5 - F5, 0.6 s cycle). During a chase; stop on "
                                                         "arrest."}),
    "sfx_hose_spray":        ("ambience", True, -26.0, {"notes": POS.format(k="sfx_hose_spray", what="spraying firefighter")
                                                       + "loop while anim spray_hose plays (fx_hose_stream). One instance is "
                                                         "enough for several hoses (raise its volume a little). Optional: "
                                                         "duck it to 0.75 while amb_fire_big is above 0.5."}),
    "sfx_excavator":         ("ambience", True, -27.0, {"notes": POS.format(k="sfx_excavator", what="excavator")
                                                       + "rate 0.85 idle / moving, 1.0 working, 1.12 while anims.dig plays "
                                                         "(needs Audio.setAmbienceRate(key, r) -> this.amb[key].setRate(r); "
                                                         "without it play at rate 1); add sfx_demolish_crunch on each dig "
                                                         "frame."}),
    "sfx_comic_fight":       ("ambience", True, -23.0, {"notes": POS.format(k="sfx_comic_fight", what="fx_fight_cloud")
                                                       + "cartoon scuffle (bonk, pow, biff, swish, boing, tiny 'hai!'). "
                                                         "Loop while the dust cloud is up (2-4 s), stop with a "
                                                         "sfx_police_whistle or a laugh. Start each fight at a random "
                                                         "position (seek) and rate 0.95-1.05 so the 2.4 s cycle never lines "
                                                         "up twice."}),
    "sfx_fire_flare":        ("sfx", False, -16.5, {"cues": {"flare": 0.0},
                                                   "notes": "flames burst from a window (fx_fire_window / fire start / "
                                                            "flare-up when the hose stops)."}),
    "sfx_steam_hiss":        ("sfx", False, -18.0, {"cues": {"hiss": 0.0, "pop": 1.95},
                                                   "notes": "the fire goes out under the hose (fx_steam_puff); fade "
                                                            "amb_fire_big out over the hiss."}),
    "sfx_collapse_soft":     ("sfx", False, -17.0, {"cues": {"crack": 0.42, "donk1": 0.6, "donk2": 0.84, "donk3": 1.06,
                                                            "flumph": 1.22, "plink": 2.05},
                                                   "notes": "a burnt shell settles into a ruin (swap the sprite to ruin_* on "
                                                            "'flumph'); cute, no violence."}),
    "sfx_demolish_crunch":   ("sfx", False, -17.0, {"cues": {"bite": 0.0, "pour": 0.18},
                                                   "notes": "excavator bucket bites the ruin: play on the bucket's contact "
                                                            "frame of anims.dig (fx_demolish_dust)."}),
    "sfx_coin_count":        ("sfx", False, -18.0, {"cues": {"first": 0.0, "ching": 0.72},
                                                   "notes": "teller counts coins: deposits / withdrawals / interest paid."}),
    "sfx_stamp":             ("sfx", False, -17.5, {"cues": {"thunk": 0.0},
                                                   "notes": "rubber stamp on a ledger: settlement at the logistics counter, "
                                                            "loan approved, passbook entry (ui_icon_settle)."}),
    "sfx_vault_door":        ("sfx", False, -17.0, {"cues": {"spin": 0.0, "bolt1": 0.25, "bolt2": 0.31, "bolt3": 0.375,
                                                            "swing": 0.4, "open": 0.875, "sparkle": 0.94},
                                                   "notes": "the bank vault opens: play on frame 0 of anims.vault (8 f at 8 fps "
                                                            "as civ_assets.py renders it): the wheel spins on frames 1-2, the "
                                                            "bolts clunk as frame 3 starts the swing, the door lands with a "
                                                            "'dunn' on frame 7 (0.875 s), a sparkle follows. If the anim is "
                                                            "played at another fps, scale the playback rate by fps / 8 "
                                                            "(0.75-1.25 sounds fine)."}),
    "sfx_forklift_beep":     ("sfx", False, -20.0, {"cues": {"beep1": 0.0, "beep2": 0.42, "beep3": 0.84},
                                                   "notes": "forklift reversing (three C6 beeps 0.42 s apart). Retrigger every "
                                                            "1.26 s (3 x 0.42, so the beeps stay evenly spaced) while a "
                                                            "forklift drives backwards; volume by distance."}),
    "sfx_police_whistle":    ("sfx", False, -19.0, {"cues": {"blast1": 0.0, "blast2": 0.3},
                                                   "notes": "officer spots a thief / stops a scuffle ('pweet! pweeeeet!'). For "
                                                            "repeat incidents nearby play only the first blast (stop at the "
                                                            "'blast2' cue)."}),
    "sfx_crowd_gasp":        ("sfx", False, -18.0, {"notes": "onlookers 'h-oooh!' (fire breaks out, thief runs, roof "
                                                            "collapses). Surprised, not scared."}),
    "sfx_crowd_cheer_small": ("sfx", False, -17.0, {"notes": "fire out / thief caught / new building opens: 'hoo-ray!', "
                                                            "finger whistle, applause (differs from audio2 sfx_cheer)."}),
    "sfx_cuffs_click":       ("sfx", False, -18.5, {"cues": {"ratchet": 0.0, "latch": 0.19},
                                                   "notes": "arrest: toy cuffs (start anim arrested_walk on 'latch')."}),
    "sfx_fire_alarm_bell":   ("sfx", False, -18.0, {"cues": {"ring1": 0.0, "ring2": 1.15},
                                                   "notes": "fire reported (fire_alarm_post / fire station bell), before "
                                                            "the siren starts. Friendly, not shrill."}),
    "sfx_moving_truck":      ("sfx", False, -18.0, {"cues": {"brake": 0.5, "door": 0.9, "doorTop": 1.6, "ramp": 1.8,
                                                            "rampDown": 2.2},
                                                   "notes": "moving truck arrives and opens (anims.unload: ramp + door); "
                                                            "drive in with audio3 sfx_truck_engine."}),
    "sfx_box_drop":          ("sfx", False, -18.5, {"notes": "cardboard box / crate set down (movers, warehouse pickers, "
                                                            "deliveries). Call Audio.play('sfx_box', {rate: 0.92-1.1}) - the "
                                                            "group picks one of the 3 boxes; 'sfx_box_drop' alone is always "
                                                            "box 1. Throttle ~120 ms."}),
    "sfx_box_drop_2":        ("sfx", False, -18.5, {"notes": "variant: small box with tins / toys clinking inside (group "
                                                            "sfx_box)."}),
    "sfx_box_drop_3":        ("sfx", False, -18.5, {"notes": "variant: big heavy box, deeper thump + short scrape (group "
                                                            "sfx_box)."}),
    "sfx_newspaper":         ("sfx", False, -18.5, {"cues": {"fwap": 0.16},
                                                   "notes": "the morning paper '솔방울 신문' opens (ui_newspaper) / a "
                                                            "resident reads the paper."}),
    "sfx_ticket_chime":      ("sfx", False, -19.0, {"cues": {"ding": 0.0, "dong": 0.34},
                                                   "notes": "extra (not in the contract): the bank's number display calls the "
                                                            "next customer, 'ding-dong' C6 A5. Play when a teller frees up / "
                                                            "the queue advances (it used to be baked into amb_bank and "
                                                            "repeated every 8 s)."}),
}
GROUPS = {
    # Audio.play('sfx_box') picks one of the three (never the same twice in a row); 'sfx_box_drop' stays the
    # contract key. Not called sfx_box_drop so the group cannot hijack the plain key.
    "sfx_box": ["sfx_box_drop", "sfx_box_drop_2", "sfx_box_drop_3"],
}
LOOPS = {"bgm_city": ("music6", "render_city"), "bgm_chase": ("music6", "render_chase"),
         "amb_fire_big": ("sfx6", "render_fire_big"), "amb_construction": ("sfx6", "render_construction"),
         "amb_bank": ("sfx6", "render_bank"), "amb_warehouse": ("sfx6", "render_warehouse"),
         "sfx_siren_fire": ("sfx6", "render_siren_fire"), "sfx_siren_police": ("sfx6", "render_siren_police"),
         "sfx_hose_spray": ("sfx6", "render_hose_spray"), "sfx_excavator": ("sfx6", "render_excavator"),
         "sfx_comic_fight": ("sfx6", "render_comic_fight")}
# extra loop-render meta copied into the manifest (besides loopSamples / bpm)
META_KEYS = ("rotation", "firingHz", "cycles")
# Short positional loops whose Vorbis / LAME coding error alone can step at the wrap: try render variants (seeds),
# keep the smoothest decoded seam in BOTH formats (build_audio3 practice).
SEAM_FIT = {
    "sfx_siren_fire": [{"seed": s} for s in range(10100, 10116)],
    "sfx_siren_police": [{"seed": s} for s in range(10200, 10216)],
    "sfx_hose_spray": [{"seed": s} for s in range(10500, 10516)],
    "sfx_excavator": [{"seed": s} for s in range(10800, 10832)],
    "sfx_comic_fight": [{"seed": s} for s in range(12200, 12216)],
    # music: move the loop point a few ms around the downbeat (the pre-mix is memoised, so variants are cheap);
    # scored also after the 48 kHz resampling phones do (bgm_city's mp3 wrap jumped at 48 kHz with lead 12 ms)
    "bgm_city": [{"lead": v} for v in (0.012, 0.008, 0.016, 0.006, 0.020, 0.010, 0.014, 0.004, 0.024, 0.018)],
}
SEAM48 = {"bgm_city"}            # keys whose seam score includes the emulated 48 kHz decode (seam48 below)
# Same codec settings as assets/audio .. audio4 (build_audio.MP3_KBPS / CHANNELS / OGG_Q).
MP3_KBPS = dict(BA.MP3_KBPS)


def bind():
    """Point build_audio's module tables at the audio6 set (this process / worker only)."""
    BA.SOUNDS = SOUNDS
    BA.LOOPS = LOOPS
    BA.GROUPS = GROUPS
    BA.CACHE = CACHE
    BA.OUT = OUT
    BA.MP3_KBPS = MP3_KBPS


bind()


# ----------------------------------------------------------------------------- render
def seam48(x) -> float:
    """Wrap smoothness after a 44.1 -> 48 kHz decode the way browsers do it on phones (the decoded loop gets a
    fractional length and is truncated; the resampler sees silence beyond both ends): resample 160/147, truncate
    to floor(n * 48000 / 44100), max |2nd difference| straddling the wrap / 99.9th percentile of all of them -
    the same statistic check_audio6 reads from headless Chromium (this emulation tracks it within ~0.1)."""
    import numpy as np
    from scipy import signal
    x = np.atleast_2d(x)
    y = signal.resample_poly(x, 160, 147, axis=1)[:, :int(x.shape[1] * 48000 // 44100)]
    seam = ref = 0.0
    for z in y:
        d2 = np.abs(z - 2 * np.roll(z, 1) + np.roll(z, 2))
        seam, ref = max(seam, float(d2[:3].max())), max(ref, float(np.percentile(d2[2::3], 99.9)))
    return seam / max(ref, 1e-12)


def fit_loop_seam(key: str, variants, good: float = 0.5):
    """build_audio.fit_loop for each render variant (e.g. seeds) of a loop; every fitted loop is encoded exactly
    like the delivery (Vorbis q4 and LAME, CHANNELS[kind]) and decoded, and the variant whose decoded wrap is
    smoothest in BOTH formats (check_audio.loop_metrics: max of d2_ratio and hf_ratio) wins; stops at the first
    one below ``good``. Returns (x, meta) like fit_loop, + seamVariant / seamRatio. (Copy of build_audio3's.)"""
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
                if key in SEAM48:
                    score = max(score, seam48(d))
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
    """Worker: render one key to CACHE/<key>.wav (+ .json meta). Loops go through fit_loop (/ fit_loop_seam)."""
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
        import sfx6
        x, lead = sfx6.render_with_lead(key)
        meta = {"lead": round(lead, 4)}
    S.write_wav(os.path.join(CACHE, f"{key}.wav"), x)
    with open(os.path.join(CACHE, f"{key}.json"), "w") as f:
        json.dump(meta, f)
    extra = (f"  loop {meta['loopSamples']} smp ({meta.get('fitMethod')}, nominal {meta.get('nominalSamples')}"
             f"{', seam ' + str(meta['seamRatio']) + ' ' + str(meta['seamVariant']) if 'seamRatio' in meta else ''})"
             if key in LOOPS else "")
    return f"  rendered {key:22s} {x.shape[-1] / S.SR:6.2f}s  ({time.time() - t0:5.1f}s){extra}"


def render(keys, workers: int):
    heavy = [k for k in keys if k in LOOPS]
    light = [k for k in keys if k not in LOOPS]
    rank = {"bgm_city": 0, "bgm_chase": 1, "amb_bank": 2, "amb_warehouse": 3, "amb_construction": 4}
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
            # 7 decimals: round(duration * 44100) == loopSamples, so Audio.trimLoops (Safari path, want =
            # round(duration * rate)) cuts the loop to the exact sample count
            entry["duration"] = round(meta["loopSamples"] / 44100.0, 7)
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
        if not loop and "cues" in extra and os.path.exists(mp):
            with open(mp) as f:                           # designed cue times -> times in the delivered file
                lead = json.load(f).get("lead", 0.0)
            entry["cues"] = {c: round(max(0.0, t - lead), 3) for c, t in extra["cues"].items()}
        audio[key] = entry
    man = {"version": 1,
           "generator": "tools/audio/build_audio6.py (procedural synthesis: sfx6.py, music6.py; "
                        "same toolkit + loudness conventions as assets/audio .. audio4)",
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
    titles = (("music", "도시 음악 City music (loops)"),
              ("ambience", "환경음 + 반복 효과음 Ambience &amp; positional loops"),
              ("sfx", "효과음 Sound effects"))
    for kind, title in titles:
        parts.append(f"<h2>{title}</h2><div class='grid'>")
        for key, a in rows[kind]:
            parts.append(
                f"<div class='card'><button data-key='{key}' data-vol='{a['volume']}' data-loop='{int(a['loop'])}'>"
                f"&#9654;</button><div><b>{key}</b><small>{a['duration']:.2f}s &middot; vol {a['volume']}"
                f"{' &middot; loop' if a['loop'] else ''}</small></div></div>")
        parts.append("</div>")
    ref = [("bgm_village", "audio", "v1 village music"), ("amb_fire", "audio", "v1 camp fire"),
           ("sfx_cheer", "audio2", "v2 cheer"), ("sfx_register", "audio2", "v2 register"),
           ("sfx_truck_engine", "audio3", "v5 truck engine"), ("amb_town", "audio3", "v5 town"),
           ("sfx_bus_horn", "audio3", "v5 bus horn")]
    parts.append("<h2>비교용 기존 소리 Reference (assets/audio .. audio3)</h2><div class='grid'>")
    for key, frag, label in ref:
        parts.append(f"<div class='card'><button data-key='{key}' data-frag='{frag}' data-vol='' "
                     f"data-loop='{int(key.startswith(('bgm', 'amb')) or key == 'sfx_truck_engine')}'>&#9654;</button>"
                     f"<div><b>{key}</b><small>{label}</small></div></div>")
    parts.append("</div>")
    html = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Frost Village City Sounds</title>
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
.bar button{width:auto;border-radius:10px;padding:0 14px;font-size:14px;min-height:40px}
</style></head><body>
<h1>서리마을 개척기 &mdash; 살아 있는 도시 소리 미리듣기 (v8 living city)</h1>
<p>버튼을 누르면 게임과 같은 기본 볼륨으로 재생됩니다 (반복음은 한 번 더 누르면 정지). 위쪽 장면 버튼은 실제 게임처럼 여러 소리를 함께 들려줍니다.
Each sound plays at its in-game base volume through Web Audio (loops are sample-accurate).
Open through the game's local web server (e.g. <code>http://localhost:8000/docs/previews/audio6_preview.html</code>).</p>
<div class="bar"><button id="city">&#9654; 아침 도시 Morning city</button><button id="bank">&#9654; 은행 Bank</button>
<button id="ware">&#9654; 물류센터 Warehouse</button><button id="fire">&#9654; 불이야! Fire</button>
<button id="chase">&#9654; 도둑 잡기 Thief chase</button><button id="build">&#9654; 철거와 재건 Rebuild</button>
<button id="stop">&#9632; Stop all</button></div>
""" + "\n".join(parts) + """
<script>
const BASES={audio6:'../../assets/audio6/',audio:'../../assets/audio/',audio2:'../../assets/audio2/',audio3:'../../assets/audio3/'};
let ctx=null; const bufs={}; const playing={}; const mans={};
const ogg=(()=>{try{return new Audio().canPlayType('audio/ogg; codecs="vorbis"')!==''}catch(e){return false}})();
function ac(){if(!ctx)ctx=new (window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')ctx.resume();return ctx}
async function man(frag){if(!mans[frag])mans[frag]=await (await fetch(BASES[frag]+'manifest.json')).json();return mans[frag]}
async function resolve(k,frag){const m=await man(frag);const g=m.audioGroups&&m.audioGroups[k];return g?g[Math.floor(Math.random()*g.length)]:k}
async function volOf(k,frag){return (await man(frag)).audio[k].volume}
async function load(k,frag){const id=frag+':'+k;if(bufs[id])return bufs[id];const r=await fetch(BASES[frag]+k+(ogg?'.ogg':'.mp3'));
 const ab=await r.arrayBuffer();bufs[id]=await new Promise((ok,no)=>ac().decodeAudioData(ab,ok,no));return bufs[id]}
async function play(k0,mult,loop,btn,frag,rate){frag=frag||'audio6';const c=ac();const k=await resolve(k0,frag);
 const b=await load(k,frag);const v=await volOf(k,frag);
 const s=c.createBufferSource();const g=c.createGain();s.buffer=b;s.loop=!!loop;if(rate)s.playbackRate.value=rate;g.gain.value=v*(mult===undefined?1:mult);
 s.connect(g).connect(c.destination);s.start();
 if(loop){playing[k]={s,btn,g,v};if(btn)btn.classList.add('on')}
 s.onended=()=>{if(btn)btn.classList.remove('on');if(playing[k]&&playing[k].s===s)delete playing[k]};return s}
function stop(k){const p=playing[k];if(p){try{p.s.stop()}catch(e){}if(p.btn)p.btn.classList.remove('on');delete playing[k]}}
function fadeTo(k,mult,sec){const p=playing[k];if(!p)return;const c=ac();p.g.gain.cancelScheduledValues(c.currentTime);
 p.g.gain.setValueAtTime(p.g.gain.value,c.currentTime);p.g.gain.linearRampToValueAtTime(p.v*mult,c.currentTime+sec)}
function stopAll(){Object.keys(playing).forEach(stop);(window._mixT||[]).forEach(clearTimeout);window._mixT=[]}
function alertMsg(e){const p=document.createElement('p');p.textContent='Could not load audio ('+e+'). Open via http://, not file://';document.body.prepend(p)}
document.querySelectorAll('.card button').forEach(b=>b.onclick=async()=>{const k=b.dataset.key;
 if(playing[k]){stop(k);return} try{await play(k,1,b.dataset.loop==='1',b,b.dataset.frag||'audio6')}catch(e){alertMsg(e)}});
document.getElementById('stop').onclick=stopAll;
const at=(ms,fn)=>{window._mixT=window._mixT||[];window._mixT.push(setTimeout(()=>{try{fn()}catch(e){alertMsg(e)}},ms))};
const seq=(list)=>list.forEach(([ms,k,m,fr,rate])=>at(ms,()=>play(k,m,false,null,fr,rate).catch(alertMsg)));
const loopAt=(ms,k,m,fr)=>at(ms,()=>play(k,m,true,null,fr).catch(alertMsg));
document.getElementById('city').onclick=()=>{stopAll();loopAt(0,'bgm_city',1);loopAt(0,'amb_town',0.6,'audio3');
 seq([[900,'sfx_bus_horn',0.6,'audio3'],[2500,'sfx_chatter',0.6,'audio2'],[3300,'sfx_car_honk',0.5,'audio3'],[4800,'sfx_newspaper',0.9],
 [6200,'sfx_box',0.8],[6600,'sfx_box',0.6,'audio6',1.08],[8200,'sfx_laugh',0.5,'audio2']])};
document.getElementById('bank').onclick=()=>{stopAll();loopAt(0,'amb_bank',1);loopAt(0,'bgm_city',0.35);
 seq([[600,'sfx_door',0.8,'audio3'],[1400,'sfx_ticket_chime',1],[2300,'sfx_chatter_lo',0.5,'audio2'],[3000,'sfx_coin_count',1],[4600,'sfx_stamp',1],
 [5800,'sfx_vault_door',1],[7600,'sfx_ticket_chime',0.9],[8400,'sfx_cash',0.7,'audio'],[9200,'sfx_chatter_lo',0.5,'audio2']])};
document.getElementById('ware').onclick=()=>{stopAll();loopAt(0,'amb_warehouse',1);loopAt(0,'bgm_city',0.35);
 seq([[500,'sfx_forklift_beep',0.8],[1760,'sfx_forklift_beep',0.8],[5200,'sfx_chatter_lo',0.4,'audio2'],[2600,'sfx_box',1],[3100,'sfx_box',0.8,'audio6',0.92],[3500,'sfx_box',0.9],
 [4300,'sfx_moving_truck',1],[7600,'sfx_stamp',1],[8300,'sfx_coins_many',0.6,'audio']])};
document.getElementById('fire').onclick=()=>{stopAll();loopAt(0,'bgm_city',0.5);
 seq([[300,'sfx_fire_alarm_bell',1],[1200,'sfx_crowd_gasp',1],[1800,'sfx_fire_flare',1]]);loopAt(1700,'amb_fire_big',0.9);
 loopAt(2800,'sfx_siren_fire',0.25);at(3000,()=>fadeTo('sfx_siren_fire',1,3));at(7500,()=>fadeTo('sfx_siren_fire',0,1.2));
 seq([[7400,'sfx_brakes',0.6,'audio3']]);loopAt(8600,'sfx_hose_spray',1);at(12800,()=>stop('sfx_hose_spray'));
 at(12000,()=>fadeTo('amb_fire_big',0,1.5));seq([[12400,'sfx_steam_hiss',1],[14600,'sfx_crowd_cheer_small',1]]);at(15000,()=>stop('amb_fire_big'));
 at(9000,()=>stop('sfx_siren_fire'))};
document.getElementById('chase').onclick=()=>{stopAll();loopAt(0,'bgm_chase',1);
 seq([[200,'sfx_police_whistle',1],[900,'sfx_crowd_gasp',0.8]]);loopAt(1500,'sfx_siren_police',0.7);
 at(9000,()=>stop('sfx_siren_police'));loopAt(9200,'sfx_comic_fight',1);at(11800,()=>stop('sfx_comic_fight'));
 seq([[11900,'sfx_police_whistle',0.9],[12700,'sfx_cuffs_click',1],[13500,'sfx_crowd_cheer_small',0.9]])};
document.getElementById('build').onclick=()=>{stopAll();loopAt(0,'amb_construction',1);loopAt(0,'sfx_excavator',0.8);
 seq([[1500,'sfx_demolish_crunch',1],[3000,'sfx_chatter_lo',0.4,'audio2'],[4000,'sfx_demolish_crunch',0.9],[6200,'sfx_collapse_soft',1],[9000,'sfx_hammer',0.6,'audio2'],[10500,'sfx_build_done',0.8,'audio2']]);
 at(8500,()=>stop('sfx_excavator'))};
</script></body></html>
"""
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "audio6_preview.html"), "w") as f:
        f.write(html)


# ----------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default="", help="comma-separated keys to (re)build")
    ap.add_argument("--skip-render", action="store_true", help="reuse the cached wavs")
    ap.add_argument("--no-check", action="store_true", help="do not run check_audio6.py afterwards")
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
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"  payload assets/audio6: {total} bytes ({total / 1e6:.3f} MB)")
    print(f"  done in {time.time() - t0:.0f}s -> {os.path.relpath(OUT, ROOT)}/manifest.json", flush=True)
    if not a.no_check:
        print("[4/4] check_audio6.py ...", flush=True)
        import check_audio6
        sys.exit(check_audio6.main([]))


if __name__ == "__main__":
    main()
