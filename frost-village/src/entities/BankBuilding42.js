// (v4.2, docs/v42_plan.md §6.6) 서리 은행 — the finished civic `bank` cutaway (assets/civic) at WORLD.v42.bank:
// layers in the manifest's drawOrder (Cutaway), wall collision with a gap at the door so the chief and the courier
// walk in, two tellers + the manager behind the counter (inside: shown while revealed), the vault overlay spins on a
// big deposit, the 창구 pad (counterPoints[1]) opens the 통장 tab. Reveal: the chief within office.revealPx of the
// door (hysteresis revealHyst), a tap inside revealPoly, an office panel on the 통장 tab, the 관망 camera.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Pad } from './Pad.js';
import { Cutaway } from './Cutaway.js';
import { Staff } from './staff/Staff.js';
import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
import { gdist } from '../core/Iso.js';
import { TF } from '../core/Townfolk.js';

export class BankBuilding42 {
  constructor(gs, site, office, instant) {
    this.gs = gs; this.site = site; this.office = office;
    const B = WORLD.v42.bank;
    this.x = B.x; this.y = B.y;
    this.door = { x: B.door[0], y: B.door[1] };
    this.counter = { x: this.x + 7, y: this.y - 16 };
    this.staff = [];
    this.obstacles = [];
    this.revealHold = 0;
    this.vaultT = 0;
    this.ready = false;
    // the civic manifest + the bank atlas arrive late: the building is made when the manifest is merged
    Assets.loadFragment(gs, 'civic', { only: ['civ_bank'] }, () => this.build());
    void instant;
  }

  build() {
    if (this.ready || this.dead || !this.gs.sys) return;
    // ((v4.2 fix, robust L1) the fragment may already be merged while the scene is still being created (an in-session
    //  restart with the building saved): build on the first update instead of never)
    if (!this.gs.sys.isActive()) { if (!this.deferred) { this.deferred = true; this.gs.time.delayedCall(0, () => { this.deferred = false; this.build(); }); } return; }
    this.ready = true;
    const gs = this.gs, office = this.office;
    this.cw = new Cutaway(gs, 'bank', this.x, this.y, {});
    const def = this.cw.def;
    // walls: circles along the footprint edges, a gap at the door
    const poly = (def.footprintPoly || [[-226, -9], [18, 113], [226, 9], [-18, -113]]).map((p) => ({ x: this.x + p[0], y: this.y + p[1] }));
    const door = this.cw.point('doorPoint') || this.door;
    this.door = door;
    // ((v4.2 fix, gameplay M2) one thin wall per footprint edge, the door's opening cut out: the row of r16 circles
    //  (35 px apart) let the chief walk through the front wall onto the 창구 pad)
    if (gs.collision.addWalls) for (const o of gs.collision.addWalls(poly, 10, 'bank', [{ x: door.x, y: door.y, w: 112 }], true)) this.obstacles.push(o);
    else for (let a = 0; a < poly.length; a++) {
      const p = poly[a], q = poly[(a + 1) % poly.length];
      const L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(2, Math.round(L / 36));
      for (let k = 0; k <= n; k++) {
        const x = p.x + ((q.x - p.x) * k) / n, y = p.y + ((q.y - p.y) * k) / n;
        if (gdist(x, y, door.x, door.y) < 58) continue;
        this.obstacles.push(gs.collision.add(x, y, 16, 'bank'));
      }
    }
    // the counter (staff behind it), the 창구 pad in front
    const cp = this.cw.point('counterPoints', 1) || { x: this.x + 43, y: this.y + 2 };
    this.counter = this.cw.point('counterPoints', 0) || { x: this.x + 7, y: this.y - 16 };
    this.windowPad = new Pad(gs, cp.x, cp.y + 10, 'cash', 0.9, { icon: Assets.pick('ui_icon_passbook', 'ui_icon_coin'), iconSize: 30 });
    this.windowPad.img.setDepth(this.cw.slotDepth('@front', cp.y) - 0.001);
    // tellers + the manager (behind the counter: drawn in the @behind slot, only while revealed)
    // ((CODE-2, officefolk counter / seat places) the tellers stand at staffPoints[0..1] facing SW, drawn
    //  counter.places.bank.liftPx higher so their stamp and hands land over the counter top; the 은행장 sits at his
    //  desk behind staffPoints[3] facing SE, his seat deskSeat.groundOffsetPx above that floor point)
    const sp = def.staffPoints || [[50, -37], [86, -19], [122, -1], [-96, -54]];
    const seeds = office.bankSeeds();
    [['teller0', sp[0]], ['teller1', sp[1]], ['manager', sp[3] || def.deskPoint || [-48, -31]]].forEach(([role, p], i) => {
      const ch = new Staff(gs, office, role, seeds[i], this.x + p[0], this.y + p[1], { x: this.x + p[0], y: this.y + p[1] });
      this.place(ch, role, p);
      this.staff.push(ch);
    });
  }

  /** (CODE-2) a teller at the counter (lifted) or the manager in his seat */
  place(ch, role, p) {
    ch.inside = true;
    ch.slot = '@behind';
    if (role === 'manager') {
      const base = ch.sprite.person && ch.sprite.person.base;
      const B = base && TF.T && TF.T.bases && TF.T.bases[base];
      const g = B && B.deskSeat ? Number(B.deskSeat.groundOffsetPx) || 25 : 25;
      ch.sitDown({ x: this.x + p[0], y: this.y + p[1] - g, dir: 'SE', band: 'behind', shadowDy: g });
    } else {
      const C = TF.T && TF.T.counter && TF.T.counter.places && TF.T.counter.places.bank;
      const base = ch.sprite.person && ch.sprite.person.base;
      ch.liftPx = C && base && C.liftPx && C.liftPx[base] ? Number(C.liftPx[base].SE) || 0 : 0;
      ch.atPost = true;
      ch.faceTo(ch.x - 40, ch.y + 30);
    }
  }

