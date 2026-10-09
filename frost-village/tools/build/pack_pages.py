#!/usr/bin/env python3
"""
pack_pages.py (v4-B, docs/v4_plan.md §11.3a): the asset compiler for texture memory.

Reads the existing manifests + atlases (never edits a source folder) and writes assets/_packed/ + index.json:

  * resident villager atlases (vil_npc_*)  -> <key>@core   idle, walk, run, sit, carry_*, operate, serve ...
                                              <key>@social talk, happy, laugh, wave, dance ... (loaded on demand,
                                                           LRU, evicted when the budget is tight)
  * townfolk sheets (tfatlas)              -> <key>@loco   idle + walk body frames, `loco` head poses
                                              <key>@soc    talk / wave / happy + the other head poses
                                              (carry_walk is dropped: v4 dolls carry on the head)
  * train atlases                          -> <key>@ne     the NE frames only (the train is drawn NE / mirrored NW)
  * town_shops / town_civic                -> <key>@b / @a and @station / @rest (the founded shops and our
                                              station are what the district needs)

A page is a normal Phaser "JSON Hash" atlas (tfatlas for townfolk) packed with a skyline packer; frames that
share one source rectangle stay shared. Texture keys use '@'; file names use '.' (key 'x@core' -> x.core.png).

  python3 tools/build/pack_pages.py           build (only pages whose sources changed)
  python3 tools/build/pack_pages.py --force   rebuild everything
  python3 tools/build/pack_pages.py --check   verify: every frame of every source resolves to exactly one page
                                              (or is a documented drop); exit 1 otherwise

Exit 1 if any frame a manifest needs would be dropped.
"""
import hashlib
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, '_packed')
PAD = 2

# ---------------------------------------------------------------- rules
# villagers: anims the systems play (jobs, stations, porters, seats) stay resident; the rest is social
CORE_ANIMS = {'idle', 'walk', 'run', 'sit', 'work', 'operate', 'serve', 'give', 'chop', 'mine', 'harvest', 'pet',
              'skate', 'run_ball'}
# carry anims stay resident only for the residents who carry for a living (the porters, the porters' stand-ins
# in Worker.js PORTER_FALLBACK, the station operators); anyone else carrying plays walk (Assets ANIM_FALLBACK)
CARRY_ANIMS = {'carry_walk', 'carry_idle'}
CARRIERS = {'vil_npc_porter_a', 'vil_npc_porter_b', 'vil_npc_yellow', 'vil_npc_red', 'vil_npc_blue', 'vil_npc_young_man',
            'vil_npc_chef', 'vil_npc_aunt', 'vil_npc_blacksmith', 'vil_npc_sawyer', 'vil_npc_smoker', 'vil_npc_cannery'}
SPLIT_CHAR = re.compile(r'^vil_npc_')
TF_LOCO_ANIMS = {'idle', 'walk'}
TF_DROP_ANIMS = {'carry_walk'}
TF_LOCO_POSES = {'loco'}
TRAIN = re.compile(r'^train_(engine|car_a|car_b)$')
TRAIN_DIR = 'NE'
TOWN_SPLIT = {
    # atlas: (page suffix for the listed frame groups, the rest)
    'town_shops': ('b', 'a', {'cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'}),
    'town_civic': ('station', 'rest', {'train_station'}),
}
CHAR_FRAGS = ['villagers', 'villagers2', 'villagers3']
TF_FRAGS = ['townfolk']
TOWN_FRAGS = ['town']
ANIM_RE = re.compile(r'^(.*)_(S|SE|E|NE|N|SW|W|NW)_(\d+)$')
DIR_RE = re.compile(r'^(.*)_(S|SE|E|NE|N|SW|W|NW)$')


def file_of(key):
    return key.replace('@', '.')


def sha(paths):
    h = hashlib.sha1()
    for p in paths:
        with open(p, 'rb') as f:
            h.update(f.read())
    h.update(open(__file__, 'rb').read())
    return h.hexdigest()[:16]


# ---------------------------------------------------------------- skyline packer
def pack(sizes, widths=(1024, 1280, 1536, 1792, 2048)):
    """sizes: list of (w, h). Returns (W, H, [(x, y)]) with the smallest area over the candidate widths."""
    best = None
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    maxw = max([w for w, h in sizes] + [1])
    for W in widths:
        if W < maxw:
            continue
        sky = np.zeros(W + PAD, dtype=np.int32)
        pos = [None] * len(sizes)
        H = 0
        for i in order:
            w, h = sizes[i]
            ww = w + PAD
            if ww > W + PAD:
                ww = W + PAD
            # sliding max of the skyline over the frame width: lowest spot, leftmost on ties
            win = np.lib.stride_tricks.sliding_window_view(sky[:W + PAD], ww).max(axis=1)
            win = win[:max(1, W - w + 1)]
            x = int(np.argmin(win))
            y = int(win[x])
            pos[i] = (x, y)
            sky[x:x + ww] = y + h + PAD
            H = max(H, y + h)
        H = (H + 3) // 4 * 4
        area = W * H
        if best is None or area < best[0]:
            best = (area, W, H, pos)
    _, W, H, pos = best
    return W, H, pos


