"""
deck43_pack.py - turn the v4.3 step-A renders into assets/deck43/ (no Blender: python3 + numpy + Pillow (+ imagequant)).

    python3 tools/blender/deck43_pack.py [--cache DIR] [--chars DIR] [--quantize auto|on|off] [--prev DIR]

  1. buildings (deck43_render.py cache, bld_render sidecars): the SAME post as the props / v3 buildings / the stall
     (bld_pack.load: clean_alpha + tint_shadow + border_fade; a deck tier's front layer = its frame x the object mask)
     -> atlas `deck43` (deck43_t1..3_back / _front, deck43_rod_idle / _bite / _hooked, fish_crate, workshop43)
  2. characters (deck43_chars.py cache): the characters' ink outline (char_pack.ink_outline) -> atlas `deck43_ch` with
     frames named <key>/<anim>_<dir>_<i>; the manifest's `characters` add the anims to the existing characters
     (`extends`: player + reel; fisherman / fisherman_b / fisherman_c + fsit_cast / fsit_wait / fsit_bite / fsit_reel,
     each anim naming its atlas and its frameName)
  3. assets/deck43/manifest.json (sprites: anchors, footprints, overlay, stoolPoints, tipPoint, signQuad, fxPoints)
The game loads assets/deck43 at boot (src/core/Assets.js FRAGMENTS 'deck43'): the deck is on screen at second 0.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import bld_pack as bp    # noqa: E402

OUT = os.path.join(GAME, 'assets', 'deck43')
TMP = __import__('tempfile').gettempdir()
DEFAULT_CACHE = os.path.join(TMP, 'fv_cache', 'deck43')
DEFAULT_CHARS = os.path.join(TMP, 'fv_cache', 'deck43_chars')
PAGE_BUDGET = 1.0 * 1048576
BUILDS = ['deck43_t1', 'deck43_t2', 'deck43_t3', 'deck43_rod', 'fish_crate', 'workshop43']
CHARS = {'player': 'player', 'fisherman': 'fisherman', 'fisherman_b': 'fisherman_b', 'fisherman_c': 'fisherman_c'}

CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame. deck43_t<n>: the water-plane point under the 1단 '
              'centre (world.js WORLD.deck x, y; every tier the same); deck43_rod: the holder foot on the planks; '
              'fish_crate / workshop43: the footprint centre.',
    'layers': 'deck43_t<n>_back = the whole deck; deck43_t<n>_front = only the near rails, the gangway near rail and '
              'the 3단 roof (same frame + anchor). Draw back (depth d), the fishers on the deck (d + 0.4, lifted '
              'deckLiftPx), front (d + 0.6).',
    'points': 'every *Point(s) value is a px offset [dx, dy] from the sprite anchor (unscaled sprite).',
    'characters': 'extends: the anims join the existing character (each names its atlas deck43_ch and its frameName '
                  '<key>/<anim>_<dir>_<i>). Seated fisher frames (fsit_*) are 160 x 160 with the anchor at the floor '
                  'under the stool (normalised as every character); dirs NE only (he faces the sea). The chief\'s reel '
                  'plays once (impactFrame 3: the first fish comes then).',
}


def build_entries(k, m, frame_atlas):
    out = {}
    pts_all = m.get('framePoints', {})
    for n in m['frames']:
        pts = pts_all.get(n, {})
        s = {'atlas': frame_atlas[n], 'frame': n, 'anchor': m['anchor'], 'kind': 'building' if k != 'deck43_rod' else 'prop',
             'frameSize': m['frameSize'], 'topPx': m['topPx'].get(n) if isinstance(m['topPx'], dict) else m['topPx'],
             'front': m.get('front', '-Y'), 'notes': m.get('notes', '')}
        if m.get('footprint'):
            s['footprint'] = m['footprint']
            s['footprintM'] = m['footprintM']
        if m.get('fxPoints'):
            s['fxPoints'] = m['fxPoints']
        if k.startswith('deck43_t'):
            s['stoolPoints'] = pts.get('stool', [])
            s['footPoint'] = (pts.get('foot') or [[0, 0]])[0]
            s['deckLiftPx'] = round(m.get('deckZ', 0.3) * 55.4256)
            s['tier'] = int(k[-1])
        if k == 'deck43_rod':
            s['tipPoint'] = (pts.get('tip') or [[30, -62]])[0]
            s['state'] = n.rsplit('_', 1)[1]
        if k == 'workshop43':
            s['signQuad'] = pts.get('sign', [])
            s['signText'] = 'sign_workshop43'
            s['signColor'] = '#5A3418'
        ov = m.get('overlay')
        if ov and ov['of'] == n:
            s['overlay'] = ov['key']
            out[ov['key']] = {'atlas': frame_atlas[ov['key']], 'frame': ov['key'], 'anchor': m['anchor'], 'kind': 'overlay',
                              'of': n, 'frameSize': m['frameSize'],
                              'notes': 'Front layer of %s (same frame + anchor): %s.' % (n, ov['notes'])}
        out[n] = s
    return out


def load_chars(cdir):
    import char_pack as cp
    frames, chars = [], {}
    for key in CHARS:
        d = os.path.join(cdir, key)
        mp = os.path.join(d, 'meta.json')
        if not os.path.exists(mp):
            raise SystemExit('deck43_pack: ABORT - no character renders for %s in %s (deck43_chars.py first)' % (key, cdir))
        meta = json.load(open(mp))
        anims = {}
        for an, info in meta['anims'].items():
            for dr in info['dirs']:
                for i in range(info['frames']):
                    n = '%s_%s_%d' % (an, dr, i)
                    p = os.path.join(d, n + '.png')
                    if not os.path.exists(p):
                        raise SystemExit('deck43_pack: ABORT - missing %s' % p)
                    frames.append((key + '/' + n, cp.ink_outline(Image.open(p))))
            a = {k2: v for k2, v in info.items()}
            a['atlas'] = 'deck43_ch'
            a['frameName'] = key + '/{anim}_{dir}_{i}'
            anims[an] = a
        c = {'extends': CHARS[key], 'atlas': 'deck43_ch', 'anims': anims,
             'frameSizeOf': meta['frameSize'], 'anchorOf': meta['anchor']}
        if meta.get('floatPoint'):
            c['floatPoint'] = meta['floatPoint']
        chars[key + '_deck43'] = c
    return frames, chars


def best_width(frames, pad=2):
    """((v4.3 review CD-2) the shelf width (multiple of 4) that gives pack_atlas its smallest sheet: the deck pages are
    resident all game (boot), 2048-wide shelves left 40 % of deck43 empty (3.96 -> 2.88 MiB, deck43_ch 2.09 -> 1.64)"""
    sizes = []
    for _n, im in frames:
        b = pu._trim_box(im.convert('RGBA'))
        sizes.append((b[2] - b[0], b[3] - b[1]))
    order = sorted(sizes, key=lambda s: (-s[1], -s[0]))
    best = None
    for mw in range((max(w for w, _h in sizes) + 3) // 4 * 4, 2049, 4):
        x = y = sh = used = 0
        for w, h in order:
            if x + w > mw and x > 0:
                x, y, sh = 0, y + sh + pad, 0
            used = max(used, x + w); x += w + pad; sh = max(sh, h)
        area = min(pu._pow2ish(used), max(mw, used)) * pu._pow2ish(y + sh)
        if best is None or area < best[0]:
            best = (area, mw)
    return best[1]


def save(name, frames, mode):
    sheet, atlas = pu.pack_atlas(frames, max_width=best_width(frames), trim=True, padding=2)
    png, js = os.path.join(OUT, name + '.png'), os.path.join(OUT, name + '.json')
    pu.save_atlas(sheet, atlas, png, js, quantize=False)
    size = os.path.getsize(png)
    if mode == 'on' or (mode == 'auto' and size > PAGE_BUDGET):
        try:
            bp.quantize(sheet).save(png, optimize=True)
            print('  %s palettised (%d KB RGBA -> %d KB)' % (name, size // 1024, os.path.getsize(png) // 1024))
        except ImportError:
            print('  imagequant not installed -> kept RGBA')
    print('%-10s %4dx%-4d %3d frames %7.1f KB  (GPU %.2f MiB)' % (name, sheet.width, sheet.height, len(atlas['frames']),
                                                                 os.path.getsize(png) / 1024.0,
                                                                 sheet.width * sheet.height * 4 / 1048576.0))
    return atlas


def preview(frames, path):
    names = ['deck43_t1_back', 'deck43_t2_back', 'deck43_t3_back', 'deck43_rod_idle', 'deck43_rod_bite', 'deck43_rod_hooked',
             'fish_crate', 'workshop43']
    ims = [frames[n] for n in names if n in frames]
    W = sum(i.width for i in ims) + 10 * len(ims)
    H = max(i.height for i in ims) + 20
    cv = Image.new('RGBA', (W, H), (120, 168, 210, 255))
    x = 0
    d = ImageDraw.Draw(cv)
    for n, i in zip(names, ims):
        cv.alpha_composite(i, (x, 20))
        d.text((x + 4, 4), n, fill=(0, 0, 0, 255))
        x += i.width + 10
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cv.convert('RGB').save(path)
    print('preview', path)


def main():
    args = sys.argv[1:]

    def opt(k, d=None):
        return args[args.index(k) + 1] if k in args else d
    cache, cdir = opt('--cache', DEFAULT_CACHE), opt('--chars', DEFAULT_CHARS)
    mode = opt('--quantize', 'auto')
    keys, builds, _boats, _staff, frames, _bf = bp.load(cache)
    missing = [k for k in BUILDS if k not in builds]
    if missing:
        raise SystemExit('deck43_pack: ABORT - the cache %s lacks %s; nothing was written (deck43_render.py first)'
                         % (cache, ', '.join(missing)))
    cframes, chars = load_chars(cdir)
    os.makedirs(OUT, exist_ok=True)
    names = []
    for k in BUILDS:
        m = builds[k]
        names += m['frames']
        if m.get('overlay'):
            names.append(m['overlay']['key'])
    atlas = save('deck43', [(n, frames[n]) for n in names], mode)
    frame_atlas = {n: 'deck43' for n in atlas['frames']}
    sprites = {}
    for k in BUILDS:
        sprites.update(build_entries(k, builds[k], frame_atlas))
    save('deck43_ch', cframes, mode)
    man = {'version': 1, 'generator': 'tools/blender/deck43_render.py + deck43_chars.py + deck43_pack.py (v4.3 step A: '
                                      'the fishing deck, its rods, the fish crate, the 옷·신발 공방, the deck anims)',
           'conventions': CONVENTIONS,
           'atlases': [{'key': 'deck43', 'png': 'deck43/deck43.png', 'json': 'deck43/deck43.json'},
                       {'key': 'deck43_ch', 'png': 'deck43/deck43_ch.png', 'json': 'deck43/deck43_ch.json'}],
           'sprites': sprites, 'characters': chars}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print('wrote', os.path.join(OUT, 'manifest.json'), '(%d sprites, %d characters)' % (len(sprites), len(chars)))
    if opt('--prev'):
        preview(frames, os.path.join(opt('--prev'), 'deck43_sheet.png'))


if __name__ == '__main__':
    main()
