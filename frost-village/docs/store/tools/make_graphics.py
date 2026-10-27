#!/usr/bin/env python3
"""Google Play listing graphics for 행복한 눈꽃마을 이야기 — the "healing" look: village panoramas, a small-world app
icon, calm screenshots. Every picture comes from the real game (captures staged with tools/look/) or from the game's own models
(icon_scenes.py renders); this script only frames, captions and checks them.

    python3 frost-village/docs/store/tools/make_graphics.py --raw RAW [--old OLD]

RAW holds the captures / renders:
    RAW/feature/A_coast_golden.png ...   3200 x 1600 game panoramas (HUD hidden), see tools/look/README.md
    RAW/shots/01_village.png ...         1080 x 1920 game screenshots (HUD as players see it)
    RAW/icons/<scene>_<pass>.png         icon_scenes.py renders (globe / island / day; full / fg / bg)
OLD (optional) = a copy of the previous docs/store/assets, for the before / after sheets.

Writes into frost-village/docs/store/assets/:
  feature_graphic.png / feature_graphic_en.png   1024 x 500, 24-bit PNG — the recommended option (A)
  icon_512.png                                   512 x 512, 32-bit PNG — the recommended option (globe)
  options/feature_{A,B,C}_*.png, options/icon_{A,B,C}_*.png        every option, for choosing
  screenshots/NN_*.jpg                           1080 x 1920 raw game screenshots (JPEG q90)
  screenshots_caption/NN_*.jpg, screenshots_caption_en/NN_*.jpg   the same with a short caption above (1080 x 1920)
  launcher/source/*.png                          the APK/AAB launcher source set (same files as assets/title/icon)
  launcher/res/mipmap-*/...                      the density PNGs build_apk.py makes from that source (for a look)
  preview_*.jpg                                  before / after and contact sheets (not for upload)
  checks.json                                    Play's limits, checked file by file
and docs/store/upload_bundle/ (the files to upload, numbered, + a zip).
"""
import argparse
import json
import os
import shutil
import sys
import zipfile

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
STORE = os.path.abspath(os.path.join(HERE, '..'))
FV = os.path.abspath(os.path.join(STORE, '..', '..'))          # frost-village/
T = os.path.join(FV, 'assets', 'title')
OUT = os.path.join(STORE, 'assets')
BUNDLE = os.path.join(STORE, 'upload_bundle')
FONT_KO = os.path.join(FV, 'tools', 'fonts', 'Jua-Regular.ttf')
FONT_EN = os.path.join(FV, 'tools', 'fonts', 'Fredoka-Bold.ttf')
FONT_EN2 = os.path.join(FV, 'tools', 'fonts', 'Fredoka-SemiBold.ttf')

# listing order: raw stem -> (Korean caption, Korean line 2, English caption, English line 2)
SHOTS = [
    ('01_village', '내가 만든 작은 마을', '주민들이 저마다의 하루를 보내요',
     'A little world of your own', 'Everyone goes about their day'),
    ('02_town', '이웃 마을도 오늘은 느긋하게', '놀이터에서, 역 앞에서, 삼삼오오',
     'A slow day in the next town', 'At the playground, by the station'),
    ('03_train', '기차가 두 마을을 이어 줘요', '칙칙폭폭, 이웃들이 놀러 와요',
     'The train links the two towns', 'Neighbours come over for the day'),
    ('04_restaurant', '모두 모여 따뜻한 한 끼', '식당은 오늘도 웃음소리로 북적',
     'A warm meal together', 'The restaurant is full of chatter'),
    ('05_harbour', '반짝이는 바다, 돌아오는 고깃배', '파도 소리를 들으며 잠시 쉬어 가요',
     'A sparkling sea, the boat comes home', 'Rest a while by the waves'),
    ('06_watch', '가만히 지켜보기만 해도 좋아요', '관망 모드: 촌장님이 알아서 하루를 보내요',
     'Just sit back and watch', 'Watch mode: the chief spends the day on his own'),
    ('07_ceremony', '마을이 자라면 다 함께 축하해요', '서리마을이 서리읍이 되던 날',
     'The village grows, everyone cheers', 'The day the village became a town'),
    ('08_evening', '해가 지면 창마다 불이 켜져요', '오늘도 수고했어요',
     'Windows glow as the sun goes down', 'Well done today'),
]

