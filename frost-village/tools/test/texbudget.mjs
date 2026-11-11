// Texture budget (v4-B, docs/v4_plan.md §11.2 / §11.5), fixed-step clock:
//   node tools/test/texbudget.mjs [--bot 20] [--out file.json]
// Scenarios: title; a new game (and, with --bot N, the smart bot to minute N, sampled every 5 game s); the v3.5
// village complete (unlockV3); full v4 (station, town open, 5 shops, 50 people, rank 읍); a camera tour (plaza ->
// station -> along the track -> town square -> zoom 0.6 -> overview -> back to the plaza); ((v4.3) then a long 관망
// look-around tour: the chief with the pilot at the plaza, the free camera dragged over the whole map (--no-pan skips it);
// (review F3) then the chief seated at his office desk (chief2's sheet in use) while the camera looks around at the
// station and the town square: his sheet is let go there, the GL must holds).
// Measures Phaser's source-sum (window.__FV.texStats) and, through an init script that wraps texImage2D /
// texStorage2D / deleteTexture, the live GL bytes; the two must agree within 10 %.
// Fails if a "must" (new game 368, full v4 455) is exceeded for more than 2 s of samples, or the return to the
// start of the tour ends more than 5 MiB above where it began (after the residency TTLs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BOT = Number(opt('--bot', '0'));
const OUT = opt('--out', path.join(HERE, '..', '..', 'docs', 'build_reports', 'texbudget_v4.json'));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

