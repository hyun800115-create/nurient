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
    """Falling snow (soft dots + a few crisp six-arm flakes) as an RGBA layer."""
    import ttl_fx as FX
    rnd = np.random.default_rng(seed)
    lay = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    k = size / 1024.0
    n = int(90 * density)
    placed = 0
    tries = 0
    while placed < n and tries < n * 20:
        tries += 1
        x, y = rnd.random() * size, rnd.random() * size
        if avoid is not None:
            cx, cy, rx, ry = avoid
            if ((x / size - cx) / rx) ** 2 + ((y / size - cy) / ry) ** 2 < 1.0 and rnd.random() < 0.85:
                continue
        r = int(max(3, (5 + 13 * rnd.random() ** 2.2) * k))
        dot = FX.soft_dot(max(6, r * 2))
        a = 0.55 + 0.45 * rnd.random()
        dot.putalpha(dot.getchannel('A').point(lambda v, a=a: int(v * a)))
        lay.alpha_composite(dot, (int(x - dot.width / 2), int(y - dot.height / 2)))
        placed += 1
    for i in range(int(7 * density)):
        x, y = rnd.random() * size, rnd.random() * size * 0.9
        if avoid is not None:
            cx, cy, rx, ry = avoid
            if ((x / size - cx) / rx) ** 2 + ((y / size - cy) / ry) ** 2 < 1.2:
                continue
        s = int((28 + 26 * rnd.random()) * k)
        fl = FX.flake(max(12, s)).rotate(rnd.uniform(0, 60), resample=Image.BICUBIC)
        lay.alpha_composite(fl, (int(x - fl.width / 2), int(y - fl.height / 2)))
    return lay


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
        full.alpha_composite(snow_overlay(1024, avoid=(0.50, 0.55, 0.30, 0.40)))
        full = vignette(full)
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
        bg = Image.open(bg_p).convert('RGBA')
        bg.alpha_composite(snow_overlay(bg.width, seed=9, density=0.8, avoid=(0.5, 0.5, 0.33, 0.40)))
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
