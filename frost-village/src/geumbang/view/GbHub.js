// GbHub (view, plan §3.2, §5.4): the 금방 dress of the v4.2 depot and the hub loop inside its cutaway.
// Outside (always): gb_nameplate_<lang> instead of the centre's nameplate (same frame size + anchor, fades with the
// shell), the gable / blade emblems and the gold-ribboned roof parcel over the shell (+0.0004), the swaying banner by
// dock 1 (+0.0012), the 금방 flag on the apron, the pole sign (lit at night), the lockers once bought, a soft glow (NORMAL blend)
// at fxPoints.board at night, the outbound pile at dock 1 (≤ 8 parcels) with "출고 대기 n", dock 1 rolling up while a
// van loads, the offered upgrade floating by the door.
// Inside (only while revealed, plan §5.4 table): 방금순 팀장 at the counter (scan, "네~ 금방입니다!"), pickers at the racks
// (sort_parcel; the rack stack drops when a line is picked: the building draws the racks from shownStock()), parcels
// riding the conveyor, the packer at the table (tape_box, the box pops, "찌익"), the dockhand loading the van.
// The building port (ports.depot.building()): { x, y, def, order, alpha, imgs, ready } — the v4.2 DepotBuilding as it
// is (imgs['nameplate_<lang>'], imgs.dock1, imgs.conveyor are re-framed in place) or the lab's stand-in.

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { frameOf, spriteOf, pick, glowTex, textStyle, sprAnim, parcelKey } from './art.js';
import { SpeechBubble } from './Courier.js';
import { gt } from '../strings.js';
import { L } from '../layout.js';
import { catOf } from '../model/orders.js';

const CEREMONY = 6;
const OFFER_ICON = { pack: 'ui_icon_gb_catalog', van2: 'ui_icon_gb_van', van3: 'ui_icon_gb_van', sled2: 'ui_icon_gb_sled', lockA: 'ui_icon_gb_locker', lockP: 'ui_icon_gb_locker', dawn: 'ui_icon_gb_dawn', back: 'ui_icon_gb_van' };
const ROLE = { clerk: 'gb_dispatcher', packer: 'gb_packer', picker: 'gb_picker', dockhand: 'gb_sorter' };
const NAME = { clerk: 'gb_crew_dispatcher', packer: 'gb_crew_packer', picker: 'gb_crew_picker', dockhand: 'gb_crew_sorter' };

export class GbHub {
  constructor(view) {
    this.view = view; this.scene = view.scene; this.P = view.P; this.m = view.m;
    this.lay = view.host.lay;
    this.dressed = false;
    this.cer = -1;                 // ceremony clock (s), −1 when none
    this.crew = [];                // { n (staff index), role, rig, home: {x, y}, dir, lift, box, beam, state }
    this.pile = [];
    this.rides = [];               // parcels on the belt
    this.bubble = null;
    this.clerkT = -99; this.chimeT = -99;
    this.dockF = 0; this.convT = 0;
    this.shownVer = 0;
    this.objs = [];
  }

  bld() { const D = this.P.depot; const b = D && D.building ? D.building() : null; return b && b.ready !== false && b.def ? b : null; }
  /** depth of a layer of the building (v4.2 rule: y + 0.01 × its index in layerOrder) */
  depthOf(b, name) { const i = (b.order || b.def.layerOrder || []).indexOf(name); return b.y + 0.01 * Math.max(0, i); }
  shellAlpha(b) { return 1 - Math.max(0, Math.min(1, b.alpha || 0)); }

