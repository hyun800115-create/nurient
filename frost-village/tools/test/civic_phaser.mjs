// Civic fragment (assets/civic, CONTRACT_V8 section AB) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/civic_phaser.mjs
// Loads assets/civic/manifest.json + every atlas (Phaser JSON hash), registers the sprite anims like
// src/core/Assets.js (spr:<key>:<anim>) and the vehicle anims ({anim}_{dir}_{i}), checks that every sprite / layer /
// anim / vehicle frame exists, then builds a live demo: the bank and the police station drawn layer by layer in their
// drawOrder (characters in the @behind / @front slots), a pointer test against revealPoly that fades the shell and
// shows the dollhouse cut, the vault + cell door anims, smouldering ruins, a fence ring with the excavator digging
// and the dump truck tipping.  Writes docs/previews/civ_phaser.png (+ civ_phaser_closed.png) and
// /tmp/fv_review/civic_phaser.json.  Exit 1 on missing frames / page errors / failed reveal test.
// Polish v2: the demolition plots use demolitionLayout.M.sides (Y- and the MIRRORED X+ side: the excavator / truck
// flipped with setOrigin(anchor) + setFlipX like src/entities/Train.js - the anchors are now exactly centred), the
// gate piece is left out, the loaded truck = truck anim + its cargo overlay anim, the town ruins smoulder too, and the
// dump truck tips onto a dump_pile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/civic/manifest.json')).json();
window.__C = { ready: false, missing: [], anims: [], frames: 0, reveal: null };
class S extends Phaser.Scene {
  preload() { for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); }
  create() {
    const C = window.__C, tex = this.textures, sp = man.sprites, ch = man.characters || {};
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    for (const [k, s] of Object.entries(sp)) {
      C.frames++;
      if (!has(s.atlas, s.frame)) C.missing.push(k + ':' + s.frame);
      for (const [an, a] of Object.entries(s.anims || {})) {
        const fr = a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f }));
        C.frames += a.frames.length;
        if (fr.length !== a.frames.length) C.missing.push(k + '.' + an);
        const key = 'spr:' + k + ':' + an;
        if (!this.anims.exists(key)) this.anims.create({ key, frames: fr, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
        C.anims.push(key);
      }
    }
    for (const [k, c] of Object.entries(ch)) {
      const reg = (an, a, prefix) => { for (const d of c.dirs) {
        const names = []; for (let i = 0; i < a.frames; i++) names.push(prefix + an + '_' + d + '_' + i);
        C.frames += names.length;
        const fr = names.filter((f) => has(c.atlas, f)).map((f) => ({ key: c.atlas, frame: f }));
        if (fr.length !== names.length) C.missing.push(k + '.' + prefix + an + '.' + d);
        const key = 'veh:' + k + ':' + prefix + an + ':' + d;
        this.anims.create({ key, frames: fr, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
        C.anims.push(key);
      } };
      for (const [an, a] of Object.entries(c.anims)) reg(an, a, '');
      if (c.cargoOverlay) for (const an of c.cargoOverlay.anims) reg(an, c.anims[an], 'cargo_');
      if (Math.abs(c.anchor[0] - 0.5) * c.frameSize[0] > 2) C.missing.push(k + ': anchor x not centred');
    }
    // ---- helpers
    const img = (k, x, y, depth, frame) => { const s = sp[k]; const o = this.add.sprite(x, y, s.atlas, frame || s.frame).setOrigin(s.anchor[0], s.anchor[1]); o.setDepth(depth ?? y); return o; };
    const W = (ox, oy, x, y) => [ox + (x + y) * 45.2548, oy + (x - y) * 22.6274];
    // ---- cutaway building: layers in drawOrder, characters as coloured pegs in their slots
    const cutaways = {};
    const building = (key, x, y) => {
      const s = sp[key], cut = s.cutaway, objs = {}, peg = [];
      cut.drawOrder.forEach((item, i) => {
        const depth = y + i * 0.01;
        if (item.startsWith('@')) {
          const slot = item.slice(1);
          for (const [field, sl] of Object.entries(s.pointSlots || {})) {
            if (sl !== slot) continue;
            const pts = Array.isArray(s[field][0]) ? s[field] : [s[field]];
            for (const p of pts) peg.push(this.add.ellipse(x + p[0], y + p[1] - 22, 16, 40, slot === 'behind' ? 0xd9483b : 0x3d7cc9).setDepth(depth).setVisible(false));
          }
          return;
        }
        objs[item] = img(item, x, y, depth);
      });
      const shell = objs[cut.fade.layer], stub = objs[cut.cut.layer];
      stub.setAlpha(0);
      const poly = new Phaser.Geom.Polygon(cut.revealPoly.map((p) => new Phaser.Geom.Point(x + p[0], y + p[1])));
      const st = { open: false, poly, shell, stub, pegs: peg, objs };
      st.set = (open) => {
        if (st.open === open) return; st.open = open;
        this.tweens.add({ targets: shell, alpha: open ? cut.fade.openAlpha : 1, duration: cut.fade.ms });
        this.tweens.add({ targets: stub, alpha: open ? 1 : 0, duration: cut.fade.ms });
        peg.forEach((p) => p.setVisible(open));
      };
      cutaways[key] = st;
      return st;
    };
    const bank = building('bank', 380, 470);
    const police = building('police_station', 1060, 470);
    this.input.on('pointermove', (p) => { for (const st of Object.values(cutaways)) st.set(Phaser.Geom.Polygon.Contains(st.poly, p.x, p.y)); });
    bank.objs.bank_vault.play('spr:bank_vault:vault');
    police.objs.police_station_cell.play('spr:police_station_cell:open');
    // ---- vehicles the way the game draws them: SW / NW = the SE / NE frames flipped around the (centred) anchor
    const MIR = { SW: 'SE', NW: 'NE' };
    const veh = (k, x, y, d, an, cargo) => {
      const c = ch[k], src = MIR[d] || d;
      const mk = (prefix) => { const o = this.add.sprite(x, y, c.atlas, prefix + an + '_' + src + '_0').setOrigin(c.anchor[0], c.anchor[1]);
        o.setFlipX(!!MIR[d]); o.setDepth(y + (prefix ? 0.001 : 0)); o.play('veh:' + k + ':' + prefix + an + ':' + src); return o; };
      const o = mk('');
      if (cargo && c.cargoOverlay && c.cargoOverlay.anims.includes(an)) mk('cargo_');
      return o;
    };
    // ---- demolition on two M plots: the default street side (Y-) and the mirrored X+ side, gate piece left out
    const demo = (px, py, side, stage) => {
      const L = man.demolitionLayout.M.sides[side];
      img('scorch_decal_m', px, py, -1000);
      img(stage, px, py);
      man.fenceRings.M.pieces.forEach((pc, i) => {
        if (i === L.gateIndex) return;
        const o = img(pc.key, px + pc.at[0], py + pc.at[1]);
        if (sp[pc.key].anims && sp[pc.key].anims.blink) o.play('spr:' + pc.key + ':blink');
      });
      veh('excavator', px + L.excavator.at[0], py + L.excavator.at[1], L.excavator.dir, 'dig');
      veh('dump_truck', px + L.dump_truck.at[0], py + L.dump_truck.at[1], L.dump_truck.dir, 'idle', true);
    };
    demo(640, 960, 'Y-', 'ruin_m');
    demo(1560, 960, 'X+', 'rubble_pile_m');
    // ---- the dump truck tipping at the dump (NE, tail toward the camera) onto a dump_pile
    const dt = ch.dump_truck;
    const tpx = 2150, tpy = 470;
    const tp = dt.tipPoint && dt.tipPoint.NE ? dt.tipPoint.NE : [0, 0];
    img('dump_pile', tpx + tp[0], tpy + tp[1]);
    const tip = this.add.sprite(tpx, tpy, dt.atlas, 'tip_NE_0').setOrigin(dt.anchor[0], dt.anchor[1]).setDepth(tpy - 1);
    tip.play({ key: 'veh:dump_truck:tip:NE', repeat: -1, repeatDelay: 400 });
    // ---- ruins smouldering on their scorch decals (0.6x)
    let rx = 40;
    for (const [k, d] of [['ruin_s', 'scorch_decal_s'], ['ruin_m', 'scorch_decal_m'], ['ruin_l', 'scorch_decal_l'],
      ['ruin_house_town', 'scorch_decal_m'], ['ruin_shop_town', 'scorch_decal_m'], ['ruin_l_town', 'scorch_decal_l']]) {
      const fw = sp[k].frameSize[0], ax = sp[k].anchor[0], sc = 0.6;
      rx += fw * ax * sc;
      img(d, rx, 1330, -1000).setScale(sc);
      img(k, rx, 1330).setScale(sc);
      img(k + '_smoke', rx, 1330, 1331).setScale(sc).play('spr:' + k + '_smoke:smoke');
      rx += fw * (1 - ax) * sc + 6;
    }
    // ---- props row
    let x = rx + 20;
    for (const k of ['wanted_board', 'fire_hydrant', 'fire_alarm_post', 'insurance_sign', 'for_sale_sign', 'sold_sign', 'moving_boxes_stack', 'furniture_pile']) {
      const s = sp[k]; const o = img(k, x + s.frameSize[0] * s.anchor[0] * 0.6, 1330);
      o.setScale(0.6);
      if (s.anims && s.anims.ring) o.play('spr:' + k + ':ring');
      x += s.frameSize[0] * 0.6 + 4;
    }
    C.scene = this; C.ready = true;
  }
}
window.__C.game = new Phaser.Game({ type: Phaser.WEBGL, width: 2600, height: 1420, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 2600, height: 1420 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
const notFound = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
await page.route('**/fv/__civic.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__civic.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__C && window.__C.ready, null, { timeout: 240000 });
await sleep(1500);
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.mouse.move(5, 5);
await sleep(500);
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'civ_phaser_closed.png') });
// reveal test: hover the bank (inside revealPoly) -> its shell must fade, the police station stays closed
// headless WebGL on a busy shared CPU can run the game loop slowly: move in steps, then wait for the tween
for (let k = 1; k <= 5; k++) { await page.mouse.move(5 + (375 * k) / 5, 5 + (365 * k) / 5); await sleep(120); }
await page.waitForFunction(() => {
  const o = window.__C.scene.children.list.find((c) => c.frame && c.frame.name === 'bank_shell');
  return o && o.alpha < 0.3;
}, null, { timeout: 20000, polling: 200 }).catch(() => {});
await sleep(300);
const reveal = await page.evaluate(() => {
  const sc = window.__C.scene;
  const shells = sc.children.list.filter((o) => o.frame && /_shell$/.test(o.frame.name));
  const cuts = sc.children.list.filter((o) => o.frame && /_shell_cut$/.test(o.frame.name));
  return { shells: shells.map((o) => [o.frame.name, +o.alpha.toFixed(2)]), cuts: cuts.map((o) => [o.frame.name, +o.alpha.toFixed(2)]) };
});
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'civ_phaser.png') });
const res = await page.evaluate(() => {
  const C = window.__C, sc = C.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { atlases: Object.keys(sc.textures.list).filter((k) => k.startsWith('civ_')).length, anims: C.anims.length,
    framesChecked: C.frames, missing: C.missing, playing };
});
const bankShell = reveal.shells.find((s) => s[0] === 'bank_shell');
const policeShell = reveal.shells.find((s) => s[0] === 'police_station_shell');
const revealOk = bankShell && bankShell[1] < 0.3 && policeShell && policeShell[1] > 0.9;
console.log(JSON.stringify({ ...res, reveal, revealOk }));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/civic_phaser.json', JSON.stringify({ res, reveal, revealOk, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || !revealOk ? 1 : 0);
