"""
wkr_pack.py - pack the v4 worker variants into assets/workers (python3 + numpy + Pillow + imagequant).

Run AFTER wkr_render.py:
    python3 tools/blender/wkr_pack.py                    # all variants found in the cache
    python3 tools/blender/wkr_pack.py --chars miner_c    # one (manifest keeps the others)
    python3 tools/blender/wkr_pack.py --no-previews --colors 160 --cache /tmp/fv_cache/workers

What it does (same post-processing as char_pack so variants match the base workers):
  1. soft 1px ink outline on every raw 128x128 frame (char_pack.ink_outline)
  2. one trimmed Phaser JSON-hash atlas per key: assets/workers/wkr_<key>.png/.json,
     palette-quantized with libimagequant (--colors, default 144) to keep the fragment small
  3. portraits -> assets/workers/portrait_<key>.png
  4. assets/workers/manifest.json: atlases, images, sprites (portraits) and characters{}
     (CONTRACT section 3 entry + profession, variantOf, name, traits; hunters point at the
     shared projectile_arrow sprite of assets/characters) + professions{} (hire order)
  5. previews in docs/previews: wkr_lineup.png (all 15 workers), wkr_<key>.png contact
     sheets, wkr_work_all.gif (all 15 working), wkr_walk_all.gif
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)
import pack_utils  # noqa: E402
import char_pack   # noqa: E402
import wkr_build   # noqa: E402  (pure python)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'workers')
PREV = os.path.join(GAME, 'docs', 'previews')
DEFAULT_CACHE = '/tmp/fv_cache/workers'
BASE_CACHE = '/tmp/fv_cache/characters'
DIRS = char_pack.DIRS
BUDGET = 4 * 1000 * 1000          # bytes (decimal 4 MB; binary would be 4,194,304)
BG = char_pack.BG
LABEL = char_pack.LABEL

try:
    import imagequant
except ImportError:          # pragma: no cover
    imagequant = None


def load_meta(cache, key):
    p = os.path.join(cache, key, 'meta.json')
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def processed_frames(cache, key, meta):
    out = {}
    missing = []
    for anim, info in meta['anims'].items():
        for d in DIRS:
            for i in range(info['frames']):
                p = os.path.join(cache, key, f'{anim}_{d}_{i}.png')
                if not os.path.exists(p):
                    missing.append(os.path.basename(p))
                    continue
                out[f'{anim}_{d}_{i}'] = char_pack.ink_outline(Image.open(p))
    if missing:
        raise SystemExit(f'[{key}] missing {len(missing)} frames, e.g. {missing[:4]} - run wkr_render.py')
    return out


def pack_variant(key, processed, colors, dither):
    frames = list(processed.items())
    sheet, atlas = pack_utils.pack_atlas(frames, max_width=2048, trim=True, padding=2)
    png = os.path.join(OUT, f'wkr_{key}.png')
    js = os.path.join(OUT, f'wkr_{key}.json')
    pack_utils.save_atlas(sheet, atlas, png, js, quantize=False)
    if imagequant is not None:
        q = imagequant.quantize_pil_image(sheet, dithering_level=dither, max_quality=100, min_quality=0,
                                          max_colors=colors)
        q.save(png, optimize=True)
    else:
        print('  (imagequant not installed -> atlas kept as RGBA; pip install imagequant)')
    print(f'[{key}] atlas {sheet.size[0]}x{sheet.size[1]}  {os.path.getsize(png) / 1024:.0f} KB  ({len(frames)} frames)')


def manifest_entry(key, meta, processed, has_portrait):
    V = wkr_build.VARIANTS[key]
    ent = char_pack.manifest_entry(key, meta, processed, has_portrait)
    ent['atlas'] = f'wkr_{key}'
    ent['profession'] = V['base']
    ent['variantOf'] = V['base']
    ent['name'] = {'ko': V['name'][0], 'en': V['name'][1]}
    ent['traits'] = list(V.get('traits', []))
    ent['body'] = V['body']
    if V['base'] == 'hunter':
        ent['projectile'] = 'projectile_arrow'
    return ent


# --------------------------------------------------------------------------- previews

def _base_processed(key):
    """Base worker frames: raw cache if present, else cut from assets/characters."""
    meta = load_meta(BASE_CACHE, key)
    if meta is not None:
        try:
            return processed_frames(BASE_CACHE, key, meta), meta
        except SystemExit:
            pass
    with open(os.path.join(ASSETS, 'characters', 'manifest.json')) as f:
        man = json.load(f)
    ch = man['characters'][key]
    sheet = Image.open(os.path.join(ASSETS, 'characters', f'char_{key}.png')).convert('RGBA')
    with open(os.path.join(ASSETS, 'characters', f'char_{key}.json')) as f:
        fr = json.load(f)['frames']
    out = {}
    for name, e in fr.items():
        f2, ss, src = e['frame'], e['spriteSourceSize'], e['sourceSize']
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(sheet.crop((f2['x'], f2['y'], f2['x'] + f2['w'], f2['y'] + f2['h'])), (ss['x'], ss['y']))
        out[name] = full
    return out, {'anims': ch['anims']}


def all_workers(proc_v, metas_v):
    rows = []
    for prof in wkr_build.PROFESSIONS:
        group = []
        bp, bm = _base_processed(prof)
        group.append((prof, bp, bm, 'v4 base'))
        for k in wkr_build.KEYS:
            if wkr_build.VARIANTS[k]['base'] == prof and k in proc_v:
                group.append((k, proc_v[k], metas_v[k], wkr_build.VARIANTS[k]['name'][1]))
        rows.append(group)
    return rows


def lineup(rows, path):
    cw, ch, z = 96, 122, 2
    ncol = max(len(r) for r in rows)
    img = Image.new('RGBA', (len(rows) * ncol * cw * z + (len(rows) - 1) * 16, ch * z + 40), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 100 * z, img.width, img.height], fill=(232, 238, 246, 255))
    x = 0
    for group in rows:
        for k, proc, meta, sub in group:
            fr = proc['idle_S_0'].crop((16, 0, 112, 122))
            sh = Image.new('RGBA', fr.size, (0, 0, 0, 0))
            ImageDraw.Draw(sh).ellipse([48 - 22, 104 - 8, 48 + 22, 104 + 8], fill=(90, 110, 140, 70))
            cell = Image.alpha_composite(sh, fr).resize((cw * z, ch * z), Image.LANCZOS)
            img.alpha_composite(cell, (x, 0))
            d.text((x + 8, ch * z + 4), k, fill=LABEL)
            d.text((x + 8, ch * z + 20), sub, fill=(90, 96, 110, 255))
            x += cw * z
        x += 16
    img.convert('RGB').save(path, optimize=True)


def anim_gif(rows, anim, path, d='SE', z=1.5):
    cw, chh = 96, 122
    ncol = max(len(r) for r in rows)
    n = 8
    frames = []
    for i in range(n):
        canvas = Image.new('RGBA', (ncol * cw, len(rows) * chh), BG)
        dr = ImageDraw.Draw(canvas)
        for r, group in enumerate(rows):
            dr.rectangle([0, r * chh + 98, canvas.width, r * chh + chh - 1], fill=(232, 238, 246, 255))
            for c, (k, proc, meta, sub) in enumerate(group):
                nf = meta['anims'][anim]['frames']
                im = proc[f'{anim}_{d}_{i % nf}'].crop((16, 0, 112, 122))
                canvas.alpha_composite(im, (c * cw, r * chh))
                dr.text((c * cw + 4, r * chh + chh - 14), k, fill=LABEL)
        frames.append(canvas.resize((int(canvas.width * z), int(canvas.height * z)), Image.LANCZOS).convert('RGB'))
    pal = frames[0].quantize(colors=200, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    fps = 14 if anim == 'work' else 12
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / fps), loop=0, optimize=True, disposal=1)


# --------------------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    cache, chars, previews, colors, dither = DEFAULT_CACHE, None, True, 144, 0.6
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--cache':
            cache = args[i + 1]; i += 2; continue
        if a == '--chars':
            chars = args[i + 1].split(','); i += 2; continue
        if a == '--colors':
            colors = int(args[i + 1]); i += 2; continue
        if a == '--dither':
            dither = float(args[i + 1]); i += 2; continue
        if a == '--no-previews':
            previews = False
        i += 1
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(PREV, exist_ok=True)
    man_path = os.path.join(OUT, 'manifest.json')
    old = {}
    if os.path.exists(man_path):
        with open(man_path) as f:
            old = json.load(f)
    characters = dict(old.get('characters', {}))
    proc_all, metas = {}, {}
    for key in wkr_build.KEYS:
        if chars is not None and key not in chars:
            continue
        meta = load_meta(cache, key)
        if meta is None:
            print(f'[{key}] no renders in cache, skipped')
            continue
        processed = processed_frames(cache, key, meta)
        pack_variant(key, processed, colors, dither)
        ppath = os.path.join(cache, key, 'portrait.png')
        has_portrait = os.path.exists(ppath)
        if has_portrait:
            Image.open(ppath).convert('RGBA').save(os.path.join(OUT, f'portrait_{key}.png'), optimize=True)
        characters[key] = manifest_entry(key, meta, processed, has_portrait)
        proc_all[key], metas[key] = processed, meta
        if previews:
            char_pack.contact(key, meta, processed, os.path.join(PREV, f'wkr_{key}.png'))

    present = [k for k in wkr_build.KEYS if k in characters and os.path.exists(os.path.join(OUT, f'wkr_{k}.png'))]
    man = {
        'version': 1,
        'notes': ('v4 worker variants (CONTRACT_V4 H): 2 extra looks per profession. Same anims, frame names, '
                  'impactFrame/impactPoint and carryPoint semantics as the base worker in assets/characters '
                  '(characters.<key>.variantOf). professions{} lists the hire order per profession: base first, '
                  'then the variants, so a 2nd/3rd hire of the same job looks different. Hunter variants shoot the '
                  'shared sprites.projectile_arrow (atlas char_hunter).'),
        'atlases': [{'key': f'wkr_{k}', 'png': f'workers/wkr_{k}.png', 'json': f'workers/wkr_{k}.json'}
                    for k in present],
        'images': [], 'sprites': {},
        'characters': {k: characters[k] for k in present},
        'professions': {p: [p] + [k for k in present if wkr_build.VARIANTS[k]['base'] == p]
                        for p in wkr_build.PROFESSIONS},
    }
    for k in present:
        if os.path.exists(os.path.join(OUT, f'portrait_{k}.png')):
            man['images'].append({'key': f'portrait_{k}', 'png': f'workers/portrait_{k}.png'})
            man['sprites'][f'portrait_{k}'] = {'image': f'portrait_{k}', 'anchor': [0.5, 0.5], 'kind': 'ui',
                                               'notes': '128x128 head-and-shoulders, facing S'}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'manifest: {len(present)} worker variants; assets/workers total {total:,} bytes '
          f'({total / 1e6:.2f} MB, budget 4 MB)')

    if previews and chars is None and len(proc_all) == len(wkr_build.KEYS):
        rows = all_workers(proc_all, metas)
        lineup(rows, os.path.join(PREV, 'wkr_lineup.png'))
        anim_gif(rows, 'work', os.path.join(PREV, 'wkr_work_all.gif'))
        anim_gif(rows, 'walk', os.path.join(PREV, 'wkr_walk_all.gif'))
        print('previews: wkr_lineup.png, wkr_work_all.gif, wkr_walk_all.gif, wkr_<key>.png')


if __name__ == '__main__':
    main()
