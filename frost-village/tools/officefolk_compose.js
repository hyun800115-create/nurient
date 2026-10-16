// officefolk_compose.js - JS port of tools/officefolk_compose.py (townfolk v4 (+ v5 / beach / city when present) +
// v4.2 officefolk, CONTRACT_V42 AJ).  Ready to copy into src/ next to townfolk_compose.js / cityfolk_compose.js
// (imports them; they stay unchanged).  tools/test/officefolk_phaser.mjs --parity compares it with the python.
//
//   import { mergeOfficefolk, Officefolk, OfficefolkSprite } from './officefolk_compose.js';
//   import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
//   const man = mergeOfficefolk(mTownfolk, /* mTownfolk2, mBeachfolk, mCityfolk, */ mOfficefolk);   // v4.2: (mTownfolk, mOfficefolk)
//   preload(): townfolkPreload(this, man);   create(): townfolkInstall(this, man);
//   const of = new Officefolk(man.townfolk);
//   const courier = of.preset('courier', mulberry32(7));
//   const s = new OfficefolkSprite(scene, of, courier, x, y); s.play('carry_sack', 'SW');  // falls back if needed
//   const v = of.groundSpeed(courier, 'carry_sack', 'SW');                                // px/s at the anim fps
//
// officefolk rules on top of the cityfolk ones (cityfolk_compose.js):
//  - merge: cityfolk's generic mergeTownfolkFragments + two post rules: headPoseFallback ({down: 'nod'} when
//    townfolk2 is not merged) and preset 'force' parts (appended after generation, no rng; the bank manager's
//    top_blazer, which townfolk ages exclude for elders).
//  - canPlay: officefolk anims need every worn body part in bases[b].ofCover[anim] (parts with an `anims` list:
//    partPlays); in other anims a part listed in bases[b].ofExt plays only its listed anims.  pickAnim walks
//    animFallback (desk_write -> sit_idle -> sit -> idle; carry_sack -> walk, the game then head-carries the sack).
//  - pages: pageOf(anim) / pageNeeded(person, anim) from ofPages (one atlas per page).
//  - points: handPoint (hand_over), impactPoint (desk_write / stamp_stand), sackPoint (scoop / carry_sack),
//    tipPoint (point_board), groundSpeed (carry_sack); mirrored dirs negate x.
//  - OfficefolkSprite: pickAnim (+ {has}) like CityfolkSprite, dirs an anim lacks snap to the nearest one it has
//    (file: NE / N / NW, hand_over: SE / E / NE + mirrors), repeat 0 (bow, hand_over) plays once, holds the last frame
//    and calls onDone(requestedAnim).
//  (polish)
//  - pageNeeded(person, anim) is per person for the office anims too: the page holding the frames THAT person draws
//    (the aide's 'note' lives on the always-resident 'sack' page, everybody else's on 'errand'); a person needing
//    two pages gets the non-resident one (ofPages.resident = 'sack' is resident wherever officefolk staff are).
//  - pickAnim: a townfolk anim the person can play whose only missing page holds officefolk frames of their
//    extended layers (the manager's blazer, the clerk's cuff sleeves) is played WITHOUT those layers instead of
//    falling back (no more walking in place off the bank page).
//  - installOfficefolkRuntime(TF): teaches the game's own doll runtime (src/core/Townfolk.js TF.layersInto, used by
//    DollSprite, and TF.person) every fragment rule above; tools/test/officefolk_phaser.mjs --parity proves the
//    patched TF draws exactly what Officefolk.layers draws (office anims included).

import { MIRROR } from './townfolk_compose.js';
import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './cityfolk_compose.js';
import { partPlays, nearestDir, headHidden } from './beachfolk_compose.js';

const isItem = (P) => (P.tags || []).includes('item') || (P.tags || []).includes('anim_item');
const EMPTY_O = Object.freeze({});
const EMPTY_A = Object.freeze([]);

