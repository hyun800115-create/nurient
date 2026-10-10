// 서리 은행 in the world: the civic `bank` cutaway (layers in drawOrder, people in the @behind / @front slots), the
// shell that fades when the chief walks in or taps the building (revealPoly), tellers at staffPoints, the manager at
// his desk, residents with numbered tickets in the queue / on the red bench / at the windows (Branch model), the
// number display on the back wall, the vault door that turns for a big deposit, the chief's counter pad outside the
// door, and coins flying in and out. People are "figures" from ports.people.figure(…) (a look-alike the bank owns:
// townsfolk dolls in the game, villager sprites in the lab), so no body is taken from TownSim.

import { Assets, icon, TXT, panel, fit } from '../../missions/view/ui.js';
import { Pad } from '../../entities/Pad.js';
import { mt } from '../../missions/strings.js';

const ENTER_MS = 900;

export class BankBuilding {
  /** host = BankHost; (x, y) = the building's anchor in the world */
  constructor(host, x, y) {
    this.host = host;
    const s = this.s = host.ports.world.scene;
    this.x = x; this.y = y;
    const def = this.def = Assets.def('bank');
    const cut = def.cutaway || {};
    this.layers = {};
    this.objs = [];
    const order = cut.drawOrder || ['bank'];
    this.slotDepth = {};
    order.forEach((it, k) => {
      const d = y + k * 0.01;
      if (it.startsWith('@')) { this.slotDepth[it.slice(1)] = d; return; }
      let im;
      if (it === 'bank_vault') { const r = Assets.sprite('bank_vault'); im = s.add.sprite(x, y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(d); }
      else im = Assets.image(s, x, y, it).setDepth(d);
      this.layers[it] = im;
      this.objs.push(im);
    });
    this.shell = this.layers[(cut.fade && cut.fade.layer) || 'bank_shell'];
    this.stub = this.layers[(cut.cut && cut.cut.layer) || 'bank_shell_cut'];
    if (this.stub) this.stub.setAlpha(0);
    this.openA = (cut.fade && cut.fade.openAlpha) || 0.12;
    this.poly = new Phaser.Geom.Polygon((cut.revealPoly || def.revealPoly || []).map((p) => new Phaser.Geom.Point(x + p[0], y + p[1])));
    this.revealed = 0;      // 0..1
    this.want = false;
    this.tapT = 0;
    // the number display on the back wall
    const dp = (def.fxPoints && def.fxPoints.display) || [116, -159];
    this.disp = s.add.text(x + dp[0] + 1, y + dp[1] + 1, '', { fontFamily: 'monospace', fontSize: '13px', fontStyle: 'bold', color: '#7a2a10', resolution: 3 }).setOrigin(0.5).setDepth(y + 0.015).setRotation(0.46).setAlpha(0);
    // tellers and the manager
    this.staff = [];
    const sp = def.staffPoints || [], sd = def.staffDirs || [];
    for (let k = 0; k < sp.length; k++) {
      const f = host.ports.people.figure(k < 3 ? 'job:bank_teller' : 'job:bank_manager', k);
      if (!f) continue;
      f.obj.setPosition(x + sp[k][0], y + sp[k][1]);
      f.setPose('idle', sd[k] || 'SW');
      f.obj.setDepth(this.slotDepth.behind + sp[k][1] * 1e-5 + 0.001);
      this.staff.push(f);
    }
    this.people = new Map();     // pid → { f, st, slot, w, n }
    // the chief's counter pad at the foot of the steps
    const door = def.doorPoint || [-118, 59];
    this.padX = x + door[0] - 26; this.padY = y + door[1] + 46;
    this.pad = new Pad(s, this.padX, this.padY, 'cash', 1.45, { tex: Assets.pick('ui_pad_register', 'ui_pad_cash'), tint: 0xdff4e6, icon: Assets.pick('ui_icon_passbook', 'ui_icon_coin'), iconSize: 48 });
    this.label = this.makeLabel(this.padX, this.padY - 78);
    this.flyPool = [];
    this.t = 0;
    this.vaultBusy = false;
  }

  makeLabel(x, y) {
    const s = this.s;
    const c = s.add.container(x, y).setDepth(y + 3000);
    const bg = panel(s, 0, 0, 'ui_panel', 150, 50).setOrigin(0.5);
    const ic = icon(s, -50, 0, ['ui_icon_piggy', 'ui_icon_coin'], 34);
    const tx = s.add.text(-30, 0, '', TXT(19, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    c.add([bg, ic, tx]);
    return { c, bg, ic, tx, key: '' };
  }

  setLabel(text) {
    const L = this.label;
    if (L.key === text) return;
    L.key = text; L.tx.setText(text);
    const w = Math.max(120, L.tx.width + 80);
    L.bg.setSize(w, 50); L.ic.setX(-w / 2 + 28); L.tx.setX(-w / 2 + 52);
  }

  /** chief on the counter pad? */
  onPad(cx, cy) { return this.pad.contains(cx, cy); }
  contains(px, py) { return Phaser.Geom.Polygon.Contains(this.poly, px, py); }
  tap(px, py) { if (this.contains(px, py)) { this.tapT = 6; return true; } return false; }

  update(dt) {
    this.t += dt;
    const h = this.host, P = h.ports, lang = h.lang();
    const cx = P.chief.x(), cy = P.chief.y();
    // reveal: the chief inside / on the steps / on the pad, or a tap (6 s)
    this.tapT = Math.max(0, this.tapT - dt);
    const near = this.contains(cx, cy - 20) || this.onPad(cx, cy) || Math.hypot(cx - this.padX, cy - this.padY) < 140;
    this.want = near || this.tapT > 0 || h.forceOpen;
    const k = dt * 1000 / 260;
    this.revealed = Math.max(0, Math.min(1, this.revealed + (this.want ? k : -k)));
    if (this.shell) this.shell.setAlpha(1 - (1 - this.openA) * this.revealed);
    if (this.stub) this.stub.setAlpha(this.revealed);
    const inside = this.revealed > 0.02;
    for (const f of this.staff) f.obj.setVisible(inside);
    for (const v of this.people.values()) v.f.obj.setVisible(inside);
    this.disp.setAlpha(this.revealed);
    this.label.c.y = this.padY - 78 + Math.sin(this.t * 2.2) * 4;
    const st = h.account.state();
    this.setLabel(st.open ? mt(lang, 'b_counter') : mt(lang, 'b_name'));
    // the display shows the last number called
    const n = h.branch.shown;
    const ds = n ? String(n).padStart(3, '0') : '';
    if (this.disp.text !== ds) this.disp.setText(ds);
    // tellers serve the customer at their window
    for (let w = 0; w < this.staff.length && w < 3; w++) {
      const busy = Array.from(this.people.values()).some((v) => v.st === 'counter' && v.w === w && !v.walking);
      const f = this.staff[w];
      const want = busy ? 'serve' : 'idle';
      if (f.pose !== want) f.setPose(want, (this.def.staffDirs || [])[w] || 'SW');
    }
  }

  // ------------------------------------------------------------------------------------------------ residents
  /** where a visitor in state st / slot stands: [x, y, dir, slot] */
  spot(st, slot) {
    const d = this.def, x = this.x, y = this.y;
    if (st === 'counter') { const p = (d.counterPoints || [])[slot] || [0, 0]; return [x + p[0], y + p[1], (d.counterDirs || [])[slot] || 'NE', 'front']; }
    if (st === 'seat') { const p = (d.seatPoints || [])[slot] || [0, 0]; return [x + p[0], y + p[1] + 25, (d.seatDirs || [])[slot] || 'SE', 'front']; }
    if (st === 'queue') { const p = (d.customerPoints || [])[slot] || [0, 0]; return [x + p[0], y + p[1], (d.customerDirs || [])[slot] || 'NE', 'front']; }
    const e = d.entryPoint || [-43, 4];
    return [x + e[0], y + e[1], 'SW', 'front'];
  }

  /** sync the drawn residents with the Branch model */
  syncPeople(list) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.pid);
      let v = this.people.get(p.pid);
      if (!v) {
        const f = this.host.ports.people.figure(p.pid, 0);
        if (!f) continue;
        // in through the front door (fading in on the steps), then on to the ticket queue
        const door = this.def.doorPoint || [-118, 59];
        f.obj.setPosition(this.x + door[0], this.y + door[1]).setAlpha(0);
        v = { f, st: 'entry', slot: -1, w: -1, n: p.n, walking: false };
        this.people.set(p.pid, v);
      }
      if (v.st !== p.st || v.slot !== p.slot) {
        v.st = p.st; v.slot = p.slot; v.w = p.w;
        if (p.st === 'leave') this.walkOut(v);
        else this.walkTo(v, ...this.spot(p.st, p.slot));
      }
    }
    for (const [pid, v] of this.people) if (!seen.has(pid) && v.st !== 'gone') { v.st = 'gone'; this.walkOut(v, () => { v.f.destroy(); this.people.delete(pid); }); }
  }

