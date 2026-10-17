// geumbangfolk_compose.js - JS port of tools/geumbangfolk_compose.py (townfolk v4 (+ v5 / beach / city / office when
// present) + v4.3 geumbangfolk, CONTRACT_GEUMBANG AP: the 금방 crew).  Ready to copy into src/core/folk/ next to
// officefolk_compose.js (imports it and the other compositors; they stay unchanged).
// tools/test/geumbangfolk_phaser.mjs --parity compares it with the python.
//
//   import { mergeGeumbangfolk, Geumbangfolk, GeumbangfolkSprite } from './geumbangfolk_compose.js';
//   const man = mergeGeumbangfolk(mTownfolk, /* mTownfolk2, mBeachfolk, mCityfolk, */ mOfficefolk, mGeumbangfolk);
//   preload(): townfolkPreload(this, man);   create(): townfolkInstall(this, man);
//   const gb = new Geumbangfolk(man.townfolk);
//   const driver = gb.preset('gb_driver', mulberry32(7));
//   const s = new GeumbangfolkSprite(scene, gb, driver, x, y); s.play('carry_parcel', 'SW');   // falls back if needed
//   const [cx, cy, bx, by] = gb.parcelPoint(driver, 'carry_parcel', 'SW', s.frame);         // noItems: draw gb_parcel_m
//
// geumbangfolk rules on top of the officefolk / cityfolk ones:
//  - merge: cityfolk's generic mergeTownfolkFragments + the officefolk post rules (when officefolk is merged) + the
//    geumbangfolk headPoseFallback ({down: 'nod'} on the crew anims when townfolk2 is not merged).
//  - canPlay: crew anims need every worn body part in bases[b].gbCover[anim] (parts with an `anims` list: partPlays);
//    top_gb_jacket / det_gb_vest list exactly the anims they have frames in.  pickAnim walks animFallback
//    (carry_parcel -> walk; ring_doorbell / hand_parcel -> talk -> idle; scan / sort_parcel / tape_box -> idle).
//  - pages: pageOf / pagesNeeded / pageNeeded over ofPages AND gbPages (residents 'sack' and 'road').
//  - points (anim-keyed, mirrored dirs negate every x): parcelPoint (boxPoint: carry_parcel / ring_doorbell ->
//    [cx, cy, bx, by]), handPointOf (handPoint: hand_parcel / sort_parcel), bellPoint, beamPoint ([wx, wy, tx, ty]),
//    tapePoint, groundSpeed (carry_parcel).
//  - GeumbangfolkSprite = OfficefolkSprite (nearest dir, once anims hold the last frame + onDone).
//  - installGeumbangfolkRuntime(TF): the game's own doll runtime (src/core/Townfolk.js TF) draws the crew anims with
//    officefolk's layersIntoOF (generic: frameAtlasAnim, animItems, onlyAnims / anims lists, zfrontFollow) and gets
//    TF.gb (+ TF.of when officefolk is merged) = a Geumbangfolk on the same block.

import { MIRROR } from './townfolk_compose.js';
import { mergeTownfolkFragments, Cityfolk } from './cityfolk_compose.js';
import { partPlays } from './beachfolk_compose.js';
import { Officefolk, OfficefolkSprite, applyOfficefolkRules, applyForce, layersIntoOF } from './officefolk_compose.js';

const isItem = (P) => (P.tags || []).includes('item') || (P.tags || []).includes('anim_item');
const QUAD = new Set(['boxPoint', 'beamPoint']);

/** Post rule of the geumbangfolk merge (in place on the merged townfolk block). */
export function applyGeumbangfolkRules(M) {
  for (const [hp, alt] of Object.entries(M.headPoseFallback || {})) {
    if ((M.headPoses || {})[hp]) continue;
    for (const a of M.geumbangfolkAnims || []) {
      for (const row of Object.values(M.timeline[a] || {})) for (const e of row) if (e.hp === hp) e.hp = alt;
    }
  }
  return M;
}

/** {atlases, townfolk} = assets/townfolk + any fragments (townfolk2, beachfolk, cityfolk, officefolk ...) + geumbangfolk. */
export function mergeGeumbangfolk(man, ...frags) {
  const out = mergeTownfolkFragments(man, ...frags);
  applyOfficefolkRules(out.townfolk);
  applyGeumbangfolkRules(out.townfolk);
  return out;
}

export class Geumbangfolk extends Officefolk {
  canPlay(person, anim) {
    const T = this.T;
    if (!T.anims[anim]) return false;
    if ((T.geumbangfolkAnims || []).includes(anim)) {
      const cover = ((T.bases[person.base].gbCover || {})[anim]) || [];
      for (const pn of this.animParts(person, anim)) {
        const P = T.parts[pn];
        if (!P || P.space !== 'body' || isItem(P) || !P.subs || !Object.keys(P.subs).length) continue;
        if (P.anims) { if (!partPlays(P, anim)) return false; } else if (!cover.includes(pn)) return false;
      }
      return true;
    }
    return super.canPlay(person, anim);
  }

  _groups() {
    if (!this._grp) this._grp = Object.assign({}, ((this.T.ofPages || {}).groups) || {}, ((this.T.gbPages || {}).groups) || {});
    return this._grp;
  }

  _residents() { return [(this.T.ofPages || {}).resident, (this.T.gbPages || {}).resident].filter(Boolean); }

  pageOf(anim) {
    for (const [name, inf] of Object.entries(((this.T.gbPages || {}).groups) || {})) if ((inf.anims || []).includes(anim)) return name;
    return super.pageOf(anim);
  }

  _atlasPages() {
    if (!this._gbAtlasPage) {
      this._gbAtlasPage = {};
      for (const [g, inf] of Object.entries(this._groups())) for (const a of inf.atlases || []) this._gbAtlasPage[a] = g;
    }
    return this._gbAtlasPage;
  }