  // ------------------------------------------------------------------------------------------ dress
  dress(b) {
    if (this.dressed) return;
    this.dressed = true;
    const sc = this.scene, L2 = this.view.lang();
    const shell = this.depthOf(b, 'shell');
    const patch = (key, off) => { const s = spriteOf(key); if (!s) return null; const im = sc.add.sprite(b.x, b.y, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(shell + off); this.objs.push(im); return im; };
    this.emblems = ['gb_emblem_gable', 'gb_emblem_blade', 'gb_roofparcel'].map((k) => patch(k, 0.0004)).filter(Boolean);
    this.banner = patch('gb_banner_' + (L2 === 'en' ? 'en' : 'ko'), 0.0012);
    const sway = this.banner ? sprAnim(sc, 'gb_banner_' + (L2 === 'en' ? 'en' : 'ko'), 'sway') : null;
    if (sway) this.banner.play(sway);
    this.nameKey = pick('gb_nameplate_' + (L2 === 'en' ? 'en' : 'ko'), 'gb_nameplate_ko');
    this.setNameplate(b, 1);
    // the flag on the apron by bay 1, the pole sign by the 은행길 end of the footpath
    const fp = L(this.lay.flag[0], this.lay.flag[1]);
    const fs = spriteOf('gb_flag');
    if (fs) { this.flag = sc.add.sprite(fp.x, fp.y, fs.tex, fs.frame).setOrigin(fs.anchor[0], fs.anchor[1]).setDepth(fp.y); const w = sprAnim(sc, 'gb_flag', 'wave'); if (w) this.flag.play(w); this.objs.push(this.flag); }
    const sp = L(this.lay.sign[0], this.lay.sign[1]);
    const ss = spriteOf('gb_sign');
    if (ss) {
      this.sign = sc.add.image(sp.x, sp.y, ss.tex, ss.frame).setOrigin(ss.anchor[0], ss.anchor[1]).setDepth(sp.y);
      const lit = frameOf(ss.def.atlas, ss.def.states.lit);
      this.signLit = lit ? sc.add.image(sp.x, sp.y, lit.tex, lit.frame).setOrigin(ss.anchor[0], ss.anchor[1]).setDepth(sp.y + 0.001).setVisible(false) : null;
      this.objs.push(this.sign); if (this.signLit) this.objs.push(this.signLit);
    }
    // night glows: the name board, the sign disc
    const fx = (b.def.fxPoints && b.def.fxPoints.board) || [-254, -115];
    // (glows at their object's depth, under the night tint: whatever stands in front hides them)
    this.boardGlow = sc.add.image(b.x + fx[0], b.y + fx[1], glowTex(sc)).setDepth(shell + 0.0006).setScale(3.4, 1.6).setVisible(false);
    this.signGlow = this.sign ? sc.add.image(sp.x + 6, sp.y - (ss.def.topPx || 184) + 30, glowTex(sc)).setDepth(sp.y + 0.002).setScale(1.8).setVisible(false) : null;
    this.objs.push(this.boardGlow); if (this.signGlow) this.objs.push(this.signGlow);
    // the label over the outbound pile
    this.pileLabel = sc.add.text(0, 0, '', textStyle(40, '#2b4f7e', '#fff7e6', 9, '900')).setOrigin(0.5, 1).setDepth(DEPTH.LABEL - 5).setVisible(false);
    this.objs.push(this.pileLabel);
    this.lockers();
    // the v4.2 depot workers step aside (the 금방 crew takes their places)
    if (this.P.depot && this.P.depot.staff) this.P.depot.staff(false);
  }

  /** gb_nameplate_<lang> in place of the centre's own (alpha a over the shell's) */
  setNameplate(b, a) {
    const im = b.imgs && (b.imgs['nameplate_<lang>'] || b.imgs.nameplate_ko);
    const s = this.nameKey ? spriteOf(this.nameKey) : null;
    if (!s) return;
    if (a >= 1) {
      if (b.setNameplate) b.setNameplate(this.nameKey);
      else if (im && (im.texture.key !== s.tex || im.frame.name !== s.frame)) im.setTexture(s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]);
      if (this.npFade) { this.npFade.destroy(); this.npFade = null; }
      if (im) im.setAlpha(this.shellAlpha(b));
      return;
    }
    // the ceremony cross-fade: ours over the old lettering
    if (!this.npFade) this.npFade = this.scene.add.image(b.x, b.y, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(this.depthOf(b, 'nameplate_<lang>') + 0.0001);
    this.npFade.setAlpha(a * this.shellAlpha(b));
    if (im) im.setAlpha((1 - a) * this.shellAlpha(b));
  }

  lockers() {
    const lv = this.m.up.lv, sc = this.scene;
    for (const [kind, on, key] of [['apt', lv.lockA, 'gb_locker_a'], ['plaza', lv.lockP, 'gb_locker_b']]) {
      if (!on || (this.lockerImgs && this.lockerImgs[kind])) continue;
      const p = this.lay.lockers && this.lay.lockers[kind];
      const s = p ? spriteOf(key) : null;
      if (!s) continue;
      const q = L(p[0], p[1]);
      const im = sc.add.image(q.x, q.y, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(q.y);
      (this.lockerImgs || (this.lockerImgs = {}))[kind] = { im, key, def: s.def };
      this.objs.push(im);
    }
  }

  // ------------------------------------------------------------------------------------------ crew
  crewUp(b) {
    const C = b.def, sp = C.staffPoints || [], roles = C.staffRoles || [], dirs = C.staffDirs || [], bands = C.staffBands || [];
    const places = this.places();
    const H = this.m.hub;
    // who works: the clerk, packers (table first, then the belt), pickers, the dockhand
    const want = [0, 2];
    if (H.packers.length > 1) want.push(1);
    for (let k = 0; k < Math.min(3, H.pickers.length); k++) want.push(3 + k);
    want.push(6);
    for (const n of want) {
      if (this.crew.find((c) => c.n === n) || !sp[n]) continue;
      const role = roles[n] || 'picker', pl = places['staff' + n] || {};
      const off = pl.offsetPx || [0, 0];
      const home = { x: b.x + sp[n][0] + off[0], y: b.y + sp[n][1] + off[1] };
      const rig = this.view.dolls.make({ preset: ROLE[role], seed: 4300 + n * 31, name: NAME[role] });
      rig.visible(false);
      this.crew.push({ n, role, rig, home, dir: pl.dir || dirs[n] || 'SW', lift: pl.liftPx || 0, place: pl.anim || null, outside: bands[n] === 'outside', box: null, beam: null, k: role === 'packer' ? (n === 2 ? 0 : 1) : role === 'picker' ? n - 3 : 0, sparkle: 0 });
    }
    this.crewN = want.length;
  }

  /** geumbangfolk hub.places (where the clerk / packers stand, what they play, their hidden step) */
  places() { const D = this.P.dolls, h = D && D.hub ? D.hub() : null; return (h && h.places) || {}; }

  /** inside actors: the v4.2 band rule (between interior_racks and interior_front) */
  midDepth(b, y) { return this.depthOf(b, '<actors mid>') + Math.max(-0.004, Math.min(0.004, (y - b.y) * 1e-5)); }
  frontDepth(b, y) { return this.depthOf(b, '<actors front + floor stock>') + Math.max(-0.004, Math.min(0.004, (y - b.y) * 1e-5)); }

  drawCrew(b, dt, inside) {
    const st = this.m.hub.state(), working = this.m.working();
    const sc = this.scene;
    for (const c of this.crew) {
      const R = c.rig;
      const show = c.outside ? this.m.st >= 1 && this.cer < 0 || (this.cer >= CEREMONY - 1.2) : inside && (this.cer < 0 || this.cer >= CEREMONY - 1.2);
      if (!show || !this.view.near(c.home.x, c.home.y, 200)) { R.visible(false); if (c.box) c.box.setVisible(false); continue; }
      let anim = 'idle', dir = c.dir, x = c.home.x, y = c.home.y, box = null, boxKey = null;
      if (c.role === 'clerk') {
        const busy = this.view.t - this.clerkT < 2.2;
        anim = busy ? 'scan' : (this.m.orders.list.some((o) => o.st === 'pick') ? 'scan' : 'idle');
        if (anim === 'scan') { box = 'scan'; boxKey = parcelKey('m'); }
      } else if (c.role === 'packer') {
        const p = st.packers[c.k];
        if (p) { anim = c.place === 'sort_parcel' ? 'sort_parcel' : 'tape_box'; if (anim === 'tape_box') { box = 'tape_box'; boxKey = parcelKey(p.size); } }
        if (p && anim === 'tape_box' && p.t > 0.8 && c.tapedId !== p.id) { c.tapedId = p.id; this.view.sound('sfx_gb_tape', x, y); }
        c.packT = p ? p.t : 0;
      } else if (c.role === 'picker') {
        const p = st.pickers[c.k];
        if (p) { anim = 'sort_parcel'; dir = this.slotDir(b, c, p.item) || c.dir; }
      } else if (c.role === 'dockhand') {
        // loading: to the van's rear doors and back with each parcel (hub.loadEachS)
        const van = this.m.disp && this.m.disp.vans.find((v) => v.st === 'load');
        const pile = { x: b.x + this.lay.pile[0], y: b.y + this.lay.pile[1] };
        if (van) {
          const each = this.m.tune.hub.loadEachS, ph = (van.stT % (each * 2)) / (each * 2);
          const rear = { x: van.x - 124 + 18, y: van.y - 62 + 26 };
          const f = ph < 0.5 ? ph * 2 : 2 - ph * 2;
          x = pile.x + 34 + (rear.x - pile.x - 34) * f; y = pile.y + 22 + (rear.y - pile.y - 22) * f;
          anim = ph < 0.5 ? 'carry_parcel' : 'walk'; dir = ph < 0.5 ? (rear.x >= x ? 'SE' : 'NW') : (rear.x >= x ? 'NW' : 'SE');
          if (ph < 0.5 && c.scanN !== Math.floor(van.stT / (each * 2))) { c.scanN = Math.floor(van.stT / (each * 2)); this.view.sound('sfx_gb_scan', x, y); }
        } else if (!working) { anim = 'idle'; }
      }
      const lift = c.outside ? 0 : c.lift;
      R.visible(true);
      R.play(anim, dir, { noItems: c.role === 'dockhand' ? false : (anim === 'scan' || anim === 'tape_box') });
      const depth = c.outside ? y : this.midDepth(b, y);
      R.place(x, y - lift, depth, c.outside ? 1 : Math.min(1, (b.alpha - 0.3) / 0.4 + 0.001));
      // the parcel the game draws for scan / tape_box (gb_parcel_* at 0.20 m: topPx = 0.20 × 55.4)
      if (box && boxKey) {
        const q = R.boxPoint ? R.boxPoint(box) : null;
        const s = spriteOf(boxKey);
        if (q && s) {
          if (!c.box) { c.box = sc.add.image(0, 0, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]); this.objs.push(c.box); }
          const sz = 0.2 * 55.4 / Math.max(1, s.def.topPx || 26);
          const pop = box === 'tape_box' ? Math.min(1, (c.packT || 0) / 0.15) : 1;
          c.box.setTexture(s.tex, s.frame).setVisible(true).setScale(sz * (0.6 + 0.4 * pop)).setPosition(x + q[2], y - lift + q[3]).setDepth(depth + 0.005);
        } else if (c.box) c.box.setVisible(false);
      } else if (c.box) c.box.setVisible(false);
      if (c.sparkle > 0) { c.sparkle -= dt; }
    }
  }

  /** the heading from a picker to the rack slot of the item's category (nearest), as a doll dir */
  slotDir(b, c, item) {
    const slots = b.def.rackSlots || [], cat = catOf(item);
    let best = null, bd = Infinity;
    for (const s of slots) { if (s.category !== cat) continue; const x = b.x + s.point[0], y = b.y + s.point[1], d = Math.hypot(x - c.home.x, (y - c.home.y) * 2); if (d < bd) { bd = d; best = { x, y }; } }
    if (!best || bd > 260) return null;
    const dx = best.x - c.home.x, dy = best.y - c.home.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null;
    return dy < 0 ? (dx >= 0 ? 'NE' : 'NW') : (dx >= 0 ? 'SE' : 'SW');
  }

  // ------------------------------------------------------------------------------------------ the pile + the belt
  pileCount() {
    let n = 0;
    for (const o of this.m.orders.list) if (o.st === 'ready' && !o.van) n++;
    if (this.m.disp) for (const v of this.m.disp.vans) if (v.st === 'load') n += Math.max(0, v.load.length - Math.floor(v.stT / Math.max(0.1, this.m.tune.hub.loadEachS * 2)));
    return n;
  }

  drawPile(b) {
    const n = this.pileCount(), sc = this.scene;
    const px = b.x + this.lay.pile[0], py = b.y + this.lay.pile[1];
    const near = this.view.near(px, py, 160);
    const show = Math.min(8, near ? n : 0);
    while (this.pile.length < show) { const s = spriteOf(parcelKey(['m', 's', 'l'][this.pile.length % 3])); if (!s) break; const im = sc.add.image(0, 0, s.tex, s.frame).setOrigin(0.5, 0.75); this.pile.push(im); this.objs.push(im); }
    // two rows of two, then a second layer (depth: the floor stock band, under the shell)
    const cell = [[-14, 4], [12, 10], [-2, -6], [24, 0]];
    for (let k = 0; k < this.pile.length; k++) {
      const im = this.pile[k];
      if (k >= show) { im.setVisible(false); continue; }
      const c = cell[k % 4], lvl = Math.floor(k / 4);
      const x = px + c[0], y = py + c[1] - lvl * 15;
      im.setVisible(true).setScale(0.5).setPosition(x, y).setDepth(this.frontDepth(b, py + c[1]) + lvl * 1e-4 + k * 1e-6);
    }
    const lbl = this.pileLabel;
    if (lbl) {
      // (over the pile inside dock 1: only while the cutaway shows it)
      if (n > 0 && near && this.m.st === 2 && (b.alpha || 0) > 0.5) {
        const s = 1 / Math.max(0.35, this.view.zoomWorld());
        lbl.setText(gt('gb_waiting', { n }, this.view.lang())).setVisible(true).setScale(0.5 * s * 0.9).setPosition(px + 6, py - 52 - Math.min(2, Math.floor((show - 1) / 4)) * 15);
      } else lbl.setVisible(false);
    }
  }

  drawBelt(b, dt, inside) {
    const cv = b.def.conveyor;
    for (let i = this.rides.length - 1; i >= 0; i--) {
      const r = this.rides[i];
      r.t += dt;
      const u = r.t / 1.3;
      if (u >= 1 || !cv || !inside) { r.im.destroy(); this.rides.splice(i, 1); continue; }
      const x = b.x + cv.start[0] + (cv.end[0] - cv.start[0]) * u, y = b.y + cv.start[1] + (cv.end[1] - cv.start[1]) * u;
      r.im.setPosition(x, y).setDepth(this.depthOf(b, 'conveyor') + 0.002).setAlpha(Math.min(1, (b.alpha - 0.3) / 0.4));
    }
    // the belt runs while a packer works (the building's conveyor patch, frame by frame)
    const busy = this.m.hub.packers.some((p) => p.o);
    const im = b.imgs && b.imgs.conveyor;
    const A = Assets.def('logistics_center_conveyor').anims;
    if (im && A && A.conveyor && inside && busy) {
      this.convT += dt;
      const fr = A.conveyor.frames[Math.floor(this.convT * (A.conveyor.fps || 10)) % A.conveyor.frames.length];
      const f = frameOf(Assets.def('logistics_center_conveyor').atlas, fr);
      if (f && im.frame.name !== f.frame) im.setTexture(f.tex, f.frame);
    }
  }

  /** dock 1 rolls up while a van loads at bay 1 (and down when it leaves) */
  drawDock(b, dt) {
    const im = b.imgs && b.imgs.dock1;
    const D = Assets.def('logistics_center_dock1');
    if (!im || !D.anims || !D.anims.dock_door) return;
    const open = !!(this.m.disp && this.m.disp.vans.some((v) => v.st === 'load' || (v.st === 'bay' && this.m.st === 2 && this.pileCount() > 0)));
    const fr = D.anims.dock_door.frames;
    this.dockF = Math.max(0, Math.min(fr.length - 1, this.dockF + (open ? 1 : -1) * dt * 8));
    const f = frameOf(D.atlas, fr[Math.round(this.dockF)]);
    if (f && im.frame.name !== f.frame) im.setTexture(f.tex, f.frame);
  }

  // ------------------------------------------------------------------------------------------ events
  onOrder(e) {
    this.shownVer++;
    const b = this.bld();
    if (!b) return;
    this.clerkT = this.view.t;
    if ((b.alpha || 0) > 0.5 && this.view.near(b.x, b.y, 0)) {
      if (this.view.t - this.chimeT > 4) { this.chimeT = this.view.t; this.view.sound('sfx_gb_chime', b.x, b.y); }
      const c = this.crew.find((q) => q.role === 'clerk');
      if (c && this.view.t - (this.saidT || -99) > 8) { this.saidT = this.view.t; this.say(gt('gb_clerk', null, this.view.lang()), c.home.x, c.home.y - c.lift - 70); }
    }
  }

  onEvent(e) {
    const b = this.bld();
    if (e.t === 'gb:pick') this.shownVer++;
    if (!b) return;
    if (e.t === 'gb:pack' && (b.alpha || 0) > 0.5 && b.def.conveyor && this.rides.length < 4) {
      const s = spriteOf(parcelKey('s'));
      if (s) this.rides.push({ t: 0, im: this.scene.add.image(0, 0, s.tex, s.frame).setOrigin(0.5, 0.75).setScale(0.38) });
    }
    if (e.t === 'gb:ready' && this.view.near(b.x + this.lay.pile[0], b.y + this.lay.pile[1], 0)) this.view.sound('sfx_gb_thump', b.x + this.lay.pile[0], b.y + this.lay.pile[1]);
    if (e.t === 'gb:shift') { const c = this.crew.find((q) => q.role === 'dockhand') || this.crew[0]; if (c) this.say(gt(e.night ? 'gb_shift_go' : 'gb_shift_end', null, this.view.lang()), c.home.x, c.home.y - 80); }
    if (e.t === 'gb:upgrade') { this.lockers(); if (b) this.crewUp(b); if (this.P.fx && this.P.fx.burst) this.P.fx.burst('star', b.x + (b.def.doorPoint || [-278, 67])[0], b.y - 40); }
  }

  /** gb:opening — the ≈ 6 s ribbon flow (jingle, confetti, new lettering, banner, the crew in their jackets) */
  ceremony() {
    const b = this.bld();
    this.cer = 0;
    if (!b) return;
    this.view.sound('sfx_gb_jingle', b.x, b.y);
    const door = b.def.doorPoint || [-278, 67];
    if (this.P.fx && this.P.fx.burst) this.P.fx.burst('confetti', b.x + door[0], b.y + door[1] - 60);
  }
  opened() { this.cer = -1; const b = this.bld(); if (b) { this.setNameplate(b, 1); for (const c of this.crew) c.sparkle = 0.6; } }

  say(text, x, y) {
    if (!this.bubble) this.bubble = new SpeechBubble(this.view);
    this.bubble.show(text, x, y, 2.2);
  }

  /** the camera / a scenario opens the cutaway (관망, 따라가기) */
  reveal(on) { const D = this.P.depot; if (D && D.reveal) { D.reveal(!!on); return true; } return false; }

  /** the racks as the building should draw them: the stock + the lines no picker has taken yet */
  shownStock() {
    const D = this.P.depot, base = D && D.stock ? D.stock() : null;
    if (!base) return null;
    const un = this.m.shown();
    const ver = (base.ver || 0) + this.shownVer * 1000003;
    if (this._shown && this._shown.ver === ver) return this._shown;
    const cnt = (k) => (base.count ? base.count(k) : 0) + (un[k] || 0);
    this._shown = {
      ver,
      count: cnt,
      of: (cat) => { const s = new Set(base.of ? base.of(cat) : []); for (const k in un) if (catOf(k) === cat && un[k] > 0) s.add(k); return Array.from(s).sort((a, c) => cnt(c) - cnt(a) || (a < c ? -1 : 1)); },
      total: (cat) => (base.total ? base.total(cat) : 0),
      level: (cat) => (base.level ? base.level(cat) : 0),
    };
    return this._shown;
  }

  // ------------------------------------------------------------------------------------------ the frame
  update(dt) {
    const b = this.bld(), m = this.m;
    if (!b) return;
    if (m.st === 0 && this.cer < 0) return;            // nothing of 금방 before the pad is paid
    // (the 금방 dress waits up to 20 s for its late page — gb_bld_0 — then goes ahead with what is there)
    if (!this.dressed) { this.dressWait = (this.dressWait || 0) + dt; if (spriteOf('gb_sign') || this.dressWait > 20) this.dress(b); else return; }
    if (!this.crewN || this.crewN !== this.wantCrew()) this.crewUp(b);
    if (b.setShown && !this.shownSet) { this.shownSet = true; b.setShown(() => this.shownStock()); }
    // (critique M9) the depot off screen: the crew, belt and dock are redrawn 4 times a second (with the time that
    // passed), not every frame — nothing of it can be seen meanwhile
    if (this.cer < 0 && !this.view.near(b.x, b.y, 600)) { this.farT = (this.farT || 0) + dt; if (this.farT < 0.25) return; dt = this.farT; }
    this.farT = 0;
    const sa = this.shellAlpha(b), night = this.view.night();
    // the ceremony: the lettering cross-fades, the banner appears, the crew sparkles in
    if (this.cer >= 0) {
      this.cer += dt;
      const a = Math.max(0, Math.min(1, (this.cer - 0.6) / 1.4));
      this.setNameplate(b, a);
      if (this.banner) this.banner.setAlpha(sa * Math.max(0, Math.min(1, (this.cer - 2) / 1.2)));
      for (const e of this.emblems) e.setAlpha(sa * a);
      if (this.cer > 1.4 && !this.sparkled) { this.sparkled = true; const fx = b.def.fxPoints || {}; const q = fx.board || [-254, -115]; if (this.P.fx && this.P.fx.burst) this.P.fx.burst('star', b.x + q[0], b.y + q[1]); }
    } else {
      this.setNameplate(b, 1);
      if (this.banner) this.banner.setAlpha(sa);
      for (const e of this.emblems) e.setAlpha(sa);
    }
    // night
    const lit = night > 0.35;
    if (this.signLit) this.signLit.setVisible(lit);
    if (this.boardGlow) this.boardGlow.setVisible(night > 0.2 && sa > 0.2).setAlpha(Math.min(0.8, night * 1.0) * sa);
    if (this.signGlow) this.signGlow.setVisible(lit).setAlpha(Math.min(0.85, night * 1.1));
    if (this.lockerImgs) for (const k in this.lockerImgs) { const L2 = this.lockerImgs[k], f = frameOf(L2.def.atlas, lit ? L2.def.states.lit : L2.def.states.day); if (f && L2.im.frame.name !== f.frame) L2.im.setTexture(f.tex, f.frame); }
    const inside = (b.alpha || 0) > 0.3;
    this.drawCrew(b, dt, inside);
    this.drawPile(b);
    this.drawBelt(b, dt, inside);
    this.drawDock(b, dt);
    this.drawOffer(b, dt);
    if (this.bubble) this.bubble.tick(dt);
  }

  wantCrew() { const H = this.m.hub; return 3 + (H.packers.length > 1 ? 1 : 0) + Math.min(3, H.pickers.length); }

  /** the upgrade on offer floats by the depot door (the app's 기사님 tab has the card) */
  drawOffer(b, dt) {
    const off = this.m.up.offer;
    if (!off) { if (this.offerImg) { this.offerImg.setVisible(false); this.offerTxt.setVisible(false); } return; }
    const door = b.def.doorPoint || [-278, 67];
    const x = b.x + door[0] + 70, y = b.y + door[1] + 40;
    if (!this.offerImg) {
      this.offerImg = this.scene.add.image(0, 0, '__WHITE').setDepth(DEPTH.LABEL - 6);
      this.offerTxt = this.scene.add.text(0, 0, '', textStyle(36, '#ffffff', '#2b4f7e', 8, '900')).setOrigin(0.5, 0).setDepth(DEPTH.LABEL - 6);
      this.objs.push(this.offerImg, this.offerTxt);
    }
    const s = spriteOf(OFFER_ICON[off] || 'ui_icon_gb');
    if (!s || !this.view.near(x, y, 60)) { this.offerImg.setVisible(false); this.offerTxt.setVisible(false); return; }
    const k = 1 / Math.max(0.35, this.view.zoomWorld()), bob = Math.sin(this.view.t * 3) * 4;
    this.offerImg.setTexture(s.tex, s.frame).setVisible(true).setScale(0.62 * k).setPosition(x, y - 70 + bob);
    this.offerTxt.setText(Number(this.m.up.cost(off).coins || 0).toLocaleString()).setVisible(true).setScale(0.5 * k).setPosition(x, y - 70 + bob + 30 * k);
  }

  objects() { return this.objs.length + this.rides.length + (this.bubble ? 2 : 0) + (this.npFade ? 1 : 0); }
  destroy() { for (const o of this.objs) o.destroy(); for (const r of this.rides) r.im.destroy(); if (this.bubble) this.bubble.destroy(); if (this.npFade) this.npFade.destroy(); for (const c of this.crew) c.rig.destroy(); }
}
