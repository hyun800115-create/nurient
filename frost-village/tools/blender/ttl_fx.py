"""
ttl_fx.py - the few title FX that assets/fx and assets/ui2 do not already have (plain python).
Called by ttl_pack.py.

Already in the game (reuse them on the title):
    fx_poof (snowy cloud burst, 12 f), fx_sparkle (gold twinkles, 12 f), fx_build_done (big finish
    burst), fx_particles: fx_snowflake / fx_spark / fx_star / fx_glow / fx_ring.
Added here:
    atlas ttl_fx (frames, all white-ish, NORMAL blend unless noted):
        ttl_fx_snow_s / _m      soft round flakes 16 / 28 px for the falling-snow layers (far / mid)
        ttl_fx_snow_bokeh       64 px out-of-focus foreground flake (faint disc + soft rim; ADD, alpha 0.3-0.5)
        ttl_fx_flake_s / _m     crisp little six-arm snowflakes 32 / 56 px (rounded toy strokes)
        ttl_fx_bloom            48 px mini 눈꽃 emblem (snow-flower) - a rare special flake / sparkle
        ttl_fx_twinkle          64 px four-point star with a glow (logo sparkle, star twinkle; ADD ok)
        ttl_fx_glow             64 px soft round glow (windows, lamps, light pops; ADD)
    sheet ttl_fx_pop            8 x 128 px frames @ 30 fps: the quick "pop" when a building appears on
                                the title (white ring + snow balls + 3 gold stars) - lighter and faster
                                than fx_build_done; layer fx_poof under it for a softer puff.
"""
import math
import os

import numpy as np
from PIL import Image, ImageFilter



