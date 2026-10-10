// vehicles_runtime lab runner (Playwright, one Chromium, fixed-step clock). Run it in groups so that each run stays
// under 2 minutes (the numbers file merges the groups):
//   nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=eup,ride        (≈ 95 s)
//   nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=sled,walker     (≈ 60 s)
//   nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=city            (≈ 85 s)
//   nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=ceremony,truck  (≈ 90 s)
//   nice -n 15 node tools/test/vehicles_lab/run_lab.mjs --only=english,desktop (≈ 25 s)
//   [--no-gif] skips the GIFs
// Phone 390 × 844 at DPR 3 (+ desktop 1280 × 800): the 읍 station district (sleigh buses with people on board, the
// stop queue boarding, the steam wagon at the yard and a shop, the dog sled), a bus ride (transit chip, where-to list,
// the camera on the bus), the chief's dog sled run (HUD + joystick), a walker in the lane (the bus waits, honk), the
// 도시 ceremony (outward repave), 도시 by day and night (retro buses, trucks, cars, lights, markings), the chief's
// truck run with its result card, zoom 0.6 / 1.2, English. Captures go to docs/previews/vehicles_lab_*.png|gif and
// docs/previews/vehicles_lab_numbers.json (logic ms per tick, draw calls, display objects, texture MiB, placeholders,
// console errors). Exit 1 on errors / placeholders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join(process.env.TMPDIR || '/tmp', 'vehicles_lab_frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const DEBUG = args.includes('--debug');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();

// ---------------------------------------------------------------------------------------------------- page helpers
const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr, lang = 'ko') {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/vehicles_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await page.waitForFunction(() => window.__LAB && window.__LAB.ready, null, { timeout: 60000 });
  await page.evaluate((lang) => {
    const L = window.__LAB, g = L.game;
    L.lang = lang;
    g.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow(), T = g.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    // logic only (no rendering) for long stretches; frame() renders one
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { T += DT; D += DT; g.headlessStep(T, DT); } };
    L.frame = () => { T += DT; D += DT; g.step(T, DT); };
    L.until = (fn, maxS, step = 0.25) => { for (let t = 0; t < maxS; t += step) { if (fn()) return t; L.run(step); } return -1; };
    const W = L.scene;
    L.setup = (o) => { W.setupWorld(o); };
    L.look = (x, y, z) => { W.look(x, y, z); W.ground.bakeAll(); };
    L.m = () => W.host.model;
    L.api = () => W.host.api;
    L.bus = (stop) => W.host.model.sim.list.find((v) => v.role === 'bus' && v.goals && v.goals.length && v.goals[0].tag === 'stop:' + stop);
    L.stats = () => {
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
      const ms = L.ms.slice().sort((a, b) => a - b);
      const avg = ms.length ? ms.reduce((s, x) => s + x, 0) / ms.length : 0;
      const mm = (L.msModel || []).slice().sort((a, b) => a - b);
      const avgM = mm.length ? mm.reduce((s, x) => s + x, 0) / mm.length : 0;
      // the textures this era really keeps (its vehicles, depots/signs, the palette's cars, the asphalt + our FX)
      let era = 0; const eraKeys = W.host.api.artKeys().concat(['veh_shadow', 'veh_glow', 'veh_beam']).concat(W.host.model.era >= 3 ? ['road_asphalt'] : []);
      for (const k of eraKeys) { const t = tex[k]; const src = t && t.source && t.source[0]; if (src && src.width) era += src.width * src.height * 4; }
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      const m = W.host.model;
      return { texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(2), eraMiB: +(era / 1048576).toFixed(2), eraKeys, moduleTex: per, msTick: +avg.toFixed(4), msModel: +avgM.toFixed(4), p95Model: mm.length ? +mm[Math.floor(mm.length * 0.95)].toFixed(4) : 0, p95: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(4) : 0, maxMs: ms.length ? +ms[ms.length - 1].toFixed(3) : 0,
        vehicles: m.sim.list.length, moving: m.sim.list.filter((v) => v.state === 'drive').length, sprites: W.host.view ? W.host.view.active.size + W.host.view.parked.size : 0,
        worldObjects: objs(W), uiObjects: objs(L.ui), moduleObjects: W.host.objects(), dolls: W.town.count(), placeholders: Array.from(L.Assets.warned), errors: L.errors.slice() };
    };
    L.drawCalls = (n = 30) => { const C = window.__GLC; const d0 = C.draw; for (let i = 0; i < n; i++) L.frame(); return +((C.draw - d0) / n).toFixed(1); };
  }, lang);
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
/** late files the module asked for (the palette's cars) arrive in real time: wait for the loader */
async function settle(page) { await page.waitForFunction(() => { const L = window.__LAB; return !L.scene.load.isLoading() && L.scene.load.list.size === 0; }, null, { timeout: 30000 }); }
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
async function shot(page, name, clip) {
  await ev(page, () => window.__LAB.scene.ground.bakeAll());
  await frames(page, 3);
  const file = path.join(OUT, 'vehicles_lab_' + name + '.png');
  await page.screenshot({ path: file, clip });
  // keep the PNGs small: DPR 3 → 780 wide
  // (256-colour PNGs: ~4× smaller, plenty for review)
  try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; f=min(1, 780/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG); im.save(sys.argv[1], optimize=True)', file]); } catch (e) { /* keep the original */ }
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
/** a GIF: `n` frames, `step` s of game time apart (ffmpeg palette) */
async function gif(page, name, n, step, hook, clip, width = 330) {
  if (NOGIF) return null;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => window.__LAB.scene.ground.update(2));
    await frames(page, 1);
    await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png'), clip, scale: 'css' });
  }
  const file = path.join(OUT, 'vehicles_lab_' + name + '.gif');
  const fps = Math.round(1 / step);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.png'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}

