// BUILD-C2 integration suite: the living water, the village voices (눈꽃말), the new title, resident chat.
//   node tools/test/c2.mjs [--only water,voice,title,chat,late]     (run under nohup; ~10 min on a busy box)
// Fixed-step clock for game time (fv_step.mjs); real time only where files must arrive (voice sprites, chat code).
// Screenshots -> docs/previews/screens_v4/c2_*.jpg
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (() => { const i = args.indexOf('--only'); return i >= 0 ? args[i + 1].split(',') : null; })();
const want = (k) => !ONLY || ONLY.includes(k);
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

// a contract-shaped fake of the claude.ai `sample` capability (tools/test/chat/fake_sample.mjs, condensed): streams a
// well-formed resident reply as JSON text
const FAKE_CLAUDE = `(() => {
  const reply = { reply: '어머, 촌장님! 오늘 생선을 그렇게 많이 잡으셨어요? 대단해요~', emote: 'heart', mood: 'happy', affinity: 1,
    memory: '촌장님이 생선을 많이 잡았다고 자랑했다', facts: [], importance: 2, topics: ['생선'], gossip: ['촌장님이 오늘 생선을 많이 잡았대'], lines: [], favor: null };
  const calls = [];
  const run = async (input, o, asJson) => {
    calls.push({ input, o: Object.assign({}, o, { signal: undefined, onText: undefined }) });
    const full = JSON.stringify(reply);
    let sofar = '';
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 20)); sofar += full.slice(i * Math.ceil(full.length / 4), (i + 1) * Math.ceil(full.length / 4)); if (o && o.onText) o.onText({ text: sofar, delta: '' }); }
    return asJson ? JSON.parse(full) : { text: full, truncated: false };
  };
  const sample = (input, o) => run(input, o, false);
  sample.json = (input, o) => run(input, o, true);
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  window.__fakeSampleCalls = calls;
  window.claude = { use: (name) => new Promise((r) => setTimeout(() => r(name === 'sample' ? sample : null), 50)) };
})();`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
let fatal = null;

async function boot(opts = {}) {
  const o = await openPage(browser, srv.url + 'index.html' + (opts.query || ''), { viewport: { width: 390, height: 844 }, init: opts.init });
  const { page } = o;
  if (opts.route) await page.route(opts.route.match, opts.route.fn);
  if (!opts.keep) {
    await page.evaluate((s) => { try { localStorage.clear(); if (s) localStorage.setItem('frostVillage.settings.v1', s); } catch (e) { /* */ } }, opts.settings || null);
    await page.reload({ waitUntil: 'load' });
  }
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  return o;
}
async function enter(page) {
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 240000);
  await sleep(1200);
}
const shot = async (page, n, draw = true) => { if (draw) await render(page, 3); await page.screenshot({ path: path.join(OUT, 'c2_' + n + '.jpg'), type: 'jpeg', quality: 82 }); };

