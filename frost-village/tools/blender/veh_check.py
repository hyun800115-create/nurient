"""
veh_check.py - verify assets/vehicles/ against docs/CONTRACT_V5.md sections L + M (exit 1 on any error).

    python3 tools/blender/veh_check.py [--dir assets/vehicles]

Checks: required keys (vehicles + vehicle buildings), atlas files exist and sheets <= 2048 px, every frame name the
manifest implies exists in its atlas with sourceSize == frameSize, anchors normalised, dirs SE/NE + mirror map,
idle + move anims with the contract frame counts (idle 2-4, move 4-8), required vehicle fields (lengthM, widthM,
seats, era, lightPoints / doorPoints / exhaust- or steamPoint, cargoPoint where the contract needs one), seat data
consistent per dir, overlay frames for vehicles with seats, the chief baked into truck_cargo_chief, buildings with
stall / bay / stop points where needed, traffic light states, no key collisions with the other manifests, scale
sanity (car ~3.6 m, bus ~7 m), payload <= 7 MB.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 7.0
MAX_SHEET = 2048

CAR_VARIANTS = {'car_a': ['red', 'blue', 'yellow'], 'car_b': ['red', 'blue', 'mint'],
                'car_c': ['red', 'blue', 'orange'], 'car_d': ['red', 'blue', 'cream']}
VEHICLES_ERA2 = ['horse_sleigh_bus', 'steam_wagon', 'dog_sled', 'cargo_sleigh']
VEHICLES_ERA3 = (['retro_bus', 'truck_cargo', 'truck_cargo_chief', 'police_car', 'fire_truck', 'ambulance'] +
                 ['%s_%s' % (f, c) for f, cs in CAR_VARIANTS.items() for c in cs])
BUILDINGS = ['stable_depot', 'sleigh_stop', 'bus_depot', 'bus_stop', 'parking_lot_s', 'parking_lot_m', 'garage_small',
             'fuel_depot', 'traffic_light', 'road_sign_round', 'road_sign_tri', 'road_sign_rect', 'road_sign_arrow',
             'road_sign_info']
EXTRA_SPRITES = ['bus_stop_y', 'sleigh_stop_y', 'bus_depot_open', 'garage_small_open', 'traffic_light_b',
                 'traffic_light_green', 'traffic_light_yellow', 'traffic_light_red', 'traffic_light_b_green',
                 'traffic_light_b_yellow', 'traffic_light_b_red']
REQUIRED = VEHICLES_ERA2 + VEHICLES_ERA3 + BUILDINGS + EXTRA_SPRITES
NEEDS_CARGO = ['steam_wagon', 'cargo_sleigh', 'truck_cargo', 'truck_cargo_chief', 'retro_bus', 'horse_sleigh_bus',
               'dog_sled'] + ['car_c_%s' % c for c in CAR_VARIANTS['car_c']]
EMERGENCY = ['police_car', 'fire_truck', 'ambulance']
LENGTH_RANGE = {'car_': (3.2, 4.4), 'retro_bus': (6.5, 7.6), 'truck_cargo': (4.8, 6.0), 'horse_sleigh_bus': (6.0, 8.5),
                'fire_truck': (5.5, 7.0), 'ambulance': (4.4, 5.4), 'police_car': (3.4, 4.4)}


def main():
    d = os.path.join(ASSETS, 'vehicles')
    if '--dir' in sys.argv:
        d = sys.argv[sys.argv.index('--dir') + 1]
    errors, warns = [], []

    def err(msg):
        errors.append(msg)

    def warn(msg):
        warns.append(msg)

    man_path = os.path.join(d, 'manifest.json')
    if not os.path.exists(man_path):
        print('ERROR: no manifest at %s' % man_path)
        sys.exit(1)
    man = json.load(open(man_path))
    atlases = {}
    for a in man.get('atlases', []):
        png = os.path.join(ASSETS, a['png'])
        js = os.path.join(ASSETS, a['json'])
        if os.path.normpath(os.path.dirname(png)) != os.path.normpath(d):     # checking a dry-run pack elsewhere
            png, js = os.path.join(d, os.path.basename(a['png'])), os.path.join(d, os.path.basename(a['json']))
        if not (os.path.exists(png) and os.path.exists(js)):
            err('atlas %s: missing file(s)' % a['key'])
            continue
        aj = json.load(open(js))
        im = Image.open(png)
        if im.width > MAX_SHEET or im.height > MAX_SHEET:
            err('atlas %s is %dx%d (> %d)' % (a['key'], im.width, im.height, MAX_SHEET))
        if (aj['meta']['size']['w'], aj['meta']['size']['h']) != im.size:
            err('atlas %s: json size != png size' % a['key'])
        atlases[a['key']] = aj['frames']
    chars = man.get('characters', {})
    sprites = man.get('sprites', {})
    allkeys = set(chars) | set(sprites)
    for k in REQUIRED:
        if k not in allkeys:
            err('missing required key %s' % k)

    def frame_ok(atlas, name, size, who):
        fr = atlases.get(atlas, {}).get(name)
        if fr is None:
            err('%s: frame %s not in atlas %s' % (who, name, atlas))
            return False
        if size and [fr['sourceSize']['w'], fr['sourceSize']['h']] != list(size):
            err('%s: frame %s sourceSize %s != frameSize %s' % (who, name, fr['sourceSize'], size))
        return True

    nframes = 0
    for k, e in chars.items():
        who = 'vehicle %s' % k
        if e.get('kind') != 'vehicle':
            err('%s: kind %r' % (who, e.get('kind')))
        if e.get('dirs') != ['SE', 'NE'] or e.get('mirror') != {'SW': 'SE', 'NW': 'NE'}:
            err('%s: dirs / mirror %s %s' % (who, e.get('dirs'), e.get('mirror')))
        ax, ay = e['anchor']
        if not (0 < ax < 1 and 0 < ay < 1):
            err('%s: anchor %s not normalised' % (who, e['anchor']))
        anims = e.get('anims', {})
        if 'idle' not in anims or 'move' not in anims:
            err('%s: needs idle + move' % who)
        else:
            if not 2 <= anims['idle']['frames'] <= 4:
                err('%s: idle has %d frames (2-4)' % (who, anims['idle']['frames']))
            if not 4 <= anims['move']['frames'] <= 8:
                err('%s: move has %d frames (4-8)' % (who, anims['move']['frames']))
        if e.get('atlas') not in atlases:
            err('%s: atlas %s not listed' % (who, e.get('atlas')))
            continue
        for a, info in anims.items():
            if len(info.get('bobPx', [])) != info['frames']:
                err('%s: anim %s bobPx length' % (who, a))
            for dd in e['dirs']:
                for i in range(info['frames']):
                    n = e['frameName'].format(anim=a, dir=dd, i=i)
                    if frame_ok(e['atlas'], n, e['frameSize'], who):
                        nframes += 1
                    if e.get('overlay'):
                        on = e['overlay']['frameName'].format(anim=a, dir=dd, i=i)
                        frame_ok(e['overlay']['atlas'], on, e['frameSize'], who + ' overlay')
        for f in ('lengthM', 'widthM', 'heightM', 'era', 'seats', 'shadow', 'footprintPoly', 'topPx'):
            if f not in e:
                err('%s: missing field %s' % (who, f))
        if e.get('era') not in (2, 3):
            err('%s: era %r' % (who, e.get('era')))
        if not any(f in e for f in ('exhaustPoint', 'steamPoint')) and k not in ('dog_sled', 'cargo_sleigh',
                                                                                 'horse_sleigh_bus'):
            err('%s: needs exhaustPoint or steamPoint' % who)
        if k in NEEDS_CARGO and 'cargoPoint' not in e:
            err('%s: needs cargoPoint' % who)
        for f in ('doorPoints',):
            if f not in e:
                err('%s: missing %s' % (who, f))
        if 'lightPoints' not in e and k not in ('dog_sled',):
            err('%s: missing lightPoints' % who)
        seats = e.get('seats', {})
        for dd in e['dirs']:
            n = len(seats.get(dd, []))
            if n:
                for f in ('seatDirs', 'seatsStand', 'seatDrawOrder'):
                    if len(e.get(f, {}).get(dd, [])) != n:
                        err('%s: %s[%s] length != seats' % (who, f, dd))
                if not e.get('overlay'):
                    err('%s: has seats but no overlay frames' % who)
            for f in ('cargoPoint', 'exhaustPoint', 'steamPoint'):
                if f in e and dd not in e[f]:
                    err('%s: %s has no %s value' % (who, f, dd))
        if k == 'truck_cargo_chief':
            if e.get('driverSeat') is not None or not e.get('crew'):
                err('%s: the chief must be baked (driverSeat null, crew set)' % who)
        elif e.get('seats', {}).get('SE') and e.get('driverSeat') is None and k not in ('dog_sled',):
            warn('%s: no driverSeat' % who)
        if k in EMERGENCY and not any(a.get('beacons') for a in anims.values()):
            err('%s: emergency lights must blink (beacons)' % who)
        for pre, (lo, hi) in LENGTH_RANGE.items():
            if k.startswith(pre) and not lo <= e.get('lengthM', 0) <= hi:
                err('%s: lengthM %.2f outside %s' % (who, e.get('lengthM', 0), (lo, hi)))
    for f, vs in CAR_VARIANTS.items():
        fam = man.get('vehicleFamilies', {}).get(f, [])
        if sorted(fam) != sorted('%s_%s' % (f, c) for c in vs):
            err('vehicleFamilies.%s = %s' % (f, fam))

    for k, s in sprites.items():
        who = 'sprite %s' % k
        if s.get('atlas') not in atlases:
            err('%s: atlas %s not listed' % (who, s.get('atlas')))
            continue
        frame_ok(s['atlas'], s['frame'], s.get('frameSize'), who)
        nframes += 1
        for a, info in s.get('anims', {}).items():
            for n in info['frames']:
                frame_ok(info.get('atlas', s['atlas']), n, s.get('frameSize'), who + ' anim ' + a)
        if 'footprint' not in s:
            err('%s: no footprint' % who)
    for k in ('parking_lot_s', 'parking_lot_m'):
        s = sprites.get(k, {})
        want = 4 if k.endswith('_s') else 8
        if len(s.get('stallPoints', [])) != want or len(s.get('stallDirs', [])) != want:
            err('%s: needs %d stallPoints + stallDirs' % (k, want))
        if s.get('kind') != 'decal':
            err('%s: should be a ground decal' % k)
    for k in ('bus_stop', 'bus_stop_y', 'sleigh_stop', 'sleigh_stop_y'):
        s = sprites.get(k, {})
        for f in ('stopPoint', 'stopDir', 'waitPoints', 'seatPoints', 'boardPoints'):
            if f not in s:
                err('%s: missing %s' % (k, f))
    for k in ('bus_depot', 'stable_depot'):
        if len(sprites.get(k, {}).get('bayPoints', [])) < 1:
            err('%s: missing bayPoints' % k)
    if len(sprites.get('bus_depot', {}).get('bayPoints', [])) != 2:
        err('bus_depot: needs 2 bays')
    for k in ('garage_small', 'fuel_depot'):
        if not sprites.get(k, {}).get('stallPoints'):
            err('%s: missing stallPoints' % k)
    for k in ('traffic_light', 'traffic_light_b'):
        s = sprites.get(k, {})
        cyc = s.get('anims', {}).get('cycle', {}).get('frames', [])
        if sorted(set(cyc)) != sorted('%s_%s' % (k, c) for c in ('green', 'yellow', 'red')):
            err('%s: cycle anim must use the 3 states' % k)
    for k in ('bus_stop', 'fuel_depot', 'bus_depot', 'road_sign_round', 'road_sign_tri', 'road_sign_rect',
              'road_sign_arrow', 'road_sign_info'):
        if 'board' not in sprites.get(k, {}).get('fxPoints', {}):
            err('%s: missing fxPoints.board (blank board)' % k)
    # collisions with the other fragments
    for frag in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, frag, 'manifest.json')
        if frag == 'vehicles' or not os.path.exists(p):
            continue
        try:
            om = json.load(open(p))
        except Exception:
            continue
        other = set(om.get('sprites', {})) | set(om.get('characters', {}))
        clash = allkeys & other
        if clash:
            err('key collision with assets/%s: %s' % (frag, ', '.join(sorted(clash))))
        oat = {a['key'] for a in om.get('atlases', [])}
        aclash = set(atlases) & oat
        if aclash:
            err('atlas key collision with assets/%s: %s' % (frag, ', '.join(sorted(aclash))))
    total = sum(os.path.getsize(os.path.join(d, f)) for f in os.listdir(d) if f.endswith(('.png', '.json')))
    if total > BUDGET_MB * 1048576:
        err('payload %.2f MB > %.1f MB' % (total / 1048576.0, BUDGET_MB))
    for w in warns:
        print('WARNING:', w)
    for e_ in errors:
        print('ERROR:', e_)
    print('veh_check: %d vehicles, %d sprites, %d frames checked, %d atlases, payload %.2f MB: %d errors, %d warnings'
          % (len(chars), len(sprites), nframes, len(atlases), total / 1048576.0, len(errors), len(warns)))
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
