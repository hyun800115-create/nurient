// (designer report "상단에 어선이 안보여", a ring of foam + a foam trail on the sea and no boat) the fishing boat is never
// invisible: when the chief goes far away, Residency takes the 'village' area's pictures out of memory (the boat's page
// with them: its sprite gets the 'fv_blank' stand-in and its anims go); when the page is back the boat must show again,
// and while it cannot show, nothing of it is drawn on the water (hull foam + shadow, wake, rings, its catch).
// Fixed-step clock, the living (WebGL) water.
//   node tools/test/boatvisible.mjs [--shots dir] [--dpr 3]
// Part 1, the v4.1 46-min save (the fishing boat, restored at level 2): it shows at the pier · far away its page goes:
// no hull contacts, no wake, no catch on the water · back: the page returns, the sprite shows the boat's frames and
// plays its anim, hull on at the boat · a whole trip after that (out, fishing, back, unloading): every 0.25 s, hull /
// wake only with the boat shown, the boat shown whenever its page is in · the other pictures of the area that played a
// loop (the watchtowers) are not left blank either.
// Part 2, the v4.1 35-min save (the rowboat): bought live mid-trip, the fishing boat replaces it: no rowboat sprite,
// wake or hull left (the water's contact count unchanged), the new boat shows · 0 page errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until, render } from './fv_step.mjs';
import { asStepB } from './v43_helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SHOTS = arg('--shots');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
// ((v4.3 step B, S6 — the B0 suite audit, BP-21: asStepB) the boathouse and its boats are on e_dock, which does not move: the fixtures
//  carry the step-B marker, so the R43 remap (workshops to their d_* plots, the chief back at the hut door) is no part of it
const fx = (n) => asStepB(JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8')));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];

async function boot(save) {
  const INIT = `try { if (!sessionStorage.getItem('__bvInit')) { sessionStorage.setItem('__bvInit', '1'); localStorage.clear(); localStorage.setItem('frostVillage.save.v1', ${JSON.stringify(JSON.stringify(save))}); } } catch (e) {}`;
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: Number(arg('--dpr') || 1), init: INIT });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 240000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 240000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}

/** the boat as drawn: its sprite, the hull contacts on the water, the wake, its catch */
const boatState = () => {
  const F = window.__FV, gs = F.scene, A = F.assets(), B = gs.boathouse, b = B && B.boat;
  if (!b) return { none: true };
  const wv = gs.ground && gs.ground.water, s = b.sprite, k = s.texture && s.texture.key;
  const own = A.m.characters[b.key] && A.corePage ? A.corePage(A.m.characters[b.key].atlas) : b.key;
  const cur = s.anims && s.anims.currentAnim ? s.anims.currentAnim.key : null;
  const hullOn = b.hull ? b.hull.filter((id) => wv && wv._conOn[id]).length : 0;
  const hullAt = b.hull && wv ? Math.round(Math.hypot(wv._con[b.hull[1] * 4] - b.x, (wv._con[b.hull[1] * 4 + 1] - b.y) * 2)) : null;
  const shows = !!(s.active && s.visible && s.alpha > 0.5 && k === own && cur && cur.startsWith(b.key + ':') && gs.anims.exists(cur) && s.anims.isPlaying);
  const cargoVis = b.cargo.items.some((it) => it.spr && it.spr.visible);
  return {
    level: B.level, key: b.key, state: b.state, x: Math.round(b.x), y: Math.round(b.y), tex: k, page: own, pageIn: gs.textures.exists(own),
    vis: s.visible, anim: cur, playing: !!(s.anims && s.anims.isPlaying), shows, hullOn, hullAt, live: !!(wv && wv.isShader),
    wake: !!(b.wake && b.wake.visible), cargo: b.cargo.count, cargoVis, onScreen: gs.isOnScreen(b.x, b.y, 0),
  };
};

