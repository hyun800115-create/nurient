// beachfolk_compose.js - JS port of tools/beachfolk_compose.py (townfolk v4 + v5 + beachfolk, CONTRACT_V7 Y).
// Ready to copy into src/ next to townfolk_compose.js and townfolk2_compose.js (imports both; they stay unchanged).
//
//   import { mergeBeachfolkManifests, Beachfolk, BeachfolkSprite } from './beachfolk_compose.js';
//   import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
//   const man = mergeBeachfolkManifests(manTownfolk, manTownfolk2, manBeachfolk);   // {atlases, townfolk}
//   preload(): townfolkPreload(this, man);   create(): townfolkInstall(this, man);
//   const bf = new Beachfolk(man.townfolk);
//   const p = bf.preset('swimmer', mulberry32(7));            // or bf.beachFamily(rng) -> [people]
//   if (bf.canPlay(p, 'swim')) { const s = new BeachfolkSprite(scene, bf, p, x, y); s.play('swim', 'SW'); }
//
// Beachfolk rules on top of the v4 + v5 ones (townfolk_compose.js / townfolk2_compose.js):
//  - head frames use timeline hd (head frame dir; default the anim dir) and faceDirsByPose[hp] (default faceDirs).
//  - generator.animParts[anim] are drawn in that anim even when the person does not wear them (float: swim ring,
//    surf: surfboard, dig: toy spade).  Their colours come from the person's beach slots (always filled).
//  - parts draw only in their `anims` minus `noAnims`; canPlay(person, anim) is true when every body part of the
//    person LISTS the anim (partPlays(); parts without `anims` = townfolk parts: the v4 + v5 anims).  Drop accessories
//    (towel, flip-flops, camera, rescue tube, floaties, caddy) list every anim in `anims` and the ones they have no
//    frames for in `noAnims` (simply put down there), so canPlay agrees with any compositor honouring anims + noAnims.
//    The swim ring is no drop part: ring wearers cannot swim / surf / dig / play ball / sunbathe.
//  - animHideHead[anim]: hats taken off (swim / surf), put down (sunbathe) or never worn there (float); a hidden full
//    hat no longer squashes the hair (normal hair layer instead of ~hat).
//  - pickAnim(person, anim) / animFallback (cityfolk-compatible): swim -> float for ring wearers.  BeachfolkSprite.play
//    goes through it (sprite.anim = what is really played).
//  - follow subs: z = limb z + (followDz ?? 0.5).
//  - water anims (swim, float, splash_play, surf): the anchor is ON THE WATER SURFACE (townfolk.water).
//  - sunbathe dir = where the FEET point: sunbatheDirFor(spot, i) for towel / lounger / pool spots; surf dir = where the
//    board nose points (SE / NE rendered, SW / NW mirrored).

import { Townfolk2, TownfolkSprite2, mergeTownfolk } from './townfolk2_compose.js';
import { MIRROR } from './townfolk_compose.js';

const LIMBS = [['arm_R', 'sleeve'], ['arm_L', 'sleeve'], ['hand_R', 'hands'], ['hand_L', 'hands']];
export const OLD_ANIMS = ['idle', 'walk', 'carry_walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push'];
const clone = (o) => JSON.parse(JSON.stringify(o));

function pick(rng, opts) {          // same algorithm as townfolk_compose.js (not exported there)
  if (!opts) return null;
  if (Array.isArray(opts)) return opts.length ? opts[Math.floor(rng() * opts.length)] : null;
  const names = Object.keys(opts).filter((n) => opts[n] > 0);
  if (!names.length) return null;
  let tot = 0; for (const n of names) tot += opts[n];
  let x = rng() * tot;
  for (const n of names) { x -= opts[n]; if (x < 0) return n; }
  return names[names.length - 1];
}

/** Canonical per-part play rule for EVERY townfolk compositor: true when body part P lets its wearer play `anim`. */
export function partPlays(P, anim, oldAnims = OLD_ANIMS) {
  if (!P || P.space !== 'body' || !P.subs || !Object.keys(P.subs).length) return true;
  return (P.anims || oldAnims).includes(anim);
}

