"""
civ_check.py - verify assets/civic (docs/CONTRACT_V8.md section AB) against the contract.  Exit 1 on any error.
    python3 tools/blender/civ_check.py [--out DIR]

Checks: every REQUIRED key; atlases exist, PNG size = JSON meta, sheets <= 2048 px; every sprite / anim / layer /
character frame exists with sourceSize == frameSize and a sane anchor; cutaway builds (layers share frame + anchor,
drawOrder resolves, overlay anims, revealPoly, slotted points); ruins / rubble / scorch match the S / M / L plots of
assets/buildings site_* (footprintM + anchor semantics) and ruin_house_town matches the town houses; fence tiles
(stepPx, ring geometry); vehicles (dirs SE / NE + mirror, all anim frames, dig / dump / tip frames in range,
per-frame points); point formats; no key collisions with other fragments; payload <= 7 MB.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')
BUDGET_MB = 7.0

REQUIRED = [
    'bank', 'bank_floor', 'bank_back', 'bank_interior', 'bank_front', 'bank_shell_cut', 'bank_shell', 'bank_vault',
    'police_station', 'police_station_floor', 'police_station_back', 'police_station_interior',
    'police_station_front', 'police_station_shell_cut', 'police_station_shell', 'police_station_cell',
    'wanted_board', 'fire_hydrant', 'fire_alarm_post',
    'ruin_s', 'ruin_m', 'ruin_l', 'ruin_house_town', 'ruin_s_smoke', 'ruin_m_smoke', 'ruin_l_smoke',
    'ruin_house_town_smoke',
    'scorch_decal_s', 'scorch_decal_m', 'scorch_decal_l',
    'rubble_pile_s', 'rubble_pile_m', 'rubble_pile_l', 'rubble_pile_s_half', 'rubble_pile_m_half', 'rubble_pile_l_half',
    'demolition_fence_x', 'demolition_fence_y', 'demolition_fence_x_lamp', 'demolition_fence_y_lamp',
    'demolition_fence_post', 'insurance_sign',
    'excavator', 'dump_truck',
    'moving_boxes_stack', 'furniture_pile', 'furniture_pile_s', 'furniture_pile_l', 'for_sale_sign', 'sold_sign',
    'welcome_mat',
]
VEHICLES = {'excavator': {'idle': 2, 'move': 4, 'dig': 8},
            'dump_truck': {'idle': 2, 'move': 4, 'tip': 6, 'idle_loaded': 2, 'move_loaded': 4}}
PLOT = {'s': 2.0, 'm': 3.0, 'l': 4.0}


def main():
    a = sys.argv[1:]
    out = a[a.index('--out') + 1] if '--out' in a else os.path.join(ASSETS, 'civic')
    errs, warns = [], []
    mp = os.path.join(out, 'manifest.json')
    if not os.path.exists(mp):
        print('civ_check: no manifest at %s' % mp)
        sys.exit(1)
    man = json.load(open(mp, encoding='utf-8'))
    sp, ch = man.get('sprites', {}), man.get('characters', {})
    for k in REQUIRED:
        if k not in sp and k not in ch:
            errs.append('missing required key %s' % k)
    # ---- atlases
    frames = {}
    total = os.path.getsize(mp)
    for at in man.get('atlases', []):
        png = os.path.join(out, os.path.basename(at['png']))
        js = os.path.join(out, os.path.basename(at['json']))
        if not (os.path.exists(png) and os.path.exists(js)):
            errs.append('atlas files missing: %s' % at['key'])
            continue
        total += os.path.getsize(png) + os.path.getsize(js)
        meta = json.load(open(js))
        im = Image.open(png)
        if im.width > 2048 or im.height > 2048:
            errs.append('atlas %s is %dx%d (> 2048)' % (at['key'], im.width, im.height))
        ms = meta['meta']['size']
        if (ms['w'], ms['h']) != im.size:
            errs.append('atlas %s: PNG %s != JSON meta %s' % (at['key'], im.size, ms))
        frames[at['key']] = meta['frames']

    def chk_frame(owner, akey, name, size):
        f = frames.get(akey, {}).get(name)
        if f is None:
            errs.append('%s: frame %s missing in atlas %s' % (owner, name, akey))
            return
        if size and [f['sourceSize']['w'], f['sourceSize']['h']] != list(size):
            errs.append('%s: frame %s sourceSize %s != frameSize %s' % (owner, name, f['sourceSize'], size))

    def chk_pt(owner, field, v):
        ok = isinstance(v, list) and len(v) == 2 and all(isinstance(t, int) for t in v)
        if not ok:
            errs.append('%s: bad point %s = %s' % (owner, field, v))
    # ---- sprites
    for k, s in sp.items():
        for f in ('atlas', 'frame', 'anchor', 'frameSize', 'kind'):
            if f not in s:
                errs.append('%s: field %s missing' % (k, f))
        if 'atlas' not in s:
            continue
        chk_frame(k, s['atlas'], s['frame'], s.get('frameSize'))
        ax, ay = s['anchor']
        if not (0 <= ax <= 1 and 0 <= ay <= 1):
            errs.append('%s: anchor out of range %s' % (k, s['anchor']))
        for an, info in s.get('anims', {}).items():
            if not info.get('frames'):
                errs.append('%s: anim %s has no frames' % (k, an))
            for fr in info.get('frames', []):
                chk_frame('%s.%s' % (k, an), s['atlas'], fr, s.get('frameSize'))
        for field, v in s.items():
            if field.endswith('Point'):
                chk_pt(k, field, v)
            elif field.endswith('Points') and field != 'fxPoints':
                if not isinstance(v, list) or not v:
                    errs.append('%s: empty %s' % (k, field))
                for p in v:
                    chk_pt(k, field, p)
                df = field[:-6] + 'Dirs'
                if df in s and len(s[df]) != len(v):
                    errs.append('%s: %s length != %s' % (k, df, field))
        if s.get('kind') != 'decal' and s.get('kind') not in ('layer', 'overlay') and 'topPx' not in s:
            warns.append('%s: no topPx' % k)
    # ---- cutaways
    for k in ('bank', 'police_station'):
        s = sp.get(k)
        if not s:
            continue
        cut = s.get('cutaway')
        if not cut:
            errs.append('%s: no cutaway block' % k)
            continue
        for lay, lk in cut['layers'].items():
            e = sp.get(lk)
            if not e:
                errs.append('%s: layer sprite %s missing' % (k, lk))
                continue
            if e['frameSize'] != s['frameSize'] or e['anchor'] != s['anchor']:
                errs.append('%s: layer %s frame / anchor differ from the building' % (k, lk))
        for need in ('floor', 'back', 'interior', 'front', 'shell_cut', 'shell'):
            if need not in cut['layers']:
                errs.append('%s: layer %s missing' % (k, need))
        for item in cut['drawOrder']:
            if not item.startswith('@') and item not in sp:
                errs.append('%s: drawOrder item %s unknown' % (k, item))
        if '@behind' not in cut['drawOrder'] or '@front' not in cut['drawOrder']:
            errs.append('%s: drawOrder lacks character slots' % k)
        for ok_, ov in cut['overlays'].items():
            e = sp.get(ok_)
            if not e:
                errs.append('%s: overlay %s missing' % (k, ok_))
                continue
            for an in ov['anims']:
                if an not in e.get('anims', {}):
                    errs.append('%s: overlay %s lacks anim %s' % (k, ok_, an))
        if len(cut.get('revealPoly', [])) < 3:
            errs.append('%s: revealPoly missing' % k)
        if 'staffPoints' not in s or 'doorPoint' not in s:
            errs.append('%s: staffPoints / doorPoint missing' % k)
    if 'bank' in sp:
        for f in ('customerPoints', 'atmPoint', 'vaultPoint', 'counterPoints', 'seatPoints', 'entryPoint'):
            if f not in sp['bank']:
                errs.append('bank: %s missing' % f)
        if 'vault' not in sp.get('bank_vault', {}).get('anims', {}) or \
                len(sp['bank_vault']['anims']['vault']['frames']) != 8:
            errs.append('bank_vault: anims.vault must have 8 frames')
    if 'police_station' in sp:
        for f in ('cellPoints', 'carBayPoint', 'carBayDir', 'staffPoints', 'cellDoorPoint'):
            if f not in sp['police_station']:
                errs.append('police_station: %s missing' % f)
        if 'open' not in sp.get('police_station_cell', {}).get('anims', {}):
            errs.append('police_station_cell: anims.open missing')
    # ---- plots: ruins / rubble / decals match the S / M / L sites
    bm = os.path.join(ASSETS, 'buildings', 'manifest.json')
    sites = json.load(open(bm)).get('sprites', {}) if os.path.exists(bm) else {}
    for sz, a_ in PLOT.items():
        site = sites.get('site_plot_%s' % sz.upper())
        for k in ('ruin_%s' % sz, 'rubble_pile_%s' % sz, 'rubble_pile_%s_half' % sz):
            s = sp.get(k)
            if not s:
                continue
            if s.get('footprintM') != [a_, a_]:
                errs.append('%s: footprintM %s != plot %s' % (k, s.get('footprintM'), [a_, a_]))
            if site and s.get('footprint') != site.get('footprint'):
                errs.append('%s: footprint px %s != site_plot_%s %s' % (k, s.get('footprint'), sz.upper(),
                                                                       site.get('footprint')))
        d = sp.get('scorch_decal_%s' % sz)
        if d and d.get('anchor') != [0.5, 0.5]:
            errs.append('scorch_decal_%s: anchor must be the centre' % sz)
        if sp.get('rubble_pile_%s' % sz) and sp.get('rubble_pile_%s_half' % sz):
            if sp['rubble_pile_%s' % sz]['anchor'] != sp['rubble_pile_%s_half' % sz]['anchor']:
                errs.append('rubble_pile_%s: stages do not share the anchor' % sz)
    tm = os.path.join(ASSETS, 'town', 'manifest.json')
    if os.path.exists(tm) and 'ruin_house_town' in sp:
        th = json.load(open(tm))['sprites'].get('townhouse_a', {})
        if th and th.get('footprintM') != sp['ruin_house_town'].get('footprintM'):
            errs.append('ruin_house_town: footprintM differs from townhouse_a')
    # ---- fence
    for ax_, step in (('x', [64, 32]), ('y', [64, -32])):
        for k in ('demolition_fence_%s' % ax_, 'demolition_fence_%s_lamp' % ax_):
            s = sp.get(k)
            if s and s.get('stepPx') != step:
                errs.append('%s: stepPx %s != %s' % (k, s.get('stepPx'), step))
    rings = man.get('fenceRings', {})
    for sz, n in (('S', 2), ('M', 3), ('L', 4)):
        r = rings.get(sz)
        if not r or len(r['pieces']) != 4 * n + 1:
            errs.append('fenceRings.%s: expected %d pieces' % (sz, 4 * n + 1))
        else:
            for pc in r['pieces']:
                if pc['key'] not in sp:
                    errs.append('fenceRings.%s: unknown key %s' % (sz, pc['key']))
    # ---- vehicles
    for k, anims in VEHICLES.items():
        c = ch.get(k)
        if not c:
            continue
        if c.get('dirs') != ['SE', 'NE'] or c.get('mirror') != {'SW': 'SE', 'NW': 'NE'}:
            errs.append('%s: dirs / mirror not the vehicle convention' % k)
        for an, n in anims.items():
            info = c['anims'].get(an)
            if not info or info['frames'] != n:
                errs.append('%s: anim %s should have %d frames' % (k, an, n))
                continue
            for d in c['dirs']:
                for i in range(n):
                    chk_frame(k, c['atlas'], '%s_%s_%d' % (an, d, i), c['frameSize'])
            for f in ('digFrame', 'dumpFrame', 'tipFrame'):
                if f in info and not 0 <= info[f] < n:
                    errs.append('%s.%s: %s out of range' % (k, an, f))
        if 'shadow' not in c:
            errs.append('%s: no shadow ellipse' % k)
    exc = ch.get('excavator')
    if exc:
        bp = exc.get('framePoints', {}).get('bucketPoints', {}).get('dig', {})
        for d in ('SE', 'NE'):
            if len(bp.get(d, [])) != 8:
                errs.append('excavator: bucketPoints.dig.%s must have 8 points' % d)
        if 'dumpPoint' not in exc or 'digFrame' not in exc['anims'].get('dig', {}):
            errs.append('excavator: dumpPoint / digFrame missing')
    dt = ch.get('dump_truck')
    if dt and ('cargoPoint' not in dt or 'tipFrame' not in dt['anims'].get('tip', {})):
        errs.append('dump_truck: cargoPoint / tipFrame missing')
    # ---- collisions with other fragments
    for frag in sorted(os.listdir(ASSETS)):
        p = os.path.join(ASSETS, frag, 'manifest.json')
        if frag == os.path.basename(out) or not os.path.exists(p):
            continue
        try:
            om = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        clash = (set(om.get('sprites', {})) | set(om.get('characters', {}))) & (set(sp) | set(ch))
        if clash:
            errs.append('key collision with assets/%s: %s' % (frag, ', '.join(sorted(clash))))
    mb = total / 1048576.0
    if mb > BUDGET_MB:
        errs.append('payload %.2f MB > %.1f MB' % (mb, BUDGET_MB))
    for w in warns:
        print('WARN ', w)
    for e in errs:
        print('ERROR', e)
    print('civ_check: %d sprites, %d vehicles, %d atlases, payload %.2f MB: %d errors, %d warnings'
          % (len(sp), len(ch), len(man.get('atlases', [])), mb, len(errs), len(warns)))
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
