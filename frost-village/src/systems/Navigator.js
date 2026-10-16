// (v4.2, docs/v42_plan.md §3.4) 길 안내: while the chief carries something, where it goes.
//   when       the bag is not empty, Settings.data.nav, the first loop is done, not in 관망, no panel, no ceremony
//   where      Tutorial.destination(type) for every type in the bag (the one resolver the arrow and the porters use);
//              the place that takes the MOST bag items wins (capped by its room), ties -> the shorter way; the HUD
//              chip says '+1곳' when another type goes elsewhere and a tap on it shows the next place
//   route      gs.roads.route (walk graph + RoadNet, cached A*), a straight line under nav.straightUnder; replanned when
//              the place changes, when he strays nav.strayPx from it, at most every nav.replanEvery s
//   drawing    a ground chevron 56 px ahead of his boots toward the next route point, footprint dots every nav.dotEvery
//              px (≤ nav.maxDots, hidden near him) with a light wave running to the target, a pulsing ring + a badge
//              (item icon + short name) on the place; the UI scene draws the off-screen edge badge and the chip
//   with the tutorial arrow on the same pad: only the arrow + the dots; on another pad: both, the navigator smaller
// CODE-1: generated fv_nav_* textures (fxTex.js); CODE-2 swaps in chief_fx's nav_* frames by key.
// ≤ 20 display objects while carrying (pooled), ≤ 0.02 ms a frame averaged.

import { BALANCE } from '../data/balance.js';
import { Settings } from '../core/Save.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';
import { panel } from '../core/Panel.js';
import { makeAll } from './v42/fxTex.js';

const N = () => (BALANCE.v42 && BALANCE.v42.nav) || { dotEvery: 48, maxDots: 16, hideNear: 90, replanEvery: 1, strayPx: 80, straightUnder: 360 };
const AHEAD = 56;

