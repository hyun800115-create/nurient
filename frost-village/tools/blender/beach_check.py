"""
beach_check.py - checks assets/beach against docs/CONTRACT_V7.md section W (props + characters) and runs
tools/fx/check_beach_ground.py for the ground part.
    python3 tools/blender/beach_check.py          (exit 1 on errors)

  * every REQUIRED sprite / character exists; atlases exist, <= 2048 px, json size == png size
  * every sprite frame + anim frame is in its atlas; anchor normalised; sourceSize == frameSize
  * fields: lyingPoints / Dirs (loungers), seatPoints (chairs, swing, table, driftwood), staffPoints + customerPoints
    (stands / carts), lookDir + staffPoints + overlay (lifeguard tower), anims (flutter, sway, water, bob, bounce,
    bell, grill, fly), waterPlane (water props), tile fields (boardwalk, buoy line), stages (sandcastle_build)
  * characters: every {anim}_{dir}_{i} frame (+ over_* overlay frames for boats with seats), mirror targets rendered,
    seats per dir
  * no key collides with another assets/*/manifest.json fragment; payload <= 6 MB
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
sys.path.insert(0, os.path.join(GAME, 'tools', 'fx'))
BUDGET_MB = 6.0

PARASOLS = ['parasol_%s' % c for c in ('red', 'blue', 'yellow', 'green', 'pink', 'rainbow')]
REQUIRED = PARASOLS + [
    'sun_lounger', 'sun_lounger_x', 'beach_chair_folding', 'beach_chair_folding_x', 'swim_ring_red', 'swim_ring_duck',
    'swim_ring_donut', 'beach_ball', 'beach_ball_bounce', 'sandcastle_s', 'sandcastle_m', 'sandcastle_l',
    'sandcastle_build_0', 'sandcastle_build_1', 'sandcastle_build_2', 'sandcastle_build_3', 'bucket_spade',
    'lifeguard_tower', 'lifeguard_tower_front', 'rescue_board', 'rescue_buoy_stand', 'beach_shower', 'changing_booth',
    'boardwalk_x', 'boardwalk_y', 'boardwalk_end_xp', 'boardwalk_end_xn', 'boardwalk_end_yp', 'boardwalk_end_yn',
    'volleyball_net', 'volleyball_net_y', 'surfboard_rack', 'swim_buoy_line_x', 'swim_buoy_line_y',
    'swim_buoy_line_end', 'float_raft', 'palm_tree_a', 'palm_tree_b', 'beach_pine', 'dune_grass_a', 'dune_grass_b',
    'dune_grass_c', 'beach_swing', 'picnic_table_beach', 'icecream_cart', 'corn_stand', 'rental_stand',
    'beach_sign_arrow', 'beach_sign_board', 'beach_sign_notice', 'starfish', 'driftwood', 'kite']
ALIASES = ['boardwalk_end', 'sandcastle_build']
REQUIRED_CHARS = ['swan_pedal_boat', 'kayak', 'kayak_crew', 'banana_boat', 'banana_boat_crew', 'crab']
ANIMS = {'beach_ball_bounce': 'bounce', 'beach_shower': 'water', 'palm_tree_a': 'sway', 'palm_tree_b': 'sway',
         'swim_buoy_line_x': 'bob', 'swim_buoy_line_y': 'bob', 'swim_buoy_line_end': 'bob', 'float_raft': 'bob',
         'icecream_cart': 'bell', 'corn_stand': 'grill', 'kite': 'fly'}
ANIMS.update({p: 'flutter' for p in PARASOLS})
FIELDS = {
    'sun_lounger': ['lyingPoints', 'lyingDirs', 'lyingHeadPoints', 'lyingFeetPoints', 'seatPoints'],
    'sun_lounger_x': ['lyingPoints', 'lyingDirs', 'lyingHeadPoints', 'lyingFeetPoints', 'seatPoints'],
    'beach_chair_folding': ['seatPoints', 'seatDirs'], 'beach_chair_folding_x': ['seatPoints', 'seatDirs'],
    'lifeguard_tower': ['staffPoints', 'staffDirs', 'lookDir', 'lookPoint', 'seatPoints', 'overlay', 'ladderPoint'],
    'icecream_cart': ['staffPoints', 'customerPoints', 'fxPoints'], 'corn_stand': ['staffPoints', 'customerPoints'],
    'rental_stand': ['staffPoints', 'customerPoints'], 'beach_swing': ['seatPoints'], 'driftwood': ['seatPoints'],
    'picnic_table_beach': ['seatPoints', 'seatDirs'], 'changing_booth': ['doorPoint'],
    'beach_shower': ['standPoints'], 'sandcastle_m': ['workPoints'], 'sandcastle_l': ['workPoints'],
    'sandcastle_build_0': ['workPoints', 'stage', 'stages'], 'sandcastle_build_3': ['stage', 'stages'],
    'volleyball_net': ['playPoints'], 'volleyball_net_y': ['playPoints'], 'float_raft': ['playPoints', 'waterPlane'],
    'swim_buoy_line_x': ['waterPlane', 'tileAxis', 'stepPx'], 'swim_buoy_line_y': ['waterPlane', 'tileAxis', 'stepPx'],
    'swim_buoy_line_end': ['waterPlane'], 'boardwalk_x': ['tileAxis', 'stepPx', 'cuts'],
    'boardwalk_y': ['tileAxis', 'stepPx', 'cuts'], 'kite': ['stringPoint'], 'beach_sign_arrow': ['fxPoints'],
    'parasol_red': ['shadePoint'], 'beach_ball': ['stackStep']}


def main():
    errors, warns = [], []
    path = os.path.join(ASSETS, 'beach', 'manifest.json')
    if not os.path.exists(path):
        print('ERROR assets/beach/manifest.json missing')
        sys.exit(1)
    man = json.load(open(path, encoding='utf-8'))
    sp = man.get('sprites', {})
    ch = man.get('characters', {})
    atl = {}
    from PIL import Image
    for a in man.get('atlases', []):
        png, js = os.path.join(ASSETS, a['png']), os.path.join(ASSETS, a['json'])
        if not (os.path.exists(png) and os.path.exists(js)):
            errors.append('atlas %s: file missing' % a['key'])
            continue
        im = Image.open(png)
        j = json.load(open(js))
        if max(im.size) > 2048:
            errors.append('atlas %s is %dx%d (> 2048)' % ((a['key'],) + im.size))
        if (j['meta']['size']['w'], j['meta']['size']['h']) != im.size:
            errors.append('atlas %s: json size != png size' % a['key'])
        atl[a['key']] = j['frames']
    for k in REQUIRED + ALIASES:
        if k not in sp:
            errors.append('missing sprite %s' % k)
    for k in REQUIRED_CHARS:
        if k not in ch:
            errors.append('missing character %s' % k)
    nframes = 0
    for k, e in sp.items():
        if 'image' in e:
            continue
        fr = atl.get(e.get('atlas'), {}).get(e.get('frame'))
        if fr is None:
            errors.append('%s: frame %s not in atlas %s' % (k, e.get('frame'), e.get('atlas')))
            continue
        nframes += 1
        if [fr['sourceSize']['w'], fr['sourceSize']['h']] != e.get('frameSize'):
            errors.append('%s: sourceSize %s != frameSize %s' % (k, fr['sourceSize'], e.get('frameSize')))
        a = e.get('anchor', [None, None])
        if a[0] is None or not (0 <= a[0] <= 1 and 0 <= a[1] <= 1):
            errors.append('%s: bad anchor %s' % (k, a))
        for an, ad in (e.get('anims') or {}).items():
            for n in ad.get('frames', []):
                nframes += 1
                f2 = atl.get(e['atlas'], {}).get(n)
                if f2 is None:
                    errors.append('%s.anims.%s: frame %s missing' % (k, an, n))
                elif [f2['sourceSize']['w'], f2['sourceSize']['h']] != e['frameSize']:
                    errors.append('%s.anims.%s: frame %s has another frame size' % (k, an, n))
            if len(ad.get('frames', [])) < 2:
                errors.append('%s.anims.%s: fewer than 2 frames' % (k, an))
    for k, an in ANIMS.items():
        if k in sp and an not in (sp[k].get('anims') or {}):
            errors.append('%s: missing anims.%s' % (k, an))
    for k, fs in FIELDS.items():
        for f in fs:
            if k in sp and f not in sp[k]:
                errors.append('%s: missing field %s' % (k, f))
    if 'beach_ball' in sp:
        e = sp['beach_ball']
        if e.get('frameSize') != [72, 72] or e.get('anchor') != [0.5, 0.75]:
            errors.append('beach_ball: item frame must be 72x72 with anchor [0.5, 0.75]')
    for k in ('sun_lounger', 'sun_lounger_x'):
        if k in sp and sp[k].get('lyingDirs') not in (['NE'], ['NW']):
            warns.append('%s: lyingDirs %s' % (k, sp[k].get('lyingDirs')))
    if 'lifeguard_tower_front' in sp and sp['lifeguard_tower_front'].get('of') != 'lifeguard_tower':
        errors.append('lifeguard_tower_front: of != lifeguard_tower')
    st = [sp.get('sandcastle_build_%d' % i, {}) for i in range(4)]
    if all(st) and len({(tuple(s['frameSize']), tuple(s['anchor'])) for s in st}) != 1:
        errors.append('sandcastle_build_0..3 must share frameSize + anchor')
    for k in ('swim_buoy_line_x', 'swim_buoy_line_y', 'float_raft', 'swim_buoy_line_end'):
        if k in sp and not sp[k].get('waterPlane'):
            errors.append('%s: waterPlane must be true' % k)
    # characters
    for k, c in ch.items():
        fr = atl.get(c.get('atlas'))
        if fr is None:
            errors.append('character %s: atlas %s missing' % (k, c.get('atlas')))
            continue
        for d in c.get('mirror', {}).values():
            if d not in c['dirs']:
                errors.append('character %s: mirror target %s not rendered' % (k, d))
        for an, ad in c['anims'].items():
            for d in ad.get('dirs') or c['dirs']:
                for i in range(ad['frames']):
                    n = '%s_%s_%d' % (an, d, i)
                    nframes += 1
                    f = fr.get(n)
                    if f is None:
                        errors.append('character %s: frame %s missing' % (k, n))
                        continue
                    if [f['sourceSize']['w'], f['sourceSize']['h']] != c['frameSize']:
                        errors.append('character %s: %s sourceSize != frameSize' % (k, n))
                    if c.get('overlay') and ('over_' + n) not in fr:
                        errors.append('character %s: overlay frame over_%s missing' % (k, n))
        if c.get('kind') == 'ship':
            for f in ('wakePoint', 'bowPoint', 'lengthM', 'beamM', 'nearest'):
                if f not in c:
                    errors.append('character %s: missing %s' % (k, f))
            if not k.endswith('_crew'):
                for f in ('seats', 'seatDirs', 'seatsStand', 'seatDrawOrder', 'overlay'):
                    if f not in c:
                        errors.append('character %s: missing %s' % (k, f))
                for d in c['dirs']:
                    if len(c.get('seats', {}).get(d, [])) != len(c.get('seatNames', [])):
                        errors.append('character %s: seats[%s] count mismatch' % (k, d))
        if c.get('kind') == 'animal' and not c.get('shadow'):
            errors.append('character %s: missing shadow' % k)
    if 'banana_boat' in ch and 'towPoint' not in ch['banana_boat']:
        errors.append('banana_boat: missing towPoint')
    # collisions with other fragments
    mine = set(sp) | set(ch)
    for frag in sorted(os.listdir(ASSETS)):
        mp = os.path.join(ASSETS, frag, 'manifest.json')
        if frag == 'beach' or not os.path.exists(mp):
            continue
        try:
            om = json.load(open(mp, encoding='utf-8'))
        except Exception:
            continue
        hit = mine & (set(om.get('sprites', {})) | set(om.get('characters', {})))
        hit |= {a['key'] for a in man.get('atlases', [])} & {a['key'] for a in om.get('atlases', [])}
        if hit:
            errors.append('key collision with assets/%s: %s' % (frag, ', '.join(sorted(hit))))
    # payload
    total = os.path.getsize(path)
    for a in man.get('atlases', []):
        for f in (a['png'], a['json']):
            p = os.path.join(ASSETS, f)
            total += os.path.getsize(p) if os.path.exists(p) else 0
    for i in man.get('images', []):
        p = os.path.join(ASSETS, i['png'])
        total += os.path.getsize(p) if os.path.exists(p) else 0
    if total > BUDGET_MB * 1048576:
        errors.append('payload %.2f MB > %.1f MB' % (total / 1048576.0, BUDGET_MB))
    # unreferenced files
    listed = {os.path.basename(a['png']) for a in man.get('atlases', [])} | \
        {os.path.basename(a['json']) for a in man.get('atlases', [])} | \
        {os.path.basename(i['png']) for i in man.get('images', [])} | {'manifest.json'}
    for fn in os.listdir(os.path.join(ASSETS, 'beach')):
        if fn not in listed:
            warns.append('file not referenced by the manifest: beach/%s' % fn)
    # ground part
    import check_beach_ground as cg
    ge, gw = cg.check(man, verbose=False)
    errors += ge
    warns += gw
    for w in warns:
        print('WARNING', w)
    for e in errors:
        print('ERROR', e)
    print('beach_check: %d sprites, %d characters, %d frame names, payload %.2f MB: %d errors, %d warnings'
          % (len(sp), len(ch), nframes, total / 1048576.0, len(errors), len(warns)))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
