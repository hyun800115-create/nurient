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
(polish) + footprintPoly in anchor offsets (centroid ~ (0, 0), bbox = footprint) + frontTest; bands only mid / front /
outside; keep-clear + stock problems come through the validation list; every rack slot has cells + itemFit and every
item of rackCategories fits at least one slot of its category; nameplates + outdoorProps sprites; forklift dock nodes
inside the wall, legDir on every node; producers: workSpot.dir + smokeFx; no key / atlas collision with another
fragment (item_toolbox is the one documented, identical duplicate of assets/buildings -> warning).
"""
import glob
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
         'cardboard_box_s', 'cardboard_box_m', 'cardboard_box_l',
         'item_crate_jam', 'item_cloth_rolls', 'item_crate_smoked', 'item_crate_tools', 'pallet_ore']
KNOWN_DUPLICATES = {'item_toolbox': 'same builder, same look'}
KX, KY = 45.2548, 22.6274
PRODUCERS = ['furniture_workshop', 'appliance_factory']
VEHICLES = ['forklift', 'forklift_loaded', 'delivery_van_red', 'delivery_van_blue', 'delivery_van_mint',
            'moving_truck', 'pallet_jack']
CENTER = 'logistics_center'
REQUIRED_ALL = [CENTER] + ITEMS + PRODUCERS + VEHICLES
LAYERS = ['apron', 'shadow_open', 'back', 'floor', 'interior', 'interior_racks', 'interior_front', 'stub', 'shell_cut',
          'shell', 'props', 'nameplate_ko', 'nameplate_en']
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
        png = os.path.join(os.path.dirname(os.path.abspath(d)), a['png'])
        jsn = os.path.join(os.path.dirname(os.path.abspath(d)), a['json'])
        if os.path.basename(os.path.abspath(d)) != 'logistics':      # --dir to a scratch copy: atlases sit beside it
            png = os.path.join(d, os.path.basename(a['png']))
            jsn = os.path.join(d, os.path.basename(a['json']))
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
                  'footprintPoly', 'revealPoly', 'dockVehiclePoints', 'layerOrder', 'reveal', 'frontTest',
                  'nameplates', 'outdoorProps', 'stockScale', 'dockRoles', 'bandDepth'):
            if f not in c:
                err('centre field %s missing' % f)
        # footprintPoly: px offsets from the anchor (centroid ~ 0, bbox = footprint)
        fp = c.get('footprintPoly') or []
        if len(fp) == 4:
            cx, cy = sum(q[0] for q in fp) / 4.0, sum(q[1] for q in fp) / 4.0
            bw = max(q[0] for q in fp) - min(q[0] for q in fp)
            bh = max(q[1] for q in fp) - min(q[1] for q in fp)
            if abs(cx) > 5 or abs(cy) > 5:
                err('footprintPoly centroid (%.0f, %.0f) is not at the anchor (frame pixels instead of offsets?)'
                    % (cx, cy))
            if abs(bw - c['footprint'][0]) > 2 or abs(bh - c['footprint'][1]) > 2:
                err('footprintPoly bbox %dx%d != footprint %s' % (bw, bh, c['footprint']))
        else:
            err('footprintPoly needs 4 corners')
        st = c.get('reveal', {}).get('states', {})
        if any('shadow_open' not in v for v in st.values()):
            err('reveal.states must carry the shadow_open alpha')
        for lang in ('ko', 'en'):
            k = c.get('nameplates', {}).get(lang)
            if not k or k not in sp:
                err('nameplate %s missing' % lang)
        for op in c.get('outdoorProps', []):
            ps = sp.get(op.get('sprite'))
            if not ps or 'point' not in op:
                err('outdoor prop %s: sprite / point missing' % op)
                continue
            frame_ok(ps['atlas'], ps['frame'], ps['frameSize'], op['sprite'])
            ft = c.get('frontTest', {})
            x, y = op['point']
            if not (y - x / 2.0 > ft.get('a', 1e9) or y + x / 2.0 > ft.get('b', 1e9)) and y < 0:
                warns.append('outdoor prop %s is behind the building' % op['name'])
        for k, e in enumerate(c.get('forkliftPath', [])):
            if e.get('legDir') not in ('SE', 'NE', 'SW', 'NW') or e.get('dir') not in ('SE', 'NE', 'SW', 'NW'):
                err('forklift node %d: dir / legDir missing or bad' % k)
            wx = (e['point'][0] / KX + e['point'][1] / KY) / 2.0
            if e.get('action') and wx > 5.26:
                err('forklift node %d stands outside the wall (x %.2f m): it must stay on the leveller' % (k, wx))
        if 'heightM' not in c.get('conveyor', {}):
            err('conveyor.heightM missing')
        if len(c.get('dockPoints', [])) != 2 or len(c.get('dockDirs', [])) != 2:
            err('need 2 docks')
        cats = set(s['category'] for s in c.get('rackSlots', []))
        for cat in CATEGORIES:
            if cat not in cats:
                err('no rack slots for category %s' % cat)
        rc = c.get('rackCategories', {})
        fits_of = {}
        for s in c.get('rackSlots', []):
            tag_ = 'rack slot %s L%d S%d' % (s['rack'], s['level'], s['slot'])
            if s.get('band') not in ('stock', 'front'):
                err('%s: band %s' % (tag_, s.get('band')))
            if s.get('maxStackPx', 0) < 30:
                err('%s: maxStackPx %s < 30' % (tag_, s.get('maxStackPx')))
            if not s.get('cells') or not s.get('itemFit') or not s.get('maxStackPxBy'):
                err('%s: cells / itemFit / maxStackPxBy missing or empty' % tag_)
                continue
            for k in s['itemFit']:
                if k not in rc.get(s['category'], []):
                    err('%s: itemFit key %s is not in rackCategories.%s' % (tag_, k, s['category']))
                fits_of.setdefault(s['category'], set()).add(k)
        for cat, keys in rc.items():
            for k in keys:
                if k not in sp:
                    err('rackCategories.%s: %s is not a sprite of this fragment' % (cat, k))
                elif k not in fits_of.get(cat, set()):
                    err('rackCategories.%s: %s fits no %s slot (itemFit)' % (cat, k, cat))
                elif 'sizeClass' not in sp[k]:
                    err('%s: sizeClass missing' % k)
            if cat not in c.get('stockScale', {}):
                err('stockScale.%s missing' % cat)
        roles = set(c.get('staffRoles', []))
        for r in ('picker', 'packer', 'clerk', 'dockhand'):
            if r not in roles:
                err('no staff point with role %s' % r)
        for b in c.get('staffBands', []) + c.get('customerBands', []):
            if b not in ('mid', 'front', 'outside'):
                err('bad band %s (only mid / front / outside are defined)' % b)
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
        if 'point' not in s.get('workSpot', {}) or s.get('workSpot', {}).get('dir') not in ('E', 'W', 'SE', 'SW', 'S',
                                                                                         'NE', 'NW', 'N'):
            err('%s: workSpot.point / dir missing' % k)
        if 'smoke' in s.get('fxPoints', {}) and 'smokeFx' not in s:
            err('%s: fxPoints.smoke without smokeFx' % k)
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
        if k == 'moving_truck' and ('rampPoint' not in v or v.get('unloadDirs') != ['NE', 'NW']):
            err('moving_truck: rampPoint / unloadDirs missing')
    # ---------------------------------------------------------------- collisions with other fragments
    mine_keys = set(sp) | set(ch)
    mine_atl = set(atlases)
    for f in sorted(glob.glob(os.path.join(GAME, 'assets', '*', 'manifest.json'))):
        if os.path.abspath(os.path.dirname(f)) in (os.path.abspath(d), os.path.abspath(DIR)):
            continue
        try:
            om = json.load(open(f, encoding='utf-8'))
        except Exception:                                  # noqa: BLE001
            continue
        if not isinstance(om, dict):
            continue
        ok_ = set(om.get('sprites', {}) or {}) | set(om.get('characters', {}) or {})
        oa = set(a.get('key') for a in (om.get('atlases') or []) if isinstance(a, dict))
        frag = os.path.basename(os.path.dirname(f))
        for k in sorted(mine_keys & ok_):
            if k in KNOWN_DUPLICATES:
                warns.append('key %s also in assets/%s (documented: %s)' % (k, frag, KNOWN_DUPLICATES[k]))
            else:
                err('key %s collides with assets/%s' % (k, frag))
        for k in sorted(mine_atl & oa):
            err('atlas key %s collides with assets/%s' % (k, frag))
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
