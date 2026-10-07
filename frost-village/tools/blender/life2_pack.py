"""
life2_pack.py - turn the raw life2 renders (life2_render.py cache) into assets/life2/: trimmed Phaser atlases (each
sheet <= 2048 px) + manifest.json, plus the previews docs/previews/life2_*.

No Blender needed: python3 with numpy + Pillow (+ `imagequant` for palette PNGs).
    python3 tools/blender/life2_pack.py [--cache DIR] [--quantize on|auto|off] [--no-previews] [--allow-partial]
                                        [--out DIR] [--prev DIR]        (dry runs: write somewhere else)

Guard + merge (as town_pack / bld_pack): the packer MERGES into an existing assets/life2/manifest.json (unknown
top-level fields and extra fields inside entries are kept, generated fields win) and REFUSES (exit 1, nothing
written) when a key of the current manifest or of life2_check.REQUIRED has no render in the cache - rebuilding the
atlases would drop it.  --allow-partial packs what is cached and drops the missing keys on purpose.  An empty
manifest is never written.

Steps
  1. read every <build>.json sidecar + frames and the strollers' <cache>/<key>/meta.json + frames
  2. shadow-caught frames: pack_utils.clean_alpha + prop_pack.tint_shadow + prop_pack.border_fade (the village
     props' post); items clean_alpha(3); ribbon_garland (facade shadows only) clean_alpha(6) + tint_shadow;
     the desk overlay = base frame x render-time mask; strollers get the characters' 1 px ink outline
  3. atlases life2_wedding, life2_memorial, life2_decor, life2_items (+ _2 .. at 2048) and one atlas per stroller
     (l2_<key>); palettised with libimagequant (256 colours, dither 0.6) when --quantize on, or with auto when the
     RGBA payload is above 90 % of the 2.5 MB budget
  4. assets/life2/manifest.json: sprites{} (props, overlay, items), characters{} (strollers, kind "stroller"),
     layouts{} (wedding_town_hall, farewell_garden), conventions{}
  5. previews: docs/previews/life2_all.png, life2_wedding.png, life2_memorial.png, life2_anims.gif
"""
import json
import math
import os
import random
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(GAME, 'tools'))
sys.path.insert(0, HERE)
import pack_utils as pu  # noqa: E402
import prop_pack as pp   # noqa: E402  (read-only reuse: tint_shadow, border_fade, shelf_preview, font, carry_scale)

ASSETS = os.path.join(GAME, 'assets')
OUT = os.path.join(ASSETS, 'life2')
PREV = os.path.join(GAME, 'docs', 'previews')
MAX_SHEET = 2048
BUDGET_MB = 2.5
ATLAS_ORDER = ['life2_wedding', 'life2_memorial', 'life2_decor', 'life2_items']
STROLLERS = ['baby_stroller', 'baby_stroller_pink']
DIRS = ['S', 'SE', 'E', 'NE', 'N']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
DIR_YAW = {'S': 45.0, 'SE': 90.0, 'E': 135.0, 'NE': 180.0, 'N': 225.0, 'NW': 270.0, 'W': 315.0, 'SW': 0.0}
POINT_SINGLE = {'officiant': 'officiantPoint', 'door': 'doorPoint', 'lay': 'layPoint', 'wreath': 'wreathPoint',
                'plaque': 'plaquePoint', 'baby': 'babyPoint'}
POINT_LIST = {'seat': 'seatPoints', 'seatg': 'seatGroundPoints', 'couple': 'couplePoints', 'serve': 'servePoints',
              'stone': 'stonePoints', 'gather': 'gatherPoints', 'aisle': 'aislePoints', 'path': 'pathPoints',
              'mourner': 'mournerPoints'}
DIR_LIST = {'seat': 'seatDirs', 'couple': 'coupleDirs', 'serve': 'serveDirs', 'stone': 'stoneDirs',
            'gather': 'gatherDirs', 'aisle': 'aisleDirs', 'mourner': 'mournerDirs', 'officiant': 'officiantDir',
            'door': 'doorDir', 'lay': 'layDir'}
SEAT_DEPTH = {'wedding_chairs': 'front', 'wedding_chairs_x': 'front', 'memorial_garden': 'front',
              'school_desk_row': 'between'}
SQ2 = math.sqrt(2.0)
PUSH_REACH_M = 0.25          # adult grip distance in front of the pusher anchor (tf2_anim.push_grip: child 0.17, elder 0.24)
STROLLER_SHADOW = [50, 20]


def iso(x, y, z=0.0):
    """World metres -> px offset (bl_common.world_to_pixel maths)."""
    return [int(round((x + y) * 45.2548)), int(round((x - y) * 22.6274 - z * 55.4256))]


# --------------------------------------------------------------------------- load + post

