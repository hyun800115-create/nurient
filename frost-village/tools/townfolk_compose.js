// townfolk_compose.js - JS port of tools/townfolk_compose.py (CONTRACT_V4 J), ready to copy into src/.
// No dependencies besides the global Phaser for the optional TownfolkSprite class.
//
//   import { Townfolk, TownfolkSprite, mulberry32 } from './townfolk_compose.js';
//   const tf = new Townfolk(manifest.townfolk);          // the 'townfolk' block of assets/townfolk/manifest.json
//   const person = tf.randomPerson(mulberry32(42));      // or tf.preset('police', mulberry32(7))
//   const layers = tf.layers(person, 'walk', 'SW', 3);   // [{z, atlas, frame, tint, head, flip}]
//   const npc = new TownfolkSprite(scene, tf, person, x, y); npc.play('walk', 'SW'); npc.update(dtMs);
//
// Rules (identical to the python reference):
//  - mirrored dirs SW/W/NW use the SE/E/NE frames with flipX on EVERY layer; head offset x is negated.
//  - body layers: frame '<layer>@<base>/<anim>_<dir>_<i>' at the character anchor (origin anchor).
//  - head layers: frame '<layer>/<headPose>_<dir>' with origin headAnchor at anchor + headOffset.
//  - z: sub.z (number or per-dir dict); limbs in timeline.zfront use zFront; 'follow' subs = limb z + .5.
//  - tint: tintTable[slot][colour] (precomputed) or the tintModel formula; fixed subs are not tinted.
//  - a frame missing from its atlas means "nothing to draw" for that layer this frame.

export const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
const LIMBS = [['arm_R', 'sleeve'], ['arm_L', 'sleeve'], ['hand_R', 'hands'], ['hand_L', 'hands']];

export function mulberry32(seed) {
  let a = seed >>> 0;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return f;
}

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const toLin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v) => { v = Math.max(0, v); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };

/** Phaser tint (0xRRGGBB) that turns a layer rendered with albedo `ref` into colour `hex`. */
export function tintFor(hex, ref, model, slot) {
  const K = model.K;
  const S = (model.slotS && model.slotS[slot]) || model.S;
  const c = hexRgb(hex), r = hexRgb(ref);
  let out = 0;
  for (let k = 0; k < 3; k++) {
    const t = Math.min(1, Math.max(0, toSrgb(K * toLin(c[k]) + S[k]) / Math.max(1e-3, toSrgb(K * toLin(r[k]) + S[k]))));
    out = (out << 8) | Math.round(t * 255);
  }
  return out;
}

function pick(rng, opts) {
  if (!opts) return null;
  if (Array.isArray(opts)) return opts.length ? opts[Math.floor(rng() * opts.length)] : null;
  const names = Object.keys(opts).filter((n) => opts[n] > 0);
  if (!names.length) return null;
  let tot = 0; for (const n of names) tot += opts[n];
  let x = rng() * tot;
  for (const n of names) { x -= opts[n]; if (x < 0) return n; }
  return names[names.length - 1];
}

export class Townfolk {
  constructor(T) {
    this.T = T;
    this._tint = new Map();
  }

  tint(person, slot) {
    if (!slot) return null;
    let col = person.colors[slot];
    if (col == null && slot.endsWith('2')) col = person.colors[slot.slice(0, -1)];
    if (col == null) return null;
    const key = slot + col;
    if (this._tint.has(key)) return this._tint.get(key);
    const table = this.T.tintTable[slot];
    let t;
    if (table && table[col]) t = parseInt(table[col].slice(1), 16);
    else t = tintFor(col, this.T.tintRef[slot] || this.T.tintRef.default, this.T.tintModel, slot);
    this._tint.set(key, t);
    return t;
  }

  wearsFullHat(person) {
    return person.parts.some((p) => this.T.parts[p].family === 'hat' && this.T.parts[p].cls === 'full');
  }

