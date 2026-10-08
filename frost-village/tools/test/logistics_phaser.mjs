// Logistics fragment (assets/logistics, CONTRACT_V8 section AA) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/logistics_phaser.mjs
// Loads assets/logistics/manifest.json + every atlas (Phaser JSON hash), registers sprite anims exactly like
// src/core/Assets.js spriteAnims() (spr:<key>:<anim>) and vehicle anims ({anim}_{dir}_{i}), checks that every sprite,
// patch, item, producer and vehicle frame (incl. overlays) exists, then builds the logistics centre the documented
// way (layers at one anchor, depth = base + depthOffset, stock on rackSlots, a forklift driving forkliftPath, the
// conveyor / dock doors / office lamp playing) and tests the REVEAL TOGGLE: a pointer tap inside revealPoly fades the
// shell (+ dock door patches) out, a second tap brings it back; hover (pointermove) also reveals on desktop.
// Writes docs/previews/lgx_phaser_closed.png, lgx_phaser_open.png and /tmp/fv_review/logistics_phaser.json.
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
    const off = (name) => ({ back: -0.40, floor: -0.35, interior: -0.30, lamp: -0.29, interior_front: -0.10, conveyor: -0.09,
      stub: -0.02, shell_cut: -0.015, shell: 0, dock1: 0.001, dock2: 0.001, props: 0.01 })[name];
    const put = (key, d) => { const s = sp[key]; return this.add.sprite(ox, oy, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(base + d); };
    const layers = {};
    for (const n of ['back', 'floor', 'interior', 'interior_front', 'stub', 'shell_cut', 'shell', 'props']) layers[n] = put(C.layers[n], sp[C.layers[n]].depthOffset);
    layers.shell_cut.setAlpha(0);
    const patches = {};
    for (const [n, key] of Object.entries(C.patches)) {
      patches[n] = put(key, sp[key].depthOffset); const an = Object.keys(sp[key].anims)[0];
      if (n.startsWith('dock')) patches[n].play({ key: 'spr:' + key + ':' + an, repeat: -1, yoyo: true, repeatDelay: 700 });
      else patches[n].play('spr:' + key + ':' + an);
    }
    // stock: item stacks on every rack slot (0.8x), clipped to maxStackPx
    let order = 0;
    for (const s of [...C.rackSlots].sort((a, b) => a.drawOrder - b.drawOrder)) {
      const cat = C.rackCategories[s.category]; const key = cat[(s.slot + s.level) % cat.length]; const it = sp[key];
      const sc = 0.8, top = (it.topPx || 40) * sc, step = it.stackStep * sc;
      const n = Math.max(1, Math.min(3, Math.floor((s.maxStackPx - top) / step) + 1));
      for (let k = 0; k < n; k++) this.add.image(ox + s.point[0], oy + s.point[1] - k * step, it.atlas, it.frame).setOrigin(0.5, 0.75).setScale(sc).setDepth(base - 0.25 + (order++) * 1e-5);
    }
    // forklift (loaded) driving the path: SE/NE rendered, SW/NW = flipX; band from the path legs
    const fk = ch.forklift_loaded;
    const fl = this.add.sprite(0, 0, fk.atlas, 'move_SE_0').setOrigin(fk.anchor[0], fk.anchor[1]);
    const P = C.forkliftPath; let leg = 0;
    const drive = () => {
      const a = P[leg], b = P[(leg + 1) % P.length];
      const dx = b.point[0] - a.point[0], dy = b.point[1] - a.point[1];
      const dir = Math.abs(dx) < 1 && Math.abs(dy) < 1 ? a.dir : (dx >= 0 ? (dy >= 0 ? 'SE' : 'NE') : (dy >= 0 ? 'SW' : 'NW'));
      const rd = dir === 'SW' ? 'SE' : dir === 'NW' ? 'NE' : dir;
      fl.setFlipX(dir === 'SW' || dir === 'NW');
      fl.play('veh:forklift_loaded:move:' + rd, true);
      const band = a.legBand === 'front' ? -0.05 : -0.2;
      fl.setDepth(base + band + 1e-4);
      this.tweens.add({ targets: fl, x: ox + b.point[0], y: oy + b.point[1], duration: 120 + Math.hypot(dx, dy) * 9,
        onComplete: () => { leg = (leg + 1) % P.length; drive(); } });
    };
    fl.setPosition(ox + P[0].point[0], oy + P[0].point[1]); drive();
    // a truck + van at the docks (outside: depth above the building)
    const dv = C.dockVehiclePoints;
    const van = ch.delivery_van_red, mt = ch.moving_truck;
    this.add.sprite(ox + dv.delivery_van[0][0], oy + dv.delivery_van[0][1], van.atlas, 'idle_SE_0').setOrigin(van.anchor[0], van.anchor[1]).setDepth(base + 1).play('veh:delivery_van_red:idle:SE');
    this.add.sprite(ox + dv.moving_truck[1][0], oy + dv.moving_truck[1][1], mt.atlas, 'idle_SE_0').setOrigin(mt.anchor[0], mt.anchor[1]).setDepth(base + 1.1).play('veh:moving_truck:idle:SE');
    // producers, items shelf (right side)
    let x = 1000, y = 120;
    for (const k of ['furniture_workshop', 'appliance_factory']) { const s = sp[k]; this.add.sprite(x + 110, y + 140, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setScale(0.6).play('spr:' + k + ':work'); x += 200; }
    x = 990; y = 330;
    for (const [k, s] of Object.entries(sp)) { if (s.kind !== 'item') continue; this.add.image(x, y, s.atlas, s.frame).setOrigin(0.5, 0.75); x += 70; if (x > 1370) { x = 990; y += 70; } }
    // ---- reveal toggle: tap inside revealPoly (or hover on desktop)
    const poly = new Phaser.Geom.Polygon(C.revealPoly.map(([px, py]) => new Phaser.Geom.Point(ox + px, oy + py)));
    const fadeTargets = [layers.shell, patches.dock1, patches.dock2];
    const reveal = (on) => { L.revealed = on; L.toggles++; this.tweens.add({ targets: fadeTargets, alpha: on ? 0 : 1, duration: (C.reveal && C.reveal.fadeMs) || 350 }); };
    this.input.on('pointerdown', (p) => { if (Phaser.Geom.Polygon.Contains(poly, p.x, p.y)) reveal(!L.revealed); });
    this.input.on('pointermove', (p) => { if (p.isDown) return; const inside = Phaser.Geom.Polygon.Contains(poly, p.x, p.y); if (L.hoverMode && inside !== L.revealed) reveal(inside); });
    L.center = [ox, oy]; L.poly = C.revealPoly; L.shellAlpha = () => layers.shell.alpha; L.scene = this; L.ready = true;
  }
}
window.__L.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1400, height: 900, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
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
const closedPng = path.join(prev, 'lgx_phaser_closed.png');
const openPng = path.join(prev, 'lgx_phaser_open.png');
await page.screenshot({ path: closedPng });
// tap inside the reveal polygon (its centroid)
const target = await page.evaluate(() => { const [ox, oy] = window.__L.center; const p = window.__L.poly;
  const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cy = p.reduce((s, q) => s + q[1], 0) / p.length; return [ox + cx, oy + cy]; });
