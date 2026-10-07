// Townfolk paper-doll check + perf in headless Chromium (Phaser 3.90, WebGL via SwiftShader).
//   node tools/test/townfolk_preview.mjs [count=100]
// Loads assets/townfolk/manifest.json + atlases into a bare Phaser page (no game code), composes
// people with tools/townfolk_compose.js (the JS port of the python reference) and measures:
//   A. live layered sprites: N walking townsfolk -> sprites, draw calls / texture binds per frame, ms per frame
//   B. baseline: N single-sprite characters (assets/villagers atlases, one sprite each)
//   C. bake-at-spawn: time + GPU memory to bake one person's full frame set into a RenderTexture
// Writes docs/previews/townfolk_phaser.png (screenshot of A) and /tmp/fv_review/townfolk_perf.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const N = Number(process.argv[2] || 100);

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
import { Townfolk, TownfolkSprite, mulberry32 } from './tools/townfolk_compose.js';
const GL = window.__GLC = { draw: 0, bind: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
  const b = P.bindTexture; P.bindTexture = function (...a) { GL.bind++; return b.apply(this, a); };
}
const man = await (await fetch('assets/townfolk/manifest.json')).json();
const vil = await (await fetch('assets/villagers/manifest.json')).json();
const T = man.townfolk;
window.__TF = { T, ready: false };
class S extends Phaser.Scene {
  preload() {
    for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of vil.atlases.slice(0, 5)) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    this.tf = new Townfolk(T);
    this.npcs = [];
    this.mode = 'none';
    this.add.rectangle(360, 640, 720, 1280, 0xeef3f9).setDepth(-1e6);
    window.__TF.scene = this;
    window.__TF.ready = true;
  }
  spawnLayered(n, seed) {
    this.clear();
    const rng = mulberry32(seed);
    const jobs = Object.keys(T.generator.presets);
    for (let k = 0; k < n; k++) {
      const p = k % 4 === 0 ? this.tf.preset(jobs[k % jobs.length], rng) : this.tf.randomPerson(rng);
      const x = 60 + (k % 10) * 62 + rng() * 10, y = 200 + Math.floor(k / 10) * 100 + rng() * 10;
      const s = new TownfolkSprite(this, this.tf, p, x, y);
      s.vx = (rng() - 0.5) * 50; s.vy = (rng() - 0.5) * 25; s.person = p;
      this.npcs.push(s);
    }
    this.mode = 'layered';
  }
  spawnSingle(n, seed) {
    this.clear();
    const keys = vil.atlases.slice(0, 5).map((a) => a.key);
    const rng = mulberry32(seed);
    for (let k = 0; k < n; k++) {
      const key = keys[k % keys.length];
      const s = this.add.image(60 + (k % 10) * 62, 200 + Math.floor(k / 10) * 100, key, 'walk_S_0').setOrigin(0.5, 0.8125);
      s.vx = (rng() - 0.5) * 50; s.vy = (rng() - 0.5) * 25; s.key = key; s.f = 0; s.t = 0;
      this.npcs.push(s);
    }
    this.mode = 'single';
  }
  clear() {
    for (const s of this.npcs) s.destroy();
    this.npcs = [];
  }
  dirOf(vx, vy) {
    const a = Math.atan2(vy * 2, vx), sec = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
    return ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'][sec];
  }
  update(time, dt) {
    const t0 = performance.now();
    for (const s of this.npcs) {
      s.x += s.vx * dt / 1000; s.y += s.vy * dt / 1000;
      if (s.x < 30 || s.x > 690) s.vx *= -1;
      if (s.y < 150 || s.y > 1250) s.vy *= -1;
      if (this.mode === 'layered') {
        s.play('walk', this.dirOf(s.vx, s.vy));
        s.update(dt);
        s.setPosition(s.x, s.y);
      } else if (this.mode === 'single') {
        s.t += dt; if (s.t > 83) { s.t = 0; s.f = (s.f + 1) % 8; }
        const d = this.dirOf(s.vx, s.vy); const m = { SW: 'SE', W: 'E', NW: 'NE' };
        s.setFrame('walk_' + (m[d] || d) + '_' + s.f).setFlipX(d in m).setDepth(s.y);
      }
    }
    this.updMs = (this.updMs || 0) * 0.9 + (performance.now() - t0) * 0.1;
  }
}
window.__TF.game = new Phaser.Game({ type: Phaser.WEBGL, width: 720, height: 1280, backgroundColor: '#eef3f9',
  render: { antialias: true, pixelArt: false, roundPixels: false }, scene: S, banner: false });