def load(cache):
    builds, strollers = {}, {}
    for fn in sorted(os.listdir(cache)):
        p = os.path.join(cache, fn)
        if fn.endswith('.json'):
            try:
                m = json.load(open(p))
            except Exception:
                continue
            names = list(m.get('frames', [])) + ([m['overlay']['mask']] if m.get('overlay') else [])
            if 'build' in m and all(os.path.exists(os.path.join(cache, n + '.png')) for n in names):
                builds[m['build']] = m
        elif fn in STROLLERS and os.path.exists(os.path.join(p, 'meta.json')):
            m = json.load(open(os.path.join(p, 'meta.json')))
            names = ['%s_%s_%d' % (a, d, i) for a, info in m['anims'].items() for d in DIRS
                     for i in range(info['frames'])]
            if all(os.path.exists(os.path.join(p, n + '.png')) for n in names):
                m['names'] = names
                strollers[fn] = m
            else:
                print('note: %s has missing frames - not packed' % fn)
    frames = {}
    for k, m in builds.items():
        for n in m['frames']:
            im = Image.open(os.path.join(cache, n + '.png')).convert('RGBA')
            if m['kind'] == 'item':
                im = pu.clean_alpha(im, floor=3)
            elif m['kind'] == 'overlay':
                im = pp.tint_shadow(pu.clean_alpha(im, floor=6))
            else:
                im = pp.border_fade(pp.tint_shadow(pu.clean_alpha(im, floor=10)))
            frames[n] = im
        ov = m.get('overlay')
        if ov:
            mask = np.asarray(Image.open(os.path.join(cache, ov['mask'] + '.png')).convert('RGBA')).astype(np.float32)
            mval = (mask[..., 0] / 255.0) * (mask[..., 3] / 255.0)
            a = np.asarray(frames[ov['of']]).astype(np.float32).copy()
            # keep only the solid desk pixels (the baked ground shadow belongs to the base sprite)
            solid = (a[..., 3] > 200) | (a[..., :3].mean(-1) > 90)
            a[..., 3] *= mval * solid
            frames[ov['key']] = pu.clean_alpha(Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), floor=3)
    import char_pack as cp      # read-only reuse of the characters' ink outline
    sframes = {}
    for s, m in strollers.items():
        for n in m['names']:
            sframes[(s, n)] = cp.ink_outline(Image.open(os.path.join(cache, s, n + '.png')))
    return builds, strollers, frames, sframes


# --------------------------------------------------------------------------- manifest

def footprint_poly(m):
    fm = m.get('footprintM')
    if not isinstance(fm, list) or len(fm) != 2:
        return None
    a, b = fm
    yaw = math.radians(m.get('yaw', 0.0))
    pts = []
    for lx, ly in ((-a / 2, -b / 2), (a / 2, -b / 2), (a / 2, b / 2), (-a / 2, b / 2)):
        x = lx * math.cos(yaw) - ly * math.sin(yaw)
        y = lx * math.sin(yaw) + ly * math.cos(yaw)
        pts.append(iso(x, y))
    return pts


def points_into(s, pts, dirs):
    for kind, field in POINT_SINGLE.items():
        if pts.get(kind):
            s[field] = pts[kind][0]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind][0]
    for kind, field in POINT_LIST.items():
        if pts.get(kind):
            s[field] = pts[kind]
            if dirs.get(kind) and kind in DIR_LIST:
                s[DIR_LIST[kind]] = dirs[kind]


def sprite_entries(k, m, frame_atlas, frames):
    out = {}
    for skey, sd in m['sprites'].items():
        fr = sd['frame']
        s = {'atlas': frame_atlas[fr], 'frame': fr, 'anchor': m['anchor'], 'kind': m['kind'],
             'frameSize': m['frameSize']}
        if 'footprint' in m:
            s['footprint'] = m['footprint']
            s['footprintM'] = m['footprintM']
            poly = footprint_poly(m)
            if poly:
                s['footprintPoly'] = poly
        s['topPx'] = m['topPx'].get(fr, max(m['topPx'].values())) if isinstance(m['topPx'], dict) else m['topPx']
        if m.get('front'):
            s['front'] = m['front']
        if m.get('name'):
            s['name'] = m['name'] if skey == k else {'ko': m['name']['ko'] + (' (빈 요람)' if 'empty' in skey else ''),
                                                     'en': m['name']['en'] + (' (empty)' if 'empty' in skey else '')}
        if 'anims' in sd:
            s['anims'] = sd['anims']
        if 'fxPoints' in m:
            s['fxPoints'] = m['fxPoints']
        points_into(s, m['framePoints'].get(fr, {}), m['frameDirs'].get(fr, {}))
        if 'seatPoints' in s:
            s['seatDepth'] = SEAT_DEPTH.get(k, 'front')
            s['seatHeightM'] = 0.48 if k == 'memorial_garden' else 0.45
        if k == 'memorial_garden':
            s['stoneDepth'] = 'front'
        for f in ('attachTo', 'attachOffset', 'attachDepth'):
            if f in m:
                s[f] = m[f]
        if m.get('overlay') and skey == k:
            s['overlay'] = m['overlay']['key']
        if 'stackStep' in m:
            s['stackStep'] = m['stackStep']
            s['icon'] = True
            s['carryScale'] = pp.carry_scale(frames[fr])
            s['thicknessM'] = m['thicknessM']
        if len(m['sprites']) > 1:
            s['variants'] = list(m['sprites'])
        if m.get('notes'):
            s['notes'] = m['notes']
        out[skey] = s
    ov = m.get('overlay')
    if ov:
        out[ov['key']] = {'atlas': frame_atlas[ov['key']], 'frame': ov['key'], 'anchor': m['anchor'],
                          'kind': 'overlay', 'of': k, 'frameSize': m['frameSize'],
                          'notes': 'Occluder overlay for %s (same frame + anchor): draw it ABOVE the kids sitting at '
                                   '%s.seatPoints (desk row depth d, kids d + 0.5, overlay d + 1) so the desks hide '
                                   'their laps. Contains %s.' % (k, k, ov['notes'])}
    return out


def facing(d):
    a = math.radians(DIR_YAW[d])
    return math.sin(a), -math.cos(a)