await page.mouse.click(target[0], target[1]);
await sleep(900);
const afterTap = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha() }));
await page.screenshot({ path: openPng });
await page.mouse.click(target[0], target[1]);
await sleep(900);
const afterTap2 = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha() }));
// hover mode: moving into the polygon reveals, moving out closes
await page.evaluate(() => { window.__L.hoverMode = true; });
await page.mouse.move(5, 5);
await page.mouse.move(target[0], target[1], { steps: 4 });
await sleep(800);
const afterHover = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha() }));
await page.mouse.move(5, 5, { steps: 4 });
await sleep(800);
const afterLeave = await page.evaluate(() => ({ revealed: window.__L.revealed, alpha: window.__L.shellAlpha() }));
const res = await page.evaluate(() => {
  const L = window.__L, sc = L.scene;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('lgx_')).length, anims: L.anims.length,
    framesChecked: L.frames, missing: L.missing, playing: sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length,
    toggles: L.toggles };
});
const a = fs.readFileSync(closedPng), b = fs.readFileSync(openPng);
const changed = !a.equals(b);
const revealOk = afterTap.revealed && afterTap.alpha < 0.05 && !afterTap2.revealed && afterTap2.alpha > 0.95 &&
  afterHover.revealed && afterHover.alpha < 0.05 && !afterLeave.revealed && afterLeave.alpha > 0.95 && changed;
Object.assign(res, { afterTap, afterTap2, afterHover, afterLeave, screenshotsDiffer: changed, revealOk });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/logistics_phaser.json', JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || !revealOk ? 1 : 0);
