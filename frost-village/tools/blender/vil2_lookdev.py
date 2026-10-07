"""
vil2_lookdev.py - expression sheet for the batch-2 residents (plain python3 + Pillow).

    /tmp/bvenv/bin/python tools/blender/vil2_render.py -- --chars npc_toddler,npc_porter_a,npc_clerk_a,npc_captain,npc_guard --lookdev
    python3 tools/blender/vil2_lookdev.py [--keys a,b,c] [--out docs/previews/vil2_expressions.png] [--faces ...]

Same layout as vil_lookdev.py (batch 1, reused unchanged - only its cache path is
pointed at the batch-2 look-dev renders): per character a head close-up row, the
real game-scale frames (S and E, 1:1 = what a phone shows) and a 2x
nearest-neighbour pixel check, one column per expression preset.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import vil_lookdev as vl          # noqa: E402

CACHE = '/tmp/fv_cache/villagers2/_lookdev'
KEYS = ['npc_toddler', 'npc_porter_a', 'npc_clerk_a', 'npc_captain', 'npc_guard']


def main():
    args = sys.argv[1:]
    if '--keys' not in args:
        args += ['--keys', ','.join(KEYS)]
    if '--out' not in args:
        args += ['--out', os.path.join(GAME, 'docs', 'previews', 'vil2_expressions.png')]
    if '--cache' in args:
        i = args.index('--cache')
        cache = args[i + 1]
        del args[i:i + 2]
    else:
        cache = CACHE
    vl.CACHE = cache
    sys.argv = [sys.argv[0]] + args
    vl.main()


if __name__ == '__main__':
    main()
