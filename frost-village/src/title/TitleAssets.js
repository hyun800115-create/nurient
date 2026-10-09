// Title asset loading: the baked diorama (src/title/bake, written by tools/title/bake_title.mjs), the
// optional title art (assets/title, the title_art agent's fragment) and a few late sounds for the intro.
//
// Everything is fetched in "packs" (src/title/plan.js decides which, and when):
//   g1..g4      the bake of one growth stage (atlas page + its ground layer)
//   art:sky     sky gradients, clouds, mountains, forest      art:night   stars, moon, aurora
//   art:fx      snow flakes, twinkle                          art:logo    the one-piece logo (language, scale)
//   art:shine   logo shine mask + band                        art:parts   the per-letter logo pieces (intro)
//   art:pop     the building pop effect                       art:city    far city strips (stage 4)
//   cues        the late intro sounds (whistle, bus horn, ship horn)
//
//   - queueManifests(load) + queueFirstPaint(load) in the game's Preload (or in the title's own preload)
//     fetch only what the title's first frame needs: the stage this player sees, the backdrop, the logo.
//   - stream(load, packs) fetches the rest while the title plays, two packs at a time, in the order the
//     intro needs them (an idle title fetches nothing it does not show).
//   - release(game) when the game starts: every texture / anim / json the title added goes away, downloads
//     still running are aborted, and anything that lands later anyway is removed the moment it lands.
import { Assets } from '../core/Assets.js';
import { View } from '../core/View.js';
import { TITLE_CFG } from './config.js';
import { titlePlan, firstPaintPacks } from './plan.js';

const P = 'ttl_';
const STREAM_MAX = 2;          // packs downloading at once while the title streams

/** which part of the title an art key serves (decides when it is fetched); null = never at the title */
export function artRole(key) {
  if (/^ttl_logo_short|^ttl_icon|^ttl_ic_/.test(key)) return null;
  if (/^ttl_logo_(main|en)(_1x)?$/.test(key)) return 'logo';
  if (/_shine$/.test(key) || key === 'ttl_shine_band') return 'shine';
  if (key === 'ttl_logo_parts') return 'parts';
  if (key === 'ttl_fx_pop') return 'pop';
  if (key === 'ttl_fx') return 'fx';
  if (/^ttl_city_/.test(key)) return 'city';
  if (/^ttl_(stars|moon|aurora)$/.test(key)) return 'night';
  return 'sky';                // sky gradients, clouds, mountains, forest (and new backdrop layers)
}

