"""
townfolk2_compose.py - reference compositor for townfolk v4 + v5 (assets/townfolk + assets/townfolk2).

Extends tools/townfolk_compose.py (imported, never edited).  The game mirrors this logic
(tools/townfolk2_compose.js); keep the two in sync.

    from townfolk2_compose import Townfolk2
    tf = Townfolk2.from_assets()                      # merges both manifests (merge_townfolk)
    bride = tf.preset('bride', seed=3)
    img = tf.compose(bride, 'walk', 'SE', 2)          # 128x128 RGBA, anchor (64,104)
    img = tf.compose(person, 'walk', 'S', 0, face='sad')   # face override (any expr of faceExprs[headPose])

On top of the v4 rules (see townfolk_compose.py):
  * merge: townfolk2 block merged into the v4 block with merge_townfolk() (rules in the manifest's
    townfolk2.merge list).
  * subs with 'zfrontFollow': limb (held_bouquet) use z = limbs[limb].zFront + 0.5 when that limb is
    in the frame's zfront list (the item is raised in front of the head), else their own z.
  * face override: face=<expr> replaces the timeline face if faceExprs[headPose] lists it; the brow
    becomes exprBrow[expr].
  * parts with 'noAnims' (held_bouquet: carry_walk, clap, push) simply have no frames there.
  * sit frames are anchored on the seat front-centre (townfolk.sit), push grip = bases[b].pushPoint.
  * generate2(): the v4 generator + the extra colour slots (gown, flower, flower2, wrap) from the preset.
"""
import copy
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import townfolk_compose as tc           # noqa: E402
from townfolk_compose import Townfolk, MIRROR, LIMBS, iter_tf_frames     # noqa: E402,F401

ASSETS = tc.ASSETS


def merge_townfolk(T, T2):
    """Merged townfolk block (v4 block T + v5 fragment T2).  Never mutates the inputs."""
    M = copy.deepcopy(T)
    for k in ('anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas'):
        for key, v in T2.get(k, {}).items():
            if key in M.get(k, {}):
                raise ValueError(f'townfolk2 redefines {k}.{key}')
            M.setdefault(k, {})[key] = copy.deepcopy(v)
    for b, B2 in T2.get('bases', {}).items():
        B = M['bases'][b]
        for a, v in B2.get('headOffset', {}).items():
            B['headOffset'][a] = copy.deepcopy(v)
        B['parts'] = sorted(set(B['parts']) | set(B2.get('parts', [])))
        for key in ('pushPoint', 'pushGrip', 'seat'):
            if key in B2:
                B[key] = copy.deepcopy(B2[key])
    M['tintModel'] = dict(M['tintModel'])
    M['tintModel']['slotS'] = dict(M['tintModel'].get('slotS', {}), **T2.get('tintModel', {}).get('slotS', {}))
    for slot, tbl in T2.get('tintTable', {}).items():
        M['tintTable'].setdefault(slot, {}).update(tbl)
    G, G2 = M['generator'], T2.get('generator', {})
    for key, v in G2.get('presets', {}).items():
        if key in G['presets']:
            raise ValueError(f'townfolk2 redefines preset {key}')
        G['presets'][key] = copy.deepcopy(v)
    G['slotPalette'] = dict(G['slotPalette'], **G2.get('slotPalette', {}))
    G['exclude'] = list(G['exclude']) + [list(x) for x in G2.get('exclude', [])]
    G['extraSlots'] = list(G2.get('extraSlots', []))
    for key in ('faceExprs', 'exprBrow', 'sit', 'push', 'overrides'):
        if key in T2:
            M[key] = copy.deepcopy(T2[key])
    fa_anim, fa_pose = M.setdefault('frameAtlasAnim', {}), M.setdefault('frameAtlasPose', {})
    for ext in T2.get('frameAtlasExt', []):
        for a in ext.get('anims', []):
            fa_anim.setdefault(a, {}).update(ext['map'])
        for hp in ext.get('poses', []):
            fa_pose.setdefault(hp, {}).update(ext['map'])
    return M


