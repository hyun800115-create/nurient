#!/usr/bin/env python3
"""Google Play listing graphics for 행복한 눈꽃마을 이야기, built from the game's own title art.

    python3 frost-village/docs/store/tools/make_graphics.py [--shots DIR]

Writes into frost-village/docs/store/assets/:
  icon_512.png               512 x 512, 32-bit PNG (RGBA, opaque), from assets/title/icon/icon_1024.png
  feature_graphic.png        1024 x 500, 24-bit PNG (no alpha), title backdrop + logo + the chief and 콩이
  feature_graphic_en.png     the same with the English logo (for an English store listing)
  screenshots/NN_*.png       with --shots: the raw game screenshots (1080 x 2160) copied in listing order
  screenshots_caption/NN_*.png   the same pictures with a short Korean caption band (1080 x 2160)
  screenshots_caption_en/...     the same with English captions
  preview_*.png              contact sheets to check everything by eye (not for upload)
and checks every file against Play's limits (sizes, ratio, bit depth, file size).
"""
import argparse
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FV = os.path.abspath(os.path.join(HERE, '..', '..', '..'))          # frost-village/
T = os.path.join(FV, 'assets', 'title')
OUT = os.path.join(FV, 'docs', 'store', 'assets')
FONT_KO = os.path.join(FV, 'tools', 'fonts', 'Jua-Regular.ttf')
FONT_KO_BOLD = os.path.join(FV, 'tools', 'fonts', 'Pretendard-ExtraBold.ttf')
FONT_EN = os.path.join(FV, 'tools', 'fonts', 'Fredoka-Bold.ttf')
TINTS = json.load(open(os.path.join(T, 'manifest.json')))['meta']['tints']

# listing order: file stem from store_shots.mjs -> (Korean caption, English caption)
SHOTS = [
    ('01_village', '눈 덮인 작은 마을의 촌장이 되어요', 'Be the chief of a little snowy village'),
    ('03_restaurant', '손님으로 북적이는 큰 식당', 'A busy restaurant full of guests'),
    ('02_train', '기차가 오면 이웃 마을이 열려요', 'The train brings the neighbour town'),
    ('04_ceremony', '마을회관 앞에서 다 함께 축하해요', 'Celebrate together at the town hall'),
    ('05_office', '촌장 사무실과 든든한 직원들', 'Your office and a friendly staff'),
    ('07_sea', '살아 움직이는 바다와 고깃배', 'A living sea with fishing boats'),
    ('06_night', '밤이 오면 불빛이 반짝이는 마을', 'Warm lights when night falls'),
    ('08_observe', '관망 모드: 촌장님이 알아서 일해요', 'Watch mode: the chief works on his own'),
]


def rgba(name):
    return Image.open(os.path.join(T, name)).convert('RGBA')


def tint(im, hexcol):
    """multiply the RGB of an RGBA picture by a colour (the title's dusk / night tints)"""
    if not hexcol:
        return im
    c = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    rgb = ImageChops.multiply(im.convert('RGB'), Image.new('RGB', im.size, c))
    out = rgb.convert('RGBA')
    out.putalpha(im.getchannel('A'))
    return out


def fit_w(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def fit_h(im, h):
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def tile_w(im, w):
    """repeat a horizontally tileable strip to width w"""
    out = Image.new('RGBA', (w, im.height), (0, 0, 0, 0))
    x = 0
    while x < w:
        out.alpha_composite(im, (x, 0))
        x += im.width
    return out


def add(canvas, im, x, y, mode='normal', alpha=1.0):
    if alpha < 1:
        a = im.getchannel('A').point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    if mode == 'screen':
        layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        layer.alpha_composite(im, (int(x), int(y)))
        prem = Image.composite(layer.convert('RGB'), Image.new('RGB', canvas.size, 0), layer.getchannel('A'))
        scr = ImageChops.screen(canvas.convert('RGB'), prem).convert('RGBA')
        canvas.paste(scr, (0, 0))
        return
    canvas.alpha_composite(im, (int(x), int(y)))


def soft_shadow(im, blur, opacity, color=(20, 28, 70)):
    """blurred silhouette, padded by 3 x blur on every side (draw it at x - pad, y - pad)"""
    pad = int(blur * 3)
    a = Image.new('L', (im.width + 2 * pad, im.height + 2 * pad), 0)
    a.paste(im.getchannel('A'), (pad, pad))
    a = a.filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * opacity))
    sh = Image.new('RGBA', a.size, color + (0,))
    sh.putalpha(a)
    return sh, pad


