"""
ttl_manifest.py - assembles assets/title/manifest.json (CONTRACT section 2 fragment "title") from the
records the title-art packers return.  Pure python.

A record:
    {'type': 'image' | 'atlas' | 'sheet' | 'file', 'key': 'ttl_...', 'png': 'title/....png',
     'json': 'title/....json' (atlas), 'frameWidth'/'frameHeight'/'frameCount'/'fps'/'repeat' (sheet),
     'group': 'logo' | 'backdrop' | 'fx' | 'icon', 'load': True (loaded by the title) / False,
     'sprite': {... CONTRACT sprites[key] fields: anchor, kind, notes, ...} (optional),
     'frames': {frame_name: {sprite fields}} (atlas frames that get their own sprites[] entry)}
Re-packing only some groups keeps the other groups' records (<cache>/ttl_records.json).
"""
import json
import os

import ttl_config as C

GROUP_ORDER = ['logo', 'backdrop', 'fx', 'icon']


def load_existing(cache):
    """Records of the last pack (kept in <cache>/ttl_records.json so a partial re-pack keeps the rest)."""
    p = os.path.join(cache, 'ttl_records.json')
    man = {'records': {}, 'meta': {}}
    if os.path.exists(p):
        try:
            old = json.load(open(p))
            man['records'] = {r['key']: r for r in old.get('records', [])}
            man['meta'] = old.get('meta', {})
        except Exception:
            pass
    return man


def save_records(man, cache):
    os.makedirs(cache, exist_ok=True)
    with open(os.path.join(cache, 'ttl_records.json'), 'w') as f:
        json.dump({'records': list(man['records'].values()), 'meta': man['meta']}, f, ensure_ascii=False, indent=1)


def add(man, records, group):
    # drop the group's old records, then add the new ones
    for k in [k for k, r in man['records'].items() if r.get('group') == group]:
        del man['records'][k]
    for r in records:
        r = dict(r)
        r['group'] = group
        man['records'][r['key']] = r


def _size(rel):
    p = os.path.join(C.GAME, 'assets', rel)
    return os.path.getsize(p) if os.path.exists(p) else 0


def _webp_size(rel):
    """What tools/build/webp_assets.py would ship for this PNG (lossy q90 colour, lossless alpha;
    kept only when < 60 % of the PNG)."""
    import io
    from PIL import Image
    p = os.path.join(C.GAME, 'assets', rel)
    if not os.path.exists(p) or not p.endswith('.png'):
        return _size(rel)
    im = Image.open(p)
    im.load()
    buf = io.BytesIO()
    im.convert('RGBA').save(buf, 'WEBP', quality=90, alpha_quality=100, method=5)
    return buf.tell() if buf.tell() < os.path.getsize(p) * 0.60 else os.path.getsize(p)


