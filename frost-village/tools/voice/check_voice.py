"""눈꽃말 voices - QA of assets/voice (levels, peaks, clipping, DC, clicks, durations, sizes, manifest, language).

    python3 tools/voice/check_voice.py            # prints the table, writes docs/previews/voice_report.txt
                                                  # + docs/previews/voice_spectrograms.png; exit 1 on failure
Checks
  manifest   10 voice sprites voice_<type> {files [ogg, mp3], volume, loop false, kind, duration, samples,
             mp3StartPad, voiceType, markers}, `voices` table, same core words / 3 fillers / 3 particles /
             10 emotes in every voice, markers inside the sprite, gaps >= 40 ms, every word in lexicon.js
  files      both formats exist, decode, ogg length == samples (+-5 ms), mp3 length (gapless) likewise
  levels     decoded peak <= -1.0 dBFS (ogg + mp3), no clipped samples, |DC| per clip < 0.003, clip edges
             quiet (no clicks), gaps between clips silent (< -50 dBFS 8 ms away from the clips: no bleed between markers),
             active loudness of words within +-1.5 dB of the voice median (emotes +-2.5 dB), effective level
             (median word + 20 log10 volume) within +-1 dB of the old chatter (assets/audio2 sfx_chatter_*)
  timing     words 0.1..0.9 s with median 0.15..0.6 s, emotes 0.15..1.4 s
  tone       energy above 6 kHz per clip (never harsh), pitch (median F0 per voice vs its base, melodic
             range per clip in semitones)
  size       payload (all files + manifest) <= 4,000,000 bytes
  language   lexicon rules (phonology.check: no Minionese / Simlish lookalikes, every content word has a
             not-Japanese marker), lexicon.js in sync, syllable statistics of what the voices say
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
import warnings

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import deps  # noqa: E402

deps.ensure()
sys.path.insert(0, os.path.join(HERE, "..", "audio"))
import numpy as np  # noqa: E402

import ffmpeg_tools as F  # noqa: E402
import loudness as LD  # noqa: E402
import phonology as P  # noqa: E402
import voices as VV  # noqa: E402

with warnings.catch_warnings():
    warnings.simplefilter("ignore")
    import pyworld as pw  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(ROOT, "assets")
OUT = os.path.join(ASSETS, "voice")
PREV = os.path.join(ROOT, "docs", "previews")
SR = 44100
LIMIT = 4_000_000


class Report:
    def __init__(self):
        self.lines, self.fails, self.warns = [], [], []

    def ok(self, cond, msg, warn=False):
        if not cond:
            (self.warns if warn else self.fails).append(msg)
        return cond

    def p(self, s=""):
        self.lines.append(s)
        print(s)


def chatter_reference():
    man = json.load(open(os.path.join(ASSETS, "audio2", "manifest.json")))["audio"]
    vals = []
    for k in sorted(man):
        if re.match(r"sfx_chatter_\d$", k):
            x = F.decode(os.path.join(ASSETS, "audio2", k + ".ogg"), 1)[0]
            vals.append(LD.active_lufs(x) + 20 * np.log10(man[k]["volume"]))
    return float(np.mean(vals)), vals


def f0_of(y):
    f0, _ = pw.harvest(np.ascontiguousarray(y, dtype=np.float64), SR, f0_floor=70, f0_ceil=1100, frame_period=5)
    return f0[f0 > 0]


def hf_share(y, f_lo=6000.0):
    s = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2
    f = np.fft.rfftfreq(len(y), 1 / SR)
    return float(s[f > f_lo].sum() / max(s.sum(), 1e-20))


def spectrogram_sheet(man, path):
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        return False
    rows = []
    pxs, h, fmax, n = 80, 110, 11000, 1024
    for key, e in man["audio"].items():
        x = F.decode(os.path.join(ASSETS, e["files"][0]), 1)[0]
        hop = SR // pxs
        xp = np.pad(x, (n, n))
        w = np.hanning(n)
        M = np.array([np.abs(np.fft.rfft(xp[i:i + n] * w)) for i in range(0, len(x) + n, hop)]).T
        M = 20 * np.log10(M + 1e-9)[: int(fmax / (SR / n))][::-1]
        M = np.clip((M - M.max() + 70) / 70, 0, 1)
        im = Image.fromarray((M * 255).astype(np.uint8)).resize((M.shape[1], h)).convert("RGB")
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 150, 11], fill=(30, 30, 40))
        d.text((2, 0), f"{key}  {e['duration']:.1f}s", fill=(255, 230, 120))
        for k, m in e["markers"].items():
            X = int(m["start"] * pxs)
            d.line([(X, 12), (X, 20)], fill=(255, 90, 90))
            d.text((X + 1, 12), k.replace("emo_", "!")[:7], fill=(160, 220, 255))
        rows.append(im)
    W = max(r.width for r in rows)
    out = Image.new("RGB", (W, sum(r.height + 4 for r in rows)), (16, 18, 24))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 4
    out.quantize(colors=48).save(path, optimize=True)
    return True


def main(argv=None):
    R = Report()
    man_path = os.path.join(OUT, "manifest.json")
    if not os.path.exists(man_path):
        print("assets/voice/manifest.json missing - run tools/voice/build_voice.py")
        return 1
    man = json.load(open(man_path, encoding="utf-8"))
    lex = P.load_lexicon()
    lexw = {w["id"]: w for w in lex["words"]}
    R.p("눈꽃말 voices - QA")
    R.p("=" * 100)
    # ---------------------------------------------------------------- manifest
    want_keys = [f"voice_{t}" for t in VV.VOICES]
    R.ok(sorted(man.get("audio", {})) == sorted(want_keys), f"audio keys {sorted(man.get('audio', {}))}")
    R.ok(set(man.get("voices", {})) == set(VV.VOICES), "voices table")
    others = set()
    for mp in glob.glob(os.path.join(ASSETS, "audio*", "manifest.json")):
        j = json.load(open(mp))
        others |= set(j.get("audio", {})) | set(j.get("audioGroups", {}))
    R.ok(not (others & set(want_keys)), f"key clash with other audio fragments: {others & set(want_keys)}")
    core = None
    for t in VV.VOICES:
        e = man["audio"].get(f"voice_{t}")
        if not e:
            continue
        for f in ("files", "volume", "loop", "kind", "duration", "samples", "mp3StartPad", "voiceType", "markers"):
            R.ok(f in e, f"voice_{t}: field {f} missing")
        R.ok(e["files"] == [f"voice/voice_{t}.ogg", f"voice/voice_{t}.mp3"], f"voice_{t}: files {e['files']}")
        R.ok(e["loop"] is False and 0.05 <= e["volume"] <= 1.0, f"voice_{t}: loop/volume")
        ws = {k for k, m in e["markers"].items() if m["kind"] == "word"}
        core = ws if core is None else core & ws
        kinds = {}
        for k, m in e["markers"].items():
            kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
            if m["kind"] != "emote":
                R.ok(k in lexw, f"voice_{t}/{k}: not in lexicon")
        R.ok(kinds.get("filler") == 3 and kinds.get("particle") == 3 and kinds.get("emote") == 10,
             f"voice_{t}: clip kinds {kinds}")
        for emo in VV.EMOTES:
            R.ok(e["markers"].get("emo_" + emo, {}).get("emote") == emo, f"voice_{t}: emote {emo}")
        ms = sorted(e["markers"].values(), key=lambda m: m["start"])
        for a, b in zip(ms, ms[1:]):
            R.ok(a["start"] + a["dur"] + 0.04 <= b["start"] + 1e-6, f"voice_{t}: gap < 40 ms")
        R.ok(ms[-1]["start"] + ms[-1]["dur"] <= e["duration"] + 1e-6, f"voice_{t}: marker past the end")
        R.ok(abs(e["duration"] * SR - e["samples"]) < 2, f"voice_{t}: duration vs samples")
    R.ok(core is not None and set(VV.CORE_WORDS) <= core, f"core words missing in some voice: {set(VV.CORE_WORDS) - (core or set())}")
    # lexicon.js in sync
    js = open(os.path.join(ROOT, "src", "voice", "lexicon.js"), encoding="utf-8").read()
    jw = json.loads(js[js.index("export const WORDS = ") + len("export const WORDS = "):].rstrip().rstrip(";"))
    R.ok(set(jw) == set(lexw) and all(jw[k]["hangul"] == lexw[k]["hangul"] and jw[k]["kw"] == lexw[k].get("kw", []) for k in jw),
         "src/voice/lexicon.js out of date - rebuild")
    for prob in P.check(lex):
        R.ok(False, "lexicon: " + prob)
    # ---------------------------------------------------------------- audio
    ref, refs = chatter_reference()
    R.p(f"old chatter effective level (active LUFS + 20log10 volume): {ref:.2f}  ({', '.join(f'{v:.1f}' for v in refs)})")
    R.p("")
    hdr = (f"{'key':16s} {'clips':>5s} {'dur s':>6s} {'vol':>6s} {'eff':>6s} {'spread':>6s} {'peak ogg/mp3':>13s} "
           f"{'DC max':>7s} {'gap dB':>7s} {'edge':>6s} {'>6k %':>6s} {'F0 Hz':>6s} {'(base)':>6s} {'range st':>8s} {'KB':>6s}")
    R.p(hdr)
    R.p("-" * len(hdr))
    total = os.path.getsize(man_path)
    all_words, all_emotes, f0r_all = [], [], []
    for key, e in man["audio"].items():
        ogg, mp3 = os.path.join(ASSETS, e["files"][0]), os.path.join(ASSETS, e["files"][1])
        if not R.ok(os.path.exists(ogg) and os.path.exists(mp3), f"{key}: files missing"):
            continue
        size = os.path.getsize(ogg) + os.path.getsize(mp3)
        total += size
        xo, xm = F.decode(ogg, 1)[0], F.decode(mp3, 1)[0]
        R.ok(abs(len(xo) - e["samples"]) <= SR * 0.005, f"{key}: ogg length {len(xo)} vs samples {e['samples']}")
        R.ok(abs(len(xm) - e["samples"]) <= SR * 0.005, f"{key}: mp3 length {len(xm)} vs samples {e['samples']}", warn=True)
        pk_o, pk_m = LD.peak_db(xo), LD.peak_db(xm)
        R.ok(max(pk_o, pk_m) <= -1.0, f"{key}: peak {pk_o:.2f}/{pk_m:.2f} dBFS")
        R.ok(int(np.sum(np.abs(xo) >= 0.999)) == 0 and int(np.sum(np.abs(xm) >= 0.999)) == 0, f"{key}: clipped samples")
        lv, dcs, edges, hfs, f0m, f0r = {}, [], [], [], [], []
        ms = sorted(e["markers"].items(), key=lambda kv: kv[1]["start"])
        gap_max = -120.0
        prev_end = 0
        for k, m in ms:
            a, b = int(round(m["start"] * SR)), int(round((m["start"] + m["dur"]) * SR))
            y = xo[a:b]
            if a - prev_end > 800:                       # middle of the gap (codec pre-echo hugs the clips)
                g = xo[prev_end + 350:a - 350]
                if len(g):
                    gap_max = max(gap_max, LD.peak_db(g))
            prev_end = b
            lv[k] = LD.active_lufs(y)
            dcs.append(abs(float(np.mean(y))))
            n2 = int(0.002 * SR)
            edges.append(max(float(np.max(np.abs(y[:n2]))), float(np.max(np.abs(y[-n2:])))))
            hfs.append(hf_share(y))
            f = f0_of(y)
            if len(f) >= 4:
                f0m.append(float(np.median(f)))
                st = 12 * np.log2(f / np.median(f))
                f0r.append(float(np.percentile(st, 95) - np.percentile(st, 5)))
            dur_ok = (0.1 <= m["dur"] <= 0.9) if m["kind"] != "emote" else (0.15 <= m["dur"] <= 1.4)
            R.ok(dur_ok, f"{key}/{k}: duration {m['dur']:.3f}")
            (all_emotes if m["kind"] == "emote" else all_words).append(m["dur"])
        words = [lv[k] for k, m in e["markers"].items() if m["kind"] != "emote"]
        med = float(np.median(words))
        spread = max(abs(v - med) for v in words)
        espread = max(abs(lv[k] - med) for k, m in e["markers"].items() if m["kind"] == "emote")
        eff = med + 20 * np.log10(e["volume"])
        R.ok(spread <= 1.5, f"{key}: word loudness spread {spread:.2f} dB")
        R.ok(espread <= 2.5, f"{key}: emote loudness spread {espread:.2f} dB")
        R.ok(abs(eff - ref) <= 1.0, f"{key}: effective level {eff:.2f} vs chatter {ref:.2f}")
        R.ok(max(dcs) < 0.003, f"{key}: DC {max(dcs):.4f}")
        R.ok(gap_max < -50, f"{key}: sound between clips {gap_max:.1f} dBFS")
        R.ok(max(edges) < 0.03, f"{key}: clip edge {max(edges):.3f} (click risk)")
        R.ok(max(hfs) < 0.08, f"{key}: energy above 6 kHz {max(hfs) * 100:.1f} %")
        base = VV.VOICES[e["voiceType"]]["f0"]
        R.ok(0.85 * base <= np.median(f0m) <= 1.35 * base, f"{key}: median F0 {np.median(f0m):.0f} vs base {base}")
        f0r_all += f0r
        R.p(f"{key:16s} {len(ms):5d} {e['duration']:6.2f} {e['volume']:6.3f} {eff:6.2f} {spread:6.2f} "
            f"{pk_o:6.2f}/{pk_m:6.2f} {max(dcs):7.4f} {gap_max:7.1f} {max(edges):6.3f} {max(hfs) * 100:6.2f} "
            f"{np.median(f0m):6.0f} {base:6d} {np.median(f0r):8.1f} {size / 1024:6.1f}")
    R.p("-" * len(hdr))
    w = np.array(all_words)
    R.ok(0.15 <= np.median(w) <= 0.6, f"median word {np.median(w):.3f}")
    R.p(f"word clips {len(w)}: {w.min():.2f}..{w.max():.2f} s (median {np.median(w):.2f}); emotes {len(all_emotes)}: "
        f"{min(all_emotes):.2f}..{max(all_emotes):.2f} s; melodic range per clip median {np.median(f0r_all):.1f} st "
        f"(p90 {np.percentile(f0r_all, 90):.1f})")
    R.ok(total <= LIMIT, f"payload {total} > {LIMIT}")
    R.p(f"payload {total:,} bytes ({total / 1e6:.2f} MB of 4 MB), {len(man['audio']) * 2} files + manifest")
    # ---------------------------------------------------------------- language
    spoken = set()
    for e in man["audio"].values():
        spoken |= {k for k, m in e["markers"].items() if m["kind"] != "emote"}
    st_all = P.stats([lexw[k]["roman"] for k in spoken])
    st_lex = P.stats([w["roman"] for w in lex["words"]])
    R.p("")
    R.p(f"language: {len(lex['words'])} words in the dictionary, {len(spoken)} recorded somewhere in the village")
    R.p(f"  recorded words: {st_all['syllables']} syllables, closed {st_all['closed'] * 100:.0f} %, onset clusters "
        f"{st_all['cluster'] * 100:.0f} %, vowels outside a/e/i/o/u {st_all['nonJaVowel'] * 100:.0f} %")
    R.p(f"  whole dictionary: closed {st_lex['closed'] * 100:.0f} %, clusters {st_lex['cluster'] * 100:.0f} %, "
        f"non-a/e/i/o/u {st_lex['nonJaVowel'] * 100:.0f} %   (old chatter / Japanese-like babble: 0 % / 0 % / 0 %)")
    R.ok(st_all["closed"] >= 0.5, "closed syllables < 50 %")
    # ---------------------------------------------------------------- previews
    sheet = os.path.join(PREV, "voice_spectrograms.png")
    if spectrogram_sheet(man, sheet):
        R.p(f"spectrograms: {os.path.relpath(sheet, ROOT)}")
    R.p("")
    for wmsg in R.warns:
        R.p("WARN " + wmsg)
    for fmsg in R.fails:
        R.p("FAIL " + fmsg)
    R.p("RESULT: " + ("OK" if not R.fails else f"{len(R.fails)} FAILURES"))
    os.makedirs(PREV, exist_ok=True)
    with open(os.path.join(PREV, "voice_report.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(R.lines) + "\n")
    return 0 if not R.fails else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
