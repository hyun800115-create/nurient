// incidents_runtime lab runner (Playwright, one Chromium at a time, fixed-step clock). Run it in groups so that each
// run stays under 2 minutes; the numbers file merges the groups:
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=smoke
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=fire
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=ruin
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=chase
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=wanted,station
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=scuffle,queue,window
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=moving
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=zoom,desktop,english,night
//   nice -n 15 node tools/test/incidents_lab/run_lab.mjs --only=transient,drill,toggle
//   [--no-gif] skips the GIFs
// Phone 390 × 844 at DPR 3 for the stills (GIF frames at DPR 1.5, then 360 px wide), desktop 1280 × 800.
// Captures: docs/previews/incidents_lab_*.png|gif and docs/previews/incidents_lab_numbers.json (logic ms per tick,
// draw calls, display objects, texture MiB, transient MiB, placeholders, console errors). Exit 1 on errors.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join('/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_incidents', 'frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();
const NUMS_FILE = path.join(OUT, 'incidents_lab_numbers.json');
const NUM = fs.existsSync(NUMS_FILE) ? JSON.parse(fs.readFileSync(NUMS_FILE, 'utf8')) : {};
const SHOTS = [];
let SRV = null, FAIL = 0, LASTPAGE = null;

// ---------------------------------------------------------------------------------------------------- page helpers
const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr, lang = 'ko') {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/incidents_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  LASTPAGE = page;
  await page.waitForFunction(() => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length > 3), null, { timeout: 90000 });
  await page.evaluate((lang) => {
    const L = window.__LAB, g = L.game;
    L.lang = lang;
    g.loop.sleep();
    let T = g.loop.time || performance.now();
    const DT = 1000 / 60;
    const guard = (fn) => { try { fn(); } catch (e) { L.errors.push('frame: ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : e)); throw e; } };
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); guard(() => { for (let i = 0; i < n; i++) { T += DT; g.headlessStep(T, DT); } }); };
    L.frame = () => { T += DT; guard(() => g.step(T, DT)); };
    const W = L.scene;
    L.setup = (o) => W.setup(o || {});
    L.look = (x, y, z) => { W.look(x, y, z); W.cameras.main.preRender(); W.ground.bakeAll(); };
    L.m = () => W.host.model;
    L.v = () => W.host.view;
    L.src = () => W.host.source;
    L.at = (i, j) => L.layout.L(i, j);
    L.b = (id) => W.town.building(id);
    /** start an incident on the lab's ScriptedSource now */
    L.start = (kind, o) => { const id = W.host.source.start(kind, Object.assign({ T: L.T }, o || {})); for (const ev of W.host.source.drain()) W.host.model.feed(ev, L.T, W.host.env); W.host.flush(); return id; };
    L.move = (op, o) => { const r = W.host.source.move(op, Object.assign({ T: L.T }, o || {})); for (const ev of W.host.source.drain()) W.host.model.feed(ev, L.T, W.host.env); W.host.flush(); return r; };
    L.jump = (T) => { L.T = T; W.snapNight(); };
    L.loading = () => L.art.loading;
    L.texMiB = () => {
      const tex = g.textures.list;
      let all = 0, mod = 0;
      const per = {};
      for (const k in tex) {
        if (k.startsWith('__')) continue;
        const src = tex[k].source && tex[k].source[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        all += b;
        if (L.MODULE_TEX.test(k)) { mod += b; per[k] = +(b / 1048576).toFixed(2); }
      }
      return { all: +(all / 1048576).toFixed(1), module: +(mod / 1048576).toFixed(1), per };
    };
    L.stats = () => {
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const ms = L.ms.slice().sort((a, b) => a - b), mm = L.msModel.slice().sort((a, b) => a - b);
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      const t = L.texMiB();
      const v = W.host.view;
      return {
        texMiB: t.all, moduleMiB: t.module, msHost: +avg(ms).toFixed(4), p95Host: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(4) : 0,
        msModel: +avg(mm).toFixed(4), p95Model: mm.length ? +mm[Math.floor(mm.length * 0.95)].toFixed(4) : 0, maxModel: mm.length ? +mm[mm.length - 1].toFixed(3) : 0,
        view: v ? v.info() : null, worldObjects: objs(W), uiObjects: objs(L.ui), placeholders: Array.from(L.Assets.warned), errors: L.errors.slice(),
        dolls: W.dolls.live, stats: W.host.api.stats(),
      };
    };
    L.drawCalls = (n = 20) => { const C = window.__GLC; const d0 = C.draw; for (let i = 0; i < n; i++) L.frame(); return +((C.draw - d0) / n).toFixed(1); };
  }, lang);
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function settle(page) { await page.waitForFunction(() => window.__LAB.loading() === 0, null, { timeout: 60000 }); await run(page, 0.05); }
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
const quant = (file, maxW) => { try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; f=min(1, int(sys.argv[2])/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG); im.save(sys.argv[1], optimize=True)', file, String(maxW)]); } catch (e) { /* keep */ } };
async function shot(page, name, maxW = 780) {
  await ev(page, () => window.__LAB.scene.ground.bakeAll());
  await frames(page, 3);
  const file = path.join(OUT, 'incidents_lab_' + name + '.png');
  await page.screenshot({ path: file });
  quant(file, maxW);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
/** a GIF: `n` frames, `step` s of game time apart, played at `fps` */
async function gif(page, name, n, step, hook, fps, width = 360) {
  if (NOGIF) { for (let i = 0; i < n; i++) { if (hook) await hook(i); await run(page, step); } return null; }
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => window.__LAB.scene.ground.update(2));
    await frames(page, 1);
    await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png') });
  }
  const file = path.join(OUT, 'incidents_lab_' + name + '.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps || Math.round(1 / step)), '-i', path.join(dir, 'f%03d.png'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
async function numbers(page, key, extra = {}) {
  const st = await ev(page, () => window.__LAB.stats());
  st.drawCalls = await ev(page, () => window.__LAB.drawCalls());
  NUM[key] = Object.assign(st, extra);
  if (st.errors.length || st.placeholders.length) { FAIL++; console.log('!! ' + key + ' errors', st.errors.slice(0, 5), 'placeholders', st.placeholders.slice(0, 5)); }
  return st;
}
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

/** the camera on a building's street side (buildings face screen down-left) */
const lookAt = (page, id, z = 0.85, dx = -150, dy = 40) => ev(page, ({ id, z, dx, dy }) => { const L = window.__LAB; const b = L.b(id); L.look(b.x + dx, b.y + dy, z); }, { id, z, dx, dy });

// ---------------------------------------------------------------------------------------------------- scenarios
const S = {};

S.smoke = async (B) => {
  const { page, log } = await boot(B, PHONE, 2);
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_flower'); L.look(b.x - 200, b.y + 60, 0.7); });
  await run(page, 2);
  await shot(page, 'smoke');
  const st = await numbers(page, 'smoke', { what: 'the town corner, no incident, zoom 0.7' });
  console.log(JSON.stringify(st, null, 1).slice(0, 1600));
  console.log('log errors', log.errors.slice(0, 10), log.missing404.slice(0, 10));
  if (log.errors.length) FAIL++;
  await page.context().close();
};

/** fire at the flower shop: smoke + alarm + crowd, the truck, three hoses, out + applause */
S.fire = async (B) => {
  let { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_flower', 0.85, -170, 60);
  await ev(page, () => window.__LAB.start('fire', { building: 't_flower', outcome: 'minor', smoke: 9, travel: 14, spray: 22 }));
  await settle(page);
  await run(page, 5.5);
  await shot(page, 'fire_smoke');
  await numbers(page, 'fire_smoke', { what: 'smoke: window fire, the family out, a neighbour at the alarm post, onlookers' });
  await run(page, 6.5);
  await shot(page, 'fire_truck');
  await run(page, 9);
  await shot(page, 'fire_spray');
  const st = await numbers(page, 'fire_spray', { what: 'three firefighters spraying (Rope jets, mist, steam), zoom 0.85, phone DPR 3' });
  await run(page, 9);
  await shot(page, 'fire_out');
  NUM.fire_events = await ev(page, () => window.__LAB.events.filter((e) => /^inc:|^stage:/.test(e.t)).map((e) => e.T + ' ' + e.t + ' ' + (e.phase || e.op || e.kind || '') + (e.outcome ? ' ' + e.outcome : '')));
  NUM.fire_events_lines = await ev(page, () => window.__LAB.toasts.slice());
  await page.context().close();
  // the GIF (DPR 1.5): from the first smoke to the applause
  ({ page } = await boot(B, PHONE, 1.5));
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_flower', 0.8, -170, 60);
  await ev(page, () => window.__LAB.start('fire', { building: 't_flower', outcome: 'minor', smoke: 9, travel: 14, spray: 22 }));
  await settle(page);
  await gif(page, 'fire', 90, 0.5, null, 10);
  await page.context().close();
  return st;
};

/** a cottage lost to a fire: ruin -> demolition -> site -> rebuilt one level better (house_a -> house_b) */
S.ruin = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 'vh1', 0.9, -120, 40);
  await ev(page, () => { const L = window.__LAB; L.start('fire', { building: 'vh1', outcome: 'ruin', smoke: 6, travel: 10, spray: 16, ruinWait: 44, demolish: 120, construct: 130, better: true }); });
  await settle(page);
  await run(page, 31);
  await settle(page);
  await run(page, 5);
  await settle(page);
  await shot(page, 'ruin_family');
  await numbers(page, 'ruin_family', { what: 'lost: the charred house, the family safe, the street claps for the crew (fire art still in)' });
  await run(page, 26);
  await settle(page);
  await run(page, 3);
  await shot(page, 'ruin');
  await numbers(page, 'ruin', { what: 'the ruin smoulders behind its insurance sign (fire art out, rebuild art in)' });
  await run(page, 16);
  await settle(page);
  await run(page, 14);
  await shot(page, 'demolition');
  await numbers(page, 'demolition', { what: 'fence ring, excavator digging over the fence, dump truck loading' });
  await gif(page, 'demolition', 40, 0.25, null, 10);
  await run(page, 70);
  await shot(page, 'demolition_rubble');
  await run(page, 50);
  await settle(page);
  await run(page, 50);
  await shot(page, 'site');
  await run(page, 84);
  await settle(page);
  await run(page, 1.5);
  await shot(page, 'rebuilt');
  await numbers(page, 'rebuilt', { what: 'rebuilt one level better: house_a -> house_b, ribbon garland, flowers' });
  NUM.ruin_events = await ev(page, () => window.__LAB.events.filter((e) => e.t === 'inc:fire').map((e) => e.T + ' ' + e.state + ' lv' + (e.level || 0)));
  NUM.ruin_cards = await ev(page, () => window.__LAB.cards.map((c) => c.text));
  await page.context().close();
};

/** the bun thief: out of the toy shop, the chase around the fountain, the arrest */
S.chase = async (B) => {
  let { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_toy', 0.8, -280, 40);
  const id = await ev(page, () => window.__LAB.start('theft', { place: 't_toy', outcome: 'caught', away: 't_fountain', station: 40 }));
  await settle(page);
  await run(page, 1.6);
  await shot(page, 'chase_act');
  await run(page, 7);
  await shot(page, 'chase_run');
  await numbers(page, 'chase', { what: 'the chase: the thief flees, the officer runs after (bgm_chase)', id });
  await run(page, 7.6);
  await shot(page, 'chase_arrest');
  await run(page, 3.2);
  await shot(page, 'chase_arrest2');
  NUM.chase_events = await ev(page, () => window.__LAB.events.filter((e) => /^inc:|^stage:/.test(e.t)).map((e) => e.T + ' ' + e.t + ' ' + (e.phase || e.op || e.kind || '')));
  NUM.chase_music = await ev(page, () => window.__LAB.music.slice());
  await page.context().close();
  ({ page } = await boot(B, PHONE, 1.5));
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_toy', 0.72, -300, 60);
  await ev(page, () => window.__LAB.start('theft', { place: 't_toy', outcome: 'caught', away: 't_fountain', station: 40 }));
  await settle(page);
  await gif(page, 'chase', 64, 0.4, null, 10);
  await page.context().close();
};

/** not caught: three posters (silhouettes), the chief's E12 flips one to the face; the big poster */
S.wanted = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); for (const [p, k] of [['t_toy', 0], ['t_cloth', 1], ['t_rest', 2]]) L.start('theft', { place: p, outcome: 'escaped', away: 't_fountain', tipDays: 3 }); });
  await settle(page);
  await run(page, 50);
  await ev(page, () => { const L = window.__LAB; const w = L.m().wanted.list(); L.scene.host.onFeed({ t: 'mission:done', code: 'E12', key: w[1] ? w[1].inc : w[0].inc }); const B = L.layout.WANTED_BOARD; L.look(B.x, B.y - 60, 1.1); });
  await settle(page);
  await run(page, 2);
  await shot(page, 'wanted_board');
  await numbers(page, 'wanted', { what: 'the wanted board: two silhouettes + one tipped face, a neighbour reading' });
  await ev(page, () => { const L = window.__LAB; const B = L.layout.WANTED_BOARD; L.scene.host.onFeed({ t: 'tap', x: B.x, y: B.y - 60 }); });
  await run(page, 2);
  await shot(page, 'wanted_poster');
  await ev(page, () => { const L = window.__LAB; const B = L.layout.WANTED_BOARD; L.scene.host.onFeed({ t: 'tap', x: B.x, y: B.y - 60 }); const v = L.v(); const w = L.m().wanted.list().find((x) => !x.anon); if (w) v.board.open(w.slot); });
  await run(page, 2);
  await shot(page, 'wanted_poster_face');
  NUM.wanted_events = await ev(page, () => window.__LAB.events.filter((e) => e.t === 'inc:wanted').map((e) => e.op + ' ' + e.slot + (e.anon ? ' anon' : '')));
  await page.context().close();
};

