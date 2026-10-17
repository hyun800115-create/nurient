"""
gb_tex.py - printed-cloth textures of the 금방 set (Pillow; also importable from the Blender python): the dock-1
banner (ko: mark + vertical "금방", en: mark only), the 금방 flag and the sled pennant (mark only), and the mark itself.
Cloth that waves carries its print as a texture, so the print follows every ripple (gb_hub / gb_assets / gb_signs).

    python3 tools/blender/gb_tex.py [OUT_DIR]          (default <cache>/tex)
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import gb_mark_thumbs as MT  # noqa: E402

FONT_KO = os.path.normpath(os.path.join(HERE, '..', 'fonts', 'Jua-Regular.ttf'))
GOLD, GOLD_D, CREAM, NAVY = '#F2B33D', '#D9962A', '#F4EDE0', '#2B4F7E'


def sparkle(d, cx, cy, r, fill, w=0.3):
    MT.sparkle(d, cx, cy, r, r * w, fill)


def iso_wall_shear(w_m, h_m, W, H):
    """Texture-space shear that cancels the 2:1 iso shear of a print on a wall running along world X (the -Y facade):
    on screen such a wall's horizontal lines fall 1 px per 2 px to the right, so a print drawn with
    deshear(img, k) keeps its horizontal strokes level on screen (k in texture px per texture px)."""
    ux = w_m * math.sqrt(0.5)                 # screen x per metre along the wall (x 64 px, cancels)
    uy = 0.5 * ux                             # screen y drop per metre along the wall
    vy = h_m * math.cos(math.radians(30.0))   # screen y per metre of height
    return (uy * H) / (W * vy)


def deshear(img, k):
    """out(tx, ty) = img(tx, ty + k (tx - W / 2)): the print rises k px per px to the right (around the centre)."""
    W, H = img.size
    return img.transform((W, H), Image.AFFINE, (1, 0, 0, k, 1, -k * W / 2.0), resample=Image.BICUBIC)


def banner(lang, W=280, H=720, w_m=0.7, h_m=1.8):
    """0.7 x 1.8 m cloth: gold field, cream inner border, goldDark sleeve at the top, the mark, vertical 금 / 방 (ko)
    or a column of cream sparkles (en, no letters).
    (polish M1) The print (mark + syllables / sparkles) is drawn on its own layer and de-sheared for the wall it hangs
    on (iso_wall_shear): on the -Y facade a 0.7 m cloth is only ~32 px wide and every horizontal stroke falls 1 px per
    2 px, so upright syllables read as a word turned on its side; de-sheared, 금 and 방 stand upright on screen.  The
    syllables are bigger too (0.74 W, the mark 0.66 W)."""
    im = Image.new('RGBA', (W, H), GOLD)
    d = ImageDraw.Draw(im)
    b = int(W * 0.05)
    d.rectangle([b, b + 34, W - b - 1, H - b - 1], outline=CREAM, width=max(3, W // 60))
    d.rectangle([0, 0, W, 34], fill=GOLD_D)
    pr = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pr)
    m = MT.mark(int(W * 0.66))
    y = 70
    pr.alpha_composite(m, ((W - m.width) // 2, y))
    y += m.height + 34
    if lang == 'ko':
        f = ImageFont.truetype(FONT_KO, int(W * 0.74))
        for ch in '금방':
            bb = pd.textbbox((0, 0), ch, font=f)
            tw, th = bb[2] - bb[0], bb[3] - bb[1]
            pd.text(((W - tw) / 2 - bb[0], y - bb[1]), ch, font=f, fill=NAVY)
            y += th + int(W * 0.08)
    else:
        for k in range(3):
            sparkle(pd, W / 2, y + 40 + k * 100, 36 if k != 1 else 46, CREAM)
    im.alpha_composite(deshear(pr, iso_wall_shear(w_m, h_m, W, H)))
    # little scalloped hem at the bottom
    for k in range(5):
        cx = (k + 0.5) * W / 5
        d.ellipse([cx - W / 10, H - 16, cx + W / 10, H + 16], fill=GOLD_D)
    return im


def flag(W=400, H=260):
    """1.0 x 0.65 m flag: gold field, a cream hem stripe top and bottom, the mark in the middle (no letters)."""
    im = Image.new('RGBA', (W, H), GOLD)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, int(H * 0.08)], fill=CREAM)
    d.rectangle([0, H - int(H * 0.08), W, H], fill=CREAM)
    d.rectangle([0, 0, int(W * 0.06), H], fill=GOLD_D)          # pole sleeve
    m = MT.mark(int(H * 0.74))
    im.alpha_composite(m, ((W - m.width) // 2 + int(W * 0.03), (H - m.height) // 2))
    for sx in (0.2, 0.86):
        sparkle(d, W * sx, H * 0.5, H * 0.09, CREAM)
    return im


def pennant(W=320, H=240):
    """Triangular pennant (hoist on the left, tip on the right): gold with a goldDark hem, the mark at the hoist."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(0, 0), (W, H / 2), (0, H)], fill=GOLD_D)
    k = 10
    d.polygon([(k, k * 1.6), (W - k * 3.2, H / 2), (k, H - k * 1.6)], fill=GOLD)
    m = MT.mark(int(H * 0.62))
    im.alpha_composite(m, (int(W * 0.06), (H - m.height) // 2))
    return im


def write_all(out):
    os.makedirs(out, exist_ok=True)
    files = {'banner_ko': banner('ko'), 'banner_en': banner('en'), 'flag': flag(), 'pennant': pennant(),
             'mark': MT.mark(512)}
    for k, im in files.items():
        im.save(os.path.join(out, k + '.png'))
    return {k: os.path.join(out, k + '.png') for k in files}


if __name__ == '__main__':
    import tempfile
    o = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('GB_CACHE') or os.path.join(
        tempfile.gettempdir(), 'fv_cache', 'geumbang'), 'tex')
    print(write_all(o))
