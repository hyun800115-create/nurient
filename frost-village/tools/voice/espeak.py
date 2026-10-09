"""눈꽃말 voice tools - eSpeak NG as an articulation engine (library).

eSpeak NG (GPL-3.0, shipped as a shared library + data by the PyPI package `espeakng-loader`) is used
ONLY at build time to turn an invented 눈꽃말 phoneme string into a neutral, monotone "articulation"
recording plus the phoneme timing. vocoder.py then throws its pitch and voice quality away (WORLD
analysis) and resynthesises the words with our own cute voices and melodies. The speech audio that
eSpeak outputs is not a covered work (GPL-3.0 §2: output is covered only if its content is), and
nothing of eSpeak is shipped with the game.

    render(phonemes, rate=210, voice="fi") -> (x float64 mono at SR_ES, [(t_start_s, phoneme), ...])

`phonemes` uses eSpeak's own phoneme mnemonics of the Finnish table (chosen because it has pure
vowels, the front rounded vowels y / ö / ä, a rolled r and clean stops; clusters work in phoneme
mode): see phonology.py for the mapping from our notation.
"""
from __future__ import annotations

import ctypes
import os
import threading

import numpy as np

SR_ES = 22050

_lock = threading.Lock()
_state = {}


class _Event(ctypes.Structure):
    _fields_ = [("type", ctypes.c_int), ("uid", ctypes.c_uint), ("text_position", ctypes.c_int),
                ("length", ctypes.c_int), ("audio_position", ctypes.c_int), ("sample", ctypes.c_int),
                ("user_data", ctypes.c_void_p), ("id", ctypes.c_char * 8)]


_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(_Event))

# speak_lib.h constants
_AUDIO_OUTPUT_SYNCHRONOUS = 2
_INIT_PHONEME_EVENTS = 0x0001
_INIT_DONT_EXIT = 0x8000
_CHARS_UTF8 = 1
_PHONEMES = 0x100
_EV_PHONEME = 7
_RATE, _VOLUME, _PITCH, _RANGE, _WORDGAP = 1, 2, 3, 4, 7


def _lib():
    if "lib" in _state:
        return _state["lib"]
    try:
        import espeakng_loader as E
    except ImportError as e:  # pragma: no cover - dependency message
        raise SystemExit("tools/voice needs eSpeak NG:  python3 -m pip install espeakng-loader") from e
    lib = ctypes.CDLL(E.get_library_path())
    sr = lib.espeak_Initialize(_AUDIO_OUTPUT_SYNCHRONOUS, 0, E.get_data_path().encode(),
                               _INIT_PHONEME_EVENTS | _INIT_DONT_EXIT)
    if sr != SR_ES:
        raise RuntimeError(f"eSpeak NG sample rate {sr}, expected {SR_ES}")
    bufs, evs = [], []

    def cb(wav, n, ev):
        if n > 0:
            bufs.append(np.ctypeslib.as_array(wav, shape=(n,)).copy())
        i = 0
        while ev[i].type != 0:
            e = ev[i]
            if e.type == _EV_PHONEME:
                evs.append((e.sample, e.id.split(b"\0")[0].decode("latin1")))
            i += 1
        return 0

    cbf = _CB(cb)
    lib.espeak_SetSynthCallback(cbf)
    _state.update(lib=lib, cb=cbf, bufs=bufs, evs=evs, voice=None)
    return lib


def version() -> str:
    lib = _lib()
    lib.espeak_Info.restype = ctypes.c_char_p
    p = ctypes.c_char_p()
    return lib.espeak_Info(ctypes.byref(p)).decode()


def render(phonemes: str, rate: int = 210, voice: str = "fi", pitch: int = 40, prange: int = 0):
    """eSpeak phoneme mnemonics -> (mono float64 at SR_ES, [(t_s, phoneme_name), ...]).

    pitch / prange are eSpeak's 0..99 base pitch and pitch range; prange 0 = monotone, which gives
    WORLD the cleanest envelope (all intonation is ours).
    eSpeak keeps synthesis state between utterances (its output for a word depends on what it said
    before, and espeak_Terminate / Initialize does not reset it), so every word is rendered as the FIRST
    utterance of a fresh helper process: the result then only depends on the phoneme string."""
    import json
    import subprocess
    import sys
    p = subprocess.run([sys.executable, "-I", os.path.abspath(__file__), "--render", phonemes, str(rate), voice,
                        str(pitch), str(prange)], capture_output=True, check=True)
    head, _, raw = p.stdout.partition(b"\n")
    meta = json.loads(head)
    x = np.frombuffer(raw[: meta["n"] * 4], dtype="<f4").astype(np.float64)
    return x, [(t, ph) for t, ph in meta["ev"]]


def _render_here(phonemes: str, rate: int, voice: str, pitch: int, prange: int):
    with _lock:
        lib = _lib()
        if _state["voice"] != voice:
            if lib.espeak_SetVoiceByName(voice.encode()) != 0:
                raise RuntimeError(f"eSpeak voice {voice!r} not found")
            _state["voice"] = voice
        lib.espeak_SetParameter(_RATE, int(rate), 0)
        lib.espeak_SetParameter(_PITCH, int(pitch), 0)
        lib.espeak_SetParameter(_RANGE, int(prange), 0)
        lib.espeak_SetParameter(_VOLUME, 100, 0)
        bufs, evs = _state["bufs"], _state["evs"]
        bufs.clear()
        evs.clear()
        text = ("[[" + phonemes + "]]").encode()
        lib.espeak_Synth(text, len(text) + 1, 0, 0, 0, _CHARS_UTF8 | _PHONEMES, None, None)
        lib.espeak_Synchronize()
        x = (np.concatenate(bufs).astype(np.float64) / 32768.0) if bufs else np.zeros(0)
        ev = [(s / SR_ES, p) for s, p in evs]
    return x, ev


if __name__ == "__main__" and len(__import__("sys").argv) > 2 and __import__("sys").argv[1] == "--render":
    import json as _json
    import sys as _sys
    _ph, _rate, _voice, _pitch, _prange = _sys.argv[2], int(_sys.argv[3]), _sys.argv[4], int(_sys.argv[5]), int(_sys.argv[6])
    _x, _ev = _render_here(_ph, _rate, _voice, _pitch, _prange)
    _out = _sys.stdout.buffer
    _out.write(_json.dumps({"n": len(_x), "ev": _ev}).encode() + b"\n")
    _out.write(_x.astype("<f4").tobytes())
    _out.flush()

