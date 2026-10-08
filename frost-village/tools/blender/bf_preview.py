"""
bf_preview.py - human previews of beachfolk (assets/townfolk + townfolk2 + beachfolk) via the reference compositor
tools/beachfolk_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/bf_preview.py [crowd|jobs|parts|gifs|proof|all]   -> docs/previews/beachfolk_*.png / .gif

  beachfolk_crowd.png (+ _2x)  60 random beach people on sand + a strip of sea: swimmers, floaters, surfers,
                               splashing kids, sunbathers on towels, sandcastle builders, ball players, staff
  beachfolk_jobs.png           the 12 presets x 3 seeds: idle S | walk SE | idle N | signature anim
  beachfolk_parts.png          the new wardrobe on several bases
  beachfolk_swim.gif / _float / _sunbathe / _dig / _ball / _splash / _surf   animated loops (2x)
  beachfolk_proof.png          full Blender renders (top) vs paper-doll composites (bottom)
Water anims are drawn with a placeholder ripple ring at the anchor (the game uses fx_swim_ripple from assets/water);
the beach ball / sandcastle / towel are simple placeholders drawn at ballPoint / digPoint / lieShadow.
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

import beachfolk_compose as bfc                    # noqa: E402
import tf_preview as tpv                           # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
SCRATCH = '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beachfolk'
font = tpv.font
SAND = np.array((241, 223, 182), np.float32)
WET = np.array((214, 190, 146), np.float32)
SHALLOW = np.array((128, 210, 206), np.float32)
MID = np.array((62, 170, 190), np.float32)
DEEP = np.array((36, 128, 166), np.float32)
INK = (43, 47, 58, 255)


# --------------------------------------------------------------------------- backgrounds

def beach_bg(W, H, shore, t=0.0, seed=3):
    """Sand (upper right) / sea (lower left) split by an iso shoreline y = shore(x).  t animates the sea."""
    rng = np.random.default_rng(seed)
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    s = np.array([shore(x) for x in range(W)], np.float32)[None, :]
    dist = (ys - s)                                     # > 0 = sea side (below the line)
    noise = rng.normal(0, 1, (H, W)).astype(np.float32)
    img = np.zeros((H, W, 3), np.float32)
    sand = SAND[None, None] + noise[..., None] * 4.0
    wet = np.clip(1 - (-dist) / 14.0, 0, 1)[..., None] * (dist <= 0)[..., None]
    sand = sand * (1 - wet) + WET * wet
    depth = np.clip(dist / 260.0, 0, 1)[..., None]
    sea = np.where(depth < 0.35, SHALLOW + (MID - SHALLOW) * (depth / 0.35),
                   MID + (DEEP - MID) * np.clip((depth - 0.35) / 0.65, 0, 1))
    # soft swell bands parallel to the shore + sparkle
    wave = 0.5 + 0.5 * np.sin((dist / 22.0) - t * 2 * math.pi + 0.15 * np.sin(xs / 37.0))
    sea = sea + (wave[..., None] - 0.5) * 9.0 + noise[..., None] * 2.0
    sea_m = (dist > 0)[..., None]
    img = np.where(sea_m, sea, sand)
    # foam lace on the waterline (moves up and down with t)
    foam_y = 3 + 4 * math.sin(t * 2 * math.pi)
    foam = np.clip(1 - np.abs(dist - foam_y) / 3.0, 0, 1) * (0.6 + 0.4 * np.sin(xs / 9.0 + t * 6)) ** 2
    img = img * (1 - foam[..., None] * 0.85) + 250 * foam[..., None] * 0.85
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    d = ImageDraw.Draw(out)
    prng = random.Random(seed)
    for _ in range(W * H // 9000):                      # shells / pebbles on the sand
        x, y = prng.randrange(W), prng.randrange(H)
        if y < shore(x) - 18:
            c = prng.choice([(250, 240, 228), (232, 196, 170), (214, 186, 150), (248, 220, 205)])
            d.ellipse([x, y, x + 2 + prng.random() * 2, y + 1 + prng.random()], fill=c + (255,))
    return out


def shadow(img, x, y, w, h, a=64):
    sh = Image.new('RGBA', (int(w * 2 + 4), int(h * 2 + 4)), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(110, 86, 50, a))
    paste(img, sh, int(x - w - 2), int(y - h - 2))


def ripple(img, x, y, k=1.0, t=0.0):
    d = ImageDraw.Draw(img, 'RGBA')
    rx, ry = 26 * k, 10.5 * k
    d.ellipse([x - rx, y - ry, x + rx, y + ry], outline=(255, 255, 255, 170), width=2)
    g = (t % 1.0)
    rx2, ry2 = rx * (1.1 + 0.6 * g), ry * (1.1 + 0.6 * g)
    d.ellipse([x - rx2, y - ry2, x + rx2, y + ry2], outline=(255, 255, 255, int(130 * (1 - g))), width=1)


def ellipse_poly(cx, cy, length, width, ang):
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    pts = []
    for k in range(28):
        t = k / 28 * math.tau
        u, v = math.cos(t) * length / 2, math.sin(t) * width / 2
        pts.append((cx + u * c - v * s, cy + u * s + v * c))
    return pts


def towel(img, x, y, sh, cols):
    """Striped beach towel under a sunbather (iso parallelogram along the body axis)."""
    d = ImageDraw.Draw(img, 'RGBA')
    ang = math.radians(sh['angleDeg'])
    u = (math.cos(ang), math.sin(ang))
    # the other iso axis (screen slope 0.5 with the opposite sign)
    v = (-0.894, 0.447) if u[0] * u[1] > 0 else (0.894, 0.447)
    cx, cy = x + sh['center'][0], y + sh['center'][1]
    L, Wd = sh['length'] * 0.56, sh['width'] * 1.05
    n = 6
    for k in range(n):
        a0, a1 = -L + 2 * L * k / n, -L + 2 * L * (k + 1) / n
        quad = [(cx + u[0] * a0 + v[0] * Wd, cy + u[1] * a0 + v[1] * Wd), (cx + u[0] * a1 + v[0] * Wd, cy + u[1] * a1 + v[1] * Wd),
                (cx + u[0] * a1 - v[0] * Wd, cy + u[1] * a1 - v[1] * Wd), (cx + u[0] * a0 - v[0] * Wd, cy + u[1] * a0 - v[1] * Wd)]
        d.polygon(quad, fill=cols[k % len(cols)] + (255,))
    d.polygon(ellipse_poly(cx, cy + 2, sh['length'] * 0.9, sh['width'] * 0.9, sh['angleDeg']), fill=(90, 70, 40, 40))


def ball(img, x, y, r):
    d = ImageDraw.Draw(img, 'RGBA')
    box = [x - r, y - r, x + r, y + r]
    d.ellipse(box, fill=(250, 248, 244, 255), outline=(70, 60, 60, 255))
    for k, c in enumerate([(232, 82, 74), (242, 194, 48), (61, 124, 201)]):
        d.pieslice(box, 90 + k * 120 - 30, 90 + k * 120 + 30, fill=c + (255,))
    d.ellipse([x - r * 0.25, y - r * 0.25, x + r * 0.25, y + r * 0.25], fill=(250, 248, 244, 255))
    d.ellipse(box, outline=(70, 60, 60, 220))


def castle(img, x, y, size=1.0):
    d = ImageDraw.Draw(img, 'RGBA')
    s = size
    d.ellipse([x - 16 * s, y - 6 * s, x + 16 * s, y + 7 * s], fill=(205, 176, 120, 255))
    d.polygon([(x - 11 * s, y + 1), (x + 11 * s, y + 1), (x + 9 * s, y - 13 * s), (x - 9 * s, y - 13 * s)],
              fill=(226, 198, 142, 255), outline=(170, 140, 90, 255))
    for dx in (-8, 0, 8):
        d.rectangle([x + (dx - 3) * s, y - 19 * s, x + (dx + 3) * s, y - 12 * s], fill=(234, 208, 152, 255),
                    outline=(170, 140, 90, 255))
    d.line([(x, y - 19 * s), (x, y - 27 * s)], fill=(120, 90, 60, 255), width=1)
    d.polygon([(x, y - 27 * s), (x + 7 * s, y - 24 * s), (x, y - 22 * s)], fill=(232, 82, 74, 255))


def splash_fx(img, x, y, t):
    d = ImageDraw.Draw(img, 'RGBA')
    rng = random.Random(int(x * 7 + y))
    for k in range(14):
        a = rng.uniform(-2.6, -0.5)
        sp = rng.uniform(10, 26)
        h = sp * t * 1.6 - 30 * t * t
        px, py = x + math.cos(a) * sp * t * 1.2, y - max(0, h)
        r = rng.uniform(1.2, 2.6)
        d.ellipse([px - r, py - r, px + r, py + r], fill=(235, 250, 255, int(230 * (1 - t))))


# --------------------------------------------------------------------------- people

WATER = ('swim', 'float', 'splash_play', 'surf')


MARGIN = 40          # compose margin: sunbathing heads / hat brims reach outside the 128 frame (never clipped in-game)


def paste(dst, src, x, y):
    """alpha_composite src onto dst with its top-left at (x, y); parts outside dst are cropped."""
    W, H = dst.size
    w, h = src.size
    x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    dst.alpha_composite(src.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


def draw_person(canvas, bf, p, anim, d, i, x, y, t=0.0, extras=True):
    """Ground fx + person; returns nothing.  (x, y) = anchor."""
    B = bf.T['bases'][p['base']]
    k = B.get('bodyK', 1.0)
    if anim in WATER:
        ripple(canvas, x, y, k * (1.15 if anim == 'float' else 1.0) * (1.6 if anim == 'surf' else 1.0), t)
    elif anim == 'sunbathe':
        pass
    else:
        sw, sh = B['shadow']
        shadow(canvas, x, y, int(sw * 0.55), int(sh * 0.6))
    b = bf.ball_point(p, anim, d, i) if extras and anim in ('ball_throw', 'ball_catch') else None
    if b and not b[2]:
        ball(canvas, x + b[0], y + b[1], b[3])
    fr = bf.compose(p, anim, d, i, margin=MARGIN)
    paste(canvas, fr, int(round(x - 64 - MARGIN)), int(round(y - 104 - MARGIN)))
    if b and b[2]:
        ball(canvas, x + b[0], y + b[1], b[3])


def ground_for(canvas, bf, p, anim, d, x, y):
    if anim == 'sunbathe':
        towel(canvas, x, y, bf.lie_shadow(p, d), random.Random(hash(str(p['colors']))).choice(
            [[(232, 82, 74), (250, 246, 238)], [(63, 184, 200), (250, 246, 238)], [(242, 194, 48), (61, 124, 201)],
             [(245, 154, 184), (250, 246, 238)], [(94, 154, 74), (242, 194, 48)]]))
    if anim == 'dig':
        dp = bf.dig_point(p, d)
        castle(canvas, x + dp[0], y + dp[1], 0.9 * bf.T['bases'][p['base']].get('bodyK', 1.0))


def caption(img, text, sub=None):
    W, H = img.size
    d = ImageDraw.Draw(img)
    hh = 52 if sub else 34
    d.rectangle([0, H - hh, W, H], fill=(33, 120, 160, 255))
    d.text((12, H - hh + 6), text, fill=(255, 255, 255, 255), font=font(15))
    if sub:
        d.text((12, H - 24), sub, fill=(220, 240, 248, 255), font=font(13))


# --------------------------------------------------------------------------- crowd

def crowd(bf, path, n=60, seed=2027):
    W, H = 1100, 760
    shore = lambda x: 500 - 0.5 * x                       # noqa: E731
    img = beach_bg(W, H, shore, 0.15, seed)
    rng = random.Random(seed)
    plan = []                                             # (y, x, person, anim, dir, frame)
    used = []

    def free(x, y, r=26):
        return all((x - a) ** 2 + ((y - b) * 1.6) ** 2 > r * r for a, b in used)

    def spot(water, tries=400):
        for _ in range(tries):
            x = rng.uniform(40, W - 40)
            if water:
                y = rng.uniform(shore(x) + 30, min(H - 40, shore(x) + 300))
            else:
                y = rng.uniform(max(110, shore(x) - 330), shore(x) - 34)
            if 90 < y < H - 20 and free(x, y):
                used.append((x, y))
                return x, y
        return None

    T = bf.T
    jobs = (['swim'] * 9 + ['float'] * 5 + ['surf'] * 3 + ['splash_play'] * 3 + ['sunbathe'] * 9 + ['dig'] * 5 +
            ['idle'] * 5 + ['walk'] * 7 + ['talk'] * 3 + ['wave'] * 2 + ['happy'] * 2 + ['sit'] * 1 + ['ball'] * 4 +
            ['staff'] * 2)
    jobs = jobs[:n]
    rng.shuffle(jobs)
    count = 0
    for job in jobs:
        if job == 'ball':
            continue
        water = job in WATER
        if job == 'splash_play':
            x = rng.uniform(80, W - 80)
            y = shore(x) + rng.uniform(10, 24)
            if not free(x, y):
                continue
            used.append((x, y))
        else:
            s = spot(water)
            if not s:
                continue
            x, y = s
        pr = {'swim': rng.choice(['swimmer', 'swimmer', 'family_beach', 'sunbather']), 'float': 'family_beach',
              'surf': 'surfer', 'splash_play': 'family_beach', 'sunbathe': 'sunbather', 'dig': 'family_beach',
              'staff': rng.choice(['lifeguard', 'icecream_vendor'])}.get(job) or rng.choice(
            ['swimmer', 'sunbather', 'family_beach', 'beach_tourist', 'beach_tourist', 'lifeguard', 'beach_bar_staff'])
        anim = {'staff': rng.choice(['idle', 'wave'])}.get(job, job)
        for _ in range(30):
            p = bf.preset(pr, rng=rng)
            if bf.can_play(p, anim):
                break
        else:
            continue
        dirs = T['anims'][anim]['dirs']
        d = rng.choice(dirs + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}.get(x_, x_) for x_ in dirs])
        i = rng.randrange(T['anims'][anim]['frames'])
        plan.append((y, x, p, anim, d, i))
        count += 1
    # two ball-playing pairs facing each other on the sand
    for _ in range(2):
        s = spot(False)
        if not s:
            continue
        x, y = s
        p1 = bf.preset('family_beach', rng=rng)
        p2 = bf.preset(rng.choice(['swimmer', 'beach_tourist']), rng=rng)
        if bf.can_play(p1, 'ball_throw') and bf.can_play(p2, 'ball_catch'):
            plan.append((y, x, p1, 'ball_throw', 'SE', 2))
            plan.append((y + 30, x + 60, p2, 'ball_catch', 'NW', 0))
            used.append((x + 60, y + 30))
            count += 2
    plan.sort(key=lambda e: e[0])
    for y, x, p, anim, d, i in plan:
        ground_for(img, bf, p, anim, d, x, y)
    for y, x, p, anim, d, i in plan:
        draw_person(img, bf, p, anim, d, i, x, y)
    caption(img, f'beachfolk crowd: {count} random beach people (1x, PPU 64)',
            'swim / float / surf / splash in the sea (anchor on the water surface), sunbathe on towels, dig, beach ball, '
            'strolling tourists & staff - tools/beachfolk_compose.py')
    img.convert('RGB').save(path, optimize=True)
    big = img.crop((40, 120, 640, 560)).resize((1200, 880), Image.NEAREST)
    big.convert('RGB').save(path.replace('.png', '_2x.png'), optimize=True)
    print('->', path, count)


# --------------------------------------------------------------------------- jobs sheet

SIGNATURE = {'swimmer': ('swim', 'S', 2), 'sunbather': ('sunbathe', 'SE', 0), 'family_beach': ('dig', 'S', 2),
             'lifeguard': ('wave', 'S', 2), 'bellhop': ('carry_walk', 'SE', 2), 'receptionist': ('talk', 'S', 0),
             'doorman': ('wave', 'SE', 1), 'housekeeper': ('push', 'SE', 3), 'icecream_vendor': ('push', 'S', 2),
             'beach_bar_staff': ('talk', 'SE', 0), 'surfer': ('surf', 'SE', 1), 'beach_tourist': ('clap', 'S', 2)}


CELL_AY = 100        # anchor y inside a 112 x 120 preview cell


def cell_bg(anim, w, h):
    if anim in WATER:
        return beach_bg(w, h, lambda x: -999, 0.0, 9)
    return beach_bg(w, h, lambda x: 9999, 0.0, 9)


def jobs_sheet(bf, path, seeds=(1, 2, 3)):
    G = bf.T['generator']['presets']
    names = list(SIGNATURE)
    cw, ch = 112, 120
    lw = 132
    frames = [('idle', 'S', 0), ('walk', 'SE', 2), ('idle', 'N', 1), None]
    W = lw + len(seeds) * (len(frames) * cw + 12)
    H = 40 + len(names) * ch
    img = Image.new('RGBA', (W, H), (236, 228, 208, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'Beachfolk presets (12 x 3 seeds): idle S | walk SE | idle N | signature anim', fill=INK, font=font(15))
    for r, pr in enumerate(names):
        y0 = 40 + r * ch
        lab = G[pr]['label']
        d.text((8, y0 + 40), lab['ko'], fill=INK, font=font(14))
        d.text((8, y0 + 60), pr, fill=(90, 96, 110, 255), font=font(11))
        for s_i, seed in enumerate(seeds):
            p = bf.preset(pr, seed=seed * 31 + r)
            for j, f in enumerate(frames):
                anim, dd, i = f or SIGNATURE[pr]
                x0 = lw + s_i * (len(frames) * cw + 12) + j * cw
                cell = cell_bg(anim, cw, ch)
                if anim in ('sunbathe', 'dig'):
                    ground_for(cell, bf, p, anim, dd, cw // 2, CELL_AY)
                draw_person(cell, bf, p, anim, dd, i, cw // 2, CELL_AY)
                img.alpha_composite(cell, (x0, y0))
    img.convert('RGB').save(path, optimize=True)
    print('->', path)


def parts_sheet(bf, path):
    P = bf.T['parts']
    looks = [
        ('child_slim', 'kidlash', ['hair_twintails', 'bare_skin', 'bare_arms', 'swimsuit_one', 'arm_floaties', 'swim_ring_worn'],
         dict(swim='#F59AB8', swim2='#F7F5F0', float='#F08A3A', ring='#3FB8C8', ring2='#F7F5F0', hair='#5A3A26')),
        ('child_round', 'kid', ['hair_short', 'bare_skin', 'bare_arms', 'rash_guard', 'swim_trunks', 'snorkel_mask', 'swim_cap'],
         dict(top='#3FB8C8', top2='#F2C230', swim='#2B3A5E', swim2='#F2C230', acc='#F08A3A', hat='#F2C230', hat2='#3D7CC9')),
        ('adult_slim', 'std', ['hair_short', 'bare_skin', 'bare_arms', 'no_top', 'swim_trunks', 'flip_flops', 'sunglasses',
                               'towel_shoulder'],
         dict(swim='#3D7CC9', swim2='#F7F5F0', shoes='#E8524A', acc='#F2C230', acc2='#E8524A', glasses='#2B2F3A')),
        ('adult_slim', 'lash', ['hair_bob', 'bare_skin', 'bare_arms', 'swimsuit_one', 'sun_hat_wide', 'flip_flops', 'sunglasses'],
         dict(swim='#2E8A8A', swim2='#F7F5F0', hat='#F4E8C8', hat2='#E8524A', shoes='#F59AB8', glasses='#F59AB8')),
        ('adult_round', 'bold', ['hair_short', 'bare_skin', 'bare_arms', 'lifeguard_top', 'swim_trunks', 'whistle', 'sun_visor',
                                 'sunglasses', 'rescue_tube'],
         dict(top='#D8302A', swim='#F2C230', swim2='#D8302A', hat='#D8302A', hat2='#F2C230', glasses='#2B2F3A')),
        ('adult_slim', 'std', ['hair_long', 'bare_skin', 'wetsuit'], dict(top='#2B2F3A', top2='#3FB8C8', hair='#C89A52')),
        ('elder_round', 'elder', ['hair_bald', 'bare_skin', 'bare_arms', 'aloha_shirt', 'beach_shorts', 'flip_flops',
                                  'tourist_camera', 'straw_hat', 'sunglasses', 'fh_moustache'],
         dict(top='#E8524A', top2='#F2C230', bottom='#E8DCC0', shoes='#3FB8C8', hat2='#2B3A5E', glasses='#C9A045',
              hair='#BEBCB8')),
        ('elder_slim', 'elder', ['hair_lowbun', 'bare_skin', 'bare_arms', 'swimsuit_one', 'swim_cap_flower'],
         dict(swim='#2B3A5E', swim2='#F7F5F0', hat='#F7F5F0', hat2='#F59AB8', hair='#BEBCB8')),
        ('adult_slim', 'std', ['hair_sidepart', 'bellhop_jacket', 'bot_pants', 'shoe_shoes', 'bellhop_cap'],
         dict(top='#8A2432', hat='#8A2432', bottom='#2B2F3A', shoes='#1E1E26')),
        ('adult_slim', 'lash', ['hair_bun', 'hotel_vest', 'bot_skirt', 'shoe_shoes'],
         dict(top='#2B3A5E', top2='#F7F5F0', acc2='#C9A045', bottom='#2B2F3A', bottom2='#2E3440', shoes='#1E1E26')),
        ('adult_round', 'bold', ['hair_short', 'fh_moustache', 'doorman_coat', 'bot_pants', 'shoe_shoes', 'doorman_hat'],
         dict(top='#1F4A3A', hat='#1F4A3A', bottom='#2B2F3A', shoes='#1E1E26')),
        ('adult_slim', 'lash', ['hair_lowbun', 'housekeeper_dress', 'bot_tights', 'shoe_shoes', 'kerchief'],
         dict(top='#BFE3EA', hat='#F7F5F0', hat2='#3F5675', bottom2='#F4F1EA', shoes='#1E1E26')),
        ('adult_slim', 'std', ['hair_curly', 'bare_skin', 'bare_arms', 'vendor_shirt', 'beach_shorts', 'shoe_shoes',
                               'paper_cap'],
         dict(top='#F7F5F0', top2='#F59AB8', hat='#F7F5F0', hat2='#F59AB8', acc='#BFE3EA', acc2='#E8524A',
              bottom='#F4E8C8', shoes='#F7F5F0')),
        ('adult_slim', 'std', ['hair_wavy', 'bare_skin', 'bare_arms', 'aloha_shirt', 'beach_shorts', 'bar_apron', 'flip_flops'],
         dict(top='#2E8A8A', top2='#F7F5F0', bottom='#C8A878', acc='#2B2F3A', shoes='#F2C230', skin='#C98E6A')),
    ]
    frames = [('idle', 'S', 0), ('walk', 'SE', 2), ('idle', 'N', 1), ('wave', 'S', 2)]
    cw, ch = 112, 120
    cols_per_row = 2
    rows = (len(looks) + 1) // 2
    W = cols_per_row * (len(frames) * cw + 280)
    H = 40 + rows * ch
    img = Image.new('RGBA', (W, H), (236, 228, 208, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'Beachfolk wardrobe on different bases (idle S | walk SE | idle N | wave S)', fill=INK, font=font(15))
    for k, (base, face, parts, cols) in enumerate(looks):
        c = dict(skin='#F2C29A', hair='#3A2A22', top='#3D7CC9', top2='#F4EDE0', fur='#F4F1EA', bottom='#3B3F52',
                 bottom2='#2E3440', shoes='#6B4A2E', hat='#D9483B', hat2='#F4EDE0', acc='#F2C230', acc2='#D9483B',
                 bag='#8A5A33', glasses='#2B2F3A', swim='#E8524A', swim2='#F7F5F0', ring='#E8524A', ring2='#F7F5F0',
                 float='#F08A3A', board='#F2C230', board2='#3D7CC9', toy='#3D7CC9')
        c.update(cols)
        c['hands'] = c['skin']
        top = next((p for p in parts if P[p]['family'] == 'top'), None)
        c['sleeve'] = c['skin'] if 'bare_arms' in parts else c.get(P[top].get('sleeves', 'top'), c['top']) if top else c['top']
        p = {'base': base, 'face': face, 'nose': 'dot', 'parts': parts, 'colors': c}
        x0 = (k % cols_per_row) * (len(frames) * cw + 280)
        y0 = 40 + (k // cols_per_row) * ch
        lab = ', '.join(P[q]['label']['ko'] for q in parts if q not in ('bare_skin', 'bare_arms', 'no_top') and
                        not q.startswith('hair_') and not q.startswith('fh_'))
        d.text((x0 + 8, y0 + 30), base, fill=INK, font=font(12))
        for li, chunk in enumerate([lab[j:j + 18] for j in range(0, len(lab), 18)][:4]):
            d.text((x0 + 8, y0 + 50 + li * 15), chunk, fill=(90, 96, 110, 255), font=font(11))
        for j, (anim, dd, i) in enumerate(frames):
            if not bf.can_play(p, anim):
                continue
            cell = cell_bg(anim, cw, ch)
            draw_person(cell, bf, p, anim, dd, i, cw // 2, CELL_AY)
            img.alpha_composite(cell, (x0 + 160 + j * cw, y0))
    img.convert('RGB').save(path, optimize=True)
    print('->', path)


# --------------------------------------------------------------------------- GIFs

def save_gif(frames, path, fps):
    rgb = [f.convert('RGB') for f in frames]
    pal = rgb[len(rgb) // 2].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in rgb]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / fps), loop=0, optimize=True)
    print('->', path, len(frames))


def anim_gif(bf, path, anim, people, n, fps, water, W=520, H=200, scale=2, shore=None, extra=None):
    """people: [(person, dir, x, y)] at 1x; n frames."""
    frames = []
    for t in range(n):
        if shore is not None:
            bg = beach_bg(W, H, shore, t / n, 5)
        else:
            bg = beach_bg(W, H, (lambda x: -999) if water else (lambda x: 9999), t / n, 5)
        for p, d, x, y in sorted(people, key=lambda e: e[3]):
            ground_for(bg, bf, p, anim, d, x, y)
        for p, d, x, y in sorted(people, key=lambda e: e[3]):
            nf = bf.T['anims'][anim]['frames']
            i = t % nf
            draw_person(bg, bf, p, anim, d, i, x, y, t=t / n)
            if extra:
                extra(bg, p, d, i, x, y, t / n)
        frames.append(bg.resize((W * scale, H * scale), Image.NEAREST))
    save_gif(frames, path, fps)


def pick(bf, rng, preset, anim, base=None):
    for _ in range(80):
        p = bf.preset(preset, rng=rng)
        if bf.can_play(p, anim) and (base is None or bf.T['bases'][p['base']]['age'] == base):
            return p
    raise RuntimeError(f'no {preset} for {anim}')


def gifs(bf, seed=9):
    rng = random.Random(seed)
    dirs = ['S', 'SE', 'E', 'NE', 'N', 'SW']
    ppl = [(pick(bf, rng, ['swimmer', 'family_beach', 'lifeguard'][k % 3], 'swim', ['adult', 'child', None][k % 3]),
            dirs[k], 50 + k * 84, 120 + (k % 2) * 34) for k in range(6)]
    anim_gif(bf, os.path.join(PREV, 'beachfolk_swim.gif'), 'swim', ppl, 16, 10, True, W=560, H=190)
    ppl = [(pick(bf, rng, 'family_beach', 'float', ['child', 'adult', 'child'][k]), ['S', 'SE', 'SW'][k],
            80 + k * 120, 120 + (k % 2) * 20) for k in range(3)]
    anim_gif(bf, os.path.join(PREV, 'beachfolk_float.gif'), 'float', ppl, 8, 4, True, W=400, H=180)
    ppl = [(pick(bf, rng, 'sunbather', 'sunbathe'), d_, 70 + k * 120, 110 + (k % 2) * 30)
           for k, d_ in enumerate(['SE', 'NE', 'SW', 'NW'])]
    anim_gif(bf, os.path.join(PREV, 'beachfolk_sunbathe.gif'), 'sunbathe', ppl, 8, 3, False, W=520, H=190)
    ppl = [(pick(bf, rng, 'family_beach', 'dig', ['child', 'child', 'adult'][k]), ['S', 'SE', 'SW'][k],
            80 + k * 130, 100) for k in range(3)]
    anim_gif(bf, os.path.join(PREV, 'beachfolk_dig.gif'), 'dig', ppl, 12, 8, False, W=420, H=170)
    ppl = [(pick(bf, rng, 'family_beach', 'splash_play', 'child'), ['SE', 'S', 'SW'][k], 90 + k * 120, 116)
           for k in range(3)]
    events = {}

    def splash_extra(img, p, d, i, x, y, tt):
        imp = bf.T['anims']['splash_play']['impactFrame']
        ph = (i - imp) % 6
        if ph <= 3:
            sp = bf.splash_point(p, d)
            splash_fx(img, x + sp[0], y + sp[1], (ph + 0.5) / 4)
    anim_gif(bf, os.path.join(PREV, 'beachfolk_splash.gif'), 'splash_play', ppl, 12, 10, True, W=420, H=180,
             shore=lambda x: 64, extra=splash_extra)
    ppl = [(pick(bf, rng, 'surfer', 'surf', 'adult'), d_, 80 + k * 150, 120 + (k % 2) * 20)
           for k, d_ in enumerate(['SE', 'NE', 'SW'])]
    anim_gif(bf, os.path.join(PREV, 'beachfolk_surf.gif'), 'surf', ppl, 8, 6, True, W=460, H=200)
    ball_gif(bf, os.path.join(PREV, 'beachfolk_ball.gif'), rng)


def ball_gif(bf, path, rng):
    """Thrower (SE) and catcher (NW) toss a beach ball back and forth: release on ball_throw impactFrame,
    arrival on ball_catch impactFrame; the roles swap every throw."""
    a = pick(bf, rng, 'family_beach', 'ball_throw', 'child')
    b = pick(bf, rng, 'beach_tourist', 'ball_catch', 'adult')
    W, H = 420, 210
    pos = {0: (120, 110), 1: (300, 170)}
    dirs = {0: 'SE', 1: 'NW'}
    people = [a, b]
    timp = bf.T['anims']['ball_throw']['impactFrame']
    cimp = bf.T['anims']['ball_catch']['impactFrame']
    flight = 5
    frames = []
    for rnd in range(2):
        thr, cat = rnd % 2, 1 - rnd % 2
        n_t = 6
        total = timp + flight + (6 - cimp)
        for t in range(total):
            bg = beach_bg(W, H, lambda x: 9999, 0, 5)
            st = {}
            ti = min(t, 5)
            ci = t - (timp + flight - cimp)
            st[thr] = ('ball_throw', min(ti, n_t - 1)) if t < 6 else ('idle', t % 4)
            st[cat] = ('ball_catch', max(0, min(ci, 5))) if ci >= 0 else ('ball_catch', 0)
            order = sorted([0, 1], key=lambda k: pos[k][1])
            for k in order:
                anim, i = st[k]
                d_ = dirs[k]
                x, y = pos[k]
                draw_person(bg, bf, people[k], anim, d_, i, x, y)
            if timp < t < timp + flight:
                p0 = bf.ball_point(people[thr], 'ball_throw', dirs[thr], timp)
                p1 = bf.ball_point(people[cat], 'ball_catch', dirs[cat], cimp)
                x0, y0 = pos[thr][0] + p0[0], pos[thr][1] + p0[1]
                x1, y1 = pos[cat][0] + p1[0], pos[cat][1] + p1[1]
                u = (t - timp) / flight
                ball(bg, x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - 60 * u * (1 - u) * 4 * 0.5, p0[3])
            frames.append(bg.resize((W * 2, H * 2), Image.NEAREST))
    save_gif(frames, path, 8)


# --------------------------------------------------------------------------- proof

def proof(bf, path, full_dir=os.path.join(SCRATCH, 'proof')):
    import bf_presets as bpr
    combos = [c for c in bpr.LOOK + bpr.LOOK_JOBS]
    frames = [('idle', 'S', 0), ('swim', 'S', 2), ('float', 'SE', 1), ('sunbathe', 'SE', 0), ('dig', 'SE', 2),
              ('ball_throw', 'S', 3), ('splash_play', 'S', 2), ('surf', 'SE', 1), ('walk', 'SE', 2), ('talk', 'E', 0)]
    rows = []
    for c in combos:
        if not os.path.isdir(os.path.join(full_dir, c['name'])):
            continue
        cols = dict(c['colors'])
        for slot in ('ring', 'ring2', 'float', 'board', 'board2', 'toy', 'swim', 'swim2'):
            cols.setdefault(slot, {'ring': '#E8524A', 'ring2': '#F7F5F0', 'board': '#F2C230', 'board2': '#3D7CC9'}.get(
                slot, '#3D7CC9'))
        person = {'base': c['base'], 'face': c['face'], 'nose': c['nose'], 'parts': c['parts'], 'colors': cols}
        rows.append((c['name'], person))
    sc = 2
    cw = 96 * sc
    W = 150 + len(frames) * cw
    H = 40 + len(rows) * 2 * 112 * sc
    img = Image.new('RGBA', (W, H), (236, 228, 208, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'Proof: full Blender render (upper) vs layered composite (lower), 2x', fill=INK, font=font(15))
    diffs = []
    for r, (name, person) in enumerate(rows):
        y0 = 40 + r * 2 * 112 * sc
        d.text((8, y0 + 100), name, fill=INK, font=font(13))
        for j, (anim, dd, i) in enumerate(frames):
            fp = os.path.join(full_dir, name, f'{anim}_{dd}_{i}.png')
            if not os.path.exists(fp) or not bf.can_play(person, anim):
                continue
            full = Image.open(fp).convert('RGBA')
            comp = bf.compose(person, anim, dd, i)
            a = np.asarray(full).astype(np.float32)
            b = np.asarray(comp).astype(np.float32)
            m = (a[..., 3] > 128) | (b[..., 3] > 128)
            if m.sum():
                diffs.append(float(np.abs(a[..., :3] - b[..., :3])[m].mean()))
            for k, im in enumerate((full, comp)):
                cell = cell_bg(anim, 96, 112)
                cell.alpha_composite(im.crop((16, 8, 112, 120)))
                img.alpha_composite(cell.resize((cw, 112 * sc), Image.NEAREST), (150 + j * cw, y0 + k * 112 * sc))
    img.convert('RGB').save(path, optimize=True)
    print('->', path, 'mean |diff| %.1f / 255 over %d frames' % (float(np.mean(diffs)) if diffs else -1, len(diffs)))


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    bf = bfc.Beachfolk.from_assets(os.environ.get('BF_ASSETS', bfc.ASSETS))
    global PREV
    PREV = os.environ.get('BF_PREV', PREV)
    os.makedirs(PREV, exist_ok=True)
    if what in ('crowd', 'all'):
        crowd(bf, os.path.join(PREV, 'beachfolk_crowd.png'))
    if what in ('jobs', 'all'):
        jobs_sheet(bf, os.path.join(PREV, 'beachfolk_jobs.png'))
    if what in ('parts', 'all'):
        parts_sheet(bf, os.path.join(PREV, 'beachfolk_parts.png'))
    if what in ('gifs', 'all'):
        gifs(bf)
    if what in ('proof', 'all'):
        proof(bf, os.path.join(PREV, 'beachfolk_proof.png'))


if __name__ == '__main__':
    main()
