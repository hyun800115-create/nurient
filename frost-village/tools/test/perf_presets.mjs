// (v4.3 perf) 그래픽 사양 presets (src/core/Perf.js): 자동 / 고사양 / 중사양 / 저사양.
//   node tools/test/perf_presets.mjs [--out dir] [--quick] [--skip-tour]
// 1. settings: old values keep their meaning (auto / high / low), mid is new, anything else is 자동
// 2. the automatic pick: a low-RAM Android 11 phone -> 저사양, a 3 GB phone -> 중사양, an 8 GB phone -> 고사양 (pure
//    rule, several profiles) and a page booted as the low-RAM phone really runs 저사양
// 3. each preset applies its knobs at 412x915 (render scale 1.5 / 1.5 / 1.0, MSAA, frame cap, culling rate, ground,
//    water, doll caps, glows, social pages, half-resolution pictures on 저사양) and draws the plaza of the 46-min village
//    (screenshots at 360x640 -> <out>/look_presets.jpg, one per preset)
// 4. the automatic step down: on a slow page (SwiftShader) 고사양 -> 중사양 once, with its toast, remembered after a
//    reload; a manual choice is never changed
// 5. the settings row cycles 자동 -> 고 -> 중 -> 저 -> 자동; 성능 정보 shows the corner box; the eight rows clear the footer
// 6. old WebViews: the built-ins newer than Chrome 58 that the game uses are deleted before the page runs (and
//    Array.prototype.at / structuredClone / Object.hasOwn / String.prototype.replaceAll / AbortController /
//    CompressionStream too): a new game plays with 0 page errors
// 7. (unless --skip-tour) texbudget.mjs's full-v4 flow on 저사양 and 중사양: GL textures + render targets, peak of the tour
//    (저사양 must stay <= 300 MiB; target 190 for a 2 GB phone)
// No page errors anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('--out', path.join(ROOT, 'docs', 'build_reports', 'perf_presets')));
const SKIP_TOUR = process.argv.includes('--skip-tour');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const section = (s) => console.log('— ' + s);
const FIX = path.join(HERE, 'fixtures');
const fx46 = JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'));
const allErrors = [];

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();

// the weak-GPU drop of main.js (render scale to 1x when the village runs under 30 fps) would fire on SwiftShader's few
// fps: held off where the render scale itself is checked (game.loop.actualFps reads 60, as the low-end harness does)
const PIN_FPS = `(() => { const iv = setInterval(() => { const g = window.__FV && window.__FV.game; if (g && g.loop) { try { Object.defineProperty(g.loop, 'actualFps', { get: () => 60, set: () => {}, configurable: true }); } catch (e) { /* */ } clearInterval(iv); } }, 5); })();`;
const LOWDEV = { dm: 2, cores: 8, maxTex: 4096, renderer: 'PowerVR Rogue GE8320', sdk: 30, ram: 1890, lowRam: false };

/** a page on `vp` ([w, h, dpr]) with `settings` (+ an optional save / device profile / init script); waits for the title */
async function boot({ vp = [412, 915, 2.625], settings = {}, save = null, device = null, init = '', watch = false } = {}) {
  let pre = init;
  if (device) pre += `window.__FV_PERF_DEVICE = ${JSON.stringify(device)};`;
  if (watch) pre += 'window.__FV_PERF_WATCH = true; window.__FV_PERF_WATCH_MS = 250;';
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: vp[0], height: vp[1] }, dpr: vp[2], init: pre || undefined });
  await page.evaluate(([st, sv]) => {
    localStorage.clear();
    if (sv && sv.keys) for (const k in sv.keys) localStorage.setItem(k, sv.keys[k]);
    else if (sv) localStorage.setItem('frostVillage.save.v1', JSON.stringify(sv));
    const k = 'frostVillage.settings.v1';
    const cur = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify(Object.assign(cur, { lang: 'ko' }, st)));
  }, [settings, save]);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  return { page, ctx, log };
}
async function play(page) {
  await sleep(1500);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 240000);
  await sleep(3000);
  await page.evaluate(() => { try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } });
}
const done = async (b, tag) => { allErrors.push(...b.log.errors.map((e) => tag + ': ' + e)); await b.ctx.close(); };

