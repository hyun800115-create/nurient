"""눈꽃말 voice tools - melodies and timing of every recorded clip (library).

A clip plan is a dict:
    id, kind ('word' | 'filler' | 'particle' | 'emote'), roman (our spelling), es (eSpeak phonemes),
    nuclei: [{st, slope, dur, vib, gain, scoop}]  - one per vowel nucleus, in order (the last one
            repeats if the word has more vowels): st = semitones over the voice's base pitch at the start
            of the vowel (x the voice's range), slope = semitones gained by its end, dur = vowel length
            factor, vib = vibrato weight 0..1, gain = level of that syllable 0..1
    cons    consonant length factor (Minion-like: snappy consonants, singing vowels)
    rate    extra speed factor, breath = extra breathiness, vib_cents = vibrato depth override
Melodies are what make the language bouncy rather than flat: words alternate high and low syllables
with a scoop into every vowel; questions rise at the end, statements fall, emotes sing.
"""
from __future__ import annotations

import zlib

import phonology as P

# (st, slope) per syllable; one list per pattern; the voice picks a pattern per word (hash)
WORD_PATTERNS = {
    1: [[(2.5, -3.5)], [(-1.0, 3.0)], [(3.5, -1.5)]],
    2: [[(3.5, -1.0), (-1.0, -2.0)], [(0.0, 2.0), (4.5, -3.5)], [(4.5, -2.0), (2.0, -2.5)], [(1.0, 2.5), (-0.5, -2.0)]],
    3: [[(3.5, -1.0), (-1.0, 0.5), (2.5, -3.0)], [(0.0, 2.0), (4.5, -1.0), (0.0, -3.0)], [(4.5, -2.0), (1.0, 0.5), (3.0, -3.5)]],
    4: [[(3.5, -1.0), (-1.0, -0.5), (2.5, -1.0), (-1.5, -2.0)], [(0.5, 2.0), (4.0, -2.0), (0.0, 2.0), (3.0, -4.0)]],
}
# words with a melody of their own
SPECIAL = {
    "wow":   [(-1.5, 4.0, 0.9), (5.5, -3.0, 1.2), (3.0, -3.5, 1.0)],
    "what":  [(-1.0, 6.5, 1.3)],
    "who":   [(-1.0, 6.0, 1.2)],
    "cold":  [(2.0, -0.5, 0.8), (1.5, -0.5, 0.8), (0.5, -2.5, 1.1)],
    "yummy": [(2.0, 1.0, 1.0), (4.5, -1.0, 1.0), (1.5, -3.5, 1.1)],
    "yes":   [(1.0, 3.5, 1.1)],
    "no":    [(3.5, -1.0, 1.0), (1.0, -3.0, 1.1)],
    "hello": [(1.5, 2.5, 1.0), (4.0, -4.0, 1.25)],
    "bye":   [(3.0, -1.0, 0.95), (0.0, -0.5, 0.95), (3.0, -1.0, 0.95), (0.0, -3.0, 1.2)],
}
PARTICLE = {
    "q":    [(-1.0, 8.0, 1.5)],
    "excl": [(5.0, -3.0, 1.15)],
    "end":  [(2.0, -5.0, 1.3)],
}
FILLER = {
    "and":     [(0.5, -1.0, 0.8)],
    "youknow": [(1.0, 1.5, 0.9)],
    "hmm":     [(0.5, -2.0, 1.6)],
    "the":     [(0.0, -1.0, 0.7)],
    "sothen":  [(1.5, 0.0, 0.8), (0.0, -1.5, 0.9)],
    "hey":     [(3.0, -2.0, 1.0)],
}


def _h(*parts) -> int:
    return zlib.crc32("|".join(str(p) for p in parts).encode())


def _nuclei(spec, vib=0.0):
    out = []
    for s in spec:
        st, sl = s[0], s[1]
        d = s[2] if len(s) > 2 else 1.0
        out.append({"st": st, "slope": sl, "dur": d, "vib": vib, "gain": 1.0})
    return out


def word_plan(word: dict, voice: str):
    """Plan for a lexicon word (dict from lexicon.json)."""
    wid, roman, cat = word["id"], word["roman"], word.get("cat")
    nsyl = len(P.syllables(roman))
    stress, sec = word.get("stress", 0), word.get("secondary")
    if cat == "particle":
        spec, kind = PARTICLE[wid], "particle"
    elif cat == "filler":
        spec, kind = FILLER[wid], "filler"
    elif wid in SPECIAL:
        spec, kind = SPECIAL[wid], "word"
    else:
        pats = WORD_PATTERNS[min(4, nsyl)]
        spec, kind = pats[_h(voice, wid) % len(pats)], "word"
    nu = _nuclei(spec)
    if kind == "word" and len(nu) >= 2:
        nu[-1]["dur"] *= 1.12                   # a little final lengthening
    return {"id": wid, "kind": kind, "roman": roman, "es": P.to_espeak(roman, stress, sec), "nuclei": nu,
            "cons": 0.8, "rate": 1.0, "breath": 0.0, "syl": nsyl}