  /** ((robust review M3) tellers + manager made before the townsfolk manifest arrived: dressed in place */
  redress() {
    const gs = this.gs, office = this.office;
    for (let i = 0; i < this.staff.length; i++) {
      const ch = this.staff[i];
      if (!ch.alive || !ch.wantsDress()) continue;
      const n = new Staff(gs, office, ch.role, ch.seed, ch.home.x, ch.home.y, ch.home);
      n.dir = ch.dir;
      this.place(n, ch.role, [ch.home.x - this.x, ch.home.y - this.y]);
      if (ch.sprite.visible === false) { n.sprite.setVisible(false); if (n.shadow) n.shadow.setVisible(false); }
      ch.destroy();
      this.staff[i] = n;
    }
  }

  /** where the courier stands to hand the sack over (in front of the counter) */
  depositPoint() { const c = this.counter; return { x: c.x - 6, y: c.y + 26, fx: c.x + 20, fy: c.y - 10 }; }

  /** a deposit: the teller counts, stamps; a big one spins the vault */
  deposit(n) {
    const gs = this.gs, C = (BALANCE.v42 && BALANCE.v42.courier) || {};
    const near = gs.isOnScreen(this.x, this.y, 200);
    if (near) {
      if (Audio.exists('sfx_coin_count')) Audio.play('sfx_coin_count', { volume: 0.6 }); else Audio.play('sfx_coins_many', { volume: 0.6 });
      gs.time.delayedCall(1200, () => { if (Audio.exists('sfx_stamp')) Audio.play('sfx_stamp', { volume: 0.7 }); });
      // (CODE-2) the teller counts and stamps the passbook (stamp_stand, lifted at the counter), then hands it back
      const t0 = this.staff[0];
      if (t0 && t0.act) { t0.act('stamp_stand', true); t0.deskT = 2.2; gs.time.delayedCall(2200, () => { if (t0.alive) { t0.act('hand_over', true); t0.deskT = 1.5; } }); }
    }
    if (n >= (Number(C.vaultAt) || 5000) && this.cw) {
      this.cw.overlay('bank_vault', 8, 10, false);
      this.vaultT = 2.4;
      this.revealHold = 3.5;
      if (near && Audio.exists('sfx_vault')) Audio.play('sfx_vault', { volume: 0.7 });
    }
  }

  /** the chief near the door, a tap inside, the 통장 tab, a held reveal (a big deposit) */
  update(dt) {
    if (!this.ready) return;
    const gs = this.gs, p = gs.player, V = (BALANCE.v42 && BALANCE.v42.office) || {};
    const r = Number(V.revealPx) || 260, h = Number(V.revealHyst) || 60;
    const d = gdist(p.x, p.y, this.door.x, this.door.y);
    this.revealHold = Math.max(0, this.revealHold - dt);
    let want = this.cw.revealed ? d < r + h : d < r;
    if (this.cw.inPoly(p.x, p.y)) want = true;
    if (this.tapOpen) want = true;
    if (this.revealHold > 0 || (this.office.panelTab && this.office.panelTab() === 'bank') || this.office.camReveal === 'bank') want = true;
    if (want !== this.cw.revealed) this.cw.reveal(want);
    this.cw.update(dt);
    if (this.vaultT > 0) { this.vaultT -= dt; if (this.vaultT <= 0) this.cw.overlay('bank_vault', 8, 10, true); }
    const vis = this.cw.revealed || this.cw.alpha > 0.3;
    // (CODE-2) the officefolk pages the tellers / manager act on, while the bank is open or the chief near it
    if ((this.pageT = (this.pageT || 0) - dt) <= 0) { this.pageT = 0.5; if (this.cw.alpha > 0 || d < r + 420) this.office.wantStaffPages(); }
    for (const ch of this.staff) {
      if (ch.sprite.visible !== vis) { ch.sprite.setVisible(vis); if (ch.shadow) ch.shadow.setVisible(vis); }
      ch.update(dt);          // (its depth: the Cutaway's slot, Character.sync -> cw.occupy)
      // ((v4.2 fix, visual M3) a teller's head over the counter glass (bank_front): at the officefolk counter lift
      //  their faces sat behind it and read as faceless domes; the body stays behind the counter)
      if (ch.atPost && ch.sprite.isDoll) ch.sprite.headDepth = this.cw.slotDepth('@front', ch.y) - 0.0009;
    }
    // the chief on the 창구 pad: the 통장 tab
    if (this.windowPad.contains(p.x, p.y)) {
      this.standT = (this.standT || 0) + dt;
      if (this.standT > 0.4 && !this._opened) { this._opened = true; this.office.openPanel('window', 'bank'); }
    } else { this.standT = 0; this._opened = false; }
  }

  tap(x, y) { if (!this.cw || !this.cw.inPoly(x, y)) return false; this.tapOpen = !this.tapOpen; return true; }

  revealObjects() { return this.cw ? this.cw.objects() : []; }

  destroy() { this.dead = true; if (this.cw) this.cw.destroy(); for (const ob of this.obstacles) ob.active = false; for (const s of this.staff) s.destroy(); if (this.windowPad) this.windowPad.img.destroy(); }
}