/** the cosy cell (cutaway) and the apology at the station door */
S.station = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); const P = L.layout.POLICE; L.look(P.x - 50, P.y - 80, 1.2); L.start('theft', { place: 't_toy', outcome: 'caught', away: 't_fountain', station: 30 }); });
  await settle(page);
  await run(page, 40);
  await settle(page);
  await run(page, 2);
  await shot(page, 'station_cell');
  await numbers(page, 'station', { what: 'the police station cutaway: the culprit in the cosy cell, the desk officer, the car in its bay' });
  await run(page, 9);
  await settle(page);
  await run(page, 3.5);
  await shot(page, 'station_apology');
  NUM.station_events = await ev(page, () => window.__LAB.events.filter((e) => /^inc:|^stage:/.test(e.t)).map((e) => e.T + ' ' + e.t + ' ' + (e.phase || e.op || e.kind || '') + (e.outcome ? ' ' + e.outcome : '')));
  await page.context().close();
};

S.scuffle = async (B) => {
  let { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_fountain'); L.look(b.x - 140, b.y + 90, 1.0); L.start('scuffle', { place: 't_fountain' }); });
  await settle(page);
  await run(page, 4.5);
  await shot(page, 'scuffle_cloud');
  await numbers(page, 'scuffle', { what: 'the dust cloud (layered around the fight anims, or the simple cloud)' });
  await run(page, 8.5);
  await shot(page, 'scuffle_separate');
  await run(page, 6);
  await shot(page, 'scuffle_shake');
  await page.context().close();
  ({ page } = await boot(B, PHONE, 1.5));
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_fountain'); L.look(b.x - 140, b.y + 90, 0.95); L.start('scuffle', { place: 't_fountain' }); });
  await settle(page);
  await gif(page, 'scuffle', 50, 0.4, null, 10);
  await page.context().close();
};

S.queue = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_cafe'); L.look(b.x - 60, b.y + 120, 1.05); L.start('queue', { place: 't_cafe', outcome: 'apology' }); });
  await settle(page);
  await run(page, 5.2);
  await shot(page, 'queue_argue');
  await numbers(page, 'queue', { what: 'a queue squabble at the café door' });
  await run(page, 6.5);
  await shot(page, 'queue_sorry');
  await page.context().close();
};

