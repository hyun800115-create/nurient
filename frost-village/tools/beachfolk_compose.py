"""
beachfolk_compose.py - reference compositor for townfolk v4 + v5 + beachfolk (assets/townfolk + townfolk2 + beachfolk).

Extends tools/townfolk2_compose.py (imported, never edited).  The game mirrors this logic
(tools/beachfolk_compose.js); keep the two in sync.

    from beachfolk_compose import Beachfolk
    bf = Beachfolk.from_assets()                       # merges the three manifests (merge_beachfolk)
    p = bf.preset('swimmer', seed=3)                    # or bf.random_person(seed) / bf.beach_family(seed)
    img = bf.compose(p, 'swim', 'SE', 2)                # 128x128 RGBA, anchor (64,104) = ON THE WATER SURFACE here
    bf.can_play(p, 'swim')                              # every body part has frames for the anim
    bf.ball_point(p, 'ball_throw', 'SW', 1)             # [dx, dy, front, radiusPx] or None

On top of the v4 / v5 rules (townfolk_compose.py / townfolk2_compose.py):
  * merge: the beachfolk block is merged after townfolk2 with merge_beachfolk() (rules in beachfolk.merge).
  * head frames: '<layer>/<hp>_<hd>' with hd = timeline hd (default the anim dir); faces / brows only when
    hd is in faceDirsByPose[hp] (default faceDirs).
  * animParts: props drawn in an anim even if the person does not wear them (float ring, surf board, dig spade).
  * parts draw only in their 'anims' minus 'noAnims'; can_play() = every body part LISTS the anim (part_plays()).
    Drop accessories (towel, flip-flops, camera, rescue tube, floaties, caddy) list every anim and keep the ones they
    have no frames for in noAnims (put down there); the swim ring blocks swim / surf / dig / ball / sunbathe.
  * animHideHead[anim]: hats hidden there (swim / surf / float / sunbathe); a hidden full hat un-squashes the hair.
  * pick_anim() / animFallback (swim -> float for ring wearers), the same rule as cityfolk_compose pick_anim.
  * sunbathe dir = where the FEET point: sunbathe_dir_for(spot, i) (lyingFeetDirs, else opposite lyingDirs).
  * followDz: follow subs use limb z + followDz (default 0.5).
  * generate3(): v4 generator + townfolk2 extra slots + beachSlots (preset colour or slot palette) + addOns
    (optional extra parts) + bare-arm sleeves.  Deterministic; the JS port consumes the rng in the same order.
"""
import copy
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import townfolk_compose as tc            # noqa: E402
import townfolk2_compose as tc2          # noqa: E402
from townfolk_compose import MIRROR, LIMBS, iter_tf_frames      # noqa: E402

ASSETS = tc.ASSETS
OLD_ANIMS = ['idle', 'walk', 'carry_walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push']


def part_plays(P, anim, old_anims=OLD_ANIMS):
    """Canonical per-part play rule for every townfolk compositor (see beachfolk_compose.js partPlays)."""
    if not P or P.get('space') != 'body' or not P.get('subs'):
        return True
    return anim in P.get('anims', old_anims)


def head_hidden(T, pn, anim):
    P = T['parts'].get(pn)
    if P is None:
        return True
    if anim in P.get('noAnims', []):
        return True
    return pn in T.get('animHideHead', {}).get(anim, [])


OPP = {'N': 'S', 'NE': 'SW', 'E': 'W', 'SE': 'NW', 'S': 'N', 'SW': 'NE', 'W': 'E', 'NW': 'SE'}


def sunbathe_dir_for(spot, i=0):
    """sunbathe dir (= where the FEET point) for lying spot i of a prop sprite def: lyingFeetDirs[i], else the
    opposite of lyingDirs[i] (hips -> head)."""
    if spot.get('lyingFeetDirs'):
        return spot['lyingFeetDirs'][min(i, len(spot['lyingFeetDirs']) - 1)]
    if spot.get('lyingDirs'):
        return OPP[spot['lyingDirs'][min(i, len(spot['lyingDirs']) - 1)]]
    return 'SE'


DIR_ANG = {'S': 0, 'SE': 45, 'E': 90, 'NE': 135, 'N': 180, 'NW': 225, 'W': 270, 'SW': 315}
UNMIRROR = {'SE': 'SW', 'E': 'W', 'NE': 'NW'}


def nearest_dir(dirs, want):
    """Nearest dir an anim has (its rendered dirs + their mirrors) to the wanted one (= beachfolk_compose.js)."""
    cand = []
    for d in dirs:
        cand.append(d)
        if d in UNMIRROR:
            cand.append(UNMIRROR[d])
    if want in cand:
        return want
    best, bd = None, 1e9
    for c in cand:
        a = abs(DIR_ANG[c] - DIR_ANG[want]) % 360
        a = 360 - a if a > 180 else a
        if a < bd:
            best, bd = c, a
    return best