def atlas_of(T, frame):
    """Atlas key holding a frame name of the merged block (what the JS port resolves per sprite)."""
    layer, fr = frame.split('/')
    if '@' in layer:
        anim = fr.rsplit('_', 2)[0]
        return T.get('frameAtlasAnim', {}).get(anim, {}).get(layer) or T['frameAtlas'].get(layer)
    hp = fr.split('_', 1)[0]
    return T.get('frameAtlasPose', {}).get(hp, {}).get(layer) or T['frameAtlas'].get(layer)


class AtlasSource2(tc.AtlasSource):
    """Frames from assets/townfolk + assets/townfolk2 (merged manifest in .man / .T)."""

    def __init__(self, assets=ASSETS):
        super().__init__(assets)
        with open(os.path.join(assets, 'townfolk2', 'manifest.json'), encoding='utf-8') as f:
            self.man2 = json.load(f)
        for at in self.man2['atlases']:
            with open(os.path.join(assets, at['json'])) as f:
                js = json.load(f)
            ov = set(self.man2['townfolk2'].get('overrides', []))
            for name, rect in iter_tf_frames(js):
                if name in self.frames and name not in ov:
                    raise ValueError(f'frame {name} in both fragments')
                self.frames[name] = (at['key'], rect)          # overrides: the townfolk2 copy wins
            self.sheets[at['key']] = os.path.join(assets, at['png'])
        self.T = merge_townfolk(self.man['townfolk'], self.man2['townfolk2'])


class CacheSource2:
    """Raw renders: v5 cache first (tiles per anim from meta2.json), then the v4 cache."""

    def __init__(self, cache2, cache1):
        self.c2 = tc.CacheSource(cache2)
        self.c1 = tc.CacheSource(cache1)
        self._tiles = {}

    def _meta2(self, base):
        if base not in self._tiles:
            p = os.path.join(self.c2.cache, 'body', base, 'meta2.json')
            self._tiles[base] = json.load(open(p)) if os.path.exists(p) else {}
        return self._tiles[base]

    def get(self, name):
        layer, fr = name.split('/')
        if '@' in layer:
            base = layer.split('@')[1]
            anim = fr.rsplit('_', 2)[0]
            m = self._meta2(base)
            tl = m.get('tiles', {}).get(anim)
            if tl:
                self.c2._sheets[('tile', base)] = tl            # per-anim tile layout of the v5 cache
            out = self.c2.get(name)
            if out is not None:
                return out
            return self.c1.get(name)
        out = self.c2.get(name)
        return out if out is not None else self.c1.get(name)