/** True when head part pn is hidden in `anim` (animHideHead or the part's noAnims). */
export function headHidden(T, pn, anim) {
  const P = T.parts[pn];
  if (!P) return true;
  if (P.noAnims && P.noAnims.includes(anim)) return true;
  return ((T.animHideHead || {})[anim] || []).includes(pn);
}

const OPP = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };
/** sunbathe dir (= where the FEET point) for lying spot i of a prop sprite def (assets/beach towels / loungers,
 *  beach_bld pools): lyingFeetDirs[i] when present, else the opposite of lyingDirs[i] (hips -> head). */
export function sunbatheDirFor(spot, i = 0) {
  if (spot.lyingFeetDirs && spot.lyingFeetDirs.length) return spot.lyingFeetDirs[Math.min(i, spot.lyingFeetDirs.length - 1)];
  if (spot.lyingDirs && spot.lyingDirs.length) return OPP[spot.lyingDirs[Math.min(i, spot.lyingDirs.length - 1)]];
  return 'SE';
}

/** Merged block: (townfolk v4 + v5 merged block M2) + beachfolk fragment B (see beachfolk.merge in the manifest). */
export function mergeBeachfolk(M2, B) {
  const M = clone(M2);
  for (const k of ['anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas']) {
    for (const [key, v] of Object.entries(B[k] || {})) {
      if (M[k] && key in M[k]) throw new Error(`beachfolk redefines ${k}.${key}`);
      (M[k] = M[k] || {})[key] = clone(v);
    }
  }
  for (const [b, Bb] of Object.entries(B.bases || {})) {
    const Mb = M.bases[b];
    for (const [a, v] of Object.entries(Bb.headOffset || {})) Mb.headOffset[a] = clone(v);
    Mb.parts = [...new Set([...Mb.parts, ...(Bb.parts || [])])].sort();
    for (const key of ['ballPoint', 'digPoint', 'splashPoint', 'lieShadow', 'bodyK']) if (key in Bb) Mb[key] = clone(Bb[key]);
  }
  M.tintModel = Object.assign({}, M.tintModel, { slotS: Object.assign({}, M.tintModel.slotS || {}, (B.tintModel || {}).slotS || {}) });
  for (const [slot, tbl] of Object.entries(B.tintTable || {})) M.tintTable[slot] = Object.assign(M.tintTable[slot] || {}, tbl);
  M.faceExprs = M.faceExprs || {};
  for (const [hp, exprs] of Object.entries(B.faceExprs || {})) {
    const lst = M.faceExprs[hp] = M.faceExprs[hp] || [];
    for (const e of exprs) if (!lst.includes(e)) lst.push(e);
  }
  M.exprBrow = Object.assign({}, M.exprBrow || {}, B.exprBrow || {});
  M.faceDirsByPose = Object.assign({}, M.faceDirsByPose || {}, B.faceDirsByPose || {});
  const G = M.generator, GB = B.generator || {};
  for (const [key, v] of Object.entries(GB.presets || {})) {
    if (key in G.presets) throw new Error(`beachfolk redefines preset ${key}`);
    G.presets[key] = clone(v);
  }
  G.slotPalette = Object.assign({}, G.slotPalette, GB.slotPalette || {});
  G.exclude = [...G.exclude, ...(GB.exclude || [])];
  G.beachSlots = [...(GB.beachSlots || [])];
  G.animParts = clone(GB.animParts || {});
  for (const key of ['water', 'sunbathe', 'dig', 'ball', 'animHideHead', 'pageClasses']) if (key in B) M[key] = clone(B[key]);
  M.animFallback = Object.assign({}, M.animFallback || {}, clone(B.animFallback || {}));
  M.frameAtlasAnim = M.frameAtlasAnim || {};
  M.frameAtlasPose = M.frameAtlasPose || {};
  for (const ext of B.frameAtlasExt || []) {
    for (const a of ext.anims || []) M.frameAtlasAnim[a] = Object.assign(M.frameAtlasAnim[a] || {}, ext.map);
    for (const hp of ext.poses || []) M.frameAtlasPose[hp] = Object.assign(M.frameAtlasPose[hp] || {}, ext.map);
  }
  return M;
}