// ---------------------------------------------------------------------------------------------------- scenarios
const SHOTS = [];
const NUM = {};
const SRV = await start(0);
const browser = await launch();
let failed = false;
const EUP = { rank: 2, lines: { 1: 2, 2: 1 }, built: { wagons: 1, porter: 1, stops: ['S1', 'S4', 'S5'] }, hour: 10.4 };
const CITY_HOMES = [];
// level-2 homes on rows near 중앙로 (the cars park at the curb / the lot)
for (let k = 0; k < 8; k++) CITY_HOMES.push({ id: 'h' + k, pid: 't:' + (40 + k), level: 2, x: 0, y: 0 });
const CITY = { rank: 3, lines: { 1: 2, 2: 2 }, built: { wagons: 2, porter: 0, lot: 1, stops: ['S1', 'S4', 'S5'] }, homes: CITY_HOMES, hour: 11 };

try {
  // ================================================================ phone 390 × 844 @ 3
  let { page, log } = await boot(browser, { width: 390, height: 844 }, 3);
  const PH = page;

  if (want('eup')) {
    // the 읍 station district: two lines of sleigh buses, the steam wagon, the porter sleigh
    await ev(PH, (o) => { const L = window.__LAB; L.setup(o); L.run(40); }, EUP);
    // wait for a bus heading to 서리역 (S2), then watch it come in, load and leave
    await ev(PH, () => { const L = window.__LAB, s = L.layout.STOPS.S2; L.until(() => { const b = L.bus('S2'); return b && Math.hypot(b.x - s.x, (b.y - s.y) * 2) < 1000; }, 200); L.look(s.x + 90, s.y - 10, 1); });
    await gif(PH, 'eup_bus_stop', 64, 0.2);
    await ev(PH, () => { const L = window.__LAB, s = L.layout.STOPS.S2; L.look(s.x + 80, s.y + 40, 0.85); });
    await shot(PH, 'eup_station');
    NUM.eupMinute = await ev(PH, () => { const L = window.__LAB, s0 = L.layout.STOPS.S2; L.ms.length = 0; L.msModel.length = 0; L.look(s0.x + 80, s0.y + 40, 0.85); L.run(60); const s = L.stats(); delete s.moduleTex; return s; });
    await ev(PH, () => { const L = window.__LAB, s = L.layout.STOPS.S2; L.look(s.x + 80, s.y + 40, 0.85); });
    NUM.eup = await ev(PH, () => window.__LAB.stats());
    NUM.eup.drawCalls = await ev(PH, () => window.__LAB.drawCalls());
    // a close look at a bus on the open road (people on board, the horses' breath)
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().sim.list.some((v) => v.role === 'bus' && v.state === 'drive' && v.x < 3300 && v.x > 2000), 60); const b = L.m().sim.list.find((v) => v.role === 'bus' && v.state === 'drive' && v.x < 3300 && v.x > 2000) || L.m().sim.list.find((v) => v.role === 'bus'); if (b) L.look(b.x, b.y - 40, 1.2); });
    await shot(PH, 'eup_bus_zoom12');
    // the steam wagon unloading at the station cargo pad (or loading at the yard)
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().sim.list.some((v) => v.role === 'freight' && v.state === 'dwell'), 150); const w = L.m().sim.list.find((v) => v.role === 'freight'); if (w) L.look(w.x + 40, w.y - 40, 1); });
    await shot(PH, 'eup_wagon');
    await ev(PH, () => { const L = window.__LAB, s = L.layout.STOPS.S2; L.look(s.x - 260, s.y + 60, 0.6); });
    await shot(PH, 'eup_zoom06');
  }

  if (want('ride')) {
    // the chief at 서리역: the chip, where to, the wait, the ride (camera on the bus), off at 서리 광장 앞
    await ev(PH, (o) => { const L = window.__LAB, W = L.scene; L.setup(o); L.run(25); const s = L.layout.STOPS.S2; W.town.setChief(s.x + 46, s.y + 28); W.town.chiefPose('idle', 'SW'); L.look(s.x + 40, s.y + 30, 1); }, Object.assign({}, EUP, { lines: { 1: 2 } }));
    await run(PH, 0.6);
    await shot(PH, 'ride_chip');
    await ev(PH, () => { const L = window.__LAB; L.scene.host.view.chip.openList('S2'); });
    await run(PH, 0.5);
    await shot(PH, 'ride_where');
    await ev(PH, () => { const L = window.__LAB; L.scene.host.view.chip.closeList(); L.ridePromise = L.api().ride('S2', 'S1').then((r) => { L.rideResult = r; }); });
    await run(PH, 0.6);
    await shot(PH, 'ride_wait');
    await ev(PH, () => { const L = window.__LAB; L.until(() => !!L.api().riding(), 160); L.run(1); });
    await shot(PH, 'ride_aboard');
    await ev(PH, () => { const L = window.__LAB; L.until(() => { const r = L.api().riding(), b = r && L.m().sim.get(r.bus); return b && b.state === 'drive' && b.v > 1; }, 30); });
    await gif(PH, 'ride_follow', 60, 0.25);
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.events.some((e) => e.t === 'veh:ride' && e.op === 'alight'), 90); L.run(1.2); });
    await shot(PH, 'ride_arrived');
    NUM.ride = await ev(PH, () => ({ result: window.__LAB.rideResult || null, toasts: window.__LAB.toasts.slice(-4), events: window.__LAB.events.filter((e) => e.t === 'veh:ride').map((e) => e.op) }));
  }

  if (want('sled')) {
    // the chief's dog sled mail run (읍): HUD, the joystick, the edge arrow, drops, the result card
    await ev(PH, (o) => { const L = window.__LAB, W = L.scene; L.setup(o); L.run(10); const p = L.layout.PLACES['p:yard']; W.town.setChief(p.x, p.y); L.drive = L.api().drive({ tpl: 'B1', mid: 11, vehicle: 'dog_sled', route: 'mail' }).then((r) => { L.driveResult = r; }); L.auto = { k: 0.95 }; L.showJoy = true; L.followVeh = L.m().chief.vehicle().id; L.look(p.x, p.y, 1); }, Object.assign({}, EUP, { lines: { 1: 1 } }));
    await run(PH, 3);
    await shot(PH, 'sled_hud');
    await gif(PH, 'sled_drive', 56, 0.25);
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.events.some((e) => e.t === 'veh:driveDone'), 150); L.run(1.4); });
    await shot(PH, 'sled_result');
    NUM.sled = await ev(PH, () => ({ result: window.__LAB.events.find((e) => e.t === 'veh:driveDone') || null, turns: window.__LAB.events.filter((e) => e.t === 'veh:drive' && e.op === 'turn').length }));
    await ev(PH, () => { const L = window.__LAB; L.auto = null; L.showJoy = false; L.followVeh = null; });
  }

  if (want('walker')) {
    // a walker crosses 서리 큰길 in front of a sleigh bus: the bus slows, waits 1.5 m short, then goes on
    await ev(PH, (o) => {
      const L = window.__LAB, W = L.scene; L.setup(o); L.run(20);
      const m = L.m();
      // a bus on the open road with ≥ 16 m of path ahead
      L.until(() => m.sim.list.some((v) => v.role === 'bus' && v.state === 'drive' && v.v > 2 && v.total - v.ps > 18 && v.x < 3200 && v.x > 2000), 120, 0.1);
      const v = m.sim.list.find((q) => q.role === 'bus' && q.state === 'drive' && q.v > 2 && q.total - q.ps > 18 && q.x < 3200 && q.x > 2000);
      if (!v) return;
      L.busW = v.id;
      const p = m.sim.pathPoint(v, v.ps + v.len / 2 + 13, {}), p2 = m.sim.pathPoint(v, v.ps + v.len / 2 + 14, {});
      const hx = p2.x - p.x, hy = p2.y - p.y, hn = Math.hypot(hx, hy) || 1, nx = -hy / hn, ny = hx / hn;
      const a = [p.x - nx * 90, p.y - ny * 90], b = [p.x + nx * 220, p.y + ny * 220];
      // (stops in the lane to look at the shop windows for a moment: the bus waits, rings its bells, they hurry on)
      L.walker = W.town.addWalker({ preset: null, seed: 4242 }, [a, [p.x, p.y, 6], b], { speed: 0.5 });
      L.look(p.x - 40, p.y - 30, 1.1);
    }, Object.assign({}, EUP, { lines: { 1: 3 }, built: { wagons: 0, porter: 0, stops: ['S1'] } }));
    NUM.walker = { waited: 0, minGap: 99 };
    await gif(PH, 'walker_yield', 52, 0.15, async () => {
      const r = await ev(PH, () => { const L = window.__LAB, m = L.m(), v = m.sim.get(L.busW), w = L.walker; if (!v || !w) return null; return { v: v.v, by: v.blockedBy ? v.blockedBy.t : null, d: Math.hypot(v.x - w.x, (v.y - w.y) * 2) / 64 }; });
      if (r) { if (r.v < 0.05 && r.by === 'walker') NUM.walker.waited++; NUM.walker.minGap = Math.min(NUM.walker.minGap, +r.d.toFixed(2)); }
    });
    await shot(PH, 'walker_after');
    NUM.walker.bells = await ev(PH, () => window.__LAB.scene.host.model.sim ? window.__LAB.sounds.filter((k) => k === 'sfx_sleigh_bells').length : 0);
  }

  if (want('ceremony')) {
    // 서리읍 → 서리시: the streets repave outward from 중앙로, lights pop, buses swap to the retro bus
    await ev(PH, (o) => { const L = window.__LAB; L.setup(o); L.run(30); const [x, y] = L.layout.L(30, -8); L.look(x, y, 0.6); }, EUP);
    await gif(PH, 'city_ceremony', 48, 0.15, async (i) => { if (i === 2) await ev(PH, () => { const L = window.__LAB; L.rank = 3; L.scene.labEra = 3; L.scene.ground.showBays = true; L.scene.host.onFeed({ t: 'rank', level: 3, ceremony: true }); }); });
    await run(PH, 3);
    await shot(PH, 'city_after_ceremony');
    // a little later: the sleigh buses have gone home to the depot, the retro buses are out
    await run(PH, 40);
    await shot(PH, 'city_new_buses');
    NUM.ceremony = await ev(PH, () => window.__LAB.m().sim.list.filter((v) => v.role === 'bus').map((v) => v.key));
  }

  if (want('city')) {
    // 도시 by day: retro buses, cargo trucks, cars, the lights at 중앙로 x 큰길, markings
    await ev(PH, (o) => { const L = window.__LAB; L.setup(o); L.run(1); }, CITY);
    await settle(PH);
    await ev(PH, () => { const L = window.__LAB; L.run(60); const [x, y] = L.layout.L(32, -6); L.look(x, y, 0.85); });
    await settle(PH);
    await shot(PH, 'city_day');
    NUM.city = await ev(PH, () => Object.assign(window.__LAB.stats(), { lateLoads: window.__LAB.lateLoads.slice(), palette: window.__LAB.m().fleet.palette, cars: window.__LAB.m().fleet.cars.length }));
    NUM.city.drawCalls = await ev(PH, () => window.__LAB.drawCalls());
    await gif(PH, 'city_lights', 48, 0.25);
    await ev(PH, () => { const L = window.__LAB; const [x, y] = L.layout.L(32, -6); L.look(x, y, 0.6); });
    await shot(PH, 'city_zoom06');
    await ev(PH, () => { const L = window.__LAB; const b = L.m().sim.list.find((v) => v.role === 'bus' && v.state !== 'hidden') || L.m().sim.list[0]; L.look(b.x, b.y - 40, 1.2); });
    await shot(PH, 'city_zoom12');
    // the parking lot and the bays (cars of level-2 homes)
    await ev(PH, () => { const L = window.__LAB; const [x, y] = L.layout.L(...L.layout.PARKING.lot.at); L.look(x + 120, y - 60, 0.85); });
    await shot(PH, 'city_parking');
    // night: headlights and tail lamps
    await ev(PH, () => { const L = window.__LAB; const h = ((L.T / 25 + 8) % 24 + 24) % 24; L.T += ((21 - h + 24) % 24) * 25; L.run(4); const [x, y] = L.layout.L(32, -6); L.look(x, y, 0.85); });
    await shot(PH, 'city_night');
    // a busy minute in view (logic + view per tick)
    NUM.cityMinute = await ev(PH, () => { const L = window.__LAB; L.ms.length = 0; L.msModel.length = 0; const [x, y] = L.layout.L(32, -6); L.look(x, y, 0.85); L.run(60); const s = L.stats(); delete s.moduleTex; return s; });
    NUM.cityNight = await ev(PH, () => window.__LAB.stats());
    NUM.cityNight.drawCalls = await ev(PH, () => window.__LAB.drawCalls());
  }

  if (want('truck')) {
    // the chief's truck: the shop round (도시), HUD, the joystick, the result card
    await ev(PH, (o) => { const L = window.__LAB, W = L.scene; L.setup(o); L.run(20); const p = L.layout.PLACES['p:yard']; W.town.setChief(p.x, p.y); L.drive = L.api().drive({ tpl: 'B4', mid: 21, vehicle: 'truck_cargo_chief', route: 'shops' }).then((r) => { L.driveResult = r; }); L.auto = { k: 1 }; L.showJoy = true; L.followVeh = L.m().chief.vehicle().id; L.look(p.x, p.y, 0.9); }, CITY);
    await run(PH, 6);
    await shot(PH, 'truck_hud');
    // someone steps into the street ahead: the truck waits (the HUD says why), 빵빵 and they hurry across
    await ev(PH, () => {
      const L = window.__LAB, W = L.scene, m = L.m(), v = m.chief.vehicle();
      // on 중앙로, going well: someone steps out ~10 m ahead
      L.until(() => { const h = m.herePos(v); return v.v > 3 && h && m.graph.lanes[h.lane].street === 'main' && v.total - v.ps > 16; }, 60, 0.1);
      const p = m.sim.pathPoint(v, v.ps + v.len / 2 + 10, {}), p2 = m.sim.pathPoint(v, v.ps + v.len / 2 + 11, {});
      const hx = p2.x - p.x, hy = p2.y - p.y, hn = Math.hypot(hx, hy) || 1, nx = -hy / hn, ny = hx / hn;
      L.walker = W.town.addWalker({ preset: null, seed: 777 }, [[p.x - nx * 80, p.y - ny * 80], [p.x, p.y, 8], [p.x + nx * 200, p.y + ny * 200]], { speed: 0.5 });
    });
    await gif(PH, 'truck_honk', 36, 0.15, async (i) => { if (i === 16) await ev(PH, () => { const L = window.__LAB; L.honked = L.m().chief.honk(); }); if (i === 12) await shot(PH, 'truck_walker'); });
    await gif(PH, 'truck_drive', 48, 0.3);
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.events.some((e) => e.t === 'veh:driveDone'), 360); L.run(1.4); });
    await shot(PH, 'truck_result');
    NUM.truck = await ev(PH, () => ({ result: window.__LAB.events.find((e) => e.t === 'veh:driveDone') || null }));
    await ev(PH, () => { const L = window.__LAB; L.auto = null; L.showJoy = false; L.followVeh = null; });
  }

  if (want('english')) {
    await ev(PH, (o) => { const L = window.__LAB, W = L.scene; L.lang = 'en'; L.setup(o); L.run(25); const s = L.layout.STOPS.S2; W.town.setChief(s.x + 46, s.y + 28); L.look(s.x + 40, s.y + 30, 1); L.run(0.5); L.scene.host.view.chip.openList('S2'); }, Object.assign({}, CITY, { lines: { 1: 2, 2: 1 } }));
    await run(PH, 0.5);
    await shot(PH, 'en_where');
    await ev(PH, () => { const L = window.__LAB, W = L.scene; L.scene.host.view.chip.closeList(); const p = L.layout.PLACES['p:yard']; W.town.setChief(p.x, p.y); L.api().drive({ tpl: 'B3', mid: 3, vehicle: 'truck_cargo_chief', route: 'cafe' }); L.auto = { k: 1 }; L.showJoy = true; L.followVeh = L.m().chief.vehicle().id; L.run(5); });
    await shot(PH, 'en_drive');
    await ev(PH, () => { const L = window.__LAB; L.api().abortDrive(); L.auto = null; L.showJoy = false; L.followVeh = null; L.lang = 'ko'; });
  }

  NUM.consoleErrors = log.errors.slice(0, 20);
  NUM.missing404 = log.missing404.slice(0, 20);
  NUM.phoneStats = await ev(PH, () => window.__LAB.stats());
  await page.context().close();

  // ================================================================ desktop 1280 × 800
  if (want('desktop')) {
    ({ page, log } = await boot(browser, { width: 1280, height: 800 }, 1));
    await ev(page, (o) => { const L = window.__LAB; L.setup(o); L.run(1); }, CITY);
    await settle(page);
    await ev(page, () => { const L = window.__LAB; L.run(50); const [cx, cy] = L.layout.L(32, -6); L.until(() => L.m().sim.list.some((v) => v.role === 'bus' && Math.hypot(v.x - cx, (v.y - cy) * 2) < 500), 90); const b = L.m().sim.list.find((v) => v.role === 'bus' && Math.hypot(v.x - cx, (v.y - cy) * 2) < 500); L.look(b ? b.x : cx, (b ? b.y : cy) - 40, 0.85); });
    await settle(page);
    await shot(page, 'desktop_city');
    NUM.desktop = await ev(page, () => window.__LAB.stats());
    NUM.desktop.drawCalls = await ev(page, () => window.__LAB.drawCalls());
    await ev(page, (o) => { const L = window.__LAB; L.setup(o); L.run(40); const s = L.layout.STOPS.S2; L.look(s.x + 60, s.y + 60, 0.85); }, EUP);
    await shot(page, 'desktop_eup');
    NUM.consoleErrorsDesktop = log.errors.slice(0, 20);
    await page.context().close();
  }
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await browser.close();
  await SRV.close();
}
NUM.seconds = Math.round((Date.now() - T0) / 1000);
const numFile = path.join(OUT, 'vehicles_lab_numbers.json');
let OLD = {};
try { OLD = ONLY.length ? JSON.parse(fs.readFileSync(numFile, 'utf8')) : {}; } catch (e) { OLD = {}; }
NUM.shots = Array.from(new Set([...(OLD.shots || []), ...SHOTS])).sort();
NUM.runs = Object.assign({}, OLD.runs || {}, { [ONLY.length ? ONLY.join('+') : 'all']: { seconds: NUM.seconds, at: new Date().toISOString() } });
fs.writeFileSync(numFile, JSON.stringify(Object.assign(OLD, NUM), null, 1));
const errs = (NUM.consoleErrors || []).length + (NUM.consoleErrorsDesktop || []).length;
const ph = ((NUM.phoneStats && NUM.phoneStats.placeholders) || []).length;
console.log(JSON.stringify({ shots: SHOTS.length, errors: errs, placeholders: ph, labErrors: NUM.phoneStats && NUM.phoneStats.errors, seconds: NUM.seconds }));
if (DEBUG) console.log(JSON.stringify(NUM, null, 1).slice(0, 3000));
if (failed || errs || ph) process.exit(1);
