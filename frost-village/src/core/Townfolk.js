// Townfolk paper-doll runtime (v4, docs/v4_plan.md §5.1; CONTRACT_V4 J). The generator and the layer rules
// below (MIRROR .. class Townfolk, forEachTfFrame) are a byte-identical copy of tools/townfolk_compose.js
// (tools/test/townfolk_runtime.mjs checks the parity on 1000 people). After them: the game's runtime —
// one shared Townfolk (TF), frame lookup through one function with a cache, an allocation-free draw-list
// variant (layersInto) for DollSprite, synthetic character defs ('tf:<base>') so Character, Customer and
// Bubbles drive dolls unchanged, and the v4 generation rules (hat_cap / hat_headband are left out until the
// townfolk2 head override frames are packed: TOWNFOLK2 = false).
//
// ---------------------------------------------------------------- copy of tools/townfolk_compose.js
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
    const B = T.bases[person.base];
    const base = B.render || person.base;
    const sx = B.scaleX || 1;
    const tl = T.timeline[anim][d][i];
    const hp = tl.hp;
    const zf = new Set(tl.zfront || []);
    const out = [];
    const limbZ = {};
    let n = 0;
    const push = (z, layer, frame, tint, head) => {
      const atlas = T.frameAtlas[head ? layer : layer + '@' + base];
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
    const ho = B.headOffset[anim][d][i];
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
    const chance = (key, dflt) => { const ck = (key === 'hats' ? 'hat' : key) + 'Chance'; return P[ck] ?? A[ck] ?? dflt; };
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
        if (v.startsWith('=')) return cols[v.slice(1)];               // '=top': same colour as that slot
        return v.startsWith('#') ? v : pal[v][Math.floor(rng() * pal[v].length)];
      }
      if (typeof v === 'string') {
        if (v.startsWith('=')) return cols[v.slice(1)];
        return v.startsWith('#') ? v : pal[v][Math.floor(rng() * pal[v].length)];
      }
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


/** Calls fn(name, rect) for every frame of a tfatlas JSON. */
export function forEachTfFrame(data, fn) {
  for (const [prefix, groups] of Object.entries(data.frames)) {
    for (const [g, v] of Object.entries(groups)) {
      if (!v.some(Array.isArray)) { fn(`${prefix}/${g}`, v); continue; }   // single rect (0 = missing in lists)
      v.forEach((r, i) => { if (r) fn(`${prefix}/${g}_${i}`, r); });
    }
  }
}


// ---------------------------------------------------------------- end of the copy

export const TOWNFOLK2 = false;        // (v5) merge the townfolk2 head override frames; until then:
const NO_HATS = TOWNFOLK2 ? [] : ['hat_cap', 'hat_headband'];
const AGE_SHEETS = { child: /^tf_child/, adult: /^tf_adult/, elder: /^tf_elder/ };

