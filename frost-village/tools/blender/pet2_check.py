"""
pet2_check.py - validate assets/pets2 against CONTRACT_V4 section I (plain python3 + Pillow + numpy).

    python3 tools/blender/pet2_check.py            # exit code 0 = no errors

Checks
  * manifest parses; every atlas / image file exists; atlas JSON frames have sourceSize = frame size;
    sheets <= 2048 px (warning) / 4096 (error)
  * characters.pet_dog: atlas, frameSize 128x128, anchor [0.5, 0.8125], dirs + mirror, frameName
  * every contract anim with the right frames / repeat / dirs (table below, written independently of
    pet2_anim), catch impactFrame + impactPoint (S/SE/E), mouthPoint (5 dirs), treatPoint / bellyPoint
    (S/SE/E), headTop, shadow, portrait
  * the batch-1 anims (idle, walk, run, sit, happy) keep exactly the frames / fps / repeat / dirs of
    assets/villagers pet_dog (the override must not break existing game code)
  * every frame name exists; no frame touches the 128x128 frame edge
  * look: batch-1 frames vs the new render (mean |RGBA diff| <= 6 -> same look) - warning only
  * items item_treat / item_ball: 72x72, anchor [0.5, 0.75], kind item, stackStep, carryScale, icon
  * icons ui_icon_whistle / treat / play / pet / heart_full / heart_empty: atlas pets2_icons, 96x96
  * payload of assets/pets2 <= 1.5 MB
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'pets2')
BUDGET_MB = 1.5

L5 = ['S', 'SE', 'E', 'NE', 'N']
L3 = ['S', 'SE', 'E']
# anim: (frames, repeat, dirs)          CONTRACT_V4 I + CONTRACT_VILLAGERS A (batch-1 pet anims)
TABLE = {
    'idle': (4, -1, L5), 'walk': (8, -1, L5), 'run': (8, -1, L5), 'sit': (4, -1, L3), 'happy': (6, -1, L3),
    'eat': (6, None, L3), 'roll': (6, -1, L3), 'beg': (6, -1, L3), 'run_ball': (8, None, L5),
    'catch': (6, 0, L3), 'trick': (8, 0, L3),
}
ITEMS = ['item_treat', 'item_ball']
ICONS = ['ui_icon_whistle', 'ui_icon_treat', 'ui_icon_play', 'ui_icon_pet', 'ui_icon_heart_full',
         'ui_icon_heart_empty']

errors, warnings = [], []


def err(m):
    errors.append(m)


def warn(m):
    warnings.append(m)


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def frame_img(sheet, fr):
    f, s = fr['frame'], fr['spriteSourceSize']
    im = Image.new('RGBA', (fr['sourceSize']['w'], fr['sourceSize']['h']), (0, 0, 0, 0))
    im.alpha_composite(sheet.crop((f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])), (s['x'], s['y']))
    return im


def main():
    mp = os.path.join(OUT, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: no assets/pets2/manifest.json')
        return 1
    man = load(mp)
    atlases = {}
    for a in man.get('atlases', []):
        png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            err(f'atlas {a["key"]}: missing file {a["png"]} / {a["json"]}')
            continue
        data = load(js)
        sheet = Image.open(png)
        if max(sheet.size) > 4096:
            err(f'atlas {a["key"]}: sheet {sheet.size} > 4096')
        elif max(sheet.size) > 2048:
            warn(f'atlas {a["key"]}: sheet {sheet.size} > 2048')
        for n, fr in data['frames'].items():
            f = fr['frame']
            if f['x'] + f['w'] > sheet.size[0] or f['y'] + f['h'] > sheet.size[1]:
                err(f'atlas {a["key"]}: frame {n} outside the sheet')
        atlases[a['key']] = (data, sheet)
    for im in man.get('images', []):
        if not os.path.exists(os.path.join(ASSETS, im['png'])):
            err(f'image {im["key"]}: missing {im["png"]}')
    image_keys = {i['key'] for i in man.get('images', [])}
    sprites = man.get('sprites', {})
    for k, s in sprites.items():
        if 'atlas' in s:
            if s['atlas'] not in atlases:
                err(f'sprite {k}: unknown atlas {s["atlas"]}')
            elif s['frame'] not in atlases[s['atlas']][0]['frames']:
                err(f'sprite {k}: frame {s["frame"]} not in {s["atlas"]}')
        elif s.get('image') not in image_keys:
            err(f'sprite {k}: unknown image {s.get("image")}')

    # ---------------------------------------------------------------- dog
    dog = man.get('characters', {}).get('pet_dog')
    n_frames = 0
    if not dog:
        err('characters.pet_dog missing')
    else:
        if dog.get('atlas') not in atlases:
            err(f'pet_dog: atlas {dog.get("atlas")} not listed')
        frames = atlases.get(dog.get('atlas'), ({'frames': {}}, None))[0]['frames']
        if dog.get('frameSize') != [128, 128]:
            err(f'pet_dog: frameSize {dog.get("frameSize")}')
        if dog.get('anchor') != [0.5, 0.8125]:
            err(f'pet_dog: anchor {dog.get("anchor")}')
        if dog.get('dirs') != L5 or dog.get('mirror') != {'SW': 'SE', 'W': 'E', 'NW': 'NE'}:
            err('pet_dog: dirs / mirror')
        if dog.get('frameName') != '{anim}_{dir}_{i}':
            err('pet_dog: frameName')
        for f in ('headTop', 'shadow', 'kind', 'name', 'role'):
            if f not in dog:
                err(f'pet_dog: missing {f}')
        if dog.get('portrait') and dog['portrait'] not in sprites:
            warn(f'pet_dog: portrait sprite {dog["portrait"]} not in this fragment (villagers has it)')
        anims = dog.get('anims', {})
        for a, (n, rep, dirs) in TABLE.items():
            e = anims.get(a)
            if not e:
                err(f'pet_dog: anim {a} missing')
                continue
            if e.get('frames') != n:
                err(f'pet_dog.{a}: frames {e.get("frames")} != {n}')
            if rep is not None and e.get('repeat') != rep:
                err(f'pet_dog.{a}: repeat {e.get("repeat")} != {rep}')
            if e.get('dirs') != dirs:
                err(f'pet_dog.{a}: dirs {e.get("dirs")} != {dirs}')
            if not e.get('fps'):
                err(f'pet_dog.{a}: no fps')
            for d in e.get('dirs', []):
                for i in range(e.get('frames', 0)):
                    nm = f'{a}_{d}_{i}'
                    fr = frames.get(nm)
                    n_frames += 1
                    if fr is None:
                        err(f'pet_dog: frame {nm} missing')
                        continue
                    if fr['sourceSize'] != {'w': 128, 'h': 128}:
                        err(f'pet_dog: {nm} sourceSize {fr["sourceSize"]}')
                    s = fr['spriteSourceSize']
                    if s['x'] <= 0 or s['y'] <= 0 or s['x'] + s['w'] >= 128 or s['y'] + s['h'] >= 128:
                        err(f'pet_dog: {nm} touches the frame edge {s}')
        c = anims.get('catch', {})
        if not isinstance(c.get('impactFrame'), int) or not 0 <= c['impactFrame'] < c.get('frames', 0):
            err('pet_dog.catch: impactFrame')
        ip = c.get('impactPoint', {})
        if sorted(ip) != sorted(L3) or not all(len(v) == 2 for v in ip.values()):
            err(f'pet_dog.catch: impactPoint {ip}')
        for fld, dirs in (('mouthPoint', L5), ('treatPoint', L3), ('bellyPoint', L3)):
            v = dog.get(fld, {})
            if sorted(v) != sorted(dirs) or not all(len(p) == 2 and abs(p[0]) < 64 and -104 < p[1] < 24
                                                    for p in v.values()):
                err(f'pet_dog: {fld} {v}')
        # batch-1 compatibility + look
        vm = os.path.join(ASSETS, 'villagers', 'manifest.json')
        if os.path.exists(vm):
            vman = load(vm)
            old = vman.get('characters', {}).get('pet_dog')
            if old:
                for a, oe in old['anims'].items():
                    ne = anims.get(a, {})
                    for f in ('frames', 'fps', 'repeat', 'dirs'):
                        if oe.get(f) != ne.get(f):
                            err(f'pet_dog.{a}.{f}: {ne.get(f)} differs from batch 1 ({oe.get(f)})')
                oa = load(os.path.join(ASSETS, 'villagers', old['atlas'] + '.json'))
                osh = Image.open(os.path.join(ASSETS, 'villagers', old['atlas'] + '.png')).convert('RGBA')
                nsh = atlases[dog['atlas']][1].convert('RGBA')
                worst = (0.0, '')
                for a in old['anims']:
                    for d in old['anims'][a]['dirs']:
                        nm = f'{a}_{d}_0'
                        if nm in oa['frames'] and nm in frames:
                            diff = float(np.abs(np.asarray(frame_img(osh, oa['frames'][nm]), np.float32) -
                                                np.asarray(frame_img(nsh, frames[nm]), np.float32)).mean())
                            worst = max(worst, (diff, nm))
                if worst[0] > 6.0:
                    warn(f'pet_dog: batch-1 frame {worst[1]} differs from the re-render by {worst[0]:.2f}')
                print(f'look vs batch 1: worst mean |diff| {worst[0]:.2f} ({worst[1]})')

    # ---------------------------------------------------------------- items + icons
    for k in ITEMS:
        s = sprites.get(k)
        if not s:
            err(f'item {k} missing')
            continue
        if s.get('kind') != 'item' or s.get('anchor') != [0.5, 0.75] or s.get('frameSize') != [72, 72]:
            err(f'item {k}: kind/anchor/frameSize {s.get("kind")} {s.get("anchor")} {s.get("frameSize")}')
        if not isinstance(s.get('stackStep'), int) or not 6 <= s['stackStep'] <= 16:
            err(f'item {k}: stackStep {s.get("stackStep")}')
        if not 0.4 <= s.get('carryScale', 0) <= 1.0:
            err(f'item {k}: carryScale {s.get("carryScale")}')
        fr = atlases.get(s.get('atlas'), ({'frames': {}}, None))[0]['frames'].get(k)
        if fr and fr['sourceSize'] != {'w': 72, 'h': 72}:
            err(f'item {k}: sourceSize {fr["sourceSize"]}')
    for k in ICONS:
        s = sprites.get(k)
        if not s:
            err(f'icon {k} missing')
            continue
        if s.get('atlas') != 'pets2_icons' or s.get('frameSize') != [96, 96] or s.get('anchor') != [0.5, 0.5]:
            err(f'icon {k}: atlas/frameSize/anchor')
        fr = atlases.get('pets2_icons', ({'frames': {}}, None))[0]['frames'].get(k)
        if fr and fr['sourceSize'] != {'w': 96, 'h': 96}:
            err(f'icon {k}: sourceSize {fr["sourceSize"]}')

    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)) / 1048576.0
    if total > BUDGET_MB:
        err(f'payload {total:.2f} MB > {BUDGET_MB} MB')
    for w in warnings:
        print('WARNING:', w)
    for e in errors:
        print('ERROR:', e)
    print(f'pet2_check: pet_dog {len(dog.get("anims", {})) if dog else 0} anims / {n_frames} frame names, '
          f'{len(ITEMS)} items, {len(ICONS)} icons, payload {total:.3f} MB: '
          f'{len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
