#!/usr/bin/env python3
"""patch_actor.py - re-bake ONE character's pieces in the baked title diorama (assets/title_bake) from its
current game atlas, without a full bake.

    python3 tools/title/patch_actor.py pet_dog [--bake assets/title_bake]

Why: the title island shows the village dog (actor 'pet_dog', src/title/layout.js) from pieces baked into
ttl_<stage>_<page>.webp by tools/title/bake_title.mjs.  When only that character's art changes (2026-10: the
shiba became 누리 the maltipoo) a full re-bake would re-encode every page (and needs every other asset of the
bake to be exactly as it was).  This tool:
  * finds every frame '<char>:<anim>:<dir>:<i>' of the character in the bake's pages,
  * cuts the new frame '<anim>_<dir>_<i>' out of the character's game atlas (the manifest that defines the
    character last wins, like Assets.js: e.g. pets2 over villagers), trimmed exactly like the bake does
    (1 px transparent margin), placed in the same untrimmed bake canvas with the anchor where the actor's
    ox / oy say (so every frame keeps one origin and the runtime needs no change),
  * re-packs those pages with title_pack's MaxRects into the smallest-area page (other pieces on the page are kept: decoded from the page
    and re-encoded with the same webp settings), and rewrites the page json + the sizes / bytes in
    title_bake.json.  Frame names, actors, sprites and tex ids are unchanged.
Bake scale must be 1 for the character's actors (it is for the dog); other scales are refused.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import title_pack as tp          # noqa: E402  (pack_group, PAD, webp settings)

ASSETS = os.path.join(GAME, 'assets')


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def char_atlas(key):
    """(atlas json, atlas image, character def) of the fragment that defines `key` last (Assets.js order)."""
    sys.path.insert(0, os.path.join(GAME, 'tools', 'test'))
    order = []
    src = open(os.path.join(GAME, 'src', 'core', 'Assets.js'), encoding='utf-8').read()
    import re
    m = re.search(r"export const FRAGMENTS = \[([^\]]*)\]", src)
    order = [s.strip().strip("'") for s in m.group(1).split(',') if s.strip()]
    found = None
    for frag in order:
        mp = os.path.join(ASSETS, frag, 'manifest.json')
        if not os.path.exists(mp):
            continue
        ch = load(mp).get('characters', {})
        if key in ch:
            found = (frag, ch[key])
    if not found:
        raise SystemExit('character %s not in any fragment' % key)
    frag, cdef = found
    atl = cdef['atlas']
    man = load(os.path.join(ASSETS, frag, 'manifest.json'))
    ent = [a for a in man['atlases'] if a['key'] == atl][0]
    return load(os.path.join(ASSETS, ent['json'])), Image.open(os.path.join(ASSETS, ent['png'])).convert('RGBA'), cdef


def untrim(js, sheet, name):
    fr = js['frames'][name]
    f, s = fr['frame'], fr['spriteSourceSize']
    im = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
    im.alpha_composite(sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
    return im


def trim(im, pad=1):
    bb = im.getchannel('A').getbbox()
    if bb is None:
        return im.crop((0, 0, 1, 1)), 0, 0
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1)), x0, y0


def pack_small(items):
    """title_pack's MaxRects (same order, same PAD) into the narrowest-area page: tries page widths from the widest
    piece up to 2048 and keeps the smallest used area (= texture memory); ties keep the narrower page."""
    order = sorted(items, key=lambda it: (-max(it[1].size), -it[1].size[0] * it[1].size[1], it[0]))
    wmin = max(im.size[0] for _, im in items) + tp.PAD
    best = None
    for W in list(range(wmin, 1024, 4)) + [tp.PAGE]:
        mr = tp.MaxRects(W, tp.PAGE)
        place = {}
        for name, im in order:
            pos = mr.insert(im.size[0] + tp.PAD, im.size[1] + tp.PAD)
            if pos is None:
                place = None
                break
            place[name] = pos
        if place is None:
            continue
        area = mr.used_w * mr.used_h
        if best is None or area < best[0]:
            best = (area, {'w': mr.used_w, 'h': mr.used_h, 'place': place})
    return best[1] if best else None


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    key = args[0]
    bake = os.path.join(GAME, 'assets', 'title_bake')
    if '--bake' in args:
        bake = os.path.abspath(args[args.index('--bake') + 1])
    man = load(os.path.join(bake, 'title_bake.json'))
    ajs, asheet, cdef = char_atlas(key)
    fw, fh = cdef['frameSize']
    ax0, ay0 = cdef['anchor'][0] * fw, cdef['anchor'][1] * fh
    acts = {k: v for k, v in man['actors'].items() if v.get('char') == key}
    if not acts:
        raise SystemExit('no actor of %s in the bake' % key)
    mine = {}                                            # bake frame name -> (tex, piece, tx, ty, sw, sh)
    for ak, a in acts.items():
        if a.get('scale', 1) != 1:
            raise SystemExit('%s: bake scale %s != 1 (not supported)' % (ak, a.get('scale')))
        for tex, name in a['frames']:
            pj = load(os.path.join(bake, tex + '.json'))
            old = pj['frames'][name]
            sw, sh = old['sourceSize']['w'], old['sourceSize']['h']
            ox, oy = round(a['ox'] * sw), round(a['oy'] * sh)     # the anchor in the bake canvas
            _, anim, d, i = name.split(':')
            src = '%s_%s_%s' % (anim, d, i)
            if src not in ajs['frames']:
                raise SystemExit('%s: no frame %s in the game atlas' % (name, src))
            canvas = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
            canvas.alpha_composite(untrim(ajs, asheet, src), (int(ox - ax0), int(oy - ay0)))
            piece, tx, ty = trim(canvas)
            mine[name] = (tex, piece, tx, ty, sw, sh)
    pages = sorted({v[0] for v in mine.values()})
    total_delta = 0
    for tex in pages:
        jp = os.path.join(bake, tex + '.json')
        ip = os.path.join(bake, man['files'][tex]['png'])
        pj = load(jp)
        sheet = Image.open(ip).convert('RGBA')
        items, meta = [], {}
        for name, fr in pj['frames'].items():
            if name in mine and mine[name][0] == tex:
                _, piece, tx, ty, sw, sh = mine[name]
            else:
                f = fr['frame']
                piece = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
                tx, ty = fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']
                sw, sh = fr['sourceSize']['w'], fr['sourceSize']['h']
            items.append((name, piece))
            meta[name] = (tx, ty, sw, sh)
        pg = pack_small(items)
        if pg is None:
            raise SystemExit('%s: the patched pieces no longer fit one page' % tex)
        W, H = pg['w'], pg['h']
        out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        lookup = dict(items)
        fr_out = {}
        for name in sorted(pg['place']):
            x, y = pg['place'][name]
            im = lookup[name]
            out.paste(im, (x, y))
            tx, ty, sw, sh = meta[name]
            fr_out[name] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}, 'rotated': False,
                            'trimmed': (im.width, im.height) != (sw, sh),
                            'spriteSourceSize': {'x': tx, 'y': ty, 'w': im.width, 'h': im.height},
                            'sourceSize': {'w': sw, 'h': sh}}
        out.save(ip, 'WEBP', quality=tp.Q_SPRITE, alpha_quality=tp.Q_ALPHA, method=6)
        js = {'frames': fr_out, 'meta': {'app': 'title_pack.py', 'image': os.path.basename(ip), 'size': {'w': W, 'h': H},
                                         'scale': 1}}
        with open(jp, 'w') as fh:
            json.dump(js, fh, separators=(',', ':'), sort_keys=True)
        b = os.path.getsize(ip) + os.path.getsize(jp)
        old_b = man['files'][tex]['bytes']
        man['files'][tex].update({'w': W, 'h': H, 'bytes': b})
        g = tex.split('_')[1]
        man['groupBytes'][g] = man['groupBytes'][g] - old_b + b
        total_delta += b - old_b
        print('%s: %d %s pieces re-baked, page %dx%d, %d -> %d bytes' %
              (tex, sum(1 for v in mine.values() if v[0] == tex), key, W, H, old_b, b))
    man['totalBytes'] += total_delta
    with open(os.path.join(bake, 'title_bake.json'), 'w') as fh:
        json.dump(man, fh, separators=(',', ':'), sort_keys=True)


if __name__ == '__main__':
    main()
