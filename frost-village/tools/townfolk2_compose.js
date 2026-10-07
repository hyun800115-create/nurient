// townfolk2_compose.js - JS port of tools/townfolk2_compose.py (townfolk v4 + v5 fragment, CONTRACT_V5 Q).
// Ready to copy into src/ next to townfolk_compose.js (imports it; that file stays unchanged).
//
//   import { mergeTownfolkManifests, Townfolk2, TownfolkSprite2 } from './townfolk2_compose.js';
//   import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
//   const man = mergeTownfolkManifests(manifestTownfolk, manifestTownfolk2);   // {atlases, townfolk}
//   preload(): townfolkPreload(this, man);   create(): townfolkInstall(this, man);
//   const tf = new Townfolk2(man.townfolk);
//   const bride = tf.preset('bride', mulberry32(7));
//   const s = new TownfolkSprite2(scene, tf, bride, x, y); s.play('clap', 'SE'); s.setFace('sad'); s.update(dt);
//
// v5 rules on top of the v4 ones (townfolk_compose.js):
//  - zfrontFollow subs (held_bouquet): z = limbs[limb].zFront + 0.5 when the limb is in the frame's zfront.
//  - face override: any expr listed in faceExprs[headPose] (brow = exprBrow[expr]); others keep the timeline face.
//  - parts with noAnims (held_bouquet: carry_walk, clap, push) draw nothing in those anims.
//  - sit: the sprite anchor is the seat FRONT-CENTRE (put it on a life_props / life2 seatPoint);
//    shadow at anchor + (0, townfolk.sit.groundOffsetPx).
//  - push: pushPoint(person, dir) = [dx, dy, strollerBehind]; put the stroller's handlePoint there.
//  - atlas of a frame: body frameAtlasAnim[anim][layer@base] ?? frameAtlas[layer@base];
//    head frameAtlasPose[headPose][layer] ?? frameAtlas[layer]  (v4 layers keep their v4 atlas for v4 frames).

import { Townfolk, TownfolkSprite, MIRROR } from './townfolk_compose.js';

const LIMBS = [['arm_R', 'sleeve'], ['arm_L', 'sleeve'], ['hand_R', 'hands'], ['hand_L', 'hands']];
const clone = (o) => JSON.parse(JSON.stringify(o));

/** Merged townfolk block (v4 'townfolk' + v5 'townfolk2'), see townfolk2.merge in the manifest. */
export function mergeTownfolk(T, T2) {
  const M = clone(T);
  for (const k of ['anims', 'timeline', 'headPoses', 'parts', 'z', 'tintRef', 'palettes', 'frameAtlas']) {
    for (const [key, v] of Object.entries(T2[k] || {})) {
      if (M[k] && key in M[k]) throw new Error(`townfolk2 redefines ${k}.${key}`);
      (M[k] = M[k] || {})[key] = clone(v);
    }
  }
  for (const [b, B2] of Object.entries(T2.bases || {})) {
    const B = M.bases[b];
    for (const [a, v] of Object.entries(B2.headOffset || {})) B.headOffset[a] = clone(v);
    B.parts = [...new Set([...B.parts, ...(B2.parts || [])])].sort();
    for (const key of ['pushPoint', 'pushGrip', 'seat']) if (key in B2) B[key] = clone(B2[key]);
  }
  M.tintModel = Object.assign({}, M.tintModel, { slotS: Object.assign({}, M.tintModel.slotS || {}, (T2.tintModel || {}).slotS || {}) });
  for (const [slot, tbl] of Object.entries(T2.tintTable || {})) M.tintTable[slot] = Object.assign(M.tintTable[slot] || {}, tbl);
  const G = M.generator, G2 = T2.generator || {};
  for (const [key, v] of Object.entries(G2.presets || {})) {
    if (key in G.presets) throw new Error(`townfolk2 redefines preset ${key}`);
    G.presets[key] = clone(v);
  }
  G.slotPalette = Object.assign({}, G.slotPalette, G2.slotPalette || {});
  G.exclude = [...G.exclude, ...(G2.exclude || [])];
  G.extraSlots = [...(G2.extraSlots || [])];
  for (const key of ['faceExprs', 'exprBrow', 'sit', 'push']) if (key in T2) M[key] = clone(T2[key]);
  M.frameAtlasAnim = M.frameAtlasAnim || {};
  M.frameAtlasPose = M.frameAtlasPose || {};
  for (const ext of T2.frameAtlasExt || []) {
    for (const a of ext.anims || []) M.frameAtlasAnim[a] = Object.assign(M.frameAtlasAnim[a] || {}, ext.map);
    for (const hp of ext.poses || []) M.frameAtlasPose[hp] = Object.assign(M.frameAtlasPose[hp] || {}, ext.map);
  }
  return M;
}

