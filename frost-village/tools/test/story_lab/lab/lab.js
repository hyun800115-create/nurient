// Story lab (tools/test/story_lab/lab.html): the story_runtime module (src/story) running on a stand-in piece of
// world with the real finished art, at the game's own canvas rules (720-wide logical space, render scale k from the
// device pixel ratio, world zoom x k). The story core runs in its Web Worker (?inline=1: on the main thread).
// window.__LAB is the staging API the capture script (lab.mjs) and the designer use.
//
// URL: ?inline=1  ?lang=en  ?seed=2611  ?day=2&hour=9  ?zoom=1.0  ?hud=0  ?farewell=0  ?speed=1

import { LabArt } from './art.js';
import { LabTown } from './bodies.js';
import { LabBubbles } from './bubbles.js';
import { LAB_BUILDINGS, LAB_BYID, LAB_BENCHES, buildWorld, pointOf, DECOR_KEYS, WORLD_W, WORLD_H } from './world.js';
import { makeStandInTown, DAY, HOUR } from '../standin.mjs';
import { mergeTownfolkManifests } from '../../../townfolk2_compose.js';
import { townfolkPreload, townfolkInstall } from '../../../townfolk_compose.js';
import { StoryHost } from '../../../../src/story/host.js';
import { StoryLife } from '../../../../src/story/view/StoryLife.js';
import { nullPorts } from '../../../../src/story/ports.js';
import { VillageVoice } from '../../../../src/voice/VillageVoice.js';
import { shots } from './shots.js';
import { DayTint } from './tint.js';
import { LAMPS } from './world.js';
import { dirOf as dirOfV } from '../../../../src/story/view/stagehand.js';

const Q = new URLSearchParams(location.search);
const LANG = Q.get('lang') === 'en' ? 'en' : 'ko';
const SEED = +(Q.get('seed') || 2611);
const W = 720, MIN_H = 1280, MAX_H = 1600, MAX_K = 2;
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";
const ASSETS = '../../../assets/';

// ---------------------------------------------------------------- the game's canvas rules (src/main.js)
function viewSize() {
  const iw = window.innerWidth || W, ih = window.innerHeight || MIN_H;
  const h = Math.max(MIN_H, Math.min(MAX_H, Math.round((W * ih) / Math.max(1, iw))));
  const cssW = Math.max(1, Math.min(iw, (ih * W) / h));
  const k = Math.round(Math.max(1, Math.min(MAX_K, (cssW * (window.devicePixelRatio || 1)) / W)) * 20) / 20;
  return { W, H: h, k };
}
const VIEW = viewSize();

// ---------------------------------------------------------------- lab state
const clock = { T: (+(Q.get('day') || 2)) * DAY + (+(Q.get('hour') || 9.6)) * HOUR, scale: +(Q.get('speed') || 1) };
const settings = { lifeFarewell: Q.get('farewell') !== '0', missionToasts: true };
const rec = { sounds: [], music: null, events: [], toasts: [], banners: [], says: 0, emotes: 0 };
const LAB = window.__LAB = { ready: false, errors: [], clock, settings, rec, VIEW, rank: +(Q.get('rank') || 1) };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));

const FRAGS = ['ui', 'ui3', 'emotes', 'fx', 'fx_city', 'ground', 'props', 'life_props', 'town', 'life2', 'villagers', 'villagers2', 'characters', 'pets2', 'voice'];
const CHARS = ['player', 'pet_dog', 'pet_cat', 'npc_grandma', 'npc_grandpa', 'npc_aunt', 'npc_uncle', 'npc_kid_girl', 'baby_stroller', 'baby_stroller_pink'];
const ATLASES = ['ui_icons', 'ui3_icons', 'emotes', 'fx_particles', 'ui4_icons', 'props_nature', 'props_decor', 'props_items', 'town_civic', 'town_shops', 'town_homes', 'town_park', 'town_street',
  'life2_wedding', 'life2_memorial', 'life2_decor', 'life2_items'];
const IMAGES = ['ui_panel', 'ui_button_blue', 'ui_button_green', 'ui_button_gray', 'ui_chat_bubble', 'ui_newspaper', 'ui_newspaper_masthead', 'ui_newspaper_logo', 'ui_newspaper_logo_en',
  'ui_newspaper_column', 'ui_newspaper_photo', 'ui_newspaper_divider', 'ui_story_card', 'ui_story_card_news', 'ground_snow'];