# ----------------------------------------------------------------------------- emotes
LAUGHS = {   # roman, [(st, slope, dur, gain)], rate, breath
    "kihi":        ("ki.hi.hi.hi.hi", [(6, -1.5, 0.75, 1.0), (5, -1.5, 0.7, 0.92), (3.5, -1.5, 0.7, 0.85), (2, -1.5, 0.7, 0.75), (0.5, -2.5, 1.0, 0.62)], 1.05, 0.14),
    "hihi":        ("hi.hi.hi.hi", [(5, -1.0, 0.75, 1.0), (4, -1.0, 0.7, 0.9), (3, -1.0, 0.7, 0.85), (6, 3.0, 1.3, 0.8)], 1.0, 0.16),
    "haha":        ("ha.ha.ha.ha", [(3, -1.5, 0.85, 1.0), (2, -1.5, 0.8, 0.92), (1, -1.5, 0.8, 0.82), (-0.5, -2.5, 1.1, 0.7)], 1.0, 0.13),
    "ahaha":       ("a.ha.ha.ha", [(5, -1.0, 0.8, 1.0), (3.5, -1.5, 0.75, 0.92), (2.5, -1.5, 0.75, 0.84), (1, -2.5, 1.1, 0.72)], 1.0, 0.14),
    "hoho_low":    ("ho.ho.ho", [(2, -1.5, 1.0, 1.0), (1, -1.5, 1.0, 0.9), (-1, -2.5, 1.3, 0.8)], 0.95, 0.12),
    "ohoho":       ("o.ho.ho.ho", [(6, -1.0, 0.9, 1.0), (4.5, -1.5, 0.8, 0.9), (3.5, -1.5, 0.8, 0.82), (2, -2.5, 1.1, 0.72)], 0.95, 0.15),
    "ahaha_chief": ("a.ha.ha.hat", [(5, -1.0, 0.8, 1.0), (4, -1.5, 0.75, 0.94), (3, -1.5, 0.75, 0.88), (7, -5.0, 1.2, 0.9)], 1.05, 0.13),
    "wahaha":      ("wa.ha.ha.ha", [(4, -1.5, 1.0, 1.0), (2.5, -1.5, 0.9, 0.92), (1.5, -1.5, 0.9, 0.84), (0, -2.5, 1.2, 0.74)], 1.0, 0.12),
    "hufu":        ("hu.hu.hi", [(3, -1.0, 0.85, 0.9), (2, -1.0, 0.85, 0.85), (4.5, -2.5, 1.2, 0.8)], 0.95, 0.2),
    "kihi_fast":   ("ki.hi.hi.hi.hi.hi", [(7, -1.0, 0.6, 1.0), (6, -1.0, 0.6, 0.94), (5, -1.0, 0.6, 0.88), (4, -1.0, 0.6, 0.82), (3, -1.0, 0.6, 0.75), (2, -2.0, 0.9, 0.66)], 1.1, 0.13),
}
EMOTE_SPECS = {   # roman, [(st, slope, dur, gain, vib)], rate, breath, vib_cents
    "greet":    ("po.yam",    [(3.0, 2.5, 1.05, 1.0, 0.0), (5.5, -6.0, 1.75, 1.0, 0.5)], 1.0, 0.0, None),
    "surprise": ("u.wa",      [(-2.0, 8.0, 1.15, 0.85, 0.0), (7.0, -7.0, 2.1, 1.0, 0.5)], 1.0, 0.04, None),
    "excited":  ("ya.ho",     [(3.0, 3.0, 1.0, 1.0, 0.0), (8.0, -3.0, 1.9, 1.0, 0.6)], 1.08, 0.0, None),
    "sad":      ("heu.ing",   [(3.0, -2.0, 1.4, 0.85, 1.0), (2.0, -6.0, 2.4, 0.9, 1.0)], 0.85, 0.14, 62),
    "grumpy":   ("heung",     [(-2.0, -4.0, 1.6, 1.0, 0.0)], 0.95, 0.06, None),
    "question": ("eung",      [(-3.0, 10.0, 2.0, 1.0, 0.0)], 1.0, 0.03, None),
    "thanks":   ("ko.map.pu", [(4.0, 0.0, 1.0, 1.0, 0.0), (6.0, -1.0, 1.05, 1.0, 0.0), (3.0, -6.0, 1.9, 0.95, 0.5)], 1.0, 0.0, None),
    "yummy":    ("nyam.nyam", [(3.0, 1.0, 1.0, 1.0, 0.0), (6.0, -6.5, 2.0, 1.0, 0.45)], 1.0, 0.02, None),
    "oops":     ("at",        [(7.0, -5.0, 1.0, 1.0, 0.0)], 1.15, 0.03, None),
}


def emote_plan(emote: str, voice: str, laugh_style: str):
    if emote == "laugh":
        roman, spec, rate, breath = LAUGHS[laugh_style]
        nu = [{"st": s, "slope": sl, "dur": d, "gain": g, "vib": 0.0, "scoop": 2.2} for s, sl, d, g in spec]
        vibc = None
    else:
        roman, spec, rate, breath, vibc = EMOTE_SPECS[emote]
        nu = [{"st": s, "slope": sl, "dur": d, "gain": g, "vib": v} for s, sl, d, g, v in spec]
    plan = {"id": "emo_" + emote, "kind": "emote", "emote": emote, "roman": roman, "es": P.to_espeak(roman, 0),
            "nuclei": nu, "cons": 0.9 if emote == "laugh" else 0.85, "rate": rate, "breath": breath,
            "syl": len(P.syllables(roman))}
    if vibc:
        plan["vib_cents"] = vibc
    if emote == "laugh":
        plan["h_len"] = 1.2            # a little longer breathy h between giggles
        plan["h_gain"] = 0.45
    return plan