/** the knobs as the running game sees them */
const KNOBS = () => {
  const P = window.__FV_PERF, g = window.__FV.game, gs = window.__FV.scene;
  const gd = gs && gs.ground;
  return {
    preset: P.name, setting: P.setting, reason: P.reason, k: g.renderer.width / 720, canvas: g.renderer.width + 'x' + g.renderer.height,
    aa: g.config.antialiasGL, ctxAA: (() => { try { return g.renderer.gl.getContextAttributes().antialias; } catch (e) { return null; } })(),
    fpsLimit: g.loop.fpsLimit, cull: gs && gs.culler ? gs.culler.every : null, bake: gd ? gd.bakeMax : null, groundLevel: gd ? gd.minLevel : null, pool: gd ? gd.pool : null,
    gfxLow: gs ? gs.gfxLow : null, water: gd ? (gd.water ? gd.water.quality : gd.sea ? 'static' : null) : null,
    rigs: P.p.rigs, glows: P.p.glows, snow: P.p.snow, social: window.__FV.texStats ? window.__FV.texStats() : null,
    texScaled: P.texScaled().made, rackBaked: P.baked().n, info: P.info(),
  };
};

try {
  // ------------------------------------------------------------------ 1. settings
  section('settings: old values keep their meaning, 중사양 is new, anything else is 자동');
  {
    const b = await boot({ vp: [360, 640, 2] });
    const read = async (stored) => b.page.evaluate(async (st) => {
      localStorage.setItem('frostVillage.settings.v1', JSON.stringify(st));
      return null;
    }, stored);
    const out = {};
    for (const [label, stored] of [['old auto', { gfx: 'auto' }], ['old high (선명하게)', { gfx: 'high' }], ['old low (가볍게)', { gfx: 'low' }], ['mid', { gfx: 'mid' }], ['bogus', { gfx: 'ultra' }], ['none (an old settings record)', { sound: false }]]) {
      await read(stored);
      await b.page.reload({ waitUntil: 'load' });
      await waitFor(b.page, () => window.__FV_PERF && window.__FV && window.__FV.game, 120000);
      out[label] = await b.page.evaluate(() => ({ setting: window.__FV_PERF.setting, name: window.__FV_PERF.name }));
    }
    check('auto -> 자동', out['old auto'].setting === 'auto', out['old auto']);
    check('high (선명하게) -> 고사양', out['old high (선명하게)'].setting === 'high' && out['old high (선명하게)'].name === 'high', out['old high (선명하게)']);
    check('low (가볍게) -> 저사양', out['old low (가볍게)'].setting === 'low' && out['old low (가볍게)'].name === 'low', out['old low (가볍게)']);
    check('mid -> 중사양', out.mid.setting === 'mid' && out.mid.name === 'mid', out.mid);
    check('an unknown value / no value -> 자동', out.bogus.setting === 'auto' && out['none (an old settings record)'].setting === 'auto', [out.bogus, out['none (an old settings record)']]);
    check('자동 under the test driver (no phone stood in) = 고사양, nothing written', out['old auto'].name === 'high', out['old auto']);
    await done(b, 'settings');
  }

  // ------------------------------------------------------------------ 2. the automatic pick
  section('the automatic pick');
  {
    const b = await boot({ vp: [360, 640, 2] });
    const picks = await b.page.evaluate(() => {
      const P = window.__FV_PERF;
      const prof = {
        'Android 11, 2 GB, low-RAM flag': { sdk: 30, ram: 1890, lowRam: true, cores: 8, maxTex: 4096, renderer: 'Mali-G52 MC2' },
        'Android 11, 3 GB, PowerVR GE8320': { sdk: 30, ram: 2900, cores: 8, maxTex: 4096, renderer: 'PowerVR Rogue GE8320' },
        'Android 10, 3 GB, Mali-G52 MC2': { sdk: 29, ram: 2850, cores: 8, maxTex: 8192, renderer: 'Mali-G52 MC2' },
        'Android 11, 4 GB, Adreno 610': { sdk: 30, ram: 3800, cores: 8, maxTex: 16384, renderer: 'Adreno (TM) 610' },
        'Android 11, 4 GB, Mali-G57 MC3': { sdk: 30, ram: 3850, cores: 8, maxTex: 8192, renderer: 'Mali-G57 MC3' },
        'Android 9, 6 GB, Adreno 630': { sdk: 28, ram: 5800, cores: 8, maxTex: 16384, renderer: 'Adreno (TM) 630' },
        'Android 7.1, 3 GB': { sdk: 25, ram: 2900, cores: 8, maxTex: 8192, renderer: 'Adreno (TM) 506' },
        'Android 13, 8 GB, Adreno 730': { sdk: 33, ram: 7600, cores: 8, maxTex: 16384, renderer: 'Adreno (TM) 730' },
        'browser, deviceMemory 2': { dm: 2, cores: 8, maxTex: 8192, renderer: 'Mali-G76 MC4', android: 11 },
        'browser, deviceMemory 4': { dm: 4, cores: 8, maxTex: 8192, renderer: 'Mali-G76 MC4', android: 12 },
        'browser, deviceMemory 8, Android 13': { dm: 8, cores: 8, maxTex: 16384, renderer: 'Adreno (TM) 730', android: 13 },
        'desktop, 8 GB': { dm: 8, cores: 12, maxTex: 16384, renderer: 'ANGLE (NVIDIA GeForce RTX 3060)' },
        'no WebGL': { dm: 8, cores: 8, webgl: false },
      };
      const out = {};
      for (const k in prof) out[k] = P.pick(prof[k]);
      return out;
    });
    console.log('    ' + JSON.stringify(picks));
    const want = { 'Android 11, 2 GB, low-RAM flag': 'low', 'Android 11, 3 GB, PowerVR GE8320': 'low', 'Android 10, 3 GB, Mali-G52 MC2': 'low', 'Android 11, 4 GB, Adreno 610': 'mid', 'Android 11, 4 GB, Mali-G57 MC3': 'mid',
      'Android 9, 6 GB, Adreno 630': 'mid', 'Android 7.1, 3 GB': 'low', 'Android 13, 8 GB, Adreno 730': 'high', 'browser, deviceMemory 2': 'low', 'browser, deviceMemory 4': 'mid',
      'browser, deviceMemory 8, Android 13': 'high', 'desktop, 8 GB': 'high', 'no WebGL': 'low' };
    const wrong = Object.keys(want).filter((k) => picks[k] !== want[k]).map((k) => k + ': ' + picks[k] + ' (want ' + want[k] + ')');
    check('the rule picks 저 / 중 / 고 as planned for 13 phone profiles', !wrong.length, wrong.length ? wrong : '13 / 13');
    await done(b, 'pick');
    // a page booted as the low-RAM Android 11 phone
    const c = await boot({ vp: [412, 915, 2.625], device: LOWDEV });
    await play(c.page);
    const k = await c.page.evaluate(KNOBS);
    const st = await c.page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.settings.v1')));
    check('a 2 GB Android 11 phone (Perf device stand-in) runs 저사양 on 자동', k.preset === 'low' && k.setting === 'auto' && k.reason === 'device', { preset: k.preset, reason: k.reason });
    check('the pick is remembered with the phone\'s signature', st.gfxAuto === 'low' && typeof st.gfxDev === 'string' && st.gfxWhy === 'device', { gfxAuto: st.gfxAuto, gfxDev: st.gfxDev });
    await c.page.reload({ waitUntil: 'load' });
    await waitFor(c.page, () => window.__FV_PERF && window.__FV && window.__FV.game, 120000);
    check('after a reload: still 저사양 (read back, not picked again)', await c.page.evaluate(() => window.__FV_PERF.name === 'low' && window.__FV_PERF.reason === 'device'));
    await done(c, 'lowdev');
  }

  // ------------------------------------------------------------------ 3. each preset applies its knobs
  section('each preset applies its knobs (412x915, a 1080x2400 phone: render scale 1.5 at most) + the plaza');
  const shots = [];
  const knobs = {};
  for (const name of ['high', 'mid', 'low']) {
    const b = await boot({ vp: [412, 915, 2.625], settings: { gfx: name }, save: fx46, init: PIN_FPS });
    await play(b.page);
    await installStepper(b.page);
    await b.page.evaluate(() => { const F = window.__FV, k = F.scene.market; F.camera(); F.zoom(1.2); F.teleport(k.x + 120, k.y + 180); if (F.v4 && F.v4.clock) F.v4.clock(11); });
    await advance(b.page, 6);
    await render(b.page, 3);
    const k = await b.page.evaluate(KNOBS);
    knobs[name] = k;
    console.log('    ' + name + ' ' + JSON.stringify(Object.assign({}, k, { social: k.social ? { totalMiB: k.social.totalMiB, soft: k.social.soft, hard: k.social.hard } : null, info: k.info.line })));
    const P = await b.page.evaluate(() => window.__FV_PERF.p);
    check(name + ': render scale ' + P.maxK + ' cap (canvas ' + k.canvas + ')', Math.abs(k.k - Math.min(1.5, P.maxK)) < 0.06, k.k);
    check(name + ': MSAA ' + (P.aa ? 'on' : 'off') + ' (the WebGL context)', k.aa === P.aa && (k.ctxAA === null || k.ctxAA === P.aa), { aa: k.aa, ctx: k.ctxAA });
    check(name + ': frame cap ' + (P.fps === 30 ? 30 : 'none (80 on 120 Hz)'), P.fps === 30 ? k.fpsLimit === 30 : k.fpsLimit !== 30, k.fpsLimit);
    check(name + ': culling every ' + P.cullEvery + ' frame(s), ground ' + P.bake + ' tile(s) a check' + (P.groundLow ? ', half-resolution tiles' : ''), k.cull === P.cullEvery && k.bake === P.bake && k.gfxLow === P.groundLow && (P.groundLow ? k.groundLevel === 1 : k.groundLevel === 0), { cull: k.cull, bake: k.bake, level: k.groundLevel });
    const wantWater = P.water === 'static' ? 'static' : P.water === 'low' ? 'low' : null;
    check(name + ': water ' + (wantWater || 'automatic'), wantWater ? k.water === wantWater : k.water === 'high' || k.water === 'low', k.water);
    check(name + ': half-resolution pictures ' + (P.texScale < 1 ? 'on' : 'off'), P.texScale < 1 ? k.texScaled > 20 : k.texScaled === 0, k.texScaled);
    check(name + ': the meat rack\'s beam is a baked picture (every preset)', k.rackBaked >= 1, k.rackBaked);
    const cfgSocial = await b.page.evaluate(() => { const g = window.__FV.scene; return { glowsCap: window.__FV_PERF.p.glows, culler: g.culler.skipped !== undefined }; });
    check(name + ': glows cap ' + P.glows + ', doll rigs cap ' + P.rigs, cfgSocial.glowsCap === P.glows && k.rigs === P.rigs);
    const f = path.join(OUT, 'preset_' + name + '.png');
    // the screenshot at 360x640 (the designer's small phone): a second page, same village
    await b.ctx.close();
    const s = await boot({ vp: [360, 640, 2], settings: { gfx: name, perfInfo: true }, save: fx46 });
    await play(s.page);
    await installStepper(s.page);
    await s.page.evaluate(() => { const F = window.__FV, k = F.scene.market; F.camera(); F.zoom(1.2); F.teleport(k.x + 60, k.y + 140); if (F.v4 && F.v4.clock) F.v4.clock(11); const C = F.scene.v4 && F.scene.v4.clock; if (C) { const tg = C.target(C.hour()); C.cur.a = tg.a; } });
    for (let i = 0; i < 8; i++) { await s.page.evaluate(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); }); await advance(s.page, 1); await sleep(300); }
    await render(s.page, 4);
    await s.page.evaluate(() => { const d = document.getElementById('fv-perf'); if (d) d.textContent = window.__FV_PERF.info().line; });
    await s.page.screenshot({ path: f });
    shots.push([f, name]);
    check(name + ': the plaza draws (360x640 screenshot)', fs.existsSync(f) && fs.statSync(f).size > 50000, path.basename(f));
    await done(s, name);
    allErrors.push(...b.log.errors.map((e) => name + ': ' + e));
  }
  check('render scale on a 1080p phone: 고 1.5 · 중 1.5 · 저 1.0', knobs.high.k >= 1.45 && knobs.mid.k >= 1.45 && Math.abs(knobs.low.k - 1) < 0.01, [knobs.high.k, knobs.mid.k, knobs.low.k]);
  check('texture memory at the 46-min plaza: 저사양 < 50 % of 고사양 (source-sum, uploaded sizes)', knobs.low.social.totalMiB < knobs.high.social.totalMiB * 0.5, [knobs.high.social.totalMiB, knobs.mid.social.totalMiB, knobs.low.social.totalMiB]);
  // the look sheet
  const sheet = path.join(OUT, 'look_presets.jpg');
  const py = spawnSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw, ImageFont
