"""
ship_preview.py - previews for assets/ships (called by ship_pack.py, or run alone after packing:
    python3 tools/blender/ship_preview.py            reads assets/ships + the render cache metas)

  docs/previews/ships_all.png    every ship in its rendered headings (+ a mirrored one), move + foam layers composed,
                                 the cargo stacks loaded, the trawler hauling, the seagull's anims
  docs/previews/ships_scene.png  a harbour mock-up at 1x on the existing water_sea texture beside the existing
                                 dock_pier / boathouse / boats, with villagers for scale, passengers on the ferry deck
                                 (deckPoints), gulls perched on perchPoints
  docs/previews/ships_move.gif   all ships sailing (layered ships bob as the game should bob them)
  docs/previews/ships_haul.gif   the trawler hauling its net
  docs/previews/ships_gull.gif   seagull fly (5 dirs) / glide / land / idle
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
ASSETS = os.path.join(GAME, 'assets')
SEA = (31, 95, 168)


def font(sz):
    import prop_pack as pp
    return pp.font(sz)


def tile(path, size):
    t = Image.open(path).convert('RGBA')
    im = Image.new('RGBA', size)
    for x in range(0, size[0], t.width):
        for y in range(0, size[1], t.height):
            im.paste(t, (x, y))
    return im


def sea(size):
    p = os.path.join(ASSETS, 'ground', 'water_sea.png')
    return tile(p, size) if os.path.exists(p) else Image.new('RGBA', size, SEA + (255,))


def atlas_reader(manifest_rel):
    """(manifest, get(atlas, frame) -> untrimmed RGBA) for an existing asset folder (read-only)."""
    path = os.path.join(ASSETS, manifest_rel)
    if not os.path.exists(path):
        return None
    man = json.load(open(path, encoding='utf-8'))
    cache = {}

    def get(akey, name):
        if akey not in cache:
            a = next((x for x in man.get('atlases', []) if x['key'] == akey), None)
            cache[akey] = None if a is None else (Image.open(os.path.join(ASSETS, a['png'])).convert('RGBA'),
                                                  json.load(open(os.path.join(ASSETS, a['json'])))['frames'])
        s = cache[akey]
        if not s or name not in s[1]:
            return None
        f = s[1][name]
        r = f['frame']
        crop = s[0].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        im.paste(crop, (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        return im
    return man, get


# --------------------------------------------------------------------------- composing a ship

def first_anim(m):
    return list(m['anims'])[0]


def view(m, imgs, d, anim=None, i=0, slots=True, foam=False, people=None):
    """Full-frame RGBA of ship m heading d (a rendered dir).  people = [(img, anchor_px, dx, dy)] drawn after the
    base (deck passengers) - offsets from the ship anchor."""
    ax, ay = m['anchorPx']
    if m['mode'] == 'layered':
        im = imgs['base_%s' % d].copy()
        P = m['points']
        if slots and m.get('slots'):
            for k in P['slotOrder'][d]:
                im.alpha_composite(imgs['slot%d_%s' % (k, d)])
        for pim, (pax, pay), dx, dy in sorted(people or [], key=lambda t: t[3]):
            im.alpha_composite(pim, (int(ax + dx - pax), int(ay + dy - pay)))
        if foam and ('foam_%s_%d' % (d, i % 4)) in imgs:
            im.alpha_composite(imgs['foam_%s_%d' % (d, i % 4)])
        if anim and ('%s_%s_%d' % (anim, d, i)) in imgs:
            im.alpha_composite(imgs['%s_%s_%d' % (anim, d, i)])
        return im
    a = anim or first_anim(m)
    return imgs['%s_%s_%d' % (a, d, i % m['anims'][a]['frames'])].copy()


def resolve(m, d):
    """(rendered dir, flip) for any of the 8 headings."""
    if d in m['dirs']:
        return d, False
    if d in m['mirror']:
        return m['mirror'][d], True
    near = {'E': 'SE', 'W': 'SW', 'N': 'NE'}.get(d, 'SE')
    return resolve(m, near)


def placed(m, imgs, d, **kw):
    """(img, anchor px) for any heading (mirrors flipped)."""
    rd, flip = resolve(m, d)
    im = view(m, imgs, rd, **kw)
    ax, ay = m['anchorPx']
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
        ax = m['frameSize'][0] - ax
    return im, (ax, ay)


def bob_px(m, key, t):
    from ship_pack import BOB
    if m['mode'] != 'layered':
        return 0
    amp, per = BOB.get(key, [2, 3.5])
    return int(round(amp * math.sin(math.tau * t / per)))


def crop_alpha(im, pad=6):
    bb = im.getchannel('A').getbbox()
    if not bb:
        return im
    return im.crop((max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad)))


# --------------------------------------------------------------------------- people

def people_lib():
    chars = atlas_reader('characters/manifest.json')
    vil = atlas_reader('villagers/manifest.json')

    def person(key, frame, flip=False):
        im = None
        for lib in (chars, vil):
            if lib and key in lib[0].get('characters', {}):
                im = lib[1](lib[0]['characters'][key]['atlas'], frame)
                break
        if im is None:
            return None
        return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
    return person


def passengers(m, d, person, n=6, seed=0):
    keys = ['villager_a', 'villager_b', 'villager_c', 'npc_young_man', 'npc_aunt', 'npc_kid_girl', 'npc_grandpa',
            'npc_teen_girl']
    out = []
    pts = m['points'].get('deck', {}).get(d, [])
    if len(pts) > n:                                  # evenly spread over the (far -> near sorted) spots
        pts = [pts[int(round(k * (len(pts) - 1) / float(n - 1)))] for k in range(n)]
    for j, p in enumerate(pts):
        k = keys[(j + seed) % len(keys)]
        im = person(k, 'idle_%s_0' % ('S' if j % 2 else 'SE'), flip=bool(j % 3 == 1))
        if im is not None:
            out.append((im, (64, 104), p[0], p[1]))
    return out


# --------------------------------------------------------------------------- previews

def label(dr, text, x, y, f, fill=(30, 34, 44)):
    tw = f.getlength(text)
    dr.rounded_rectangle([x - tw / 2 - 6, y - 2, x + tw / 2 + 6, y + 17], radius=8, fill=(255, 255, 255, 225))
    dr.text((x - tw / 2, y), text, fill=fill, font=f)


def preview_all(ships, imgs, out):
    from ship_pack import NAMES
    person = people_lib()
    rows = []
    for k in ['ferry', 'cargo_ship', 'trawler_big', 'tugboat', 'sailboat', 'yacht']:
        if k not in ships:
            continue
        m = ships[k]
        sc = 0.62 if m['mode'] == 'layered' else 1.0
        cells = []
        for d in ['S', 'SE', 'NE', 'SW']:
            kw = {'anim': 'move', 'i': 1, 'foam': True}
            if k == 'ferry':
                kw['people'] = passengers(m, resolve(m, d)[0], person, n=7, seed=len(d))
            im, _ = placed(m, imgs[k], d, **kw)
            cells.append(('%s %s%s' % (k, d, ' (mirror)' if d not in m['dirs'] else ''), crop_alpha(im), sc))
        if k == 'trawler_big':
            for d in m['anims']['haul'].get('dirs', m['dirs']):
                im = view(m, imgs[k], d, anim='haul', i=2)
                cells.append(('trawler haul %s' % d, crop_alpha(im), sc))
        if k in ('tugboat', 'sailboat', 'yacht'):
            im = view(m, imgs[k], 'SE', anim='idle', i=0)
            cells.append(('%s idle SE' % k, crop_alpha(im), sc))
        rows.append((k, cells))
    if 'seagull' in ships:
        m = ships['seagull']
        cells = []
        for a, i in (('fly', 0), ('fly', 3), ('glide', 0), ('land', 0), ('land', 2), ('idle', 0), ('idle', 2)):
            for d in (['S', 'SE', 'E', 'NE', 'N'] if (a, i) == ('fly', 0) else ['SE']):
                cells.append(('%s %s %d' % (a, d, i), crop_alpha(view(m, imgs['seagull'], d, anim=a, i=i)), 2.0))
        rows.append(('seagull', cells))
    gap = 16
    lay = []
    W = 0
    y = 50
    for k, cells in rows:
        x = gap
        hmax = 0
        for t, im, sc in cells:
            w, h = int(im.width * sc), int(im.height * sc)
            lay.append((t, im.resize((w, h), Image.LANCZOS) if sc != 1 else im, x, y))
            x += w + gap
            hmax = max(hmax, h)
        W = max(W, x)
        y += hmax + 34
    canvas = sea((W, y + 10))
    dr = ImageDraw.Draw(canvas)
    f = font(13)
    for t, im, x, yy in lay:
        canvas.alpha_composite(im, (x, yy))
        label(dr, t, x + im.width / 2, yy + im.height + 4, f)
    dr.rectangle([0, 0, W, 38], fill=(20, 52, 98, 255))
    dr.text((14, 9), 'Frost Village v6 - harbour ships (assets/ships): move frame + foam layer, ferry passengers at '
                     'deckPoints, cargo slots loaded; big ships at 0.62x, small boats 1x, seagull 2x',
            fill=(255, 255, 255), font=font(17))
    canvas.convert('RGB').save(out, optimize=True)


def iso(C, x, y, z=0.0):
    """screen px of world metres (x, y, z) relative to the screen point C (PPU 64, bl_common projection)."""
    return (C[0] + (x + y) * 45.2548, C[1] + (x - y) * 22.6274 - z * 55.4256)


def preview_scene(ships, imgs, out):
    """Harbour mock-up at 1x on water_sea: a snowy quay block (sea in front of both quay edges, like assets/harbor)
    with the ferry berthed at harbor/ferry_terminal (gangwayFarPoint on the terminal gangwayPoint), the cargo ship
    moored along the other quay edge with its crane + containers, plus a village shore with the EXISTING dock_pier,
    boathouse and boats; villagers + the chief for scale, ships at sea, gulls flying and perched."""
    W, H = 3800, 2150
    canvas = sea((W, H))
    snow_p = os.path.join(ASSETS, 'ground', 'ground_snow.png')
    land = tile(snow_p, (W, H)) if os.path.exists(snow_p) else Image.new('RGBA', (W, H), (244, 247, 251, 255))
    C = (2500.0, 1650.0)                          # front corner of the quay block (sea in front of both edges)
    QX, QY = 31.0, 27.0
    quay = [iso(C, 0, 0), iso(C, -QX, 0), iso(C, -QX, QY), iso(C, 0, QY)]
    shore = [(0, 1560), (1230, 1860), (1230, H), (0, H)]
    mask = Image.new('L', (W, H), 0)
    md = ImageDraw.Draw(mask)
    md.polygon(quay, fill=255)
    md.polygon(shore, fill=255)
    canvas.paste(land, (0, 0), mask)
    dr = ImageDraw.Draw(canvas)
    stone = (196, 204, 214, 255)
    dr.line([quay[1], quay[0], quay[3]], fill=stone, width=9)       # quay edge stones
    dr.line([shore[0], shore[1]], fill=(236, 244, 250, 255), width=7)
    placed_ = []
    labels = []
    person = people_lib()
    props = atlas_reader('props/manifest.json')
    bld = atlas_reader('buildings/manifest.json')
    har = atlas_reader('harbor/manifest.json')
    chars = atlas_reader('characters/manifest.json')

    def put(im, anchor, sx, sy, depth=None, lab=None, ly=30):
        placed_.append((sy if depth is None else depth, im, int(round(sx - anchor[0])), int(round(sy - anchor[1]))))
        if lab:
            labels.append((lab, sx, sy + ly))

    def sprite(lib, key, frame=None):
        if not lib:
            return None
        man, get = lib
        sp = man.get('sprites', {}).get(key)
        if not sp:
            return None
        im = get(sp['atlas'], frame or sp['frame'])
        if im is None:
            return None
        fw, fh = sp['frameSize']
        return im, (sp['anchor'][0] * fw, sp['anchor'][1] * fh), sp

    def put_sprite(lib, key, sx, sy, frame=None, lab=None, depth=None):
        r = sprite(lib, key, frame)
        if r:
            put(r[0], r[1], sx, sy, depth=depth, lab=lab)
        return r[2] if r else None

    def put_char(lib, key, frame, sx, sy, lab=None, flip=False):
        if not lib:
            return
        man, get = lib
        c = man.get('characters', {}).get(key)
        if not c:
            return
        im = get(c['atlas'], frame)
        if im is None:
            return
        fw, fh = c['frameSize']
        a = (c['anchor'][0] * fw, c['anchor'][1] * fh)
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            a = (fw - a[0], a[1])
        put(im, a, sx, sy, lab=lab)

    def put_ship(k, d, sx, sy, lab=None, depth=None, **kw):
        if k not in ships:
            return None
        m = ships[k]
        im, a = placed(m, imgs[k], d, **kw)
        put(im, a, sx, sy, depth=depth, lab=lab or '%s (%s)' % (k, d), ly=36)
        return m

    def pt(m, name, d):
        """point of ship m for any heading (mirrors negate dx)."""
        rd, flip = resolve(m, d)
        v = m['points'][name][rd]
        return (-v[0], v[1]) if flip else (v[0], v[1])

    # ---- quay: harbor/ferry_terminal + the ferry berthed at it (SE, far-side gangway on the terminal gangway tip)
    fm = ships.get('ferry')
    T = iso(C, -13.0, 2.0)
    ts = put_sprite(har, 'ferry_terminal', T[0], T[1], lab='harbor/ferry_terminal')
    if fm:
        g = ts.get('gangwayPoint', [-111, 155]) if ts else [-111, 155]
        gf = pt(fm, 'gangwayFar', 'SE')
        fx, fy = T[0] + g[0] - gf[0], T[1] + g[1] - gf[1]
        put_ship('ferry', 'SE', fx, fy, lab='ferry berthed: gangwayFarPoint on the terminal gangway tip',
                 anim='idle', i=0, people=passengers(fm, 'SE', person, n=9, seed=1))
        if ts:
            for j, (dx, dy) in enumerate(ts.get('waitPoints', [])[:4]):
                put_char(chars, ('villager_a', 'villager_b', 'villager_c', 'villager_a')[j], 'idle_SE_0',
                         T[0] + dx, T[1] + dy)
    # ---- quay: cargo ship moored along the right edge (heading NE, far side to the quay) + crane, containers
    cm = ships.get('cargo_ship')
    if cm:
        cx, cy = iso(C, cm['beamM'] / 2 + 0.45, 12.5)
        put_ship('cargo_ship', 'NE', cx, cy, lab='cargo_ship moored (NE, 6 container slots)', anim='idle', i=0)
    hc = iso(C, -2.3, 10.5)
    put_sprite(har, 'harbor_crane', hc[0], hc[1], frame=None)
    for j, (x, y) in enumerate(((-4.0, 15.5), (-6.8, 15.0), (-4.2, 19.5))):
        q = iso(C, x, y)
        put_sprite(har, 'container_stack' if j != 1 else 'container_stack_b', q[0], q[1])
    lh = iso(C, -3.0, 24.0)
    put_sprite(har, 'lighthouse', lh[0], lh[1])
    for k in range(6):
        b_ = iso(C, -1.0 - k * 4.6, 0.55)
        put_sprite(har, 'bollard', b_[0], b_[1])
        b_ = iso(C, -0.55, 3.0 + k * 3.8)
        put_sprite(har, 'bollard', b_[0], b_[1])
    # ---- village shore (existing art): dock_pier, boathouse, boats, the chief + villagers for scale
    put_sprite(bld, 'boathouse', 980, 1830, frame='boathouse', lab='boathouse (existing)')
    put_sprite(props, 'dock_pier', 420, 1690, lab='dock_pier (existing)')
    put_sprite(props, 'barrel', 700, 1760)
    put_sprite(props, 'crate', 745, 1785)
    put_sprite(props, 'lamp_post', 600, 1830)
    put_char(bld, 'boat_fishing', 'sail_SE_1', 300, 1420, lab='boat_fishing (existing)')
    put_char(bld, 'boat_rowboat', 'row_SE_2', 700, 1480, lab='boat_rowboat (existing)')
    put_char(chars, 'player', 'idle_SE_0', 520, 1960, lab='chief 1.45 m (scale)')
    for j, k in enumerate(('villager_a', 'villager_b', 'villager_c')):
        put_char(chars, k, 'idle_NE_0', 250 + j * 42, 1930 + j * 14)
    put_char(chars, 'fisherman', 'idle_S_0', 820, 1990)
    # ---- ships at sea
    put_ship('ferry', 'S', 330, 760, lab='ferry (S, arriving)', anim='move', i=2, foam=True)
    put_ship('trawler_big', 'NE', 1000, 560, lab='trawler_big (NE, haul)', anim='haul', i=2)
    put_ship('sailboat', 'SE', 1520, 330, anim='move', i=2)
    put_ship('yacht', 'NW', 820, 1130, anim='move', i=1)
    put_ship('tugboat', 'SW', 3480, 1930, anim='move', i=1, lab='tugboat (SW)')
    # ---- seagulls: flying + perched on the ferry mast / trawler A-frame
    gm = ships.get('seagull')
    if gm:
        gi = imgs['seagull']
        for j, (d, a, i, sx, sy) in enumerate((('SE', 'fly', 1, 1300, 220), ('E', 'glide', 0, 640, 300),
                                                ('SW', 'fly', 4, 1600, 1150), ('S', 'fly', 2, 3300, 380),
                                                ('NE', 'glide', 1, 2950, 900))):
            im, an = placed(gm, gi, d, anim=a, i=i)
            put(im, an, sx, sy, depth=9000 + j, lab='seagull %s %s' % (a, d) if j == 0 else None, ly=8)
        if fm:
            p = fm['points']['perch']['SE'][0]
            im, an = placed(gm, gi, 'SW', anim='idle', i=1)
            put(im, an, fx + p[0], fy + p[1], depth=9100, lab='gull perched (perchPoints)', ly=6)
        tm = ships.get('trawler_big')
        if tm:
            for p in tm['points']['perch']['NE'][3:5]:
                im, an = placed(gm, gi, 'SE', anim='idle', i=0)
                put(im, an, 1000 + p[0], 560 + p[1], depth=9200)
    for _, im, x, y in sorted(placed_, key=lambda t: t[0]):
        canvas.alpha_composite(im, (x, y))
    dr = ImageDraw.Draw(canvas)
    f = font(14)
    for t, sx, sy in labels:
        label(dr, t, sx, sy, f)
    dr.rectangle([0, H - 42, W, H], fill=(20, 52, 98, 255))
    dr.text((16, H - 34), 'Gull Harbour mock-up at 1x (PPU 64): assets/ships on the existing water_sea texture - ferry '
                          'berthed at harbor/ferry_terminal, cargo ship moored at the quay, existing dock_pier / '
                          'boathouse / boats + chief and villagers for scale (static composite, not an in-game '
                          'capture)', fill=(255, 255, 255), font=font(18))
    canvas.convert('RGB').save(out, optimize=True)


def _gif(frames, durs, out):
    pal = frames[min(1, len(frames) - 1)].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)


def preview_move_gif(ships, imgs, out):
    cells = []
    for k, d, sc in (('ferry', 'SE', 0.5), ('cargo_ship', 'SE', 0.42), ('trawler_big', 'NE', 0.5),
                     ('tugboat', 'SE', 0.8), ('sailboat', 'NE', 0.8), ('yacht', 'SW', 0.8)):
        if k in ships:
            cells.append((k, d, sc))
    if not cells:
        return
    n = 12
    fps = 8
    stills = {}
    boxes = {}
    for k, d, sc in cells:
        m = ships[k]
        fr = []
        for t in range(n):
            i = t % m['anims']['move']['frames']
            im, _ = placed(m, imgs[k], d, anim='move', i=i, foam=True)
            fr.append(im)
        bb = None
        for im in fr:
            b = im.getchannel('A').getbbox()
            bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
        stills[k] = fr
        boxes[k] = bb
    gap = 10
    cw = [int((boxes[k][2] - boxes[k][0]) * sc) + 8 for k, d, sc in cells]
    ch = [int((boxes[k][3] - boxes[k][1]) * sc) + 8 for k, d, sc in cells]
    half = (len(cells) + 1) // 2
    W = max(sum(cw[:half]), sum(cw[half:])) + gap * (half + 1)
    H = max(ch[:half]) + max(ch[half:] or [0]) + 3 * gap + 40
    seq = []
    for t in range(n):
        canvas = sea((W, H))
        dr = ImageDraw.Draw(canvas)
        x, y = gap, gap
        rowh = max(ch[:half])
        for j, (k, d, sc) in enumerate(cells):
            if j == half:
                x, y = gap, gap + rowh + gap + 20
            m = ships[k]
            b = boxes[k]
            im = stills[k][t].crop(b)
            im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
            canvas.alpha_composite(im, (x + 4, y + 4 + bob_px(m, k, t / float(fps))))
            dr.text((x + 6, y + ch[j] - 4), '%s move %s' % (k, d), fill=(255, 255, 255), font=font(12))
            x += cw[j] + gap
        seq.append(canvas.convert('RGB'))
    _gif(seq, [int(1000 / fps)] * n, out)


def preview_haul_gif(ships, imgs, out):
    m = ships.get('trawler_big')
    if not m:
        return
    dirs = m['anims']['haul'].get('dirs') or m['dirs']
    n = m['anims']['haul']['frames']
    fr = {d: [view(m, imgs['trawler_big'], d, anim='haul', i=i) for i in range(n)] for d in dirs}
    bb = {}
    for d in dirs:
        b = None
        for im in fr[d]:
            q = im.getchannel('A').getbbox()
            b = q if b is None else (min(b[0], q[0]), min(b[1], q[1]), max(b[2], q[2]), max(b[3], q[3]))
        bb[d] = b
    sc = 0.75
    W = sum(int((bb[d][2] - bb[d][0]) * sc) + 20 for d in dirs) + 10
    H = max(int((bb[d][3] - bb[d][1]) * sc) for d in dirs) + 50
    seq = []
    for t in range(n * 2):
        canvas = sea((W, H))
        dr = ImageDraw.Draw(canvas)
        x = 10
        for d in dirs:
            im = fr[d][t % n].crop(bb[d])
            im = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
            canvas.alpha_composite(im, (x, 10 + bob_px(m, 'trawler_big', t / 6.0)))
            dr.text((x + 4, H - 30), 'trawler_big haul %s (%d f @ %d fps)' % (d, n, m['anims']['haul']['fps']),
                    fill=(255, 255, 255), font=font(14))
            x += im.width + 20
        seq.append(canvas.convert('RGB'))
    _gif(seq, [int(1000 / m['anims']['haul']['fps'])] * len(seq), out)


def preview_gull_gif(ships, imgs, out):
    m = ships.get('seagull')
    if not m:
        return
    g = imgs['seagull']
    sc = 2
    fw, fh = m['frameSize']
    cells = [('fly', d) for d in ['S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW']] + [('glide', 'SE'), ('glide', 'S'),
                                                                                    ('land', 'SE'), ('idle', 'SE'),
                                                                                    ('idle', 'S'), ('idle', 'E')]
    cols = 7
    rows = (len(cells) + cols - 1) // cols
    W, H = cols * fw * sc, rows * (fh * sc + 22) + 10
    n = 12
    seq = []
    for t in range(n):
        canvas = sea((W, H))
        dr = ImageDraw.Draw(canvas)
        for j, (a, d) in enumerate(cells):
            nf = m['anims'][a]['frames']
            i = min(t, nf - 1) if m['anims'][a].get('repeat', -1) == 0 else t % nf
            im, _ = placed(m, g, d, anim=a, i=i)
            im = im.resize((fw * sc, fh * sc), Image.LANCZOS)
            x, y = (j % cols) * fw * sc, (j // cols) * (fh * sc + 22) + 4
            canvas.alpha_composite(im, (x, y))
            dr.text((x + 6, y + fh * sc + 2), '%s %s' % (a, d), fill=(255, 255, 255), font=font(13))
        seq.append(canvas.convert('RGB'))
    _gif(seq, [int(1000 / 10)] * n, out)


def all_previews(ships, imgs, prev):
    preview_all(ships, imgs, os.path.join(prev, 'ships_all.png'))
    preview_scene(ships, imgs, os.path.join(prev, 'ships_scene.png'))
    preview_move_gif(ships, imgs, os.path.join(prev, 'ships_move.gif'))
    preview_haul_gif(ships, imgs, os.path.join(prev, 'ships_haul.gif'))
    preview_gull_gif(ships, imgs, os.path.join(prev, 'ships_gull.gif'))
    print('previews: docs/previews/ships_all.png, ships_scene.png, ships_move.gif, ships_haul.gif, ships_gull.gif')


def main():
    """Rebuild the previews from the packed assets/ships atlases + the cached metas (ship_pack must have run)."""
    import ship_pack as SPK
    import tempfile
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'ships')
    if '--cache' in sys.argv:
        cache = sys.argv[sys.argv.index('--cache') + 1]
    lib = atlas_reader('ships/manifest.json')
    if not lib:
        raise SystemExit('assets/ships/manifest.json missing - run ship_pack.py first')
    man, get = lib
    ships, imgs = {}, {}
    for k, e in man['characters'].items():
        m = SPK.load_ship(cache, k)
        if not m:
            continue
        ships[k] = m
        imgs[k] = {n: get(e['atlas'], n) for n in m['frames']}
    prev = os.path.join(GAME, 'docs', 'previews')
    all_previews(ships, imgs, prev)


if __name__ == '__main__':
    main()
