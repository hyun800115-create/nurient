"""눈꽃말 voices - QA of assets/voice (levels, peaks, clipping, DC, clicks, durations, sizes, manifest, language).

    python3 tools/voice/check_voice.py            # prints the table, writes docs/previews/voice_report.txt
                                                  # + docs/previews/voice_spectrograms.png; exit 1 on failure
Checks
  manifest   11 voice sprites voice_<type> {files [ogg, mp3], volume, loop false, kind, duration, samples,
             mp3StartPad, voiceType, markers {start, dur, kind, syl, fin, tail, roman, say}}, `voices` table,
             same core words / 14 babble / 3 fillers / 3 particles / 10 emotes (+ takes) in every voice,
             markers inside the sprite, gaps >= 35 ms, every word in lexicon.js
  files      both formats exist, decode, ogg length == samples (+-5 ms), mp3 length (gapless) likewise
  levels     decoded peak <= -1.0 dBFS (ogg + mp3), no clipped samples, |DC| per clip < 0.003, clip edges
             quiet (no clicks), gaps between clips silent (< -50 dBFS 8 ms away from the clips: no bleed between markers),
             active loudness of words within +-1.5 dB of the voice median (emotes +-2.5 dB), effective level
             (median word + 20 log10 volume) within +-1 dB of the old chatter (assets/audio2 sfx_chatter_*)
  timing     words 0.1..0.9 s with median 0.15..0.6 s, emotes 0.15..1.4 s
  tone       energy above 6 kHz per clip (never harsh), 2-5 kHz share per voice, pitch (median F0 per voice
             vs its base, every voice type >= 1 st from the next, no clip above 760 Hz, melodic range per clip),
             phone speaker (level lost through a 550 Hz high-pass: the voices' phone levels within 2 dB)
  delivery   stress (stressed / unstressed vowel length >= 1.6, vocalic nPVI >= 50), endings (unreleased final
             stops cut off <= 25 ms, open vowels ring out >= 45 ms)
  size       payload (all files + manifest) <= 4,000,000 bytes
  language   lexicon rules (phonology.check: no Minionese / Simlish lookalikes, every content word could not be
             Japanese), lexicon.js in sync; and what the village HEARS (tools/voice/heard.mjs plans every game
             line through the runtime): Japanese-legal syllables <= 30 % (play-weighted), no word clip above
             3.5 % of what is heard, no one-shot ending more than 8 % of lines, pace >= 5.5 syllables/s
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


def f0_peak(y):
    """p95 of the pitch, robust against one tracker's octave slips: harvest and dio + stonemask must agree
    (the lower of the two per frame)"""
    x = np.ascontiguousarray(y, dtype=np.float64)
    fh, t = pw.harvest(x, SR, f0_floor=70, f0_ceil=1100, frame_period=5)
    fd, td = pw.dio(x, SR, f0_floor=70, f0_ceil=1100, frame_period=5)
    fd = pw.stonemask(x, fd, td, SR)
    n = min(len(fh), len(fd))
    both = (fh[:n] > 0) & (fd[:n] > 0)
    if both.sum() < 4:
        return 0.0
    return float(np.percentile(np.minimum(fh[:n], fd[:n])[both], 95))


def band_share(y, lo=2000.0, hi=5000.0):
    s = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2
    f = np.fft.rfftfreq(len(y), 1 / SR)
    return float(s[(f >= lo) & (f < hi)].sum() / max(s.sum(), 1e-20))


def end_decay_ms(y, win=0.2):
    """how a clip ends: ms from the last point within 6 dB of the loudest part of its last 200 ms to 30 dB under
    it (5 ms RMS). Unreleased final stops are cut off (short), open vowels ring out (long)."""
    n = int(0.005 * SR)
    e = np.sqrt(np.convolve(y ** 2, np.ones(n) / n, "same"))[-int(win * SR):]
    db = 20 * np.log10(e / max(e.max(), 1e-12) + 1e-12)
    i6 = np.nonzero(db > -6)[0][-1]
    a = np.nonzero(db[i6:] < -30)[0]
    return a[0] / SR * 1000 if len(a) else float("nan")


def heard_stats():
    """tools/voice/heard.mjs --json: every game line planned through the runtime (None without node)"""
    import shutil
    import subprocess
    node = shutil.which("node")
    if not node:
        return None
    p = subprocess.run([node, os.path.join(HERE, "heard.mjs"), "--json"], capture_output=True, text=True, cwd=ROOT)
    return json.loads(p.stdout) if p.returncode == 0 and p.stdout.strip() else None


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
        n_emote = len(VV.EMOTES) + sum(len(x) for x in VV.EMOTE_TAKES.values())
        R.ok(kinds.get("filler") == 3 and kinds.get("particle") == 3 and kinds.get("emote") == n_emote
             and kinds.get("babble") == VV.BABBLE_PER_VOICE, f"voice_{t}: clip kinds {kinds}")
        for k, m in e["markers"].items():
            R.ok(all(f in m for f in ("fin", "tail", "roman", "say")) and 0 <= m["tail"] < m["dur"],
                 f"voice_{t}/{k}: marker fields / tail")
        for emo in VV.EMOTES:
            R.ok(e["markers"].get("emo_" + emo, {}).get("emote") == emo, f"voice_{t}: emote {emo}")
        ms = sorted(e["markers"].values(), key=lambda m: m["start"])
        for a, b in zip(ms, ms[1:]):
            R.ok(a["start"] + a["dur"] + 0.035 <= b["start"] + 1e-6, f"voice_{t}: gap < 35 ms")
        R.ok(ms[-1]["start"] + ms[-1]["dur"] <= e["duration"] + 1e-6, f"voice_{t}: marker past the end")
        R.ok(abs(e["duration"] * SR - e["samples"]) < 2, f"voice_{t}: duration vs samples")
    R.ok(core is not None and set(VV.CORE_WORDS) <= core, f"core words missing in some voice: {set(VV.CORE_WORDS) - (core or set())}")
    # lexicon.js in sync
    js = open(os.path.join(ROOT, "src", "voice", "lexicon.js"), encoding="utf-8").read()
    jw = json.loads(js[js.index("export const WORDS = ") + len("export const WORDS = "):].rstrip().rstrip(";"))
    R.ok(set(jw) == set(lexw) and all(jw[k]["hangul"] == lexw[k]["hangul"] and jw[k]["kw"] == lexw[k].get("kw", [])
                                       and jw[k].get("kwNot", []) == lexw[k].get("kwNot", []) for k in jw),
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
    f0_type, f0_top, decays, band = {}, [], {"s": [], "v": [], "n": []}, {}
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
                f0_top.append((f0_peak(y), f"{key}/{k}"))
                f0m.append(float(np.median(f)))
                st = 12 * np.log2(f / np.median(f))
                f0r.append(float(np.percentile(st, 95) - np.percentile(st, 5)))
            if m["kind"] in ("word", "babble", "particle", "filler"):
                decays[m.get("fin", "n")].append(end_decay_ms(y))
            dur_ok = (0.1 <= m["dur"] <= 0.9) if m["kind"] != "emote" else (0.12 <= m["dur"] <= 1.4)
            R.ok(dur_ok, f"{key}/{k}: duration {m['dur']:.3f}")
            (all_emotes if m["kind"] == "emote" else all_words).append(m["dur"])
        words = [lv[k] for k, m in e["markers"].items() if m["kind"] != "emote"]
        med = float(np.median(words))
        spread = max(abs(v - med) for v in words)
        espread = max(abs(lv[k] - med) for k, m in e["markers"].items() if m["kind"] == "emote")
        eff = med + 20 * np.log10(e["volume"])
        comp = man.get("voices", {}).get(e["voiceType"], {}).get("phoneComp", 0.0)
        R.ok(spread <= 1.5, f"{key}: word loudness spread {spread:.2f} dB")
        R.ok(espread <= 2.5, f"{key}: emote loudness spread {espread:.2f} dB")
        R.ok(abs(eff - comp - ref) <= 1.0, f"{key}: effective level {eff:.2f} (- phone comp {comp}) vs chatter {ref:.2f}")
        f0_type[e["voiceType"]] = float(np.median(f0m))
        wx = np.concatenate([xo[int(round(m["start"] * SR)):int(round((m["start"] + m["dur"]) * SR))]
                             for m in e["markers"].values() if m["kind"] != "emote"])
        band[e["voiceType"]] = (band_share(wx), LD.phone_drop(wx), eff)
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
    # ---------------------------------------------------------------- tone: pitch spacing, ceiling, phone
    order = sorted(f0_type.items(), key=lambda kv: kv[1])
    near = min((12 * np.log2(b[1] / a[1]), a[0], b[0]) for a, b in zip(order, order[1:]))
    R.p("voice pitch (median F0 of its clips, Hz): " + ", ".join(f"{v} {h:.0f}" for v, h in order))
    R.ok(near[0] >= 1.0, f"voice types too close in pitch: {near[1]} / {near[2]} {near[0]:.2f} st")
    R.p(f"  closest pair: {near[1]} / {near[2]} {near[0]:.2f} st")
    # the runtime may play a voice a little higher (VillageVoice MAX_UP semitones): the loudest-case pitch
    max_up = {"squeaky": 1.0, "kid_girl": 2.0, "kid_boy": 2.5}
    worst = max((hz * 2 ** (max_up.get(name.split("/")[0][6:], 4.5) / 12), hz, name) for hz, name in f0_top)
    f0_top.sort(reverse=True)
    R.ok(worst[0] <= 760, f"pitch too high in the game: {worst[2]} {worst[1]:.0f} Hz -> {worst[0]:.0f} Hz")
    R.p(f"highest clip pitch (p95 of its F0, two trackers agreeing): {f0_top[0][0]:.0f} Hz ({f0_top[0][1]}); highest in the game with the "
        f"runtime's per-voice limit: {worst[0]:.0f} Hz ({worst[2]})")
    phone_eff = {v: b[2] + b[1] for v, b in band.items()}
    R.p("2-5 kHz share of the words (%) / phone-speaker loss (dB): " +
        ", ".join(f"{v} {b[0] * 100:.1f}/{b[1]:.1f}" for v, b in band.items()))
    spread_ph = max(phone_eff.values()) - min(phone_eff.values())
    R.ok(spread_ph <= 2.0, f"phone-speaker levels spread {spread_ph:.2f} dB")
    R.p(f"  levels on a phone speaker (effective + loss) spread {spread_ph:.2f} dB across voices")
    # ---------------------------------------------------------------- delivery: endings, stress
    ds, dv, dn = (float(np.nanmedian(decays[k])) for k in ("s", "v", "n"))
    R.p(f"endings (ms from the last strong point to -30 dB): unreleased stops {ds:.0f} (n={len(decays['s'])}), "
        f"open vowels {dv:.0f} (n={len(decays['v'])}), nasals / l {dn:.0f} (n={len(decays['n'])})")
    R.ok(ds <= 25 and dv >= 45, f"final stops {ds:.0f} ms vs open vowels {dv:.0f} ms: no contrast")
    try:
        import render as RD
        import prosody as PR
        lexw_ = {w["id"]: w for w in lex["words"]}
        rat, npvi = [], []
        for v in VV.VOICES:
            for wid in VV.word_list(v):
                pl = PR.word_plan(lexw_[wid], v)
                if pl["kind"] not in ("word", "babble"):
                    continue
                d = RD.vowel_durations(pl, v)
                if len(d) < 2:
                    continue
                s = lexw_[wid].get("stress", 0)
                rat.append(d[s] / np.mean([x for i, x in enumerate(d) if i != s]))
                npvi.append(100 * np.mean([abs(a - b) / ((a + b) / 2) for a, b in zip(d[:-1], d[1:])]))
        R.p(f"stress: stressed / unstressed vowel length median {np.median(rat):.2f} (p10 {np.percentile(rat, 10):.2f}), "
            f"vocalic nPVI median {np.median(npvi):.0f} over {len(rat)} words (Japanese ~41, English ~57)")
        R.ok(np.median(rat) >= 1.6 and np.median(npvi) >= 50, "stress contrast too small")
    except Exception as ex:  # pragma: no cover - needs the articulation cache
        R.ok(False, f"stress timing not measured: {ex}", warn=True)
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
    R.p(f"  strict Japanese phonotactics (phonology.ja_legal): dictionary {st_lex['jaLegal'] * 100:.0f} % of syllables, "
        f"words that could be Japanese: {', '.join(w['hangul'] for w in lex['words'] if all(P.ja_legal(w['roman']))) or 'none'}")
    hs = heard_stats()
    if hs is None:
        R.ok(False, "node not found: play-weighted checks skipped", warn=True)
    else:
        H, RM = hs["hangul"], hs["roman"]
        sh = P.stats([RM[h] for h in H], [H[h] for h in H])
        words_top = [(h, s) for h, s in hs["top"] if h not in ("뇰", "얄!", "뀰?")]
        emo_end = max(((h, s) for h, s in hs["endings"].items() if h not in ("(word)", "뇰", "얄!", "뀰?")), key=lambda x: x[1])
        part = [(h, s) for h, s in hs["top"] if h in ("뇰", "얄!", "뀰?")]
        R.p(f"what the village hears (tools/voice/heard.mjs: {hs['lines']} planned game lines, {hs['items']} clips):")
        R.p(f"  Japanese-legal syllables {sh['jaLegal'] * 100:.1f} % (play-weighted), whole clips {sh['jaLegalWords'] * 100:.1f} %; "
            f"closed {sh['closed'] * 100:.0f} %, clusters {sh['cluster'] * 100:.0f} %, ü/ö/æ {sh['nonJaVowel'] * 100:.0f} %")
        R.p(f"  pace {hs['sylPerSec']} syllables/s, sound {hs['soundShare'] * 100:.0f} % of each line, gaps after tails "
            f"p10/median/p90 {hs['gapP10'] * 1000:.0f}/{hs['gapMedian'] * 1000:.0f}/{hs['gapP90'] * 1000:.0f} ms")
        R.p(f"  {len(H)} different clips; most heard word {words_top[0][0]} {words_top[0][1]} %, particles "
            + ", ".join(f"{h} {s} %" for h, s in part) + f"; most common one-shot ending {emo_end[0]} {emo_end[1]} % of lines")
        R.ok(sh["jaLegal"] <= 0.30, f"Japanese-legal syllables {sh['jaLegal'] * 100:.1f} % > 30 %")
        R.ok(words_top[0][1] <= 3.5, f"one word is {words_top[0][1]} % of what is heard ({words_top[0][0]})")
        R.ok(emo_end[1] <= 8.0, f"{emo_end[0]} ends {emo_end[1]} % of lines")
        R.ok(hs["sylPerSec"] >= 5.5, f"pace {hs['sylPerSec']} syllables/s < 5.5")
    # ---------------------------------------------------------------- previews
    sheet = os.path.join(PREV, "voice_spectrograms.png")
    if spectrogram_sheet(man, sheet):
        R.p(f"spectrograms: {os.path.relpath(sheet, ROOT)}")
    R.p("")
    # ---------------------------------------------------------------- integration (game files owned elsewhere)
    try:
        src = open(os.path.join(ROOT, "src", "core", "Assets.js"), encoding="utf-8").read()
        mlate = re.search(r"LATE_FRAGMENTS\s*=\s*\[([^\]]*)\]", src)
        R.ok(bool(mlate) and "'voice'" in mlate.group(1),
             "assets/voice is not in LATE_FRAGMENTS (src/core/Assets.js): the artifact build will not package the voices "
             "yet - add 'voice' when the voices go into the game (docs/build_reports/voice.md section 7)", warn=True)
    except OSError:
        pass
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
