// Harbour ships fragment (assets/ships, CONTRACT_V6 section S) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/ships_phaser.mjs
// Loads assets/ships/manifest.json, loads every atlas with load.atlas (Phaser JSON hash), registers the character
// anims like src/core/Assets.js (<key>:<anim>:<dir>), checks every frame the manifest implies (anims x dirs,
// base_<dir>, slot<k>_<dir>), then draws the layered ships the way the game should (container: base -> cargo slots ->
// foam -> anim overlay, bobbing), the small boats + seagulls in all 8 headings (mirrors with flipX) and writes
// docs/previews/ships_phaser.png + /tmp/fv_review/ships_phaser.json.  Exit 1 on missing frames / errors / 404s.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#1f5fa8}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/ships/manifest.json')).json();
window.__S = { ready: false, missing: [], anims: [], frames: 0, ships: 0 };
class S extends Phaser.Scene {
  preload() {
    for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    this.load.image('water_sea', 'assets/ground/water_sea.png');
  }
  create() {
    const L = window.__S, tex = this.textures;
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    this.add.tileSprite(0, 0, 2400, 1300, 'water_sea').setOrigin(0, 0).setDepth(-10);
    for (const [c, e] of Object.entries(man.characters)) {
      L.ships++;
      for (const [an, a] of Object.entries(e.anims)) {
        for (const d of (a.dirs || e.dirs)) {
          const names = [...Array(a.frames).keys()].map((i) => an + '_' + d + '_' + i);
          L.frames += names.length;
          names.forEach((n) => { if (!has(e.atlas, n)) L.missing.push(c + ':' + n); });
          const key = c + ':' + an + ':' + d;
          this.anims.create({ key, frames: names.map((n) => ({ key: e.atlas, frame: n })), frameRate: a.fps,
                              repeat: a.repeat ?? -1 });
          L.anims.push(key);
        }
      }
      if (e.layered) for (const d of e.dirs) { L.frames++; if (!has(e.atlas, 'base_' + d)) L.missing.push(c + ':base_' + d); }
      if (e.cargoSlots) for (let k = 0; k < e.cargoSlots.count; k++) for (const d of e.dirs) {
        L.frames++; if (!has(e.atlas, 'slot' + k + '_' + d)) L.missing.push(c + ':slot' + k + '_' + d);
      }
    }
    const resolve = (e, d) => e.dirs.includes(d) ? [d, false] : (e.mirror[d] ? [e.mirror[d], true]
      : resolve(e, e.nearest?.[d] || 'SE'));
    const bobs = [];
    // layered ship = container(base, cargo slots, foam, anim overlay); everything shares origin = anchor + flip
    const ship = (k, d, x, y, anim, scale) => {
      const e = man.characters[k]; const [rd, flip] = resolve(e, d);
      const ct = this.add.container(x, y).setDepth(y).setScale(scale || 1);
      const add = (o) => { o.setOrigin(e.anchor[0], e.anchor[1]).setFlipX(flip); ct.add(o); return o; };
      if (e.layered) {
        add(this.add.image(0, 0, e.atlas, 'base_' + rd));
        if (e.cargoSlots) for (const s of e.cargoSlots.order[rd]) add(this.add.image(0, 0, e.atlas, 'slot' + s + '_' + rd));
        if (anim === 'move' && e.anims.foam) add(this.add.sprite(0, 0, e.atlas, 'foam_' + rd + '_0')).play(k + ':foam:' + rd);
        const ad = (e.anims[anim].dirs || e.dirs).includes(rd) ? rd : (e.anims[anim].dirs || e.dirs)[0];
        add(this.add.sprite(0, 0, e.atlas, anim + '_' + ad + '_0')).play(k + ':' + anim + ':' + ad);
        bobs.push({ ct, y, amp: e.bob.px, per: e.bob.periodS });
      } else {
        add(this.add.sprite(0, 0, e.atlas, anim + '_' + rd + '_0')).play(k + ':' + anim + ':' + rd);
      }
      return ct;
    };
    ship('cargo_ship', 'SE', 330, 520, 'move', 0.55);
    ship('ferry', 'SW', 930, 470, 'idle', 0.55);
    ship('trawler_big', 'NE', 1400, 460, 'haul', 0.6);
    ship('ferry', 'S', 1800, 520, 'move', 0.5);
    ship('trawler_big', 'NW', 2150, 470, 'move', 0.5);
    const heads = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
    ['tugboat', 'sailboat', 'yacht'].forEach((k, r) => heads.forEach((d, i) =>
      ship(k, d, 120 + i * 290, 760 + r * 170, i % 2 ? 'idle' : 'move', 0.62)));
    heads.forEach((d, i) => {
      const e = man.characters.seagull, [rd, flip] = resolve(e, d);
      this.add.sprite(2330, 70 + i * 140, e.atlas, 'fly_' + rd + '_0').setOrigin(e.anchor[0], e.anchor[1])
        .setFlipX(flip).setScale(1.5).play('seagull:' + (i % 4 === 3 ? 'idle' : i % 4 === 2 ? 'glide' : 'fly') + ':' + rd);
    });
    this.events.on('update', (t) => bobs.forEach((b) => { b.ct.y = b.y + b.amp * Math.sin(Math.PI * 2 * t / 1000 / b.per); }));
    L.scene = this; L.ready = true;
  }
}
window.__S.game = new Phaser.Game({ type: Phaser.WEBGL, width: 2400, height: 1300, backgroundColor: '#1f5fa8',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 2400, height: 1300 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__ships.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__ships.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__S && window.__S.ready, null, { timeout: 240000 });
await sleep(1500);
const res = await page.evaluate(() => {
  const L = window.__S, sc = L.scene;
  let playing = 0;
  sc.children.list.forEach((o) => {
    if (o.anims && o.anims.isPlaying) playing++;
    if (o.list) o.list.forEach((c) => { if (c.anims && c.anims.isPlaying) playing++; });
  });
  return { ships: L.ships, textures: Object.keys(sc.textures.list).filter((k) => k.startsWith('ship_')).length,
    anims: L.anims.length, framesChecked: L.frames, missing: L.missing, playing };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'ships_phaser.png') });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/ships_phaser.json', JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
