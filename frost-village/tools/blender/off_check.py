"""
off_check.py - verify assets/office/ against docs/CONTRACT_V42.md section AI (+ AN).  Exit code 1 on any error.

    python3 tools/blender/off_check.py [--dir assets/office]

Checks
  * files: exactly manifest.json + office_bld.{png,json} + office_items.{png,json} (AI file budget 5); PNG size ==
    JSON meta; sheets <= 2048 px; office_bld RGBA source-sum <= 5.5 MiB; no frame outside its sheet, no two frames
    overlapping in a sheet.
  * every required key: chief_office, its 8 layers, its 7 overlays, office_mailbox, the six items.
  * chief_office: kind building, footprintM [5.6, 4.4], frameSize <= [640, 576], anchor near [0.42, 0.63], topPx
    250..340, floorLiftPx 14..18, footprintPoly (4 corners around the anchor), layers / overlays share frameSize +
    anchor, every frame carries the full sourceSize, contract depthOffsets, drawOrder / layerOrder / alwaysDrawn /
    insideLayers / reveal.states (closed, open) / outdoorProps, fade + cut + bandDepth.
  * overlays: frame counts (typewriters 4, phone 2, stove 4, lamps 2, safe 2), anims (type 10 fps loop, ring 8 fps
    loop, fire 6 fps loop), lamp / safe states; frame 0 of the typewriters = still (the patch equals the pass-through
    look), every anim frame differs from frame 0 somewhere; patches do not cover a seated person's box.
  * points: every field of the contract table with its count and dirs (8 compass names only), deskRoles sem / bok /
    chong / ttal, staffRoles board / cabinet / shelf / safe / door; every point inside the frame; inside points
    (with the floor lift / seat height taken off) inside the footprint; boardRect inside the frame; fxPoints chimney /
    kettle / lampDoor / lamps[3] / windows[>=3]; walkPoly inside the footprint (lifted); wallCircles 8..16 with a gap
    at the door; revealPoly covers the building's opaque pixels; pointSlots values behind / front / outside.
  * alignment (AN.3): the opaque bounds of every inside layer lie inside the closed shell's footprint box (+ margin),
    the overlays sit inside the inside layers' union box.
  * office_mailbox: prop, anims flag (2) + pop (3 @ 12 fps), slotPoint inside the frame, height ~1.1 m.
  * items: 72 x 72, anchor [0.5, 0.86], stackStep, carryScale, icon, content inside the frame and above the bottom
    row.
  * no key / atlas collision with any other assets/* fragment.
  (polish, docs/build_reports/v42_office_critique.md)
  * H1: the game's renderer src/entities/Cutaway.js (and the v5 BankBuilding, all layers always) simulated on the
    closed state: identical to _shell + _props on three backgrounds; no glow in cutaway.drawOrder; cutaway.layers.front
    = the desk layer; _floor has nothing outside the opaque closed shell.
  * H2: head boxes (top 30 px of a seated, 40 px of a standing person, 40 px wide) <= 10 % covered by opaque
    _shell_cut (+ desks / desk patches for the behind band).
  * M1 / M2 / L1: visitor seats >= 0.7 m apart, no furniture in a seat's leg space, standing spots clear of furniture
    (the chief's pad >= 0.35 m from tall _interior pieces), busy-together spots >= 0.75 m apart (furnitureM).
  * M3: wall circles with the agent radius (16 px): standing spots + door path clear, walls closed except the door.
  * M4: the raised mailbox flag rises >= 10 px above the down silhouette.  M5: the open safe shows gold inside, the
    stubs cover <= 25 % of its door.  L3: coin sacks >= +30 % width per step.  L4 / L9: states closed / open / bare.
"""
import glob
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
DIR = os.path.join(GAME, 'assets', 'office')
KEY = 'chief_office'
PX_X, PX_Y, PX_Z = 45.2548, 22.6274, 55.4256
LAYERS = {'floor': -0.45, 'back': -0.40, 'interior': -0.30, 'interior_front': -0.10, 'shell_cut': -0.02,
          'shell': 0.0, 'glow': 0.005, 'props': 0.01}
OVERLAYS = {'typewriter_a': 4, 'typewriter_b': 4, 'phone': 2, 'stove': 4, 'lamp_a': 2, 'lamp_b': 2, 'safe': 2}
OVL_ANIMS = {'typewriter_a': ('type', 10, -1), 'typewriter_b': ('type', 10, -1), 'phone': ('ring', 8, -1),
             'stove': ('fire', 6, -1)}
OVL_STATES = {'lamp_a': ['warm', 'alert'], 'lamp_b': ['warm', 'alert'], 'safe': ['shut', 'open']}
ITEMS = ['item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l', 'item_letter_bundle', 'item_newspaper_bundle',
         'item_ledger']
DIRS = {'S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'}
FILES = {'manifest.json', 'office_bld.png', 'office_bld.json', 'office_items.png', 'office_items.json'}
BUDGET_BLD = 5.5
AGENT = 16                                     # player collision radius px (src/entities/Player.js)
# field -> (count or None for one point, dir field, contract dirs (None = any), slot)
POINTS = {
    'doorPoint': (1, 'doorDir', {'NE'}, 'outside'),
    'entryPoint': (1, 'entryDir', {'NE'}, 'front'),
    'chiefDeskPoint': (1, 'chiefDeskDir', {'SW'}, 'behind'),
    'chiefDeskPad': (1, 'chiefDeskPadDir', {'NE'}, 'front'),
    'deskPoints': (4, 'deskDirs', None, 'behind'),
    'boardPoint': (1, 'boardDir', {'NE'}, 'behind'),
    'cabinetPoint': (1, 'cabinetDir', {'NW'}, 'behind'),
    'mailShelfPoint': (1, 'mailShelfDir', {'NW'}, 'behind'),
    'safePoint': (1, 'safeDir', {'NE'}, 'front'),
    'stovePoint': (1, None, None, None),
    'seatPoints': (2, 'seatDirs', {'S', 'SE', 'SW'}, 'front'),
    'mailboxPoint': (1, 'mailboxDir', {'NE'}, 'outside'),
}
SEATED = {'chiefDeskPoint', 'deskPoints', 'seatPoints'}
OUTSIDE = {'doorPoint', 'mailboxPoint'}


