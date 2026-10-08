"""
cf_preview.py - human previews of the cityfolk fragment (assets/townfolk + townfolk2 + cityfolk) via the reference
compositor tools/cityfolk_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/cf_preview.py [jobs anims crowd gifs proof]     # -> docs/previews/cityfolk_*

  cityfolk_jobs.png     every preset x 3 people: idle S / walk SE / its signature anim / idle N
  cityfolk_anims.png    the twelve new anims on child / adult / elder (slim + round) bases
  cityfolk_crowd.png    80 mixed townsfolk + cityfolk around a small incident (+ cityfolk_crowd_1x.png)
  cityfolk_<anim>.gif   run / flee / argue / fight / arrested_walk / spray_hose / point / think / shocked / phone /
                        carry_box / sweep - a few people in several directions at the anim's fps
  cityfolk_proof.png    full Blender look-dev renders vs the paper-doll composites from the atlases
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from cityfolk_compose import Cityfolk           # noqa: E402
import tf_preview as tpv                         # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
ASSETS = os.path.join(GAME, 'assets')
SNOW = (238, 243, 249, 255)
INK = (43, 47, 58, 255)
font = tpv.font
ANIMS3 = ['run', 'flee', 'argue', 'fight', 'arrested_walk', 'spray_hose', 'point', 'think', 'shocked', 'phone',
          'carry_box', 'sweep']
SIGNATURE = {'firefighter': ('spray_hose', 'SE', 1), 'police_officer': ('run', 'SE', 3), 'detective': ('think', 'S', 0),
             'burglar': ('flee', 'S', 1), 'banker': ('think', 'SE', 2), 'bank_teller': ('phone', 'S', 0),
             'warehouse_worker': ('carry_box', 'SE', 3), 'forklift_driver': ('point', 'SE', 1),
             'delivery_driver': ('carry_box', 'S', 2), 'mover': ('carry_box', 'E', 5),
             'construction_worker': ('sweep', 'SE', 2), 'demolition_worker': ('sweep', 'S', 1),
             'reporter': ('phone', 'SE', 2)}
PRESETS = list(SIGNATURE)


def shadow(img, x, y, w, h, a=64):
    sh = Image.new('RGBA', (w * 2 + 4, h * 2 + 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(80, 100, 130, a))
    img.alpha_composite(sh, (int(x - w - 2), int(y - h - 2)))


def person_at(canvas, tf, p, anim, d, i, x, y, face=None, scale=1, no_items=False):
    fr = tf.compose(p, anim, d, i, face=face, no_items=no_items)
    sw, sh = tf.T['bases'][p['base']]['shadow']
    shadow(canvas, x, y, int(sw * 0.55 * scale), int(sh * 0.6 * scale))
    if scale != 1:
        fr = fr.resize((128 * scale, 128 * scale), Image.NEAREST)
    canvas.alpha_composite(fr, (int(round(x - 64 * scale)), int(round(y - 104 * scale))))


def caption(img, text, sub=None):
    W, H = img.size
    d = ImageDraw.Draw(img)
    hh = 52 if sub else 34
    d.rectangle([0, H - hh, W, H], fill=(33, 94, 168, 255))
    d.text((12, H - hh + 6), text, fill=(255, 255, 255, 255), font=font(15))
    if sub:
        d.text((12, H - 24), sub, fill=(220, 232, 248, 255), font=font(13))


def crop(fr, sc):
    return fr.crop((20, 0, 108, 124)).resize((88 * sc // 2, 124 * sc // 2), Image.NEAREST)


# --------------------------------------------------------------------------- sheets

def jobs(tf, path, seed=8):
    rng = random.Random(seed)
    sc = 3
    cw, ch = 88 * sc // 2, 124 * sc // 2
    views = [('idle', 'S', 0), ('walk', 'SE', 2), None, ('idle', 'N', 1)]
    W = 150 + 3 * (4 * cw + 24)
    H = 44 + len(PRESETS) * (ch + 10)
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'Cityfolk presets (13 x 3 people): idle S / walk SE / signature anim / idle N', fill=INK,
           font=font(18))
    for r, pr in enumerate(PRESETS):
        y0 = 44 + r * (ch + 10)
        lab = tf.T['generator']['presets'][pr]['label']
        d.text((8, y0 + ch // 2 - 22), lab['ko'], fill=INK, font=font(16))
        d.text((8, y0 + ch // 2 + 2), lab['en'], fill=tpv.SUB, font=font(13))
        for k in range(3):
            p = tf.preset(pr, rng=rng)
            for c, v in enumerate(views):
                a, dd, i = v or SIGNATURE[pr]
                a2, face = tf.pick_anim(p, a)
                fr = tf.compose(p, a2, dd, min(i, tf.T['anims'][a2]['frames'] - 1), face=face)
                x0 = 150 + k * (4 * cw + 24) + c * cw
                img.alpha_composite(crop(fr, sc), (x0, y0))
                if v is None:
                    d.text((x0 + 4, y0 + ch - 16), a2 if a2 == a else f'{a}->{a2}', fill=tpv.SUB, font=font(11))
    img.convert('RGB').save(path, optimize=True)


def anims_sheet(tf, path, seed=11):
    rng = random.Random(seed)
    people = []
    for base in ('child_slim', 'child_round', 'adult_slim', 'adult_round', 'elder_slim', 'elder_round'):
        for _ in range(400):
            p = tf.random_person(rng=rng)
            if p['base'] == base and all(tf.can_play(p, a) for a in ('run', 'flee', 'carry_box', 'spray_hose', 'fight',
                                                                         'arrested_walk', 'sweep')):
                break
        people.append(p)
    frames = [('run', 'SE', 2), ('flee', 'S', 1), ('arrested_walk', 'N', 3), ('carry_box', 'SE', 1), ('argue', 'S', 0),
              ('fight', 'SE', 1), ('point', 'S', 1), ('think', 'S', 0), ('shocked', 'S', 1), ('phone', 'SE', 0),
              ('sweep', 'S', 1), ('spray_hose', 'SE', 1)]
    sc = 2
    cw, ch = 88 * sc // 2 * 2 // 2 * 1, 124
    cw, ch = 88, 124
    W, H = 150 + len(frames) * cw, 50 + len(people) * (ch + 6)
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'cityfolk anims on every base (random everyday outfits that the cast covers; 1x)', fill=INK,
           font=font(16))
    for c, (a, dd, i) in enumerate(frames):
        d.text((150 + c * cw + 2, 32), f'{a} {dd}', fill=tpv.SUB, font=font(10))
    for r, p in enumerate(people):
        y0 = 50 + r * (ch + 6)
        d.text((8, y0 + ch // 2 - 10), p['base'].replace('_', ' '), fill=INK, font=font(14))
        for c, (a, dd, i) in enumerate(frames):
            a2, face = tf.pick_anim(p, a)
            fr = tf.compose(p, a2, dd if dd in tf.T['anims'][a2]['dirs'] else 'SE', i, face=face)
            img.alpha_composite(fr.crop((20, 0, 108, 124)), (150 + c * cw, y0))
    img = img.resize((img.size[0] * 2, img.size[1] * 2), Image.NEAREST)
    img.convert('RGB').save(path, optimize=True)


def crowd(tf, path, n=80, seed=2027):
    rng = random.Random(seed)
    W, H = 1600, 1000
    img = Image.new('RGBA', (W, H), SNOW)
    d = ImageDraw.Draw(img)
    cx, cy = W // 2, H // 2 + 30
    d.polygon([(cx, cy - 330), (cx + 660, cy), (cx, cy + 330), (cx - 660, cy)], fill=(217, 160, 138, 255))
    d.polygon([(cx, cy - 300), (cx + 600, cy), (cx, cy + 300), (cx - 600, cy)], fill=(225, 172, 150, 255))
    # scorch mark of a little fire at the back (stand-in for assets/fx_city)
    d.ellipse([cx - 120, cy - 260, cx + 120, cy - 200], fill=(150, 120, 112, 255))
    people = []
    presets = PRESETS + ['firefighter', 'police_officer', 'burglar', 'reporter']
    for k in range(n):
        gx, gy = k % 10, k // 10
        x = cx + (gx - gy) * 60 + rng.uniform(-8, 8)
        y = cy - 240 + (gx + gy) * 28 + rng.uniform(-5, 5)
        if k % 2 == 0:
            pr = presets[(k // 2) % len(presets)]
            p = tf.preset(pr, rng=rng)
            a = SIGNATURE.get(pr, ('idle', 'S', 0))[0] if rng.random() < 0.7 else rng.choice(['idle', 'walk', 'talk'])
        else:
            p = tf.random_person(rng=rng)
            a = rng.choice(['shocked', 'point', 'phone', 'think', 'run', 'flee', 'argue', 'walk', 'idle', 'talk',
                            'carry_box', 'sweep'])
        a2, face = tf.pick_anim(p, a)
        info = tf.T['anims'][a2]
        dd = rng.choice(info['dirs'] + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}.get(x_, x_) for x_ in info['dirs']])
        people.append((y, x, p, a2, dd, rng.randrange(info['frames']), face))
    people.sort(key=lambda t: t[0])
    for y, x, p, a, dd, i, face in people:
        person_at(img, tf, p, a, dd, i, x, y, face=face)
    caption(img, 'Cityfolk crowd at 1x: 80 people (half city presets, half random townsfolk) around a small fire',
            'firefighters spray, police chase, a burglar flees, movers carry boxes, the crowd is shocked / points / '
            'phones - everybody falls back gracefully when an outfit has no frames for an anim')
    img.convert('RGB').save(path.replace('.png', '_1x.png'), optimize=True)
    big = img.crop((cx - 520, cy - 330, cx + 520, cy + 330)).resize((2080, 1320), Image.NEAREST)
    big.convert('RGB').save(path, optimize=True)


# --------------------------------------------------------------------------- gifs

def anim_gif(tf, anim, path, seed=5):
    rng = random.Random(seed + len(anim))
    info = tf.T['anims'][anim]
    dirs = info['dirs'] + [{'SE': 'SW', 'E': 'W', 'NE': 'NW'}[x] for x in info['dirs'] if x in ('SE', 'E', 'NE')]
    pr_for = {'spray_hose': 'firefighter', 'flee': 'burglar', 'arrested_walk': 'burglar', 'carry_box': 'mover',
              'sweep': 'construction_worker', 'phone': 'reporter', 'think': 'detective', 'point': 'police_officer',
              'run': 'police_officer', 'argue': 'banker', 'fight': 'burglar', 'shocked': 'bank_teller'}
    cast = []
    pr = tf.preset(pr_for[anim], rng=rng)
    if tf.can_play(pr, anim):
        cast.append(pr)
    for base in ('child_slim', 'adult_round', 'elder_slim', 'adult_slim'):
        for _ in range(400):
            p = tf.random_person(rng=rng)
            if p['base'] == base and tf.can_play(p, anim):
                cast.append(p)
                break
    n = max(len(dirs), 5)
    W, H = 110 * n + 40, 210
    frames = []
    loops = 2 if info['frames'] >= 6 else 3
    for t in range(info['frames'] * loops):
        img = Image.new('RGBA', (W, H), SNOW)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 150, W, H], fill=(230, 236, 244, 255))
        for k in range(n):
            p = cast[k % len(cast)]
            dd = dirs[k % len(dirs)]
            i = (t + k) % info['frames']
            x, y = 75 + k * 110, 150
            person_at(img, tf, p, anim, dd, i, x, y)
            if anim == 'spray_hose':
                nz = tf.nozzle_point(p, dd, i)
                if nz:
                    sx, sy = x + nz[0], y + nz[1]
                    for s in range(14):                      # stand-in water arc (fx_hose_stream draws the real one)
                        u = s * 4.0
                        px, py = sx + nz[2] * u, sy + nz[3] * u + 0.02 * u * u
                        d.ellipse([px - 2, py - 2, px + 2, py + 2], fill=(150, 205, 245, 220))
            if anim == 'sweep':
                sp = tf.sweep_point(p, dd, i)
                if sp and i % 3 == 0:
                    d.ellipse([x + sp[0] - 6, y + sp[1] - 3, x + sp[0] + 6, y + sp[1] + 3], fill=(250, 252, 255, 200))
        info_t = f'{anim}: {info["frames"]} f, {info["fps"]} fps, dirs {"/".join(info["dirs"])} (+ mirrored)'
        caption(img, info_t)
        frames.append(img.convert('RGB'))
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / info['fps']), loop=0,
                   optimize=True)


# --------------------------------------------------------------------------- proof

def proof(tf, path, full_dir='/tmp/fv_cache/cityfolk/look_proof'):
    import cf_presets as LK
    if not os.path.isdir(full_dir):
        return False
    rows = []
    for c in LK.LOOK:
        fd = os.path.join(full_dir, c['name'])
        if not os.path.isdir(fd):
            continue
        p = {'base': c['base'], 'parts': list(c['parts']), 'face': c['face'], 'nose': c['nose'],
             'colors': dict(c['colors'])}
        rows.append((c['name'], p, fd, LK.LOOK_FRAMES[c['name']][:10]))
    if not rows:
        return False
    sc = 2
    cw, ch = 88 * sc // 2 * 2 // 2, 124
    cw, ch = 88 * 2, 124 * 2
    W = 130 + 10 * cw
    H = 40 + len(rows) * (2 * ch + 10)
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'cityfolk proof: full Blender render (top) vs paper-doll composite from the atlases (bottom)',
           fill=INK, font=font(16))
    for r, (name, p, fd, frames) in enumerate(rows):
        y0 = 40 + r * (2 * ch + 10)
        d.text((8, y0 + ch - 8), name, fill=INK, font=font(14))
        for c_, (a, dd, i) in enumerate(frames):
            fp = os.path.join(fd, f'{a}_{dd}_{i}.png')
            x0 = 130 + c_ * cw
            if os.path.exists(fp):
                full = Image.open(fp).convert('RGBA')
                img.alpha_composite(full.crop((20, 0, 108, 124)).resize((cw, ch), Image.NEAREST), (x0, y0))
            if a in tf.T['anims'] and tf.can_play(p, a):
                comp = tf.compose(p, a, dd, i)
                img.alpha_composite(comp.crop((20, 0, 108, 124)).resize((cw, ch), Image.NEAREST), (x0, y0 + ch))
            d.text((x0 + 3, y0 + 2), f'{a} {dd}{i}', fill=tpv.SUB, font=font(11))
    img.convert('RGB').save(path, optimize=True)
    return True


def main():
    tf = Cityfolk.from_assets(os.environ.get('CF_ASSETS', ASSETS))
    os.makedirs(PREV, exist_ok=True)
    only = sys.argv[1:] or ['jobs', 'anims', 'crowd', 'gifs', 'proof']
    if 'jobs' in only:
        jobs(tf, os.path.join(PREV, 'cityfolk_jobs.png'))
        print('jobs done', flush=True)
    if 'anims' in only:
        anims_sheet(tf, os.path.join(PREV, 'cityfolk_anims.png'))
        print('anims done', flush=True)
    if 'crowd' in only:
        crowd(tf, os.path.join(PREV, 'cityfolk_crowd.png'))
        print('crowd done', flush=True)
    if 'gifs' in only:
        for a in ANIMS3:
            anim_gif(tf, a, os.path.join(PREV, f'cityfolk_{a}.gif'))
        print('gifs done', flush=True)
    if 'proof' in only:
        if proof(tf, os.path.join(PREV, 'cityfolk_proof.png')):
            print('proof done', flush=True)


if __name__ == '__main__':
    main()
