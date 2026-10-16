"""
ch2_preview.py - labelled previews for the v4.2 chief anims (CONTRACT_V42 AH), from the PACKED files only.

    python3 tools/blender/ch2_preview.py          # after ch2_pack.py

Writes docs/previews/:
  chief2_sheet.png        every anim x dir x frame (2x), seat line / anchor / impact point marked
  chief2_<anim>.gif       one per anim: the existing char_player idle S + walk SE next to the new anim in
                          S, SE, E and the mirrored SW (seated anims: on a mock chair + desk, and bare)
  chief2_desk.gif         the 관망 office routine at a mock desk, facing SW like the office's chiefDeskDir:
                          sit_idle -> sit_read (in + loop) -> sit_write -> sit_eat -> doze, 2x and 1x
  chief2_lineup.png       game scale (1x) + 3x: the old idle next to one frame of every new anim on snow

The chair / desk mock is drawn with the same iso projection as bl_common (yaw 45, elevation 30, PPU 64):
a 0.45 m chair behind him and a desk whose top is 0.72 m high with its near edge 0.10 m in front of the seat
front, drawn OVER him like the office's _interior_front layer - so the preview shows what the game will show.
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import ch2_anim as ca      # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
PREV = os.path.join(GAME, 'docs', 'previews')
BG = (201, 214, 232, 255)
SNOW = (236, 241, 248, 255)
LABEL = (43, 47, 58, 255)
ANCHOR = (64, 104)
PPU = 64
DIR_YAW = {'S': 45.0, 'SE': 90.0, 'E': 135.0}
CAM = (0.6124, -0.6124, 0.5)              # unit vector toward the camera (bl_common setup_camera)


def font(size):
    for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


F11, F13, F16 = font(11), font(13), font(16)


# --------------------------------------------------------------------------- atlases

class Atlas:
    def __init__(self, png, js):
        self.img = Image.open(png).convert('RGBA')
        with open(js) as f:
            self.fr = json.load(f)['frames']
        self.cache = {}

    def get(self, name):
        if name in self.cache:
            return self.cache[name]
        e = self.fr[name]
        f, ss, src = e['frame'], e['spriteSourceSize'], e['sourceSize']
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(self.img.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (ss['x'], ss['y']))
        self.cache[name] = full
        return full


def new_atlas():
    return Atlas(os.path.join(ASSETS, 'chief2', 'char_player_b.png'), os.path.join(ASSETS, 'chief2', 'char_player_b.json'))


def old_atlas():
    return Atlas(os.path.join(ASSETS, 'characters', 'char_player.png'),
                 os.path.join(ASSETS, 'characters', 'char_player.json'))


def frame(at, anim, d, i, suffix=''):
    """Frame for a possibly mirrored dir (SW <- SE, W <- E); suffix '_desk' = the desk overlay frame."""
    src = {'SW': 'SE', 'W': 'E'}.get(d, d)
    im = at.get(f'{anim}_{src}_{i}{suffix}')
    return im.transpose(Image.FLIP_LEFT_RIGHT) if src != d else im


# --------------------------------------------------------------------------- iso mock furniture

def proj(p, yaw_deg, mirror=False):
    """Root-local point (m, seat point = origin) -> px offset from the anchor (bl_common.world_to_pixel)."""
    x, y, z = p
    a = math.radians(yaw_deg)
    wx, wy = x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)
    c45 = math.cos(math.radians(45))
    sx = (wx + wy) * c45
    sg = (-wx + wy) * c45
    up = sg * 0.5 + z * math.cos(math.radians(30))
    dx = sx * PPU
    return (-dx if mirror else dx, -up * PPU)


def box_faces(x0, x1, y0, y1, z0, z1, yaw, mirror):
    """Visible faces of a root-local box, back to front: [(poly px, shade)]."""
    a = math.radians(yaw)
    faces = [((0, 0, 1), [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], 'top'),
             ((0, -1, 0), [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], 'front'),
             ((0, 1, 0), [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], 'back'),
             ((-1, 0, 0), [(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], 'side'),
             ((1, 0, 0), [(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], 'side')]
    out = []
    for n, pts, kind in faces:
        wn = (n[0] * math.cos(a) - n[1] * math.sin(a), n[0] * math.sin(a) + n[1] * math.cos(a), n[2])
        if wn[0] * CAM[0] + wn[1] * CAM[1] + wn[2] * CAM[2] <= 1e-6:
            continue
        out.append(([proj(p, yaw, mirror) for p in pts], kind))
    return out


DESK = {'top': (183, 128, 80, 255), 'front': (138, 90, 53, 255), 'side': (118, 76, 44, 255),
        'back': (118, 76, 44, 255)}
CHAIR = {'top': (178, 64, 54, 255), 'front': (140, 46, 40, 255), 'side': (120, 38, 34, 255),
         'back': (150, 52, 46, 255)}
LINE = (58, 40, 34, 255)


def draw_boxes(img, ox, oy, z, boxes, yaw, mirror, pal):
    d = ImageDraw.Draw(img)
    for b in boxes:
        for pts, kind in box_faces(*b, yaw, mirror):
            poly = [(ox + px * z, oy + py * z) for px, py in pts]
            d.polygon(poly, fill=pal[kind], outline=LINE)


def chair_boxes():
    return [(-0.22, 0.22, 0.0, 0.40, -0.45, 0.0),            # seat block (seat front at y = 0)
            (-0.22, 0.22, 0.36, 0.42, 0.0, 0.46)]            # chair back


def desk_boxes():
    t, e = ca.DESK_TOP, ca.DESK_EDGE
    return [(-0.46, 0.46, -0.66, -e, -0.45, t - 0.04),       # body
            (-0.50, 0.50, -0.70, -e + 0.02, t - 0.04, t)]    # top board (slight overhang)


def seated_scene(spr, d, z=2, desk=True, chair=True, w=96, h=128, top=None):
    """Character frame (already mirrored for SW / W) on the mock chair + desk, `z` x, cell w x h (1x px).
    top = the `_desk` overlay frame, drawn over the desk (what the game should do)."""
    mirror = d in ('SW', 'W')
    yaw = DIR_YAW[{'SW': 'SE', 'W': 'E'}.get(d, d)]
    cell = Image.new('RGBA', (w * z, h * z), (0, 0, 0, 0))
    ox, oy = (w // 2) * z, (h - 24 - 25) * z            # seat point 25 px above the standing cells' ground line
    # shadow on the floor under the seat
    gx, gy = proj((0, 0.1, -ca.SEAT_H), yaw, mirror)
    sh = ImageDraw.Draw(cell)
    sh.ellipse([ox + (gx - 22) * z, oy + (gy - 8) * z, ox + (gx + 22) * z, oy + (gy + 8) * z], fill=(90, 110, 140, 60))
    if chair:
        draw_boxes(cell, ox, oy, z, chair_boxes(), yaw, mirror, CHAIR)
    c = spr.resize((128 * z, 128 * z), Image.NEAREST)
    cell.alpha_composite(c, (ox - ANCHOR[0] * z, oy - ANCHOR[1] * z))
    if desk:
        draw_boxes(cell, ox, oy, z, desk_boxes(), yaw, mirror, DESK)
        if top is not None:
            cell.alpha_composite(top.resize((128 * z, 128 * z), Image.NEAREST), (ox - ANCHOR[0] * z, oy - ANCHOR[1] * z))
    return cell


def desk_top(at, an, d, i):
    return frame(at, an, d, i, '_desk') if an in ca.DESK_OVERLAY else None


def standing_cell(spr, z=2, w=112, h=128):
    cell = Image.new('RGBA', (w * z, h * z), (0, 0, 0, 0))
    ox, oy = (w // 2) * z, (h - 24) * z
    ImageDraw.Draw(cell).ellipse([ox - 23 * z, oy - 9 * z, ox + 23 * z, oy + 9 * z], fill=(90, 110, 140, 70))
    cell.alpha_composite(spr.resize((128 * z, 128 * z), Image.NEAREST), (ox - ANCHOR[0] * z, oy - ANCHOR[1] * z))
    return cell


# --------------------------------------------------------------------------- previews

def sheet(at, path, z=2):
    rows = [(an, d) for an in ca.ORDER for d in ca.DIRS]
    cw, chh, lab = 104, 118, 150
    W = lab + 8 * cw * z
    H = 34 + len(rows) * chh * z
    img = Image.new('RGBA', (W, H), BG)
    dr = ImageDraw.Draw(img)
    dr.text((8, 8), 'chief2 / player_b (extends player) - every anim x dir x frame, 2x.  red line = anchor '
                    '(feet / SEAT POINT for seated anims), gold cross = sit_write impactPoint, blue line = the '
                    'player idle head top (-81)', fill=LABEL, font=F13)
    for r, (an, d) in enumerate(rows):
        info = ca.ANIMS[an]
        y = 34 + r * chh * z
        if r % 3 == 0:
            dr.rectangle([0, y, W, y + 3 * chh * z - 1], fill=(206, 218, 235, 255) if (r // 3) % 2 else BG)
        txt = f'{an}  {d}\n{info["frames"]} f  {info["fps"]} fps' + ('\nseated' if info.get('seated') else '') + \
              (f'\nloop from {info["loopFrom"]}' if 'loopFrom' in info else '')
        dr.multiline_text((8, y + 70), txt, fill=LABEL, font=F13)
        for i in range(info['frames']):
            im = at.get(f'{an}_{d}_{i}').crop((12, 4, 12 + cw, 4 + chh)).resize((cw * z, chh * z), Image.NEAREST)
            x = lab + i * cw * z
            ay = y + (ANCHOR[1] - 4) * z
            dr.line([x + 6, ay, x + cw * z - 6, ay], fill=(200, 80, 70, 255), width=1)
            if not info.get('seated'):
                hy = ay - 81 * z
                dr.line([x + 6, hy, x + cw * z - 6, hy], fill=(90, 130, 200, 255), width=1)
            img.alpha_composite(im, (x, y))
            if an == 'sit_write' and i == info['impactFrame']:
                ip = man_impact()[d]
                cx, cy = x + (ANCHOR[0] - 12 + ip[0]) * z, ay + ip[1] * z
                dr.line([cx - 6, cy, cx + 6, cy], fill=(255, 196, 40, 255), width=2)
                dr.line([cx, cy - 6, cx, cy + 6], fill=(255, 196, 40, 255), width=2)
            dr.text((x + 4, y + 4), str(i), fill=(90, 96, 110, 255), font=F11)
    img.convert('RGB').save(path, optimize=True)


_MAN = None


def manifest():
    global _MAN
    if _MAN is None:
        with open(os.path.join(ASSETS, 'chief2', 'manifest.json')) as f:
            _MAN = json.load(f)
    return _MAN


def man_impact():
    return manifest()['characters']['player_b']['anims']['sit_write']['impactPoint']


OLD = {'idle': (4, 6), 'walk': (8, 12)}


def timeline(an, loops=1, intro=True):
    """[(frame, ms)] the way the game plays `an` with the manifest's hints: sit_read = the sit_read_in alias once,
    then the sit_read_loop alias (frames 2-5); doze frameHold and cheer repeatDelay (polish L3)."""
    e = manifest()['characters']['player_b']['anims'][an]
    n, fps = e['frames'], e['fps']
    hold = {int(k): v for k, v in e.get('frameHold', {}).items()}
    lf = e.get('loopFrom', 0)
    seq = [(i, 1000 / fps) for i in range(lf)] if intro else []
    for _ in range(loops):
        for i in range(lf, n):
            seq.append((i, 1000 / fps + hold.get(i, 0)))
        if e.get('repeatDelay'):
            seq[-1] = (seq[-1][0], seq[-1][1] + e['repeatDelay'])
    return seq


def frame_at(seq, t_ms):
    """frame of a looping timeline at time t (the intro part plays once)."""
    total = sum(ms for _, ms in seq)
    t = t_ms % total if total else 0
    for i, ms in seq:
        if t < ms:
            return i
        t -= ms
    return seq[-1][0]


def anim_gif(at, old, an, path, z=2, secs=None):
    """The existing idle S + walk SE next to the new anim in S / SE / E / SW (seated: on the mock furniture +
    bare).  All panels run on one 20 fps clock with their own fps."""
    info = ca.ANIMS[an]
    n, fps = info['frames'], info['fps']
    e = manifest()['characters']['player_b']['anims'][an]
    loop = timeline(an, 1, intro=False)
    loop_ms = sum(ms for _, ms in loop)
    intro_ms = 1000 / fps * e.get('loopFrom', 0)
    secs = secs or max(2.0, min(6.0, (intro_ms + 2 * loop_ms) / 1000))
    ticks = int(round(secs * 20))
    cw, chh = 112, 128
    seated = info.get('seated')
    panels = [('player idle S (old)', 'old', 'idle', 'S'), ('player walk SE (old)', 'old', 'walk', 'SE')]
    for d in ('S', 'SE', 'E', 'SW'):
        panels.append((f'{an} {d}' + (' (flip SE)' if d == 'SW' else ''), 'new', an, d))
    rows = 2 if seated else 1
    W, H = len(panels) * cw * z, 26 + rows * chh * z
    out = []
    for t in range(ticks):
        img = Image.new('RGBA', (W, H), BG)
        dr = ImageDraw.Draw(img)
        dr.rectangle([0, 26 + (chh - 30) * z, W, H], fill=SNOW)
        if e.get('repeatDelay') or e.get('frameHold') or e.get('loopFrom'):
            note = ('sit_read_in once, then sit_read_loop' if e.get('loopFrom') else
                    f'repeatDelay {e["repeatDelay"]} ms' if e.get('repeatDelay') else
                    f'frameHold {e["frameHold"]} ms')
            dr.text((W - 330, H - 16), 'paced as the manifest suggests: ' + note, fill=(90, 96, 110, 255), font=F11)
        for c, (lab, src, a, d) in enumerate(panels):
            x = c * cw * z
            if src == 'old':
                on, ofps = OLD[a]
                spr = frame(old, a, d, int(t / 20 * ofps) % on)
                cell = standing_cell(spr, z, w=cw)
                img.alpha_composite(cell, (x, 26))
                if seated:
                    img.alpha_composite(cell, (x, 26 + chh * z))
            else:
                ms = t * 50
                if ms < intro_ms:
                    i = int(ms / (1000 / fps))
                else:
                    i = frame_at(loop, ms - intro_ms)
                spr = frame(at, a, d, i)
                if seated:
                    img.alpha_composite(seated_scene(spr, d, z, w=cw, top=desk_top(at, a, d, i)), (x, 26))
                    img.alpha_composite(seated_scene(spr, d, z, w=cw, desk=False, chair=False), (x, 26 + chh * z))
                else:
                    img.alpha_composite(standing_cell(spr, z), (x, 26))
            dr.text((x + 6, 6), lab, fill=LABEL, font=F11)
            if c == 1:
                dr.line([x + cw * z - 1, 0, x + cw * z - 1, H], fill=(150, 160, 180, 255), width=2)
        if seated:
            dr.text((2 * cw * z + 6, 26 + chh * z + 4), 'bare frames (no chair / desk)', fill=(90, 96, 110, 255),
                    font=F11)
        out.append(img.convert('RGB'))
    pal = out[len(out) // 2].quantize(colors=200, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    q[0].save(path, save_all=True, append_images=q[1:], duration=50, loop=0, optimize=True, disposal=1)


def desk_gif(at, path):
    """관망 office routine at the mock desk, facing SW (= flipped SE, the office chiefDeskDir), 2x + 1x."""
    seq = []

    def play(an, loops=1, intro=False):
        for i, ms in timeline(an, loops, intro=True):
            seq.append((an, i, ms))
    play('sit_idle', 2)
    play('sit_read', 3, intro=True)
    play('sit_write', 2)
    play('sit_eat', 2)
    play('doze', 2)
    play('sit_idle', 1)
    out, durs = [], []
    for an, i, ms in seq:
        img = Image.new('RGBA', (96 * 2 + 96 + 24, 26 + 128 * 2), BG)
        dr = ImageDraw.Draw(img)
        dr.rectangle([0, 26 + 128 * 2 - 70, img.width, img.height], fill=(222, 206, 178, 255))
        big = seated_scene(frame(at, an, 'SW', i), 'SW', 2, top=desk_top(at, an, 'SW', i))
        img.alpha_composite(big, (0, 26))
        small = seated_scene(frame(at, an, 'SW', i), 'SW', 1, top=desk_top(at, an, 'SW', i))
        img.alpha_composite(small, (96 * 2 + 12, 26 + 128 * 2 - 128 - 10))
        dr.text((6, 6), f'office desk (SW): {an} {i}', fill=LABEL, font=F13)
        dr.text((96 * 2 + 14, 26 + 128 * 2 - 150), '1x', fill=LABEL, font=F11)
        out.append(img.convert('RGB'))
        durs.append(int(ms))
    pal = out[0].quantize(colors=200, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True, disposal=1)


def office_gif(at, path, z=3):
    """The chief at the REAL office desk (assets/office, chiefDeskPoint, facing SW) in the office draw order:
    left = the full frame in @behind only (layers as they are), right = + the `_desk` overlay drawn right over
    chief_office_interior_front (recommended)."""
    mp = os.path.join(ASSETS, 'office', 'manifest.json')
    if not os.path.exists(mp):
        print('  (no assets/office - office preview skipped)')
        return False
    with open(mp) as f:
        om = json.load(f)
    sp = om['sprites']
    co = sp['chief_office']
    oat = Atlas(os.path.join(ASSETS, 'office', 'office_bld.png'), os.path.join(ASSETS, 'office', 'office_bld.json'))
    fw, fh = co['frameSize']
    ax, ay = co['anchor'][0] * fw, co['anchor'][1] * fh
    px, py = co['chiefDeskPoint']
    d = co.get('chiefDeskDir', 'SW')
    cx, cy = int(ax + px), int(ay + py)
    box = (cx - 64, cy - 92, cx + 56, cy + 34)
    layers = [k for k in co['drawOrder'] if k not in ('chief_office_shell', 'chief_office_glow')]
    base = {}
    seq = []
    for an, loops in (('sit_idle', 2), ('sit_read', 3), ('sit_write', 2), ('sit_eat', 2), ('doze', 2)):
        seq += [(an, i, int(ms)) for i, ms in timeline(an, loops)]
    out, durs = [], []
    for an, i, ms in seq:
        panels = []
        for with_top in (False, True):
            canvas = Image.new('RGBA', (fw, fh), SNOW)
            for layer in layers:
                if layer == '@behind':
                    canvas.alpha_composite(frame(at, an, d, i), (cx - ANCHOR[0], cy - ANCHOR[1]))
                    continue
                if layer.startswith('@'):
                    continue
                s_ = sp.get(layer)
                if not s_:
                    continue
                if layer not in base:
                    base[layer] = oat.get(s_['frame'])
                canvas.alpha_composite(base[layer])
                if with_top and layer == 'chief_office_interior_front' and an in ca.DESK_OVERLAY:
                    canvas.alpha_composite(frame(at, an, d, i, '_desk'), (cx - ANCHOR[0], cy - ANCHOR[1]))
            c = canvas.crop(box)
            panels.append(c.resize((c.width * z, c.height * z), Image.NEAREST))
        W = panels[0].width * 2 + 8
        img = Image.new('RGBA', (W, panels[0].height + 24), BG)
        img.alpha_composite(panels[0], (0, 24))
        img.alpha_composite(panels[1], (panels[0].width + 8, 24))
        dr = ImageDraw.Draw(img)
        dr.text((6, 5), f'office layers only: {an} {i}', fill=LABEL, font=F13)
        dr.text((panels[0].width + 14, 5), f'+ _desk overlay over the desk: {an} {i}', fill=LABEL, font=F13)
        out.append(img.convert('RGB'))
        durs.append(ms)
    pal = out[len(out) // 3].quantize(colors=220, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    q[0].save(path, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=True, disposal=1)
    # a still of the key poses (with the overlay)
    return True


def lineup(at, old, path):
    picks = [('old idle', 'old', 'idle', 0), ('sit_idle', 'new', 'sit_idle', 0), ('sit_write', 'new', 'sit_write', 4),
             ('sit_read', 'new', 'sit_read', 3), ('sit_eat', 'new', 'sit_eat', 3), ('doze', 'new', 'doze', 2),
             ('talk', 'new', 'talk', 0), ('wave', 'new', 'wave', 1), ('warm_hands', 'new', 'warm_hands', 1),
             ('cheer', 'new', 'cheer', 2)]
    cw, chh = 104, 128
    rows = []
    for z in (1, 3):
        for d in ('S', 'SE'):
            row = Image.new('RGBA', (len(picks) * cw * z, chh * z), SNOW)
            for c, (lab, src, an, i) in enumerate(picks):
                spr = frame(old if src == 'old' else at, an, d, i)
                seated = ca.ANIMS.get(an, {}).get('seated')
                cell = seated_scene(spr, d, z, w=cw, h=chh, top=desk_top(at, an, d, i) if src == 'new' else None) \
                    if seated else standing_cell(spr, z, w=cw, h=chh)
                row.alpha_composite(cell, (c * cw * z, 0))
            rows.append((f'{z}x {d}', row, [p[0] for p in picks], z))
    W = max(r[1].width for r in rows)
    H = sum(r[1].height + 22 for r in rows) + 30
    img = Image.new('RGBA', (W + 70, H), BG)
    dr = ImageDraw.Draw(img)
    dr.text((8, 8), 'game scale (1x, 64 px per metre) and 3x: the old player idle next to one frame of every new '
                    'anim (seated ones on the mock chair + desk)', fill=LABEL, font=F13)
    y = 30
    for lab, row, names, z in rows:
        dr.text((6, y + row.height // 2), lab, fill=LABEL, font=F13)
        img.alpha_composite(row, (70, y))
        for c, nm in enumerate(names):
            dr.text((70 + c * cw * z + 2, y + row.height + 4), nm, fill=LABEL, font=F11)
        y += row.height + 22
    img.convert('RGB').save(path, optimize=True)


def main():
    os.makedirs(PREV, exist_ok=True)
    at, old = new_atlas(), old_atlas()
    sheet(at, os.path.join(PREV, 'chief2_sheet.png'))
    for an in ca.ORDER:
        anim_gif(at, old, an, os.path.join(PREV, f'chief2_{an}.gif'))
    desk_gif(at, os.path.join(PREV, 'chief2_desk.gif'))
    office_gif(at, os.path.join(PREV, 'chief2_office.gif'))
    lineup(at, old, os.path.join(PREV, 'chief2_lineup.png'))
    print('previews:', ', '.join(sorted(n for n in os.listdir(PREV) if n.startswith('chief2_'))))


if __name__ == '__main__':
    main()
