// cityfolk_compose.js - JS port of tools/cityfolk_compose.py (townfolk v4 + v5 + v8 cityfolk, CONTRACT_V8 AD).
// Ready to copy into src/ next to townfolk_compose.js / townfolk2_compose.js (imports them; they stay unchanged).
//
//   import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './cityfolk_compose.js';
//   import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
//   const man = mergeTownfolkFragments(mTownfolk, mTownfolk2, mCityfolk);   // (+ beachfolk anywhere after townfolk2)
//   preload(): townfolkPreload(this, man);   create(): townfolkInstall(this, man);
//   const tf = new Cityfolk(man.townfolk);
//   const ff = tf.preset('firefighter', mulberry32(7));
//   const s = new CityfolkSprite(scene, tf, ff, x, y); s.play('spray_hose', 'SE');   // falls back if needed
//   const [nx, ny, ux, uy] = tf.nozzlePoint(ff, 'SE', s.frame);                      // aim fx_hose_stream
//
// v8 rules on top of the v4 / v5 ones (townfolk_compose.js, townfolk2_compose.js):
//  - animItems[anim] parts are added to everybody playing that anim (held_box, held_hose, held_broom, held_phone,
//    hand_point); opts.noItems = true leaves them out (e.g. to carry a real logistics item at boxPoint).
//  - parts with onlyAnims draw only there; parts with noAnims never draw there.
//  - canPlay(person, anim): for a cityfolk anim every worn body part (items excepted) must be listed in
//    bases[b].cfCover[anim]; for older anims every worn cityfolk part must be listed there.  pickAnim() walks
//    animFallback[anim] (e.g. flee -> run -> walk) and returns {anim, face} (fallbackFace keeps the mood).
//  - new face expressions (shocked, panic, angry, shout, thinking, determined, sheepish) work as face overrides
//    on every face pose (faceExprs).
//  - points: nozzlePoint / boxPoint / sweepPoint per frame (mirrored dirs negate x).

import { MIRROR } from './townfolk_compose.js';
import { Townfolk2, TownfolkSprite2 } from './townfolk2_compose.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const LIMBS = [['arm_R', 'sleeve'], ['arm_L', 'sleeve'], ['hand_R', 'hands'], ['hand_L', 'hands']];
const HANDLED = new Set(['version', 'fragment', 'extends', 'requires', 'anims', 'timeline', 'headPoses', 'parts', 'z',
  'tintRef', 'palettes', 'frameAtlas', 'bases', 'tintModel', 'tintTable', 'generator', 'faceExprs', 'exprBrow',
  'frameAtlasExt', 'merge', 'notes']);

