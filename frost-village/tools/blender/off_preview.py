"""
off_preview.py - previews of the packed 촌장 사무실 set (assets/office).  Reads ONLY the packed atlases + manifest (so
the previews prove what the game gets) plus existing fragments for context and stand-ins (town, civic, characters,
cityfolk / townfolk paper dolls).  Called by off_pack.py; can also be run alone:
    python3 tools/blender/off_preview.py [--out assets/office] [--prev docs/previews]

Writes docs/previews/:
  off_office_states.png    closed / open (default reveal) / bare with the real staff at their points; night closed +
                           open; a busy open office (alert lamp, ringing phone, open safe)
  off_office_layers.png    every layer alone (exploded) + every overlay frame
  off_office_points.png    the open office with every manifest point, walkPoly, wallCircles, revealPoly, boardRect and
                           signRect (with the text / bars the game draws)
  off_items.png            the six items + the mailbox frames, on snow, at night, at 1x and 3x, next to existing items
  off_scene.png            the office between the town hall, the bank and the post-office stand-in it replaces (1x)
  off_reveal.gif           closed -> open -> closed with the staff at work
  off_anims.gif            typewriters, ringing phone, stove fire, alert lamps, safe door (2x crop)
  off_mailbox.gif          the mailbox flag pop (12 fps) + hold + flag down
  off_night.gif            evening falls: the closed office lights up (glow + DayClock lights)
The staff are REAL (polish, critique L7): officefolk (AJ) via tools/officefolk_compose.py (read-only) - 셈이 desk_write,
소복이 desk_type, 총총이 desk_phone, 딸랑이 desk_count at deskPoints, standing work anims at staffPoints, townfolk2 `sit`
visitors on the bench - and the chief from chief2 (AH): sit_write at chiefDeskPoint with its `_desk` forearm overlay
drawn right after _interior_front, warm_hands at stovePoint, the player rig at chiefDeskPad.  Inside people's contact
shadows are drawn just above _floor (cutaway.insideShadowDepthOffset).
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import prop_pack as pp   # noqa: E402  (font)
from civ_preview import Frag, People, fade, ell_shadow   # noqa: E402  (read-only reuse)

ASSETS = os.path.join(GAME, 'assets')
SNOW = (244, 247, 251, 255)
KEY = 'chief_office'
NIGHT_MUL = (0.709, 0.737, 0.847)            # DayClock MULTIPLY at darkness 0.45 (NIGHT 0x5a6aa8)
JUA = os.path.join(GAME, 'tools', 'fonts', 'Jua-Regular.ttf')


def kfont(size):
    try:
        return ImageFont.truetype(JUA, size)
    except Exception:                       # noqa: BLE001
        return pp.font(size)


# =================================================================================================== basics

def fv_glow():
    """The DayClock 96 px radial glow (src/systems/DayClock.js makeGlow) as premultiplied float RGB."""
    s = 96
    yy, xx = np.mgrid[0:s, 0:s].astype(np.float32)
    r = np.sqrt((xx - s / 2 + 0.5) ** 2 + (yy - s / 2 + 0.5) ** 2) / (s / 2)
    stops = [(0.0, (255, 236, 180, 0.95)), (0.25, (255, 214, 140, 0.55)), (0.6, (255, 190, 110, 0.16)),
             (1.0, (255, 180, 100, 0.0))]
    out = np.zeros((s, s, 4), np.float32)
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        m = (r >= t0) & (r <= t1)
        u = ((r - t0) / (t1 - t0))[m]
        for ch in range(4):
            out[..., ch][m] = c0[ch] + (c1[ch] - c0[ch]) * u
    out[..., :3] *= out[..., 3:4] / 255.0          # premultiplied, 0..1
    return out[..., :3]


GLOW = None


def night(img, lights=(), k=1.0, alpha=0.64):
    """DayClock night: MULTIPLY the world by the night tint, then ADD fv_glow at each light point (scale 1.25 k)."""
    global GLOW
    if GLOW is None:
        GLOW = fv_glow()
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    for c in range(3):
        a[..., c] *= NIGHT_MUL[c]
    for (x, y, kk) in lights:
        sc = 1.25 * kk
        n = max(8, int(round(96 * sc)))
        g = np.asarray(Image.fromarray((GLOW * 255).astype(np.uint8)).resize((n, n), Image.BILINEAR)).astype(
            np.float32) * alpha
        x0, y0 = int(round(x - n / 2)), int(round(y - n / 2))
        X0, Y0 = max(0, x0), max(0, y0)
        X1, Y1 = min(a.shape[1], x0 + n), min(a.shape[0], y0 + n)
        if X1 <= X0 or Y1 <= Y0:
            continue
        a[Y0:Y1, X0:X1, :3] += g[Y0 - y0:Y1 - y0, X0 - x0:X1 - x0]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def label(img, text, x, y, size=14, center=True, bg=(255, 255, 255, 225), fg=(30, 34, 44)):
    d = ImageDraw.Draw(img)
    f = kfont(size) if any(ord(c) > 0x3000 for c in text) else pp.font(size)
    tw = f.getlength(text)
    x0 = x - tw / 2 if center else x
    d.rounded_rectangle([x0 - 6, y - 3, x0 + tw + 6, y + size + 5], radius=7, fill=bg)
    d.text((x0, y), text, fill=fg, font=f)


def title_bar(img, text, h=38):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, img.width, h], fill=(31, 95, 168, 255))
    f = kfont(20)
    d.text((14, 7), text, fill=(255, 255, 255), font=f)


def save_rgb(img, path):
    img.convert('RGB').save(path, optimize=True)


def save_gif(frames, path, fps=8, bg=SNOW, durations=None):
    out = []
    for f in frames:
        b = Image.new('RGBA', f.size, bg)
        b.alpha_composite(f)
        out.append(b.convert('RGB'))
    # one palette from a montage of several frames (a single frame's palette tints the others' crossfades)
    picks = [out[i] for i in sorted(set([0, len(out) // 3, len(out) // 2, 2 * len(out) // 3, len(out) - 1]))]
    mont = Image.new('RGB', (picks[0].width, picks[0].height * len(picks)))
    for i, f in enumerate(picks):
        mont.paste(f, (0, i * picks[0].height))
    pal = mont.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = [o.quantize(palette=pal, dither=Image.Dither.NONE) for o in out]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durations or int(1000 / fps), loop=0, optimize=True)


SHADOW = {}


def put(cv, im, an, x, y, shadow=True, sit=False):
    if im is None:
        return
    if shadow:
        if 'p' not in SHADOW:
            SHADOW['p'] = ell_shadow(22, 8, a=80)
        sy = y + (25 if sit else 0)
        cv.alpha_composite(SHADOW['p'], (int(round(x - 22)), int(round(sy - 8))))
    cv.alpha_composite(im, (int(round(x - an[0])), int(round(y - an[1]))))


# =================================================================================================== the set

class Office:
    def __init__(self, out_dir):
        self.F = Frag(out_dir)
        if not self.F.ok:
            raise SystemExit('no manifest in %s' % out_dir)
        self.man = self.F.man
        self.S = self.man['sprites']
        self.e = self.S[KEY]
        self.W, self.H = self.e['frameSize']
        self.ax, self.ay = self.e['anchor'][0] * self.W, self.e['anchor'][1] * self.H

    def img(self, key, frame=None):
        s = self.S[key]
        return self.F.frame(s['atlas'], frame or s['frame'])

    def ovl(self, name, i=0):
        s = self.S[self.e['overlays'][name]['sprite']]
        frs = s['frames']
        return self.F.frame(s['atlas'], frs[i % len(frs)])

    def sprite(self, key, frame=None):
        s = self.S[key]
        im = self.F.frame(s['atlas'], frame or s['frame'])
        return im, (s['anchor'][0] * im.width, s['anchor'][1] * im.height)


def sign_text(o, img, ox, oy, alpha=1.0):
    """Write 촌장 사무실 into signRect (sheared y += 0.5 x) as the game would."""
    sr = o.e.get('signRect')
    if not sr or alpha <= 0.02:
        return
    w, h = sr['widthPx'], sr['heightPx']
    S = 4
    t = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    txt = sr['text']['ko']
    size = h * S
    while size > 8:
        f = kfont(size)
        bb = d.textbbox((0, 0), txt, font=f)
        if bb[2] - bb[0] <= w * S * 0.94 and bb[3] - bb[1] <= h * S * 0.86:
            break
        size -= 2
    bb = d.textbbox((0, 0), txt, font=f)
    col = tuple(int(sr['color'][i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    d.text(((w * S - (bb[2] - bb[0])) / 2 - bb[0], (h * S - (bb[3] - bb[1])) / 2 - bb[1]), txt, font=f, fill=col)
    t = t.resize((w, h), Image.LANCZOS)
    # shear: y += shearY * x (x relative to the centre)
    sh = sr.get('shearY', 0.5)
    pad = int(abs(sh) * w / 2) + 2
    big = Image.new('RGBA', (w, h + 2 * pad), (0, 0, 0, 0))
    big.paste(t, (0, pad))
    big = big.transform(big.size, Image.AFFINE, (1, 0, 0, -sh, 1, sh * w / 2), resample=Image.BICUBIC)
    if alpha < 1:
        big = fade(big, alpha)
    cx, cy = ox + o.ax + sr['point'][0], oy + o.ay + sr['point'][1]
    img.alpha_composite(big, (int(round(cx - w / 2)), int(round(cy - h / 2 - pad))))


def board_bars(o, img, ox, oy):
    """The 5 coloured stock bars the game draws on boardRect (sheared like the slate)."""
    br = o.e.get('boardRect')
    if not br:
        return
    w, h = br['widthPx'], br['heightPx']
    t = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(t)
    cols = [(122, 196, 120), (242, 193, 78), (120, 180, 230), (232, 116, 106), (200, 160, 230)]
    vals = [0.82, 0.55, 0.68, 0.22, 0.9]
    n = 5
    bw = (w - 8) / n
    for i in range(n):
        x0 = 4 + i * bw + 2
        bh = (h - 10) * vals[i]
        d.rounded_rectangle([x0, h - 4 - bh, x0 + bw - 4, h - 4], radius=2, fill=cols[i] + (235,))
    d.line([3, h - 3, w - 3, h - 3], fill=(240, 240, 230, 200), width=1)
    sh = br.get('shearY', 0.5)
    pad = int(abs(sh) * w / 2) + 2
    big = Image.new('RGBA', (w, h + 2 * pad), (0, 0, 0, 0))
    big.paste(t, (0, pad))
    big = big.transform(big.size, Image.AFFINE, (1, 0, 0, -sh, 1, sh * w / 2), resample=Image.BICUBIC)
    cx, cy = ox + o.ax + br['point'][0], oy + o.ay + br['point'][1]
    img.alpha_composite(big, (int(round(cx - w / 2)), int(round(cy - h / 2 - pad))))


def compose(o, state='open', people=(), ovl=None, night_on=False, extra_outside=(), text=True, mailbox_frame=None,
            pad=(40, 30, 40, 40), bg=SNOW, shell_alpha=None, cut_alpha=None):
    """The office + its mailbox in a canvas.  people = [(slot, point, img, anchor, sit)], slot behind / front /
    outside, or 'desk' (a seated person's desk-top overlay, drawn right after _interior_front).  ovl = {overlay name:
    frame index}.  Returns (canvas, (ox, oy)) with ox, oy = frame origin in the canvas."""
    L, T, R, B = pad
    cv = Image.new('RGBA', (o.W + L + R, o.H + T + B), bg)
    ox, oy = L, T
    ax, ay = ox + o.ax, oy + o.ay
    states = o.e['reveal']['states']
    st = states.get(state) or states[o.e['reveal'].get('aliases', {}).get(state, 'open')]
    sa = st['shell'] if shell_alpha is None else shell_alpha
    ca = st['shell_cut'] if cut_alpha is None else cut_alpha
    inside = st['inside'] or (shell_alpha is not None and shell_alpha < 0.999)
    ovl = ovl or {}
    hide_txt = o.e.get('signRect', {}).get('hideBelowShellAlpha', 0.0)

    def ppl(slot):
        for sl, pt, im, an, sit in sorted([p for p in people if p[0] == slot], key=lambda p: p[1][1]):
            put(cv, im, an, ax + pt[0], ay + pt[1], shadow=False, sit=sit)
    lay = {v: k for k, v in o.e['layers'].items()}
    ovk = {v['sprite']: k for k, v in o.e['overlays'].items()}
    for item in o.e['drawOrder']:
        if item.startswith('@'):
            if inside:
                ppl(item[1:])
            continue
        if item in ovk:
            if inside:
                cv.alpha_composite(o.ovl(ovk[item], ovl.get(ovk[item], 0)), (ox, oy))
            continue
        ln = lay.get(item)
        if ln is None:
            continue
        im = o.img(item)
        if ln == 'shell':
            if sa <= 0.01:
                continue
            im2 = Image.new('RGBA', im.size, (0, 0, 0, 0))
            im2.alpha_composite(im)
            if text and sa >= hide_txt:
                sign_text(o, im2, 0, 0)
            cv.alpha_composite(fade(im2, sa) if sa < 1 else im2, (ox, oy))
            continue
        if ln == 'shell_cut':
            if ca > 0.01:
                cv.alpha_composite(fade(im, ca) if ca < 1 else im, (ox, oy))
            continue
        if ln == 'glow':
            if night_on and sa > 0.99:
                cv.alpha_composite(im, (ox, oy))
            continue
        if ln in ('props',):
            cv.alpha_composite(im, (ox, oy))
            continue
        if not inside:
            continue
        cv.alpha_composite(im, (ox, oy))
        if ln == 'floor':
            # inside contact shadows just above _floor (cutaway.insideShadowDepthOffset), never over the furniture
            if 'p' not in SHADOW:
                SHADOW['p'] = ell_shadow(22, 8, a=80)
            for sl, pt, im_, an_, sit in people:
                if sl in ('behind', 'front'):
                    cv.alpha_composite(SHADOW['p'], (int(round(ax + pt[0] - 22)),
                                                     int(round(ay + pt[1] + (25 if sit else 0) - 8))))
        if ln == 'interior_front':
            ppl('desk')
        if ln == 'back' and text:
            board_bars(o, cv, ox, oy)
    # outdoor props + outside actors (in front of the building: the frontTest rule)
    outs = []
    for op in o.e.get('outdoorProps', []):
        im, an = o.sprite(op['sprite'], mailbox_frame)
        outs.append((op['point'][1], 'prop', op['point'], im, an))
    for sl, pt, im, an, sit in people:
        if sl == 'outside':
            outs.append((pt[1], 'p', pt, im, an))
    for t, kind, pt, im, an in sorted(outs, key=lambda q: q[0]):
        if kind == 'prop':
            cv.alpha_composite(im, (int(round(ax + pt[0] - an[0])), int(round(ay + pt[1] - an[1]))))
        else:
            put(cv, im, an, ax + pt[0], ay + pt[1])
    if night_on:
        lights = []
        if sa > 0.99:
            for p in o.e['night']['lightPoints']:
                lights.append((ax + p[0], ay + p[1], 0.8))
        else:
            for p in o.e['night'].get('lightPointsOpen', []):
                lights.append((ax + p[0], ay + p[1], 0.7))
        cv = night(cv, lights)
    return cv, (ox, oy)


# =================================================================================================== people

class Staff:
    """The real people (polish, critique L7): officefolk (AJ) via tools/officefolk_compose.py (read-only; townfolk +
    townfolk2 + officefolk, the v4.2 merge) and the chief from chief2 (AH) / the player rig (characters)."""
    ROLE = {'sem': ('office_a', 3, 'desk_write'), 'bok': ('office_b', 5, 'desk_type'),
            'chong': ('secretary', 8, 'desk_phone'), 'ttal': ('courier', 2, 'desk_count')}

    def __init__(self):
        sys.path.insert(0, os.path.join(GAME, 'tools'))
        from officefolk_compose import Officefolk
        self.of = Officefolk.from_assets(fragments=['townfolk2', 'officefolk'])
        self.chars = Frag('characters')
        self.c2 = Frag('chief2')
        self.cache = {}
        self.P = {}
        for r, (pre, seed, _) in self.ROLE.items():
            self.P[r] = self.of.preset(pre, seed=seed)
        self.P['postal'] = self.of.preset('postal', seed=14)
        self.P['office_b2'] = self.of.preset('office_b', seed=11)
        self.vis = [self.of.random_person(rng=random.Random(k)) for k in (21, 34)]

    def person(self, p, anim, d, i=0):
        from beachfolk_compose import nearest_dir
        a, face = self.of.pick_anim(p, anim)
        inf = self.of.T['anims'][a]
        d = nearest_dir(inf['dirs'], d)           # (= OfficefolkSprite.play: dirs an anim lacks snap to the nearest)
        k = (id(p), a, d, i % inf['frames'])
        if k not in self.cache:
            self.cache[k] = self.of.compose(p, a, d, i % inf['frames'], face=face)
        return self.cache[k], (64, 104)

    def chief(self, anim='idle', d='NE', i=0):
        c2 = self.c2.man.get('characters', {}).get('player_b', {})
        if anim in c2.get('anims', {}):
            n = c2['anims'][anim]['frames']
            return self.c2.char('player_b', anim, d, i % n)
        return self.chars.char('player', anim, d, i)

    def chief_desk(self, anim, d, i=0):
        """chief2's `_desk` overlay frame (forearms / quill over the desk top), mirrored like the body"""
        c2 = self.c2.man['characters']['player_b']
        n = c2['anims'][anim]['frames']
        m = c2.get('mirror', {})
        im = self.c2.frame(c2['atlas'], '%s_%s_%d_desk' % (anim, m.get(d, d), i % n))
        if im is None:
            return None, None
        if d in m:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            return im, ((1 - c2['anchor'][0]) * im.width, c2['anchor'][1] * im.height)
        return im, (c2['anchor'][0] * im.width, c2['anchor'][1] * im.height)

    def item_on_head(self, o, key, im, an, scale=None):
        """the head-carried item over a standing person's frame (carryScale), as one image with the same anchor"""
        s = o.S[key]
        it = o.F.frame(s['atlas'], s['frame'])
        sc = scale or s.get('carryScale', 0.65)
        it = it.resize((max(1, int(it.width * sc)), max(1, int(it.height * sc))), Image.LANCZOS)
        out = Image.new('RGBA', (im.width, im.height + 40), (0, 0, 0, 0))
        out.alpha_composite(im, (0, 40))
        out.alpha_composite(it, (int(round(an[0] - it.width / 2)), int(round(40 + an[1] - 92 - it.height * 0.86))))
        return out, (an[0], an[1] + 40)

    def cast(self, o, t=0, full=True):
        """Everyone at their points (t = anim frame index)."""
        e = o.e
        out = []
        bands = e.get('deskBands') or ['behind'] * len(e['deskPoints'])
        for pt, d, r, b in zip(e['deskPoints'], e['deskDirs'], e['deskRoles'], bands):
            im, an = self.person(self.P[r], self.ROLE[r][2], d, t)
            out.append((b, pt, im, an, True))
        im, an = self.chief('sit_write', e['chiefDeskDir'], t)
        out.append(('behind', e['chiefDeskPoint'], im, an, True))
        dim, dan = self.chief_desk('sit_write', e['chiefDeskDir'], t)
        if dim is not None:
            out.append(('desk', e['chiefDeskPoint'], dim, dan, True))
        if full:
            for k, (pt, d) in enumerate(zip(e['seatPoints'], e['seatDirs'])):
                im, an = self.person(self.vis[k], 'sit', d, t)
                out.append(('front', pt, im, an, True))
            im, an = self.person(self.P['postal'], 'idle', e['mailboxDir'], t)
            im, an = self.item_on_head(o, 'item_letter_bundle', im, an)
            out.append(('outside', e['mailboxPoint'], im, an, False))
        return out

    def at_points(self, o, t=0):
        """A real staff member on every standing work spot (staffPoints) + the chief at his pad / the stove + the
        visitors on the bench."""
        e = o.e
        role = {'board': ('sem', 'point_board'), 'cabinet': ('office_b2', 'file'), 'shelf': ('bok', 'file'),
                'safe': ('ttal', 'scoop'), 'door': ('chong', 'hand_over')}
        out = []
        for pt, d, r, b in zip(e['staffPoints'], e['staffDirs'], e['staffRoles'], e['staffBands']):
            who, anim = role.get(r, ('chong', 'idle'))
            im, an = self.person(self.P[who], anim, d, t)
            out.append((b, pt, im, an, False))
        for k, (pt, d) in enumerate(zip(e['seatPoints'], e['seatDirs'])):
            im, an = self.person(self.vis[k], 'sit', d, t)
            out.append(('front', pt, im, an, True))
        im, an = self.chief('idle', e.get('chiefDeskPadDir') or 'NE', 0)
        out.append(('front', e['chiefDeskPad'], im, an, False))
        im, an = self.chief('warm_hands', 'W', t)
        out.append(('behind', e['stovePoint'], im, an, False))
        im, an = self.chief('idle', 'NE', 0)
        out.append(('outside', e['doorPoint'], im, an, False))
        return out