def stroller_entry(key, m, sframes):
    W, H = m['frameSize']
    anims = {a: {'frames': info['frames'], 'fps': info['fps'], 'repeat': info.get('repeat', -1)}
             for a, info in m['anims'].items()}
    ht = 0
    for d in DIRS:
        a = np.asarray(sframes[(key, 'idle_%s_0' % d)])[..., 3] > 60
        rows = np.nonzero(a.any(1))[0]
        if len(rows):
            ht = min(ht, int(rows[0] - m['anchorPx'][1]))
    dist = PUSH_REACH_M + m['handleBackM']
    push = {}
    for d in DIRS:
        fx, fy = facing(d)
        push[d] = iso(fx * dist, fy * dist)
    e = {'atlas': 'l2_' + key, 'frameSize': [W, H], 'anchor': m['anchor'], 'dirs': DIRS, 'mirror': MIRROR,
         'frameName': '{anim}_{dir}_{i}', 'anims': anims, 'kind': 'stroller', 'name': m.get('name'),
         'shadow': STROLLER_SHADOW, 'headTop': ht, 'lengthM': m['lengthM'], 'widthM': m['widthM'],
         'handlePoint': m['handlePoint'], 'handleHeightM': m['handleHeightM'], 'handleBackM': m['handleBackM'],
         'babyPoint': m['babyPoint'], 'hoodTop': m['hoodTop'],
         'pushOffset': push, 'pushReachM': PUSH_REACH_M,
         'depthVsPusher': {'S': 1, 'SE': 1, 'E': 1, 'NE': -1, 'N': -1},
         'notes': ('Baby stroller pushed by a parent (townsfolk2 `push`, 8 f, 5 dirs; same dir + flipX as the '
                   'pusher; play `move` while walking, `idle` when stopped). Alignment (preferred): stroller anchor = '
                   'pusher anchor + townfolk2 bases[base].pushPoint[dir] - handlePoint[dir] (mirrored dirs: negate '
                   'both dx) - puts the grip bar (handleHeightM %.2f m, handleBackM %.2f m behind the pram centre) '
                   'exactly in the hands for every age. Fallback without pushPoint: stroller anchor = pusher anchor + '
                   'pushOffset[dir] (assumes the adult grip %.2f m in front of the pusher). depthVsPusher: +1 = draw '
                   'the stroller above the pusher (heading S/SE/E/SW/W), -1 = below (NE/N/NW). move loop = one wheel '
                   'turn = 0.82 m: at 12 fps the pram rolls ~1.2 m/s; scale the anim speed to the pusher\'s walk '
                   'speed (push is 8 f @ 10 fps). babyPoint = the baby\'s face (emote bubbles: hearts, Zzz, music).'
                   % (m['handleHeightM'], m['handleBackM'], PUSH_REACH_M))}
    return e


CONVENTIONS = {
    'ppu': 64,
    'anchor': 'normalised [ax, ay] of the full untrimmed frame = world origin = footprint centre (items: bottom centre '
              'of the ground contact, 72 x 72 frame at (36, 54); strollers: ground point under the pram centre, 128 x '
              '128 at (64, 104) like the characters).',
    'front': '-Y = faces screen down-left (SW, like the town buildings); +X = screen down-right (SE); S = faces the '
             'camera.',
    'points': 'every *Point / *Points value is a px offset [dx, dy] from the sprite anchor (unscaled). *Dirs = the '
              'facing of the character standing / sitting there (S, SE, E, NE, N, SW, W, NW; SW / W / NW = flipX of '
              'SE / E / NE).',
    'seatPoints': 'anchor of a SITTING character = seat-surface front centre, seatHeightM above the ground (the '
                  'villager / townsfolk `sit` anchor convention, CONTRACT_VILLAGERS + assets/villagers notes). '
                  'seatGroundPoints = the ground point under it (for a sit anim anchored at the floor). seatDepth '
                  '"front": sitter depth = prop depth + 1 (+ dy * 0.001); "between": base sprite d, sitter d + 0.5, '
                  'the `overlay` sprite d + 1.',
    'shadows': 'props have a baked soft cool shadow falling screen down-right (like assets/props / life_props / town); '
               'decals (wedding_carpet*) sit on the ground layer; strollers have none (draw the `shadow` ellipse); '
               'ribbon_garland carries only its own shadows on the town-hall facade.',
    'overlay': 'kind "overlay": drawn over another sprite at the same anchor (ribbon_garland on town_hall: attachTo, '
               'depth town_hall + 1; school_desk_row_front over seated kids).',
    'layouts': 'layouts{} = suggested arrangements, offsets in px from the parent sprite\'s anchor (and metres in the '
               'parent\'s world frame, m).',
    'gentle': 'Farewell props are deliberately gentle and warm (flowers, a blossom tree, a lantern, rounded pale '
              'stones with a gold heart); keep the farewell event soft too (petals, hearts, quiet music, no dark '
              'colours). The design lets players switch the farewell life event off (생애 이벤트 끄기).',
}


def wedding_layout(builds):
    """Town-hall wedding: offsets from the town_hall anchor (town hall world frame, metres)."""
    def it(sprite, x, y, **kw):
        d = {'sprite': sprite, 'px': iso(x, y), 'm': [round(x, 3), round(y, 3)]}
        d.update(kw)
        return d
    items = [it('ribbon_garland', 0.0, 0.0, depth='town_hall + 1'),
             it('wedding_carpet', 0.0, -4.75, layer='ground'),
             it('wedding_arch', 0.0, -7.15),
             it('flower_stand', -1.25, -7.0), it('flower_stand', 1.25, -7.0),
             it('flower_stand', -0.85, -2.95), it('flower_stand', 0.85, -2.95),
             it('wedding_cake_table', 3.3, -6.35)]
    for y in (-5.6, -4.55, -3.5):
        items.append(it('wedding_chairs', -1.75, y))
        items.append(it('wedding_chairs', 1.75, y))
    return {
        'of': 'town_hall',
        'notes': 'Wedding at the town hall (마을회관 결혼식): dress the hall with ribbon_garland, lay the carpet from the '
                 'steps to the arch, two blocks of three chair rows face the arch (SW), flower stands flank the arch '
                 'and the steps, the cake table stands beside the right block. The bride walks out of the hall door '
                 '(town_hall.doorPoint) down the carpet (aislePoints, walk SW) to wedding_arch.couplePoints[0]; the '
                 'groom waits at couplePoints[1]; the chief gives the speech at officiantPoint (facing S). Seated '
                 'guests use seatPoints (sit facing SW); standing guests at standPoints clap / wave. After the vows: '
                 'hearts + petals FX at the arch fxPoints.heart, then the couple walks to the cake table servePoints.',
        'items': items,
        'standPoints': [iso(x, y) for x, y in ((-3.3, -6.7), (-3.5, -5.5), (-3.4, -4.3), (3.45, -4.4), (3.6, -5.3),
                                               (4.3, -7.3), (2.4, -7.6))],
        'standDirs': ['SE', 'SE', 'SE', 'SW', 'SW', 'W', 'SW'],
    }