/** Merge one fragment block F (townfolk2 format: townfolk2 / beachfolk / cityfolk) into the merged block M (in place). */
export function mergeTownfolkFragment(M, F, name = F.fragment || 'fragment') {
  M.animFragment = M.animFragment || {};
  for (const a of Object.keys(F.anims || {})) M.animFragment[a] = name;
  for (const k of ['anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas']) {
    for (const [key, v] of Object.entries(F[k] || {})) {
      if (M[k] && key in M[k]) throw new Error(`${name} redefines ${k}.${key}`);
      (M[k] = M[k] || {})[key] = clone(v);
    }
  }
  for (const [b, B2] of Object.entries(F.bases || {})) {
    const B = M.bases[b];
    if (!B) throw new Error(`${name}: unknown base ${b}`);
    for (const [a, v] of Object.entries(B2.headOffset || {})) {
      if (a in B.headOffset) throw new Error(`${name} redefines bases.${b}.headOffset.${a}`);
      B.headOffset[a] = clone(v);
    }
    B.parts = [...new Set([...B.parts, ...(B2.parts || [])])].sort();
    for (const [key, v] of Object.entries(B2)) {
      if (key === 'headOffset' || key === 'parts') continue;
      if (isObj(B[key]) && isObj(v)) Object.assign(B[key], clone(v)); else B[key] = clone(v);
    }
  }
  M.tintModel = Object.assign({}, M.tintModel, { slotS: Object.assign({}, M.tintModel.slotS || {}, (F.tintModel || {}).slotS || {}) });
  for (const [slot, tbl] of Object.entries(F.tintTable || {})) M.tintTable[slot] = Object.assign(M.tintTable[slot] || {}, clone(tbl));
  const G = M.generator, G2 = F.generator || {};
  for (const [key, v] of Object.entries(G2.presets || {})) {
    if (key in G.presets) throw new Error(`${name} redefines preset ${key}`);
    G.presets[key] = clone(v);
  }
  G.slotPalette = Object.assign({}, G.slotPalette, G2.slotPalette || {});
  G.exclude = [...G.exclude, ...clone(G2.exclude || [])];
  G.extraSlots = [...new Set([...(G.extraSlots || []), ...(G2.extraSlots || [])])];
  for (const [key, v] of Object.entries(G2)) {         // other generator keys (beachfolk: beachSlots, animParts, ...)
    if (['presets', 'slotPalette', 'exclude', 'extraSlots'].includes(key)) continue;
    if (Array.isArray(G[key]) && Array.isArray(v)) {
      const cur = [...G[key]], seen = new Set(cur.map((x) => JSON.stringify(x)));
      for (const x of clone(v)) if (!seen.has(JSON.stringify(x))) cur.push(x);
      G[key] = cur;
    } else if (isObj(G[key]) && isObj(v)) G[key] = Object.assign({}, G[key], clone(v));
    else G[key] = clone(v);
  }
  M.faceExprs = M.faceExprs || {};
  for (const [hp, lst] of Object.entries(F.faceExprs || {})) {
    const cur = M.faceExprs[hp] || (M.faceExprs[hp] = []);
    for (const e of lst) if (!cur.includes(e)) cur.push(e);
  }
  M.exprBrow = M.exprBrow || {};
  for (const [e, b] of Object.entries(F.exprBrow || {})) {
    if (e in M.exprBrow && M.exprBrow[e] !== b) throw new Error(`${name} changes exprBrow.${e}`);
    M.exprBrow[e] = b;
  }
  M.frameAtlasAnim = M.frameAtlasAnim || {};
  M.frameAtlasPose = M.frameAtlasPose || {};
  for (const ext of F.frameAtlasExt || []) {
    for (const a of ext.anims || []) M.frameAtlasAnim[a] = Object.assign(M.frameAtlasAnim[a] || {}, ext.map);
    for (const hp of ext.poses || []) M.frameAtlasPose[hp] = Object.assign(M.frameAtlasPose[hp] || {}, ext.map);
  }
  for (const [key, v] of Object.entries(F)) {          // sit, push, overrides, animItems, animFallback, ...
    if (HANDLED.has(key)) continue;
    if (Array.isArray(M[key]) && Array.isArray(v)) M[key] = [...M[key], ...clone(v)];
    else if (isObj(M[key]) && isObj(v)) M[key] = Object.assign({}, M[key], clone(v));
    else M[key] = clone(v);
  }
  (M.fragments = M.fragments || []).push(name);
  return M;
}

/** {atlases, townfolk} from assets/townfolk + any fragment manifests (townfolk2, beachfolk, cityfolk ...), in order. */
export function mergeTownfolkFragments(man, ...frags) {
  const M = clone(man.townfolk);
  M.fragments = ['townfolk'];
  const atlases = [...man.atlases];
  for (const fm of frags) {
    if (!fm) continue;
    const ext = (k) => (isObj(fm[k]) ? fm[k].extends : null);         // beachfolk: extends ['townfolk', 'townfolk2']
    const key = Object.keys(fm).find((k) => ext(k) === 'townfolk' || (Array.isArray(ext(k)) && ext(k).includes('townfolk')));
    if (!key) throw new Error('not a townfolk fragment manifest');
    for (const r of fm[key].requires || []) if (!M.fragments.includes(r)) throw new Error(`${key} needs ${r} merged first`);
    mergeTownfolkFragment(M, fm[key], key);
    atlases.push(...fm.atlases);
  }
  return { version: 1, atlases, images: [], sprites: {}, townfolk: M };
}

const isItem = (P) => (P.tags || []).includes('item') || (P.tags || []).includes('anim_item');

