// Life-event fragment (assets/life2, CONTRACT_V5 section P) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/life2_phaser.mjs
// Loads assets/life2/manifest.json (+ the town_hall atlas from assets/town for the garland), loads every atlas with
// load.atlas (Phaser JSON hash), registers sprite anims like src/core/Assets.js (spr:<key>:<anim>) and stroller anims
// ({anim}_{dir}_{i}), checks every referenced frame exists, plays them, draws ribbon_garland on town_hall at the same
// anchor point, a stroller in all 8 headings (mirrored with flipX) and writes docs/previews/life2_phaser.png +
// /tmp/fv_review/life2_phaser.json.  Exit 1 on missing frames / errors / 404s.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#dfe8f2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/life2/manifest.json')).json();
const town = await (await fetch('assets/town/manifest.json')).json();
window.__L = { ready: false, missing: [], anims: [], frames: 0 };
class S extends Phaser.Scene {
  preload() {
    for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    const th = town.sprites.town_hall, ta = town.atlases.find((a) => a.key === th.atlas);
    this.load.atlas(ta.key, 'assets/' + ta.png, 'assets/' + ta.json);
  }
  create() {
    const L = window.__L, tex = this.textures, sp = man.sprites;
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    for (const [k, s] of Object.entries(sp)) {
      L.frames++;
      if (!has(s.atlas, s.frame)) L.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        L.frames += a.frames.length;
        const frames = a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f }));
        if (frames.length !== a.frames.length) L.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
        L.anims.push(key);
      }
    }
    for (const [c, e] of Object.entries(man.characters)) {
      for (const [an, a] of Object.entries(e.anims)) {
        for (const d of e.dirs) {
          const names = [...Array(a.frames).keys()].map((i) => an + '_' + d + '_' + i);
          L.frames += names.length;
          names.forEach((n) => { if (!has(e.atlas, n)) L.missing.push(c + ':' + n); });
          const key = c + ':' + an + ':' + d;
          this.anims.create({ key, frames: names.map((n) => ({ key: e.atlas, frame: n })), frameRate: a.fps, repeat: -1 });
          L.anims.push(key);
        }
      }
    }
    const put = (k, x, y, depth) => { const s = sp[k]; const o = this.add.sprite(x, y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]); o.setDepth(depth ?? y); return o; };
    // town hall + garland at the same anchor point
    const th = town.sprites.town_hall;
    this.add.image(330, 470, th.atlas, th.frame).setOrigin(th.anchor[0], th.anchor[1]).setDepth(470);
    put('ribbon_garland', 330, 470, 471);
    // props row
    let x = 640;
    for (const k of ['wedding_arch', 'flower_stand', 'wedding_cake_table', 'wedding_chairs', 'flower_wreath', 'memorial_stone']) {
      const s = sp[k]; put(k, x + s.frameSize[0] * s.anchor[0], 260); x += s.frameSize[0] - 20;
    }
    put('memorial_garden', 800, 520);
    put('wedding_carpet', 1250, 470, 0);
    put('school_desk_row', 1520, 470); put('school_desk_row_front', 1520, 470, 471);
    put('cradle', 1700, 280).play('spr:cradle:rock');
    ['item_bouquet', 'item_cake', 'item_gift_box', 'item_letter'].forEach((k, i) => put(k, 1600 + i * 70, 560));
    // stroller in all 8 headings
    const e = man.characters.baby_stroller, mir = e.mirror;
    ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'].forEach((d, i) => {
      const rd = mir[d] || d;
      const o = this.add.sprite(1080 + i * 90, 640, e.atlas, 'move_' + rd + '_0').setOrigin(e.anchor[0], e.anchor[1]);
      o.setFlipX(!!mir[d]); o.play(c0('baby_stroller', i % 2 ? 'idle' : 'move', rd));
    });
    function c0(c, an, d) { return c + ':' + an + ':' + d; }
    L.scene = this; L.ready = true;
  }
}
window.__L.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1900, height: 720, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1900, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__life2.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__life2.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__L && window.__L.ready, null, { timeout: 180000 });
await sleep(1200);
const res = await page.evaluate(() => {
  const L = window.__L, sc = L.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { textures: Object.keys(sc.textures.list).filter((k) => k.startsWith('life2_') || k.startsWith('l2_')).length,
    anims: L.anims.length, framesChecked: L.frames, missing: L.missing, playing };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'life2_phaser.png') });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/life2_phaser.json', JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
