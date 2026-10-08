// Civic fragment (assets/civic, CONTRACT_V8 section AB) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/civic_phaser.mjs
// Loads assets/civic/manifest.json + every atlas (Phaser JSON hash), registers the sprite anims like
// src/core/Assets.js (spr:<key>:<anim>) and the vehicle anims ({anim}_{dir}_{i}), checks that every sprite / layer /
// anim / vehicle frame exists, then builds a live demo: the bank and the police station drawn layer by layer in their
// drawOrder (characters in the @behind / @front slots), a pointer test against revealPoly that fades the shell and
// shows the dollhouse cut, the vault + cell door anims, smouldering ruins, a fence ring with the excavator digging
// and the dump truck tipping.  Writes docs/previews/civ_phaser.png (+ civ_phaser_closed.png) and
// /tmp/fv_review/civic_phaser.json.  Exit 1 on missing frames / page errors / failed reveal test.
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
      for (const [an, a] of Object.entries(c.anims)) for (const d of c.dirs) {
        const names = []; for (let i = 0; i < a.frames; i++) names.push(an + '_' + d + '_' + i);
        C.frames += names.length;
        const fr = names.filter((f) => has(c.atlas, f)).map((f) => ({ key: c.atlas, frame: f }));
        if (fr.length !== names.length) C.missing.push(k + '.' + an + '.' + d);
        const key = 'veh:' + k + ':' + an + ':' + d;
        this.anims.create({ key, frames: fr, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
        C.anims.push(key);
      }
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
    const bank = building('bank', 360, 430);
    const police = building('police_station', 1000, 430);
    this.input.on('pointermove', (p) => { for (const st of Object.values(cutaways)) st.set(Phaser.Geom.Polygon.Contains(st.poly, p.x, p.y)); });
    bank.objs.bank_vault.play('spr:bank_vault:vault');
    police.objs.police_station_cell.play('spr:police_station_cell:open');
    // ---- ruins smouldering on their scorch decals
    let rx = 120;
    for (const [k, d] of [['ruin_s', 'scorch_decal_s'], ['ruin_m', 'scorch_decal_m'], ['ruin_l', 'scorch_decal_l'], ['ruin_house_town', 'scorch_decal_m']]) {
      img(d, rx, 820, -1000);
      img(k, rx, 820);
      img(k + '_smoke', rx, 820, 821).play('spr:' + k + '_smoke:smoke');
      rx += 250;
    }
    // ---- demolition on an M plot: fence ring + excavator + dump truck
    const px = 1460, py = 760;
    img('rubble_pile_m', px, py);
    for (const pc of man.fenceRings.M.pieces) {
      const o = img(pc.key, px + pc.at[0], py + pc.at[1]);
      if (sp[pc.key].anims && sp[pc.key].anims.blink) o.play('spr:' + pc.key + ':blink');
    }
    const lay = man.demolitionLayout.M;
    const veh = (k, at, d, an) => { const c = ch[k]; const o = this.add.sprite(px + at[0], py + at[1], c.atlas, an + '_' + d + '_0').setOrigin(c.anchor[0], c.anchor[1]).setDepth(py + at[1]); o.play('veh:' + k + ':' + an + ':' + d); return o; };
    veh('excavator', lay.excavator.at, 'SE', 'dig');
    if (lay.dump_truck) veh('dump_truck', lay.dump_truck.at, 'SE', 'idle_loaded');
    const tip = this.add.sprite(1750, 400, ch.dump_truck.atlas, 'tip_SE_0').setOrigin(ch.dump_truck.anchor[0], ch.dump_truck.anchor[1]);
    tip.play({ key: 'veh:dump_truck:tip:SE', repeat: -1, repeatDelay: 400 });
    // ---- props row
    let x = 70;
    for (const k of ['wanted_board', 'fire_hydrant', 'fire_alarm_post', 'insurance_sign', 'for_sale_sign', 'sold_sign', 'welcome_mat', 'moving_boxes_stack', 'furniture_pile_s', 'furniture_pile']) {
      const s = sp[k]; const o = img(k, x + s.frameSize[0] * s.anchor[0] * 0.8, 1040);
      o.setScale(0.8);
      if (s.anims && s.anims.ring) o.play('spr:' + k + ':ring');
      x += s.frameSize[0] * 0.8 + 6;
    }
    C.scene = this; C.ready = true;
  }
}
window.__C.game = new Phaser.Game({ type: Phaser.WEBGL, width: 2000, height: 1120, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 2000, height: 1120 }, deviceScaleFactor: 1 });
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
await page.mouse.move(360, 330);
await sleep(900);
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