export class Cityfolk extends Townfolk2 {
  /** draw list for one frame (v4 + v5 + v8 rules); opts.face = face override, opts.noItems = skip anim items */
  layers(person, anim, dir, i, opts = {}) {
    const T = this.T;
    const flip = dir in MIRROR;
    const d = MIRROR[dir] || dir;
    const B = T.bases[person.base];
    const base = B.render || person.base;
    const sx = B.scaleX || 1;
    const tl = T.timeline[anim][d][i];
    const hp = tl.hp;
    const hd = tl.hd || d;                               // beachfolk: head frame dir when it differs from the anim dir
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
    const hat = this.wearsFullHat(person);
    const heads = [];
    const parts = this.animParts(person, anim);
    if (!opts.noItems) for (const it of (T.animItems || {})[anim] || []) if (!parts.includes(it)) parts.push(it);
    for (const pn of parts) {
      const P = T.parts[pn];
      if (P.noAnims && P.noAnims.includes(anim)) continue;
      if (P.onlyAnims && !P.onlyAnims.includes(anim)) continue;
      if (P.anims && !P.anims.includes(anim)) continue;   // beachfolk parts: frames only in their anims
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

  /** the person's parts + the props a (beachfolk) anim always shows (generator.animParts) */
  animParts(person, anim) {
    const parts = [...person.parts];
    for (const pn of (this.T.generator.animParts || {})[anim] || []) if (!parts.includes(pn) && this.T.parts[pn]) parts.push(pn);
    return parts;
  }

  /** true when every worn body part has frames in `anim`: cityfolk anims / cityfolk parts -> bases[b].cfCover[anim];
   *  parts with `anims` (beachfolk) -> that list (`drop: true` accessories are ignored: simply not drawn there);
   *  other v4 / v5 parts -> only the anims of townfolk / townfolk2 */
  canPlay(person, anim) {
    const T = this.T;
    if (!T.anims[anim]) return false;
    const cover = (T.bases[person.base].cfCover || {})[anim];
    const cf = new Set(T.cfParts || []);
    const isCf = (T.cityfolkAnims || []).includes(anim);
    const fr = (T.animFragment || {})[anim] || 'townfolk';
    const old = fr === 'townfolk' || fr === 'townfolk2';
    for (const pn of this.animParts(person, anim)) {
      const P = T.parts[pn];
      if (!P || P.space !== 'body' || isItem(P) || !P.subs || !Object.keys(P.subs).length) continue;
      if (P.anims) { if (!P.anims.includes(anim) && !P.drop) return false; }   // beachfolk drop: accessories not drawn there
      else if (isCf || cf.has(pn)) { if (!cover || !cover.includes(pn)) return false; }
      else if (!old) return false;
    }
    return true;
  }

  /** {anim, face}: `anim` if playable, else the first playable fallback (face = fallbackFace[anim] or null) */
  pickAnim(person, anim) {
    if (this.canPlay(person, anim)) return { anim, face: null };
    const fb = (this.T.animFallback || {})[anim] || [];
    const face = (this.T.fallbackFace || {})[anim] || null;
    for (const a of fb) if (this.canPlay(person, a)) return { anim: a, face };
    return { anim: this.canPlay(person, 'idle') ? 'idle' : 'walk', face };
  }

  _pt(person, table, anim, dir, i) {
    const t = ((this.T.bases[person.base][table] || {})[anim] || {})[MIRROR[dir] || dir];
    const v = t && t[i];
    if (!v) return null;
    const out = v.slice();
    if (dir in MIRROR) { out[0] = -out[0]; if (table === 'nozzlePoint') out[2] = -out[2]; if (table === 'boxPoint') out[2] = -out[2]; }
    return out;
  }
  /** [x, y, ux, uy]: nozzle tip px from the anchor + unit screen direction of the water (spray_hose) */
  nozzlePoint(person, dir, i) { return this._pt(person, 'nozzlePoint', 'spray_hose', dir, i); }
  /** [cx, cy, bx, by]: box centre + bottom-centre px from the anchor (carry_box) */
  boxPoint(person, dir, i) { return this._pt(person, 'boxPoint', 'carry_box', dir, i); }
  /** [x, y]: where the broom touches the snow (sweep) */
  sweepPoint(person, dir, i) { return this._pt(person, 'sweepPoint', 'sweep', dir, i); }
}

/** TownfolkSprite2 + automatic fallback anims (pickAnim) and the cityfolk items (setItems(false) hides them). */
export class CityfolkSprite extends TownfolkSprite2 {
  play(anim, dir) {
    const pick = this.tf.pickAnim(this.person, anim);
    this.requested = anim;
    this.fallbackFace = pick.face;
    super.play(pick.anim, dir);
    return this;
  }

  setItems(on) { this.noItems = !on; this._key = ''; this.refresh(); return this; }

  refresh(force) {
    const face = this.face || this.fallbackFace || null;
    const key = `${this.anim}|${this.dir}|${this.frame}|${face || ''}|${this.noItems ? 1 : 0}`;
    if (!force && key === this._key) return;
    this._key = key;
    const layers = this.tf.layers(this.person, this.anim, this.dir, this.frame, { face, noItems: this.noItems });
    const tex = this.scene.textures;
    let k = 0;
    for (const l of layers) {
      if (!l.atlas || !tex.get(l.atlas).has(l.frame)) continue;
      let s = this.sprites[k];
      if (!s) { s = this.scene.add.image(0, 0, l.atlas, l.frame); this.sprites.push(s); }
      s.setTexture(l.atlas, l.frame).setVisible(true).setFlipX(l.flip).setScale(l.sx, 1);
      if (l.head) s.setOrigin(this.hx, this.hy); else s.setOrigin(this.ax, this.ay);
      if (l.tint == null) s.clearTint(); else s.setTint(l.tint);
      s._dx = l.dx; s._dy = l.dy; s._z = l.z;
      k++;
    }
    for (let j = k; j < this.sprites.length; j++) this.sprites[j].setVisible(false);
    this.visibleCount = k;
    this.place();
  }
}
