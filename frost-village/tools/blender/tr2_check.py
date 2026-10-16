"""
tr2_check.py - verify assets/train2/ against docs/CONTRACT_V42.md section AK (+ AN readability / budget rules).

    python3 tools/blender/tr2_check.py [--out DIR] [--json FILE]

No Blender and no render cache needed (it reads the shipped atlases, assets/town for the engine and rail_x, and
assets/logistics for the crate icons).  Checks:

  files      exactly the 9 contract files (4 atlases x png + json, manifest); every sheet <= 2048 px; json meta size
             = png size; no key collides with another fragment's manifest
  cars       keys, kind "train", dirs S SE E NE N + mirrors, frameName, anims idle 1 / move 8 (all 5 dirs) /
             door_open 4 once (box car, SE + NE only); every {anim}_{dir}_{i} frame + 8 shadow frames exist;
             frameSize <= the contract maximum; anchor normalised = anchorPx / frameSize; lengthM / bodyM / couplerM
             as the contract (coupler stubs >= 0.3 m); the 8 move frames differ (wheels turn) and loop back
  points     every point inside its frame; doorPoints L / R on the car's left / right, [front, rear] in front of /
             behind the centre; windowPoints / lampPoints / cargoSlots / cargoPoint on the car's pixels;
             6 cargoSlots per dir on the empty deck (no deck clutter under a slot); stackStep 14; headTop above the
             anchor; boundsPx = the opaque bounds
  look       coach roof not red (hue of the roof pixels), sky-blue lower body, chestnut box car; door_open frame 3
             shows the open door (changed pixels in the door area); silhouette test at 0.3 scale (engine, coach,
             box car, flat car distinguishable as flat colour blobs); measured coupler gap in the consist >= 0.3 m;
             each car >= 45 CSS px long at zoom 0.6 on a 390 px phone
  rails      loop decals: anchorPx / anchorWorldPx = the lattice T1 = L(-1, 0) / T2 = L(37, 0); pointsPx = the
             lattice points of the plan; tilesUnder = the rail_x tiles under the decal; matte residual small; the
             plain straight between A and the turnout is NOT in the decal (alpha 0 over the track bed); the decal
             reaches A and T; fence tile step / seamless shadow over a 4-tile run; end post; switch stand 2 frames;
             water tower pour 6 frames, footprint fits the loop infield
  budget     page MiB per car (curve dirs at 4 move frames, from the manifest) <= the contract budget; RGBA
             source-sum per atlas and total
  polish     (v42_train2_critique) move frame k + 4 != frame k (one wheel turn, M1); only seen lamps + nightGlow,
             end-door windows apart (M2); labelTopDir (L4); train2_rails = the two decals only, bakeOnly (H1); the
             water tower's pour = overlays over pourBase (H1); its placeHint behind the loop: no car drawn behind
             its body, clear of the ballast, inside the world (H2); the switch stand on the fence line (L5); the
             town loop's east extent vs the world edge (M3, a warning: plan geometry)
Exit 1 on errors.
"""
import colorsys
import json
import math
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '..', '..'))
ASSETS = os.path.join(GAME, 'assets')

CARS = {
    'train_coach': {'max': (240, 216), 'lengthM': 3.0, 'bodyM': 2.7, 'coupler': 1.5, 'budget': 5.0},
    'train_boxcar': {'max': (216, 216), 'lengthM': 2.6, 'bodyM': 2.3, 'coupler': 1.3, 'budget': 5.5},
    'train_flatcar': {'max': (208, 152), 'lengthM': 2.4, 'bodyM': 2.1, 'coupler': 1.2, 'budget': 3.5},
}
DIRS = ['S', 'SE', 'E', 'NE', 'N']
ALL8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW']
MIRROR = {'SW': 'SE', 'W': 'E', 'NW': 'NE'}
HEAD_DEG = {'SE': 0, 'E': 45, 'NE': 90, 'N': 135, 'NW': 180, 'W': 225, 'SW': 270, 'S': 315}  # ground angle (gx = SE)
PX_X, PX_Y = 45.2548, 22.6274
LOOPS = {'rail_loop_ours': (-1, 1), 'rail_loop_town': (37, -1)}     # T lattice i, mirror
FILES = ['manifest.json', 'train_coach.png', 'train_coach.json', 'train_boxcar.png', 'train_boxcar.json',
         'train_flatcar.png', 'train_flatcar.json', 'train2_rails.png', 'train2_rails.json']
CSS_PER_PX_06 = 0.6 * 390.0 / 720.0           # zoom 0.6 on a 390 px phone (720 logical px)


def L(i, j):
    return (3120 + 64 * (i + j), 1315 + 32 * (i - j))


def ground(px, py):
    """screen px offset -> ground metres (gx along world X = screen SE, gy along world -Y = screen NE)"""
    return (px / PX_X + py / PX_Y) / 2.0, (px / PX_X - py / PX_Y) / 2.0


class Atlases:
    def __init__(self, folder):
        self.folder = folder
        self.im = {}
        self.js = {}

    def load(self, key):
        if key not in self.im:
            self.im[key] = Image.open(os.path.join(ASSETS, self.folder, key + '.png')).convert('RGBA')
            self.js[key] = json.load(open(os.path.join(ASSETS, self.folder, key + '.json')))['frames']
        return self.im[key], self.js[key]

    def has(self, key, name):
        return name in self.load(key)[1]

    def frame(self, key, name):
        im, fr = self.load(key)
        f = fr[name]
        r, ss = f['frame'], f['spriteSourceSize']
        out = Image.new('RGBA', (f['sourceSize']['w'], f['sourceSize']['h']))
        out.paste(im.crop((r['x'], r['y'], r['x'] + r['w'], r['y'] + r['h'])), (ss['x'], ss['y']))
        return out