S.window = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); L.look(L.b('lotH2').x - 160, L.b('lotH2').y + 80, 1.0); L.start('window', { building: 'lotH2', place: 't_play', wait: 40 }); });
  await settle(page);
  await run(page, 3.0);
  await shot(page, 'window_throw');
  await run(page, 2.6);
  await shot(page, 'window_who');
  await numbers(page, 'window', { what: 'a snowball on a window; the owner wonders' });
  await run(page, 40);
  await settle(page);
  await run(page, 5.5);
  await shot(page, 'window_apology');
  await page.context().close();
};

S.moving = async (B) => {
  let { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); L.look(L.b('lotH4').x - 170, L.b('lotH4').y + 120, 0.95); L.move('out', { home: 'lotH4#1' }); });
  await settle(page);
  await run(page, 10);
  await shot(page, 'moving_out');
  await run(page, 30);
  await ev(page, () => window.__LAB.move('in', { home: 'lotH4#1', n: 3 }));
  await settle(page);
  await run(page, 9);
  await shot(page, 'moving_in');
  await numbers(page, 'moving', { what: 'moving in: truck ramp, movers carrying boxes, the family arriving' });
  await run(page, 10);
  await shot(page, 'moving_in_welcome');
  NUM.moving_cards = await ev(page, () => window.__LAB.cards.map((c) => c.text));
  await page.context().close();
  ({ page } = await boot(B, PHONE, 1.5));
  await ev(page, () => { const L = window.__LAB; L.setup({}); L.look(L.b('lotH3').x - 170, L.b('lotH3').y + 120, 0.9); L.move('in', { home: 'lotH3#1', n: 3 }); });
  await settle(page);
  await gif(page, 'moving', 60, 0.5, null, 10);
  await page.context().close();
};

