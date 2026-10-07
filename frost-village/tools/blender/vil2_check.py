"""
vil2_check.py - verify assets/villagers2 against CONTRACT_V3 section D
(+ the CONTRACT_VILLAGERS A rules it inherits).

    python3 tools/blender/vil2_check.py        (exit code 1 on any error)

Checks: all 12 batch-2 keys present (and none collides with assets/villagers);
every anim the contract requires for that key (12 core + the extras of the D
table) with the right frames/fps/repeat/dirs (table written out independently
of vil2_anim); every frame name ({anim}_{dir}_{i}) exists in its atlas JSON;
sourceSize == frameSize; atlas PNG size == JSON meta and <= 2048 px; palettised
PNGs; frames inside the sheet; no trimmed frame touching the 128x128 edge
(clipping warning); serve impactFrame/impactPoint; carryStyle + carryPoint for
all 5 dirs (porters: 'back' with behind = S/SE/E, others 'front' with behind =
NE/N) + carryPointFrames; sitters' seatOffset/seatHeightPx/headTopSit;
headTop/shadow/name/role/traits; portraits resolve (128x128); payload <= 6,000,000 bytes.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(GAME, 'assets')
VIL2 = os.path.join(ASSETS, 'villagers2')
BUDGET_BYTES = 6_000_000          # '6 MB' read strictly (decimal); 6 MiB would be 6,291,456

L5, S3 = ['S', 'SE', 'E', 'NE', 'N'], ['S', 'SE', 'E']
# (frames, fps, repeat, dirs) - CONTRACT_VILLAGERS A table + CONTRACT_V3 D extras
TABLE = {
    'idle': (4, 6, -1, L5), 'walk': (8, 12, -1, L5), 'run': (8, 16, -1, L5), 'carry_walk': (8, 12, -1, L5),
    'happy': (6, 10, -1, S3), 'talk': (8, 10, -1, S3), 'laugh': (6, 10, -1, S3), 'wave': (6, 10, -1, S3),
    'surprised': (6, 12, 0, S3), 'angry': (6, 10, -1, S3), 'sad': (4, 6, -1, S3), 'hit': (6, 12, 0, S3),
    'shiver': (4, 12, -1, S3), 'dance': (8, 10, -1, S3), 'sit': (4, 4, -1, S3),
    'skate': (8, 10, -1, L5), 'serve': (6, 10, 0, S3), 'bow': (6, 10, 0, S3), 'salute': (6, 10, 0, S3),
    'fall': (6, 12, 0, S3),
}
CORE = ['idle', 'walk', 'carry_walk', 'happy', 'talk', 'laugh', 'wave', 'surprised', 'angry', 'sad', 'hit',
        'shiver']
EXTRA = {
    'npc_clerk_a': ['serve', 'bow'], 'npc_clerk_b': ['serve', 'bow'], 'npc_porter_a': ['run'],
    'npc_porter_b': ['run'], 'npc_captain': ['wave', 'sit'], 'npc_chef': ['serve', 'dance'],
    'npc_postman': ['run'], 'npc_doctor': ['sit'], 'npc_painter': ['dance'], 'npc_guard': ['salute'],
    'npc_skater': ['skate', 'run', 'dance'], 'npc_toddler': ['run', 'fall'],
}
PORTERS = ['npc_porter_a', 'npc_porter_b']


def expected(key):
    names = list(dict.fromkeys(CORE + EXTRA[key]))
    return {a: TABLE[a] for a in names}


def main():
    errors, warns = [], []
    with open(os.path.join(VIL2, 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    old = {}
    p1 = os.path.join(ASSETS, 'villagers', 'manifest.json')
    if os.path.exists(p1):
        with open(p1, encoding='utf-8') as f:
            old = json.load(f)
    atlases = {a['key']: a for a in man.get('atlases', [])}
    images = {i['key']: i for i in man.get('images', [])}
    chars = man.get('characters', {})
    for k in chars:
        if k in old.get('characters', {}):
            errors.append(f'{k}: key collides with assets/villagers')
    for a in atlases:
        if a in {x['key'] for x in old.get('atlases', [])}:
            errors.append(f'atlas key {a} collides with assets/villagers')
    n_frames = 0
    for key in EXTRA:
        if key not in chars:
            errors.append(f'{key}: missing from manifest.characters')
            continue
        c = chars[key]
        for f in ('name', 'role', 'traits', 'kind', 'headTop', 'shadow', 'portrait', 'carryStyle', 'carryPoint',
                  'carryPointFrames'):
            if f not in c:
                errors.append(f'{key}: field {f} missing')
        if c.get('kind') != 'villager':
            errors.append(f'{key}: kind {c.get("kind")} != villager')
        if not (isinstance(c.get('name'), dict) and c['name'].get('ko') and c['name'].get('en')):
            errors.append(f'{key}: name needs ko + en')
        if c.get('role') not in ('kid', 'teen', 'adult', 'elder'):
            errors.append(f'{key}: role {c.get("role")} not in kid|teen|adult|elder')
        if not (-110 < c.get('headTop', 0) < -30):
            errors.append(f'{key}: headTop {c.get("headTop")} out of range')
        exp = expected(key)
        for a, (fr, fps, rep, dirs) in exp.items():
            info = c['anims'].get(a)
            if not info:
                errors.append(f'{key}: anim {a} missing')
                continue
            if (info['frames'], info['fps'], info['repeat'], info['dirs']) != (fr, fps, rep, dirs):
                errors.append(f'{key}.{a}: {info["frames"]}f/{info["fps"]}fps/rep{info["repeat"]}/{info["dirs"]} '
                              f'!= contract {fr}/{fps}/{rep}/{dirs}')
        for a in c['anims']:
            if a not in exp:
                warns.append(f'{key}: extra anim {a} (not in the contract table)')
        a = atlases.get(c['atlas'])
        if not a:
            errors.append(f'{key}: atlas {c["atlas"]} not in atlases[]')
            continue
        png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            errors.append(f'{key}: atlas files missing')
            continue
        with open(js) as f:
            atlas = json.load(f)
        frames = atlas['frames']
        im = Image.open(png)
        w, h = im.size
        if im.mode != 'P':
            warns.append(f'{key}: atlas is {im.mode}, not palette-quantized')
        if (w, h) != (atlas['meta']['size']['w'], atlas['meta']['size']['h']):
            errors.append(f'{key}: png size != json meta size')
        if atlas['meta'].get('image') != os.path.basename(png):
            errors.append(f'{key}: json meta.image mismatch')
        if w > 2048 or h > 2048:
            errors.append(f'{key}: atlas {w}x{h} exceeds 2048')
        fw, fh = c['frameSize']
        if c['frameSize'] != [128, 128] or c['anchor'] != [0.5, 0.8125]:
            errors.append(f'{key}: frameSize/anchor != 128x128 / [0.5, 0.8125]')
        for d in c['mirror'].values():
            if d not in c['dirs']:
                errors.append(f'{key}: mirror target {d} not rendered')
        for anim, info in c['anims'].items():
            for d in info['dirs']:
                if d not in c['dirs']:
                    errors.append(f'{key}.{anim}: dir {d} not in dirs')
                for i in range(info['frames']):
                    name = c['frameName'].format(anim=anim, dir=d, i=i)
                    n_frames += 1
                    fr = frames.get(name)
                    if fr is None:
                        errors.append(f'{key}: frame {name} missing in atlas')
                        continue
                    if (fr['sourceSize']['w'], fr['sourceSize']['h']) != (fw, fh):
                        errors.append(f'{key}: {name} sourceSize != frameSize')
                    ss, f2 = fr['spriteSourceSize'], fr['frame']
                    if f2['x'] + f2['w'] > w or f2['y'] + f2['h'] > h:
                        errors.append(f'{key}: {name} outside the sheet')
                    if ss['x'] <= 0 or ss['y'] <= 0 or ss['x'] + ss['w'] >= fw or ss['y'] + ss['h'] >= fh:
                        warns.append(f'{key}: {name} touches the frame edge (possible clipping) {ss}')
            if anim == 'serve':
                if info.get('impactFrame') is None or not (0 <= info['impactFrame'] < info['frames']):
                    errors.append(f'{key}.serve: impactFrame missing/out of range')
                ip = info.get('impactPoint', {})
                for d in info['dirs']:
                    if d not in ip or len(ip[d]) != 2:
                        errors.append(f'{key}.serve: impactPoint[{d}] missing')
        back = key in PORTERS
        if c.get('carryStyle') != ('back' if back else 'front'):
            errors.append(f'{key}: carryStyle {c.get("carryStyle")} != {"back" if back else "front"}')
        cp = c.get('carryPoint', {})
        cpf = c.get('carryPointFrames', {})
        for d in c['dirs']:
            if d not in cp or len(cp[d]) != 3:
                errors.append(f'{key}: carryPoint[{d}] missing')
                continue
            want_behind = (d in ('S', 'SE', 'E')) if back else (d in ('NE', 'N'))
            if bool(cp[d][2]) != want_behind:
                errors.append(f'{key}: carryPoint[{d}] behind={cp[d][2]} (expected {want_behind})')
            fl = cpf.get(d, [])
            if len(fl) != c['anims']['carry_walk']['frames'] or any(len(p) != 2 for p in fl):
                errors.append(f'{key}: carryPointFrames[{d}] must list one [dx,dy] per carry_walk frame')
            elif list(fl[0]) != list(cp[d][:2]):
                errors.append(f'{key}: carryPointFrames[{d}][0] != carryPoint[{d}]')
        if 'sit' in c['anims']:
            for f in ('seatOffset', 'seatHeightPx', 'headTopSit'):
                if f not in c:
                    errors.append(f'{key}: sit without {f}')
        sp = man.get('sprites', {}).get(c.get('portrait'))
        if not sp or sp.get('image') not in images:
            errors.append(f'{key}: portrait sprite missing')
        else:
            ip = os.path.join(ASSETS, images[sp['image']]['png'])
            if not os.path.exists(ip) or Image.open(ip).size != (128, 128):
                errors.append(f'{key}: portrait image missing or not 128x128')
    for k in chars:
        if k not in EXTRA:
            warns.append(f'{k}: not a CONTRACT_V3 D key')
    total = sum(os.path.getsize(os.path.join(VIL2, f)) for f in os.listdir(VIL2))
    if total > BUDGET_BYTES:
        errors.append(f'payload {total:,} bytes > {BUDGET_BYTES:,} byte budget')
    for wmsg in warns[:25]:
        print('WARN ', wmsg)
    if len(warns) > 25:
        print(f'WARN  ... {len(warns) - 25} more')
    for e in errors[:80]:
        print('ERROR', e)
    print(f'checked {len(chars)} keys, {n_frames} frame names, payload {total:,} bytes '
          f'({total / 1e6:.2f} MB / {total / 1048576:.2f} MiB): '
          f'{len(errors)} errors, {len(warns)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
