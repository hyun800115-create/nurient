// GbView (plan §5.4–5.7, §6, §12.1): the Phaser side of the 금방 module. It only draws what the model decided — the
// same beats run off screen (coins, reviews, doorstep boxes happen either way). One instance per world scene:
//   view = new GbView(host, ports)   (the host makes it when ports.world.scene exists)
//   view.update(dt, events) · view.follow(orderId) · view.reveal(on) · view.toast(msg) · view.openApp(tab) · destroy()
// Parts: GbHub (the 금방 dress of the v4.2 depot + the crew inside the cutaway + the outbound pile), VanDriver per van
// (Van art + Courier doorstep scenes), SledView (G1b), Doorstep (boxes on the steps), OrderBubbles, GbChip + toast,
// GbApp (the 금방 마켓 phone), Follow (첫 주문 따라가기 / 따라가기 camera + captions).
// What the parts ask of the view: scene, dolls.make / dolls.resident, sound(key, x, y), flash(x, y, aid),
// hearts(x, y), coinPop(x, y, n), cssPerWorld(), zoomWorld(), addTicker(fn), near(x, y, m), puff(x, y), night().

import { View } from '../../core/View.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { GbHub } from './GbHub.js';
import { VanDriver } from './VanDriver.js';
import { SledView } from './Sled.js';
import { Doorstep } from './Doorstep.js';
import { OrderBubbles } from './OrderBubbles.js';
import { GbChip } from './GbChip.js';
import { GbApp } from './GbApp.js';
import { Follow } from './Follow.js';
import { glowTex, shadowTex } from './art.js';

/** the rigs the module made (their animation clocks are advanced here, once per frame) */
class Dolls {
  constructor(port) { this.port = port || {}; this.live = new Set(); }
  wrap(r) {
    if (!r) return null;
    this.live.add(r);
    const d = r.destroy ? r.destroy.bind(r) : () => {};
    r.destroy = () => { this.live.delete(r); d(); };
    return r;
  }
  make(look) { return this.wrap(this.port.make ? this.port.make(look) : null) || NULL_RIG(); }
  resident(aid, hid) { return this.port.resident ? this.wrap(this.port.resident(aid, hid)) : null; }
  update(dt) { for (const r of this.live) if (r.update) r.update(dt); }
  count() { let n = 0; for (const r of this.live) n += r.layers ? r.layers() : 1; return n; }
}
/** a rig that draws nothing (no doll runtime: the vans still drive, the boxes still land) */
const NULL_RIG = () => ({ play() {}, place() {}, visible() {}, update() {}, destroy() {}, parcelPoint: () => null, handPoint: () => null, bellPoint: () => null, parcelDepth: () => null, alpha: 1 });

export class GbView {
  constructor(host, ports) {
    this.host = host; this.P = ports; this.m = host.model;
    this.scene = ports.world.scene;
    this.uiScene = ports.ui && ports.ui.scene ? ports.ui.scene : null;
    this.t = 0;
    this.tickers = [];
    this.coins = new Map();                // order id -> coins (gb:delivered), shown at the joy beat
    this.recent = [];                      // the last 6 deliveries (the app's done cards; not saved)
    this.photos = [];                      // the last 3 doorstep photos { key, aid, T } (not saved)
    this.dolls = new Dolls(ports.dolls);
    shadowTex(this.scene); glowTex(this.scene);
    this.hub = new GbHub(this);
    this.vans = new Map();
    this.sled = null;
    this.door = new Doorstep(this);
    this.bubbles = new OrderBubbles(this);
    this.chip = this.uiScene ? new GbChip(this) : null;
    this.app = null;
    this.followV = new Follow(this);
    this.flashes = [];
    this.photoN = 0;
    this.puffT = 0;
    this.nightV = 0;
  }

  // ------------------------------------------------------------------------------------------ what parts ask for
  lang() { return this.P.lang ? this.P.lang() : 'ko'; }
  cam() { return this.scene.cameras.main; }
  /** is (x, y) within m px of the camera view? */
  near(x, y, m = 300) { const v = this.cam().worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; }
  /** CSS px per world px (the bell / bubble size rules) */
  cssPerWorld() { const ds = this.scene.scale && this.scene.scale.displayScale; return this.cam().zoom / ((ds && ds.x) || 1); }
  /** the world zoom without the render scale (labels keep a constant on-screen size with 1 / zoomWorld) */
  zoomWorld() { return this.cam().zoom / (View.k || 1); }
  addTicker(fn) { this.tickers.push(fn); }
  /** 0 (day) .. 1 (deep night): the game's night tint */
  night() { return this.nightV; }

  sound(key, x, y) {
    const S = this.P.sound;
    if (!S) return;
    if (x !== undefined && !this.near(x, y, 420)) return;
    if (S.at && x !== undefined) S.at(key, x, y); else if (S.play) S.play(key);
  }

  hearts(x, y) { const F = this.P.fx; if (F && F.burst && this.near(x, y, 100)) F.burst('heart', x, y); }
  coinPop(x, y, n) { const F = this.P.fx; if (n > 0 && F && F.floatText && this.near(x, y, 100)) F.floatText(x, y, '+' + Math.round(n), '#ffe27a', 30); }
  puff(x, y) {
    const F = this.P.fx;
    if (!F || !F.sheet || this.puffT > 0) return;
    this.puffT = 0.25;
    F.sheet('fx_smoke_puff', x, y, { size: 44, depth: y - 2 });
  }