/** readability: the fire with hoses at zoom 0.6 and 1.2 */
S.zoom = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_hair', 0.6, -170, 60);
  await ev(page, () => window.__LAB.start('fire', { building: 't_hair', outcome: 'minor', smoke: 6, travel: 10, spray: 30 }));
  await settle(page);
  await run(page, 24);
  await shot(page, 'zoom06');
  await numbers(page, 'zoom06', { what: 'fire with hoses, zoom 0.6, phone DPR 3' });
  await lookAt(page, 't_hair', 1.2, -150, 20);
  await run(page, 1);
  await shot(page, 'zoom12');
  await numbers(page, 'zoom12', { what: 'fire with hoses, zoom 1.2, phone DPR 3' });
  await page.context().close();
};

S.desktop = async (B) => {
  const { page } = await boot(B, DESK, 1);
  await ev(page, () => { const L = window.__LAB; L.setup({}); });
  await lookAt(page, 't_cloth', 0.8, -220, 40);
  await ev(page, () => { const L = window.__LAB; L.start('fire', { building: 't_rest', outcome: 'minor', smoke: 6, travel: 10, spray: 30 }); L.start('theft', { place: 't_toy', outcome: 'caught', away: 't_fountain' }); });
  await settle(page);
  await run(page, 20);
  await shot(page, 'desktop', 1280);
  await numbers(page, 'desktop', { what: 'desktop 1280 × 800: a fire on stage, a theft off stage at the same time' });
  await page.context().close();
};