  walkTo(v, x, y, dir, slot) {
    const o = v.f.obj;
    v.walking = true;
    const dx = x - o.x, dy = y - o.y;
    const wdir = Math.abs(dx) > Math.abs(dy) * 2 ? (dx > 0 ? 'E' : 'W') : dy < 0 ? (dx > 0 ? 'NE' : 'NW') : (dx > 0 ? 'SE' : 'SW');
    v.f.setPose('walk', wdir);
    this.s.tweens.killTweensOf(o);
    const dur = Math.max(350, Math.min(ENTER_MS * 1.6, Math.hypot(dx, dy) * 9));
    // (the walk tween also finishes the fade-in: killing the tweens above would otherwise leave a newcomer invisible)
    this.s.tweens.add({ targets: o, alpha: 1, duration: 300 });
    this.s.tweens.add({
      targets: o, x, y, duration: dur, ease: 'Sine.easeInOut',
      onUpdate: () => o.setDepth(this.slotDepth.front + (o.y - this.y) * 1e-5 + 0.002),
      onComplete: () => { v.walking = false; v.f.setPose(v.st === 'seat' ? 'sit' : v.st === 'counter' ? 'talk' : 'idle', dir); o.setDepth(this.slotDepth.front + (o.y - this.y) * 1e-5 + 0.002); },
    });
  }