</script></body></html>`;

async function measure(page, label, frames = 90) {
  return page.evaluate(async ({ label, frames }) => {
    const g = window.__TF.game, sc = window.__TF.scene, C = window.__GLC;
    await new Promise((r) => setTimeout(r, 1200));
    const d0 = C.draw, b0 = C.bind, f0 = g.loop.frame, t0 = performance.now();
    while (g.loop.frame - f0 < frames) await new Promise((r) => setTimeout(r, 10));
    const n = g.loop.frame - f0, ms = (performance.now() - t0) / n;
    const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
    return { label, npcs: sc.npcs.length, sprites, spritesPerNpc: +(sprites / Math.max(1, sc.npcs.length)).toFixed(1),
      drawPerFrame: +((C.draw - d0) / n).toFixed(1), bindPerFrame: +((C.bind - b0) / n).toFixed(1),
      msPerFrame: +ms.toFixed(1), updateMs: +sc.updMs.toFixed(2), maxTextures: g.renderer.maxTextures };
  }, { label, frames });
}

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/fv/__townfolk.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__townfolk.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__TF && window.__TF.ready, null, { timeout: 120000 });
const res = [];
await page.evaluate((n) => window.__TF.scene.spawnLayered(n, 7), N);
await sleep(500);
res.push(await measure(page, `A live layered x${N}`));
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'townfolk_phaser.png') });
await page.evaluate(() => window.__TF.scene.spawnLayered(10, 3));
res.push(await measure(page, 'A live layered x10'));
await page.evaluate((n) => window.__TF.scene.spawnSingle(n, 7), N);
res.push(await measure(page, `B single-sprite villagers x${N}`));
// C. bake one person's full frame set into a RenderTexture (what a bake-at-spawn would cost)
const bake = await page.evaluate(async () => {
  const sc = window.__TF.scene, T = window.__TF.T;
  sc.clear();
  const { Townfolk, TownfolkSprite, mulberry32 } = await import('./tools/townfolk_compose.js');
  const tf = new Townfolk(T);
  const p = tf.randomPerson(mulberry32(5));
  const frames = [];
  for (const [a, info] of Object.entries(T.anims)) for (const d of info.dirs) for (let i = 0; i < info.frames; i++) frames.push([a, d, i]);
  const cols = 16, rows = Math.ceil(frames.length / cols);
  const t0 = performance.now();
  const rt = sc.add.renderTexture(0, 0, cols * 128, rows * 128).setVisible(false);
  const tmp = new TownfolkSprite(sc, tf, p, 0, 0);
  for (const s of tmp.sprites) s.setVisible(false);
  frames.forEach(([a, d, i], k) => {
    for (const l of tf.layers(p, a, d, i)) {
      if (!l.atlas || !sc.textures.get(l.atlas).has(l.frame)) continue;
      const img = sc.make.image({ key: l.atlas, frame: l.frame, add: false });
      img.setOrigin(l.head ? T.headAnchor[0] : T.anchor[0], l.head ? T.headAnchor[1] : T.anchor[1]);
      if (l.tint != null) img.setTint(l.tint);
      rt.draw(img, (k % cols) * 128 + 64 + l.dx, Math.floor(k / cols) * 128 + 104 + l.dy);
      img.destroy();
    }
  });
  rt.snapshot(() => {});
  const ms = performance.now() - t0;
  tmp.destroy();
  return { frames: frames.length, rtSize: [cols * 128, rows * 128], bakeMs: +ms.toFixed(0),
    gpuMBPerPerson: +((cols * 128 * rows * 128 * 4) / 1048576).toFixed(1) };
});
res.push({ label: 'C bake-at-spawn (1 person, all 160 frames)', ...bake });
const atlasMpx = await page.evaluate(() => {
  let px = 0; for (const a of window.__TF.T && Object.values(window.__TF.game.textures.list)) {
    if (a.key && a.key.startsWith('tf_')) { const s = a.source[0]; px += s.width * s.height; }
  }
  return +(px / 1e6).toFixed(2);
});
res.push({ label: 'townfolk atlases resident', mpx: atlasMpx, gpuMB: +(atlasMpx * 4).toFixed(0) });
for (const r of res) console.log(JSON.stringify(r));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/townfolk_perf.json', JSON.stringify({ res, errors }, null, 1));
await browser.close();
await srv.close();