  /** draw list for one frame; dir may be mirrored (SW/W/NW) */
  layers(person, anim, dir, i) {
    const T = this.T;
    const flip = dir in MIRROR;
    const d = MIRROR[dir] || dir;
    const base = person.base;
    const tl = T.timeline[anim][d][i];
    const hp = tl.hp;
    const zf = new Set(tl.zfront || []);
    const out = [];
    const limbZ = {};
    let n = 0;
    const push = (z, layer, frame, tint, head) => {
      const atlas = T.frameAtlas[head ? layer : layer + '@' + base];
      out.push({ z, order: n++, layer, atlas, frame, tint, head, flip });
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
      for (const [s, sd] of Object.entries(P.subs)) {
        let z = typeof sd.z === 'object' ? sd.z[d] : sd.z;
        if (sd.follow) z = limbZ[sd.follow] + 0.5;
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
      push(Z.face, `face.${fs}.${tl.face}`, hf(`face.${fs}.${tl.face}`), null, true);
      push(Z.brow, `brow.${fs}.${tl.brow}`, hf(`brow.${fs}.${tl.brow}`), this.tint(person, 'hair'), true);
    }
    for (const [z, layer, tint] of heads) push(z, layer, hf(layer), tint, true);
    out.sort((a, b) => a.z - b.z || a.order - b.order);
    const ho = T.bases[base].headOffset[anim][d][i];
    for (const l of out) if (l.head) { l.dx = flip ? -ho[0] : ho[0]; l.dy = ho[1]; } else { l.dx = 0; l.dy = 0; }
    return out;
  }

  // ------------------------------------------------------------------ generator (data-driven, = python)
  conflicts(a, b) {
    const m = (pn, key) => {
      const P = this.T.parts[pn];
      if (!P) return false;
      if (key.startsWith('family:')) return P.family === key.slice(7);
      if (key.startsWith('tag:')) return (P.tags || []).includes(key.slice(4));
      return pn === key;
    };
    return this.T.generator.exclude.some(([x, y]) => (m(a, x) && m(b, y)) || (m(a, y) && m(b, x)));
  }

  randomPerson(rng) { return this.generate(rng, null); }
  preset(name, rng) { return this.generate(rng, name); }

  generate(rng, preset) {
    const T = this.T, G = T.generator;
    const P = preset ? G.presets[preset] : {};
    const base = pick(rng, P.bases || G.baseWeights);
    const age = T.bases[base].age;
    const A = G.byAge[age];
    const look = P.look || (rng() < 0.5 ? 'A' : 'B');
    const avail = new Set(T.bases[base].parts);
    const ok = (pn) => {
      const part = T.parts[pn];
      if (!part) return false;
      if (part.ages && !part.ages.includes(age)) return false;
      return part.space === 'head' || avail.has(pn);
    };
    const table = (key) => {
      let v = key in P ? P[key] : A[key];
      if (v && !Array.isArray(v) && typeof v === 'object') {
        const ks = Object.keys(v);
        if (ks.length && ks.every((k) => k === 'A' || k === 'B')) v = v[look] || {};
      }
      if (v == null) return null;
      if (typeof v === 'string') v = [v];
      if (Array.isArray(v)) return v.filter(ok);
      const o = {}; for (const k of Object.keys(v)) if (ok(k)) o[k] = v[k];
      return o;
    };
    const chance = (key, dflt) => (P[key + 'Chance'] ?? A[key + 'Chance'] ?? dflt);
    const maybe = (key, dflt = 1, avoid = []) => {
      let opts = table(key);
      const empty = !opts || (Array.isArray(opts) ? !opts.length : !Object.keys(opts).length);
      if (empty || rng() >= chance(key, dflt)) return null;
      if (avoid.length) {
        if (Array.isArray(opts)) opts = opts.filter((k) => !avoid.some((a) => this.conflicts(k, a)));
        else { const o = {}; for (const k of Object.keys(opts)) if (!avoid.some((a) => this.conflicts(k, a))) o[k] = opts[k]; opts = o; }
      }
      return pick(rng, opts);
    };
    const chosen = [];
    const top = maybe('tops');
    if (top) chosen.push(top);
    const bottom = top && T.parts[top].dress ? pick(rng, G.underDress.filter(ok)) : maybe('bottoms', 1, chosen);
    for (const x of [bottom, maybe('shoes')]) if (x) chosen.push(x);
    let extra = P.extra;
    if (extra && !Array.isArray(extra)) { const o = {}; for (const k of Object.keys(extra)) if (ok(k)) o[k] = extra[k]; extra = [pick(rng, o)]; }
    for (const x of extra || []) if (x && ok(x) && !chosen.some((c) => this.conflicts(x, c))) chosen.push(x);
    let hat = maybe('hats', 0.5, chosen);
    let hair = maybe('hair', 1, hat ? [hat] : []);
    if (hat && hair == null) { hat = null; hair = maybe('hair', 1); }
    for (const x of [hair, hat]) if (x) chosen.push(x);
    for (const [key, dflt] of [['facialHair', 0], ['glasses', 0.2], ['neck', 0.3], ['bag', 0.2], ['headAcc', 0.1]]) {
      const x = maybe(key, dflt, chosen);
      if (x) chosen.push(x);
    }
    const person = {
      base, look, preset, parts: chosen,
      face: pick(rng, 'faces' in P ? table('faces') : (A.faces[look] || A.faces.A)),
      nose: pick(rng, P.noses || A.noses),
    };
    const pal = T.palettes, pc = P.colors || {}, ac = A.colors || {};
    const cols = {};
    const col = (slot, dpal) => {
      let v = slot in pc ? pc[slot] : ac[slot];
      if (Array.isArray(v)) {
        v = v[Math.floor(rng() * v.length)];
        if (v === 'skin') return cols.skin;
        return v.startsWith('#') ? v : pal[v][Math.floor(rng() * pal[v].length)];
      }
      if (typeof v === 'string') return v.startsWith('#') ? v : pal[v][Math.floor(rng() * pal[v].length)];
      return pal[dpal][Math.floor(rng() * pal[dpal].length)];
    };
    const sp = Object.assign({}, G.slotPalette, { hair: A.hairPalette || 'hair' });
    for (const slot of ['skin', 'hair', 'top', 'top2', 'fur', 'bottom', 'bottom2', 'shoes', 'hat', 'hat2', 'acc', 'acc2', 'bag', 'glasses']) cols[slot] = col(slot, sp[slot]);
    if (bottom && (T.parts[bottom].tags || []).includes('skirt') && !('bottom' in pc)) cols.bottom = pal.skirt[Math.floor(rng() * pal.skirt.length)];
    if (cols.top2 === cols.top && !('top2' in pc)) { const c2 = pal[sp.top2].filter((c) => c !== cols.top); cols.top2 = c2[Math.floor(rng() * c2.length)]; }
    cols.sleeve = top && T.parts[top].sleeves ? cols[T.parts[top].sleeves] : cols.top;
    if ('hands' in pc) cols.hands = col('hands', 'gloves');
    else cols.hands = rng() < (P.gloveChance ?? A.gloveChance ?? 0.3) ? pal.gloves[Math.floor(rng() * pal.gloves.length)] : cols.skin;
    person.colors = cols;
    return person;
  }
}

/**
 * Live layered townsperson for Phaser 3: one Sprite per layer (shared atlases, per-sprite tint),
 * re-pointed to new frames whenever the animation frame or direction changes.  Typical person =
 * 9-14 sprites.  Depth: every layer gets depth = this.depthBase + z * 1e-4, so call setDepth(y).
 */
export class TownfolkSprite {
  constructor(scene, tf, person, x, y) {
    this.scene = scene; this.tf = tf; this.person = person;
    this.x = x; this.y = y; this.depthBase = y;
    this.sprites = [];
    this.anim = 'idle'; this.dir = 'S'; this.frame = 0; this.t = 0;
    this._key = '';
    const T = tf.T;
    this.ax = T.anchor[0]; this.ay = T.anchor[1]; this.hx = T.headAnchor[0]; this.hy = T.headAnchor[1];
    this.refresh(true);
  }