/** the shared townfolk runtime (one per game) */
export const TF = {
  T: null,          // manifest townfolk block
  tf: null,         // Townfolk instance
  sheets: [],       // atlas keys
  game: null,
  _frames: new Map(),
  _defs: {},

  /** the townfolk manifest arrived (Assets.mergeLate) */
  init(manifest, game) {
    if (!manifest || !manifest.townfolk || this.T) return !!this.T;
    this.T = manifest.townfolk;
    this.tf = new Townfolk(this.T);
    this.sheets = (manifest.atlases || []).map((a) => a.key);
    this.game = game || this.game;
    return true;
  },

  get ok() { return !!this.T; },

  /** atlas keys a given age group needs (heads + its body sheets). (v4-B) packed: the @loco pages that load
   *  with them (the @soc pages come on demand, Residency); raw = the atlas keys themselves */
  sheetsFor(age, raw) {
    const re = AGE_SHEETS[age];
    const keys = this.sheets.filter((k) => /^tf_head/.test(k) || (re && re.test(k)));
    if (raw || !this.assets) return keys;
    const out = [];
    for (const k of keys) for (const p of this.assets.basePages(k)) out.push(p);
    return out;
  },

  /** are the sheets of an age group (and the heads) installed? */
  readyFor(Assets, age) { return this.ok && this.sheetsFor(age).every((k) => Assets.tfReady.has(k)); },

  /** (v4-B) the page of a packed sheet a frame lives in: idle / walk bodies and `loco` heads are resident */
  pageOf(atlas, name) {
    const P = this.assets && this.assets.pages[atlas];
    if (!P) return atlas;
    const i = name.indexOf('/');
    const rest = i >= 0 ? name.slice(i + 1) : name;
    return (rest.startsWith('idle_') || rest.startsWith('walk_') || rest.startsWith('loco_')) ? P[0] : (P[1] || P[0]);
  },

  /** the Phaser frame for (atlas, frame name), or null = draw nothing (cached) */
  frame(atlas0, name) {
    if (!atlas0) return null;
    const atlas = this.pageOf(atlas0, name);
    const key = atlas + '|' + name;
    let f = this._frames.get(key);
    if (f !== undefined) return f;
    const g = this.game;
    f = null;
    if (g && g.textures.exists(atlas)) { const t = g.textures.get(atlas); if (t.has(name)) f = t.get(name); }
    // a missing frame is remembered only once its sheet is installed (it may still be on its way)
    if (f || (g && g.textures.exists(atlas))) this._frames.set(key, f);
    return f;
  },
  /** forget cached lookups (a sheet arrived / was removed) */
  clearFrames(atlas) { if (!atlas) { this._frames.clear(); return; } for (const k of Array.from(this._frames.keys())) if (k.startsWith(atlas + '|')) this._frames.delete(k); },

  /** generate a person: the v4 rules (no hat_cap / hat_headband until townfolk2 frames are packed) */
  person(rng, preset) {
    let p = null;
    for (let k = 0; k < 12; k++) {
      p = this.tf.generate(rng, preset || null);
      if (!p.parts.some((x) => NO_HATS.indexOf(x) >= 0)) return p;
    }
    p.parts = p.parts.filter((x) => NO_HATS.indexOf(x) < 0);
    return p;
  },

  age(base) { const B = this.T && this.T.bases[base]; return B ? B.age : 'adult'; },

  /** synthetic character def for 'tf:<base>' (Assets.charDef): anims, dirs, anchor, head top, shadow, carry */
  charDef(key) {
    if (this._defs[key]) return this._defs[key];
    const base = key.slice(3);
    const T = this.T, B = T && T.bases[base];
    if (!B) return null;
    const anims = {}, dirs = {};
    for (const an in T.anims) {
      if (an === 'carry_walk') continue;     // not loaded in v4: head carry on walk / idle (Character)
      const a = T.anims[an];
      anims[an] = { frames: a.frames, fps: a.fps, repeat: a.repeat, dirs: a.dirs.slice() };
      dirs[an] = a.dirs.slice();
    }
    const ho = B.headOffset && B.headOffset.idle && B.headOffset.idle.S && B.headOffset.idle.S[0];
    const headY = ho ? ho[1] : -44;
    const def = {
      key, doll: true, base, kind: 'human', age: B.age,
      frameSize: T.frameSize, anchor: T.anchor.slice(), dirs: T.dirs.slice(), mirror: Object.assign({}, T.mirror),
      anims, _dirs: dirs, shadow: (B.shadow || [46, 18]).slice(), headTop: Math.round(headY - 34),
      carryPoint: B.carryPoint || null,
    };
    this._defs[key] = def;
    return def;
  },

  /**
   * draw list into `out` (reused entries; no allocation once warm) = layers(person, anim, dir, i), the same
   * order and values. Returns the count.
   */
  layersInto(person, anim, dir, i, out) {
    const T = this.T, tf = this.tf;
    const flip = dir in MIRROR;
    const d = MIRROR[dir] || dir;
    const B = T.bases[person.base];
    const base = B.render || person.base;
    const sx = B.scaleX || 1;
    const tl = T.timeline[anim][d][i];
    const hp = tl.hp;
    const zf = tl.zfront || EMPTY;
    let n = 0;
    const put = (z, layer, frame, tint, head) => {
      let e = out[n];
      if (!e) e = out[n] = { z: 0, order: 0, layer: '', atlas: '', frame: '', tint: null, head: false, flip: false, sx: 1, dx: 0, dy: 0 };
      e.z = z; e.order = n; e.layer = layer; e.atlas = T.frameAtlas[head ? layer : layer + '@' + base]; e.frame = frame;
      e.tint = tint; e.head = head; e.flip = flip; e.sx = head ? 1 : sx;
      n++;
    };
    const limbZ = this._limbZ || (this._limbZ = {});
    for (const [name, slot] of LIMBS) {
      const L = T.limbs[name];
      limbZ[name] = zf.indexOf(name) >= 0 ? L.zFront : L.z;
      put(limbZ[name], name, name + '@' + base + '/' + anim + '_' + d + '_' + i, tf.tint(person, slot), false);
    }
    const hat = person._fullHat !== undefined ? person._fullHat : (person._fullHat = tf.wearsFullHat(person));
    const heads = this._heads || (this._heads = []);
    let hn = 0;
    for (const pn of person.parts) {
      const P = T.parts[pn];
      for (const s in P.subs) {
        const sd = P.subs[s];
        let z = typeof sd.z === 'object' ? sd.z[d] : sd.z;
        if (sd.follow) z = limbZ[sd.follow] + 0.5;
        if (P.space === 'body') {
          put(z, pn + '.' + s, pn + '.' + s + '@' + base + '/' + anim + '_' + d + '_' + i, tf.tint(person, sd.tint), false);
        } else {
          const suf = hat && P.hatfit ? '~hat' : '';
          heads[hn++] = z; heads[hn++] = pn + '.' + s + suf; heads[hn++] = tf.tint(person, sd.tint);
          if (sd.sheen) { heads[hn++] = z + 0.5; heads[hn++] = pn + '.' + s + suf + '.sheen'; heads[hn++] = null; }
        }
      }
    }
    const Z = T.z;
    const sfx = '/' + hp + '_' + d;
    const nose = 'head.' + (person.nose || 'dot');
    put(Z.head, nose, nose + sfx, tf.tint(person, 'skin'), true);
    if (T.faceDirs.indexOf(d) >= 0) {
      const fs = person.face || 'std';
      const fa = 'face.' + fs + '.' + tl.face, br = 'brow.' + fs + '.' + tl.brow;
      put(Z.face, fa, fa + sfx, null, true);
      put(Z.brow, br, br + sfx, tf.tint(person, 'hair'), true);
    }
    for (let k = 0; k < hn; k += 3) put(heads[k], heads[k + 1], heads[k + 1] + sfx, heads[k + 2], true);
    // stable sort by z (insertion: the lists are short and nearly sorted)
    for (let a = 1; a < n; a++) {
      const e = out[a];
      let b = a - 1;
      while (b >= 0 && (out[b].z > e.z || (out[b].z === e.z && out[b].order > e.order))) { out[b + 1] = out[b]; b--; }
      out[b + 1] = e;
    }
    const ho = B.headOffset[anim][d][i];
    for (let k = 0; k < n; k++) { const l = out[k]; if (l.head) { l.dx = flip ? -ho[0] : ho[0]; l.dy = ho[1]; } else { l.dx = 0; l.dy = 0; } }
    return n;
  },
};
const EMPTY = [];
