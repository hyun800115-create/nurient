"""
veh_pack.py - turn the raw vehicle renders (veh_render.py cache) into assets/vehicles/: trimmed Phaser atlases
(each sheet <= 2048 px) + manifest.json, plus the previews docs/previews/veh_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/veh_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
                                      [--out DIR] [--prev DIR]        (dry runs: write somewhere else)

Guard + merge (like bld_pack / town_pack): the packer MERGES into the existing assets/vehicles/manifest.json
(unknown top-level fields and extra fields inside entries are kept, generated fields win) and REFUSES (exit 1,
nothing written) when a key of the current manifest (sprites or characters) or of veh_check.REQUIRED has no
complete render in the cache, because rebuilding the atlases would drop it.  --allow-partial packs what is cached
and drops the missing keys on purpose.  An empty manifest is never written.

Steps
  1. vehicles: <cache>/<key>/meta.json + frames.  Every colour frame gets the characters' 1 px ink outline
     (char_pack.ink_outline).  Vehicles with seats also get OVERLAY frames over_<anim>_<dir>_<i> =
     outlined frame x clip(pall - pvis) (the body parts in front of a seated passenger, see veh_render).
  2. buildings: <cache>/<build>.json sidecars (bld_render format), the village-building shadow post
     (pack_utils.clean_alpha + prop_pack.tint_shadow + prop_pack.border_fade).
  3. atlases: one per vehicle (veh_<key>; the overlay frames go to veh_<key>_over when the sheet would pass
     2048 px) and veh_street / veh_depots / veh_lots / veh_signs for the buildings (split _2 .. at 2048);
     palettised with libimagequant (256 colours, dither 0.6) by default.
  4. manifest: characters{} (vehicles, kind "vehicle") + sprites{} (buildings) + vehicleFamilies + eras.
  5. previews: veh_all.png (labelled), veh_scene.png (street composite), veh_move_era2.gif, veh_move_era3.gif,
     veh_siren.gif, veh_chief.gif, veh_passengers.png (seat / overlay demo).
"""
import json
import math
import os
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'vehicles')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 7.0
DIRS = ['SE', 'NE']
MIRROR = {'SW': 'SE', 'NW': 'NE'}
AXIS_DIRS = {'X+': 'SE', 'Y+': 'NE', 'Y-': 'SW', 'X-': 'NW'}
BLD_ATLAS_ORDER = ['veh_depots', 'veh_street', 'veh_lots', 'veh_signs']
POINT_SINGLE = {'stop': 'stopPoint', 'door': 'doorPoint'}
POINT_LIST = {'stall': 'stallPoints', 'bay': 'bayPoints', 'wait': 'waitPoints', 'seat': 'seatPoints',
              'board': 'boardPoints', 'staff': 'staffPoints', 'pump': 'pumpPoints'}
DIR_FIELD = {'stall': 'stallDirs', 'bay': 'bayDirs', 'wait': 'waitDirs', 'seat': 'seatDirs', 'board': 'boardDirs',
             'staff': 'staffDirs', 'stop': 'stopDir', 'door': 'doorDir'}
VEH_POINTS = ['cargoPoint', 'doorPoints', 'exhaustPoint', 'steamPoint', 'lightPoints', 'tailPoints', 'sirenPoint',
              'boardPoint', 'hosePoint', 'rearDoorPoint']
SQ5 = math.sqrt(45.2548 ** 2 + 22.6274 ** 2)       # px per metre along an iso axis on screen (50.6)


# --------------------------------------------------------------------------- load

def veh_frame_names(m):
    return ['%s_%s_%d' % (a, d, i) for a, info in m['anims'].items() for d in DIRS for i in range(info['frames'])]


def load(cache):
    vehicles, builds = {}, {}
    if not os.path.isdir(cache):
        return vehicles, builds
    for fn in sorted(os.listdir(cache)):
        p = os.path.join(cache, fn)
        if os.path.isdir(p) and os.path.exists(os.path.join(p, 'meta.json')):
            m = json.load(open(os.path.join(p, 'meta.json')))
            names = veh_frame_names(m)
            need = [n + '.png' for n in names]
            if m.get('masks'):
                need += ['p%s_%s.png' % (k, n) for n in names for k in ('all', 'vis')]
            if all(os.path.exists(os.path.join(p, f)) for f in need):
                m['names'] = names
                vehicles[fn] = m
            else:
                print('note: %s has missing frames - not packed' % fn)
        elif fn.endswith('.json'):
            try:
                m = json.load(open(p))
            except Exception:
                continue
            if 'build' in m and 'frames' in m and all(os.path.exists(os.path.join(cache, n + '.png'))
                                                      for n in m['frames']):
                builds[m['build']] = m
    return vehicles, builds


