"""눈꽃말 voice tools - dependency check (imported first by every entry script).

Needs: numpy, scipy, pyworld (+ setuptools < 81, pyworld 0.3.5 imports pkg_resources),
espeakng-loader (eSpeak NG library + data, build-time only) and the ffmpeg CLI (libvorbis + libmp3lame).
    python3 -m pip install numpy scipy pyworld "setuptools<81" espeakng-loader
If the running interpreter lacks them and FV_VOICE_PYTHON points at one that has them (e.g. a venv),
the script re-runs itself with that interpreter.
"""
from __future__ import annotations

import os
import shutil
import sys

INSTALL = 'python3 -m pip install numpy scipy pyworld "setuptools<81" espeakng-loader'


def ensure() -> None:
    try:
        import warnings
        import numpy  # noqa: F401
        import scipy  # noqa: F401
        import espeakng_loader  # noqa: F401
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            import pyworld  # noqa: F401
    except ImportError as e:
        alt = os.environ.get("FV_VOICE_PYTHON")
        if alt and os.path.exists(alt) and os.path.realpath(alt) != os.path.realpath(sys.executable):
            os.execv(alt, [alt] + sys.argv)
        sys.exit(f"눈꽃말 voice tools: missing {e.name}.\n    {INSTALL}\n"
                 "(or set FV_VOICE_PYTHON to a python that has them)")
    if shutil.which("ffmpeg") is None:
        sys.exit("ffmpeg not found on PATH (needs libvorbis + libmp3lame).")
