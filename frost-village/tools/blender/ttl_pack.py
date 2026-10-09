"""
ttl_pack.py - turn the title-art renders into assets/title/ (plain python: Pillow + numpy;
scipy + imagequant recommended:  pip install scipy imagequant).

    python3 tools/blender/ttl_pack.py --cache /tmp/fv_cache/title [--only logo,backdrop,fx,icon]

Reads   <cache>/logo/logo_main_part<i>.png + logo_main.json   (ttl_logo.py --parts-only)
        <cache>/logo/logo_short.png, logo_en.png (+ .json)     (ttl_logo.py)
        <cache>/icon/*.png                                     (ttl_icon.py)
Paints  the backdrop layers (ttl_backdrop.py) and the title FX (ttl_fx.py) itself.
Writes  assets/title/*.png, assets/title/ttl_logo_parts.json, assets/title/icon/*.png and
        assets/title/manifest.json (CONTRACT section 2 fragment "title"; texts + palette in "meta").

Logo finishing (2D): every piece gets a thick round navy ink outline, a thin white inner rim and
a soft drop shadow; the full logo is the pieces composited in z order, so the parts atlas and the
full picture line up exactly (the title can drop the parts in, then swap to the single image).
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ttl_config as C          # noqa: E402
import ttl_post as P            # noqa: E402
import ttl_manifest as TM       # noqa: E402

OUT = C.OUT_DIR
REL = 'title'                   # manifest paths are relative to frost-village/assets/

try:
    import imagequant as _iq
except Exception:               # pragma: no cover
    _iq = None


# ------------------------------------------------------------------ io helpers
def save_png(im, name, quant=True, colors=256, sub=None):
    """Write assets/title/[sub/]<name>.png.  RGBA pictures are palette-quantized with imagequant
    (dithered) when it is installed.  Returns the manifest-relative path."""
    d = OUT if not sub else os.path.join(OUT, sub)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name + '.png')
    if quant and _iq is not None and im.mode == 'RGBA':
        q = _iq.quantize_pil_image(im, dithering_level=1.0, max_colors=colors, min_quality=70, max_quality=100)
        q.save(p, optimize=True)
    else:
        im.save(p, optimize=True)
    return '%s/%s%s.png' % (REL, (sub + '/') if sub else '', name)


def save_mask(alpha, name):
    """White + alpha mask (PNG 'LA') for Phaser BitmapMask / the shine sweep."""
    a = Image.fromarray((np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8), 'L')
    Image.merge('LA', [Image.new('L', a.size, 255), a]).save(os.path.join(OUT, name + '.png'), optimize=True)
    return '%s/%s.png' % (REL, name)


def load(p):
    im = Image.open(p)
    im.load()
    return im.convert('RGBA')


# ------------------------------------------------------------------ logo
INK = dict(width=10.0, rim=3.0, shadow_dy=7.0, shadow_blur=4.0)     # in @2x output pixels


def ink_piece(im, scale, color=None):
    """Ink one render (render resolution) with the outline sizes given at output resolution."""
    k = 1.0 / scale
    sh = dict(dx=0, dy=INK['shadow_dy'] * k, blur=INK['shadow_blur'] * k, rgba=C.PAL['shadow'])
    return P.ink(im, INK['width'] * k, color or C.PAL['ink'], shadow=sh,
                 inner=(INK['rim'] * k, '#FFFFFF', 1.0), pad=0)


def bbox_of(ims, thr=2):
    box = None
    for im in ims:
        b = im.getchannel('A').point(lambda v: 255 if v > thr else 0).getbbox()
        if not b:
            continue
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    return box


def pack_shelf(items, max_w=2048, pad=2):
    """[(name, im)] -> (atlas image, {name: (x, y, w, h)}); height-sorted shelves."""
    order = sorted(items, key=lambda t: -t[1].height)
    x = y = row_h = W = 0
    pos = {}
    for name, im in order:
        if x + im.width + pad > max_w:
            x = 0
            y += row_h + pad
            row_h = 0
        pos[name] = (x, y, im.width, im.height)
        x += im.width + pad
        row_h = max(row_h, im.height)
        W = max(W, x)
    atlas = Image.new('RGBA', (W, y + row_h), (0, 0, 0, 0))
    for name, im in items:
        atlas.paste(im, pos[name][:2])
    return atlas, pos


def _frame_scale(box, w2x):
    margin_out = INK['width'] + INK['shadow_blur'] * 2 + 4
    s = (w2x - 2 * margin_out) / float(box[2] - box[0])
    m = int(round(margin_out / s)) + 2
    return s, (box[0] - m, box[1] - m, box[2] + m, box[3] + m)


LOGO_NOTES = {
    'main': 'Main title logo (@2x): 행복한 / 눈꽃마을 (candy toy letters with snow caps, the 눈꽃 emblem on 꽃) / '
            '이야기 on a snowy wooden sign. Navy ink outline + soft shadow: reads over any sky.',
    'short': 'Short logo (@2x): 눈꽃 / 마을 in a 2 x 2 block with the emblem - splash, loading, badges.',
    'en': 'English logo (@2x): Snowbloom (the o of bloom is the 눈꽃 emblem) / Village on the wooden sign.',
}


def logo_main(cache):
    info = json.load(open(os.path.join(cache, 'logo', 'logo_main.json')))
    idxs = sorted(int(k) for k in info['pieces'])
    parts = {i: load(os.path.join(cache, 'logo', 'logo_main_part%d.png' % i)) for i in idxs}
    pct = info.get('pct', 100) / 100.0
    s, crop = _frame_scale(bbox_of(parts.values()), C.LOGO_W2X)
    out_w = C.LOGO_W2X
    out_h = int(round((crop[3] - crop[1]) * s))
    inked, art = {}, {}
    for i in idxs:
        im = parts[i].crop(crop)
        inked[i] = P.premul_resize(ink_piece(im, s), (out_w, out_h))
        art[i] = P.premul_resize(im, (out_w, out_h))
    full = Image.new('RGBA', (out_w, out_h), (0, 0, 0, 0))
    for i in idxs:                                  # z order = piece index (top, letters, emblem, sign)
        full.alpha_composite(inked[i])
    a = np.zeros((out_h, out_w), np.float32)
    for i in idxs:
        a = np.maximum(a, P.alpha_of(art[i]))
    recs = []
    sprite = dict(anchor=[0.5, 0.5], kind='ui', size2x=[out_w, out_h], notes=LOGO_NOTES['main'])
    recs.append(dict(type='image', key='ttl_logo_main', png=save_png(full, 'ttl_logo_main'), sprite=sprite, load='ko'))
    full1 = P.premul_resize(full, (out_w // 2, int(round(out_h / 2))))
    recs.append(dict(type='image', key='ttl_logo_main_1x', png=save_png(full1, 'ttl_logo_main_1x'), load='k1',
                     sprite=dict(anchor=[0.5, 0.5], kind='ui', notes='ttl_logo_main at half size (k = 1 canvases).')))
    recs.append(dict(type='image', key='ttl_logo_main_shine', png=save_mask(a, 'ttl_logo_main_shine'), load='ko',
                     sprite=dict(anchor=[0.5, 0.5], kind='ui',
                                 notes='Shine mask of ttl_logo_main (same size; white, alpha = glossy letters, '
                                       'no ink). Use as BitmapMask for ttl_shine_band sweeping across.')))
    # parts atlas (@2x): trimmed inked pieces + where they sit in the full logo
    items, place = [], {}
    for i in idxs:
        name = 'ttl_logo_' + info['pieces'][str(i)]['name']
        im, (ox, oy) = P.trim(inked[i], margin=1)
        items.append((name, im))
        piv = info['pieces'][str(i)]['pivot']           # render px (at pct) of the piece's own origin
        px_ = (piv[0] / pct - crop[0]) * s
        py_ = (piv[1] / pct - crop[1]) * s
        place[name] = dict(index=i, ox=ox, oy=oy, w=im.width, h=im.height,
                           dx=round(ox + im.width / 2.0 - out_w / 2.0, 1),
                           dy=round(oy + im.height / 2.0 - out_h / 2.0, 1),
                           pivot=[round((px_ - ox) / im.width, 3), round((py_ - oy) / im.height, 3)])
    atlas, pos = pack_shelf(items)
    frames = {}
    for name, (x, y, w, h) in pos.items():
        frames[name] = {'frame': {'x': x, 'y': y, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
                        'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}}
    png = save_png(atlas, 'ttl_logo_parts')
    with open(os.path.join(OUT, 'ttl_logo_parts.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'app': 'tools/blender/ttl_pack.py', 'image': 'ttl_logo_parts.png',
                                              'format': 'RGBA8888', 'size': {'w': atlas.width, 'h': atlas.height},
                                              'scale': '1'}}, f, indent=1)
    drop_order = ['ttl_logo_main_0', 'ttl_logo_main_1', 'ttl_logo_main_2', 'ttl_logo_main_3', 'ttl_logo_emblem',
                  'ttl_logo_top', 'ttl_logo_sign']
    fr_sprites, parts_meta = {}, []
    for name in sorted(place, key=lambda n: place[n]['index']):
        p = place[name]
        fr_sprites[name] = dict(anchor=[0.5, 0.5], kind='ui',
                                notes='Logo piece (@2x) - centre sits at (dx, dy) from the ttl_logo_main centre; '
                                      'see meta.logo.parts.')
        parts_meta.append({'frame': name, 'z': p['index'], 'dx': p['dx'], 'dy': p['dy'], 'w': p['w'], 'h': p['h'],
                           'pivot': p['pivot'],
                           'drop': drop_order.index(name) if name in drop_order else len(drop_order)})
    recs.append(dict(type='atlas', key='ttl_logo_parts', png=png, json='%s/ttl_logo_parts.json' % REL,
                     frames=fr_sprites, load='ko'))
    logo_meta = {'main': {'size2x': [out_w, out_h], 'parts': parts_meta,
                          'howTo': 'Parts are @2x like ttl_logo_main. Place each at logoCentre + (dx, dy) * '
                                   'scale with origin 0.5, depth = z; drop them in by "drop" order (letters '
                                   'left to right, emblem pops on 꽃, 행복한 slides down, the sign swings in '
                                   'last). pivot = the piece\'s own centre in origin units if you want to '
                                   'rotate / squash it around its glyph centre. When all have landed, swap '
                                   'to ttl_logo_main (identical pixels) and sweep the shine.'}}
    return recs, logo_meta


def logo_single(cache, layout, w2x):
    im = load(os.path.join(cache, 'logo', 'logo_%s.png' % layout))
    s, crop = _frame_scale(bbox_of([im]), w2x)
    im = im.crop(crop)
    out = (w2x, int(round(im.height * s)))
    inked = P.premul_resize(ink_piece(im, s), out)
    art = P.premul_resize(im, out)
    k = 'ttl_logo_%s' % layout
    ld = 'en' if layout == 'en' else False
    recs = [dict(type='image', key=k, png=save_png(inked, k), load=ld,
                 sprite=dict(anchor=[0.5, 0.5], kind='ui', size2x=list(out), notes=LOGO_NOTES[layout])),
            dict(type='image', key=k + '_1x', png=save_png(P.premul_resize(inked, (out[0] // 2, int(round(out[1] / 2)))),
                                                            k + '_1x'), load='k1' if ld else False,
                 sprite=dict(anchor=[0.5, 0.5], kind='ui', notes='%s at half size (k = 1 canvases).' % k)),
            dict(type='image', key=k + '_shine', png=save_mask(P.alpha_of(art), k + '_shine'), load=ld,
                 sprite=dict(anchor=[0.5, 0.5], kind='ui', notes='Shine mask of %s (same size).' % k))]
    return recs, {'size2x': list(out)}


def shine_band():
    """A soft white diagonal band (192 x 512) swept across the logo through the shine mask."""
    w, h = 192, 512
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    ang = np.radians(18.0)
    d = (x - w / 2) * np.cos(ang) - (y - h / 2) * np.sin(ang)
    a = np.exp(-(d / 20.0) ** 2) * 0.80 + np.exp(-(d / 55.0) ** 2) * 0.30 + np.exp(-((d - 44) / 6.0) ** 2) * 0.55
    a *= np.clip(np.minimum(y, h - 1 - y) / 50.0, 0, 1)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'ttl_shine_band.png'), optimize=True)
    return dict(type='image', key='ttl_shine_band', png='%s/ttl_shine_band.png' % REL,
                sprite=dict(anchor=[0.5, 0.5], kind='ui', blend='ADD',
                            notes='Soft white diagonal light band (wide glow + core + thin streak). Masked by a '
                                  '*_shine mask, tween x from left edge to right edge of the logo in ~0.7 s '
                                  'every 4-6 s; scale y to the logo height.'))


LAYOUT = {
    'logoMain': {'widthLogical': [430, 520], 'centreY': 0.17,
                 'note': 'portrait 720-wide logical layout: logo centre about 17 % down the screen (below the '
                         'safe-area top), the diorama under it, "터치하여 시작" near 86 %.'},
    'logoShort': {'widthLogical': [280, 360]},
    'logoEn': {'widthLogical': [460, 560], 'centreY': 0.16},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.environ.get('TTL_CACHE', '/tmp/fv_cache/title'))
    ap.add_argument('--only', default='logo,backdrop,fx,icon')
    a = ap.parse_args()
    only = set(a.only.split(','))
    os.environ['TTL_CACHE'] = a.cache          # ttl_fx reads the emblem render from the cache
    os.makedirs(OUT, exist_ok=True)
    man = TM.load_existing(a.cache)
    if 'logo' in only:
        recs, lm = logo_main(a.cache)
        r2, m2 = logo_single(a.cache, 'short', C.SHORT_W2X)
        r3, m3 = logo_single(a.cache, 'en', C.LOGO_W2X)
        lm['short'] = m2
        lm['en'] = m3
        TM.add(man, recs + r2 + r3 + [shine_band()], 'logo')
        man['meta']['logo'] = lm
        man['meta']['layout'] = LAYOUT
    if 'backdrop' in only:
        import ttl_backdrop
        recs, meta = ttl_backdrop.build(a.cache, OUT, REL, save_png)
        TM.add(man, recs, 'backdrop')
        man['meta'].update(meta)
    if 'fx' in only:
        import ttl_fx
        recs, meta = ttl_fx.build(OUT, REL, save_png)
        TM.add(man, recs, 'fx')
        man['meta'].update(meta)
    if 'icon' in only:
        import ttl_iconpack
        recs, meta = ttl_iconpack.build(a.cache, OUT, REL)
        TM.add(man, recs, 'icon')
        man['meta'].update(meta)
    TM.save_records(man, a.cache)
    out = TM.finish(man)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('PACK_DONE', sorted(only), json.dumps(out['meta']['payload']))


if __name__ == '__main__':
    main()