def pip(pt, poly):
    x, y = pt
    inside = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def main():
    d = DIR
    if '--dir' in sys.argv:
        d = sys.argv[sys.argv.index('--dir') + 1]
    errs, warns, notes = [], [], []

    def err(m):
        errs.append(m)

    def warn(m):
        warns.append(m)
    # ------------------------------------------------------------------ files
    have = set(os.listdir(d)) if os.path.isdir(d) else set()
    if have != FILES:
        err('files: %s (want exactly %s)' % (sorted(have), sorted(FILES)))
    try:
        man = json.load(open(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    except Exception as e:                      # noqa: BLE001
        print('ERROR manifest unreadable: %s' % e)
        return 1
    for f in ('version', 'generator', 'conventions', 'atlases', 'sprites'):
        if f not in man:
            err('manifest.%s missing' % f)
    sp = man.get('sprites', {})
    sheets = {}
    for a in man.get('atlases', []):
        png = os.path.join(d, os.path.basename(a['png']))
        js = os.path.join(d, os.path.basename(a['json']))
        if not (os.path.exists(png) and os.path.exists(js)):
            err('atlas %s files missing' % a['key'])
            continue
        im = Image.open(png)
        j = json.load(open(js))
        if (im.width, im.height) != (j['meta']['size']['w'], j['meta']['size']['h']):
            err('atlas %s: png %dx%d != json meta' % (a['key'], im.width, im.height))
        if im.width > 2048 or im.height > 2048:
            err('atlas %s is %dx%d (> 2048)' % (a['key'], im.width, im.height))
        mib = im.width * im.height * 4 / 1048576.0
        notes.append('%s %dx%d %.2f MiB RGBA source-sum, %d frames, %.0f KB on disk' % (
            a['key'], im.width, im.height, mib, len(j['frames']), os.path.getsize(png) / 1024.0))
        if a['key'] == 'office_bld' and mib > BUDGET_BLD:
            err('office_bld %.2f MiB > budget %.1f' % (mib, BUDGET_BLD))
        rects = []
        for fn, f in j['frames'].items():
            r = f['frame']
            if r['x'] < 0 or r['y'] < 0 or r['x'] + r['w'] > im.width or r['y'] + r['h'] > im.height:
                err('%s: frame %s outside the sheet' % (a['key'], fn))
            for q in rects:
                if r['x'] < q['x'] + q['w'] and q['x'] < r['x'] + r['w'] and r['y'] < q['y'] + q['h'] and \
                        q['y'] < r['y'] + r['h']:
                    err('%s: frame %s overlaps another frame' % (a['key'], fn))
                    break
            rects.append(r)
        sheets[a['key']] = (im.convert('RGBA'), j['frames'])

    def frame(atlas, fn):
        s = sheets.get(atlas)
        if not s or fn not in s[1]:
            return None
        f = s[1][fn]
        r, o, ss = f['frame'], f['spriteSourceSize'], f['sourceSize']
        out = Image.new('RGBA', (ss['w'], ss['h']), (0, 0, 0, 0))
        out.paste(s[0].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (o['x'], o['y']))
        return out

    def frame_ok(atlas, fn, size, what):
        s = sheets.get(atlas)
        if not s:
            err('%s: atlas %s not listed' % (what, atlas))
            return False
        if fn not in s[1]:
            err('%s: frame %s missing in %s' % (what, fn, atlas))
            return False
        ss = s[1][fn]['sourceSize']
        if size and [ss['w'], ss['h']] != list(size):
            err('%s: frame %s sourceSize %s != frameSize %s' % (what, fn, [ss['w'], ss['h']], size))
        return True
    # ------------------------------------------------------------------ required keys
    req = [KEY] + ['%s_%s' % (KEY, n) for n in LAYERS] + ['%s_%s' % (KEY, n) for n in OVERLAYS] + \
        ['office_mailbox'] + ITEMS
    for k in req:
        if k not in sp:
            err('missing sprite %s' % k)
    if errs:
        return report(errs, warns, notes)
    c = sp[KEY]
    W, H = c['frameSize']
    ax, ay = c['anchor'][0] * W, c['anchor'][1] * H
    # ------------------------------------------------------------------ building fields
    if c.get('kind') != 'building':
        err('chief_office.kind %s' % c.get('kind'))
    if [round(v, 2) for v in c.get('footprintM', [])] != [5.6, 4.4]:
        err('footprintM %s != [5.6, 4.4]' % c.get('footprintM'))
    if W > 640 or H > 576:
        err('frameSize %s > [640, 576]' % c['frameSize'])
    if abs(c['anchor'][0] - 0.42) > 0.04 or abs(c['anchor'][1] - 0.63) > 0.04:
        warn('anchor %s (contract ~[0.42, 0.63])' % c['anchor'])
    if not 250 <= c.get('topPx', 0) <= 340:
        err('topPx %s (want ~300)' % c.get('topPx'))
    lift = c.get('floorLiftPx', 0)
    if not 14 <= lift <= 18:
        err('floorLiftPx %s (want 14..18)' % lift)
    fp = c.get('footprintPoly', [])
    if len(fp) != 4:
        err('footprintPoly needs 4 corners')
    else:
        cx, cy = sum(p[0] for p in fp) / 4.0, sum(p[1] for p in fp) / 4.0
        if abs(cx) > 3 or abs(cy) > 3:
            err('footprintPoly centroid (%.0f, %.0f) not at the anchor' % (cx, cy))
        want = sorted([[-227, -13], [27, 113], [227, 13], [-27, -113]])
        if any(abs(a[0] - b[0]) > 4 or abs(a[1] - b[1]) > 4 for a, b in zip(sorted(fp), want)):
            err('footprintPoly %s != contract ~%s' % (fp, want))
    for f in ('layers', 'overlays', 'layerOrder', 'drawOrder', 'depthOffsets', 'alwaysDrawn', 'insideLayers',
              'reveal', 'outdoorProps', 'fade', 'cut', 'bandDepth', 'pointSlots', 'fxPoints', 'walkPoly',
              'wallCircles', 'revealPoly', 'boardRect', 'staffPoints', 'staffDirs', 'staffRoles', 'staffBands',
              'night', 'signRect'):
        if f not in c:
            err('chief_office.%s missing' % f)
    if errs:
        return report(errs, warns, notes)
    if set(c['reveal'].get('states', {})) < {'closed', 'open'}:
        err('reveal.states must have closed + open')
    else:
        so = c['reveal']['states']['open']
        if so.get('shell') != 0.12 or so.get('shell_cut') != 1.0:
            err('reveal.states.open %s must be the contract open look (shell 0.12 + stubs)' % so)
        if 'half' in c['reveal']['states']:
            err('reveal.states.half (the muddy double exposure, critique L9) must not be offered')
        if c['reveal'].get('default') != 'open':
            err('reveal.default %s (want open)' % c['reveal'].get('default'))
    if c['bandDepth'] != {'behind': -0.20, 'front': -0.05}:
        err('bandDepth %s' % c['bandDepth'])
    if c['fade'].get('openAlpha') != 0.12 or c['fade'].get('ms') != 260:
        err('fade %s (openAlpha 0.12, 260 ms)' % c['fade'])
    if set(c['alwaysDrawn']) != {'props', 'glow'}:
        err('alwaysDrawn %s' % c['alwaysDrawn'])
    # ------------------------------------------------------------------ layers
    for n, dep in LAYERS.items():
        k = '%s_%s' % (KEY, n)
        s = sp[k]
        if s.get('kind') != 'layer' or s.get('of') != KEY or s.get('layer') != n:
            err('%s: kind / of / layer wrong' % k)
        if s.get('depthOffset') != dep or c['depthOffsets'].get(k) != dep:
            err('%s: depthOffset %s (contract %s)' % (k, s.get('depthOffset'), dep))
        if s['frameSize'] != c['frameSize'] or s['anchor'] != c['anchor']:
            err('%s: frameSize / anchor differ from the building' % k)
        frame_ok(s['atlas'], s['frame'], c['frameSize'], k)
        if c['layers'].get(n) != k:
            err('layers.%s != %s' % (n, k))
    if c['frame'] != '%s_shell' % KEY:
        err('chief_office.frame should be the closed look (_shell)')
    # draw order: contract sequence
    seq = [x for x in c['drawOrder']]
    pos = {x: i for i, x in enumerate(seq)}
    for a_, b_ in (('floor', 'back'), ('back', 'interior'), ('interior', '@behind'), ('@behind', 'interior_front'),
                   ('interior_front', '@front'), ('@front', 'shell_cut'), ('shell_cut', 'shell'), ('shell', 'glow'),
                   ('glow', 'props')):
        ka = a_ if a_.startswith('@') else '%s_%s' % (KEY, a_)
        kb = b_ if b_.startswith('@') else '%s_%s' % (KEY, b_)
        if ka not in pos or kb not in pos or pos[ka] > pos[kb]:
            err('drawOrder: %s must come before %s' % (ka, kb))
    # depth offsets must be monotonic along drawOrder (so a y-sorted renderer gives the same order)
    dl = [c['depthOffsets'][x] for x in seq]
    if any(b < a for a, b in zip(dl, dl[1:])):
        err('depthOffsets are not monotonic along drawOrder: %s' % list(zip(seq, dl)))
    # ------------------------------------------------------------------ overlays
    shell_im = frame(sp['%s_shell' % KEY]['atlas'], sp['%s_shell' % KEY]['frame'])
    inside_union = None
    for n in ('floor', 'back', 'interior', 'interior_front'):
        s = sp['%s_%s' % (KEY, n)]
        b = frame(s['atlas'], s['frame']).getbbox()
        inside_union = b if inside_union is None else (min(inside_union[0], b[0]), min(inside_union[1], b[1]),
                                                       max(inside_union[2], b[2]), max(inside_union[3], b[3]))
    seat_boxes = []
    seat_px = int(round(0.45 * PX_Z))
    for fld in ('deskPoints', 'chiefDeskPoint', 'seatPoints'):
        v = c[fld]
        for p in (v if isinstance(v[0], list) else [v]):
            # sprite box of a seated person + its ground (floor) y for the depth test
            seat_boxes.append((fld, (ax + p[0] - 18, ay + p[1] - 66, ax + p[0] + 18, ay + p[1] + 4), p[1] + seat_px))
    for n, nf in OVERLAYS.items():
        k = '%s_%s' % (KEY, n)
        s = sp[k]
        o = c['overlays'].get(n, {})
        if o.get('sprite') != k or o.get('frames') != nf:
            err('overlays.%s %s' % (n, o))
        if s.get('kind') != 'overlay' or s.get('of') != KEY:
            err('%s: kind / of wrong' % k)
        if s['frameSize'] != c['frameSize'] or s['anchor'] != c['anchor']:
            err('%s: frameSize / anchor differ from the building' % k)
        frs = s.get('frames', [])
        if len(frs) != nf:
            err('%s: %d frames (want %d)' % (k, len(frs), nf))
        ims = []
        for f in frs:
            if frame_ok(s['atlas'], f, c['frameSize'], k):
                ims.append(frame(s['atlas'], f))
        if n in ('stove', 'safe') and s.get('depthOffset') != -0.25:
            err('%s: depthOffset %s (contract -0.25)' % (k, s.get('depthOffset')))
        if n not in ('stove', 'safe'):
            dep = s.get('depthOffset')
            if not (LAYERS['interior_front'] < dep < -0.05):
                err('%s: desk-top patch depthOffset %s must lie between _interior_front and @front' % (k, dep))
        if n in OVL_ANIMS:
            an, fps, rep = OVL_ANIMS[n]
            a = s.get('anims', {}).get(an)
            if not a or a.get('fps') != fps or a.get('repeat') != rep or a.get('frames') != frs:
                err('%s: anims.%s %s (want %d fps, repeat %d, all frames)' % (k, an, a, fps, rep))
        if n in OVL_STATES:
            st = s.get('states', {})
            if list(st) != OVL_STATES[n] or [st[x] for x in OVL_STATES[n]] != frs:
                err('%s: states %s' % (k, st))
        if len(ims) == nf and nf > 1:
            a0 = np.asarray(ims[0]).astype(np.int16)
            for i, im in enumerate(ims[1:], 1):
                diff = np.abs(np.asarray(im).astype(np.int16) - a0).max(-1)
                if (diff > 24).sum() < 6:
                    err('%s: frame %d is (almost) identical to frame 0' % (k, i))
        bb = None
        for im in ims:
            b = im.getbbox()
            if b:
                bb = b if bb is None else (min(bb[0], b[0]), min(bb[1], b[1]), max(bb[2], b[2]), max(bb[3], b[3]))
        if bb is None:
            err('%s: empty overlay' % k)
            continue
        if not (bb[0] >= inside_union[0] - 2 and bb[1] >= inside_union[1] - 2 and bb[2] <= inside_union[2] + 2 and
                bb[3] <= inside_union[3] + 2):
            err('%s: overlay box %s outside the inside layers %s (alignment)' % (k, bb, inside_union))
        if s.get('mode') == 'patch':
            # patches are drawn over @behind: opaque patch pixels must not cover a seated person who stands IN FRONT
            # of the patched object (ground y larger = nearer the camera); covering someone behind it is correct
            gp = s.get('groundPoint')
            if not gp:
                err('%s: groundPoint missing' % k)
                gp = [0, -10000]
            for fld, sb, gy in seat_boxes:
                if gy <= gp[1] + 2:
                    continue
                ix0, iy0, ix1, iy1 = max(bb[0], sb[0]), max(bb[1], sb[1]), min(bb[2], sb[2]), min(bb[3], sb[3])
                if ix1 > ix0 and iy1 > iy0:
                    al = np.max(np.stack([np.asarray(im)[int(iy0):int(iy1), int(ix0):int(ix1), 3] for im in ims]),
                                0)
                    n_op = int((al > 128).sum())
                    if n_op > 40:
                        err('%s: patch covers %d px of a seated person box at %s' % (k, n_op, fld))
                    elif n_op:
                        warn('%s: patch touches %d px of the seated box at %s' % (k, n_op, fld))
    # ------------------------------------------------------------------ alignment of the inside layers vs the shell
    sb = shell_im.getbbox()
    for n in ('floor', 'back', 'interior', 'interior_front', 'shell_cut'):
        s = sp['%s_%s' % (KEY, n)]
        b = frame(s['atlas'], s['frame']).getbbox()
        if not (b[0] >= sb[0] - 2 and b[1] >= sb[1] - 2 and b[2] <= sb[2] + 2 and b[3] <= sb[3] + 2):
            err('%s: opaque box %s outside the closed shell box %s' % (n, b, sb))
    # ------------------------------------------------------------------ points
    slots = c['pointSlots']

    def in_frame(p):
        return 0 <= ax + p[0] <= W and 0 <= ay + p[1] <= H
    for fld, (cnt, dfield, dset, slot) in POINTS.items():
        v = c.get(fld)
        if v is None:
            err('%s missing' % fld)
            continue
        pts = v if (v and isinstance(v[0], list)) else [v]
        if len(pts) != cnt:
            err('%s: %d points (want %d)' % (fld, len(pts), cnt))
        if dfield:
            dv = c.get(dfield)
            dl_ = dv if isinstance(dv, list) else [dv]
            if len(dl_) != len(pts) or any(x not in DIRS for x in dl_):
                err('%s: %s' % (dfield, dv))
            elif dset and any(x not in dset for x in dl_):
                err('%s: %s (contract %s)' % (dfield, dv, sorted(dset)))
        if slot and slots.get(fld) != slot:
            err('pointSlots.%s = %s (want %s)' % (fld, slots.get(fld), slot))
        for p in pts:
            if not in_frame(p):
                err('%s %s outside the frame' % (fld, p))
            if fld in OUTSIDE:
                if pip(p, fp):
                    err('%s %s is inside the footprint (it is an outside point)' % (fld, p))
                continue
            gy = p[1] + lift + (int(round(0.45 * PX_Z)) if fld in SEATED else 0)
            if not pip((p[0], gy), fp):
                err('%s %s: ground point (lift / seat removed) %s is outside the footprint' % (fld, p, (p[0], gy)))
    if c['deskDirs'] != ['SE', 'SE', 'SW', 'SE']:
        err('deskDirs %s (contract SE, SE, SW, SE)' % c['deskDirs'])
    if c['deskRoles'] != ['sem', 'bok', 'chong', 'ttal']:
        err('deskRoles %s' % c['deskRoles'])
    if len(c['staffPoints']) < 5 or not {'board', 'cabinet', 'shelf', 'safe', 'door'} <= set(c['staffRoles']):
        err('staffPoints / staffRoles %s' % c['staffRoles'])
    if not (len(c['staffPoints']) == len(c['staffDirs']) == len(c['staffRoles']) == len(c['staffBands'])):
        err('staff lists differ in length')
    for b in c['staffBands']:
        if b not in ('behind', 'front', 'outside'):
            err('staffBands value %s' % b)
    for v in slots.values():
        if v not in ('behind', 'front', 'outside'):
            err('pointSlots value %s' % v)
    # seats: two visitor seats must not sit on a desk / staff point
    # ground positions (seat height removed) in the Collision metric dx^2 + (2 dy)^2 (64 per metre)
    seat_px = int(round(0.45 * PX_Z))
    allpts = [(p, seat_px) for p in c['deskPoints']] + [(p, 0) for p in c['staffPoints']] + \
        [(c['chiefDeskPoint'], seat_px), (c['chiefDeskPad'], 0)]
    for p in c['seatPoints']:
        dmin = min(math.hypot(p[0] - q[0], 2 * ((p[1] + seat_px) - (q[1] + h))) for q, h in allpts)
        if dmin < 32:
            err('seat %s only %.0f px (ground) from a work point' % (p, dmin))
    br = c['boardRect']
    for f in ('point', 'widthPx', 'heightPx', 'shearY'):
        if f not in br:
            err('boardRect.%s missing' % f)
    if br.get('shearY') != 0.5:
        err('boardRect.shearY %s' % br.get('shearY'))
    bx, by = ax + br['point'][0], ay + br['point'][1]
    if not (br['widthPx'] / 2 < bx < W - br['widthPx'] / 2 and br['heightPx'] < by < H):
        err('boardRect outside the frame')
    if br['widthPx'] < 60:
        warn('boardRect only %d px wide' % br['widthPx'])
    fx = c['fxPoints']
    for f in ('chimney', 'kettle', 'lampDoor', 'lamps', 'windows'):
        if f not in fx:
            err('fxPoints.%s missing' % f)
    if len(fx.get('lamps', [])) != 3:
        err('fxPoints.lamps needs [chief, a, b]')
    if len(fx.get('windows', [])) < 3:
        err('fxPoints.windows needs >= 3')
    for k, v in fx.items():
        for p in (v if isinstance(v[0], list) else [v]):
            if not (0 <= ax + p[0] <= W and -40 <= ay + p[1] <= H):
                err('fxPoints.%s %s outside the frame' % (k, p))
    # walkPoly lifted: every vertex (lift removed) inside / on the footprint
    for p in c['walkPoly']:
        q = (p[0], p[1] + lift)
        if not pip(q, [[x * 1.03, y * 1.03] for x, y in fp]):
            err('walkPoly vertex %s outside the footprint' % p)
    wc = c['wallCircles']
    if not 8 <= len(wc) <= 14 or any(len(w) != 3 for w in wc):
        err('wallCircles %d (want ~10 [dx, dy, r])' % len(wc))
    door, entry = c['doorPoint'], c['entryPoint']

    def clear(px_, py_):
        """Collision-metric distance from a ground px point to the nearest circle EDGE (negative = inside)"""
        return min(math.hypot(px_ - x, 2 * (py_ - y)) - r for x, y, r in wc)
    # (polish M3) the door path (doorPoint -> entryPoint, lift removed) passes for an agent of radius AGENT
    for k in range(21):
        t = k / 20.0
        mx = door[0] + (entry[0] - door[0]) * t
        my = door[1] + (entry[1] + lift - door[1]) * t
        if clear(mx, my) < AGENT:
            err('wallCircles block the door path at (%.0f, %.0f): clearance %.0f px < agent %d' % (mx, my, clear(mx, my),
                                                                                                  AGENT))
            break
    # every standing work spot (+ lift) clear by the agent radius; seat floor points clear by half of it
    stand = [('staff.' + r_, p_) for r_, p_ in zip(c['staffRoles'], c['staffPoints'])] + \
        [('chiefDeskPad', c['chiefDeskPad']), ('stovePoint', c['stovePoint'])]
    for nm, p_ in stand:
        cl = clear(p_[0], p_[1] + lift)
        if cl < AGENT:
            err('%s %s: wall circle clearance %.0f px < agent radius %d (collision pushes the actor off it)' % (
                nm, p_, cl, AGENT))
    for fld in ('deskPoints', 'seatPoints', 'chiefDeskPoint'):
        v = c[fld]
        for p_ in (v if isinstance(v[0], list) else [v]):
            cl = clear(p_[0], p_[1] + lift + int(round(0.45 * PX_Z)))
            if cl < AGENT / 2:
                err('%s %s: seat floor point only %.0f px from a wall circle' % (fld, p_, cl))
    # the walls are closed for an agent except at the door: every footprint-edge sample within r + AGENT of a circle
    fpm = [(-2.8, -2.2), (2.8, -2.2), (2.8, 2.2), (-2.8, 2.2)]
    dxm = c.get('doorGapM') or [-2.14, -1.06]
    gaps = 0
    for (x0_, y0_), (x1_, y1_) in zip(fpm, fpm[1:] + fpm[:1]):
        n_ = 120
        for k in range(n_ + 1):
            X = x0_ + (x1_ - x0_) * k / n_
            Y = y0_ + (y1_ - y0_) * k / n_
            if abs(Y + 2.2) < 1e-6 and dxm[0] <= X <= dxm[1]:
                continue
            gx, gy = (X + Y) * PX_X, (X - Y) * PX_Y
            if clear(gx, gy) > AGENT - 2:
                gaps += 1
    if gaps:
        err('wallCircles leave %d wall samples open for an agent (walk-through walls)' % gaps)
    rp = c['revealPoly']
    if len(rp) < 5:
        err('revealPoly too small')
    a = np.asarray(shell_im)[..., 3]
    ys, xs = np.nonzero(a > 200)
    sample = list(zip(xs[::997], ys[::997]))
    miss = sum(1 for x, y in sample if not pip((x - ax, y - ay), rp))
    if miss > len(sample) * 0.03:
        err('revealPoly misses %d of %d opaque shell samples' % (miss, len(sample)))
    for f in ('lightPoints', 'lightPointsOpen'):
        if not c['night'].get(f):
            err('night.%s missing' % f)
    if c['night'].get('glow') != '%s_glow' % KEY:
        err('night.glow')
    op = c['outdoorProps']
    if not op or op[0].get('sprite') != 'office_mailbox' or len(op[0].get('point', [])) != 2:
        err('outdoorProps must list office_mailbox with its point')
    elif pip(op[0]['point'], fp):
        err('office_mailbox point inside the footprint')
    sr = c['signRect']
    if not in_frame(sr['point']):
        err('signRect point outside the frame')
    # ------------------------------------------------------------------ mailbox
    m = sp['office_mailbox']
    if m.get('kind') != 'prop':
        err('office_mailbox.kind %s' % m.get('kind'))
    fl, po = m.get('anims', {}).get('flag'), m.get('anims', {}).get('pop')
    if not fl or len(fl['frames']) != 2:
        err('office_mailbox anims.flag must have 2 frames')
    if not po or len(po['frames']) != 3 or po.get('fps') != 12:
        err('office_mailbox anims.pop must have 3 frames at 12 fps')
    for an in (fl, po):
        for f in (an or {}).get('frames', []):
            frame_ok(m['atlas'], f, m['frameSize'], 'office_mailbox')
    mW, mH = m['frameSize']
    max_, may_ = m['anchor'][0] * mW, m['anchor'][1] * mH
    slp = m.get('slotPoint')
    if not slp or not (0 <= max_ + slp[0] <= mW and 0 <= may_ + slp[1] <= mH):
        err('office_mailbox slotPoint %s outside the frame' % slp)
    if not 50 <= m.get('topPx', 0) <= 75:
        err('office_mailbox topPx %s (1.1 m ~ 61 px)' % m.get('topPx'))
    # (polish M4) "mail!" must read: the raised flag stands >= 10 px above the box's top in the down frame, and the
    # down flag adds nothing above it
    tops = {}
    for f in ('office_mailbox', 'office_mailbox_flag_1'):
        al = np.asarray(frame(m['atlas'], f))[..., 3] > 100
        tops[f] = int(np.nonzero(al.any(1))[0].min()) if al.any() else 0
    rise = tops['office_mailbox'] - tops['office_mailbox_flag_1']
    notes.append('mailbox flag up rises %d px above the down silhouette' % rise)
    if rise < 10:
        err('office_mailbox: the raised flag rises only %d px above the down frame (M4: >= 10)' % rise)
    # ------------------------------------------------------------------ items
    for k in ITEMS:
        s = sp[k]
        if s['frameSize'] != [72, 72] or s['anchor'] != [0.5, 0.86] or s.get('kind') != 'item':
            err('%s: item frame / anchor / kind wrong' % k)
        for f in ('stackStep', 'carryScale', 'icon'):
            if s.get(f) in (None, False):
                err('%s: %s missing' % (k, f))
        if frame_ok(s['atlas'], s['frame'], [72, 72], k):
            im = np.asarray(frame(s['atlas'], s['frame']))[..., 3]
            if im[-1].max() > 8 or im[:, 0].max() > 8 or im[:, -1].max() > 8 or im[0].max() > 8:
                err('%s: content touches the frame edge' % k)
            ys, xs = np.nonzero(im > 40)
            if xs.max() - xs.min() < 24:
                err('%s: only %d px wide (unreadable)' % (k, xs.max() - xs.min()))
    # (polish L3) the coin sacks read by size: >= +30 % width per step
    wd = []
    for k in ('item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l'):
        al = np.asarray(frame(sp[k]['atlas'], sp[k]['frame']))[..., 3] > 40
        xs_ = np.nonzero(al.any(0))[0]
        wd.append(int(xs_.max() - xs_.min() + 1))
    notes.append('coin sack widths S/M/L %s px' % wd)
    if not (wd[1] >= wd[0] * 1.3 and wd[2] >= wd[1] * 1.3):
        err('coin sacks S/M/L %s px: want >= +30 %% per step (L3)' % wd)
    # ------------------------------------------------------------------ collisions with other fragments
    mine = set(sp)
    my_atl = {a['key'] for a in man['atlases']}
    for mf in glob.glob(os.path.join(GAME, 'assets', '*', 'manifest.json')):
        frag = os.path.basename(os.path.dirname(mf))
        if os.path.abspath(os.path.dirname(mf)) == os.path.abspath(d):
            continue
        try:
            om = json.load(open(mf, encoding='utf-8'))
        except Exception:                       # noqa: BLE001
            continue
        osp = om.get('sprites', {}) if isinstance(om.get('sprites'), dict) else {}
        for k in mine & set(osp):
            err('key %s collides with assets/%s' % (k, frag))
        for k in my_atl & {a.get('key') for a in om.get('atlases', []) if isinstance(a, dict)}:
            err('atlas key %s collides with assets/%s' % (k, frag))
    # ------------------------------------------------------------------ (polish) the game's renderer, simulated
    # H1: src/entities/Cutaway.js draws every cutaway.drawOrder name at base + 0.01 * i; fade.layer at its alpha,
    # cut.layer only while revealed, cutaway.layers.interior / .back / .front only while revealed, everything else
    # ALWAYS.  Closed by day that must equal the documented closed look (_shell + _props) pixel for pixel; the v5
    # BankBuilding (every layer always, stub alpha 0) likewise.
    cw = c.get('cutaway', {})
    if '%s_glow' % KEY in cw.get('drawOrder', []):
        err('cutaway.drawOrder lists the night glow: Cutaway.js would draw it by day')
    if '%s_glow' % KEY not in cw.get('night', []):
        err('cutaway.night must list %s_glow' % KEY)
    cl_ = cw.get('layers', {})
    if cl_.get('front') != '%s_interior_front' % KEY:
        err('cutaway.layers.front must name the desk layer (Cutaway.js hides interior / back / front only)')

    def comp(names, alpha_of):
        acc = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for n_ in names:
            sp_ = sp.get(n_)
            if not sp_:
                continue
            a_ = alpha_of(n_)
            if a_ <= 0:
                continue
            im_ = frame(sp_['atlas'], sp_['frame'])
            if a_ < 1:
                arr = np.asarray(im_).astype(np.float32)
                arr[..., 3] *= a_
                im_ = Image.fromarray(arr.astype(np.uint8), 'RGBA')
            acc.alpha_composite(im_)
        return acc

    def on(bg, im_):
        b_ = Image.new('RGBA', (W, H), bg)
        b_.alpha_composite(im_)
        return np.asarray(b_).astype(np.int16)
    order = [n_ for n_ in cw.get('drawOrder', []) if not n_.startswith('@')]
    hidden = {cl_.get('interior'), cl_.get('back'), cl_.get('front')}
    fade_l, cut_l = cw.get('fade', {}).get('layer'), cw.get('cut', {}).get('layer')
    doc_closed = comp(['%s_shell' % KEY, '%s_props' % KEY], lambda n_: 1.0)
    game_closed = comp(order, lambda n_: 0.0 if (n_ == cut_l or n_ in hidden) else 1.0)
    bank_closed = comp(order, lambda n_: 0.0 if n_ == cut_l else 1.0)
    for what, im_ in (('Cutaway.js', game_closed), ('BankBuilding (all layers)', bank_closed)):
        worst = 0
        for bg in ((128, 128, 128, 255), (244, 247, 251, 255), (40, 44, 60, 255)):
            dif = np.abs(on(bg, im_) - on(bg, doc_closed)).max(-1)
            worst = max(worst, int((dif > 4).sum()))
        notes.append('closed look via %s: %d px differ from _shell + _props' % (what, worst))
        if worst > 12:
            err('closed look via %s differs from the documented closed look in %d px (H1)' % (what, worst))
    # the open shadow only shows while revealed: _floor has nothing outside the opaque closed shell
    fl_a = np.asarray(frame(sp['%s_floor' % KEY]['atlas'], sp['%s_floor' % KEY]['frame']))[..., 3] > 8
    sh_a = np.asarray(shell_im)[..., 3] > 247
    out_px = int((fl_a & ~sh_a).sum())
    if out_px > 12:
        err('_floor has %d px outside the opaque closed shell (it is drawn always by Cutaway.js)' % out_px)
    # ------------------------------------------------------------------ H2: faces behind the cut walls / desks
    def opaque(n_, f_=None):
        sp_ = sp[n_]
        return np.asarray(frame(sp_['atlas'], f_ or sp_['frame']))[..., 3] > 128
    cut_m = opaque('%s_shell_cut' % KEY)
    desk_m = opaque('%s_interior_front' % KEY)
    for n_ in ('typewriter_a', 'lamp_a', 'lamp_b', 'typewriter_b', 'phone'):
        desk_m = desk_m | opaque('%s_%s' % (KEY, n_))
    seat_px = int(round(0.45 * PX_Z))
    people = []
    bands_ = c.get('deskBands') or []
    if len(bands_) != len(c['deskPoints']) or any(b_ not in ('behind', 'front') for b_ in bands_):
        err('deskBands %s (one behind / front per desk point)' % bands_)
        bands_ = ['behind'] * len(c['deskPoints'])
    for i_, p_ in enumerate(c['deskPoints']):
        people.append(('desk_' + c['deskRoles'][i_], p_, True, bands_[i_]))
    people.append(('chiefDesk', c['chiefDeskPoint'], True, 'behind'))
    for i_, p_ in enumerate(c['seatPoints']):
        people.append(('visitor%d' % i_, p_, True, 'front'))
    for r_, p_, b_ in zip(c['staffRoles'], c['staffPoints'], c['staffBands']):
        people.append(('staff.' + r_, p_, False, b_))
    people.append(('chiefDeskPad', c['chiefDeskPad'], False, 'front'))
    hb = []
    for nm, p_, seated, band in people:
        x_, y_ = int(round(ax + p_[0])), int(round(ay + p_[1]))
        # the HEAD (+ shoulders): the top 30 px of a seated person (sprite top ~66 px above the seat point), the top
        # 40 px of a standing one (~100 px tall); lower down, a desk top / wall stub in front of the body is expected
        y0_, y1_ = (y_ - 66, y_ - 36) if seated else (y_ - 100, y_ - 60)
        box_ = (slice(max(0, y0_), max(0, y1_)), slice(max(0, x_ - 20), max(0, x_ + 20)))
        m_ = cut_m | desk_m if band == 'behind' else cut_m
        cov = float(m_[box_].mean()) if m_[box_].size else 0.0
        hb.append('%s %.0f%%' % (nm, cov * 100))
        if cov > 0.10:
            err('%s %s: %.0f%% of the head box is covered by %s (H2: <= 10%%)' % (
                nm, p_, cov * 100, '_shell_cut + desks' if band == 'behind' else '_shell_cut'))
    notes.append('head boxes covered: ' + ', '.join(hb))
    # ------------------------------------------------------------------ M1 / M2 / L1: layout in building metres
    def to_m(p_, h_):
        gx, gy = p_[0], p_[1] + h_
        s_, t_ = gx / PX_X, gy / PX_Y
        return ((s_ + t_) / 2.0, (s_ - t_) / 2.0)
    furn = c.get('furnitureM') or []
    if not furn:
        err('furnitureM missing (inside furniture footprints)')

    def box_dist(q, b_):
        dx_ = max(b_[0] - q[0], 0.0, q[0] - b_[2])
        dy_ = max(b_[1] - q[1], 0.0, q[1] - b_[3])
        return math.hypot(dx_, dy_)
    seats_m = [to_m(p_, lift + seat_px) for p_ in c['seatPoints']]
    if len(seats_m) == 2:
        gap_ = math.hypot(seats_m[0][0] - seats_m[1][0], seats_m[0][1] - seats_m[1][1])
        notes.append('visitor seats %.2f m apart' % gap_)
        if gap_ < 0.7:
            err('visitor seats only %.2f m apart (M1: >= 0.7 m, two seated heads overlap)' % gap_)
    for i_, (sx_, sy_) in enumerate(seats_m):
        # the leg space: 0.5 m wide, 0.45 m deep in front of the seat (seats face -Y)
        leg = (sx_ - 0.25, sy_ - 0.45, sx_ + 0.25, sy_ - 0.02)
        for f_ in furn:
            b_ = f_['box']
            if b_[0] < leg[2] and leg[0] < b_[2] and b_[1] < leg[3] and leg[1] < b_[3]:
                err('visitor seat %d: %s stands in the leg space %s (M1)' % (i_, f_['name'], [round(v, 2) for v in leg]))
    for nm, p_ in [('chiefDeskPad', c['chiefDeskPad'])] + [('staff.' + r_, p_) for r_, p_ in
                                                            zip(c['staffRoles'], c['staffPoints'])]:
        q = to_m(p_, lift)
        for f_ in furn:
            if f_['top'] < 0.3:
                continue
            dmin = 0.35 if (nm == 'chiefDeskPad' and f_['layer'] == 'interior') else 0.12
            dd = box_dist(q, f_['box'])
            if dd < dmin:
                err('%s at (%.2f, %.2f) m is only %.2f m from %s (%s; want >= %.2f)' % (nm, q[0], q[1], dd, f_['name'],
                                                                                        f_['layer'], dmin))
    pm_ = {r_: to_m(p_, lift) for r_, p_ in zip(c['staffRoles'], c['staffPoints'])}
    pm_['stove'] = to_m(c['stovePoint'], lift)
    pm_['ttal'] = to_m(c['deskPoints'][3], lift + seat_px)
    pm_['chief'] = to_m(c['chiefDeskPoint'], lift + seat_px)
    for a_, b_ in (('shelf', 'stove'), ('board', 'ttal'), ('board', 'safe'), ('board', 'chief'), ('safe', 'ttal')):
        dd = math.hypot(pm_[a_][0] - pm_[b_][0], pm_[a_][1] - pm_[b_][1])
        notes.append('spots %s - %s %.2f m' % (a_, b_, dd))
        if dd < 0.75:
            err('work spots %s and %s only %.2f m apart (L1: >= 0.75 m when both can be busy)' % (a_, b_, dd))
    # ------------------------------------------------------------------ M5: the safe shows its treasure + clears the stub
    sf0, sf1 = sp['%s_safe' % KEY]['frames'][:2]
    base_in = comp(['%s_interior' % KEY], lambda n_: 1.0)
    shut, opened = base_in.copy(), base_in.copy()
    shut.alpha_composite(frame(sp['%s_safe' % KEY]['atlas'], sf0))
    opened.alpha_composite(frame(sp['%s_safe' % KEY]['atlas'], sf1))
    door_m = np.asarray(frame(sp['%s_safe' % KEY]['atlas'], sf0))[..., 3] > 128
    oa = np.asarray(opened).astype(np.int16)
    gold = (oa[..., 0] > 170) & (oa[..., 1] > 120) & (oa[..., 2] < 120) & (oa[..., 3] > 200) & door_m
    notes.append('safe open: %d gold px where the shut door was; door covered by the stubs %.0f%%' % (
        int(gold.sum()), 100.0 * float((door_m & cut_m).sum()) / max(1, int(door_m.sum()))))
    if gold.sum() < 25:
        err('the open safe shows only %d gold px inside (M5: coins + a gold bar)' % int(gold.sum()))
    if float((door_m & cut_m).sum()) / max(1, int(door_m.sum())) > 0.25:
        err('the right wall stub covers > 25 %% of the safe door in the open view (M5)')
    notes.append('chief_office frame %dx%d anchor %s topPx %d floorLiftPx %d; %d sprites' % (
        W, H, c['anchor'], c['topPx'], lift, len(sp)))
    return report(errs, warns, notes)


def report(errs, warns, notes):
    for n in notes:
        print('note   ', n)
    for w in warns:
        print('WARNING', w)
    for e in errs:
        print('ERROR  ', e)
    print('off_check: %d error(s), %d warning(s)' % (len(errs), len(warns)))
    return 1 if errs else 0


if __name__ == '__main__':
    sys.exit(main())
