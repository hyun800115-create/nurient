"""
ttl_iconpack.py - finishes the app icon renders of ttl_icon.py (plain python, called by ttl_pack.py).

    <cache>/icon/icon_full.png (1024, opaque)  -> falling snow + soft vignette ->
        assets/title/icon/icon_1024.png, icon_512.png, icon_192.png   (stores, PWA, iOS: opaque square)
    <cache>/icon/icon_fg.png + icon_bg.png (432) ->
        assets/title/icon/ic_launcher_foreground.png / ic_launcher_background.png  (Android adaptive
        icon layers, 108 dp at xxxhdpi = 432 px; the chief + stack sit in the 66 dp safe circle)
        assets/title/icon/icon_maskable_512.png  (PWA "maskable": the two layers composited)
These are not loaded by the game; meta.icon lists them for manifest.webmanifest / the store.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter



def snow_overlay(size, seed=5, density=1.0, avoid=None):
    """Falling snow for the icon: 2-3 BIG soft flakes, a few crisp six-arm flakes and a light sprinkle
    of small dots - kept away from the face (`avoid` = centre x, y, radius x, y in 0..1)."""
    import ttl_fx as FX
    rnd = np.random.default_rng(seed)
    lay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    k = size / 1024.0

    def clear(x, y, grow=1.0):
        if avoid is None:
            return True
        cx, cy, rx, ry = avoid
        return ((x / size - cx) / (rx * grow)) ** 2 + ((y / size - cy) / (ry * grow)) ** 2 >= 1.0

    def put(im, x, y):
        lay.alpha_composite(im, (int(x - im.width / 2), int(y - im.height / 2)))

    # small dots
    n, placed, tries = int(34 * density), 0, 0
    while placed < n and tries < n * 30:
        tries += 1
        x, y = rnd.random() * size, rnd.random() * size
        if not clear(x, y):
            continue
        r = int(max(3, (5 + 9 * rnd.random() ** 2.0) * k))
        dot = FX.soft_dot(max(6, r * 2))
        a = 0.60 + 0.40 * rnd.random()
        dot.putalpha(dot.getchannel('A').point(lambda v, a=a: int(v * a)))
        put(dot, x, y)
        placed += 1
    # crisp flakes
    for (fx, fy, fs) in ((0.12, 0.30, 46), (0.88, 0.72, 40), (0.30, 0.10, 34)):
        x, y = fx * size + rnd.uniform(-20, 20) * k, fy * size + rnd.uniform(-20, 20) * k
        fl = FX.flake(max(12, int(fs * k * (0.9 + 0.3 * rnd.random())))).rotate(rnd.uniform(0, 60),
                                                                                 resample=Image.BICUBIC)
        put(fl, x, y)
    # big out-of-focus flakes (depth): bottom right and top left, never over the face
    for (fx, fy, fs, a) in ((0.90, 0.92, 120, 0.75), (0.06, 0.06, 96, 0.65), (0.94, 0.40, 70, 0.55)):
        d = FX.soft_dot(max(16, int(fs * k)))
        d = d.filter(ImageFilter.GaussianBlur(fs * k * 0.06))
        d.putalpha(d.getchannel('A').point(lambda v, a=a: int(v * a)))
        put(d, fx * size, fy * size)
    return lay


def navy_rim(base, mask_a, px, color=(29, 47, 94), alpha=0.92):
    """Thin navy outline (like the logo's ink) round the subjects: mask_a = 0..1 subject alpha."""
    import ttl_post as P
    ring = np.clip(P.dilate(mask_a, px) - mask_a, 0, 1) * alpha
    arr = np.asarray(base.convert('RGBA'), np.float32)
    arr[..., :3] = arr[..., :3] * (1 - ring[..., None]) + np.array(color, np.float32) * ring[..., None]
    if base.mode == 'RGBA':
        arr[..., 3] = np.maximum(arr[..., 3], ring * 255)
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def vignette(im, strength=0.18):
    w, h = im.size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / math.sqrt(2)
    v = 1.0 - strength * np.clip((d - 0.45) / 0.55, 0, 1) ** 1.6
    arr = np.asarray(im.convert('RGB'), np.float32)
    arr *= v[..., None]
    # a touch of navy in the darkened corners keeps it in the game's palette
    arr = arr * 0.97 + np.array([29, 47, 94], np.float32) * 0.03 * (1 - v[..., None]) / max(strength, 1e-3)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')


FACE = (0.50, 0.47, 0.30, 0.30)      # where the chief's face sits in icon_full (snow keeps off it)


def build(cache, out_dir, rel):
    d = os.path.join(cache, 'icon')
    od = os.path.join(out_dir, 'icon')
    os.makedirs(od, exist_ok=True)
    recs, files = [], {}
    full_p = os.path.join(d, 'icon_full.png')
    if os.path.exists(full_p):
        full = Image.open(full_p).convert('RGBA')
        if full.size != (1024, 1024):
            full = full.resize((1024, 1024), Image.LANCZOS)
        from PIL import ImageEnhance
        rgb = ImageEnhance.Color(full.convert('RGB')).enhance(1.12)
        rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
        full = rgb.convert('RGBA')
        mask_p = os.path.join(d, 'icon_mask.png')
        if os.path.exists(mask_p):
            mk = Image.open(mask_p).convert('RGBA')
            if mk.size != full.size:
                mk = mk.resize(full.size, Image.LANCZOS)
            full = navy_rim(full, np.asarray(mk, np.float32)[..., 3] / 255.0, 7.0)
        full.alpha_composite(snow_overlay(1024, avoid=FACE))
        full = vignette(full, 0.14)
        for s in (1024, 512, 192):
            im = full if s == 1024 else full.resize((s, s), Image.LANCZOS)
            if s <= 192:
                im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=60, threshold=2))
            name = 'icon_%d' % s
            im.save(os.path.join(od, name + '.png'), optimize=True)
            files[name] = '%s/icon/%s.png' % (rel, name)
    fg_p, bg_p = os.path.join(d, 'icon_fg.png'), os.path.join(d, 'icon_bg.png')
    if os.path.exists(fg_p) and os.path.exists(bg_p):
        fg = Image.open(fg_p).convert('RGBA')
        fg = navy_rim(fg, np.asarray(fg, np.float32)[..., 3] / 255.0, 3.0)
        bg = Image.open(bg_p).convert('RGBA')
        bg.alpha_composite(snow_overlay(bg.width, seed=9, density=0.7, avoid=(0.5, 0.5, 0.30, 0.30)))
        bg = bg.convert('RGB')
        fg.save(os.path.join(od, 'ic_launcher_foreground.png'), optimize=True)
        bg.save(os.path.join(od, 'ic_launcher_background.png'), optimize=True)
        files['ic_launcher_foreground'] = '%s/icon/ic_launcher_foreground.png' % rel
        files['ic_launcher_background'] = '%s/icon/ic_launcher_background.png' % rel
        m = bg.convert('RGBA')
        m.alpha_composite(fg)
        m = m.resize((512, 512), Image.LANCZOS)
        m.convert('RGB').save(os.path.join(od, 'icon_maskable_512.png'), optimize=True)
        files['icon_maskable_512'] = '%s/icon/icon_maskable_512.png' % rel
    for k, p in files.items():
        recs.append(dict(type='file', key='ttl_' + k, png=p, load=False))
    meta = {'icon': {
        'files': files,
        'webmanifest': [{'src': 'assets/title/icon/icon_192.png', 'sizes': '192x192', 'type': 'image/png'},
                        {'src': 'assets/title/icon/icon_512.png', 'sizes': '512x512', 'type': 'image/png'},
                        {'src': 'assets/title/icon/icon_maskable_512.png', 'sizes': '512x512', 'type': 'image/png',
                         'purpose': 'maskable'}],
        'android': 'mipmap-anydpi-v26/ic_launcher.xml: <adaptive-icon> background = ic_launcher_background, '
                   'foreground = ic_launcher_foreground (both 432 px = 108 dp @ xxxhdpi; scale down for the '
                   'other densities: 324 / 216 / 162 / 108 px).',
        'ios': 'icon_1024.png (opaque, no rounded corners - iOS masks it).',
    }}
    return recs, meta