def merge_beachfolk(M2, B):
    """Merged block (townfolk v4 + v5 merged block M2 + beachfolk fragment B).  Never mutates the inputs."""
    M = copy.deepcopy(M2)
    for k in ('anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas'):
        for key, v in B.get(k, {}).items():
            if key in M.get(k, {}):
                raise ValueError(f'beachfolk redefines {k}.{key}')
            M.setdefault(k, {})[key] = copy.deepcopy(v)
    for b, Bb in B.get('bases', {}).items():
        Mb = M['bases'][b]
        for a, v in Bb.get('headOffset', {}).items():
            Mb['headOffset'][a] = copy.deepcopy(v)
        Mb['parts'] = sorted(set(Mb['parts']) | set(Bb.get('parts', [])))
        for key in ('ballPoint', 'digPoint', 'splashPoint', 'lieShadow', 'bodyK'):
            if key in Bb:
                Mb[key] = copy.deepcopy(Bb[key])
    M['tintModel'] = dict(M['tintModel'])
    M['tintModel']['slotS'] = dict(M['tintModel'].get('slotS', {}), **B.get('tintModel', {}).get('slotS', {}))
    for slot, tbl in B.get('tintTable', {}).items():
        M['tintTable'].setdefault(slot, {}).update(tbl)
    fe = M.setdefault('faceExprs', {})
    for hp, exprs in B.get('faceExprs', {}).items():
        lst = fe.setdefault(hp, [])
        lst += [e for e in exprs if e not in lst]
    M['exprBrow'] = dict(M.get('exprBrow', {}), **B.get('exprBrow', {}))
    M['faceDirsByPose'] = dict(M.get('faceDirsByPose', {}), **B.get('faceDirsByPose', {}))
    G, GB = M['generator'], B.get('generator', {})
    for key, v in GB.get('presets', {}).items():
        if key in G['presets']:
            raise ValueError(f'beachfolk redefines preset {key}')
        G['presets'][key] = copy.deepcopy(v)
    G['slotPalette'] = dict(G['slotPalette'], **GB.get('slotPalette', {}))
    G['exclude'] = list(G['exclude']) + [list(x) for x in GB.get('exclude', [])]
    G['beachSlots'] = list(GB.get('beachSlots', []))
    G['animParts'] = copy.deepcopy(GB.get('animParts', {}))
    for key in ('water', 'sunbathe', 'dig', 'ball', 'animHideHead', 'pageClasses'):
        if key in B:
            M[key] = copy.deepcopy(B[key])
    M['animFallback'] = dict(M.get('animFallback', {}), **copy.deepcopy(B.get('animFallback', {})))
    fa_anim, fa_pose = M.setdefault('frameAtlasAnim', {}), M.setdefault('frameAtlasPose', {})
    for ext in B.get('frameAtlasExt', []):
        for a in ext.get('anims', []):
            fa_anim.setdefault(a, {}).update(ext['map'])
        for hp in ext.get('poses', []):
            fa_pose.setdefault(hp, {}).update(ext['map'])
    return M


class AtlasSource3(tc2.AtlasSource2):
    """Frames from assets/townfolk + townfolk2 + beachfolk (merged manifest in .T)."""

    def __init__(self, assets=ASSETS):
        super().__init__(assets)
        with open(os.path.join(assets, 'beachfolk', 'manifest.json'), encoding='utf-8') as f:
            self.man3 = json.load(f)
        for at in self.man3['atlases']:
            with open(os.path.join(assets, at['json'])) as f:
                js = json.load(f)
            for name, rect in iter_tf_frames(js):
                if name in self.frames:
                    raise ValueError(f'frame {name} in two fragments')
                self.frames[name] = (at['key'], rect)
            self.sheets[at['key']] = os.path.join(assets, at['png'])
        self.T = merge_beachfolk(self.T, self.man3['beachfolk'])


