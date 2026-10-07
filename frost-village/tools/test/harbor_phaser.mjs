// Harbour fragment (assets/harbor, CONTRACT_V6 section T) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/harbor_phaser.mjs
// Loads assets/harbor/manifest.json, loads every atlas with load.atlas (Phaser JSON hash), registers the sprite anims
// exactly like src/core/Assets.js spriteAnims() (spr:<key>:<anim>), checks that every sprite frame and anim frame
// exists in its texture, plays all anims, lays the whole set out (tiles chained at their stepPx on a sea backdrop)
// and writes docs/previews/harbor_phaser.png + /tmp/fv_review/harbor_phaser.json.  Exit 1 on missing frames / errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#dfe8f2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/harbor/manifest.json')).json();
window.__H = { ready: false, missing: [], anims: [], frames: 0 };
class S extends Phaser.Scene {
  preload() { for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); }
  create() {
    const H = window.__H, tex = this.textures, sp = man.sprites;
    this.add.rectangle(1000, 520, 2000, 1040, 0xeef3f9).setDepth(-1e6);
    this.add.rectangle(1550, 520, 900, 1040, 0x2f86c9).setDepth(-1e6 + 1);
    for (const [k, s] of Object.entries(sp)) {
      H.frames++;
      if (!tex.exists(s.atlas) || !tex.get(s.atlas).has(s.frame)) H.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        const frames = a.frames.filter((f) => tex.get(s.atlas).has(f)).map((f) => ({ key: s.atlas, frame: f }));
        H.frames += a.frames.length;
        if (frames.length !== a.frames.length) H.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate: a.fps || 8, repeat: -1 });
        H.anims.push(key);
      }
    }
    // land / buildings: a shelf layout at 0.5x, animated pieces playing their work anim
    const order = Object.keys(sp).filter((k) => !sp[k].tileAxis && !sp[k].aliasOf);
    let x = 20, y = 0, rowH = 0;
    for (const k of order) {
      const s = sp[k], sc = 0.5;
      const w = s.frameSize[0] * sc, h = s.frameSize[1] * sc;
      if (x + w > 1010) { x = 20; y += rowH + 6; rowH = 0; }
      const img = this.add.sprite(x + s.anchor[0] * w, y + s.anchor[1] * h, s.atlas, s.frame).setScale(sc).setOrigin(s.anchor[0], s.anchor[1]);
      img.setDepth(y + s.anchor[1] * h);
      if (s.anims && s.anims.work) img.play('spr:' + k + ':work');
      x += w + 6; rowH = Math.max(rowH, h);
    }
    // water side: quay + piers + breakwater chained at their integer steps (1x)
    const put = (k, px, py) => { const s = sp[k]; if (!s) return; this.add.image(px, py, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(-1000 + py * 0.001); };
    // world (x, y) metres -> px from the quay corner (ox, oy): ((x + y) * 45.25, (x - y) * 22.63)
    const ox = 1300, oy = 560;
    const W = (x, y) => [ox + (x + y) * 45.2548, oy + (x - y) * 22.6274];
    const Q = Math.SQRT2;
    for (let n = 1; n <= 3; n++) put('quay_x', ...W(-n * Q, 0));
    for (let n = 1; n <= 6; n++) put('quay_y', ...W(0, n * Q));
    put('quay_corner', ...W(0, 0));
    put('pier_root_xn', ...W(Q / 2, 2 * Q));
    for (let n = 1; n <= 3; n++) put('pier_x', ...W(Q / 2 + n * Q, 2 * Q));
    put('pier_end_xp', ...W(Q / 2 + 4 * Q, 2 * Q));
    put('pier_root_yp', ...W(-2 * Q, -Q / 2));
    for (let n = 1; n <= 2; n++) put('pier_y', ...W(-2 * Q, -Q / 2 - n * Q));
    put('pier_end_yn', ...W(-2 * Q, -Q / 2 - 3 * Q));
    for (let n = 0; n <= 2; n++) put('breakwater_x', ...W(Q / 2 + n * Q, 6 * Q));
    put('breakwater_end_xp', ...W(Q / 2 + 3 * Q, 6 * Q));
    const b = sp.buoy;
    if (b) { const p = W(3, -2.5); this.add.sprite(p[0], p[1] + man.waterPx, b.atlas, b.frame).setOrigin(b.anchor[0], b.anchor[1]).play('spr:buoy:bob'); }
    H.scene = this; H.ready = true;
  }
}
window.__H.game = new Phaser.Game({ type: Phaser.WEBGL, width: 2000, height: 1040, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 2000, height: 1040 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__harbor.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__harbor.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__H && window.__H.ready, null, { timeout: 180000 });
await sleep(1200);
const res = await page.evaluate(() => {
  const H = window.__H, sc = H.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('harbor_')).length, sprites: Object.keys(sc.textures.list).length,
    anims: H.anims.length, animKeys: H.anims, framesChecked: H.frames, missing: H.missing, playing };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'harbor_phaser.png') });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/harbor_phaser.json', JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
