"""눈꽃말 (village language) - build every village voice: plan -> render -> sprite -> encode -> manifest.

Run from anywhere (about 1 min on 3 cores; deterministic, safe to re-run):
    python3 tools/voice/build_voice.py                 # everything + QA (check_voice.py)
    python3 tools/voice/build_voice.py --voices kid_boy,chief   # re-render only these voices
    python3 tools/voice/build_voice.py --no-check
    python3 tools/voice/build_voice.py --lexicon-only  # after editing lexicon.json keywords (no re-render)
Outputs
    assets/voice/voice_<type>.ogg / .mp3   one audio sprite per voice type (mono 44.1 kHz): ~20 words +
                                           fillers + sentence-end particles + 10 emotive one-shots
    assets/voice/manifest.json             audio fragment (CONTRACT section 2 conventions: files [ogg, mp3],
                                           volume, loop, kind, duration) + per-sprite `markers`
                                           {clip: {start, dur, kind, ...}} + `voices` (cast / timbre table)
    src/voice/lexicon.js                   GENERATED from tools/voice/lexicon.json (runtime keyword map)
    docs/눈꽃말_사전.md                     GENERATED dictionary for the designer (make_dictionary.py)
Loudness: every clip is normalised to the same active-speech loudness inside its sprite (CLIP_LUFS,
peak <= -1.5 dBFS), and the sprite's manifest `volume` brings it to the effective level of the old
chatter (assets/audio2 sfx_chatter_*: -21.1 LUFS active at volume 1; VillageLife plays chatter x0.4,
VillageVoice uses the same 0.4 base gain).
Needs numpy, scipy, pyworld, espeakng-loader, ffmpeg (see deps.py).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
sys.path.insert(0, os.path.join(HERE, "..", "audio"))
import numpy as np  # noqa: E402

import ffmpeg_tools as F  # noqa: E402  (tools/audio, read-only)
import loudness as LD  # noqa: E402
import phonology as P  # noqa: E402
import prosody as PR  # noqa: E402
import synth as S  # noqa: E402
import voices as VV  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "voice")
SRC = os.path.join(ROOT, "src", "voice")
CACHE = os.path.join(HERE, "_cache")

CLIP_LUFS = -13.0          # active loudness of every clip inside a sprite (file level)
EMOTE_DB = {"laugh": 0.5, "surprise": 0.5, "excited": 0.5, "sad": -1.0, "grumpy": 0.0}
EFFECTIVE = -21.0          # active LUFS at manifest volume (old chatter: -21.1 +- 0.2)
PEAK_DB = -1.5
LEAD, GAP = 0.03, 0.045    # sprite: silence before the first clip and between clips (> 25 ms mp3 pad error)
OGG_Q = 3
MP3_KBPS = 56
CODE_FILES = ["render.py", "vocoder.py", "espeak.py", "prosody.py", "phonology.py"]


# ----------------------------------------------------------------------------- plans
def plans_for(voice: str):
    lex = {w["id"]: w for w in P.load_lexicon()["words"]}
    out = [PR.word_plan(lex[w], voice) for w in VV.word_list(voice)]
    style = VV.VOICES[voice]["laugh"]
    out += [PR.emote_plan(e, voice, style) for e in VV.EMOTES]
    return out


def _code_hash() -> str:
    h = hashlib.sha1()
    for f in CODE_FILES:
        with open(os.path.join(HERE, f), "rb") as fh:
            h.update(fh.read())
    return h.hexdigest()[:12]


def _clip_path(voice, plan, code):
    key = hashlib.sha1(json.dumps([plan, VV.VOICES[voice], code], sort_keys=True).encode()).hexdigest()[:14]
    return os.path.join(CACHE, "clips", voice, f"{plan['id']}.{key}.wav")


def _render_voice(args):
    """worker: render (or reuse) every clip of one voice -> [(plan, wav path)]"""
    voice, code = args
    sys.path.insert(0, HERE)
    import render as R
    t0 = time.time()
    res, fresh = [], 0
    for plan in plans_for(voice):
        path = _clip_path(voice, plan, code)
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            y = R.render_clip(plan, voice)
            if not np.all(np.isfinite(y)):
                raise RuntimeError(f"{voice}/{plan['id']}: non-finite samples")
            S.write_wav(path + ".tmp", y)
            os.replace(path + ".tmp", path)
            fresh += 1
        res.append((plan, path))
    return voice, res, f"  {voice:10s} {len(res)} clips ({fresh} rendered, {time.time() - t0:4.1f}s)"


# ----------------------------------------------------------------------------- sprites
def level_clip(y, plan):
    """normalise active loudness; keep the peak under PEAK_DB (look-ahead limiter if needed)."""
    target = CLIP_LUFS + (EMOTE_DB.get(plan.get("emote"), 0.0) if plan["kind"] == "emote" else 0.0)
    y = y * S.undb(target - LD.active_lufs(y))
    if LD.peak_db(y) > PEAK_DB - 0.3:
        y = S.limiter(y, PEAK_DB - 0.3, 3.0)
    return y


HANGUL = {w["id"]: w["hangul"] for w in P.load_lexicon()["words"]}


def build_sprite(voice, clips):
    parts = [np.zeros(S.n_of(LEAD))]
    pos = len(parts[0])
    markers = {}
    for plan, path in clips:
        y = level_clip(S.read_wav(path)[0], plan)
        m = {"start": round(pos / S.SR, 5), "dur": round(len(y) / S.SR, 5), "kind": plan["kind"], "syl": plan["syl"]}
        if plan["kind"] == "emote":
            m["emote"] = plan["emote"]
            m["say"] = VV.emote_say(voice, plan["emote"])
        else:
            m["say"] = HANGUL.get(plan["id"], "")
        markers[plan["id"]] = m
        parts += [y, np.zeros(S.n_of(GAP))]
        pos += len(y) + S.n_of(GAP)
    x = np.concatenate(parts)
    return x, markers


# ----------------------------------------------------------------------------- encode + manifest
def encode(voice, x):
    os.makedirs(OUT, exist_ok=True)
    key = f"voice_{voice}"
    wav = os.path.join(CACHE, "sprites", key + ".wav")
    os.makedirs(os.path.dirname(wav), exist_ok=True)
    S.write_wav(wav, x)
    ogg, mp3 = os.path.join(OUT, key + ".ogg"), os.path.join(OUT, key + ".mp3")
    gain = 0.0
    for _ in range(4):                       # codecs can overshoot the source peak: trim if needed
        F.encode_ogg(wav, ogg, 1, OGG_Q, gain)
        F.encode_mp3(wav, mp3, 1, MP3_KBPS, gain)
        pk = max(LD.peak_db(F.decode(ogg, 1)[0]), LD.peak_db(F.decode(mp3, 1)[0]))
        if pk <= -1.0:
            break
        gain += -1.15 - pk
    return key, gain


def first_onset(x, thr=0.02):
    """time (s) of the first sample above thr: the runtime compares it with the decoded buffer to detect
    decoders that add a start delay (mp3 without gapless support)."""
    i = int(np.argmax(np.abs(x) > thr))
    return round(i / S.SR, 5)


def clip_levels(path, markers):
    """active loudness of every marker, measured on the decoded file."""
    d = F.decode(path, 1)[0]
    out = {}
    for k, m in markers.items():
        a, b = int(round(m["start"] * S.SR)), int(round((m["start"] + m["dur"]) * S.SR))
        out[k] = LD.active_lufs(d[a:b])
    return out


def write_lexicon_js(lex):
    os.makedirs(SRC, exist_ok=True)
    words = {}
    for w in lex["words"]:
        words[w["id"]] = {"hangul": w["hangul"], "roman": w["roman"], "ko": w["ko"], "en": w["en"], "cat": w["cat"],
                          "kw": w.get("kw", [])}
    body = json.dumps(words, ensure_ascii=False, indent=1)
    js = ("// GENERATED by tools/voice/build_voice.py from tools/voice/lexicon.json - do not edit by hand.\n"
          "// 눈꽃말 (the village language): word id -> hangul spelling, romanisation, meaning, category and the\n"
          "// Korean stems (kw) that make VillageVoice say this word when a bubble contains them.\n"
          f"export const LANGUAGE = {{ name: '{lex['name']}', roman: '{lex['roman']}' }};\n"
          f"export const WORDS = {body};\n")
    with open(os.path.join(SRC, "lexicon.js"), "w", encoding="utf-8") as f:
        f.write(js)


def write_manifest(sprites, levels, gains):
    audio, vtable = {}, {}
    for voice, (x, markers, key) in sprites.items():
        lv = levels[voice]
        words = [lv[k] for k, m in markers.items() if m["kind"] != "emote"]
        file_level = float(np.median(words))
        vol = round(min(1.0, max(0.05, S.undb(EFFECTIVE - file_level))), 3)
        gl = F.mp3_gapless(os.path.join(OUT, key + ".mp3"))
        audio[key] = {"files": [f"voice/{key}.ogg", f"voice/{key}.mp3"], "volume": vol, "loop": False, "kind": "sfx",
                      "duration": round(len(x) / S.SR, 5), "samples": int(len(x)),
                      "mp3StartPad": (gl[0] + 529) if gl else 1105, "onset": first_onset(x), "voiceType": voice, "sprite": True,
                      "markers": markers}
        v = VV.VOICES[voice]
        vtable[voice] = {"key": key, "ko": v["ko"], "en": v["en"], "desc": v["desc"], "f0": v["f0"],
                         "alpha": v["alpha"], "speed": v["speed"], "breath": v["breath"], "range": v["range"],
                         "laugh": v["laugh"]}
    man = {"version": 1,
           "generator": "tools/voice/build_voice.py (눈꽃말: eSpeak NG articulation -> WORLD vocoder voices; "
                        "loudness matched to assets/audio2 chatter)",
           "language": "눈꽃말",
           "notes": "Audio sprites: play a marker with source.start(when, start, dur). Not loaded at boot: "
                    "Assets.loadFragment(scene, 'voice', {audio: [keys...]}). Runtime: src/voice/VillageVoice.js. "
                    "`onset` = time of the first sound: if a decoded file has it later (an mp3 decoder that ignores "
                    "the LAME gapless tag adds ~mp3StartPad samples), shift every marker by the difference.",
           "audio": audio, "audioGroups": {}, "voices": vtable}
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write("\n")
    return man


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--voices", default="", help="comma-separated voice types to rebuild (default: all)")
    ap.add_argument("--no-check", action="store_true")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--lexicon-only", action="store_true", help="only regenerate src/voice/lexicon.js")
    a = ap.parse_args()
    probs = P.check()
    if probs:
        sys.exit("lexicon problems:\n  " + "\n  ".join(probs))
    lex = P.load_lexicon()
    if a.lexicon_only:
        write_lexicon_js(lex)
        print("wrote src/voice/lexicon.js")
        return
    want = [v.strip() for v in a.voices.split(",") if v.strip()] or list(VV.VOICES)
    bad = [v for v in want if v not in VV.VOICES]
    if bad:
        sys.exit(f"unknown voices {bad}; known: {list(VV.VOICES)}")
    t0 = time.time()
    code = _code_hash()
    print(f"[1/4] rendering clips ({len(VV.VOICES)} voices, code {code}) ...", flush=True)
    clips = {}
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        for voice, res, line in ex.map(_render_voice, [(v, code) for v in VV.VOICES]):
            clips[voice] = res
            print(line, flush=True)
    print("[2/4] sprites + encoding ...", flush=True)
    sprites, levels, gains = {}, {}, {}
    man_path = os.path.join(OUT, "manifest.json")
    old = {}
    if os.path.exists(man_path):
        with open(man_path, encoding="utf-8") as f:
            old = json.load(f).get("audio", {})
    for voice in VV.VOICES:
        x, markers = build_sprite(voice, clips[voice])
        key = f"voice_{voice}"
        if voice in want or key not in old:
            key, gains[voice] = encode(voice, x)
        sprites[voice] = (x, markers, key)
        levels[voice] = clip_levels(os.path.join(OUT, key + ".ogg"), markers)
    print("[3/4] manifest + lexicon.js ...", flush=True)
    man = write_manifest(sprites, levels, gains)
    write_lexicon_js(lex)
    import make_dictionary
    make_dictionary.main()
    total = 0
    print(f"  {'key':18s} {'clips':>5s} {'dur':>6s} {'vol':>6s} {'ogg KB':>7s} {'mp3 KB':>7s}")
    for key, e in man["audio"].items():
        so = os.path.getsize(os.path.join(OUT, key + ".ogg"))
        sm = os.path.getsize(os.path.join(OUT, key + ".mp3"))
        total += so + sm
        print(f"  {key:18s} {len(e['markers']):5d} {e['duration']:6.2f} {e['volume']:6.3f} {so / 1024:7.1f} {sm / 1024:7.1f}")
    total += os.path.getsize(man_path)
    print(f"  payload {total:,} bytes ({total / 1e6:.2f} MB, limit 4 MB)   [{time.time() - t0:.0f}s]")
    if not a.no_check:
        print("[4/4] check_voice.py ...", flush=True)
        import check_voice
        sys.exit(check_voice.main([]))


if __name__ == "__main__":
    main()