def gradient(w, h, stops):
    """vertical gradient: stops = [(t, (r, g, b)), ...] with t in 0..1"""
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


# ------------------------------------------------------------------ icon
def make_icon():
    src = Image.open(os.path.join(T, 'icon', 'icon_1024.png')).convert('RGBA')
    ic = src.resize((512, 512), Image.LANCZOS)
    p = os.path.join(OUT, 'icon_512.png')
    ic.save(p, optimize=True)
    return p


# ------------------------------------------------------------------ feature graphic
def make_feature(lang='ko'):
    S = 2                                   # draw at 2x, scale down at the end
    W, H = 1024 * S, 500 * S
    horizon = int(H * 0.72)                 # where the forest meets the snow
    cv = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    # sky: the title's dusk gradient, its warm band just above the mountains
    sky = Image.open(os.path.join(T, 'ttl_sky_dusk.png')).convert('RGB')
    sky = sky.crop((0, 0, sky.width, int(sky.height * 0.80))).resize((W, horizon), Image.LANCZOS)
    cv.paste(sky.convert('RGBA'), (0, 0))
    # stars, faint, upper sky only (they fade toward the warm band)
    st = rgba('ttl_stars.png')
    st = tile_w(fit_w(st, int(W * 0.55)), W).crop((0, 0, W, int(H * 0.5)))
    fade = gradient(1, st.height, [(0, (255, 255, 255)), (1, (0, 0, 0))]).resize(st.size).convert('L')
    st.putalpha(ImageChops.multiply(st.getchannel('A'), fade).point(lambda v: int(v * 0.55)))
    add(cv, st, 0, 0)
    # aurora (screen blend), moon
    au = rgba('ttl_aurora.png')
    au = fit_w(au, int(W * 1.1))
    add(cv, au, -int(W * 0.05), -int(H * 0.06), mode='screen', alpha=0.75)
    moon = fit_w(rgba('ttl_moon.png'), int(110 * S))
    add(cv, moon, int(W * 0.865), int(H * 0.07), alpha=0.92)
    # clouds, far mountains, mid mountains, forest (dusk tints, anchored on the horizon)
    cl = tint(rgba('ttl_clouds.png'), TINTS['dusk'].get('ttl_clouds'))
    cl = tile_w(fit_w(cl, int(W * 0.8)), W)
    add(cv, cl, 0, int(H * 0.20), alpha=0.8)
    mf = tint(rgba('ttl_mtn_far.png'), TINTS['dusk'].get('ttl_mtn_far'))
    mf = tile_w(fit_w(mf, int(W * 0.75)), W)
    add(cv, mf, -int(W * 0.12), horizon - mf.height - int(H * 0.02))
    mm = tint(rgba('ttl_mtn_mid.png'), TINTS['dusk'].get('ttl_mtn_mid'))
    mm = tile_w(fit_w(mm, int(W * 0.62)), W)
    add(cv, mm, -int(W * 0.03), horizon - mm.height + int(H * 0.01))
    fo = tint(rgba('ttl_forest.png'), TINTS['dusk'].get('ttl_forest'))
    fo = tile_w(fit_w(fo, int(W * 0.42)), W)
    fo = fo.crop((0, 0, W, fo.getchannel('A').getbbox()[3]))
    add(cv, fo, 0, horizon - fo.height + int(10 * S))
    # snow field in front, a soft bank rising under the characters on the right
    snow = gradient(W, H - horizon + 4, [(0, (238, 230, 242)), (0.4, (247, 243, 249)), (1, (222, 232, 247))]).convert('RGBA')
    cv.alpha_composite(snow, (0, horizon - 4))
    bank = Image.new('RGBA', (W, H), (252, 250, 253, 0))      # (transparent white: no dark fringe when blurred)
    ImageDraw.Draw(bank).ellipse((int(W * 0.44), int(H * 0.80), int(W * 1.12), int(H * 1.35)), fill=(252, 250, 253, 255))
    bank = bank.filter(ImageFilter.GaussianBlur(10 * S))
    cv.alpha_composite(bank)
    # the chief and 콩이 (the app icon's adaptive foreground: the same characters as the icon), on the snow bank
    ch = rgba(os.path.join('icon', 'ic_launcher_foreground.png'))
    ch = ch.crop(ch.getchannel('A').getbbox())
    ch = fit_h(ch, int(H * 0.90))
    cx = int(W * 0.755) - ch.width // 2
    base = H - int(H * 0.04)
    sh = Image.new('RGBA', (int(ch.width * 1.3), int(60 * S)), (70, 80, 140, 0))
    ImageDraw.Draw(sh).ellipse((int(20 * S), int(14 * S), sh.width - int(20 * S), sh.height - int(14 * S)), fill=(70, 80, 140, 80))
    pad = int(30 * S)
    shp = Image.new('RGBA', (sh.width + 2 * pad, sh.height + 2 * pad), (70, 80, 140, 0))
    shp.alpha_composite(sh, (pad, pad))
    shp = shp.filter(ImageFilter.GaussianBlur(9 * S))
    cv.alpha_composite(shp, (cx + ch.width // 2 - shp.width // 2, base - shp.height // 2 - int(4 * S)))
    cv.alpha_composite(ch, (cx, base - ch.height))
    # the logo, left, with a soft glow so it reads on the busy sky
    lg = rgba('ttl_logo_main.png' if lang == 'ko' else 'ttl_logo_en.png')
    lg = lg.crop(lg.getchannel('A').getbbox())
    lg = fit_w(lg, int(W * (0.50 if lang == 'ko' else 0.53)))
    if lg.height > int(H * 0.82):
        lg = fit_h(lg, int(H * 0.82))
    lx = int(W * 0.29) - lg.width // 2
    ly = int(H * (0.48 if lang == 'ko' else 0.46)) - lg.height // 2
    glow, gp = soft_shadow(lg, 22 * S, 0.50, (255, 244, 250))
    add(cv, glow, lx - gp, ly - gp)
    drop, dp = soft_shadow(lg, 7 * S, 0.40)
    add(cv, drop, lx - dp + 4 * S, ly - dp + 9 * S)
    cv.alpha_composite(lg, (lx, ly))
    out = cv.convert('RGB').resize((1024, 500), Image.LANCZOS)
    p = os.path.join(OUT, 'feature_graphic.png' if lang == 'ko' else 'feature_graphic_en.png')
    out.save(p, optimize=True)
    return p


# ------------------------------------------------------------------ screenshots
def font(path, size):
    return ImageFont.truetype(path, size)


def caption_shot(src, text, lang):
    """1080 x 2160: a caption band on top, the screenshot scaled into the rest on the title's night-blue"""
    W, H = 1080, 2160
    band = 300
    im = Image.open(src).convert('RGB')
    cv = Image.new('RGB', (W, H), (15, 26, 44))
    bg = gradient(W, H, [(0, (40, 52, 120)), (0.14, (64, 73, 149)), (0.15, (24, 36, 78)), (1, (15, 26, 44))])
    cv.paste(bg, (0, 0))
    # the screenshot, rounded corners, a soft shadow
    sh_h = H - band - 40
    sw = round(im.width * sh_h / im.height)
    shot = im.resize((sw, sh_h), Image.LANCZOS)
    mask = Image.new('L', shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw - 1, sh_h - 1), radius=44, fill=255)
    x0 = (W - sw) // 2
    y0 = band
    shadow = Image.new('RGBA', (sw + 80, sh_h + 80), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((40, 40, 40 + sw, 40 + sh_h), radius=48, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    cvr = cv.convert('RGBA')
    cvr.alpha_composite(shadow, (x0 - 40, y0 - 30))
    cv = cvr.convert('RGB')
    cv.paste(shot, (x0, y0), mask)
    # caption: two lines at most, centred in the band
    d = ImageDraw.Draw(cv)
    fpath = FONT_KO if lang == 'ko' else FONT_EN
    size = 76 if lang == 'ko' else 64
    f = font(fpath, size)
    lines = [text]
    while d.textlength(lines[-1], font=f) > W - 120 and size > 44:
        size -= 4
        f = font(fpath, size)
    if d.textlength(text, font=f) > W - 120:
        words = text.split(' ')
        best = None
        for i in range(1, len(words)):
            a, b = ' '.join(words[:i]), ' '.join(words[i:])
            m = max(d.textlength(a, font=f), d.textlength(b, font=f))
            if best is None or m < best[0]:
                best = (m, [a, b])
        lines = best[1]
    lh = size * 1.25
    ty = (band - lh * len(lines)) / 2 + 8
    for i, ln in enumerate(lines):
        tw = d.textlength(ln, font=f)
        x = (W - tw) / 2
        y = ty + i * lh
        d.text((x + 3, y + 5), ln, font=f, fill=(10, 16, 40))
        d.text((x, y), ln, font=f, fill=(255, 255, 255), stroke_width=0)
    return cv


def make_shots(shots_dir, lang_list=('ko', 'en')):
    made = []
    raw_dir = os.path.join(OUT, 'screenshots')
    os.makedirs(raw_dir, exist_ok=True)
    for n, (stem, ko, en) in enumerate(SHOTS, 1):
        src = os.path.join(shots_dir, stem + '_ko.png')
        if not os.path.exists(src):
            print('missing', src)
            continue
        im = Image.open(src).convert('RGB')
        dst = os.path.join(raw_dir, '%02d_%s.png' % (n, stem[3:]))
        im.save(dst, optimize=True)
        made.append(dst)
        for lang in lang_list:
            cdir = os.path.join(OUT, 'screenshots_caption' + ('' if lang == 'ko' else '_en'))
            os.makedirs(cdir, exist_ok=True)
            c = caption_shot(src, ko if lang == 'ko' else en, lang)
            p = os.path.join(cdir, '%02d_%s.png' % (n, stem[3:]))
            c.save(p, optimize=True)
            made.append(p)
    return made


def contact(paths, out, cols=4, w=270):
    ims = [Image.open(p).convert('RGB') for p in paths]
    hs = [round(im.height * w / im.width) for im in ims]
    rows = (len(ims) + cols - 1) // cols
    hmax = max(hs)
    sheet = Image.new('RGB', (cols * (w + 12) + 12, rows * (hmax + 12) + 12), (230, 232, 238))
    for i, im in enumerate(ims):
        r, c = divmod(i, cols)
        sheet.paste(im.resize((w, hs[i]), Image.LANCZOS), (12 + c * (w + 12), 12 + r * (hmax + 12)))
    sheet.save(out, optimize=True)


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
        if kb > 8 * 1024:
            errs.append('screenshot over 8 MB')
    return {'file': os.path.relpath(path, FV), 'size': [w, h], 'mode': im.mode, 'kb': round(kb), 'ok': not errs, 'errors': errs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots', help='folder with store_shots.mjs output (NN_name_ko.png)')
    ap.add_argument('--only', default='', help='icon,feature,shots')
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    only = set(a.only.split(',')) if a.only else {'icon', 'feature', 'shots'}
    res = []
    if 'icon' in only:
        res.append(check(make_icon(), 'icon'))
    if 'feature' in only:
        for lang in ('ko', 'en'):
            res.append(check(make_feature(lang), 'feature'))
    if 'shots' in only and a.shots:
        shots = make_shots(a.shots)
        for p in shots:
            res.append(check(p, 'shot'))
        raw = [p for p in shots if os.sep + 'screenshots' + os.sep in p]
        cap = [p for p in shots if os.sep + 'screenshots_caption' + os.sep in p]
        if raw:
            contact(raw, os.path.join(OUT, 'preview_screenshots.png'))
        if cap:
            contact(cap, os.path.join(OUT, 'preview_screenshots_caption.png'))
    for r in res:
        print(('OK  ' if r['ok'] else 'BAD ') + r['file'], r['size'], r['mode'], str(r['kb']) + ' KB', '; '.join(r['errors']))
    json.dump(res, open(os.path.join(OUT, 'checks.json'), 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if all(r['ok'] for r in res) else 1)


if __name__ == '__main__':
    main()