S.english = async (B) => {
  const { page } = await boot(B, PHONE, 3, 'en');
  await ev(page, () => { const L = window.__LAB; L.setup({ lang: 'en' }); const b = L.b('t_fountain'); L.look(b.x - 140, b.y + 90, 1.0); L.start('scuffle', { place: 't_fountain' }); });
  await settle(page);
  await run(page, 2.2);
  await shot(page, 'english');
  await page.context().close();
};

S.night = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({ T: 600 * 5 + 25 * 20.5 }); });
  await lookAt(page, 't_flower', 0.85, -170, 60);
  await ev(page, () => window.__LAB.start('fire', { building: 't_flower', outcome: 'minor', smoke: 6, travel: 10, spray: 30 }));
  await settle(page);
  await run(page, 22);
  await shot(page, 'night');
  await page.context().close();
};

/** texture memory: before, during a fire, during a chase, 15 s after each ends */
S.transient = async (B) => {
  const { page } = await boot(B, PHONE, 2);
  const tex = async (k) => { const t = await ev(page, () => window.__LAB.texMiB()); NUM.transient = NUM.transient || {}; NUM.transient[k] = { all: t.all, module: t.module }; return t; };
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_flower'); L.look(b.x - 170, b.y + 60, 0.85); });
  await run(page, 1); await tex('before');
  await ev(page, () => window.__LAB.start('fire', { building: 't_flower', outcome: 'minor', smoke: 6, travel: 10, spray: 20 }));
  await settle(page); await run(page, 20); await tex('fire');
  await run(page, 45); await settle(page); await tex('fire_end+30s');
  await ev(page, () => window.__LAB.start('theft', { place: 't_toy', outcome: 'caught', away: 't_fountain', station: 20 }));
  await settle(page); await run(page, 12); await tex('chase');
  await run(page, 80); await settle(page); await tex('chase_end');
  NUM.transient.artLog = await ev(page, () => window.__LAB.art.log.slice(-20));
  console.log(JSON.stringify(NUM.transient, null, 1));
  await page.context().close();
};

