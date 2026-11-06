#!/usr/bin/env python3
"""patch_sprites.py - patch an existing title diorama bake after a change of src/title/layout.js OBJECTS, without a
full bake.  Called by `node tools/title/bake_title.mjs --patch [--out <bake dir>]`:

    python3 tools/title/patch_sprites.py <work dir> <bake dir>

Input : <work>/pieces.json + <work>/pieces/*.png from bake_title.mjs --patch: the sprite pieces of the keys to re-bake
        (`patch.changed`: new in the layout, stage moved, or asked for) and the keys the layout no longer has
        (`patch.gone`).
Output: in <bake dir>, rewritten in place:
  * the sprite entries of `changed` / `gone` leave title_bake.json, with their frames (picture, anim frames, night
    glow); the new pieces join it with exactly title_pack.py's rules (live pictures keep only their glow; NO_GLOW),
  * only the stage pages that lose or gain a frame are re-packed: their other frames are decoded from the page and
    re-encoded with title_pack's webp settings, into the smallest single page (patch_actor.py's pack_small; several
    pages when one does not fit),
  * the tex ids of every frame on those pages (sprites and actors), the files' sizes / bytes, groupBytes and
    totalBytes.  Every other page, the ground layers and the actors' pictures are left byte for byte.
Why: (v4.3) a full bake re-renders every page from today's art and, in today's headless Chromium, clips the island's
base ground layer (its blurred shallow-water ring); the v4.3 title change only swaps two stage-1 pictures.
Deterministic: same input -> byte-identical output.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import title_pack as tp          # noqa: E402  (pack_group, glow_piece, window_mask, NO_GLOW, webp settings)
from patch_actor import pack_small   # noqa: E402  (title_pack's MaxRects into the smallest single page)


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def page_frames(bake, tex):
    """{name: (piece, tx, ty, sw, sh)} of one page"""
    pj = load(os.path.join(bake, tex + '.json'))
    sheet = Image.open(os.path.join(bake, tex + '.webp')).convert('RGBA')
    out = {}
    for name, fr in pj['frames'].items():
        f = fr['frame']
        out[name] = (sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), fr['spriteSourceSize']['x'],
                     fr['spriteSourceSize']['y'], fr['sourceSize']['w'], fr['sourceSize']['h'])
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    work, bake = sys.argv[1], os.path.abspath(sys.argv[2])
    meta = load(os.path.join(work, 'pieces.json'))
    man = load(os.path.join(bake, 'title_bake.json'))
    patch = meta.get('patch') or {}
    changed, gone = list(patch.get('changed') or []), list(patch.get('gone') or [])

    # ---- what leaves: the sprite entries and every frame they own
    drop = set()
    for k in sorted(set(changed) | set(gone)):
        sp = man['sprites'].pop(k, None)
        if not sp:
            continue
        if sp.get('frame'):
            drop.add(sp['frame'])
        if sp.get('glow'):
            drop.add(sp['glow']['frame'])
        for _, f in (sp.get('anim') or {}).get('frames', []):
            drop.add(f)

    # ---- what comes: title_pack.main's sprite rules
    new = {}                                              # frame name -> (group, piece, tx, ty, sw, sh)
    glows = []
    animated = set(p['key'] for p in meta['sprites'] if p.get('animOf'))

    def add_frame(name, group, im, sw, sh, tx, ty):
        new[name] = (max(1, min(4, int(group))), im, int(tx), int(ty), int(sw), int(sh))

    for p in meta['sprites']:
        im = Image.open(os.path.join(work, 'pieces', p['file'])).convert('RGBA')
        if p.get('empty'):
            continue
        key = p['key']
        if not p.get('live') and not (key in animated and not p.get('animOf')):
            add_frame(p['name'], p['stage'], im, p['sw'], p['sh'], p['tx'], p['ty'])
        if p.get('animOf'):
            sp = man['sprites'].setdefault(key, {})
            an = sp.setdefault('anim', {'name': p['anim'], 'fps': p['fps'], 'frames': []})
            an['frames'].append(p['name'])
            continue
        sp = man['sprites'].setdefault(key, {})
        sp.update({'ox': round(p['ax'] / p['sw'], 5), 'oy': round(p['ay'] / p['sh'], 5), 'scale': p['scale'],
                   'stage': p['stage'], 'topPx': p.get('topPx', 0)})
        if p.get('live'):
            sp['live'] = True
        elif key not in animated:
            sp['frame'] = p['name']
        if p.get('fx'):
            sp['fx'] = p['fx']
        if not key.startswith(tp.NO_GLOW):
            gp = tp.glow_piece(im)
            if gp:
                gim, pad, (gx0, gy0) = gp
                gname = key + '#glow'
                add_frame(gname, p['stage'], gim, gim.size[0], gim.size[1], 0, 0)
                ax_t = p['ax'] - p['tx']
                ay_t = p['ay'] - p['ty']
                gax = (ax_t + pad) * tp.GLOW_RES - gx0
                gay = (ay_t + pad) * tp.GLOW_RES - gy0
                sp['glow'] = {'frame': gname, 'ox': round(gax / gim.size[0], 5), 'oy': round(gay / gim.size[1], 5), 'res': tp.GLOW_RES}
                glows.append((key, int(tp.window_mask(im).sum())))

    # ---- which stage pages change
    touched = set(g for g, *_ in new.values())
    for g, grp in man['groups'].items():
        for tex in grp['atlases']:
            if drop & set(load(os.path.join(bake, tex + '.json'))['frames']):
                touched.add(int(g))

    ftex = {}                                             # frame name -> page key (frames of the re-packed groups)
    for g in sorted(touched):
        grp = man['groups'].setdefault(str(g), {'atlases': [], 'images': []})
        items, info = [], {}
        for tex in grp['atlases']:
            for name, (im, tx, ty, sw, sh) in sorted(page_frames(bake, tex).items()):
                if name in drop:
                    continue
                items.append((name, im))
                info[name] = (tx, ty, sw, sh)
        for name, (gg, im, tx, ty, sw, sh) in sorted(new.items()):
            if gg == g:
                items.append((name, im))
                info[name] = (tx, ty, sw, sh)
        old = list(grp['atlases'])
        for tex in old:
            for ext in ('.webp', '.json'):
                fp = os.path.join(bake, tex + ext)
                if os.path.exists(fp):
                    os.remove(fp)
            man['files'].pop(tex, None)
        grp['atlases'] = []
        if not items:
            continue
        one = pack_small(items)
        pages = [one] if one else tp.pack_group(items)
        lookup = dict(items)
        for n, pg in enumerate(pages):
            key = 'ttl_%d_%d' % (g, n)
            W, H = pg['w'], pg['h']
            sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            fr = {}
            for name in sorted(pg['place']):
                x, y = pg['place'][name]
                im = lookup[name]
                sheet.paste(im, (x, y))
                tx, ty, sw, sh = info[name]
                fr[name] = {'frame': {'x': x, 'y': y, 'w': im.width, 'h': im.height}, 'rotated': False,
                            'trimmed': (im.width, im.height) != (sw, sh),
                            'spriteSourceSize': {'x': tx, 'y': ty, 'w': im.width, 'h': im.height},
                            'sourceSize': {'w': sw, 'h': sh}}
                ftex[name] = key
            img = key + '.webp'
            sheet.save(os.path.join(bake, img), 'WEBP', quality=tp.Q_SPRITE, alpha_quality=tp.Q_ALPHA, method=6)
            js = {'frames': fr, 'meta': {'app': 'title_pack.py', 'image': img, 'size': {'w': W, 'h': H}, 'scale': 1}}
            with open(os.path.join(bake, key + '.json'), 'w') as fh:
                json.dump(js, fh, separators=(',', ':'), sort_keys=True)
            b = os.path.getsize(os.path.join(bake, img)) + os.path.getsize(os.path.join(bake, key + '.json'))
            man['files'][key] = {'png': img, 'json': key + '.json', 'w': W, 'h': H, 'bytes': b}
            grp['atlases'].append(key)
            print('[patch] %-8s %4dx%-4d %3d frames %7.1f KB  (%.1f MB GPU)  was %s' %
                  (key, W, H, len(fr), b / 1024, W * H * 4 / 1048576, ', '.join(old) or '-'))

    # ---- frames that moved: their tex ids
    for k, sp in man['sprites'].items():
        if 'anim' in sp:
            fl = []
            for x in sp['anim']['frames']:
                t, f = (x[0], x[1]) if isinstance(x, list) else (None, x)      # new pieces: a bare frame name
                fl.append([ftex.get(f, t), f])
            sp['anim']['frames'] = fl
            if 'frame' not in sp and not sp.get('live'):
                sp['frame'] = fl[0][1]
        if 'frame' in sp:
            sp['tex'] = ftex.get(sp['frame'], sp.get('tex'))
        if 'glow' in sp:
            sp['glow']['tex'] = ftex.get(sp['glow']['frame'], sp['glow'].get('tex'))
    for a in man['actors'].values():
        a['frames'] = [[ftex.get(f, t), f] for t, f in a['frames']]

    gbytes = {}
    for key, f in man['files'].items():
        g = key.split('_')[1] if key.split('_')[1].isdigit() else str(max(1, f.get('stage', 1)))
        gbytes[g] = gbytes.get(g, 0) + f['bytes']
    man['groupBytes'] = gbytes
    man['totalBytes'] = sum(f['bytes'] for f in man['files'].values())
    with open(os.path.join(bake, 'title_bake.json'), 'w') as fh:
        json.dump(man, fh, separators=(',', ':'), sort_keys=True)
    print('[patch] dropped %d frames (%s), added %d (%s)' % (len(drop), ', '.join(sorted(drop)) or '-', len(new), ', '.join(sorted(new)) or '-'))
    print('[patch] glow pieces: %d  %s' % (len(glows), ', '.join('%s:%d' % x for x in glows)))
    print('[patch] group bytes: ' + ', '.join('%s=%.0f KB' % (g, b / 1024) for g, b in sorted(gbytes.items())))
    print('[patch] total %.1f KB' % (man['totalBytes'] / 1024))


if __name__ == '__main__':
    main()