const SHEETS = ['fx_hearts', 'fx_music_notes', 'fx_sparkle', 'fx_poof', 'fx_sweat_drops', 'fx_memory_sparkle'];

async function boot() {
  try { await document.fonts.load("800 20px Pretendard"); } catch (e) { /* system font */ }
  const art = new LabArt(ASSETS);
  await art.loadManifests(FRAGS);
  const [tf1, tf2] = await Promise.all(['townfolk', 'townfolk2'].map((f) => fetch(ASSETS + f + '/manifest.json').then((r) => r.json())));
  const tfMan = mergeTownfolkManifests(tf1, tf2);
  LAB.art = art;
  document.getElementById('boot').remove();

  class UIScene extends Phaser.Scene {
    constructor() { super({ key: 'UI', active: false }); }
    create() {
      this.cameras.main.setZoom(VIEW.k).setOrigin(0, 0);
      LAB.ui = this;
      this.hud = makeHud(this);
    }
    // (the HUD text is redrawn only on rendered frames: a Text re-uploads its canvas each time it changes)
    update() { if (this.hud && !(LAB.town && LAB.town.fast)) this.hud.update(); }
  }

  class WorldScene extends Phaser.Scene {
    constructor() { super({ key: 'World' }); }
    preload() {
      art.queue(this.load, { atlases: ATLASES, images: IMAGES.concat(DECOR_KEYS.filter((k) => /^decal_/.test(k))), chars: CHARS, sheets: SHEETS });
      townfolkPreload(this, tfMan, ASSETS);
      this.load.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
    }
    create() {
      townfolkInstall(this, tfMan);
      art.finalize(this, CHARS);
      LAB.world = this;
      buildWorld(this, art);
      const cam = this.cameras.main;
      cam.setBounds(-200, 0, WORLD_W + 400, WORLD_H + 200);
      LAB.zoom = +(Q.get('zoom') || 1.0);
      cam.setZoom(LAB.zoom * VIEW.k);
      cam.centerOn(1150, 1250);
      this.scene.launch('UI');
      setup(this, art, tfMan).catch((e) => { LAB.errors.push('setup: ' + (e && e.stack || e)); console.error(e); });
    }
    update(time, delta) {
      if (!LAB.ready) return;
      // real time (Phaser smooths a slow frame's delta); manual stepping (captures) uses the given step
      const now = performance.now();
      const real = LAB.manualOn ? delta / 1000 : (now - (this.lastNow || now)) / 1000;
      this.lastNow = now;
      const dt = Math.min(0.1, real) * clock.scale;
      clock.T += dt;
      const P = LAB.prof || (LAB.prof = { town: 0, host: 0, bubbles: 0, n: 0 });
      let t0 = performance.now();
      LAB.town.update(dt);
      let t1 = performance.now(); P.town += t1 - t0;
      LAB.host.update(dt);
      t0 = performance.now(); P.host += t0 - t1;
      LAB.hostMs.push(t0 - t1);
      if (LAB.hostMs.length > 600) LAB.hostMs.shift();
      LAB.bubbles.update(dt, time);
      P.bubbles += performance.now() - t0; P.n++;
      if (LAB.tint) LAB.tint.update(((clock.T % DAY) + DAY) % DAY / HOUR);
      if (LAB.voice) LAB.voice.update(dt);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.WEBGL, parent: 'game', width: Math.round(VIEW.W * VIEW.k), height: Math.round(VIEW.H * VIEW.k), backgroundColor: '#dbe6f2',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
    disablePreFX: true, banner: false, fps: { target: 60, smoothStep: true },
    scene: [WorldScene, UIScene],
  });
  game.events.on('postrender', () => { if (window.__GL && window.__GL.cur > 0) window.__GL.endFrame(); });
  LAB.game = game;
}

