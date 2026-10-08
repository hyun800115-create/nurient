"""
gen_fx_city_scene.py - docs/previews/fxcity_scene.png: a 1x (PPU 64) mock town street that puts the fx_city
assets in context the way the game will: a townhouse on fire (fx_fire_bld_s + fx_fire_window + fx_smoke_column +
fx_embers), the fire truck from assets/vehicles with fx_siren_glow_red, firefighters aiming the hose
(fx_hose_stream segments chained along an arc + fx_hose_tip + fx_water_mist + fx_steam_puff), a clapping crowd
with fx_question_mark / fx_lightbulb_idea / fx_memory_sparkle, a fight cloud with a police car (red + blue glows),
an alarm post, a wanted board with ui_wanted_poster and the 솔방울 신문 newspaper panel as a UI overlay.

Reads assets/fx_city (run gen_fx_city.py first), assets/town, assets/vehicles, assets/ground, assets/roads,
assets/townfolk(+2) and - when they exist - assets/cityfolk (firefighter / police presets) and assets/civic
(wanted_board, fire_alarm_post, fire_hydrant).  Everything read-only; the townfolk compositor is imported.
    python3 tools/fx/gen_fx_city_scene.py            # -> docs/previews/fxcity_scene.png
Also exports hose_arc() (the hose aiming algorithm of manifest.hoseAim) and snapshot() (newspaper photo).
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
PREV = os.path.join(ROOT, 'docs', 'previews')
if HERE not in sys.path:
    sys.path.insert(0, HERE)
TOOLS = os.path.dirname(HERE)
if TOOLS not in sys.path:
    sys.path.insert(0, TOOLS)

AX = np.array([45.2548, 22.6274])        # +1 m along world X (screen down-right)
AY = np.array([45.2548, -22.6274])       # +1 m along world Y (screen up-right)


# =========================================================================== asset access (read-only)
_ATL = {}


def _man(frag):
    p = os.path.join(ASSETS, frag, 'manifest.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def atlas_frame(frag_atlas_png, frag_atlas_json, name):
    """Full (untrimmed) frame image from a Phaser JSON-hash atlas."""
    key = frag_atlas_png
    if key not in _ATL:
        with open(os.path.join(ASSETS, frag_atlas_json), encoding='utf-8') as f:
            js = json.load(f)
        frames = js['frames'] if isinstance(js['frames'], dict) else {fr['filename']: fr for fr in js['frames']}
        _ATL[key] = (Image.open(os.path.join(ASSETS, frag_atlas_png)).convert('RGBA'), frames)
    sheet, frames = _ATL[key]
    fr = frames[name]
    r = fr['frame']
    crop = sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    if fr.get('rotated'):
        crop = crop.transpose(Image.ROTATE_90)
    sw, sh = fr['sourceSize']['w'], fr['sourceSize']['h']
    ss = fr['spriteSourceSize']
    out = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    out.alpha_composite(crop, (ss['x'], ss['y']))
    return out


def sprite(frag, key, frame=None):
    """(image, anchor) of manifest sprites[key] in a fragment (atlas or image)."""
    m = _man(frag)
    s = m['sprites'][key]
    if 'atlas' in s:
        at = next(a for a in m['atlases'] if a['key'] == s['atlas'])
        return atlas_frame(at['png'], at['json'], frame or s['frame']), s['anchor'], s
    im = next(i for i in m['images'] if i['key'] == s['image'])
    return Image.open(os.path.join(ASSETS, im['png'])).convert('RGBA'), s['anchor'], s


def vehicle(key, frame):
    m = _man('vehicles')
    c = m['characters'][key]
    at = next(a for a in m['atlases'] if a['key'] == c['atlas'])
    return atlas_frame(at['png'], at['json'], frame), c['anchor'], c


_SHEETS = {}


def sheet_frames(key, frag='fx_city'):
    if key in _SHEETS:
        return _SHEETS[key]
    m = _man(frag)
    s = next(e for e in m['spritesheets'] if e['key'] == key)
    img = Image.open(os.path.join(ASSETS, s['png'])).convert('RGBA')
    fw, fh = s['frameWidth'], s['frameHeight']
    cols = img.width // fw
    out = []
    for i in range(s['frameCount']):
        x, y = (i % cols) * fw, (i // cols) * fh
        out.append(img.crop((x, y, x + fw, y + fh)))
    _SHEETS[key] = (out, s['anchor'], s)
    return _SHEETS[key]


def put(canvas, img, xy, anchor, alpha=1.0, scale=1.0, flip=False):
    """Alpha-composite img with its anchor at xy (optionally scaled / flipped / faded)."""
    if scale != 1.0:
        img = img.resize((max(1, int(round(img.width * scale))), max(1, int(round(img.height * scale)))), Image.LANCZOS)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
        anchor = (1 - anchor[0], anchor[1])
    if alpha < 1.0:
        a = np.asarray(img).copy()
        a[..., 3] = (a[..., 3].astype(np.float32) * alpha).astype(np.uint8)
        img = Image.fromarray(a, 'RGBA')
    x = int(round(xy[0] - anchor[0] * img.width))
    y = int(round(xy[1] - anchor[1] * img.height))
    canvas.alpha_composite(img, (x, y)) if 0 <= x and 0 <= y and x + img.width <= canvas.width and \
        y + img.height <= canvas.height else _paste_clip(canvas, img, x, y)


def _paste_clip(canvas, img, x, y):
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(canvas.width, x + img.width), min(canvas.height, y + img.height)
    if x1 <= x0 or y1 <= y0:
        return
    canvas.alpha_composite(img.crop((x0 - x, y0 - y, x1 - x, y1 - y)), (x0, y0))


# =========================================================================== hose aiming (manifest.hoseAim)
def hose_curve(N, T, h=None):
    N, T = np.asarray(N, float), np.asarray(T, float)
    dist = float(np.hypot(*(T - N)))
    h = float(np.clip(0.3 * dist, 20, 120)) if h is None else h

    def P(s):
        return N + (T - N) * s + np.array([0.0, -h * 4 * s * (1 - s)])
    return P


def hose_arc(canvas, N, T, seg, tip, step=32.0, h=None):
    """Chain fx_hose_stream segments along P(s) by arc length (origin (0, 0.5), rotated to the tangent, scaleX =
    (L + 1) / 32, scaleY 1 -> 0.7) and put fx_hose_tip at the end - exactly manifest.hoseAim.chain."""
    P = hose_curve(N, T, h)
    ss = np.linspace(0, 1, 400)
    pts = np.array([P(s) for s in ss])
    seglen = np.hypot(*np.diff(pts, axis=0).T)
    cum = np.concatenate([[0], np.cumsum(seglen)])
    total = cum[-1]
    n = max(1, int(math.ceil(total / step)))
    L = total / n
    for k in range(n):
        s0 = np.interp(k * L, cum, ss)
        s1 = np.interp(min(total, k * L + 2.0), cum, ss)
        p0, p1 = P(s0), P(s1)
        ang = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
        sx, sy = (L + 1.0) / seg.width, 1.0 - 0.3 * (k / max(1, n - 1))
        _put_rot(canvas, seg, p0, (0.0, 0.5), ang, sx, sy)
    pe = P(1.0)
    pb = P(0.995)
    ang = math.atan2(pe[1] - pb[1], pe[0] - pb[0])
    _put_rot(canvas, tip, pe - np.array([math.cos(ang), math.sin(ang)]) * 6, (0.0, 0.5), ang, 0.75, 0.7)


def hose_rope(canvas, N, T, rope, tip, h=None, thin=0.3, ss=2):
    """Python stand-in for the recommended Phaser Rope (manifest.hoseAim.rope): the fx_hose_rope texture mapped
    once along P(s) like a Rope mesh (u = arc length / total * texture width, v = signed distance from the curve /
    scaleY), rendered by inverse mapping with 2x supersampling so bends are smooth.  The jet thins by `thin` toward
    the end; fx_hose_tip goes on the end."""
    P = hose_curve(N, T, h)
    ss_ = np.linspace(0, 1, 500)
    pts = np.array([P(s) for s in ss_])
    seg = np.diff(pts, axis=0)
    cum = np.concatenate([[0], np.cumsum(np.hypot(*seg.T))])
    total = cum[-1]
    tan = np.vstack([seg, seg[-1:]])
    tan /= np.maximum(np.hypot(*tan.T)[:, None], 1e-6)
    nrm = np.stack([-tan[:, 1], tan[:, 0]], 1)
    tex = np.asarray(rope.convert('RGBA')).astype(np.float32) / 255.0
    tex[..., :3] *= tex[..., 3:]
    th, tw = tex.shape[:2]
    pad = th
    x0, y0 = int(pts[:, 0].min() - pad), int(pts[:, 1].min() - pad)
    x1, y1 = int(pts[:, 0].max() + pad), int(pts[:, 1].max() + pad)
    W, H = (x1 - x0) * ss, (y1 - y0) * ss
    band = Image.new('L', (W, H), 0)                          # only pixels near the curve
    ImageDraw.Draw(band).line([((x - x0) * ss, (y - y0) * ss) for x, y in pts[::2]] + [tuple((pts[-1] - [x0, y0]) * ss)],
                              fill=255, width=int((th + 16) * ss))
    ys, xs = np.nonzero(np.asarray(band))
    px = np.stack([x0 + (xs + 0.5) / ss, y0 + (ys + 0.5) / ss], 1).astype(np.float32)
    out = np.zeros((px.shape[0], 4), np.float32)
    for c0 in range(0, px.shape[0], 4000):
        q = px[c0:c0 + 4000]
        d2 = ((q[:, None, :] - pts[None, :, :]) ** 2).sum(-1)
        j = d2.argmin(1)
        rel = q - pts[j]
        along = (rel * tan[j]).sum(1)
        u = (cum[j] + along) / total * tw
        sy = 1.0 - thin * np.clip(cum[j] / total, 0, 1)
        v = (rel * nrm[j]).sum(1) / sy + th / 2.0 - 0.5
        ok = (u >= 0) & (u <= tw - 1) & (v >= 0) & (v <= th - 1)
        u = np.clip(u, 0, tw - 1.001)
        v = np.clip(v, 0, th - 1.001)
        u0, v0 = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = (u - u0)[:, None], (v - v0)[:, None]
        smp = (tex[v0, u0] * (1 - fu) * (1 - fv) + tex[v0, u0 + 1] * fu * (1 - fv) +
               tex[v0 + 1, u0] * (1 - fu) * fv + tex[v0 + 1, u0 + 1] * fu * fv)
        out[c0:c0 + 4000] = smp * ok[:, None]
    img = np.zeros((H, W, 4), np.float32)
    img[ys, xs] = out
    img = img.reshape(H // ss, ss, W // ss, ss, 4).mean(axis=(1, 3))
    a = img[..., 3:]
    rgb = np.where(a > 1e-4, img[..., :3] / np.maximum(a, 1e-4), 0)
    layer = Image.fromarray((np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)]) * 255 + 0.5).astype(np.uint8), 'RGBA')
    _paste_clip(canvas, layer, x0, y0)
    pe, pb = P(1.0), P(0.995)
    ang = math.atan2(pe[1] - pb[1], pe[0] - pb[0])
    _put_rot(canvas, tip, pe - np.array([math.cos(ang), math.sin(ang)]) * 6, (0.0, 0.5), ang, 0.75, 1.0 - thin)


def _put_rot(canvas, img, xy, origin, ang, sx=1.0, sy=1.0):
    w, h = max(1, int(round(img.width * sx))), max(1, int(round(img.height * sy)))
    im = img.resize((w, h), Image.LANCZOS)
    R = int(math.ceil(math.hypot(w, h))) + 2
    big = Image.new('RGBA', (2 * R, 2 * R), (0, 0, 0, 0))
    big.alpha_composite(im, (R - int(round(origin[0] * w)), R - int(round(origin[1] * h))))
    big = big.rotate(-math.degrees(ang), resample=Image.BICUBIC, center=(R, R))
    _paste_clip(canvas, big, int(round(xy[0])) - R, int(round(xy[1])) - R)


# =========================================================================== people
_TF = None


def townfolk():
    global _TF
    if _TF is None:
        from townfolk2_compose import Townfolk2
        _TF = Townfolk2.from_assets()
    return _TF


def person(preset=None, seed=0, colors=None):
    tf = townfolk()
    p = tf.preset(preset, seed=seed) if preset else tf.random_person(seed=seed)
    if colors:
        p['colors'].update(colors)
    return p


def person_img(p, anim, d, i, face=None):
    return townfolk().compose(p, anim, d, i, face=face)


def cityfolk_person(preset, seed):
    """cityfolk preset (v8 agent) when the fragment exists, else None."""
    if not os.path.exists(os.path.join(ASSETS, 'cityfolk', 'manifest.json')):
        return None
    try:
        sys.path.insert(0, TOOLS)
        import cityfolk_compose as CF                          # noqa: F401  (name per CONTRACT_V8 §AD)
        tf = CF.Cityfolk.from_assets()
        return tf, tf.preset(preset, seed=seed)
    except Exception as e:
        print('  (cityfolk not usable yet: %s)' % e)
        return None


def shadow_ellipse(canvas, xy, w, h, a=0.22):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(sh)
    d.ellipse([xy[0] - w / 2, xy[1] - h / 2, xy[0] + w / 2, xy[1] + h / 2], fill=(27, 40, 64, int(255 * a)))
    sh = sh.filter(ImageFilter.GaussianBlur(3))
    canvas.alpha_composite(sh)


# =========================================================================== ground
def tile_fill(size, tex_path, origin=(0, 0)):
    tex = Image.open(tex_path).convert('RGBA')
    W, H = size
    out = Image.new('RGBA', size)
    ox, oy = int(origin[0]) % tex.width - tex.width, int(origin[1]) % tex.height - tex.height
    for y in range(oy, H, tex.height):
        for x in range(ox, W, tex.width):
            out.alpha_composite(tex, (x, y)) if x >= 0 and y >= 0 else _paste_clip(out, tex, x, y)
    return out


def iso_poly(O, pts):
    return [tuple(O + AX * x + AY * y) for x, y in pts]


def band(canvas, O, x0, x1, y0, y1, tex, feather=2.0, alpha=1.0):
    mask = Image.new('L', canvas.size, 0)
    ImageDraw.Draw(mask).polygon(iso_poly(O, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]), fill=int(255 * alpha))
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    layer = tile_fill(canvas.size, tex, origin=O)
    canvas.paste(layer, (0, 0), mask)


# =========================================================================== labels
def label(d, xy, s, size=12):
    from gen_fx_city_preview import font
    f = font(size)
    d.text(xy, s, font=f, fill=(20, 24, 32), anchor='mm', stroke_width=3, stroke_fill=(255, 255, 255))


# =========================================================================== scene
def main(out=None, W=2240, H=1240, frame=5):
    from gen_fx_city_preview import font
    out = out or os.path.join(PREV, 'fxcity_scene.png')
    O = np.array([1000.0, 690.0])
    S = lambda x, y: O + AX * x + AY * y                       # noqa: E731
    canvas = tile_fill((W, H), os.path.join(ASSETS, 'ground', 'ground_snow.png'))
    # street along world X (houses on its +Y side, fronts facing it), sidewalks on both sides
    band(canvas, O, -16, 22, -0.2, -1.6, os.path.join(ASSETS, 'roads', 'sidewalk.png'), 1.5)
    band(canvas, O, -16, 22, -1.6, -6.2, os.path.join(ASSETS, 'roads', 'road_cobble_wide.png'), 1.5)
    band(canvas, O, -16, 22, -6.2, -7.6, os.path.join(ASSETS, 'roads', 'sidewalk.png'), 1.5)
    # scorch on the snow in front of the burning house
    sc = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c0 = S(2.6, 0.4)
    ImageDraw.Draw(sc).ellipse([c0[0] - 80, c0[1] - 28, c0[0] + 80, c0[1] + 28], fill=(90, 80, 76, 55))
    canvas.alpha_composite(sc.filter(ImageFilter.GaussianBlur(10)))
    drawn = []                                                  # (depth y, order, fn) - painter's algorithm

    def add(y, fn):
        drawn.append((y, len(drawn), fn))

    labels = []
    # --- houses (assets/town, read-only)
    row = [('cafe', -1.0), ('townhouse_b', 2.6), ('bookstore', 6.2), ('flower_shop', 9.8), ('hair_salon', 13.4)]
    fire_house = None
    for k, x in row:
        img, anc, s_ = sprite('town', k)
        p = S(x, 1.9)
        add(p[1], (lambda img=img, anc=anc, p=p: put(canvas, img, p, anc)))
        if k == 'townhouse_b':
            fire_house = (p, s_)
    # --- the fire on townhouse_b (manifest.fireMount)
    hp, hs = fire_house
    fire, fa, fspec = sheet_frames('fx_fire_bld_s')
    fsc = float(np.clip(0.85 * hs['footprint'][0] / fspec['baseWidthPx'], 0.7, 1.3))
    fpos = hp + [0, -0.55 * hs['topPx']]
    smoke, sa, _ = sheet_frames('fx_smoke_column')
    emb, ea, _ = sheet_frames('fx_embers')
    win, wa, _ = sheet_frames('fx_fire_window')
    add(hp[1] + 1, lambda: put(canvas, smoke[frame % 16], fpos + [8, -0.55 * fspec['heightPx'] * fsc], sa))
    add(hp[1] + 2, lambda: put(canvas, win[frame % 12], hp + [-58, -96], wa, scale=0.85))
    add(hp[1] + 3, lambda: put(canvas, fire[frame % 16], fpos, fa, scale=fsc))
    add(hp[1] + 4, lambda: put(canvas, emb[frame % 16], fpos + [4, -70], ea))
    labels.append((fpos + [150, -150], 'fx_fire_bld_s + fx_smoke_column + fx_embers'))
    labels.append((hp + [-150, -84], 'fx_fire_window'))
    # --- fire truck (vehicles) with the red beacon
    tp = S(0.6, -4.4)
    timg, tanc, tdef = vehicle('fire_truck', 'siren_SE_%d' % (frame % 4))
    sw, shh, _ = tdef['shadow']['SE']
    add(tp[1] - 0.5, lambda: shadow_ellipse(canvas, tp, sw * 0.9, shh * 0.9, 0.25))
    add(tp[1], lambda: put(canvas, timg, tp, tanc))
    glow_r, gra, _ = sheet_frames('fx_siren_glow_red')
    sp = tp + np.array(tdef['sirenPoint']['SE'])
    add(tp[1] + 1, lambda: put(canvas, glow_r[frame % 8], sp, gra))
    hosep = tp + np.array(tdef['hosePoint']['SE'])
    labels.append((tp + [-10, 70], 'fire_truck (assets/vehicles) + fx_siren_glow_red'))
    # --- firefighters (cityfolk when available, else townfolk in red helmets) + aimed hose streams
    rope, _, _ = sheet_frames('fx_hose_rope')
    tip, _, _ = sheet_frames('fx_hose_tip')
    mist, ma, _ = sheet_frames('fx_water_mist')
    steam, sta, _ = sheet_frames('fx_steam_puff')
    ffs = [(S(-0.2, -1.3), 'E', 2), (S(3.8, -2.2), 'NE', 5)]
    targets = [hp + [-36, -176], hp + [70, -140]]
    for k, ((fp, dr, seed), T) in enumerate(zip(ffs, targets)):
        cfp = cityfolk_person('firefighter', seed)
        if cfp:
            tfc, per = cfp
            img = tfc.compose(per, 'spray_hose', dr, frame % 4)
            nz = fp + np.array([16, -42])
        else:
            per = person('factory', seed, {'hat': '#D9302A', 'top': '#B8322A', 'top2': '#7E1A16', 'acc': '#F2C230',
                                           'bottom': '#2E3440', 'shoes': '#22242C'})
            img = person_img(per, 'idle', dr, 1)
            nz = fp + (np.array([24, -40]) if dr == 'E' else np.array([16, -48]))
        add(fp[1], (lambda img=img, fp=fp: (shadow_ellipse(canvas, fp, 40, 14), put(canvas, img, fp, (0.5, 0.8125)))))

        def hose_line(fp=fp, k=k):                               # canvas hose on the ground: truck -> firefighter
            dd = ImageDraw.Draw(canvas)
            a_, b_ = hosep + [0, 26], fp + [-8, -2]
            mid = (a_ + b_) / 2 + [0, 26 + 10 * k]
            pts = [tuple(a_ * (1 - t) ** 2 + 2 * mid * t * (1 - t) + b_ * t * t) for t in np.linspace(0, 1, 28)]
            dd.line(pts, fill=(110, 30, 24, 255), width=7, joint='curve')
            dd.line(pts, fill=(200, 64, 50, 255), width=4, joint='curve')
        add(min(fp[1], tp[1]) - 3, hose_line)
        add(hp[1] + 5 + k, (lambda T=T: put(canvas, mist[(frame + 3) % 12], T, ma)))
        add(hp[1] + 7 + k, (lambda nz=nz, T=T, k=k: hose_rope(canvas, nz, T, rope[(frame + k) % 8], tip[(frame + k) % 8])))
        add(hp[1] + 9 + k, (lambda T=T, k=k: put(canvas, steam[(frame * 2 + k * 6) % 14], T + [14, -10], sta, 0.9)))
    labels.append((ffs[1][0] + [150, 30], 'firefighters: aimed fx_hose_rope + fx_hose_tip'))
    labels.append((targets[1] + [150, 10], 'fx_water_mist + fx_steam_puff'))
    # --- alarm post (civic fire_alarm_post when available, else a streetlight) with fx_alarm_flash
    ap = S(-1.8, -0.4)
    try:
        aimg, aanc, adef = sprite('civic', 'fire_alarm_post')
        atop = (adef.get('fxPoints', {}) or {}).get('alarm', [0, -aimg.height * aanc[1] + 10])
    except Exception:
        aimg, aanc, adef = sprite('town', 'streetlight')
        atop = [0, -adef['topPx'] + 14]
    alarm, ala, _ = sheet_frames('fx_alarm_flash')
    add(ap[1], lambda: put(canvas, aimg, ap, aanc))
    add(ap[1] + 1, lambda: put(canvas, alarm[frame % 8], ap + np.array(atop) + [0, -26], ala, scale=0.75))
    labels.append((ap + np.array(atop) + [-86, -26], 'fx_alarm_flash'))
    # --- crowd on the far sidewalk, watching and clapping, with story FX over a few heads
    crowd = [((7.2, -6.6), 'clap', 'SE', 1, None), ((8.4, -6.9), 'clap', 'S', 4, None),
             ((9.6, -6.7), 'idle', 'E', 9, 'fx_question_mark'), ((6.0, -7.0), 'happy', 'SE', 15, 'fx_lightbulb_idea'),
             ((10.8, -6.9), 'talk', 'S', 22, None), ((12.0, -6.6), 'idle', 'E', 31, 'fx_memory_sparkle'),
             ((13.2, -6.8), 'clap', 'SE', 40, None)]
    for (x, y), an, dr, seed, fx in crowd:
        pp = S(x, y)
        per = person(None, seed)
        nfr = {'clap': 6, 'happy': 6, 'talk': 8, 'idle': 4}[an]
        img = person_img(per, an, dr, frame % nfr)
        flip = dr in ('E', 'SE')                          # face the fire (up-left): SW / W
        add(pp[1], (lambda img=img, pp=pp, flip=flip: (shadow_ellipse(canvas, pp, 38, 13),
                                                      put(canvas, img, pp, (0.5, 0.8125), flip=flip))))
        if fx:
            fr, fan, fsp = sheet_frames(fx)
            fi = (frame if fsp['repeat'] == -1 else len(fr) - 2) % len(fr)
            add(pp[1] + 400, (lambda fr=fr, fan=fan, pp=pp, fi=fi: put(canvas, fr[fi], pp + [0, -80], fan, scale=0.9)))
            labels.append((pp + [0, -168], fx))
    labels.append((S(9.6, -7.9) + [0, 46], 'crowd (assets/townfolk) watching - nobody is hurt'))
    # --- fight cloud + police (up the street)
    fcp = S(-7.4, -3.0)
    fight, fia, _ = sheet_frames('fx_fight_cloud')
    add(fcp[1], lambda: put(canvas, fight[frame % 12], fcp, fia))
    labels.append((fcp + [0, 30], 'fx_fight_cloud'))
    pcp = S(-10.8, -5.6)
    pimg, panc, pdef = vehicle('police_car', 'siren_SE_%d' % (frame % 4))
    psw, psh, _ = pdef['shadow']['SE']
    add(pcp[1] - 0.5, lambda: shadow_ellipse(canvas, pcp, psw * 0.9, psh * 0.9, 0.25))
    add(pcp[1], lambda: put(canvas, pimg, pcp, panc))
    gr, gra2, _ = sheet_frames('fx_siren_glow_red')
    gb, gba, _ = sheet_frames('fx_siren_glow_blue')
    psp = pcp + np.array(pdef['sirenPoint']['SE'])
    add(pcp[1] + 1, lambda: (put(canvas, gr[frame % 8], psp + [-7, 0], gra2, scale=0.8),
                             put(canvas, gb[frame % 8], psp + [7, 0], gba, scale=0.8)))
    labels.append((pcp + [0, 52], 'police_car + fx_siren_glow_red / _blue'))
    cop = S(-9.0, -4.4)
    cfp = cityfolk_person('police_officer', 3)
    if cfp:
        cimg = cfp[0].compose(cfp[1], 'run', 'NE', frame % 8)
    else:
        cimg = person_img(person('police', 3), 'walk', 'E', frame % 8)
    add(cop[1], lambda: (shadow_ellipse(canvas, cop, 38, 13), put(canvas, cimg, cop, (0.5, 0.8125))))
    # --- wanted board (civic wanted_board when available, else a simple wooden board) with posters
    wb = S(-4.6, -0.5)
    poster = Image.open(os.path.join(ASSETS, 'fx_city', 'ui_wanted_poster.png')).convert('RGBA')
    try:
        bimg, banc, bdef = sprite('civic', 'wanted_board')
        pts = [np.array(p_) for p_ in bdef.get('posterPoints', [])[:3]]

        def board():
            put(canvas, bimg, wb, banc)
            for p_ in pts:
                put(canvas, poster, wb + p_, (0.5, 0.5), scale=0.22)
    except Exception:
        def board():
            dd = ImageDraw.Draw(canvas)
            x, y = wb
            for px_ in (x - 52, x + 52):
                dd.rounded_rectangle([px_ - 5, y - 120, px_ + 5, y], 3, fill=(110, 70, 40, 255), outline=(60, 36, 20, 255))
            dd.rounded_rectangle([x - 70, y - 150, x + 70, y - 52], 8, fill=(201, 143, 85, 255), outline=(78, 46, 22, 255),
                                 width=3)
            dd.rounded_rectangle([x - 74, y - 158, x + 74, y - 146], 6, fill=(244, 247, 251, 255), outline=(126, 147, 181, 255))
            for dx in (-36, 36):
                put(canvas, poster, (x + dx, y - 101), (0.5, 0.5), scale=0.29)
    add(wb[1], board)
    labels.append((wb + [0, 24], 'wanted board + ui_wanted_poster'))
    # --- paint back to front, then labels
    for _, _, fn in sorted(drawn, key=lambda t: (t[0], t[1])):
        fn()
    d = ImageDraw.Draw(canvas)
    for p, s_ in labels:
        label(d, (p[0], p[1]), s_, 13)
    # --- UI overlay: the newspaper panel + a story card, like the phone UI would show them
    try:
        import gen_ui4 as UI
        import gen_fx_city_preview as PV
        panels = {k: Image.open(os.path.join(ASSETS, 'fx_city', k + '.png')).convert('RGBA') for k, *_ in UI.PANELS}
        m = _man('fx_city')
        at = m['atlases'][0]
        icons = {k: atlas_frame(at['png'], at['json'], k) for k, *_ in UI.ICONS}
        margins = {k: mm for k, _f, mm, _e, _n in UI.PANELS}
        extras = {k: e for k, _f, _m, e, _n in UI.PANELS}
        paper = PV.newspaper_mock(panels, icons, extras, margins)
        paper = paper.resize((int(paper.width * 0.6), int(paper.height * 0.6)), Image.LANCZOS)
        sh = Image.new('RGBA', (paper.width + 60, paper.height + 60), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([30, 36, paper.width + 30, paper.height + 36], 12, fill=(20, 30, 50, 90))
        sh = sh.filter(ImageFilter.GaussianBlur(8))
        px0, py0 = W - paper.width - 36, 26
        canvas.alpha_composite(sh, (px0 - 30, py0 - 30))
        canvas.alpha_composite(paper.rotate(-2, Image.BICUBIC, expand=True), (px0 - 6, py0 - 4))
        label(d, (px0 + paper.width / 2, py0 + paper.height + 26),
              'UI: ui_newspaper + masthead / column / photo / divider (솔방울 신문)', 13)
        card = PV.nine_stretch(panels['ui_story_card'], margins['ui_story_card'], 330, 116)
        cd = ImageDraw.Draw(card)
        card.alpha_composite(icons['ui_icon_rumor'].resize((40, 40), Image.LANCZOS), (22, 34))
        PV.text(cd, (82, 46), '들었어? 소방관들이', 16, fill=(60, 50, 40), bold=True)
        PV.text(cd, (82, 68), '5분 만에 왔대!', 16, fill=(60, 50, 40), bold=True)
        canvas.alpha_composite(card, (24, 22))
        label(d, (24 + 165, 22 + 130), 'UI: ui_story_card (rumour)', 13)
    except Exception as e:                               # pragma: no cover
        print('  (UI overlay skipped: %s)' % e)
    bar = Image.new('RGBA', (W, 30), (32, 92, 168, 255))
    canvas.alpha_composite(bar, (0, H - 30))
    d.text((12, H - 24), 'fx_city at 1x (PPU 64): assets/town houses, assets/vehicles fire_truck + police_car, '
                          'townfolk crowd; fire / smoke / embers / hose / mist / steam / sirens / alarm / fight cloud '
                          '/ story FX / wanted poster + newspaper UI from assets/fx_city', font=font(14),
           fill=(255, 255, 255))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    canvas.convert('RGB').save(out, optimize=True)
    print('scene ->', out)
    return canvas


def snapshot(w, h, frame=3):
    """Small 'press photo' of a burning townhouse with smoke and steam for the newspaper mock (assets only)."""
    big = tile_fill((440, 360), os.path.join(ASSETS, 'ground', 'ground_snow.png'))
    img, anc, s = sprite('town', 'townhouse_b')
    p = np.array([210.0, 320.0])
    put(big, img, p, anc)
    fire, fa, fs = sheet_frames('fx_fire_bld_s')
    smoke, sa, _ = sheet_frames('fx_smoke_column')
    fpos = p + [0, -0.55 * s['topPx']]
    put(big, smoke[frame], fpos + [8, -80], sa)
    put(big, fire[frame], fpos, fa)
    crop = big.crop((40, 20, 420, 340)).resize((w, h), Image.LANCZOS)
    # newsprint look: slight desaturation + warm tone
    a = np.asarray(crop).astype(np.float32)
    g = a[..., :3].mean(axis=2, keepdims=True)
    a[..., :3] = a[..., :3] * 0.55 + g * 0.45
    a[..., :3] *= np.array([1.02, 0.99, 0.93])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


if __name__ == '__main__':
    main()