/** Post rules of the officefolk merge (in place on the merged townfolk block). */
export function applyOfficefolkRules(M) {
  for (const [hp, alt] of Object.entries(M.headPoseFallback || {})) {
    if ((M.headPoses || {})[hp]) continue;
    for (const a of M.officefolkAnims || []) {
      for (const row of Object.values(M.timeline[a] || {})) for (const e of row) if (e.hp === hp) e.hp = alt;
    }
  }
  return M;
}

/** {atlases, townfolk} = assets/townfolk + any fragments (townfolk2, beachfolk, cityfolk ...) + officefolk (last). */
export function mergeOfficefolk(man, ...frags) {
  const out = mergeTownfolkFragments(man, ...frags);
  applyOfficefolkRules(out.townfolk);
  return out;
}

/** preset 'force' parts: appended when missing (and rendered for the base), no rng drawn */
export function applyForce(T, person, preset) {
  const P = preset ? (T.generator.presets[preset] || {}) : {};
  for (const pn of P.force || []) {
    if (person.parts.includes(pn) || !T.parts[pn]) continue;
    if (T.parts[pn].space === 'body' && !T.bases[person.base].parts.includes(pn)) continue;
    person.parts.push(pn);
  }
  return person;
}

export class Officefolk extends Cityfolk {
  canPlay(person, anim) {
    const T = this.T;
    if (!T.anims[anim]) return false;
    const B = T.bases[person.base];
    if ((T.officefolkAnims || []).includes(anim)) {
      const cover = (B.ofCover || {})[anim] || [];
      for (const pn of this.animParts(person, anim)) {
        const P = T.parts[pn];
        if (!P || P.space !== 'body' || isItem(P) || !P.subs || !Object.keys(P.subs).length) continue;
        if (P.anims) { if (!partPlays(P, anim)) return false; } else if (!cover.includes(pn)) return false;
      }
      return true;
    }
    const ext = B.ofExt || {};
    for (const pn of this.animParts(person, anim)) if (ext[pn] && !ext[pn].includes(anim)) return false;
    return super.canPlay(person, anim);
  }

  pageOf(anim) {
    const g = ((this.T.ofPages || {}).groups) || {};
    for (const [name, inf] of Object.entries(g)) if ((inf.anims || []).includes(anim)) return name;
    return super.pageOf(anim);
  }

  _atlasPages() {
    if (!this._atlasPage) {
      this._atlasPage = {};
      for (const [g, inf] of Object.entries(((this.T.ofPages || {}).groups) || {})) for (const a of inf.atlases || []) this._atlasPage[a] = g;
    }
    return this._atlasPage;
  }

  /** every officefolk page this person's frames of `anim` come from (the anim's own page first) */
  pagesNeeded(person, anim) {
    const info = this.T.anims[anim];
    if (!info) return [];
    const ap = this._atlasPages(), out = [];
    for (const l of this.layers(person, anim, info.dirs[0], 0)) { const g = ap[l.atlas]; if (g && !out.includes(g)) out.push(g); }
    const own = this.pageOf(anim);
    out.sort((a, b) => (b === own) - (a === own));
    return out;
  }

  /** the page this person's frames of `anim` need: an officefolk page (ofPages; the non-resident one when two are
   *  needed), else cityfolk's (cfPages, when merged), else null (townfolk / townfolk2 frames only) */
  pageNeeded(person, anim) {
    const isOf = (this.T.officefolkAnims || []).includes(anim);
    if (!this.T.anims[anim]) return null;
    const pgs = this.pagesNeeded(person, anim);
    const res = (this.T.ofPages || {}).resident;
    const pick = pgs.find((g) => g !== res) || pgs[0];
    if (pick) return pick;
    return isOf ? this.pageOf(anim) : super.pageNeeded(person, anim);   // cityfolk pages (when merged), else null
  }