  /** the doorstep photo: a white flash + a 128 × 80 snapshot of the door for the app (last 3, not saved) */
  flash(x, y, aid) {
    const sc = this.scene;
    const f = sc.add.image(x, y, glowTex(sc)).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX + 5).setScale(2.4).setAlpha(0.95);
    this.addTicker((dt) => { f.setAlpha(Math.max(0, f.alpha - dt * 4)).setScale(f.scaleX + dt * 3); if (f.alpha <= 0) { f.destroy(); return true; } return false; });
    this.sound('sfx_gb_chime', x, y);
    this.snapshot(x, y + 20, aid);
  }

  snapshot(x, y, aid) {
    const sc = this.scene, cam = this.cam(), R = sc.game.renderer;
    if (!R || !R.snapshotArea || !this.near(x, y, -40)) return;
    const z = cam.zoom, w = 240 * z, h = 150 * z;
    const sx = (x - cam.worldView.x) * z - w / 2, sy = (y - cam.worldView.y) * z - h * 0.7;
    const key = 'gb_photo_' + (this.photoN++ % 3);
    try {
      R.snapshotArea(Math.max(0, Math.round(sx)), Math.max(0, Math.round(sy)), Math.round(w), Math.round(h), (img) => {
        if (!img || !img.width) return;
        const tex = sc.textures;
        if (tex.exists(key)) tex.remove(key);
        const c = tex.createCanvas(key, 128, 80);
        c.getContext().drawImage(img, 0, 0, img.width, img.height, 0, 0, 128, 80);
        c.refresh();
        this.photos = this.photos.filter((p) => p.key !== key);
        this.photos.unshift({ key, aid, T: this.host.T() });
        while (this.photos.length > 3) this.photos.pop();
      });
    } catch (e) { /* the canvas cannot be read (tainted / context lost): the app shows the icon */ }
  }

  // ------------------------------------------------------------------------------------------ the frame
  update(dt, evs) {
    this.t += dt;
    this.puffT -= dt;
    const C = this.P.clock;
    const dark = C && C.dark ? C.dark() : 0;
    this.nightV = Math.max(0, Math.min(1, dark * 1.6));
    for (const e of evs) this.onEvent(e);
    const m = this.m;
    this.hub.update(dt);
    if (m.disp) for (const v of m.disp.vans) { let d = this.vans.get(v.id); if (!d) this.vans.set(v.id, (d = new VanDriver(this, v.id))); d.sync(v, dt); }
    if (m.sled) { if (!this.sled) this.sled = new SledView(this); this.sled.sync(m.sled, dt); }
    this.door.update(dt);
    this.bubbles.update(dt);
    this.followV.update(dt);
    if (this.chip) this.chip.update(dt);
    if (this.app) this.app.update(dt);
    this.dolls.update(dt);
    for (let i = this.tickers.length - 1; i >= 0; i--) if (this.tickers[i](dt)) this.tickers.splice(i, 1);
  }

  onEvent(e) {
    switch (e.t) {
      case 'gb:order': this.bubbles.add(e); this.hub.onOrder(e); if (this.chip) this.chip.ping(); break;
      case 'gb:pick': case 'gb:pack': case 'gb:ready': case 'gb:load': case 'gb:dispatch': case 'gb:shift': case 'gb:upgrade': case 'gb:stand':
        this.hub.onEvent(e); break;
      case 'gb:opening': this.hub.ceremony(); break;
      case 'gb:open': this.hub.opened(); break;
      case 'gb:delivered':
        this.coins.set(e.id, e.coins); if (this.coins.size > 64) this.coins.delete(this.coins.keys().next().value);
        this.recent.unshift({ id: e.id, aid: e.aid, hid: e.hid, how: e.how, T: e.T, coins: e.coins });
        if (this.recent.length > 6) this.recent.pop();
        if (this.app) this.app.dirty = true;
        break;
      case 'gb:pickup': this.door.pickup(e); break;
      case 'gb:horn': this.sound('sfx_gb_horn', e.x, e.y); break;
      case 'gb:sled': if (e.op === 'go' && this.m.sled) this.sound('sfx_sleigh_bells', this.m.sled.x, this.m.sled.y); break;
      default: break;
    }
    if (e.t === 'gb:dispatch') { const d = this.vans.get(e.id); if (d) d.dispatched(e); }
    this.followV.onEvent(e);
  }

  // ------------------------------------------------------------------------------------------ api
  follow(orderId) { return this.followV.start(orderId); }
  reveal(on) { return this.hub.reveal(on); }
  toast(msg) { if (this.chip) return this.chip.toast(msg); if (this.P.ui && this.P.ui.toast) { this.P.ui.toast(msg); return true; } return false; }
  openApp(tab) {
    if (!this.uiScene) return false;
    if (!this.app) this.app = new GbApp(this);
    this.app.show(tab || 'today');
    return true;
  }
  appOpen() { return !!(this.app && this.app.open); }
  following() { return !!this.followV.active; }
  worldChanged() { this.door.dirty = true; }

  /** display objects the module keeps (the perf budget) */
  objects() {
    let n = this.hub.objects() + this.door.objects() + this.bubbles.objects() + this.dolls.count();
    for (const d of this.vans.values()) n += d.objects();
    if (this.sled) n += this.sled.objects();
    if (this.chip) n += this.chip.objects();
    if (this.app) n += this.app.objects();
    return n;
  }

  destroy() {
    this.hub.destroy();
    for (const d of this.vans.values()) d.destroy();
    if (this.sled) this.sled.destroy();
    this.door.destroy(); this.bubbles.destroy(); this.followV.destroy();
    if (this.chip) this.chip.destroy();
    if (this.app) this.app.destroy();
    this.tickers.length = 0;
  }
}
