// IncidentsView — everything incidents_runtime draws (Phaser only; the model never sees it):
//   persistent (from the model, whenever near the view): BuildingFx (fires, soot, ruins, demolition, sites, rebuilt),
//   Decor (hydrants, alarm posts, welcome mats, for-sale / sold signs), the WantedBoard, the PoliceStation
//   staged (one at a time, from the director's scene commands): FireScene, ChaseScene, ScuffleScene, QueueScene,
//   WindowScene, ApologyScene; MovingScene for moving trucks (its own slot); the fire drill
// Talks go through ports.say / ports.emote (the game's Bubbles + VillageVoice), sounds through ports.sound, the
// art residency through ports.residency (`incident:<art>` classes, patch P4).

import { Cast } from './Cast.js';
import { SheetPool, rng } from './art.js';
import { BuildingFx } from './BuildingFx.js';
import { Decor } from './Decor.js';
import { WantedBoard } from './WantedBoard.js';
import { PoliceStation } from './PoliceStation.js';
import { FireScene } from './FireScene.js';
import { ChaseScene } from './ChaseScene.js';
import { ScuffleScene } from './ScuffleScene.js';
import { QueueScene } from './QueueScene.js';
import { WindowScene } from './WindowScene.js';
import { ApologyScene } from './ApologyScene.js';
import { MovingScene } from './MovingScene.js';
import { it, itemName } from '../strings.js';
import { POLICE, WANTED_BOARD } from '../layout.js';

const SCENES = { fire: FireScene, drill: FireScene, theft: ChaseScene, scuffle: ScuffleScene, queue: QueueScene, window: WindowScene, apology: ApologyScene };
const NEAR = 1500;

export class IncidentsView {
  constructor(host, ports) {
    this.host = host;
    this.ports = ports;
    this.scene = ports.world.scene;
    this.cfg = host.cfg;
    this.cast = new Cast(this, ports);
    this.sheets = new SheetPool(this.scene);
    this.bfx = new BuildingFx(this);
    this.decor = new Decor(this);
    this.board = new WantedBoard(this);
    this.station = new PoliceStation(this);
    this.cur = null;              // the staged incident scene
    this.moving = null;           // the moving set piece
    this.timers = [];
    this.artRef = new Map();
    this.pace = 1;
    this.culpritPreset = 'burglar';
    this.ms = 0; this.n = 0;
    this.t = 0;
    this.sync();
  }

  // ------------------------------------------------------------------------------------------ helpers for scenes
  T() { return this.host.T(); }
  lang() { return this.host.lang(); }
  text(key, vars, pick) { return it(this.lang(), key, vars, pick); }
  itemName(item) { return itemName(item, this.lang()); }
  pos(id) { return this.host.pos(id); }
  rect() { const V = this.ports.view; return V && V.rect ? V.rect() : null; }
  near(x, y, m = NEAR) { const v = this.rect(); if (!v) return true; return Math.hypot(Math.max(0, v.x - x, x - (v.x + v.width)), Math.max(0, v.y - y, y - (v.y + v.height))) < m; }
  later(s, fn) { this.timers.push({ t: this.t + s, fn }); }