try {
  // ---------------------------------------------------------------- part 1: restored at level 2, paged out and in
  console.log('part 1: the 46-min save (fishing boat), far away and back');
  {
    const { page, log } = await boot(fx('v41_save_smart_46min.json'));
    const pos = await page.evaluate(() => { const B = window.__FV.scene.boathouse; const ck = window.__FV.scene.v4 && window.__FV.scene.v4.clock; if (ck && ck.on) ck.set(22); return { moor: B.moor, x: B.x, y: B.y }; });
    const pier = [pos.moor.x - 120, pos.moor.y + 140];
    await page.evaluate((p) => window.__FV.teleport(p[0], p[1]), pier);
    await until(page, () => { const b = window.__FV.scene.boathouse.boat; return b && b.sprite.anims.isPlaying; }, 30);
    await advance(page, 1);
    const s0 = await page.evaluate(boatState);
    console.log('  loaded ' + JSON.stringify(s0));
    ok(s0.level === 2 && s0.shows && s0.live && s0.hullOn === 3, 'restored at level 2: the fishing boat shows, hull on the living water', s0);
    if (SHOTS) { await page.evaluate(() => window.__FV.zoom(0.8)); await render(page, 3); await page.screenshot({ path: path.join(SHOTS, 'p1_pier_before_trip.png') }); }
    // the loop pictures of the area (the watchtowers' work loop), to look at again after the trip
    await page.evaluate(() => {
      const gs = window.__FV.scene, pages = ['bld_work', 'bld_east', 'bld_buildings_2'];
      window.__loops = gs.children.list.filter((o) => o.texture && pages.includes(o.texture.key) && o.anims && o.anims.isPlaying && o.anims.currentAnim);
    });
    // far away (the town): the village area's pictures go after their TTL
    await page.evaluate(() => window.__FV.teleport(6000, 1400));
    let out = null;
    for (let i = 0; i < 60; i++) {
      await advance(page, 5);
      const s = await page.evaluate(boatState);
      if (!s.pageIn) { out = s; break; }
    }
    await advance(page, 1);
    if (out) out = await page.evaluate(boatState);
    console.log('  far ' + JSON.stringify(out));
    ok(!!out, 'far away the boat\'s page goes out of memory (the case of the report)');
    ok(out && !out.shows && !out.vis && out.hullOn === 0 && !out.wake && !out.cargoVis, 'while its page is out: no sprite, no hull foam / shadow, no wake, no catch on the water', out);
    // back at the pier: the page returns and the boat shows again
    await page.evaluate((p) => window.__FV.teleport(p[0], p[1]), pier);
    const back = await until(page, () => { const F = window.__FV, A = F.assets(), b = F.scene.boathouse.boat; return F.scene.textures.exists(A.corePage(A.m.characters[b.key].atlas)); }, 60);
    await until(page, () => false, 2);
    const s1 = await page.evaluate(boatState);
    console.log('  back ' + JSON.stringify(s1));
    ok(back && s1.pageIn, 'back near the village the page comes back');
    ok(s1.shows, 'back: the sprite shows the boat again (its page\'s frames, its anim playing) — before: fv_blank with the rings drawn', s1);
    ok(s1.hullOn === 3 && s1.hullAt !== null && s1.hullAt < 120, 'back: hull foam under the boat', s1);
    const loops = await page.evaluate(() => (window.__loops || []).filter((o) => o.active).map((o) => ({ k: o.texture.key, fr: o.frame && o.frame.name, vis: o.visible, playing: !!(o.anims && o.anims.isPlaying), x: Math.round(o.x), y: Math.round(o.y) })));
    const blank = loops.filter((o) => o.k === 'fv_blank' || o.k === '__WHITE');
    ok(blank.length === 0, 'the area\'s loop pictures (' + loops.length + ', the watchtowers) are not left blank either', blank.slice(0, 4));
    if (SHOTS) {
      for (const z of [0.6, 1.0]) { await page.evaluate((zz) => window.__FV.zoom(zz), z); await render(page, 3); await page.screenshot({ path: path.join(SHOTS, 'p1_pier_after_trip_z' + z + '.png') }); }
      await page.evaluate(() => window.__FV.zoom(0.8));
    }
    // a whole trip after that: hull / wake only with the boat shown; the boat shown whenever its page is in
    const trip2 = await page.evaluate((src) => {
      const st = new Function('return (' + src + ')')();
      const bad = [], seen = new Set();
      let shownN = 0, n = 0;
      for (let t = 0; t < 70; t += 0.25) {
        window.__step.run(0.25);
        const s = st();
        n++; seen.add(s.state);
        if (s.shows) shownN++;
        if ((s.hullOn > 0 || s.wake || s.cargoVis) && !s.shows) bad.push(Object.assign({ t }, s));
        else if (s.pageIn && !s.shows) bad.push(Object.assign({ t, why: 'page in, not shown' }, s));
      }
      return { n, shownN, states: [...seen], bad: bad.slice(0, 5), badN: bad.length };
    }, boatState.toString());
    console.log('  trip ' + JSON.stringify(trip2));
    ok(trip2.states.length >= 3 && trip2.badN === 0 && trip2.shownN === trip2.n, 'a whole trip after the page came back (' + trip2.states.join('/') + '): never an invisible boat with its foam / wake (' + trip2.badN + ' bad of ' + trip2.n + ')', trip2.bad);
    if (SHOTS) {
      await until(page, () => window.__FV.scene.boathouse.boat.state === 'fish', 120);
      const b = await page.evaluate(() => { const b = window.__FV.scene.boathouse.boat; return [Math.round(b.x), Math.round(b.y)]; });
      await page.evaluate((p) => window.__FV.teleport(p[0] - 260, p[1] + 420), b);
      await advance(page, 1.5); await render(page, 3);
      await page.screenshot({ path: path.join(SHOTS, 'p1_fishing_after_trip.png') });
    }
    for (const e of log.errors) errors.push(e);
    await page.context().close();
  }

  // ---------------------------------------------------------------- part 2: the rowboat, upgraded live mid-trip
  console.log('part 2: the 35-min save (rowboat) -> fishing boat bought mid-trip');
  {
    const { page, log } = await boot(fx('v41_save_smart_35min.json'));
    const pos = await page.evaluate(() => { const B = window.__FV.scene.boathouse; return { moor: B.moor }; });
    await page.evaluate((p) => window.__FV.teleport(p.moor.x - 120, p.moor.y + 140), pos);
    const outT = await until(page, () => { const b = window.__FV.scene.boathouse.boat; return b && b.state === 'out' && b.sprite.anims.isPlaying; }, 90);
    await advance(page, 1.5);
    const r0 = await page.evaluate((src) => {
      const st = new Function('return (' + src + ')')();
      const gs = window.__FV.scene, wv = gs.ground.water;
      const s = st();
      return Object.assign(s, { contacts: wv._conOn.reduce((a, v) => a + v, 0) });
    }, boatState.toString());
    console.log('  rowboat ' + JSON.stringify(r0));
    ok(outT && r0.level === 1 && r0.shows && r0.hullOn === 3 && r0.wake, 'the rowboat rows out: shown, hull on, wake', r0);
    const r1 = await page.evaluate((src) => {
      const st = new Function('return (' + src + ')')();
      const F = window.__FV, gs = F.scene, wv = gs.ground.water, B = gs.boathouse;
      const old = B.boat, oldWake = old.wake;
      const okBuy = F.completeStep('boat_fishing');
      window.__step.run(2);
      const s = st();
      const rowLeft = gs.children.list.filter((o) => o.active && o.visible && o.texture && /boat_rowboat/.test(o.texture.key)).length;
      return Object.assign(s, { okBuy, contacts: wv._conOn.reduce((a, v) => a + v, 0), oldSprite: old.sprite.active, oldWake: !!(oldWake && oldWake.active), oldHull: old.hull, boats: B.boat === old ? 'same' : 'new', rowLeft });
    }, boatState.toString());
    console.log('  upgraded ' + JSON.stringify(r1));
    ok(r1.okBuy && r1.level === 2 && r1.boats === 'new', 'the fishing boat is bought mid-trip', r1);
    ok(!r1.oldSprite && !r1.oldWake && r1.oldHull === null && r1.rowLeft === 0, 'no rowboat sprite, wake or hull left behind', r1);
    ok(r1.contacts === r0.contacts && r1.hullOn === 3, 'the water\'s hull contacts: the old 3 gone, the new 3 on (' + r0.contacts + ' -> ' + r1.contacts + ')', r1);
    const r2 = await until(page, () => { const b = window.__FV.scene.boathouse.boat; const s = b.sprite; return s.visible && s.texture.key !== 'fv_blank' && s.texture.key !== '__WHITE' && s.anims.isPlaying; }, 20);
    const r3 = await page.evaluate(boatState);
    ok(r2 && r3.shows && r3.hullOn === 3, 'the new fishing boat shows with its hull', r3);
    if (SHOTS) { await page.evaluate((p) => window.__FV.teleport(p[0] - 200, p[1] + 260), [r3.x, r3.y]); await advance(page, 1); await render(page, 3); await page.screenshot({ path: path.join(SHOTS, 'p2_upgraded.png') }); }
    for (const e of log.errors) errors.push(e);
    await page.context().close();
  }
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
await browser.close(); await srv.close();
for (const e of errors.slice(0, 6)) console.log('  error: ' + String(e).slice(0, 300));
ok(errors.length === 0, '0 page errors', errors.length);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} boatvisible: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
