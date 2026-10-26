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
// CODE-1: generated fv_nav_* textures (fxTex.js); (CODE-2) chief_fx's nav_* frames (v42_core page) take over in place
// when the page arrives (reskin): nav_chevron_00..15, nav_dot_0/1, the nav_ring loop (no code pulse), the nav_badge
// with the item icon in its iconRect and the place's name on a ui_chip plate at a constant screen size. Placement rules
// of the art: the chevron max(56, ring rx + 36) ahead of his boots (it clears the halo at zoom 0.6), the dots hidden
// within max(90, chevron + 30).
// ≤ 20 display objects while carrying (pooled), ≤ 0.02 ms a frame averaged.
// (v4.2 fix, 마을 게시판 — the designer's "통조림 내가 가져다 줘도 안 들어가지네") pin(): a place the player picked on the
//   notice board ('→ 서리역 짐 싣는 곳'). The guide leads there with an empty bag too, before the bag's own places, until he
//   arrives (nav.pinArrivePx), the request is done (its valid()), nav.pinMaxS s pass, or a long press on the chip.
// ((v4.2 final, gameplay review #3) an open order (솔방울 주문판, the board's 정기 납품) that wants a bag item adds its
//   place, 서리역 짐 싣는 곳, to the bag's places: first when the player picked that order (board row / order card) or the
//   arrow sends it there (Tutorial.orderFirst), else as the chip's '+1곳'. Before, the cans the board asked for were
//   guided to the 잡화점 only.
// ((v4.2 final, gameplay review #6) the pin's clock waits while 관망 drives, 관망's walking does not count as arriving,
//   and a pin whose request was met under 관망 says so when the player takes over ('부탁을 다 채웠어요 · 길 안내 끝').

import { BALANCE } from '../data/balance.js';
import { Settings } from '../core/Save.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';
import { panel } from '../core/Panel.js';
import { makeAll } from './v42/fxTex.js';