# feature graphic options: raw file, logo placement (centre x, centre y as a fraction, width as a fraction)
FEATURES = [
    ('A', 'coast_golden', 'A_coast_golden.png', dict(lx=0.755, ly=0.29, lw=0.37)),
    ('B', 'coast_dusk', 'B_coast_dusk.png', dict(lx=0.755, ly=0.29, lw=0.37)),
    ('C', 'village_golden', 'C_village_golden.png', dict(lx=0.25, ly=0.29, lw=0.40)),
]
FEATURE_PICK = 'A'
ICONS = [('A', 'globe'), ('B', 'island'), ('C', 'day')]
ICON_PICK = 'globe'
# launcher sizes (build_apk.py DENSITIES): legacy icon px, adaptive layer px (108 dp)
DENSITIES = {'mdpi': (48, 108), 'hdpi': (72, 162), 'xhdpi': (96, 216), 'xxhdpi': (144, 324), 'xxxhdpi': (192, 432)}


def gradient(w, h, stops):
    g = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            t0, c0 = stops[i]
            t1, c1 = stops[i + 1]
            if t0 <= t <= t1:
                u = (t - t0) / max(1e-6, t1 - t0)
                g.putpixel((0, y), tuple(round(c0[k] + (c1[k] - c0[k]) * u) for k in range(3)))
                break
    return g.resize((w, h))


def soft(im, blur, op, col):
    pad = int(blur * 3)
    a = Image.new('L', (im.width + 2 * pad, im.height + 2 * pad), 0)
    a.paste(im.getchannel('A'), (pad, pad))
    a = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * op))
    s = Image.new('RGBA', a.size, col + (0,))
    s.putalpha(a)
    return s, pad


# ------------------------------------------------------------------ feature graphic
def feature(raw, lang, lx, ly, lw):
    im = Image.open(raw).convert('RGB')
    W, H = im.size
    th = round(W / 2.048)
    y0 = (H - th) // 2
    im = im.crop((0, y0, W, y0 + th))
    S = im.width / 1024
    cv = im.convert('RGBA')
    # a soft dark-blue edge vignette keeps the eye in the picture and the logo on a calmer sea
    m = Image.new('L', (256, 128), 0)
    ImageDraw.Draw(m).ellipse((-40, -30, 296, 158), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(22)).resize(cv.size)
    dark = Image.new('RGBA', cv.size, (20, 30, 70, 0))
    dark.putalpha(ImageChops.invert(m).point(lambda v: int(v * 0.18)))
    cv.alpha_composite(dark)
    lg = Image.open(os.path.join(T, 'ttl_logo_main.png' if lang == 'ko' else 'ttl_logo_en.png')).convert('RGBA')
    lg = lg.crop(lg.getchannel('A').getbbox())
    w = int(cv.width * (lw if lang == 'ko' else lw * 1.12))
    lg = lg.resize((w, round(lg.height * w / lg.width)), Image.LANCZOS)
    x = int(cv.width * lx - lg.width / 2)
    y = int(cv.height * ly - lg.height / 2)
    g, gp = soft(lg, 26 * S, 0.55, (255, 250, 255))
    cv.alpha_composite(g, (x - gp, y - gp))
    d, dp = soft(lg, 8 * S, 0.45, (10, 20, 60))
    cv.alpha_composite(d, (x - dp + int(3 * S), y - dp + int(8 * S)))
    cv.alpha_composite(lg, (x, y))
    out = cv.convert('RGB').resize((1024, 500), Image.LANCZOS)
    return ImageEnhance.Sharpness(out).enhance(1.15)


# ------------------------------------------------------------------ icons
def icon(full_png, size=512):
    im = Image.open(full_png).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)                         # the render is opaque already; this makes sure (Play: full square)
    return bg.resize((size, size), Image.LANCZOS)


