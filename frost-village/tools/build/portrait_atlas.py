#!/usr/bin/env python3
"""(v4.2, docs/v42_plan.md §13.1) the file diet: the 128 px portraits of a fragment -> one atlas page.

    python3 tools/build/portrait_atlas.py DIST_ASSETS_DIR frag [frag ...]

Works on the artifact COPY (dist/…/assets), never on assets/: every `images` entry `portrait_*` of the fragment's
copied manifest (except the old 512 px title portrait) is packed on a grid into `<frag>/portraits.png` + `.json`
(Phaser JSON-hash), the image entries are removed, an atlas `<frag>_portraits` is added and each
`sprites[portrait_*]` points at its frame (anchor kept). Assets.sprite / has / pending / pick resolve atlas frames
already, so the game code is unchanged; the fragment's lazy gate is unchanged (same fragment). Prints JSON
{frag: {"n": count, "removed": files}} on stdout.
"""
import json
import os
import sys

from PIL import Image

PAD = 2
COLS = 8
SKIP = {'portrait_player_512'}


def pack(root, frag):
    mp = os.path.join(root, frag, 'manifest.json')
    if not os.path.exists(mp):
        return None
    with open(mp, encoding='utf-8') as fh:
        man = json.load(fh)
    ims = [i for i in man.get('images', []) if isinstance(i, dict) and str(i.get('key', '')).startswith('portrait_')
           and i['key'] not in SKIP and i.get('png') and os.path.exists(os.path.join(root, i['png']))]
    if len(ims) < 2:
        return None
    pics = [(i, Image.open(os.path.join(root, i['png'])).convert('RGBA')) for i in ims]
    cw = max(p.size[0] for _, p in pics) + 2 * PAD
    chh = max(p.size[1] for _, p in pics) + 2 * PAD
    cols = min(COLS, len(pics))
    rows = (len(pics) + cols - 1) // cols
    W, H = cols * cw, rows * chh
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames = {}
    for n, (i, p) in enumerate(pics):
        x, y = (n % cols) * cw + PAD, (n // cols) * chh + PAD
        sheet.paste(p, (x, y))
        w, h = p.size
        frames[i['key']] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                            'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
    png, js = frag + '/portraits.png', frag + '/portraits.json'
    sheet.save(os.path.join(root, png), optimize=True)
    with open(os.path.join(root, js), 'w', encoding='utf-8') as fh:
        json.dump({'frames': frames, 'meta': {'image': 'portraits.png', 'size': {'w': W, 'h': H}, 'scale': '1',
                                              'app': 'tools/build/portrait_atlas.py'}}, fh, separators=(',', ':'))
    key = frag + '_portraits'
    keys = {i['key'] for i in ims}
    removed = []
    for i in ims:
        fp = os.path.join(root, i['png'])
        if os.path.exists(fp):
            os.remove(fp)
            removed.append(i['png'])
    man['images'] = [i for i in man.get('images', []) if not (isinstance(i, dict) and i.get('key') in keys)]
    man.setdefault('atlases', []).append({'key': key, 'png': png, 'json': js})
    sp = man.setdefault('sprites', {})
    for i in ims:
        old = sp.get(i['key']) if isinstance(sp.get(i['key']), dict) else {}
        d = {'atlas': key, 'frame': i['key']}
        anchor = old.get('anchor') or i.get('anchor')
        if anchor:
            d['anchor'] = anchor
        for k, v in old.items():
            if k not in ('atlas', 'frame', 'image', 'anchor'):
                d[k] = v
        sp[i['key']] = d
    with open(mp, 'w', encoding='utf-8') as fh:
        json.dump(man, fh, ensure_ascii=False, separators=(',', ':'))
    return {'n': len(ims), 'removed': len(removed), 'size': [W, H]}


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    root = sys.argv[1]
    out = {}
    for frag in sys.argv[2:]:
        r = pack(root, frag)
        if r:
            out[frag] = r
    print(json.dumps(out))


if __name__ == '__main__':
    main()