def veh_images(cache, key, m):
    import char_pack as cp      # read-only reuse of the characters' ink outline
    base, over = {}, {}
    for n in m['names']:
        im = cp.ink_outline(Image.open(os.path.join(cache, key, n + '.png')))
        base[n] = im
        if m.get('masks'):
            pa = np.asarray(Image.open(os.path.join(cache, key, 'pall_%s.png' % n)).convert('RGBA'))[..., 3]
            pv = np.asarray(Image.open(os.path.join(cache, key, 'pvis_%s.png' % n)).convert('RGBA'))[..., 3]
            mask = np.clip((pa.astype(np.float32) - pv.astype(np.float32)) / 255.0, 0, 1)
            mask[mask < 0.04] = 0.0
            a = np.asarray(im).astype(np.float32)
            a[..., 3] *= mask
            a[a[..., 3] < 2] = 0
            over['over_' + n] = Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    return base, over


def bld_images(cache, m):
    out = {}
    for n in m['frames']:
        im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
        if m.get('shadow', True):
            im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
        else:
            im = pu.clean_alpha(im, floor=3)
        out[n] = im
    return out


# --------------------------------------------------------------------------- manifest entries

def mirror_note():
    return ('px offsets are for the rendered dirs; for a mirrored dir (SW <- SE, NW <- NE) negate dx and flip the '
            'sprite (setFlipX); seatDirs mirror SE<->SW, NE<->NW')


def veh_entry(k, m, atlas_key, over_key):
    W, H = m['frameSize']
    anims = {}
    for a, info in m['anims'].items():
        e = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info.get('repeat', -1)}
        e['bobPx'] = [-int(v) for v in info.get('bob', [0] * info['frames'])][:info['frames']]
        if info.get('spin'):
            e['wheels'] = True
        if info.get('blink'):
            e['beacons'] = True
        if info.get('smoke'):
            e['steam'] = True
        anims[a] = e
    L_, Wd = m['lengthM'], m['widthM']
    shadow = {'SE': [int(round(L_ * SQ5 * 0.98)), int(round(Wd * 40.5 * 1.05)), 26.57],
              'NE': [int(round(L_ * SQ5 * 0.98)), int(round(Wd * 40.5 * 1.05)), -26.57]}
    e = {'atlas': atlas_key, 'frameSize': [W, H], 'anchor': m['anchor'], 'dirs': DIRS, 'mirror': MIRROR,
         'axisDirs': AXIS_DIRS, 'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'vehicle',
         'era': m['era'], 'family': m['family'], 'variant': m.get('variant'), 'lengthM': L_, 'widthM': Wd,
         'heightM': m['heightM'], 'topPx': m['topPx'], 'headTop': -m['topPx'], 'shadow': shadow,
         'footprintPoly': m['footprintPoly'],
         'wheels': {'radiusM': m.get('wheelR'), 'turnsPerLoopDeg': round(360.0 / m.get('wheelSym', 3) *
                                                                        m.get('wheelTurnsPerLoop', 1), 1)},
         'notes': m.get('notes', '')}
    for f in VEH_POINTS:
        if f in m:
            e[f] = m[f]
    if 'seats' in m:
        e['seats'] = m['seats']
        e['seatDirs'] = m['seatDirs']
        e['seatsStand'] = m['seatsStand']
        e['seatDrawOrder'] = m['seatDrawOrder']
        e['seatNames'] = m['seatNames']
        e['driverSeat'] = m.get('driverSeat', 0)
    else:
        e['seats'] = {d: [] for d in DIRS}
        e['driverSeat'] = None
    if m.get('masks'):
        e['overlay'] = {'atlas': over_key, 'frameName': 'over_{anim}_{dir}_{i}'}
    if m.get('crew'):
        e['crew'] = m['crew']
    return e