/** {atlases, townfolk} from the three manifest JSONs (assets/townfolk, townfolk2, beachfolk). */
export function mergeBeachfolkManifests(man, man2, man3) {
  return { version: 1, atlases: [...man.atlases, ...man2.atlases, ...man3.atlases], images: [], sprites: {},
    townfolk: mergeBeachfolk(mergeTownfolk(man.townfolk, man2.townfolk2), man3.beachfolk) };
}

export class Beachfolk extends Townfolk2 {
  /** The person's parts + the props the anim always shows. */
  animParts(person, anim) {
    const parts = [...person.parts];
    for (const pn of (this.T.generator.animParts || {})[anim] || []) if (!parts.includes(pn) && this.T.parts[pn]) parts.push(pn);
    return parts;
  }

  /** true when every body part of the person lets it play the anim (partPlays). */
  canPlay(person, anim) {
    if (!this.T.anims[anim]) return false;
    for (const pn of this.animParts(person, anim)) if (!partPlays(this.T.parts[pn], anim)) return false;
    return true;
  }

  /** {anim, face}: `anim` if playable, else the first playable animFallback entry, else idle / walk
   *  (the same rule as cityfolk_compose.js pickAnim). */
  pickAnim(person, anim) {
    if (this.canPlay(person, anim)) return { anim, face: null };
    const face = (this.T.fallbackFace || {})[anim] || null;
    for (const a of (this.T.animFallback || {})[anim] || []) if (this.canPlay(person, a)) return { anim: a, face };
    return { anim: this.canPlay(person, 'idle') ? 'idle' : 'walk', face };
  }

  /** the parts drawn in `anim` (animParts minus noAnims / non-listed anims / hidden head parts), in draw order */
  visibleParts(person, anim) {
    const T = this.T;
    return this.animParts(person, anim).filter((pn) => {
      const P = T.parts[pn];
      if (P.noAnims && P.noAnims.includes(anim)) return false;
      if (P.anims && !P.anims.includes(anim)) return false;
      if (P.space === 'head' && headHidden(T, pn, anim)) return false;
      return true;
    });
  }

