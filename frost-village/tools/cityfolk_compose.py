"""
cityfolk_compose.py - reference compositor for townfolk v4 + v5 + v8 cityfolk (assets/townfolk + assets/townfolk2
(+ assets/beachfolk when present) + assets/cityfolk).

Extends tools/townfolk2_compose.py (imported, never edited).  The game mirrors this logic in
tools/cityfolk_compose.js; keep the two in sync (tools/test/cityfolk_phaser.mjs --parity compares them).

    from cityfolk_compose import Cityfolk
    tf = Cityfolk.from_assets()                          # merges every fragment (merge_fragments)
    ff = tf.preset('firefighter', seed=3)
    img = tf.compose(ff, 'spray_hose', 'SE', 1)           # 128x128 RGBA, anchor (64,104)
    anim, face = tf.pick_anim(person, 'flee')             # fallback when the outfit has no flee frames

On top of the v4 / v5 rules:
  * merge_fragment(M, F): generic merge of a townfolk2-format fragment (townfolk2 / beachfolk / cityfolk); for
    v4 + townfolk2 it gives exactly townfolk2_compose.merge_townfolk.
  * animItems[anim] parts are added for that anim (noItems=True skips them); parts with onlyAnims only draw
    there, parts with noAnims never draw there.
  * can_play / pick_anim: cityfolk coverage (bases[b].cfCover) + animFallback / fallbackFace.
  * nozzle_point / box_point / sweep_point (mirrored dirs negate x).
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
from townfolk_compose import MIRROR, LIMBS, iter_tf_frames     # noqa: E402

ASSETS = tc.ASSETS
HANDLED = {'version', 'fragment', 'extends', 'requires', 'anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef',
           'palettes', 'frameAtlas', 'bases', 'tintModel', 'tintTable', 'generator', 'faceExprs', 'exprBrow',
           'frameAtlasExt', 'merge', 'notes'}
FRAGMENT_ORDER = ['townfolk2', 'beachfolk', 'cityfolk']        # folders under assets/, merged when present


def merge_fragment(M, F, name=None):
    """Merge fragment block F into the merged block M (in place, F untouched) - same rules as the JS port."""
    name = name or F.get('fragment', 'fragment')
    for k in ('anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas'):
        for key, v in F.get(k, {}).items():
            if key in M.get(k, {}):
                raise ValueError(f'{name} redefines {k}.{key}')
            M.setdefault(k, {})[key] = copy.deepcopy(v)
    for b, B2 in F.get('bases', {}).items():
        B = M['bases'][b]
        for a, v in B2.get('headOffset', {}).items():
            if a in B['headOffset']:
                raise ValueError(f'{name} redefines bases.{b}.headOffset.{a}')
            B['headOffset'][a] = copy.deepcopy(v)
        B['parts'] = sorted(set(B['parts']) | set(B2.get('parts', [])))
        for key, v in B2.items():
            if key in ('headOffset', 'parts'):
                continue
            if isinstance(B.get(key), dict) and isinstance(v, dict):
                B[key].update(copy.deepcopy(v))
            else:
                B[key] = copy.deepcopy(v)
    M['tintModel'] = dict(M['tintModel'])
    M['tintModel']['slotS'] = dict(M['tintModel'].get('slotS', {}), **F.get('tintModel', {}).get('slotS', {}))
    for slot, tbl in F.get('tintTable', {}).items():
        M['tintTable'].setdefault(slot, {}).update(copy.deepcopy(tbl))
    G, G2 = M['generator'], F.get('generator', {})
    for key, v in G2.get('presets', {}).items():
        if key in G['presets']:
            raise ValueError(f'{name} redefines preset {key}')
        G['presets'][key] = copy.deepcopy(v)
    G['slotPalette'] = dict(G['slotPalette'], **G2.get('slotPalette', {}))
    G['exclude'] = list(G['exclude']) + [list(x) for x in G2.get('exclude', [])]
    xs = list(G.get('extraSlots', []))
    G['extraSlots'] = xs + [s for s in G2.get('extraSlots', []) if s not in xs]
    fe = M.setdefault('faceExprs', {})
    for hp, lst in F.get('faceExprs', {}).items():
        cur = fe.setdefault(hp, [])
        cur += [e for e in lst if e not in cur]
    eb = M.setdefault('exprBrow', {})
    for e, b in F.get('exprBrow', {}).items():
        if e in eb and eb[e] != b:
            raise ValueError(f'{name} changes exprBrow.{e}')
        eb[e] = b
    fa_anim, fa_pose = M.setdefault('frameAtlasAnim', {}), M.setdefault('frameAtlasPose', {})
    for ext in F.get('frameAtlasExt', []):
        for a in ext.get('anims', []):
            fa_anim.setdefault(a, {}).update(ext['map'])
        for hp in ext.get('poses', []):
            fa_pose.setdefault(hp, {}).update(ext['map'])
    for key, v in F.items():
        if key in HANDLED:
            continue
        if isinstance(M.get(key), list) and isinstance(v, list):
            M[key] = list(M[key]) + copy.deepcopy(v)
        elif isinstance(M.get(key), dict) and isinstance(v, dict):
            M[key] = dict(M[key], **copy.deepcopy(v))
        else:
            M[key] = copy.deepcopy(v)
    M.setdefault('fragments', ['townfolk']).append(name)
    return M


def fragment_block(man):
    for k, v in man.items():
        if isinstance(v, dict) and v.get('extends') == 'townfolk':
            return k, v
    raise ValueError('not a townfolk fragment manifest')


def merge_fragments(T, blocks):
    """T = the v4 'townfolk' block; blocks = [(name, block), ...] in merge order."""
    M = copy.deepcopy(T)
    M['fragments'] = ['townfolk']
    for name, F in blocks:
        for r in F.get('requires', []):
            if r not in M['fragments']:
                raise ValueError(f'{name} needs {r} merged first')
        merge_fragment(M, F, name)
    return M


def atlas_of(T, frame):
    return tc2.atlas_of(T, frame)


class AtlasSource3(tc.AtlasSource):
    """Frames from assets/townfolk + every fragment folder present (townfolk2, beachfolk, cityfolk)."""

    def __init__(self, assets=ASSETS, fragments=None):
        super().__init__(assets)
        blocks = []
        self.mans = {}
        for frag in (fragments or FRAGMENT_ORDER):
            mp = os.path.join(assets, frag, 'manifest.json')
            if not os.path.exists(mp):
                continue
            with open(mp, encoding='utf-8') as f:
                man = json.load(f)
            name, block = fragment_block(man)
            self.mans[name] = man
            ov = set(block.get('overrides', []))
            for at in man['atlases']:
                with open(os.path.join(assets, at['json'])) as f:
                    js = json.load(f)
                for fname, rect in iter_tf_frames(js):
                    if fname in self.frames and fname not in ov:
                        raise ValueError(f'frame {fname} in two fragments')
                    self.frames[fname] = (at['key'], rect)
                self.sheets[at['key']] = os.path.join(assets, at['png'])
            blocks.append((name, block))
        self.T = merge_fragments(self.man['townfolk'], blocks)


def is_item(P):
    tags = P.get('tags', [])
    return 'item' in tags or 'anim_item' in tags


class Cityfolk(tc2.Townfolk2):
    @classmethod
    def from_assets(cls, assets=ASSETS, fragments=None):
        src = AtlasSource3(assets, fragments)
        return cls(src.T, src)

    def layers(self, person, anim, d, i, face=None, no_items=False):
        """[(z, frame name, tint or None, 'body'|'head')] in draw order for a RENDERED dir."""
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
        parts = list(person['parts'])
        if not no_items:
            parts += [it for it in self.T.get('animItems', {}).get(anim, []) if it not in parts]
        for pn in parts:
            P = self.parts[pn]
            if anim in P.get('noAnims', []):
                continue
            if P.get('onlyAnims') and anim not in P['onlyAnims']:
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

    def compose(self, person, anim, d, i, exact_head=None, face=None, no_items=False):
        import numpy as np
        from PIL import Image
        flip = d in MIRROR
        rd = MIRROR.get(d, d)
        canvas = np.zeros((tc.FRAME, tc.FRAME, 4), np.float32)
        hoff = self.head_offset(person['base'], anim, rd, i)
        _, sx = self.render_base(person['base'])
        for z, name, tint, space in self.layers(person, anim, rd, i, face=face, no_items=no_items):
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

    # ---- coverage / fallback
    def can_play(self, person, anim):
        T = self.T
        if anim not in T['anims']:
            return False
        cover = T['bases'][person['base']].get('cfCover', {}).get(anim)
        cf = set(T.get('cfParts', []))
        is_cf = anim in T.get('cityfolkAnims', [])
        for pn in person['parts']:
            P = T['parts'].get(pn)
            if P is None or P['space'] != 'body' or is_item(P):
                continue
            if is_cf or pn in cf:
                if not cover or pn not in cover:
                    return False
        return True

    def pick_anim(self, person, anim):
        """(anim, face): `anim` if playable, else the first playable animFallback entry + fallbackFace."""
        if self.can_play(person, anim):
            return anim, None
        face = self.T.get('fallbackFace', {}).get(anim)
        for a in self.T.get('animFallback', {}).get(anim, []):
            if self.can_play(person, a):
                return a, face
        return ('idle' if self.can_play(person, 'idle') else 'walk'), face

    def _pt(self, person, table, anim, d, i):
        t = self.T['bases'][person['base']].get(table, {}).get(anim, {}).get(MIRROR.get(d, d))
        v = t[i] if t else None
        if v is None:
            return None
        v = list(v)
        if d in MIRROR:
            v[0] = -v[0]
            if table in ('nozzlePoint', 'boxPoint'):
                v[2] = -v[2]
        return v

    def nozzle_point(self, person, d, i):
        return self._pt(person, 'nozzlePoint', 'spray_hose', d, i)

    def box_point(self, person, d, i):
        return self._pt(person, 'boxPoint', 'carry_box', d, i)

    def sweep_point(self, person, d, i):
        return self._pt(person, 'sweepPoint', 'sweep', d, i)

    def random_person(self, seed=None, rng=None):
        return tc2.generate2(self.T, rng or random.Random(seed))

    def preset(self, name, seed=0, rng=None):
        return tc2.generate2(self.T, rng or random.Random(seed), preset=name)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default=None)
    ap.add_argument('--anim', default='run')
    ap.add_argument('--dir', default='S')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--face', default=None)
    ap.add_argument('--out', default='cityfolk_person.png')
    a = ap.parse_args()
    tf = Cityfolk.from_assets()
    p = tf.preset(a.preset, a.seed) if a.preset else tf.random_person(a.seed)
    anim, face = tf.pick_anim(p, a.anim)
    print(json.dumps(p, ensure_ascii=False), '->', anim, face)
    tf.compose(p, anim, a.dir, a.frame, face=a.face or face).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