/** {atlases, townfolk} from the two manifest JSONs (assets/townfolk + assets/townfolk2). */
export function mergeTownfolkManifests(man, man2) {
  return { version: 1, atlases: [...man.atlases, ...man2.atlases], images: [], sprites: {},
    townfolk: mergeTownfolk(man.townfolk, man2.townfolk2) };
}

export class Townfolk2 extends Townfolk {
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
    for (const pn of person.parts) {
      const P = T.parts[pn];
      if (P.noAnims && P.noAnims.includes(anim)) continue;
      for (const [s, sd] of Object.entries(P.subs)) {
        let z = typeof sd.z === 'object' ? sd.z[d] : sd.z;
        if (sd.follow) z = limbZ[sd.follow] + 0.5;
        if (sd.zfrontFollow && zf.has(sd.zfrontFollow)) z = T.limbs[sd.zfrontFollow].zFront + 0.5;
        if (P.space === 'body') {
          push(z, `${pn}.${s}`, `${pn}.${s}@${base}/${anim}_${d}_${i}`, this.tint(person, sd.tint), false);
        } else {
          const suf = hat && P.hatfit ? '~hat' : '';
          heads.push([z, `${pn}.${s}${suf}`, this.tint(person, sd.tint)]);
          if (sd.sheen) heads.push([z + 0.5, `${pn}.${s}${suf}.sheen`, null]);
        }
      }
    }
    const Z = T.z;
    const hf = (layer) => `${layer}/${hp}_${d}`;
    push(Z.head, `head.${person.nose || 'dot'}`, hf(`head.${person.nose || 'dot'}`), this.tint(person, 'skin'), true);
    if (T.faceDirs.includes(d)) {
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

  /** [dx, dy, strollerBehind]: handle-bar grip relative to the pusher anchor (mirrored dirs negate dx). */
  pushPoint(person, dir) {
    const v = this.T.bases[person.base].pushPoint[MIRROR[dir] || dir];
    return [dir in MIRROR ? -v[0] : v[0], v[1], v[2]];
  }

  /** v4 generator + the extra colour slots (gown, flower, flower2, wrap) from the preset. */
  generate(rng, preset) {
    const person = super.generate(rng, preset);
    const G = this.T.generator;
    const P = preset ? G.presets[preset] : {};
    const pc = P.colors || {}, pal = this.T.palettes, cols = person.colors;
    for (const slot of G.extraSlots || []) {
      let v = pc[slot];
      if (v == null) continue;
      if (Array.isArray(v)) v = v[Math.floor(rng() * v.length)];
      if (v.startsWith('=')) cols[slot] = cols[v.slice(1)];
      else if (v.startsWith('#')) cols[slot] = v;
      else cols[slot] = pal[v][Math.floor(rng() * pal[v].length)];
    }
    return person;
  }
}

/** TownfolkSprite + face override (setFace('sad' | null)) for Townfolk2. */
export class TownfolkSprite2 extends TownfolkSprite {
  setFace(expr) { this.face = expr || null; this._key = ''; this.refresh(); return this; }

  refresh(force) {
    const key = `${this.anim}|${this.dir}|${this.frame}|${this.face || ''}`;
    if (!force && key === this._key) return;
    this._key = key;
    const layers = this.tf.layers(this.person, this.anim, this.dir, this.frame, { face: this.face });
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
