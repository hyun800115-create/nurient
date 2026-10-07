// Townfolk v5 in headless Chromium (Phaser 3.90, WebGL via SwiftShader), no game code.
//   node tools/test/townfolk2_phaser.mjs
// Loads assets/townfolk + assets/townfolk2 manifests, merges them with mergeTownfolkManifests()
// (tools/townfolk2_compose.js), installs the tfatlas frames, and stages a wedding + a farewell with
// TownfolkSprite2: brides, grooms, clapping and seated guests, mourners (sad, face override), pushers.
// Counts core head / face / brow frames missing from the textures and atlases without a loaded texture (layers
// that were never packed - fully hidden, e.g. a hair tie under a hat - are listed, not errors), page errors,
// draw calls per frame; writes docs/previews/townfolk2_phaser.png and /tmp/fv_review/townfolk2_phaser.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeTownfolkManifests, Townfolk2, TownfolkSprite2 } from './tools/townfolk2_compose.js';
const GL = window.__GLC = { draw: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
}
const m1 = await (await fetch('assets/townfolk/manifest.json')).json();
const m2 = await (await fetch('assets/townfolk2/manifest.json')).json();
const man = mergeTownfolkManifests(m1, m2);
window.__TF = { ready: false, missing: [], checked: 0, emptyLayers: new Set() };
class S extends Phaser.Scene {
  preload() { townfolkPreload(this, man, 'assets/'); }
  create() {
    townfolkInstall(this, man);
    const tf = this.tf = new Townfolk2(man.townfolk);
    this.add.rectangle(360, 640, 720, 1280, 0xeef3f9).setDepth(-1e6);
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xe2ae98, 1).fillPoints([{ x: 360, y: 180 }, { x: 700, y: 350 }, { x: 360, y: 520 }, { x: 20, y: 350 }], true);
    g.fillStyle(0xdde8e0, 1).fillPoints([{ x: 360, y: 700 }, { x: 700, y: 870 }, { x: 360, y: 1040 }, { x: 20, y: 870 }], true);
    const rng = mulberry32(2026);
    this.npcs = [];
    const add = (p, anim, dir, x, y, face) => {
      const s = new TownfolkSprite2(this, tf, p, x, y);
      s.play(anim, dir); if (face) s.setFace(face);
      s.frame = Math.floor(rng() * tf.T.anims[anim].frames); s.refresh(true);
      this.npcs.push(s); return s;
    };
    // wedding (top): couple, seated guests (sit SW = SE mirrored), clapping guests
    add(tf.preset('bride', rng), 'idle', 'E', 330, 300);
    add(tf.preset('groom', rng), 'happy', 'W', 390, 300);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
      add(tf.preset(k % 2 ? 'wedding_guest' : 'teacher', rng), 'sit', 'SW', 180 + k * 52 + r * 60, 360 + r * 40 + k * 6);
    }
    for (let k = 0; k < 6; k++) add(tf.preset('wedding_guest', rng), 'clap', ['SE', 'S', 'SW', 'E', 'W', 'S'][k], 450 + (k % 3) * 70, 380 + Math.floor(k / 3) * 70);
    add(tf.preset('flower_girl', rng), 'walk', 'NE', 300, 460);
    // farewell (bottom): mourners sad (head bowed), family with black hats, an elder seated with a sad face
    for (let k = 0; k < 8; k++) add(tf.preset(k < 3 ? 'mourner_family' : 'mourner', rng), 'sad', ['S', 'SE', 'SW', 'S', 'E', 'W', 'S', 'SE'][k], 200 + (k % 4) * 90, 820 + Math.floor(k / 4) * 70);
    add(tf.preset('mourner_family', rng), 'sit', 'S', 600, 960, 'sad');
    add(tf.randomPerson(rng), 'walk', 'SW', 120, 980, 'sad');
    // pushers (middle)
    for (let k = 0; k < 6; k++) add(tf.randomPerson(rng), 'push', ['S', 'SE', 'E', 'NE', 'N', 'SW'][k], 90 + k * 110, 620);
    // missing-frame audit over every frame of every anim / dir of these people
    const tex = this.textures;
    let checked = 0;
    for (const s of this.npcs) {
      for (const [a, info] of Object.entries(tf.T.anims)) for (const d of info.dirs) for (let i = 0; i < info.frames; i++) {
        for (const l of tf.layers(s.person, a, d, i, { face: s.face })) {
          checked++;
          const core = /^(head\.|face\.|brow\.)/.test(l.layer);
          if (!l.atlas) { if (core) window.__TF.missing.push('no atlas ' + l.frame); else window.__TF.emptyLayers.add(l.layer); }
          else if (!tex.exists(l.atlas)) window.__TF.missing.push('no texture ' + l.atlas);
          else if (core && !tex.get(l.atlas).has(l.frame)) window.__TF.missing.push('missing core frame ' + l.frame);
        }
      }
    }
    window.__TF.checked = checked;
    window.__TF.scene = this; window.__TF.ready = true;
  }
  update(t, dt) { for (const s of this.npcs) { s.update(dt); s.place(); } }
}
window.__TF.game = new Phaser.Game({ type: Phaser.WEBGL, width: 720, height: 1280, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/fv/__townfolk2.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__townfolk2.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__TF && window.__TF.ready, null, { timeout: 180000 });
await sleep(1500);
const res = await page.evaluate(async () => {
  const g = window.__TF.game, C = window.__GLC, sc = window.__TF.scene;
  const d0 = C.draw, f0 = g.loop.frame;
  while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 10));
  const n = g.loop.frame - f0;
  const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
  return { npcs: sc.npcs.length, sprites, drawPerFrame: +((C.draw - d0) / n).toFixed(1), layersChecked: window.__TF.checked,
    missing: window.__TF.missing.length, missingSample: window.__TF.missing.slice(0, 5),
    neverPackedLayers: [...window.__TF.emptyLayers].slice(0, 8) };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'townfolk2_phaser.png') });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
fs.mkdirSync('/tmp/fv_review', { recursive: true });
fs.writeFileSync('/tmp/fv_review/townfolk2_phaser.json', JSON.stringify({ res, errors }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || res.missing ? 1 : 0);
