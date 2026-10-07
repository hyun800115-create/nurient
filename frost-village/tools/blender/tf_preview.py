"""
tf_preview.py - human previews of the packed townfolk (assets/townfolk) via the reference
compositor (tools/townfolk_compose.py).  Plain python3.

    python3 tools/blender/tf_preview.py            # all previews -> docs/previews/townfolk_*.png/gif

  townfolk_crowd.png         100 random townsfolk on a snowy plaza at 1x (+ 2x crop)
  townfolk_jobs.png          the 10 job presets, 3 people each, idle S / walk SE / talk E
  townfolk_parts_<fam>.png   one sheet per part family (hair, hat, top, bottom, shoes, acc, face, base)
  townfolk_walk.gif          6 random people walking (S, SE, E, NE, N, SW)
  townfolk_social.gif        6 people: talk / wave / happy (S, SE, E)
  townfolk_carry.gif         6 people carrying a stack (carry_walk + carryPoint marker)
"""
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)

from townfolk_compose import Townfolk           # noqa: E402

PREV = os.path.join(GAME, 'docs', 'previews')
BG = (201, 214, 232, 255)
SNOW = (238, 243, 249, 255)
INK = (43, 47, 58, 255)
SUB = (90, 96, 110, 255)


def font(sz=12):
    for p in ('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
              '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except OSError:
                pass
    return ImageFont.load_default()


def shadow(img, x, y, w, h, a=70):
    sh = Image.new('RGBA', (w * 2 + 4, h * 2 + 4), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse([2, 2, w * 2 + 1, h * 2 + 1], fill=(80, 100, 130, a))
    img.alpha_composite(sh, (int(x - w - 2), int(y - h - 2)))


def place(canvas, tf, person, anim, d, i, x, y, scale=1):
    fr = tf.compose(person, anim, d, i)
    sw, sh = tf.T['bases'][person['base']]['shadow']
    shadow(canvas, x, y, int(sw * 0.55 * scale), int(sh * 0.6 * scale))
    if scale != 1:
        fr = fr.resize((128 * scale, 128 * scale), Image.NEAREST)
    canvas.alpha_composite(fr, (int(x - 64 * scale), int(y - 104 * scale)))


def crowd(tf, path, n=100, seed=2026):
    rng = random.Random(seed)
    W, H = 1600, 1000
    img = Image.new('RGBA', (W, H), SNOW)
    d = ImageDraw.Draw(img)
    # plaza diamond + paths
    cx, cy = W // 2, H // 2 + 30
    d.polygon([(cx, cy - 330), (cx + 660, cy), (cx, cy + 330), (cx - 660, cy)], fill=(217, 160, 138, 255))
    d.polygon([(cx, cy - 300), (cx + 600, cy), (cx, cy + 300), (cx - 600, cy)], fill=(225, 172, 150, 255))
    people = []
    jobs = list(tf.T['generator']['presets'])
    for k in range(n):
        preset = jobs[k % len(jobs)] if k % 4 == 0 else None
        p = tf.preset(preset, rng=rng) if preset else tf.random_person(rng=rng)
        # iso grid position (10 x 10) with jitter
        gx, gy = k % 10, k // 10
        x = cx + (gx - gy) * 58 + rng.uniform(-8, 8)
        y = cy - 250 + (gx + gy) * 27 + rng.uniform(-5, 5)
        anim = rng.choice(['idle', 'idle', 'walk', 'walk', 'carry_walk', 'talk', 'wave', 'happy'])
        dirs = tf.T['anims'][anim]['dirs'] + (['SW', 'W', 'NW'] if anim in ('idle', 'walk', 'carry_walk') else ['SW', 'W'])
        dd = rng.choice(dirs)
        i = rng.randrange(tf.T['anims'][anim]['frames'])
        people.append((y, x, p, anim, dd, i))
    people.sort(key=lambda t: t[0])
    for y, x, p, anim, dd, i in people:
        place(img, tf, p, anim, dd, i, x, y)
    d = ImageDraw.Draw(img)
    d.rectangle([0, H - 34, W, H], fill=(33, 94, 168, 255))
    d.text((12, H - 28), f'{n} random townsfolk (1x, PPU 64): every 4th is a job preset; composed from paper-doll '
                         f'layers by tools/townfolk_compose.py', fill=(255, 255, 255, 255), font=font(15))
    img.convert('RGB').save(path, optimize=True)
    # 2x crop of the middle
    crop = img.crop((cx - 300, cy - 230, cx + 300, cy + 170)).resize((1200, 800), Image.NEAREST)
    crop.convert('RGB').save(path.replace('.png', '_2x.png'), optimize=True)
    return [p for _, _, p, _, _, _ in people]


def sheet(tf, rows, path, title, frames=(('idle', 'S', 0), ('walk', 'SE', 2), ('talk', 'E', 0), ('idle', 'N', 1)),
          scale=2, label_w=150):
    """rows: [(label, sublabel, person)]"""
    cw, chh = 80 * scale, 100 * scale
    cols = 3
    per = len(frames)
    nrows = (len(rows) + cols - 1) // cols
    W = cols * (label_w + per * cw) + 20
    H = 40 + nrows * (chh + 8)
    img = Image.new('RGBA', (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), title, fill=INK, font=font(18))
    f12 = font(13)
    for k, (lab, sub, p) in enumerate(rows):
        r, c = k // cols, k % cols
        x0 = 10 + c * (label_w + per * cw)
        y0 = 40 + r * (chh + 8)
        d.text((x0 + 4, y0 + chh // 2 - 18), lab, fill=INK, font=f12)
        d.text((x0 + 4, y0 + chh // 2 + 2), sub, fill=SUB, font=f12)
        for j, (a, dd, i) in enumerate(frames):
            fr = tf.compose(p, a, dd, i).crop((24, 10, 104, 110))
            if scale != 1:
                fr = fr.resize((cw, chh), Image.NEAREST)
            img.alpha_composite(fr, (x0 + label_w + j * cw, y0))
    img.convert('RGB').save(path, optimize=True)


def neutral(tf, base='adult_slim', parts=None, **cols):
    c = dict(skin='#F6CFAE', hair='#5A3A26', top='#3D7CC9', top2='#F4EDE0', fur='#F4F1EA', bottom='#3B3F52',
             bottom2='#2E3440', shoes='#6B4A2E', hat='#D9483B', hat2='#F4EDE0', acc='#F2C230', acc2='#D9483B',
             bag='#8A5A33', glasses='#2B2F3A')
    c.update(cols)
    c.setdefault('sleeve', c['top'])
    c.setdefault('hands', c['skin'])
    return {'base': base, 'face': 'std' if not base.startswith('child') else 'kid', 'nose': 'dot',
            'parts': parts or ['hair_short', 'top_sweater', 'bot_pants', 'shoe_boots'], 'colors': c}


def family_sheets(tf):
    T = tf.T
    P = T['parts']
    lab = lambda pn: P[pn]['label']['ko'] + ' / ' + P[pn]['label']['en']
    rng = random.Random(5)
    hairs = [pn for pn in P if P[pn]['family'] == 'hair']
    rows = []
    for k, h in enumerate(hairs):
        col = T['palettes']['hair'][k % 8]
        base = 'adult_slim' if not P[h].get('ages') or 'adult' in P[h]['ages'] else 'elder_slim'
        rows.append((h, lab(h), neutral(tf, base, [h, 'top_sweater', 'bot_pants', 'shoe_boots'], hair=col,
                                         acc2='#D9483B')))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_hair.png'),
          f'Hair styles ({len(hairs)}): idle S | walk SE | talk E | idle N   (tint = hair colour palette)')
    hats = [pn for pn in P if P[pn]['family'] == 'hat']
    rows = []
    for k, h in enumerate(hats):
        hc = T['palettes']['knit'][k % 10]
        if 'job' in P[h].get('tags', []):
            hc = {'hat_police': '#2B3A5E', 'hat_station': '#2F5E48', 'hat_postal': '#D23A32',
                  'hat_hardhat': '#F2C230'}.get(h, hc)
        rows.append((h, lab(h) + (' [full]' if P[h].get('cls') == 'full' else ' [top]'),
                     neutral(tf, 'adult_slim', ['hair_bob_long' if k % 2 else 'hair_short', h, 'top_coat', 'bot_pants',
                                                'shoe_boots'], hat=hc, top='#7A5C40')))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_hat.png'),
          f'Hats ({len(hats)}): full hats switch the hair to its ~hat variant (clipped at the hat line)')
    tops = [pn for pn in P if P[pn]['family'] == 'top']
    rows = []
    for k, t in enumerate(tops):
        base = ['adult_slim', 'child_round', 'elder_round', 'adult_round', 'child_slim', 'elder_slim'][k % 6]
        if P[t].get('ages') and T['bases'][base]['age'] not in P[t]['ages']:
            base = 'adult_slim'
        bottom = 'bot_tights' if P[t].get('dress') else 'bot_pants'
        tc_ = T['palettes']['cloth'][k % 12]
        rows.append((t, f'{lab(t)}  ({base})', neutral(tf, base, ['hair_short' if k % 2 else 'hair_bob', t, bottom,
                                                                  'shoe_boots'], top=tc_,
                                                         top2=T['palettes']['accent'][k % 7],
                                                         sleeve=T['palettes']['accent'][k % 7] if P[t].get('sleeves')
                                                         else tc_)))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_top.png'), f'Tops ({len(tops)}) on different body bases')
    rows = []
    for k, b in enumerate([pn for pn in P if P[pn]['family'] in ('bottom', 'shoes')]):
        top = 'top_dress' if b == 'bot_tights' else 'top_sweater'
        rows.append((b, lab(b), neutral(tf, ['adult_slim', 'child_slim', 'adult_round'][k % 3],
                                        ['hair_short', top, b if P[b]['family'] == 'bottom' else 'bot_pants',
                                         b if P[b]['family'] == 'shoes' else 'shoe_boots'],
                                        bottom=T['palettes']['skirt'][k % 7], bottom2='#2E3440',
                                        shoes=T['palettes']['shoes'][k % 7])))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_bottom_shoes.png'), 'Bottoms and shoes')
    rows = []
    for k, a in enumerate([pn for pn in P if P[pn]['family'] in ('glasses', 'headacc', 'neck', 'bag', 'facial_hair',
                                                                  'job')]):
        base = 'elder_slim' if P[a].get('ages') == ['elder'] else 'adult_slim'
        if P[a].get('ages') and 'adult' not in P[a]['ages'] and 'elder' not in P[a]['ages']:
            base = 'child_slim'
        hair = 'hair_bob' if P[a]['family'] == 'headacc' else 'hair_short'
        rows.append((a, lab(a), neutral(tf, base, [hair, 'top_sweater', 'bot_pants', 'shoe_boots', a],
                                        acc=T['palettes']['knit'][k % 10], top='#7A8A9A')))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_acc.png'), 'Accessories, facial hair and job details')
    # bases x dirs
    rows = []
    for base in T['bases']:
        p = neutral(tf, base, ['hair_short', 'top_parka', 'bot_pants', 'shoe_boots'], top='#D9483B')
        rows.append((base, T['bases'][base]['label']['ko'], p))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_base.png'), 'Body bases (child / adult / elder x slim / round)',
          frames=(('idle', 'S', 0), ('walk', 'SE', 1), ('walk', 'E', 3), ('walk', 'NE', 5), ('walk', 'N', 7)))
    # faces x expressions (talk / happy frames)
    rows = []
    for fs in T['faces']:
        base = 'child_slim' if fs.startswith('kid') else ('elder_slim' if fs == 'elder' else 'adult_slim')
        rows.append((f'face {fs}', 'talk S / wave S / happy E / idle E', neutral(tf, base, ['hair_short', 'top_sweater',
                                                                                         'bot_pants', 'shoe_boots'])))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_face.png'), 'Face sets: expressions are per frame (timeline)',
          frames=(('talk', 'S', 0), ('wave', 'S', 1), ('happy', 'E', 2), ('idle', 'E', 2)))
    # skin / colour variety of one outfit
    rows = []
    for k in range(12):
        p = tf.random_person(rng=rng)
        rows.append((f'random #{k}', p['base'], p))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_parts_random.png'), '12 random people')


def jobs_sheet(tf):
    rows = []
    for k, (j, pd) in enumerate(tf.T['generator']['presets'].items()):
        for s in range(3):
            p = tf.preset(j, seed=101 * k + 11 * s + 3)          # different draws per job
            rows.append((f'{pd["label"]["ko"]}', f'{pd["label"]["en"]} #{s + 1}', p))
    sheet(tf, rows, os.path.join(PREV, 'townfolk_jobs.png'), 'Job presets (10 x 3 seeds)')


def gif(tf, people, path, plan, n_frames, fps=12, scale=2):
    """plan(k) -> list of (anim, dir) for person k; frames cycle through each anim."""
    cw, chh = 80 * scale, 104 * scale
    frames = []
    for t in range(n_frames):
        canvas = Image.new('RGBA', (len(people) * cw, chh), SNOW)
        for k, p in enumerate(people):
            anim, dd = plan(k, t)
            n = tf.T['anims'][anim]['frames']
            fr = tf.compose(p, anim, dd, t % n)
            sw, sh = tf.T['bases'][p['base']]['shadow']
            sub = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
            shadow(sub, 64, 104, int(sw * 0.55), int(sh * 0.6))
            sub.alpha_composite(fr)
            sub = sub.crop((24, 4, 104, 108)).resize((cw, chh), Image.NEAREST)
            canvas.alpha_composite(sub, (k * cw, 0))
        frames.append(canvas.convert('RGB'))
    pal = frames[0].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / fps), loop=0, optimize=True)