def farewell_layout():
    return {
        'of': 'memorial_garden',
        'notes': 'Gentle farewell (하늘나라 여행 배웅): put a memorial_stone at the next free memorial_garden.stonePoints[i] '
                 '(stones already placed stay), stand a flower_wreath at that stone\'s wreathPoint, family members at '
                 'its mournerPoints (sad / talk, facing the stone), friends at the garden gatherPoints (idle facing '
                 'N), one by one they step to layPoint and lay an item_bouquet (or flowers) - then soft petals / '
                 'hearts float up from the stone, bgm_farewell. An elder may sit on the bench (seatPoints). '
                 'Order: stones 0..5 (back row left to right, then the front row).',
        'stoneOrder': [0, 1, 2, 3, 4, 5],
    }


def build_manifest(builds, strollers, frame_atlas, atlas_keys, frames, sframes, old):
    sprites = {}
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, list(builds).index(k)))
    for k in order:
        sprites.update(sprite_entries(k, builds[k], frame_atlas, frames))
    chars = {s: stroller_entry(s, strollers[s], sframes) for s in STROLLERS if s in strollers}
    man = dict(old) if old else {}
    man['version'] = 1
    man['generator'] = 'tools/blender/life2_render.py + life2_pack.py (docs/CONTRACT_V5.md section P)'
    man['conventions'] = CONVENTIONS
    man['atlases'] = [{'key': a, 'png': 'life2/%s.png' % a, 'json': 'life2/%s.json' % a} for a in atlas_keys]
    oldsp, oldch = (old or {}).get('sprites', {}), (old or {}).get('characters', {})
    man['sprites'] = {k: dict(oldsp.get(k, {}), **v) for k, v in sprites.items()}
    man['characters'] = {k: dict(oldch.get(k, {}), **v) for k, v in chars.items()}
    lay = dict((old or {}).get('layouts', {}))
    lay['wedding_town_hall'] = wedding_layout(builds)
    lay['farewell_garden'] = farewell_layout()
    man['layouts'] = lay
    return man


# --------------------------------------------------------------------------- pack

def quantize(sheet):
    import imagequant
    return imagequant.quantize_pil_image(sheet, dithering_level=0.6, max_quality=100, min_quality=0, max_colors=256)


def pack_groups(groups):
    out = []
    for g in ATLAS_ORDER + sorted(set(groups) - set(ATLAS_ORDER)):
        if g not in groups:
            continue
        blds = sorted(groups[g], key=lambda fr: -sum(im.width * im.height for _, im in fr))
        sheets = []
        for fr in blds:
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


def pack_all(builds, strollers, frames, sframes, mode):
    groups = {}
    for k, m in builds.items():
        names = list(m['frames']) + ([m['overlay']['key']] if m.get('overlay') else [])
        groups.setdefault(m['atlas'], []).append([(n, frames[n]) for n in names])
    sheets = pack_groups(groups)
    for s in STROLLERS:
        if s in strollers:
            items = [(n, sframes[(s, n)]) for n in strollers[s]['names']]
            sheet, atlas = pu.pack_atlas(items, max_width=MAX_SHEET, trim=True, padding=2)
            sheets.append(('l2_' + s, sheet, atlas))
    for akey, sheet, atlas in sheets:
        if sheet.width > MAX_SHEET or sheet.height > MAX_SHEET:
            raise SystemExit('life2_pack: atlas %s is %dx%d (> %d)' % (akey, sheet.width, sheet.height, MAX_SHEET))
    os.makedirs(OUT, exist_ok=True)
    for fn in os.listdir(OUT):
        if (fn.startswith('life2_') or fn.startswith('l2_')) and fn.endswith(('.png', '.json')):
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
        print('%-20s %4dx%-4d %3d frames %7.1f KB' % (akey, sheet.width, sheet.height, len(atlas['frames']),
                                                     sizes[akey] / 1024.0))
    return sheets, frame_atlas, total


# --------------------------------------------------------------------------- people for the previews

