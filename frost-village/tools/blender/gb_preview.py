"""
gb_preview.py - labelled previews of the shipped 금방 set (reads assets/geumbang exactly as the game would: atlas frames
with their trimmed offsets, anchors, points, patches).  No Blender needed.

    python3 tools/blender/gb_preview.py            -> docs/previews/gb_*.png / *.gif
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
A = os.path.join(GAME, 'assets')
PREV = os.path.join(GAME, 'docs', 'previews')
FONT = os.path.join(GAME, 'tools', 'fonts', 'Jua-Regular.ttf')
BG = (226, 233, 242, 255)
INK = (59, 63, 82, 255)
_atl = {}


def font(sz):
    try:
        return ImageFont.truetype(FONT, sz)
    except Exception:
        return ImageFont.load_default()


def frame(atlas_json, name):
    """Full source-size frame (trim offsets restored)."""
    if atlas_json not in _atl:
        j = json.load(open(atlas_json))
        _atl[atlas_json] = (j, Image.open(os.path.join(os.path.dirname(atlas_json), j['meta']['image'])).convert('RGBA'))
    j, img = _atl[atlas_json]
    f = j['frames'][name]
    fr, ss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
    out = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
    out.paste(img.crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), (ss['x'], ss['y']))
    return out


M = json.load(open(os.path.join(A, 'geumbang', 'manifest.json'), encoding='utf-8'))
LG = json.load(open(os.path.join(A, 'logistics', 'manifest.json'), encoding='utf-8'))
VH = json.load(open(os.path.join(A, 'vehicles', 'manifest.json'), encoding='utf-8'))
GBV = os.path.join(A, 'geumbang', 'gb_van_0.json')
GBB = os.path.join(A, 'geumbang', 'gb_bld_0.json')


def lgx_atlas(name):
    for a in LG['atlases']:
        j = json.load(open(os.path.join(A, a['json'])))
        if name in j['frames']:
            return os.path.join(A, a['json'])
    raise KeyError(name)


def veh_atlas(key):
    return os.path.join(A, 'vehicles', VH['characters'][key]['atlas'] + '.json')


def put(canvas, im, x, y, anchor, flip=False, scale=1.0):
    """Draw im with its anchor (fraction) at (x, y)."""
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        anchor = (1.0 - anchor[0], anchor[1])
    if scale != 1.0:
        im = im.resize((max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))), Image.LANCZOS)
    canvas.alpha_composite(im, (int(round(x - anchor[0] * im.width)), int(round(y - anchor[1] * im.height))))


def shadow(canvas, x, y, sh, flip=False, scale=1.0, alpha=70):
    w, h, ang = sh
    w, h = w * scale, h * 1.15 * scale
    e = Image.new('RGBA', (int(w * 1.6) + 4, int(w * 1.6) + 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(e)
    cx, cy = e.width / 2, e.height / 2
    d.ellipse([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], fill=(38, 46, 82, alpha))
    from PIL import ImageFilter
    e = e.filter(ImageFilter.GaussianBlur(3 * scale + 1)).rotate(ang if flip else -ang, resample=Image.BICUBIC)
    canvas.alpha_composite(e, (int(x - e.width / 2), int(y + 2 - e.height / 2)))


def tile(path, W, H):
    t = Image.open(path).convert('RGBA')
    out = Image.new('RGBA', (W, H))
    for yy in range(0, H, t.height):
        for xx in range(0, W, t.width):
            out.paste(t, (xx, yy))
    return out


def ground(W, H, kind='snow'):
    p = {'snow': os.path.join(A, 'ground', 'ground_snow.png'), 'cobble': os.path.join(A, 'roads', 'road_cobble_wide.png'),
         'dirt': os.path.join(A, 'roads', 'road_dirt.png')}[kind]
    return tile(p, W, H)


def label(d, xy, text, sz=18, fill=INK):
    d.text(xy, text, font=font(sz), fill=fill)


# =================================================================================================== van

VAN = M['characters']['gb_van']
TURN = M['characters']['gb_van_turn']


def van_frame(anim, d, i):
    """(image, anchor, flip) of gb_van for any of the 8 headings (anim ignored for turn dirs)."""
    if d in ('S', 'E', 'N', 'W'):
        rd = 'E' if d == 'W' else d
        return frame(GBV, 'turn_%s_0' % rd), TURN['anchor'], d == 'W', rd
    rd = {'SW': 'SE', 'NW': 'NE'}.get(d, d)
    return frame(GBV, '%s_%s_%d' % (anim, rd, i)), VAN['anchor'], d in ('SW', 'NW'), rd


def draw_van(canvas, x, y, d, anim='idle', i=0, lang='ko', lit=0, scale=1.0, sign=True, sh=True):
    im, an, flip, rd = van_frame(anim, d, i)
    ent = TURN if d in ('S', 'E', 'N', 'W') else VAN
    if sh:
        shadow(canvas, x, y, ent['shadow'][rd], flip, scale)
    put(canvas, im, x, y, an, flip, scale)
    if sign:
        p = ent['roofSignPoint'][rd]
        bob = 0
        if d not in ('S', 'E', 'N', 'W') and anim in VAN['anims'] and 'bobPx' in VAN['anims'][anim]:
            bob = VAN['anims'][anim]['bobPx'][i]
        px = -p[0] if flip else p[0]
        put(canvas, frame(GBV, 'gb_roofsign_%s_%d' % (lang, lit)), x + px * scale, y + (p[1] + bob) * scale, (0.5, 1.0),
            False, scale)


def van_patch(canvas, x, y, anim, d, i, scale=1.0):
    a = VAN['anims'][anim]
    rd = {'SW': 'SE', 'NW': 'NE'}.get(d, d)
    flip = d in ('SW', 'NW')
    put(canvas, frame(GBV, '%s_%s_%d' % (anim, rd, i)), x, y, a['anchor'], flip, scale)


def prev_van():
    dirs = ['SE', 'E', 'NE', 'N', 'NW', 'W', 'SW', 'S']
    W, H = 4 * 330, 2 * 300 + 70
    c = ground(W, H, 'snow')
    c.paste(ground(W, 300, 'cobble'), (0, 370))
    d = ImageDraw.Draw(c)
    for k, dd in enumerate(dirs):
        cx = 165 + (k % 4) * 330
        cy = 230 + (k // 4) * 330
        draw_van(c, cx, cy, dd, 'idle', 0, 'ko' if k % 2 == 0 else 'en')
        tag = dd + (' (turn, mirror of E)' if dd == 'W' else ' (turn frame)' if dd in ('S', 'E', 'N') else
                    ' (mirror of %s)' % {'SW': 'SE', 'NW': 'NE'}[dd] if dd in ('SW', 'NW') else '')
        label(d, (cx - 150, cy + 48), tag, 18, (255, 255, 255, 255) if k >= 4 else INK)
    label(d, (14, 8), 'gb_van - all 8 headings with the camera-facing roof sign (ko / en alternating); no letters on '
                      'the body', 20)
    c.convert('RGB').save(os.path.join(PREV, 'gb_van_8dirs.png'))


def prev_van_compare():
    """Red van vs gold van on a 390 x 844 CSS phone at DPR 3 (1170 device px wide; the game canvas is 720 logical px
    wide, so 1 game px = zoom x 1.625 device px): zoom 1.0 (top) and zoom 0.6 (bottom)."""
    red = LG['characters']['delivery_van_red']
    ra = os.path.join(A, 'logistics', red['atlas'] + '.json')
    W = 1170
    c = ground(W, 900, 'snow')
    c.paste(ground(W, 380, 'cobble'), (0, 520))
    d = ImageDraw.Draw(c)
    k1 = 1.0 * 1170 / 720
    shadow(c, 290, 400, red['shadow']['SE'], False, k1)
    put(c, frame(ra, 'move_SE_0'), 290, 400, red['anchor'], False, k1)
    draw_van(c, 830, 400, 'SE', 'move', 0, 'ko', 0, k1)
    k6 = 0.6 * 1170 / 720
    for x, dd, lang, kind in ((150, 'SE', 'ko', 'red'), (430, 'SE', 'ko', 'gb'), (710, 'NE', 'ko', 'gb'),
                              (990, 'SW', 'en', 'gb')):
        if kind == 'red':
            shadow(c, x, 800, red['shadow']['SE'], False, k6)
            put(c, frame(ra, 'move_SE_0'), x, 800, red['anchor'], False, k6)
        else:
            draw_van(c, x, 800, dd, 'move', 0, lang, 0, k6)
    label(d, (14, 8), 'phone 390 x 844 CSS @ DPR 3 (this image = 1170 device px = the phone width)', 22)
    label(d, (14, 40), 'zoom 1.0: delivery_van_red (reference) | gb_van SE', 20)
    label(d, (14, 530), 'zoom 0.6: red | gb_van SE | NE | SW (mirror, en sign).  mark = %.1f CSS px, roof sign = %.1f CSS px'
          % (45.3 * 0.6 * 390 / 720, frame(GBV, 'gb_roofsign_ko_0').getbbox()[2] * 0 +
             (lambda b: (b[2] - b[0]))(frame(GBV, 'gb_roofsign_ko_0').getbbox()) * 0.6 * 390 / 720), 20,
          (255, 255, 255, 255))
    c.convert('RGB').save(os.path.join(PREV, 'gb_van_compare.png'))


def gif(frames, path, ms):
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=ms, loop=0, disposal=2, optimize=False)


def prev_van_gifs():
    # move: 4 dirs
    out = []
    for i in range(4):
        c = Image.new('RGBA', (1120, 300), BG)
        for k, dd in enumerate(('SE', 'NE', 'NW', 'SW')):
            draw_van(c, 140 + k * 280, 230, dd, 'move', i)
        out.append(c.convert('RGB'))
    gif(out, os.path.join(PREV, 'gb_van_move.gif'), 100)
    # door / unload patches over idle_0 (SE + NE + mirrored SW + NW), held 0.6 s on the last frame
    for anim, fps in (('door', 10), ('unload', 8)):
        n = VAN['anims'][anim]['frames']
        seq = list(range(n)) + [n - 1] * 5 + list(range(n - 1, -1, -1))
        out = []
        for i in seq:
            c = Image.new('RGBA', (1240, 330), BG)
            d = ImageDraw.Draw(c)
            for k, dd in enumerate(('SE', 'NE', 'SW', 'NW')):
                x = 160 + k * 305
                draw_van(c, x, 250, dd, 'idle', 0, sign=False)
                van_patch(c, x, 250, anim, dd, i)
                draw_van(c, x, 250, dd, 'idle', 0, sh=False) if False else None
                p = VAN['roofSignPoint']['SE' if dd in ('SE', 'SW') else 'NE']
                px = -p[0] if dd in ('SW', 'NW') else p[0]
                put(c, frame(GBV, 'gb_roofsign_ko_0'), x + px, 250 + p[1], (0.5, 1.0))
                if anim == 'unload' and i == n - 1:
                    for q in VAN['parcelPoints']['SE' if dd in ('SE', 'SW') else 'NE']:
                        qx = -q[0] if dd in ('SW', 'NW') else q[0]
                        d.ellipse([x + qx - 3, 250 + q[1] - 3, x + qx + 3, 250 + q[1] + 3], outline=(217, 72, 59))
            label(d, (10, 6), 'gb_van %s (%d f, %d fps, patch over idle_<dir>_0)  frame %d' % (anim, n, fps, i), 18)
            out.append(c.convert('RGB'))
        gif(out, os.path.join(PREV, 'gb_van_%s.gif' % anim), int(1000 / fps))


# =================================================================================================== hub

def centre(lang='ko', plate='gb', banner=True, f=0, van=True, props=True, extra=True):
    C = LG['sprites']['logistics_center']
    W, H = 1500, 980
    c = ground(W, H, 'snow')
    ox, oy = 600, 560
    an = C['anchor']
    for layer in ('apron', 'shell'):
        k = C['layers'][layer]
        put(c, frame(lgx_atlas(k), k), ox, oy, an)
    if plate:
        k = '%s_nameplate_%s' % (plate, lang)
        put(c, frame(GBB, k), ox, oy, an)
    else:
        k = 'logistics_center_nameplate_' + lang
        put(c, frame(lgx_atlas(k), k), ox, oy, an)
    for dk in ('dock1', 'dock2'):
        k = C['patches'][dk]
        put(c, frame(lgx_atlas(k + '_0'), k + '_0'), ox, oy, an)
    k = C['layers']['props']
    put(c, frame(lgx_atlas(k), k), ox, oy, an)
    if banner:
        put(c, frame(GBB, 'gb_banner_%s_%d' % (lang, f)), ox, oy, an)
    items = []
    for op in C['outdoorProps']:
        s = LG['sprites'][op['sprite']]
        items.append((oy + op['point'][1], 'lgx', op['sprite'], ox + op['point'][0], oy + op['point'][1], s['anchor']))
    if van:
        p = C['dockVehiclePoints']['delivery_van'][0]
        items.append((oy + p[1], 'van', None, ox + p[0], oy + p[1], None))
    if props:
        S = M['sprites']
        for key, (dx, dy) in (('gb_sign', (-380, 170)), ('gb_flag', (420, 300)), ('gb_locker_b', (560, 160))):
            items.append((oy + dy, 'gb', key + ('_0' if key != 'gb_flag' else '_wave_%d' % (f % 6)), ox + dx, oy + dy,
                          S[key]['anchor']))
    for _, kind, k, x, y, a in sorted(items, key=lambda t: t[0]):
        if kind == 'lgx':
            put(c, frame(lgx_atlas(k), k), x, y, a)
        elif kind == 'gb':
            put(c, frame(GBB, k), x, y, a)
        else:
            draw_van(c, x, y, 'SE', 'idle', 0, lang)
    return c


def prev_hub():
    tiles = [('gb', 'ko', True, '금방 물류센터 (ko): nameplate + banner + van at dock 1 + sign / flag / locker'),
             ('gb', 'en', True, 'GEUMBANG CENTRE (en): mark-only banner'),
             ('seori', 'ko', False, '서리 물류창고 (before 금방 opens)'),
             ('seori', 'en', False, 'Frost Depot (en)')]
    ims = []
    for plate, lang, ban, cap in tiles:
        c = centre(lang, plate, ban, 0, van=ban, props=ban)
        c = c.crop((80, 120, 1440, 940))
        d = ImageDraw.Draw(c)
        label(d, (14, 10), cap, 26)
        ims.append(c)
    W, H = ims[0].width, ims[0].height
    sheet = Image.new('RGBA', (W * 2, H * 2))
    for k, im in enumerate(ims):
        sheet.paste(im, ((k % 2) * W, (k // 2) * H))
    sheet = sheet.resize((sheet.width // 2, sheet.height // 2), Image.LANCZOS)
    sheet.convert('RGB').save(os.path.join(PREV, 'gb_hub.png'))
    # banner sway gif (crop on the banner + nameplate)
    out = []
    for f in range(4):
        c = centre('ko', 'gb', True, f, van=True, props=True)
        out.append(c.crop((260, 230, 1060, 780)).convert('RGB'))
    gif(out, os.path.join(PREV, 'gb_banner.gif'), 200)


# =================================================================================================== props, items, sled

def prev_props():
    S = M['sprites']
    out = []
    for f in range(6):
        c = Image.new('RGBA', (1180, 400), BG)
        d = ImageDraw.Draw(c)
        x = 90
        put(c, frame(GBB, 'gb_sign_0'), x, 300, S['gb_sign']['anchor'])
        put(c, frame(GBB, 'gb_flag_wave_%d' % f), x + 150, 300, S['gb_flag']['anchor'])
        for k, key in enumerate(('gb_locker_a', 'gb_locker_b')):
            lx = x + 380 + k * 260
            put(c, frame(GBB, key + '_0'), lx, 300, S[key]['anchor'])
            op = S[key]['anims']['open']['frames']
            i = min(len(op) - 1, f)
            put(c, frame(GBB, op[i]), lx, 300, S[key]['anchor'])
            for q in S[key]['slotPoints']:
                pass
            sp = S[key]['standPoint']
            d.ellipse([lx + sp[0] - 4, 300 + sp[1] - 2, lx + sp[0] + 4, 300 + sp[1] + 2], outline=(43, 79, 126))
        # night: lit patches
        put(c, frame(GBB, 'gb_sign_0'), x + 930, 300, S['gb_sign']['anchor'])
        put(c, frame(GBB, 'gb_sign_1'), x + 930, 300, S['gb_sign']['anchor'])
        label(d, (10, 6), 'gb_sign | gb_flag (wave 6 f) | gb_locker_a (SW) / _b (SE) open patches | gb_sign lit patch', 18)
        out.append(c.convert('RGB'))
    gif(out, os.path.join(PREV, 'gb_props.gif'), 125)
    out[0].save(os.path.join(PREV, 'gb_props.png'))


def prev_items():
    S = M['sprites']
    keys = ['gb_parcel_s', 'gb_parcel_m', 'gb_parcel_l', 'gb_parcel_doorstep_0', 'gb_parcel_doorstep_1',
            'gb_parcel_open', 'gb_parcel_cat_0', 'gb_parcel_cat_1']
    c = Image.new('RGBA', (len(keys) * 160 + 20, 230), BG)
    d = ImageDraw.Draw(c)
    for k, n in enumerate(keys):
        im = frame(GBB, n).resize((144, 144), Image.LANCZOS)
        c.alpha_composite(im, (20 + k * 160, 20))
        label(d, (20 + k * 160, 180), n.replace('gb_parcel_', ''), 18)
    # 1x row + next to the existing cardboard boxes
    for k, n in enumerate(['cardboard_box_s', 'cardboard_box_m', 'cardboard_box_l']):
        c.alpha_composite(frame(lgx_atlas(n), n), (20 + k * 50, 152))
    label(d, (10, 205), 'gb_parcel_* at 2x (top) | cardboard_box_s/m/l at 1x for scale (bottom left)', 16)
    c.convert('RGB').save(os.path.join(PREV, 'gb_items.png'))


def prev_sled():
    ds = VH['characters']['dog_sled']
    P = M['sprites']['gb_pennant']
    sa = veh_atlas('dog_sled')
    out = []
    for i in range(8):
        c = ground(1000, 260, 'snow')
        for k, dd in enumerate(('SE', 'NE', 'SW', 'NW')):
            x, y = 130 + k * 240, 190
            rd = {'SW': 'SE', 'NW': 'NE'}.get(dd, dd)
            flip = dd in ('SW', 'NW')
            shadow(c, x, y, ds['shadow'][rd], flip)
            put(c, frame(sa, 'move_%s_%d' % (rd, i)), x, y, ds['anchor'], flip)
            put(c, frame(sa, 'over_move_%s_%d' % (rd, i)) if 'over_move_%s_%d' % (rd, i) in
                json.load(open(sa))['frames'] else Image.new('RGBA', (1, 1)), x, y, ds['anchor'], flip)
            q = P['sledPennant'][rd]['move'][i]
            qx = -q[0] if flip else q[0]
            put(c, frame(GBB, 'gb_pennant_%s_%d' % (rd, i % 4)), x + qx, y + q[1], P['anchor'], flip)
        out.append(c.convert('RGB'))
    gif(out, os.path.join(PREV, 'gb_sled.gif'), 100)
    out[0].save(os.path.join(PREV, 'gb_sled.png'))


def prev_night():
    """Night: the game's MULTIPLY tint (DayClock: 0x5a6aa8 at darkness 0.45) + ADD glows at the lit points."""
    W, H = 1180, 420
    c = ground(W, H, 'cobble')
    S = M['sprites']
    draw_van(c, 200, 300, 'SE', 'idle', 0, 'ko', 1)
    draw_van(c, 520, 300, 'NE', 'idle', 0, 'ko', 1)
    put(c, frame(GBB, 'gb_sign_0'), 760, 330, S['gb_sign']['anchor'])
    put(c, frame(GBB, 'gb_sign_1'), 760, 330, S['gb_sign']['anchor'])
    put(c, frame(GBB, 'gb_locker_a_0'), 980, 330, S['gb_locker_a']['anchor'])
    put(c, frame(GBB, 'gb_locker_a_1'), 980, 330, S['gb_locker_a']['anchor'])
    a = 0.45
    tint = tuple(int(round(255 * (1 - a) + ch * a)) for ch in (0x5a, 0x6a, 0xa8))
    from PIL import ImageChops
    mul = Image.new('RGBA', (W, H), tint + (255,))
    night = ImageChops.multiply(c, mul)
    glow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)

    def g(x, y, r, col=(255, 210, 120)):
        for k in range(10, 0, -1):
            rr = r * k / 10
            al = int(14 + 16 * (10 - k))
            gd.ellipse([x - rr, y - rr * 0.8, x + rr, y + rr * 0.8], fill=col + (min(255, al),))
    for x0, dd in ((200, 'SE'), (520, 'NE')):
        p = VAN['roofSignPoint'][dd]
        g(x0 + p[0], 300 + p[1] - 20, 40)
        for q in VAN['lightPoints'][dd]:
            g(x0 + q[0], 300 + q[1], 22)
    g(760, 330 - 170, 50)
    g(980 - 5, 330 - 105, 30)
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    out = Image.alpha_composite(night, Image.new('RGBA', (W, H), (0, 0, 0, 0)))
    arr_n = night.convert('RGB')
    add = Image.composite(glow.convert('RGB'), Image.new('RGB', (W, H)), glow.getchannel('A'))
    res = ImageChops.add(arr_n, add)
    d = ImageDraw.Draw(res)
    label(d, (10, 8), 'night (game MULTIPLY tint 0x5a6aa8 @ 0.45 + ADD glows): lit roof sign, gb_sign lit patch, '
                      'locker lit patch', 18, (255, 255, 255))
    res.save(os.path.join(PREV, 'gb_night.png'))
    del out