  /** a person's look by pid / sid (the game's look when it has one) */
  lookOf(ref, role, k) {
    const P = this.ports.people;
    const pid = typeof ref === 'string' ? ref : null;
    // the culprit wears the same burglar outfit (same seed) in the chase, in the cell and on the tipped poster
    if (role === 'culprit' && this.culpritPreset) return { preset: this.culpritPreset, seed: (pid ? [...pid].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) : 977 * (ref | 0) + 31 * (k | 0)) >>> 0, pid };
    const l = pid && P && P.look ? P.look(pid) : null;
    if (l) return l;
    const seed = (typeof ref === 'number' ? ref : String(ref || '').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) + 17 * (k | 0);
    return { seed: seed >>> 0, pid };
  }

  sound(key, x, y, vol = 1) { const S = this.ports.sound; if (!S) return; if (S.at && x !== undefined) S.at(key, x, y, { volume: vol }); else if (S.play) S.play(key, { volume: vol }); }
  /** a positional loop: { stop(), volume(v) } (a stub when the game has no loops) */
  loop(key, x, y, vol = 0.5, follow) { const S = this.ports.sound; const h = S && S.loop ? S.loop(key, x, y, { volume: vol, follow }) : null; return h || { stop() {}, volume() {} }; }
  music(key) { const S = this.ports.sound; if (S && S.music) S.music(key); }
  burst(x, y, kind) {
    const F = this.ports.fx;
    if (kind === 'rebuilt' || kind === 'sparkle') { this.sheets.play('fx_sparkle', x, y, { depth: y + 400, once: true, scale: kind === 'rebuilt' ? 1.6 : 0.8 }); if (F && F.burst) F.burst('confetti', x, y, kind === 'rebuilt' ? 30 : 10); }
    else if (kind === 'heart') { if (F && F.burst) F.burst('heart', x, y, 4); else this.sheets.play('fx_hearts', x, y, { once: true, depth: y + 400 }); }
    else if (kind === 'coin') { if (F && F.burst) F.burst('coin', x, y, 5); else this.sheets.play('fx_coin_spin', x, y, { once: true, depth: y + 400 }); }
  }

  /** the staged ack: the view showed phase `phase` of incident `id` */
  shown(id, phase) { if (this.host.model.director.shown(id, phase, this.T())) this.host.flush(); }

  /** a driving route (the game's drive lanes) trimmed to start just outside the view */
  driveRoute(from, to) {
    const R = this.ports.roads;
    let pts = R && R.route ? R.route(from, to, 'drive') : null;
    if (!pts || pts.length < 2) {
      // an L along the iso axes: first along world X (screen down-right / up-left), then along world Y
      const a = { i: 0, j: 0 }, Lx = (p) => { const u = (p.x - 3120) / 64, v = (p.y - 1315) / 32; return { i: (u + v) / 2, j: (u - v) / 2 }; };
      const A = Lx(from), B = Lx(to);
      const mid = { x: 3120 + 64 * (B.i + A.j), y: 1315 + 32 * (B.i - A.j) };
      pts = [from, mid, to];
      void a;
    } else pts = pts.slice().concat([to]);
    // start just outside the view (a truck from far away does not drive its whole way on screen)
    const v = this.rect();
    if (v) {
      let k = 0;
      for (let i = pts.length - 1; i >= 0; i--) if (!this.near(pts[i].x, pts[i].y, 320)) { k = i; break; }
      if (k > 0) pts = pts.slice(k);
    }
    return pts;
  }

  /** residency of an art group (refcounted; the host already holds staged scenes' groups) */
  art(op, art) {
    const n = this.artRef.get(art) || 0;
    const m = op === 'want' ? n + 1 : Math.max(0, n - 1);
    this.artRef.set(art, m);
    const R = this.ports.residency;
    if (!R) return;
    if (op === 'want' && n === 0 && R.want) R.want('incident:' + art);
    if (op === 'drop' && m === 0 && n > 0 && R.drop) R.drop('incident:' + art);
  }

  // ------------------------------------------------------------------------------------------ model -> view
  sync() {
    const st = this.host.model.state(this.T());
    this.bfx.sync(st.buildings);
    this.decor.sync(st);
    this.board.sync(st.wanted);
    this.station.sync(st.cell);
    this.stationOn = st.police;
  }

  onModel(ev) {
    switch (ev.t) {
      case 'inc:fire': case 'inc:hydrant': case 'inc:police': case 'inc:wanted': case 'inc:phase': case 'inc:end': case 'inc:move':
        this.sync();
        if (ev.t === 'inc:wanted' && ev.op === 'post') this.later(0.05, () => this.board.pop(ev.slot));
        if (ev.t === 'inc:move' && (ev.op === 'in' || ev.op === 'out')) this.startMoving(ev);
        return;
      default: return;
    }
  }

  sceneCmd(c) {
    if (c.op === 'start') {
      if (this.cur) this.closeCur();
      if (this.moving && !this.moving.leaving) this.moving.end();     // the truck drives off: one set piece at a time
      const Cls = SCENES[c.kind];
      if (!Cls) return;
      this.cur = new Cls(this, c);
      this.cur.start();
    } else if (c.op === 'phase') {
      if (this.cur && this.cur.id === c.id) this.cur.phase(c.phase, c.inc);
    } else if (c.op === 'end') {
      if (this.cur && this.cur.id === c.id) this.cur.end();
    } else if (c.op === 'drill') {
      if (this.cur) return;
      this.cur = new FireScene(this, { id: 999999, kind: 'drill', at: c.at, inc: { phase: 'dispatch', cast: {} } });
      this.cur.start();
    }
  }
  endDrill(s) { if (this.cur === s) s.end(); }
  closeCur() { if (!this.cur) return; this.cur.destroy(); this.cur = null; }

  startMoving(ev) {
    if (this.moving) return;
    // the transient budget: no moving set piece while an incident scene (or its pictures) is in; the signs and the
    // welcome mat still tell the story
    if (this.cur || ['fire', 'crime', 'rebuild'].some((a) => (this.artRef.get(a) || 0) > 0)) return;
    const job = this.host.model.moves.jobs.find((j) => j.id === ev.id);
    if (!job || !job.home) return;
    const b = this.pos(String(job.home).split('#')[0]);
    if (!b || !this.near(b.x, b.y, this.cfg.stageRange)) return;
    this.moving = new MovingScene(this, { id: Number(String(job.id).replace(/\D/g, '')) || 1, kind: 'moving', job, inc: {} });
    this.art('want', 'moving');
    this.moving.start();
  }
  /** Residency says an art group is in memory now (the lab's loader; the game's Residency `ready` callback) */
  artReady(art) {
    this.bfx.artReady(art);
    this.station.artReady(art);
    for (const sc of [this.cur, this.moving]) if (sc) for (const v of sc.vehicles) v.refresh(true);
  }
  endMoving(s) { if (this.moving === s) s.end(); }

  /** P11 tap: the wanted board opens the big poster, the police station opens its cutaway */
  tap(x, y) {
    if (this.board.panel) { this.board.close(); return true; }
    if (this.board.shown && this.board.hit(x, y) && this.board.list.length) { this.board.open(this.board.list[0].slot); return true; }
    if (this.station.shown && this.station.hit(x, y)) { this.station.reveal(!this.station.revealed); return true; }
    return false;
  }

  vehicleEvent() { /* the vehicles module drives the trucks in the game (dispatch); scenes use their own when it does not */ }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.t += dt;
    if (this.timers.length) { const due = this.timers.filter((x) => x.t <= this.t); if (due.length) { this.timers = this.timers.filter((x) => x.t > this.t); for (const d of due) d.fn(); } }
    // persistent things near the view
    const nb = this.near(WANTED_BOARD.x, WANTED_BOARD.y);
    if (nb && !this.board.shown) this.board.show(); else if (!nb && this.board.shown) this.board.hide();
    const ns = this.stationOn && this.near(POLICE.x, POLICE.y);
    if (ns && !this.station.shown) { this.station.show(); this.station.sync(this.host.model.state(this.T()).cell); } else if (!ns && this.station.shown) this.station.hide();
    this.station.update(dt);
    this.decor.update(dt);
    this.bfx.update(dt);
    if (this.cur) { this.cur.update(dt); if (this.cur.done) this.closeCur(); }
    if (this.moving) { this.moving.update(dt); if (this.moving.done) { this.moving.destroy(); this.moving = null; this.later(this.cfg.releaseAfter || 15, () => this.art('drop', 'moving')); } }
    this.cast.update(dt);
    if (t0) { this.ms += performance.now() - t0; this.n++; }
  }

  info() {
    return {
      msView: this.n ? this.ms / this.n : 0, scene: this.cur ? this.cur.kind : null, moving: !!this.moving, actors: this.cast.count, sheets: this.sheets.count,
      buildings: this.bfx.items.size, decor: this.decor.count, board: this.board.shown, station: this.station.shown, art: Object.fromEntries(this.artRef),
    };
  }

  toggled(on) { if (!on && this.cur && this.cur.kind !== 'moving') this.cur.end(); }

  /** after a preview: drop the scenes, redraw from the restored model */
  reset() {
    this.closeCur();
    if (this.moving) { this.moving.destroy(); this.moving = null; }
    this.bfx.destroy(); this.bfx = new BuildingFx(this);
    this.sync();
  }

  destroy() {
    this.closeCur();
    if (this.moving) this.moving.destroy();
    this.bfx.destroy(); this.decor.destroy(); this.board.destroy(); this.station.destroy();
    this.cast.clear(); this.sheets.destroy();
  }
}

void rng;
