// (v4.2.0.1) ghostsweep replay of the designer's screenshot (Play 4.2.0, coins 0, "손님이 낸 코인을 주우세요"), run by
// tools/test/ghostsweep.mjs (section 'replay'; also on its own). Taken over from the ghost-sweep confirm stage.
// Replay of the designer's two reports on Play 4.2.0 (screenshot d3766c93: coins 0, "손님이 낸 코인을 주우세요"):
//   1) "물고기와 고기가 있는것으로 보이는데 다 소비했어 ... 동전도 먹었는데 안사라져" — the raw-fish pile at the grill, the
//      grilled-fish tower at the stall and the coins keep showing after they were consumed / sold / collected;
//   2) "물고기를 구우면 고기가 쌓이지 않고 사라져 그러다가 마지막고기 구울때 보여" — while the grill cooks, its output
//      does not pile up: each grilled fish vanishes after it lands and only the newest shows.
// A FRESH game is played through the first loop the way the tutorial leads it (the chief walks to each spot; here he is
// put there and the game's own pad logic moves every item): catch fish at the net -> stand on 서서 굽기 (the fish hop
// into the grill, the chief cooks) -> take the grilled fish -> put them on the stall shelf -> stand at the register while
// the queue buys and pays -> take the coins. Then the grill cooks more rounds (the chief, then the hired cook 쿡) without
// anyone taking the output, the fisherman fills the fish crate at the net, and the chief empties it.
// At every step the MODEL (count of each stack, the till's value) is compared with what is DRAWN:
//   slot   the stack's baked picture (its slot of the shared bake texture fv_stackbake, read back from the GPU / canvas)
//          against a picture of the items it really holds, drawn the same way into a scratch texture: `mism` = pixels
//          that differ (0 = the picture is exactly its items); `ghost` px = drawn but not held, `missing` px = held but
//          not drawn. Items that just landed and are not baked yet show as their own sprite (counted as `live`).
//   screen the stack's picture as the player sees it: canvas pixels that change when the baked picture is hidden
//   loose  item sprites on the village layer that belong to no stack and are not flying (left-behind pictures)
// Stacks: grill.in (the raw-fish pile left of the grill), grill.out (the grilled fish right of it), shelf (the stall's
// grilled-fish tower), till (the coin pile in front of the stall), pile.fish (the fish crate at the net), chief (his
// carry). The grill's own art (station_grill) has fish drawn on its grate in every frame: not a stack — the ART checks
// count cooked-fish-coloured pixels in the frame the grill shows while it is empty and idle (a fresh game, and after
// everything was cooked and taken) against the same count for one item_fish_cooked; they fail until the idle grill
// art shows an empty grate (--no-art skips them).
//   node tools/test/ghostsweep_replay.mjs [--root <frost-village dir>] [--tag name] [--canvas] [--dpr 2.625] [--out dir] [--every 3] [--no-shots] [--no-art]
// default root: this checkout (../..); exit code 1 when any check fails (on Play 4.2.0 they are expected to fail).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const H = HERE + '/';
const { start } = await import(H + 'serve.mjs');
const { launch, openPage, tapStart, sleep, waitFor, loadPlaywright } = await import(H + 'pw.mjs');

const ROOT = path.resolve(arg('root', path.join(HERE, '..', '..')));
const CANVAS = argv.includes('--canvas');
const DPR = +arg('dpr', 2.625) || 2.625;
const EVERY = Math.max(1, +arg('every', 3) || 3);   // draw every 3rd step (20 fps; the bake flushes at most 15 times a second)
const SHOTS = !argv.includes('--no-shots');
const ART = !argv.includes('--no-art');
const QUICK = argv.includes('--quick');              // skip steps 8-10 (the long cooking rounds, the fisherman)             // the ART checks (food painted into the grill's own picture)
const TAG = arg('tag', /play/.test(ROOT) ? 'play' : 'hotfix') + (CANVAS ? '_canvas' : '_webgl');
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'fv_ghostsweep_replay')));
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const fails = [];
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ok   ' + msg); }
  else { fail++; fails.push(msg); console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); }
};
const rows = [];

