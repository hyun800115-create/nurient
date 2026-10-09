"""
gen_fx_city_mount.py - per-building fire mounting table for assets/fx_city (manifest.fireMount.buildings) and the
docs/previews/fxcity_firemount.png contact sheet.  Library of tools/fx/gen_fx_city.py (the builder); its own CLI
only writes the preview:
    python3 tools/fx/gen_fx_city_mount.py            # -> docs/previews/fxcity_firemount.png (+ table summary)

Why: the generic rule (anchor + [0, -k * topPx]) breaks on real buildings - topPx includes towers, chimneys and
the floating shop signs, so fires float above the school or slice an apartment facade.  Here every building
sprite of the town / buildings / harbor / vehicles / logistics / props / beach (+ civic / beach_bld when they
exist) fragments is MEASURED (read-only):
  * roof line  = median of the silhouette's top edge over the central 84 % of the footprint width (narrow towers,
                 chimneys and signs are ignored by the median), the fire base goes 0.22 x footprint below it, i.e.
                 onto the roof plane;
  * size       = S / M / L by footprint width (<= 240 / <= 330 / above), scale clamp(0.85 * fw / span, 0.85, 1.15)
                 (x max(0.6, topPx / 200) for low open stations, piers and tents);
                 footprints wider than 400 px get n = ceil(fw / 400) fires spread along the roof's long axis
                 (longest footprintPoly edge), each sized for its share, sorted back -> front;
  * windows    = the lit (warm yellow) window panes of the render, grouped into blobs; the highest pane on the
                 left wall and on the right wall (split at the footprint's front corner) become fx_fire_window
                 points (flipX = right wall); buildings without detectable panes get the heuristic
                 left / right points and are flagged 'guess';
  * smoke, embers, glow and the alarm point follow from the fire placement.
All offsets are screen px relative to the building's anchor at scale 1 (the game multiplies by the building's
scale).  Re-run gen_fx_city.py after buildings change; check_fx_city.py warns about buildings without an entry.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'assets')
PREV = os.path.join(ROOT, 'docs', 'previews')
if HERE not in sys.path:
    sys.path.insert(0, HERE)

FRAGS = ['town', 'buildings', 'harbor', 'vehicles', 'logistics', 'props', 'beach', 'civic', 'beach_bld']
KINDS = ('building', 'station')
MIN_FW = 160
SPANS = {'s': 196, 'm': 270, 'l': 350}           # base span (px) of fx_fire_bld_s / _m / _l at scale 1
HEIGHTS = {'s': 136, 'm': 176, 'l': 216}         # flame height (px) at scale 1
ROOF_K = 0.22                                    # fire base = roof line + ROOF_K * footprint width (per fire share)
SCALE_MIN, SCALE_MAX = 0.85, 1.15
LOW_PX = 200                                     # buildings lower than this (topPx) get a proportionally smaller fire


def pick_size(span_wanted):
    for k in ('s', 'm', 'l'):
        if span_wanted <= SPANS[k] * SCALE_MAX * 1.0:
            return k
    return 'l'


# --------------------------------------------------------------------------- asset access (read-only)
_ATL = {}


def _man(frag):
    p = os.path.join(ASSETS, frag, 'manifest.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def _atlas_frame(png, js_path, name):
    if png not in _ATL:
        with open(os.path.join(ASSETS, js_path), encoding='utf-8') as f:
            js = json.load(f)
        frames = js['frames'] if isinstance(js['frames'], dict) else {fr['filename']: fr for fr in js['frames']}
        _ATL[png] = (Image.open(os.path.join(ASSETS, png)).convert('RGBA'), frames)
    sheet, frames = _ATL[png]
    fr = frames[name]
    r = fr['frame']
    crop = sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
    if fr.get('rotated'):
        crop = crop.transpose(Image.ROTATE_90)
    out = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
    out.alpha_composite(crop, (fr['spriteSourceSize']['x'], fr['spriteSourceSize']['y']))
    return out


def sprite_image(frag, key, man=None):
    m = man or _man(frag)
    s = m['sprites'][key]
    if 'atlas' in s:
        at = next(a for a in m['atlases'] if a['key'] == s['atlas'])
        img = _atlas_frame(at['png'], at['json'], s['frame'])
    elif 'image' in s:
        im = next(i for i in m['images'] if i['key'] == s['image'])
        img = Image.open(os.path.join(ASSETS, im['png'])).convert('RGBA')
    else:
        return None
    return img


def buildings():
    out = []
    for f in FRAGS:
        m = _man(f)
        if not m:
            continue
        for k, s in m.get('sprites', {}).items():
            if isinstance(s, dict) and s.get('kind') in KINDS and (s.get('footprint') or [0])[0] >= MIN_FW:
                out.append((f, k, m))
    return out


# --------------------------------------------------------------------------- measuring
def _components(mask):
    """4-connected blobs of a small boolean mask -> list of (ys, xs) arrays (no scipy on the build machine)."""
    H, W = mask.shape
    seen = np.zeros_like(mask, bool)
    res = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys.tolist(), xs.tolist()):
        if seen[y0, x0]:
            continue
        st = [(y0, x0)]
        seen[y0, x0] = True
        py, px = [], []
        while st:
            y, x = st.pop()
            py.append(y)
            px.append(x)
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    st.append((yy, xx))
        res.append((np.array(py), np.array(px)))
    return res


def _poly_rel(s, ax, ay):
    poly = s.get('footprintPoly')
    if not poly:
        fw, fh = s['footprint']
        return [(-fw / 2, 0), (0, fh / 2), (fw / 2, 0), (0, -fh / 2)]
    P = np.array(poly, np.float32)
    c = P.mean(axis=0)
    if abs(c[0]) > s['footprint'][0] * 0.3 or abs(c[1]) > s['footprint'][1] * 0.6:     # frame coords -> relative
        P = P - np.array([ax, ay], np.float32)
    return [tuple(map(float, p)) for p in P]


def measure(frag, key, man=None):
    m = man or _man(frag)
    s = m['sprites'][key]
    img = sprite_image(frag, key, m)
    if img is None:
        return None
    ax, ay = s['anchor'][0] * img.width, s['anchor'][1] * img.height
    a = np.asarray(img).astype(np.int32)
    al = a[..., 3]
    body = al > 220
    fw = float(s['footprint'][0])
    x0, x1 = int(round(ax - fw * 0.42)), int(round(ax + fw * 0.42))
    tops = {}
    for x in range(max(0, x0), min(img.width, x1)):
        col = np.nonzero(body[:, x])[0]
        if len(col):
            tops[x] = int(col[0])
    if not tops:
        return None
    tv = np.array(list(tops.values()), np.float32)
    roof = float(np.median(tv)) - ay
    top = float(tv.min()) - ay
    poly = _poly_rel(s, ax, ay)
    # lit window panes (warm pale yellow, opaque)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    wm = (al > 200) & (r > 232) & (g > 200) & (b < 215) & (r - b > 35)
    wins = []
    for ys, xs in _components(wm):
        n = len(ys)
        if n < 40:
            continue
        h_, w_ = int(ys.max() - ys.min() + 1), int(xs.max() - xs.min() + 1)
        if h_ < 8 or w_ < 5 or not (0.7 <= h_ / w_ <= 3.4) or n < 0.35 * h_ * w_:
            continue
        wy = float(ys.mean()) - ay
        wx = float(xs.mean()) - ax
        if wy < roof + 6 or wy > -0.18 * float(s.get('topPx', 200)):
            continue
        wins.append((wx, wy, w_, h_, n))
    return dict(img=img, anchor=(ax, ay), spec=s, fw=fw, roof=roof, top=top, poly=poly, wins=wins,
                tops=tops)


def _local_roof(meas, x_rel, half):
    ax = meas['anchor'][0]
    vals = [y for x, y in meas['tops'].items() if abs(x - ax - x_rel) <= half]
    if not vals:
        return meas['roof']
    return float(np.median(vals)) - meas['anchor'][1]


def mount(meas):
    """Mount entry (compact arrays, px relative to the building anchor at scale 1)."""
    fw = meas['fw']
    n = max(1, int(math.ceil(fw / 400.0)))
    share = fw / n
    size = pick_size(0.85 * share)
    span = SPANS[size]
    sc = float(np.clip(0.85 * share / span, SCALE_MIN, SCALE_MAX))
    tp = float(meas['spec'].get('topPx', -meas['top']))
    if tp < LOW_PX:                                         # low open stations / piers / tents: a smaller fire
        sc *= max(0.6, tp / LOW_PX)
    poly = meas['poly']
    # roof long axis (longest footprint edge, screen px) for multi-fire spreads
    edges = [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]
    (p0, p1) = max(edges, key=lambda e: math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]))
    ex, ey = p1[0] - p0[0], p1[1] - p0[1]
    el = math.hypot(ex, ey) or 1.0
    ux, uy = ex / el, ey / el
    if ux < 0:
        ux, uy = -ux, -uy
    fires = []
    for j in range(n):
        off = (j - (n - 1) / 2) * (el * 0.78 / n) if n > 1 else 0.0
        x = ux * off
        y_axis = uy * off
        roof = _local_roof(meas, x, span * sc * 0.35) if n > 1 else meas['roof']
        y = roof + ROOF_K * fw * (1.0 if n == 1 else 0.8) + 0.35 * y_axis
        fires.append([round(x), round(y), 'fx_fire_bld_' + size, round(sc, 3)])
    fires.sort(key=lambda f: f[1])                          # back (higher on screen) first
    for j, f in enumerate(fires):
        f.append(round(1 + 0.01 * j, 2))                   # depth offset over the building
    main = min(fires, key=lambda f: abs(f[0]))
    hpx = HEIGHTS[size] * sc
    smoke = [main[0] + round(8 * sc), round(main[1] - 0.62 * hpx), round(float(np.clip(sc * (0.75 + 0.25 * n), 0.5, 1.2)), 2)]
    embers = [main[0], round(main[1] - 0.3 * hpx)]
    glow = [0, round(main[1] + 4), round(max(1.0, fw / 192.0 * 0.9), 2)]
    alarm = [0, round(meas['top'] - 34)]
    # windows: highest pane on each wall (split at the footprint's front corner)
    front_x = max(poly, key=lambda p: p[1])[0]
    picked, guess = [], False
    for side in ('L', 'R'):
        cand = [w for w in meas['wins'] if (w[0] < front_x - 4) == (side == 'L')]
        cand = [w for w in cand if abs(w[0]) < fw * 0.5]
        if not cand:
            continue
        cand.sort(key=lambda w: (round(w[1] / 12), abs(w[0] - front_x) * -1))
        w = cand[0]
        picked.append([round(w[0]), round(w[1]), side == 'R', round(float(np.clip(w[3] / 28.0, 0.8, 1.15)), 2)])
    if not picked and tp >= LOW_PX:
        guess = True                                        # heuristic wall points, kept only where there IS a wall
        body = np.asarray(meas['img'])[..., 3] > 220
        ax, ay = meas['anchor']
        for dx, flip in ((-0.27 * fw, False), (0.27 * fw, True)):
            dy = -0.33 * tp
            xs = [int(round(ax + dx + o)) for o in (-8, 0, 8)]
            ys = [int(round(ay + dy + o)) for o in (-10, 0, 10)]
            if all(0 <= x < body.shape[1] and 0 <= y < body.shape[0] and body[y, x] for x in xs for y in ys):
                picked.append([round(dx), round(dy), flip, 1.0])
    e = {'fires': fires, 'smoke': smoke, 'embers': embers, 'glow': glow, 'windows': picked, 'alarm': alarm}
    if guess:
        e['windowsGuess'] = True
    return e


def table():
    out = {}
    for frag, key, m in buildings():
        try:
            meas = measure(frag, key, m)
        except Exception as ex:                             # pragma: no cover - keep the build going
            print('  (mount skipped %s/%s: %s)' % (frag, key, ex))
            continue
        if meas is None:
            continue
        e = mount(meas)
        e['fragment'] = frag
        out[key] = e
    return out


# --------------------------------------------------------------------------- preview
def _sheet_frame(key, i=4):
    with open(os.path.join(ASSETS, 'fx_city', 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    s = next(e for e in man['spritesheets'] if e['key'] == key)
    img = Image.open(os.path.join(ASSETS, s['png'])).convert('RGBA')
    fw, fh = s['frameWidth'], s['frameHeight']
    cols = img.width // fw
    i = i % s['frameCount']
    return img.crop(((i % cols) * fw, (i // cols) * fh, (i % cols) * fw + fw, (i // cols) * fh + fh)), s['anchor']


def _put(canvas, img, xy, anchor, scale=1.0, flip=False, alpha=1.0):
    if scale != 1.0:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
        anchor = (1 - anchor[0], anchor[1])
    if alpha < 1:
        a = np.asarray(img).copy()
        a[..., 3] = (a[..., 3] * alpha).astype(np.uint8)
        img = Image.fromarray(a, 'RGBA')
    x, y = round(xy[0] - anchor[0] * img.width), round(xy[1] - anchor[1] * img.height)
    tmp = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    tmp.paste(img, (x, y))
    canvas.alpha_composite(tmp)


def tint(img, rgb):
    a = np.asarray(img).astype(np.float32)
    a[..., :3] *= np.array(rgb, np.float32) / 255.0
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')


def compose_burning(meas, e, frame=4, tint_rgb=(255, 222, 196), smoke=True):
    """The building on fire exactly per its mount entry (fires, glow, windows, smoke, embers) -> (canvas, origin)."""
    img = meas['img']
    ax, ay = meas['anchor']
    pad_t, pad_s = 420, 160
    can = Image.new('RGBA', (img.width + 2 * pad_s, img.height + pad_t), (0, 0, 0, 0))
    O = (pad_s + ax, pad_t + ay)
    glow, ga = _sheet_frame('fx_fire_glow', frame)
    _put(can, tint(img, tint_rgb), (pad_s, pad_t), (0, 0))
    for wx, wy, flip, ws in e['windows']:
        w, wa = _sheet_frame('fx_fire_window', frame + 3)
        _put(can, w, (O[0] + wx, O[1] + wy), wa, scale=ws, flip=flip)
    if smoke:
        sm, sa = _sheet_frame('fx_smoke_column', frame)
        _put(can, sm, (O[0] + e['smoke'][0], O[1] + e['smoke'][1]), sa, scale=e['smoke'][2])
    for fx, fy, key, sc, _dep in e['fires']:
        _put(can, glow, (O[0] + fx, O[1] + fy + 6), ga, scale=sc * 1.3, alpha=0.8)
        fr, fa = _sheet_frame(key, frame)
        _put(can, fr, (O[0] + fx, O[1] + fy), fa, scale=sc)
    em, ea = _sheet_frame('fx_embers', frame)
    _put(can, em, (O[0] + e['embers'][0], O[1] + e['embers'][1]), ea)
    return can, O


def preview(tab=None, out=None, per_row=8, cell=(380, 440)):
    tab = tab or table()
    from gen_fx_city_preview import font
    items = []
    for frag, key, m in buildings():
        if key not in tab:
            continue
        meas = measure(frag, key, m)
        can, O = compose_burning(meas, tab[key])
        bb = can.getbbox()
        if bb:
            can = can.crop(bb)
        sc = min(cell[0] / can.width, (cell[1] - 24) / can.height, 1.0)
        can = can.resize((max(1, round(can.width * sc)), max(1, round(can.height * sc))), Image.LANCZOS)
        items.append((key, tab[key], can, sc))
    rows = (len(items) + per_row - 1) // per_row
    W, H = per_row * cell[0], rows * cell[1] + 40
    sheet = Image.new('RGBA', (W, H), (238, 243, 249, 255))
    d = ImageDraw.Draw(sheet)
    d.text((10, 10), 'fxcity_firemount - every building burning exactly per manifest.fireMount.buildings (fires, '
                     'roof glow, window fires, smoke, embers; building tinted 0xffdec4 like the game)', font=font(16),
           fill=(30, 34, 44))
    for j, (key, e, can, sc) in enumerate(items):
        x0, y0 = (j % per_row) * cell[0], 40 + (j // per_row) * cell[1]
        sheet.alpha_composite(can, (x0 + (cell[0] - can.width) // 2, y0 + cell[1] - 24 - can.height))
        lab = '%s  %s x%d%s' % (key, e['fires'][0][2].replace('fx_fire_bld_', ''), len(e['fires']),
                                ' (win guess)' if e.get('windowsGuess') else '')
        d.text((x0 + 6, y0 + cell[1] - 20), lab, font=font(13), fill=(40, 44, 54))
    out = out or os.path.join(PREV, 'fxcity_firemount.png')
    sheet.convert('RGB').save(out, optimize=True)
    print('firemount preview ->', out, '(%d buildings)' % len(items))
    return out


if __name__ == '__main__':
    t = table()
    print(len(t), 'buildings;', sum(1 for e in t.values() if e.get('windowsGuess')), 'with guessed windows;',
          sum(1 for e in t.values() if len(e['fires']) > 1), 'with several fires')
    preview(t)