def finish(man):
    recs = sorted(man['records'].values(),
                  key=lambda r: (GROUP_ORDER.index(r['group']) if r['group'] in GROUP_ORDER else 9, r['key']))
    out = {
        'version': 1,
        'generator': 'tools/blender/ttl_build.sh (ttl_logo.py, ttl_icon.py in Blender; ttl_pack.py + '
                     'ttl_backdrop.py + ttl_fx.py + ttl_iconpack.py in plain python)',
        'conventions': {
            'fragment': 'title - paths are relative to frost-village/assets/. Loaded by the title modules '
                        '(src/title config: artBase assets/title/, artManifest manifest.json); it can also be '
                        'added to FRAGMENTS in src/core/Assets.js like any fragment. Every key starts with ttl_.',
            'names': 'All texts (game name, short name, English name) come from tools/blender/ttl_config.py '
                     'TITLE and are copied to meta.texts; rename the game there and re-run tools/blender/ttl_build.sh.',
            'scale': 'Logo pictures are drawn for the 720-px-wide logical title layout: "@2x" textures (no '
                     'suffix) are made for canvases at k = 2 - draw them with setScale(0.5 * size) - and the '
                     '"_1x" twins for k = 1 phones (setScale(size)). meta.layout gives the suggested sizes.',
            'backdrop': 'Sky gradients stretch to the screen. Mountain / forest / cloud / city strips tile '
                        'horizontally (TileSprite) and are anchored at their bottom edge; they are painted in '
                        'day colours - meta.tints gives the multiply tint per time of day (dusk / night).',
            'blend': 'Everything is NORMAL-blend artwork except where a sprite says blend ADD/SCREEN '
                     '(aurora, glows, twinkles, city lights).',
            'icon': 'assets/title/icon/* are store / home-screen icons (not loaded by the game); see meta.icon.',
        },
        'meta': {},
        'images': [], 'atlases': [], 'spritesheets': [], 'sprites': {},
    }
    meta = {'texts': {k: v for k, v in C.TITLE.items() if not k.startswith('_')},
            'textsSource': C.TITLE.get('_source', {'file': 'tools/blender/ttl_config.py DEFAULT_TITLE'}),
            'palette': {k: v for k, v in C.PAL.items() if isinstance(v, str)}}
    meta.update(man['meta'])
    for r in recs:
        t = r['type']
        lat = {} if r.get('load', True) is not False else {'loadAtTitle': False}
        if t == 'image':
            out['images'].append(dict({'key': r['key'], 'png': r['png']}, **lat))
        elif t == 'atlas':
            out['atlases'].append(dict({'key': r['key'], 'png': r['png'], 'json': r['json']}, **lat))
        elif t == 'sheet':
            sh = {'key': r['key'], 'png': r['png']}
            for k in ('frameWidth', 'frameHeight', 'frameCount', 'fps', 'repeat', 'anchor', 'blend', 'notes'):
                if k in r:
                    sh[k] = r[k]
            out['spritesheets'].append(sh)
        if r.get('sprite') is not None and t in ('image',):
            sp = {'image': r['key']}
            sp.update(r['sprite'])
            out['sprites'][r['key']] = sp
        for fname, fsp in (r.get('frames') or {}).items():
            sp = {'atlas': r['key'], 'frame': fname}
            sp.update(fsp)
            out['sprites'][fname if fname.startswith('ttl_') else 'ttl_' + fname] = sp
    # payload of what the title loads: records with load True always; 'ko' / 'en' = only in that
    # language (count the larger); 'k1' = the _1x twin loaded INSTEAD of the @2x one (not counted);
    # False = not loaded at title time (icons, the short logo for splash / loading screens)
    tot = {'all': [0, 0], 'ko': [0, 0], 'en': [0, 0]}
    by_group = {}
    for r in recs:
        ld = r.get('load', True)
        if ld in (False, 'k1') or r['type'] == 'file':
            continue
        bucket = 'all' if ld is True else ld
        for k in ('png', 'json'):
            if k in r:
                sz = _size(r[k])
                w = _webp_size(r[k]) if k == 'png' else sz
                tot[bucket][0] += sz
                tot[bucket][1] += w
                g = by_group.setdefault(r['group'], [0, 0])
                g[0] += sz
                g[1] += w
    lang = 'ko' if tot['ko'][0] >= tot['en'][0] else 'en'
    meta['payload'] = {
        'titleLoadPngBytes': tot['all'][0] + tot[lang][0],
        'titleLoadAfterWebpBuildBytes': tot['all'][1] + tot[lang][1],
        'worstLanguage': lang,
        'byGroup': {g: {'png': v[0], 'webpBuild': v[1]} for g, v in by_group.items()},
        'note': 'worst case: @2x pictures (k = 2) + the larger language logo; manifest.json not counted; '
                'icons and the short logo are not loaded at title time. byGroup counts both languages.'}
    meta['load'] = {r['key']: r.get('load', True) for r in recs if r['type'] != 'file'}
    meta['files'] = {r['key']: r['png'] for r in recs if r['type'] == 'file'}
    out['meta'] = meta
    return out
