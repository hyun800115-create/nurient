"""
officefolk_compose.py - reference compositor for townfolk v4 (+ townfolk2 / beachfolk / cityfolk when present) +
v4.2 officefolk (assets/officefolk, CONTRACT_V42 AJ).

Extends tools/cityfolk_compose.py (imported, never edited); the game mirrors this logic in
tools/officefolk_compose.js (tools/test/officefolk_phaser.mjs --parity compares the two).

    from officefolk_compose import Officefolk
    of = Officefolk.from_assets()                         # townfolk + every fragment present + officefolk
    of = Officefolk.from_assets(fragments=['officefolk'])  # v4.2: townfolk + officefolk only
    p = of.preset('courier', seed=3)
    img = of.compose(p, 'carry_sack', 'SE', 2)             # 128x128 RGBA, anchor (64,104)
    anim, face = of.pick_anim(p, 'desk_write')             # falls back (sit_idle -> sit -> idle) when needed

On top of the cityfolk rules (cityfolk_compose.py):
  * merge: merge_officefolk() = cityfolk_compose.merge_fragments + two post rules (officefolk.merge):
      - headPoseFallback {'down': 'nod'}: without townfolk2 the officefolk timeline frames with hp 'down' use 'nod';
      - presets with 'force': parts appended after generation when the person lacks them (no rng) - the bank
        manager's top_blazer, which townfolk ages exclude for elders.
  * can_play: officefolk anims need every worn body part in bases[b].ofCover[anim] (parts with an 'anims' list:
    part_plays); in other anims a part listed in bases[b].ofExt plays only its listed anims.
  * page_of / page_needed: the officefolk page (ofPages) an anim / a person's frames live in.  (polish) page_needed
    is per person for the office anims too (the aide's 'note' frames live on the resident 'sack' page); a person
    needing two pages gets the non-resident one (ofPages.resident).
  * pick_anim(person, anim, has): (polish) a townfolk anim whose only missing page holds the person's officefolk
    extended layers (manager's blazer, clerk's sleeves) is played without them instead of falling back.
  * points: hand_point (hand_over), impact_point (desk_write / stamp_stand), sack_point (scoop / carry_sack),
    tip_point (point_board), ground_speed (carry_sack) - mirrored dirs negate x.
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
import cityfolk_compose as cc            # noqa: E402
from beachfolk_compose import part_plays  # noqa: E402
from townfolk_compose import MIRROR, iter_tf_frames  # noqa: E402

ASSETS = tc.ASSETS
FRAGMENT_ORDER = ['townfolk2', 'beachfolk', 'cityfolk', 'officefolk']


def apply_officefolk_rules(M):
    """Post rules of the officefolk merge (in place): head pose fallback when townfolk2 is absent."""
    for hp, alt in (M.get('headPoseFallback') or {}).items():
        if hp in M.get('headPoses', {}):
            continue
        for a in M.get('officefolkAnims', []):
            for d, row in M['timeline'].get(a, {}).items():
                for e in row:
                    if e['hp'] == hp:
                        e['hp'] = alt
    return M


def merge_officefolk(T, blocks):
    """T = the v4 'townfolk' block; blocks = [(name, block), ...] in merge order (officefolk last)."""
    M = cc.merge_fragments(T, blocks)
    return apply_officefolk_rules(M)


def apply_force(T, person, preset):
    """Preset 'force' parts: appended when missing (rendered for the base), no rng drawn."""
    P = T['generator']['presets'].get(preset or '', {}) if preset else {}
    for pn in P.get('force') or []:
        if pn in person['parts'] or pn not in T['parts']:
            continue
        part = T['parts'][pn]
        if part['space'] == 'body' and pn not in T['bases'][person['base']]['parts']:
            continue
        person['parts'].append(pn)
    return person


class AtlasSourceOF(tc.AtlasSource):
    """Frames from assets/townfolk + the fragment folders present (default: every one) + officefolk."""

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
                print(f'WARNING officefolk_compose: skipping incomplete fragment {frag} ({miss[0]})', file=sys.stderr)
                self.skipped.append(frag)
                continue
            if any(r not in ['townfolk'] + [b[0] for b in blocks] for r in block.get('requires', [])):
                print(f'WARNING officefolk_compose: skipping {frag} (needs {block.get("requires")})', file=sys.stderr)
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
        self.T = merge_officefolk(self.man['townfolk'], blocks)


class Officefolk(cc.Cityfolk):
    @classmethod
    def from_assets(cls, assets=ASSETS, fragments=None):
        src = AtlasSourceOF(assets, fragments)
        return cls(src.T, src)

    def can_play(self, person, anim):
        T = self.T
        if anim not in T['anims']:
            return False
        B = T['bases'][person['base']]
        if anim in T.get('officefolkAnims', []):
            cover = B.get('ofCover', {}).get(anim) or []
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
        ext = B.get('ofExt', {})
        for pn in self.anim_parts(person, anim):
            if pn in ext and anim not in ext[pn]:
                return False
        return super().can_play(person, anim)

    # ---- pages
    def page_of(self, anim):
        for name, inf in self.T.get('ofPages', {}).get('groups', {}).items():
            if anim in inf.get('anims', []):
                return name
        return super().page_of(anim)

    def _atlas_page(self):
        return {a: g for g, inf in self.T.get('ofPages', {}).get('groups', {}).items() for a in inf.get('atlases', [])}

    def pages_needed(self, person, anim):
        """every officefolk page this person's frames of `anim` come from (the anim's own page first)."""
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
        """the page this person's frames of `anim` need: an officefolk page (ofPages; the non-resident one when two
        are needed), else cityfolk's (cfPages, when merged), else None (townfolk / townfolk2 frames only)."""
        is_of = anim in self.T.get('officefolkAnims', [])
        if anim not in self.T['anims']:
            return None
        pgs = self.pages_needed(person, anim)
        res = self.T.get('ofPages', {}).get('resident')
        pick = next((g for g in pgs if g != res), pgs[0] if pgs else None)
        if pick:
            return pick
        return self.page_of(anim) if is_of else super().page_needed(person, anim)

    def pick_anim(self, person, anim, has=None):
        """(anim, face): Cityfolk.pick_anim + a townfolk anim whose only missing page holds this person's officefolk
        extended layers is played without them (the 은행장 off the bank page idles in shirt and tie)."""
        if has is None:
            return super().pick_anim(person, anim)
        T = self.T
        groups = T.get('ofPages', {}).get('groups', {})

        def ok(a):
            if not self.can_play(person, a):
                return False
            if has(a, person):
                return True
            if a in T.get('officefolkAnims', []) or a not in T['anims']:
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
    def _pt(self, person, table, anim, d, i):
        t = self.T['bases'][person['base']].get(table, {})
        if anim is not None:
            t = t.get(anim, {})
        row = t.get(MIRROR.get(d, d))
        v = row[i] if (row is not None and i is not None) else row
        if v is None:
            return None
        v = list(v)
        if d in MIRROR:
            v[0] = -v[0]
        return v

    def hand_point(self, person, d, i):
        return self._pt(person, 'handPoint', None, d, i)

    def impact_point(self, person, anim, d):
        return self._pt(person, 'impactPoint', anim, d, None)

    def sack_point(self, person, anim, d, i):
        return self._pt(person, 'sackPoint', anim, d, i)

    def tip_point(self, person, d, i):
        return self._pt(person, 'tipPoint', 'point_board', d, i)

    def ground_speed(self, person, anim, d):
        return self.T['bases'][person['base']].get('groundSpeed', {}).get(anim, {}).get(MIRROR.get(d, d))

    # ---- people
    def preset(self, name, seed=0, rng=None):
        p = tc2.generate2(self.T, rng or random.Random(seed), preset=name)
        return apply_force(self.T, p, name)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--preset', default='courier')
    ap.add_argument('--anim', default='carry_sack')
    ap.add_argument('--dir', default='SE')
    ap.add_argument('--frame', type=int, default=0)
    ap.add_argument('--fragments', default=None, help='comma list, e.g. officefolk (v4.2) or all')
    ap.add_argument('--out', default='officefolk_person.png')
    a = ap.parse_args()
    frags = None if a.fragments in (None, 'all') else a.fragments.split(',')
    of = Officefolk.from_assets(fragments=frags)
    p = of.preset(a.preset, a.seed) if a.preset else of.random_person(a.seed)
    anim, face = of.pick_anim(p, a.anim)
    print(json.dumps(p, ensure_ascii=False), '->', anim, face)
    of.compose(p, anim, a.dir, a.frame, face=face).save(a.out)
    print('->', a.out)


if __name__ == '__main__':
    main()
