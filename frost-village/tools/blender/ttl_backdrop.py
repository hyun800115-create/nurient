"""
ttl_backdrop.py - the title backdrop layers (plain python: numpy + Pillow; scipy optional).
Called by ttl_pack.py; the mountain / forest strips come from ttl_backdrop3d.py (Blender).

Layers (all keys ttl_*, paths assets/title/):
    ttl_sky_day / ttl_sky_dusk / ttl_sky_night   64 x 1024 vertical gradients: stretch to the screen
                                                 (horizon glow at meta.backdrop.horizon of the height)
    ttl_stars        720 x 900 star field (denser at the top) for the night sky - NORMAL or ADD
    ttl_aurora       1024 x 416 aurora curtains (one soft hem each), periodic in x - ADD / SCREEN
    ttl_moon         160 x 160 moon with halo
    ttl_clouds       1440 wide puffy toy clouds (3D metaball render from ttl_backdrop3d; a flat 2D
                     painter is the fallback), tiles horizontally (two drift speeds look nice)
    ttl_mtn_far      1080 wide snowy peaks far away (haze baked in), tiles horizontally
    ttl_mtn_mid      1080 wide nearer snowy mountains, tiles horizontally
    ttl_forest       1440 wide snowy hills with the game's pines, tiles horizontally
    ttl_city_far     1080 wide far city (final city stage): the game's own buildings rendered in Blender
                     (ttl_backdrop3d 'city'), tiles horizontally; the 2D painter city() is the fallback
    ttl_city_lights  same size: its lit windows (the render's emission pass) + glow - ADD at dusk / night
Strips are anchored on their bottom edge ([0.5, 1]) and painted in DAY colours; meta.tints holds the
multiply tint per time of day so one set of pictures serves day, golden dusk and night.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter



def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def to_img(rgb, a=None):
    rgb = np.clip(rgb, 0, 1)
    if a is None:
        return Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB')
    arr = np.concatenate([rgb, np.clip(a, 0, 1)[..., None]], axis=-1)
    return Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')


# ------------------------------------------------------------------ skies
SKIES = {
    'day': [(0.0, '#3C8BE0'), (0.30, '#62AEEE'), (0.52, '#9CD3F6'), (0.64, '#D3EEFB'), (0.70, '#EAF7FD'),
            (1.0, '#F2FAFE')],
    'dusk': [(0.0, '#2B3A82'), (0.22, '#4F55A3'), (0.40, '#8C6BB5'), (0.53, '#D985A8'), (0.62, '#FFA98E'),
             (0.69, '#FFD39C'), (0.74, '#FFE6B8'), (1.0, '#FFEFD0')],
    'night': [(0.0, '#060D27'), (0.28, '#0C1A45'), (0.50, '#18306B'), (0.64, '#27478A'), (0.70, '#2F5394'),
              (1.0, '#2C4B88')],
}
HORIZON = 0.70


def sky(stops, h=1024, w=64):
    t = (np.arange(h, dtype=np.float32) + 0.5) / h
    pos = np.array([p for p, _c in stops], np.float32)
    cols = np.stack([hexf(c) for _p, c in stops])
    # smooth (ease) interpolation between stops
    out = np.zeros((h, 3), np.float32)
    for c in range(3):
        out[:, c] = np.interp(t, pos, cols[:, c])
    # tiny smoothing of the stop kinks
    k = np.exp(-np.linspace(-2, 2, 41) ** 2)
    k /= k.sum()
    for c in range(3):
        pad = np.pad(out[:, c], 20, mode='edge')
        out[:, c] = np.convolve(pad, k, mode='valid')
    return to_img(np.repeat(out[:, None, :], w, axis=1))


# ------------------------------------------------------------------ stars, aurora, moon
def stars(w=720, h=900, seed=4):
    rnd = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    col = np.zeros((h, w, 3), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    n = 420
    tints = [hexf('#FFFFFF'), hexf('#DDE9FF'), hexf('#FFF1C9'), hexf('#CFE3FF')]
    for i in range(n):
        y = h * (rnd.random() ** 1.6)                     # denser near the top
        x = rnd.random() * w
        big = rnd.random()
        r = 0.55 + 1.3 * big ** 3
        b = 0.45 + 0.55 * rnd.random() * (1.0 - 0.6 * y / h)
        x0, x1 = int(max(0, x - 8)), int(min(w, x + 9))
        y0, y1 = int(max(0, y - 8)), int(min(h, y + 9))
        d2 = (xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2
        s = b * (np.exp(-d2 / (2 * r * r)) + 0.18 * np.exp(-d2 / (2 * (r * 3.2) ** 2)))
        c = tints[i % len(tints)]
        acc[y0:y1, x0:x1] += s
        col[y0:y1, x0:x1] += s[..., None] * c
    # a few twinkly four-point stars
    for i in range(14):
        y = h * 0.6 * rnd.random() ** 1.3
        x = rnd.random() * w
        L = 7 + 9 * rnd.random()
        x0, x1 = int(max(0, x - L - 2)), int(min(w, x + L + 3))
        y0, y1 = int(max(0, y - L - 2)), int(min(h, y + L + 3))
        dx = np.abs(xx[y0:y1, x0:x1] - x)
        dy = np.abs(yy[y0:y1, x0:x1] - y)
        s = (np.exp(-dy ** 2 / 0.8) * np.clip(1 - dx / L, 0, 1) ** 2 + np.exp(-dx ** 2 / 0.8) *
             np.clip(1 - dy / L, 0, 1) ** 2) * 0.9 + np.exp(-(dx ** 2 + dy ** 2) / 4.0)
        acc[y0:y1, x0:x1] += s
        col[y0:y1, x0:x1] += s[..., None] * hexf('#FFFFFF')
    a = np.clip(acc, 0, 1)
    rgb = col / np.maximum(acc[..., None], 1e-6)
    return to_img(rgb, a)


def aurora(w=1024, h=416, seed=9):
    """Three overlapping curtains (different phases / heights).  Each has ONE bright hem with a soft
    downward falloff (~14 px) - no double line - and fades upward over a long distance through cyan
    to violet, with vertical rays that grow stronger toward the top.  Folds (where a curtain turns
    edge-on) are brighter.  Periodic in x; the brightness envelope dips at the wrap so an untiled
    image never shows a hard vertical cut at its ends."""
    rnd = np.random.default_rng(seed)
    x = np.arange(w, dtype=np.float32)
    y = np.arange(h, dtype=np.float32)[:, None]
    I = np.zeros((h, w), np.float32)
    rgb = np.zeros((h, w, 3), np.float32)
    green, cyan, vio, pink = hexf('#7CFFB2'), hexf('#5FE3F2'), hexf('#9C83FF'), hexf('#FF9AD5')
    env = (0.25 + 0.75 * np.sin(math.pi * x / w) ** 0.8)                     # dips at the wrap
    # (hem height, waviness, decay length, gain, id, patch centre, patch width) - mostly side by side
    curtains = [(0.70, 0.10, 0.30, 1.15, 0, 0.36, 0.26), (0.54, 0.10, 0.26, 0.80, 1, 0.80, 0.20),
                (0.78, 0.06, 0.22, 0.55, 2, 0.02, 0.16)]
    for (base, amp, L, gain, band, pc, pw) in curtains:
        ph = rnd.uniform(0, math.tau, 6)
        t = math.tau * x / w
        yb = (base + amp * (0.62 * np.sin(t + ph[0]) + 0.28 * np.sin(2 * t + ph[1]) + 0.10 * np.sin(5 * t + ph[2])))
        # fold kinks: a few sharp bends
        yb = yb + 0.035 * (np.abs(np.sin(1.5 * t + ph[3])) - 0.64) * (band != 2)
        yb = h * yb
        slope = np.abs(np.gradient(yb))
        fold = 0.75 + 0.55 * np.clip(slope / 1.6, 0, 1)                       # edge-on folds glow brighter
        rays = np.zeros(w, np.float32)
        for k in (13, 23, 37, 59, 83, 131):
            rays += np.sin(k * t + rnd.uniform(0, 6)) / (1 + k / 40)
        rays = (rays - rays.min()) / (rays.max() - rays.min())
        up_px = (yb[None, :] - y)                                              # >0 above the hem
        u = np.clip(up_px / (h * L), 0, None)
        # ONE soft hem: a smooth rise over ~20 px (no hard edge, no second line), then a long decay
        rise = 1.0 - np.exp(-np.clip(up_px + 16.0, 0, None) / 14.0)
        above = rise * np.exp(-u * 1.6)
        below = 0.0
        ray_mod = (0.30 + 0.70 * rays[None, :]) ** (1.0 + 1.2 * np.clip(u, 0, 1.5))   # rays reach the hem too
        # curtains come in patches along x (never one continuous luminous line)
        dxp = (x / w - pc + 0.5) % 1.0 - 0.5
        patch = np.exp(-(dxp / pw) ** 2) * (0.75 + 0.25 * np.sin(3 * t + ph[4]))
        val = above * ray_mod * fold[None, :] * env[None, :] * patch[None, :] * gain
        tt = np.clip(u, 0, 1.4) / 1.4
        tt = np.where(up_px < 0, 0.0, tt)
        c = (green[None, None, :] * np.clip(1 - tt * 2.6, 0, 1)[..., None] +
             cyan[None, None, :] * np.clip(1 - np.abs(tt - 0.38) * 3.0, 0, 1)[..., None] +
             vio[None, None, :] * np.clip((tt - 0.42) * 2.0, 0, 1)[..., None])
        if band == 1:
            c = c * 0.75 + pink[None, None, :] * 0.25 * np.clip(tt * 2, 0, 1)[..., None]
        I += val
        rgb += c * val[..., None]
    a = np.clip(I * 1.40, 0, 1)
    rgb = rgb / np.maximum(I[..., None], 1e-6)
    im = to_img(rgb, a)
    return im.filter(ImageFilter.GaussianBlur(1.0))


def moon(s=160):
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    c = s / 2.0
    d = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    R = s * 0.21
    disc = np.clip(R + 0.5 - d, 0, 1)
    halo = np.exp(-((d - R) / (s * 0.16)) ** 2 * 1.0) * (d > R) * 0.45 + np.exp(-d / (s * 0.22)) * 0.25
    rgb = np.zeros((s, s, 3), np.float32) + hexf('#FFF4D6')
    # soft shading + a few craters
    shade = np.clip(1.0 - ((xx - c + R * 0.35) ** 2 + (yy - c + R * 0.35) ** 2) / (R * R * 4.5), 0.78, 1.0)
    rgb *= shade[..., None]
    for (cx, cy, r) in ((-0.30, -0.15, 0.22), (0.25, 0.20, 0.16), (0.05, -0.42, 0.11), (0.38, -0.25, 0.09)):
        dd = np.sqrt((xx - c - cx * R) ** 2 + (yy - c - cy * R) ** 2)
        rgb *= (1 - 0.10 * np.clip(r * R + 0.5 - dd, 0, 1))[..., None]
    halo *= np.clip((s / 2.0 - 2 - d) / (s * 0.18), 0, 1) ** 2          # fade out before the frame edge
    halo_rgb = hexf('#FFF1C2')
    a = np.clip(disc + halo * (1 - disc), 0, 1)
    out = (rgb * disc[..., None] + halo_rgb * (halo * (1 - disc))[..., None]) / np.maximum(a[..., None], 1e-6)
    return to_img(out, a)


# ------------------------------------------------------------------ clouds
def _disc(a, cx, cy, r, yy, xx):
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    np.maximum(a, np.clip(r + 0.75 - d, 0, 1), out=a)


def clouds(w=1440, h=360, seed=12):
    """Puffy toy clouds (flat bottoms, round tops), lit from the upper left; seamless in x."""
    rnd = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    total_a = np.zeros((h, w), np.float32)
    total_rgb = np.zeros((h, w, 3), np.float32)
    top, mid, bot, rim = hexf('#FFFFFF'), hexf('#F3F8FF'), hexf('#C7D6F2'), hexf('#AFC2E8')
    specs = []
    x = 40.0
    while x < w - 60:
        specs.append((x, rnd.uniform(0.38, 0.86) * h, rnd.uniform(0.55, 1.15)))
        x += rnd.uniform(230, 380)
    for (cx, base, sc) in specs:
        a = np.zeros((h, w), np.float32)
        width = 190 * sc
        n = 6
        jit = [float(rnd.uniform(-6, 8)) for _ in range(n)]
        for dx_wrap in (-w, 0, w):
            for i in range(n):
                t = i / (n - 1)
                px = cx + dx_wrap + (t - 0.5) * width
                r = (34 + 34 * math.sin(math.pi * t) + jit[i]) * sc
                _disc(a, px, base - r * 0.55, r, yy, xx)
            _disc(a, cx + dx_wrap + width * 0.12, base - 78 * sc, 40 * sc, yy, xx)
        a[yy > base] = 0                                   # flat bottom
        a = np.maximum(a, 0)
        # soft flat-bottom edge
        a *= np.clip((base - yy) / 3.0, 0, 1)
        # shading: vertical gradient inside the cloud + light from the upper left
        rel = np.clip((base - yy) / (130 * sc), 0, 1)
        dxw = (xx - cx + w / 2) % w - w / 2
        lit = np.clip(0.55 + 0.45 * rel - 0.15 * dxw / width, 0, 1)
        col = bot[None, None, :] * (1 - lit[..., None]) + mid[None, None, :] * lit[..., None]
        col = col * (1 - np.clip(rel - 0.7, 0, 1)[..., None]) + top * np.clip(rel - 0.7, 0, 1)[..., None]
        # darker rim at the bottom edge
        col = col * (1 - 0.35 * np.clip(1 - (base - yy) / 10.0, 0, 1)[..., None]) + \
            rim * 0.35 * np.clip(1 - (base - yy) / 10.0, 0, 1)[..., None]
        total_rgb = total_rgb * (1 - a[..., None]) + col * a[..., None]
        total_a = total_a * (1 - a) + a
    rgb = total_rgb / np.maximum(total_a[..., None], 1e-6)
    im = to_img(rgb, total_a * 0.96)
    return im.filter(ImageFilter.GaussianBlur(0.8))


# ------------------------------------------------------------------ far city
def city(w=1080, h=260, seed=21):
    """Far skyline silhouette (day haze blue) + its window lights (separate, for ADD at night).
    Every building's features are chosen once and drawn at x - w, x, x + w -> seamless."""
    rnd = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sil = np.zeros((h, w), np.float32)
    shade = np.zeros((h, w), np.float32)
    lights = np.zeros((h, w), np.float32)
    lcol = np.zeros((h, w, 3), np.float32)
    warm, cool, red = hexf('#FFD27A'), hexf('#E8F1FF'), hexf('#FF6A5A')
    blds = []
    x = 0.0
    while x < w - 20:
        bw = float(rnd.uniform(26, 64))
        bh = 40 + 150 * float(rnd.random()) ** 1.8
        kind = 'roof' if rnd.random() < 0.22 else ('antenna' if rnd.random() < 0.3 else 'flat')
        blds.append(dict(x=x, w=bw, h=bh, kind=kind, ax=float(rnd.uniform(0.3, 0.7))))
        x += bw + float(rnd.uniform(-6, 4))
    blds.append(dict(x=w * 0.32, w=22.0, h=190.0, kind='spire', ax=0.5))
    blds.append(dict(x=w * 0.71, w=40.0, h=172.0, kind='dome', ax=0.5))
    for b in blds:
        rows = int((b['h'] - 14) / 9)
        cols = int((b['w'] - 6) / 7)
        b['win'] = [(r, c, float(rnd.uniform(0.6, 1.0)), rnd.random() < 0.8)
                    for r in range(rows) for c in range(cols) if rnd.random() < 0.42]
    for b in blds:
        bw, bh, kind = b['w'], b['h'], b['kind']
        for wrap in (-w, 0, w):
            X0 = b['x'] + wrap
            if X0 > w or X0 + bw < 0:
                continue
            inx = (xx >= X0) & (xx < X0 + bw)
            m = inx & (yy >= h - bh)
            if kind == 'roof':
                m |= inx & (yy >= h - bh - (bw / 2 - np.abs(xx - X0 - bw / 2)) * 0.6)
            elif kind == 'spire':
                m |= inx & (yy >= h - bh - 40 + np.abs(xx - X0 - bw / 2) * 4)
            elif kind == 'dome':
                d = np.sqrt((xx - X0 - bw / 2) ** 2 + ((yy - (h - bh)) * 1.3) ** 2)
                m |= (d < bw / 2) & (yy < h - bh + 1)
            elif kind == 'antenna':
                m |= (np.abs(xx - (X0 + bw * b['ax'])) < 1.2) & (yy >= h - bh - 18)
            sil[m] = 1.0
            shade[m & (xx > X0 + bw * 0.62)] = 1.0
            for (r, c, v, is_warm) in b['win']:
                wx = X0 + 4 + c * 7 + 1.5
                wy = h - bh + 8 + r * 9 + 1.5
                if wy > h - 4:
                    continue
                sel = (np.abs(xx - wx) < 1.6) & (np.abs(yy - wy) < 2.1)
                lights[sel] = np.maximum(lights[sel], v)
                lcol[sel] = warm if is_warm else cool
            if bh > 140:
                top = h - bh - (40 if kind == 'spire' else 2)
                sel = (xx - (X0 + bw / 2)) ** 2 + (yy - top) ** 2 < 5
                lights[sel] = 1.0
                lcol[sel] = red
    base = hexf('#8FA3D0')
    dark = hexf('#7C90C0')
    rgb = base[None, None, :] * (1 - shade[..., None]) + dark[None, None, :] * shade[..., None]
    rgb = rgb * 0.9 + hexf('#B7C8E8') * 0.1
    sil_im = to_img(rgb, sil)
    la = lights * sil
    glow = np.asarray(Image.fromarray((la * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3.5)),
                      np.float32) / 255.0
    band = np.exp(-((h - yy) / (h * 0.30)) ** 2) * 0.22 * sil
    tot = la + glow * 0.9 + band
    lc = (lcol * la[..., None] + warm * (glow * 0.9 + band)[..., None]) / np.maximum(tot[..., None], 1e-6)
    return sil_im, to_img(lc, np.clip(tot, 0, 1))


