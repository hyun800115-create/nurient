"""
gbf_mark.py - the 금방이 mark artwork for the geumbangfolk decals (CONTRACT_GEUMBANG Brand).  Pure python (Pillow).

    python3 tools/blender/gbf_mark.py [--out /tmp/fv_cache/geumbangfolk/mark] [--preview docs/previews/gbf_mark.png]

Mark 금방이 (contract): a gold disc (goldDark rim) holding a face-on cream parcel with navy dot eyes, pink cheeks
and an "o" mouth, and a cream 4-point sparkle above.  Symmetric (mirror-safe); reads at 24 px.  The disc is the
whole decal: the sparkle sits INSIDE the disc above the parcel, so one round decal patch (gbf_parts) carries the
mark and the doll never shows anything outside the disc.  No letters.

Writes gb_mark_512.png: the texture the decals sample.  The set-wide mark is tools/blender/gb_mark_thumbs.py mark()
variant 'A' (the vehicles_bld job's, the one on the van / banner / flag; read only, imported when present) so every
금방 sprite shows the very same 금방이; this file's own drawing (draw_mark) is the fallback.  The texture is the disc
cropped edge to edge and flattened on cream (the sticker border colour), so a round decal patch never samples a
transparent texel.
"""
import math
import os
import sys

from PIL import Image, ImageDraw

GOLD = '#F2B33D'
GOLD_D = '#D9962A'
CREAM = '#F4EDE0'
CHARCOAL = '#3B3F52'
NAVY = '#2B4F7E'
PINK = '#F29CA8'
LID = '#E6D9BF'           # the parcel's lid: a slightly deeper cream (reads as a box at 24 px)

SS = 4                     # supersampling
DEFAULT_OUT = '/tmp/fv_cache/geumbangfolk/mark'


def _c(x):
    return int(round(x * SS))


def star4(cx, cy, r_out, r_in, n=4, rot=-90.0):
    pts = []
    for k in range(2 * n):
        r = r_out if k % 2 == 0 else r_in
        a = math.radians(rot + 180.0 * k / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def draw_mark(size=512, rim=True):
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    R = S / 2 - SS * 1.0
    # disc + goldDark rim
    d.ellipse([c - R, c - R, c + R, c + R], fill=GOLD_D)
    rr = R * (0.885 if rim else 1.0)
    d.ellipse([c - rr, c - rr, c + rr, c + rr], fill=GOLD)
    # the parcel: a rounded cream box, face-on, a little below the centre
    u = size / 512.0 * SS
    w, h = 236 * u, 194 * u
    px, py = c, c + 36 * u
    box = [px - w / 2, py - h / 2, px + w / 2, py + h / 2]
    d.rounded_rectangle([box[0] - 7 * u, box[1] - 7 * u, box[2] + 7 * u, box[3] + 7 * u], radius=36 * u, fill=GOLD_D)
    d.rounded_rectangle(box, radius=30 * u, fill=CREAM)
    # lid band (the top 27 % of the box) with a soft seam line
    lid_h = h * 0.27
    d.rounded_rectangle([box[0], box[1], box[2], box[1] + lid_h], radius=30 * u, fill=LID)
    d.rectangle([box[0], box[1] + lid_h - 30 * u, box[2], box[1] + lid_h], fill=LID)
    d.rectangle([box[0], box[1] + lid_h - 3 * u, box[2], box[1] + lid_h + 3 * u], fill=GOLD_D)
    # face: navy dot eyes, pink cheeks, a little navy "o" mouth (all on the box front)
    ey = py + 12 * u
    for s in (-1, 1):
        ex = px + s * 50 * u
        d.ellipse([ex - 17 * u, ey - 19 * u, ex + 17 * u, ey + 19 * u], fill=NAVY)
        gx = ex - s * 5 * u                                 # glint toward the middle (mirror-symmetric)
        d.ellipse([gx - 5 * u, ey - 13 * u, gx + 5 * u, ey - 3 * u], fill=CREAM)
        chx, chy = px + s * 82 * u, py + 44 * u
        d.ellipse([chx - 20 * u, chy - 12 * u, chx + 20 * u, chy + 12 * u], fill=PINK)
    my = py + 50 * u
    d.ellipse([px - 14 * u, my - 15 * u, px + 14 * u, my + 15 * u], fill=NAVY)
    d.ellipse([px - 6 * u, my - 7 * u, px + 6 * u, my + 7 * u], fill=CREAM)
    # cream 4-point sparkle above the parcel (inside the disc), with a goldDark keyline
    sy_ = box[1] - 64 * u
    d.polygon(star4(c, sy_, 60 * u, 17 * u), fill=GOLD_D)
    d.polygon(star4(c, sy_, 50 * u, 12 * u), fill=CREAM)
    return im.resize((size, size), Image.LANCZOS)


def mark_texture(size=512):
    """(RGBA image, source): the set-wide mark (gb_mark_thumbs 'A') cropped to its disc, flattened on cream."""
    src = 'gbf_mark.draw_mark'
    im = None
    try:
        here = os.path.dirname(os.path.abspath(__file__))
        if here not in sys.path:
            sys.path.insert(0, here)
        import gb_mark_thumbs as MT
        big = int(round(size / 0.96))
        m = MT.mark(big, 'A')
        o = (big - size) // 2
        im = m.crop((o, o, o + size, o + size))
        src = 'gb_mark_thumbs.mark(A)'
    except Exception:
        im = draw_mark(size)
    bg = Image.new('RGBA', im.size, CREAM)
    bg.alpha_composite(im)
    return bg, src


def symmetric_error(im):
    """fraction of opaque px that differ (> 24 / 255 on any channel) from the mirror image"""
    import numpy as np
    a = np.asarray(im.convert('RGBA')).astype(int)
    b = a[:, ::-1]
    op = (a[..., 3] > 128) | (b[..., 3] > 128)
    diff = (np.abs(a - b).max(-1) > 24) & op
    return float(diff.sum()) / max(1, int(op.sum()))


def main():
    out = DEFAULT_OUT
    prev = None
    args = sys.argv[1:]
    for i, a in enumerate(args):
        if a == '--out':
            out = args[i + 1]
        if a == '--preview':
            prev = args[i + 1]
    os.makedirs(out, exist_ok=True)
    im, src = mark_texture(512)
    im.save(os.path.join(out, 'gb_mark_512.png'))
    with open(os.path.join(out, 'source.txt'), 'w') as f:
        f.write(src + '\n')
    print('mark ->', os.path.join(out, 'gb_mark_512.png'), 'from', src, 'mirror diff', round(symmetric_error(im), 4))
    if prev:
        bg = Image.new('RGBA', (560, 300), (238, 242, 247, 255))
        bg.alpha_composite(im.resize((256, 256), Image.LANCZOS), (16, 22))
        draw_mark = (lambda s_: mark_texture(s_)[0])                       # noqa: F811 (preview the texture)
        x = 300
        for s in (96, 48, 24):
            bg.alpha_composite(draw_mark(s), (x, 22 + (96 - s) // 2))
            x += s + 24
        for s, bgc in ((24, GOLD), (24, CREAM), (24, CHARCOAL)):
            tile = Image.new('RGBA', (40, 40), bgc)
            tile.alpha_composite(draw_mark(s), (8, 8))
            bg.alpha_composite(tile, (x - 172 + (len(bgc) and 0), 160))
            x += 52
        bg.convert('RGB').save(prev)
        print('preview ->', prev)


if __name__ == '__main__':
    main()
