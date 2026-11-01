// v2: close-up screenshots of both registers with their clerks (staff points), for review.
//   node tools/test/clerk_view.mjs [--root <frost-village dir>] [--min 75]
//        -> docs/previews/screens_v2/v2_20_clerk_market.jpg, v2_21_clerk_trade.jpg
// (v4.2.0.2, 기획서_마을새단장 ①: "점원이 어린아이 같아") + the share of the market clerk's body that shows on screen at
// phone zoom (390 x 844, the game's own zoom) WITH a customer at the front of the line, and without one: the clerk is
// drawn tint-filled magenta, the frame is read back in place (A) and with the clerk drawn above everything (B); share =
// magenta(A) / magenta(B). Gate: >= --min % (75) with the front customer. (4.2.0.1's awning stall: about 46-48 %.)
// ((v4.2.0.2 fix) + with the front customer she faces SW (3/4 to the camera: face, apron, name tag), idle and while
//  serving (STALL-C1: she turned side-on, W); + the signboard 「눈꽃 노점」 stays >= 95 % visible with a full shelf
//  (3 kinds x 40: the fish tower used to rise over its last syllable, STALL-P2); the bread tower tops out no higher
//  than the fish tower (R4: at 18 layers it covered the board's right end))
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, until } from './fv_step.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v2');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MIN = Number(arg('--min', 75));
const srv = await start(0, { prefix: '/fv/', root: arg('--root') ? path.resolve(arg('--root')) : undefined });
let fails = 0;
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, a) => page.evaluate(fn, a);
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(800); await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.scene.life, 60000);
  const lz = () => ev(() => { const g = window.__FV.scene, A = window.__FV.Assets || null; const tex = g.textures.getTextureKeys().filter((k) => /^vil_/.test(k)).length; const L = g.load; return { vilTex: tex, loading: L.isLoading(), list: L.list.size, inflight: L.inflight.size, queue: L.queue.size, clerkA: g.textures.exists('vil_npc_clerk_a'), t: Math.round(performance.now() / 1000) }; });
  console.log('at start', JSON.stringify(await lz()));
  await sleep(10000);
  console.log('after 10 s real (loop running)', JSON.stringify(await lz()));
  await installStepper(page);
  await ev(() => { window.__FV.give(5000); window.__FV.unlockAll(); });
  await until(page, () => { const s = window.__FV.state(); return s.market.clerk && s.trade.clerk && window.__FV.scene.market.register.clerk.ready && window.__FV.scene.trade.register.clerk.ready; }, 60);
  await until(page, () => { const g = window.__FV.scene; return g.market.register.clerk.key.startsWith('npc_clerk') && g.trade.register.clerk.key.startsWith('npc_clerk'); }, 60);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.market.stock.push('item_fish_cooked', null, gs.effects); });
  await advance(page, 8);
  console.log('after unlock waits', JSON.stringify(await lz()));
  const info = await ev(() => { const g = window.__FV.scene; const f = (r) => ({ key: r.clerk.key, at: [Math.round(r.clerk.x), Math.round(r.clerk.y)], staff: [Math.round(r.staff.x), Math.round(r.staff.y)], anim: r.clerk.animName }); return { market: f(g.market.register), trade: f(g.trade.register), m: [g.market.x, g.market.y], t: [g.trade.x, g.trade.y] }; });
  console.log(JSON.stringify(info));
  await ev(([x, y]) => { window.__FV.teleport(x - 260, y + 260); window.__FV.camera(x + 40, y - 20, 1.7); }, info.m);
  await advance(page, 1.5); await render(page, 3);
  await page.screenshot({ path: path.join(OUT, 'v2_20_clerk_market.jpg'), type: 'jpeg', quality: 84 });
  // ---- (v4.2.0.2) visible share of the market clerk, at the game's own zoom, with / without a front customer
  const share = async (cust) => {
    await ev((cust) => {
      const g = window.__FV.scene, m = g.market, F = window.__FV;
      m.spawnT = 1e9;
      for (const c of m.queue.concat(m.leaving)) { try { c.destroy(); } catch (e) { /* */ } }
      m.queue.length = 0; m.leaving.length = 0;
      if (cust) for (let i = 0; i < 3; i++) m.spawnCustomer(i);
      F.clearStack(); F.teleport(m.x + 170, m.y + 230); F.camera();
      F.camera(m.x + 10, m.y - 40);
      const c = m.register.clerk; c.idleT = 1e9; c.serveT = 0;
    }, cust);
    await advance(page, 1.5);
    return ev(() => new Promise((resolve) => {
      const g = window.__FV.scene, m = g.market, c = m.register.clerk, s = c.sprite, cam = g.cameras.main, R = g.game.renderer;
      c.faceFront(); c.play('idle', true); s.anims.pause(); window.__step.frame();
      const b = s.getBounds(), k = cam.zoom;
      const x = Math.max(0, Math.floor(cam.x + (b.x - cam.worldView.x) * k) - 4), y = Math.max(0, Math.floor(cam.y + (b.y - cam.worldView.y) * k) - 4);
      const w = Math.min(R.width - x, Math.ceil(b.width * k) + 8), h = Math.min(R.height - y, Math.ceil(b.height * k) + 8);
      const count = (img, done) => {
        const go = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x2 = cv.getContext('2d'); x2.drawImage(img, 0, 0); const d = x2.getImageData(0, 0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) n++; done(n); };
        if (img.complete && img.naturalWidth) go(); else img.onload = go;
      };
      s.setTintFill(0xff00ff);
      R.snapshotArea(x, y, w, h, (imgA) => count(imgA, (a) => {
        const d0 = s.depth, sy = c.sync; c.sync = () => {}; s.setDepth(1e7);
        R.snapshotArea(x, y, w, h, (imgB) => count(imgB, (bb) => {
          c.sync = sy; s.setDepth(d0); s.clearTint(); s.anims.resume();
          resolve({ visible: a, total: bb, share: bb ? +(100 * a / bb).toFixed(1) : null, zoom: +k.toFixed(3), front: m.queue[0] ? [Math.round(m.queue[0].x - m.x), Math.round(m.queue[0].y - m.y)] : null, art: m.sprite || m.cfg.sprite });
        }));
        window.__step.frame();
      }));
      window.__step.frame();
    }));
  };
  const withC = await share(true);
  // ((v4.2.0.2 fix STALL-C1) her facing with the front customer: idle (faceFront) and at a sale (serve)
  const face = await ev(() => {
    const m = window.__FV.scene.market, c = m.register.clerk, f = m.queue[0];
    c.faceFront(); const idle = c.dir;
    c.serve(f); const serve = c.dir;
    c.serveT = 0; c.pendingRing = false; c.faceFront(); c.play('idle', true);
    return { idle, serve, holdDir: m.register.holdDir, front: f ? [Math.round(f.x - m.x), Math.round(f.y - m.y)] : null };
  });
  if (face.idle === 3 && face.serve === 3) console.log(`ok   market clerk faces SW (3) with a front customer: idle ${face.idle}, serving ${face.serve}`);
  else { fails++; console.log('FAIL market clerk does not face SW with a front customer', JSON.stringify(face)); }
  const noC = await share(false);
  console.log('market clerk visible WITH a front customer:', JSON.stringify(withC));
  console.log('market clerk visible without a customer:  ', JSON.stringify(noC));
  if (!(withC.share >= MIN)) { fails++; console.log(`FAIL market clerk visible ${withC.share} % < ${MIN} % with a front customer`); }
  else console.log(`ok   market clerk visible ${withC.share} % >= ${MIN} % with a front customer (${noC.share} % without)`);
  // ((v4.2.0.2 fix STALL-P2) the signboard with a full shelf (every kind at its max): the same magenta count
  const sign = await ev(() => new Promise((resolve) => {
    const g = window.__FV.scene, m = g.market, o = m.sign, cam = g.cameras.main, R = g.game.renderer;
    if (!o) return resolve({ none: true });
    m.stock.clear(g.effects);
    for (const ty of m.goods) for (let i = 0; i < m.maxPerType; i++) m.stock.push(ty, null, g.effects);
    m.stock.bakeDirty = true;
    window.__step.run(1); window.__step.frame();
    const b = o.getBounds(), k = cam.zoom;
    const x = Math.max(0, Math.floor(cam.x + (b.x - cam.worldView.x) * k) - 4), y = Math.max(0, Math.floor(cam.y + (b.y - cam.worldView.y) * k) - 4);
    const w = Math.max(1, Math.min(R.width - x, Math.ceil(b.width * k) + 8)), h = Math.max(1, Math.min(R.height - y, Math.ceil(b.height * k) + 8));
    const count = (img, done) => { const go = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x2 = cv.getContext('2d'); x2.drawImage(img, 0, 0); const d = x2.getImageData(0, 0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) n++; done(n); }; if (img.complete && img.naturalWidth) go(); else img.onload = go; };
    const a0 = o.alpha; o.setAlpha(1); o.setTintFill(0xff00ff);
    R.snapshotArea(x, y, w, h, (imgA) => count(imgA, (a) => {
      const d0 = o.depth; o.setDepth(1e7);
      R.snapshotArea(x, y, w, h, (imgB) => count(imgB, (bb) => {
        o.setDepth(d0); o.clearTint(); o.setAlpha(a0);
        resolve({ visible: a, total: bb, share: bb ? +(100 * a / bb).toFixed(1) : null, stock: m.stock.items.length, drawMax: m.stock.drawMax });
      }));
      window.__step.frame();
    }));
    window.__step.frame();
  }));
  if (sign.none) console.log('(no signboard: the old stall art)');
  else if (sign.share >= 95) console.log(`ok   signboard visible ${sign.share} % with a full shelf (${sign.stock} items, towers drawn up to ${sign.drawMax})`);
  else { fails++; console.log('FAIL signboard hidden by the shelf towers', JSON.stringify(sign)); }
  // ((v4.2.0.2 fix R4) the same full shelf: the bread tower (a bread layer is ~1.5x a fish layer, world.js stockDrawMaxBy)
  //  tops out no higher than the fish tower, which stays under the board — at 18 layers it rose over the board's right end)
  if (!sign.none) {
    const tw = await ev(() => { const m = window.__FV.scene.market, s = m.stock; s.place(); const top = {}, n = {}; for (const it of s.items) { const k = it.type.replace('item_', ''); n[k] = (n[k] || 0) + 1; if (!(k in top) || it.y < top[k]) top[k] = it.y; } for (const k in top) top[k] = Math.round(top[k] - m.y); return { top, n, by: s.drawMaxBy }; });
    if (tw.top.bread != null && tw.top.fish_cooked != null && tw.top.bread >= tw.top.fish_cooked - 2) console.log(`ok   bread tower top ${tw.top.bread} px <= fish tower top ${tw.top.fish_cooked} px (from the stall's anchor; ${tw.n.bread} bread, drawn up to ${JSON.stringify(tw.by)})`);
    else { fails++; console.log('FAIL bread tower rises above the fish tower (over the signboard\'s right end)', JSON.stringify(tw)); }
  }
  await ev(([x, y]) => { window.__FV.teleport(x + 260, y + 300); window.__FV.camera(x - 30, y - 20, 1.7); }, info.t);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.trade.stock.push('item_plank', null, gs.effects); });
  await advance(page, 4); await render(page, 3);
  await page.screenshot({ path: path.join(OUT, 'v2_21_clerk_trade.jpg'), type: 'jpeg', quality: 84 });
} catch (e) { console.log('FATAL', e.stack || e); fails++; }
console.log('errors', log.errors.length, log.errors.slice(0, 3).join(' | '));
if (log.errors.length) fails++;
await browser.close(); await srv.close();
console.log(fails ? `clerk_view: ${fails} FAIL` : 'clerk_view: all ok');
process.exit(fails ? 1 : 0);
