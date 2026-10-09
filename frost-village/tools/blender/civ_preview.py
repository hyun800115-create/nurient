"""
civ_preview.py - previews of the packed civic set (assets/civic): reads ONLY the packed atlases + manifest (so the
previews prove what the game gets) plus existing fragments for context (town, buildings, vehicles, villagers,
townfolk, fx_city, logistics if present).  Called by civ_pack.py; can also be run alone:
    python3 tools/blender/civ_preview.py [--out assets/civic] [--prev docs/previews]

Writes docs/previews/:
  civ_all.png              every sprite (labelled), cutaways closed + open, vehicles in their key frames
  civ_bank_cutaway.png     bank: exploded layers + closed / revealing / open with people / vault open
  civ_police_cutaway.png   police station: layers + closed / open with officers, a visitor and a (cosy) prisoner
  civ_fire_sequence.png    one S plot: house -> fire -> ruin -> fence + excavator + dump truck -> rubble -> site -> new house
  civ_scene.png            a town corner at 1x (bank open, police station, wanted board, moving day, demolition)
  civ_vault.gif, civ_cell.gif, civ_reveal.gif, civ_excavator.gif, civ_dump_truck.gif, civ_ruin_smoke.gif,
  civ_alarm.gif, civ_fence_lamp.gif
"""
import json
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import prop_pack as pp   # noqa: E402  (font, shelf_preview)

ASSETS = os.path.join(GAME, 'assets')
PX_X, PX_Y = 45.2548, 22.6274
SNOW = (244, 247, 251, 255)


# --------------------------------------------------------------------------- readers

