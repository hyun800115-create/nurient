"""Put the real company lettering onto AI photos.

AI image models often garble lettering (especially Korean), so the album photos are made
with whatever the model drew and this module repaints the logo areas:
  1. clean(): wipe the garbled letters off the surface (light or dark paint)
  2. place(): warp a flat decal onto the surface (optionally bent like a helmet shell)
     and blend it with the photo's own shading, blur and grain.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = __file__.rsplit("/", 1)[0]
LOGO = HERE + "/../src/logo.png"
FONT_DIR = HERE + "/fonts/noto-sans-kr/files/"


def _alpha_from_white(im):
    """Turn a logo drawn on white into RGBA (un-premultiplied against white)."""
    a = np.asarray(im.convert("RGB"), float)
    alpha = (255 - a).max(axis=2) / 255
    alpha = np.clip((alpha - 0.04) / 0.96, 0, 1)
    rgb = 255 - (255 - a) / np.maximum(alpha, 1e-3)[..., None]
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def _ink_box(rgba, box):
    """Tight bounding box of the ink inside box (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    a = np.asarray(rgba)[y0:y1, x0:x1, 3] > 40
    cols, rows = np.where(a.any(axis=0))[0], np.where(a.any(axis=1))[0]
    return x0 + cols[0], y0 + rows[0], x0 + cols[-1] + 1, y0 + rows[-1] + 1


def sk_homeservice_decal(height=200):
    """'SK홈앤서비스' built from the real logo (752x144: 홈앤서비스 | SK브로드밴드).
    Laid out like the SK브로드밴드 mark: the wing over SK, with 홈앤서비스 taking the place of 브로드밴드."""
    logo = _alpha_from_white(Image.open(LOGO))
    # SK letters + wing, x 418-558; 브로드밴드 sits right of x 530 and below y 86, so clear it out
    sk = np.asarray(logo.crop((414, 0, 560, 144))).copy()
    sk[86:, 530 - 414:, 3] = 0
    sk = Image.fromarray(sk, "RGBA")
    bro = _ink_box(logo, (528, 84, 752, 144))          # where 브로드밴드 sits
    home_box = _ink_box(logo, (0, 0, 385, 144))        # 홈앤서비스
    home = logo.crop(home_box)
    h = round((bro[3] - bro[1]) * 1.08)
    home = home.resize((round(home.width * h / home.height), h), Image.LANCZOS)
    W = (bro[0] - 414) + home.width + 4
    out = Image.new("RGBA", (max(W, sk.width), 144), (0, 0, 0, 0))
    out.alpha_composite(sk, (0, 0))
    out.alpha_composite(home, (bro[0] - 414, bro[3] - h))
    out = out.crop(_ink_box(out, (0, 0, out.width, out.height)))
    s = height / out.height
    return out.resize((round(out.width * s), height), Image.LANCZOS)


def text_decal(text, height=200, color=(255, 255, 255), weight=900):
    """Plain lettering (e.g. 'B tv') in Noto Sans KR."""
    import glob
    files = sorted(glob.glob(f"{FONT_DIR}noto-sans-kr-latin-{weight}-normal.woff2"))
    font = ImageFont.truetype(files[0], round(height * 1.3))
    box = font.getbbox(text)
    im = Image.new("RGBA", (box[2] - box[0] + 8, box[3] - box[1] + 8), color + (0,))
    ImageDraw.Draw(im).text((4 - box[0], 4 - box[1]), text, font=font, fill=color + (255,))
    s = height / im.height
    return im.resize((round(im.width * s), height), Image.LANCZOS)


def _coeffs(quad, w, h):
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    A, B = [], []
    for (x, y), (u, v) in zip(quad, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def _curve(p0, p1, bend, n):
    """n points from p0 to p1, bowed by `bend` pixels (positive = downwards)."""
    t = np.linspace(0, 1, n)
    x = p0[0] + (p1[0] - p0[0]) * t
    y = p0[1] + (p1[1] - p0[1]) * t + bend * 4 * t * (1 - t)
    return list(zip(x, y))


def warp(decal, quad, size, bend=0.0, strips=12):
    """Warp a flat decal onto quad (TL, TR, BR, BL) in an image of `size`.
    bend bows the top and bottom edges (pixels) to follow a curved shell."""
    tl, tr, br, bl = quad
    span = max(np.hypot(tr[0] - tl[0], tr[1] - tl[1]), np.hypot(br[0] - bl[0], br[1] - bl[1]))
    # pre-shrink the decal to ~2x its final size so the warp doesn't alias
    s = min(1.0, 2.0 * span / decal.width)
    if s < 1:
        decal = decal.resize((max(2, round(decal.width * s)), max(2, round(decal.height * s))), Image.LANCZOS)
    w, h = decal.size
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    if bend == 0:
        strips = 1
    top, bot = _curve(tl, tr, bend, strips + 1), _curve(bl, br, bend, strips + 1)
    for i in range(strips):
        u0, u1 = w * i / strips, w * (i + 1) / strips
        piece = decal.crop((int(u0), 0, min(w, int(np.ceil(u1)) + 1), h))
        q = [top[i], top[i + 1], bot[i + 1], bot[i]]
        if strips > 1:  # overlap strips by a hair so no seams show
            q[1] = (q[1][0] + 0.6, q[1][1]); q[2] = (q[2][0] + 0.6, q[2][1])
        layer = piece.transform(size, Image.Transform.PERSPECTIVE, _coeffs(q, piece.width, piece.height),
                                Image.Resampling.BICUBIC)
        out = Image.alpha_composite(out, layer)
    return out


def poly_mask(size, pts, feather=2.0):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).polygon([tuple(map(float, p)) for p in pts], fill=255)
    return m.filter(ImageFilter.GaussianBlur(feather)) if feather else m


def _grain(arr, amount, seed=7):
    rng = np.random.default_rng(seed)
    return arr + rng.normal(0, amount, arr.shape[:2])[..., None]


def clean(photo, pts, surface="light", k=9, feather=2.5, grain=2.0):
    """Wipe lettering inside polygon pts: dark marks on a light surface, or light marks on dark paint."""
    flt = ImageFilter.MaxFilter(k) if surface == "light" else ImageFilter.MinFilter(k)
    bg = photo.filter(flt).filter(ImageFilter.GaussianBlur(k * 0.8))
    bga = _grain(np.asarray(bg, float), grain)
    bg = Image.fromarray(np.clip(bga, 0, 255).astype(np.uint8))
    return Image.composite(bg, photo, poly_mask(photo.size, pts, feather))


def place(photo, decal, quad, mode="multiply", bend=0.0, blur=0.6, strength=1.0, grain=1.5, white=238):
    """Blend a warped decal into the photo.
    multiply: dark/colour print on a light surface (helmet) - keeps the surface shading.
    paint:    light print on a darker surface (car door) - shaded by the surface brightness."""
    layer = warp(decal, quad, photo.size, bend)
    if blur:
        layer = layer.filter(ImageFilter.GaussianBlur(blur))
    L = np.asarray(layer, float) / 255
    a = L[..., 3:4] * strength
    base = np.asarray(photo.convert("RGB"), float)
    if mode == "multiply":
        out = base * (1 - a + a * L[..., :3])
    else:
        lum = base.mean(axis=2, keepdims=True)
        ys, xs = np.where(L[..., 3] > 0.3)
        ref = np.median(lum[ys, xs]) if len(ys) else lum.mean()
        shade = np.clip(lum / max(ref, 1), 0.55, 1.25)
        ink = np.clip(L[..., :3] * white * shade, 0, 255)
        out = base * (1 - a) + ink * a
    if grain:
        rng = np.random.default_rng(11)
        out = out + rng.normal(0, grain, out.shape[:2])[..., None] * (a > 0.02)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