export class Navigator {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.dest = null;           // { type, n, pad, label, text, others, list }
    this.route = [];
    this.routeLen = 0;
    this.pickT = 0;
    this.replanT = 0;
    this.wave = 0;
    this.cycle = 0;             // the chip was tapped: show the next place
    this.hiddenLoad = false;    // the player hid the guide for this load (hold on the chip)
    this.active = false;
    this.objs = 0;
    makeAll(gs);
    this.chev = gs.add.image(0, 0, 'fv_nav_chevron', 'c0').setOrigin(0.5).setDepth(DEPTH.PAD + 3).setVisible(false);
    this.dots = [];
    for (let i = 0; i < 16; i++) this.dots.push(gs.add.image(0, 0, 'fv_nav_dot', 'd0').setOrigin(0.5).setDepth(DEPTH.PAD + 3).setVisible(false));
    this.ring = gs.add.image(0, 0, 'fv_nav_ring').setOrigin(0.5).setDepth(DEPTH.PAD + 3).setVisible(false);
    // the badge over the place: a small panel with the item icon and the place's short name
    const b = this.badge = gs.add.container(0, 0).setDepth(DEPTH.LABEL - 40).setVisible(false);
    this.badgeBg = panel(gs, 0, 0, 'ui_panel', 150, 46).setOrigin(0.5).setAlpha(0.95);
    this.badgeIcon = Assets.image(gs, -48, 0, 'item_fish_cooked').setOrigin(0.5);
    this.badgeText = gs.add.text(-24, 0, '', { fontFamily: gs.font, fontSize: '19px', fontStyle: '800', color: '#1f5f66', resolution: 2 }).setOrigin(0, 0.5);
    b.add([this.badgeBg, this.badgeIcon, this.badgeText]);
    for (const o of [this.chev, this.ring, this.badge].concat(this.dots)) o.noCull = true;
  }

  /** is the guide on now (the UI asks too: chip, edge badge) */
  wanted() {
    const gs = this.gs, p = gs.player;
    if (!p || p.stack.count + p.stack.incoming <= 0) return false;
    if (Settings.data.nav === false) return false;
    if (gs.tutorial && gs.tutorial.inTutorial) return false;
    if (this.v42 && this.v42.pilot && this.v42.pilot.on) return false;
    const ui = gs.scene.get('UI');
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return false;
    const rk = gs.v4 && gs.v4.rank;
    if (rk && rk.ceremonyOn) return false;
    if (this.hiddenLoad) return false;
    return true;
  }

  /** the places the bag's items go to, best first: [{ pad, label, lp, n, types: [[type, n]], d }] */
  places() {
    const gs = this.gs, p = gs.player, T = gs.tutorial;
    const counts = {};
    for (const it of p.stack.items) counts[it.type] = (counts[it.type] || 0) + 1;
    for (const ty of p.stack.inTypes) counts[ty] = (counts[ty] || 0) + 1;
    const byPad = new Map();
    let firstNone = null;
    for (const ty in counts) {
      const d = T ? T.destination(ty) : null;
      if (!d || !d.pad) { if (!firstNone) firstNone = ty; continue; }
      const n = Math.min(counts[ty], Math.max(1, d.room || counts[ty]));
      let e = byPad.get(d.pad);
      if (!e) { e = { pad: d.pad, label: d.label || null, lp: d.lp || null, text: d.text, n: 0, types: [], d: gdist(p.x, p.y, d.pad.x, d.pad.y), surplus: !!d.surplus }; byPad.set(d.pad, e); }
      e.n += n; e.types.push([ty, counts[ty]]);
    }
    const out = Array.from(byPad.values()).sort((a, b) => b.n - a.n || a.d - b.d);
    out.none = firstNone;
    out.counts = counts;
    return out;
  }

  update(dt) {
    const gs = this.gs, p = gs.player;
    const want = this.wanted();
    // an empty bag ends the load: "hide for this load" and the chip's cycling start over
    if (p && p.stack.count + p.stack.incoming === 0) { this.hiddenLoad = false; this.cycle = 0; }
    if (!want) { this.hide(); this.dest = null; return; }
    this.active = true;
    this.pickT -= dt;
    if (this.pickT <= 0 || !this.dest) {
      this.pickT = 0.25;
      const list = this.places();
      const prev = this.dest;
      let pick = list.length ? list[this.cycle % list.length] : null;
      // (hysteresis: the place he is walking to stays unless another takes at least 2 more items)
      if (pick && !this.cycle && prev && prev.pad && pick.pad !== prev.pad) { const keep = list.find((q) => q.pad === prev.pad); if (keep && pick.n < keep.n + 2) pick = keep; }
      if (pick) {
        const ty = pick.types[0][0];
        this.dest = { type: ty, n: pick.types.reduce((s, q) => s + q[1], 0), pad: pick.pad, label: pick.label, lp: pick.lp, others: list.length - 1, surplus: pick.surplus };
      } else {
        const ty = list.none || (p.stack.items[0] && p.stack.items[0].type);
        this.dest = { type: ty, n: p.stack.count, pad: null, none: true, label: this.fullPlace(ty) };
      }
      if (!prev || prev.pad !== this.dest.pad) this.replanT = 0;
    }
    const d = this.dest;
    if (!d.pad) { this.hide(); this.pulseTrash(dt); this.aura(null); return; }
    // the route (replan when the place changed or he strayed)
    this.replanT -= dt;
    if (this.replanT <= 0 && (this.routeFor !== d.pad || this.strayed())) {
      this.replanT = Math.max(0.1, N().replanEvery || 1);
      this.plan(d.pad);
    }
    this.draw(dt);
  }

  /** the place a type would go to were it not full (the chip's '광장 판매대 가득') */
  fullPlace(ty) {
    if (!ty) return null;
    if (/fish_cooked|bread|meat_cooked/.test(ty)) return 'place_market';
    if (/plank|ingot/.test(ty)) return 'place_trade';
    if (/can|axe|pickaxe|rod|sickle|bow/.test(ty)) return 'place_store';
    return null;
  }

  plan(pad) {
    const gs = this.gs, p = gs.player, c = N();
    this.routeFor = pad;
    const dist = gdist(p.x, p.y, pad.x, pad.y);
    this.route.length = 0;
    if (dist < (c.straightUnder || 360) || !gs.roads) this.route.push({ x: pad.x, y: pad.y });
    else gs.roads.route(p.x, p.y, pad.x, pad.y, this.route);
    this.plans = (this.plans || 0) + 1;
    this.measure();
  }

  measure() {
    const p = this.gs.player;
    let L = 0, px = p.x, py = p.y;
    for (const q of this.route) { L += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y; }
    this.routeLen = L;
  }

  /** is he more than nav.strayPx away from the route polyline? */
  strayed() {
    const p = this.gs.player, R = this.route;
    if (!R.length) return true;
    let best = Infinity, ax = this.routeStart ? this.routeStart.x : p.x, ay = this.routeStart ? this.routeStart.y : p.y;
    for (const q of R) {
      const vx = q.x - ax, vy = q.y - ay, l2 = vx * vx + vy * vy || 1;
      const tt = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / l2));
      best = Math.min(best, Math.hypot(ax + vx * tt - p.x, ay + vy * tt - p.y));
      ax = q.x; ay = q.y;
    }
    return best > (N().strayPx || 80);
  }

  draw(dt) {
    const gs = this.gs, p = gs.player, d = this.dest, c = N();
    // trim route points he has passed (the next one is the first more than 40 px away that lies ahead)
    const R = this.route;
    while (R.length > 1 && gdist(p.x, p.y, R[0].x, R[0].y) < 40) R.shift();
    this.measure();
    // the tutorial arrow on the same pad: only the arrow + the dots
    const T = gs.tutorial, tg = T && T.target;
    const samePad = !!(tg && d.pad && Math.abs(tg.x - d.pad.x) < 30 && Math.abs(tg.y - d.pad.y) < 60);
    const small = !!(tg && !samePad);
    // the chevron: 56 px ahead of his boots toward the next route point
    const nx = R[0] ? R[0].x : d.pad.x, ny = R[0] ? R[0].y : d.pad.y;
    const ang = Math.atan2(ny - p.y, nx - p.x);
    const k = (Math.round(ang / (Math.PI / 8)) + 16) % 16;
    const near = gdist(p.x, p.y, d.pad.x, d.pad.y) < 70;
    this.chev.setVisible(!near).setFrame('c' + k).setPosition(p.x + Math.cos(ang) * AHEAD, p.y + Math.sin(ang) * AHEAD * 0.5 + 4).setScale(small ? 0.8 : 1);
    this.chev.setAlpha(0.85 + Math.sin(gs.time.now / 180) * 0.15);
    this.aura(near ? null : ang);
    // dots along the route, from AHEAD on, every dotEvery px, up to maxDots (none within hideNear of him)
    this.wave = (this.wave + dt / 1.2) % 1;
    const every = c.dotEvery || 48, maxD = Math.min(16, c.maxDots || 16), hide = c.hideNear || 90;
    let used = 0, s = every, px = p.x, py = p.y, along = 0;
    const total = Math.max(1, this.routeLen);
    for (let i = 0; i < R.length && used < maxD; i++) {
      const q = R[i], L = Math.hypot(q.x - px, q.y - py);
      while (s <= along + L && used < maxD) {
        const f = (s - along) / Math.max(1e-6, L), x = px + (q.x - px) * f, y = py + (q.y - py) * f;
        if (gdist(x, y, p.x, p.y) > hide && gdist(x, y, d.pad.x, d.pad.y) > 40) {
          const dot = this.dots[used++];
          const w = Math.abs(((s / total) - this.wave + 1) % 1);
          const lit = w < 0.12;
          dot.setVisible(true).setFrame(lit ? 'd1' : 'd0').setPosition(x, y).setAlpha(lit ? 1 : 0.8).setScale(small ? 0.8 : 1);
        }
        s += every;
      }
      along += L; px = q.x; py = q.y;
    }
    for (let i = used; i < this.dots.length; i++) if (this.dots[i].visible) this.dots[i].setVisible(false);
    // the place: a pulsing ring + the badge (not when the tutorial arrow already points at it)
    const show = !samePad;
    const ph = (gs.time.now % 1000) / 1000;
    this.ring.setVisible(show).setPosition(d.pad.x, d.pad.y).setScale((small ? 0.75 : 0.95) + ph * 0.25).setAlpha(1 - ph * 0.6);
    if (show) {
      const name = this.placeName(d);
      if (this.badgeText.text !== name) {
        this.badgeText.setText(name);
        const w = Math.max(120, this.badgeText.width + 78);
        this.badgeBg.setSize(w, 46);
        this.badgeIcon.setX(-w / 2 + 26);
        this.badgeText.setX(-w / 2 + 48);
      }
      if (this.badgeType !== d.type) { this.badgeType = d.type; Assets.apply(this.badgeIcon, d.type); this.badgeIcon.setOrigin(0.5).setScale(34 / Math.max(1, this.badgeIcon.frame.realWidth, this.badgeIcon.frame.realHeight)); }
      this.badge.setVisible(true).setPosition(d.pad.x, d.pad.y - 90 + Math.sin(gs.time.now / 300) * 3).setScale(small ? 0.8 : 1);
    } else this.badge.setVisible(false);
    this.objs = 3 + used + 1;
  }

  /** the halo's notch along the route */
  aura(ang) { const a = this.v42 && this.v42.aura; if (a) a.notch = ang; }

  /** a place's short name ('광장 판매대', '화덕 입구') */
  placeName(d) { return d && d.label ? t(d.label, d.lp || undefined) : ''; }

  /** the HUD chip: { icon, text, more } (null while the guide is off) */
  chip() {
    const d = this.dest;
    if (!this.active || !d) return null;
    const item = t(d.type || '');
    if (!d.pad) return { icon: d.type, text: d.label ? t('navFull', { place: t(d.label) }) : t('navNone'), more: 0, none: true };
    const m = Math.max(1, Math.round(this.routeLen / 64));
    return { icon: d.type, text: t('navChip', { item, n: d.n, place: this.placeName(d), m }), more: d.others || 0 };
  }
  /** a tap on the chip: the next place of a mixed bag */
  next() { this.cycle++; this.pickT = 0; }
  /** a long press on the chip: hide the guide for this load */
  hideLoad() { this.hiddenLoad = true; this.hide(); }

  /** nowhere takes the bag: the discard pad pulses softly */
  pulseTrash(dt) {
    const tr = this.gs.trash;
    this.trashT = (this.trashT || 0) - dt;
    if (tr && tr.pad && tr.enabled !== false && this.trashT <= 0) { this.trashT = 1.5; if (tr.pad.pulse) tr.pad.pulse(); }
  }

  hide() {
    if (!this.active && !this.chev.visible) return;
    this.active = false;
    this.chev.setVisible(false); this.ring.setVisible(false); this.badge.setVisible(false);
    for (const d of this.dots) if (d.visible) d.setVisible(false);
    this.aura(null);
    this.objs = 0;
  }

  state() {
    const d = this.dest;
    return { active: this.active, dest: d ? { type: d.type, n: d.n, x: d.pad ? Math.round(d.pad.x) : null, y: d.pad ? Math.round(d.pad.y) : null, label: d.label, others: d.others || 0, none: !!d.none } : null,
      route: this.route.map((q) => [Math.round(q.x), Math.round(q.y)]), routeLen: Math.round(this.routeLen), objects: this.objs, plans: this.plans || 0, chip: this.chip() };
  }

  destroy() { for (const o of [this.chev, this.ring, this.badge].concat(this.dots)) if (o && o.scene) o.destroy(); }
}