  /** {anim, face}: Cityfolk.pickAnim + (polish M2) a townfolk anim whose only missing page holds this person's
   *  officefolk extended layers is played without them (the 은행장 off the bank page idles in shirt and tie). */
  pickAnim(person, anim, opts = {}) {
    const has = opts.has;
    if (!has) return super.pickAnim(person, anim, opts);
    const T = this.T, groups = (T.ofPages || {}).groups || {};
    const ok = (a) => {
      if (!this.canPlay(person, a)) return false;
      if (has(a, person)) return true;
      if ((T.officefolkAnims || []).includes(a) || !T.anims[a]) return false;
      const pg = this.pageNeeded(person, a);
      return !!(pg && groups[pg]);                     // only officefolk extended layers missing: drawn without them
    };
    if (ok(anim)) return { anim, face: null };
    const face = (T.fallbackFace || {})[anim] || null;
    for (const a of (T.animFallback || {})[anim] || []) if (ok(a)) return { anim: a, face };
    return { anim: ok('idle') ? 'idle' : 'walk', face };
  }

  _opt(table, anim, dir, i) {
    let t = this.T.bases[this.__p.base][table] || {};
    if (anim != null) t = t[anim] || {};
    const row = t[MIRROR[dir] || dir];
    const v = row == null ? null : (i == null ? row : row[i]);
    if (v == null) return null;
    const out = v.slice();
    if (dir in MIRROR) out[0] = -out[0];
    return out;
  }
  /** [x, y] px from the anchor between the offering mittens (hand_over frame i) */
  handPoint(person, dir, i) { this.__p = person; return this._opt('handPoint', null, dir, i); }
  /** [x, y] where the stamp hits the paper on the impact frame (desk_write 4 / stamp_stand 3) */
  impactPoint(person, anim, dir) { this.__p = person; return this._opt('impactPoint', anim, dir, null); }
  /** [x, y] the coin target: the open sack mouth (scoop) / the sack on the shoulder (carry_sack) */
  sackPoint(person, anim, dir, i) { this.__p = person; return this._opt('sackPoint', anim, dir, i); }
  /** [x, y] the pointer tip (point_board) */
  tipPoint(person, dir, i) { this.__p = person; return this._opt('tipPoint', 'point_board', dir, i); }

  preset(name, rng) { return applyForce(this.T, this.generate(rng, name), name); }
}

/** CityfolkSprite + nearest dir + once anims (repeat 0 holds the last frame, calls onDone). */
export class OfficefolkSprite extends CityfolkSprite {
  play(anim, dir) {
    const pick = this.tf.pickAnim(this.person, anim, { has: this.has });
    this.requested = anim;
    this.fallbackFace = pick.face;
    const a = pick.anim;
    dir = nearestDir(this.tf.T.anims[a].dirs, dir);
    if (a !== this.anim) { this.anim = a; this.frame = 0; this.t = 0; this.done = false; }
    this.dir = dir;
    this.refresh();
    return this;
  }

  /** restart a once anim (bow / hand_over) from frame 0 */
  replay() { this.frame = 0; this.t = 0; this.done = false; this.refresh(); return this; }

  update(dt) {
    const a = this.tf.T.anims[this.anim];
    if (a.repeat === 0 && this.frame >= a.frames - 1) {
      if (!this.done) { this.done = true; if (this.onDone) this.onDone(this.requested || this.anim); }
      return;
    }
    super.update(dt);
  }
}

// ---------------------------------------------------------------- (polish H1) the game's own doll runtime
const LIMBS_RT = [['arm_R', 'sleeve'], ['arm_L', 'sleeve'], ['hand_R', 'hands'], ['hand_L', 'hands']];
const _vis = [], _heads = [], _limbZ = {};

/**
 * Allocation-light draw list = Officefolk.layers(person, anim, dir, i, opts) (same order, z, frames, tints, atlases,
 * dx / dy), written into the reused entries of `out`; returns the count.  The fragment rules the v4 runtime lacks:
 * atlas = frameAtlasAnim[anim][layer@base] ?? frameAtlas (heads: frameAtlasPose[hp]), animItems[anim] (unless
 * opts.noItems), parts / subs limited by anims / onlyAnims / noAnims, cfDrop, hidden head parts, zfrontFollow,
 * followDz, the head frame dir tl.hd, faceDirsByPose and the face override opts.face.
 */
