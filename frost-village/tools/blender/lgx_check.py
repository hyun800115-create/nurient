"""
lgx_check.py - verify assets/logistics/ against docs/CONTRACT_V8.md section AA.  Exit code 1 on any error.

    python3 tools/blender/lgx_check.py [--dir assets/logistics]

Checks: every required key; atlases exist, PNG size == JSON meta, sheets <= 2048 px; every frame referenced by a
sprite / anim / vehicle (incl. overlays) exists; all logistics_center layers + patches share frameSize + anchor and
their trimmed frames carry the full sourceSize; points + fields (dockPoints/dockDirs, forkliftPath, rackSlots with
the six categories, staffPoints/Dirs/Roles/Bands, customerPoints, doorPoint, inPoint, footprintPoly, revealPoly);
the depth-band validation has no issues; item conventions (72 x 72, anchor [0.5, 0.75], stackStep, carryScale,
icon); producers (anims.work 4 frames, workSpot, inPoint, outPoint); vehicles (dirs SE/NE + mirror, anims + frame
counts, lift 6 / unload 6, seats + overlay, handlePoint for the pallet jack); payload <= 7 MB.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
DIR = os.path.join(GAME, 'assets', 'logistics')
BUDGET_MB = 7.0

ITEMS = ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe', 'item_fridge', 'item_stove_iron',
         'item_washer', 'item_radio', 'item_tv_retro', 'item_toolbox', 'item_crate_food', 'item_crate_cans',
         'item_crate_bread', 'item_crate_produce', 'pallet_planks', 'pallet_ingots', 'pallet_logs', 'pallet_boxes',
         'cardboard_box_s', 'cardboard_box_m', 'cardboard_box_l']
PRODUCERS = ['furniture_workshop', 'appliance_factory']
VEHICLES = ['forklift', 'forklift_loaded', 'delivery_van_red', 'delivery_van_blue', 'delivery_van_mint',
            'moving_truck', 'pallet_jack']
CENTER = 'logistics_center'
REQUIRED_ALL = [CENTER] + ITEMS + PRODUCERS + VEHICLES
LAYERS = ['back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub', 'shell_cut', 'shell', 'props']
PATCHES = {'conveyor': 8, 'dock1': 6, 'dock2': 6, 'lamp': 4}
CATEGORIES = ['materials', 'food', 'goods', 'furniture', 'tools', 'appliances']
VEH_ANIMS = {'forklift': {'idle': 2, 'move': 4, 'lift': 6}, 'forklift_loaded': {'idle': 2, 'move': 4, 'lift': 6},
             'moving_truck': {'idle': 2, 'move': 4, 'unload': 6}, 'pallet_jack': {'idle': 1, 'move': 4}}
for _c in ('red', 'blue', 'mint'):
    VEH_ANIMS['delivery_van_' + _c] = {'idle': 2, 'move': 4}


def main():
    d = DIR
    if '--dir' in sys.argv:
        d = sys.argv[sys.argv.index('--dir') + 1]
    errs, warns = [], []

    def err(m):
        errs.append(m)

    mp = os.path.join(d, 'manifest.json')
    if not os.path.exists(mp):
        print('ERROR: no manifest at %s' % mp)
        sys.exit(1)
    man = json.load(open(mp, encoding='utf-8'))
    atlases = {}
    total = os.path.getsize(mp)
    for a in man.get('atlases', []):
        png = os.path.join(GAME, 'assets', a['png'])
        jsn = os.path.join(GAME, 'assets', a['json'])
        if not (os.path.exists(png) and os.path.exists(jsn)):
            err('atlas %s files missing' % a['key'])
            continue
        js = json.load(open(jsn))
        im = Image.open(png)
        if (im.width, im.height) != (js['meta']['size']['w'], js['meta']['size']['h']):
            err('atlas %s: png %dx%d != json meta' % (a['key'], im.width, im.height))
        if im.width > 2048 or im.height > 2048:
            err('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        atlases[a['key']] = js['frames']
        total += os.path.getsize(png) + os.path.getsize(jsn)
    sp = man.get('sprites', {})
    ch = man.get('characters', {})

    def frame_ok(atlas, fr, size=None, what=''):
        if atlas not in atlases:
            err('%s: atlas %s not listed' % (what, atlas))
            return
        if fr not in atlases[atlas]:
            err('%s: frame %s missing in %s' % (what, fr, atlas))
            return
        if size:
            ss = atlases[atlas][fr]['sourceSize']
            if [ss['w'], ss['h']] != list(size):
                err('%s: frame %s sourceSize %s != frameSize %s' % (what, fr, ss, size))
    for k in [CENTER] + ITEMS + PRODUCERS:
        if k not in sp:
            err('missing sprite %s' % k)
    for k in VEHICLES:
        if k not in ch:
            err('missing vehicle %s' % k)
    # ---------------------------------------------------------------- centre
    c = sp.get(CENTER)
    if c:
        fs, an = c['frameSize'], c['anchor']
        frame_ok(c['atlas'], c['frame'], fs, CENTER)
        for name in LAYERS:
            key = c['layers'].get(name)
            s = sp.get(key)
            if not s:
                err('centre layer %s missing' % name)
                continue
            if s['frameSize'] != fs or s['anchor'] != an:
                err('layer %s: frameSize/anchor differ from the centre' % name)
            frame_ok(s['atlas'], s['frame'], fs, key)
        for name, n in PATCHES.items():
            key = c['patches'].get(name)
            s = sp.get(key)
            if not s:
                err('centre patch %s missing' % name)
                continue
            if s['frameSize'] != fs or s['anchor'] != an:
                err('patch %s: frameSize/anchor differ from the centre' % name)
            for an_name, a in s['anims'].items():
                if len(a['frames']) != n:
                    err('patch %s anim %s has %d frames (want %d)' % (name, an_name, len(a['frames']), n))
                for fr in a['frames']:
                    frame_ok(s['atlas'], fr, fs, key)
        if c['revealPoly'] and len(c['revealPoly']) < 4:
            err('revealPoly too small')
        for f in ('dockPoints', 'dockDirs', 'forkliftPath', 'rackSlots', 'staffPoints', 'staffDirs', 'staffRoles',
                  'staffBands', 'customerPoints', 'customerDirs', 'customerBands', 'doorPoint', 'inPoint',
                  'footprintPoly', 'revealPoly', 'dockVehiclePoints', 'layerOrder', 'reveal'):
            if f not in c:
                err('centre field %s missing' % f)
        if len(c.get('dockPoints', [])) != 2 or len(c.get('dockDirs', [])) != 2:
            err('need 2 docks')
        cats = set(s['category'] for s in c.get('rackSlots', []))
        for cat in CATEGORIES:
            if cat not in cats:
                err('no rack slots for category %s' % cat)
        for s in c.get('rackSlots', []):
            if s.get('band') not in ('stock', 'front'):
                err('rack slot %s L%d S%d: band %s' % (s['rack'], s['level'], s['slot'], s.get('band')))
            if s.get('maxStackPx', 0) < 30:
                err('rack slot %s L%d S%d: maxStackPx %s < 30' % (s['rack'], s['level'], s['slot'],
                                                                   s.get('maxStackPx')))
        roles = set(c.get('staffRoles', []))
        for r in ('picker', 'packer', 'clerk', 'dockhand'):
            if r not in roles:
                err('no staff point with role %s' % r)
        for b in c.get('staffBands', []) + c.get('customerBands', []):
            if b not in ('mid', 'front', 'any', 'outside'):
                err('bad band %s' % b)
        for e in c.get('forkliftPath', []):
            if e['legBand'] not in ('mid', 'front', 'outside', 'mixed'):
                err('forklift leg at %s: bad legBand %s' % (e['point'], e['legBand']))
            if e['legBand'] == 'mixed':
                warns.append('forklift leg at %s has a mixed band (switch band at the next node)' % e['point'])
        val = man.get('logistics', {}).get('validation', {})
        for s in val.get('issues', []):
            err('depth validation: ' + s)
    # ---------------------------------------------------------------- items
    for k in ITEMS:
        s = sp.get(k)
        if not s:
            continue
        frame_ok(s['atlas'], s['frame'], [72, 72], k)
        if s['frameSize'] != [72, 72] or [round(v, 3) for v in s['anchor']] != [0.5, 0.75]:
            err('%s: item frame/anchor wrong' % k)
        for f in ('stackStep', 'carryScale', 'icon', 'category'):
            if s.get(f) in (None, ''):
                err('%s: %s missing' % (k, f))
    for k in PRODUCERS:
        s = sp.get(k)
        if not s:
            continue
        frame_ok(s['atlas'], s['frame'], s['frameSize'], k)
        w = s.get('anims', {}).get('work')
        if not w or len(w['frames']) != 4:
            err('%s: anims.work must have 4 frames' % k)
        else:
            for fr in w['frames']:
                frame_ok(s['atlas'], fr, s['frameSize'], k)
        for f in ('inPoint', 'outPoint', 'workSpot', 'footprint', 'footprintPoly'):
            if f not in s:
                err('%s: %s missing' % (k, f))
        if 'point' not in s.get('workSpot', {}):
            err('%s: workSpot.point missing' % k)
    # ---------------------------------------------------------------- vehicles
    for k in VEHICLES:
        v = ch.get(k)
        if not v:
            continue
        if v.get('dirs') != ['SE', 'NE'] or v.get('mirror') != {'SW': 'SE', 'NW': 'NE'}:
            err('%s: dirs/mirror' % k)
        for an_name, n in VEH_ANIMS[k].items():
            a = v['anims'].get(an_name)
            if not a or a['frames'] != n:
                err('%s: anim %s frames %s (want %d)' % (k, an_name, a and a['frames'], n))
                continue
            for dd in ('SE', 'NE'):
                for i in range(n):
                    fr = '%s_%s_%d' % (an_name, dd, i)
                    frame_ok(v['atlas'], fr, v['frameSize'], k)
                    if v.get('overlay'):
                        frame_ok(v['overlay']['atlas'], 'over_' + fr, v['frameSize'], k + ' overlay')
        if k != 'pallet_jack' and not v.get('seats', {}).get('SE'):
            err('%s: no seats' % k)
        if k == 'pallet_jack' and 'handlePoint' not in v:
            err('pallet_jack: handlePoint missing')
        if k.startswith('forklift') and 'liftPx' not in v['anims'].get('lift', {}):
            err('%s: lift.liftPx missing' % k)
        if k == 'moving_truck' and 'rampPoint' not in v:
            err('moving_truck: rampPoint missing')
    mb = total / 1048576.0
    if mb > BUDGET_MB:
        err('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    for w in warns:
        print('WARNING: ' + w)
    for e in errs:
        print('ERROR: ' + e)
    print('logistics: %d sprites, %d vehicles, %d atlases, payload %.2f MB: %d errors, %d warnings'
          % (len(sp), len(ch), len(atlases), mb, len(errs), len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