  /** draw list for one frame; dir may be mirrored.  opts.face = optional face expression override */
  layers(person, anim, dir, i, opts = {}) {
    const T = this.T;
    const flip = dir in MIRROR;
    const d = MIRROR[dir] || dir;
    const B = T.bases[person.base];
    const base = B.render || person.base;
    const sx = B.scaleX || 1;
    const tl = T.timeline[anim][d][i];
    const hp = tl.hp;
    const hd = tl.hd || d;
    let expr = tl.face, brow = tl.brow;
    if (opts.face && ((T.faceExprs || {})[hp] || []).includes(opts.face)) { expr = opts.face; brow = T.exprBrow[opts.face] || 'neutral'; }
    const zf = new Set(tl.zfront || []);
    const out = [];
    const limbZ = {};
    let n = 0;
    const fa = T.frameAtlas, faA = (T.frameAtlasAnim || {})[anim] || {}, faP = (T.frameAtlasPose || {})[hp] || {};
    const push = (z, layer, frame, tint, head) => {
      const L = head ? layer : layer + '@' + base;
      const atlas = (head ? faP[L] : faA[L]) || fa[L];
      out.push({ z, order: n++, layer, atlas, frame, tint, head, flip, sx: head ? 1 : sx });
    };
    for (const [name, slot] of LIMBS) {
      const L = T.limbs[name];
      limbZ[name] = zf.has(name) ? L.zFront : L.z;
      push(limbZ[name], name, `${name}@${base}/${anim}_${d}_${i}`, this.tint(person, slot), false);
    }
    const vis = this.visibleParts(person, anim);
    const hat = vis.some((pn) => T.parts[pn].family === 'hat' && T.parts[pn].cls === 'full');
    const heads = [];
    for (const pn of vis) {
      const P = T.parts[pn];
      for (const [s, sd] of Object.entries(P.subs)) {
        let z = typeof sd.z === 'object' ? sd.z[d] : sd.z;
        if (sd.follow) z = limbZ[sd.follow] + (sd.followDz ?? 0.5);
        if (sd.zfrontFollow && zf.has(sd.zfrontFollow)) z = T.limbs[sd.zfrontFollow].zFront + 0.5;
        if (P.space === 'body') {
          push(z, `${pn}.${s}`, `${pn}.${s}@${base}/${anim}_${d}_${i}`, this.tint(person, sd.tint), false);
        } else {
          const zh = typeof sd.z === 'object' ? sd.z[hd] : sd.z;
          const suf = hat && P.hatfit ? '~hat' : '';
          heads.push([zh, `${pn}.${s}${suf}`, this.tint(person, sd.tint)]);
          if (sd.sheen) heads.push([zh + 0.5, `${pn}.${s}${suf}.sheen`, null]);
        }
      }
    }
    const Z = T.z;
    const hf = (layer) => `${layer}/${hp}_${hd}`;
    push(Z.head, `head.${person.nose || 'dot'}`, hf(`head.${person.nose || 'dot'}`), this.tint(person, 'skin'), true);
    if (((T.faceDirsByPose || {})[hp] || T.faceDirs).includes(hd)) {
      const fs = person.face || 'std';
      push(Z.face, `face.${fs}.${expr}`, hf(`face.${fs}.${expr}`), null, true);
      push(Z.brow, `brow.${fs}.${brow}`, hf(`brow.${fs}.${brow}`), this.tint(person, 'hair'), true);
    }
    for (const [z, layer, tint] of heads) push(z, layer, hf(layer), tint, true);
    out.sort((a, b) => a.z - b.z || a.order - b.order);
    const ho = B.headOffset[anim][d][i];
    for (const l of out) if (l.head) { l.dx = flip ? -ho[0] : ho[0]; l.dy = ho[1]; } else { l.dx = 0; l.dy = 0; }
    return out;
  }

  // ---- anim points (pixel offsets from the anchor; mirrored dirs negate x)
  _pt(v, dir) { if (v == null) return null; const o = [...v]; if (dir in MIRROR) o[0] = -o[0]; return o; }
  /** [dx, dy, front, radiusPx] centre of the held beach ball (null: no ball in the hands this frame). */
  ballPoint(person, anim, dir, i) {
    const bp = (this.T.bases[person.base].ballPoint || {})[anim];
    return bp ? this._pt(bp[MIRROR[dir] || dir][i], dir) : null;
  }
  digPoint(person, dir) { return this._pt(this.T.bases[person.base].digPoint[MIRROR[dir] || dir], dir); }
  splashPoint(person, dir) { return this._pt(this.T.bases[person.base].splashPoint[MIRROR[dir] || dir], dir); }
  /** sunbathe shadow ellipse {center, length, width, angleDeg} */
  lieShadow(person, dir) {
    const s = clone(this.T.bases[person.base].lieShadow[MIRROR[dir] || dir]);
    if (dir in MIRROR) { s.center[0] = -s.center[0]; s.angleDeg = 180 - s.angleDeg; }
    return s;
  }

