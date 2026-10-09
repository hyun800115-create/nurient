"""눈꽃말 voices - render the runtime demo (tools/voice/demo.mjs events) to docs/previews/voice_demo.mp3.

    node tools/voice/demo.mjs && python3 tools/voice/demo_mix.py
Every clip is cut from the shipped sprite (assets/voice/*.ogg, as the game decodes it), resampled by the
runtime's playback rate, scaled by the clip gain x channel gain (distance / fades) and panned per speaker.
Bed: amb_wind at the game's ratio to the voices (the runtime's 0.4 voice bus vs Audio.setAmbience 0.5)
throughout; the dog (sfx_dog_bark) answers the kids; bgm_village fades in for the last ~12 s at the
game's music ratio, to hear how the voices sit behind the music. The whole mix is normalised to
-16 LUFS (peak <= -1 dBFS). Also writes docs/previews/voice_demo.txt (what is said when).
"""
from __future__ import annotations

import json
import os
import sys
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
sys.path.insert(0, os.path.join(HERE, "..", "audio"))
import numpy as np  # noqa: E402
from scipy.signal import resample_poly  # noqa: E402

import ffmpeg_tools as F  # noqa: E402
import synth as S  # noqa: E402
import voices as VV  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
PREV = os.path.join(ROOT, "docs", "previews")
SR = 44100
VOICE_BUS = 0.4            # VillageVoice baseGain in the game (the demo ran with 1)


def chan_gain(events, ch, t):
    """channel gain at time t from setChannelGain events (linear ramps)."""
    g, prev_t, prev_g = 1.0, -1.0, 1.0
    for e in events:
        if e["ch"] != ch:
            continue
        if e["t"] > t:
            break
        start = prev_g if prev_t >= 0 else e["g"]
        end_t = e["t"] + max(e["ramp"], 1e-4)
        g = e["g"] if t >= end_t else start + (e["g"] - start) * (t - e["t"]) / (end_t - e["t"])
        prev_t, prev_g = e["t"], g
    return g


def varispeed(seg, rate):
    if abs(rate - 1) < 1e-4:
        return seg
    fr = Fraction(rate).limit_denominator(400)
    return resample_poly(seg, fr.denominator, fr.numerator)


def place(buf, x, t, gain, pan=0.0):
    i = int(round(t * SR))
    if i < 0:
        x, i = x[-i:], 0
    n = min(len(x), buf.shape[1] - i)
    if n <= 0:
        return
    th = (pan + 1) * np.pi / 4
    buf[0, i:i + n] += x[:n] * gain * np.cos(th)
    buf[1, i:i + n] += x[:n] * gain * np.sin(th)


def main():
    ev_path = os.path.join(HERE, "_cache", "demo_events.json")
    if not os.path.exists(ev_path):
        sys.exit("run `node tools/voice/demo.mjs` first")
    ev = json.load(open(ev_path, encoding="utf-8"))
    man = json.load(open(os.path.join(ASSETS, "voice", "manifest.json"), encoding="utf-8"))
    sprites = {k: F.decode(os.path.join(ASSETS, e["files"][0]), 1)[0] for k, e in man["audio"].items()}
    end = max(p["when"] + p["dur"] / p["rate"] for p in ev["plays"]) + 1.5
    mix = np.zeros((2, int(end * SR) + SR))
    chan = ev["chan"]
    for p in ev["plays"]:
        x = sprites[p["key"]]
        a = int(round(p["off"] * SR))
        seg = x[a:a + int(round(p["dur"] * SR))]
        seg = varispeed(seg, p["rate"])
        if p["stop"] is not None and p["stop"] < p["when"] + len(seg) / SR:
            k = max(0, int((p["stop"] - p["when"]) * SR))
            seg = seg[:k].copy()
            nf = min(len(seg), int(0.04 * SR))
            if nf:
                seg[-nf:] *= np.linspace(1, 0, nf)
        g = p["gain"] * chan_gain(chan, p["ch"], p["when"]) * VOICE_BUS
        pan = ev["lines"][p["line"]]["pan"] if p.get("line") is not None else 0.0
        place(mix, seg, p["when"], g, pan)
    voices_only = mix.copy()
    # ---- bed: wind (game ratio), the dog, music for the last part
    am = json.load(open(os.path.join(ASSETS, "audio", "manifest.json")))["audio"]
    a2 = json.load(open(os.path.join(ASSETS, "audio2", "manifest.json")))["audio"]
    wind = F.decode(os.path.join(ASSETS, "audio", "amb_wind.ogg"), 1)[0]
    reps = int(np.ceil(mix.shape[1] / len(wind)))
    wb = np.tile(wind, reps)[:mix.shape[1]] * am["amb_wind"]["volume"] * 0.5
    wb *= S.env_pts([(0, 0), (1.5, 1), (end - 1, 1), (end + 1, 0)], mix.shape[1])
    mix += np.stack([wb, wb]) * 0.95
    dog = F.decode(os.path.join(ASSETS, "audio2", "sfx_dog_bark.ogg"), 1)[0]
    for i, t in enumerate(ev["dog"]):
        place(mix, dog, t, a2["sfx_dog_bark"]["volume"] * 0.5, 0.15 - 0.1 * i)
    bgm = F.decode(os.path.join(ASSETS, "audio", "bgm_village.ogg"), 2)
    m0 = 50.5
    n0 = int(m0 * SR)
    nm = min(bgm.shape[1], mix.shape[1] - n0)
    fade = S.env_pts([(0, 0), (2.5, 1), (nm / SR - 1.2, 1), (nm / SR, 0)], nm)
    mix[:, n0:n0 + nm] += bgm[:, :nm] * am["bgm_village"]["volume"] * fade
    # ---- master
    L = S.lufs(mix)
    g = S.undb(-16.0 - L)
    out = S.limiter(mix * g, -1.6, 5.0)
    out = S.fade(out, 0.01, 0.6)
    wav = os.path.join(HERE, "_cache", "voice_demo.wav")
    S.write_wav(wav, out)
    dst = os.path.join(PREV, "voice_demo.mp3")
    F.encode_mp3(wav, dst, 2, 128)
    # transcript
    ko = {t: v["ko"] for t, v in VV.VOICES.items()}
    lines = ["눈꽃말 voice demo (docs/previews/voice_demo.mp3) - played by the real runtime (src/voice/VillageVoice.js)",
             "말풍선(한국어) -> 실제로 들리는 눈꽃말 (emo_* = 감정 소리)", ""]
    for ln in ev["lines"]:
        state = "" if ln["spoken"] else "  (dropped)"
        lines.append(f"{ln['at']:5.1f}s  {ko.get(ln['voice'], ln['voice']):10s}  {ln['text']}\n        -> {ln['say']}{state}")
    lines += ["", f"runtime stats: {json.dumps(ev['stats'])}",
              "0-26 s: every voice says hello + something in character; 27 s-: the snowy-day scene;"
              " from 50 s the village music fades in at the game's level (voices sit behind it, like in the game).",
              f"mix: voices + wind bed, normalised to -16 LUFS; voices-only loudness before normalising {S.lufs(voices_only):.1f} LUFS"]
    with open(os.path.join(PREV, "voice_demo.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    m = F.ebur128(dst, 2)
    print(f"voice_demo.mp3: {out.shape[1] / SR:.1f} s, {m['I']:.1f} LUFS, peak {m['peak']:.1f} dBFS, "
          f"{os.path.getsize(dst) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