def main():
    tf = Townfolk.from_assets()
    os.makedirs(PREV, exist_ok=True)
    people = crowd(tf, os.path.join(PREV, 'townfolk_crowd.png'))
    print('crowd done', flush=True)
    jobs_sheet(tf)
    family_sheets(tf)
    print('sheets done', flush=True)
    rng = random.Random(77)
    six = [tf.random_person(rng=rng) for _ in range(6)]
    dirs = ['S', 'SE', 'E', 'NE', 'N', 'SW']
    gif(tf, six, os.path.join(PREV, 'townfolk_walk.gif'), lambda k, t: ('walk', dirs[k]), 16, fps=12)
    social = [tf.random_person(rng=rng) for _ in range(6)]
    gif(tf, social, os.path.join(PREV, 'townfolk_social.gif'),
        lambda k, t: (['talk', 'wave', 'happy'][(t // 24 + k) % 3], ['S', 'SE', 'E', 'SW', 'W', 'S'][k]), 72, fps=10)
    carry = [tf.random_person(rng=rng) for _ in range(6)]
    gif(tf, carry, os.path.join(PREV, 'townfolk_carry.gif'), lambda k, t: ('carry_walk', dirs[k]), 16, fps=12)
    print('gifs done', flush=True)


if __name__ == '__main__':
    main()