// live GL texture bytes (level 0 of every texImage2D / texStorage2D, minus deleted textures)
const GL_PROBE = `(() => {
  const live = new Map(); const rt = new Set(); let total = 0, rtBytes = 0;
  const wrap = (P) => {
    if (!P || P.__fvWrapped) return; P.__fvWrapped = true;
    const bind = P.bindTexture, img = P.texImage2D, sto = P.texStorage2D, del = P.deleteTexture, act = P.activeTexture;
    P.activeTexture = function (u) { this.__unit = u; return act.call(this, u); };
    P.bindTexture = function (t, tex) { const m = this.__bound || (this.__bound = {}); m[(this.__unit || 0) + ':' + t] = tex; return bind.call(this, t, tex); };
    const cur = (gl, t) => (gl.__bound || {})[(gl.__unit || 0) + ':' + t];
    // (render targets — texImage2D with no pixels: the renderer's own screen-sized buffers — are counted apart)
    const set = (tex, bytes, isRT) => {
      if (!tex) return; const was = live.get(tex) || 0; live.set(tex, bytes); total += bytes - was;
      if (rt.has(tex)) rtBytes -= was;
      if (isRT) { rt.add(tex); rtBytes += bytes; } else rt.delete(tex);
    };
    P.texImage2D = function (...a) {
      const r = img.apply(this, a);
      if (a[1] === 0) { let w = 0, h = 0, isRT = false; if (a.length >= 9) { w = a[3]; h = a[4]; isRT = !a[8]; } else { const s = a[5]; w = s && (s.width || s.videoWidth || s.displayWidth) || 0; h = s && (s.height || s.videoHeight || s.displayHeight) || 0; } set(cur(this, a[0]), w * h * 4, isRT); }
      return r;
    };
    if (sto) P.texStorage2D = function (t, lv, f, w, h) { const r = sto.call(this, t, lv, f, w, h); set(cur(this, t), w * h * 4, false); return r; };
    P.deleteTexture = function (tex) { const b = live.get(tex) || 0; total -= b; if (rt.has(tex)) { rtBytes -= b; rt.delete(tex); } live.delete(tex); return del.call(this, tex); };
  };
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  window.__glTex = () => ({ MiB: +(total / 1048576).toFixed(1), texMiB: +((total - rtBytes) / 1048576).toFixed(1), rtMiB: +(rtBytes / 1048576).toFixed(1), n: live.size });
})();`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, init: GL_PROBE });
const ev = (fn, a) => page.evaluate(fn, a);
const nudge = (fn, ms = 120000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
const samples = [];
const sample = async (label) => {
  const s = await ev(() => { const st = window.__FV.texStats ? window.__FV.texStats() : null; return { st, gl: window.__glTex ? window.__glTex() : null }; });
  const r = { label, MiB: s.st ? s.st.totalMiB : null, gl: s.gl ? s.gl.MiB : null, glTex: s.gl ? s.gl.texMiB : null, glRT: s.gl ? s.gl.rtMiB : null, byCls: s.st && s.st.byCls, social: s.st && s.st.social, areas: s.st && s.st.areas, ground: s.st && s.st.ground };
  samples.push(r);
  console.log(`  [${label}] ${r.MiB} MiB (GL ${r.gl}: textures ${r.glTex} + render targets ${r.glRT})`);
  return r;
};
/** advance `sec` game s sampling every `every` s; returns the samples */
const run = async (label, sec, every = 5) => { const out = []; for (let t = 0; t < sec; t += every) { await advance(page, every); out.push(await sample(label + ' +' + (t + every) + 's')); } return out; };
const overFor = (list, must) => list.filter((r) => r.MiB > must).length * 5;
let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(1500);
  const title = await ev(() => { const g = window.__FV.game; let b = 0; for (const k in g.textures.list) { if (/^__/.test(k)) continue; for (const s of g.textures.list[k].source) b += s.width * s.height * 4; } return +(b / 1048576).toFixed(1); });
  samples.push({ label: 'title', MiB: title });
  check('title <= 90 MiB', title <= 90, title);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 240000);
  await sleep(4000);
  await installStepper(page);
  const ng = await run('new game', 30);
  check('new game <= 368 MiB (must)', overFor(ng, 368) <= 2, Math.max(...ng.map((r) => r.MiB)));
  check('new game <= 240 MiB (target)', Math.max(...ng.map((r) => r.MiB)) <= 240, Math.max(...ng.map((r) => r.MiB)));
  if (BOT > 0) {
    await page.addScriptTag({ path: path.join(HERE, 'review_gameplay_bot.js') });
    const bs = [];
    for (let t = 0; t < BOT * 60; t += 5) { await ev(() => window.__step.run(5, window.__bot.tick)); if (t % 30 === 0) bs.push(await sample('bot ' + (t / 60).toFixed(1) + ' min')); }
    check('new game + bot to minute ' + BOT + ' <= 368 MiB (must)', overFor(bs, 368) <= 2 * 6, Math.max(...bs.map((r) => r.MiB)));
    await ev(() => window.__FV.setInput(0, 0));
  }
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await advance(page, 2);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready);
  const v3 = await run('v3.5 village complete', 20);
  check('v3.5 village complete <= 455 MiB (must)', overFor(v3, 455) <= 2, Math.max(...v3.map((r) => r.MiB)));
  // full v4: station, first train, town open, 5 shops, houses, rank 읍
  await ev(() => window.__FV.v4.repair());
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 180000);
  for (let k = 0; k < 30 && !(await ev(() => window.__FV.state().v4.arrivals > 0)); k++) await advance(page, 1);
  await ev(() => window.__FV.v4.openTown());
  await nudge(() => window.__FV.hasTex('town_homes') && window.__FV.state().v4.tf.child, 180000);
  await ev(() => window.__FV.v4.foundAll());
  for (let k = 0; k < 3; k++) { const id = await ev(() => window.__FV.v4.house()); if (id) await advance(page, 35); }
  await ev(() => { window.__FV.v4.happy(Array(40).fill(1)); const nb = window.__FV.scene.v4; nb.rank.ceremony(false); });
  await advance(page, 15);
  const tour = [];
  const at = async (label, x, y, zoom, sec = 20) => {
    await ev(([x, y, z]) => { window.__FV.camera(); if (z) window.__FV.zoom(z); window.__FV.teleport(x, y); }, [x, y, zoom || 0]);
    const s = await run(label, sec);
    tour.push(...s);
    return s[s.length - 1];
  };
  const m = await ev(() => { const k = window.__FV.scene.market; return { x: k.x + 120, y: k.y + 180 }; });
  // the textures (MiB) on the GPU now: what a failed 'return to the start' kept is printed
  const texList = () => ev(() => { const g = window.__FV.game, o = {}; for (const k in g.textures.list) { if (k[0] === '_') continue; let b = 0; for (const s of g.textures.list[k].source) b += (s.width || 0) * (s.height || 0) * 4; if (b > 262144) o[k] = +(b / 1048576).toFixed(2); } return o; });
  const plaza0 = await at('full v4 plaza', m.x, m.y, 1.2, 30);
  const tex0 = await texList();
  await at('east dock', 2700, 700, 1.2);
  await at('our station', 3420, 1640, 1.2);
  await at('along the track', 3900, 1900, 1.2);
  await at('town square', 4900, 2450, 1.2, 30);
  await at('town zoom 0.6', 4900, 2450, 0.6);
  await ev(() => window.__FV.zoom('overview'));
  tour.push(...(await run('overview', 15)));
  const plaza1 = await at('back at the plaza', m.x, m.y, 1.2, 45);
  const peak = Math.max(...tour.map((r) => r.MiB));
  check('full v4, any view <= 455 MiB (must)', overFor(tour, 455) <= 2, peak);
  check('full v4, plaza <= 300 MiB (target)', plaza0.MiB <= 300, plaza0.MiB);
  check('full v4 tour peak <= 300 MiB (target)', peak <= 300, peak);
  const tex1 = await texList();
  const kept = Object.keys(tex1).filter((k) => !(k in tex0)).map((k) => k + ' ' + tex1[k]), gone = Object.keys(tex0).filter((k) => !(k in tex1)).map((k) => k + ' ' + tex0[k]);
  check('return to the start of the tour <= start + 5 MiB', plaza1.MiB <= plaza0.MiB + 5, { start: plaza0.MiB, end: plaza1.MiB, extra: kept.slice(0, 12), gone: gone.slice(0, 12) });
  const agree = tour.filter((r) => r.glTex).map((r) => Math.abs(r.glTex - r.MiB) / Math.max(1, r.MiB));
  check('GL texture bytes agree with the source-sum within 10 % (median)', agree.length && agree.sort((a, b) => a - b)[Math.floor(agree.length / 2)] <= 0.10, agree.length ? +agree[Math.floor(agree.length / 2)].toFixed(3) : 'no GL probe');
  // the renderer's own render targets (screen-sized) come on top; without Phaser's FX pipeline (disablePreFX) ~17 MiB
  const rts = tour.filter((r) => r.glRT !== null).map((r) => r.glRT);
  check('renderer render targets <= 40 MiB (no FX pipeline)', rts.length && Math.max(...rts) <= 40, rts.length ? Math.max(...rts) : 'no GL probe');
  check('full v4, GL total (textures + render targets) <= 455 MiB (must)', tour.filter((r) => r.gl > 455).length * 5 <= 2, Math.max(...tour.map((r) => r.gl || 0)));

  // ((v4.3) 관망 둘러보기: a long look-around in 관망 — the chief stays with the pilot at the plaza while a finger drags the
  //  camera (1,800 px/s, a frame drawn every 0.1 s) over the whole map: the dock, the station, the track, the town and its
  //  far corners, the depot (at zoom 0.7, 관망's widest), the south, the bank, the office, back. Residency, the ground
  //  slots and the culling follow the free camera; the must holds on the way and the plaza comes back to where it was)
  if (!args.includes('--no-pan')) {
    await ev(([x, y]) => { window.__FV.camera(); window.__FV.zoom(1.2); window.__FV.teleport(x, y); }, [m.x, m.y]);
    await advance(page, 2);
    const pon = await ev(() => { const st = window.__FV.v42.pilot(true); window.__step.run(1); return { on: st.on, avail: window.__FV.scene.v42.pilot.available }; });
    check('관망 on for the look-around tour', pon.on, pon);
    const ptour = [];
    const p0 = await sample('관망 at the plaza');
    ptour.push(p0);
    const stops = [['east dock', 2700, 700], ['our station', 3420, 1640], ['along the track', 3900, 1900], ['town square', 4900, 2450], ['town, far east', 5900, 1300],
      ['town, south', 5300, 3250], ['depot (zoom 0.7)', 3200, 3150, 0.7], ['south fields (zoom 0.7)', 1500, 3000, 0.7], ['the bank', -400, 500, 1.2], ['the office', 100, 700], ['back at the plaza', m.x, m.y - 30]];
    let reached = 0;
    // drag there in 5 s chunks of game time (a frame drawn every 6 steps), then look for 5 s
    const dragTo = async (label, x, y, list) => {
      for (let k = 0; k < 20; k++) {
        const left = await ev(([tx, ty]) => {
          const P = window.__FV.scene.v42.pilot, sp = 1800 / 60;
          for (let i = 0; i < 300; i++) {
            const f = P.cam.free || P.cam.detach(), fx = f.x, fy = f.y;
            const dx = tx - fx, dy = ty - fy, d = Math.hypot(dx, dy);
            if (d < 2) return 0;
            const s = Math.min(1, sp / d);
            window.__FV.v42.pilotCam('by', dx * s, dy * s);
            window.__step.run(1 / 60);
            if (i % 6 === 5) window.__step.frame();
            // (clamped: as near as the bounds let it)
            if (Math.abs(P.cam.free.x - fx) < 0.01 && Math.abs(P.cam.free.y - fy) < 0.01) return 0;
          }
          return 1;
        }, [x, y]);
        list.push(await sample('관망 → ' + label));
        if (!left) break;
      }
      const at = await ev(([tx, ty]) => { const P = window.__FV.scene.v42.pilot, f = P.cam.free; for (let i = 0; i < 50; i++) { window.__step.run(0.1); window.__step.frame(); } return { x: Math.round(f.x), y: Math.round(f.y), d: Math.round(Math.hypot(tx - f.x, ty - f.y)), on: P.on }; }, [x, y]);
      list.push(await sample('관망 at ' + label));
      return at;
    };
    for (const [label, x, y, z] of stops) {
      if (z) await ev((zz) => { window.__FV.zoom(zz); }, z);
      const at = await dragTo(label, x, y, ptour);
      if (at.on) reached++;
      console.log(`    (the free camera at ${at.x}, ${at.y}: ${at.d} px from ${label}${at.d > 40 ? ', as near as the bounds let it' : ''})`);
    }
    check('관망 stays on and the free camera visits every stop of the tour', reached === stops.length, reached + '/' + stops.length);
    check('관망 look-around tour <= 455 MiB (must)', overFor(ptour, 455) <= 2, Math.max(...ptour.map((r) => r.MiB)));
    check('관망 look-around tour, GL total (textures + render targets) <= 455 MiB (must)', ptour.filter((r) => r.gl > 455).length * 5 <= 2, Math.max(...ptour.map((r) => r.gl || 0)));
    // 「촌장님 보기」 at the plaza, then the TTLs
    await ev(() => window.__FV.v42.pilotCam('attach'));
    const back = await run('관망 back with the chief', 45);
    const pend = back[back.length - 1];
    // ((v4.3 review) without the ground slots: a fixed pool (≤ 28 MiB, trimmed 15 s after a tile is last needed; these
    //  samples draw no frame, so the last drawn view still counts as 'in view'): 19 slots at the start, 28 at the end
    //  was 9 MiB of the pool's own size, not a page left behind)
    const ng = (r) => +(r.MiB - ((r.byCls && r.byCls.ground) || 0)).toFixed(1);
    check('관망 tour: back with the chief <= the start + 5 MiB (without the ground pool)', ng(pend) <= ng(p0) + 5, { start: ng(p0), end: ng(pend), all: [p0.MiB, pend.MiB], ground: [p0.byCls && p0.byCls.ground, pend.byCls && pend.byCls.ground] });

    // ((v4.3 review F3) the chief seated at his office desk — chief2's sheet (3 MiB) in use — while the camera looks
    //  around at the busiest views: the sheet goes though he sits in it (Residency.evict(k, true)), the GL must holds)
    // (the office built and its cutaway art in: the chief goes to his desk pad first — the office's pages load while
    //  the camera is near it)
    await ev(() => {
      const gs = window.__FV.scene, P = gs.v42.pilot, S = window.__step;
      if (!(gs.v42.office && gs.v42.office.building)) { window.__FV.v42.office({ build: true }); S.run(1); }
      const B = gs.v42.office && gs.v42.office.building;
      window.__FV.zoom(1.2);
      if (!P.on) P.start('test');
      P.cam.attach();
      if (B) window.__FV.teleport(B.spots.deskPad.x, B.spots.deskPad.y);
    });
    await nudge(() => { window.__step.run(0.1); window.__step.frame(); const B = window.__FV.scene.v42.office && window.__FV.scene.v42.office.building; return !!(B && B.cw); }, 90000);
    const seat = await ev(() => {
      const gs = window.__FV.scene, P = gs.v42.pilot;
      const B = gs.v42.office && gs.v42.office.building;
      if (!B || !B.cw) return { none: true, office: !!B };
      if (!P.on) P.start('test');
      P.cam.attach();
      P.begin('office');
      window.__FV.teleport(B.spots.deskPad.x, B.spots.deskPad.y);
      P.ri = P.route.length; P.arrived = true; P.pose(P.act);
      // (he stays at his desk for the test: the chooser holds off — its own minimum time is shorter than this case)
      P.decT = 1e9;
      window.__seatTb = () => { const p = gs.player, k = P.sheetKey(), tex = window.__FV.game.textures; return { k, seat: !!p.seat, sits: /^(sit|doze)/.test(p.animRes || ''), loaded: k ? tex.exists(k) : null, away: P.state().sheetAway, drops: P.state().sheetDrops, officeOpen: !!B.cw.revealed, officeAway: !!B.away, inside: tex.exists('office_bld@inside'), insideDrops: B.awayDrops || 0 }; };
      return window.__seatTb();
    });
    if (seat.none) check('관망: the chief seated at his office desk (the office built)', false, seat);
    else {
      const sat = await nudge(() => { window.__step.run(0.1); window.__step.frame(); const s = window.__seatTb(); return s.loaded && s.sits; }, 60000);
      const s0 = await ev(() => window.__seatTb());
      check('관망: the chief sits at his office desk in his chief2 sheet', sat && s0.seat, s0);
      const stour = [await sample('관망 seated at the desk')];
      const far = [];
      for (const [label, x, y] of [['our station', 3420, 1640], ['town square', 4900, 2450], ['town, far east', 5900, 1300], ['our station again', 3420, 1640]]) {
        await dragTo(label + ' (he sits at his desk)', x, y, stour);
        far.push(Object.assign({ label }, await ev(() => window.__seatTb())));
        if (far.length === 1) { const tl = await texList(); console.log('    (office / chief pages in memory at ' + label + ': ' + (Object.entries(tl).filter(([k]) => /office|ui5|char_player_b|officefolk|tf_of|tf_head/.test(k)).map(([k, v]) => k + ' ' + v).join(', ') || 'none') + ')'); }
        stour.push(...(await run('관망 seated, camera at ' + label, 15)));
      }
      const s1 = await ev(() => window.__seatTb());
      console.log('    (his sheet while the camera was away: ' + far.map((f) => f.label + ' ' + (f.loaded ? 'in memory' : 'let go')).join(', ') + '; still seated: ' + s1.seat + ')');
      check('관망 seated + far look-around: his chief2 sheet let go though he sits in it', far.every((f) => !f.loaded) && s1.seat && s1.drops >= 1, { far, s1 });
      check('관망 seated + far look-around: the office nobody sees is closed and its inside page gone', far.every((f) => f.officeAway && !f.officeOpen && !f.inside) && s1.insideDrops >= 1, far.map((f) => [f.label, f.officeOpen, f.inside]));
      check('관망 seated + far look-around, GL total (textures + render targets) <= 455 MiB (must)', stour.filter((r) => r.gl > 455).length * 5 <= 2, Math.max(...stour.map((r) => r.gl || 0)));
      await ev(() => window.__FV.v42.pilotCam('attach'));
      const back2 = await nudge(() => { window.__step.run(0.1); window.__step.frame(); const s = window.__seatTb(); return s.loaded && s.sits && s.officeOpen && s.inside; }, 60000);
      check('관망 seated: back with him, he sits in his sheet again and the office is open with its inside', back2, await ev(() => window.__seatTb()));
    }
    await ev(() => window.__FV.v42.pilot(false));
  }
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
check('no page errors', !log.errors.length && !fatal, log.errors.slice(0, 3));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), samples, results }, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\ntexbudget: ${pass}/${results.length} passed  (samples -> ${OUT})`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