# =================================================================================================== previews

def preview_states(o, St, prev):
    cast = St.cast(o, 0)
    busy = {'lamp_a': 1, 'phone': 1, 'safe': 1, 'typewriter_b': 2, 'stove': 1}
    cells = [('closed (day)', compose(o, 'closed', cast)[0]),
             ('open (default reveal: shell 0.12 + stubs)', compose(o, 'open', cast)[0]),
             ('bare (close-ups only, no stubs)', compose(o, 'bare', cast)[0]),
             ('closed - night (glow + DayClock lights)', compose(o, 'closed', cast, night_on=True)[0]),
             ('open - night (lamps + stove)', compose(o, 'open', cast, night_on=True, ovl={'stove': 1})[0]),
             ('busy: alert lamp, phone ringing, safe open', compose(o, 'open', cast, ovl=busy)[0])]
    cw, ch = cells[0][1].size
    cols = 3
    out = Image.new('RGBA', (cw * cols, 40 + ch * 2), (226, 232, 240, 255))
    title_bar(out, '촌장 사무실 chief_office - reveal states with the real staff (officefolk desk anims, chief2 '
                   'sit_write, townfolk2 visitors)')
    for i, (t, im) in enumerate(cells):
        x, y = (i % cols) * cw, 40 + (i // cols) * ch
        out.alpha_composite(im, (x, y))
        label(out, t, x + cw // 2, y + ch - 26, size=15)
    save_rgb(out, os.path.join(prev, 'off_office_states.png'))
    return out


def preview_layers(o, prev):
    tiles = []
    for ln in ['floor', 'back', 'interior', 'interior_front', 'shell_cut', 'shell', 'glow', 'props']:
        im = o.img(o.e['layers'][ln])
        dep = o.S[o.e['layers'][ln]]['depthOffset']
        tiles.append(('_%s  (%+.3f)' % (ln, dep), im, ln == 'glow'))
    ow, oh = o.W, o.H
    sc = 0.5
    tw, th = int(ow * sc), int(oh * sc)
    cols = 4
    rows_l = (len(tiles) + cols - 1) // cols
    ovs = list(o.e['overlays'].items())
    crop_rows = []
    for name, ov in ovs:
        s = o.S[ov['sprite']]
        frs = [o.F.frame(s['atlas'], f) for f in s['frames']]
        bb = None
        for f in frs:
            b = f.getbbox()
            if b:
                bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
        crop_rows.append((name, ov, [f.crop(bb) for f in frs], bb))
    ov_h = 30 + sum(max(70, (r[3][3] - r[3][1]) * 3 + 26) for r in crop_rows)
    out = Image.new('RGBA', (tw * cols + 20, 40 + rows_l * (th + 26) + ov_h), (226, 232, 240, 255))
    title_bar(out, 'chief_office layers (half size, own frame + shared anchor) and overlays (3x)')
    for i, (t, im, dark) in enumerate(tiles):
        x, y = 10 + (i % cols) * tw, 44 + (i // cols) * (th + 26)
        bgc = (70, 80, 112, 255) if dark else (250, 251, 253, 255)
        cell = Image.new('RGBA', (ow, oh), bgc)
        cell.alpha_composite(im)
        d = ImageDraw.Draw(cell)
        d.line([o.ax - 8, o.ay, o.ax + 8, o.ay], fill=(255, 0, 80, 255), width=3)
        d.line([o.ax, o.ay - 8, o.ax, o.ay + 8], fill=(255, 0, 80, 255), width=3)
        out.alpha_composite(cell.resize((tw - 6, th - 6), Image.LANCZOS), (x, y))
        label(out, t, x + tw // 2, y + th - 6, size=13)
    y = 44 + rows_l * (th + 26) + 10
    for name, ov, frs, bb in crop_rows:
        s = o.S[ov['sprite']]
        x = 14
        info = '%s  %d fr  %s  d%+.2f' % (ov['sprite'], len(frs), ','.join(s.get('anims', {}).keys()) or
                                           ','.join(s.get('states', {}).keys()), s['depthOffset'])
        label(out, info, x, y + 4, size=13, center=False)
        x = 360
        for f in frs:
            big = f.resize((f.width * 3, f.height * 3), Image.LANCZOS)
            cell = Image.new('RGBA', big.size, (250, 251, 253, 255))
            cell.alpha_composite(big)
            out.alpha_composite(cell, (x, y))
            x += big.width + 10
        y += max(70, (bb[3] - bb[1]) * 3 + 26)
    save_rgb(out, os.path.join(prev, 'off_office_layers.png'))


def preview_points(o, St, prev):
    ppl = St.at_points(o)
    cv, (ox, oy) = compose(o, 'bare', ppl, pad=(60, 40, 60, 60))
    S = 2
    big = cv.resize((cv.width * S, cv.height * S), Image.LANCZOS)
    d = ImageDraw.Draw(big, 'RGBA')
    ax, ay = (ox + o.ax) * S, (oy + o.ay) * S
    e = o.e

    def P(p):
        return (ax + p[0] * S, ay + p[1] * S)
    d.polygon([P(p) for p in e['footprintPoly']], outline=(255, 60, 60, 200))
    d.polygon([P(p) for p in e['walkPoly']], outline=(40, 170, 90, 255), fill=(40, 170, 90, 30))
    d.polygon([P(p) for p in e['revealPoly']], outline=(120, 80, 220, 200))
    for cx, cy, r in e['wallCircles']:
        x, y = P((cx, cy))
        d.ellipse([x - r * S, y - r * S / 2, x + r * S, y + r * S / 2], outline=(240, 120, 30, 230), width=2)
        R = r + 16
        d.ellipse([x - R * S, y - R * S / 2, x + R * S, y + R * S / 2], outline=(240, 120, 30, 90), width=1)
    f = pp.font(12)

    def mark(p, t, col=(220, 30, 60)):
        x, y = P(p)
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col + (255,), outline=(255, 255, 255, 255))
        tw = f.getlength(t)
        d.rounded_rectangle([x + 7, y - 9, x + 13 + tw, y + 7], radius=4, fill=(255, 255, 255, 215))
        d.text((x + 10, y - 8), t, fill=col, font=f)
    for k, fld in (('door', 'doorPoint'), ('entry', 'entryPoint'), ('chief seat', 'chiefDeskPoint'),
                   ('chief pad', 'chiefDeskPad'), ('board', 'boardPoint'), ('cabinet', 'cabinetPoint'),
                   ('mail shelf', 'mailShelfPoint'), ('safe', 'safePoint'), ('stove', 'stovePoint'),
                   ('mailbox stand', 'mailboxPoint')):
        mark(e[fld], k)
    for pt, r, dd in zip(e['deskPoints'], e['deskRoles'], e['deskDirs']):
        mark(pt, 'desk %s %s' % (r, dd), (30, 90, 200))
    for k, pt in enumerate(e['seatPoints']):
        mark(pt, 'seat %d' % k, (30, 90, 200))
    fx = e['fxPoints']
    for k, v in fx.items():
        vs = v if isinstance(v[0], list) else [v]
        for j, p in enumerate(vs):
            mark(p, 'fx %s%s' % (k, (' %d' % j) if len(vs) > 1 else ''), (200, 120, 0))
    mark(e['outdoorProps'][0]['point'], 'mailbox', (120, 60, 160))
    for nm in ('boardRect', 'signRect'):
        r = e[nm]
        x, y = P(r['point'])
        w, h = r['widthPx'] * S, r['heightPx'] * S
        sh = r['shearY']
        pts = [(x - w / 2, y - h / 2 - sh * w / 2), (x + w / 2, y - h / 2 + sh * w / 2),
               (x + w / 2, y + h / 2 + sh * w / 2), (x - w / 2, y + h / 2 - sh * w / 2)]
        d.polygon(pts, outline=(0, 160, 200, 255))
    d.line([ax - 10, ay, ax + 10, ay], fill=(0, 0, 0, 255), width=2)
    d.line([ax, ay - 10, ax, ay + 10], fill=(0, 0, 0, 255), width=2)
    out = Image.new('RGBA', (big.width, big.height + 40), (226, 232, 240, 255))
    out.alpha_composite(big, (0, 40))
    title_bar(out, 'chief_office points (2x, bare state, a real person on every work spot): green walkPoly, orange '
                   'wallCircles (+ dashed: agent radius 16 px), violet revealPoly, red footprint, cyan boardRect / '
                   'signRect')
    save_rgb(out, os.path.join(prev, 'off_office_points.png'))


def preview_items(o, prev):
    keys = ['item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l', 'item_letter_bundle',
            'item_newspaper_bundle', 'item_ledger']
    ref = [('life2', 'item_letter'), ('props', 'item_coin'), ('logistics', 'item_toolbox')]
    refs = []
    for fr, k in ref:
        F = Frag(fr)
        im, an = F.sprite(k)
        if im is not None:
            refs.append((k + ' (existing)', im))
    mb = [o.sprite('office_mailbox', f)[0] for f in o.S['office_mailbox']['anims']['pop']['frames']]
    mb = [o.sprite('office_mailbox')[0]] + mb
    rows = [('day 3x', SNOW, False, 3), ('night 3x', SNOW, True, 3), ('1x (game size)', SNOW, False, 1)]
    cellw3, cellh3 = 72 * 3, 72 * 3
    mbw, mbh = mb[0].size
    W = (len(keys) + len(refs)) * (cellw3 + 8) + 4 * (mbw * 2 + 8) + 40
    H = 40 + sum((cellh3 if s == 3 else 100) + 30 for _, _, _, s in rows)
    out = Image.new('RGBA', (W, H), (226, 232, 240, 255))
    title_bar(out, 'office_items (72 x 72, anchor [0.5, 0.86] = red tick) + office_mailbox (down, pop x3) - '
                   'existing items for scale')
    y = 44
    for name, bg, nt, s in rows:
        x = 10
        allk = [(k, o.sprite(k)[0]) for k in keys] + refs
        for k, im in allk:
            cell = Image.new('RGBA', (72, 72), bg)
            cell.alpha_composite(im)
            if s == 3:
                dd = ImageDraw.Draw(cell)
                anc = o.S[k]['anchor'] if k in o.S else [0.5, 0.75]
                dd.line([33, int(anc[1] * 72), 39, int(anc[1] * 72)], fill=(255, 0, 60, 255))
            if nt:
                cell = night(cell)
            cell = cell.resize((72 * s, 72 * s), Image.LANCZOS)
            out.alpha_composite(cell, (x, y))
            if s == 3:
                label(out, k.replace('item_', ''), x + 72 * s // 2, y + 72 * s + 4, size=12)
            x += (cellw3 + 8) if s == 3 else 80
        x = max(x, 10 + (len(allk)) * (cellw3 + 8)) if s == 3 else x + 20
        for im in mb:
            ms = 2 if s == 3 else 1
            cell = Image.new('RGBA', im.size, bg)
            cell.alpha_composite(im)
            if nt:
                cell = night(cell)
            cell = cell.resize((im.width * ms, im.height * ms), Image.LANCZOS)
            out.alpha_composite(cell, (x, y))
            x += cell.width + 8
        label(out, name, W - 90, y + 6, size=13)
        y += (cellh3 if s == 3 else 100) + 30
    save_rgb(out, os.path.join(prev, 'off_items.png'))


def preview_scene(o, St, prev):
    """1x town corner: the town hall, the bank (civic), the post-office stand-in and the new office."""
    town, civ = Frag('town'), Frag('civic')
    W, H = 2320, 900
    cv = Image.new('RGBA', (W, H), SNOW)
    placed = []

    def add(F, key, x, y, lab):
        im, an = F.sprite(key)
        if im is None:
            return
        placed.append((y, im, an, x, lab))
    add(town, 'town_hall', 330, 640, '마을회관 town_hall')
    add(town, 'post_office', 860, 660, 'post_office (code stand-in)')
    add(civ, 'bank', 1360, 650, '은행 bank (civic cutaway)')
    oc, (ox, oy) = compose(o, 'closed', St.cast(o, 0), pad=(0, 0, 0, 0), bg=(0, 0, 0, 0))
    placed.append((660, oc, (o.ax, o.ay), 1940, '촌장 사무실 chief_office (new)'))
    for y, im, an, x, lab in sorted(placed, key=lambda q: q[0]):
        cv.alpha_composite(im, (int(round(x - an[0])), int(round(y - an[1]))))
    for y, im, an, x, lab in placed:
        label(cv, lab, x, y + 110, size=15)
    out = Image.new('RGBA', (W, H + 40), (226, 232, 240, 255))
    out.alpha_composite(cv, (0, 40))
    title_bar(out, '1x scale next to the existing civic buildings (closed look, day)')
    save_rgb(out, os.path.join(prev, 'off_scene.png'))


def gif_reveal(o, St, prev):
    frames, durs = [], []
    seq = ([('closed', 1.0, 0.0)] + [(None, 1.0 - k / 6 * 0.88, k / 6) for k in range(1, 7)] +
           [('open', 0.12, 1.0)] * 6 + [(None, 0.12 + k / 6 * 0.88, 1.0 - k / 6) for k in range(1, 7)])
    hold = {0: 900, 7: 260, 12: 900}
    for i, (st, sa, ca) in enumerate(seq):
        cv, _ = compose(o, 'open' if st is None else st, St.cast(o, i), ovl={'typewriter_a': i % 4,
                                                                            'typewriter_b': (i + 2) % 4,
                                                                            'stove': i % 4, 'phone': i % 2},
                        shell_alpha=sa, cut_alpha=ca)
        frames.append(cv)
        durs.append(hold.get(i, 150 if 7 <= i <= 12 else 60))
    save_gif(frames, os.path.join(prev, 'off_reveal.gif'), durations=durs)


def gif_anims(o, St, prev):
    cast = St.cast(o, 0, full=False)
    frames = []
    n = 40                                           # 4 s at 10 fps
    base = None
    for k in range(n):
        t = k / 10.0
        ov = {'typewriter_a': int(t * 10) % 4 if (t % 2.0) < 1.4 else 0,
              'typewriter_b': int(t * 10 + 2) % 4 if (t % 1.6) < 1.0 else 0,
              'phone': int(t * 8) % 2 if t > 2.0 else 0,
              'stove': int(t * 6) % 4,
              'lamp_a': 1 if 1.0 < t < 3.0 else 0, 'lamp_b': 1 if t > 3.0 else 0,
              'safe': 1 if 1.5 < t < 3.5 else 0}
        cv, (ox, oy) = compose(o, 'open', cast, ovl=ov, pad=(0, 0, 0, 0))
        if base is None:
            xs, ys = [], []
            for name in o.e['overlays']:
                s = o.S[o.e['overlays'][name]['sprite']]
                for f in s['frames']:
                    b = o.F.frame(s['atlas'], f).getbbox()
                    if b:
                        xs += [b[0], b[2]]
                        ys += [b[1], b[3]]
            base = (max(0, min(xs) - 30), max(0, min(ys) - 40), min(o.W, max(xs) + 30), min(o.H, max(ys) + 30))
        c = cv.crop(base)
        frames.append(c.resize((c.width * 2, c.height * 2), Image.LANCZOS))
    save_gif(frames, os.path.join(prev, 'off_anims.gif'), fps=10)


def gif_mailbox(o, St, prev):
    s = o.S['office_mailbox']
    seq = [(s['frame'], 600)] + [(f, int(1000 / 12)) for f in s['anims']['pop']['frames']] + \
          [(s['anims']['flag']['frames'][-1], 1200)] + [(s['frame'], 600)]
    frames, durs = [], []
    for f, d in seq:
        im, an = o.sprite('office_mailbox', f)
        cv = Image.new('RGBA', (im.width + 80, im.height + 60), SNOW)
        pim, pan = St.person(St.P['postal'], 'idle', 'NE', 0)
        pim, pan = St.item_on_head(o, 'item_letter_bundle', pim, pan)
        cv.alpha_composite(im, (60, 50))
        mx, my = 60 + an[0], 50 + an[1]
        put(cv, pim, pan, mx - 30, my + 22)
        frames.append(cv.resize((cv.width * 3, cv.height * 3), Image.LANCZOS))
        durs.append(d)
    save_gif(frames, os.path.join(prev, 'off_mailbox.gif'), durations=durs)


def gif_night(o, St, prev):
    cast = St.cast(o, 0)
    frames, durs = [], []
    day, _ = compose(o, 'closed', cast)
    nt, _ = compose(o, 'closed', cast, night_on=True)
    for k in range(9):
        a = k / 8.0
        frames.append(Image.blend(day.convert('RGBA'), nt.convert('RGBA'), a))
        durs.append(900 if k in (0, 8) else 110)
    save_gif(frames, os.path.join(prev, 'off_night.gif'), durations=durs)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    out = os.path.join(ASSETS, 'office')
    prev = os.path.join(GAME, 'docs', 'previews')
    i = 0
    while i < len(argv):
        if argv[i] == '--out':
            out = argv[i + 1]
            i += 1
        elif argv[i] == '--prev':
            prev = argv[i + 1]
            i += 1
        i += 1
    os.makedirs(prev, exist_ok=True)
    o = Office(out)
    St = Staff()
    preview_states(o, St, prev)
    preview_layers(o, prev)
    preview_points(o, St, prev)
    preview_items(o, prev)
    preview_scene(o, St, prev)
    gif_reveal(o, St, prev)
    gif_anims(o, St, prev)
    gif_mailbox(o, St, prev)
    gif_night(o, St, prev)
    print('[preview] wrote off_* previews to %s' % prev)


if __name__ == '__main__':
    main()
