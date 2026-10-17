"""
geumbangfolk_compose.py - reference compositor for townfolk v4 (+ townfolk2 / beachfolk / cityfolk / officefolk when
present) + v4.3 geumbangfolk (assets/geumbangfolk, CONTRACT_GEUMBANG AP: the 금방 crew).

Extends tools/officefolk_compose.py (imported, never edited); the game mirrors this logic in
tools/geumbangfolk_compose.js (tools/test/geumbangfolk_phaser.mjs --parity compares the two).

    from geumbangfolk_compose import Geumbangfolk
    gb = Geumbangfolk.from_assets()                                        # townfolk + every fragment present
    gb = Geumbangfolk.from_assets(fragments=['officefolk', 'geumbangfolk'])  # v4.3: townfolk + officefolk + 금방
    gb = Geumbangfolk.from_assets(fragments=['geumbangfolk'])              # townfolk + geumbangfolk only
    p = gb.preset('gb_driver', seed=3)
    img = gb.compose(p, 'carry_parcel', 'SE', 2)            # 128x128 RGBA, anchor (64,104)
    anim, face = gb.pick_anim(p, 'ring_doorbell')           # falls back (talk -> idle) when needed

On top of the officefolk / cityfolk rules:
  * merge: merge_geumbangfolk() = cityfolk_compose.merge_fragments + the officefolk post rules (when officefolk is in)
    + headPoseFallback {'down': 'nod'} for the geumbangfolk timeline when townfolk2 is absent.
  * can_play: geumbangfolk anims need every worn body part in bases[b].gbCover[anim] (parts with an 'anims' list:
    part_plays); top_gb_jacket / det_gb_vest list exactly the anims they have frames in.
  * pages: page_of / pages_needed / page_needed over ofPages AND gbPages (residents: 'sack', 'road').
  * pick_anim(person, anim, has): a townfolk anim whose only missing page holds this person's officefolk /
    geumbangfolk layers is played without them (no fallback).
  * points: parcel_point (bases.boxPoint[anim]: carry_parcel / ring_doorbell -> [cx, cy, bx, by]), hand_point_of
    (handPoint[anim]: hand_parcel / sort_parcel), bell_point, beam_point ([wx, wy, tx, ty]), tape_point, ground_speed
    - mirrored dirs negate every x.
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import townfolk_compose as tc            # noqa: E402
import townfolk2_compose as tc2          # noqa: E402
import cityfolk_compose as cc            # noqa: E402
import officefolk_compose as ofc         # noqa: E402
from beachfolk_compose import part_plays  # noqa: E402
from townfolk_compose import MIRROR, iter_tf_frames  # noqa: E402

ASSETS = tc.ASSETS
FRAGMENT_ORDER = ['townfolk2', 'beachfolk', 'cityfolk', 'officefolk', 'geumbangfolk']


def apply_geumbangfolk_rules(M):
    """Post rule of the geumbangfolk merge (in place): head pose fallback when townfolk2 is absent."""
    for hp, alt in (M.get('headPoseFallback') or {}).items():
        if hp in M.get('headPoses', {}):
            continue
        for a in M.get('geumbangfolkAnims', []):
            for d, row in M['timeline'].get(a, {}).items():
                for e in row:
                    if e['hp'] == hp:
                        e['hp'] = alt
    return M


def merge_geumbangfolk(T, blocks):
    """T = the v4 'townfolk' block; blocks = [(name, block), ...] in merge order (geumbangfolk last)."""
    M = cc.merge_fragments(T, blocks)
    ofc.apply_officefolk_rules(M)
    return apply_geumbangfolk_rules(M)


class AtlasSourceGB(tc.AtlasSource):
    """Frames from assets/townfolk + the fragment folders present (default: every one) + geumbangfolk."""

    def __init__(self, assets=ASSETS, fragments=None):
        super().__init__(assets)
        blocks = []
        self.mans = {}
        self.skipped = []
        for frag in (fragments if fragments is not None else FRAGMENT_ORDER):
            mp = os.path.join(assets, frag, 'manifest.json')
            if not os.path.exists(mp):
                continue
            with open(mp, encoding='utf-8') as f:
                man = json.load(f)
            name, block = cc.fragment_block(man)
            miss = [p for at in man['atlases'] for p in (at['json'], at['png'])
                    if not os.path.exists(os.path.join(assets, p))]
            if miss:
                print(f'WARNING geumbangfolk_compose: skipping incomplete fragment {frag} ({miss[0]})', file=sys.stderr)
                self.skipped.append(frag)
                continue
            if any(r not in ['townfolk'] + [b[0] for b in blocks] for r in block.get('requires', [])):
                print(f'WARNING geumbangfolk_compose: skipping {frag} (needs {block.get("requires")})', file=sys.stderr)
                self.skipped.append(frag)
                continue
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
        self.T = merge_geumbangfolk(self.man['townfolk'], blocks)


QUAD = {'boxPoint', 'beamPoint'}


class Geumbangfolk(ofc.Officefolk):
    @classmethod
    def from_assets(cls, assets=ASSETS, fragments=None):
        src = AtlasSourceGB(assets, fragments)
        return cls(src.T, src)

    def can_play(self, person, anim):
        T = self.T
        if anim not in T['anims']:
            return False
        if anim in T.get('geumbangfolkAnims', []):
            cover = T['bases'][person['base']].get('gbCover', {}).get(anim) or []
            for pn in self.anim_parts(person, anim):
                P = T['parts'].get(pn)
                if P is None or P['space'] != 'body' or cc.is_item(P) or not P.get('subs'):
                    continue
                if 'anims' in P:
                    if not part_plays(P, anim):
                        return False
                elif pn not in cover:
                    return False
            return True
        return super().can_play(person, anim)

    # ---- pages (officefolk ofPages + geumbangfolk gbPages)
    def _groups(self):
        g = {}
        for key in ('ofPages', 'gbPages'):
            g.update(self.T.get(key, {}).get('groups', {}))
        return g

    def _residents(self):
        return [r for r in (self.T.get('ofPages', {}).get('resident'), self.T.get('gbPages', {}).get('resident')) if r]

    def page_of(self, anim):
        for name, inf in self.T.get('gbPages', {}).get('groups', {}).items():
            if anim in inf.get('anims', []):
                return name
        return super().page_of(anim)

    def _atlas_page(self):
        return {a: g for g, inf in self._groups().items() for a in inf.get('atlases', [])}

    def pages_needed(self, person, anim):
        info = self.T['anims'].get(anim)
        if not info:
            return []
        ap = self._atlas_page()
        out = []
        for _, name, _, space in self.layers(person, anim, info['dirs'][0], 0):
            pg = ap.get(tc2.atlas_of(self.T, name))
            if pg and pg not in out:
                out.append(pg)
        own = self.page_of(anim)
        out.sort(key=lambda g: g != own)
        return out

    def page_needed(self, person, anim):
        """the page this person's frames of `anim` need (officefolk / geumbangfolk pages: the non-resident one when
        two are needed), else cityfolk's (cfPages, when merged), else None."""
        if anim not in self.T['anims']:
            return None
        pgs = self.pages_needed(person, anim)
        res = self._residents()
        pick = next((g for g in pgs if g not in res), pgs[0] if pgs else None)
        if pick:
            return pick
        if anim in self.T.get('geumbangfolkAnims', []) or anim in self.T.get('officefolkAnims', []):
            return self.page_of(anim)
        return cc.Cityfolk.page_needed(self, person, anim)

    def pick_anim(self, person, anim, has=None):
        """(anim, face): Cityfolk.pick_anim + a townfolk anim whose only missing page holds this person's officefolk /
        geumbangfolk layers is played without them."""
        if has is None:
            return cc.Cityfolk.pick_anim(self, person, anim)
        T = self.T
        groups = self._groups()
        frag_anims = set(T.get('officefolkAnims', [])) | set(T.get('geumbangfolkAnims', []))

        def ok(a):
            if not self.can_play(person, a):
                return False
            if has(a, person):
                return True
            if a in frag_anims or a not in T['anims']:
                return False
            pg = self.page_needed(person, a)
            return bool(pg and pg in groups)
        if ok(anim):
            return anim, None
        face = T.get('fallbackFace', {}).get(anim)
        for a in T.get('animFallback', {}).get(anim, []):
            if ok(a):
                return a, face
        return ('idle' if ok('idle') else 'walk'), face

    # ---- points
    def _gpt(self, person, table, anim, d, i):
        t = self.T['bases'][person['base']].get(table, {}).get(anim, {})
        row = t.get(MIRROR.get(d, d))
        v = row[i] if (row is not None and i is not None) else row
        if v is None:
            return None
        v = list(v)
        if d in MIRROR:
            v[0] = -v[0]
            if table in QUAD:
                v[2] = -v[2]
        return v

    def parcel_point(self, person, anim, d, i):
        """[cx, cy, bx, by]: the parcel's centre + bottom-centre px from the anchor (carry_parcel / ring_doorbell)"""
        return self._gpt(person, 'boxPoint', anim, d, i)

    def hand_point_of(self, person, anim, d, i):
        """[x, y] between the mittens (hand_parcel / sort_parcel)"""
        return self._gpt(person, 'handPoint', anim, d, i)

    def bell_point(self, person, d, i):
        return self._gpt(person, 'bellPoint', 'ring_doorbell', d, i)

    def beam_point(self, person, d, i):
        """[wx, wy, tx, ty]: the scanner window and the beam target (scan)"""
        return self._gpt(person, 'beamPoint', 'scan', d, i)

    def tape_point(self, person, d, i):
        return self._gpt(person, 'tapePoint', 'tape_box', d, i)

    def parcel_depth(self, anim, d):
        """depth offset (over the doll's depth) for the game-drawn parcel of `anim` facing `d` ({noItems}: carry_parcel /
        ring_doorbell at boxPoint, hand_parcel at handPoint): +0.0045 = in the doll's z stack at 45 (over the coat,
        under the head and the arms in front), -0.0001 = behind the doll.  Mirrored dirs use their source dir."""
        t = (self.T.get('parcelDepth') or {}).get(anim) or {}
        v = t.get(MIRROR.get(d, d))
        return v


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default='gb_driver')
    ap.add_argument('--anim', default='carry_parcel')
    ap.add_argument('--dir', default='SE')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--fragments', default=None, help='comma list, e.g. officefolk,geumbangfolk (v4.3) or all')
    ap.add_argument('--out', default='geumbangfolk_person.png')
    a = ap.parse_args()
    frags = None if a.fragments in (None, 'all') else a.fragments.split(',')
    gb = Geumbangfolk.from_assets(fragments=frags)
    p = gb.preset(a.preset, a.seed) if a.preset else gb.random_person(a.seed)
    anim, face = gb.pick_anim(p, a.anim)
    print(json.dumps(p, ensure_ascii=False), '->', anim, face)
    gb.compose(p, anim, a.dir, a.frame, face=face).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
