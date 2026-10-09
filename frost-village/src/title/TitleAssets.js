// Title asset loading: the baked diorama (src/title/bake, written by tools/title/bake_title.mjs), the
// optional title art (assets/title, the title_art agent's fragment) and a few late sounds for the intro.
//
//   - Nothing here blocks the game's own loading. Stage 1 of the bake (~200 KB) can ride along with the
//     game's preload (queueEarly + queueGroup(load, 1) in Preload, see the integration doc); the later
//     stages stream in while the title already plays (queueRest from the title scene).
//   - Every texture / anim / json the title adds is remembered and removed again by release() when the
//     game starts (texture memory goes back to the game).
import { Assets } from '../core/Assets.js';
import { TITLE_CFG } from './config.js';

const P = 'ttl_';

export const TitleAssets = {
  man: null,              // title_bake.json
  art: null,              // assets/title/manifest.json (or null)
  artTried: false,
  base: TITLE_CFG.bakeBase,
  state: {},              // group -> 'queued' | 'ready' | 'failed'
  fileGroup: {},          // texture key -> group
  pending: {},            // group -> number of files still loading
  keys: new Set(),        // textures the title added
  jsonKeys: new Set(),
  anims: new Set(),
  artKeys: new Set(),
  cueVol: {},             // late cue key -> manifest volume
  listeners: [],          // fn(group) when a group is ready
  failed: new Set(),
  bound: new WeakMap(),

  /** queue the bake manifest + art manifest (call in a scene's preload; Preload can do it at boot) */
  queueEarly(load) {
    this.watch(load);
    if (!this.man && !load.scene.cache.json.exists(P + 'bake')) { load.json(P + 'bake', this.base + TITLE_CFG.bakeManifest); this.jsonKeys.add(P + 'bake'); }
    if (!this.artTried && !load.scene.cache.json.exists(P + 'art')) { load.json(P + 'art', TITLE_CFG.artBase + TITLE_CFG.artManifest); this.jsonKeys.add(P + 'art'); }
  },

  /** listen to a loader once: manifests are parsed as they arrive, groups are marked ready */
  watch(load) {
    this.game = load.scene.sys.game;
    // (a scene shutdown / restart removes every loader listener: bind again when ours are gone)
    let h = this.bound.get(load);
    if (h && load.listeners('filecomplete').indexOf(h.fc) >= 0) return;
    h = {
      fc: (key) => this.onFile(load, key, true),
      err: (f) => { if (f && f.key) this.onFile(load, f.key, false); },
      done: () => this.checkGroups(load.scene.textures),
    };
    this.bound.set(load, h);
    load.on('filecomplete', h.fc);
    load.on('loaderror', h.err);
    // a multi-part file (atlas = image + json) reports each part; the texture exists only once both are
    // in, so readiness is decided by looking at the texture manager, and once more when the queue drains
    load.on('complete', h.done);
  },

  /** groups whose every texture exists (or failed for good) become ready; listeners hear about it */
  checkGroups(tex) {
    for (const gs in this.groupKeys) {
      const g = +gs;
      if (this.state[g] !== 'queued') continue;
      const keys = this.groupKeys[g];
      if (!keys.every((k) => tex.exists(k) || this.failed.has(k))) continue;
      this.state[g] = keys.some((k) => this.failed.has(k)) ? 'failed' : 'ready';
      if (this.state[g] === 'ready') for (const fn of this.listeners) { try { fn(g); } catch (e) { console.error(e); } }
    }
  },
  groupKeys: {},

  onFile(load, key, ok) {
    const cache = load.scene.cache.json;
    if (key === P + 'bake') {
      this.man = ok && cache.exists(key) ? cache.get(key) : null;
      if (this.wantGroups) { const w = this.wantGroups; this.wantGroups = null; for (const g of w) this.queueGroup(load, g); }
      return;
    }
    if (key === P + 'art') {
      this.artTried = true;
      this.art = ok && cache.exists(key) ? cache.get(key) : null;
      if (this.art && this.wantArt) { this.wantArt = false; this.queueArt(load); } else this.wantArt = false;
      return;
    }
    if (key.startsWith(P + 'aud_')) { this.onAudioManifest(load, key, ok); return; }
    if (this.artKeys.has(key)) { if (!ok) this.failed.add(key); return; }
    const g = this.fileGroup[key];
    if (g === undefined) return;
    if (!ok) this.failed.add(key);
    this.checkGroups(load.scene.textures);
  },

  /** queue one stage's atlases + ground layers (no-op when queued / ready) */
  queueGroup(load, g) {
    this.watch(load);
    if (!this.man) { (this.wantGroups = this.wantGroups || []).push(g); return; }
    if (this.state[g]) return;
    const grp = this.man.groups[String(g)];
    if (!grp) { this.state[g] = 'ready'; return; }
    const tex = load.scene.textures;
    let n = 0;
    const keys = this.groupKeys[g] = [];
    for (const k of grp.atlases) {
      const f = this.man.files[k];
      this.keys.add(k); keys.push(k);
      if (tex.exists(k)) continue;
      this.fileGroup[k] = g; n++;
      load.atlas(k, this.base + f.png, this.base + f.json);
    }
    for (const k of grp.images) {
      const f = this.man.files[k];
      this.keys.add(k); keys.push(k);
      if (tex.exists(k)) continue;
      this.fileGroup[k] = g; n++;
      load.image(k, this.base + f.img);
    }
    this.state[g] = n ? 'queued' : 'ready';
    if (!n) for (const fn of this.listeners) { try { fn(g); } catch (e) { console.error(e); } }
  },

  ready(g) { return this.state[g] === 'ready'; },

  /** queue the title art (logo, backdrop, fx) of assets/title, when its manifest exists.
   *  Only what this phone needs: the logo of its language, @2x or _1x by render scale, no short logo. */
  queueArt(load, opts) {
    this.watch(load);
    if (opts) this.artOpts = opts;
    if (!this.artTried) { this.wantArt = true; return; }
    if (!this.art) return;
    const a = this.art;
    const o = this.artOpts || {};
    const en = o.lang === 'en', hi = !(o.k < 1.5);
    const want = (key) => {
      if (/_short/.test(key) || /^ttl_icon/.test(key)) return false;
      if (/^ttl_logo_en/.test(key) && !en) return false;
      if ((/^ttl_logo_main/.test(key) || key === 'ttl_logo_parts') && en) return false;
      if (/_1x$/.test(key)) return !hi;
      if (!hi && (key === 'ttl_logo_main' || key === 'ttl_logo_en')) return false;
      return true;
    };
    const base = TITLE_CFG.artBase.replace(/title\/$/, '');      // manifest paths are relative to assets/
    const tex = load.scene.textures;
    for (const at of a.atlases || []) {
      if (!at || !at.key || tex.exists(at.key) || at.loadAtTitle === false || !want(at.key)) continue;
      this.artKeys.add(at.key); this.artPending++;
      load.atlas(at.key, base + at.png, base + at.json);
    }
    for (const im of a.images || []) {
      if (!im || !im.key || tex.exists(im.key) || im.loadAtTitle === false || !want(im.key)) continue;
      this.artKeys.add(im.key); this.artPending++;
      load.image(im.key, base + im.png);
    }
    for (const sh of a.spritesheets || []) {
      if (!sh || !sh.key || tex.exists(sh.key) || !sh.frameWidth || !want(sh.key)) continue;
      this.artKeys.add(sh.key); this.artPending++;
      load.spritesheet(sh.key, base + sh.png, { frameWidth: sh.frameWidth, frameHeight: sh.frameHeight || sh.frameWidth, endFrame: sh.frameCount ? sh.frameCount - 1 : -1 });
    }
  },
  /** Phaser anim of a title-art spritesheet ('ttl:' + key), or null */
  sheetAnim(scene, key) {
    const k = 'ttl:' + key;
    if (scene.anims.exists(k)) return k;
    const a = this.art;
    const sh = a && (a.spritesheets || []).find((x) => x && x.key === key);
    if (!sh || !scene.textures.exists(key)) return null;
    const n = sh.frameCount || scene.textures.get(key).frameTotal - 1;
    scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(key, { start: 0, end: n - 1 }), frameRate: sh.fps || 24, repeat: sh.repeat !== undefined ? sh.repeat : 0 });
    this.anims.add(k);
    return k;
  },
  artPending: 0,
  /** art manifest answered and every art file it listed arrived (or failed) */
  artSettled(tex) {
    if (!this.artTried || this.wantArt) return false;
    const tm = tex || (this.game && this.game.textures);
    if (!tm) return this.artKeys.size === 0;
    for (const k of this.artKeys) if (!tm.exists(k) && !this.failed.has(k)) return false;
    return true;
  },

  /** a picture of the title art: { tex, frame, anchor } or null */
  artSprite(scene, key) {
    const a = this.art;
    if (!a) return null;
    const sp = a.sprites && a.sprites[key];
    const tex = scene.textures;
    if (sp && sp.atlas && tex.exists(sp.atlas) && tex.get(sp.atlas).has(sp.frame)) return { tex: sp.atlas, frame: sp.frame, anchor: sp.anchor || [0.5, 0.5], def: sp };
    if (sp && sp.image && tex.exists(sp.image)) return { tex: sp.image, frame: undefined, anchor: sp.anchor || [0.5, 0.5], def: sp };
    if (this.artKeys.has(key) && tex.exists(key)) return { tex: key, frame: undefined, anchor: (sp && sp.anchor) || [0.5, 0.5], def: sp || {} };
    return null;
  },
  /** first art key that is loaded */
  artPick(scene, keys) { for (const k of keys) { const r = this.artSprite(scene, k); if (r) return r; } return null; },

  /** the late intro sounds (whistle, bus horn, ship horn): their fragment manifests, then the files */
  queueLateCues(load) {
    this.watch(load);
    for (const frag in TITLE_CFG.lateCues) {
      const key = P + 'aud_' + frag;
      if (this.jsonKeys.has(key)) continue;
      this.jsonKeys.add(key);
      load.json(key, 'assets/' + frag + '/manifest.json');
    }
  },
  onAudioManifest(load, key, ok) {
    const cache = load.scene.cache.json;
    const frag = key.slice((P + 'aud_').length);
    const j = ok && cache.exists(key) ? cache.get(key) : null;
    if (!j || !j.audio) return;
    const game = load.scene.sys.game;
    for (const k of TITLE_CFG.lateCues[frag] || []) {
      const d = j.audio[k];
      if (!d || !d.files || game.cache.audio.exists(k) || Assets.failed.has(k)) continue;
      this.cueVol[k] = d.volume !== undefined ? d.volume : 0.7;
      load.audio(k, d.files.map((f) => 'assets/' + f));
    }
  },

  // ------------------------------------------------------------------ lookups used by the diorama
  sprite(key) { return this.man && this.man.sprites[key]; },
  actor(key) { return this.man && this.man.actors[key]; },

  /** Phaser anim from baked frames (created once): 'ttl:' + name */
  anim(scene, name, frames, fps, repeat = -1) {
    const key = 'ttl:' + name;
    const anims = scene.anims;
    if (anims.exists(key)) return key;
    const tex = scene.textures;
    const list = [];
    for (const [t, f] of frames) if (tex.exists(t) && tex.get(t).has(f)) list.push({ key: t, frame: f });
    if (!list.length) return null;
    anims.create({ key, frames: list, frameRate: fps, repeat });
    this.anims.add(key);
    return key;
  },

  /** everything the title added goes away (call when the game starts) */
  release(game) {
    try {
      for (const k of this.anims) if (game.anims.exists(k)) game.anims.remove(k);
      for (const k of this.keys) if (game.textures.exists(k)) game.textures.remove(k);
      for (const k of this.artKeys) if (game.textures.exists(k)) game.textures.remove(k);
      for (const k of ['ttl_fx_sky', 'ttl_fx_glow', 'ttl_fx_beam', 'ttl_fx_pool', 'ttl_fx_aurora', 'ttl_fx_stars', 'ttl_fx_mtn_far', 'ttl_fx_mtn_near', 'ttl_fx_haze', 'ttl_fx_shine', 'ttl_logo_fb', 'ttl_fx_pill', 'ttl_fx_vignette']) {
        if (game.textures.exists(k)) game.textures.remove(k);
      }
      for (const k of this.jsonKeys) if (game.cache.json.exists(k)) game.cache.json.remove(k);
    } catch (e) { /* never block the game start */ }
    this.anims.clear(); this.keys.clear(); this.artKeys.clear(); this.artPending = 0;
    this.state = {}; this.pending = {}; this.fileGroup = {}; this.groupKeys = {};
    this.listeners.length = 0;
    // the parsed manifests stay (a few KB) so a return to the title does not refetch them
  },
};
