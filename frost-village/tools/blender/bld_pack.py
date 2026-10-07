"""
bld_pack.py - turn the raw v3 renders (bld_render.py cache) into assets/buildings/: trimmed Phaser atlases +
manifest.json, plus the previews in docs/previews/bld_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/bld_pack.py [--cache DIR] [--quantize auto|on|off] [--no-previews] [--allow-partial]
                                      [--out DIR] [--prev DIR]      (dry runs: write somewhere else)

Guard + merge (like the fixed prop_pack / life_pack guard): the packer MERGES into the existing
assets/buildings/manifest.json - unknown top-level fields and extra fields inside entries are kept, generated
fields win - and it REFUSES (exit 1, nothing written) when a key of the current manifest (sprites or
characters) or of bld_check.REQUIRED has no render in the cache, because rebuilding the atlases would drop it.
--allow-partial packs what is cached and drops the missing keys on purpose. An empty manifest is never written.

Steps
  1. read every <build>.json sidecar + frame PNGs, the boats' <cache>/<boat>/meta.json + frames, and
     staff_overrides.json from the cache (default <tmp>/fv_cache/buildings)
  2. shadow-caught frames get the SAME post as the base props (pack_utils.clean_alpha + prop_pack.tint_shadow
     + prop_pack.border_fade); items clean_alpha(3); boats get the characters' 1 px ink outline
     (char_pack.ink_outline); the shop's occluder overlay = base frame x the render-time mask
  3. atlases: bld_buildings (split _2, _3 .. at 2048), bld_sites, bld_items, boat_rowboat, boat_fishing;
     palettised with libimagequant when the RGBA payload would exceed the 5 MB budget (--quantize auto)
  4. assets/buildings/manifest.json: sprites (buildings, overlays, construction stages, items, staff overrides
     for the existing market_counter / trade_post) + characters (boats, kind "boat")
  5. previews: docs/previews/bld_all.png, bld_items.png, bld_scene.png, bld_work.gif, bld_boats.gif
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
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, carry_scale, shelf_preview, ...)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'buildings')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 5.0
ATLAS_ORDER = ['bld_buildings', 'bld_sites', 'bld_items']
BOATS = ['boat_rowboat', 'boat_fishing']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
ORDER = ['warehouse', 'station_cannery', 'shop_general', 'station_toolsmith', 'house_a', 'house_b', 'house_c',
         'watchtower', 'boathouse', 'site_S', 'site_M', 'site_L', 'item_can', 'item_fish_big', 'item_axe',
         'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow', 'item_toolbox']
POINT_SINGLE = {'in': 'inPoint', 'out': 'outPoint', 'cash': 'cashPoint', 'dock': 'dockPoint', 'door': 'doorPoint',
                'drop': 'dropPoint'}
POINT_LIST = {'staff': 'staffPoints', 'work': 'workPoints', 'customer': 'customerPoints'}
DIR_LIST = {'staff': 'staffDirs', 'work': 'workDirs', 'customer': 'customerDirs'}
STAFF_DEPTH = {'shop_general': 'front', 'warehouse': 'front', 'station_toolsmith': 'front'}
CREW = {'boat_rowboat': ['fisherman'], 'boat_fishing': ['captain', 'fisherman']}
LENGTH_M = {'boat_rowboat': 2.5, 'boat_fishing': 4.4}


# --------------------------------------------------------------------------- load + post

def load(cache):
    builds, boats, staff = {}, {}, None
    for fn in sorted(os.listdir(cache)):
        p = os.path.join(cache, fn)
        if fn == 'staff_overrides.json':
            staff = json.load(open(p))['entries']
        elif fn.endswith('.json'):
            m = json.load(open(p))
            if 'build' in m and 'frames' in m:
                builds[m['build']] = m
        elif fn in BOATS and os.path.exists(os.path.join(p, 'meta.json')):
            m = json.load(open(os.path.join(p, 'meta.json')))
            names = ['%s_%s_%d' % (a, d, i) for a, info in m['anims'].items() for d in DIRS
                     for i in range(info['frames'])]
            if all(os.path.exists(os.path.join(p, n + '.png')) for n in names):
                m['names'] = names
                boats[fn] = m
            else:
                print('note: %s has missing frames - not packed' % fn)
    keys = [k for k in ORDER if k in builds] + sorted(k for k in builds if k not in ORDER)
    frames = {}
    for k in keys:
        m = builds[k]
        for n in m['frames']:
            im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
            if m.get('shadow'):
                im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
            else:
                im = pu.clean_alpha(im, floor=3)
            frames[n] = im
        ov = m.get('overlay')
        if ov:
            mask = np.asarray(Image.open(os.path.join(cache, ov['mask'] + '.png')).convert('RGBA')).astype(np.float32)
            mval = (mask[..., 0] / 255.0) * (mask[..., 3] / 255.0)
            a = np.asarray(frames[ov['of']]).astype(np.float32).copy()
            a[..., 3] *= mval
            frames[ov['key']] = pu.clean_alpha(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
    import char_pack as cp      # read-only reuse of the characters' ink outline
    bframes = {}
    for b, m in boats.items():
        for n in m['names']:
            bframes[(b, n)] = cp.ink_outline(Image.open(os.path.join(cache, b, n + '.png')))
    return keys, builds, boats, staff, frames, bframes


# --------------------------------------------------------------------------- manifest

def head_top(img, anchor):
    a = np.asarray(img)[..., 3] > 60
    rows = np.nonzero(a.any(1))[0]
    return int(rows[0] - anchor[1]) if len(rows) else 0


def sprite_entries(k, m, frame_atlas, frames):
    out = {}
    first = m['frames'][0]
    pts = m.get('framePoints', {})
    dirs = m.get('frameDirs', {})
    for skey, sd in m['sprites'].items():
        fr = sd['frame']
        s = {'atlas': frame_atlas[fr], 'frame': fr, 'anchor': m['anchor'], 'kind': m['kind']}
        if 'footprint' in m:
            s['footprint'] = m['footprint']
            s['footprintM'] = m['footprintM']
        s['frameSize'] = m['frameSize']
        s['topPx'] = m['topPx'].get(fr, m['topPx'].get(first)) if isinstance(m['topPx'], dict) else m['topPx']
        if m.get('front'):
            s['front'] = m['front']
        if 'anims' in m and skey == k:
            w = dict(m['anims']['work'])
            atl = {frame_atlas[f] for f in w['frames']}
            if len(atl) > 1 or frame_atlas[w['frames'][0]] != s['atlas']:
                w['atlas'] = frame_atlas[w['frames'][0]]
            s['anims'] = {'work': w}
        if 'fxPoints' in m and skey == k:
            s['fxPoints'] = m['fxPoints']
        fp_ = pts.get(fr, {})
        fd_ = dirs.get(fr, {})
        for kind, field in POINT_SINGLE.items():
            if fp_.get(kind):
                s[field] = fp_[kind][0]
                if kind == 'dock' and fd_.get('dock'):
                    s['dockDir'] = fd_['dock'][0]
        for kind, field in POINT_LIST.items():
            if fp_.get(kind):
                s[field] = fp_[kind]
                if fd_.get(kind):
                    s[DIR_LIST[kind]] = fd_[kind]
        if 'staffPoints' in s:
            s['staffDepth'] = STAFF_DEPTH.get(k, 'front')
        if m.get('overlay') and skey == k:
            s['overlay'] = m['overlay']['key']
        if 'stage' in sd:
            s['stage'] = sd['stage']
            s['stages'] = list(m['sprites'])
            s['size'] = k.split('_')[-1]
        if 'stackStep' in m:
            s['stackStep'] = m['stackStep']
            s['icon'] = True
            s['carryScale'] = pp.carry_scale(frames[fr])
            s['thicknessM'] = m['thicknessM']
        if m.get('notes'):
            s['notes'] = m['notes']
        out[skey] = s
    ov = m.get('overlay')
    if ov:
        out[ov['key']] = {'atlas': frame_atlas[ov['key']], 'frame': ov['key'], 'anchor': m['anchor'],
                          'kind': 'overlay', 'of': k, 'frameSize': m['frameSize'],
                          'notes': 'Occluder overlay for %s (same frame + anchor): draw it ABOVE the clerk standing '
                                   'at %s.staffPoints[0] (building depth d, clerk d + 0.5, overlay d + 1) so the '
                                   'counter hides the clerk\'s legs. Contains %s.' % (k, k, ov['notes'])}
    return out


def boat_entry(b, m, bframes):
    W, H = m['frameSize']
    ax, ay = m['anchorPx']
    ht = min(head_top(bframes[(b, '%s_S_0' % list(m['anims'])[0])], (ax, ay)),
             head_top(bframes[(b, '%s_E_0' % list(m['anims'])[0])], (ax, ay)))
    anims = {}
    for a, info in m['anims'].items():
        anims[a] = {'frames': info['frames'], 'fps': info['fps'], 'repeat': info.get('repeat', -1)}
    return {'atlas': b, 'frameSize': [W, H], 'anchor': m['anchor'], 'dirs': DIRS, 'mirror': MIRROR,
            'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'boat',
            'cargoPoint': m['cargoPoint'], 'wakePoint': m['wakePoint'], 'bowPoint': m['bowPoint'],
            'headTop': ht, 'lengthM': LENGTH_M.get(b), 'crew': CREW.get(b, []), 'shadow': None,
            'notes': m.get('notes', '')}


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre (items: bottom '
              'centre; boats: waterline centre of the hull).',
    'front': '-Y = the building faces screen down-left (SW); its other visible side is screen down-right (SE).',
    'footprint': 'screen-px bounding size [w, h] of the ground diamond, centred on the anchor; footprintM = metres.',
    'topPx': 'visual height above the anchor in px (bubbles / progress rings).',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled sprite). '
              '*Dirs = facing of the character standing there (S, SE, E, NE, N, SW, W, NW; SW/W/NW = flipX).',
    'inPoint/outPoint': 'centres of the input / output floor pads (ui_pad_input / ui_pad_output, 170x85) - all '
                        'placed in FRONT of the building (larger y than the building edge) so a character standing '
                        'on a pad sorts above the building.',
    'staffPoints': 'where a clerk / worker stands. staffDepth "front": the spot is in front of the building geometry '
                   '-> draw the character above the building sprite (depth d + 0.5); if the sprite has `overlay`, '
                   'draw that overlay sprite above the character (d + 1). "behind" (existing sellers): normal anchor-y '
                   'sorting already draws the clerk behind the counter sprite.',
    'customerPoints': 'shop_general: where the first customer stands (queue continues toward screen down-left).',
    'cashPoint': 'shop_general: coin pad (ui_pad_cash).',
    'dockPoint': 'boathouse: water spot beside the pier end where a boat anchor is placed; dockDir = boat facing.',
    'workPoints': 'construction sites: builder spots (hammering, facing workDirs), outside the footprint; draw them '
                  'above the site sprite.',
    'dropPoint': 'construction sites: where delivered materials are stacked (item towers).',
    'stages': 'site_plot_X -> site_foundation_X -> site_scaffold_X share frameSize + anchor (X = S 2x2, M 3x3, L 4x4 '
              'm); the finished building (anchor = footprint centre too) simply replaces the site sprite.',
    'work': 'idle frame = resting state; anims.work = seamless 4-frame loop with the motion baked in (all frames '
            'share frameSize + anchor; swap frames in place). The game builds spr:<key>:work like the props stations.',
    'fxPoints': 'px offsets for game FX: smoke (chimney top), fire, steam, sparks, hoist, crane, register ...',
    'shadows': 'buildings / sites have a baked soft cool shadow falling screen down-right; items and boats none.',
    'stackStep': 'items: px between stacked copies at scale 1; carryScale = scale for hand-carried stacks '
                 '(same rules as assets/props items).',
    'boats': 'characters{} entries with kind "boat": 5 rendered dirs + flipX mirrors, frame names {anim}_{dir}_{i}; '
             'crew baked in, 1 px ink outline like the characters, NO shadow (draw fx_wake at wakePoint[dir], '
             'mirrored dirs negate dx). cargoPoint[dir] = [dx, dy, behind] = bottom of a carried fish stack '
             '(behind = draw the stack before the boat sprite).',
    'staff overrides': 'market_counter_staff / trade_post_staff are not images: {of, staffPoints, staffDirs, '
                       'staffDepth} for the EXISTING props sellers, measured from prop_assets geometry.',
}


def build_manifest(keys, builds, boats, staff, frame_atlas, atlas_keys, frames, bframes, old):
    sprites, chars = {}, {}
    for k in keys:
        sprites.update(sprite_entries(k, builds[k], frame_atlas, frames))
    for name, e in (staff or {}).items():
        sprites[name + '_staff'] = {kk: e[kk] for kk in ('of', 'kind', 'staffPoints', 'staffDirs', 'staffDepth',
                                                         'notes')}
    for b in BOATS:
        if b in boats:
            chars[b] = boat_entry(b, boats[b], bframes)
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/bld_render.py + bld_pack.py (docs/CONTRACT_V3.md section E)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'buildings/%s.png' % a, 'json': 'buildings/%s.json' % a} for a in atlas_keys]
    oldsp, oldch = (old or {}).get('sprites', {}), (old or {}).get('characters', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    return man


# --------------------------------------------------------------------------- pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0,
                                         max_colors=256)


def pack_all(keys, builds, boats, frames, bframes, mode):
    groups = {}
    for k in keys:
        m = builds[k]
        names = list(m['frames']) + ([m['overlay']['key']] if m.get('overlay') else [])
        groups.setdefault(m['atlas'], []).extend((n, frames[n]) for n in names)
    sheets = []
    for g in ATLAS_ORDER + sorted(set(groups) - set(ATLAS_ORDER)):
        if g in groups:
            sheets += pp.pack_group(g, groups[g])
    for b in BOATS:
        if b in boats:
            sheet, atlas = pu.pack_atlas([(n, bframes[(b, n)]) for n in boats[b]['names']], max_width=MAX_SHEET,
                                         trim=True, padding=2)
            sheets.append((b, sheet, atlas))
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('bld_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if (fn.startswith('bld_') or fn.startswith('boat_')) and fn.endswith(('.png', '.json')):
            os.remove(os.path.join(OUT, fn))
    total = 0
    sizes = {}
    for akey, sheet, atlas in sheets:
        png = os.path.join(OUT, akey + '.png')
        pu.save_atlas(sheet, atlas, png, os.path.join(OUT, akey + '.json'), quantize=False)
        sizes[akey] = os.path.getsize(png)
        total += sizes[akey] + os.path.getsize(os.path.join(OUT, akey + '.json'))
    do_q = mode == 'on' or (mode == 'auto' and total / 1048576.0 > BUDGET_MB * 0.9)
    if do_q:
        try:
            total = 0
            for akey, sheet, atlas in sheets:
                png = os.path.join(OUT, akey + '.png')
                quantize(sheet).save(png, optimize=True)
                sizes[akey] = os.path.getsize(png)
                total += sizes[akey] + os.path.getsize(os.path.join(OUT, akey + '.json'))
            print('  palettised with libimagequant (256 colours, dither 0.6)')
        except ImportError:
            print('  imagequant not installed -> kept RGBA (pip install imagequant)')
    frame_atlas = {}
    for akey, sheet, atlas in sheets:
        for n in atlas['frames']:
            frame_atlas[n] = akey
        print('%-16s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return sheets, frame_atlas, total


# --------------------------------------------------------------------------- previews

def atlas_lib(manifest_rel):
    """{sprite or character frame name -> untrimmed image} reader for an existing assets manifest (read-only)."""
    path = os.path.join(ASSETS, manifest_rel)
    if not os.path.exists(path):
        return None
    man = json.load(open(path, encoding='utf-8'))
    cache = {}

    def sheet(akey):
        if akey not in cache:
            a = next((x for x in man.get('atlases', []) if x['key'] == akey), None)
            if a is None:
                cache[akey] = None
            else:
                cache[akey] = (Image.open(os.path.join(ASSETS, a['png'])).convert('RGBA'),
                               json.load(open(os.path.join(ASSETS, a['json'])))['frames'])
        return cache[akey]

    def get(akey, name):
        s = sheet(akey)
        if not s or name not in s[1]:
            return None
        f = s[1][name]
        r = f['frame']
        crop = s[0].crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h']))
        im = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']), (0, 0, 0, 0))
        im.paste(crop, (f['spriteSourceSize']['x'], f['spriteSourceSize']['y']))
        return im
    return man, get


def preview_all(keys, builds, boats, frames, bframes, out):
    ents = []
    for k in keys:
        m = builds[k]
        ents.append((m['frames'][0], frames[m['frames'][0]]))
        for n in m['frames'][1:]:
            if '_work_' not in n:
                ents.append((n, frames[n]))
        if 'anims' in m:
            n = m['anims']['work']['frames'][1]
            ents.append((n, frames[n]))
        if m.get('overlay'):
            ents.append((m['overlay']['key'], frames[m['overlay']['key']]))
    for b in BOATS:
        if b in boats:
            a0 = list(boats[b]['anims'])[1]
            for d in ('S', 'SE', 'E'):
                ents.append(('%s %s_%s' % (b, a0, d), bframes[(b, '%s_%s_1' % (a0, d))]))
    pp.shelf_preview(ents, out, max_w=2000, title='Frost Village v3 - buildings / construction stages / items / '
                                                  'boats (assets/buildings, 1x, PPU 64; idle + one work frame)')


def preview_items(keys, builds, frames, out):
    items = [k for k in keys if builds[k]['kind'] == 'item']
    if not items:
        return
    metas = {}
    for k in items:
        m = dict(builds[k])
        metas[k] = m
    pp.items_preview(items, metas, frames, out)


def preview_scene(keys, builds, boats, staff, frames, bframes, out):
    """Composite at 1x: new buildings beside existing props (read from assets/props), the shop clerk with its overlay,
    a construction site in its 3 stages with builders, houses, the lit watchtower, the boathouse + both boats on the
    sea, item stacks and villagers for scale.  Anchors are placed in screen px; depth = anchor y."""
    W, H = 2200, 1480
    img = Image.new('RGBA', (W, H), (244, 247, 251, 255))
    d = ImageDraw.Draw(img)
    # sea band at the top (the game's shore is horizontal, sea above) + foam
    d.polygon([(0, 0), (W, 0), (W, 405), (0, 335)], fill=(47, 134, 201, 255))
    d.polygon([(0, 0), (W, 0), (W, 250), (0, 180)], fill=(31, 95, 168, 255))
    d.line([(0, 335), (W, 405)], fill=(230, 242, 250, 255), width=8)
    # terracotta plaza under the shop / market row
    d.polygon([(1180, 735), (1640, 505), (2100, 735), (1640, 965)], fill=(217, 160, 138, 255))
    # a packed-snow road through the middle
    d.polygon([(0, 860), (W, 860), (W, 905), (0, 905)], fill=(222, 216, 208, 255))
    placed, labels = [], []
    props = atlas_lib('props/manifest.json')
    vill = atlas_lib('villagers/manifest.json')
    chars = pp.char_frames()

    def put(im, anchor, sx, sy, bias=0.0, depth=None):
        placed.append((sy + bias if depth is None else depth, im, int(round(sx - anchor[0])),
                       int(round(sy - anchor[1]))))

    def put_b(key, sx, sy, frame=None, label=None):
        for k in keys:
            m = builds[k]
            if key in m['sprites']:
                put(frames[frame or m['sprites'][key]['frame']], m['anchorPx'], sx, sy)
                labels.append((label or key, sx, sy + 26))
                return m
        return None

    def put_prop(key, sx, sy, frame=None, label=None):
        if not props:
            return None
        man, get = props
        sp = man['sprites'].get(key)
        im = get(sp['atlas'], frame or sp['frame']) if sp else None
        if im is None:
            return None
        fw, fh = sp['frameSize']
        put(im, (sp['anchor'][0] * fw, sp['anchor'][1] * fh), sx, sy)
        labels.append((label or key + ' (existing)', sx, sy + 26))
        return sp

    def person(key, frame, sx, sy, flip=False, bias=0.0, depth=None):
        im = None
        if vill and key in vill[0].get('characters', {}):
            im = vill[1](vill[0]['characters'][key]['atlas'], frame)
        elif key in chars:
            im = chars[key][0](frame)
        if im is None:
            return
        if flip:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
        put(im, (64, 104), sx, sy, bias, depth)

    # --- sea: boats + boathouse on the shore
    for b, (sx, sy, a, dn) in (('boat_fishing', (360, 268, 'sail', 'E')), ('boat_rowboat', (1020, 300, 'row', 'SE'))):
        if b in boats:
            put(bframes[(b, '%s_%s_1' % (a, dn))], boats[b]['anchorPx'], sx, sy)
            labels.append((b, sx, sy + 40))
    put_b('boathouse', 1860, 470, frame='boathouse_work_1')
    # --- row B: new production buildings + shop, existing market counter (+ its clerk)
    yB = 740
    put_b('warehouse', 250, yB, frame='warehouse_work_2')
    put_b('station_cannery', 640, yB - 10, frame='station_cannery_work_1')
    put_b('station_toolsmith', 1010, yB, frame='station_toolsmith_work_2')
    sm = put_b('shop_general', 1400, yB)
    if sm:
        sp = sm['framePoints']['shop_general']
        for (dx, dy) in sp.get('staff', [])[:1]:
            # staffDepth "front": clerk at building depth + 0.5, overlay at + 1 (independent of the clerk's y)
            person('npc_merchant', 'idle_SE_0', 1400 + dx, yB + dy, flip=True, depth=yB + 0.5)
        if sm.get('overlay'):
            put(frames[sm['overlay']['key']], sm['anchorPx'], 1400, yB, bias=1.0)
        for (dx, dy) in sp.get('customer', [])[:1]:
            for j, ck in enumerate(('villager_a', 'villager_c', 'villager_b')):
                person(ck, 'idle_NE_0', 1400 + dx - j * 34, yB + dy + j * 17)
    mc = put_prop('market_counter', 1830, yB - 30)
    if mc and staff and 'market_counter' in staff:
        dx, dy = staff['market_counter']['staffPoints'][0]
        person('npc_aunt', 'idle_SE_0', 1830 + dx, yB - 30 + dy, flip=True)
    # --- row C: existing stations, construction site M in 3 stages (+ builders), lit watchtower
    yC = 1080
    put_prop('station_grill', 180, yC - 20, frame=None)
    put_prop('station_smelter', 440, yC - 10, frame='station_smelter_work_1')
    for i, st in enumerate(('plot', 'foundation', 'scaffold')):
        put_b('site_%s_M' % st, 760 + i * 320, yC)
    bs = builds.get('site_M')
    if bs:
        pts = bs['framePoints'].get('site_scaffold_M', {})
        for j, (dx, dy) in enumerate(pts.get('work', [])[:2]):
            person('lumberjack', 'idle_NE_0', 760 + 640 + dx, yC + dy, flip=(j == 1), depth=max(yC + dy, yC + 0.5))
        dp = pts.get('drop')
        if dp and 'item_plank' in (props[0]['sprites'] if props else {}):
            man, get = props
            ps = man['sprites']['item_plank']
            for i in range(5):
                put(get(ps['atlas'], 'item_plank'), (36, 54), 760 + 640 + dp[0][0], yC + dp[0][1] - i * ps['stackStep'],
                    bias=0.6 + i * 0.01)
    put_b('watchtower', 1790, yC + 20, frame='watchtower_work_1')
    put_b('site_scaffold_S', 2060, yC - 40)
    # --- row D: houses, item stacks, villagers for scale, existing trade post (+ its clerk)
    yD = 1350
    put_b('house_a', 230, yD)
    put_b('house_b', 520, yD)
    put_b('house_c', 800, yD)
    items = [k for k in keys if builds[k]['kind'] == 'item']
    for j, k in enumerate(items):
        m = builds[k]
        sx, sy = 980 + j * 66, yD - 10 + (j % 2) * 26
        n = 3 if k == 'item_fish_big' else 4
        for i in range(n):
            put(frames[k], m['anchorPx'], sx, sy - i * m['stackStep'], bias=i * 0.01)
        labels.append((k.replace('item_', ''), sx, sy + 22))
    person('npc_blacksmith', 'idle_S_0', 1530, yD - 20)
    person('player', 'idle_S_0', 1595, yD - 5)
    tp = put_prop('trade_post', 1880, yD - 20)
    if tp and staff and 'trade_post' in staff:
        dx, dy = staff['trade_post']['staffPoints'][0]
        person('npc_merchant', 'idle_SE_0', 1880 + dx, yD - 20 + dy, flip=True)
    # soft ground shadows under the characters are drawn by the game; here: composite by depth
    for _, im, px_, py_ in sorted(placed, key=lambda t: t[0]):
        img.alpha_composite(im, (px_, py_))
    d = ImageDraw.Draw(img)
    f = pp.font(13)
    for text, sx, sy in labels:
        tw = f.getlength(text)
        d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7, fill=(255, 255, 255, 215))
        d.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
    d.rectangle([0, H - 40, W, H], fill=(31, 95, 168, 255))
    d.text((16, H - 33), 'Frost Village v3 buildings beside existing props (1x, PPU 64): shop clerk between the shop and '
           'its overlay, site_M plot > foundation > scaffold, existing sellers at their staffPoints, boats, item '
           'stacks', fill=(255, 255, 255), font=pp.font(18))
    img.convert('RGB').save(out, optimize=True)


def _gif(frames_rgb, durs, out):
    pal = frames_rgb[min(2, len(frames_rgb) - 1)].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames_rgb]
    q[0].save(out, save_all=True, append_images=q[1:], duration=durs, loop=0, optimize=False, disposal=1)


def preview_work_gif(keys, builds, frames, out, bg=(236, 241, 248)):
    st = [k for k in keys if 'anims' in builds[k]]
    if not st:
        return
    gap = 8
    scale = 0.75
    sz = {k: (int(builds[k]['frameSize'][0] * scale), int(builds[k]['frameSize'][1] * scale)) for k in st}
    Wd = sum(sz[k][0] for k in st) + gap * (len(st) + 1)
    Hd = max(sz[k][1] for k in st) + 30

    def compose(idx):
        im = Image.new('RGBA', (Wd, Hd), bg + (255,))
        dr = ImageDraw.Draw(im)
        x = gap
        for k in st:
            n = k if idx is None else builds[k]['anims']['work']['frames'][idx % 4]
            f = frames[n].resize(sz[k], Image.LANCZOS)
            im.alpha_composite(f, (x, Hd - 26 - sz[k][1]))
            dr.text((x + 6, Hd - 22), k + (' (idle)' if idx is None else ''), fill=(20, 24, 32), font=pp.font(13))
            x += sz[k][0] + gap
        return im.convert('RGB')
    fr = [compose(None)] + [compose(i) for _ in range(5) for i in range(4)]
    _gif(fr, [900] + [125] * (len(fr) - 1), out)


def preview_boats_gif(boats, bframes, out):
    if not boats:
        return
    sea = (47, 134, 201)
    rows = [b for b in BOATS if b in boats]
    cell = {b: boats[b]['frameSize'] for b in rows}
    Wd = max(cell[b][0] * 5 for b in rows) + 20
    Hd = sum(cell[b][1] for b in rows) + 20
    seq = []
    for t in range(12):
        im = Image.new('RGBA', (Wd, Hd), sea + (255,))
        dr = ImageDraw.Draw(im)
        y = 10
        for b in rows:
            m = boats[b]
            anim = list(m['anims'])[1]
            n = m['anims'][anim]['frames']
            for j, dn in enumerate(DIRS):
                f = bframes[(b, '%s_%s_%d' % (anim, dn, t % n))]
                im.alpha_composite(f, (10 + j * cell[b][0], y))
                dr.text((14 + j * cell[b][0], y + 4), '%s %s_%s' % (b.replace('boat_', ''), anim, dn),
                        fill=(255, 255, 255), font=pp.font(12))
            y += cell[b][1]
        seq.append(im.convert('RGB'))
    fps = boats[rows[0]]['anims'][list(boats[rows[0]]['anims'])[1]]['fps']
    _gif(seq, [int(1000 / fps)] * len(seq), out)


# --------------------------------------------------------------------------- main

def guard(cache, have, need, in_manifest, allow_partial):
    """Refuse a repack that would drop keys (same contract as pack_utils.guard_repack, which only knows `sprites`;
    here boats are checked too as 'char:<key>').  Exit 1 and write nothing unless allow_partial."""
    if not have:
        raise SystemExit('bld_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'bld_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is '
                         'never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    import textwrap
    listing = textwrap.fill(' '.join(k + ('' if k in in_manifest else '*') for k in missing), 100,
                            initial_indent='    ', subsequent_indent='    ')
    if any(k not in in_manifest for k in missing):
        listing += '\n    (* = only in bld_check.REQUIRED, not in the current manifest; char:<key> = a boat)'
    if allow_partial:
        print('bld_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다:\n%s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'bld_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다.\n'
        '  이대로 포장하면 그 그림들이 아틀라스와 매니페스트에서 사라집니다. 아무 파일도 바꾸지 않았습니다.\n'
        'bld_pack: ABORT - %d key(s) in the current manifest (or bld_check.REQUIRED) are missing from the render '
        'cache %s;\n  packing now would DELETE them from the atlases and the manifest. Nothing was written.\n%s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/bld_render.py -- <keys> first (boats: boat_rowboat / '
        'boat_fishing), or pass --cache <full cache>;\n  to drop them on purpose re-run with --allow-partial / '
        '일부러 빼려면 --allow-partial' % (len(missing), cache, len(missing), cache, listing))



def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'buildings')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = 'auto'
    if '--quantize' in args:
        mode = args[args.index('--quantize') + 1]
    if not os.path.isdir(cache):
        sys.exit('bld_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run bld_render.py first or pass --cache DIR.' % cache)
    keys, builds, boats, staff, frames, bframes = load(cache)
    have = set()
    for k in keys:
        have |= set(builds[k]['sprites'])
        if builds[k].get('overlay'):
            have.add(builds[k]['overlay']['key'])
    for name in (staff or {}):
        have.add(name + '_staff')
    have |= {'char:' + b for b in boats}
    man_path = os.path.join(OUT, 'manifest.json')
    old = None
    if os.path.exists(man_path):
        old = json.load(open(man_path, encoding='utf-8'))
    try:
        from bld_check import REQUIRED, REQUIRED_CHARS
    except ImportError:
        REQUIRED, REQUIRED_CHARS = [], []
    need = set(REQUIRED) | {'char:' + c for c in REQUIRED_CHARS}
    if old:
        need |= set(old.get('sprites', {})) | {'char:' + c for c in old.get('characters', {})}
    guard(cache, have, need, set(old.get('sprites', {})) | {'char:' + c for c in old.get('characters', {})}
          if old else set(), '--allow-partial' in args)
    sheets, frame_atlas, total = pack_all(keys, builds, boats, frames, bframes, mode)
    man = build_manifest(keys, builds, boats, staff, frame_atlas, [s[0] for s in sheets], frames, bframes, old)
    if not man['sprites'] and not man['characters']:
        sys.exit('bld_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('sprites: %d  characters: %d  payload %.2f MB' % (len(man['sprites']), len(man['characters']),
                                                            total / 1048576.0))
    if '--no-previews' not in args:
        os.makedirs(PREV, exist_ok=True)
        preview_all(keys, builds, boats, frames, bframes, os.path.join(PREV, 'bld_all.png'))
        preview_items(keys, builds, frames, os.path.join(PREV, 'bld_items.png'))
        preview_scene(keys, builds, boats, staff, frames, bframes, os.path.join(PREV, 'bld_scene.png'))
        preview_work_gif(keys, builds, frames, os.path.join(PREV, 'bld_work.gif'))
        preview_boats_gif(boats, bframes, os.path.join(PREV, 'bld_boats.gif'))
        print('previews: docs/previews/bld_all.png, bld_items.png, bld_scene.png, bld_work.gif, bld_boats.gif')


if __name__ == '__main__':
    main()
