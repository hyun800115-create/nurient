// Beachfront buildings (assets/beach_bld, CONTRACT_V7 section X) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/beach_bld_phaser.mjs [--out DIR]
// Loads assets/beach_bld/manifest.json, loads every atlas (Phaser JSON hash), registers the sprite anims exactly like
// src/core/Assets.js spriteAnims() (spr:<key>:<anim>), checks that every sprite frame and anim frame exists, plays all
// anims, then lays out (top) a 0.33x shelf of every building playing its anim and (below, one band each) a 1x mini
// beachfront at DAY and at NIGHT the way the game should draw it:
//   building at depth d, its staff / balcony guests at d + 0.5, its `overlay` (<key>_front) at d + 1,
//   hotel_pool_water (spr:hotel_pool_water:ripple) at d + 0.25 inside waterPoly (drawn as a debug outline),
//   night: setTint(night.tint) on every sprite + <key>_glow with blendMode ADD (resort_hotel: resort_hotel_night).
// Writes docs/previews/bbld_phaser.png + <out>/beach_bld_phaser.json (default <tmp>/fv_review).  Exit 1 on missing frames / errors.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOut = process.argv.indexOf('--out');
const OUTDIR = argOut > 0 ? process.argv[argOut + 1] : path.join(os.tmpdir(), 'fv_review');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#efe3c6}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/beach_bld/manifest.json')).json();
const CW = 1400, CH = 3000, BAND_H = 1180;
window.__B = { ready: false, missing: [], anims: [], frames: 0, placed: 0 };
class S extends Phaser.Scene {
  preload() { for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); }
  create() {
    const B = window.__B, tex = this.textures, sp = man.sprites;
    this.add.rectangle(CW / 2, CH / 2, CW, CH, 0xf3e8cf).setDepth(-1e6);
    for (const [k, s] of Object.entries(sp)) {
      B.frames++;
      if (!tex.exists(s.atlas) || !tex.get(s.atlas).has(s.frame)) B.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        const t = tex.get(s.atlas);
        const frames = a.frames.filter((f) => t.has(f)).map((f) => ({ key: s.atlas, frame: f }));
        B.frames += a.frames.length;
        if (frames.length !== a.frames.length) B.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (!this.anims.exists(key)) this.anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat !== undefined ? a.repeat : -1 });
        B.anims.push(key);
      }
    }
    // 0.33x shelf of every building / street piece (not the derived overlays), above the two street bands
    const order = Object.keys(sp).filter((k) => !['overlay', 'glow', 'night'].includes(sp[k].kind));
    let x = 12, y = 8, rowH = 0;
    for (const k of order) {
      const s = sp[k], sc = 0.33;
      const w = s.frameSize[0] * sc, h = s.frameSize[1] * sc;
      if (x + w > CW - 10) { x = 12; y += rowH + 4; rowH = 0; }
      const img = this.add.sprite(x + s.anchor[0] * w, y + s.anchor[1] * h, s.atlas, s.frame).setScale(sc).setOrigin(s.anchor[0], s.anchor[1]);
      img.setDepth(-1e5 + y + s.anchor[1] * h);
      if (s.anims && s.anims.work) img.play('spr:' + k + ':work');
      B.placed++;
      x += w + 4; rowH = Math.max(rowH, h);
    }
    // 1x mini beachfront: day (top) and night (bottom)
    const KX = 45.2548, KY = 22.6274;
    const street = (ox, oy, night, top) => {
      const W = (wx, wy) => [ox + (wx + wy) * KX, oy + (wx - wy) * KY];
      const g = this.add.graphics().setDepth(oy - 2000);
      const band = this.make.graphics({ x: 0, y: 0, add: false });
      band.fillStyle(0xffffff, 1).fillRect(0, top, CW, BAND_H);
      g.setMask(band.createGeometryMask());                // keep this street's ground inside its own band
      this.add.text(12, top + 6, night ? 'NIGHT: tint + <key>_glow (ADD), resort_hotel_night' : 'DAY: building d, staff d+0.5, overlay d+1, pool water d+0.25',
        { fontFamily: 'sans-serif', fontSize: '16px', color: '#20242c' }).setDepth(1e6);
      const poly = (pts, col) => { g.fillStyle(col, 1); g.beginPath(); g.moveTo(...W(...pts[0])); for (const p of pts.slice(1)) g.lineTo(...W(...p)); g.closePath(); g.fillPath(); };
      const nt = night ? 0.62 : 1;
      const c = (r, gg, b) => Phaser.Display.Color.GetColor(r * nt * 0.82, gg * nt * 0.86, b * nt);
      poly([[-6, -1.9], [20, -1.9], [20, 9], [-6, 9]], c(238, 228, 210));
      poly([[-6, -3.3], [20, -3.3], [20, -1.9], [-6, -1.9]], c(201, 160, 112));
      poly([[-6, -7], [20, -7], [20, -3.3], [-6, -3.3]], c(241, 222, 178));
      poly([[-6, -12], [20, -12], [20, -7], [-6, -7]], c(60, 190, 205));
      const put = (k, wx, wy) => {
        const s = sp[k]; if (!s) return null;
        const [px, py] = W(wx, wy);
        const useNight = night && s.night && s.night.frame && sp[s.night.frame];
        const base = useNight ? sp[s.night.frame] : s;
        const im = this.add.sprite(px, py, base.atlas, base.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py);
        if (s.anims && s.anims.work) im.play('spr:' + k + ':work');
        if (night && !useNight) im.setTint(parseInt((s.night ? s.night.tint : man.night.tint).slice(1), 16));
        if (night && !useNight && s.night && sp[s.night.glow]) {
          const gk = sp[s.night.glow];
          this.add.image(px, py, gk.atlas, gk.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py + 0.3).setBlendMode(Phaser.BlendModes.ADD);
        }
        if (s.overlay && sp[s.overlay]) {
          const o = sp[s.overlay];
          const oi = this.add.image(px, py, o.atlas, o.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py + 1);
          if (night) oi.setTint(parseInt(man.night.tint.slice(1), 16));
        }
        if (s.waterOverlay && sp[s.waterOverlay]) {
          const w = sp[s.waterOverlay];
          const wi = this.add.sprite(px, py, w.atlas, w.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py + 0.25).play('spr:' + s.waterOverlay + ':ripple');
          if (night) wi.setTint(parseInt(man.night.tint.slice(1), 16));
          const dbg = this.add.graphics().setDepth(py + 0.26).lineStyle(1, 0x2040ff, 0.8);
          dbg.strokePoints(s.waterPoly.map(([dx, dy]) => ({ x: px + dx, y: py + dy })), true);
        }
        // staff + balcony markers (the game draws characters at d + 0.5)
        const mk = this.add.graphics().setDepth(py + 0.5);
        for (const [f, col] of [['staffPoints', 0xe03030], ['balconyPoints', 0xc000c0], ['customerPoints', 0x2050e0], ['seatPoints', 0xe09000]]) {
          for (const [dx, dy] of (s[f] || [])) { mk.fillStyle(col, 0.9); mk.fillCircle(px + dx, py + dy, 3); }
        }
        B.placed++;
        return im;
      };
      put('beach_lamp', -3.5, -2.0); put('beach_lamp', 4.5, -2.0); put('beach_lamp', 12.5, -2.0);
      put('string_lights_x', 0.5, -3.15); put('string_lights_x', 8.5, -3.15); put('string_lights_x', 16.5, -3.15);
      put('resort_hotel', 0.0, 2.9); put('hotel_pool', 7.4, 2.3); put('beach_cafe', 13.0, 1.8); put('icecream_shop', 17.1, 1.6);
      put('beach_bar', 9.0, -5.4); put('beach_gate', 3.2, -3.85);
    };
    const shelfBottom = y + rowH + 12;
    street(230, shelfBottom + 660, false, shelfBottom);
    street(230, shelfBottom + BAND_H + 660, true, shelfBottom + BAND_H);
    B.scene = this; B.ready = true;
  }
}
window.__B.game = new Phaser.Game({ type: Phaser.WEBGL, width: CW, height: CH, backgroundColor: '#efe3c6',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 3000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__bbld.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__bbld.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__B && window.__B.ready, null, { timeout: 240000 });
await sleep(1500);
const res = await page.evaluate(() => {
  const B = window.__B, sc = B.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('bbld_')).length,
    anims: B.anims.length, animKeys: B.anims, framesChecked: B.frames, missing: B.missing, playing, placed: B.placed };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
// the CPU is shared with Blender renders: let the anims run a moment, then pause the game loop so the screenshot of the
// (software-rendered) WebGL canvas does not compete with Phaser redrawing 60 times a second
await sleep(1500);
await page.evaluate(() => window.__B.game.loop.sleep());
await sleep(300);
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'bbld_phaser.png'), timeout: 180000 });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'beach_bld_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length ? 1 : 0);