// ---------------------------------------------------------------- in-page helpers (window.__rp)
const INSTALL = (every) => {
  if (window.__rp) return;
  const game = window.__FV.game, gs = () => window.__FV.scene, A = window.__FV.assets();
  // fixed-step clock (as tools/test/fv_step.mjs, plus a zero-time redraw)
  game.loop.sleep();
  let D = Date.now(), T = game.loop.time || performance.now();
  Date.now = () => D;
  const DT = 1000 / 60;
  const R = window.__rp = { t: 0, every };
  R.step = (draw) => { T += DT; D += DT; R.t += DT / 1000; if (draw) game.step(T, DT); else game.headlessStep(T, DT); };
  R.still = () => game.step(T, 0);
  /** play `sec` of game time drawing every R.every-th step (60 fps when 1); hook(i) after each step, true = stop */
  R.play = (sec, hook) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { R.step(i % R.every === R.every - 1); if (hook && hook(i)) return i + 1; } return n; };

  const named = () => {
    const g = gs(), S = g.stations, m = new Map();
    m.set('grill.in', S.grill.inStack); m.set('grill.out', S.grill.outStack);
    m.set('shelf', g.market.stock); m.set('till', g.market.cash.pile);
    if (g.piles && g.piles.fish) m.set('pile.fish', g.piles.fish.stack);
    m.set('chief', g.player.stack);
    return m;
  };
  R.named = named;
  const readDT = (dt, x, y, w, h) => {
    const r = gs().renderer;
    if (r.gl && dt.renderTarget) {
      const gl = r.gl, prev = r.currentFramebuffer;
      r.setFramebuffer(dt.renderTarget.framebuffer);
      const d = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d);
      r.setFramebuffer(prev || null);
      return d;
    }
    return dt.context.getImageData(x, y, w, h).data;
  };
  // the picture a stack's items make, drawn the way StackBaker.flush draws them, into a scratch texture
  let scratch = null, stamp = null;
  const expected = (stack) => {
    const g = gs(), s = stack.slot;
    if (!scratch) { scratch = g.textures.addDynamicTexture('rp_scratch', 1024, 1024); stamp = g.make.image({ x: 0, y: 0, key: '__WHITE', add: false }); }
    scratch.clear();
    let any = false, n = 0;
    for (const it of stack.items) {
      if (it.spr) continue;                 // landed, not baked yet: its own sprite shows it
      const r = A.sprite(it.type);
      if (!r || r.ph || r.pending) continue;
      if (!any) { scratch.beginDraw(); any = true; }
      stamp.setTexture(r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]);
      stamp.setScale(it.sx || stack.scale, it.sy || stack.scale);
      scratch.batchDraw(stamp, s.ox + (it.x - stack.bx), s.oy + (it.y - stack.by));
      n++;
    }
    if (any) scratch.endDraw();
    return { d: readDT(scratch, 0, 0, s.w, s.h), n };
  };
  /** one stack: model vs its baked picture */
  R.check = (name) => {
    const g = gs(), st = named().get(name);
    if (!st) return { name, missing: true };
    const live = st.items.filter((it) => it.spr);
    const liveShown = live.filter((it) => it.spr.visible && it.spr.alpha > 0.02).length;
    const row = { name, count: st.count, incoming: st.incoming, baked: st.items.length - live.length, live: live.length, liveShown };
    if (name === 'till') row.value = g.market.cash.value;
    if (!st.bakeOn || !st.slot) { row.mode = st.bakeOn ? 'no slot yet' : 'sprites'; row.shown = st.items.filter((it) => it.spr && it.spr.visible && it.spr.alpha > 0.02).length; row.ok = !st.bakeOn ? row.shown === st.count || !st.visible : st.count === 0 || st.items.every((it) => it.spr); return row; }
    const s = st.slot, B = st.baker;
    row.slot = s.name + '@' + s.x + ',' + s.y;
    row.dirty = !!st.bakeDirty || B.dirty.has(st);
    row.img = st.bakeImg ? { vis: st.bakeImg.visible, a: +st.bakeImg.alpha.toFixed(2) } : null;
    const P = readDT(B.dt, s.x, s.y, s.w, s.h), E = expected(st);
    let pp = 0, ep = 0, gh = 0, mi = 0;
    for (let i = 3; i < P.length; i += 4) { const a = P[i] > 8, e = E.d[i] > 8; if (a) pp++; if (e) ep++; if (a && !e) gh++; if (e && !a) mi++; }
    Object.assign(row, { px: pp, want: ep, ghost: gh, miss: mi, mism: gh + mi });
    // pending: the picture is queued for the next flush (at most 1/15 s away) — judged only when settled
    // (the Canvas renderer anti-aliases an item drawn at a fractional place a little differently in the scratch texture: a
    //  few edge pixels may cross the alpha threshold — tolerated up to 4 px or 0.3 % of the picture; one item is 200+ px, and
    //  a stack that holds nothing must show 0 px exactly)
    const tol = ep ? Math.max(4, Math.round(ep * 0.003)) : 0;
    row.ok = row.dirty ? null : row.mism <= tol && liveShown === live.length;
    return row;
  };
  R.checkAll = () => { const o = {}; for (const k of named().keys()) o[k] = R.check(k); return o; };
  /** draw until no named baked stack waits for its flush (max 30 steps), then check them */
  R.settle = () => { for (let i = 0; i < 30; i++) { const any = Array.from(named().values()).some((st) => st.slot && (st.bakeDirty || st.baker.dirty.has(st))); if (!any) break; R.step(true); } return R.checkAll(); };

  // ---- the canvas: pixels a stack's baked picture changes on screen (hide it, redraw with no game time, compare)
  const readCanvas = (x, y, w, h) => {
    const g = gs(), r = g.renderer, cv = g.game.canvas;
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.min(cv.width - x, Math.ceil(w)); h = Math.min(cv.height - y, Math.ceil(h));
    if (w <= 0 || h <= 0) return null;
    if (r.gl) { const gl = r.gl, prev = r.currentFramebuffer; r.setFramebuffer(null); const d = new Uint8Array(w * h * 4); gl.readPixels(x, cv.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); r.setFramebuffer(prev || null); return d; }
    return cv.getContext('2d').getImageData(x, y, w, h).data;
  };
  const diff = (P, Q) => { if (!P || !Q || P.length !== Q.length) return -1; let n = 0; for (let i = 0; i < P.length; i += 4) if (Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2])) > 20) n++; return n; };
  R.screen = (names) => {
    const g = gs(), cam = g.cameras.main, wv = cam.worldView, z = cam.zoom, out = {};
    for (const name of names) {
      const st = named().get(name);
      if (!st || !st.bakeImg) { out[name] = null; continue; }
      const b = st.bakeImg.getBounds();
      const box = [(b.x - wv.x) * z, (b.y - wv.y) * z, b.width * z, b.height * z];
      R.still(); const P = readCanvas(...box);
      const v = st.bakeImg.visible; st.bakeImg.setVisible(false);
      R.still(); const Q = readCanvas(...box);
      st.bakeImg.setVisible(v);
      R.still(); const P2 = readCanvas(...box);
      out[name] = { px: diff(P, Q), noise: diff(P, P2), box: box.map(Math.round) };
    }
    return out;
  };
  // ---- item pictures that belong to no stack and are not moving
  const allStacks = () => {
    const g = gs(), seen = new Set(), isStack = (v) => v && typeof v === 'object' && Array.isArray(v.items) && 'bakeOn' in v && 'cols' in v;
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 4) return;
      let keys; try { keys = Object.keys(o); } catch (e) { return; }
      for (const k of keys) {
        if (k === 'scene' || k === 'gs' || k === 'sys' || k === 'game' || k === 'parent' || k === 'baker' || k === 'textures') continue;
        let v; try { v = o[k]; } catch (e) { continue; }
        if (!v || typeof v !== 'object') continue;
        if (isStack(v)) { seen.add(v); continue; }
        if (v.constructor && /^(Image|Sprite|Text|Container|Graphics|Tween|.*Pipeline|WebGL.*|Camera.*)$/.test(v.constructor.name)) continue;
        walk(v, d + 1);
      }
    };
    walk(g, 0);
    if (g.__stackBaker) for (const s of g.__stackBaker.stacks) seen.add(s);
    return seen;
  };
  R.loose = () => {
    const g = gs(), owned = new Set();
    for (const s of allStacks()) for (const it of s.items) if (it.spr) owned.add(it.spr);
    if (g.net && g.net.fish) for (const f of g.net.fish) owned.add(f);       // the fish jumping in the net (one per fish it holds)
    const list = (o) => o && o.__type && o.visible && o.alpha > 0.02 && !o.__pooled && !owned.has(o) && !g.tweens.isTweening(o);
    const a = g.children.list.filter(list).map((o) => [o, o.x, o.y]);
    R.play(0.25);
    return a.filter(([o, x, y]) => list(o) && Math.abs(o.x - x) < 0.5 && Math.abs(o.y - y) < 0.5).map(([o]) => ({ type: o.__type, x: Math.round(o.x), y: Math.round(o.y) }));
  };
  R.net = () => { const N = gs().net; return { stock: N.stock, shown: N.fish.filter((f) => f.visible && f.alpha > 0.02).length }; };
  R.grillArt = () => { const S = gs().stations.grill; return { frame: S.img.frame ? String(S.img.frame.name) : null, working: S.working, in: S.inStack.count, out: S.outStack.count }; };
  R.screenOf = (x, y) => { const g = gs(), cam = g.cameras.main, cv = g.game.canvas, rc = cv.getBoundingClientRect(); return { x: rc.left + (x - cam.worldView.x) * cam.zoom * rc.width / cv.width, y: rc.top + (y - cam.worldView.y) * cam.zoom * rc.height / cv.height }; };
  R.where = () => {
    const g = gs(), S = g.stations.grill, m = g.market, P = g.piles && g.piles.fish;
    return { net: { x: g.net.gather.x, y: g.net.gather.y }, op: { x: S.op.x, y: S.op.y }, grillIn: { x: S.inPad.x, y: S.inPad.y }, grillOut: { x: S.outPad.x, y: S.outPad.y }, shelf: { x: m.shelf.x, y: m.shelf.y }, register: { x: m.register.x, y: m.register.y }, cash: { x: m.cash.x, y: m.cash.y }, pile: P ? { x: P.x, y: P.y } : null, grill: { x: S.x, y: S.y } };
  };
  R.slots = () => { const g = gs(), B = g.__stackBaker, nm = new Map(Array.from(named()).map(([k, v]) => [v, k])); return B ? B.stacks.map((s) => (nm.get(s) || '-') + ' ' + s.slot.name + '@' + s.slot.x + ',' + s.slot.y + ' ' + s.slot.w + 'x' + s.slot.h) : []; };
  // ---- ART: food painted into a building's own picture (not a stack: it shows whatever the model holds).
  // `food` = opaque pixels of cooked-fish / meat colour (hue 0-32 deg, saturation 0.35-0.85, value > 0.55) in the frame
  // the object shows now, read from the atlas page; compared with the same count for ONE grilled fish (item_fish_cooked)
  // (box: the part of the frame looked at, as fractions [x0, y0, x1, y1] — for the grill its grate, without the bucket)
  const foodOf = (tex, frameName, box) => {
    const g = gs(), T = g.textures.get(tex), f = T && T.get(frameName);
    if (!f || !f.source || !f.source.image) return -1;
    const c = document.createElement('canvas'); c.width = f.cutWidth; c.height = f.cutHeight;
    const x = c.getContext('2d'); x.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    const d = x.getImageData(0, 0, c.width, c.height).data, bx = box || [0, 0, 1, 1];
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4) % c.width, py = Math.floor(i / 4 / c.width);
      if (px < bx[0] * c.width || px >= bx[2] * c.width || py < bx[1] * c.height || py >= bx[3] * c.height) continue;
      if (d[i + 3] < 128) continue;
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), s = mx ? (mx - mn) / mx : 0;
      if (mx === mn || mx !== r) continue;                      // red is the top channel for orange / salmon
      const h = (((gg - b) / (mx - mn)) % 6) / 6;               // hue as a fraction of the circle
      if (h >= 0 && h <= 0.09 && s >= 0.35 && s <= 0.85 && mx > 0.55) n++;
    }
    return n;
  };
  R.art = () => {
    const g = gs(), S = g.stations.grill, A2 = window.__FV.assets(), it = A2.sprite('item_fish_cooked');
    const one = it ? foodOf(it.tex.key || it.tex, it.frame) : -1;
    const grate = S.img && S.img.frame ? { frame: String(S.img.frame.name), food: foodOf(S.img.texture.key, S.img.frame.name, [0, 0, 0.8, 0.72]) } : {};
    // (the stall counter and the net: only their frame names — wood has the same hue as cooked fish, a count means nothing there)
    const nm = (img) => (img && img.frame ? String(img.frame.name) : null);
    return { oneFish: one, grill: Object.assign(grate, { working: S.working, in: S.inStack.count, out: S.outStack.count }), counter: nm(g.market.img), net: { frame: nm(g.net.img), stock: g.net.stock } };
  };
};

