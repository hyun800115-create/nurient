"""
wkr_render.py - render the v4 worker variants (CONTRACT_V4 H) with Blender (Cycles).

Re-run (build machine, bpy module):
    /tmp/bvenv/bin/python tools/blender/wkr_render.py -- --chars all --samples 28 --portraits
On your PC with Blender installed:
    blender -b -P tools/blender/wkr_render.py -- --chars fisherman_b

Same options as char_render.py (--chars all|keys, --anims, --dirs, --frames, --samples,
--cache, --force, --portraits, --only-extras, --meta-only); 'all' = the ten variants in
wkr_build.VARIANTS and the default cache is /tmp/fv_cache/workers.  Resumable: frames
already in the cache are skipped unless --force.

Output: <cache>/<key>/<anim>_<dir>_<i>.png (128x128, anchor (64,104)), meta.json
(carryPoint, impactPoint, shadow) and portrait.png; then run
    python3 tools/blender/wkr_pack.py && python3 tools/blender/wkr_check.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import char_render      # noqa: E402  (bpy)
import char_build       # noqa: E402
import wkr_build        # noqa: E402

DEFAULT_CACHE = '/tmp/fv_cache/workers'


def main():
    opt = char_render.parse_args()
    if opt['cache'] == char_render.DEFAULT_CACHE:
        opt['cache'] = DEFAULT_CACHE
    keys = wkr_build.KEYS if opt['chars'] in ('all', 'player') else opt['chars'].split(',')
    import char_extras
    char_extras.PORTRAIT_FIT.update(wkr_build.PORTRAIT_FIT)
    for key in keys:
        if key not in wkr_build.VARIANTS:
            raise SystemExit(f'unknown worker variant {key}; known: {", ".join(wkr_build.KEYS)}')
        if not opt['only-extras']:
            char_render.render_character(key, opt)
        if opt['portraits']:
            char_extras.render_portrait(key, opt)
    print('workers done:', ', '.join(keys), flush=True)


if __name__ == '__main__':
    assert char_build is not None
    main()
