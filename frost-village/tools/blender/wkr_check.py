"""
wkr_check.py - verify assets/workers (CONTRACT_V4 H worker variants).

    python3 tools/blender/wkr_check.py        (exit code 1 on any error)

Checks: all ten variant keys present with profession / variantOf pointing at a base worker
of assets/characters; the SAME anim set as that base worker (frames, fps, repeat,
impactFrame), impactPoint for all 5 dirs, carryPoint [dx, dy, behind] for all 5 dirs;
every frame name exists in the variant's atlas with sourceSize == frameSize and is not
clipped at the 128x128 edge; atlas PNG size == JSON meta; portraits exist; professions{}
lists every variant; hunters reference an existing projectile sprite; payload <= 4 MB.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'workers')
sys.path.insert(0, HERE)
import wkr_build  # noqa: E402

BUDGET = 4 * 1000 * 1000
RAW_CACHE = '/tmp/fv_cache/workers'          # used (when present) to tell outline contact from clipping


def main():
    errors, warns = [], []
    with open(os.path.join(OUT, 'manifest.json'), encoding='utf-8') as f:
        man = json.load(f)
    with open(os.path.join(ASSETS, 'characters', 'manifest.json'), encoding='utf-8') as f:
        base_man = json.load(f)
    atlases = {a['key']: a for a in man.get('atlases', [])}
    images = {i['key']: i for i in man.get('images', [])}
    chars = man.get('characters', {})
    n_frames = 0
    for key in wkr_build.KEYS:
        if key not in chars:
            errors.append(f'{key}: missing from manifest.characters')
            continue
        c = chars[key]
        prof = c.get('profession')
        if prof != wkr_build.VARIANTS[key]['base'] or c.get('variantOf') != prof:
            errors.append(f'{key}: profession/variantOf {prof}/{c.get("variantOf")} wrong')
        b = base_man['characters'].get(prof)
        if not b:
            errors.append(f'{key}: base worker {prof} missing in assets/characters')
            continue
        if set(c['anims']) != set(b['anims']):
            errors.append(f'{key}: anims {sorted(c["anims"])} != base {sorted(b["anims"])}')
        for an, bi in b['anims'].items():
            ci = c['anims'].get(an)
            if not ci:
                continue
            for fld in ('frames', 'fps', 'repeat', 'impactFrame'):
                if ci.get(fld) != bi.get(fld):
                    errors.append(f'{key}.{an}.{fld}: {ci.get(fld)} != base {bi.get(fld)}')
            if 'impactFrame' in bi:
                ip = ci.get('impactPoint', {})
                for d in c['dirs']:
                    if d not in ip or len(ip[d]) != 2:
                        errors.append(f'{key}.{an}: impactPoint[{d}] missing')
        cp = c.get('carryPoint', {})
        for d in c['dirs']:
            if d not in cp or len(cp[d]) != 3:
                errors.append(f'{key}: carryPoint[{d}] missing')
        for fld in ('frameSize', 'anchor', 'dirs', 'mirror', 'frameName'):
            if c.get(fld) != b.get(fld):
                errors.append(f'{key}: {fld} {c.get(fld)} != base {b.get(fld)}')
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
        w, h = Image.open(png).size
        if (w, h) != (atlas['meta']['size']['w'], atlas['meta']['size']['h']):
            errors.append(f'{key}: png {w}x{h} != json meta')
        if w > 2048 or h > 4096:
            warns.append(f'{key}: atlas {w}x{h} is large for mobile GPUs')
        sheet_a = None
        fw, fh = c['frameSize']
        for an, info in c['anims'].items():
            if 'impactFrame' in info and not (0 <= info['impactFrame'] < info['frames']):
                errors.append(f'{key}.{an}: impactFrame out of range')
            for d in c['dirs']:
                for i in range(info['frames']):
                    name = c['frameName'].format(anim=an, dir=d, i=i)
                    fr = frames.get(name)
                    n_frames += 1
                    if fr is None:
                        errors.append(f'{key}: frame {name} missing')
                        continue
                    if (fr['sourceSize']['w'], fr['sourceSize']['h']) != (fw, fh):
                        errors.append(f'{key}: {name} sourceSize != frameSize')
                    ss = fr['spriteSourceSize']
                    if ss['x'] <= 0 or ss['y'] <= 0 or ss['x'] + ss['w'] >= fw or ss['y'] + ss['h'] >= fh:
                        # the trim box carries 1px padding: only warn when opaque pixels really sit
                        # on the 128x128 frame border
                        if sheet_a is None:
                            sheet_a = Image.open(png).convert('RGBA').getchannel('A')
                        f2 = fr['frame']
                        crop = sheet_a.crop((f2['x'], f2['y'], f2['x'] + f2['w'], f2['y'] + f2['h']))
                        edges = []
                        if ss['y'] <= 0:
                            edges.append(crop.crop((0, 0, f2['w'], 1)))
                        if ss['x'] <= 0:
                            edges.append(crop.crop((0, 0, 1, f2['h'])))
                        if ss['y'] + ss['h'] >= fh:
                            edges.append(crop.crop((0, f2['h'] - 1, f2['w'], f2['h'])))
                        if ss['x'] + ss['w'] >= fw:
                            edges.append(crop.crop((f2['w'] - 1, 0, f2['w'], f2['h'])))
                        if any(e.getextrema()[1] > 0 for e in edges):
                            raw = os.path.join(RAW_CACHE, key, name + '.png')
                            if os.path.exists(raw):
                                # the atlas frame carries the 1px ink outline: real clipping only if the
                                # raw render itself reaches the border
                                ra = Image.open(raw).getchannel('A')
                                w0, h0 = ra.size
                                border = [ra.crop((0, 0, w0, 1)), ra.crop((0, h0 - 1, w0, h0)),
                                          ra.crop((0, 0, 1, h0)), ra.crop((w0 - 1, 0, w0, h0))]
                                if any(b.getextrema()[1] > 0 for b in border):
                                    warns.append(f'{key}: {name} raw render reaches the frame edge (clipped)')
                            else:
                                warns.append(f'{key}: {name} has opaque pixels on the frame edge {ss}')
        if 'portrait' in c:
            sp = man.get('sprites', {}).get(c['portrait'])
            if not sp or sp.get('image') not in images:
                errors.append(f'{key}: portrait {c["portrait"]} missing')
        if prof == 'hunter':
            pj = c.get('projectile')
            if pj not in base_man.get('sprites', {}):
                errors.append(f'{key}: projectile sprite {pj} not in assets/characters')
        if not c.get('name', {}).get('ko'):
            warns.append(f'{key}: no Korean name')
    for k, im in images.items():
        if not os.path.exists(os.path.join(ASSETS, im['png'])):
            errors.append(f'image {k}: file missing')
    profs = man.get('professions', {})
    for key in wkr_build.KEYS:
        p = wkr_build.VARIANTS[key]['base']
        if key not in profs.get(p, []):
            errors.append(f'professions.{p} does not list {key}')
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    if total > BUDGET:
        errors.append(f'payload {total:,} bytes > 4 MB budget')
    for wmsg in warns[:20]:
        print('WARN ', wmsg)
    if len(warns) > 20:
        print(f'WARN  ... {len(warns) - 20} more')
    for e in errors:
        print('ERROR', e)
    print(f'checked {len(chars)} worker variants, {n_frames} frame names, payload {total:,} bytes '
          f'({total / 1e6:.2f} MB): {len(errors)} errors, {len(warns)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
