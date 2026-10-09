"""눈꽃말 voice tools - loudness of short speech clips (library).

active_lufs(x): K-weighted loudness of the *speaking* part of a clip (dual-mono like ffmpeg ebur128,
100 ms blocks every 25 ms, blocks more than 15 dB under the loudest block ignored). Better than the
400 ms momentary maximum for 0.15-0.6 s words, whose momentary window is mostly silence.
The old chatter (assets/audio2 sfx_chatter_*) is measured the same way so the new voices land at the
same effective level (file level + 20 log10(manifest volume)).
"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "audio"))
import synth as S  # noqa: E402


def active_lufs(x, gate_db: float = 15.0) -> float:
    x = np.asarray(x, dtype=float)
    if x.ndim > 1:
        x = x.mean(axis=0)
    if len(x) < S.n_of(0.1):
        x = np.concatenate((x, np.zeros(S.n_of(0.1) - len(x))))
    pw = S._block_powers(x, True, 0.1, 0.025)
    L = -0.691 + 10 * np.log10(np.maximum(pw, 1e-15))
    keep = L > L.max() - gate_db
    return float(-0.691 + 10 * np.log10(pw[keep].mean()))


def peak_db(x) -> float:
    return float(20 * np.log10(max(np.max(np.abs(x)), 1e-12)))


def phone(x, sr: int = 44100):
    """a small phone speaker: nothing under ~550 Hz (4th-order high-pass), soft top above 9 kHz"""
    from scipy.signal import butter, sosfilt
    y = sosfilt(butter(4, 550, "hp", fs=sr, output="sos"), np.asarray(x, dtype=float))
    return sosfilt(butter(2, 9000, "lp", fs=sr, output="sos"), y)


def phone_drop(x, sr: int = 44100) -> float:
    """dB lost on a phone speaker (active loudness through phone() minus full-range active loudness)"""
    return active_lufs(phone(x, sr)) - active_lufs(x)
