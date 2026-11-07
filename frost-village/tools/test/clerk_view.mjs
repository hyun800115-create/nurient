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
// ((v4.3 「마을 새 단장」, gate G6) the staged shop: at stage 2 (자재 · 먹거리) and stage 3 (자재 · 생선 · 빵·고기) EVERY clerk is
//  >= --min % visible with the front customer of EVERY line present (the merchant at the 자재 창구, three customers in each
//  food line: the next line's front bubble is the one that can cover a clerk), faces SW at her post, and the stage's
//  signboard stays >= 95 % visible with full racks. Stage 1 = the checks above, at the 4.2.0.2 stall.
//  -> docs/previews/screens_v2/v43_clerks_s2.jpg, v43_clerks_s3.jpg
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
  // ((v4.3) unlockAll builds the 눈꽃 시장 (stage 3): the stall checks below run at stage 1, the staged ones after)
  // ((review CD-2) at stage 3 the stage-2 page is never fetched (Game.lazyAllowed): it comes when the loop below sets stage 2)
  await until(page, () => { const A = window.__FV.assets(); return !A.pending('market_s3_back'); }, 60);
  await ev(() => { const m = window.__FV.scene.market; if (m.setStage) m.setStage(1, true); });
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
  // ---- ((v4.3) the staged shop: every clerk with every line's front customer present (gate G6)
  for (const st of [2, 3]) {
    // (the stage's page first: stage 2's is fetched only once the shop is at stage 2)
    await ev((st) => window.__FV.scene.market.setStage(st, true), st);
    await until(page, (st) => !window.__FV.assets().pending('market_s' + st + '_back'), 60, st);
    const res = await ev((st) => {
      const g = window.__FV.scene, m = g.market, F = window.__FV;
      m.setStage(st, true);
      m.spawnT = 1e9;
      // the food racks empty for the measure (no goods flying from the rack to a customer across the counter: those
      //  flights pass over the clerks for a moment, like a walker; the gate is about who STANDS there), the 자재 rack
      //  at an everyday level
      for (const [S, n] of [[m.stock, 0], [g.trade.stock, 12]]) { const keep = {}; for (const it of S.items.slice()) { keep[it.type] = (keep[it.type] || 0) + 1; if (keep[it.type] > n) { const q = S.pop(it.type); if (q && q.spr) g.effects.releaseItem(q.spr); } } S.bakeDirty = true; }
      for (const id in m.lanes) { const L = m.lanes[id]; for (const c of L.queue.slice()) { try { c.despawn(); } catch (e) { /* */ } } L.queue.length = 0; }
      for (const c of m.leaving.slice()) { try { c.despawn(); } catch (e) { /* */ } } m.leaving.length = 0;
      for (const L of m.openLanes()) for (let i = 0; i < 3; i++) {
        const c = m.spawnCustomer(i);
        const from = c.market; const k = from.queue.indexOf(c); if (k >= 0) from.queue.splice(k, 1);
        L.queue.push(c); c.market = L; const s = L.slotPos(L.queue.length - 1); c.x = s.x; c.y = s.y; c.path.length = 0;
        c.setWant(L.types[0]); c.state = 'wait'; c.arrived = true; c.faceTo(L.x + L.cfg.faceTo[0], L.y + L.cfg.faceTo[1]); c.showBubble(); c.sync(0);
      }
      F.clearStack(); F.teleport(m.x + 420, m.y + 420);
      for (const k in m.seats) { const c = m.seats[k].clerk; if (c) { c.idleT = 1e9; c.serveT = 0; } }
      return Object.keys(m.seats).filter((k) => m.seats[k].enabled && m.seats[k].clerk);
    }, st);
    await advance(page, 1.5);
    await ev(() => { const m = window.__FV.scene.market; window.__FV.camera(m.x + 10, m.y - 60, 1.2); });
    await advance(page, 0.5);
    await ev(() => {
      // what is drawn above clerk `seat` with a box meeting hers (bubbles in their containers count with the container's depth)
      window.__cvCands = (seat) => {
        const g = window.__FV.scene, c = g.market.seats[seat].clerk, s = c.sprite, b = s.getBounds(), d = s.depth;
        const out = [];
        const walk = (list, pd) => { for (const o of list) { if (o.list) { if (o.visible) walk(o.list, o.depth); continue; } if (!o.visible || o === s || !o.getBounds) continue; const ob = o.getBounds(); const ix = Math.max(0, Math.min(b.right, ob.right) - Math.max(b.x, ob.x)), iy = Math.max(0, Math.min(b.bottom, ob.bottom) - Math.max(b.y, ob.y)); if (ix * iy > 0 && (pd !== undefined ? pd : o.depth) > d) out.push({ o, area: ix * iy }); } };
        walk(g.children.list);
        return out.sort((p, q) => q.area - p.area).slice(0, 8);
      };
      // the share of clerk `seat` that shows (magenta in place / magenta on top); walkers false = porters, residents and
      // workers hidden (the gate); hideK >= 0 = that candidate of __cvCands hidden as well (who covers her)
      window.__cvShare = (seat, walkers, hideK) => new Promise((resolve) => {
        const g = window.__FV.scene, m = g.market, R = m.seats[seat], c = R.clerk, s = c.sprite, cam = g.cameras.main, Rn = g.game.renderer;
        const hid = [];
        if (!walkers) for (const o of g.porters.concat(g.rawPorters, (g.life ? g.life.residents : []), g.workers)) if (o.sprite && o.sprite.visible) { o.sprite.setVisible(false); hid.push(o.sprite); }
        for (const q of g.market.queue) { if (q.alive) { q.vx = q.vy = 0; } }
        c.faceFront(); c.play('idle', true); s.anims.pause(); window.__step.frame();
        let what = null;
        if (hideK >= 0) { const cd = window.__cvCands(seat)[hideK]; if (cd) { const o = cd.o; what = { k: (o.texture && o.texture.key) + ':' + (o.frame && o.frame.name), dxy: [Math.round(o.x - c.x), Math.round(o.y - c.y)], parent: o.parentContainer ? Math.round(o.parentContainer.depth) : null }; o.setVisible(false); hid.push(o); } else return resolve(null); }
        const dir = c.dir;
        const b = s.getBounds(), k = cam.zoom;
        const x = Math.max(0, Math.floor(cam.x + (b.x - cam.worldView.x) * k) - 4), y = Math.max(0, Math.floor(cam.y + (b.y - cam.worldView.y) * k) - 4);
        const w = Math.max(1, Math.min(Rn.width - x, Math.ceil(b.width * k) + 8)), h = Math.max(1, Math.min(Rn.height - y, Math.ceil(b.height * k) + 8));
        const count = (img, done) => { const go = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x2 = cv.getContext('2d'); x2.drawImage(img, 0, 0); const d = x2.getImageData(0, 0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) n++; done(n); }; if (img.complete && img.naturalWidth) go(); else img.onload = go; };
        s.setTintFill(0xff00ff);
        Rn.snapshotArea(x, y, w, h, (imgA) => count(imgA, (a) => {
          const d0 = s.depth, sy = c.sync; c.sync = () => {}; s.setDepth(1e7);
          Rn.snapshotArea(x, y, w, h, (imgB) => count(imgB, (bb) => {
            c.sync = sy; s.setDepth(d0); s.clearTint(); s.anims.resume();
            for (const o of hid) o.setVisible(true);
            const lane = R.seller, f = lane && lane.queue ? lane.queue[0] : lane && lane.payTarget ? lane.payTarget() : null;
            resolve({ seat, counter: lane ? lane.id : '?', share: bb ? +(100 * a / bb).toFixed(1) : null, visible: a, total: bb, dir, front: f ? [Math.round(f.x - c.x), Math.round(f.y - c.y)] : null, walkers, what });
          }));
          window.__step.frame();
        }));
        window.__step.frame();
      });
    });
    for (const seat of res) {
      // (the median of three read-backs half a second apart: bubbles bob, the merchant turns)
      const reads = [];
      for (let k = 0; k < 3; k++) { reads.push(await ev((seat) => window.__cvShare(seat, false, -1), seat)); await advance(page, 0.5); }
      reads.sort((p, q) => (p.share || 0) - (q.share || 0));
      const r = Object.assign({}, reads[1], { reads: reads.map((q) => q.share) });
      const ri = await ev((seat) => window.__cvShare(seat, true, -1), seat);
      if (r.share >= MIN && r.dir === 3 && r.front) console.log(`ok   stage ${st} ${r.counter} clerk visible ${r.share} % >= ${MIN} % with every line's front customer present, faces SW (${ri.share} % with the porters / residents passing as they are)`, JSON.stringify(r));
      else {
        fails++; console.log(`FAIL stage ${st} ${r.counter} clerk visible ${r.share} % (gate ${MIN} %) / dir ${r.dir} (SW = 3) / front ${JSON.stringify(r.front)}`, JSON.stringify(r));
        // (who covers her: each picture drawn above her, hidden in turn)
        for (let k = 0; k < 8; k++) { const q = await ev(([seat, k]) => window.__cvShare(seat, false, k), [seat, k]); if (!q) break; console.log(`     without ${JSON.stringify(q.what)}: ${q.share} %`); }
      }
    }
    // the stage's signboard with full racks (a snapshot that comes back empty — the read-back raced the frame — is taken again)
    let sg = null;
    for (let tries = 0; tries < 3 && !(sg && sg.share !== null); tries++) sg = await ev(() => new Promise((resolve) => {
      const g = window.__FV.scene, m = g.market, o = m.sign, cam = g.cameras.main, R = g.game.renderer;
      if (!o) return resolve({ none: true });
      for (const ty of m.goods) while (m.stock.countOf(ty) < m.maxPerType) m.stock.push(ty, null, g.effects);
      if (g.trade.enabled) for (const ty of g.trade.goods) while (g.trade.stock.countOf(ty) < g.trade.maxPerType) g.trade.stock.push(ty, null, g.effects);
      m.stock.bakeDirty = true; g.trade.stock.bakeDirty = true;
      window.__step.run(1); window.__step.frame();
      const b = o.getBounds(), k = cam.zoom;
      const x = Math.max(0, Math.floor(cam.x + (b.x - cam.worldView.x) * k) - 4), y = Math.max(0, Math.floor(cam.y + (b.y - cam.worldView.y) * k) - 4);
      const w = Math.max(1, Math.min(R.width - x, Math.ceil(b.width * k) + 8)), h = Math.max(1, Math.min(R.height - y, Math.ceil(b.height * k) + 8));
      const count = (img, done) => { const go = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const x2 = cv.getContext('2d'); x2.drawImage(img, 0, 0); const d = x2.getImageData(0, 0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200) n++; done(n); }; if (img.complete && img.naturalWidth) go(); else img.onload = go; };
      const a0 = o.alpha; o.setAlpha(1); o.setTintFill(0xff00ff);
      R.snapshotArea(x, y, w, h, (imgA) => count(imgA, (a) => {
        const d0 = o.depth; o.setDepth(1e7);
        R.snapshotArea(x, y, w, h, (imgB) => count(imgB, (bb) => { o.setDepth(d0); o.clearTint(); o.setAlpha(a0); resolve({ share: bb ? +(100 * a / bb).toFixed(1) : null, font: m.signFont, stock: m.stock.count, mat: g.trade.stock.count, rect: [x, y, w, h], vis: o.visible, b: [Math.round(b.x), Math.round(b.y)], wv: [Math.round(cam.worldView.x), Math.round(cam.worldView.y)] }); }));
        window.__step.frame();
      }));
      window.__step.frame();
    }));
    if (sg.none) { fails++; console.log(`FAIL stage ${st}: no signboard`); }
    else if (sg.share >= 95) console.log(`ok   stage ${st} signboard visible ${sg.share} % with full racks`, JSON.stringify(sg));
    else { fails++; console.log(`FAIL stage ${st} signboard hidden ${sg.share} %`, JSON.stringify(sg)); }
    await ev(() => { const m = window.__FV.scene.market; window.__FV.camera(m.x - 20, m.y - 10, 1.5); });
    await advance(page, 0.3); await render(page, 3);
    await page.screenshot({ path: path.join(OUT, 'v43_clerks_s' + st + '.jpg'), type: 'jpeg', quality: 84 });
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
