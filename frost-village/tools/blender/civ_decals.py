"""
civ_decals.py - procedural ground decals of the civic set (docs/CONTRACT_V8.md section AB): scorch_decal_s / m / l,
the soot-stained snow left by a building fire, drawn on the GROUND layer under ruin_* / rubble_pile_* / the site
while the plot is rebuilt.  No Blender: numpy + Pillow (+ tools/fx/fxlib noise), deterministic seeds.

Look (cute, not grim): a soft smudge of warm charcoal-grey soot that is darkest under the old house and fades with a
noisy, blotchy edge into the snow, a ring of slightly melted (blue-grey, wet) snow around it, pale ash flecks and a
few charcoal crumbs.  The decal is drawn in the 2:1 iso ground plane (PPU 64): a ground circle of radius r metres is a
2r*64 x r*64 px ellipse.  Anchor = the plot centre = the ruin's anchor ([0.5, 0.5] of the frame).

Used by civ_pack.py (it calls make_all()); can also be run alone to write PNGs for a look:
    python3 tools/blender/civ_decals.py [out_dir]
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools', 'fx'))

PX_X, PX_Y = 45.2548, 22.6274
SIZES = {'s': (2.0, 1.7), 'm': (3.0, 2.4), 'l': (4.0, 3.1)}        # plot side (m), soot radius (m)
SS = 2                                                             # supersampling


def _noise(h, w, seed, scale):
    try:
        import fxlib as F
        return F.fft_noise(h, w, seed, scale=scale)
    except Exception:
        rng = np.random.default_rng(seed)
        a = rng.standard_normal((h // 8 + 2, w // 8 + 2)).astype(np.float32)
        im = Image.fromarray(a).resize((w, h), Image.BICUBIC)
        b = np.asarray(im, np.float32)
        return (b - b.mean()) / (b.std() + 1e-6)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def make(size, seed=0):
    """Return (PIL RGBA image, meta) for scorch_decal_<size>."""
    side, r = SIZES[size]
    W = int(np.ceil(2 * r * 64 * 1.18 / 4)) * 4
    H = W // 2
    w, h = W * SS, H * SS
    ax, ay = W / 2.0, H / 2.0
    px, py = np.meshgrid((np.arange(w) + 0.5) / SS - ax, (np.arange(h) + 0.5) / SS - ay)
    gx = (px / PX_X + py / PX_Y) / 2.0                         # ground metres under the pixel
    gy = (px / PX_X - py / PX_Y) / 2.0
    d = np.sqrt(gx * gx + gy * gy)
    # square-ish soot under the old footprint (the house stood on a square plot) blended with a round spread
    sq = np.maximum(np.abs(gx), np.abs(gy)) / (side * 0.5)
    n1 = _noise(h, w, 700 + seed, scale=70.0 * SS)
    n2 = _noise(h, w, 710 + seed, scale=22.0 * SS)
    n3 = _noise(h, w, 720 + seed, scale=7.0 * SS)
    edge = d / r + 0.07 * n1 + 0.03 * n2
    body = 1.0 - smoothstep(0.42, 0.98, edge)                  # 1 inside -> 0 at the rim
    core = 1.0 - smoothstep(0.6, 1.15, sq + 0.06 * n1)          # darker under the footprint
    blot = np.clip(0.7 + 0.2 * n2 + 0.08 * n3, 0, 1)
    soot = np.clip(body * (0.55 + 0.45 * blot) * (0.62 + 0.38 * core), 0, 1)
    # melted / wet snow ring just outside the soot
    ring = smoothstep(0.7, 0.92, edge) * (1.0 - smoothstep(0.98, 1.16, edge))
    # colours (RGB 0..1)
    dark = np.array([0x4A, 0x42, 0x3E]) / 255.0
    mid = np.array([0x6B, 0x62, 0x5C]) / 255.0
    light = np.array([0x93, 0x8A, 0x84]) / 255.0
    wet = np.array([0xA9, 0xB8, 0xCC]) / 255.0
    t = np.clip(soot * (0.8 + 0.25 * core), 0, 1)[..., None]
    col = np.where(t > 0.55, mid + (dark - mid) * ((t - 0.55) / 0.45), light + (mid - light) * (t / 0.55))
    alpha = np.clip(soot * 0.92, 0, 1)
    # wet ring under the soot edge
    wa = ring * 0.32
    col = (col * alpha[..., None] + wet * (wa * (1 - alpha))[..., None]) / np.maximum(alpha + wa * (1 - alpha),
                                                                                      1e-4)[..., None]
    alpha = alpha + wa * (1 - alpha)
    ell = (px / ax) ** 2 + (py / ay) ** 2                       # keep everything off the frame edge
    alpha = alpha * (1.0 - smoothstep(0.72, 0.98, ell))
    # pale ash flecks + charcoal crumbs (small round dots, iso-squashed)
    rng = np.random.default_rng(730 + seed)
    nd = int(55 * side)
    for k in range(nd):
        a_ = rng.uniform(0, 2 * np.pi)
        rr = r * 0.85 * np.sqrt(rng.random())
        cx, cy = rr * np.cos(a_), rr * np.sin(a_)
        sx, sy = (cx + cy) * PX_X, (cx - cy) * PX_Y
        rad = rng.uniform(0.8, 1.7) * SS
        mx, my = (sx + ax) * SS, (sy + ay) * SS
        x0, x1 = int(max(0, mx - 3 * rad)), int(min(w, mx + 3 * rad + 1))
        y0, y1 = int(max(0, my - 2 * rad)), int(min(h, my + 2 * rad + 1))
        if x1 <= x0 or y1 <= y0:
            continue
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dd = np.sqrt(((xx - mx) / rad) ** 2 + ((yy - my) / (rad * 0.6)) ** 2)
        cov = np.clip(1.4 - dd, 0, 1)
        dark_dot = k % 5 == 0
        c = np.array([0x2E, 0x28, 0x26]) / 255.0 if dark_dot else np.array([0xD9, 0xD5, 0xD0]) / 255.0
        a0 = alpha[y0:y1, x0:x1]
        aa = cov * (0.85 if dark_dot else 0.7) * np.clip(body[y0:y1, x0:x1] * 1.4, 0, 1)
        col[y0:y1, x0:x1] = (col[y0:y1, x0:x1] * (a0 * (1 - aa))[..., None] + c * aa[..., None]) / \
            np.maximum(a0 * (1 - aa) + aa, 1e-4)[..., None]
        alpha[y0:y1, x0:x1] = a0 * (1 - aa) + aa
    rgba = np.dstack([np.clip(col, 0, 1) * 255.0, np.clip(alpha, 0, 1) * 255.0]).astype(np.float32)
    im = Image.fromarray(rgba.astype(np.uint8), 'RGBA').resize((W, H), Image.LANCZOS)
    a = np.asarray(im).copy()
    a[a[..., 3] < 3] = 0
    im = Image.fromarray(a, 'RGBA')
    meta = {'frameSize': [W, H], 'anchor': [0.5, 0.5], 'anchorPx': [W // 2, H // 2], 'radiusM': r,
            'plotM': [side, side], 'footprint': [int(round(2 * r * 64)), int(round(r * 64))]}
    return im, meta


def make_all():
    return {'scorch_decal_%s' % s: make(s, seed=k) for k, s in enumerate(('s', 'm', 'l'))}


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    for k, (im, meta) in make_all().items():
        im.save(os.path.join(out, k + '.png'))
        print(k, meta['frameSize'])