# ------------------------------------------------------------------ 3D strip finishing
HAZE = {'mtn_far': (0.40, 0.22), 'mtn_mid': (0.18, 0.05), 'forest': (0.05, 0.0), 'city': (0.34, 0.20)}   # (bottom, top) mix


def finish_strip(path, name):
    im = Image.open(path).convert('RGBA')
    arr = np.asarray(im, np.float32) / 255.0
    h = arr.shape[0]
    hb, ht = HAZE[name]
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]            # 0 top .. 1 bottom
    mix = ht + (hb - ht) * t
    haze = hexf('#E2F0FC')
    arr[..., :3] = arr[..., :3] * (1 - mix) + haze * mix
    if name in ('forest', 'city'):
        # soft lower edge: the snowy ground fades out over the last rows instead of ending in a ruler line
        fade = np.clip((h - 1 - np.arange(h, dtype=np.float32)) / 30.0, 0, 1) ** 0.8
        arr[..., 3] *= fade[:, None]
    return Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


CITY_FOOT = 120          # px of transparent foot under the far city (1080-wide strip)


def _pad_bottom(im, n):
    out = Image.new('RGBA', (im.width, im.height + n), (0, 0, 0, 0))
    out.paste(im, (0, 0))
    return out


def city3d(cache):
    """The far city rendered in Blender from the game's own buildings (ttl_backdrop3d 'city'): the
    colour strip with aerial haze, and its window-lights pass with a soft glow, a faint warm glow over
    the roofs and a few red aviation lights on the tallest tops.  None when not rendered."""
    cp = os.path.join(cache, 'bd', 'bd_city.png')
    lp = os.path.join(cache, 'bd', 'bd_city_lights.png')
    if not (os.path.exists(cp) and os.path.exists(lp)):
        return None
    sil = finish_strip(cp, 'city')
    li = np.asarray(Image.open(lp).convert('RGBA'), np.float32) / 255.0
    # transparent foot: the strip is anchored at its bottom edge, so this lifts the skyline over the
    # near hills + tree line at the title's layout (TitleSky: bottom at horizon - 2.2 % H, scale 0.8)
    sil = _pad_bottom(sil, CITY_FOOT)
    li = np.concatenate([li, np.zeros((CITY_FOOT,) + li.shape[1:], np.float32)], axis=0)
    h, w = li.shape[:2]
    la = li[..., 3] * np.clip(li[..., :3].max(axis=-1) * 1.4, 0, 1)
    lc = li[..., :3] / np.maximum(li[..., :3].max(axis=-1, keepdims=True), 1e-4)
    def blur_wrap(a, r):
        pad = int(r * 3) + 2
        big = np.concatenate([a[:, -pad:], a, a[:, :pad]], axis=1)
        b = np.asarray(Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(r)), np.float32) / 255.0
        return b[:, pad:-pad]
    glow = blur_wrap(la, 3.0)
    sa = np.asarray(sil, np.float32)[..., 3] / 255.0
    yy = np.arange(h, dtype=np.float32)[:, None]
    band = blur_wrap(sa, 6.0) * np.clip((yy / h - 0.35) / 0.65, 0, 1) * 0.16
    warm, red = hexf('#FFD27A'), hexf('#FF5A4A')
    tot = la + glow * 0.8 + band
    col = (lc * la[..., None] + warm * (glow * 0.8 + band)[..., None]) / np.maximum(tot[..., None], 1e-6)
    # red aviation lights on the 4 tallest tops
    top = np.where(sa > 0.5, yy, h).min(axis=0)
    xs = np.argsort(top)
    picked = []
    for x in xs:
        if top[x] >= h:
            break
        if all(min(abs(x - p), w - abs(x - p)) > w // 8 for p in picked):
            picked.append(int(x))
        if len(picked) >= 4:
            break
    XX = np.arange(w, dtype=np.float32)[None, :]
    for x in picked:
        y = float(top[x]) - 2.0
        dx = np.minimum(np.abs(XX - x), w - np.abs(XX - x))
        d2 = dx ** 2 + (yy - y) ** 2
        dot = np.exp(-d2 / 2.0) + 0.35 * np.exp(-d2 / 18.0)
        col = col * (1 - np.clip(dot, 0, 1)[..., None]) + red * np.clip(dot, 0, 1)[..., None]
        tot = np.maximum(tot, np.clip(dot, 0, 1))
    return sil, to_img(col, np.clip(tot, 0, 1))


# multiply tints per time of day (day = no tint).  Strips + clouds + city silhouette.
TINTS = {
    'day': {},
    # golden hour: warm, light tints (lit snow stays peach-white, the pines keep their green)
    'dusk': {'ttl_mtn_far': '#FFD9C8', 'ttl_mtn_mid': '#F6C9C2', 'ttl_forest': '#DDB7AE',
             'ttl_clouds': '#FFC9B3', 'ttl_city_far': '#E8B8B4'},
    # moonlit blue; night clouds stay light enough to read as clouds, not slate smoke
    'night': {'ttl_mtn_far': '#5E70AC', 'ttl_mtn_mid': '#4C5F9C', 'ttl_forest': '#3D4E88',
              'ttl_clouds': '#7F8FC2', 'ttl_city_far': '#4A5A92'},
}


def build(cache, out_dir, rel, save_png):
    recs = []

    def rec(key, im, sprite, quant=True, colors=256):
        png = save_png(im, key, quant=quant, colors=colors)
        recs.append(dict(type='image', key=key, png=png, sprite=sprite))

    for name, stops in SKIES.items():
        rec('ttl_sky_' + name, sky(stops), dict(anchor=[0.5, 0.0], kind='decor', stretch=True,
                                                notes='Sky gradient (%s): stretch to the whole screen; horizon '
                                                      'glow at %d %% of the height.' % (name, HORIZON * 100)),
            quant=False)
    rec('ttl_stars', stars(), dict(anchor=[0.5, 0.0], kind='decor', blend='NORMAL',
                                   notes='Night stars, denser at the top (720 x 900): place at the top, stretch to '
                                         'the screen width, alpha 0 by day; twinkle with ttl_fx_twinkle.'))
    rec('ttl_aurora', aurora(), dict(anchor=[0.5, 0.0], kind='decor', blend='ADD', tile='x',
                                     notes='Night aurora curtains (mint hem, cyan, violet tops). TileSprite across '
                                           'the sky ~25-45 % down, ADD (or SCREEN), alpha 0.6-0.9; drift tilePositionX '
                                           'slowly and breathe alpha.'))
    rec('ttl_moon', moon(), dict(anchor=[0.5, 0.5], kind='decor', notes='Moon with a soft halo (night).'))
    cp = os.path.join(cache, 'bd', 'bd_clouds.png')          # 3D puffy clouds (ttl_backdrop3d) if rendered
    cl_im = Image.open(cp).convert('RGBA') if os.path.exists(cp) else clouds()
    rec('ttl_clouds', cl_im, dict(anchor=[0.5, 1.0], kind='decor', tile='x',
                                     notes='Puffy toy clouds strip (1440 wide), seamless in x. Use 1-2 TileSprites at '
                                           'different scales/speeds; tint per meta.tints.'))
    c3 = city3d(cache)
    sil, lights = c3 if c3 else city()
    rec('ttl_city_far', sil, dict(anchor=[0.5, 1.0], kind='decor', tile='x',
                                  notes='Far-away city across the bay (final city stage), rendered from the game\'s own '
                                        'buildings (town hall clock tower, brick apartments, resort hotel, harbour '
                                        'crane, lighthouse) with snowy roofs and aerial haze; seamless in x; tint per '
                                        'meta.tints.'))
    rec('ttl_city_lights', lights, dict(anchor=[0.5, 1.0], kind='decor', tile='x', blend='ADD',
                                        notes='Window lights of ttl_city_far (same size / place), ADD at dusk and '
                                              'night; flicker a little.'))
    for name in ('mtn_far', 'mtn_mid', 'forest'):
        p = os.path.join(cache, 'bd', 'bd_%s.png' % name)
        if not os.path.exists(p):
            print('backdrop: missing render', p)
            continue
        im = finish_strip(p, name)
        rec('ttl_' + name, im, dict(anchor=[0.5, 1.0], kind='decor', tile='x', size=[im.width, im.height],
                                    notes={'mtn_far': 'Far snowy peaks (haze baked in), seamless in x.',
                                           'mtn_mid': 'Nearer snowy mountains, seamless in x.',
                                           'forest': 'Snowy hills with the game\'s pines (the nearest backdrop '
                                                     'strip), seamless in x.'}[name]))
    meta = {'backdrop': {
        'horizon': HORIZON,
        'order': ['ttl_sky_*', 'ttl_stars', 'ttl_moon', 'ttl_aurora', 'ttl_clouds', 'ttl_mtn_far', 'ttl_city_far',
                  'ttl_city_lights', 'ttl_mtn_mid', 'ttl_forest', '(diorama)'],
        'parallax': {'ttl_clouds': 0.05, 'ttl_mtn_far': 0.08, 'ttl_city_far': 0.1, 'ttl_city_lights': 0.1, 'ttl_mtn_mid': 0.16,
                     'ttl_forest': 0.3},
        'suggestedBottomY': {'ttl_mtn_far': 0.50, 'ttl_city_far': 0.50, 'ttl_mtn_mid': 0.54, 'ttl_forest': 0.58,
                             'ttl_clouds': 0.36},
        'cityFootPx': CITY_FOOT,
        'cityNote': 'ttl_city_far / ttl_city_lights carry a transparent foot of cityFootPx px (of the 1080-wide '
                    'strip) under the buildings, so with the strip bottom at the usual place (TitleSky: horizon '
                    '- 2.2 % H, scale 0.8) about half of the skyline clears ttl_mtn_mid + ttl_forest at the city '
                    'stage. To place it yourself, anchor the strip at (bottom - cityFootPx * scale).',
        'note': 'Fractions of the screen height for a 720 x 1280..1600 logical portrait layout; strips are drawn '
                'at scale 720 / 1080 (or / 1440) x k so they fill the width; the diorama covers their lower part.',
    }, 'tints': TINTS}
    return recs, meta