def launcher(raw_icons, scene, out_dir):
    """the source set build_apk.py reads (--icon-dir) + the density PNGs it would make from it"""
    src = os.path.join(out_dir, 'source')
    os.makedirs(src, exist_ok=True)
    full = icon(os.path.join(raw_icons, scene + '_full.png'), 1024)
    full.convert('RGB').save(os.path.join(src, 'icon_1024.png'), optimize=True)
    fg = Image.open(os.path.join(raw_icons, scene + '_fg.png')).convert('RGBA').resize((432, 432), Image.LANCZOS)
    bgl = Image.open(os.path.join(raw_icons, scene + '_bg.png')).convert('RGB').resize((432, 432), Image.LANCZOS)
    fg.save(os.path.join(src, 'ic_launcher_foreground.png'), optimize=True)
    bgl.save(os.path.join(src, 'ic_launcher_background.png'), optimize=True)
    # the same steps as tools/apk/build_apk.py make_icons()
    comp = Image.alpha_composite(bgl.convert('RGBA'), fg)
    s = comp.size[0]
    inner = comp.crop((s // 6, s // 6, s - s // 6, s - s // 6))

    def masked(img, size, shape):
        big = size * 4
        mask = Image.new('L', (big, big), 0)
        d = ImageDraw.Draw(mask)
        if shape == 'circle':
            d.ellipse((0, 0, big - 1, big - 1), fill=255)
        else:
            mm = big // 24
            d.rounded_rectangle((mm, mm, big - 1 - mm, big - 1 - mm), radius=int(big * 0.2), fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        o = img.resize((size, size), Image.LANCZOS).convert('RGBA')
        o.putalpha(ImageChops.multiply(o.getchannel('A'), mask))
        return o

    made = []
    for dens, (legacy, layer) in DENSITIES.items():
        d = os.path.join(out_dir, 'res', 'mipmap-' + dens)
        os.makedirs(d, exist_ok=True)
        masked(full, legacy, 'square').save(os.path.join(d, 'ic_launcher.png'), optimize=True)
        masked(inner, legacy, 'circle').save(os.path.join(d, 'ic_launcher_round.png'), optimize=True)
        fg.resize((layer, layer), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_foreground.png'), optimize=True)
        bgl.resize((layer, layer), Image.LANCZOS).save(os.path.join(d, 'ic_launcher_background.png'), optimize=True)
        made += [os.path.join(d, n) for n in ('ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png',
                                              'ic_launcher_background.png')]
    # the web/PWA sizes the game's manifest also uses (assets/title/icon/icon_192/512, icon_maskable_512)
    full.resize((512, 512), Image.LANCZOS).convert('RGB').save(os.path.join(src, 'icon_512.png'), optimize=True)
    full.resize((192, 192), Image.LANCZOS).convert('RGB').save(os.path.join(src, 'icon_192.png'), optimize=True)
    mk = comp.resize((512, 512), Image.LANCZOS).convert('RGB')
    mk.save(os.path.join(src, 'icon_maskable_512.png'), optimize=True)
    return made


# ------------------------------------------------------------------ screenshots
def fit_font(path, text, size, maxw, d, minsize):
    f = ImageFont.truetype(path, size)
    while d.textlength(text, font=f) > maxw and size > minsize:
        size -= 2
        f = ImageFont.truetype(path, size)
    return f


def caption_shot(src, title, sub, lang):
    """1080 x 1920: a warm paper band with the caption on top, the screenshot as a framed photo below"""
    W, H = 1080, 1920
    band = 300
    im = Image.open(src).convert('RGB')
    cv = gradient(W, H, [(0, (255, 246, 236)), (0.18, (252, 236, 228)), (0.55, (238, 233, 248)),
                         (1, (220, 235, 250))]).convert('RGBA')
    # a few soft snow dots in the band
    dots = Image.new('RGBA', (W, band), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    import random
    rnd = random.Random(hash(title) & 0xffff)
    for _ in range(26):
        x, y, r = rnd.randint(0, W), rnd.randint(0, band), rnd.choice((3, 4, 5, 6))
        dd.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, 170))
    cv.alpha_composite(dots.filter(ImageFilter.GaussianBlur(1.2)), (0, 0))
    # the photo
    sh_h = H - band - 56
    sw = round(im.width * sh_h / im.height)
    shot = im.resize((sw, sh_h), Image.LANCZOS)
    x0 = (W - sw) // 2
    y0 = band
    rad, border = 40, 10
    shadow = Image.new('RGBA', (sw + 120, sh_h + 120), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((60, 66, 60 + sw, 66 + sh_h), radius=rad + border, fill=(70, 60, 110, 90))
    cv.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(22)), (x0 - 60, y0 - 60))
    frame = Image.new('RGBA', (sw + 2 * border, sh_h + 2 * border), (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle((0, 0, sw + 2 * border - 1, sh_h + 2 * border - 1), radius=rad + border,
                                            fill=(255, 255, 255, 255))
    cv.alpha_composite(frame, (x0 - border, y0 - border))
    mask = Image.new('L', shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh_h - 1), radius=rad, fill=255)
    cv.paste(shot, (x0, y0), mask)
    # the words
    d = ImageDraw.Draw(cv)
    if lang == 'ko':
        ft = fit_font(FONT_KO, title, 78, W - 120, d, 50)
        fs = fit_font(FONT_KO, sub, 42, W - 140, d, 30)
    else:
        ft = fit_font(FONT_EN, title, 70, W - 120, d, 44)
        fs = fit_font(FONT_EN2, sub, 40, W - 140, d, 28)
    tw = d.textlength(title, font=ft)
    sw2 = d.textlength(sub, font=fs)
    ty, sy = 78, 186
    d.text(((W - tw) / 2 + 2, ty + 4), title, font=ft, fill=(255, 255, 255))
    d.text(((W - tw) / 2, ty), title, font=ft, fill=(62, 52, 84))
    d.text(((W - sw2) / 2, sy), sub, font=fs, fill=(124, 108, 140))
    return cv.convert('RGB')


def contact(paths_or_ims, out, cols=4, w=260, labels=None, bg=(232, 234, 240)):
    ims = [p if isinstance(p, Image.Image) else Image.open(p).convert('RGB') for p in paths_or_ims]
    hs = [round(im.height * w / im.width) for im in ims]
    rows = (len(ims) + cols - 1) // cols
    hmax = max(hs)
    lab = 28 if labels else 0
    sheet = Image.new('RGB', (cols * (w + 14) + 14, rows * (hmax + 14 + lab) + 14), bg)
    d = ImageDraw.Draw(sheet)
    f = ImageFont.truetype(FONT_KO, 20)
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        x, y = 14 + c * (w + 14), 14 + r * (hmax + 14 + lab)
        sheet.paste(im.resize((w, hs[i]), Image.LANCZOS), (x, y))
        if labels:
            d.text((x, y + hs[i] + 4), labels[i], font=f, fill=(40, 40, 60))
    sheet.save(out, quality=86, optimize=True)


# ------------------------------------------------------------------ checks
def check(path, kind):
    im = Image.open(path)
    w, h = im.size
    kb = os.path.getsize(path) / 1024
    errs = []
    if kind == 'icon':
        if (w, h) != (512, 512):
            errs.append('icon must be 512 x 512')
        if im.mode != 'RGBA':
            errs.append('icon must be 32-bit PNG (RGBA)')
        elif im.getchannel('A').getextrema()[0] < 255:
            errs.append('icon has transparent pixels (Play wants a full square)')
        if kb > 1024:
            errs.append('icon over 1024 KB')
    elif kind == 'feature':
        if (w, h) != (1024, 500):
            errs.append('feature graphic must be 1024 x 500')
        if im.mode != 'RGB':
            errs.append('feature graphic must be 24-bit (no alpha)')
        if kb > 15 * 1024:
            errs.append('feature graphic over 15 MB')
    elif kind == 'shot':
        if im.mode != 'RGB':
            errs.append('screenshot must be 24-bit (no alpha)')
        if min(w, h) < 320 or max(w, h) > 3840:
            errs.append('screenshot sides must be 320..3840 px')
        if max(w, h) > 2 * min(w, h):
            errs.append('screenshot long side > 2x short side')
        if (w, h) != (1080, 1920):
            errs.append('not 1080 x 1920 (9:16, the size Play recommends for promotion)')
        if kb > 8 * 1024:
            errs.append('screenshot over 8 MB')
    return {'file': os.path.relpath(path, FV), 'size': [w, h], 'mode': im.mode, 'kb': round(kb), 'ok': not errs,
            'errors': errs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', required=True)
    ap.add_argument('--old', default=None)
    a = ap.parse_args()
    res = []
    os.makedirs(os.path.join(OUT, 'options'), exist_ok=True)
    # clean the previous generation (old 1080 x 2160 shots, the chief close-up graphics)
    for sub in ('screenshots', 'screenshots_caption', 'screenshots_caption_en', 'launcher/source', 'launcher/res'):
        shutil.rmtree(os.path.join(OUT, sub), ignore_errors=True)   # launcher/README.md is hand-written, kept
    # feature graphics
    feats = {}
    for key, name, raw, pos in FEATURES:
        for lang in ('ko', 'en'):
            fg = feature(os.path.join(a.raw, 'feature', raw), lang, **pos)
            p = os.path.join(OUT, 'options', 'feature_%s_%s%s.png' % (key, name, '' if lang == 'ko' else '_en'))
            fg.save(p, optimize=True)
            res.append(check(p, 'feature'))
            feats[(key, lang)] = p
    for lang in ('ko', 'en'):
        p = os.path.join(OUT, 'feature_graphic.png' if lang == 'ko' else 'feature_graphic_en.png')
        shutil.copyfile(feats[(FEATURE_PICK, lang)], p)
        res.append(check(p, 'feature'))
    # icons
    icons = {}
    for key, scene in ICONS:
        p = os.path.join(OUT, 'options', 'icon_%s_%s.png' % (key, scene))
        icon(os.path.join(a.raw, 'icons', scene + '_full.png')).save(p, optimize=True)
        res.append(check(p, 'icon'))
        icons[scene] = p
    p = os.path.join(OUT, 'icon_512.png')
    shutil.copyfile(icons[ICON_PICK], p)
    res.append(check(p, 'icon'))
    launcher(os.path.join(a.raw, 'icons'), ICON_PICK, os.path.join(OUT, 'launcher'))
    # screenshots
    raw_dir = os.path.join(OUT, 'screenshots')
    os.makedirs(raw_dir, exist_ok=True)
    made = {'raw': [], 'ko': [], 'en': []}
    for stem, ko, ko2, en, en2 in SHOTS:
        src = os.path.join(a.raw, 'shots', stem + '.png')
        im = Image.open(src).convert('RGB')
        dst = os.path.join(raw_dir, stem + '.jpg')
        im.save(dst, quality=90, subsampling=0, optimize=True)
        made['raw'].append(dst)
        res.append(check(dst, 'shot'))
        for lang, t1, t2 in (('ko', ko, ko2), ('en', en, en2)):
            cdir = os.path.join(OUT, 'screenshots_caption' + ('' if lang == 'ko' else '_en'))
            os.makedirs(cdir, exist_ok=True)
            pth = os.path.join(cdir, stem + '.jpg')
            caption_shot(src, t1, t2, lang).save(pth, quality=90, subsampling=0, optimize=True)
            made[lang].append(pth)
            res.append(check(pth, 'shot'))
    # contact sheets
    contact(made['raw'], os.path.join(OUT, 'preview_screenshots.jpg'), labels=[s[0] for s in SHOTS])
    contact(made['ko'], os.path.join(OUT, 'preview_screenshots_caption.jpg'))
    contact(made['en'], os.path.join(OUT, 'preview_screenshots_caption_en.jpg'))
    preview_feature(feats, a.old)
    preview_icons(icons, a.old)
    if a.old and os.path.isdir(os.path.join(a.old, 'screenshots_caption')):
        olds = sorted(os.path.join(a.old, 'screenshots_caption', f) for f in os.listdir(os.path.join(a.old, 'screenshots_caption')))
        contact(olds + made['ko'], os.path.join(OUT, 'preview_screenshots_before_after.jpg'), cols=8, w=200,
                labels=['이전 %d' % (i + 1) for i in range(len(olds))] + ['새 %d' % (i + 1) for i in range(len(made['ko']))])
    bundle(made['ko'])
    for r in res:
        print(('OK  ' if r['ok'] else 'BAD ') + r['file'], r['size'], r['mode'], str(r['kb']) + ' KB', '; '.join(r['errors']))
    json.dump(res, open(os.path.join(OUT, 'checks.json'), 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if all(r['ok'] for r in res) else 1)


def preview_feature(feats, old):
    W = 1024
    rows = []
    f = ImageFont.truetype(FONT_KO, 26)

    def labeled(im, text):
        c = Image.new('RGB', (W, im.height + 44), (246, 246, 250))
        c.paste(im.convert('RGB'), (0, 44))
        ImageDraw.Draw(c).text((10, 8), text, font=f, fill=(40, 40, 60))
        return c
    if old and os.path.exists(os.path.join(old, 'feature_graphic.png')):
        rows.append(labeled(Image.open(os.path.join(old, 'feature_graphic.png')), '이전 (촌장 클로즈업)'))
    names = {'A': 'A 해안 파노라마, 늦은 오후 (추천)', 'B': 'B 해안 파노라마, 저녁 불빛', 'C': 'C 서리마을, 늦은 오후 (로고 왼쪽)'}
    for key, _n, _r, _p in FEATURES:
        rows.append(labeled(Image.open(feats[(key, 'ko')]), names[key]))
    # thumbnail check: how A reads small (the size Play shows in lists)
    th = Image.open(feats[(FEATURE_PICK, 'ko')]).convert('RGB').resize((256, 125), Image.LANCZOS)
    tb = Image.new('RGB', (W, 170), (246, 246, 250))
    ImageDraw.Draw(tb).text((10, 8), '작게 보일 때 (256 x 125)', font=f, fill=(40, 40, 60))
    tb.paste(th, (10, 40))
    rows.append(tb)
    H = sum(r.height for r in rows) + 10 * (len(rows) + 1)
    sheet = Image.new('RGB', (W + 20, H), (226, 228, 236))
    y = 10
    for r in rows:
        sheet.paste(r, (10, y))
        y += r.height + 10
    sheet.save(os.path.join(OUT, 'preview_feature_before_after.jpg'), quality=86, optimize=True)


def preview_icons(icons, old):
    f = ImageFont.truetype(FONT_KO, 24)
    items = []
    if old and os.path.exists(os.path.join(old, 'icon_512.png')):
        items.append(('이전 (촌장)', Image.open(os.path.join(old, 'icon_512.png')).convert('RGB')))
    names = {'globe': 'A 스노볼 (추천)', 'island': 'B 떠 있는 섬, 노을', 'day': 'C 떠 있는 섬, 낮'}
    for _k, scene in ICONS:
        items.append((names[scene], Image.open(icons[scene]).convert('RGB')))
    cw = 300
    sheet = Image.new('RGB', (len(items) * (cw + 20) + 20, 520), (236, 238, 242))
    d = ImageDraw.Draw(sheet)
    for i, (lab, im) in enumerate(items):
        x = 20 + i * (cw + 20)
        d.text((x, 12), lab, font=f, fill=(40, 40, 60))
        big = im.resize((256, 256), Image.LANCZOS)
        m = Image.new('L', (256, 256), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, 255, 255), radius=52, fill=255)
        sheet.paste(big, (x, 50), m)
        for j, sz in enumerate((96, 48)):
            t = im.resize((sz, sz), Image.LANCZOS)
            mm = Image.new('L', (sz, sz), 0)
            ImageDraw.Draw(mm).rounded_rectangle((0, 0, sz - 1, sz - 1), radius=int(sz * 0.2), fill=255)
            sheet.paste(t, (x + j * 130, 330 + (96 - sz) // 2), mm)
        d.text((x, 440), '96 px      48 px', font=f, fill=(90, 90, 110))
    sheet.save(os.path.join(OUT, 'preview_icon_before_after.jpg'), quality=88, optimize=True)


def bundle(shots_ko):
    """the files to upload, numbered in upload order, + one zip with plain ASCII names (Windows-safe)"""
    shutil.rmtree(BUNDLE, ignore_errors=True)
    os.makedirs(BUNDLE)
    files = [(os.path.join(OUT, 'icon_512.png'), '1_app_icon_512.png'),
             (os.path.join(OUT, 'feature_graphic.png'), '2_feature_graphic_1024x500.png')]
    for i, p in enumerate(shots_ko, 1):
        files.append((p, '3_phone_screenshot_%02d.jpg' % i))
    for src, name in files:
        shutil.copyfile(src, os.path.join(BUNDLE, name))
    readme = ('행복한 눈꽃마을 이야기 - Play 스토어에 올릴 그림\n\n'
              '1_app_icon_512.png            -> 앱 아이콘 (512 x 512)\n'
              '2_feature_graphic_1024x500.png -> 그래픽 이미지 (1024 x 500)\n'
              '3_phone_screenshot_01~08.jpg  -> 휴대전화 스크린샷 (1080 x 1920), 번호 순서대로 8장\n\n'
              '태블릿 스크린샷, 동영상은 비워 두세요.\n')
    open(os.path.join(BUNDLE, 'READ_ME.txt'), 'w', encoding='utf-8').write(readme)
    zp = os.path.join(BUNDLE, 'snowbloom_store_upload.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for _src, name in files:
            z.write(os.path.join(BUNDLE, name), name)
        z.write(os.path.join(BUNDLE, 'READ_ME.txt'), 'READ_ME.txt')


if __name__ == '__main__':
    main()