def main():
    out = os.path.join(ASSETS, 'train2')
    jpath = None
    if '--out' in sys.argv:
        out = os.path.abspath(sys.argv[sys.argv.index('--out') + 1])
    if '--json' in sys.argv:
        jpath = os.path.abspath(sys.argv[sys.argv.index('--json') + 1])
    errs, warns, info = [], [], {}
    E = errs.append
    W_ = warns.append

    # ------------------------------------------------------------------ files
    have = sorted(f for f in os.listdir(out) if not f.startswith('.'))
    if sorted(FILES) != have:
        E('files: %s (contract AK = 9 files: %s)' % (have, FILES))
    man = json.load(open(os.path.join(out, 'manifest.json'), encoding='utf-8'))
    for f in ('version', 'generator', 'conventions'):
        if f not in man:
            E('manifest: no %s' % f)
    A = Atlases(os.path.basename(out)) if os.path.dirname(out) == ASSETS else None
    if A is None:
        A = Atlases(os.path.relpath(out, ASSETS))
    srcsum = 0.0
    for a in man['atlases']:
        png = os.path.join(ASSETS, a['png'])
        js = json.load(open(os.path.join(ASSETS, a['json'])))
        im = Image.open(png)
        if im.width > 2048 or im.height > 2048:
            E('atlas %s %dx%d > 2048' % (a['key'], im.width, im.height))
        if [js['meta']['size']['w'], js['meta']['size']['h']] != [im.width, im.height]:
            E('atlas %s json size %s != png %s' % (a['key'], js['meta']['size'], im.size))
        mib = im.width * im.height * 4 / 1048576.0
        srcsum += mib
        info.setdefault('atlasMiB', {})[a['key']] = round(mib, 3)
    info['sourceSumMiB'] = round(srcsum, 2)
    # key collisions with every other fragment
    mine = set(man['sprites']) | set(man['characters'])
    for d in sorted(os.listdir(ASSETS)):
        mp = os.path.join(ASSETS, d, 'manifest.json')
        if d == os.path.basename(out) or not os.path.exists(mp):
            continue
        try:
            o = json.load(open(mp, encoding='utf-8'))
        except Exception:
            continue
        other = set()
        for sec in ('sprites', 'characters', 'fragments'):
            if isinstance(o.get(sec), dict):
                other |= set(o[sec])
        clash = mine & other
        if clash:
            E('key clash with assets/%s: %s' % (d, sorted(clash)))

    # ------------------------------------------------------------------ cars
    town = json.load(open(os.path.join(ASSETS, 'town', 'manifest.json'), encoding='utf-8'))
    T = Atlases('town')
    chars = man['characters']
    for c, spec in CARS.items():
        if c not in chars:
            E('%s missing' % c)
            continue
        m = chars[c]
        tag = c
        if m.get('kind') != 'train':
            E('%s kind %s' % (tag, m.get('kind')))
        if m.get('dirs') != DIRS or m.get('mirror') != MIRROR or m.get('frameName') != '{anim}_{dir}_{i}':
            E('%s dirs / mirror / frameName %s %s %s' % (tag, m.get('dirs'), m.get('mirror'), m.get('frameName')))
        W, H = m['frameSize']
        if W > spec['max'][0] or H > spec['max'][1]:
            E('%s frameSize %s > contract %s' % (tag, m['frameSize'], spec['max']))
        ax, ay = m['anchorPx']
        if abs(m['anchor'][0] * W - ax) > 0.6 or abs(m['anchor'][1] * H - ay) > 0.6:
            E('%s anchor %s != anchorPx %s / frameSize' % (tag, m['anchor'], m['anchorPx']))
        if not (0 < ax < W and 0 < ay < H):
            E('%s anchor outside the frame' % tag)
        if m['lengthM'] != spec['lengthM'] or m['bodyM'] != spec['bodyM']:
            E('%s lengthM / bodyM %s / %s' % (tag, m['lengthM'], m['bodyM']))
        if m['couplerM'] != {'front': -spec['coupler'], 'back': spec['coupler']}:
            E('%s couplerM %s' % (tag, m['couplerM']))
        if (m['lengthM'] - m['bodyM']) < 0.3 - 1e-6:
            E('%s coupler stubs %.2f m < 0.3' % (tag, m['lengthM'] - m['bodyM']))
        want = {'idle': (1, DIRS), 'move': (8, DIRS)}
        if c == 'train_boxcar':
            want['door_open'] = (4, ['SE', 'NE'])
        if set(m['anims']) != set(want):
            E('%s anims %s != %s' % (tag, sorted(m['anims']), sorted(want)))
        for an, (n, dirs) in want.items():
            a = m['anims'].get(an)
            if not a:
                continue
            if a['frames'] != n or a['dirs'] != dirs:
                E('%s %s frames %s dirs %s (want %d %s)' % (tag, an, a['frames'], a['dirs'], n, dirs))
            if an == 'door_open' and a.get('repeat') != 0:
                E('%s door_open must play once (repeat 0)' % tag)
            if an == 'move' and (a.get('fps') != 12 or a.get('repeat') != -1):
                E('%s move fps / repeat %s %s' % (tag, a.get('fps'), a.get('repeat')))
            for d in dirs:
                for i in range(n):
                    nm = '%s_%s_%d' % (an, d, i)
                    if not A.has(m['atlas'], nm):
                        E('%s frame %s missing' % (tag, nm))
                    elif A.frame(m['atlas'], nm).size != (W, H):
                        E('%s frame %s sourceSize != frameSize' % (tag, nm))
        sf = m['shadowFrames']
        if sorted(sf['frames']) != sorted(ALL8):
            E('%s shadowFrames headings %s' % (tag, sorted(sf['frames'])))
        shs = []
        for d in ALL8:
            nm = sf['frames'].get(d)
            if not nm or not A.has(sf['atlas'], nm):
                E('%s shadow %s missing' % (tag, d))
                continue
            im = A.frame(sf['atlas'], nm)
            if list(im.size) != sf['frameSize']:
                E('%s shadow %s size %s != %s' % (tag, d, im.size, sf['frameSize']))
            a = np.asarray(im)[..., 3]
            if (a > 20).sum() < 400:
                E('%s shadow %s nearly empty' % (tag, d))
            shs.append(a.astype(np.int16))
        # the light does not flip: the shadow of a mirrored heading is NOT the flipped shadow of its source
        # (a front / back symmetric car legitimately casts the same shadow at headings 180 deg apart)
        if len(shs) == 8:
            sd = dict(zip(ALL8, shs))
            for md, src in MIRROR.items():
                if np.abs(sd[md] - sd[src][:, ::-1]).mean() < 0.3:
                    E('%s shadow_%s is the mirrored shadow_%s (the light must not flip)' % (tag, md, src))
            if len({a.tobytes() for a in shs}) < 4:
                E('%s fewer than 4 distinct shadow shapes over 8 headings' % tag)
        # wheels turn: 8 distinct move frames, frame 7 -> 0 like the other steps
        for d in DIRS:
            fr = [np.asarray(A.frame(m['atlas'], 'move_%s_%d' % (d, i))).astype(np.int16) for i in range(8)]
            steps = [np.abs(fr[i] - fr[(i + 1) % 8]).mean() for i in range(8)]
            if min(steps) < 0.02:
                E('%s move_%s has identical consecutive frames %s' % (tag, d, [round(s, 3) for s in steps]))
            if steps[7] > 2.5 * (sum(steps[:7]) / 7.0) + 0.05:
                W_('%s move_%s loop seam 7->0 %.3f vs mean step %.3f' % (tag, d, steps[7], sum(steps[:7]) / 7))
            if not np.array_equal(np.asarray(A.frame(m['atlas'], 'idle_%s_0' % d)), fr[0].astype(np.uint8)):
                W_('%s idle_%s_0 differs from move_%s_0' % (tag, d, d))
            # (polish M1) the loop is ONE wheel turn: frame k + 4 is not a repeat of frame k (the packer keeps 0, 2,
            # 4, 6 on the curve dirs, which must stay 4 different pictures, not A-B-A-B)
            half = [np.abs(fr[i] - fr[i + 4]).mean() for i in range(4)]
            info.setdefault('moveHalfTurnDiff', {}).setdefault(c, {})[d] = round(float(min(half)), 2)
            if min(half) < 0.35 * (sum(steps) / 8.0):
                E('%s move_%s repeats every 4 frames (frame k vs k+4 %.2f, mean step %.2f)' %
                  (tag, d, min(half), sum(steps) / 8.0))
        # points
        idle = {d: np.asarray(A.frame(m['atlas'], 'idle_%s_0' % d))[..., 3] for d in DIRS}

        def inside(p, what, d):
            x, y = ax + p[0], ay + p[1]
            if not (0 <= x < W and 0 <= y < H):
                E('%s %s %s %s outside the frame' % (tag, what, d, p))
                return False
            return True

        def on_car(p, what, d, r=3, alpha=idle):
            x, y = int(round(ax + p[0])), int(round(ay + p[1]))
            win = alpha[d][max(0, y - r):y + r + 1, max(0, x - r):x + r + 1]
            if win.size == 0 or win.max() < 128:
                E('%s %s %s %s not on the car' % (tag, what, d, p))

        if not (isinstance(m.get('headTop'), int) and -H < m['headTop'] < 0):
            E('%s headTop %s' % (tag, m.get('headTop')))
        b = m.get('boundsPx', {})
        for d in DIRS:
            bb = Image.fromarray(idle[d]).point(lambda v: 255 if v > 24 else 0).getbbox()
            if d not in b or b[d][0] > bb[0] - ax or b[d][1] > bb[1] - ay or b[d][2] < bb[2] - ax or b[d][3] < bb[3] - ay:
                E('%s boundsPx %s %s does not cover the idle frame %s' % (tag, d, b.get(d), bb))
        if c in ('train_coach', 'train_boxcar'):
            for d in DIRS:
                dp = m['doorPoints'].get(d)
                if not dp or sorted(dp) != ['L', 'R'] or any(len(dp[s]) != 2 for s in 'LR'):
                    E('%s doorPoints %s malformed %s' % (tag, d, dp))
                    continue
                th = math.radians(HEAD_DEG[d])
                h = (math.cos(th), math.sin(th))
                for side in 'LR':
                    for k, p in enumerate(dp[side]):
                        inside(p, 'doorPoint', d)
                        g = ground(*p)
                        cross = h[0] * g[1] - h[1] * g[0]
                        dot = h[0] * g[0] + h[1] * g[1]
                        if (cross > 0) != (side == 'L') or abs(cross) < 0.3:
                            E('%s doorPoints %s %s[%d] %s not on the %s side (cross %.2f m)' %
                              (tag, d, side, k, p, side, cross))
                        if (dot > 0) != (k == 0) and abs(dot) > 0.05:
                            E('%s doorPoints %s %s[%d] %s %s (along %.2f m)' %
                              (tag, d, side, k, p, 'front must lead' if k == 0 else 'rear must trail', dot))
        if c == 'train_coach':
            for d in DIRS:
                wp = m['windowPoints'].get(d, [])
                if not wp and d in ('SE', 'E', 'NE'):       # end views S / N show only the end-door window
                    E('%s windowPoints %s empty' % (tag, d))
                for p in wp:
                    if inside(p, 'windowPoint', d):
                        on_car(p, 'windowPoint', d)
            if len(m['windowPoints']['SE']) < 4 or len(m['windowPoints']['E']) < 4:
                E('%s fewer than 4 lit windows visible on a side (SE %d, E %d)' %
                  (tag, len(m['windowPoints']['SE']), len(m['windowPoints']['E'])))
        if c in ('train_coach', 'train_flatcar'):
            # (polish M2) only the lamps the camera sees in that dir: 1 or 2 (both ends in the side view E)
            for d in DIRS:
                lp = m['lampPoints'].get(d, [])
                if not (1 <= len(lp) <= 2) or (d == 'E' and len(lp) != 2):
                    E('%s lampPoints %s has %d lamps' % (tag, d, len(lp)))
                for p in lp:
                    if inside(p, 'lampPoint', d):
                        on_car(p, 'lampPoint', d, r=4)
            ng = m.get('nightGlow') or {}
            if not ng or ng.get('lampK', 9) > 0.6 or (c == 'train_coach' and ng.get('windowK', 9) > 0.45):
                E('%s nightGlow %s (want windowK <= 0.45, lampK <= 0.6)' % (tag, ng))
        if c == 'train_coach':
            for d, pts_ in (m.get('endWindowPoints') or {}).items():
                for p in pts_:
                    if inside(p, 'endWindowPoint', d):
                        on_car(p, 'endWindowPoint', d)
            for d in DIRS:
                if len(m['windowPoints'].get(d, [])) > 4:
                    E('%s windowPoints %s lists %d windows (the end-door window belongs in endWindowPoints)' %
                      (tag, d, len(m['windowPoints'][d])))
        # (polish L4) label tops 6 px above the drawn silhouette of each dir
        lt = m.get('labelTopDir') or {}
        for d in DIRS:
            if d not in lt or d not in b or lt[d] != b[d][1] - 6:
                E('%s labelTopDir %s %s != boundsPx top - 6' % (tag, d, lt.get(d)))
        if c == 'train_boxcar':
            for d in DIRS:
                p = m['cargoPoint'].get(d)
                if not p or len(p) != 3:
                    E('%s cargoPoint %s malformed' % (tag, d))
                elif inside(p, 'cargoPoint', d):
                    on_car(p, 'cargoPoint', d)
            for d in ('SE', 'NE'):
                f0 = np.asarray(A.frame(m['atlas'], 'door_open_%s_0' % d)).astype(np.int16)
                f3 = np.asarray(A.frame(m['atlas'], 'door_open_%s_3' % d)).astype(np.int16)
                diff = (np.abs(f3 - f0)[..., :3].max(-1) > 40).sum()
                if diff < 600:
                    E('%s door_open_%s_3 barely differs from frame 0 (%d px)' % (tag, d, diff))
                info.setdefault('doorOpenChangedPx', {})[d] = int(diff)
        if c == 'train_flatcar':
            if m.get('stackStep') != 14:
                E('%s stackStep %s (contract ~14)' % (tag, m.get('stackStep')))
            for d in DIRS:
                cs = m['cargoSlots'].get(d, [])
                if len(cs) != 6 or any(len(s) != 3 for s in cs):
                    E('%s cargoSlots %s: %d slots (want 6 x [dx, dy, behind])' % (tag, d, len(cs)))
                    continue
                if [s[1] for s in cs] != sorted(s[1] for s in cs):
                    E('%s cargoSlots %s not sorted back to front' % (tag, d))
                for s in cs:
                    if inside(s, 'cargoSlot', d):
                        on_car(s, 'cargoSlot', d, r=1)
                # the deck under the slots is clear of the baked tarp (green): a slot point never sits on it
                rgb = np.asarray(A.frame(m['atlas'], 'idle_%s_0' % d)).astype(np.int16)
                for s_ in cs:
                    x, y = int(ax + s_[0]), int(ay + s_[1])
                    r, g, b_ = rgb[y, x, :3]
                    if g > r + 25 and g > b_ + 10:
                        E('%s cargoSlot %s %s sits on the green tarp' % (tag, d, s_))
        # AN.1: >= 45 CSS px long at zoom 0.6 (sprite width in the straight-track heading SE and in E)
        for d in ('SE', 'E'):
            bb = b.get(d)
            if bb:
                css = (bb[2] - bb[0]) * CSS_PER_PX_06
                info.setdefault('cssWidthZoom06', {}).setdefault(c, {})[d] = round(css, 1)
                if css < 45:
                    E('%s %s only %.1f CSS px wide at zoom 0.6 (< 45)' % (tag, d, css))
        info.setdefault('alongTrackCssZoom06', {})[c] = round(m['lengthM'] * math.hypot(PX_X, PX_Y) * CSS_PER_PX_06, 1)
        # budget
        bud = man.get('budget', {}).get(c, {})
        if bud.get('pageMiB') is None or bud['pageMiB'] > spec['budget'] + 1e-6:
            E('%s page %s MiB > budget %.1f' % (tag, bud.get('pageMiB'), spec['budget']))
        info.setdefault('pageMiB', {})[c] = bud.get('pageMiB')

    # ------------------------------------------------------------------ look
    def car_img(folder_atl, mdef, anim, d, i=0):
        im = folder_atl.frame(mdef['atlas'], '%s_%s_%d' % (anim, d, i))
        return im, (mdef['anchor'][0] * im.width, mdef['anchor'][1] * im.height)

    def hue_stats(arr, mask):
        px = arr[mask][:, :3] / 255.0
        hs = np.array([colorsys.rgb_to_hsv(*p) for p in px[::7]])
        return hs

    co = chars['train_coach']
    im, (cax, cay) = car_img(A, co, 'idle', 'E')
    a = np.asarray(im)
    alpha = a[..., 3] > 200
    ys, xs = np.where(alpha)
    top = ys.min()
    # roof band: the rows just under the top (snow cap is white: skip low-saturation pixels)
    roof = np.zeros_like(alpha)
    roof[top:top + 22] = alpha[top:top + 22]
    hs = hue_stats(a, roof)
    col = hs[(hs[:, 1] > 0.25) & (hs[:, 2] > 0.15)]
    red = ((col[:, 0] < 0.06) | (col[:, 0] > 0.92)).mean() if len(col) else 1.0
    teal = ((col[:, 0] > 0.42) & (col[:, 0] < 0.62)).mean() if len(col) else 0.0
    info['coachRoof'] = {'redFrac': round(float(red), 3), 'tealFrac': round(float(teal), 3)}
    if red > 0.05 or teal < 0.5:
        E('coach roof is not slate-teal (red %.2f, teal %.2f)' % (red, teal))
    # lower body: rows between the anchor-60 and anchor-35 in E (side panel)
    body = np.zeros_like(alpha)
    body[int(cay - 32):int(cay - 12), int(cax - 60):int(cax + 60)] = alpha[int(cay - 32):int(cay - 12), int(cax - 60):int(cax + 60)]
    hs = hue_stats(a, body)
    blue = ((hs[:, 0] > 0.52) & (hs[:, 0] < 0.63) & (hs[:, 1] > 0.3)).mean()
    info['coachBlueFrac'] = round(float(blue), 3)
    if blue < 0.5:
        E('coach lower body not sky-blue (%.2f of the side panel)' % blue)
    bx = chars['train_boxcar']
    im, (bax, bay) = car_img(A, bx, 'idle', 'E')
    a = np.asarray(im)
    alpha = a[..., 3] > 200
    side = np.zeros_like(alpha)
    side[int(bay - 70):int(bay - 30), int(bax - 80):int(bax - 45)] = alpha[int(bay - 70):int(bay - 30), int(bax - 80):int(bax - 45)]
    hs = hue_stats(a, side)
    brown = ((hs[:, 0] > 0.02) & (hs[:, 0] < 0.11) & (hs[:, 1] > 0.3)).mean()
    info['boxcarChestnutFrac'] = round(float(brown), 3)
    if brown < 0.5:
        E('box car planks not chestnut (%.2f)' % brown)

    # silhouette test at 0.3 scale: flat colour blobs (mean colour + silhouette) of the four units in SE
    units = [('engine', T, town['characters']['train_engine']), ('coach', A, co), ('boxcar', A, bx),
             ('flatcar', A, chars['train_flatcar'])]
    blobs = {}
    for n, atl, mdef in units:
        im, (ux, uy) = car_img(atl, mdef, 'idle', 'SE')
        sm = im.resize((max(1, round(im.width * 0.3)), max(1, round(im.height * 0.3))), Image.LANCZOS)
        from PIL import ImageFilter
        cv0 = Image.new('RGBA', (110, 90), (238, 243, 249, 255))
        cv0.alpha_composite(sm, (int(55 - ux * 0.3), int(70 - uy * 0.3)))
        flat_ = np.asarray(cv0.convert('RGB').filter(ImageFilter.GaussianBlur(1.5))).astype(np.float32)
        cvm = Image.new('L', (110, 90), 0)
        cvm.paste(sm.getchannel('A'), (int(55 - ux * 0.3), int(70 - uy * 0.3)))
        canvas = np.asarray(cvm) > 128
        mean = flat_[canvas].mean(0)
        blobs[n] = (mean, canvas, flat_)
    sil = {}
    for i, (n1, _, _) in enumerate(units):
        for n2, _, _ in units[i + 1:]:
            m1, c1, f1 = blobs[n1]
            m2, c2, f2 = blobs[n2]
            dcol = float(np.linalg.norm(m1 - m2))
            iou = float((c1 & c2).sum() / max(1, (c1 | c2).sum()))
            u = c1 | c2
            dimg = float(np.abs(f1[u] - f2[u]).mean())      # blurred colour-blob images over the union
            sil['%s/%s' % (n1, n2)] = {'colourDist': round(dcol, 1), 'iou': round(iou, 2), 'blobDiff': round(dimg, 1)}
            if dimg < 30:
                E('silhouette test: %s and %s look alike at 0.3 scale (blob diff %.0f, IoU %.2f)' % (n1, n2, dimg, iou))
    info['silhouette'] = sil
    info['blobColours'] = {n: [int(v) for v in blobs[n][0]] for n in blobs}

    # measured coupler gap in heading E (64 px per metre): each unit's body = the columns of its E frame at least 40 %
    # as tall as the unit itself (couplers, buffers, beams and steps are lower); gap = anchor spacing - the rear body
    # end of the unit in front - the front body end of the unit behind (cars face +x in E)
    def body_ends(atl, mdef):
        im, (ux, _) = car_img(atl, mdef, 'idle', 'E')
        h = (np.asarray(im)[..., 3] > 128).sum(0)
        cols = np.where(h >= 0.4 * h.max())[0]
        return (ux - cols.min()) / 64.0, (cols.max() + 1 - ux) / 64.0      # rear, front (metres from the anchor)

    tc = town['characters']['train_engine']
    units_e = {'engine': (T, tc), 'coach': (A, co), 'boxcar': (A, bx), 'flatcar': (A, chars['train_flatcar'])}
    ends = {n: body_ends(*v) for n, v in units_e.items()}
    info['bodyEndsM'] = {n: [round(v[0], 3), round(v[1], 3)] for n, v in ends.items()}
    gaps = {}
    sp0 = man['trainConsist']['village']['spacingM'][0]
    for n1, n2, spc in (('engine', 'coach', sp0), ('coach', 'coach', 3.0), ('coach', 'boxcar', 2.8),
                        ('boxcar', 'flatcar', 2.5)):
        g = spc - ends[n1][0] - ends[n2][1]
        gaps['%s-%s' % (n1, n2)] = round(g, 3)
        if n1 == 'engine':
            if g < 0.2:
                E('visible gap engine-coach %.2f m (the engine is assets/town art; want >= 0.2)' % g)
            elif g < 0.3:
                W_('visible gap engine-coach %.2f m < 0.3 m: the town engine body overhangs its rear coupler '
                   '(couplerOverride already used)' % g)
        elif g < 0.3 - 0.01:
            E('visible coupler gap %s-%s %.2f m < 0.3 m' % (n1, n2, g))
    info['couplerGapM'] = gaps

    # ------------------------------------------------------------------ rails
    sp = man['sprites']
    rx = town['sprites']['rail_x']
    rxi = T.frame(rx['atlas'], rx['frame'])
    rxa = (rx['anchor'][0] * rxi.width, rx['anchor'][1] * rxi.height)
    for key, (iT, mx) in LOOPS.items():
        s = sp.get(key)
        if not s:
            E('%s missing' % key)
            continue
        if s.get('kind') != 'decal' or s.get('layer') != 'ground' or s.get('drawAfter') != 'rail_x':
            E('%s kind / layer / drawAfter %s %s %s' % (key, s.get('kind'), s.get('layer'), s.get('drawAfter')))
        if s['anchorLattice'] != [iT, 0] or s['anchorWorldPx'] != list(L(iT, 0)):
            E('%s anchor lattice %s world %s (want %s %s)' % (key, s['anchorLattice'], s['anchorWorldPx'], [iT, 0], L(iT, 0)))
        im = A.frame(s['atlas'], s['frame'])
        W, H = im.size
        if [W, H] != s['frameSize']:
            E('%s frame %s != frameSize %s' % (key, im.size, s['frameSize']))
        ax, ay = s['anchorPx']
        if abs(s['anchor'][0] * W - ax) > 0.01 or abs(s['anchor'][1] * H - ay) > 0.01:
            E('%s normalised anchor %s does not give anchorPx %s exactly' % (key, s['anchor'], s['anchorPx']))
        want = {'T': (0, 0), 'D': (-1.75, 1.75), 'C': (-3.5, 3.5), 'B': (-5, 3.5), 'A': (-5, 0), 'far': (-6.75, 1.75)}
        for n, (di, j) in want.items():
            wx, wy = L(iT + mx * di, j)
            got = s['pointsPx'].get(n)
            if got != [wx - L(iT, 0)[0], wy - L(iT, 0)[1]]:
                E('%s point %s %s != lattice (%s, %s) -> %s' % (key, n, got, iT + mx * di, j,
                                                                [wx - L(iT, 0)[0], wy - L(iT, 0)[1]]))
            if n != 'far' and not (0 <= ax + got[0] < W and 0 <= ay + got[1] < H):
                E('%s point %s outside the frame' % (key, n))
        ks = [t['k'] for t in s['tilesUnder']]
        need = list(range(-6, 3)) if mx > 0 else list(range(34, 42))
        if ks != need:
            E('%s tilesUnder %s != %s' % (key, ks, need))
        for t in s['tilesUnder']:
            if t['worldPx'] != list(L(t['k'] + 0.5, 0)):
                E('%s tile %s worldPx %s' % (key, t['k'], t['worldPx']))
        mt = s.get('matte', {})
        if mt.get('p999Err', 99) > 1.0 or mt.get('maxErr', 999) > 60 or mt.get('infeasiblePx', 1e9) > 600:
            E('%s matte residual %s' % (key, mt))
        info.setdefault('matte', {})[key] = mt
        # path length = plan (17.5 cells round the loop = straight T -> A 5 + 12.5): the decal path T -> A
        if abs(s['pathLengthM'] - 12.5 * math.sqrt(2) + 0.0) > 0.05 * 12.5 * math.sqrt(2) + 0.1:
            W_('%s pathLengthM %.2f vs plan 12.5 cells = %.2f m' % (key, s['pathLengthM'], 12.5 * math.sqrt(2)))
        # decal over its tiles (exactly as RoadPaint draws them) on a snow colour
        canvas = Image.new('RGBA', (W, H), (238, 243, 249, 255))
        tiles = Image.new('RGBA', (W, H))
        for t in s['tilesUnder']:
            tiles.alpha_composite(rxi, (int(round(ax + t['at'][0] - rxa[0])), int(round(ay + t['at'][1] - rxa[1]))))
        canvas.alpha_composite(tiles)
        comp = canvas.copy()
        comp.alpha_composite(im)
        da = np.asarray(im)[..., 3].astype(np.float32)
        px, py = np.meshgrid(np.arange(W) + 0.5 - ax, np.arange(H) + 0.5 - ay)
        gx, gy = (px / PX_X + py / PX_Y) / 2.0, (px / PX_X - py / PX_Y) / 2.0
        dd = -gx * mx                                    # metres from T toward the loop along the main line
        sq2 = math.sqrt(2)
        bed = (np.abs(gy) < 0.6) & (dd > 3.2) & (dd < 5 * sq2 - 1.2)   # plain straight bed, between turnout and A
        if bed.sum() < 200:
            E('%s straight-bed probe empty' % key)
        elif da[bed].max() > 3:
            E('%s paints over the plain straight between A and the turnout (max alpha %d)' % (key, da[bed].max()))
        info.setdefault('straightBedMaxAlpha', {})[key] = int(da[bed].max()) if bed.sum() else None
        # it owns the loop at A (curve start) and the turnout at T
        for nm, (u, y) in {'A_joint': (5 * sq2 + 0.3, 0.0), 'turnout': (1.2, 0.0), 'far': (6.75 * sq2, 1.75 * sq2),
                           'B': (5 * sq2, 3.5 * sq2), 'C': (3.5 * sq2, 3.5 * sq2), 'D': (1.75 * sq2, 1.75 * sq2)}.items():
            m = (np.abs(dd - u) < 0.3) & (np.abs(gy - y) < 0.3)
            if m.sum() == 0 or da[m].mean() < 128:
                E('%s does not cover %s (mean alpha %.0f)' % (key, nm, da[m].mean() if m.sum() else -1))
        # seam at A: the ballast across the joint (composite) vs. the plain tile ballast 1 m further in
        ca = np.asarray(comp).astype(np.float32)[..., :3]
        ta = np.asarray(canvas).astype(np.float32)[..., :3]
        band = np.abs(gy) < 0.45
        dA = 5 * sq2
        # one tile period (sqrt 2 m) of plain tiles before the ramp vs. one period of the decal's own straight after it
        pre = band & (dd > dA - 0.6 - sq2) & (dd < dA - 0.6)
        post = band & (dd > dA - 0.35) & (dd < dA - 0.35 + sq2) & (np.abs(gy) < 0.45)
        same = band & (dd > dA - 0.35) & (dd < dA)
        if pre.sum() and post.sum():
            dj = float(np.abs(ca[post].mean(0) - ca[pre].mean(0)).max())
            dk = float(np.abs(ca[same] - ta[same]).mean())
            info.setdefault('seamA', {})[key] = {'periodMeanDiff': round(dj, 1), 'repaintVsTileMeanAbs': round(dk, 1)}
            if dj > 12:
                E('%s straight track colour changes across the matte ramp at A by %.1f' % (key, dj))
        Image.fromarray(np.asarray(comp)).save(os.path.join('/tmp', 'tr2_check_%s.png' % key)) if '--dump' in sys.argv else None
    # fence: a 4-tile run + end post: the shadows join (no double-dark joint), tile step and post ownership
    f = sp.get('rail_fence_x')
    fe = sp.get('rail_fence_x_end')
    if f and fe:
        if f.get('tileAxis') != 'x' or f.get('stepPx') != [64, 32] or f.get('postEnd') != '-x':
            E('rail_fence_x tileAxis / stepPx / postEnd %s %s %s' % (f.get('tileAxis'), f.get('stepPx'), f.get('postEnd')))
        if f['frameSize'][0] > 160 + 8 or f['frameSize'][1] > 112 + 8:
            W_('rail_fence_x frame %s vs contract 160 x 112' % f['frameSize'])
        fi = A.frame(f['atlas'], f['frame'])
        ei = A.frame(fe['atlas'], fe['frame'])
        cv = Image.new('RGBA', (520, 300))
        for t in range(4):
            cv.alpha_composite(fi, (60 + 64 * t - f['anchorPx'][0], 80 + 32 * t - f['anchorPx'][1]))
        cv.alpha_composite(ei, (60 + 64 * 4 - 32 - fe['anchorPx'][0], 80 + 32 * 4 - 16 - fe['anchorPx'][1]))
        # the run is continuous: no transparent hole along the fence line between the posts
        al = np.asarray(cv).astype(np.float32)[..., 3]
        holes = 0
        for t in np.linspace(0.2, 3.8, 37):
            x, y = 60 + 64 * t - 32, 80 + 32 * t - 16
            col = al[int(y) - 40:int(y) + 2, int(round(x))]
            if col.max() < 128:
                holes += 1
        info['fenceRunHoles'] = holes
        if holes:
            E('rail_fence_x run has %d gaps along the fence line' % holes)
    else:
        E('fence keys missing')
    ss = sp.get('rail_switch_stand')
    if not ss or ss.get('frames') != ['rail_switch_stand_idle_0', 'rail_switch_stand_idle_1'] or \
            sorted(ss.get('states', {})) != ['green', 'yellow']:
        E('rail_switch_stand frames / states %s' % (ss and (ss.get('frames'), ss.get('states'))))
    else:
        g0 = np.asarray(A.frame(ss['atlas'], ss['frames'][0])).astype(np.int16)
        g1 = np.asarray(A.frame(ss['atlas'], ss['frames'][1])).astype(np.int16)
        lx, ly = ss['anchorPx'][0] + ss['lampPoint'][0], ss['anchorPx'][1] + ss['lampPoint'][1]
        p0 = g0[ly - 2:ly + 3, lx - 2:lx + 3, :3].reshape(-1, 3).mean(0)
        p1 = g1[ly - 2:ly + 3, lx - 2:lx + 3, :3].reshape(-1, 3).mean(0)
        info['switchLamp'] = {'idle_0': [int(v) for v in p0], 'idle_1': [int(v) for v in p1]}
        if not (p0[1] > p0[0] and p1[0] > p1[2] + 40):
            E('switch lamp colours: idle_0 %s should be green, idle_1 %s yellow' % (p0, p1))
    wt = sp.get('rail_water_tower')
    if wt:
        pa = wt.get('anims', {}).get('pour', {})
        fr = pa.get('frames', [])
        if len(fr) != 6:
            E('rail_water_tower pour has %d frames (want 6)' % len(fr))
        for n in [wt['frame'], wt.get('pourBase')] + fr:
            if not n or not A.has(wt['atlas'], n):
                E('rail_water_tower frame %s missing' % n)
        if wt['frameSize'][0] > 256 or wt['frameSize'][1] > 320:
            E('rail_water_tower frame %s > 256 x 320' % wt['frameSize'])
        if wt.get('footprintM') != [1.6, 1.6]:
            E('rail_water_tower footprintM %s' % wt.get('footprintM'))
        # (polish H1) pour = small overlays over pourBase (same sourceSize), not 6 full frames
        if not (pa.get('overlay') and pa.get('base') == wt.get('pourBase')):
            E('rail_water_tower pour is not an overlay over pourBase')
        ov_px, ov_imgs = [], []
        for n in fr:
            if not A.has(wt['atlas'], n):
                continue
            im = A.frame(wt['atlas'], n)
            if list(im.size) != wt['frameSize']:
                E('rail_water_tower %s sourceSize %s != frameSize' % (n, im.size))
            f = A.load(wt['atlas'])[1][n]['frame']
            ov_px.append(f['w'] * f['h'])
            al = np.asarray(im)[..., 3]
            if (al > 128).sum() < 30:
                E('rail_water_tower overlay %s nearly empty' % n)
            ov_imgs.append(np.asarray(im).astype(np.int16))
        if ov_px:
            full = wt['frameSize'][0] * wt['frameSize'][1]
            info['towerPourOverlayPx'] = {'max': max(ov_px), 'full': full}
            if max(ov_px) > 0.25 * full:
                E('rail_water_tower pour overlays are %d px (> 25 %% of the %d px frame)' % (max(ov_px), full))
        if len(ov_imgs) == 6 and min(np.abs(ov_imgs[k] - ov_imgs[(k + 1) % 6]).mean() for k in range(6)) < 0.01:
            E('rail_water_tower pour overlays do not change from frame to frame')
    # (polish H1) the rails page holds the bake-only decals and nothing else; the live props ride elsewhere
    ra = [a for a in man['atlases'] if a['key'] == 'train2_rails']
    if not ra or not ra[0].get('bakeOnly'):
        E('train2_rails atlas entry is not marked bakeOnly')
    rfr = sorted(A.load('train2_rails')[1])
    if rfr != sorted(LOOPS):
        E('train2_rails holds %s (want only the two loop decals: a bake-only page)' % rfr)
    for key in ('rail_fence_x', 'rail_fence_x_end', 'rail_switch_stand', 'rail_water_tower'):
        if key in sp and sp[key]['atlas'] == 'train2_rails':
            E('%s lives on the bake-only train2_rails page' % key)
    # (polish H2 / L5) placements: the water tower behind each loop (no car is ever drawn behind its body), the
    # switch stand on the fence line; (M3) how far the town loop and a car rounding it reach east
    WORLD_W = 6144
    car_rect = [min(chars[c]['boundsPx'][d][0] for c in CARS for d in DIRS),
                min(chars[c]['boundsPx'][d][1] for c in CARS for d in DIRS),
                max(chars[c]['boundsPx'][d][2] for c in CARS for d in DIRS),
                max(chars[c]['boundsPx'][d][3] for c in CARS for d in DIRS)]
    car_rect = [min(car_rect[0], -car_rect[2]), car_rect[1], max(car_rect[2], -car_rect[0]), car_rect[3]]
    for key, (iT, mx) in LOOPS.items():
        s = sp.get(key)
        if not s:
            continue
        T0 = s['anchorWorldPx']
        track = [(T0[0] + p[0], T0[1] + p[1]) for p in s['pathPx']]
        for k in range(-8, 9):                       # the main line through the turnout, 4 cells either way
            track.append(L(iT + 0.5 * k, 0))
        ph = s.get('placeHint', {})
        tw = ph.get('rail_water_tower')
        if tw and wt:
            tx, ty = tw['worldPx']
            ti, tj = tw['lattice']
            if max(abs(L(ti, tj)[0] - tx), abs(L(ti, tj)[1] - ty)) > 0.01:
                E('%s water tower hint worldPx %s != L%s' % (key, tw['worldPx'], tw['lattice']))
            # tower body = its opaque bounds above the baked shadow (rows within 6 px of the anchor and up)
            ti_ = A.frame(wt['atlas'], wt['frame'])
            al = np.asarray(ti_)[..., 3]
            tax, tay = wt['anchorPx']
            body = (al[:int(tay) + 6] > 160)
            ys_, xs_ = np.where(body)
            bx0, bx1, by0, by1 = xs_.min() - tax, xs_.max() - tax, ys_.min() - tay, ys_.max() - tay
            hid = 0
            for (px_, py_) in track:
                if py_ >= ty:
                    continue
                if px_ + car_rect[2] > tx + bx0 and px_ + car_rect[0] < tx + bx1 and \
                        py_ + car_rect[3] > ty + by0 and py_ + car_rect[1] < ty + by1:
                    hid += 1
            # footprint vs ballast (lattice cells), world edge
            half = 0.8 / math.sqrt(2)
            dmin = 1e9
            for (px_, py_) in track:
                gi = ((px_ - 3120) / 64.0 + (py_ - 1315) / 32.0) / 2.0
                gj = ((px_ - 3120) / 64.0 - (py_ - 1315) / 32.0) / 2.0
                dx, dy = max(abs(gi - ti) - half, 0), max(abs(gj - tj) - half, 0)
                dmin = min(dmin, math.hypot(dx, dy))
            x0w, x1w = tx - tax, tx - tax + wt['frameSize'][0]
            info.setdefault('towerHint', {})[key] = {'lattice': tw['lattice'], 'carsBehindBody': hid,
                                                     'ballastClearCells': round(dmin, 2), 'spriteX': [x0w, x1w]}
            if hid:
                E('%s water tower hint %s hides cars on %d track points (they pass behind its body)' %
                  (key, tw['lattice'], hid))
            if dmin < 0.61 + 0.05:
                E('%s water tower footprint %.2f cell from the track centre line (ballast 0.61)' % (key, dmin))
            if x0w < 0 or x1w > WORLD_W:
                E('%s water tower sprite x %s..%s outside the world' % (key, x0w, x1w))
        st = ph.get('rail_switch_stand')
        if not st or abs(st['lattice'][1] + 0.75) > 1e-6 or not st.get('blockM'):
            E('%s switch stand hint %s (want j -0.75 on the fence line + blockM)' % (key, st))
        if mx < 0:
            dec = A.frame(s['atlas'], s['frame'])
            al = np.asarray(dec)[..., 3]
            xs_ = np.where(al.max(0) > 24)[0]
            dec_x1 = T0[0] - s['anchorPx'][0] + xs_.max() + 1
            car_x1 = max(px_ for px_, _ in track) + car_rect[2]
            info['townLoopEastPx'] = {'decal': int(dec_x1), 'carSprite': int(car_x1), 'worldWidth': WORLD_W}
            if dec_x1 > WORLD_W or car_x1 > WORLD_W:
                W_('town loop at the east map edge (plan geometry T2 = L(37, 0)): decal to x %d, a car rounding the '
                   'tip to x %d > %d (lead / plan: shift the town loop west, or cover x > %d)' %
                   (dec_x1, car_x1, WORLD_W, WORLD_W))
    for key in ('rail_fence_x', 'rail_fence_x_end', 'rail_switch_stand', 'rail_water_tower'):
        s = sp.get(key)
        if not s:
            continue
        ax, ay = s['anchorPx']
        W, H = s['frameSize']
        if not (0 <= ax <= W and 0 <= ay <= H):
            E('%s anchor outside its frame' % key)
        for n, p in (s.get('fxPoints') or {}).items():
            if not (0 <= ax + p[0] < W and 0 <= ay + p[1] < H):
                E('%s fxPoint %s outside its frame' % (key, n))
    # ------------------------------------------------------------------ consist
    tcs = man.get('trainConsist', {})
    cm = {k: v['couplerM'] for k, v in chars.items()}
    cm['train_engine'] = dict(town['characters']['train_engine']['couplerM'])
    ov = tcs.get('couplerOverride', {}).get('train_engine', {})
    cm['train_engine'].update(ov)
    for nm, want_len in (('village', 10.6 + ov.get('back', 1.22) - 1.22), ('eup', 13.6 + ov.get('back', 1.22) - 1.22)):
        c = tcs.get(nm)
        if not c:
            E('trainConsist.%s missing' % nm)
            continue
        sp_ = [round(cm[a]['back'] - cm[b]['front'], 3) for a, b in zip(c['order'], c['order'][1:])]
        if sp_ != c['spacingM']:
            E('trainConsist.%s spacing %s != couplers %s' % (nm, c['spacingM'], sp_))
        ln = round(-cm[c['order'][0]]['front'] + sum(sp_) + cm[c['order'][-1]]['back'], 3)
        if abs(ln - want_len) > 1e-6 or abs(c['lengthM'] - want_len) > 1e-6:
            E('trainConsist.%s length %s / %s (plan %.1f m)' % (nm, c['lengthM'], ln, want_len))

    # ------------------------------------------------------------------ report
    print('tr2_check: %d errors, %d warnings' % (len(errs), len(warns)))
    for e in errs:
        print('  ERROR', e)
    for w in warns:
        print('  warn ', w)
    print(json.dumps(info, ensure_ascii=False))
    if jpath:
        os.makedirs(os.path.dirname(jpath), exist_ok=True)
        json.dump({'errors': errs, 'warnings': warns, 'info': info}, open(jpath, 'w'), indent=1, ensure_ascii=False)
    sys.exit(1 if errs else 0)


if __name__ == '__main__':
    main()
