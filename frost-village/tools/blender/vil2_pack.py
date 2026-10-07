"""
vil2_pack.py - batch-2 resident frames -> game atlases + manifest + previews
(CONTRACT_V3 section D).  Plain python3 (numpy + Pillow + imagequant), no Blender.

Run AFTER vil2_render.py:
    python3 tools/blender/vil2_pack.py                       # everything in the cache
    python3 tools/blender/vil2_pack.py --chars npc_chef      # one key (manifest keeps the others)
    python3 tools/blender/vil2_pack.py --no-previews --colors 160 --dither 0.6
    python3 tools/blender/vil2_pack.py --out /tmp/x --prev /tmp/y   (dry run elsewhere)

What it does (same post-processing as batch 1, vil_pack.py is reused, not changed)
  1. soft 1px ink outline on every raw 128x128 frame (char_pack.ink_outline)
  2. assets/villagers2/vil_<key>.png/.json (Phaser JSON hash, trimmed, anchor stays
     relative to the 128x128 frame), palettised with libimagequant (default 96
     colours per atlas, dither 0.35 - checked side by side with the RGBA sheet at 3x
     zoom; keeps the folder at ~5.84 MB = 5.57 MiB, under the 6 MB budget in both
     units; --colors / --dither)
  3. portraits -> assets/villagers2/portrait_<key>.png
  4. assets/villagers2/manifest.json  (CONTRACT_VILLAGERS A format + CONTRACT_V3 D fields)
  5. previews: docs/previews/vil2_lineup.png, vil2_<key>.png contact sheets, GIFs
     vil2_<key>_<anim>.gif (porter carry_walk drawn WITH an item stack on the
     carrier at carryPoint, clerk/chef serve, skater skate, toddler run + fall, ...)
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
import pack_utils              # noqa: E402
from char_pack import ink_outline   # noqa: E402
import vil_pack as vp          # noqa: E402   (quantize_save, head_top; importing runs nothing)
import vil2_build as vb2       # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'villagers2')
PREV = os.path.join(GAME, 'docs', 'previews')
DEFAULT_CACHE = '/tmp/fv_cache/villagers2'
DIRS = ['S', 'SE', 'E', 'NE', 'N']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
BG = (201, 214, 232, 255)
LABEL = (43, 47, 58, 255)

SHOWCASE = [('npc_porter_a', 'carry_walk'), ('npc_porter_b', 'carry_walk'), ('npc_clerk_a', 'serve'),
            ('npc_clerk_b', 'serve'), ('npc_chef', 'serve'), ('npc_skater', 'skate'), ('npc_toddler', 'run'),
            ('npc_toddler', 'fall'), ('npc_guard', 'salute'), ('npc_clerk_a', 'bow'), ('npc_painter', 'dance'),
            ('npc_captain', 'sit'), ('npc_postman', 'run'), ('npc_doctor', 'talk')]
STACK_ITEM = {'npc_porter_a': ('item_log', 5), 'npc_porter_b': ('item_bread', 5)}

NOTES = ('Residents batch 2 (CONTRACT_V3 D; same format as assets/villagers, CONTRACT_VILLAGERS A). Frames '
         '{anim}_{dir}_{i}; each anim lists its dirs (social anims S/SE/E only, mirror SW/W from SE/E). '
         'Expressions are baked per frame. carryStyle: "back" = porters carry the stack ON THE CARRIER FRAME: '
         'carryPoint[dir] = [dx, dy, behind] is the stack bottom on the shelf (behind=true for S/SE/E, false '
         'for NE/N); "front" = between the hands like batch 1. carryPointFrames[dir] = the same point for each '
         'carry_walk frame (optional, follows the walk bob). serve.impactFrame = hand-over moment, '
         'serve.impactPoint[dir] = centre of the parcel/dish on that frame. sit: anchor = seat-surface '
         'front-centre (0.45 m up), seatHeightPx = its height above the ground. headTop is measured on the '
         'head/hat geometry (carrier frames and the guard\'s spear excluded).')


def load_meta(cache, key):
    p = os.path.join(cache, key, 'meta.json')
    if not os.path.exists(p):
        return None
    with open(p) as f:
        return json.load(f)


def pack_key(cache, key, meta, colors, out_dir, dither=0.35):
    frames, processed, missing = [], {}, []
    for anim, info in meta['anims'].items():
        for d in info['dirs']:
            for i in range(info['frames']):
                p = os.path.join(cache, key, f'{anim}_{d}_{i}.png')
                if not os.path.exists(p):
                    missing.append(os.path.basename(p))
                    continue
                im = ink_outline(Image.open(p))
                name = f'{anim}_{d}_{i}'
                frames.append((name, im))
                processed[name] = im
    if missing:
        raise SystemExit(f'[{key}] missing {len(missing)} frames, e.g. {missing[:4]} - run vil2_render.py')
    sheet, atlas = pack_utils.pack_atlas(frames, max_width=2048, trim=True, padding=2)
    png = os.path.join(out_dir, f'vil_{key}.png')
    js = os.path.join(out_dir, f'vil_{key}.json')
    pack_utils.save_atlas(sheet, atlas, png, js, quantize=False)
    vp.quantize_save(sheet, png, colors, dither)
    print(f'[{key}] atlas {sheet.size[0]}x{sheet.size[1]}  {os.path.getsize(png) / 1024:.0f} KB  '
          f'({len(frames)} frames)', flush=True)
    return processed


def manifest_entry(key, meta, processed, has_portrait):
    spec = vb2.SPECS[key]
    anims = {}
    for anim, info in meta['anims'].items():
        e = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info['repeat'], 'dirs': info['dirs']}
        if 'impactFrame' in info:
            e['impactFrame'] = info['impactFrame']
        if 'impactPoint' in info:
            e['impactPoint'] = info['impactPoint']
        anims[anim] = e
    ent = {
        'atlas': f'vil_{key}', 'frameSize': meta['frameSize'], 'anchor': meta['anchor'],
        'dirs': DIRS, 'mirror': MIRROR, 'frameName': '{anim}_{dir}_{i}',
        'kind': 'villager', 'role': spec['role'], 'name': {'ko': spec['name'][0], 'en': spec['name'][1]},
        'traits': spec['traits'], 'anims': anims,
        'carryStyle': meta['carryStyle'], 'carryPoint': meta['carryPoint'],
        'carryPointFrames': meta['carryPointFrames'],
        'headTop': meta.get('headTop', vp.head_top(processed['idle_S_0'])),
        'shadow': meta.get('shadow', [46, 18]),
    }
    if has_portrait:
        ent['portrait'] = f'portrait_{key}'
    if 'seatOffset' in meta:
        ent['seatOffset'] = meta['seatOffset']
        ent['seatHeightPx'] = meta['seatHeightPx']
        ent['headTopSit'] = meta.get('headTopSit', vp.head_top(processed['sit_S_0']))
    return ent


# --------------------------------------------------------------------------- item stack (previews only)

_ITEMS = {}


def item_frame(name):
    """Full 72x72 item frame from assets/props/props_items (anchor (36,54))."""
    if name in _ITEMS:
        return _ITEMS[name]
    with open(os.path.join(ASSETS, 'props', 'manifest.json')) as f:
        man = json.load(f)
    sp = man['sprites'][name]
    with open(os.path.join(ASSETS, 'props', sp['atlas'] + '.json')) as f:
        atl = json.load(f)
    sheet = Image.open(os.path.join(ASSETS, 'props', sp['atlas'] + '.png')).convert('RGBA')
    fr = atl['frames'][sp['frame']]
    r, ss, src = fr['frame'], fr['spriteSourceSize'], fr['sourceSize']
    full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
    full.alpha_composite(sheet.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
    _ITEMS[name] = (full, sp.get('stackStep', 10), sp.get('carryScale', 0.6), sp['anchor'])
    return _ITEMS[name]


def with_stack(frame, cp, item, n, ax=64, ay=104):
    """Composite a game-like item tower at carryPoint cp=[dx,dy,behind] onto a 128x128 frame."""
    full, step, scale, anc = item_frame(item)
    w, h = round(full.width * scale), round(full.height * scale)
    it = full.resize((w, h), Image.LANCZOS)
    pad = 96
    layer = Image.new('RGBA', (frame.width + 2 * pad, frame.height + 2 * pad), (0, 0, 0, 0))
    bx, by = ax + cp[0] + pad, ay + cp[1] + pad
    for k in range(n):
        x = round(bx - anc[0] * w)
        y = round(by - k * step * scale - anc[1] * h)
        layer.alpha_composite(it, (max(0, x), max(0, y)))
    layer = layer.crop((pad, pad, pad + frame.width, pad + frame.height))
    if cp[2]:
        return Image.alpha_composite(layer, frame)
    return Image.alpha_composite(frame, layer)


# --------------------------------------------------------------------------- previews

def _cell(im, crop=(16, 4, 112, 124)):
    bg = Image.new('RGBA', (crop[2] - crop[0], crop[3] - crop[1]), (0, 0, 0, 0))
    bg.alpha_composite(im.crop(crop))
    return bg


def lineup(all_proc, path):
    keys = [k for k in vb2.ALL_KEYS if k in all_proc]
    cw, z = 72, 2
    img = Image.new('RGBA', (len(keys) * cw * z, 128 * z + 40), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 100 * z, img.width, img.height], fill=(232, 238, 246, 255))
    for c, k in enumerate(keys):
        fr = all_proc[k]['idle_S_0'].crop((28, 0, 100, 128))
        sh = Image.new('RGBA', fr.size, (0, 0, 0, 0))
        sw, shh = vb2.SPECS[k].get('shadow', [46, 18])
        ImageDraw.Draw(sh).ellipse([36 - sw * 0.4, 104 - shh * 0.4, 36 + sw * 0.4, 104 + shh * 0.4],
                                   fill=(90, 110, 140, 70))
        cell = Image.alpha_composite(sh, fr).resize((cw * z, 128 * z), Image.LANCZOS)
        img.alpha_composite(cell, (c * cw * z, 0))
        nm = vb2.SPECS[k]['name'][1]
        d.text((c * cw * z + 6, 128 * z + 4), k.replace('npc_', ''), fill=LABEL)
        d.text((c * cw * z + 6, 128 * z + 20), nm[:22], fill=(90, 96, 110, 255))
    img.convert('RGB').save(path, optimize=True)


def contact(key, meta, processed, path):
    rows = []
    for anim, info in meta['anims'].items():
        rows.append((anim, 'S', [processed[f'{anim}_S_{i}'] for i in range(info['frames'])]))
    rows.append(('dirs (idle)', '', [processed[f'idle_{d}_0'] for d in DIRS]))
    rows.append(('dirs (walk)', '', [processed[f'walk_{d}_2'] for d in DIRS]))
    rows.append(('dirs (carry)', '', [processed[f'carry_walk_{d}_0'] for d in DIRS]))
    for anim in ('serve', 'talk', 'skate', 'salute', 'bow', 'fall', 'sit'):
        if anim in meta['anims']:
            info = meta['anims'][anim]
            rows.append((anim, 'E', [processed[f'{anim}_E_{i}'] for i in range(info['frames'])]))
    cols = max(len(r[2]) for r in rows)
    lab, cw, ch = 92, 96, 120
    img = Image.new('RGBA', (lab + cols * cw, len(rows) * ch), BG)
    d = ImageDraw.Draw(img)
    for r, (name, dd, ims) in enumerate(rows):
        d.text((6, r * ch + ch // 2 - 6), f'{name} {dd}', fill=LABEL)
        info = meta['anims'].get(name, {})
        for c, im in enumerate(ims):
            x, y = lab + c * cw, r * ch
            if name == 'dirs (carry)':
                it, n = STACK_ITEM.get(key, ('item_plank', 3))
                im = with_stack(im, meta['carryPoint'][DIRS[c]], it, n)
            img.alpha_composite(_cell(im), (x, y))
            if info.get('impactFrame') == c and dd:
                d.rectangle([x + 1, y + 1, x + cw - 2, y + ch - 2], outline=(232, 67, 58, 255))
                ip = info.get('impactPoint', {}).get(dd)
                if ip:
                    cx, cy = x + 48 + ip[0], y + 100 + ip[1]
                    d.line([cx - 4, cy, cx + 4, cy], fill=(255, 200, 61, 255), width=2)
                    d.line([cx, cy - 4, cx, cy + 4], fill=(255, 200, 61, 255), width=2)
    vp.quantize_save(img.convert('RGBA'), path, 256, dither=0.3)


def gif(key, meta, processed, anim, path, z=1.5):
    info = meta['anims'][anim]
    dirs = info['dirs']
    cw = 80
    frames = []
    n = info['frames']
    loops = 1 if info['repeat'] == 0 else 2
    seq = list(range(n)) * loops
    if info['repeat'] == 0:
        seq += [n - 1] * max(2, n // 2)
    stack = anim == 'carry_walk' and meta.get('carryStyle') == 'back'
    for i in seq:
        canvas = Image.new('RGBA', (len(dirs) * cw, 128), BG)
        for c, d in enumerate(dirs):
            im = processed[f'{anim}_{d}_{i}']
            if stack:
                cp = meta['carryPointFrames'][d][i] + [meta['carryPoint'][d][2]]
                it, k = STACK_ITEM.get(key, ('item_plank', 4))
                im = with_stack(im, cp, it, k)
            canvas.alpha_composite(im.crop((24, 0, 104, 128)), (c * cw, 0))
        frames.append(canvas.resize((int(canvas.width * z), int(canvas.height * z)), Image.LANCZOS).convert('RGB'))
    pal = frames[0].quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / info['fps']), loop=0, optimize=True,
              disposal=1)


# --------------------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    cache, chars, previews, colors, dither = DEFAULT_CACHE, None, True, 96, 0.35
    out_dir, prev_dir = OUT, PREV
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
        if a == '--out':
            out_dir = args[i + 1]; i += 2; continue
        if a == '--prev':
            prev_dir = args[i + 1]; i += 2; continue
        if a == '--no-previews':
            previews = False
        i += 1
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(prev_dir, exist_ok=True)
    man_path = os.path.join(out_dir, 'manifest.json')
    old = {}
    if os.path.exists(man_path):
        with open(man_path, encoding='utf-8') as f:
            old = json.load(f)
    characters = dict(old.get('characters', {}))
    keys = [k for k in vb2.ALL_KEYS if chars is None or k in chars]
    all_proc, metas = {}, {}
    for key in keys:
        meta = load_meta(cache, key)
        if meta is None:
            print(f'[{key}] no renders in cache, skipped')
            continue
        processed = pack_key(cache, key, meta, colors, out_dir, dither)
        all_proc[key], metas[key] = processed, meta
        pp = os.path.join(cache, key, 'portrait.png')
        has_p = os.path.exists(pp)
        if has_p:
            vp.quantize_save(Image.open(pp).convert('RGBA'), os.path.join(out_dir, f'portrait_{key}.png'), 256, 0.4)
        characters[key] = manifest_entry(key, meta, processed, has_p)
        if previews:
            contact(key, meta, processed, os.path.join(prev_dir, f'vil2_{key}.png'))
            for k2, anim in SHOWCASE:
                if k2 == key and anim in meta['anims']:
                    gif(key, meta, processed, anim, os.path.join(prev_dir, f'vil2_{key}_{anim}.gif'))
    present = [k for k in vb2.ALL_KEYS if k in characters and os.path.exists(os.path.join(out_dir, f'vil_{k}.png'))]
    man = {'version': 1, 'notes': NOTES,
           'atlases': [{'key': f'vil_{k}', 'png': f'villagers2/vil_{k}.png', 'json': f'villagers2/vil_{k}.json'}
                       for k in present],
           'images': [], 'sprites': {}, 'characters': {k: characters[k] for k in present}}
    for k in present:
        if os.path.exists(os.path.join(out_dir, f'portrait_{k}.png')):
            man['images'].append({'key': f'portrait_{k}', 'png': f'villagers2/portrait_{k}.png'})
            man['sprites'][f'portrait_{k}'] = {'image': f'portrait_{k}', 'anchor': [0.5, 0.5], 'kind': 'ui',
                                               'notes': '128x128 head-and-shoulders, facing S'}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    if previews and all_proc and len(all_proc) == len(present):
        lineup(all_proc, os.path.join(prev_dir, 'vil2_lineup.png'))
    total = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    print(f'manifest: {len(present)} keys; {out_dir} total {total:,} bytes ({total / 1e6:.2f} MB / '
          f'{total / 1048576:.2f} MiB)')


if __name__ == '__main__':
    main()
