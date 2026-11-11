"""
prop_repack.py - (v4.3 bakery split, spec §6.3) repack assets/props/props_buildings WITHOUT the frames the game no
longer draws, to pay for the new bakery43 page (texture budget: full-v4 GL total <= 455 MiB with ~2 MiB headroom).

No Blender, no re-render: every kept frame is cut out of the current props_buildings.png exactly as packed (trimmed
rect + spriteSourceSize, pixels untouched) and placed again with a skyline packer on the fine widths; the frame names,
their trim offsets and source sizes stay the same, so every sprite def in assets/props/manifest.json stays valid.

Dropped frames (and their sprite defs in assets/props/manifest.json):
    station_bakery + station_bakery_work_0..3   the old open-air oven (the bakery is the bakery43 cottage now)
    market_counter                              the old awning stall (market_s1..3 replaced it; world.js spriteOld)
    trade_post                                  merged into the shop's 자재 창구 (v4.3 step A)
    upgrade_bench                               the bench is workshop43 now (world.js spriteOld)
    fish_net                                    the net is the fishing deck now (deck43)

    python3 tools/blender/prop_repack.py            repack in place (refuses if a dropped frame is already gone and
                                                    nothing else changes: running twice is a no-op)
    python3 tools/blender/prop_repack.py --check    print what would happen, write nothing
    python3 tools/blender/prop_repack.py --out DIR  write props_buildings.{png,json} + manifest.json to DIR instead

prop_pack.py (a full re-render + pack) leaves these keys out too (prop_pack.DROPPED), so the savings survive a rebuild.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
PROPS = os.path.join(GAME, 'assets', 'props')
ATLAS = 'props_buildings'
DROP_SPRITES = ['station_bakery', 'market_counter', 'trade_post', 'upgrade_bench', 'fish_net']
DROP_FRAMES = set(DROP_SPRITES) | {'station_bakery_work_%d' % i for i in range(4)}
PAD = 2
WIDTHS = tuple(range(1024, 2049, 32))


def skyline(sizes, widths=WIDTHS):
    """sizes [(w, h)] -> (W, H, [(x, y)]) with the smallest W*H over the candidate widths (pack_pages.pack's rule:
    tallest first, lowest spot, leftmost on ties)."""
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    maxw = max(w for w, _ in sizes)
    best = None
    for W in widths:
        if W < maxw:
            continue
        sky = np.zeros(W + PAD, dtype=np.int64)
        pos = [None] * len(sizes)
        H = 0
        for i in order:
            w, h = sizes[i]
            ww = min(w + PAD, W + PAD)
            win = np.lib.stride_tricks.sliding_window_view(sky[:W + PAD], ww).max(axis=1)[:max(1, W - w + 1)]
            x = int(np.argmin(win))
            y = int(win[x])
            pos[i] = (x, y)
            sky[x:x + ww] = y + h + PAD
            H = max(H, y + h)
        H = (H + 3) // 4 * 4
        if best is None or W * H < best[0]:
            best = (W * H, W, H, pos)
    return best[1], best[2], best[3]


def main():
    args = sys.argv[1:]
    check = '--check' in args
    out = args[args.index('--out') + 1] if '--out' in args else PROPS
    js = json.load(open(os.path.join(PROPS, ATLAS + '.json'), encoding='utf-8'))
    sheet = Image.open(os.path.join(PROPS, ATLAS + '.png')).convert('RGBA')
    man = json.load(open(os.path.join(PROPS, 'manifest.json'), encoding='utf-8'))
    frames = js['frames']
    keep = [n for n in frames if n not in DROP_FRAMES]
    gone = [n for n in frames if n in DROP_FRAMES]
    old_mib = sheet.width * sheet.height * 4 / 1048576.0
    print('%s: %dx%d (%.2f MiB GPU), %d frames; dropping %d: %s' % (ATLAS, sheet.width, sheet.height, old_mib,
                                                                  len(frames), len(gone), ', '.join(sorted(gone))))
    still = [k for k in DROP_SPRITES if k in man.get('sprites', {})]
    if not gone and not still:
        print('nothing to do (already repacked)')
        return
    for n in keep:
        if frames[n].get('rotated'):
            raise SystemExit('prop_repack: ABORT - rotated frame %s' % n)
    # every kept sprite def must only name kept frames
    for k, s in man.get('sprites', {}).items():
        if s.get('atlas') != ATLAS or k in DROP_SPRITES:
            continue
        need = [s.get('frame')] + [f for a in (s.get('anims') or {}).values() for f in a.get('frames', [])]
        miss = [f for f in need if f and f not in keep]
        if miss:
            raise SystemExit('prop_repack: ABORT - sprite %s needs dropped frames %s' % (k, miss))
    sizes = [(frames[n]['frame']['w'], frames[n]['frame']['h']) for n in keep]
    W, H, pos = skyline(sizes)
    new_mib = W * H * 4 / 1048576.0
    used = sum(w * h for w, h in sizes) * 4 / 1048576.0
    print('repacked: %dx%d (%.2f MiB GPU, frames %.2f MiB = %.0f %% full), saves %.2f MiB' % (
        W, H, new_mib, used, 100.0 * used / new_mib, old_mib - new_mib))
    if check:
        return
    page = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    nf = {}
    for n, (x, y) in zip(keep, pos):
        f = frames[n]
        r = f['frame']
        page.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (x, y))
        e = dict(f)
        e['frame'] = {'x': x, 'y': y, 'w': r['w'], 'h': r['h']}
        nf[n] = e
    nj = dict(js)
    nj['frames'] = {n: nf[n] for n in sorted(nf)}
    meta = dict(js.get('meta', {}))
    meta['size'] = {'w': W, 'h': H}
    meta['repack'] = 'tools/blender/prop_repack.py (v4.3 bakery split): dropped ' + ', '.join(sorted(DROP_FRAMES))
    nj['meta'] = meta
    # the pixels must survive exactly
    for n in keep:
        a, b = frames[n]['frame'], nf[n]['frame']
        if not np.array_equal(np.asarray(sheet.crop((a['x'], a['y'], a['x'] + a['w'], a['y'] + a['h']))),
                              np.asarray(page.crop((b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h'])))):
            raise SystemExit('prop_repack: ABORT - frame %s changed while repacking' % n)
    os.makedirs(out, exist_ok=True)
    page.save(os.path.join(out, ATLAS + '.png'), optimize=True)
    with open(os.path.join(out, ATLAS + '.json'), 'w', encoding='utf-8') as f:
        json.dump(nj, f, indent=1)
        f.write('\n')
    sprites = {k: v for k, v in man['sprites'].items() if k not in DROP_SPRITES}
    man['sprites'] = sprites
    note = ('(v4.3 bakery split) props_buildings repacked by tools/blender/prop_repack.py without station_bakery (+ its '
            '4 work frames), market_counter, trade_post, upgrade_bench and fish_net (no longer drawn: the bakery43 '
            'cottage, the market stalls, the 자재 창구, workshop43 and the fishing deck replaced them).')
    gen = man.get('generator', '')
    if 'prop_repack' not in gen:
        man['generator'] = (gen + ' + ' if gen else '') + 'tools/blender/prop_repack.py'
    conv = man.get('conventions')
    if isinstance(conv, dict):
        conv['repack43'] = note
    with open(os.path.join(out, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('wrote %s (%d frames) and the manifest (%d sprite defs removed)' % (
        os.path.join(out, ATLAS + '.png'), len(keep), len(still)))


if __name__ == '__main__':
    main()
