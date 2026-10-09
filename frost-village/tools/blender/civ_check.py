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
import math
import os
import sys

import numpy as np
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
    'ruin_house_town_smoke', 'ruin_shop_town', 'ruin_shop_town_smoke', 'ruin_l_town', 'ruin_l_town_smoke',
    'scorch_decal_s', 'scorch_decal_m', 'scorch_decal_l',
    'rubble_pile_s', 'rubble_pile_m', 'rubble_pile_l', 'rubble_pile_s_half', 'rubble_pile_m_half', 'rubble_pile_l_half',
    'demolition_fence_x', 'demolition_fence_y', 'demolition_fence_x_lamp', 'demolition_fence_y_lamp',
    'demolition_fence_post', 'insurance_sign',
    'excavator', 'dump_truck', 'dump_pile',
    'moving_boxes_stack', 'furniture_pile', 'furniture_pile_s', 'furniture_pile_l', 'for_sale_sign', 'sold_sign',
    'welcome_mat',
]
VEHICLES = {'excavator': {'idle': 2, 'move': 4, 'dig': 8},
            'dump_truck': {'idle': 2, 'move': 4, 'tip': 6}}
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
        for f in ('cellPoints', 'cellPoint', 'carBayPoint', 'carBayDir', 'staffPoints', 'cellDoorPoint'):
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
        if 'bucketPoint' not in exc:
            errs.append('excavator: bucketPoint (contract name) missing')
        if 'dumpPoint' not in exc or 'digFrame' not in exc['anims'].get('dig', {}):
            errs.append('excavator: dumpPoint / digFrame missing')
    dt = ch.get('dump_truck')
    if dt and ('cargoPoint' not in dt or 'tipFrame' not in dt['anims'].get('tip', {})):
        errs.append('dump_truck: cargoPoint / tipFrame missing')
    if dt:
        co = dt.get('cargoOverlay')
        if not co:
            errs.append('dump_truck: cargoOverlay (loaded look) missing')
        else:
            for an in co['anims']:
                for d in dt['dirs']:
                    for i in range(co['frames'][an]):
                        chk_frame('dump_truck.cargo', dt['atlas'], 'cargo_%s_%s_%d' % (an, d, i), dt['frameSize'])
        if 'pileFrame' not in dt['anims'].get('tip', {}):
            errs.append('dump_truck: tip.pileFrame missing')
    lay = man.get('demolitionLayout', {})
    # ---- polish v2 checks ------------------------------------------------------------------------------------
    atlas_png = {at['key']: os.path.join(out, os.path.basename(at['png'])) for at in man.get('atlases', [])}
    _sheets = {}

    def frame_img(akey, name):
        """Full untrimmed RGBA frame rebuilt from a (trimmed) atlas."""
        f = frames.get(akey, {}).get(name)
        if f is None:
            return None
        if akey not in _sheets:
            _sheets[akey] = Image.open(atlas_png[akey]).convert('RGBA')
        fr, sss, src = f['frame'], f['spriteSourceSize'], f['sourceSize']
        crop = _sheets[akey].crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
        full = Image.new('RGBA', (src['w'], src['h']), (0, 0, 0, 0))
        full.paste(crop, (sss['x'], sss['y']))
        return full

    def sprite_img(key):
        e = sp.get(key)
        if not e:
            return None
        im = frame_img(e['atlas'], e['frame'])
        return (im, (e['anchor'][0] * e['frameSize'][0], e['anchor'][1] * e['frameSize'][1])) if im else None

    def wpt(p):
        return (p[0] / 45.2548 + p[1] / 22.6274) / 2.0, (p[0] / 45.2548 - p[1] / 22.6274) / 2.0

    def dpt(by_dir, d):
        if d in by_dir:
            return by_dir[d][:2]
        q = by_dir[{'SW': 'SE', 'NW': 'NE'}[d]]
        return [-q[0], q[1]]

    def dpoly(by_dir, d):
        if d in by_dir:
            return by_dir[d]
        return [[-q[0], q[1]] for q in by_dir[{'SW': 'SE', 'NW': 'NE'}[d]]]

    def poly_w(at, poly):
        ox, oy = wpt(at)
        return [(ox + wpt(q)[0], oy + wpt(q)[1]) for q in poly]

    def sat_gap(a, b):
        best = -1e9
        for poly in (a, b):
            for i in range(len(poly)):
                x0, y0 = poly[i]
                x1, y1 = poly[(i + 1) % len(poly)]
                nx, ny = y1 - y0, -(x1 - x0)
                ln = math.hypot(nx, ny) or 1.0
                pa = [(x * nx + y * ny) / ln for x, y in a]
                pb = [(x * nx + y * ny) / ln for x, y in b]
                best = max(best, min(pb) - max(pa), min(pa) - max(pb))
        return max(0.0, best)

    def inside(pt, poly):
        x, y = pt
        c = False
        for i in range(len(poly)):
            x0, y0 = poly[i]
            x1, y1 = poly[(i + 1) % len(poly)]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0 + 1e-12) + x0:
                c = not c
        return c
    # vehicles: anchor x exactly centred (Phaser flips around the frame centre)
    for k in VEHICLES:
        c = ch.get(k)
        if c and abs(c['anchor'][0] - 0.5) * c['frameSize'][0] > 2:
            errs.append('%s: anchor x %.4f is %.1f px off the frame centre (mirrored frames would jump)' % (
                k, c['anchor'][0], (c['anchor'][0] - 0.5) * c['frameSize'][0]))
    # bank: every waiting seat >= 30 px (screen) from every counter / queue point
    b_ = sp.get('bank', {})
    for i, st in enumerate(b_.get('seatPoints', [])):
        for f in ('counterPoints', 'customerPoints'):
            for j, q in enumerate(b_.get(f, [])):
                d = math.hypot(st[0] - q[0], st[1] - q[1])
                if d < 30:
                    errs.append('bank: seatPoints[%d] only %.0f px from %s[%d]' % (i, d, f, j))
    # police: the parked police_car leaves the side door and its own doors free
    ps = sp.get('police_station', {})
    vm = os.path.join(ASSETS, 'vehicles', 'manifest.json')
    pc = json.load(open(vm)).get('characters', {}).get('police_car') if os.path.exists(vm) else None
    if ps and pc and 'carBayPoint' in ps:
        d = ps.get('carBayDir', 'SW')
        car = poly_w(ps['carBayPoint'], dpoly(pc['footprintPoly'], d))
        if 'sideDoorPoint' in ps and inside(wpt(ps['sideDoorPoint']), car):
            errs.append('police_station: sideDoorPoint lies inside the parked police_car')
        rect = ps.get('buildingRectM')
        if rect:
            x0, x1, y0, y1 = rect
            box_ = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
            if sat_gap(car, box_) < 0.15:
                errs.append('police_station: the parked police_car touches the station walls')
            for q in dpoly(pc.get('doorPoints', {}), d):
                w_ = wpt([ps['carBayPoint'][0] + q[0], ps['carBayPoint'][1] + q[1]])
                if x0 - 0.15 < w_[0] < x1 + 0.15 and y0 - 0.15 < w_[1] < y1 + 0.15:
                    errs.append('police_station: a police_car doorPoint (%.2f, %.2f) is inside / against the wall'
                                % w_)
        if 'sideDoorPoint' in ps:
            sdw = wpt(ps['sideDoorPoint'])
            gap = sat_gap(car, [(sdw[0] - 0.2, sdw[1] - 0.2), (sdw[0] + 0.2, sdw[1] - 0.2),
                                (sdw[0] + 0.2, sdw[1] + 0.2), (sdw[0] - 0.2, sdw[1] + 0.2)])
            if gap < 0.15:
                errs.append('police_station: sideDoorPoint only %.2f m from the parked car' % gap)
    # wanted board portraits big enough to read at phone zoom
    wb = sp.get('wanted_board', {})
    if wb and (wb.get('posterSizePx', [0, 0])[0] < 40 or wb.get('posterSizePx', [0, 0])[1] < 34):
        errs.append('wanted_board: posterSizePx %s < [40, 34]' % wb.get('posterSizePx'))
    # ruins: cold base frame (embers live in the _smoke overlay), smoke overlay on every ruin
    for rk in ('ruin_s', 'ruin_m', 'ruin_l', 'ruin_house_town', 'ruin_shop_town', 'ruin_l_town'):
        if rk not in sp:
            continue
        if rk + '_smoke' not in sp:
            errs.append('%s: no smoke overlay' % rk)
        si = sprite_img(rk)
        if si:
            a = np.asarray(si[0]).astype(int)
            ember = (a[..., 3] > 128) & (a[..., 0] > 220) & (a[..., 1] > 60) & (a[..., 1] < 170) & (a[..., 2] < 90)
            if ember.sum() > 6:
                errs.append('%s: %d ember-orange px baked into the base frame (should be in %s_smoke)'
                            % (rk, int(ember.sum()), rk))
            lum = (a[..., :3] @ [0.299, 0.587, 0.114])[a[..., 3] > 200]
            if len(lum) and lum.mean() < 105:
                warns.append('%s: mean luminance %.0f (reads dark at phone zoom)' % (rk, lum.mean()))
    # demolitionLayout v2: every side, clearances in metres + screen-space checks with the real sprites
    exc_c, dt_c = ch.get('excavator'), ch.get('dump_truck')
    rings = man.get('fenceRings', {})
    for sz, n in (('S', 2), ('M', 3), ('L', 4)):
        L_ = lay.get(sz, {})
        h = n * 2 ** 0.5 / 2
        ph = {'S': 1.0, 'M': 1.5, 'L': 2.0}[sz]
        fence = [(-h - 0.06, -h - 0.06), (h + 0.06, -h - 0.06), (h + 0.06, h + 0.06), (-h - 0.06, h + 0.06)]
        sides = L_.get('sides', {})
        for need in ('Y-', 'X+'):
            if need not in sides:
                errs.append('demolitionLayout.%s: side %s missing' % (sz, need))
        if not exc_c or not dt_c:
            continue
        for side, e in sides.items():
            tag = 'demolitionLayout.%s.%s' % (sz, side)
            ed, td = e['excavator']['dir'], e['dump_truck']['dir']
            ep = poly_w(e['excavator']['at'], dpoly(exc_c['footprintPoly'], ed))
            tp = poly_w(e['dump_truck']['at'], dpoly(dt_c['footprintPoly'], td))
            if sat_gap(ep, fence) < 0.1:
                errs.append('%s: excavator touches the fence ring' % tag)
            if sat_gap(tp, fence) < 0.45:
                errs.append('%s: dump truck closer than 0.5 m to the fence ring' % tag)
            if sat_gap(tp, ep) < 0.2:
                errs.append('%s: dump truck touches the excavator' % tag)
            g = wpt([e['excavator']['at'][0] + dpt(exc_c['digPoint'], ed)[0],
                     e['excavator']['at'][1] + dpt(exc_c['digPoint'], ed)[1]])
            if abs(g[0]) > ph or abs(g[1]) > ph:
                errs.append('%s: the bucket bites outside the plot (%.2f, %.2f)' % (tag, g[0], g[1]))
            dump_w = wpt([e['excavator']['at'][0] + dpt(exc_c['dumpPoint'], ed)[0],
                          e['excavator']['at'][1] + dpt(exc_c['dumpPoint'], ed)[1]])
            cg_w = wpt([e['dump_truck']['at'][0] + dpt(dt_c['cargoGround'], td)[0],
                        e['dump_truck']['at'][1] + dpt(dt_c['cargoGround'], td)[1]])
            if math.hypot(dump_w[0] - cg_w[0], dump_w[1] - cg_w[1]) > 0.1:
                errs.append('%s: dumpPoint is not over the truck cargoGround' % tag)
            gi = e.get('gateIndex')
            ring = rings.get(sz, {}).get('pieces', [])
            if gi is None or not 0 <= gi < len(ring):
                errs.append('%s: gateIndex missing' % tag)
            # screen space: excavator dig frame vs the truck, bucket vs everything drawn after the excavator
            dig_f = exc_c['anims']['dig'].get('digFrame', 2)
            src = ed if ed in ('SE', 'NE') else {'SW': 'SE', 'NW': 'NE'}[ed]
            eim = frame_img(exc_c['atlas'], 'dig_%s_%d' % (src, dig_f))
            tsrc = td if td in ('SE', 'NE') else {'SW': 'SE', 'NW': 'NE'}[td]
            tim = frame_img(dt_c['atlas'], 'idle_%s_0' % tsrc)
            if eim is None or tim is None:
                continue
            if src != ed:
                eim = eim.transpose(Image.FLIP_LEFT_RIGHT)
            if tsrc != td:
                tim = tim.transpose(Image.FLIP_LEFT_RIGHT)
            ea = (exc_c['anchor'][0] * eim.width, exc_c['anchor'][1] * eim.height)
            ta = (dt_c['anchor'][0] * tim.width, dt_c['anchor'][1] * tim.height)
            E, T_ = e['excavator']['at'], e['dump_truck']['at']
            later = []
            for i, pcs in enumerate(ring):
                if i == gi:
                    continue
                si = sprite_img(pcs['key'])
                if si and pcs['at'][1] > E[1]:
                    later.append((si[0], si[1], pcs['at']))
            si = sprite_img('ruin_%s' % sz.lower())
            if si and 0 > E[1]:
                later.append((si[0], si[1], [0, 0]))
            if T_[1] > E[1]:
                later.append((tim, ta, T_))
            bp = dpt({d: v[dig_f] for d, v in exc_c['bucketPoint']['dig'].items()}, ed)
            P = (E[0] + bp[0], E[1] + bp[1])
            hits = 0
            for dx in (-3, 0, 3):
                for dy in (-3, 0, 3):
                    for im, an, at in later:
                        x = int(round(P[0] + dx - at[0] + an[0]))
                        y = int(round(P[1] + dy - at[1] + an[1]))
                        if 0 <= x < im.width and 0 <= y < im.height and im.getpixel((x, y))[3] > 128:
                            hits += 1
                            break
            if side in ('Y-', 'X+') and hits > 2:
                errs.append('%s: the bucket at digFrame is hidden by sprites drawn after the excavator' % tag)
            if T_[1] > E[1]:
                ea_ = np.asarray(eim)[..., 3] > 128
                ys, xs = np.nonzero(ea_)
                ta_ = np.asarray(tim)[..., 3] > 128
                ox = xs + int(round(-ea[0] + E[0] - T_[0] + ta[0]))
                oy = ys + int(round(-ea[1] + E[1] - T_[1] + ta[1]))
                ok = (ox >= 0) & (ox < tim.width) & (oy >= 0) & (oy < tim.height)
                cov = np.zeros(len(xs), bool)
                cov[ok] = ta_[oy[ok], ox[ok]]
                if cov.mean() > 0.3:
                    errs.append('%s: the dump truck covers %.0f %% of the excavator' % (tag, cov.mean() * 100))
    # ruinFor table points at real keys
    for bk, rf in man.get('ruinFor', {}).items():
        for f in ('ruin', 'scorch', 'rubble'):
            if f in rf and rf[f] not in sp:
                errs.append('ruinFor.%s: unknown %s %s' % (bk, f, rf[f]))
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