export function layersIntoOF(TF, person, anim, dir, i, out, opts) {
  const T = TF.T, tf = TF.tf;
  const flip = dir in MIRROR;
  const d = MIRROR[dir] || dir;
  const B = T.bases[person.base];
  const base = B.render || person.base;
  const sx = B.scaleX || 1;
  const tl = T.timeline[anim][d][i];
  const hp = tl.hp;
  const hd = tl.hd || d;
  let expr = tl.face, brow = tl.brow;
  const fo = opts && opts.face;
  if (fo && ((T.faceExprs || EMPTY_O)[hp] || EMPTY_A).indexOf(fo) >= 0) { expr = fo; brow = (T.exprBrow || EMPTY_O)[fo] || 'neutral'; }
  const zf = tl.zfront || EMPTY_A;
  const fa = T.frameAtlas, faA = (T.frameAtlasAnim || EMPTY_O)[anim] || EMPTY_O, faP = (T.frameAtlasPose || EMPTY_O)[hp] || EMPTY_O;
  let n = 0;
  const put = (z, layer, frame, tint, head) => {
    let e = out[n];
    if (!e) e = out[n] = { z: 0, order: 0, layer: '', atlas: '', frame: '', tint: null, head: false, flip: false, sx: 1, dx: 0, dy: 0 };
    const L = head ? layer : layer + '@' + base;
    e.z = z; e.order = n; e.layer = layer; e.atlas = (head ? faP[L] : faA[L]) || fa[L]; e.frame = frame;
    e.tint = tint; e.head = head; e.flip = flip; e.sx = head ? 1 : sx;
    n++;
  };
  for (const [name, slot] of LIMBS_RT) {
    const L = T.limbs[name];
    _limbZ[name] = zf.indexOf(name) >= 0 ? L.zFront : L.z;
    put(_limbZ[name], name, name + '@' + base + '/' + anim + '_' + d + '_' + i, tf.tint(person, slot), false);
  }
  // visible parts (Cityfolk.visibleParts): person parts + generator.animParts[anim] + animItems[anim], filtered
  let nv = 0, np = 0;
  const parts = person.parts;
  for (let k = 0; k < parts.length; k++) _vis[np++] = parts[k];
  const ap = ((T.generator || EMPTY_O).animParts || EMPTY_O)[anim];
  if (ap) for (const pn of ap) { let dup = false; for (let k = 0; k < np; k++) if (_vis[k] === pn) { dup = true; break; } if (!dup && T.parts[pn]) _vis[np++] = pn; }
  if (!(opts && opts.noItems)) {
    const its = (T.animItems || EMPTY_O)[anim];
    if (its) for (const pn of its) { let dup = false; for (let k = 0; k < np; k++) if (_vis[k] === pn) { dup = true; break; } if (!dup) _vis[np++] = pn; }
  }
  const drop = T.cfDrop || EMPTY_O;
  for (let k = 0; k < np; k++) {
    const pn = _vis[k], P = T.parts[pn];
    if (!P) continue;
    if (P.noAnims && P.noAnims.indexOf(anim) >= 0) continue;
    if (P.onlyAnims && P.onlyAnims.indexOf(anim) < 0) continue;
    if (P.anims && P.anims.indexOf(anim) < 0) continue;
    if (drop[pn] && drop[pn].indexOf(anim) >= 0) continue;
    if (P.space === 'head' && headHidden(T, pn, anim)) continue;
    _vis[nv++] = pn;
  }
  let hat = false;
  for (let k = 0; k < nv; k++) { const P = T.parts[_vis[k]]; if (P.family === 'hat' && P.cls === 'full') { hat = true; break; } }
  let hn = 0;
  for (let k = 0; k < nv; k++) {
    const pn = _vis[k], P = T.parts[pn];
    for (const s in P.subs) {
      const sd = P.subs[s];
      if (sd.onlyAnims && sd.onlyAnims.indexOf(anim) < 0) continue;
      if (sd.noAnims && sd.noAnims.indexOf(anim) >= 0) continue;
      let z = typeof sd.z === 'object' ? sd.z[d] : sd.z;
      if (sd.follow) z = _limbZ[sd.follow] + (sd.followDz ?? 0.5);
      if (sd.zfrontFollow && zf.indexOf(sd.zfrontFollow) >= 0) z = T.limbs[sd.zfrontFollow].zFront + 0.5;
      if (P.space === 'body') {
        put(z, pn + '.' + s, pn + '.' + s + '@' + base + '/' + anim + '_' + d + '_' + i, tf.tint(person, sd.tint), false);
      } else {
        const zh = typeof sd.z === 'object' ? sd.z[hd] : sd.z;
        const suf = hat && P.hatfit ? '~hat' : '';
        _heads[hn++] = zh; _heads[hn++] = pn + '.' + s + suf; _heads[hn++] = tf.tint(person, sd.tint);
        if (sd.sheen) { _heads[hn++] = zh + 0.5; _heads[hn++] = pn + '.' + s + suf + '.sheen'; _heads[hn++] = null; }
      }
    }
  }
  const Z = T.z;
  const sfx = '/' + hp + '_' + hd;
  const nose = 'head.' + (person.nose || 'dot');
  put(Z.head, nose, nose + sfx, tf.tint(person, 'skin'), true);
  if ((((T.faceDirsByPose || EMPTY_O)[hp]) || T.faceDirs).indexOf(hd) >= 0) {
    const fs = person.face || 'std';
    const fa_ = 'face.' + fs + '.' + expr, br = 'brow.' + fs + '.' + brow;
    put(Z.face, fa_, fa_ + sfx, null, true);
    put(Z.brow, br, br + sfx, tf.tint(person, 'hair'), true);
  }
  for (let k = 0; k < hn; k += 3) put(_heads[k], _heads[k + 1], _heads[k + 1] + sfx, _heads[k + 2], true);
  for (let a = 1; a < n; a++) {                         // stable insertion sort by z (short, nearly sorted lists)
    const e = out[a];
    let b = a - 1;
    while (b >= 0 && (out[b].z > e.z || (out[b].z === e.z && out[b].order > e.order))) { out[b + 1] = out[b]; b--; }
    out[b + 1] = e;
  }
  const ho = B.headOffset[anim][d][i];
  for (let k = 0; k < n; k++) { const l = out[k]; if (l.head) { l.dx = flip ? -ho[0] : ho[0]; l.dy = ho[1]; } else { l.dx = 0; l.dy = 0; } }
  return n;
}

