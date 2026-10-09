"""
ttl_post.py - 2D finishing for the title art (plain python: Pillow + numpy; scipy optional).

Thick round ink outline + soft drop shadow around a transparent render, piece splitting from the
label pass, resizing, alpha helpers.  Imported by ttl_pack.py / ttl_preview.py (never by Blender).
"""
import numpy as np
from PIL import Image, ImageFilter

try:                                   # exact round dilation when scipy is around
    from scipy import ndimage as _ndi
except Exception:                      # pragma: no cover
    _ndi = None


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def alpha_of(im):
    return np.asarray(im.convert('RGBA'), dtype=np.float32)[..., 3] / 255.0


def dilate(a, r):
    """Soft round dilation of an alpha map (0..1) by r px."""
    if r <= 0:
        return a.copy()
    if _ndi is not None:
        # signed distance to the >0.5 shape, anti-aliased by the coverage of the edge pixels
        inside = a > 0.5
        d = _ndi.distance_transform_edt(~inside)
        out = np.clip(r + 0.5 - d, 0.0, 1.0)
        return np.maximum(out, a)
    im = Image.fromarray((a * 255).astype(np.uint8))
    b = np.asarray(im.filter(ImageFilter.GaussianBlur(r * 0.6)), dtype=np.float32) / 255.0
    return np.clip((b - 0.04) * 6.0, 0, 1)


def gaps(a, r):
    """Narrow background between parts of the art (closing by a disc of radius r minus the art: the
    gaps between two jamo of a letter, between letters) + every enclosed counter.  0..1 float map."""
    inside = a > 0.5
    if _ndi is not None:
        dil = _ndi.distance_transform_edt(~inside) <= r
        closed = _ndi.distance_transform_edt(dil) > r
    else:                                                       # pragma: no cover
        d = dilate(a, r) > 0.5
        closed = 1.0 - dilate((~d).astype(np.float32), r) > 0.5
    g = closed & ~inside
    if _ndi is not None:
        g |= _ndi.binary_fill_holes(inside) & ~inside          # enclosed counters (o, ㅇ, ㅁ ...)
    return g.astype(np.float32)


def blur(a, r):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(r)), dtype=np.float32) / 255.0


def over(dst, src):
    """Porter-Duff over, both float RGBA (straight alpha) arrays."""
    sa = src[..., 3:4]
    da = dst[..., 3:4]
    oa = sa + da * (1 - sa)
    rgb = (src[..., :3] * sa + dst[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    return np.concatenate([rgb, oa], axis=-1)


def solid(shape, rgb, a):
    out = np.zeros(shape[:2] + (4,), np.float32)
    out[..., 0] = rgb[0] / 255.0
    out[..., 1] = rgb[1] / 255.0
    out[..., 2] = rgb[2] / 255.0
    out[..., 3] = a
    return out


def ink(im, width, color, shadow=None, inner=None, pad=0):
    """Return `im` (RGBA) with a thick round outline (`width` px, `color` hex) and an optional drop
    shadow (dict dx, dy, blur, rgba) and optional thin light rim between art and ink
    (inner = (px, hex, alpha))."""
    if pad:
        big = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        big.paste(im, (pad, pad))
        im = big
    art = np.asarray(im.convert('RGBA'), dtype=np.float32) / 255.0
    a = art[..., 3]
    out = np.zeros_like(art)
    ring = dilate(a, width)
    if shadow:
        sh = np.roll(np.roll(ring, int(shadow['dy']), axis=0), int(shadow['dx']), axis=1)
        sh = blur(sh, shadow['blur']) * (shadow['rgba'][3] / 255.0)
        out = over(out, solid(art.shape, shadow['rgba'][:3], sh))
    out = over(out, solid(art.shape, hex_rgb(color), ring))
    if inner:
        # the light rim only runs round the OUTER silhouette: inside a narrow gap between two strokes
        # (ㄲ's two ㄱ, ㄹ's bars) and inside a counter (o, ㅇ) it stays solid ink, so the jamo and the
        # counters read open at phone size
        rim = dilate(a, inner[0]) * (1.0 - np.clip(blur(gaps(a, width), 0.6) * 1.5, 0, 1))
        out = over(out, solid(art.shape, hex_rgb(inner[1]), rim * inner[2]))
    out = over(out, art)
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def labels(label_im, n_max=16):
    """Piece index per pixel from the flat-colour label render (red = idx * 16 + 8), -1 = empty."""
    arr = np.asarray(label_im.convert('RGBA'), dtype=np.float32)
    idx = np.clip(np.round((arr[..., 0] - 8.0) / 16.0), 0, n_max - 1).astype(np.int32)
    idx[arr[..., 3] < 8] = -1
    return idx


def grow_labels(idx, steps=12):
    """Give empty pixels next to a piece that piece's index (so anti-aliased edges are assigned)."""
    out = idx.copy()
    for _ in range(steps):
        empty = out < 0
        if not empty.any():
            break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(np.roll(out, dy, axis=0), dx, axis=1)
            m = empty & (sh >= 0) & (out < 0)
            out[m] = sh[m]
    return out


def fit_width(im, w):
    h = max(1, round(im.height * w / im.width))
    return im.resize((w, h), Image.LANCZOS)


def premul_resize(im, size):
    """Resize RGBA without dark fringes (premultiplied alpha)."""
    a = np.asarray(im.convert('RGBA'), dtype=np.float32) / 255.0
    p = a.copy()
    p[..., :3] *= p[..., 3:4]
    chans = [Image.fromarray((p[..., i] * 255).astype(np.uint8)).resize(size, Image.LANCZOS) for i in range(4)]
    q = np.stack([np.asarray(c, dtype=np.float32) / 255.0 for c in chans], axis=-1)
    q[..., :3] /= np.maximum(q[..., 3:4], 1e-6)
    return Image.fromarray((np.clip(q, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def trim(im, margin=2):
    bb = im.getchannel('A').point(lambda v: 255 if v > 2 else 0).getbbox()
    if not bb:
        return im, (0, 0)
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - margin), max(0, y0 - margin)
    x1, y1 = min(im.width, x1 + margin), min(im.height, y1 + margin)
    return im.crop((x0, y0, x1, y1)), (x0, y0)