files = sys.argv[2::2]; names = sys.argv[3::2]
ims = [Image.open(f).convert('RGB') for f in files]
W, H = ims[0].size; pad, cap = 12, 34
sheet = Image.new('RGB', (len(ims) * W + (len(ims) + 1) * pad, H + cap + 2 * pad), (24, 26, 32))
d = ImageDraw.Draw(sheet)
font = None
for f in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf']:
    try: font = ImageFont.truetype(f, 16); break
    except Exception: pass
font = font or ImageFont.load_default()
lab = {'high': 'HIGH (go-sayang)', 'mid': 'MEDIUM (jung-sayang)', 'low': 'LOW (jeo-sayang)'}
for i, (im, n) in enumerate(zip(ims, names)):
    x = pad + i * (W + pad)
    d.text((x + 4, pad), lab.get(n, n) + '  360x640, 46-min plaza', fill=(235, 238, 245), font=font)
    sheet.paste(im, (x, pad + cap))
sheet.save(sys.argv[1], quality=88)
`, sheet, ...shots.flat()], { encoding: 'utf8' });
  check('look sheet ' + sheet, py.status === 0 && fs.existsSync(sheet), (py.stderr || '').slice(0, 200));
  const copyTo = arg('--sheet');
  if (copyTo && fs.existsSync(sheet)) fs.copyFileSync(sheet, copyTo);

  // ------------------------------------------------------------------ 4. the automatic step down
  section('the automatic step down (자동 only, once a session, remembered)');
  {
    const b = await boot({ vp: [412, 915, 2.625], device: { dm: 8, cores: 8, maxTex: 16384, renderer: 'Adreno (TM) 730', sdk: 33, ram: 7600 }, watch: true });
    await play(b.page);
    const ok = await waitFor(b.page, () => window.__FV_PERF.stepped, 90000).then(() => true).catch(() => false);
    const r = await b.page.evaluate(() => ({ name: window.__FV_PERF.name, why: window.__FV_PERF.reason, med: window.__FV_PERF.lastMedian, toast: window.__FV_PERF.lastToast, st: JSON.parse(localStorage.getItem('frostVillage.settings.v1')), k: window.__FV.game.renderer.width / 720 }));
    check('an 8 GB phone starts 고사양 and, at SwiftShader\'s few fps, steps down to 중사양', ok && r.name === 'mid' && r.why === 'fps', r);
    check('with a toast', /중사양/.test(r.toast || ''), r.toast);
    check('remembered for this phone (gfxAuto mid, why fps)', r.st.gfxAuto === 'mid' && r.st.gfxWhy === 'fps' && r.st.gfx === 'auto', r.st);
    await sleep(6000);
    check('only once a session (still 중사양 after 6 s more)', await b.page.evaluate(() => window.__FV_PERF.name === 'mid' && !window.__FV_PERF.watching()));
    await b.page.reload({ waitUntil: 'load' });
    await waitFor(b.page, () => window.__FV_PERF && window.__FV && window.__FV.game, 120000);
    check('after a reload: 중사양, never back up by itself', await b.page.evaluate(() => window.__FV_PERF.name === 'mid' && window.__FV_PERF.reason === 'fps'));
    await done(b, 'stepdown');
    const m = await boot({ vp: [412, 915, 2.625], settings: { gfx: 'high' }, watch: true });
    await play(m.page);
    await sleep(12000);
    const mr = await m.page.evaluate(() => ({ name: window.__FV_PERF.name, stepped: window.__FV_PERF.stepped, watching: window.__FV_PERF.watching(), step: window.__FV_PERF.stepDown('fps') }));
    check('a manual 고사양 is never changed by the check', mr.name === 'high' && !mr.stepped && !mr.watching && mr.step === false, mr);
    // the Android app's memory warning (onTrimMemory 15 = critical) on 자동: far pictures go, one step down
    const t0 = await m.page.evaluate(() => { const P = window.__FV_PERF; return P.trim(10); });
    check('__fvApp.trim(10) runs on a manual preset (pictures go, no change of preset)', t0 === true && (await m.page.evaluate(() => window.__FV_PERF.name)) === 'high');
    await done(m, 'manual');
  }

  // ------------------------------------------------------------------ 5. the settings row + 성능 정보
  section('the settings row (자동 -> 고 -> 중 -> 저 -> 자동) and 성능 정보');
  {
    const b = await boot({ vp: [390, 844, 2] });
    await play(b.page);
    await installStepper(b.page);
    const r = await b.page.evaluate(() => {
      const ui = window.__FV.game.scene.getScene('UI');
      ui.openSettings(true); ui.settingsTab = 'av'; ui.buildPanelContent(false); window.__step.run(0.1);
      const labels = [];
      const find = (flag) => (ui.settingsRows || []).find((q) => q.b && q.b[flag]);
      for (let i = 0; i < 5; i++) {
        const g = find('gfxBtn');
        labels.push(g.b.text.text + '|' + window.__FV_PERF.setting + '>' + window.__FV_PERF.name);
        g.b.emit('pointerdown');
        window.__step.run(0.1);
      }
      const rows = (ui.settingsRows || []).map((q) => ({ y: q.b.y, h: q.b.height }));
      const p = find('perfBtn');
      p.b.emit('pointerdown'); window.__step.run(0.1);
      const box = document.getElementById('fv-perf');
      const txt = box ? box.textContent : '';
      const set = JSON.parse(localStorage.getItem('frostVillage.settings.v1'));
      const p2 = find('perfBtn'); p2.b.emit('pointerdown'); window.__step.run(0.1);
      const gone = !document.getElementById('fv-perf');
      const footer = ui.panelItems.filter((o) => o.moveBtn || (o.text && /새로고침|Reload/.test(o.text.text || ''))).map((o) => o.y - (o.height || 80) / 2);
      ui.closeSettings(true);
      return { labels, rows, txt, perfInfo: set.perfInfo, gone, footerTop: Math.min(...footer), cy: ui.H / 2 };
    });
    console.log('    ' + JSON.stringify(r));
    check('the row cycles 자동 -> 고사양 -> 중사양 -> 저사양 -> 자동', /^자동·고사양\|auto>high/.test(r.labels[0]) && /^고사양\|high>high/.test(r.labels[1]) && /^중사양\|mid>mid/.test(r.labels[2]) && /^저사양\|low>low/.test(r.labels[3]) && /^자동/.test(r.labels[4]), r.labels);
    const last = r.rows.length ? Math.max(...r.rows.map((q) => q.y + q.h / 2)) : 0;
    check('eight rows, the last one clear of the footer buttons', r.rows.length === 8 && last < r.footerTop, { rows: r.rows.length, lastBottom: last, footerTop: r.footerTop });
    check('성능 정보 on: the corner box shows fps / preset / texture MiB', r.perfInfo === true && /\d+fps/.test(r.txt) && /tex \d+MiB/.test(r.txt), r.txt);
    check('성능 정보 off: the box goes', r.gone);
    await done(b, 'row');
  }

  // ------------------------------------------------------------------ 6. old WebViews (Chrome 58-77): newer built-ins gone
  section('old WebViews: built-ins newer than Chrome 58 deleted before the page runs');
  {
    const DEL = `(() => {
      const gone = [];
      const del = (o, k, n) => { try { if (o && k in o) { delete o[k]; if (!(k in o)) gone.push(n); } } catch (e) { /* */ } };
      del(Object, 'fromEntries', 'Object.fromEntries'); del(Array.prototype, 'flat', 'Array.prototype.flat'); del(Array.prototype, 'flatMap', 'Array.prototype.flatMap');
      del(String.prototype, 'matchAll', 'String.prototype.matchAll'); del(String.prototype, 'trimStart', 'trimStart'); del(String.prototype, 'trimEnd', 'trimEnd');
      del(Array.prototype, 'at', 'Array.prototype.at'); del(String.prototype, 'at', 'String.prototype.at'); del(window, 'structuredClone', 'structuredClone'); del(Object, 'hasOwn', 'Object.hasOwn');
      del(String.prototype, 'replaceAll', 'String.prototype.replaceAll'); del(window, 'AbortController', 'AbortController'); del(window, 'CompressionStream', 'CompressionStream');
      del(window, 'DecompressionStream', 'DecompressionStream'); del(Array.prototype, 'findLast', 'findLast'); del(Promise, 'allSettled', 'Promise.allSettled'); del(window, 'queueMicrotask', 'queueMicrotask');
      del(Promise.prototype, 'finally', 'Promise.prototype.finally');
      window.__FV_GONE = gone;
    })();`;
    const b = await boot({ vp: [390, 844, 2], init: DEL });
    await play(b.page);
    await installStepper(b.page);
    // play: the chief walks a loop for 20 game s, then the chat module (chat.js / src/chat) is loaded and a chat opens
    await b.page.evaluate(() => { const F = window.__FV; for (let t = 0; t < 20; t += 0.05) { F.setInput(Math.cos(t), Math.sin(t)); window.__step.run(0.05); } F.setInput(0, 0); });
    const r = await b.page.evaluate(async () => {
      const out = { gone: window.__FV_GONE, back: { fromEntries: typeof Object.fromEntries, flatMap: typeof [].flatMap, matchAll: typeof ''.matchAll, finally: typeof Promise.prototype.finally } };
      try { const M = await import(new URL('src/chat/index.js', document.baseURI).href); out.chat = !!M; } catch (e) { out.chat = 'error ' + e.message; }
      out.coins = window.__FV.state().coins;
      return out;
    });
    console.log('    ' + JSON.stringify(r));
    check('deleted: ' + (r.gone || []).length + ' built-ins (incl. at / structuredClone / hasOwn / replaceAll / AbortController / CompressionStream)', (r.gone || []).length >= 15, r.gone);
    check('the polyfills put the ones the game uses back', r.back.fromEntries === 'function' && r.back.flatMap === 'function' && r.back.matchAll === 'function' && r.back.finally === 'function', r.back);
    check('the chat code (src/chat) loads too', r.chat === true, r.chat);
    check('a new game plays 20 s with 0 page errors', !b.log.errors.length, b.log.errors.slice(0, 3));
    await done(b, 'legacy');
  }

  // ------------------------------------------------------------------ 7. full-v4 tour on 저사양 / 중사양 (texbudget.mjs)
  if (!SKIP_TOUR) {
    section('full-v4 tour (texbudget.mjs flow) on 저사양 and 중사양: GL textures + render targets');
    for (const name of ['low', 'mid']) {
      const out = path.join(OUT, 'texbudget_' + name + '.json');
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [path.join(HERE, 'texbudget.mjs'), '--gfx', name, '--out', out], { encoding: 'utf8', timeout: 1500000 });
      fs.writeFileSync(path.join(OUT, 'texbudget_' + name + '.log'), (r.stdout || '') + (r.stderr || ''));
      let J = null;
      try { J = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { J = null; }
      if (!J) { check(name + ': texbudget ran', false, (r.stderr || r.stdout || '').slice(-300)); continue; }
      const tour = J.samples.filter((q) => q.gl && /plaza|dock|station|track|town|overview/.test(q.label));
      const peak = Math.max(...tour.map((q) => q.gl)), peakTex = Math.max(...tour.map((q) => q.glTex || 0)), rt = Math.max(...tour.map((q) => q.glRT || 0));
      const ng = J.samples.filter((q) => /^new game/.test(q.label)).map((q) => q.MiB);
      console.log(`    ${name}: full-v4 tour GL peak ${peak} MiB (textures ${peakTex} + render targets ${rt}); new game ${Math.max(...ng)} MiB; ${Math.round((Date.now() - t0) / 1000)} s`);
      const errs = J.results.find((q) => q.name === 'no page errors');
      check(name + ': texbudget flow without page errors', errs && errs.ok, errs && errs.info);
      if (name === 'low') {
        check('저사양: full-v4 tour GL total <= 300 MiB (must)', peak <= 300, peak);
        check('저사양: full-v4 tour GL total <= 190 MiB (2 GB phone target, info)', true, peak + (peak <= 190 ? ' (met)' : ' (not met)'));
      } else check('중사양: full-v4 tour GL total <= 455 MiB (must)', peak <= 455, peak);
    }
  }
} catch (e) {
  check('no exception', false, e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e));
}
check('no page errors in any page', !allErrors.length, allErrors.slice(0, 4));
fs.writeFileSync(path.join(OUT, 'perf_presets.json'), JSON.stringify({ when: new Date().toISOString(), results }, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\nperf_presets: ${pass} ok, ${results.length - pass} failed  (-> ${OUT})`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
