// missions_bank lab runner (Playwright, one Chromium, fixed-step clock, ≤ 2 min):
//   nice -n 15 node tools/test/missions_lab/run_lab.mjs [--only name,name] [--no-gif]
// Phone 390 × 844 at DPR 3 (+ one desktop 1280 × 800 shot): request bubbles, the accept card, a delivery, a moving
// recipient with the edge marker, the panel tabs (ko + en), chip focus, the title-up + 마을 악단, the bank (closed,
// queue of 6 with tickets, vault, counter, passbook, loan sheet), zoom 0.6 / 1.2. Captures to
// docs/previews/missions_lab_*.png|gif and a numbers file docs/previews/missions_lab_numbers.json (logic ms per tick,
// draw calls, display objects, texture MiB, placeholders, console errors). Exit 1 on errors / placeholders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join(process.env.TMPDIR || '/tmp', 'missions_lab_frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
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
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/missions_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await page.waitForFunction(() => window.__LAB && window.__LAB.ready, null, { timeout: 60000 });
  await page.evaluate((lang) => {
    const L = window.__LAB, g = L.game;
    L.lang = lang;
    g.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow(), T = g.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { T += DT; D += DT; g.headlessStep(T, DT); } };
    L.frame = () => { T += DT; D += DT; g.step(T, DT); };
    const W = L.scene, M = W.missions, m = M.model;
    // force a mission (as the board / a bubble / an event would offer it) with chosen people
    L.offer = (code, st, gv, w, ev) => {
      const t = L.tpl(code);
      const i = m.make(t, st, Object.assign({ who: gv || w || 't:31', family: w || gv || 't:31', key: code + Math.random() }, ev || {}));
      if (!i) return 0;
      if (gv) i.gv = gv;
      if (w !== undefined) i.w = w;
      m.add(i);
      return i.id;
    };
    L.clear = () => { for (const i of m.list.slice()) m.remove(i); m.drain(); };
    L.walk = (pts) => W.walkChief(pts);
    L.walking = () => !!W.chiefMove;
    L.teleport = (x, y) => { W.chiefMove = null; W.chiefFig.obj.setPosition(x, y); W.chiefFig.shadow.setPosition(x, y); };
    L.give = (item, n) => W.give(item, n);
    L.look = (x, y, z) => { if (z) W.setZoom(z); W.lookAt(x, y); };
    L.follow = (on) => { W.followChief = on; };
    L.hour = (h) => { const fw = W.fw; fw.T = fw.day() * 600 + (h - 8) * 25; if (fw.T < 0) fw.T += 600; };
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
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const ms = L.ms;
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      return { texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(2), moduleTex: per, msMissions: +avg(ms.missions).toFixed(4), msBank: +avg(ms.bank).toFixed(4),
        p95Missions: +[...ms.missions].sort((a, b) => a - b)[Math.floor(ms.missions.length * 0.95)].toFixed(4), worldObjects: objs(W), uiObjects: objs(L.ui),
        moduleObjects: M.objects() + W.bank.objects(), placeholders: Array.from(L.Assets.warned), errors: L.errors.slice() };
    };
    L.drawCalls = (n = 30) => { const C = window.__GLC; const d0 = C.draw; for (let i = 0; i < n; i++) L.frame(); return +((C.draw - d0) / n).toFixed(1); };
  }, lang);
  // keep the camera on the chief when following
  await page.evaluate(() => {
    const W = window.__LAB.scene;
    W.events.on('postupdate', () => { if (W.followChief) W.cameras.main.centerOn(W.chiefFig.obj.x, W.chiefFig.obj.y - 60); });
  });
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
async function shot(page, name, clip) {
  await frames(page, 3);
  const file = path.join(OUT, 'missions_lab_' + name + '.png');
  await page.screenshot({ path: file, clip });
  // keep the PNGs small: 2× is plenty to review (DPR 3 → resize to 780 wide)
  try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]); w,h=im.size; f=min(1, 780/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im.save(sys.argv[1], optimize=True)', file]); } catch (e) { /* keep the original */ }
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
/** a GIF: `n` frames, `step` s of game time apart, made with ffmpeg (palette) */
async function gif(page, name, n, step, hook, clip, width = 390) {
  if (NOGIF) return null;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await frames(page, 1);
    // CSS-pixel frames (the GIF is 390 wide anyway): ~9× fewer pixels to encode than DPR 3
    await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png'), clip, scale: 'css' });
  }
  const file = path.join(OUT, 'missions_lab_' + name + '.gif');
  const fps = Math.round(1 / step);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.png'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, file]);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
async function walkTo(page, pts, maxS = 12) {
  await ev(page, (p) => window.__LAB.walk(p), pts);
  for (let t = 0; t < maxS; t += 0.25) { await run(page, 0.25); if (!(await ev(page, () => window.__LAB.walking()))) break; }
}

// ---------------------------------------------------------------------------------------------------- scenarios
const SHOTS = [];
const NUM = {};
const SRV = await start(0);
const browser = await launch();
let failed = false;
try {
  // ================================================================ phone 390 × 844 @ 3
  let { page, log } = await boot(browser, { width: 390, height: 844 }, 3);
  await ev(page, () => { const L = window.__LAB; L.hour(10); L.clear(); L.look(1000, 820, 1); });
  await run(page, 4);
  const PH = page;

  if (want('bubbles')) {
    await ev(PH, () => {
      const L = window.__LAB;
      L.clear();
      L.offer('A1', 'o', 'v:npc_aunt', 'v:npc_grandma');
      L.offer('A2', 'o', 'pet:pet_cat');
      L.offer('A3', 'o', 'v:npc_kid_boy', 'p:snowman');
      L.offer('A14', 'o', 'pet:pet_penguin');
      L.teleport(1065, 1090);
    });
    await run(PH, 2);
    await ev(PH, () => window.__LAB.scene.missions.card.hide(true));
    await frames(PH, 20);
    await shot(PH, 'plaza_bubbles');
    NUM.bubbles = await ev(PH, () => window.__LAB.stats());
    NUM.bubbles.drawCalls = await ev(PH, () => window.__LAB.drawCalls());
  }

  if (want('accept')) {
    await walkTo(PH, [[960, 880], [865, 815]]);
    await run(PH, 1.2);
    await shot(PH, 'accept_card');
  }

  if (want('delivery')) {
    // 받기 → the aunt says why; bread from the bakery; the walk to grandma; bread flies; thanks + coins + stamp
    await ev(PH, () => { const L = window.__LAB, M = L.scene.missions; const b = M.model.bubbles().find((i) => i.c === 'A1'); M.accept(b.id); M.card.hide(true); });
    await run(PH, 1.5);
    await shot(PH, 'accepted');
    // the chief picks up bread at the bakery, then walks to grandma's bench (not next to the cat: its card would open)
    await walkTo(PH, [[790, 770]]);
    await ev(PH, () => window.__LAB.give('item_bread', 6));
    await run(PH, 0.6);
    await gif(PH, 'delivery', 46, 0.1, async (i) => { if (i === 2) await ev(PH, () => window.__LAB.walk([[800, 880], [858, 968]])); });
    await run(PH, 0.1);
    await shot(PH, 'delivery_done');
    await run(PH, 3);
  }

  if (want('moving')) {
    // a letter for the merchant (t:12), who walks a loop; the chief starts far away → the edge marker points at him
    await ev(PH, () => {
      const L = window.__LAB, W = L.scene, M = W.missions;
      L.clear();
      const id = L.offer('A4', 'o', 'v:npc_young_man', 't:12');
      M.accept(id); M.card.hide(true);
      const f = W.people.get('t:12');
      f.walk = { path: [{ x: 1340, y: 1030 }, { x: 1560, y: 1150 }, { x: 1700, y: 1030 }, { x: 1480, y: 920 }], i: 0, speed: 60 };
      L.teleport(975, 690);
      L.look(890, 720, 1.2);
    });
    await run(PH, 2);
    await shot(PH, 'edge_marker');
    await ev(PH, () => { window.__LAB.follow(true); window.__LAB.walk([[1000, 820], [1300, 980], [1500, 1060]]); });
    await gif(PH, 'moving_recipient', 50, 0.12, async (i) => {
      if (i === 24) await ev(PH, () => { const W = window.__LAB.scene, f = W.people.get('t:12'); window.__LAB.walk([[f.obj.x - 30, f.obj.y + 10]]); });
    });
    await run(PH, 2);
    await shot(PH, 'moving_done');
    await ev(PH, () => { const L = window.__LAB, W = L.scene; L.follow(false); W.people.get('t:12').walk = null; W.people.get('t:12').setPose('idle', 'SW'); });
  }

  if (want('panel')) {
    await ev(PH, () => {
      const L = window.__LAB, W = L.scene, M = W.missions, m = M.model;
      L.clear();
      L.teleport(1000, 860); L.look(1000, 820, 1);
      W.give('item_log', 4);
      let id = L.offer('A6', 'o', 'v:npc_grandpa'); M.accept(id);
      id = L.offer('C1', 'a', null, 'p:feast', { who: 't:31', at: W.fw.T + 2 * 600 + 25 * 2.5 });
      id = L.offer('C9', 'a', null, 't:12', { who: 't:58', family: 't:12' });
      L.offer('A2', 'o', 'pet:pet_cat'); L.offer('A14', 'o', 'pet:pet_penguin');
      const g = m.active().find((i) => i.c === 'A6'); m.delivered(g.id, 'item_log', 4);
      const c1 = m.active().find((i) => i.c === 'C1'); c1.g = [20, 12, 4, 2, 0];
      M.card.hide(true);
      for (const c of ['D3', 'B1', 'E1']) L.offer(c, 'b');
      const d3 = m.board().find((i) => i.c === 'D3'); d3.g = [38];
      const b1 = m.board().find((i) => i.c === 'B1'); if (b1) b1.tp = m.T - 200;   // up long enough → 다른 미션
      m.fame.pts = 96; m.fame.title = 1;
      W.fw.set('b:yard'); W.fw.set('veh:sled');
    });
    await run(PH, 1);
    await ev(PH, () => window.__LAB.scene.missions.open('active'));
    await run(PH, 0.6);
    await shot(PH, 'panel_active');
    await ev(PH, () => window.__LAB.scene.missions.open('board'));
    await run(PH, 0.4);
    await shot(PH, 'panel_board');
    await ev(PH, () => {
      const m = window.__LAB.scene.missions.model, td = m.cal.dy;
      m.cal.st = { n: 2, last: td.d - 1, sw: 0 };
      // two of today's three are done
      const { unitsOf } = window.__LAB;
      td.k = [1, 1, 0]; td.g = td.ids.map((c, k) => (k < 2 ? window.__LAB.tpl(c).obj.map((o) => o.n || 1) : [Math.floor((window.__LAB.tpl(c).obj[0].n || 1) * 0.4)]));
    });
    await ev(PH, () => window.__LAB.scene.missions.open('today'));
    await run(PH, 0.4);
    await shot(PH, 'panel_today');
    await ev(PH, () => { const m = window.__LAB.scene.missions.model; m.cal.wk.g = Math.round(window.__LAB.tpl(m.cal.wk.c).stages[1] * 1.15); m.cal.wk.s = 2; window.__LAB.scene.missions.open('week'); });
    await run(PH, 0.4);
    await shot(PH, 'panel_week');
    await ev(PH, () => { const m = window.__LAB.scene.missions.model; m.fame.pts = 260; m.fame.title = 2; window.__LAB.scene.missions.open('titles'); });
    await run(PH, 0.4);
    await shot(PH, 'panel_titles');
    await ev(PH, () => { window.__LAB.lang = 'en'; window.__LAB.scene.missions.open('active'); });
    await run(PH, 0.4);
    await shot(PH, 'panel_active_en');
    await ev(PH, () => { window.__LAB.lang = 'ko'; window.__LAB.scene.missions.panel.close(true); const m = window.__LAB.scene.missions.model; m.fame.pts = 96; m.fame.title = 1; });
  }

  if (want('chip')) {
    // the focus rule: board card → an accepted request → an event about to start
    const crop = { x: 0, y: 70, width: 390, height: 140 };
    await ev(PH, () => { const L = window.__LAB; L.clear(); L.offer('D3', 'b'); L.offer('D5', 'b'); const m = L.scene.missions.model; m.board()[0].g = [21]; });
    await run(PH, 0.6);
    const a = await shot(PH, 'chip_1', crop);
    await ev(PH, () => { const L = window.__LAB, M = L.scene.missions; const id = L.offer('A6', 'o', 'v:npc_grandpa'); M.accept(id); M.card.hide(true); });
    await run(PH, 0.6);
    const b = await shot(PH, 'chip_2', crop);
    await ev(PH, () => { const L = window.__LAB; L.offer('C2', 'a', null, 'p:officiant', { who: 't:31' }); });
    await run(PH, 0.6);
    const c = await shot(PH, 'chip_3', crop);
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
ims=[Image.open(p) for p in sys.argv[2:]]
w=max(i.size[0] for i in ims); h=sum(i.size[1] for i in ims)+8*(len(ims)-1)
out=Image.new('RGB',(w,h),(255,255,255)); y=0
for i in ims: out.paste(i,(0,y)); y+=i.size[1]+8
out.save(sys.argv[1])`, path.join(OUT, 'missions_lab_chip_focus.png'), a, b, c]);
    for (const f of [a, b, c]) { fs.rmSync(f); SHOTS.splice(SHOTS.indexOf(path.relative(ROOT, f)), 1); }
    SHOTS.push('docs/previews/missions_lab_chip_focus.png');
  }

  if (want('title')) {
    await ev(PH, () => { const L = window.__LAB; L.clear(); L.teleport(1000, 900); L.look(1000, 820, 1); const m = L.scene.missions.model; m.fame.pts = 140; m.fame.title = 1; });
    await run(PH, 0.5);
    await gif(PH, 'title_up', 44, 0.1, async (i) => { if (i === 1) await ev(PH, () => window.__LAB.scene.missions.model.fameAdd(12, 'A1')); });
    await ev(PH, () => window.__LAB.scene.missions.banner.show(2, window.__LAB.lang === 'en' ? 'Village band' : '마을 악단: 저녁 6시에 광장에서 음악회'));
    await run(PH, 0.9);
    await shot(PH, 'title_up');
    await run(PH, 5);
    await ev(PH, () => window.__LAB.look(1000, 760, 1.2));
    await run(PH, 0.5);
    await shot(PH, 'band');
  }

  if (want('zoom')) {
    await ev(PH, () => { const L = window.__LAB; L.clear(); L.offer('A1', 'o', 'v:npc_aunt', 'v:npc_grandma'); L.offer('A2', 'o', 'pet:pet_cat'); L.offer('A3', 'o', 'v:npc_kid_boy', 'p:snowman'); L.offer('A14', 'o', 'pet:pet_penguin'); L.teleport(1045, 1075); L.look(1000, 840, 0.6); });
    await run(PH, 1.5);
    await shot(PH, 'zoom06');
    await ev(PH, () => window.__LAB.look(1000, 860, 1.2));
    await run(PH, 0.3);
    await shot(PH, 'zoom12');
  }

  if (want('bank')) {
    await ev(PH, () => { const L = window.__LAB; L.clear(); L.hour(10); L.teleport(1820, 1080); L.look(2100, 760, 1.2); });
    await run(PH, 1);
    await shot(PH, 'bank_closed');
    // six residents come on business (story `bank` events): tickets, queue, bench, windows
    await ev(PH, () => {
      const L = window.__LAB, W = L.scene, B = W.bank;
      const who = ['t:31', 't:47', 's:1', 's:2', 'v:npc_teen_girl', 'v:npc_young_man'];
      L.figureOf = (pid) => ({ 't:31': 'npc_teen_girl', 't:47': 'npc_grandma', 's:1': 'npc_doctor', 's:2': 'npc_skater', 'v:npc_teen_girl': 'npc_kid_girl', 'v:npc_young_man': 'npc_young_man' })[pid];
      who.forEach((p, k) => W.time.delayedCall(k * 350, () => B.onFeed({ t: 'story:bank', op: k % 3 === 1 ? 'loan' : 'deposit', who: p, amount: 120 + k * 40 })));
      L.books = { 't:31': { rows: [[3, 'deposit', 300, 300], [5, 'interest', 2, 302], [7, 'deposit', 120, 422]] }, 't:47': { rows: [[2, 'loan', 600, -630], [4, 'repay', 100, -530], [6, 'repay', 100, -430]] } };
    });
    // the chief walks up to the steps (near enough to see inside, not yet on the counter pad)
    await walkTo(PH, [[1905, 1035]]);
    await ev(PH, () => window.__LAB.look(2085, 820, 1.2));
    await gif(PH, 'bank_queue', 50, 0.12, null);
    await shot(PH, 'bank_open_queue');
    if (process.env.LAB_DEBUG) {
      // a close look for the developer (scratch only): who is where inside, and at which depth
      await ev(PH, () => window.__LAB.look(2140, 780, 2.6));
      await frames(PH, 3);
      await page.screenshot({ path: path.join(TMP, 'bank_debug.png') });
      console.log(JSON.stringify(await ev(PH, () => { const b = window.__LAB.scene.bank.building; return { staff: b.staff.map((f) => [Math.round(f.obj.x), Math.round(f.obj.y), +f.obj.depth.toFixed(4), f.obj.visible, +f.obj.scale.toFixed(3), f.pose]), people: Array.from(b.people.entries()).map(([k, v]) => [k, v.st, v.slot, Math.round(v.f.obj.x), Math.round(v.f.obj.y), +v.f.obj.depth.toFixed(4), v.f.obj.visible, +v.f.obj.alpha.toFixed(2)]), slots: b.slotDepth, layers: Object.fromEntries(Object.entries(b.layers).map(([k, o]) => [k, +o.depth.toFixed(4)])) }; })));
      await ev(PH, () => window.__LAB.look(2085, 820, 1.2));
    }
    // on the counter pad: the counter sheet; then the chief deposits 6,000 (coins fly in, the vault door turns)
    await walkTo(PH, [[1996, 966]]);
    await ev(PH, () => { window.__LAB.ui.coins = 15200; });
    await run(PH, 1);
    await shot(PH, 'bank_counter');
    await gif(PH, 'bank_vault', 30, 0.1, async (i) => { if (i === 1) await ev(PH, () => window.__LAB.scene.bank.deposit(6000)); });
    await run(PH, 2);
    // a day later (06:00 interest), 500 out, then the passbook
    await ev(PH, () => { const W = window.__LAB.scene; W.fw.T += 600; });
    await run(PH, 0.3);
    await ev(PH, () => { const B = window.__LAB.scene.bank; B.withdraw(500); B.openPassbook('chief'); });
    await run(PH, 0.5);
    await shot(PH, 'bank_passbook');
    await ev(PH, () => { const B = window.__LAB.scene.bank; B.passbook.open('t:47'); });
    await run(PH, 0.3);
    await shot(PH, 'bank_passbook_resident');
    await ev(PH, () => { const B = window.__LAB.scene.bank; B.passbook.close(); B.withdraw(B.account.savings); window.__LAB.ui.coins = 200; window.__LAB.pendingLoan = B.offerFor(1800, 'v5_busdepot'); });
    await run(PH, 0.6);
    await shot(PH, 'bank_loan');
    NUM.bank = await ev(PH, () => window.__LAB.stats());
    NUM.bank.drawCalls = await ev(PH, () => window.__LAB.drawCalls());
    await ev(PH, () => window.__LAB.scene.bank.loanSheet.done(true));
    await run(PH, 0.5);
    NUM.bankAfterLoan = await ev(PH, () => ({ coins: window.__LAB.ui.coins, account: window.__LAB.scene.bank.account.state() }));
  }

  // logic cost over a busy minute (bubbles, bank queue, board), then the log
  NUM.phone = await ev(PH, () => { const L = window.__LAB; L.ms.missions.length = 0; L.ms.bank.length = 0; L.look(1000, 820, 1); L.run(60); return L.stats(); });
  NUM.consoleErrors = log.errors.slice(0, 20);
  NUM.missing404 = log.missing404.slice(0, 20);
  await page.context().close();

  // ================================================================ desktop 1280 × 800
  if (want('desktop')) {
    ({ page, log } = await boot(browser, { width: 1280, height: 800 }, 1));
    await ev(page, () => { const L = window.__LAB; L.hour(10); L.clear(); L.offer('A1', 'o', 'v:npc_aunt', 'v:npc_grandma'); L.offer('A2', 'o', 'pet:pet_cat'); L.offer('D3', 'b'); L.offer('E1', 'b'); L.offer('D5', 'b'); L.teleport(1045, 1075); L.look(1000, 840, 1); });
    await run(page, 2);
    await shot(page, 'desktop_plaza');
    await ev(page, () => window.__LAB.scene.missions.open('board'));
    await run(page, 0.5);
    await shot(page, 'desktop_panel');
    NUM.desktop = await ev(page, () => window.__LAB.stats());
    NUM.desktop.drawCalls = await ev(page, () => window.__LAB.drawCalls());
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
// partial runs (--only) merge into the numbers file instead of wiping the other scenarios' numbers
const numFile = path.join(OUT, 'missions_lab_numbers.json');
let OLD = {};
try { OLD = ONLY.length ? JSON.parse(fs.readFileSync(numFile, 'utf8')) : {}; } catch (e) { OLD = {}; }
NUM.shots = Array.from(new Set([...(OLD.shots || []), ...SHOTS])).sort();
NUM.runs = Object.assign({}, OLD.runs || {}, { [ONLY.length ? ONLY.join('+') : 'all']: { seconds: NUM.seconds, at: new Date().toISOString() } });
fs.writeFileSync(numFile, JSON.stringify(Object.assign(OLD, NUM), null, 1));
const errs = (NUM.consoleErrors || []).length + (NUM.consoleErrorsDesktop || []).length;
const ph = ((NUM.phone && NUM.phone.placeholders) || []).length;
console.log(JSON.stringify({ shots: SHOTS.length, errors: errs, placeholders: ph, phone: NUM.phone && { ms: NUM.phone.msMissions, msBank: NUM.phone.msBank, texMiB: NUM.phone.texMiB, moduleMiB: NUM.phone.moduleMiB }, seconds: NUM.seconds }));
if (failed || errs || ph) process.exit(1);
