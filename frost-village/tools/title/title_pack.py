#!/usr/bin/env python3
"""title_pack.py - pack the title diorama pieces into webp atlases + the runtime manifest.

    python3 tools/title/title_pack.py <work dir from bake_title.mjs> <out dir>

Input : <work>/pieces.json + <work>/pieces/*.png (written by tools/title/bake_title.mjs)
Output: <out>/ttl_<group>_<page>.webp + .json   Phaser JSON-hash atlases, trimmed frames with source size
        <out>/ttl_ground_*.webp                 island ground layers (base + one overlay per stage)
        <out>/title_bake.json                   what src/title/TitleDiorama.js reads

Groups = growth stages (1..4): a stage's pictures live in their own atlas pages, so the title can show
stage 1 while the later stages still download (and a phone with little memory can stop at a stage).
Night glow: for every building the lit window panes (warm, bright, pale-yellow pixels of the render) are
extracted into a soft half-resolution "glow" piece that the runtime adds on top at dusk / night.
Deterministic: same input -> byte-identical output.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

PAGE = 2048          # max atlas page size
PAD = 2              # transparent gap between pieces
Q_SPRITE = 82        # webp quality (colour) for sprites
Q_ALPHA = 100        # webp alpha quality
Q_GROUND = 80
Q_GLOW = 70
GLOW_RES = 0.5       # glow pieces are stored at this fraction of the sprite's bake scale
GLOW_MIN_PX = 40     # fewer lit pixels than this: no glow piece
NO_GLOW = ('tree_', 'rock_', 'snow_', 'bush_', 'ice_', 'barrel', 'crate', 'fence_', 'sled', 'log_seat', 'firewood', 'fish_net',
           'item_', 'decal_', 'dock_pier', 'boat_small', 'snowman', 'dog_house', 'bollard', 'buoy', 'container', 'bench', 'flag_pole')


# ----------------------------------------------------------------------------- MaxRects (best short side fit)
class MaxRects:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.free = [(0, 0, w, h)]
        self.used_w = 0
        self.used_h = 0

    def insert(self, w, h):
        best = None
        for (fx, fy, fw, fh) in self.free:
            if w <= fw and h <= fh:
                ss = min(fw - w, fh - h)
                ls = max(fw - w, fh - h)
                key = (ss, ls, fy, fx)
                if best is None or key < best[0]:
                    best = (key, fx, fy)
        if best is None:
            return None
        _, x, y = best
        self._split(x, y, w, h)
        self.used_w = max(self.used_w, x + w)
        self.used_h = max(self.used_h, y + h)
        return x, y

    def _split(self, x, y, w, h):
        out = []
        for (fx, fy, fw, fh) in self.free:
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                out.append((fx, fy, fw, fh))
                continue
            if x > fx:
                out.append((fx, fy, x - fx, fh))
            if x + w < fx + fw:
                out.append((x + w, fy, fx + fw - (x + w), fh))
            if y > fy:
                out.append((fx, fy, fw, y - fy))
            if y + h < fy + fh:
                out.append((fx, y + h, fw, fy + fh - (y + h)))
        # prune contained rects
        out = sorted(set(out))
        keep = []
        for i, a in enumerate(out):
            ax, ay, aw, ah = a
            contained = False
            for j, b in enumerate(out):
                if i == j:
                    continue
                bx, by, bw, bh = b
                if ax >= bx and ay >= by and ax + aw <= bx + bw and ay + ah <= by + bh and (a != b):
                    contained = True
                    break
            if not contained:
                keep.append(a)
        self.free = keep


def pack_group(items):
    """items: list of (name, PIL image). Returns pages: [ { 'w','h','place': {name: (x, y)} } ]"""
    left = sorted(items, key=lambda it: (-max(it[1].size), -it[1].size[0] * it[1].size[1], it[0]))
    pages = []
    while left:
        mr = MaxRects(PAGE, PAGE)
        place = {}
        rest = []
        for name, im in left:
            w, h = im.size
            pos = mr.insert(w + PAD, h + PAD)
            if pos is None:
                rest.append((name, im))
            else:
                place[name] = pos
        if not place:
            raise SystemExit('piece too big for a page: ' + left[0][0])
        pages.append({'w': mr.used_w, 'h': mr.used_h, 'place': place})
        left = rest
    return pages


# ----------------------------------------------------------------------------- glow
def window_mask(im):
    a = np.asarray(im.convert('RGBA'), dtype=np.float32) / 255.0
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    m = (mx > 0.9) & (h > 33) & (h < 72) & (s > 0.14) & (s < 0.7) & (al > 0.6) & (r > 0.88) & (g > 0.78) & (b < 0.86)
    return m.astype(np.float32)


def glow_piece(im):
    """soft warm glow image (RGBA, premultiplied-friendly) from the lit panes, at GLOW_RES"""
    m = window_mask(im)
    if m.sum() < GLOW_MIN_PX:
        return None
    w, h = im.size
    pad = 14
    big = np.zeros((h + pad * 2, w + pad * 2), np.float32)
    big[pad:pad + h, pad:pad + w] = m
    mi = Image.fromarray((big * 255).astype(np.uint8))
    b1 = np.asarray(mi.filter(ImageFilter.GaussianBlur(2.2)), np.float32) / 255.0
    b2 = np.asarray(mi.filter(ImageFilter.GaussianBlur(7.0)), np.float32) / 255.0
    inten = np.clip(big * 0.85 + b1 * 0.9 + b2 * 1.4, 0, 1)
    col = np.zeros(big.shape + (4,), np.float32)
    # core panes pale warm yellow, halo deeper amber
    core = np.clip(big + b1 * 0.5, 0, 1)[..., None]
    c_core = np.array([1.0, 0.93, 0.66])
    c_halo = np.array([1.0, 0.70, 0.34])
    col[..., :3] = c_core * core + c_halo * (1 - core)
    col[..., 3] = inten
    gi = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8), 'RGBA')
    gw, gh = max(2, round(gi.size[0] * GLOW_RES)), max(2, round(gi.size[1] * GLOW_RES))
    gi = gi.resize((gw, gh), Image.LANCZOS)
    bbox = gi.getbbox()
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - 1), max(0, y0 - 1)
    x1, y1 = min(gw, x1 + 1), min(gh, y1 + 1)
    return gi.crop((x0, y0, x1, y1)), pad, (x0, y0)


def main():
    work, out = sys.argv[1], sys.argv[2]
    meta = json.load(open(os.path.join(work, 'pieces.json')))
    os.makedirs(out, exist_ok=True)
    mp = os.path.join(out, 'manifest.json')
    if os.path.exists(mp) and 'title diorama bake' not in open(mp, encoding='utf8').read():
        raise SystemExit('refusing to write into %s: it holds another fragment (manifest.json) - pick an own folder, e.g. assets/title_bake' % out)
    for f in os.listdir(out):
        if f.startswith('ttl_') or f in ('title_bake.json', 'manifest.json'):
            os.remove(os.path.join(out, f))

    groups = {1: [], 2: [], 3: [], 4: []}
    frames = {}          # frame name -> (group, image, frame meta)
    man = {'v': 1, 'note': 'generated by tools/title/bake_title.mjs + title_pack.py - do not edit',
           'groundScale': meta['layoutInfo']['groundScale'], 'G': meta['layoutInfo']['G'], 'island': meta['layoutInfo']['island'],
           'groups': {}, 'files': {}, 'sprites': {}, 'actors': {}}

    def add_frame(name, group, im, sw, sh, tx, ty):
        g = max(1, min(4, int(group)))
        groups[g].append((name, im))
        frames[name] = {'g': g, 'sw': int(sw), 'sh': int(sh), 'tx': int(tx), 'ty': int(ty), 'w': im.size[0], 'h': im.size[1]}

    glow_stats = []
    animated = set(p['key'] for p in meta['sprites'] if p.get('animOf'))
    for p in meta['sprites']:
        im = Image.open(os.path.join(work, 'pieces', p['file'])).convert('RGBA')
        if p.get('empty'):
            continue
        key = p['key']
        # live pictures come from the game's own atlases; an animated baked picture shows anim frame 0 when still
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
        if not key.startswith(NO_GLOW):
            # the glow is measured on the trimmed piece; its anchor follows from the trim offsets
            gp = glow_piece(im)
            if gp:
                gim, pad, (gx0, gy0) = gp
                gname = key + '#glow'
                add_frame(gname, p['stage'], gim, gim.size[0], gim.size[1], 0, 0)
                # glow pixel (0,0) = trimmed-piece pixel ((gx0 / GLOW_RES) - pad, (gy0 / GLOW_RES) - pad)
                ax_t = p['ax'] - p['tx']
                ay_t = p['ay'] - p['ty']
                gax = (ax_t + pad) * GLOW_RES - gx0
                gay = (ay_t + pad) * GLOW_RES - gy0
                sp['glow'] = {'frame': gname, 'ox': round(gax / gim.size[0], 5), 'oy': round(gay / gim.size[1], 5), 'res': GLOW_RES}
                glow_stats.append((key, int(window_mask(im).sum())))

    for p in meta['actors']:
        if p.get('empty'):
            continue
        im = Image.open(os.path.join(work, 'pieces', p['file'])).convert('RGBA')
        add_frame(p['name'], p['stage'], im, p['sw'], p['sh'], p['tx'], p['ty'])
        akey = '%s:%s:%s' % (p['actor'], p['anim'], p['dir'])
        a = man['actors'].setdefault(akey, {'char': p['actor'], 'anim': p['anim'], 'dir': p['dir'], 'fps': p['fps'], 'scale': p['scale'],
                                            'ox': round(p['ax'] / p['sw'], 5), 'oy': round(p['ay'] / p['sh'], 5), 'stage': p['stage'], 'frames': []})
        a['frames'].append(p['name'])

    # ---- pack + encode
    total = 0
    report = []
    for g in (1, 2, 3, 4):
        pages = pack_group(groups[g]) if groups[g] else []
        gi = man['groups'].setdefault(str(g), {'atlases': [], 'images': []})
        lookup = dict(groups[g])
        for n, pg in enumerate(pages):
            key = 'ttl_%d_%d' % (g, n)
            W, H = pg['w'], pg['h']
            sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
            fr = {}
            for name in sorted(pg['place']):
                x, y = pg['place'][name]
                im = lookup[name]
                sheet.paste(im, (x, y))
                f = frames[name]
                fr[name] = {'frame': {'x': x, 'y': y, 'w': f['w'], 'h': f['h']}, 'rotated': False,
                            'trimmed': (f['w'], f['h']) != (f['sw'], f['sh']),
                            'spriteSourceSize': {'x': f['tx'], 'y': f['ty'], 'w': f['w'], 'h': f['h']},
                            'sourceSize': {'w': f['sw'], 'h': f['sh']}}
                frames[name]['tex'] = key
            img = key + '.webp'
            # glow-only pages could use a lower quality; pages are mixed, keep one setting
            sheet.save(os.path.join(out, img), 'WEBP', quality=Q_SPRITE, alpha_quality=Q_ALPHA, method=6)
            js = {'frames': fr, 'meta': {'app': 'title_pack.py', 'image': img, 'size': {'w': W, 'h': H}, 'scale': 1}}
            with open(os.path.join(out, key + '.json'), 'w') as fh:
                json.dump(js, fh, separators=(',', ':'), sort_keys=True)
            b = os.path.getsize(os.path.join(out, img)) + os.path.getsize(os.path.join(out, key + '.json'))
            total += b
            man['files'][key] = {'png': img, 'json': key + '.json', 'w': W, 'h': H, 'bytes': b}
            gi['atlases'].append(key)
            report.append('  %-10s %4dx%-4d %3d frames %7.1f KB  (%.1f MB GPU)' % (key, W, H, len(fr), b / 1024, W * H * 4 / 1048576))

    for p in meta['ground']:
        im = Image.open(os.path.join(work, 'pieces', p['file'])).convert('RGBA')
        key = 'ttl_' + p['name']
        img = key + '.webp'
        im.save(os.path.join(out, img), 'WEBP', quality=Q_GROUND, alpha_quality=Q_ALPHA, method=6)
        b = os.path.getsize(os.path.join(out, img))
        total += b
        g = max(1, int(p['stage']))
        man['files'][key] = {'img': img, 'x': p['x'], 'y': p['y'], 'scale': p['scale'], 'w': im.size[0], 'h': im.size[1], 'bytes': b, 'stage': int(p['stage'])}
        man['groups'].setdefault(str(g), {'atlases': [], 'images': []})['images'].append(key)
        report.append('  %-18s %4dx%-4d %7.1f KB  (%.1f MB GPU)' % (key, im.size[0], im.size[1], b / 1024, im.size[0] * im.size[1] * 4 / 1048576))

    # resolve frame -> texture in the manifest
    for k, sp in man['sprites'].items():
        if 'anim' in sp and 'frame' not in sp and not sp.get('live'):
            sp['frame'] = sp['anim']['frames'][0]
        if 'frame' in sp:
            sp['tex'] = frames[sp['frame']]['tex']
        if 'glow' in sp:
            sp['glow']['tex'] = frames[sp['glow']['frame']]['tex']
        if 'anim' in sp:
            sp['anim']['frames'] = [[frames[f]['tex'], f] for f in sp['anim']['frames']]
    for k, a in man['actors'].items():
        a['frames'] = [[frames[f]['tex'], f] for f in a['frames']]
    gbytes = {}
    for key, f in man['files'].items():
        g = key.split('_')[1] if key.split('_')[1].isdigit() else str(max(1, f.get('stage', 1)))
        gbytes[g] = gbytes.get(g, 0) + f['bytes']
    man['groupBytes'] = gbytes
    man['totalBytes'] = total
    with open(os.path.join(out, 'title_bake.json'), 'w') as fh:
        json.dump(man, fh, separators=(',', ':'), sort_keys=True)
    if os.sep + 'assets' + os.sep in os.path.abspath(out) + os.sep:
        # shipped under assets/: a stub fragment manifest so tools/build/build_artifact.mjs packages the folder
        # (list it in LATE_FRAGMENTS); Assets.js never loads it - src/title/TitleAssets.js reads title_bake.json
        with open(os.path.join(out, 'manifest.json'), 'w') as fh:
            json.dump({'version': 1, 'note': 'title diorama bake (tools/title/bake_title.mjs). Loaded by src/title/TitleAssets.js from title_bake.json, not by Assets.js.',
                       'atlases': [], 'images': [], 'sprites': {}}, fh, indent=1)
    total += os.path.getsize(os.path.join(out, 'title_bake.json'))
    gpu = sum(f['w'] * f['h'] * 4 for f in man['files'].values()) / 1048576
    print('[pack] files:')
    print('\n'.join(report))
    print('[pack] glow pieces: %d  %s' % (len(glow_stats), ', '.join('%s:%d' % x for x in glow_stats)))
    print('[pack] group bytes: ' + ', '.join('%s=%.0f KB' % (g, b / 1024) for g, b in sorted(gbytes.items())))
    print('[pack] total %.1f KB on disk, %.1f MB GPU if everything is resident' % (total / 1024, gpu))


if __name__ == '__main__':
    main()