  /** every officefolk / geumbangfolk page this person's frames of `anim` come from (the anim's own page first) */
  pagesNeeded(person, anim) {
    const info = this.T.anims[anim];
    if (!info) return [];
    const ap = this._atlasPages(), out = [];
    for (const l of this.layers(person, anim, info.dirs[0], 0)) { const g = ap[l.atlas]; if (g && !out.includes(g)) out.push(g); }
    const own = this.pageOf(anim);
    out.sort((a, b) => (b === own) - (a === own));
    return out;
  }

  /** the page this person's frames of `anim` need (the non-resident one when two are needed), else cityfolk's, else null */
  pageNeeded(person, anim) {
    if (!this.T.anims[anim]) return null;
    const pgs = this.pagesNeeded(person, anim);
    const res = this._residents();
    const pick = pgs.find((g) => !res.includes(g)) || pgs[0];
    if (pick) return pick;
    if ((this.T.geumbangfolkAnims || []).includes(anim) || (this.T.officefolkAnims || []).includes(anim)) return this.pageOf(anim);
    return Cityfolk.prototype.pageNeeded.call(this, person, anim);
  }

  /** {anim, face}: Cityfolk.pickAnim + a townfolk anim whose only missing page holds this person's officefolk /
   *  geumbangfolk layers is played without them */
  pickAnim(person, anim, opts = {}) {
    const has = opts.has;
    if (!has) return Cityfolk.prototype.pickAnim.call(this, person, anim, opts);
    const T = this.T, groups = this._groups();
    const frag = new Set([...(T.officefolkAnims || []), ...(T.geumbangfolkAnims || [])]);
    const ok = (a) => {
      if (!this.canPlay(person, a)) return false;
      if (has(a, person)) return true;
      if (frag.has(a) || !T.anims[a]) return false;
      const pg = this.pageNeeded(person, a);
      return !!(pg && groups[pg]);
    };
    if (ok(anim)) return { anim, face: null };
    const face = (T.fallbackFace || {})[anim] || null;
    for (const a of (T.animFallback || {})[anim] || []) if (ok(a)) return { anim: a, face };
    return { anim: ok('idle') ? 'idle' : 'walk', face };
  }

  _gpt(person, table, anim, dir, i) {
    const t = ((this.T.bases[person.base][table] || {})[anim]) || {};
    const row = t[MIRROR[dir] || dir];
    const v = row == null ? null : (i == null ? row : row[i]);
    if (v == null) return null;
    const out = v.slice();
    if (dir in MIRROR) { out[0] = -out[0]; if (QUAD.has(table)) out[2] = -out[2]; }
    return out;
  }
  /** [cx, cy, bx, by]: the parcel's centre + bottom-centre px from the anchor (carry_parcel / ring_doorbell) */
  parcelPoint(person, anim, dir, i) { return this._gpt(person, 'boxPoint', anim, dir, i); }
  /** [x, y] between the mittens (hand_parcel: where the game draws / flies gb_parcel_*; sort_parcel) */
  handPointOf(person, anim, dir, i) { return this._gpt(person, 'handPoint', anim, dir, i); }
  /** [x, y] the mitten pressing the door bell (ring_doorbell; impactFrame 2) */
  bellPoint(person, dir, i) { return this._gpt(person, 'bellPoint', 'ring_doorbell', dir, i); }
  /** [wx, wy, tx, ty] the scanner window and the beam target (scan; impactFrame 2) */
  beamPoint(person, dir, i) { return this._gpt(person, 'beamPoint', 'scan', dir, i); }
  /** [x, y] the tape gun roller on the box top (tape_box; impactFrame 3) */
  tapePoint(person, dir, i) { return this._gpt(person, 'tapePoint', 'tape_box', dir, i); }
}

/** OfficefolkSprite on a Geumbangfolk (pickAnim + nearest dir + once anims hold the last frame and call onDone). */
export class GeumbangfolkSprite extends OfficefolkSprite {}

/**
 * Teach the game's shared doll runtime the geumbangfolk rules, once, right after the block is merged into TF.T:
 *   const merged = mergeGeumbangfolk({ atlases: TF.sheets.map((k) => ({ key: k })), townfolk: TF.T }, mGeumbangfolk);
 *   TF.T = merged.townfolk;  TF.tf = new Townfolk(TF.T);  (clear TF._defs / TF._frames like TF.mergeOfficefolk)
 *   installGeumbangfolkRuntime(TF);
 * - TF.layersInto -> officefolk's layersIntoOF (generic fragment draw list; DollSprite unchanged);
 * - TF.person applies preset 'force' (officefolk's rule; no geumbangfolk preset forces anything);
 * - TF.gb = the Geumbangfolk on the same block; TF.of = TF.gb when officefolk is merged (TF.pick then knows the crew
 *   anims too).  Call it again after a later TF.mergeOfficefolk (that call replaces TF.of with a plain Officefolk).
 */
export function installGeumbangfolkRuntime(TF) {
  if (!TF || !TF.T) throw new Error('installGeumbangfolkRuntime: merge the block into TF.T first');
  if (TF.gb && TF.gb.T === TF.T && (!TF.of || TF.of === TF.gb)) return TF.gb;
  const gb = new Geumbangfolk(TF.T);
  const person0 = TF._personV4 || TF.person;
  TF._personV4 = person0;
  TF.person = function (rng, preset) { return applyForce(this.T, person0.call(this, rng, preset), preset); };
  TF.layersInto = function (person, anim, dir, i, out, opts) { return layersIntoOF(this, person, anim, dir, i, out, opts); };
  TF.gb = gb;
  if (TF.of) TF.of = gb;
  return gb;
}