class Frag:
    """Untrimmed frame reader for a packed fragment (manifest + atlases)."""

    def __init__(self, rel):
        self.dir = rel if os.path.isabs(rel) else os.path.join(ASSETS, rel)
        p = os.path.join(self.dir, 'manifest.json')
        self.ok = os.path.exists(p)
        self.man = json.load(open(p, encoding='utf-8')) if self.ok else {}
        self.sheets = {}
        self.atl = {a['key']: a for a in self.man.get('atlases', [])}

    def sheet(self, akey):
        if akey not in self.sheets:
            a = self.atl.get(akey)
            if not a:
                self.sheets[akey] = None
            else:
                self.sheets[akey] = (Image.open(os.path.join(self.dir, os.path.basename(a['png']))).convert('RGBA'),
                                     json.load(open(os.path.join(self.dir, os.path.basename(a['json']))))['frames'])
        return self.sheets[akey]

    def frame(self, akey, name):
        s = self.sheet(akey)
        if not s or name not in s[1]:
            return None
        f = s[1][name]
        r = f['frame']
        crop = s[0].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        im.paste(crop, (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        return im

    def sprite(self, key, frame=None):
        s = self.man.get('sprites', {}).get(key)
        if not s:
            return None, None
        im = self.frame(s['atlas'], frame or s['frame'])
        if im is None:
            return None, None
        return im, (s['anchor'][0] * im.width, s['anchor'][1] * im.height)

    def char(self, key, anim, d, i, flip=False):
        c = self.man.get('characters', {}).get(key)
        if not c:
            return None, None
        m = c.get('mirror', {})
        dd = m.get(d, d)
        im = self.frame(c['atlas'], '%s_%s_%d' % (anim, dd, i))
        if im is None:
            return None, None
        if d in m or flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            ax = (1 - c['anchor'][0]) * im.width
        else:
            ax = c['anchor'][0] * im.width
        return im, (ax, c['anchor'][1] * im.height)

    def sheet_frame(self, key, i):
        """fx spritesheets (fx_city): frame i of spritesheet `key` + its anchor px."""
        for s in self.man.get('spritesheets', []):
            if s['key'] == key:
                im = Image.open(os.path.join(self.dir, os.path.basename(s['png']))).convert('RGBA')
                fw, fh = s['frameWidth'], s['frameHeight']
                cols = max(1, im.width // fw)
                i %= s.get('frameCount', cols)
                x, y = (i % cols) * fw, (i // cols) * fh
                fr = im.crop((x, y, x + fw, y + fh))
                an = s.get('anchor', [0.5, 0.5])
                return fr, (an[0] * fw, an[1] * fh)
        return None, None


def fade(img, a):
    arr = np.asarray(img).astype(np.float32)
    arr[..., 3] *= a
    return Image.fromarray(arr.astype(np.uint8), 'RGBA')


def ell_shadow(w, h, a=70):
    im = Image.new('RGBA', (w * 2, h * 2), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:h * 2, 0:w * 2]
    d = ((xx - w) / (w / 2.0)) ** 2 + ((yy - h) / (h / 2.0)) ** 2
    al = np.clip(1.0 - d, 0, 1) ** 1.5 * a
    arr = np.zeros((h * 2, w * 2, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2] = 38, 46, 82
    arr[..., 3] = al.astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


SHADOW = None


def put_char(canvas, im, anchor, x, y):
    """Paste a character / vehicle frame with its anchor at canvas pixel (x, y) + a soft ground ellipse."""
    global SHADOW
    if im is None:
        return
    if SHADOW is None:
        SHADOW = ell_shadow(24, 9)
    canvas.alpha_composite(SHADOW, (int(round(x - 24)), int(round(y - 9))))
    canvas.alpha_composite(im, (int(round(x - anchor[0])), int(round(y - anchor[1]))))


class People:
    """Townsfolk (assets/townfolk compositor) + villagers / clerks for the previews."""

    def __init__(self):
        self.tf = None
        try:
            import townfolk_compose as tc
            self.tf = tc.Townfolk.from_assets()
        except Exception as e:          # noqa: BLE001
            print('note: townfolk unavailable for previews (%s)' % e)
        self.cf = None
        try:
            import cityfolk_compose as cc
            if os.path.exists(os.path.join(ASSETS, 'cityfolk', 'manifest.json')):
                self.cf = cc.Cityfolk.from_assets() if hasattr(cc, 'Cityfolk') else None
        except Exception:               # noqa: BLE001
            self.cf = None
        self.v1 = Frag('villagers')
        self.v2 = Frag('villagers2')

    def person(self, preset=None, seed=0, anim='idle', d='S', i=0):
        for lib in (self.cf, self.tf):
            if lib is None:
                continue
            try:
                p = lib.preset(preset, seed=seed) if preset else lib.random_person(seed=seed)
                return lib.compose(p, anim, d, i), (64, 104)
            except Exception:           # noqa: BLE001
                continue
        return None, None

    def villager(self, key, anim='idle', d='S', i=0):
        for v in (self.v2, self.v1):
            im, an = v.char(key, anim, d, i)
            if im is not None:
                return im, an
        return None, None


# --------------------------------------------------------------------------- cutaway composer

def cutaway(P, key, t_open=1.0, people=(), overlay_i=None):
    """Compose a cutaway building: layers in drawOrder, people = [(slot, point [dx, dy], img, anchor)], shell faded by
    t_open (0 closed, 1 open).  overlay_i = {overlay sprite key: frame index}.  Returns (img, anchor px)."""
    s = P.man['sprites'][key]
    W, H = s['frameSize']
    ax, ay = s['anchor'][0] * W, s['anchor'][1] * H
    cv = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cut = s['cutaway']
    for item in cut['drawOrder']:
        if item.startswith('@'):
            slot = item[1:]
            for sl, pt, im, an in sorted([p for p in people if p[0] == slot], key=lambda p: p[1][1]):
                put_char(cv, im, an, ax + pt[0], ay + pt[1])
            continue
        e = P.man['sprites'].get(item)
        if not e:
            continue
        if item in cut['overlays']:
            an = cut['overlays'][item]['anims'][0]
            fr = e['anims'][an]['frames'][(overlay_i or {}).get(item, 0)]
            im = P.frame(e['atlas'], fr)
        else:
            im = P.frame(e['atlas'], e['frame'])
        if im is None:
            continue
        if e.get('layer') == 'shell_cut':
            if t_open <= 0:
                continue
            im = fade(im, min(1.0, t_open * 1.5))
        if e.get('layer') == 'shell':
            a = 1.0 - t_open * (1.0 - cut['fade']['openAlpha'])
            if a <= 0.01:
                continue
            im = fade(im, a)
        cv.alpha_composite(im)
    return cv, (ax, ay)


def bank_people(Pe, s):
    """Tellers, manager, customers in the queue, a sitter, an ATM user."""
    ppl = []
    tellers = ['npc_clerk_a', 'npc_clerk_b', 'npc_clerk_a']
    for k, pt in enumerate(s.get('staffPoints', [])[:3]):
        im, an = Pe.villager(tellers[k], 'talk' if k == 1 else 'idle', 'S', k % 2)
        ppl.append(('behind', pt, im, an))
    if len(s.get('staffPoints', [])) > 3:
        im, an = Pe.person('teacher', seed=3, d='SE')
        ppl.append(('behind', s['staffPoints'][3], im, an))
    # a calm opening hour: one customer at the first and the last window, one waiting in the queue, someone at
    # the ATM and grandma resting on the far chair (the game decides how busy it gets)
    cps = s.get('counterPoints', [])
    for k, pt in enumerate([cps[0], cps[-1]] if len(cps) > 1 else cps):
        im, an = Pe.person(None, seed=60 + k, d='NE')
        ppl.append(('front', pt, im, an))
    for k, pt in enumerate(s.get('customerPoints', [])[2:3]):
        im, an = Pe.person(None, seed=41 + k, d='NE', i=1)
        ppl.append(('front', pt, im, an))
    if s.get('atmPoint'):
        im, an = Pe.person(None, seed=77, d='NW')
        ppl.append(('front', s['atmPoint'], im, an))
    if s.get('seatPoints'):
        im, an = Pe.villager('npc_grandma', 'idle', 'SW', 0)
        pt = s['seatPoints'][-1]
        ppl.append(('front', [pt[0], pt[1] + 25], im, an))
    return ppl


def police_people(Pe, s):
    ppl = []
    sp = s.get('staffPoints', [])
    if sp:
        im, an = Pe.person('police', seed=5, anim='talk', d='S')
        ppl.append(('behind', sp[0], im, an))
    if len(sp) > 1:
        im, an = Pe.person('police', seed=8, d='SW')
        ppl.append(('behind', sp[1], im, an))
    cp = s.get('cellPoints', [])
    if cp:
        im, an = Pe.villager('npc_kid_prankster', 'sad', 'SE', 0)
        if im is None:
            im, an = Pe.person(None, seed=91, d='SE')
        ppl.append(('behind', cp[0], im, an))
    for k, pt in enumerate(s.get('customerPoints', [])[:1]):
        im, an = Pe.villager('npc_grandma', 'talk', 'NE', 0)
        if im is None:
            im, an = Pe.person(None, seed=20, d='NE')
        ppl.append(('front', pt, im, an))
    if s.get('seatPoints'):
        im, an = Pe.villager('npc_uncle', 'idle', 'SE', 0)
        pt = s['seatPoints'][0]
        ppl.append(('front', [pt[0], pt[1] + 25], im, an))
    return ppl


def label(img, text, x, y, size=14, center=True, bg=(255, 255, 255, 220)):
    d = ImageDraw.Draw(img)
    f = pp.font(size)
    tw = f.getlength(text)
    x0 = x - tw / 2 if center else x
    d.rounded_rectangle([x0 - 6, y - 3, x0 + tw + 6, y + size + 4], radius=7, fill=bg)
    d.text((x0, y), text, fill=(30, 34, 44), font=f)


def caption_bar(img, text, h=40):
    d = ImageDraw.Draw(img)
    d.rectangle([0, img.height - h, img.width, img.height], fill=(31, 95, 168, 255))
    d.text((16, img.height - h + 9), text, fill=(255, 255, 255), font=pp.font(17))


def save_rgb(img, path):
    img.convert('RGB').save(path, optimize=True)


def save_gif(frames, path, fps=8, bg=SNOW):
    out = []
    for f in frames:
        b = Image.new('RGBA', f.size, bg)
        b.alpha_composite(f)
        out.append(b.convert('RGB').quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    out[0].save(path, save_all=True, append_images=out[1:], duration=int(1000 / fps), loop=0, optimize=True)


# --------------------------------------------------------------------------- previews

def preview_cutaway(P, Pe, key, out, people_fn, title):
    s = P.man['sprites'][key]
    cut = s['cutaway']
    W, H = s['frameSize']
    lays = [k for k in cut['drawOrder'] if not k.startswith('@')]
    pad = 12
    # row 1: exploded layers (0.6x)
    sc = 0.6
    lw, lh = int(W * sc), int(H * sc)
    row1 = Image.new('RGBA', (len(lays) * (lw + pad) + pad, lh + 44), (226, 233, 242, 255))
    for k, lk in enumerate(lays):
        e = P.man['sprites'][lk]
        if lk in cut['overlays']:
            an = cut['overlays'][lk]['anims'][0]
            im = P.frame(e['atlas'], e['anims'][an]['frames'][0])
        else:
            im = P.frame(e['atlas'], e['frame'])
        cell = Image.new('RGBA', (W, H), (236, 241, 247, 255))
        cell.alpha_composite(im)
        cell = cell.resize((lw, lh), Image.LANCZOS)
        row1.alpha_composite(cell, (pad + k * (lw + pad), 6))
        label(row1, lk.replace(key + '_', '_'), pad + k * (lw + pad) + lw / 2, lh + 14, size=13)
    ppl = people_fn(Pe, s)
    ovk = list(cut['overlays'])
    last = {k: P.man['sprites'][k]['anims'][cut['overlays'][k]['anims'][0]]['frames'].__len__() - 1 for k in ovk}
    states = [('closed', cutaway(P, key, 0.0)[0]),
              ('revealing (shell 50%)', cutaway(P, key, 0.5, ppl)[0]),
              ('open + people in their slots', cutaway(P, key, 1.0, ppl)[0]),
              ('open, %s anim last frame' % ', '.join(k.replace(key + '_', '') for k in ovk),
               cutaway(P, key, 1.0, ppl, overlay_i=last)[0])]
    row2 = Image.new('RGBA', (len(states) * (W + pad) + pad, H + 40), SNOW)
    for k, (t, im) in enumerate(states):
        row2.alpha_composite(im, (pad + k * (W + pad), 0))
        label(row2, t, pad + k * (W + pad) + W / 2, H + 8, size=14)
        # revealPoly outline on the closed state
        if k == 0 and cut.get('revealPoly'):
            d = ImageDraw.Draw(row2)
            ax, ay = s['anchor'][0] * W + pad, s['anchor'][1] * H
            poly = [(ax + x, ay + y) for x, y in cut['revealPoly']]
            d.line(poly + [poly[0]], fill=(217, 72, 59, 255), width=2)
    Wt = max(row1.width, row2.width)
    sheet = Image.new('RGBA', (Wt, row1.height + row2.height + 50), SNOW)
    sheet.alpha_composite(row1, (0, 0))
    sheet.alpha_composite(row2, (0, row1.height))
    caption_bar(sheet, title)
    save_rgb(sheet, out)
    return states


def preview_all(P, out):
    ents = []
    sp = P.man['sprites']
    Pe = None
    for k, s in sp.items():
        if s.get('kind') in ('layer', 'overlay') or s.get('aliasOf'):
            continue
        im, an = P.sprite(k)
        if im is None:
            continue
        if s.get('cutaway'):
            ents.append((k + ' (closed)', im))
            op, _ = cutaway(P, k, 1.0)
            ents.append((k + ' (revealed)', op))
            continue
        ov = sp.get(k + '_smoke')
        if ov:
            im2 = im.copy()
            im2.alpha_composite(P.frame(ov['atlas'], ov['anims']['smoke']['frames'][1]))
            ents.append((k + ' + smoke', im2))
        else:
            ents.append((k, im))
        if 'anims' in s and 'work' in s['anims']:
            ents.append((k + ' (anim)', P.frame(s['atlas'], s['anims']['work']['frames'][0])))
    for c, frames in (('excavator', [('idle', 'SE', 0), ('dig', 'SE', 2), ('dig', 'SE', 5), ('move', 'NE', 1)]),
                      ('dump_truck', [('idle', 'SE', 0), ('idle_loaded', 'SE', 0), ('tip', 'SE', 2),
                                      ('move_loaded', 'NE', 1)])):
        for a, d, i in frames:
            im, an = P.char(c, a, d, i)
            if im is not None:
                ents.append(('%s %s_%s_%d' % (c, a, d, i), im))
    pp.shelf_preview(ents, out, max_w=2600, title='Civic & incidents (assets/civic) at 1x, PPU 64: bank + police '
                                                  'station (closed / revealed cutaway), ruins, rubble, scorch decals, '
                                                  'props, fence tiles, moving props, demolition vehicles')


def plot_panel(P, B, V, FX, step, title, size='S', W=640, H=500, t=0):
    """One step of the fire sequence on an S plot (anchor near the panel centre; shifted right while the demolition
    vehicles stand on the plot's left)."""
    cv = Image.new('RGBA', (W, H), SNOW)
    cx, cy = W * (0.68 if step in ('demolish', 'rubble') else 0.52), H * 0.68
    items = []                     # (depth, img, anchor, x, y)
    ring = P.man.get('fenceRings', {}).get(size)
    lay = P.man.get('demolitionLayout', {}).get(size, {})

    def add(im, an, x, y, depth=None, ground=False):
        if im is None:
            return
        items.append(((-1e6 + y) if ground else (y if depth is None else depth), im, an, x, y))

    def spr(F, key, frame=None):
        return F.sprite(key, frame) if F else (None, None)
    if step in ('ruin', 'demolish', 'rubble', 'site'):
        add(*spr(P, 'scorch_decal_s'), cx, cy, ground=True)
    if step == 'house':
        add(*spr(B, 'house_b'), cx, cy)
    if step == 'fire':
        add(*spr(B, 'house_b'), cx, cy)
        im, an = FX.sheet_frame('fx_fire_bld_s', 3) if FX else (None, None)
        add(im, an, cx, cy - 10, depth=cy + 5)
        im, an = FX.sheet_frame('fx_smoke_column', 2) if FX else (None, None)
        add(im, an, cx + 10, cy - 150, depth=cy + 6)
    if step == 'ruin':
        add(*spr(P, 'ruin_s'), cx, cy)
        ov = P.man['sprites'].get('ruin_s_smoke')
        if ov:
            add(P.frame(ov['atlas'], ov['anims']['smoke']['frames'][1]), P.sprite('ruin_s')[1], cx, cy, depth=cy + 1)
        add(*spr(P, 'insurance_sign'), cx - 150, cy + 60)
    if step in ('demolish', 'rubble'):
        add(*spr(P, 'ruin_s' if step == 'demolish' else 'rubble_pile_s'), cx, cy)
    if step in ('demolish', 'rubble') and ring:
        for pc in ring['pieces']:
            im, an = P.sprite(pc['key'])
            add(im, an, cx + pc['at'][0], cy + pc['at'][1])
        ex = lay.get('excavator')
        if ex:
            im, an = P.char('excavator', 'dig', 'SE', 2 if step == 'demolish' else 5)
            add(im, an, cx + ex['at'][0], cy + ex['at'][1])
            if step == 'demolish' and FX:
                im, an = FX.sheet_frame('fx_demolish_dust', 3)
                bp = P.man.get('characters', {}).get('excavator', {}).get('digPoint', {}).get('SE')
                if bp and im is not None:
                    add(im, an, cx + ex['at'][0] + bp[0], cy + ex['at'][1] + bp[1], depth=cy + 200)
        dt = lay.get('dump_truck')
        if dt:
            im, an = P.char('dump_truck', 'idle_loaded' if step == 'rubble' else 'idle', 'SE', 0)
            add(im, an, cx + dt['at'][0], cy + dt['at'][1])
    if step == 'site':
        add(*spr(B, 'site_scaffold_S'), cx, cy)
    if step == 'new':
        add(*spr(B, 'house_c'), cx, cy)
        add(*spr(P, 'welcome_mat'), cx - 40, cy + 50, ground=True)
    for d_, im, an, x, y in sorted(items, key=lambda it: it[0]):
        cv.alpha_composite(im, (int(round(x - an[0])), int(round(y - an[1]))))
    label(cv, title, W / 2, 12, size=15)
    return cv


def preview_fire_sequence(P, out):
    B = Frag('buildings')
    V = Frag('vehicles')
    FX = Frag('fx_city') if os.path.exists(os.path.join(ASSETS, 'fx_city', 'manifest.json')) else None
    steps = [('house', '1. a little house (S plot)'), ('fire', '2. fire! (fx_city flames + smoke)'),
             ('ruin', '3. ruin_s + scorch_decal_s + smoke'),
             ('demolish', '4. fence ring + excavator digs + dump truck'),
             ('rubble', '5. rubble_pile_s, truck loaded'), ('site', '6. site_scaffold_S (rebuild)'),
             ('new', '7. new house + welcome mat')]
    panels = [plot_panel(P, B, V, FX, s, t) for s, t in steps]
    W, H = panels[0].size
    cols = 4
    rows = int(math.ceil(len(panels) / cols))
    sheet = Image.new('RGBA', (cols * W, rows * H + 44), SNOW)
    for k, p in enumerate(panels):
        sheet.alpha_composite(p, ((k % cols) * W, (k // cols) * H))
    d = ImageDraw.Draw(sheet)
    for k in range(len(panels) - 1):
        if k % cols == cols - 1:
            continue
        x = (k % cols + 1) * W
        y = (k // cols) * H + H // 2
        d.polygon([(x - 14, y - 12), (x + 6, y), (x - 14, y + 12)], fill=(61, 139, 224, 255))
    caption_bar(sheet, 'Fire sequence on one S plot at 1x: house -> fire -> ruin -> demolition (fence ring + excavator '
                       '+ dump truck at demolitionLayout) -> rubble -> construction site (assets/buildings) -> new house')
    save_rgb(sheet, out)


def preview_scene(P, Pe, out):
    """A town corner at 1x: the civic row (bank open, wanted board, police station with its car) faces the main
    street from behind (+Y side, fronts facing -Y like every village building), moving day at a townhouse further
    along, and a burnt plot being cleared on the near side of the street."""
    import town_pack as tp       # read-only reuse: Scene (iso placement, road fill, labels, caption)
    T_ = Frag('town')
    V = Frag('vehicles')
    LG = Frag('logistics') if os.path.exists(os.path.join(ASSETS, 'logistics', 'manifest.json')) else None
    sc = tp.Scene(3200, 2200, 1500, 1150)
    road_p = os.path.join(ASSETS, 'ui2', 'ground_road.png')
    tex = Image.open(road_p).convert('RGBA') if os.path.exists(road_p) else Image.new('RGBA', (64, 64),
                                                                                       (200, 205, 214, 255))
    sc.road(tex, -15.0, 23.0, -1.6, 1.6)          # main street along X
    sc.road(tex, -1.6, 1.6, -11.0, 9.0)           # cross street along Y

    def top_of(img, an):
        bb = img.getbbox()
        return (an[1] - bb[1]) if bb else 60

    def put(F, key, x, y, lab=True, frame=None, ground=False, img=None, an=None, text=None, dy=0):
        if img is None:
            img, an = F.sprite(key, frame)
        if img is None:
            return None
        sc.put(img, an, x, y, ground=ground)
        if lab:
            sx, sy = sc.p(x, y)
            sc.labels.append((text or key, sx, sy - top_of(img, an) - 22 + dy))
        return img

    def person(img, an, x, y):
        if img is not None:
            sc.put(img, an, x, y)

    def off(pt):                    # px offset -> world metres
        return (pt[0] / PX_X + pt[1] / PX_Y) / 2, (pt[0] / PX_X - pt[1] / PX_Y) / 2

    # ---- civic row behind the main street (fronts face the street)
    bk = P.man['sprites']['bank']
    bimg, ban = cutaway(P, 'bank', 1.0, bank_people(Pe, bk), overlay_i={'bank_vault': 7})
    put(P, 'bank', -4.6, 4.6, img=bimg, an=ban, text='bank (revealed, vault open)')
    ps = P.man['sprites']['police_station']
    PX, PY = 5.7, 4.6
    pimg, pan = cutaway(P, 'police_station', 0.0)
    put(P, 'police_station', PX, PY, img=pimg, an=pan)
    cb = ps.get('carBayPoint')
    if cb and V.ok:
        im, an = V.char('police_car', 'idle', 'SW', 0)
        if im is not None:
            gx, gy = off(cb)
            sc.put(im, an, PX + gx, PY + gy)
    wx, wy = 3.0, 2.35
    put(P, 'wanted_board', wx, wy)
    wb = P.man['sprites'].get('wanted_board', {})
    if wb.get('posterPoints'):          # the game draws resident portraits into the poster slots
        sx, sy = sc.p(wx, wy)
        for k, pt in enumerate(wb['posterPoints']):
            im, an = Pe.person(None, seed=300 + k, d='S')
            if im is None:
                continue
            head = im.crop((40, 18, 88, 66)).resize(tuple(wb['posterSizePx']), Image.LANCZOS)
            sc.placed.append((sy + 0.5, head, int(sx + pt[0] - head.width / 2), int(sy + pt[1] - head.height / 2)))
    for k, (x, y, d_) in enumerate(((2.1, 1.5, 'NE'), (5.0, 1.95, 'NW'))):
        im, an = Pe.person(None, seed=500 + k, d=d_)
        person(im, an, x, y)
    put(P, 'fire_hydrant', 2.0, -2.0)
    put(P, 'fire_alarm_post', -2.0, -1.95, frame='fire_alarm_post_work_0', dy=-4)
    # ---- moving day at a townhouse further along the street
    HX, HY = 14.0, 4.4
    put(T_, 'townhouse_b', HX, HY)
    put(P, 'welcome_mat', HX - 0.55, HY - 2.05, lab=False, ground=True)
    put(P, 'sold_sign', HX - 2.6, 2.3)
    put(P, 'furniture_pile_l', HX - 0.9, 2.75, dy=-6)
    put(P, 'moving_boxes_stack', HX + 0.95, 2.35, dy=14)
    if LG and LG.ok and 'moving_truck' in LG.man.get('characters', {}):
        # backed up to the kerb (heading SW, rear doors toward the house), ramp down
        c = LG.man['characters']['moving_truck']
        an_ = 'unload' if 'unload' in c.get('anims', {}) else 'idle'
        mt, man_ = LG.char('moving_truck', an_, 'SW', c['anims'][an_]['frames'] - 1)
        if mt is not None:
            sc.put(mt, man_, HX + 6.3, 0.1)
            sx, sy = sc.p(HX + 6.3, 0.1)
            sc.labels.append(('moving_truck (assets/logistics, unload)', sx, sy - top_of(mt, man_) - 22))
    for k, (x, y, d_) in enumerate(((HX + 3.4, 1.5, 'W'), (HX + 1.6, 1.3, 'E'))):
        im, an = Pe.person('factory', seed=600 + k, anim='carry_walk', d=d_)
        person(im, an, x, y)
    # ---- a burnt plot being cleared on the near side: scorch + ruin_m + fence ring M + excavator + dump truck
    plot = (-5.6, -5.4)
    put(P, 'scorch_decal_m', plot[0], plot[1], lab=False, ground=True)
    put(P, 'ruin_m', plot[0], plot[1], text='ruin_m + fence ring M (demolition)')
    ov = P.man['sprites'].get('ruin_m_smoke')
    if ov:
        rim, ran = P.sprite('ruin_m')
        sx, sy = sc.p(*plot)
        sc.placed.append((sy + 1, P.frame(ov['atlas'], ov['anims']['smoke']['frames'][2]), int(sx - ran[0]),
                          int(sy - ran[1])))
    ring = P.man.get('fenceRings', {}).get('M')
    if ring:
        for pc in ring['pieces']:
            im, an = P.sprite(pc['key'])
            gx, gy = off(pc['at'])
            sc.put(im, an, plot[0] + gx, plot[1] + gy)
    lay = P.man.get('demolitionLayout', {}).get('M', {})
    for vk, anim, i in (('excavator', 'dig', 2), ('dump_truck', 'idle_loaded', 0)):
        if vk in lay:
            im, an = P.char(vk, anim, lay[vk]['dir'], i)
            gx, gy = off(lay[vk]['at'])
            sc.put(im, an, plot[0] + gx, plot[1] + gy)
            sx, sy = sc.p(plot[0] + gx, plot[1] + gy)
            sc.labels.append((vk, sx, sy - top_of(im, an) - 22))
    put(P, 'insurance_sign', -2.9, -4.4)
    # ---- passers-by
    for k, (x, y, d_) in enumerate(((-2.6, -2.4, 'NW'), (-0.6, -4.5, 'NE'), (0.7, 5.6, 'SW'), (8.9, -0.6, 'W'),
                                    (-9.0, 0.4, 'SE'), (0.4, -8.6, 'N'))):
        im, an = Pe.person(None, seed=700 + k, d=d_, i=k % 4)
        person(im, an, x, y)
    sc.finish(out, 'Civic corner at 1x (PPU 64): bank revealed, wanted board + police station with its car, '
                   'moving day, a burnt plot being cleared')


def gifs(P, Pe, prev):
    s = P.man['sprites']
    # vault: open then close in the revealed bank (people present)
    if 'bank' in s:
        ppl = bank_people(Pe, s['bank'])
        fr = []
        n = len(s['bank_vault']['anims']['vault']['frames'])
        for i in list(range(n)) + [n - 1] * 4 + list(range(n - 1, -1, -1)) + [0] * 4:
            im, _ = cutaway(P, 'bank', 1.0, ppl, overlay_i={'bank_vault': i})
            fr.append(im.crop((0, 0, im.width, im.height)))
        save_gif(fr, os.path.join(prev, 'civ_vault.gif'), fps=8)
        # reveal: shell fades out and back in
        fr = []
        for t in [0.0] * 4 + [k / 8 for k in range(9)] + [1.0] * 6 + [1 - k / 8 for k in range(9)]:
            fr.append(cutaway(P, 'bank', t, ppl)[0])
        save_gif(fr, os.path.join(prev, 'civ_reveal.gif'), fps=12)
    if 'police_station' in s:
        ppl = police_people(Pe, s['police_station'])
        fr = []
        n = len(s['police_station_cell']['anims']['open']['frames'])
        for i in list(range(n)) + [n - 1] * 4 + list(range(n - 1, -1, -1)) + [0] * 4:
            fr.append(cutaway(P, 'police_station', 1.0, ppl, overlay_i={'police_station_cell': i})[0])
        save_gif(fr, os.path.join(prev, 'civ_cell.gif'), fps=10)
    # vehicles
    for key, plan, name in (('excavator', [('dig', 8)] * 2 + [('move', 4)] * 2, 'civ_excavator.gif'),
                            ('dump_truck', [('move_loaded', 4)] * 2 + [('tip', 6)] + [('idle', 2)] * 2 +
                             [('move', 4)], 'civ_dump_truck.gif')):
        c = P.man['characters'].get(key)
        if not c:
            continue
        W, H = c['frameSize']
        fr = []
        for anim, nfr in plan:
            for i in range(nfr):
                cv = Image.new('RGBA', (W * 2 + 20, H), SNOW)
                for k, d in enumerate(('SE', 'NE')):
                    im, an = P.char(key, anim, d, i)
                    put_char(cv, im, an, k * (W + 20) + c['anchor'][0] * W, c['anchor'][1] * H)
                fr.append(cv)
        save_gif(fr, os.path.join(prev, name), fps=7)
    # ruins smouldering
    keys = [k for k in ('ruin_s', 'ruin_m', 'ruin_l', 'ruin_house_town') if k in s]
    if keys:
        ims = [P.sprite(k) for k in keys]
        W = sum(im.width for im, _ in ims) + 20 * len(ims)
        H = max(im.height for im, _ in ims)
        fr = []
        for i in range(8):
            cv = Image.new('RGBA', (W, H), SNOW)
            x = 0
            for k, (im, an) in zip(keys, ims):
                dec = s.get('scorch_decal_' + {'ruin_s': 's', 'ruin_m': 'm', 'ruin_l': 'l'}.get(k, 'm'))
                if dec:
                    dim = P.frame(dec['atlas'], dec['frame'])
                    cv.alpha_composite(dim, (int(x + an[0] - dim.width / 2), int(H - im.height + an[1] - dim.height / 2)))
                cv.alpha_composite(im, (x, H - im.height))
                ov = s.get(k + '_smoke')
                if ov:
                    cv.alpha_composite(P.frame(ov['atlas'], ov['anims']['smoke']['frames'][i % 4]), (x, H - im.height))
                x += im.width + 20
            fr.append(cv)
        save_gif(fr, os.path.join(prev, 'civ_ruin_smoke.gif'), fps=6)
    # alarm + fence lamp
    for key, name, an in (('fire_alarm_post', 'civ_alarm.gif', 'work'), ('demolition_fence_x_lamp', 'civ_fence_lamp.gif',
                                                                         'work')):
        e = s.get(key)
        if not e or 'anims' not in e:
            continue
        fr = [P.frame(e['atlas'], e['frame'])] * 3 + [P.frame(e['atlas'], f) for f in e['anims'][an]['frames']] * 4
        save_gif([f for f in fr if f is not None], os.path.join(prev, name), fps=e['anims'][an]['fps'])


def make_all(out_dir=None, prev_dir=None):
    prev = prev_dir or os.path.join(GAME, 'docs', 'previews')
    os.makedirs(prev, exist_ok=True)
    P = Frag(os.path.abspath(out_dir) if out_dir else 'civic')
    if not P.ok:
        print('civ_preview: no manifest at %s' % (out_dir or 'assets/civic'))
        return
    Pe = People()
    preview_all(P, os.path.join(prev, 'civ_all.png'))
    if 'bank' in P.man['sprites']:
        preview_cutaway(P, Pe, 'bank', os.path.join(prev, 'civ_bank_cutaway.png'), bank_people,
                        'Bank cutaway at 1x: layers (top, 0.6x) and closed / revealing / open with tellers, manager, '
                        'customers, ATM user / vault open (red = revealPoly)')
    if 'police_station' in P.man['sprites']:
        preview_cutaway(P, Pe, 'police_station', os.path.join(prev, 'civ_police_cutaway.png'), police_people,
                        'Police station cutaway at 1x: layers + closed / revealing / open with officers, a visitor, '
                        'and a sheepish little prankster in the cosy cell / cell door open')
    preview_fire_sequence(P, os.path.join(prev, 'civ_fire_sequence.png'))
    preview_scene(P, Pe, os.path.join(prev, 'civ_scene.png'))
    gifs(P, Pe, prev)
    print('previews: civ_all.png, civ_bank_cutaway.png, civ_police_cutaway.png, civ_fire_sequence.png, civ_scene.png '
          '+ GIFs in %s' % prev)


if __name__ == '__main__':
    a = sys.argv[1:]
    out = a[a.index('--out') + 1] if '--out' in a else None
    pv = a[a.index('--prev') + 1] if '--prev' in a else None
    make_all(out, pv)