def build_page(src_img, rects):
    """rects: list of unique source rects (x, y, w, h). Returns (sheet, {rect: (nx, ny)})."""
    sizes = [(r[2], r[3]) for r in rects]
    W, H, pos = pack(sizes)
    W = (W + 3) // 4 * 4
    if W > 4096 or H > 4096:
        raise ValueError('page too large %dx%d' % (W, H))
    sheet = Image.new('RGBA', (W, max(4, H)), (0, 0, 0, 0))
    out = {}
    for r, p in zip(rects, pos):
        x, y, w, h = r
        sheet.paste(src_img.crop((x, y, x + w, y + h)), p)
        out[r] = p
    return sheet, out


def save_png(sheet, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sheet.save(path, optimize=True)


# ---------------------------------------------------------------- Phaser JSON hash atlases
def split_hash(atlas_key, src_png, src_json, classify, pages_order):
    """classify(frame_name) -> page suffix or None (drop). Returns {suffix: (sheet, atlas_json, frames)}."""
    j = json.load(open(src_json))
    fr = j['frames']
    if isinstance(fr, list):
        fr = {f['filename']: f for f in fr}
    img = Image.open(src_png).convert('RGBA')
    groups = {}
    dropped = []
    for name, f in fr.items():
        suf = classify(name)
        if suf is None:
            dropped.append(name)
            continue
        groups.setdefault(suf, {})[name] = f
    out = {}
    for suf in pages_order:
        g = groups.get(suf)
        if not g:
            continue
        rects = sorted({(f['frame']['x'], f['frame']['y'], f['frame']['w'], f['frame']['h']) for f in g.values()})
        sheet, where = build_page(img, rects)
        frames = {}
        for name, f in g.items():
            r = (f['frame']['x'], f['frame']['y'], f['frame']['w'], f['frame']['h'])
            nx, ny = where[r]
            nf = dict(f)
            nf['frame'] = {'x': nx, 'y': ny, 'w': r[2], 'h': r[3]}
            frames[name] = nf
        key = atlas_key + '@' + suf
        atlas = {'frames': frames, 'meta': {'app': 'frost-village/tools/build/pack_pages.py', 'version': '1.0',
                                            'image': file_of(key) + '.png', 'format': 'RGBA8888',
                                            'size': {'w': sheet.width, 'h': sheet.height}, 'scale': '1'}}
        out[suf] = (sheet, atlas, sorted(g.keys()))
    return out, dropped, list(fr.keys())


# ---------------------------------------------------------------- townfolk tfatlas
def split_tf(atlas_key, src_png, src_json):
    j = json.load(open(src_json))
    img = Image.open(src_png).convert('RGBA')
    frames = j['frames']
    parts = {'loco': {}, 'soc': {}}
    dropped = 0
    total = 0

    def cls_of(group):
        m = DIR_RE.match(group)
        a = m.group(1) if m else group
        if a in TF_DROP_ANIMS:
            return None
        if a in TF_LOCO_ANIMS or a in TF_LOCO_POSES:
            return 'loco'
        return 'soc'
    for prefix, groups in frames.items():
        for grp, v in groups.items():
            n = len(v) if (v and any(isinstance(x, list) for x in v)) else 1
            total += n
            c = cls_of(grp)
            if c is None:
                dropped += n
                continue
            parts[c].setdefault(prefix, {})[grp] = v
    out = {}
    for suf in ('loco', 'soc'):
        p = parts[suf]
        if not p:
            continue
        rects = set()
        for prefix, groups in p.items():
            for grp, v in groups.items():
                for r in (v if (v and any(isinstance(x, list) for x in v)) else [v]):
                    if r:
                        rects.add((r[0], r[1], r[2], r[3]))
        rects = sorted(rects)
        sheet, where = build_page(img, rects)
        nf = {}
        for prefix, groups in p.items():
            ng = nf.setdefault(prefix, {})
            for grp, v in groups.items():
                def mv(r):
                    if not r:
                        return r
                    nx, ny = where[(r[0], r[1], r[2], r[3])]
                    return [nx, ny, r[2], r[3]] + list(r[4:])
                ng[grp] = [mv(r) for r in v] if (v and any(isinstance(x, list) for x in v)) else mv(v)
        key = atlas_key + '@' + suf
        data = {'tfatlas': j.get('tfatlas', 1), 'image': file_of(key) + '.png', 'size': [sheet.width, sheet.height],
                'frameSize': j.get('frameSize', [128, 128]), 'frames': nf}
        out[suf] = (sheet, data)
    return out, dropped, total


# ---------------------------------------------------------------- main
def manifests(frags):
    for f in frags:
        p = os.path.join(ASSETS, f, 'manifest.json')
        if os.path.exists(p):
            yield f, json.load(open(p))


def needed_char_frames(m):
    """frame names the manifest's characters / sprites name explicitly (must never be dropped)"""
    need = {}
    for k, d in (m.get('characters') or {}).items():
        if not isinstance(d, dict) or not d.get('atlas'):
            continue
        fn = d.get('frameName', '{anim}_{dir}_{i}')
        for an, a in (d.get('anims') or {}).items():
            for dr in a.get('dirs') or d.get('dirs') or []:
                for i in range(a.get('frames', 1)):
                    need.setdefault(d['atlas'], set()).add(fn.replace('{anim}', an).replace('{dir}', dr).replace('{i}', str(i)))
    for k, d in (m.get('sprites') or {}).items():
        if isinstance(d, dict) and d.get('atlas') and d.get('frame'):
            need.setdefault(d['atlas'], set()).add(d['frame'])
    return need


def main():
    force = '--force' in sys.argv
    check = '--check' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, 'index.json')
    old = json.load(open(idx_path)) if os.path.exists(idx_path) else {}
    index = {'version': 1, 'tool': 'tools/build/pack_pages.py', 'atlases': {}}
    problems = []
    report = []

    def keep_or_build(key, srcs, build):
        h = sha(srcs)
        prev = (old.get('atlases') or {}).get(key)
        if prev and prev.get('src') == h and not force and all(os.path.exists(os.path.join(ASSETS, pg['png'])) for pg in prev['pages']):
            return prev, False
        if check:
            problems.append('%s: packed pages are stale (run pack_pages.py)' % key)
            return prev, False
        e = build()
        e['src'] = h
        return e, True

    # --- villager characters (a later fragment wins key by key, like Assets.mergeManifests: villagers3
    #     re-renders the chef / aunt / blacksmith under the same atlas keys)
    chosen = {}
    for frag, m in manifests(CHAR_FRAGS):
        need = needed_char_frames(m)
        for a in m.get('atlases', []):
            chosen[a['key']] = (frag, m, need, a)
    for key0, (frag, m, need, a) in chosen.items():
        if True:
            key = a['key']
            if not SPLIT_CHAR.match(key):
                continue
            png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
            if not (os.path.exists(png) and os.path.exists(js)):
                continue

            def classify(name, key=key):
                mm = ANIM_RE.match(name)
                if not mm:
                    return 'core'
                an = mm.group(1)
                return 'core' if an in CORE_ANIMS or (an in CARRY_ANIMS and key in CARRIERS) else 'social'

            def build(key=key, png=png, js=js, frag=frag, classify=classify):
                pages, dropped, allf = split_hash(key, png, js, classify, ['core', 'social'])
                e = {'frag': frag, 'kind': 'char', 'pages': []}
                for suf, (sheet, atlas, names) in pages.items():
                    pk = key + '@' + suf
                    save_png(sheet, os.path.join(OUT, file_of(pk) + '.png'))
                    with open(os.path.join(OUT, file_of(pk) + '.json'), 'w') as f:
                        json.dump(atlas, f, separators=(',', ':'))
                    anims = sorted({ANIM_RE.match(n).group(1) for n in names if ANIM_RE.match(n)})
                    e['pages'].append({'key': pk, 'cls': suf, 'png': '_packed/' + file_of(pk) + '.png',
                                       'json': '_packed/' + file_of(pk) + '.json', 'bytes': sheet.width * sheet.height * 4,
                                       'anims': anims})
                return e
            e, built = keep_or_build(key, [png, js], build)
            if e:
                index['atlases'][key] = e
                miss = set(need.get(key, set()))
                have = set()
                for pg in e['pages']:
                    p = os.path.join(ASSETS, pg['json'])
                    if os.path.exists(p):
                        have |= set(json.load(open(p))['frames'].keys())
                src = set(json.load(open(js))['frames'].keys())
                lost = (miss & src) - have
                if lost:
                    problems.append('%s: %d needed frames missing from pages (e.g. %s)' % (key, len(lost), sorted(lost)[:3]))
                if src - have:
                    problems.append('%s: %d source frames not in any page' % (key, len(src - have)))
                report.append((key, sum(pg['bytes'] for pg in e['pages'] if pg['cls'] == 'core'), sum(pg['bytes'] for pg in e['pages']), built))

    # --- townfolk
    for frag, m in manifests(TF_FRAGS):
        for a in m.get('atlases', []):
            if a.get('format') != 'tfatlas':
                continue
            key = a['key']
            png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])

            def build(key=key, png=png, js=js, frag=frag):
                pages, dropped, total = split_tf(key, png, js)
                e = {'frag': frag, 'kind': 'tf', 'format': 'tfatlas', 'dropped': dropped, 'pages': []}
                for suf, (sheet, data) in pages.items():
                    pk = key + '@' + suf
                    save_png(sheet, os.path.join(OUT, file_of(pk) + '.png'))
                    with open(os.path.join(OUT, file_of(pk) + '.json'), 'w') as f:
                        json.dump(data, f, separators=(',', ':'))
                    e['pages'].append({'key': pk, 'cls': suf, 'png': '_packed/' + file_of(pk) + '.png',
                                       'json': '_packed/' + file_of(pk) + '.json', 'bytes': sheet.width * sheet.height * 4})
                return e
            e, built = keep_or_build(key, [png, js], build)
            if e:
                index['atlases'][key] = e
                report.append((key, sum(pg['bytes'] for pg in e['pages'] if pg['cls'] == 'loco'), sum(pg['bytes'] for pg in e['pages']), built))

    # --- town: train (NE only) and the shops / civic split
    for frag, m in manifests(TOWN_FRAGS):
        need = needed_char_frames(m)
        for a in m.get('atlases', []):
            key = a['key']
            png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
            if not (os.path.exists(png) and os.path.exists(js)):
                continue
            if TRAIN.match(key):
                def classify(name):
                    # the NE frames (drawn mirrored as NW) and the NW ground shadow (the light does not flip)
                    if name.startswith('shadow_'):
                        return 'ne' if name == 'shadow_NW' else None
                    mm = ANIM_RE.match(name)
                    if not mm:
                        return 'ne'
                    return 'ne' if mm.group(2) == TRAIN_DIR else None
                order = ['ne']
            elif key in TOWN_SPLIT:
                a_suf, b_suf, names = TOWN_SPLIT[key]

                def classify(name, a_suf=a_suf, b_suf=b_suf, names=names):
                    base = re.sub(r'_work(_\d+)?$', '', re.sub(r'_\d+$', '', name))
                    return a_suf if base in names else b_suf
                order = [a_suf, b_suf]
            else:
                continue

            def build(key=key, png=png, js=js, frag=frag, classify=classify, order=order):
                pages, dropped, allf = split_hash(key, png, js, classify, order)
                e = {'frag': frag, 'kind': 'town', 'pages': [], 'dropped': len(dropped)}
                for suf, (sheet, atlas, names) in pages.items():
                    pk = key + '@' + suf
                    save_png(sheet, os.path.join(OUT, file_of(pk) + '.png'))
                    with open(os.path.join(OUT, file_of(pk) + '.json'), 'w') as f:
                        json.dump(atlas, f, separators=(',', ':'))
                    pg = {'key': pk, 'cls': suf, 'png': '_packed/' + file_of(pk) + '.png',
                          'json': '_packed/' + file_of(pk) + '.json', 'bytes': sheet.width * sheet.height * 4}
                    if key in TOWN_SPLIT:
                        pg['frames'] = names
                    e['pages'].append(pg)
                return e
            e, built = keep_or_build(key, [png, js], build)
            if e:
                index['atlases'][key] = e
                # explicitly named sprite frames must survive (the train's other dirs are a documented drop)
                have = set()
                for pg in e['pages']:
                    p = os.path.join(ASSETS, pg['json'])
                    if os.path.exists(p):
                        have |= set(json.load(open(p))['frames'].keys())
                for sk, d in (m.get('sprites') or {}).items():
                    if isinstance(d, dict) and d.get('atlas') == key and d.get('frame') and d['frame'] not in have:
                        problems.append('%s: sprite %s frame %s dropped' % (key, sk, d['frame']))
                report.append((key, 0, sum(pg['bytes'] for pg in e['pages']), built))

    # stale pages of atlases that no longer exist
    if not check:
        keep = set()
        for e in index['atlases'].values():
            for pg in e['pages']:
                keep.add(os.path.basename(pg['png']))
                keep.add(os.path.basename(pg['json']))
        for fn in os.listdir(OUT):
            if fn != 'index.json' and fn not in keep:
                os.remove(os.path.join(OUT, fn))
        with open(idx_path, 'w') as f:
            json.dump(index, f, indent=1)

    MiB = 1048576.0
    src_total = 0
    for key, core, tot, built in report:
        print('%-26s core/loco %6.2f MiB  all pages %6.2f MiB %s' % (key, core / MiB, tot / MiB, '(built)' if built else ''))
    print('pages: %d atlases -> %d pages' % (len(index['atlases']), sum(len(e['pages']) for e in index['atlases'].values())))
    if problems:
        print('PROBLEMS:')
        for p in problems:
            print('  ' + p)
        sys.exit(1)
    print('ok')


if __name__ == '__main__':
    main()