// ---------------------------------------------------------------- run
const srv = await start(0, { prefix: '/fv/', root: ROOT });
const browser = CANVAS
  ? await loadPlaywright().chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-3d-apis', '--no-sandbox'] })
  : await launch();
const t0 = Date.now();
const E = (page, fn, a) => page.evaluate(fn, a);
let tPhase = Date.now();
const lap = () => { const d = ((Date.now() - tPhase) / 1000).toFixed(0); tPhase = Date.now(); return d + ' s'; };
const fmt = (r) => {
  if (!r) return '-';
  if (r.mode) return `${r.name}: n=${r.count} ${r.mode} shown=${r.shown}`;
  const v = r.value !== undefined ? ` value=${r.value}` : '';
  return `${r.name}: n=${r.count}${r.incoming ? '+' + r.incoming : ''}${v} baked=${r.baked} live=${r.live} | slot ${r.px}px want ${r.want}px ghost ${r.ghost} missing ${r.miss}${r.dirty ? ' (pending flush)' : ''}`;
};
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 412, height: 915 }, dpr: DPR });
  await E(page, () => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2000);
  await E(page, INSTALL, EVERY);
  await E(page, () => window.__rp.play(0.5));
  const R0 = await E(page, () => ({ r: window.__FV.game.renderer.type, cv: [window.__FV.game.canvas.width, window.__FV.game.canvas.height], obj: window.__FV.state().objective, coins: window.__FV.state().coins }));
  console.log(`[${TAG}] root ${ROOT}\n  renderer ${R0.r === 2 ? 'WebGL' : 'Canvas'}, canvas ${R0.cv.join('x')} (412x915 CSS px, dpr ${DPR}), fresh game: coins ${R0.coins}, objective ${R0.obj}, drawing every ${EVERY} step(s)`);
  ok(CANVAS ? R0.r === 1 : R0.r === 2, 'the renderer under test');
  // ART (the "grilled fish on the grill" of the screenshot): a fresh game, nothing caught, nothing cooked yet
  const art0 = await E(page, () => window.__rp.art());
  console.log('  ART fresh game: ' + JSON.stringify(art0) + '  (food = cooked-fish-coloured px of the frame shown; oneFish = one item_fish_cooked)');
  rows.push({ phase: 'art fresh', art: art0 });
  if (ART) ok(art0.grill.food >= 0 && art0.grill.food < art0.oneFish * 0.5, `ART: the empty, idle grill shows no food on its grate (frame ${art0.grill.frame}: ${art0.grill.food} food px = ${(art0.grill.food / Math.max(1, art0.oneFish)).toFixed(1)} grilled fish worth; holds in=${art0.grill.in} out=${art0.grill.out})`, art0.grill);
  const W = await E(page, () => window.__rp.where());
  // the camera holds the plaza as in the designer's screenshot: the net and the grill on the left, the stall, till and register on the right
  const cam = { x: Math.round((W.net.x + W.register.x) / 2), y: Math.round((W.net.y + W.cash.y) / 2) + 40 };
  await E(page, (c) => { window.__FV.camera(c.x, c.y); window.__rp.play(0.3); }, cam);

  const shot = async (name) => {
    if (!SHOTS) return;
    const a = await E(page, ([w, c]) => { window.__FV.camera(c.x, c.y); window.__rp.still(); return [window.__rp.screenOf(w.net.x - 140, w.net.y - 110), window.__rp.screenOf(w.register.x + 90, w.cash.y + 120)]; }, [W, cam]);
    const clip = { x: Math.max(0, a[0].x), y: Math.max(0, a[0].y) };
    clip.width = Math.min(412 - clip.x, a[1].x - clip.x); clip.height = Math.min(915 - clip.y, a[1].y - clip.y);
    const f = path.join(OUT, `${TAG}_${name}.jpg`);
    await page.screenshot({ path: f, clip, type: 'jpeg', quality: 88 });
    console.log('  shot ' + f);
  };
  const record = (phase, all, extra) => { rows.push(Object.assign({ phase, t: undefined }, { stacks: all }, extra || {})); };
  const show = (all, names) => { for (const n of names) console.log('    ' + fmt(all[n])); };
  // (the camera is put back on the plaza after every move: a reveal pan / hire focus ends and the camera would follow the chief)
  const tp = (p) => E(page, ([q, c]) => { window.__FV.teleport(q.x, q.y); window.__FV.camera(c.x, c.y); window.__rp.play(1 / 60); }, [p, cam]);
  const away = (dx, dy, sec) => E(page, ([w, c, a, b, s]) => { window.__FV.teleport(w.register.x + a, w.register.y + b); window.__FV.camera(c.x, c.y); window.__rp.play(s); }, [W, cam, dx, dy, sec]);

  // ======================================================== 1. the designer's first loop
  console.log('  [' + lap() + ']\n1. catch fish at the net');
  await tp(W.net);
  const caught = await E(page, () => { const p = window.__FV.scene.player; window.__rp.play(20, () => p.stack.count >= p.capacity && p.stack.incoming === 0); return { n: p.stack.count, cap: p.capacity }; });
  let all = await E(page, () => window.__rp.settle());
  show(all, ['chief']);
  ok(caught.n === caught.cap, `the chief caught ${caught.n} fish (bag ${caught.cap})`);
  ok(all.chief.ok, 'every fish he carries is drawn on his head (' + all.chief.shown + ' of ' + all.chief.count + ')', all.chief);
  const nf = await E(page, () => window.__rp.net());
  ok(nf.shown === nf.stock, `the net shows one jumping fish per fish it holds (${nf.shown} shown, ${nf.stock} held)`, nf);

  console.log('  [' + lap() + ']\n2. stand on 서서 굽기: the fish hop into the grill and the chief cooks them (every cooked fish checked)');
  // per drawn frame: grill.in / grill.out model vs picture; per cooked fish: right after it is baked, and at the end of its cycle
  await tp(W.op);
  const cook = async (label, stopFn, maxSec) => E(page, ([lbl, stopSrc, mx]) => {
    const R = window.__rp, g = window.__FV.scene, S = g.stations.grill, stop = new Function('g', 'S', 'return (' + stopSrc + ')(g, S)');
    const per = [];          // one row per landing on grill.out
    const inRows = [];       // grill.in after each change
    let lastOut = S.outStack.count, lastIn = S.inStack.count, cur = null, frames = 0, wrongFrames = 0, missFrames = 0, ghostFrames = 0, lastFl = -1, lastO2 = -1;
    const t0 = R.t;
    R.play(mx, (i) => {
      const drawn = i % R.every === R.every - 1;
      const o = S.outStack.count, n = S.inStack.count;
      if (o > lastOut) { if (cur) per.push(cur); cur = { k: per.length + 1, n: o, landedAt: +(R.t - t0).toFixed(2), first: null, last: null, frames: 0, wrong: 0, miss: 0 }; }
      lastOut = o;
      // (the slots change only when the baker flushes, the model when an item lands / leaves: checked then)
      const fl = g.__stackBaker ? g.__stackBaker.flushes : 0;
      if (drawn && (fl !== lastFl || o !== lastO2 || n !== lastIn)) {
        lastFl = fl; lastO2 = o;
        const out = R.check('grill.out');
        if (out.ok !== null && out.ok !== undefined) {
          frames++;
          if (!out.ok) { wrongFrames++; if (out.miss > 0) missFrames++; if (out.ghost > 0) ghostFrames++; }
          if (cur) { cur.frames++; if (!out.ok) cur.wrong++; if (out.miss > 0) cur.miss++; if (!cur.first) cur.first = out; cur.last = out; }
        }
        if (n !== lastIn) { const r = R.check('grill.in'); r.at = +(R.t - t0).toFixed(2); inRows.push(r); lastIn = n; }
        else if (inRows.length && inRows[inRows.length - 1].ok === null) { const r = R.check('grill.in'); r.at = +(R.t - t0).toFixed(2); inRows[inRows.length - 1] = r; }
      }
      return stop(g, S);
    });
    // the last fish lands as the round ends: draw on until its picture is baked, then check it too
    if (cur && !cur.frames) {
      for (let k = 0; k < 30; k++) {
        R.step(true);
        const out = R.check('grill.out');
        if (out.ok === null || out.ok === undefined) continue;
        frames++; cur.frames++; cur.first = cur.first || out; cur.last = out;
        if (!out.ok) { wrongFrames++; cur.wrong++; if (out.miss > 0) { missFrames++; cur.miss++; } if (out.ghost > 0) ghostFrames++; }
        break;
      }
    }
    if (cur) per.push(cur);
    return { label: lbl, per, inRows, frames, wrongFrames, missFrames, ghostFrames, sec: +(R.t - t0).toFixed(2) };
  }, [label, stopFn.toString(), maxSec]);

  const reportCook = (c, who) => {
    console.log(`  ${c.label}: ${c.per.length} grilled fish landed in ${c.sec} s; grill.out picture wrong in ${c.wrongFrames} of ${c.frames} drawn frames (held fish not drawn in ${c.missFrames}, ghosts in ${c.ghostFrames})`);
    for (const p of c.per) {
      const f = p.first || {}, l = p.last || {};
      console.log(`    fish #${p.k}: out=${p.n}  baked: ${f.px}px/${f.want}px want (missing ${f.miss}, ghost ${f.ghost})  end of cycle: ${l.baked} baked, ${l.px}px/${l.want}px want (missing ${l.miss})  wrong ${p.wrong}/${p.frames} frames`);
    }
    const bad = c.per.filter((p) => p.wrong > 0);
    ok(c.per.length > 0 && bad.length === 0, `${who}: after EVERY cooked fish the grill's output shows exactly the fish it holds (${c.per.length - bad.length}/${c.per.length} fish clean, ${c.wrongFrames} wrong frames)`, bad.slice(0, 3).map((p) => ({ k: p.k, n: p.n, wrong: p.wrong, frames: p.frames, last: p.last && { px: p.last.px, want: p.last.want, miss: p.last.miss } })));
    const inBad = c.inRows.filter((r) => r.ok === false);
    ok(inBad.length === 0, `${who}: the raw-fish pile left of the grill follows its count at every change (${c.inRows.length} changes, ${inBad.length} wrong)`, inBad.slice(0, 3).map((r) => ({ n: r.count, px: r.px, want: r.want, ghost: r.ghost, miss: r.miss, at: r.at })));
    rows.push({ phase: c.label, cook: c });
  };
  // ...the shot right after the fish went into the grill (the fullest raw-fish pile)
  await E(page, () => { const R = window.__rp, S = window.__FV.scene.stations.grill; R.play(3, () => S.inStack.count >= 6 || window.__FV.scene.player.stack.count === 0); });
  all = await E(page, () => window.__rp.settle());
  show(all, ['chief', 'grill.in', 'grill.out']);
  await shot('1_fish_in_grill');
  const c1 = await cook('the chief cooks 6', (g, S) => S.inStack.count === 0 && S.inStack.incoming === 0 && S.outStack.incoming === 0, 20);
  reportCook(c1, 'chief cooking');
  await E(page, () => window.__rp.play(1));
  all = await E(page, () => window.__rp.settle());
  show(all, ['grill.in', 'grill.out']);
  let scr = await E(page, () => window.__rp.screen(['grill.in', 'grill.out']));
  console.log('    screen: grill.in ' + JSON.stringify(scr['grill.in']) + ' grill.out ' + JSON.stringify(scr['grill.out']));
  ok(all['grill.in'].count === 0 && all['grill.in'].ok && all['grill.in'].px === 0, 'every fish was cooked: nothing left in the raw-fish pile\'s picture (' + all['grill.in'].px + ' px)', all['grill.in']);
  ok(!scr['grill.in'] || scr['grill.in'].px === 0, 'and nothing of it on screen (' + (scr['grill.in'] ? scr['grill.in'].px : '-') + ' px)', scr['grill.in']);
  ok(all['grill.out'].count === 6 && all['grill.out'].ok, 'the 6 grilled fish all show at the grill (' + all['grill.out'].px + ' px of ' + all['grill.out'].want + ')', all['grill.out']);
  const art = await E(page, () => window.__rp.grillArt());
  console.log('    grill art: ' + JSON.stringify(art) + ' (station_grill: "stone hearth + iron grate with fish" — the fish on the grate are part of the grill picture in every frame)');
  rows.push({ phase: 'grill art after cooking', art });
  await shot('2_cooked');

  console.log('  [' + lap() + ']\n3. take the grilled fish');
  await tp(W.grillOut);
  await E(page, () => { const R = window.__rp, S = window.__FV.scene.stations.grill, p = window.__FV.scene.player; R.play(10, () => S.outStack.count === 0 && p.stack.incoming === 0); R.play(0.3); });
  all = await E(page, () => window.__rp.settle());
  show(all, ['chief', 'grill.out']);
  scr = await E(page, () => window.__rp.screen(['grill.out']));
  ok(all['grill.out'].count === 0 && all['grill.out'].ok && all['grill.out'].px === 0 && (!scr['grill.out'] || scr['grill.out'].px === 0), 'taken: the grill\'s output shows nothing (' + all['grill.out'].px + ' px, screen ' + (scr['grill.out'] ? scr['grill.out'].px : '-') + ' px)', [all['grill.out'], scr]);
  ok(all.chief.ok && all.chief.count === 6, 'the chief carries the 6 grilled fish, all drawn (' + all.chief.shown + ')', all.chief);

  console.log('  [' + lap() + ']\n4. put them on the stall shelf (every landing checked)');
  await tp(W.shelf);
  const shelfIn = await E(page, () => {
    const R = window.__rp, g = window.__FV.scene, st = g.market.stock, p = g.player, rs = [];
    let last = st.count;
    // (customers take from the shelf as soon as fish lie there: every change is checked once it is baked)
    R.play(6, (i) => { if (st.count !== last) { last = st.count; for (let k = 0; k < 30 && (st.bakeDirty || st.baker && st.baker.dirty.has(st)); k++) R.step(true); rs.push(R.check('shelf')); } return p.stack.countOf('item_fish_cooked') === 0 && st.incoming === 0; });
    return rs;
  });
  for (const r of shelfIn) console.log('    ' + fmt(r));
  const sb = shelfIn.filter((r) => r.ok === false);
  ok(shelfIn.length > 0 && sb.length === 0, `the stall shelf shows exactly what it holds at every change while it is stocked (${shelfIn.length} changes, ${sb.length} wrong)`, sb.slice(0, 3));
  await away(140, 140, 0.2);
  all = await E(page, () => window.__rp.settle());
  show(all, ['shelf', 'till']);
  await shot('3_shelf_stocked');

  console.log('  [' + lap() + ']\n5. stand at the register: the queue buys every fish and pays (every shelf / till change checked)');
  await tp(W.register);
  const sell = await E(page, () => {
    const R = window.__rp, g = window.__FV.scene, m = g.market, st = m.stock, pile = m.cash.pile, rs = [];
    let ls = st.count, lt = pile.count, lv = m.cash.value;
    const t0 = R.t;
    R.play(60, () => {
      if (st.count !== ls || pile.count !== lt || m.cash.value !== lv) {
        ls = st.count; lt = pile.count; lv = m.cash.value;
        for (let k = 0; k < 30 && [st, pile].some((s) => s.slot && (s.bakeDirty || s.baker.dirty.has(s))); k++) R.step(true);
        rs.push({ at: +(R.t - t0).toFixed(2), shelf: R.check('shelf'), till: R.check('till') });
      }
      return st.count === 0 && st.incoming === 0 && !m.waitingPay && pile.incoming === 0 && m.cash.value > 0 && R.t - t0 > 2;
    });
    return { rs, sec: +(R.t - t0).toFixed(1), value: m.cash.value, coins: pile.count, queue: m.queue.length };
  });
  console.log(`  sold out in ${sell.sec} s: till value ${sell.value}, ${sell.coins} coins on the pad, queue ${sell.queue}`);
  for (const r of sell.rs) console.log(`    t=${r.at}  ${fmt(r.shelf)}\n             ${fmt(r.till)}`);
  const shelfBad = sell.rs.filter((r) => r.shelf.ok === false), tillBad = sell.rs.filter((r) => r.till.ok === false);
  ok(shelfBad.length === 0, `while it sells, the shelf picture shrinks with its count (${sell.rs.length} changes, ${shelfBad.length} wrong)`, shelfBad.slice(0, 3).map((r) => r.shelf));
  ok(tillBad.length === 0, `while customers pay, the coin pile follows the coins on it (${tillBad.length} wrong)`, tillBad.slice(0, 3).map((r) => r.till));
  await E(page, () => window.__rp.play(0.5));
  all = await E(page, () => window.__rp.settle());
  show(all, ['shelf', 'till']);
  scr = await E(page, () => window.__rp.screen(['shelf', 'till']));
  console.log('    screen: shelf ' + JSON.stringify(scr.shelf) + ' till ' + JSON.stringify(scr.till));
  ok(all.shelf.count === 0 && all.shelf.ok && all.shelf.px === 0 && (!scr.shelf || scr.shelf.px === 0), 'sold out: the stall shows no grilled fish (' + all.shelf.px + ' px, screen ' + (scr.shelf ? scr.shelf.px : '-') + ' px)', [all.shelf, scr.shelf]);
  await shot('4_sold_coins');

  console.log('  [' + lap() + ']\n6. take the coins');
  const before6 = await E(page, () => { const g = window.__FV.scene; return { v0: g.market.cash.value, e0: g.economy.coins }; });
  await tp(W.cash);
  const took = await E(page, (b) => { const R = window.__rp, g = window.__FV.scene, c = g.market.cash; const v0 = b.v0, e0 = b.e0; R.play(8, () => c.value === 0 && c.pile.count === 0 && c.pile.incoming === 0); R.play(0.5); return { v0, got: g.economy.coins - e0, value: c.value, coins: c.pile.count }; }, before6);
  await away(140, 140, 0.5);
  all = await E(page, () => window.__rp.settle());
  show(all, ['till']);
  scr = await E(page, () => window.__rp.screen(['till']));
  console.log(`    the chief got ${took.got} coins (till had ${took.v0}); screen till ` + JSON.stringify(scr.till));
  ok(took.got >= took.v0 && took.v0 > 0, `the chief took the till's ${took.v0} coins`);
  ok(all.till.value === 0 && all.till.count === 0 && all.till.ok && all.till.px === 0 && (!scr.till || scr.till.px === 0), 'collected: no coin left in the till\'s picture (' + all.till.px + ' px, screen ' + (scr.till ? scr.till.px : '-') + ' px)', [all.till, scr.till]);

  console.log('  [' + lap() + ']\n7. the designer\'s moment: everything was consumed, sold and collected');
  await tp({ x: W.net.x + 40, y: W.net.y + 30 });
  await E(page, () => window.__rp.play(2));
  all = await E(page, () => window.__rp.settle());
  show(all, ['grill.in', 'grill.out', 'shelf', 'till', 'chief']);
  scr = await E(page, () => window.__rp.screen(['grill.in', 'grill.out', 'shelf', 'till']));
  console.log('    screen ' + JSON.stringify(scr));
  const loose = await E(page, () => window.__rp.loose());
  console.log('    loose item pictures not owned and not moving: ' + JSON.stringify(loose));
  const st7 = await E(page, () => { const s = window.__FV.state(); return { coins: s.coins, objective: s.objective, market: s.market }; });
  console.log('    ' + JSON.stringify(st7));
  for (const n of ['grill.in', 'grill.out', 'shelf', 'till']) {
    const r = all[n], s = scr[n];
    if (r.count === 0) ok(r.ok && r.px === 0 && (!s || s.px === 0), `${n} holds nothing and shows nothing (slot ${r.px} px, screen ${s ? s.px : '-'} px)`, [r, s]);
    else ok(r.ok, `${n} holds ${r.count} and shows exactly that (${r.px}/${r.want} px)`, r);
  }
  ok(loose.length === 0, 'no left-behind item picture in the village (' + loose.length + ')', loose.slice(0, 5));
  const nf7 = await E(page, () => window.__rp.net());
  ok(nf7.shown === nf7.stock, `the net shows one jumping fish per fish it holds (${nf7.shown} shown, ${nf7.stock} held)`, nf7);
  const art7 = await E(page, () => window.__rp.art());
  console.log('    ART now: ' + JSON.stringify(art7));
  if (ART) ok(art7.grill.working || art7.grill.food < art7.oneFish * 0.5, `ART: everything cooked and taken, the idle grill shows no food (frame ${art7.grill.frame}: ${art7.grill.food} food px = ${(art7.grill.food / Math.max(1, art7.oneFish)).toFixed(1)} grilled fish worth; in=${art7.grill.in} out=${art7.grill.out})`, art7.grill);
  record('7 designer moment', all, { screen: scr, loose, state: st7, art: art7 });
  await shot('5_after_all');

  // ======================================================== 2. the second report: the grill output must pile up
  if (!QUICK) {
  console.log('  [' + lap() + ']\n8. two more rounds: the chief catches and cooks, nobody takes the output (it must grow 0 -> 12)');
  for (let round = 1; round <= 2; round++) {
    // (round 1 at the net as before; round 2 the 6 fish are put in his bag — a shortcut, the cooking is what is checked)
    await tp(W.net);
    if (round === 1) await E(page, () => { const p = window.__FV.scene.player; window.__rp.play(20, () => p.stack.count >= p.capacity && p.stack.incoming === 0); });
    else await E(page, () => { window.__FV.carry('item_fish_raw', 6); window.__rp.play(0.5); });
    // (back at the net between rounds the output must stay drawn while customers queue / pay elsewhere)
    all = await E(page, () => window.__rp.settle());
    ok(all['grill.out'].ok, `round ${round}: back from the net, the grill output still shows its ${all['grill.out'].count} fish (${all['grill.out'].px}/${all['grill.out'].want} px)`, all['grill.out']);
    await tp(W.op);
    const c = await cook('round ' + round + ': the chief cooks 6 more', (g, S) => S.inStack.count === 0 && S.inStack.incoming === 0 && S.outStack.incoming === 0 && window.__FV.scene.player.stack.count === 0, 20);
    reportCook(c, 'chief round ' + round);
  }
  await E(page, () => window.__rp.play(0.5));
  all = await E(page, () => window.__rp.settle());
  show(all, ['grill.in', 'grill.out']);
  ok(all['grill.out'].count === 12 && all['grill.out'].ok, `the output holds 12 and shows 12 (${all['grill.out'].px}/${all['grill.out'].want} px)`, all['grill.out']);
  await shot('6_out12_chief');

  console.log('  [' + lap() + ']\n9. the hired cook (쿡) cooks: the chief drops 6 fish at the grill\'s input twice and walks off');
  const hired = await E(page, () => { const ok1 = window.__FV.doneStep('op_grill'); const S = window.__FV.scene.stations.grill; window.__rp.play(3, () => S.op.operator && S.op.operator.ready); return { ok: ok1, ready: !!(S.op.operator && S.op.operator.ready) }; });
  ok(hired.ready, 'the cook stands at the grill');
  for (let round = 1; round <= 2; round++) {
    await tp(W.net);
    await E(page, () => { window.__FV.carry('item_fish_raw', 6); window.__rp.play(0.3); });
    await tp(W.grillIn);
    const fed = await E(page, () => { const R = window.__rp, S = window.__FV.scene.stations.grill, p = window.__FV.scene.player, rs = []; let last = S.inStack.count; R.play(4, () => { if (S.inStack.count !== last) { last = S.inStack.count; } return p.stack.count === 0 && S.inStack.incoming === 0; }); return S.inStack.count; });
    await away(140, 140, 1 / 60);
    const c = await cook(`cook round ${round}: 쿡 cooks the ${fed} fish`, (g, S) => S.inStack.count === 0 && S.inStack.incoming === 0 && S.outStack.incoming === 0, 25);
    reportCook(c, 'cook round ' + round);
  }
  await E(page, () => window.__rp.play(0.5));
  all = await E(page, () => window.__rp.settle());
  show(all, ['grill.in', 'grill.out']);
  ok(all['grill.out'].ok && all['grill.out'].count >= 20, `the output holds ${all['grill.out'].count} and shows exactly that (${all['grill.out'].px}/${all['grill.out'].want} px)`, all['grill.out']);
  await shot('7_out_cook');

  console.log('  [' + lap() + ']\n10. the fisherman fills the fish crate at the net; the chief empties it (every change checked)');
  const fish = await E(page, () => {
    const R = window.__rp, g = window.__FV.scene;
    window.__FV.doneStep('hire_fisherman');
    const P = g.piles.fish, st = P.stack, rs = [];
    let last = st.count;
    const t0 = R.t;
    R.play(45, () => { if (st.count !== last) { last = st.count; for (let k = 0; k < 30 && st.slot && (st.bakeDirty || st.baker.dirty.has(st)); k++) R.step(true); const r = R.check('pile.fish'); r.at = +(R.t - t0).toFixed(1); rs.push(r); } return st.count >= 5; });
    return { rs, shown: P.shown, n: st.count };
  });
  for (const r of fish.rs) console.log('    t=' + r.at + ' ' + fmt(r));
  const fb = fish.rs.filter((r) => r.ok === false);
  ok(fish.n >= 5 && fb.length === 0, `the crate grows with every fish the fisherman drops (${fish.rs.length} changes to ${fish.n}, ${fb.length} wrong)`, fb.slice(0, 3));
  const Wp = await E(page, () => window.__rp.where());
  await tp(Wp.pile);
  const fish2 = await E(page, () => {
    const R = window.__rp, g = window.__FV.scene, st = g.piles.fish.stack, p = g.player, rs = [];
    // the fisherman keeps dropping: the chief takes until his bag is full
    let last = st.count;
    R.play(6, () => { if (st.count !== last) { last = st.count; for (let k = 0; k < 30 && (st.bakeDirty || st.baker.dirty.has(st)); k++) R.step(true); rs.push(R.check('pile.fish')); } return p.stack.count >= p.capacity && p.stack.incoming === 0; });
    return rs;
  });
  for (const r of fish2) console.log('    ' + fmt(r));
  const fb2 = fish2.filter((r) => r.ok === false);
  ok(fish2.length > 0 && fb2.length === 0, `taken by the chief: the crate shrinks with its count (${fish2.length} changes, ${fb2.length} wrong)`, fb2.slice(0, 3));
  await away(140, 140, 1);
  all = await E(page, () => window.__rp.settle());
  show(all, ['pile.fish', 'grill.in', 'grill.out', 'shelf', 'till']);
  const bad = Object.values(all).filter((r) => r.ok === false);
  ok(bad.length === 0, 'at the end every stack of the chain shows exactly what it holds', bad);
  const loose2 = await E(page, () => window.__rp.loose());
  ok(loose2.length === 0, 'no left-behind item picture in the village (' + loose2.length + ')', loose2.slice(0, 5));
  rows.push({ phase: 'end', stacks: all, loose: loose2, slots: await E(page, () => window.__rp.slots()) });
  await shot('8_end');
  }

  // ======================================================== 3. "the bake only happens near the view": changes made while the camera is away
  console.log('  [' + lap() + ']\n11. the chain changes while the camera is far away (a stack off screen is re-baked only when it comes near); then the camera comes back');
  // (a fresh village's camera box (territory.camRect) keeps the whole plaza within 700 px of the view: the game itself never
  //  takes these stacks off screen this early. The box is lifted — as a later, bigger village allows — to test the mechanism)
  const far = await E(page, (w) => {
    const g = window.__FV.scene, z0 = g.zoomCur, keys = ['grill.in', 'grill.out', 'shelf', 'till'];
    const cands = [[2600, 0], [-2600, 0], [0, 2600], [0, -2600], [2600, 2600], [-2600, 2600]].map(([dx, dy]) => ({ x: w.register.x + dx, y: w.register.y + dy }));
    for (const c of cands) {
      window.__FV.camera(c.x, c.y, 0.69); window.__FV.camera(c.x, c.y, z0); window.__rp.step(true); window.__rp.step(true);  // (worldView is updated when a frame is drawn)
      const n = window.__rp.named();
      if (keys.every((k) => !g.isOnScreen(n.get(k).bx, n.get(k).by, 720))) return { x: c.x, y: c.y, z0 };
    }
    const v = g.cameras.main.worldView;
    return { fail: true, z0, view: [Math.round(v.x), Math.round(v.y), Math.round(v.width), Math.round(v.height)] };
  }, W);
  console.log('    camera away at ' + JSON.stringify(far));
  ok(!far.fail, 'the camera can be put far from the plaza (all four stacks > 700 px outside the view)', far);
  if (!far.fail) {
    // (the chief is put at each spot; the camera stays far away after every move)
    const tpFar = (p) => E(page, ([q, c]) => { window.__FV.teleport(q.x, q.y); window.__FV.camera(c.x, c.y); window.__rp.step(true); }, [p, far]);
    const before11 = await E(page, () => { const n = window.__rp.named(); return Object.fromEntries(['grill.in', 'grill.out', 'shelf', 'till'].map((k) => [k, n.get(k).count])); });
    // a) the chief takes 6 grilled fish from the grill output (it shrinks), b) drops 6 raw fish at its input (it grows; the cook
    // cooks them: input shrinks, output grows), c) stocks the shelf (grows) while the queue buys (shrinks) and pays (the till grows)
    await tpFar(W.grillOut);
    await E(page, () => { const R = window.__rp, p = window.__FV.scene.player; R.play(6, () => p.stack.count >= p.capacity && p.stack.incoming === 0); R.play(0.3); });
    await tpFar(W.shelf);
    await E(page, () => { const R = window.__rp, g = window.__FV.scene, p = g.player, st = g.market.stock; R.play(8, () => p.stack.countOf('item_fish_cooked') === 0 && st.incoming === 0); });
    await tpFar(W.net);
    await E(page, () => { window.__FV.carry('item_fish_raw', 6); window.__rp.play(0.3); });
    await tpFar(W.grillIn);
    await E(page, () => { const R = window.__rp, S = window.__FV.scene.stations.grill, p = window.__FV.scene.player; R.play(4, () => p.stack.count === 0 && S.inStack.incoming === 0); });
    // (nobody works the register yet: the chief stands there so the queue pays — the till grows off screen)
    await tpFar(W.register);
    await E(page, () => { const R = window.__rp, m = window.__FV.scene.market, t0 = R.t; R.play(30, () => m.stock.count === 0 && m.stock.incoming === 0 && !m.waitingPay && m.cash.pile.incoming === 0 && m.cash.value > 0 && R.t - t0 > 2); });
    await tpFar({ x: W.register.x + 140, y: W.register.y + 140 });
    const mid = await E(page, () => { const R = window.__rp, g = window.__FV.scene, S = g.stations.grill; R.play(8, () => S.inStack.count === 0 && S.outStack.incoming === 0); R.play(2); const n = R.named(); return { counts: Object.fromEntries(['grill.in', 'grill.out', 'shelf', 'till'].map((k) => [k, n.get(k).count])), value: g.market.cash.value, dirtyOff: ['grill.in', 'grill.out', 'shelf', 'till'].filter((k) => n.get(k).bakeDirty) }; });
    console.log('    while away: before ' + JSON.stringify(before11) + ' -> now ' + JSON.stringify(mid.counts) + ', till value ' + mid.value + '; stacks waiting to be re-baked: ' + JSON.stringify(mid.dirtyOff));
    // back: the camera returns to the plaza — every picture must be right on the first frames it is drawn
    const back = await E(page, (c) => {
      const R = window.__rp, keys = ['grill.in', 'grill.out', 'shelf', 'till'];
      window.__FV.camera(c.x, c.y);
      const frames = [];
      for (let i = 0; i < 6; i++) { R.step(true); const o = {}; for (const k of keys) { const r = R.check(k); o[k] = { n: r.count, px: r.px, want: r.want, ghost: r.ghost, miss: r.miss, ok: r.ok }; } frames.push(o); }
      return frames;
    }, cam);
    const firstOk = (k) => back.findIndex((f) => f[k].ok === true);
    for (const k of ['grill.in', 'grill.out', 'shelf', 'till']) {
      const i = firstOk(k), wrongShown = back.slice(0, i < 0 ? back.length : i).filter((f) => f[k].ok === false).length;
      console.log(`    back: ${k} n=${back[0][k].n}: right from drawn frame ${i < 0 ? 'never (of 6)' : i + 1}; first frame ${back[0][k].px}px/${back[0][k].want}px want (ghost ${back[0][k].ghost}, missing ${back[0][k].miss})`);
      ok(i >= 0 && i <= 1 && wrongShown === 0, `camera back: ${k} (${back[0][k].n} held) shows exactly what it holds from the first frames (frame ${i + 1}, ${wrongShown} wrong frames drawn)`, back.map((f) => f[k]).slice(0, 3));
    }
    all = await E(page, () => window.__rp.settle());
    scr = await E(page, () => window.__rp.screen(['grill.in', 'grill.out', 'shelf', 'till']));
    show(all, ['grill.in', 'grill.out', 'shelf', 'till']);
    for (const n of ['grill.in', 'grill.out', 'shelf', 'till']) ok(all[n].ok && (all[n].count > 0 || !scr[n] || scr[n].px === 0), `camera back, settled: ${n} holds ${all[n].count} and shows exactly that (${all[n].px}/${all[n].want} px, screen ${scr[n] ? scr[n].px : '-'} px)`, [all[n], scr[n]]);
    // and the till emptied while the camera is away (the chief takes the coins, then the camera comes back)
    const W11 = await E(page, () => window.__rp.where());
    await tpFar(W11.cash);
    await E(page, () => { const R = window.__rp, c = window.__FV.scene.market.cash; R.play(8, () => c.value === 0 && c.pile.count === 0 && c.pile.incoming === 0); R.play(0.5); });
    await tpFar({ x: W.register.x + 140, y: W.register.y + 140 });
    const back2 = await E(page, (c) => { const R = window.__rp; window.__FV.camera(c.x, c.y); const fr = []; for (let i = 0; i < 4; i++) { R.step(true); const r = R.check('till'); fr.push({ n: r.count, px: r.px, want: r.want, ok: r.ok }); } return fr; }, cam);
    const ti = back2.findIndex((f) => f.ok === true);
    ok(ti >= 0 && ti <= 1 && back2[0].n === 0, `camera back after the coins were taken off screen: the till shows no coin (frame ${ti + 1}: ${back2[ti < 0 ? 0 : ti].px} px)`, back2);
    rows.push({ phase: '11 camera away', before: before11, mid, back, back2 });
    await E(page, (c) => { const g = window.__FV.scene; g._freeCam = false; g.resetBounds(); window.__FV.camera(c.x, c.y); window.__rp.play(0.1); }, cam);
    await shot('9_camera_back');
  }
  console.log('\n  bake slots: ' + (await E(page, () => window.__rp.slots())).join(' | '));
  ok(log.errors.length === 0, 'no page errors', log.errors.slice(0, 3));
} finally {
  await browser.close();
  await srv.close();
}
fs.writeFileSync(path.join(OUT, `replay_${TAG}.json`), JSON.stringify({ tag: TAG, root: ROOT, dpr: DPR, every: EVERY, pass, fail, fails, rows }, null, 1));
console.log('  [' + lap() + ']'); console.log(`\n[${TAG}] ${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(fail ? 1 : 0);
