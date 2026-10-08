// Sunny Beach fragment (assets/beach, CONTRACT_V7 section W) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/beach_phaser.mjs
//   BEACH_DIR=<beach_pack --out folder> BEACH_SHOT=<png> node tools/test/beach_phaser.mjs     (dry run, assets untouched)
// Loads assets/beach/manifest.json: every atlas with load.atlas (Phaser JSON hash) + the two seamless sand textures
// (images[]), registers the sprite anims exactly like src/core/Assets.js spriteAnims() (spr:<key>:<anim>) and the
// character anims like buildCharacter() (<key>:<anim>:<dir>, plus the seated-rider overlays <key>:over_<anim>:<dir>),
// checks that every sprite frame, anim frame, character frame and overlay frame exists in its texture, then lays the
// set out the way the game should draw it: sand + wet sand textures, a shelf of every prop at 0.5x playing its work
// anim (occluder overlays above their building), chained boardwalk + buoy-line tiles at their stepPx, water-plane
// props and boats sunk by waterPx on a sea band, boats / crab in all 8 headings (mirrors with flipX, nearest map).
// Writes docs/previews/beach_phaser.png + /tmp/fv_review/beach_phaser.json.  Exit 1 on missing frames / errors / 404s.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = 2200, H = 1300;
const BEACH_DIR = process.env.BEACH_DIR ? path.resolve(process.env.BEACH_DIR) : '';     // optional: a --out dry run
const SHOT = process.env.BEACH_SHOT || path.join(ROOT, 'docs', 'previews', 'beach_phaser.png');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f1e2c2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/beach/manifest.json')).json();
window.__B = { ready: false, missing: [], anims: [], frames: 0, chars: 0, sprites: 0 };
class S extends Phaser.Scene {
  preload() {
    for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const i of man.images || []) this.load.image(i.key, 'assets/' + i.png);
  }
  create() {
    const B = window.__B, tex = this.textures, sp = man.sprites, ch = man.characters || {};
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    const WP = man.waterPx || 30;
    // ---- sprites: frames + spr:<key>:<anim> (Assets.spriteAnims) ----
    for (const [k, s] of Object.entries(sp)) {
      B.sprites++; B.frames++;
      if (s.image) { if (!tex.exists(s.image)) B.missing.push(k + ':image ' + s.image); continue; }
      if (!has(s.atlas, s.frame)) B.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        B.frames += a.frames.length;
        const frames = a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f }));
        if (frames.length !== a.frames.length) B.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (frames.length && !this.anims.exists(key)) this.anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
        B.anims.push(key);
      }
      if (s.overlay && !sp[s.overlay]) B.missing.push(k + ':overlay ' + s.overlay);
      if (s.aliasOf && !sp[s.aliasOf]) B.missing.push(k + ':aliasOf ' + s.aliasOf);
    }
    // ---- characters: <key>:<anim>:<dir> (+ over_ rider overlays) ----
    for (const [c, e] of Object.entries(ch)) {
      B.chars++;
      const fmt = (an, d, i) => e.frameName.replace('{anim}', an).replace('{dir}', d).replace('{i}', i);
      const ofmt = e.overlay ? (an, d, i) => e.overlay.frameName.replace('{anim}', an).replace('{dir}', d).replace('{i}', i) : null;
      for (const [an, a] of Object.entries(e.anims)) {
        for (const d of (a.dirs || e.dirs)) {
          for (const [pre, f, atl] of [['', fmt, e.atlas]].concat(ofmt ? [['over_', ofmt, e.overlay.atlas || e.atlas]] : [])) {
            const names = [...Array(a.frames).keys()].map((i) => f(an, d, i));
            B.frames += names.length;
            names.forEach((n) => { if (!has(atl, n)) B.missing.push(c + ':' + n); });
            const key = c + ':' + pre + an + ':' + d;
            this.anims.create({ key, frames: names.filter((n) => has(atl, n)).map((n) => ({ key: atl, frame: n })),
                                frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
            B.anims.push(key);
          }
        }
      }
    }
    // ---- backdrop: sand, wet sand band, sea ----
    const SEA = 1010;
    if (tex.exists('ground_sand')) this.add.tileSprite(0, 0, ${W}, SEA, 'ground_sand').setOrigin(0, 0).setDepth(-1e7);
    if (tex.exists('ground_sand_wet')) this.add.tileSprite(0, SEA - 70, ${W}, 70, 'ground_sand_wet').setOrigin(0, 0).setDepth(-1e7 + 1);
    this.add.rectangle(0, SEA, ${W}, ${H} - SEA, 0x35b5c4).setOrigin(0, 0).setDepth(-1e7 + 2);
    this.add.rectangle(0, SEA, ${W}, 10, 0xf4fbfb, 0.85).setOrigin(0, 0).setDepth(-1e7 + 3);
    this.add.rectangle(0, SEA + 120, ${W}, ${H} - SEA - 120, 0x1f8fb3).setOrigin(0, 0).setDepth(-1e7 + 2);
    const playFirst = (o, k, s) => {
      const a = s.anims || {};
      const an = a.work ? 'work' : Object.keys(a)[0];
      if (an && this.anims.exists('spr:' + k + ':' + an)) o.play('spr:' + k + ':' + an);
    };
    const put = (k, x, y, sc, depth) => {
      const s = sp[k]; if (!s || s.image) return null;
      const o = this.add.sprite(x, y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setScale(sc || 1);
      o.setDepth(depth ?? y); playFirst(o, k, s);
      if (s.overlay && sp[s.overlay]) {
        const v = sp[s.overlay];
        this.add.image(x, y, v.atlas, v.frame).setOrigin(v.anchor[0], v.anchor[1]).setScale(sc || 1).setDepth((depth ?? y) + 1);
      }
      return o;
    };
    // ---- shelf: every prop at 0.5x (no tiles, aliases, overlays, sand kit, water props) ----
    const shelf = Object.keys(sp).filter((k) => { const s = sp[k];
      return !s.image && !s.tileAxis && !s.aliasOf && s.kind !== 'overlay' && !k.startsWith('ground_sand_snow') && !s.waterPlane; });
    let x = 16, y = 6, rowH = 0;
    for (const k of shelf) {
      const s = sp[k], sc = 0.5, w = s.frameSize[0] * sc, h = s.frameSize[1] * sc;
      if (x + w > 1500) { x = 16; y += rowH + 4; rowH = 0; }
      put(k, x + s.anchor[0] * w, y + s.anchor[1] * h, sc, y + s.anchor[1] * h);
      x += w + 4; rowH = Math.max(rowH, h);
    }
    B.shelfBottom = y + rowH;
    // ---- world (x, y) metres -> px around an origin (1x): +X = (+45.25, +22.63), +Y = (+45.25, -22.63) ----
    const Q = Math.SQRT2;
    const at = (ox, oy) => (mx, my) => [ox + (mx + my) * 45.2548, oy + (mx - my) * 22.6274];
    // boardwalk chain on the sand (ground layer: drawn under props)
    const bw = at(1560, 640);
    const chain = (keys, P, ground) => keys.forEach(([k, mx, my]) => { const s = sp[k]; if (!s) return;
      const [px, py] = P(mx, my);
      const o = this.add.sprite(px, py + (s.waterPlane ? WP : 0), s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]);
      o.setDepth(ground ? -1e6 + py * 0.001 : py); playFirst(o, k, s); });
    chain([['boardwalk_end_xn', -Q / 2 - 0.0, 0]].concat([0, 1, 2, 3].map((n) => ['boardwalk_x', n * Q, 0]))
      .concat([['boardwalk_end_xp', 4 * Q - 0.0, 0]]), bw, true);
    chain([1, 2, 3].map((n) => ['boardwalk_y', -Q / 2, n * Q]).concat([['boardwalk_end_yp', -Q / 2, 4 * Q]]), at(1560 - 32, 640 - 16), true);
    // crab: 8 headings walking on the sand
    const heads = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
    const resolve = (e, d) => e.dirs.includes(d) ? [d, false] : (e.mirror && e.mirror[d] ? [e.mirror[d], true]
      : resolve(e, (e.nearest && e.nearest[d]) || 'SE'));
    const char = (c, d, px, py, an, sc) => {
      const e = ch[c]; if (!e) return;
      const [rd, flip] = resolve(e, d);
      const ct = this.add.container(px, py + (e.waterPlane ? WP : 0)).setDepth(py).setScale(sc || 1);
      const add = (o) => { o.setOrigin(e.anchor[0], e.anchor[1]).setFlipX(flip); ct.add(o); return o; };
      add(this.add.sprite(0, 0, e.atlas, e.frameName.replace('{anim}', an).replace('{dir}', rd).replace('{i}', 0)))
        .play(c + ':' + an + ':' + rd);
      // (seated riders would be drawn here, at seats[rd] in seatDrawOrder, then the overlay on top)
      if (e.overlay) add(this.add.sprite(0, 0, e.overlay.atlas || e.atlas, 'over_' + an + '_' + rd + '_0'))
        .play(c + ':over_' + an + ':' + rd);
      return ct;
    };
    heads.forEach((d, i) => char('crab', d, 1580 + (i % 4) * 150, 830 + Math.floor(i / 4) * 70, i % 2 ? 'idle' : 'walk', 1));
    // sea: buoy line chain + end, raft, boats in all headings
    const sea = at(1520, SEA + 50);
    chain([0, 1, 2, 3, 4].map((n) => ['swim_buoy_line_x', n * Q, 0]).concat([['swim_buoy_line_end', 4.5 * Q, 0]]), sea, false);
    chain([1, 2].map((n) => ['swim_buoy_line_y', -Q / 2, -n * Q]), sea, false);
    put('float_raft', 2080, SEA + 150 + WP, 1);
    heads.forEach((d, i) => char('swan_pedal_boat', d, 80 + i * 130, SEA + 70, i % 2 ? 'idle' : 'move', 0.6));
    ['S', 'SE', 'NE', 'SW'].forEach((d, i) => char('kayak_crew', d, 90 + i * 150, SEA + 200, 'move', 0.6));
    ['SE', 'NE', 'SW'].forEach((d, i) => char('banana_boat_crew', d, 760 + i * 230, SEA + 200, i ? 'move' : 'idle', 0.6));
    ['SE', 'NW'].forEach((d, i) => char(i ? 'kayak' : 'banana_boat', d, 1500 + i * 260, SEA + 230, 'idle', 0.6));
    B.scene = this; B.ready = true;
  }
}
window.__B.game = new Phaser.Game({ type: Phaser.WEBGL, width: ${W}, height: ${H}, backgroundColor: '#f1e2c2',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__beach.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
if (BEACH_DIR) {
  // dry-run hook: serve assets/beach/* from a beach_pack --out folder first (files it does not hold come from assets/)
  await page.route('**/fv/assets/beach/**', (r) => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.split('/assets/beach/')[1] || '');
    const f = path.join(BEACH_DIR, rel);
    if (!rel || !fs.existsSync(f)) return r.continue();
    const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.png') ? 'image/png' : 'application/octet-stream';
    return r.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
  });
}
await page.goto(srv.url + '__beach.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__B && window.__B.ready, null, { timeout: 240000 });
await sleep(1500);
const res = await page.evaluate(() => {
  const B = window.__B, sc = B.scene;
  let playing = 0;
  sc.children.list.forEach((o) => {
    if (o.anims && o.anims.isPlaying) playing++;
    if (o.list) o.list.forEach((c) => { if (c.anims && c.anims.isPlaying) playing++; });
  });
  return { textures: Object.keys(sc.textures.list).filter((k) => k.startsWith('beach_') || k.startsWith('ground_sand')).length,
    sprites: B.sprites, characters: B.chars, anims: B.anims.length, framesChecked: B.frames, missing: B.missing, playing,
    shelfBottom: B.shelfBottom };
});
fs.mkdirSync(path.dirname(SHOT), { recursive: true });
await page.screenshot({ path: SHOT });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/beach_phaser.json', JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