def bld_entries(k, m, frame_atlas):
    out = {}
    first = m['frames'][0]
    pts_all = m.get('framePoints', {})
    dirs_all = m.get('frameDirs', {})
    sprites = m.get('sprites') or {k: {'frame': first}}
    for skey, sd in sprites.items():
        fr = sd['frame']
        s = {'atlas': frame_atlas[fr], 'frame': fr, 'anchor': m['anchor'], 'kind': m['kind'],
             'frameSize': m['frameSize']}
        if 'footprint' in m:
            s['footprint'] = m['footprint']
            s['footprintM'] = m['footprintM']
            fm = m['footprintM']
            if isinstance(fm, list) and len(fm) == 2:
                a, b = fm
                yaw = math.radians(m.get('yaw', 0.0))
                poly = []
                for lx, ly in ((-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)):
                    x = lx * math.cos(yaw) - ly * math.sin(yaw)
                    y = lx * math.sin(yaw) + ly * math.cos(yaw)
                    poly.append([int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274))])
                s['footprintPoly'] = poly
        tp = m['topPx']
        s['topPx'] = tp.get(fr, tp.get(first)) if isinstance(tp, dict) else tp
        if m.get('front'):
            s['front'] = m['front']
        for f in ('name', 'era', 'stallSizeM', 'layer', 'boardPx', 'boardShape'):
            if f in m:
                s[f] = m[f]
        if 'fxPoints' in m:
            s['fxPoints'] = m['fxPoints']
        fp_ = pts_all.get(fr, {})
        fd_ = dirs_all.get(fr, {})
        for kind, field in POINT_SINGLE.items():
            if fp_.get(kind):
                s[field] = fp_[kind][0]
                if fd_.get(kind):
                    s[DIR_FIELD[kind]] = fd_[kind][0]
        for kind, field in POINT_LIST.items():
            if fp_.get(kind):
                s[field] = fp_[kind]
                if fd_.get(kind):
                    s[DIR_FIELD[kind]] = fd_[kind]
        for f in ('state', 'stage'):
            if f in sd:
                s[f] = sd[f]
        if len(sprites) > 1:
            s['states'] = [v['frame'] for v in sprites.values() if v['frame'] != fr or True]
            s['states'] = list(dict.fromkeys(s['states']))
        if sd.get('anims'):
            s['anims'] = {a: dict(v) for a, v in sd['anims'].items()}
        if m.get('notes'):
            s['notes'] = m['notes']
        out[skey] = s
    return out


CONVENTIONS = {
    'ppu': 64,
    'vehicles': 'characters{} entries with kind "vehicle": 2 rendered headings along the iso ground axes + flipX '
                'mirrors: SE = world +X (front + right side visible), NE = world +Y (rear + right side); SW <- SE '
                '(world -Y), NW <- NE (world -X) with setFlipX (axisDirs maps world axes to dirs). Frame names '
                '{anim}_{dir}_{i}; anchor = ground point under the vehicle centre (depth sort by it; footprintPoly '
                '[dir] = the 4 ground corners in px for better sorting / picking of long vehicles). NO baked shadow: '
                'draw a soft ellipse shadow[dir] = [w, h, angleDeg] (rotated ellipse along the heading; negate the '
                'angle for mirrored dirs) on the ground under the anchor. 1 px ink outline like the characters.',
    'anims': 'idle (engine shake / horses breathing / steam), move (wheels turn, hooves trot, steam puffs), siren '
             '(emergency vehicles standing with beacons). bobPx[i] = how many px the sprung body is lifted in frame i '
             '(<= 0, already baked) - apply the same y offset to drawn passengers / cargo for a perfect fit '
             '(optional, 1 px). wheels.turnsPerLoopDeg / radiusM -> no-slip speed = radiusM * rad(turns) * fps / '
             'frames m/s (cosmetic: any speed reads fine).',
    'seats': 'seats[dir] = px offsets of each seat surface FRONT-CENTRE = the anchor of a character in a `sit` frame '
             '(villagers / townsfolk2 convention, seat height 0.45 m); seatDirs[dir] = the facing (S/SE/E/SW/W/N/NE/'
             'NW). For facings without a sit frame (NE/NW = backs) draw the idle frame of that dir at seatsStand[dir] '
             '(the body below the window is hidden by the overlay anyway). driverSeat = index of the driver (null if '
             'the driver is baked, e.g. truck_cargo_chief). seatDrawOrder[dir] = seat indices back-to-front.',
    'overlay': 'Vehicles with seats have overlay frames (overlay.atlas, over_{anim}_{dir}_{i}: same frameSize + '
               'anchor as the colour frame, same flipX). Draw order for one vehicle: colour frame -> passengers '
               '(seatDrawOrder, at seats / seatsStand + bobPx) -> overlay frame. The overlay holds exactly the body '
               'parts that are in front of a seated passenger (doors, window frames, roof edge, dashboard sides) so '
               'heads show through the windows and legs disappear inside. Without passengers you can skip it.',
    'points': 'px offsets [dx, dy] from the anchor per rendered dir (mirror: negate dx). cargoPoint = [dx, dy, '
              'behind] bottom of a cargo / item stack (behind=false: draw the stack after the vehicle); doorPoints = '
              'ground spots beside the doors (getting in / out); lightPoints / tailPoints = head / tail lamp centres '
              '(night glow sprites); exhaustPoint / steamPoint = puff emitter; sirenPoint = beacon centre.',
    'buildings': 'sprites{} entries (prop conventions): baked soft shadow, anchor = footprint centre, front -Y = '
                 'screen down-left. stallPoints/stallDirs = where a parked vehicle ANCHOR goes and its heading; '
                 'bayPoints/bayDirs = depot bays; stopPoint/stopDir = where the bus / sleigh-bus anchor halts at a '
                 'stop; waitPoints, seatPoints (bench, sit frames), boardPoints, staffPoints, doorPoint, pumpPoints. '
                 'Multi-state buildings share frame + anchor (bus_depot / bus_depot_open, garage_small / _open, '
                 'traffic_light_green / _yellow / _red): swap the frame. kind "decal" + layer "ground" (parking lots) '
                 '= draw on the ground layer under everything. fxPoints.board + boardPx = blank boards for game text.',
}