  /** townfolk2 generator + beach slots (preset colour or slot palette) + addOns + bare-arm sleeves. */
  generate(rng, preset) {
    const person = super.generate(rng, preset);
    const T = this.T, G = T.generator;
    const P = preset ? G.presets[preset] : {};
    const pc = P.colors || {}, pal = T.palettes, cols = person.colors;
    for (const slot of G.beachSlots || []) {
      let v = pc[slot];
      if (v == null) v = G.slotPalette[slot];
      if (Array.isArray(v)) v = v[Math.floor(rng() * v.length)];
      if (v.startsWith('=')) cols[slot] = cols[v.slice(1)];
      else if (v.startsWith('#')) cols[slot] = v;
      else cols[slot] = pal[v][Math.floor(rng() * pal[v].length)];
    }
    const age = T.bases[person.base].age;
    const avail = new Set(T.bases[person.base].parts);
    const ok = (pn) => {
      const part = T.parts[pn];
      if (!part || (part.ages && !part.ages.includes(age))) return false;
      return part.space === 'head' || avail.has(pn);
    };
    for (const [table, chance] of P.addOns || []) {
      const opts = {};
      for (const k of Object.keys(table)) if (ok(k) && !person.parts.some((c) => this.conflicts(k, c))) opts[k] = table[k];
      if (!Object.keys(opts).length) continue;
      if (rng() >= chance) continue;
      const x = pick(rng, opts);
      if (x) person.parts.push(x);
    }
    if (person.parts.includes('bare_arms')) cols.sleeve = cols.skin;
    return person;
  }

  /** A family day out: 1-2 adults + 1-3 kids ('family_beach'), most wearing matching swimwear colours. */
  beachFamily(rng) {
    const nAdults = 1 + (rng() < 0.6 ? 1 : 0);
    const nKids = 1 + Math.floor(rng() * 3);
    const fam = [];
    let swim = null, swim2 = null;
    for (let k = 0; k < nAdults + nKids; k++) {
      const kid = k >= nAdults;
      let p;
      for (let tries = 0; tries < 50; tries++) {
        p = this.preset('family_beach', rng);
        if ((this.T.bases[p.base].age === 'child') === kid) break;
      }
      if (swim == null) { swim = p.colors.swim; swim2 = p.colors.swim2; }
      else if (rng() < 0.75) { p.colors.swim = swim; p.colors.swim2 = swim2; }
      fam.push(p);
    }
    return fam;
  }
}

const DIR_ANG = { S: 0, SE: 45, E: 90, NE: 135, N: 180, NW: 225, W: 270, SW: 315 };
const UNMIRROR = { SE: 'SW', E: 'W', NE: 'NW' };

/** Nearest dir an anim has (its rendered dirs + their mirrors) to the wanted one. */
export function nearestDir(dirs, want) {
  const cand = new Set();
  for (const d of dirs) { cand.add(d); if (UNMIRROR[d]) cand.add(UNMIRROR[d]); }
  if (cand.has(want)) return want;
  let best = null, bd = 1e9;
  for (const c of cand) {
    let a = Math.abs(DIR_ANG[c] - DIR_ANG[want]) % 360; if (a > 180) a = 360 - a;
    if (a < bd) { bd = a; best = c; }
  }
  return best;
}

/** TownfolkSprite2 for Beachfolk: the anim goes through pickAnim (swim -> float for ring wearers; this.anim is what is
 *  really played) and dirs an anim lacks (sunbathe / surf have SE NE SW NW only) snap to the nearest. */
export class BeachfolkSprite extends TownfolkSprite2 {
  play(anim, dir) {
    const T = this.tf.T;
    if (this.tf.pickAnim) anim = this.tf.pickAnim(this.person, anim).anim;
    dir = nearestDir(T.anims[anim].dirs, dir);
    if (anim !== this.anim) { this.anim = anim; this.frame = 0; this.t = 0; }
    this.dir = dir;
    this.refresh();
  }

  update(dt) {
    const a = this.tf.T.anims[this.anim];
    this.t += dt;
    const step = 1000 / a.fps;
    if (this.t >= step) {
      this.t -= step;
      if (a.repeat === 0 && this.frame >= a.frames - 1) return;      // one-shot (ball_throw / ball_catch): hold
      this.frame = (this.frame + 1) % a.frames;
      this.refresh();
    }
  }
}
