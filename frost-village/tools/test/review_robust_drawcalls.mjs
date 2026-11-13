// Per-frame GPU work: draw calls, texture binds, texture uploads (texImage2D/texSubImage2D) in a few
// typical views (plaza at start, plaza with everything unlocked, zoomed-out overview).
//   node tools/test/review_robust_drawcalls.mjs [--stage4]
// ((v4.3 step B, M — gate G7) --stage4: the shop is built to stage 4 「눈꽃마을 시장」 with everything unlocked (the mkt_s4
//  row added in the page while P is not merged) and one more view: the stage-4 plaza with three lines, both merchants (the
//  chief on register 2) and the bakery's queue)
import { newPage, bootToGame, launch, start, sleep, writeJSON, OUT } from './review_robust_lib.mjs';
import { addStage4Row, forceStage4 } from './stage4_helpers.mjs';
const STAGE4 = process.argv.includes('--stage4');

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await newPage(browser, { viewport: { width: 390, height: 844 }, dpr: 1 });
await page.addInitScript(() => {
  const C = window.__GLC = { draw: 0, bind: 0, upload: 0, uploadPx: 0, frames: 0 };
  const patch = (proto) => {
    for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; }
    const b = proto.bindTexture; proto.bindTexture = function (...a) { C.bind++; return b.apply(this, a); };
    for (const m of ['texImage2D', 'texSubImage2D']) {
      const o = proto[m];
      proto[m] = function (...a) { C.upload++; const src = a.find((x) => x && typeof x === 'object' && 'width' in x && 'height' in x); if (src) C.uploadPx += src.width * src.height; else if (typeof a[3] === 'number' && typeof a[4] === 'number') C.uploadPx += a[3] * a[4]; return o.apply(this, a); };
    }
  };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
});
await bootToGame(page, srv.url + 'index.html');
const measure = (label) => page.evaluate(async (label) => {
  const C = window.__GLC, g = window.__FV.game;
  await new Promise((r) => setTimeout(r, 1500));
  const s = { draw: C.draw, bind: C.bind, upload: C.upload, px: C.uploadPx, f: g.loop.frame };
  const f0 = g.loop.frame; while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 20));
  const n = g.loop.frame - s.f;
  return { label, frames: n, drawPerFrame: +((C.draw - s.draw) / n).toFixed(1), bindPerFrame: +((C.bind - s.bind) / n).toFixed(1), uploadsPerFrame: +((C.upload - s.upload) / n).toFixed(2), uploadKPxPerFrame: +((C.uploadPx - s.px) / n / 1000).toFixed(1), children: window.__FV.scene.children.length };
}, label);
const res = [];
res.push(await measure('start plaza (fresh)'));
if (STAGE4) await addStage4Row(page);
await page.evaluate(() => { window.__FV.unlockAll(); const p = window.__FV.where('shelf'); window.__FV.teleport(p.x, p.y + 80); });
// (--stage4: unlockAll leaves the after-읍 mkt_s4 step alone (v4): it is built here)
if (STAGE4) await forceStage4(page);
await sleep(3000);
res.push(await measure('plaza, everything unlocked'));
if (STAGE4) {
  await page.evaluate(() => {
    const F = window.__FV, g = F.scene, m = g.market, B = g.bakery;
    for (const id of ['hire_clerk_trade', 'hire_clerk_s3']) { try { F.doneStep(id); } catch (e) { /* */ } }
    for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 30) m.stock.push(ty, null, g.effects);
    for (const ty of ['item_plank', 'item_ingot']) while (g.trade.stock.countOf(ty) < 30) g.trade.stock.push(ty, null, g.effects);
    for (const L of m.openLanes()) for (let i = L.queue.length; i < 4; i++) m.spawnCustomer(i);
    if (B && B.built && B.stall) { const S = B.stall; while (S.queue.length < 3) S.spawnCustomer(S.queue.length); }
    const R2 = m.seats.M2; F.teleport(R2.x, R2.y); F.camera(m.x + 60, m.y - 20);
  });
  await sleep(4000);
  const st = await page.evaluate(() => { const g = window.__FV.scene; return { stage: g.market.stage, servers: g.trade.servers ? g.trade.servers() : null, lines: g.market.openLanes().map((l) => l.queue.length), objs: g.children.list.length }; });
  res.push(Object.assign(await measure('stage-4 plaza: three lines, two merchants, the bakery queue'), st));
}
await page.evaluate(() => { const p = window.__FV.where('up_capacity'); window.__FV.give(5000); window.__FV.teleport(p.x, p.y); });
await sleep(400);
res.push(await measure('paying on upgrade pad (cost text + ring redraw)'));
await page.evaluate(() => { window.__FV.teleport(900, 1700); window.__FV.camera(900, 1300, 0.42); });
await sleep(1500);
res.push(await measure('overview zoom 0.42'));
for (const r of res) console.log(JSON.stringify(r));
writeJSON('drawcalls.json', { res, errors: log.errors });
await browser.close(); await srv.close();