// ---------------------------------------------------------------- the story, the bodies, the ports
async function setup(scene, art, tfMan) {
  const town = makeStandInTown({ seed: SEED });
  const cam = scene.cameras.main;
  const viewRect = () => cam.worldView;
  const labTown = new LabTown(scene, art, town, { buildings: LAB_BUILDINGS, benches: LAB_BENCHES }, tfMan, { T: () => clock.T, view: viewRect, villagerChars: ['npc_grandma', 'npc_grandpa', 'npc_aunt', 'npc_uncle', 'npc_kid_girl'] });
  const tp = labTown.ports();
  // the chief, 콩이 and 나비 (lab bodies; in the game: the player and the pets)
  const hall = pointOf(art, 'v_hall', 'doorPoint');
  LAB.chief = tp.spawn({ key: 'player', x: hall.x + 120, y: hall.y + 150, held: true, voice: 'chief' });
  LAB.dog = tp.spawn({ key: 'pet_dog', x: hall.x + 170, y: hall.y + 170, held: true, pet: true });
  LAB.cat = tp.spawn({ key: 'pet_cat', x: 1500, y: 1600, held: true, pet: true });
  labTown.bodies.get(LAB.chief).key = 'player';
  labTown.settle(clock.T);
  LAB.town = labTown;
  LAB.tint = Q.get('tint') === '0' ? null : new DayTint(scene, art, LAMPS);

  // VillageVoice (눈꽃말) with a recording backend: the lab counts what would be spoken (headless has no audio)
  const vBackend = { t0: performance.now(), plays: 0, now() { return (performance.now() - this.t0) / 1000; }, has: () => true, play() { this.plays++; return {}; }, stop() {}, setChannelGain() {}, setBusGain() {} };
  let voice = null;
  try { voice = new VillageVoice({ manifest: art.man.voice, backend: vBackend }); } catch (e) { LAB.errors.push('voice: ' + e); }
  LAB.voice = voice; LAB.vBackend = vBackend;
  const bubbles = new LabBubbles(scene, art, { voice });
  LAB.bubbles = bubbles;

  const names = (k) => { const d = art.def(k); return d && d.name ? d.name : { ko: k, en: k }; };
  const ports = nullPorts({
    seed: () => SEED, cid: () => 'storylab', lang: () => LAB.lang || LANG, T: () => clock.T,
    storage: memStorage(), sideKey: 'storyLab.save.v1.story',
    settings: { get: (k) => settings[k] },
    world: {
      buildings: () => LAB_BUILDINGS,
      spots: () => [],
      spot: (id, kind) => { const b = LAB_BYID[String(id).split('#')[0]]; if (!b) return null; const d = art.def(b.key) || {}; const v = (kind === 'door' && d.doorPoint) || (d.gatherPoints && d.gatherPoints[0]) || d.doorPoint; return v ? { x: b.x + v[0], y: b.y + v[1], dir: d.doorDir || 'NE' } : { x: b.x, y: b.y + 60 }; },
      has: (key) => LAB_BUILDINGS.some((b) => b.key === key),
      names,
    },
    people: { roster: () => town.roster, relations: () => town.relations, chronicle: () => Object.assign({}, town.chronicle, { rank: LAB.rank }), prices: () => ({ item_bread: 7, item_fish_cooked: 9, item_coffee: 6 }) },
    town: tp,
    say: (pid, text, emote, dur, opts) => { const b = labTown.bodies.get(pid); rec.says++; rec.lastSay = text; return bubbles.chat(b, text, emote, dur, opts || {}); },
    emote: (pid, key, dur) => { const b = labTown.bodies.get(pid); rec.emotes++; return bubbles.emote(b, key, dur, { story: true }); },
    ui: {
      card: () => {}, banner: (b) => { rec.banners.push(b); LAB.ui && LAB.ui.hud && LAB.ui.hud.banner(b); },
      toast: (t) => { rec.toasts.push(t); LAB.ui && LAB.ui.hud && LAB.ui.hud.toast(t); }, chip: () => {},
    },
    sound: { play: (k) => { rec.sounds.push(k); if (rec.sounds.length > 200) rec.sounds.shift(); }, at: () => {}, music: (k) => { rec.music = k; }, duck: () => {} },
    view: {
      rect: () => { const v = cam.worldView; return { x: v.x, y: v.y, w: v.width, h: v.height }; },
      onScreen: (x, y, m = 0) => { const v = cam.worldView; return x >= v.x - m && x <= v.right + m && y >= v.y - m && y <= v.bottom + m; },
      focus: (x, y, ms) => cam.pan(x, y, ms || 900, 'Sine.easeInOut'),
      zoomPulse: (z, ms) => { const z0 = cam.zoom; scene.tweens.add({ targets: cam, zoom: z0 * z, duration: 380, yoyo: true, hold: Math.max(0, (ms || 2000) - 760), ease: 'Sine.InOut' }); },
    },
    events: { emit: (name, d) => { rec.events.push([name, d]); if (rec.events.length > 300) rec.events.shift(); } },
  });
  ports.open = () => ({});
  LAB.ports = ports;

  // ?tune=farewellFirstAfterMin:0,firstBabyAfterMin:999 (life tuning for staging)
  const life = {};
  for (const kv of (Q.get('tune') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); life[k] = +v; }
  const host = new StoryHost(ports, undefined, { transport: Q.get('inline') === '1' ? 'inline' : undefined, tuning: { life } });
  LAB.host = host;
  LAB.hostMs = [];
  host.on('error', (m) => LAB.errors.push('story: ' + (m && m.msg)));
  rec.cards = [];
  host.on('ui:card', (c) => { rec.cards.push(c); if (rec.cards.length > 40) rec.cards.shift(); });
  const t0 = performance.now();
  const r = await host.start();
  LAB.bootMs = performance.now() - t0;
  LAB.boot = r;
  const view = new StoryLife({
    scene, ui: LAB.ui, art, ports, lang: LANG, screen: () => ({ w: VIEW.W, h: VIEW.H }), chief: LAB.chief, dog: LAB.dog,
    onError: (e) => LAB.errors.push('scene: ' + (e && e.stack || e)),
    happen: () => ({ spots: { market: pointOf(art, 't_cafe', 'doorPoint'), plaza: { x: 1290, y: 1330 }, house: { x: 2380, y: 1880 }, chief: labTown.bodies.get(LAB.chief) }, pets: { dog: LAB.dog, cat: LAB.cat }, kids: kidsNear(1290, 1250, 3), keeper: town.roster.find((r) => r.workKind === 'cafe').pid }),
  });
  host.attachView(view);
  LAB.life = view;
  LAB.ready = true;
}