class Beachfolk(tc2.Townfolk2):
    @classmethod
    def from_assets(cls, assets=ASSETS):
        src = AtlasSource3(assets)
        return cls(src.T, src)

    def anim_parts(self, person, anim):
        """The person's parts + the props this anim always shows (generator.animParts)."""
        parts = list(person['parts'])
        for pn in self.T['generator'].get('animParts', {}).get(anim, []):
            if pn not in parts and pn in self.parts:
                parts.append(pn)
        return parts

    def can_play(self, person, anim):
        if anim not in self.T['anims']:
            return False
        return all(part_plays(self.parts[pn], anim) for pn in self.anim_parts(person, anim))

    def pick_anim(self, person, anim):
        """(anim, face): anim when playable, else the first playable animFallback entry, else idle / walk."""
        if self.can_play(person, anim):
            return anim, None
        face = self.T.get('fallbackFace', {}).get(anim)
        for a in self.T.get('animFallback', {}).get(anim, []):
            if self.can_play(person, a):
                return a, face
        return ('idle' if self.can_play(person, 'idle') else 'walk'), face

    def visible_parts(self, person, anim):
        out = []
        for pn in self.anim_parts(person, anim):
            P = self.parts[pn]
            if anim in P.get('noAnims', []):
                continue
            if 'anims' in P and anim not in P['anims']:
                continue
            if P['space'] == 'head' and head_hidden(self.T, pn, anim):
                continue
            out.append(pn)
        return out

    def layers(self, person, anim, d, i, face=None):
        """[(z, frame name, tint or None, 'body'|'head')] in draw order for a RENDERED dir."""
        base, _ = self.render_base(person['base'])
        tl = self.tl(anim, d, i)
        hp = tl['hp']
        hd = tl.get('hd', d)
        expr, brow = tl['face'], tl['brow']
        if face and face in self.T.get('faceExprs', {}).get(hp, []):
            expr, brow = face, self.T['exprBrow'].get(face, 'neutral')
        out = []
        zf = set(tl.get('zfront', []))
        limbz = {}
        for name, slot, z, zfront in LIMBS:
            limbz[name] = zfront if name in zf else z
            out.append((limbz[name], f'{name}@{base}/{anim}_{d}_{i}', self.tint(person, slot), 'body'))
        vis = self.visible_parts(person, anim)
        hat = any(self.parts[pn]['family'] == 'hat' and self.parts[pn].get('cls') == 'full' for pn in vis)
        heads = []
        for pn in vis:
            P = self.parts[pn]
            for s, sd in P['subs'].items():
                z = sd['z'][d] if isinstance(sd['z'], dict) else sd['z']
                if sd.get('follow'):
                    z = limbz[sd['follow']] + sd.get('followDz', 0.5)
                if sd.get('zfrontFollow') and sd['zfrontFollow'] in zf:
                    z = self.T['limbs'][sd['zfrontFollow']]['zFront'] + 0.5
                if P['space'] == 'body':
                    out.append((z, f'{pn}.{s}@{base}/{anim}_{d}_{i}', self.tint(person, sd['tint']), 'body'))
                else:
                    zh = sd['z'][hd] if isinstance(sd['z'], dict) else sd['z']
                    suffix = '~hat' if (hat and P.get('hatfit')) else ''
                    heads.append((zh, f'{pn}.{s}{suffix}/{hp}_{hd}', self.tint(person, sd['tint']), 'head'))
                    if sd.get('sheen'):
                        heads.append((zh + 0.5, f'{pn}.{s}{suffix}.sheen/{hp}_{hd}', None, 'head'))
        Zh = self.T['z']
        out.append((Zh['head'], f'head.{person.get("nose", "dot")}/{hp}_{hd}', self.tint(person, 'skin'), 'head'))
        if hd in self.T.get('faceDirsByPose', {}).get(hp, self.T['faceDirs']):
            fs = person.get('face', 'std')
            out.append((Zh['face'], f'face.{fs}.{expr}/{hp}_{hd}', None, 'head'))
            out.append((Zh['brow'], f'brow.{fs}.{brow}/{hp}_{hd}', self.tint(person, 'hair'), 'head'))
        out += heads
        order = {id(x): k for k, x in enumerate(out)}
        out.sort(key=lambda x: (x[0], order[id(x)]))
        return out

    def compose(self, person, anim, d, i, exact_head=None, face=None, margin=0):
        """Like Townfolk2.compose; margin > 0 returns a (128 + 2 margin)^2 canvas with the anchor at
        (64 + margin, 104 + margin), so heads / hat brims reaching outside the 128 frame (sunbathe: the head lies
        beside the hips; in the game every layer is its own sprite and is never clipped) stay whole."""
        if not margin:
            return super().compose(person, anim, d, i, exact_head=exact_head, face=face)
        import numpy as np
        from PIL import Image
        flip = d in MIRROR
        rd = MIRROR.get(d, d)
        S = tc.FRAME + 2 * margin
        canvas = np.zeros((S, S, 4), np.float32)
        hoff = self.head_offset(person['base'], anim, rd, i)
        _, sx = self.render_base(person['base'])
        for z, name, tint, space in self.layers(person, anim, rd, i, face=face):
            img = self.src.get(name)
            if img is None:
                continue
            if tint is not None:
                img = img.copy()
                img[..., :3] *= tint
            if space == 'body':
                if sx != 1.0:
                    img = tc.scale_x(img, sx)
                img = tc.paste((S, S), img, margin, margin)
            else:
                img = tc.paste((S, S), img, margin + tc.ANCHOR[0] + hoff[0] - tc.HEAD_ANCHOR[0],
                               margin + tc.ANCHOR[1] + hoff[1] - tc.HEAD_ANCHOR[1])
            canvas = tc.over(canvas, img)
        out = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        if flip:
            out = out.transpose(Image.FLIP_LEFT_RIGHT)
        return out

    # ---- points
    def _pt(self, v, d):
        if v is None:
            return None
        v = list(v)
        if d in MIRROR:
            v[0] = -v[0]
        return v

    def ball_point(self, person, anim, d, i):
        bp = self.T['bases'][person['base']].get('ballPoint', {}).get(anim)
        if not bp:
            return None
        return self._pt(bp[MIRROR.get(d, d)][i], d)

    def dig_point(self, person, d):
        return self._pt(self.T['bases'][person['base']]['digPoint'][MIRROR.get(d, d)], d)

    def splash_point(self, person, d):
        return self._pt(self.T['bases'][person['base']]['splashPoint'][MIRROR.get(d, d)], d)

    def lie_shadow(self, person, d):
        s = dict(self.T['bases'][person['base']]['lieShadow'][MIRROR.get(d, d)])
        if d in MIRROR:
            s['center'] = [-s['center'][0], s['center'][1]]
            s['angleDeg'] = 180.0 - s['angleDeg']
        return s

    # ---- people
    def random_person(self, seed=None, rng=None):
        return generate3(self.T, rng or random.Random(seed))

    def preset(self, name, seed=0, rng=None):
        return generate3(self.T, rng or random.Random(seed), preset=name)

    def beach_family(self, seed=0, rng=None):
        return beach_family(self.T, rng or random.Random(seed))


