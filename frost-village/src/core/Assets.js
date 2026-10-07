// Asset registry (CONTRACT §2). Reads the manifest fragments, queues their files,
// creates animations and resolves every lookup — falling back to generated placeholder
// textures (one console.warn per missing key) so the game never crashes on missing art.
// v2: extra fragments (villagers, life props, emotes, and — when they exist — residents batch 2,
// buildings, UI 2, audio 2). A fragment that is not there is skipped silently. The big villager
// atlases load after the title (Game scene) so the first screen does not get heavier.

import { Placeholders } from './Placeholders.js';

export const FRAGMENTS = ['characters', 'props', 'fx', 'ui', 'ground', 'audio', 'villagers', 'life_props', 'emotes', 'villagers2', 'buildings', 'ui2', 'audio2'];
// pictures of these fragments are loaded after the title, in the background
export const LAZY_FRAGMENTS = ['villagers', 'villagers2', 'buildings'];
const BASE = 'assets/';

/** the fragment list actually requested: the artifact build can narrow it to the folders it ships */
export function activeFragments() {
  try {
    const o = typeof window !== 'undefined' && window.__FV_FRAGMENTS;
    if (Array.isArray(o) && o.length) return FRAGMENTS.filter((f) => o.indexOf(f) >= 0);
  } catch (e) { /* default list */ }
  return FRAGMENTS;
}

// When an anim is missing for a character, play the first of these that exists (then idle).
const ANIM_FALLBACK = {
  carry_idle: ['idle'], carry_walk: ['walk'], run: ['walk'], skate: ['run', 'walk'],
  happy: ['idle'], work: ['idle'], chop: ['idle'], mine: ['idle'], harvest: ['idle'],
  talk: ['idle'], laugh: ['happy', 'idle'], wave: ['happy', 'idle'], surprised: ['idle'], angry: ['idle'], sad: ['idle'],
  throw: ['idle'], hit: ['surprised', 'idle'], dance: ['happy', 'idle'], sit: ['idle'], perform: ['talk', 'idle'],
  shiver: ['idle'], serve: ['talk', 'idle'], bow: ['wave', 'happy', 'idle'], salute: ['wave', 'idle'],
  fall: ['sit', 'hit', 'idle'], loaf: ['sit', 'idle'],
};

// Defaults used when the characters manifest (or a key in it) is missing.
const HUMAN_ANIMS = {
  idle: { frames: 4, fps: 6, repeat: -1 }, walk: { frames: 8, fps: 12, repeat: -1 },
  carry_idle: { frames: 4, fps: 6, repeat: -1 }, carry_walk: { frames: 8, fps: 12, repeat: -1 },
};
const CHAR_DEFAULTS = {
  player: { anims: Object.assign({}, HUMAN_ANIMS, { chop: { frames: 8, fps: 14, repeat: -1, impactFrame: 5 }, mine: { frames: 8, fps: 14, repeat: -1, impactFrame: 5 }, harvest: { frames: 6, fps: 10, repeat: -1, impactFrame: 3 } }) },
  fisherman: { anims: Object.assign({}, HUMAN_ANIMS, { work: { frames: 8, fps: 14, repeat: -1, impactFrame: 4 } }) },
  lumberjack: { anims: Object.assign({}, HUMAN_ANIMS, { work: { frames: 8, fps: 14, repeat: -1, impactFrame: 5 } }) },
  farmer: { anims: Object.assign({}, HUMAN_ANIMS, { work: { frames: 8, fps: 14, repeat: -1, impactFrame: 4 } }) },
  miner: { anims: Object.assign({}, HUMAN_ANIMS, { work: { frames: 8, fps: 14, repeat: -1, impactFrame: 5 } }) },
  hunter: { anims: Object.assign({}, HUMAN_ANIMS, { work: { frames: 8, fps: 14, repeat: -1, impactFrame: 5 } }) },
  villager_a: { anims: { idle: HUMAN_ANIMS.idle, walk: HUMAN_ANIMS.walk, carry_walk: HUMAN_ANIMS.carry_walk, happy: { frames: 6, fps: 10, repeat: -1 } } },
  villager_b: { anims: { idle: HUMAN_ANIMS.idle, walk: HUMAN_ANIMS.walk, carry_walk: HUMAN_ANIMS.carry_walk, happy: { frames: 6, fps: 10, repeat: -1 } } },
  villager_c: { anims: { idle: HUMAN_ANIMS.idle, walk: HUMAN_ANIMS.walk, carry_walk: HUMAN_ANIMS.carry_walk, happy: { frames: 6, fps: 10, repeat: -1 } } },
  deer: { kind: 'animal', shadow: [56, 22], headTop: -56, anims: { idle: { frames: 4, fps: 6, repeat: -1 }, walk: { frames: 8, fps: 12, repeat: -1 } } },
  boar: { kind: 'animal', shadow: [62, 26], headTop: -43, anims: { idle: { frames: 4, fps: 6, repeat: -1 }, walk: { frames: 8, fps: 12, repeat: -1 } } },
};
const COMMON_CHAR = {
  frameSize: [128, 128], anchor: [0.5, 0.8125], dirs: ['S', 'SE', 'E', 'NE', 'N'], mirror: { SW: 'SE', W: 'E', NW: 'NE' },
  frameName: '{anim}_{dir}_{i}', shadow: [46, 18], headTop: -84, kind: 'human',
  carryPoint: { S: [0, -31, false], SE: [12, -34, false], E: [17, -40, false], NE: [12, -46, true], N: [0, -48, true] },
};

