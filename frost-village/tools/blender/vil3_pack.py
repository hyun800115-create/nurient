"""
vil3_pack.py - batch-3 operator frames -> game atlases + manifest + previews (기획서_v3_분업).
Plain python3 (numpy + Pillow + imagequant), no Blender.

Run AFTER vil3_render.py:
    python3 tools/blender/vil3_pack.py                         # everything in the cache
    python3 tools/blender/vil3_pack.py --chars npc_sawyer      # one key (manifest keeps the others)
    python3 tools/blender/vil3_pack.py --no-previews --colors 96 --dither 0.35
    python3 tools/blender/vil3_pack.py --out /tmp/x --prev /tmp/y   (dry run elsewhere)

What it does (same post-processing as batches 1 + 2; vil_pack / vil2_pack are reused, not changed)
  1. soft 1px ink outline on every raw 128x128 frame (char_pack.ink_outline)
  2. assets/villagers3/vil_<key>.png/.json (Phaser JSON hash, trimmed), palettised with
     libimagequant (default 96 colours per atlas like batch 2, dither 0.35 -> ~3.2 MB, budget 3.5 MB)
  3. portraits -> assets/villagers3/portrait_<key>.png
  4. assets/villagers3/manifest.json (same format as assets/villagers2).  The override keys
     (npc_chef, npc_aunt, npc_blacksmith) keep their old manifest data (name, role, traits,
     headTop, shadow, seat data) and atlas / portrait KEYS, so a later-merged villagers3
     fragment replaces the older entries - and their older atlas files - completely.
  5. previews: docs/previews/vil3_lineup.png, vil3_operate.png (6 operators x operate in S and E),
     vil3_<key>.png contact sheets, GIFs vil3_<key>_operate.gif (all 5 dirs)
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
import vil2_pack as vp2        # noqa: E402   (contact sheet / cell helpers; importing runs nothing)
import vil3_build as vb3       # noqa: E402
import vil3_anim as va3        # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'villagers3')
PREV = os.path.join(GAME, 'docs', 'previews')
DEFAULT_CACHE = '/tmp/fv_cache/villagers3'
DIRS = ['S', 'SE', 'E', 'NE', 'N']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
BG = (201, 214, 232, 255)
LABEL = (43, 47, 58, 255)
KEEP_OLD = ('name', 'role', 'traits', 'headTop', 'shadow', 'portrait', 'seatOffset', 'seatHeightPx', 'headTopSit',
            'kind')

NOTES = ('Residents batch 3 = station operators (기획서_v3_분업; same format as assets/villagers2, '
         'CONTRACT_VILLAGERS A + CONTRACT_V3 D). Frames {anim}_{dir}_{i}; each anim lists its dirs (social anims '
         'S/SE/E only, mirror SW/W/NW from SE/E/NE). NEW keys: npc_sawyer, npc_smoker, npc_cannery (12 core anims + '
         'operate). OVERRIDES: npc_chef (was assets/villagers2), npc_aunt and npc_blacksmith (were assets/villagers) '
         'are COMPLETE re-renders - every anim they had, same model and poses, plus operate - under the SAME '
         'character keys AND the same atlas / portrait keys (vil_<key>, portrait_<key>). Merge this fragment AFTER '
         'villagers and villagers2 (later fragment wins, key by key): the override entries then replace the old '
         'character entries and the old atlas entries, so the older vil_npc_chef / vil_npc_aunt / '
         'vil_npc_blacksmith files are not downloaded at all. Put villagers3 in LAZY_FRAGMENTS like villagers2. '
         'operate = working a station at hip/chest height: 8 frames, 10 fps, loop, ALL 5 dirs (it is not cheated '
         'toward the camera, the operator really faces the station). operate.impactFrame = the visible beat '
         '(flip apex / rolling push / hammer hit / log into the blade / ham hooked / press down); '
         'operate.impactPoint[dir] = [dx, dy] px from the anchor of the beat (sparks, flour, sawdust, steam; negate '
         'dx for mirrored dirs); operate.beats = [{frame, kind, point{dir}}] (beats[0] = the impact, beats[1] a '
         'second sfx/particle cue); operate.station = the station sprite key; operate.workTool = what is drawn. '
         'Tools are baked into the operate frames only. Work surfaces (bakery board, can press) sit 0.50 m high '
         'about 0.35-0.55 m in front of the anchor: stand the operator at the station edge facing it '
         '(operate.workSpot gives forward/height in metres). carryStyle "front" + carryPoint/carryPointFrames as in '
         'batch 2. headTop for the overrides is kept from their old manifests.')

SHOWCASE_EXTRA = [('npc_chef', 'serve'), ('npc_aunt', 'sit')]
WORK_SPOT = {'grill': (0.53, 0.60), 'bakery': (0.35, 0.50), 'smelter': (0.45, 0.50), 'sawmill': (0.80, 0.60),
             'smokehouse': (0.25, 0.85), 'cannery': (0.50, 0.50)}


def load_old_manifests():
    out = {}
    for f in ('villagers', 'villagers2'):
        p = os.path.join(ASSETS, f, 'manifest.json')
        if os.path.exists(p):
            with open(p, encoding='utf-8') as fh:
                out[f] = json.load(fh)
    return out


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
        raise SystemExit(f'[{key}] missing {len(missing)} frames, e.g. {missing[:4]} - run vil3_render.py')
    sheet, atlas = pack_utils.pack_atlas(frames, max_width=2048, trim=True, padding=2)
    png = os.path.join(out_dir, f'vil_{key}.png')
    js = os.path.join(out_dir, f'vil_{key}.json')
    pack_utils.save_atlas(sheet, atlas, png, js, quantize=False)
    vp.quantize_save(sheet, png, colors, dither)
    print(f'[{key}] atlas {sheet.size[0]}x{sheet.size[1]}  {os.path.getsize(png) / 1024:.0f} KB  '
          f'({len(frames)} frames)', flush=True)
    return processed


def manifest_entry(key, meta, processed, has_portrait, old):
    anims = {}
    role = vb3.ROLE[key]
    for anim, info in meta['anims'].items():
        e = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info['repeat'], 'dirs': info['dirs']}
        for f in ('impactFrame', 'impactPoint', 'beats'):
            if f in info:
                e[f] = info[f]
        if anim == 'operate':
            R = va3.ROLES[role]
            e['station'] = R['station']
            e['workTool'] = R['workTool']
            fwd, hgt = WORK_SPOT[role]
            e['workSpot'] = {'forwardM': fwd, 'heightM': hgt}
        anims[anim] = e
    src = vb3.SOURCE.get(key)
    if src:
        prev = old[src]['characters'][key]
        ent = {'atlas': prev['atlas']}
        assert prev['atlas'] == f'vil_{key}', prev['atlas']
    else:
        prev = None
        ent = {'atlas': f'vil_{key}'}
    ent.update({'frameSize': meta['frameSize'], 'anchor': meta['anchor'], 'dirs': DIRS, 'mirror': MIRROR,
                'frameName': '{anim}_{dir}_{i}', 'kind': 'villager'})
    if prev:
        for f in KEEP_OLD:
            if f in prev:
                ent[f] = prev[f]
    else:
        spec = vb3.SPECS[key]
        ent.update({'role': spec['role'], 'name': {'ko': spec['name'][0], 'en': spec['name'][1]},
                    'traits': spec['traits'], 'headTop': meta['headTop'], 'shadow': meta.get('shadow', [46, 18])})
        if has_portrait:
            ent['portrait'] = f'portrait_{key}'
    ent['anims'] = anims
    ent['carryStyle'] = 'front'
    ent['carryPoint'] = meta['carryPoint']
    ent['carryPointFrames'] = meta['carryPointFrames']
    ent['operates'] = [va3.ROLES[role]['station']]
    if src:
        ent['overrides'] = src
    order = ['atlas', 'frameSize', 'anchor', 'dirs', 'mirror', 'frameName', 'kind', 'role', 'name', 'traits',
             'anims', 'carryStyle', 'carryPoint', 'carryPointFrames', 'headTop', 'shadow', 'portrait', 'seatOffset',
             'seatHeightPx', 'headTopSit', 'operates', 'overrides']
    return {k: ent[k] for k in order if k in ent}


# --------------------------------------------------------------------------- previews

def lineup(all_proc, path):
    """Each operator: idle S + operate S on its impact frame, 2x."""
    keys = [k for k in vb3.ALL_KEYS if k in all_proc]
    cw, z = 96, 2
    img = Image.new('RGBA', (len(keys) * 2 * cw * z, 128 * z + 40), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 100 * z, img.width, img.height], fill=(232, 238, 246, 255))
    for c, k in enumerate(keys):
        imp = all_proc[k]['_imp']
        for j, fr_name in enumerate(('idle_S_0', f'operate_S_{imp}')):
            fr = all_proc[k][fr_name].crop((16, 0, 112, 128))
            sh = Image.new('RGBA', fr.size, (0, 0, 0, 0))
            sw, shh = all_proc[k]['_shadow']
            ImageDraw.Draw(sh).ellipse([48 - sw * 0.4, 104 - shh * 0.4, 48 + sw * 0.4, 104 + shh * 0.4],
                                       fill=(90, 110, 140, 70))
            cell = Image.alpha_composite(sh, fr).resize((cw * z, 128 * z), Image.LANCZOS)
            img.alpha_composite(cell, ((2 * c + j) * cw * z, 0))
        x0 = 2 * c * cw * z + 8
        tag = 'override' if k in vb3.SOURCE else 'new'
        d.text((x0, 128 * z + 4), f'{k.replace("npc_", "")} ({tag}) - {va3.ROLES[vb3.ROLE[k]]["station"]}',
               fill=LABEL)
        d.text((x0, 128 * z + 20), f'{all_proc[k]["_name"]}: idle / operate', fill=(90, 96, 110, 255))
    img.convert('RGB').save(path, optimize=True)


def operate_sheet(all_proc, metas, path, z=2):
    keys = [k for k in vb3.ALL_KEYS if k in all_proc]
    rows = [(k, d) for k in keys for d in ('S', 'E')]
    lab, cw, ch = 150, 120 * z, 124 * z
    img = Image.new('RGBA', (lab + 8 * cw, len(rows) * ch + 30), BG)
    dr = ImageDraw.Draw(img)
    dr.text((8, 8), 'operate - 8 frames @ 10 fps, loop (red frame = impactFrame, yellow cross = impactPoint)',
            fill=LABEL)
    for r, (k, dd) in enumerate(rows):
        info = metas[k]['anims']['operate']
        y = 30 + r * ch
        dr.text((8, y + ch // 2 - 14), f'{k.replace("npc_", "")} {dd}', fill=LABEL)
        dr.text((8, y + ch // 2 + 2), va3.ROLES[vb3.ROLE[k]]['station'], fill=(90, 96, 110, 255))
        for c in range(info['frames']):
            im = all_proc[k][f'operate_{dd}_{c}'].crop((4, 0, 124, 124))
            x = lab + c * cw
            img.alpha_composite(im.resize((cw, ch), Image.NEAREST), (x, y))
            if c == info['impactFrame']:
                dr.rectangle([x + 1, y + 1, x + cw - 2, y + ch - 2], outline=(232, 67, 58, 255), width=2)
                ip = info['impactPoint'][dd]
                cx, cy = x + (60 + ip[0]) * z, y + (104 + ip[1]) * z
                dr.line([cx - 7, cy, cx + 7, cy], fill=(255, 200, 61, 255), width=3)
                dr.line([cx, cy - 7, cx, cy + 7], fill=(255, 200, 61, 255), width=3)
    vp.quantize_save(img.convert('RGBA'), path, 256, dither=0.3)


def _cell(im, crop=(4, 4, 124, 124)):
    bg = Image.new('RGBA', (crop[2] - crop[0], crop[3] - crop[1]), (0, 0, 0, 0))
    bg.alpha_composite(im.crop(crop))
    return bg


def contact(key, meta, processed, path):
    rows = []
    for anim, info in meta['anims'].items():
        rows.append((anim, 'S', [processed[f'{anim}_S_{i}'] for i in range(info['frames'])]))
    rows.append(('dirs (idle)', '', [processed[f'idle_{d}_0'] for d in DIRS]))
    rows.append(('dirs (walk)', '', [processed[f'walk_{d}_2'] for d in DIRS]))
    rows.append(('dirs (carry)', '', [processed[f'carry_walk_{d}_0'] for d in DIRS]))
    oi = meta['anims']['operate']
    rows.append(('operate@impact', '', [processed[f'operate_{d}_{oi["impactFrame"]}'] for d in DIRS]))
    for d in ('E', 'N'):
        rows.append(('operate', d, [processed[f'operate_{d}_{i}'] for i in range(oi['frames'])]))
    cols = max(len(r[2]) for r in rows)
    lab, cw, chh = 112, 120, 120
    img = Image.new('RGBA', (lab + cols * cw, len(rows) * chh), BG)
    d = ImageDraw.Draw(img)
    for r, (name, dd, ims) in enumerate(rows):
        d.text((6, r * chh + chh // 2 - 6), f'{name} {dd}', fill=LABEL)
        info = meta['anims'].get(name, {})
        for c, im in enumerate(ims):
            x, y = lab + c * cw, r * chh
            if name == 'dirs (carry)':
                im = vp2.with_stack(im, meta['carryPoint'][DIRS[c]], 'item_bread', 3)
            img.alpha_composite(_cell(im), (x, y))
            mark_dir = dd if dd else (DIRS[c] if name == 'operate@impact' else None)
            hit = (info.get('impactFrame') == c and dd) or name == 'operate@impact'
            if hit and mark_dir:
                d.rectangle([x + 1, y + 1, x + cw - 2, y + chh - 2], outline=(232, 67, 58, 255))
                ipd = (oi if name == 'operate@impact' else info).get('impactPoint', {}).get(mark_dir)
                if ipd:
                    cx, cy = x + 60 + ipd[0], y + 100 + ipd[1]
                    d.line([cx - 4, cy, cx + 4, cy], fill=(255, 200, 61, 255), width=2)
                    d.line([cx, cy - 4, cx, cy + 4], fill=(255, 200, 61, 255), width=2)
    vp.quantize_save(img.convert('RGBA'), path, 256, dither=0.3)


def gif(key, meta, processed, anim, path, z=1.5):
    info = meta['anims'][anim]
    dirs = info['dirs']
    cw = 120
    frames = []
    n = info['frames']
    loops = 1 if info['repeat'] == 0 else 2
    seq = list(range(n)) * loops
    if info['repeat'] == 0:
        seq += [n - 1] * max(2, n // 2)
    for i in seq:
        canvas = Image.new('RGBA', (len(dirs) * cw, 128), BG)
        for c, d in enumerate(dirs):
            im = processed[f'{anim}_{d}_{i}']
            canvas.alpha_composite(im.crop((4, 0, 124, 128)), (c * cw, 0))
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
    old = load_old_manifests()
    man_path = os.path.join(out_dir, 'manifest.json')
    prev_man = {}
    if os.path.exists(man_path):
        with open(man_path, encoding='utf-8') as f:
            prev_man = json.load(f)
    characters = dict(prev_man.get('characters', {}))
    keys = [k for k in vb3.ALL_KEYS if chars is None or k in chars]
    all_proc, metas = {}, {}
    for key in keys:
        meta = vp2.load_meta(cache, key)
        if meta is None:
            print(f'[{key}] no renders in cache, skipped')
            continue
        processed = pack_key(cache, key, meta, colors, out_dir, dither)
        pp = os.path.join(cache, key, 'portrait.png')
        has_p = os.path.exists(pp)
        if has_p:
            vp.quantize_save(Image.open(pp).convert('RGBA'), os.path.join(out_dir, f'portrait_{key}.png'), 256, 0.4)
        characters[key] = manifest_entry(key, meta, processed, has_p, old)
        processed['_imp'] = meta['anims']['operate']['impactFrame']
        processed['_shadow'] = characters[key]['shadow']
        processed['_name'] = characters[key]['name']['en']
        all_proc[key], metas[key] = processed, meta
        if previews:
            contact(key, meta, processed, os.path.join(prev_dir, f'vil3_{key}.png'))
            gif(key, meta, processed, 'operate', os.path.join(prev_dir, f'vil3_{key}_operate.gif'))
    present = [k for k in vb3.ALL_KEYS if k in characters and os.path.exists(os.path.join(out_dir, f'vil_{k}.png'))]
    man = {'version': 1, 'notes': NOTES,
           'atlases': [{'key': f'vil_{k}', 'png': f'villagers3/vil_{k}.png', 'json': f'villagers3/vil_{k}.json'}
                       for k in present],
           'images': [], 'sprites': {}, 'characters': {k: characters[k] for k in present}}
    for k in present:
        if os.path.exists(os.path.join(out_dir, f'portrait_{k}.png')):
            man['images'].append({'key': f'portrait_{k}', 'png': f'villagers3/portrait_{k}.png'})
            man['sprites'][f'portrait_{k}'] = {'image': f'portrait_{k}', 'anchor': [0.5, 0.5], 'kind': 'ui',
                                               'notes': '128x128 head-and-shoulders, facing S'}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    if previews and all_proc and len(all_proc) == len(present):
        lineup(all_proc, os.path.join(prev_dir, 'vil3_lineup.png'))
        operate_sheet(all_proc, metas, os.path.join(prev_dir, 'vil3_operate.png'))
    total = sum(os.path.getsize(os.path.join(out_dir, f)) for f in os.listdir(out_dir))
    print(f'manifest: {len(present)} keys; {out_dir} total {total:,} bytes ({total / 1e6:.2f} MB / '
          f'{total / 1048576:.2f} MiB)')


if __name__ == '__main__':
    main()
