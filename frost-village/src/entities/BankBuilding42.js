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
    if (this.ready || !this.gs.sys || !this.gs.sys.isActive()) return;
    this.ready = true;
    const gs = this.gs, office = this.office;
    this.cw = new Cutaway(gs, 'bank', this.x, this.y, {});
    const def = this.cw.def;
    // walls: circles along the footprint edges, a gap at the door
    const poly = (def.footprintPoly || [[-226, -9], [18, 113], [226, 9], [-18, -113]]).map((p) => ({ x: this.x + p[0], y: this.y + p[1] }));
    const door = this.cw.point('doorPoint') || this.door;
    this.door = door;
    for (let a = 0; a < poly.length; a++) {
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
    const sp = def.staffPoints || [[50, -37], [86, -19]];
    const seeds = office.bankSeeds();
    [['teller0', sp[0]], ['teller1', sp[1]], ['manager', def.deskPoint || [-48, -31]]].forEach(([role, p], i) => {
      const ch = new Staff(gs, office, role, seeds[i], this.x + p[0], this.y + p[1], { x: this.x + p[0], y: this.y + p[1] });
      ch.inside = true;
      ch.faceTo(ch.x - 40, ch.y + 30);
      this.staff.push(ch);
    });
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
      const t0 = this.staff[0];
      if (t0 && t0.play) { t0.play('talk', true); gs.time.delayedCall(1600, () => { if (t0.alive) t0.play('idle', true); }); }
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
    const vis = this.cw.alpha > 0.3;
    for (const ch of this.staff) {
      if (ch.sprite.visible !== vis) { ch.sprite.setVisible(vis); if (ch.shadow) ch.shadow.setVisible(vis); }
      ch.update(dt);
      if (ch.sprite.setDepth) ch.sprite.setDepth(this.cw.slotDepth('@behind', ch.y));
    }
    // the chief on the 창구 pad: the 통장 tab
    if (this.windowPad.contains(p.x, p.y)) {
      this.standT = (this.standT || 0) + dt;
      if (this.standT > 0.4 && !this._opened) { this._opened = true; this.office.openPanel('window', 'bank'); }
    } else { this.standT = 0; this._opened = false; }
  }

  tap(x, y) { if (!this.cw || !this.cw.inPoly(x, y)) return false; this.tapOpen = !this.tapOpen; return true; }

  revealObjects() { return this.cw ? this.cw.objects() : []; }

  destroy() { if (this.cw) this.cw.destroy(); for (const ob of this.obstacles) ob.active = false; for (const s of this.staff) s.destroy(); if (this.windowPad) this.windowPad.img.destroy(); }
}
