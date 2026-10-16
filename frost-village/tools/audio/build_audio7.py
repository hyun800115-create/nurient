"""Frost Village - build the v4.2 office / loop-rail sounds (CONTRACT_V42 section AM) into assets/audio7/.

render (sfx7.py) -> one AUDIO SPRITE for every one-shot (50 ms gaps, one LAME encode) + the amb_office loop as its
own file -> measure each sprite slice on the DECODED sprite -> manifest (volume per key from the audio1-6 loudness
table, audioSprite offsets, groups) -> QA (check_audio7.py).

The contract asks for 3 files: assets/audio7/audio7_sprite.mp3, the sprite's JSON with [start, duration] per key
(that JSON IS the fragment manifest: Assets.mergeManifests reads `audioSprite` from <frag>/manifest.json and
Assets.sliceSprite cuts one AudioBuffer per key, so Audio.play(key) works unchanged - a separate .json would be a 4th
file and need loader code) and assets/audio7/amb_office.mp3. MP3 only (every browser decodes it; the artifact build
drops the .ogg copies anyway when files are tight).

Mix conventions = assets/audio .. audio6 (build_audio.py, imported read-only): files mastered hot (sfx peak -1.5
dBFS, loops -20 LUFS), manifest volume = 10^((TARGET + HEADROOM_DB - measured) / 20), measured with ffmpeg ebur128
(max momentary for sfx, integrated for loops), every delivered sample peak and true peak <= -1 dBFS / dBTP, loop
duration = loopSamples / 44100 to 7 decimals, mp3StartPad for decoders that ignore the LAME tag.

Run from anywhere (deterministic, ~1 min):
    python3 tools/audio/build_audio7.py                 # render + sprite + loop + manifest + check_audio7
    python3 tools/audio/build_audio7.py --skip-render   # re-encode from the cache wavs
    python3 tools/audio/build_audio7.py --no-check
Cache: /tmp/fv_cache/audio7 (FV_AUDIO7_CACHE).
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
CACHE = os.environ.get("FV_AUDIO7_CACHE", "/tmp/fv_cache/audio7")
OUT = os.path.join(ROOT, "assets", "audio7")
REL = "audio7"
SPRITE = "audio7_sprite.mp3"
GAP = 0.05                       # contract: 50 ms gaps (Assets.sliceSprite reads dur + 30 ms: lands in the gap)
SR = 44100

# key: (kind, loop, target loudness at game call volume 1 before HEADROOM_DB, extra manifest fields)
#   sfx target = max momentary LUFS (400 ms), ambience = integrated LUFS - the build_audio.SOUNDS convention.
#   References: audio6 sfx_stamp -18.5, sfx_newspaper -18.5, sfx_coin_count -18, sfx_cuffs_click -18.5,
#   sfx_ticket_chime -19, amb_bank -32.5 ; audio3 sfx_brakes -18, sfx_truck_engine (positional loop) -27.
SOUNDS = {
    "sfx_typewriter":   ("sfx", False, -21.0, {"cues": {"key1": 0.0, "key2": 0.135, "key3": 0.265, "key4": 0.385},
                                              "notes": "a clerk types (desk_type + typewriter overlay): four soft key clacks. "
                                                       "Play the group 'sfx_typewriter' (random variant, never the same "
                                                       "twice) every 0.55-0.8 s while desk_type plays, volume by distance "
                                                       "/ reveal; sfx_typewriter_3 ends a line with the margin bell."}),
    "sfx_typewriter_2": ("sfx", False, -21.0, {"cues": {"key1": 0.0, "key2": 0.11, "key3": 0.245, "key4": 0.4},
                                              "notes": "variant (group sfx_typewriter)."}),
    "sfx_typewriter_3": ("sfx", False, -21.0, {"cues": {"key1": 0.0, "key2": 0.12, "key3": 0.225, "key4": 0.315,
                                                        "bell": 0.4},
                                              "notes": "variant ending on the tiny margin bell 'ting' (F6) - end of a "
                                                       "line (group sfx_typewriter, or play it alone every 3-4 bursts)."}),
    "sfx_switch_clack": ("sfx", False, -18.5, {"cues": {"grab": 0.0, "cheol": 0.1, "keok": 0.17},
                                              "notes": "the spring turnout lever ('철컥') when the loop switch is thrown "
                                                       "for the train, by distance."}),
    "sfx_wheel_squeal": ("sfx", False, -26.0, {"loopable": True, "loopPeriod": 1.23,
                                              "notes": "gentle flange squeal while a car runs on a loop curve, very quiet. "
                                                       "A STEADY loop (polish, critic M5): Assets.sliceSprite cuts dur + "
                                                       "30 ms = 1.23 s = exactly one period, so loop the sliced buffer as "
                                                       "it is: sound.add('sfx_wheel_squeal', {loop: true}) - seamless "
                                                       "(the sprite carries a pre / post-roll so a +-1 ms decoder offset "
                                                       "stays seamless too). Fade in / out over ~0.25 s (volume tween) as "
                                                       "the car enters / leaves the curve; volume x speed / max speed; "
                                                       "rate 0.95-1.05 per car so two cars never line up."}),
    "sfx_mailbox_flag": ("sfx", False, -19.0, {"cues": {"flick": 0.0, "clack": 0.05, "bell": 0.06},
                                              "notes": "office_mailbox: the flag flips up when a letter arrives (tin clack "
                                                       "+ tiny bell C7); also when a clerk empties it."}),
    "sfx_coin_sack":    ("sfx", False, -18.5, {"cues": {"shake1": 0.0, "shake2": 0.22},
                                              "notes": "the courier 딸랑이 scoops the tills / swings the sack: play the group "
                                                       "'sfx_coin_sack' on each scoop and every ~1.5 s of carry_sack walking "
                                                       "(soft, x0.6); muffled coins + her bell pin 'ttallang-ttallang'."}),
    "sfx_coin_sack_2":  ("sfx", False, -18.5, {"cues": {"shake1": 0.0, "shake2": 0.19},
                                              "notes": "variant (group sfx_coin_sack)."}),
    "sfx_coin_sack_3":  ("sfx", False, -18.5, {"cues": {"shake1": 0.0, "shake2": 0.25},
                                              "notes": "variant: a fuller sack (group sfx_coin_sack) - use for the "
                                                       "hand_over at the bank counter."}),
    "amb_office":       ("ambience", True, -30.5, {"notes": "inside the 촌장 사무실 (24 s mono loop, texture only): soft "
                                                            "typing from two desks (ducked - the game's sfx_typewriter "
                                                            "one-shots are the foreground), page turns, a pen, the kettle "
                                                            "simmering on the stove, the wall clock ticking once a second "
                                                            "(audible in the typing pauses). setAmbience('amb_office', "
                                                            "reveal 0..1) while the office is revealed / the camera is "
                                                            "near it (like amb_bank); duck it to ~0.6 under the panel. "
                                                            "Level (polish, critic M6): target -30.5 LUFS = 2 dB above "
                                                            "amb_bank (-32.5) and under amb_fire_big, as the audio1-6 "
                                                            "indoor beds; CONTRACT_V42 wrote -26, which would make it the "
                                                            "loudest bed in the game. Only `volume` encodes this choice: "
                                                            "x1.68 restores the contract's -26 if the designer prefers."}),
}
GROUPS = {"sfx_typewriter": ["sfx_typewriter", "sfx_typewriter_2", "sfx_typewriter_3"],
          "sfx_coin_sack": ["sfx_coin_sack", "sfx_coin_sack_2", "sfx_coin_sack_3"]}
SPRITE_ORDER = ["sfx_typewriter", "sfx_typewriter_2", "sfx_typewriter_3", "sfx_switch_clack", "sfx_wheel_squeal",
                "sfx_mailbox_flag", "sfx_coin_sack", "sfx_coin_sack_2", "sfx_coin_sack_3"]
KBPS = {"sfx": BA.MP3_KBPS["sfx"], "ambience": BA.MP3_KBPS["ambience"]}


def render(keys):
    import sfx7
    os.makedirs(CACHE, exist_ok=True)
    for k in keys:
        t0 = time.time()
        if k in sfx7.LOOP_FUNCS:
            y, meta = getattr(sfx7, sfx7.LOOP_FUNCS[k])()
            with open(os.path.join(CACHE, f"{k}.json"), "w") as f:
                json.dump(meta, f)
        else:
            y = sfx7.render(k)
        S.write_wav(os.path.join(CACHE, f"{k}.wav"), y)
        print(f"  rendered {k:18s} {len(np.atleast_1d(y)) / SR:6.3f}s ({time.time() - t0:4.1f}s)", flush=True)


def read(k):
    return S.read_wav(os.path.join(CACHE, f"{k}.wav"))[0]


ROLL_PRE, ROLL_POST, ROLL_FADE = 0.012, 0.008, 0.004     # loop slices: pre-roll / post-roll / their fades (s)


def build_sprite(gains):
    """Concatenate the one-shots (gap before each + a final gap), encode once, decode, and measure each slice.
    A loop slice (sfx7.LOOP_SLICES: the squeal) keeps its manifest duration (1.2 s) but its wav is one whole period
    (1.23 s): the 30 ms continuation goes into the gap after it (so sliceSprite's dur + 30 ms cut is exactly one
    period), followed by an 8 ms post-roll, and the period's last 12 ms go into the gap before it as a pre-roll - all
    with 4 ms fades into silence, leaving 8 ms of silence before the next key and 4 ms after the previous key's
    30 ms read.  A decoder that shifts the slice by a millisecond still cuts one seamless period."""
    import sfx7
    gap = np.zeros(int(round(GAP * SR)))
    parts, keys, pos, loops = [], {}, 0, {}
    for k in SPRITE_ORDER:
        x = read(k) * S.undb(gains.get(k, 0.0))
        parts.append(gap)
        pos += len(gap)
        if k in sfx7.LOOP_SLICES:
            du = int(round(sfx7.LOOP_SLICES[k] * SR))
            keys[k] = [round(pos / SR, 5), round(du / SR, 5)]
            loops[k] = (pos, du, x)
            parts.append(x[:du])
            pos += du
            continue
        keys[k] = [round(pos / SR, 5), round(len(x) / SR, 5)]
        parts.append(x)
        pos += len(x)
    parts.append(gap)
    pos += len(gap)
    pcm = np.concatenate(parts)
    for k, (p0, du, x) in loops.items():
        n, pre, post, fd = len(x), S.n_of(ROLL_PRE), S.n_of(ROLL_POST), S.n_of(ROLL_FADE)
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fd))
        pcm[p0 + du:p0 + n] = x[du:]                                       # the rest of the period (30 ms)
        pcm[p0 + n:p0 + n + post] = x[:post]                               # post-roll: the loop goes on ...
        pcm[p0 + n + post:p0 + n + post + fd] = x[post:post + fd] * ramp[::-1]   # ... and fades out
        pcm[p0 - pre:p0] = x[n - pre:]                                     # pre-roll: the end of the period
        pcm[p0 - pre - fd:p0 - pre] = x[n - pre - fd:n - pre] * ramp       # fading in from silence
    wav = os.path.join(CACHE, "audio7_sprite.wav")
    S.write_wav(wav, pcm)
    out = os.path.join(OUT, SPRITE)
    F.encode_mp3(wav, out, 1, KBPS["sfx"])
    dec = F.decode(out, 1)[0]
    meas = {}
    for k, (st, du) in keys.items():
        a = int(round(st * SR))
        sl = dec[a:a + int(round(du * SR))]
        p = os.path.join(CACHE, f"slice_{k}.wav")
        S.write_wav(p, sl)
        m = F.ebur128(p, 1)
        meas[k] = {"mp3": m, "duration": du, "decLen": len(dec)}
    return keys, round(pos / SR, 5), meas, len(pcm), len(dec)


def build_loop(key, gain=0.0):
    src = os.path.join(CACHE, f"{key}.wav")
    out = os.path.join(OUT, f"{key}.mp3")
    for _ in range(4):
        F.encode_mp3(src, out, 1, KBPS["ambience"], gain)
        m = F.ebur128(out, 1)
        if max(m["peak"], m["tpk"]) <= BA.PEAK_MAX:
            break
        gain += BA.PEAK_MAX - 0.15 - max(m["peak"], m["tpk"])
    return {"mp3": m, "trim_db": round(gain, 2)}


def volume(key, level):
    kind, _, target, _ = SOUNDS[key]
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
        print("[1/4] rendering ...", flush=True)
        render([k for k in SOUNDS if not a.only or k in a.only.split(",")])
    print("[2/4] sprite + loop encode ...", flush=True)
    gains = {}
    for it in range(5):                       # LAME can overshoot a slice's peak: trim that key and re-encode
        keys, dur, meas, n_src, n_dec = build_sprite(gains)
        over = {k: max(m["mp3"]["peak"], m["mp3"]["tpk"]) for k, m in meas.items()
                if max(m["mp3"]["peak"], m["mp3"]["tpk"]) > BA.PEAK_MAX}
        if not over:
            break
        for k, pk in over.items():
            gains[k] = gains.get(k, 0.0) + BA.PEAK_MAX - 0.15 - pk
    lm = build_loop("amb_office")
    with open(os.path.join(CACHE, "amb_office.json")) as f:
        meta = json.load(f)
    print("[3/4] manifest ...", flush=True)
    audio = {}
    for k, (kind, loop, target, extra) in SOUNDS.items():
        if k == "amb_office":
            L = int(meta["loopSamples"])
            e = {"files": [f"{REL}/amb_office.mp3"], "volume": volume(k, lm["mp3"]["I"]), "loop": True,
                 "kind": kind, "duration": round(L / 44100.0, 7), "loopSamples": L}
            gl = F.mp3_gapless(os.path.join(OUT, "amb_office.mp3"))
            if gl:
                e["mp3StartPad"] = gl[0] + 529
            e["rotation"] = meta.get("rotation")
            e["clockHz"] = meta.get("clockHz")
        else:
            e = {"files": [], "inSprite": REL, "volume": volume(k, meas[k]["mp3"]["M"]), "loop": False,
                 "kind": kind, "duration": keys[k][1]}
        e.update(extra)
        audio[k] = e
    man = {
        "version": 1,
        "generator": "tools/audio/build_audio7.py (procedural synthesis: sfx7.py; same toolkit + loudness conventions "
                     "as assets/audio .. audio6)",
        "conventions": {
            "contract": "CONTRACT_V42 section AM. Paths relative to frost-village/assets/. Fragment name: audio7 "
                        "(add it to FRAGMENTS in src/core/Assets.js).",
            "sprite": "Every one-shot lives in ONE audio sprite: audioSprite.keys[key] = [start s, duration s] with "
                      "50 ms gaps; Assets.queueAudio loads it once ('__sprite_audio7') and Assets.sliceSprite cuts one "
                      "AudioBuffer per key (dur + 30 ms) into the audio cache, so Audio.play(key) / exists(key) work "
                      "unchanged. This manifest is the sprite's JSON (3 files in all).",
            "groups": "Audio.play('sfx_typewriter') / Audio.play('sfx_coin_sack') pick a random variant (never the "
                      "same twice in a row); the group names are also playable keys (variant 1).",
            "levels": "volume = 10^((target + HEADROOM_DB - measured) / 20), measured on the decoded sprite slice "
                      "(max momentary LUFS) / the decoded loop (integrated LUFS); HEADROOM_DB = -2 like audio .. audio6.",
        },
        "audioSprite": {"file": f"{REL}/{SPRITE}", "keys": keys, "dur": dur, "gap": GAP, "ch": 1, "kbps": KBPS["sfx"]},
        "audio": audio,
        "audioGroups": GROUPS,
    }
    with open(os.path.join(OUT, "manifest.json"), "w") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"  {'key':18s} {'dur':>6s} {'Mmax':>6s} {'I':>6s} {'peak':>6s} {'tpk':>6s} {'vol':>6s}")
    for k in SOUNDS:
        m = lm["mp3"] if k == "amb_office" else meas[k]["mp3"]
        print(f"  {k:18s} {audio[k]['duration']:6.3f} {m['M']:6.1f} {m['I']:6.1f} {m['peak']:6.1f} {m['tpk']:6.1f} "
              f"{audio[k]['volume']:6.3f}")
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"  sprite {dur:.3f} s ({n_src} -> decoded {n_dec} samples), payload {total} bytes, "
          f"gains {gains or 'none'}; done in {time.time() - t0:.0f}s", flush=True)
    if not a.no_check:
        print("[4/4] check_audio7.py ...", flush=True)
        import check_audio7
        return check_audio7.main([])
    return 0


if __name__ == "__main__":
    sys.exit(main())