/**
 * Install the officefolk rules into the game's shared doll runtime, once, right after TF.init(merged manifest):
 *   import { TF } from './core/Townfolk.js';
 *   const man = mergeOfficefolk(mTownfolk, mOfficefolk);  TF.init(man, game);  installOfficefolkRuntime(TF);
 * - TF.layersInto(person, anim, dir, i, out[, {face, noItems}]) -> layersIntoOF (DollSprite unchanged: same entries);
 * - TF.person(rng, preset) applies preset 'force' (the 은행장's blazer);
 * - TF.of = the Officefolk instance on the same block: pickAnim(person, anim, {has}), canPlay, pageNeeded, handPoint,
 *   impactPoint, sackPoint, tipPoint, groundSpeed.
 * Without officefolk merged it changes nothing that the v4 runtime draws (parity test: identical lists + atlases).
 */
export function installOfficefolkRuntime(TF) {
  if (!TF || !TF.T) throw new Error('installOfficefolkRuntime: call TF.init(mergedManifest) first');
  if (TF.of && TF.of.T === TF.T) return TF.of;
  const of = new Officefolk(TF.T);
  const person0 = TF._personV4 || TF.person;
  TF._personV4 = person0;
  TF.person = function (rng, preset) { return applyForce(this.T, person0.call(this, rng, preset), preset); };
  TF.layersInto = function (person, anim, dir, i, out, opts) { return layersIntoOF(this, person, anim, dir, i, out, opts); };
  TF.of = of;
  return of;
}
