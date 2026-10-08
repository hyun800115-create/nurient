// Tiny manifest-driven asset loader for the water lab (reads the same assets/<fragment>/manifest.json files
// as src/core/Assets.js, but only queues the keys a lab scene asks for).

export const ISO = { AX: [45.2548, 22.6274], AY: [45.2548, -22.6274] };
/** world px of a point mx, my metres (world X, Y) from (cx, cy) */
export function iso(cx, cy, mx, my) { return [cx + 45.2548 * (mx + my), cy + 22.6274 * (mx - my)]; }

const GROUND_LAYER = -13500;     // DEPTH.GROUND_DECAL: harbour tiles live on the ground layer

export class Loader {
  constructor(base) { this.base = base; this.man = {}; this.missing = []; }

  async fetchManifests(frags) {
    await Promise.all(frags.map(async (f) => {
      try {
        const r = await fetch(this.base + f + '/manifest.json', { cache: 'no-cache' });
        this.man[f] = r.ok ? await r.json() : null;
      } catch (e) { this.man[f] = null; }
    }));
    return this.man;
  }

  /** where does `key` live: {frag, kind: 'char'|'sprite'|'sheet'|'image', def, file} */
  find(key) {
    const isChar = key.startsWith('char:');
    const k = isChar ? key.slice(5) : key;
    const frags = Object.keys(this.man).reverse();   // later fragments win (like the game)
    for (const f of frags) {
      const m = this.man[f];
      if (!m) continue;
      if (isChar) {
        const d = m.characters && m.characters[k];
        if (d) return { frag: f, kind: 'char', def: d, file: (m.atlases || []).find((a) => a.key === d.atlas) };
        continue;
      }
      const sh = (m.spritesheets || []).find((s) => s.key === k);
      if (sh) return { frag: f, kind: 'sheet', def: sh, file: sh };
      const sp = m.sprites && m.sprites[k];
      if (sp) {
        if (sp.atlas) return { frag: f, kind: 'sprite', def: sp, file: (m.atlases || []).find((a) => a.key === sp.atlas) };
        if (sp.image) return { frag: f, kind: 'image', def: sp, file: (m.images || []).find((a) => a.key === sp.image) };
      }
      const im = (m.images || []).find((a) => a.key === k);
      if (im) return { frag: f, kind: 'image', def: m.sprites && m.sprites[k] || {}, file: im };
    }
    return null;
  }

  queue(scene, keys) {
    const L = scene.load, done = new Set();
    this.defs = {};
    // the water textures are always needed by Water.js
    for (const k of ['water_waves_a', 'water_waves_b', 'water_foam', 'water_lut', 'water_shore_ramp']) if (!keys.includes(k)) keys.push(k);
    for (const key of keys) {
      const f = this.find(key);
      if (!f || !f.file) { this.missing.push(key); continue; }
      this.defs[key] = f;
      const file = f.file;
      if (done.has(file.key)) continue;
      done.add(file.key);
      if (f.kind === 'sheet') L.spritesheet(file.key, this.base + file.png, { frameWidth: file.frameWidth, frameHeight: file.frameHeight });
      else if (file.json) L.atlas(file.key, this.base + file.png, this.base + file.json);
      else L.image(file.key, this.base + file.png);
    }
  }

  anims() { /* frames are set explicitly from the lab clock (deterministic) */ }

  has(key) { return !!(this.defs && this.defs[key]); }

  charDef(key) { const f = this.defs && this.defs['char:' + key]; return f ? f.def : null; }
  sheetDef(key) { const f = this.defs && this.defs[key]; return f ? f.def : {}; }
  sheetFrames(key) { const d = this.sheetDef(key); return d.frameCount || 1; }

  sprite(scene, key, x, y, depth) {
    const f = this.defs[key];
    if (!f) return scene.add.rectangle(x, y, 8, 8, 0xff00ff).setDepth(y);
    const d = f.def;
    const img = f.kind === 'image' ? scene.add.image(x, y, f.file.key) : scene.add.image(x, y, d.atlas, d.frame);
    const a = d.anchor || [0.5, 0.5];
    img.setOrigin(a[0], a[1]).setDepth(depth !== undefined ? depth : y);
    return img;
  }

  tile(scene, key, x, y) { return this.sprite(scene, key, x, y, GROUND_LAYER + y * 0.001); }

  /** a character / boat / ship sprite: {sprite, frames, def}; frames = existing `${anim}_${dir}_${i}` names */
  character(scene, key, anim, dir, x, y) {
    const f = this.defs['char:' + key];
    if (!f) return { sprite: scene.add.rectangle(x, y, 8, 8, 0xff00ff), frames: [], def: { anchor: [0.5, 0.5] } };
    const d = f.def;
    const mirror = d.mirror || {};
    const base = mirror[dir] || dir;
    const flip = !!mirror[dir];
    const tex = scene.textures.get(d.atlas);
    const pat = d.frameName || '{anim}_{dir}_{i}';
    const frames = [];
    for (let i = 0; i < 64; i++) {
      const n = pat.replace('{anim}', anim).replace('{dir}', base).replace('{i}', i);
      if (!tex.has(n)) break;
      frames.push(n);
    }
    if (!frames.length) for (let i = 0; i < 64; i++) { const n = pat.replace('{anim}', 'idle').replace('{dir}', base).replace('{i}', i); if (!tex.has(n)) break; frames.push(n); }
    const s = scene.add.sprite(x, y, d.atlas, frames[0]);
    const a = d.anchor || [0.5, 0.8];
    s.setOrigin(a[0], a[1]).setDepth(y).setFlipX(flip);
    return { sprite: s, frames, def: d };
  }
}