try {
  // ================================================================ title (first visit) + rename + water + voice + chat
  const settings = JSON.stringify({ sound: true, music: true, water: 'high' });
  const { page, log } = await boot({ init: FAKE_CLAUDE, settings });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const adv = (s) => advance(page, s);

  if (want('title')) {
    step('title: document title renamed', (await page.title()) === '행복한 눈꽃마을 이야기 · Snowbloom Village', await page.title());
    const t0 = await waitFor(page, () => window.__FV.title && window.__FV.title.screen && window.__FV.title.screen.state().mode, 60000).then(() => ev(() => window.__FV.title.screen.state())).catch(() => null);
    step('title: the living title (TitleScene) plays the first-run intro', !!t0 && t0.mode === 'intro', t0);
    const tex = await ev(() => Object.keys(window.__FV.game.textures.list).filter((k) => /^ttl_/.test(k)).length);
    step('title: its first paint is there (bake + art textures)', tex >= 3, tex);
    const strings = await ev(async () => { const m = await import('./src/data/strings.js'); m.setLang('en'); const en = m.t('title'); m.setLang('ko'); return { ko: m.t('title'), en }; });
    step('title: strings renamed (ko / en)', strings.ko === '행복한 눈꽃마을 이야기' && strings.en === 'Snowbloom Village', strings);
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'c2_title_intro.jpg'), type: 'jpeg', quality: 82 });
  }
  await enter(page);
  await installStepper(page);
  await adv(1);
  const relTex = await ev(() => Object.keys(window.__FV.game.textures.list).filter((k) => /^ttl_/.test(k)));
  if (want('title')) step('title: every title texture released when the village starts', relTex.length === 0, relTex.slice(0, 5));
  const intro = await ev(() => { try { return JSON.parse(localStorage.getItem('frostVillage.title.v1') || 'null'); } catch (e) { return null; } });
  if (want('title')) step('title: the intro is remembered (the next visit shows the idle title)', !!(intro && intro.introSeen), intro);

  // ---------------- water
  if (want('water')) {
    const w = await ev(() => window.__FV.water());
    step('water: WebGL living sea with the baked shoreline field', w.shader && w.fieldFrom === 'baked' && !w.sea, { shader: w.shader, field: w.fieldFrom, sig: w.sig, buildMs: w.buildMs });
    const reg = await ev(() => { const r = window.__FV.scene.ground.water.region; return { x: r.x, w: r.w }; });
    step('water: the sea covers the west strip (region from WORLD.left)', reg.x === -1400 && reg.w === 7544, reg);
    step('water: setting 물결 품질 = 높음 is used (fish under the surface, no fish tileSprites)', w.quality === 'high' && w.drawsFish && !(await ev(() => !!window.__FV.scene.ground.fish1)), { q: w.quality, drawsFish: w.drawsFish });
    step('water: boats / ice in the sea ride the swell (floaters)', w.floaters >= 8, w.floaters);
    // floaters move with heightAt
    const ys = [];
    for (let i = 0; i < 4; i++) { ys.push(await ev(() => { const f = window.__FV.scene.floaters[0]; window.__FV.teleport(f.x, f.y + 260); return +f.img.y.toFixed(3); })); await adv(0.7); await render(page, 1); }
    step('water: a floater bobs (its y follows heightAt)', new Set(ys).size > 1, ys);
    // the shore tiles are not baked with the old shallows any more
    step('water: shallows and shore foam drawn live (liveShore)', await ev(() => window.__FV.scene.ground.liveShore === true));
    // quality toggle low -> fish tileSprites back
    await ev(() => window.__FV.scene.ground.setWaterQuality('low'));
    const low = await ev(() => ({ q: window.__FV.water().quality, fish: !!window.__FV.scene.ground.fish1 }));
    step('water: 간단 -> low shader, fish tileSprites over it', low.q === 'low' && low.fish, low);
    await ev(() => window.__FV.scene.ground.setWaterQuality('high'));
    // night light
    await ev(() => { const gs = window.__FV.scene; gs._waterDark = 0; gs.ground.water.setLighting({ dark: 0.6 }); });
    step('water: night lighting dims glints (setLighting)', await ev(() => window.__FV.scene.ground.water._light.dark === 0.6 && window.__FV.scene.ground.water._light.glint < 0.6));
    await ev(() => window.__FV.scene.ground.water.setLighting({ dark: 0 }));
    // the sea bed: amb_sea_waves loaded, amb_sea never
    const amb = await waitFor(page, () => window.__FV.game.cache.audio.exists('amb_sea_waves'), 60000).then(() => true).catch(() => false);
    const old = await ev(() => window.__FV.game.cache.audio.exists('amb_sea'));
    step('water: audio5 amb_sea_waves loaded after the title; the old amb_sea is not downloaded', amb && !old, { amb, old });
    await adv(1);
    const bed = await ev(() => { const s = window.__FV.scene.sys.game.sound.sounds.find((x) => x.key === 'amb_sea_waves'); return s ? { playing: s.isPlaying, loop: s.loop } : null; });
    step('water: the rolling sea bed plays (loop)', !!bed && bed.playing && bed.loop, bed);
    const sand = await ev(() => Object.keys(window.__FV.game.cache.audio.entries.entries).filter((k) => /^sfx_sand_step|^amb_beach|^bgm_beach/.test(k)));
    step('water: no sand steps / beach sounds in the snowy village', sand.length === 0, sand);
    // pier contacts + wake sheets on demand
    await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
    await adv(2);
    const dock = await ev(() => { const gs = window.__FV.scene; const bh = gs.boathouse; if (bh && !bh.boat && bh.setBoat) bh.setBoat(1, true); return !!(gs.boathouse && gs.boathouse.boat); });
    if (dock) {
      const b = await ev(() => { const bt = window.__FV.scene.boathouse.boat; bt.t = 0; bt.state = 'dock'; window.__FV.teleport(bt.x - 40, bt.y + 200); return { x: bt.x, y: bt.y }; });
      let moved = null;
      // (the camera only follows the player when a frame is drawn: render, or the boat counts as off screen)
      await render(page, 3);
      for (let i = 0; i < 40 && !moved; i++) { await adv(0.5); await render(page, 1); moved = await ev(() => { const bt = window.__FV.scene.boathouse.boat; return bt.state === 'out' ? { state: bt.state, hull: !!bt.hull, rings: window.__FV.scene.ground.water._pkN } : null; }); }
      step('water: the boat rows out with a hull collar and rings in the water', !!moved && moved.hull, moved);
      await ev(() => { const bt = window.__FV.scene.boathouse.boat; window.__FV.teleport(bt.x, bt.y + 230); });
      await render(page, 3);
      for (let i = 0; i < 6; i++) { await adv(0.5); await render(page, 1); }
      const wk = await waitFor(page, () => { const gs = window.__FV.scene; const L = gs.load; if (L && L.isLoading()) L.update(); window.__step.run(0.25); return [...new Set(['fx_wake_v2', 'fx_wake_v2_e', 'fx_wake_v2_ne', 'fx_wake_v2_s', 'fx_wake_v2_n'])].some((k) => gs.textures.exists(k)); }, 30000).then(() => true).catch(() => false);
      step('water: the boat\'s V wake sheet is fetched on demand (WaterSheets)', wk);
      await shot(page, 'water_boat');
    } else step('water: boathouse for the boat check', false, 'no boathouse');
    // two zooms of the new sea
    await ev(() => { window.__FV.camera && window.__FV.camera(); window.__FV.teleport(935, 560); window.__FV.zoom(1.0); });
    await adv(3); await render(page, 4);
    await shot(page, 'water_zoom1');
    await ev(() => window.__FV.zoom(0.6));
    await adv(3);
    await shot(page, 'water_zoom06');
    await ev(() => window.__FV.zoom(1.0));
    await adv(2);
  }

  // ---------------- voice
  if (want('voice')) {
    const v0 = await ev(() => window.__FV.voice());
    step('voice: VillageVoice attached (Web Audio backend, max 2 voices)', !!v0 && v0.backend && v0.maxVoices === 2, v0);
    for (let i = 0; i < 6; i++) await ev(() => window.__FV.lifeEvent('moveIn'));
    await adv(6);
    // chatter until voice sprites arrive (real time: the late loader) and are heard
    let spoken = 0, maxSpk = 0;
    for (let i = 0; i < 40 && spoken < 3; i++) {
      await ev(() => { window.__FV.lifeEvent('chat'); const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); });
      await adv(0.6);
      await sleep(350);
      const v = await ev(() => window.__FV.voice());
      spoken = v.stats.spoken || 0;
      maxSpk = Math.max(maxSpk, v.speaking.length);
    }
    const v1 = await ev(() => window.__FV.voice());
    step('voice: residents speak 눈꽃말 (voice sprites fetched lazily, lines spoken)', spoken > 0, { spoken, requested: v1.requested.length, notLoaded: v1.stats.notLoaded });
    step('voice: never more than 2 voices at once', maxSpk <= 2, maxSpk);
    await shot(page, 'voice_chatter');
    // volume 0: quiet (no new lines spoken, no old babble)
    await ev(() => { window.__FV.scene.voice.setVolume(0); });
    const s0 = (await ev(() => window.__FV.voice())).stats.spoken;
    for (let i = 0; i < 4; i++) { await ev(() => window.__FV.lifeEvent('chat')); await adv(1); }
    const s1 = (await ev(() => window.__FV.voice())).stats.spoken;
    step('voice: 주민 목소리 끔 (volume 0) -> nothing spoken', s1 === s0, { s0, s1 });
    await ev(() => { window.__FV.scene.voice.setVolume(1); });
    // the info card of a townsperson is not spoken
    const silentOk = await ev(() => { const B = window.__FV.scene.life.bubbles, r = window.__FV.scene.life.residents.find((x) => !x.isPet); if (!B || !r) return null; const before = window.__FV.scene.voice.stats.spoken + window.__FV.scene.voice.stats.notLoaded + window.__FV.scene.voice.stats.queued; B.chat(r, 'card', null, 1, { silent: true }); const after = window.__FV.scene.voice.stats.spoken + window.__FV.scene.voice.stats.notLoaded + window.__FV.scene.voice.stats.queued; return before === after; });
    step('voice: a silent card (opts.silent) is not spoken', silentOk === true, silentOk);
  }

  // ---------------- chat
  if (want('chat')) {
    // the persona list of the game matches src/chat
    const keys = await ev(async () => { const a = await import('./src/systems/ResidentChat.js'); const b = await import('./src/chat/personas.js'); return { game: a.CHAT_KEYS.slice().sort().join(), chat: Object.keys(b.PERSONAS).sort().join() }; });
    step('chat: the game\'s chat roster matches the persona cards', keys.game === keys.chat);
    if (!(await ev(() => window.__FV.scene.life.residents.some((r) => window.__FV.scene.residentChat.canChat(r))))) { for (let i = 0; i < 4; i++) await ev(() => window.__FV.lifeEvent('moveIn')); await adv(6); }
    // tap a resident -> the button
    const tapped = await ev(() => { const gs = window.__FV.scene; const r = gs.life.residents.find((x) => gs.residentChat.canChat(x) && !x.lod && !x.seat && !x.event); if (!r) return null; window.__FV.teleport(r.x + 60, r.y + 80); return { key: r.key, x: r.x, y: r.y }; });
    await adv(0.3); await render(page, 2);
    const k = tapped ? await ev(([x, y]) => window.__FV.tapWorld(x, y - 30), [tapped.x, tapped.y]) : null;
    await adv(0.2); await render(page, 2);
    step('chat: tapping a resident offers 수다 떨기', !!k && (await ev(() => window.__FV.chatButton === true)), { k });
    await shot(page, 'chat_button');
    // press the button (UI scene) -> the sheet
    const btn = await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); const c = ui.chatBtn; const k2 = window.__FV.game.scale.displayScale; return c && c.visible ? { x: c.x, y: c.y } : null; });
    if (btn) {
      const cv = await page.$('canvas'); const bb = await cv.boundingBox(); const sx = bb.width / 720;
      await page.touchscreen.tap(bb.x + btn.x * sx, bb.y + btn.y * sx);
    }
    const opened = await waitFor(page, () => window.__FV.chat() && window.__FV.chat().open, 30000).then(() => true).catch(() => false);
    await sleep(1600);
    const st1 = await ev(() => ({ chat: window.__FV.chat(), paused: window.__FV.game.scene.isPaused('Game'), kb: window.__FV.game.input.keyboard.enabled }));
    step('chat: the 수다 sheet opens (chat code loaded on demand), the village waits, the keyboard is the sheet\'s', opened && st1.paused && st1.kb === false, st1);
    step('chat: the claude.ai sample capability lights up AI mode', st1.chat && st1.chat.mode === 'ai', st1.chat && st1.chat.mode);
    await page.fill('.fc-root input', '안녕! 오늘 생선 많이 잡았어');
    await page.keyboard.press('Enter');
    const replied = await waitFor(page, () => document.querySelectorAll('.fc-root .fc-bubble, .fc-root [class*="fc-msg"]').length >= 3, 20000).then(() => true).catch(() => false);
    await sleep(800);
    const calls = await ev(() => (window.__fakeSampleCalls || []).map((c) => c.o));
    step('chat: a message gets an AI reply (sample called once, quick tier, cache off)', replied && calls.length === 1 && calls[0].modelTier === 'quick' && calls[0].cache === false, { replied, calls });
    await page.screenshot({ path: path.join(OUT, 'c2_chat_panel.jpg'), type: 'jpeg', quality: 84 });
    await page.click('.fc-root .fc-close');
    await sleep(500);
    const st2 = await ev(() => ({ chat: window.__FV.chat(), paused: window.__FV.game.scene.isPaused('Game'), kb: window.__FV.game.input.keyboard.enabled }));
    step('chat: closing resumes the village and gives the keyboard back', !st2.chat.open && !st2.paused && st2.kb === true, st2);
    const rec = await ev(() => { const r = JSON.parse(localStorage.getItem('frostVillage.save.v1.chat') || 'null'); window.__FV.save(); const s = JSON.parse(localStorage.getItem('frostVillage.save.v1') || 'null'); return { v: r && r.v, cid: r && r.cid, saveCid: s && s.cid, bytes: (localStorage.getItem('frostVillage.save.v1.chat') || '').length, chatV: r && r.chat && r.chat.v, gameBytes: (localStorage.getItem('frostVillage.save.v1') || '').length }; });
    step('chat: the chat village is saved with the game save (versioned record tied by cid)', rec.v === 1 && rec.cid && rec.cid === rec.saveCid && rec.chatV >= 2 && rec.bytes > 200, rec);
    step('chat: the game save itself stays small (chat not in the 6 KB autosave)', rec.gameBytes <= 6144, rec.gameBytes);
    const talks = st2.chat.talks;
    // reload: the memory is back
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
    const idle = await waitFor(page, () => window.__FV.title && window.__FV.title.screen && window.__FV.title.screen.state().mode, 60000).then(() => ev(() => window.__FV.title.screen.state())).catch(() => null);
    // (the idle title opens on the stage this player saw last time and grows to the save's stage once its pack is in)
    const grown = idle ? await waitFor(page, () => { const s = window.__FV.title.screen.state(); return s.stage >= s.saveStage; }, 60000).then(() => ev(() => window.__FV.title.screen.state())).catch(() => null) : null;
    if (want('title')) step('title: a returning player gets the idle title of their stage (no intro; grows from the last one seen)', !!idle && idle.mode !== 'intro' && idle.saveStage >= 2 && !!grown && grown.stage >= 2, { first: idle && idle.stage, grown: grown && grown.stage, saveStage: idle && idle.saveStage });
    await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'c2_title_idle.jpg'), type: 'jpeg', quality: 82 });
    await enter(page);
    await installStepper(page);
    await adv(1);
    const back = await ev(() => window.__FV.scene.residentChat.ensure().then(() => window.__FV.chat()));
    step('chat: after a reload the residents remember the talk', back.talks >= talks && back.talks > 0, { before: talks, after: back.talks });
    // reset -> the chat record goes with the save
    await ev(() => window.__FV.scene.resetProgress());
    await sleep(2500);
    const gone = await ev(() => localStorage.getItem('frostVillage.save.v1.chat'));
    step('chat: a reset drops the chat village too', gone === null, gone && gone.length);
  }
  step('no page errors', !log.errors.length, log.errors.slice(0, 3));
  await page.context().close();

  // ================================================================ late water textures: the old sea, then the living one
  if (want('late')) {
    let held = true;
    const o2 = await boot({ route: { match: /assets\/water\/(water_|field_)/, fn: async (route) => { while (held) await new Promise((r) => setTimeout(r, 100)); route.continue(); } } });
    const p2 = o2.page;
    await enter(p2);
    const w0 = await p2.evaluate(() => window.__FV.water());
    step('late: water textures not there yet -> the old sea, waiting', !w0.shader && w0.sea && w0.wait, w0);
    held = false;
    const up = await waitFor(p2, () => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return window.__FV.water().shader; }, 60000).then(() => true).catch(() => false);
    const w1 = await p2.evaluate(() => window.__FV.water());
    step('late: they arrive -> the living sea replaces the old one (no tileSprite left)', up && w1.shader && !w1.sea && w1.floaters >= 8, { shader: w1.shader, sea: w1.sea, floaters: w1.floaters });
    step('late: no page errors', !o2.log.errors.length, o2.log.errors.slice(0, 3));
    await o2.ctx.close();
  }
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
const pass = results.filter((r) => r.ok).length;
console.log(`\nc2: ${pass}/${results.length} passed${fatal ? ' (FATAL)' : ''}`);
await browser.close();
await srv.close();
process.exit(pass === results.length && !fatal ? 0 : 1);
