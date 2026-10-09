"""눈꽃말 (Nunkkot-mal) - phonology of the village language (library + self-check).

Our romanisation (what tools/voice/lexicon.json is written in) is converted here to
  * eSpeak NG phoneme mnemonics of the Finnish table (espeak.py renders them), and
  * an IPA-ish string for the dictionary (docs/눈꽃말_사전.md).

Sound inventory
  vowels      a e i o u, ü [y], ö [ø], ae [æ], eu [ɯ~ə] (the 'ㅡ' in 브/그/르; only in clusters)
              diphthongs ai, oi, au, ui (the second part glides)
  consonants  p b t d k g, m n ng, l r (rolled), f v s sh h, w y(=j), ch
Syllables     (C)(C)V(C) with onset clusters bl pl br pr fl fr gl gr kl kr tr and codas
              m n ng l r p k s. Stress (and the melody peak) on the first syllable unless marked.
Why it does not sound Japanese: Japanese babble is CV CV CV over a i u e o with a flat melody.
눈꽃말 words use closed syllables (-m -ng -l -p -k), onset clusters (bl, pr, fr...), front rounded
vowels (ü, ö) and æ, the rolled r, f / v / l, reduplication (뉘뉘, 뿔룽뿔룽) and a bouncy, sung
melody. check() verifies every content word has at least one syllable that Japanese phonotactics do not
allow (strict rules: see ja_legal; the designer's own 꼬맙뿌 / 촌촌님 / 우와뿅 are kept as they are), and that
every meaningless babble word is mostly non-Japanese syllables.

    python3 tools/voice/phonology.py        # prints every lexicon word: roman -> eSpeak / IPA + markers
"""
from __future__ import annotations

import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))

VOWELS = {"ae": ("&", "æ"), "eu": ("@", "ɯ"), "ü": ("y", "y"), "ö": ("Y", "ø"),
          "a": ("a", "a"), "e": ("e", "e"), "i": ("i", "i"), "o": ("o", "o"), "u": ("u", "u")}
GLIDE2 = {"i": ("I", "i̯"), "u": ("U", "u̯")}           # second part of a diphthong
CONS = {"ng": ("N", "ŋ"), "sh": ("S", "ʃ"), "ch": ("tS", "tʃ"),
        "p": ("p", "p"), "b": ("b", "b"), "t": ("t", "t"), "d": ("d", "d"), "k": ("k", "k"), "g": ("g", "ɡ"),
        "m": ("m", "m"), "n": ("n", "n"), "l": ("l", "l"), "r": ("r", "r"), "f": ("f", "f"), "v": ("v", "v"),
        "s": ("s", "s"), "h": ("h", "h"), "w": ("w", "w"), "y": ("j", "j")}
TOKENS = sorted(list(VOWELS) + list(CONS), key=len, reverse=True)
JA_VOWELS = {"a", "e", "i", "o", "u"}
CLUSTERS = {"bl", "pl", "br", "pr", "fl", "fr", "gl", "gr", "kl", "kr", "tr"}


def tokenize(syl: str):
    out, i = [], 0
    while i < len(syl):
        for tk in TOKENS:
            if syl.startswith(tk, i):
                out.append(tk)
                i += len(tk)
                break
        else:
            raise ValueError(f"cannot read {syl!r} at {syl[i:]!r}")
    return out


def syllables(roman: str):
    """'pul.lung.pul.lung' -> [['p','u','l'], ['l','u','ng'], ...]  (dots = syllable breaks)."""
    return [tokenize(s) for s in roman.lower().replace("-", ".").split(".") if s]


def split_syllable(toks):
    """-> (onset list, nucleus list, coda list)."""
    vi = [i for i, t in enumerate(toks) if t in VOWELS]
    if not vi:
        return toks, [], []          # syllabic consonant run (brrr)
    a, b = vi[0], vi[-1]
    return toks[:a], toks[a:b + 1], toks[b + 1:]


