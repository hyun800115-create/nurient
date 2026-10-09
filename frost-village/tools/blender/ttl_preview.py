"""
ttl_preview.py - previews of the title art (plain python: Pillow + numpy).

    python3 tools/blender/ttl_preview.py

Writes docs/previews/title_art_sheet.png       every piece of assets/title on one sheet
       docs/previews/title_art_mock.png        phone-size (1080 x 2340) night title mock: backdrop +
                                               logo + a PLACEHOLDER diorama made of real game sprites
                                               + "터치하여 시작"
       docs/previews/title_art_mock_times.png  the same mock at day / golden dusk / night (tints)
       docs/previews/title_art_icon.png        the app icon at 48 / 96 / 192 px (+ masks, adaptive pair)
       docs/previews/title_art_band.png        the backdrop laid out exactly like src/title/TitleSky.js
                                               (day / dusk / night, before and at the city stage)
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import ttl_config as C          # noqa: E402

A = os.path.join(C.GAME, 'assets')
T = os.path.join(A, 'title')
PREV = os.path.join(C.GAME, 'docs', 'previews')
FONT_KO = C.FONT_KO
FONT_UI = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def man():
    return json.load(open(os.path.join(T, 'manifest.json')))


def img(key, m=None):
    m = m or man()
    for r in m['images']:
        if r['key'] == key:
            return Image.open(os.path.join(A, r['png'])).convert('RGBA')
    return None


def font(sz, ko=True):
    try:
        return ImageFont.truetype(FONT_KO if ko else FONT_UI, sz)
    except Exception:
        return ImageFont.load_default()


def tint(im, hexc):
    if not hexc:
        return im
    c = tuple(int(hexc[i:i + 2], 16) for i in (1, 3, 5))
    r, g, b, a = im.split()
    rgb = ImageChops.multiply(Image.merge('RGB', (r, g, b)), Image.new('RGB', im.size, c))
    return Image.merge('RGBA', (*rgb.split(), a))


def add_blend(dst, src, xy, alpha=1.0):
    """Additive blend of src (RGBA) onto dst (RGBA) at xy."""
    d = np.asarray(dst, np.float32) / 255.0
    s = np.asarray(src, np.float32) / 255.0
    x, y = xy
    h, w = s.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(d.shape[1], x + w), min(d.shape[0], y + h)
    if x1 <= x0 or y1 <= y0:
        return dst
    ss = s[y0 - y:y1 - y, x0 - x:x1 - x]
    d[y0:y1, x0:x1, :3] = np.clip(d[y0:y1, x0:x1, :3] + ss[..., :3] * ss[..., 3:4] * alpha, 0, 1)
    return Image.fromarray((d * 255 + 0.5).astype(np.uint8), 'RGBA')


def tile_x(im, width, scale):
    im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
    out = Image.new('RGBA', (width, im.height), (0, 0, 0, 0))
    x = 0
    while x < width:
        out.alpha_composite(im, (x, 0)) if x + im.width <= width else out.alpha_composite(im.crop((0, 0, width - x, im.height)), (x, 0))
        x += im.width
    return out


# ------------------------------------------------------------------ game sprites (for the placeholder diorama)
_SPR = None


def game_sprite(key):
    global _SPR
    if _SPR is None:
        _SPR = {}
        for frag in os.listdir(A):
            p = os.path.join(A, frag, 'manifest.json')
            if not os.path.exists(p) or frag == 'title':
                continue
            try:
                d = json.load(open(p))
            except Exception:
                continue
            atl = {a['key']: a for a in d.get('atlases', [])}
            ims = {a['key']: a for a in d.get('images', [])}
            for k, s in d.get('sprites', {}).items():
                _SPR[k] = (s, atl, ims)
    if key not in _SPR:
        return None, None
    s, atl, ims = _SPR[key]
    if 'atlas' in s and s['atlas'] in atl:
        a = atl[s['atlas']]
        fr = json.load(open(os.path.join(A, a['json'])))['frames'].get(s['frame'])
        if fr is None:
            return None, None
        sheet = Image.open(os.path.join(A, a['png'])).convert('RGBA')
        f = fr['frame']
        crop = sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
        if fr.get('rotated'):
            crop = crop.rotate(90, expand=True)
        src = fr['sourceSize']
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(crop, (fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']))
    elif 'image' in s and s['image'] in ims:
        full = Image.open(os.path.join(A, ims[s['image']]['png'])).convert('RGBA')
    else:
        return None, None
    return full, s.get('anchor', [0.5, 0.5])


# ------------------------------------------------------------------ the mock
TIMES = {
    'day': dict(sky='ttl_sky_day', stars=0.0, aurora=0.0, moon=False, lights=0.0, logo_glow=0.0),
    'dusk': dict(sky='ttl_sky_dusk', stars=0.25, aurora=0.0, moon=False, lights=0.55, logo_glow=0.2),
    'night': dict(sky='ttl_sky_night', stars=1.0, aurora=0.85, moon=True, lights=1.0, logo_glow=0.35),
}


def diorama(W, H, night=0.0):
    """Placeholder: a snowy island with real game sprites (the title_code agent builds the real one)."""
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    cx, cy = W / 2, H * 0.62
    # sea under the island
    d.ellipse((cx - W * 0.62, cy - H * 0.10, cx + W * 0.62, cy + H * 0.46), fill=(58, 112, 170, 255))
    d.ellipse((cx - W * 0.56, cy - H * 0.13, cx + W * 0.56, cy + H * 0.36), fill=(186, 214, 238, 255))
    d.ellipse((cx - W * 0.53, cy - H * 0.15, cx + W * 0.53, cy + H * 0.33), fill=(246, 250, 255, 255))
    lay = lay.filter(ImageFilter.GaussianBlur(1.2))
    s = W / 1080.0 * 0.9
    items = [('tree_pine_snow', -0.40, -0.06), ('tree_pine_a', 0.40, -0.08), ('lighthouse', 0.38, 0.04),
             ('town_hall', -0.04, -0.05), ('apartment_a', 0.20, -0.02), ('train_station', -0.27, 0.02),
             ('watchtower', -0.42, 0.08), ('house_a', -0.13, 0.12), ('cafe', 0.12, 0.12), ('house_b', 0.30, 0.17),
             ('streetlight', 0.02, 0.19), ('tree_pine_snow', -0.30, 0.22), ('campfire', -0.06, 0.25),
             ('tree_pine_b', 0.44, 0.24)]
    items.sort(key=lambda t: t[2])
    for key, fx, fy in items:
        im, anc = game_sprite(key)
        if im is None:
            continue
        im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
        if night:
            im = tint(im, '#8E9CD0' if night > 0.5 else '#E8C8D0')
        x = int(cx + fx * W - anc[0] * im.width)
        y = int(cy + fy * H * 0.55 - anc[1] * im.height)
        lay.alpha_composite(im, (x, y))
    return lay


def mock(time='night', W=1080, H=2340, label=True):
    m = man()
    t = TIMES[time]
    tints = m['meta'].get('tints', {}).get(time, {})
    k = W / 720.0                                        # logical px -> mock px
    # the backdrop exactly as src/title/TitleSky.js lays it out (city stage: the placeholder is a town)
    out = sky_band(time, city=1.0, LW=720, LH=int(720 * H / W), out_w=W, full=True)
    out.alpha_composite(diorama(W, H, night=1.0 if time == 'night' else (0.4 if time == 'dusk' else 0.0)))
    # falling snow
    rnd = np.random.default_rng(3)
    fx = json.load(open(os.path.join(T, 'ttl_fx.json')))['frames']
    sheet = Image.open(os.path.join(T, 'ttl_fx.png')).convert('RGBA')

    def frame(n):
        f = fx[n]['frame']
        return sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h']))
    for n, cnt, sc, al in (('ttl_fx_snow_s', 120, 0.8, 0.7), ('ttl_fx_snow_m', 45, 1.0, 0.9),
                           ('ttl_fx_flake_s', 10, 1.0, 0.9), ('ttl_fx_snow_bokeh', 4, 1.3, 0.6)):
        fr = frame(n)
        for i in range(cnt):
            s2 = sc * k * rnd.uniform(0.6, 1.0)
            im = fr.resize((max(2, int(fr.width * s2)), max(2, int(fr.height * s2))), Image.LANCZOS)
            im.putalpha(im.getchannel('A').point(lambda v, al=al: int(v * al)))
            out.alpha_composite(im, (int(rnd.random() * W), int(rnd.random() * H)))
    # logo
    lg = img('ttl_logo_main', m)
    lw = int(500 * k)
    lg = lg.resize((lw, int(lg.height * lw / lg.width)), Image.LANCZOS)
    ly = int(H * 0.165 - lg.height / 2)
    if t['logo_glow']:
        pad = int(90 * k)
        am = Image.new('L', (lg.width + 2 * pad, lg.height + 2 * pad), 0)
        am.paste(lg.getchannel('A'), (pad, pad))
        ga = am.filter(ImageFilter.GaussianBlur(30 * k))
        g2 = Image.new('RGBA', am.size, (255, 236, 190, 0))
        g2.putalpha(ga.point(lambda v: int(v * t['logo_glow'])))
        out.alpha_composite(g2, ((W - lw) // 2 - pad, ly - pad))
    out.alpha_composite(lg, ((W - lw) // 2, ly))
    tw = frame('ttl_fx_twinkle')
    for (fx_, fy_, s3) in ((0.20, 0.10, 0.9), (0.82, 0.21, 0.7), (0.70, 0.08, 0.5)):
        im = tw.resize((int(tw.width * s3 * k), int(tw.height * s3 * k)), Image.LANCZOS)
        out = add_blend(out, im, (int(W * fx_), int(H * fy_)), 0.9)
    # "터치하여 시작" + version
    d = ImageDraw.Draw(out)
    f = font(int(46 * k))
    txt = '터치하여 시작'
    tw_ = d.textlength(txt, font=f)
    y = int(H * 0.865)
    d.text(((W - tw_) / 2, y), txt, font=f, fill=(255, 255, 255, 255), stroke_width=int(6 * k),
           stroke_fill=(29, 47, 94, 255))
    fs = font(int(20 * k), ko=False)
    d.text((int(24 * k), H - int(48 * k)), 'v4.0  (placeholder)', font=fs, fill=(255, 255, 255, 180))
    if label:
        d.text((int(24 * k), int(H * 0.33)), 'diorama area = PLACEHOLDER (title_code builds the real one)',
               font=font(int(16 * k), ko=False), fill=(255, 255, 255, 150))
    return out.convert('RGB')


# ------------------------------------------------------------------ the title's own sky band
def sky_band(time='night', city=0.0, LW=720, LH=1558, out_w=540, full=False):
    """The backdrop exactly as src/title/TitleSky.js lays it out (strip bottoms relative to the horizon,
    scales, aurora sizes, tints from the manifest) - the top of the title down to just under the
    horizon, at out_w px wide.  city = 0..1 (the far city fades in at the city stage)."""
    m = man()
    k = out_w / float(LW)
    W, H = out_w, int(LH * k)
    hz = int(H * 0.40)
    night = {'day': 0.0, 'dusk': 0.0, 'night': 1.0}[time]
    tints = m['meta'].get('tints', {}).get(time, {})
    out = img(TIMES[time]['sky'], m).resize((W + 4, hz + 60), Image.BICUBIC)
    canvas = Image.new('RGBA', (W, H if full else hz + int(H * 0.06)), (0, 0, 0, 255))
    canvas.alpha_composite(out.crop((2, 0, W + 2, min(out.height, canvas.height))), (0, 0))
    out = canvas
    if night:
        st = img('ttl_stars', m)
        st = st.resize((W, int(st.height * W / st.width)), Image.LANCZOS)
        out.alpha_composite(st, (0, 0))
        mo = img('ttl_moon', m)
        ms = int(mo.width * 0.62 * k)
        mo = mo.resize((ms, ms), Image.LANCZOS)
        out.alpha_composite(mo, (int(W * 0.12 - ms / 2), int(H * 0.075 - ms / 2)))
        au = img('ttl_aurora', m)
        a1 = au.resize((int(W * 1.45), int(hz * 0.85)), Image.LANCZOS)
        out = add_blend(out, a1, (int(W * 0.5 - a1.width / 2), int(H * 0.02)), 0.9)
        a2 = au.transpose(Image.FLIP_LEFT_RIGHT).resize((int(W * 1.2), int(hz * 0.6)), Image.LANCZOS)
        out = add_blend(out, a2, (int(W * 0.56 - a2.width / 2), int(H * 0.06)), 0.55)

    def strip(key, y, scale=1.0, alpha=1.0, add=False, tint_=True):
        im = img(key, m)
        if im is None or alpha <= 0:
            return
        sc = W / float(im.width) * scale
        lay = tile_x(tint(im, tints.get(key)) if tint_ else im, W, sc)
        nonlocal out
        if add:
            out = add_blend(out, lay, (0, int(y) - lay.height), alpha)
        else:
            if alpha < 1:
                lay.putalpha(lay.getchannel('A').point(lambda v: int(v * alpha)))
            out.alpha_composite(lay, (0, int(y) - lay.height))
    strip('ttl_clouds', hz - H * 0.115)
    strip('ttl_mtn_far', hz - H * 0.035)
    strip('ttl_city_far', hz - H * 0.022, 0.8, city * 0.9)
    strip('ttl_city_lights', hz - H * 0.022, 0.8, city * night, add=True, tint_=False)
    strip('ttl_mtn_mid', hz - H * 0.006)
    strip('ttl_forest', hz + 4, 0.42)
    # the sea from the horizon down (flat stand-in for the game's water texture)
    sea = {'day': (70, 140, 210), 'dusk': (150, 120, 170), 'night': (34, 56, 120)}[time]
    d = ImageDraw.Draw(out)
    d.rectangle((0, hz + 4, W, out.height), fill=sea + (255,))
    return out.convert('RGB') if not full else out


def band_sheet():
    cols = [('day', 0.0), ('dusk', 0.0), ('night', 0.0), ('day', 1.0), ('dusk', 1.0), ('night', 1.0)]
    ims = [sky_band(t, c) for t, c in cols]
    w, h = ims[0].size
    out = Image.new('RGB', (w * 3 + 40, h * 2 + 100), (236, 242, 250))
    d = ImageDraw.Draw(out)
    f = font(22)
    for i, (im, (t, c)) in enumerate(zip(ims, cols)):
        x, y = 10 + (i % 3) * (w + 10), 40 + (i // 3) * (h + 50)
        out.paste(im, (x, y))
        d.text((x, y - 30), '%s  %s' % ({'day': '낮', 'dusk': '노을', 'night': '밤'}[t], '도시 단계' if c else '개척~읍'),
               font=f, fill=(29, 47, 94))
    return out


# ------------------------------------------------------------------ icon preview
def icon_preview():
    d = os.path.join(T, 'icon')
    p = os.path.join(d, 'icon_1024.png')
    if not os.path.exists(p):
        return None
    ic = Image.open(p).convert('RGBA')
    W, H = 1400, 620
    out = Image.new('RGBA', (W, H), (236, 242, 250, 255))
    dr = ImageDraw.Draw(out)
    f = font(26)
    fs = font(18, ko=False)
    dr.text((24, 16), '앱 아이콘 - 48 / 96 / 192 px (실제 크기) + 마스크', font=f, fill=(29, 47, 94, 255))

    def rounded(im, r):
        m = Image.new('L', im.size, 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
        o = im.copy()
        o.putalpha(ImageChops.multiply(im.getchannel('A'), m))
        return o

    def circle(im):
        m = Image.new('L', im.size, 0)
        ImageDraw.Draw(m).ellipse((0, 0, im.width - 1, im.height - 1), fill=255)
        o = im.copy()
        o.putalpha(m)
        return o
    x = 30
    for s in (48, 96, 192):
        im = rounded(ic.resize((s, s), Image.LANCZOS), int(s * 0.22))
        out.alpha_composite(im, (x, 80))
        dr.text((x, 80 + s + 8), '%d px' % s, font=fs, fill=(60, 70, 90, 255))
        x += s + 40
    # dark home screen
    dark = Image.new('RGBA', (420, 260), (24, 30, 48, 255))
    xx = 20
    for s in (48, 96, 192):
        im = circle(ic.resize((s, s), Image.LANCZOS))
        dark.alpha_composite(im, (xx, 30))
        xx += s + 24
    out.alpha_composite(dark, (x, 70))
    # 1024 thumbnail + adaptive pair
    out.alpha_composite(ic.resize((250, 250), Image.LANCZOS), (30, 300))
    dr.text((30, 556), 'icon_1024 (iOS / store)', font=fs, fill=(60, 70, 90, 255))
    fg_p, bg_p = os.path.join(d, 'ic_launcher_foreground.png'), os.path.join(d, 'ic_launcher_background.png')
    if os.path.exists(fg_p):
        fg = Image.open(fg_p).convert('RGBA').resize((216, 216), Image.LANCZOS)
        bg = Image.open(bg_p).convert('RGBA').resize((216, 216), Image.LANCZOS)
        chk = Image.new('RGBA', (216, 216), (255, 255, 255, 255))
        cd = ImageDraw.Draw(chk)
        for i in range(0, 216, 18):
            for j in range(0, 216, 18):
                if (i + j) // 18 % 2:
                    cd.rectangle((i, j, i + 17, j + 17), fill=(220, 224, 232, 255))
        chk.alpha_composite(fg)
        out.alpha_composite(bg, (360, 330))
        out.alpha_composite(chk, (600, 330))
        comp = bg.copy()
        comp.alpha_composite(fg)
        sd = ImageDraw.Draw(comp)
        r = 216 * 33 / 108.0
        sd.ellipse((108 - r, 108 - r, 108 + r, 108 + r), outline=(255, 80, 80, 200), width=2)
        out.alpha_composite(circle(comp), (840, 330))
        out.alpha_composite(rounded(bg.copy(), 50), (1090, 330))
        sq = bg.copy()
        sq.alpha_composite(fg)
        out.alpha_composite(rounded(sq, 50), (1090, 330))
        dr.text((360, 556), 'adaptive background', font=fs, fill=(60, 70, 90, 255))
        dr.text((600, 556), 'adaptive foreground', font=fs, fill=(60, 70, 90, 255))
        dr.text((840, 556), 'circle (red = safe)', font=fs, fill=(60, 70, 90, 255))
        dr.text((1090, 556), 'squircle mask', font=fs, fill=(60, 70, 90, 255))
    return out.convert('RGB')


# ------------------------------------------------------------------ the sheet
def sheet():
    m = man()
    W = 2000
    blocks = []
    f = font(30)
    fs = font(17, ko=False)

    def block(title, ims, bg=(214, 228, 244), h=None, gap=24, notes=None):
        hh = h or max(i.height for i in ims) + 70
        b = Image.new('RGBA', (W, hh), bg + (255,))
        d = ImageDraw.Draw(b)
        d.text((20, 10), title, font=f, fill=(29, 47, 94, 255))
        x = 20
        for k_, im in enumerate(ims):
            if x + im.width > W - 10:
                break
            b.alpha_composite(im, (x, 54))
            if notes:
                d.text((x, 54 + im.height + 2), notes[k_], font=fs, fill=(40, 50, 70, 255))
            x += im.width + gap
        blocks.append(b)

    def fit(im, h):
        return im.resize((max(1, int(im.width * h / im.height)), h), Image.LANCZOS)
    lm = img('ttl_logo_main', m)
    block('로고 (@2x, 1x)  ttl_logo_main / _1x / short / en', [lm, img('ttl_logo_main_1x', m),
                                                             fit(img('ttl_logo_short', m), 420)])
    en = img('ttl_logo_en', m)
    parts = Image.open(os.path.join(T, 'ttl_logo_parts.png')).convert('RGBA')
    shine = img('ttl_logo_main_shine', m)
    sh_bg = Image.new('RGBA', shine.size, (40, 50, 80, 255))
    sh_bg.alpha_composite(shine)
    band = img('ttl_shine_band', m)
    b_bg = Image.new('RGBA', band.size, (40, 50, 80, 255))
    b_bg.alpha_composite(band)
    block('영문 로고 / 샤인 마스크 / 샤인 띠', [fit(en, 230), fit(sh_bg, 230), fit(b_bg, 230)],
          notes=['ttl_logo_en', 'ttl_logo_main_shine', 'ttl_shine_band'])
    pw = min(W - 40, parts.width)
    pbg = Image.new('RGBA', parts.size, (120, 160, 210, 255))
    pbg.alpha_composite(parts)
    block('로고 조각 아틀라스 ttl_logo_parts (한 글자씩 떨어지는 등장용)', [pbg.resize((pw, int(parts.height * pw / parts.width)), Image.LANCZOS)])
    skies = [img('ttl_sky_' + t, m).resize((140, 420)) for t in ('day', 'dusk', 'night')]
    night = Image.new('RGBA', (420, 420), (8, 16, 44, 255))
    night.alpha_composite(img('ttl_stars', m).resize((420, 525)).crop((0, 0, 420, 420)))
    night = add_blend(night, img('ttl_aurora', m).resize((420, 210)), (0, 150), 0.9)
    night.alpha_composite(img('ttl_moon', m).resize((110, 110)), (290, 20))
    block('하늘 (낮 / 노을 / 밤)  +  별, 오로라, 달', skies + [night], gap=16,
          notes=['day', 'dusk', 'night', 'stars + aurora (ADD) + moon'])
    strips = []
    for key in ('ttl_mtn_far', 'ttl_mtn_mid', 'ttl_forest', 'ttl_clouds', 'ttl_city_far'):
        im = img(key, m)
        if im is None:
            continue
        strips.append((key, im))
    for tname in ('day', 'dusk', 'night'):
        tints = m['meta']['tints'][tname]
        ims = []
        for key, im in strips:
            ti = tint(im, tints.get(key))
            th = fit(ti, 84)
            ims.append(th)
        sky = img('ttl_sky_' + tname, m).resize((W, 180))
        bgc = sky
        b = Image.new('RGBA', (W, 180), (0, 0, 0, 255))
        b.alpha_composite(bgc)
        d = ImageDraw.Draw(b)
        d.text((20, 10), '배경 띠 (%s 틴트)  mtn_far / mtn_mid / forest / clouds / city_far + lights' % tname, font=f,
               fill=(255, 255, 255, 255), stroke_width=3, stroke_fill=(29, 47, 94, 255))
        x = 20
        for k_, im in enumerate(ims):
            if x + im.width > W:
                break
            b.alpha_composite(im, (x, 70))
            if strips[k_][0] == 'ttl_city_far' and tname != 'day':
                b = add_blend(b, fit(img('ttl_city_lights', m), 84), (x, 70), 1.0 if tname == 'night' else 0.5)
            x += im.width + 14
        blocks.append(b)
    fxa = Image.open(os.path.join(T, 'ttl_fx.png')).convert('RGBA')
    pop = Image.open(os.path.join(T, 'ttl_fx_pop.png')).convert('RGBA')
    fx_bg = Image.new('RGBA', (fxa.width * 2 + 20, fxa.height * 2 + 20), (54, 84, 140, 255))
    fx_bg.alpha_composite(fxa.resize((fxa.width * 2, fxa.height * 2), Image.LANCZOS), (10, 10))
    pop_bg = Image.new('RGBA', pop.size, (240, 246, 252, 255))
    pop_bg.alpha_composite(pop)
    block('효과  ttl_fx (눈송이 s/m, 보케, 결정 s/m, 반짝, 빛, 눈꽃)  /  ttl_fx_pop (8 프레임, 눈 위)', [fx_bg, pop_bg])
    ic = os.path.join(T, 'icon', 'icon_1024.png')
    if os.path.exists(ic):
        icn = Image.open(ic).convert('RGBA')
        ims = [icn.resize((300, 300), Image.LANCZOS)] + [icn.resize((s, s), Image.LANCZOS) for s in (192, 96, 48)]
        fgp = os.path.join(T, 'icon', 'ic_launcher_foreground.png')
        if os.path.exists(fgp):
            bgp = Image.open(os.path.join(T, 'icon', 'ic_launcher_background.png')).convert('RGBA').resize((300, 300))
            fgi = Image.open(fgp).convert('RGBA').resize((300, 300))
            chk = Image.new('RGBA', (300, 300), (200, 205, 215, 255))
            chk.alpha_composite(fgi)
            ims += [bgp, chk]
        block('앱 아이콘 1024 / 192 / 96 / 48  +  안드로이드 적응형 배경 / 전경', ims, gap=20)
    H = sum(b.height for b in blocks) + 10 * len(blocks)
    out = Image.new('RGBA', (W, H), (255, 255, 255, 255))
    y = 0
    for b in blocks:
        out.alpha_composite(b, (0, y))
        y += b.height + 10
    return out.convert('RGB')


def main():
    os.makedirs(PREV, exist_ok=True)
    sheet().save(os.path.join(PREV, 'title_art_sheet.png'), optimize=True)
    mk = mock('night')
    mk.save(os.path.join(PREV, 'title_art_mock.png'), optimize=True)
    ims = [mock(t, 540, 1170, label=False) for t in ('day', 'dusk', 'night')]
    row = Image.new('RGB', (540 * 3 + 40, 1170), (255, 255, 255))
    for i, im in enumerate(ims):
        row.paste(im, (i * 560, 0))
    row.save(os.path.join(PREV, 'title_art_mock_times.png'), optimize=True)
    ip = icon_preview()
    if ip is not None:
        ip.save(os.path.join(PREV, 'title_art_icon.png'), optimize=True)
    band_sheet().save(os.path.join(PREV, 'title_art_band.png'), optimize=True)
    print('PREVIEW_DONE')


if __name__ == '__main__':
    main()