const N = () => (BALANCE.v42 && BALANCE.v42.nav) || { dotEvery: 48, maxDots: 16, hideNear: 90, replanEvery: 1, strayPx: 80, straightUnder: 360, pinMaxS: 240, pinArrivePx: 90 };
const AHEAD = 56;
const SWITCH_S = 4;            // s a clearly better place must stay better before the guide changes its mind

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
    this.pinned = null;         // (v4.2 fix) a place picked on the notice board: { pad, label, lp, type, valid, t }
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
    this.artOn = false;
    if (Assets.has('nav_chevron')) this.reskin();
    this.onArrive = () => { if (!this.artOn && Assets.has('nav_chevron')) this.reskin(); };
    Assets.arrivals.push(this.onArrive);
  }

  /** (CODE-2) the chief_fx art on the pooled pieces */
  reskin() {
    if (this.artOn || !Assets.has('nav_chevron')) return false;
    const gs = this.gs;
    const r = Assets.sprite('nav_chevron');
    this.chevTex = r.tex;
    this.chev.setTexture(r.tex, 'nav_chevron_00');
    for (const d of this.dots) d.setTexture(r.tex, 'nav_dot_0');
    // the target ring: a sprite playing its own outward pulse
    const vis = this.ring.visible, rx = this.ring.x, ry = this.ring.y;
    this.ring.destroy();
    this.ring = gs.add.sprite(rx, ry, r.tex, 'nav_ring_0').setOrigin(0.5).setDepth(DEPTH.PAD + 3).setVisible(vis);
    this.ring.noCull = true;
    const ra = Assets.spriteAnim('nav_ring', 'play');
    if (ra) this.ring.play(ra);
    // the badge: nav_badge (pointer tip at the origin) + the item icon in its disc + a name plate (ui_chip)
    const b = this.badge;
    b.removeAll(true);
    const bd = Assets.def('nav_badge') || {};
    const ir = bd.iconRect || [16, 14, 56, 56], fs = bd.frameSize || [88, 100];
    this.badgeBg = Assets.image(gs, 0, 0, 'nav_badge');
    this.badgeIcon = Assets.image(gs, ir[0] + ir[2] / 2 - fs[0] / 2, ir[1] + ir[3] / 2 - fs[1], 'item_fish_cooked').setOrigin(0.5);
    this.plate = gs.add.container(0, -fs[1] - 4);
    this.plateBg = panel(gs, 0, 0, Assets.has('ui_chip') ? 'ui_chip' : 'ui_panel', 160, 64).setOrigin(0.5, 1).setAlpha(0.96);
    this.badgeText = gs.add.text(0, -32, '', { fontFamily: gs.font, fontSize: '26px', fontStyle: '800', color: '#1f5f66', resolution: 2 }).setOrigin(0.5);
    this.plate.add([this.plateBg, this.badgeText]);
    b.add([this.badgeBg, this.badgeIcon, this.plate]);
    this.badgeType = null;
    this.artOn = true;
    return true;
  }

  /** is the guide on now (the UI asks too: chip, edge badge) */
  wanted() {
    const gs = this.gs, p = gs.player;
    if (!p) return false;
    // (a place picked on the notice board: asked for, so it shows with an empty bag and with the guide switched off)
    const pin = !!this.pinned;
    if (!pin && p.stack.count + p.stack.incoming <= 0) return false;
    if (!pin && Settings.data.nav === false) return false;
    if (gs.tutorial && gs.tutorial.inTutorial) return false;
    if (this.v42 && this.v42.pilot && this.v42.pilot.on) return false;
    const ui = gs.scene.get('UI');
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return false;
    const rk = gs.v4 && gs.v4.rank;
    if (rk && rk.ceremonyOn) return false;
    if (this.hiddenLoad && !pin) return false;
    return true;
  }

  /**
   * (v4.2 fix, 마을 게시판) lead the chief to a place picked on the notice board: { x, y, label, lp, icon, valid }
   * (valid(): the request still stands; checked twice a second). Replaces an earlier pin. false if there is no spot.
   */
  pin(o) {
    if (!o || !Number.isFinite(o.x) || !Number.isFinite(o.y)) return false;
    this.pinned = { pad: { x: o.x, y: o.y }, label: o.label || null, lp: o.lp || null, type: o.icon || 'ui_icon_goal', valid: typeof o.valid === 'function' ? o.valid : null, t: 0, vt: 0.5 };
    // ((v4.2 final) an order picked by the player: its goods in the bag go to the order's place first afterwards too)
    if (o.order) this.orderPick = o.order;
    this.pinNote = null;
    this.hiddenLoad = false;
    this.dest = null; this.pickT = 0; this.replanT = 0; this.routeFor = null;
    return true;
  }
  unpin() { if (!this.pinned) return; this.pinned = null; this.dest = null; this.pickT = 0; this.routeFor = null; }

  /** the pin ends: arrived, its request is done, or it is too old (true = it ended now) */
  pinCheck(dt) {
    const P = this.pinned, p = this.gs.player;
    if (!P || !p) return false;
    const c = N();
    // ((v4.2 final, gameplay review #6) 관망 drives: the pin's clock waits and his walking is not the player arriving)
    const pil = this.pilotOn();
    if (!pil) P.t += dt;
    P.vt -= dt;
    let end = P.t > (Number(c.pinMaxS) || 240), arrived = false, met = false;
    if (!end && P.vt <= 0) { P.vt = 0.5; try { if (P.valid && !P.valid()) end = met = true; } catch (e) { end = true; } }
    if (!end && !pil && gdist(p.x, p.y, P.pad.x, P.pad.y) < (Number(c.pinArrivePx) || 90)) end = arrived = true;
    if (!end) return false;
    this.unpin();
    const ui = this.gs.ui;
    if (arrived && ui) ui.toast(t('navArrive', { place: this.placeName(P) }));
    else if (met && ui) { const msg = t('navPinMet', { place: this.placeName(P) }); if (pil) this.pinNote = msg; else ui.toast(msg); }
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
      // ((v4.2 fix, gameplay L8) room 0 is 0 (an order card that takes 1 more): the chip said '통나무 8')
      const room = Number.isFinite(Number(d.room)) ? Number(d.room) : counts[ty];
      const n = Math.min(counts[ty], Math.max(1, room));
      let e = byPad.get(d.pad);
      if (!e) { e = { pad: d.pad, sink: d.sink || null, label: d.label || null, lp: d.lp || null, text: d.text, n: 0, types: [], d: gdist(p.x, p.y, d.pad.x, d.pad.y), surplus: !!d.surplus }; byPad.set(d.pad, e); }
      e.n += n; e.types.push([ty, counts[ty]]);
    }
    // ((v4.2 final, gameplay review #3) an open order that wants a bag item: its place too (first when the player
    //  picked that order or the arrow sends it there, else '+1곳')
    const G = gs.v4 && gs.v4.growth;
    if (G && G.active && G.dockPad && G.needOf) {
      for (const ty in counts) {
        const need = G.needOf(ty);
        if (need <= 0) continue;
        let e = byPad.get(G.dockPad);
        if (!e) { e = { pad: G.dockPad, sink: G.dock || null, label: 'place_dock_stn', lp: null, text: undefined, n: 0, types: [], d: gdist(p.x, p.y, G.dockPad.x, G.dockPad.y), surplus: false }; byPad.set(G.dockPad, e); }
        if (!e.types.some((q) => q[0] === ty)) { e.n += Math.min(counts[ty], need); e.types.push([ty, counts[ty]]); }
        e.order = true; e.surplus = false;
        if (this.orderPick === ty || (T && T.orderFirst && T.orderFirst(ty))) e.first = true;
      }
    }
    const out = Array.from(byPad.values()).sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0) || b.n - a.n || a.d - b.d);
    out.none = firstNone;
    out.counts = counts;
    return out;
  }

  pilotOn() { return !!(this.v42 && this.v42.pilot && this.v42.pilot.on); }

  update(dt) {
    const gs = this.gs, p = gs.player;
    if (this.pinned) this.pinCheck(dt);
    // ((v4.2 final) a pin that ended under 관망: why, once the player has taken over)
    const pil = this.pilotOn();
    //  (1.8 s after the hand-back, so the '다시 조종해요' toast is read first)
    if (this.wasPilot && !pil) this.noteT = 1.8;
    this.wasPilot = pil;
    if (this.pinNote && !pil && (this.noteT = (this.noteT || 0) - dt) <= 0) { if (gs.ui) gs.ui.toast(this.pinNote, 2400); this.pinNote = null; }
    if (this.orderPick) { const G = gs.v4 && gs.v4.growth; if (!G || !G.active || G.needOf(this.orderPick) <= 0) this.orderPick = null; }
    const want = this.wanted();
    // an empty bag ends the load: "hide for this load" and the chip's cycling start over
    if (p && p.stack.count + p.stack.incoming === 0) { this.hiddenLoad = false; this.cycle = 0; this.loadSig = null; }
    if (!want) { this.hide(); this.dest = null; this.holdRoom(null); return; }
    this.active = true;
    this.pickT -= dt;
    // (v4.2 fix) a place picked on the notice board comes before the bag's places
    const P = this.pinned;
    if (P) {
      if (!this.dest || !this.dest.pinned || this.dest.pad !== P.pad) {
        this.dest = { type: P.type, n: 0, pad: P.pad, sink: null, types: [], label: P.label, lp: P.lp, others: 0, pinned: true };
        this.replanT = 0;
        this.holdRoom(null);
      }
    } else if (this.pickT <= 0 || !this.dest || this.dest.pinned) {
      this.pickT = 0.25;
      const list0 = this.places();
      const prev = this.dest;
      // ((v4.2 fix, gameplay M5) a place the guide left because it filled up is not chosen again for this load for 15 s
      //  (unless nothing else takes it): 식량 상자 → 판매대 → 식량 상자 → … flip-flops)
      const now = this.gs.time.now, ban = this.banned || (this.banned = new Map());
      for (const [pad, until] of ban) if (until <= now) ban.delete(pad);
      const list = ban.size && list0.some((q) => !ban.has(q.pad)) ? Object.assign(list0.filter((q) => !ban.has(q.pad)), { none: list0.none, counts: list0.counts }) : list0;
      let pick = list.length ? list[this.cycle % list.length] : null;
      // ((gameplay review H2) the place he is walking to stays while it still takes something of this load, even when
      //  the resolver's answer moves on (the food box / a workshop input cross their priority line as porters top them
      //  up): only a new load (other kinds of goods), a tap on the chip, or a place that has taken nothing better for
      //  `SWITCH_S` s with at least 2 more items changes it)
      const sig = Object.keys(list.counts || {}).sort().join(',');
      const same = sig === this.loadSig;
      this.loadSig = sig;
      if (!same) ban.clear();
      if (pick && !this.cycle && same && prev && prev.pad && pick.pad !== prev.pad) {
        const keep = list.find((q) => q.pad === prev.pad) || this.stillTakes(prev, list.counts);
        if (keep) {
          // ((v4.2 fix, gameplay M5) a better place must also lie about as near (≤ 1.25 × the way left + 200 px) and
          //  must not be the export dock: the bread run went 식량 상자 → 판매대 → 식량 상자 → 짐 싣는 곳, 7,485 px)
          const dP = gdist(p.x, p.y, pick.pad.x, pick.pad.y), dK = gdist(p.x, p.y, keep.pad.x, keep.pad.y);
          const better = pick.n >= keep.n + 2 && !pick.surplus && dP <= dK * 1.25 + 200;
          this.challT = better && this.challPad === pick.pad ? (this.challT || 0) + 0.25 : better ? 0.25 : 0;
          this.challPad = better ? pick.pad : null;
          if (this.challT < SWITCH_S) pick = keep;
        }
      } else { this.challT = 0; this.challPad = null; }
      if (!pick && same && prev && prev.pad && !this.cycle) pick = this.stillTakes(prev, list.counts);
      // (the place he was walking to takes nothing of this load any more: banned for a while)
      if (pick && same && prev && prev.pad && pick.pad !== prev.pad && !this.cycle && !list0.find((q) => q.pad === prev.pad) && !this.stillTakes(prev, list.counts)) ban.set(prev.pad, now + 15000);
      if (pick) {
        const ty = pick.types[0][0];
        // (the chip's count: what this place takes now, not the whole bag)
        this.dest = { type: ty, n: Math.max(1, pick.n), pad: pick.pad, sink: pick.sink || null, types: pick.types.map((q) => q[0]), label: pick.label, lp: pick.lp, others: list.filter((q) => q.pad !== pick.pad).length, surplus: pick.surplus };
      } else {
        const ty = list.none || (p.stack.items[0] && p.stack.items[0].type);
        const fp = this.fullPlace(ty);
        this.dest = { type: ty, n: p.stack.count, pad: null, none: true, label: fp && fp.label ? fp.label : fp, lp: fp && fp.lp ? fp.lp : null };
      }
      if (!prev || prev.pad !== this.dest.pad) this.replanT = 0;
      // ((v4.2 final) a new load, or the guide coming back (after 관망, an empty bag): the way is planned again at once,
      //  from where he stands — for the same place as the last load it waited for the 1-s replan clock and was kept unless
      //  he strayed 80 px from it, so standing on it further along, its length and chevron counted the way back to its start)
      if (!same || !prev) { this.routeFor = null; this.replanT = 0; }
      this.holdRoom(this.dest, list.counts);
    }
    const d = this.dest;
    // ((gameplay review M2) nowhere takes the bag: the world guide goes, the chip stays and says so)
    if (!d.pad) { this.hideWorld(); this.pulseTrash(dt); this.aura(null); return; }
    // the route (replan when the place changed or he strayed)
    this.replanT -= dt;
    const far = this.routeFor === d.pad && this.strayDist() > 3 * (N().strayPx || 80);     // (a jump: at once)
    if ((this.replanT <= 0 || far) && (this.routeFor !== d.pad || far || this.strayed())) {
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
    // ((v4.2 fix) a raw item: its station's input ('제련소 입구 가득')
    const st = this.gs.stationByInput && this.gs.stationByInput[ty];
    if (st) return { label: 'place_in', lp: { st: t('line_' + st.id) } };
    return null;
  }

  /** ((v4.2 fix, gameplay M5) hold the room this load needs at the place the guide shows (Logistics.setChief): the
   *  porters stop filling it while he walks there. Re-made every pick from what is still in the bag */
  holdRoom(d, counts) {
    const L = this.gs.logistics, p = this.gs.player;
    if (!L || !L.setChief) return;
    // (only while he is on his way: standing still with the load for 8 s gives the room back to the porters)
    const now = this.gs.time.now;
    if (!p || Math.hypot(p.vx || 0, p.vy || 0) > 20 || this.movedAt === undefined) this.movedAt = now;
    if (!d || !d.pad || !d.sink || now - this.movedAt > 8000) { if (this.held) { this.held = false; L.setChief(null); } return; }
    let left = d.n;
    const out = [];
    for (const ty of d.types || []) {
      if (left <= 0) break;
      const n = Math.min((counts && counts[ty]) || 0, left);
      if (n > 0) { out.push({ sink: d.sink, type: ty, n }); left -= n; }
    }
    L.setChief(out);
    this.held = out.length > 0;
  }

  plan(pad) {
    const gs = this.gs, p = gs.player, c = N();
    this.routeFor = pad;
    this.routeStart = { x: p.x, y: p.y };
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

  /** is he more than nav.strayPx away from the route polyline (from where it was planned)? */
  strayed() { return this.strayDist() > (N().strayPx || 80); }
  strayDist() {
    const p = this.gs.player, R = this.route;
    if (!R.length) return Infinity;
    let best = Infinity, ax = this.routeStart ? this.routeStart.x : p.x, ay = this.routeStart ? this.routeStart.y : p.y;
    for (const q of R) {
      const vx = q.x - ax, vy = q.y - ay, l2 = vx * vx + vy * vy || 1;
      const tt = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / l2));
      best = Math.min(best, Math.hypot(ax + vx * tt - p.x, ay + vy * tt - p.y));
      ax = q.x; ay = q.y;
    }
    return best;
  }

  draw(dt) {
    const gs = this.gs, p = gs.player, d = this.dest, c = N();
    // trim route points he has passed (the next one is the first more than 40 px away that lies ahead)
    const R = this.route;
    while (R.length > 1 && gdist(p.x, p.y, R[0].x, R[0].y) < 40) this.routeStart = R.shift();
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
    // (art: the chevron clears the halo ring at every zoom; the dots start past it)
    const au = this.v42 && this.v42.aura, rx = au && au.on ? au.ringWidth() * 0.46 : 0;
    const ahead = this.artOn ? Math.max(AHEAD, rx + 36) : AHEAD;
    this.chev.setVisible(!near).setFrame(this.artOn ? 'nav_chevron_' + (k < 10 ? '0' : '') + k : 'c' + k).setPosition(p.x + Math.cos(ang) * ahead, p.y + Math.sin(ang) * ahead * 0.5 + 4).setScale(small ? 0.8 : 1);
    this.chev.setAlpha(0.85 + Math.sin(gs.time.now / 180) * 0.15);
    this.aura(near ? null : ang);
    // dots along the route, from AHEAD on, every dotEvery px, up to maxDots (none within hideNear of him)
    this.wave = (this.wave + dt / 1.2) % 1;
    const every = c.dotEvery || 48, maxD = Math.min(16, c.maxDots || 16), hide = this.artOn ? Math.max(c.hideNear || 90, ahead + 30) : c.hideNear || 90;
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
          dot.setVisible(true).setFrame(this.artOn ? (lit ? 'nav_dot_1' : 'nav_dot_0') : lit ? 'd1' : 'd0').setPosition(x, y).setAlpha(lit ? 1 : 0.8).setScale(small ? 0.8 : 1);
        }
        s += every;
      }
      along += L; px = q.x; py = q.y;
    }
    for (let i = used; i < this.dots.length; i++) if (this.dots[i].visible) this.dots[i].setVisible(false);
    // the place: a pulsing ring + the badge (not when the tutorial arrow already points at it)
    const show = !samePad;
    const ph = (gs.time.now % 1000) / 1000;
    // (art: the ring plays its own outward pulse at scale 1)
    if (this.artOn) this.ring.setVisible(show).setPosition(d.pad.x, d.pad.y).setScale(small ? 0.8 : 1).setAlpha(1);
    else this.ring.setVisible(show).setPosition(d.pad.x, d.pad.y).setScale((small ? 0.75 : 0.95) + ph * 0.25).setAlpha(1 - ph * 0.6);
    if (show && this.artOn) {
      // nav_badge with the item in its disc; the name on a ui_chip plate above it, the same size on screen at any zoom
      const name = this.placeName(d);
      if (this.badgeText.text !== name) {
        this.badgeText.setText(name);
        this.plateBg.setSize(Math.max(120, this.badgeText.width + 48), 64);
      }
      if (this.badgeType !== d.type) { this.badgeType = d.type; Assets.apply(this.badgeIcon, d.type); this.badgeIcon.setOrigin(0.5).setScale(44 / Math.max(1, this.badgeIcon.frame.realWidth, this.badgeIcon.frame.realHeight)); }
      const z = Math.max(0.3, gs.zoomCur || 1), bs = small ? 0.8 : 1;
      // (26 px type on the plate = about 13 CSS px on a 390 px phone at every zoom: CSS per world px = zoom x 390/720)
      // ((v4.2 fix, visual L4) a little smaller when zoomed out (it covered the 버리기 label at 0.6), and slid back
      //  inside the screen at its edge (at 0.8 the edge cut it: '교역소 판'); the pointer stays on the pad)
      const ps = Math.min(1.6, Math.max(0.5, (z < 0.9 ? 0.8 : 0.92) / z));
      this.plate.setScale(ps / bs);
      this.badge.setVisible(true).setPosition(d.pad.x, d.pad.y - 22 + Math.sin(gs.time.now / 300) * 3).setScale(bs);
      const vw = gs.cameras.main.worldView, hw = (this.plateBg.width * ps) / 2;
      const px = vw.width > hw * 2 + 16 ? Math.max(vw.x + hw + 8, Math.min(vw.right - hw - 8, d.pad.x)) : d.pad.x;
      this.plate.x = (px - d.pad.x) / bs;
    } else if (show) {
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
    if (!d.pad) return { icon: d.type, text: d.label ? t('navFull', { place: t(d.label, d.lp || undefined) }) : t('navNone'), more: 0, none: true };
    const m = Math.max(1, Math.round(this.routeLen / 64));
    if (d.pinned) return { icon: d.type, text: t('navPin', { place: this.placeName(d), m }), more: 0, pinned: true };
    return { icon: d.type, text: t('navChip', { item, n: d.n, place: this.placeName(d), m }), more: d.others || 0 };
  }
  /** a tap on the chip: the next place of a mixed bag */
  next() { if (this.pinned) return; this.cycle++; this.pickT = 0; }
  /** a long press on the chip: hide the guide for this load */
  hideLoad() { if (this.pinned) { this.unpin(); this.hide(); return; } this.hiddenLoad = true; this.hide(); }

  /** nowhere takes the bag: the discard pad pulses softly */
  pulseTrash(dt) {
    const tr = this.gs.trash;
    this.trashT = (this.trashT || 0) - dt;
    if (tr && tr.pad && tr.enabled !== false && this.trashT <= 0) { this.trashT = 1.5; if (tr.pad.pulse) tr.pad.pulse(); }
  }

  hide() {
    if (this.held) this.holdRoom(null);
    if (!this.active && !this.chev.visible) return;
    this.active = false;
    this.hideWorld();
  }
  /** the world pieces (chevron, dots, ring, badge) go; the chip state stays */
  hideWorld() {
    if (this.chev.visible) this.chev.setVisible(false);
    if (this.ring.visible) this.ring.setVisible(false);
    if (this.badge.visible) this.badge.setVisible(false);
    for (const d of this.dots) if (d.visible) d.setVisible(false);
    this.aura(null);
    this.objs = 0;
  }

  /** the previous place still takes items of this bag (its own sink says so): a pseudo list entry, else null */
  stillTakes(prev, counts) {
    const sk = prev && prev.sink;
    if (!sk || sk.enabled === false || !counts) return null;
    let n = 0;
    const types = [];
    try {
      for (const ty in counts) {
        if (!sk.accepts || !sk.accepts(ty)) continue;
        const room = typeof sk.room === 'function' ? sk.room(ty) : 99;
        if (room > 0) { n += Math.min(counts[ty], room); types.push([ty, counts[ty]]); }
      }
    } catch (e) { return null; }
    if (!n) return null;
    return { pad: prev.pad, sink: sk, label: prev.label, lp: prev.lp, n, types, surplus: prev.surplus };
  }

  state() {
    const d = this.dest;
    return { active: this.active, pinned: this.pinned ? { x: Math.round(this.pinned.pad.x), y: Math.round(this.pinned.pad.y), label: this.pinned.label, t: Math.round(this.pinned.t) } : null,
      dest: d ? { type: d.type, n: d.n, x: d.pad ? Math.round(d.pad.x) : null, y: d.pad ? Math.round(d.pad.y) : null, label: d.label, others: d.others || 0, none: !!d.none, pinned: !!d.pinned } : null,
      route: this.route.map((q) => [Math.round(q.x), Math.round(q.y)]), routeLen: Math.round(this.routeLen), objects: this.objs, plans: this.plans || 0, chip: this.chip() };
  }

  destroy() {
    if (this.held && this.gs.logistics && this.gs.logistics.setChief) this.gs.logistics.setChief(null);
    const i = Assets.arrivals.indexOf(this.onArrive);
    if (i >= 0) Assets.arrivals.splice(i, 1);
    for (const o of [this.chev, this.ring, this.badge].concat(this.dots)) if (o && o.scene) o.destroy();
  }
}