def to_espeak(roman: str, stress: int = 0, secondary: int | None = None) -> str:
    out = []
    for k, toks in enumerate(syllables(roman)):
        on, nu, co = split_syllable(toks)
        s = "".join(CONS[t][0] for t in on)
        mark = "'" if k == stress else ("," if k == secondary else "")
        if nu:
            s += mark + VOWELS[nu[0]][0] + "".join(GLIDE2.get(t, VOWELS.get(t, ("", "")))[0] for t in nu[1:])
        s += "".join(CONS[t][0] for t in co)
        out.append(s)
    return "".join(out)


def to_ipa(roman: str, stress: int = 0) -> str:
    out = []
    for k, toks in enumerate(syllables(roman)):
        on, nu, co = split_syllable(toks)
        s = ("ˈ" if k == stress and len(syllables(roman)) > 1 else "")
        s += "".join(CONS[t][1] for t in on)
        if nu:
            s += VOWELS[nu[0]][1] + "".join(GLIDE2.get(t, VOWELS.get(t, ("", "")))[1] for t in nu[1:])
        s += "".join(CONS[t][1] for t in co)
        out.append(s)
    return ".".join(out)


# ----------------------------------------------------------------------------- "does it sound Japanese?"
# Strict Japanese phonotactics (what a Japanese syllable can be), used to measure how Japanese the village
# sounds. A syllable is Japanese-legal when
#   onset   is empty, one consonant (l counts as Japanese r, f as the f of fu) or a consonant + y (kya, nyo)
#   nucleus uses only a e i o u and eu [ɯ] (= the Japanese u), at most two vowels in a row (ai, oi)
#   coda    is a nasal (m / n / ng = the moraic ん), or a stop before another stop (= the geminate っ:
#           kip.pa, tok.tap), or a stop ending a one-syllable interjection (あっ: at, yap)
# Everything else is not Japanese: l / r / s codas, a word-final stop after the first syllable (ttok.tap̚),
# a stop before a non-stop (kik.lo), onset clusters (bl, pr, fr...), ü / ö / æ, and the trilled brrr.
# Not counted as "not Japanese" any more (polish review): nasal codas, geminate stops, reduplication
# (Japanese mimetics do it: ぽんぽん) and eu, which is the Japanese u.
J_ONSETS = {"", "k", "g", "s", "t", "d", "n", "h", "b", "p", "m", "y", "r", "w", "ch", "sh", "f", "l"}
J_ONSETS |= {c + "y" for c in ("k", "g", "n", "h", "b", "p", "m", "r", "l", "t", "d")}
J_NUCLEUS = {"a", "e", "i", "o", "u", "eu"}
STOP_C = {"p", "t", "k", "ch", "b", "d", "g"}


def ja_legal(roman: str):
    """-> one bool per syllable: True = the syllable could be Japanese (strict rules above)."""
    sy = [split_syllable(t) for t in syllables(roman)]
    out = []
    for i, (on, nu, co) in enumerate(sy):
        nxt = sy[i + 1][0] if i + 1 < len(sy) else None
        vowels = [v for v in nu if v in VOWELS]
        ok = "".join(on) in J_ONSETS and bool(vowels) and len(vowels) <= 2 and all(v in J_NUCLEUS for v in vowels)
        for c in co:
            if c in ("m", "n", "ng"):
                continue                                   # moraic N
            if c in STOP_C and nxt is not None and nxt and nxt[0] in STOP_C:
                continue                                   # geminate (sokuon) before a stop
            if c in STOP_C and nxt is None and len(sy) == 1:
                continue                                   # あっ-like one-syllable interjection
            ok = False
        out.append(ok)
    return out


def markers(roman: str):
    """'Not Japanese' markers of a word (strict: see ja_legal). Empty = the whole word could be Japanese."""
    m = set()
    sy = syllables(roman)
    legal = ja_legal(roman)
    for i, toks in enumerate(sy):
        on, nu, co = split_syllable(toks)
        last = i == len(sy) - 1
        if any(c in ("l", "r", "s") for c in co):
            m.add("l/r/s coda")
        if co and co[-1] in STOP_C and last and len(sy) > 1:
            m.add("final stop")
        if co and co[-1] in STOP_C and not last and not (sy[i + 1] and split_syllable(sy[i + 1])[0][:1] and
                                                         split_syllable(sy[i + 1])[0][0] in STOP_C):
            m.add("stop + other")
        if len(on) >= 2 and "".join(on) in CLUSTERS:
            m.add("cluster")
        if any(v in ("ü", "ö", "ae") for v in nu):
            m.add("ü/ö/æ")
        if not nu:
            m.add("trill")
        if not legal[i] and not m:
            m.add("other")
    return sorted(m)


