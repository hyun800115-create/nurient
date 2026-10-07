"""
vil3_check.py - verify assets/villagers3 (station operators, 기획서_v3_분업) against the
CONTRACT_VILLAGERS A / CONTRACT_V3 D rules it inherits plus the operate spec.

    python3 tools/blender/vil3_check.py        (exit code 1 on any error)

Checks
  * keys: new npc_sawyer, npc_smoker, npc_cannery (must NOT exist in villagers / villagers2);
    overrides npc_chef (villagers2), npc_aunt, npc_blacksmith (villagers) - must exist there,
    keep the same character key, atlas key and portrait key, and list EVERY anim the old entry
    had with identical frames/fps/repeat/dirs (+ impactFrame/impactPoint), plus 'operate';
    their atlas holds a superset of the old atlas' frame names; name/role/traits/headTop/
    shadow/seat data unchanged.
  * new keys: the 12 core human anims (table written out independently) + operate.
  * operate: 8 frames, 10 fps, loop, all 5 dirs, impactFrame in range, impactPoint for all
    5 dirs, beats (>= 1, beats[0] == impactFrame/impactPoint), station, workTool, workSpot.
  * every frame name exists; sourceSize == frameSize; png size == json meta; <= 2048 px;
    palettised; frames inside the sheet; no trimmed frame touching the 128 px edge (warning).
  * carryStyle 'front' + carryPoint (behind = NE/N) + carryPointFrames; portraits 128x128.
  * payload <= 3,500,000 bytes.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(GAME, 'assets')
VIL3 = os.path.join(ASSETS, 'villagers3')
BUDGET_BYTES = 3_500_000

L5, S3 = ['S', 'SE', 'E', 'NE', 'N'], ['S', 'SE', 'E']
CORE = {'idle': (4, 6, -1, L5), 'walk': (8, 12, -1, L5), 'carry_walk': (8, 12, -1, L5),
        'happy': (6, 10, -1, S3), 'talk': (8, 10, -1, S3), 'laugh': (6, 10, -1, S3), 'wave': (6, 10, -1, S3),
        'surprised': (6, 12, 0, S3), 'angry': (6, 10, -1, S3), 'sad': (4, 6, -1, S3), 'hit': (6, 12, 0, S3),
        'shiver': (4, 12, -1, S3)}
OPERATE = (8, 10, -1, L5)
NEW = ['npc_sawyer', 'npc_smoker', 'npc_cannery']
OVERRIDE = {'npc_chef': 'villagers2', 'npc_aunt': 'villagers', 'npc_blacksmith': 'villagers'}
STATION = {'npc_chef': 'station_grill', 'npc_aunt': 'station_bakery', 'npc_blacksmith': 'station_smelter',
           'npc_sawyer': 'station_sawmill', 'npc_smoker': 'station_smokehouse', 'npc_cannery': 'station_cannery'}
KEEP = ('name', 'role', 'traits', 'headTop', 'shadow', 'portrait', 'seatOffset', 'seatHeightPx', 'headTopSit')


def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main():
    errors, warns = [], []
    man = load(os.path.join(VIL3, 'manifest.json'))
    old = {f: load(os.path.join(ASSETS, f, 'manifest.json')) for f in ('villagers', 'villagers2')
           if os.path.exists(os.path.join(ASSETS, f, 'manifest.json'))}
    atlases = {a['key']: a for a in man.get('atlases', [])}
    images = {i['key']: i for i in man.get('images', [])}
    chars = man.get('characters', {})
    for k in chars:
        if k not in NEW and k not in OVERRIDE:
            warns.append(f'{k}: unexpected key')
    for k in NEW:
        for f, m in old.items():
            if k in m.get('characters', {}):
                errors.append(f'{k}: new key collides with assets/{f}')
            if f'vil_{k}' in {a['key'] for a in m.get('atlases', [])}:
                errors.append(f'vil_{k}: atlas key collides with assets/{f}')
    n_frames = 0
    for key in NEW + list(OVERRIDE):
        if key not in chars:
            errors.append(f'{key}: missing from manifest.characters')
            continue
        c = chars[key]
        for f in ('name', 'role', 'traits', 'kind', 'headTop', 'shadow', 'portrait', 'carryStyle', 'carryPoint',
                  'carryPointFrames', 'atlas', 'anims'):
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
        if c.get('operates') != [STATION[key]]:
            errors.append(f'{key}: operates {c.get("operates")} != [{STATION[key]}]')
        # ---- expected anims
        if key in OVERRIDE:
            src = old.get(OVERRIDE[key], {})
            prev = src.get('characters', {}).get(key)
            if not prev:
                errors.append(f'{key}: not found in assets/{OVERRIDE[key]} (cannot override)')
                continue
            if c['atlas'] != prev['atlas']:
                errors.append(f'{key}: atlas key {c["atlas"]} != old {prev["atlas"]} (override must replace it)')
            if c.get('overrides') != OVERRIDE[key]:
                errors.append(f'{key}: overrides field {c.get("overrides")} != {OVERRIDE[key]}')
            for f in KEEP:
                if f in prev and prev[f] != c.get(f):
                    errors.append(f'{key}: {f} {c.get(f)} differs from the old entry {prev[f]}')
            exp = {}
            for a, v in prev['anims'].items():
                exp[a] = (v['frames'], v['fps'], v['repeat'], v['dirs'])
                cv = c['anims'].get(a, {})
                for f in ('impactFrame', 'impactPoint'):
                    if f in v and cv.get(f) != v[f]:
                        warns.append(f'{key}.{a}: {f} {cv.get(f)} != old {v[f]}')
            for d, v in prev.get('carryPoint', {}).items():
                nv = c.get('carryPoint', {}).get(d)
                if nv and (abs(nv[0] - v[0]) > 1 or abs(nv[1] - v[1]) > 1 or bool(nv[2]) != bool(v[2])):
                    errors.append(f'{key}: carryPoint[{d}] {nv} differs from the old {v}')
            # old atlas frames must all still exist
            oa = {a['key']: a for a in src.get('atlases', [])}.get(prev['atlas'])
            if oa:
                ofr = set(load(os.path.join(ASSETS, oa['json']))['frames'])
                a = atlases.get(c['atlas'])
                if a:
                    nfr = set(load(os.path.join(ASSETS, a['json']))['frames'])
                    miss = ofr - nfr
                    if miss:
                        errors.append(f'{key}: {len(miss)} frames of the old atlas are missing, e.g. {sorted(miss)[:3]}')
            pi = {i['key']: i for i in src.get('images', [])}
            if c.get('portrait') and c['portrait'] not in pi:
                warns.append(f'{key}: portrait key {c["portrait"]} not in the old fragment')
        else:
            exp = dict(CORE)
        exp['operate'] = OPERATE
        for a, (fr, fps, rep, dirs) in exp.items():
            info = c['anims'].get(a)
            if not info:
                errors.append(f'{key}: anim {a} missing')
                continue
            if (info['frames'], info['fps'], info['repeat'], info['dirs']) != (fr, fps, rep, dirs):
                errors.append(f'{key}.{a}: {info["frames"]}f/{info["fps"]}fps/rep{info["repeat"]}/{info["dirs"]} '
                              f'!= expected {fr}/{fps}/{rep}/{dirs}')
        for a in c['anims']:
            if a not in exp:
                errors.append(f'{key}: unexpected anim {a}')
        op = c['anims'].get('operate', {})
        imf = op.get('impactFrame')
        if imf is None or not (0 <= imf < op.get('frames', 0)):
            errors.append(f'{key}.operate: impactFrame missing/out of range')
        ip = op.get('impactPoint', {})
        for d in L5:
            v = ip.get(d)
            if not (isinstance(v, list) and len(v) == 2 and all(isinstance(x, int) for x in v)):
                errors.append(f'{key}.operate: impactPoint[{d}] missing/not [int, int]')
            elif not (-64 <= v[0] <= 64 and -104 <= v[1] <= 24):
                errors.append(f'{key}.operate: impactPoint[{d}] {v} outside the frame')
        beats = op.get('beats', [])
        if not beats or beats[0].get('frame') != imf or beats[0].get('point') != ip:
            errors.append(f'{key}.operate: beats[0] must repeat impactFrame/impactPoint')
        for b in beats:
            if not (0 <= b.get('frame', -1) < 8) or not b.get('kind') or set(b.get('point', {})) != set(L5):
                errors.append(f'{key}.operate: bad beat {b}')
        if op.get('station') != STATION[key]:
            errors.append(f'{key}.operate: station {op.get("station")} != {STATION[key]}')
        if not isinstance(op.get('workTool'), str) or len(op.get('workTool', '')) < 20:
            errors.append(f'{key}.operate: workTool note missing')
        ws = op.get('workSpot', {})
        if not (0.1 < ws.get('forwardM', 0) < 1.0 and 0.3 < ws.get('heightM', 0) < 1.2):
            errors.append(f'{key}.operate: workSpot {ws} implausible')
        # ---- atlas
        a = atlases.get(c['atlas'])
        if not a:
            errors.append(f'{key}: atlas {c["atlas"]} not in atlases[]')
            continue
        if not a['png'].startswith('villagers3/'):
            errors.append(f'{key}: atlas png {a["png"]} not in villagers3/')
        png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            errors.append(f'{key}: atlas files missing')
            continue
        atlas = load(js)
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
        names = set()
        for anim, info in c['anims'].items():
            for d in info['dirs']:
                if d not in c['dirs']:
                    errors.append(f'{key}.{anim}: dir {d} not in dirs')
                for i in range(info['frames']):
                    name = c['frameName'].format(anim=anim, dir=d, i=i)
                    names.add(name)
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
        extra = set(frames) - names
        if extra:
            warns.append(f'{key}: {len(extra)} atlas frames not referenced by the manifest')
        # ---- carry
        if c.get('carryStyle') != 'front':
            errors.append(f'{key}: carryStyle {c.get("carryStyle")} != front')
        cp, cpf = c.get('carryPoint', {}), c.get('carryPointFrames', {})
        for d in c['dirs']:
            if d not in cp or len(cp[d]) != 3:
                errors.append(f'{key}: carryPoint[{d}] missing')
                continue
            if bool(cp[d][2]) != (d in ('NE', 'N')):
                errors.append(f'{key}: carryPoint[{d}] behind={cp[d][2]}')
            fl = cpf.get(d, [])
            if len(fl) != c['anims']['carry_walk']['frames'] or list(fl[0]) != list(cp[d][:2]):
                errors.append(f'{key}: carryPointFrames[{d}] inconsistent')
        if 'sit' in c['anims']:
            for f in ('seatOffset', 'seatHeightPx', 'headTopSit'):
                if f not in c:
                    errors.append(f'{key}: sit without {f}')
        sp = man.get('sprites', {}).get(c.get('portrait'))
        if not sp or sp.get('image') not in images:
            errors.append(f'{key}: portrait sprite missing')
        else:
            ipath = os.path.join(ASSETS, images[sp['image']]['png'])
            if not os.path.exists(ipath) or Image.open(ipath).size != (128, 128):
                errors.append(f'{key}: portrait image missing or not 128x128')
    total = sum(os.path.getsize(os.path.join(VIL3, f)) for f in os.listdir(VIL3))
    if total > BUDGET_BYTES:
        errors.append(f'payload {total:,} bytes > {BUDGET_BYTES:,} byte budget')
    for wmsg in warns[:25]:
        print('WARN ', wmsg)
    if len(warns) > 25:
        print(f'WARN  ... {len(warns) - 25} more')
    for e in errors[:80]:
        print('ERROR', e)
    print(f'checked {len(chars)} keys, {n_frames} frame names, payload {total:,} bytes '
          f'({total / 1e6:.2f} MB / {total / 1048576:.2f} MiB): {len(errors)} errors, {len(warns)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