class People:
    """Read-only access to existing characters for scale: villagers (sit / sad / talk ...), the chief, townsfolk
    (paper-doll compositor) - and townsfolk2 parts when that fragment exists."""

    def __init__(self):
        import bld_pack as bp
        self.libs = [bp.atlas_lib('villagers/manifest.json'), bp.atlas_lib('villagers2/manifest.json'),
                     bp.atlas_lib('characters/manifest.json')]
        self.tf = None
        try:
            from townfolk_compose import Townfolk
            self.tf = Townfolk.from_assets()
        except Exception as e:      # noqa: BLE001
            print('note: townsfolk compositor unavailable (%s) - previews use villagers only' % e)

    def char(self, key, frame, flip=False):
        for lib in self.libs:
            if lib and key in lib[0].get('characters', {}):
                im = lib[1](lib[0]['characters'][key]['atlas'], frame)
                if im is not None:
                    return im.transpose(Image.FLIP_LEFT_RIGHT) if flip else im
        return None

    def townsfolk(self, person, anim, d, i=0):
        if self.tf is None:
            return None
        try:
            return self.tf.compose(person, anim, d, i)
        except Exception:           # noqa: BLE001
            return None

    def random(self, seed, age=None):
        if self.tf is None:
            return None
        rng = random.Random(seed)
        for _ in range(40):
            p = self.tf.random_person(rng=rng)
            if age is None or p['base'].startswith(age):
                return p
        return p

    def bride(self):
        if self.tf is None:
            return None
        return {'base': 'adult_slim', 'look': 'A', 'preset': None, 'face': 'lash', 'nose': 'button',
                'parts': ['top_dress', 'bot_tights', 'shoe_shoes', 'hair_bun', 'acc_necklace', 'acc_ribbon'],
                'colors': {'skin': '#F6CFAE', 'hair': '#5A3A2A', 'top': '#FBF7F2', 'top2': '#FFFFFF', 'fur': '#FFFFFF',
                           'bottom': '#FBF7F2', 'bottom2': '#FFFFFF', 'shoes': '#F4EDE0', 'hat': '#FFFFFF',
                           'hat2': '#F59AB8', 'acc': '#F28DB2', 'acc2': '#FFFFFF', 'bag': '#FFFFFF',
                           'glasses': '#8A5A33', 'sleeve': '#FBF7F2', 'hands': '#F6CFAE'}}

    def groom(self):
        if self.tf is None:
            return None
        return {'base': 'adult_slim', 'look': 'A', 'preset': None, 'face': 'std', 'nose': 'dot',
                'parts': ['top_blazer', 'bot_pants', 'shoe_shoes', 'hair_sidepart', 'det_bow'],
                'colors': {'skin': '#F2C29A', 'hair': '#2E2420', 'top': '#2E3A5A', 'top2': '#F4F1EA', 'fur': '#F4F1EA',
                           'bottom': '#2E3A5A', 'bottom2': '#2E3A5A', 'shoes': '#2B2629', 'hat': '#2E3A5A',
                           'hat2': '#F4F1EA', 'acc': '#D9483B', 'acc2': '#F28DB2', 'bag': '#6B4A2E',
                           'glasses': '#8A5A33', 'sleeve': '#2E3A5A', 'hands': '#F2C29A'}}


