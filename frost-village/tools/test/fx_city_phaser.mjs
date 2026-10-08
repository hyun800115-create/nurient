// fx_city fragment (assets/fx_city, CONTRACT_V8 §AC) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/fx_city_phaser.mjs
// Loads assets/fx_city/manifest.json exactly like src/core/Assets.js would (spritesheets with endFrame =
// frameCount - 1, the ui4_icons atlas, plain images for the panels), creates the sheet anims the same way as
// Assets.sheetAnims (key = sheet key, frameCount / fps / repeat), checks every frame / atlas frame exists, plays all
// FX over snow / plaza / sea / night strips, lays out the icons, stretches the 9-slice panels with
// this.add.nineslice, aims three hose streams with the manifest.hoseAim chain algorithm (and one with a Rope),
// then writes docs/previews/fxcity_phaser.png + <tmp>/fv_cache/fx_city/fx_city_phaser.json.  Exit 1 on missing
// frames, page errors or 404s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTJ = path.join(os.tmpdir(), 'fv_cache', 'fx_city');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#dfe8f2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/fx_city/manifest.json')).json();
window.__H = { ready: false, missing: [], anims: [], frames: 0, hoseSprites: 0, nine: 0, sheetFrames: {} };
const BASE = 'assets/';
class S extends Phaser.Scene {
  preload() {
    for (const a of man.spritesheets) this.load.spritesheet(a.key, BASE + a.png, { frameWidth: a.frameWidth, frameHeight: a.frameHeight, endFrame: a.frameCount - 1 });
    for (const a of man.atlases) this.load.atlas(a.key, BASE + a.png, BASE + a.json);
    for (const i of man.images) this.load.image(i.key, BASE + i.png);
  }
  create() {
    const H = window.__H, tex = this.textures, anims = this.anims;
    // backgrounds: snow / plaza / sea / night strips
    const cols = [0xf4f7fb, 0xd9a08a, 0x1f5fa8, 0x2b2f3a];
    for (let k = 0; k < 4; k++) this.add.rectangle(k * 300 + 150, 260, 300, 520, cols[k]).setDepth(-1e6);
    this.add.rectangle(1500, 520, 600, 1040, 0xf4f7fb).setDepth(-1e6);
    this.add.rectangle(600, 800, 1200, 480, 0xfff8ec).setDepth(-1e6);
    // sheet anims exactly like Assets.sheetAnims
    for (const s of man.spritesheets) {
      if (!tex.exists(s.key)) { H.missing.push('texture:' + s.key); continue; }
      const total = tex.get(s.key).frameTotal - 1;
      H.sheetFrames[s.key] = total;
      if (total < s.frameCount) H.missing.push(s.key + ': ' + total + ' frames < ' + s.frameCount);
      const end = Math.min(total, s.frameCount || total) - 1;
      anims.create({ key: s.key, frames: anims.generateFrameNumbers(s.key, { start: 0, end: Math.max(0, end) }), frameRate: s.fps, repeat: s.repeat });
      H.anims.push(s.key); H.frames += s.frameCount;
    }
    // play every sheet (loops loop; one-shots restart every 2 s) in a grid over the 4 strips
    const order = man.spritesheets.filter((s) => !s.key.startsWith('fx_hose_'));
    let i = 0;
    for (const s of order) {
      const col = i % 8, row = Math.floor(i / 8);
      const x = 75 + col * 150, y = 150 + row * 170;
      const sc = Math.min(1, 140 / s.frameWidth, 160 / s.frameHeight);
      const spr = this.add.sprite(x, y + 60, s.key, 0).setOrigin(s.anchor[0], s.anchor[1]).setScale(sc);
      spr.play(s.key);
      if (s.repeat === 0) this.time.addEvent({ delay: 2000, loop: true, callback: () => spr.play(s.key) });
      i++;
    }
    // icons
    const icons = Object.entries(man.sprites).filter(([k, s]) => s.kind === 'icon');
    icons.forEach(([k, s], j) => {
      if (!tex.get(s.atlas).has(s.frame)) H.missing.push('icon:' + k);
      this.add.image(40 + (j % 13) * 88, 600 + Math.floor(j / 13) * 92, s.atlas, s.frame).setScale(0.8);
    });
    // 9-slices stretched
    const nine = (k, x, y, w, h) => {
      const n = man.nineSlice[k];
      if (!n || !tex.exists(n.image)) { H.missing.push('nine:' + k); return null; }
      H.nine++;
      return this.add.nineslice(x, y, n.image, undefined, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0, 0);
    };
    nine('ui_newspaper', 20, 790, 420, 230);
    nine('ui_newspaper_masthead', 32, 800, 396, 96);
    nine('ui_newspaper_column', 36, 900, 190, 110);
    nine('ui_newspaper_photo', 236, 900, 190, 110);
    nine('ui_passbook', 460, 790, 330, 230);
    for (let r = 0; r < 4; r++) nine('ui_passbook_row', 505, 845 + r * 32, 265, 32);
    nine('ui_story_card', 810, 790, 360, 112);
    nine('ui_story_card_news', 810, 910, 360, 112);
    const wp = man.sprites.ui_wanted_poster;
    if (!tex.exists('ui_wanted_poster')) H.missing.push('image:ui_wanted_poster');
    else this.add.image(1050, 360, 'ui_wanted_poster').setOrigin(0, 0).setScale(0.55);
    // hose streams aimed with manifest.hoseAim (chain) ...
    const A = man.hoseAim, seg = man.spritesheets.find((s) => s.key === A.segment);
    const curve = (N, T) => {
      const d = Math.hypot(T.x - N.x, T.y - N.y), h = Math.max(20, Math.min(120, 0.3 * d));
      return (s) => ({ x: N.x + (T.x - N.x) * s, y: N.y + (T.y - N.y) * s - h * 4 * s * (1 - s) });
    };
    const chain = (N, T) => {
      const P = curve(N, T), pts = [], cum = [0];
      for (let k = 0; k <= 200; k++) pts.push(P(k / 200));
      for (let k = 1; k <= 200; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));
      const total = cum[200], n = Math.max(1, Math.ceil(total / A.stepPx)), L = total / n;
      const at = (len) => { let k = 1; while (k < 200 && cum[k] < len) k++; const t = (len - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); return { x: pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t, y: pts[k - 1].y + (pts[k].y - pts[k - 1].y) * t }; };
      let last = 0;
      for (let k = 0; k < n; k++) {
        const p0 = at(k * L), p1 = at(Math.min(total, k * L + 2));
        last = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const s = this.add.sprite(p0.x, p0.y, A.segment, 0).setOrigin(0, 0.5).setRotation(last)
          .setScale((L + 1) / seg.frameWidth, 1 - 0.3 * k / Math.max(1, n - 1)).setDepth(10);
        s.play(A.segment); H.hoseSprites++;
      }
      this.add.sprite(T.x, T.y, A.tip, 0).setOrigin(0, 0.5).setRotation(last).setScale(0.75, 0.7).setDepth(11).play(A.tip);
      this.add.sprite(T.x, T.y, 'fx_water_mist', 0).setOrigin(0.5, 0.6).setDepth(9).play('fx_water_mist');
    };
    chain({ x: 1260, y: 330 }, { x: 1520, y: 170 });
    chain({ x: 1260, y: 330 }, { x: 1700, y: 280 });
    chain({ x: 1260, y: 330 }, { x: 1400, y: 120 });
    // ... and the recommended Rope (manifest.hoseAim.rope): fx_hose_rope mapped along the arc, frame advanced at 30 fps
    const ropes = [];
    const ropeArc = (N, T) => {
      const P = curve(N, T), rp = [];
      for (let k = 0; k <= 32; k++) { const p = P(k / 32); rp.push(new Phaser.Math.Vector2(p.x - N.x, p.y - N.y)); }
      const r = this.add.rope(N.x, N.y, A.ropeTexture, 0, rp, true).setDepth(10);
      ropes.push(r);
      this.add.sprite(T.x, T.y, 'fx_water_mist', 0).setOrigin(0.5, 0.6).setDepth(9).play('fx_water_mist');
      return r;
    };
    ropeArc({ x: 1260, y: 760 }, { x: 1560, y: 600 });
    ropeArc({ x: 1260, y: 760 }, { x: 1720, y: 690 });
    let f = 0;
    const rs = man.spritesheets.find((s) => s.key === A.ropeTexture);
    this.time.addEvent({ delay: 1000 / rs.fps, loop: true, callback: () => { f = (f + 1) % rs.frameCount; ropes.forEach((r) => r.setFrame(f)); } });
    const rope = ropes[0];
    H.rope = !!rope;
    H.scene = this; H.ready = true;
  }
}
window.__H.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1800, height: 1040, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1040 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__fxcity.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__fxcity.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__H && window.__H.ready, null, { timeout: 180000 });
await sleep(1500);
const res = await page.evaluate(() => {
  const H = window.__H, sc = H.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { anims: H.anims.length, framesChecked: H.frames, missing: H.missing, playing, hoseSprites: H.hoseSprites,
    nineSlices: H.nine, rope: H.rope, sheetFrames: H.sheetFrames, textures: Object.keys(sc.textures.list).length };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'fxcity_phaser.png') });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync(OUTJ, { recursive: true });
fs.writeFileSync(path.join(OUTJ, 'fx_city_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