class Townfolk2(Townfolk):
    @classmethod
    def from_assets(cls, assets=ASSETS):
        src = AtlasSource2(assets)
        return cls(src.T, src)

    def layers(self, person, anim, d, i, face=None):
        """[(z, frame name, tint or None, 'body'|'head')] in draw order for a RENDERED dir (v4 + v5 rules)."""
        base, _ = self.render_base(person['base'])
        tl = self.tl(anim, d, i)
        hp = tl['hp']
        expr, brow = tl['face'], tl['brow']
        if face and face in self.T.get('faceExprs', {}).get(hp, []):
            expr, brow = face, self.T['exprBrow'].get(face, 'neutral')
        out = []
        zf = set(tl.get('zfront', []))
        limbz = {}
        for name, slot, z, zfront in LIMBS:
            limbz[name] = zfront if name in zf else z
            out.append((limbz[name], f'{name}@{base}/{anim}_{d}_{i}', self.tint(person, slot), 'body'))
        hat = self.wears_full_hat(person)
        heads = []
        for pn in person['parts']:
            P = self.parts[pn]
            if anim in P.get('noAnims', []):
                continue
            for s, sd in P['subs'].items():
                z = sd['z'][d] if isinstance(sd['z'], dict) else sd['z']
                if sd.get('follow'):
                    z = limbz[sd['follow']] + 0.5
                if sd.get('zfrontFollow') and sd['zfrontFollow'] in zf:
                    z = self.T['limbs'][sd['zfrontFollow']]['zFront'] + 0.5
                if P['space'] == 'body':
                    out.append((z, f'{pn}.{s}@{base}/{anim}_{d}_{i}', self.tint(person, sd['tint']), 'body'))
                else:
                    suffix = '~hat' if (hat and P.get('hatfit')) else ''
                    heads.append((z, f'{pn}.{s}{suffix}/{hp}_{d}', self.tint(person, sd['tint']), 'head'))
                    if sd.get('sheen'):
                        heads.append((z + 0.5, f'{pn}.{s}{suffix}.sheen/{hp}_{d}', None, 'head'))
        Zh = self.T['z']
        out.append((Zh['head'], f'head.{person.get("nose", "dot")}/{hp}_{d}', self.tint(person, 'skin'), 'head'))
        if d in self.T['faceDirs']:
            fs = person.get('face', 'std')
            out.append((Zh['face'], f'face.{fs}.{expr}/{hp}_{d}', None, 'head'))
            out.append((Zh['brow'], f'brow.{fs}.{brow}/{hp}_{d}', self.tint(person, 'hair'), 'head'))
        out += heads
        order = {id(x): k for k, x in enumerate(out)}
        out.sort(key=lambda x: (x[0], order[id(x)]))
        return out

    def compose(self, person, anim, d, i, exact_head=None, face=None):
        flip = d in MIRROR
        rd = MIRROR.get(d, d)
        import numpy as np
        from PIL import Image
        canvas = np.zeros((tc.FRAME, tc.FRAME, 4), np.float32)
        hoff = self.head_offset(person['base'], anim, rd, i)
        _, sx = self.render_base(person['base'])
        for z, name, tint, space in self.layers(person, anim, rd, i, face=face):
            img = self.src.get(name)
            if img is None:
                continue
            if tint is not None:
                img = img.copy()
                img[..., :3] *= tint
            if space == 'body' and sx != 1.0:
                img = tc.scale_x(img, sx)
            if space == 'head':
                img = tc.paste((tc.FRAME, tc.FRAME), img, tc.ANCHOR[0] + hoff[0] - tc.HEAD_ANCHOR[0],
                               tc.ANCHOR[1] + hoff[1] - tc.HEAD_ANCHOR[1])
            canvas = tc.over(canvas, img)
        out = Image.fromarray((np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
        if flip:
            out = out.transpose(Image.FLIP_LEFT_RIGHT)
        return out

    def push_point(self, person, d):
        """[dx, dy, strollerBehind] of the handle-bar grip for (person, dir); mirrored dirs negate dx."""
        pp = self.T['bases'][person['base']]['pushPoint']
        v = pp[MIRROR.get(d, d)]
        return [-v[0] if d in MIRROR else v[0], v[1], v[2]]

    # ---- people
    def random_person(self, seed=None, rng=None):
        return generate2(self.T, rng or random.Random(seed))

    def preset(self, name, seed=0, rng=None):
        return generate2(self.T, rng or random.Random(seed), preset=name)


def generate2(T, rng, preset=None):
    """v4 generator + the colour slots it does not know (T.generator.extraSlots) picked from the preset
    colours (list = pick one, palette name = pick from that palette, '=slot' = copy) or the slot's
    palette.  Deterministic; the JS port consumes the rng in the same order."""
    person = tc.generate(T, rng, preset)
    G = T['generator']
    P = G['presets'].get(preset, {}) if preset else {}
    pcols = P.get('colors', {})
    pal = T['palettes']
    cols = person['colors']
    for slot in G.get('extraSlots', []):
        v = pcols.get(slot)
        if v is None:
            continue                               # untinted (near-white ref) unless the preset names it
        if isinstance(v, list):
            v = v[int(rng.random() * len(v))]
        if v.startswith('='):
            cols[slot] = cols.get(v[1:])
        elif v.startswith('#'):
            cols[slot] = v
        else:
            cols[slot] = pal[v][int(rng.random() * len(pal[v]))]
    return person


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default=None)
    ap.add_argument('--anim', default='clap')
    ap.add_argument('--dir', default='S')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--face', default=None)
    ap.add_argument('--out', default='townfolk2_person.png')
    a = ap.parse_args()
    tf = Townfolk2.from_assets()
    p = tf.preset(a.preset, a.seed) if a.preset else tf.random_person(a.seed)
    print(json.dumps(p, ensure_ascii=False))
    tf.compose(p, a.anim, a.dir, a.frame, face=a.face).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
