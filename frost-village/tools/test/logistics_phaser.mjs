// Logistics fragment (assets/logistics, CONTRACT_V8 section AA) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/logistics_phaser.mjs
// Loads assets/logistics/manifest.json + every atlas (Phaser JSON hash), registers sprite anims exactly like
// src/core/Assets.js spriteAnims() (spr:<key>:<anim>) and vehicle anims ({anim}_{dir}_{i}), checks that every sprite,
// patch, item, producer and vehicle frame (incl. overlays) exists, then builds the logistics centre the documented
// way (layers at one anchor, depth = base + depthOffset, stock from rackSlots[].itemFit / cells / stockScale, a forklift
// driving forkliftPath facing legDir, the conveyor / dock doors / office lamp playing, the Korean nameplate, the
// outdoorProps y-sorted with the docked vehicles) and tests the REVEAL TOGGLE: a pointer tap inside revealPoly fades
// the shell + dock door leaves + nameplate out and _shadow_open in, a second tap reverses it; hover (pointermove) also
// reveals on desktop.
// Writes docs/previews/lgx_phaser_closed.png, lgx_phaser_open.png and /tmp/fv_cache/logistics/logistics_phaser.json.
// Exit 1 on missing frames, page errors, 404s or a reveal that does not change the picture.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#dfe8f2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/logistics/manifest.json')).json();
window.__L = { ready: false, missing: [], anims: [], frames: 0, revealed: false, toggles: 0 };
class S extends Phaser.Scene {
  preload() { for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); }
  create() {
    const L = window.__L, tex = this.textures, sp = man.sprites, ch = man.characters;
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    // ---- frame checks + anim registration (Assets.spriteAnims semantics)
    for (const [k, s] of Object.entries(sp)) {
      L.frames++;
      if (!has(s.atlas, s.frame)) L.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        const frames = a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f }));
        L.frames += a.frames.length;
        if (frames.length !== a.frames.length) L.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat !== undefined ? a.repeat : -1 });
        L.anims.push(key);
      }
    }
    for (const [k, v] of Object.entries(ch)) {
      for (const [an, a] of Object.entries(v.anims)) for (const d of v.dirs) {
        const names = []; for (let i = 0; i < a.frames; i++) names.push(an + '_' + d + '_' + i);
        for (const n of names) { L.frames++; if (!has(v.atlas, n)) L.missing.push(k + ':' + n); if (v.overlay && !has(v.overlay.atlas, 'over_' + n)) L.missing.push(k + ':over_' + n); }
        const key = 'veh:' + k + ':' + an + ':' + d;
        this.anims.create({ key, frames: names.filter((n) => has(v.atlas, n)).map((n) => ({ key: v.atlas, frame: n })), frameRate: a.fps, repeat: a.repeat !== undefined ? a.repeat : -1 });
        L.anims.push(key);
      }
    }
    // ---- the centre, composed by the manifest rules
    this.add.rectangle(700, 450, 1400, 900, 0xeef3f9).setDepth(-1e6);
    const C = sp.logistics_center, ox = 560, oy = 470, base = 0;
    const put = (key, d) => { const s = sp[key]; return this.add.sprite(ox, oy, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(base + d); };
    const layers = {};
    for (const n of Object.keys(C.layers)) layers[n] = put(C.layers[n], sp[C.layers[n]].depthOffset);
    layers.shell_cut.setAlpha(0);
    layers.shadow_open.setAlpha(0);
    layers.nameplate_en.setVisible(false);          // one nameplate per language (ko here)
    L.layerCount = Object.keys(C.layers).length;
    const patches = {};
    for (const [n, key] of Object.entries(C.patches)) {
      patches[n] = put(key, sp[key].depthOffset); const an = Object.keys(sp[key].anims)[0];
      if (n.startsWith('dock')) patches[n].play({ key: 'spr:' + key + ':' + an, repeat: -1, yoyo: true, repeatDelay: 700 });
      else patches[n].play('spr:' + key + ':' + an);
    }
    // stock (conventions.stock): one item key per slot from slot.itemFit, one stack per cells[sizeClass] cell, at
    // stockScale[category], itemFit[key] copies per stack (= full shelves); back rows (u < 0) first
    let order = 0; L.stockImages = 0; L.stockOverflow = 0;
    for (const s of [...C.rackSlots].sort((a, b) => a.drawOrder - b.drawOrder)) {
      const keys = C.rackCategories[s.category].filter((k) => s.itemFit && s.itemFit[k]);
      if (!keys.length) { L.missing.push('no itemFit for ' + s.rack + s.level + s.slot); continue; }
      const key = keys[(s.slot + s.level) % keys.length]; const it = sp[key];
      const sc = C.stockScale[s.category] || 0.85, top = (it.topPx || 40) * sc, step = it.stackStep * sc;
      const n = s.itemFit[key];
      if (top + (n - 1) * step > s.maxStackPxBy[it.sizeClass] + 0.5) L.stockOverflow++;
      const cells = [...s.cells[it.sizeClass]].sort((a, b) => a[1] - b[1]);
      for (const [t, u] of cells) {
        const x = s.point[0] + s.spanPx[0] * t + s.depthPx[0] * u, y = s.point[1] + s.spanPx[1] * t + s.depthPx[1] * u;
        // band 'stock' = inside the racks (under _interior_racks), 'front' = floor bays, y-sorted with the front actors
        const d0 = s.band === 'front' ? C.bandDepth.front + (y + 400) * 1e-6 : C.bandDepth.stock + (order++) * 1e-5;
        for (let k = 0; k < n; k++) { this.add.image(ox + x, oy + y - k * step, it.atlas, it.frame).setOrigin(0.5, 0.75).setScale(sc).setDepth(base + d0 + k * 1e-7); L.stockImages++; }
      }
    }
    // forklift (loaded) driving the path: SE/NE rendered, SW/NW = flipX; band from the path legs
    const fk = ch.forklift_loaded;
    const fl = this.add.sprite(0, 0, fk.atlas, 'move_SE_0').setOrigin(fk.anchor[0], fk.anchor[1]);
    const P = C.forkliftPath; let leg = 0; L.legs = 0;
    const face = (d) => { const rd = d === 'SW' ? 'SE' : d === 'NW' ? 'NE' : d; fl.setFlipX(d === 'SW' || d === 'NW'); return rd; };
    const drive = () => {
      const a = P[leg], b = P[(leg + 1) % P.length];
      const dx = b.point[0] - a.point[0], dy = b.point[1] - a.point[1];
      // the leg is driven facing a.legDir (backwards when a.reverse); the band of the leg is a.legBand
      fl.play('veh:forklift_loaded:move:' + face(a.legDir), true);
      const band = a.legBand === 'mid' ? C.bandDepth.mid : C.bandDepth.front;
      fl.setDepth(base + band + (a.point[1] + 400) * 1e-6 + 1e-7);
      this.tweens.add({ targets: fl, x: ox + b.point[0], y: oy + b.point[1], duration: 120 + Math.hypot(dx, dy) * 9,
        onComplete: () => { leg = (leg + 1) % P.length; L.legs++; const n = P[leg];
          if (n.action) { fl.play('veh:forklift_loaded:lift:' + face(n.dir), true); fl.once('animationcomplete', drive); } else drive(); } });
    };
    fl.setPosition(ox + P[0].point[0], oy + P[0].point[1]); drive();
    // a van at dock 1 (van bay) + the moving truck at dock 2 (truck bay) and the outdoor props: outside actors,
    // y-sorted together (depth = 1 + y * 1e-4 here; the game uses depth = y)
    const dv = C.dockVehiclePoints;
    const van = ch.delivery_van_red, mt = ch.moving_truck;
    const ysort = (y) => base + 1 + (y + 400) * 1e-4;
    this.add.sprite(ox + dv.delivery_van[0][0], oy + dv.delivery_van[0][1], van.atlas, 'idle_SE_0').setOrigin(van.anchor[0], van.anchor[1]).setDepth(ysort(dv.delivery_van[0][1])).play('veh:delivery_van_red:idle:SE');
    this.add.sprite(ox + dv.moving_truck[1][0], oy + dv.moving_truck[1][1], mt.atlas, 'idle_SE_0').setOrigin(mt.anchor[0], mt.anchor[1]).setDepth(ysort(dv.moving_truck[1][1])).play('veh:moving_truck:idle:SE');
    L.props = 0;
    for (const op of C.outdoorProps) {
      const s = sp[op.sprite]; if (!has(s.atlas, s.frame)) { L.missing.push(op.sprite); continue; }
      this.add.image(ox + op.point[0], oy + op.point[1], s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(ysort(op.point[1])); L.props++;
    }
    // producers, items shelf (right side)
    let x = 1010, y = 30;
    for (const k of ['furniture_workshop', 'appliance_factory']) { const s = sp[k]; this.add.sprite(x + 90, y + 150, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setScale(0.5).play('spr:' + k + ':work'); x += 190; }
    x = 1010; y = 240;
    for (const [k, s] of Object.entries(sp)) { if (s.kind !== 'item') continue; this.add.image(x, y, s.atlas, s.frame).setOrigin(0.5, 0.75).setScale(0.6); x += 48; if (x > 1370) { x = 1010; y += 46; } }
    // ---- reveal toggle: tap inside revealPoly (or hover on desktop)
    const poly = new Phaser.Geom.Polygon(C.revealPoly.map(([px, py]) => new Phaser.Geom.Point(ox + px, oy + py)));
    const fadeOut = [layers.shell, patches.dock1, patches.dock2, layers.nameplate_ko], fadeIn = [layers.shadow_open];
    const ms = (C.reveal && C.reveal.fadeMs) || 350;
    const reveal = (on) => { L.revealed = on; L.toggles++; this.tweens.add({ targets: fadeOut, alpha: on ? 0 : 1, duration: ms }); this.tweens.add({ targets: fadeIn, alpha: on ? 1 : 0, duration: ms }); };
    this.input.on('pointerdown', (p) => { if (Phaser.Geom.Polygon.Contains(poly, p.x, p.y)) reveal(!L.revealed); });
    this.input.on('pointermove', (p) => { if (p.isDown) return; const inside = Phaser.Geom.Polygon.Contains(poly, p.x, p.y); if (L.hoverMode && inside !== L.revealed) reveal(inside); });
    L.center = [ox, oy]; L.poly = C.revealPoly; L.shellAlpha = () => layers.shell.alpha; L.shadowAlpha = () => layers.shadow_open.alpha; L.scene = this; L.ready = true;
  }
}
window.__L.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1400, height: 900, backgroundColor: '#eef3f9',
  render: { antialias: true }, fps: { target: 20, forceSetTimeOut: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__lgx.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__lgx.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__L && window.__L.ready, null, { timeout: 180000 });
await sleep(1500);
const prev = path.join(ROOT, 'docs', 'previews');
fs.mkdirSync(prev, { recursive: true });
// the shared build machine runs SwiftShader under heavy load: pause the game loop while the page is captured, and wait
// for the reveal tween by state (not by wall-clock sleeps)
const shot = async (p) => {
  await page.evaluate(() => window.__L.game.loop.sleep());
  await page.screenshot({ path: p, timeout: 240000 });
  await page.evaluate(() => window.__L.game.loop.wake());
};
const settle = (open) => page.waitForFunction((o) => { const a = window.__L.shellAlpha(); return o ? a < 0.05 : a > 0.95; },
  open, { timeout: 120000, polling: 200 }).catch(() => null);
const closedPng = path.join(prev, 'lgx_phaser_closed.png');
const openPng = path.join(prev, 'lgx_phaser_open.png');
await shot(closedPng);
// tap inside the reveal polygon (its centroid)
const target = await page.evaluate(() => { const [ox, oy] = window.__L.center; const p = window.__L.poly;
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length; return [ox + cx, oy + cy]; });
await page.mouse.click(target[0], target[1]);
await settle(true);
const afterTap = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha(), shadow: window.__L.shadowAlpha() }));
await shot(openPng);
await page.mouse.click(target[0], target[1]);
await settle(false);
const afterTap2 = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha(), shadow: window.__L.shadowAlpha() }));
// hover mode: moving into the polygon reveals, moving out closes
await page.evaluate(() => { window.__L.hoverMode = true; });
await page.mouse.move(5, 5);
await page.mouse.move(target[0], target[1], { steps: 4 });
await settle(true);
const afterHover = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha(), shadow: window.__L.shadowAlpha() }));
await page.mouse.move(5, 5, { steps: 4 });
await settle(false);
const afterLeave = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha(), shadow: window.__L.shadowAlpha() }));
const res = await page.evaluate(() => {
  const L = window.__L, sc = L.scene;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('lgx_')).length, anims: L.anims.length,
    framesChecked: L.frames, missing: L.missing, playing: sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length,
    toggles: L.toggles, layers: L.layerCount, outdoorProps: L.props, stockImages: L.stockImages, stockOverflow: L.stockOverflow,
    forkliftLegs: L.legs, shadowOpenAtEnd: L.shadowAlpha() };
});
const a = fs.readFileSync(closedPng), b = fs.readFileSync(openPng);
const changed = !a.equals(b);
const revealOk = afterTap.revealed && afterTap.alpha < 0.05 && afterTap.shadow > 0.95 && !afterTap2.revealed &&
  afterTap2.alpha > 0.95 && afterTap2.shadow < 0.05 && afterHover.revealed && afterHover.alpha < 0.05 &&
  !afterLeave.revealed && afterLeave.alpha > 0.95 && changed;
Object.assign(res, { afterTap, afterTap2, afterHover, afterLeave, screenshotsDiffer: changed, revealOk });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
const outDir = process.env.LGX_OUT || '/tmp/fv_cache/logistics';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'logistics_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || !revealOk || res.stockOverflow || !res.outdoorProps ? 1 : 0);
