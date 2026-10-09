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
melody. check() verifies every content word carries at least one of these "not-Japanese" markers.

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


def markers(roman: str):
    """'Not Japanese' markers of a word (closed syllable other than -n, onset cluster, vowel outside
    a/e/i/o/u, l / f / v / rolled-r cluster, reduplicated closed syllable)."""
    m = set()
    sy = syllables(roman)
    for toks in sy:
        on, nu, co = split_syllable(toks)
        if any(c != "n" for c in co):
            m.add("closed")
        if len(on) >= 2 and "".join(on) in CLUSTERS:
            m.add("cluster")
        if any(v not in JA_VOWELS for v in nu if v in VOWELS):
            m.add("vowel")
        if len(nu) > 1:
            m.add("diphthong")
        if not nu:
            m.add("trill")
        if any(c in ("l", "f", "v") for c in on + co):
            m.add("l/f/v")
    if len(sy) >= 2 and len(sy) % 2 == 0 and sy[: len(sy) // 2] == sy[len(sy) // 2:]:
        m.add("redup")
    return sorted(m)


def stats(romans):
    """Syllable statistics of a list of words (for the report): share of closed syllables, of onset
    clusters, of non-a/e/i/o/u vowels."""
    n = closed = clus = nonja = 0
    for r in romans:
        for toks in syllables(r):
            on, nu, co = split_syllable(toks)
            n += 1
            closed += bool(co)
            clus += len(on) >= 2
            nonja += any(v not in JA_VOWELS for v in nu if v in VOWELS) or not nu
    return {"syllables": n, "closed": closed / max(n, 1), "cluster": clus / max(n, 1), "nonJaVowel": nonja / max(n, 1)}


def load_lexicon():
    with open(os.path.join(HERE, "lexicon.json"), encoding="utf-8") as f:
        return json.load(f)


# words / sequences other invented languages made famous: never ours (checked on every build)
FORBIDDEN = ["bello", "poopaye", "poopayee", "tank yu", "tankyu", "bee do", "beedo", "bido", "banana", "papoy",
             "baboi", "poka", "gelato", "tulaliloo", "tatata", "bapple", "muak", "hana", "dul", "sae", "la boda",
             "kanpai", "kampai", "para tu", "bulaka", "pwede", "bable", "sul sul", "sulsul", "dag dag", "dagdag",
             "vadish", "nooboo", "chumcha", "geelfrob", "fredishay", "whippna", "boobasnot", "shoo flee", "litcha"]


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
        if w.get("cat") not in ("filler", "particle") and not markers(r):
            bad.append(f"{w['id']}: '{r}' has no not-Japanese marker (plain CV with a/e/i/o/u)")
    return bad


if __name__ == "__main__":
    lex = load_lexicon()
    for w in lex["words"]:
        print(f"{w['id']:10s} {w['hangul']:8s} {w['roman']:20s} {to_espeak(w['roman'], w.get('stress', 0)):18s} "
              f"/{to_ipa(w['roman'], w.get('stress', 0))}/  {','.join(markers(w['roman']))}")
    print(stats([w["roman"] for w in lex["words"]]))
    probs = check(lex)
    print("\n".join(probs) if probs else "lexicon OK")