export const TitleAssets = {
  man: null,              // title_bake.json
  art: null,              // assets/title/manifest.json (or null)
  manTried: false,
  artTried: false,
  base: TITLE_CFG.bakeBase,
  packs: {},              // name -> { keys: [], state: 'queued' | 'ready' | 'failed' }
  open: [],               // pack names queued and not settled yet
  waiting: [],            // pack names asked for before their manifest arrived
  streamList: [],         // pack names to fetch later, in order
  taken: [],              // pack names the stream has handed to the loader
  streamLoad: null,
  keys: new Set(),        // bake textures the title added (and title stand-ins, see TitleFx)
  artKeys: new Set(),     // title art textures the title asked for
  jsonKeys: new Set(),
  anims: new Set(),
  files: new Set(),       // title files still downloading (aborted by release)
  failed: new Set(),
  cueVol: {},             // late cue key -> manifest volume
  listeners: [],          // fn(packName) when a pack is ready
  bound: new WeakMap(),
  tomb: new Set(),        // keys removed the moment they land (they were still on their way at release)
  tombBound: null,
  artOpts: null,

  // ------------------------------------------------------------------ queueing
  /** the bake + art manifests (the game's Preload.preload, or the title's own preload) */
  queueManifests(load) {
    this.watch(load);
    const cache = load.scene.cache.json;
    if (!this.manTried && !this.jsonKeys.has(P + 'bake')) {
      if (cache.exists(P + 'bake')) this.onManifest(load, P + 'bake', true);
      else { this.tomb.delete(P + 'bake'); load.json(P + 'bake', this.base + TITLE_CFG.bakeManifest); this.jsonKeys.add(P + 'bake'); }
    }
    if (!this.artTried && !this.jsonKeys.has(P + 'art')) {
      if (cache.exists(P + 'art')) this.onManifest(load, P + 'art', true);
      else { this.tomb.delete(P + 'art'); load.json(P + 'art', TITLE_CFG.artBase + TITLE_CFG.artManifest); this.jsonKeys.add(P + 'art'); }
    }
  },

  /** what the first frame of this player's title needs (stage, backdrop, logo); hooks as in titlePlan */
  queueFirstPaint(load, hooks) {
    this.queueManifests(load);
    this.request(load, firstPaintPacks(titlePlan(hooks)));
  },

  /** (kept for the first integration note) manifests + first paint in one call */
  queueEarly(load, hooks) { this.queueFirstPaint(load, hooks); },

  /** queue packs now (when a manifest is still on its way, as soon as it lands) */
  request(load, names) {
    this.watch(load);
    for (const n of names) this.queuePack(load, n);
    this.kick(load);
  },

  /** fetch these packs later, in order, STREAM_MAX at a time (pump() each frame) */
  stream(load, names) {
    this.watch(load);
    this.streamLoad = load;
    for (const n of names) if (!this.packs[n] && this.streamList.indexOf(n) < 0 && this.taken.indexOf(n) < 0) this.streamList.push(n);
    this.pump();
  },

  /** move the next streamed packs to the loader while fewer than STREAM_MAX are downloading */
  pump() {
    const load = this.streamLoad;
    if (!load || !this.streamList.length) return;
    let busy = 0;
    for (let i = 0; i < this.taken.length; i++) if (!this.settled(this.taken[i])) busy++;
    let added = false;
    while (busy < STREAM_MAX && this.streamList.length) {
      const n = this.streamList.shift();
      this.taken.push(n);
      this.queuePack(load, n);
      if (!this.settled(n)) busy++;
      added = true;
    }
    if (added) this.kick(load);
  },

  /** start the loader, or (already running) hand it the new files now instead of on its next scene update */
  kick(load) {
    try {
      if (!load.list.size) return;
      if (!load.isLoading()) load.start();
      else if (load.inflight.size < load.maxParallelDownloads) load.checkLoadQueue();
    } catch (e) { /* a loader of a scene that is going away */ }
  },

  /** queue one pack (no-op when queued / ready) */
  queuePack(load, n) {
    if (this.packs[n]) return;
    const isGroup = n[0] === 'g', isArt = n.startsWith('art:');
    if ((isGroup && !this.manTried) || (isArt && !this.artTried)) { if (this.waiting.indexOf(n) < 0) this.waiting.push(n); return; }
    const pk = this.packs[n] = { keys: [], state: 'queued' };
    const tex = load.scene.textures;
    if (isGroup) {
      const grp = this.man && this.man.groups[n.slice(1)];
      if (grp) {
        for (const k of grp.atlases) {
          const f = this.man.files[k];
          this.keys.add(k); pk.keys.push(k); this.tomb.delete(k);
          if (!tex.exists(k)) load.atlas(k, this.base + f.png, this.base + f.json);
        }
        for (const k of grp.images) {
          const f = this.man.files[k];
          this.keys.add(k); pk.keys.push(k); this.tomb.delete(k);
          if (!tex.exists(k)) load.image(k, this.base + f.img);
        }
      }
    } else if (isArt) {
      this.queueArtRole(load, n.slice(4), pk);
    } else if (n === 'cues') {
      this.queueLateCues(load);
    }
    this.open.push(n);
    this.check(tex);
  },

  /** title art of one role, only what this phone needs (logo of its language and scale) */
  queueArtRole(load, role, pk) {
    const a = this.art;
    if (!a) return;
    const want = this.artWant();
    const base = TITLE_CFG.artBase.replace(/title\/$/, '');      // manifest paths are relative to assets/
    const tex = load.scene.textures;
    const take = (key) => {
      if (!key || artRole(key) !== role || !want(key)) return false;
      this.artKeys.add(key); pk.keys.push(key); this.tomb.delete(key);
      return !tex.exists(key);
    };
    for (const at of a.atlases || []) if (at && at.loadAtTitle !== false && take(at.key)) load.atlas(at.key, base + at.png, base + at.json);
    for (const im of a.images || []) if (im && im.loadAtTitle !== false && take(im.key)) load.image(im.key, base + im.png);
    for (const sh of a.spritesheets || []) {
      if (!sh || !sh.frameWidth || !take(sh.key)) continue;
      load.spritesheet(sh.key, base + sh.png, { frameWidth: sh.frameWidth, frameHeight: sh.frameHeight || sh.frameWidth, endFrame: sh.frameCount ? sh.frameCount - 1 : -1 });
    }
  },

  /** the art filter of this phone: its language's logo, and the @2x logo unless the _1x one is sharp enough */
  artWant() {
    const o = this.artOpts || {};
    const lang = o.lang || 'ko';
    const en = lang === 'en';
    const k = o.k || View.k || 1;
    const meta = this.art && this.art.meta;
    const lay = meta && meta.layout && meta.layout[en ? 'logoEn' : 'logoMain'];
    const wr = (lay && lay.widthLogical) || [430, 520];
    const lm = meta && meta.logo && meta.logo[en ? 'en' : 'main'];
    // the _1x logo is half the @2x one: use it only when it is not stretched on this screen
    const w1x = lm && lm.size2x ? lm.size2x[0] / 2 : 450;
    const lo = k * wr[1] <= w1x * 1.02;
    return (key) => {
      if (/^ttl_logo_en/.test(key) && !en) return false;
      if ((/^ttl_logo_main/.test(key) || key === 'ttl_logo_parts') && en) return false;
      if (/_1x$/.test(key)) return lo;
      if (lo && (key === 'ttl_logo_main' || key === 'ttl_logo_en')) return false;
      return true;
    };
  },

  setArtOpts(opts) { if (opts) this.artOpts = Object.assign({}, this.artOpts || {}, opts); },

  // ------------------------------------------------------------------ loader events
  /** listen to a loader once: manifests are parsed as they arrive, downloads are tracked */
  watch(load) {
    this.game = load.scene.sys.game;
    // (a scene shutdown / restart removes every loader listener: bind again when ours are gone)
    let h = this.bound.get(load);
    if (h && load.listeners('filecomplete').indexOf(h.fc) >= 0) return;
    h = {
      fc: (key) => this.onFile(load, key, true),
      err: (f) => { if (f) { this.files.delete(f); if (f.key) this.onFile(load, f.key, false); } },
      add: (key, type, loader, file) => { if (typeof key === 'string' && key.startsWith(P) && file) this.files.add(file); },
      got: (file) => { if (file) this.files.delete(file); },
      done: () => this.check(load.scene.textures),
    };
    this.bound.set(load, h);
    load.on('filecomplete', h.fc);
    load.on('loaderror', h.err);
    load.on('addfile', h.add);
    load.on('load', h.got);
    load.on('complete', h.done);
  },

  onFile(load, key, ok) {
    if (key === P + 'bake' || key === P + 'art') { this.onManifest(load, key, ok); return; }
    if (key.startsWith(P + 'aud_')) { this.onAudioManifest(load, key, ok); return; }
    if (!ok) this.failed.add(key);
    this.check(load.scene.textures);
  },

  onManifest(load, key, ok) {
    const cache = load.scene.cache.json;
    const j = ok && cache.exists(key) ? cache.get(key) : null;
    if (key === P + 'bake') { this.manTried = true; this.man = j; } else { this.artTried = true; this.art = j; }
    if (this.waiting.length) {
      const w = this.waiting.splice(0, this.waiting.length);
      for (const n of w) this.queuePack(load, n);
      this.kick(load);
    }
  },

  /** packs whose every texture exists (or failed for good) settle; listeners hear about ready ones */
  check(tex) {
    const tm = tex || (this.game && this.game.textures);
    if (!tm) return;
    for (let i = this.open.length - 1; i >= 0; i--) {
      const n = this.open[i];
      const pk = this.packs[n];
      let done = true, bad = false;
      for (let j = 0; j < pk.keys.length; j++) {
        const k = pk.keys[j];
        if (tm.exists(k)) continue;
        if (this.failed.has(k)) { bad = true; continue; }
        done = false; break;
      }
      if (!done) continue;
      pk.state = bad && pk.keys.every((k) => !tm.exists(k)) ? 'failed' : 'ready';
      this.open[i] = this.open[this.open.length - 1]; this.open.length--;
      if (pk.state === 'ready') for (const fn of this.listeners) { try { fn(n); } catch (e) { console.error(e); } }
    }
  },

  /** per frame from the title: settle packs, move the stream along (allocation-free when idle) */
  poll() {
    if (this.open.length) this.check();
    if (this.streamList.length) this.pump();
  },

  settled(n) { const p = this.packs[n]; return !!p && p.state !== 'queued'; },
  packReady(n) { const p = this.packs[n]; return !!p && p.state === 'ready'; },
  ready(g) { return this.packReady('g' + g) || (this.manTried && !(this.man && this.man.groups[String(g)])); },
  /** nothing queued, waiting or streaming any more (tests) */
  idle() { return !this.open.length && !this.waiting.length && !this.streamList.length && this.manTried && this.artTried; },
  /** every art pack asked for so far has settled */
  artSettled() {
    if (!this.artTried) return false;
    for (const n in this.packs) if (n.startsWith('art:') && this.packs[n].state === 'queued') return false;
    return !this.waiting.some((n) => n.startsWith('art:'));
  },

  // ------------------------------------------------------------------ lookups
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

  // ------------------------------------------------------------------ late intro sounds
  /** the late intro sounds (whistle, bus horn, ship horn): their fragment manifests, then the files */
  queueLateCues(load) {
    for (const frag in TITLE_CFG.lateCues) {
      const key = P + 'aud_' + frag;
      if (this.jsonKeys.has(key)) continue;
      this.jsonKeys.add(key); this.tomb.delete(key);
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
      load.audio(k, d.files.map((f) => 'assets/' + f));      // kept in the audio cache: the game uses them too
    }
  },

  // ------------------------------------------------------------------ release
  /** everything the title added goes away (call when the game starts) */
  release(game) {
    // downloads still running: stop them (the XHR handlers are left alone, so nothing is added later)
    for (const f of this.files) {
      try { const x = f.xhrLoader; if (x && x.readyState !== 4) x.abort(); } catch (e) { /* ignore */ }
    }
    this.files.clear();
    const tm = game.textures, jc = game.cache.json;
    try {
      for (const k of this.anims) if (game.anims.exists(k)) game.anims.remove(k);
      for (const set of [this.keys, this.artKeys]) for (const k of set) { if (tm.exists(k)) tm.remove(k); else this.tomb.add(k); }
      for (const k of this.jsonKeys) { if (jc.exists(k)) jc.remove(k); else if (k !== P + 'bake' && k !== P + 'art') this.tomb.add(k); }
    } catch (e) { /* never block the game start */ }
    // files that were already downloaded and are being decoded still land: remove them when they do
    if (this.tomb.size && this.tombBound !== game) {
      this.tombBound = game;
      const drop = (cacheOrTm, key) => { if (!this.tomb.has(key)) return; this.tomb.delete(key); setTimeout(() => { try { if (cacheOrTm.exists(key)) cacheOrTm.remove(key); } catch (e) { /* ignore */ } }, 0); };
      tm.on('addtexture', (key) => drop(tm, key));
      jc.events.on('add', (cache, key) => drop(jc, key));
    }
    this.anims.clear(); this.keys.clear(); this.artKeys.clear(); this.jsonKeys.clear();
    this.packs = {}; this.open.length = 0; this.waiting.length = 0; this.streamList.length = 0; this.taken.length = 0;
    this.streamLoad = null; this.failed.clear();
    this.listeners.length = 0;
    // a manifest that never answered is asked again next time; the parsed ones stay (a few KB)
    if (!this.man) this.manTried = false;
    if (!this.art) this.artTried = false;
  },
};