export const Assets = {
  m: { atlases: {}, images: {}, spritesheets: {}, characters: {}, sprites: {}, nineSlice: {}, audio: {}, audioGroups: {} },
  fragments: {},
  game: null,
  warned: new Set(),
  cache: new Map(),
  failed: new Set(),
  charCache: {},
  fragOf: {},           // file key -> fragment it came from
  built: {},            // character key -> anims created
  layouts: {},          // manifest "layouts" (life props)

  // ---------- loading ----------
  queueManifests(load) {
    for (const f of activeFragments()) load.json('manifest_' + f, BASE + f + '/manifest.json');
  },

  mergeManifests(jsonCache) {
    for (const f of activeFragments()) {
      const j = jsonCache.exists('manifest_' + f) ? jsonCache.get('manifest_' + f) : null;
      this.fragments[f] = !!j && typeof j === 'object';
      if (!j || typeof j !== 'object') continue;
      const m = this.m;
      const tag = (a) => { this.fragOf[a.key] = f; };
      for (const a of j.atlases || []) if (a && a.key) { m.atlases[a.key] = a; tag(a); }
      for (const a of j.images || []) if (a && a.key) { m.images[a.key] = a; tag(a); }
      for (const a of j.spritesheets || []) if (a && a.key) { m.spritesheets[a.key] = a; tag(a); }
      const ch = j.characters && typeof j.characters === 'object' ? j.characters : {};
      for (const k in ch) if (ch[k] && typeof ch[k] === 'object') { m.characters[k] = ch[k]; this.fragOf['char:' + k] = f; }
      Object.assign(m.sprites, j.sprites || {});
      Object.assign(m.nineSlice, j.nineSlice || {});
      Object.assign(m.audio, j.audio || {});
      Object.assign(m.audioGroups, j.audioGroups || {});
      if (j.layouts && typeof j.layouts === 'object') Object.assign(this.layouts, j.layouts);
    }
  },

  /** is file `key` one of the pictures that load after the title? */
  isLazy(key) { return LAZY_FRAGMENTS.indexOf(this.fragOf[key]) >= 0; },

  /** loaded (or failed for good)? */
  fileDone(key) { const g = this.game; return this.failed.has(key) || !!(g && g.textures.exists(key)); },

  queueAssets(load, opts = {}) {
    const m = this.m;
    // opts.lazy: only the after-title pictures (not loaded yet); otherwise everything else
    const want = (k) => (opts.lazy ? this.isLazy(k) && !this.fileDone(k) && (!opts.filter || opts.filter(k)) : !this.isLazy(k));
    let n = 0;
    for (const k in m.atlases) { const a = m.atlases[k]; if (a.png && a.json && want(k)) { load.atlas(k, BASE + a.png, BASE + a.json); n++; } }
    for (const k in m.images) { const a = m.images[k]; if (a.png && want(k)) { load.image(k, BASE + a.png); n++; } }
    for (const k in m.spritesheets) {
      const a = m.spritesheets[k];
      if (a.png && a.frameWidth && want(k)) { load.spritesheet(k, BASE + a.png, { frameWidth: a.frameWidth, frameHeight: a.frameHeight || a.frameWidth, endFrame: a.frameCount ? a.frameCount - 1 : -1 }); n++; }
    }
    if (opts.audio !== false && !opts.lazy) this.queueAudio(load, opts.musicFilter);
    return n;
  },

  /** queue the after-title pictures; characters in `first` go to the front of the queue */
  queueLazy(load, first = []) {
    let n = 0;
    const order = [];
    for (const c of first) { const d = this.m.characters[c]; if (d && d.atlas) order.push(d.atlas); }
    const firstSet = new Set(order);
    n += this.queueAssets(load, { lazy: true, filter: (k) => firstSet.has(k) });
    n += this.queueAssets(load, { lazy: true, filter: (k) => !firstSet.has(k) });
    return n;
  },

  /** a lazily loaded file arrived: create its animations */
  onLazyFile(key) {
    const g = this.game;
    if (!g || !g.textures.exists(key)) return;
    this.cache.delete(key);
    if (this.m.spritesheets[key]) this.sheetAnims(g, key);
    if (this.m.atlases[key]) {
      for (const sk in this.m.sprites) { const s = this.m.sprites[sk]; if (s && s.atlas === key) { this.cache.delete(sk); this.spriteAnims(g, sk); } }
      for (const c in this.m.characters) { const d = this.m.characters[c]; if (d && d.atlas === key && !this.built[c]) this.buildCharacter(g, c); }
    }
    for (const sk in this.m.sprites) { const s = this.m.sprites[sk]; if (s && s.image === key) this.cache.delete(sk); }
  },

  /** characters whose atlas is still on its way */
  charPending(key) {
    const d = this.m.characters[key];
    return !!(d && d.atlas && this.isLazy(d.atlas) && !this.fileDone(d.atlas));
  },

  /** character art ready to use (real atlas loaded and anims built) */
  charReady(key) {
    const d = this.m.characters[key];
    return !!(d && d.atlas && this.game && this.game.textures.exists(d.atlas) && this.built[key]);
  },

  /** manifest keys of characters of a kind ('villager', 'pet', ...) from the given fragments */
  charKeys(kind, frags) {
    const out = [];
    for (const k in this.m.characters) {
      const d = this.m.characters[k];
      if (!d || d.kind !== kind) continue;
      if (frags && frags.indexOf(this.fragOf['char:' + k]) < 0) continue;
      out.push(k);
    }
    return out;
  },

  /** display name of a character from its manifest ({ko, en}), or null */
  charName(key, lang) {
    const d = this.m.characters[key];
    const n = d && d.name;
    if (!n) return null;
    if (typeof n === 'string') return n;
    return n[lang] || n.ko || n.en || null;
  },

  queueAudio(load, filter) {
    const m = this.m;
    for (const k in m.audio) {
      const a = m.audio[k];
      if (filter && !filter(k, a)) continue;
      const files = (a.files || []).map((f) => BASE + f);
      if (files.length) load.audio(k, files);
    }
  },

  /** in-game music & ambience load after the title (in the Game scene) so the title appears sooner */
  isDeferredAudio(key) { return /^(bgm_village|amb_)/.test(key); },
  /** music not used yet (v4 spring ending): never loaded, so it costs nothing */
  isUnusedAudio(key) { return /^bgm_spring/.test(key); },

  /**
   * a file failed to load. Audio: Phaser picks the first format the browser can play (ogg) and does
   * not try the next one, so retry once with the remaining URLs (mp3) before giving up.
   */
  onLoadError(file, load) {
    if (!file || !file.key) return;
    const a = file.type === 'audio' && this.m.audio[file.key];
    this.retried = this.retried || new Set();
    if (a && load && !this.retried.has(file.key)) {
      const url = String(file.url || file.src || '');
      const rest = (a.files || []).map((f) => BASE + f).filter((f) => url.indexOf(f) < 0 && !url.endsWith(f));
      if (rest.length) { this.retried.add(file.key); try { load.audio(file.key, rest); return; } catch (e) { /* fall through */ } }
    }
    this.failed.add(file.key);
  },

  /** after all files loaded: create animations */
  finalize(game) {
    this.game = game;
    const tex = game.textures;
    // spritesheet anims (key = sheet key)
    for (const k in this.m.spritesheets) this.sheetAnims(game, k);
    // sprite anims (e.g. station work loops)
    for (const k in this.m.sprites) this.spriteAnims(game, k);
    // characters (the ones whose atlas loads after the title are built when it arrives)
    const keys = new Set(Object.keys(CHAR_DEFAULTS).concat(Object.keys(this.m.characters)));
    for (const c of keys) if (!this.charPending(c)) this.buildCharacter(game, c);
    Placeholders.shadow(tex);
    Placeholders.white(tex);
  },

  sheetAnims(game, k) {
    const s = this.m.spritesheets[k], tex = game.textures, anims = game.anims;
    if (!s || !tex.exists(k) || anims.exists(k)) return;
    const total = tex.get(k).frameTotal - 1;
    const end = Math.min(total, s.frameCount || total) - 1;
    anims.create({ key: k, frames: anims.generateFrameNumbers(k, { start: 0, end: Math.max(0, end) }), frameRate: s.fps || 24, repeat: s.repeat !== undefined ? s.repeat : 0 });
  },

  spriteAnims(game, k) {
    const s = this.m.sprites[k], tex = game.textures, anims = game.anims;
    if (!s || !s.anims || !s.atlas || !tex.exists(s.atlas)) return;
    const t = tex.get(s.atlas);
    for (const an in s.anims) {
      const a = s.anims[an];
      if (!a || !Array.isArray(a.frames)) continue;
      const frames = a.frames.filter((f) => t.has(f)).map((f) => ({ key: s.atlas, frame: f }));
      if (!frames.length) continue;
      const key = 'spr:' + k + ':' + an;
      if (!anims.exists(key)) anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat !== undefined ? a.repeat : -1 });
    }
  },

  charDef(key) {
    if (this.charCache[key]) return this.charCache[key];
    const d = Object.assign({}, COMMON_CHAR, CHAR_DEFAULTS[key] || {}, this.m.characters[key] || {});
    d.anims = Object.assign({}, (CHAR_DEFAULTS[key] || {}).anims || {}, (this.m.characters[key] || {}).anims || {});
    this.charCache[key] = d;
    return d;
  },

  /**
   * Create `<key>:<anim>:<dir>` animations. Each anim only gets the render dirs its manifest entry
   * lists (`anims[x].dirs`, e.g. social anims exist only in S/SE/E): a missing dir is skipped and
   * Character.play() turns the character to the nearest dir that exists. Only a missing atlas gives
   * placeholder art.
   */
  buildCharacter(game, key) {
    const tex = game.textures, anims = game.anims;
    const def = this.charDef(key);
    const atlasOk = !!(def.atlas && tex.exists(def.atlas));
    const t = atlasOk ? tex.get(def.atlas) : null;
    const fname = typeof def.frameName === 'string' ? def.frameName : '{anim}_{dir}_{i}';
    const baseDirs = Array.isArray(def.dirs) && def.dirs.length ? def.dirs : COMMON_CHAR.dirs;
    def._dirs = def._dirs || {};
    let phKey = null;
    for (const an in def.anims) {
      const a = def.anims[an];
      if (!a || typeof a !== 'object') continue;
      const dirs = atlasOk && Array.isArray(a.dirs) && a.dirs.length ? a.dirs : baseDirs;
      const have = [];
      for (const dir of dirs) {
        const akey = key + ':' + an + ':' + dir;
        if (anims.exists(akey)) { have.push(dir); continue; }
        let frames = null;
        if (atlasOk) {
          const list = [];
          for (let i = 0; i < (a.frames || 1); i++) {
            const fn = fname.replace('{anim}', an).replace('{dir}', dir).replace('{i}', i);
            if (t.has(fn)) list.push({ key: def.atlas, frame: fn });
          }
          if (list.length) frames = list;
          else continue;      // this dir is not rendered: play() turns to one that is
        }
        if (!frames) {
          if (!phKey) { phKey = Placeholders.character(tex, key, baseDirs); this.warn('character atlas ' + key); }
          frames = [{ key: phKey, frame: dir + '_0' }, { key: phKey, frame: dir + '_1' }];
          def._placeholder = true;
        }
        const fps = def._placeholder ? 4 : (a.fps || 10);
        anims.create({ key: akey, frames, frameRate: fps, repeat: a.repeat !== undefined ? a.repeat : -1 });
        have.push(dir);
      }
      def._dirs[an] = have;
    }
    this.built[key] = true;
    return true;
  },

  /** the anim that will really play for `anim` (fallback chain when the character does not have it) */
  resolveAnim(key, anim) {
    const def = this.charDef(key);
    const d = def._dirs || {};
    if (d[anim] && d[anim].length) return anim;
    const chain = ANIM_FALLBACK[anim] || ['idle'];
    for (const a of chain) if (d[a] && d[a].length) return a;
    return 'idle';
  },

  /** rendered dirs that exist for (already resolved) anim */
  animDirs(key, anim) { const d = this.charDef(key)._dirs; return (d && d[anim]) || []; },

  /** does the character really have this anim (not a fallback)? */
  hasAnim(key, anim) { const d = this.charDef(key)._dirs; return !!(d && d[anim] && d[anim].length); },

  /** seconds one cycle of an anim takes */
  animDuration(key, anim) {
    const a = this.charDef(key).anims[this.resolveAnim(key, anim)];
    if (!a) return 0.6;
    return Math.max(0.1, (a.frames || 4) / Math.max(1, a.fps || 10));
  },

  /** anim key for character anim with fallback to a sensible alternative */
  charAnim(key, anim, baseDir) {
    const anims = this.game.anims;
    const res = this.resolveAnim(key, anim);
    let k = key + ':' + res + ':' + baseDir;
    if (anims.exists(k)) return k;
    const dirs = this.animDirs(key, res);
    if (dirs.length) return key + ':' + res + ':' + dirs[0];
    return key + ':idle:S';
  },

  // ---------- lookups ----------
  warn(what) {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn('[FrostVillage] missing asset → placeholder:', what);
  },

  /** resolve a static picture: { tex, frame, anchor, def, ph } */
  sprite(key) {
    let r = this.cache.get(key);
    if (r) return r;
    const tex = this.game.textures;
    const def = this.m.sprites[key];
    if (def) {
      if (def.atlas && tex.exists(def.atlas) && tex.get(def.atlas).has(def.frame)) r = { tex: def.atlas, frame: def.frame, anchor: def.anchor || [0.5, 0.5], def };
      else if (def.image && tex.exists(def.image)) r = { tex: def.image, frame: undefined, anchor: def.anchor || [0.5, 0.5], def };
    }
    if (!r && tex.exists(key) && !this.failed.has(key)) {
      r = { tex: key, frame: undefined, anchor: (def && def.anchor) || (this.m.images[key] && this.m.images[key].anchor) || [0.5, 0.5], def: def || this.m.images[key] || {} };
    }
    if (!r) {
      this.warn(key);
      const ph = Placeholders.sprite(tex, key, def);
      r = { tex: ph.tex, frame: undefined, anchor: ph.anchor, def: def || {}, ph: true };
    }
    this.cache.set(key, r);
    return r;
  },

  /** first key in the list that has real art (else the last one) */
  pick(...keys) {
    for (const k of keys) if (k && this.has(k)) return k;
    return keys[keys.length - 1];
  },

  has(key) {
    const tex = this.game.textures;
    const def = this.m.sprites[key];
    if (def && def.atlas) return tex.exists(def.atlas) && tex.get(def.atlas).has(def.frame);
    if (def && def.image) return tex.exists(def.image);
    return tex.exists(key) && !this.failed.has(key);
  },

  def(key) { return this.m.sprites[key] || {}; },

  /** apply a sprite key to an existing Image/Sprite */
  apply(img, key) {
    const r = this.sprite(key);
    img.setTexture(r.tex, r.frame);
    img.setOrigin(r.anchor[0], r.anchor[1]);
    return img;
  },

  image(scene, x, y, key) {
    const r = this.sprite(key);
    const img = scene.add.image(x, y, r.tex, r.frame);
    img.setOrigin(r.anchor[0], r.anchor[1]);
    return img;
  },

  /** source image/canvas for canvas-2D baking (patterns, decals) */
  source(key) {
    const r = this.sprite(key);
    const t = this.game.textures.get(r.tex);
    const fr = r.frame !== undefined ? t.get(r.frame) : t.get();
    return { img: t.getSourceImage(), frame: fr, anchor: r.anchor, ph: !!r.ph, def: r.def };
  },

  sheet(key) { return this.game.anims.exists(key) ? key : null; },
  sheetDef(key) { return this.m.spritesheets[key] || null; },

  spriteAnim(key, anim) { const k = 'spr:' + key + ':' + anim; return this.game.anims.exists(k) ? k : null; },

  nine(key) {
    const n = this.m.nineSlice[key];
    if (n) {
      const s = this.sprite(n.image || key);
      if (!s.ph) return { tex: s.tex, frame: s.frame, l: n.left, r: n.right, t: n.top, b: n.bottom };
    }
    const s = this.sprite(key);
    if (s.ph) return { tex: s.tex, frame: undefined, l: 30, r: 30, t: 30, b: 34 };
    const fr = this.game.textures.get(s.tex).get(s.frame);
    const m = Math.floor(Math.min(fr.width, fr.height) / 3);
    return { tex: s.tex, frame: s.frame, l: m, r: m, t: m, b: m };
  },

  audioDef(key) { return this.m.audio[key] || null; },
  audioGroup(key) { return this.m.audioGroups[key] || null; },
};