def hexf(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def rgba(rgb, a):
    arr = np.concatenate([np.clip(rgb, 0, 1), np.clip(a, 0, 1)[..., None]], axis=-1)
    return Image.fromarray((arr * 255 + 0.5).astype(np.uint8), 'RGBA')


def grid(s, ss=4):
    """Supersampled coordinate grid centred on the image centre (units = output px)."""
    n = s * ss
    v = (np.arange(n, dtype=np.float32) + 0.5) / ss - s / 2.0
    return np.meshgrid(v, v)


def down(arr_rgb, arr_a, ss):
    """Average-down a supersampled (premultiplied) image."""
    h, w = arr_a.shape
    pm = arr_rgb * arr_a[..., None]
    pm = pm.reshape(h // ss, ss, w // ss, ss, 3).mean(axis=(1, 3))
    a = arr_a.reshape(h // ss, ss, w // ss, ss).mean(axis=(1, 3))
    return pm / np.maximum(a[..., None], 1e-6), a


def soft_dot(s, core=0.30, edge=0.5, ss=4):
    X, Y = grid(s, ss)
    d = np.sqrt(X * X + Y * Y) / (s / 2.0)
    a = np.clip((1.0 - d) / edge, 0, 1) ** 1.5
    a = np.minimum(1.0, a * 1.15)
    # pure white core, a faint cool tint only toward the soft rim (no grey dust on white snow)
    rim = np.clip(d, 0, 1)[..., None]
    rgb = np.ones(X.shape + (3,), np.float32) * (1 - rim * 0.5) + hexf('#E3EEFF') * rim * 0.5
    r, a = down(rgb, a, ss)
    return rgba(r, a)


def bokeh(s=64, ss=4):
    """Out-of-focus foreground flake: a FAINT cool fill (alpha <= ~60) with a slightly brighter soft
    rim, like a real lens bokeh - over a night sky it reads as a glint, never as a grey second moon."""
    X, Y = grid(s, ss)
    d = np.sqrt(X * X + Y * Y) / (s / 2.0)
    disc = np.clip((0.94 - d) / 0.10, 0, 1)                         # soft-edged disc
    rim = np.exp(-((d - 0.80) / 0.09) ** 2)                         # brighter ring just inside the edge
    a = disc * (0.20 + 0.16 * rim) + 0.03 * np.clip(1 - d, 0, 1)
    rgb = np.ones(X.shape + (3,), np.float32) * 0.55 + hexf('#DDEBFF') * 0.45
    r, a = down(rgb, np.clip(a, 0, 1), ss)
    im = rgba(r, a)
    return im.filter(ImageFilter.GaussianBlur(0.8))


def seg_dist(X, Y, ax, ay, bx, by):
    px, py = X - ax, Y - ay
    vx, vy = bx - ax, by - ay
    t = np.clip((px * vx + py * vy) / (vx * vx + vy * vy + 1e-9), 0, 1)
    return np.sqrt((px - vx * t) ** 2 + (py - vy * t) ** 2)


def flake(s, w=None, ss=4):
    """Six rounded arms with V branches + a hexagonal heart; white with an ice-blue edge."""
    X, Y = grid(s, ss)
    R = s * 0.44
    w = w or max(1.6, s * 0.065)
    d = np.full(X.shape, 1e9, np.float32)
    for k in range(6):
        a = math.radians(90 + 60 * k)
        ca, sa = math.cos(a), math.sin(a)
        d = np.minimum(d, seg_dist(X, Y, 0, 0, ca * R, sa * R))
        for t, L in ((0.55, 0.30), (0.78, 0.18)):
            bx, by = ca * R * t, sa * R * t
            for sg in (-1, 1):
                b2 = a + sg * math.radians(48)
                d = np.minimum(d, seg_dist(X, Y, bx, by, bx + math.cos(b2) * R * L, by + math.sin(b2) * R * L))
    # tip balls
    for k in range(6):
        a = math.radians(90 + 60 * k)
        d = np.minimum(d, np.sqrt((X - math.cos(a) * R) ** 2 + (Y - math.sin(a) * R) ** 2) - w * 0.45)
    d = np.minimum(d, np.sqrt(X * X + Y * Y) - s * 0.08)
    body = np.clip((w * 0.5 - d) * 1.0 + 0.5, 0, 1)
    edge = np.clip((w * 0.5 + max(1.2, s * 0.03) - d) * 1.0 + 0.5, 0, 1)
    rgb = np.ones(X.shape + (3,), np.float32)
    ice = hexf('#7FB8F0')
    inner = (body > 0.5).astype(np.float32)
    rgb = rgb * inner[..., None] + ice * (1 - inner[..., None])
    # light from the top: a hint of blue lower half
    rgb = rgb * (1 - 0.08 * np.clip(Y / R, 0, 1)[..., None]) + hexf('#CFE4FF') * 0.08 * np.clip(Y / R, 0, 1)[..., None]
    r, a = down(rgb, edge, ss)
    return rgba(r, a)


def twinkle(s=64, ss=4):
    X, Y = grid(s, ss)
    ax, ay = np.abs(X), np.abs(Y)
    L = s * 0.46
    # concave four-point star (astroid-like) + soft glow
    star = (np.sqrt(ax / L) + np.sqrt(ay / L)) < 0.62
    thin = (np.exp(-(ay / (s * 0.012)) ** 2) * np.clip(1 - ax / L, 0, 1) +
            np.exp(-(ax / (s * 0.012)) ** 2) * np.clip(1 - ay / L, 0, 1))
    glow = np.exp(-(X * X + Y * Y) / (2 * (s * 0.13) ** 2)) * 0.65
    a = np.clip(star.astype(np.float32) + thin * 0.8 + glow, 0, 1)
    rgb = np.ones(X.shape + (3,), np.float32)
    d = np.sqrt(X * X + Y * Y) / L
    rgb = rgb * (1 - 0.35 * np.clip(d * 1.6, 0, 1)[..., None]) + hexf('#FFE08A') * 0.35 * np.clip(d * 1.6, 0, 1)[..., None]
    r, a = down(rgb, a, ss)
    return rgba(r, a)


def glow(s=64, ss=2):
    X, Y = grid(s, ss)
    d = np.sqrt(X * X + Y * Y) / (s / 2.0)
    a = np.clip(1 - d, 0, 1) ** 2.2
    rgb = np.ones(X.shape + (3,), np.float32)
    r, a = down(rgb, a, ss)
    return rgba(r, a)


def pop_sheet(n=8, s=128, seed=3, ss=2):
    rnd = np.random.default_rng(seed)
    X, Y = grid(s, ss)
    frames = []
    balls = [(math.radians(a + rnd.uniform(-12, 12)), rnd.uniform(0.75, 1.15), rnd.uniform(4.5, 7.5))
             for a in range(0, 360, 45)]
    stars = [(math.radians(a), rnd.uniform(0.9, 1.1)) for a in (-110, -40, -150)]
    ice, gold, rim_c = hexf('#A8CBF2'), hexf('#FFD34D'), hexf('#6F9EDB')
    for f in range(n):
        t = f / (n - 1)
        acc_a = np.zeros(X.shape, np.float32)
        acc_rgb = np.zeros(X.shape + (3,), np.float32)

        def put(rgb, a):
            nonlocal acc_a, acc_rgb
            acc_rgb = acc_rgb * (1 - a[..., None]) + rgb * a[..., None]
            acc_a = acc_a * (1 - a) + a

        d = np.sqrt(X * X + Y * Y)
        # flash (first frames)
        if f <= 2:
            fl = np.clip(1 - d / (s * (0.16 + 0.10 * f)), 0, 1) ** 1.5 * (1.0 - f * 0.35)
            put(np.ones(X.shape + (3,), np.float32), fl)
        # ring
        Rr = s * (0.12 + 0.32 * (1 - (1 - t) ** 2))
        wr = s * (0.06 * (1 - t) + 0.012)
        wr = s * (0.05 * (1 - t) ** 1.5 + 0.008)
        ring = np.clip((wr - np.abs(d - Rr)) / 1.2 + 0.5, 0, 1) * (1 - t) ** 1.3
        ring_b = np.clip((wr + 2.2 - np.abs(d - Rr)) / 1.2 + 0.5, 0, 1) * (1 - t) ** 1.3
        put(np.zeros(X.shape + (3,), np.float32) + rim_c, ring_b * 0.85)
        put(np.ones(X.shape + (3,), np.float32) * 0.96 + ice * 0.04, ring * 0.95)
        # snow balls flying out, a little gravity, shrinking
        for (ang, sp, r0) in balls:
            dist = s * 0.40 * sp * (1 - (1 - t) ** 2.2)
            bx = math.cos(ang) * dist
            by = math.sin(ang) * dist + s * 0.10 * t * t
            r = r0 * (1 - 0.65 * t) * s / 128
            db = np.sqrt((X - bx) ** 2 + (Y - by) ** 2)
            fade = (1 - max(0, t - 0.75) * 4)
            put(np.zeros(X.shape + (3,), np.float32) + rim_c, np.clip(r + 1.4 - db + 0.5, 0, 1) * fade)
            a = np.clip(r - db + 0.5, 0, 1) * fade
            sh = np.clip((Y - by) / max(r, 1e-3), -1, 1)
            col = np.ones(X.shape + (3,), np.float32)[...] * (1 - 0.55 * np.clip(sh, 0, 1)[..., None]) + \
                ice * 0.55 * np.clip(sh, 0, 1)[..., None]
            put(col, a)
        # three gold stars popping up
        for (ang, sp) in stars:
            dist = s * 0.30 * sp * min(1.0, t * 1.6)
            sx, sy = math.cos(ang) * dist, math.sin(ang) * dist
            L = s * 0.075 * (math.sin(min(1.0, t * 1.3) * math.pi) + 0.15)
            ax, ay = np.abs(X - sx), np.abs(Y - sy)
            fade = (1 - max(0, t - 0.8) * 5)
            ob = ((np.sqrt(ax / max(L * 1.25, 1e-3)) + np.sqrt(ay / max(L * 1.25, 1e-3))) < 0.95).astype(np.float32)
            put(np.zeros(X.shape + (3,), np.float32) + hexf('#E0861A'), ob * fade)
            a = ((np.sqrt(ax / max(L, 1e-3)) + np.sqrt(ay / max(L, 1e-3))) < 0.95).astype(np.float32)
            put(gold[None, None, :] * np.ones(X.shape + (3,), np.float32), a * fade)
        straight = acc_rgb / np.maximum(acc_a[..., None], 1e-6)      # acc_rgb is premultiplied
        r, a = down(straight, acc_a, ss)
        frames.append(rgba(r, a))
    sheet = Image.new('RGBA', (s * n, s), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, (i * s, 0))
    return sheet


def emblem_small(px=48):
    """The 눈꽃 emblem from the main logo render (piece 'emblem'), shrunk (no ink)."""
    cache = os.environ.get('TTL_CACHE', '/tmp/fv_cache/title')
    import json
    p = os.path.join(cache, 'logo', 'logo_main.json')
    if not os.path.exists(p):
        return None
    info = json.load(open(p))
    idx = [k for k, v in info['pieces'].items() if v['name'] == 'emblem']
    if not idx:
        return None
    im = Image.open(os.path.join(cache, 'logo', 'logo_main_part%s.png' % idx[0])).convert('RGBA')
    bb = im.getchannel('A').getbbox()
    im = im.crop(bb)
    sq = max(im.size)
    big = Image.new('RGBA', (sq, sq), (0, 0, 0, 0))
    big.paste(im, ((sq - im.width) // 2, (sq - im.height) // 2))
    import ttl_post as P
    return P.premul_resize(big, (px, px))


def build(out_dir, rel, save_png):
    pieces = [('ttl_fx_snow_s', soft_dot(16)), ('ttl_fx_snow_m', soft_dot(28)), ('ttl_fx_snow_bokeh', bokeh(64)),
              ('ttl_fx_flake_s', flake(32)), ('ttl_fx_flake_m', flake(56)), ('ttl_fx_twinkle', twinkle(64)),
              ('ttl_fx_glow', glow(64))]
    em = emblem_small(48)
    if em is not None:
        pieces.append(('ttl_fx_bloom', em))
    # atlas: one row (all <= 64 px), 2 px gaps
    pad = 2
    W = sum(im.width for _n, im in pieces) + pad * (len(pieces) + 1)
    H = max(im.height for _n, im in pieces) + 2 * pad
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    frames, x = {}, pad
    for name, im in pieces:
        atlas.paste(im, (x, pad))
        frames[name] = {'frame': {'x': x, 'y': pad, 'w': im.width, 'h': im.height}, 'rotated': False,
                        'trimmed': False, 'spriteSourceSize': {'x': 0, 'y': 0, 'w': im.width, 'h': im.height},
                        'sourceSize': {'w': im.width, 'h': im.height}}
        x += im.width + pad
    png = save_png(atlas, 'ttl_fx', quant=False)
    import json
    with open(os.path.join(out_dir, 'ttl_fx.json'), 'w') as f:
        json.dump({'frames': frames, 'meta': {'app': 'tools/blender/ttl_fx.py', 'image': 'ttl_fx.png',
                                              'size': {'w': W, 'h': H}, 'scale': '1'}}, f, indent=1)
    notes = {
        'ttl_fx_snow_s': ('Soft round snowflake 16 px (far snow layer).', 'NORMAL'),
        'ttl_fx_snow_m': ('Soft round snowflake 28 px (mid snow layer).', 'NORMAL'),
        'ttl_fx_snow_bokeh': ('Out-of-focus foreground flake 64 px: faint cool disc with a brighter soft rim '
                              '(few, big, slow). ADD at alpha 0.3-0.5.', 'ADD'),
        'ttl_fx_flake_s': ('Crisp six-arm snowflake 32 px (rounded toy strokes, ice-blue edge).', 'NORMAL'),
        'ttl_fx_flake_m': ('Crisp six-arm snowflake 56 px.', 'NORMAL'),
        'ttl_fx_twinkle': ('Four-point star with glow 64 px: logo sparkles, star twinkles (scale-pulse).', 'ADD'),
        'ttl_fx_glow': ('Soft round white glow 64 px (tint warm for windows / lamps).', 'ADD'),
        'ttl_fx_bloom': ('Mini 눈꽃 emblem 48 px (a rare special flake, or a sparkle on the logo).', 'NORMAL'),
    }
    fr_sprites = {k: dict(anchor=[0.5, 0.5], kind='decor', blend=notes[k][1], notes=notes[k][0])
                  for k in frames}
    recs = [dict(type='atlas', key='ttl_fx', png=png, json='%s/ttl_fx.json' % rel, frames=fr_sprites)]
    sheet = pop_sheet()
    png2 = save_png(sheet, 'ttl_fx_pop', quant=False)
    recs.append(dict(type='sheet', key='ttl_fx_pop', png=png2, frameWidth=128, frameHeight=128, frameCount=8,
                     fps=30, repeat=0, anchor=[0.5, 0.6], blend='NORMAL',
                     notes='Quick pop when a building appears on the title (white ring, snow balls, 3 gold '
                           'stars), 0.27 s. Anchor = the building\'s ground point; scale 1-1.6 by building size. '
                           'Layer fx_poof (assets/fx) under it for a softer puff.'))
    meta = {'fx': {'reuse': ['fx_poof', 'fx_sparkle', 'fx_build_done', 'fx_snowflake', 'fx_spark', 'fx_glow',
                             'fx_ring'],
                   'snowRecipe': 'three layers: far ttl_fx_snow_s (60-90, scale 0.5-0.9, alpha 0.6, fall 20-40 px/s), '
                                 'mid ttl_fx_snow_m + ttl_fx_flake_s (25-40, scale 0.6-1, fall 40-70 px/s, sway), '
                                 'front ttl_fx_snow_bokeh (4-6, scale 0.8-1.6, blend ADD, alpha 0.3-0.5, fall 70-110 px/s); one '
                                 'ttl_fx_bloom every ~8 s. Logical px, 720-wide layout.'}}
    return recs, meta
