"""
gb_mark_thumbs.py - three 2D sketches of the 금방 mark '금방이' (docs/CONTRACT_GEUMBANG.md brand block) at 96 px and
24 px, side by side on light / snow / dark grounds, for the designer's pick (docs/geumbang_plan.md §16 question 9).

    python3 tools/blender/gb_mark_thumbs.py            -> docs/previews/gb_mark_thumbs.png

  A  (contract, default)  gold disc + goldDark rim, a face-on cream parcel (lid band) with navy dot eyes, pink
                          cheeks and an "o" mouth, a cream 4-point sparkle above it
  B                       A with a gold tape strip down the lid (reads more 'parcel', less 'face')
  C                       A with rosy round cheeks and a bigger sparkle (cuter, heavier at 24 px)

All three are left-right symmetric (mirror-safe) and contain no letters.  The 3D mark (gb_lib.mark) follows A.
No Blender needed (Pillow).
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(GAME, 'docs', 'previews', 'gb_mark_thumbs.png')
FONT = os.path.join(GAME, 'tools', 'fonts', 'Jua-Regular.ttf')

GOLD, GOLD_D, CREAM, NAVY, CHAR = '#F2B33D', '#D9962A', '#F4EDE0', '#2B4F7E', '#3B3F52'
PINK = '#F2A0A8'
LID = '#E6DBC6'


def sparkle(d, cx, cy, r, w, fill):
    pts = []
    import math
    for k in range(8):
        a = math.pi / 2 + k * math.pi / 4
        rr = r if k % 2 == 0 else w
        pts.append((cx + rr * math.cos(a), cy - rr * math.sin(a)))
    d.polygon(pts, fill=fill)


def mark(size, variant='A', ss=8):
    S = size * ss
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S / 2
    R = S * 0.48
    d.ellipse([c - R, c - R, c + R, c + R], fill=CREAM)                       # sticker border
    r1 = R * 0.93
    d.ellipse([c - r1, c - r1, c + r1, c + r1], fill=GOLD_D)                   # rim
    r2 = R * 0.80
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=GOLD)                     # disc
    # parcel (face-on), slightly below the centre
    pw, ph = R * 0.98, R * 0.80
    px0, py0 = c - pw / 2, c - ph / 2 + R * 0.16
    d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph], radius=R * 0.12, fill=CREAM)
    d.rounded_rectangle([px0, py0, px0 + pw, py0 + ph * 0.24], radius=R * 0.12, fill=LID)
    d.rectangle([px0, py0 + ph * 0.14, px0 + pw, py0 + ph * 0.24], fill=LID)
    if variant == 'B':
        tw = pw * 0.16
        d.rectangle([c - tw / 2, py0, c + tw / 2, py0 + ph * 0.24], fill=GOLD_D)
    # face
    ey = py0 + ph * 0.52
    er = R * (0.075 if variant != 'C' else 0.07)
    for sx in (-1, 1):
        ex = c + sx * pw * 0.2
        d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=NAVY)
        cr = R * (0.085 if variant != 'C' else 0.11)
        chx, chy = c + sx * pw * 0.33, ey + R * 0.13
        d.ellipse([chx - cr, chy - cr * 0.7, chx + cr, chy + cr * 0.7], fill=PINK)
    mr = R * 0.065
    my = ey + R * 0.17
    d.ellipse([c - mr, my - mr, c + mr, my + mr], fill=NAVY)
    mi = mr * 0.45
    d.ellipse([c - mi, my - mi, c + mi, my + mi], fill=CREAM)
    # sparkle above the parcel
    sr = R * (0.24 if variant != 'C' else 0.3)
    sparkle(d, c, py0 - R * 0.2, sr, sr * 0.3, CREAM)
    return im.resize((size, size), Image.LANCZOS)


def main():
    grounds = [('light', (238, 243, 249, 255)), ('snow', (226, 233, 242, 255)), ('dusk', (70, 82, 120, 255))]
    W, H = 3 * 330 + 40, 3 * 150 + 100
    sheet = Image.new('RGBA', (W, H), (250, 250, 252, 255))
    d = ImageDraw.Draw(sheet)
    try:
        f = ImageFont.truetype(FONT, 22)
        fs = ImageFont.truetype(FONT, 15)
    except Exception:
        f = fs = ImageFont.load_default()
    labels = {'A': 'A  contract mark (default pick)', 'B': 'B  + gold tape on the lid', 'C': 'C  rosy, bigger sparkle'}
    for col, v in enumerate('ABC'):
        x0 = 20 + col * 330
        d.text((x0, 12), labels[v], fill=CHAR, font=f)
        for row, (gname, gcol) in enumerate(grounds):
            y0 = 50 + row * 150
            d.rectangle([x0, y0, x0 + 310, y0 + 136], fill=gcol)
            m96 = mark(96, v)
            sheet.alpha_composite(m96, (x0 + 12, y0 + 20))
            m24 = mark(24, v)
            sheet.alpha_composite(m24, (x0 + 130, y0 + 56))
            # 24 px shown at 3x (nearest) so the eye can judge the pixels
            sheet.alpha_composite(m24.resize((72, 72), Image.NEAREST), (x0 + 170, y0 + 32))
            # mirror check
            mir = m96.transpose(Image.FLIP_LEFT_RIGHT)
            same = sum(1 for a, b in zip(list(m96.getdata()), list(mir.getdata())) if max(abs(a[i] - b[i]) for i in range(4)) > 24)
            d.text((x0 + 250, y0 + 110), 'mir %d' % same, fill=(255, 255, 255, 255) if row == 2 else CHAR, font=fs)
            d.text((x0 + 130, y0 + 110), '24 px  (x3)', fill=(255, 255, 255, 255) if row == 2 else CHAR, font=fs)
    d.text((20, H - 34), '금방이: symmetric, no letters, no rocket / wing / bird / arrow / cat.  96 + 24 px on light, snow '
                         'and dusk.', fill=CHAR, font=fs)
    d.text((20, H - 16), 'mir = px that differ from the own mirror (0 = mirror-safe).', fill=CHAR, font=fs)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sheet.convert('RGB').save(OUT, optimize=True)
    print('wrote', OUT)


if __name__ == '__main__':
    sys.exit(main())
