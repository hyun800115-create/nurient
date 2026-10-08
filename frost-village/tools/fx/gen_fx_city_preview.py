"""
gen_fx_city_preview.py - human previews for assets/fx_city (library of tools/fx/gen_fx_city.py):
  sheet_preview()  -> docs/previews/fxcity_sheet.png  (every FX strip on snow / plaza / sea / night)
  ui_preview()     -> docs/previews/fxcity_ui.png     (ui4 icons at 96/48/32 px on cream, dark and buttons; panels
                                                       with their 9-slice margins; mock-ups with Korean text drawn
                                                       the way the game will: wanted poster, 솔방울 신문, passbook,
                                                       story cards)
  hose_arc_gif()   -> docs/previews/fxcity_hose_arc.gif (segments chained along aimed arcs + tip + mist + steam)
Text in the mock-ups is drawn here only for illustration - the assets carry no text.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
if HERE not in sys.path:
    sys.path.insert(0, HERE)
import fxlib as F                                       # noqa: E402

BGS = ['#F4F7FB', '#D9A08A', '#1F5FA8', '#2B2F3A']
FONT_PATHS = ('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')


def font(size=14):
    for p in FONT_PATHS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def text(d, xy, s, size=14, fill=(43, 47, 58), bold=False, anchor='la', stroke=0, stroke_fill=None):
    f = font(size)
    if bold:
        for dx in (0, 1):
            d.text((xy[0] + dx, xy[1]), s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)
    else:
        d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)


def nine_stretch(img, m, w, h):
    """Phaser-style 9-slice stretch of a PIL image (corners fixed, edges / centre stretched)."""
    W, H = img.size
    L, R, T, B = m['left'], m['right'], m['top'], m['bottom']
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    xs = [(0, L, 0, L), (L, W - R, L, w - R), (W - R, W, w - R, w)]
    ys = [(0, T, 0, T), (T, H - B, T, h - B), (H - B, H, h - B, h)]
    for sx0, sx1, dx0, dx1 in xs:
        for sy0, sy1, dy0, dy1 in ys:
            if dx1 <= dx0 or dy1 <= dy0 or sx1 <= sx0 or sy1 <= sy0:
                continue
            piece = img.crop((sx0, sy0, sx1, sy1)).resize((dx1 - dx0, dy1 - dy0), Image.BILINEAR)
            out.alpha_composite(piece, (dx0, dy0))
    return out


# =========================================================================== FX sheet preview
def sheet_preview(sheets, specs, W=1640):
    rows = []
    for k, frames in sheets.items():
        fw, fh = frames[0].size
        sc = 3.0 if fh <= 32 else min(1.0, 176.0 / fh)
        cw, ch = max(1, int(fw * sc)), max(1, int(fh * sc))
        n_fit = max(1, (W - 190) // (cw + 4))
        idx = list(range(len(frames)))
        if len(idx) > n_fit:
            idx = [int(round(x)) for x in np.linspace(0, len(frames) - 1, n_fit)]
        rows.append((k, frames, idx, sc, cw, ch))
    H = 34 + sum(ch + 14 for *_, ch in rows) + 10
    im = Image.new('RGBA', (W, H), (200, 208, 220, 255))
    d = ImageDraw.Draw(im)
    text(d, (10, 9), 'fxcity_sheet - CONTRACT_V8 §AC city FX: frames left -> right on snow / plaza / sea / night '
                     '(cycling), NORMAL blend; red cross = anchor; label = key, frames, fps, loop/once', 15)
    y = 34
    for k, frames, idx, sc, cw, ch in rows:
        spec = specs[k]
        for j, i in enumerate(idx):
            f = frames[i]
            if sc != 1.0:
                f = f.resize((cw, ch), Image.LANCZOS if sc < 1 else Image.NEAREST)
            bg = Image.new('RGBA', (cw, ch), BGS[j % 4])
            bg.alpha_composite(f)
            x = 8 + j * (cw + 4)
            im.alpha_composite(bg, (x, y))
            ax, ay = x + spec['anchor'][0] * cw, y + spec['anchor'][1] * ch
            d.line([(ax - 4, ay), (ax + 4, ay)], fill=(255, 0, 90, 200))
            d.line([(ax, ay - 4), (ax, ay + 4)], fill=(255, 0, 90, 200))
        text(d, (W - 178, y + 4), k, 13, bold=True)
        text(d, (W - 178, y + 22), '%dx%d  %d f  %d fps' % (spec['w'], spec['h'], spec['frames'], spec['fps']), 12)
        text(d, (W - 178, y + 38), 'loop' if spec['repeat'] == -1 else 'once', 12)
        y += ch + 14
    return im


# =========================================================================== hose arc (GIF)
def hose_arc_gif(sheets, path):
    import gen_fx_city_scene as SC
    seg, tip, rope = sheets['fx_hose_stream'], sheets['fx_hose_tip'], sheets.get('fx_hose_rope')
    mist, steam = sheets.get('fx_water_mist'), sheets.get('fx_steam_puff')
    W, H = 520, 284
    aims = [((70, 244), (330, 114)), ((70, 244), (440, 194)), ((70, 244), (230, 84))]
    frames = []
    n = 24
    for i in range(n):
        im = Image.new('RGBA', (W, H), (244, 247, 251, 255))
        d = ImageDraw.Draw(im)
        for k, (N, T) in enumerate(aims):
            col = (190, 200, 215, 255) if k else (255, 0, 90, 255)
            d.ellipse([T[0] - 3, T[1] - 3, T[0] + 3, T[1] + 3], outline=col)
        for k, (N, T) in enumerate(aims):
            if mist is not None and k == 0:
                SC.put(im, mist[i % len(mist)], T, (0.5, 0.6))
            if rope is not None and k < 2:
                SC.hose_rope(im, N, T, rope[i % len(rope)], tip[i % len(tip)])
            else:
                SC.hose_arc(im, N, T, seg[i % len(seg)], tip[i % len(tip)])
            if steam is not None and k == 0:
                SC.put(im, steam[(i * 14 // n) % len(steam)], (T[0] + 16, T[1] - 4), (0.5, 0.9), 0.8)
        d.ellipse([N[0] - 6, N[1] - 6, N[0] + 6, N[1] + 6], fill=(60, 70, 90, 255))
        text(d, (8, 5), 'aimed jets (manifest.hoseAim): fx_hose_rope on a Rope (2 lower arcs, recommended)', 12)
        text(d, (8, 21), 'fx_hose_stream chain (steep arc, Canvas fallback); + hose_tip, water_mist, steam_puff', 12)
        text(d, (N[0] - 30, N[1] + 10), 'nozzle', 12)
        frames.append(im)
    F.save_gif(frames, path, 24, panels=('#F4F7FB',))


# =========================================================================== UI preview
def _portrait(seed=7, preset=None, hat=None):
    """A resident head-and-shoulders (townfolk compositor, read-only) for the poster / paper mock-ups."""
    try:
        sys.path.insert(0, os.path.join(ROOT, 'tools'))
        from townfolk2_compose import Townfolk2
        tf = Townfolk2.from_assets()
        p = tf.preset(preset, seed=seed) if preset else tf.random_person(seed=seed)
        img = tf.compose(p, 'idle', 'S', 0)
        return img.crop((24, 4, 104, 84)).resize((128, 128), Image.LANCZOS)
    except Exception as e:                               # pragma: no cover - preview only
        print('  (portrait fallback:', e, ')')
        im = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
        dd = ImageDraw.Draw(im)
        dd.ellipse([34, 18, 94, 78], fill=(246, 207, 174, 255), outline=(110, 70, 40, 255), width=3)
        dd.ellipse([16, 76, 112, 150], fill=(70, 70, 80, 255))
        return im


def _mask_band(img):
    """Draw a cheeky thief mask over the eyes of a 128 px portrait (illustration only)."""
    im = img.copy()
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([34, 54, 94, 68], 7, fill=(30, 33, 40, 255))
    for x in (50, 78):
        d.ellipse([x - 6, 56, x + 6, 66], fill=(255, 255, 255, 255))
        d.ellipse([x - 2, 59, x + 3, 64], fill=(74, 38, 22, 255))
    return im


def wanted_mock(poster, e, seed=12, name='빵 도둑 "살금이"', reward='포상금 500', mask=True):
    """ui_wanted_poster composed the way the game does it: resident portrait in portraitWindow + title / name /
    reward text in their boxes (the asset itself carries no text)."""
    pos = poster.copy()
    pd = ImageDraw.Draw(pos)
    port = _portrait(seed=seed)
    if mask:
        port = _mask_band(port)
    px, py_, pw, ph = e['portraitWindow']
    pos.alpha_composite(port.resize((pw, ph), Image.LANCZOS) if port.size != (pw, ph) else port, (px, py_))
    tx, ty, tw, th = e['titleBox']
    text(pd, (tx + tw / 2, ty + th / 2), '현상수배', 24, fill=(255, 255, 255), bold=True, anchor='mm', stroke=2,
         stroke_fill=(110, 20, 16))
    nx, ny, nw, nh = e['nameBox']
    text(pd, (nx + nw / 2, ny + nh / 2), name, 15, fill=(70, 50, 30), bold=True, anchor='mm')
    rx, ry, rw, rh = e['rewardBox']
    text(pd, (rx + 6, ry + rh / 2 - 2), reward, 16, fill=(110, 70, 20), bold=True, anchor='lm')
    return pos


def ui_preview(icons, panels, W=1600):
    import gen_ui4 as UI
    margins = {k: m for k, _f, m, _e, _n in UI.PANELS}
    extras = {k: e for k, _f, _m, e, _n in UI.PANELS}
    keys = list(icons)
    im = Image.new('RGBA', (W, 2280), (244, 247, 251, 255))
    d = ImageDraw.Draw(im)
    text(d, (14, 8), 'fxcity_ui - CONTRACT_V8 §AC: ui4_icons at 96 / 48 / 32 px on cream, dark HUD and blue buttons; '
                     'panels with 9-slice margins (red); mock-ups with text drawn the way the game will (assets carry '
                     'no text)', 15)
    # --- icons on cream
    y = 34
    per = 9
    nrow = (len(keys) + per - 1) // per
    d.rounded_rectangle([8, y, W - 8, y + 18 + nrow * 132], 18, fill=(255, 248, 236, 255), outline=(228, 207, 171),
                        width=3)
    for k, key in enumerate(keys):
        x = 22 + (k % per) * 174
        yy = y + 12 + (k // per) * 132
        im.alpha_composite(icons[key], (x, yy))
        text(d, (x, yy + 98), key.replace('ui_icon_', '').replace('ui_', ''), 12)
        im.alpha_composite(icons[key].resize((48, 48), Image.LANCZOS), (x + 102, yy + 10))
        im.alpha_composite(icons[key].resize((32, 32), Image.LANCZOS), (x + 110, yy + 64))
    y += 18 + nrow * 132 + 16
    # --- dark HUD + blue buttons
    d.rectangle([0, y, W, y + 196], fill=(43, 47, 58, 255))
    for k, key in enumerate(keys):
        x = 12 + k * 63
        im.alpha_composite(icons[key].resize((56, 56), Image.LANCZOS), (x, y + 10))
        btn = Image.new('RGBA', (60, 56), (0, 0, 0, 0))
        bd = ImageDraw.Draw(btn)
        bd.rounded_rectangle([1, 4, 59, 54], 15, fill=(36, 92, 166, 255))
        bd.rounded_rectangle([1, 1, 59, 48], 15, fill=(61, 139, 224, 255))
        btn.alpha_composite(icons[key].resize((42, 42), Image.LANCZOS), (9, 3))
        im.alpha_composite(btn, (x - 2, y + 78))
        im.alpha_composite(icons[key].resize((32, 32), Image.LANCZOS), (x + 12, y + 150))
    y += 196 + 18
    # --- panels at source size with margins
    text(d, (14, y), 'panels at source size (9-slice margins in red; ui_wanted_poster is a fixed image with layout '
                     'boxes in green):', 14)
    y += 24
    x = 14
    rowh = 0
    for key, img in panels.items():
        w, h = img.size
        if x + w > W - 10:
            x = 14
            y += rowh + 34
            rowh = 0
        im.alpha_composite(img, (x, y))
        m = margins.get(key)
        if m:
            for xx in (x + m['left'], x + w - m['right']):
                d.line([(xx, y), (xx, y + h)], fill=(255, 60, 90, 170))
            for yy in (y + m['top'], y + h - m['bottom']):
                d.line([(x, yy), (x + w, yy)], fill=(255, 60, 90, 170))
        else:
            for bk in ('titleBox', 'portraitWindow', 'nameBox', 'rewardBox'):
                bx, by_, bw, bh = extras[key][bk]
                d.rectangle([x + bx, y + by_, x + bx + bw, y + by_ + bh], outline=(40, 170, 90, 200))
        text(d, (x, y + h + 4), key, 12)
        x += w + 26
        rowh = max(rowh, h)
    y += rowh + 40
    # --- mock-ups
    text(d, (14, y), 'mock-ups (how the game composes them):', 14)
    y += 26
    yb = y
    # wanted poster x1 with portrait + text
    pos = wanted_mock(panels['ui_wanted_poster'], extras['ui_wanted_poster'])
    im.alpha_composite(pos, (14, y))
    small = pos.resize((pos.width * 32 // 100, pos.height * 32 // 100), Image.LANCZOS)
    im.alpha_composite(small, (20, y + pos.height + 10))
    im.alpha_composite(small, (20 + small.width + 8, y + pos.height + 10))
    text(d, (20, y + pos.height + 14 + small.height), 'x0.32 on the wanted board', 12)
    # newspaper
    nxp = 270
    page = newspaper_mock(panels, icons, extras, margins)
    im.alpha_composite(page, (nxp, y))
    # passbook + story cards
    px0 = nxp + page.width + 24
    pb = passbook_mock(panels, icons, margins, extras)
    im.alpha_composite(pb, (px0, y))
    sy = y + pb.height + 20
    for k, (key, ic, msg, sub) in enumerate((
            ('ui_story_card', 'ui_icon_rumor', '들었어? 빵집 앞에서', '소란이 났대!'),
            ('ui_story_card_news', 'ui_icon_move_in', '꽃집 옆집에 새 이웃이', '이사 왔대요!'))):
        card = nine_stretch(panels[key], margins[key], 380, 132)
        cd = ImageDraw.Draw(card)
        card.alpha_composite(icons[ic].resize((44, 44), Image.LANCZOS), (24, 36))
        ins = extras[key]['contentInset']
        text(cd, (ins[0] + 62, ins[1] + 14), msg, 17, fill=(60, 50, 40), bold=True)
        text(cd, (ins[0] + 62, ins[1] + 40), sub, 17, fill=(60, 50, 40), bold=True)
        text(cd, (380 - 70, 14), '소문' if k == 0 else '소식', 13, fill=(255, 255, 255), bold=True)
        im.alpha_composite(card, (px0, sy + k * 146))
    y = max(y + pos.height + small.height + 40, y + page.height, sy + 2 * 146) + 16
    return im.crop((0, 0, W, y))


def newspaper_mock(panels, icons, extras, margins, w=600, h=664):
    page = nine_stretch(panels['ui_newspaper'], margins['ui_newspaper'], w, h)
    d = ImageDraw.Draw(page)
    mast = nine_stretch(panels['ui_newspaper_masthead'], margins['ui_newspaper_masthead'], w - 48, 96)
    page.alpha_composite(mast, (24, 22))
    text(d, (w / 2, 22 + 44), '솔방울 신문', 40, fill=(40, 40, 48), bold=True, anchor='mm')
    text(d, (w / 2, 22 + 101), '제 128호 · 눈 오는 화요일 · 서리마을', 13, fill=(90, 90, 100), anchor='mm')
    cy0 = 22 + 116
    colw = (w - 48 - 16) // 2
    c1 = nine_stretch(panels['ui_newspaper_column'], margins['ui_newspaper_column'], colw, 300)
    c1d = ImageDraw.Draw(c1)
    text(c1d, (14, 20), '시장 골목 화재, 모두 무사!', 17, fill=(30, 30, 36), bold=True, anchor='lm')
    ph = nine_stretch(panels['ui_newspaper_photo'], margins['ui_newspaper_photo'], colw - 24, 150)
    snap = _fire_snapshot(colw - 44, 130)
    if snap is not None:
        ph.alpha_composite(snap, (10, 10))
    c1.alpha_composite(ph, (12, 44))
    for k, ln in enumerate(('소방관들이 5분 만에 도착해', '불을 껐어요. 다친 사람은 없고,', '구경하던 주민들이 박수를', '보냈답니다.')):
        text(c1d, (14, 204 + k * 22), ln, 14, fill=(60, 60, 70))
    page.alpha_composite(c1, (24, cy0))
    c2 = nine_stretch(panels['ui_newspaper_column'], margins['ui_newspaper_column'], colw, 140)
    c2d = ImageDraw.Draw(c2)
    text(c2d, (14, 20), '빵 도둑, 이틀 만에 잡혀', 17, fill=(30, 30, 36), bold=True, anchor='lm')
    c2.alpha_composite(icons['ui_icon_cuffs_cute'].resize((48, 48), Image.LANCZOS), (colw - 62, 50))
    for k, ln in enumerate(('주민 제보로 붙잡힌 "살금이"는', '빵값을 갚고 사과했어요.', '"다시는 안 그럴게요!"')):
        text(c2d, (14, 50 + k * 22), ln, 14, fill=(60, 60, 70))
    page.alpha_composite(c2, (24 + colw + 16, cy0))
    c3 = nine_stretch(panels['ui_newspaper_column'], margins['ui_newspaper_column'], colw, 144)
    c3d = ImageDraw.Draw(c3)
    text(c3d, (14, 20), '새 이웃 환영해요', 17, fill=(30, 30, 36), bold=True, anchor='lm')
    c3.alpha_composite(icons['ui_icon_move_in'].resize((48, 48), Image.LANCZOS), (colw - 62, 50))
    for k, ln in enumerate(('꽃집 옆 주택에 털보 아저씨', '가족이 이사 왔어요.', '반갑게 인사해 주세요!')):
        text(c3d, (14, 50 + k * 22), ln, 14, fill=(60, 60, 70))
    page.alpha_composite(c3, (24 + colw + 16, cy0 + 156))
    div = nine_stretch(panels['ui_newspaper_divider'], margins['ui_newspaper_divider'], w - 48, 16)
    page.alpha_composite(div, (24, cy0 + 312))
    ad = nine_stretch(panels['ui_newspaper_column'], margins['ui_newspaper_column'], w - 48, 150)
    add = ImageDraw.Draw(ad)
    text(add, (14, 20), '알림 · 물류센터 직원 구함', 17, fill=(30, 30, 36), bold=True, anchor='lm')
    ad.alpha_composite(icons['ui_icon_forklift'].resize((64, 64), Image.LANCZOS), (w - 48 - 90, 56))
    ad.alpha_composite(icons['ui_icon_box'].resize((52, 52), Image.LANCZOS), (w - 48 - 150, 66))
    for k, ln in enumerate(('지게차 기사, 포장 직원을 모집합니다.', '은행 대출로 새 가게를 열고 싶은 분은', '솔방울 은행 창구로 오세요!')):
        text(add, (14, 52 + k * 24), ln, 14, fill=(60, 60, 70))
    page.alpha_composite(ad, (24, cy0 + 336))
    return page


def _fire_snapshot(w, h):
    """Tiny photo for the paper: a townhouse with the fire + smoke + truck glow (assets read-only)."""
    try:
        import gen_fx_city_scene as SC
        return SC.snapshot(w, h)
    except Exception as e:                               # pragma: no cover
        print('  (snapshot fallback:', e, ')')
        return None


def passbook_mock(panels, icons, margins, extras, w=440, h=330):
    pb = nine_stretch(panels['ui_passbook'], margins['ui_passbook'], w, h)
    d = ImageDraw.Draw(pb)
    ins = extras['ui_passbook']['contentInset']
    hy = extras['ui_passbook']['headerY']
    tb = extras['ui_passbook']['titleBox']
    text(d, (tb[0] + 4, tb[1] + tb[3] / 2), '솔방울 은행 · 김솔이 님', 16, fill=(40, 70, 140), bold=True, anchor='lm')
    cols = [ins[0] + 4, ins[0] + 70, ins[0] + 190, ins[0] + 290]
    for x, s in zip(cols, ('날짜', '내용', '금액', '잔액')):
        text(d, (x, hy - 18), s, 13, fill=(60, 90, 150), bold=True)
    rows = [('1일', '저축', '+300', '1,300', True), ('3일', '이자', '+13', '1,313', False),
            ('5일', '대출 (가게)', '+2,000', '3,313', True), ('7일', '상환', '-200', '3,113', False),
            ('9일', '화재 보험', '-30', '3,083', True)]
    for k, (a, b, c_, bal, stamp) in enumerate(rows):
        ry = hy + 8 + k * 32
        row = nine_stretch(panels['ui_passbook_row'], margins['ui_passbook_row'], w - ins[0] - ins[2], 32)
        pb.alpha_composite(row, (ins[0], ry))
        col = (200, 60, 50) if c_.startswith('-') else (40, 120, 60)
        for x, s, f in ((cols[0], a, (70, 70, 80)), (cols[1], b, (70, 70, 80)), (cols[2], c_, col), (cols[3], bal, (70, 70, 80))):
            text(d, (x, ry + 7), s, 14, fill=f)
        if stamp:
            st = icons['ui_stamp_bank'].resize((30, 30), Image.LANCZOS).rotate(-12 + k * 9, Image.BICUBIC)
            pb.alpha_composite(st, (w - ins[2] - 36, ry + 1))
    return pb
