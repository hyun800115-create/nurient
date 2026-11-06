"""
deck43_pack.py - turn the v4.3 step-A renders into assets/deck43/ (no Blender: python3 + numpy + Pillow (+ imagequant)).

    python3 tools/blender/deck43_pack.py [--cache DIR] [--chars DIR] [--quantize auto|on|off] [--prev DIR] [--reuse]

  --reuse  (v4.3 「바다 가까이」) a build or a character anim that is not in the render caches is taken from the pages
           already in assets/deck43 (their frames cut back out of deck43.png / deck43_ch.png, untrimmed, NOT outlined
           again; their manifest entries kept): add one new render (the chief's landing, the chief's `fish` loop)
           without re-rendering the whole deck. Without --reuse every build and every character must be in the caches.

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
BUILDS = ['deck43_t1', 'deck43_t2', 'deck43_t3', 'deck43_rod', 'fish_crate', 'workshop43', 'deck43_landing']
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
                  'plays once (impactFrame 3: the first fish comes then); his `fish` loop (v4.3 sea) is the same '
                  'motion without the line and the float, tipPoints = the rod tip per frame (the game draws the line '
                  'from there to his float on the sea).',
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
        if k == 'deck43_landing':
            # (v4.3 sea) the chief's landing: where he stands, its two posts in the water (foam collars), its plank height
            s['standPoint'] = (pts.get('stand') or [[0, 0]])[0]
            s['postPoints'] = pts.get('post', [])
            s['liftPx'] = round(0.15 * 55.4256)
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


def page_frames(name):
    """(--reuse) the frames of an existing page in assets/deck43, untrimmed (sourceSize), as packed (post / outline done)"""
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
            raise SystemExit('deck43_pack: ABORT - rotated frame %s in %s (cannot reuse)' % (n, name))
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
        out[n] = full
    return out


def old_manifest():
    mp = os.path.join(OUT, 'manifest.json')
    return json.load(open(mp, encoding='utf-8')) if os.path.exists(mp) else {}


def load_chars(cdir, reuse=False):
    import char_pack as cp
    frames, chars = [], {}
    old = old_manifest().get('characters', {}) if reuse else {}
    have = page_frames('deck43_ch') if reuse else {}
    for key in CHARS:
        d = os.path.join(cdir, key)
        mp = os.path.join(d, 'meta.json')
        prev = old.get(key + '_deck43')
        if not os.path.exists(mp) and not prev:
            raise SystemExit('deck43_pack: ABORT - no character renders for %s in %s (deck43_chars.py first)' % (key, cdir))
        meta = json.load(open(mp)) if os.path.exists(mp) else {'anims': {}, 'frameSize': prev['frameSizeOf'],
                                                                 'anchor': prev['anchorOf']}
        if prev and not meta.get('floatPoint') and prev.get('floatPoint'):
            meta['floatPoint'] = prev['floatPoint']
        anims = {}
        # (--reuse) the anims already packed and not rendered again: their frames from the page, their entries kept
        for an, a in (prev or {}).get('anims', {}).items():
            if an in meta['anims']:
                continue
            for dr in a['dirs']:
                for i in range(a['frames']):
                    n = key + '/%s_%s_%d' % (an, dr, i)
                    if n not in have:
                        raise SystemExit('deck43_pack: ABORT - %s is not on the deck43_ch page (cannot reuse)' % n)
                    frames.append((n, have[n]))
            anims[an] = dict(a)
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


def save(name, frames, mode):
    sheet, atlas = pu.pack_atlas(frames, max_width=2048, trim=True, padding=2)
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
    reuse = '--reuse' in args
    keys, builds, _boats, _staff, frames, _bf = bp.load(cache)
    missing = [k for k in BUILDS if k not in builds]
    old_sprites, reused = {}, {}
    if missing and reuse:
        # (v4.3 sea) the builds not rendered again: their frames from the deck43 page, their manifest entries kept
        old_sprites = old_manifest().get('sprites', {})
        have = page_frames('deck43')
        for k in list(missing):
            mine = [n for n in old_sprites if n == k or n.startswith(k + '_')]
            if mine and all(n in have for n in mine):
                for n in mine:
                    frames[n] = have[n]
                reused[k] = mine
                missing.remove(k)
    if missing:
        raise SystemExit('deck43_pack: ABORT - the cache %s lacks %s; nothing was written (deck43_render.py first%s)'
                         % (cache, ', '.join(missing), '' if reuse else ', or --reuse'))
    cframes, chars = load_chars(cdir, reuse)
    os.makedirs(OUT, exist_ok=True)
    names = []
    for k in BUILDS:
        if k in reused:
            names += reused[k]
            continue
        m = builds[k]
        names += m['frames']
        if m.get('overlay'):
            names.append(m['overlay']['key'])
    atlas = save('deck43', [(n, frames[n]) for n in names], mode)
    frame_atlas = {n: 'deck43' for n in atlas['frames']}
    sprites = {}
    for k in BUILDS:
        if k in reused:
            for n in reused[k]:
                sprites[n] = dict(old_sprites[n], atlas=frame_atlas[n])
            continue
        sprites.update(build_entries(k, builds[k], frame_atlas))
    if reused:
        print('reused from the pages: %s' % ', '.join(sorted(reused)))
    save('deck43_ch', cframes, mode)
    man = {'version': 1, 'generator': 'tools/blender/deck43_render.py + deck43_chars.py + deck43_pack.py (v4.3 step A: '
                                      'the fishing deck, its rods, the fish crate, the 옷·신발 공방, the deck anims; '
                                      '「바다 가까이」: the chief\'s landing, his `fish` loop)',
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
