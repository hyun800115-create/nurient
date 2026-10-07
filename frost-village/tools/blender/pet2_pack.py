"""
pet2_pack.py - rendered dog-play frames + items -> assets/pets2/ (CONTRACT_V4 section I) + previews.

Run AFTER pet2_render.py (plain python3 + numpy + Pillow + imagequant, no Blender):
    python3 tools/blender/pet2_pack.py                   # atlases + manifest + previews + GIFs
    python3 tools/blender/pet2_pack.py --no-previews
    python3 tools/blender/pet2_pack.py --colors 256 --cache /tmp/fv_cache/pets2
Then the UI icons (independent, any order): python3 tools/fx/gen_pets2_ui.py
And the check:                              python3 tools/blender/pet2_check.py

What it does
  1. every raw 128x128 dog frame gets the SAME soft 1px ink outline as the base cast / villagers
     (char_pack.ink_outline) -> atlas pets2_pet_dog (trimmed Phaser JSON hash, libimagequant palette)
  2. items: pack_utils.clean_alpha(floor=3) like every item -> atlas pets2_items (RGBA), carryScale
     measured with prop_pack.carry_scale (same rule as props / buildings items)
  3. portrait (vil_render UI camera) -> pets2/portrait_pet_dog.png
  4. assets/pets2/manifest.json - MERGED: rewrites only its own entries (pet_dog character, the two
     atlases above, portrait, item sprites); keeps the pets2_icons atlas + ui_icon_* written by
     tools/fx/gen_pets2_ui.py
  5. previews: docs/previews/pets2_sheet.png, pets2_before_after.png, pets2_scene.png,
     pets2_pet_dog_<anim>.gif for every new anim
Reads assets/villagers (batch-1 dog) only for the before/after preview; never writes it.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
GAME = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
sys.path.insert(0, HERE)
import pack_utils as pu          # noqa: E402
from char_pack import ink_outline   # noqa: E402
import vil_pack as vp            # noqa: E402  (quantize_save, head_top - read-only reuse)
import vil_build as vb           # noqa: E402  (batch-1 name / role / traits of pet_dog)
import pet2_anim as pa           # noqa: E402

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'pets2')
PREV = os.path.join(GAME, 'docs', 'previews')
DEFAULT_CACHE = '/tmp/fv_cache/pets2'
KEY = 'pet_dog'
DOG_ATLAS = 'pets2_pet_dog'
ITEM_ATLAS = 'pets2_items'
ITEMS = ['item_treat', 'item_ball']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
BG = (201, 214, 232, 255)
LABEL = (43, 47, 58, 255)

ANIM_NOTES = {
    'idle': 'batch-1 idle (blink on frame 3)',
    'walk': 'batch-1 trot', 'run': 'batch-1 bound (happy face)',
    'sit': 'batch-1 sit on the ground (plain anchor)', 'happy': 'batch-1 hop + tail wag',
    'eat': 'loop: sits and crunches the bone biscuit held across its jaws (^^ eyes, crumbs). Play after the '
           'chief `give` impactFrame for ~1.5 s, then hearts.',
    'roll': 'loop: belly-up on its back, paws paddling, tongue out - the pose for petting / belly rubs. The '
            'chief crouches at bellyPoint and plays `pet`.',
    'beg': 'loop: sits up on its haunches, front paws curled at the chest - asking for a treat / waiting for '
           'the ball.',
    'run_ball': 'loop: the batch-1 run with the red ball in its mouth (fetch, coming back). Use instead of run '
                'while it carries the ball; at the chief, drop item_ball at mouthPoint.',
    'catch': 'once: crouch, leap, snaps the ball on impactFrame 3 at impactPoint (hide the flying ball then), '
             'lands holding it - continue with run_ball.',
    'trick': 'once: play-bow, hop-spin 360 deg, lands facing you with a raised paw (ta-da). Holdable last frame.',
}


# --------------------------------------------------------------------------- loading

def load_json(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def load_dog(cache):
    meta_p = os.path.join(cache, KEY, 'meta.json')
    if not os.path.exists(meta_p):
        raise SystemExit(f'no {meta_p} - run pet2_render.py first')
    meta = load_json(meta_p)
    frames, missing = {}, []
    for anim in pa.ORDER:
        info = meta['anims'][anim]
        for d in info['dirs']:
            for i in range(info['frames']):
                p = os.path.join(cache, KEY, f'{anim}_{d}_{i}.png')
                if not os.path.exists(p):
                    missing.append(os.path.basename(p))
                    continue
                frames[f'{anim}_{d}_{i}'] = ink_outline(Image.open(p))
    if missing:
        raise SystemExit(f'[{KEY}] missing {len(missing)} frames, e.g. {missing[:4]} - run pet2_render.py')
    return meta, frames


def load_items(cache):
    out = {}
    for k in ITEMS:
        js = os.path.join(cache, 'items', k + '.json')
        png = os.path.join(cache, 'items', k + '.png')
        if not (os.path.exists(js) and os.path.exists(png)):
            raise SystemExit(f'[{k}] not rendered - run pet2_render.py -- --items')
        out[k] = (load_json(js), pu.clean_alpha(Image.open(png), floor=3))
    return out


# --------------------------------------------------------------------------- manifest

def dog_entry(meta, frames, has_portrait):
    spec = vb.SPECS[KEY]
    anims = {}
    for anim in pa.ORDER:
        info = meta['anims'][anim]
        e = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info['repeat'], 'dirs': info['dirs']}
        for k in ('impactFrame', 'impactPoint'):
            if k in info:
                e[k] = info[k]
        anims[anim] = e
    ent = {
        'atlas': DOG_ATLAS, 'frameSize': meta['frameSize'], 'anchor': meta['anchor'],
        'dirs': DIRS, 'mirror': MIRROR, 'frameName': '{anim}_{dir}_{i}',
        'kind': 'pet', 'role': 'pet', 'name': {'ko': spec['name'][0], 'en': spec['name'][1]},
        'traits': list(spec['traits']) + ['comes_when_called', 'loves_treats', 'fetch', 'belly_rubs'],
        'anims': anims,
        'headTop': vp.head_top(frames['idle_S_0']),
        'headTopBeg': vp.head_top(frames['beg_S_0']),
        'headTopRoll': vp.head_top(frames['roll_S_0']),
        'shadow': meta.get('shadow', [54, 23]),
        'mouthPoint': meta['mouthPoint'], 'treatPoint': meta['treatPoint'], 'bellyPoint': meta['bellyPoint'],
        'animNotes': {a: ANIM_NOTES[a] for a in pa.ORDER},
        'overrides': 'villagers/pet_dog (same look, batch-1 anims re-rendered identically + 6 play anims)',
    }
    if has_portrait:
        ent['portrait'] = 'portrait_pet_dog'
    return ent


def item_entry(k, meta, img):
    import prop_pack as pp
    return {'atlas': ITEM_ATLAS, 'frame': k, 'anchor': meta['anchor'], 'kind': 'item',
            'frameSize': meta['frameSize'], 'topPx': meta['topPx'][k], 'stackStep': meta['stackStep'],
            'icon': True, 'carryScale': pp.carry_scale(img), 'thicknessM': meta['thicknessM'],
            'notes': meta['notes']}


def write_manifest(entry, item_entries, has_portrait):
    path = os.path.join(OUT, 'manifest.json')
    man = load_json(path) if os.path.exists(path) else {}
    mine_atl = {DOG_ATLAS, ITEM_ATLAS}
    atl = [a for a in man.get('atlases', []) if a.get('key') not in mine_atl]
    atl = [{'key': DOG_ATLAS, 'png': f'pets2/{DOG_ATLAS}.png', 'json': f'pets2/{DOG_ATLAS}.json'},
           {'key': ITEM_ATLAS, 'png': f'pets2/{ITEM_ATLAS}.png', 'json': f'pets2/{ITEM_ATLAS}.json'}] + atl
    images = [i for i in man.get('images', []) if i.get('key') != 'portrait_pet_dog']
    sprites = {k: v for k, v in man.get('sprites', {}).items()
               if v.get('atlas') not in mine_atl and k != 'portrait_pet_dog'}
    if has_portrait:
        images.append({'key': 'portrait_pet_dog', 'png': 'pets2/portrait_pet_dog.png'})
        sprites['portrait_pet_dog'] = {'image': 'portrait_pet_dog', 'anchor': [0.5, 0.5], 'kind': 'ui',
                                       'notes': '128x128 head-and-shoulders, facing S (same as batch 1)'}
    sprites.update(item_entries)
    gens = dict(man.get('generators', {}))
    gens[DOG_ATLAS] = gens[ITEM_ATLAS] = 'tools/blender/pet2_render.py + pet2_pack.py'
    out = {
        'version': 1,
        'notes': 'Dog play (CONTRACT_V4 I). characters.pet_dog OVERRIDES the villagers fragment entry (same key, '
                 'same look; load this fragment after villagers). Frames {anim}_{dir}_{i}, 128x128, anchor '
                 '(64,104); each anim lists its dirs (social/play anims S/SE/E, mirror SW/W). Extra points are px '
                 'offsets from the anchor per render dir (negate dx for mirrored dirs): mouthPoint (ball/treat in '
                 'the mouth, idle), treatPoint (biscuit in eat), bellyPoint (belly centre in roll, where the '
                 'petting hand goes), anims.catch.impactPoint (ball centre at the catch frame). Items are 72x72 '
                 'like every item (anchor = bottom centre). Icons are 96x96 (anchor centre).',
        'generators': gens,
        'atlases': atl, 'images': images, 'sprites': sprites,
        'characters': {**{k: v for k, v in man.get('characters', {}).items() if k != KEY}, KEY: entry},
    }
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    return path


# --------------------------------------------------------------------------- previews

def gif(frames, anim, info, path, dirs=None, z=2):
    dirs = dirs or info['dirs']
    cw, chh = 84, 88
    n = info['frames']
    if info['repeat'] == 0:                       # one-shot: play, hold the last frame, repeat
        seq = (list(range(n)) + [n - 1] * 5) * 2
    else:
        seq = list(range(n)) * 3
    out = []
    for i in seq:
        canvas = Image.new('RGBA', (len(dirs) * cw, chh), BG)
        dr = ImageDraw.Draw(canvas)
        for c, d in enumerate(dirs):
            dr.ellipse([c * cw + 42 - 18, 72 - 7, c * cw + 42 + 18, 72 + 7], fill=(150, 168, 196, 255))
            canvas.alpha_composite(frames[f'{anim}_{d}_{i}'].crop((22, 32, 106, 120)), (c * cw, 0))
        out.append(canvas.resize((canvas.width * z, canvas.height * z), Image.NEAREST).convert('RGB'))
    pal = out[0].quantize(colors=192, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    q[0].save(path, save_all=True, append_images=q[1:], duration=int(1000 / info['fps']), loop=0, optimize=True,
              disposal=1)


def sheet(meta, frames, items, path):
    """All anims in S (+ E rows for the play anims), the 5 dirs of run_ball, items at 1x/2x."""
    rows = []
    for anim in pa.ORDER:
        info = meta['anims'][anim]
        rows.append((anim, 'S', [frames[f'{anim}_S_{i}'] for i in range(info['frames'])], info))
    for anim in pa.NEW:
        info = meta['anims'][anim]
        for d in ('SE', 'E'):
            rows.append((anim, d, [frames[f'{anim}_{d}_{i}'] for i in range(info['frames'])], info))
    rows.append(('run_ball dirs', '', [frames[f'run_ball_{d}_0'] for d in DIRS], None))
    lab, cw, ch = 104, 84, 84
    cols = max(len(r[2]) for r in rows)
    H = 40 + len(rows) * ch + 170
    img = Image.new('RGBA', (lab + cols * cw + 8, H), BG)
    d = ImageDraw.Draw(img)
    d.text((8, 10), 'pets2 / pet_dog - batch-1 shiba re-rendered + play anims (1:1 game scale, 1px ink '
                    'outline). Red box = catch impactFrame, yellow cross = impactPoint.', fill=LABEL)
    for r, (name, dd, ims, info) in enumerate(rows):
        y = 40 + r * ch
        new = name.split(' ')[0] in pa.NEW
        if new:
            d.rectangle([0, y, lab - 6, y + ch - 2], fill=(222, 232, 245, 255))
        d.text((6, y + ch // 2 - 6), f'{name} {dd}', fill=LABEL)
        for c, im in enumerate(ims):
            x = lab + c * cw
            d.ellipse([x + 42 - 17, y + 70 - 6, x + 42 + 17, y + 70 + 6], fill=(170, 186, 210, 255))
            img.alpha_composite(im.crop((22, 34, 106, 118)), (x, y))
            if info and info.get('impactFrame') == c and dd:
                d.rectangle([x + 1, y + 1, x + cw - 2, y + ch - 2], outline=(232, 67, 58, 255))
                ip = info.get('impactPoint', {}).get(dd)
                if ip:
                    cx, cy = x + 42 + ip[0], y + 70 + ip[1]
                    d.line([cx - 4, cy, cx + 4, cy], fill=(255, 200, 61, 255), width=1)
                    d.line([cx, cy - 4, cx, cy + 4], fill=(255, 200, 61, 255), width=1)
    y = 40 + len(rows) * ch + 10
    d.text((8, y), 'items (72x72): 1x, 2x, and a 4-stack at 1x', fill=LABEL)
    x = 10
    for k, (m, im) in items.items():
        img.alpha_composite(im, (x, y + 30))
        img.alpha_composite(im.resize((144, 144), Image.LANCZOS), (x + 70, y + 14))
        for s in range(4):
            img.alpha_composite(im, (x + 210, y + 50 - s * m['stackStep']))
        d.text((x, y + 150), k, fill=LABEL)
        x += 320
    vp.quantize_save(img, path, 256, dither=0.3)


def before_after(frames, path):
    """Batch-1 dog (assets/villagers, untouched) vs this re-render, same frames."""
    vdir = os.path.join(ASSETS, 'villagers')
    man = load_json(os.path.join(vdir, 'manifest.json'))
    ent = man['characters'].get(KEY)
    if not ent:
        return None
    atlas = load_json(os.path.join(vdir, f"{ent['atlas']}.json"))
    sheet_img = Image.open(os.path.join(vdir, f"{ent['atlas']}.png")).convert('RGBA')

    def old(name):
        fr = atlas['frames'][name]
        f, s = fr['frame'], fr['spriteSourceSize']
        im = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
        im.alpha_composite(sheet_img.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
        return im
    names = ['idle_S_0', 'idle_SE_0', 'idle_E_0', 'idle_NE_0', 'idle_N_0', 'walk_E_2', 'run_SE_3', 'sit_E_0',
             'happy_S_2']
    new_names = ['eat_S_1', 'roll_SE_0', 'beg_S_0', 'run_ball_E_2', 'catch_E_3', 'trick_S_7']
    z, cw, ch = 2, 84, 84
    W = 130 + len(names) * cw * z
    img = Image.new('RGBA', (W, 3 * ch * z + 70), BG)
    d = ImageDraw.Draw(img)
    diffs = []
    for k, n in enumerate(names):
        o, nw = old(n), frames[n]
        a = np.asarray(o, np.float32)
        b = np.asarray(nw, np.float32)
        diffs.append(float(np.abs(a - b).mean()))
        for r, im in enumerate((o, nw)):
            img.alpha_composite(im.crop((22, 34, 106, 118)).resize((cw * z, ch * z), Image.NEAREST),
                                (130 + k * cw * z, 30 + r * ch * z))
    for k, n in enumerate(new_names):
        img.alpha_composite(frames[n].crop((22, 34, 106, 118)).resize((cw * z, ch * z), Image.NEAREST),
                            (130 + k * cw * z, 30 + 2 * ch * z))
        d.text((130 + k * cw * z + 6, 30 + 3 * ch * z - 14), n, fill=LABEL)
    d.text((8, 10), 'before = assets/villagers vil_pet_dog (batch 1)   after = assets/pets2 pets2_pet_dog   '
                    '(mean |RGBA diff| per frame: ' + ', '.join(f'{v:.2f}' for v in diffs) + ')', fill=LABEL)
    for r, t in enumerate(('BEFORE\nbatch 1', 'AFTER\npets2', 'NEW play\nanims')):
        d.text((8, 30 + r * ch * z + ch * z // 2 - 10), t, fill=LABEL)
    for k, n in enumerate(names):
        d.text((130 + k * cw * z + 6, 30 + 2 * ch * z - 14), n, fill=LABEL)
    vp.quantize_save(img, path, 256, dither=0.3)
    return diffs


def scene(frames, items, icons_png, path):
    """Mock play moment: the dog in each play pose around the chief + the icon menu + heart gauge."""
    W, H = 760, 420
    img = Image.new('RGBA', (W, H), (244, 247, 251, 255))
    d = ImageDraw.Draw(img)
    # terracotta plaza diamond + snow
    d.polygon([(380, 120), (720, 290), (380, 460), (40, 290)], fill=(217, 160, 138, 255))
    ch_path = os.path.join(ASSETS, 'characters', 'char_player.json')
    player = None
    if os.path.exists(ch_path):
        atl = load_json(ch_path)
        sh = Image.open(os.path.join(ASSETS, 'characters', 'char_player.png')).convert('RGBA')
        fr = atl['frames'].get('idle_S_0')
        if fr:
            f, s = fr['frame'], fr['spriteSourceSize']
            player = Image.new('RGBA', (128, 128), (0, 0, 0, 0))
            player.alpha_composite(sh.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))

    def put(im, ax, ay, shadow=(46, 18)):
        d.ellipse([ax - shadow[0] // 2, ay - shadow[1] // 2, ax + shadow[0] // 2, ay + shadow[1] // 2],
                  fill=(185, 126, 106, 255))
        img.alpha_composite(im, (ax - 64, ay - 104))
    spots = [('eat_SE_1', 150, 250), ('roll_S_0', 250, 330), ('beg_S_1', 300, 230), ('run_ball_E_3', 470, 330),
             ('catch_SE_3', 560, 250), ('trick_S_7', 640, 300)]
    if player is not None:
        put(player, 380, 300)
    for n, x, y in spots:
        put(frames[n], x, y, (40, 16))
    ball_m, ball = items['item_ball']
    treat_m, treat = items['item_treat']
    img.alpha_composite(treat.resize((36, 36), Image.LANCZOS), (190, 262))
    img.alpha_composite(ball.resize((30, 30), Image.LANCZOS), (520, 170))
    # icon menu (from the pets2_icons atlas if built)
    if icons_png and os.path.exists(icons_png):
        atl = load_json(icons_png[:-4] + '.json')
        sh = Image.open(icons_png).convert('RGBA')

        def icon(name, size):
            fr = atl['frames'][name]
            f, s = fr['frame'], fr['spriteSourceSize']
            im = Image.new('RGBA', (96, 96), (0, 0, 0, 0))
            im.alpha_composite(sh.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
            return im.resize((size, size), Image.LANCZOS)
        d.rounded_rectangle([20, 14, 20 + 4 * 74 + 10, 14 + 84], 18, fill=(255, 248, 236, 255),
                            outline=(201, 182, 160, 255), width=3)
        for k, nm in enumerate(('ui_icon_whistle', 'ui_icon_treat', 'ui_icon_play', 'ui_icon_pet')):
            img.alpha_composite(icon(nm, 68), (28 + k * 74, 22))
        for k in range(5):
            img.alpha_composite(icon('ui_icon_heart_full' if k < 3 else 'ui_icon_heart_empty', 40),
                                (W - 230 + k * 42, 30))
    img.convert('RGB').save(path, optimize=True)


# --------------------------------------------------------------------------- main

def main():
    args = sys.argv[1:]
    cache, previews, colors = DEFAULT_CACHE, True, 256
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--cache':
            cache = args[i + 1]; i += 2; continue
        if a == '--colors':
            colors = int(args[i + 1]); i += 2; continue
        if a == '--no-previews':
            previews = False
        i += 1
    os.makedirs(OUT, exist_ok=True)
    meta, frames = load_dog(cache)
    items = load_items(cache)
    # 1. dog atlas
    order = [n for a in pa.ORDER for d in meta['anims'][a]['dirs'] for n in
             (f'{a}_{d}_{k}' for k in range(meta['anims'][a]['frames']))]
    sheet_img, atlas = pu.pack_atlas([(n, frames[n]) for n in order], max_width=2048, trim=True, padding=2)
    png = os.path.join(OUT, DOG_ATLAS + '.png')
    pu.save_atlas(sheet_img, atlas, png, os.path.join(OUT, DOG_ATLAS + '.json'), quantize=False)
    vp.quantize_save(sheet_img, png, colors)
    print(f'[{DOG_ATLAS}] {sheet_img.size[0]}x{sheet_img.size[1]}  {os.path.getsize(png) / 1024:.0f} KB  '
          f'({len(order)} frames)')
    # 2. items
    isheet, iatlas = pu.pack_atlas([(k, items[k][1]) for k in ITEMS], max_width=512, trim=True, padding=2)
    ipng = os.path.join(OUT, ITEM_ATLAS + '.png')
    pu.save_atlas(isheet, iatlas, ipng, os.path.join(OUT, ITEM_ATLAS + '.json'), quantize=False)
    print(f'[{ITEM_ATLAS}] {isheet.size[0]}x{isheet.size[1]}  {os.path.getsize(ipng) / 1024:.1f} KB')
    item_entries = {k: item_entry(k, items[k][0], items[k][1]) for k in ITEMS}
    # 3. portrait
    pp_ = os.path.join(cache, KEY, 'portrait.png')
    has_p = os.path.exists(pp_)
    if has_p:
        vp.quantize_save(Image.open(pp_).convert('RGBA'), os.path.join(OUT, 'portrait_pet_dog.png'), 256, 0.4)
    # 4. manifest
    entry = dog_entry(meta, frames, has_p)
    write_manifest(entry, item_entries, has_p)
    # 5. previews
    if previews:
        os.makedirs(PREV, exist_ok=True)
        sheet(meta, frames, items, os.path.join(PREV, 'pets2_sheet.png'))
        for anim in pa.NEW:
            gif(frames, anim, meta['anims'][anim], os.path.join(PREV, f'pets2_pet_dog_{anim}.gif'))
        diffs = before_after(frames, os.path.join(PREV, 'pets2_before_after.png'))
        if diffs:
            print('before/after mean |diff| per frame:', ', '.join(f'{v:.2f}' for v in diffs))
        scene(frames, items, os.path.join(OUT, 'pets2_icons.png'), os.path.join(PREV, 'pets2_scene.png'))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'assets/pets2 total {total / 1048576:.3f} MB')


if __name__ == '__main__':
    main()
