// Beachfront buildings (assets/beach_bld, CONTRACT_V7 section X) in headless Chromium with Phaser 3.90 - no game code
// except the standalone src/systems/Water.js (imported like the water lab does).
//   node tools/test/beach_bld_phaser.mjs [--out DIR]
// Loads assets/beach_bld/manifest.json and EVERY atlas (incl. the lazy bbld_x / bbld_glow / bbld_x_glow), registers
// the sprite anims exactly like src/core/Assets.js spriteAnims() (spr:<key>:<anim>), checks that every sprite frame
// and anim frame exists, plays all anims, then lays out a 0.33x shelf of every building and three 1x street bands drawn
// the way the manifest conventions say:
//   1 DAY, fallback pool : hotel_pool (the DECK, water cut out) at d, hotel_pool_water (spr:...:ripple) UNDER it at
//                          d - 0.5; staff on staffDepths ("front" d + 0.5, "behind" y-sorted), `overlay` at d + 1
//   2 DAY, Water.js pool : the same street, but the pool water is src/systems/Water.js (palette "pool", shore "quay",
//                          mask = waterPolyFlat, depth d - 0.5) under the deck
//   3 NIGHT (DayClock)   : band 1 + ONE MULTIPLY overlay (0x5a6aa8 at darkness 0.45) at DEPTH.FX - 30 over the band,
//                          <key>_glow (ADD) at DEPTH.FX - 29 above it, fv_glow halos at every lightPoints entry (lightK)
// Checks (exit 1 on failure): missing frames / anims, page errors, 404s, Water.js built as a shader, and LAND OVER
// WATER: the deck pixels on a ring just outside waterPoly are the same in bands 1 and 2 (the stair-stepped opaque
// Water.js mesh must not show past the pool rim).
// Writes docs/previews/bbld_phaser.png + <out>/beach_bld_phaser.json (default <tmp>/fv_review).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argOut = process.argv.indexOf('--out');
const OUTDIR = argOut > 0 ? process.argv[argOut + 1] : path.join(os.tmpdir(), 'fv_review');