function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }

function kidsNear(x, y, n) {
  const out = [];
  for (const [pid, b] of LAB.town.bodies) { if (b.kind === 'doll' && b.age === 'child' && !b.inside && !b.held && !b.extra) out.push([Math.hypot(b.x - x, b.y - y), pid]); }
  out.sort((a, b) => a[0] - b[0]);
  return out.slice(0, n).map((e) => e[1]);
}

// ---------------------------------------------------------------- the lab HUD (UI scene, logical px)
function makeHud(ui) {
  const show = Q.get('hud') !== '0';
  const bar = ui.add.container(0, 0).setDepth(9500).setVisible(show);
  const bg = ui.add.rectangle(VIEW.W / 2, 22, VIEW.W - 24, 36, 0x1f2a3c, 0.42).setOrigin(0.5, 0.5);
  const t = ui.add.text(24, 22, '', { fontFamily: FONT, fontSize: '17px', fontStyle: '800', color: '#ffffff', resolution: 2 }).setOrigin(0, 0.5);
  bar.add([bg, t]);
  let toastC = null;
  const hud = {
    update() {
      if (!LAB.ready || !show) return;
      const T = clock.T, day = Math.floor(T / DAY), h = (T % DAY) / HOUR;
      const hh = String(Math.floor(h)).padStart(2, '0'), mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
      const ms = LAB.hostMs.length ? LAB.hostMs.reduce((a, b) => a + b, 0) / LAB.hostMs.length : 0;
      t.setText(`${LAB.lang === 'en' || LANG === 'en' ? 'Day ' + (day + 1) : (day + 1) + '일째'} ${hh}:${mm}  ·  story ${LAB.host.mode} ${ms.toFixed(2)} ms  ·  ${LAB.town.rigs} dolls${rec.music ? '  ·  ♪ ' + rec.music : ''}`);
    },
    toast(text) { hud.banner({ ko: text, en: text }); },
    banner(b) {
      if (toastC) toastC.destroy();
      const lang = LAB.lang || LANG;
      const c = toastC = ui.add.container(VIEW.W / 2, 132).setDepth(9400);
      const main = lang === 'en' ? b.en : b.ko, sub = lang === 'en' ? b.subEn : b.subKo;
      const tx = ui.add.text(0, sub ? -12 : 0, main || '', { fontFamily: FONT, fontSize: '26px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5, 0.5);
      const st = sub ? ui.add.text(0, 20, sub, { fontFamily: FONT, fontSize: '18px', fontStyle: '700', color: '#5d6b80', resolution: 2 }).setOrigin(0.5, 0.5) : null;
      const w = Math.max(tx.width, st ? st.width : 0) + 64, h = sub ? 92 : 64;
      const p = LAB.art.nine(ui, 0, 0, 'ui_panel', w, h);
      c.add([p, tx].concat(st ? [st] : []));
      c.setScale(0.8).setAlpha(0);
      ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
      ui.time.delayedCall(3200, () => { if (c.scene) ui.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => c.destroy() }); });
    },
    setVisible(v) { bar.setVisible(v); },
  };
  return hud;
}

