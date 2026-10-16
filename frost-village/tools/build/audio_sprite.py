#!/usr/bin/env python3
"""(v4.2, docs/v42_plan.md §13.1) the file diet: one-shot sounds of a fragment -> one sprite mp3 + offsets.

    python3 tools/build/audio_sprite.py OUT.mp3 key=path.mp3 [key=path.mp3 ...]

Each source is decoded by ffmpeg (the mp3 encoder delay is trimmed by the decoder), resampled to 44.1 kHz, laid
end to end with GAP s of silence before each sound, and the whole is encoded once (libmp3lame, the sources' own
bitrate, mono unless a source is stereo). Prints JSON {"keys": {key: [start_s, dur_s]}, "dur": total_s, "ch": n} on
stdout. The game (src/core/Assets.js, sliceSprite) decodes the sprite once and cuts one AudioBuffer per key into the
audio cache, so Audio.play(key) is unchanged. Only the artifact build uses this (dist/); assets/ is never touched.
"""
import json
import subprocess
import sys

import numpy as np

SR = 44100
GAP = 0.06


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,bit_rate', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    s = json.loads(out)['streams'][0]
    return int(s.get('channels') or 1), int(s.get('bit_rate') or 96000)


def decode(path, ch):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch)


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    out = sys.argv[1]
    items = [a.split('=', 1) for a in sys.argv[2:]]
    info = [probe(p) for _, p in items]
    ch = max(c for c, _ in info)
    rate = max(b for _, b in info)
    kbps = min(192, max(64, int(round(rate / 1000 / 16.0)) * 16))
    gap = np.zeros((int(GAP * SR), ch), dtype=np.float32)
    parts, keys, pos = [], {}, 0
    for k, p in items:
        a = decode(p, ch)
        parts.append(gap)
        pos += len(gap)
        keys[k] = [round(pos / SR, 5), round(len(a) / SR, 5)]
        parts.append(a)
        pos += len(a)
    parts.append(gap)
    pos += len(gap)
    pcm = np.concatenate(parts).astype(np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ac', str(ch), '-ar', str(SR), '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '%dk' % kbps, out], input=pcm.tobytes(), check=True)
    print(json.dumps({'keys': keys, 'dur': round(pos / SR, 4), 'ch': ch, 'kbps': kbps}))


if __name__ == '__main__':
    main()