const JS = `
import { Water } from './src/systems/Water.js';
const man = await (await fetch('assets/beach_bld/manifest.json')).json();
const wman = await (await fetch('assets/water/manifest.json')).json();
const CW = 1400, CH = 3400, BAND_H = 900;
const FX = 31000;                                   // src/systems/DepthSort.js DEPTH.FX
const NIGHT_MUL = [0x5a, 0x6a, 0xa8].map((c) => Math.round(255 * ((1 - 0.45) + 0.45 * c / 255)));
window.__B = { ready: false, missing: [], anims: [], frames: 0, placed: 0, water: null, rings: [] };
class S extends Phaser.Scene {
  preload() {
    for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const im of wman.images) if (im.key !== 'water_field_village') this.load.image(im.key, 'assets/' + im.png);
    this.load.atlas('char_player', 'assets/characters/char_player.png', 'assets/characters/char_player.json');
  }
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
    // DayClock makeGlow(): the 96 px radial halo
    const c = this.textures.createCanvas('fv_glow', 96, 96), g2 = c.context;
    const gr = g2.createRadialGradient(48, 48, 2, 48, 48, 48);
    gr.addColorStop(0, 'rgba(255,236,180,0.95)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.55)');
    gr.addColorStop(0.6, 'rgba(255,190,110,0.16)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
    g2.fillStyle = gr; g2.fillRect(0, 0, 96, 96); c.refresh();
    // 0.33x shelf of every building / street piece (not the derived overlays / glows / water)
    const order = Object.keys(sp).filter((k) => !['overlay', 'glow', 'underlay'].includes(sp[k].kind));
    let x = 12, y = 8, rowH = 0;
    for (const k of order) {
      const s = sp[k], sc = 0.33;
      const w = s.frameSize[0] * sc, h = s.frameSize[1] * sc;
      if (x + w > CW - 10) { x = 12; y += rowH + 4; rowH = 0; }
      if (s.waterOverlay && sp[s.waterOverlay]) {
        const ws = sp[s.waterOverlay];
        this.add.sprite(x + s.anchor[0] * w, y + s.anchor[1] * h, ws.atlas, ws.frame).setScale(sc).setOrigin(s.anchor[0], s.anchor[1])
          .setDepth(-1e5 + y + s.anchor[1] * h - 0.5).play('spr:' + s.waterOverlay + ':ripple');
      }
      const img = this.add.sprite(x + s.anchor[0] * w, y + s.anchor[1] * h, s.atlas, s.frame).setScale(sc).setOrigin(s.anchor[0], s.anchor[1]);
      img.setDepth(-1e5 + y + s.anchor[1] * h);
      if (s.anims && s.anims.work) img.play('spr:' + k + ':work');
      B.placed++;
      x += w + 4; rowH = Math.max(rowH, h);
    }
    const KX = 45.2548, KY = 22.6274;
    const label = (t, ty) => this.add.text(12, ty + 6, t, { fontFamily: 'sans-serif', fontSize: '16px', color: '#20242c', backgroundColor: 'rgba(255,255,255,0.7)' }).setDepth(FX + 100);
    const street = (ox, oy, top, mode) => {
      const night = mode === 'night', shader = mode === 'shader';
      const W = (wx, wy) => [ox + (wx + wy) * KX, oy + (wx - wy) * KY];
      const g = this.add.graphics().setDepth(oy - 4000);
      const band = this.make.graphics({ x: 0, y: 0, add: false });
      band.fillStyle(0xffffff, 1).fillRect(0, top, CW, BAND_H);
      g.setMask(band.createGeometryMask());                // keep this street's ground inside its own band
      label({ fallback: 'DAY, fallback pool: deck d, hotel_pool_water d-0.5 (under), staff by staffDepths, overlay d+1',
        shader: 'DAY, Water.js pool (palette pool, shore quay, mask waterPolyFlat) at d-0.5 UNDER the deck',
        night: 'NIGHT = DayClock: MULTIPLY overlay (0x5a6aa8 @0.45) at FX-30, <key>_glow ADD + fv_glow halos (lightK) at FX-29' }[mode], top);
      const poly = (pts, col) => { g.fillStyle(col, 1); g.beginPath(); g.moveTo(...W(...pts[0])); for (const p of pts.slice(1)) g.lineTo(...W(...p)); g.closePath(); g.fillPath(); };
      poly([[-6, -1.9], [20, -1.9], [20, 9], [-6, 9]], 0xeee4d2);
      poly([[-6, -3.3], [20, -3.3], [20, -1.9], [-6, -1.9]], 0xc9a070);
      poly([[-6, -7], [20, -7], [20, -3.3], [-6, -3.3]], 0xf1deb2);
      poly([[-6, -12], [20, -12], [20, -7], [-6, -7]], 0x3cbecd);
      const glows = [];
      const put = (k, wx, wy) => {
        const s = sp[k]; if (!s) return null;
        const [px, py] = W(wx, wy);
        const im = this.add.sprite(px, py, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py);
        if (s.anims && s.anims.work) im.play('spr:' + k + ':work');
        if (night && s.night && sp[s.night.glow]) {
          const gk = sp[s.night.glow];
          glows.push(this.add.image(px, py, gk.atlas, gk.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(FX - 29).setBlendMode(Phaser.BlendModes.ADD));
        }
        if (night) (s.lightPoints || []).forEach(([dx, dy], i) => glows.push(this.add.image(px + dx, py + dy, 'fv_glow')
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(FX - 29).setScale(1.25 * ((s.lightK || [])[i] || 1)).setAlpha(0.75)));
        if (s.overlay && sp[s.overlay]) {
          const o = sp[s.overlay];
          this.add.image(px, py, o.atlas, o.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py + 1);
        }
        if (s.waterOverlay && sp[s.waterOverlay]) {
          if (shader) {
            const flat = [];
            for (let i = 0; i < s.waterPolyFlat.length; i += 2) flat.push(px + s.waterPolyFlat[i], py + s.waterPolyFlat[i + 1]);
            const xs = flat.filter((_, i) => i % 2 === 0), ys = flat.filter((_, i) => i % 2 === 1);
            const region = { x: Math.min(...xs) - 24, y: Math.min(...ys) - 24, w: Math.max(...xs) - Math.min(...xs) + 48, h: Math.max(...ys) - Math.min(...ys) + 48 };
            try {
              const w = new Water(this, { region, mask: { water: [flat] }, waterPx: 0, defaultShore: 'quay', palette: 'pool',
                quality: 'high', manifest: wman, openSea: false, depth: py + s.waterDepth, shoreDepth: py + s.waterDepth + 0.05 });
              B.water = { isShader: w.isShader, bodyVerts: w.stats.bodyVerts, buildMs: Math.round(w.stats.buildMs) };
              B.waterObj = w;
            } catch (e) { B.water = { error: String(e && e.stack || e) }; }
          } else {
            const w = sp[s.waterOverlay];
            this.add.sprite(px, py, w.atlas, w.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(py + s.waterDepth).play('spr:' + s.waterOverlay + ':ripple');
          }
          if (mode !== 'night') {                       // probe ring: deck pixels just outside the water polygon
            const P = s.waterPoly, cx = P.reduce((a, p) => a + p[0], 0) / P.length, cy = P.reduce((a, p) => a + p[1], 0) / P.length;
            const ring = [];
            for (let i = 0; i < P.length; i++) {
              const [ax, ay] = P[i], [bx, by] = P[(i + 1) % P.length];
              for (let t = 0.15; t < 0.9; t += 0.07) {
                const qx = ax + (bx - ax) * t, qy = ay + (by - ay) * t;
                const dx = qx - cx, dy = qy - cy, l = Math.hypot(dx, dy);
                ring.push([Math.round(px + qx + dx / l * 7), Math.round(py + qy + dy / l * 7)]);
              }
            }
            B.rings.push({ mode, ring });
          }
        }
        // staff by staffDepths (the chief stands in for the uniformed staff here)
        (s.staffPoints || []).forEach(([dx, dy], i) => {
          const front = (s.staffDepths || [])[i] === 'front';
          this.add.image(px + dx, py + dy, 'char_player', 'idle_SE_0').setOrigin(0.5, 0.8125).setDepth(front ? py + 0.5 : py + dy);
        });
        const mk = this.add.graphics().setDepth(py + 0.6);
        for (const [f, col] of [['balconyPoints', 0xc000c0], ['customerPoints', 0x2050e0], ['seatPoints', 0xe09000], ['swimPoints', 0x00a0e0], ['lyingPoints', 0xffd000]]) {
          for (const [dx, dy] of (s[f] || [])) { mk.fillStyle(col, 0.9); mk.fillCircle(px + dx, py + dy, 3); }
        }
        B.placed++;
        return im;
      };
      put('beach_lamp', -3.5, -2.0); put('beach_lamp', 4.5, -2.0); put('beach_lamp', 12.5, -2.0);
      put('string_lights_x', 0.5, -3.15); put('string_lights_x', 8.5, -3.15); put('string_lights_x', 16.5, -3.15);
      put('resort_hotel', 0.0, 2.9); put('hotel_pool', 7.4, 2.3); put('beach_cafe', 13.0, 1.8); put('icecream_shop', 17.1, 1.6);
      put('beach_bar', 9.0, -5.4); put('beach_gate', 3.2, -3.85); put('tourist_info', 15.4, -4.8);
      if (night) {                                        // DayClock overlay over this band only (the test page has 3 bands)
        const ov = this.add.image(0, top, '__WHITE').setOrigin(0, 0).setDisplaySize(CW, BAND_H).setDepth(FX - 30);
        ov.setBlendMode(Phaser.BlendModes.MULTIPLY).setTint((NIGHT_MUL[0] << 16) | (NIGHT_MUL[1] << 8) | NIGHT_MUL[2]);
        const bm = this.make.graphics({ x: 0, y: 0, add: false });
        bm.fillStyle(0xffffff, 1).fillRect(0, top, CW, BAND_H);
        for (const gl of glows) gl.setMask(bm.createGeometryMask());
      }
    };
    const shelfBottom = y + rowH + 12;
    B.bands = [shelfBottom, shelfBottom + BAND_H, shelfBottom + 2 * BAND_H];
    street(230, shelfBottom + 560, shelfBottom, 'fallback');
    street(230, shelfBottom + BAND_H + 560, shelfBottom + BAND_H, 'shader');
    street(230, shelfBottom + 2 * BAND_H + 560, shelfBottom + 2 * BAND_H, 'night');
    B.scene = this; B.ready = true;
  }
}
window.__B.game = new Phaser.Game({ type: Phaser.WEBGL, width: CW, height: CH, backgroundColor: '#efe3c6',
  render: { antialias: true, preserveDrawingBuffer: true }, scene: S, banner: false });
`;
const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#efe3c6}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module" src="__bbld.js"></script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 3400 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__bbld.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.route('**/fv/__bbld.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: JS }));
await page.goto(srv.url + '__bbld.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__B && window.__B.ready, null, { timeout: 400000 });
await sleep(2500);
const res = await page.evaluate(() => {
  const B = window.__B, sc = B.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('bbld_')).length,
    anims: B.anims.length, animKeys: B.anims, framesChecked: B.frames, missing: B.missing, playing, placed: B.placed,
    water: B.water, rings: B.rings, bands: B.bands };
});
// the CPU is shared with Blender renders: pause the game loop, then read pixels + screenshot the (software WebGL) canvas
await page.evaluate(() => window.__B.game.loop.sleep());
await sleep(300);
const png = path.join(ROOT, 'docs', 'previews', 'bbld_phaser.png');
fs.mkdirSync(path.dirname(png), { recursive: true });
await page.screenshot({ path: png, timeout: 240000 });
// land over water: compare the deck ring of band 1 (fallback water) with band 2 (Water.js) at the same offsets
let ringDiff = null;
if (res.rings.length === 2) {
  const [a, b] = res.rings;
  const dy = res.bands[1] - res.bands[0];
  ringDiff = await page.evaluate(({ a, b, dy }) => new Promise((resolve) => {
    const cv = document.querySelector('canvas');
    const img = new Image();
    img.onload = () => {
      const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
      const ctx = c2.getContext('2d'); ctx.drawImage(img, 0, 0);
      let worst = 0, sum = 0;
      for (let i = 0; i < a.ring.length; i++) {
        const [x1, y1] = a.ring[i], [x2, y2] = b.ring[i];
        const p = ctx.getImageData(x1, y1, 1, 1).data, q = ctx.getImageData(x2, y2, 1, 1).data;
        const d = Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
        worst = Math.max(worst, d); sum += d;
      }
      resolve({ points: a.ring.length, worst, mean: Math.round(sum / a.ring.length * 10) / 10, bandOffset: dy });
    };
    img.src = cv.toDataURL('image/png');
  }), { a, b, dy });
}
res.ringDiff = ringDiff;
delete res.rings;
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(path.join(OUTDIR, 'beach_bld_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
const waterOk = res.water && res.water.isShader === true;
const ringOk = ringDiff && ringDiff.mean < 6 && ringDiff.worst < 60;
if (!waterOk) console.log('FAIL: Water.js did not build as a shader', JSON.stringify(res.water));
if (!ringOk) console.log('FAIL: the pool water shows past the deck rim (Water.js vs fallback ring differ)', JSON.stringify(ringDiff));
process.exit(errors.length || notFound.length || res.missing.length || !waterOk || !ringOk ? 1 : 0);