def prev_all():
    """One labelled sheet with every key."""
    S = M['sprites']
    W = 1700
    c = Image.new('RGBA', (W, 1500), BG)
    d = ImageDraw.Draw(c)
    y = 10
    label(d, (10, y), '금방 set (assets/geumbang): gb_van_0 + gb_bld_0', 26)
    y += 40
    x = 20
    for anim in ('idle', 'move'):
        for dd in ('SE', 'NE'):
            for i in range(VAN['anims'][anim]['frames']):
                if x > W - 150:
                    x = 20
                    y += 150
                im, an, fl, _ = van_frame(anim, dd, i)
                put(c, im, x + 70, y + 120, an, False, 0.5)
                label(d, (x, y + 128), '%s_%s_%d' % (anim, dd, i), 13)
                x += 150
    y += 160
    x = 20
    for dd in ('S', 'E', 'N'):
        im, an, fl, _ = van_frame('turn', dd, 0)
        put(c, im, x + 90, y + 125, an, False, 0.5)
        label(d, (x, y + 133), 'turn_%s_0' % dd, 13)
        x += 180
    for n in ('gb_roofsign_ko_0', 'gb_roofsign_ko_1', 'gb_roofsign_en_0', 'gb_roofsign_en_1'):
        put(c, frame(GBV, n), x + 60, y + 100, (0.5, 1.0))
        label(d, (x, y + 108), n.replace('gb_roofsign_', 'roofsign '), 13)
        x += 130
    y += 160
    x = 20
    for n in ('gb_nameplate_ko', 'gb_nameplate_en', 'seori_nameplate_ko', 'seori_nameplate_en', 'gb_banner_ko_0',
              'gb_banner_en_0'):
        im = frame(GBB, n)
        bb = im.getbbox()
        im = im.crop(bb)
        c.alpha_composite(im, (x, y + 10))
        label(d, (x, y + 10 + im.height + 4), n, 13)
        x += max(im.width + 30, 150)
    y += 200
    x = 20
    for key in ('gb_sign', 'gb_flag', 'gb_locker_a', 'gb_locker_b'):
        s = S[key]
        im = frame(GBB, s['frame'])
        put(c, im, x + s['anchor'][0] * im.width, y + 240 * 0 + s['anchor'][1] * im.height, s['anchor'])
        label(d, (x, y + im.height + 4), key, 14)
        x += im.width + 30
    for key in ('gb_parcel_s', 'gb_parcel_m', 'gb_parcel_l', 'gb_parcel_doorstep', 'gb_parcel_open', 'gb_parcel_cat'):
        im = frame(GBB, S[key]['frame'])
        c.alpha_composite(im.resize((108, 108), Image.LANCZOS), (x, y + 40))
        label(d, (x, y + 150), key.replace('gb_parcel_', 'parcel '), 13)
        x += 115
    y += 300
    x = 20
    for dd in ('SE', 'NE'):
        for i in range(4):
            c.alpha_composite(frame(GBB, 'gb_pennant_%s_%d' % (dd, i)).resize((96, 112), Image.LANCZOS), (x, y))
            label(d, (x, y + 114), 'pennant %s %d' % (dd, i), 12)
            x += 105
    c = c.crop((0, 0, W, y + 140))
    c.convert('RGB').save(os.path.join(PREV, 'gb_all.png'))


def main():
    os.makedirs(PREV, exist_ok=True)
    prev_all()
    prev_van()
    prev_van_compare()
    prev_van_gifs()
    prev_hub()
    prev_props()
    prev_items()
    prev_sled()
    prev_night()
    print('previews written to', PREV)


if __name__ == '__main__':
    sys.exit(main())