def stats(romans, weights=None):
    """Syllable statistics of a list of words (optionally weighted, e.g. by how often each is heard):
    share of closed syllables, onset clusters, vowels outside a/e/i/o/u/eu, and (strict) Japanese-legal
    syllables / whole words."""
    weights = weights or [1.0] * len(romans)
    n = closed = clus = nonja = jleg = 0.0
    wn = wleg = 0.0
    for r, wt in zip(romans, weights):
        legal = ja_legal(r)
        wn += wt
        wleg += wt * all(legal)
        for toks, lg in zip(syllables(r), legal):
            on, nu, co = split_syllable(toks)
            n += wt
            closed += wt * bool(co)
            clus += wt * (len(on) >= 2)
            nonja += wt * (any(v in ("ü", "ö", "ae") for v in nu) or not nu)
            jleg += wt * lg
    d = max(n, 1e-9)
    return {"syllables": n, "closed": closed / d, "cluster": clus / d, "nonJaVowel": nonja / d,
            "jaLegal": jleg / d, "jaLegalWords": wleg / max(wn, 1e-9)}


def load_lexicon():
    with open(os.path.join(HERE, "lexicon.json"), encoding="utf-8") as f:
        return json.load(f)


# words / sequences other invented languages made famous: never ours (checked on every build)
FORBIDDEN = ["bello", "poopaye", "poopayee", "tank yu", "tankyu", "bee do", "beedo", "bido", "banana", "papoy",
             "baboi", "poka", "gelato", "tulaliloo", "tatata", "bapple", "muak", "hana", "dul", "sae", "la boda",
             "kanpai", "kampai", "para tu", "bulaka", "pwede", "bable", "sul sul", "sulsul", "dag dag", "dagdag",
             "vadish", "nooboo", "chumcha", "geelfrob", "fredishay", "whippna", "boobasnot", "shoo flee", "litcha"]


# the designer's own example words (docs/기획서_마을말.md) are kept as they are, even where they are Japanese-legal
KEEP_DESIGNER = {"thanks", "chief", "wow"}


def check(lex=None):
    """-> list of problems (empty = fine)."""
    lex = lex or load_lexicon()
    bad = []
    seen = {}
    for w in lex["words"]:
        r = w["roman"]
        flat = r.replace(".", "")
        for f in FORBIDDEN:
            ff = f.replace(" ", "")
            if flat == ff or (len(ff) >= 4 and ff in flat):
                bad.append(f"{w['id']}: '{r}' resembles '{f}' (Minionese / Simlish)")
        if flat in seen:
            bad.append(f"{w['id']}: same sound as {seen[flat]}")
        seen[flat] = w["id"]
        try:
            to_espeak(r, w.get("stress", 0))
        except ValueError as e:
            bad.append(f"{w['id']}: {e}")
        if w.get("cat") not in ("filler", "particle") and not markers(r) and w["id"] not in KEEP_DESIGNER:
            bad.append(f"{w['id']}: '{r}' could be a Japanese word (no closed l/r/s or final stop, cluster or ü/ö/æ)")
        if w.get("cat") == "babble" and sum(ja_legal(r)) * 2 > len(ja_legal(r)):
            bad.append(f"{w['id']}: babble '{r}' has more Japanese-legal syllables than not")
    return bad


if __name__ == "__main__":
    lex = load_lexicon()
    for w in lex["words"]:
        print(f"{w['id']:10s} {w['hangul']:8s} {w['roman']:20s} {to_espeak(w['roman'], w.get('stress', 0)):18s} "
              f"/{to_ipa(w['roman'], w.get('stress', 0))}/  {','.join(markers(w['roman']))}")
    print(stats([w["roman"] for w in lex["words"]]))
    print("Japanese-legal words:", [w["hangul"] for w in lex["words"] if all(ja_legal(w["roman"]))])
    probs = check(lex)
    print("\n".join(probs) if probs else "lexicon OK")
