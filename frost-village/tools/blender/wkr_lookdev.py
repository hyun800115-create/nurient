"""
wkr_lookdev.py - look-dev / before-after sheets for the v4 worker outfits (python3 + Pillow).

    # 1) render a few look-dev frames (Blender) into a scratch cache, e.g.
    /tmp/bvenv/bin/python tools/blender/char_render.py -- --chars fisherman,lumberjack,farmer,miner,hunter \
        --anims idle,work --dirs S,SE,E,N --frames 0,4,5 --samples 16 --cache /tmp/fv_cache/workers/_lookdev
    # 2) compose
    python3 tools/blender/wkr_lookdev.py --keys fisherman,lumberjack,farmer,miner,hunter \
        --before /tmp/fv_cache/characters_v3_backup --after /tmp/fv_cache/workers/_lookdev \
        --out docs/previews/wkr_before_after.png

Each key gets a row pair: BEFORE (v3 look) and AFTER (v4 gear): idle S/SE/E/N at 1x
(game scale, with the same 1px ink outline as the atlases) and a 3x zoom of idle S, plus
the work impact frame.  Missing frames are left blank.
"""
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import char_pack  # noqa: E402  (ink_outline)

BG = (201, 214, 232, 255)
GROUND = (232, 238, 246, 255)
LABEL = (43, 47, 58, 255)
IMPACT = {'fisherman': 4, 'lumberjack': 5, 'farmer': 4, 'miner': 5, 'hunter': 5}


def load(cache, key, name):
    p = os.path.join(cache, key, name + '.png')
    if not os.path.exists(p):
        return None
    return char_pack.ink_outline(Image.open(p))


def cell(im, z=1, crop=(16, 8, 112, 120)):
    if im is None:
        return Image.new('RGBA', ((crop[2] - crop[0]) * z, (crop[3] - crop[1]) * z), (0, 0, 0, 0))
    c = im.crop(crop)
    return c.resize((c.width * z, c.height * z), Image.LANCZOS if z > 1 else Image.NEAREST)


def row(cache, key, label, prof):
    dirs = ['S', 'SE', 'E', 'N']
    ims = [cell(load(cache, key, f'idle_{d}_0')) for d in dirs]
    imp = IMPACT.get(prof, 5)
    ims += [cell(load(cache, key, f'work_{d}_{imp}')) for d in ('S', 'E')]
    zoom = cell(load(cache, key, 'idle_S_0'), 3, crop=(28, 14, 100, 110))
    w = 150 + sum(i.width + 6 for i in ims) + zoom.width + 10
    h = max(zoom.height, 112) + 10
    img = Image.new('RGBA', (w, h), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, h - 34, w, h], fill=GROUND)
    d.text((8, h // 2 - 12), label, fill=LABEL)
    x = 150
    for k, im in enumerate(ims):
        img.alpha_composite(im, (x, h - im.height - 14))
        x += im.width + 6
    img.alpha_composite(zoom, (x + 4, h - zoom.height - 4))
    return img


def main():
    a = sys.argv[1:]
    opt = {'keys': 'fisherman,lumberjack,farmer,miner,hunter', 'before': '/tmp/fv_cache/characters_v3_backup',
           'after': '/tmp/fv_cache/workers/_lookdev', 'out': None, 'prof': ''}
    i = 0
    while i < len(a):
        opt[a[i].lstrip('-')] = a[i + 1]
        i += 2
    keys = opt['keys'].split(',')
    rows = []
    for k in keys:
        prof = k.rsplit('_', 1)[0] if k.rsplit('_', 1)[0] in IMPACT else k
        if opt['before'] != 'none' and os.path.isdir(os.path.join(opt['before'], k)):
            rows.append(row(opt['before'], k, f'{k}\nBEFORE (v3)', prof))
        rows.append(row(opt['after'], k, f'{k}\nAFTER (v4)' if opt['before'] != 'none' else k, prof))
    W = max(r.width for r in rows)
    H = sum(r.height for r in rows) + 30
    sheet = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(sheet)
    d.text((8, 8), 'idle S / SE / E / N (1x game scale)   work impact S / E   idle S x3', fill=LABEL)
    y = 30
    for r in rows:
        sheet.alpha_composite(r, (0, y))
        y += r.height
    out = opt['out'] or os.path.join(os.path.dirname(os.path.dirname(HERE)), 'docs', 'previews',
                                     'wkr_before_after.png')
    sheet.convert('RGB').save(out, optimize=True)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
