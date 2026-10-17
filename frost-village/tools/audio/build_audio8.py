"""Frost Village - build the 금방 (Geumbang) sounds (CONTRACT_GEUMBANG section AR) into assets/audio8/.

render (sfx8.py) -> one AUDIO SPRITE for every one-shot (50 ms gaps, one LAME encode, mono 96 kbps) -> measure each
slice on the DECODED sprite -> manifest (volume per key from the audio1-7 loudness table, audioSprite offsets,
groups) -> QA (check_audio8.py).

The contract asks for 2 files: assets/audio8/audio8_sprite.mp3 and the sprite's JSON with [start, duration] per key.
That JSON IS the fragment manifest (assets/audio8/manifest.json): Assets.mergeManifests reads `audioSprite` from
<frag>/manifest.json and Assets.sliceSprite cuts one AudioBuffer per key (dur + 30 ms - it lands in the 50 ms gap), so
Audio.play(key) works unchanged, exactly like audio7.

Mix conventions = assets/audio .. audio7 (build_audio.py, imported read-only): files mastered hot (sfx peak -1.5
dBFS), manifest volume = 10^((TARGET + HEADROOM_DB - measured) / 20) with the max momentary LUFS measured by ffmpeg
ebur128 on the decoded slice, every delivered sample peak and true peak <= -1 dBFS.

Run from anywhere (deterministic, ~20 s):
    python3 tools/audio/build_audio8.py                 # render + sprite + manifest + check_audio8
    python3 tools/audio/build_audio8.py --skip-render   # re-encode from the cache wavs
    python3 tools/audio/build_audio8.py --only k1,k2    # re-render only those keys
    python3 tools/audio/build_audio8.py --no-check
Cache: $FV_AUDIO8_CACHE (default /tmp/fv_cache/audio8).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
import numpy as np  # noqa: E402

import build_audio as BA  # noqa: E402  (read-only: HEADROOM_DB, VOL_MIN/MAX, PEAK_MAX, MP3_KBPS)
import ffmpeg_tools as F  # noqa: E402
import synth as S  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CACHE = os.environ.get("FV_AUDIO8_CACHE", "/tmp/fv_cache/audio8")
OUT = os.path.join(ROOT, "assets", "audio8")
REL = "audio8"
SPRITE = "audio8_sprite.mp3"
GAP = 0.05                       # contract: 50 ms gaps (Assets.sliceSprite reads dur + 30 ms: lands in the gap)
SR = 44100
KBPS = 96                        # contract: mono 96 kbps

# key: (target loudness = max momentary LUFS at game call volume 1, before HEADROOM_DB, extra manifest fields)
# References (build_audio1-7): sfx_ticket_chime -19, sfx_mailbox_flag -19, sfx_door -18.5, sfx_box_drop -18.5,
# sfx_car_honk -17, sfx_coin -17, sfx_customer_happy -17, sfx_typewriter -21.
SOUNDS = {
    "sfx_gb_doorbell":   (-18.5, {"cues": {"ding": 0.0, "dong": 0.33},
                                  "notes": "'띵동' (G5 -> E5): the courier rings at a front door (ring_doorbell impact "
                                           "frame, with fx_gb_bell). Play the group 'sfx_gb_doorbell' (the two houses "
                                           "sound different), positional by distance; once per stop."}),
    "sfx_gb_doorbell_2": (-18.5, {"cues": {"ding": 0.0, "dong": 0.33},
                                  "notes": "variant A5 -> F#5 (group sfx_gb_doorbell)."}),
    "sfx_gb_horn":       (-19.0, {"cues": {"beep1": 0.0, "beep2": 0.19},
                                  "notes": "friendly double toy beep of the 금방 van (a van blocked > 6 s, at most once "
                                           "per 6 s; never at night); positional, x0.7 in 관망."}),
    "sfx_gb_chime":      (-20.0, {"cues": {"note1": 0.0, "note2": 0.11},
                                  "notes": "the 금방 app ping: a new order (only when revealed / the app or toast shows "
                                           "it), a tracker step done while the app is open, the 금방 chip's new dot. "
                                           "UI sound (not positional); at most 1 per 2 s."}),
    "sfx_gb_thump":      (-20.0, {"cues": {"land": 0.0},
                                  "notes": "a parcel set down on a snowy doorstep (nobody home: gb_parcel_doorstep), "
                                           "staged by dock 1 (출고 대기), a courier's box landing. Group "
                                           "'sfx_gb_thump'; positional."}),
    "sfx_gb_thump_2":    (-20.0, {"cues": {"land": 0.0, "scrape": 0.07},
                                  "notes": "variant: a heavier box that settles with a small scrape (group sfx_gb_thump)."}),
    "sfx_gb_jingle":     (-17.5, {"cues": {"n1": 0.0, "n2": 0.13, "n3": 0.28},
                                  "notes": "the 금방 sound logo '금-방!' (F5 G5 C6, original): the opening ribbon cut, the "
                                           "first delivery of the day, the app's first open / splash. Duck the bgm to "
                                           "0.5 for 1.2 s; never more than once per game hour except the ceremony."}),
    "sfx_gb_tape":       (-20.5, {"cues": {"pull": 0.0, "snip": 0.37},
                                  "notes": "packing tape '찌익' (tape_box impact frame at the 포장대). Group "
                                           "'sfx_gb_tape'; positional / by reveal, x0.8 when two packers work."}),
    "sfx_gb_tape_2":     (-20.5, {"cues": {"pull": 0.0, "snip": 0.30},
                                  "notes": "variant: a shorter, quicker pull (group sfx_gb_tape)."}),
    "sfx_gb_scan":       (-23.0, {"cues": {"beep": 0.0},
                                  "notes": "soft '삑' per parcel scanned (scan impact frame) and per box loaded into "
                                           "the van; positional, rate 0.98-1.03 so a row of boxes is not a buzzer."}),
    "sfx_gb_locker":     (-19.5, {"cues": {"click": 0.0, "pop": 0.03, "chime1": 0.10, "chime2": 0.19},
                                  "notes": "금방 보관함 opens (gb_locker open anim, frame 0): latch click, door pop, the "
                                           "two-note chime A5 -> D6; positional."}),
}
GROUPS = {"sfx_gb_doorbell": ["sfx_gb_doorbell", "sfx_gb_doorbell_2"],
          "sfx_gb_thump": ["sfx_gb_thump", "sfx_gb_thump_2"],
          "sfx_gb_tape": ["sfx_gb_tape", "sfx_gb_tape_2"]}
SPRITE_ORDER = ["sfx_gb_doorbell", "sfx_gb_doorbell_2", "sfx_gb_horn", "sfx_gb_chime", "sfx_gb_thump",
                "sfx_gb_thump_2", "sfx_gb_jingle", "sfx_gb_tape", "sfx_gb_tape_2", "sfx_gb_scan", "sfx_gb_locker"]
# (polish L3) code stand-ins that v4.3 really loads (FRAGMENTS / LATE_FRAGMENTS of src/core/Assets.js): audio6
# (sfx_ticket_chime, sfx_box_drop) and audio5's beach keys are not loaded, so they are only the plan's "if shipped" picks
STAND_IN = {"sfx_gb_doorbell": "sfx_pickup", "sfx_gb_doorbell_2": "sfx_pickup", "sfx_gb_chime": "sfx_pickup",
            "sfx_gb_scan": "sfx_pickup", "sfx_gb_locker": "sfx_mailbox_flag", "sfx_gb_jingle": "sfx_coin",
            "sfx_gb_horn": "sfx_car_honk_1", "sfx_gb_thump": "sfx_drop", "sfx_gb_thump_2": "sfx_drop",
            "sfx_gb_tape": "sfx_drop", "sfx_gb_tape_2": "sfx_drop"}
# a two-note stand-in where one key is too plain: [key, at s, rate] (Audio.play(key, {rate}) at each time)
STAND_IN_PLAY = {"sfx_gb_doorbell": [["sfx_pickup", 0.0, 1.0], ["sfx_pickup", 0.33, 0.794]],      # ding-dong (a third down)
                 "sfx_gb_doorbell_2": [["sfx_pickup", 0.0, 1.122], ["sfx_pickup", 0.33, 0.891]],
                 "sfx_gb_chime": [["sfx_pickup", 0.0, 2.0], ["sfx_pickup", 0.11, 2.67]],          # two rising pings
                 "sfx_gb_scan": [["sfx_pickup", 0.0, 2.38]]}
STAND_IN_IF_SHIPPED = {"sfx_gb_doorbell": "sfx_ticket_chime", "sfx_gb_doorbell_2": "sfx_ticket_chime",
                       "sfx_gb_chime": "sfx_ticket_chime", "sfx_gb_locker": "sfx_ticket_chime",
                       "sfx_gb_scan": "sfx_ticket_chime", "sfx_gb_thump": "sfx_box_drop", "sfx_gb_thump_2": "sfx_box_drop",
                       "sfx_gb_tape": "sfx_box_drop", "sfx_gb_tape_2": "sfx_box_drop"}
STAND_IN_FRAGMENT = {"sfx_pickup": "audio", "sfx_drop": "audio", "sfx_coin": "audio", "sfx_mailbox_flag": "audio7",
                     "sfx_car_honk_1": "audio3"}


def render(keys):
    import sfx8
    os.makedirs(CACHE, exist_ok=True)
    for k in keys:
        t0 = time.time()
        y = sfx8.render(k)
        S.write_wav(os.path.join(CACHE, f"{k}.wav"), y)
        print(f"  rendered {k:18s} {len(y) / SR:6.3f}s ({time.time() - t0:4.1f}s)", flush=True)


def read(k):
    return S.read_wav(os.path.join(CACHE, f"{k}.wav"))[0]


def build_sprite(gains):
    """Concatenate the one-shots (a 50 ms gap before each + a final gap), encode once, decode, measure each slice."""
    gap = np.zeros(int(round(GAP * SR)))
    parts, keys, pos = [], {}, 0
    for k in SPRITE_ORDER:
        x = read(k) * S.undb(gains.get(k, 0.0))
        parts.append(gap)
        pos += len(gap)
        keys[k] = [round(pos / SR, 5), round(len(x) / SR, 5)]
        parts.append(x)
        pos += len(x)
    parts.append(gap)
    pos += len(gap)
    pcm = np.concatenate(parts)
    wav = os.path.join(CACHE, "audio8_sprite.wav")
    S.write_wav(wav, pcm)
    out = os.path.join(OUT, SPRITE)
    F.encode_mp3(wav, out, 1, KBPS)
    dec = F.decode(out, 1)[0]
    meas = {}
    for k, (st, du) in keys.items():
        a = int(round(st * SR))
        sl = dec[a:a + int(round(du * SR))]
        p = os.path.join(CACHE, f"slice_{k}.wav")
        S.write_wav(p, sl)
        meas[k] = {"mp3": F.ebur128(p, 1), "duration": du}
    return keys, round(pos / SR, 5), meas, len(pcm), len(dec)


def volume(key, level):
    target = SOUNDS[key][0]
    v = 10 ** ((target + BA.HEADROOM_DB - level) / 20.0)
    return round(min(BA.VOL_MAX, max(BA.VOL_MIN, v)), 3)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--skip-render", action="store_true")
    ap.add_argument("--no-check", action="store_true")
    ap.add_argument("--only", default="", help="comma list: re-render only these keys (the rest come from the cache)")
    a = ap.parse_args(argv)
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    if not a.skip_render:
        print("[1/3] rendering ...", flush=True)
        render([k for k in SOUNDS if not a.only or k in a.only.split(",")])
    print("[2/3] sprite encode ...", flush=True)
    gains = {}
    for it in range(5):                       # LAME can overshoot a slice's peak: trim that key and re-encode
        keys, dur, meas, n_src, n_dec = build_sprite(gains)
        over = {k: max(m["mp3"]["peak"], m["mp3"]["tpk"]) for k, m in meas.items()
                if max(m["mp3"]["peak"], m["mp3"]["tpk"]) > BA.PEAK_MAX}
        if not over:
            break
        for k, pk in over.items():
            gains[k] = gains.get(k, 0.0) + BA.PEAK_MAX - 0.15 - pk
    audio = {}
    for k, (target, extra) in SOUNDS.items():
        e = {"files": [], "inSprite": REL, "volume": volume(k, meas[k]["mp3"]["M"]), "loop": False, "kind": "sfx",
             "duration": keys[k][1], "standIn": STAND_IN[k]}
        if k in STAND_IN_PLAY:
            e["standInPlay"] = STAND_IN_PLAY[k]
        if k in STAND_IN_IF_SHIPPED:
            e["standInIfShipped"] = STAND_IN_IF_SHIPPED[k]
        e.update(extra)
        audio[k] = e
    man = {
        "version": 1,
        "generator": "tools/audio/build_audio8.py (procedural synthesis: sfx8.py; same toolkit + loudness conventions "
                     "as assets/audio .. audio7)",
        "conventions": {
            "contract": "CONTRACT_GEUMBANG section AR. Paths relative to frost-village/assets/. Fragment name: audio8 "
                        "(a late fragment, plan §12 G-P6).",
            "sprite": "Every sound lives in ONE audio sprite: audioSprite.keys[key] = [start s, duration s] with 50 ms "
                      "gaps; Assets.queueAudio loads it once ('__sprite_audio8') and Assets.sliceSprite cuts one "
                      "AudioBuffer per key (dur + 30 ms) into the audio cache, so Audio.play(key) / exists(key) work "
                      "unchanged. This manifest is the sprite's JSON (2 files in all).",
            "groups": "Audio.play('sfx_gb_doorbell' | 'sfx_gb_thump' | 'sfx_gb_tape') picks a random variant (never "
                      "the same twice in a row); the group names are also playable keys (variant 1).",
            "levels": "volume = 10^((target + HEADROOM_DB - measured) / 20), measured on the decoded sprite slice "
                      "(max momentary LUFS); HEADROOM_DB = -2 like audio .. audio7.",
            "brand": "Original sounds: no voice, no real company's jingle or chime; the 금-방 logo is F5 G5 C6.",
            "standIn": "plan §10.3: until audio8 lands, play standIn instead - only keys v4.3 loads (polish L3): "
                       "sfx_pickup / sfx_drop / sfx_coin (audio), sfx_car_honk_1 (audio3), sfx_mailbox_flag (audio7); "
                       "standInPlay = [key, at s, rate] notes for a two-note stand-in (the 띵동 is sfx_pickup at rate "
                       "1.0 then 0.794); standInIfShipped = the plan's audio6 pick (sfx_ticket_chime / sfx_box_drop), "
                       "only if audio6 is ever loaded.",
            "standInFragments": STAND_IN_FRAGMENT,
        },
        "audioSprite": {"file": f"{REL}/{SPRITE}", "keys": keys, "dur": dur, "gap": GAP, "ch": 1, "kbps": KBPS},
        "audio": audio,
        "audioGroups": GROUPS,
    }
    print("[3/3] manifest ...", flush=True)
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"  {'key':18s} {'dur':>6s} {'Mmax':>6s} {'I':>6s} {'peak':>6s} {'tpk':>6s} {'vol':>6s}")
    for k in SOUNDS:
        m = meas[k]["mp3"]
        print(f"  {k:18s} {audio[k]['duration']:6.3f} {m['M']:6.1f} {m['I']:6.1f} {m['peak']:6.1f} {m['tpk']:6.1f} "
              f"{audio[k]['volume']:6.3f}")
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"  sprite {dur:.3f} s ({n_src} -> decoded {n_dec} samples), payload {total} bytes, "
          f"gains {gains or 'none'}; done in {time.time() - t0:.0f}s", flush=True)
    if not a.no_check:
        import check_audio8
        return check_audio8.main([])
    return 0


if __name__ == "__main__":
    sys.exit(main())