S.drill = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, () => { const L = window.__LAB; L.setup({ saved: { v: 1, police: 1, drill: 0 } }); const P = L.layout.FIRE_PAD; L.look(P.x + 120, P.y + 60, 0.9); L.scene.host.onFeed({ t: 'mission:accept', code: 'C14', at: { x: P.x + 200, y: P.y + 80 } }); });
  await settle(page);
  await run(page, 15);
  await shot(page, 'drill');
  await ev(page, () => window.__LAB.scene.host.onFeed({ t: 'mission:done', code: 'C14' }));
  NUM.drill = await ev(page, () => ({ rates: window.__LAB.host.api.rates(), toasts: window.__LAB.toasts.slice() }));
  await page.context().close();
};

S.toggle = async (B) => {
  const { page } = await boot(B, PHONE, 2);
  await ev(page, () => { const L = window.__LAB; L.setup({}); const b = L.b('t_fountain'); L.look(b.x - 140, b.y + 90, 1.0); L.start('scuffle', { place: 't_fountain' }); });
  await settle(page);
  await run(page, 3);
  const r = await ev(page, () => { const L = window.__LAB; const ch = L.host.api.toggle(false); L.run(22); return { ch, safety: L.host.api.safety(), rates: L.host.api.rates(), scene: L.v().info().scene }; });
  await ev(page, () => window.__LAB.move('in', { home: 'lotH3#1', n: 2 }));
  const L2 = await ev(page, () => { const L = window.__LAB; L.look(L.b('lotH3').x - 170, L.b('lotH3').y + 120, 0.95); L.run(8); return L.v().info(); });
  NUM.toggle = Object.assign(r, { movingWithIncidentsOff: L2.moving });
  console.log(JSON.stringify(NUM.toggle));
  await page.context().close();
};

// ---------------------------------------------------------------------------------------------------- main
(async () => {
  SRV = await start();
  const B = await launch();
  try {
    for (const k of Object.keys(S)) {
      if (!want(k)) continue;
      const t = Date.now();
      await S[k](B);
      console.log('[' + k + '] ' + ((Date.now() - t) / 1000).toFixed(1) + ' s');
    }
  } catch (e) {
    console.error(String(e).split('\n')[0]);
    if (LASTPAGE) try { console.error((await LASTPAGE.evaluate(() => window.__LAB.errors.slice(-3))).join('\n')); } catch (e2) { /* closed */ }
    FAIL++;
  } finally {
    await B.close();
    await SRV.close();
  }
  fs.writeFileSync(NUMS_FILE, JSON.stringify(NUM, null, 1));
  console.log('shots', SHOTS.length, SHOTS.join(' '));
  console.log('total ' + ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  process.exit(FAIL ? 1 : 0);
})();
