"""
market_pack.py - turn the stall renders (market_render.py cache) into assets/market/: one trimmed Phaser atlas per
stage (market_s1.png/.json) + manifest.json.  No Blender needed: python3 with numpy + Pillow (+ imagequant).

    python3 tools/blender/market_pack.py [--cache DIR] [--prev DIR] [--quantize auto|on|off]

  1. reads <cache>/<stage>.json sidecars (bld_render format + the object-mask overlay of market_render.py)
  2. the SAME post as the props / v3 buildings (bld_pack.load: clean_alpha + tint_shadow + border_fade; the front
     layer = the base frame x the object mask)
  3. atlas per stage (assets/market/<stage>.png/.json); palettised with libimagequant when the RGBA file is over
     the 1 MB per page budget (--quantize auto)
  4. assets/market/manifest.json: <stage>_back (staffPoints / staffDirs / staffDepth "front" / overlay /
     stepLiftPx / customerPoints / signQuad / fxPoints) + <stage>_front (kind overlay)
  5. --prev DIR: a look-dev sheet <DIR>/market_stages.png (the docs folder is not written by default)
Guard: it refuses (exit 1, nothing written) when a stage of the current manifest has no render in the cache.
The game loads assets/market at boot (src/core/Assets.js FRAGMENTS 'market'): the first stall is on screen at
second 0 of a new game.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import bld_pack as bp    # noqa: E402  (read-only reuse: load = post-processing + overlay cut, quantize)

OUT = os.path.join(GAME, 'assets', 'market')
DEFAULT_CACHE = os.path.join(__import__('tempfile').gettempdir(), 'fv_cache', 'market')
PAGE_BUDGET = 1.0 * 1048576
SIGN = {'market_s1': {'text': 'sign_market_1', 'color': '#6E3E1E'},
        'market_s2': {'text': 'sign_market_2', 'color': '#6E3E1E', 'plates': ['plate_mat', 'plate_food'],
                      'counters': ['mat', 'food']},
        'market_s3': {'text': 'sign_market_3', 'color': '#6E3E1E', 'plates': ['plate_mat', 'plate_fish', 'plate_breadmeat'],
                      'counters': ['mat', 'fish', 'breadmeat']},
        # ((v4.3 step B, M) stage 4 「눈꽃마을 시장」: the same three counters (bread sells at the bakery), the 자재 counter with a
        #  second window (staff2 / customer2 / register2 points)
        'market_s4': {'text': 'sign_market_4', 'color': '#6E3E1E', 'plates': ['plate_mat', 'plate_fish', 'plate_meat'],
                      'counters': ['mat', 'fish', 'meat']}}
# ((v4.3) the stage pages after the first load while the village plays (Assets.js MARKET_LATE): stage 1 is in the boot set)

CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre.',
    'layers': '<stage>_back = the whole stall (posts, shelf, signboard, step, counter); <stage>_front = only the '
              'counter and what stands on it (same frame + anchor). Draw back (depth d), the clerk at '
              'staffPoints[0] lifted by stepLiftPx (d + 0.5), front (d + 1).',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the sprite anchor (unscaled sprite).',
    'staffPoints': 'the clerk\'s feet on the plank step, projected to the ground (z = 0); stepLiftPx = how far the '
                   'sprite is drawn higher because the clerk stands on the step.',
    'customerPoints': 'where the first customer of the line stands: diagonally front-left of the clerk, so the '
                      'front customer does not stand between the camera and the clerk.',
    'signQuad': 'the 4 corners [top-left, top-right, bottom-right, bottom-left] of the blank signboard face (it faces '
                'world -Y: the top edge slopes down to the right, 1 px down per 2 px across). The game writes the '
                'stage name (signText = a strings.js key) into it, sheared the same way.',
}


def entries(k, m, frame_atlas):
    first = m['frames'][0]
    pts = m['framePoints'][first]
    dirs = m.get('frameDirs', {}).get(first, {})
    staff, step = pts['staff'][0], pts['step'][0]
    sg = SIGN.get(k, {})
    s = {'atlas': frame_atlas[first], 'frame': first, 'anchor': m['anchor'], 'kind': 'building',
         'footprint': m['footprint'], 'footprintM': m['footprintM'], 'frameSize': m['frameSize'],
         'topPx': m['topPx'].get(first) if isinstance(m['topPx'], dict) else m['topPx'], 'front': m.get('front', '-Y'),
         'staffPoints': pts['staff'] if sg.get('counters') else [staff],
         'staffDirs': dirs.get('staff', ['SW'])[:len(pts['staff']) if sg.get('counters') else 1], 'staffDepth': 'front',
         'stepLiftPx': int(staff[1] - step[1]), 'stepM': m.get('stepH'), 'counterM': m.get('counterH'),
         'signTopM': m.get('signTop'),
         'customerPoints': pts.get('customer', []), 'customerDirs': dirs.get('customer', []),
         'signQuad': pts['sign'], 'signText': SIGN.get(k, {}).get('text'), 'signColor': SIGN.get(k, {}).get('color'),
         'overlay': m['overlay']['key'], 'stage': int(k.rsplit('_s', 1)[1]) if '_s' in k else 1,
         'notes': m.get('notes', '')}
    if m.get('fxPoints'):
        s['fxPoints'] = m['fxPoints']
    # ((v4.3) stages 2-3: one counter per staff / customer / register point (west -> east) and a name plate over each)
    if sg.get('counters'):
        s['counters'] = sg['counters']
        s['registerPoints'] = pts.get('register', [])
        s['plates'] = [{'quad': pts['plate%d' % i], 'text': t} for i, t in enumerate(sg.get('plates', []))
                       if 'plate%d' % i in pts]
    # ((v4.3 step B, M) the 자재 counter's second window (stage 4): its clerk post, merchant spot and register pad
    for mk, fld in (('staff2', 'staff2Points'), ('customer2', 'customer2Points'), ('register2', 'register2Points')):
        if pts.get(mk):
            s[fld] = pts[mk]
    ov = m['overlay']['key']
    o = {'atlas': frame_atlas[ov], 'frame': ov, 'anchor': m['anchor'], 'kind': 'overlay', 'of': first,
         'frameSize': m['frameSize'],
         'notes': 'Front layer of %s (same frame + anchor): %s. Draw it ABOVE the clerk (d + 1).' % (first,
                                                                                                   m['overlay']['notes'])}
    return {first: s, ov: o}


def preview(keys, builds, frames, path):
    cells = []
    for k in keys:
        m = builds[k]
        base = frames[m['frames'][0]]
        ov = frames[m['overlay']['key']]
        cv = Image.new('RGBA', (base.width * 2 + 30, base.height + 30), (200, 132, 104, 255))
        cv.alpha_composite(base, (10, 20))
        ax, ay = m['anchorPx']
        d = ImageDraw.Draw(cv)
        pts = m['framePoints'][m['frames'][0]]
        q = [(10 + ax + x, 20 + ay + y) for x, y in pts['sign']]
        d.polygon(q, outline=(40, 120, 220, 255))
        sx, sy = pts['staff'][0]
        d.ellipse((10 + ax + sx - 4, 20 + ay + sy - 4, 10 + ax + sx + 4, 20 + ay + sy + 4), outline=(220, 40, 40, 255))
        cv.alpha_composite(ov, (base.width + 20, 20))
        d.text((10, 4), k + '  back | front', fill=(0, 0, 0, 255))
        cells.append(cv)
    W = max(c.width for c in cells)
    sheet = Image.new('RGBA', (W, sum(c.height for c in cells)), (200, 132, 104, 255))
    y = 0
    for c in cells:
        sheet.alpha_composite(c, (0, y))
        y += c.height
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.convert('RGB').save(path)
    print('preview', path)


# ((v4.3 review CD-2) props packed on more pages than their own: prop key -> the extra pages
#  ((v4.3 step B, M — TX-5) + the stage-4 page: at stage 4 neither earlier page is loaded)
ALSO = {'market_sled': ['market_s3', 'market_s4']}


def page_frames(name):
    """((v4.3 step B, M) the frames of a page already in assets/market, untrimmed (sourceSize), as packed - a prop that is
    not in the render cache (the sled) rides on a new page from there, pixel for pixel"""
    jp, pp = os.path.join(OUT, name + '.json'), os.path.join(OUT, name + '.png')
    if not (os.path.exists(jp) and os.path.exists(pp)):
        return {}
    js = json.load(open(jp, encoding='utf-8'))
    sheet = Image.open(pp).convert('RGBA')
    fr = js['frames'] if isinstance(js['frames'], dict) else {f['filename']: f for f in js['frames']}
    out = {}
    for n, f in fr.items():
        r, ss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
        if f.get('rotated'):
            continue
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
        out[n] = full
    return out


def pack_compact(frames, pad=2):
    """((v4.3 step B, M) a new stage page as small as it gets (it is resident while the village plays at that stage): the
    tallest frame at the left, the others in columns beside it (each column no taller than it), or pack_atlas's shelves at
    their best width - whichever sheet is smaller. Same atlas format as pack_utils.pack_atlas"""
    items = []
    for name, im in frames:
        im = im.convert('RGBA')
        box = pu._trim_box(im)
        items.append((name, im.size, box, im.crop(box)))
    order = sorted(range(len(items)), key=lambda i: (-items[i][3].height, -items[i][3].width))

    def columns():
        H = items[order[0]][3].height
        place, x, y, colw, used = {}, 0, 0, 0, 0
        for i in order:
            w, h = items[i][3].size
            if y > 0 and y + h > H:
                x, y, colw = x + colw + pad, 0, 0
            place[i] = (x, y)
            used = max(used, x + w)
            y += h + pad
            colw = max(colw, w)
        return place, used, H

    def shelves(mw):
        place, x, y, sh, used = {}, 0, 0, 0, 0
        for i in order:
            w, h = items[i][3].size
            if x + w > mw and x > 0:
                x, y, sh = 0, y + sh + pad, 0
            place[i] = (x, y)
            used = max(used, x + w)
            x += w + pad
            sh = max(sh, h)
        return place, used, y + sh
    cands = [columns()]
    for mw in range((max(it[3].width for it in items) + 3) // 4 * 4, 2049, 8):
        cands.append(shelves(mw))
    place, used, total = min(cands, key=lambda c: pu._pow2ish(c[1]) * pu._pow2ish(c[2]))
    sw, sh = pu._pow2ish(used), pu._pow2ish(total)
    sheet = Image.new('RGBA', (sw, sh), (0, 0, 0, 0))
    af = {}
    for i, (name, (w0, h0), box, crop) in enumerate(items):
        px_, py_ = place[i]
        sheet.paste(crop, (px_, py_))
        af[name] = {'frame': {'x': px_, 'y': py_, 'w': crop.width, 'h': crop.height}, 'rotated': False,
                    'trimmed': (crop.width, crop.height) != (w0, h0),
                    'spriteSourceSize': {'x': box[0], 'y': box[1], 'w': crop.width, 'h': crop.height},
                    'sourceSize': {'w': w0, 'h': h0}}
    return sheet, {'frames': af, 'meta': {'app': 'frost-village/tools/blender/market_pack.py', 'version': '1.0', 'image': '',
                                          'format': 'RGBA8888', 'size': {'w': sw, 'h': sh}, 'scale': '1'}}


def main():
    args = sys.argv[1:]

    def opt(k, d=None):
        return args[args.index(k) + 1] if k in args else d
    cache = opt('--cache', DEFAULT_CACHE)
    prev = opt('--prev')
    mode = opt('--quantize', 'auto')
    if not os.path.isdir(cache):
        raise SystemExit('market_pack: no render cache %s - run market_render.py first' % cache)
    keys, builds, _boats, _staff, frames, _bf = bp.load(cache)
    # ((v4.3) plain props (no front layer: the old sled) ride on a stage's page (their spec's atlas)
    props = [k for k in keys if k.startswith('market_') and not builds[k].get('overlay')]
    keys = [k for k in keys if k.startswith('market_') and builds[k].get('overlay')]
    # ((v4.3 review CD-2) a prop that also rides on a later stage's page, as <prop>_<s3>: at stage 3 the stage-2 page is
    #  never loaded (Game.lazyAllowed), the sled shows from the stage-3 page)
    dup = {q: ['%s_%s' % (q, a.split('_')[-1]) for a in ALSO.get(q, [])] for q in props}
    for q in props:
        for n in dup[q]:
            frames[n] = frames[builds[q]['frames'][0]]
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else {}
    # ((v4.3 step B, M) a prop of ALSO that is not in the render cache (only the new stage was rendered): its copy for a new
    #  page comes from a page already packed (the sled: market_sled_s3 on market_s3), with its manifest entry
    reuse = {}
    for q, pages in ALSO.items():
        if q in builds:
            continue
        for a in pages:
            if a not in keys:
                continue
            src_n = None
            for b in [q] + ['%s_%s' % (q, p.split('_')[-1]) for p in pages]:
                spr = (old.get('sprites') or {}).get(b)
                if spr and spr.get('atlas') not in keys:
                    fr = page_frames(spr['atlas']).get(spr['frame'])
                    if fr is not None:
                        src_n = (b, spr, fr)
                        break
            if src_n:
                n = '%s_%s' % (q, a.split('_')[-1])
                frames[n] = src_n[2]
                reuse[n] = (a, dict(src_n[1]))
    have = {e for k in keys for e in (builds[k]['frames'][0], builds[k]['overlay']['key'])} | {builds[k]['frames'][0] for k in props} | {n for q in props for n in dup[q]} | set(reuse)
    # ((v4.3) a stage of the current manifest that is not in the cache is KEPT as it is (its atlas files and manifest
    #  entries untouched: the shipped stage 1 stays byte-identical) - only when its files are there)
    kept_atl, kept_spr = [], {}
    for a in old.get('atlases') or []:
        if a['key'] in keys:
            continue
        if not (os.path.exists(os.path.join(GAME, 'assets', a['png'])) and os.path.exists(os.path.join(GAME, 'assets', a['json']))):
            continue
        kept_atl.append(a)
        for n, sp in (old.get('sprites') or {}).items():
            if sp.get('atlas') == a['key']:
                kept_spr[n] = sp
    missing = sorted(set((old.get('sprites') or {}).keys()) - have - set(kept_spr))
    if not keys or missing:
        raise SystemExit('market_pack: ABORT - the cache %s lacks %s; nothing was written (render them first: '
                         'market_render.py)' % (cache, ', '.join(missing) or 'every stage'))
    if kept_atl:
        print('kept as they are:', ', '.join(a['key'] for a in kept_atl))
    os.makedirs(OUT, exist_ok=True)
    atlases, sprites, frame_atlas = list(kept_atl), dict(kept_spr), {}
    for k in keys:
        m = builds[k]
        names = [m['frames'][0], m['overlay']['key']] + [builds[q]['frames'][0] for q in props if builds[q]['atlas'] == k] \
            + ['%s_%s' % (q, k.split('_')[-1]) for q in props if k in ALSO.get(q, [])] + [n for n in reuse if reuse[n][0] == k]
        # ((v4.3 step B, M) stages from 4 on: the smallest sheet (pack_compact); the shipped stages keep their packing
        if int(k.rsplit('_s', 1)[1]) >= 4:
            sheet, atlas = pack_compact([(n, frames[n]) for n in names])
        else:
            sheet, atlas = pu.pack_atlas([(n, frames[n]) for n in names], max_width=2048, trim=True, padding=2)
        png, js = os.path.join(OUT, k + '.png'), os.path.join(OUT, k + '.json')
        pu.save_atlas(sheet, atlas, png, js, quantize=False)
        size = os.path.getsize(png)
        if mode == 'on' or (mode == 'auto' and size > PAGE_BUDGET):
            try:
                bp.quantize(sheet).save(png, optimize=True)
                print('  %s palettised (%d KB RGBA -> %d KB)' % (k, size // 1024, os.path.getsize(png) // 1024))
            except ImportError:
                print('  imagequant not installed -> kept RGBA')
        for n in atlas['frames']:
            frame_atlas[n] = k
        atlases.append({'key': k, 'png': 'market/%s.png' % k, 'json': 'market/%s.json' % k})
        sprites.update(entries(k, m, frame_atlas))
        for q in props:
            pm = builds[q]
            if pm['atlas'] != k and k not in ALSO.get(q, []):
                continue
            sq = q if pm['atlas'] == k else '%s_%s' % (q, k.split('_')[-1])
            sprites[sq] = {'atlas': k, 'frame': pm['frames'][0] if sq == q else sq, 'anchor': pm['anchor'], 'kind': 'prop',
                          'footprint': pm.get('footprint'), 'footprintM': pm.get('footprintM'), 'frameSize': pm['frameSize'],
                          'topPx': pm['topPx'].get(pm['frames'][0]) if isinstance(pm['topPx'], dict) else pm['topPx'],
                          'front': pm.get('front', '-Y'), 'notes': pm.get('notes', '')}
        for n in reuse:
            if reuse[n][0] == k:
                e = dict(reuse[n][1])
                e.update({'atlas': k, 'frame': n})
                e['notes'] = 'The old sled on the %s page (copied pixel for pixel from %s): at stage %s the earlier pages are ' \
                             'not loaded.' % (k, reuse[n][1].get('atlas'), k.split('_s')[-1])
                sprites[n] = e
        print('%-10s %4dx%-4d %d frames %6.1f KB  (GPU %.2f MiB)' % (k, sheet.width, sheet.height,
                                                                   len(atlas['frames']), os.path.getsize(png) / 1024.0,
                                                                   sheet.width * sheet.height * 4 / 1048576.0))
    man = {'version': 1, 'generator': 'tools/blender/market_render.py + market_pack.py (v4.2.0.2 M1: the first '
                                      'shop\'s stall stages)', 'conventions': CONVENTIONS,
           'atlases': atlases, 'sprites': sprites}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('wrote', man_path, '(%d sprites)' % len(sprites))
    if prev:
        preview(keys, builds, frames, os.path.join(prev, 'market_stages.png'))


if __name__ == '__main__':
    main()
