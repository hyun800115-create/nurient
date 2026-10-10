// LabArt: the finished art for the story lab, straight from the asset manifests (read only, nothing is changed).
// The same small surface the story view uses in the game (src/story/view: art.def / has / image / nine / play /
// sheet / layout), implemented on Phaser's loader like src/core/Assets.js does (sprite anims 'spr:<key>:<anim>',
// spritesheet anims '<key>', character anims '<char>:<anim>:<dir>'). Only the atlases the lab needs are loaded.

const BASE = '../../../assets/';

export class LabArt {
  constructor(base = BASE) {
    this.base = base;
    this.m = { atlases: {}, images: {}, spritesheets: {}, sprites: {}, nineSlice: {}, characters: {}, layouts: {}, audio: {} };
    this.fragOf = {};
    this.man = {};
    this.missing = new Set();
    this.scene = null;
  }

  /** fetch + merge the manifests (later fragments win, like Assets.mergeManifests) */
  async loadManifests(frags) {
    const got = await Promise.all(frags.map((f) => fetch(this.base + f + '/manifest.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    frags.forEach((f, i) => {
      const j = got[i];
      if (!j) return;
      this.man[f] = j;
      const m = this.m;
      for (const a of j.atlases || []) { m.atlases[a.key] = a; this.fragOf[a.key] = f; }
      for (const a of j.images || []) { m.images[a.key] = a; this.fragOf[a.key] = f; }
      for (const a of j.spritesheets || []) { m.spritesheets[a.key] = a; this.fragOf[a.key] = f; }
      Object.assign(m.sprites, j.sprites || {});
      Object.assign(m.nineSlice, j.nineSlice || {});
      Object.assign(m.audio, j.audio || {});
      for (const k in j.characters || {}) m.characters[k] = j.characters[k];
      if (j.layouts) Object.assign(m.layouts, j.layouts);
    });
    return this;
  }

  /** queue the pictures: every sprite of `frags` (their atlases / images), the given characters and sheets */
  queue(load, { frags = [], chars = [], sheets = [], images = [], atlases = [] } = {}) {
    const atl = new Set(atlases), img = new Set();
    for (const f of frags) {
      const j = this.man[f];
      if (!j) continue;
      for (const k in j.sprites || {}) { const s = j.sprites[k]; if (s.atlas) atl.add(s.atlas); else if (s.image) img.add(s.image); }
      for (const n in j.nineSlice || {}) img.add(j.nineSlice[n].image || n);
    }
    for (const c of chars) { const d = this.m.characters[c]; if (d && d.atlas) atl.add(d.atlas); }
    for (const k of images) img.add(k);
    for (const a of atl) { const d = this.m.atlases[a]; if (d && !load.textureManager.exists(a)) load.atlas(a, this.base + d.png, this.base + d.json); }
    for (const k of img) { const d = this.m.images[k]; if (d && !load.textureManager.exists(k)) load.image(k, this.base + d.png); }
    for (const k of sheets) { const d = this.m.spritesheets[k]; if (d && !load.textureManager.exists(k)) load.spritesheet(k, this.base + d.png, { frameWidth: d.frameWidth, frameHeight: d.frameHeight }); }
  }

  /** after the loader: anims for sprites, sheets and characters */
  finalize(scene, chars = []) {
    this.scene = scene;
    const A = scene.anims, T = scene.textures;
    for (const k in this.m.sprites) {
      const s = this.m.sprites[k];
      if (!s.anims || !s.atlas || !T.exists(s.atlas)) continue;
      for (const an in s.anims) {
        const a = s.anims[an], key = 'spr:' + k + ':' + an;
        const frames = (a.frames || []).filter((f) => T.get(s.atlas).has(f)).map((f) => ({ key: s.atlas, frame: f }));
        if (frames.length && !A.exists(key)) A.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat !== undefined ? a.repeat : -1 });
      }
    }
    for (const k in this.m.spritesheets) {
      const s = this.m.spritesheets[k];
      if (!T.exists(k) || A.exists(k)) continue;
      const n = Math.min(T.get(k).frameTotal - 1, s.frameCount || 999);
      A.create({ key: k, frames: A.generateFrameNumbers(k, { start: 0, end: n - 1 }), frameRate: s.fps || 24, repeat: 0 });
    }
    for (const c of chars) this.buildChar(scene, c);
  }

  buildChar(scene, c) {
    const d = this.m.characters[c];
    if (!d || !scene.textures.exists(d.atlas)) return false;
    const tex = scene.textures.get(d.atlas), fname = d.frameName || '{anim}_{dir}_{i}';
    d._dirs = {};
    for (const an in d.anims) {
      const a = d.anims[an];
      const n = typeof a.frames === 'number' ? a.frames : (a.frames || []).length;
      const have = [];
      for (const dir of a.dirs || d.dirs) {
        const key = c + ':' + an + ':' + dir;
        const frames = [];
        for (let i = 0; i < n; i++) { const f = fname.replace('{anim}', an).replace('{dir}', dir).replace('{i}', i); if (tex.has(f)) frames.push({ key: d.atlas, frame: f }); }
        if (!frames.length) continue;
        if (!scene.anims.exists(key)) scene.anims.create({ key, frames, frameRate: a.fps || 10, repeat: a.repeat !== undefined ? a.repeat : -1 });
        have.push(dir);
      }
      d._dirs[an] = have;
    }
    return true;
  }

  // ---------------------------------------------------------------- the view's surface
  def(key) { return this.m.sprites[key] || this.m.characters[key] || null; }
  layout(name) { return this.m.layouts[name] || null; }
  has(key) {
    const T = this.scene && this.scene.textures;
    if (!T) return false;
    const s = this.m.sprites[key];
    if (s && s.atlas) return T.exists(s.atlas) && T.get(s.atlas).has(s.frame);
    if (s && s.image) return T.exists(s.image);
    return T.exists(key);
  }
  resolve(key) {
    const s = this.m.sprites[key];
    const T = this.scene.textures;
    if (s && s.atlas && T.exists(s.atlas) && T.get(s.atlas).has(s.frame)) return { tex: s.atlas, frame: s.frame, anchor: s.anchor || [0.5, 0.5] };
    if (s && s.image && T.exists(s.image)) return { tex: s.image, frame: undefined, anchor: s.anchor || [0.5, 0.5] };
    if (T.exists(key) && key !== '__MISSING') return { tex: key, frame: undefined, anchor: (s && s.anchor) || [0.5, 0.5] };
    this.missing.add(key);
    return null;
  }
  /** an Image of a sprite key at its manifest anchor (null when the art is not there: no placeholders) */
  image(scene, x, y, key) {
    const r = this.resolve(key);
    if (!r) return null;
    const s = this.m.sprites[key];
    const o = s && s.anims ? scene.add.sprite(x, y, r.tex, r.frame) : scene.add.image(x, y, r.tex, r.frame);
    return o.setOrigin(r.anchor[0], r.anchor[1]);
  }
  /** a nine-slice panel of a ui key, w x h, origin centre */
  nine(scene, x, y, key, w, h) {
    const n = this.m.nineSlice[key];
    const r = this.resolve(n ? n.image || key : key);
    if (!r) return null;
    if (n) return scene.add.nineslice(x, y, r.tex, r.frame, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0.5, 0.5);
    const fr = scene.textures.get(r.tex).get(r.frame);
    const m = Math.floor(Math.min(fr.width, fr.height) / 3);
    return scene.add.nineslice(x, y, r.tex, r.frame, w, h, m, m, m, m).setOrigin(0.5, 0.5);
  }
  /** play a sprite anim (spr:<key>:<anim>) on an image made by image() */
  play(img, key, anim) {
    const k = 'spr:' + key + ':' + anim;
    if (!img || !this.scene.anims.exists(k)) return false;
    if (!img.play) return false;
    img.play(k);
    return true;
  }
  /** a one-shot (or looping: opts.loop) spritesheet fx at x, y */
  sheet(scene, x, y, key, opts = {}) {
    const d = this.m.spritesheets[key];
    if (!d || !scene.textures.exists(key) || !scene.anims.exists(key)) { this.missing.add(key); return null; }
    const s = scene.add.sprite(x, y, key, 0).setOrigin((d.anchor || [0.5, 0.5])[0], (d.anchor || [0.5, 0.5])[1]);
    if (opts.scale) s.setScale(opts.scale);
    s.play({ key, repeat: opts.loop ? -1 : 0 });
    if (!opts.loop) s.once('animationcomplete', () => s.destroy());
    return s;
  }

  /** texture memory of everything loaded (RGBA, MiB), by fragment */
  textureMiB(scene) {
    const T = scene.textures, out = { total: 0, by: {} };
    for (const k of T.getTextureKeys()) {
      const t = T.get(k);
      const src = t.source && t.source[0];
      if (!src || !src.width) continue;
      const mib = (src.width * src.height * 4) / 1048576;
      const f = this.fragOf[k] || (k.startsWith('tf2_') ? 'townfolk2' : k.startsWith('tf_') ? 'townfolk' : 'lab');
      out.by[f] = (out.by[f] || 0) + mib;
      out.total += mib;
    }
    return out;
  }
}