  walkOut(v, done) {
    const [ex, ey] = this.spot('entry', 0);
    const door = this.def.doorPoint || [-118, 59];
    const o = v.f.obj;
    v.f.setPose('walk', 'SW');
    this.s.tweens.killTweensOf(o);
    this.s.tweens.add({ targets: o, x: ex, y: ey, duration: 700, onComplete: () => this.s.tweens.add({ targets: o, x: this.x + door[0], y: this.y + door[1], alpha: 0, duration: 600, onComplete: () => { if (done) done(); } }) });
  }

  /** a number is called: queued, so the pills come one after another like a real counter display */
  call(n, w) {
    this.callQ = this.callQ || [];
    this.callQ.push([n, w]);
    if (this.callQ.length === 1) this.nextCall();
  }

  nextCall() {
    const q = this.callQ;
    if (!q || !q.length) return;
    const [n, w] = q[0];
    this.showCall(n, w);
    this.s.time.delayedCall(1000, () => { q.shift(); this.nextCall(); });
  }

  showCall(n, w) {
    const s = this.s, d = this.def, P = this.host.ports;
    if (this.revealed < 0.3 && !P.view.onScreen(this.x, this.y - 150, 100)) return;
    P.sound.at('sfx_ticket_chime', this.x, this.y, { volume: 0.5 });
    const cp = (d.counterPoints || [])[w] || [0, 0];
    const c = s.add.container(this.x + cp[0] + 20, this.y + cp[1] - 120).setDepth(40000);
    const bg = panel(s, 0, 0, 'ui_panel', 112, 44).setOrigin(0.5);
    const tx = s.add.text(0, -1, mt(this.host.lang(), 'b_ticket', { n }), TXT(19, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5);
    fit(tx, 104);
    bg.setSize(Math.max(100, tx.displayWidth + 26), 44);
    c.add([bg, tx]);
    c.setScale(0.3);
    s.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    s.tweens.add({ targets: c, y: c.y - 26, alpha: 0, delay: 700, duration: 300, onComplete: () => c.destroy() });
  }

  /** the vault door turns (big deposits) */
  vault() {
    const v = this.layers.bank_vault, P = this.host.ports;
    if (!v || this.vaultBusy) return;
    const a1 = Assets.spriteAnim('bank_vault', 'vault'), a2 = Assets.spriteAnim('bank_vault', 'vault_close');
    if (!a1 || !v.play) return;
    this.vaultBusy = true;
    P.sound.at('sfx_vault_door', this.x, this.y, { volume: 0.7 });
    v.play(a1);
    v.once('animationcomplete', () => this.s.time.delayedCall(1200, () => { if (a2) v.play(a2); v.once('animationcomplete', () => { this.vaultBusy = false; }); }));
  }

  /** coins fly from (fx, fy) to the counter window (in = true) or out to the chief */
  coins(n, fromX, fromY, toX, toY) {
    const s = this.s, k = Math.min(10, Math.max(3, Math.round(n / 500)));
    for (let i = 0; i < k; i++) {
      let c = this.flyPool.pop();
      if (!c) c = Assets.image(s, 0, 0, 'item_coin').setOrigin(0.5);
      c.setVisible(true).setAlpha(1).setScale(0.6).setDepth(31000).setPosition(fromX + (Math.random() - 0.5) * 20, fromY);
      const mx = (fromX + toX) / 2 + (Math.random() - 0.5) * 60, my = Math.min(fromY, toY) - 90 - Math.random() * 40;
      const sx = c.x, sy = c.y;
      s.tweens.addCounter({ from: 0, to: 1, delay: i * 55, duration: 520, ease: 'Sine.easeIn', onUpdate: (tw) => { const p = tw.getValue(), q = 1 - p; c.setPosition(q * q * sx + 2 * q * p * mx + p * p * toX, q * q * sy + 2 * q * p * my + p * p * toY); }, onComplete: () => { c.setVisible(false); this.flyPool.push(c); } });
    }
  }

  /** the chief's window (deposits land here) */
  window() { const p = (this.def.counterPoints || [])[0] || [0, 0]; return { x: this.x + p[0], y: this.y + p[1] - 40 }; }

  objects() { return this.objs.length + this.staff.length + this.people.size + 6; }

  destroy() {
    this.callQ = null;
    for (const o of this.objs) o.destroy();
    for (const f of this.staff) f.destroy();
    for (const v of this.people.values()) v.f.destroy();
    this.disp.destroy(); this.pad.img.destroy(); if (this.pad.icon) this.pad.icon.destroy(); this.label.c.destroy();
    for (const c of this.flyPool) c.destroy();
  }
}