// ---------------------------------------------------------------- the staging API
Object.assign(LAB, {
  lang: LANG,
  shots,
  /** jump the clock (the bodies settle at once; the story core catches up) */
  setT(T) { clock.T = T; LAB.town.settle(T); },
  at(day, hour) { return day * DAY + hour * HOUR; },
  /** camera: centre on (x, y) at world zoom z (the game's zoom, x k) */
  look(x, y, z) { const cam = LAB.world.cameras.main; if (z) { LAB.zoom = z; cam.setZoom(z * VIEW.k); } cam.centerOn(x, y); cam.preRender(); },
  lookAt(id, z, dx = 0, dy = 0) { const b = LAB_BYID[id]; LAB.look(b.x + dx, b.y + dy, z); },
  setLang(l) { LAB.lang = l; LAB.host.onFeed({ t: 'lang', lang: l }); LAB.life.ctx.lang = l; LAB.life.talks.length = 0; },
  hud(v) { LAB.ui.hud.setVisible(v); },
  body: (pid) => LAB.town.bodies.get(pid),
  /** pids of free townsfolk near a point, by age group */
  near(x, y, n, age, r = 900) {
    const out = [];
    for (const [pid, b] of LAB.town.bodies) {
      if (!b.alive || b.held || b.extra || b.kind !== 'doll' || (age && b.age !== age)) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < r) out.push([d, pid]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, n).map((e) => e[1]);
  },
  /** free townsfolk by age group anywhere (for staging casts) */
  folk(n, age, skip = []) {
    const out = [];
    for (const [pid, b] of LAB.town.bodies) { if (out.length >= n) break; if (b.alive && !b.held && !b.extra && b.kind === 'doll' && (!age || b.age === age) && skip.indexOf(pid) < 0) out.push(pid); }
    return out;
  },
  /** move free bodies to stand around a point (a crowd) */
  gather(pids, x, y, r = 160, arc = [0, Math.PI * 2]) {
    pids.forEach((pid, i) => { const b = LAB.town.bodies.get(pid); if (!b) return; const a = arc[0] + ((i + 0.5) / pids.length) * (arc[1] - arc[0]); b.held = false; b.inside = false; b.endPath(); b.x = x + Math.cos(a) * r * (0.75 + (i % 3) * 0.15); b.y = y + Math.sin(a) * r * 0.5; b.goal = 'held-crowd'; b.ambientOff = true; b.setAnim('idle', dirOfV(x - b.x, y - b.y)); });
  },
  preview(kind, data) { return LAB.life.preview(kind, data); },
  feed(ev) { if (ev.t === 'rank') LAB.rank = ev.level; LAB.host.onFeed(ev); },
  /** wait for a story request while the frame loop may be asleep (manual stepping): drain the worker's replies */
  async ask(p) {
    let done = false, v;
    p.then((x) => { done = true; v = x; });
    for (let i = 0; i < 2000 && !done; i++) { await new Promise((r) => setTimeout(r, 5)); LAB.host.drain(); }
    return v;
  },
  q(name, args) { return LAB.ask(LAB.host.query(name, args)); },
  /** perf + memory numbers */
  async stats() {
    const host = LAB.host;
    const core = await LAB.q('stats');
    const tex = LAB.art.textureMiB(LAB.world);
    const ms = LAB.hostMs.slice().sort((a, b) => a - b);
    const q = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : 0);
    let objs = 0;
    for (const s of LAB.game.scene.getScenes(true)) objs += s.children.list.length;
    return {
      mode: host.mode, bootMs: Math.round(LAB.bootMs), people: LAB.boot && LAB.boot.people,
      hostMs: { avg: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : 0, p50: q(0.5), p95: q(0.95), max: q(1) },
      host: host.perf(), core: core && core.core, residents: core && core.residents,
      gl: { last: window.__GL.last, max: window.__GL.max, avg: window.__GL.frames ? window.__GL.calls / window.__GL.frames : 0 },
      fps: LAB.game.loop.actualFps, displayObjects: objs, rigs: LAB.town.rigs,
      textureMiB: { total: +tex.total.toFixed(1), by: Object.fromEntries(Object.entries(tex.by).map(([k, v]) => [k, +v.toFixed(2)])) },
      bubbles: LAB.bubbles.stats, voice: LAB.voice ? Object.assign({ plays: LAB.vBackend.plays }, LAB.voice.stats) : null, life: LAB.life.stats,
      sideChars: host.chars, missingArt: Array.from(LAB.art.missing), errors: LAB.errors.slice(0, 20),
      stage: Object.fromEntries(Object.entries(host.stage.active).map(([k, v]) => [k, v && v.kind])), stageLog: host.stage.log.slice(-12), pending: host.pending.map((b) => b.kind),
    };
  },
  /** draw every loaded texture once (software GL in headless captures converts a texture on its first draw: seconds) */
  warm() {
    const sc = LAB.world, cam = sc.cameras.main, v = cam.worldView, imgs = [];
    const T = sc.textures;
    for (const k of T.getTextureKeys()) { if (k.startsWith('__')) continue; const im = sc.add.image(v.centerX, v.centerY, k).setScale(0.02).setDepth(9e9); imgs.push(im); }
    const t = performance.now();
    LAB.game.step(LAB.mt = (LAB.mt || performance.now()) + 16, 16);
    const gl = LAB.game.renderer.gl, px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (const im of imgs) im.destroy();
    return { textures: imgs.length, ms: Math.round(performance.now() - t) };
  },
  /** manual stepping for deterministic captures: freeze the RAF loop, then advance(ms) runs game frames */
  manual(on) {
    const loop = LAB.game.loop;
    if (on) { loop.sleep(); LAB.mt = LAB.mt || performance.now(); } else loop.wake();
    LAB.manualOn = on;
    // Phaser's TweenManager keeps its own wall clock (Date.now): in manual stepping it follows the stepped time instead
    for (const sc of LAB.game.scene.getScenes(false)) {
      const tw = sc.tweens;
      if (!tw || tw._labPatched) continue;
      const orig = tw.getDelta;
      tw.getDelta = function (t) { if (!LAB.manualOn) return orig.call(this, t); if (this._labStep === LAB.stepId) return 0; this._labStep = LAB.stepId; return LAB.stepMs || 0; };
      tw._labPatched = true;
    }
  },
  /** render the current state (a tiny step with the pictures updated) — before a screenshot */
  renderNow() { LAB.mt += 1; LAB.stepMs = 1; LAB.stepId = (LAB.stepId || 0) + 1; LAB.town.fast = false; LAB.game.step(LAB.mt, 1); },
  /** run `ms` of game time in steps of `step` ms; only the last step renders (fast-forward for captures) */
  async advance(ms, step = 1000 / 30, render = true) {
    let left = ms, sinceYield = 0;
    while (left > 0.01) {
      const d = Math.min(step, left);
      LAB.mt += d; left -= d; sinceYield += d; LAB.stepMs = d; LAB.stepId = (LAB.stepId || 0) + 1;
      const last = left <= 0.01 && render;
      LAB.town.fast = !last;
      if (!last) LAB.game.headlessStep(LAB.mt, d); else LAB.game.step(LAB.mt, d);
      LAB.town.fast = false;
      // let the worker's replies in (as between real frames)
      if (sinceYield >= 250) { sinceYield = 0; await new Promise((r) => setTimeout(r, 0)); }
    }
  },
});

boot().catch((e) => { LAB.errors.push('boot: ' + (e && e.stack || e)); console.error(e); });