def build_manifest(vehicles, builds, frame_atlas, veh_atlas, atlas_keys, old):
    chars, sprites = {}, {}
    order = sorted(vehicles, key=lambda k: (vehicles[k]['era'], k))
    for k in order:
        chars[k] = veh_entry(k, vehicles[k], veh_atlas[k][0], veh_atlas[k][1])
    for k in sorted(builds, key=lambda k: (BLD_ATLAS_ORDER.index(builds[k]['atlas'])
                                           if builds[k]['atlas'] in BLD_ATLAS_ORDER else 99, k)):
        sprites.update(bld_entries(k, builds[k], frame_atlas))
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/veh_render.py + veh_pack.py (docs/CONTRACT_V5.md sections L + M)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'vehicles/%s.png' % a, 'json': 'vehicles/%s.json' % a} for a in atlas_keys]
    oldsp, oldch = (old or {}).get('sprites', {}), (old or {}).get('characters', {})
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    fam = {}
    for k, m in vehicles.items():
        if m.get('variant') and m['family'] != k:
            fam.setdefault(m['family'], []).append(k)
    man['vehicleFamilies'] = {f: sorted(v) for f, v in sorted(fam.items())}
    man['eras'] = {'2': sorted(k for k, m in vehicles.items() if m['era'] == 2) +
                   sorted(k for k, m in builds.items() if m.get('era') == 2),
                   '3': sorted(k for k, m in vehicles.items() if m['era'] == 3) +
                   sorted(k for k, m in builds.items() if m.get('era') == 3)}
    return man


# --------------------------------------------------------------------------- pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def pack_groups(groups):
    out = []
    for g in BLD_ATLAS_ORDER + sorted(set(groups) - set(BLD_ATLAS_ORDER)):
        if g not in groups:
            continue
        builds = sorted(groups[g], key=lambda fr: -sum(im.width * im.height for _, im in fr))
        sheets = []
        for fr in builds:
            placed = False
            for sh in sheets:
                sheet, _ = pu.pack_atlas(sh + fr, max_width=MAX_SHEET, trim=True, padding=2)
                if sheet.height <= MAX_SHEET:
                    sh.extend(fr)
                    placed = True
                    break
            if not placed:
                sheets.append(list(fr))
        for i, sh in enumerate(sheets):
            sheet, atlas = pu.pack_atlas(sh, max_width=MAX_SHEET, trim=True, padding=2)
            out.append((g if i == 0 else '%s_%d' % (g, i + 1), sheet, atlas))
    return out