def _pick_table(T, rng, opts, ok):
    names = [n for n in opts if opts[n] > 0 and ok(n)]
    if not names:
        return None
    return rng.choices(names, [opts[n] for n in names])[0]


def generate3(T, rng, preset=None):
    """townfolk2 generate2 + beachSlots + addOns + bare-arm sleeves (see module doc)."""
    person = tc2.generate2(T, rng, preset)
    G = T['generator']
    P = G['presets'].get(preset, {}) if preset else {}
    pcols = P.get('colors', {})
    pal = T['palettes']
    cols = person['colors']
    for slot in G.get('beachSlots', []):
        v = pcols.get(slot)
        if v is None:
            v = G['slotPalette'][slot]
        if isinstance(v, list):
            v = v[int(rng.random() * len(v))]
        if v.startswith('='):
            cols[slot] = cols.get(v[1:])
        elif v.startswith('#'):
            cols[slot] = v
        else:
            cols[slot] = pal[v][int(rng.random() * len(pal[v]))]
    base = person['base']
    age = T['bases'][base]['age']
    avail = set(T['bases'][base]['parts'])

    def ok(pn):
        part = T['parts'].get(pn)
        if part is None or (part.get('ages') and age not in part['ages']):
            return False
        return part['space'] == 'head' or pn in avail

    for table, chance in P.get('addOns', []):
        opts = {k: w for k, w in table.items() if ok(k) and not any(tc.conflicts(T, k, c) for c in person['parts'])}
        if not opts:
            continue
        if rng.random() >= chance:
            continue
        x = _pick_table(T, rng, opts, ok)
        if x:
            person['parts'].append(x)
    if 'bare_arms' in person['parts']:
        cols['sleeve'] = cols['skin']
    return person


def beach_family(T, rng):
    """A family day out: 1-2 adults + 1-3 kids from 'family_beach', matching swimwear colours."""
    n_adults = 1 + (rng.random() < 0.6)
    n_kids = 1 + int(rng.random() * 3)
    fam = []
    swim = swim2 = None
    for k in range(n_adults + n_kids):
        sub = random.Random(int(rng.random() * 2 ** 31))
        kid = k >= n_adults
        while True:
            p = generate3(T, sub, 'family_beach')
            if (T['bases'][p['base']]['age'] == 'child') == kid:
                break
        if swim is None:
            swim, swim2 = p['colors']['swim'], p['colors']['swim2']
        elif rng.random() < 0.75:
            p['colors']['swim'], p['colors']['swim2'] = swim, swim2
        fam.append(p)
    return fam


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default='swimmer')
    ap.add_argument('--anim', default='swim')
    ap.add_argument('--dir', default='S')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--out', default='beachfolk_person.png')
    a = ap.parse_args()
    bf = Beachfolk.from_assets()
    p = bf.preset(a.preset, a.seed)
    print(json.dumps(p, ensure_ascii=False), 'canPlay', bf.can_play(p, a.anim))
    bf.compose(p, a.anim, a.dir, a.frame).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