class Scene:
    def __init__(self, W, H, ox, oy, bg=(244, 247, 251)):
        self.W, self.H, self.ox, self.oy = W, H, ox, oy
        self.img = Image.new('RGBA', (W, H), bg + (255,))
        self.ground, self.placed, self.labels = [], [], []

    def p(self, x, y):
        return self.ox + (x + y) * 45.2548, self.oy + (x - y) * 22.6274

    def put(self, im, anchor_px, x=None, y=None, sx=None, sy=None, bias=0.0, ground=False, depth=None):
        if im is None:
            return
        if sx is None:
            sx, sy = self.p(x, y)
        item = (sy + bias if depth is None else depth, im, int(round(sx - anchor_px[0])), int(round(sy - anchor_px[1])))
        (self.ground if ground else self.placed).append(item)

    def person(self, im, sx, sy, bias=0.5, depth=None):
        if im is not None:
            self.put(im, (64, 104), sx=sx, sy=sy, bias=bias, depth=depth)

    def floor(self, tex, x0, x1, y0, y1, edge=(196, 205, 220, 255)):
        poly = [self.p(x0, y0), self.p(x1, y0), self.p(x1, y1), self.p(x0, y1)]
        mask = Image.new('L', (self.W, self.H), 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        tiled = Image.new('RGBA', (self.W, self.H))
        for ty in range(0, self.H, tex.height):
            for tx in range(0, self.W, tex.width):
                tiled.paste(tex, (tx, ty))
        self.img.paste(tiled, (0, 0), mask)
        ImageDraw.Draw(self.img).line(poly + [poly[0]], fill=edge, width=2)

    def label(self, text, sx, sy):
        self.labels.append((text, sx, sy))

    def finish(self, out, caption, sub=None, crop=True):
        for _, im, x, y in sorted(self.ground, key=lambda t: t[0]):
            self.img.alpha_composite(im, (x, y))
        for _, im, x, y in sorted(self.placed, key=lambda t: t[0]):
            self.img.alpha_composite(im, (x, y))
        if crop:
            a = np.asarray(self.img.convert('RGB')).astype(np.int16)
            ys, xs = np.nonzero(np.abs(a - a[0, 0]).max(-1) > 6)
            if len(xs):
                x0, y0 = max(0, xs.min() - 30), max(0, ys.min() - 40)
                x1, y1 = min(self.W, xs.max() + 30), min(self.H, ys.max() + 70)
                self.img = self.img.crop((x0, y0, x1, y1))
                self.labels = [(t, sx - x0, sy - y0) for t, sx, sy in self.labels]
                self.W, self.H = self.img.size
        d = ImageDraw.Draw(self.img)
        f = pp.font(13)
        for text, sx, sy in self.labels:
            tw = f.getlength(text)
            d.rounded_rectangle([sx - tw / 2 - 5, sy - 2, sx + tw / 2 + 5, sy + 16], radius=7, fill=(255, 255, 255, 215))
            d.text((sx - tw / 2, sy), text, fill=(30, 34, 44), font=f)
        hb = 56 if sub else 40
        d.rectangle([0, self.H - hb, self.W, self.H], fill=(31, 95, 168, 255))
        d.text((16, self.H - hb + 7), caption, fill=(255, 255, 255), font=pp.font(18))
        if sub:
            d.text((16, self.H - 24), sub, fill=(220, 232, 248), font=pp.font(13))
        self.img.convert('RGB').save(out, optimize=True)


def pts_of(m, kind, frame=None):
    fr = frame or m['frames'][0]
    return m['framePoints'][fr].get(kind, [])


def dirs_of(m, kind, frame=None):
    fr = frame or m['frames'][0]
    return m['frameDirs'][fr].get(kind, [])


def flip_for(d):
    return (MIRROR.get(d, d), d in MIRROR)


# --------------------------------------------------------------------------- previews

def preview_all(builds, strollers, frames, sframes, out):
    ents = []
    order = sorted(builds, key=lambda k: (ATLAS_ORDER.index(builds[k]['atlas']) if builds[k]['atlas'] in ATLAS_ORDER
                                          else 99, list(builds).index(k)))
    for k in order:
        m = builds[k]
        if m['kind'] == 'item':
            continue
        for n in m['frames']:
            if '_rock_' in n:
                continue
            ents.append((n, frames[n]))
        if m.get('overlay'):
            ents.append((m['overlay']['key'] + ' (overlay)', frames[m['overlay']['key']]))
    for k in order:
        m = builds[k]
        if m['kind'] == 'item':
            im = frames[m['frames'][0]]
            ents.append((k + ' (2x)', im.resize((im.width * 2, im.height * 2), Image.LANCZOS)))
    for s in STROLLERS:
        if s in strollers:
            for d in DIRS:
                ents.append(('%s idle_%s' % (s, d), sframes[(s, 'idle_%s_0' % d)]))
            ents.append(('%s move_SE (2x)' % s, sframes[(s, 'move_SE_2')].resize((256, 256), Image.LANCZOS)))
    pp.shelf_preview(ents, out, bg=(236, 241, 248), max_w=2200,
                     title='assets/life2 at 1x (PPU 64): wedding, farewell garden, decor, items (2x), baby strollers')


def preview_wedding(builds, strollers, frames, sframes, out):
    """The town hall (assets/town, read-only) dressed for a wedding, with townsfolk / villagers for scale."""
    import bld_pack as bp
    town = bp.atlas_lib('town/manifest.json')
    P = People()
    sc = Scene(2600, 1900, 1500, 760)
    road = os.path.join(ASSETS, 'ui2', 'ground_road.png')
    if os.path.exists(road):
        sc.floor(Image.open(road).convert('RGBA'), -3.2, 3.0, -8.4, -2.3)
    hall_im = None
    if town:
        tm = town[0]['sprites'].get('town_hall')
        if tm:
            hall_im = town[1](tm['atlas'], tm['frame'])
            fw, fh = tm['frameSize']
            sc.put(hall_im, (tm['anchor'][0] * fw, tm['anchor'][1] * fh), 0.0, 0.0)
            for k, name in (('streetlight', (-3.5, -1.0)),):
                sm = town[0]['sprites'].get(k)
                if sm:
                    sc.put(town[1](sm['atlas'], sm['frame']), (sm['anchor'][0] * sm['frameSize'][0],
                                                              sm['anchor'][1] * sm['frameSize'][1]), *name)
    lay = wedding_layout(builds)
    seen_label = set()
    hall_depth = sc.p(0.0, 0.0)[1]
    for it in lay['items']:
        k = it['sprite']
        m = builds.get(k)
        if not m:
            continue
        x, y = it['m']
        if k == 'ribbon_garland':
            sc.put(frames[k], m['anchorPx'], x, y, depth=hall_depth + 0.5)
        else:
            sc.put(frames[m['frames'][0]], m['anchorPx'], x, y, ground=(m['kind'] == 'decal'))
        if k not in seen_label:
            seen_label.add(k)
            sx, sy = sc.p(x, y)
            top = m['topPx'][m['frames'][0]] if isinstance(m['topPx'], dict) else 0
            if k == 'ribbon_garland':
                sc.label('ribbon_garland (on town_hall)', sx - 40, sy - 300)
            elif k == 'wedding_carpet':
                sc.label(k, sx - 30, sy - 8)
            elif k == 'wedding_chairs':
                sc.label('wedding_chairs (rows)', sx - 70, sy + 22)
            elif k == 'flower_stand':
                sc.label(k, sx, sy + 10)
            else:
                sc.label(k, sx, sy - top - 24)
    # seated guests: the villagers that have `sit` (townsfolk get sit in assets/townfolk2)
    sitters = ['npc_grandma', 'npc_aunt', 'npc_bard', 'npc_grandpa', 'npc_herbalist', 'npc_aunt', 'npc_grandpa',
               'npc_grandma', 'npc_bard']
    ch = builds.get('wedding_chairs')
    k = 0
    if ch:
        seats = pts_of(ch, 'seat')
        rows = [tuple(it['m']) for it in lay['items'] if it['sprite'] == 'wedding_chairs']
        for r, (bx, by) in enumerate(rows):
            for j, s in enumerate(seats):
                if (r * 3 + j) % 3 == 1 or (r >= 4 and j != 0):
                    continue                    # a few free seats so the chairs read
                sx0, sy0 = sc.p(bx, by)
                im = P.char(sitters[k % len(sitters)], 'sit_SE_%d' % (k % 4), flip=True)
                sc.person(im, sx0 + s[0], sy0 + s[1], depth=sy0 + 1 + s[1] * 0.001)
                k += 1
    # couple + officiant at the arch
    am = builds.get('wedding_arch')
    if am:
        ax, ay = sc.p(0.0, -7.15)
        cp = pts_of(am, 'couple')
        br, gr = P.bride(), P.groom()
        if len(cp) == 2:
            sc.person(P.townsfolk(br, 'happy', 'E', 1) if br else P.char('npc_teen_girl', 'happy_E_1'),
                      ax + cp[0][0], ay + cp[0][1], depth=ay + 2)
            sc.person(P.townsfolk(gr, 'talk', 'W', 2) if gr else P.char('npc_young_man', 'talk_E_2', flip=True),
                      ax + cp[1][0], ay + cp[1][1], depth=ay + 2.1)
            sc.label('couple', ax, ay + 18)
        op = pts_of(am, 'officiant')
        if op:
            sc.person(P.char('player', 'idle_S_0'), ax + op[0][0], ay + op[0][1], depth=ay + 1.5)
    # standing guests
    hx, hy = sc.p(0, 0)
    for j, (pt, d) in enumerate(zip(lay['standPoints'], lay['standDirs'])):
        rd, fl = flip_for(d)
        person = P.random(500 + j * 13)
        anim = ('wave', 'happy', 'talk')[j % 3]
        im = P.townsfolk(person, anim, d, j % 6) if person else P.char('npc_red', '%s_%s_0' % (anim, rd), flip=fl)
        sc.person(im, hx + pt[0], hy + pt[1])
    # cake: the dog waits for a crumb
    sc.person(P.char('pet_dog', 'sit_SE_0'), *sc.p(2.75, -6.9))
    # a parent with the baby stroller arriving
    if 'baby_stroller' in strollers:
        m = strollers['baby_stroller']
        d = 'E'
        px0, py0 = sc.p(-5.2, -8.2)
        off = stroller_entry('baby_stroller', m, sframes)['pushOffset'][d]
        pusher = P.random(77, 'adult')
        sc.person(P.townsfolk(pusher, 'walk', d, 3) if pusher else P.char('npc_aunt', 'walk_E_3'), px0, py0)
        sc.put(sframes[('baby_stroller', 'move_E_3')], m['anchorPx'], sx=px0 + off[0], sy=py0 + off[1], bias=1.0)
        sc.label('baby_stroller', px0 + off[0] + 10, py0 + off[1] + 12)
    sc.finish(out, 'Wedding at the town hall, 1x PPU 64: assets/life2 + town_hall (assets/town) with ribbon_garland',
              sub='layout = manifest layouts.wedding_town_hall; seated guests = villagers (sit), standing = townsfolk; '
                  'bride / groom are plain townsfolk stand-ins (outfits: assets/townfolk2)')


def preview_memorial(builds, strollers, frames, sframes, out):
    P = People()
    sc = Scene(1700, 1100, 820, 560)
    gm = builds.get('memorial_garden')
    if not gm:
        return
    sc.put(frames['memorial_garden'], gm['anchorPx'], 0.0, 0.0)
    gx, gy = sc.p(0.0, 0.0)
    gdepth = gy
    sc.label('memorial_garden', gx - 150, gy - 230)
    stones = pts_of(gm, 'stone')
    sm = builds.get('memorial_stone')
    wm = builds.get('flower_wreath')
    if sm:
        for i in (0, 1, 2):
            s = stones[i]
            sc.put(frames['memorial_stone'], sm['anchorPx'], sx=gx + s[0], sy=gy + s[1], depth=gdepth + 1 + s[1] * 0.001)
        sc.label('memorial_stone x3 (stonePoints 0-2)', gx + stones[1][0] - 20, gy + stones[1][1] + 14)
        # newest stone = 2: wreath + mourners + someone laying flowers
        s = stones[2]
        sx0, sy0 = gx + s[0], gy + s[1]
        if wm:
            w = pts_of(sm, 'wreath')[0]
            sc.put(frames['flower_wreath'], wm['anchorPx'], sx=sx0 + w[0], sy=sy0 + w[1],
                   depth=gdepth + 1 + (s[1] + w[1]) * 0.001)
            sc.label('flower_wreath', sx0 + w[0], sy0 + w[1] - 92)
        mp, md = pts_of(sm, 'mourner'), dirs_of(sm, 'mourner')
        for j, (p, d) in enumerate(zip(mp, md)):
            rd, fl = flip_for(d)
            key = ('npc_aunt', 'npc_uncle')[j]
            sc.person(P.char(key, 'sad_%s_%d' % (rd, j), flip=fl), sx0 + p[0], sy0 + p[1],
                      depth=gdepth + 1 + (s[1] + p[1]) * 0.001 + 0.0005)
        lp = pts_of(sm, 'lay')
        if lp:
            sc.person(P.char('npc_kid_girl', 'idle_N_0'), sx0 + lp[0][0], sy0 + lp[0][1],
                      depth=gdepth + 1 + (s[1] + lp[0][1]) * 0.001)
    gp, gd = pts_of(gm, 'gather'), dirs_of(gm, 'gather')
    for j, (p, d) in enumerate(zip(gp, gd)):
        if j in (2, 3, 5):
            continue
        rd, fl = flip_for(d)
        person = P.random(900 + j * 7)
        im = P.townsfolk(person, 'idle', 'NE' if j % 2 else 'NW', 0) if person else P.char('npc_blue', 'idle_N_0')
        sc.person(im, gx + p[0], gy + p[1], depth=gdepth + 1 + p[1] * 0.001)
    seats = pts_of(gm, 'seat')
    if seats:
        sc.person(P.char('npc_grandpa', 'sit_S_1'), gx + seats[0][0], gy + seats[0][1], depth=gdepth + 1)
    # a second, empty garden spot view: stones 3-5 left free
    sc.label('free stone spots (stonePoints 3-5)', gx + stones[4][0] + 30, gy + stones[4][1] + 40)
    sc.finish(out, 'Memorial garden, 1x PPU 64: a gentle, warm flower farewell (assets/life2)',
              sub='garden + 3 memorial_stones + flower_wreath; family = villagers (sad), friends = townsfolk; '
                  'layout = manifest layouts.farewell_garden')


def preview_anims_gif(builds, strollers, frames, sframes, out, bg=(236, 241, 248)):
    import bld_pack as bp
    sts = [s for s in STROLLERS if s in strollers]
    cr = builds.get('cradle')
    W = 128 * 2 * 5 + 40
    H = 128 * 2 * len(sts) + (300 if cr else 0) + 20
    imgs, durs = [], []
    for f in range(24):
        im = Image.new('RGBA', (W, H), bg + (255,))
        dr = ImageDraw.Draw(im)
        y = 10
        for s in sts:
            for j, d in enumerate(DIRS):
                anim = 'move' if j % 2 == 0 else 'idle'
                n = 8 if anim == 'move' else 4
                fi = (f if anim == 'move' else f // 2) % n
                fr = sframes[(s, '%s_%s_%d' % (anim, d, fi))].resize((256, 256), Image.LANCZOS)
                im.alpha_composite(fr, (20 + j * 256, y))
                dr.text((30 + j * 256, y + 4), '%s %s' % (anim, d), fill=(30, 34, 44), font=pp.font(13))
            y += 256
        if cr:
            seq = cr['sprites']['cradle']['anims']['rock']['frames']
            fr = frames[seq[(f // 3) % 4]]
            fr = fr.resize((fr.width * 2, fr.height * 2), Image.LANCZOS)
            im.alpha_composite(fr, (20, y))
            dr.text((30, y + 4), 'cradle rock', fill=(30, 34, 44), font=pp.font(13))
        imgs.append(im.convert('RGB'))
        durs.append(83)
    bp._gif(imgs, durs, out)


# --------------------------------------------------------------------------- guard + main

def guard(cache, have, need, in_manifest, allow_partial):
    if not have:
        raise SystemExit('life2_pack: 중단 - 렌더 캐시 %s 에 그림이 하나도 없습니다. 아무 파일도 바꾸지 않았습니다.\n'
                         'life2_pack: ABORT - no renders in the cache %s; nothing was written (an empty manifest is '
                         'never written, not even with --allow-partial).' % (cache, cache))
    missing = sorted(set(need) - set(have))
    if not missing:
        return []
    listing = ' '.join(k + ('' if k in in_manifest else '*') for k in missing)
    if allow_partial:
        print('life2_pack: WARNING --allow-partial: %d key(s) are not in the cache and will be DROPPED / 캐시에 없는 '
              '%d개는 빠집니다: %s' % (len(missing), len(missing), listing), flush=True)
        return missing
    raise SystemExit(
        'life2_pack: 중단 - 지금 매니페스트(또는 필수 목록)에 있는 %d개가 렌더 캐시 %s 에 없습니다. 아무 파일도 바꾸지 '
        '않았습니다.\nlife2_pack: ABORT - %d key(s) in the current manifest (or life2_check.REQUIRED; * = only there) '
        'are missing from the render cache %s; packing now would DELETE them. Nothing was written.\n    %s\n'
        '  fix / 고치기: /tmp/bvenv/bin/python tools/blender/life2_render.py -- <keys> first, or pass --cache <full '
        'cache>; to drop them on purpose re-run with --allow-partial' % (len(missing), cache, len(missing), cache,
                                                                         listing))


def main():
    global OUT, PREV
    args = sys.argv[1:]
    if '--out' in args:
        OUT = os.path.abspath(args[args.index('--out') + 1])
    if '--prev' in args:
        PREV = os.path.abspath(args[args.index('--prev') + 1])
    cache = os.path.join(tempfile.gettempdir(), 'fv_cache', 'life2')
    if '--cache' in args:
        cache = args[args.index('--cache') + 1]
    mode = args[args.index('--quantize') + 1] if '--quantize' in args else 'auto'
    if not os.path.isdir(cache):
        sys.exit('life2_pack: 중단 - 렌더 캐시 폴더가 없습니다 / ABORT - render cache %s does not exist; nothing was '
                 'written. Run life2_render.py first or pass --cache DIR.' % cache)
    builds, strollers, frames, sframes = load(cache)
    have = set()
    for k, m in builds.items():
        have |= set(m['sprites'])
        if m.get('overlay'):
            have.add(m['overlay']['key'])
    have |= {'char:' + s for s in strollers}
    man_path = os.path.join(OUT, 'manifest.json')
    old = json.load(open(man_path, encoding='utf-8')) if os.path.exists(man_path) else None
    try:
        from life2_check import REQUIRED, REQUIRED_CHARS
    except ImportError:
        REQUIRED, REQUIRED_CHARS = [], []
    need = set(REQUIRED) | {'char:' + c for c in REQUIRED_CHARS}
    in_man = set()
    if old:
        in_man = set(old.get('sprites', {})) | {'char:' + c for c in old.get('characters', {})}
        need |= in_man
    guard(cache, have, need, in_man, '--allow-partial' in args)
    sheets, frame_atlas, total = pack_all(builds, strollers, frames, sframes, mode)
    man = build_manifest(builds, strollers, frame_atlas, [s[0] for s in sheets], frames, sframes, old)
    if not man['sprites'] and not man['characters']:
        sys.exit('life2_pack: refusing to write an empty manifest / 빈 매니페스트는 쓰지 않습니다')
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(man, f, indent=1, ensure_ascii=False)
    total += os.path.getsize(man_path)
    print('sprites: %d  characters: %d  payload %.2f MB' % (len(man['sprites']), len(man['characters']),
                                                            total / 1048576.0))
    if '--no-previews' not in args:
        os.makedirs(PREV, exist_ok=True)
        preview_all(builds, strollers, frames, sframes, os.path.join(PREV, 'life2_all.png'))
        preview_wedding(builds, strollers, frames, sframes, os.path.join(PREV, 'life2_wedding.png'))
        preview_memorial(builds, strollers, frames, sframes, os.path.join(PREV, 'life2_memorial.png'))
        if strollers:
            preview_anims_gif(builds, strollers, frames, sframes, os.path.join(PREV, 'life2_anims.gif'))
        print('previews: docs/previews/life2_all.png, life2_wedding.png, life2_memorial.png, life2_anims.gif')


if __name__ == '__main__':
    main()