def pack_all(vehicles, vimgs, builds, bimgs, mode, out_dir):
    sheets = []
    veh_atlas = {}
    for k in sorted(vehicles):
        base, over = vimgs[k]
        items = list(base.items())
        akey = 'veh_' + k
        sheet, atlas = pu.pack_atlas(items + list(over.items()), max_width=MAX_SHEET, trim=True, padding=2)
        if sheet.height <= MAX_SHEET:
            sheets.append((akey, sheet, atlas))
            veh_atlas[k] = (akey, akey if over else None)
        else:
            sheet, atlas = pu.pack_atlas(items, max_width=MAX_SHEET, trim=True, padding=2)
            sheets.append((akey, sheet, atlas))
            if over:
                s2, a2 = pu.pack_atlas(list(over.items()), max_width=MAX_SHEET, trim=True, padding=2)
                sheets.append((akey + '_over', s2, a2))
            veh_atlas[k] = (akey, akey + '_over' if over else None)
    groups = {}
    for k, m in builds.items():
        groups.setdefault(m['atlas'], []).append([(n, bimgs[n]) for n in m['frames']])
    sheets += pack_groups(groups)
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('veh_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(out_dir, exist_ok=True)
    for fn in os.listdir(out_dir):
        if fn.startswith('veh_') and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(out_dir, fn))
    total = 0
    sizes = {}
    for akey, sheet, atlas in sheets:
        png = os.path.join(out_dir, akey + '.png')
        pu.save_atlas(sheet, atlas, png, os.path.join(out_dir, akey + '.json'), quantize=False)
        total += os.path.getsize(png) + os.path.getsize(os.path.join(out_dir, akey + '.json'))
    do_q = mode == 'on' or (mode == 'auto' and total / 1048576.0 > BUDGET_MB * 0.9)
    if do_q:
        try:
            total = 0
            for akey, sheet, atlas in sheets:
                png = os.path.join(out_dir, akey + '.png')
                quantize(sheet).save(png, optimize=True)
                total += os.path.getsize(png) + os.path.getsize(os.path.join(out_dir, akey + '.json'))
            print('  palettised with libimagequant (256 colours, dither 0.6)')
        except ImportError:
            print('  imagequant not installed -> kept RGBA (pip install imagequant)')
    frame_atlas = {}
    for akey, sheet, atlas in sheets:
        sizes[akey] = os.path.getsize(os.path.join(out_dir, akey + '.png'))
        for n in atlas['frames']:
            frame_atlas[n] = akey
        print('%-26s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return sheets, frame_atlas, veh_atlas, total


# --------------------------------------------------------------------------- guard

def guard(cache, have, need, in_manifest, allow_partial):
    have = set(have)
    if not have:
        raise SystemExit('veh_pack: ABORT - no complete renders in the cache %s; nothing was written (an empty '
                         'manifest is never written). Run veh_render.py first. / 렌더 캐시가 비어 있습니다.' % cache)
    missing = sorted(set(need) - have)
    if not missing:
        return []
    if allow_partial:
        print('veh_pack: WARNING --allow-partial: dropping %d key(s) that are not in the cache: %s'
              % (len(missing), ' '.join(missing)))
        return missing
    raise SystemExit('veh_pack: ABORT - %d key(s) of the current manifest / veh_check.REQUIRED are missing from the '
                     'render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n  fix: '
                     '/tmp/bvenv/bin/python tools/blender/veh_render.py -- <keys>  (or --allow-partial to drop them) '
                     '/ 캐시에 없는 키가 있어 중단합니다.' % (len(missing), cache, ' '.join(missing)))


# --------------------------------------------------------------------------- main

def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'vehicles')
    mode, previews, partial = 'on', True, False
    out_dir, prev_dir = OUT, PREV
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--cache':
            cache = argv[i + 1]
            i += 1
        elif a == '--quantize':
            mode = argv[i + 1]
            i += 1
        elif a == '--no-previews':
            previews = False
        elif a == '--allow-partial':
            partial = True
        elif a == '--out':
            out_dir = argv[i + 1]
            i += 1
        elif a == '--prev':
            prev_dir = argv[i + 1]
            i += 1
        i += 1
    vehicles, builds = load(cache)
    have = set(vehicles)
    for m in builds.values():
        have |= set((m.get('sprites') or {m['build']: {}}).keys())
    import veh_check as vc
    man_path = os.path.join(out_dir, 'manifest.json')
    old = json.load(open(man_path)) if os.path.exists(man_path) else None
    in_manifest = set((old or {}).get('characters', {})) | set((old or {}).get('sprites', {}))
    guard(cache, have, in_manifest | set(vc.REQUIRED), in_manifest, partial)
    vimgs = {k: veh_images(cache, k, m) for k, m in vehicles.items()}
    bimgs = {}
    for m in builds.values():
        bimgs.update(bld_images(cache, m))
    sheets, frame_atlas, veh_atlas, total = pack_all(vehicles, vimgs, builds, bimgs, mode, out_dir)
    keys = [a for a, _, _ in sheets]
    man = build_manifest(vehicles, builds, frame_atlas, veh_atlas, keys, old)
    if not man['characters'] and not man['sprites']:
        raise SystemExit('veh_pack: refusing to write an empty manifest')
    with open(man_path, 'w') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('assets/vehicles: %d vehicles, %d sprites, %d atlases, payload %.2f MB (budget %.1f MB)'
          % (len(man['characters']), len(man['sprites']), len(keys), total / 1048576.0, BUDGET_MB))
    if previews:
        import veh_preview as vp
        vp.make_all(out_dir, prev_dir)


if __name__ == '__main__':
    main()