  play(anim, dir) {
    const T = this.tf.T;
    if (!T.anims[anim].dirs.includes(MIRROR[dir] || dir)) dir = (dir === 'NW' || dir === 'W') ? 'W' : (dir === 'NE' || dir === 'N' ? 'E' : 'S');
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
      this.frame = (this.frame + 1) % a.frames;
      this.refresh();
    }
  }

  setPosition(x, y) { this.x = x; this.y = y; this.depthBase = y; this.place(); }

  refresh(force) {
    const key = `${this.anim}|${this.dir}|${this.frame}`;
    if (!force && key === this._key) return;
    this._key = key;
    const layers = this.tf.layers(this.person, this.anim, this.dir, this.frame);
    const tex = this.scene.textures;
    let k = 0;
    for (const l of layers) {
      if (!l.atlas || !tex.get(l.atlas).has(l.frame)) continue;
      let s = this.sprites[k];
      if (!s) { s = this.scene.add.image(0, 0, l.atlas, l.frame); this.sprites.push(s); }
      s.setTexture(l.atlas, l.frame).setVisible(true).setFlipX(l.flip);
      if (l.head) s.setOrigin(this.hx, this.hy); else s.setOrigin(this.ax, this.ay);
      if (l.tint == null) s.clearTint(); else s.setTint(l.tint);
      s._dx = l.dx; s._dy = l.dy; s._z = l.z;
      k++;
    }
    for (let j = k; j < this.sprites.length; j++) this.sprites[j].setVisible(false);
    this.visibleCount = k;
    this.place();
  }

  place() {
    for (let j = 0; j < this.visibleCount; j++) {
      const s = this.sprites[j];
      s.setPosition(this.x + s._dx, this.y + s._dy).setDepth(this.depthBase + s._z * 1e-4);
    }
  }

  destroy() { for (const s of this.sprites) s.destroy(); this.sprites = []; }
}
