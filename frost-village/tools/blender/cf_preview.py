"""
cf_preview.py - human previews of the cityfolk fragment (assets/townfolk + townfolk2 + cityfolk) via the reference
compositor tools/cityfolk_compose.py.  Plain python3 (numpy + Pillow).

    python3 tools/blender/cf_preview.py [jobs anims crowd gifs proof]     # -> docs/previews/cityfolk_*

  cityfolk_jobs.png     every preset x 3 people: idle S / walk SE / its signature anim / idle N
  cityfolk_anims.png    the twelve new anims on child / adult / elder (slim + round) bases
  cityfolk_crowd.png    80 mixed townsfolk + cityfolk on a town street around a house fire, staged with the real
                        town / vehicles / civic / fx_city assets (+ cityfolk_crowd_2x.png close-up)
  cityfolk_<anim>.gif   run / flee / argue / fight / arrested_walk / spray_hose / point / think / shocked / phone /
                        carry_box / sweep - a few people in several directions at the anim's fps
  cityfolk_proof.png    full Blender look-dev renders vs the paper-doll composites from the atlases
  cityfolk_polish.png   polish pass: before (first pass, /tmp/fv_cache/cityfolk/old_assets) | after, per critic issue
  cityfolk_lineup.png   every preset at phone zoom 0.6 (device pixels, 1x) + the same at CSS size (glance test)
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
             'warehouse_worker': ('carry_box', 'SE', 3), 'forklift_driver': ('carry_box', 'SE', 1),
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
    import cf_presets as cpr
    need = ('run', 'flee', 'carry_box', 'spray_hose', 'fight', 'arrested_walk', 'sweep')
    for base in ('child_slim', 'child_round', 'adult_slim', 'adult_round', 'elder_slim', 'elder_round'):
        found = None
        for _ in range(3000):
            p = tf.random_person(rng=rng)
            if p['base'] == base:
                if all(tf.can_play(p, a) for a in need):
                    found = p
                    break
                last = p
        if found is None:                 # dress the last person of that base in the age's 'tiny' wardrobe
            age = base.split('_')[0]
            keep = [pn for pn in last['parts'] if tf.T['parts'][pn]['space'] == 'head']
            found = dict(last, parts=keep + sorted(cpr.TINY[age]))
        people.append(found)
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


COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
MIRROR_OF = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}


def snap_dir(tf, anim, d):
    """nearest dir the anim has (own dirs + mirrored SW / W / NW)."""
    own = tf.T['anims'][anim]['dirs']
    ok = [x for x in COMPASS if x in own or MIRROR_OF.get(x) in own]
    k = COMPASS.index(d)
    return min(ok, key=lambda x: min((COMPASS.index(x) - k) % 8, (k - COMPASS.index(x)) % 8))


def crowd_scene(tf, path, frame=5, seed=2028):
    """80 people (about half cityfolk presets, half random townsfolk) on a snowy town street around a house fire,
    staged with the real game assets (assets/town houses, assets/vehicles, assets/civic props, assets/fx_city fire /
    smoke / hose / mist / fight cloud via tools/fx/gen_fx_city_scene.py helpers, all read-only)."""
    import numpy as np
    sys.path.insert(0, os.path.join(TOOLS, 'fx'))
    import gen_fx_city_scene as FX
    rng = random.Random(seed)
    W, H = 2240, 1240
    O = np.array([1060.0, 600.0])

    def S(x, y):
        return O + FX.AX * x + FX.AY * y

    canvas = FX.tile_fill((W, H), os.path.join(ASSETS, 'ground', 'ground_snow.png'))
    FX.band(canvas, O, -24, 26, -0.2, -1.6, os.path.join(ASSETS, 'roads', 'sidewalk.png'), 1.5)
    FX.band(canvas, O, -24, 26, -1.6, -6.2, os.path.join(ASSETS, 'roads', 'road_cobble_wide.png'), 1.5)
    FX.band(canvas, O, -24, 26, -6.2, -7.8, os.path.join(ASSETS, 'roads', 'sidewalk.png'), 1.5)
    drawn = []
    count = {'city': 0, 'town': 0}
    spots_used = []

    def add(y, fn):
        drawn.append((y, len(drawn), fn))

    def place(p, anim, d, xy, face=None, i=None, no_items=False, city=False):
        a2, f2 = tf.pick_anim(p, anim)
        d2 = snap_dir(tf, a2, d)
        nfr = tf.T['anims'][a2]['frames']
        i = (frame + rng.randrange(nfr)) % nfr if i is None else i % nfr
        img = tf.compose(p, a2, d2, i, face=face or f2, no_items=no_items)
        sw, sh = tf.T['bases'][p['base']]['shadow']
        xy = np.array(xy, float)
        spots_used.append(xy)
        add(xy[1], lambda: (person_at_shadow(canvas, xy, sw, sh), FX.put(canvas, img, xy, (0.5, 104 / 128))))
        count['city' if city else 'town'] += 1
        return a2, d2, i

    def person_at_shadow(cv, xy, sw, sh):
        shadow(cv, xy[0], xy[1], int(sw * 0.55), int(sh * 0.6), a=70)

    def city(pr):
        return tf.preset(pr, rng=rng)

    def town():
        return tf.random_person(rng=rng)

    # ---- houses along the street; townhouse_b is on fire (fireMount)
    row = [('toy_shop', -8.2), ('restaurant', -4.6), ('cafe', -1.0), ('townhouse_b', 2.6), ('bookstore', 6.2),
           ('flower_shop', 9.8), ('hair_salon', 13.4), ('post_office', 17.0)]
    hp = None
    for k, x in row:
        img, anc, s_ = FX.sprite('town', k)
        p = S(x, 1.9)
        if k == 'townhouse_b':
            hp = p
            arr = np.asarray(img).astype(np.float32)
            arr[..., :3] *= np.array([255, 224, 200], np.float32) / 255.0
            img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')
        add(p[1], (lambda img=img, anc=anc, p=p: FX.put(canvas, img, p, anc)))
    mt = FX._man('fx_city')['fireMount']['buildings']['townhouse_b']
    smoke, sa, _ = FX.sheet_frames('fx_smoke_column')
    emb, ea, _ = FX.sheet_frames('fx_embers')
    win, wa, _ = FX.sheet_frames('fx_fire_window')
    glow, ga, _ = FX.sheet_frames('fx_fire_glow')
    fdx, fdy, fkey, fsc, _ = mt['fires'][0]
    fire, fa, fspec = FX.sheet_frames(fkey)
    fpos = hp + [fdx, fdy]
    add(hp[1] + 0.5, lambda: FX.put(canvas, glow[frame % 12], hp + mt['glow'][:2], ga, scale=mt['glow'][2], alpha=0.85))
    add(hp[1] - 1.0, lambda: FX.put(canvas, glow[(frame + 3) % 12], hp + [10, 70], ga, scale=2.2, alpha=0.55))
    add(hp[1] + 1, lambda: FX.put(canvas, smoke[frame % 16], hp + mt['smoke'][:2], sa, scale=mt['smoke'][2]))
    for j, (wx, wy, wflip, wsc) in enumerate(mt['windows'][:2]):
        add(hp[1] + 2, (lambda wx=wx, wy=wy, wflip=wflip, wsc=wsc, j=j:
                        FX.put(canvas, win[(frame + 5 * j) % 12], hp + [wx, wy], wa, scale=wsc, flip=wflip)))
    add(hp[1] + 3, lambda: FX.put(canvas, fire[frame % 12], fpos, fa, scale=fsc))
    add(hp[1] + 4, lambda: FX.put(canvas, emb[frame % 16], hp + mt['embers'], ea))
    # ---- vehicles + civic props
    tp = S(-3.0, -4.7)
    timg, tanc, tdef = FX.vehicle('fire_truck', 'siren_SE_%d' % (frame % 4))
    add(tp[1] - 0.5, lambda: FX.shadow_ellipse(canvas, tp, tdef['shadow']['SE'][0] * 0.9, tdef['shadow']['SE'][1] * 0.9,
                                               0.25))
    add(tp[1], lambda: FX.put(canvas, timg, tp, tanc))
    gr, gra, _ = FX.sheet_frames('fx_siren_glow_red')
    add(tp[1] + 1, lambda: FX.put(canvas, gr[frame % 8], tp + np.array(tdef['sirenPoint']['SE']), gra))
    hosep = tp + np.array(tdef['hosePoint']['SE'])
    pcp = S(-14.0, -5.0)
    pimg, panc, pdef = FX.vehicle('police_car', 'siren_SE_%d' % (frame % 4))
    add(pcp[1] - 0.5, lambda: FX.shadow_ellipse(canvas, pcp, pdef['shadow']['SE'][0] * 0.9,
                                                pdef['shadow']['SE'][1] * 0.9, 0.25))
    add(pcp[1], lambda: FX.put(canvas, pimg, pcp, panc))
    gb, gba, _ = FX.sheet_frames('fx_siren_glow_blue')
    add(pcp[1] + 1, lambda: FX.put(canvas, gb[frame % 8], pcp + np.array(pdef['sirenPoint']['SE']), gba))
    kp = S(9.0, -4.9)
    kimg, kanc, kdef = FX.vehicle('truck_cargo', 'idle_NE_0')
    add(kp[1] - 0.5, lambda: FX.shadow_ellipse(canvas, kp, kdef['shadow']['NE'][0] * 0.9, kdef['shadow']['NE'][1] * 0.9,
                                               0.25))
    add(kp[1], lambda: FX.put(canvas, kimg, kp, kanc))
    for key, (x, y) in [('fire_hydrant', (-1.6, -0.5)), ('moving_boxes_stack', (7.4, -6.9)),
                        ('furniture_pile_s', (11.0, -7.1)), ('wanted_board', (-9.8, -7.2)),
                        ('scorch_decal_s', (3.6, -0.8))]:
        try:
            img, anc, _ = FX.sprite('civic', key)
        except Exception:
            continue
        p = S(x, y)
        add(p[1] - (60 if key.startswith('scorch') else 0), (lambda img=img, anc=anc, p=p: FX.put(canvas, img, p, anc)))
    # ---- firefighters spraying the fire (nozzlePoint -> fx_hose_rope + tip, mist / steam at the target)
    rope, _, _ = FX.sheet_frames('fx_hose_rope')
    rope_l, _, _ = FX.sheet_frames('fx_hose_rope_long')
    tip, _, _ = FX.sheet_frames('fx_hose_tip')
    mist, ma, _ = FX.sheet_frames('fx_water_mist')
    steam, sta, _ = FX.sheet_frames('fx_steam_puff')
    hgt = fspec.get('heightPx', 200)
    targets = [fpos + [-30, -0.3 * hgt * fsc], fpos + [40, -14], fpos + [-70, 10]]
    for k, ((x, y), d) in enumerate([((-0.6, -1.0), 'NE'), ((5.9, -0.7), 'NW'), ((1.3, -2.6), 'NE')]):
        ff = city('firefighter')
        fp = S(x, y)
        a2, d2, i = place(ff, 'spray_hose', d, fp, i=frame + k, city=True)
        nz = tf.nozzle_point(ff, d2, i)
        N = fp + np.array(nz[:2]) if nz else fp + [16, -42]
        T = targets[k]

        def hose_line(fp=fp, k=k):                        # canvas hose on the ground: truck -> firefighter
            dd = ImageDraw.Draw(canvas)
            a_, b_ = hosep + [0, 26], fp + [-6, -2]
            mid = (a_ + b_) / 2 + [0, 30 + 12 * k]
            pts = [tuple(a_ * (1 - t) ** 2 + 2 * mid * t * (1 - t) + b_ * t * t) for t in np.linspace(0, 1, 28)]
            dd.line(pts, fill=(110, 30, 24, 255), width=7, joint='curve')
            dd.line(pts, fill=(200, 64, 50, 255), width=4, joint='curve')
        add(min(fp[1], tp[1]) - 3, hose_line)
        add(hp[1] + 5 + k, (lambda T=T: FX.put(canvas, mist[(frame + 3 + k) % 12], T, ma)))
        add(fp[1] - 0.5 if d2 in ('NE', 'NW', 'N') else fp[1] + 0.5,
            (lambda N=N, T=T, k=k: FX.hose_rope(canvas, N, T, rope[(frame + k) % 8], tip[(frame + k) % 8],
                                                t=0.4 * frame + k, rope_long=rope_l[(frame + k) % 8])))
        add(hp[1] + 9 + k, (lambda T=T, k=k: FX.put(canvas, steam[(frame * 2 + k * 6) % 14], T + [14, -10], sta, 0.9)))
    # a fourth firefighter runs in from the truck, a police officer points the crowd back
    place(city('firefighter'), 'run', 'NE', S(-0.9, -3.2), city=True)
    place(city('police_officer'), 'point', 'W', S(-3.0, -1.2), city=True)
    # ---- residents fleeing the burning house across the street (+ a kid and a dog-less grandpa hurrying)
    for (x, y), d in [((2.0, -1.9), 'SW'), ((3.6, -2.4), 'S'), ((4.6, -3.4), 'SE'), ((1.2, -3.6), 'SW'),
                      ((3.0, -4.6), 'S'), ((5.4, -2.0), 'SE')]:
        place(town(), 'flee', d, S(x, y))
    # ---- the crowd watching from both sides of the house: shocked / pointing / phoning / thinking / talking
    left = [(-9.6 + 0.9 * k + rng.uniform(-0.2, 0.2), -0.5 - 0.6 * (k % 3) + rng.uniform(-0.1, 0.1)) for k in range(9)]
    right = [(8.4 + 0.95 * k + rng.uniform(-0.2, 0.2), -0.4 - 0.6 * (k % 3) + rng.uniform(-0.1, 0.1)) for k in range(9)]
    moods = ['shocked', 'point', 'phone', 'shocked', 'think', 'talk', 'point', 'shocked', 'phone']
    for k, (x, y) in enumerate(left):
        place(town() if k % 3 else city(['reporter', 'banker', 'bank_teller'][k // 3]), moods[k], 'E', S(x, y),
              city=k % 3 == 0)
    for k, (x, y) in enumerate(right):
        place(town() if k % 3 else city(['reporter', 'warehouse_worker', 'detective'][k // 3]),
              moods[(k + 4) % 9], 'W', S(x, y), city=k % 3 == 0)
    # ---- the chase: a burglar flees with the loot sack, two police officers run after him
    place(city('burglar'), 'flee', 'W', S(-11.0, -3.4), city=True)
    place(city('police_officer'), 'run', 'W', S(-8.8, -2.8), city=True)
    place(city('police_officer'), 'run', 'W', S(-8.0, -4.1), city=True)
    # ---- the arrest: a police officer walks a caught burglar to the patrol car
    place(city('burglar'), 'arrested_walk', 'SW', S(-11.6, -6.6), city=True)
    place(city('police_officer'), 'walk', 'SW', S(-10.6, -6.2), city=True)
    place(city('detective'), 'think', 'S', S(-8.6, -7.0), city=True)
    place(town(), 'point', 'W', S(-7.8, -7.4))
    # ---- a scuffle (fight inside fx_fight_cloud back / front), a police officer and gawkers
    fa_ = S(14.0, -6.9)
    fb_ = fa_ + [44, 0]
    pa, pb = town(), town()
    place(pa, 'fight', 'E', fa_)
    place(pb, 'fight', 'W', fb_)
    fback, fba, _ = FX.sheet_frames('fx_fight_cloud_back')
    ffront, ffa, _ = FX.sheet_frames('fx_fight_cloud_front')
    mid = (fa_ + fb_) / 2
    add(mid[1] - 0.5, lambda: FX.put(canvas, fback[frame % 12], mid, fba))
    add(mid[1] + 0.5, lambda: FX.put(canvas, ffront[frame % 12], mid, ffa))
    place(city('police_officer'), 'run', 'E', S(11.2, -5.4), city=True)
    for (x, y), m in [((15.6, -7.6), 'shocked'), ((12.6, -7.7), 'argue'), ((16.4, -6.6), 'point')]:
        place(town(), m, 'W' if x > 14 else 'E', S(x, y))
    # ---- moving day by the truck: movers / warehouse crew / a courier carry boxes, a forklift driver directs
    for (x, y), d, pr in [((6.2, -6.6), 'NE', 'mover'), ((7.0, -7.4), 'E', 'mover'), ((8.6, -6.9), 'NE', 'warehouse_worker'),
                          ((10.0, -7.4), 'N', 'delivery_driver')]:
        place(city(pr), 'carry_box', d, S(x, y), city=True)
    place(city('forklift_driver'), 'point', 'SE', S(10.6, -6.3), city=True)
    # ---- clean-up crew sweeping the snow on the far sidewalk, a demolition worker passing by
    place(city('construction_worker'), 'sweep', 'SE', S(-4.0, -7.0), city=True)
    place(city('demolition_worker'), 'sweep', 'S', S(-2.4, -7.4), city=True)
    place(town(), 'sweep', 'E', S(-0.6, -7.0))
    # ---- everyday life goes on: walkers, runners, chatting neighbours on both sidewalks (fill to 80)
    cand = [(x, y) for x in np.arange(-20.0, 26.0, 0.9) for y in (-0.7, -1.3, -6.7, -7.4)]
    rng.shuffle(cand)
    k = 0
    for x, y in cand:
        if count['city'] + count['town'] >= 80:
            break
        xy = S(x + rng.uniform(-0.2, 0.2), y + rng.uniform(-0.1, 0.1))
        if not (60 < xy[0] < W - 60 and 150 < xy[1] < H - 90):
            continue
        if any(np.hypot(*(xy - q)) < 46 for q in spots_used) or abs(x - 2.6) < 4.5 and y > -2:
            continue
        an = rng.choice(['walk', 'walk', 'talk', 'idle', 'run', 'phone', 'think', 'talk', 'wave'])
        d = rng.choice(['SE', 'SW', 'NE', 'NW', 'S', 'E', 'W'])
        if k % 4 == 0:
            place(city(rng.choice(PRESETS)), an, d, xy, city=True)
        else:
            place(town(), an, d, xy)
        k += 1
    drawn.sort(key=lambda t: (t[0], t[1]))
    for _, _, fn in drawn:
        fn()
    n = count['city'] + count['town']
    caption(canvas, f'Cityfolk crowd at 1x: {n} people ({count["city"]} cityfolk presets + {count["town"]} random '
                    'townsfolk) on a town street around a house fire',
            'firefighters aim the hose (nozzlePoint) at fx_city fire, residents flee, the crowd is shocked / points / '
            'phones, police chase a burglar, an arrest, a scuffle in fx_fight_cloud, movers with boxes, sweepers')
    canvas.convert('RGB').save(path, optimize=True)
    big = canvas.crop((600, 300, 1640, 960)).resize((2080, 1320), Image.NEAREST)
    big.convert('RGB').save(path.replace('.png', '_2x.png'), optimize=True)
    return n


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


# --------------------------------------------------------------------------- polish pass: before / after + lineup

OLD_ASSETS = '/tmp/fv_cache/cityfolk/old_assets'


def _pick(tf, pr, seed, base='adult_slim', need=(), tries=400):
    rng = random.Random(seed)
    last = None
    for _ in range(tries):
        p = tf.preset(pr, rng=rng) if pr else tf.random_person(rng=rng)
        last = p
        if (base is None or p['base'] == base) and all(tf.can_play(p, a) for a in need):
            return p
    return last


def polish(tf, path):
    """Each critic issue: the first pass (old atlases) next to this pass, 2x."""
    if not os.path.isdir(os.path.join(OLD_ASSETS, 'cityfolk')):
        return False
    old = Cityfolk.from_assets(OLD_ASSETS, fragments=['townfolk2', 'cityfolk'])
    glasses = lambda p: dict(p, parts=[x for x in p['parts'] if not x.startswith('acc_glasses')] + ['acc_glasses'],
                             colors=dict(p['colors'], glasses='#2B2F3A'))
    rows = [
        ('bank teller ("kindergarten uniform")', 'bank_teller', [('idle', 'S', 0), ('walk', 'SE', 2), ('phone', 'S', 0)], None),
        ('warehouse worker (read as a resident)', 'warehouse_worker', [('idle', 'S', 0), ('carry_box', 'SE', 3)], None),
        ('forklift driver (= construction)', 'forklift_driver', [('idle', 'S', 0), ('walk', 'SE', 2)], None),
        ('delivery driver (brown blob)', 'delivery_driver', [('idle', 'S', 0), ('carry_box', 'SE', 2)], None),
        ('demolition worker (= construction)', 'demolition_worker', [('idle', 'S', 0), ('sweep', 'SE', 2)], None),
        ('reporter (camera / notepad vanish)', 'reporter', [('idle', 'S', 0), ('walk', 'SE', 2)], None),
        ('burglar flee (sack over the face)', 'burglar', [('flee', 'SE', 3), ('flee', 'E', 5), ('arrested_walk', 'S', 2)], None),
        ('fire hose S / SE (red tab)', 'firefighter', [('spray_hose', 'S', 0), ('spray_hose', 'SE', 1)], None),
        ('sweep (spoon broom, hip height in E)', 'construction_worker', [('sweep', 'E', 1), ('sweep', 'E', 3), ('sweep', 'S', 0)], None),
        ('angry / shout + glasses (red eyes)', None, [('argue', 'S', 0), ('argue', 'SE', 1)], glasses),
        ('run S (read as a walk)', None, [('run', 'S', 0), ('run', 'S', 3), ('run', 'E', 3)], None),
    ]
    sc = 2
    cw, ch = 88 * sc, 120 * sc
    nmax = max(len(r[2]) for r in rows)
    W = 250 + 2 * (nmax * cw) + 40
    H = 60 + len(rows) * (ch + 8)
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'cityfolk polish: first pass (left) | this pass (right), 2x', fill=INK, font=font(18))
    d.text((250, 36), 'before', fill=tpv.SUB, font=font(14))
    d.text((250 + nmax * cw + 40, 36), 'after', fill=tpv.SUB, font=font(14))
    for r, (label, pr, frames, mod) in enumerate(rows):
        y0 = 60 + r * (ch + 8)
        d.text((8, y0 + ch // 2 - 8), label, fill=INK, font=font(13))
        need = tuple({a for a, _, _ in frames})
        for side, T_ in enumerate((old, tf)):
            p = _pick(T_, pr, 31 + r, 'adult_slim', need if side else ())
            if mod:
                p = mod(p)
            for c, (a, dd, i) in enumerate(frames):
                a2, face = T_.pick_anim(p, a)
                fr = T_.compose(p, a2, dd, min(i, T_.T['anims'][a2]['frames'] - 1), face=face)
                x0 = 250 + side * (nmax * cw + 40) + c * cw
                img.alpha_composite(fr.crop((20, 4, 108, 124)).resize((cw, ch), Image.NEAREST), (x0, y0))
                if a2 != a:
                    d.text((x0 + 3, y0 + ch - 14), f'{a}->{a2}', fill=tpv.SUB, font=font(10))
        d.line([(250 + nmax * cw + 20, y0), (250 + nmax * cw + 20, y0 + ch)], fill=(170, 178, 190, 255), width=2)
    img.convert('RGB').save(path, optimize=True)
    return True


def lineup(tf, path, seed=61):
    """Every preset (2 people each) + 8 random residents on snow, idle S, at 1x = phone zoom 0.6 in device pixels
    (DPR 3: 0.6 x 1.6 = 0.96), and the same strip reduced to CSS size (what the eye gets at arm's length)."""
    rng = random.Random(seed)
    people = []
    for pr in PRESETS:
        for k in range(2):
            people.append((pr, tf.preset(pr, rng=rng)))
    for k in range(8):
        people.append(('resident', tf.random_person(rng=rng)))
    cols = 15
    cw, ch = 46, 84
    rows_ = (len(people) + cols - 1) // cols
    strip = Image.new('RGBA', (cols * cw + 20, rows_ * ch + 10), (236, 241, 247, 255))
    for k, (pr, p) in enumerate(people):
        x, y = 10 + (k % cols) * cw, 6 + (k // cols) * ch
        fr = tf.compose(p, 'idle', 'S' if k % 3 else 'SE', 0)
        strip.alpha_composite(fr.crop((41, 26, 87, 110)), (x, y))
    big = strip.resize((strip.size[0] * 2, strip.size[1] * 2), Image.NEAREST)
    css = strip.resize((strip.size[0] // 3, strip.size[1] // 3), Image.LANCZOS).resize(
        (strip.size[0] // 3 * 2, strip.size[1] // 3 * 2), Image.NEAREST)
    W = big.size[0] + 20
    H = 50 + big.size[1] + 40 + css.size[1] + 20
    img = Image.new('RGBA', (W, H), tpv.BG)
    d = ImageDraw.Draw(img)
    d.text((10, 10), 'phone zoom 0.6: device pixels (shown 2x) - 13 presets x 2 + 8 random residents', fill=INK,
           font=font(16))
    img.alpha_composite(big, (10, 40))
    d.text((10, 50 + big.size[1]), 'the same at CSS size (390 px wide phone, DPR 3), shown 2x', fill=INK, font=font(14))
    img.alpha_composite(css, (10, 50 + big.size[1] + 22))
    img.convert('RGB').save(path, optimize=True)


def main():
    tf = Cityfolk.from_assets(os.environ.get('CF_ASSETS', ASSETS))
    os.makedirs(PREV, exist_ok=True)
    only = sys.argv[1:] or ['jobs', 'anims', 'crowd', 'gifs', 'proof', 'polish', 'lineup']
    if 'jobs' in only:
        jobs(tf, os.path.join(PREV, 'cityfolk_jobs.png'))
        print('jobs done', flush=True)
    if 'anims' in only:
        anims_sheet(tf, os.path.join(PREV, 'cityfolk_anims.png'))
        print('anims done', flush=True)
    if 'crowd' in only:
        try:
            n = crowd_scene(tf, os.path.join(PREV, 'cityfolk_crowd.png'))
            print(f'crowd scene done ({n} people)', flush=True)
        except Exception as e:                    # fx_city / town / vehicles not available: plain plaza crowd
            print('crowd scene failed (%s) - plain crowd' % e, flush=True)
            crowd(tf, os.path.join(PREV, 'cityfolk_crowd.png'))
            print('crowd done', flush=True)
    if 'gifs' in only:
        for a in ANIMS3:
            anim_gif(tf, a, os.path.join(PREV, f'cityfolk_{a}.gif'))
        print('gifs done', flush=True)
    if 'proof' in only:
        if proof(tf, os.path.join(PREV, 'cityfolk_proof.png')):
            print('proof done', flush=True)
    if 'polish' in only:
        if polish(tf, os.path.join(PREV, 'cityfolk_polish.png')):
            print('polish done', flush=True)
    if 'lineup' in only:
        lineup(tf, os.path.join(PREV, 'cityfolk_lineup.png'))
        print('lineup done', flush=True)


if __name__ == '__main__':
    main()
